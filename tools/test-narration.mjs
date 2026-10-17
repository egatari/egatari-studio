// 口述原稿の parser の単体の検査（kit/narration.mjs）
//   node tools/test-narration.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseNarration, segDigest, joinLines, marksMap, narrationMap, splitKey, parseHeading, normalizeKey, newSlideId, isSlideId,
  rewriteNarration, rawTurns, headingLine } from '../kit/narration.mjs';
import { annotate, analyzeSlideIds } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Etoki の仕様の試験用の入力と正解（narration.md・expected.json）の置き場所。ここだけを直せば移せる
const SPEC_INPUT_HASH = path.join(ROOT, 'vendor', 'etoki-spec', 'fixtures', 'input-hash');

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

// ---------------------------------------------------------------- スライドの鍵（Etoki 1.0 §8.1）
ok('鍵：{#id} が見出しの文字列より強い', () => {
  assert.deepEqual(parseHeading('更新の式 {#s-k3f9q2}'), { key: 's-k3f9q2', id: 's-k3f9q2', heading: '更新の式', badId: false });
  assert.equal(parseHeading('{#s-k3f9q2}').key, 's-k3f9q2');
  assert.equal(parseHeading('s-k3f9q2').key, 's-k3f9q2');                       // id だけの見出し
  assert.equal(parseHeading('Gradient <b>descent</b>&nbsp; rule').key, 'Gradientdescentrule');   // 旧い見出し：タグ・&nbsp;・空白を全部除く
  assert.equal(parseHeading('A　B\tC').key, 'ABC');
  assert.equal(parseHeading('x {#1bad}').badId, true);
  assert.equal(normalizeKey(' a  b '), 'ab');
});
ok('鍵：narration.md の見出しの 3 つの書き方', () => {
  const segs = parseNarration('## 更新の式 {#s-k3f9q2}\n[0] a\n## s-abc234\n[0] b\n## 旧い 見出し\n[0] c\n');
  assert.deepEqual(segs.map((s) => s.slideKey), ['s-k3f9q2', 's-abc234', '旧い見出し']);
  assert.deepEqual(segs.sections.map((s) => [s.key, s.id, s.heading]), [['s-k3f9q2', 's-k3f9q2', '更新の式'], ['s-abc234', null, 's-abc234'], ['旧い見出し', null, '旧い 見出し']]);
});
ok('鍵：id のあるスライドとないスライドが混ざったデッキ', () => {
  const deck = '<html><head></head><body><section class="slide" id="s-aaaaaa"><h2>表紙</h2></section><section class="slide"><h2>二 枚目</h2></section>' +
    '<section class="slide" id="third"><h2>三枚目</h2></section><section class="slide"><p>見出しなし</p></section></body></html>';
  const { slides } = annotate(deck, false, []);
  assert.deepEqual(slides.map((s) => [s.key, s.id]), [['s-aaaaaa', 's-aaaaaa'], ['二枚目', null], ['third', 'third'], ['s4', null]]);
  const a = analyzeSlideIds(deck);
  assert.deepEqual(a.slides.map((s) => s.key), ['s-aaaaaa', '二枚目', 'third', 's4']);
  assert.deepEqual(a.problems, []);
  const segs = parseNarration('## 表紙 {#s-aaaaaa}\n[0] a\n## 二 枚目\n[0] b\n## third\n[0] c\n');
  const keys = new Set(slides.map((s) => s.key));
  assert.ok(segs.every((s) => keys.has(s.slideKey)));
});
ok('鍵：id が data-key より強い（spec の data-key の規則）', () => {
  const { slides } = annotate('<html><head></head><body><section class="slide" data-key="old" id="s-new234"><h2>A</h2></section></body></html>', false, []);
  assert.equal(slides[0].key, 's-new234');
});
ok('検査：id の書式・鍵の重なり・id とほかの id の衝突', () => {
  const deck = '<html><head></head><body><section class="slide" id="9x"><h2>A</h2></section><section class="slide"><h2>B</h2></section><section class="slide"><h2>B</h2></section>' +
    '<section class="slide" id="eta"><h2>C</h2></section><section class="slide" id="grad"><h2>D \\(\\htmlId{grad}{x}\\)</h2></section><section class="slide" id="s-dup222"><h2>E</h2></section><section class="slide" id="s-dup222"><h2>F</h2></section>' +
    '<p><span id="eta">η</span></p></body></html>';
  const msgs = analyzeSlideIds(deck).problems.map((p) => p.msg);
  assert.ok(msgs.some((m) => /「9x」が規則に合わない/.test(m)), 'bad id');
  assert.ok(msgs.some((m) => /鍵「B」がスライド 2/.test(m)), 'dup heading key');
  assert.ok(msgs.some((m) => /「eta」がほかの id と重なる/.test(m)), 'id collision');
  assert.ok(msgs.some((m) => /「grad」がほかの id と重なる.*htmlId/.test(m)), 'htmlId collision');
  assert.ok(msgs.some((m) => /鍵「s-dup222」/.test(m)), 'dup id');
});
ok('鍵：__proto__ や constructor でも壊れない', () => {
  const segs = parseNarration('## __proto__\n[0] a\n## constructor\n[0] b\n## toString {#hasOwnProperty}\n[1] {mark:x}c\n');
  const m = narrationMap(segs);
  assert.equal(Object.getPrototypeOf(m), null);
  assert.equal(m.__proto__['0'][0].text, 'a');
  assert.equal(m.constructor['0'][0].text, 'b');
  assert.equal(m.hasOwnProperty['1'][0].text, 'c');
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype['0'], undefined);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(m))), ['__proto__', 'constructor', 'hasOwnProperty']);
  assert.ok(marksMap(segs)['hasOwnProperty:1']);
  assert.equal(narrationMap(parseNarration('## A\n[0] a\n')).constructor, undefined);
});
ok('段階の番号：[01] と [1000] は使わない', () => {
  const segs = parseNarration('## A\n[0] a\n[01] bad\ncontinued\n[1000] bad\n[999] ok\n[1] one\n');
  assert.deepEqual(segs.map((s) => [s.stepKey, s.turns.map((t) => t.display).join('|')]), [['0', 'a'], ['999', 'ok'], ['1', 'one']]);
  assert.equal(segs.warnings.filter((w) => /段階の番号/.test(w)).length, 2);
  assert.throws(() => rewriteNarration('## A\n', 'A', '01', [{ role: 'expert', text: 'x' }]));
  // [01] の行は前の段階の続きにならず、書き換えでも消えない
  const out = rewriteNarration('## A\n[0] a\n[01] keep\n', 'A', '0', [{ role: 'expert', text: 'b' }]);
  assert.equal(out, '## A\n[0] b\n[01] keep\n');
});
ok('鍵の分け方：最後の : で分ける（スライドの鍵に : があってもよい）', () => {
  assert.deepEqual(splitKey('s-k3f9q2:2'), ['s-k3f9q2', '2']);
  assert.deepEqual(splitKey('a:b:concl'), ['a:b', 'concl']);
  const segs = parseNarration('## 比:率 の話\n[2] x\n');
  assert.equal(segs[0].slideKey, '比:率の話');
  assert.deepEqual(splitKey(`${segs[0].slideKey}:${segs[0].stepKey}`), ['比:率の話', '2']);
  assert.deepEqual(rawTurns('## 比:率 の話\n[2] x\n', ...splitKey('比:率の話:2')).turns, [{ role: 'expert', text: 'x' }]);
});
ok('id を作る：s- と base32 の 6 字、重ならない', () => {
  const taken = new Set();
  for (let i = 0; i < 200; i++) { const id = newSlideId(taken); assert.match(id, /^s-[a-z2-7]{6}$/); assert.ok(isSlideId(id)); assert.ok(!taken.has(id)); taken.add(id); }
  // 乱数が使われている id を出したら引き直す
  let c = 0;
  assert.equal(newSlideId(new Set(['s-aaaaaa']), (n) => new Uint8Array(n).fill(c++ ? 1 : 0)), 's-bbbbbb');
});
ok('新しい節：id のあるスライドは「## 見出し {#id}」', () => {
  const order = [{ key: 's-aaaaaa', id: 's-aaaaaa', heading: '表紙' }, { key: 's-bbbbbb', id: 's-bbbbbb', heading: '二枚目 <b>x</b>' }, { key: '旧い見出し', id: null, heading: '旧い 見出し' }];
  let t = rewriteNarration('# 口述原稿\n\n## 表紙 {#s-aaaaaa}\n[0] a\n', 's-bbbbbb', '0', [{ role: 'expert', text: 'b' }], order);
  assert.equal(t, '# 口述原稿\n\n## 表紙 {#s-aaaaaa}\n[0] a\n\n## 二枚目 x {#s-bbbbbb}\n[0] b\n');
  t = rewriteNarration(t, '旧い見出し', '1', [{ role: 'expert', text: 'c' }], order);
  assert.match(t, /\n## 旧い 見出し\n\[1\] c\n$/);
  assert.equal(headingLine({ key: 's-cccccc', id: 's-cccccc', heading: '' }), '## s-cccccc');
  // 鍵の文字列の配列（以前の呼び方）も受け付ける
  assert.match(rewriteNarration('', 'X', '0', [{ role: 'expert', text: 'x' }], ['X']), /## X\n\[0\] x/);
});

// ---------------------------------------------------------------- 拡張の行（@x-名前-欄 値、Etoki 1.0 §8.2）
ok('拡張の行：発言の間・段階の初め・終わり。発言にも区切りにも digest にも入らない', () => {
  const src = '## A\n[0]\n@x-quiz-start yes\nExpert: one\n  @x-quiz-q What is {cue} η?\ncontinued\nNovice: two\n@x-quiz-q again\n@x-cap-style big bold  \n[1] three\n';
  const segs = parseNarration(src);
  const [s0, s1] = segs;
  assert.deepEqual(s0.turns.map((t) => [t.role, t.display]), [['expert', 'one continued'], ['novice', 'two']]);
  assert.deepEqual(s0.bounds, []);
  assert.deepEqual(s0.ext.map((x) => [x.name, x.field, x.value]), [['quiz', 'start', 'yes'], ['quiz', 'q', 'What is {cue} η?'], ['quiz', 'q', 'again'], ['cap', 'style', 'big bold  ']]);
  assert.deepEqual(s1.ext, []);
  const plain = parseNarration('## A\n[0]\nExpert: one\ncontinued\nNovice: two\n[1] three\n');
  assert.equal(segDigest(s0), segDigest(plain[0]));
  // 名前に - があるもの・欄の書式の外のものは拡張の行ではない（ふつうの続きの行）
  assert.equal(parseNarration('## A\n[0] a\n@x-a-b-c-d v\n')[0].ext[0].field, 'b-c-d');
  assert.equal(parseNarration('## A\n[0] a\n@x-Ab-c v\n')[0].ext.length, 0);
  assert.equal(parseNarration('## A\n@x-a-b v\n[0] a\n').warnings.length, 1);   // 段階の外
});
ok('拡張の行：CRLF でも読め、書き換えで位置・中身・改行が残る', () => {
  const src = '## A\r\n[0] one\r\n@x-quiz-q What?\r\n    Novice: two\r\n  @x-quiz-q again \r\n\r\n## B\r\n[1] x\r\n';
  const s = parseNarration(src)[0];
  assert.deepEqual(s.ext.map((x) => x.value), ['What?', 'again ']);
  assert.deepEqual(s.turns.map((t) => t.display), ['one', 'two']);
  const out = rewriteNarration(src, 'A', '0', [{ role: 'expert', text: 'ONE' }, { role: 'novice', text: 'TWO' }], []);
  assert.equal(out, '## A\r\n[0] Expert: ONE\r\n@x-quiz-q What?\r\n    Novice: TWO\r\n  @x-quiz-q again \r\n\r\n## B\r\n[1] x\r\n');
  // 段階の初めの拡張の行は「[k]」だけの行の後ろに残る。発言を空にしても残る
  const lead = rewriteNarration('## A\n[0]\n@x-a-b 1\nhi\n', 'A', '0', [{ role: 'expert', text: 'yo' }], []);
  assert.equal(lead, '## A\n[0]\n@x-a-b 1\n    yo\n');
  assert.deepEqual(parseNarration(lead)[0].turns.map((t) => t.display), ['yo']);
  assert.equal(rewriteNarration('## A\n[0] hi\n@x-a-b 1\n', 'A', '0', [], []), '## A\n[0]\n@x-a-b 1\n');
  // ほかの段階を書き換えても、別の段階の拡張の行と改行は変わらない（改行が混ざっていても）
  const mixed = '## A\r\n[0] a\n@x-a-b 1\r\n[1] b\n';
  assert.equal(rewriteNarration(mixed, 'A', '1', [{ role: 'expert', text: 'B' }], []), '## A\r\n[0] a\n@x-a-b 1\r\n[1] B\n');
  assert.deepEqual(rawTurns(src, 'A', '0').turns, [{ role: 'expert', text: 'one' }, { role: 'novice', text: 'two' }]);
});

// ---------------------------------------------------------------- vendor/etoki-spec/fixtures/input-hash（鍵と inputHash）
ok('vendor/etoki-spec/fixtures/input-hash：鍵と canonical・inputHash が一致する', () => {
  const dir = SPEC_INPUT_HASH;
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
  const segs = parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8'));
  assert.deepEqual(segs.map((s) => `${s.slideKey}:${s.stepKey}`), Object.keys(expected));
  // §5.4 の canonical（ここでは試験の中で組む。index に入れるのは後の段階）
  const token = (b) => b.type === 'cue' ? 'cue' : b.type === 'clear' ? 'mark:clear' : `mark:${b.id}|${b.effect}` + (b.hold === null ? '' : `|hold=${b.hold}`);
  for (const s of segs) {
    const canonical = JSON.stringify(s.turns.map((t) => [t.role, t.ttsParts, t.bounds.map(token)]));
    const e = expected[`${s.slideKey}:${s.stepKey}`];
    assert.equal(canonical, e.canonical);
    assert.equal(crypto.createHash('sha256').update(canonical, 'utf8').digest('hex'), e.inputHash);
  }
});
console.log(`narration: ${n} ok`);
