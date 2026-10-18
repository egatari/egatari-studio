// コメントの画像（tools/comment-shots.mjs）の確認：node tools/test-comment-shots.mjs [作業用のフォルダ]
// examples/minimal を写し、点のあるコメント・点のないコメント・解決済み・ない段階を comments.json に置いて撮る。
// 画像があるか、印が点の所に描かれているか（輪の上の画素の色・輪の中は塞がない）、切り抜きが点を真ん中に含むか、撮るとデッキの画面が変わらないか
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
const comments = [
  { id: 'cpin1', created: '2026-01-01T00:00:00Z', key: '何を最小化するか:0', range: null, pin: PIN, quote: '', comment: 'ここ', status: 'open' },
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
ok(res.out === out && Object.keys(by).sort().join() === 'cedge,cgone,cnopin,cpin1', 'open comments only, ids that are not plain names skipped ' + Object.keys(by).join());
ok(['cpin1', 'cnopin', 'cedge'].every((id) => fs.existsSync(path.join(out, id + '.png')) && fs.existsSync(path.join(out, id + '-full.png'))), 'a crop and a full-slide PNG for each comment');
ok(by.cgone.error && !fs.existsSync(path.join(out, 'cgone.png')), 'a comment whose step is gone is reported, not shot');
ok(!fs.existsSync(path.join(work, 'evil.png')) && !fs.existsSync(path.join(out, '_deck.html')), 'nothing written outside .cache/comment-shots, the built page is removed');
const idx = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
ok(idx.length === 4 && idx.find((s) => s.id === 'cpin1').slide === 2 && idx.find((s) => s.id === 'cedge').pin.x === 1280, 'index.json lists the shots (slide number, clamped pin) ' + JSON.stringify(idx.map((s) => [s.id, s.slide, s.step, s.pin])));
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
await b.close();

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
