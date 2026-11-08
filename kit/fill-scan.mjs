// 本文の釣り合い（R-balance の段 1）を、開いたデッキのページで測る（kit/check.mjs の balance と tools/fill-report.mjs が使う）
// 各スライドを最終段階（DECK.seek(i, max, Infinity)、ほかの検査と同じ状態）にして、本文（.body）の箱だけを Playwright で撮り、
// 画素から重心と外接矩形を取る（kit/core/fill-measure.mjs）。地の色はスライドの計算された地の色（.body から上へ、初めの透明でない background-color）。
// 結論の行（.concl）は本文の外（本文の下の決まった場所）にあるので撮らない：下の空きは本文の中身と結論の行の間の空きそのもので、
// 光学的な中心も本文の箱に対して取る。noconcl のスライドは本文が下まで伸びる（680px まで）ので、その高さに対する % になる。
//   scanBalance(page, metaList) → [{i, skip: 'cover'|'sec'|'static'|'nobody'|'hidden'|null, tate, visual: {n, bottom, left}|null, ...measureBalance の値, flagged}]
//     visual：本文の中の図（部品 m-…・svg・img・table・.katex-display）の数と、図が描いた画素のいちばん下の端・いちばん左の端（本文の左上から px。kit/core/fill-measure.mjs の visualExtent）
//   decodePng(buf) → {width, height, data(RGBA)}（8 bit の RGB・RGBA、インターレースなし。Chrome の画面写真の形）
import zlib from 'node:zlib';
import { stableCapture } from './browser.mjs';
import { measureBalance, balanceFlagged, visualExtent, BALANCE_SKIP } from './core/fill-measure.mjs';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('fill: not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, ctype = 0, inter = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; inter = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || inter !== 0) throw new Error(`fill: unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${inter})`);
  const bpp = ctype === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
      data[o] = cur[x * bpp]; data[o + 1] = cur[x * bpp + 1]; data[o + 2] = cur[x * bpp + 2]; data[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data };
}

// スライドを最終段階にし、本文の箱と地の色を返す（ページの中で動く）
function prepareSlide([i, max, SKIP]) {
  const s = DECK.slides[i];
  const skip = SKIP.find((c) => s.classList.contains(c));
  if (skip) return { skip };
  DECK.seek(i, max, Infinity);
  const body = s.querySelector(':scope > .body') || s.querySelector('.body');
  if (!body) return { skip: 'nobody' };
  const r = body.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return { skip: 'hidden' };
  // 地の色：.body から上へ、初めの透明でない background-color（ふつうはスライドの --bg）。色の書き方によらず、1 画素の canvas に塗って読む
  let css = 'rgb(255, 255, 255)';
  for (let e = body; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    if (c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) { css = c; break; }
    if (e === s) break;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const bg = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  const clip = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  // 図（visual）：いちばん外の部品（m-…）、部品と KaTeX の外の svg、img、table、.katex-display。見えている箱だけ。
  // 本文の撮った画素の中の位置（箱）を返す。描いた端は Node の側で画素から取る（visualExtent）
  const isPart = (e) => e.localName.startsWith('m-');
  const inside = (e, test) => { for (let a = e.parentElement; a && a !== body; a = a.parentElement) if (test(a)) return true; return false; };
  const vis = [...body.querySelectorAll('*')].filter((e) => {
    if (isPart(e)) return !inside(e, isPart);
    if (inside(e, isPart)) return false;
    if (e.localName === 'svg') return !inside(e, (a) => a.localName === 'svg' || a.classList.contains('katex'));
    return e.localName === 'img' || e.localName === 'table' || e.classList.contains('katex-display');
  }).map((e) => e.getBoundingClientRect()).filter((q) => q.width >= 4 && q.height >= 4 && q.bottom > r.top && q.top < r.bottom && q.right > r.left && q.left < r.right);
  const visuals = vis.map((q) => ({ x: Math.round(q.left) - clip.x, y: Math.round(q.top) - clip.y, width: Math.round(q.width), height: Math.round(q.height) }));
  return { skip: null, tate: s.classList.contains('layout-tate'), bg, clip, visuals };
}

export async function scanBalance(page, metaList) {
  const out = [];
  for (const m of metaList) {
    const p = await page.evaluate(prepareSlide, [m.i, m.max, BALANCE_SKIP]);
    if (p.skip) { out.push({ i: m.i, skip: p.skip }); continue; }
    const png = await stableCapture(page, { clip: p.clip, scale: 'css', type: 'png' });
    const img = decodePng(png);
    const meas = measureBalance(img, p.bg);
    const visual = visualExtent(img, p.bg, p.visuals);
    out.push({ i: m.i, skip: null, tate: p.tate, bg: p.bg, visual, ...meas, flagged: balanceFlagged(meas, { tate: p.tate, visual, height: img.height, width: img.width }) });
  }
  return out;
}
