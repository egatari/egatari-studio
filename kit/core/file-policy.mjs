// ファイルの決まり（format spec §4.2 の file policy）：1 ファイル（.ega.html）が持つ Content-Security-Policy の <meta>。
// Node にもブラウザにも依存しない（node: の読み込みなし）。書き出し（kit/core/portable.mjs）・授業の部屋の派生（kit/core/live.mjs）・読み手の検査が使う
//
//   BASELINE                        基準の決まり（ディレクティブ → 源の配列）。外へは繋がらない（connect-src 'none'）
//   policyText(extra)               extra {connect: [源…], frame: [源…]}（宣言した拡張が足す行き先）を基準に足した文字列
//   policyMeta(text)                <meta http-equiv="Content-Security-Policy" content="…">
//   extensionSources(extensions)    索引の extensions（か deck-extensions）から、決まりに足す行き先 {connect, frame}：
//                                   live は endpoint の両方の形（https:/wss:）を connect-src に、embed は一覧の行き先（§3 の許す一覧にあるもの）を frame-src に
//   parsePolicy(text)               → {directives: Map(名前 → 源の配列), duplicates: [名前]}（名前は小文字、源は比べる形にそろえる）
//   policyDiff(actual, expected)    解析したディレクティブと源の集まりで比べる（順と空白は問わない）→ 違いの文字列の配列（[] なら同じ）
//   findPolicies(html)              文書の中の決まりの <meta>（http-equiv が Content-Security-Policy のもの）：[{content, start, end}]
//   placementProblems(html)         §4.2 の置き場所：ちょうど 1 つ。前に来てよいのは doctype・<html>・<head>・<meta charset> だけ（どれも on* なし）。
//                                   どの <script>・<style>・<link>・URL の属性（src href srcset poster data）・on* の属性よりも前
//   checkFilePolicy(html, extensions?) 置き場所と中身（基準と宣言した拡張だけ）→ 問題の文字列の配列（[] なら合う）。extensions を渡さなければ、
//                                   文書の実行系が宣言するもの（<script type="application/json" id="deck-extensions">。再生器が読むもの）
import { parse } from 'parse5';
import { LivePolicy } from './live-policy.mjs';
import { SCRIPTING } from './code-scan.mjs';

// 行き先を求めるだけ（つながるかは再生器が決める）：開発用のループバックの http: の部屋も、その endpoint だけを足したものとして比べる
const LP = LivePolicy({ allowLoopback: true });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const BASELINE = Object.freeze([
  ['default-src', ["'none'"]], ['script-src', ["'unsafe-inline'"]], ['style-src', ["'unsafe-inline'"]], ['img-src', ['data:', 'blob:']],
  ['font-src', ['data:']], ['media-src', ['data:', 'blob:']], ['connect-src', ["'none'"]], ['frame-src', ["'self'", 'file:']],
  ['worker-src', ["'none'"]], ['object-src', ["'none'"]], ['manifest-src', ["'none'"]], ['base-uri', ["'none'"]], ['form-action', ["'none'"]],
]);
// 拡張 embed（format spec の extensions/embed.md §3）の許す行き先（v1）。frame-src にはこの形のまま足す
export const EMBED_DESTINATIONS = Object.freeze(['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.google.com/maps/embed', 'https://www.openstreetmap.org/export/embed.html']);

const uniq = (a) => [...new Set(a)];
export function policyText(extra = {}) {
  const connect = uniq(extra.connect || []), frame = uniq(extra.frame || []);
  return BASELINE.map(([d, src]) => {
    let s = src;
    if (d === 'connect-src' && connect.length) s = connect;            // 'none' は源があれば外す（'none' と源は並べられない）
    if (d === 'frame-src' && frame.length) s = [...src, ...frame];
    return `${d} ${s.join(' ')}`;
  }).join('; ');
}
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const policyMeta = (text) => `<meta http-equiv="Content-Security-Policy" content="${escAttr(text)}">`;

