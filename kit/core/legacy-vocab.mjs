// 1.0 の語彙にない書き方（format spec §8.0）を原稿（deck.html）から探す。品質チェック（kit/check.mjs）が警告にする（エラーにはしない：
// 夜の評価の A の原稿は AI が書いたままのもの）。Studio はどれも書かない。Node にもブラウザにも依存しない
//   legacyVocabulary(src) → [{code, what, to?, n, line}]（見つかったものだけ。what ごとに 1 つ、n は数、line は最初の行）
//     code 'legacyColorClass'：class の blue・red・gray → 意味のクラス term・emph・muted（§8.0「Text and colour」）
//     code 'legacyStepAttr'  ：data-steps・data-anim（キットの形式の DECK.ANIM）→ ステップの数と動きは §8.0 の決まり（data-step・data-at・draw・部品の steps）
//     code 'legacyLectureMode'：<html data-mode="lecture"> → 「先のステップを薄く見せる」（再生の設定。原稿には書かない）
import { parse } from 'parse5';

export const COLOR_TO = Object.freeze({ blue: 'term', red: 'emph', gray: 'muted' });

function walk(n, fn) {
  fn(n);
  for (const c of n.childNodes || []) walk(c, fn);
  if (n.content) walk(n.content, fn);
}
export function legacyVocabulary(src) {
  const text = String(src);
  const doc = parse(text, { sourceCodeLocationInfo: true });
  const lineOf = (off) => text.slice(0, off).split('\n').length;
  const found = new Map();
  const add = (code, what, at, extra = {}) => {
    const k = code + ':' + what;
    if (!found.has(k)) found.set(k, { code, what, n: 0, line: lineOf(at), ...extra });
    found.get(k).n++;
  };
  walk(doc, (n) => {
    if (!n.tagName || !n.sourceCodeLocation) return;
    const at = n.sourceCodeLocation.startOffset;
    for (const a of n.attrs || []) {
      if (a.name === 'class') for (const c of a.value.split(/\s+/)) if (Object.hasOwn(COLOR_TO, c)) add('legacyColorClass', c, at, { to: COLOR_TO[c] });
      if (a.name === 'data-steps' || a.name === 'data-anim') add('legacyStepAttr', a.name, at);
      if (n.tagName === 'html' && a.name === 'data-mode' && a.value.trim().toLowerCase() === 'lecture') add('legacyLectureMode', 'data-mode="lecture"', at);
    }
  });
  return [...found.values()];
}
