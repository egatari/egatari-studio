// 試用の教材で品質チェックが見逃したもの（handoff Issue #40、2026-11-17 の水素の試用）の試験
//   node tools/test-check-gaps.mjs
// 1. 言葉と規格：colOverflow（横並び .cols の列からはみ出す中身、R-fit の警告）の日本語・英語の知らせ、R-fit、修正依頼の表、編集アプリにも出す code。
//    compReport の range（パーツが ctx.report("range", …) で知らせた、表示する範囲の外の値）は直し方（範囲の属性）を言う
// 2. コマンド版（kit/check.mjs --json）：
//    ja（tools/fixtures/check-gaps/ja）：試用のスライド s-wt755y（左の列の分数が右の列の字に重なる）は colOverflow、長い式を列の外に置いた s-fixed と data-clip の中は何も出さない
//    en（tools/fixtures/check-gaps/en）：範囲の外の値を ctx.report("range", …) で知らせる作業フォルダのパーツ（m-rangeplot）は compReport の警告（スライドの id とパーツのタグ付き）、
//    範囲に収まれば何も出さない。試用のスライド s-tj7qxs（m-curves に yr がない）は、部品庫の m-curves が range を知らせるようになれば compReport になる
//    （今の版が知らせなければ「部品庫の側の残り」として書き出すだけ。Studio の側は m-rangeplot で確かめる）
// 3. layoutScan をじかに：右・左へのはみ出し、隣の列に入らないはみ出し、折り返す字・overflow の列・隠れた列・パーツの中・1 列だけの .cols は出さない
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shareBrowser, launch } from '../kit/browser.mjs';
import { layoutScan } from '../kit/core/layout-scan.mjs';
import { MESSAGES, message, ruleOf, partReportFinding } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
import { rulesFor } from '../kit/core/llm-fix.mjs';
import { IN_EDITOR } from '../kit/core/check-parity.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e.message).split('\n').join('\n     ')); } };

// ---------------------------------------------------------------- 1. 言葉と規格
await t('colOverflow: ja and en say which column, what, how far and how to fix; R-fit everywhere; shown in the editor too', () => {
  assert.ok(MESSAGES.colOverflow);
  const a = { col: 1, cols: 2, into: 2, t: '\\frac{2+7+7+8}', px: 153, n: 1 };
  assert.equal(message('ja', 'colOverflow', a), '横並び（.cols）の左から 1 列目の中身が列の幅を超え、2 列目に重なる（「\\frac{2+7+7+8}」、153px）：式や語を短くするか、長い式は列の外の別の行に置くか、列を減らして幅を広げる（R-fit）');
  assert.equal(message('en', 'colOverflow', a), 'content in column 1 of 2 (from the left) of a side-by-side layout (.cols) is wider than the column and overlaps column 2 (“\\frac{2+7+7+8}”, 153px): shorten the formula or words, put a long formula on its own line outside the columns, or use fewer columns so each is wider (R-fit)');
  assert.match(message('ja', 'colOverflow', { col: 2, cols: 2, t: 'x', px: 5, n: 2, v: true }), /^横並び（\.cols）の上から 2 列目の中身が列の幅を超え、はみ出す（「x」 ほか 1 か所、5px）/);
  assert.match(message('en', 'colOverflow', { col: 2, cols: 3, t: 'x', px: 5, n: 1 }), /column 2 of 3 \(from the left\).* sticks out \(“x”, 5px\)/);
  assert.equal(ruleOf('colOverflow'), 'R-fit');
  assert.equal(ruleOfCode('colOverflow'), 'R-fit');
  assert.deepEqual(rulesFor({ code: 'colOverflow' }), ['R-fit']);
  assert.ok(IN_EDITOR.includes('colOverflow'));
});
await t('compReport: a part’s ctx.report("range", …) is a warning whose message says to set the range attributes; other codes keep the general advice', () => {
  const f = partReportFinding({ kind: 'report', code: 'range', slide: 2, tag: 'm-curves', msg: 'x' });
  assert.deepEqual([f.sev, f.code, f.slide], ['warn', 'compReport', 2]);
  const a = { code: 'range', tag: 'm-curves', label: '人口', msg: '[curves] series 0 is outside yr [0, 1]' };
  assert.equal(message('ja', 'compReport', a), 'パーツ <m-curves>「人口」の値が表示する範囲の外にある：[curves] series 0 is outside yr [0, 1]。範囲の属性（xr・yr など）を、値がすべて入るように書く（R-components）');
  assert.equal(message('en', 'compReport', a), 'the part <m-curves> “人口” has values outside the range it shows: [curves] series 0 is outside yr [0, 1]. Set its range attributes (such as xr and yr) so that every value fits (R-components)');
  assert.match(message('ja', 'compReport', { ...a, code: 'size' }), /からの知らせ：.*テーマの色を確かめる/);
  assert.equal(ruleOfCode('compReport'), 'R-components');
});

if (process.env.EGATARI_TEST_NO_BROWSER === '1') {
  console.log(`SKIP browser checks; Node checks: ${n - fail}/${n} ok`);
  process.exit(fail ? 1 : 0);
}
await shareBrowser();