// embed の項目の src が許す行き先か（origin が同じで、パスの前置があればそれで始まる）→ 足す行き先（一覧の形）か null
function embedDestination(src) {
  let u;
  try { u = new URL(String(src)); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  for (const d of EMBED_DESTINATIONS) {
    const x = new URL(d);
    if (u.origin !== x.origin) continue;
    if (x.pathname === '/' || u.pathname === x.pathname || u.pathname.startsWith(x.pathname.replace(/\/?$/, '/')) || u.pathname.startsWith(x.pathname + '?')) return d;
  }
  return null;
}
export function extensionSources(extensions) {
  const out = { connect: [], frame: [] };
  if (!isObj(extensions)) return out;
  const live = extensions.live;
  if (isObj(live) && typeof live.endpoint === 'string') {
    const cs = LP.connectSrc(live.endpoint);
    if (cs) out.connect.push(...cs.split(' '));
  }
  const embed = extensions.embed;
  if (isObj(embed) && isObj(embed.items)) {
    for (const k of Object.keys(embed.items).sort()) {
      const it = embed.items[k], d = isObj(it) ? embedDestination(it.src) : null;
      if (d) out.frame.push(d);
    }
  }
  out.connect = uniq(out.connect); out.frame = uniq(out.frame).sort();
  return out;
}

// 源をそろえる：キーワード（'none' など）・scheme（data:）・ホストは小文字、パスはそのまま
function normSource(s) {
  if (s.startsWith("'")) return s.toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:$/i.test(s)) return s.toLowerCase();
  const m = /^([a-z][a-z0-9+.-]*:\/\/)?([^/]*)(.*)$/i.exec(s);
  return m ? (m[1] || '').toLowerCase() + m[2].toLowerCase() + m[3] : s;
}
export function parsePolicy(text) {
  const directives = new Map(), duplicates = [];
  for (const part of String(text).split(';')) {
    const toks = part.trim().split(/[\t\n\f\r ]+/).filter(Boolean);
    if (!toks.length) continue;
    const name = toks[0].toLowerCase();
    // 同じ名前の 2 つ目以降はブラウザが無視する（CSP3 §2.2.1）：違いとして知らせる
    if (directives.has(name)) { duplicates.push(name); continue; }
    directives.set(name, uniq(toks.slice(1).map(normSource)).sort());
  }
  return { directives, duplicates };
}
export function policyDiff(actual, expected) {
  const a = parsePolicy(actual), e = parsePolicy(expected), out = [];
  for (const d of a.duplicates) out.push(`directive "${d}" appears more than once`);
  for (const [d, src] of e.directives) {
    if (!a.directives.has(d)) { out.push(`missing directive "${d}"`); continue; }
    const have = new Set(a.directives.get(d)), want = new Set(src);
    for (const s of have) if (!want.has(s)) out.push(`${d}: extra source ${s}`);
    for (const s of want) if (!have.has(s)) out.push(`${d}: missing source ${s}`);
  }
  for (const d of a.directives.keys()) if (!e.directives.has(d)) out.push(`extra directive "${d}"`);
  return out;
}

const URL_ATTRS = new Set(['src', 'href', 'srcset', 'poster', 'data']);
const isPolicyMeta = (n) => n.tagName === 'meta' && (n.attrs || []).some((a) => a.name === 'http-equiv' && a.value.trim().toLowerCase() === 'content-security-policy');
function walk(n, fn) {
  fn(n);
  for (const c of n.childNodes || []) walk(c, fn);
  if (n.content) walk(n.content, fn);
}
function parsed(html) { return parse(String(html), { sourceCodeLocationInfo: true, scriptingEnabled: SCRIPTING }); }
export function findPolicies(html, doc = parsed(html)) {
  const out = [];
  walk(doc, (n) => {
    if (!n.tagName || !isPolicyMeta(n)) return;
    const c = (n.attrs || []).find((a) => a.name === 'content');
    out.push({ content: c ? c.value : '', start: n.sourceCodeLocation ? n.sourceCodeLocation.startOffset : -1, end: n.sourceCodeLocation ? n.sourceCodeLocation.endOffset : -1, inHead: n.parentNode && n.parentNode.tagName === 'head' });
  });
  return out;
}
export function placementProblems(html, doc = parsed(html)) {
  const pol = findPolicies(html, doc);
  if (!pol.length) return ['no Content-Security-Policy <meta> (the file policy, §4.2)'];
  const out = [];
  if (pol.length > 1) out.push(`${pol.length} Content-Security-Policy <meta> elements (the file carries exactly one, §4.2)`);
  const at = pol[0].start;
  if (!pol[0].inHead) out.push('the Content-Security-Policy <meta> is not in <head>');
  walk(doc, (n) => {
    if (!n.tagName || !n.sourceCodeLocation) return;
    const start = n.sourceCodeLocation.startOffset;
    const attrs = n.attrs || [];
    const onAttr = attrs.find((a) => /^on/i.test(a.name));
    if (start >= at) {
      // 前に来る要素（<html>・<head>）の開始タグに付いた on* も前にある
      return;
    }
    const charsetMeta = n.tagName === 'meta' && attrs.some((a) => a.name === 'charset') && !isPolicyMeta(n);
    if (!['html', 'head'].includes(n.tagName) && !charsetMeta) out.push(`<${n.tagName}> comes before the Content-Security-Policy <meta>`);
    if (onAttr) out.push(`<${n.tagName} ${onAttr.name}> (an event handler) comes before the Content-Security-Policy <meta>`);
    const u = attrs.find((a) => URL_ATTRS.has(a.name));
    if (u) out.push(`<${n.tagName} ${u.name}> (a URL attribute) comes before the Content-Security-Policy <meta>`);
  });
  return out;
}
function deckExtensions(doc) {
  let out = null;
  walk(doc, (n) => {
    if (out !== null || n.tagName !== 'script' || !(n.attrs || []).some((a) => a.name === 'id' && a.value === 'deck-extensions')) return;
    const t = (n.childNodes || []).filter((c) => c.nodeName === '#text').map((c) => c.value).join('');
    try { out = JSON.parse(t); } catch { out = {}; }
  });
  return isObj(out) ? out : {};
}
export function checkFilePolicy(html, extensions) {
  const doc = parsed(html);
  if (extensions === undefined) extensions = deckExtensions(doc);
  const out = placementProblems(html, doc);
  const pol = findPolicies(html, doc);
  if (pol.length) for (const d of policyDiff(pol[0].content, policyText(extensionSources(extensions)))) out.push(`file policy differs from the baseline and the declared extensions: ${d}`);
  return out;
}
