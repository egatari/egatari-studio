// 本（format spec §9C）の道具を、本のある教材を開いたときにだけ読み込む（app.js を重くしない）。
//   本文の道具 app/article-tools.js（myst-parser など。tools/build-app.mjs が 1 本にまとめる）
//   citeproc-js（npm の citeproc_commonjs.js を手を加えずに。CPAL-1.0、NOTICE）：本が文献を引くときだけ
// 字の出どころ：配信版は同じサイトのファイル（dist/article-tools.js・dist/vendor/citeproc/citeproc_commonjs.js）、1 ファイル版（file://）は
// 同梱の字（RES.lazyJs。別のファイルを読めないので）。動かし方：ページはその字の <script> を入れる（決まりの 'unsafe-inline'。eval はしない）、
// 組み立ての Worker は Worker の字の後ろにつなげて作り直す（worker-src blob:。app/build-client.js の setExtra。字は Worker の字の後ろ：Worker の字が先に道具の使う部品を置く）
//   const L = createArticleLoader(RES)
//   await L.tools()          → 本文の道具（ページ）
//   await L.csl()            → {CSL, style, locale}（kit/core/article-cite.mjs の opts.csl。citeproc を読み込む）
//   await L.workerPrelude(cite) → Worker の字の後ろにつなげる字（本文の道具と、cite なら citeproc）
//   L.loaded()               → {tools, citeproc}（読み込んだか）
import { setArticleHost } from './article-host.js';
import { fetchBounded } from './bounded-read.js';

const FILES = { article: 'article-tools.js', citeproc: 'vendor/citeproc/citeproc_commonjs.js' };
const MAX = { article: 8 << 20, citeproc: 4 << 20 };
// citeproc_commonjs.js は最後に module.exports = CSL と書く（CommonJS）。字を変えずに、関数の中で動かして名前空間を受け取る
const wrapCiteproc = (src) => `(function(module, exports){\n${src}\n;globalThis.__egatariCSL = module.exports;})({exports: {}}, {});\n`;

export function createArticleLoader(res, { doc = typeof document !== 'undefined' ? document : null } = {}) {
  const src = new Map();
  async function source(name) {
    if (src.has(name)) return src.get(name);
    const p = (async () => {
      if (res.lazyJs && typeof res.lazyJs[name] === 'string') return res.lazyJs[name];
      // 大きさは読む前（Content-Length）と読みながら上限と比べる（app/bounded-read.js）
      try { return new TextDecoder().decode(await fetchBounded(new URL(FILES[name], doc.baseURI), { max: MAX[name], what: FILES[name] })); }
      catch (e) { throw Object.assign(new Error(`${FILES[name]}: ${(e && e.message) || e}`), { code: 'article-tools' }); }
    })();
    src.set(name, p);
    p.catch(() => src.delete(name));
    return p;
  }
  // ページで動かす（<script> の字。動いたら消す：中身は大域の名前に残る）
  const run = (text) => { const s = doc.createElement('script'); s.textContent = text; doc.head.append(s); s.remove(); };
  async function tools() {
    if (globalThis.__egatariArticle) return globalThis.__egatariArticle;
    setArticleHost();
    const t = await source('article');
    if (!globalThis.__egatariArticle) run(t);
    if (!globalThis.__egatariArticle) throw Object.assign(new Error('the book tools did not load'), { code: 'article-tools' });
    return globalThis.__egatariArticle;
  }
  async function csl() {
    const T = await tools();
    if (!globalThis.__egatariCSL) run(wrapCiteproc(await source('citeproc')));
    if (!globalThis.__egatariCSL) throw Object.assign(new Error('citeproc did not load'), { code: 'article-tools' });
    return T.cslWith(globalThis.__egatariCSL);
  }
  async function workerPrelude(cite) {
    return '\n;' + (await source('article')) + '\n;' + (cite ? wrapCiteproc(await source('citeproc')) : '');
  }
  return { tools, csl, workerPrelude, loaded: () => ({ tools: !!globalThis.__egatariArticle, citeproc: !!globalThis.__egatariCSL }) };
}
