// Egatari Play（play/、play.egatari.org）の試験（npm test の test-play）
//   node tools/test-play.mjs <作業用のフォルダ>
// _play/ を一時フォルダに組み（tools/build-play.mjs。試験の部屋だけループバックを許す版）、_headers を読んで同じ見出しを付ける小さなサーバーで配る
// （Cloudflare の静的なファイルと同じ。POST /share は play/worker.js と同じ 303）。確かめること：
//  1. 組み立て：_headers（CSP・frame-ancestors・X-Frame-Options）・manifest（192・512 の画像・share_target）・sw.js の一覧（自分のファイルだけ）
//  2. 再生のみと編集可の 1 ファイルを開く（種類の表示・題・sandbox の枠・srcdoc・信頼する先頭部分の CSP）
//  3. sandbox：教材から親の DOM・localStorage・IndexedDB・OPFS・cookie・fetch・WebSocket・親への遷移に届かない
//  4. 枠の中を断る：見出しのあるサーバーでは読み込まれず、見出しのないサーバーでも guard.js が止める
//  5. service worker：キャッシュは自分のファイルだけ（教材を開いても増えない）・オフラインで開ける・新しい版の知らせと更新
//  6. 最近のファイル：OPFS と IndexedDB の両方で、保存・一覧・開き直し・1 つ削除・すべて削除・残さない設定
//  7. share_target：service worker が受けて開く／service worker がないときは知らせ
//  8. リンク：教材が頼んだリンクは決まり（kit/core/link-policy.mjs）の箱をページの側に出す。開かない scheme・相対・別の host の字・
//     同じ host の 2 度目・偽の送り手（枠でない窓）の頼みは無視
//  9. ライブのない教材は通信 0（開いてから閉じるまで要求も WebSocket もない）
// 10. ライブ：参加する前・窓の外は通信 0、参加する（ページが WebSocket を持つ。教材の枠はつながない）・質問・投票の段階で板が開く・投票・
//     このページが許さない endpoint は参加のページへのリンクだけ。試験の部屋は tools/live-fake-server.mjs
// 11. 電話の幅で横にはみ出さない・ボタンに名前がある
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay, pageCsp } from './build-play.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { scanLesson } from '../play/scan.mjs';
import { decideLink } from '../play/links.mjs';
import { startFakeLive } from './live-fake-server.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-play-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- fixtures
console.log('fixtures');
const deckDir = path.join(work, 'deck');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true });
const deck = path.join(deckDir, 'deck.html');
await buildPortable(deck, {});   // docId
const fake = await startFakeLive();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const POLL_STEP = '何を最小化するか:0';
const ACTS = { '*': [{ id: 'qa', kind: 'qa' }], [POLL_STEP]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'], label: '2 枚目・ステップ 1' }] };
const cfgPath = path.join(deckDir, FORMAT.CONFIG_FILE);
const cfg0 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const playOnly = (await buildPortable(deck, { playOnly: true })).html;
const editable = (await buildPortable(deck, {})).html;
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: ACTS } } }, null, 2) + '\n');
const room = (from, to, endpoint = fake.endpoint) => ({ v: 1, endpoint, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(from), to: iso(to) } });
const now = Date.now();
const live = (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now - 60e3, now + 2 * 3600e3) })).html;
const early = (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now + 3600e3, now + 7200e3) })).html;
// an endpoint this page does not allow (another loopback port): the join link only
const other = (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now - 60e3, now + 3600e3, 'http://localhost:9') })).html;
const editableLive = (await buildPortable(deck, {})).html;   // the teacher's own file: extensions.live without a key
// Live with questions only (no poll on any step)
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: { '*': [{ id: 'qa', kind: 'qa' }] } } } }, null, 2) + '\n');
const qaOnly = (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now - 60e3, now + 2 * 3600e3) })).html;
fs.writeFileSync(cfgPath, JSON.stringify(cfg0, null, 2) + '\n');
const FIX = {};
const put = (name, html) => { FIX[name] = path.join(work, name); fs.writeFileSync(FIX[name], html); };
put('lesson.play.ega.html', playOnly); put('lesson.ega.html', editable); put('live.play.ega.html', live); put('early.play.ega.html', early);
put('other.play.ega.html', other); put('teacher.ega.html', editableLive); put('qa.play.ega.html', qaOnly);
put('not-egatari.html', '<!doctype html><title>x</title><p>hello</p>');

// ---------------------------------------------------------------- 1. the build
console.log('build');
const OUT = path.join(work, '_play');
const built = await buildPlay({ out: OUT, endpoints: [fake.endpoint], devLoopback: true, tag: '' });
const headersText = fs.readFileSync(path.join(OUT, '_headers'), 'utf8');
ok(/frame-ancestors 'none'/.test(headersText) && /X-Frame-Options: DENY/.test(headersText), '_headers: frame-ancestors \'none\' and X-Frame-Options: DENY for every file');
const host = new URL(fake.endpoint).host;
ok(new RegExp(`connect-src 'self' http://${host.replace('.', '\\.')} ws://${host.replace('.', '\\.')};`).test(headersText) && /frame-src 'none'/.test(headersText) && !/unsafe-eval/.test(headersText),
  '_headers: connect-src is this page and the allowed Live endpoint only; frame-src \'none\'; no eval');
