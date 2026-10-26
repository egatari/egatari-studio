// 同じ状態を 2 回描いた画面の比べ方（kit/render-compare.mjs）の試験
//   node tools/test-render-compare.mjs [作業フォルダ]
// 決定性（tools/test-components.mjs）・入り直したときの戻り（tools/test-step-reset.mjs）・品質チェックの「呼び出し順に依存」（kit/check.mjs の D）が共通で使う：
//   部品の DOM がバイトまで同じで、違いが NOISE_BOUNDS の内側（はっきり違う画素がどれも図形の縁の 1 px 以内・部品の箱の中、数が部品の面積の 0.1 % 以下かつ 200 以下）
//   なら描き方の揺れとして成功（知らせ）。DOM が同じでも外側なら失敗。DOM が違う・比べる DOM がない（canvas など）ときは今までの基準（はっきり違う画素が 40 以下）だけ
// 1. diffStats・judgeRenders（作った RGBA の画面で）
// 2. ブラウザ：domSnapshot（shadow DOM を含む・何もそろえない・canvas は null・部品の箱と面積）と、本物の画面に縁のアンチエイリアスの揺れ・大きな違いを足した compareRenders
// 3. 品質チェックの D：DOM に出ない形で画素だけを変える試験用の部品（tools/fixtures/render-noise の m-noise）。縁の揺れだけのスライドは compOrder を出さず
//    （compOrderNoise に記録する）、円が 40 px 動くスライドは出す
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { diffStats, faintOff, judgeRenders, describeRender, noiseCap, compareRenders, domSnapshot, noiseLog, NOISE_BOUNDS, LEGACY_TOL } from '../kit/render-compare.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-render-compare-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};

