// base 1.0.0: the shared base class and helpers of Egatari components 2.0 (a library part, Egatari spec §6.1).
// Element parts require it ({base: "1.0.0"}) and receive what this factory returns:
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
egatariParts.define({name: "base", version: "1.0.0", requires: {shape: "1.0.0"}}, function(deps){
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

return {MotionElement: MotionElement, el: el, lerp: lerp, prog: prog, clamp: clamp01, mtext: mtext, variant: variant, previewOpacity: previewOpacity};
});
