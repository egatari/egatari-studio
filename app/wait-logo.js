// 待つ間のロゴ（assets/logo/egatari-draw-{light,dark}.svg：太陽 → え → かぎ括弧を一度だけ描いて止まる。動きを減らす設定では完成形）。
// 待ちが WAIT_MS（約 1 秒）を超えたときだけ出す（すぐ終わる組み立てや読み込みでは出さない）。SVG はファイルのまま（手を加えず）
// Blob の URL の <img> で見せる（CSP の img-src blob:）。出すたびに新しい URL なので、描く動きは毎回はじめから
//   const stop = slowWait(host, { tone: 'auto' | 'light' | 'dark' });   … stop()
//   const w = createWaitOverlay(el); const end = w.begin(); … end();  w.pause()（確かめの窓を出す前など）;  const off = w.cover('…'); … off()
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
//   cover(text)：すぐに（約 1 秒を待たずに）不透明に覆って text を出す。返す関数で消す。覆っている間は pause() と begin() の end() では消えない
//   （AI の返事から教材を作る間：窓を閉じてから教材が見えるまで、はじめの画面に戻らない。app/llm.js）
export function createWaitOverlay(el) {
  let depth = 0, timer = 0, stopImg = null, covers = 0, saved = null;
  const textEl = el.querySelector('.wait-text');
  const draw = () => { if (!stopImg) stopImg = slowWait(el.querySelector('.wait-art') || el, { delay: 0 }); };
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (covers) return;
    el.hidden = true;
    if (stopImg) { stopImg(); stopImg = null; }
  };
  const show = () => { timer = 0; el.hidden = false; draw(); };
  return {
    begin() {
      if (depth++ === 0 && !covers) timer = setTimeout(show, WAIT_MS);
      let done = false;
      return () => { if (done) return; done = true; if (--depth === 0) hide(); };
    },
    cover(text) {
      if (covers++ === 0) {
        if (timer) clearTimeout(timer);
        timer = 0;
        if (textEl) { saved = textEl.textContent; textEl.textContent = text || saved; }
        el.classList.add('cover');
        el.hidden = false; draw();
      }
      let done = false;
      return () => {
        if (done) return; done = true;
        if (--covers) return;
        el.classList.remove('cover');
        if (textEl && saved !== null) textEl.textContent = saved;
        saved = null;
        if (stopImg) { stopImg(); stopImg = null; }
        el.hidden = true;
        // 覆いの下でまだ待っているもの（begin() の続き）は、ふつうの待ち（約 1 秒の後）に戻す
        if (depth) timer = setTimeout(show, WAIT_MS);
      };
    },
    covered: () => covers > 0,
    // 確かめの窓を出すとき・デッキを見せたとき：消す（残りは短い。end() は後で呼んでよい）。覆い（cover）は消さない
    pause: hide,
  };
}
