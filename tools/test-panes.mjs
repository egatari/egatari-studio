// 窓（ペイン）の並べ方と同期（kit/panes.js。Player P2、format spec §9C.5・§9C.10）の確認：Chromium で
//   node tools/test-panes.mjs [作業フォルダ] [--shots]
// 横書きの本・縦書きの本（国語）・本のない教材（台本で読む）を組み、
// 並べ方（スライド・スライドと本・本）と r・?layout=・この端末に覚えること・埋め込みの layout、位置を保つこと、
// 舞台 → 本（見えていれば動かさない）と本 → 舞台（スクロール。縦書きも）、今の所の印（左の線と aria-current）、
// 再生中のスクロールで離れること・「再生中の所に戻る」・再生を始め直すと付いていくこと、仕切り（←→・ダブルクリック・覚える）、
// 「本で読む」と「戻る」、「スライドで見る」の重ね（フォーカス・←→・Esc・読んでいた所へ戻る）、台本で読むのスクロールで動くこと、動きを減らす設定
// --shots：作業フォルダに画面の PNG を残す（目で見る用）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-panes-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用の教材（架空の中身）
const SLIDES = [['s-pa2aaa', 'sec-pa2aaa', '春の朝'], ['s-pa3bbb', 'sec-pa3bbb', '夏の雨'], ['s-pa4ccc', 'sec-pa4ccc', '秋の夕'], ['s-pa5ddd', 'sec-pa5ddd', '冬の夜']];
const para = (n, w) => Array.from({ length: n }, (_, j) => `${w}の${j + 1}番目の段落。ここには読むための文が長く続く。光が差し、風が通り、言葉が少しずつ形を持ちはじめる。読み手はその変化を一つずつ確かめながら先へ進む。`).join('\n\n');
function makeDeck(name, { vertical = false, article = true, theme = 'default' } = {}) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  const slides = SLIDES.map(([id, sec, t], j) => `<section class="slide" id="${id}"${article && j !== 3 ? ` data-article="${sec}"` : ''}>
  <h2>${t}</h2>
  <div class="body">
    <p data-step="1">${t}の一つ目の点。</p>
    <p data-step="2">${t}の二つ目の点。</p>
  </div>
</section>`).join('\n');
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="${theme}">
<head><meta charset="utf-8"><title>窓の試験</title></head>
<body>
<div id="stage">
${slides}
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), SLIDES.map(([id, , t]) => `## ${t} {#${id}}
[0] ${t}について話します。${para(1, t)}
[1] 一つ目の点です。${para(1, t + '一')}
[2] 二つ目の点です。${para(1, t + '二')}
`).join('\n'));
  if (article) {
    // 4 節目（冬の夜）はスライドとつながない（data-article なし）。2 節目の中に同じスライドのステップ 2 へのリンク
    fs.writeFileSync(path.join(dir, 'article.md'), `---
title: 季節の文章
${vertical ? 'writing-mode: vertical-rl\n' : ''}---

はじめに。${para(1, '序')}

${SLIDES.map(([id, sec, t], j) => `(${sec})=
## ${t}

${para(j === 1 ? 2 : 4, t)}
${j === 1 ? `\nここで{step}\`${id}:2\`を見る。\n\n${para(3, t + '後')}\n` : ''}`).join('\n')}`);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  if (/✗ article/.test(r.stderr + r.stdout)) { console.error(r.stdout, r.stderr); process.exit(1); }
  return path.join(dir, 'out', 'deck.html');
}

const H = makeDeck('book-h');
const V = makeDeck('book-v', { vertical: true, theme: 'kokugo' });
const S = makeDeck('script', { article: false });

