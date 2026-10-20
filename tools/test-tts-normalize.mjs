// TTS に渡す文の前処理（kit/core/tts-normalize.mjs。合成の「作り方」で、inputHash・ttsParts には入れない。format spec §5.4）の単体の試験：
// 規則の例（tools/fixtures/tts-normalize.json。JS と Python で共有）・版の比較・inputHash と ttsParts が変わらないこと・古い recipe（field なし）が妥当なこと・
// Colab の job（文はそのまま、recipe.textNormalize つき）・Python 版（colab/egatari_tts.py の normalize_tts_text。uv があれば）が JS と同じ結果になること
// test-all: unit
//   node tools/test-tts-normalize.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEXT_NORMALIZE, normalizeTtsText, textNormalizeOutdated } from '../kit/core/tts-normalize.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { inputHash, validateIndex } from '../kit/core/portable.mjs';
import { buildJob } from '../kit/core/colab-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/tts-normalize.json'), 'utf8'));
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('shared vectors: the rule gives the expected text (and is idempotent)', () => {
  assert.equal(FX.id, TEXT_NORMALIZE);
  for (const [a, b] of FX.vectors) { assert.equal(normalizeTtsText(a), b, JSON.stringify(a)); assert.equal(normalizeTtsText(b), b, 'idempotent: ' + JSON.stringify(b)); }
});
ok('counters collapse ("3 分" minutes, "10 本", "2 つ"); "x 2 y" and English "Chapter 3 is" are untouched', () => {
  assert.equal(normalizeTtsText('3 分'), '3分');
  assert.equal(normalizeTtsText('10 本'), '10本');
  assert.equal(normalizeTtsText('2 つ'), '2つ');
  assert.equal(normalizeTtsText('x 2 y'), 'x 2 y');
  assert.equal(normalizeTtsText('Chapter 3 is'), 'Chapter 3 is');
  assert.equal(normalizeTtsText('Chapter 3 の話'), 'Chapter 3の話');   // 数字の後ろが日本語なら（英語の中でも）取る。数字の前の空白は取らない
});
ok('textNormalizeOutdated: missing or older is outdated; the current or a newer version is not', () => {
  assert.equal(textNormalizeOutdated(undefined), true);
  assert.equal(textNormalizeOutdated({ engine: 'x' }), true);
  assert.equal(textNormalizeOutdated({ textNormalize: 'join-num-counter@0' }), true);
  assert.equal(textNormalizeOutdated({ textNormalize: 'other-rule@9' }), true);
  assert.equal(textNormalizeOutdated({ textNormalize: 'garbage' }), true);
  assert.equal(textNormalizeOutdated({ textNormalize: TEXT_NORMALIZE }), false);
  assert.equal(textNormalizeOutdated({ textNormalize: 'join-num-counter@99' }), false);
});
ok('inputHash and ttsParts do not depend on the pre-processing: "1 歩" keeps its space (and differs from "1歩", as before)', async () => {
  const a = parseNarration('# n\n\n## A\n[0] 次は 1 歩進みます。\n'), b = parseNarration('# n\n\n## A\n[0] 次は 1歩進みます。\n');
  assert.ok(a[0].turns[0].ttsParts.join('').includes('1 歩'));
  assert.notEqual(await inputHash(a[0]), await inputHash(b[0]));
  assert.match(await inputHash(a[0]), /^[0-9a-f]{64}$/);
});
ok('a recipe without textNormalize stays valid (index audio record rules); one with it is valid too', () => {
  const idx = (recipe) => ({ format: 'egatari', version: { major: 1, minor: 0 }, profile: 'core', requires: ['audio-v1'], docId: '00000000-0000-4000-8000-000000000000', entry: 'deck.html', sourceSha256: '0'.repeat(64), files: { 'deck.html': 'a', 'audio/a.mp3': 'b' },
    blobs: { a: { mime: 'text/html', bytes: 1, sha256: '0'.repeat(64), chunks: ['egatari-b-a-0'] }, b: { mime: 'audio/mpeg', bytes: 1, sha256: '1'.repeat(64), chunks: ['egatari-b-b-0'] } },
    audio: { 'A:0': { file: 'audio/a.mp3', dur: 1, cues: [], kind: 'tts', inputHash: null, recipe } } });
  const base = { engine: 'irodori-web', model: 'm', voice: { expert: 'bob' }, seed: null, dictionary: null, processing: 'trim-45-loud-20-cap-v1' };
  const errs = (r) => validateIndex(idx(r)).filter((x) => /audio/.test(x));
  assert.deepEqual(errs(base), []);
  assert.deepEqual(errs({ ...base, textNormalize: TEXT_NORMALIZE }), []);
  assert.notDeepEqual(errs({ ...base, voice: { expert: '../x' } }), [], 'the check is live');
});
ok('the Colab job carries the text un-normalized and recipe.textNormalize', async () => {
  const segs = parseNarration('# n\n\n## A\n[0] 次は 1 歩進みます。\n');
  const job = await buildJob({ segs, docId: 'd', lang: 'ja', voices: {}, yomi: null, version: '0' });
  assert.equal(job.recipe.textNormalize, TEXT_NORMALIZE);
  assert.ok(job.steps[0].turns[0].segments.join('').includes('1 歩'));
  assert.equal(job.steps[0].inputHash, await inputHash(segs[0]));
});
ok('python port: normalize_tts_text matches the shared vectors; synthesize_step normalizes only for a known textNormalize; the record carries it', () => {
  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
  if (uv.error || uv.status !== 0) { console.log('    (skipped: uv is not installed)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-tts-normalize-'));
  try {
    const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'colab'))})
