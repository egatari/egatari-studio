// 本文（article-v1、format spec §9C）：作業フォルダの本文のファイルを見つけ（§9C.1・§9C.1A）、読み（kit/core/article-text.mjs）、
// ファイルをまたぐ決まり（章の番号・種類の順・lang・writing-mode・bibliography）と、文書全体の点検（§9C.8：名前の重なり・相互参照・
// 解答の問・用語・ステップへのリンク・引用の鍵・画像・スライドの data-article）を行う。番号と HTML は kit/core/article-render.mjs。
// 編集アプリと共有する（node: の読み込み・fs を使わない。読むのは渡された read・exists を通す）。
import { parseArticleText, visit, plain, ARTICLE_LIMITS, CITE_KEY_RE } from './article-text.mjs';
import { citationSettings } from './article-cite.mjs';

export const ARTICLE_FILE = 'article.md';
export const CHAPTER_DIR = 'article';
export const REFERENCES_FILE = 'references.json';
const KIND_ORDER = { preface: 0, chapter: 1, appendix: 2, afterword: 3 };
const CHAPTER_RE = /^article\/[^/]+\.md$/;

// 作業フォルダのファイルの一覧（作業フォルダからの相対パス、/ 区切り）と egatari.json の object（conf。なければ null）から index.article を決める（§9C.1・§9C.7）。
//   conf.article があればそれ（読む順もそれ。ないファイルは誤り、載っていない章のファイルは警告）。
//   なければ article.md で {path}、article/<名前>.md で {chapters}（名前の符号位置の順。読んだ後に readArticle が種類の順に並べ直す：order: 'kind'）。
//   両方あれば誤り（§9C.8 の 7）。references.json があれば references。本文がなければ index: null
export function articleLayout(paths, conf = null) {
  const set = new Set(paths);
  const chapters = paths.filter((p) => CHAPTER_RE.test(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const problems = [];
  const ca = conf && Object.prototype.hasOwnProperty.call(conf, 'article') ? conf.article : undefined;
  if (ca !== undefined) {
    const bad = (why, path = null) => { problems.push(D('error', 'articleConfig', '§9C.7', 'egatari.json', null, { why, path })); };
    if (!ca || typeof ca !== 'object' || Array.isArray(ca)) { bad('shape'); return { index: null, problems, order: 'config' }; }
    const index = {};
    if (ca.path !== undefined) { if (ca.path !== ARTICLE_FILE) bad('path', String(ca.path)); index.path = ca.path; }
    if (ca.chapters !== undefined) {
      if (!Array.isArray(ca.chapters) || !ca.chapters.length || ca.chapters.some((c) => typeof c !== 'string' || !CHAPTER_RE.test(c)) || new Set(ca.chapters).size !== ca.chapters.length) bad('chapters');
      else index.chapters = ca.chapters.slice();
    }
    if (ca.references !== undefined) { index.references = ca.references; if (!set.has(ca.references)) bad('missing', String(ca.references)); }
    for (const p of articleFiles(index)) if (!set.has(p)) bad('missing', p);
    const listed = new Set(articleFiles(index));
    for (const p of [...(set.has(ARTICLE_FILE) ? [ARTICLE_FILE] : []), ...chapters]) if (!listed.has(p)) problems.push(D('warn', 'articleUnlisted', '§9C.1', p, null, {}));
    return { index, problems, order: 'config' };
  }
  let index = null;
  if (set.has(ARTICLE_FILE) && chapters.length) problems.push(D('error', 'articleIndex', '§9C.8', null, null, { why: 'both', chapters: chapters.length }));
  if (set.has(ARTICLE_FILE)) index = { path: ARTICLE_FILE };
  else if (chapters.length) index = { chapters };
  if (index && set.has(REFERENCES_FILE)) index.references = REFERENCES_FILE;
  return { index, problems, order: index && index.chapters ? 'kind' : null };
}
export const articleFiles = (index) => (!index ? [] : index.path ? [index.path] : Array.isArray(index.chapters) ? index.chapters.slice() : []);

// 本文を読む。read(rel) は文字列を返す（ないときは例外）。opts.lang：metadata.lang（デッキの言語）。opts.convert：変換できる書き方を直す。
// opts.order：'kind' なら章を種類の順に並べ直す（articleLayout の order。egatari.json に順がないとき）
// 返すもの：{index, files: [{path, fm, tree, kind, chapter, letter, problems}], lang, writingMode, problems}（problems は全部。file 付き）
export function readArticle(index, read, opts = {}) {
  const problems = [];
  const files = [];
  if (!index) return { index, files, problems, lang: opts.lang || '', writingMode: 'horizontal-tb' };
  const has = (k) => Object.prototype.hasOwnProperty.call(index, k);
  if (has('path') === has('chapters')) problems.push(D('error', 'articleIndex', '§9C.8', null, null, { why: has('path') ? 'both' : 'neither' }));
  for (const p of articleFiles(index)) {
    let text;
    try { text = read(p); } catch (e) { problems.push(D('error', 'articleRead', '§9C.1', p, null, { why: String(e && e.message || e).slice(0, 120) })); continue; }
    if (text.length > ARTICLE_LIMITS.fileBytes) { problems.push(D('error', 'articleTooLarge', '§9C.1', p, null, { bytes: text.length, max: ARTICLE_LIMITS.fileBytes })); continue; }
    const r = parseArticleText(text, { convert: !!opts.convert });
    const kind = r.fm.kind || 'chapter';
    files.push({ path: p, source: text, lineOffset: r.lineOffset, fm: r.fm, tree: r.tree, kind, chapter: kind === 'chapter' ? r.fm.chapter ?? null : null, letter: null, conversions: r.conversions });
    for (const x of r.problems) problems.push({ ...x, file: p });
  }
  // egatari.json に読む順がなければ、種類の順（前書き・章・付録・後書き）、その中はファイルの名前の順（§9C.7）
  if (opts.order === 'kind' && index.chapters) {
    files.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
    index.chapters = files.map((f) => f.path);
  }
  // 付録は読む順に A、B、…（§9C.1A）
  let a = 0;
  for (const f of files) if (f.kind === 'appendix') f.letter = letterOf(a++);
  // 章のファイル（§9C.1A・§9C.8 の 7）
  if (index.chapters) {
    let last = -1, lastNum = 0;
    for (const f of files) {
      if (f.kind === 'chapter') {
        if (f.fm.chapter === undefined && !problems.some((p) => p.file === f.path && p.code === 'articleFrontMatterValue' && p.data.member === 'chapter')) problems.push(D('error', 'articleChapterNumber', '§9C.1A', f.path, 1, {}));
        else if (f.fm.chapter <= lastNum) problems.push(D('error', 'articleChapterIncrease', '§9C.1A', f.path, 1, { chapter: f.fm.chapter, before: lastNum }));
        if (f.fm.chapter !== undefined) lastNum = f.fm.chapter;
        if (!f.fm.title) problems.push(D('error', 'articleChapterTitle', '§9C.1A', f.path, 1, {}));
      }
      const o = KIND_ORDER[f.kind];
      if (o < last) problems.push(D('error', 'articleChapterOrder', '§9C.1A', f.path, 1, { kind: f.kind }));
      last = Math.max(last, o);
    }
  }
  // lang・writing-mode・bibliography：本文の言語は metadata.lang（§9C.2）。章のファイルどうしで同じ
  const deckLang = opts.lang || '';
  for (const f of files) {
    if (f.fm.lang !== undefined && deckLang && f.fm.lang.toLowerCase() !== deckLang.toLowerCase()) problems.push(D('error', 'articleLang', '§9C.2', f.path, 1, { lang: f.fm.lang, deck: deckLang }));
    if (f.fm.bibliography !== undefined && f.fm.bibliography !== index.references) problems.push(D('error', 'articleBibliography', '§9C.2', f.path, 1, { value: f.fm.bibliography, references: index.references || null }));
  }
  if (files.length > 1) {
    for (const m of ['lang', 'writing-mode', 'bibliography']) {
      const vals = new Set(files.map((f) => (f.fm[m] === undefined ? '' : String(f.fm[m]))));
      if (vals.size > 1) problems.push(D('error', 'articleChapterDiffer', '§9C.2', null, null, { member: m, values: [...vals].map((v) => v || '(none)') }));
    }
  }
  const writingMode = (files.find((f) => f.fm['writing-mode']) || { fm: { 'writing-mode': 'horizontal-tb' } }).fm['writing-mode'];
  return { index, files, problems, lang: deckLang || (files.find((f) => f.fm.lang) || { fm: {} }).fm.lang || '', writingMode };
}

// 文書全体の点検（§9C.8）。ctx（どれも任意。ないものは見ない）：
//   slideIds：スライドの id の Set（名前の重なり・ステップへのリンクの行き先）。otherIds：デッキのほかの id（名前の重なり）
//   resolveStep(slideKey, stepKey)：ステップがあれば null、なければ {why: 'slide'|'not-id'|'step'|'concl', max?}（スライドがないときは slideIds だけで見る）
//   dataArticle：[{slide, ids: [...]}]（スライドの data-article）
//   references：引用の鍵の Set（references.json の id）。null は「文献のファイルがない」、undefined は見ない
//   exists(path)：画像が作業フォルダにあるか
//   citations：metadata.citations（egatari.json。§9C.4。undefined なら書式と一覧の決まりは見ない。null は「書いていない」）
export function validateArticle(article, ctx = {}) {
  const problems = [];
  const labels = new Map();   // 小文字にした名前 → {label, file, line, type, kind}
  const sections = new Map();   // 節の id → {file, line}
  const exercises = new Set(), solutions = new Map();
  const glossaryTerms = new Set();
  let glossaryAt = null;
  const lineOf = (f, n) => (n && n.position ? n.position.start.line + (f.lineOffset || 0) : null);
  // 行の差（前付け）を木から求められないので、readArticle の parse の結果に合わせて保つ
  for (const f of article.files) if (f.lineOffset === undefined) f.lineOffset = frontLines(f.source);
  // スライドの id とデッキのほかの id（注目の演出の目印など）：本文の名前と同じ名前空間（§9C.3）
  const others = new Set([...(ctx.slideIds || []), ...(ctx.otherIds || [])].map((x) => String(x).toLowerCase()));
  // 1 回目：名前・節・問・用語集
  for (const f of article.files) {
    visit(f.tree, (n) => {
      if (n.label && ['heading', 'math', 'container', 'aside', 'proof', 'exercise', 'solution'].includes(n.type) && !(n.type === 'exercise' && n.hidden)) {
        const k = String(n.label).toLowerCase();
        const at = { label: String(n.label), file: f.path, line: lineOf(f, n), type: n.type };
        if (labels.has(k)) { const o = labels.get(k); problems.push(D('error', 'articleLabelDuplicate', '§9C.3', f.path, at.line, { label: at.label, other: o.file, otherLine: o.line })); }
        else labels.set(k, at);
        if (others.has(k)) problems.push(D('error', 'articleLabelSlideId', '§9C.3', f.path, at.line, { label: at.label }));
        if (n.type === 'heading' && n.depth === 2) sections.set(String(n.label), { file: f.path, line: at.line, heading: plain(n), kind: f.kind });
        if (n.type === 'exercise') exercises.add(k);
      }
      if (n.type === 'glossary') {
        if (glossaryAt) problems.push(D('error', 'articleGlossary', '§9C.2', f.path, lineOf(f, n), { why: 'second', other: glossaryAt }));
        else glossaryAt = f.path;
        visit(n, (d) => { if (d.type === 'definitionTerm') glossaryTerms.add(plain(d).trim()); });
      }
    });
  }
  // 2 回目：参照
  const linkedSections = new Set();
  const cited = new Set();
  for (const f of article.files) {
    let section = null;
    for (const top of f.tree.children || []) {
      if (top.type === 'heading' && top.depth === 2) section = top.label ? String(top.label) : null;
      visit(top, (n, parents) => {
        const line = lineOf(f, n);
        if (n.type === 'link' && String(n.url || '').startsWith('#')) {
          const target = String(n.url).slice(1);
          if (!labels.has(target.toLowerCase())) problems.push(D('error', 'articleXref', '§9C.8', f.path, line, { label: target }));
        }
        if (n.type === 'crossReference' && String(n.identifier || '').startsWith('term-') && !parents.some((p) => p.type === 'admonitionTitle')) {
          const term = String(n.label || '').trim();
          if (!glossaryTerms.has(term)) problems.push(D('error', 'articleTerm', '§9C.8', f.path, line, { term, glossary: !!glossaryAt }));
        }
        if (n.type === 'solution') {
          const t = n.children && n.children[0] && n.children[0].type === 'admonitionTitle' ? n.children[0].children.find((c) => c.type === 'crossReference') : null;
          const target = t ? String(t.label || t.identifier || '') : '';
          const k = target.toLowerCase();
          if (!labels.has(k)) problems.push(D('error', 'articleSolution', '§9C.8', f.path, line, { label: target, why: 'missing' }));
          else if (!exercises.has(k)) problems.push(D('error', 'articleSolution', '§9C.8', f.path, line, { label: target, why: 'not-exercise' }));
          else if (solutions.has(k)) problems.push(D('error', 'articleSolution', '§9C.8', f.path, line, { label: target, why: 'twice', other: solutions.get(k) }));
          else solutions.set(k, `${f.path}:${line}`);
        }
        if (n.type === 'mystRole' && n.name === 'step') {
          const s = parseStep(n.value);
          if (s && section) { linkedSections.add(section); }
          if (s && ctx.slideIds) {
            const r = ctx.resolveStep ? ctx.resolveStep(s.slideKey, s.stepKey) : (ctx.slideIds.has(s.slideKey) ? null : { why: 'slide' });
            if (r) problems.push(D('error', 'articleStep', '§9C.8', f.path, line, { value: `${s.slideKey}:${s.stepKey}`, ...r }));
          }
        }
        if (n.type === 'cite') cited.add(String(n.label || n.identifier || ''));
        if (n.type === 'cite' && ctx.references !== undefined) {
          const key = String(n.label || n.identifier || '');
          if (ctx.references === null) problems.push(D('error', 'articleCite', '§9C.8', f.path, line, { key, why: 'no-references' }));
          else if (!ctx.references.has(key)) problems.push(D('error', 'articleCite', '§9C.8', f.path, line, { key, why: 'missing' }));
        }
        if (n.type === 'image' && ctx.exists && !ctx.exists(String(n.url || ''))) problems.push(D('error', 'articleImage', '§9C.8', f.path, line, { path: String(n.url || '') }));
      });
    }
  }
  // 引用の書式と一覧（§9C.4・§9C.8 の 7）：ない書式は既定で組んで警告、list: chapter は chapters のときだけ。引いていない文献は警告（§9C.4）
  if (ctx.citations !== undefined) for (const p of citationSettings(ctx.citations === null ? undefined : ctx.citations, { book: !!(article.index && article.index.chapters) }).problems) problems.push({ ...p, file: 'egatari.json' });
  if (ctx.references) { const un = [...ctx.references].filter((k) => !cited.has(k)); if (un.length) problems.push(D('warn', 'articleUncited', '§9C.4', article.index && article.index.references || 'references.json', null, { keys: un.slice(0, 20), count: un.length })); }
  // スライドの data-article（§9C.5・§9C.8 の 4）
  for (const d of ctx.dataArticle || []) for (const id of d.ids) {
    if (!sections.has(id)) problems.push(D('error', 'articleDataArticle', '§9C.8', null, null, { slide: d.slide, section: id }));
    else linkedSections.add(id);
  }
  // どのスライドにもつながらない節（§9C.8 の SHOULD。スライドがあるときだけ）
  // kind: chapter のファイルの節だけ（前書き・付録・後書きはスライドを持たないのが普通。§9C.8）
  if (ctx.slideIds && ctx.slideIds.size) for (const [id, s] of sections) if (s.kind === 'chapter' && !linkedSections.has(id)) problems.push(D('warn', 'articleSectionUnlinked', '§9C.8', s.file, s.line, { section: id, heading: s.heading.slice(0, 40) }));
  return { problems, labels, sections };
}

// {step}`s-k3f9q2:3` / {step}`字 <s-k3f9q2:3>` → {text, slideKey, stepKey}（書き方が違えば null）
export function parseStep(value) {
  const v = String(value || '').trim();
  let m = v.match(/^([A-Za-z][A-Za-z0-9_-]{0,63}):(0|[1-9][0-9]{0,2}|concl)$/);
  if (m) return { text: null, slideKey: m[1], stepKey: m[2] };
  m = v.match(/^([\s\S]*?\S)\s*<([A-Za-z][A-Za-z0-9_-]{0,63}):(0|[1-9][0-9]{0,2}|concl)>$/);
  return m ? { text: m[1], slideKey: m[2], stepKey: m[3] } : null;
}
// references.json（CSL-JSON の配列）の鍵と項目。読めなければ {keys: 空, items: [], problem}。
// 項目の id は重ならず、鍵の書式（§9C.4）に合うこと（合わないものは誤り。組むときは使わない）
export function referenceKeys(text, file = REFERENCES_FILE) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return { keys: new Set(), items: [], problem: D('error', 'articleReferences', '§9C.4', file, null, { why: 'not JSON' }) }; }
  if (!Array.isArray(j)) return { keys: new Set(), items: [], problem: D('error', 'articleReferences', '§9C.4', file, null, { why: 'not an array' }) };
  const keys = new Set(), items = [], bad = [];
  for (const it of j) {
    if (!it || typeof it !== 'object' || Array.isArray(it) || typeof it.id !== 'string') { bad.push('(no id)'); continue; }
    if (!CITE_KEY_RE.test(it.id) || it.id.length > 64) { bad.push(it.id.slice(0, 40)); continue; }
    if (keys.has(it.id)) { bad.push(`${it.id} (twice)`); continue; }
    keys.add(it.id); items.push(it);
  }
  return { keys, items, problem: bad.length ? D('error', 'articleReferences', '§9C.4', file, null, { why: `bad ids: ${bad.slice(0, 5).join(', ')}` }) : null };
}
// スライドの原稿（deck.html）の data-article="sec-… sec-…"（§9C.5）。返すもの：[{slide, ids}]
export function dataArticleOf(slides) {
  return slides.filter((s) => s.dataArticle).map((s) => ({ slide: s.id || s.key, ids: String(s.dataArticle).trim().split(/\s+/).filter(Boolean) }));
}

