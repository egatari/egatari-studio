// Colab 往復 TTS の単体の試験（ブラウザなし）：zip の安全な読み取り・tts-job.json・records.json・取り込みの突き合わせ・ノートブックと、
// ノートブックの核（colab/egatari_tts.py）の dry-run（uv があれば。モデルは使わない）。編集アプリでの往復は tools/test-audio.mjs
// test-all: unit
//   node tools/test-colab.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { serve } from '../colab/worker-protocol.mjs';
import { readZip, writeZip, ZipError } from '../kit/core/zip-read.mjs';
import { buildJob, planImport, parseRecords, readColabZip, decodeStepAudio, expectedCues, COLAB_VERIFIED, COLAB_NOTE_MARK, COLAB_LIMITS, colabUrl } from '../kit/core/colab-core.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { parseYomiTerms } from '../kit/core/yomi.mjs';
import { integratedLoudness, encodeWav, PROCESSING } from '../kit/core/audio-core.mjs';
import { inputHash, sha256Hex } from '../kit/core/portable.mjs';
import { colabZip } from './colab-fixture.mjs';
import { notebook } from './make-colab-notebook.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const enc = new TextEncoder();
const rej = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code, `${e.code}: ${e.message}`); return; } assert.fail('expected ' + code); };

const NARR = '# n\n\n## A\n[0] Expert: η は学習率です。{cue}次の文です。{mark:a}三つ目。\n    Novice: 質問です。\n[1] 単独の段です。\n\n## B\n[0] hello world\n';
const segs = parseNarration(NARR);
const yomi = { terms: parseYomiTerms('terms:\n  学習率: がくしゅうりつ\n'), sha256: 'a'.repeat(64) };
const baseJob = () => buildJob({ segs, docId: 'doc-1', lang: 'ja', voices: { expert: 'bob', novice: 'alice' }, yomi, version: '0.4.3' });

// ---------------------------------------------------------------- zip
ok('zip: stored and deflate members round-trip; folders and unwanted names are not read', async () => {
  const a = enc.encode('hello'.repeat(500));
  const z = writeZip([['records.json', enc.encode('{}')], ['audio/a.wav', a, { comp: zlib.deflateRawSync(a) }], ['junk/x.exe', enc.encode('MZ')], ['audio/', new Uint8Array(0)]]);
  const r = await readZip(z, { maxMemberBytes: () => 1 << 20, accept: (n) => n === 'records.json' || n.startsWith('audio/') });
  assert.deepEqual([...r.files.keys()].sort(), ['audio/a.wav', 'records.json']);
  assert.deepEqual(r.files.get('audio/a.wav'), a);
  assert.deepEqual(r.skipped, ['junk/x.exe']);
});
ok('zip: hostile archives are refused before they are inflated (bomb, size lie, CRC, encryption, duplicates, truncation, member count)', async () => {
  const lim = { maxMemberBytes: () => 1000 };
  const big = new Uint8Array(5_000_000);
  // 宣言は小さく実際は大きい（展開は宣言の大きさで打ち切る）
  await rej(readZip(writeZip([['audio/b.wav', big, { comp: zlib.deflateRawSync(big), usize: 900 }]]), lim), 'zip-over');
  // 宣言そのものが上限を超える（展開しない）
  await rej(readZip(writeZip([['audio/b.wav', big, { comp: zlib.deflateRawSync(big) }]]), lim), 'zip-over');
  await rej(readZip(writeZip([['a', enc.encode('x')], ['b', enc.encode('y')]]), { maxMemberBytes: () => 10, maxTotalBytes: 1 }), 'zip-over');
  const good = writeZip([['audio/a.wav', enc.encode('abcdef')]]);
  const crc = good.slice(); crc[30 + 'audio/a.wav'.length + 2] ^= 1;   // 中身の 3 字目
  await rej(readZip(crc, lim), 'zip-crc');
  await rej(readZip(writeZip([['audio/a.wav', enc.encode('x'), { flags: 1 }]]), lim), 'zip-encrypted');
  await rej(readZip(writeZip([['audio/a.wav', enc.encode('x')], ['audio/a.wav', enc.encode('y')]]), lim), 'zip-dup');
  await rej(readZip(good.slice(0, good.length - 10), lim), 'zip-not-zip');
  await rej(readZip(enc.encode('not a zip at all, just some text'), lim), 'zip-not-zip');
  await rej(readZip(writeZip(Array.from({ length: 5 }, (_, i) => ['audio/' + i, enc.encode('x')])), { maxMembers: 4, maxMemberBytes: () => 10 }), 'zip-members');
  const c = Uint8Array.from(good); { const d = new DataView(c.buffer); d.setUint16(c.length - 22 + 8, 0xffff, true); d.setUint16(c.length - 22 + 10, 0xffff, true); }   // 項目数 0xffff は zip64 の印
  await rej(readZip(c, lim), 'zip64');
});
ok('zip: a member over the per-name limit is refused by readColabZip (records 4 MiB)', async () => {
  const z = writeZip([['records.json', new Uint8Array(COLAB_LIMITS.recordsBytes + 1)]]);
  await rej(readColabZip(z), 'zip-over');
});