import numpy as np
import egatari_tts as E
fx = json.load(open(${JSON.stringify(path.join(ROOT, 'tools/fixtures/tts-normalize.json'))}, encoding="utf-8"))
assert fx["id"] == E.TEXT_NORMALIZE
for a, b in fx["vectors"]:
    assert E.normalize_tts_text(a) == b, (a, E.normalize_tts_text(a), b)
seen = []
def synth(text, voice, role, lang):
    seen.append(text)
    t = np.arange(22050) / 22050
    return 0.3 * np.sin(2 * np.pi * 200 * t), 22050
step = {"key": "A:0", "lang": "ja", "inputHash": "0" * 64, "turns": [{"role": "expert", "voice": "bob", "segments": ["次は 1 歩進みます。"]}]}
E.synthesize_step(step, synth, {"textNormalize": E.TEXT_NORMALIZE})
E.synthesize_step(step, synth, {"textNormalize": "join-num-counter@999"})
E.synthesize_step(step, synth, {})
assert seen == ["次は 1歩進みます。", "次は 1 歩進みます。", "次は 1 歩進みます。"], seen
import zipfile, io
job = {"egatari": "tts-job", "v": 1, "docId": "d", "recipe": {"engine": "kokoro", "model": "m", "seed": 0, "dictionary": None, "processing": E.PROCESSING, "textNormalize": E.TEXT_NORMALIZE}, "steps": [step]}
z = zipfile.ZipFile(io.BytesIO(E.run_job(job, synth)))
rec = json.loads(z.read("records.json"))["steps"]["A:0"]["recipe"]
assert rec["textNormalize"] == E.TEXT_NORMALIZE, rec
job["recipe"].pop("textNormalize")
rec = json.loads(zipfile.ZipFile(io.BytesIO(E.run_job(job, synth))).read("records.json"))["steps"]["A:0"]["recipe"]
assert "textNormalize" not in rec, rec
print("python ok")
`;
    const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'numpy', '--with', 'scipy', 'python', '-I', '-c', py], { encoding: 'utf8', cwd: dir });
    if (r.status !== 0 && /error: .*(resolve|download|network|connect)/i.test(r.stderr)) { console.log('    (skipped: uv cannot fetch numpy/scipy here)'); return; }
    assert.equal(r.status, 0, r.stderr + r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

let fails = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('  ok   ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 6).join('\n    ')); }
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
