// しおりを付けるときの既定の名前（handoff #89）：kit/core/bookmark.mjs の bookmarkDefault
//   node tools/test-bookmark-default.mjs
// test-all: unit
// 見出しを 20 字（code point）で切る・空白を 1 つにする・ほかのスライドのしおりと同じなら後ろに「 2」「 3」…を足して 20 字に収める（bookmarkDup を出さない）・見出しがなければ ''
import assert from 'node:assert/strict';
import { bookmarkDefault, bookmarkFindings, bookmarkLength, BOOKMARK_MAX } from '../kit/core/bookmark.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok   ' + name); };

t('the heading as it is', () => assert.equal(bookmarkDefault('結果の表'), '結果の表'));
t('spaces folded and trimmed', () => assert.equal(bookmarkDefault('  Results \n  table '), 'Results table'));
t('cut to 20 characters (code points)', () => {
  const h = 'あいうえおかきくけこさしすせそたちつてとなにぬ';
  assert.equal(bookmarkDefault(h), h.slice(0, 20));
  assert.equal(bookmarkLength(bookmarkDefault('😀'.repeat(25))), BOOKMARK_MAX);
});
t('no trailing space after the cut', () => assert.equal(bookmarkDefault('a'.repeat(19) + ' bcd'), 'a'.repeat(19)));
t('empty heading gives an empty name', () => { assert.equal(bookmarkDefault(''), ''); assert.equal(bookmarkDefault(null), ''); assert.equal(bookmarkDefault('   '), ''); });
t('a taken name gets a number', () => {
  assert.equal(bookmarkDefault('付録', ['付録']), '付録 2');
  assert.equal(bookmarkDefault('付録', ['付録', '付録 2']), '付録 3');
  assert.equal(bookmarkDefault('付録', ['結果の表']), '付録');
});
t('a numbered name stays within 20 characters', () => {
  const h = 'あいうえおかきくけこさしすせそたちつてと';
  const d = bookmarkDefault(h, [h]);
  assert.equal(d, h.slice(0, 18) + ' 2');
  assert.equal(bookmarkLength(d), BOOKMARK_MAX);
});
t('taken names are compared after folding spaces', () => assert.equal(bookmarkDefault('A  B', [' A B ']), 'A B 2'));
t('two slides with the same heading: no bookmarkDup', () => {
  const first = bookmarkDefault('結果');
  const second = bookmarkDefault('結果', [first]);
  const src = `<div id="stage"><section class="slide" data-bookmark="${first}"><h2>結果</h2></section><section class="slide" data-bookmark="${second}"><h2>結果</h2></section></div>`;
  assert.deepEqual(bookmarkFindings(src), []);
});
console.log(`\nall ok (${n})`);
