// 内容の分野の並び（新規作成 ④ の札の順と、AI への指示の系列の順）。並びを変えるときはこの 1 行だけを直す。
// kit/core/new-deck.mjs の SUBJECTS と推す語の表、tools/make-llm-guide.mjs の SERIES がこの順に並ぶ。
// 並びは決まっていて、① で選んだ場面では変えない（推した分野には印を付けるだけ）。有料版から無料版に替えたときは、この順で初めの 2 つが残る。
// 並びは作者が見直し中（2026-10-27）：決まるまでは前からの並びのまま
// Node にもブラウザにも依存しない
export const SUBJECT_ORDER = Object.freeze(['academic', 'business', 'kokugo', 'english', 'info', 'social', 'music']);   // 系列の名前
