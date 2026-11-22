// 本文に画像を足す（編集アプリのスライド ▾ の「画像を挿入…」。app/image-insert.js。handoff #85）。Node にもブラウザにも依存しない（純粋な ESM）
// 原稿（deck.html）の文字列を受け取り、新しい文字列を返す。読み書きはしない。
// 自由な配置はしない：置き方は本文の中（全幅・半分・3 分の 1）と 2 列の左・右だけ。縦横比を保って幅に合わせる（はみ出しは今の品質チェック）。
// 体裁は今あるものだけ（kit/layouts.css の .fig・.cols。幅は要素の style）。画像は <img src="data:…">（SVG も data:image/svg+xml なので中のスクリプトは動かない）
//
//   IMAGE_TYPES                        受け取る画像の種類（PNG・JPEG・WebP・SVG）
//   PLACEMENTS                         置き方：'full' | 'half' | 'third' | 'left' | 'right'
//   imageType(bytes)                   中身（先頭のバイト）から種類を決める → IMAGE_TYPES のどれか | null（名前や申告の type は信じない）
//   dataUrl(bytes, mime)               → 'data:<mime>;base64,…'
//   sizeNotice(n)                      1 つの画像の目安（kit/core/image-size.mjs の MAX_IMAGE_BYTES、1 MiB）を超えれば MB の字（小数 1 桁）、超えなければ null
//   slideSteps(src, index)             そのスライドのステップの数（結論の行を除く）{max, isStatic, auto, concl}。concl：結論の行があるか。auto：本文の直下の箇条が 1 つずつ出る形（kit/deck.js の autoList）
//   imageHtml({src, alt, placement, step})   入れる塊：<div class="fig"[ data-step]><img src alt style></div>
//   insertImage(src, index, opts)      index 番目のスライドに入れた原稿。本文（.body）の終わり（結論の行 .concl は .body の外なので、その前）、
//                                      2 列なら .body の直下の .cols の左・右の列の終わり。.cols がなければ本文を右（左）の列に入れて 2 列にする。
//                                      ステップを付けるときと 2 列にするときは、本文の直下の箇条の自動のステップを data-step に書き出す（見え方を変えない）
import { parse } from 'parse5';
import { MAX_IMAGE_BYTES } from './image-size.mjs';

export const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
export const PLACEMENTS = Object.freeze(['full', 'half', 'third', 'left', 'right']);
const WIDTH = { full: '100%', half: '50%', third: '33.333%', left: '100%', right: '100%' };
const MiB = 1048576;

// ---------------------------------------------------------------- 種類・data: URL・大きさの知らせ
export function imageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const at = (i, ...xs) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  // SVG：先頭（BOM・空白・<?xml …?>・注釈・<!DOCTYPE …> を除く）が <svg
  let t;
  try { t = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 4096)); } catch { return null; }
  t = t.replace(/^﻿/, '');
  for (let k = 0; k < 20; k++) {
    const s = t.replace(/^\s+/, '');
    const m = /^(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i.exec(s);
    if (!m) { t = s; break; }
    t = s.slice(m[0].length);
  }
  return /^<svg[\s>]/i.test(t) ? 'image/svg+xml' : null;
}

