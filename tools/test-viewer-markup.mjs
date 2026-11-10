// Egatari Viewer の マークアップ（段 1：本のハイライト・暗記・一覧と色で絞る。play/markup.mjs・play/markup-frame.js）の確認
//   node tools/test-viewer-markup.mjs [作業フォルダ] [--webkit] [--shots]
// 章のある本（tools/fixtures/article-book）を 1 ファイルと再生専用にし、Viewer で開いて：
//  1. 「マークアップ」は本のある教材でだけ出る。上の帯が入れ替わる（教材の枠の上には何も出ない）。もう一度押すか Esc で戻る
//  2. 字を選ぶと、選んだ所の上に小さな窓（3 色）。強調・ルビ・数式・用語のリンクをまたいでも塗れる。本文の HTML は変わらない
//  3. 端末に残る（IndexedDB）。開き直しても、字の大きさ・背景を変えても、同じ docId の再生専用のファイルでも同じハイライト
//  4. 教材を直したファイル：文が動いても付け直す。消えた文のハイライトは消さず「場所が見つからないハイライト」
//  5. 暗記：選んだ色の字を隠し、押すと 1 つずつ現れる。帯を閉じると終わる
//  6. 一覧：この色だけ表示・この色を非表示・この色を全部消す（ページの中の確かめ）
//  7. 共有の端末：保存しない
//  8. 枠からの偽の頼み（長すぎる引用・余分な項目・別の docId）は受け付けない
// --shots：作業フォルダに画面の PNG を残す（目で見る用）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { buildPlay } from './build-play.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit'), SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-viewer-markup-')));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- fixtures: the book, its play-only copy, and a revised copy
const bookDir = path.join(work, 'book');
fs.cpSync(path.join(ROOT, 'tools/fixtures/article-book'), bookDir, { recursive: true });
const deck = path.join(bookDir, 'deck.html');
await buildPortable(deck, {});   // writes the docId
const FIX = {};
const put = (n, html) => { FIX[n] = path.join(work, n); fs.writeFileSync(FIX[n], html); };
put('book.ega.html', (await buildPortable(deck, {})).html);
put('book.play.ega.html', (await buildPortable(deck, { playOnly: true })).html);
const ch1 = path.join(bookDir, 'article', '01.md');
const src = fs.readFileSync(ch1, 'utf8');
// revised: a new sentence before the first highlight (it moves), and the exercise sentence rewritten (its highlight is lost)
const revised = src.replace('平均は外れ値に', 'ここに新しい文を足した。平均は外れ値に').replace('3, 5, 10 の{term}`平均`を求めよ。', '4, 6, 11 の値をすべて足せ。');
if (revised === src || !revised.includes('新しい文')) throw new Error('fixture: the revision did not apply');
fs.writeFileSync(ch1, revised);
put('book-rev.play.ega.html', (await buildPortable(deck, { playOnly: true })).html);
fs.writeFileSync(ch1, src);
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), path.join(work, 'minimal'), { recursive: true });
put('nobook.play.ega.html', (await buildPortable(path.join(work, 'minimal', 'deck.html'), { playOnly: true })).html);

// ---------------------------------------------------------------- the Viewer, served
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
if (WEBKIT) { try { browser = await webkit.launch(); } catch (e) { console.log('skip: WebKit is not installed: ' + String(e.message).split('\n')[0]); process.exit(0); } }
else browser = await launch();
console.log(WEBKIT ? 'WebKit' : 'Chromium');

