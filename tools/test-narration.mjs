// 口述原稿の parser の単体の検査（kit/narration.mjs）
//   node tools/test-narration.mjs
import assert from 'node:assert/strict';
import { parseNarration, segDigest, joinLines, marksMap, narrationMap } from '../kit/narration.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };

ok('英語の続きの行は空白 1 つで繋ぐ', () => {
  const [s] = parseNarration('## A\n[0] Hello\nworld, this is\n  a test.\n');
  assert.equal(s.turns[0].display, 'Hello world, this is a test.');
  assert.equal(s.turns[0].tts, 'Hello world, this is a test.');
});
ok('日本語の続きの行は詰めて繋ぐ', () => {
  const [s] = parseNarration('## A\n[0] 勾配降下法は、\n損失を下げる方法です。\n');
  assert.equal(s.turns[0].display, '勾配降下法は、損失を下げる方法です。');
});
ok('CJK と英数の境目は詰める（従来どおり）', () => {
  assert.equal(joinLines('学習率は', '0.1 です'), '学習率は0.1 です');
  assert.equal(joinLines('rate 0.1', 'です'), 'rate 0.1です');
  assert.equal(joinLines('step 1', '2 more'), 'step 1 2 more');
  assert.equal(joinLines('end.', '{cue}Next'), 'end. {cue}Next');
});
ok('日本語の digest は折り返しの有無で変わらない', () => {
  const a = parseNarration('## A\n[0] 今回は、\n勾配降下法の{cue}基本を説明します。\n')[0];
  const b = parseNarration('## A\n[0] 今回は、勾配降下法の{cue}基本を説明します。\n')[0];
  assert.equal(segDigest(a), segDigest(b));
});
ok('話者の行はそれぞれ別のターン', () => {
  const [s] = parseNarration('## A\n[1] Expert: One\ntwo\nNovice: three\n');
  assert.deepEqual(s.turns.map((t) => [t.role, t.display]), [['expert', 'One two'], ['novice', 'three']]);
});
ok('同じ段階が 2 回あれば後のものが勝つ（原稿・注目の演出とも）', () => {
  const segs = parseNarration('## A\n[1] {mark:x}first\n[2] other\n[1] second\n');
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map((s) => s.stepKey), ['2', '1']);
  assert.equal(narrationMap(segs).A['1'][0].text, 'second');
  assert.equal(marksMap(segs)['A:1'], undefined);
  assert.equal(segs.warnings.length, 1);
  assert.match(segs.warnings[0], /A:1/);
});
ok('重複がなければ warnings は空', () => {
  assert.deepEqual(parseNarration('## A\n[0] x\n').warnings, []);
});
console.log(`narration: ${n} ok`);
