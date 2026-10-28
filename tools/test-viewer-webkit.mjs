// Egatari Viewer を iPad に近い形で確かめる（Playwright の WebKit と iPad の端末の記述：画面の大きさ・タッチ・Safari の UA）
//   node tools/test-viewer-webkit.mjs [<作業用のフォルダ>]
// npm test の段 test-viewer-webkit（WebKit は `npx playwright-core install webkit` で別に入れる。入っていなければ「skip」で通る）。
// 本物の iPad の代わりではない（handoff の確認リスト viewer-ipad-check.md が本物の iPad の手順）。ここで見るのは：
//   iPad (gen 11) の縦と横、iPad Mini の縦で：最初の画面が出て横にはみ出さない・題が Egatari Viewer。再生専用と編集可のファイルを開いて再生し、
//   タップで次のステップに進む・字幕（s）が出る・閉じる。Egatari ファイルでない・大きすぎるファイルの知らせ。オフラインで「参加する」の知らせ。
//   Mac の Safari（Desktop Safari）で、送りのキーがフォーカスのどこにあっても教材を動かす（tools/viewer-keys-check.mjs）。
//   sandbox の隔て（教材から Viewer の DOM・保存場所・ネットワークに届かない）。ファイルの CSP の <meta>（format spec §4.2）があっても再生する
// service worker は見ない（Playwright の WebKit は service worker を扱えない。オフラインと版は tools/test-play.mjs が Chromium で見る）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from 'playwright-core';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay } from './build-play.mjs';
import { startFakeLive } from './live-fake-server.mjs';
import { checkViewerKeys } from './viewer-keys-check.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-viewer-webkit-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(80); } try { return !!(await f()); } catch { return false; } };

let browser;
try { browser = await webkit.launch(); } catch (e) {
  console.log(`skip: WebKit is not installed (npx playwright-core install webkit): ${String(e.message || e).split('\n')[0]}`);
  process.exit(0);
}

// ---------------------------------------------------------------- fixtures and the build
const deckDir = path.join(work, 'deck');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true });
const deck = path.join(deckDir, 'deck.html');
await buildPortable(deck, {});
const fake = await startFakeLive();
const cfgPath = path.join(deckDir, FORMAT.CONFIG_FILE);
const cfg0 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const FIX = {};
const put = (name, html) => { FIX[name] = path.join(work, name); fs.writeFileSync(FIX[name], html); };
const playOnly = (await buildPortable(deck, { playOnly: true })).html;
put('lesson.play.ega.html', playOnly);
put('lesson.ega.html', (await buildPortable(deck, {})).html);
put('not-egatari.html', '<!doctype html><title>x</title><p>hello</p>');
const BASELINE = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'self' file:; worker-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";
// v0.6 writes the policy into every file itself, so only add it when the build did not
put('csp.play.ega.html', /http-equiv="Content-Security-Policy"/.test(playOnly) ? playOnly : playOnly.replace(/<head>\n?/, (h) => `${h}<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${BASELINE}">\n`));
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: { '*': [{ id: 'qa', kind: 'qa' }] } } } }, null, 2) + '\n');
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const now = Date.now();
put('live.play.ega.html', (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: { v: 1, endpoint: fake.endpoint, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(now - 60e3), to: iso(now + 3600e3) } } })).html);
fs.writeFileSync(cfgPath, JSON.stringify(cfg0, null, 2) + '\n');
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: [fake.endpoint], devLoopback: true, tag: '' });

