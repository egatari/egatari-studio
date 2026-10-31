// ブラウザで組む：kit/core/build-core.mjs に渡す env（読み書きの口）を、作業場所（workspace.js）と同梱の資源から作る
//   /deck/…   作業場所：選んだフォルダか、持ち運べる 1 ファイルから取り出したメモリの上のフォルダ（一覧は ws.list、中身は読んだものを覚えておく）
//   /repo/…   アプリに同梱した kit/ vendor/components/ components.lock.json themes/ katex/ fonts/（tools/build-app.mjs が集める）
//   /user-themes/…  利用者のテーマのフォルダ（選んだときだけ。app/theme-folder.js。読むだけ）。env.themeDirs に入れるので、探す順と根の決まりは
//             コマンドと同じ（原稿のフォルダ → その themes/ → ここ → 同梱の themes/。kit/core/build-core.mjs の resolveTheme）。持ち運べる 1 ファイルに
//             書き出すと、ここのテーマは原稿の themes/<名前>/ に入る（kit/core/portable.mjs）。一覧は組み立てごとに読み直す
// build は同期で動くので、まだ読んでいないファイルは「足りない」と記録して空を返し、読んでから組み直す。
// 作業場所から読むのは、組み立てが実際に参照したファイルだけ（一覧のほかのファイルは読まない）。同時に読むのは READ_CONCURRENCY まで、
// 組み立て 1 回に読む大きさの合計は上限（BUILD_LIMITS.readChars）まで（読む前に一覧の大きさで数えて取っておき、1 つの読み取りはその大きさまで）。opts.signal が止まれば
// （Worker の組み立てが止められたとき）次の読み取りを始めない
export const READ_CONCURRENCY = 8;
import katex from 'katex';
import { ABCJS_OPTIONS } from '../kit/core/abcjs.mjs';
import abcjsPackage from 'abcjs/package.json' with { type: 'json' };
import * as P from '../kit/core/path-posix.mjs';
import { build as coreBuild, BUILD_LIMITS, BuildLimitError, ReadOverError, FileChangedError } from '../kit/core/build-core.mjs';
import { exportPortable as coreExportPortable } from '../kit/core/portable.mjs';
import { fontFaces, FONTS } from '../kit/core/build-core.mjs';