const errors = [];
async function page(ctx, scheme = 'light') {
  const c = ctx || await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 800 }, colorScheme: scheme, serviceWorkers: 'block' });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  return { c, p };
}
const lesson = async (p) => { let f = null; await until(async () => { f = await (await p.$('#lesson')).contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000); return f; };
async function openBook(p, name) {
  await p.setInputFiles('#file', FIX[name]);
  const f = await lesson(p);
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'book' }, '*'));
  await f.waitForSelector('#egatari-article');
  await until(() => p.isVisible('#b-markup'));
  return f;
}
const mstate = (p) => p.evaluate(() => window.__play.state().markup);
// select the text from the first `from` to the end of the first `to` after it, in the article's text (ruby readings and MathML left out)
async function select(f, from, to) {
  return f.evaluate(([from, to]) => {
    const a = document.getElementById('egatari-article');
    const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('rt,rp,.katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = []; let s = '', n; const starts = [];
    while ((n = w.nextNode())) { nodes.push(n); starts.push(s.length); s += n.data; }
    const i = s.indexOf(from), j = s.indexOf(to, i) + to.length;
    if (i < 0 || j < to.length) return null;
    const at = (o, end) => { for (let k = 0; k < nodes.length; k++) { const e = starts[k] + nodes[k].data.length; if (end ? o <= e && o > starts[k] : o < e) return [nodes[k], o - starts[k]]; } return null; };
    const r = document.createRange(); const A = at(i, false), B = at(j, true); r.setStart(A[0], A[1]); r.setEnd(B[0], B[1]);
    A[0].parentElement.scrollIntoView({ block: 'center' });
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const rs = r.getClientRects(), b = rs[0];
    return { top: b.top, bottom: rs[rs.length - 1].bottom, text: r.toString() };
  }, [from, to]);
}
const popup = (f) => f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=markup]'); const w = h && h.shadowRoot.querySelector('.w'); if (!w || w.hidden) return null; const r = w.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, label: w.getAttribute('aria-label'), buttons: [...w.querySelectorAll('button')].map((b) => b.getAttribute('data-a')).filter((a) => a !== 'close'), close: !!w.querySelector('button[data-a=close]') }; });
const press = (f, a) => f.evaluate((a) => document.querySelector('[data-egatari-viewer=markup]').shadowRoot.querySelector(`button[data-a="${a}"]`).click(), a);
// the markup layer (a shadow tree inside the book's scrolling box, play/markup-frame.js): per colour, how many highlights are painted
// (y, p, b) and how many are under a 暗記 band (y-m, p-m, b-m)
const LAYER = '[data-egatari-viewer=layer]';
const sizes = (f) => f.evaluate((L) => { const h = document.querySelector(L), r = h && h.shadowRoot; const n = (sel, c) => (r ? new Set([...r.querySelectorAll(sel + `[data-c="${c}"]`)].map((e) => e.getAttribute('data-id'))).size : 0); return Object.fromEntries(['y', 'p', 'b'].flatMap((c) => [[c, n('.h', c)], [c + '-m', n('.g', c)]])); }, LAYER);
const bands = (f) => f.evaluate((L) => { const h = document.querySelector(L); return h ? h.shadowRoot.querySelectorAll('.g').length : 0; }, LAYER);
// the boxes of one colour ('y') or its bands ('y-m'), one per highlight: the first box brought into view, its middle, and the text under it
const highlightRects = (f, key) => f.evaluate(([L, key]) => { const r = document.querySelector(L).shadowRoot, m = /-m$/.test(key), c = key[0];
  const firsts = [...new Map([...r.querySelectorAll(m ? `.g[data-c="${c}"] .m` : `.h[data-c="${c}"]`)].map((e) => [(m ? e.parentElement : e).getAttribute('data-id'), e])).values()];
  if (firsts[0]) firsts[0].scrollIntoView({ block: 'center' });
  return firsts.map((e) => { const b = e.getBoundingClientRect(), x = b.left + Math.min(6, b.width / 2), y = b.top + b.height / 2; let t = '';
    if (!m) { const cr = document.caretRangeFromPoint ? document.caretRangeFromPoint(x + 2, y) : null; t = cr && cr.startContainer.nodeType === 3 ? cr.startContainer.data.trim().slice(0, 12) : ''; }
    return { x, y, t }; }); }, [LAYER, key]);
const tapAt = async (p, x, y) => { const b = await (await p.$('#lesson')).boundingBox(); await p.mouse.click(b.x + x, b.y + y); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(work, `${WEBKIT ? 'wk-' : ''}${n}.png`) }); };
const HL = [
  ['y', '外れ値に', '引っぱられるが', 'across <em>'],
  ['p', '代表値を', '1 つ選ぶ', 'across ruby'],
  ['b', '右辺で', 'を含む', 'across inline math'],
  ['y', '3, 5, 10 の', '求めよ', 'across a term link'],
];

// ---------------------------------------------------------------- 1. no book: no Markup button
console.log('button');
{ const { c, p } = await page();
  await p.setInputFiles('#file', FIX['nobook.play.ega.html']); await lesson(p); await sleep(600);
  ok(!(await p.isVisible('#b-markup')), 'a lesson without a book shows no Markup button (stage 1 marks up the book only)');
  await c.close(); }

