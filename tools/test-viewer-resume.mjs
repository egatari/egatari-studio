// Egatari Viewer：前に見ていた所から開き直す（player spec P5・P8、handoff #94。play/resume.mjs）
//   node tools/test-viewer-resume.mjs [作業フォルダ] [--webkit]
// test-all: platform（WebKit の分は CI の macOS で）
// 確かめること：
//  - 初めて開いたときは最初の段階で、知らせは出ない
//  - 段階を進めて閉じ、開き直すと、その段階から開き（ready に seek を返す）、「前に見ていた所（スライドの題）から開きました」と「最初から見る」
//  - 「最初から見る」で最初の段階へ戻り、最初の段階では覚えた位置を消す（次に開くと知らせなし）
//  - × で知らせだけ閉じる（位置はそのまま）。英語の文言
//  - 共有の端末をオンにすると覚えた位置を消し、共有の端末では覚えず、開き直しても最初から
//  - 見る人の設定（player spec P5・P8 prefs）：教材で字幕と並べ方（本）と字の大きさを変えると覚え（並べ方は教材ごと、ほかは端末で 1 つ）、
//    開き直すとプレーヤーに送って同じ見え方で開く。共有の端末では覚えず、オンにすると消す
//  - 覚えた位置が壊れていても（形の違う値）最初から開き、エラーにならない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay } from './build-play.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit'), SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-viewer-resume-')));
fs.mkdirSync(work, { recursive: true });
console.log('work: ' + work);
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { ms = scaled(ms); const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- two lessons: the minimal example, and the same on a dark slide
async function portable(name, extraCss) {
  const dir = path.join(work, 'src-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  if (extraCss) { const f = path.join(dir, 'deck.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</head>', `<style>${extraCss}</style>\n</head>`)); }
  const out = path.join(work, name + FORMAT.FILE_EXT);
  const b = await buildPortable(path.join(dir, 'deck.html'), { out, subset: false });
  if (!fs.existsSync(out)) fs.writeFileSync(out, b.html);
  return out;
}
const LESSON = await portable('lesson');

// ---------------------------------------------------------------- the Viewer
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: ['https://live.egatari.org'], devLoopback: false, tag: '' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const headers = {};
for (const line of fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n')) { const m = /^\s+([^:]+):\s*(.*)$/.exec(line); if (m && !/^Cache/i.test(m[1])) headers[m[1]] = m[2]; }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(OUT, ...p.split('/').filter(Boolean));
  if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

let browser;
if (WEBKIT) { try { browser = await webkit.launch(); } catch (e) { console.log('skip: WebKit is not installed: ' + String(e.message).split('\n')[0]); srv.close(); process.exit(0); } }
else browser = await launch();
console.log(WEBKIT ? 'WebKit' : 'Chromium');
const errors = [];
const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
await ctx.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
async function newPage() {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  return p;
}
async function open(p, file) {
  await p.evaluate(() => { const f = document.getElementById('lesson'); if (f) f.dataset.before = '1'; });
  await p.setInputFiles('#file', file);
  await until(async () => { const el = await p.$('#lesson:not([data-before])'); const f = el && await el.contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000);
}

const lessonFrame = async (p) => (await p.$('#lesson')).contentFrame();
const pos = async (p) => (await lessonFrame(p)).evaluate(() => DECK.state().key);
const firstKey = async (p) => (await lessonFrame(p)).evaluate(() => DECK.stepKey(0, 0));
const kept = (p) => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('egatari-viewer-resume') || '{}'); } catch { return 'bad'; } });
const notice = (p) => p.evaluate(() => { const e = document.getElementById('resume'); return e && !e.hidden ? document.getElementById('resume-text').textContent : ''; });
async function close(p) { await p.click('#b-close'); await until(() => p.evaluate(() => !document.getElementById('lesson'))); }
// steps forward with the keys, from inside the lesson (the keys go to the frame itself)
async function forward(p, n) {
  const box = await (await p.$('#lesson')).boundingBox();
  await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
  for (let i = 0; i < n; i++) { const before = await pos(p); await p.keyboard.press('ArrowRight'); await until(async () => (await pos(p)) !== before, 3000); }
}

const p = await newPage();
await open(p, LESSON);
const FIRST = await firstKey(p);
ok((await pos(p)) === FIRST && (await notice(p)) === '', `first opening: at the first step, no notice (${await pos(p)})`);
await forward(p, 3);
const AT = await pos(p);
ok(AT !== FIRST && await until(async () => Object.values(await kept(p)).some((e) => e.s + ':' + e.k === AT)), `moving on keeps the position on this device (${AT}; ${JSON.stringify(await kept(p))})`);
await close(p);
await open(p, LESSON);
ok(await until(async () => (await pos(p)) === AT), `reopening: the lesson opens where it was left (${await pos(p)}, expected ${AT})`);
const title = await (await lessonFrame(p)).evaluate(() => DECK.timeline().find((x) => DECK.stepKey(x.i, 0).split(':')[0] === DECK.state().key.split(':')[0]).title);
ok(await until(async () => (await notice(p)).includes('前に見ていた所') && (await notice(p)).includes(title)), `a notice says so, with the slide's title (${await notice(p)})`);
if (args.includes('--shots')) { await p.screenshot({ path: path.join(work, 'resume.png') }); await p.setViewportSize({ width: 375, height: 740 }); await sleep(300); await p.screenshot({ path: path.join(work, 'resume-375.png') }); await p.setViewportSize({ width: 1180, height: 820 }); }
ok(await p.evaluate(() => { const b = document.getElementById('b-resume-start'); return !!b && b.offsetParent !== null && b.textContent === '最初から見る'; }), 'the notice has 最初から見る');
await p.click('#b-resume-start');
ok(await until(async () => (await pos(p)) === FIRST) && (await notice(p)) === '', `最初から見る goes to the first step and closes the notice (${await pos(p)})`);
ok(await until(() => p.evaluate(() => document.getElementById('sr').textContent === '最初に戻りました')), 'a screen reader hears 最初に戻りました');
ok(await until(async () => Object.keys(await kept(p)).length === 0), `at the first step nothing is kept (${JSON.stringify(await kept(p))})`);
await close(p);
await open(p, LESSON);
await sleep(scaled(800));
ok((await pos(p)) === FIRST && (await notice(p)) === '', 'reopened after 最初から: from the start, no notice');

