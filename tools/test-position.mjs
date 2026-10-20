// 位置の置き場（kit/core/position.mjs の PositionStore）と、それを実行系の <script> に入れる形（kit/core/build-core.mjs の classicModule）の単体の検査
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-position.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createPositionStore } from '../kit/core/position.mjs';
import { classicModule } from '../kit/core/build-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = fs.readFileSync(path.join(ROOT, 'kit', 'core', 'position.mjs'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function exercise(make, label) {
  const P = make(), got = [];
  ok(same(P.snapshot(), { i: 0, k: 0, t: null, playing: false, cause: null, depth: 0, top: null }), `${label}：初めは (0, 0)・t null・止まっている・跡なし`);
  const off = P.subscribe((p) => got.push(p));
  P.at(3, 2);
  ok(got.length === 0 && P.i === 3 && P.k === 2, `${label}：描いた位置（at）は知らせない`);
  P.setT(0); P.setPlaying(1); P.setCause('link');
  P.publish();
  ok(got.length === 1 && same(got[0], { i: 3, k: 2, t: 0, playing: true, cause: 'link', depth: 0, top: null }), `${label}：publish で今の写しを配る`);
  P.setCause(undefined);
  ok(P.cause === null, `${label}：cause の undefined は null`);
  const e1 = { i: 1, k: 0 }, e2 = { i: 2, k: 1 };
  ok(P.push(e1) === 1 && P.push(e2) === 2 && P.depth === 2 && P.top() === e2, `${label}：戻るの跡を積む（項目はそのまま）`);
  P.publish();
  ok(got[1].depth === 2 && got[1].top === e2, `${label}：写しに跡の深さと最後の項目`);
  ok(P.pop() === e2 && P.pop() === e1 && P.pop() === null && P.depth === 0 && P.top() === null, `${label}：跡を戻る（空なら null）`);
  const order = [];
  P.subscribe(() => order.push('b'));
  P.subscribe(() => order.push('c'));
  off();
  P.publish();
  ok(got.length === 2 && order.join('') === 'bc', `${label}：購読をやめた者には配らず、ほかは登録の順`);
  const P2 = make();
  P2.subscribe(() => { throw new Error('boom'); });
  let threw = false;
  try { P2.publish(); } catch (e) { threw = e.message === 'boom'; }
  ok(threw, `${label}：購読者の例外は呼んだ側へ（deck.js の broadcast と同じ）`);
  ok(make() !== make() && (() => { const a = make(), b = make(); a.at(5, 5); return b.i === 0; })(), `${label}：Store ごとに別の状態`);
}

exercise(createPositionStore, 'ESM');

// 実行系に入れる形：即時関数の中で読み、DECK.PositionStore だけを足す（窓のグローバルを増やさない）
const classic = classicModule(SRC, 'PositionStore');
const ctx = { DECK: {} };
vm.createContext(ctx);
vm.runInContext(classic, ctx, { filename: 'position (classic)' });
ok(typeof ctx.DECK.PositionStore === 'function', '組み込む形：DECK.PositionStore になる');
ok(Object.keys(ctx).sort().join(',') === 'DECK', '組み込む形：ほかのグローバルを作らない');
exercise(ctx.DECK.PositionStore, '組み込む形');
let rej = 0;
for (const bad of [`import x from 'y';\n${SRC}`, `${SRC}\nexport function other() {}`, `${SRC}\nexport const z = 1;`, 'function f() {}']) {
  try { classicModule(bad, 'X'); } catch { rej++; }
}
ok(rej === 4, `組み込む形：import・2 つ目の export・export function がないものは止める（${rej}/4）`);

// kit/core の約束：DOM・時計・Node に触れない（編集アプリと共有する純ロジック）
const code = SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const banned = ['document', 'window', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance', 'Date', 'process', 'node:', 'Math.random'];
const used = banned.filter((w) => code.includes(w));
ok(used.length === 0, 'position.mjs は DOM・時計・Node を使わない' + (used.length ? '：' + used.join(', ') : ''));

console.log(fails ? `${fails} 件の失敗` : 'すべて通過');
process.exit(fails ? 1 : 0);
