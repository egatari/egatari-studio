// 検索と置換（kit/core/find-replace.mjs。handoff #86）の文字列の検査
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-find-replace.mjs
// 原稿はスライドの字の部分だけ（タグ・属性・<script>・<style>・注釈は探さない）、文字参照は字に戻して探し、置換は文字参照にして書く。
// 台本は話す字だけ（見出し・ステップの印・話者・注釈・拡張の行・{cue}・{mark:…}・{note:…} は探さない。読みは語の側だけ）。大文字と小文字・重ならない一致・日本語
import assert from 'node:assert/strict';
import { findMatches, replaceMatches, decodeRun, narrRuns } from '../kit/core/find-replace.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

const DECK = `<!DOCTYPE html><html lang="ja"><head><title>確率 title</title><style>.a{content:"確率"}</style></head><body><div id="stage">
<section class="slide" id="s-aaaaaa" data-note="確率">
  <h2>確率の話 <span class="term" title="確率">確率</span></h2>
  <div class="body"><p>A &amp; B は確率。<!-- 確率 --></p><script>var x = "確率";</script></div>
  <div class="concl"><span>⇒ Cat と cat と CAT</span></div>
</section>
<section class="slide" id="s-bbbbbb">
  <h2>二枚目</h2>
  <div class="body"><p>&lt;b&gt; と &#x78BA;率 と aaaa</p></div>
</section>
</div></body></html>`;
const NARR = `# 台本

<!-- 確率の注釈 -->
## 確率の話 {#s-aaaaaa}
[0] 確率を話します。{cue}次も確率。{note:確率を指す}
[1] Expert: Novice と確率 {mark:確率|circle}
    Novice: 確率って？{確率|かくりつ}
@x-foo-bar 確率
[concl] cat と Cat

## 二枚目 {#s-bbbbbb}
[0] aaaa
`;

t('decodeRun maps decoded characters back to their source range', () => {
  const d = decodeRun('A &amp; B&#x78BA;&unknown;', 10);
  assert.equal(d.text, 'A & B確&unknown;');
  assert.deepEqual([d.from[2], d.to[2]], [12, 17]);
  assert.deepEqual([d.from[5], d.to[5]], [19, 27]);
});

t('slides: only text inside slides, not tags, attributes, <script>, <style>, comments or <title>', () => {
  const r = findMatches({ deck: DECK, narr: null, query: '確率' });
  // h2 の「確率の話」・span の中・p の「確率。」・二枚目の &#x78BA;率
  assert.equal(r.matches.length, 4);
  assert.equal(r.slides, 2);
  assert.equal(r.script, 0);
  for (const m of r.matches) assert.ok(['確率', '&#x78BA;率'].includes(DECK.slice(m.start, m.end)), DECK.slice(m.start, m.end));
  assert.deepEqual(r.matches.map((m) => m.slide), [0, 0, 0, 1]);
  assert.deepEqual(r.matches.map((m) => m.slideKey), ['s-aaaaaa', 's-aaaaaa', 's-aaaaaa', 's-bbbbbb']);
});

t('slides: entities are searched as characters; replacing escapes & < > and keeps the markup', () => {
  const amp = findMatches({ deck: DECK, query: '&' });
  assert.equal(amp.matches.length, 1);
  assert.equal(DECK.slice(amp.matches[0].start, amp.matches[0].end), '&amp;');
  const lt = findMatches({ deck: DECK, query: '<b>' });
  assert.equal(lt.matches.length, 1);
  const out = replaceMatches(DECK, lt.matches, '<i> & "x"', 'deck');
  assert.ok(out.includes('<p>&lt;i&gt; &amp; "x" と &#x78BA;率'), out);
  assert.equal(analyzeSlideIds(out).slides.length, 2);
  const all = findMatches({ deck: DECK, query: '確率' });
  const out2 = replaceMatches(DECK, all.matches, 'かくりつ', 'deck');
  assert.ok(out2.includes('title="確率"') && out2.includes('data-note="確率"') && out2.includes('var x = "確率"') && out2.includes('<!-- 確率 -->') && out2.includes('<title>確率 title</title>'));
  assert.equal(findMatches({ deck: out2, query: '確率' }).matches.length, 0);
  assert.equal(findMatches({ deck: out2, query: 'かくりつ' }).matches.length, 4);
});

t('a match does not cross tags', () => {
  assert.equal(findMatches({ deck: DECK, query: '確率の話 確率' }).matches.length, 0);
});

