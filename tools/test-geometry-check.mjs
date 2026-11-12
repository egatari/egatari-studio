// 描いた図の形の点検（kit/core/geometry-check.mjs、backlog #201、R-geometry）の試験。パーツの印（data-part）を付けた手書きの SVG を
// 0.5 倍に縮めたスライドに置き、スライドの座標（1280×720）で測れることを確かめる。
//   - geoEdgeThroughBox：元でも先でもない箱を通る線（<line> と <path>）。自分の箱の縁で終わる線・縁に沿う線（余裕：線の太さの半分 ＋ 2px）・隠れた線は出ない。
//     ひし形の箱（<polygon>）は形で測る（外接矩形の中でも形の外なら出ない）。1 つの辺の 2 本の線は別々に測る。@ で始まる端は節でない（箱がなくても測る）
//   - geoLineOverLabel：自分の辺の字は除く。縁取り（data-part-halo）があれば情報。字の範囲は基線から上 up・下 down（kit/core/text-band.mjs の値）
//   - geoLabelOverlap：字どうし・持ち主でない点。foreignObject の字は中身を Range で測る
//   - geoLabelOutsideBox：data-part-at="outside" の字は見ない
//   - 縦書きのスライドは測らない。geometryTate は縦横が混ざる教材の、印のある縦書きのスライドの数
//   node tools/test-geometry-check.mjs
import assert from 'node:assert/strict';
import { shareBrowser, launch } from '../kit/browser.mjs';
import { geometryScan, geometryTate } from '../kit/core/geometry-check.mjs';
import { layoutScan, withLayoutScan } from '../kit/core/layout-scan.mjs';
import { TEXT_BANDS, DEFAULT_BAND, textBand } from '../kit/core/text-band.mjs';
import { message, MESSAGES } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
// ブラウザは 1 つだけ起動する（kit/browser.mjs の shareBrowser）
await shareBrowser();

const GEO = { bands: TEXT_BANDS, dflt: DEFAULT_BAND };
const CODES = ['geoEdgeThroughBox', 'geoLineOverLabel', 'geoLabelOverlap', 'geoLabelOutsideBox', 'geoTateSlides'];
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + e.stack); } };

