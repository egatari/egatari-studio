// Egatari Studio（旧 motion-academic-slides）の実行系（deck.js）
// 約束事は docs/contract.md
// - 画面は (スライド i, 段階 k, 段階の開始からの秒数 t) だけで決まる。DECK.seek(i, k, t) が唯一の描画の入口
// - 手動の発表は実時間で seek を呼び、動画の書き出しは仮想の時刻で呼ぶ
// - 操作：→ / Space / PageDown で次の段階、← / PageUp で前の段階、Shift+→ / Shift+← でスライド単位、
//   Home / End、数字＋Enter でそのページ、f で全画面、p で発表者ビュー、a で自動再生、l で授業モード、b で暗転、s で字幕、Shift+s で字幕の大きさ
// - 読み上げソフト向け（動画では作らない）：隠れたスライドは aria-hidden と inert、今のスライドは role="group"、
//   位置と新しく出た段階の文字を aria-live の領域（#deck-live、画面には出ない）で知らせる
(function(){
"use strict";
var DECK = window.DECK = window.DECK || {};
var Q = new URLSearchParams(location.search);
var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches && Q.get("mode") !== "video";
var NS = "http://www.w3.org/2000/svg";
var T = DECK.T = {fade: .45, draw: .7, drawSlow: 1.4, drawDelay: .1, slide: .35, morph: .9, lead: .25, padAfter: .6, hold: 1.2};

DECK.mode = Q.get("mode") || document.documentElement.getAttribute("data-mode") || "talk";
// 画面に出す言葉の言語：<html lang> が ja か、lang が無ければ日本語。それ以外は英語
DECK.ja = /^ja\b/i.test(document.documentElement.lang || "ja");
DECK.view = Q.get("view") || "";   // "", "follow"（発表者ビューの中の現在の画面）, "next"（次の画面）

// ---------------------------------------------------------------- 時間の部品
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function ease(x){ x = clamp01(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
// t 秒のときの、start から dur 秒かける動きの進み具合（0〜1、イージング付き）
function prog(t, start, dur){ if (t === Infinity) return 1; if (dur <= 0) return t >= start ? 1 : 0; return ease((t - start) / dur); }
function lerp(a, b, e){ return a + (b - a) * e; }
DECK.ease = ease; DECK.prog = prog; DECK.lerp = lerp; DECK.clamp01 = clamp01;
// 段階の番号（data-step / steps / data-steps / data-from）：有限の整数で min 以上。そうでなければ警告して null
function stepInt(v, what, min){
  if (v === null || v === undefined) return null;
  var n = typeof v === "number" ? v : String(v).trim() === "" ? NaN : +v;
  if (!isFinite(n) || n !== Math.floor(n) || n < (min || 0)){ console.warn("deck.js: " + what + "=" + JSON.stringify(v) + " は 0 以上の整数でないので無視 / ignored (not a non-negative integer)"); return null; }
  return n;
}
// 時間の上書き（dur / hold / lead / pad_after）：有限で 0 以上。そうでなければ警告して undefined
function secOk(v, what){
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !isFinite(v) || v < 0){ console.warn("deck.js: " + what + "=" + JSON.stringify(v) + " は 0 以上の秒数でないので無視 / ignored"); return undefined; }
  return v;
}

// ---------------------------------------------------------------- SVG の部品
// 色は CSS 変数で書けるように、fill / stroke / color に var( があれば style に回す（属性では var() が効かない）
function el(tag, attrs, parent){
  var e = document.createElementNS(NS, tag), st = "";
  for (var k in attrs){
    var v = attrs[k];
    if ((k === "fill" || k === "stroke" || k === "color" || k === "stop-color") && String(v).indexOf("var(") >= 0) st += k + ":" + v + ";";
    else e.setAttribute(k, v);
  }
  if (st) e.setAttribute("style", st + (attrs.style || ""));
  if (parent) parent.appendChild(e);
  return e;
}
// SVG の中の簡単な数式記法：*..* は斜体、_x は下付き、^x は上付き。本格的な式は DECK.svgMath を使う
function mtext(parent, x, y, str, attrs){
  var t = el("text", Object.assign({x: x, y: y, "font-size": 24}, attrs || {}), parent);
  var it = false, i = 0, buf = "";
  function flush(extra){
    if (!buf) return;
    var s = el("tspan", extra || {}, t);
    if (it){ s.setAttribute("font-style", "italic"); s.setAttribute("class", "mi"); }
    s.textContent = buf; buf = "";
  }
  while (i < str.length){
    var c = str[i];
    if (c === "*"){ flush(); it = !it; i++; }
    else if ((c === "_" || c === "^") && i + 1 < str.length){
      flush(); buf = str[i + 1];
      flush({"baseline-shift": c === "_" ? "sub" : "super", "font-size": "17"});
      i += 2;
    } else { buf += c; i++; }
  }
  flush();
  return t;
}
// SVG の中に KaTeX の式を置く（foreignObject）。本文の式と同じ字形になる
// o = {size: 24, anchor: "start"|"middle"|"end", color: "var(--fg)", w: 400, h: 60}
function svgMath(parent, x, y, tex, o){
  o = o || {};
  var w = o.w || 600, h = o.h || 80, size = o.size || 24;
  var fo = el("foreignObject", {x: 0, y: 0, width: w, height: h, class: "smath"}, parent);
  var div = document.createElement("div");
  div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  div.style.cssText = "display:inline-block;vertical-align:top;white-space:nowrap;line-height:1;font-size:" + size + "px;color:" + (o.color || "var(--fg)");
  if (window.katex) window.katex.render(tex, div, {throwOnError: false, strict: "ignore", output: "html", macros: Object.assign({}, window.katex.__macros || {})});
  else div.textContent = tex;
  fo.appendChild(div);
  // 位置合わせ：x は anchor の位置、y はベースライン
  var bw = div.offsetWidth || 0, base = size * 0.78;
  var dx = o.anchor === "middle" ? -bw / 2 : o.anchor === "end" ? -bw : 0;
  fo.setAttribute("x", x + dx); fo.setAttribute("y", y - base);
  fo.setAttribute("width", Math.max(bw + 4, 1));
  return fo;
}
// 座標軸つきの図（キットの Plot。色はテーマの変数）
// o = {xr:[min,max], yr:[min,max], xt:[目盛り], yt:[目盛り], xf:小数桁, yf:小数桁, xl:"横軸名", xl2:"横軸の補足", yl:"縦軸名", noY:true, m:{l,r,t,b}}
function Plot(box, o){
  if (typeof box === "string") box = document.getElementById(box);
  var W = box.clientWidth, H = box.clientHeight, m = o.m || {l: 86, r: 20, t: 16, b: 64};
  var svg = el("svg", {viewBox: "0 0 " + W + " " + H, class: "plotsvg"}, box);
  var p = {svg: svg, W: W, H: H, m: m,
    x: function(v){ return m.l + (v - o.xr[0]) / (o.xr[1] - o.xr[0]) * (W - m.l - m.r); },
    y: function(v){ return H - m.b - (v - o.yr[0]) / (o.yr[1] - o.yr[0]) * (H - m.t - m.b); }};
  var cid = "clip" + (++Plot.n);
  var cp = el("clipPath", {id: cid}, el("defs", {}, svg));
  el("rect", {x: m.l, y: m.t - 4, width: W - m.l - m.r, height: H - m.t - m.b + 4}, cp);
  p.clip = "url(#" + cid + ")";
  var ax = el("g", {class: "axes"}, svg);
  var K = "var(--fg)";
  el("line", {x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, stroke: K, "stroke-width": 1.5}, ax);
  if (!o.noY) el("line", {x1: m.l, y1: m.t, x2: m.l, y2: H - m.b, stroke: K, "stroke-width": 1.5}, ax);
  var fmt = function(v, f){ return (f !== undefined ? v.toFixed(f) : String(v)).replace("-", "−"); };
  (o.xt || []).forEach(function(v){
    el("line", {x1: p.x(v), y1: H - m.b, x2: p.x(v), y2: H - m.b + 6, stroke: K, "stroke-width": 1.5}, ax);
    mtext(ax, p.x(v), H - m.b + 30, fmt(v, o.xf), {"text-anchor": "middle"});
  });
  (o.yt || []).forEach(function(v){
    el("line", {x1: m.l - 6, y1: p.y(v), x2: m.l, y2: p.y(v), stroke: K, "stroke-width": 1.5}, ax);
    mtext(ax, m.l - 10, p.y(v) + 8, fmt(v, o.yf), {"text-anchor": "end"});
  });
  if (o.xl) mtext(ax, (m.l + W - m.r) / 2, H - (o.xl2 ? 38 : 6), o.xl, {"text-anchor": "middle"});
  if (o.xl2) mtext(ax, (m.l + W - m.r) / 2, H - 6, o.xl2, {"text-anchor": "middle", fill: "var(--muted)"});
  if (o.yl) mtext(ax, 22, (m.t + H - m.b) / 2, o.yl, {"text-anchor": "middle", transform: "rotate(-90 22 " + (m.t + H - m.b) / 2 + ")"});
  // 関数 f を [a,b] で n 分割した折れ線の d 属性
  p.d = function(f, a, b, n){
    var s = "";
    for (var i = 0; i <= n; i++){ var v = a + (b - a) * i / n; s += (i ? "L" : "M") + p.x(v).toFixed(1) + "," + p.y(f(v)).toFixed(1); }
    return s;
  };
  // 点列 [[x,y],…] の折れ線
  p.poly = function(pts){ return pts.map(function(q, i){ return (i ? "L" : "M") + p.x(q[0]).toFixed(1) + "," + p.y(q[1]).toFixed(1); }).join(""); };
  return p;
}
Plot.n = 0;
DECK.el = el; DECK.mtext = mtext; DECK.svgMath = svgMath; DECK.Plot = Plot;
DECK.color = function(name){ return getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim(); };

// ---------------------------------------------------------------- 部品の基底クラス
class MotionElement extends HTMLElement {
  get steps(){ var a = stepInt(this.getAttribute("steps"), this.tagName.toLowerCase() + " steps"); return a !== null ? a : (this.constructor.steps || 1); }
  get from(){ var a = stepInt(this.getAttribute("data-from"), this.tagName.toLowerCase() + " data-from", 1); return a !== null ? a : 1; }
  // static props の宣言に従って属性を読む
  get props(){
    if (this._props) return this._props;
    var decl = this.constructor.props || {}, out = {};
    for (var name in decl){
      var d = decl[name], a = this.getAttribute(name);
      if (a === null){ out[name] = d.default; continue; }
      out[name] = d.type === "number" ? +a : d.type === "bool" ? a !== "false" : d.type === "json" ? JSON.parse(a) : a;
    }
    return (this._props = out);
  }
  // 子の <script type="application/json"> の中身。選び方は kit/core/code-scan.mjs の isDataBlock と同じ（type の前後の空白を除いて
  // 大文字小文字を区別せずに application/json、id によらない）。子に 2 つ以上あれば、どれを使うか決められないので使わない（null）。
  // 「コードを動かせるか」の判定（code-scan.mjs）は同じ規則で同じものを選び、2 つ以上なら判定できない（コードとみなす）
  get data(){
    if (this._data !== undefined) return this._data;
    var c = [].filter.call(this.children, function(x){ return x.localName === "script" && String(x.getAttribute("type") || "").trim().toLowerCase() === "application/json"; });
    if (c.length > 1) console.warn("[deck] " + this.tagName.toLowerCase() + ": more than one <script type=\"application/json\"> child (ignored)");
    return (this._data = c.length === 1 ? JSON.parse(c[0].textContent) : null);
  }
  mount(ctx){}
  render(k, t, ctx){}
  duration(k){ return 0; }
  cues(k){ return null; }
}
DECK.MotionElement = MotionElement;

// ---------------------------------------------------------------- 部品のデータの形（static shape。確かめるのは kit/shape.js の DECK.shape）
// 段階を数える前に確かめ、違えば（または mount・render が例外を出したら）部品を描かず、その場に知らせの札を出す（ほかのスライドは動く）。
// 知らせは DECK.componentErrors に積む（品質チェック（コマンド版・ブラウザ版）が読む）：
//   {slide, key, id, tag, label, index, phase: data | steps | mount | render, kind, …}
//   kind：shape（path・why・expected・got）、missing（JSON がない）、json（JSON が読めない。msg）、attr・attrJson（属性 attr の値）、
//         notText・empty（字で書く部品）、notLinks・noLinks（<a href> で書く部品）、exception（msg、dataLike：データの形が違うときによく出る言葉か）
//   shape・example：部品の宣言した形と見本（あれば）
DECK.componentErrors = [];
function compText(c){
  var t = "";
  [].forEach.call(c.childNodes, function(n){ if (!(n.nodeType === 1 && n.localName === "script")) t += n.textContent; });
  return t.trim();
}
function compProblem(c){
  var C = c.constructor, decl = C.props || {}, sh = C.shape, SH = DECK.shape;
  for (var name in decl){
    var d = decl[name], a = c.getAttribute(name);
    if (d.type !== "json" || a === null) continue;
    var v;
    try { v = JSON.parse(a); } catch (e) { return {kind: "attrJson", attr: name, msg: String(e && e.message || e), example: JSON.stringify(d.default)}; }
    var ea = d.shape && SH ? SH.check(d.shape, v) : null;
    if (ea) return Object.assign({kind: "attr", attr: name, example: JSON.stringify(d.example !== undefined ? d.example : d.default)}, ea);
  }
  var data;
  try { data = c.data; } catch (e) { return {kind: "json", msg: String(e && e.message || e)}; }
  if (!sh || !SH) return null;
  if (sh.text){ if (data !== null) return {kind: "notText"}; if (!compText(c)) return {kind: "empty"}; return null; }
  if (sh.links){ if (data !== null) return {kind: "notLinks"}; if (!c.querySelector("a[href]")) return {kind: "noLinks"}; return null; }
  if (sh.schema){
    if (data === null) return {kind: "missing"};
    var e2 = SH.check(sh.schema, data);
    if (e2 && e2.path === "" && e2.why === "type" && SH.typeOf(data) === "object" && [].concat(sh.schema.type)[0] === "array"){
      // 配列のはずが object：よくある書き方（{"series": [...], "xr": [...]}）なら、どれが属性で、どの配列が中身かを言う
      var ks = Object.keys(data);
      e2.keys = ks;
      e2.attrKeys = ks.filter(function(k){ return Object.prototype.hasOwnProperty.call(decl, k); });
      // 中身らしい配列：object の並び（{"series": [{…}]}）を先に、なければ属性でない配列
      var arr = ks.filter(function(k){ return Array.isArray(data[k]); });
      e2.arrayKey = arr.filter(function(k){ return SH.typeOf(data[k][0]) === "object"; })[0] || arr.filter(function(k){ return e2.attrKeys.indexOf(k) < 0; })[0] || null;
      var it = e2.arrayKey && data[e2.arrayKey][0];
      if (it && SH.typeOf(it) === "object" && sh.schema.items){ var ei = SH.check(sh.schema.items, it, "[0]"); if (ei) e2.inner = ei; }
    }
    if (e2) return Object.assign({kind: "shape"}, e2);
  }
  return null;
}
function errText(e){ return e && e.message !== undefined ? (e.name && e.name !== "Error" ? e.name + ": " : "") + e.message : String(e); }
function compFail(c, s, i, p, phase){
  if (c._bad) return;
  var tag = c.tagName.toLowerCase(), sh = c.constructor.shape || {}, SH = DECK.shape;
  var rec = Object.assign({slide: i, key: s._key || s.getAttribute("data-key") || s.id || ("s" + (i + 1)), id: s.id || null, tag: tag,
    label: c.getAttribute("aria-label") || "", index: [].indexOf.call(s.querySelectorAll(tag), c), phase: phase}, p);
  if (rec.kind === "exception") rec.dataLike = !!(SH && SH.dataLike(rec.msg));
  if (sh.schema && SH && rec.shape === undefined) rec.shape = SH.brief(sh.schema);
  if (sh.example !== undefined && rec.example === undefined) rec.example = typeof sh.example === "string" ? sh.example : JSON.stringify(sh.example);
  c._bad = rec;
  DECK.componentErrors.push(rec);
  console.warn("[deck] " + tag + " (" + (s.id || rec.key) + "): " + compSummary(rec, false));
  // 描かない：段階は属性 steps（なければ 0）、mount は札を出すだけ、render・duration・cues は何もしない
  var n = stepInt(c.getAttribute("steps"), tag + " steps");
  Object.defineProperty(c, "steps", {value: n !== null ? n : 0, configurable: true});
  c.mount = function(){ compPlaceholder(c, rec); };
  c.render = function(){}; c.duration = function(){ return 0; }; c.cues = function(){ return null; };
}
// 札の 1 行（実行系の言葉。くわしい知らせは品質チェックの言葉 kit/check-messages.mjs の compData）
function compSummary(r, ja){
  var at = r.path ? r.path : (ja ? "データ" : "data");
  switch (r.kind){
    case "shape": return r.why === "required" ? (ja ? at + " がない（" + r.expected + "）" : at + " is missing (" + r.expected + ")")
      : r.why === "unknown" ? (ja ? "知らない欄 " + r.key : "unknown field " + r.key)
      : r.why === "anyOf" ? (ja ? (r.path || "データ") + " に " + r.expected + " がない" : (r.path || "data") + " needs " + r.expected)
      : (ja ? at + "：" + r.expected + " のはずが " + r.got : at + ": expected " + r.expected + ", got " + r.got);
    case "missing": return ja ? "データ（子の <script type=\"application/json\">）がない" : "no data (child <script type=\"application/json\">)";
    case "json": return (ja ? "データの JSON が読めない：" : "the data is not valid JSON: ") + r.msg;
    case "attrJson": return (ja ? "属性 " + r.attr + " の JSON が読めない：" : "attribute " + r.attr + " is not valid JSON: ") + r.msg;
    case "attr": return (ja ? "属性 " + r.attr + (r.path ? " の " + r.path : "") + "：" + r.expected + " のはずが " + r.got : "attribute " + r.attr + (r.path ? " at " + r.path : "") + ": expected " + r.expected + ", got " + r.got);
    case "notText": return ja ? "JSON ではなく要素の中の字で書く" : "write it as text inside the element, not JSON";
    case "empty": return ja ? "中身の字がない" : "no text inside";
    case "notLinks": return ja ? "JSON ではなく子の <a href> で書く" : "write it as child <a href> links, not JSON";
    case "noLinks": return ja ? "子の <a href> がない" : "no child <a href> links";
    default: return (ja ? "描けない：" : "cannot draw: ") + r.msg;
  }
}
function compPlaceholder(c, r){
  [].slice.call(c.childNodes).forEach(function(n){ if (!(n.nodeType === 1 && n.localName === "script")) c.removeChild(n); });
  var box = document.createElement("div");
  box.className = "m-error"; box.setAttribute("role", "note");
  box.textContent = "<" + r.tag + "> " + (DECK.ja ? "のデータの形が違う：" : "data problem: ") + compSummary(r, DECK.ja);
  c.appendChild(box);
}

// キットの形式（<section data-anim="名前">、DECK.ANIM.名前 = function(slide, k, instant)）の互換。
// 実時間の補間に頼るので、動画の書き出しでは段階ごとの最終状態になる。新しい図は部品で書く
var ANIM = DECK.ANIM = DECK.ANIM || {};
DECK.tween = function(slide, ms, f){
  var tok = slide._tok;
  return new Promise(function(res){
    if (REDUCE || ms <= 0 || DECK.mode === "video"){ f(1); res(); return; }
    var t0 = performance.now();
    (function loop(now){
      if (slide._tok !== tok){ res(); return; }
      var t = Math.min(1, (now - t0) / ms); f(ease(t));
      if (t < 1) requestAnimationFrame(loop); else res();
    })(t0);
  });
};
DECK.wait = function(slide, ms){ var tok = slide._tok; return new Promise(function(r){ setTimeout(function(){ r(slide._tok === tok); }, REDUCE || DECK.mode === "video" ? 0 : ms); }); };
DECK.COL = {red: "var(--emph)", blue: "var(--term)", k: "var(--fg)", gray: "var(--line)", gtxt: "var(--muted)"};
function legacy(s, k, instant){
  var a = s.getAttribute("data-anim");
  if (!a || !ANIM[a]) return;
  if (s._legacyAt === k) return;
  s._legacyAt = k;
  try { ANIM[a](s, k, instant); } catch (e) { console.error(a, e); }
}
DECK.define = function(name, cls){ if (!customElements.get(name)) customElements.define(name, cls); };

// ---------------------------------------------------------------- 外から渡されるデータ（build が埋め込む）
function json(id){ var s = document.getElementById(id); try { return s ? JSON.parse(s.textContent) : null; } catch (e) { console.error(id, e); return null; } }
// 鍵（スライドの鍵・段階の鍵）で引く表は原型のない object にする（鍵が __proto__ や constructor でも取り違えない）
function dict(o){ var d = Object.create(null); if (o && typeof o === "object") for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) d[k] = o[k]; return d; }
DECK.NARRATION = dict(json("deck-narration"));   // {slideKey: {stepKey: [{role, text}]}}
for (var narrKey in DECK.NARRATION) DECK.NARRATION[narrKey] = dict(DECK.NARRATION[narrKey]);
DECK.AUDIO = dict(json("deck-audio"));           // {"slideKey:stepKey": {src, dur, cues:[秒…]}}
DECK.MARKS = dict(json("deck-marks"));           // {"slideKey:stepKey": [{type:"cue"} | {type:"mark", id, effect, hold} | {type:"clear"}]}
DECK.TIMING = dict(json("deck-timing"));         // {"slideKey:stepKey": {dur, hold, lead, pad_after}}
// deck-meta：持ち運べる形式の書き出しでは {format:<形式の名前>, version:{major,minor}, generator:{name, version}, docId, …}、
// ふつうの build では {version:"0.2.1"}。DECK.VERSION は作った版（package.json の version）
DECK.META = json("deck-meta") || {};
DECK.VERSION = (DECK.META.generator && DECK.META.generator.version) || (typeof DECK.META.version === "string" ? DECK.META.version : "");
// 持ち運べる形式の音声の参照（<scheme><blobId>）を data: URI にする：塊 <prefix><blobId>-0, -1, … を、次が無くなるまで順に復号してつなぐ
// （format spec §3.7・§4。形式の識別子は build が DECK.FORMAT に入れる（kit/core/format.mjs）。塊の境が 3 バイトの倍数（= を含まない）なら base64 の文字列をそのままつなげる）
var FMT = DECK.FORMAT || null;
function blobUri(id, known){
  if (!FMT) return null;
  var parts = [], n = 0, el, pad = false, P = FMT.blobPrefix + id + "-";
  while ((el = document.getElementById(P + n))){ var t = (el.textContent || "").trim(); if (t.indexOf("=") >= 0 && document.getElementById(P + (n + 1))) pad = true; parts.push(t); n++; }
  if (!n) return null;
  var b64 = pad ? btoa(parts.map(function(t){ return atob(t); }).join("")) : parts.join("");
  // deck-audio の mime があればそれを使い、なければ中身の先頭から推し量る
  if (typeof known === "string" && /^audio\/[a-z0-9.+-]+$/.test(known)) return "data:" + known + ";base64," + b64;
  var head = atob(b64.slice(0, 16)), mime = "audio/mpeg";
  if (head.slice(0, 4) === "RIFF") mime = "audio/wav";
  else if (head.slice(4, 8) === "ftyp") mime = "audio/mp4";
  else if (head.slice(0, 4) === "OggS") mime = "audio/ogg";
  return "data:" + mime + ";base64," + b64;
}
DECK.blobUri = blobUri;
for (var audioKey in DECK.AUDIO){
  var au = DECK.AUDIO[audioKey], am = FMT && au && typeof au.src === "string" && au.src.indexOf(FMT.uriScheme) === 0 && au.src.slice(FMT.uriScheme.length);
  if (am && /^[A-Za-z0-9_]{1,32}$/.test(am)){ var uri = null; try { uri = blobUri(am, au.mime); } catch (e) { console.warn("audio blob is not base64: " + am); } if (uri) au.src = uri; else { console.warn("audio blob not found: " + am); delete DECK.AUDIO[audioKey]; } }
}
// 音声の作り方（format spec §5.2 の kind：tts・recorded・imported）。まず deck-audio の kind（build がどの出力にも写す。再生専用の派生は索引を持たない）、
// なければ索引の音声の記録の kind（古い 1 ファイル。索引の data-sha256 を確かめてから読み、DECK.AUDIO_KIND に入れて deck:aiaudio を知らせる）。
// dry-run の無音は何も示さない。§7.3：合成した声（tts）は操作の帯の小さな札「AI 音声」・キーの一覧・発表者ビューで、
// 作り方の記録がない音声（imported）はキーの一覧と発表者ビューだけで示す（舞台と字幕には何も出さない）
var KINDS = {tts: 1, recorded: 1, imported: 1};
DECK.AUDIO_KIND = dict(null);
DECK.AI_AUDIO = dict(null);
DECK.audioKind = function(key){
  var a = DECK.AUDIO[key];
  if (!a) return null;
  if (typeof a.kind === "string" && KINDS[a.kind] === 1) return a.kind;
  return DECK.AUDIO_KIND[key] || null;
};
DECK.aiVoice = function(key){ return DECK.audioKind(key) === "tts"; };
DECK.unknownVoice = function(key){ return DECK.audioKind(key) === "imported"; };
DECK.hasAiVoice = function(){ for (var k in DECK.AUDIO) if (DECK.aiVoice(k)) return true; return false; };
DECK.hasUnknownVoice = function(){ for (var k in DECK.AUDIO) if (DECK.unknownVoice(k)) return true; return false; };
(function(){
  var el = FMT && FMT.indexId && document.getElementById(FMT.indexId);
  if (!el || el.tagName !== "SCRIPT") return;
  var t = el.textContent || "", want = (el.getAttribute("data-sha256") || "").trim();
  if (t.indexOf('"audio"') < 0) return;
  function read(){
    var ix; try { ix = JSON.parse(t); } catch (e) { return; }
    var au = ix && typeof ix.audio === "object" && ix.audio ? ix.audio : null, n = 0;
    if (!au) return;
    for (var k in au){
      if (!Object.prototype.hasOwnProperty.call(au, k) || !DECK.AUDIO[k] || !au[k] || KINDS[au[k].kind] !== 1) continue;
      if (au[k].recipe && au[k].recipe.engine === "dry-run") continue;
      DECK.AUDIO_KIND[k] = au[k].kind;
      if (DECK.audioKind(k) === "tts") DECK.AI_AUDIO[k] = true;
      if (DECK.audioKind(k) !== "recorded") n++;
    }
    if (n) document.dispatchEvent(new CustomEvent("deck:aiaudio", {detail: {n: n}}));
  }
  // 確かめられない環境（安全でない http: など。crypto.subtle がない）では確かめずに読む：印は多めに出る方へ倒す（出し忘れるより良い）
  if (!window.crypto || !crypto.subtle || typeof TextEncoder === "undefined"){ setTimeout(read, 0); return; }
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function(d){
    var u = new Uint8Array(d), hx = ""; for (var i = 0; i < u.length; i++) hx += (u[i] < 16 ? "0" : "") + u[i].toString(16);
    if (hx === want) read();
  }).catch(function(){});
})();
// スクリプトなしで読める層（format spec §2.1。全段階の口述原稿の文字）は、実行系が動くときは隠す
(function(){ var r = FMT && document.getElementById(FMT.readableId); if (r) r.hidden = true; })();

// ---------------------------------------------------------------- フィードバックの宛先（? の一覧と発表者ビューのリンク）
// <html data-feedback-url="…"> で宛先を変え、data-feedback="off" で消す（DECK.FEEDBACK_URL = null）
// 付けるのは版・ブラウザ・OS・言語・モードだけ。デッキの中身は送らない
DECK.FEEDBACK_URL = (function(){
  var h = document.documentElement;
  if (/^(off|false|no|0)$/i.test(h.getAttribute("data-feedback") || "")) return null;
  return h.getAttribute("data-feedback-url") || "https://github.com/egatari/egatari-studio/issues/new";
})();
function shortUA(){
  var u = navigator.userAgent || "", m;
  if ((m = u.match(/Edg\/(\d+)/))) return "Edge " + m[1];
  if ((m = u.match(/Firefox\/(\d+)/))) return "Firefox " + m[1];
  if ((m = u.match(/(?:Chrome|CriOS)\/(\d+)/))) return (/HeadlessChrome/.test(u) ? "HeadlessChrome " : "Chrome ") + m[1];
  if ((m = u.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) return "Safari " + m[1];
  return u.slice(0, 60);
}
function shortOS(){
  var u = navigator.userAgent || "";
  return /Windows/.test(u) ? "Windows" : /iPhone|iPad/.test(u) ? "iOS" : /Mac OS X|Macintosh/.test(u) ? "macOS" : /Android/.test(u) ? "Android" : /Linux/.test(u) ? "Linux" : "";
}
// 送り先の URL（GitHub の issue form なら feedback.yml を選び、欄に値を入れる）。無効なら null
DECK.feedbackUrl = function(){
  if (!DECK.FEEDBACK_URL) return null;
  var u;
  try { u = new URL(DECK.FEEDBACK_URL, location.href); } catch (e) { return null; }
  if (/\/issues\/new\/?$/.test(u.pathname) && !u.searchParams.has("template")) u.searchParams.set("template", "feedback.yml");
  var v = {version: DECK.VERSION, browser: shortUA(), os: shortOS(),
    context: "lang=" + (document.documentElement.lang || "ja") + ", mode=" + DECK.mode + (Q.get("presenter") ? ", presenter" : "")};
  for (var k in v) if (v[k] && !u.searchParams.has(k)) u.searchParams.set(k, v[k]);
  return u.href;
};

// ---------------------------------------------------------------- 段階表示
// 位置と再生の状態（i, k、知らせる t、再生中か、位置が変わったわけ cause：control・link・seek・play、リンクの「戻る」の跡）は
// PositionStore（kit/core/position.mjs。build が DECK.PositionStore として前に入れる）が持つ。舞台は描いた位置を書き、知らせは購読者が送る
if (typeof DECK.PositionStore !== "function") throw new Error("deck.js: DECK.PositionStore がない（kit/core/position.mjs を先に読み込む） / missing DECK.PositionStore (load kit/core/position.mjs first)");
var POS = DECK.PositionStore();
var slides = [], fadeFrom = -1, raf = 0, t0 = 0, auto = null, lastPos = null;

function setupSlide(s, i, mainEnd){
  var autoList = !s.classList.contains("static") && !s.classList.contains("nostep") && !s.querySelector("[data-step]") && !s.querySelector("[data-from]");
  if (autoList) [].slice.call(s.querySelectorAll(".body > ul > li, .body > ol > li")).forEach(function(li, k){ li.setAttribute("data-step", k + 1); });
  var items = [].slice.call(s.querySelectorAll("[data-step]")).filter(function(e){
    var n = stepInt(e.getAttribute("data-step"), "data-step（" + (s.id || "s" + (i + 1)) + "）");
    if (n === null) e.removeAttribute("data-step");   // 段階表示の外に出す（常に見える）
    return n !== null;
  });
  var comps = [].slice.call(s.querySelectorAll("*")).filter(function(e){ return e instanceof MotionElement; });
  // データの形を先に確かめる（段階の数はデータから決まる部品が多い）。違えば描かない
  comps.forEach(function(c){
    var p = compProblem(c);
    if (p){ compFail(c, s, i, p, "data"); return; }
    try { var n = c.steps; if (typeof n !== "number" || !isFinite(n)) throw new TypeError("steps is " + n); }
    catch (e) { compFail(c, s, i, {kind: "exception", msg: errText(e)}, "steps"); }
  });
  var max = 0;
  items.forEach(function(e){ max = Math.max(max, +e.getAttribute("data-step")); });
  comps.forEach(function(c){ max = Math.max(max, c.from + c.steps - 1); });
  max = Math.max(max, stepInt(s.getAttribute("data-steps"), "data-steps（" + (s.id || "s" + (i + 1)) + "）") || 0);   // キットの形式（data-anim）の互換
  var c = s.querySelector(".concl");
  if (s.classList.contains("static")){ max = 0; }
  else if (c){ max += 1; c.setAttribute("data-step", max); c.setAttribute("data-concl", ""); items.push(c); }
  s._tok = 0;
  s._max = max; s._items = items; s._comps = comps; s._cstep = c && !s.classList.contains("static") ? max : -1;
  s._key = s.getAttribute("data-key") || s.id || ("s" + (i + 1));
  s._morph = s.hasAttribute("data-morph") ? s.getAttribute("data-morph") : null;   // "" なら前のスライドから
  // 線を描く要素（.draw）は、それを含む段階の要素に紐づける
  s._draws = [].slice.call(s.querySelectorAll(".draw")).map(function(d){
    var host = d.closest("[data-step]");
    return {el: d, step: host && s.contains(host) ? +host.getAttribute("data-step") : (d.hasAttribute("data-step") ? +d.getAttribute("data-step") : 0),
            dur: d.classList.contains("drawslow") ? T.drawSlow : T.draw, at: +(d.getAttribute("data-at") || 0)};
  });
  if (i > 0 && !s.querySelector(":scope > .pn")){
    var pn = document.createElement("div"); pn.className = "pn";
    pn.textContent = (i < mainEnd) ? (i + 1) + "/" + mainEnd : (DECK.ja ? "付録" : "Appendix");
    s.appendChild(pn);
  }
}

function stepKey(s, k){ return k === s._cstep ? "concl" : String(k); }
DECK.stepKey = function(i, k){ return slides[i]._key + ":" + stepKey(slides[i], k); };

// 部品の段階と時刻。音声の cue と部品の cues が両方あれば、部品の時刻を区分線形に伸縮する
function compPos(c, K, t, audioCues){
  var k = Math.max(0, Math.min(c.steps, K - c.from + 1));
  var inRange = K - c.from + 1 === k && k >= 1;
  if (!inRange) return {k: k, t: Infinity};
  var cc = c.cues(k);
  if (t !== Infinity && cc && audioCues && cc.length && cc.length === audioCues.length){
    var src = [0].concat(audioCues), dst = [0].concat(cc), j = src.length - 1;
    while (j > 0 && t < src[j]) j--;
    var tc = j < src.length - 1 ? lerp(dst[j], dst[j + 1], (t - src[j]) / Math.max(1e-6, src[j + 1] - src[j])) : dst[j] + (t - src[j]);
    return {k: k, t: tc};
  }
  return {k: k, t: t};
}

// compPos の逆：部品の時刻 D になる実時間。伸縮しない（cue の数が合わない）ときは D のまま
function compRealTime(c, k, D, audioCues){
  var cc = c.cues(k);
  if (!(cc && audioCues && cc.length && cc.length === audioCues.length)) return D;
  var src = [0].concat(audioCues), dst = [0].concat(cc), n = src.length - 1;
  for (var j = 0; j < n; j++){
    if (D <= dst[j + 1]){
      var span = dst[j + 1] - dst[j];
      return span > 1e-9 ? src[j] + (D - dst[j]) * (src[j + 1] - src[j]) / span : src[j + 1];
    }
  }
  return src[n] + (D - dst[n]);
}

// 段階 k の動きの長さ（秒、実時間）。部品の時刻が音声の cue で伸縮されるなら、その伸縮後の終わり
function animDur(i, k){
  var s = slides[i], d = 0;
  if (REDUCE) return 0;
  if (k === 0 && i > 0) d = morphSrc(i) === i - 1 ? T.morph : T.slide;
  s._items.forEach(function(e){ if (+e.getAttribute("data-step") === k) d = Math.max(d, +(e.getAttribute("data-at") || 0) + T.fade); });
  s._draws.forEach(function(w){ if (w.step === k) d = Math.max(d, w.at + T.drawDelay + w.dur); });
  var ac = null;
  if (s._comps.length){
    ac = compCues(i, k);
    if (ac){ var lead = timing(i, k).lead || 0; ac = ac.map(function(x){ return x + lead; }); }
  }
  s._comps.forEach(function(c){
    var p = compPos(c, k, 0);
    if (p.t === Infinity) return;
    var D = c.duration(p.k) || 0;
    d = Math.max(d, D > 0 ? compRealTime(c, p.k, D, ac) : 0);
  });
  return d;
}

// (i, k, t) の画面を描く。唯一の描画の入口
function seek(i, k, t, from){
  i = Math.max(0, Math.min(slides.length - 1, i));
  var s = slides[i];
  k = Math.max(0, Math.min(s._max, k));
  if (REDUCE && t !== Infinity) t = Infinity;
  var mode = DECK.mode, lecture = mode === "lecture";
  var entering = k === 0 && from !== undefined && from >= 0 && from !== i && t !== Infinity;
  var morph = entering && t < T.morph && morphSrc(i) === from;
  var fading = entering && !morph && t < T.slide;
  // 前の画面のモーフの跡を消す
  slides.forEach(function(x){ if (x._morphOn) clearMorph(x._morphOn); });
  // 下に残す前のスライドは最終状態で描く（(i, 0, t, from) が呼び出し順によらず決まるように）
  if ((fading || morph) && !(slides[from]._final)) seek(from, slides[from]._max, Infinity);
  slides.forEach(function(x, j){
    var on = j === i, under = (fading || morph) && j === from;
    x.classList.toggle("active", on);
    if (A11Y && x._ah !== !on){ x._ah = !on; if (on){ x.removeAttribute("aria-hidden"); x.inert = false; } else { x.setAttribute("aria-hidden", "true"); x.inert = true; } }
    x.style.visibility = on || under ? "visible" : "hidden";
    x.style.zIndex = on ? 2 : under ? 1 : 0;
    x.style.opacity = on ? (fading ? prog(t, 0, T.slide) : 1) : under ? 1 : 0;
  });
  if (!s.classList.contains("static")){
    s._items.forEach(function(e){
      var n = +e.getAttribute("data-step"), at = +(e.getAttribute("data-at") || 0);
      var p = n < k ? 1 : n > k ? 0 : prog(t, at, T.fade);
      var lift = !(e instanceof SVGElement) && e.tagName !== "TR" && !e.closest("svg");
      if (lecture){
        e.style.opacity = n <= k ? 1 : .28;
        e.style.transform = "none";
      } else {
        e.style.opacity = p;
        e.style.transform = lift && p < 1 ? "translateY(" + ((1 - p) * 14).toFixed(2) + "px)" : "none";
      }
      e.classList.toggle("on", n <= k);
      e.classList.toggle("cur", lecture && n === k && k > 0);
      // 発表では、まだ出ていない段階を読み上げない（授業モードでは薄く見えているので読む）
      if (A11Y){ var ah = !lecture && n > k; if (e._ah !== ah){ e._ah = ah; if (ah) e.setAttribute("aria-hidden", "true"); else e.removeAttribute("aria-hidden"); } }
    });
  }
  s._draws.forEach(function(w){
    var p = s.classList.contains("static") || lecture || w.step < k ? 1 : w.step > k ? 0 : prog(t, w.at + T.drawDelay, w.dur);
    w.el.style.strokeDashoffset = (1 - p).toFixed(4);
  });
  // 部品の伸縮に使うのは {cue} の区切りの時刻だけ（{mark} の時刻は注目の演出が使う）
  var ac = compCues(i, k);
  var lead = t === Infinity ? 0 : (timing(i, k).lead || 0);
  s._comps.forEach(function(c){
    var p = compPos(c, k, t === Infinity ? Infinity : t, ac && ac.map(function(x){ return x + lead; }));
    try { c.render(p.k, p.t, {mode: mode, slide: s, instant: p.t === Infinity, deck: DECK}); }
    catch (e) { compFail(c, s, i, {kind: "exception", msg: errText(e)}, "render"); c.mount(); }
  });
  if (lastPos && lastPos.i !== i){ var ls = slides[lastPos.i]; ls._tok++; ls._legacyAt = undefined; }
  legacy(s, k, t === Infinity);
  drawMarks(s, i, k, lecture ? Infinity : t);
  if (morph) applyMorph(morphPlan(from, i), t);
  s._final = k === s._max && t === Infinity;
  POS.at(i, k);
  if (CAP.on) drawCaption(i, k, t);
  var bar = document.getElementById("bar");
  if (bar) bar.style.width = ((i + 1) / slides.length * 100) + "%";
  lastPos = {i: i, k: k};
}
DECK.seek = seek;

// ---------------------------------------------------------------- モーフ（docs/contract.md §8）
// data-morph のスライドに段階 0 で入るとき、元のスライドと同じ data-id の要素が元の位置から滑ってくる。
// 画面は (i, 0, t, from) だけで決まる：位置は元の最終状態と先の段階 0 の配置から測って (from, i) ごとに覚える
var morphCache = {};
function morphSrc(i){
  var s = slides[i], m = s && s._morph;
  if (m === null || m === undefined) return -1;
  if (m === "") return i - 1;
  for (var j = 0; j < slides.length; j++) if (slides[j]._key === m) return j === i ? -1 : j;
  return -1;
}
function idMap(s){
  var m = {}, dup = [];
  [].forEach.call(s.querySelectorAll("[data-id]"), function(e){
    if (e.closest("svg")) return;
    var id = e.getAttribute("data-id");
    if (m[id]){ if (dup.indexOf(id) < 0) dup.push(id); return; }
    m[id] = e;
  });
  return {map: m, dup: dup};
}
// 段階 0 で見えているか（data-step > 0 の中にあれば、後で普通に現れる）
function shownAt0(s, e){ for (var a = e; a && a !== s; a = a.parentElement) if (a.hasAttribute("data-step") && +a.getAttribute("data-step") > 0) return false; return true; }
function morphMatch(from, i){
  var A = idMap(slides[from]), B = idMap(slides[i]), pairs = [], later = [];
  Object.keys(B.map).forEach(function(id){
    if (!A.map[id]) return;
    if (!shownAt0(slides[i], B.map[id])){ later.push(id); return; }
    pairs.push({id: id, src: A.map[id], dst: B.map[id]});
  });
  // 入れ子は外側だけを動かす
  pairs = pairs.filter(function(p){ return !pairs.some(function(q){ return q !== p && (q.dst.contains(p.dst) || q.src.contains(p.src)); }); });
  return {pairs: pairs, later: later, dupSrc: A.dup, dupDst: B.dup};
}
// 消える／現れる部分：対応する要素を含まない部分木のいちばん上。対応する要素と並ぶ地の文字は span で包む
function fadeList(root, keep){
  var out = [];
  (function walk(n){
    [].slice.call(n.childNodes).forEach(function(c){
      if (c.nodeType === 3){
        if (!c.textContent.trim() || n === root) return;
        var w = document.createElement("span"); w.className = "morph-txt";
        n.insertBefore(w, c); w.appendChild(c); out.push(w); return;
      }
      if (c.nodeType !== 1 || keep.indexOf(c) >= 0 || (c.classList && c.classList.contains("marks"))) return;
      if (keep.some(function(k){ return c.contains(k); })) walk(c); else out.push(c);
    });
  })(root);
  return out;
}
// 字の外形（舞台の座標）。測る間は要素とその祖先の transform を外す
function stageBox(s, e, glyphs){
  var chain = [], sr = s.getBoundingClientRect(), sc = sr.width / 1280 || 1;
  for (var a = e; a && a !== s; a = a.parentElement){ chain.push([a, a.style.transform]); a.style.transform = "none"; }
  var r = glyphs ? boxOf(e, sr, sc) : null;
  if (!glyphs){ var b = e.getBoundingClientRect(); r = {x: (b.left - sr.left) / sc, y: (b.top - sr.top) / sc, w: b.width / sc, h: b.height / sc}; }
  chain.forEach(function(c){ c[0].style.transform = c[1]; });
  return r;
}
function morphPlan(from, i){
  var key = from + ">" + i;
  if (morphCache[key]) return morphCache[key];
  var S = slides[from], D = slides[i], m = morphMatch(from, i);
  var plan = {S: S, D: D, pairs: [], srcFade: fadeList(S, m.pairs.map(function(p){ return p.src; })),
              dstFade: fadeList(D, m.pairs.map(function(p){ return p.dst; }))};
  m.pairs.forEach(function(p){
    var g0 = stageBox(S, p.src, true), g1 = stageBox(D, p.dst, true), b1 = stageBox(D, p.dst, false);
    if (!g0 || !g1 || !g1.w || !g1.h) return;
    // 先の要素を、字の中心が元の字の中心に重なるように縮めて置く（transform-origin は左上）
    var sc = Math.sqrt((g0.w / g1.w) * (g0.h / g1.h));
    var c0x = g0.x + g0.w / 2, c0y = g0.y + g0.h / 2, c1x = g1.x + g1.w / 2, c1y = g1.y + g1.h / 2;
    var c0 = getComputedStyle(p.src).color, c1 = getComputedStyle(p.dst).color;
    plan.pairs.push({id: p.id, src: p.src, dst: p.dst, s: sc,
      dx: c0x - b1.x - sc * (c1x - b1.x), dy: c0y - b1.y - sc * (c1y - b1.y), c0: c0, c1: c1});
  });
  return (morphCache[key] = plan);
}
function applyMorph(plan, t){
  var Tm = T.morph, e = prog(t, 0, Tm), out = 1 - prog(t, 0, Tm * .45), inn = prog(t, Tm * .45, Tm * .55);
  plan.pairs.forEach(function(p){
    p.src.style.filter = "opacity(0)";
    p.dst.style.transformOrigin = "0 0";
    p.dst.style.transform = "translate(" + (p.dx * (1 - e)).toFixed(2) + "px," + (p.dy * (1 - e)).toFixed(2) + "px) scale(" + lerp(p.s, 1, e).toFixed(4) + ")";
    if (p.c0 !== p.c1) p.dst.style.color = "color-mix(in oklab, " + p.c0 + " " + ((1 - e) * 100).toFixed(1) + "%, " + p.c1 + ")";
  });
  plan.srcFade.forEach(function(x){ x.style.filter = "opacity(" + out.toFixed(4) + ")"; });
  plan.dstFade.forEach(function(x){ x.style.filter = "opacity(" + inn.toFixed(4) + ")"; });
  if (plan.S._mksvg) plan.S._mksvg.style.opacity = out.toFixed(4);
  if (plan.D._mksvg) plan.D._mksvg.style.opacity = inn.toFixed(4);
  plan.D.style.background = "transparent";   // 背景は下の元のスライドのものを見せる
  plan.S._morphOn = plan.D._morphOn = plan;
}
function clearMorph(plan){
  plan.pairs.forEach(function(p){ p.src.style.filter = ""; p.dst.style.transform = ""; p.dst.style.transformOrigin = ""; p.dst.style.color = ""; });
  plan.srcFade.concat(plan.dstFade).forEach(function(x){ x.style.filter = ""; });
  [plan.S, plan.D].forEach(function(s){ if (s._mksvg) s._mksvg.style.opacity = ""; s._morphOn = null; });
  plan.D.style.background = "";
}
// 検査用：スライド i のモーフの対応（data-morph がなければ null）
DECK.morph = function(i){
  var s = slides[i];
  if (!s || s._morph === null) return null;
  var j = morphSrc(i);
  if (j < 0) return {src: null, want: s._morph, ids: [], later: [], dupSrc: [], dupDst: idMap(s).dup};
  var m = morphMatch(j, i);
  return {src: slides[j]._key, ids: m.pairs.map(function(p){ return p.id; }), later: m.later, dupSrc: m.dupSrc, dupDst: m.dupDst};
};

// ---------------------------------------------------------------- 注目の演出（口述原稿の {mark:…}。docs/contract.md §7）
// 印は段階ごとに決まる。時刻は音声の cue（+ lead）、音声がなければ動きの終わりから gap 秒おき。
// 画面は (i, k, t) だけで決まる：seek のたびに重ね描きの SVG を作り直す
var MK = DECK.MK = {draw: .5, fadeOut: .3, gap: .9, laserHold: 1.5};
function boundsOf(i, k){ return DECK.MARKS[DECK.stepKey(i, k)] || null; }
// 部品の伸縮に使う音声の cue（{cue} の区切りの分だけ）。区切りの数が合わない古い音声なら使わない
function compCues(i, k){
  var a = DECK.AUDIO[DECK.stepKey(i, k)], b = boundsOf(i, k);
  if (!a || !a.cues || a.sync === "none") return null;   // sync:"none"（区切りをまだ置いていない収録）は同期しない
  if (!b) return a.cues;
  if (a.cues.length !== b.length) return null;
  return a.cues.filter(function(_, j){ return b[j].type === "cue"; });
}
// 段階 (i, k) の印の予定：[{id, effect, start, end, from}]、end は消え始める時刻（Infinity なら段階の終わりまで）
function markPlan(i, k){
  var s = slides[i];
  s._mk = s._mk || {};
  if (s._mk[k]) return s._mk[k];
  var b = boundsOf(i, k), out = {marks: [], end: 0, audio: false};
  s._mk[k] = out;
  if (!b || !b.some(function(x){ return x.type !== "cue"; })) return out;
  var a = DECK.AUDIO[DECK.stepKey(i, k)], times;
  if (a && a.cues && a.sync !== "none" && a.cues.length === b.length){
    var lead = timing(i, k).lead || 0;
    times = a.cues.map(function(x){ return x + lead; });
    out.audio = true;
  } else {
    var t0 = animDur(i, k), n = 0;
    times = b.map(function(x){ return x.type === "cue" ? null : t0 + MK.gap * n++; });
  }
  b.forEach(function(x, j){
    if (x.type !== "mark") return;
    var st = times[j], hold = x.hold != null ? x.hold : x.effect === "laser" ? MK.laserHold : null;
    var en = hold != null ? st + Math.max(hold, MK.draw) : Infinity;
    for (var c = j + 1; c < b.length; c++) if (b[c].type === "clear" && times[c] < en){ en = Math.max(st, times[c]); break; }
    out.marks.push({id: x.id, effect: x.effect || "underline", start: st, end: en, n: j});
  });
  // スポットとレーザーは 1 つずつ：次のものが出たら前のものはそこから動いていく
  ["spot", "laser"].forEach(function(ef){
    var prev = null;
    out.marks.forEach(function(m){
      if (m.effect !== ef) return;
      if (prev && prev.end > m.start){ prev.end = m.start; prev.handoff = true; m.from = prev; }
      prev = m;
    });
  });
  out.marks.forEach(function(m){
    out.end = Math.max(out.end, m.start + MK.draw, m.end !== Infinity && !m.handoff ? m.end + MK.fadeOut : 0);
  });
  return out;
}
function marksEnd(i, k){ return markPlan(i, k).end; }

// 決まった乱数（印の手描きの揺れ）
function rng(seed){
  var h = 2166136261;
  for (var c = 0; c < seed.length; c++){ h ^= seed.charCodeAt(c); h = Math.imul(h, 16777619); }
  return function(){ h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function markTarget(s, id){
  var q = '[id="' + String(id).replace(/["\\]/g, "\\$&") + '"], [data-mark="' + String(id).replace(/["\\]/g, "\\$&") + '"]';
  var es = s.querySelectorAll(q);
  return es.length ? es[0] : null;
}
// 対象の字の外形（文字の箱の和）。KaTeX の span は字の下がり（y や p）を含まないことがあるので、文字から測る
function boxOf(e, sr, sc){
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  var add = function(r){ if (!r.width && !r.height) return; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); };
  var tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), n, rg = document.createRange();
  while ((n = tw.nextNode())){
    if (!n.textContent.trim() || (n.parentElement && n.parentElement.closest(".katex-mathml"))) continue;
    rg.selectNodeContents(n);
    [].forEach.call(rg.getClientRects(), add);
  }
  [].forEach.call(e.querySelectorAll("svg, img, canvas"), function(g){ add(g.getBoundingClientRect()); });
  if (x0 === Infinity) add(e.getBoundingClientRect());
  if (x0 === Infinity) return null;
  return {x: (x0 - sr.left) / sc, y: (y0 - sr.top) / sc, w: (x1 - x0) / sc, h: (y1 - y0) / sc};
}
function f1(x){ return x.toFixed(1); }
// 形（スライドの座標、1280×720）
var SHAPE = {
  underline: function(r, R){
    var x0 = r.x - 4, x1 = r.x + r.w + 4, y = r.y + r.h + 6, w = x1 - x0;
    var y0 = y + (R() - .5) * 2, y1 = y - 1.5 - R() * 2;
    return "M" + f1(x0) + "," + f1(y0) + "C" + f1(x0 + w * .3) + "," + f1(y0 + 2.2) + " " + f1(x0 + w * .7) + "," + f1(y1 + 1.6) + " " + f1(x1) + "," + f1(y1);
  },
  circle: function(r, R){
    // 角の丸い楕円（超楕円）。横の余白を小さくして、式の中で隣の記号にかからないようにする
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var rx = r.w / 2 + 7, ry = r.h / 2 + 8, ex = 2 / 3.2;
    var th0 = -Math.PI * (.62 + R() * .1), span = Math.PI * 2 + .5, ph = R() * 6.28, N = 120, d = "";
    var sp = function(c){ return (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), ex); };
    for (var n = 0; n <= N; n++){
      var u = n / N, th = th0 + span * u;
      var k = 1 + .025 * Math.sin(2 * th + ph) + .06 * u - .025;   // 少し揺れて、終わりは外へずれる
      d += (n ? "L" : "M") + f1(cx + rx * k * sp(Math.cos(th))) + "," + f1(cy + ry * k * sp(Math.sin(th)));
    }
    return d;
  },
  box: function(r, R){
    var x0 = r.x - 3, y0 = r.y - 6, x1 = r.x + r.w + 3, y1 = r.y + r.h + 6, q = 10;
    var j = function(){ return (R() - .5) * 3; };
    return "M" + f1(x0 + q - 2) + "," + f1(y0 + 1 + j()) + "L" + f1(x1 - q) + "," + f1(y0 + j()) +
      "Q" + f1(x1) + "," + f1(y0) + " " + f1(x1 + j() * .5) + "," + f1(y0 + q) + "L" + f1(x1 + j()) + "," + f1(y1 - q) +
      "Q" + f1(x1) + "," + f1(y1) + " " + f1(x1 - q) + "," + f1(y1 + j() * .5) + "L" + f1(x0 + q) + "," + f1(y1 + j()) +
      "Q" + f1(x0) + "," + f1(y1) + " " + f1(x0 + j() * .5) + "," + f1(y1 - q) + "L" + f1(x0 + j()) + "," + f1(y0 + q) +
      "Q" + f1(x0) + "," + f1(y0) + " " + f1(x0 + q) + "," + f1(y0 - 1) + "L" + f1(x0 + q + 8) + "," + f1(y0 - 2.5);
  }
};
function rr(x, y, w, h, q){
  return "M" + f1(x + q) + "," + f1(y) + "H" + f1(x + w - q) + "Q" + f1(x + w) + "," + f1(y) + " " + f1(x + w) + "," + f1(y + q) +
    "V" + f1(y + h - q) + "Q" + f1(x + w) + "," + f1(y + h) + " " + f1(x + w - q) + "," + f1(y + h) + "H" + f1(x + q) +
    "Q" + f1(x) + "," + f1(y + h) + " " + f1(x) + "," + f1(y + h - q) + "V" + f1(y + q) + "Q" + f1(x) + "," + f1(y) + " " + f1(x + q) + "," + f1(y) + "Z";
}
function drawMarks(s, i, k, t){
  var plan = markPlan(i, k), svg = s._mksvg;
  if (!plan.marks.length){ if (svg) svg.textContent = ""; return; }
  if (!svg){
    svg = s._mksvg = el("svg", {class: "marks", viewBox: "0 0 1280 720", "aria-hidden": "true"}, s);
  }
  svg.textContent = "";
  var sr = s.getBoundingClientRect(), sc = sr.width / 1280 || 1, cache = {};
  function rect(id){
    if (cache[id] !== undefined) return cache[id];
    var e = markTarget(s, id);
    return (cache[id] = e ? boxOf(e, sr, sc) : null);
  }
  function state(m){
    if (t === Infinity) return m.end === Infinity ? {p: 1, o: 1} : null;
    if (t < m.start) return null;
    var o = t < m.end ? 1 : m.handoff ? 0 : 1 - clamp01((t - m.end) / MK.fadeOut);
    return o > 0 ? {p: prog(t, m.start, MK.draw), o: o} : null;
  }
  var C = "var(--emph)", layers = {spot: el("g", {}, svg), line: el("g", {}, svg), laser: el("g", {}, svg)};
  plan.marks.forEach(function(m){
    var st = state(m), r = rect(m.id);
    if (!st || !r) return;
    var R = rng(s._key + ":" + k + ":" + m.n + ":" + m.id);
    if (m.effect === "spot"){
      // 対象のまわりだけ残して、ほかを白く沈める。前のスポットがあれば穴がそこから動く
      var f = m.from && rect(m.from.id), e = st.p, px = 6, py = 9;
      var x = r.x - px, y = r.y - py, w = r.w + 2 * px, h = r.h + 2 * py;
      if (f){ x = lerp(f.x - px, x, e); y = lerp(f.y - py, y, e); w = lerp(f.w + 2 * px, w, e); h = lerp(f.h + 2 * py, h, e); }
      var veil = f ? 1 : e;
      el("path", {d: "M-10,-10H1290V730H-10Z" + rr(x, y, w, h, 12), "fill-rule": "evenodd", fill: "var(--bg)", "fill-opacity": (.78 * veil * st.o).toFixed(3)}, layers.spot);
      el("path", {d: rr(x, y, w, h, 12), fill: "none", stroke: C, "stroke-width": 2, "stroke-opacity": (.35 * veil * st.o).toFixed(3)}, layers.spot);
      return;
    }
    if (m.effect === "laser"){
      var tx = r.x + r.w / 2, ty = r.y + r.h + 13, g = m.from && rect(m.from.id);
      var sx = g ? g.x + g.w / 2 : tx - 70, sy = g ? g.y + g.h + 13 : ty + 40;
      var e2 = st.p, px = lerp(sx, tx, e2), py = lerp(sy, ty, e2), o2 = (g ? 1 : clamp01(e2 * 2.5)) * st.o;
      if (!svg.querySelector("filter")){
        var flt = el("filter", {id: "mkglow-" + i, x: "-1", y: "-1", width: "3", height: "3"}, el("defs", {}, svg));
        el("feGaussianBlur", {stdDeviation: 5}, flt);
        svg.insertBefore(flt.parentNode, svg.firstChild);
      }
      if (e2 < 1) el("line", {x1: f1(lerp(sx, tx, Math.max(0, e2 - .25))), y1: f1(lerp(sy, ty, Math.max(0, e2 - .25))), x2: f1(px), y2: f1(py), stroke: C, "stroke-width": 4, "stroke-linecap": "round", "stroke-opacity": (.25 * o2).toFixed(3)}, layers.laser);
      el("circle", {cx: f1(px), cy: f1(py), r: 13, fill: C, "fill-opacity": (.55 * o2).toFixed(3), filter: "url(#mkglow-" + i + ")"}, layers.laser);
      el("circle", {cx: f1(px), cy: f1(py), r: 6, fill: C, "fill-opacity": o2.toFixed(3)}, layers.laser);
      el("circle", {cx: f1(px - 1.5), cy: f1(py - 1.5), r: 2, fill: "#fff", "fill-opacity": (.8 * o2).toFixed(3)}, layers.laser);
      return;
    }
    if (st.p <= 0) return;
    var mk = SHAPE[m.effect] || SHAPE.underline;
    var wdt = m.effect === "underline" ? 5 : 3.5;
    el("path", {d: mk(r, R), pathLength: 1, fill: "none", stroke: C, "stroke-width": wdt, "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": "1 2", "stroke-dashoffset": (1 - st.p).toFixed(4), "stroke-opacity": ((m.effect === "underline" ? .85 : .9) * st.o).toFixed(3)}, layers.line);
  });
}
// 検査用：段階 (i, k) の印の予定と、目印が見つかるか
DECK.marks = function(i, k){
  return markPlan(i, k).marks.map(function(m){ return {id: m.id, effect: m.effect, start: m.start, end: m.end, found: !!markTarget(slides[i], m.id)}; });
};

// ---------------------------------------------------------------- タイムライン（自動再生と動画の書き出しが共有する）
var TIMING_OK = {};   // 確かめた時間の上書き（警告を 1 度だけ出す）
function timing(i, k){
  var key = DECK.stepKey(i, k), a = DECK.AUDIO[key], o = DECK.TIMING[key] || {};
  if (TIMING_OK[key] === undefined || TIMING_OK[key].src !== o){
    TIMING_OK[key] = {src: o, v: {dur: secOk(o.dur, key + " dur"), hold: secOk(o.hold, key + " hold"), lead: secOk(o.lead, key + " lead"),
                                  pad_after: secOk(o.pad_after, key + " pad_after")}};
  }
  o = TIMING_OK[key].v;
  return {key: key, audio: a || null, lead: o.lead !== undefined ? o.lead : (a ? T.lead : 0),
          pad: o.pad_after !== undefined ? o.pad_after : T.padAfter, hold: o.hold !== undefined ? o.hold : T.hold, dur: o.dur};
}
// 音声の符号化の遅れ（format spec §5.2 startOffset。秒、0〜1）：その時刻から鳴らし、そこを音声の 0 秒（dur と cues の 0）とみなす
function audioOffset(a){ var x = a && a.startOffset; return typeof x === "number" && isFinite(x) && x > 0 && x <= 1 ? x : 0; }
DECK.timeline = function(){
  var out = [], start = 0;
  slides.forEach(function(s, i){
    for (var k = 0; k <= s._max; k++){
      var tm = timing(i, k), anim = animDur(i, k), me = marksEnd(i, k);
      // 音声のない段階では、注目の演出が出そろうまで（+ pad_after）止まる
      var dur = tm.dur !== undefined ? tm.dur : Math.max(anim, tm.audio ? tm.lead + tm.audio.dur + tm.pad : Math.max(tm.hold, me ? me + tm.pad : 0));
      out.push({i: i, k: k, key: tm.key, slideKey: s._key, title: titleOf(s), anim: anim, motion: Math.max(anim, me), lead: tm.lead,
                audio: tm.audio ? tm.audio.src : null, audioDur: tm.audio ? tm.audio.dur : 0, audioOffset: audioOffset(tm.audio), dur: dur, start: start,
                chapter: chapterOf(i)});
      start += dur;
    }
  });
  return out;
};
function titleOf(s){ var h = s.querySelector("h2, h1"); return h ? (h.getAttribute("data-title") || h.textContent.replace(/\s+/g, " ").trim()) : s._key; }
function chapterOf(i){ for (var j = i; j >= 0; j--) if (slides[j].classList.contains("sec") || slides[j].hasAttribute("data-chapter")) return slides[j].getAttribute("data-chapter") || titleOf(slides[j]); return ""; }

// ---------------------------------------------------------------- 読み上げソフト向け（docs/reference.md「Accessibility」）
// 動画では何も作らない（画面の画素は変えない。#deck-live は画面の外、aria-* と inert は描画に効かない）
var A11Y = DECK.mode !== "video" && !DECK.view;
var live = null, lastSaid = null;
function L10N(ja, en){ return DECK.ja ? ja : en; }
// 音声について示す文（format spec §7.3。キーの一覧・操作の帯の札の説明・発表者ビューで共通）。録音と音声のない段階は ""
DECK.VOICE_NOTE = {tts: L10N("音声は AI で合成したものです", "The narration audio is AI-generated"),
  imported: L10N("音声の作り方は記録されていません", "How the audio was made is not recorded")};
function voiceNote(key){ return DECK.VOICE_NOTE[DECK.audioKind(key)] || ""; }
DECK.voiceNote = voiceNote;
// 読み上げる文字：aria-hidden と TeX の原文（annotation）は除く。式は MathML があればその字、
// なければ（build は KaTeX の html だけを出す）見た目の部分の字（f(θ) など）を使う
function speakText(e){
  var out = "";
  (function walk(n){
    if (n.nodeType === 3){ out += n.textContent; return; }
    if (n.nodeType !== 1 || /^(annotation|script|style)$/i.test(n.tagName)) return;
    if (n !== e && n.getAttribute("aria-hidden") === "true" &&
        !(n.classList.contains("katex-html") && !(n.parentNode && n.parentNode.querySelector(":scope > .katex-mathml")))) return;
    for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
    if (/^(P|LI|DIV|TR|TD|TH|BR)$/.test(n.tagName)) out += " ";
  })(e);
  return out.replace(/\s+/g, " ").trim();
}
function slideLabel(i){
  var h = slides[i].querySelector("h2, h1"), t = h ? (h.getAttribute("data-title") || speakText(h)) : "";
  return L10N("スライド " + (i + 1) + " / " + slides.length + (t ? "：" + t : ""),
              "Slide " + (i + 1) + " of " + slides.length + (t ? ": " + t : ""));
}
function announce(i, k){
  if (!live) return;
  var s = slides[i], msg;
  if (!lastSaid || lastSaid.i !== i) msg = slideLabel(i);
  else if (lastSaid.k === k) return;
  else {
    var txt = k > lastSaid.k ? s._items.filter(function(e){ return +e.getAttribute("data-step") === k; }).map(speakText).join(" ").trim() : "";
    msg = txt || L10N("段階 " + k + " / " + s._max, "Step " + k + " of " + s._max);
  }
  lastSaid = {i: i, k: k};
  // 同じ文でも読み直されるように、いったん空にしてから入れる
  live.textContent = "";
  setTimeout(function(){ if (live) live.textContent = msg; }, 30);
}
function setupA11y(){
  if (!A11Y) return;
  slides.forEach(function(s, i){
    s.setAttribute("role", "group");
    s.setAttribute("aria-roledescription", L10N("スライド", "slide"));
    s.setAttribute("aria-label", slideLabel(i));
  });
  live = document.createElement("div");
  live.id = "deck-live"; live.className = "sr-only";
  live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true");
  document.body.appendChild(live);
}
DECK.announce = function(){ return live ? live.textContent : null; };

// ---------------------------------------------------------------- 字幕（s。動画では ?captions=1 のときだけ）
// 今の段階の口述原稿（表示用の文字）を舞台の下に、文のまとまり（およそ 2 行）を 1 つずつ出す
// - 動画では (i, k, t) だけで決まる：区切りの時刻は音声の長さを字数で按分する（音声がなければ全部を重ねて出す）
// - 自動再生で音声があれば、音声の進みに合わせる
// - 手で送っているとき（と音声のない自動再生）は、読む速さ（ja 7 字/秒、en 15 字/秒。--cap-rate か DECK.captionRate で変える）で
//   段階が変わるたびに最初から送り、最後のまとまりはそのまま残す
// - 大きさ：テーマの --cap-size / --cap-bottom / --cap-side / --cap-max-lines。Shift+s で S / M / L（22 / 27 / 34px）、?capsize=s|m|l、
//   最後に選んだ大きさは localStorage に覚える（動画では使わない）。字が大きいほど 1 まとまりを短くする
var CAP = {on: /^(1|true|on|yes)$/i.test(Q.get("captions") || ""), el: null, key: null, lv: null, timer: 0, size: null};
if (DECK.mode === "video" || DECK.view) CAP.allowed = CAP.on; else CAP.allowed = true;
var CAP_SIZES = {s: 22, m: 27, l: 34}, CAP_LIVE = DECK.mode !== "video" && !DECK.view;
if (CAP_LIVE){
  var qs = (Q.get("capsize") || "").toLowerCase();
  if (CAP_SIZES[qs]) CAP.size = qs;
  else { try { var ls = localStorage.getItem("deck-capsize"); if (CAP_SIZES[ls]) CAP.size = ls; } catch (e) {} }
}
function capTurns(i, k){
  var s = slides[i], key = stepKey(s, k);
  return ((DECK.NARRATION[s._key] || {})[key]) || [];
}
// 1 まとまりの字数の上限（2 行）。既定の大きさ（27px、左右 96px）で ja 64 字・en 120 字。字が大きく幅が狭いほど短く
function capMax(){
  var cs = CAP.el ? getComputedStyle(CAP.el) : null;
  var size = cs ? parseFloat(cs.fontSize) || 27 : 27;
  var w = cs ? 1280 - (parseFloat(cs.left) || 96) - (parseFloat(cs.right) || 96) : 1088;
  var lines = cs ? parseFloat(cs.getPropertyValue("--cap-max-lines")) || 3 : 3;
  var max = Math.max(12, Math.round((DECK.ja ? 64 : 120) * (27 / size) * (w / 1088)));
  return {max: max, lim: Math.round(max * Math.max(1, lines) / 2)};
}
// lim 字を超える文を、読点・語の切れ目（なければ字数）で max 字ほどに分ける
function capSplit(p, max, lim){
  if (p.length <= lim) return [p];
  var toks = DECK.ja ? p.match(/[^、，,；;：:]+[、，,；;：:]*\s*/g) : p.match(/\S+\s*/g), out = [], buf = "";
  (toks || [p]).forEach(function(t){
    while (t.length > lim){ if (buf){ out.push(buf); buf = ""; } out.push(t.slice(0, max)); t = t.slice(max); }
    if (buf && (buf + t).length > max){ out.push(buf); buf = ""; }
    buf += t;
  });
  if (buf) out.push(buf);
  return out;
}
// 文に分けて（「.」は後ろが空白か末尾のときだけ文末。0.5・e.g.・a.b.c は文の中）、短い文は次とつなぐ（1 まとまりがおよそ 2 行に収まるように）。長すぎる文は分ける（--cap-max-lines 行まで）
function capChunks(i, k){
  var s = slides[i], m = capMax(), ck = k + ":" + m.max + ":" + m.lim;
  s._cap = s._cap || {};
  if (s._cap[ck]) return s._cap[ck];
  var out = [];
  capTurns(i, k).forEach(function(t){
    var parts = String(t.text || "").match(/(?:[^。！？!?.]|\.(?!\s|$))+(?:[。！？!?]+|\.(?=\s|$)|$)\s*/g) || [];
    var buf = "";
    [].concat.apply([], parts.map(function(p){ return capSplit(p, m.max, m.lim); })).forEach(function(p){
      if (buf && (buf + p).length > m.max){ out.push({text: buf.trim(), role: t.role}); buf = ""; }
      buf += p;
    });
    if (buf.trim()) out.push({text: buf.trim(), role: t.role});
  });
  return (s._cap[ck] = out);
}
// 読む速さ（字/秒）
function capRate(){
  var r = +DECK.captionRate;
  if (!(r > 0) && CAP.el) r = parseFloat(getComputedStyle(CAP.el).getPropertyValue("--cap-rate"));
  return r > 0 ? r : DECK.ja ? 7 : 15;
}
// 手で送っているときの区切り：段階が変わったら最初から、読む速さで次へ。最後のまとまりは残す
function capRestart(i, k, j){
  clearTimeout(CAP.timer);
  CAP.lv = {i: i, k: k, j: j || 0};
  capSchedule();
}
function capSchedule(){
  clearTimeout(CAP.timer);
  var lv = CAP.lv;
  if (!CAP.on || !lv) return;
  var ch = capChunks(lv.i, lv.k);
  if (lv.j >= ch.length - 1) return;
  CAP.timer = setTimeout(function(){
    if (CAP.lv !== lv) return;
    lv.j++;
    if (POS.i === lv.i && POS.k === lv.k) drawCaption(POS.i, POS.k, Infinity);
    capSchedule();
  }, Math.max(1.2, ch[lv.j].text.length / capRate()) * 1000);
}
// 区切りの番号（-1 なら全部）
function capIndex(i, k, t){
  var ch = capChunks(i, k);
  if (ch.length < 2) return -1;
  var tm = timing(i, k), a = tm.audio, tt;
  if (DECK.mode === "video"){ if (!a || !a.dur) return -1; if (t === Infinity) return ch.length - 1; tt = t - tm.lead; }
  else if (a && a.dur && auto && audioEl && auto.tl[auto.idx] && auto.tl[auto.idx].i === i && auto.tl[auto.idx].k === k) tt = auto.playing === tm.key ? Math.max(0, (audioEl.currentTime || 0) - audioOffset(a)) : 0;
  else return CAP.lv && CAP.lv.i === i && CAP.lv.k === k ? Math.min(CAP.lv.j, ch.length - 1) : 0;
  var total = ch.reduce(function(n, c){ return n + c.text.length; }, 0), acc = 0, x = Math.max(0, tt) / a.dur * total;
  for (var j = 0; j < ch.length; j++){ acc += ch[j].text.length; if (x < acc) return j; }
  return ch.length - 1;
}
function drawCaption(i, k, t){
  var e = CAP.el;
  if (!e) return;
  var ch = capChunks(i, k), j = capIndex(i, k, t);
  var shown = j < 0 ? ch : [ch[j]];
  var key = i + ":" + k + ":" + j + ":" + (CAP.size || "");
  if (CAP.key === key) return;
  CAP.key = key;
  e.textContent = "";
  shown.forEach(function(c){
    var p = document.createElement("span");
    p.className = "cap-line" + (c.role === "novice" ? " novice" : "");
    p.textContent = c.text;
    e.appendChild(p);
  });
  e.classList.toggle("empty", !shown.length);
  // --cap-max-lines 行を超えたら、後ろの行を見せる
  [].forEach.call(e.children, function(p){ if (p.scrollHeight > p.clientHeight + 1) p.scrollTop = p.scrollHeight; });
}
function capApplySize(){
  if (CAP.el && CAP.size) CAP.el.style.setProperty("--cap-size", CAP_SIZES[CAP.size] + "px");
}
function setCaptions(on){
  if (!CAP.allowed) return false;
  CAP.on = on === undefined ? !CAP.on : !!on;
  if (CAP.on && !CAP.el){
    var st = document.getElementById("stage");
    CAP.el = document.createElement("div"); CAP.el.id = "deck-cap"; CAP.el.className = "empty";
    // 字幕は口述原稿を見せるもの。読み上げは #deck-live が受け持つので、二重に読ませない
    CAP.el.setAttribute("aria-hidden", "true");
    (st || document.body).appendChild(CAP.el);
    capApplySize();
  }
  if (CAP.el) CAP.el.hidden = !CAP.on;
  document.documentElement.classList.toggle("captions", CAP.on);
  CAP.key = null;
  if (CAP.on && CAP_LIVE && slides.length) capRestart(POS.i, POS.k);
  if (!CAP.on) clearTimeout(CAP.timer);
  if (CAP.on && slides.length) drawCaption(POS.i, POS.k, Infinity);
  document.dispatchEvent(new CustomEvent("deck:captions", {detail: {on: CAP.on}}));
  return CAP.on;
}
// 字幕の大きさ：s / m / l。引数なしなら S → M → L → S と回す（字幕が出ていなければ出す）
function capSize(z){
  if (!CAP_LIVE) return null;
  if (z === undefined){ var o = ["s", "m", "l"]; z = o[(o.indexOf(CAP.size || "m") + 1) % 3]; }
  z = String(z).toLowerCase();
  if (!CAP_SIZES[z]) return CAP.size;
  // 今読んでいる字の位置を保ったまま区切りを変える
  var off = 0, lv = CAP.lv;
  if (CAP.on && lv && lv.i === POS.i && lv.k === POS.k){ var ch0 = capChunks(POS.i, POS.k); for (var a = 0; a < Math.min(lv.j, ch0.length); a++) off += ch0[a].text.length; }
  CAP.size = z;
  try { localStorage.setItem("deck-capsize", z); } catch (e) {}
  if (!CAP.on) setCaptions(true);
  capApplySize();
  if (CAP.on && slides.length){
    var ch = capChunks(POS.i, POS.k), j = 0, acc = 0;
    while (j < ch.length - 1 && acc + ch[j].text.length <= off){ acc += ch[j].text.length; j++; }
    capRestart(POS.i, POS.k, j);
    CAP.key = null; drawCaption(POS.i, POS.k, Infinity);
  }
  DECK.toast(L10N("字幕の大きさ：", "Caption size: ") + z.toUpperCase());
  document.dispatchEvent(new CustomEvent("deck:captions", {detail: {on: CAP.on, size: z}}));
  return z;
}
DECK.captions = function(on){ if (on === undefined) return CAP.on; return setCaptions(on); };
DECK.caption = function(){ return CAP.on && CAP.el ? CAP.el.textContent : null; };
DECK.captionSize = function(z){ return z === undefined ? (CAP_LIVE ? CAP.size || "m" : null) : capSize(z); };

// ---------------------------------------------------------------- 短い知らせ（字幕の大きさ・ペンの色など）。動画と埋め込みでは出さない
var toastEl = null, toastT = 0;
DECK.toast = function(msg){
  if (DECK.mode === "video" || DECK.view) return;
  if (!toastEl){
    toastEl = document.createElement("div"); toastEl.id = "deck-toast";
    toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(function(){ toastEl.classList.remove("show"); }, 1400);
};

// ---------------------------------------------------------------- 実時間での再生
function stopLoop(){ if (raf) cancelAnimationFrame(raf); raf = 0; }
function play(i, k, animate, from){
  stopLoop();
  announce(i, k);
  if (CAP.on && CAP_LIVE) capRestart(i, k);
  POS.setT(!animate || REDUCE ? null : 0);
  if (!animate || REDUCE){ seek(i, k, Infinity); POS.publish(); return; }
  if (i !== POS.i){ slides[POS.i]._tok++; slides[POS.i]._legacyAt = undefined; }
  legacy(slides[i], k, false);
  var d = Math.max(animDur(i, k), DECK.mode === "lecture" ? 0 : marksEnd(i, k), k === 0 && from >= 0 && morphSrc(i) === from ? T.morph : 0);
  t0 = performance.now();
  (function loop(){
    var t = (performance.now() - t0) / 1000;
    if (t >= d){ seek(i, k, Infinity); raf = 0; return; }
    seek(i, k, t, from);
    raf = requestAnimationFrame(loop);
  })();
  POS.publish();
}
function go(i, k, animate){
  var from = POS.i;
  i = Math.max(0, Math.min(slides.length - 1, i));
  LINKS.seen[i] = true;
  play(i, Math.max(0, Math.min(slides[i]._max, k)), animate, animate && i !== from ? from : -1);
  // 履歴の項目の state（リンクの深さ）は残し、その項目の中の今の位置（at：ブラウザの「進む」で戻る先）を書く（format spec §9.1A の「戻る」）
  try {
    if (!DECK.view){
      var hs = history.state;
      if (hs && typeof hs.egatariLink === "number") hs = Object.assign({}, hs, {at: {i: i, k: Math.max(0, Math.min(slides[i]._max, k))}});
      history.replaceState(hs, "", location.pathname + location.search + "#" + (i + 1));
    }
  } catch (e) {}
}
function next(){ var i = POS.i, k = POS.k; if (k < slides[i]._max) go(i, k + 1, true); else if (i < slides.length - 1) go(i + 1, 0, true); }
function prev(){ var i = POS.i, k = POS.k; if (k > 0) go(i, k - 1, false); else if (i > 0) go(i - 1, slides[i - 1]._max, false); }
DECK.go = go; DECK.next = next; DECK.prev = prev;
DECK.state = function(){ var i = POS.i, k = POS.k; return {slide: i + 1, step: k, max: slides[i]._max, key: DECK.stepKey(i, k), mode: DECK.mode}; };

// ---------------------------------------------------------------- 自動再生（音声があれば流し、タイムラインで進む）
var audioEl = null;
function stopAuto(){
  if (!auto) return;
  clearTimeout(auto.timer); clearTimeout(auto.atimer);
  if (audioEl){ audioEl.pause(); }
  auto = null; POS.setPlaying(false); document.documentElement.classList.remove("autoplay");
  POS.publish();
}
function startAuto(){
  stopAuto();
  var tl = DECK.timeline(), idx = tl.findIndex(function(x){ return x.i === POS.i && x.k === POS.k; });
  if (idx < 0) idx = 0;
  auto = {tl: tl, idx: idx}; POS.setPlaying(true);
  document.documentElement.classList.add("autoplay");
  runSeg();
}
function runSeg(){
  if (!auto) return;
  var g = auto.tl[auto.idx];
  if (!g){ stopAuto(); return; }
  if (!(g.i === POS.i && g.k === POS.k && auto.started)){ var c0 = POS.cause; POS.setCause(c0 || "play"); go(g.i, g.k, true); POS.setCause(c0); }
  auto.started = true;
  if (g.audio){
    if (!audioEl){
      audioEl = new Audio();
      audioEl.addEventListener("timeupdate", function(){ if (CAP.on && auto) drawCaption(POS.i, POS.k, Infinity); });
    }
    auto.atimer = setTimeout(function(){ if (auto) auto.playing = g.key; audioEl.src = g.audio; audioEl.currentTime = g.audioOffset || 0; audioEl.play().catch(function(){}); }, g.lead * 1000);
  }
  auto.timer = setTimeout(function(){ if (!auto) return; auto.idx++; runSeg(); }, g.dur * 1000);
}
DECK.autoplay = function(on){ if (on === false || (on === undefined && auto)) stopAuto(); else startAuto(); };

// ---------------------------------------------------------------- 発表者ビューとの連携（postMessage。file:// でも動く）
var presenter = null;
// PositionStore の購読者：位置を知らせるたびに（POS.publish）発表者ビュー・埋め込みの親・deck:pos へ送る
function broadcast(p){
  var cur = p.i, step = p.k;
  var ni = step < slides[cur]._max ? cur : cur + 1, nk = step < slides[cur]._max ? step + 1 : 0;
  var msg = {type: "deck-pos", i: cur, k: step, max: slides[cur]._max, n: slides.length, key: DECK.stepKey(cur, step),
             nextKey: ni < slides.length ? DECK.stepKey(ni, nk) : null, auto: p.playing, cause: p.cause || "control",
             back: p.top ? titleOf(slides[p.top.i]) : null};
  if (presenter && !presenter.closed) presenter.postMessage(msg, "*");
  if (window.parent !== window) window.parent.postMessage(msg, "*");
  // 埋め込み（format spec §9.4）：段階が変わるたびに位置を知らせる
  if (EMBED) post({egatari: "position", slideKey: slides[cur]._key, stepKey: stepKey(slides[cur], step), t: p.t, cause: p.cause || "control"});
  document.dispatchEvent(new CustomEvent("deck:pos", {detail: msg}));
}
POS.subscribe(broadcast);
// 発表者ビューに送る（tools.js がペンの色を知らせるのに使う）
DECK.toPresenter = function(msg){ if (presenter && !presenter.closed) presenter.postMessage(msg, "*"); };
function openPresenter(){
  var u = new URL(location.href); u.searchParams.set("presenter", "1"); u.hash = "";
  presenter = window.open(u.href, "deck-presenter", "width=1400,height=820");
  setTimeout(POS.publish, 800);
}
window.addEventListener("message", function(e){
  var m = e.data || {};
  // 発表者ビュー自身（スライドを持たない）や起動前の窓に届いた命令は無視する
  if (!slides.length) return;
  if (m.type === "deck-cmd"){
    // 発表者ビューで手で送ったら、自動再生は止める（本体のキー操作と同じ）
    if (m.cmd === "next"){ stopAuto(); next(); } else if (m.cmd === "prev"){ stopAuto(); prev(); }
    else if (m.cmd === "goto"){ POS.setCause("seek"); go(m.i, m.k, !!m.animate); POS.setCause(null); }
    else if (m.cmd === "link" && typeof m.frag === "string") DECK.follow(m.frag);   // 発表者ビューの中の画面で押したリンク
    else if (m.cmd === "back") back();
    else if (m.cmd === "auto") DECK.autoplay();
    else if (m.cmd === "hello"){ presenter = e.source; POS.publish(); document.dispatchEvent(new CustomEvent("deck:presenter")); }
  } else if (m.type === "deck-goto" && DECK.view && slides.length){
    go(m.i, m.k, !!m.animate);
  } else if (EMBED && e.source === window.parent && m.egatari === "links" && typeof m.follow === "boolean"){
    // 親がリンクで動くのを止める・許す（format spec §9.1A。止めている間は linkRefused を送る）
    LINKS.follow = m.follow;
    post({egatari: "links", id: m.id, follow: LINKS.follow});
  }
});

// ---------------------------------------------------------------- スライドへのリンク（format spec §9.1A。docs/contract.md §9）
// <a href="#<スライドの id>"> はそのスライドの段階 0、<a href="#<id>:<段階の鍵>"> はその段階（段階の鍵は 0・1・… か concl）。
// 段階の鍵は最後の : で切る（旧来の鍵は : を含みうる）。数字だけの #N（1 から）はこれまでどおりスライドの番号。
// 同じ書き方の URL の # は開いたときの位置。リンクを押すと：自動再生していなければその段階の最終状態へ、自動再生中ならそこから
// 再生を続ける。直前のリンクの前の位置へ「戻る」（Backspace・Alt+←・左上の戻るボタン・ブラウザの戻る）。
// 上の窓（top-level）は動かさない：リンクは文書の中で動き、ほかのファイルへのリンク（other.ega.html#…）だけがふつうに開く。
// 埋め込み（?embed=1、親の窓あり）では位置の知らせ {egatari:"position", …, cause:"link"} を送り、親が ?links=0 か
// {egatari:"links", follow:false} で止めていれば動かずに {egatari:"linkRefused", slideKey, stepKey} を送る
var TOP = window.parent === window && !DECK.view;
var EMBED = !TOP && !DECK.view && Q.get("embed") === "1";
var LINKS = {follow: !(EMBED && /^(0|false|no|off)$/i.test(Q.get("links") || "")), seen: Object.create(null), btn: null};   // 戻るの跡は POS（PositionStore）
function slideIndexOf(key){
  for (var j = 0; j < slides.length; j++) if (slides[j].id === key) return j;
  for (j = 0; j < slides.length; j++) if (slides[j]._key === key) return j;
  return -1;
}
// 位置の書き方（# の後ろ）を {i, k} にする。読めなければ {error}（品質チェックも使う）
function resolveFragment(f){
  f = String(f == null ? "" : f).replace(/^#/, "");
  if (!f) return {error: "empty"};
  try { f = decodeURIComponent(f); } catch (e) {}
  if (/^[0-9]+$/.test(f)){
    var n = +f;
    return n >= 1 && n <= slides.length ? {i: n - 1, k: 0, legacy: true} : {error: "slide number out of range", slide: f};
  }
  var i = slideIndexOf(f), sk = null;
  if (i < 0){ var p = f.lastIndexOf(":"); if (p > 0){ i = slideIndexOf(f.slice(0, p)); if (i >= 0) sk = f.slice(p + 1); } }
  if (i < 0) return {error: "unknown slide", slide: f.lastIndexOf(":") > 0 ? f.slice(0, f.lastIndexOf(":")) : f};
  var s = slides[i], out = {i: i, k: 0, key: s._key, id: s.id || null};
  if (sk === null) return out;
  if (sk === "concl"){ if (s._cstep < 0) return {error: "no concl step", slide: s._key, step: sk, i: i}; out.k = s._cstep; return out; }
  if (!/^(0|[1-9][0-9]{0,2})$/.test(sk)) return {error: "not a step key", slide: s._key, step: sk, i: i};
  var k = +sk;
  // 結論の段階の鍵は concl（数字では指さない）
  if (k > s._max || k === s._cstep) return {error: "step out of range", slide: s._key, step: sk, i: i, max: s._cstep >= 0 ? s._cstep - 1 : s._max};
  out.k = k;
  return out;
}
DECK.resolveFragment = resolveFragment;
// 位置の書き方（id があれば <id>[:<段階の鍵>]。id のない旧来のスライドは段階 0 なら <番号>、ほかは <鍵>:<段階の鍵>）
function fragmentOf(i, k){
  var s = slides[i];
  if (!s.id) return k ? s._key + ":" + stepKey(s, k) : String(i + 1);
  return k ? s.id + ":" + stepKey(s, k) : s.id;
}
DECK.fragment = fragmentOf;
// 同じ文書の中を指すリンクなら # の後ろ、ほかのファイルなら null
function inDocFragment(a){
  var h = a.getAttribute("href");
  if (h == null) return null;
  if (h.charAt(0) === "#") return h.slice(1);
  try {
    var u = new URL(h, location.href), here = new URL(location.href);
    if (u.hash && u.origin === here.origin && u.pathname === here.pathname && u.search === here.search) return u.hash.slice(1);
  } catch (e) {}
  return null;
}
DECK.linkFragment = inDocFragment;
function post(msg){ try { window.parent.postMessage(msg, "*"); } catch (e) {} }
// 見たスライド（m-menu の「見た」の印。セッションの中だけ、保存しない）
DECK.visited = function(i){ return typeof i === "number" ? !!LINKS.seen[i] : !!LINKS.seen[slideIndexOf(String(i))]; };
// リンクで (i, k) へ。opts = {el, keyboard}
function followLink(pos, opts){
  opts = opts || {};
  if (DECK.view){ post({type: "deck-link", frag: fragmentOf(pos.i, pos.k)}); return false; }   // 発表者ビューの中の画面：本体に任せる
  var target = {slideKey: slides[pos.i]._key, stepKey: stepKey(slides[pos.i], pos.k)};
  if (!LINKS.follow){ post(Object.assign({egatari: "linkRefused"}, target)); return false; }
  var depth = POS.push({i: POS.i, k: POS.k, el: opts.keyboard ? opts.el : null});
  if (TOP) try { history.pushState({egatariLink: depth, to: {i: pos.i, k: pos.k}}, "", "#" + (pos.i + 1)); } catch (e) {}
  moveTo(pos.i, pos.k, "link");
  return true;
}
// 再生の状態を保ったまま (i, k) へ：自動再生中なら段階の初めから続け、そうでなければ最終状態
function moveTo(i, k, cause){
  var playing = POS.playing;
  POS.setCause(cause);
  if (playing){ stopAuto(); go(i, k, false); startAuto(); }
  else go(i, k, false);
  POS.setCause(null);
  syncBack();
}
function back(){
  if (!POS.depth) return false;
  // 上の窓では履歴で戻る（ブラウザの戻ると同じ。popstate で動く）
  if (TOP && history.state && history.state.egatariLink === POS.depth){ history.back(); return true; }
  backTo(POS.depth - 1);
  return true;
}
function backTo(depth){
  var e = null;
  while (POS.depth > depth) e = POS.pop();
  if (!e) return;
  moveTo(e.i, e.k, "link");
  if (e.el && e.el.isConnected) try { e.el.focus({preventScroll: true}); } catch (err) {}
}
DECK.back = back;
DECK.links = function(){ return {depth: POS.depth, follow: LINKS.follow, back: POS.depth ? Object.assign({}, POS.top(), {el: undefined}) : null}; };
DECK.follow = function(frag){ var r = resolveFragment(frag); if (r.error){ console.warn("deck.js: link #" + frag + ": " + r.error); return false; } return followLink(r); };
window.addEventListener("popstate", function(e){
  if (!slides.length) return;
  var st = e.state || {}, d = typeof st.egatariLink === "number" ? st.egatariLink : 0;
  if (d < POS.depth) backTo(d);
  else if (d > POS.depth && (st.at || st.to) && slides[(st.at || st.to).i]){   // 進む：もう一度そのリンクをたどり、その先で最後にいた位置へ
    var at = st.at || st.to;
    POS.push({i: POS.i, k: POS.k, el: null});
    moveTo(at.i, at.k, "link");
  }
});
// ---------------------------------------------------------------- 授業の外へ出るリンク（format spec §11。決まりは kit/core/link-policy.mjs の LinkPolicy）
// 外へ出るときは、行き先の host と全体を見せて確かめる（https: の普通のリンクは、同じ閲覧のあいだ同じ host に一度同意すれば再び聞かない）。
// 見える字が別の host を名指す・https: でない・ダウンロード・userinfo・punycode の host は、毎回確かめる。http(s)・mailto・tel 以外は開かない。
// 開くのは新しい閲覧文脈（noopener・noreferrer）。授業の窓そのものは移らない。動画・発表者ビューの中の画面・編集のプレビューでは開かない
var EXT = {hosts: new Set(), dlg: null};
var EXT_LP = DECK.LinkPolicy();
function extText(a){ return (a.textContent || "") + " " + (a.getAttribute("aria-label") || a.getAttribute("alt") || ""); }
function extOpen(url){ try { window.open(url, "_blank", EXT_LP.OPEN_FEATURES); } catch (e) {} }
function extClose(el){
  var d = EXT.dlg; if (!d) return;
  EXT.dlg = null;
  if (d.parentNode) d.parentNode.removeChild(d);
  var st = document.getElementById("stage"); if (st) st.inert = d._stageWasInert === true;
  var f = d._from;
  if (f && f.isConnected && f.focus) try { f.focus({preventScroll: true}); } catch (e) {}
}
// 確認の箱。opts = {title, host, url, notes: [文], open: 開く処理 | null（なければ「閉じる」だけ）, from: 戻すフォーカス}
function extDialog(opts){
  extClose();
  var d = document.createElement("div"); d.id = "deck-extlink"; d.setAttribute("role", "alertdialog"); d.setAttribute("aria-modal", "true");
  var box = document.createElement("div"); box.className = "box"; d.appendChild(box);
  function add(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; box.appendChild(e); return e; }
  var h = add("h2", "t", opts.title); h.id = "deck-extlink-t"; d.setAttribute("aria-labelledby", h.id);
  if (opts.host) add("p", "host", opts.host);
  if (opts.url) add("p", "url", opts.url);
  var nid = "deck-extlink-n";
  if (opts.notes.length){ var ul = document.createElement("ul"); ul.id = nid; opts.notes.forEach(function(n){ var li = document.createElement("li"); li.textContent = n; ul.appendChild(li); }); box.appendChild(ul); d.setAttribute("aria-describedby", nid); }
  var row = document.createElement("div"); row.className = "row"; box.appendChild(row);
  function btn(label, cls, fn){ var b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.addEventListener("click", function(ev){ ev.preventDefault(); fn(); }); row.appendChild(b); return b; }
  var first = btn(opts.open ? L10N("やめる", "Cancel") : L10N("閉じる", "Close"), "cancel", function(){ extClose(); });
  if (opts.open) btn(L10N("開く（新しいタブ）", "Open (new tab)"), "go", function(){ var f = opts.open; extClose(); f(); });
  d._from = opts.from || null;
  var st = document.getElementById("stage"); d._stageWasInert = !!(st && st.inert); if (st) st.inert = true;
  // 箱の中のキー・ポインターは授業に届かせない（スライドは進まない）。Tab は箱の中で回し、Esc でやめる
  d.addEventListener("keydown", function(ev){
    ev.stopPropagation();
    if (ev.key === "Escape"){ ev.preventDefault(); extClose(); return; }
    if (ev.key === "Tab"){
      var bs = d.querySelectorAll("button"), a0 = bs[0], z = bs[bs.length - 1];
      if (ev.shiftKey && document.activeElement === a0){ ev.preventDefault(); z.focus(); }
      else if (!ev.shiftKey && document.activeElement === z){ ev.preventDefault(); a0.focus(); }
    }
  });
  ["keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend", "wheel", "contextmenu"].forEach(function(n){ d.addEventListener(n, function(ev){ ev.stopPropagation(); }); });
  d.addEventListener("click", function(ev){ if (ev.target === d) extClose(); });   // 外側を押すと「やめる」（開くことにはならない）
  document.body.appendChild(d);
  EXT.dlg = d;
  first.focus();   // 既定の焦点は「やめる」（Enter や Space の押しすぎで開かない）
}
var EXT_WHY = {
  mismatch: ["リンクの字が、行き先と別のサイトを名指しています", "The link text names a different site than where it goes"],
  insecure: ["https: ではない行き先です（通信が守られません）", "The destination is not https: (the connection is not protected)"],
  local: ["このファイルの隣のファイルを開きます", "Opens a file next to this one on this computer"],
  download: ["ファイルをダウンロードします", "It downloads a file"],
  userinfo: ["行き先のアドレスに、ユーザー名やパスワードの形の部分があります", "The address contains a user name or password part"],
  punycode: ["サイト名に、見た目の似た別の文字が使われているかもしれません", "The site name may use look-alike characters"]
};
function extLink(a){
  if (DECK.mode === "video" || DECK.view) return;   // 動画・発表者ビューの中の画面：開かない
  var d = EXT_LP.decide({href: a.getAttribute("href"), text: extText(a), download: a.hasAttribute("download")}, {base: location.href, hosts: EXT.hosts});
  var from = a;
  if (d.verdict === "refuse"){
    extDialog({title: L10N("このリンクは開けません", "This link cannot be opened"), host: "", url: String(a.getAttribute("href") || "").slice(0, 300),
      notes: [d.reason === "scheme" ? L10N("http(s)・mailto・tel 以外のリンクは開きません", "Only http(s), mailto and tel links are opened") : L10N("アドレスとして読めません", "It is not a valid address")], open: null, from: from});
    return;
  }
  if (window.DECK_DEV){   // 編集のプレビュー：授業の絵は作者のコードが描ける。外へは出ず、ここでは確かめもしない（書き出したデッキで確かめる）
    extDialog({title: L10N("プレビューでは外のページを開きません", "The preview does not open outside pages"), host: d.host, url: d.url,
      notes: [L10N("書き出したデッキ・1 ファイルで開くと、行き先を確かめてから開きます", "In the built deck or single file, it asks before opening")], open: null, from: from});
    return;
  }
  if (d.verdict === "open"){ extOpen(d.url); return; }
  var notes = d.reasons.map(function(r){ return L10N(EXT_WHY[r][0], EXT_WHY[r][1]); });
  var ttl = d.must ? L10N("このリンクを開いてよいか確かめてください", "Check before opening this link") : L10N("授業の外のページを開きます", "This opens a page outside the lesson");
  extDialog({title: ttl, host: d.host || d.scheme + ":", url: d.url, notes: notes, from: from,
    open: function(){ EXT_LP.remember(EXT.hosts, d); extOpen(d.url); }});
}
DECK.extLink = function(href, text, download){ var a = document.createElement("a"); a.setAttribute("href", href); a.textContent = text || ""; if (download) a.setAttribute("download", ""); extLink(a); };
function linkOf(e){
  var a = e.target && e.target.closest && e.target.closest("a[href],area[href]");
  if (a) return a;
  var p = e.composedPath ? e.composedPath() : [];   // 部品の影の木の中のリンク
  for (var i = 0; i < p.length; i++) if (p[i] && p[i].nodeType === 1 && (p[i].localName === "a" || p[i].localName === "area") && p[i].hasAttribute("href")) return p[i];
  return null;
}
document.addEventListener("click", function(e){
  if (e.defaultPrevented) return;
  var a = linkOf(e);
  if (!a || a.__egaOwn) return;            // __egaOwn：再生器自身が作ったリンク（添付の保存。kit/tools.js）。授業の HTML は JS の印を付けられない
  var f = inDocFragment(a);
  if (f === null){ e.preventDefault(); extLink(a); return; }   // 授業の外：新しい窓は開かず、確かめてから（修飾キーでも同じ）
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !slides.length) return;
  e.preventDefault();                     // # で要素の位置へ動かさない（舞台がずれる）
  if (DECK.mode === "video" || !f) return;
  var r = resolveFragment(f);
  if (r.error){ console.warn("deck.js: link #" + f + ": " + r.error); return; }
  // マウスで押したリンクにはフォーカスを残さない（戻ったときにフォーカスの枠が出ない）。キーボード（detail = 0）なら戻るときに戻す
  if (e.detail !== 0) try { a.blur(); } catch (err) {}
  followLink(r, {el: a, keyboard: e.detail === 0});
});
// 中ボタン：ブラウザの標準では確かめずに新しいタブが開く
document.addEventListener("auxclick", function(e){
  if (e.button !== 1) return;
  var a = linkOf(e);
  if (!a || inDocFragment(a) !== null) return;
  e.preventDefault(); extLink(a);
});
// 戻るボタン：リンクで来たときだけ、左上に小さく出す（動画・印刷・発表者ビューの中の画面では作らない）
function syncBack(){
  if (DECK.mode === "video" || DECK.view) return;
  var t = POS.top();
  if (!t){ if (LINKS.btn) LINKS.btn.hidden = true; return; }
  if (!LINKS.btn){
    var b = LINKS.btn = document.createElement("button");
    b.type = "button"; b.id = "deck-back";
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5M5.4 8H13"/></svg><span class="lab"></span><span class="to"></span><kbd aria-hidden="true">⌫</kbd>';
    b.addEventListener("click", function(ev){ ev.preventDefault(); ev.stopPropagation(); back(); if (ev.detail !== 0) b.blur(); });
    ["pointerdown", "mousedown"].forEach(function(n){ b.addEventListener(n, function(ev){ ev.stopPropagation(); }); });
    document.body.appendChild(b);
  }
  var to = titleOf(slides[t.i]);
  LINKS.btn.querySelector(".lab").textContent = L10N("戻る", "Back");
  LINKS.btn.querySelector(".to").textContent = to;
  LINKS.btn.title = L10N("戻る：", "Back to ") + to + L10N("（Backspace / Alt+←）", " (Backspace / Alt+←)");
  LINKS.btn.setAttribute("aria-label", L10N("戻る：", "Back to ") + to);
  LINKS.btn.setAttribute("aria-keyshortcuts", "Backspace Alt+ArrowLeft");
  LINKS.btn.hidden = false;
}

// ---------------------------------------------------------------- 起動
function fit(){
  var k = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  var st = document.getElementById("stage");
  if (st) st.style.transform = "translate(-50%,-50%) scale(" + k + ")";
}
function init(){
  if (Q.get("presenter") && DECK.presenterView){ DECK.presenterView(); return; }
  slides = [].slice.call(document.querySelectorAll("#stage > .slide"));
  var mainEnd = slides.findIndex(function(s){ return s.classList.contains("sec") && s.classList.contains("appendix"); });
  if (mainEnd < 0) mainEnd = slides.findIndex(function(s){ return s.classList.contains("sec") && /付録|Appendix/i.test(s.textContent); });
  if (mainEnd < 0) mainEnd = slides.length;
  slides.forEach(function(s, i){ setupSlide(s, i, mainEnd); });
  // モーフで動く要素は transform が効くように inline-block にしておく（測る前から同じ配置にするため、初めに）
  slides.forEach(function(s){
    if (s._morph === null) return;
    [].forEach.call(s.querySelectorAll("[data-id]"), function(e){ if (!e.closest("svg") && getComputedStyle(e).display === "inline") e.style.display = "inline-block"; });
  });
  document.documentElement.setAttribute("data-mode", DECK.mode);
  slides.forEach(function(s, i){
    s._comps.forEach(function(c){
      try { c.mount({mode: DECK.mode, slide: s, deck: DECK}); }
      catch (e) { compFail(c, s, i, {kind: "exception", msg: errText(e)}, "mount"); c.mount(); }
    });
  });
  DECK.slides = slides;
  setupA11y();
  if (CAP.on) setCaptions(true);
  fit();
  if (DECK.view) document.documentElement.classList.add("embedded");
  // 開いたときの位置：#N（番号、範囲の外は端へ）、#<スライドの id>、#<id>:<段階の鍵>（format spec §9.1A）
  var hs = (location.hash || "").slice(1), h0 = /^[0-9]+$/.test(hs) ? {i: Math.max(1, +hs) - 1, k: 0} : hs ? resolveFragment(hs) : {i: 0, k: 0};
  if (h0.error){ console.warn("deck.js: #" + hs + ": " + h0.error); h0 = {i: 0, k: 0}; }
  POS.setCause("seek"); go(h0.i, h0.k, false); POS.setCause(null);
  DECK.ready = true;
  document.dispatchEvent(new CustomEvent("deck:ready"));
}

var buf = "";
document.addEventListener("keydown", function(e){
  if (DECK.view || !slides.length) return;
  if (e.target && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
  // 戻る（リンクの前の位置へ）：Backspace（ペンのときは tools.js が書き込みを消すのに使う）か Alt+←
  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && ((e.key === "Backspace" && !e.altKey) || (e.key === "ArrowLeft" && e.altKey))){
    if (back()) e.preventDefault();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  var k = e.key, j = document.getElementById("jump");
  // フォーカスのあるボタンやリンクは、Enter と Space でそれ自身を押す（送りに使わない）
  if ((k === "Enter" || k === " ") && !buf && e.target && e.target.closest && e.target.closest("button, a[href], [role=button]")) return;
  if (/^[0-9]$/.test(k)){ buf += k; if (j) j.textContent = buf; return; }
  if (k === "Enter" && buf){ stopAuto(); go(parseInt(buf, 10) - 1, 0, false); buf = ""; if (j) j.textContent = ""; return; }
  buf = ""; if (j) j.textContent = "";
  var nav = true;
  if ((k === "ArrowRight" || k === "ArrowDown") && e.shiftKey) go(POS.i + 1, 0, false);
  else if ((k === "ArrowLeft" || k === "ArrowUp") && e.shiftKey) go(POS.i - 1, 0, false);
  else if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown") next();
  else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp") prev();
  else if (k === "Home") go(0, 0, false);
  else if (k === "End") go(slides.length - 1, 0, false);
  else nav = false;
  if (nav){ e.preventDefault(); stopAuto(); return; }
  if (k === "f"){ if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if (k === "p") openPresenter();
  else if (k === "a") DECK.autoplay();
  else if (k === "l"){ DECK.mode = DECK.mode === "lecture" ? "talk" : "lecture"; document.documentElement.setAttribute("data-mode", DECK.mode); seek(POS.i, POS.k, Infinity); }
  else if (k === "b") document.documentElement.classList.toggle("blackout");
  else if (k === "s") setCaptions();
  else if (k === "S") capSize();
});

// 印刷（PDF 化）では、すべての段階を出した最終状態にする
var printPos = null;
window.addEventListener("beforeprint", function(){
  stopLoop(); printPos = {i: POS.i, k: POS.k};
  slides.forEach(function(s, i){ seek(i, s._max, Infinity); });
  document.documentElement.classList.add("printing");
});
window.addEventListener("afterprint", function(){
  document.documentElement.classList.remove("printing");
  if (printPos) seek(printPos.i, printPos.k, Infinity);
});
window.addEventListener("resize", function(){ fit(); morphCache = {}; });
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", function(){ morphCache = {}; });
// 手で書き換えた #（番号・スライドの id・id:段階）へ。リンクの「戻る」の履歴とは別（popstate が先に位置を戻すので、ここでは動かない）
window.addEventListener("hashchange", function(){
  if (!slides.length) return;
  var hs = location.hash.slice(1), r = /^[0-9]+$/.test(hs) ? {i: +hs - 1, k: 0, legacy: true} : resolveFragment(hs);
  if (r.error || r.i < 0) return;
  if (r.i !== POS.i || (!r.legacy && r.k !== POS.k)) go(r.i, r.k, false);
});
// 部品のスクリプトは deck.js の後に読まれるので、load まで待つ
if (document.readyState === "complete") setTimeout(init, 0); else window.addEventListener("load", init);
})();
