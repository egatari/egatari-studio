// 英語の数え方：n が 1 なら単数、それ以外は複数（既定は one + 's'。不規則な複数は many に渡す）
//   plural(1, 'error') → 'error'　plural(2, 'error') → 'errors'　plural(1, 'character') → 'character'
// 注意：kit/core/layout-scan.mjs・kit/core/geometry-check.mjs・app/frame-shim.js は文字列化してページに埋め込むので、
// ここを import せず三項演算子をその場に書く（埋め込み先はこのファイルを読めない）
export const plural = (n, one, many = one + 's') => (n === 1 ? one : many);