// ---------------------------------------------------------------- ブラウザなし
await t('ledger and messages: every geometry code is R-geometry, with ids and one fix in ja/en', () => {
  for (const c of CODES) { assert.equal(ruleOfCode(c), 'R-geometry', c); assert.equal(MESSAGES[c].rule, 'R-geometry', c); }
  const a = { edge: 'a→c', from: 'a', to: 'c', box: 'b', seg: [503, 150, 697, 150] };
  assert.match(message('ja', 'geoEdgeThroughBox', a), /線 a→c が、つないでいない箱 b の中を通る（503, 150 → 697, 150）：パーツのデータで箱 b の位置を変えるか、線 a→c の位置をずらして箱をよける（m-flow なら箱の x・y か、線の shift）/);
  assert.match(message('en', 'geoEdgeThroughBox', a), /line a→c passes through box b.*in the part's data, move box b or shift line a→c so it goes around the box \(in m-flow, the box's x and y, or the line's shift\)/);
  // @ で始まる箱はパーツの中の箱（データにない）：箱を動かすことを言わず、線をずらすことだけ
  const m = message('ja', 'geoEdgeThroughBox', { ...a, box: '@head' });
  assert.ok(!m.includes('箱 @head の位置') && m.includes('の位置をずらして'), m);
  assert.match(message('ja', 'geoLineOverLabel', { edge: 'a→b', from: 'a', to: 'b', label: 'k', t: '箱の字', at: [200, 200], halo: true }), /縁取り/);
  assert.match(message('ja', 'geoLabelOutsideBox', { box: 'n', t: '長い', px: { left: 80, right: 79, top: 0, bottom: 0 } }), /（左 80px・右 79px）/);
  assert.match(message('en', 'geoTateSlides', { n: 1 }), /1 vertical \(layout-tate\) slide were/);
});
await t('injection: the scanner is self-contained, has no </script or <!--, and the editor wrapper passes it with the band table', () => {
  for (const f of [geometryScan, geometryTate]) assert.ok(!/<\/script|<!--/i.test(String(f)));
  const g = new Function('return ' + withLayoutScan('(function(){return [typeof geometryScan, typeof geometryTate, GEO_OPTS];})'))()();
  assert.deepEqual(g, ['function', 'function', JSON.parse(JSON.stringify(GEO))]);
  // 表の決め方は kit/core/text-band.mjs の textBand と同じ（中に写した bandOf）
  assert.deepEqual(textBand("'BIZ UDPGothic', sans-serif"), { up: 0.86, down: 0.12 });
});

if (process.env.EGATARI_TEST_NO_BROWSER === '1') {
  console.log(`SKIP browser checks; Node checks: ${n - fail}/${n} ok`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------- ブラウザ
// スライド：1280×720 を 0.5 倍に縮める（getBoundingClientRect の幅 640 → 拡大率で割ってスライドの座標に直す）。SVG はスライドと同じ座標
const slide = (body, cls = 'slide') => `<div style="height:360px;position:relative"><section class="${cls}" style="position:absolute;left:0;top:0;width:1280px;height:720px;transform:scale(.5);transform-origin:0 0;margin:0">
<svg width="1280" height="720" viewBox="0 0 1280 720" style="position:absolute;left:0;top:0;font-family:'BIZ UDPGothic', sans-serif;font-size:40px;fill:none;stroke:#000;stroke-width:1">${body}</svg></section></div>`;
const T = (id, of, x, y, text, extra = '') => `<text data-part="label" data-part-id="${id}" data-part-of="${of}" x="${x}" y="${y}" style="fill:#000;stroke:none" ${extra}>${text}</text>`;
const BOX = (id, x, y, w, h) => `<rect data-part="box" data-part-id="${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const EDGE = (id, lines, extra = '') => { const [f, to] = id.replace(/#\d+$/, '').split('→'); return `<g data-part="edge" data-part-id="${id}" data-part-from="${f}" data-part-to="${to}" ${extra}>${lines}</g>`; };
const LINE = (x1, y1, x2, y2, extra = '') => `<line data-part-line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;

const S0 = BOX('a', 100, 100, 200, 100) + BOX('b', 500, 100, 200, 100) + BOX('c', 900, 100, 200, 100)
  + EDGE('a→c', LINE(300, 150, 900, 150))                                          // b を通る
  + EDGE('a→b', LINE(300, 180, 500, 180))                                          // b の縁で終わる（自分の先）
  + EDGE('a→c#2', LINE(300, 101, 900, 101, 'style="stroke-width:2"'))              // b の上の縁に沿う（1px 内側：余裕 1 ＋ 2 の内）
  + EDGE('a→c#3', '<path data-part-line d="M300,190 C 500,190 700,190 900,190"/>') // path も b を通る
  + EDGE('a→c#4', LINE(300, 170, 900, 170), 'style="visibility:hidden"')           // 隠れた線は測らない
  + `<path d="M890,145 L900,150 L890,155"/>`;                                       // 矢じり（印がない）
const S1 = '<polygon data-part="box" data-part-id="d" points="600,300 700,400 600,500 500,400"/>' + BOX('p', 100, 350, 100, 100) + BOX('q', 1000, 350, 100, 100)
  + EDGE('p→q#2', LINE(200, 310, 570, 310))   // ひし形の外接矩形の中だが、形の外
  + EDGE('p→q', LINE(200, 400, 1000, 400));   // ひし形を通る
const S2 = BOX('x', 500, 300, 200, 100) + BOX('@head', 1000, 500, 150, 100)
  + EDGE('@tail→@head', LINE(100, 550, 1050, 550))                          // 背骨：@head の中まで入るが、先の箱
  + EDGE('p1→@spine', LINE(400, 200, 600, 200) + LINE(600, 200, 600, 560)); // 2 本目の線が x を通る。p1・@spine の箱はない
const S3 = EDGE('a→b', LINE(100, 200, 1100, 200))
  + T('a→b', 'edge', 500, 215, '自分の線') + T('k', 'box', 200, 215, '箱の字') + T('c→d', 'edge', 800, 215, '縁取り', 'data-part-halo')
  + T('m', 'box', 600, 400, '基線')   // 40px の BIZ UDPGothic：字の範囲は 400 − 34.4 = 365.6 から 400 + 4.8 = 404.8
  + EDGE('g1→g2', LINE(560, 363, 900, 363)) + EDGE('g3→g4', LINE(560, 372, 900, 372))
  + EDGE('g5→g6', LINE(560, 407, 900, 407)) + EDGE('g7→g8', LINE(560, 401, 900, 401));
const S4 = T('u1', 'box', 100, 200, '重なる字') + T('u2', 'box', 150, 210, '重なる')
  + T('v1', 'box', 100, 400, '離れた字') + T('v2', 'box', 100, 470, '離れた字')
  + '<g transform="translate(700,200)"><circle data-part="mark" data-part-id="p1" cx="0" cy="0" r="10"/></g>'
  + T('p1', 'mark', 702, 210, '点一', 'data-part-at="outside"') + T('w', 'box', 698, 210, '他の字', 'text-anchor="end"')
  + `<foreignObject data-part="label" data-part-id="fo" data-part-of="box" x="900" y="550" width="300" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font:40px 'BIZ UDPGothic', sans-serif;margin:0">外の字</div></foreignObject>`
  + T('fo2', 'box', 950, 600, '重ね');
const S5 = BOX('n', 100, 100, 200, 100) + T('n', 'box', 200, 165, 'とても長い箱の名前', 'text-anchor="middle"')
  + BOX('o', 600, 100, 200, 100) + T('o', 'box', 700, 165, 'とても長い箱の名前', 'text-anchor="middle" data-part-at="outside"')
  + BOX('r', 100, 400, 300, 100) + T('r', 'box', 250, 465, '収まる', 'text-anchor="middle"');
const SLIDES = [slide(S0), slide(S1), slide(S2), slide(S3), slide(S4), slide(S5), slide(S0 + S3 + S4 + S5, 'slide layout-tate')];

const b = await launch();
try {
  const page = await b.newPage({ viewport: { width: 700, height: 800 } });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${SLIDES.join('\n')}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`window.__geometryScan = ${geometryScan}; window.__geometryTate = ${geometryTate}`);
  const scan = (i) => page.evaluate(([i, o]) => window.__geometryScan(document.querySelectorAll('section')[i], o), [i, GEO]);
  const only = (rs, code) => rs.filter((r) => r.code === code);
  const near = (got, want, d = 3) => assert.ok(got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= d), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

  await t('geoEdgeThroughBox: a line and a path through a box that is neither end; not the own box border, a line along a border, or a hidden line', async () => {
    const rs = await scan(0);
    const xs = only(rs, 'geoEdgeThroughBox');
    assert.deepEqual(xs.map((x) => `${x.a.edge}|${x.a.box}|${x.sev}`), ['a→c|b|warn', 'a→c#3|b|warn']);
    near(xs[0].a.seg, [503, 150, 697, 150]);
    assert.deepEqual([xs[0].a.from, xs[0].a.to], ['a', 'c']);
    assert.ok(xs[0].a.seg.every(Number.isInteger), 'rounded coordinates');
    assert.deepEqual(rs.filter((r) => r.code !== 'geoEdgeThroughBox'), []);
  });
  await t('polygon box: measured by its shape (a line inside the bounding box but outside the diamond is fine)', async () => {
    const xs = await scan(1);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.edge}|${x.a.box}`), ['geoEdgeThroughBox|p→q|d']);
    near(xs[0].a.seg, [503, 400, 697, 400]);
  });
  await t('two line elements in one edge are measured separately; "@" ends are not nodes (no box needed, the own @ box is excluded)', async () => {
    const xs = await scan(2);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.edge}|${x.a.box}`), ['geoEdgeThroughBox|p1→@spine|x']);
    near(xs[0].a.seg, [600, 303, 600, 397]);
  });
  await t('geoLineOverLabel: not the label of its own edge; halo → info; the vertical band is baseline − up·em … baseline + down·em', async () => {
    const xs = only(await scan(3), 'geoLineOverLabel');
    assert.deepEqual(xs.map((x) => `${x.a.edge}|${x.a.label}|${x.a.of}|${x.sev}`).sort(), ['a→b|c→d|edge|info', 'a→b|k|box|warn', 'g3→g4|m|box|warn', 'g7→g8|m|box|warn']);
    const k = xs.find((x) => x.a.label === 'k');
    assert.equal(k.a.t, '箱の字');
    assert.equal(k.a.at[1], 200);
    assert.equal(xs.find((x) => x.a.label === 'c→d').a.halo, true);
  });
  await t('geoLabelOverlap: two labels, a label over a mark that is not its own, and a foreignObject label measured by Range', async () => {
    const xs = only(await scan(4), 'geoLabelOverlap');
    assert.deepEqual(xs.map((x) => `${x.a.label}|${x.a.other}|${x.a.mark}`).sort(), ['fo|fo2|false', 'u1|u2|false', 'w|p1|true']);
    const m = xs.find((x) => x.a.mark);
    assert.equal(m.a.otherOf, 'mark');
    assert.ok(m.a.rect[0] >= 688 && m.a.rect[2] <= 700, JSON.stringify(m.a.rect));
  });
  await t('geoLabelOutsideBox: overflow per side; data-part-at="outside" is not checked; a label that fits is fine', async () => {
    const xs = await scan(5);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.box}`), ['geoLabelOutsideBox|n']);
    const px = xs[0].a.px;
    assert.ok(px.left > 50 && px.right > 50 && Math.abs(px.left - px.right) <= 2 && px.top === 0 && px.bottom === 0, JSON.stringify(px));
    near(xs[0].a.boxRect, [100, 100, 300, 200], 1);
  });
  await t('a vertical slide (layout-tate) is not measured', async () => {
    assert.deepEqual(await scan(6), []);
  });
  // 印の付いた字を体裁の検査（layoutScan の textOverlap・svgTextBox）から外すのは、図の形の点検が測るスライドだけ（d5 11/12）。
  // 縦書きのスライドは図の形の点検が測らないので、重なる印の字も箱を越える印の字も体裁の検査が知らせる
  await t('marked labels leave textOverlap/svgTextBox to geometry only where geometry runs: a vertical slide still gets them from layoutScan', async () => {
    await page.evaluate(`window.__layoutScan = ${layoutScan}`);
    const lay = (i) => page.evaluate((i) => window.__layoutScan(document.querySelectorAll('section')[i], { JA: true, refRe: '文献', clip: 'data-clip', annot: 'data-annot', overlap: 'data-overlap' }), i);
    const codes = (rs) => rs.map((r) => r.code);
    const h4 = codes(await lay(4)), h5 = codes(await lay(5)), v = codes(await lay(6));
    assert.ok(!h4.includes('textOverlap'), 'horizontal: overlapping marked labels are left to geoLabelOverlap: ' + h4);
    assert.ok(!h5.includes('svgTextBox'), 'horizontal: a marked box label past its box is left to geoLabelOutsideBox: ' + h5);
    assert.ok(v.includes('textOverlap'), 'vertical: overlapping marked labels still get textOverlap: ' + v);
  });
  await t('geometryTate: marked vertical slides of a mixed lesson; 0 when every content slide is vertical or none has marks', async () => {
    const r = await page.evaluate(() => {
      const mk = (cls, marked) => { const s = document.createElement('section'); s.className = cls; if (marked) s.innerHTML = '<svg><rect data-part="box" data-part-id="a"/></svg>'; return s; };
      return [
        window.__geometryTate([mk('slide cover'), mk('slide', true), mk('slide layout-tate', true), mk('slide layout-tate', false)]),
        window.__geometryTate([mk('slide cover'), mk('slide layout-tate', true), mk('slide sec'), mk('slide noconcl layout-tate', true)]),
        window.__geometryTate([mk('slide', true), mk('slide layout-tate', false)]),
      ];
    });
    assert.deepEqual(r, [1, 0, 0]);
  });
} finally { await b.close(); }
console.log(`\n${n - fail}/${n} passed`);
process.exitCode = fail ? 1 : 0;
