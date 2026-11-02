// 本の窓の読むための道具（kit/panes.js。Player P2 Reading aids、v0.6.5 C）の確認：Chromium で
//   node tools/test-reading.mjs [作業フォルダ] [--shots]
// 章のある本（tools/fixtures/article-book）・横書きと縦書き（国語）の本・本のない教材（台本で読む）を組み、
// 目次（章と節、今の所の印、キー、戻る）・本の中の検索（要素をまたぐ・ルビ・縦書き・Ctrl+F・Esc）・相互参照の後の戻る（縦書き）・
// 前の続きから（この端末、一度だけの知らせ、最初から、# で開いたときと発表のときは使わない）・進み具合・
// 文字サイズと行間と背景（この端末に覚える、横にはみ出さない、スライドの色は変えない）・図の拡大・読み上げている話の強調
// --shots：作業フォルダに画面の PNG を残す（目で見る用）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-reading-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用の教材（架空の中身）
function build(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { encoding: 'utf8' });
  if (r.status !== 0 || /✗ article/.test(r.stderr + r.stdout)) { console.error(r.stdout, r.stderr); process.exit(1); }
  return path.join(dir, 'out', 'deck.html');
}
const SLIDES = [['s-ra2aaa', 'sec-ra2aaa', '春の朝'], ['s-ra3bbb', 'sec-ra3bbb', '夏の雨'], ['s-ra4ccc', 'sec-ra4ccc', '秋の夕'], ['s-ra5ddd', 'sec-ra5ddd', '冬の夜']];
const para = (n, w) => Array.from({ length: n }, (_, j) => `${w}の${j + 1}番目の段落。ここには読むための文が長く続く。光が差し、風が通り、言葉が少しずつ形を持ちはじめる。`).join('\n\n');
function makeDeck(name, { vertical = false, article = true, theme = 'default' } = {}) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="${theme}">
<head><meta charset="utf-8"><title>読む道具の試験</title></head>
<body>
<div id="stage">
${SLIDES.map(([id, sec, t]) => `<section class="slide" id="${id}"${article ? ` data-article="${sec}"` : ''}>
  <h2>${t}</h2>
  <div class="body"><p data-step="1">${t}の一つ目の点。</p></div>
</section>`).join('\n')}
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), SLIDES.map(([id, , t]) => `## ${t} {#${id}}
[0] ${t}について話します。
Novice: はい、${t}ですね。
[1] 一つ目の点です。
`).join('\n'));
  if (article) {
    fs.writeFileSync(path.join(dir, 'article.md'), `---
title: 季節の文章
${vertical ? 'writing-mode: vertical-rl\n' : ''}---

${SLIDES.map(([, sec, t]) => `(${sec})=
## ${t}

${para(5, t)}
`).join('\n')}`);
  }
  return build(dir);
}
const H = makeDeck('book-h');
const V = makeDeck('book-v', { vertical: true, theme: 'kokugo' });
const S = makeDeck('script', { article: false });
const bookDir = path.join(work, 'article-book');
fs.cpSync(path.join(ROOT, 'tools/fixtures/article-book'), bookDir, { recursive: true });
const B = build(bookDir);