// × closes the notice only; English words
await forward(p, 2);
const AT2 = await pos(p);
await close(p);
await p.click('#b-lang');
await open(p, LESSON);
ok(await until(async () => (await pos(p)) === AT2) && await until(async () => (await notice(p)).startsWith('Opened where you left off')), `English: ${await notice(p)}`);
ok(await p.evaluate(() => document.getElementById('b-resume-start').textContent === 'Start over' && document.getElementById('b-resume-x').getAttribute('aria-label') === 'Close this notice'), 'English: Start over, and the close button\'s name');
await p.click('#b-resume-x');
ok((await notice(p)) === '' && (await pos(p)) === AT2, '× closes the notice and stays where it is');
await p.click('#b-lang');

// the viewer's preferences: changed in the player, kept by the page, sent back on reopening
const keptPrefs = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('egatari-viewer-prefs') || 'null'); } catch { return 'bad'; } });
const looks = async () => (await lessonFrame(p)).evaluate(() => ({ captions: DECK.captions(), size: DECK.captionSize(), layout: DECK.panes.state().layout, text: DECK.panes.state().reading.size }));
await close(p);
await open(p, LESSON);
await (await lessonFrame(p)).evaluate(() => { DECK.captions(true); DECK.captionSize('l'); DECK.panes.layout('flow'); });
await until(async () => { const k = await keptPrefs(); return k && k.device && k.device.captionSize === 'l' && Object.values(k.layouts || {}).some((e) => e.l === 'flow'); });
const kp = await keptPrefs();
ok(kp && kp.device.captions === true && kp.device.captionSize === 'l' && Object.values(kp.layouts).some((e) => e.l === 'flow'), `the viewer's choices in the player are kept: captions and their size for the device, the book for this lesson (${JSON.stringify(kp)})`);
await close(p);
await open(p, LESSON);
ok(await until(async () => { const l = await looks(); return l.captions === true && l.size === 'l' && l.layout === 'book'; }), `reopening: the player opens with them (${JSON.stringify(await looks())})`);
ok(errors.length === 0, `no page errors so far (${errors.join(' | ')})`);
await (await lessonFrame(p)).evaluate(() => { DECK.captions(false); DECK.captionSize('m'); DECK.panes.layout('slides'); });
await until(async () => { const k = await keptPrefs(); return k && k.device.captions === false && k.device.captionSize === 'm'; });

// a shared device: turning it on clears the kept positions and preferences; nothing is kept there
await close(p);
await p.check('#shared');
await until(() => p.evaluate(() => !document.querySelector('dialog[open]')), 1000);
const dlg = await p.$('dialog[open] button.pri, dialog[open] #b-mconfirm-yes');
if (dlg) await dlg.click();
ok(await until(async () => Object.keys(await kept(p)).length === 0), `shared device on: the kept positions are gone (${JSON.stringify(await kept(p))})`);
ok((await keptPrefs()) === null, `shared device on: the kept preferences are gone (${JSON.stringify(await keptPrefs())})`);
await open(p, LESSON);
await sleep(scaled(800));
ok((await pos(p)) === FIRST && (await notice(p)) === '', 'shared device: opens from the start');
await forward(p, 2);
await sleep(scaled(500));
ok(Object.keys(await kept(p)).length === 0, 'shared device: moving on keeps nothing');
await (await lessonFrame(p)).evaluate(() => DECK.captions(true));
await sleep(scaled(400));
ok((await keptPrefs()) === null, 'shared device: a preference changed in the player is not kept');
await close(p);
await p.uncheck('#shared');

// a broken kept value: opens from the start, no error
await p.evaluate(() => localStorage.setItem('egatari-viewer-resume', '{"x":{"s":5,"k":null},"y":[1,2]'));
await open(p, LESSON);
await sleep(scaled(800));
ok((await pos(p)) === FIRST && (await notice(p)) === '', 'a broken kept value: from the start, no notice');
await p.evaluate(() => localStorage.setItem('egatari-viewer-resume', JSON.stringify({ 'doc:nope': { s: 'zz', k: '0', at: 1 } })));
await close(p); await open(p, LESSON);
await sleep(scaled(800));
ok((await pos(p)) === FIRST && (await notice(p)) === '', 'a kept position of another lesson is not used');

ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await browser.close(); srv.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
