// 動画の音声の継ぎ目と同期の試験（render/render.mjs・render/audio-track.mjs）
//   node tools/test-render-audio.mjs [<作業フォルダ>]
// 15 秒の続いたチャープ（300→1200 Hz、48 kHz）を、半端な長さ（2.937・2.874・3.092・2.873・残り s）の 5 つの段階の音声に
// 標本の単位で切り、3 枚のスライドの教材にして --full で書き出す。full.mp4 の音声を元のチャープと比べる：
//   - 継ぎ目の位置の誤差（隣の段階の遅れの差）が 1 標本（48 kHz）以内
//   - 継ぎ目に跳び（クリック）がない：継ぎ目の前後の、元の信号との差が段階の中ほどの差（AAC の誤差）と同じ程度
//   - full.mp4 の音声が積み上げた時間と 1 ms 以内で揃う（AAC の先頭の遅れ 1024 標本が残らない）。映像の長さもコマ数どおり
//   - クリップ・章の mp4 の音声はコマの境目で切った区間（先頭が全体の同じ時刻）
//   - --music：背景の音楽は声の下で下がり、終わりで消える
// 前（v0.6.6 まで）の測定：継ぎ目の誤差 -3.67・-7.33・+8.00・-6.33 ms、全体が 1024 標本（23.2 ms）遅れ
// ffmpeg がなければ飛ばす（CI では tier2 が入れる）。純粋な計算の部分（audio-track.mjs）は ffmpeg なしでも確かめる
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trackLayout, placeNarration, narrationWindows, musicGain, limitPeaks, VIDEO_SR } from '../render/audio-track.mjs';
import { encodeWav } from '../kit/core/wav-core.mjs';
import { setManifestEntry } from '../kit/core/audio-core.mjs';
import { inputHash } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-parse.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'render-audio-')));
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n     ')); } };

// ---------------------------------------------------------------- 純粋な計算
await t('trackLayout: 段階の位置は積み上げた時間の標本、コマの境目は整数の標本', () => {
  const tl = [{ start: 0, dur: 2.937 }, { start: 2.937, dur: 2.874 }, { start: 5.811, dur: 0.01 }];
  const L = trackLayout(tl, 30, 48000);
  assert.deepEqual(L.stepRange(0), [0, 140976]);
  assert.deepEqual(L.stepRange(1), [140976, 278928]);
  assert.equal(L.frameSample(1), 1600);
  assert.equal(L.total, L.frameSample(L.starts.at(-1)));
});
await t('placeNarration: 段階の終わりで切る', () => {
  const ch = new Float32Array(10);
  assert.equal(placeNarration(ch, Float32Array.from([1, 1, 1, 1]), 2, 4), 2);
  assert.deepEqual([...ch], [0, 0, 1, 1, 0, 0, 0, 0, 0, 0]);
});
await t('musicGain: 声の間は -12 dB、声のないところは base、終わりで 0 になる。毎回同じ', () => {
  const sr = 1000, tl = [{ start: 0, dur: 4, lead: 1, audio: 'a', audioDur: 1 }, { start: 4, dur: 6, audio: null, audioDur: 0 }];
  const w = narrationWindows(tl);
  assert.deepEqual(w, [[1, 2]]);
  const g = musicGain(w, 10 * sr, sr, { base: 0.5 });
  assert.ok(Math.abs(g[1500] - 0.5 * 10 ** (-12 / 20)) < 1e-6, g[1500]);
  assert.ok(Math.abs(g[4000] - 0.5) < 1e-6, g[4000]);
  assert.ok(g[9999] < 0.01 && g[6000] > g[9000], 'fade out');
  assert.ok(g[900] < 0.5 && g[900] > g[1000] - 1e-6, 'attack before the voice');
  assert.deepEqual([...musicGain(w, 10 * sr, sr, { base: 0.5 })], [...g]);
});
await t('musicGain: 短い切れ目では戻さない', () => {
  const g = musicGain([[1, 2], [2.3, 3]], 5000, 1000, { base: 1 });
  assert.ok(Math.abs(g[2150] - 10 ** (-12 / 20)) < 1e-6, g[2150]);
});
await t('limitPeaks: どの標本も上限以下、上限より小さい音は変えない', () => {
  const a = new Float32Array(48000).map((_, i) => 0.5 * Math.sin(i / 10));
  const b = Float32Array.from(a);
  assert.equal(limitPeaks([b], 0.98), false);
  assert.deepEqual(b, a);
  a[20000] = 1.6; a[20001] = -1.4;
  assert.equal(limitPeaks([a], 0.98), true);
  assert.ok(Math.max(...a.map(Math.abs)) <= 0.98 + 1e-6);
  assert.equal(a[1000], b[1000]);
});