// the same small server as tools/test-play.mjs: _headers applied like Cloudflare
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const rules = [];
{ let cur = null;
  for (const line of fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { path: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':'); cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  } }
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(OUT, ...p.split('/').filter(Boolean));
  if (!f.startsWith(OUT) || path.basename(f) === '_headers' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' };
  for (const r of rules) if (r.path === '/*' || r.path === u.pathname) for (const [k, v] of r.headers) h[k] = v;
  res.writeHead(200, h); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${srv.address().port}/`;

async function page(device) {
  const ctx = await browser.newContext({ ...devices[device], locale: 'ja-JP', serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(site); await p.waitForSelector('html[data-ready]', { timeout: 20000 });
  return { ctx, p, errors };
}
const lessonFrame = async (p) => { await p.waitForSelector('#lesson', { timeout: 20000 }); let f = null; await until(async () => { f = await (await p.$('#lesson')).contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 20000); return f; };
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const device of ['iPad (gen 11)', 'iPad (gen 11) landscape', 'iPad Mini']) {
  console.log(device);
  const o = await page(device);
  const vp = o.p.viewportSize();
  ok(await o.p.isVisible('#install'), `${device}: the add-to-home-screen hint shows (a browser tab, not standalone)`);
  ok(await o.p.title() === 'Egatari Viewer' && await o.p.textContent('#start-h') === 'Egatari ファイルを再生する' && await noScroll(o.p), `${device} (${vp.width} × ${vp.height}): the start screen, titled Egatari Viewer, no horizontal scroll`);
  await o.p.setInputFiles('#file', FIX['lesson.play.ega.html']);
  const f = await lessonFrame(o.p);
  ok(!!f && await o.p.textContent('#lesson-kind') === 'Egatari ファイル（再生専用）', `${device}: a play-only file plays, shown as 「Egatari ファイル（再生専用）」`);
  const box = await (await o.p.$('#lesson')).boundingBox();
  ok(box && box.width > 0.9 * vp.width && box.x >= 0 && box.x + box.width <= vp.width + 1 && await noScroll(o.p), `${device}: the lesson fills the width (${box && Math.round(box.width)} px), no horizontal scroll`);
  // the player's own controls (kit/tools.js): a tap on the slide shows the bar; 「次へ」 moves on; 「字幕」 shows the captions
  // the bar shows for 5 seconds when the lesson opens, then hides; the player itself brings it back on a finger tap (no help from the page)
  await until(() => f.evaluate(() => { const c = document.getElementById('dt-cb'); return !!c && !c.classList.contains('show'); }), 8000);
  await o.p.tap('#lesson', { position: { x: box.width * 0.5, y: box.height * 0.4 } });
  ok(await until(() => f.evaluate(() => { const c = document.getElementById('dt-cb'); return !!c && c.classList.contains('show'); }), 3000), `${device}: a tap on the slide shows the player's control bar`);
  const key = () => f.evaluate(() => DECK.state().key);
  const k0 = await key();
  await o.p.tap('#lesson', { position: { x: box.width * 0.5, y: box.height * 0.5 } });
  const tapMoved = await until(async () => (await key()) !== k0, 1500);
  const k1 = await key();
  ok(await until(async () => { const b = await f.$('#dt-cb [data-b="next"]'); if (!b) return false; await b.tap(); return (await key()) !== k1; }, 6000),
    `${device}: the player's 「次へ」 (next) button moves the lesson on (a tap on the slide ${tapMoved ? 'also moves it on' : 'does not move it on by itself'})`);
  ok(await until(async () => { const b = await f.$('#dt-cb [data-b="cap"]'); if (!b) return false; if (await b.getAttribute('aria-pressed') !== 'true') await b.tap(); return f.evaluate(() => { const c = document.getElementById('deck-cap'); return !!c && !c.hidden && document.documentElement.classList.contains('captions'); }); }, 6000),
    `${device}: the player's 「字幕」 (captions) button shows the captions`);
  await o.p.tap('#b-close');
  ok(await until(() => o.p.evaluate(() => !document.getElementById('start').hidden && !document.getElementById('lesson'))), `${device}: 「閉じる」 goes back to the start`);
  ok(o.errors.length === 0, `${device}: no page errors (${o.errors.join(' | ')})`);
  await o.ctx.close();
}

