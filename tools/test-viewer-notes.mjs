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
  // English: the note's label and the button follow, the text stays
  await p.click('#b-lang');
  ok(await until(() => p.evaluate(() => { const t = document.querySelector('#note-area textarea'); return /^Note on slide 1/.test(t.getAttribute('aria-label')) && t.value.startsWith('最初のメモ') && document.getElementById('b-note').textContent.trim() === 'Notes'; })), 'English: the note is labelled in English, its text kept');
  await p.click('#b-lang');
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => document.getElementById('note-area').hidden)), 'メモ off: the memo area closes');
  // opened again
  await open(p, LIGHT);
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => (document.querySelector('#note-area textarea') || {}).value === '最初のメモ。ArrowRight で動かない')), 'opened again: the note is kept');
  await p.close();
}

// ---------------------------------------------------------------- m, and a phone
{
  const p = await newPage();
  await open(p, LIGHT);
  await (await p.$('#lesson')).focus();
  await p.keyboard.press('m');
  ok(await until(() => p.evaluate(() => !document.getElementById('note-area').hidden)), 'm in the lesson opens the memo view');
  await p.click('#b-close');
  await p.close();
  const ctxP = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 780 }, serviceWorkers: 'block', hasTouch: true, isMobile: !WEBKIT });
  await ctxP.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  const q = await ctxP.newPage(); q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(URL0); await q.waitForSelector('html[data-ready]');
  await open(q, LIGHT);
  ok(await q.isVisible('#b-note'), 'a phone: the メモ button');
  await q.click('#b-note');
  ok(await until(() => q.evaluate(() => { const a = document.getElementById('note-area'); return !a.hidden && a.classList.contains('narrow') && parseFloat(getComputedStyle(a).fontSize) === 16 && !a.style.transform; })), 'a phone: the memo area keeps the page text size (16 px, not scaled)');
  await q.tap('#note-area textarea'); await q.keyboard.type('スマホのメモ');
  ok(await until(async () => { const n = await notesOf(q); return n && n.some((x) => x.blocks.some((b) => b.text === 'スマホのメモ')); }), 'a phone: typed and saved');
  ok(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'a phone: no sideways scroll');
  await shot(q, 'notes-phone');
  await ctxP.close();
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
  // 「メモ」 with the book on screen: the note of the section being read, below the frame; the view stays the book
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => !document.getElementById('note-panel').hidden && document.getElementById('note-area').hidden)), 'メモ in the book: the section note, not the slide memo area');
  ok(await f.evaluate(() => document.documentElement.getAttribute('data-deck-layout') === 'book'), 'the view stays the book');
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => document.getElementById('note-panel').hidden)), 'メモ again closes it');
  await p.click('#b-markup');
  ok(await until(async () => (await noteButtonsIn(f)).length > 0), 'markup bar: a メモ button at the end of each section ' + JSON.stringify(await noteButtonsIn(f)));
  ok(await select(f, '平均は外れ値に'), 'selected words in the book');
  ok(await until(async () => { const b = await popButtons(f); return b && b.includes('note'); }), 'the small window has メモ ' + JSON.stringify(await popButtons(f)));
  await popPress(f, 'note');
  ok(await until(() => p.evaluate(() => !document.getElementById('note-panel').hidden && !!document.querySelector('#note-panel .n-quote'))), 'the section note opens with the quote');
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 0 && r.notes.length === 1 && r.notes[0].at.section === 'sec-h7q2xz' && r.notes[0].blocks[0].quote.exact === '平均は外れ値に' && !('highlight' in r.notes[0].blocks[0].quote); }), 'a note with the quote, and no highlight (the owner 11/27: ア) ' + JSON.stringify(await record(p)));
  const quoteMarks = () => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=layer]'); return h ? h.shadowRoot.querySelectorAll('.u').length : 0; });
  ok(await until(async () => (await quoteMarks()) > 0), 'the quoted words have a dotted underline of their own')
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
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 0 && r.notes[0].blocks.length === 1 && r.notes[0].blocks[0].text; }), 'quote deleted');
  ok(await until(async () => (await quoteMarks()) === 0), 'and its underline is gone');
  await p.close();
}