// the page's policy, exactly: srcdoc lessons inherit it, so it allows inline scripts and styles and nothing else
const CSP_FOR = (connect) => `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src data: blob:; connect-src ${connect}; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
ok(built.csp === CSP_FOR(`'self' http://${host} ws://${host}`) && headersText.includes(`  Content-Security-Policy: ${built.csp}\n`), `CSP: exactly the expected policy (${built.csp})`);
ok(pageCsp(['https://live.egatari.org'], LivePolicy()) === CSP_FOR("'self' https://live.egatari.org wss://live.egatari.org"), 'CSP: the production build connects only to itself (the service worker\'s install) and the built-in Live endpoint');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.webmanifest'), 'utf8'));
ok(manifest.icons.map((i) => i.sizes).join() === '192x192,512x512' && manifest.icons.every((i) => fs.existsSync(path.join(OUT, i.src))), 'manifest: the 192 and 512 px logo icons, present in the build');
ok(fs.readFileSync(path.join(OUT, 'icons', 'icon-512.png')).equals(fs.readFileSync(path.join(ROOT, 'assets', 'logo', 'icon-512.png'))), 'manifest: icon-512.png is assets/logo/icon-512.png unchanged');
ok(manifest.share_target && manifest.share_target.method === 'POST' && manifest.share_target.enctype === 'multipart/form-data' && manifest.share_target.params.files[0].name === 'lesson', 'manifest: share_target POST multipart with the file field "lesson"');
const swText = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
ok(swText.includes(JSON.stringify(built.version)) && !/\.put\s*\(/.test(swText.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'sw.js: versioned; never calls cache.put (only the install list is cached)');
ok(built.files.every((f) => f === './' || fs.existsSync(path.join(OUT, f))) && !built.files.some((f) => /_headers|sw\.js/.test(f)), 'sw.js: the list is the page\'s own files (not sw.js, not _headers)');
{ let e1 = ''; try { await buildPlay({ out: path.join(work, 'bad'), endpoints: ['http://example.org'], devLoopback: false }); } catch (e) { e1 = e.message; } ok(/not an https origin/.test(e1), 'build: refuses a non-https Live endpoint'); }
// the scanner runs nothing and reads only the JSON blocks
{ const a = scanLesson(playOnly), b = scanLesson(editable), c = scanLesson(live), d = scanLesson('<!doctype html><p>x'), t = scanLesson(editableLive);
  ok(a.ok && a.kind === 'play-only' && b.ok && b.kind === 'editable' && a.meta.docId && a.meta.docId === b.meta.docId, 'scan: play-only and editable files, same docId');
  ok(c.ok && c.liveFrom === 'deck-extensions' && c.live.room === 'r-7k2q6xw4' && !d.ok && d.error === 'not-egatari', 'scan: live from deck-extensions; a page that is not an Egatari file is refused');
  ok(t.ok && t.liveFrom === 'index' && !('key' in t.live), 'scan: the teacher\'s editable file carries extensions.live in the index, without a key');
  const tricky = playOnly.replace('<body', '<body><!-- <script type="application/json" id="deck-extensions">{"live":{"v":1}}</script> -->');
  ok(scanLesson(tricky).live === null, 'scan: a block inside a comment is not read'); }
// the link rule as the page applies it
{ const h = new Set();
  ok(decideLink({ href: 'next.ega.html', text: '' }, h).reason === 'relative' && decideLink({ href: 'javascript:alert(1)', text: '' }, h).reason === 'scheme'
    && decideLink({ href: 'file:///etc/passwd', text: '' }, h).reason === 'scheme', 'link rule: relative links, javascript: and file: are refused');
  const d = decideLink({ href: '//example.org/a', text: 'example.org' }, h);
  ok(d.verdict === 'confirm' && d.url === 'https://example.org/a' && !d.must, 'link rule: //host is https://host');
  ok(decideLink({ href: 'https://evil.example/', text: 'https://bank.example' }, h).reasons.includes('mismatch'), 'link rule: text naming another host is confirmed every time'); }

// ---------------------------------------------------------------- server: _headers like Cloudflare; POST /share like play/worker.js
function parseHeaders(text) {
  const rules = []; let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { path: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':'); cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serve(dir, { headers = true } = {}) {
  const extra = new Map(), reqs = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    reqs.push(req.method + ' ' + u.pathname);
    if (extra.has(u.pathname)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(extra.get(u.pathname)); return; }
    if (u.pathname === '/share' && req.method === 'POST') { req.resume(); res.writeHead(303, { Location: '/?share=nosw' }); res.end(); return; }
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, ...p.split('/').filter(Boolean));
    if (!f.startsWith(dir) || path.basename(f) === '_headers' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' };
    if (headers) for (const r of parseHeaders(fs.readFileSync(path.join(dir, '_headers'), 'utf8'))) if (r.path === '/*' || r.path === u.pathname) for (const [k, v] of r.headers) h[k] = v;
    res.writeHead(200, h); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}/`, extra, reqs, close: () => new Promise((c) => { srv.closeAllConnections(); srv.close(c); }) })));
}
const site = await serve(OUT);
const bare = await serve(OUT, { headers: false });   // a host that sends no headers (the JS check must refuse framing)
const framer = await serve(work, { headers: false });
{ const h = await new Promise((r) => http.get(site.url, (res) => { res.resume(); r(res.headers); }));
  ok(h['content-security-policy'] === built.csp && h['x-frame-options'] === 'DENY', 'served: the page carries exactly that policy and X-Frame-Options: DENY'); }
const browser = await launch();
async function page(url = site.url, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: opts.viewport || { width: 1280, height: 800 }, serviceWorkers: opts.sw === false ? 'block' : 'allow' });
  // no test reaches the network: anything but this machine is answered here (links opened in a new tab)
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  if (url) { await p.goto(url); await p.waitForSelector('html[data-ready]', { timeout: 15000 }); }
  return { ctx, p, errors, close: () => ctx.close() };
}
const lessonFrame = async (p) => { await p.waitForSelector('#lesson'); let f = null; await until(async () => { f = (await (await p.$('#lesson')).contentFrame()); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000); return f; };
const openFixture = async (p, name) => { await p.setInputFiles('#file', FIX[name]); };
const state = (p) => p.evaluate(() => window.__play.state());

// ---------------------------------------------------------------- 2. open a play-only and an editable file
console.log('open');
{ const o = await page();
  await openFixture(o.p, 'lesson.play.ega.html');
  const f = await lessonFrame(o.p);
  ok(!!f, 'play-only: the lesson plays (DECK.ready in the frame)');
  ok(await o.p.textContent('#lesson-kind') === 'Egatari ファイル（再生のみ）', 'play-only: shown as 「Egatari ファイル（再生のみ）」');
  const attrs = await o.p.$eval('#lesson', (e) => ({ sandbox: e.getAttribute('sandbox'), src: e.getAttribute('src'), srcdoc: e.srcdoc.slice(0, 400) }));
  ok(attrs.sandbox === 'allow-scripts' && attrs.src === null, `the frame: sandbox="allow-scripts" only, srcdoc (no src) (${attrs.sandbox})`);
  ok(/^<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/.test(attrs.srcdoc), 'the frame: the trusted prefix carries the preview policy (connect-src \'none\') before the file\'s bytes');
  ok(await f.evaluate(() => location.search) === '?embed=1' && await f.evaluate(() => DECK.slides.length) > 1, 'the frame: the lesson runs in embedding mode (?embed=1) with its slides');
  ok(await o.p.evaluate(() => document.querySelector('#lesson-title').textContent.length > 0), 'the lesson\'s title is in the bar');
  await o.p.click('#b-close');
  ok(await until(() => o.p.evaluate(() => !document.querySelector('#lesson') && !document.querySelector('#start').hidden)), 'close: back to the start, the frame removed');
  await openFixture(o.p, 'lesson.ega.html');
  await lessonFrame(o.p);
  ok(await o.p.textContent('#lesson-kind') === 'Egatari ファイル（編集可）', 'editable: shown as 「Egatari ファイル（編集可）」, and it plays');
  await o.p.click('#b-lang');
  ok(await o.p.textContent('#lesson-kind') === 'Egatari file (editable)' && await o.p.evaluate(() => document.documentElement.lang) === 'en', 'English: the kind reads "Egatari file (editable)"');
  await o.p.click('#b-lang');
  await o.p.click('#b-close');
  await openFixture(o.p, 'not-egatari.html');
  ok(await until(() => o.p.evaluate(() => /Egatari ファイルではありません/.test(document.querySelector('#msg').textContent))) && !(await o.p.$('#lesson')), 'not an Egatari file: refused with a message, nothing runs');
  ok(o.errors.length === 0, `no page errors (${o.errors.join(' | ')})`);
  await o.close(); }

// ---------------------------------------------------------------- 3. sandbox isolation
console.log('sandbox');
{ const o = await page();
  await o.p.evaluate(async () => {
    localStorage.setItem('secret', 's3cret'); document.cookie = 'c=1; path=/';
    const root = await navigator.storage.getDirectory(); const h = await root.getFileHandle('secret.txt', { create: true }); const w = await h.createWritable(); await w.write('s3cret'); await w.close();
  });
  await openFixture(o.p, 'lesson.play.ega.html');
  const f = await lessonFrame(o.p);
  const r = await f.evaluate(async () => {
    const out = {};
    const t = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = 'blocked:' + (e && e.name); } };
    await t('origin', () => location.origin);
    await t('parentDom', () => window.parent.document.title);
    await t('localStorage', () => localStorage.getItem('secret'));
    await t('cookie', () => document.cookie);
    await t('indexedDB', () => new Promise((res, rej) => { const q = indexedDB.open('egatari-play'); q.onsuccess = () => res('opened'); q.onerror = () => rej(q.error); }));
    await t('opfs', async () => { const root = await navigator.storage.getDirectory(); return (await (await root.getFileHandle('secret.txt')).getFile()).text(); });
    await t('fetch', () => Promise.race([fetch('/').then((x) => 'fetched ' + x.status), new Promise((res) => setTimeout(() => res('timeout'), 1500))]));
    await t('ws', () => new Promise((res) => { try { const s = new WebSocket('ws://127.0.0.1:1/'); s.onerror = () => res('error'); s.onopen = () => res('open'); setTimeout(() => res('pending'), 800); } catch (e) { res('blocked:' + e.name); } }));
    await t('topNav', () => { window.top.location.href = 'https://example.org/'; return 'navigated?'; });
    return out;
  });
  ok(r.origin === 'null', `the lesson has an opaque origin (${r.origin})`);
  ok(/^blocked/.test(r.parentDom), `the lesson cannot reach the page's DOM (${r.parentDom})`);
  ok(/^blocked/.test(r.localStorage) && !/s3cret/.test(r.cookie), `the lesson cannot read the page's localStorage or cookies (${r.localStorage}, "${r.cookie}")`);
  ok(/^blocked/.test(r.indexedDB) && /^blocked/.test(r.opfs), `the lesson cannot open the page's IndexedDB or OPFS (${r.indexedDB}, ${r.opfs})`);
  ok(/^blocked/.test(r.fetch) && r.ws !== 'open', `the lesson cannot fetch or open a WebSocket (${r.fetch}, ${r.ws})`);
  await sleep(300);
  ok(o.p.url() === site.url && await o.p.$('#lesson') !== null, `the lesson cannot navigate the page (${r.topNav})`);
  await o.close(); }

// ---------------------------------------------------------------- 4. framed refusal
console.log('framed');
{ const o = await page(null);
  framer.extra.set('/frame-site.html', `<!doctype html><iframe id="x" src="${site.url}" style="width:600px;height:400px"></iframe>`);
  framer.extra.set('/frame-bare.html', `<!doctype html><iframe id="x" src="${bare.url}" style="width:600px;height:400px"></iframe>`);
  await o.p.goto(framer.url + 'frame-site.html'); await sleep(800);
  const inner = o.p.frames().find((f) => f !== o.p.mainFrame());
  const loaded = inner ? await inner.evaluate(() => !!document.querySelector('#start')).catch(() => false) : false;
  ok(!loaded, 'with the headers: the browser refuses to show the page in a frame (frame-ancestors \'none\', X-Frame-Options)');
  await o.p.goto(framer.url + 'frame-bare.html'); await sleep(800);
  const inner2 = o.p.frames().find((f) => f !== o.p.mainFrame());
  const v = inner2 ? await inner2.evaluate(() => ({ framed: document.documentElement.hasAttribute('data-framed'), msg: getComputedStyle(document.getElementById('framed')).display, start: getComputedStyle(document.getElementById('main')).display, ready: document.documentElement.hasAttribute('data-ready') })) : null;
  ok(v && v.framed && v.msg === 'block' && v.start === 'none' && !v.ready, `without the headers: guard.js refuses (only the refusal shows; the page does not start) (${JSON.stringify(v)})`);
  await o.close(); }

// ---------------------------------------------------------------- 5. service worker
console.log('service worker');
{ const o = await page();
  await o.p.evaluate(() => navigator.serviceWorker.ready);
  await o.p.reload(); await o.p.waitForSelector('html[data-ready]');
  ok(await until(() => o.p.evaluate(() => !!navigator.serviceWorker.controller)), 'the service worker controls the page');
  const cached = () => o.p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => r.url).sort(); return out; });
  const want = built.files.map((f) => new URL(f, site.url).href).sort();
  let c = await cached();
  ok(Object.keys(c).length === 1 && JSON.stringify(Object.values(c)[0]) === JSON.stringify(want), `the cache holds exactly the page's own files (${Object.values(c)[0]?.length} of ${want.length})`);
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p);
  c = await cached();
  ok(JSON.stringify(Object.values(c)[0]) === JSON.stringify(want) && Object.keys(c).length === 1, 'after opening a lesson: the cache is unchanged (the lesson file is not cached)');
  await o.ctx.setOffline(true);
  await o.p.goto(site.url); await o.p.waitForSelector('html[data-ready]', { timeout: 10000 }).catch(() => {});
  ok(await o.p.evaluate(() => document.documentElement.hasAttribute('data-ready')), 'offline: the page opens from the service worker');
  await openFixture(o.p, 'lesson.play.ega.html');
  ok(!!(await lessonFrame(o.p)), 'offline: a lesson plays');
  await o.ctx.setOffline(false);
  // a new version: rebuilt into the same folder; the page shows the update and changes version only when asked
  const v1 = built.version;
  const b2 = await buildPlay({ out: OUT, endpoints: [fake.endpoint], devLoopback: true, tag: 'v2' });
  await o.p.goto(site.url); await o.p.waitForSelector('html[data-ready]');
  await o.p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  ok(await until(() => o.p.evaluate(() => !document.getElementById('update').hidden), 10000), 'a new version: 「新しい版があります」 with an update button');
  ok(await o.p.textContent('#version') === v1, 'a new version: the old one keeps running until the viewer updates');
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p);
  ok(await o.p.evaluate(() => document.getElementById('update').hidden), 'a new version: the notice is held back while a lesson plays (nothing appears next to the lesson\'s frame)');
  await o.p.click('#b-close');
  ok(await until(() => o.p.evaluate(() => !document.getElementById('update').hidden)), 'a new version: the notice comes back when the lesson is closed');
  await Promise.all([o.p.waitForNavigation({ timeout: 10000 }).catch(() => {}), o.p.click('#b-update')]);
  await o.p.waitForSelector('html[data-ready]');
  ok(await until(() => o.p.evaluate((v) => document.getElementById('version').textContent === v, b2.version)), `after updating: version ${b2.version}`);
  c = await cached();
  ok(Object.keys(c).length === 1 && Object.keys(c)[0].endsWith(b2.version), 'after updating: only the new version\'s cache remains');
  await o.close();
  built.version = b2.version; built.files = b2.files; }

