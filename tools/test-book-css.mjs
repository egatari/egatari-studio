// 本の窓の体裁がスライドのテーマから隔てられていること、縦書きの本の表（format spec §9C.6 Typesetting）の確認：
//   node tools/test-book-css.mjs [作業フォルダ] [--shots]
// 1. 要素だけの規則を強く書いたテーマ（tools/fixtures/theme-bare-elements）の教材を組み、並べ方 book・split で、本の p と td・th・li・code・figcaption の
//    字の大きさが本の大きさ（単独の本の頁と同じ）になること。スライドの表は体裁（28px）またはテーマの値のまま
// 2. 縦書きの本：表は writing-mode: vertical-rl で、1 行目のセルがいちばん右の列。:class: horizontal の表は横組み。横書きの本の表は横組みのまま。
//    縦書きの本の表は天付き（表と表題が行の頭から・本文のセルも頭から・見出しのセルと太字だけの 1 列目は中央）。横書きの本の表と表題は中央
//    印刷（単独の本の頁）でも縦。表のセルの 1〜2 桁の数は縦中横（横組みの表には付けない）
// 3. WebKit（iPad の Safari と同じ組版の機械）でも縦書きの表が同じに組まれること（WebKit が入っていなければ skip）
// --shots：作業フォルダに画面の PNG を残す（目で見る用。縦書きの根は CDP で撮る）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-book-css-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用の教材（架空の中身）
function makeDeck(name, { vertical = false, theme = 'theme-bare-elements' } = {}) {
  const dir = path.join(work, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'themes'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'tools/fixtures/theme-bare-elements'), path.join(dir, 'themes', 'theme-bare-elements'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="${theme}">
<head><meta charset="utf-8"><title>本の体裁の試験</title></head>
<body>
<div id="stage">
<section class="slide" id="s-bc2aaa" data-article="sec-bc2aaa">
  <h2>表のスライド</h2>
  <div class="body"><table><tr><th>店</th><th>数</th></tr><tr><td>北</td><td>12</td></tr></table></div>
</section>
<section class="slide" id="s-bc3bbb" data-article="sec-bc3bbb">
  <h2>二つ目</h2>
  <div class="body"><p>二つ目の点。</p></div>
</section>
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), '## 表のスライド {#s-bc2aaa}\n[0] 表です。\n\n## 二つ目 {#s-bc3bbb}\n[0] 二つ目です。\n');
  fs.writeFileSync(path.join(dir, 'article.md'), `---
title: 表の本
${vertical ? 'writing-mode: vertical-rl\n' : ''}---

(sec-bc2aaa)=
## 表の節

本文の段落。{ruby}\`代表値|だいひょうち\`と \`x + 1\` を書く。表は [](#tbl-shop) を見よ。

- 一つ目の項目
- 二つ目の項目

:::{table} 店ごとの販売数
:label: tbl-shop

| 店 | 4 月 | 5 月 |
|:---|---:|---:|
| 北店 | 12 | 98 |
| 南店 | 7 | 120 |

出典：架空。
:::

:::{table} 長い数の表
:label: tbl-long
:class: horizontal

| 年 | 人口 |
|:---|---:|
| 2020 | 12 |
:::

:::{table} 行の見出しのある表
:label: tbl-label

|  | 一の場面 | 二の場面 |
|---|---|---|
| **起きたこと** | 雨の門の下で行き所がない | 楼の上へのぼる |
| **勇気** | 出ずにいた | 悪を憎む |
:::

(sec-bc3bbb)=
## 二つ目の節

> 引用の段落。

終わりの段落。
`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { encoding: 'utf8' });
  if (r.status !== 0 || /✗ article/.test(r.stderr + r.stdout)) { console.error(r.stdout, r.stderr); process.exit(1); }
  return { deck: path.join(dir, 'out', 'deck.html'), page: path.join(dir, 'out', 'deck.article.html') };
}
const H = makeDeck('book-h');
const V = makeDeck('book-v', { vertical: true });
const D = makeDeck('book-default', { theme: 'default' });

