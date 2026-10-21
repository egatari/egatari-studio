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

// strokes：編集モードの手書きメモ（コメントのペン、m）で描いた線。1 つのメモに線は何本でも（丸と矢印など。STROKES_MAX 本まで）。
//   線はスライドの座標の点の並び [[x, y], …]（1280×720、表示の倍率によらない）。形は docs/contract.md「Review notes」（§12）
//   pin と同じく信頼しない知らせが元なので、線ごとに：配列でなければ・点（有限の数の組）が 2 つに満たなければその線は捨てる。
//   スライドの外は端に寄せ、0.1 に丸め、続けて同じ点は 1 つにする。STROKE_MAX（500）点を超える線は、収まるまで許す誤差を倍にしながら
//   間引く（Ramer–Douglas–Peucker、端の点は残す）。受け取る点は線ごとに STROKE_IN（5000）までで、それを超える線は捨てる。
//   残った線の初めの STROKES_MAX（20）本を使い、点の合計が STROKES_POINTS（2000）を超えれば、全部の線を同じ誤差で（0.25 から倍にしながら）
//   さらに間引く。線が 1 本も残らなければ線なし。並びが STROKES_IN（200）本を超える・受け取る点の合計が STROKES_IN_POINTS（20000）を超えるものも線なし
//   前の形（1 本だけの stroke: [[x, y], …]）は entryStrokes が strokes: [stroke] として読む。書くのは strokes だけ
export const STROKE_MAX = 500, STROKE_IN = 5000, STROKES_MAX = 20, STROKES_POINTS = 2000, STROKES_IN = 200, STROKES_IN_POINTS = 20000;
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
function cleanStroke(s) {
  if (!Array.isArray(s) || s.length > STROKE_IN) return null;
  const out = [];
  for (const q of s) {
    if (!Array.isArray(q) || q.length < 2 || typeof q[0] !== 'number' || typeof q[1] !== 'number' || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const p = [clamp(q[0], SLIDE_W), clamp(q[1], SLIDE_H)], l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  return out.length < 2 ? null : out;
}
function simplify(P, max) {
  let r = P;
  for (let eps = 0.25; r.length > max; eps *= 2) r = rdp(P, eps);
  return r;
}
// 1 本の線（前の形の stroke。normStrokes の線ごとの規則）
export function normStroke(s) {
  const c = cleanStroke(s);
  return c ? simplify(c, STROKE_MAX) : null;
}
export function normStrokes(v) {
  if (!Array.isArray(v) || v.length > STROKES_IN) return null;
  let seen = 0;
  for (const s of v) if (Array.isArray(s)) seen += s.length;
  if (seen > STROKES_IN_POINTS) return null;
  const raw = [];
  for (const s of v) {
    const c = cleanStroke(s);
    if (c) raw.push(simplify(c, STROKE_MAX));
    if (raw.length === STROKES_MAX) break;
  }
  if (!raw.length) return null;
  let r = raw;
  const total = (a) => a.reduce((n, P) => n + P.length, 0);
  for (let eps = 0.25; total(r) > STROKES_POINTS; eps *= 2) r = raw.map((P) => (P.length > 2 ? rdp(P, eps) : P));
  return r;
}
// comments.json の項目（や書き込みの知らせ）の線：strokes があればそれ、なければ前の形の stroke を 1 本の線として
export function entryStrokes(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.strokes !== undefined) return normStrokes(c.strokes);
  if (c.stroke !== undefined) return normStrokes([c.stroke]);
  return null;
}
// 線の重心（全部の線の区間の中点を、区間の長さで重みを付けて平均したもの）。手書きメモの pin はこれ。長さが 0 なら 1 本目の最初の点
export function strokesCentroid(S) {
  let sx = 0, sy = 0, sl = 0;
  for (const s of S) {
    for (let i = 1; i < s.length; i++) {
      const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      sx += l * (s[i][0] + s[i - 1][0]) / 2; sy += l * (s[i][1] + s[i - 1][1]) / 2; sl += l;
    }
  }
  return sl > 0 ? { x: clamp(sx / sl, SLIDE_W), y: clamp(sy / sl, SLIDE_H) } : { x: S[0][0][0], y: S[0][0][1] };
}
export const strokeCentroid = (s) => strokesCentroid([s]);
