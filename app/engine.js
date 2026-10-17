// ブラウザで組む：kit/core/build-core.mjs に渡す env（読み書きの口）を、作業場所（workspace.js）と同梱の資源から作る
//   /deck/…   作業場所：選んだフォルダか、持ち運べる 1 ファイルから取り出したメモリの上のフォルダ（一覧は ws.list、中身は読んだものを覚えておく）
//   /repo/…   アプリに同梱した kit/ components/ themes/ katex/ fonts/（tools/build-app.mjs が集める）
// build は同期で動くので、まだ読んでいないファイルは「足りない」と記録して空を返し、読んでから組み直す。
// 作業場所から読むのは、組み立てが実際に参照したファイルだけ（一覧のほかのファイルは読まない）。同時に読むのは READ_CONCURRENCY まで、
// 組み立て 1 回に読む大きさの合計は上限（BUILD_LIMITS.readChars）まで（読む前に一覧の大きさで数える）。opts.signal が止まれば
// （Worker の組み立てが止められたとき）次の読み取りを始めない
export const READ_CONCURRENCY = 8;
import katex from 'katex';
import * as P from '../kit/core/path-posix.mjs';
import { build as coreBuild, BUILD_LIMITS, BuildLimitError } from '../kit/core/build-core.mjs';
import { exportPortable as coreExportPortable } from '../kit/core/portable.mjs';
import { fontFaces, FONTS } from '../kit/core/build-core.mjs';

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
  let ws = null, listing = { files: new Map(), dirs: new Set() };
  const cache = new Map();       // rel → {sig, bytes}
  const sig = (f) => f.m + ':' + f.s;
  const relOf = (p) => P.relative(DECK, p);
  const inDeck = (p) => p === DECK || p.startsWith(DECK + '/');
  const inRepo = (p) => p === ROOT || p.startsWith(ROOT + '/');

  // env を作る：getL() はその組み立てが見る一覧、missing はその組み立てで足りなかった場所（組み立てごとに別。書き出しとプレビューが混ざらない）
  const mkEnv = (getL, missing) => {
    function deckBytes(p) {
      const rel = relOf(p), f = getL().files.get(rel);
      if (!f) throw Object.assign(new Error('ENOENT: ' + rel), { code: 'ENOENT' });
      const c = cache.get(rel);
      if (c && c.sig === sig(f)) return c.bytes;
      missing.add(p);
      return null;
    }
    return {
      path: P, KIT: ROOT + '/kit', ROOT, katexDir: ROOT + '/katex', katex, version: res.version || '',
      fontDir: (pkg) => ROOT + '/fonts/' + pkg,
      exists(p) {
        p = P.resolve(p);
        if (inDeck(p)) { const r = relOf(p), L = getL(); return p === DECK || L.files.has(r) || L.dirs.has(r); }
        if (inRepo(p)) return p === ROOT || p in res.text || p in res.b64 || lazySet.has(p) || repoDirs.has(p);
        return false;
      },
      isFile(p) {
        p = P.resolve(p);
        if (inDeck(p)) return getL().files.has(relOf(p));
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
      // 作業場所のファイルはバイト列のまま（音声など。base64 を通さない）。ほかは readBase64 から
      readBytes(p) {
        p = P.resolve(p);
        if (inDeck(p)) return deckBytes(p) || new Uint8Array(0);
        const b = atob(this.readBase64(p)), u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u;
      },
      within(p, dir) { p = P.resolve(p); dir = P.resolve(dir); return p === dir || p.startsWith(dir === '/' ? '/' : dir + '/'); },
      // 読む前に組み立ての上限に数える大きさ（kit/core/build-core.mjs の chargedEnv）：作業場所のファイルは一覧の大きさ（まだ読んでいなくても）
      size(p) {
        p = P.resolve(p);
        if (inDeck(p)) { const f = getL().files.get(relOf(p)); return f ? f.s : null; }
        if (p in res.text) return res.text[p].length;
        if (p in res.b64) return Math.floor(res.b64[p].length / 4) * 3;
        return null;
      },
    };
  };
  const missing = new Set();     // プレビューの組み立てで足りなかった場所
  const env = mkEnv(() => listing, missing);

  // 足りなかったものを読む。tally：この組み立てで読んだ大きさ（{n, max}。読む前に一覧の大きさで数え、超えるなら読まずに断る）
  async function loadMissing(miss, L, tally, live) {
    const list = [...miss];
    miss.clear();
    for (const p of list) {
      if (!inDeck(p)) continue;
      const f = L.files.get(relOf(p));
      if (!f) continue;
      tally.n += f.s;
      if (tally.n > tally.max) throw new BuildLimitError('files read from the workspace', tally.n, tally.max);
    }
    let next = 0;
    const one = async () => {
      while (next < list.length) {
        const p = list[next++];
        if (!live()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        if (inDeck(p)) {
          const rel = relOf(p), f = L.files.get(rel);
          if (!f) continue;
          const bytes = await ws.readBytes(rel);
          if (bytes.length > f.s) { tally.n += bytes.length - f.s; if (tally.n > tally.max) throw new BuildLimitError('files read from the workspace', tally.n, tally.max); }
          cache.set(rel, { sig: sig(f), bytes });
        } else if (lazySet.has(p)) lazyCache.set(p, await loadLazy(p));
      }
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, list.length) }, one));
  }
  const tallyOf = (opts) => ({ n: 0, max: (opts.limits && opts.limits.readChars) || BUILD_LIMITS.readChars });
  const liveOf = (opts) => () => !(opts.signal && opts.signal.aborted);
  // 一覧から消えたファイルの読んだ中身を捨てる
  const forget = (L) => { for (const rel of [...cache.keys()]) if (!L.files.has(rel) && !rel.startsWith('audio/')) cache.delete(rel); };

  // 字の分割ファイル（段 A の編集の字の補い。kit/core/tier-a.mjs の opts.fonts）：一覧は同梱の CSS から、中身は必要なものだけ読む
  const fonts = {
    faces: (key) => fontFaces(env, FONTS[key]),
    async load(p) {
      p = P.resolve(p);
      if (p in res.b64) return res.b64[p];
      if (!lazySet.has(p)) throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
      if (!lazyCache.has(p)) lazyCache.set(p, await loadLazy(p));
      return lazyCache.get(p);
    },
  };

  return {
    env,
    fonts,
    // 作業場所を替える（フォルダ／メモリ。workspace.js）
    setWorkspace(w) { ws = w; cache.clear(); listing = { files: new Map(), dirs: new Set() }; },
    get workspace() { return ws; },
    setListing(l) { listing = l; },
    get listing() { return listing; },
    // フォルダの最上位の .html（deck.html を優先）
    deckFile() {
      if (listing.files.has('deck.html')) return 'deck.html';
      return [...listing.files.keys()].filter((r) => !r.includes('/') && /\.html?$/i.test(r)).sort()[0] || null;
    },
    // 組む。組み立てが参照したのにまだ読んでいないファイルを読んで、足りるまで組み直す（読み込めなかったものは空のまま進むので、
    // 1 回ごとに 1 つ以上増える）。一覧のほかのファイルは読まない。組み立ての上限で断るなら（build-too-large）、読む前に断る
    async build(file, opts = {}) {
      forget(listing);
      const { signal, ...o } = opts;
      const tally = tallyOf(opts), live = liveOf(opts);
      for (let i = 0; i < 40; i++) {
        missing.clear();
        let r = null, err = null;
        try { r = coreBuild(env, DECK + '/' + file, { noAudio: true, subset: false, ...o }); } catch (e) { err = e; }
        if (err && err.code === 'build-too-large') throw err;
        if (!missing.size) { if (err) throw err; return r; }
        await loadMissing(missing, listing, tally, live);
      }
      throw new Error('could not read all files');
    },
    // 持ち運べる 1 ファイルに書き出す（kit/core/portable.mjs の exportPortable。字は絞り込まない）。audio/ も含めた一覧で、
    // 書き出しが参照したもの（組み立ての依存・音声・字の分割ファイルなど）だけを読んでから作り直す。opts.carry：読み取った文書の索引
    async exportPortable(file, opts = {}) {
      const full = await ws.list({ audio: true });
      const miss = new Set();
      const xenv = mkEnv(() => full, miss);
      const { signal, ...o } = opts;
      const tally = tallyOf(opts), live = liveOf(opts);
      for (let i = 0; i < 40; i++) {
        miss.clear();
        let r = null, err = null;
        try { r = await coreExportPortable(xenv, DECK + '/' + file, { subset: false, ...o }); } catch (e) { err = e; }
        if (err && err.code === 'build-too-large') throw err;
        if (!miss.size) { if (err) throw err; return r; }
        await loadMissing(miss, full, tally, live);
      }
      throw new Error('could not read all files');
    },
  };
}