// 本の中の大きさと表の組み方を測る（ページの中で）
const measure = () => {
  const A = document.querySelector('#deck-text #egatari-article') || document.querySelector('#egatari-article');
  const px = (sel) => { const e = A.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
  const wm = (sel) => { const e = A.querySelector(sel); return e ? getComputedStyle(e).writingMode : null; };
  const shop = A.querySelector('#tbl-shop table'), long = A.querySelector('#tbl-long table');
  shop.scrollIntoView({ block: 'center', inline: 'center' });
  const box = (e) => e.getBoundingClientRect();
  const rows = [...shop.rows].map((r) => box(r.cells[0]));
  const slideTd = document.querySelector('#stage .slide td');
  return {
    p: px('section > p'), td: px('#tbl-shop td'), th: px('#tbl-shop th'), li: px('li'), code: px('p > code'), figcaption: px('#tbl-shop figcaption'),
    blockquote: px('blockquote > p'), h2: px('h2'), rt: px('rt'), section: px('section'),
    shopWm: wm('#tbl-shop table'), shopFigWm: wm('#tbl-shop'), longWm: wm('#tbl-long table'), longFigWm: wm('#tbl-long'),
    // 縦：1 行目（頭の行）のセルがいちばん右、次の行がその左。横：1 行目がいちばん上
    rowsRightToLeft: rows.every((r, i) => i === 0 || r.right <= rows[i - 1].left + 1),
    rowsTopToBottom: rows.every((r, i) => i === 0 || r.top >= rows[i - 1].bottom - 1),
    cellsDown: (() => { const c = shop.rows[1].cells; return box(c[1]).top >= box(c[0]).bottom - 1; })(),
    tcyInShop: shop.querySelectorAll('td .egatari-tcy').length, tcyInLong: long.querySelectorAll('.egatari-tcy').length,
    slideTd: slideTd ? parseFloat(getComputedStyle(slideTd).fontSize) : null,
  };
};
// 表の置き方（tbl-label。列の揃えの指定のない表）：縦書きの本は天付き（表と表題は行の頭、本文のセルも頭から。見出しのセルと太字だけの 1 列目は中央）、
// 横書きの本は中央。数はみな px の差（行の頭＝本文の段落の上の端、セルの字の頭＝セルの上の端＋padding）
const tableAlign = () => {
  const A = document.querySelector('#deck-text #egatari-article') || document.querySelector('#egatari-article');
  const f = A.querySelector('#tbl-label'), t = f.querySelector('table'), cap = f.querySelector('figcaption');
  f.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = (e) => e.getBoundingClientRect();
  const colTop = Math.min(...[...A.querySelectorAll('section > p')].map((e) => r(e).top));
  const ink = (e) => { const g = document.createRange(); g.selectNodeContents(e); const rs = [...g.getClientRects()].filter((x) => x.width && x.height); return { top: Math.min(...rs.map((x) => x.top)), bottom: Math.max(...rs.map((x) => x.bottom)), left: Math.min(...rs.map((x) => x.left)), right: Math.max(...rs.map((x) => x.right)) }; };
  const pad = (e) => { const c = getComputedStyle(e); return { top: parseFloat(c.paddingTop), bottom: parseFloat(c.paddingBottom) }; };
  // 縦：セルの字の頭からの隙間と、尻までの隙間の差（中央なら 0）
  const vStart = (e) => ink(e).top - (r(e).top + pad(e).top + parseFloat(getComputedStyle(e).borderTopWidth));
  const vSkew = (e) => { const b = r(e), k = ink(e); return (k.top - b.top) - (b.bottom - k.bottom); };
  const th = t.querySelector('thead th:nth-child(2)'), label = t.querySelector('tbody tr:nth-child(2) td:first-child'), body = t.querySelector('tbody tr:nth-child(2) td:nth-child(3)');   // 2 行目：その列の中でいちばん短いセル（揃えの違いが出る）
  const p0 = r(A.querySelector('section > p')), contentMid = (p0.left + p0.right) / 2;   // 本文の段落の幅＝欄の幅
  return {
    tableTop: r(t).top - colTop, capTop: ink(cap).top - colTop, cap: getComputedStyle(cap).textAlign, td: getComputedStyle(body).textAlign,
    th: getComputedStyle(th).textAlign, label: getComputedStyle(label).textAlign,
    bodyStart: vStart(body), thSkew: vSkew(th), labelSkew: vSkew(label),
    // 横：表の中心と本文の欄の中心の差・表題の字の中心と欄の中心の差
    hCentre: (r(t).left + r(t).right) / 2 - contentMid, capCentre: (ink(cap).left + ink(cap).right) / 2 - contentMid,
  };
};
async function shot(page, name) {
  if (!SHOTS) return;
  const s = await page.context().newCDPSession(page);
  const { data } = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(work, name + '.png'), Buffer.from(data, 'base64'));
}
const errors = [];
async function open(browser, file, q = '') {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${path.basename(path.dirname(path.dirname(file)))}: ${e.message}`));
  await p.goto(fileUrl(file) + q);
  if (/deck\.html$/.test(file)) await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
  await p.evaluate(() => document.fonts.ready);
  return p;
}

const browser = await launch();
// ---------------------------------------------------------------- 1. テーマの要素の規則が本に届かない
const ref = await (async () => { const p = await open(browser, H.page); const m = await p.evaluate(measure); await p.context().close(); return m; })();
ok(ref.p === 18 && ref.td === 18 && ref.li === 18 && Math.abs(ref.figcaption - 16.2) < 0.01, `standalone book: p ${ref.p}, td ${ref.td}, li ${ref.li}, figcaption ${ref.figcaption}`);
for (const [label, file] of [['bare-element theme', H.deck], ['default theme', D.deck]]) {
  for (const lay of ['book', 'split']) {
    const p = await open(browser, file, `?layout=${lay}`);
    const m = await p.evaluate(measure);
    const P = m.p;
    ok(P === 18, `${label}, ${lay}: book p is the book's 18px (${P})`);
    ok(m.td === P && m.th === P && m.li === P && m.code === P && m.blockquote === P && m.section === P,
      `${label}, ${lay}: td ${m.td}, th ${m.th}, li ${m.li}, code ${m.code}, blockquote p ${m.blockquote}, section ${m.section} = p`);
    ok(Math.abs(m.figcaption - P * 0.9) < 0.01 && Math.abs(m.h2 - P * 1.3) < 0.01 && Math.abs(m.rt - P * 0.5) < 0.01, `${label}, ${lay}: figcaption ${m.figcaption} = .9 p, h2 ${m.h2} = 1.3 p, rt ${m.rt} = .5 p (not the slide's)`);
    for (const k of ['p', 'td', 'th', 'li', 'code', 'figcaption', 'h2', 'rt']) if (m[k] !== ref[k]) ok(false, `${label}, ${lay}: ${k} ${m[k]} differs from the standalone book ${ref[k]}`);
    ok(m.slideTd === (label === 'default theme' ? 28 : 31), `${label}, ${lay}: the slide table keeps its size (${m.slideTd}px: layouts.css 28px, or the theme's own 31px)`);
    ok(m.shopWm === 'horizontal-tb' && m.rowsTopToBottom && m.tcyInShop === 0, `${label}, ${lay}: a horizontal book's table is horizontal (rows top to bottom, no tate-chu-yoko)`);
    const al = await p.evaluate(tableAlign);
    ok(Math.abs(al.hCentre) <= 1 && Math.abs(al.capCentre) <= 1 && al.cap === 'center', `${label}, ${lay}: a horizontal book's table and caption are centred (table ${al.hCentre.toFixed(1)}px, caption ${al.capCentre.toFixed(1)}px off the column's centre)`);
    await shot(p, `h-${label.split(' ')[0]}-${lay}`);
    await p.context().close();
  }
}
// 縦書きの本の表は天付き（作者、2026-11-04）
const vAlign = (al, tag) => {
  ok(Math.abs(al.tableTop) <= 1 && Math.abs(al.capTop) <= 1, `${tag}: the table and its caption start at the column top (table ${al.tableTop.toFixed(1)}px, caption ${al.capTop.toFixed(1)}px)`);
  ok(al.cap === 'start' && al.td === 'start' && Math.abs(al.bodyStart) <= 1, `${tag}: the caption and body cells are start-aligned (${al.cap}, ${al.td}; a cell's text starts ${al.bodyStart.toFixed(1)}px below its padding)`);
  ok(al.th === 'center' && al.label === 'center' && Math.abs(al.thSkew) <= 1.5 && Math.abs(al.labelSkew) <= 1.5, `${tag}: header cells and the bold first column are centred (${al.th}, ${al.label}; skew ${al.thSkew.toFixed(1)}, ${al.labelSkew.toFixed(1)}px)`);
};
// ---------------------------------------------------------------- 2. 縦書きの本の表
for (const lay of ['book', 'split']) {
  const p = await open(browser, V.deck, `?layout=${lay}`);
  await p.waitForTimeout(150);
  const m = await p.evaluate(measure);
  ok(m.p === 18 && m.td === 18 && m.li === 18, `vertical, ${lay}: td ${m.td}, li ${m.li} = p ${m.p}`);
  ok(m.shopWm === 'vertical-rl' && m.shopFigWm === 'vertical-rl', `vertical, ${lay}: the table is vertical-rl (${m.shopFigWm}, ${m.shopWm})`);
  ok(m.rowsRightToLeft && m.cellsDown, `vertical, ${lay}: the first row's cells are the rightmost column; a row's cells run top to bottom`);
  ok(m.longWm === 'horizontal-tb' && m.longFigWm === 'horizontal-tb', `vertical, ${lay}: :class: horizontal keeps the table horizontal (${m.longFigWm}, ${m.longWm})`);
  ok(m.tcyInShop === 3 && m.tcyInLong === 0, `vertical, ${lay}: 1–2 digit numbers in cells are upright (tate-chu-yoko: ${m.tcyInShop}); none in the horizontal table (${m.tcyInLong})`);
  ok(m.slideTd === 31, `vertical, ${lay}: the slide table keeps the theme's size (${m.slideTd})`);
  const al = await p.evaluate(tableAlign);
  vAlign(al, `vertical, ${lay}`);
  await shot(p, `v-${lay}`);
  await p.context().close();
}
{
  const p = await open(browser, V.page);
  const m = await p.evaluate(measure);
  ok(m.shopWm === 'vertical-rl' && m.rowsRightToLeft && m.longWm === 'horizontal-tb', 'vertical standalone page: the table is vertical, first row on the right; horizontal class stays horizontal');
  vAlign(await p.evaluate(tableAlign), 'vertical standalone page');
  await p.emulateMedia({ media: 'print' });
  const pr = await p.evaluate(measure);
  ok(pr.shopWm === 'vertical-rl' && pr.rowsRightToLeft && pr.longWm === 'horizontal-tb', 'vertical standalone page, print: the table stays vertical');
  await shot(p, 'v-page');
  await p.context().close();
}
await browser.close();

