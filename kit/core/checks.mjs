// 確認問題（パーツの問いへの答え。format spec §8.4 ctx.answer・§9.2 completion.checks、spec bindings/scorm12.md §2.1・§3）の純ロジック
// - import なし・DOM と node: に触れない：再生器では build（kit/core/build-core.mjs の classicNamespace）が DECK.Checks にし（kit/track.js が使う）、
//   試験と包み（kit/core/scorm.mjs）は ES モジュールとして読む
// - 問いの鍵は包み方 §2.1 の `<slideKey>/<スライドの中のパーツの番号>/<id>`。スライドの鍵と id は encodeURIComponent で ASCII にする
//   （cmi.suspend_data は ASCII、鍵は , でつなぐ）。ふつうの鍵（s-abc123）と id（q）はそのまま
// - 数えるのは「少なくとも 1 回」（§9.2）：一度答えた・正解した問いは、後で外しても答えた・正解したまま。最後の答え（latest）は別に持つ
// - プレーヤーが知る問いは、パーツが答えを知らせた問いだけ（形式に問いを前もって宣言する口はない）。答えを知らせていない問いは数えようがない
// - 正解のある問い（right）：correct が true か false で知らせた問い。再開のデータには答えた（qa）と正解した（qc）しかないので、
//   qa にあって qc にない問いは正解のある問いとみなす（点数を上げない・"correct" では正解するまで満たさない側に倒す）
//
//   checksRule(completion) → "answered" | "correct" | null（知らない値は null：今までの決まりのまま）
//   questionKey(slideKey, index, id) → 問いの鍵
//   answerValue(correct, value) → {correct, value?}（形の違う知らせは null）
//   newAnswers() → {answered, correct, right, latest}（鍵 → 1 の object。latest は鍵 → {correct, value?}）
//   recordAnswer(state, key, correct, value?) → state（同じ鍵は最後の答えで置き換え、答えた・正解したは残す）
//   checksMet(rule, state) → 確認問題の条件を満たしたか（rule がなければ true）
//   scoreOf(state) → 正解のある問いのうち正解した割合（0〜100 の整数）。正解のある問いがなければ null
//   keysText(set) → 鍵を , でつないだ字（名前の順）。keysFrom(text) → 鍵の並び（形の違う鍵は捨てる）
//   restoreAnswers(state, qa, qc) → state（再開のデータの qa・qc を足す）

const KEY_RE = /^[A-Za-z0-9%._~!*'()-]+\/(0|[1-9][0-9]*)\/[A-Za-z0-9%._~!*'()-]+$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function checksRule(completion) {
  const c = completion && typeof completion === 'object' ? completion.checks : undefined;
  return c === 'answered' || c === 'correct' ? c : null;
}
export function questionKey(slideKey, index, id) {
  return encodeURIComponent(String(slideKey)) + '/' + index + '/' + encodeURIComponent(String(id));
}
export function answerValue(correct, value) {
  if (correct !== true && correct !== false && correct !== null) return null;
  const r = { correct };
  if (typeof value === 'string') r.value = value.slice(0, 1000);
  else if (typeof value === 'number' && isFinite(value)) r.value = value;
  return r;
}
export function newAnswers() {
  return { answered: Object.create(null), correct: Object.create(null), right: Object.create(null), latest: Object.create(null) };
}
export function recordAnswer(state, key, correct, value) {
  state.answered[key] = 1;
  if (correct === true || correct === false) state.right[key] = 1;
  if (correct === true) state.correct[key] = 1;
  state.latest[key] = value === undefined ? { correct } : { correct, value };
  return state;
}
export function checksMet(rule, state) {
  // "answered"：知っている問いは、どれも答えを知らせた問い（上の注意）。満たさない問いはない
  if (rule === 'answered') return true;
  if (rule === 'correct') return Object.keys(state.right).every((k) => own(state.correct, k));
  return true;
}
export function scoreOf(state) {
  const right = Object.keys(state.right);
  if (!right.length) return null;
  const n = right.filter((k) => own(state.correct, k)).length;
  return Math.round((100 * n) / right.length);
}
export function keysText(set) {
  return Object.keys(set).sort().join(',');
}
export function keysFrom(text) {
  if (typeof text !== 'string' || !text) return [];
  return text.split(',').filter((k) => KEY_RE.test(k));
}
export function restoreAnswers(state, qa, qc) {
  const c = keysFrom(qc);
  keysFrom(qa).forEach((k) => { state.answered[k] = 1; state.right[k] = 1; });
  c.forEach((k) => { state.answered[k] = 1; state.right[k] = 1; state.correct[k] = 1; });
  return state;
}
