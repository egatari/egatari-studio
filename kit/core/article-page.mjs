// 作業フォルダの本文を読み、点検し（§9C.8）、読むための 1 枚の HTML（§9C.6 の <article id="egatari-article"> を
// <section id="egatari-readable"> に入れたもの）にする。組み立て（kit/build.mjs）と品質チェック（kit/check.mjs）が使う。
// 読み書きは env（kit/build.mjs の nodeEnv と同じ形：path・listFiles・readText・readBase64・exists・isFile・within・katex・katexDir）を通す。
// 再生器（kit/deck.js）にはまだ載せない（本文の窓は v0.6.5 の B）。1 ファイル（.ega.html）への書き出しは kit/core/portable.mjs が
// renderedArticle で本文を組み、#egatari-readable の最後に入れる（§9C.6・§9C.12）。
import { articleLayout, articleFiles, readArticle, validateArticle, referenceKeys, dataArticleOf, parseStep, assignSectionIds } from './article.mjs';
import { renderArticle, ARTICLE_CSS, esc } from './article-render.mjs';
export { ARTICLE_CSS };   // 再生器の本の窓の体裁（組み立てが articleCss で入れる。kit/core/portable.mjs も）
import { citationSettings } from './article-cite.mjs';
import { linkedPairs, currentLinkHashes, linkStates, pruneLinks, articleLinksProblems } from './article-links.mjs';
import { ARTICLE_LIMITS, visit } from './article-text.mjs';
import { analyzeSlideIds, readMacros, katexCss } from './build-core.mjs';
import { configObject } from './config-file.mjs';
import { FORMAT } from './format.mjs';

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const IMAGE_MAX = 16 << 20;
const SOURCE_MAX = 32 << 20;

// 返すもの：本文がなければ null。あれば {deckDir, index, article, ctx, problems, slides}。ctx は validateArticle に渡す文脈（resolveStep は呼び手が足す）
export function loadArticle(env, srcPath, opts = {}) {
  const P = env.path, deckDir = P.dirname(P.resolve(srcPath));
  const rels = env.listFiles(deckDir).map((f) => P.relative(deckDir, f).split(P.sep).join('/'));
  const abs = (rel) => P.join(deckDir, ...rel.split('/'));
  const read = (rel, max) => { const p = abs(rel); if (!env.within(p, deckDir)) throw new Error('outside the working folder'); return env.readText(p, max); };
  // egatari.json の article（読む順。§9C.7）。読めなければ順を決めずに知らせる
  let conf = null; const confProblems = [];
  if (rels.includes(FORMAT.CONFIG_FILE)) { try { conf = configObject(read(FORMAT.CONFIG_FILE, 16 << 20)); } catch (e) { confProblems.push({ sev: 'warn', code: 'articleConfig', spec: '§9C.7', file: FORMAT.CONFIG_FILE, line: null, data: { why: 'unreadable' } }); } }
  const layout = articleLayout(rels, conf);
  if (!layout.index) return layout.problems.length ? { deckDir, index: null, article: { files: [], problems: [] }, ctx: {}, problems: [...confProblems, ...layout.problems], slides: new Map(), abs } : null;
  const article = readArticle(layout.index, (rel) => read(rel, ARTICLE_LIMITS.fileBytes), { lang: opts.lang || '', convert: !!opts.convert, order: layout.order });
  const problems = [...confProblems, ...layout.problems, ...article.problems];
  let references, items = [];
  if (layout.index.references) {
    try { const r = referenceKeys(read(layout.index.references, 16 << 20), layout.index.references); references = r.keys; items = r.items; if (r.problem) problems.push(r.problem); }
    catch (e) { references = new Set(); problems.push({ sev: 'error', code: 'articleReferences', spec: '§9C.4', file: layout.index.references, line: null, data: { why: String(e.message || e).slice(0, 80) } }); }
  } else references = null;
  // 引用の書式と一覧（egatari.json の metadata.citations。§9C.4）
  const citations = conf && conf.metadata && typeof conf.metadata === 'object' && Object.prototype.hasOwnProperty.call(conf.metadata, 'citations') ? conf.metadata.citations : null;
  // スライド（id・見出し・data-article）とデッキのほかの id
  let ids = { slides: [], docIds: new Map() }, deckText = '';
  try { deckText = env.readText(srcPath, SOURCE_MAX); ids = analyzeSlideIds(deckText); } catch { /* 原稿が読めないときは組み立てが知らせる */ }
  const slides = new Map(ids.slides.map((s) => [s.key, { title: s.heading || s.key, id: s.id }]));
  const exists = (u) => { const p = abs(u); try { return env.within(p, deckDir) && env.exists(p) && env.isFile(p); } catch { return false; } };
  const ctx = { slideIds: new Set(ids.slides.filter((s) => s.id).map((s) => s.id)), otherIds: new Set(ids.docIds.keys()), dataArticle: dataArticleOf(ids.slides), references, exists, citations };
  return { deckDir, index: layout.index, order: layout.order, article, ctx, problems, slides, abs, items, citations, conf, deckText, rels, read };
}

