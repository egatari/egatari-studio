// 全画面（f・帯の「全画面」）を Chromium と WebKit で確かめる
// test-all: platform（--platform でも走らせる：WebKit でも）
//   node tools/test-fullscreen.mjs [<作業用のフォルダ>]
// npm test の段 test-fullscreen（WebKit は `npx playwright-core install webkit` で別に入れる。入っていなければ WebKit の分だけ「skip」）。
//  1. Egatari Viewer：教材の枠には全画面の許可がない（allow に fullscreen がない）。帯の「全画面」と f で、Viewer のページが枠そのものを
//     全画面にし（play/main.js）、その状態が教材に戻る（帯のボタンの aria-pressed。play/lesson-shim.js 4）。f・Esc（ブラウザが抜ける）で抜ける。
//     接頭辞のない API しか知らない古い再生器の呼び方（document.documentElement.requestFullscreen()）でも入る
//  2. 守り：見る人の操作のない教材のスクリプトの頼み・枠でない窓からの頼み・形の違う頼みでは全画面にならない。教材が自分に送った
//     状態の知らせは効かない。枠の中のふつうの全画面（許可のない枠）は断られる。ページの Permissions-Policy は fullscreen=(self)
//  3. 要素の全画面がない所（iPhone の Safari を、要素の requestFullscreen を消して真似る）：帯に「全画面」がなく、キーの一覧に f がない。
//     f を押すと「全画面にできませんでした」
//  4. 1 ファイル（.ega.html）をそのまま開く：帯の「全画面」と f で入って抜ける。接頭辞付きの API（webkitRequestFullscreen）だけでも入る。
//     ブラウザが断ったら「全画面にできませんでした」。全画面を許さない枠の中では「全画面」を出さない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { buildPlay } from './build-play.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-fullscreen-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(80); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- fixtures, the viewer's build and a server
const deckDir = path.join(work, 'deck');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true });
const deck = path.join(deckDir, 'deck.html');
const FILES = path.join(work, 'files');
fs.mkdirSync(FILES);
const LESSON = path.join(FILES, 'lesson.play.ega.html');
fs.writeFileSync(LESSON, (await buildPortable(deck, { playOnly: true })).html);
// a host page that frames the single file in a sandbox without the fullscreen permission (an LMS or a chat app's preview)
fs.writeFileSync(path.join(FILES, 'host.html'), '<!doctype html><meta charset="utf-8"><title>host</title><body style="margin:0"><iframe id="f" sandbox="allow-scripts" src="lesson.play.ega.html" style="width:960px;height:600px;border:0"></iframe>');
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: [], devLoopback: true, tag: '' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const rules = [];
{ let cur = null;
  for (const line of fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { path: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':'); cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  } }