// ---------------------------------------------------------------- 書き出し（ffmpeg とブラウザ）
const have = (cmd) => { const r = spawnSync(cmd, ['-version'], { stdio: 'ignore' }); return !r.error && r.status === 0; };
if (!have('ffmpeg') || !have('ffprobe')) {
  console.log('skip: ffmpeg/ffprobe not found (the render part of this test runs in CI tier2)');
  console.log(`\n${n - fail}/${n} passed`);
  process.exit(fail ? 1 : 0);
}

const SR = 48000, T = 15, F0 = 300, F1 = 1200, AMP = 0.3;
const total = SR * T;
const ref = new Float32Array(total);
for (let i = 0; i < total; i++) { const x = i / SR; ref[i] = AMP * Math.sin(2 * Math.PI * (F0 * x + ((F1 - F0) / (2 * T)) * x * x)); }
// 16 bit の WAV に入れたあとの値（比べる元）
for (let i = 0; i < total; i++) ref[i] = Math.max(-32768, Math.min(32767, Math.round(ref[i] * 32767))) / 32767;
const lens = [2.937, 2.874, 3.092, 2.873];
const cuts = [0];
for (const L of lens) cuts.push(cuts.at(-1) + Math.round(L * SR));
cuts.push(total);
const KEYS = ['s-aaaaaa:0', 's-aaaaaa:1', 's-bbbbbb:0', 's-bbbbbb:1', 's-cccccc:0'];

function writeDeck(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>seam test</title></head>
<body>
<div id="stage">
<section class="slide" id="s-aaaaaa" data-chapter="A"><h2>Bar 1</h2><div class="body"><p class="sub" data-id="hd">Fifteen seconds</p><p data-step="1">Bar 2 arrives</p></div></section>
<section class="slide" id="s-bbbbbb" data-morph data-chapter="B"><h2>Bar 3</h2><div class="body"><p class="sub" data-id="hd">Fifteen seconds</p><p data-step="1">Bar 4 arrives</p></div></section>
<section class="slide" id="s-cccccc"><h2>Bar 5</h2><div class="body"><p>End card</p></div></section>
</div>
</body>
</html>
`);
  const narr = '# CM\n\n## Bar 1 {#s-aaaaaa}\n[0] one\n[1] two\n\n## Bar 3 {#s-bbbbbb}\n[0] three\n[1] four\n\n## Bar 5 {#s-cccccc}\n[0] five\n';
  fs.writeFileSync(path.join(dir, 'narration.md'), narr);
  // 段階の長さ = 音声の長さちょうど（lead 0、pad 0）
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(Object.fromEntries(KEYS.map((k, i) => [k, { dur: (cuts[i + 1] - cuts[i]) / SR, lead: 0, pad_after: 0 }])), null, 1));
  return (async () => {
    const segs = parseNarration(narr);
    const order = segs.map((s) => `${s.slideKey}:${s.stepKey}`);
    let man = null;
    for (let i = 0; i < 5; i++) {
      const file = `clip${i}.wav`;
      fs.writeFileSync(path.join(dir, 'audio', file), Buffer.from(encodeWav(ref.subarray(cuts[i], cuts[i + 1]), SR)));
      const seg = segs.find((s) => `${s.slideKey}:${s.stepKey}` === KEYS[i]);
      man = setManifestEntry(man, KEYS[i], { file, dur: (cuts[i + 1] - cuts[i]) / SR, cues: null, kind: 'imported', inputHash: seg ? await inputHash(seg) : null }, order);
    }
    fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), man);
  })();
}

const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status}):\n${(r.stdout + r.stderr).slice(-3000)}`);
  return r.stdout;
};
function decode(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', String(SR), '-'], { maxBuffer: 2 ** 30 });  // 左のチャンネル
  if (r.status !== 0) throw new Error('decode failed: ' + r.stderr);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + Math.floor(r.stdout.length / 4) * 4));
}
const probeStreams = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration,nb_frames,sample_rate', '-of', 'json', file], { encoding: 'utf8' }).stdout).streams;

