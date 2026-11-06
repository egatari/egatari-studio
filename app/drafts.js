// 保存していない変更をブラウザの中に残す（backlog #55。設計は handoff/autosave-design-2026-11-04.md、説明は docs/editor.md「Unsaved changes kept in this browser」）
// 1 ファイル（.ega.html）をメモリの上（app/memfs.js）で直しているとき、タブを閉じる・落ちると編集と録音が消える。変更から 2 秒（続いても 10 秒に 1 回、
// タブが隠れたときはすぐ）に、元のファイル（P.original）と、開いた直後から変わったファイルだけを IndexedDB に残し、次に開いたときに復元を問う。
// 作業フォルダはフォルダに直接書くので使わない。画面の言葉では draft と言わず「保存していない変更」（英語の draft は画面で「試験的」の意味）
//
// 鍵：ファイルの名前＋元のファイルの sha256。id はタブ（開くたび）ごと。各タブは自分の id の Web Lock を持ち、持たれている変更は問いにも一覧にも出さない
// #29：この端末のこのブラウザの中にだけ置く。最初に残すときに navigator.storage.persist() を求める。消し方ははじめの画面の行・使い方の節
//
//   draftStore({idb, locks, now})   入れ物（IndexedDB）。試験では偽の idb を渡せる
//   createDraftKeeper(opts)          見張り（1 つの開いた文書に 1 つ）
import { sha256Hex } from '../kit/core/portable.mjs';

const MiB = 1024 * 1024;
export const DRAFT_LIMITS = { bytes: 256 * MiB, keep: 10, days: 30, quietMs: 2000, maxWaitMs: 10000, tickMs: 1000 };
export const LOCK_PREFIX = 'egatari-draft:';
// 最近のファイル（app/fsx.js の motion-slides-editor）とは別の DB：凍結した写し（/vX.Y.Z/）の古い版も同じ origin で開くので、形を混ぜない
const DB = 'egatari-drafts', VER = 1;
const META = 'meta', BASE = 'base', FILES = 'files';
const DAY = 24 * 3600 * 1000;

