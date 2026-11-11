// The site player (play/site-player.mjs, tools/build-site-player.mjs; docs/viewer.md "Site player"), as a static host serves it:
// no response headers at all (like GitHub Pages), the page's policy in a <meta>, the lock and the files from the same origin.
//   node tools/test-site-player.mjs [work dir] [--webkit]
// Checks: a lesson plays in an opaque-origin frame (no access to the site's storage, no network); the files are checked against the
// lock (a changed byte, a longer file, an unknown id or no id: nothing plays, a message says why); the lesson's link requests go
// through the link box; the page refuses to run inside another page's frame; the bundle reads no storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { buildSitePlayer, PAGE_CSP } from './build-site-player.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-site-player-')));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { ms = scaled(ms); const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- the site: /gallery/play/ (the page), /gallery/samples.lock.json, /gallery/files/<id>.ega.bin
const SITE = path.join(work, 'site');
const G = path.join(SITE, 'gallery');
fs.mkdirSync(path.join(G, 'files'), { recursive: true }); fs.mkdirSync(path.join(G, 'play'), { recursive: true });
const built = await buildSitePlayer({ out: path.join(G, 'play') });
ok(built.pageCsp === PAGE_CSP && !/frame-ancestors/.test(PAGE_CSP) && /connect-src 'self';/.test(PAGE_CSP) && /frame-src 'none'/.test(PAGE_CSP), 'build: BUILD.json carries the page policy (connect-src self only, frame-src none; no frame-ancestors in a meta)');
ok(Object.entries(built.sha256).every(([k, v]) => sha(fs.readFileSync(path.join(G, 'play', k))) === v), 'build: BUILD.json has the SHA-256 of each file');
const js = fs.readFileSync(path.join(G, 'play', 'site-play.js'), 'utf8');
ok(!/indexedDB|localStorage|serviceWorker|caches\./.test(js.replace(/__SITE_PLAYER|localStorage\.getItem\("egatari-viewer-lang"\)/g, '')), 'build: the bundle uses no storage and no service worker');
fs.writeFileSync(path.join(G, 'play', 'index.html'), `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>見本を見る</title>
<link rel="stylesheet" href="site-play.css">
<script type="module" src="site-play.js"></script>
<style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column}#egatari-player{flex:1}</style>
</head><body><header><a href="../">一覧</a> <span data-player-title></span></header>
<div id="egatari-player" data-lock="/gallery/samples.lock.json" data-files="/gallery/files/"></div>
</body></html>
`);
// lessons: a play-only book, and copies for the checks
const bookDir = path.join(work, 'book');
fs.cpSync(path.join(ROOT, 'tools/fixtures/article-book'), bookDir, { recursive: true });
await buildPortable(path.join(bookDir, 'deck.html'), {});
const book = Buffer.from((await buildPortable(path.join(bookDir, 'deck.html'), { playOnly: true })).html);
const lessons = [];
const add = (id, bytes, lockBytes = bytes, extra = {}) => { fs.writeFileSync(path.join(G, 'files', id + '.ega.bin'), bytes); lessons.push({ id, file: id + '.play.ega.html', sha256: sha(lockBytes), size: lockBytes.length, title: '代表値の本', lang: 'ja', ...extra }); };
add('book', book);
const changed = Buffer.from(book); changed[changed.length - 20] ^= 1;
add('changed', changed, book);   // one byte differs from the lock
add('longer', Buffer.concat([book, Buffer.from('<!-- more -->')]), book);   // longer than the lock says
fs.writeFileSync(path.join(G, 'samples.lock.json'), JSON.stringify({ repo: 'egatari/examples', tag: 'test', sums: '0'.repeat(64), lessons }, null, 2));

// served with no headers but a content type (a static host that cannot send the §10.1 policy); .bin as application/octet-stream
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const reqs = [];
function serve(dir) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); reqs.push(u.pathname);
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, ...p.split('/').filter(Boolean));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((c) => { srv.closeAllConnections(); srv.close(c); }) })));
}
const site = await serve(SITE);
const other = path.join(work, 'other'); fs.mkdirSync(other);
const framer = await serve(other);

