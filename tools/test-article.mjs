// 本文（article-v1、format spec §9C）の試験：仕様の fixtures/article-text（写し：vendor/egatari-spec）の正解の木と拒む例、
// 作業フォルダの本文の見つけ方と章の決まり（§9C.1・§9C.1A）、文書全体の点検（§9C.8）、変換（§9C.2 の informative conversions）
// test-all: unit
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticleText, fixtureTree, checkHtmlTable, convertAozora } from '../kit/core/article-text.mjs';
import { articleLayout, readArticle, validateArticle, parseStep, referenceKeys } from '../kit/core/article.mjs';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FX = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'), 'fixtures', 'article-text');
let failed = 0, passed = 0;
const t = (name, fn) => { try { fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}\n  ${String(e.message).split('\n').slice(0, 8).join('\n  ')}`); } };
const errorsOf = (ps) => ps.filter((p) => p.sev === 'error');
// 1 つの原稿を article.md として読み、ファイルの点検と文書全体の点検（文脈のいらないもの）をかける
const whole = (src, ctx = {}) => { const a = readArticle({ path: 'article.md' }, () => src); const v = validateArticle(a, ctx); return { a, problems: [...a.problems, ...v.problems] }; };

// ---------------------------------------------------------------- 仕様の fixtures
// 仕様の側の食い違い（仕様の持ち主に知らせ済み）：拒む例のうち、今の §9C.2 の本文では正しい書き方になっているもの
const SPEC_CONFLICT = {
  'proof-kind-unknown': 'prf:algorithm is one of the 15 kinds of §9C.2 (and valid/proof-algorithm accepts it); the invalid case predates 09ebd00',
};
const valid = fs.readdirSync(path.join(FX, 'valid')).sort();
const invalid = fs.readdirSync(path.join(FX, 'invalid')).sort();
let vOk = 0, iOk = 0;
for (const c of valid) {
  t(`valid/${c}`, () => {
    const src = fs.readFileSync(path.join(FX, 'valid', c, 'input.md'), 'utf8');
    const r = parseArticleText(src);
    assert.deepStrictEqual(fixtureTree(r.tree), JSON.parse(fs.readFileSync(path.join(FX, 'valid', c, 'expected.json'), 'utf8')));
    assert.deepStrictEqual(errorsOf(r.problems), [], 'no errors from the subset check');
    // 断片なので、ほかの所にある名前への相互参照（articleXref）は数えない
    assert.deepStrictEqual(errorsOf(whole(src).problems).filter((p) => p.code !== 'articleXref'), [], 'no document errors');
    vOk++;
  });
}
for (const c of invalid) {
  t(`invalid/${c}`, () => {
    const src = fs.readFileSync(path.join(FX, 'invalid', c, 'input.md'), 'utf8');
    const want = JSON.parse(fs.readFileSync(path.join(FX, 'invalid', c, 'expect.json'), 'utf8'));
    const errs = errorsOf(whole(src).problems);
    if (SPEC_CONFLICT[c]) { assert.equal(errs.length, 0, 'spec conflict case now rejected: drop it from SPEC_CONFLICT'); console.log(`note invalid/${c}: not rejected (spec conflict: ${SPEC_CONFLICT[c]})`); iOk++; return; }
    assert.ok(errs.length > 0, `not rejected (${want.error})`);
    assert.ok(errs.some((p) => p.spec === want.spec), `rejected under ${errs.map((p) => p.spec).join(', ')}, expected ${want.spec}`);
    iOk++;
  });
}

// ---------------------------------------------------------------- 作業フォルダの本文（§9C.1・§9C.1A）
t('layout: article.md', () => assert.deepStrictEqual(articleLayout(['deck.html', 'article.md', 'references.json']).index, { path: 'article.md', references: 'references.json' }));
t('layout: chapters in name order', () => assert.deepStrictEqual(articleLayout(['article/10.md', 'article/02.md', 'article/img/x.md', 'article/a.txt']).index, { chapters: ['article/02.md', 'article/10.md'] }));
t('layout: none', () => assert.equal(articleLayout(['deck.html']).index, null));
t('layout: both is an error', () => assert.equal(articleLayout(['article.md', 'article/01.md']).problems[0].code, 'articleIndex'));
t('index: both or neither', () => {
  assert.equal(readArticle({ path: 'article.md', chapters: ['article/1.md'] }, () => '').problems[0].data.why, 'both');
  assert.equal(readArticle({}, () => '').problems[0].data.why, 'neither');
});
const book = (files, index) => readArticle(index || { chapters: Object.keys(files) }, (p) => files[p], { lang: 'ja' });
const codes = (r) => r.problems.filter((p) => p.sev === 'error').map((p) => p.code);
t('chapters: ok with preface, chapters, appendices, afterword', () => {
  const r = book({ 'article/0.md': '---\ntitle: はじめに\nkind: preface\n---\n', 'article/1.md': '---\ntitle: 一\nchapter: 3\n---\n', 'article/2.md': '---\ntitle: 二\nchapter: 4\n---\n', 'article/3.md': '---\ntitle: 付録\nkind: appendix\n---\n', 'article/4.md': '---\ntitle: 付録 2\nkind: appendix\n---\n', 'article/5.md': '---\ntitle: あとがき\nkind: afterword\n---\n' });
  assert.deepStrictEqual(codes(r), []);
  assert.deepStrictEqual(r.files.map((f) => f.letter), [null, null, null, 'A', 'B', null]);
});
t('chapters: missing number and title', () => assert.deepStrictEqual(codes(book({ 'article/1.md': 'text\n' })), ['articleChapterNumber', 'articleChapterTitle']));
t('chapters: numbers must increase', () => assert.deepStrictEqual(codes(book({ 'article/1.md': '---\ntitle: a\nchapter: 4\n---\n', 'article/2.md': '---\ntitle: b\nchapter: 4\n---\n' })), ['articleChapterIncrease']));
t('chapters: kind order', () => assert.deepStrictEqual(codes(book({ 'article/1.md': '---\ntitle: a\nkind: appendix\n---\n', 'article/2.md': '---\ntitle: b\nchapter: 1\n---\n' })), ['articleChapterOrder']));
t('chapters: chapter on an appendix', () => assert.ok(codes(book({ 'article/1.md': '---\ntitle: a\nkind: appendix\nchapter: 2\n---\n' })).includes('articleKindChapter')));
t('chapters: lang, writing-mode and bibliography equal', () => {
  const r = book({ 'article/1.md': '---\ntitle: a\nchapter: 1\nwriting-mode: vertical-rl\n---\n', 'article/2.md': '---\ntitle: b\nchapter: 2\n---\n' });
  assert.deepStrictEqual(codes(r), ['articleChapterDiffer']);
  assert.equal(r.problems[0].data.member, 'writing-mode');
});
t('front matter: lang must equal metadata.lang', () => assert.deepStrictEqual(codes(book({ 'article.md': '---\nlang: en\n---\n' }, { path: 'article.md' })), ['articleLang']));
t('front matter: bibliography must equal the references file', () => assert.deepStrictEqual(codes(book({ 'article.md': '---\nbibliography: refs.json\n---\n' }, { path: 'article.md', references: 'references.json' })), ['articleBibliography']));
t('front matter: values and syntax', () => {
  assert.deepStrictEqual(errorsOf(parseArticleText('---\nchapter: 0\n---\n').problems).map((p) => p.code), ['articleFrontMatterValue']);
  assert.deepStrictEqual(errorsOf(parseArticleText('---\ntitle: [a, b]\n---\n').problems).map((p) => p.code), ['articleFrontMatter']);
  assert.deepStrictEqual(parseArticleText('---\ntitle: "第 4 章: 符号"\nnumbering: false\n---\n').fm, { title: '第 4 章: 符号', numbering: false });
});
t('encoding: BOM, CRLF, NFC', () => {
  assert.deepStrictEqual(errorsOf(parseArticleText('\uFEFFa\r\nb\n').problems).map((p) => p.data.what), ['bom', 'crlf']);
  assert.deepStrictEqual(errorsOf(parseArticleText('\u30AB\u3099\n').problems).map((p) => p.data.what), ['nfc']);
});

// ---------------------------------------------------------------- 文書全体（§9C.3・§9C.8）
t('labels unique across chapters and against slide ids', () => {
  const r = book({ 'article/1.md': '---\ntitle: a\nchapter: 1\n---\n$$x$$ (eq-a)\n', 'article/2.md': '---\ntitle: b\nchapter: 2\n---\n$$y$$ (eq-a)\n\n(sec-aaaaaa)=\n## s\n\n$$z$$ (s-k3f9q2)\n' });
  const v = validateArticle(r, { slideIds: new Set(['s-k3f9q2']) });
  assert.deepStrictEqual(v.problems.filter((p) => p.sev === 'error').map((p) => p.code), ['articleLabelDuplicate', 'articleLabelSlideId']);
});
t('cross-references, solutions, terms across chapters', () => {
  const r = book({ 'article/1.md': '---\ntitle: a\nchapter: 1\n---\n:::{exercise} 問\n:label: exr-a\n\nq\n:::\n\n[](#exr-a) [](#fig-none) {term}`平均`\n', 'article/2.md': '---\ntitle: b\nkind: appendix\n---\n:::{solution} exr-a\nans\n:::\n\n:::{solution} exr-a\nagain\n:::\n\n:::{glossary}\n平均\n: 和を個数で割ったもの。\n:::\n' });
  const v = validateArticle(r, {});
  assert.deepStrictEqual(v.problems.filter((p) => p.sev === 'error').map((p) => `${p.code}:${p.data.label || p.data.term}:${p.data.why || ''}`), ['articleXref:fig-none:', 'articleSolution:exr-a:twice']);
});
t('steps, citations, images, data-article, unlinked sections', () => {
  const src = '(sec-aaaaaa)=\n## A\n\n{step}`s-one:2` {step}`見る <s-two:9>` {step}`s-none:0` [@known; @unknown] ![x](images/a.png) ![y](images/b.png)\n\n(sec-bbbbbb)=\n## B\n\ntext\n';
  const ctx = { slideIds: new Set(['s-one', 's-two']), resolveStep: (s, k) => (s === 's-none' ? { why: 'slide' } : s === 's-two' && k === '9' ? { why: 'step', max: 3 } : null), references: new Set(['known']), exists: (p) => p === 'images/a.png', dataArticle: [{ slide: 's-two', ids: ['sec-zzzzzz'] }] };
  const v = whole(src, ctx).problems;
  assert.deepStrictEqual(v.map((p) => `${p.sev}:${p.code}`), ['error:articleStep', 'error:articleStep', 'error:articleCite', 'error:articleImage', 'error:articleDataArticle', 'warn:articleSectionUnlinked']);
  assert.equal(whole('[@a]\n', { references: null }).problems[0].data.why, 'no-references');
});
t('step syntax', () => {
  assert.deepStrictEqual(parseStep('s-k3f9q2:concl'), { text: null, slideKey: 's-k3f9q2', stepKey: 'concl' });
  assert.deepStrictEqual(parseStep('the animation <s-k3f9q2:0>'), { text: 'the animation', slideKey: 's-k3f9q2', stepKey: '0' });
  assert.equal(parseStep('s-k3f9q2'), null);
  assert.deepStrictEqual(errorsOf(parseArticleText('{step}`s-k3f9q2:01`\n').problems).map((p) => p.code), ['articleStepSyntax']);
});
t('references.json keys', () => {
  assert.deepStrictEqual([...referenceKeys('[{"id":"a"},{"id":"b"}]').keys], ['a', 'b']);
  assert.equal(referenceKeys('{}').problem.code, 'articleReferences');
});
t('section ids: missing, wrong prefix, form', () => {
  assert.deepStrictEqual(parseArticleText('## A\n').problems.map((p) => p.code), ['articleSectionId']);
  assert.deepStrictEqual(parseArticleText('(intro)=\n## A\n').problems.map((p) => p.code), ['articleLabel']);
  assert.deepStrictEqual(parseArticleText('(sec-abc)=\n## A\n').problems.map((p) => `${p.sev}:${p.code}`), ['warn:articleSectionIdForm']);
});

// ---------------------------------------------------------------- 部分集合の外（fixtures にない分）
const subsetCodes = (src) => errorsOf(parseArticleText(src).problems).map((p) => p.code);
t('backtick-fenced directive', () => assert.deepStrictEqual(subsetCodes('```{figure} a.png\n:alt: x\n\ncap\n```\n'), ['articleBacktickDirective']));
t('unknown directive option', () => assert.deepStrictEqual(subsetCodes(':::{figure} a.png\n:alt: x\n:width: 50%\n\ncap\n:::\n'), ['articleOption']));
t('figure inside an aside, solution inside an exercise', () => {
  assert.deepStrictEqual(subsetCodes('::::{aside} T\n:::{figure} a.png\n:alt: x\n\ncap\n:::\n::::\n'), ['articleNested']);
  assert.deepStrictEqual(subsetCodes('::::{exercise}\n:::{solution} exr-a\nx\n:::\n::::\n'), ['articleNested']);
});
t('glossary: one list, plain unique terms, only one', () => {
  assert.deepStrictEqual(subsetCodes(':::{glossary}\nA\n: a\n\nA\n: b\n:::\n'), ['articleGlossary']);
  assert.deepStrictEqual(subsetCodes(':::{glossary}\nA\n: a\n:::\n\n:::{glossary}\nB\n: b\n:::\n'), ['articleGlossary']);
});
t('footnotes: missing definition, unused, name', () => {
  assert.deepStrictEqual(parseArticleText('x[^a]\n\n[^b]: n\n').problems.map((p) => `${p.sev}:${p.code}`), ['error:articleFootnoteMissing', 'warn:articleFootnoteUnused']);
});
t('cite with prefix text', () => assert.deepStrictEqual(subsetCodes('[see @doe1948]\n'), ['articleCitePrefix']));
t('image path outside the archive', () => {
  for (const u of ['/etc/a.png', '../a.png', 'data:image/png;base64,AA', 'C:/a.png']) assert.deepStrictEqual(subsetCodes(`![x](${u})\n`), ['articleImagePath'], u);
});
t('figure without alt warns', () => assert.deepStrictEqual(parseArticleText(':::{figure} a.png\ncap\n:::\n').problems.map((p) => `${p.sev}:${p.code}`), ['warn:articleFigureAlt']));
t('HTML table parser: allow-list', () => {
  assert.deepStrictEqual(checkHtmlTable('<table>\n<thead>\n<tr><th rowspan="2" align="center">a</th></tr>\n</thead>\n<tbody>\n<tr><td colspan=2>x<br>&amp; <em>y</em><sub>2</sub></td></tr>\n</tbody>\n</table>'), []);
  for (const [h, why] of [
    ['<table><tr><td onclick="x()">a</td></tr></table>', /onclick/],
    ['<table><tr><td><a href="x">a</a></td></tr></table>', /<a>/],
    ['<table><tr><td colspan="0">a</td></tr></table>', /positive/],
    ['<table><tr><td align="justify">a</td></tr></table>', /align/],
    ['<table><tr><td>a</td></tr></table><p>x</p>', /<p>|end with/],
    ['<table><tr><td>a<!-- c --></td></tr></table>', /element|allowed/],
    ['<table><tr><td>a & b</td></tr></table>', /bare &/],
    ['<table><tr><td>a</td></table>', /does not close/],
    ['<table><td>a</td></table>', /inside <table>/],
    ['<table><tr><td><script>x</script></td></tr></table>', /script/],
    ['<table><tr><td>**b**</td></tr></table>', /Markdown/],
  ]) assert.match(checkHtmlTable(h).join('; '), why, h);
});

// ---------------------------------------------------------------- 変換（§9C.2 の informative conversions）
const conv = (src) => { const r = parseArticleText(src, { convert: true }); return { tree: fixtureTree(r.tree), errors: errorsOf(r.problems), conv: r.conversions.map((c) => c.to) }; };
t('convert: roles', () => {
  const r = conv('See {numref}`fig-a`, {cite:p}`doe1948`, {cite:t}`roe2001` and {math}`x^2`.\n');
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.conv, ['[](#fig-a)', '[@doe1948]', '@roe2001', '$…$']);
  const p = r.tree.children[0].children;
  assert.deepStrictEqual([p[1].type, p[1].url, p[3].type, p[5].type, p[5].kind, p[7].type], ['link', '#fig-a', 'citeGroup', 'cite', 'narrative', 'inlineMath']);
});
t('convert: admonition, proof:, list-table', () => {
  const r = conv(':::{note}\nRemember.\n:::\n\n:::{proof:theorem} T\nbody\n:::\n\n:::{list-table}\n:header-rows: 1\n\n* - a\n  - b\n:::\n');
  assert.deepStrictEqual(r.conv, [':::{aside} Note', '{prf:theorem}', 'a pipe table in :::{table}']);
  assert.deepStrictEqual(r.tree.children.map((n) => n.type), ['aside', 'proof', 'container']);
  assert.equal(r.tree.children[0].children[0].children[0].value, 'Note');
});
t('convert: Aozora ruby and emphasis dots', () => {
  const r = convertAozora('一人の｜下人《げにん》が羅生門《らしょうもん》の下で待っていた［＃「待っていた」に傍点］。');
  assert.equal(r.text, '一人の{ruby}`下人|げにん`が{ruby}`羅生門|らしょうもん`の下で*待っていた*。');
  assert.equal(r.conversions.length, 3);
});

console.log(`article-text fixtures: valid ${vOk}/${valid.length}, invalid ${iOk}/${invalid.length}`);
if (failed) { console.log(`${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`all ${passed} passed`);