export function dataUrl(bytes, mime) {
  if (!IMAGE_TYPES.includes(mime)) throw new Error('unsupported image type: ' + mime);
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export function sizeNotice(n) {
  return n > MAX_IMAGE_BYTES ? (Math.round((n / MiB) * 10) / 10).toFixed(1) : null;
}

// ---------------------------------------------------------------- スライドの木
function walk(node, fn) {
  if (fn(node) === false) return;
  for (const c of node.childNodes || []) walk(c, fn);
  if (node.content) walk(node.content, fn);
}
const attrOf = (n, a) => (n.attrs || []).find((x) => x.name === a);
const classes = (n) => (attrOf(n, 'class')?.value || '').split(/\s+/).filter(Boolean);
const hasClass = (n, c) => classes(n).includes(c);
const isSlide = (n) => n.tagName === 'section' && hasClass(n, 'slide');
const kids = (n) => (n.childNodes || []).filter((c) => c.tagName);
function slideNode(src, index) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  let node = null, k = 0;
  walk(doc, (x) => { if (x.tagName && isSlide(x)) { if (k === index) node = x; k++; return false; } return true; });
  if (!node) throw Object.assign(new Error(`no slide ${index + 1}`), { code: 'no-slide' });
  if (!node.sourceCodeLocation || !node.sourceCodeLocation.endTag) throw Object.assign(new Error(`slide ${index + 1} has no end tag (</section>)`), { code: 'deck-problem' });
  return node;
}
function descendants(node, pred) {
  const out = [];
  walk(node, (x) => { if (x !== node && x.tagName && pred(x)) out.push(x); return true; });
  return out;
}
// 本文の直下の箇条（kit/deck.js の autoList と同じ：.body > ul > li, .body > ol > li を文書の順に）
function autoItems(slide) {
  const out = [];
  walk(slide, (x) => {
    if (x.tagName === 'li' && x.parentNode && /^(ul|ol)$/.test(x.parentNode.tagName || '') && x.parentNode.parentNode && hasClass(x.parentNode.parentNode, 'body')) out.push(x);
    return true;
  });
  return out;
}
function autoListOn(slide) {
  return !hasClass(slide, 'static') && !hasClass(slide, 'nostep') && !descendants(slide, (x) => attrOf(x, 'data-step') || attrOf(x, 'data-from')).length;
}

export function slideSteps(src, index) {
  const s = slideNode(src, index);
  const concl = descendants(s, (x) => hasClass(x, 'concl')).length > 0;
  if (hasClass(s, 'static')) return { max: 0, isStatic: true, auto: false, concl };
  if (autoListOn(s)) return { max: autoItems(s).length, isStatic: false, auto: autoItems(s).length > 0, concl };
  let max = 0;
  for (const e of descendants(s, (x) => attrOf(x, 'data-step') || attrOf(x, 'data-from'))) {
    const v = Number((attrOf(e, 'data-step') || attrOf(e, 'data-from')).value);
    if (Number.isInteger(v) && v > max) max = v;
  }
  const ds = Number(attrOf(s, 'data-steps')?.value);
  if (Number.isInteger(ds) && ds > max) max = ds;
  return { max, isStatic: false, auto: false, concl };
}

// ---------------------------------------------------------------- 入れる塊
const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function imageHtml({ src, alt, placement, step }) {
  if (!PLACEMENTS.includes(placement)) throw new Error('unknown placement: ' + placement);
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]*={0,2}$/.test(String(src))) throw new Error('the image must be a base64 data: URL of PNG, JPEG, WebP or SVG');
  const st = step == null || step === 0 ? '' : ` data-step="${Number(step)}"`;
  if (st && !(Number.isInteger(Number(step)) && Number(step) > 0)) throw new Error('bad step: ' + step);
  const center = placement === 'half' || placement === 'third' ? ';margin:0 auto' : '';
  return `<div class="fig"${st}><img src="${src}" alt="${escAttr(alt == null ? '' : String(alt).replace(/\s+/g, ' ').trim())}" style="display:block;width:${WIDTH[placement]};height:auto${center}"></div>`;
}

// ---------------------------------------------------------------- 入れる
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
// off の前が行の頭からの空白だけなら、その行の頭。そうでなければ -1
function lineHead(src, off) {
  const h = src.lastIndexOf('\n', off - 1) + 1;
  return /^[ \t]*$/.test(src.slice(h, off)) ? h : -1;
}
const indentAt = (src, off) => { const h = src.lastIndexOf('\n', off - 1) + 1; return /^[ \t]*/.exec(src.slice(h))[0]; };
// 要素の終わりのタグの前に、子として html を入れる（終わりのタグが自分の行にあれば、その前の行として字下げを揃える）
function appendChild(src, node, html) {
  const L = node.sourceCodeLocation, e = L.endTag.startOffset, eol = eolOf(src);
  const pad = indentAt(src, L.startOffset) + '  ';
  const h = lineHead(src, e);
  if (h >= 0) return src.slice(0, h) + pad + html + eol + src.slice(h);
  return src.slice(0, e) + html + src.slice(e);
}
// 本文の直下の箇条の自動のステップを data-step に書き出す（autoList のときだけ。見え方は変わらない）
function materialize(src, index) {
  const s = slideNode(src, index);
  if (!autoListOn(s)) return src;
  const edits = autoItems(s).map((li, k) => {
    const t = li.sourceCodeLocation.startTag;
    let at = t.endOffset - 1; if (src[at - 1] === '/') at--;
    return [at, ` data-step="${k + 1}"`];
  });
  edits.sort((a, b) => b[0] - a[0]);
  for (const [at, t] of edits) src = src.slice(0, at) + t + src.slice(at);
  return src;
}

