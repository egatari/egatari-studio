// コメント（comments.json）の未対応のものを、その段階の画面の画像にする（Claude がコメントを直すときに見る）
//
//   node tools/comment-shots.mjs <デッキのフォルダ | deck.html> [id …] [--all]
//   npm run comment-shots -- <デッキのフォルダ>
//
// 画面は DECK.seek(i, k, Infinity)（段階 k の最後の状態）だけで決まるので、プレビューから画像を受け取らずに、ここで組み立てて撮り直す。
// <デッキ>/.cache/comment-shots/ に書く（.cache は git に入れない）：
//   <id>-full.png  スライド全体（1280×720）。点（pin）があれば印を描く。手書きメモの線（strokes。前の形の stroke も）があれば、全部の線を同じ色で描く
//   <id>.png       点の周り（スライドの 480×300 の範囲を 2 倍で）。線があれば、全部の線の外接矩形に余白 STROKE_MARGIN を足した範囲も含める
//                  （480×300 より小さくはしない。スライドの外には出さない）。点がなければスライド全体と同じ
//   index.json     [{id, key, slide, step, pin, strokes, quote, comment, full, crop, clip}]（撮れなかったものは error）
// 既定は status が open のものだけ。id を並べればそれだけ、--all なら解決済みも
import fs from 'node:fs';
import path from 'node:path';
import { build, resolveDeckArg } from '../kit/build.mjs';
import { launch, fileUrl, stableCapture } from '../kit/browser.mjs';
import { safeWriteFile, readContained } from '../kit/safe-fs.mjs';
import { READ_LIMITS } from '../kit/bounded-read.mjs';
import { normPin, entryStrokes, SLIDE_W, SLIDE_H } from '../kit/core/comment-core.mjs';

const CROP_W = 480, CROP_H = 300, CROP_SCALE = 2, STROKE_MARGIN = 48;
// 切り抜く範囲（スライドの座標）：点を真ん中にした 480×300。線（strokes、何本でも）があれば、全部の線（と点）の外接矩形＋余白を真ん中にして、480×300 より小さくしない
export function cropOf(pin, strokes) {
  let cx = pin.x, cy = pin.y, w = CROP_W, hh = CROP_H;
  if (strokes && strokes.length) {
    const all = strokes.flat();
    const xs = [pin.x, ...all.map((q) => q[0])], ys = [pin.y, ...all.map((q) => q[1])];
    const x0 = Math.min(...xs) - STROKE_MARGIN, x1 = Math.max(...xs) + STROKE_MARGIN, y0 = Math.min(...ys) - STROKE_MARGIN, y1 = Math.max(...ys) + STROKE_MARGIN;
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    w = Math.min(SLIDE_W, Math.max(CROP_W, x1 - x0)); hh = Math.min(SLIDE_H, Math.max(CROP_H, y1 - y0));
  }
  const r = (v) => Math.round(v * 10) / 10;
  const x = Math.max(0, Math.min(SLIDE_W - w, cx - w / 2)), y = Math.max(0, Math.min(SLIDE_H - hh, cy - hh / 2));
  return { x: r(x), y: r(y), width: r(w), height: r(hh) };
}
// 印：信頼する編集の画面（server/editor-ui.js の .dev-pin）と同じ形と色
export const PIN_COLOR = '#e11d48';

