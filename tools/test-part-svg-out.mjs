// パーツの箱から出る図の検査（partSvgOut、backlog #208、R-fit の警告）の試験
//   node tools/test-part-svg-out.mjs
// 1. 言葉と規格：日本語・英語の知らせ（パーツのタグと名前、px）、R-fit、修正依頼の表（kit/core/llm-fix.mjs）、編集アプリにも出す code（kit/core/check-parity.mjs の IN_EDITOR）
// 2. コマンド版（kit/check.mjs --json）：作業フォルダのパーツ（tools/fixtures/part-svg-out。DECK.MotionElement で書いたもの）のうち、
//    大きさのない <svg>（m-svgout）は警告、width:100%;height:100% の <svg>（m-svgfit）は何も出さない
// 3. layoutScan をじかに：width・height を付けた <svg> は出さない／2px までのずれは出さない／inline の要素・data-clip の中・隠れた要素は見ない／
//    同じタグの 2 つ目は index、1 つのスライドの 2 か所は n
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shareBrowser, launch } from '../kit/browser.mjs';
import { layoutScan } from '../kit/core/layout-scan.mjs';
import { MESSAGES, message, ruleOf } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
import { rulesFor } from '../kit/core/llm-fix.mjs';
import { IN_EDITOR } from '../kit/core/check-parity.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e.message).split('\n').join('\n     ')); } };

// ---------------------------------------------------------------- 1. 言葉と規格
await t('messages: ja and en name the part and the px, and say to size the <svg>; R-fit everywhere; shown in the editor too', () => {
  assert.ok(MESSAGES.partSvgOut);
  const a = { tag: 'm-svgout', label: '円の図', px: 200, n: 1 };
  assert.equal(message('ja', 'partSvgOut', a), 'パーツ <m-svgout>「円の図」の図（いちばん外側の <svg>）がパーツの箱からはみ出す（200px）：パーツのコードで、その <svg> に width と height を付ける（または style で width:100%;height:100%）（R-fit）');
  assert.match(message('en', 'partSvgOut', a), /^the figure \(outermost <svg>\) of the part <m-svgout> “円の図” sticks out of the part's box \(200px\): .*width and height.*width:100%;height:100%/);
  assert.match(message('ja', 'partSvgOut', { tag: 'm-x', index: 1, px: 3, n: 2 }), /^パーツ <m-x>（2 個目）の図.*（3px ほか 1 か所）/);
  assert.match(message('en', 'partSvgOut', { tag: 'm-x', index: 1, px: 3, n: 2 }), /the part <m-x> \(#2\).*\(3px and 1 more\)/);
  assert.equal(ruleOf('partSvgOut'), 'R-fit');
  assert.equal(ruleOfCode('partSvgOut'), 'R-fit');
  assert.deepEqual(rulesFor({ code: 'partSvgOut' }), ['R-fit']);
  assert.ok(IN_EDITOR.includes('partSvgOut'));
});

if (process.env.EGATARI_TEST_NO_BROWSER === '1') {
  console.log(`SKIP browser checks; Node checks: ${n - fail}/${n} ok`);
  process.exit(fail ? 1 : 0);
}
await shareBrowser();

// ---------------------------------------------------------------- 2. コマンド版
await t('check: a working-folder part with an unsized root <svg> gets partSvgOut; one with width:100%;height:100% gets none', () => {
  const r = spawnSync(process.execPath, ['kit/check.mjs', path.join(ROOT, 'tools/fixtures/part-svg-out/deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const J = JSON.parse(r.stdout);
  const xs = J.results.filter((x) => x.code === 'partSvgOut');
  assert.deepEqual(xs.map((x) => `${x.id} ${x.sev} ${x.rule}`), ['s-out warn R-fit']);
  assert.equal(xs[0].data.tag, 'm-svgout');
  assert.equal(xs[0].data.label, '円の図');
  assert.ok(Math.abs(xs[0].data.px - 200) <= 2, 'px ' + xs[0].data.px);   // 300×300 の図が 300×100 の要素から 200px 出る
  assert.deepEqual(J.results.filter((x) => x.id === 's-fit' && (x.sev === 'error' || ['partSvgOut', 'bodyBottom'].includes(x.code))).map((x) => x.code), []);
  assert.deepEqual(J.results.filter((x) => x.id === 's-out' && x.sev === 'error').map((x) => x.code), [], 'the overflow stays inside the body');
});

// ---------------------------------------------------------------- 3. layoutScan をじかに
// 要素の中身は手で書く（パーツの定義はいらない：検査は m-* のタグと直下の <svg> だけを見る）
const SVG = (attrs) => `<svg viewBox="0 0 400 400" ${attrs}><circle cx="200" cy="200" r="180" fill="none" stroke="#000"/></svg>`;
const BOX = 'display:block;width:300px;height:100px';
const SLIDES = {
  sized: `<m-a style="${BOX}">${SVG('width="100" height="100"')}</m-a>`,
  tol: `<m-a style="${BOX}">${SVG('width="301" height="102"')}</m-a>`,
  inline: `<m-a>${SVG('')}</m-a>`,
  clip: `<div data-clip><m-a style="${BOX}">${SVG('')}</m-a></div>`,
  hidden: `<m-a style="${BOX};visibility:hidden">${SVG('')}</m-a>`,
  two: `<m-a style="${BOX}">${SVG('width="100" height="100"')}</m-a><m-a aria-label="二つ目" style="${BOX}">${SVG('')}</m-a><m-b style="${BOX}">${SVG('style="width:100%"')}</m-b>`,
};
const page0 = Object.entries(SLIDES).map(([id, body]) => `<section class="slide" id="${id}" style="position:relative;width:1280px;height:720px;overflow:hidden"><h2>見出し</h2><div class="body" style="position:absolute;left:48px;top:122px;right:48px">${body}</div></section>`).join('\n');
const b = await launch();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${page0}</body></html>`);
  await page.evaluate(`window.__layoutScan = ${layoutScan}`);
  const scan = (id) => page.evaluate((id) => window.__layoutScan(document.getElementById(id), { JA: true, refRe: '文献', clip: 'data-clip', annot: 'data-annot', overlap: 'data-overlap' }).filter((f) => f.code === 'partSvgOut'), id);
  await t('layoutScan: a sized <svg>, a 1–2 px difference, an inline part, a part inside data-clip and a hidden part are not reported', async () => {
    for (const id of ['sized', 'tol', 'inline', 'clip', 'hidden']) assert.deepEqual(await scan(id), [], id);
  });
  await t('layoutScan: the first part that sticks out is named (tag, index among the same tag, aria-label), with the count on the slide', async () => {
    const xs = await scan('two');
    assert.equal(xs.length, 1);
    assert.equal(xs[0].sev, 'warn');
    assert.deepEqual({ ...xs[0].a, px: undefined }, { tag: 'm-a', index: 1, label: '二つ目', n: 2, px: undefined });
    assert.ok(Math.abs(xs[0].a.px - 200) <= 2, 'px ' + xs[0].a.px);
  });
} finally {
  await b.close();
}

console.log(`${n - fail}/${n} ok`);
process.exit(fail ? 1 : 0);
