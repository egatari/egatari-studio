// Egatari Viewer：WCAG 2.2 AA の自動の検査（axe-core。backlog #135 (2)）
// test-all: platform（--platform でも走らせる：WebKit でも）
//   node tools/test-viewer-a11y.mjs [作業フォルダ] [--webkit] [--json <ファイル>] [--report]
// Viewer のページ（play/）を次の状態で開き、axe-core（wcag2a・wcag2aa・wcag21a・wcag21aa・wcag22aa の規則）を当てる：
//   start（教材なし、ja・en・暗い背景）、about の節まで、教材を開いた（スライド）、本の表示、マークアップの帯、
//   マークアップの一覧（ハイライト 1 つ）、確かめの窓（この色を全部消す）、リンクの確かめ、ライブのある教材（参加の前）、
//   編集の記録（metadata.edits）のある教材の「作成と編集」の行と一覧（明るい・暗い背景。handoff #32）、
//   手書き（スライドとメモ欄、道具のバー。明るい・暗い背景。handoff #27）
// 検査はページ（Viewer の画面）だけ。教材の枠（#lesson、sandbox）の中はプレーヤー（kit/）なので別に数え、--report で一覧に出すだけ
// （落とさない。直しは dev の担当）。
// 落とす条件：Viewer のページに、KNOWN にない違反（規則 id × 状態）がある。KNOWN は直すまでの一覧で、直ったら消す
// （KNOWN にあるのに出なくなった規則も知らせ、消すよう求める）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay } from './build-play.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_VERSION = require('axe-core/package.json').version;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// 直すまでの一覧（規則 id → それが出てよい状態。'*' はどの状態でも）。直したら消す
const KNOWN = {};

const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit'), REPORT = args.includes('--report');
const ji = args.indexOf('--json'), JSON_OUT = ji >= 0 ? path.resolve(args[ji + 1]) : '';
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--json') || fs.mkdtempSync(path.join(os.tmpdir(), 'test-viewer-a11y-')));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { ms = scaled(ms); const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- fixtures: a book (play-only), and the same with a Live (not joined)
const bookDir = path.join(work, 'book');
fs.cpSync(path.join(ROOT, 'tools/fixtures/article-book'), bookDir, { recursive: true });
const deck = path.join(bookDir, 'deck.html');
await buildPortable(deck, {});   // docId
const FIX = {};
const put = (n, html) => { FIX[n] = path.join(work, n); fs.writeFileSync(FIX[n], html); };
put('book.play.ega.html', (await buildPortable(deck, { playOnly: true })).html);
const cfgPath = path.join(bookDir, FORMAT.CONFIG_FILE);
const cfg0 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const ENDPOINT = 'https://live.egatari.org';
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: ENDPOINT, activities: { '*': [{ id: 'qa', kind: 'qa' }] } } } }, null, 2) + '\n');
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const now = Date.now();
put('live.play.ega.html', (await buildPortable(deck, { playOnly: true, live: { v: 1, endpoint: ENDPOINT, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(now - 60e3), to: iso(now + 2 * 3600e3) } } })).html);
// the same book with edits by other people (spec §3.6.1): the credit line under the title and its list (play/main.js renderCredit)
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, metadata: { ...(cfg0.metadata || {}), creators: ['Test Author'], license: 'CC-BY-4.0', edits: [{ by: '○○高校 情報科', note: '2 章の例を差し替え' }, {}] } }, null, 2) + '\n');
put('edited.play.ega.html', (await buildPortable(deck, { playOnly: true })).html);
fs.writeFileSync(cfgPath, JSON.stringify(cfg0, null, 2) + '\n');

// ---------------------------------------------------------------- the Viewer, served with its own headers
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: [ENDPOINT], devLoopback: false, tag: '' });
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
if (WEBKIT) { try { browser = await webkit.launch(); } catch (e) { console.log('skip: WebKit is not installed: ' + String(e.message).split('\n')[0]); process.exit(0); } }
else browser = await launch();
console.log(`${WEBKIT ? 'WebKit' : 'Chromium'}, axe-core ${AXE_VERSION} (${TAGS.join(' ')})`);

