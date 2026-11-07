// 字の切り出しの道具（app/font-subset-tools.js。tools/build-app.mjs が 1 本にまとめる。約 2 MB）を、持ち運べる 1 ファイルに書き出すときにだけ読み込む（#178 (4)）。
// 字の出どころ：配信版は同じサイトのファイル（dist/font-subset.js）、1 ファイル版（file://）は同梱の字（RES.lazyJs.fontSubset）。
// 動かし方は本の道具（app/article-loader.js）と同じ：ページにその字の <script> を入れる（決まりの 'unsafe-inline'。eval はしない。wasm は 'wasm-unsafe-eval'）。
//   const L = createFontSubsetLoader(RES)
//   await L.subsetFont()   → (bytes, cps, file) => {b64, cps}（kit/core/build-core.mjs の env.subsetFont）。読み込めなければ null（そのわけは L.error()）
//   await L.workerPrelude() → 組み立ての Worker の字の後ろにつなげる字（app/build-client.js の setExtra(…, 'fontSubset')。AI の返事の貼り付けの書き出し）。読めなければ ''
//   memoSubset(s)          → s.subsetFont を、同じ分割ファイル・同じ字なら覚えた答えを返すものにする（Worker も使う）
// 読み込めないときは、書き出しは分割ファイルをそのまま入れる（大きくなるだけで、見え方は同じ）。1 回失敗したら、そのページでは読み直さない
import { fetchBounded } from './bounded-read.js';

export const FONT_SUBSET_FILE = 'font-subset.js';
const MAX = 6 << 20;

export function createFontSubsetLoader(res, { doc = typeof document !== 'undefined' ? document : null } = {}) {
  let p = null, err = null;
  async function source() {
    if (res.lazyJs && typeof res.lazyJs.fontSubset === 'string') return res.lazyJs.fontSubset;
    return new TextDecoder().decode(await fetchBounded(new URL(FONT_SUBSET_FILE, doc.baseURI), { max: MAX, what: FONT_SUBSET_FILE }));
  }
  async function load() {
    if (!globalThis.__egatariFontSubset) {
      const s = doc.createElement('script');
      s.textContent = await source();
      doc.head.append(s); s.remove();
    }
    const T = globalThis.__egatariFontSubset;
    if (!T || typeof T.init !== 'function') throw new Error('the font subsetter did not load');
    return memoSubset(await T.init());
  }
  return {
    subsetFont() {
      if (!p) p = load().catch((e) => { err = e; console.warn('[editor] font subsetter not available; whole font chunks are embedded', e); return null; });
      return p;
    },
    async workerPrelude() { try { return '\n;' + (await source()) + '\n'; } catch (e) { console.warn('[editor] font subsetter not available for the build worker', e); return ''; } },
    error: () => err,
  };
}
// 同じ分割ファイル・同じ字の切り出しは覚えておく（編集アプリは足りないファイルを読んでから組み直すので、同じ切り出しを何度も頼む）
export function memoSubset(s) {
  const memo = new Map();
  return (bytes, cps, file) => {
    const key = file ? file + '|' + cps.join(',') : null;
    if (key && memo.has(key)) return memo.get(key);
    const v = s.subsetFont(bytes, cps);
    if (key) memo.set(key, v);
    return v;
  };
}