const browser = await launch();
const errors = [];
async function open(file, { w = 1280, h = 720, q = '', ctx = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${path.basename(path.dirname(path.dirname(file)))}: ${e.message}`));
  await p.goto(fileUrl(file) + q);
  await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const st = (p) => p.evaluate(() => Object.assign(DECK.panes.state(), { i: DECK.state().slide - 1, k: DECK.state().step }));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(work, n + '.png') }); };
const wait = (p, ms) => p.waitForTimeout(ms);
const along = (p, sel) => p.evaluate((sel) => {
  const b = document.querySelector('#deck-text .dx-body'), e = document.querySelector(sel), br = b.getBoundingClientRect(), r = e.getBoundingClientRect();
  return b.classList.contains('dx-vertical') ? br.right - r.right : r.top - br.top;
}, sel);
const scrollPos = (p) => p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body'); return { top: b.scrollTop, left: b.scrollLeft }; });
async function readTo(p, sel) {
  await p.evaluate((sel) => {
    const b = document.querySelector('#deck-text .dx-body'), e = document.querySelector(sel), br = b.getBoundingClientRect(), r = e.getBoundingClientRect(), v = b.classList.contains('dx-vertical');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const d = (v ? br.right - r.right : r.top - br.top) - (v ? br.width : br.height) * .2;
    if (v) b.scrollLeft -= d; else b.scrollTop += d;
  }, sel);
  await wait(p, 250);
}
const active = (p) => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) + '|' + (a.textContent || '').trim().slice(0, 30) : ''; });

// ---------------------------------------------------------------- 1. 目次（章と節）・キー・戻る
{
  const p = await open(B, { q: '?layout=book' });
  await p.click('#deck-text .dx-toc');
  const items = await p.$$eval('#deck-toc .dx-ti', (bs) => bs.map((b) => ({ t: b.textContent, cur: b.getAttribute('aria-current'), lv: b.className })));
  ok(items.length === 7 && items[0].t === 'はじめに' && items[1].t.startsWith('第 1 章') && items[2].t.startsWith('1.1') && items[5].t.startsWith('A.1'),
    `contents lists chapters and sections (${items.map((x) => x.t).join(' / ')})`);
  ok(!items.some((x) => /だいひょうち/.test(x.t)), 'contents leaves out ruby readings');
  ok(items.filter((x) => x.cur === 'location').length === 1 && await p.evaluate(() => document.getElementById('deck-toc').getAttribute('role') === 'dialog' && document.activeElement.getAttribute('aria-current') === 'location'),
    'the current part is marked (aria-current) and focused');
  ok(await p.evaluate(() => { const c = getComputedStyle(document.querySelector('#deck-toc .dx-here')); return c.fontWeight >= 700 && c.borderLeftWidth === '3px'; }), 'the mark is bold with a rule (not colour alone)');
  ok((await p.getAttribute('#deck-text .dx-toc', 'aria-expanded')) === 'true', 'Contents says it is expanded');
  await shot(p, '01-toc');
  await p.keyboard.press('Escape');
  ok(!(await p.$('#deck-toc')) && (await active(p)).includes('dx-toc'), 'Esc closes the contents and focus returns to Contents');
  await p.click('#deck-text .dx-toc');
  await p.keyboard.press('End'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await wait(p, 300);
  ok((await along(p, '#sec-a4k2m7')) < 40 && (await active(p)).includes('A.1'), 'a contents entry (keys) jumps to the section and focuses its heading');
  ok(await p.isVisible('#deck-text .dx-back'), 'after a contents jump Back is offered');
  await p.click('#deck-text .dx-back'); await wait(p, 200);
  ok((await scrollPos(p)).top < 2 && (await active(p)).includes('dx-toc'), 'Back returns to where you were and to Contents');
  await p.context().close();
}
{
  const p = await open(V, { q: '?layout=book' });
  await p.click('#deck-text .dx-toc');
  ok((await p.$$('#deck-toc .dx-ti')).length === 4, 'vertical: contents lists the sections');
  await p.locator('#deck-toc .dx-ti').nth(2).click(); await wait(p, 300);
  const a = await along(p, '#sec-ra4ccc'), sp = await scrollPos(p);
  ok(a >= -1 && a < 40 && sp.left < 0, `vertical: a contents entry scrolls leftward to the section (${a}, ${sp.left})`);
  // 相互参照の後の戻る（縦書き）
  await p.evaluate(() => { const a = document.createElement('a'); a.href = '#sec-ra5ddd'; a.textContent = '冬へ'; a.id = 'xref-v'; document.querySelector('#sec-ra4ccc p').appendChild(a); });
  const before = (await scrollPos(p)).left;
  await p.click('#xref-v'); await wait(p, 200);
  ok((await along(p, '#sec-ra5ddd')) < 640, 'vertical: a cross-reference jumps (the last section, as far as the book scrolls)');
  await p.click('#deck-text .dx-back'); await wait(p, 200);
  ok(Math.abs((await scrollPos(p)).left - before) < 2 && (await active(p)).includes('冬へ'), 'vertical: Back returns to the link');
  await p.context().close();
}

// ---------------------------------------------------------------- 2. 本の中の検索
{
  const p = await open(B, { q: '?layout=book' });
  await p.keyboard.press('Control+f');
  ok(await p.evaluate(() => document.activeElement.type === 'search' && document.activeElement.getAttribute('aria-label') === '本の中を検索'), 'Ctrl+F opens the search box of the book, focused');
  await p.keyboard.type('中央値'); await wait(p, 300);
  let s = await st(p), cnt = await p.textContent('#deck-text .dx-count');
  ok(s.find && s.find.hits >= 2 && cnt === `1 / ${s.find.hits}`, `search finds the word (${cnt})`);
  ok(await p.evaluate(() => CSS.highlights.has('dx-find') && CSS.highlights.get('dx-find-cur').size === 1), 'results are highlighted, the current one apart');
  await p.keyboard.press('Enter'); await wait(p, 100);
  ok((await p.textContent('#deck-text .dx-count')) === `2 / ${s.find.hits}`, 'Enter goes to the next result');
  await p.keyboard.press('Shift+Enter'); await wait(p, 100);
  ok((await p.textContent('#deck-text .dx-count')) === `1 / ${s.find.hits}`, 'Shift+Enter goes back');
  await shot(p, '02-search');
  await p.fill('#deck-text .dx-findbar input', '引っぱられるが'); await wait(p, 300);
  ok((await st(p)).find.hits === 1, 'search matches across inline elements (<em>)');
  await p.fill('#deck-text .dx-findbar input', '代表値を１つ'); await wait(p, 300);
  ok((await st(p)).find.hits === 1, 'search reads ruby bases, ignores spaces and folds full-width digits');
  await p.fill('#deck-text .dx-findbar input', 'ない言葉のならび'); await wait(p, 300);
  ok((await p.textContent('#deck-text .dx-count')) === '見つかりません' && (await p.getAttribute('#deck-text .dx-count', 'role')) === 'status', 'no result says 見つかりません (status)');
  await p.keyboard.press('Escape');
  ok(!(await st(p)).find && (await active(p)).includes('dx-find') && await p.evaluate(() => !CSS.highlights.has('dx-find')), 'Esc closes the search, clears it and returns focus');
  await p.context().close();
}
{
  const p = await open(V, { q: '?layout=split' });
  await p.click('#deck-text .dx-find');
  await p.keyboard.type('冬の夜の4番目'); await wait(p, 400);
  const r = await p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body').getBoundingClientRect(), q = [...CSS.highlights.get('dx-find-cur')][0].getBoundingClientRect(); return { inside: q.left >= b.left && q.right <= b.right, left: document.querySelector('#deck-text .dx-body').scrollLeft }; });
  const s = await st(p);
  ok(s.find.hits === 1 && r.inside && r.left < -500, `vertical: search scrolls leftward to a result at the end of the book (${r.left})`);
  ok(s.i === 3, `vertical: the slides follow the found place (slide ${s.i + 1})`);
  await shot(p, '02-search-vertical');
  await p.context().close();
}

// ---------------------------------------------------------------- 3. 前の続きから（この端末）
for (const [name, file] of [['horizontal', H], ['vertical', V]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let p = await open(file, { ctx, q: '?layout=book' });
  ok(!(await st(p)).resumed, `${name}: the first opening has no notice`);
  await readTo(p, '#sec-ra4ccc');
  await p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (b.classList.contains('dx-vertical')) b.scrollLeft -= 120; else b.scrollTop += 120; });
  await wait(p, 700);
  const a0 = await along(p, '#sec-ra4ccc');
  await p.close();
  p = await open(file, { ctx, q: '?layout=book' });
  await wait(p, 100);
  let s = await st(p);
  const a1 = await along(p, '#sec-ra4ccc');
  ok(s.i === 2 && Math.abs(a1 - a0) < 4, `${name}: reopening continues where you left off (slide ${s.i + 1}, ${a0} → ${a1})`);
  ok(s.resumed && (await p.textContent('#deck-resume')).includes('前の続きから') && (await p.getAttribute('#deck-resume', 'role')) === 'status', `${name}: a one-time notice 前の続きから`);
  await shot(p, `03-${name}-resume`);
  await p.click('#deck-resume button:has-text("最初から")'); await wait(p, 600);
  s = await st(p);
  const sp = await scrollPos(p);
  ok(s.i === 0 && sp.top === 0 && sp.left === 0 && !s.resumed, `${name}: 最初から goes to the beginning`);
  await p.close();
  p = await open(file, { ctx, q: '?layout=book' });
  ok(!(await st(p)).resumed && (await st(p)).i === 0, `${name}: after 最初から there is nothing to continue`);
  await readTo(p, '#sec-ra3bbb'); await wait(p, 700);
  await p.close();
  p = await open(file, { ctx, q: '?layout=book#s-ra5ddd' });
  ok((await st(p)).i === 3 && !(await st(p)).resumed, `${name}: opening at a # place does not continue`);
  await p.close();
  if (name === 'horizontal') {
    p = await open(file, { ctx, q: '?layout=slides' });
    ok((await st(p)).i === 0 && !(await st(p)).resumed, 'opening on the slides (a talk) does not continue');
    await p.close();
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 4. 進み具合
for (const [name, file] of [['horizontal', H], ['vertical', V]]) {
  const p = await open(file, { q: '?layout=book' });
  ok((await st(p)).progress === 0 && (await p.getAttribute('#deck-text .dx-prog', 'role')) === 'progressbar', `${name}: progress starts at 0 (a progressbar)`);
  await p.keyboard.press('End'); await wait(p, 400);
  ok((await st(p)).progress === 100 && (await p.getAttribute('#deck-text .dx-prog', 'aria-valuetext')) === '100%', `${name}: progress at the end is 100%`);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#deck-text .dx-prog>span')).transformOrigin.startsWith(document.querySelector('.dx-vertical') ? '1' : '0')), `${name}: the bar grows in the reading direction`);
  ok(!(await p.evaluate(() => document.body.innerText.match(/\d+\s*\/\s*\d+\s*(ページ|page)/))), `${name}: no page numbers`);
  await p.context().close();
}

// ---------------------------------------------------------------- 5. 文字サイズ・行間・背景（この端末）
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let p = await open(H, { ctx, q: '?layout=split' });
  const stageBg = await p.evaluate(() => getComputedStyle(DECK.slides[0]).backgroundColor);
  await readTo(p, '#sec-ra3bbb');
  const a0 = await along(p, '#sec-ra3bbb');
  await p.click('#deck-text .dx-text');
  ok(await p.evaluate(() => document.getElementById('deck-reading').getAttribute('role') === 'dialog' && document.activeElement.getAttribute('aria-label') === '文字を小さく'), 'Text and background opens with focus on Smaller text');
  await p.click('#deck-reading button[aria-label="文字を大きく"]'); await p.click('#deck-reading button[aria-label="文字を大きく"]');
  let s = await st(p);
  ok(s.reading.size === 1.3 && (await p.evaluate(() => getComputedStyle(document.getElementById('egatari-article')).fontSize)) === '23.4px' && (await p.textContent('#deck-reading output')) === '130%', 'larger text: 130% reflows the book');
  ok(Math.abs((await along(p, '#sec-ra3bbb')) - a0) < 30, 'the place being read stays in view when the size changes');
  ok(await p.evaluate(() => Math.abs(document.getElementById('stage').getBoundingClientRect().width - document.getElementById('deck-split').getBoundingClientRect().left) < 2), 'the slides keep their size');
  for (let j = 0; j < 6; j++) await p.click('#deck-reading button[aria-label="文字を小さく"]', { force: true });
  ok((await st(p)).reading.size === .85 && await p.evaluate(() => document.querySelector('#deck-reading button[aria-label="文字を小さく"]').disabled), `at least three steps: the smallest of ${6} is 85%`);
  await p.check('#deck-reading input[value=wide]');
  ok(await p.evaluate(() => { const c = getComputedStyle(document.getElementById('egatari-article')); return Math.abs(parseFloat(c.lineHeight) / parseFloat(c.fontSize) - 2.3) < .01; }), 'line spacing Wide');
  await p.focus('#deck-reading input[value=white]'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  s = await st(p);
  ok(s.reading.bg === 'black' && await p.evaluate(() => getComputedStyle(document.getElementById('deck-text')).backgroundColor === 'rgb(0, 0, 0)' && getComputedStyle(document.getElementById('egatari-article')).color !== 'rgb(0, 0, 0)'),
    'background Black (keys on the radio buttons) for the book pane');
  ok((await p.evaluate(() => getComputedStyle(DECK.slides[0]).backgroundColor)) === stageBg, 'the slides keep the theme colours');
  ok((await p.$$eval('#deck-reading .dx-opt', (ls) => ls.map((l) => l.textContent).join(','))) === '標準,広い,白,セピア,黒', 'the choices are named in words (not colour alone)');
  await shot(p, '05-black-wide');
  await p.keyboard.press('Escape');
  ok(!(await p.$('#deck-reading')) && (await active(p)).includes('dx-text'), 'Esc closes and returns focus');
  await p.close();
  p = await open(V, { ctx, q: '?layout=book' });
  s = await st(p);
  ok(s.reading.size === .85 && s.reading.lh === 'wide' && s.reading.bg === 'black', 'the choices are remembered on this device, for every lesson');
  ok(await p.evaluate(() => Object.keys(localStorage).filter((k) => /-player-read-/.test(k)).length === 3), 'the choices are kept in this browser (localStorage), not in the file');
  await shot(p, '05-v-black');
  await p.click('#deck-text .dx-text');
  await p.check('#deck-reading input[value=sepia]');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('deck-text')).backgroundColor === 'rgb(246, 238, 219)'), 'background Sepia');
  for (let j = 0; j < 6; j++) await p.click('#deck-reading button[aria-label="文字を大きく"]', { force: true });
  ok((await st(p)).reading.size === 1.75, 'vertical: the largest size');
  await shot(p, '05-v-sepia-large');
  await p.close();
  // スマートフォン：いちばん大きくしても横にはみ出さない
  const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 844 });
  await ph.goto(fileUrl(B) + '?layout=book'); await ph.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  ok((await st(ph)).reading.size === 1.75 && await ph.evaluate(() => { const b = document.querySelector('#deck-text .dx-body'); return b.scrollWidth <= b.clientWidth + 1; }), 'phone: the largest size has no horizontal scrolling');
  ok(await ph.evaluate(() => [...document.querySelectorAll('#deck-text .dx-head button')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1 && (b.getAttribute('aria-label') || b.textContent).trim())), 'phone: the head buttons fit and keep their names');
  await shot(ph, '05-phone');
  await ctx.close();
}

