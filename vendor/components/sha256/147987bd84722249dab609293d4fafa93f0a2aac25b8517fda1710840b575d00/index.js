// base 1.0.0: the shared base class and helpers of Egatari components 2.0 (a library part, Egatari spec §6.1).
// Element parts require it ({base: "1.2.0"}) and receive what this factory returns:
//   {MotionElement, el, lerp, prog, clamp, mtext, variant, previewOpacity}
// It uses no import, no network and no global of the player (spec §6.1): only the DOM, getComputedStyle and console.
// It requires shape (the data-shape checker): MotionElement checks the part's data against its declared shape before the
// part counts its steps or mounts (spec §6.1 "Data shapes"; players no longer do). The dependency runs base → shape only:
// shape is pure and needs nothing from base, so there is no cycle.
//
// Provenance: MotionElement, el, mtext, lerp, prog and clamp (with the private ease and stepInt) are copied from
// Egatari Studio's kit/deck.js (https://github.com/egatari/egatari-studio, commit 03eaf0607598b993eb020f8e619caa53526bc771,
// where they are DECK.MotionElement, DECK.el, DECK.mtext, DECK.lerp, DECK.prog and DECK.clamp01), MIT License,
// Copyright (c) 2026 Gendo Kumoi, the same owner and licence as this repository. They are kept as close to that code as
// possible so that a part moved from DECK to base draws the same DOM (tools/test-base.mjs compares them with the pinned
// Studio's DECK). variant is tools/variant.js's VARIANT.of, taking the names instead of looking the tag up again;
// previewOpacity is the --preview-opacity read the parts used to write themselves. The data check (compText, compProblem,
// compSummary, compPlaceholder) is deck.js's, with DECK.shape → the shape part and DECK.ja → ctx.lang. Differences: base's
// own warnings start "[base] " (deck.js: "deck.js: ", "[deck] "), and a data problem is reported with a spec §8.4 code
// (reportCode) and the part's "[<name>] " prefix.
egatariParts.define({name: "base", version: "1.2.0", requires: {shape: "1.0.0"}}, function(deps){
"use strict";
var NS = "http://www.w3.org/2000/svg";
var SH = deps.shape;

// ---------------------------------------------------------------- 時間の部品 (kit/deck.js)
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function ease(x){ x = clamp01(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
// t 秒のときの、start から dur 秒かける動きの進み具合（0〜1、イージング付き）
function prog(t, start, dur){ if (t === Infinity) return 1; if (dur <= 0) return t >= start ? 1 : 0; return ease((t - start) / dur); }
function lerp(a, b, e){ return a + (b - a) * e; }
// 段階の番号（steps / data-from）：有限の整数で min 以上。そうでなければ警告して null
function stepInt(v, what, min){
  if (v === null || v === undefined) return null;
  var n = typeof v === "number" ? v : String(v).trim() === "" ? NaN : +v;
  if (!isFinite(n) || n !== Math.floor(n) || n < (min || 0)){ console.warn("[base] " + what + "=" + JSON.stringify(v) + " は 0 以上の整数でないので無視 / ignored (not a non-negative integer)"); return null; }
  return n;
}

// ---------------------------------------------------------------- SVG の部品 (kit/deck.js)
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
// SVG の中の簡単な数式記法：*..* は斜体、_x は下付き、^x は上付き（本格的な式は組み立てのときに描く。spec §6.2）
function mtext(parent, x, y, str, attrs){
  var t = el("text", Object.assign({x: x, y: y, "font-size": 24}, attrs || {}), parent);
  // 下付き・上付きは本文の 3/4、ただし 24px より小さくしない（図の字は 24px 以上。1.0.0 は 17px だった）。ずらしは字の大きさの
  // −0.25em・+0.45em（sub・super の語は字によってずれが違い、Source Sans 3 では下に 17px 近く落ちる）
  var subSize = Math.max(24, Math.round((+t.getAttribute("font-size") || 24) * 0.75));
  marks(str).forEach(function(m){
    var s = el("tspan", m.shift ? {"baseline-shift": m.shift === "sub" ? "-0.25em" : "0.45em", "font-size": String(subSize)} : {}, t);
    if (m.it){ s.setAttribute("font-style", "italic"); s.setAttribute("class", "mi"); }
    s.textContent = m.text;
  });
  return t;
}
// mtext の記法を区切る（1.2.0）。* は対になるときだけ斜体：開く * の直後と閉じる * の直前が空白でなく、間に字があるとき
// （markdown と同じ）。「A* 探索」「5*3」「注*」の * はそのまま。\* \_ \^ はその字そのもの。_x・^x は次の 1 字を下付き・上付きに
function marks(str){
  var out = [], it = false, buf = "", i = 0;
  str = String(str == null ? "" : str);
  function flush(shift){ if (buf){ out.push({text: buf, it: it, shift: shift || null}); buf = ""; } }
  function closer(from){
    for (var j = from; j < str.length; j++){
      if (str[j] === "\\"){ j++; continue; }
      if (str[j] === "*" && !/\s/.test(str[j - 1])) return true;
    }
    return false;
  }
  while (i < str.length){
    var c = str[i];
    if (c === "\\" && i + 1 < str.length && "*_^\\".includes(str[i + 1])){ buf += str[i + 1]; i += 2; }
    else if (c === "*" && (it ? !/\s/.test(str[i - 1]) : i + 1 < str.length && !/[\s*]/.test(str[i + 1]) && closer(i + 2))){ flush(); it = !it; i++; }
    else if ((c === "_" || c === "^") && i + 1 < str.length){
      flush(); buf = str[i + 1]; flush(c === "_" ? "sub" : "sup");
      i += 2;
    } else { buf += c; i++; }
  }
  flush();
  return out;
}

// 字の幅の見積もり（px）。テーマの字で 1 字ずつ測った幅（em）を、字の種類ごとに表にした（2026-11 測定、普通と太字で同じ）。
// 字の種類：数字・英小文字・英大文字・空白・. , : ;・( ) [ ]・+ − × =・% # & / ?・ひらがな・カタカナ・、。（）・「」・ほかのラテン文字・ほか（漢字ほか 1）
var TW_CLASS = [/[0-9]/, /[a-z]/, /[A-Z]/, / /, /[.,:;'"!|]/, /[()[\]{}]/, /[+\-\u2212\u00d7\u00f7=<>\u00b1~]/, /[%#&@$\/?]/,
  /[\u3040-\u309f]/, /[\u30a0-\u30ff]/, /[\u3001\u3002\uff08\uff09\u30fb\u300c\u300d]/, /[\u0000-\u024f]/];
var TW_FONT = {
  "biz udpgothic": [0.75, 0.62, 0.76, 0.3, 0.31, 0.5, 0.84, 0.75, 0.97, 0.93, 0.6, 0.62],
  "biz udpmincho": [0.67, 0.6, 0.76, 0.3, 0.33, 0.49, 0.84, 0.75, 0.94, 0.9, 0.6, 0.6],
  "source sans 3": [0.5, 0.48, 0.57, 0.22, 0.25, 0.31, 0.5, 0.6, 1, 1, 0.7, 0.5]
};
// 知らない字（テーマが別の字を名前で指すときなど）：表の中でいちばん広い幅（はみ出さない側に見積もる）
var TW_WIDE = TW_CLASS.map(function(_, i){ return Math.max.apply(null, Object.keys(TW_FONT).map(function(f){ return TW_FONT[f][i]; })); });
function twTable(font){
  if (font && font.nodeType === 1) font = getComputedStyle(font).fontFamily;
  var first = String(font || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  return TW_FONT[first] || TW_WIDE;
}
// textWidth(文字列, 大きさ, {font: 要素か font-family, mark: true で mtext の *_^ を数えない})
function textWidth(str, size, opts){
  opts = opts || {};
  var s = String(str == null ? "" : str), tb = twTable(opts.font), w = 0;
  if (opts.mark) s = marks(s).map(function(m){ return m.text; }).join("");
  for (var ch of s){ var e = 1; for (var i = 0; i < TW_CLASS.length; i++) if (TW_CLASS[i].test(ch)){ e = tb[i]; break; } w += e; }
  return w * (size || 24);
}

// ---------------------------------------------------------------- 部品のデータの形 (kit/deck.js; spec §6.1 Data shapes)
// static shape（形は shape パーツが確かめる）と、static props の json の値の shape。違えば知らせの札を出し、描かない
function compText(c){
  var t = "";
  [].forEach.call(c.childNodes, function(n){ if (!(n.nodeType === 1 && n.localName === "script")) t += n.textContent; });
  return t.trim();
}
function compProblem(c){
  var C = c.constructor, decl = C.props || {}, sh = C.shape;
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
// The ctx.report code of a data problem (spec §8.4 vocabulary): an attribute value (attr, attrJson) → attr, anything else
// about the element's data (shape, missing, json, notText, empty, notLinks, noLinks) → data. The problem's own kind stays in
// the message: "[<name>] data (<kind>): <summary>"
function reportCode(kind){ return kind === "attr" || kind === "attrJson" ? "attr" : "data"; }
function compPlaceholder(c, r, ja){
  [].slice.call(c.childNodes).forEach(function(n){ if (!(n.nodeType === 1 && n.localName === "script")) c.removeChild(n); });
  var box = document.createElement("div");
  box.className = "m-error"; box.setAttribute("role", "note");
  box.textContent = "<" + r.tag + "> " + (ja ? "のデータの形が違う：" : "data problem: ") + compSummary(r, ja);
  c.appendChild(box);
}

// The element's data problem (compProblem with the record fields deck.js's compFail added), checked once, or null
function dataProblem(e){
  if (e._shapeDone) return e._shapeProblem;
  e._shapeDone = true;
  var p = compProblem(e);
  if (p){
    var sh = e.constructor.shape || {};
    p = Object.assign({tag: e.tagName.toLowerCase(), label: e.getAttribute("aria-label") || "", phase: "data"}, p);
    if (sh.schema && p.shape === undefined) p.shape = SH.brief(sh.schema);
    if (sh.example !== undefined && p.example === undefined) p.example = typeof sh.example === "string" ? sh.example : JSON.stringify(sh.example);
  }
  return (e._shapeProblem = p || null);
}
function up(e, name){ return Reflect.get(Object.getPrototypeOf(e), name, e); }

// ---------------------------------------------------------------- containment (spec §6.1 Containment)
// An exception thrown by the part while the player calls it (steps, mount, render, layout; also duration and cues) does not
// escape: the first one is kept as the instance's fault, reported once through ctx.report("error", "[<name>] <phase>: <error>")
// as soon as a ctx is at hand (steps, duration and cues get none: it is reported at the next mount, render or layout), and
// the element then shows the .m-error placeholder with its text equivalent (aria-label, else its own text). From then on
// steps is the steps attribute (else 0), and the part is not called again. <name> is the registry name the class declares
// (static partName, = its define meta's name; lint checks it), else the tag without m-, else the whole tag.
function partName(e){
  var n = e.constructor.partName, t = e.tagName.toLowerCase();
  if (typeof n === "string" && n) return n;
  return t.indexOf("m-") === 0 ? t.slice(2) : t;
}
function errText(x){ return x && x.message !== undefined ? (x.name && x.name !== "Error" ? x.name + ": " : "") + x.message : String(x); }
function fallbackSteps(e){ var n = stepInt(e.getAttribute("steps"), e.tagName.toLowerCase() + " steps"); return n !== null ? n : 0; }
function textEquivalent(e){
  var label = e.getAttribute("aria-label");
  if (label && label.trim()) return label.trim();
  var t = compText(e).replace(/\s+/g, " ");
  return t || "<" + e.tagName.toLowerCase() + ">";
}
function fault(e, phase, x, ctx){
  if (!e._fault) e._fault = {phase: phase, msg: errText(x)};
  if (ctx) showFault(e, ctx);
}
function showFault(e, ctx){
  if (e._faultShown) return;
  e._faultShown = true;
  var text = textEquivalent(e);
  try { if (ctx && typeof ctx.report === "function") ctx.report("error", "[" + partName(e) + "] " + e._fault.phase + ": " + e._fault.msg); } catch (x) { /* a player's report must not undo containment */ }
  [].slice.call(e.childNodes).forEach(function(n){ if (!(n.nodeType === 1 && n.localName === "script")) e.removeChild(n); });
  var box = document.createElement("div");
  box.className = "m-error"; box.setAttribute("role", "note"); box.setAttribute("data-part-failure", "error");
  box.textContent = text;
  e.appendChild(box);
}
// Installed on every instance (own properties, so they come before the part's own steps, mount, render, duration, cues,
// layout): with data that fits, they pass to the part inside try/catch (containment, above); otherwise steps is the
// attribute steps (else 0), mount reports the problem once through ctx.report(reportCode(kind), "[<name>] data (<kind>): …") and shows the placeholder
// (like deck.js), and the rest draws nothing
function guard(e){
  Object.defineProperty(e, "steps", {configurable: true, get: function(){
    if (dataProblem(e) || e._fault) return fallbackSteps(e);
    try { return up(e, "steps"); } catch (x) { fault(e, "steps", x, null); return fallbackSteps(e); }
  }});
  e.mount = function(ctx){
    var p = dataProblem(e);
    if (!p){
      if (e._fault) return showFault(e, ctx);
      try { return up(e, "mount").call(e, ctx); } catch (x) { fault(e, "mount", x, ctx); return; }
    }
    if (!e._shapeReported){ e._shapeReported = true; if (ctx && typeof ctx.report === "function") ctx.report(reportCode(p.kind), "[" + partName(e) + "] data (" + p.kind + "): " + compSummary(p, false)); }
    compPlaceholder(e, p, /^ja\b/i.test((ctx && ctx.lang) || "ja"));
  };
  e.render = function(k, t, ctx){
    if (dataProblem(e)) return;
    if (e._fault) return showFault(e, ctx);
    try { return up(e, "render").call(e, k, t, ctx); } catch (x) { fault(e, "render", x, ctx); }
  };
  e.duration = function(k){
    if (dataProblem(e) || e._fault) return 0;
    try { return up(e, "duration").call(e, k); } catch (x) { fault(e, "duration", x, null); return 0; }
  };
  e.cues = function(k){
    if (dataProblem(e) || e._fault) return null;
    try { return up(e, "cues").call(e, k); } catch (x) { fault(e, "cues", x, null); return null; }
  };
  // layout(ctx) is optional (spec §8.4 Layout): wrapped only when the part has one, so that a player sees none otherwise
  if (typeof up(e, "layout") === "function") e.layout = function(ctx){
    if (dataProblem(e)) return;
    if (e._fault) return showFault(e, ctx);
    try { return up(e, "layout").call(e, ctx); } catch (x) { fault(e, "layout", x, ctx); }
  };
}

// ---------------------------------------------------------------- 部品の基底クラス (kit/deck.js)
class MotionElement extends HTMLElement {
  constructor(){ super(); guard(this); }
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
  // 子の <script type="application/json"> の中身。type の前後の空白を除いて大文字小文字を区別せずに application/json、id によらない。
  // 子に 2 つ以上あれば、どれを使うか決められないので使わない（null）
  get data(){
    if (this._data !== undefined) return this._data;
    var c = [].filter.call(this.children, function(x){ return x.localName === "script" && String(x.getAttribute("type") || "").trim().toLowerCase() === "application/json"; });
    if (c.length > 1) console.warn("[base] " + this.tagName.toLowerCase() + ": more than one <script type=\"application/json\"> child (ignored)");
    return (this._data = c.length === 1 ? JSON.parse(c[0].textContent) : null);
  }
  mount(ctx){}
  render(k, t, ctx){}
  duration(k){ return 0; }
  cues(k){ return null; }
}

// ---------------------------------------------------------------- 見せ方 (tools/variant.js VARIANT.of; spec §8.4 Presentation variants)
// The variant is the element's `variant` attribute when it names one of `names`, otherwise the first name. names defaults
// to the class's `static variants`. No seed; an unknown name warns and gives the first.
function variant(e, names){
  var tag = e.tagName.toLowerCase(), v = e.getAttribute("variant");
  if (!names) names = e.constructor.variants || [];
  if (v !== null && names.indexOf(v) >= 0) return v;
  if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
  return names[0] || null;
}

// ---------------------------------------------------------------- 先を薄く見せる濃さ (spec §8.4 Theme colours: --preview-opacity)
// The theme's --preview-opacity as seen from the element (a number in 0…1), or 0.45 when it is not set or not in 0…1
function previewOpacity(e){
  var pv = parseFloat(getComputedStyle(e).getPropertyValue("--preview-opacity"));
  return pv >= 0 && pv <= 1 ? pv : 0.45;
}

// ---------------------------------------------------------------- 色の段階 (spec §8.4 Theme colours: colour ramps --ramp-1 … --ramp-5)
// The colour at t (0…1, clamped) on the theme's ramp: at a stop var(--ramp-k, old), between two stops their color-mix in oklab.
// `old` is the colour the part drew at t before ramps (a CSS colour built from --bg and its role); both sides fall back to
// it, so on a theme without ramps the result is exactly `old` (spec: a component keeps the role it used).
function ramp(t, old){
  t = +t; t = t > 0 ? (t < 1 ? t : 1) : 0;
  var s = t * 4, k = Math.floor(s + 1e-9), f = s - k;
  if (k >= 4) return "var(--ramp-5, " + old + ")";
  if (f < 1e-9) return "var(--ramp-" + (k + 1) + ", " + old + ")";
  return "color-mix(in oklab, var(--ramp-" + (k + 1) + ", " + old + ") " + (100 * (1 - f)).toFixed(1) + "%, var(--ramp-" + (k + 2) + ", " + old + "))";
}
// The theme's five ramp stops as seen from element e (computed strings), or null when any of them is not set
function rampStops(e){
  var cs = getComputedStyle(e), out = [];
  for (var i = 1; i <= 5; i++){ var v = cs.getPropertyValue("--ramp-" + i).trim(); if (!v) return null; out.push(v); }
  return out;
}

return {MotionElement: MotionElement, el: el, lerp: lerp, prog: prog, clamp: clamp01, mtext: mtext, textWidth: textWidth, variant: variant, previewOpacity: previewOpacity, ramp: ramp, rampStops: rampStops};
});
