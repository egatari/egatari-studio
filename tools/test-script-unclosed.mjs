// 閉じていない <script>（kit/core/script-unclosed.mjs、handoff #96）の試験
// test-all: unit
//   node tools/test-script-unclosed.mjs
// v0.6.19-rc.1 の評価：AI の返事の 4 枚目の <m-contrast> のデータに </script> がなく、5・6 枚目が <script> の中の文字になった。
// 5 枚目の見出し「なぜ POS だけを使うのか」（英字と空白を含む）の台本の節が「スライドが見つからない」になり、見出しの正規化の違いに見えたが、
// 正規化は両方の側で同じ。原因の 1 か所（閉じていない <script>）を指摘する
import assert from 'node:assert/strict';
import { scriptUnclosedFindings } from '../kit/core/script-unclosed.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { normalizeKey } from '../kit/core/narration-parse.mjs';
import { sourceFindings } from '../kit/core/check-source.mjs';
import { message } from '../kit/check-messages.mjs';
import { RULES } from '../kit/core/check-rules.mjs';
import { IN_EDITOR } from '../kit/core/check-parity.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };

const json = '{"kind":"answers","rows":[{"q":"使うデータは","before":{"text":"棚の画像","by":"[3]"},"after":"POS だけ","basis":"架空の設定"}]}';
const deck = (close) => `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><script src="x.js"></script></head><body><div class="deck">
<section class="slide" id="s-aaaaaa">
  <h2>欠品は売り逃しを生む</h2>
</section>

<section class="slide" id="s-bbbbbb">
  <h2>本研究の答えを並べる</h2>
  <div class="body">
    <m-contrast style="height:340px" aria-label="比較">
      <script type="application/json">
${json}
${close ? '      </script>\n' : ''}    </m-contrast>
  </div>
</section>

<section class="slide">
  <h2>なぜ POS だけを使うのか</h2>
</section>

<section class="slide">
  <h2>序論のまとめ</h2>
</section>

</div></body></html>
`;
const narration = `# 台本

## 欠品は売り逃しを生む {#s-aaaaaa}
[0] 欠品の話です。

## 本研究の答えを並べる {#s-bbbbbb}
[0] 答えを並べます。

## なぜ POS だけを使うのか
[0] POS の話です。

## 序論のまとめ
[0] まとめます。
`;

ok('the heading with ASCII words and spaces gives the same key on both sides (not the cause)', () => {
  const s = analyzeSlideIds(deck(true)).slides;
  assert.equal(s[2].key, normalizeKey('なぜ POS だけを使うのか'));
});

ok('an unclosed data <script> swallows the later slides: they are not slides, and get no id', () => {
  const broken = analyzeSlideIds(deck(false)).slides;
  assert.deepEqual(broken.map((s) => s.heading), ['欠品は売り逃しを生む', '本研究の答えを並べる']);
  const r = assignIds(deck(false), narration);
  assert.equal(r.added.length, 0);
  assert.match(r.narration, /^## なぜ POS だけを使うのか$/m);
});

ok('the finding points at the slide with the <script>, with its line and the swallowed headings', () => {
  const f = scriptUnclosedFindings(deck(false));
  assert.deepEqual(f, [{ i: 1, sev: 'error', code: 'scriptUnclosed', a: { line: 10, n: 2, headings: ['なぜ POS だけを使うのか', '序論のまとめ'] } }]);
});

ok('closed, every slide gets an id and every heading its {#id}, whatever comes before', () => {
  assert.deepEqual(scriptUnclosedFindings(deck(true)), []);
  const r = assignIds(deck(true), narration);
  assert.deepEqual(r.problems, []);
  assert.equal(r.added.length, 2);
  assert.equal(analyzeSlideIds(r.deck).slides.filter((s) => s.id === null).length, 0);
  for (const a of r.added) assert.ok(r.narration.includes(` {#${a.id}}`), a.id);
  assert.match(r.narration, new RegExp(`^## なぜ POS だけを使うのか \\{#${r.added[0].id}\\}$`, 'm'));
});

ok('closed only after the next slide, or with the part\'s end tag inside the JSON: still found', () => {
  const later = deck(false).replace('<h2>序論のまとめ</h2>', '<h2>序論のまとめ</h2><script type="application/json">{}</script>');
  const f = scriptUnclosedFindings(later);
  assert.equal(f.length, 1);
  assert.equal(f[0].i, 1);
  assert.deepEqual(f[0].a.headings, ['なぜ POS だけを使うのか', '序論のまとめ']);
  const tagInside = `<section class="slide"><h2>a</h2><m-x><script type="application/json">{}
</m-x></section><section class="slide"><h2>b</h2></section><script>var a = 1;</script>`;
  assert.deepEqual(scriptUnclosedFindings(tagInside).map((x) => [x.i, x.a.n]), [[0, 1]]);
  assert.deepEqual(scriptUnclosedFindings('<section class="slide"><h2>a</h2><m-x><script type="application/json">{}\n</m-x>\n</script></section>').map((x) => [x.i, x.a.n]), [[0, 0]]);
  // ふつうの <script>（頭・スライドの中・HTML を文字列で持つもの）は知らせない
  assert.deepEqual(scriptUnclosedFindings('<html><head><script>const t = "</m-x>";</script></head><body><section class="slide"><h2>a</h2><script>1</script></section></body></html>'), []);
  assert.deepEqual(scriptUnclosedFindings(''), []);
});

ok('the editor gets the same finding (check-source), under R-components', () => {
  assert.ok(sourceFindings({ deck: deck(false), narration }).some((x) => x.code === 'scriptUnclosed' && x.i === 1 && x.sev === 'error'));
  assert.ok(!sourceFindings({ deck: deck(true), narration }).some((x) => x.code === 'scriptUnclosed'));
  assert.ok(IN_EDITOR.includes('scriptUnclosed'));
  assert.ok(RULES.find((r) => r.id === 'R-components').codes.includes('scriptUnclosed'));
});

ok('the message (ja, en)', () => {
  const a = scriptUnclosedFindings(deck(false))[0].a;
  assert.equal(message('ja', 'scriptUnclosed', a), '10 行目の <script> に </script> がない：その後ろのスライド 2 枚（「なぜ POS だけを使うのか」「序論のまとめ」）が <script> の中の文字になり、スライドとして読めない（台本の節も結べない）。<script> の中身（JSON など）のすぐ後ろに </script> を書く（R-components）');
  assert.match(message('en', 'scriptUnclosed', a), /^the <script> on line 10 has no <\/script>: everything after it, including 2 slides \(“なぜ POS だけを使うのか”, “序論のまとめ”\), is read as script text/);
  assert.match(message('ja', 'scriptUnclosed', { line: 3, n: 0, headings: [] }), /^3 行目の <script> に <\/script> がない：その後ろのすべてが/);
});

console.log(`test-script-unclosed: ${n} ok`);
