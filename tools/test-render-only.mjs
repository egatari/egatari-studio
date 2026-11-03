// render.mjs の --only（render/only.mjs）の試験：段階の鍵・スライドの鍵・スライドの id、どれにも当たらない字はエラーで使える鍵を示す
// test-all: unit（引数なし）
//   node tools/test-render-only.mjs
import assert from 'node:assert/strict';
import { resolveOnly, unknownOnlyMessage } from '../render/only.mjs';

let n = 0, fail = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const tl = [
  { i: 0, key: '更新の式:0', slideKey: '更新の式' }, { i: 0, key: '更新の式:1', slideKey: '更新の式' }, { i: 0, key: '更新の式:concl', slideKey: '更新の式' },
  { i: 1, key: 'intro:0', slideKey: 'intro' }, { i: 2, key: 'data-key-slide:0', slideKey: 'data-key-slide' }, { i: 2, key: 'data-key-slide:1', slideKey: 'data-key-slide' },
];
const ids = [null, 'intro', 's-k3f9q2'];

t('段階の鍵は今までどおり', () => {
  const r = resolveOnly(['更新の式:1', '更新の式:concl'], tl, ids);
  assert.deepEqual([...r.keys], ['更新の式:1', '更新の式:concl']);
  assert.deepEqual(r.unknown, []);
});
t('スライドの鍵はそのスライドの全段階', () => {
  assert.deepEqual([...resolveOnly(['更新の式'], tl, ids).keys], ['更新の式:0', '更新の式:1', '更新の式:concl']);
});
t('スライドの id（鍵と違うとき）も全段階', () => {
  assert.deepEqual([...resolveOnly(['s-k3f9q2'], tl, ids).keys], ['data-key-slide:0', 'data-key-slide:1']);
});
t('スライドと段階の混在・重複', () => {
  const r = resolveOnly(['intro', '更新の式:0', '更新の式:0', 'intro'], tl, ids);
  assert.deepEqual([...r.keys].sort(), ['intro:0', '更新の式:0']);
});
t('当たらない字は unknown：スライドの鍵だけが一部当たっても残りは報せる', () => {
  const r = resolveOnly(['intro', 'nope', '更新の式:9'], tl, ids);
  assert.deepEqual(r.unknown, ['nope', '更新の式:9']);
  assert.deepEqual(r.valid, ['更新の式', 'intro', 'data-key-slide']);
});
t('エラーの文に使えるスライドの鍵を載せる（多ければ省く）', () => {
  const m = unknownOnlyMessage(['nope'], ['更新の式', 'intro'], 8);
  assert.ok(m.includes('nope') && m.includes('更新の式, intro') && m.includes('matches no slide or step'), m);
  const many = unknownOnlyMessage(['x'], Array.from({ length: 12 }, (_, i) => `s${i}`), 8);
  assert.ok(many.includes('s7') && !many.includes('s8,') && many.includes('4 more'), many);
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