// ---------------------------------------------------------------- tts-job.json
ok('job: segments are the reading-applied sentences split at {cue}/{mark}; voices, recipe and inputHash are carried', async () => {
  const job = await baseJob();
  assert.equal(job.egatari, 'tts-job'); assert.equal(job.v, 1); assert.equal(job.docId, 'doc-1');
  assert.equal(job.recipe.engine, 'irodori'); assert.equal(job.recipe.model, 'irodori-tts-500m-v3'); assert.equal(job.recipe.seed, 0);
  assert.equal(job.recipe.dictionary, yomi.sha256); assert.equal(job.recipe.processing, PROCESSING);
  assert.equal(job.steps.length, 3);
  const s = job.steps[0];
  assert.equal(s.key, 'A:0'); assert.equal(s.inputHash, await inputHash(segs[0]));
  assert.deepEqual(s.turns.map((t) => [t.role, t.voice, t.segments.length]), [['expert', 'bob', 3], ['novice', 'alice', 1]]);
  assert.ok(s.turns[0].segments[0].includes('がくしゅうりつ'), 'the dictionary is applied by the editor');
  assert.equal(expectedCues(segs[0]), 2);
});
ok('job: English uses kokoro and no dictionary; keys limits the steps', async () => {
  const job = await buildJob({ segs, docId: null, lang: 'en', voices: {}, yomi, keys: ['B:0'] });
  assert.equal(job.recipe.engine, 'kokoro'); assert.equal(job.recipe.dictionary, null); assert.deepEqual(job.steps.map((x) => x.key), ['B:0']);
  assert.equal(job.steps[0].turns[0].segments[0], 'hello world');
});