export function draftStore({ idb = globalThis.indexedDB, locks = globalThis.navigator && globalThis.navigator.locks, now = () => Date.now() } = {}) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!idb) { rej(Object.assign(new Error('IndexedDB is not available'), { code: 'no-idb' })); return; }
    const r = idb.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(BASE)) d.createObjectStore(BASE, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES, { keyPath: ['id', 'rel'] }).createIndex('byId', 'id');
    };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => { dbp = null; rej(Object.assign(new Error('IndexedDB is blocked'), { code: 'blocked' })); };
  }));
  // 1 つの transaction。fn(stores) の戻り値（要求なら result）を、書き終わったら返す。失敗（QuotaExceededError を含む）は reject
  const tx = async (names, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      let t;
      try { t = d.transaction(names, mode); } catch (e) { rej(e); return; }
      const st = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
      let out;
      try { out = fn(st); } catch (e) { try { t.abort(); } catch { /* 閉じた */ } rej(e); return; }
      t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out && 'readyState' in out ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  };
  const idsOf = async (st, id) => new Promise((res, rej) => {
    const q = st.index('byId').getAllKeys(id);
    q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
  });
  const store = {
    // 今どのタブかが持っている変更の id（Web Locks）。navigator.locks がなければ空（どれも持たれていないとみなす）
    async held() {
      try {
        if (!locks || !locks.query) return new Set();
        const q = await locks.query();
        return new Set([...(q.held || []), ...(q.pending || [])].map((l) => l.name).filter((n) => n && n.startsWith(LOCK_PREFIX)).map((n) => n.slice(LOCK_PREFIX.length)));
      } catch { return new Set(); }
    },
    // 変更の一覧（新しい順。元のファイルとファイルの中身は入れない）
    async list() { const all = await tx([META], 'readonly', (s) => s[META].getAll()); return (all || []).sort((a, b) => b.updated - a.updated); },
    // ほかのタブが持っている変更のどれかが外れたら解ける（落ちたタブの印はブラウザが少し遅れて外す。はじめの画面の一覧を出し直すため）。
    // 持たれている変更がなければ、または navigator.locks がなければ null。返すのは { done }（約束をそのまま返すと await が外れるまで待ってしまう）。
    // shared で待つので、外れた所ですぐ放す
    async released() {
      if (!locks || !locks.request) return null;
      const [all, held] = await Promise.all([store.list(), store.held()]);
      const ids = all.map((m) => m.id).filter((id) => held.has(id));
      if (!ids.length) return null;
      return { done: Promise.race(ids.map((id) => locks.request(LOCK_PREFIX + id, { mode: 'shared' }, () => undefined).catch(() => undefined))) };
    },
    // ほかのタブが持っていない変更（問い・はじめの画面に出すもの）
    async free() { const [all, held] = await Promise.all([store.list(), store.held()]); return all.filter((m) => !held.has(m.id)); },
    // 書く：meta（id・名前・鍵…）、base（元のファイル。替わったときだけ）、put（[{rel, bytes, m}]）、keep（残すファイルの名前。ほかは消す）
    async write(meta, { base = null, put = [], keep = null } = {}) {
      const d = await open();
      // 消すファイル：今ある中で keep にないもの（keep が null なら消さない）
      let drop = [];
      if (keep) {
        const have = await new Promise((res, rej) => { const t = d.transaction([FILES], 'readonly'); idsOf(t.objectStore(FILES), meta.id).then(res, rej); });
        drop = have.filter((k) => !keep.has(k[1]));
      }
      await tx([META, BASE, FILES], 'readwrite', (s) => {
        if (base !== null) s[BASE].put({ id: meta.id, text: base });
        for (const f of put) s[FILES].put({ id: meta.id, rel: f.rel, m: f.m, bytes: f.bytes });
        for (const k of drop) s[FILES].delete(k);
        s[META].put(meta);
      });
    },
    // 読む → {meta, base（元のファイルの文字列）, files: Map(rel → Uint8Array)} か null
    async read(id) {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction([META, BASE, FILES], 'readonly');
        const out = { meta: null, base: null, files: new Map() };
        t.objectStore(META).get(id).onsuccess = (e) => { out.meta = e.target.result || null; };
        t.objectStore(BASE).get(id).onsuccess = (e) => { out.base = e.target.result ? e.target.result.text : null; };
        t.objectStore(FILES).index('byId').getAll(id).onsuccess = (e) => { for (const f of e.target.result || []) out.files.set(f.rel, f.bytes); };
        t.oncomplete = () => res(out.meta && typeof out.base === 'string' ? out : null);
        t.onerror = () => rej(t.error);
      });
    },
    async remove(id) {
      const d = await open();
      const keys = await new Promise((res, rej) => { const t = d.transaction([FILES], 'readonly'); idsOf(t.objectStore(FILES), id).then(res, rej); });
      await tx([META, BASE, FILES], 'readwrite', (s) => { s[META].delete(id); s[BASE].delete(id); for (const k of keys) s[FILES].delete(k); });
    },
    // 掃除：最後に変えてから days 日を過ぎたもの、keep 件を超えた古いもの（どちらも、ほかのタブが持っているもの・except は消さない）→ 消した id
    async prune({ keep = DRAFT_LIMITS.keep, days = DRAFT_LIMITS.days, except = null } = {}) {
      const [all, held] = await Promise.all([store.list(), store.held()]);
      const spare = (m) => held.has(m.id) || (except && except === m.id);
      const gone = [];
      let n = 0;
      for (const m of all) {
        if (spare(m)) { n++; continue; }
        if (now() - m.updated > days * DAY || n >= keep) gone.push(m.id); else n++;
      }
      for (const id of gone) await store.remove(id);
      return gone;
    },
    async removeAll({ except = null } = {}) {
      const all = await store.list();
      const held = await store.held();
      let n = 0;
      for (const m of all) if (!held.has(m.id) && m.id !== except) { await store.remove(m.id); n++; }
      return n;
    },
    // 開いた文書に合う変更（名前と元のファイルの hash が同じ。ほかのタブが持っていないもの。新しい順）
    async matching(name, baseSha) { return (await store.free()).filter((m) => m.name === name && m.baseSha === baseSha); },
  };
  return store;
}