export async function commentShots(arg, o = {}) {
  const src = resolveDeckArg(arg);
  const dir = fs.realpathSync(path.dirname(path.resolve(src)));
  const text = readContained(dir, path.join(dir, 'comments.json'), 'utf8', { max: READ_LIMITS.comments });
  if (text == null) return { dir, out: null, shots: [] };
  let list = [];
  try { list = JSON.parse(text); } catch { throw new Error('comments.json is not valid JSON'); }
  if (!Array.isArray(list)) list = [];
  const want = (o.ids || []).map(String);
  const pick = list.filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.id)
    && (want.length ? want.includes(c.id) : (o.all || c.status === 'open')));
  const out = path.join(dir, '.cache', 'comment-shots');
  const shots = [];
  if (!pick.length) return { dir, out, shots };
  // 組み立てた 1 枚の HTML を、撮る場所の隣に置いて開く（外部の読み込みはない）
  const r = build(src, {});
  const page = path.join(out, '_deck.html');
  safeWriteFile(dir, page, r.html);
  const b = await launch();
  try {
    const ctx1 = await b.newContext({ viewport: { width: SLIDE_W, height: SLIDE_H }, deviceScaleFactor: 1 });
    const ctx2 = await b.newContext({ viewport: { width: SLIDE_W, height: SLIDE_H }, deviceScaleFactor: CROP_SCALE });
    const open = async (ctx) => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.error('  pageerror: ' + e.message));
      await p.goto(fileUrl(page) + '?mode=talk');
      await p.waitForFunction(() => window.DECK && DECK.ready);
      await p.evaluate(() => document.fonts.ready);
      // 発表の道具（下の操作の帯など）は撮らない：スライドそのものだけ（stableCapture が隠す）
      return p;
    };
    const p1 = await open(ctx1), p2 = await open(ctx2);
    for (const c of pick) {
      const key = String(c.key || ''), pin = normPin(c.pin), strokes = pin ? entryStrokes(c) : null;
      const e = { id: c.id, key, pin, ...(strokes ? { strokes } : {}), quote: String(c.quote || ''), comment: String(c.comment || ''), status: c.status };
      const at = await p1.evaluate((key) => {
        const j = key.lastIndexOf(':'), sk = key.slice(0, j), st = key.slice(j + 1);
        const i = DECK.slides.findIndex((s) => s._key === sk);
        if (i < 0) return null;
        const s = DECK.slides[i];
        const k = st === 'concl' ? (s._cstep >= 0 ? s._cstep : s._max) : /^\d+$/.test(st) ? Math.min(+st, s._max) : null;
        return k === null ? null : { i, k };
      }, key);
      if (!at) { e.error = 'the step ' + JSON.stringify(key) + ' is not in the deck'; shots.push(e); continue; }
      e.slide = at.i + 1; e.step = at.k;
      for (const p of [p1, p2]) {
        await p.evaluate(({ i, k, pin, strokes, color }) => {
          DECK.seek(i, k, Infinity);
          for (const id of ['comment-shot-pin', 'comment-shot-ink']) { const o = document.getElementById(id); if (o) o.remove(); }
          if (!pin) return;
          // 手書きメモの線：編集の画面の重ね（server/editor-ui.js の .dev-ink）と同じく、白い縁取りの上に印の色の線
          if (strokes) {
            // 線ごとに M から始める（線どうしを繋がない）
            const NS = 'http://www.w3.org/2000/svg', d = strokes.map((s) => 'M' + s.map((q) => q[0] + ' ' + q[1]).join('L')).join('');
            const svg = document.createElementNS(NS, 'svg');
            svg.id = 'comment-shot-ink';
            svg.setAttribute('viewBox', '0 0 1280 720'); svg.setAttribute('width', '1280'); svg.setAttribute('height', '720');
            svg.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;overflow:visible';
            for (const [col, w] of [['#fff', 7], [color, 3.5]]) {
              const pa = document.createElementNS(NS, 'path');
              pa.setAttribute('d', d); pa.setAttribute('fill', 'none'); pa.setAttribute('stroke', col); pa.setAttribute('stroke-width', String(w));
              pa.setAttribute('stroke-linecap', 'round'); pa.setAttribute('stroke-linejoin', 'round');
              svg.appendChild(pa);
            }
            document.body.appendChild(svg);
          }
          let m;
          m = document.createElement('div');
          m.id = 'comment-shot-pin';
          // スライドは窓（1280×720）に倍率 1 で収まる：点の座標がそのまま窓の座標
          // 中を塞がない輪と、外向きの 4 本の目盛り（点の字が見えるように）
          m.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:' + pin.x + 'px;top:' + pin.y + 'px;width:34px;height:34px;margin:-17px 0 0 -17px;'
            + 'border-radius:50%;border:3px solid ' + color + ';box-sizing:border-box;box-shadow:0 0 0 2px #fff,inset 0 0 0 1.5px #fff';
          for (const [l, t, w, hh] of [[15, -12, 4, 9], [15, 37, 4, 9], [-12, 15, 9, 4], [37, 15, 9, 4]]) {
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;left:' + (l - 3) + 'px;top:' + (t - 3) + 'px;width:' + w + 'px;height:' + hh + 'px;background:' + color + ';box-shadow:0 0 0 1.5px #fff';
            m.appendChild(d);
          }
          document.body.appendChild(m);
        }, { ...at, pin, strokes, color: PIN_COLOR });
        await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      }
      const full = path.join(out, c.id + '-full.png'), crop = path.join(out, c.id + '.png');
      const fullPng = await stableCapture(p1);
      safeWriteFile(dir, full, fullPng);
      if (pin) {
        const cl = cropOf(pin, strokes);
        e.clip = { ...cl, scale: CROP_SCALE };
        safeWriteFile(dir, crop, await stableCapture(p2, { clip: cl }));
      } else safeWriteFile(dir, crop, fullPng);
      e.full = full; e.crop = crop;
      shots.push(e);
    }
  } finally { await b.close(); }
  fs.rmSync(page, { force: true });
  safeWriteFile(dir, path.join(out, 'index.json'), JSON.stringify(shots, null, 2) + '\n');
  return { dir, out, shots };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = process.argv.slice(2), ids = [];
  let arg = null, all = false;
  for (const x of a) { if (x === '--all') all = true; else if (arg === null) arg = x; else ids.push(x); }
  if (!arg) { console.error('usage: node tools/comment-shots.mjs <working folder | deck.html> [id …] [--all]'); process.exit(1); }
  const rel = (f) => { const r = path.relative(process.cwd(), f); return !r ? '.' : r.startsWith('..') ? f : r; };
  let res;
  try { res = await commentShots(arg, { ids, all }); } catch (e) { console.error('comment-shots: ' + e.message); process.exit(1); }
  if (!res.out) { console.log('comment-shots: no comments.json in ' + res.dir); process.exit(0); }
  if (!res.shots.length) { console.log('comment-shots: no ' + (all ? '' : 'open ') + 'comments'); process.exit(0); }
  for (const s of res.shots) {
    if (s.error) { console.log(`  ${s.id}  ${s.key}  ⚠ ${s.error}`); continue; }
    console.log(`  ${s.id}  ${s.key}（slide ${s.slide}, step ${s.step}）${s.pin ? ` pin ${Math.round(s.pin.x)},${Math.round(s.pin.y)}` : ''}${s.strokes ? ` ${s.strokes.length} stroke(s), ${s.strokes.reduce((n, x) => n + x.length, 0)} points` : ''}`);
    console.log(`    ${s.comment.replace(/\s+/g, ' ').slice(0, 80)}`);
    console.log(`    -> ${rel(s.crop)}  ${rel(s.full)}`);
  }
  console.log(`comment-shots: ${res.shots.filter((s) => !s.error).length} of ${res.shots.length} -> ${rel(res.out)}/ (index.json)`);
}
