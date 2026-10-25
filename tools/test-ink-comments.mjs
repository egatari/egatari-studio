// マーカー（#70：編集モードの間のコメントのペン）の確認：node tools/test-ink-comments.mjs <作業用のフォルダ>
// examples/minimal を作業用のフォルダに写して開発サーバーで開き、次を確かめる：
//   1. 単体：線の決まり（kit/core/comment-core.mjs の normStrokes・entryStrokes・strokesCentroid）と、編集の画面の写し（server/editor-ui.js の
//      strokesOf・entryStrokesOf・strokesCentroidOf）が同じ答え。上限（20 本・1 本 500 点・合わせて 2000 点）、前の形の stroke を 1 本として読む。
//      編集アプリの書き込み（app/devapi.js）も strokes を確かめて残し（前の形の stroke の知らせも strokes で書く）、pin は線の重心、線のない古いコメントもそのまま読める
//   2. 編集モードでないとき m は何もしない。編集モードで m（と編集の板のボタン）でマーカーになり、画面の端が「編集中：マーカー」。
//      スライドの操作の帯のペンのボタンは「マーカー」になる（d とこのボタンは test-edit-modes の表でも確かめる）
//   3. 要素の周りに丸を描く → コメントの欄が開き（引用はその要素）、書きかけの線が重ね（#dev-pins）に出て、舞台（デッキの DOM・描く面）には残らない。
//      欄が開いている間もプレビューは inert にならず、続けて 2 本（矢印・下線）描くと同じメモの線になる（欄は 1 つのまま、重ねに 3 本）
//   4. 残す → comments.json に strokes（3 本。1 本目は期待した外接矩形・0.1 に丸め・500 点まで）、pin は全部の線の重心、src は重心の下の要素。
//      取り消すと描いた線は全部捨てる（次の線は 1 本目から）。前の形（stroke 1 本）のコメントも一覧と重ねに出る
//   5. 一覧を開くと、重ねに印の色の線が出る。Esc でマーカーを切り、編集モードを出ると道具は残らない
//   6. 編集モードでないときの発表のペンはこれまでどおり描ける
//   7. comment-shots の全体と切り抜きの画像に、全部の線の上の画素が印の色で描かれ、切り抜きが全部の線を含む
//   8. 書き出した 1 ファイル（再生専用も、そうでないものも）にコメントは入らない
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { normStroke, normStrokes, entryStrokes, strokesCentroid, strokeCentroid, STROKE_MAX, STROKES_MAX, STROKES_POINTS } from '../kit/core/comment-core.mjs';
import { strokesOf, entryStrokesOf, strokesCentroidOf } from '../server/editor-ui.js';
import { createDevApi } from '../app/devapi.js';
import { commentShots, PIN_COLOR } from './comment-shots.mjs';
import { clickUntil } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-ink-comments'));
const deckDir = path.join(work, 'deck');
fs.rmSync(deckDir, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.cpSync(path.join(ROOT, 'examples/minimal'), deckDir, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
const DECK_FILE = path.join(deckDir, 'deck.html'), COMMENTS = path.join(deckDir, 'comments.json');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 1. 単体
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const cases = [
    null, 'x', [], [[1, 2]], [[1, 2], [1, 2]], [[1, 2], [3, 4]], [[-5, 9999], [1e9, -1], ['a', 2], [NaN, 1], [3, Infinity], [7.25, 8.35]],
    [[1.04, 2.06], [1.01, 2.04], [5, 5, 99]], { length: 3 }, Array.from({ length: 5001 }, (_, i) => [i % 1280, 1]),
  ];
  // 長い線：らせん 3000 点、ぎざぎざ 1200 点、ばらばらの点 800 点
  cases.push(Array.from({ length: 3000 }, (_, i) => [640 + i / 10 * Math.cos(i / 40), 360 + i / 14 * Math.sin(i / 40)]));
  cases.push(Array.from({ length: 1200 }, (_, i) => [i, i % 2 ? 100 : 110]));
  cases.push(Array.from({ length: 800 }, () => [rnd() * 1400 - 60, rnd() * 800 - 40]));
  const outs = cases.map(normStroke);
  // 写しの答え：1 本の線は [線] として渡す
  const one = (c) => { const r = strokesOf([c]); return r ? r[0] : null; };
  ok(cases.every((c, i) => JSON.stringify(one(c)) === JSON.stringify(outs[i]) && JSON.stringify(normStrokes([c])) === JSON.stringify(outs[i] ? [outs[i]] : null)),
    'per stroke: normStrokes (comment-core) and strokesOf (editor-ui copy) agree with the one-stroke rule on every case');
  // 何本もの線：形の違う並び・上限
  const many = [
    null, 'x', [], [null, 'x', [[1, 2]]], [[[1, 2], [3, 4]], 'bad', [[5, 6], [7, 8], [7, 8]]],
    Array.from({ length: 25 }, (_, j) => [[j * 10, 5], [j * 10 + 5, 40]]),
    Array.from({ length: 6 }, (_, j) => Array.from({ length: 900 }, (_, i) => [100 + j * 150 + 60 * Math.cos(i / 25), 360 + (i / 9) * Math.sin(i / 25)])),
    Array.from({ length: 201 }, () => [[1, 2], [3, 4]]),
    Array.from({ length: 5 }, () => Array.from({ length: 4500 }, (_, i) => [i % 1280, 7])),
    [Array.from({ length: 5001 }, (_, i) => [i % 1280, 1]), [[9, 9], [19, 19]]],
  ];
  const mo = many.map(normStrokes);
  ok(many.every((c, i) => JSON.stringify(strokesOf(c)) === JSON.stringify(mo[i])), 'normStrokes (comment-core) and strokesOf (editor-ui copy) agree on every list of strokes');
  ok(mo.slice(0, 4).every((o) => o === null) && JSON.stringify(mo[4]) === '[[[1,2],[3,4]],[[5,6],[7,8]]]', 'bad strokes are dropped, no valid stroke gives no strokes ' + JSON.stringify(mo[4]));
  const tot = (S) => S.reduce((n, x) => n + x.length, 0);
  ok(mo[5].length === STROKES_MAX && JSON.stringify(mo[5][19]) === '[[190,5],[195,40]]', 'at most 20 strokes (the first 20 are kept) ' + mo[5].length);
  ok(mo[6].length === 6 && mo[6].every((x) => x.length <= STROKE_MAX && x.length >= 2) && tot(mo[6]) <= STROKES_POINTS, 'at most 500 points a stroke and 2000 in total after simplifying ' + mo[6].map((x) => x.length).join(','));
  ok(mo[7] === null && mo[8] === null && JSON.stringify(mo[9]) === '[[[9,9],[19,19]]]', 'more than 200 strokes or 20000 input points: no strokes; a stroke over 5000 points is dropped');
  const legacy = { stroke: [[10.04, 20], [30, 40.06]] }, both = { stroke: [[1, 1], [2, 2]], strokes: [[[3, 3], [4, 4]]] };
  ok(JSON.stringify(entryStrokes(legacy)) === '[[[10,20],[30,40.1]]]' && JSON.stringify(entryStrokes(both)) === '[[[3,3],[4,4]]]' && entryStrokes({}) === null
    && [legacy, both, {}, { strokes: 'x' }, { stroke: 5 }].every((c) => JSON.stringify(entryStrokesOf(c)) === JSON.stringify(entryStrokes(c))),
    'an old entry with one stroke reads as strokes: [stroke]; strokes wins over stroke; the editor copy agrees');
  const S2 = [[[0, 0], [100, 0]], [[0, 100], [300, 100]]], c2 = strokesCentroid(S2);
  ok(c2.x === 125 && c2.y === 75 && JSON.stringify(strokesCentroidOf(S2)) === JSON.stringify(c2), 'centroid over all strokes, weighted by length ' + JSON.stringify(c2));
  ok(outs.slice(0, 5).every((o) => o === null) && JSON.stringify(outs[5]) === '[[1,2],[3,4]]', 'fewer than two distinct points, or not an array: no stroke');
  ok(JSON.stringify(outs[6]) === '[[0,720],[1280,0],[7.3,8.4]]' && JSON.stringify(outs[7]) === '[[1,2.1],[1,2],[5,5]]', 'clamped to the slide, rounded to 0.1, bad points and repeats dropped ' + JSON.stringify([outs[6], outs[7]]));
  ok(outs[8] === null && outs[9] === null, 'not an array, or more than 5000 input points: no stroke');
  const big = outs.slice(10);
  ok(big.every((o) => o && o.length <= STROKE_MAX && o.length >= 2), 'long strokes are simplified to at most 500 points ' + big.map((o) => o.length).join(','));
  ok(JSON.stringify(big[0][0]) === JSON.stringify(normStroke([cases[10][0], cases[10][1]])[0]) && JSON.stringify(big[0].at(-1)) === JSON.stringify(normStroke(cases[10].slice(-2)).at(-1)), 'simplifying keeps both end points');
  const cz = strokeCentroid([[0, 0], [100, 0], [100, 100]]);
  ok(cz.x === 75 && cz.y === 25, 'centroid: length-weighted mean of the segment midpoints ' + JSON.stringify(cz));

  // 編集アプリの書き込み（作業場所はメモリの上の偽物）
  const files = { 'comments.json': JSON.stringify([{ id: 'old', created: '2026-01-01T00:00:00Z', key: 'a:0', range: null, quote: '', comment: '古い', status: 'open' }]) };
  const ws = { readText: async (n) => (n in files ? files[n] : null), writeText: async (n, t) => { files[n] = t; }, backup: async () => {} };
  const api = createDevApi({ ws, deckFile: () => 'deck.html', slideOrder: () => [], editable: () => true, afterWrite: async () => false, msg: {} });
  const r1 = await api('POST', '/__dev/comment', { key: 'a:0', comment: '丸', pin: { x: 10, y: 20 }, strokes: [[[10.04, 20], [30, 40.06], [30, 40.06], [-3, 50]], [[100, 100], [200, 100]]] });
  const r2 = await api('POST', '/__dev/comment', { key: 'a:0', comment: '偽', pin: { x: 10, y: 20 }, strokes: 'nope' });
  await api('POST', '/__dev/comment', { key: 'a:0', comment: '点なし', strokes: [[[1, 2], [3, 4]]] });
  await api('POST', '/__dev/comment', { key: 'a:0', comment: '前の形', pin: { x: 1, y: 1 }, stroke: [[0, 0], [10, 0]] });
  const saved = JSON.parse(files['comments.json']);
  ok(saved[3] && !('strokes' in saved[3]) && !('pin' in saved[3]), 'strokes without a pin are not kept (contract §13)');
  const want1 = [[[10, 20], [30, 40.1], [0, 50]], [[100, 100], [200, 100]]];
  ok(r1._status === 200 && JSON.stringify(saved[1].strokes) === JSON.stringify(want1) && JSON.stringify(saved[1].pin) === JSON.stringify(strokesCentroid(want1))
    && !('strokes' in saved[2]) && saved[2].pin && saved[0].comment === '古い' && !('strokes' in saved[0]),
    'editor app (app/devapi.js): strokes are normalized and kept, the pin is their centroid, bad ones dropped, an old entry without strokes stays as it was ' + JSON.stringify(saved.map((c) => c.strokes ?? null)) + r2._status);
  ok(JSON.stringify(saved[4].strokes) === '[[[0,0],[10,0]]]' && !('stroke' in saved[4]) && saved.every((c) => !('stroke' in c)), 'a legacy stroke in the request is written as strokes (writers write only strokes)');
}

// ---------------------------------------------------------------- 2〜6. 開発サーバー
const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), DECK_FILE, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
let slog = '';
srv.stderr.on('data', (d) => { slog += d; });
const base = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server did not start\n' + slog)), 15000);
  srv.stdout.on('data', (d) => { slog += d; const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
});
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const dk = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
const sleep = (ms) => page.waitForTimeout(ms);
async function until(fn, ms = 5000) { const t = Date.now(); for (;;) { try { if (await fn()) return true; } catch { /* 読み込み中 */ } if (Date.now() - t > ms) return false; await sleep(60); } }
const UI = () => page.evaluate(() => window.__DEV_UI.state());
const tool = () => dk().evaluate(() => DECK.tools.mode());
async function deckKey(k) {
  await dk().evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); window.focus(); });
  await dk().locator('body').press(k);
  await sleep(150);
}
async function stagePt(x, y) {
  const fb = await page.locator('#deck').boundingBox();
  const r = await dk().evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.left, y: b.top, k: b.width / 1280 }; });
  return [fb.x + r.x + x * r.k, fb.y + r.y + y * r.k];
}
async function drawOnStage(pts) {
  await page.mouse.move(...await stagePt(...pts[0])); await page.mouse.down();
  for (const q of pts.slice(1)) await page.mouse.move(...await stagePt(...q), { steps: 2 });
  await page.mouse.up(); await sleep(150);
}
// デッキの描く面に色の付いた画素がいくつあるか
const deckInk = () => dk().evaluate(() => { const c = document.getElementById('dt-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });

let saved = null, target = null;
try {
  await page.goto(base);
  await page.waitForFunction(() => window.__DEV_LOADS > 0, null, { timeout: 15000 });
  if (!(await until(() => dk().evaluate(() => !!(window.DECK && DECK.ready)), 15000))) throw new Error('deck not ready');
  await dk().evaluate(() => DECK.go(1, 0, false));
  await sleep(300);

  // 2. 編集モードでないとき、m は何もしない
  await deckKey('m');
  ok((await tool()) === null && (await UI()).modeText === '表示', 'outside edit mode, m does nothing');
  await page.evaluate(() => window.__DEV_UI.toggleEdit(true));
  await until(() => dk().evaluate(() => document.documentElement.classList.contains('dev-edit')));
  await deckKey('m');
  const u1 = await UI();
  const layer = await dk().evaluate(() => { const l = document.getElementById('dt-layer'); return { cls: l.className, pe: getComputedStyle(l).pointerEvents, cursor: getComputedStyle(l).cursor }; });
  ok(u1.tool === 'ink' && u1.modeText === '編集中：マーカー' && u1.mode === 'edit' && layer.pe === 'auto' && layer.cursor === 'crosshair' && (await tool()) === 'ink',
    'in edit mode, m turns on the marker; the indicator says 編集中：マーカー ' + JSON.stringify({ ...layer, mode: u1.modeText }));
  ok(await page.evaluate(() => document.querySelector('#dev-badge .dv-ink').getAttribute('aria-pressed')) === 'true', 'the edit toolbar button shows it is on (aria-pressed)');
  const inkBtn = await page.evaluate(() => { const b = document.querySelector('#dev-badge .dv-ink'); return { text: b.textContent, title: b.title }; });
  ok(inkBtn.text === 'マーカー（m）' && inkBtn.title.startsWith('丸や矢印で場所を示して、コメントを付ける'), 'the edit toolbar button is named マーカー and its tooltip explains it ' + JSON.stringify(inkBtn));
  // 板のボタンで切る・入れる
  await clickUntil(page, '#dev-badge .dv-ink', () => page.waitForFunction(() => window.__DEV_UI.state().tool === null, null, { timeout: 2500 }));
  ok((await tool()) === null && (await UI()).modeText === '編集中', 'the edit toolbar button turns it off (indicator back to 編集中)');
  await clickUntil(page, '#dev-badge .dv-ink', () => page.waitForFunction(() => window.__DEV_UI.state().tool === 'ink', null, { timeout: 2500 }));
  ok((await tool()) === 'ink', 'and on again');
  // スライドの操作の帯：編集中はペンのボタンだけが「マーカー」として残り、押している状態を見せる
  await page.mouse.move(...await stagePt(640, 700)); await sleep(200);
  const pb = await dk().evaluate(() => { const b = document.querySelector('#dt-cb [data-b="pen"]'); return { label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), shown: getComputedStyle(b).display !== 'none', laser: getComputedStyle(document.querySelector('#dt-cb [data-b="laser"]')).display }; });
  await page.screenshot({ path: path.join(work, 'ink-bar.png') });
  ok(pb.label === 'マーカー' && pb.pressed === 'true' && pb.shown && pb.laser === 'none', 'the slide controls show the pen button as マーカー (pressed), the other tools stay hidden ' + JSON.stringify(pb));

  // 3. 文字のある要素の周りに丸を描く
  target = await dk().evaluate(() => {
    const el = [...document.querySelectorAll('#stage .slide.active [data-src]')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 60 && r.height > 12 && /\S/.test(x.textContent) && x.tagName !== 'SECTION'; });
    const st = document.getElementById('stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = st.width / 1280;
    return { src: el.getAttribute('data-src'), text: el.textContent.replace(/\s+/g, ' ').trim(), cx: (r.left + r.width / 2 - st.left) / k, cy: (r.top + r.height / 2 - st.top) / k, w: r.width / k, h: r.height / k };
  });
  const RX = Math.min(260, target.w / 2 + 30), RY = Math.min(120, target.h / 2 + 24);
  const circle = Array.from({ length: 49 }, (_, j) => [target.cx + RX * Math.cos(j * Math.PI / 24), target.cy + RY * Math.sin(j * Math.PI / 24)]);
  await drawOnStage(circle);
  const opened = await until(() => page.evaluate(() => !!document.querySelector('#dev-comment textarea')));
  const q = opened ? await page.textContent('#dev-comment .dv-q').catch(() => '') : '';
  const card = opened ? await page.textContent('#dev-comment') : '';
  ok(opened && q.includes(target.text.slice(0, 20)) && card.includes('マーカーの線'), 'pointer-up opens the same comment box as Alt+click, quoting the circled element ' + JSON.stringify({ q, want: target.text.slice(0, 20) }));
  const u2 = await UI();
  const pend = await page.evaluate(() => { const s = document.querySelector('#dev-pins svg.dev-ink.dv-new'); return s ? { stroke: getComputedStyle(s.querySelector('.dv-line')).stroke, n: s.querySelector('.dv-line').getAttribute('d').split('L').length } : null; });
  ok(u2.strokes === 1 && pend && /245, 158, 11/.test(pend.stroke) && u2.pins === 1, 'the pending stroke is drawn in the overlay in the pending pin colour ' + JSON.stringify({ pend, strokes: u2.strokes, pins: u2.pins }));
  await page.screenshot({ path: path.join(work, 'ink-pending.png') });   // 目で見る用（作業用のフォルダ）
  const inDeck = await dk().evaluate(() => document.querySelectorAll('#stage svg.dev-ink, #stage .dev-pin').length);
  ok((await deckInk()) === 0 && inDeck === 0, 'nothing of the stroke stays on the stage (the tool canvas is cleared, no overlay element in the deck)');
  // 欄が開いている間も描ける：プレビューは inert にならず、欄は横の板（プレビューの外）
  const lockState = await page.evaluate(() => { const f = document.getElementById('deck'), c = document.getElementById('dev-comment').getBoundingClientRect(), r = f.getBoundingClientRect();
    return { inert: f.inert, locked: f.classList.contains('dev-locked'), overlap: !(c.right <= r.left || c.left >= r.right || c.bottom <= r.top || c.top >= r.bottom) }; });
  ok(!lockState.inert && !lockState.locked && !lockState.overlap && (await UI()).editing === false, 'while the marker box is open the preview stays drawable and the box does not cover it ' + JSON.stringify(lockState));
  // 2 本目（右から指す矢印）と 3 本目（下線）：同じメモの線になる
  const arrow = [[target.cx + RX + 120, target.cy], [target.cx + RX + 10, target.cy], [target.cx + RX + 28, target.cy - 14], [target.cx + RX + 10, target.cy], [target.cx + RX + 28, target.cy + 14]];
  const under = Array.from({ length: 11 }, (_, j) => [target.cx - RX / 2 + j * RX / 10, target.cy + RY + 8]);
  await drawOnStage(arrow);
  await drawOnStage(under);
  await until(async () => (await page.textContent('#dev-comment')).includes('3 本'));
  const card3 = await page.evaluate(() => ({ n: document.querySelectorAll('#dev-comment').length, text: document.getElementById('dev-comment').textContent,
    m: (document.querySelector('#dev-pins svg.dev-ink.dv-new .dv-line') || { getAttribute: () => '' }).getAttribute('d').split('M').length - 1, ink: document.querySelectorAll('#dev-pins svg.dev-ink').length }));
  ok(card3.n === 1 && card3.text.includes('マーカーの線 3 本') && card3.m === 3 && card3.ink === 1, 'two more strokes join the same pending note: one box, three strokes in the overlay ' + JSON.stringify({ n: card3.n, m: card3.m, ink: card3.ink }));
  await page.screenshot({ path: path.join(work, 'ink-pending-3.png') });

  // 4. 残す
  await page.fill('#dev-comment textarea', 'この式を丸で囲んだ所を短く');
  await clickUntil(page, '#dev-comment .dv-pri', () => page.waitForFunction(() => !document.querySelector('#dev-comment'), null, { timeout: 2500 }));
  await until(() => fs.existsSync(COMMENTS));
  saved = JSON.parse(fs.readFileSync(COMMENTS, 'utf8'));
  const c = saved[0] || {}, S = c.strokes || [], s = S[0] || [];
  ok(S.length === 3 && !('stroke' in c), 'comments.json has the three strokes of the note (strokes, no stroke) ' + S.length);
  const xs = s.map((p) => p[0]), ys = s.map((p) => p[1]);
  const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const want = { x0: target.cx - RX, x1: target.cx + RX, y0: target.cy - RY, y1: target.cy + RY };
  const close = (a, b) => Math.abs(a - b) <= 3;
  ok(saved.length === 1 && s.length >= 20 && s.length <= 500 && close(bb.x0, want.x0) && close(bb.x1, want.x1) && close(bb.y0, want.y0) && close(bb.y1, want.y1),
    'comments.json has the stroke with the expected bounds ' + JSON.stringify({ n: s.length, bb, want }));
  ok(s.every((p) => p.length === 2 && p.every((v) => Math.round(v * 10) / 10 === v)), 'stroke points are [x, y] rounded to 0.1');
  const cen = strokesCentroid(S);
  ok(c.pin && c.pin.x === cen.x && c.pin.y === cen.y && Math.abs(c.pin.x - target.cx) < RX && Math.abs(c.pin.y - target.cy) < target.h / 2, 'pin is the centroid over all strokes ' + JSON.stringify({ pin: c.pin, cen, one: strokeCentroid(s) }));
  ok(c.range === target.src && c.key === '何を最小化するか:0' && c.comment === 'この式を丸で囲んだ所を短く', 'key and src come from the element under the centroid ' + JSON.stringify({ key: c.key, range: c.range, want: target.src }));
  ok((await tool()) === 'ink', 'the marker stays on for the next mark');
  // 取り消すと描いた線は全部捨てる：次のメモは 1 本目から
  await drawOnStage(Array.from({ length: 12 }, (_, j) => [200 + j * 20, 560]));
  await until(() => page.evaluate(() => !!document.querySelector('#dev-comment textarea')));
  await drawOnStage(Array.from({ length: 12 }, (_, j) => [200 + j * 20, 600]));
  await until(async () => (await page.textContent('#dev-comment')).includes('2 本'));
  const two = (await page.textContent('#dev-comment')).includes('マーカーの線 2 本');
  await clickUntil(page, '#dev-comment .dev-foot button:not(.dv-pri)', () => page.waitForFunction(() => !document.querySelector('#dev-comment'), null, { timeout: 2500 }));
  await drawOnStage(Array.from({ length: 12 }, (_, j) => [700 + j * 20, 600]));
  await until(() => page.evaluate(() => !!document.querySelector('#dev-comment textarea')));
  const after = await page.evaluate(() => ({ text: document.querySelector('#dev-comment .dev-where .dv-s').textContent, m: document.querySelector('#dev-pins svg.dev-ink.dv-new .dv-line').getAttribute('d').split('M').length - 1 }));
  await clickUntil(page, '#dev-comment .dev-foot button:not(.dv-pri)', () => page.waitForFunction(() => !document.querySelector('#dev-comment'), null, { timeout: 2500 }));
  const after2 = JSON.parse(fs.readFileSync(COMMENTS, 'utf8'));
  ok(two && after.m === 1 && after.text === 'マーカーの線' && after2.length === 1, 'cancel discards all the pending strokes (the next note starts from one stroke, nothing written) ' + JSON.stringify({ two, m: after.m, n: after2.length }));
  // 前の形（stroke 1 本）のコメント：一覧と重ねに出る
  after2.push({ id: 'legacy1', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: { x: 900, y: 500 }, stroke: [[860, 470], [940, 470], [940, 530], [860, 530]], quote: '', comment: '前の形の線', status: 'open' });
  fs.writeFileSync(COMMENTS, JSON.stringify(after2, null, 2));

  // 5. 一覧を開くと、重ねに線
  await page.evaluate(() => window.__DEV_UI.toggleComments(true));
  await until(async () => (await UI()).strokes === 2);
  const listed = await page.evaluate(() => {
    const s = document.querySelector('#dev-pins svg.dev-ink:not(.dv-new)'); if (!s) return null;
    const f = document.getElementById('deck').getBoundingClientRect(), r = s.getBoundingClientRect();
    const old = document.querySelector('#dev-pins svg.dev-ink[data-id="legacy1"] .dv-line');
    return { stroke: getComputedStyle(s.querySelector('.dv-line')).stroke, w: r.width, l: r.left - f.left, mark: document.querySelectorAll('#dev-comments .dv-s').length,
      three: document.querySelector('#dev-comments .dev-c .dv-s').textContent, legacy: old ? old.getAttribute('d') : null };
  });
  ok(listed && listed.mark === 2 && listed.three === 'マーカーの線 3 本' && listed.legacy === 'M860 470L940 470L940 530L860 530', 'the list shows both notes with their marks; an old single-stroke note still renders ' + JSON.stringify(listed));
  const box = await dk().evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { l: b.left, w: b.width }; });
  await page.screenshot({ path: path.join(work, 'ink-listed.png') });
  ok(listed && /225, 29, 72/.test(listed.stroke) && Math.abs(listed.w - box.w) < 2 && Math.abs(listed.l - box.l) < 2 && listed.mark, 'a listed comment draws its stroke in the overlay in the pin colour, over the slide ' + JSON.stringify({ listed, box }));
  await dk().evaluate(() => DECK.go(2, 0, false)); await sleep(300);
  ok((await UI()).strokes === 0, 'no stroke is drawn on another step');
  await dk().evaluate(() => DECK.go(1, 0, false)); await sleep(300);
  await deckKey('Escape');
  ok((await tool()) === null && (await UI()).modeText === '編集中', 'Esc turns the marker off');
  await deckKey('m');
  await page.evaluate(() => window.__DEV_UI.toggleEdit(false));
  await until(async () => (await UI()).modeText === '表示');
  ok((await tool()) === null && (await UI()).modeText === '表示', 'leaving edit mode turns the marker off');
  await page.evaluate(() => window.__DEV_UI.toggleComments(false));

  // 6. 発表のペン（編集モードでないとき）
  await deckKey('d');
  await drawOnStage(Array.from({ length: 10 }, (_, j) => [300 + j * 40, 600 + Math.sin(j) * 20]));
  ok((await tool()) === 'pen' && (await deckInk()) > 0 && !(await page.$('#dev-comment')), 'outside edit mode the presenter pen still draws, and opens no comment');
  await deckKey('d');
} catch (e) { fails++; console.error(e); }