// ---------------------------------------------------------------- 6. 図の拡大
{
  const p = await open(B, { q: '?layout=book' });
  const img = '#deck-text figure.egatari-figure img';
  ok((await p.getAttribute(img, 'role')) === 'button' && (await p.getAttribute(img, 'aria-label')).startsWith('拡大：'), 'a figure is a button named 拡大：…');
  const w0 = await p.evaluate((s) => document.querySelector(s).getBoundingClientRect().width, img);
  await p.focus(img); await p.keyboard.press('Enter'); await wait(p, 200);
  let s = await st(p);
  const big = await p.evaluate(() => { const i = document.querySelector('#deck-fig .dx-figimg').getBoundingClientRect(); return { w: i.width, h: i.height }; });
  ok(s.figure && big.w > w0 * 1.3 && big.h <= 720, `Enter enlarges the figure (${Math.round(w0)} → ${Math.round(big.w)} px)`);
  ok(await p.evaluate(() => { const d = document.querySelector('#deck-fig [role=dialog]'); return d.contains(document.activeElement) && document.getElementById(d.getAttribute('aria-labelledby')).textContent.includes('図 1.1') && document.getElementById('deck-text').inert; }), 'focus moves into the named dialog, the book is inert');
  await shot(p, '06-figure');
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement.closest('#deck-fig')), 'Tab stays inside');
  await p.keyboard.press('Escape');
  ok(!(await st(p)).figure && (await active(p)).includes('dx-zoom') && !(await p.evaluate(() => document.getElementById('deck-text').inert)), 'Esc closes and returns focus to the figure');
  ok(await p.evaluate(() => document.getElementById('stage').inert), 'the slides stay inert in the book layout');
  await p.click(img); await wait(p, 200);
  await p.mouse.click(5, 5); await wait(p, 100);
  ok(!(await st(p)).figure, 'a click enlarges, a click outside closes');
  await p.context().close();
}

