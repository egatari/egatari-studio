// 本文のステップへのリンク（format spec §9C.8 の 1）：1 ファイルへの書き出し（npm run portable -- pack）は、書く文書を再生器（ヘッドレスのブラウザ）で
// 開いて check と同じに確かめ、ないステップへのリンクがあれば check と同じコード（articleStep）で断る。ブラウザを使う
//   node tools/test-article-steps.mjs [作業フォルダ]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as PF from '../kit/core/portable.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { CITEPROC_CREDIT } from '../kit/core/citeproc-credit.mjs';
import { hostileChapters } from './hostile-book.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK = path.join(ROOT, 'tools', 'fixtures', 'article-book');
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-article-steps-'));
fs.mkdirSync(work, { recursive: true });
let failed = 0;
const ok = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n  ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')}`); } };
const copy = (name, link) => {
  const d = path.join(work, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.cpSync(BOOK, d, { recursive: true, filter: (s) => !/[\\/]out([\\/]|$)/.test(path.relative(BOOK, s)) });
  const f = path.join(d, 'article', '01.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('{step}`s-k3f9q2:1`', `{step}\`${link}\``));
  return path.join(d, 'deck.html');
};
await ok('pack: links to existing steps (1, concl, 0) are written', async () => {
  for (const link of ['s-k3f9q2:1', 's-k3f9q2:concl', 's-p2m4q7:0']) {
    const r = await PF.exportPortable(nodeEnv, copy('good', link), { fromFolder: true });
    assert.ok(r.html.includes(`data-egatari-step="${link}"`), link);
  }
});
await ok('pack: a link to a step the slide does not have is refused with articleStep, as check reports it', async () => {
  const src = copy('bad', 's-k3f9q2:9');
  await assert.rejects(PF.exportPortable(nodeEnv, src, { fromFolder: true }), (e) => e.code === 'article-invalid' && e.details.some((x) => x.code === 'articleStep' && x.data.why === 'step'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), src, '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.match(r.stdout, /"code":\s*"articleStep"/, 'check reports the same code');
});
await ok('pack: a link to a missing conclusion step is refused', async () => {
  const src = copy('noconcl', 's-k3f9q2:concl');
  const f = path.join(path.dirname(src), 'deck.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<div class="concl">ズレの測り方で代表値が決まる。</div>', ''));
  const n = path.join(path.dirname(src), 'narration.md');
  fs.writeFileSync(n, fs.readFileSync(n, 'utf8').replace('[concl] ズレの測り方で代表値が決まります。\n', ''));
  await assert.rejects(PF.exportPortable(nodeEnv, src, { fromFolder: true }), (e) => e.code === 'article-invalid' && e.details.some((x) => x.code === 'articleStep' && x.data.why === 'concl'));
});
await ok('npm run portable -- pack prints the citeproc-js credit when citeproc formatted citations (not as a warning), and the file does not carry it', async () => {
  const src = copy('credit', 's-k3f9q2:1');
  const out = path.join(work, 'credit.ega.html');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', path.dirname(src), '-o', out], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n').filter((l) => l === CITEPROC_CREDIT).length, 1, r.stdout);
  assert.ok(!r.stderr.includes('citeproc'), 'not on the warning stream');
  assert.ok(!fs.readFileSync(out, 'utf8').includes('citeproc'), 'the file carries no credit');
  const n = copy('credit-none', 's-k3f9q2:1');
  const f = path.join(path.dirname(n), 'article', '01.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(' [@doe2001, p. 3]', ''));
  fs.rmSync(path.join(path.dirname(n), 'references.json'));
  const rn = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', path.dirname(n), '-o', path.join(work, 'none.ega.html')], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(rn.status, 0, rn.stderr);
  assert.ok(!rn.stdout.includes('citeproc'), 'no credit without citations');
});
// 人から届いた本（tools/hostile-book.mjs）：check は安全に読めない段落を読まずに articleUnsafeParagraph で知らせ（章・行・節）、止まらない。ふつうの本は今までどおり
await ok('check: a book from someone else with unsafe paragraphs is reported by file, line and section, without hanging', async () => {
  const src = copy('hostile', 's-k3f9q2:1');
  const want = hostileChapters(path.dirname(src));
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), src, '--json'], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120000 });
  assert.equal(r.error, undefined, 'no hang (120 s)');
  assert.equal(r.status, 1, 'check fails');
  const res = JSON.parse(r.stdout).results;
  const u = res.filter((x) => x.code === 'articleUnsafeParagraph');
  assert.deepStrictEqual(u.map((x) => [x.sev, x.data.file, x.data.line, x.data.what, x.data.heading]), want.map((w) => ['error', w.file, w.line, w.what, w.heading]));
  assert.ok(u[0].msg.includes(`${want[0].file} ${want[0].line} 行目：節「${want[0].heading}」の段落「"a "a`), u[0].msg.slice(0, 200));
  const n = copy('hostile-normal', 's-k3f9q2:1');
  const rn = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), n, '--json'], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120000 });
  assert.ok(!JSON.parse(rn.stdout).results.some((x) => x.code === 'articleUnsafeParagraph' || (x.sev === 'error' && /^article/.test(x.code || ''))), 'the normal book: no book error');
  console.log(`  (check of the hostile book: ${Date.now() - t0} ms with the normal one)`);
});
if (!process.argv[2]) fs.rmSync(work, { recursive: true, force: true });
console.log(failed ? `article steps: ${failed} failed` : 'article steps: all ok');
process.exit(failed ? 1 : 0);