// ---------------------------------------------------------------- 取り込みの計画
ok('import: matching steps are applied with cues; the decoded audio matches the record', async () => {
  const job = await baseJob(), zip = await readColabZip(await colabZip(job));
  const plan = await planImport({ zip, segs, docId: 'doc-1', yomi });
  assert.equal(plan.reject, null); assert.deepEqual(plan.applied.map((x) => x.key), ['A:0', 'A:1', 'B:0']); assert.equal(plan.marked.length, 0); assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.warnings, []);
  const it = plan.applied[0], d = decodeStepAudio(zip.files.get(it.file), it.rec);
  assert.equal(d.sr, 44100); assert.equal(d.cues.length, 2); assert.ok(Math.abs(d.dur - it.rec.dur) < 0.01);
  assert.ok(d.cues[0] > 0 && d.cues[1] > d.cues[0] && d.cues[1] < d.dur);
  assert.ok(Math.abs(integratedLoudness(d.pcm, 44100) - -20) < 1.5, 'normalized to about -20 LUFS');
  assert.equal(it.rec.recipe.processing, PROCESSING + '+colab1');
});
ok('import: the narration changed after the export → marked, not applied; unknown step → skipped; the other steps still apply', async () => {
  const job = await baseJob(), zip = await readColabZip(await colabZip(job));
  const now = parseNarration(NARR.replace('単独の段です。', '書き換えた段です。').replace('## B', '## C'));
  const plan = await planImport({ zip, segs: now, docId: 'doc-1', yomi });
  assert.deepEqual(plan.applied.map((x) => x.key), ['A:0']);
  assert.deepEqual(plan.marked.map((x) => x.key), ['A:1']);
  assert.deepEqual(plan.skipped.map((x) => [x.key, x.why]), [['B:0', 'no-step']]);
});
ok('import: another lesson (docId) is rejected; an unknown docId on either side is accepted; a different dictionary only warns', async () => {
  const job = await baseJob(), z = await readColabZip(await colabZip(job));
  assert.equal((await planImport({ zip: z, segs, docId: 'doc-2', yomi })).reject.code, 'doc-id');
  assert.equal((await planImport({ zip: z, segs, docId: null, yomi })).reject, null);
  const noId = await readColabZip(await colabZip(job, { docId: null }));
  assert.equal((await planImport({ zip: noId, segs, docId: 'doc-1', yomi })).reject, null);
  assert.deepEqual((await planImport({ zip: z, segs, docId: 'doc-1', yomi: { ...yomi, sha256: 'b'.repeat(64) } })).warnings, ['dictionary']);
});
ok('import: records that do not hold up are skipped one by one (path, cues count, hash, missing audio, kind) and never reach the files', async () => {
  const job = await baseJob();
  const mut = (f) => async () => planImport({ zip: await readColabZip(await colabZip(job, { mutate: (r, e) => f(r, e) })), segs, docId: 'doc-1', yomi });
  let p = await mut((r) => { r.steps['A:0'].file = 'audio/../../evil.wav'; })();
  assert.ok(p.skipped.some((x) => x.key === 'A:0') && !p.applied.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].file = '/etc/passwd'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].file = 'audio/x.html'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].cues = [0.5]; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0' && x.why === 'cues'));
  p = await mut((r) => { r.steps['A:0'].cues = [1, 0.5]; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].inputHash = 'zz'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].kind = 'recorded'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r) => { r.steps['A:0'].recipe.voice.expert = '../x'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  p = await mut((r, e) => { r.steps['A:0'].file = 'audio/gone.wav'; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0' && x.why === 'no-audio'));
  p = await mut((r) => { r.steps['A:0'].dur = -1; })(); assert.ok(p.skipped.some((x) => x.key === 'A:0'));
  assert.ok(p.applied.length === 2, 'the other steps are unaffected');
});
ok('import: records.json missing or not a tts-records file → rejected', async () => {
  const none = await readColabZip(writeZip([['audio/a.wav', enc.encode('x')]]));
  assert.equal((await planImport({ zip: none, segs })).reject.code, 'no-records');
  for (const t of ['nope', '{}', '{"egatari":"tts-records","v":2,"steps":{}}', '{"egatari":"tts-records","v":1,"steps":[]}']) {
    const z = await readColabZip(writeZip([['records.json', enc.encode(t)]]));
    assert.equal((await planImport({ zip: z, segs })).reject.code, 'bad-records', t);
  }
  assert.equal(parseRecords('{"egatari":"tts-records","v":1,"steps":{"__proto__":{}}}').records.size, 0);
});
ok('import: audio that is not a real WAV, silent, or the wrong length is refused when decoded', async () => {
  const rec = { file: 'audio/a.wav', dur: 1, cues: [] };
  assert.throws(() => decodeStepAudio(enc.encode('<html><script>alert(1)</script></html>'), rec), (e) => e.code === 'audio-not-wav');
  assert.throws(() => decodeStepAudio(encodeWav(new Float32Array(44100), 44100), rec), (e) => e.code === 'audio-empty');
  const tone = new Float32Array(44100).fill(0.1);
  assert.throws(() => decodeStepAudio(encodeWav(tone, 44100), { ...rec, dur: 3 }), (e) => e.code === 'audio-bad');
  assert.equal(decodeStepAudio(encodeWav(tone, 44100), rec).dur, 1);
});

// ---------------------------------------------------------------- ノートブックと「確認済み」の記し
ok('notebook: colab/egatari-tts.ipynb is what tools/make-colab-notebook.mjs makes (npm run gen); the Colab URL points at it', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'colab/egatari-tts.ipynb'), 'utf8').replace(/\r\n/g, '\n'), notebook());   // Windows の checkout は CRLF のことがある
  const nb = JSON.parse(notebook());
  assert.equal(nb.nbformat, 4);
  assert.ok(colabUrl('v0.5.0').endsWith('/blob/v0.5.0/colab/egatari-tts.ipynb'));
  const text = nb.cells.map((c) => c.source.join('')).join('\n');
  assert.ok(/Google/.test(text) && /プライバシー/.test(text), 'the privacy note is in the notebook (en and ja)');
});
ok('verified note: kept in one constant (kit/core/colab-core.mjs); the notebook, the docs and the editor help carry it, and it says what was not verified', () => {
  const nb = JSON.parse(notebook()), first = nb.cells[0].source.join('');
  const docs = ['docs/editor.md', 'docs/editor.ja.md'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const i18n = fs.readFileSync(path.join(ROOT, 'app/i18n.js'), 'utf8');
  assert.match(COLAB_VERIFIED.ja, /^確認済み：\d{4}-\d{2}-\d{2}/); assert.match(COLAB_VERIFIED.en, /^Verified: \d{4}-\d{2}-\d{2}/);
  assert.ok(/Kokoro/.test(COLAB_VERIFIED.ja) && /CPU/.test(COLAB_VERIFIED.ja) && /Kokoro/.test(COLAB_VERIFIED.en) && /CPU/.test(COLAB_VERIFIED.en), 'it names what is not verified yet');
  assert.ok(first.includes(COLAB_VERIFIED.en) && first.includes(COLAB_VERIFIED.ja), 'first markdown cell of the notebook');
  docs.forEach((d, k) => { const lines = d.split('\n').filter((l) => l.includes(`<!-- ${COLAB_NOTE_MARK} -->`)); assert.ok(lines.length >= 1 && lines.every((l) => l.includes(COLAB_VERIFIED[k ? 'ja' : 'en'])), `docs/editor${k ? '.ja' : ''}.md`); });
  assert.ok(/COLAB_VERIFIED/.test(i18n), 'app/i18n.js reads the constant');
  assert.ok(!/Unverified|未検証/.test(first) && !docs.some((d) => /Unverified|未検証/.test(d)));
});

// ---------------------------------------------------------------- 常駐ワーカーの通信（モデルなし）
ok('worker protocol: requests are answered in order, one failure does not stop the worker, quit ends it', async () => {
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on('data', (d) => lines.push(...String(d).split('\n').filter(Boolean)));
  const seen = [];
  const done = serve({ input, output, handler: async (r) => { await new Promise((res) => setTimeout(res, r.id === 1 ? 20 : 0)); if (r.text === 'bad') throw new Error('nope'); seen.push(r.id); } });
  input.write('{"id":1,"text":"a"}\n{"id":2,"text":"bad"}\nnot json\n\n{"id":3,"text":"c"}\n{"cmd":"quit"}\n{"id":4,"text":"after quit"}\n');
  await done; await new Promise((res) => setImmediate(res));
  const r = lines.map((l) => JSON.parse(l));
  assert.deepEqual(r.map((x) => [x.id, x.ok]), [[1, true], [2, false], [null, false], [3, true]]);
  assert.ok(r[1].error.includes('nope') && r[2].error.includes('bad request'));
  assert.deepEqual(seen, [1, 3]);
});
ok('irodori_node.mjs imports no module that reaches parse5 (audio-core, portable, bounded-html) and uses no Node 22-only API', () => {
  const src = fs.readFileSync(path.join(ROOT, 'colab/irodori_node.mjs'), 'utf8');   // 試験：リポジトリ自身のファイル
  assert.ok(!/audio-core|portable\.mjs|bounded-html|parse5/.test(src.replace(/\/\/.*$/gm, '')), 'no parse5 chain');
  assert.ok(!/import\.meta\.(dirname|filename)|Array\.fromAsync|\.toSorted\(|Promise\.withResolvers|\bwith \{/.test(src.replace(/\/\/.*$/gm, '')), 'no newer-only API');
});
ok('worker protocol: closing the input ends the worker', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const done = serve({ input, output, handler: async () => {} });
  input.end('{"id":1}\n');
  await done;
});
ok('python: IrodoriWorker talks to a long-lived worker (started once, errors carry the stderr tail, clean shutdown)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-worker-'));
  fs.mkdirSync(path.join(dir, 'voices'));
  const py = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
w = E.IrodoriWorker(["node", ${JSON.stringify(path.join(ROOT, 'tools/colab-fake-worker.mjs'))}], ${JSON.stringify(path.join(dir, 'voices'))}, ${JSON.stringify(dir)}, steps=5, seed=1)
pid = w._proc.pid
x1, sr1 = w("hello", "bob")
x2, sr2 = w("hello", "bob")
assert w._proc.pid == pid and sr1 == 24000 and len(x1) == round(24000 * 0.55) and (x1 == x2).all(), "same request, same audio, same process"
try:
    w("boom", "bob"); raise SystemExit("boom did not raise")
except E.WorkerError as e:
    assert "boom!" in str(e) and "fake worker: loaded once" in str(e), str(e)
x3, _ = w("again", "bob")
assert len(x3) > 0, "the worker survives a failed request"
try:
    w("die", "bob"); raise SystemExit("die did not raise")
except E.WorkerError as e:
    assert "out of memory (fake)" in str(e) and "3" in str(e), str(e)
w.close()
w.close()
try:
    w("x", "bob"); raise SystemExit("closed worker answered")
except E.WorkerError:
    pass
w2 = E.IrodoriWorker(["node", ${JSON.stringify(path.join(ROOT, 'tools/colab-fake-worker.mjs'))}], ${JSON.stringify(path.join(dir, 'voices'))}, ${JSON.stringify(dir)})
p = w2._proc
w2.close()
assert p.poll() == 0, p.poll()
try:
    E.IrodoriWorker(["node", "-e", "console.error('startup crash'); process.exit(7)"], "v", ${JSON.stringify(dir)}); raise SystemExit("no raise")
except E.WorkerError as e:
    assert "startup crash" in str(e) and "7" in str(e), str(e)
print("ok")
`;
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8', cwd: dir });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

// ---------------------------------------------------------------- 核の dry-run（Python。uv があれば）
ok('python core: the dry-run of colab/egatari_tts.py makes a zip the editor side imports, with the same processing as audio-core', async () => {
  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
  if (uv.error || uv.status !== 0) { console.log('    (skipped: uv is not installed)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-colab-'));
  try {
    const job = await baseJob();
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job));
    const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', path.join(ROOT, 'colab/egatari_tts.py'), path.join(dir, 'job.json'), path.join(dir, 'out.zip'), '--dry-run'], { encoding: 'utf8', cwd: dir });
    if (r.status !== 0 && /error: .*(resolve|download|network|connect)/i.test(r.stderr)) { console.log('    (skipped: uv cannot fetch numpy/scipy here)'); return; }
    assert.equal(r.status, 0, r.stderr);
    const zip = await readColabZip(new Uint8Array(fs.readFileSync(path.join(dir, 'out.zip'))));
    const plan = await planImport({ zip, segs, docId: 'doc-1', yomi });
    assert.equal(plan.reject, null); assert.deepEqual(plan.applied.map((x) => x.key), ['A:0', 'A:1', 'B:0']); assert.equal(plan.skipped.length, 0);
    const js = await readColabZip(await colabZip(job));
    for (const it of plan.applied) {
      const a = decodeStepAudio(zip.files.get(it.file), it.rec), jsRec = (await planImport({ zip: js, segs, docId: 'doc-1', yomi })).applied.find((x) => x.key === it.key);
      const b = decodeStepAudio(js.files.get(jsRec.file), jsRec.rec);
      assert.ok(Math.abs(a.dur - b.dur) < 0.03, `${it.key}: python ${a.dur} s vs JS ${b.dur} s`);
      assert.deepEqual(a.cues.length, b.cues.length);
      a.cues.forEach((c, i) => assert.ok(Math.abs(c - b.cues[i]) < 0.03, `${it.key} cue ${i}: ${c} vs ${b.cues[i]}`));
      assert.ok(Math.abs(integratedLoudness(a.pcm, 44100) - integratedLoudness(b.pcm, 44100)) < 0.6, `${it.key}: loudness`);
    }
    assert.equal(JSON.parse(new TextDecoder().decode(zip.files.get('records.json'))).steps['A:0'].inputHash, job.steps[0].inputHash, 'inputHash passes straight through');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

let fails = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('  ok   ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}
console.log(fails ? `\n${fails} failed` : `\nall ${tests.length} passed`);
process.exit(fails ? 1 : 0);
