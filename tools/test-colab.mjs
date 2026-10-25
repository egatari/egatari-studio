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
import { buildJob, planImport, parseRecords, readColabZip, decodeStepAudio, expectedCues, COLAB_VERIFIED, COLAB_NOTE_MARK, COLAB_LIMITS, COLAB_STEPS, COLAB_TIME, colabUrl } from '../kit/core/colab-core.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { parseYomiTerms } from '../kit/core/yomi.mjs';
import { integratedLoudness, encodeWav, PROCESSING, takeEntry } from '../kit/core/audio-core.mjs';
import { inputHash, sha256Hex } from '../kit/core/portable.mjs';
import { colabZip } from './colab-fixture.mjs';
import { notebook, COLAB_PINS } from './make-colab-notebook.mjs';
import { sessionFactory, providersFromEnv, cpuNotice, firstLine, actualProvider, supportedBackends } from '../colab/ort-fallback.mjs';
import { profileSessions, STAGE_NAMES } from '../colab/stage-profile.mjs';

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
ok('import: the refusal for another lesson carries the source lesson title (from the job, through records.json); old zips without a title still refuse; nothing validated changes', async () => {
  const plain = await baseJob(), withT = await buildJob({ segs, docId: 'doc-1', title: '  光の   屈折  ', lang: 'ja', voices: { expert: 'bob', novice: 'alice' }, yomi, version: '0.4.3' });
  assert.equal(withT.title, '光の 屈折'); assert.ok(!('title' in plain), 'no title key when none is given');
  const { title: _t, ...rest } = withT; assert.deepEqual(rest, plain, 'the title is the only difference: inputHash, steps and recipe are unchanged');
  const z = await readColabZip(await colabZip(withT));
  assert.equal(parseRecords(new TextDecoder().decode(z.files.get('records.json'))).title, '光の 屈折');
  const r = (await planImport({ zip: z, segs, docId: 'doc-2', yomi })).reject;
  assert.equal(r.code, 'doc-id'); assert.equal(r.title, '光の 屈折');
  assert.equal((await planImport({ zip: z, segs, docId: 'doc-1', yomi })).reject, null, 'same lesson still imports');
  const old = await readColabZip(await colabZip(plain)), ro = (await planImport({ zip: old, segs, docId: 'doc-2', yomi })).reject;
  assert.equal(ro.code, 'doc-id'); assert.equal(ro.title, null);
  const src = fs.readFileSync(path.join(ROOT, 'app/i18n.js'), 'utf8');
  // 音声の板の言葉（handoff/audio-flow-2026-10-25.md の cloud.wrong）に、分かれば元の教材の題を添える
  assert.ok(src.includes("wrong: 'この ZIP ファイルには、この教材の音声が入っていません。この教材で書き出した台本から作った ZIP ファイルを選んでください', wrongOf: (t) => `（「${t}」の台本から作った ZIP ファイルです）`"), 'ja message');
  assert.ok(src.includes("wrong: 'This ZIP file has no audio for this lesson. Choose the ZIP file made from the script exported from this lesson', wrongOf: (t) => ` (it was made from the script of “${t}”)`"), 'en message');
  assert.ok(!/docId が違う|the docId differs/.test(src), 'no docId jargon in the messages');
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
ok('notebook header: the same steps as the editor’s C2 (connect → CPU when T4 cannot connect → run all → choose the file → ZIP), ja and en, before the first code cell; only the T4 timing', () => {
  const nb = JSON.parse(notebook()), first = nb.cells[0].source.join('');
  assert.equal(nb.cells[0].cell_type, 'markdown');
  for (const l of ['ja', 'en']) {
    COLAB_STEPS[l].forEach((x, i) => assert.ok(first.includes(`${i + 1}. ${x}`), `${l} step ${i + 1}`));
    assert.ok(first.includes(COLAB_TIME[l]), `${l} timing`);
  }
  assert.ok(first.indexOf(`1. ${COLAB_STEPS.en[0]}`) < first.indexOf(COLAB_VERIFIED.en), 'the steps come before the verified note');
  assert.ok(/「接続」/.test(COLAB_STEPS.ja[0]) && /ランタイムのタイプを変更/.test(COLAB_STEPS.ja[0]) && /「CPU」/.test(COLAB_STEPS.ja[0]) && /すべてのセルを実行/.test(COLAB_STEPS.ja[1]), 'Colab’s Japanese menu names');
  assert.ok(!COLAB_STEPS.ja.concat(COLAB_STEPS.en).some((x) => /\d+\s*(秒|分|s\b|min)/.test(x)) && /T4/.test(COLAB_TIME.ja) && !/CPU/.test(COLAB_TIME.ja + COLAB_TIME.en), 'no CPU timing');
  assert.equal(nb.metadata.colab.gpuType, 'T4');
});
ok('verified note: kept in one constant (kit/core/colab-core.mjs); the notebook, the docs and the editor help carry it, and it says what was not verified', () => {
  const nb = JSON.parse(notebook()), first = nb.cells[0].source.join('');
  const docs = ['docs/editor.md', 'docs/editor.ja.md'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const i18n = fs.readFileSync(path.join(ROOT, 'app/i18n.js'), 'utf8');
  assert.match(COLAB_VERIFIED.ja, /^確認済み：\d{4}-\d{2}-\d{2}/); assert.match(COLAB_VERIFIED.en, /^Verified: \d{4}-\d{2}-\d{2}/);
  assert.ok(/Kokoro/.test(COLAB_VERIFIED.ja) && /CPU/.test(COLAB_VERIFIED.ja) && /Kokoro/.test(COLAB_VERIFIED.en) && /CPU/.test(COLAB_VERIFIED.en), 'it names what was verified');
  assert.ok(first.includes(COLAB_VERIFIED.en) && first.includes(COLAB_VERIFIED.ja), 'first markdown cell of the notebook');
  docs.forEach((d, k) => { const lines = d.split('\n').filter((l) => l.includes(`<!-- ${COLAB_NOTE_MARK} -->`)); assert.ok(lines.length >= 1 && lines.every((l) => l.includes(COLAB_VERIFIED[k ? 'ja' : 'en'])), `docs/editor${k ? '.ja' : ''}.md`); });
  assert.ok(/COLAB_VERIFIED/.test(i18n), 'app/i18n.js reads the constant');
  assert.ok(/2026-10-24/.test(COLAB_VERIFIED.ja) && /T4/.test(COLAB_VERIFIED.ja) && /cuda13/.test(COLAB_VERIFIED.ja) && /2026-10-24/.test(COLAB_VERIFIED.en) && /cuda13/.test(COLAB_VERIFIED.en), 'GPU verification is recorded');
  assert.ok(!/固定した版での GPU の確認：まだ|not yet verified/.test(COLAB_VERIFIED.ja + COLAB_VERIFIED.en) && /2026-10-23/.test(COLAB_VERIFIED.ja), 'placeholder gone, CPU line kept');
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
  const src = ['colab/irodori_node.mjs', 'colab/ort-fallback.mjs'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');   // 試験：リポジトリ自身のファイル
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

ok('python: prepare_reference_voice validates (3-30 s, decodable, not silent) and writes 48 kHz mono; IrodoriWorker uses it as the reference', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-ref-'));
  const py = `
import os, shutil, subprocess, sys, wave
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
d = ${JSON.stringify(dir)}
def tone(sec, sr, ch=1, amp=0.3):
    t = np.arange(round(sec * sr)) / sr
    x = (amp * np.sin(2 * np.pi * 220 * t) * 32767).astype("<i2")
    return x if ch == 1 else np.stack([x, x // 2], axis=1)
def bad(name, data, sr, needle):
    p = os.path.join(d, name); wavfile.write(p, sr, data)
    try:
        E.prepare_reference_voice(p, os.path.join(d, "o.wav")); raise SystemExit(name + " did not raise")
    except E.RefVoiceError as e:
        assert needle in str(e), str(e)
# ok: 44.1 kHz stereo 5 s -> 48 kHz mono 16 bit, about 5 s
src = os.path.join(d, "a.wav"); wavfile.write(src, 44100, tone(5, 44100, 2))
out = os.path.join(d, "sub", "ref.wav")
info = E.prepare_reference_voice(src, out)
with wave.open(out) as w:
    assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (48000, 1, 2)
    assert abs(w.getnframes() / 48000 - 5) < 0.01, w.getnframes()
assert info["channels"] == 2 and info["src_sr"] == 44100 and abs(info["seconds"] - 5) < 0.01
# the edges (3 s and 30 s) are accepted
E.prepare_reference_voice(src, out); wavfile.write(src, 16000, tone(3, 16000)); E.prepare_reference_voice(src, out)
wavfile.write(src, 8000, tone(30, 8000)); E.prepare_reference_voice(src, out)
# errors
bad("short.wav", tone(1, 24000), 24000, "短すぎ")
bad("long.wav", tone(31, 8000), 8000, "長すぎ")
bad("silent.wav", tone(5, 16000, amp=0.0), 16000, "無音")
try:
    E.prepare_reference_voice(os.path.join(d, "none.wav"), out); raise SystemExit("missing file")
except E.RefVoiceError as e:
    assert "ファイルがありません" in str(e)
junk = os.path.join(d, "junk.wav"); open(junk, "wb").write(b"this is not audio at all" * 50)
for ff in ("ffmpeg", None):
    try:
        E.prepare_reference_voice(junk, out, ffmpeg=ff); raise SystemExit("junk accepted")
    except E.RefVoiceError as e:
        assert "読" in str(e), str(e)
# MP3 through ffmpeg (only where ffmpeg exists)
if shutil.which("ffmpeg"):
    mp3 = os.path.join(d, "a.mp3")
    wavfile.write(src, 44100, tone(4, 44100))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, mp3], check=True)
    info = E.prepare_reference_voice(mp3, out)
    assert 3.9 < info["seconds"] < 4.2, info
    with wave.open(out) as w: assert (w.getframerate(), w.getnchannels()) == (48000, 1)
# the worker passes the reference voice, and the default is unchanged
w = E.IrodoriWorker(["node", ${JSON.stringify(path.join(ROOT, 'tools/colab-fake-worker.mjs'))}], os.path.join(d, "voices"), d, ref_voice=out)
sent = []
orig = w._proc.stdin.write
class Tap:
    def __init__(s, f): s.f = f
    def write(s, x): sent.append(x); return s.f.write(x)
    def flush(s): return s.f.flush()
    def close(s): return s.f.close()
w._proc.stdin = Tap(w._proc.stdin)
w("hello", "bob"); w.close()
assert out in sent[0] and "bob.wav" not in sent[0], sent[0]
w = E.IrodoriWorker(["node", ${JSON.stringify(path.join(ROOT, 'tools/colab-fake-worker.mjs'))}], os.path.join(d, "voices"), d)
w._proc.stdin = Tap(w._proc.stdin); sent.clear()
w("hello", "bob"); w.close()
assert os.path.join(d, "voices", "bob.wav") in sent[0], sent[0]
print("ok")
`;
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8', cwd: dir });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
ok('notebook: the optional reference-voice cell is there, off by default, passes ref_voice to Irodori only, and says the voice must be one you may use', () => {
  const nb = JSON.parse(notebook()), text = nb.cells.map((c) => c.source.join('')).join('\n');
  assert.ok(/UPLOAD = False/.test(text) && /DRIVE_PATH = ""/.test(text) && /ref_voice=globals\(\)\.get\("REF_VOICE_PATH"\)/.test(text));
  const load = nb.cells.find((c) => c.cell_type === 'code' && c.source.join('').includes('irodori_synth')).source.join('');
  assert.ok(!/REF_VOICE_PATH/.test(load.replace(/globals\(\)\.get\("REF_VOICE_PATH"\)/g, '')), 'cell 3 does not reference REF_VOICE_PATH bare (the optional cell may be skipped)');
  assert.ok(/right to use/.test(text) && /使ってよい声/.test(text) && /not uploaded anywhere else/.test(text));
  assert.ok(nb.cells.every((c) => c.cell_type !== 'code' || (c.execution_count === null && c.outputs.length === 0)), 'no outputs or execution counts');
});

// ---------------------------------------------------------------- GPU（CUDA）が使えないときの CPU への切り替え（2026-10-23 の講習：libcublasLt.so.13）
const CUDA_ERR = 'OrtSessionOptionsAppendExecutionProvider_Cuda: Failed to load shared library\n(libcublasLt.so.13: cannot open shared object file)';
ok('ort fallback: a CUDA provider failure retries the same session on the CPU, says so once, and later sessions go straight to the CPU', async () => {
  const tries = [], logs = [];
  const f = sessionFactory({ providers: providersFromEnv('cuda,cpu'), log: (m) => logs.push(m), create: async (file, o) => { tries.push([file, o.executionProviders.join(',')]); if (o.executionProviders.includes('cuda')) throw new Error(CUDA_ERR); return { file, o }; } });
  const got = [];
  for (const n of ['a', 'b', 'c']) got.push(await f.create(n, { graphOptimizationLevel: 'all' }));
  assert.deepEqual(tries, [['a', 'cuda,cpu'], ['a', 'cpu'], ['b', 'cpu'], ['c', 'cpu']]);
  assert.deepEqual(f.providers, ['cpu']);
  assert.equal(logs.length, 1, 'one notice');
  assert.equal(f.notice, logs[0]);
  assert.ok(/GPU（CUDA）を使えない/.test(f.notice) && /CPU/.test(f.notice) && /could not be used/.test(f.notice) && /slower/.test(f.notice), 'Japanese and English');
  assert.ok(f.notice.endsWith('OrtSessionOptionsAppendExecutionProvider_Cuda: Failed to load shared library') && !f.notice.includes('\n'), 'one line, with the first line of the reason');
  assert.equal(got[0].o.graphOptimizationLevel, 'all', 'the other options are kept');
});
ok('ort fallback: no notice when CUDA works; a CPU failure is not hidden; an all-CPU list does not retry', async () => {
  const logs = [];
  const good = sessionFactory({ providers: ['cuda', 'cpu'], log: (m) => logs.push(m), create: async () => ({}) });
  await good.create('a'); await good.create('b');
  assert.deepEqual(good.providers, ['cuda', 'cpu']); assert.equal(good.notice, null); assert.equal(logs.length, 0);
  const broken = sessionFactory({ providers: ['cuda', 'cpu'], log: (m) => logs.push(m), create: async (f, o) => { throw new Error(o.executionProviders.includes('cuda') ? CUDA_ERR : 'model is broken'); } });
  await assert.rejects(broken.create('a'), /model is broken/);
  let n = 0;
  const cpu = sessionFactory({ providers: providersFromEnv('cpu'), log: (m) => logs.push(m), create: async () => { n++; throw new Error('model is broken'); } });
  await assert.rejects(cpu.create('a'), /model is broken/);
  assert.equal(n, 1); assert.equal(cpu.notice, null);
  assert.deepEqual(providersFromEnv(''), ['cuda', 'cpu']); assert.deepEqual(providersFromEnv(' cuda , cpu '), ['cuda', 'cpu']);
  assert.equal(firstLine(new Error('\n  first \nsecond')), 'first');
  assert.ok(cpuNotice('x').endsWith('x'));
});
ok('irodori_node.mjs creates its sessions through the fallback and puts the providers and the notice in the ready line', () => {
  const src = fs.readFileSync(path.join(ROOT, 'colab/irodori_node.mjs'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/sessionFactory\(/.test(src) && /factory\.create\(/.test(src) && !/InferenceSession\.create\([^)]*executionProviders/.test(src));
  assert.ok(/ready: true, providers: factory\.providers, provider: actualProvider\(factory, supportedBackends\(ort\)\)/.test(src) && /factory\.notice/.test(src));
});
ok('python: a CUDA failure in the worker is passed through as one notice line (not an error), and the job continues on the CPU', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-fallback-'));
  fs.mkdirSync(path.join(dir, 'voices'));
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(await baseJob()));
  const fake = path.join(ROOT, 'tools/colab-fake-worker.mjs');
  const py = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
d = ${JSON.stringify(dir)}
w = E.IrodoriWorker(["node", ${JSON.stringify(fake)}], os.path.join(d, "voices"), d, env=dict(os.environ, EGATARI_ORT_PROVIDERS="cuda,cpu", EGATARI_FAKE_ORT_FAIL="cuda"))
assert w.providers == ["cpu"] and w.provider == "cpu", (w.providers, w.provider)
assert w.notice and "libcublasLt" not in w.notice and "could not be used" in w.notice, w.notice
job = E.validate_job(json.load(open(os.path.join(d, "job.json"), encoding="utf-8")))
data = E.run_job(job, w, engine_info={"engine": "irodori-colab", "model": "m", "seed": 0, "runtime": E.runtime_label("cuda12", w.provider)})
assert len(data) > 1000
open(os.path.join(d, "out.zip"), "wb").write(data)
w.close()
w = E.IrodoriWorker(["node", ${JSON.stringify(fake)}], os.path.join(d, "voices"), d, env=dict(os.environ, EGATARI_ORT_PROVIDERS="cuda,cpu"))
assert w.providers == ["cuda", "cpu"] and w.provider == "cuda" and w.notice is None, (w.providers, w.provider, w.notice)
w.close()
try:
    E.IrodoriWorker(["node", ${JSON.stringify(fake)}], os.path.join(d, "voices"), d, env=dict(os.environ, EGATARI_FAKE_ORT_FAIL="all")); raise SystemExit("no raise")
except E.WorkerError as e:
    assert "Failed to load shared library" in str(e), str(e)
print("DONE")
`;
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8', cwd: dir });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.filter((l) => l.includes('GPU（CUDA）を使えない')).length, 1, 'the notice is printed once to the notebook output:\n' + r.stdout);
  assert.ok(lines.at(-1) === 'DONE');
  const zip = await readColabZip(new Uint8Array(fs.readFileSync(path.join(dir, 'out.zip'))));
  const plan = await planImport({ zip, segs, docId: 'doc-1', yomi });
  assert.deepEqual(plan.applied.map((x) => x.rec.recipe.runtime), ['cuda12/cpu', 'cuda12/cpu', 'cuda12/cpu'], 'every record says what actually ran (after the fallback)');
  fs.rmSync(dir, { recursive: true, force: true });
});
ok('ort fallback: the provider actually used comes from the fallback and the backends this build has, not the requested list', () => {
  const f = (providers) => ({ providers });
  assert.equal(actualProvider(f(['cuda', 'cpu']), ['cpu', 'webgpu', 'cuda', 'tensorrt']), 'cuda', 'x64: CUDA loaded without error');
  assert.equal(actualProvider(f(['cpu']), ['cpu', 'cuda']), 'cpu', 'after the fallback');
  assert.equal(actualProvider(f(['cuda', 'cpu']), ['cpu']), 'cpu', 'linux/arm64: no CUDA in the build, onnxruntime-node skips it quietly');
  assert.equal(actualProvider(f(['cuda', 'cpu']), null), 'cuda?', 'unknown: marked with ?');
  assert.deepEqual(supportedBackends({ listSupportedBackends: () => [{ name: 'cpu', bundled: true }, { name: 'cuda', bundled: false }] }), ['cpu', 'cuda']);
  assert.equal(supportedBackends({}), null); assert.equal(supportedBackends({ listSupportedBackends: () => { throw new Error('x'); } }), null);
});
ok('import: recipe.runtime (pin set / provider) is kept into the take, a malformed one is dropped, and inputHash is the same with or without it', async () => {
  const job = await baseJob();
  const plain = await planImport({ zip: await readColabZip(await colabZip(job)), segs, docId: 'doc-1', yomi });
  const withRt = await planImport({ zip: await readColabZip(await colabZip(job, { mutate: (r) => { for (const k of Object.keys(r.steps)) r.steps[k].recipe.runtime = 'cuda12/cuda'; } })), segs, docId: 'doc-1', yomi });
  const bad = await planImport({ zip: await readColabZip(await colabZip(job, { mutate: (r) => { r.steps['A:0'].recipe.runtime = '../../x y'; } })), segs, docId: 'doc-1', yomi });
  assert.deepEqual(withRt.applied.map((x) => x.key), plain.applied.map((x) => x.key), 'runtime does not make a step stale');
  assert.deepEqual(withRt.marked, []); assert.deepEqual(bad.applied.map((x) => x.key), plain.applied.map((x) => x.key));
  assert.deepEqual(withRt.applied.map((x) => x.rec.inputHash), plain.applied.map((x) => x.rec.inputHash));
  for (const it of withRt.applied) {
    assert.equal(it.rec.recipe.runtime, 'cuda12/cuda');
    assert.equal(it.rec.inputHash, await inputHash(segs.find((s) => `${s.slideKey}:${s.stepKey}` === it.key)), 'inputHash is computed from the narration only');
    const e = takeEntry({ file: 'audio/x.mp3', dur: it.rec.dur, cues: it.rec.cues, kind: 'tts', inputHash: it.rec.inputHash, recipe: it.rec.recipe });
    assert.equal(e.recipe.runtime, 'cuda12/cuda', 'the audio manifest keeps it');
  }
  assert.ok(plain.applied.every((x) => !('runtime' in x.rec.recipe)) && !('runtime' in bad.applied.find((x) => x.key === 'A:0').rec.recipe));
  for (const g of ['cuda13/cpu', 'none/cpu', 'cuda12/cuda?']) assert.equal((await planImport({ zip: await readColabZip(await colabZip(job, { mutate: (r) => { r.steps['A:0'].recipe.runtime = g; } })), segs, docId: 'doc-1', yomi })).applied[0].rec.recipe.runtime, g);
});
const pyRun = (py, cwd) => {
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return null; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return r.stdout;
};
ok('python: progress lines carry the step time and the running total (monotonic clock around the real synthesis), and the end prints the total', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-progress-'));
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(await baseJob()));
  const out = pyRun(`
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
assert E.progress_line(3, 10, "s-intro:2", 41.23, 135.9) == "3/10 s-intro:2  (+41.2 s, total 2:15)", E.progress_line(3, 10, "s-intro:2", 41.23, 135.9)
assert E.clock_text(0) == "0:00" and E.clock_text(59.9) == "0:59" and E.clock_text(3725) == "1:02:05"
assert E.total_line(754, 10).startswith("synthesis: 10 steps in 12:34 (75.4 s per step)"), E.total_line(754, 10)
# 偽の時計：合成（synth の呼び出し）ごとに 7 秒進む。run_job の時間は、その呼び出しを囲んで測る
now = [100.0]
def clock(): return now[0]
def synth(text, voice, role, lang):
    now[0] += 7.0
    return E.dry_run_synth(text, voice, role, lang)
seen = []
job = E.validate_job(json.load(open(${JSON.stringify(path.join(dir, 'job.json'))}, encoding="utf-8")))
E.run_job(job, synth, progress=lambda *a: seen.append(E.progress_line(*a)), clock=clock)
print("\\n".join(seen))
`);
  fs.rmSync(dir, { recursive: true, force: true });
  if (out === null) return;
  // A:0 は 4 区切り（3＋1）、A:1 と B:0 は 1 区切り
  assert.deepEqual(out.trim().split('\n'), ['1/3 A:0  (+28.0 s, total 0:28)', '2/3 A:1  (+7.0 s, total 0:35)', '3/3 B:0  (+7.0 s, total 0:42)']);
});
ok('python: CPU auto-pick: no GPU (or the worker fell back to the CPU) gives IRODORI_CPU_STEPS, a GPU gives IRODORI_STEPS; the env line says which', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-steps-'));
  fs.mkdirSync(path.join(dir, 'voices'));
  const fake = path.join(ROOT, 'tools/colab-fake-worker.mjs');
  const out = pyRun(`
import os, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
d = ${JSON.stringify(dir)}
assert E.IRODORI_STEPS == 40 and E.IRODORI_CPU_STEPS == 24, "the CPU steps are one named constant (24 until the owner picks)"
assert E.pick_irodori_steps(False) == E.IRODORI_CPU_STEPS and E.pick_irodori_steps(True) == E.IRODORI_STEPS
assert E.compute_label(False) == "CPU（Irodori の steps=24）" and E.compute_label(True) == "GPU（Irodori の steps=40）"
line = E.env_compute_line(False)
assert line.startswith("env: ") and line.endswith(" · CPU（Irodori の steps=24）"), line
assert E.env_compute_line(True) == "env: GPU (CUDA) · GPU（Irodori の steps=40）", E.env_compute_line(True)
def steps_sent(w):
    w("hello", "bob")
    log = open(w._errpath, encoding="utf-8").read()
    return [l for l in log.splitlines() if l.startswith("fake request:")]
# GPU の検出を偽のワーカーで差し替える：CUDA が使える／CUDA で作れず CPU に切り替えた／最初から CPU
for env, want_provider, want_steps in [({"EGATARI_ORT_PROVIDERS": "cuda,cpu"}, "cuda", 40), ({"EGATARI_ORT_PROVIDERS": "cuda,cpu", "EGATARI_FAKE_ORT_FAIL": "cuda"}, "cpu", 24), ({"EGATARI_ORT_PROVIDERS": "cpu"}, "cpu", 24)]:
    w = E.IrodoriWorker(["node", ${JSON.stringify(fake)}], os.path.join(d, "voices"), d, steps=None, env=dict(os.environ, **env))
    assert w.provider == want_provider and w.steps == want_steps, (env, w.provider, w.steps)
    assert steps_sent(w) == [f"fake request: steps={want_steps}"], steps_sent(w)
    w.close()
w = E.IrodoriWorker(["node", ${JSON.stringify(fake)}], os.path.join(d, "voices"), d, steps=16, env=dict(os.environ, EGATARI_ORT_PROVIDERS="cpu"))
assert w.steps == 16, "an explicit steps wins"
w.close()
print("ok")
`, dir);
  fs.rmSync(dir, { recursive: true, force: true });
  if (out !== null) assert.ok(out.includes('ok'));
});
ok('python: recipe.diffusionSteps and recipe.precision are written as provenance; the import keeps them, drops malformed ones, and inputHash does not change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colab-recipe-'));
  const job = await baseJob();
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job));
  const out = pyRun(`
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
job = E.validate_job(json.load(open(${JSON.stringify(path.join(dir, 'job.json'))}, encoding="utf-8")))
open(${JSON.stringify(path.join(dir, 'out.zip'))}, "wb").write(E.run_job(job, E.dry_run_synth, engine_info={"engine": "irodori-colab", "model": "m", "seed": 0, "diffusionSteps": 24, "precision": "fp32"}))
for bad in [{"diffusionSteps": 0}, {"diffusionSteps": 2.5}, {"diffusionSteps": True}, {"precision": "int4"}]:
    try:
        E.run_job(job, E.dry_run_synth, engine_info=bad); raise SystemExit(f"no raise: {bad}")
    except E.JobError:
        pass
print("ok")
`);
  if (out === null) { fs.rmSync(dir, { recursive: true, force: true }); return; }
  const zip = await readColabZip(new Uint8Array(fs.readFileSync(path.join(dir, 'out.zip'))));
  fs.rmSync(dir, { recursive: true, force: true });
  const plan = await planImport({ zip, segs, docId: 'doc-1', yomi });
  assert.equal(plan.applied.length, 3);
  for (const it of plan.applied) {
    assert.equal(it.rec.recipe.diffusionSteps, 24); assert.equal(it.rec.recipe.precision, 'fp32');
    assert.equal(it.rec.inputHash, await inputHash(segs.find((s) => `${s.slideKey}:${s.stepKey}` === it.key)), 'inputHash is the narration only');
  }
  for (const [k, v] of [['diffusionSteps', 0], ['diffusionSteps', 1e6], ['diffusionSteps', '24'], ['precision', 'int4'], ['precision', 16]]) {
    const p = await planImport({ zip: await readColabZip(await colabZip(job, { mutate: (r) => { r.steps['A:0'].recipe[k] = v; } })), segs, docId: 'doc-1', yomi });
    assert.ok(p.applied.some((x) => x.key === 'A:0') && !(k in p.applied.find((x) => x.key === 'A:0').rec.recipe), `${k}=${JSON.stringify(v)} is dropped, the step still imports`);
  }
});
ok('stage profile: the worker times each ONNX session per request (stage names, call counts); the protocol passes the extra fields; Python prints one line', async () => {
  let t = 0;
  const fakeSession = (ms) => ({ inputNames: ['x'], async run() { t += ms; return { ok: true }; } });
  const p = profileSessions({ text: fakeSession(10), enc: fakeSession(2000), dit: fakeSession(100), dac: fakeSession(900) }, () => t);
  assert.deepEqual(p.sessions.dit.inputNames, ['x'], 'other properties pass through');
  await p.sessions.text.run(); await p.sessions.enc.run(); for (let i = 0; i < 16; i++) await p.sessions.dit.run(); await p.sessions.dac.run();
  assert.deepEqual(p.take(), { text: { s: 0.01, n: 1 }, 'ref-encode': { s: 2, n: 1 }, dit: { s: 1.6, n: 16 }, decode: { s: 0.9, n: 1 } });
  assert.deepEqual(p.take(), {}, 'take resets');
  assert.equal(STAGE_NAMES.enc, 'ref-encode');
  const input = new PassThrough(), output = new PassThrough(); let got = '';
  output.on('data', (d) => { got += d; });
  const done = serve({ input, output, handler: async (r) => (r.id === 1 ? { profile: { totalS: 1 }, id: 99, ok: false } : undefined) });
  input.end('{"id": 1}\n{"id": 2}\n');
  await done;
  assert.deepEqual(got.trim().split('\n').map((l) => JSON.parse(l)), [{ profile: { totalS: 1 }, id: 1, ok: true }, { id: 2, ok: true }], 'extra fields never override id/ok');
  const out = pyRun(`
import sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
print(E.stage_line({"stages": {"dit": {"s": 1.6, "n": 16}, "text": {"s": 0.01, "n": 1}, "decode": {"s": 0.9, "n": 1}}, "totalS": 2.52}, 2.6))
print(E.stage_line({"stages": {"ref-encode": {"s": 2.0, "n": 1}}}))
`);
  if (out === null) return;
  assert.deepEqual(out.trim().split('\n'), ['stages: text 0.01 s · dit 1.60 s ×16 · decode 0.90 s · ref-encode cached · node 2.52 s · round trip 2.60 s', 'stages: ref-encode 2.00 s']);
});
ok('notebook: cell 1 prints the CPU/GPU env line; cell 3 lets the worker pick the steps, loads fp32 on the CPU, records steps and precision; cell 4 prints timed progress and the total', () => {
  const code = JSON.parse(notebook()).cells.filter((c) => c.cell_type === 'code').map((c) => c.source.join(''));
  const c1 = code.find((c) => c.includes('#@title 1.')), c3 = code.find((c) => c.includes('#@title 3.')), c4 = code.find((c) => c.includes('#@title 4.'));
  assert.ok(/^print\(E\.env_compute_line\(GPU\)\)$/m.test(c1) && c1.indexOf('env_compute_line') > c1.indexOf('GPU = '), 'the env line comes after GPU detection');
  assert.ok(/E\.irodori_synth\([^\n]*profile=PROFILE\)/.test(c3) && !/E\.irodori_synth\([^\n]*steps=/.test(c3), 'steps are left to the worker (auto-pick)');
  assert.ok(/PROFILE = False   #@param \{type:"boolean"\}/.test(c3), 'a debug flag for the stage profile, off by default');
  assert.ok(/IRODORI_FOLDER = "onnx_fp16" if GPU else "onnx"/.test(c3) && /allow_patterns=\[IRODORI_FOLDER \+ "\/\*", "tokenizer\/\*"\]/.test(c3) && /EGATARI_IRODORI_FOLDER/.test(c3));
  assert.ok(/"diffusionSteps": synth\.steps/.test(c3) && /"precision": synth\.precision/.test(c3) && /E\.compute_label\(synth\.provider != "cpu", synth\.steps\)/.test(c3));
  assert.ok(/time\.monotonic\(\)/.test(c3) && /loaded in/.test(c3));
  assert.ok(/def progress\(i, n, key, step_s, total_s\): print\(E\.progress_line\(i, n, key, step_s, total_s\), flush=True\)/.test(c4));
  assert.ok(/_t_synth = time\.monotonic\(\)/.test(c4) && /E\.total_line\(time\.monotonic\(\) - _t_synth, len\(job\["steps"\]\)\)/.test(c4) && c4.indexOf('_t_synth = ') < c4.indexOf('E.run_job('), 'the total is measured around run_job with a monotonic clock');
});
ok('worker: the reference voice is encoded once per voice (memoized in colab/irodori_node.mjs), and the CPU uses the fp32 weights', () => {
  const src = fs.readFileSync(path.join(ROOT, 'colab/irodori_node.mjs'), 'utf8');
  assert.ok(/tts\.wavToRefLatent = memo\(/.test(src) && /tts\.encodeRefLatent = memo\(/.test(src), 'both reference stages are memoized');
  assert.ok(/EGATARI_IRODORI_FOLDER/.test(src) && /EGATARI_PROFILE/.test(src));
});
ok('python: provider_name and runtime_label (Kokoro: the providers the session really has)', () => {
  const py = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
assert E.provider_name(["CUDAExecutionProvider", "CPUExecutionProvider"]) == "cuda"
assert E.provider_name(["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]) == "tensorrt"
assert E.provider_name(["CPUExecutionProvider"]) == "cpu" and E.provider_name([]) == "cpu"
assert E.runtime_label("cuda12", "cuda") == "cuda12/cuda" and E.runtime_label(None, "cpu") == "none/cpu" and E.runtime_label("cuda13", "cuda?") == "cuda13/cuda?"
try:
    E.runtime_label("a b", "cpu"); raise SystemExit("no raise")
except ValueError:
    pass
class S:
    def get_providers(s): return ["CPUExecutionProvider"]
class K:
    sess = S()
    def create(s, *a, **k): return [0.0], 24000
import types
E.load_kokoro = lambda *a, **k: (K(), None)
syn = E.kokoro_synth("m", "v")
assert syn.provider == "cpu" and syn.providers == ["CPUExecutionProvider"], syn.provider
print("ok")
`;
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
ok('notebook: cell 3 records the runtime (pin set and provider in use) for both engines', () => {
  const c3 = JSON.parse(notebook()).cells.find((c) => c.cell_type === 'code' && c.source.join('').includes('#@title 3.')).source.join('');
  assert.equal((c3.match(/"runtime": E\.runtime_label\(PIN_SET, synth\.provider\)/g) || []).length, 2);
});
ok('python: Kokoro asks for CUDA and CPU only (no TensorRT); the phonemizer logger is quieted and nothing else', () => {
  const src = fs.readFileSync(path.join(ROOT, 'colab/egatari_tts.py'), 'utf8');
  assert.ok(/def kokoro_providers\(available\)/.test(src) && /providers=kokoro_providers\(rt\.get_available_providers\(\)\)/.test(src) && !/TensorrtExecutionProvider/.test(src.replace(/#.*$/gm, '')), 'session providers');
  assert.ok(/getLogger\("phonemizer"\)\.setLevel\(logging\.ERROR\)/.test(src) && !/logging\.disable|getLogger\(\)\.setLevel|simplefilter/.test(src), 'phonemizer only');
  const r = spawnSync('python3', ['-I', '-c', 'import sys; sys.path.insert(0, ' + JSON.stringify(path.join(ROOT, 'colab')) + '); import egatari_tts as E; print(E.kokoro_providers(["TensorrtExecutionProvider","CUDAExecutionProvider","CPUExecutionProvider"]), E.kokoro_providers(["CPUExecutionProvider"]))'], { encoding: 'utf8' });
  if (r.status === 0) assert.equal(r.stdout.trim(), "['CUDAExecutionProvider', 'CPUExecutionProvider'] ['CPUExecutionProvider']");
});
ok('python: Kokoro falls back to the CPU too (load_kokoro), whether onnxruntime raises or quietly drops CUDA', () => {
  const py = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import egatari_tts as E
class S:
    def __init__(s, p): s.p = p
    def get_providers(s): return s.p
class K:
    def __init__(s, p): s.sess = S(p)
logs = []
AV = ["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]
def boom(): raise RuntimeError("EP Error\\nlibcublasLt.so.13: cannot open shared object file")
k, n = E.load_kokoro("m", "v", make=boom, cpu_session=lambda: K(["CPUExecutionProvider"]), available=AV, log=logs.append)
assert k.sess.get_providers() == ["CPUExecutionProvider"] and n and "EP Error" in n and len(logs) == 1, (n, logs)
k, n = E.load_kokoro("m", "v", make=lambda: K(["CPUExecutionProvider"]), cpu_session=None or (lambda: 1/0), available=AV, log=logs.append)
assert n and "CUDAExecutionProvider" in n and len(logs) == 2, n
k, n = E.load_kokoro("m", "v", make=lambda: K(["CUDAExecutionProvider", "CPUExecutionProvider"]), cpu_session=lambda: 1/0, available=AV, log=logs.append)
assert n is None and len(logs) == 2
try:
    E.load_kokoro("m", "v", make=boom, cpu_session=lambda: 1/0, available=["CPUExecutionProvider"], log=logs.append); raise SystemExit("no raise")
except RuntimeError as e:
    assert "EP Error" in str(e)
assert E.cpu_notice("r").endswith("r") and E.first_line(ValueError("\\n a \\nb")) == "a"
print("ok")
`;
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (uv not found: skipped)'); return; }
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
ok('python and JS say the same notice', () => {
  const src = fs.readFileSync(path.join(ROOT, 'colab/egatari_tts.py'), 'utf8');
  const m = src.match(/return f"(GPU（CUDA）[^"]*)\{reason\}"/);
  assert.ok(m, 'cpu_notice in egatari_tts.py'); assert.equal(m[1], cpuNotice(''));
});
ok('notebook: every install is pinned to COLAB_PINS (npm and pip), and cell 1 prints the environment (Python, Node, GPU/CUDA, CUDA libraries, pins)', () => {
  const nb = JSON.parse(notebook()), code = nb.cells.filter((c) => c.cell_type === 'code').map((c) => c.source.join(''));
  const text = code.join('\n');
  assert.ok(/class _NoHfTokenWarn/.test(text) && /"unauthenticated requests" not in rec\.getMessage\(\)/.test(text) && text.indexOf('_NoHfTokenWarn') < text.indexOf('snapshot_download(HF_REPO'), 'only the HF_TOKEN warning is filtered, before snapshot_download');
  assert.ok(!/filterwarnings\("ignore"\)|simplefilter\("ignore"\)|setLevel\(logging\.(ERROR|CRITICAL)/.test(text), 'other warnings are not suppressed');
  const pins = text.match(/^PIN_SETS = (\{.*\})/m);
  assert.ok(pins, 'PIN_SETS in the notebook'); assert.deepEqual(JSON.parse(pins[1]), COLAB_PINS);
  assert.deepEqual(Object.keys(COLAB_PINS).sort(), ['cuda12', 'cuda13']);
  for (const [set, p] of Object.entries(COLAB_PINS)) {
    assert.deepEqual(Object.keys(p).sort(), ['@huggingface/transformers', 'kokoro-onnx', 'onnxruntime', 'onnxruntime-gpu', 'onnxruntime-node'], set);
    for (const [k, v] of Object.entries(p)) assert.match(v, /^\d+\.\d+\.\d+$/, `${set} ${k} is an exact version`);
    assert.equal(p['onnxruntime'], p['onnxruntime-gpu'], `${set}: the CPU and GPU onnxruntime share one version`);
  }
  assert.ok(/^PINS = PIN_SETS\[PIN_SET\]$/m.test(text) && /"→ pin set", PIN_SET/.test(text), 'the chosen set is used and printed');
  assert.ok(/npm i --silent " \+ " "\.join\(f"\{k\}@\{PINS\[k\]\}" for k in \["onnxruntime-node","@huggingface\/transformers"\]\)/.test(text), 'npm uses the pins');
  assert.ok(/uv pip install [^\n]*f"\{k\}==\{PINS\[k\]\}" for k in \["kokoro-onnx","onnxruntime-gpu","onnxruntime"\]/.test(text), 'pip uses the pins');
  assert.ok(!/npm i [^\n]*onnxruntime-node @huggingface/.test(text) && !/kokoro-onnx onnxruntime-gpu/.test(text), 'no unpinned install left');
  const c1 = code.find((c) => c.includes('#@title 1.'));
  const env = c1.slice(0, c1.indexOf('git", "clone'));
  for (const re of [/"env: Python", sys\.version/, /"node", "--version"/, /nvidia-smi/, /CUDA Version/, /no nvidia-smi/, /libcublasLt/, /ldconfig -p/, /pick_pin_set\(/, /"env: pinned"/]) assert.match(env, re, 'cell 1 prints the environment and picks the pin set before the clone and the installs');
  const c3 = code.find((c) => c.includes('#@title 3.'));
  assert.ok(/env: onnxruntime-node/.test(c3) && /provider libraries/.test(c3) && /Irodori providers in use/.test(c3) && /Kokoro providers in use/.test(c3));
  const gen = fs.readFileSync(path.join(ROOT, 'tools/make-colab-notebook.mjs'), 'utf8');
  assert.ok(/CUDA 13/.test(gen) && /libcublasLt\.so\.13/.test(gen) && /libcublasLt\.so\.12/.test(gen) && /更新の仕方/.test(gen), 'the pin says which CUDA it needs, why it exists and how to update it');
});
ok('notebook: the pin set follows the CUDA libraries cell 1 finds (fake ldconfig and file lists): .so.13 → cuda13, only .so.12 → cuda12, no GPU or none found → cuda13', () => {
  const c1 = JSON.parse(notebook()).cells.find((c) => c.cell_type === 'code' && c.source.join('').includes('#@title 1.')).source.join('');
  const defs = c1.match(/^def cublas_majors[\s\S]*?(?=^print\()/m);
  assert.ok(defs, 'cublas_majors and pick_pin_set in cell 1');
  const LD12 = '\\t3 libs found in cache\\n\\tlibcublasLt.so.12 (libc6,x86-64) => /usr/local/cuda/lib64/libcublasLt.so.12\\n\\tlibcublas.so.12 (libc6,x86-64) => /usr/local/cuda/lib64/libcublas.so.12\\n';
  const LD13 = '\\tlibcublasLt.so.13 (libc6,x86-64) => /usr/local/cuda/lib64/libcublasLt.so.13\\n';
  const py = `
import re
${defs[0]}
assert cublas_majors("${LD12}", []) == ["12"]
assert cublas_majors("${LD12}", ["libcublasLt.so.13", "libcublasLt.so.13.0.1", "libcublasLt.so"]) == ["12", "13"]
assert cublas_majors("", ["libcublasLt.so.12.4.5.8", "libcublasLt.so.12"]) == ["12"]
assert cublas_majors("libcublas.so.12 (libc6) => /x/libcublas.so.12", []) == []
assert cublas_majors("${LD13}", []) == ["13"]
assert pick_pin_set(["12"], True)[0] == "cuda12" and "CUDA 12" in pick_pin_set(["12"], True)[1]
assert pick_pin_set(["13"], True)[0] == "cuda13"
assert pick_pin_set(["12", "13"], True)[0] == "cuda13"
assert pick_pin_set([], True)[0] == "cuda13"
assert pick_pin_set(["12"], False)[0] == "cuda13" and "no GPU" in pick_pin_set(["12"], False)[1]
print("ok")
`;
  const r = spawnSync('python3', ['-I', '-c', py], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') { console.log('  (python3 not found: skipped)'); return; }
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