export const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message || '')));
const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// 見張り。opts：
//   store                      draftStore()
//   ws                         作業場所（memoryWorkspace。stamps()・revision・dirty・readBytes を持つ）
//   doc()                      → {name, original, handle, neverSaved, sourceOnly, rightsOk} か null（今の文書でなければ null：止める）
//   content(rel)               保存するファイルに入るか（archiveFiles と同じ規則）
//   onState({kept, error})     残せた（kept：時刻）／残せなかった（error：'quota' | 'too-large' | 'failed'）を知らせる
//   id                         引き継ぐ変更の id（復元したとき）。なければ新しく作る
//   now, limits                試験用
export function createDraftKeeper(opts) {
  const { store, ws, doc, content, onState = () => {}, now = () => Date.now() } = opts;
  const L = { ...DRAFT_LIMITS, ...(opts.limits || {}) };
  let id = opts.id || newId();
  let baseline = stampsOf();        // 開いた直後（保存した直後）の各ファイルの時刻
  let baseSha = null, baseWritten = null;   // 残した元のファイル（文字列）
  let stored = new Map();           // 残したファイル → 時刻
  let savedRev = ws.revision, seenRev = ws.revision, firstPending = 0, lastChange = 0;
  let busy = null, stopped = false, created = 0, lastError = null, persistAsked = false;
  let release = null;
  // このタブが変更を持っていることを、ほかのタブに知らせる（タブが閉じる・落ちるとブラウザが外す）。
  // ifAvailable：もうほかのタブが持っていれば持たずに false
  const locks = globalThis.navigator && globalThis.navigator.locks;
  const takeLock = (name) => (locks && locks.request
    ? new Promise((res) => {
      locks.request(LOCK_PREFIX + name, { ifAvailable: true }, (lock) => {
        if (!lock) { res(false); return undefined; }
        return new Promise((r) => { release = r; res(true); });
      }).catch(() => res(false));
    })
    : Promise.resolve(true));
  let locked = takeLock(id);
  function stampsOf() {
    const out = new Map();
    for (const [rel, m] of ws.stamps()) if (content(rel)) out.set(rel, m);
    return out;
  }
  const report = (s) => { onState(s); };
  async function writeNow() {
    const d = doc();
    if (!d || stopped) return;
    const rev = ws.revision;
    const cur = stampsOf();
    const changed = [...cur].filter(([rel, m]) => baseline.get(rel) !== m).map(([rel]) => rel);
    const removed = [...baseline.keys()].filter((rel) => !cur.has(rel));
    if (baseSha === null || baseWritten !== d.original) baseSha = await sha256Hex(new TextEncoder().encode(d.original));
    const put = [];
    let bytes = d.original.length;
    for (const rel of changed) {
      const b = await ws.readBytes(rel);
      bytes += b.length;
      if (stored.get(rel) !== cur.get(rel)) put.push({ rel, bytes: b, m: cur.get(rel) });
    }
    if (bytes > L.bytes) { if (lastError !== 'too-large') report({ error: 'too-large' }); lastError = 'too-large'; savedRev = rev; return; }
    if (!created) created = now();
    const meta = { id, name: d.name, baseSha, created, updated: now(), bytes, changed: changed.slice().sort(), removed: removed.sort(), neverSaved: !!d.neverSaved, sourceOnly: !!d.sourceOnly, rightsOk: !!d.rightsOk, handle: d.handle || null };
    const base = baseWritten === d.original ? null : d.original;
    try {
      await store.write(meta, { base, put, keep: new Set(changed) });
    } catch (e) {
      // ハンドルを残せない環境（構造化の複製ができない）：ハンドルなしでもう一度
      if (e && e.name === 'DataCloneError' && meta.handle) { meta.handle = null; await store.write(meta, { base, put, keep: new Set(changed) }); }
      else throw e;
    }
    baseWritten = d.original;
    stored = new Map(changed.map((rel) => [rel, cur.get(rel)]));
    savedRev = rev;
    lastError = null;
    report({ kept: meta.updated });
    if (!persistAsked) {
      persistAsked = true;
      // #29 (3)：大事なもの（保存していない編集）は、消されにくくするよう求める（断られても残す）
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* 無い */ }
      store.prune({ except: id }).catch(() => {});
    }
  }
  async function flush() {
    if (busy) { await busy; }
    if (stopped || ws.revision === savedRev || !ws.dirty) return;
    busy = (async () => {
      try { await writeNow(); }
      catch (e) {
        const kind = isQuota(e) ? 'quota' : 'failed';
        console.warn('[editor] cannot keep the unsaved changes in this browser', e);
        savedRev = ws.revision;   // 次の変更でまた試す（同じ版で何度も試さない）
        if (lastError !== kind) report({ error: kind });
        lastError = kind;
      } finally { busy = null; }
    })();
    await busy;
  }
  // 1 秒ごとに：変更から quietMs たったか、最初の変更から maxWaitMs たったら残す
  function tick() {
    if (stopped) return;
    const r = ws.revision;
    if (r !== seenRev) { seenRev = r; lastChange = now(); if (!firstPending) firstPending = lastChange; }
    if (r === savedRev || !ws.dirty) { firstPending = 0; return; }
    if (busy) return;
    const t = now();
    if (t - lastChange >= L.quietMs || (firstPending && t - firstPending >= L.maxWaitMs)) { firstPending = 0; flush(); }
  }
  const timer = setInterval(tick, L.tickMs);
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  const onPageHide = () => flush();
  if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onPageHide); }
  function stop() {
    stopped = true; clearInterval(timer);
    if (typeof document !== 'undefined') { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide); }
  }
  return {
    get id() { return id; },
    get locked() { return locked; },
    flush,
    // 残した変更（meta）を引き継ぐ（復元した：この後はその id に書く）。ほかのタブがもう持っていれば false（引き継がない）
    async adopt(meta) {
      if (busy) await busy;
      const old = release, oldId = id;
      release = null;
      if (!(await takeLock(meta.id))) { release = old; return false; }
      if (old) old();
      id = meta.id; created = meta.created || now(); stored = new Map(); baseWritten = null; baseSha = null;
      savedRev = -1;   // 次の見張りで（変更がなくても）書き直す
      if (oldId !== id) { try { await store.remove(oldId); } catch { /* 無い */ } }
      return true;
    },
    get error() { return lastError; },
    // 本当に保存した（markClean が通った）：残した変更を消し、今の中身を新しい基準にする
    async saved() {
      if (busy) await busy;
      baseline = stampsOf(); stored = new Map(); baseWritten = null; baseSha = null; created = 0;
      savedRev = ws.revision; firstPending = 0;
      try { await store.remove(id); } catch { /* 無い */ }
      report({ kept: null });
    },
    // 保存の途中で編集があった（まだ保存していない変更がある）：新しい元のファイルで残し直す
    async savedDirty() { baseWritten = null; savedRev = -1; await flush(); },
    // 文書を閉じる。discard：変更を捨てた（残したものも消す）。そうでなければ、残したもの（保存していない変更）はそのまま
    async close({ discard = false } = {}) {
      stop();
      if (busy) { try { await busy; } catch { /* 済み */ } }
      if (discard) { try { await store.remove(id); } catch { /* 無い */ } }
      if (release) release();
    },
    // 試験：見張りの中身
    state: () => ({ id, savedRev, revision: ws.revision, stored: [...stored.keys()].sort(), error: lastError, stopped }),
  };
}
