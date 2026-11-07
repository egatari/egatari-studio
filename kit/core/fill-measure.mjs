// 本文の釣り合い（R-balance の段 1。品質チェックの balance、情報だけ）。Node にもブラウザにも依存しない（純粋な ESM）
// ねらいは釣り合いで、画素を埋めることではない：中身が本文の上に寄り、下に片寄った空きを残すものを知らせる。四方に同じ余白のある中央の塊は 0 に近い。
// 要素の箱はいつも「いっぱい」に見える（部品の箱は高さを与えればその高さになる）ので、描いた画素で測る：
// 本文（.body）の箱を画面に描いた画素（RGBA、1 CSS px = 1 画素）で、地の色でない画素を中身とし、
//   1. 縦の釣り合い vOffset：中身の画素の重心（画素 1 つを重さ 1 とする。外接矩形の中心ではない）の y と、本文の光学的な中心（上から 45%）の差。
//      本文の高さに対する %。上に寄ると負
//   2. 片寄った空き band・side：外接矩形と本文の縁の間の空き（上・下・左・右）から、max(下−上, 上−下, 左−右, 右−左)（本文の高さ・幅に対する %）と、
//      その側（大きく空いている側）。四方の余白がそろえば 0
//   3. 横の釣り合い hOffset：重心の x と本文の幾何学的な中心（左右の真ん中）の差。本文の幅に対する %。左に寄ると負（2 段組みの片寄り）
// 地の色：スライドの計算された地の色。各色の差がどれも BALANCE.tol 以下の画素は地（アンチエイリアスの縁・薄い罫線）。
// 外接矩形は、地でない画素が BALANCE.minRun 未満の行・列を空とみなす（ちらばった 1 画素で広げない）。重心は地でない画素すべてで取る。
//   measureBalance({data, width, height}, bg) → {empty, vOffset, hOffset, band, side, top, bottom, left, right, bbox}
//   balanceFlagged(m, {tate}) → bool：上に強く寄り（vOffset < −BALANCE.vOffset）、かつ下の空き − 上の空きが BALANCE.band を超える。
//     縦組み（layout-tate。列は右から左へ進み、空きは左に残る）は横に読み替える：右に寄り（hOffset > BALANCE.vOffset）、かつ左の空き − 右の空きが BALANCE.band を超える
//   BALANCE_SKIP：測らないスライドの class（表紙・章の扉・段階のないスライド）
// 段 2 で直し方の言葉（字で埋めない）を足す。段 1 は数だけを知らせる。

// 調整できる閾値（%）と、光学的な中心・地とみなす色の差（0〜255、各色）・空とみなす画素の数
export const BALANCE = Object.freeze({
  vOffset: 10,    // 重心が光学的な中心より本文の高さのこの % を超えて上にあり、かつ
  band: 25,       // 下の空き − 上の空きが本文の高さのこの % を超えれば知らせる
  optical: 45,    // 光学的な中心（上から %）
  tol: 24,        // 地の色との差（各色の最大）がこれ以下なら地
  minRun: 2,      // 外接矩形：1 行・1 列にこの数より少ない地でない画素は数えない
});
export const BALANCE_SKIP = Object.freeze(['cover', 'sec', 'static']);

const pct = (x) => Math.round(x * 1000) / 10;   // 小数 1 桁の %

export function measureBalance({ data, width, height }, bg, { tol = BALANCE.tol, minRun = BALANCE.minRun, optical = BALANCE.optical } = {}) {
  const [br, bgG, bb] = bg;
  const rows = new Uint32Array(height), cols = new Uint32Array(width);
  let mass = 0, sx = 0, sy = 0;
  for (let y = 0; y < height; y++) {
    let o = y * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      if (data[o + 3] === 0) continue;   // 透明な画素（撮った画面にはないはず）は地
      if (Math.abs(data[o] - br) > tol || Math.abs(data[o + 1] - bgG) > tol || Math.abs(data[o + 2] - bb) > tol) { rows[y]++; cols[x]++; mass++; sx += x + 0.5; sy += y + 0.5; }
    }
  }
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < height; y++) if (rows[y] >= minRun) { if (y0 < 0) y0 = y; y1 = y; }
  for (let x = 0; x < width; x++) if (cols[x] >= minRun) { if (x0 < 0) x0 = x; x1 = x; }
  if (y0 < 0 || x0 < 0 || !mass) return { empty: true, vOffset: 0, hOffset: 0, band: 0, side: null, top: 100, bottom: 100, left: 100, right: 100, bbox: null };
  const vOffset = pct((sy / mass - (optical / 100) * height) / height), hOffset = pct((sx / mass - width / 2) / width);
  const top = pct(y0 / height), bottom = pct((height - 1 - y1) / height);
  const left = pct(x0 / width), right = pct((width - 1 - x1) / width);
  // 片寄った空き：差のいちばん大きい側（同じなら下・上・右・左の順）
  const [side, d] = [['bottom', bottom - top], ['top', top - bottom], ['right', right - left], ['left', left - right]].reduce((a, c) => (c[1] > a[1] ? c : a));
  return { empty: false, vOffset, hOffset, band: d > 0 ? Math.round(d * 10) / 10 : 0, side: d > 0 ? side : null, top, bottom, left, right, bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

export function balanceFlagged(m, { tate = false, vOffset = BALANCE.vOffset, band = BALANCE.band } = {}) {
  if (!m || m.empty) return false;
  if (tate) return m.hOffset > vOffset && m.left - m.right > band;
  return m.vOffset < -vOffset && m.bottom - m.top > band;
}