// a Mac with Safari (keyboard): the navigation keys move the lesson wherever the focus is (tools/viewer-keys-check.mjs).
// WebKit does not focus a button on a click, and may refuse the page's iframe.focus(): the page hands the keys over
console.log('keys (Desktop Safari)');
{ const o = await page('Desktop Safari');
  await o.p.setInputFiles('#file', FIX['lesson.play.ega.html']);
  const f = await lessonFrame(o.p);
  await checkViewerKeys({ ctx: o.ctx, p: o.p, f, ok, until, engine: 'WebKit' });
  ok(o.errors.length === 0, `keys: no page errors (${o.errors.join(' | ')})`);
  await o.ctx.close(); }

console.log('files and messages (iPad (gen 11))');
{ const o = await page('iPad (gen 11)');
  await o.p.setInputFiles('#file', FIX['lesson.ega.html']);
  await lessonFrame(o.p);
  ok(await o.p.textContent('#lesson-kind') === 'Egatari ファイル（編集可）', 'an editable Egatari file plays too');
  await o.p.tap('#b-close');
  await o.p.setInputFiles('#file', FIX['not-egatari.html']);
  ok(await until(() => o.p.evaluate(() => document.getElementById('msg').textContent === 'Egatari ファイルではありません。Egatari Studio からエクスポートした .ega.html のファイルを選んでください。')), 'not an Egatari file: the message, ending with what to do');
  await o.p.evaluate(() => window.__play.openFile({ size: 100 * 1024 * 1024 + 1 }, 'big.ega.html'));
  ok(await until(() => o.p.evaluate(() => /^ファイルが大きすぎます（100 MB まで）。.+ください。$/.test(document.getElementById('msg').textContent))), 'too large: the message, ending with what to do');
  // sandbox
  await o.p.setInputFiles('#file', FIX['lesson.play.ega.html']);
  const f = await lessonFrame(o.p);
  const r = await f.evaluate(async () => {
    const out = {};
    const t = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = 'blocked:' + (e && e.name); } };
    await t('origin', () => location.origin);
    await t('parentDom', () => window.parent.document.title);
    await t('localStorage', () => localStorage.getItem('egatari-viewer-lang'));
    await t('fetch', () => Promise.race([fetch('/').then((x) => 'fetched ' + x.status), new Promise((res) => setTimeout(() => res('timeout'), 1500))]));
    return out;
  });
  ok(r.origin === 'null' && /^blocked/.test(r.parentDom) && /^blocked/.test(r.localStorage) && /^blocked|timeout/.test(r.fetch), `WebKit sandbox: opaque origin; no DOM, storage or fetch (${JSON.stringify(r)})`);
  await o.p.tap('#b-close');
  await o.p.setInputFiles('#file', FIX['csp.play.ega.html']);
  const g = await lessonFrame(o.p);
  ok(!!g && await g.evaluate(() => DECK.slides.length) > 1 && await g.evaluate(() => document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length) === 2,
    'a file with its own §4.2 CSP <meta> plays in WebKit too (both policies in the frame)');
  await o.p.tap('#b-close');
  // Live while offline
  await o.p.setInputFiles('#file', FIX['live.play.ega.html']);
  await o.p.waitForSelector('#b-start-join', { state: 'visible' });
  await o.ctx.setOffline(true);
  await o.p.tap('#b-start-join');
  await lessonFrame(o.p);
  ok(await until(() => o.p.evaluate(() => /^この端末はネットワークにつながっていません。/.test(document.getElementById('live-msg').textContent))), 'offline Join: the offline message, with what to do');
  await o.ctx.setOffline(false);
  await o.p.tap('#b-join');
  ok(await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected'), 15000), 'back online: 「もう一度試す」 joins the Live (WebKit)');
  await o.p.tap('#b-close');
  ok(o.errors.length === 0, `no page errors (${o.errors.join(' | ')})`);
  await o.p.screenshot({ path: path.join(work, 'ipad-start.png') });
  await o.ctx.close(); }

await browser.close();
await new Promise((r) => { srv.closeAllConnections(); srv.close(r); });
await fake.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