// ---- 1. 作った RGBA の画面
// 白地に黒い四角（20〜39）。縁の外側の列（x = 19）の画素を灰色にすると、縁のアンチエイリアスの揺れと同じ形の違いになる
const W = 60, H = 60;
const img = (paint) => {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x, y, v) => { const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = v; };
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) set(x, y, 0);
  if (paint) paint(set);
  return d;
};
const A = img();
const DOM = '<m-x a="1"><svg></svg></m-x>';
// 部品の写し（domSnapshot の形）：部品の箱は四角の 2 px 外まで（[18, 18, 41, 41]）、面積は 1280×720 の画面の大きな部品のつもりで 400 000 px（上限 200）
const snap = (dom = DOM, area = 400000, rects = [[18, 18, 41, 41]]) => ({ dom, area, rects });
const OPT = { strong: NOISE_BOUNDS.strong, edgePx: NOISE_BOUNDS.edgePx, pad: NOISE_BOUNDS.boxPad, rects: snap().rects };
const judged = (s, sa = snap(), sb = snap()) => ({ ...s, ...judgeRenders(s, sa, sb), compArea: sa ? sa.area : 0 });
await t('diffStats: a few anti-aliasing pixels on the edge are counted, none of them away from an edge or outside the part', () => {
  const s = diffStats(A, img((set) => { for (let y = 22; y < 30; y++) set(19, y, 128); }), W, H, OPT);
  assert.deepEqual([s.exact, s.n, s.off, s.out, s.area], [false, 8, 0, 0, W * H]);
  assert.deepEqual(s.box, [19, 22, 19, 29]);
});
await t('diffStats: identical images are exact; faint differences (≤ 48) are not counted', () => {
  assert.equal(diffStats(A, img(), W, H, OPT).exact, true);
  const s = diffStats(A, img((set) => set(5, 5, 240)), W, H, OPT);
  assert.deepEqual([s.exact, s.n, s.off], [false, 0, 0]);
});
await t('diffStats: a dot or a block in a flat area is away from any edge; outside the part box it is counted as outside', () => {
  const dot = diffStats(A, img((set) => set(5, 5, 0)), W, H, OPT);
  assert.deepEqual([dot.n, dot.off, dot.out], [1, 1, 1]);
  const blk = diffStats(A, img((set) => { for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) set(x, y, 0); }), W, H, OPT);
  assert.equal(blk.n, 100);
  assert.ok(blk.off > 0, `off ${blk.off}`);
  // 縁にあっても部品の箱の外（別の四角の縁）
  const other = diffStats(A, img((set) => { for (let y = 2; y < 8; y++) { set(50, y, 0); set(51, y, 128); } }), W, H, OPT);
  assert.equal(other.out, other.n);
});
await t('NOISE_BOUNDS / noiseCap: a fraction of the component area, at most an absolute cap', () => {
  assert.deepEqual({ ...NOISE_BOUNDS }, { strong: 48, edgePx: 1, boxPad: 2, capFrac: 0.001, capPx: 200, offMax: 4, offMaxCh: 24 });
  assert.equal(noiseCap(1280 * 720), 200);
  assert.equal(noiseCap(400 * 300), 120);
  assert.equal(noiseCap(100 * 100), 10);
});
await t('judgeRenders: byte-identical DOM + a few edge pixels inside the part → accepted, with a note', () => {
  const s = diffStats(A, img((set) => { for (let y = 20; y < 40; y++) set(19, y, 128); }), W, H, OPT);
  const r = judged(s);
  assert.deepEqual([r.same, r.kind, r.cap], [true, 'noise', 200]);
  assert.match(describeRender(r), /20 pixel\(s\) clearly differ .*all within 1 px of an edge, inside the component; component DOM byte-identical; cap 200 .*accepted as renderer anti-aliasing noise/);
});
await t('judgeRenders: byte-identical DOM, differences near an edge but too many → fail', () => {
  // 四角の縁の 4 辺を 1 周ずつ灰色にする（どれも縁にあるが 80 + 76 px）。小さな部品（面積 50 000 px → 上限 50）では多すぎる
  const many = diffStats(A, img((set) => { for (let k = 19; k <= 40; k++) { set(k, 19, 128); set(k, 40, 128); set(19, k, 128); set(40, k, 128); } }), W, H, OPT);
  assert.equal(many.off, 0); assert.equal(many.out, 0);
  assert.ok(many.n > 50, `n ${many.n}`);
  const r = judged(many, snap(DOM, 50000), snap(DOM, 50000));
  assert.deepEqual([r.same, r.kind, r.cap], [false, 'pixels', 50]);
  assert.equal(judged(many).same, true, 'the same differences are within the cap of a big part');
  // 上限の 200 を超える数（大きな部品でも）
  assert.equal(judged({ exact: false, n: 201, off: 0, out: 0 }, snap(DOM, 1e7), snap(DOM, 1e7)).same, false);
});
await t('judgeRenders: byte-identical DOM + a block away from edges, or a difference outside the part → fail', () => {
  const block = diffStats(A, img((set) => { for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) set(x, y, 0); }), W, H, OPT);
  assert.equal(judged(block).same, false, 'a 10×10 block (100 px, under the cap) is not on an edge');
  assert.equal(judged({ exact: false, n: 3, off: 0, out: 1 }).same, false);
});
await t('judgeRenders: a DOM that is not byte-identical (even whitespace) → no noise allowance, only the old rule (≤ 40)', () => {
  const s = { exact: false, n: 60, off: 0, out: 0 };
  assert.equal(judged(s).same, true);
  const r = judged(s, snap(), snap(DOM.replace('a="1"', 'a="2"')));
  assert.deepEqual([r.same, r.kind], [false, 'dom']);
  assert.equal(judged(s, snap('<m-x style="fill:x;">'), snap('<m-x style="fill: x;">')).same, false);
  assert.equal(judged({ exact: false, n: 3, off: 3, out: 0 }, snap(), snap(DOM + ' ')).same, true, 'the old tolerance of 40 still applies');
  assert.equal(judged(diffStats(A, img(), W, H, OPT), snap(), snap(DOM + 'x')).same, true, 'pixel-identical renders pass');
});
await t('judgeRenders: no DOM to compare (canvas) → the old pixel-count rule (≤ 40)', () => {
  assert.deepEqual(judgeRenders({ exact: false, n: LEGACY_TOL, off: LEGACY_TOL, area: 1 }, snap(null), snap(null)), { same: true, kind: 'legacy', cap: LEGACY_TOL });
  assert.equal(judgeRenders({ exact: false, n: LEGACY_TOL + 1, off: 0, out: 0 }, snap(null), snap()).same, false);
});
await t('noiseLog: logs only the accepted noise, with where it happened, and counts them', () => {
  const L = noiseLog();
  L.add('tree slide 1 step 4', { kind: 'noise', n: 45, cap: 200 });
  L.add('tree slide 1 step 5', { kind: 'exact', n: 0 });
  L.add('venn slide 2 step 4', { kind: 'legacy', n: 3 });
  L.add('cycle slide 1 step 5', { kind: 'noise', n: 2, cap: 200, faint: 2 });
  assert.equal(L.count, 2); assert.equal(L.faintCount, 1);
  const P = process.platform;
  assert.equal(L.summary('x'), `x: 2 (of which 1 with isolated faint off-edge pixels)\n  [${P}] tree slide 1 step 4: 45 px (cap 200)\n  [${P}] cycle slide 1 step 5: 2 px (cap 200), 2 isolated faint off-edge px`);
});
// 縁から遠い、ばらばらでわずかな違い（macOS の CI の m-cycle）：白地の平らなところ（部品の箱の中）の画素を、各チャンネル d だけ変える
const OPT2 = { ...OPT, rects: [[0, 0, 59, 59]] };
const faintAt = (pts, d) => diffStats(A, img((set) => { for (const [x, y] of pts) set(x, y, 255 - d); }), W, H, OPT2);
const sq = snap(DOM, 400000, [[0, 0, 59, 59]]);
await t('faint off-edge: 2 isolated non-edge pixels with a small difference (20/255 per channel) → accepted, with a note', () => {
  const s = faintAt([[5, 5], [10, 50]], 20);
  assert.deepEqual([s.n, s.off, s.out], [2, 2, 0]);
  const r = judged(s, sq, sq);
  assert.deepEqual([r.same, r.kind, r.faint], [true, 'noise', 2]);
  assert.match(describeRender(r), /2 isolated faint pixel\(s\) away from edges \(each channel <= 24\/255, at most 4\).*accepted/);
});
await t('faintOff: off-edge pixels that touch each other are not isolated', () => {
  // （平らなところで隣り合う 2 つの違いは、互いを縁とみなして diffStats では縁の画素になるので、ここでは faintOff だけを直に確かめる）
  assert.equal(faintOff({ off: 2, offPts: [[5, 5, 20], [6, 6, 20]] }), false);
  assert.equal(faintOff({ off: 2, offPts: [[5, 5, 20], [7, 5, 20]] }), true);
});
await t('faint off-edge: 4 pass; 5 such pixels fail', () => {
  const four = [[5, 5], [10, 50], [50, 5], [50, 50]];
  assert.equal(judged(faintAt(four, 20), sq, sq).same, true);
  const r = judged(faintAt([...four, [5, 50]], 20), sq, sq);
  assert.deepEqual([r.same, r.kind], [false, 'pixels']);
});
await t('faint off-edge: 1 non-edge pixel with a large difference (200 per channel) fails; so does 25/255, and outside the component box', () => {
  assert.equal(judged(faintAt([[5, 5]], 200), sq, sq).same, false);
  assert.equal(judged(faintAt([[5, 5]], 25), sq, sq).same, false, '25/255 is over the limit');
  assert.equal(judged(faintAt([[5, 5]], 24), sq, sq).same, true, '24/255 is at the limit');
  const outside = diffStats(A, img((set) => set(5, 5, 235)), W, H, { ...OPT, rects: [[20, 20, 39, 39]] });
  assert.equal(outside.out, 1);
  assert.equal(judged(outside, sq, sq).same, false, 'outside the component box');
  assert.equal(judged(faintAt([[5, 5]], 20), sq, snap(DOM + ' ', 400000, [[0, 0, 59, 59]])).same, true, 'a different DOM: the old rule (≤ 40) as before');
  assert.equal(judged(faintAt([[5, 5]], 20), sq, snap(DOM + ' ', 400000, [[0, 0, 59, 59]])).kind, 'dom');
});