// ---------------------------------------------------------------- 2. highlighting
console.log('highlight');
// tall, so that every highlight of the small book is within the drawn window (only highlights near the screen are drawn: see 9)
const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 1600 }, serviceWorkers: 'block' });
{ const { p } = await page(ctx);
  const f = await openBook(p, 'book.ega.html');
  const frameBox = await (await p.$('#lesson')).boundingBox();
  await p.click('#b-markup');
  ok(await p.isVisible('#markup-bar') && !(await p.isVisible('#b-close')) && (await p.getAttribute('#b-markup', 'aria-pressed')) === 'true', 'Markup swaps the header\'s content for the markup bar (pressed)');
  const box2 = await (await p.$('#lesson')).boundingBox();
  ok(box2.y === frameBox.y && box2.height === frameBox.height, `the lesson's frame does not move or shrink (${frameBox.y}/${frameBox.height} → ${box2.y}/${box2.height})`);
  const before = await f.evaluate(() => document.getElementById('egatari-article').innerHTML);
  for (const [col, a, b, what] of HL) {
    const s = await select(f, a, b);
    ok(!!s, `selected ${what}: ${s && s.text.replace(/\s+/g, ' ')}`);
    let w = null; await until(async () => (w = await popup(f)));
    ok(w && w.buttons.join() === 'y,p,b' && w.bottom <= s.top + 1, `the small window shows three colours, above the selection (${w && w.bottom} ≤ ${s && s.top})`);
    await press(f, col);
    await until(async () => (await mstate(p)).record.highlights.length >= HL.indexOf(HL.find((x) => x[1] === a)) + 1);
  }
  const st = await mstate(p);
  ok(st.record.highlights.length === 4 && st.record.highlights.every((h) => h.target.section && h.target.quote.exact && h.created), `4 highlights recorded with a section and a quote (${st.record.highlights.map((h) => h.target.section + ':' + h.target.quote.exact).join(' | ')})`);
  ok(st.record.highlights[1].target.quote.exact === '代表値を 1 つ選ぶ' && !st.record.highlights[1].target.quote.exact.includes('だいひょうち'), 'the quote leaves out ruby readings');
  ok(/右辺で\s*c\s*を含む/.test(st.record.highlights[2].target.quote.exact), `the quote across inline math is the visible text (${st.record.highlights[2].target.quote.exact})`);
  ok(await f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=layer]'), c = getComputedStyle(h); return c.zIndex === 'auto' && c.isolation === 'auto' && c.opacity === '1' && c.transform === 'none' && c.position === 'absolute'; }),
    'the layer forms no stacking context of its own (no z-index, isolation, opacity or transform), so the blended boxes mix with the text under them');
  const sz = await sizes(f);
  ok(sz.y === 2 && sz.p === 1 && sz.b === 1, `painted in the markup layer (${JSON.stringify(sz)})`);
  ok(await f.evaluate(() => document.getElementById('egatari-article').innerHTML) === before, 'the book\'s HTML is unchanged');
  await shot(p, '01-highlights-light');
  // a tap on a highlight: change its colour
  const [r0] = await highlightRects(f, 'p');
  await tapAt(p, r0.x, r0.y);
  let w = null; await until(async () => (w = await popup(f)));
  ok(w && w.buttons.join() === 'y,p,b,del', 'a tap on a highlight opens the window with 消す');
  await press(f, 'b'); await until(async () => (await sizes(f)).b === 2);
  ok((await sizes(f)).p === 0, 'the colour is changed');
  await press(f, 'b').catch(() => {});
  // saved on this device
  await p.evaluate(() => window.__play.markupSaved());
  const sha = (await mstate(p)).record.madeOn;
  await p.reload(); await p.waitForSelector('html[data-ready]');
  const f2 = await openBook(p, 'book.ega.html');
  await until(async () => (await sizes(f2)).b === 2);
  ok(((x) => x.y === 2 && x.p === 0 && x.b === 2 && !x['y-m'] && !x['p-m'] && !x['b-m'])(await sizes(f2)), `opened again after a reload: the same highlights (kept in this browser) ${JSON.stringify(await sizes(f2))}`);
  const rec = await p.evaluate(() => new Promise((res) => { const o = indexedDB.open('egatari-viewer-notes'); o.onsuccess = () => { const g = o.result.transaction('lessons').objectStore('lessons').getAll(); g.onsuccess = () => res(g.result); }; }));
  ok(rec.length === 1 && /^[0-9a-f]{64}$/.test(rec[0].madeOn.fileSha256) && /^[0-9a-f]{64}$/.test(rec[0].madeOn.sourceSha256 || ''), `the record: one per docId, madeOn has fileSha256 and (portable) sourceSha256 (${JSON.stringify(sha)})`);
  // font size, line spacing and background: the highlights stay on the same text
  await until(async () => (await highlightRects(f2, 'y')).every((x) => x.t));   // the book may be rebuilt once after it opens; the anchors follow
  const t0 = (await highlightRects(f2, 'y')).map((x) => x.t).join('|');
  await f2.evaluate(() => { const t = document.getElementById('deck-text'); t.setAttribute('data-dx-bg', 'black'); t.style.fontSize = '24px'; t.style.lineHeight = '2.2'; });
  await sleep(400);
  ok((await highlightRects(f2, 'y')).map((x) => x.t).join('|') === t0 && (await mstate(p)).missing.length === 0, `a new font size, line spacing and background: the same text stays highlighted (${t0} → ${(await highlightRects(f2, 'y')).map((x) => x.t).join('|')}; missing ${(await mstate(p)).missing.length})`);
  // every painted box still lies on its own highlight's text: the character under the middle of each box is in that highlight's quote
  const onText = async () => { const quotes = Object.fromEntries((await mstate(p)).record.highlights.map((h) => [h.id, h.target.quote.exact])); return f2.evaluate((quotes) => {
    const r = document.querySelector('[data-egatari-viewer=layer]').shadowRoot, bad = [];
    const boxes = [...r.querySelectorAll('.h')];
    for (const e of boxes) { const b = e.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) continue; e.scrollIntoView({ block: 'nearest' }); const c = e.getBoundingClientRect(), cr = document.caretRangeFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      const ch = cr && cr.startContainer.nodeType === 3 ? (cr.startContainer.data[cr.startOffset] || cr.startContainer.data[cr.startOffset - 1] || '') : '';
      const inReading = cr && cr.startContainer.parentElement && cr.startContainer.parentElement.closest('rt');   // a highlighted ruby base has its reading painted too
      if (!inReading && (!ch || !quotes[e.getAttribute('data-id')].includes(ch))) bad.push(e.getAttribute('data-id') + ':' + ch); }
    return { n: boxes.length, bad }; }, quotes); };
  await f2.evaluate(() => { document.getElementById('deck-text').style.fontSize = '30px'; });
  await sleep(300);
  const ot = await onText();
  ok(ot.n > 0 && ot.bad.length === 0, `after a font size change every box still lies on its highlight's text (${ot.n} boxes; off: ${ot.bad.join(' ')})`);
  await f2.evaluate(() => { document.getElementById('deck-text').style.fontSize = '24px'; });
  await shot(p, '02-highlights-black');
  await f2.evaluate(() => { const t = document.getElementById('deck-text'); t.setAttribute('data-dx-bg', 'white'); t.style.fontSize = ''; t.style.lineHeight = ''; });

  // ---------------------------------------------------------------- 暗記
  console.log('recall');
  await p.click('#b-markup');
  await p.click('#b-recall');
  let s1 = await sizes(f2);
  ok(s1['y-m'] === 2 && s1['b-m'] === 2 && s1.y === 0 && s1.b === 0, `暗記 hides the text of every colour by default (${JSON.stringify(s1)})`);
  await highlightRects(f2, 'y-m'); await sleep(200);
  ok((await bands(f2)) >= 1, `暗記 lays an opaque band over hidden highlights on screen (${await bands(f2)})`);
  ok(await p.isVisible('#recall-colours'), '「暗記する色」 shows while 暗記 is on');
  await shot(p, '03-recall');
  const [m0] = await highlightRects(f2, 'y-m');
  await tapAt(p, m0.x, m0.y);
  await until(async () => (await sizes(f2))['y-m'] === 1);
  s1 = await sizes(f2);
  ok(s1['y-m'] === 1 && s1.y === 1 && !(await popup(f2)), 'a tap reveals that one highlight (no window)');
  // keyboard: each hidden highlight has a button in reading order; Enter reveals it and the focus goes on to the next one
  const kb = () => f2.evaluate(() => { const r = document.querySelector('[data-egatari-viewer=layer]').shadowRoot; const ks = [...r.querySelectorAll('.mk .k')]; return { n: ks.length, focused: ks.indexOf(r.activeElement), label: ks[0] && ks[0].getAttribute('aria-label'), bandsHidden: [...r.querySelectorAll('.mk .g')].every((g) => g.getAttribute('aria-hidden') === 'true') }; });
  const k0 = await kb();
  await f2.evaluate(() => document.querySelector('[data-egatari-viewer=layer]').shadowRoot.querySelector('.mk .k').focus());
  await p.keyboard.press('Enter'); await sleep(200);
  const k1 = await kb();
  ok(k0.n === 3 && /^隠したハイライトを表示（(黄|青)）$/.test(k0.label) && k0.bandsHidden, `暗記: one focusable button per hidden highlight, named 「隠したハイライトを表示（…）」; the bands are aria-hidden (${k0.n}, ${k0.label})`);
  ok(k1.n === 2 && k1.focused === 0, `Enter reveals it and the focus moves to the next hidden highlight (${k1.n} left, focus at ${k1.focused})`);
  await shot(p, '03b-recall-focus');
  await p.keyboard.press(' '); await sleep(200);
  ok((await kb()).n === 1, 'Space reveals the next one');
  ok((await p.getAttribute('#recall-colours button[data-c="y"]', 'aria-label')) === '暗記する色：黄' && await p.isVisible('#recall-colours .rc-l'), 'the colour switches are named 「暗記する色：黄」…, with the visible word 「暗記する色」 on a wide screen');
  await p.click('#b-recall'); await p.click('#b-recall');   // 暗記 again: everything hidden again
  await p.click('#recall-colours button[data-c="b"]');
  s1 = await sizes(f2);
  s1 = await sizes(f2);
  ok(s1['b-m'] === 0 && s1.b === 2, '「暗記する色」: blue turned off is shown');
  await shot(p, '04-recall-colours');
  await f2.focus('body'); await f2.press('body', 'Escape');
  await until(async () => !(await p.isVisible('#markup-bar')));
  s1 = await sizes(f2);
  ok(!(await p.isVisible('#markup-bar')) && s1['y-m'] === 0 && s1.y === 2 && (await bands(f2)) === 0, 'Esc in the lesson closes the bar, and 暗記 ends with it (no bands left)');

  // ---------------------------------------------------------------- 一覧
  console.log('list');
  await p.click('#b-markup'); await p.click('#b-mlist');
  ok(await p.isVisible('#m-list'), 'the list opens');
  ok((await p.$$eval('#m-list .m-item', (e) => e.length)) === 4, 'it lists the 4 highlights');
  await p.click('#m-list .m-colour:nth-child(1) .m-crow button:nth-child(1)');   // yellow only
  s1 = await sizes(f2);
  ok(s1.y === 2 && s1.b === 0, 'この色だけ表示: only yellow is painted');
  await p.click('#m-list .m-colour:nth-child(1) .m-crow button:nth-child(1)');
  await p.click('#m-list .m-colour:nth-child(3) .m-crow button:nth-child(2)');   // hide blue
  s1 = await sizes(f2);
  ok(s1.y === 2 && s1.b === 0, 'この色を非表示: blue is not painted');
  await p.click('#m-list .m-colour:nth-child(3) .m-crow button:nth-child(2)');
  await p.click('#m-list .m-colour:nth-child(3) .m-crow button:nth-child(3)');   // delete all blue
  ok(await p.isVisible('#m-confirm') && /青のハイライトを 2 件消します。元に戻せません。/.test(await p.textContent('#m-confirm-t')), 'この色を全部消す asks in the page: 「青のハイライトを 2 件消します。元に戻せません。」');
  await shot(p, '05-confirm');
  await p.click('#b-mconfirm-yes');
  await until(async () => (await mstate(p)).record.highlights.length === 2);
  ok((await sizes(f2)).b === 0 && (await mstate(p)).record.highlights.every((h) => h.color === 'y'), 'blue is deleted, yellow kept');
  await p.click('#b-mlist-close'); await p.click('#b-markup');
  await p.evaluate(() => window.__play.markupSaved());

  // ---------------------------------------------------------------- play-only copy and revised copy
  console.log('versions');
  await p.click('#b-close');
  const f3 = await openBook(p, 'book.play.ega.html');
  await until(async () => (await sizes(f3)).y === 2);
  ok((await sizes(f3)).y === 2, 'the play-only file of the same docId shows the same highlights');
  await p.click('#b-close');
  const f4 = await openBook(p, 'book-rev.play.ega.html');
  await until(async () => (await mstate(p)).missing.length === 1 && (await sizes(f4)).y === 1);
  const st4 = await mstate(p);
  ok((await sizes(f4)).y === 1 && st4.missing.length === 1 && st4.record.highlights.length === 2, `revised lesson: the moved sentence is re-attached; the rewritten one is kept as not found (not deleted) ${JSON.stringify(await sizes(f4))} ${JSON.stringify(st4.missing)}`);
  await p.click('#b-markup'); await p.click('#b-mlist');
  ok((await p.textContent('#m-list')).includes('場所が見つからないハイライト') && (await p.textContent('#m-list')).includes('教材が直されて、元の文が見つかりません。'), 'the list shows 「場所が見つからないハイライト」 with its line');
  await shot(p, '06-missing');
  await p.click('#b-mlist-close');

  // ---------------------------------------------------------------- forged requests from the lesson
  console.log('forged');
  const n0 = (await mstate(p)).record.highlights.length;
  await f4.evaluate(() => {
    const t = { section: '', quote: { exact: 'x'.repeat(1001), prefix: '', suffix: '' } };
    parent.postMessage({ egaViewer: 'markup-add', color: 'y', target: t }, '*');
    parent.postMessage({ egaViewer: 'markup-add', color: 'y', docId: 'other', target: { section: '', quote: { exact: 'a', prefix: '', suffix: '' } } }, '*');
    parent.postMessage({ egaViewer: 'markup-add', color: 'r', target: { section: '', quote: { exact: 'a', prefix: '', suffix: '' } } }, '*');
    parent.postMessage({ egaViewer: 'markup-add', color: 'y', target: { section: '', quote: { exact: 'a', prefix: 'p'.repeat(33), suffix: '' } } }, '*');
  });
  await sleep(300);
  ok((await mstate(p)).record.highlights.length === n0, 'requests with a quote over 1,000 characters, an extra member (docId), an unknown colour or a long prefix are ignored');
  await p.click('#b-markup');
  await p.evaluate(() => window.__play.markupSaved());

  // ---------------------------------------------------------------- 共有の端末 asks before it deletes saved highlights
  console.log('shared switch');
  await p.click('#b-close');
  const count = () => p.evaluate(() => new Promise((res) => { const o = indexedDB.open('egatari-viewer-notes'); o.onsuccess = () => { const g = o.result.transaction('lessons').objectStore('lessons').getAll(); g.onsuccess = () => res(g.result.reduce((n, r) => n + r.highlights.length, 0)); }; }));
  await p.click('#shared');
  await until(() => p.isVisible('#m-confirm'));
  ok((await p.textContent('#m-confirm-t')) === 'この端末に保存したハイライトも消します（1 つの教材、2 件）。元に戻せません。' && (await p.textContent('#b-mconfirm-yes')) === '消して切り替える',
    `turning 共有の端末 on asks first, with the counts (${await p.textContent('#m-confirm-t')})`);
  await shot(p, '10-shared-ask');
  await p.click('#b-mconfirm-no');
  ok(!(await p.isChecked('#shared')) && (await count()) === 2, 'やめる: the switch stays off and the highlights stay');
  await p.click('#shared'); await until(() => p.isVisible('#m-confirm')); await p.click('#b-mconfirm-yes');
  await until(async () => (await count()) === 0);
  ok(await p.isChecked('#shared') && (await count()) === 0, '消して切り替える: shared device on, the saved highlights deleted');
  await ctx.close(); }

