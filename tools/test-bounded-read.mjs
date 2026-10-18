// 上限つきの読み取り（kit/bounded-read.mjs・app/bounded-read.js・kit/core/bounded-read-core.mjs）と、それを通す読み取りの単体の試験（ブラウザなし）
//   node tools/test-bounded-read.mjs
// Codex の 6 回目の指摘（2026-10-18）の 2〜6 を確かめる（1 は test-workspace）。大きなファイルは中身が 0 の疎なファイル（ftruncate。ディスクを
// 使わない）にし、読まずに断ること（子の process の最大 RSS が小さいまま）を見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MiB = 1048576;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-bounded-'));
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const sparse = (f, n) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, n); fs.closeSync(fd); return f; };
const DECK = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide"><h2>x</h2></section></div></body></html>';
let nDeck = 0;
const deckDir = (files = {}) => {
  const d = path.join(tmp, 'd' + nDeck++); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'deck.html'), DECK);
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  return d;
};
// 子の process で動かし、最後の行の JSON を返す（{m, ms, rss（KiB）}）
const child = (code, timeout = 60000) => {
  const rr = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout });
  try { return JSON.parse(rr.stdout.trim().split('\n').pop()); } catch { return { m: rr.error && rr.error.code === 'ETIMEDOUT' ? 'hung (timeout)' : 'no result: ' + String(rr.stderr).slice(0, 300) }; }
};
const mod = (p) => JSON.stringify(path.join(ROOT, p));

// ---------------------------------------------------------------- 3. 読める層と索引
ok('持ち運べる形式の書き出し：実体参照で膨らむ読める層を、作る前に（数えながら）組んだ文書の上限で断る（指摘 3）', async () => {
  const core = await import('../kit/core/build-core.mjs');
  const { nodeEnv, buildPortable } = await import('../kit/build.mjs');
  // 口述原稿は「&」が 1 MiB：組んだデッキ（JSON の中）では 1 倍、読める層（&amp;）では 5 倍
  const d = deckDir({ 'narration.md': '# n\n\n## x\n[0] ' + '&'.repeat(MiB) + '\n' });
  const f = path.join(d, 'deck.html');
  const r = core.build(nodeEnv, f, { subset: false, budget: core.buildBudget({}), audioRef: () => 'x' });
  // 組んだ出力と塊は入るが、膨らんだ読める層（5 MiB 余り）は入らない上限
  const limits = { bundledChars: r.html.length + 3 * MiB };
  let e = null; try { await buildPortable(f, { subset: false, limits }); } catch (x) { e = x; }
  assert.ok(e && e.code === 'build-too-large' && /readable layer/.test(e.message), String(e && e.message));
  assert.ok(!fs.existsSync(path.join(d, 'out')));
  // 同じものは既定の上限で書き出せる（読める層は 5 倍に膨らむ）
  const ok2 = await buildPortable(f, { subset: false });
  assert.ok(ok2.html.includes('&amp;'.repeat(1000)));
});
ok('持ち運べる形式の書き出し：索引は JSON にする前に大きさを見積もり、読み手の上限（indexBytes）を超えるなら作らずに断る（指摘 3）', async () => {
  const { buildPortable } = await import('../kit/build.mjs');
  const { LIMITS, jsonLowerBound } = await import('../kit/core/portable.mjs');
  assert.equal(jsonLowerBound({ a: [1, 'xy', null], b: { c: true } }), JSON.stringify({ a: [1, 'xy', null], b: { c: true } }).length);
  assert.ok(jsonLowerBound({ s: 'x'.repeat(100) }, 10) > 10);
  const d = deckDir({ 'narration.md': '# n\n\n## x\n[0] hello\n' });
  // 読み取った文書の知らない項目（carry）は残す：5 MiB の知らない項目で索引が 4 MiB を超える
  let e = null; try { await buildPortable(path.join(d, 'deck.html'), { subset: false, carry: { 'x-junk': 'j'.repeat(LIMITS.indexBytes + MiB) } }); } catch (x) { e = x; }
  assert.ok(e && e.code === 'build-too-large' && /portable index/.test(e.message), String(e && e.message));
});

let n = 0;
for (const [name, fn] of tests) {
  try { await fn(); n++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}`); console.log(e && e.stack ? e.stack : e); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`bounded-read: ${n}/${tests.length} ok`);
process.exit(n === tests.length ? 0 : 1);
