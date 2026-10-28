// shape 1.0.0: the data-shape checker of Egatari components 2.0 (a library part, Egatari spec §6.1 "Data shapes": a part
// checks its own data against its declared shape and reports a mismatch with ctx.report; players do not validate it).
// base requires it (base.MotionElement checks a part's data before mount); it requires nothing and touches no DOM.
// It returns {check, describe, gotOf, typeOf, dataLike, near, brief}.
//
// Provenance: copied verbatim from Egatari Studio's kit/shape.js (https://github.com/egatari/egatari-studio, commit
// 03eaf0607598b993eb020f8e619caa53526bc771, DECK.shape there), MIT License, Copyright (c) 2026 Gendo Kumoi, the same owner
// and licence as this repository; only the wrapper changed (the define call instead of the DECK global).
// tools/test-part-shape.mjs compares it with the pinned Studio's DECK.shape. The original header follows.
// 部品のデータの形（static shape）を確かめる小さな検査器。組み立てが実行系（deck.js）の前に入れ、DECK.shape になる。
// Node からは vm で読む（tools/make-llm-guide.mjs が指示の部品の一覧に形を書く。tools/test-components.mjs）。依存はない
//
//   形（static shape）は JSON Schema の小さな部分集合と、部品の中身の種類：
//     {type: "array" | "object" | "string" | "number" | "integer" | "boolean" | [それらの組], items, minItems, maxItems,
//      properties: {名前: 形}, required: [名前…], anyOf: [{required: [名前…]}…]（どれか 1 つの組があればよい）, enum: [値…],
//      additionalProperties: false（知らない欄を違いとする）}
//     部品の宣言：static shape = {schema: 形, example: 見本の値}（子の <script type="application/json"> の中身）、
//                 {text: true, example: "見本の文字"}（要素の中の文字で書く部品）、{links: true, example: "<a href=…>…</a>"}（子の <a href>）
//     属性の形：static props の json の値に shape: 形
//   check(schema, value) → null | {path, why, expected, got, key?}
//     path：違うところ（"groups[0].value"。全体は ""）、why：type | required | anyOf | enum | minItems | maxItems | unknown
//     expected：期待する形の短い言葉（describe）、got：実際の値の種類（gotOf）
//   describe(schema, depth) → "[{label?: string, f?: string, …}, …]" のような短い書き方
//   brief(schema) → 指示の部品の一覧に書く短い形（欄の名前だけ）
//   gotOf(value) → "object {lines}"・"string \"1.2\""・"array (3)" など
egatariParts.define({name: "shape", version: "1.0.0", requires: {}}, function(){
"use strict";
function typeOf(v){
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return isFinite(v) ? (Math.floor(v) === v ? "integer" : "number") : "NaN";
  return typeof v;
}
function typeOk(t, v){
  var a = typeOf(v);
  if (t === "number") return a === "number" || a === "integer";
  return a === t;
}
function short(v){
  var s = JSON.stringify(v);
  if (s === undefined) s = String(v);
  return s.length > 24 ? s.slice(0, 23) + "…" : s;
}
function gotOf(v){
  var t = typeOf(v);
  if (t === "object"){ var k = Object.keys(v); return "object {" + (k.length > 4 ? k.slice(0, 4).join(", ") + ", …" : k.join(", ")) + "}"; }
  if (t === "array") return "array (" + v.length + ")";
  if (t === "string") return "string " + short(v);
  if (t === "integer" || t === "number") return "number " + v;
  if (t === "undefined") return "nothing";
  return t + (t === "boolean" ? " " + v : "");
}
function keyName(k){ return /^[A-Za-z_$][\w$-]*$/.test(k) ? k : JSON.stringify(k); }
function describe(s, depth){
  if (!s) return "any";
  if (depth === undefined) depth = 3;
  if (s.enum) return s.enum.map(function(x){ return JSON.stringify(x); }).join(" | ");
  var types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  var parts = types.map(function(t){
    if (t === "array"){
      if (s.items && s.minItems && s.minItems === s.maxItems && s.minItems <= 4){
        var one = describe(s.items, depth - 1), a = [];
        for (var i = 0; i < s.minItems; i++) a.push(one);
        return "[" + a.join(", ") + "]";
      }
      return "[" + (s.items ? describe(s.items, depth - 1) : "any") + ", …]";
    }
    if (t === "object"){
      var P = s.properties || {}, names = Object.keys(P);
      if (!names.length) return "{…}";
      if (depth <= 0) return "{" + names.slice(0, 4).map(function(n){ return keyName(n) + (req(s, n) ? "" : "?"); }).join(", ") + (names.length > 4 ? ", …" : "") + "}";
      var body = names.map(function(n){ return keyName(n) + (req(s, n) ? "" : "?") + ": " + describe(P[n], depth - 1); }).join(", ");
      var any = s.anyOf ? " (" + s.anyOf.map(function(x){ return (x.required || []).join(" + "); }).join(" or ") + ")" : "";
      return "{" + body + "}" + any;
    }
    return t === "integer" ? "integer" : t;
  });
  return parts.join(" | ") || "any";
}
// 書き間違いらしい欄の名前に近い欄（fn → f、value → values、lable → label）。なければ null
function near(k, names){
  var a = String(k).toLowerCase(), best = null, bd = 3;
  names.forEach(function(n){
    var b = n.toLowerCase(), d = lev(a, b);
    if (a.length > 1 && (b.indexOf(a) === 0 || a.indexOf(b) === 0)) d = Math.min(d, 1);
    if (d < bd){ bd = d; best = n; }
  });
  return bd <= (Math.min(a.length, 6) >= 4 ? 2 : 1) ? best : null;
}
function lev(a, b){
  var p = [], i, j;
  for (j = 0; j <= b.length; j++) p[j] = j;
  for (i = 1; i <= a.length; i++){
    var q = [i];
    for (j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = q;
  }
  return p[b.length];
}
// 指示の部品の一覧に書く短い形：欄の名前と、配列・object の中だけ（"{groups: [{label?, value?} (value or values), …], max?}"）
function brief(s){
  if (!s) return "any";
  if (s.enum) return describe(s);
  var types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if (types.length === 1 && types[0] === "array"){
    if (s.items && s.minItems && s.minItems === s.maxItems) return describe(s, 2);
    return "[" + (s.items ? brief(s.items) : "any") + ", …]";
  }
  if (types.length === 1 && types[0] === "object" && s.properties){
    var P = s.properties;
    var body = Object.keys(P).map(function(n){
      var t = Array.isArray(P[n].type) ? P[n].type : [P[n].type];
      var deep = t.length === 1 && ((t[0] === "array" && P[n].items && (P[n].items.properties || P[n].items.type === "array")) || (t[0] === "object" && P[n].properties));
      return keyName(n) + (req(s, n) ? "" : "?") + (deep ? ": " + brief(P[n]) : "");
    }).join(", ");
    return "{" + body + "}" + (s.anyOf ? " (" + s.anyOf.map(function(x){ return (x.required || []).join(" + "); }).join(" or ") + ")" : "");
  }
  return describe(s, 1);
}
function req(s, n){ return (s.required || []).indexOf(n) >= 0; }
function at(path, k){ return typeof k === "number" ? path + "[" + k + "]" : (path ? path + "." : "") + k; }
function check(s, v, path){
  path = path || "";
  if (!s) return null;
  if (s.enum){
    if (s.enum.indexOf(v) < 0) return {path: path, why: "enum", expected: describe(s, 1), got: gotOf(v)};
    return null;
  }
  var types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if (types.length && !types.some(function(t){ return typeOk(t, v); })) return {path: path, why: "type", expected: describe(s, 1), got: gotOf(v)};
  var t = typeOf(v), e, i;
  if (t === "array"){
    if (s.minItems && v.length < s.minItems) return {path: path, why: "minItems", expected: describe(s, 1), got: gotOf(v), n: s.minItems};
    if (s.maxItems && v.length > s.maxItems) return {path: path, why: "maxItems", expected: describe(s, 1), got: gotOf(v), n: s.maxItems};
    if (s.items) for (i = 0; i < v.length; i++) if ((e = check(s.items, v[i], at(path, i)))) return e;
  }
  if (t === "object"){
    var P = s.properties || {};
    for (i = 0; i < (s.required || []).length; i++){
      var r = s.required[i];
      if (!Object.prototype.hasOwnProperty.call(v, r)) return {path: at(path, r), why: "required", key: r, expected: describe(P[r], 1), got: "nothing", parent: gotOf(v)};
    }
    // 知らない欄（additionalProperties: false）は anyOf より先に見る（{"fn": …} は「f か pts がない」より「fn は欄でない（f のこと？）」）
    if (s.additionalProperties === false){
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && !Object.prototype.hasOwnProperty.call(P, k)){
        return {path: at(path, k), why: "unknown", key: k, near: near(k, Object.keys(P)), expected: Object.keys(P).join(", "), got: gotOf(v[k])};
      }
    }
    if (s.anyOf && !s.anyOf.some(function(x){ return (x.required || []).every(function(n){ return Object.prototype.hasOwnProperty.call(v, n); }); })){
      return {path: path, why: "anyOf", expected: s.anyOf.map(function(x){ return (x.required || []).join(" + "); }).join(" or "), got: gotOf(v)};
    }
    for (var n in P) if (Object.prototype.hasOwnProperty.call(v, n) && (e = check(P[n], v[n], at(path, n)))) return e;
  }
  return null;
}
// 部品の例外の言葉が「データの形が違う」ときによく出るものか（S.map is not a function、Cannot read properties of undefined など）
function dataLike(msg){
  return /is not a function|is not iterable|Cannot read propert|Cannot convert undefined or null|undefined is not an object|null is not an object|is not defined|reduce of empty array|Invalid array length/i.test(String(msg || ""));
}
var api = {check: check, describe: describe, gotOf: gotOf, typeOf: typeOf, dataLike: dataLike, near: near, brief: brief};
return api;
});
