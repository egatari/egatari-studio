// 本文の道具（format spec §9C。編集アプリが、本のある教材を開いたときにだけ読み込む。tools/build-app.mjs が 1 本にまとめる：
// 配信版は dist/article-tools.js、1 ファイル版は RES.lazyJs.article の字）。app/article-loader.js がページと組み立ての Worker で動かす。
// myst-parser（本文の構文解析）とその仲間、本文の組み・点検・つながり（kit/core/article*.mjs）、引用の書式と言語の写し（vendor/csl。CC BY-SA 3.0）。
// citeproc-js（CPAL-1.0）はここに入れず、手を加えないファイルのまま別に読み込む（app/article-loader.js の loadCiteproc。NOTICE）。
// kit/core のほかの部品（build-core・config-file・format・narration-parse）と KaTeX は、読み込む側がすでに持つものを使う
// （globalThis.__egatariArticleHost。app/article-host.js。tools/build-app.mjs の articleHostPlugin）
import apa from '../vendor/csl/styles/apa.csl?text';
import ieee from '../vendor/csl/styles/ieee.csl?text';
import sist02 from '../vendor/csl/styles/sist02.csl?text';
import localeJa from '../vendor/csl/locales/locales-ja-JP.xml?text';
import localeEn from '../vendor/csl/locales/locales-en-US.xml?text';

export { loadArticle, articleLinkReport, renderedArticle, articlePage, articlePageOf, sectionIdWrites, stepLinksOf, hasArticleFiles } from '../kit/core/article-page.mjs';
export { articleMessage, articleWhere, ARTICLE_MESSAGES } from '../kit/core/article-messages.mjs';
export { articleLayout, articleFiles, readArticle, validateArticle, stepResolver, parseStep, ARTICLE_FILE, CHAPTER_DIR, REFERENCES_FILE } from '../kit/core/article.mjs';
export { linkedPairs, currentLinkHashes, linkStates, pruneLinks, recordLinks } from '../kit/core/article-links.mjs';
export { CITEPROC_CREDIT, CITATION_STYLES } from '../kit/core/article-cite.mjs';
export { ARTICLE_CSS } from '../kit/core/article-render.mjs';

const STYLES = { apa, ieee, sist02 };
const LOCALES = { 'ja-JP': localeJa, 'en-US': localeEn };
// kit/build.mjs の cslNode と同じ形（kit/core/article-cite.mjs の opts.csl）。CSL は citeproc の名前空間（読み込んだもの）
export function cslWith(CSL) {
  return { CSL, style: (id) => (Object.prototype.hasOwnProperty.call(STYLES, id) ? STYLES[id] : null), locale: (tag) => (Object.prototype.hasOwnProperty.call(LOCALES, tag) ? LOCALES[tag] : null) };
}
