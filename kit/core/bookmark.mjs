// しおり（format spec §8.0 Bookmarks、Player P4.3）：<section class="slide" data-bookmark="名前">。Node にもブラウザにも依存しない（純粋な ESM）
//   BOOKMARK_MAX                 名前の字数の上限（20。字は code point で数える）
//   bookmarkName(v)              属性の値 → 見せる名前（空白を 1 つにして前後を除く。なければ ''）
//   bookmarkLength(name)         字数（code point）
//   bookmarkDefault(heading, taken)  しおりを付けるときの既定の名前：見出しを 20 字で切ったもの。taken（ほかのスライドのしおりの名前）と
//                                同じなら、後ろに「 2」「 3」…を足して 20 字に収める（同じ名前が並ばない：bookmarkDup を出さない）。見出しがなければ ''
//   bookmarkFindings(src)        原稿の文字列 → [{i, sev, code, a}]。品質チェックのコマンド版（kit/check.mjs）と編集アプリ（kit/core/check-source.mjs）が同じものを出す
//       bookmarkDup：同じ名前のしおりが 2 枚以上（名前ごとに 1 つ、最初のスライドに。a = {name, n}）
//       bookmarkLong：名前が 20 字を超える（スライドごと。a = {name, n}）
import { analyzeSlideIds } from './build-core.mjs';

export const BOOKMARK_MAX = 20;
export const bookmarkName = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
export const bookmarkLength = (name) => [...String(name)].length;
const cutTo = (s, n) => [...s].slice(0, Math.max(0, n)).join('').trim();
export function bookmarkDefault(heading, taken = []) {
  const base = cutTo(bookmarkName(heading), BOOKMARK_MAX);
  if (!base) return '';
  const used = new Set([...taken].map(bookmarkName));
  if (!used.has(base)) return base;
  for (let k = 2; ; k++) {
    const suf = ' ' + k, n = cutTo(base, BOOKMARK_MAX - bookmarkLength(suf)) + suf;
    if (!used.has(n)) return n;
  }
}

export function bookmarkFindings(src) {
  const out = [];
  if (typeof src !== 'string' || !src) return out;
  const byName = new Map();
  for (const s of analyzeSlideIds(src).slides) {
    const name = bookmarkName(s.bookmark);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(s.index);
    const n = bookmarkLength(name);
    if (n > BOOKMARK_MAX) out.push({ i: s.index, sev: 'warn', code: 'bookmarkLong', a: { name, n } });
  }
  for (const [name, is] of byName) if (is.length > 1) out.push({ i: is[0], sev: 'warn', code: 'bookmarkDup', a: { name, n: is.length } });
  return out.sort((x, y) => x.i - y.i);
}
