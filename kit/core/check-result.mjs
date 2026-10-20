// kit/check.mjs の結果（終了コードと --json の出力）を読む側の共通の部品。Node にもブラウザにも依存しない
// 検査が終わっていない（ブラウザが起動できない・落ちた）ときは、終了コード 2・JSON は status: "crashed"（指摘なし）。
// 「指摘 0」「エラー 0」と取り違えないように、結果を読むところはこの関数を通す（無効な結果は例外）
//   parseCheck(stdout, status?) → check --json の結果（{ok, lang, counts, results}）。status は終了コード（分かれば）
//   checkFinished(result, status?) → bool：検査が終わった結果か
export function checkFinished(result, status) {
  return status !== 2 && !!result && result.status !== 'crashed' && Array.isArray(result.results);
}
export function parseCheck(stdout, status) {
  let j = null;
  try { j = JSON.parse(String(stdout)); } catch { /* 下で例外 */ }
  if (!checkFinished(j, status)) throw new Error(`check did not finish (exit ${status ?? '?'}${j && j.status ? `, status ${j.status}` : ''}): the result is invalid, not "0 errors"`);
  return j;
}