const errors = [];
async function page({ locale = 'ja-JP', scheme = 'light' } = {}) {
  const c = await browser.newContext({ locale, viewport: { width: 1280, height: 800 }, colorScheme: scheme, serviceWorkers: 'block' });
  // nothing leaves the machine (the Live fixture names live.egatari.org; the Viewer never connects before 参加する, and this makes sure)
  await c.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  return { c, p };
}
const lessonFrame = async (p) => { let f = null; await until(async () => { f = await (await p.$('#lesson')).contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000); return f; };
async function open(p, name) { await p.setInputFiles('#file', FIX[name]); return lessonFrame(p); }
async function toBook(p, f) {
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'book' }, '*'));
  await f.waitForSelector('#egatari-article');
  await until(() => p.isVisible('#b-markup'));
}
// select a sentence of the book and colour it yellow (as a reader does: select, then the window's yellow button)
async function highlight(f, text) {
  await f.evaluate(async (text) => {
    const a = document.getElementById('egatari-article');
    const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const i = n.data.indexOf(text); if (i >= 0) { n.parentElement.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 300)); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } }
    throw new Error('highlight: text not found: ' + text);
  }, text);
  const btn = () => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=markup]'); const w = h && h.shadowRoot.querySelector('.w'); return !!(w && !w.hidden); });
  if (!(await until(btn))) throw new Error('highlight: the markup window did not open');
  await f.evaluate(() => document.querySelector('[data-egatari-viewer=markup]').shadowRoot.querySelector('button[data-a="y"]').click());
}

// ---------------------------------------------------------------- axe
async function axe(target, { iframes = false } = {}) {
  await target.evaluate(AXE);
  return target.evaluate(async ([tags, iframes]) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, iframes, resultTypes: ['violations', 'incomplete'] });
    const slim = (v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').slice(0, 3).join(' / ').slice(0, 300) })) });
    return { violations: r.violations.map(slim), incomplete: r.incomplete.map(slim), passes: r.passes.length };
  }, [TAGS, iframes]);
}
const results = [];
async function check(state, p, f) {
  await sleep(scaled(300));   // transitions settle
  const v = await axe(p);
  const row = { state, page: v.violations, pageIncomplete: v.incomplete.map((x) => x.id), lesson: null };
  if (f) { try { const l = await axe(f); row.lesson = l.violations; row.lessonPasses = l.passes; } catch (e) { row.lesson = [{ id: 'axe-could-not-run', impact: null, help: String(e.message).split('\n')[0], nodes: [] }]; } }
  results.push(row);
  const bad = v.violations.filter((x) => !(KNOWN[x.id] && (KNOWN[x.id].includes('*') || KNOWN[x.id].includes(state))));
  ok(bad.length === 0, `${state}: the Viewer page has no WCAG 2.2 AA violation that axe finds${bad.length ? ' (' + bad.map((x) => `${x.id}×${x.nodes.length}`).join(', ') + ')' : ''}`);
  if (REPORT) {
    for (const x of v.violations) { console.log(`        page ${x.impact} ${x.id}: ${x.help}`); for (const n of x.nodes.slice(0, 4)) console.log(`          ${n.target}  — ${n.summary}`); }
    for (const x of row.lesson || []) { console.log(`        lesson ${x.impact} ${x.id}: ${x.help}`); for (const n of x.nodes.slice(0, 3)) console.log(`          ${n.target}  — ${n.summary}`); }
  }
}