t('case: off by default, on with matchCase', () => {
  assert.equal(findMatches({ deck: DECK, query: 'cat' }).matches.length, 3);
  assert.equal(findMatches({ deck: DECK, query: 'cat', matchCase: true }).matches.length, 1);
  assert.equal(findMatches({ deck: DECK, query: 'CAT', matchCase: true }).matches.length, 1);
});

t('matches do not overlap (left to right)', () => {
  const r = findMatches({ deck: DECK, query: 'aa', scope: 'slides' });
  assert.equal(r.matches.length, 2);
  assert.equal(r.matches[1].start - r.matches[0].start, 2);
  assert.ok(replaceMatches(DECK, r.matches, 'b', 'deck').includes('と bb</p>'));
});

t('script: only spoken text (no headings, step markers, roles, comments, ext lines, cue/mark/note); readings by the word', () => {
  const runs = narrRuns(NARR).map((x) => x.raw).join('|');
  assert.ok(!runs.includes('[0]') && !runs.includes('Expert') && !runs.includes('##') && !runs.includes('@x-') && !runs.includes('cue') && !runs.includes('note') && !runs.includes('かくりつ'), runs);
  const r = findMatches({ deck: DECK, narr: NARR, query: '確率', scope: 'script' });
  // 「確率を話します」「次も確率」「と確率」「確率って」「{確率|…}」の 5 つ
  assert.equal(r.matches.length, 5);
  assert.equal(r.script, 5);
  assert.equal(r.slides, 0);
  assert.ok(r.matches.every((m) => NARR.slice(m.start, m.end) === '確率' && m.slide === 0 && m.slideKey === 's-aaaaaa'));
  assert.deepEqual(r.matches.map((m) => m.stepKey), ['0', '0', '1', '1', '1']);
  const out = replaceMatches(NARR, r.matches, 'かく\nりつ', 'narr');
  assert.ok(out.includes('{note:確率を指す}') && out.includes('{mark:確率|circle}') && out.includes('{かく りつ|かくりつ}') && out.includes('## 確率の話 {#s-aaaaaa}') && out.includes('<!-- 確率の注釈 -->') && out.includes('@x-foo-bar 確率'), out);
  assert.equal(findMatches({ narr: out, query: '確率', scope: 'script' }).matches.length, 0);
});

t('script: role names are not searched but the same word in the text is', () => {
  const r = findMatches({ deck: DECK, narr: NARR, query: 'novice', scope: 'script' });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].stepKey, '1');
});

t('scope all: slides then script for each slide, counted apart', () => {
  const r = findMatches({ deck: DECK, narr: NARR, query: 'aaaa' });
  assert.deepEqual(r.matches.map((m) => [m.file, m.slide]), [['deck', 1], ['narr', 1]]);
  assert.equal(r.slides, 1); assert.equal(r.script, 1);
  const c = findMatches({ deck: DECK, narr: NARR, query: 'cat' });
  assert.deepEqual(c.matches.map((m) => m.file), ['deck', 'deck', 'deck', 'narr', 'narr']);
  assert.equal(findMatches({ deck: DECK, narr: NARR, query: '確率', scope: 'slides' }).script, 0);
});

t('empty query and CRLF', () => {
  assert.equal(findMatches({ deck: DECK, narr: NARR, query: '' }).matches.length, 0);
  const crlf = NARR.replace(/\n/g, '\r\n');
  const r = findMatches({ deck: DECK, narr: crlf, query: '確率', scope: 'script' });
  assert.equal(r.matches.length, 5);
  assert.ok(r.matches.every((m) => crlf.slice(m.start, m.end) === '確率'));
});

t('the heading that keys a slide without an id is not searched (the script is bound to it)', () => {
  const d = '<section class="slide"><h2>学習率</h2><p>学習率</p></section><section class="slide" data-key="k"><h2>学習率</h2></section><section class="slide" id="s-cccccc"><h2>学習率</h2></section>';
  const r = findMatches({ deck: d, query: '学習率' });
  assert.deepEqual(r.matches.map((m) => m.slide), [0, 1, 2]);
  assert.ok(d.slice(0, r.matches[0].start).endsWith('<p>'));
});

t('regex characters are literal', () => {
  const d = '<section class="slide" id="s-dddddd"><h2>a.b (c) [d] a*b</h2></section>';
  assert.equal(findMatches({ deck: d, query: '.' }).matches.length, 1);
  assert.equal(findMatches({ deck: d, query: '(c)' }).matches.length, 1);
  assert.equal(findMatches({ deck: d, query: 'a*b' }).matches.length, 1);
});

console.log(`\n${n} passed`);
