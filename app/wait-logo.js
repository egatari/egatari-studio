// 待つ間のロゴ（assets/logo/egatari-draw-{light,dark}.svg：太陽 → え → かぎ括弧を一度だけ描いて止まる。動きを減らす設定では完成形）。
// 待ちが WAIT_MS（約 1 秒）を超えたときだけ出す（すぐ終わる組み立てや読み込みでは出さない）。SVG はファイルのまま（手を加えず）
// Blob の URL の <img> で見せる（CSP の img-src blob:）。出すたびに新しい URL なので、描く動きは毎回はじめから
//   const stop = slowWait(host, { tone: 'auto' | 'light' | 'dark' });   … stop()
//   const w = createWaitOverlay(el); const end = w.begin(); … end();  w.pause()（確かめの窓を出す前など）
import LIGHT from '../assets/logo/egatari-draw-light.svg?text';
import DARK from '../assets/logo/egatari-draw-dark.svg?text';

export const WAIT_MS = 1000;
const prefersDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };

export function slowWait(host, { tone = 'auto', delay = WAIT_MS, cls = '' } = {}) {
  let img = null, url = null, timer = 0;
  const show = () => {
    timer = 0;
    if (!host) return;
    const svg = tone === 'dark' || (tone === 'auto' && prefersDark()) ? DARK : LIGHT;
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img = document.createElement('img');
    img.src = url; img.alt = ''; img.className = ('wait-logo ' + cls).trim();
    img.setAttribute('aria-hidden', 'true'); img.draggable = false;
    host.prepend(img);
  };
  if (delay > 0) timer = setTimeout(show, delay); else show();
  return () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (img) img.remove();
    if (url) URL.revokeObjectURL(url);
    img = null; url = null;
  };
}

// 画面全体（はじめの画面の上）に重ねる待ちの表示。入れ子にしてよい（いちばん外の end() で消える）
export function createWaitOverlay(el) {
  let depth = 0, timer = 0, stopImg = null;
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    el.hidden = true;
    if (stopImg) { stopImg(); stopImg = null; }
  };
  const show = () => { timer = 0; el.hidden = false; stopImg = slowWait(el.querySelector('.wait-art') || el, { delay: 0 }); };
  return {
    begin() {
      if (depth++ === 0) timer = setTimeout(show, WAIT_MS);
      let done = false;
      return () => { if (done) return; done = true; if (--depth === 0) hide(); };
    },
    // 確かめの窓を出すとき・デッキを見せたとき：消す（残りは短い。end() は後で呼んでよい）
    pause: hide,
  };
}
