// 縦と横の入れ替わり（kit/core/tate-mix.mjs、handoff #70）の試験
// test-all: unit
//   node tools/test-tate-mix.mjs
import assert from 'node:assert/strict';
import { tateMixFindings, tateSwitches, TATE_SWITCH_MAX } from '../kit/core/tate-mix.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { message } from '../kit/check-messages.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };
// t：縦、y：横、c：表紙、s：扉
const deck = (pat) => '<html lang="ja"><body><div id="stage">' + [...pat].map((c, i) => {
  const cls = c === 't' ? 'slide layout-tate' : c === 'c' ? 'slide cover' : c === 's' ? 'slide sec' : 'slide';
  return `<section class="${cls}" id="s${i}"><h2>見出し${i}</h2></section>`;
}).join('') + '</div></body></html>';

ok('the slide analysis tells vertical slides and the cover and dividers', () => {
  const s = analyzeSlideIds(deck('cyts')).slides;
  assert.deepEqual(s.map((x) => [x.tate, x.cover]), [[false, true], [false, false], [true, false], [false, true]]);
});
ok(`switches are counted without the cover and dividers; ${TATE_SWITCH_MAX} or more warns once, at the first switch`, () => {
  assert.equal(tateSwitches(analyzeSlideIds(deck('ctytyt')).slides).n, 4);   // 竹取物語の例のような交互
  assert.equal(tateSwitches(analyzeSlideIds(deck('cttttyy')).slides).n, 1);   // 本文は縦、図の 2 枚をまとめて横
  assert.equal(tateSwitches(analyzeSlideIds(deck('ctsts')).slides).n, 0);    // 扉は数えない
  assert.deepEqual(tateMixFindings(deck('ctytyt')), [{ i: 2, sev: 'warn', code: 'tateMixed', a: { n: 4 } }]);
  assert.deepEqual(tateMixFindings(deck('ctyty')), [{ i: 2, sev: 'warn', code: 'tateMixed', a: { n: 3 } }]);
  assert.deepEqual(tateMixFindings(deck('ctyt')), []);
  assert.deepEqual(tateMixFindings(deck('cyyyy')), []);
});
ok('the message (ja, en)', () => {
  assert.match(message('ja', 'tateMixed', { n: 4 }), /^縦書きと横書きのスライドが 4 回入れ替わります（表紙と扉を除く）。/);
  assert.match(message('en', 'tateMixed', { n: 4 }), /^Vertical and horizontal slides switch 4 times/);
});
console.log(`test-tate-mix: ${n} ok`);