// ---------------------------------------------------------------- 7. 読み上げている話の強調（台本で読む）
{
  const p = await open(S, { q: '?layout=split' });
  const s = await p.evaluate(() => DECK.panes.state());
  ok(!s.find && (await p.getAttribute('#deck-text .dx-findbar input', 'aria-label')) === '台本の中を検索', 'without a book the search box searches the script');
  ok((await p.$$('#deck-text .dx-say')).length === 0, 'no turn is highlighted outside playback');
  await p.evaluate(() => DECK.autoplay(true)); await wait(p, 200);
  ok(await p.evaluate(() => { const x = document.querySelector('#deck-text .dx-say'); return !!x && x.closest('.dx-step').classList.contains('dx-cur'); }), 'during playback the turn being read is highlighted in the current step');
  await shot(p, '07-turn');
  await p.evaluate(() => DECK.autoplay(false)); await wait(p, 100);
  ok((await p.$$('#deck-text .dx-say')).length === 0, 'stopping playback removes the highlight');
  await p.click('#deck-text .dx-toc');
  ok((await p.$$eval('#deck-toc .dx-ti', (bs) => bs.map((b) => b.textContent))).join(',') === '1 春の朝,2 夏の雨,3 秋の夕,4 冬の夜', 'without a book the contents lists the slide titles');
  await p.context().close();
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