// ---- 2. ブラウザ
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.setContent(`<!DOCTYPE html><html><head><style>m-a,m-b,m-c{display:block}p{margin:0}</style></head><body style="margin:0;background:#fff">
<m-a id="a"><svg width="400" height="300"><circle cx="200" cy="150" r="80" fill="#222"/></svg>
  <p>  some
   text </p></m-a>
<m-b id="b"></m-b>
<m-c id="c"><canvas width="10" height="10"></canvas></m-c>
<script>customElements.define('m-b', class extends HTMLElement { connectedCallback(){ this.attachShadow({ mode: 'open' }).innerHTML = '<svg width="100" height="100"><rect width="50" height="50"/></svg>'; } });</script>
</body></html>`);
await t('domSnapshot: byte-exact (no normalisation, not even whitespace); the part box and its area', async () => {
  const a1 = await domSnapshot(p, { sel: '#a' });
  assert.equal((await domSnapshot(p, { sel: '#a' })).dom, a1.dom);
  await p.evaluate(() => { document.querySelector('#a p').firstChild.data = ' some text '; });
  assert.notEqual((await domSnapshot(p, { sel: '#a' })).dom, a1.dom);
  await p.evaluate(() => document.querySelector('#a circle').setAttribute('style', 'fill:red;'));
  const s1 = await domSnapshot(p, { sel: '#a' });
  await p.evaluate(() => { const c = document.querySelector('#a circle'); c.style.fill = 'blue'; c.style.fill = 'red'; });
  assert.notEqual((await domSnapshot(p, { sel: '#a' })).dom, s1.dom, '"fill:red;" and "fill: red;" differ');
  await p.evaluate(() => { const c = document.querySelector('#a circle'); c.removeAttribute('style'); c.setAttribute('r', '80.5'); });
  assert.notEqual((await domSnapshot(p, { sel: '#a' })).dom, a1.dom);
  await p.evaluate(() => document.querySelector('#a circle').setAttribute('r', '80'));
  const box = await p.evaluate(() => { const r = document.querySelector('#a').getBoundingClientRect(); return [r.width, r.height]; });
  const a2 = await domSnapshot(p, { sel: '#a' });
  assert.equal(a2.area, Math.ceil(box[0]) * Math.ceil(box[1]));
  assert.equal(a2.rects.length, 1);
  const both = await domSnapshot(p, { sel: '#a, #a svg' });
  assert.equal(both.area, a2.area, 'the area is the union of the boxes');
});
await t('domSnapshot: includes the shadow DOM; a part with a canvas has no DOM to compare (null)', async () => {
  const s1 = (await domSnapshot(p, { sel: '#b' })).dom;
  assert.match(s1, /#shadow-root\(<svg .*<rect width="50" height="50"><\/rect>/);
  await p.evaluate(() => document.querySelector('#b').shadowRoot.querySelector('rect').setAttribute('width', '51'));
  assert.notEqual((await domSnapshot(p, { sel: '#b' })).dom, s1);
  assert.equal((await domSnapshot(p, { sel: '#c' })).dom, null);
});
// 本物の画面（円の縁のアンチエイリアス）を撮り、B を作る：縁の画素（まわりに段差のある画素）の一部を隣の画素の色にする／縁でないところに塊を描く
const perturb = (shot, how) => p.evaluate(async ([s, how]) => {
  const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data, w = c.width;
  if (how.edge) {
    // 円の縁を上から順に見て、灰色（アンチエイリアス）の画素を how.edge 個だけ白か黒に寄せる
    let k = 0;
    for (let j = 0; j < d.length && k < how.edge; j += 4) {
      const v = d[j];
      if (v > 40 && v < 215 && d[j] === d[j + 1]) { const nv = v < 128 ? 255 : 0; d[j] = d[j + 1] = d[j + 2] = nv; k++; j += 4 * 7; }
    }
  }
  if (how.block) for (let y = 600; y < 600 + how.block; y++) for (let x = 900; x < 900 + how.block; x++) { const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = 0; }
  g.putImageData(id, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}, [shot.toString('base64'), how]).then((s) => Buffer.from(s, 'base64'));
const shotA = await p.screenshot();
const domA = await domSnapshot(p, { sel: '#a' });
await t('compareRenders: identical DOM + a few anti-aliasing pixels on a curved edge → pass, with a note', async () => {
  const B = await perturb(shotA, { edge: 60 });
  const r = await compareRenders(p, shotA, B, domA, await domSnapshot(p, { sel: '#a' }));
  assert.ok(r.n >= 40 && r.n <= 200, `n ${r.n}`);
  assert.deepEqual([r.same, r.kind, r.off], [true, 'noise', 0], r.note);
  console.log('     note: ' + r.note);
});
await t('compareRenders: identical DOM + a big difference, or edge noise that is too many → fail', async () => {
  const r = await compareRenders(p, shotA, await perturb(shotA, { block: 30 }), domA, domA);
  assert.deepEqual([r.same, r.kind], [false, 'pixels'], r.note);
  const r2 = await compareRenders(p, shotA, await perturb(shotA, { edge: 400 }), domA, domA);
  assert.ok(r2.n > 200, `n ${r2.n}`);
  assert.deepEqual([r2.same, r2.kind], [false, 'pixels'], r2.note);
});
await t('compareRenders: a different DOM → fail (the same pixels with an identical DOM pass as noise)', async () => {
  const B = await perturb(shotA, { edge: 60 });
  await p.evaluate(() => document.querySelector('#a circle').setAttribute('cx', '201'));
  const r = await compareRenders(p, shotA, B, domA, await domSnapshot(p, { sel: '#a' }));
  assert.deepEqual([r.same, r.kind], [false, 'dom'], r.note);
});
await b.close();

// ---- 3. 品質チェックの D（呼び出し順への依存）
const fx = path.join(ROOT, 'tools/fixtures/render-noise/deck.html');
await t('check D: renderer-like noise with an identical DOM is not flagged but logged (compOrderNoise); a real move is flagged (compOrder)', async () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), fx, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const j = JSON.parse(r.stdout);
  const co = j.results.filter((x) => x.code === 'compOrder').map((x) => `${x.id}:${x.data.k}`);
  assert.deepEqual(co, ['s-big:1', 's-big:2'], r.stdout.slice(0, 2000));
  const nz = j.results.filter((x) => x.code === 'compOrderNoise').map((x) => `${x.id}:${x.data.k}:${x.sev}`);
  assert.deepEqual(nz, ['s-small:1:info', 's-small:2:info'], 'every acceptance is logged (info compOrderNoise)');
});
await t('check D fixture: the small slide really differs in pixels (else the case above proves nothing)', async () => {
  const out = path.join(work, 'render-noise.html');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), fx, '-o', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const b2 = await launch();
  const q = await b2.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await q.goto(fileUrl(out));
    await q.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await q.addStyleTag({ content: '#dt-cb,#deck-toast{display:none!important}' });
    const settle = () => q.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    await q.evaluate(() => DECK.seek(1, 1, 0.4)); await settle();
    const SA = await q.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } }), DA = await domSnapshot(q, 1);
    await q.evaluate(() => { DECK.seek(1, 3, Infinity); DECK.seek(1, 0, Infinity); DECK.seek(1, 1, 0.4); }); await settle();
    const SB = await q.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    const c = await compareRenders(q, SA, SB, DA, await domSnapshot(q, 1));
    assert.deepEqual([c.exact, c.same, c.kind], [false, true, 'noise'], c.note);
    console.log('     note: ' + c.note);
  } finally { await b2.close(); }
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
