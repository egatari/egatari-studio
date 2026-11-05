// markdown-it 13 が読む Node の punycode の代わり（本文の道具 app/article-tools.js だけ。tools/build-app.mjs の alias）。
// markdown-it はリンクの host を ASCII にするのに使うが、本文のリンクの字は書いたまま出す（§9C.6）ので、そのまま返す
export const toASCII = (s) => s;
export const toUnicode = (s) => s;
export default { toASCII, toUnicode };
