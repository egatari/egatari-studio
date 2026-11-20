// 字の分割ファイルの取り直し（app/lazy-fetch.js。handoff #68）の試験。ネットワークを使わない（fetch を差し替える）
//   node tools/test-lazy-fetch.mjs
// test-all: unit
import { fetchLazy, LAZY_RETRY_MS, limiter, LAZY_PARALLEL } from '../app/lazy-fetch.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const P = '/repo/fonts/@fontsource/biz-udpgothic/files/biz-udpgothic-99-700-normal.woff2';
const BASE = 'https://studio.egatari.org/v0.6.16/';
const bytes = new Uint8Array([119, 79, 70, 50]);
const res = (status, body = bytes) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => body.buffer });
// answers：順に返すもの（数＝その status、'throw'＝fetch が投げる、'body'＝中身を読み切れない）
function server(answers) {
  const urls = [], waits = [];
  const fetch = async (u) => {
    urls.push(String(u));
    const a = answers[urls.length - 1];
    if (a === 'throw') throw new TypeError('Failed to fetch');
    if (a === 'body') return { ok: true, status: 200, arrayBuffer: async () => { throw new TypeError('network error'); } };
    return res(a);
  };
  return { urls, waits, opts: { fetch, base: BASE, wait: async (ms) => { waits.push(ms); }, failed: (f) => `could not get ${f}` } };
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

{
  const s = server([200]);
  const got = await fetchLazy(P, s.opts);
  ok(same(got, bytes) && s.urls.length === 1 && s.urls[0] === BASE + 'fonts/@fontsource/biz-udpgothic/files/biz-udpgothic-99-700-normal.woff2' && !s.waits.length,
    'served at once: one request, relative to the app (no /repo/), no wait');
}
for (const [what, first] of [['the request throws (network)', 'throw'], ['503', 503], ['502', 502], ['429', 429], ['408', 408], ['the body fails midway', 'body']]) {
  const s = server([first, 200]);
  const got = await fetchLazy(P, s.opts);
  ok(same(got, bytes) && s.urls.length === 2 && same(s.waits, [LAZY_RETRY_MS[0]]), `${what}, then served: tried again once after ${LAZY_RETRY_MS[0]} ms`);
}
{
  const s = server(['throw', 503, 200]);
  ok(same(await fetchLazy(P, s.opts), bytes) && s.urls.length === 3 && same(s.waits, LAZY_RETRY_MS), `two passing failures: served on the third request (waits ${LAZY_RETRY_MS.join(', ')} ms)`);
}
{
  const s = server(['throw', 'throw', 'throw', 200]);
  let err = null;
  try { await fetchLazy(P, s.opts); } catch (e) { err = e; }
  ok(err && err.message === 'could not get biz-udpgothic-99-700-normal.woff2' && s.urls.length === 3, 'still failing after two retries: the user-facing message names the file, not the /repo/ path');
}
{
  const s = server([404, 200]);
  let err = null;
  try { await fetchLazy(P, s.opts); } catch (e) { err = e; }
  ok(err && s.urls.length === 1 && !s.waits.length, '404 is not tried again (the file is not there)');
}
{
  let err = null;
  try { await fetchLazy(P, { fetch: async () => res(404), base: BASE, wait: async () => {} }); } catch (e) { err = e; }
  ok(err && /biz-udpgothic-99-700-normal\.woff2$/.test(err.message) && !err.message.includes('/repo/'), 'the default message names only the file');
}
{
  // 同時に走るのは n 本まで。全部終わり、失敗は失敗のまま返る
  const lim = limiter(LAZY_PARALLEL);
  let running = 0, most = 0;
  const job = (i) => async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 5)); running--; if (i === 7) throw new Error('x'); return i; };
  const out = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => lim(job(i))));
  ok(most === LAZY_PARALLEL && out.filter((o) => o.status === 'fulfilled').length === 19 && out[7].status === 'rejected' && out[3].value === 3,
    `at most ${LAZY_PARALLEL} fetches at once (144 font files for 国語 no longer go out 8 at a time); every job ends, a failure stays a failure`);
}
console.log(fails ? `\n${fails} FAILED` : '\ntest-lazy-fetch: all ok');
process.exit(fails ? 1 : 0);
