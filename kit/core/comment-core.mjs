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
