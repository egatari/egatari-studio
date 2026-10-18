// 段階の音声の後処理と記録の試験（kit/core/audio-core.mjs・kit/core/mp3.mjs・kit/core/yomi.mjs）。ブラウザは使わない
//   node tools/test-audio-core.mjs [作業フォルダ]
// 1. 後処理：作った信号（無音＋音＋無音、雑音の床とフェード、2 チャンネル・48 kHz、大きな音）を JS と tts/core.py（ffmpeg の silenceremove と
//    loudnorm。uv と ffmpeg があれば）に通し、長さ（±15 ms）と仕上がりの音量（±0.5 LU）が合うこと。ラウドネスの測り方も ffmpeg と比べる
// 2. MP3：LAME（lame-wasm）で作り、フレームの頭（MPEG-1 Layer III・64 kbps・44.1 kHz・モノラル）と、ffmpeg で戻した長さ（エンコーダの遅れの分だけ長い）
// 3. 読み辞書：kit/core/yomi.mjs と tts/yomi.py が同じ文を返す（uv があれば）
// 4. 記録：takeEntry（録音・TTS・取り込み）・setManifestEntry（ほかの段階はそのまま、口述原稿の順）・audioState（最新・古い・分からない）
// 5. 段 A：持ち運べる 1 ファイルの 1 つの段階の音声を録音の MP3 に替えて保存し、決まった場所のほかが同じバイト（regionDiff）・読み戻し・古さの印
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as A from '../kit/core/audio-core.mjs';
import { encodeMp3 } from '../kit/core/mp3.mjs';
import { parseYomiTerms, applyYomi } from '../kit/core/yomi.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA, scanLayout } from '../kit/core/tier-a.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { buildPortable } from '../kit/build.mjs';
import { segDigest } from '../kit/narration.mjs';
import { regionDiff } from './tier-a-diff.mjs';
import { silentWav } from './portable-fixtures.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-audio-core-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const enc = new TextEncoder(), dec = new TextDecoder();
const has = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.status === 0; };
const FFMPEG = has('ffmpeg', ['-version']);
const UV = has('uv', ['--version']);
const PY = (code, ...args) => spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', '-c', code, ...args], { encoding: 'utf8', cwd: path.join(ROOT, 'tts') });

// ---------------------------------------------------------------- 作る信号（決まった乱数）
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
// 話し声らしい音（基本周波数が揺れる倍音と、音節ごとの包絡）
function speechy(sec, sr, amp, seed) {
  const r = rng(seed), n = Math.round(sec * sr), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f0 = 140 + 30 * Math.sin(2 * Math.PI * 0.7 * t);
    ph += (2 * Math.PI * f0) / sr;
    const env = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3.1 * t) ** 2;
    let v = 0; for (let k = 1; k <= 8; k++) v += Math.sin(k * ph) / k;
    out[i] = amp * env * (0.6 * v + 0.05 * gauss(r));
  }
  return out;
}
const cat = (...xs) => { const n = xs.reduce((a, x) => a + x.length, 0), o = new Float32Array(n); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };
const noise = (sec, sr, amp, seed) => { const r = rng(seed), o = new Float32Array(Math.round(sec * sr)); for (let i = 0; i < o.length; i++) o[i] = amp * gauss(r); return o; };
const fade = (x, sr, sec) => { const n = Math.round(sec * sr); for (let i = 0; i < Math.min(n, x.length); i++) x[i] *= i / n; return x; };
// 入力の組：[名前, チャンネル, 標本化周波数]
const INPUTS = [
  ['silence-speech-silence', [cat(new Float32Array(0.5 * 44100), speechy(1.6, 44100, 0.25, 1), new Float32Array(0.7 * 44100))], 44100],
  ['noise-floor-fade', [cat(noise(0.4, 44100, 0.001, 2), fade(speechy(1.4, 44100, 0.12, 3), 44100, 0.12), noise(0.3, 44100, 0.001, 4))], 44100],
  ['stereo-48k', [cat(new Float32Array(0.3 * 48000), speechy(2.0, 48000, 0.3, 5), new Float32Array(0.4 * 48000)), cat(new Float32Array(0.3 * 48000), speechy(2.0, 48000, 0.2, 6), new Float32Array(0.4 * 48000))], 48000],
  ['quiet', [cat(new Float32Array(0.2 * 44100), speechy(2.2, 44100, 0.03, 7), new Float32Array(0.2 * 44100))], 44100],
];
// 2 チャンネルの WAV（16 bit）
function wav16(chans, sr) {
  const n = chans[0].length, c = chans.length, buf = Buffer.alloc(44 + n * c * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * c * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(c, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * c * 2, 28); buf.writeUInt16LE(c * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[k][i])) * 32767), 44 + (i * c + k) * 2);
  return buf;
}
const ffLoud = (file) => {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /\{[^{}]*input_i[^{}]*\}/s.exec(r.stderr);
  return m ? JSON.parse(m[0]) : null;
};
const ffDur = (file) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();