const browser = await launch();
const errors = [];
async function open(file, { w = 1280, h = 720, q = '', reduce = false, ctx = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${path.basename(path.dirname(path.dirname(file)))}: ${e.message}`));
  await p.goto(fileUrl(file) + q);
  await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const st = (p) => p.evaluate(() => Object.assign(DECK.panes.state(), { i: DECK.state().slide - 1, k: DECK.state().step }));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(work, n + '.png') }); };
// 待つ：少なくとも ms（何も起きないことを確かめる窓）。そのうえで、本の窓のスクロールが止まり（3 こま続けて同じ位置）、描画がもう 2 こま進むまで。
// 滑らかなスクロール（kit/panes.js の scrollToEl）は遅い runner（macOS の CI）で 900 ms を超え、動いている途中の位置を基準にして
// 「同じ節のステップでは本は動かない」が落ちた。スクロールの後の付いていく処理（scrolled）も次のこまで走るので、読む前にそれを待つ
const wait = async (p, ms) => {
  await p.waitForTimeout(ms);
  await p.evaluate(() => new Promise((res) => {
    const b = document.querySelector('#deck-text .dx-body');
    let last = null, same = 0, n = 0;
    const tick = () => {
      const now = b ? b.scrollTop + ',' + b.scrollLeft : '';
      same = now === last ? same + 1 : 0; last = now; n++;
      if (same >= 3 && n >= 2) requestAnimationFrame(() => requestAnimationFrame(() => res(true))); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => res(false), 15000);   // 止まらないスクロールでも待ち続けない（後の確かめが落ちる）
  }));
};
// 本の窓の中で、ある要素の読み進める向きの位置（窓の初めから。横は上から、縦は右から）
const along = (p, sel) => p.evaluate((sel) => {
  const b = document.querySelector('#deck-text .dx-body'), e = document.querySelector(sel), br = b.getBoundingClientRect(), r = e.getBoundingClientRect();
  return b.classList.contains('dx-vertical') ? br.right - r.right : r.top - br.top;
}, sel);


const pane = (p, f) => p.evaluate(f);
const scrollPos = (p) => p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body'); return {top: b.scrollTop, left: b.scrollLeft}; });
// 本の窓の真ん中でホイール（見る人のスクロール）
async function wheel(p, dy) {
  const r = await p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body').getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2}; });
  await p.mouse.move(r.x, r.y); await p.mouse.wheel(0, dy); await wait(p, 250);
}
// 節が読み進める線（窓の 4 分の 1）を少し越えるまで、見る人がスクロールしたことにする
// at：動いた先の [i, k]（あれば、固定の時間ではなくそこへ動くまで待ち、その場で戻る。入るときの動きの途中を確かめるところ）
async function readTo(p, sel, at = null) {
  await p.evaluate((sel) => {
    const b = document.querySelector('#deck-text .dx-body'), e = document.querySelector(sel), br = b.getBoundingClientRect(), r = e.getBoundingClientRect(), v = b.classList.contains('dx-vertical');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    const d = (v ? br.right - r.right : r.top - br.top) - (v ? br.width : br.height) * .2;
    if (v) b.scrollLeft -= d; else b.scrollTop += d;
  }, sel);
  if (at) await p.waitForFunction(([i, k]) => DECK.state().slide - 1 === i && DECK.state().step === k, at, { timeout: scaled(10000) }).catch(() => {});
  else await wait(p, 250);
}
const markColor = (p) => p.evaluate(() => { const m = document.querySelector('#deck-text .dx-cur'); if (!m) return null; const c = getComputedStyle(m); return {left: c.borderLeftColor, top: c.borderTopColor, lw: c.borderLeftWidth, tw: c.borderTopWidth, aria: m.getAttribute('aria-current')}; });

// ---------------------------------------------------------------- 1. 並べ方と開いたときの並べ方（Player P2 Defaults・優先の順）
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let p = await open(H, { ctx });
  ok((await st(p)).layout === 'slides', 'talk opens on slides');
  ok(await p.evaluate(() => !!document.querySelector('#dt-cb [data-b="view"]')), 'the toolbar has the View button (r)');
  await p.evaluate(() => DECK.go(2, 1));
  await p.keyboard.press('r'); ok((await st(p)).layout === 'split', 'r: slides → slides and book');
  await shot(p, '01-h-split');
  await p.keyboard.press('r'); ok((await st(p)).layout === 'book', 'r: → book');
  let s1 = await st(p); ok(s1.i === 2 && s1.k === 1, 'switching layout keeps the position (slide 3, step 1)');
  await p.keyboard.press('r'); ok((await st(p)).layout === 'slides', 'r: → slides');
  await p.keyboard.press('r'); await p.keyboard.press('r');
  await p.close();
  p = await open(H, { ctx });
  ok((await st(p)).layout === 'book', 'the chosen layout is remembered on this device');
  await p.close();
  p = await open(H, { ctx, q: '?layout=slides' });
  ok((await st(p)).layout === 'slides', '?layout= wins over the remembered choice');
  await p.close(); await ctx.close();
  for (const [q, want] of [['?layout=split', 'split'], ['?layout=flow', 'book'], ['?layout=pages', 'book']]) {
    const x = await open(H, { q }); ok((await st(x)).layout === want, `${q} opens ${want}`); await x.context().close();
  }
  const n = await open(H, { q: '?layout=split', w: 420, h: 800 });
  ok((await st(n)).layout === 'book', 'narrow screen: slides and book falls back to the book alone');
  ok(await n.evaluate(() => { DECK.panes.menu(document.querySelector('#deck-text .dx-view')); const t = [...document.querySelectorAll('#deck-layouts [role=menuitemradio]')].map((e) => e.textContent); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); return t.length === 2; }), 'narrow screen: the View menu has no Slides and book');
  await n.context().close();
  // offer.open と metadata.primary（deck-meta に書いたもの）
  const html = fs.readFileSync(H, 'utf8');
  const prim = path.join(path.dirname(H), 'primary.html'), offer = path.join(path.dirname(H), 'offer.html');
  fs.writeFileSync(prim, html.replace(/(<script type="application\/json" id="deck-meta">)\{/, '$1{"primary":"read",'));
  fs.writeFileSync(offer, html.replace(/(<script type="application\/json" id="deck-meta">)\{/, '$1{"primary":"read","offer":{"open":{"mode":"talk","face":"talk"}},'));
  const a = await open(prim); ok((await st(a)).layout === 'book', 'metadata.primary "read" opens in the book'); await a.context().close();
  const b = await open(offer); ok((await st(b)).layout === 'slides', 'offer.open wins over metadata.primary'); await b.context().close();
  // 埋め込み（Player P8）：?embed=1&layout=split、{egatari:"layout"} と答え
  const host = path.join(work, 'host.html');
  fs.writeFileSync(host, `<!DOCTYPE html><meta charset="utf-8"><iframe id="f" style="width:1200px;height:680px;border:0" src="${fileUrl(H)}?embed=1&layout=split"></iframe>
<script>window.got=[];addEventListener('message',e=>{if(e.data&&e.data.egatari==='layout')got.push(e.data)})</script>`);
  const hc = await browser.newContext({ viewport: { width: 1280, height: 720 } }), hp = await hc.newPage();
  await hp.goto(fileUrl(host));
  const fr = hp.frames().find((f) => f.url().includes('embed=1'));
  await fr.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  ok((await fr.evaluate(() => DECK.panes.state().layout)) === 'split', 'embedded: ?layout=split');
  await hp.evaluate(() => document.getElementById('f').contentWindow.postMessage({egatari: 'layout', id: 7, layout: 'flow'}, '*'));
  await hp.waitForFunction(() => window.got.length > 0);
  ok((await fr.evaluate(() => DECK.panes.state().layout)) === 'book' && (await hp.evaluate(() => JSON.stringify(window.got[0]))) === '{"egatari":"layout","id":7,"layout":"flow"}', 'embedded: {egatari:"layout"} switches and answers with the id');
  await hc.close();
}

// ---------------------------------------------------------------- 2. 同期（横書き、スライドと本）
{
  const p = await open(H, { q: '?layout=split' });
  ok((await st(p)).marked === 'sec-pa2aaa', 'the current section is marked');
  const mc = await markColor(p);
  ok(mc && mc.aria === 'location' && mc.lw === '4px' && !/rgba\(0, 0, 0, 0\)/.test(mc.left), 'the mark is a 4px left rule (not colour alone) with aria-current');
  await p.evaluate(() => DECK.go(2, 0));
  await wait(p, 900);
  let s2 = await st(p);
  ok(s2.marked === 'sec-pa4ccc' && (await along(p, '#sec-pa4ccc')) >= -1 && (await along(p, '#sec-pa4ccc')) < 400, 'moving the slides scrolls the book to the section of the slide');
  const top0 = (await scrollPos(p)).top;
  await p.evaluate(() => DECK.go(2, 1)); await wait(p, 600);
  ok((await scrollPos(p)).top === top0, 'a step on the same section does not scroll the book (the part is visible)');
  // 本 → 舞台
  await readTo(p, '#sec-pa3bbb');
  s2 = await st(p);
  ok(s2.i === 1 && s2.k === 0 && s2.marked === 'sec-pa3bbb', `scrolling the book moves the slides to the slide of the section, step 0 (got ${s2.i}:${s2.k})`);
  await readTo(p, '#deck-text a[data-egatari-step]');
  s2 = await st(p);
  ok(s2.i === 1 && s2.k === 2, `passing a step link in the section moves the slides to that step (got ${s2.i}:${s2.k})`);
  await readTo(p, '#sec-pa5ddd');
  s2 = await st(p);
  ok(s2.i === 1 && s2.k === 2, 'a section linked to no slide leaves the slides where they are');
  // 本の中のステップのリンク（横並び）：舞台をその所へ。重ねない
  await p.evaluate(() => DECK.go(0, 0)); await wait(p, 700);
  await p.evaluate(() => document.querySelector('#deck-text a[data-egatari-step]').click());
  s2 = await st(p);
  ok(s2.i === 1 && s2.k === 2 && !s2.overlay, 'a step link in Slides and book moves the slides (no overlay)');
  // 本の中の参照：その所へ、「戻る」
  const back0 = (await scrollPos(p)).top;
  await p.evaluate(() => { const a = document.createElement('a'); a.href = '#sec-pa5ddd'; a.textContent = 'x'; a.id = 'xref-test'; document.querySelector('#sec-pa2aaa p').appendChild(a); });
  await p.evaluate(() => { document.querySelector('#deck-text .dx-body').scrollTop = 0; });
  await wait(p, 200);
  const before = (await scrollPos(p)).top;
  await p.click('#xref-test');
  await wait(p, 200);
  ok((await along(p, '#sec-pa5ddd')) < 40 && await p.isVisible('#deck-text .dx-back'), 'a cross-reference scrolls the book to its target and offers Back');
  await p.click('#deck-text .dx-back'); await wait(p, 200);
  ok(Math.abs((await scrollPos(p)).top - before) < 2 && !(await p.isVisible('#deck-text .dx-back')), 'Back returns to the link');
  void back0;
  // 仕切り
  const r0 = (await st(p)).ratio;
  ok(Math.abs(r0 - Math.min(.6, 720 * 16 / 9 / 1280)) < .01, `the stage starts full height up to 60% of the width (${r0.toFixed(3)})`);
  await p.focus('#deck-split'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  const r1 = (await st(p)).ratio;
  ok(Math.abs(r1 - (r0 - .04)) < .01, 'the divider moves with ←/→');
  ok(await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(), d = document.getElementById('deck-split').getBoundingClientRect(); return s.right <= d.left + 1 && Math.abs(s.width / s.height - 16 / 9) < .02; }), 'the stage fits left of the divider');
  const box = await p.evaluate(() => { const r = document.getElementById('deck-split').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + 300}; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(100, box.y, { steps: 4 }); await p.mouse.up();
  ok(Math.abs((await st(p)).ratio - 280 / 1280) < .01, 'dragging stops at the minimum width of the slides');
  await p.reload(); await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  ok(Math.abs((await st(p)).ratio - 280 / 1280) < .01, 'the divider position is remembered on this device');
  await p.dblclick('#deck-split');
  ok(Math.abs((await st(p)).ratio - r0) < .01, 'double-click resets the divider');
  ok(await p.evaluate(() => { const d = document.getElementById('deck-split'); return d.getAttribute('role') === 'separator' && +d.getAttribute('aria-valuenow') > 0 && d.getAttribute('aria-label') === 'スライドと本の境目'; }), 'the divider is a separator named スライドと本の境目 with a value');
  await p.context().close();
}

// ---------------------------------------------------------------- 3. 縦書き（国語）：同期とスクロールの向き
{
  const p = await open(V, { q: '?layout=split' });
  let s3 = await st(p);
  ok(s3.vertical && s3.marked === 'sec-pa2aaa', 'vertical book: the article is vertical and the section is marked');
  const mc = await markColor(p);
  ok(mc && mc.tw === '4px' && !/rgba\(0, 0, 0, 0\)/.test(mc.top), 'vertical: the mark is the rule at the line start (top)');
  ok((await scrollPos(p)).left === 0, 'vertical: the book opens at its right edge');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#sec-pa2aaa h2 .egatari-num .egatari-tcy')).textCombineUpright === 'all'), 'vertical: the section number in the heading is upright (§9C.6)');
  await shot(p, '03-v-split');
  await p.evaluate(() => DECK.go(2, 0)); await wait(p, 900);
  const a3 = await along(p, '#sec-pa4ccc');
  ok(a3 >= -1 && a3 < 300 && (await scrollPos(p)).left < 0, `vertical: moving the slides scrolls the book leftward to the section (${a3})`);
  await shot(p, '03-v-follow');
  // ホイール（縦の向き）で左へ進み、舞台が付いてくる
  await p.evaluate(() => DECK.go(0, 0)); await wait(p, 900);
  const l0 = (await scrollPos(p)).left;
  for (let j = 0; j < 6; j++) await wheel(p, 300);
  const l1 = (await scrollPos(p)).left;
  s3 = await st(p);
  ok(l1 < l0 - 1000, `vertical: the mouse wheel moves the book leftward (${l0} → ${l1})`);
  ok(s3.i > 0, `vertical: scrolling the book moves the slides (slide ${s3.i + 1})`);
  await readTo(p, '#sec-pa3bbb');
  s3 = await st(p);
  ok(s3.i === 1 && s3.k === 0, `vertical: reading the second section shows its slide (got ${s3.i}:${s3.k})`);
  await readTo(p, '#deck-text a[data-egatari-step]');
  s3 = await st(p);
  ok(s3.i === 1 && s3.k === 2, `vertical: passing the step link shows that step (got ${s3.i}:${s3.k})`);
  // 本だけ：キーの向き
  await p.evaluate(() => DECK.panes.layout('book'));
  await p.evaluate(() => { document.querySelector('#deck-text .dx-body').scrollLeft = 0; });
  await wait(p, 200);
  const k0 = (await scrollPos(p)).left;
  await p.keyboard.press('PageDown'); await wait(p, 700);
  const k1 = (await scrollPos(p)).left;
  await p.keyboard.press('ArrowLeft'); await wait(p, 500);
  const k2 = (await scrollPos(p)).left;
  await p.keyboard.press('ArrowRight'); await wait(p, 500);
  const k3 = (await scrollPos(p)).left;
  ok(k1 < k0 - 300 && k2 < k1 && k3 > k2, `vertical book: PageDown and ← go forward (left), → goes back (${k0} → ${k1} → ${k2} → ${k3})`);
  await p.keyboard.press('End'); await wait(p, 300);
  ok((await scrollPos(p)).left < k2, 'vertical book: End goes to the last page (leftmost)');
  await p.keyboard.press('Home'); await wait(p, 300);
  ok((await scrollPos(p)).left === 0, 'vertical book: Home goes back to the start');
  await shot(p, '03-v-book');
  await p.context().close();
}

// ---------------------------------------------------------------- 4. 再生中に離れる・「再生中の所に戻る」（Player P2 MUST）
for (const [name, file] of [['horizontal', H], ['vertical', V]]) {
  const p = await open(file, { q: '?layout=split' });
  await p.evaluate(() => DECK.autoplay(true));
  await p.waitForFunction(() => DECK.state().slide >= 2, null, { timeout: scaled(15000) });
  let s4 = await st(p);
  ok(s4.playing && !s4.detached && s4.marked === 'sec-pa3bbb', `${name}: during playback the book follows`);
  await wheel(p, name === 'vertical' ? -600 : -600);
  s4 = await st(p);
  const pos = s4.i * 10 + s4.k;
  ok(s4.detached && s4.playing && await p.isVisible('#deck-backplay'), `${name}: scrolling during playback stops following, playback goes on, Back to the playing part is shown`);
  ok((await p.textContent('#deck-backplay')).includes('再生中の所に戻る'), `${name}: the button says 再生中の所に戻る`);
  const sp = await scrollPos(p);
  await p.waitForFunction((pos) => DECK.state().slide >= 3 || (DECK.state().slide - 1) * 10 + DECK.state().step > pos, pos, { timeout: scaled(15000) });
  await p.waitForFunction(() => DECK.state().slide >= 3, null, { timeout: scaled(15000) });
  const sp2 = await scrollPos(p);
  ok(sp2.top === sp.top && sp2.left === sp.left, `${name}: while detached the book stays where the viewer put it (${JSON.stringify(sp)} ${JSON.stringify(sp2)})`);
  await shot(p, `04-${name}-detached`);
  await p.click('#deck-backplay'); await wait(p, 1000);
  s4 = await st(p);
  ok(!s4.detached && !(await p.isVisible('#deck-backplay')) && s4.marked === 'sec-pa4ccc' && await p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body').getBoundingClientRect(), r = document.querySelector('#sec-pa4ccc').getBoundingClientRect(); return document.querySelector('#deck-text .dx-body').classList.contains('dx-vertical') ? r.right > b.left && r.left < b.right : r.bottom > b.top && r.top < b.bottom; }),
    `${name}: Back to the playing part returns to the playing section and follows again`);
  await wheel(p, -400);
  ok((await st(p)).detached, `${name}: detached again`);
  await p.evaluate(() => { DECK.autoplay(false); DECK.autoplay(true); }); await wait(p, 200);
  ok(!(await st(p)).detached, `${name}: starting playback again resumes following`);
  await p.evaluate(() => DECK.autoplay(false));
  await p.context().close();
}

// ---------------------------------------------------------------- 5. スライドで見る（本だけ）：重ね・フォーカス・←→・Esc・読んでいた所
for (const [name, file] of [['horizontal', H], ['vertical', V]]) {
  const p = await open(file, { q: '?layout=book' });
  await readTo(p, '#sec-pa3bbb'); await wait(p, 300);
  const sp = await scrollPos(p);
  await p.focus('#sec-pa3bbb .dx-watch');
  await p.keyboard.press('Enter'); await wait(p, 300);
  let s5 = await st(p);
  ok(s5.overlay && s5.i === 1 && s5.k === 0, `${name}: Watch on slides opens the slide over the book at its step`);
  ok(await p.evaluate(() => { const a = document.activeElement; return !!a.closest('#deck-ov') && a.getAttribute('role') === 'dialog' && !!document.getElementById(a.getAttribute('aria-labelledby')).textContent.includes('スライドで見る'); }), `${name}: focus moves into the overlay (a named dialog)`);
  ok(await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return Math.abs(s.width - innerWidth * .8) < 3 || Math.abs(s.height - innerHeight * .8) < 3; }), `${name}: the slide takes about 80% of the screen`);
  ok(await p.evaluate(() => document.getElementById('deck-text').inert), `${name}: the book is inert behind the overlay`);
  await shot(p, `05-${name}-overlay`);
  await p.keyboard.press('ArrowRight'); await wait(p, 200);
  ok((await st(p)).k === 1, `${name}: → steps forward inside the overlay`);
  await p.keyboard.press('ArrowLeft'); await wait(p, 200);
  ok((await st(p)).k === 0, `${name}: ← steps back inside the overlay`);
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement.closest('#deck-ov')), `${name}: Tab stays inside the overlay`);
  await p.keyboard.press('Escape'); await wait(p, 200);
  s5 = await st(p);
  const sp2 = await scrollPos(p);
  ok(!s5.overlay && Math.abs(sp2.top - sp.top) < 2 && Math.abs(sp2.left - sp.left) < 2, `${name}: Esc closes and returns to the reading position`);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('dx-watch')), `${name}: focus returns to the button`);
  // 本の中のステップのリンク：重ねて、そのステップ
  await p.evaluate(() => document.querySelector('#deck-text a[data-egatari-step]').click()); await wait(p, 200);
  s5 = await st(p);
  ok(s5.overlay && s5.i === 1 && s5.k === 2, `${name}: a step link in the book overlays that step`);
  await p.mouse.click(5, 5); await wait(p, 200);
  ok(!(await st(p)).overlay, `${name}: a click outside closes the overlay`);
  await p.context().close();
}
{
  const p = await open(H, { q: '?layout=book', w: 390, h: 844 });
  await p.evaluate(() => DECK.panes.watch(1, 0)); await wait(p, 200);
  ok(await p.evaluate(() => Math.abs(document.getElementById('stage').getBoundingClientRect().width - innerWidth) < 2), 'phone: Watch on slides uses the full width');
  await shot(p, '05-phone-overlay');
  await p.context().close();
}

// ---------------------------------------------------------------- 6. 本で読む（スライド → 本）
{
  const p = await open(H);
  await p.evaluate(() => DECK.go(1, 0)); await wait(p, 300);
  await p.mouse.move(600, 700); await wait(p, 300);
  ok(await p.evaluate(() => +getComputedStyle(document.getElementById('deck-readin')).opacity > .5) && (await p.textContent('#deck-readin')).includes('本で読む'), 'a slide with a section shows Read in the book with the toolbar');
  await shot(p, '06-readin');
  await p.focus('#deck-readin'); await p.keyboard.press('Enter'); await wait(p, 300);
  let s6 = await st(p);
  ok(s6.layout === 'split' && (await along(p, '#sec-pa3bbb')) < 40, 'Read in the book opens Slides and book at the section');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.closest('#sec-pa3bbb') !== null), 'focus moves to the section heading');
  await p.click('#deck-text .dx-back'); await wait(p, 200);
  ok((await st(p)).layout === 'slides', 'Back returns to the slides');
  await p.evaluate(() => DECK.go(3, 0)); await wait(p, 300);
  ok(!(await p.isVisible('#deck-readin')), 'a slide without a section has no Read in the book');
  await p.context().close();
  const n = await open(H, { w: 420, h: 800 });
  await n.evaluate(() => DECK.go(1, 0)); await wait(n, 200);
  await n.click('#deck-readin'); await wait(n, 300);
  ok((await st(n)).layout === 'book', 'narrow screen: Read in the book opens the book alone');
  await n.context().close();
}

// ---------------------------------------------------------------- 7. 台本で読む（本のない教材）：スクロールで一度だけ動く・動きを減らす設定
for (const reduce of [false, true]) {
  const p = await open(S, { q: '?layout=book', reduce });
  ok((await p.textContent('#deck-text .dx-view')).includes('表示') && (await p.getAttribute('#deck-text', 'aria-label')) === '台本で読む', `${reduce ? 'reduced: ' : ''}without a book the text pane is 台本で読む`);
  await readTo(p, '[data-step-key="s-pa3bbb:1"]', [1, 1]);
  const s7 = await st(p);
  const op = await p.evaluate(() => +getComputedStyle(DECK.slides[1].querySelector('[data-step="1"]')).opacity);
  ok(s7.i === 1 && s7.k === 1, `${reduce ? 'reduced: ' : ''}scrolling the script moves to the step (${s7.i}:${s7.k})`);
  ok(await p.evaluate(() => !document.querySelector('#deck-text [data-step]') && document.querySelectorAll('[data-step="1"]').length === 4), `${reduce ? 'reduced: ' : ''}small slides are not found by document queries (closed shadow trees)`);
  ok(reduce ? op === 1 : op < 1, `${reduce ? 'reduced motion: the step is shown in its final state' : 'the step plays as it enters'} (opacity ${op.toFixed(2)})`);
  ok(await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(), t = document.querySelector('.dx-thumb.dx-live').getBoundingClientRect(); return Math.abs(s.left - t.left) < 2 && Math.abs(s.width - t.width) < 2; }), `${reduce ? 'reduced: ' : ''}the live slide sits on its small slide`);
  if (!reduce) {
    await wait(p, 900);
    await readTo(p, '[data-step-key="s-pa3bbb:0"]'); await wait(p, 60);
    const op0 = await p.evaluate(() => +getComputedStyle(DECK.slides[1].querySelector('[data-step="1"]')).opacity);
    ok((await st(p)).k === 0, 'scrolling back moves to the earlier step');
    await readTo(p, '[data-step-key="s-pa3bbb:1"]'); await wait(p, 60);
    const op1 = await p.evaluate(() => +getComputedStyle(DECK.slides[1].querySelector('[data-step="1"]')).opacity);
    ok(op1 === 1, `a step that has not left the view does not play again (opacity ${op1.toFixed(2)}, before ${op0.toFixed(2)})`);
    await shot(p, '07-script-book');
    // 縮図を押すと重ねて見せる
    await p.click('.dx-thumb[data-i="2"]'); await wait(p, 200);
    ok((await st(p)).overlay && (await st(p)).i === 2, 'a small slide opens Watch on slides');
    await p.keyboard.press('Escape');
  }
  await p.context().close();
}

// ---------------------------------------------------------------- 8. 本のない教材の横並び・ほかの並べ方の印
{
  const p = await open(S, { q: '?layout=split' });
  ok((await st(p)).marked === 's-pa2aaa:0' && (await markColor(p)).aria === 'step', 'Slides and script: the current step is marked (aria-current="step")');
  await p.evaluate(() => DECK.go(2, 2)); await wait(p, 900);
  ok((await st(p)).marked === 's-pa4ccc:2' && await p.evaluate(() => { const b = document.querySelector('#deck-text .dx-body').getBoundingClientRect(), r = document.querySelector('.dx-cur').getBoundingClientRect(); return r.bottom > b.top && r.top < b.bottom; }), 'Slides and script: the script follows the slides');
  await shot(p, '08-script-split');
  await p.context().close();
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
