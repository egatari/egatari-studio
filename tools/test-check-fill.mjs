// 本文の釣り合い（R-balance の段 1、balance）の試験
//   node tools/test-check-fill.mjs [作業フォルダ]
// 1. 測り方（kit/core/fill-measure.mjs）：重心（外接矩形の中心ではない）と光学的な中心（上から 45%）の差、片寄った空きとその側、横の釣り合い、
//    地の色との差が許す範囲の画素は地、ちらばった 1 画素は外接矩形を広げない。中央の塊（四方の余白がそろう）は大きさによらず知らせない。
//    縦組みは右に寄って左が空くとき
// 2. 小さな試験用のデッキを kit/check.mjs --json で検査する：本文いっぱいの中身・中央の塊・上にそろえた字だけ（下が空く）は知らせない・
//    小さな図の下が大きく空くと知らせる（数）・高い箱の上半分だけに描く図を知らせる（描いた端で見る）・表紙・章の扉・static は測らない。知らせは情報（R-balance）で、エラー・警告の数と ok・終了コードを変えない
// 3. 修正依頼（kit/core/llm-fix.mjs の buildFixRequest）に入らない
// 4. 同じデッキを 2 回検査して同じ数（決まった結果）
// 5. 言葉：数だけ（直し方を言わない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shareBrowser } from '../kit/browser.mjs';
import { measureBalance, balanceFlagged, visualExtent, BALANCE } from '../kit/core/fill-measure.mjs';
import { buildFixRequest } from '../kit/core/llm-fix.mjs';
import { message } from '../kit/check-messages.mjs';
// ブラウザは 1 つだけ起動し、子のプロセス（kit/check.mjs）の launch() はそこにつなぐ
const stopShared = await shareBrowser();

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-fill-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};

