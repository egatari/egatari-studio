// m-kanbun：白文に返り点・送り仮名を付け、訓読の順に読み、書き下し文にする（縦書き）
// <m-kanbun style="height:440px">
//   春眠不{=ず}レ覚(エ)レ暁(ヲ)
//   処処聞(ク)[二]啼鳥(ヲ)[一]
// </m-kanbun>
// 1 行が 1 列（句）。行の中の空白は読まない。字の後ろに付けるもの（順は問わない）：
//   (送り仮名)   [返り点]（レ・一二三四五・上中下・甲乙丙丁・天地人、一レ・上レ・甲レ・天レ）。レ点だけは [ ] なしの「レ」でもよい
//   {振り仮名}   {=かな}（書き下し文で平仮名にする字：不{=ず}、也{=なり}）   {-}（置き字：読まない）
//   (右|二度目)  再読文字：右の送り仮名と二度目の読み（未(ダ|ず)、将(ニ|ス)）。二度目の読みの片仮名は左の送り仮名として出す
//   字-字        竪点（続けて読む熟語。返り点はまとまり全体に効く）    、。        句読点（白文では出さない）
// 段階（phases の順。既定は kunten order kaki）：段階 0 は白文 → kunten 訓点（返り点・送り仮名）→ order 読む順（目が字を順にたどり、
// 返り点で上へ戻るところに弧を描く）→ kaki 書き下し文（左に縦書きで）。読む順の計算は DECK.kanbun.order（試験は tools/test-kokugo.mjs）
(function(){
"use strict";
var D = window.DECK;

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
var plain = function(line){ return line.map(function(s){ return s.t; }).join(""); };
D.kanbun = {parse: parse, order: order, kakikudashi: kakikudashi, charEvents: charEvents, hira: hira,
  // 文字列から書き下し文の文字列（行は改行でつなぐ）
  yomi: function(src){ var p = parse(src), o = order(p.chars); return kakikudashi(p.chars, o).map(plain).join("\n"); }};
if (!D.MotionElement) return;   // 試験（Node）では読み取りと順だけ

// ---------------------------------------------------------------- 部品
var PH = ["kunten", "order", "kaki"];
// 長い送り仮名を詰める：fit は自然の長さ（字数 × 字の大きさ）に対する割合。まず字間を詰め（1 字につき字の大きさの 0.12 まで）、
// 残りを縦に縮める（transform。字の大きさ・字の幅は変えない）。OK_MIN より詰めない（それより長ければ次の字を下げる）
var OK_MIN = 0.78, OK_TRACK = 0.12, GAP_OK = 8, OK_DELAY = 0.36;
function okSquash(n, F, fit){
  if (!(fit < 0.999) || !n) return "";
  var ls = Math.max(-OK_TRACK * F, (fit - 1) * F), sy = fit * F / (F + ls);
  return ";letter-spacing:" + ls.toFixed(2) + "px" + (sy < 0.999 ? ";transform:scaleY(" + sy.toFixed(3) + ");transform-origin:50% 0" : "");
}
D.define("m-kanbun", class extends D.MotionElement {
  // データの形（kit/shape.js）：JSON ではなく、要素の中に 1 行 1 句の字（送り仮名 (…)・返り点 […]）
  static shape = {text: true, example: "学(ビテ)而{-}時(ニ)習(フ)[レ]之(ヲ)"};
  static props = {
    size:   {type: "number", default: 60, doc: "漢字の大きさ（px）。送り仮名・返り点はその 0.42 倍（24px より小さくしない）"},
    slot:   {type: "number", default: 0.55, doc: "読む順で 1 字にかける秒数"},
    phases: {type: "string", default: "kunten order kaki", doc: "段階の並び（kunten 訓点・order 読む順・kaki 書き下し文から選ぶ）"},
    kaki:   {type: "number", default: 36, doc: "書き下し文の字の大きさ（px）"},
    nums:   {type: "bool", default: true, doc: "読む順の番号を字の左上に出す"},
  };
  get phaseList(){
    var a = String(this.props.phases || "").split(/[\s,]+/).filter(function(x){ return PH.indexOf(x) >= 0; });
    return a.length ? a : PH.slice();
  }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.phaseList.length; }
  // 段階 name の番号（1 から）。phases になければ 0
  phaseStep(name){ return this.phaseList.indexOf(name) + 1; }
  mount(){
    var self = this, P = this.props, src = this.textContent;
    var S = P.size, F = Math.max(24, Math.round(S * 0.42));
    var p = parse(src), o = order(p.chars), kaki = kakikudashi(p.chars, o);
    p.warnings.concat(o.warnings).forEach(function(w){ console.warn("m-kanbun: " + w); });
    this.k = {p: p, o: o, ce: charEvents(o), kaki: kaki};
    this.textContent = "";
    this.classList.add("plot", "kanbun");
    this.style.display = "block"; this.style.position = "relative";
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", p.chars.map(function(c){ return c.ch; }).join("") + "。書き下し文：" + kaki.map(plain).join(""));
    // ---- 配置：列は右から左へ。列の中は 左の欄（返り点・再読の左の送り仮名）・漢字・右の欄（振り仮名・送り仮名）
    var L = Math.round(S * 0.5), R = Math.round(S * 0.5), G = Math.round(S * 0.3), PITCH = L + S + R + G;
    var cols = [], H = 0;
    p.chars.forEach(function(c, n){
      var col = cols[c.col] = cols[c.col] || {y: 0, rEnd: 0, lEnd: 0, list: [], prevOk: null};
      // 前の字の右と左の欄の終わりにぶつからないところまで下げる
      var rStart = c.ruby ? 0 : S * 0.52, lStart = S * 0.5;
      // 番号（左上）を出すときは、前の字の左の欄（一レ点・再読文字の左の送り仮名）の下から始める
      var y = Math.max(col.y, col.lEnd - (P.nums ? 0 : lStart) + 2);
      // 右の欄：前の字の送り仮名は、この字を下げずに収まるように詰める（印刷の組み方：字間を詰め、それでも長ければ縦に縮める。
      // 字の大きさは変えない）。この字に振り仮名も送り仮名もなければ、この字の右の欄の 0.8 まではみ出してよい。
      // 振り仮名は前の字の送り仮名から少し離す（続けて読まないように）。縮めきっても入らないときだけ下げる
      var pk = col.prevOk;
      if (pk){
        // 次の字の送り仮名は下で OK_DELAY まで下げうるので、ここではそれを見込む（足りなければ下で後ろの字をまとめて下げる）
        var room = c.ruby ? -10 : c.okuri ? rStart - GAP_OK + S * OK_DELAY : S * 0.8;
        var need = pk.len * OK_MIN;
        y = Math.max(y, pk.top + need - room);
        pk.c.okFit = Math.min(1, (y + room - pk.top) / pk.len);
      } else y = Math.max(y, col.rEnd - rStart + (c.ruby ? 10 : 6));
      c.y = y; c.n = n;
      var rr = y + (c.ruby ? 0 : S * 0.52);
      if (c.ruby){ c.rubyY = y + Math.max(0, (S * 0.52 - Array.from(c.ruby).length * F) / 2); rr = Math.max(y + S * 0.52, c.rubyY + Array.from(c.ruby).length * F); }
      c.okY = rr; c.okFit = 1;
      var okLen = Array.from(c.okuri).length * F;
      col.rEnd = rr + okLen; col.prevOk = okLen ? {c: c, top: rr, len: okLen} : null;
      var ll = y + S * 0.5, leftKana = c.second ? (c.second.match(/[ァ-ヶー]/g) || []).join("") : "";
      c.leftKana = leftKana; c.lkY = ll; ll += Array.from(leftKana).length * F;
      // 返り点は左下：字の下端をまたぐところ（天を字の 0.72 の高さに）
      c.kaeriY = Math.max(ll, y + S * 0.72); c.kaeriN = (c.mark ? 1 : 0) + (c.re ? 1 : 0);
      col.lEnd = c.kaeriN ? c.kaeriY + c.kaeriN * F * 0.92 : ll;
      col.y = y + S * 1.2 + (c.punct ? S * 0.42 : 0) + (c.join ? S * 0.22 : 0);
      col.list.push(n);
      H = Math.max(H, col.y, col.rEnd, col.lEnd);
    });
    // 右の欄の送り仮名を列ごとに置き直す（字の位置は上で決まったまま）。送り仮名は字の下半分から始め、長ければ詰める。
    // 次の字の送り仮名がその次の字までに楽に収まるなら、次の字の送り仮名を字の 0.36（OK_DELAY）まで下げて、前の長い送り仮名に場所を譲る
    var okLen = function(c){ return Array.from(c.okuri).length * F; };
    cols.forEach(function(col){
      var L2 = col.list.map(function(n){ return p.chars[n]; }), prevEnd = -Infinity;
      // 字 i の送り仮名の終わりの上限（次の字の振り仮名・送り仮名・字そのもの）。delay：次の字の送り仮名を下げる量
      var limitOf = function(i, delay){
        var d = L2[i + 1];
        if (!d) return Infinity;
        return d.ruby ? d.rubyY - 10 : d.okuri ? d.okY + delay - GAP_OK : d.y + S * 0.8;
      };
      L2.forEach(function(c, i){
        if (!c.okuri) return;
        var top = Math.max(c.okY, prevEnd + GAP_OK), len = okLen(c), d = L2[i + 1], delay = 0;
        if (d && d.okuri && !d.ruby){
          var slack = limitOf(i + 1, 0) - (d.okY + okLen(d));
          delay = Math.max(0, Math.min(S * OK_DELAY, slack, top + len + GAP_OK - d.okY));
        }
        var lim = limitOf(i, delay);
        // 縮めきっても入らなければ、この列の後ろの字をまとめて下げる（字どうしの間は変えない）
        var short = top + len * OK_MIN - lim;
        if (short > 0) L2.slice(i + 1).forEach(function(e){
          e.y += short; e.okY += short; e.lkY += short; e.kaeriY += short; if (e.ruby) e.rubyY += short;
          H = Math.max(H, e.y + S * 1.2 + (e.punct ? S * 0.42 : 0), e.kaeriY + e.kaeriN * F * 0.92, e.lkY + Array.from(e.leftKana).length * F);
        });
        if (short > 0) lim += short;
        c.okY = top; c.okFit = Math.max(OK_MIN, Math.min(1, (lim - top) / len));
        prevEnd = top + len * c.okFit;
        H = Math.max(H, prevEnd);
      });
    });
    var nc = cols.length, WK = nc * PITCH - G;
    // 書き下し文：部品の高さで折り返す。列の数は字数から見積もる（振り仮名は数えない）
    var KS = P.kaki, HA = Math.max(KS * 4, this.clientHeight || H), perCol = Math.max(1, Math.floor(HA / KS));
    var kcols = kaki.reduce(function(a, line){ return a + Math.max(1, Math.ceil(Array.from(plain(line)).length / perCol)); }, 0);
    var KW = kcols * KS * 1.9, GAP = Math.round(S * 0.9);
    var W = this.clientWidth || 1184, X0 = Math.max(0, Math.round((W - (WK + GAP + KW)) / 2));
    this.geom = {S: S, F: F, L: L, PITCH: PITCH, WK: WK, H: H};
    var box = function(tag, cls, css, parent, text){
      var e = document.createElement(tag); e.className = cls; e.style.cssText = css; if (text !== undefined) e.textContent = text; (parent || self).appendChild(e); return e;
    };
    var kb = box("div", "kb", "position:absolute;top:0;left:" + (X0 + KW + GAP) + "px;width:" + WK + "px;height:" + Math.ceil(H) + "px;font-family:var(--font-mincho);color:var(--fg)");
    // 列 c の左端（kb の中の x）
    var colLeft = function(c){ return WK - (c + 1) * PITCH + G; };
    this.cells = p.chars.map(function(c){
      var x = colLeft(c.col) + L, e = {c: c, x: x, y: c.y};
      e.bg = box("div", "kb-bg", "position:absolute;left:" + (x - 3) + "px;top:" + (c.y - 3) + "px;width:" + (S + 6) + "px;height:" + (S + 6) + "px;border-radius:6px;background:var(--term-tint);opacity:0", kb);
      e.ch = box("span", "kb-ch", "position:absolute;left:" + x + "px;top:" + c.y + "px;width:" + S + "px;height:" + S + "px;font-size:" + S + "px;line-height:" + S + "px;text-align:center", kb, c.ch);
      var vt = "writing-mode:vertical-rl;text-orientation:upright;position:absolute;font-size:" + F + "px;line-height:" + F + "px;white-space:nowrap;opacity:0;";
      e.ann = [];
      // 右の欄：振り仮名（上）と送り仮名（下半分から）。左の欄：再読文字の二度目の片仮名、その下に返り点
      if (c.ruby) e.ann.push(box("span", "kb-ruby", vt + "left:" + (x + S + 1) + "px;top:" + c.rubyY + "px;color:var(--muted)", kb, c.ruby));
      if (c.okuri) e.ann.push(box("span", "kb-ok", vt + "left:" + (x + S + 1) + "px;top:" + c.okY + "px;color:var(--term)" + okSquash(Array.from(c.okuri).length, F, c.okFit), kb, c.okuri));
      if (c.leftKana) e.ann.push(box("span", "kb-ok kb-left", vt + "left:" + (x - F - 1) + "px;top:" + c.lkY + "px;color:var(--term)", kb, c.leftKana));
      e.kaeri = [];
      var ky = c.kaeriY, kx = x - F - 2;
      var mk = function(s){ var k = box("span", "kb-kaeri", "position:absolute;left:" + kx + "px;top:" + ky + "px;width:" + F + "px;font-size:" + F + "px;line-height:" + F + "px;text-align:center;color:var(--emph);font-weight:700;opacity:0", kb, s); e.kaeri.push(k); ky += F * 0.92; };
      if (c.mark) mk(c.mark);
      if (c.re) mk("レ");
      if (c.punct) e.punct = box("span", "kb-punct", "writing-mode:vertical-rl;position:absolute;left:" + (x + S * 0.2) + "px;top:" + (c.y + S * 1.02) + "px;font-size:" + Math.round(S * 0.6) + "px;line-height:" + Math.round(S * 0.6) + "px;opacity:0", kb, c.punct);
      if (c.join) e.join = box("span", "kb-join", "position:absolute;left:" + (x + S / 2 - 1.5) + "px;top:" + (c.y + S * 1.06) + "px;width:3px;height:" + Math.round(S * 0.24) + "px;background:var(--fg);opacity:0", kb);
      e.nums = [];
      return e;
    });
    // 読む順：字ごとの番号（左上。再読文字の二度目は右上、振り仮名があれば左上の番号の上）
    var ce = this.k.ce, NF = Math.max(24, Math.round(S * 0.4));
    ce.forEach(function(ev, m){
      var e = self.cells[ev.c], second = ev.kind === "second" && e.c.second !== null;
      var nx = second && !e.c.ruby ? e.x + S + 1 : e.x - L, ny = second && e.c.ruby ? e.y - NF : e.y + 3;
      var nb = box("span", "kb-num", "position:absolute;left:" + nx + "px;top:" + ny + "px;width:" + L + "px;font-family:var(--font-sans);font-size:" + NF + "px;line-height:" + NF + "px;text-align:center;font-weight:700;color:var(--emph);font-variant-numeric:tabular-nums;opacity:0", kb, String(m + 1));
      e.nums.push(nb); ev.num = nb;
    });
    // 目（今読んでいる字の枠）と、上へ戻るところの弧
    this.eye = box("div", "kb-eye", "position:absolute;left:0;top:0;width:" + (S + 10) + "px;height:" + (S + 10) + "px;border:3px solid var(--emph);border-radius:9px;opacity:0", kb);
    var svg = D.el("svg", {width: WK, height: Math.ceil(H), viewBox: "0 0 " + WK + " " + Math.ceil(H), style: "position:absolute;left:0;top:0;overflow:visible;pointer-events:none"}, kb);
    this.jumps = [];
    ce.forEach(function(ev, m){
      if (m === 0) return;
      var a = self.cells[ce[m - 1].c], b = self.cells[ev.c];
      // 同じ列の上の字へ戻るとき（または右の列へ戻るとき）に弧を描く
      var back = a.c.col === b.c.col ? b.c.n < a.c.n : b.c.col < a.c.col;
      if (!back) return;
      // 弧は左の欄（返り点・番号）の外を通す（2 次曲線の頂点は制御点までの半分）
      var x0 = a.x - 4, y0 = a.y + S / 2, x1 = b.x - 4, y1 = b.y + S / 2, cx = Math.min(x0, x1) - S * 1.3;
      if (a.c.col !== b.c.col){ x0 = a.x + S / 2; y0 = a.y - 4; x1 = b.x + S / 2; y1 = b.y - 4; cx = (x0 + x1) / 2; }
      var cy = a.c.col !== b.c.col ? Math.min(y0, y1) - S * 0.8 : (y0 + y1) / 2;
      var d = "M" + x0.toFixed(1) + "," + y0.toFixed(1) + "Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + x1.toFixed(1) + "," + y1.toFixed(1);
      var g = D.el("g", {opacity: 0}, svg);
      var path = D.el("path", {d: d, fill: "none", stroke: "var(--emph)", "stroke-width": 3, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1}, g);
      // 矢じり：終わりの点での向き（2 次曲線の終わりの接線は制御点 → 終点）
      var ang = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI;
      var head = D.el("path", {d: "M0,0L-13,-6L-13,6Z", fill: "var(--emph)", transform: "translate(" + x1.toFixed(1) + " " + y1.toFixed(1) + ") rotate(" + ang.toFixed(1) + ")", opacity: 0}, g);
      self.jumps.push({m: m, g: g, path: path, head: head});
    });
    // 書き下し文（縦書き、左に）
    var kk = box("div", "kb-kaki", "position:absolute;top:0;left:" + X0 + "px;width:" + Math.ceil(KW) + "px;height:" + Math.ceil(HA) + "px;writing-mode:vertical-rl;font-family:var(--font-mincho);font-size:" + KS + "px;line-height:1.9;color:var(--fg);line-break:strict");
    this.kakiLines = kaki.map(function(line){
      var d = box("div", "kb-kaki-line", "opacity:0", kk);
      line.forEach(function(s){
        if (s.rb){ var r = document.createElement("ruby"); r.textContent = s.t; var rt = document.createElement("rt"); rt.textContent = s.rb; r.appendChild(rt); d.appendChild(r); }
        else d.appendChild(document.createTextNode(s.t));
      });
      return d;
    });
  }
  duration(k){
    var name = this.phaseList[k - 1], n = this.k ? this.k.ce.length : 0;
    if (name === "kunten") return 0.9;
    if (name === "order") return n * this.props.slot + 0.3;
    if (name === "kaki") return (this.kakiLines ? this.kakiLines.length : 1) * 0.3 + 0.45;
    return 0;
  }
  // 読む順の段階：列が変わる字（2 列目からの各列の読み始め）の時刻。口述原稿の {cue} を句ごとに置ける
  cues(k){
    if (this.phaseList[k - 1] !== "order" || !this.k) return null;
    var ce = this.k.ce, ch = this.k.p.chars, slot = this.props.slot, out = [];
    for (var m = 1; m < ce.length; m++) if (ch[ce[m].c].col !== ch[ce[m - 1].c].col) out.push(+(m * slot).toFixed(4));
    return out.length ? out : null;
  }
  render(k, t){
    var self = this, S = this.geom.S, slot = this.props.slot;
    // 段階 name の進み：まだなら -1、済んだら Infinity、今なら t。phases になければ、訓点は初めから済み、ほかは来ない
    var at = function(name){ var s = self.phaseStep(name); if (!s) return name === "kunten" ? Infinity : -1; return k > s ? Infinity : k < s ? -1 : t; };
    var pr = function(tt, a, d){ return tt < 0 ? 0 : D.prog(tt, a, d); };
    var tk = at("kunten"), to = at("order"), tw = at("kaki");
    var eK = pr(tk, 0, 0.4), eO = pr(tk, 0.3, 0.45), eP = pr(tk, 0.45, 0.3);
    this.cells.forEach(function(e){
      e.kaeri.forEach(function(x){ x.style.opacity = eK.toFixed(3); });
      e.ann.forEach(function(x){ x.style.opacity = eO.toFixed(3); });
      if (e.punct) e.punct.style.opacity = eP.toFixed(3);
      if (e.join) e.join.style.opacity = eK.toFixed(3);
      e.bg.style.opacity = 0;
      // 置き字は読む順の段階から薄くする（読まない字）
      e.ch.style.color = e.c.oki && to !== -1 ? "var(--muted)" : "";
    });
    // 読む順：事柄 m は m * slot 秒に始まる。今の事柄 j
    var ce = this.k.ce, n = ce.length, j = -1, done = to === Infinity;
    if (done) j = n;
    else if (to >= 0) j = Math.max(0, Math.min(n - 1, Math.floor(to / slot)));
    var seen = {}, numFade = 1 - 0.6 * pr(tw, 0, 0.45);   // 書き下し文が出るときに番号を薄くする
    ce.forEach(function(ev, m){
      var e = self.cells[ev.c], v = m < j ? 1 : m === j ? pr(to - m * slot, 0.12 * slot, 0.3 * slot) : 0;
      if (v > 0) seen[ev.c] = Math.max(seen[ev.c] || 0, v);
      ev.num.style.opacity = self.props.nums ? (v * numFade).toFixed(3) : 0;
    });
    Object.keys(seen).forEach(function(c){ self.cells[c].bg.style.opacity = (seen[c] * 0.9).toFixed(3); });
    var fade = 1 - pr(tw, 0, 0.45);   // 書き下し文が出るときに弧を薄くする
    this.jumps.forEach(function(J){
      var d = J.m < j ? 1 : J.m === j ? pr(to - J.m * slot, 0, 0.35 * slot) : 0;
      J.path.setAttribute("stroke-dashoffset", (1 - d).toFixed(4));
      J.head.setAttribute("opacity", d >= 0.98 ? 1 : 0);
      J.g.setAttribute("opacity", d <= 0 ? 0 : ((J.m === j && !done ? 1 : 0.55) * fade).toFixed(3));
    });
    // 目：前の字から今の字へ 0.35 slot で動く。読み終えたら消える
    if (j >= 0 && j < n && !done){
      var cur = this.cells[ce[j].c], prev = j > 0 ? this.cells[ce[j - 1].c] : cur;
      // 同じ列の中では滑らせ、列が変わるとき（次の句へ）は今の字で現れる
      var e2 = pr(to - j * slot, 0, 0.35 * slot), hop = prev.c.col !== cur.c.col;
      var x = hop ? cur.x : D.lerp(prev.x, cur.x, e2), y = hop ? cur.y : D.lerp(prev.y, cur.y, e2);
      this.eye.style.left = (x - 8).toFixed(2) + "px"; this.eye.style.top = (y - 8).toFixed(2) + "px";
      this.eye.style.opacity = (j === 0 ? pr(to, 0, 0.15) : hop ? e2 : 1).toFixed(3);
      cur.ch.style.color = "var(--emph)";
    } else this.eye.style.opacity = 0;
    // 書き下し文：行ごとに 0.3 秒ずつ遅らせて出す
    this.kakiLines.forEach(function(d, L){ d.style.opacity = pr(tw, L * 0.3, 0.45).toFixed(3); });
  }
});
})();
