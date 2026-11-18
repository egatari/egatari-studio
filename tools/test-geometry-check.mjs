// 描いた図の形の点検（kit/core/geometry-check.mjs、backlog #201、R-geometry）の試験。パーツの印（data-part）を付けた手書きの SVG を
// 0.5 倍に縮めたスライドに置き、スライドの座標（1280×720）で測れることを確かめる。
//   - geoEdgeThroughBox：元でも先でもない箱を通る線（<line> と <path>）。自分の箱の縁で終わる線・縁に沿う線（余裕：線の太さの半分 ＋ 2px）・隠れた線は出ない。
//     ひし形の箱（<polygon>）は形で測る（外接矩形の中でも形の外なら出ない）。1 つの辺の 2 本の線は別々に測る。@ で始まる端は節でない（箱がなくても測る）
//   - geoLineOverLabel：自分の辺の字は除く。縁取り（data-part-halo）があれば情報。字の範囲は基線から上 up・下 down（kit/core/text-band.mjs の値）
//   - geoLabelOverlap：字どうし・持ち主でない点。foreignObject の字は中身を Range で測る
//   - geoLabelOutsideBox：data-part-at="outside" の字は見ない。<circle>・<ellipse>・<polygon> の箱は形と比べる（外接矩形の中でも形の外なら出る）
//   - 縦書きのスライドは測らない。geometryTate は縦横が混ざる教材の、印のある縦書きのスライドの数
//   - 箱に <circle>（形で測る）。辺の端に点（mark）の id：その点の字とその点を中に持つ箱は相手にしない。data-overlap="ok"（要素か祖先の <g>）は重なりの知らせから外す（handoff #45 の決定 1〜3）。
//     どれも、印を付けない対照（わざと重ねたもの）は今までどおり出る
//   - geoOutsideFrame（handoff #46）：data-within の図形が data-frame の枠の外に出る。geometryWithin が全部のステップで測る（途中のステップだけのはみ出しも出る）。<g> は中の形と字の全部。名前でない値は測らない
//   node tools/test-geometry-check.mjs
import assert from 'node:assert/strict';
import { shareBrowser, launch } from '../kit/browser.mjs';
import { geometryScan, geometryWithin, geometryTate, WITHIN_ATTRS } from '../kit/core/geometry-check.mjs';
import { layoutScan, withLayoutScan, GEO_OPTS, OVERLAP_ATTR } from '../kit/core/layout-scan.mjs';
import { TEXT_BANDS, DEFAULT_BAND, textBand } from '../kit/core/text-band.mjs';
import { message, MESSAGES } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
// ブラウザは 1 つだけ起動する（kit/browser.mjs の shareBrowser）
await shareBrowser();