// ---------------------------------------------------------------- 2. コマンド版
const check = (lang) => {
  const r = spawnSync(process.execPath, ['kit/check.mjs', path.join(ROOT, 'tools/fixtures/check-gaps', lang, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(r.stdout);
};
const notNarr = (J) => J.results.filter((x) => (x.sev === 'warn' || x.sev === 'error') && x.code !== 'narrMissing');
await t('check ja: the trial slide s-wt755y gets colOverflow (column 1 into column 2); the fixed slide and data-clip get nothing', () => {
  const J = check('ja');
  assert.deepEqual(notNarr(J).map((x) => `${x.id} ${x.sev} ${x.code} ${x.rule}`), ['s-wt755y warn colOverflow R-fit']);
  const d = J.results.find((x) => x.code === 'colOverflow').data;
  assert.deepEqual({ col: d.col, cols: d.cols, into: d.into }, { col: 1, cols: 2, into: 2 });
  assert.ok(d.t.startsWith('\\frac{2+7'), d.t);   // 書いた式（TeX）で言う
  assert.ok(d.px > 50, 'px ' + d.px);
});
await t('check en: a part that reports values outside its range gets compReport (slide id, part tag, code range); in range, nothing', () => {
  const J = check('en');
  const xs = J.results.filter((x) => x.code === 'compReport');
  const own = xs.filter((x) => x.id !== 's-tj7qxs');
  assert.deepEqual(own.map((x) => `${x.id} ${x.sev} ${x.rule} ${x.data.tag} ${x.data.code}`), ['s-range warn R-components m-rangeplot range']);
  assert.match(own[0].msg, /^Slide 2 “Values outside the range” \(s-range\): the part <m-rangeplot> “Three values” has values outside the range it shows: \[rangeplot\] 2 of 3 values/);
  assert.deepEqual(notNarr(J).filter((x) => x.id === 's-inrange'), []);
  // 試用のスライド：部品庫の m-curves が範囲の外の値を知らせれば、同じ道で警告になる
  const trial = xs.filter((x) => x.id === 's-tj7qxs');
  if (trial.length) assert.deepEqual(trial.map((x) => `${x.sev} ${x.data.tag} ${x.data.code}`), ['warn m-curves range']);
  else console.log('     note: m-curves in the default catalogue does not report values outside yr yet (parts library: ctx.report("range", …)); s-tj7qxs gets no warning');
});

// ---------------------------------------------------------------- 3. layoutScan をじかに
const W = (w) => `<svg width="${w}" height="40" style="display:block"><rect width="${w}" height="40" fill="#ccc"/></svg>`;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const SLIDES = {
  right: `<div class="cols">${'<div>' + W(700) + '</div>'}<div><p>右の列</p></div></div>`,
  left: `<div class="cols"><div><p>左の列</p></div><div style="direction:rtl">${W(700)}</div></div>`,
  word: `<div class="cols" style="width:600px"><div><p>Pneumonoultramicroscopicsilicovolcanoconiosis_and_more_text</p></div><div style="margin-left:400px"><p>x</p></div></div>`,
  three: `<div class="cols"><div><p>一</p></div><div><img alt="広い図" src="${GIF}" style="display:block;width:600px;height:20px"></div><div><p>三</p></div></div>`,
  wrap: `<div class="cols"><div><p>${'長い文を折り返す。'.repeat(12)}</p></div><div><p>右の列</p></div></div>`,
  hiddenCol: `<div class="cols"><div style="overflow:hidden">${W(700)}</div><div><p>右</p></div></div>`,
  invisible: `<div class="cols"><div style="visibility:hidden">${W(700)}</div><div><p>右</p></div></div>`,
  part: `<div class="cols"><div><m-x style="display:block">${W(700)}<p style="width:700px">パーツの中の字</p></m-x></div><div><p>右</p></div></div>`,
  one: `<div class="cols"><div>${W(1400)}</div></div>`,
};
const style = '<style>.cols{display:flex;gap:32px;align-items:flex-start}.cols>*{flex:1;min-width:0}</style>';
const page0 = Object.entries(SLIDES).map(([id, body]) => `<section class="slide" id="${id}" style="position:relative;width:1280px;height:720px;overflow:hidden"><h2>見出し</h2><div class="body" style="position:absolute;left:48px;top:122px;right:48px">${body}</div></section>`).join('\n');
const b = await launch();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!DOCTYPE html><html><head>${style}</head><body style="margin:0">${page0}</body></html>`);
  await page.evaluate(`window.__layoutScan = ${layoutScan}`);
  const scan = (id) => page.evaluate((id) => window.__layoutScan(document.getElementById(id), { JA: true, refRe: '文献', clip: 'data-clip', annot: 'data-annot', overlap: 'data-overlap' }).filter((f) => f.code === 'colOverflow').map((f) => f.a), id);
  await t('layoutScan: a box wider than its column is reported with the column, the neighbour it runs into and the px (right and left)', async () => {
    const r = await scan('right');
    assert.equal(r.length, 1);
    assert.deepEqual({ col: r[0].col, cols: r[0].cols, into: r[0].into }, { col: 1, cols: 2, into: 2 });
    assert.ok(Math.abs(r[0].px - (700 - (1184 - 32) / 2)) <= 2, 'px ' + r[0].px);
    const l = await scan('left');
    assert.deepEqual(l.map((a) => [a.col, a.into]), [[2, 1]]);
  });
  await t('layoutScan: an unbreakable word sticking out without reaching the next column has no into; an image in the middle column names it', async () => {
    const w = await scan('word');
    assert.equal(w.length, 1);
    assert.equal(w[0].into, undefined);
    assert.equal(w[0].col, 1);
    const th = await scan('three');
    assert.deepEqual(th.map((a) => [a.col, a.cols, a.t]), [[2, 3, '広い図']]);
  });
  await t('layoutScan: wrapping text, a column with overflow hidden, a hidden column, content inside a part and a one-column .cols are not reported', async () => {
    for (const id of ['wrap', 'hiddenCol', 'invisible', 'part', 'one']) assert.deepEqual(await scan(id), [], id);
  });
} finally {
  await b.close();
}

console.log(`${n - fail}/${n} ok`);
process.exit(fail ? 1 : 0);