// ---------------------------------------------------------------- 3. WebKit
let wk = null;
try { wk = await webkit.launch(); } catch (e) { console.log(`skip: WebKit is not installed (npx playwright-core install webkit): ${String(e.message || e).split('\n')[0]}`); }
if (wk) {
  for (const lay of ['book', 'split']) {
    const c = await wk.newContext({ viewport: { width: 1180, height: 820 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(`webkit: ${e.message}`));
    await p.goto(fileUrl(V.deck) + `?layout=${lay}`);
    await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes);
    await p.waitForTimeout(150);
    const m = await p.evaluate(measure);
    ok(m.shopWm === 'vertical-rl' && m.rowsRightToLeft && m.cellsDown && m.longWm === 'horizontal-tb', `WebKit, vertical, ${lay}: the table is vertical, first row on the right, cells top to bottom; horizontal class stays horizontal`);
    ok(m.td === m.p && m.li === m.p && m.slideTd === 31, `WebKit, vertical, ${lay}: td ${m.td}, li ${m.li} = p ${m.p}; slide table ${m.slideTd}`);
    vAlign(await p.evaluate(tableAlign), `WebKit, vertical, ${lay}`);
    // WebKit の画面全体の撮影は、縦書きの欄を送った位置を写さない。表の要素だけを撮る
    if (SHOTS) await p.locator('#deck-text #tbl-shop').screenshot({ path: path.join(work, `webkit-v-${lay}.png`) });
    await c.close();
  }
  await wk.close();
}

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