// ---------------------------------------------------------------- 6a. 暗記 over ruby and a display equation
console.log('ruby and math');
{ const { c, p } = await page(null);
  const f = await openBook(p, 'book.ega.html');
  await select(f, '代表値を', '代表値'); await until(async () => !!(await popup(f))); await press(f, 'y');
  await f.evaluate(() => { const m = document.querySelector('#egatari-article .egatari-math'); m.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.selectNodeContents(m); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await until(async () => !!(await popup(f))); await press(f, 'b');
  await until(async () => (await mstate(p)).record.highlights.length === 2);
  await p.click('#b-markup'); await p.click('#b-recall'); await sleep(300);
  const ids = (await mstate(p)).record.highlights.map((h) => h.id);
  const look = async (sel) => { await f.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel); await sleep(400); };
  await look('#egatari-article ruby');
  const r0 = await f.evaluate((ids) => { const L = document.querySelector('[data-egatari-viewer=layer]').shadowRoot; const rt = [...document.querySelectorAll('#egatari-article ruby rt')].find((x) => x.textContent === 'だいひょうち').getBoundingClientRect();
    return [...L.querySelectorAll(`.g[data-id="${ids[0]}"] .m`)].map((e) => e.getBoundingClientRect()).some((b) => b.left <= rt.left + 1 && b.right >= rt.right - 1 && b.top <= rt.top + 1 && b.bottom >= rt.bottom - 1); }, ids);
  await shot(p, '12a-recall-ruby');
  await look('#egatari-article .egatari-math');
  const r = await f.evaluate((ids) => {
    const L = document.querySelector('[data-egatari-viewer=layer]').shadowRoot;
    const bands = (id) => [...L.querySelectorAll(`.g[data-id="${id}"] .m`)].map((e) => e.getBoundingClientRect());
    const eq = document.querySelector('#egatari-article .egatari-math .katex-display, #egatari-article .egatari-math .katex').getBoundingClientRect();
    return { eqBands: bands(ids[1]).length, eqBox: bands(ids[1])[0] && { w: Math.round(bands(ids[1])[0].width), eqW: Math.round(eq.width) } };
  }, ids);
  ok(r0, '暗記 over a ruby base also hides its reading (furigana)');
  ok(r.eqBands === 1, `暗記 over a display equation is one band, not a band per symbol (${r.eqBands} band(s), ${JSON.stringify(r.eqBox)})`);
  await shot(p, '12b-recall-math');
  await c.close(); }

// ---------------------------------------------------------------- 6b. split view (slides and book): 暗記 leaves the slide pane alone
console.log('split');
{ const { c, p } = await page(null);
  const f = await openBook(p, 'book.ega.html');
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'split' }, '*'));
  await until(() => f.evaluate(() => DECK.panes.state().layout === 'split'));
  await select(f, '外れ値に', '引っぱられるが'); await until(async () => !!(await popup(f))); await press(f, 'y');
  await select(f, '代表値を', '1 つ選ぶ'); await until(async () => !!(await popup(f))); await press(f, 'b');
  await p.click('#b-markup'); await p.click('#b-recall'); await sleep(300);
  const r = await f.evaluate(() => {
    const st = DECK.panes.state(), text = document.getElementById('deck-text').getBoundingClientRect();
    const host = document.querySelector('[data-egatari-viewer=layer]');
    const els = host ? [...host.shadowRoot.querySelectorAll('.mk .m, .mk .k, .h')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 1) : [];
    const outside = els.filter((b) => b.left < text.left - 1 || b.right > text.right + 1).length;   // the layer scrolls with the book: only the sides matter
    const sx = text.left > innerWidth / 2 ? text.left / 2 : (text.right + innerWidth) / 2;   // the middle of the slide side
    const hit = document.elementFromPoint(sx, innerHeight / 2);
    return { layout: st.layout, n: els.length, outside, onSlide: hit === host };
  });
  ok(r.layout === 'split' && r.n > 0 && r.outside === 0 && !r.onSlide, `split view with 暗記 on: the bands stay inside the book's pane, nothing of the markup over the slides (${JSON.stringify(r)})`);
  const s0 = await f.evaluate(() => DECK.state());
  await p.keyboard.press('ArrowRight'); await sleep(400);
  const s1 = await f.evaluate(() => DECK.state());
  ok(s1.slide * 100 + s1.step > s0.slide * 100 + s0.step, `with the markup bar open and 暗記 on, → still moves the lesson on (${s0.slide}.${s0.step} → ${s1.slide}.${s1.step})`);
  await shot(p, '11-split-recall');
  // slides only, 暗記 still on: the book is not on screen, so no band and nothing of the markup over the slide
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'slides' }, '*'));
  await until(() => f.evaluate(() => DECK.panes.state().layout === 'slides')); await sleep(300);
  const so = await f.evaluate(() => { const host = document.querySelector('[data-egatari-viewer=layer]'); const vis = host ? [...host.shadowRoot.querySelectorAll('.mk .m, .mk .k, .h')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1; }).length : 0; return { vis, hit: document.elementFromPoint(innerWidth / 2, innerHeight / 2) === host }; });
  const t0 = await f.evaluate(() => DECK.state());
  await p.keyboard.press('ArrowRight'); await sleep(400);
  const t1 = await f.evaluate(() => DECK.state());
  ok(so.vis === 0 && !so.hit && t1.slide * 100 + t1.step > t0.slide * 100 + t0.step, `slides only with 暗記 on: no band shown, nothing over the slide, → moves on (${JSON.stringify(so)})`);
  await c.close(); }

