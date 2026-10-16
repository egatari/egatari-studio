// ブラウザで組む：kit/core/build-core.mjs に渡す env（読み書きの口）を、選んだフォルダと同梱の資源から作る
//   /deck/…   選んだフォルダ（一覧は fsx.walk、中身は読んだものを覚えておく）
//   /repo/…   アプリに同梱した kit/ components/ themes/ katex/ fonts/（tools/build-app.mjs が集める）
// build は同期で動くので、まだ読んでいないファイルは「足りない」と記録して空を返し、読んでから組み直す
import katex from 'katex';
import * as P from '../kit/core/path-posix.mjs';
import { build as coreBuild } from '../kit/core/build-core.mjs';
import { readBytes } from './fsx.js';

export const DECK = '/deck', ROOT = '/repo';

export function bytesToBase64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function base64ToText(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
const dec = new TextDecoder();

// res = {version, text: {path: 文字列}, b64: {path: base64}, lazy: [path…]}
// loadLazy(path) → Promise<base64>：字の分割ファイル（配信版は fetch、1 ファイル版は同梱）
export function createEngine(res, loadLazy) {
  const lazySet = new Set(res.lazy || []);
  const lazyCache = new Map();
  const repoDirs = new Set();
  for (const p of [...Object.keys(res.text), ...Object.keys(res.b64), ...lazySet]) {
    let d = P.dirname(p);
    while (d !== '/' && !repoDirs.has(d)) { repoDirs.add(d); d = P.dirname(d); }
  }
  let root = null, listing = { files: new Map(), dirs: new Set() };
  const cache = new Map();       // rel → {sig, bytes}
  const missing = new Set();     // この組み立てで足りなかった場所
  const sig = (f) => f.m + ':' + f.s;
  const relOf = (p) => P.relative(DECK, p);
  const inDeck = (p) => p === DECK || p.startsWith(DECK + '/');
  const inRepo = (p) => p === ROOT || p.startsWith(ROOT + '/');

  function deckBytes(p) {
    const rel = relOf(p), f = listing.files.get(rel);
    if (!f) throw Object.assign(new Error('ENOENT: ' + rel), { code: 'ENOENT' });
    const c = cache.get(rel);
    if (c && c.sig === sig(f)) return c.bytes;
    missing.add(p);
    return null;
  }
  const env = {
    path: P, KIT: ROOT + '/kit', ROOT, katexDir: ROOT + '/katex', katex, version: res.version || '',
    fontDir: (pkg) => ROOT + '/fonts/' + pkg,
    exists(p) {
      p = P.resolve(p);
      if (inDeck(p)) { const r = relOf(p); return p === DECK || listing.files.has(r) || listing.dirs.has(r); }
      if (inRepo(p)) return p === ROOT || p in res.text || p in res.b64 || lazySet.has(p) || repoDirs.has(p);
      return false;
    },
    isFile(p) {
      p = P.resolve(p);
      if (inDeck(p)) return listing.files.has(relOf(p));
      return p in res.text || p in res.b64 || lazySet.has(p);
    },
    readText(p) {
      p = P.resolve(p);
      if (inDeck(p)) { const b = deckBytes(p); return b ? dec.decode(b) : ''; }
      if (p in res.text) return res.text[p];
      if (p in res.b64) return base64ToText(res.b64[p]);
      throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
    },
    readBase64(p) {
      p = P.resolve(p);
      if (inDeck(p)) { const b = deckBytes(p); return b ? bytesToBase64(b) : ''; }
      if (p in res.b64) return res.b64[p];
      if (p in res.text) return btoa(unescape(encodeURIComponent(res.text[p])));
      if (lazySet.has(p)) { if (lazyCache.has(p)) return lazyCache.get(p); missing.add(p); return ''; }
      throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
    },
    within(p, dir) { p = P.resolve(p); dir = P.resolve(dir); return p === dir || p.startsWith(dir === '/' ? '/' : dir + '/'); },
  };

  async function loadMissing() {
    const list = [...missing];
    missing.clear();
    await Promise.all(list.map(async (p) => {
      if (inDeck(p)) {
        const rel = relOf(p), f = listing.files.get(rel);
        if (!f) return;
        const bytes = await readBytes(root, rel);
        cache.set(rel, { sig: sig(f), bytes });
      } else if (lazySet.has(p)) lazyCache.set(p, await loadLazy(p));
    }));
  }

  return {
    env,
    setRoot(r) { root = r; cache.clear(); listing = { files: new Map(), dirs: new Set() }; },
    setListing(l) { listing = l; },
    get listing() { return listing; },
    // フォルダの最上位の .html（deck.html を優先）
    deckFile() {
      if (listing.files.has('deck.html')) return 'deck.html';
      return [...listing.files.keys()].filter((r) => !r.includes('/') && /\.html?$/i.test(r)).sort()[0] || null;
    },
    // 一覧のうち小さいファイル（2 MB まで）を先に読んでおく（組み直しの回数を減らす。変わったものだけ読み直す）
    async prefetch(limit = 2 * 1024 * 1024) {
      const todo = [...listing.files].filter(([rel, f]) => f.s <= limit && !(cache.has(rel) && cache.get(rel).sig === sig(f)));
      await Promise.all(todo.map(async ([rel, f]) => { try { cache.set(rel, { sig: sig(f), bytes: await readBytes(root, rel) }); } catch { /* 消えた */ } }));
      for (const rel of [...cache.keys()]) if (!listing.files.has(rel)) cache.delete(rel);
    },
    // 組む。足りないファイルを読んで、足りるまで組み直す（読み込めなかったものは空のまま進むので、1 回ごとに 1 つ以上増える）
    async build(file, opts = {}) {
      await this.prefetch();
      for (let i = 0; i < 40; i++) {
        missing.clear();
        let r = null, err = null;
        try { r = coreBuild(env, DECK + '/' + file, { noAudio: true, subset: false, ...opts }); } catch (e) { err = e; }
        if (!missing.size) { if (err) throw err; return r; }
        await loadMissing();
      }
      throw new Error('could not read all files');
    },
  };
}