export function insertImage(src, index, opts) {
  const html = imageHtml(opts);
  const cols = opts.placement === 'left' || opts.placement === 'right';
  const stepped = !(opts.step == null || opts.step === 0);
  if (stepped && hasClass(slideNode(src, index), 'static')) throw Object.assign(new Error('a static slide has no steps'), { code: 'static' });
  if (stepped || cols) src = materialize(src, index);
  const s = slideNode(src, index), eol = eolOf(src);
  let body = kids(s).find((x) => hasClass(x, 'body'));
  if (!body) {
    // 本文がない：結論の行の前（なければ </section> の前）に本文を作る
    const pad = indentAt(src, s.sourceCodeLocation.startOffset) + '  ';
    const concl = kids(s).find((x) => hasClass(x, 'concl'));
    const inner = cols ? colsHtml(opts.placement, html, '', pad + '  ', eol) : `${pad}  ${html}`;
    const block = `${pad}<div class="body">${eol}${inner}${eol}${pad}</div>`;
    if (concl) { const at = concl.sourceCodeLocation.startOffset, h = lineHead(src, at); return h >= 0 ? src.slice(0, h) + block + eol + src.slice(h) : src.slice(0, at) + block.trimStart() + src.slice(at); }
    return appendChild(src, s, block.trimStart());
  }
  if (!cols) return appendChild(src, body, html);
  const wrap = kids(body).find((x) => hasClass(x, 'cols'));
  if (wrap) {
    const c = kids(wrap), k = opts.placement === 'left' ? 0 : 1, target = c[k];
    if (target && target.tagName === 'div' && target.sourceCodeLocation && target.sourceCodeLocation.endTag) return appendChild(src, target, html);
    // その列がない・パーツなどの要素：新しい列（<div>）として左なら先頭、右なら左の列の後ろに入れる
    const col = `<div>${html}</div>`;
    if (k === 0 || !c[0]) {
      const at = c[0] ? c[0].sourceCodeLocation.startOffset : wrap.sourceCodeLocation.startTag.endOffset;
      if (!c[0]) return appendChild(src, wrap, col);
      const h = lineHead(src, at), pad = indentAt(src, at);
      return h >= 0 ? src.slice(0, h) + pad + col + eol + src.slice(h) : src.slice(0, at) + col + src.slice(at);
    }
    const after = c[0].sourceCodeLocation.endOffset;
    return src.slice(0, after) + eol + indentAt(src, c[0].sourceCodeLocation.startOffset) + col + src.slice(after);
  }
  // 2 列にする：今の本文をもう一方の列へ
  const B = body.sourceCodeLocation, a = B.startTag.endOffset, b = B.endTag.startOffset;
  const pad = indentAt(src, B.startOffset) + '  ';
  let inner = src.slice(a, b).replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '');
  // 列の中へ動かす本文は 4 字下げる（空白に意味のある pre・textarea を含むときは字を変えない）
  if (!/<(pre|textarea)\b/i.test(inner)) inner = inner.split(/(\r?\n)/).map((x, k) => (k % 2 === 0 && x.trim() ? '    ' + x : x)).join('');
  const close = lineHead(src, b) >= 0 ? eol + indentAt(src, b) : eol + indentAt(src, B.startOffset);
  return src.slice(0, a) + eol + colsHtml(opts.placement, html, inner, pad, eol) + close + src.slice(b);
}
function colsHtml(placement, html, inner, pad, eol) {
  const img = `${pad}    ${html}`;
  const other = inner ? inner : '';
  const colOf = (x) => (x ? `${pad}  <div>${eol}${x}${eol}${pad}  </div>` : `${pad}  <div></div>`);
  const L = placement === 'left' ? img : other, R = placement === 'left' ? other : img;
  return `${pad}<div class="cols">${eol}${colOf(L)}${eol}${colOf(R)}${eol}${pad}</div>`;
}
