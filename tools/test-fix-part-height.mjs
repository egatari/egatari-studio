// 修正依頼の、はみ出したパーツの高さの値（kit/core/llm-fix.mjs の partHeightHint、backlog #224）の試験
// test-all: unit
//   node tools/test-fix-part-height.mjs
// 1. 本文が下にはみ出し、はみ出した箱がパーツで style="height:…px" があれば、その属性を名指しし、はみ出した分を引いて 10 px に切り下げた値を添える
// 2. コマンド版（data が {px, lim, part}）と編集アプリ（data が「583 > 565」、part は別の欄）のどちらでも
// 3. 同じパーツが 2 つあれば index のものを、height のないパーツ・パーツでない箱・右のはみ出しには添えない
import assert from 'node:assert/strict';
import { partHeightHint, buildFixRequest } from '../kit/core/llm-fix.mjs';
import { sectionsOf } from '../kit/core/llm-import.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };
const deck = '<section class="slide" id="tree"><h2>木</h2><div class="body"><m-tree style="height:380px" data-x></m-tree></div></section>\n'
  + '<section class="slide" id="two"><h2>2 つ</h2><div class="body"><m-bars style="height: 200px"></m-bars><m-bars style="width:500px;height:260px"></m-bars><m-flow></m-flow></div></section>';
const secs = sectionsOf(deck);

ok('CLI data: 1 px over → height:380px → 370px (ja and en)', () => {
  const p = { code: 'bodyBottom', id: 'tree', data: { px: 566, lim: 565, part: { tag: 'm-tree' } } };
  assert.equal(partHeightHint(p, deck, secs, 'ja'), 'm-tree の style の height:380px を height:370px にする');
  assert.equal(partHeightHint(p, deck, secs, 'en'), 'in m-tree, change style height:380px to height:370px');
});
ok('editor data: "585 > 565" with the part beside it → 350px', () => {
  assert.equal(partHeightHint({ code: 'overflowBottom', id: 'tree', data: '585 > 565', part: { tag: 'm-tree' } }, deck, secs, 'en'), 'in m-tree, change style height:380px to height:350px');
});
ok('the second of two parts of the same kind (index 1)', () => {
  assert.equal(partHeightHint({ code: 'bodyBottom', id: 'two', data: { px: 600, lim: 565, part: { tag: 'm-bars', index: 1 } } }, deck, secs, 'en'), 'in m-bars, change style height:260px to height:220px');
});
ok('nothing without a height, without a part, or for a right overflow', () => {
  assert.equal(partHeightHint({ code: 'bodyBottom', id: 'two', data: { px: 600, lim: 565, part: { tag: 'm-flow' } } }, deck, secs, 'en'), '');
  assert.equal(partHeightHint({ code: 'bodyBottom', id: 'tree', data: { px: 600, lim: 565 } }, deck, secs, 'en'), '');
  assert.equal(partHeightHint({ code: 'bodyRight', id: 'tree', data: { px: 1300, lim: 1188, part: { tag: 'm-tree' } } }, deck, secs, 'en'), '');
});
ok('the fix request carries the value after the amount', () => {
  const req = buildFixRequest({ problems: [{ sev: 'error', i: 0, title: '木', code: 'bodyBottom', text: '本文が下に 1 px はみ出す', data: { px: 566, lim: 565, part: { tag: 'm-tree' } } }], deck, lang: 'ja' });
  assert.match(req.text, /本文を 1 px[^\n]*。m-tree の style の height:380px を height:370px にする/);
});
console.log(`fix-part-height: ${n} ok`);
