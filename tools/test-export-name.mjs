// 書き出すファイルの既定の名前（kit/core/export-name.mjs：教材の題名から、どの OS でも使える名前に）の単体の検査
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-export-name.mjs
import assert from 'node:assert/strict';
import { exportName, titleOf } from '../kit/core/export-name.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
const X = '.ega.html';

ok('題名をそのまま名前に', () => {
  assert.equal(exportName('勾配降下法の基本', 'deck', X), '勾配降下法の基本.ega.html');
  assert.equal(exportName('Egatari: a new format', 'deck', '.html'), 'Egatari a new format.html');
});
ok('<title> を読む（タグを除き、文字参照を戻す）', () => {
  assert.equal(titleOf('<html><head><title>A &amp; B &#x3042; &lt;x&gt;</title></head></html>'), 'A & B あ <x>');
  assert.equal(titleOf('<title>\n  Two\n  lines </title>'), 'Two lines');
  assert.equal(titleOf('<html></html>'), '');
});
ok('どの OS でも使えない字を除く', () => {
  assert.equal(exportName('a/b\\c:d*e?f"g<h>i|j', 'deck', X), 'a b c d e f g h i j.ega.html');
  assert.equal(exportName('x\u0000y\u001fz‮q', 'deck', X), 'x y z q.ega.html');
  assert.equal(exportName('  ..hidden. . ', 'deck', X), 'hidden.ega.html');
  assert.equal(exportName('...', 'deck', X), 'deck.ega.html');
});
ok('予約の名前（Windows）は避ける', () => {
  assert.equal(exportName('CON', 'deck', X), 'CON_.ega.html');
  assert.equal(exportName('nul.txt', 'deck', X), 'nul.txt_.ega.html');
  assert.equal(exportName('COM1', 'deck', X), 'COM1_.ega.html');
  assert.equal(exportName('Console', 'deck', X), 'Console.ega.html');
});
ok('長い題名は 80 字・255 バイトに収める（字の途中で切らない）', () => {
  const a = exportName('a'.repeat(300), 'deck', X);
  assert.equal(a, 'a'.repeat(80) + X);
  const j = exportName('漢'.repeat(100), 'deck', X);
  assert.ok(new TextEncoder().encode(j).length <= 255 && j.endsWith(X) && /^漢+\.ega\.html$/.test(j), j);
  const e = exportName('😀'.repeat(100), 'deck', X);
  assert.ok(new TextEncoder().encode(e).length <= 255 && /^(😀)+\.ega\.html$/u.test(e), e);
});
ok('題名がなければデッキの名前、それもなければ lesson', () => {
  assert.equal(exportName('', 'deck', X), 'deck.ega.html');
  assert.equal(exportName(undefined, 'talk', '.html'), 'talk.html');
  assert.equal(exportName('', '', X), 'lesson.ega.html');
});
ok('字は NFC にそろえる', () => {
  assert.equal(exportName('が', 'deck', X), 'が.ega.html');
});

console.log(`${n} ok`);
