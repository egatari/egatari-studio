// m-codetree の試験（ブラウザなし）：符号表から木を作ること、MH の復号（白から始めて交互、メイクアップ符号の後は同じ色、EOL の後は白）、誤り
//   node tools/test-codetree.mjs
// 部品の index.js を Node の vm で読み（DECK.MotionElement がないので部品は定義せず、DECK.codetree だけを出す）。
// 表は見本（components/codetree/demo.html）の ITU-T T.4 の MH 符号をそのまま使う。描画・決定性は tools/test-components.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ctx = { window: { DECK: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'codetree', 'index.js'), 'utf8'), ctx, { filename: 'codetree/index.js' });
const C = ctx.window.DECK.codetree;
const demo = fs.readFileSync(path.join(ROOT, 'components', 'codetree', 'demo.html'), 'utf8');
const MH = JSON.parse(demo.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1]).table;
const T = C.build(MH);
let n = 0, fail = 0;
const t = (name, fn) => {
  n++;
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
// vm の中の配列は別の realm なので、比べる前に写す
const J = (x) => JSON.parse(JSON.stringify(x));
const walk = (root, code) => { let x = root; for (const b of code) x = x && x.kids[+b]; return x; };
const leaves = (x) => (x.leaf ? 1 : 0) + x.kids.reduce((a, k) => a + (k ? leaves(k) : 0), 0);
const toks = (r) => r.tokens.map((x) => (x.color === 'white' ? 'W' : 'B') + x.run).join(' ');
const D = (bits, tree = T) => C.decode(tree, bits);

// ---------------------------------------------------------------- 木
t('表の数だけ葉がある（白・黒とも 終端 64 + メイクアップ 27 + EOL）', () => {
  assert.equal(MH.length, 92);
  assert.equal(leaves(T.white), 92); assert.equal(leaves(T.black), 92);
});
t('符号をたどると葉に着く（白 0111 = 2、白 11011 = 64、黒 11 = 2、黒 0000001111 = 64）', () => {
  assert.equal(walk(T.white, '0111').leaf.run, 2);
  assert.equal(walk(T.white, '11011').leaf.run, 64);
  assert.equal(walk(T.white, '11011').leaf.kind, 'makeup');
  assert.equal(walk(T.black, '11').leaf.run, 2);
  assert.equal(walk(T.black, '0000001111').leaf.run, 64);
  assert.equal(walk(T.white, '000000000001').leaf.kind, 'eol');
});
t('途中の節は葉でなく、子を持つ', () => {
  const x = walk(T.white, '1101');
  assert.equal(x.leaf, null); assert.ok(x.kids[0] && x.kids[1]);
});
t('{white: {符号: ラン}, black: …} の形でも同じ木', () => {
  const o = { white: {}, black: {} };
  for (const r of MH) { o.white[r.white] = r.run; o.black[r.black] = r.run; }
  const U = C.build(o);
  assert.equal(walk(U.white, '0111').leaf.run, 2);
  assert.equal(toks(D('11011011111', U)), toks(D('11011011111')));
});
t('頭が重なる符号は誤り（語頭符号でない）', () => {
  assert.throws(() => C.build({ white: { '01': 1, '011': 2 }, black: { '1': 1 } }), /語頭符号でない|重なる/);
  assert.throws(() => C.build({ white: { '011': 2, '01': 1 }, black: { '1': 1 } }), /重なる/);
  assert.throws(() => C.build({ white: { '0a': 1 }, black: {} }), /0 と 1/);
  assert.throws(() => C.build([{ run: -1, white: '1' }]), /0 以上の整数/);
});

// ---------------------------------------------------------------- 復号
t('11011011111 → 白 64（メイクアップ）・白 2・黒 2', () => {
  const r = D('11011011111');
  assert.equal(toks(r), 'W64 W2 B2');
  assert.deepEqual(J(r.tokens.map((x) => x.kind)), ['makeup', 'term', 'term']);
  assert.deepEqual(J(r.tokens.map((x) => [x.start, x.end])), [[0, 5], [5, 9], [9, 11]]);
  assert.equal(r.error, null); assert.equal(r.next, 'white');
});
t('終端符号ごとに白と黒が入れ替わる（白から始める）', () => {
  assert.equal(toks(D('1000 011 0111 0010')), 'W3 B4 W2 B6');
  // 同じ 2 ビット 11 でも、白の木では途中の節、黒の木では 2
  assert.equal(toks(D('0111 11 0111')), 'W2 B2 W2');
});
t('メイクアップ符号の後は同じ色の終端符号（黒 64 + 黒 0）、ランは 1 つにまとまる', () => {
  const r = D('00110101 0000001111 0000110111');
  assert.equal(toks(r), 'W0 B64 B0');
  assert.deepEqual(J(C.runs(r.tokens).map((x) => [x.color, x.len, x.toks.length])), [['white', 0, 1], ['black', 64, 2]]);
  assert.deepEqual(J(C.runs(D('11011011111').tokens).map((x) => [x.color, x.start, x.len])), [['white', 0, 66], ['black', 66, 2]]);
});
t('EOL の後は白から', () => {
  assert.equal(toks(D('0111 11 000000000001 1000')), 'W2 B2 WEOL W3');
  assert.equal(D('0111 000000000001 1000').tokens[2].color, 'white');
});
t('表にない符号：その桁と色を返す', () => {
  const small = C.build({ white: { '1': 1, '01': 2, '001': 3, '0001': 64 }, black: { '1': 1, '01': 2, '001': 3 } });
  const r = D('01 1 0001 001 000', small);
  assert.equal(toks(r), 'W2 B1 W64 W3');
  assert.deepEqual(J([r.error.kind, r.error.pos, r.error.start, r.error.color, r.error.code]), ['invalid', 12, 10, 'black', '000']);
});
t('系列が符号の途中で終わる', () => {
  const r = D('0111 0');
  assert.equal(toks(r), 'W2');
  assert.deepEqual(J([r.error.kind, r.error.color, r.error.code]), ['incomplete', 'black', '0']);
});
t('メイクアップ符号で終わると知らせる', () => {
  const r = D('11011');
  assert.equal(toks(r), 'W64');
  assert.equal(r.error.kind, 'dangling');
});
t('bits は 0 と 1 だけ（空白は読み飛ばす）', () => {
  assert.throws(() => D('0112'), /0 と 1/);
  assert.equal(D(' 1101 1 ').tokens.length, 1);
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