// スライドと節のつながりの記録と今（§9C.5・§9C.7。kit/core/article-links.mjs）。L：loadArticle の結果。
// 返すもの：{pairs, current, recorded（egatari.json の articleLinks か null）, states, pruned（もうつながっていない組を外した記録か null）, removed, problems}
export async function articleLinkReport(L) {
  const pairs = linkedPairs(L.article, L.ctx.dataArticle || []);
  let narration = '';
  if (L.rels && L.rels.includes('narration.md')) { try { narration = L.read('narration.md', SOURCE_MAX); } catch { narration = ''; } }
  const current = await currentLinkHashes(L.article, pairs, L.deckText || '', narration);
  const has = L.conf && Object.prototype.hasOwnProperty.call(L.conf, 'articleLinks');
  const problems = [];
  let recorded = has ? L.conf.articleLinks : null;
  if (has) { const e = articleLinksProblems(recorded); if (e.length) { problems.push({ sev: 'warn', code: 'articleLinksShape', spec: '§9C.7', file: FORMAT.CONFIG_FILE, line: null, data: { why: e.slice(0, 3).join('; ') } }); if (!recorded || typeof recorded !== 'object' || Array.isArray(recorded)) recorded = null; } }
  const states = linkStates(recorded, current, pairs);
  const pr = pruneLinks(recorded, pairs);
  return { pairs, current, recorded, states, pruned: pr.links, removed: pr.removed, problems };
}

// 作業フォルダに本文のファイル（article.md・article/<名前>.md）があるか（本文の道具を読み込むかを決める。読みはしない）
export function hasArticleFiles(env, deckDir) {
  const P = env.path;
  if (typeof env.listFiles === 'function') {
    try { return env.listFiles(deckDir).some((f) => /^(?:article\.md|article\/[^/]+\.md)$/.test(P.relative(deckDir, f).split(P.sep).join('/'))); } catch { return false; }
  }
  return env.exists(P.join(deckDir, 'article.md')) || env.exists(P.join(deckDir, 'article'));
}
// 節の id（§9C.3）：本文のファイルの id のない ## の見出しに (sec-xxxxxx)= を足したもの（組み立て・書き出しが作業フォルダに書き戻す。npm run ids と同じ）。
// スライドの id・デッキのほかの id・本文のほかの名前を避ける。返すもの：{writes: {作業フォルダの中のパス: 字}, added: [{file, line, id, heading}]}
export function sectionIdWrites(env, srcPath, opts = {}) {
  const P = env.path, deckDir = P.dirname(P.resolve(srcPath));
  const rels = env.listFiles(deckDir).map((f) => P.relative(deckDir, f).split(P.sep).join('/'));
  const read = (rel, max) => { const p = P.join(deckDir, ...rel.split('/')); if (!env.within(p, deckDir)) throw new Error('outside the working folder'); return env.readText(p, max); };
  let conf = null;
  if (rels.includes(FORMAT.CONFIG_FILE)) { try { conf = configObject(read(FORMAT.CONFIG_FILE, 16 << 20)); } catch { conf = null; } }
  const layout = articleLayout(rels, conf);
  const writes = {}, added = [];
  if (!layout.index) return { writes, added };
  let ids = { slides: [], docIds: new Map() };
  try { ids = analyzeSlideIds(env.readText(srcPath, SOURCE_MAX)); } catch { /* 組み立てが知らせる */ }
  const taken = new Set([...ids.slides.map((s) => s.id || s.key), ...ids.docIds.keys()]);
  for (const rel of articleFiles(layout.index)) {
    let text;
    try { text = read(rel, ARTICLE_LIMITS.fileBytes); } catch { continue; }
    const r = assignSectionIds(text, taken, opts.rand);
    for (const a of r.added) { taken.add(a.id); added.push({ file: rel, ...a }); }
    if (r.added.length) writes[rel] = r.out;
  }
  return { writes, added };
}

// 本文のステップへのリンク（重ねずに）："<slideKey>:<stepKey>" の並び（check が再生器で行き先を確かめる）
export function stepLinksOf(article) {
  const out = new Set();
  for (const f of article.files) visit(f.tree, (n) => { if (n.type === 'mystRole' && n.name === 'step') { const s = parseStep(n.value); if (s) out.add(`${s.slideKey}:${s.stepKey}`); } });
  return [...out];
}

