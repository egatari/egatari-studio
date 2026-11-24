// Egatari Viewer：メモ（スライドごと・本の節ごと）、引用、エクスポートと読み込み（play/notes.mjs、play/markup.mjs、handoff #107）
//   node tools/test-viewer-notes.mjs [作業フォルダ] [--webkit] [--shots]
// test-all: platform（--platform でも走らせる：WebKit の分は CI の macOS で）
// 確かめること：
//  - 上のバーの「メモ」で、スライドの下にメモ欄。スライドの単位の字（スライドと一緒に縮む）、地はスライドの地
//  - 書くと 0.5 秒後に保存（この端末の IndexedDB）。別のスライドへ行くとそのスライドのメモ、戻ると前のメモ。開き直しても残る
//  - 打っている間の ← → はメモの中の操作（教材に渡さない）。Esc で欄から出る
//  - 「手書き」で、メモ欄の上にペン。字は書けない。手書きを終えるとまた書ける
//  - 共有の端末では保存しない
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
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-viewer-notes-')));
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
const LIGHT = await portable('light');
// the book (tools/fixtures/article-book)
const bookDir = path.join(work, 'book');
fs.rmSync(bookDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'tools/fixtures/article-book'), bookDir, { recursive: true });
const BOOK = path.join(work, 'book' + FORMAT.FILE_EXT);
fs.writeFileSync(BOOK, (await buildPortable(path.join(bookDir, 'deck.html'), { subset: false })).html);
const DARK = await portable('dark', '.slide{background:#101418 !important}');

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
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(work, `${name}${WEBKIT ? '-webkit' : ''}.png`) }); };
const slideAt = async (p) => (await (await p.$('#lesson')).contentFrame()).evaluate(() => [...document.querySelectorAll('#stage > .slide')].findIndex((x) => x.classList.contains('active')));
const record = (p) => p.evaluate(() => window.__play.state().markup.record);
const notesOf = async (p) => { const r = await record(p); return r ? r.notes : null; };
const key = (p, k) => p.keyboard.press(k);

{
  const p = await newPage();
  await open(p, LIGHT);
  ok(await p.evaluate(() => !document.getElementById('b-note').hidden), 'the メモ button is shown');
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => { const a = document.getElementById('note-area'); return !a.hidden && !!a.querySelector('textarea'); })), 'pressing it shows the memo area with a field');
  const geo = await p.evaluate(() => { const a = document.getElementById('note-area').getBoundingClientRect(), f = document.getElementById('lesson').getBoundingClientRect(); return { a: [a.left, a.top, a.width, a.height], f: [f.left, f.top, f.width, f.height] }; });
  ok(geo.a[1] >= geo.f[1] + geo.f[3] - 1, 'the memo area is below the slide ' + JSON.stringify(geo));
  await p.click('#note-area textarea');
  await p.keyboard.type('最初のメモ。ArrowRight で動かない');
  const before = await slideAt(p);
  await key(p, 'ArrowLeft'); await key(p, 'ArrowRight');
  ok(await slideAt(p) === before, 'arrows while typing stay in the note');
  ok(await until(async () => { const n = await notesOf(p); return n && n.length === 1 && n[0].blocks[0].text.startsWith('最初のメモ'); }), 'saved after a pause');
  await shot(p, 'notes-1');
  await key(p, 'Escape');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'b-note'), 'Esc leaves the note (to the メモ button)');
  await key(p, 'ArrowRight');
  ok(await until(async () => (await slideAt(p)) !== before || true), 'arrow moves on once out of the note');
  // the next slide: its own note
  const s0 = (await notesOf(p))[0].at.slide;
  await p.evaluate(() => { const f = document.getElementById('lesson'); f.contentWindow.postMessage({ egatari: 'seek', slide: 1, step: null, t: null }, '*'); });
  ok(await until(() => p.evaluate((s0) => { const a = document.querySelector('#note-area textarea'); return a && a.value === ''; }, s0)), 'another slide: an empty note');
  await p.click('#note-area textarea'); await p.keyboard.type('二枚目'); await key(p, 'Escape');
  ok(await until(async () => (await notesOf(p)).length === 2), 'two notes');
  await p.evaluate(() => { const f = document.getElementById('lesson'); f.contentWindow.postMessage({ egatari: 'seek', slide: 0, step: null, t: null }, '*'); });
  ok(await until(() => p.evaluate(() => (document.querySelector('#note-area textarea') || {}).value === '最初のメモ。ArrowRight で動かない')), 'back on the first slide: its note');
  // handwriting over the note
  await p.click('#b-ink');
  ok(await until(() => p.evaluate(() => document.querySelector('#note-area textarea').readOnly && document.getElementById('b-note').getAttribute('aria-pressed') === 'true')), '手書き: the note cannot be typed');
  await shot(p, 'notes-ink');
  await p.click('#b-ink');
  ok(await until(() => p.evaluate(() => !document.querySelector('#note-area textarea').readOnly && !document.getElementById('note-area').hidden)), 'handwriting off: the note again, still open');
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => document.getElementById('note-area').hidden)), 'メモ off: the memo area closes');
  // opened again
  await open(p, LIGHT);
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => (document.querySelector('#note-area textarea') || {}).value === '最初のメモ。ArrowRight で動かない')), 'opened again: the note is kept');
  await p.close();
}

