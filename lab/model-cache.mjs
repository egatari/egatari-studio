// ブラウザの TTS のモデルのキャッシュ（Cache Storage）を見る・消す・古い版を片付ける。依存なし（tts-engine.mjs・試験ページ lab/irodori.js・
// 編集アプリの「使い方」の板 app/model-cache-ui.js が共有する）。どの関数も caches・navigator.storage を引数で受け取れる（試験では偽物を渡す）
//   Irodori：irodori-lab-<HF_REV の先頭 12 字>（版ごとに 1 つ。約 1.26 GB）
//   Kokoro：transformers.js の transformers-cache（URL の /resolve/<版>/ で版が分かる。声は main から取るので残す）
export const IRODORI_PREFIX = 'irodori-lab-';
export const TRANSFORMERS_CACHE = 'transformers-cache';
export const isModelCache = (name) => String(name).startsWith(IRODORI_PREFIX) || name === TRANSFORMERS_CACHE;

const cachesOf = (cs) => (cs !== undefined ? cs : 'caches' in globalThis ? globalThis.caches : null);
const storageOf = (st) => (st !== undefined ? st : globalThis.navigator && navigator.storage ? navigator.storage : null);

// モデルのキャッシュの名前（なければ []）
export async function modelCaches(cs) {
  const c = cachesOf(cs);
  if (!c) return [];
  try { return (await c.keys()).filter(isModelCache); } catch { return []; }
}
// モデルのキャッシュを全部消す → 消した名前
export async function deleteModelCaches(cs) {
  const c = cachesOf(cs), out = [];
  if (!c) return out;
  for (const n of await modelCaches(c)) if (await c.delete(n).catch(() => false)) out.push(n);
  return out;
}
// 公開のサイトの凍結した写し（/vX.Y.Z/lab/…。tools/site-versions.mjs）か。キャッシュはサイト全体で共有なので、写しは古い版を片付けない
// （片付けるのは根の最新版だけ。写しが根の新しいモデルを消して、行き来するたびに取り直すことのないように）
export const inFrozenCopy = (pathname) => /\/v\d+\.\d+\.\d+\/lab\/[^/]*$/.test(String(pathname || ''));
// 今の版のほかの Irodori のキャッシュと、transformers-cache の中の repo の古い版（40 字の版のうち rev でないもの）を消す → 消した数
//   current：今の Irodori のキャッシュの名前（CACHE_NAME）。kokoro：{repo, rev}（省けば transformers-cache に触らない）
export async function pruneOldModels(current, { kokoro = null, caches: cs } = {}) {
  const c = cachesOf(cs);
  if (!c) return 0;
  let n = 0;
  for (const name of await modelCaches(c)) {
    if (name.startsWith(IRODORI_PREFIX) && name !== current) { if (await c.delete(name).catch(() => false)) n++; }
  }
  if (kokoro && (await modelCaches(c)).includes(TRANSFORMERS_CACHE)) {
    try {
      const store = await c.open(TRANSFORMERS_CACHE), mark = `/${kokoro.repo}/resolve/`;
      for (const req of await store.keys()) {
        const url = typeof req === 'string' ? req : req.url, i = url.indexOf(mark);
        if (i < 0) continue;
        const rev = url.slice(i + mark.length).split('/')[0];
        if (/^[0-9a-f]{40}$/.test(rev) && rev !== kokoro.rev && (await store.delete(req))) n++;
      }
    } catch { /* 片付けられなくても読み込める */ }
  }
  return n;
}
// 保存領域の使用量（このサイト全体。navigator.storage.estimate）→ {usage, quota, persisted}（使えなければ null）
export async function storageUsage(st) {
  const s = storageOf(st);
  if (!s || typeof s.estimate !== 'function') return null;
  try {
    const e = await s.estimate();
    const persisted = typeof s.persisted === 'function' ? await s.persisted().catch(() => null) : null;
    return { usage: +e.usage || 0, quota: +e.quota || 0, persisted };
  } catch { return null; }
}
// モデルを取る前に、ブラウザが空きの足りないときや（Safari は）しばらく開かないときに消さないよう求める → true・false・null（使えない）
export async function requestPersist(st) {
  const s = storageOf(st);
  if (!s || typeof s.persist !== 'function') return null;
  try {
    if (typeof s.persisted === 'function' && (await s.persisted())) return true;
    return !!(await s.persist());
  } catch { return null; }
}
// キャッシュごとの大きさ（入れたときの content-length の和。なければ数えない）→ [{name, bytes, entries}]
export async function modelCacheSizes(cs) {
  const c = cachesOf(cs), out = [];
  if (!c) return out;
  for (const name of await modelCaches(c)) {
    let bytes = 0, entries = 0;
    try {
      const store = await c.open(name);
      for (const req of await store.keys()) {
        entries++;
        const res = await store.match(req);
        bytes += (res && +res.headers.get('content-length')) || 0;
      }
    } catch { /* 読めなければ 0 */ }
    out.push({ name, bytes, entries });
  }
  return out;
}