// ---------------------------------------------------------------- 6. recent files
console.log('recent files');
for (const store of ['opfs', 'idb']) {
  const o = await page(site.url + (store === 'idb' ? '?store=idb' : ''));
  ok((await state(o.p)).store === store, `${store}: the store in use`);
  ok(/この端末にだけ保存されます/.test(await o.p.textContent('#recent')), `${store}: the notice 「この端末にだけ保存されます」`);
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p); await o.p.click('#b-close');
  await openFixture(o.p, 'lesson.ega.html'); await lessonFrame(o.p); await o.p.click('#b-close');
  await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 2));
  ok(await o.p.evaluate(() => document.querySelectorAll('#recent-list li').length) === 2, `${store}: both files are listed`);
  await o.p.reload(); await o.p.waitForSelector('html[data-ready]');
  await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 2));
  ok(await o.p.evaluate(() => document.querySelectorAll('#recent-list li').length) === 2, `${store}: kept after a reload`);
  await o.p.click('#recent-list li:first-child .open');
  ok(!!(await lessonFrame(o.p)) && await o.p.textContent('#lesson-kind') === 'Egatari ファイル（編集可）', `${store}: opening from the list plays the newest (the editable one)`);
  await o.p.click('#b-close');
  ok(await o.p.getAttribute('#recent-list li:first-child .del', 'aria-label') !== null, `${store}: each delete button names its file`);
  await o.p.click('#recent-list li:first-child .del');
  ok(await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 1)), `${store}: one file deleted`);
  if (store === 'opfs') ok(await o.p.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('recent'); let n = 0; for await (const [k] of d.entries()) if (k.endsWith('.html')) n++; return n; }) === 1, 'opfs: the deleted file is gone from OPFS');
  o.p.once('dialog', (d) => d.accept());
  await o.p.click('#b-clear');
  ok(await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 0 && !document.getElementById('recent-empty').hidden)), `${store}: 「すべて削除」 empties the list`);
  await o.p.uncheck('#keep');
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p); await o.p.click('#b-close');
  await sleep(300);
  ok(await o.p.evaluate(() => document.querySelectorAll('#recent-list li').length) === 0, `${store}: with 「開いたファイルを最近の一覧に残す」 off, nothing is kept`);
  await o.p.check('#keep');
  await o.close();
}