const permissions = (rules.find((r) => r.path === '/*') || { headers: [] }).headers.find(([k]) => k === 'Permissions-Policy');
// /files/… : the fixtures as they are (no headers); everything else: the viewer with its _headers, as Cloudflare serves it
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  const isFile = p.startsWith('/files/');
  const base = isFile ? FILES : OUT;
  if (isFile) p = p.slice('/files'.length);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(base, ...p.split('/').filter(Boolean));
  if (!f.startsWith(base) || path.basename(f) === '_headers' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' };
  if (!isFile) for (const r of rules) if (r.path === '/*' || r.path === u.pathname) for (const [k, v] of r.headers) h[k] = v;
  res.writeHead(200, h); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${srv.address().port}/`;

ok(!!permissions && /(^|, )fullscreen=\(self\)(,|$)/.test(permissions[1]), `the viewer's Permissions-Policy keeps fullscreen to the page itself (${permissions && permissions[1]})`);

// iPhone Safari has no element fullscreen: Element.prototype has neither requestFullscreen nor webkitRequestFullscreen
const NO_API = `(() => { for (const n of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) { try { delete Element.prototype[n]; } catch (e) {} }
  for (const n of ['fullscreenEnabled', 'webkitFullscreenEnabled', 'fullscreenElement', 'webkitFullscreenElement', 'exitFullscreen', 'webkitExitFullscreen']) { try { delete Document.prototype[n]; } catch (e) {} } })();`;
// an older iPadOS Safari: only the prefixed names (webkitRequestFullscreen returns nothing)
const PREFIXED_ONLY = `(() => { const go = Element.prototype.requestFullscreen; if (!go) return; delete Element.prototype.requestFullscreen;
  Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, writable: true, value: function () { go.call(this).catch(() => {}); } }); })();`;
// a browser that refuses (the request rejects)
const REFUSE = `(() => { Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, writable: true, value: function () { return Promise.reject(new TypeError('refused')); } }); })();`;

async function context(browser, init) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { ctx, p, errors };
}
const deckReady = (f) => until(() => f.evaluate(() => !!(window.DECK && DECK.ready && document.getElementById('dt-cb'))), 20000);
async function viewerLesson(o) {
  await o.p.goto(site); await o.p.waitForSelector('html[data-ready]', { timeout: scaled(20000) });
  await o.p.setInputFiles('#file', LESSON);
  await o.p.waitForSelector('#lesson', { timeout: scaled(20000) });
  let f = null;
  await until(async () => { f = await (await o.p.$('#lesson')).contentFrame(); return !!f && await f.evaluate(() => !!(window.DECK && DECK.ready && document.getElementById('dt-cb'))); }, 20000);
  return f;
}
// the bar's 全画面 button, pressed with a real click (the bar ignores a click in its first 350 ms after the pointer revealed it)
// The bar hides when the pointer rests: on a loaded runner it could hide again before the hover, which then waited for a visible
// button until the timeout (macOS CI). Move the real pointer over the lesson to reveal the bar, wait until the button is visible, then
// hover and click; try again (up to 3 times) if the bar hid in between.
async function pressFull(f) {
  const b = await f.$('#dt-cb [data-b="full"]');
  if (!b) return false;
  const page = f.page();
  let box = null;   // the lesson's frame in the Viewer; the whole viewport when the file itself is the page
  if (f.parentFrame()) box = await (await f.frameElement()).boundingBox();
  else { const v = page.viewportSize(); if (v) box = { x: 0, y: 0, width: v.width, height: v.height }; }
  for (let i = 0; i < 3; i++) {
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30, { steps: 4 }); }
    if (!await until(() => b.isVisible(), scaled(3000))) continue;
    try { await b.hover({ timeout: scaled(3000) }); } catch { continue; }
    await sleep(450);
    try { await b.click({ timeout: scaled(3000) }); return true; } catch { /* the bar hid; reveal it again */ }
  }
  await b.hover(); await sleep(450); await b.click();   // last try: let Playwright's own error say what is wrong
  return true;
}
const pressed = (f) => f.evaluate(() => { const b = document.querySelector('#dt-cb [data-b="full"]'); return b ? b.getAttribute('aria-pressed') : null; });
const helpHasF = async (f) => { await f.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))); await sleep(200);
  const has = await f.evaluate(() => [...document.querySelectorAll('kbd')].some((k) => k.textContent === 'f' && !k.closest('#dt-cb')));
  await f.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))); return has; };
const toastIs = (f, text) => until(() => f.evaluate((t) => { const e = document.getElementById('deck-toast'); return !!e && e.textContent === t && e.classList.contains('show'); }, text), 3000);