// 本文を読み、点検し（§9C.8）、実行時の形（§9C.6 の <article id="egatari-article">）に組む。opts：lang・title（metadata.title）・
// resolveStep（ステップがあるか。kit/core/article.mjs の validateArticle）。
// 返すもの：本文がなければ null。あれば {L（loadArticle の結果）, html（<article> の要素）, problems, warnings, lang}
export function renderedArticle(env, srcPath, opts = {}) {
  const L = loadArticle(env, srcPath, opts);
  if (!L) return null;
  const v = validateArticle(L.article, { ...L.ctx, ...(opts.resolveStep ? { resolveStep: opts.resolveStep } : {}) });
  const problems = [...L.problems, ...v.problems];
  if (!L.index) return { L, html: '', problems, warnings: [], lang: opts.lang || '' };
  const P = env.path;
  let macros = {};
  const mf = P.join(L.deckDir, 'macros.tex');
  try { if (env.exists(mf) && env.within(mf, L.deckDir)) macros = readMacros(env.readText(mf, 1 << 20)); } catch { /* なくてよい */ }
  const image = (u) => {
    const ext = (u.match(/\.([A-Za-z0-9]+)$/) || [])[1];
    const mime = ext && IMAGE_MIME[ext.toLowerCase()];
    if (!mime || !L.ctx.exists(u)) return null;
    try { return `data:${mime};base64,${env.readBase64(L.abs(u), IMAGE_MAX)}`; } catch { return null; }
  };
  const lang = opts.lang || L.article.lang || '';
  // 本の題は metadata.title（egatari.json にあればそれ。なければ呼び手の渡したもの：デッキの <title>）
  const mt = L.conf && L.conf.metadata && typeof L.conf.metadata.title === 'string' && L.conf.metadata.title ? L.conf.metadata.title : '';
  if (mt) opts = { ...opts, title: mt };
  const cs = citationSettings(L.citations === null ? undefined : L.citations, { book: !!(L.index && L.index.chapters) });
  const r = renderArticle(L.article, { lang, title: opts.title || '', katex: env.katex, macros, image, slides: L.slides, references: L.items, csl: L.items.length && typeof env.csl === 'function' ? env.csl() : null, citations: cs });
  problems.push(...r.problems);
  return { L, html: r.html, problems, warnings: r.warnings, lang, sections: v.sections, citeproc: r.citeproc };
}

// 読むための 1 枚の HTML。opts：lang・title（metadata.title）。返すもの：本文がなければ null。あれば {html, problems, warnings, stats}
export function articlePage(env, srcPath, opts = {}) {
  const R = renderedArticle(env, srcPath, opts);
  return R ? articlePageOf(env, R, opts) : null;
}
// renderedArticle の結果 R から読むための 1 枚の HTML を作る（編集アプリのプレビューの本も同じ：本文を 2 度読まない）
export function articlePageOf(env, R, opts = {}) {
  const { L, problems, lang } = R;
  if (!L.index) return { html: '', problems, warnings: [], index: null, stats: { files: 0, sections: 0, figures: 0, tables: 0, equations: 0 } };
  const r = { html: R.html, warnings: R.warnings };
  const title = L.article.files.length === 1 && L.article.files[0].fm.title ? L.article.files[0].fm.title : opts.title || '';
  const usesMath = /class="katex/.test(r.html);
  // 縦書きの本の頁は、根も縦書きにする：頁は右から左へ進み、開いたときは右端（本の初め）が見える（§9C.2・EPUB の page-progression-direction="rtl"）
  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}"${L.article.writingMode === 'vertical-rl' ? ' class="egatari-vertical-page"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${themeTokens(opts.themeCss || '')}
body{margin:0;background:var(--bg,Canvas);color:var(--fg,CanvasText);font-family:${/^ja\b/i.test(lang) ? (L.article.writingMode === 'vertical-rl' ? '"BIZ UDPMincho",serif' : '"BIZ UDPGothic",sans-serif') : 'system-ui,sans-serif'}}
${usesMath ? katexCss(env) : ''}
${ARTICLE_CSS}
html.egatari-vertical-page{writing-mode:vertical-rl}</style>
</head>
<body>
<section id="egatari-readable" lang="${esc(lang)}">
${r.html}
</section>
</body>
</html>
`;
  const count = (t) => { let n = 0; for (const f of L.article.files) visit(f.tree, (x) => { if (t(x)) n++; }); return n; };
  return {
    html, problems, warnings: r.warnings, index: L.index, citeproc: R.citeproc,
    // 再生器の本の窓に入れる本文（§9C.6 の <article>）とその体裁・言語（kit/build.mjs が組んだデッキに入れる）
    article: r.html, css: ARTICLE_CSS, lang,
    stats: { files: L.article.files.length, sections: count((x) => x.type === 'heading' && x.depth === 2), figures: count((x) => x.type === 'container' && x.kind === 'figure' && !x.subcontainer), tables: count((x) => x.type === 'container' && x.kind === 'table'), equations: count((x) => x.type === 'math' && x.label) },
  };
}
// 組んだデッキの :root の色の変数（--fg・--bg・--muted・--line・--accent2・--term・--emph）だけを写す（色を直接書かない）
export function themeTokens(css) {
  const decl = [];
  for (const m of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/:root\s*\{([^{}]*)\}/g)) for (const d of m[1].split(';')) if (/^\s*--(fg|bg|muted|line|accent2|term|emph|emph-from-hue|base|complement)\s*:/.test(d)) decl.push(d.trim());
  return decl.length ? `:root{${decl.join(';')}}` : '';
}
// 本文の頁の既定の書き出し先：デッキの出力の横に <名前>.article.html
export function articlePageOut(P, deckOut) {
  const p = P.parse(deckOut);
  return P.join(p.dir, `${p.name}.article.html`);
}