const GEO = GEO_OPTS;
const CODES = ['geoEdgeThroughBox', 'geoLineOverLabel', 'geoLabelOverlap', 'geoLabelOutsideBox', 'geoOutsideFrame', 'geoTateSlides'];
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
  // 枠の外：図形の id・ステップ・はみ出した量（px）を言う。外に出るステップが 2 つ以上なら一覧も
  const w = { shape: 'chr', frame: 'cell', step: '2', px: 41, at: [978, 341], steps: ['1', '2', 'concl'] };
  assert.ok(message('ja', 'geoOutsideFrame', w).startsWith('図形 chr が枠 cell の外に出る（41px、ステップ 2、978, 341。外に出るステップは 1・2・結論）：そのステップの図形 chr の位置か大きさを、パーツのデータか図の座標で変えて、枠 cell の内側に収める（枠を大きくしてもよい）'), message('ja', 'geoOutsideFrame', w));
  assert.match(message('en', 'geoOutsideFrame', { ...w, steps: ['2'] }), /^figure shape chr goes outside frame cell \(by 41px at step 2, at 978, 341\): at that step, move or shrink shape chr/);
  assert.match(message('ja', 'geoOutsideFrame', { ...w, step: 'concl', steps: ['concl'] }), /（41px、結論のステップ、/);
});
await t('attribute names: data-overlap comes from OVERLAP_ATTR, data-within and data-frame from WITHIN_ATTRS only', () => {
  assert.deepEqual([GEO_OPTS.overlap, GEO_OPTS.within, GEO_OPTS.frame], [OVERLAP_ATTR, WITHIN_ATTRS.within, WITHIN_ATTRS.frame]);
  for (const f of [geometryScan, geometryWithin, geometryTate]) assert.ok(!/['"`]data-(within|frame|overlap)/.test(String(f)), 'no attribute name written as a string inside ' + f.name);
});
await t('injection: the scanner is self-contained, has no </script or <!--, and the editor wrapper passes it with the band table', () => {
  for (const f of [geometryScan, geometryWithin, geometryTate]) assert.ok(!/<\/script|<!--/i.test(String(f)));
  const g = new Function('return ' + withLayoutScan('(function(){return [typeof geometryScan, typeof geometryWithin, typeof geometryTate, GEO_OPTS];})'))()();
  assert.deepEqual(g, ['function', 'function', 'function', JSON.parse(JSON.stringify(GEO))]);
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
// 7：箱に <circle>（形で測る：外接矩形の中でも円の外なら出ない）
const S7 = '<circle data-part="box" data-part-id="cc" cx="640" cy="200" r="100"/>'
  + EDGE('p→q', LINE(500, 200, 780, 200))      // 円を通る
  + EDGE('p→q#2', LINE(540, 115, 580, 115));   // 外接矩形の中だが、円の外
// 8：辺の端に点（mark）の id。点 pt は領域 R の中にあり、引き出し線は R の中から出て pt の字に入る（出ない）。
//    対照：点 p2 からの線は、つないでいない箱 B2 を通り、別の点 p3 の字を横切る（出る）
const MK = (id, x, y) => `<circle data-part="mark" data-part-id="${id}" cx="${x}" cy="${y}" r="8"/>`;
const S8 = BOX('R', 100, 100, 400, 300) + MK('pt', 300, 250) + T('pt', 'mark', 700, 260, '点の名前', 'data-part-at="outside"')
  + '<g data-part="edge" data-part-id="pt→@lbl" data-part-from="pt" data-part-to="@lbl">' + LINE(300, 250, 720, 250) + '</g>'
  + MK('p2', 300, 550) + BOX('B2', 600, 500, 100, 100) + MK('p3', 850, 600) + T('p3', 'mark', 900, 560, '別の点', 'data-part-at="outside"')
  + '<g data-part="edge" data-part-id="p2→@far" data-part-from="p2" data-part-to="@far">' + LINE(300, 550, 1150, 550) + '</g>';
// 9：data-overlap="ok"。印のある箱・字・辺（祖先の <g> の印も）は重なりの知らせから外れる。対照：印のないもの、値が "OK" のもの（効かない）。
//    箱の縁を越える字（geoLabelOutsideBox）は重なりでないので、印があっても出る
const S9 = BOX('ob', 100, 50, 100, 100).replace('<rect ', '<rect data-overlap="ok" ') + EDGE('x→y', LINE(50, 100, 250, 100))
  + BOX('cb', 400, 50, 100, 100) + EDGE('x2→y2', LINE(350, 100, 550, 100))
  + T('o1', 'box', 100, 300, '重なる字', 'data-overlap="ok"') + T('o2', 'box', 150, 310, '重なる')
  + T('o3', 'box', 600, 300, '重なる字') + T('o4', 'box', 650, 310, '重なる')
  + '<g data-overlap="ok"><g>' + T('o5', 'box', 100, 460, '線の下の字') + '</g></g>' + EDGE('e5→e6', LINE(50, 450, 400, 450))
  + T('o6', 'box', 600, 460, '線の下の字', 'data-overlap="OK"') + EDGE('e7→e8', LINE(550, 450, 900, 450))
  + EDGE('e9→e10', LINE(50, 650, 400, 650), 'data-overlap="ok"') + T('o7', 'box', 100, 660, '線の下の字')
  + BOX('ow', 900, 600, 100, 60) + T('ow', 'box', 950, 645, 'とても長い字', 'text-anchor="middle" data-overlap="ok"');
// 10：箱の字（geoLabelOutsideBox）を、円・楕円・ひし形の箱では形と比べる。c1・e1・d1 の字は外接矩形の中だが形の外（出る）。c2・e2・d2 の字は形の中（出ない）
const CENTER = (id, x, y) => T(id, 'box', x, y, '中', 'text-anchor="middle"');
const S10 = '<circle data-part="box" data-part-id="c1" cx="200" cy="200" r="100"/>' + T('c1', 'box', 115, 145, '角')
  + '<circle data-part="box" data-part-id="c2" cx="200" cy="500" r="100"/>' + CENTER('c2', 200, 515)
  + '<ellipse data-part="box" data-part-id="e1" cx="600" cy="200" rx="150" ry="80"/>' + T('e1', 'box', 460, 165, '角')
  + '<ellipse data-part="box" data-part-id="e2" cx="600" cy="500" rx="150" ry="80"/>' + CENTER('e2', 600, 515)
  + '<polygon data-part="box" data-part-id="d1" points="1000,100 1100,200 1000,300 900,200"/>' + T('d1', 'box', 910, 145, '角')
  + '<polygon data-part="box" data-part-id="d2" points="1000,400 1100,500 1000,600 900,500"/>' + CENTER('d2', 1000, 515);
const SLIDES = [slide(S0), slide(S1), slide(S2), slide(S3), slide(S4), slide(S5), slide(S0 + S3 + S4 + S5, 'slide layout-tate'), slide(S7), slide(S8), slide(S9), slide(S10)];

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
  await t('circle box: measured by its shape (a line inside the bounding box but outside the circle is fine)', async () => {
    const xs = await scan(7);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.edge}|${x.a.box}`), ['geoEdgeThroughBox|p→q|cc']);
    near(xs[0].a.seg, [543, 200, 737, 200]);
  });
  await t('edge ends naming marks: the end mark\'s label and the box holding the end mark are not obstacles; other boxes and labels still are', async () => {
    const xs = await scan(8);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.edge}|${x.a.box || x.a.label}`).sort(), ['geoEdgeThroughBox|p2→@far|B2', 'geoLineOverLabel|p2→@far|p3']);
  });
  await t('data-overlap="ok" on a box, a label, an ancestor <g> or an edge removes its overlap findings; unmarked and "OK" controls are still reported; geoLabelOutsideBox stays', async () => {
    const xs = await scan(9);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.edge || x.a.label || x.a.box}|${x.a.box || x.a.other || x.a.label}`).sort(), [
      'geoEdgeThroughBox|x2→y2|cb', 'geoLabelOutsideBox|ow|ow', 'geoLabelOverlap|o3|o4', 'geoLineOverLabel|e7→e8|o6',
    ]);
  });
  await t('geoLabelOutsideBox on circle, ellipse and polygon boxes compares with the shape: a label inside the bounding box but outside the shape is reported, a label inside the shape is not', async () => {
    const xs = await scan(10);
    assert.deepEqual(xs.map((x) => `${x.code}|${x.a.box}`), ['geoLabelOutsideBox|c1', 'geoLabelOutsideBox|e1', 'geoLabelOutsideBox|d1']);
    for (const x of xs) {
      // 外接矩形の中なので、外接矩形と比べたら出ない字。はみ出しは左上
      const [l, tp] = x.a.rect;
      assert.ok(l >= x.a.boxRect[0] && tp >= x.a.boxRect[1], JSON.stringify(x.a));
      assert.ok(x.a.px.left > 2 && x.a.px.top > 2 && x.a.px.right === 0 && x.a.px.bottom === 0, JSON.stringify(x.a.px));
    }
    // 円：字の範囲の左上の角（115, 110.6）は円の輪郭から約 23px 外
    assert.ok(Math.hypot(xs[0].a.px.left, xs[0].a.px.top) >= 18 && Math.hypot(xs[0].a.px.left, xs[0].a.px.top) <= 28, JSON.stringify(xs[0].a.px));
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
  // ---------------------------------------------------------------- 枠の中（handoff #46）
  // 分裂期の細胞（backlog #91 の DNA の再現）：楕円の細胞 cell の中の染色体 chr。ステップ 1 だけ染色体が細胞の右へ 40px 出る（最後のステップでは中に戻る）。
  // ステップは data-k の要素を出し入れする seek で作る（kit/deck.js の DECK.seek の代わり）
  const CELL = '<ellipse data-frame="cell" cx="640" cy="360" rx="300" ry="200" style="stroke-width:2"/>';
  const CHR = (k, x) => `<rect data-k="${k}" data-part-id="chr" data-within="cell" x="${x}" y="340" width="80" height="40" style="stroke-width:4"/>`;
  const W0 = CELL + CHR(0, 600) + CHR(1, 900) + CHR(2, 820);                      // ステップ 1 だけ外（右端 980、楕円の右端は y=340 で 938.5）
  const W1 = CELL + CHR(0, 600) + CHR(1, 820) + CHR(2, 600);                      // 対照：ずっと中
  // 表のマス：同じ名前の枠が 2 つ（よく収まるほうと比べる）。字の図形は字の範囲で測る。2 つ目の字はマスの右へはみ出す
  const W2 = '<rect data-frame="cell" x="100" y="100" width="300" height="80"/><rect data-frame="cell" x="400" y="100" width="300" height="80"/>'
    + '<text data-k="0" data-within="cell" data-part-id="t1" x="420" y="155" style="fill:#000;stroke:none">収まる</text>'
    + '<text data-k="0" data-within="cell" data-part-id="t2" x="120" y="155" style="fill:#000;stroke:none">マスからはみ出す長い字</text>';
  // 枠の名前が合わない図形・枠のない図形は測らない。宣言のない図形（data-within なし）は外に出ていても見ない
  const W3 = CELL + '<rect data-k="0" data-within="nucleus" x="900" y="340" width="80" height="40"/>' + '<rect data-k="0" x="900" y="400" width="80" height="40"/>';
  // <g> の図形は中の形と字の全部で測る：grp は中の四角は収まるが字が細胞の右へ出る（出る）。grp2 は字も中（出ない）
  const W4 = CELL + '<g data-k="0" data-within="cell" data-part-id="grp"><rect x="600" y="340" width="40" height="40"/><text x="860" y="375" style="fill:#000;stroke:none">はみ出す字</text></g>'
    + '<g data-k="0" data-within="cell" data-part-id="grp2"><rect x="500" y="300" width="40" height="40"/><text x="500" y="420" style="fill:#000;stroke:none">中</text></g>';
  // 名前は 1 つ（[a-z][a-z0-9-]*）。並べた名前・大文字・前の空白・空の値は印でないとみなし、外に出ていても測らない（data-part の知らない値と同じ）。
  // 枠の側の値が名前でなければ、どの図形とも合わない
  const W5 = CELL + '<rect data-k="0" data-within="cell nucleus" x="900" y="340" width="80" height="40"/><rect data-k="0" data-within="Cell" x="900" y="400" width="80" height="40"/>'
    + '<rect data-k="0" data-within=" cell" x="900" y="300" width="80" height="40"/><rect data-k="0" data-within="" x="900" y="250" width="80" height="40"/>'
    + '<rect data-frame="box a" x="100" y="100" width="50" height="50"/><rect data-k="0" data-within="box" x="300" y="100" width="50" height="50"/>';
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${[W0, W1, W2, W3, W0, W4, W5].map((x, i) => slide(x, i === 4 ? 'slide layout-tate' : 'slide')).join('\n')}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`window.__geometryScan = ${geometryScan}; window.__geometryWithin = ${geometryWithin}`);
  const walk = (i, cstep = -1) => page.evaluate(([i, o, cstep]) => {
    const s = document.querySelectorAll('section')[i];
    s._max = 2; s._cstep = cstep;
    const seen = [];
    const seek = (k) => { seen.push(k); s.querySelectorAll('[data-k]').forEach((e) => { e.style.display = +e.getAttribute('data-k') === k ? '' : 'none'; }); };
    return { out: window.__geometryWithin(s, o, seek, window.__geometryScan), seen, plain: window.__geometryScan(s, o) };
  }, [i, GEO, cstep]);
  await t('geoOutsideFrame: a chromosome out of the cell at a middle step only is found (every step walked; id, step, overshoot in px)', async () => {
    const r = await walk(0);
    assert.deepEqual(r.seen, [0, 1, 2]);
    assert.deepEqual(r.out.map((x) => `${x.code}|${x.sev}|${x.a.shape}|${x.a.frame}|${x.a.step}|${x.a.steps.join(',')}`), ['geoOutsideFrame|warn|chr|cell|1|1']);
    // はみ出しの量：角（980, 340）から楕円まで約 41px ＋ 図形の線の半分 2 − 枠の線の半分 1
    assert.ok(r.out[0].a.px >= 38 && r.out[0].a.px <= 46, JSON.stringify(r.out[0].a));
    assert.ok(r.out[0].a.at[0] >= 970 && r.out[0].a.at[0] <= 982, JSON.stringify(r.out[0].a.at));
    // 最後のステップ（2）だけを測る geometryScan には出ない（それが #91 の見逃し）
    assert.deepEqual(r.plain, []);
  });
  await t('geoOutsideFrame: the conclusion step is named concl', async () => {
    const r = await walk(0, 1);
    assert.deepEqual([r.out[0].a.step, r.out[0].a.steps], ['concl', ['concl']]);
  });
  await t('geoOutsideFrame control: a chromosome that stays inside the cell at every step is not reported', async () => {
    assert.deepEqual((await walk(1)).out, []);
  });
  await t('geoOutsideFrame: text measured by its band; several frames with one name (a table\'s cells) compare with the best-fitting one', async () => {
    const xs = (await walk(2)).out;
    assert.deepEqual(xs.map((x) => `${x.a.shape}|${x.a.frame}`), ['t2|cell']);
    assert.ok(xs[0].a.px > 20, JSON.stringify(xs[0].a));
  });
  await t('geoOutsideFrame: only declared shapes with a matching visible frame are measured; vertical slides are not walked', async () => {
    assert.deepEqual((await walk(3)).out, []);
    const r = await walk(4);
    assert.deepEqual([r.out, r.seen], [[], []]);
  });
  await t('geoOutsideFrame: a <g> is measured by every shape and text inside it', async () => {
    const xs = (await walk(5)).out;
    assert.deepEqual(xs.map((x) => `${x.a.shape}|${x.a.frame}|${x.a.step}`), ['grp|cell|0']);
    assert.ok(xs[0].a.at[0] > 940, JSON.stringify(xs[0].a));
  });
  await t('geoOutsideFrame: a value that is not one name ([a-z][a-z0-9-]*) is not a mark (lists, capitals, spaces, empty), on the shape or the frame', async () => {
    assert.deepEqual((await walk(6)).out, []);
  });
} finally { await b.close(); }
console.log(`\n${n - fail}/${n} passed`);
process.exitCode = fail ? 1 : 0;