// ---------------------------------------------------------------- 7. comment-shots
try {
  const res = await commentShots(deckDir);
  const sh = res.shots.find((x) => x.strokes && x.strokes.length === 3), old = res.shots.find((x) => x.id === 'legacy1');
  ok(sh && old && old.strokes && old.strokes.length === 1, 'comment-shots lists the three-stroke note and the old single-stroke note (as strokes) ' + JSON.stringify(res.shots.map((x) => x.strokes ? x.strokes.length : 0)));
  const s0 = sh.strokes[0], pick = [s0[0], s0[Math.floor(s0.length / 4)], s0[Math.floor(s0.length / 2)], sh.strokes[1][0], sh.strokes[2][Math.floor(sh.strokes[2].length / 2)]];
  const pg = await browser.newPage();
  const px = (file, pts) => pg.evaluate(async ({ data, pts }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return pts.map(([x, y]) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]);
  }, { data: fs.readFileSync(file).toString('base64'), pts });
  const RED = [1, 3, 5].map((i) => parseInt(PIN_COLOR.slice(i, i + 2), 16));
  const near = (a) => a.every((v, i) => Math.abs(v - RED[i]) <= 40);
  const full = await px(sh.full, pick), cl = sh.clip;
  const crop = await px(sh.crop, pick.map(([x, y]) => [(x - cl.x) * 2, (y - cl.y) * 2]));
  ok(full.every(near) && crop.every(near), 'comment-shots: the pixels of all three strokes are in the pin colour on the full image and the crop ' + JSON.stringify({ full, crop }));
  ok(sh.strokes.flat().every(([x, y]) => x >= cl.x && x <= cl.x + cl.width && y >= cl.y && y <= cl.y + cl.height), 'comment-shots: the crop covers all strokes ' + JSON.stringify(cl));
  await pg.close();
} catch (e) { fails++; console.error(e); }