// ---------------------------------------------------------------- 1. 後処理を tts/core.py と比べる
ok('後処理：無音を削る・音量を -20 LUFS に（tts/core.py の ffmpeg と同じ長さ・同じ音量）', async () => {
  if (!FFMPEG || !UV) { console.log('    skip: ffmpeg or uv not found'); return; }
  const dir = path.join(work, 'post');
  fs.mkdirSync(dir, { recursive: true });
  const files = INPUTS.map(([name, ch, sr]) => { const f = path.join(dir, name + '.wav'); fs.writeFileSync(f, wav16(ch, sr)); return f; });
  // tts/core.py：synth_segment と同じ順（trim_silence → normalize_level）。モノラルにしてから（-ac 1。TTS の行はもともとモノラル）
  const py = PY(`import sys, shutil, subprocess, core
from pathlib import Path
for f in sys.argv[1:]:
    p = Path(f); out = p.with_suffix('.py.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(p), '-ac', '1', str(out)], check=True)
    core.trim_silence(out); core.normalize_level(out)
`, ...files);
  assert.equal(py.status, 0, py.stderr);
  for (let j = 0; j < INPUTS.length; j++) {
    const [name, ch, sr] = INPUTS[j];
    // 測り方：入力の積分ラウドネスが ffmpeg と ±0.3 LU（モノラルにした入力で）
    const mono = A.toMono(ch);
    const monoFile = path.join(dir, name + '.mono.wav');
    fs.writeFileSync(monoFile, wav16([mono], sr));
    const ffIn = ffLoud(monoFile);
    const jsIn = A.integratedLoudness(mono, sr);
    assert.ok(Math.abs(jsIn - +ffIn.input_i) <= 0.3, `${name}: loudness ${jsIn.toFixed(2)} vs ffmpeg ${ffIn.input_i}`);
    assert.ok(Math.abs(A.truePeakDb(mono) - +ffIn.input_tp) <= 0.5, `${name}: true peak ${A.truePeakDb(mono).toFixed(2)} vs ffmpeg ${ffIn.input_tp}`);
    // 仕上がり
    const js = A.processTake(ch, sr);
    const pyOut = files[j].replace(/\.wav$/, '.py.wav');
    const pyDur = ffDur(pyOut);
    assert.ok(Math.abs(js.dur - pyDur) <= 0.015, `${name}: duration ${js.dur} vs core.py ${pyDur}`);
    const jsFile = path.join(dir, name + '.js.wav');
    fs.writeFileSync(jsFile, A.encodeWav(js.pcm, js.sr));
    const a = +ffLoud(jsFile).input_i, b = +ffLoud(pyOut).input_i;
    assert.ok(Math.abs(a - b) <= 0.5, `${name}: output loudness ${a} vs core.py ${b}`);
    assert.ok(Math.abs(a - A.TARGET.lufs) <= 0.5 || js.peakDb >= A.TARGET.tpDb - 0.05, `${name}: output at ${a} LUFS (target ${A.TARGET.lufs})`);
    assert.ok(js.peakDb <= A.TARGET.tpDb + 0.05, `${name}: peak ${js.peakDb.toFixed(2)} dBTP over ${A.TARGET.tpDb}`);
    console.log(`    ${name}: ${js.dur.toFixed(3)} s (core.py ${pyDur.toFixed(3)}), ${a.toFixed(2)} LUFS (core.py ${b.toFixed(2)}), gain ${js.gainDb.toFixed(2)} dB`);
  }
});
ok('後処理：無音だけ・短すぎる音・ピークの上限', () => {
  assert.equal(A.processTake([new Float32Array(44100)], 44100).dur, 0, 'silence only → empty');
  const blip = cat(new Float32Array(4410), speechy(0.1, 44100, 0.3, 9), new Float32Array(4410));
  const r = A.processTake([blip], 44100);
  assert.equal(r.loudness, null, 'shorter than one 400 ms block: not measured');
  assert.equal(r.gainDb, 0, 'not measured → gain 0 (left as it is, like tts/core.py)');
  // 尖った音（大きなピーク、小さなラウドネス）：ゲインはピークが -1.5 dBTP で止まる
  const spiky = cat(speechy(1.5, 44100, 0.02, 10), Float32Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.9 : -0.9)), speechy(1.5, 44100, 0.02, 11));
  const s = A.processTake([spiky], 44100);
  assert.ok(s.peakDb <= A.TARGET.tpDb + 0.01 && s.peakDb >= A.TARGET.tpDb - 0.5, `peak-limited gain: ${s.peakDb}`);
  // ターンの間の無音と cues
  const j = A.joinParts([[new Float32Array(44100), new Float32Array(22050)], [new Float32Array(11025)]]);
  assert.deepEqual(j.cues, [1]);
  assert.equal(j.dur, 1.5 + 0.35 + 0.25);
});

