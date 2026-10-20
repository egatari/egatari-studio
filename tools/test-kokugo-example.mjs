// 見本のデッキ examples/kokugo-kanbun の漢文が、部品庫の m-kanbun（vendor/components の既定の版）で知らせなしに読めること（ブラウザなし）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-kokugo-example.mjs
// 部品そのものの試験（訓読の順・書き下し文・m-kobun・m-gendai の読み取り）は egatari/components の tools/test-kokugo.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { ROOT, vendorComponents } from './vendor-components.mjs';

const kb = vendorComponents().find((c) => c.name === 'kanbun');
const ctx = { window: { DECK: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(kb.dir, 'index.js'), 'utf8'), ctx, { filename: 'kanbun/index.js' });
const K = ctx.window.DECK.kanbun;
const warnings = (src) => { const p = K.parse(src); return [...p.warnings, ...K.order(p.chars).warnings]; };
const html = fs.readFileSync(path.join(ROOT, 'examples/kokugo-kanbun/deck.html'), 'utf8');
const srcs = [...html.matchAll(/<m-kanbun[^>]*>([\s\S]*?)<\/m-kanbun>/g)].map((m) => m[1]);
assert.ok(srcs.length >= 5, 'the example has m-kanbun figures');
let fail = 0;
for (const s of srcs) {
  const w = warnings(s).join(' / ');
  if (w) { fail++; console.log(`FAIL ${s.trim().split('\n')[0]}: ${w}`); }
}
console.log(fail ? `\nFAIL: ${fail}` : `ok   examples/kokugo-kanbun: ${srcs.length} kanbun figures read without warnings (m-kanbun ${kb.version})`);
process.exit(fail ? 1 : 0);