// ---------------------------------------------------------------- 8. 書き出した 1 ファイルにコメントは入らない
try {
  for (const flag of [['--play-only'], []]) {
    const out = path.join(work, flag.length ? 'play.ega.html' : 'full.ega.html');
    execFileSync(process.execPath, [path.join(ROOT, 'tools/portable.mjs'), 'pack', deckDir, '-o', out, ...flag], { stdio: 'pipe' });
    const t = fs.readFileSync(out, 'utf8');
    // 1 ファイルは「入れないもの」の一覧に comments.json の名前を書くので、名前ではなく中身（指示の本文・線）がないことを見る。展開しても出てこない
    const un = path.join(work, 'unpacked-' + path.basename(out, '.ega.html'));
    fs.rmSync(un, { recursive: true, force: true });
    if (!flag.length) execFileSync(process.execPath, [path.join(ROOT, 'tools/portable.mjs'), 'unpack', out, un], { stdio: 'pipe' });   // 再生専用は原稿を持たないので展開できない
    ok(!t.includes('この式を丸で囲んだ所を短く') && !/"strokes?"\s*:\s*\[\[/.test(t) && !fs.existsSync(path.join(un, 'comments.json')), `${flag[0] || 'portable'} export contains no comments (nor after unpacking)`);
  }
} catch (e) { fails++; console.error(e); }

ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
srv.kill();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