// ---------------------------------------------------------------- 2. MP3
ok('MP3：LAME（64 kbps・44.1 kHz・モノラル）で作り、戻した長さが元とエンコーダの遅れの分だけ違う', async () => {
  const take = A.processTake(INPUTS[0][1], 44100);
  const mp3 = await encodeMp3(take.pcm);
  // 最初のフレームの頭：同期 0xFFE、MPEG-1（11）、Layer III（01）、ビットレートの番号 5（64 kbps）、44.1 kHz（00）、モノラル（11）
  let i = 0; while (i + 4 < mp3.length && !(mp3[i] === 0xff && (mp3[i + 1] & 0xe0) === 0xe0)) i++;
  const b1 = mp3[i + 1], b2 = mp3[i + 2], b3 = mp3[i + 3];
  assert.equal((b1 >> 3) & 3, 3, 'MPEG-1'); assert.equal((b1 >> 1) & 3, 1, 'Layer III');
  assert.equal(b2 >> 4, 5, 'bitrate index 5 = 64 kbps'); assert.equal((b2 >> 2) & 3, 0, '44.1 kHz'); assert.equal(b3 >> 6, 3, 'mono');
  // 大きさ：64 kbps
  const kbps = (mp3.length * 8) / take.dur / 1000;
  assert.ok(kbps > 55 && kbps < 80, `size matches 64 kbps (${kbps.toFixed(1)})`);
  if (FFMPEG) {
    const f = path.join(work, 'roundtrip.mp3'); fs.writeFileSync(f, mp3);
    const out = path.join(work, 'roundtrip.wav');
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', f, out]).status, 0);
    const back = A.decodeWav(fs.readFileSync(out));
    const extra = back.channels[0].length / back.sr - take.dur;
    assert.ok(extra >= 0 && extra < 0.08, `decoded length ${(back.channels[0].length / back.sr).toFixed(3)} s vs ${take.dur} s (encoder delay and padding)`);
    console.log(`    ${mp3.length} bytes, decoded +${(extra * 1000).toFixed(0)} ms`);
  }
});

// ---------------------------------------------------------------- 3. 読み辞書
ok('読み辞書：kit/core/yomi.mjs と tts/yomi.py が同じ文を返す', () => {
  const terms = parseYomiTerms(fs.readFileSync(path.join(ROOT, 'tts', 'yomi.yaml'), 'utf8'));
  assert.ok(terms.length >= 20 && terms.some(([t]) => t === '対数尤度'), 'terms read from yomi.yaml');
  assert.ok(terms.findIndex(([t]) => t === '対数尤度') < terms.findIndex(([t]) => t === '尤度'), 'longest first');
  const texts = ['尤度を最大にするパラメータを求めるのが、最尤推定です。', '対数尤度は、尤度関数の対数をとったものです。', '対数尤度比を使う。',
    '行列の固有値が負になると、その点は鞍点になります。', '双対問題を解いてから、閾値を決定木で調べます。', 'AIの応用とAI応用、AIMは違う。', 'Machine learning is fun.',
    'Man と Management、Part 1 の話。', '最尤推定量と最尤推定法', '𠮷野家の尤度'];
  const js = texts.map((t) => applyYomi(t, terms).text);
  if (!UV) { console.log('    skip comparison: uv not found'); return; }
  const r = PY(`import sys, json, yomi
from pathlib import Path
terms, _ = yomi.load_yomi(Path('yomi.yaml'))
print(json.dumps([yomi.apply_yomi(t, terms)[0] for t in json.loads(sys.argv[1])], ensure_ascii=False))`, JSON.stringify(texts));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(js, JSON.parse(r.stdout));
  const pyTerms = PY(`import json, yomi
from pathlib import Path
print(json.dumps(yomi.load_yomi(Path('yomi.yaml'))[0], ensure_ascii=False))`);
  assert.deepEqual(terms, JSON.parse(pyTerms.stdout), 'same terms in the same order as yomi.load_yomi');
});