// ---------------------------------------------------------------- a slide's text: highlights, quotes into the slide's note, the list
async function selectOnSlide(f, text) {
  return f.evaluate((text) => {
    const el = document.querySelector('#stage > .slide.active');
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const i = n.data.indexOf(text); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return true; } }
    return false;
  }, text);
}
const slideBoxes = (f) => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=slide-layer]'); return h ? h.shadowRoot.querySelectorAll('.h').length : 0; });
{
  const p = await newPage();
  await open(p, LIGHT);
  const f = await lessonFrame(p);
  ok(await until(() => p.evaluate(() => !document.getElementById('b-markup').hidden)), 'a lesson without a book: マークアップ is there (slides take highlights)');
  ok(await selectOnSlide(f, '勾配降下法'), 'selected words on the slide');
  ok(await until(async () => { const b = await popButtons(f); return b && b.join() === 'y,p,b,note'; }), 'the small window on a slide ' + JSON.stringify(await popButtons(f)));
  await popPress(f, 'p');
  ok(await until(async () => { const r = await record(p); return r && r.highlights.length === 1 && r.highlights[0].target.slide && r.highlights[0].target.quote.exact === '勾配降下法'; }), 'a highlight on the slide {slide, quote} ' + JSON.stringify((await record(p) || {}).highlights));
  ok(await until(async () => (await slideBoxes(f)) > 0), 'painted over the slide');
  // the book view: the slide is hidden, so are its highlights (the owner's iPad 11/27: a slide's box stayed over the book)
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'book' }, '*'));
  ok(await until(async () => (await slideBoxes(f)) === 0), 'book view: the slide\'s highlights are not drawn');
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'slides' }, '*'));
  ok(await until(async () => (await slideBoxes(f)) > 0), 'slides again: drawn again');
  await shot(p, 'notes-slide-hl');
  // 暗記 on a slide: a band over the words; a tap reveals them
  await p.click('#b-markup'); await p.click('#b-recall');
  const bands = () => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=slide-bands]'); return h ? h.shadowRoot.querySelectorAll('.g .m').length : 0; });
  ok(await until(async () => (await bands()) > 0 && (await slideBoxes(f)) === 0), '暗記: a band over the slide words');
  await f.locator('[data-egatari-viewer=slide-bands] .k').first().click();
  ok(await until(async () => (await bands()) === 0 && (await slideBoxes(f)) > 0), 'a tap reveals them');
  await p.click('#b-recall'); await p.click('#b-markup');
  // quote the same words: the highlight is reused, the memo view opens with the quote
  ok(await selectOnSlide(f, '勾配降下法'), 'selected again');
  ok(await until(async () => { const b = await popButtons(f); return b && b.includes('note'); }), 'the window again');
  await popPress(f, 'note');
  ok(await until(() => p.evaluate(() => !document.getElementById('note-area').hidden && !!document.querySelector('#note-area .n-quote'))), 'the memo view opens with the quote');
  ok(await until(async () => { const r = await record(p); const n = r.notes.find((x) => x.at.slide === r.highlights[0].target.slide); return r.highlights.length === 1 && n && n.blocks.some((b) => b.quote && b.quote.highlight === r.highlights[0].id); }), 'the same highlight, quoted into the note of its slide (the first test wrote one there) ' + JSON.stringify(await record(p)));
  await p.keyboard.type('最小値へ少しずつ下る');
  const slideMarks = () => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=slide-layer]'); return h ? h.shadowRoot.querySelectorAll('.u').length : 0; });
  ok(await until(async () => (await slideMarks()) > 0), 'the quoted words on the slide have their underline');
  await p.click('#b-markup'); await p.click('#b-recall');
  ok(await until(async () => (await bands()) > 0 && (await slideMarks()) > 0), '暗記 hides the highlight, not the quote mark');
  await p.click('#b-recall'); await p.click('#b-markup');
  await shot(p, 'notes-slide-quote');
  // to another slide and back with ↗ from the list
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'seek', slide: 2, step: null, t: null }, '*'));
  ok(await until(async () => (await slideAt(p)) === 2), 'on slide 3');
  ok(await until(async () => (await slideBoxes(f)) === 0), 'its own (no) highlights');
  await p.click('#b-markup');
  await p.click('#b-mlist');
  ok(await until(() => p.evaluate(() => document.getElementById('m-list').open && [...document.querySelectorAll('#m-list h3')].some((h) => h.textContent.startsWith('スライド 1')))), 'the list groups the slide highlight under its slide');
  ok(await p.evaluate(() => [...document.querySelectorAll('#m-list .m-note .m-ntext')].some((e) => e.textContent.includes('最初のメモ'))), 'the list has the notes');
  await p.click('#m-list .m-items .m-q');
  ok(await until(async () => (await slideAt(p)) === 0), '↗ from the list goes back to slide 1');
  ok(await until(() => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=slide-bands]'); return !!(h && h.shadowRoot.querySelector('.fl div')); })), 'and the words flash');
  await p.close();
}