// 「共有の端末」: no recent files kept, and the ones kept are deleted; the choice is remembered
console.log('shared device');
{ const o = await page();
  ok(!(await o.p.isChecked('#shared')) && await o.p.isChecked('#keep'), 'shared device: off by default; keeping recent files on');
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p); await o.p.click('#b-close');
  ok(await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 1)), 'shared device off: the file is kept');
  await o.p.check('#shared');
  ok(await until(() => o.p.evaluate(() => document.querySelectorAll('#recent-list li').length === 0)), 'shared device on: the kept files are deleted');
  ok(await o.p.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('recent'); let n = 0; for await (const [k] of d.entries()) if (k.endsWith('.html')) n++; return n; }) === 0, 'shared device on: nothing left in OPFS');
  ok(await o.p.isDisabled('#keep') && !(await o.p.isChecked('#keep')), 'shared device on: keeping is off and cannot be turned on');
  ok(/何人かで使う端末/.test(await o.p.textContent('#shared-note')) && await o.p.getAttribute('#shared', 'aria-describedby') === 'shared-note', 'shared device: a short explanation, tied to the switch');
  await openFixture(o.p, 'lesson.play.ega.html'); await lessonFrame(o.p); await o.p.click('#b-close');
  await sleep(300);
  ok(await o.p.evaluate(() => document.querySelectorAll('#recent-list li').length) === 0, 'shared device on: an opened file is not kept');
  await o.p.reload(); await o.p.waitForSelector('html[data-ready]');
  ok(await o.p.isChecked('#shared') && await o.p.evaluate(() => document.querySelectorAll('#recent-list li').length) === 0, 'shared device: remembered after a reload');
  await o.p.uncheck('#shared');
  ok(!(await o.p.isDisabled('#keep')) && await o.p.isChecked('#keep'), 'shared device off again: keeping comes back');
  await o.close(); }

// ---------------------------------------------------------------- 7. share_target
console.log('share target');
const shareForm = `<!doctype html><meta charset="utf-8"><form id="f" method="post" action="/share" enctype="multipart/form-data"><input type="file" name="lesson" id="i"><input type="text" name="title" value="x"></form>`;
site.extra.set('/__test/share.html', shareForm);
{ const o = await page();
  await o.p.evaluate(() => navigator.serviceWorker.ready);
  await o.p.goto(site.url + '__test/share.html');
  await o.p.setInputFiles('#i', FIX['lesson.play.ega.html']);
  await Promise.all([o.p.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 15000 }).catch(() => {}), o.p.evaluate(() => document.getElementById('f').submit())]);
  const f = await lessonFrame(o.p);
  ok(!!f && await o.p.textContent('#lesson-kind') === 'Egatari ファイル（再生のみ）', 'share_target: the service worker receives the shared file and the page plays it');
  ok(!site.reqs.includes('POST /share'), 'share_target: the file never reaches the server');
  const c = await o.p.evaluate(async () => { let n = 0; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (!/\/(|guard\.js|play\.(js|css)|reader\.js|manifest\.webmanifest|icons\/[^/]+)$/.test(new URL(r.url).pathname)) n++; return n; });
  ok(c === 0, 'share_target: the shared file is not cached');
  await o.close(); }
{ const o = await page(null, { sw: false });
  await o.p.goto(site.url + '__test/share.html');
  await o.p.setInputFiles('#i', FIX['lesson.play.ega.html']);
  await Promise.all([o.p.waitForURL((u) => u.pathname === '/', { timeout: 10000 }).catch(() => {}), o.p.evaluate(() => document.getElementById('f').submit())]);
  await o.p.waitForSelector('html[data-ready]');
  ok(await until(() => o.p.evaluate(() => /受け取れませんでした/.test(document.getElementById('msg').textContent))), 'share_target without a service worker: the server answers 303 and the page asks to open the app and share again');
  await o.close(); }

