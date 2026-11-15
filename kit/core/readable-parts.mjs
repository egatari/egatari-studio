// パーツの読める中身（format spec §2.1 Readable content of components、backlog #216）
// 再生器の DECK.readableParts()（kit/deck.js）が、スライドの最後の状態のパーツの中の印（data-readable）の要素を HTML の字にして返す。
// 1 ファイルへの書き出し（kit/core/portable.mjs）は、それを読める層のスライドの article の、ステップの div の後に写す。
// 再生器の答えはパーツと同じページで作られる（パーツが書き換えられる）ので、ここで使ってよい要素と属性だけに作り直してから写す。
import { parseFragment } from 'parse5';

export const READABLE_MARK = 'data-readable';
// 使ってよい要素（ほかの要素はその字に置き換える）と属性（ほかは外す）
export const READABLE_TAGS = new Set(['pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'ol', 'ul', 'li', 'p', 'span']);
const KEEP_ATTRS = ['colspan', 'rowspan', 'lang'];
const MAX_PER_SLIDE = 64;

const esc = (t, attr) => { t = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return attr ? t.replace(/"/g, '&quot;') : t; };
const textOf = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes || []).map(textOf).join(''));
function serialize(n) {
  if (n.nodeName === '#text') return esc(n.value);
  if (!n.tagName) return '';
  if (!READABLE_TAGS.has(n.tagName) || (n.namespaceURI && !/xhtml/.test(n.namespaceURI))) return esc(textOf(n));
  const a = KEEP_ATTRS.map((k) => (n.attrs || []).find((x) => x.name === k)).filter(Boolean).map((x) => ` ${x.name}="${esc(x.value, true)}"`).join('');
  const kids = n.tagName === 'template' ? [] : (n.childNodes || []);
  return `<${n.tagName}${a}>${kids.map(serialize).join('')}</${n.tagName}>`;
}
// 1 つの字（再生器が作った HTML）を、使ってよい要素と属性だけの字に作り直す。いちばん外が使ってよい要素でなければ、その字
export function sanitizeReadable(html) {
  const f = parseFragment(String(html));
  return (f.childNodes || []).map(serialize).join('');
}
// 再生器の答え {スライドの鍵: [字…]} を確かめて作り直す。形の合わないものは捨てる（知らせは warn に）
export function readablePartsOf(res, keys, warn = () => {}) {
  const out = {};
  if (!res || typeof res !== 'object') return out;
  for (const [k, list] of Object.entries(res)) {
    if (!keys.has(k)) { warn(`readable content for "${k}" matches no slide; omitted`); continue; }
    if (!Array.isArray(list)) continue;
    const xs = list.slice(0, MAX_PER_SLIDE).filter((x) => typeof x === 'string').map(sanitizeReadable).filter((x) => x.trim());
    if (list.length > MAX_PER_SLIDE) warn(`slide "${k}": more than ${MAX_PER_SLIDE} readable elements; the rest are omitted`);
    if (xs.length) out[k] = xs;
  }
  return out;
}
// 再生器で開いて読む（ブラウザの中で動く関数。page.evaluate に渡す）
export const READABLE_PROBE = () => (window.DECK && typeof DECK.readableParts === 'function' ? DECK.readableParts() : null);   // eslint-disable-line no-undef
