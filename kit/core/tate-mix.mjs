// 縦と横の入れ替わり（handoff #70、作者 2026-11-21）：縦書き（layout-tate）と横書きのスライドが何度も入れ替わると、読む向きと見出し・結論の行の位置が
// そのたびに変わって読みにくい。表紙と扉を除いたスライドを順に見て、縦かどうかが前のスライドと変わった回数を数え、TATE_SWITCH_MAX 回以上なら警告する。
// Node にもブラウザにも依存しない（純粋な ESM）。品質チェックのコマンド版（kit/check.mjs）と編集アプリ（kit/core/check-source.mjs）が同じものを出す
//   TATE_SWITCH_MAX            警告する回数（3）
//   tateSwitches(slides)       analyzeSlideIds の slides → 入れ替わりの回数
//   tateMixFindings(src)       原稿の文字列 → [{i, sev, code: 'tateMixed', a: {n}}]（最初に入れ替わったスライドに 1 つ）
import { analyzeSlideIds } from './build-core.mjs';

export const TATE_SWITCH_MAX = 3;

export function tateSwitches(slides) {
  let n = 0, prev = null, first = null;
  for (const s of slides) {
    if (s.cover) continue;
    if (prev !== null && s.tate !== prev) { n++; if (first === null) first = s.index; }
    prev = s.tate;
  }
  return { n, first };
}

export function tateMixFindings(src) {
  if (typeof src !== 'string' || !src) return [];
  const { n, first } = tateSwitches(analyzeSlideIds(src).slides);
  return n >= TATE_SWITCH_MAX ? [{ i: first, sev: 'warn', code: 'tateMixed', a: { n } }] : [];
}
