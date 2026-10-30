// codetree-core 1.0.0: code tables, code trees and decoding for Egatari components 2.0 (a library part, Egatari spec §6.1).
// m-codetree requires it ({"codetree-core": "1.0.0"}) and receives what this factory returns: {normalize, build, decode, runs}
//   normalize(table) → {white: [{code, run}], black: […]}        a table [{run, white, black}] or {"white": {"符号": ラン}, …}
//   build(table) → {white: tree, black: tree}                    the code trees (branch 0 left, 1 right)
//   decode(trees, bits) → {bits, tokens, error, next}             MH decoding: white first, alternating; after a make-up code
//                                                                 the same colour; after EOL white
//   runs(tokens) → [{color, toks, start, len}]                    the decoded pixel runs
// Pure functions (no DOM), no import, no network and no global of the player (spec §6.1). The code is m-codetree 1.13.0's
// (components/codetree/index.js, where it was DECK.codetree), unchanged but for the wrapper; tools/test-codetree.mjs tests
// it through the registry.
egatariParts.define({name: "codetree-core", version: "1.0.0", requires: {}}, function(){
"use strict";

// ---------------------------------------------------------------- 表・木・復号（ブラウザによらない）
var COLORS = ["white", "black"];
function runOf(v, where){
  if (typeof v === "number" && v >= 0 && Math.floor(v) === v) return v;
  var s = String(v).trim();
  if (/^\d+$/.test(s)) return +s;
  if (/^eol$/i.test(s)) return "EOL";
  throw new Error("m-codetree: " + where + " のランの長さ " + JSON.stringify(v) + " は 0 以上の整数か \"EOL\"");
}
function kindOf(run){ return run === "EOL" ? "eol" : run >= 64 ? "makeup" : "term"; }
// 表を {white: [{code, run}], black: […]} にする
function normalize(tab){
  var out = {white: [], black: []};
  if (Array.isArray(tab)) tab.forEach(function(r, i){
    COLORS.forEach(function(c){
      if (r[c] === undefined || r[c] === null || r[c] === "") return;
      out[c].push({code: String(r[c]).replace(/\s+/g, ""), run: runOf(r.run, "table[" + i + "]")});
    });
  });
  else if (tab && typeof tab === "object") COLORS.forEach(function(c){
    var o = tab[c] || {};
    Object.keys(o).forEach(function(code){ out[c].push({code: code.replace(/\s+/g, ""), run: runOf(o[code], c + "." + code)}); });
  });
  else throw new Error("m-codetree: table は配列か {white, black}");
  return out;
}
// 符号の木（2 分木）。節は {code, kids: [0 の子, 1 の子], leaf: {run, kind} | null}。頭が重なる符号は誤り
function buildTree(list, color){
  var root = {code: "", kids: [null, null], leaf: null};
  list.forEach(function(e){
    if (!/^[01]+$/.test(e.code)) throw new Error("m-codetree: " + color + " の符号 " + JSON.stringify(e.code) + " は 0 と 1 だけで書く");
    var n = root;
    for (var i = 0; i < e.code.length; i++){
      if (n.leaf) throw new Error("m-codetree: " + color + " の符号 " + e.code + " の頭が " + n.code + "（ラン " + n.leaf.run + "）と同じ（語頭符号でない）");
      var b = +e.code[i];
      n = n.kids[b] || (n.kids[b] = {code: e.code.slice(0, i + 1), kids: [null, null], leaf: null});
    }
    if (n.leaf || n.kids[0] || n.kids[1]) throw new Error("m-codetree: " + color + " の符号 " + e.code + " がほかの符号と重なる");
    n.leaf = {run: e.run, kind: kindOf(e.run)};
  });
  return root;
}
function build(tab){
  var n = normalize(tab);
  return {white: buildTree(n.white, "white"), black: buildTree(n.black, "black")};
}
// MH の復号：白から始め、木を根からたどって葉に着いたら 1 語。終端符号のあとは反対の色、メイクアップ符号のあとは同じ色、EOL のあとは白。
// error：invalid（表にない枝。pos はその桁）、incomplete（系列が符号の途中で終わる）、dangling（メイクアップ符号の後に終端符号がない）
function decode(trees, bits){
  bits = String(bits || "").replace(/\s+/g, "");
  if (!/^[01]*$/.test(bits)) throw new Error("m-codetree: bits は 0 と 1 だけで書く");
  var color = "white", pos = 0, tokens = [], error = null;
  while (pos < bits.length){
    var n = trees[color], start = pos;
    while (!n.leaf){
      if (pos >= bits.length){ error = {kind: "incomplete", start: start, pos: pos, color: color, code: bits.slice(start)}; break; }
      var nx = n.kids[+bits[pos]];
      if (!nx){ error = {kind: "invalid", start: start, pos: pos, color: color, code: bits.slice(start, pos + 1), at: n.code}; break; }
      n = nx; pos++;
    }
    if (error) break;
    tokens.push({code: n.code, start: start, end: pos, color: color, run: n.leaf.run, kind: n.leaf.kind});
    if (n.leaf.kind === "term") color = color === "white" ? "black" : "white";
    else if (n.leaf.kind === "eol") color = "white";
  }
  if (!error && tokens.length && tokens[tokens.length - 1].kind === "makeup") error = {kind: "dangling", start: pos, pos: pos, color: color, code: ""};
  return {bits: bits, tokens: tokens, error: error, next: color};
}
// 画素のラン：続く同じ色の符号語（メイクアップ＋終端）を 1 つのランにまとめる。EOL は区切り
function runs(tokens){
  var out = [], cur = null, cell = 0;
  tokens.forEach(function(t, i){
    if (t.kind === "eol"){ cur = null; return; }
    if (!cur || cur.color !== t.color){ cur = {color: t.color, toks: [], start: cell, len: 0}; out.push(cur); }
    cur.toks.push(i); cur.len += t.run; cell += t.run;
  });
  return out;
}
return {normalize: normalize, build: build, decode: decode, runs: runs};
});