// ---------------------------------------------------------------- 7. shared device
console.log('shared');
{ const { c, p } = await page();
  await p.check('#shared');
  const f = await openBook(p, 'book.ega.html');
  await p.click('#b-markup');
  ok(await p.isVisible('#markup-note') && (await p.textContent('#markup-note')) === '共有の端末なので、ハイライトは保存されません。', 'shared device: the bar says highlights are not saved');
  await select(f, '外れ値に', '引っぱられるが'); await until(async () => !!(await popup(f))); await press(f, 'p');
  await until(async () => (await mstate(p)).record.highlights.length === 1);
  await sleep(300);
  const n = await p.evaluate(() => new Promise((res) => { const o = indexedDB.open('egatari-viewer-notes'); o.onsuccess = () => { const d = o.result; if (!d.objectStoreNames.contains('lessons')) return res(0); const g = d.transaction('lessons').objectStore('lessons').count(); g.onsuccess = () => res(g.result); }; o.onerror = () => res(0); }));
  ok(n === 0, 'shared device: nothing is written to this device');
  await shot(p, '07-shared');
  await c.close(); }

// ---------------------------------------------------------------- 8. dark scheme and a phone (shots; the bar fits)
console.log('dark and phone');
for (const [scheme, vp, name] of [['dark', { width: 1280, height: 800 }, '08-bar-dark'], ['light', { width: 375, height: 667 }, '09-phone']]) {
  const c = await browser.newContext({ locale: 'ja-JP', viewport: vp, colorScheme: scheme, serviceWorkers: 'block', hasTouch: vp.width < 500 });
  const { p } = await page(c, scheme);
  const f = await openBook(p, 'book.ega.html');
  const sv = await select(f, '外れ値に', '引っぱられるが'); let pw = null; await until(async () => (pw = await popup(f)));
  if (vp.width < 500) { const pane = await f.evaluate(() => document.getElementById('egatari-article').closest('.dx-body').getBoundingClientRect().bottom);
    ok(pw && await f.evaluate(() => matchMedia('(pointer: coarse)').matches) && pw.bottom >= pane - 20 && pw.top > sv.bottom + 72, `${name}: on a touch screen the window is docked at the bottom of the book's pane, away from the selection and the system menu next to it (${pw && pw.top}–${pw && pw.bottom}, pane bottom ${pane}, selection bottom ${sv.bottom})`); }
  if (vp.width < 500) {
    ok(pw.label === '選んだ字に色を付ける' && pw.close, `${name}: the docked window is named 「選んだ字に色を付ける」 and has ×`);
    await press(f, 'close'); await sleep(350);
    ok(!(await popup(f)) && await f.evaluate(() => !getSelection().isCollapsed), `${name}: × closes it and keeps the selection`);
    // something of the lesson's own where the window would dock (the player's bar, captions): the window goes above it
    await f.evaluate(() => { const b = document.getElementById('egatari-article').closest('.dx-body').getBoundingClientRect(); const d = document.createElement('div'); d.id = 'fake-bar'; d.style.cssText = `position:fixed;left:0;right:0;top:${b.bottom - 70}px;height:70px;background:#333;z-index:30`; document.body.appendChild(d); });
    await select(f, '中央値は', '引っぱられにくい'); let pb = null; await until(async () => (pb = await popup(f)));
    const barTop = await f.evaluate(() => document.getElementById('fake-bar').getBoundingClientRect().top);
    ok(pb && pb.bottom <= barTop, `${name}: with a bar of the lesson's own at the bottom, the docked window sits above it (${pb && pb.bottom} ≤ ${barTop})`);
    await f.evaluate(() => document.getElementById('fake-bar').remove());
  }
  await press(f, 'y');
  const h0 = (await (await p.$('#lesson')).boundingBox());
  await p.click('#b-markup'); await p.click('#b-recall');
  const h1 = (await (await p.$('#lesson')).boundingBox());
  ok(h0.y === h1.y && h0.height === h1.height, `${name}: the bar stays one row; the lesson's frame does not move (${h0.y}/${h0.height} → ${h1.y}/${h1.height})`);
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('#markup-bar button, #b-markup')].some((b) => b.getBoundingClientRect().right > innerWidth));
  ok(!over, `${name}: the markup bar fits the width (${vp.width} px)`);
  await shot(p, name);
  await c.close();
}

