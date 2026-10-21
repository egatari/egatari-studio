// コメント（comments.json）の点（pin）を確かめる。開発サーバー（server/dev.mjs）と編集アプリ（app/devapi.js）が共有する
// （信頼する編集の画面 server/editor-ui.js は、開発サーバーが 1 ファイルのまま配るので同じ規則を自分の中に持つ）
//   pin：Alt/⌥+クリックした点のスライドの座標 {x, y}（1280×720。表示の倍率によらない）。プレビュー（信頼しない）からの知らせが元なので、
//   数（number で有限）でなければ点なし、スライドの外は端に寄せ、0.1 に丸め、ほかの項目は捨てる。点が偽でも、変わるのは印の位置だけ
//   （指示の本文は信頼する画面で人が書き、残すボタンを押したときだけ書かれる）
export const SLIDE_W = 1280, SLIDE_H = 720;
const clamp = (v, hi) => Math.round(Math.max(0, Math.min(hi, v)) * 10) / 10;
export function normPin(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: clamp(p.x, SLIDE_W), y: clamp(p.y, SLIDE_H) };
}

// stroke：編集モードの手書きメモ（コメントのペン、m）で描いた線。スライドの座標の点の並び [[x, y], …]（1280×720、表示の倍率によらない）。
//   pin と同じく信頼しない知らせが元なので：配列でなければ・点（有限の数の組）が 2 つに満たなければ線なし。スライドの外は端に寄せ、0.1 に丸め、
//   続けて同じ点は 1 つにする。STROKE_MAX（500）点を超えるなら、点の数が収まるまで許す誤差を倍にしながら線を間引く（Ramer–Douglas–Peucker、
//   端の点は残す）。受け取る点は STROKE_IN（5000）までで、それを超える並びは線なしにする。形は docs/contract.md「Review notes」
export const STROKE_MAX = 500, STROKE_IN = 5000;
function rdp(P, eps) {
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = L ? Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / L : Math.hypot(P[i][0] - ax, P[i][1] - ay);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
export function normStroke(s) {
  if (!Array.isArray(s) || s.length > STROKE_IN) return null;
  const out = [];
  for (const q of s) {
    if (!Array.isArray(q) || q.length < 2 || typeof q[0] !== 'number' || typeof q[1] !== 'number' || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const p = [clamp(q[0], SLIDE_W), clamp(q[1], SLIDE_H)], l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  if (out.length < 2) return null;
  let r = out;
  for (let eps = 0.25; r.length > STROKE_MAX; eps *= 2) r = rdp(out, eps);
  return r;
}
// 線の重心（長さで重みを付けた区間の中点の平均）。手書きメモの pin はこれ。線の長さが 0 なら最初の点
export function strokeCentroid(s) {
  let sx = 0, sy = 0, sl = 0;
  for (let i = 1; i < s.length; i++) {
    const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    sx += l * (s[i][0] + s[i - 1][0]) / 2; sy += l * (s[i][1] + s[i - 1][1]) / 2; sl += l;
  }
  return sl > 0 ? { x: clamp(sx / sl, SLIDE_W), y: clamp(sy / sl, SLIDE_H) } : { x: s[0][0], y: s[0][1] };
}
