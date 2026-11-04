// 本文（article-v1、format spec §9C）の試験の続き：引用（§9C.4。CSL・citeproc）、スライドと節のつながりの古さ（§9C.5・§9C.7）、
// 1 ファイルへの書き出しと展開（§9C.1・§9C.6・§9C.12）、段 A の編集で本文が残ること（§7.2・§9C.12）
// test-all: unit
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArticle, validateArticle, dataArticleOf, referenceKeys } from '../kit/core/article.mjs';
import { parseArticleText } from '../kit/core/article-text.mjs';
import { renderArticle } from '../kit/core/article-render.mjs';
import { citationSettings, renderCitations, cslHtml, CITATION_STYLES } from '../kit/core/article-cite.mjs';
import { linkedPairs, sectionSources, slideElementText, narrationBlockText, currentLinkHashes, linkStates, pruneLinks, recordLinks, sha256HexText, articleLinksProblems } from '../kit/core/article-links.mjs';
import { articlePage, loadArticle, articleLinkReport, ARTICLE_CSS } from '../kit/core/article-page.mjs';
import { ARTICLE_MESSAGES } from '../kit/core/article-messages.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA, scanLayout } from '../kit/core/tier-a.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { unpack } from './portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { spawnSync } from 'node:child_process';
import { CITEPROC_CREDIT } from '../kit/core/citeproc-credit.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK = path.join(ROOT, 'tools', 'fixtures', 'article-book');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'test-article-export-'));
let failed = 0, passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const csl = nodeEnv.csl();
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------------------------------------------------------- 引用（§9C.4）
const ITEMS = [
  { id: 'shannon1948', type: 'article-journal', title: 'A mathematical theory of communication', author: [{ family: 'Shannon', given: 'Claude E.' }], issued: { 'date-parts': [[1948]] }, 'container-title': 'Bell System Technical Journal', volume: '27', page: '379-423' },
  { id: 'aho1974', type: 'book', title: 'The design and analysis of computer algorithms', author: [{ family: 'Aho', given: 'Alfred V.' }], issued: { 'date-parts': [[1974]] }, publisher: 'Addison-Wesley' },
  { id: 'yamada2020', type: 'book', title: '統計の教科書', author: [{ family: '山田', given: '太郎' }], issued: { 'date-parts': [[2020]] }, publisher: '架空社' },
  { id: 'never', type: 'book', title: 'Never cited', author: [{ family: 'Nobody' }], issued: { 'date-parts': [[2000]] } },
];
const one = (src) => readArticle({ path: 'article.md', references: 'references.json' }, () => src, { lang: 'en' });
const SRC1 = '## A\n\nAs @shannon1948 showed, it holds [@aho1974; @shannon1948, p. 3]. Later [@yamada2020, 3 頁].\n';
const html = (a, style, list = 'end', lang = 'en') => renderArticle(a, { lang, title: 'T', references: ITEMS, csl, citations: { style, list } }).html;

