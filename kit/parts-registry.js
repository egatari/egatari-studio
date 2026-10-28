// パーツの登録簿（format spec §6.1 Registry。部品庫 2.0 のパーツのためのもの）
// 組み立て（kit/core/build-core.mjs）が、2.0 のパーツより前に 1 回だけ書き込む。同梱の再生器（deck.js）のものではない：
// deck.js がなくても、この登録簿とパーツだけで要素が定義される（Appendix A 1A：再生器はパーツに ctx のほかは何も渡さない）。
// - グローバルは 1 つ：globalThis.egatariParts。パーツが頼ってよいのは define(meta, factory) だけ
// - meta = {name, version, requires?, element?}。requires は {名前: ちょうどの版}（範囲は書かない）
// - factory(deps) を、requires の名前ごとにそのパーツの factory が返した値を入れた object で呼び、返り値を name@version で持つ。
//   返り値は浅く凍らせる（ほかのパーツの返り値を変えてはいけない）。element があれば、返ったクラスをその名前の custom element にする
//   （その名前がもう定義されていれば element の失敗：factory は呼ばない）
// - 失敗はパーツごとに 1 つの理由（reason）で記録する（§6.1 Registry）。そのパーツに頼るパーツも失敗する。ほかのパーツは動く。
//   要素は定義されないので、再生器は最後の状態の絵か字の代わりを出す
//     factory    factory が投げた（factory が関数でない・要素のパーツが HTMLElement のクラスを返さない・meta が形に合わない、も同じ扱い）
//     missing    要るパーツ（requires の name@version）が先に定義されていない
//     dependency 要るパーツが失敗した
//     duplicate  同じ name@version の 2 度目の define（後のものは使わない。最初のものが残る）
//     element    その custom element の名前がもう定義されている（最初のものが残る。1 つのファイルで要素の名前は 1 つ）
// 再生器（deck.js）と道具が読むための口（パーツは使わない。数えない property）：
//   egatariParts.status() → {defined: ["name@version", …], failed: [{name, version, reason}, …]}（どちらも呼ばれた順）
(function(){
"use strict";
if (globalThis.egatariParts) return;   // 2 回書き込まれても、最初のものだけ
var NAME = /^[a-z][a-z0-9-]{0,63}$/;
var VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,31})?(?:\+[0-9A-Za-z.-]{1,32})?$/;
var ELEMENT = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;
var own = function(o, k){ return Object.prototype.hasOwnProperty.call(o, k); };
var parts = Object.create(null);     // "name@version" → {value}
var failed = Object.create(null);    // "name@version" → reason
var defined = [], failures = [];
function str(x){ return typeof x === "string" ? x : String(x); }
function fail(meta, reason, why){
  var name = meta && typeof meta === "object" ? str(meta.name) : "undefined";
  var version = meta && typeof meta === "object" ? str(meta.version) : "undefined";
  if (reason !== "duplicate") failed[name + "@" + version] = reason;
  failures.push({name: name, version: version, reason: reason});
  try { console.warn("[egatariParts] " + name + "@" + version + ": " + reason + (why ? " (" + why + ")" : "")); } catch (e) { /* 知らせに失敗しても続ける */ }
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
  if (p) return fail(meta, "factory", p);
  var id = meta.name + "@" + meta.version;
  if (parts[id] || failed[id]) return fail(meta, "duplicate", id + " is already defined; the first is kept");
  if (meta.element !== undefined && customElements.get(meta.element)) return fail(meta, "element", "<" + meta.element + "> is already defined; the first is kept");
  if (typeof factory !== "function") return fail(meta, "factory", "factory is not a function");
  var deps = Object.create(null), req = meta.requires || {};
  for (var r in req){
    if (!own(req, r)) continue;
    var rid = r + "@" + req[r];
    if (failed[rid]) return fail(meta, "dependency", "requires " + rid + ", which failed");
    if (!parts[rid]) return fail(meta, "missing", "requires " + rid + ", which is not defined before it");
    deps[r] = parts[rid].value;
  }
  var value;
  try { value = factory(Object.freeze(deps)); }
  catch (e) { return fail(meta, "factory", "factory threw: " + (e && e.message !== undefined ? e.message : String(e))); }
  if (meta.element !== undefined){
    if (typeof value !== "function" || !(value.prototype instanceof HTMLElement)) return fail(meta, "factory", "element part did not return a class extending HTMLElement");
    // factory の中で同じ名前が定義された場合も、最初のものを残す
    if (customElements.get(meta.element)) return fail(meta, "element", "<" + meta.element + "> is already defined; the first is kept");
    try { customElements.define(meta.element, value); }
    catch (e) { return fail(meta, "element", "customElements.define threw: " + (e && e.message !== undefined ? e.message : String(e))); }
  }
  if (value !== null && (typeof value === "object" || typeof value === "function")) Object.freeze(value);
  parts[id] = {value: value};
  defined.push(id);
}
function status(){
  return {defined: defined.slice(), failed: failures.map(function(f){ return {name: f.name, version: f.version, reason: f.reason}; })};
}
var reg = {define: define};
Object.defineProperty(reg, "status", {value: status, enumerable: false});
Object.defineProperty(globalThis, "egatariParts", {value: Object.freeze(reg), enumerable: false, configurable: false, writable: false});
})();
