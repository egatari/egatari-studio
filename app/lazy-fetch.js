// 字の分割ファイルを配信元から取る（app/main.js の loadLazy。handoff #68）。
// 組み立ては分割ファイルを同時にいくつも取りに行く（app/engine.js の READ_CONCURRENCY）ので、回線や配信の一時の失敗 1 つで止まらないように、
// 取れなかったとき（fetch が投げた・5xx・408・429・中身を読み切れなかった）は 2 回まで取り直す（0.5 秒・1.5 秒の後）。404 などは取り直さない。
// 失敗の文は利用者向けの言葉（どのファイルか、何をすればよいか）。/repo/ のパスは出さない
// 国語のテーマ（本文が明朝）は、ゴシックと明朝の分割ファイルを合わせて約 144 本取りに行く（藍は約 72 本）。同時に取りに行くのは LAZY_PARALLEL 本まで
// （回線や途中の機器が多くの同時の取得を絞ると、そのうち 1 本が落ちて組み立てが止まっていた。#68）
//   fetchLazy(path, {fetch, base, wait, failed}) → Promise<Uint8Array>
//     fetch：window.fetch。base：document.baseURI。wait(ms)：待つ（試験で縮める）。failed(file)：失敗の文（app/i18n.js の T.fontFetchFailed）
export const LAZY_RETRY_MS = Object.freeze([500, 1500]);
export const LAZY_PARALLEL = 4;
// 同時に走らせる数を n までに絞る（順番は来た順）
export function limiter(n) {
  let running = 0;
  const queue = [];
  const next = () => { if (running >= n || !queue.length) return; running++; const { job, ok, ng } = queue.shift(); job().then(ok, ng).finally(() => { running--; next(); }); };
  return (job) => new Promise((ok, ng) => { queue.push({ job, ok, ng }); next(); });
}
const transient = (status) => status >= 500 || status === 408 || status === 429;

export async function fetchLazy(p, { fetch: get, base, wait = (ms) => new Promise((r) => setTimeout(r, ms)), failed = (f) => `font file not found: ${f}` }) {
  const url = new URL(String(p).replace(/^\/repo\//, ''), base);
  const file = String(p).split('/').pop();
  for (let i = 0; ; i++) {
    let again = false;
    try {
      const r = await get(url);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      again = transient(r.status);
    } catch { again = true; }
    if (!again || i >= LAZY_RETRY_MS.length) throw new Error(failed(file));
    await wait(LAZY_RETRY_MS[i]);
  }
}