// ---------------------------------------------------------------- the states
console.log('start');
for (const [state, opt] of [['start (ja)', {}], ['start (en)', { locale: 'en-US' }], ['start (dark)', { scheme: 'dark' }]]) {
  const { c, p } = await page(opt);
  await check(state, p, null);
  await c.close();
}
console.log('lesson');
{ const { c, p } = await page();
  const f = await open(p, 'book.play.ega.html');
  await check('lesson (slides)', p, f);
  await toBook(p, f);
  await check('lesson (book)', p, f);
  await highlight(f, '平均は外れ値に');
  await p.click('#b-markup');
  await until(() => p.isVisible('#markup-bar'));
  await check('markup bar', p, f);
  await p.click('#b-mlist');
  await until(() => p.isVisible('#m-list'));
  await check('markup list', p, f);
  // 「この色を全部消す」 (yellow has one highlight): the confirmation dialog, then cancel
  await p.locator('#m-list button', { hasText: 'この色を全部消す' }).first().click();
  ok(await until(() => p.isVisible('#m-confirm'), 3000), 'the confirmation for deleting a colour opens');
  await check('confirm (delete a colour)', p, f);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  // a link the lesson asks to open: the link box (play/links.mjs)
  await f.evaluate(() => parent.postMessage({ egatari: 'openLink', href: 'https://example.org/x', text: 'example' }, '*'));
  if (await until(() => p.isVisible('#link-box'), 3000)) await check('link box', p, f);
  await c.close(); }
{ const { c, p } = await page({ scheme: 'dark' });
  const f = await open(p, 'book.play.ega.html');
  await toBook(p, f);
  await check('lesson (book, dark)', p, f);
  await c.close(); }
console.log('credits');
for (const [suffix, opt] of [['', {}], [', dark', { scheme: 'dark' }]]) {
  const { c, p } = await page(opt);
  const f = await open(p, 'edited.play.ega.html');
  ok(await until(() => p.isVisible('#lesson-credit')), `credits${suffix}: the line under the title is shown`);
  if (!suffix) await check('credits (line)', p, f);
  await p.click('#lesson-credit');
  ok(await until(() => p.isVisible('#cred-box'), 3000), `credits${suffix}: the list opens`);
  await check(`credits (list${suffix})`, p, f);
  await c.close();
}
console.log('handwriting');
for (const [suffix, opt] of [['', {}], [', dark', { scheme: 'dark' }]]) {
  const { c, p } = await page(opt);
  const f = await open(p, 'book.play.ega.html');
  await p.click('#b-ink');
  ok(await until(() => p.isVisible('.ink-bar')), `handwriting${suffix}: the tools are shown`);
  await check(`handwriting${suffix}`, p, f);
  await c.close();
}
console.log('live');
{ const { c, p } = await page();
  await p.setInputFiles('#file', FIX['live.play.ega.html']);
  await until(() => p.isVisible('#live-start'));
  await check('live (before joining)', p, null);
  if (await p.isVisible('#b-watch')) { await p.click('#b-watch'); const f = await lessonFrame(p); await until(() => p.isVisible('#live')); await check('live (watching, pane)', p, f); }
  await c.close(); }

// KNOWN entries that no longer show up: ask to remove them
const seen = new Set(results.flatMap((r) => r.page.map((x) => x.id)));
for (const id of Object.keys(KNOWN)) ok(seen.has(id), `KNOWN ${id} still shows up (remove it from KNOWN once it is fixed)`);
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);

// summary: the page (Viewer) and the lesson (player) separately
const sum = (key) => { const m = new Map(); for (const r of results) for (const x of r[key] || []) { const e = m.get(x.id) || { id: x.id, impact: x.impact, help: x.help, states: [], nodes: 0 }; e.states.push(r.state); e.nodes += x.nodes.length; m.set(x.id, e); } return [...m.values()]; };
const pageSum = sum('page'), lessonSum = sum('lesson');
ok(results.filter((r) => r.lesson).every((r) => r.lessonPasses > 0), 'axe ran inside the lesson frame too (it passed some rules there)');
console.log(`summary: Viewer page ${pageSum.length} rule(s)${pageSum.length ? ': ' + pageSum.map((e) => `${e.id} (${e.impact}, ${e.nodes} node(s), ${e.states.length} state(s))`).join('; ') : ''}`);
console.log(`summary: lesson frame (player, kit/) ${lessonSum.length} rule(s)${lessonSum.length ? ': ' + lessonSum.map((e) => `${e.id} (${e.impact}, ${e.nodes} node(s))`).join('; ') : ''}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ axe: AXE_VERSION, browser: WEBKIT ? 'webkit' : 'chromium', tags: TAGS, results }, null, 2) + '\n');
await browser.close(); srv.close();
console.log(fails ? `${fails} failed` : 'all ok');
console.log('work: ' + work);
process.exit(fails ? 1 : 0);
