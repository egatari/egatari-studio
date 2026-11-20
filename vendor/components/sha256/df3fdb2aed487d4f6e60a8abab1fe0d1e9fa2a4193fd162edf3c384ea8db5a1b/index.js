// kanbun-core 1.0.0: reading kanbun (classical Chinese with kunten) for Egatari components 2.0 (a library part, Egatari spec §6.1).
// m-kanbun requires it ({"kanbun-core": "1.0.0"}) and receives what this factory returns:
//   {parse, order, charEvents, kakikudashi, stepGroups, hira, yomi}
//   parse(文字列) → {chars, cols, warnings}          白文・返り点・送り仮名・振り仮名の読み取り
//   order(chars) → {units, events, warnings}         訓読の順（返り点・再読文字・置き字）
//   charEvents(o) → [{c, kind, ev}]                  読んだ順の字ごとの事柄
//   kakikudashi(chars, o) → [[{t, rb}]]              書き下し文の行
//   stepGroups(chars, ce, by) → [{a, b}]             読む順の段階の分け方（by = "col" | "all"）
//   hira(s)                                          片仮名を平仮名に
//   yomi(文字列) → 書き下し文の文字列（行は改行でつなぐ）
// Pure functions on strings and arrays: no DOM, no import, no network and no global of the player (spec §6.1).
// The code is m-kanbun 1.13.0's (components/kanbun/index.js, where it was DECK.kanbun), unchanged but for the wrapper;
// tools/test-kokugo.mjs tests it through the registry.
egatariParts.define({name: "kanbun-core", version: "1.0.0", requires: {}}, function(){
"use strict";

// ---------------------------------------------------------------- 読み取り（文字列 → 字の並び）
// 返り点の字 → [系列, 順位]。順位 1（一・上・甲・天）を読んだら、同じ系列で順位の大きいものへ戻る
var SERIES = {"一": ["i", 1], "二": ["i", 2], "三": ["i", 3], "四": ["i", 4], "五": ["i", 5],
  "上": ["j", 1], "中": ["j", 2], "下": ["j", 3], "甲": ["k", 1], "乙": ["k", 2], "丙": ["k", 3], "丁": ["k", 4],
  "天": ["t", 1], "地": ["t", 2], "人": ["t", 3]};
var OPEN = {"(": ")", "（": "）", "[": "]", "［": "］", "{": "}", "｛": "｝"};
var PUNCT = "、。，．！？";
// parse(文字列) → {chars, cols, warnings}。chars[n] = {ch, col, okuri, second, ruby, kana, oki, re, series, rank, mark, join, punct}
function parse(src){
  var chars = [], warnings = [], lines = String(src || "").split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
  lines.forEach(function(line, col){
    var A = Array.from(line), c = null;
    var need = function(what){ if (!c){ warnings.push(what + " の前に字がない（" + (col + 1) + " 行目）"); return false; } return true; };
    for (var j = 0; j < A.length; j++){
      var ch = A[j];
      if (/\s/.test(ch)) continue;
      if (OPEN[ch]){
        var close = OPEN[ch], body = "", k = j + 1;
        // 閉じ括弧は半角・全角のどちらでもよい
        var alt = {")": "）", "）": ")", "]": "］", "］": "]", "}": "｝", "｝": "}"}[close];
        while (k < A.length && A[k] !== close && A[k] !== alt){ body += A[k]; k++; }
        if (k >= A.length) warnings.push("「" + ch + "」が閉じていない（" + (col + 1) + " 行目）");
        j = k;
        if (!need(ch + body + close)) continue;
        if (ch === "(" || ch === "（"){
          var sp = body.split(/[|｜]/);
          c.okuri += sp[0];
          if (sp.length > 1) c.second = sp.slice(1).join("");
        } else if (ch === "[" || ch === "［"){
          Array.from(body).forEach(function(m){
            if (m === "レ") c.re = true;
            else if (SERIES[m]){ c.series = SERIES[m][0]; c.rank = SERIES[m][1]; c.mark = m; }
            else if (!/\s/.test(m)) warnings.push("返り点ではない「" + m + "」（" + (col + 1) + " 行目「" + c.ch + "」）");
          });
        } else {
          if (/^[-−‐ー]$/.test(body)) c.oki = true;
          else if (/^[=＝]/.test(body)) c.kana = body.slice(1);
          else c.ruby = body;
        }
        continue;
      }
      if (ch === "-" || ch === "‐" || ch === "－"){ if (need(ch)) c.join = true; continue; }
      if (PUNCT.indexOf(ch) >= 0){ if (need(ch)) c.punct += ch; continue; }
      if (ch === "レ"){ if (need(ch)) c.re = true; continue; }
      c = {ch: ch, col: col, okuri: "", second: null, ruby: "", kana: null, oki: false, re: false, series: null, rank: 0, mark: "", join: false, punct: ""};
      chars.push(c);
    }
  });
  chars.forEach(function(c){ if (c.ch === "不" && c.kana === null && !c.oki) warnings.push("「不」は書き下し文で平仮名にする：不{=ず}"); });
  return {chars: chars, cols: lines.length, warnings: warnings};
}

// ---------------------------------------------------------------- 訓読の順
// まとまり（竪点でつないだ字）ごとに読む。返り点の規則：
//   レ点：その字を飛ばし、次のまとまりを読んだら戻る（続くレ点は下から順に戻る）
//   一二点・上中下点・甲乙点・天地人点：順位 2 以上の字を飛ばし、同じ系列の順位 1 を読んだら、順位の小さい順に戻る
//   一レ・上レ：先にレ点として戻り、読んだら一（上）として二（下）へ戻る
//   再読文字：出てきたところで一度目を読み、返り点に従って戻ったところで二度目を読む（返り点がなければレ点と同じ）
//   置き字は読まない。戻るときは、レ点の戻りを先に、系列の戻りを後にする
// order(chars) → {units, events, warnings}。events[n] = {u（まとまりの番号）, kind: "read" | "first" | "second"}
function order(chars){
  var units = [], warnings = [];
  chars.forEach(function(c, n){
    var last = units[units.length - 1];
    if (last && chars[last.chars[last.chars.length - 1]].join) last.chars.push(n);
    else units.push({chars: [n]});
  });
  units.forEach(function(u){
    var cs = u.chars.map(function(n){ return chars[n]; });
    u.oki = cs.every(function(c){ return c.oki; });
    u.re = cs.some(function(c){ return c.re; });
    var s = cs.filter(function(c){ return c.series; })[0];
    u.series = s ? s.series : null; u.rank = s ? s.rank : 0;
    u.saidoku = cs.some(function(c){ return c.second !== null; });
  });
  var events = [], done = units.map(function(){ return false; }), pendRe = {}, stacks = {};
  function prevOf(x){ for (var y = x - 1; y >= 0; y--) if (!units[y].oki) return y; return -1; }
  function read(x){
    events.push({u: x, kind: units[x].saidoku ? "second" : "read"});
    done[x] = true;
    // レ点：すぐ上のまとまりがレ点で待っていれば戻る
    var p = prevOf(x);
    if (p >= 0 && pendRe[p]){ delete pendRe[p]; read(p); }
    // 一二点など：同じ系列で、待っている順位の大きいものへ戻る
    var u = units[x];
    if (u.series){
      var st = stacks[u.series] || [];
      if (st.length && units[st[st.length - 1]].rank > u.rank) read(st.pop());
    }
  }
  units.forEach(function(u, x){
    if (u.oki) return;
    var bySeries = u.series && u.rank >= 2;
    if (u.saidoku){
      events.push({u: x, kind: "first"});
      if (!u.re && !bySeries){ pendRe[x] = true; return; }   // 返り点のない再読文字：次を読んでから二度目
    }
    if (u.re) pendRe[x] = true;
    if (bySeries) (stacks[u.series] = stacks[u.series] || []).push(x);
    if (!u.re && !bySeries) read(x);
  });
  // 戻り先のないもの：知らせて、下から順に読む
  var left = Object.keys(pendRe).map(Number);
  Object.keys(stacks).forEach(function(s){ left = left.concat(stacks[s]); });
  left.sort(function(a, b){ return b - a; }).forEach(function(x){
    if (done[x]) return;
    warnings.push("返り点の戻り先がない「" + units[x].chars.map(function(n){ return chars[n].ch; }).join("") + "」");
    events.push({u: x, kind: units[x].saidoku ? "second" : "read"}); done[x] = true;
  });
  return {units: units, events: events, warnings: warnings};
}

// ---------------------------------------------------------------- 書き下し文
function hira(s){
  return String(s || "").replace(/[ァ-ヶ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0x60); }).replace(/ヽ/g, "ゝ").replace(/ヾ/g, "ゞ");
}
// 読んだ順の字ごとの事柄（まとまりは字に分ける）：[{c（字の番号）, kind}]
function charEvents(o){
  var out = [];
  o.events.forEach(function(e, n){ o.units[e.u].chars.forEach(function(c){ out.push({c: c, kind: e.kind, ev: n}); }); });
  return out;
}
// kakikudashi(chars, o) → 行の配列。行 = [{t, rb}]（rb は振り仮名）。句読点は、そこまでの字をみな読み終えたところに置き、
// 列の終わり（その列の字をみな読み終えたところ）で行を改める
function kakikudashi(chars, o){
  var ce = charEvents(o), fin = chars.map(function(c){ return c.oki; }), lines = [[]], flushed = -1;
  function flush(){
    // 読み終えた字の続き（置き字を含む）の終わりまで、句読点と改行を出す
    var upto = flushed;
    while (upto + 1 < chars.length && fin[upto + 1]) upto++;
    for (var n = flushed + 1; n <= upto; n++){
      if (chars[n].punct) lines[lines.length - 1].push({t: chars[n].punct});
      if (n + 1 < chars.length && chars[n + 1].col !== chars[n].col) lines.push([]);
    }
    flushed = upto;
  }
  flush();
  ce.forEach(function(e){
    var c = chars[e.c], L = lines[lines.length - 1];
    if (e.kind === "second") L.push({t: hira(c.second)});
    else if (c.kana !== null) L.push({t: hira(c.kana + c.okuri)});
    else {
      L.push({t: c.ch, rb: c.ruby || ""});
      if (c.okuri) L.push({t: hira(c.okuri)});
    }
    if (e.kind !== "first"){ fin[e.c] = true; flush(); }
  });
  return lines.filter(function(l){ return l.length; });
}
// 読む順の段階の分け方：stepGroups(chars, ce, by) → [{a, b}]（字の事柄 ce の範囲 [a, b)）。by = "col"（既定）は、字の列が
// 変わるところで切る（続けて同じ列を読む間が 1 段階。返り点・再読文字で前の列へ戻れば、そこからまた別の段階）。"all" は全体で 1 つ
function stepGroups(chars, ce, by){
  var groups = [];
  if (String(by).trim() !== "all") ce.forEach(function(ev, m){
    if (!groups.length || chars[ev.c].col !== chars[ce[m - 1].c].col) groups.push({a: m, b: m + 1});
    else groups[groups.length - 1].b = m + 1;
  });
  return groups.length ? groups : [{a: 0, b: ce.length}];
}
var plain = function(line){ return line.map(function(s){ return s.t; }).join(""); };
return {parse: parse, order: order, kakikudashi: kakikudashi, charEvents: charEvents, hira: hira, stepGroups: stepGroups,
  // 文字列から書き下し文の文字列（行は改行でつなぐ）
  yomi: function(src){ var p = parse(src), o = order(p.chars); return kakikudashi(p.chars, o).map(plain).join("\n"); }};
});