async function run(name, browser) {
  console.log(`${name}: Egatari Viewer`);
  { const o = await context(browser);
    const f = await viewerLesson(o);
    const attrs = await o.p.$eval('#lesson', (e) => ({ sandbox: e.getAttribute('sandbox'), allow: e.getAttribute('allow'), afs: e.hasAttribute('allowfullscreen') }));
    ok(attrs.sandbox === 'allow-scripts' && !/fullscreen/.test(attrs.allow || '') && !attrs.afs, `${name}: the frame stays sandbox="allow-scripts", with no fullscreen permission (allow="${attrs.allow}")`);
    ok(await f.$('#dt-cb [data-b="full"]') !== null && await pressed(f) === 'false' && await helpHasF(f), `${name}: the bar shows 「全画面」 (not pressed) and the key list has f`);
    const fsIsFrame = () => o.p.evaluate(() => { const e = document.fullscreenElement || document.webkitFullscreenElement; return !!e && e.id === 'lesson'; });
    const notFs = () => o.p.evaluate(() => !(document.fullscreenElement || document.webkitFullscreenElement));
    const inside = () => f.evaluate(() => document.fullscreenElement === document.documentElement);
    await pressFull(f);
    ok(await until(fsIsFrame) && await until(async () => await pressed(f) === 'true') && await inside(),
      `${name}: 「全画面」 puts the lesson's frame itself into fullscreen; the bar shows it pressed; the lesson's document.fullscreenElement is its root`);
    ok(await until(() => f.evaluate(() => document.hasFocus())), `${name}: the lesson has the focus in fullscreen`);
    await f.press('body', 'f');
    ok(await until(notFs) && await until(async () => await pressed(f) === 'false') && !(await inside()), `${name}: f leaves fullscreen; the button is no longer pressed`);
    await f.press('body', 'f');
    ok(await until(fsIsFrame) && await until(async () => await pressed(f) === 'true'), `${name}: f enters fullscreen again`);
    // Esc: the browser leaves fullscreen by itself (headless browsers may not handle the key: then leave as the browser does)
    await o.p.keyboard.press('Escape');
    let how = 'Esc';
    if (!(await until(notFs, 1500))) { how = 'the browser leaving (exitFullscreen in the page)'; await o.p.evaluate(() => (document.exitFullscreen || document.webkitExitFullscreen).call(document)); }
    ok(await until(notFs) && await until(async () => await pressed(f) === 'false'), `${name}: leaving with ${how}: the state comes back to the lesson (not pressed)`);
    await pressFull(f);
    ok(await until(fsIsFrame) && await until(async () => await pressed(f) === 'true'), `${name}: 「全画面」 again: fullscreen`);
    await pressFull(f);
    ok(await until(notFs) && await until(async () => await pressed(f) === 'false'), `${name}: 「全画面」 while in fullscreen leaves it`);
    // an older player inside the file: it knows only document.documentElement.requestFullscreen() and document.exitFullscreen()
    await f.evaluate(() => { window.__old = (e) => { if (e.target && e.target.id === 'old') { e.stopImmediatePropagation(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } };
      const b = document.createElement('button'); b.id = 'old'; b.textContent = 'old'; b.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99999;width:80px;height:40px'; document.body.appendChild(b);
      document.addEventListener('click', window.__old, true); });
    await f.click('#old');
    ok(await until(fsIsFrame), `${name}: an older player's own call (document.documentElement.requestFullscreen()) enters fullscreen through the page`);
    await f.click('#old');
    ok(await until(notFs), `${name}: and its document.exitFullscreen() leaves it`);

    // ------------------------------------------------ the frame still cannot take the screen by itself
    // Lesson script on its own: Playwright's evaluate counts as a user gesture, so the requests run from a timer 6 s later
    // (after any activation has expired: Chromium keeps one 5 s), and nothing is evaluated in the page or the frame meanwhile
    await f.evaluate(() => { window.__r1 = 'pending'; setTimeout(() => {
      parent.postMessage({ egaViewer: 'fullscreen', on: true }, '*');
      document.documentElement.requestFullscreen().then(() => { window.__r1 = 'entered'; }, (e) => { window.__r1 = 'refused ' + e.message; });
    }, 6000); });
    await sleep(8500);
    const r1 = await f.evaluate(() => window.__r1);
    ok(!(await fsIsFrame()) && /^refused/.test(r1), `${name}: lesson script without the viewer's activation (a message, or the API): no fullscreen (${r1})`);
    // the frame's own fullscreen (the native API, as a lesson that got around the shim would call it) is refused: no permission
    const native = await f.evaluate(() => new Promise((res) => {
      const fr = document.createElement('iframe'); // frame-src 'none': no fresh realm with the native API either
      fr.srcdoc = '<p>x</p>'; document.body.appendChild(fr);
      setTimeout(() => { let n = 'no realm'; try { n = fr.contentWindow && fr.contentWindow.Element ? 'realm' : 'no realm'; } catch (e) { n = 'blocked'; } fr.remove(); res(n + '; policy ' + (document.featurePolicy ? String(document.featurePolicy.allowsFeature('fullscreen')) : 'n/a')); }, 300);
    }));
    ok(/policy (false|n\/a)$/.test(native), `${name}: the frame's own permissions policy refuses fullscreen (${native})`);
    // a request with the viewer's activation but from another window (this page itself): ignored (only the frame, only "null")
    await o.p.evaluate(() => { document.getElementById('lesson-title').addEventListener('click', () => window.postMessage({ egaViewer: 'fullscreen', on: true }, '*')); });
    await o.p.click('#lesson-title');
    ok(!(await until(fsIsFrame, 1200)), `${name}: a fullscreen request from a window that is not the lesson's frame is ignored`);
    // a request with the viewer's activation but in another shape: ignored
    await f.evaluate(() => { document.removeEventListener('click', window.__old, true); document.addEventListener('click', (e) => { if (e.target.id === 'old') { e.stopImmediatePropagation(); parent.postMessage({ egaViewer: 'fullscreen', on: true, element: 'x' }, '*'); } }, true); });
    await f.click('#old');
    ok(!(await until(fsIsFrame, 1200)), `${name}: a request with extra members is ignored`);
    // the lesson cannot make the shim report fullscreen by messaging itself
    await f.evaluate(() => window.postMessage({ egaViewer: 'fullscreen-state', on: true, enabled: true }, '*'));
    await sleep(300);
    ok(!(await inside()) && await pressed(f) === 'false', `${name}: a state message the lesson sends itself changes nothing`);
    ok(o.errors.length === 0, `${name}: no page errors (${o.errors.join(' | ')})`);
    await o.ctx.close(); }

  console.log(`${name}: no element fullscreen (as on iPhone Safari)`);
  { const o = await context(browser, NO_API);
    const f = await viewerLesson(o);
    ok(await f.$('#dt-cb [data-b="full"]') === null && !(await helpHasF(f)), `${name}: viewer without element fullscreen: no 「全画面」 in the bar, no f in the key list`);
    await f.press('body', 'f');
    ok(await toastIs(f, '全画面にできませんでした'), `${name}: f there says 「全画面にできませんでした」`);
    await o.p.goto(site + 'files/lesson.play.ega.html');
    await deckReady(o.p.mainFrame());
    ok(await o.p.$('#dt-cb [data-b="full"]') === null && !(await helpHasF(o.p.mainFrame())), `${name}: the single file without element fullscreen: no 「全画面」, no f in the key list`);
    await o.ctx.close(); }

  console.log(`${name}: the single file (.ega.html) opened as it is`);
  { const o = await context(browser);
    await o.p.goto(site + 'files/lesson.play.ega.html');
    const f = o.p.mainFrame();
    await deckReady(f);
    const on = () => o.p.evaluate(() => document.fullscreenElement === document.documentElement);
    await pressFull(f);
    ok(await until(on) && await until(async () => await pressed(f) === 'true'), `${name}: 「全画面」 enters fullscreen; pressed`);
    await o.p.keyboard.press('f');
    ok(await until(async () => !(await on())) && await until(async () => await pressed(f) === 'false'), `${name}: f leaves it; not pressed`);
    await o.p.keyboard.press('f');
    ok(await until(on), `${name}: f enters it`);
    await o.p.evaluate(() => document.exitFullscreen());
    ok(await until(async () => await pressed(f) === 'false'), `${name}: leaving from outside (Esc) updates the button`);
    ok(o.errors.length === 0, `${name}: no page errors (${o.errors.join(' | ')})`);
    await o.ctx.close(); }
  { const o = await context(browser, PREFIXED_ONLY);
    await o.p.goto(site + 'files/lesson.play.ega.html');
    await deckReady(o.p.mainFrame());
    const has = await o.p.evaluate(() => [typeof document.documentElement.requestFullscreen, typeof document.documentElement.webkitRequestFullscreen].join(','));
    await o.p.keyboard.press('f');
    ok(has === 'undefined,function' && await until(() => o.p.evaluate(() => !!document.fullscreenElement)), `${name}: only webkitRequestFullscreen (older iPadOS): f still enters fullscreen (${has})`);
    await o.ctx.close(); }
  { const o = await context(browser, REFUSE);
    await o.p.goto(site + 'files/lesson.play.ega.html');
    await deckReady(o.p.mainFrame());
    await o.p.keyboard.press('f');
    ok(await toastIs(o.p.mainFrame(), '全画面にできませんでした'), `${name}: the browser refuses: 「全画面にできませんでした」`);
    ok(o.errors.length === 0, `${name}: the refusal is caught (no page errors: ${o.errors.join(' | ')})`);
    await o.ctx.close(); }
  { const o = await context(browser);
    await o.p.goto(site + 'files/host.html');
    const f = await (await o.p.waitForSelector('#f')).contentFrame();
    await deckReady(f);
    ok(await f.$('#dt-cb [data-b="full"]') === null, `${name}: framed in a sandbox without the fullscreen permission: no 「全画面」`);
    await o.ctx.close(); }
}

const chromium = await launch();
await run('Chromium', chromium);
await chromium.close();
let wk = null;
try { wk = await webkit.launch(); } catch (e) { console.log(`skip WebKit: not installed (npx playwright-core install webkit): ${String(e.message || e).split('\n')[0]}`); }
if (wk) { await run('WebKit', wk); await wk.close(); }

await new Promise((r) => { srv.closeAllConnections(); srv.close(r); });
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