// ---------------------------------------------------------------- 4. 記録
const NARR = `# 口述原稿

## 更新の式 {#s-k3f9q2}

[0]
Expert: 更新の式です。今の点から、次の点を決めます。

[1]
Expert: {cue}η は学習率で、{cue}1 歩の大きさを決めます。
Novice: 大きすぎると、どうなりますか。
`;
ok('記録：takeEntry・setManifestEntry・audioState（最新・古い・分からない）', async () => {
  const segs = parseNarration(NARR), s0 = segs[0], s1 = segs[1];
  const k0 = 's-k3f9q2:0', k1 = 's-k3f9q2:1';
  const h0 = await PF.inputHash(s0);
  const rec = A.takeEntry({ file: 'rec_0123456789abcdef.mp3', dur: 2.3456, kind: 'recorded', inputHash: h0 });
  assert.deepEqual(rec, { file: 'rec_0123456789abcdef.mp3', dur: 2.346, cues: [], sync: 'none', kind: 'recorded', inputHash: h0 });
  const recipe = { engine: 'irodori-web', model: 'm', voice: { expert: 'bob' }, seed: 42, dictionary: 'x'.repeat(64), processing: A.PROCESSING };
  const tts = A.takeEntry({ file: 'tts_a.mp3', dur: 3, cues: [0.5, 1.2], kind: 'tts', inputHash: await PF.inputHash(s1), recipe });
  assert.equal(tts.sync, 'auto'); assert.deepEqual(tts.cues, [0.5, 1.2]); assert.equal(tts.recipe.processing, 'trim-45-loud-20-v1');
  assert.throws(() => A.takeEntry({ file: 'x.mp3', dur: 1, kind: 'tts', inputHash: null }), /recipe/);
  assert.throws(() => A.takeEntry({ file: 'x.mp3', dur: 0, kind: 'recorded', inputHash: null }), /empty/);
  // 索引の記録の Schema の規則（kit/core/portable.mjs の validateIndex の audio の部分と同じ）を満たす
  for (const [k, e] of [[k0, rec], [k1, tts]]) {
    const ix = { audio: { [k]: { ...e, file: 'audio/' + e.file } } };
    const errs = PF.validateIndex({ format: 'egatari', version: { major: 1, minor: 0 }, profile: 'core', requires: ['audio-v1'], docId: '00000000-0000-4000-8000-000000000000', entry: 'deck.html', sourceSha256: '0'.repeat(64), files: { 'deck.html': 'a', [`audio/${e.file}`]: 'b' }, blobs: { a: { mime: 'text/html', bytes: 1, sha256: '0'.repeat(64), chunks: ['egatari-b-a-0'] }, b: { mime: 'audio/mpeg', bytes: 1, sha256: '1'.repeat(64), chunks: ['egatari-b-b-0'] } }, ...ix }).filter((x) => /audio/.test(x));
    assert.deepEqual(errs, [], k);
  }
  // manifest：ほかの段階はそのまま、口述原稿の順に
  const old = JSON.stringify({ segments: { [k1]: { file: 'seg_x.wav', dur: 1, cues: [], digest: 'abc' }, 'gone:0': { file: 'g.wav', dur: 1, cues: [] } }, extra: 1 }, null, 1);
  const next = JSON.parse(A.setManifestEntry(old, k0, rec, [k0, k1]));
  assert.deepEqual(Object.keys(next.segments), [k0, k1, 'gone:0']);
  assert.deepEqual(next.segments[k1], { file: 'seg_x.wav', dur: 1, cues: [], digest: 'abc' });
  assert.equal(next.extra, 1);
  assert.throws(() => A.setManifestEntry('{"segments": []}', k0, rec), /segments/);
  assert.deepEqual(Object.keys(JSON.parse(A.setManifestEntry(null, k0, rec)).segments), [k0]);
  // 古さ
  assert.equal(await A.audioState(rec, s0), 'fresh');
  const edited = parseNarration(NARR.replace('次の点を決めます', '次の点を選びます'));
  assert.equal(await A.audioState(rec, edited[0]), 'stale', 'narration changed after recording');
  assert.equal(await A.audioState({ ...rec, inputHash: null }, s0), 'stale', 'null = unknown = stale');
  assert.equal(await A.audioState(rec, null), 'stale', 'narration removed');
  // inputHash の無い記録（tts/synth.py の manifest）：控えの声で digest を作り直す。kit/narration.mjs の segDigest と同じ値
  const voice = { engine: 'irodori', expert: 'bob.wav' };
  assert.equal(await A.segDigest(s0, voice), segDigest(s0, voice));
  const synth = { file: 'seg_x.wav', dur: 1, cues: [], digest: segDigest(s0, voice) };
  assert.equal(await A.audioState(synth, s0, { voice }), 'fresh');
  assert.equal(await A.audioState(synth, edited[0], { voice }), 'stale');
  assert.equal(await A.audioState(synth, s0, null), 'unknown', 'no TTS record: not reported');
  assert.equal(A.takeFileName('recorded', 'ab'.repeat(32)), 'rec_abababababababab.mp3');
});

