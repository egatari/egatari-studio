// 台本の読み {表示|読み}（format spec §8.3、R-reading：1 つの記号か 1 つの用語）を扱う小さな道具。Node にもブラウザにも依存しない
// 台本の欄（server/script-field.js）・読み方のボタン（server/editor-ui.js、backlog #101）・narration.md の書き換え（narration-core.mjs）が共有する
//   splitReadings(s) → [{text} | {x, y}]         発言の文字列を、読みのかたまりとそれ以外に分ける（{cue} などは text のまま）
//   joinReadings(parts) → 文字列                   splitReadings の逆
//   checkWord(s) → {ok: true, word} | {ok: false, why: 'empty'|'space'|'mark'|'expr'|'long'}   読みを付けてよい選び方か
//   findBare(s, x) → [[start, end]…]              読みの付いていない所（{…} の外）にある x。語の境目の規則つき
//   applyReading(s, x, y) → {text, n}             その発言の、読みの付いていない x をすべて {x|y} にする
//   readingIn(s, x) → y | null                     その発言で x に付いている読み（最初のもの）
export const MAX_WORD = 24;
const READING = /\{([^{}|]+)\|([^{}]+)\}/g;
const KANJI = /[㐀-鿿豈-﫿々]/;
const ALNUM = /[A-Za-z0-9]/;

export function splitReadings(s) {
  const out = [];
  let at = 0;
  const src = String(s ?? '');
  for (const m of src.matchAll(READING)) {
    if (m.index > at) out.push({ text: src.slice(at, m.index) });
    out.push({ x: m[1], y: m[2] });
    at = m.index + m[0].length;
  }
  if (at < src.length) out.push({ text: src.slice(at) });
  return out;
}
export const joinReadings = (parts) => parts.map((p) => (p.text !== undefined ? p.text : '{' + p.x + '|' + p.y + '}')).join('');
export const isWellFormedReading = (x, y) => typeof x === 'string' && typeof y === 'string' && x.trim() === x && !!x && !!y.trim() && !/[{}|]/.test(x) && !/[{}]/.test(y);

// 1 つの語か記号か。Q*・x′・θ̂・N₀・L殻・t-SNE は通す。空白・句読点・式・{ } | ・ひらがなでつないだ 2 つの記号（θとη）は断る
export function checkWord(s) {
  const w = String(s ?? '').trim();
  if (!w) return { ok: false, why: 'empty' };
  if (/[{}|]/.test(w)) return { ok: false, why: 'mark' };
  if (/\s/.test(w)) return { ok: false, why: 'space' };
  if ([...w].length > MAX_WORD) return { ok: false, why: 'long' };
  if (/[、。，．,;；:：!！?？=＝+＋−<>＜＞≤≥×÷/／\\()（）[\]［］「」『』【】〈〉《》"“”'‘’・…]/.test(w)) return { ok: false, why: 'expr' };
  // - は英字の間（t-SNE）だけ
  for (let i = 0; i < w.length; i++) if ((w[i] === '-' || w[i] === '‐' || w[i] === '–') && !(i > 0 && i < w.length - 1 && /[A-Za-z]/.test(w[i - 1]) && /[A-Za-z]/.test(w[i + 1]))) return { ok: false, why: 'expr' };
  // ひらがなで 2 つの記号・英字をつなぐ（θとη、xとy）
  if (/[^ぁ-ゟ゠-ヿ㐀-鿿々ー][ぁ-ゟ]+[^ぁ-ゟ゠-ヿ㐀-鿿々ー]/.test(w)) return { ok: false, why: 'expr' };
  return { ok: true, word: w };
}

// 語の境目：x が英字・数字で始まる（終わる）なら、前（後ろ）が英字・数字の所は別の語。漢字で始まる（終わる）なら、前（後ろ）が漢字の所は長い語の一部
function boundaryOk(text, i, x) {
  const a = text[i - 1], b = text[i + x.length], f = x[0], l = x[x.length - 1];
  if (a !== undefined && ALNUM.test(f) && ALNUM.test(a)) return false;
  if (b !== undefined && ALNUM.test(l) && ALNUM.test(b)) return false;
  if (a !== undefined && KANJI.test(f) && KANJI.test(a)) return false;
  if (b !== undefined && KANJI.test(l) && KANJI.test(b)) return false;
  // 結合文字（θ̂ のハット）が続くなら、x はその字の一部
  if (b !== undefined && /[̀-ͯ]/.test(b)) return false;
  return true;
}
function findInText(text, x) {
  const out = [];
  if (!x) return out;
  for (let i = text.indexOf(x); i >= 0; i = text.indexOf(x, i + 1)) if (boundaryOk(text, i, x)) { out.push(i); i += x.length - 1; }
  return out;
}
export function findBare(s, x) {
  const out = [];
  let at = 0;
  for (const p of splitReadings(s)) {
    if (p.text !== undefined) { for (const i of findInText(p.text, x)) out.push([at + i, at + i + x.length]); at += p.text.length; }
    else at += p.x.length + p.y.length + 3;
  }
  return out;
}
export function applyReading(s, x, y) {
  let n = 0;
  const parts = splitReadings(s).flatMap((p) => {
    if (p.text === undefined) return [p];
    const hits = findInText(p.text, x);
    if (!hits.length) return [p];
    const o = [];
    let at = 0;
    for (const i of hits) { if (i > at) o.push({ text: p.text.slice(at, i) }); o.push({ x, y }); at = i + x.length; n++; }
    if (at < p.text.length) o.push({ text: p.text.slice(at) });
    return o;
  });
  return { text: joinReadings(parts), n };
}
export function readingIn(s, x) {
  for (const p of splitReadings(s)) if (p.text === undefined && p.x === x) return p.y;
  return null;
}
// 台本の言語（読み方の辞書と声を分ける）：仮名か漢字があれば日本語
export const textLang = (s) => (/[ぁ-ヿ㐀-鿿]/.test(String(s ?? '')) ? 'ja' : 'en');