t('settings: default apa, unknown style falls back with a warning and keeps the name, list rules (§9C.4・§9C.8 7)', () => {
  assert.deepEqual(Object.keys(CITATION_STYLES).sort(), ['apa', 'ieee', 'sist02']);
  const d = citationSettings(undefined);
  assert.deepEqual([d.style, d.list, d.problems.length], ['apa', 'end', 0]);
  const u = citationSettings({ style: 'chicago-author-date' });
  assert.deepEqual([u.style, u.asked, u.problems.map((p) => `${p.sev}:${p.code}`)], ['apa', 'chicago-author-date', ['warn:articleCiteStyle']]);
  assert.deepEqual(citationSettings({ list: 'chapter' }).problems.map((p) => `${p.sev}:${p.code}`), ['error:articleCiteListChapter']);
  assert.equal(citationSettings({ list: 'chapter' }, { book: true }).list, 'chapter');
  assert.deepEqual(citationSettings({ list: 'foot' }).problems.map((p) => `${p.code}:${p.data.why}`), ['articleCitations:list']);
  assert.deepEqual(citationSettings('apa').problems.map((p) => `${p.code}:${p.data.why}`), ['articleCitations:shape']);
});
t('apa (author–date): parenthetical groups link each key, locators as text, narrative "Author (year)", list of cited works only', () => {
  const h = html(one(SRC1), 'apa');
  assert.match(h, /As <a class="egatari-cite" href="#ref-shannon1948">Shannon \(1948\)<\/a> showed/);
  assert.match(h, /<span class="egatari-cite-group">\(<a class="egatari-cite" href="#ref-aho1974">Aho, 1974<\/a>; <a class="egatari-cite" href="#ref-shannon1948">Shannon, 1948, p\. 3<\/a>\)<\/span>/);
  assert.match(h, /href="#ref-yamada2020">山田, 2020, 3 頁<\/a>/);
  const ids = [...h.matchAll(/<li id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['ref-aho1974', 'ref-shannon1948', 'ref-yamada2020'], 'sorted by the style; "never" is not listed');
  assert.match(h, /<section data-egatari-references=""><h2>References<\/h2>/);
  // 一覧はどの引用のリンクの行き先でもある
  for (const m of h.matchAll(/class="egatari-cite" href="#([^"]+)"/g)) assert.ok(ids.includes(m[1]), m[1]);
});
t('ieee (numeric): numbers in order of first citation, narrative as the number, list labels', () => {
  const h = html(one(SRC1), 'ieee');
  assert.match(h, /As <a class="egatari-cite" href="#ref-shannon1948">\[1\]<\/a> showed/);
  assert.match(h, /<a class="egatari-cite" href="#ref-shannon1948">\[1\], p\. 3<\/a>, <a class="egatari-cite" href="#ref-aho1974">\[2\]<\/a>/, 'the style sorts the group by number');
  assert.match(h, /<li id="ref-shannon1948"><span class="egatari-ref-label">\[1\]<\/span>/);
  assert.match(h, /egatari-references-numeric/);
});
t('sist02 in Japanese: numeric, the list heading in Japanese', () => {
  const a = readArticle({ path: 'article.md', references: 'references.json' }, () => '## 節\n\n教科書 [@yamada2020] と論文 [@shannon1948]。\n', { lang: 'ja' });
  const h = html(a, 'sist02', 'end', 'ja');
  assert.match(h, /\(<a class="egatari-cite" href="#ref-yamada2020">1<\/a>\)/);
  assert.match(h, /<h2>参考文献<\/h2>/);
  assert.match(h, /<li id="ref-yamada2020"><span class="egatari-ref-label">\(1\)<\/span> <span class="egatari-ref-body">山田太郎\. 統計の教科書\. 架空社, 2020\.<\/span>/);
});
t('sist02 in Japanese: SIST02 abbreviations vol./p., 「」 quotes, an editor stands in for a missing author (adapted in memory)', () => {
  const items = [
    { id: 'j2004', type: 'article-journal', title: '「羅生門」論', author: [{ family: '池上', given: '貴子' }], 'container-title': '日本文学研究', volume: '39', page: '84-93', issued: { 'date-parts': [[2004]] } },
    { id: 'web', type: 'webpage', title: '羅生門', author: [{ family: '芥川', given: '龍之介' }], 'container-title': '青空文庫' },
    { id: 'ed', type: 'book', title: '統計学入門', editor: [{ literal: '東京大学教養学部統計学教室' }], publisher: '東京大学出版会', issued: { 'date-parts': [[1991]] } },
  ];
  const a = readArticle({ path: 'article.md', references: 'references.json' }, () => '## 節\n\n[@j2004] と [@web] と [@ed]。\n', { lang: 'ja' });
  const h = renderArticle(a, { lang: 'ja', title: 'T', references: items, csl, citations: { style: 'sist02', list: 'end' } }).html;
  const text = h.replace(/<[^>]+>/g, '');
  assert.match(text, /日本文学研究\. 2004, vol\. 39, p\. 84–93\./);
  assert.ok(!/巻|ページ|“|”/.test(text), text);
  assert.match(text, /芥川龍之介\. 「羅生門」\. 青空文庫/);
  assert.match(text, /東京大学教養学部統計学教室 編\. 統計学入門\./);
  // 英語の本は元の書式のまま（引用符は “ ”）。編者の代わりは英語でも
  const e = readArticle({ path: 'article.md', references: 'references.json' }, () => '## A\n\n[@web] [@ed].\n', { lang: 'en' });
  const he = renderArticle(e, { lang: 'en', title: 'T', references: items, csl, citations: { style: 'sist02', list: 'end' } }).html.replace(/<[^>]+>/g, '');
  assert.match(he, /東京大学教養学部統計学教室/);
});
t('vertical book: citation numbers upright, footnote numbers written upright, tables right to left, the page opens at its start (§9C.6)', () => {
  const a = readArticle({ path: 'article.md', references: 'references.json' }, () => '---\ntitle: 縦\nwriting-mode: vertical-rl\n---\n\n## 節\n\n本文[^a]と引用 [@yamada2020, p. 12]。\n\n[^a]: 注。\n', { lang: 'ja' });
  const h = renderArticle(a, { lang: 'ja', title: 'T', references: ITEMS, csl, citations: { style: 'sist02', list: 'end' } }).html;
  assert.match(h, /href="#ref-yamada2020"><span class="egatari-tcy">1<\/span>, p\. <span class="egatari-tcy">12<\/span><\/a>/);
  assert.match(h, /<ol class="egatari-footnotes egatari-fn-numbered"><li id="fn-1"><span class="egatari-fn-no"><span class="egatari-tcy">1<\/span><\/span>注。/);
  const hh = renderArticle(readArticle({ path: 'article.md' }, () => '## A\n\nText[^a].\n\n[^a]: Note.\n', { lang: 'en' }), { lang: 'en', title: 'T' }).html;
  assert.match(hh, /<ol class="egatari-footnotes"><li id="fn-1">Note\./, 'horizontal books keep the list numbers');
  // 縦書きの本の表は縦組み（§9C.6）：前の direction: rtl の横組みの表はもうない。:class: horizontal は横組み
  assert.ok(!/direction:rtl/.test(ARTICLE_CSS));
  assert.match(ARTICLE_CSS, /#egatari-article\.egatari-vertical :is\(figure\.egatari-table,table\)\{writing-mode:vertical-rl\}/);
  assert.match(ARTICLE_CSS, /#egatari-article\.egatari-vertical figure\.egatari-table-horizontal,#egatari-article\.egatari-vertical figure\.egatari-table-horizontal table\{writing-mode:horizontal-tb\}/);
  const d = path.join(work, 'vpage'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), '<!DOCTYPE html><html lang="ja"><head><title>t</title></head><body><div id="stage"><section class="slide" id="s-aaaaaa"><h2>a</h2></section></div></body></html>');
  fs.writeFileSync(path.join(d, 'article.md'), '---\ntitle: 縦\nwriting-mode: vertical-rl\n---\n\n## 節\n\n本文。\n');
  assert.match(articlePage(nodeEnv, path.join(d, 'deck.html'), { lang: 'ja' }).html, /<html lang="ja" class="egatari-vertical-page">[\s\S]*html\.egatari-vertical-page\{writing-mode:vertical-rl\}/);
  fs.writeFileSync(path.join(d, 'article.md'), '---\ntitle: 横\n---\n\n## 節\n\n本文。\n');
  assert.ok(!/egatari-vertical-page"/.test(articlePage(nodeEnv, path.join(d, 'deck.html'), { lang: 'ja' }).html));
});
t('table :class: (§9C.2, §9C.6): egatari-table-<name> on the figure; horizontal tables get no tate-chu-yoko; bad names and unknown options are errors', () => {
  const src = (cls) => `---\ntitle: 縦\nwriting-mode: vertical-rl\n---\n\n## 節\n\n:::{table} 数\n:label: tbl-a\n${cls}\n| 年 | 数 |\n|---|---:|\n| 2020 | 12 |\n:::\n`;
  const v = renderArticle(readArticle({ path: 'article.md' }, () => src(''), { lang: 'ja' }), { lang: 'ja', title: 'T' }).html;
  assert.match(v, /<figure class="egatari-table" id="tbl-a">/);
  assert.match(v, /<td class="egatari-align-right"><span class="egatari-tcy">12<\/span><\/td>/);
  const h = renderArticle(readArticle({ path: 'article.md' }, () => src(':class: horizontal wide\n'), { lang: 'ja' }), { lang: 'ja', title: 'T' }).html;
  assert.match(h, /<figure class="egatari-table egatari-table-horizontal egatari-table-wide" id="tbl-a">/);
  assert.ok(!/egatari-tcy/.test(h.slice(h.indexOf('<figure'), h.indexOf('</figure>'))), 'no tate-chu-yoko inside a horizontal table');
  assert.match(h, /<span class="egatari-tcy">1<\/span><\/span> 節/, 'the body outside keeps it');
  const codes = (s) => parseArticleText(s).problems.map((p) => p.code);
  assert.deepEqual(codes(':::{table} T\n:class: Wide\n\n| a |\n|---|\n| 1 |\n:::\n'), ['articleTableClass']);
  assert.deepEqual(codes(':::{table} T\n:width: 3\n\n| a |\n|---|\n| 1 |\n:::\n'), ['articleOption']);
});
t('table :class: row-headers (§9C.6, spec fixture table-row-headers): the first cell of each body row is th scope="row"; the header row is unchanged; without the class, td', () => {
  const FIX = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'), 'fixtures', 'article-text', 'valid', 'table-row-headers', 'input.md');
  const input = fs.readFileSync(FIX, 'utf8');
  assert.deepEqual(parseArticleText(input).problems, [], 'the checker accepts :class: row-headers on {table}');
  const html = (md, lang) => renderArticle(readArticle({ path: 'article.md' }, () => md, { lang }), { lang, title: 'T' }).html;
  for (const [lang, md] of [['ja', `---\ntitle: 縦\nwriting-mode: vertical-rl\n---\n\n## 節\n\n${input}`], ['ja', `## 節\n\n${input}`]]) {
    const h = html(md, lang), tb = h.slice(h.indexOf('<table>'), h.indexOf('</table>'));
    assert.match(h, /<figure class="egatari-table egatari-table-row-headers" id="tbl-yuuki">/);
    assert.match(tb, /<thead><tr><th><\/th><th>一　門の下<\/th><th>二　楼の上へ<\/th><\/tr><\/thead>/, 'header row unchanged');
    assert.match(tb, /<tr><th scope="row">起きたこと<\/th><td>暇を出され、門の下で行き所がない<\/td><td>死人の髪を抜く老婆を見る<\/td><\/tr>/);
    assert.match(tb, /<tr><th scope="row">勇気<\/th><td>盗人になる勇気が出ない<\/td><td>悪を憎む<\/td><\/tr>/);
  }
  const plain = html(`## 節\n\n${input.replace(':class: row-headers\n', '')}`, 'ja');
  assert.ok(!/scope=/.test(plain) && /<tr><td>起きたこと<\/td>/.test(plain), 'no row headers without the class');
});
t('list: chapter (a book): a list at the end of each chapter, ids ref-<chapter>-<key>, numbers restart; none: spans and no list', () => {
  const files = { 'article/01.md': '---\ntitle: One\nchapter: 1\n---\n## A\n\nSee [@shannon1948] and [@aho1974].\n', 'article/02.md': '---\ntitle: Two\nchapter: 2\n---\n## B\n\nSee [@aho1974].\n' };
  const a = readArticle({ chapters: Object.keys(files), references: 'references.json' }, (p) => files[p], { lang: 'en' });
  const h = html(a, 'ieee', 'chapter');
  assert.deepEqual([...h.matchAll(/<li id="([^"]+)">/g)].map((m) => m[1]), ['ref-1-shannon1948', 'ref-1-aho1974', 'ref-2-aho1974']);
  assert.match(h, /href="#ref-2-aho1974">\[1\]<\/a>/, 'numbering restarts in each chapter');
  const ch2 = h.slice(h.indexOf('data-egatari-chapter="2"'));
  assert.ok(ch2.indexOf('data-egatari-references') > 0 && ch2.indexOf('data-egatari-references') < ch2.indexOf('</section>\n</article>') + 1, 'chapter 2 holds its own list');
  const n = html(a, 'apa', 'none');
  assert.ok(!/data-egatari-references|<a class="egatari-cite"/.test(n));
  assert.match(n, /<span class="egatari-cite">Shannon, 1948<\/span>/);
});
t('list: chapter ids use the footnote token: ref-preface1-key, ref-4-key, ref-A-key, and citations link to them (§9C.6)', () => {
  const files = { 'article/00.md': '---\ntitle: P\nkind: preface\n---\nSee [@aho1974].\n', 'article/04.md': '---\ntitle: C\nchapter: 4\n---\n## A\n\nSee @shannon1948.\n', 'article/90.md': '---\ntitle: X\nkind: appendix\n---\n## B\n\nSee [@yamada2020].\n' };
  const a = readArticle({ chapters: Object.keys(files), references: 'references.json' }, (p) => files[p], { lang: 'en' });
  const h = html(a, 'apa', 'chapter');
  assert.deepEqual([...h.matchAll(/<li id="([^"]+)">/g)].map((m) => m[1]), ['ref-preface1-aho1974', 'ref-4-shannon1948', 'ref-A-yamada2020']);
  assert.deepEqual([...h.matchAll(/class="egatari-cite" href="#([^"]+)"/g)].map((m) => m[1]), ['ref-preface1-aho1974', 'ref-4-shannon1948', 'ref-A-yamada2020']);
  assert.equal((h.match(/<section data-egatari-references=""><h2>References<\/h2>\n<ul class="egatari-references/g) || []).length, 3, 'each list: unnumbered h2, then a ul');
});
t('citeproc output is filtered: no markup from references.json reaches the article', () => {
  const evil = [{ id: 'x', type: 'webpage', title: 'evil <script>alert(1)</script> <img src=x onerror=alert(1)> <a href="javascript:alert(1)">y</a>', URL: 'javascript:alert(1)', author: [{ family: '"><svg onload=alert(1)>' }], issued: { 'date-parts': [[2020]] } }];
  const a = one('## A\n\nSee [@x] and @x.\n');
  for (const style of Object.keys(CITATION_STYLES)) {
    const h = renderArticle(a, { lang: 'en', references: evil, csl, citations: { style, list: 'end' } }).html;
    const tags = new Set([...h.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase()));
    for (const tg of tags) assert.ok(['article', 'section', 'h2', 'p', 'a', 'span', 'ul', 'li', 'i', 'b', 'sup', 'sub'].includes(tg), `${style}: unexpected element <${tg}>`);
    for (const m of h.matchAll(/<[a-zA-Z][^>]*>/g)) assert.ok(!/\son[a-z]+\s*=|\sstyle\s*=/i.test(m[0]), `${style}: attribute in ${m[0]}`);
    for (const m of h.matchAll(/<a\b[^>]*>/g)) assert.match(m[0], /^<a class="egatari-cite" href="#ref-x">$/, `${style}: only citation links`);
  }
  assert.equal(cslHtml('<i>a</i><span style="font-variant:small-caps;">b</span><div class="csl-entry">c</div><b onclick="x">d</b>&x'), '<i>a</i><span class="egatari-sc">b</span>c<b>d</b>&amp;x');
});
t('without citeproc (the editor app), citations stay as keys and nothing is listed', () => {
  const h = renderArticle(one(SRC1), { lang: 'en', references: ITEMS, csl: null, citations: { style: 'apa', list: 'end' } }).html;
  assert.match(h, /data-egatari-cite="aho1974"/);
  assert.ok(!/data-egatari-references/.test(h));
});
t('validation: uncited references warn, style and list problems come from egatari.json (§9C.4・§9C.8)', () => {
  const a = one(SRC1);
  const v = validateArticle(a, { references: new Set(ITEMS.map((i) => i.id)), citations: { style: 'nope', list: 'chapter' } });
  assert.deepEqual(v.problems.map((p) => `${p.sev}:${p.code}`).sort(), ['error:articleCiteListChapter', 'warn:articleCiteStyle', 'warn:articleUncited']);
  assert.deepEqual(v.problems.find((p) => p.code === 'articleUncited').data.keys, ['never']);
  for (const p of v.problems) assert.ok(ARTICLE_MESSAGES[p.code], `message for ${p.code}`);
  const r = referenceKeys(JSON.stringify([{ id: 'ok' }, { id: 'ok' }, { id: 'bad key' }, { title: 'no id' }]));
  assert.deepEqual([[...r.keys], r.items.length, r.problem && r.problem.code], [['ok'], 1, 'articleReferences']);
});

t('an HTML table without merged cells warns (a pipe table would do, §9C.8)', () => {
  const tbl = (cell) => `:::{table} Cap\n:label: tbl-a\n<table>\n<tr><th>a</th><th>b</th></tr>\n<tr>${cell}</tr>\n</table>\n:::\n`;
  const codes = (src) => parseArticleText(src).problems.map((p) => `${p.sev}:${p.code}`);
  assert.deepEqual(codes(tbl('<td>1</td><td>2</td>')), ['warn:articleHtmlTableNoSpan']);
  assert.deepEqual(codes(tbl('<td colspan="2">1</td>')), []);
});

// ---------------------------------------------------------------- つながりと古さ（§9C.5・§9C.7）
const LSRC = '---\ntitle: T\n---\nIntro.\n\n(sec-aaaaaa)=\n## First\n\nText with {step}`s-one:1`.\n\n### Sub\n\nMore.\n\n(sec-bbbbbb)=\n## Second\n\n:::{figure} images/x.png\n:label: fig-x\n:alt: x\nCap.\n:::\n\nSee [](#fig-x).\n';
const DECK = '<html><body><div id="stage">\n<section class="slide" id="s-one" data-article="sec-bbbbbb"><h2>One</h2><section class="inner"><p data-step="1">x</p></section></section>\n<section class="slide" id="s-two"><h2>Two</h2></section>\n</div></body></html>';
const NARR = '## One {#s-one}\n[0] Hello.\n[1] World.\n\n## Two {#s-two}\n[0] Bye.\n';
t('section source text: from its heading line to the next level-2 heading, without that heading\'s target line; NFC, trimmed', () => {
  const a = readArticle({ path: 'article.md' }, () => LSRC);
  const s = sectionSources(a);
  assert.equal(s['sec-aaaaaa'], '## First\n\nText with {step}`s-one:1`.\n\n### Sub\n\nMore.');
  assert.equal(s['sec-bbbbbb'], '## Second\n\n:::{figure} images/x.png\n:label: fig-x\n:alt: x\nCap.\n:::\n\nSee [](#fig-x).');
});
t('slide text: the slide element to its matching </section> (nested sections), the narration block to the next ## heading', () => {
  assert.equal(slideElementText(DECK, 's-one'), '<section class="slide" id="s-one" data-article="sec-bbbbbb"><h2>One</h2><section class="inner"><p data-step="1">x</p></section></section>');
  assert.equal(slideElementText(DECK, 's-zzz'), null);
  assert.equal(narrationBlockText(NARR, 's-one'), '## One {#s-one}\n[0] Hello.\n[1] World.\n');
  assert.equal(narrationBlockText(NARR, 's-two'), '## Two {#s-two}\n[0] Bye.\n');
});
t('linked pairs from step links and data-article; states unconfirmed → ok → article / slide; other sections do not matter', async () => {
  const a = readArticle({ path: 'article.md' }, () => LSRC);
  const dataArticle = dataArticleOf([{ id: 's-one', key: 's-one', dataArticle: 'sec-bbbbbb sec-zzzzzz' }]);
  const pairs = linkedPairs(a, dataArticle);
  assert.deepEqual(pairs, [{ slide: 's-one', section: 'sec-aaaaaa' }, { slide: 's-one', section: 'sec-bbbbbb' }]);
  const cur = await currentLinkHashes(a, pairs, DECK, NARR);
  assert.equal(cur['s-one']['sec-aaaaaa'].article, await sha256HexText('## First\n\nText with {step}`s-one:1`.\n\n### Sub\n\nMore.'));
  assert.equal(cur['s-one']['sec-aaaaaa'].slide, await sha256HexText(JSON.stringify([slideElementText(DECK, 's-one'), narrationBlockText(NARR, 's-one').trim()])));
  assert.deepEqual(linkStates(null, cur, pairs).map((x) => x.state), ['unconfirmed', 'unconfirmed']);
  const rec = recordLinks(null, cur, pairs).links;
  assert.deepEqual(linkStates(rec, cur, pairs).map((x) => x.state), ['ok', 'ok']);
  // 第 2 節の前に図を足して番号が変わっても、第 1 節の字は変わらない（描いた字を使わない）
  const a2 = readArticle({ path: 'article.md' }, () => LSRC.replace('More.', 'More, changed.'));
  const cur2 = await currentLinkHashes(a2, pairs, DECK, NARR);
  assert.deepEqual(linkStates(rec, cur2, pairs).map((x) => x.state), ['article', 'ok']);
  const cur3 = await currentLinkHashes(a, pairs, DECK, NARR.replace('World.', 'Earth.'));
  assert.deepEqual(linkStates(rec, cur3, pairs).map((x) => x.state), ['slide', 'slide']);
  assert.deepEqual(linkStates(rec, await currentLinkHashes(a2, pairs, DECK, NARR.replace('World.', 'Earth.')), pairs).map((x) => x.state), ['both', 'slide']);
  // CRLF と NFD の原稿でも同じ hash（NFC・LF）
  const crlf = readArticle({ path: 'article.md' }, () => LSRC.replace(/\n/g, '\r\n'));
  assert.equal((await currentLinkHashes(crlf, pairs, DECK.replace(/\n/g, '\r\n'), NARR))['s-one']['sec-aaaaaa'].article, cur['s-one']['sec-aaaaaa'].article);
  // 確かめる（all）と記録を今に、もうつながっていない組は外す
  const conf = recordLinks(rec, cur2, pairs, { mode: 'all' });
  assert.deepEqual(conf.added, [{ slide: 's-one', section: 'sec-aaaaaa' }]);
  const pr = pruneLinks({ ...rec, 's-two': { 'sec-aaaaaa': rec['s-one']['sec-aaaaaa'] } }, pairs);
  assert.deepEqual([pr.removed, Object.keys(pr.links)], [[{ slide: 's-two', section: 'sec-aaaaaa' }], ['s-one']]);
  assert.deepEqual(articleLinksProblems({ 's-one': { 'sec-aaaaaa': { article: 'x', slide: 'y' } } }).length, 1);
});

// ---------------------------------------------------------------- 作業フォルダ：組み立て・check の文脈
function copyBook(name, edit) {
  const d = path.join(work, name);
  fs.cpSync(BOOK, d, { recursive: true, filter: (s) => !/[\\/]out([\\/]|$)/.test(path.relative(BOOK, s)) });
  if (edit) edit(d);
  return d;
}
t('working folder: articlePage formats citations with metadata.citations and warns about an unknown style', () => {
  const d = copyBook('style', (dir) => fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ metadata: { citations: { style: 'harvard-xyz' } } })));
  const p = articlePage(nodeEnv, path.join(d, 'deck.html'), { lang: 'ja' });
  assert.deepEqual(p.problems.filter((x) => x.sev === 'error'), []);
  assert.ok(p.problems.some((x) => x.code === 'articleCiteStyle' && x.data.style === 'harvard-xyz'));
  assert.match(p.html, /<a class="egatari-cite" href="#ref-doe2001">Doe, 2001年, p\. 3<\/a>/);
  const d2 = copyBook('ieee', (dir) => fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ metadata: { citations: { style: 'ieee', list: 'chapter' } } })));
  const p2 = articlePage(nodeEnv, path.join(d2, 'deck.html'), { lang: 'ja' });
  assert.deepEqual(p2.problems.filter((x) => x.sev === 'error'), []);
  assert.match(p2.html, /href="#ref-1-doe2001">\[1\], p\. 3<\/a>/);
  assert.match(p2.html, /<li id="ref-1-doe2001">/);
});

// ---------------------------------------------------------------- 1 ファイル（§9C.1・§9C.6・§9C.7・§9C.12）
// 1 ファイルへの書き出しはステップへのリンクを再生器で確かめる（nodeEnv.articleSteps。ブラウザは tools/test-article-steps.mjs で）。
// ここでは再生器の答えを置き換える：probe(link) → DECK.resolveFragment の結果
const stepCalls = [];
const envWith = (probe) => ({ ...nodeEnv, articleSteps: async (html, links) => { stepCalls.push({ html, links }); return Object.fromEntries(links.map((l) => [l, probe(l)])); } });
const packEnv = envWith((l) => ({ legacy: false, id: l.split(':')[0] }));
const indexOf = (html) => { const m = html.match(new RegExp(`<script type="[^"]*" id="${FORMAT.INDEX_ID}"[^>]*>([\\s\\S]*?)</script>`)); return JSON.parse(m[1]); };
const egatariArticle = (html) => { const i = html.indexOf('<article id="egatari-article"'); return html.slice(i, html.indexOf('</article>\n</section>', i) + '</article>'.length); };
t('pack: article files, references and images go into files; index.article and articleLinks; #egatari-article is the last child of #egatari-readable', async () => {
  const d = copyBook('pack');
  const L = loadArticle(nodeEnv, path.join(d, 'deck.html'), {});
  const lr = await articleLinkReport(L);
  fs.writeFileSync(path.join(d, 'egatari.json'), JSON.stringify({ articleLinks: { ...recordLinks(null, lr.current, lr.pairs).links, 's-gone': { 'sec-h7q2xz': { article: 'a'.repeat(64), slide: 'b'.repeat(64) } } } }, null, 2) + '\n');
  const r = await PF.exportPortable(packEnv, path.join(d, 'deck.html'), { fromFolder: true });
  const ix = r.index;
  assert.deepEqual(PF.validateIndex(ix), []);
  for (const p of ['article/00-preface.md', 'article/01.md', 'article/09-answers.md', 'references.json', 'images/loss.svg']) assert.ok(ix.files[p], `files has ${p}`);
  assert.deepEqual(ix.article, { chapters: ['article/00-preface.md', 'article/01.md', 'article/09-answers.md'], references: 'references.json' });
  assert.deepEqual(Object.keys(ix.articleLinks).sort(), ['s-k3f9q2', 's-p2m4q7'], 'records of pairs no longer linked are removed');
  assert.ok(r.warnings.some((w) => /dropped 1 link record/.test(w)));
  assert.ok(!ix.requires.some((f) => /article/.test(f)), 'article-v1 is never in requires');
  const conf = JSON.parse(dec.decode(r.files['egatari.json']));
  assert.deepEqual(conf.articleLinks, ix.articleLinks, 'egatari.json articleLinks equals index.articleLinks (§3.3)');
  assert.deepEqual(conf.article, ix.article, 'the reading order is written for unpacking (§9C.7)');
  const art = egatariArticle(r.html);
  assert.match(art, /^<article id="egatari-article" lang="ja">/);
  assert.match(r.html, /<\/article>\n<\/section>/);
  const rd = r.html.slice(r.html.indexOf(`<section id="${FORMAT.READABLE_ID}"`), r.html.indexOf('</article>\n</section>') + 21);
  assert.ok(rd.lastIndexOf('<article ') === rd.indexOf('<article id="egatari-article"'), 'the article is the last child');
  assert.ok(!/<script|\son[a-z]+=|<iframe|<object|<embed/i.test(art), 'no script or embedding in the article');
  assert.match(art, /<li id="ref-doe2001">/);
  assert.match(art, /data:image\/svg\+xml;base64,/, 'images as data: URIs');
  const rp = await PF.readPortable(enc.encode(r.html));
  assert.ok(rp.sourceMatches);
  assert.equal(dec.decode(rp.files['article/01.md']), fs.readFileSync(path.join(d, 'article', '01.md'), 'utf8'));
  fs.writeFileSync(path.join(work, 'pack.ega.html'), r.html);
});
t('unpack writes the article files and egatari.json article/articleLinks; packing the folder again gives the same bytes', async () => {
  const f = path.join(work, 'pack.ega.html');
  const out = path.join(work, 'unpacked');
  const u = await unpack(f, out);
  for (const p of ['article/01.md', 'references.json', 'images/loss.svg']) assert.ok(u.written.includes(p), p);
  const conf = JSON.parse(fs.readFileSync(path.join(out, 'egatari.json'), 'utf8'));
  assert.ok(conf.article && conf.articleLinks);
  const again = await PF.exportPortable(packEnv, path.join(out, 'deck.html'), { fromFolder: true });
  assert.equal(again.html, fs.readFileSync(f, 'utf8'));
  // ほかの書き手の 1 ファイル（egatari.json に article がない）でも、展開は読む順を書く（§9C.7 MUST）
  const ix = indexOf(again.html);
  const cfg = PF.folderConfig(ix, JSON.stringify({ docId: ix.docId }));
  assert.deepEqual(JSON.parse(cfg).article, ix.article);
  assert.deepEqual(JSON.parse(cfg).articleLinks, ix.articleLinks);
});
t('pack: an article with errors (§9C.8) is not written; a ## heading without an id is given one and written back', async () => {
  const bad = copyBook('bad', (dir) => fs.appendFileSync(path.join(dir, 'article', '01.md'), '\nSee [](#fig-nowhere).\n'));
  await assert.rejects(PF.exportPortable(packEnv, path.join(bad, 'deck.html'), { fromFolder: true }), (e) => e.code === 'article-invalid' && /fig-nowhere/.test(e.message));
  const noid = copyBook('noid', (dir) => fs.appendFileSync(path.join(dir, 'article', '01.md'), '\n## 新しい節\n\n本文。\n'));
  const r = await PF.exportPortable(packEnv, path.join(noid, 'deck.html'), { fromFolder: true });
  assert.match(r.writes['article/01.md'], /\n\(sec-[a-z2-7]{6}\)=\n## 新しい節\n/);
  assert.equal(dec.decode(r.files['article/01.md']), r.writes['article/01.md']);
  assert.ok(r.warnings.some((w) => /gave 1 article section/.test(w)));
});
t('pack checks step links in the player on the written file, and refuses a link to a step the slide does not have (§9C.8 1)', async () => {
  const d = copyBook('steps');
  stepCalls.length = 0;
  const r = await PF.exportPortable(packEnv, path.join(d, 'deck.html'), { fromFolder: true });
  assert.deepEqual(stepCalls.map((c) => c.links), [['s-k3f9q2:1']]);
  assert.equal(stepCalls[0].html, r.html, 'the check runs on the document that is written');
  const bad = envWith((l) => ({ error: 'no such step', max: 2 }));
  await assert.rejects(PF.exportPortable(bad, path.join(d, 'deck.html'), { fromFolder: true }), (e) => e.code === 'article-invalid' && e.details.some((x) => x.code === 'articleStep' && x.data.why === 'step' && x.data.max === 2));
  const { articleSteps, ...noSteps } = packEnv;
  void articleSteps;
  await assert.rejects(PF.exportPortable(noSteps, path.join(d, 'deck.html'), { fromFolder: true }), (e) => e.code === 'article-unsupported');
});
t('an editor without the article tools refuses a working folder with an article rather than dropping it', async () => {
  const d = copyBook('noart');
  const { articleTools, ...env } = nodeEnv;
  void articleTools;
  await assert.rejects(PF.exportPortable(env, path.join(d, 'deck.html'), { fromFolder: true }), (e) => e.code === 'article-unsupported');
});
t('validateIndex: path or chapters (exactly one), chapter paths, files, articleLinks shape', () => {
  const ix = indexOf(fs.readFileSync(path.join(work, 'pack.ega.html'), 'utf8'));
  const v = (patch) => PF.validateIndex({ ...ix, ...patch });
  assert.deepEqual(v({}), []);
  assert.ok(v({ article: { path: 'article.md', chapters: ['article/01.md'] } }).some((e) => /both "path" and "chapters"/.test(e)));
  assert.ok(v({ article: { chapters: ['chap/01.md'] } }).some((e) => /does not match/.test(e)));
  assert.ok(v({ article: { chapters: ['article/99.md'] } }).some((e) => /"article\/99.md" is not in files/.test(e)));
  assert.ok(v({ articleLinks: { 's-x': { 'sec-aaaaaa': { article: 'x' } } } }).some((e) => /articleLinks/.test(e)));
  assert.ok(v({ metadata: { ...ix.metadata, citations: { list: 'foot' } } }).some((e) => /citations\.list/.test(e)));
});
t('tier A edits keep the article: #egatari-article, the article files, index.article and articleLinks stay; an article edit is refused', async () => {
  const html = fs.readFileSync(path.join(work, 'pack.ega.html'), 'utf8');
  const r = await PF.readPortable(enc.encode(html));
  const ws = new Map(Object.entries(r.files));
  const narr = dec.decode(ws.get('narration.md'));
  ws.set('narration.md', enc.encode(narr.replace('平均と中央値を比べます。', '平均と中央値を比べてみます。')));
  const a = await tierA(html, ws);
  assert.ok(a.ok, `tier A refused: [${a.code}] ${a.reason}`);
  assert.equal(egatariArticle(a.html), egatariArticle(html), '#egatari-article unchanged');
  const ix0 = indexOf(html), ix1 = indexOf(a.html);
  assert.deepEqual([ix1.article, ix1.articleLinks], [ix0.article, ix0.articleLinks]);
  for (const p of ix0.article.chapters) assert.equal(ix1.files[p], ix0.files[p], `${p} unchanged`);
  assert.ok(scanLayout(a.html).readable.articles.has('s-k3f9q2'));
  const ws2 = new Map(Object.entries(r.files));
  ws2.set('article/01.md', enc.encode(dec.decode(ws2.get('article/01.md')) + '\n追記。\n'));
  const b = await tierA(html, ws2);
  assert.equal(b.ok, false, 'an article edit is not a tier A edit (§9C.1: tier B)');
  assert.equal(b.code, 'article-changed');
});

t('an article edit re-renders only #egatari-article (§9C.1): tier A asks for it (article-changed), then replaces the element and the article file; other bytes stay', async () => {
  const f = path.join(work, 'pack.ega.html'), html = fs.readFileSync(f, 'utf8');
  const out = path.join(work, 'artedit');
  await unpack(f, out);
  const fp = path.join(out, 'article', '01.md');
  const src = fs.readFileSync(fp, 'utf8');
  const para = src.split('\n').find((l) => /^[^#(:!\-|$\s].{8,}/.test(l));   // 本文の段落を 1 つ写す（字はみな今の文書にある）
  fs.writeFileSync(fp, src + '\n' + para + '\n');
  const r = await PF.readPortable(enc.encode(html));
  const ws = new Map(Object.entries(r.files));
  ws.set('article/01.md', enc.encode(fs.readFileSync(fp, 'utf8')));
  const a = await tierA(html, ws);
  assert.deepEqual([a.ok, a.code, a.details], [false, 'article-changed', ['article/01.md']]);
  const full = await PF.exportPortable(packEnv, path.join(out, 'deck.html'), { fromFolder: true });
  const art = egatariArticle(full.html);
  assert.notEqual(art, egatariArticle(html));
  const b = await tierA(html, ws, { article: { html: art } });
  assert.ok(b.ok, `refused: [${b.code}] ${b.reason}`);
  assert.equal(egatariArticle(b.html), art);
  assert.deepEqual(b.changes.article, ['article/01.md']);
  assert.equal(b.changes.supplement, null, 'no new characters');
  const head = (h) => h.slice(0, h.indexOf('<section id="egatari-readable"'));
  assert.equal(head(b.html), head(html), 'the runtime before the readable layer is unchanged');
  const rb = await PF.readPortable(enc.encode(b.html));
  assert.ok(rb.sourceMatches);
  assert.equal(dec.decode(rb.files['article/01.md']), fs.readFileSync(fp, 'utf8'));
  // 本文のファイルを消す・本文の要素でないもの：段 B か断る
  const gone = new Map(ws); gone.delete('article/01.md');
  assert.equal((await tierA(html, gone, { article: { html: art } })).code, 'source-changed');
  assert.equal((await tierA(html, ws, { article: { html: '<div>x</div>' } })).code, 'layout');
});
t('confirming links in egatari.json (articleLinks, §9C.7) is a tier A edit that writes the same value into the index', async () => {
  const html = fs.readFileSync(path.join(work, 'pack.ega.html'), 'utf8');
  const r = await PF.readPortable(enc.encode(html));
  const ws = new Map(Object.entries(r.files));
  const conf = JSON.parse(dec.decode(ws.get('egatari.json')));
  const ix0 = indexOf(html);
  const links = JSON.parse(JSON.stringify(ix0.articleLinks || {}));
  const sk = Object.keys(links)[0] || 's-k3f9q2', sec = Object.keys(links[sk] || {})[0] || 'sec-aaaaaa';
  links[sk] = { ...(links[sk] || {}), [sec]: { article: 'a'.repeat(64), slide: 'b'.repeat(64) } };
  ws.set('egatari.json', enc.encode(JSON.stringify({ ...conf, articleLinks: links }, null, 2) + '\n'));
  const a = await tierA(html, ws);
  assert.ok(a.ok, `refused: [${a.code}] ${a.reason}`);
  assert.deepEqual(indexOf(a.html).articleLinks, links);
  assert.equal(egatariArticle(a.html), egatariArticle(html));
  const bad = new Map(ws); bad.set('egatari.json', enc.encode(JSON.stringify({ ...conf, articleLinks: { [sk]: { [sec]: { article: 'x' } } } })));
  assert.equal((await tierA(html, bad)).code, 'config-changed');
});

// citeproc-js の帰属の表示（CPAL-1.0 の Exhibit B。NOTICE）：citeproc で引用を組んだときだけ、組み立てのコマンドが 1 行出す。文書には入れない
const runNode = (args) => spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
t('build prints the citeproc-js credit only when citeproc formatted citations, and the built files do not carry it', () => {
  assert.equal(CITEPROC_CREDIT, 'Citations formatted by citeproc-js — (c) Frank Bennett — citeproc-js implements the Citation Style Language — https://citationstyles.org/');
  const d = copyBook('credit');
  const r = runNode([path.join(ROOT, 'kit', 'build.mjs'), path.join(d, 'deck.html')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n').filter((l) => l === CITEPROC_CREDIT).length, 1, 'one credit line');
  assert.ok(!/warn|⚠/i.test(r.stdout.split('\n').find((l) => l.includes('citeproc-js'))), 'not a warning');
  for (const f of ['deck.html', 'deck.article.html']) assert.ok(!fs.readFileSync(path.join(d, 'out', f), 'utf8').includes('citeproc'), `${f} carries no credit`);
  // 引用のない本・本のない教材：出さない
  const n = copyBook('nocite', (dir) => { const f = path.join(dir, 'article', '01.md'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(' [@doe2001, p. 3]', '')); fs.rmSync(path.join(dir, 'references.json')); });
  const rn = runNode([path.join(ROOT, 'kit', 'build.mjs'), path.join(n, 'deck.html')]);
  assert.equal(rn.status, 0, rn.stderr);
  assert.ok(!rn.stdout.includes('citeproc') && !rn.stderr.includes('citeproc'), 'no credit without citations');
  const rm = runNode([path.join(ROOT, 'kit', 'build.mjs'), path.join(ROOT, 'examples', 'minimal', 'deck.html'), '--out', path.join(work, 'minimal.html')]);
  assert.ok(!rm.stdout.includes('citeproc'), 'no credit without a book');
});
t('the dev server preview builds slides only and never loads citeproc (so it has no credit to show)', () => {
  const d = copyBook('dev');
  const code = `import { build } from ${JSON.stringify(new URL('../kit/build.mjs', import.meta.url).href)};
import { createRequire } from 'node:module';
build(${JSON.stringify(path.join(d, 'deck.html'))});
const req = createRequire(${JSON.stringify(new URL('../kit/build.mjs', import.meta.url).href)});
console.log(Object.keys(req.cache).some((k) => /[\\/]citeproc[\\/]/.test(k)) ? 'loaded' : 'not loaded');`;
  const r = runNode(['--input-type=module', '-e', code]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split('\n').pop(), 'not loaded');
  assert.match(fs.readFileSync(path.join(ROOT, 'server', 'dev.mjs'), 'utf8'), /\)\.build; needReimport/, 'the dev server still uses build() (slides only)');
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}\n  ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')}`); }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`test-article-export: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
