// パーツの static shape の読み方（tools/make-llm-guide.mjs の staticShape。handoff #64）の試験
// test-all: unit
//   node tools/test-static-shape.mjs
// vm で読んだクラスに static shape がないと、仮の物（Proxy の関数）が返ることがある。そのときは「<名前>: no static shape」と言って止まる
// （前は shapeExample の .replace の中で、何が悪いのか分からない形で落ちた。パーツ集 2.17 の候補の m-scroll）
import assert from 'node:assert/strict';
import { staticShape } from './make-llm-guide.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };
const P = new Proxy(function () {}, { get: () => P });

ok('a plain object is the shape; no class or no shape gives none', () => {
  const sh = { schema: null, example: '<m-scroll steps="3"></m-scroll>' };
  assert.equal(staticShape({ shape: sh }, 'm-scroll'), sh);
  assert.equal(staticShape({}, 'm-scroll'), undefined);
  assert.equal(staticShape(null, 'm-scroll'), undefined);
});
ok('a function or a Proxy of one (the vm stand-in) stops with "<name>: no static shape"', () => {
  assert.throws(() => staticShape({ shape: P }, 'm-scroll'), /^Error: m-scroll: no static shape/);
  assert.throws(() => staticShape({ shape: () => 1 }, 'm-x'), /m-x: no static shape/);
  assert.throws(() => staticShape({ shape: 'x' }, 'm-x'), /m-x: no static shape/);
});
console.log(`test-static-shape: ${n} ok`);