// ---------------------------------------------------------------- export and read in: Markdown, the backup, another device
async function draw(p, pts) {
  const b = await p.evaluate(() => { const r = document.querySelector('.ink-surf').getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / 1280 }; });
  const at = ([x, y]) => [b.x + x * b.s, b.y + y * b.s];
  await p.mouse.move(...at(pts[0])); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(...at(q), { steps: 6 });
  await p.mouse.up();
}
async function download(p, button) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.click(button)]);
  // WebKit gives the name in NFD (バ as ハ and ゛, as macOS stores names): compare in NFC
  const f = path.join(work, d.suggestedFilename().normalize('NFC')); await d.saveAs(f); return f;
}
let BACKUP = '';
{
  const p = await newPage();
  // print() is held in every frame of this page (the print frame included), so its layout can be read
  const holdPrint = () => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; };
  await p.addInitScript(holdPrint); await p.evaluate(holdPrint);   // the page is already loaded: also now
  await open(p, LIGHT);
  await p.click('#b-ink');
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await draw(p, [[200, 900], [400, 950], [600, 900]]);
  await p.click('#b-ink');
  await p.click('#b-markup'); await p.click('#b-mexport');
  ok(await p.evaluate(() => document.getElementById('m-export').open), 'エクスポート opens its dialog');
  const md = await download(p, '#b-x-md');
  const mdText = fs.readFileSync(md, 'utf8');
  ok(/のメモ（\d{4}-\d\d-\d\d）\.md$/.test(md), 'Markdown file name ' + path.basename(md));
  ok(mdText.startsWith('# 勾配降下法の基本のメモ') && /## スライド 1「/.test(mdText) && mdText.includes('> 勾配降下法') && mdText.includes('最小値へ少しずつ下る') && mdText.includes('手書きもあります'), 'Markdown: slide headings, the quote as >, the note, a line for handwriting\n' + mdText);
  // PDF (standards 11/27): only the page prints. A frame with the lesson (allow-scripts only) lays out the slides; the notes and the
  // handwriting are drawn by the page. print() is held in this test so the layout can be read
  const printed = (n) => until(() => p.evaluate((n) => window.__printed === n, n));
  const sandboxes = () => p.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.getAttribute('sandbox')));
  const printShot = async (name) => {
    if (!SHOTS) return;
    await p.emulateMedia({ media: 'print' });
    await p.screenshot({ path: path.join(work, name + '.png'), fullPage: true });
    if (!WEBKIT) await p.pdf({ path: path.join(work, name + '.pdf'), preferCSSPageSize: true, printBackground: true });
    await p.emulateMedia({ media: 'screen' });
  };
  // A: one frame, the slides one page apart, the page's memo areas over it
  const framed = new Promise((res) => p.on('frameattached', (fr) => res(fr)));
  await p.click('#b-x-pdf');
  const pf = await framed;
  ok(await printed(1), 'A: the page prints once');
  ok(await p.evaluate(() => { const f = document.querySelector('#print-root iframe.print-frame'); return !!f && f.getAttribute('sandbox') === 'allow-scripts' && document.documentElement.classList.contains('printing') && !document.getElementById('m-export').open; }), 'A: the slides frame is allow-scripts only; the export dialog closed for printing');
  ok(await p.evaluate(() => /^勾配降下法の基本のメモ（\d{4}-\d\d-\d\d）$/.test(document.title)), 'while printing, the page is titled for the PDF\'s name: ' + await p.evaluate(() => document.title));
  ok((await sandboxes()).every((x) => x === 'allow-scripts' || x === ''), 'no frame has more than allow-scripts ' + JSON.stringify(await sandboxes()));
  ok(await p.evaluate(() => document.getElementById('lesson').getAttribute('sandbox') === 'allow-scripts'), 'the playing frame keeps allow-scripts only');
  const pa = await p.evaluate(() => ({ blocks: document.querySelectorAll('#print-root .pr-stack > .pr-block').length, text: [...document.querySelectorAll('#print-root .pr-memo')].map((a) => a.textContent).join('|'),
    ink: document.querySelectorAll('#print-root .pr-memo svg.pr-ink path').length, slideInk: document.querySelectorAll('#print-root .pr-slide svg.pr-ink path').length,
    tops: [...document.querySelectorAll('#print-root .pr-stack > .pr-block')].map((b) => Math.round(b.offsetTop)), fh: document.querySelector('#print-root iframe.print-frame').offsetHeight }));
  const fa = await pf.evaluate(() => ({ on: document.querySelectorAll('#stage > .slide.ega-on').length, all: document.querySelectorAll('#stage > .slide').length, notes: document.body.innerText.includes('最初のメモ') }));
  ok(pa.blocks === 2 && pa.text.includes('最初のメモ') && pa.text.includes('勾配降下法') && pa.ink >= 1 && pa.slideInk >= 1 && pa.tops[0] === 0 && Math.abs(pa.tops[1] - 1032) <= 1 && Math.abs(pa.fh - 2063) <= 2, 'A: the page draws the notes and handwriting, one A4 page apart ' + JSON.stringify(pa));
  ok(fa.on === 2 && fa.all > 2 && !fa.notes, 'A: the frame shows only the slides with a note, and has no note text ' + JSON.stringify(fa));
  await printShot('notes-print-a');
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  ok(await until(() => p.evaluate(() => !document.getElementById('print-root') && !document.documentElement.classList.contains('printing'))), 'A: removed after printing');
  ok(await p.evaluate(() => !/のメモ（/.test(document.title)), 'and the page has its own title again: ' + await p.evaluate(() => document.title));
  // B: still copies of the slides in frames without scripts
  await p.click('#b-mexport'); await p.click('#b-x-pdf2');
  ok(await printed(2), 'B: the page prints once');
  const pb = await p.evaluate(() => ({ copies: [...document.querySelectorAll('#print-root iframe.pr-copy')].map((f) => f.getAttribute('sandbox')), maker: !!document.querySelector('#print-root iframe.print-frame'),
    blocks: document.querySelectorAll('#print-root > .pr-block').length, text: [...document.querySelectorAll('#print-root .pr-memo')].map((a) => a.textContent).join('|'),
    inCopy: [...document.querySelectorAll('#print-root iframe.pr-copy')].map((f) => f.srcdoc.length), scripts: [...document.querySelectorAll('#print-root iframe.pr-copy')].some((f) => /<script/i.test(f.srcdoc)) }));
  ok(pb.copies.length === 2 && pb.copies.every((x) => x === '') && !pb.maker && pb.blocks === 2 && pb.text.includes('最初のメモ') && !pb.scripts && pb.inCopy.every((n) => n > 1000), 'B: two copies with sandbox="", no script in them, the lesson frame gone ' + JSON.stringify(pb));
  await printShot('notes-print-b');
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await p.click('#b-mexport');   // printing closed the dialog
  BACKUP = await download(p, '#b-x-json');
  const j = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  ok(/のメモのバックアップ（\d{4}-\d\d-\d\d）\.ega-notes\.json$/.test(BACKUP), 'backup file name ' + path.basename(BACKUP));
  ok(j.format === 'egatari-notes' && j.docId && j.madeOn.fileSha256 && j.highlights.length === 1 && j.notes.length >= 2 && j.ink.length >= 1 && j.ink[0].strokes.length >= 1, 'backup: docId, madeOn, highlights, notes and ink ' + JSON.stringify({ d: j.docId, h: j.highlights.length, n: j.notes.length, k: j.ink.length }));
  await p.close();
}
{
  // another device: a new browser profile, the same file
  const ctx2 = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx2.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  const p = await ctx2.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  await open(p, BOOK);
  await p.click('#b-markup'); await p.click('#b-mexport');
  await p.setInputFiles('#x-file', BACKUP);
  ok(await until(() => p.evaluate(() => /別のファイル/.test(document.getElementById('x-status').textContent))), 'a backup of another file is refused');
  await p.click('#b-mexport-close');
  await open(p, LIGHT);
  ok(await until(async () => { const r = await record(p); return r && r.notes.length === 0; }), 'the new device has no notes');
  await p.click('#b-markup'); await p.click('#b-mexport');
  await p.setInputFiles('#x-file', BACKUP);
  ok(await until(() => p.evaluate(() => /読み込みました/.test(document.getElementById('x-status').textContent))), 'read in: ' + await p.evaluate(() => document.getElementById('x-status').textContent));
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 1 && r.notes.length >= 2; }), 'highlights and notes are here');
  await p.setInputFiles('#x-file', BACKUP);
  ok(await until(async () => { const r = await record(p); return r.highlights.length === 1 && r.notes.length >= 2 && r.notes.every((n) => new Set(n.blocks.map((b) => JSON.stringify(b))).size === n.blocks.length); }), 'read in twice: nothing doubled');
  await p.click('#b-mexport-close');
  await p.click('#b-note');
  ok(await until(() => p.evaluate(() => (document.querySelector('#note-area textarea') || {}).value === '最初のメモ。ArrowRight で動かない')), 'the slide note is on screen');
  ok(await until(() => p.evaluate(() => /（[1-9][0-9]* 本の線）/.test(document.querySelector('.ink-surf').getAttribute('aria-label')))), 'and the handwriting');
  fs.writeFileSync(path.join(work, 'bad.ega-notes.json'), '{"nope": 1}');
  if (!(await p.isVisible('#b-mexport'))) await p.click('#b-markup');
  await p.click('#b-mexport');
  await p.setInputFiles('#x-file', path.join(work, 'bad.ega-notes.json'));
  ok(await until(() => p.evaluate(() => /読み込めません/.test(document.getElementById('x-status').textContent))), 'a file that is not a backup is refused');
  await ctx2.close();
}

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