// ---------------------------------------------------------------- 9. the window flips above near the bottom (touch); print; cost at the 2000 cap
console.log('flip, print, cost');
{ const c = await browser.newContext({ locale: 'ja-JP', viewport: { width: 375, height: 667 }, serviceWorkers: 'block', hasTouch: true });
  const { p } = await page(c);
  const f = await openBook(p, 'book.ega.html');
  // a selection near the bottom of the screen: no room below, so the window goes above it
  const near = await f.evaluate(() => {
    const a = document.getElementById('egatari-article'), body = a.closest('.dx-body');
    const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.includes('中央値は')) break;
    const i = n.data.indexOf('中央値は'), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 4);
    body.scrollTop += r.getBoundingClientRect().bottom - (innerHeight - 24);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom };
  });
  let w = null; await until(async () => (w = await popup(f)));
  const paneTop = await f.evaluate(() => document.getElementById('egatari-article').closest('.dx-body').getBoundingClientRect().top);
  ok(w && w.top <= paneTop + 20 && w.bottom < near.top - 72, `touch, a selection near the bottom: the window is docked at the top of the book's pane (${w && w.top}–${w && w.bottom}, pane top ${paneTop}, selection top ${near.top})`);
  await press(f, 'y'); await until(async () => (await sizes(f)).y === 1);
  await p.emulateMedia({ media: 'print' });
  ok(await f.evaluate(() => getComputedStyle(document.querySelector('[data-egatari-viewer=layer]')).display === 'none'), 'print: the markup layer is not printed (stage 1)');
  await p.emulateMedia({ media: 'screen' });
  ok(await f.evaluate(() => { const h = document.querySelector('[data-egatari-viewer=layer]'); const r = h.shadowRoot; const text = [...r.querySelectorAll('*:not(style)')].map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('')).join('');
    const s = getSelection(); s.selectAllChildren(h.parentElement); const copied = s.toString(); s.removeAllRanges(); s.selectAllChildren(document.getElementById('egatari-article')); const art = s.toString(); s.removeAllRanges();
    return h.textContent === '' && text === '' && copied.trim() === art.trim(); }), 'copy: the layer holds no text, so copying the book copies the book\'s text only');
  // cost: 2000 highlights (the cap) over the book, then a font change: the time of the redraw
  const N = 2000;
  const list = await f.evaluate((N) => {
    const a = document.getElementById('egatari-article'); const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('rt,rp,.katex-mathml') ? 2 : 1) });
    let s = '', n; while ((n = w.nextNode())) s += n.data;
    const out = []; const step = Math.max(1, Math.floor((s.length - 40) / N));
    for (let k = 0; out.length < N; k = (k + step) % (s.length - 40)) { const ex = s.slice(k + 8, k + 14); if (!ex.trim()) { k++; continue; } out.push({ id: 'h-' + String(out.length).padStart(6, '0'), color: 'ypb'[out.length % 3], target: { section: '', quote: { exact: ex, prefix: s.slice(k, k + 8), suffix: s.slice(k + 14, k + 22) } } }); }
    return out;
  }, N);
  await p.evaluate((list) => document.getElementById('lesson').contentWindow.postMessage({ egaViewer: 'markup-load', list, words: {}, view: { hidden: [], recall: false, recallColors: ['y', 'p', 'b'], bar: false } }, '*'), list);
  await until(async () => ((await sizes(f)).y + (await sizes(f)).p + (await sizes(f)).b) > 100, 15000);
  const times = [], layouts = [];
  for (const fs of ['22px', '26px', '20px']) { await f.evaluate((fs) => { document.getElementById('deck-text').style.fontSize = fs; document.querySelector('[data-egatari-viewer=layer]').removeAttribute('data-ms'); }, fs); await until(() => f.evaluate(() => document.querySelector('[data-egatari-viewer=layer]').hasAttribute('data-ms')), 5000); times.push(+(await f.evaluate(() => document.querySelector('[data-egatari-viewer=layer]').getAttribute('data-ms')))); }
  const placed = await f.evaluate(() => document.querySelector('[data-egatari-viewer=layer]').shadowRoot.querySelectorAll('.h').length);
  console.log(`  cost: ${N} highlights (${placed} boxes), redraw after a font change: ${times.join(' / ')} ms `);
  // only the highlights near the screen are drawn; scrolling far draws the ones there
  const before = await f.evaluate(() => [...document.querySelector('[data-egatari-viewer=layer]').shadowRoot.querySelectorAll('.h')].map((e) => e.getAttribute('data-id')));
  await f.evaluate(() => { const b = document.getElementById('egatari-article').closest('.dx-body'); b.scrollTop = b.scrollHeight; });
  await sleep(400);
  const after = await f.evaluate(() => { const r = document.querySelector('[data-egatari-viewer=layer]').shadowRoot; const vis = [...r.querySelectorAll('.h')].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; }); return { ids: [...r.querySelectorAll('.h')].map((e) => e.getAttribute('data-id')), visible: vis.length }; });
  ok(new Set(before).size < N && after.visible > 0 && after.ids.some((id) => !before.includes(id)), `only highlights near the screen are drawn (${new Set(before).size} of ${N}); scrolling to the end draws the ones there (${after.visible} boxes on screen)`);
  ok(Math.min(...times) < 50, `at the ${N} cap a redraw after a font change takes under 50 ms (${times.join(' / ')} ms)`);
  await c.close(); }

ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await browser.close(); srv.close();
console.log(fails ? `${fails} failed` : 'all ok'); console.log('work: ' + work);
process.exit(fails ? 1 : 0);
