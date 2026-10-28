// パーツの登録簿（format spec §6.1 Registry。部品庫 2.0 のパーツのためのもの）
// 組み立て（kit/core/build-core.mjs）が、2.0 のパーツより前に 1 回だけ書き込む。同梱の再生器（deck.js）のものではない：
// deck.js がなくても、この登録簿とパーツだけで要素が定義される（Appendix A 1A：再生器はパーツに ctx のほかは何も渡さない）。
// - グローバルは 1 つ：globalThis.egatariParts。パーツが頼ってよいのは define(meta, factory) だけ
// - meta = {name, version, requires?, element?}。requires は {名前: ちょうどの版}（範囲は書かない）
// - factory(deps) を、requires の名前ごとにそのパーツの factory が返した値を入れた object で呼び、返り値を name@version で持つ。
//   返り値は浅く凍らせる（ほかのパーツの返り値を変えてはいけない）。element があれば、返ったクラスをその名前の custom element にする
//   （まだ定義されていなければ）
// - 先に書かれていないパーツを要る・要るパーツが失敗した・factory が投げた・meta が形に合わない：そのパーツを失敗として記録し、
//   それに頼るパーツも失敗する。ほかのパーツは動く。要素は定義されないので、再生器は最後の状態の絵か字の代わりを出す
// - 同じ name@version をもう一度 define したら、後のものは使わない（警告）
// 再生器（deck.js）と試験が読むための口（パーツは使わない。数えない property）：
//   egatariParts.status() → {defined: ["name@version", …], elements: {要素の名前: "name@version"}, failures: [{name, version, element, reason}]}
(function(){
"use strict";
if (globalThis.egatariParts) return;   // 2 回書き込まれても、最初のものだけ
var NAME = /^[a-z][a-z0-9-]{0,63}$/;
var VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,31})?(?:\+[0-9A-Za-z.-]{1,32})?$/;
var ELEMENT = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;
var own = function(o, k){ return Object.prototype.hasOwnProperty.call(o, k); };
var parts = Object.create(null);     // "name@version" → {value}
var failed = Object.create(null);    // "name@version" → reason
var failures = [], elements = Object.create(null), order = [];
function fail(meta, reason){
  var name = meta && typeof meta.name === "string" ? meta.name : String(meta && meta.name);
  var version = meta && typeof meta.version === "string" ? meta.version : String(meta && meta.version);
  var element = meta && typeof meta.element === "string" ? meta.element : null;
  failed[name + "@" + version] = reason;
  failures.push({name: name, version: version, element: element, reason: reason});
  try { console.warn("[egatariParts] " + name + "@" + version + ": " + reason); } catch (e) { /* 知らせに失敗しても続ける */ }
}
function metaProblem(meta){
  if (!meta || typeof meta !== "object") return "meta is not an object";
  if (typeof meta.name !== "string" || !NAME.test(meta.name)) return "name is not a part name";
  if (typeof meta.version !== "string" || !VERSION.test(meta.version)) return "version is not an exact version";
  if (meta.requires !== undefined && (meta.requires === null || typeof meta.requires !== "object" || Array.isArray(meta.requires))) return "requires is not an object";
  for (var r in meta.requires || {}){
    if (!own(meta.requires, r)) continue;
    if (!NAME.test(r)) return "requires: " + JSON.stringify(r) + " is not a part name";
    if (typeof meta.requires[r] !== "string" || !VERSION.test(meta.requires[r])) return "requires." + r + " is not an exact version";
  }
  if (meta.element !== undefined && (typeof meta.element !== "string" || !ELEMENT.test(meta.element))) return "element is not a custom element name";
  return null;
}
function define(meta, factory){
  var p = metaProblem(meta);
  if (p) return fail(meta, p);
  var id = meta.name + "@" + meta.version;
  if (parts[id] || failed[id]){ try { console.warn("[egatariParts] " + id + " is defined twice (the first is kept)"); } catch (e) {} return; }
  if (typeof factory !== "function") return fail(meta, "factory is not a function");
  var deps = Object.create(null), req = meta.requires || {};
  for (var r in req){
    if (!own(req, r)) continue;
    var rid = r + "@" + req[r];
    if (failed[rid]) return fail(meta, "requires " + rid + ", which failed");
    if (!parts[rid]) return fail(meta, "requires " + rid + ", which is not defined before it");
    deps[r] = parts[rid].value;
  }
  var value;
  try { value = factory(Object.freeze(deps)); }
  catch (e) { return fail(meta, "factory threw: " + (e && e.message !== undefined ? e.message : String(e))); }
  if (meta.element !== undefined){
    if (typeof value !== "function" || !(value.prototype instanceof HTMLElement)) return fail(meta, "element part did not return a class extending HTMLElement");
  }
  if (value !== null && (typeof value === "object" || typeof value === "function")) Object.freeze(value);
  parts[id] = {value: value};
  order.push(id);
  if (meta.element !== undefined){
    try {
      if (!customElements.get(meta.element)){ customElements.define(meta.element, value); elements[meta.element] = id; }
      else if (customElements.get(meta.element) === value) elements[meta.element] = id;
      else console.warn("[egatariParts] " + id + ": <" + meta.element + "> is already defined (not redefined)");
    } catch (e) {
      delete parts[id]; order.pop();
      return fail(meta, "customElements.define threw: " + (e && e.message !== undefined ? e.message : String(e)));
    }
  }
}
function status(){
  var el = {};
  for (var k in elements) el[k] = elements[k];
  return {defined: order.slice(), elements: el, failures: failures.map(function(f){ return {name: f.name, version: f.version, element: f.element, reason: f.reason}; })};
}
var reg = {define: define};
Object.defineProperty(reg, "status", {value: status, enumerable: false});
Object.defineProperty(globalThis, "egatariParts", {value: Object.freeze(reg), enumerable: false, configurable: false, writable: false});
})();
