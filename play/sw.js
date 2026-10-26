// Egatari Viewer: the service worker (docs/viewer.md).
// - It caches only this page's own files, listed by the build (tools/build-play.mjs), under a cache named by the version.
//   It never stores what it did not precache: no lesson file, no shared file, no other response (cache.put is never called).
// - Offline: every file of the app shell (the page, its script, the reader Worker, the style sheet, the manifest and the icons;
//   the page uses the system fonts and loads no font file) is precached at install, so a Viewer opened once opens with no network.
// - A new version installs beside the old one and waits. It takes over on the next launch only: the browser activates it when no
//   window of the Viewer is open, and a freshly launched page at its start screen asks 'activate-if-idle', which is granted only
//   when that page is the Viewer's only window (so a lesson playing in another window is never swapped). There is no
//   skip-waiting on install and no update button.
// - Android share_target: a POST to ./share carries a shared file. The worker answers with a redirect to ./?share=1 and hands
//   the file to the page that asks for it (share-claim), from memory only; if no page asks within 60 s the file is dropped.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const PREFIX = 'egatari-play-';
const CACHE = PREFIX + VERSION;
const scope = new URL(self.registration.scope);
const OWN = new Set(FILES.map((f) => new URL(f, scope).href));
const INDEX = new URL('./', scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(new URL(f, scope).href, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'activate-if-idle' && e.source) e.waitUntil(activateIfIdle(e.source));
  else if (m.type === 'share-claim' && e.source) claimShare(e.source);
  else if (m.type === 'version' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

async function activateIfIdle(asker) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.length <= 1 && (!wins.length || wins[0].id === asker.id)) { await self.skipWaiting(); return; }
  asker.postMessage({ type: 'busy' });
}

let shared = null;          // {file, done} while a shared file waits for its page
function claimShare(client) {
  if (!shared) { client.postMessage({ type: 'share-file', file: null }); return; }
  const s = shared; shared = null;
  client.postMessage({ type: 'share-file', file: s.file });
  s.done();
}
async function receiveShare(request) {
  let file = null;
  try {
    const form = await request.formData();
    for (const v of form.getAll('lesson')) if (v && typeof v === 'object' && typeof v.size === 'number') { file = v; break; }
  } catch { file = null; }
  let done;
  const wait = new Promise((res) => { done = res; setTimeout(res, 60000); });
  if (shared) shared.done();
  shared = { file, done };
  wait.then(() => { if (shared && shared.done === done) shared = null; });
  return { wait, response: Response.redirect(new URL('./?share=1', scope).href, 303) };
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== scope.origin) return;
  if (req.method === 'POST' && url.href === new URL('./share', scope).href) {
    let keep;
    e.waitUntil(new Promise((res) => { keep = res; }));
    e.respondWith((async () => { const r = await receiveShare(req); r.wait.then(keep); return r.response; })().catch((err) => { keep(); throw err; }));
    return;
  }
  if (req.method !== 'GET') return;
  // the page itself, also with a query (./?share=1): the cached index
  const key = req.mode === 'navigate' && url.pathname === scope.pathname ? INDEX : url.origin + url.pathname;
  if (!OWN.has(key)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(key);
    return hit || fetch(req);
  })());
});