export const DECK = '/deck', ROOT = '/repo', USER_THEMES = '/user-themes';
// プレビューの音声の置き場所の印（deck-audio の src。app/frame-shim.js が blob: に替える）
export const PREVIEW_AUDIO = 'egatari-preview:';

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
export function createEngine(res, loadLazy, { renderAbc } = {}) {
  // The core remains synchronous. Collect score work, resolve it via RPC, then retry,
  // just as for missing files. Keep successes and failures for this build only.
  const scores = new Map(), pendingScores = new Map();
  const abcjs = renderAbc ? { version: abcjsPackage.version, defaults: ABCJS_OPTIONS, render(abc, options) {
    const key = JSON.stringify([abc, options]);
    if (!scores.has(key)) { pendingScores.set(key, { abc, options }); return {}; }
    const r = scores.get(key);
    if (r.error) throw new Error(r.error);
    return r;
  } } : null;
  const loadScores = async () => {
    const jobs = [...pendingScores]; pendingScores.clear();
    for (const [key, job] of jobs) {
      try { scores.set(key, await renderAbc(job)); }
      catch (e) { scores.set(key, { error: String(e.message || e) }); }
    }
  };
  const lazySet = new Set(res.lazy || []);
  const lazyCache = new Map();
  const repoDirs = new Set();
  for (const p of [...Object.keys(res.text), ...Object.keys(res.b64), ...lazySet]) {
    let d = P.dirname(p);
    while (d !== '/' && !repoDirs.has(d)) { repoDirs.add(d); d = P.dirname(d); }
  }
  let ws = null, listing = { files: new Map(), dirs: new Set() };
  const cache = new Map();       // rel → {sig, bytes}
  // 利用者のテーマのフォルダ（themeFolderWorkspace か Worker の代わり。list・readBytes だけ）とその一覧・読んだ中身
  const EMPTY = () => ({ files: new Map(), dirs: new Set() });
  let tws = null, tlisting = EMPTY();
  const tcache = new Map();      // rel → {sig, bytes}
  const inThemes = (p) => p === USER_THEMES || p.startsWith(USER_THEMES + '/');
  const relT = (p) => P.relative(USER_THEMES, p);
  // 組み立ての前に一覧を読み直す（読めなければ（許可が切れた・消えた）、ないものとして組む：テーマが見つからない知らせになる）
  async function refreshThemes() {
    if (!tws) { tlisting = EMPTY(); return; }
    const w = tws;
    let L;
    try { L = await w.list(); } catch { L = EMPTY(); }
    if (tws !== w) return;
    tlisting = L;
    for (const rel of [...tcache.keys()]) if (!L.files.has(rel)) tcache.delete(rel);
  }
  const sig = (f) => f.m + ':' + f.s;
  const relOf = (p) => P.relative(DECK, p);
  const inDeck = (p) => p === DECK || p.startsWith(DECK + '/');
  const inRepo = (p) => p === ROOT || p.startsWith(ROOT + '/');
  const sizes = new Map();
  const utf8Size = (p) => { if (!sizes.has(p)) sizes.set(p, new TextEncoder().encode(res.text[p]).length); return sizes.get(p); };

  // env を作る：getL() はその組み立てが見る一覧、missing はその組み立てで足りなかった場所（組み立てごとに別。書き出しとプレビューが混ざらない）
  const mkEnv = (getL, missing) => {
    // max：読んでよいバイト数（chargedEnv が渡す）。読んだ中身がそれより大きければ ReadOverError（chargedEnv が断る）
    function deckBytes(p, max = Infinity) {
      const rel = relOf(p), f = getL().files.get(rel);
      if (!f) throw Object.assign(new Error('ENOENT: ' + rel), { code: 'ENOENT' });
      const c = cache.get(rel);
      if (c && c.sig === sig(f)) { if (c.bytes.length > max) throw new ReadOverError(c.bytes.length, max); return c.bytes; }
      missing.add(p);
      return null;
    }
    function themeBytes(p, max = Infinity) {
      const rel = relT(p), f = tlisting.files.get(rel);
      if (!f) throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
      const c = tcache.get(rel);
      if (c && c.sig === sig(f)) { if (c.bytes.length > max) throw new ReadOverError(c.bytes.length, max); return c.bytes; }
      missing.add(p);
      return null;
    }
    return {
      // commit：アプリを組んだときの commit（tools/build-app.mjs）。同梱の再生器の版の "+dev.<commit>"（kit/core/player.mjs）
      abcjs, path: P, KIT: ROOT + '/kit', ROOT, katexDir: ROOT + '/katex', katex, version: res.version || '', commit: res.commit || '',
      fontDir: (pkg) => ROOT + '/fonts/' + pkg,
      // 編集アプリ：テーマが見つからない知らせの言葉（kit/core/build-core.mjs）。themeDirs：選んだテーマのフォルダ（なければ空）
      app: true,
      get themeDirs() { return tws ? [USER_THEMES] : []; },
      exists(p) {
        p = P.resolve(p);
        if (inDeck(p)) { const r = relOf(p), L = getL(); return p === DECK || L.files.has(r) || L.dirs.has(r); }
        if (inThemes(p)) { if (!tws) return false; const r = relT(p); return p === USER_THEMES || tlisting.files.has(r) || tlisting.dirs.has(r); }
        if (inRepo(p)) return p === ROOT || p in res.text || p in res.b64 || lazySet.has(p) || repoDirs.has(p);
        return false;
      },
      isFile(p) {
        p = P.resolve(p);
        if (inDeck(p)) return getL().files.has(relOf(p));
        if (inThemes(p)) return !!tws && tlisting.files.has(relT(p));
        return p in res.text || p in res.b64 || lazySet.has(p);
      },
      readText(p, max) { return this.readTextBytes(p, max).text; },
      // {text, bytes}：bytes は読んだバイト数（字数ではない。kit/core/build-core.mjs の chargedEnv がこれで数える）
      readTextBytes(p, max) {
        p = P.resolve(p);
        if (inDeck(p)) { const b = deckBytes(p, max); return b ? { text: dec.decode(b), bytes: b.length } : { text: '', bytes: 0 }; }
        if (inThemes(p)) { const b = themeBytes(p, max); return b ? { text: dec.decode(b), bytes: b.length } : { text: '', bytes: 0 }; }
        if (p in res.text) return { text: res.text[p], bytes: utf8Size(p) };
        if (p in res.b64) { const t = base64ToText(res.b64[p]); return { text: t, bytes: Math.floor(res.b64[p].length / 4) * 3 }; }
        throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
      },
      readBase64(p, max) {
        p = P.resolve(p);
        if (inDeck(p)) { const b = deckBytes(p, max); return b ? bytesToBase64(b) : ''; }
        if (inThemes(p)) { const b = themeBytes(p, max); return b ? bytesToBase64(b) : ''; }
        if (p in res.b64) return res.b64[p];
        if (p in res.text) return btoa(unescape(encodeURIComponent(res.text[p])));
        if (lazySet.has(p)) { if (lazyCache.has(p)) return lazyCache.get(p); missing.add(p); return ''; }
        throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
      },
      // 作業場所のファイルはバイト列のまま（音声など。base64 を通さない）。ほかは readBase64 から
      readBytes(p, max) {
        p = P.resolve(p);
        if (inDeck(p)) return deckBytes(p, max) || new Uint8Array(0);
        if (inThemes(p)) return themeBytes(p, max) || new Uint8Array(0);
        const b = atob(this.readBase64(p)), u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u;
      },
      within(p, dir) { p = P.resolve(p); dir = P.resolve(dir); return p === dir || p.startsWith(dir === '/' ? '/' : dir + '/'); },
      // 作業場所の dir の下のファイル（絶対パス、パスの順。一覧にあるものだけ。添付の一覧：kit/core/portable.mjs）
      listFiles(dir) {
        dir = P.resolve(dir);
        if (!inDeck(dir)) return [];
        const r = relOf(dir), pre = r ? r + '/' : '';
        return [...getL().files.keys()].filter((k) => k.startsWith(pre)).sort().map((k) => DECK + '/' + k);
      },
      // 読む前に組み立ての上限に数える大きさ（kit/core/build-core.mjs の chargedEnv）：作業場所のファイルは、読んだものは読んだ中身の大きさ
      // （一覧の後で大きくなっていても実際のバイトで数える）、まだ読んでいなければ一覧の大きさ
      size(p) {
        p = P.resolve(p);
        if (inDeck(p)) {
          const rel = relOf(p), f = getL().files.get(rel);
          if (!f) return null;
          const c = cache.get(rel);
          return c && c.sig === sig(f) ? c.bytes.length : f.s;
        }
        if (inThemes(p)) {
          const rel = relT(p), f = tlisting.files.get(rel);
          if (!f) return null;
          const c = tcache.get(rel);
          return c && c.sig === sig(f) ? c.bytes.length : f.s;
        }
        if (p in res.text) return utf8Size(p);   // バイト数（readBytes が返す UTF-8 の大きさ。字数ではない）
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
      const f = inDeck(p) ? L.files.get(relOf(p)) : inThemes(p) ? tlisting.files.get(relT(p)) : null;
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
          // 読んでよいのは、一覧の大きさまで（その大きさは読み始める前に上限に数えて取ってある。同時に読むものどうしが残りの上限を
          // 分け合わない）。作業場所はその直前にファイルの大きさを確かめ直し、超えるなら読まずに、読んだ後も実際の大きさで確かめる。
          // 一覧の後で大きくなったものは、上限の内でも断る（FileChangedError。次の一覧で組み直す）
          let bytes;
          try { bytes = await ws.readBytes(rel, { max: f.s }); } catch (e) {
            if (e && e.code === 'read-over') throw new FileChangedError(rel, f.s, e.n);
            throw e;
          }
          if (bytes.length > f.s) throw new FileChangedError(rel, f.s, bytes.length);
          cache.set(rel, { sig: sig(f), bytes });
        } else if (inThemes(p)) {
          // 利用者のテーマのフォルダ：作業場所と同じく一覧の大きさまで（読むだけ）
          const rel = relT(p), f = tlisting.files.get(rel), w = tws;
          if (!f || !w) continue;
          let bytes;
          try { bytes = await w.readBytes(rel, { max: f.s }); } catch (e) {
            if (e && e.code === 'read-over') throw new FileChangedError(USER_THEMES + '/' + rel, f.s, e.n);
            throw e;
          }
          if (bytes.length > f.s) throw new FileChangedError(USER_THEMES + '/' + rel, f.s, bytes.length);
          if (tws === w) tcache.set(rel, { sig: sig(f), bytes });
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
    // 利用者のテーマのフォルダ（themeFolderWorkspace。null で使わない）
    setThemeWorkspace(w) { if (w !== tws) { tws = w; tcache.clear(); tlisting = EMPTY(); } },
    get themeWorkspace() { return tws; },
    // フォルダの最上位の .html（deck.html を優先）
    deckFile() {
      if (listing.files.has('deck.html')) return 'deck.html';
      return [...listing.files.keys()].filter((r) => !r.includes('/') && /\.html?$/i.test(r)).sort()[0] || null;
    },
    // 組む。組み立てが参照したのにまだ読んでいないファイルを読んで、足りるまで組み直す（読み込めなかったものは空のまま進むので、
    // 1 回ごとに 1 つ以上増える）。一覧のほかのファイルは読まない。組み立ての上限で断るなら（build-too-large）、読む前に断る
    // opts.previewAudio：プレビューで音声を鳴らす（backlog #49）。audio/ も含めた一覧で組み、deck-audio の src は置き場所の印
    // （PREVIEW_AUDIO + 番号.大きさ.時刻）にして、r.previewAudio = [{src, rel, size}] を返す。音声のバイトは読まない：
    // 編集アプリが読み、プレビューの中の仲立ち（app/frame-shim.js）がその文書の blob: にする（sandbox の枠は親の blob: を読めない）
    async build(file, opts = {}) {
      scores.clear(); pendingScores.clear();
      forget(listing);
      await refreshThemes();
      const { signal, previewAudio, ...o } = opts;
      if (ws && ws.kind === 'memory' && !('missingFiles' in o)) o.missingFiles = 'warn';   // build-client.js と同じ
      const tally = tallyOf(opts), live = liveOf(opts);
      let L = listing, benv = env, miss = missing, refs = [];
      if (previewAudio) {
        L = await ws.list({ audio: true });
        miss = new Set();
        benv = mkEnv(() => L, miss);
        o.audioRef = (k, p, v) => {
          const rel = relOf(p), f = L.files.get(rel);
          if (!f || !(typeof v.dur === 'number' && v.dur > 0)) return null;
          const src = `${PREVIEW_AUDIO}${refs.length}.${f.s}.${Math.max(0, Math.round(f.m) || 0)}`;
          refs.push({ src, rel, size: f.s });
          return src;
        };
      }
      for (let i = 0; i < 40; i++) {
        miss.clear(); refs = [];
        let r = null, err = null;
        try { r = coreBuild(benv, DECK + '/' + file, { noAudio: !previewAudio, subset: false, ...o }); } catch (e) { err = e; }
        if (err && err.code === 'build-too-large') throw err;
        if (pendingScores.size) { await loadScores(); continue; }
        if (!miss.size) { if (err) throw err; if (previewAudio) r.previewAudio = refs; return r; }
        await loadMissing(miss, L, tally, live);
      }
      throw new Error('could not read all files');
    },
    // 持ち運べる 1 ファイルに書き出す（kit/core/portable.mjs の exportPortable。字は絞り込まない）。audio/ も含めた一覧で、
    // 書き出しが参照したもの（組み立ての依存・音声・字の分割ファイルなど）だけを読んでから作り直す。opts.carry：読み取った文書の索引
    async exportPortable(file, opts = {}) {
      scores.clear(); pendingScores.clear();
      const full = await ws.list({ audio: true });
      await refreshThemes();
      const miss = new Set();
      const xenv = mkEnv(() => full, miss);
      const { signal, ...o } = opts;
      if (ws && ws.kind === 'memory' && !('missingFiles' in o)) o.missingFiles = 'warn';   // build-client.js と同じ
      const tally = tallyOf(opts), live = liveOf(opts);
      for (let i = 0; i < 40; i++) {
        miss.clear();
        let r = null, err = null;
        try { r = await coreExportPortable(xenv, DECK + '/' + file, { subset: false, ...o }); } catch (e) { err = e; }
        if (err && err.code === 'build-too-large') throw err;
        if (pendingScores.size) { await loadScores(); continue; }
        if (!miss.size) { if (err) throw err; return r; }
        await loadMissing(miss, full, tally, live);
      }
      throw new Error('could not read all files');
    },
  };
}