// ---------------------------------------------------------------- 5. 段 A で音声を替える
ok('段 A：持ち運べる 1 ファイルの 1 つの段階の音声を録音（MP3）に替える。決まった場所のほかは同じバイト・古さの印', async () => {
  const dir = path.join(work, 'minimal');
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const segs = parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8'));
  const segments = {};
  segs.forEach((x, j) => { fs.writeFileSync(path.join(dir, 'audio', `seg_js${j}.wav`), silentWav(0.5)); segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' }; });
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  const p = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(dir, 'out', 'deck.ega.html') });
  const r = await PF.readPortable(p.html);
  const ws = new Map(Object.entries(r.files));
  ws.set('audio/manifest.json', enc.encode(PF.manifestFromAudio(r.index.audio)));
  const key = Object.keys(r.index.audio)[1], seg = segs.find((s) => `${s.slideKey}:${s.stepKey}` === key);
  const take = A.processTake(INPUTS[0][1], 44100);
  const mp3 = await encodeMp3(take.pcm);
  const file = A.takeFileName('recorded', await PF.sha256Hex(mp3));
  ws.set('audio/' + file, mp3);
  const entry = A.takeEntry({ file, dur: take.dur, kind: 'recorded', inputHash: await PF.inputHash(seg) });
  ws.set('audio/manifest.json', enc.encode(A.setManifestEntry(dec.decode(ws.get('audio/manifest.json')), key, entry, segs.map((s) => `${s.slideKey}:${s.stepKey}`))));
  const a = await tierA(p.html, ws);
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  assert.deepEqual(a.changes.audio, [key]);
  assert.deepEqual(a.changes.narration, []);
  regionDiff(p.html, a.html, { audio: [key] });
  const back = await PF.readPortable(a.html);
  const rec = back.index.audio[key];
  assert.equal(rec.kind, 'recorded'); assert.equal(rec.sync, 'none'); assert.deepEqual(rec.cues, []); assert.equal(rec.dur, take.dur);
  assert.equal(rec.file, 'audio/' + file); assert.equal(back.index.blobs[back.index.files[rec.file]].mime, 'audio/mpeg');
  assert.ok(Buffer.from(back.files[rec.file]).equals(Buffer.from(mp3)));
  assert.equal(await PF.isStale(rec, seg), false, 'fresh after the take');
  // ほかの段階の記録は元のまま
  for (const k of Object.keys(r.index.audio)) if (k !== key) assert.deepEqual(back.index.audio[k], r.index.audio[k], k);
  const L = scanLayout(a.html), da = JSON.parse(a.html.slice(L.blocks.get('deck-audio').cStart, L.blocks.get('deck-audio').cEnd));
  assert.equal(da[key].mime, 'audio/mpeg'); assert.equal(da[key].sync, 'none'); assert.equal(da[key].dur, take.dur);
  // 口述原稿を直すと古い（音声は残る）
  const narr2 = dec.decode(ws.get('narration.md')).replace(seg.turns[0].raw, seg.turns[0].raw + '（直した）');
  ws.set('narration.md', enc.encode(narr2));
  const b = await tierA(a.html, ws);
  assert.ok(b.ok, `[${b.code}] ${b.reason}`);
  const back2 = await PF.readPortable(b.html);
  assert.equal(back2.index.audio[key].inputHash, rec.inputHash, 'audio record kept');
  assert.equal(await PF.isStale(back2.index.audio[key], parseNarration(narr2).find((s) => `${s.slideKey}:${s.stepKey}` === key)), true, 'stale after the narration changed');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && (e.stack || e.message) || e).split('\n').slice(0, 6).join('\n       ')); }
}
console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} passed`);
process.exit(failed ? 1 : 0);
