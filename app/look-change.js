// 保存で見え方が変わるスライド（handoff #100 の 7）：開いたときのファイル（P.original。自分のプレーヤーとパーツ）と、このエディタが組み直した
// プレビューで、各スライドの最後のステップの画像（app/frame-shim.js の slideShot）を比べ、違うものを品質チェックの板に出す（保存は止めない）。
// 編集したスライド（原稿の <section> の文字列が違うもの）は数えない。スライドの外（<head>・テーマなど）を直したときは、どのスライドも
// 変わって当然なので比べない。
//   sourceChanges(oldSrc, newSrc) → {outside: bool, edited: Set(鍵)}
//   pngDiff(a, b)                  → Promise<{differs, n}>（Blob 2 つ。1/4 に縮めて、はっきり違う画素の数 n が面積の LOOK_FRAC を超えるか）
//   oldShooter({html, onError})    → {shot(i) → Promise<{png,key}|null>, count() → Promise<n|null>, close()}（隠した枠で開いたときのファイルを描く）
import { analyzeSlideIds } from '../kit/core/build-core.mjs';

// 比べ方：両方の画像を 1/4（320×180）に縮めてから、はっきり違う画素（RGB の差の和が STRONG を超える）を数え、縮めた面積の FRAC を超えたら「違う」。
// 等倍の画素の数で比べると、Linux・Windows の Chrome では同じ文書でも字の縁のアンチエイリアスがずれ、変えていないスライドまで「違う」になった
// （CI 45275755968。macOS では画像がバイトまで同じ）。縮めると縁の 1 px の揺れは平らになり、色や形の変わった所は残る
export const LOOK_STRONG = 48, LOOK_FRAC = 0.01, LOOK_MAX = 60, LOOK_W = 320, LOOK_H = 180;

function sections(src) {
  const { slides } = analyzeSlideIds(src);
  const out = new Map();
  if (!slides.length) return { out, head: src, tail: '' };
  for (let i = 0; i < slides.length; i++) {
    const a = slides[i].start, z = i + 1 < slides.length ? slides[i + 1].start : endOf(src, a);
    out.set(slides[i].key, src.slice(a, z));
  }
  const last = slides[slides.length - 1];
  return { out, head: src.slice(0, slides[0].start), tail: src.slice(endOf(src, last.start)) };
}
// 最後のスライドの </section> の後ろ
function endOf(src, from) {
  const i = src.indexOf('</section>', from);
  return i < 0 ? src.length : i + '</section>'.length;
}
export function sourceChanges(oldSrc, newSrc) {
  const A = sections(oldSrc), B = sections(newSrc);
  const outside = A.head !== B.head || A.tail !== B.tail;
  const edited = new Set();
  for (const [k, v] of B.out) if (A.out.get(k) !== v) edited.add(k);
  return { outside, edited };
}

async function pixels(blob) {
  const bm = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = LOOK_W; c.height = LOOK_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(bm, 0, 0, LOOK_W, LOOK_H);
  if (bm.close) bm.close();
  return g.getImageData(0, 0, LOOK_W, LOOK_H);
}
// → {differs, n}（n：縮めた画像で、はっきり違う画素の数）
export async function pngDiff(a, b) {
  const [A, B] = await Promise.all([pixels(a), pixels(b)]);
  const x = A.data, y = B.data;
  let n = 0;
  for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > LOOK_STRONG) n++;
  return { differs: n > LOOK_W * LOOK_H * LOOK_FRAC, n };
}
export async function pngDiffers(a, b) { return (await pngDiff(a, b)).differs; }

// 開いたときのファイルを、見えない枠（sandbox。プレビューと同じ仲立ち）で描く。html はもう仲立ちを入れた文書
export function oldShooter({ html, timeout = 20000 }) {
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('aria-hidden', 'true');
  f.setAttribute('tabindex', '-1');
  f.inert = true;
  f.id = 'look-old';
  f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;border:0;opacity:0;pointer-events:none';
  const waits = new Map();
  let seq = 0, closed = false;
  const onMsg = (e) => {
    if (e.source !== f.contentWindow) return;
    const m = e.data || {};
    if (m.type === 'app-shot-result' && waits.has(m.id)) { waits.get(m.id)(m.results); waits.delete(m.id); }
  };
  window.addEventListener('message', onMsg);
  const loaded = new Promise((res) => { f.addEventListener('load', () => res(true), { once: true }); setTimeout(() => res(false), timeout); });
  f.srcdoc = html;
  document.body.append(f);
  const ask = async (i) => {
    if (closed || !(await loaded)) return null;
    const id = 'look' + (++seq);
    const got = new Promise((res) => { waits.set(id, res); setTimeout(() => { if (waits.has(id)) { waits.delete(id); res(null); } }, timeout); });
    f.contentWindow.postMessage({ type: 'app-shot', id, i }, '*');
    return got;
  };
  return {
    async shot(i) { const r = await ask(i); return r && r.png instanceof Blob ? r : null; },
    close() { closed = true; window.removeEventListener('message', onMsg); for (const r of waits.values()) r(null); waits.clear(); f.remove(); },
  };
}
