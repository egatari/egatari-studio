// 作業フォルダの本文を読み、点検し（§9C.8）、読むための 1 枚の HTML（§9C.6 の <article id="egatari-article"> を
// <section id="egatari-readable"> に入れたもの）にする。組み立て（kit/build.mjs）と品質チェック（kit/check.mjs）が使う。
// 読み書きは env（kit/build.mjs の nodeEnv と同じ形：path・listFiles・readText・readBase64・exists・isFile・within・katex・katexDir）を通す。
// 再生器（kit/deck.js）にはまだ載せない（本文の窓は v0.6.5 の B）。1 ファイル（.ega.html）への書き出しもまだ（A §7）
import { articleLayout, readArticle, validateArticle, referenceKeys, dataArticleOf, parseStep } from './article.mjs';
import { renderArticle, ARTICLE_CSS, esc } from './article-render.mjs';
import { ARTICLE_LIMITS, visit } from './article-text.mjs';
import { analyzeSlideIds, readMacros, katexCss } from './build-core.mjs';

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const IMAGE_MAX = 16 << 20;
const SOURCE_MAX = 32 << 20;

// 返すもの：本文がなければ null。あれば {deckDir, index, article, ctx, problems, slides}。ctx は validateArticle に渡す文脈（resolveStep は呼び手が足す）
export function loadArticle(env, srcPath, opts = {}) {
  const P = env.path, deckDir = P.dirname(P.resolve(srcPath));
  const rels = env.listFiles(deckDir).map((f) => P.relative(deckDir, f).split(P.sep).join('/'));
  const layout = articleLayout(rels);
  if (!layout.index) return null;
  const abs = (rel) => P.join(deckDir, ...rel.split('/'));
  const read = (rel, max) => { const p = abs(rel); if (!env.within(p, deckDir)) throw new Error('outside the working folder'); return env.readText(p, max); };
  const article = readArticle(layout.index, (rel) => read(rel, ARTICLE_LIMITS.fileBytes), { lang: opts.lang || '', convert: !!opts.convert });
  const problems = [...layout.problems, ...article.problems];
  let references;
  if (layout.index.references) {
    try { const r = referenceKeys(read(layout.index.references, 16 << 20)); references = r.keys; if (r.problem) problems.push(r.problem); }
    catch (e) { references = new Set(); problems.push({ sev: 'error', code: 'articleReferences', spec: '§9C.4', file: layout.index.references, line: null, data: { why: String(e.message || e).slice(0, 80) } }); }
  } else references = null;
  // スライド（id・見出し・data-article）とデッキのほかの id
  let ids = { slides: [], docIds: new Map() };
  try { ids = analyzeSlideIds(env.readText(srcPath, SOURCE_MAX)); } catch { /* 原稿が読めないときは組み立てが知らせる */ }
  const slides = new Map(ids.slides.map((s) => [s.key, { title: s.heading || s.key, id: s.id }]));
  const exists = (u) => { const p = abs(u); try { return env.within(p, deckDir) && env.exists(p) && env.isFile(p); } catch { return false; } };
  const ctx = { slideIds: new Set(ids.slides.filter((s) => s.id).map((s) => s.id)), otherIds: new Set(ids.docIds.keys()), dataArticle: dataArticleOf(ids.slides), references, exists };
  return { deckDir, index: layout.index, article, ctx, problems, slides, abs };
}

// 本文のステップへのリンク（重ねずに）："<slideKey>:<stepKey>" の並び（check が再生器で行き先を確かめる）
export function stepLinksOf(article) {
  const out = new Set();
  for (const f of article.files) visit(f.tree, (n) => { if (n.type === 'mystRole' && n.name === 'step') { const s = parseStep(n.value); if (s) out.add(`${s.slideKey}:${s.stepKey}`); } });
  return [...out];
}

// 読むための 1 枚の HTML。opts：lang・title（metadata.title）。返すもの：本文がなければ null。あれば {html, problems, warnings, stats}
export function articlePage(env, srcPath, opts = {}) {
  const L = loadArticle(env, srcPath, opts);
  if (!L) return null;
  const v = validateArticle(L.article, L.ctx);
  const problems = [...L.problems, ...v.problems];
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
  const r = renderArticle(L.article, { lang, title: opts.title || '', katex: env.katex, macros, image, slides: L.slides });
  const title = L.article.files.length === 1 && L.article.files[0].fm.title ? L.article.files[0].fm.title : opts.title || '';
  const usesMath = /class="katex/.test(r.html);
  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${themeTokens(opts.themeCss || '')}
body{margin:0;background:var(--bg,Canvas);color:var(--fg,CanvasText);font-family:${/^ja\b/i.test(lang) ? (L.article.writingMode === 'vertical-rl' ? '"BIZ UDPMincho",serif' : '"BIZ UDPGothic",sans-serif') : 'system-ui,sans-serif'}}
${usesMath ? katexCss(env) : ''}
${ARTICLE_CSS}</style>
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
    html, problems, warnings: r.warnings, index: L.index,
    stats: { files: L.article.files.length, sections: count((x) => x.type === 'heading' && x.depth === 2), figures: count((x) => x.type === 'container' && x.kind === 'figure' && !x.subcontainer), tables: count((x) => x.type === 'container' && x.kind === 'table'), equations: count((x) => x.type === 'math' && x.label) },
  };
}
// 組んだデッキの :root の色の変数（--fg・--bg・--muted・--line・--accent2・--term・--emph）だけを写す（色を直接書かない）
function themeTokens(css) {
  const decl = [];
  for (const m of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/:root\s*\{([^{}]*)\}/g)) for (const d of m[1].split(';')) if (/^\s*--(fg|bg|muted|line|accent2|term|emph|emph-from-hue|base|complement)\s*:/.test(d)) decl.push(d.trim());
  return decl.length ? `:root{${decl.join(';')}}` : '';
}
// 本文の頁の既定の書き出し先：デッキの出力の横に <名前>.article.html
export function articlePageOut(P, deckOut) {
  const p = P.parse(deckOut);
  return P.join(p.dir, `${p.name}.article.html`);
}