const browser = WEBKIT ? await webkit.launch() : await launch();
console.log(WEBKIT ? 'WebKit' : 'Chromium');
const errors = [];
async function open(q) {
  const c = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 800 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${site.url}/gallery/play/${q}`);
  await p.waitForSelector('html[data-player-ready]', { timeout: scaled(15000) });
  return { c, p, st: () => p.evaluate(() => window.__sitePlayer.state()), status: () => p.textContent('.sp-status') };
}

console.log('play');
{ const { c, p, st } = await open('?id=book');
  ok((await st()).state === 'playing', 'a lesson in the lock plays');
  ok((await p.textContent('[data-player-title]')) === '代表値の本' && (await p.title()).startsWith('代表値の本 – '), 'the page shows the lock\'s title (data-player-title and the tab)');
  const fr = await p.$('#egatari-player iframe');
  ok((await fr.getAttribute('sandbox')) === 'allow-scripts' && (await fr.getAttribute('title')) === '代表値の本' && (await fr.getAttribute('lang')) === 'ja', 'its frame: sandbox="allow-scripts" only, the lock\'s title and language');
  const f = await fr.contentFrame();
  ok(await until(() => f.evaluate(() => !!(window.DECK && DECK.ready))), 'the lesson\'s player starts');
  ok((await f.evaluate(() => self.origin)) === 'null', 'the lesson runs in an opaque origin');
  ok(await f.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } }), 'the lesson cannot read the site\'s storage');
  ok(await f.evaluate(() => { try { return parent.document && false; } catch { return true; } }), 'the lesson cannot reach the site\'s page');
  const n = reqs.length;
  const fetched = await f.evaluate(async (u) => { try { await fetch(u); return true; } catch { return false; } }, site.url + '/gallery/samples.lock.json');
  ok(!fetched && reqs.length === n, 'the lesson cannot use the network (not even the site itself)');
  // a link the lesson asks to open: the link box, in the page
  await f.evaluate(() => parent.postMessage({ egatari: 'openLink', href: 'https://example.org/x', text: 'example' }, '*'));
  ok(await until(() => p.isVisible('#link-box')) && (await p.textContent('#link-box')).includes('example.org'), 'a link the lesson asks to open shows the link box with the host');
  await p.click('#link-box button');
  await f.evaluate(() => parent.postMessage({ egatari: 'openLink', href: 'javascript:alert(1)', text: 'x' }, '*'));
  await sleep(scaled(1700));
  await f.evaluate(() => parent.postMessage({ egatari: 'openLink', href: 'javascript:alert(1)', text: 'x' }, '*'));
  ok(await until(() => p.isVisible('#link-box')) && !(await p.isVisible('#link-box a.pri')), 'a javascript: link is refused (no open button)');
  await p.click('#link-box button');
  // a message from somewhere else than the lesson's frame is ignored
  await p.evaluate(() => window.postMessage({ egatari: 'openLink', href: 'https://example.org/', text: 'x' }, '*'));
  await sleep(scaled(300));
  ok(!(await p.isVisible('#link-box')), 'a request that does not come from the lesson\'s frame is ignored');
  await p.screenshot({ path: path.join(work, 'play.png') });
  await c.close(); }

console.log('refusals');
for (const [q, state, word, what] of [
  ['?id=changed', 'mismatch', '合わない', 'a file with one byte changed'],
  ['?id=longer', 'mismatch', '合わない', 'a file longer than the lock says'],
  ['?id=nothere', 'unknown', '一覧にありません', 'an id not in the lock'],
  ['?id=..%2Fx', 'unknown', '一覧にありません', 'an id that is not [a-z0-9-]'],
  ['', 'no-id', '選ばれていません', 'no id'],
]) {
  const { c, p, st, status } = await open(q);
  ok((await st()).state === state && (await status()).includes(word) && !(await p.$('#egatari-player iframe')), `${what}: nothing plays, and the page says why`);
  await c.close();
}

console.log('framed');
fs.writeFileSync(path.join(other, 'index.html'), `<!DOCTYPE html><iframe src="${site.url}/gallery/play/?id=book" style="width:800px;height:600px"></iframe>`);
{ const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(framer.url + '/');
  const f = await (await p.waitForSelector('iframe')).contentFrame();
  await f.waitForSelector('html[data-player-ready]', { timeout: scaled(15000) });
  ok((await f.evaluate(() => window.__sitePlayer.state().state)) === 'framed' && !(await f.$('#egatari-player iframe')), 'inside another site\'s frame the page plays nothing');
  await c.close(); }

ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await browser.close(); await site.close(); await framer.close();
console.log(fails ? `${fails} failed` : 'all ok');
console.log('work: ' + work);
process.exit(fails ? 1 : 0);
