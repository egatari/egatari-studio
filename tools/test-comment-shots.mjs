// コメントの画像（tools/comment-shots.mjs）の確認：node tools/test-comment-shots.mjs [作業用のフォルダ]
// examples/minimal を写し、点のあるコメント・点のないコメント・解決済み・ない段階を comments.json に置いて撮る。
// 画像があるか、印が点の所に描かれているか（輪の上の画素の色・輪の中は塞がない）、切り抜きが点を真ん中に含むか、撮るとデッキの画面が変わらないか。
// 手書きメモの線（strokes。ここでは前の形の stroke 1 本）があれば、全体と切り抜きの両方で線の上の画素が印の色か、切り抜きが線の外接矩形＋余白を含むか
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commentShots, PIN_COLOR } from './comment-shots.mjs';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-comment-shots'));
const deck = path.join(work, 'deck');
fs.rmSync(deck, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.cpSync(path.join(ROOT, 'examples/minimal'), deck, { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

const PIN = { x: 300, y: 400 };
// 手書きメモ：(640, 360) の周りの半径 200×150 の楕円（120 点）。点（pin）は重心
const RING = Array.from({ length: 121 }, (_, j) => [640 + 200 * Math.cos(j * Math.PI / 60), 360 + 150 * Math.sin(j * Math.PI / 60)]);
const comments = [
  { id: 'cpin1', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: PIN, quote: '', comment: 'ここ', status: 'open' },
  { id: 'cink', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: { x: 640, y: 360 }, stroke: RING, quote: '', comment: '丸', status: 'open' },
  { id: 'cbadink', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: PIN, stroke: [[1, 2]], quote: '', comment: '線にならない', status: 'open' },
  { id: 'cnopin', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, quote: '', comment: '点なし', status: 'open' },
  { id: 'cedge', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: { x: 99999, y: 10 }, quote: '', comment: '端', status: 'open' },
  { id: 'cdone', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: PIN, quote: '', comment: '済み', status: 'resolved' },
  { id: 'cgone', created: '2026-01-01T00:00:00Z', key: 'ないスライド:0', range: null, pin: PIN, quote: '', comment: 'ない', status: 'open' },
  { id: '../evil', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, quote: '', comment: 'パス', status: 'open' },
];
fs.writeFileSync(path.join(deck, 'comments.json'), JSON.stringify(comments, null, 2));
const before = fs.readFileSync(path.join(deck, 'deck.html'), 'utf8');

const res = await commentShots(deck);
const out = path.join(fs.realpathSync(deck), '.cache', 'comment-shots');
const by = Object.fromEntries(res.shots.map((s) => [s.id, s]));
ok(res.out === out && Object.keys(by).sort().join() === 'cbadink,cedge,cgone,cink,cnopin,cpin1', 'open comments only, ids that are not plain names skipped ' + Object.keys(by).join());
ok(['cpin1', 'cnopin', 'cedge'].every((id) => fs.existsSync(path.join(out, id + '.png')) && fs.existsSync(path.join(out, id + '-full.png'))), 'a crop and a full-slide PNG for each comment');
ok(by.cgone.error && !fs.existsSync(path.join(out, 'cgone.png')), 'a comment whose step is gone is reported, not shot');
ok(!fs.existsSync(path.join(work, 'evil.png')) && !fs.existsSync(path.join(out, '_deck.html')), 'nothing written outside .cache/comment-shots, the built page is removed');
const idx = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
ok(idx.length === 6 && idx.find((s) => s.id === 'cpin1').slide === 2 && idx.find((s) => s.id === 'cedge').pin.x === 1280, 'index.json lists the shots (slide number, clamped pin) ' + JSON.stringify(idx.map((s) => [s.id, s.slide, s.step, s.pin])));
ok(fs.readFileSync(path.join(deck, 'deck.html'), 'utf8') === before, 'deck.html untouched');

// 画素を読む（ブラウザで PNG を開いて canvas に描く）
const b = await launch();
const pg = await b.newPage();
const px = (file, pts) => pg.evaluate(async ({ data, pts }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, px: pts.map(([x, y]) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]) };
}, { data: fs.readFileSync(file).toString('base64'), pts });
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const near = (a, bb, d = 40) => a.every((v, i) => Math.abs(v - bb[i]) <= d);
const RED = hex(PIN_COLOR);
// 輪：直径 34px・太さ 3px（中心から 14〜17px）。左右上下の輪の上の点は印の色、中心は印の色でない（字を塞がない）
const ring = (cx, cy, s = 1) => [[cx + 15.5 * s, cy], [cx - 15.5 * s, cy], [cx, cy + 15.5 * s], [cx, cy - 15.5 * s]];
const full = await px(path.join(out, 'cpin1-full.png'), [...ring(PIN.x, PIN.y), [PIN.x, PIN.y]]);
ok(full.w === 1280 && full.h === 720 && full.px.slice(0, 4).every((c) => near(c, RED)) && !near(full.px[4], RED), 'full slide: the marker is drawn at the pin ' + JSON.stringify(full));
const crop = await px(path.join(out, 'cpin1.png'), [...ring(480, 300, 2), [480, 300]]);
const cl = by.cpin1.clip;
ok(crop.w === 960 && crop.h === 600 && cl.x === 60 && cl.y === 250 && crop.px.slice(0, 4).every((c) => near(c, RED)) && !near(crop.px[4], RED), 'crop: 480×300 of the slide at 2×, centred on the pin ' + JSON.stringify({ crop, cl }));
ok(by.cedge.clip.x === 800 && by.cedge.clip.y === 0, 'crop at the edge stays inside the slide ' + JSON.stringify(by.cedge.clip));
const np = await px(path.join(out, 'cnopin.png'), [[PIN.x + 15.5, PIN.y]]);
ok(np.w === 1280 && !near(np.px[0], RED), 'no pin: the crop is the full slide, without a marker');
// 手書きメモの線：楕円の上（右端・下端・左上の 45° あたり）は印の色、楕円の中心の外側の何もない所は印の色でない
const onRing = [[840, 360], [640, 510], [640 + 200 * Math.SQRT1_2, 360 - 150 * Math.SQRT1_2]];
const ink = by.cink, ic = ink.clip;
// cink は前の形（stroke 1 本）：strokes の 1 本として読む
const is = (ink.strokes || [])[0] || [];
ok(Array.isArray(ink.strokes) && ink.strokes.length === 1 && is.length > 10 && is.length <= 500 && !by.cbadink.strokes && !('stroke' in ink), 'index.json carries the normalized strokes (an old single stroke is read as one; a one-point stroke is dropped) ' + is.length);
// 外接矩形 440..840 × 210..510 ＋余白 48 → 496×396（480×300 より大きい）、真ん中は (640, 360)
ok(ic.x === 392 && ic.y === 162 && ic.width === 496 && ic.height === 396, 'crop covers the stroke bounding box plus margin ' + JSON.stringify(ic));
const inkFull = await px(path.join(out, 'cink-full.png'), [...onRing, [640, 250], ...ring(640, 360)]);
ok(inkFull.px.slice(0, 3).every((c) => near(c, RED)) && !near(inkFull.px[3], RED) && inkFull.px.slice(4).every((c) => near(c, RED)), 'full slide: the stroke is drawn in the pin colour, with the ring at the pin ' + JSON.stringify(inkFull.px));
const inkCrop = await px(path.join(out, 'cink.png'), onRing.map(([x, y]) => [(x - ic.x) * 2, (y - ic.y) * 2]));
ok(inkCrop.w === 992 && inkCrop.h === 792 && inkCrop.px.every((c) => near(c, RED)), 'crop: the stroke is drawn there too ' + JSON.stringify(inkCrop));
await b.close();

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