// ---------------------------------------------------------------- 8. links
console.log('links');
{ const o = await page();
  await openFixture(o.p, 'lesson.play.ega.html');
  const f = await lessonFrame(o.p);
  // a link in the lesson, clicked by the viewer (a trusted click in the frame)
  const click = async (href, text) => {
    await f.evaluate(([h, t]) => { const a = document.createElement('a'); a.id = 'tl'; a.href = h; a.textContent = t; a.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;font-size:24px;background:#fff'; document.body.appendChild(a); }, [href, text]);
    await f.click('#tl');
    await f.evaluate(() => { const a = document.getElementById('tl'); if (a) a.remove(); });
  };
  const sent = [];
  await o.p.exposeFunction('__sawMessage', (m) => sent.push(m));
  await o.p.evaluate(() => window.addEventListener('message', (e) => { if (e.data && e.data.egatari === 'openLink') window.__sawMessage(e.data); }));
  const shut = async (how = 'cancel') => { if (how === 'esc') await o.p.keyboard.press('Escape'); else await o.p.click('#b-link-cancel'); await sleep(1600); };
  const box = () => o.p.evaluate(() => { const d = document.getElementById('link-box'); const vis = (id) => !document.getElementById(id).hidden; return { open: d.open, title: document.getElementById('link-t').textContent, host: vis('link-host') ? document.getElementById('link-host').textContent : '', url: vis('link-url') ? document.getElementById('link-url').textContent : '', notes: [...document.querySelectorAll('#link-n li')].map((l) => l.textContent), openHidden: document.getElementById('a-link-open').hidden, openText: document.getElementById('a-link-open').textContent, href: document.getElementById('a-link-open').getAttribute('href'), rel: document.getElementById('a-link-open').rel, focus: document.activeElement && document.activeElement.id }; });
  await click('https://example.org/page', '参考');
  let b = null; await until(async () => (b = await box()).open);
  ok(sent.length === 1 && JSON.stringify(Object.keys(sent[0]).sort()) === '["egatari","href","text"]' && sent[0].href === 'https://example.org/page' && sent[0].text === '参考',
    `the viewer's click sends the spec's {egatari: "openLink", href, text} (${JSON.stringify(sent[0])})`);
  ok(b.open && b.host === 'example.org' && b.url === 'https://example.org/page' && b.href === 'https://example.org/page' && !b.openHidden, 'a link out of the lesson: the page shows the destination host and address in its own box');
  ok(b.rel.includes('noopener') && b.rel.includes('noreferrer') && b.focus === 'b-link-cancel', 'the box: opens with noopener noreferrer; the focus starts on Cancel');
  ok(await f.evaluate(() => document.getElementById('deck-extlink') === null), 'the player\'s own box does not appear (the page handles it)');
  const [popup] = await Promise.all([o.ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), o.p.click('#a-link-open')]);
  ok(!!popup, 'Open: a new tab, only after the tap in the page\'s box');
  if (popup) await popup.close();
  await until(async () => !(await box()).open);
  await sleep(1600);
  // §11 (f): the same https host again: a plain 「開く」 with the host name, no warning; still a tap in the page
  const pages0 = o.ctx.pages().length;
  await click('https://example.org/other', 'また');
  await until(async () => (b = await box()).open);
  ok(b.open && b.title === 'example.org' && b.openText === '開く' && b.notes.length === 0 && !b.url && !b.host, `the same host again: a plain 「開く」 with the host name, no warning (${b.title} / ${b.openText})`);
  ok(o.ctx.pages().length === pages0, 'the same host again: nothing opens before the tap');
  await shut();
  await click('https://evil.example/', 'https://bank.example/login');
  await until(async () => (b = await box()).open);
  ok(b.open && b.notes.some((n) => /別のサイト/.test(n)) && /確かめて/.test(b.title), 'text naming another host: confirmed, with the reason');
  await o.p.keyboard.press('Escape');
  await until(async () => !(await box()).open);
  ok(!(await box()).open, 'Escape closes the box');
  const quiet = await o.p.evaluate(() => window.__play.links.quietMs());
  await click('https://example.com/', 'again');
  await sleep(300);
  const again = await box();
  ok(!again.open, `right after a box closes, a new request is ignored for a moment (a lesson cannot keep the box up) (pause left ${quiet} ms${again.open ? ', box: ' + again.title : ''})`);
  if (again.open) await shut(); else await sleep(1600);
  await click('javascript:alert(1)', 'x');
  await until(async () => (b = await box()).open);
  ok(b.open && b.openHidden && b.title === 'このリンクは開けません', 'javascript: is refused (no Open button)');
  await shut();
  await click('next.ega.html', 'next');
  await until(async () => (b = await box()).open);
  ok(b.open && b.openHidden && b.notes.some((n) => /隣にあるファイル/.test(n)), 'a relative link (a file next to the lesson) is refused with a reason');
  await shut();
  const n0 = sent.length;
  await f.evaluate(() => { const a = document.createElement('a'); a.href = 'https://example.net/'; a.textContent = 'x'; document.body.appendChild(a); a.click(); a.remove(); });
  await sleep(400);
  ok(sent.length === n0 && !(await box()).open, 'a click made by lesson script (not the viewer) sends nothing');
  await click('#' + (await f.evaluate(() => DECK.slides[1].id || '2')), 'in-lesson');
  await sleep(300);
  ok(sent.length === n0 && !(await box()).open, 'a link inside the lesson stays with the player (no message, no box)');
  await click('https://example.org/' + 'x', 'y'.repeat(400));
  await until(async () => sent.length > n0);
  ok(sent[sent.length - 1].text.length === 200, 'the text is cut to 200 characters');
  await until(async () => (await box()).open); await shut();
  // a link with a download attribute: {download: true}; the page refuses it, showing the host
  await f.evaluate(() => { const a = document.createElement('a'); a.id = 'tl'; a.href = 'https://files.example/handout.pdf'; a.textContent = '配布資料'; a.setAttribute('download', ''); a.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;font-size:24px;background:#fff'; document.body.appendChild(a); });
  const n1 = sent.length;
  await f.click('#tl'); await f.evaluate(() => document.getElementById('tl').remove());
  await until(async () => (b = await box()).open);
  ok(sent.length === n1 + 1 && sent[n1].download === true && Object.keys(sent[n1]).length === 4, `a download link sends download: true (${JSON.stringify(sent[n1])})`);
  ok(b.open && b.title === 'この教材からはファイルを保存できません' && b.host === 'files.example' && b.openHidden && !b.href, `a download is refused: the host and 「この教材からはファイルを保存できません」, nothing to open (${b.title} / ${b.host})`);
  const pages1 = o.ctx.pages().length;
  await shut();
  ok(o.ctx.pages().length === pages1, 'a download: nothing opened');
  for (const v of [false, 'true', 1]) {
    await f.evaluate((d) => window.parent.postMessage({ egatari: 'openLink', href: 'https://x.example/', text: '', download: d }, '*'), v);
    await sleep(300);
    ok(!(await box()).open, `download must be exactly true: ${JSON.stringify(v)} is ignored`);
  }
  // forged requests: from the page's own window are ignored; from the frame they are untrusted and still go through the rule
  await o.p.evaluate(() => window.postMessage({ egatari: 'openLink', href: 'https://example.net/', text: '' }, '*'));
  await sleep(300);
  ok(!(await box()).open, 'a request that does not come from the lesson\'s frame is ignored');
  await f.evaluate(() => window.parent.postMessage({ egatari: 'openLink', href: 'data:text/html,<b>x</b>', text: '' }, '*'));
  await until(async () => (b = await box()).open);
  ok(b.open && b.openHidden, 'a request posted by lesson code is still judged by the rule (data: refused, no Open)');
  await shut();
  for (const [m, what] of [[{ egatari: 'openLink', href: 'https://x.example/', text: 'z'.repeat(201) }, 'text over 200 characters'], [{ egatari: 'openLink', href: 'https://x.example/', text: '', extra: 1 }, 'an extra member'], [{ egatari: 'openLink', href: 7, text: '' }, 'a non-string href']]) {
    await f.evaluate((mm) => window.parent.postMessage(mm, '*'), m);
    await sleep(300);
    ok(!(await box()).open, `a malformed request (${what}) is ignored`);
  }
  await o.close(); }

// ---------------------------------------------------------------- 9. zero network for a lesson without live
console.log('no network');
{ const o = await page();
  await o.p.evaluate(() => navigator.serviceWorker.ready);
  await o.p.reload(); await o.p.waitForSelector('html[data-ready]');
  await sleep(500);
  const reqs = [], ws = [];
  o.ctx.on('request', (r) => { if (!/^(data|blob|about):/.test(r.url())) reqs.push(r.url()); });
  o.p.on('websocket', (w) => ws.push(w.url()));
  const before = fake.connections.length;
  await openFixture(o.p, 'lesson.play.ega.html');
  const f = await lessonFrame(o.p);
  await f.evaluate(() => { DECK.go(1, 0); DECK.go(2, 0); });
  await sleep(1500);
  await o.p.click('#b-close');
  ok(reqs.length === 0 && ws.length === 0 && fake.connections.length === before, `a lesson without live: no request and no WebSocket from opening to closing (${reqs.join(', ')})`);
  ok(await o.p.$eval('#b-live', (b) => b.hidden), 'a lesson without live: no Live button');
  await o.close(); }

// ---------------------------------------------------------------- 10. live: the start screen first, then the frame
console.log('live');
const hasFrame = (p) => p.evaluate(() => !!document.getElementById('lesson'));
{ const o = await page();
  const ws = [], frameReqs = [];
  o.p.on('websocket', (w) => ws.push(w.url()));
  o.ctx.on('request', (r) => { try { if (r.frame() && r.frame().parentFrame()) frameReqs.push(r.url()); } catch { /* detached */ } });
  fake.reset();
  await openFixture(o.p, 'live.play.ega.html');
  await o.p.waitForSelector('#live-start', { state: 'visible' });
  ok(!(await hasFrame(o.p)), 'live: a start screen first; the lesson\'s frame is not placed yet');
  ok(/127\.0\.0\.1/.test(await o.p.textContent('#live-dest')) && await o.p.isEnabled('#b-start-join') && await o.p.isVisible('#b-watch') && (await o.p.textContent('#live-start-window')).length > 0,
    'live: the start screen shows Join, the window and the destination host, and 「参加しないで見る」');
  ok(await o.p.evaluate(() => document.activeElement && document.activeElement.id === 'b-start-join'), 'live: the focus starts on Join');
  await sleep(300);
  ok(fake.connections.length === 0 && ws.length === 0, 'live: nothing connects before Join');
  await o.p.click('#b-start-join');
  const f = await lessonFrame(o.p);
  ok(await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected')), 'live: Join connects (one tap), then the lesson plays');
  ok(await f.evaluate(() => getComputedStyle(document.getElementById('live-mark')).display) === 'none' && await f.evaluate(() => DECK.live.state().context) === 'framed',
    'live: the lesson\'s own Live mark is hidden and its player, framed, does not connect');
  const c0 = fake.connections[0] || {};
  ok(fake.connections.length === 1 && c0.query.room === 'r-7k2q6xw4' && c0.query.key === 'Q2xhc3Nyb29tS2V5MDAwMD' && /^[A-Za-z0-9_-]{16,43}$/.test(c0.query.pid), 'live: one WebSocket to the declared endpoint with room, key and a random pid');
  ok(c0.origin === site.url.replace(/\/$/, ''), `live: the page holds the connection (Origin ${c0.origin}), not the lesson (Origin null)`);
  ok(frameReqs.length === 0, 'live: the lesson\'s frame made no request');
  ok((await state(o.p)).layout.mode === 'side', 'live with polls at 1280 x 800: the side pane');
  await o.p.fill('#live-q', 'もう一度説明してください');
  await o.p.click('#b-send');
  ok(await until(() => fake.messages.some((m) => m.t === 'ask' && m.text === 'もう一度説明してください' && m.activity === 'qa')), 'live: a question is sent (ask)');
  ok(await until(() => o.p.evaluate(() => /質問を送りました/.test(document.getElementById('live-msg').textContent))), 'live: the ack is shown');
  const ask = fake.messages.find((m) => m.t === 'ask');
  ok(ask && Object.keys(ask).sort().join() === 'activity,ref,step,t,text,v', `live: only what the activity needs (${ask && Object.keys(ask).join(',')})`);
  await f.evaluate(() => DECK.go(1, 0));
  ok(await until(() => o.p.evaluate(() => window.__play.state().live.step === '何を最小化するか:0')), 'live: the page learns the step from the lesson\'s position events');
  ok(await until(() => o.p.isVisible('#live fieldset[data-poll="p1"]')), 'live: a step with a poll shows the poll in the pane');
  await o.p.check('#live fieldset[data-poll="p1"] input[value="1"]');
  await o.p.click('#live fieldset[data-poll="p1"] button.vote');
  ok(await until(() => fake.messages.some((m) => m.t === 'vote' && m.activity === 'p1' && m.choice === 1 && m.step === POLL_STEP)), 'live: a vote is sent for that step');
  ok(!fake.messages.some((m) => /pos|position|time|play/i.test(m.t)), 'live: no viewing position or timing is sent');
  await f.evaluate(() => DECK.go(2, 0));
  ok(await until(() => o.p.evaluate(() => !document.querySelector('#live fieldset[data-poll="p1"]'))), 'live: leaving the step removes its poll');
  await o.p.evaluate(() => window.postMessage({ egatari: 'position', slideKey: '何を最小化するか', stepKey: '0' }, '*'));
  await sleep(200);
  ok((await state(o.p)).live.step !== POLL_STEP, 'live: a position message that does not come from the frame is ignored');
  ok(await o.p.textContent('#b-leave') === '抜ける', 'live: the leave button reads 「抜ける」');
  await o.p.click('#b-leave');
  ok(await until(() => fake.open === 0), 'live: 「抜ける」 closes the connection');
  ok(await until(() => o.p.isVisible('#b-join')), 'live: after leaving, Join is offered again in the same place');
  await o.p.click('#b-close');
  ok(await until(() => fake.open === 0) && fake.connections.length === 1, 'live: closing the lesson leaves no connection');
  await o.close(); }
// 「参加しないで見る」: the lesson plays and nothing reaches the network
{ const o = await page();
  await o.p.evaluate(() => navigator.serviceWorker.ready); await o.p.reload(); await o.p.waitForSelector('html[data-ready]'); await sleep(300);
  const reqs = [], ws = [];
  o.ctx.on('request', (r) => { if (!/^(data|blob|about):/.test(r.url())) reqs.push(r.url()); });
  o.p.on('websocket', (w) => ws.push(w.url()));
  fake.reset();
  await openFixture(o.p, 'live.play.ega.html');
  await o.p.click('#b-watch');
  const f = await lessonFrame(o.p);
  await f.evaluate(() => { DECK.go(1, 0); DECK.go(2, 0); });
  await sleep(1200);
  ok(reqs.length === 0 && ws.length === 0 && fake.connections.length === 0 && fake.http.length === 0, `「参加しないで見る」: the lesson plays with no request and no WebSocket (${reqs.join(', ')})`);
  ok(await o.p.isVisible('#b-join') && (await state(o.p)).live.state === 'off', '「参加しないで見る」: Join stays available in the Live controls');
  await o.close(); }
{ const o = await page();
  fake.reset();
  await openFixture(o.p, 'early.play.ega.html');
  await o.p.waitForSelector('#live-start', { state: 'visible' });
  ok(await o.p.isDisabled('#b-start-join') && /始まります/.test(await o.p.textContent('#live-start-state')) && await o.p.evaluate(() => document.activeElement && document.activeElement.id === 'b-watch'),
    'live before the window: says when it starts; Join disabled; the focus on 「参加しないで見る」');
  await o.p.click('#b-watch'); await lessonFrame(o.p);
  ok(fake.connections.length === 0, 'live before the window: no connection');
  await o.p.click('#b-close');
  await openFixture(o.p, 'other.play.ega.html');
  await o.p.waitForSelector('#live-start', { state: 'visible' });
  const href = await o.p.getAttribute('#a-start-join', 'href');
  ok(await o.p.isHidden('#b-start-join') && await o.p.isVisible('#a-start-join') && href === 'http://localhost:9/join#room=r-7k2q6xw4&key=Q2xhc3Nyb29tS2V5MDAwMD' && await o.p.getAttribute('#a-start-join', 'rel') === 'noopener noreferrer',
    'live at an endpoint this page does not allow: only the join page link (the key after #, noopener noreferrer), no Join');
  ok(/localhost:9/.test(await o.p.textContent('#live-dest')), 'live: the join link shows its host');
  await o.p.click('#b-watch'); await lessonFrame(o.p);
  ok(fake.connections.length === 0, 'live: still no connection');
  await o.p.click('#b-close');
  await openFixture(o.p, 'teacher.ega.html'); await lessonFrame(o.p);
  ok(await o.p.$eval('#b-live', (b) => b.hidden) && await o.p.isHidden('#live-start'), 'the teacher\'s editable file (Live settings without a key): no Live, no start screen');
  await o.close(); }

// ---------------------------------------------------------------- 10b. the layout, chosen once from the activities and the screen
// the frame's geometry never changes while the lesson plays (only on rotation), and the controls never lie over it
// (except the overlay for 16:9 phones in landscape, the default there: its indicator is always shown over the top edge)
console.log('layout');
const geo = (p) => p.evaluate(() => { const g = (id) => { const e = document.getElementById(id); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }; return { frame: g('lesson'), live: g('live'), bar: g('bar'), mode: window.__play.state().layout && window.__play.state().layout.mode }; });
const overlap = (a, b) => !!(a && b) && !(b.x >= a.x + a.w || b.y >= a.y + a.h || b.x + b.w <= a.x || b.y + b.h <= a.y);
const SIZES = [[375, 667], [667, 375], [844, 390], [1280, 800]];
const WANT = { polls: { '375x667': 'bottom', '667x375': 'overlay', '844x390': 'slack', '1280x800': 'side' }, nopolls: { '375x667': 'bar', '667x375': 'overlay', '844x390': 'slack', '1280x800': 'bar' } };
for (const [kind, fix] of [['polls', 'live.play.ega.html'], ['nopolls', 'qa.play.ega.html'], ['none', 'lesson.play.ega.html']]) {
  for (const [w, h] of SIZES) {
    const o = await page(site.url, { viewport: { width: w, height: h } });
    await openFixture(o.p, fix);
    if (kind !== 'none') { await o.p.waitForSelector('#live-start', { state: 'visible' }); await o.p.click(kind === 'polls' ? '#b-start-join' : '#b-watch'); }
    const f = await lessonFrame(o.p);
    if (kind === 'polls') await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected'));
    const g0 = await geo(o.p);
    const tag = `${kind} ${w}x${h}`;
    if (kind === 'none') { ok(g0.mode === 'none' && !g0.live && g0.frame.w === w, `${tag}: no Live, the frame fills the width (${JSON.stringify(g0.frame)})`); await o.close(); continue; }
    ok(g0.mode === WANT[kind][`${w}x${h}`], `${tag}: the layout is ${WANT[kind][`${w}x${h}`]} (${g0.mode})`);
    if (g0.mode === 'overlay') ok(g0.frame.w === w && g0.frame.h === h && g0.live.h === 28 && g0.live.y === 0, `${tag}: overlay: the frame keeps the full screen; the indicator (28 px) lies over its top edge from the start`);
    else ok(!overlap(g0.frame, g0.live), `${tag}: the Live controls do not lie over the frame (frame ${JSON.stringify(g0.frame)}, live ${JSON.stringify(g0.live)})`);
    if (w > h && h <= 500) ok(!g0.bar && (g0.mode !== 'slack' || g0.frame.h === h), `${tag}: phone landscape: no page bar; with slack the stage fills the height`);
    await f.evaluate(() => DECK.go(1, 0)); await sleep(300);
    if (await o.p.isVisible('#b-poll')) await o.p.click('#b-poll');
    await sleep(200);
    const g1 = await geo(o.p);
    ok(JSON.stringify(g1.frame) === JSON.stringify(g0.frame) && (g0.mode === 'overlay' || !overlap(g1.frame, g1.live)), `${tag}: a poll step (and opening the poll) leaves the frame as it is${g0.mode === 'overlay' ? '' : ' and uncovered'}`);
    ok(await o.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal scroll`);
    if (kind === 'polls') {
      // touch targets: each choice's whole row, and every visible control in the Live area: 44 px tall where it fits, 24 x 24 in the 28 px strip
      const t = await o.p.evaluate(() => [...document.querySelectorAll('#live fieldset label, #live button')].filter((e) => e.offsetParent !== null && !e.closest('[hidden]'))
        .map((e) => { const r = e.getBoundingClientRect(); return { n: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 10), w: Math.round(r.width), h: Math.round(r.height) }; }));
      const minH = g0.mode === 'strip' ? 24 : 44;
      const small = t.filter((x) => x.h < minH || x.w < 24);
      ok(t.some((x) => /収束/.test(x.n)) && small.length === 0, `${tag}: touch targets (poll rows and controls) at least ${minH} px tall and 24 px wide (${small.map((x) => `${x.n} ${x.w}x${x.h}`).join(', ') || t.length + ' checked'})`);
    }
    if (kind === 'polls') await o.p.screenshot({ path: path.join(work, `layout-${w}x${h}.png`) });
    await o.close();
  }
}
// the strip, the alternative for 16:9 phones in landscape (NO_SLACK_VARIANT; ?noslack=strip): the stage shrinks by 28 px and nothing lies over the frame
{ const o = await page(site.url + '?noslack=strip', { viewport: { width: 667, height: 375 } });
  await openFixture(o.p, 'live.play.ega.html'); await o.p.click('#b-start-join'); const f = await lessonFrame(o.p);
  await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected'));
  const g = await geo(o.p);
  ok(g.mode === 'strip' && g.frame.y === 28 && g.frame.h === 347 && g.live.h === 28 && !overlap(g.frame, g.live), `strip variant 667x375: a 28 px strip above the frame, nothing over it (${JSON.stringify(g)})`);
  await f.evaluate(() => DECK.go(1, 0)); await o.p.click('#b-poll');
  await o.p.waitForSelector('#live fieldset[data-poll="p1"]', { state: 'visible' });
  const t = await o.p.evaluate(() => [...document.querySelectorAll('#live fieldset label, #live button')].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  const g2 = await geo(o.p);
  ok(JSON.stringify(g2.frame) === JSON.stringify(g.frame) && !overlap(g2.frame, g2.live) && t.length >= 4 && t.every(([w, h]) => w >= 24 && h >= 24), `strip variant: the poll replaces the strip (frame unchanged, uncovered), rows and buttons at least 24 x 24 (${t.map((x) => x.join('x')).join(', ')})`);
  await o.close(); }
// the overlay (the default for 16:9 phones in landscape): indicator controls and the poll sheet's targets
{ const o = await page(site.url, { viewport: { width: 667, height: 375 } });
  await openFixture(o.p, 'live.play.ega.html'); await o.p.click('#b-start-join'); const f = await lessonFrame(o.p);
  await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected'));
  const ind = await o.p.evaluate(() => [...document.querySelectorAll('#live button')].filter((e) => e.offsetParent !== null).map((e) => Math.round(e.getBoundingClientRect().height)));
  await f.evaluate(() => DECK.go(1, 0)); await o.p.click('#b-poll');
  await o.p.waitForSelector('#live fieldset[data-poll="p1"]', { state: 'visible' });
  const t = await o.p.evaluate(() => [...document.querySelectorAll('#live fieldset label, #live button')].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(ind.every((h) => h >= 24) && t.length >= 4 && t.every(([w, h]) => w >= 24 && h >= 44), `overlay (default): indicator controls at least 24 px (${ind.join(',')}), the poll sheet's rows and buttons at least 44 px tall (${t.map((x) => x.join('x')).join(', ')})`);
  await o.close(); }
// rotation: laid out once more, and the controls follow; focus order in the pane
{ const o = await page(site.url, { viewport: { width: 375, height: 667 } });
  await openFixture(o.p, 'live.play.ega.html'); await o.p.click('#b-start-join'); await lessonFrame(o.p);
  ok(await until(() => o.p.evaluate(() => window.__play.state().live.state === 'connected')), 'rotation: joined in portrait');
  const p0 = await geo(o.p);
  await o.p.setViewportSize({ width: 844, height: 390 });
  await until(async () => (await geo(o.p)).mode === 'slack');
  const p1 = await geo(o.p);
  ok(p0.mode === 'bottom' && p1.mode === 'slack' && p1.frame.h === 390 && !overlap(p1.frame, p1.live), `rotation to landscape: laid out again once (bottom → slack, ${JSON.stringify(p1.frame)})`);
  await o.p.click('#b-leave');
  ok(await until(() => fake.open === 0), 'rotation: 「抜ける」 works right after');
  await o.p.setViewportSize({ width: 375, height: 667 });
  await until(async () => (await geo(o.p)).mode === 'bottom');
  ok(JSON.stringify((await geo(o.p)).frame) === JSON.stringify(p0.frame), 'rotation back: the portrait layout again');
  await o.p.focus('#b-live'); await o.p.keyboard.press('Enter');
  ok(await o.p.evaluate(() => document.activeElement && document.activeElement.closest('#live') !== null), 'the Live button moves the focus into the pane');
  await o.p.keyboard.press('Escape');
  ok(await o.p.evaluate(() => document.activeElement && document.activeElement.id === 'b-live'), 'Escape returns the focus to the Live button');
  await o.close(); }

// ---------------------------------------------------------------- 11. phone width and names
console.log('phone width');
{ const o = await page(site.url, { viewport: { width: 375, height: 740 } });
  const noScroll = () => o.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(await noScroll(), 'phone width: the start page has no horizontal scroll');
  const unnamed = await o.p.evaluate(() => [...document.querySelectorAll('button, a[href], input, textarea')].filter((e) => !e.closest('[hidden]') && e.offsetParent !== null)
    .filter((e) => !((e.getAttribute('aria-label') || e.textContent || '').trim() || (e.labels && e.labels.length) || e.id === 'file')).map((e) => e.outerHTML.slice(0, 80)));
  ok(unnamed.length === 0, `every visible control has a name (${unnamed.join(' | ')})`);
  ok(await o.p.evaluate(() => !!document.querySelector('label[for="file"]')) && await o.p.$eval('#file', (i) => i.accept.includes('.html')), 'the file picker has a label and accepts .html');
  await o.p.screenshot({ path: path.join(work, 'phone-start.png') });
  await o.close(); }

await browser.close();
await site.close(); await bare.close(); await framer.close(); await fake.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