// cap[i + lag] ≈ g·ref[i]（i は ref の [s, s+len)）となる lag（標本、小数）と g。lag は guess±search の中で探す
function xlag(cap, s, len, guess, search) {
  let best = -Infinity, bk = 0;
  const cc = new Float64Array(2 * search + 1);
  for (let k = -search; k <= search; k++) {
    const o = s + guess + k;
    let acc = 0;
    for (let i = 0; i < len; i++) { const c = cap[o + i]; if (c !== undefined) acc += c * ref[s + i]; }
    cc[k + search] = acc;
    if (acc > best) { best = acc; bk = k; }
  }
  let frac = 0;
  const j = bk + search;
  if (j > 0 && j < cc.length - 1) { const d = cc[j - 1] - 2 * cc[j] + cc[j + 1]; if (d) frac = (0.5 * (cc[j - 1] - cc[j + 1])) / d; }
  let rr = 0;
  for (let i = 0; i < len; i++) rr += ref[s + i] * ref[s + i];
  return { lag: guess + bk + frac, gain: best / rr };
}
// 段階ごとの遅れ（段階の中ほど 0.4 s で測る）と、継ぎ目の前後の差
function analyze(cap) {
  const steps = [];
  for (let k = 0; k < 5; k++) {
    const mid = Math.round((cuts[k] + cuts[k + 1]) / 2);
    steps.push(xlag(cap, mid - 9600, 19200, steps.length ? Math.round(steps.at(-1).lag) : 0, 2400));
  }
  const resid = (a, b, lag, g) => { let m = 0; for (let i = a; i < b; i++) { const r = Math.abs((cap[i + lag] ?? 0) - g * ref[i]); if (r > m) m = r; } return m; };
  const seams = [];
  for (let k = 1; k < 5; k++) {
    const B = cuts[k], lag = Math.round(steps[k].lag), g = steps[k].gain, w = Math.round(0.03 * SR);
    const near = resid(B - w, B + w, lag, g);
    const mid = Math.max(resid(Math.round((cuts[k - 1] + B) / 2) - w, Math.round((cuts[k - 1] + B) / 2) + w, lag, g), resid(Math.round((B + cuts[k + 1]) / 2) - w, Math.round((B + cuts[k + 1]) / 2) + w, lag, g));
    let dmax = 0;
    for (let i = B + lag - w; i < B + lag + w; i++) dmax = Math.max(dmax, Math.abs(cap[i + 1] - cap[i]));
    seams.push({ seam: k, errorSamples: steps[k].lag - steps[k - 1].lag, near, mid, stepOverSlope: dmax / (g * AMP * 2 * Math.PI * F1 / SR) });
  }
  return { steps, seams };
}
const fmt = (a) => JSON.stringify(a, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v));