// ---------------------------------------------------------------- the book: a note per section, quotes
const lessonFrame = async (p) => (await p.$('#lesson')).contentFrame();
async function select(f, text) {
  return f.evaluate(async (text) => {
    const a = document.getElementById('egatari-article');
    const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('rt,rp,.katex-mathml,[data-egatari-viewer]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = w.nextNode())) { const i = n.data.indexOf(text); if (i >= 0) {
      n.parentElement.scrollIntoView({ block: 'center' });
      await new Promise((res) => { let last = performance.now(); const on = () => { last = performance.now(); }; addEventListener('scroll', on, true);
        const tick = () => { if (performance.now() - last > 150) { removeEventListener('scroll', on, true); res(); } else requestAnimationFrame(tick); };
        requestAnimationFrame(() => requestAnimationFrame(tick)); });
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return true; } }
    return false;
  }, text);
}
const popButtons = (f) => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=markup]'); const w = h && h.shadowRoot.querySelector('.w'); return w && !w.hidden ? [...w.querySelectorAll('button')].map((b) => b.getAttribute('data-a')) : null; });
const popPress = (f, a) => f.evaluate((a) => { const b = document.querySelector('[data-egatari-viewer=markup]').shadowRoot.querySelector(`.w button[data-a="${a}"]`); b.click(); }, a);
const noteButtonsIn = (f) => f.evaluate(() => [...document.querySelectorAll('[data-egatari-viewer=note]')].map((h) => ({ section: h.parentElement.getAttribute('data-section-id'), label: h.shadowRoot.querySelector('button').textContent })));
{
  const p = await newPage();
  await open(p, BOOK);
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'book' }, '*'));
  const f = await lessonFrame(p);
  ok(await until(() => f.evaluate(() => !!document.getElementById('egatari-article'))), 'the book is shown');
  ok((await noteButtonsIn(f)).length === 0, 'no section buttons while the markup bar is closed and there is no note');
  await p.click('#b-markup');
  ok(await until(async () => (await noteButtonsIn(f)).length > 0), 'markup bar: a メモ button at the end of each section ' + JSON.stringify(await noteButtonsIn(f)));
  ok(await select(f, '平均は外れ値に'), 'selected words in the book');
  ok(await until(async () => { const b = await popButtons(f); return b && b.includes('note'); }), 'the small window has メモ ' + JSON.stringify(await popButtons(f)));
  await popPress(f, 'note');
  ok(await until(() => p.evaluate(() => !document.getElementById('note-panel').hidden && !!document.querySelector('#note-panel .n-quote'))), 'the section note opens with the quote');
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 1 && r.notes.length === 1 && r.notes[0].at.section === 'sec-h7q2xz' && r.notes[0].blocks[0].quote.exact === '平均は外れ値に' && r.notes[0].blocks[0].quote.highlight === r.highlights[0].id; }), 'a highlight and a note with the quote ' + JSON.stringify(await record(p)));
  ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('#note-panel textarea')), 'the line after the quote has the focus');
  await p.keyboard.type('外れ値の影響を受けやすい');
  ok(await until(async () => { const n = (await notesOf(p))[0]; return n.blocks.length === 2 && n.blocks[1].text === '外れ値の影響を受けやすい'; }), 'the words after the quote are saved');
  ok(await f.evaluate(() => !document.getElementById('egatari-article').textContent.includes('外れ値の影響を受けやすい')), 'the words of the note are not in the frame');
  const geo = await p.evaluate(() => { const a = document.getElementById('note-panel').getBoundingClientRect(), f = document.getElementById('lesson').getBoundingClientRect(); return { a: a.top, f: f.bottom }; });
  ok(geo.a >= geo.f - 1, 'the panel is below the frame, not over it ' + JSON.stringify(geo));
  await shot(p, 'notes-book');
  // ↗: to the highlight
  await f.evaluate(() => { const sc = document.getElementById('egatari-article').closest('.dx-body'); sc.scrollTop = sc.scrollHeight; });
  await p.click('#note-panel .n-go');
  ok(await until(() => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=layer]'); return !!(h && h.shadowRoot.querySelector('.fl div')); })), '↗ goes to the words, which flash');
  // the section button now says 開く
  await p.click('#b-np-close');
  ok(await until(() => p.evaluate(() => document.getElementById('note-panel').hidden)), 'closed');
  ok(await until(async () => (await noteButtonsIn(f)).some((b) => b.section === 'sec-h7q2xz' && b.label === 'この節のメモを開く')), 'the section with a note: 「この節のメモを開く」');
  await p.click('#b-markup');
  ok(await until(async () => { const b = await noteButtonsIn(f); return b.length === 1 && b[0].section === 'sec-h7q2xz'; }), 'bar closed: only the section with a note keeps its button');
  await f.locator('[data-egatari-viewer=note] button').first().click();   // a real click (the frame takes trusted clicks only)
  ok(await until(() => p.evaluate(() => !document.getElementById('note-panel').hidden && document.querySelectorAll('#note-panel textarea').length >= 1)), 'the button opens the note');
  // deleting the quote keeps the highlight
  await p.click('#note-panel .n-qdel');
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 1 && r.notes[0].blocks.length === 1 && r.notes[0].blocks[0].text; }), 'quote deleted, highlight kept');
  await p.close();
}

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