export const letterOf = (i) => (i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
function frontLines(src) { const m = String(src || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').match(/^---\n[\s\S]*?\n---(?:\n|$)/); return m ? m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0) : 0; }
function D(sev, code, spec, file, line, data = {}) { return { sev, code, spec, file, line: line || null, data }; }

// 節の id を道具が付ける（§9C.3：id のない ## の見出しの前の行に (sec-xxxxxx)= を足す。作者・AI には書かせない）。
// taken：避ける id（スライドの id・ほかの本文の名前）。返すもの：{out, added: [{line, id, heading}]}。改行（CRLF / LF）はそのまま
export function assignSectionIds(text, taken = new Set(), rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const r = parseArticleText(text);
  const used = new Set([...taken].map((x) => String(x).toLowerCase()));
  visit(r.tree, (n) => { if (n.label) used.add(String(n.label).toLowerCase()); });
  const lines = text.split(/\r?\n/);
  const added = [];
  for (const n of r.tree.children || []) {
    if (n.type !== 'heading' || n.depth !== 2 || n.label || !n.position) continue;
    let id;
    for (let k = 0; k < 1000 && (!id || used.has(id)); k++) id = 'sec-' + [...rand(6)].map((b) => B32[b & 31]).join('');
    used.add(id);
    added.push({ line: n.position.start.line + r.lineOffset, id, heading: plain(n) });
  }
  // 下から足す（行の番号がずれないように）
  for (const a of [...added].reverse()) lines.splice(a.line - 1, 0, `(${a.id})=`);
  return { out: added.length ? lines.join(eol) : text, added };
}