const deck = path.join(work, 'deck');
await writeDeck(deck);
run(['kit/build.mjs', path.join(deck, 'deck.html')], 'build');
const out = path.join(work, 'video');
const t0 = Date.now();
run(['render/render.mjs', path.join(deck, 'out', 'deck.html'), '--out', out, '--full', '--scale', '0.25'], 'render --full');
console.log(`  render --full: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const meta = JSON.parse(fs.readFileSync(path.join(out, 'timeline.out.json'), 'utf8'));
const full = decode(path.join(out, 'full.mp4'));
const A = analyze(full);
console.log('  steps lag (samples):', fmt(A.steps.map((s) => s.lag)), 'gain:', fmt(A.steps.map((s) => s.gain)));
console.log('  seams:', fmt(A.seams));

await t('継ぎ目の位置の誤差が 1 標本（48 kHz）以内', () => {
  for (const s of A.seams) assert.ok(Math.abs(s.errorSamples) <= 1, `seam ${s.seam}: ${s.errorSamples.toFixed(2)} samples`);
});
await t('継ぎ目に跳びがない（前後の差が段階の中ほどの AAC の差と同じ程度、隣の標本の差が信号の傾きを超えない）', () => {
  for (const s of A.seams) {
    assert.ok(s.near <= 1.5 * s.mid + 0.005, `seam ${s.seam}: residual near ${s.near.toFixed(4)} vs mid ${s.mid.toFixed(4)}`);
    assert.ok(s.stepOverSlope <= 1.1, `seam ${s.seam}: |Δx| / max slope = ${s.stepOverSlope.toFixed(2)}`);
  }
});
await t('full.mp4 の音声が積み上げた時間と 1 ms 以内（どの段階も）', () => {
  for (const [k, s] of A.steps.entries()) assert.ok(Math.abs(s.lag) <= SR / 1000, `step ${k}: ${(s.lag / SR * 1000).toFixed(3)} ms`);
  for (const s of A.steps) assert.ok(Math.abs(s.gain - 1) < 0.05, `gain ${s.gain}`);
});
await t('full.mp4：映像はコマ数どおり、音声は 48 kHz で映像と同じ長さ、どちらも 0 から', () => {
  const st = probeStreams(path.join(out, 'full.mp4'));
  const v = st.find((x) => x.codec_type === 'video'), a = st.find((x) => x.codec_type === 'audio');
  const frames = meta.segments.reduce((x, s) => x + s.frames, 0);
  assert.equal(+v.nb_frames, frames);
  assert.equal(+a.sample_rate, 48000);
  assert.ok(Math.abs(+v.start_time) < 0.001 && Math.abs(+a.start_time) < 0.001, `start ${v.start_time} / ${a.start_time}`);
  assert.ok(Math.abs(full.length - Math.round(frames / meta.fps * SR)) <= 1, `audio ${full.length} samples vs video ${frames / meta.fps * SR}`);
  console.log(`     video ${v.nb_frames} frames ${v.duration} s, audio ${full.length} samples (${(full.length / SR).toFixed(6)} s), start ${v.start_time} / ${a.start_time}`);
});
await t('クリップの音声はコマの境目で切った区間（クリップ 2 の先頭が全体の同じ時刻に当たる）', () => {
  const seg = meta.segments[2];
  const clip = decode(path.join(out, seg.clip));
  const off = Math.round(seg.clipStart * SR);
  assert.equal(clip.length, Math.round(seg.frames / meta.fps * SR));
  const shifted = new Float32Array(off + clip.length); shifted.set(clip, off);
  const r = xlag(shifted, cuts[2] + 4800, 19200, 0, 480);
  assert.ok(Math.abs(r.lag) <= SR / 1000, `clip 2 lag ${r.lag.toFixed(2)} samples`);
});
await t('章ごとの mp4：2 章目の音声は全体の同じ区間、映像も音声も 0 から', () => {
  const seg = meta.segments[2];
  const f = path.join(out, 'chapter_02.mp4');
  const st = probeStreams(f);
  assert.ok(st.every((x) => Math.abs(+x.start_time) < 0.001), JSON.stringify(st));
  const cap = decode(f), off = Math.round(seg.clipStart * SR);
  const shifted = new Float32Array(off + cap.length); shifted.set(cap, off);
  const r = xlag(shifted, cuts[3] + 4800, 19200, 0, 480);
  assert.ok(Math.abs(r.lag) <= 1, `chapter 2 lag ${r.lag.toFixed(2)} samples`);
});

// 背景の音楽：一定の 220 Hz を流す。声（チャープ）の間はずっと声があるので、全体で -12 dB に下がり、終わりで消える
const music = path.join(work, 'music.wav');
const mus = new Float32Array(SR * 20).map((_, i) => 0.2 * Math.sin(2 * Math.PI * 220 * i / SR));
fs.writeFileSync(music, Buffer.from(encodeWav(mus, SR)));
const outM = path.join(work, 'video-music');
run(['render/render.mjs', path.join(deck, 'out', 'deck.html'), '--out', outM, '--full', '--scale', '0.25', '--music', music], 'render --full --music');
await t('--music：声の下で下げた音楽が入り、終わりで消える。声の位置は変わらない', () => {
  const cap = decode(path.join(outM, 'full.mp4'));
  const B = analyze(cap);
  for (const s of B.steps) assert.ok(Math.abs(s.lag) <= SR / 1000, `lag ${s.lag}`);
  // 音楽の成分 = 全体 - 声。220 Hz の振幅を測る
  const amp220 = (a, b) => { let s = 0, c = 0; for (let i = a; i < b; i++) { const d = cap[i] - ref[i]; s += d * Math.sin(2 * Math.PI * 220 * i / SR); c += d * Math.cos(2 * Math.PI * 220 * i / SR); } return 2 * Math.hypot(s, c) / (b - a); };
  const midA = amp220(5 * SR, 6 * SR), endA = amp220(total - 2400, total);
  const expect = 0.05 * Math.SQRT2 * 10 ** (-12 / 20);   // RMS 0.05 の正弦の振幅に -12 dB
  console.log(`     music amplitude mid ${midA.toFixed(4)} (expected ${expect.toFixed(4)}), last 50 ms ${endA.toFixed(4)}`);
  assert.ok(Math.abs(midA - expect) < 0.2 * expect, `mid ${midA}`);
  assert.ok(endA < 0.1 * expect, `end ${endA}`);
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
