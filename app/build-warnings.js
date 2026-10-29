// 品質チェックの板の「組み立ての警告」の 1 行の見せ方（app/main.js の buildWarnBox）
// 組み立ての警告（kit/core/build-core.mjs・narration-core.mjs）は、AI への修正依頼にもそのまま渡す文字列（app/llm.js）なので、元の文字列は変えない。
// 画面では、中の名前（「## s-xxxx」[k]・narration.md の行番号）を外し、スライドの番号と見出しで示す。スライドが分かれば、押すとその枚へ動く
//   warnView(w, slides, T) → { text, i }   slides：[{key, heading}]（組み立ての順）。i はスライドの番号（0 から）か null
const AT = /「## ([^」]+)」\[[^\]]*\]（narration\.md \d+ 行目）/;                    // mark: …「## 鍵」[段階]（narration.md N 行目）
const NO_SLIDE = /「## ([^」]*)」（鍵「[^」]*」、narration\.md \d+ 行目）/;           // narration: スライドが見つからない「## 見出し」（鍵「…」、narration.md N 行目）
const LINE = /^narration\.md \d+ 行目: /;                                          // narration: narration.md N 行目: …（口述原稿の読み取りの知らせ）
export function warnView(w, slides, T) {
  let text = String(w), i = null;
  const m = AT.exec(text);
  if (m) {
    const n = (slides || []).findIndex((s) => s.key === m[1]);
    i = n < 0 ? null : n;
    text = text.replace(AT, '').trimEnd();
  }
  text = text.replace(NO_SLIDE, (_, h) => `「${h}」`);
  if (/^mark: /.test(text)) text = T.bwMark + text.slice(6);
  else if (/^narration: /.test(text)) text = T.bwScript + text.slice(11).replace(LINE, '');
  return { text, i };
}