// ---- 1. 測り方
const img = (w, h, bg, paint) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  paint((x, y, c) => data.set([...c, 255], (y * w + x) * 4));
  return { width: w, height: h, data };
};
const BG = [250, 250, 245];
const box = (...rects) => img(100, 100, BG, (px) => { for (const [y0, y1, x0, x1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, [0, 0, 0]); });
await t('measureBalance: content in the top quarter is top-heavy with a one-sided band at the bottom', () => {
  const m = measureBalance(box([0, 25, 0, 100]), BG);
  assert.equal(m.vOffset, -32.5); assert.equal(m.hOffset, 0);
  assert.equal(m.bottom, 75); assert.equal(m.top, 0); assert.equal(m.band, 75); assert.equal(m.side, 'bottom');
  const V = { width: 100, height: 100 };
  assert.ok(!balanceFlagged(m, V), 'text only (no visual): a top-aligned start is normal');
  assert.ok(balanceFlagged(m, { ...V, visual: { n: 1, bottom: 25, left: 0 } }), 'a figure with the empty band right below it');
  assert.ok(balanceFlagged(m, { ...V, visual: { n: 1, bottom: 15, left: 0 } }), 'a one-line caption under the figure');
  assert.ok(balanceFlagged(m, { ...V, visual: { n: 1, bottom: 7, left: 0 } }), 'a two-line caption under the figure (18%)');
  assert.ok(!balanceFlagged(m, { ...V, visual: { n: 1, bottom: 0, left: 0 } }), 'a text block under the figure (25%): treated like text only');
});
await t('visualExtent: the drawn edge of a figure, not its box', () => {
  const im = box([0, 30, 0, 100]);
  assert.deepEqual(visualExtent(im, BG, [{ x: 0, y: 0, width: 100, height: 80 }]), { n: 1, bottom: 30, left: 0 });
  assert.equal(visualExtent(im, BG, []), null);
});
await t('measureBalance: a centred block with even margins scores about 0 and is not flagged, however small', () => {
  const c = measureBalance(box([30, 70, 10, 90]), BG);
  assert.equal(c.band, 0); assert.equal(c.side, null); assert.equal(c.hOffset, 0); assert.equal(c.vOffset, 5, 'the geometric centre is 5% below the optical centre');
  assert.ok(!balanceFlagged(c));
  assert.ok(!balanceFlagged(measureBalance(box([45, 55, 45, 55]), BG)), 'a small centred block');
});
await t('measureBalance: the centre of mass, not the bounding box centre', () => {
  // 上の重い塊と、下の端の細い線：外接矩形は本文いっぱい（片寄った空きは 0）でも重心は上
  const m = measureBalance(box([0, 40, 0, 100], [98, 100, 0, 100]), BG);
  assert.equal(m.band, 0); assert.ok(m.vOffset < -20, `vOffset ${m.vOffset}`);
  assert.ok(!balanceFlagged(m), 'a top-heavy body without an empty band is not flagged');
});
await t('measureBalance: horizontal balance and the side of the band (two columns, one empty)', () => {
  const m = measureBalance(box([0, 100, 0, 40]), BG);
  assert.equal(m.hOffset, -30); assert.equal(m.side, 'right'); assert.equal(m.band, 60);
  assert.ok(!balanceFlagged(m), 'only the vertical rule flags a horizontal slide');
});
await t('measureBalance: vertical writing (layout-tate) is flagged when it sits right with the left empty', () => {
  const m = measureBalance(box([0, 100, 60, 100]), BG);
  assert.equal(m.left, 60); assert.equal(m.side, 'left'); assert.equal(m.hOffset, 30);
  const V = { width: 100, height: 100, visual: { n: 1, bottom: 100, left: 60 } };
  assert.ok(balanceFlagged(m, { ...V, tate: true })); assert.ok(!balanceFlagged(m, V));
  assert.ok(!balanceFlagged(m, { width: 100, height: 100, tate: true }), 'vertical text only is not flagged');
});
await t('measureBalance: pixels within the tolerance of the background and lone pixels are empty', () => {
  const m = measureBalance(img(100, 100, BG, (px) => {
    for (let x = 0; x < 100; x++) px(x, 90, [BG[0] - BALANCE.tol, BG[1] - BALANCE.tol, BG[2] - BALANCE.tol]);   // 薄い罫線
    px(50, 99, [0, 0, 0]);   // ちらばった 1 画素
    for (let x = 0; x < 100; x++) { px(x, 0, [0, 0, 0]); px(x, 1, [0, 0, 0]); }
  }), BG);
  assert.equal(m.top, 0); assert.equal(m.bottom, 98, 'the faint line and the stray pixel do not extend the box');
  const e = measureBalance(img(100, 100, BG, (px) => { for (let x = 0; x < 100; x++) px(x, 90, [BG[0] - BALANCE.tol, BG[1], BG[2]]); }), BG);
  assert.equal(e.empty, true, 'a faint line is not content');
});

// ---- 2. 試験用のデッキ
const d = path.join(work, 'deck');
fs.mkdirSync(d, { recursive: true });
const slide = (id, h, body, cls = '') => `<section class="slide${cls ? ' ' + cls : ''}" id="${id}">\n  <h2>${h}</h2>\n  <div class="body">${body}</div>\n  <div class="concl"><span>結論の一言</span></div>\n</section>\n`;
const CENTRED = '<div style="height:100%;display:flex;flex-direction:column;justify-content:center"><p>中央の塊の 1 行目</p><p>中央の塊の 2 行目</p></div>';
const FULL = '<div class="box" style="height:430px;border:3px solid var(--fg);box-sizing:border-box"><p>本文の箱いっぱいの枠</p></div>';
const TOP = '<p>上に 1 行だけ</p>';
// 小さな図（高さ 120px）が上にあり、その下が大きく空く：図を高くできる
const FIG = '<svg viewBox="0 0 600 120" width="600" height="120" style="display:block" role="img" aria-label="小さな図"><rect x="0" y="0" width="600" height="120" style="fill:var(--term)"/></svg><p>図の出典の 1 行</p>';
// 箱は 420px と高いが、上の 150px にしか描かない図（部品が箱の上半分にだけ描く形）
const HALF = '<svg viewBox="0 0 1184 420" width="1184" height="420" style="display:block;height:420px" role="img" aria-label="上半分だけの図"><rect x="0" y="0" width="1184" height="150" style="fill:var(--term)"/></svg>';
fs.writeFileSync(path.join(d, 'deck.html'), `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>fill</title></head>\n<body>\n<div id="stage">\n`
  + '<section class="slide cover noconcl static" id="s-cover"><h1>表紙</h1></section>\n'
  + slide('s-full', '本文いっぱい', FULL)
  + slide('s-centred', '中央の塊', CENTRED)
  + slide('s-top', '上に 1 行', TOP)
  + slide('s-fig', '小さな図', FIG)
  + slide('s-half', '上半分の図', HALF)
  + '<section class="slide sec noconcl static" id="s-sec"><h1>章の扉</h1></section>\n'
  + `<section class="slide static noconcl" id="s-static"><h2>段階のないスライド</h2><div class="body">${TOP}</div></section>\n`
  + '</div>\n</body>\n</html>\n');
fs.writeFileSync(path.join(d, 'narration.md'), '# 口述原稿\n\n## 表紙 {#s-cover}\n[0] はじめます。\n\n'
  + ['s-full', 's-centred', 's-top', 's-fig', 's-half'].map((id) => `## x {#${id}}\n[0] この図を見ます。\n[concl] 結論です。\n`).join('\n')
  + '\n## 章の扉 {#s-sec}\n[0] 次の章です。\n\n## 段階のないスライド {#s-static}\n[0] ここは段階がありません。\n');
const check = () => spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), path.join(d, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const r1 = check();
let J = null;
await t('check --json runs on the fill deck', () => { J = JSON.parse(r1.stdout); assert.ok(Array.isArray(J.results), r1.stderr); });
const fills = (j) => Object.fromEntries(j.results.filter((x) => x.code === 'balance').map((x) => [x.id, x]));
await t('balance: the full body, a centred block and top-aligned text only are not reported; a small figure and a half-drawn figure are', () => {
  const F = fills(J);
  assert.deepEqual(Object.keys(F).sort(), ['s-fig', 's-half']);
  const top = F['s-fig'].data, half = F['s-half'].data;
  assert.ok(top.band > 55 && top.side === 'bottom', `band ${top.band} ${top.side}`);
  assert.ok(top.vOffset < -20, `vOffset ${top.vOffset}`);
  assert.equal(top.visual.n, 1); assert.equal(top.visual.bottom, 120);
  assert.ok(half.band > 55 && half.band < 70 && half.side === 'bottom', `half band ${half.band}`);
  assert.ok(half.vOffset < -20 && Math.abs(half.hOffset) < 1, `half offsets ${half.vOffset} ${half.hOffset}`);
});
await t('balance: cover, section divider and static slides are skipped', () => {
  for (const id of ['s-cover', 's-sec', 's-static']) assert.ok(!fills(J)[id], id);
});
await t('balance is info with the rule R-balance, and the numbers are in data and in the message', () => {
  for (const x of Object.values(fills(J))) {
    assert.equal(x.sev, 'info'); assert.equal(x.rule, 'R-balance');
    assert.ok(x.msg.includes(`${Math.round(x.data.bottom - x.data.top)}%`) && x.msg.includes(`${Math.abs(Math.round(x.data.vOffset))}%`), x.msg);
  }
});
await t('info findings do not change the status: no errors or warnings, ok, exit code 0', () => {
  const other = J.results.filter((x) => x.sev !== 'info');
  assert.deepEqual(other.map((x) => `${x.id} ${x.code}: ${x.msg}`), []);
  assert.equal(J.counts.error, 0); assert.equal(J.counts.warn, 0); assert.ok(J.counts.info >= 2);
  assert.equal(J.ok, true); assert.equal(r1.status, 0);
});

// ---- 3. 修正依頼
await t('fix requests leave out balance (and any info finding)', () => {
  const deck = fs.readFileSync(path.join(d, 'deck.html'), 'utf8');
  const problems = J.results.map((x) => ({ sev: x.sev, i: x.slide - 1, title: x.title, text: x.msg, msg: x.msg, code: x.code, rule: x.rule, data: x.data }));
  const req = buildFixRequest({ problems, deck, lang: 'ja' }).text;
  assert.ok(!/R-balance|の空き/.test(req), req.slice(0, 800));
  // sev を取り違えて渡されても、balance は載せない
  const forced = buildFixRequest({ problems: problems.filter((p) => p.code === 'balance').map((p) => ({ ...p, sev: 'warn' })), deck, lang: 'en' }).text;
  assert.ok(!/R-balance/.test(forced), forced.slice(0, 800));
});

// ---- 4. 決まった結果
await t('the same numbers on a second run', () => {
  const r2 = check();
  const a = fills(J), b = fills(JSON.parse(r2.stdout));
  assert.deepEqual(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.data])), Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.data])));
});

// ---- 5. 言葉
await t('messages: numbers only, no advice', () => {
  assert.equal(message('ja', 'balance', { vOffset: -18.2, hOffset: 2, top: 0, bottom: 34.1 }), '中身が上に寄っている（重心が光学的な中心より 18% 上、下に 34% の空き）（R-balance）');
  assert.equal(message('en', 'balance', { vOffset: -18.2, hOffset: 2, top: 0, bottom: 34.1 }), 'Content sits high (centre of mass 18% above the optical centre; 34% empty at the bottom) (R-balance)');
  assert.equal(message('ja', 'balance', { vOffset: -2, hOffset: 30, left: 60, right: 0, tate: true }), '中身が右に寄っている（重心が中心より 30% 右、左に 60% の空き）（R-balance）');
});

await stopShared();
console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
