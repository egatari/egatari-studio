// m-syntax：英文の構造（中学・高校の英語）。S V O C M の札、句と節の括弧、修飾の矢印、品詞、それから和訳
// <m-syntax style="height:420px">
//   [S The girl {形^girl [S who] [V lives] [M next door]}] [V is] [C my friend].
//   = 隣に住んでいる女の子は私の友達だ。
// </m-syntax>
// 1 行が 1 文。「= 」で始まる行は直前の文の和訳。
//   [S …] [V …] [O …] [C …] [M …]   文の要素（O1 O2 も）。語の下に下線と記号。{ } の中の要素は小文字（s v o c m）
//   {形 …} {副 …} {名 …}            句・節の括弧（形容詞は ( )、副詞は < >、名詞は [ ]）。句か節かは中に V があるかで決まる（形句・形節と書けば固定）
//   {形^girl …}  語^語（tall^boy）   修飾の矢印：括弧（語）から、^ の後の語（同じ文のいちばん近いもの）へ。^ だけなら隣の語（{形^ …} は前、tall^ は次）
//   語[品詞]（boy[名]）              品詞。pos="on" のときだけ出す
// 段階：（pos）→ 要素を 1 つずつ（S V O C M のうち出てくるもの）→ 括弧（と中の小文字の要素）→ 矢印 → 和訳。build="whole" で 1 段階
// 字は HTML（英文は var(--font-sans)、和訳も）。線・括弧・札は SVG で、描くたびに語の位置を測る（呼び出しの順によらない）
(function(){
"use strict";
var D = window.DECK;
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (the first is the default) and calls VARIANT.of(this) once, in mount. The variant is the component's
// `variant` attribute when it names one of them, otherwise the first name. There is no seed: lessons do not carry one
// (spec §8.4 since egatari-spec 28d8801), and `seed` / `data-egatari-seed` are not read.
// The choice is a pure function of the attribute: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null && names.indexOf(v) >= 0) return v;
    if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
    return names[0] || null;
  }
  return {of: of};
})();
// ---- END egatari-variant ----

// ---------------------------------------------------------------- 決まり
var ROLES = ["S", "V", "O", "C", "M"];
var ROLE_COLOR = {S: "var(--series-1)", V: "var(--series-2)", O: "var(--series-3)", C: "var(--series-4)", M: "var(--muted)"};
// 括弧の種類：名詞 [ ]・形容詞 ( )・副詞 < >（形と記号の両方で種類が分かる。色だけに頼らない）
var KIND = {"名": {name: "名詞", shape: "square"}, "形": {name: "形容詞", shape: "round"}, "副": {name: "副詞", shape: "angle"}};
// 品詞：略号 → [名前, 色の組]
var POS = {"名": ["名詞", "n"], "代": ["代名詞", "n"], "動": ["動詞", "v"], "助": ["助動詞", "v"], "形": ["形容詞", "a"], "副": ["副詞", "d"],
  "冠": ["冠詞", "x"], "前": ["前置詞", "x"], "接": ["接続詞", "x"], "関": ["関係詞", "x"], "間": ["間投詞", "x"]};
var POS_COLOR = {n: "var(--series-1)", v: "var(--series-2)", a: "var(--series-3)", d: "var(--series-4)", x: "var(--fg)"};
var PUNCT = /^[.,!?;:]+$/;

// ---------------------------------------------------------------- 読み取り
// parse(文字列) → {sentences: [{tokens, roles, groups, mods, yaku, text}], warnings}
//   tokens[i] = {t, punct, pos: {tag, name, cls} | null}
//   roles[j]  = {code: "S"…"M", sub: "" | "1" | "2", a, b, lower（{ } の中）, depth（囲む要素の数）, owner（いちばん内側の括弧の番号 | -1）}
//   groups[j] = {kind: "名" | "形" | "副" | null, unit: "句" | "節", label, a, b, depth（囲む括弧の数）, head: 語 | null}
//   mods[j]   = {from: {group: j} | {token: i}, a, b, to（頭の語の番号）}   a..b は修飾する側の語の範囲
function norm(w){ return String(w).toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, ""); }
function parse(src){
  var sentences = [], warnings = [];
  String(src || "").split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean).forEach(function(l, li){
    if (/^[=＝]/.test(l)){
      var y = l.replace(/^[=＝]\s*/, "");
      if (!sentences.length) warnings.push("和訳の前に英文がない：" + l);
      else if (sentences[sentences.length - 1].yaku) warnings.push("和訳が 2 行ある（" + (li + 1) + " 行目。1 行にまとめる）：" + l);
      else sentences[sentences.length - 1].yaku = y;
      return;
    }
    sentences.push(sentence(l, li + 1, warnings));
  });
  return {sentences: sentences, warnings: warnings};
}
function sentence(src, ln, warnings){
  var l = src.replace(/［/g, "[").replace(/］/g, "]").replace(/｛/g, "{").replace(/｝/g, "}").replace(/＾/g, "^");
  var at = "（" + ln + " 行目）";
  var tokens = [], roles = [], groups = [], wmods = [], stack = [], cur = "", curPos = null, nOpen = 0;
  var lastWord = function(){ for (var i = tokens.length - 1; i >= 0; i--) if (!tokens[i].punct) return i; return -1; };
  var push = function(t, pos){
    var m = /^(.*?)([.,!?;:]*)$/.exec(t), w = m[1], p = m[2];
    if (w){
      var head = null, k = w.indexOf("^");
      if (k === 0){ warnings.push("「^」の前に語がない：" + w + at); w = w.slice(1); }
      else if (k > 0){ head = w.slice(k + 1); w = w.slice(0, k); }   // head が "" なら次の語
      if (w){
        tokens.push({t: w, punct: false, pos: pos});
        if (head !== null) wmods.push({i: tokens.length - 1, head: head});
      }
    } else if (pos) warnings.push("品詞の前に語がない：[" + pos.tag + "]" + at);
    if (p) tokens.push({t: p, punct: true, pos: null});
  };
  var flush = function(){
    if (!cur) return;
    var pos = null;
    if (curPos !== null){
      var P = POS[curPos];
      if (!P) warnings.push("知らない品詞「" + curPos + "」（" + Object.keys(POS).join(" ") + " のどれか）" + at);
      pos = {tag: curPos, name: P ? P[0] : curPos, cls: P ? P[1] : "x"};
    }
    push(cur, pos); cur = ""; curPos = null;
  };
  var close = function(item){
    var b = lastWord();
    if (b < item.a){ warnings.push("中に語のない" + (item.type === "role" ? "要素 [" + item.code : "括弧 {" + (item.kind || "")) + "]" + at); return; }
    item.b = b;
    if (item.type === "role") roles.push(item); else groups.push(item);
  };
  var closeUntil = function(type, ch){
    for (var j = stack.length - 1; j >= 0; j--) if (stack[j].type === type){
      if (j !== stack.length - 1) warnings.push("閉じる順が違う：「" + ch + "」の前に閉じていないものがある" + at);
      while (stack.length > j){ var it = stack.pop(); if (it.type !== "bad") close(it); }
      return;
    }
    // 開いていない（読めなかった開きは bad として積んである）
    for (var q = stack.length - 1; q >= 0; q--) if (stack[q].type === "bad" && stack[q].ch === (ch === "]" ? "[" : "{")){ stack.splice(q, 1); return; }
    warnings.push("「" + ch + "」に対応する開きがない" + at);
  };
  var nGroups = function(){ return stack.filter(function(x){ return x.type === "group"; }); };
  for (var i = 0; i < l.length; i++){
    var ch = l[i], rest = l.slice(i), m;
    if (/\s/.test(ch)){ flush(); continue; }
    if (ch === "[" && cur){
      // 語に付いた [ ]：品詞
      var e = l.indexOf("]", i), body = e > 0 ? l.slice(i + 1, e) : "";
      if (e > 0 && body && !/\s/.test(body)){ curPos = body; i = e; continue; }
    }
    if (ch === "["){
      flush();
      m = /^\[([SVOCMsvocm])([12]?)(?=\s)/.exec(rest);
      if (!m){ warnings.push("「[」の後に要素の記号（S V O C M）と空白がない：" + rest.slice(0, 12) + at); stack.push({type: "bad", ch: "["}); continue; }
      var gs = nGroups();
      stack.push({type: "role", code: m[1].toUpperCase(), sub: m[2], a: tokens.length, lower: gs.length > 0,
        owner: gs.length ? gs[gs.length - 1].id : -1, depth: stack.filter(function(x){ return x.type === "role"; }).length});
      i += m[0].length - 1; continue;
    }
    if (ch === "{"){
      flush();
      m = /^\{([名形副])(句|節)?(?:\^([^\s[\]{}^]*))?(?=\s)/.exec(rest);
      var id = nOpen++;
      if (!m){
        var bad = /^\{(\S*)/.exec(rest)[1];
        warnings.push("知らない括弧の種類「" + bad + "」（形・副・名。句・節と ^語 を続けてよい：{形節^girl …}）" + at);
        stack.push({type: "group", id: id, kind: null, unit: "", label: bad.replace(/\^.*$/, ""), head: null, a: tokens.length, depth: nGroups().length});
        i += bad.length; continue;
      }
      stack.push({type: "group", id: id, kind: m[1], unit: m[2] || "", head: m[3] === undefined ? null : m[3], a: tokens.length, depth: nGroups().length});
      i += m[0].length - 1; continue;
    }
    if (ch === "]"){ flush(); closeUntil("role", "]"); continue; }
    if (ch === "}"){ flush(); closeUntil("group", "}"); continue; }
    cur += ch;
  }
  flush();
  while (stack.length){
    var it = stack.pop();
    if (it.type === "bad") continue;
    warnings.push("閉じていない" + (it.type === "role" ? "「[" + it.code + "」" : "「{" + (it.kind || it.label) + "」") + at);
    close(it);
  }
  // 括弧の番号を開いた順に（id は開いた順に振ってある）
  groups.sort(function(x, y){ return x.id - y.id; });
  var gid = {};
  groups.forEach(function(g, j){ gid[g.id] = j; });
  roles.forEach(function(r){ r.owner = r.owner >= 0 && gid[r.owner] !== undefined ? gid[r.owner] : -1; });
  roles.sort(function(x, y){ return x.a - y.a || x.depth - y.depth; });
  groups.forEach(function(g){
    if (g.kind && !g.unit) g.unit = roles.some(function(r){ return r.code === "V" && r.a >= g.a && r.b <= g.b; }) ? "節" : "句";
    if (g.kind) g.label = KIND[g.kind].name + g.unit;
    delete g.id;
  });
  // 修飾の矢印：頭の語は、修飾する側の外で、いちばん近い同じ語（同じ距離なら左）
  var mods = [];
  var find = function(head, a, b){
    var h = norm(head), best = -1, bd = Infinity;
    tokens.forEach(function(t, i){
      if (t.punct || (i >= a && i <= b) || norm(t.t) !== h) return;
      var d = i < a ? a - i : i - b;
      if (d < bd){ bd = d; best = i; }
    });
    return best;
  };
  // ^ だけなら隣の語：括弧は前の語、語は次の語
  var near = function(i, dir){ for (i += dir; i >= 0 && i < tokens.length; i += dir) if (!tokens[i].punct) return i; return -1; };
  groups.forEach(function(g, j){
    if (g.head === null) return;
    var to = g.head ? find(g.head, g.a, g.b) : near(g.a, -1);
    if (to < 0) warnings.push((g.head ? "矢印の先「" + g.head + "」が括弧の外にない" : "括弧の前に語がない") + "（{" + (g.kind || g.label) + "^" + g.head + " …}）" + at);
    else mods.push({from: {group: j}, a: g.a, b: g.b, to: to});
  });
  wmods.forEach(function(w){
    var to = w.head ? find(w.head, w.i, w.i) : near(w.i, 1);
    if (to < 0) warnings.push((w.head ? "矢印の先「" + w.head + "」がない" : "「^」の後に語がない") + "（" + tokens[w.i].t + "^" + w.head + "）" + at);
    else mods.push({from: {token: w.i}, a: w.i, b: w.i, to: to});
  });
  mods.sort(function(x, y){ return Math.min(x.a, x.to) - Math.min(y.a, y.to) || x.a - y.a; });
  // 矢印の段：つなぐ範囲の短いものから、重なる矢印より 1 つ上の段へ
  var placed = [];
  mods.map(function(o){ return {o: o, lo: Math.min(o.a, o.to), hi: Math.max(o.b, o.to)}; })
    .sort(function(x, y){ return (x.hi - x.lo) - (y.hi - y.lo) || x.lo - y.lo; })
    .forEach(function(s){
      var lv = 1;
      placed.forEach(function(q){ if (q.lo < s.hi && s.lo < q.hi) lv = Math.max(lv, q.o.lane + 1); });   // 端で接するだけなら同じ段（同じ語に来る矢印は語の幅に並べる）
      s.o.lane = lv; placed.push(s);
    });
  var text = tokens.map(function(t, i){ return (i && !t.punct ? " " : "") + t.t; }).join("");
  return {tokens: tokens, roles: roles, groups: groups, mods: mods, yaku: "", text: text};
}

// ---------------------------------------------------------------- 段階
// plan(model, {pos, yaku, whole}) → {phases: [{name, code, n, dur, step, off}], steps}
// name：pos（品詞）・role（code の要素）・brackets（括弧と中の小文字の要素）・arrows（矢印）・yaku（和訳）
var GAP = 0.2;   // build="whole" の段の間
function phaseDur(name, n){
  if (name === "pos") return 0.8;
  if (name === "role") return 0.5 + 0.2 * (n - 1);
  if (name === "brackets") return 0.7 + 0.3 * (n - 1);
  if (name === "arrows") return 0.6 + 0.4 * (n - 1);
  return 0.6;
}
function plan(model, o){
  o = o || {};
  var S = model.sentences, ph = [];
  var all = function(f){ var n = 0; S.forEach(function(s){ n += f(s); }); return n; };
  var nPos = all(function(s){ return s.tokens.filter(function(t){ return t.pos; }).length; });
  if (o.pos && nPos) ph.push({name: "pos", n: nPos});
  ROLES.forEach(function(c){
    var n = all(function(s){ return s.roles.filter(function(r){ return !r.lower && r.code === c; }).length; });
    if (n) ph.push({name: "role", code: c, n: n});
  });
  var nG = all(function(s){ return s.groups.length; });
  if (nG) ph.push({name: "brackets", n: nG});
  var nM = all(function(s){ return s.mods.length; });
  if (nM) ph.push({name: "arrows", n: nM});
  var nY = all(function(s){ return s.yaku ? 1 : 0; });
  if (o.yaku !== false && nY) ph.push({name: "yaku", n: nY});
  var off = 0;
  ph.forEach(function(p, j){
    p.dur = phaseDur(p.name, p.n);
    if (o.whole){ p.step = 1; p.off = off; off += p.dur + GAP; }
    else { p.step = j + 1; p.off = 0; }
  });
  return {phases: ph, steps: o.whole ? (ph.length ? 1 : 0) : ph.length};
}
function durationOf(pl, k){
  var d = 0;
  pl.phases.forEach(function(p){ if (p.step === k) d = Math.max(d, p.off + p.dur); });
  return d;
}
// 段の中の時刻：済んだ段は Infinity、まだの段は -Infinity
function localTime(p, k, t){ return p.step < k ? Infinity : p.step > k ? -Infinity : t - p.off; }
function prog(lt, a, d){ if (lt === Infinity) return 1; if (!(lt > a)) return 0; return D.prog ? D.prog(lt, a, d) : Math.min(1, (lt - a) / d); }

D.syntax = {parse: parse, plan: plan, durationOf: durationOf, POS: POS, KIND: KIND};
if (!D.MotionElement) return;   // 試験（Node）では読み取りと段階だけ

// ---------------------------------------------------------------- 部品
var CSS = [
  "m-syntax{display:block;position:relative;color:var(--fg);font-family:var(--font-sans)}",
  "m-syntax .sx-s{display:flex;flex-wrap:wrap;align-items:flex-start}",
  "m-syntax .sx-w{display:inline-block;white-space:nowrap}",
  "m-syntax .sx-t{display:inline-block}",
  "m-syntax .sx-y{font-size:28px;line-height:1.4;margin:0 0 14px}",
].join("\n");
var TAGROW = 30;    // 括弧の名前の段の高さ（24px の字）
var LANE = 14;      // 矢印の段の間
var ROWH = 40;      // 要素の下線と記号の段の高さ
var POSH = 30;      // 品詞の段の高さ
var ON = function(v){ return /^(on|true|yes)$/i.test(String(v || "").trim()); };
var f1 = function(x){ return x.toFixed(1); };
D.define("m-syntax", class extends D.MotionElement {
  static variants = ["fade", "draw"];
  // データの形（kit/shape.js）：JSON ではなく、要素の中に 1 行 1 文の英文（「= 」の行は和訳）
  static shape = {text: true, example: "[S We] [V call] [O him] [C Ken].\n= 私たちは彼をケンと呼ぶ。"};
  static props = {
    size:  {type: "number", default: 36, doc: "英文の字の大きさ（px）"},
    pos:   {type: "string", default: "off", doc: "on で品詞（語[名]）を語の下に"},
    build: {type: "string", default: "steps", doc: "whole で全部を 1 段階に"},
    yaku:  {type: "bool", default: true, doc: "和訳（= の行）を最後に出す"},
  };
  get model(){ if (!this._m) this._m = parse(this._src !== undefined ? this._src : this.textContent); return this._m; }
  get plan(){
    if (!this._pl){ var P = this.props; this._pl = plan(this.model, {pos: ON(P.pos), yaku: P.yaku, whole: String(P.build).trim() === "whole"}); }
    return this._pl;
  }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.plan.steps; }
  duration(k){ return durationOf(this.plan, k); }
  mount(){
    var self = this, P = this.props, size = P.size, m = this.model, pos = ON(P.pos);
    this._src = this.textContent;
    m.warnings.forEach(function(w){ console.warn("m-syntax: " + w); });
    if (!/^(steps|whole)$/.test(String(P.build).trim())) console.warn('m-syntax: build="' + P.build + '" is not steps or whole (steps is used)');
    if (size < 27){ console.warn("m-syntax: size " + size + " is below 27 px (27 is used)"); size = 27; }
    this.size = size;
    this.variant = VARIANT.of(this);
    this.textContent = "";
    this.classList.add("plot");
    if (!document.getElementById("m-syntax-css")){ var st = document.createElement("style"); st.id = "m-syntax-css"; st.textContent = CSS; document.head.appendChild(st); }
    var W = this.clientWidth || 1184, H = this.clientHeight || 400;
    var mk = function(tag, cls, parent, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; parent.appendChild(e); return e; };
    var box = mk("div", "sx-text", this);
    box.setAttribute("aria-hidden", "true");
    this.box = box;
    var svg = D.el("svg", {width: W, height: H, viewBox: "0 0 " + W + " " + H, "aria-hidden": "true", style: "position:absolute;left:0;top:0;overflow:visible;pointer-events:none"}, this);
    var gB = D.el("g", {}, svg), gL = D.el("g", {}, svg), gA = D.el("g", {}, svg);
    var BR = Math.round(size * 0.36);
    this.BR = BR;
    this.S = m.sentences.map(function(s){
      var G = 0, R = 0, L = 0;
      s.groups.forEach(function(g){ G = Math.max(G, g.depth + 1); });
      s.roles.forEach(function(r){ R = Math.max(R, r.depth + 1); });
      s.mods.forEach(function(o){ L = Math.max(L, o.lane); });
      var above = G * TAGROW + (L ? 14 + (L - 1) * LANE + 4 : 0) + 6, below = (pos ? POSH : 0) + R * ROWH + 6;
      var el = mk("div", "sx-s", box);
      el.style.cssText = "font-size:" + size + "px;line-height:1.25;column-gap:" + Math.round(size * 0.3) + "px;row-gap:" + (above + below) + "px;padding:" + above + "px 0 " + below + "px 0";
      var opens = s.tokens.map(function(){ return 0; }), closes = opens.slice();
      s.groups.forEach(function(g){ opens[g.a]++; closes[g.b]++; });
      var T = [], outer = null;
      s.tokens.forEach(function(t, i){
        if (t.punct && outer){ T.push({el: mk("span", "sx-p", outer, t.t), t: t}); return; }
        if (outer) el.appendChild(document.createTextNode(" "));   // 字として読むときの語の間（flex の中の空白は場所を取らない）
        outer = mk("span", "sx-w", el);
        var tx = mk("span", "sx-t", outer, t.t);
        if (opens[i] || closes[i]) tx.style.margin = "0 " + closes[i] * BR + "px 0 " + opens[i] * BR + "px";
        T.push({el: tx, t: t});
      });
      var S2 = {s: s, el: el, T: T, G: G, R: R, L: L};
      S2.roles = s.roles.map(function(r){
        var c = ROLE_COLOR[r.code];
        var line = D.el("path", {fill: "none", stroke: c, "stroke-width": 3, "stroke-linecap": "round", pathLength: 1}, gL);
        var lab = D.el("text", {"font-size": 28, "font-weight": 700, fill: c, "text-anchor": "middle"}, gL);
        lab.appendChild(document.createTextNode(r.lower ? r.code.toLowerCase() : r.code));
        if (r.sub){ var ts = D.el("tspan", {"font-size": 24, dy: 6}, lab); ts.textContent = r.sub; }
        return {r: r, line: line, lab: lab};
      });
      S2.groups = s.groups.map(function(g){
        return {g: g, path: D.el("path", {fill: "none", stroke: "var(--fg)", "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1}, gB),
          tag: (function(){ var e = D.el("text", {"font-size": 24, fill: "var(--fg)"}, gB); e.textContent = g.label; return e; })()};
      });
      S2.mods = s.mods.map(function(o){
        return {o: o, path: D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1}, gA),
          head: D.el("path", {d: "M0,0L-13,-6.5L-13,6.5Z", fill: "var(--emph)"}, gA)};
      });
      S2.pos = pos ? s.tokens.map(function(t, i){
        if (!t.pos) return null;
        var e = D.el("text", {"font-size": 24, fill: POS_COLOR[t.pos.cls], "text-anchor": "middle"}, gL);
        e.textContent = t.pos.tag;
        return {i: i, el: e};
      }).filter(Boolean) : [];
      S2.yaku = s.yaku && P.yaku ? mk("div", "sx-y", box, s.yaku) : null;
      return S2;
    });
    // 順番（段の中で何番目に出るか）：文の順、文の中は左から
    var cnt = {};
    var next = function(key){ cnt[key] = (cnt[key] || 0) + 1; return cnt[key] - 1; };
    var gIndex = [];
    this.S.forEach(function(S2){
      S2.pos.forEach(function(p){ p.j = next("pos"); });
      S2.roles.forEach(function(R2){ if (!R2.r.lower) R2.j = next("role" + R2.r.code); });
      S2.groups.forEach(function(G2){ G2.j = next("brackets"); });
      gIndex.push(S2.groups);
      S2.roles.forEach(function(R2){ if (R2.r.lower) R2.j = R2.r.owner >= 0 ? S2.groups[R2.r.owner].j : 0; });
      S2.mods.forEach(function(M2){ M2.j = next("arrows"); });
    });
    // 読める層（画面にも印刷にも出ない）：英文と構造と和訳を字で
    var lines = m.sentences.map(function(s){
      var span = function(a, b){ return s.tokens.slice(a, b + 1).map(function(t, i){ return (i && !t.punct ? " " : "") + t.t; }).join(""); };
      var out = [s.text];
      if (s.roles.length) out.push("要素：" + s.roles.map(function(r){ return (r.lower ? r.code.toLowerCase() : r.code) + r.sub + "「" + span(r.a, r.b) + "」"; }).join("、"));
      if (s.groups.length) out.push("括弧：" + s.groups.map(function(g){ return g.label + "「" + span(g.a, g.b) + "」"; }).join("、"));
      if (s.mods.length) out.push("修飾：" + s.mods.map(function(o){ return "「" + span(o.a, o.b) + "」→「" + s.tokens[o.to].t + "」"; }).join("、"));
      if (pos){ var ps = s.tokens.filter(function(t){ return t.pos; }); if (ps.length) out.push("品詞：" + ps.map(function(t){ return t.t + "（" + t.pos.name + "）"; }).join("、")); }
      if (s.yaku) out.push("訳：" + s.yaku);
      return out.join("　");
    });
    var sr = document.createElement("p");
    sr.className = "sr-only";
    sr.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0");
    sr.textContent = "文の構造：" + lines.join("；");
    this.appendChild(sr);
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", m.sentences.map(function(s){ return s.text; }).join(" ") + "（文の構造）");
  }
  // 要素の字の箱を部品の座標で。部品の外側の拡大（舞台の scale）によらない
  rect(e){
    var R = this.getBoundingClientRect(), sc = R.width / (this.offsetWidth || 1) || 1, r = e.getBoundingClientRect();
    return {l: (r.left - R.left) / sc, t: (r.top - R.top) / sc, r: (r.right - R.left) / sc, b: (r.bottom - R.top) / sc};
  }
  render(k, t, ctx){
    var self = this, P = this.props, pl = this.plan, draw = this.variant === "draw", BR = this.BR;
    var preview = !!(ctx && (ctx.preview || ctx.mode === "lecture")), PV = 0.45;
    if (preview){ PV = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); if (!(PV >= 0 && PV <= 1)) PV = 0.45; }
    // 段ごとの時刻と、薄く見せるか
    var phase = {};
    pl.phases.forEach(function(p){ phase[p.name === "role" ? "role" + p.code : p.name] = p; });
    var st = function(key){
      var p = phase[key];
      if (!p) return {lt: -Infinity, faint: false};
      var faint = preview && p.step > k;
      return {lt: faint ? Infinity : localTime(p, k, t), faint: faint};
    };
    var show = function(e, s, a, d){ var v = s.faint ? PV : prog(s.lt, a, d); e.setAttribute("opacity", v.toFixed(3)); return v; };
    var stroke = function(e, s, a, d, v){ e.setAttribute("stroke-dasharray", "1"); e.setAttribute("stroke-dashoffset", (draw && !s.faint ? 1 - prog(s.lt, a, d) : 0).toFixed(4)); if (draw && !s.faint) e.setAttribute("opacity", v > 0 ? 1 : 0); };
    var warns = [];
    this.S.forEach(function(S2){
      var s = S2.s, R = S2.R, G = S2.G;
      // 語の箱と行（上の位置が変わるところで次の行）
      var box = S2.T.map(function(x){ return self.rect(x.el); }), line = [], ln = 0, top = null;
      box.forEach(function(b, i){
        if (S2.T[i].t.punct){ line.push(ln); return; }
        if (top !== null && b.t > top + 4) ln++;
        top = b.t; line.push(ln);
      });
      // 範囲 a..b の語を行ごとの区間に（句読点は除く）
      var segs = function(a, b){
        var out = [];
        for (var i = a; i <= b; i++){
          if (S2.T[i].t.punct) continue;
          var x = box[i], last = out[out.length - 1];
          if (last && last.line === line[i]) last.r = x.r;
          else out.push({l: x.l, r: x.r, t: x.t, b: x.b, line: line[i]});
        }
        return out;
      };
      // ---- 品詞：語の下
      var sPos = st("pos");
      S2.pos.forEach(function(p){
        var x = box[p.i];
        p.el.setAttribute("x", f1((x.l + x.r) / 2)); p.el.setAttribute("y", f1(x.b + 24));
        show(p.el, sPos, 0.3 * p.j / Math.max(1, phase.pos ? phase.pos.n - 1 : 1), 0.5);
      });
      // ---- 要素：下線と記号。囲む要素の数だけ下の段（文の要素は同じ段にそろう）
      var posH = S2.pos.length ? POSH : 0;
      S2.roles.forEach(function(R2){
        var r = R2.r, sg = segs(r.a, r.b), row = R - 1 - r.depth, d = "", best = null;
        sg.forEach(function(g){
          var y = g.b + posH + 6 + row * ROWH;
          var cx = (g.l + g.r) / 2, hw = Math.max(14, (g.r - g.l) / 2 - 2);   // 1 字の語（I）でも記号の幅はある
          d += "M" + f1(cx - hw) + "," + f1(y) + "H" + f1(cx + hw);
          if (!best || g.r - g.l > best.r - best.l) best = {l: g.l, r: g.r, y: y};
        });
        R2.line.setAttribute("d", d || "M0,0");
        R2.lab.setAttribute("x", f1(best ? (best.l + best.r) / 2 : 0)); R2.lab.setAttribute("y", f1(best ? best.y + 27 : 0));
        var s1 = r.lower ? st("brackets") : st("role" + r.code), a = r.lower ? 0.3 * R2.j + 0.2 : 0.2 * R2.j;
        var v = show(R2.line, s1, a, 0.5); stroke(R2.line, s1, a, 0.5, v);
        show(R2.lab, s1, a + (draw ? 0.2 : 0), draw ? 0.3 : 0.5);
      });
      // ---- 括弧：最初の語の前と最後の語の後。同じ語で開く（閉じる）括弧は外のものほど外へ、少し高く
      var sB = st("brackets"), tags = [];
      var slot = function(i, key){ return s.groups.filter(function(g){ return g[key] === i; }).sort(function(x, y){ return y.depth - x.depth; }); };
      S2.groups.forEach(function(G2){
        var g = G2.g, A = box[g.a], B = box[g.b], shape = g.kind ? KIND[g.kind].shape : "round";
        var jo = slot(g.a, "a").indexOf(g), jc = slot(g.b, "b").indexOf(g), w = BR * 0.5;
        var glyph = function(x, t0, b0, dir){   // dir 1：開き（右へ開く）、-1：閉じ
          var h = w * dir, mid = (t0 + b0) / 2;
          if (shape === "square") return "M" + f1(x + h / 2) + "," + f1(t0) + "H" + f1(x - h / 2) + "V" + f1(b0) + "H" + f1(x + h / 2);
          if (shape === "angle") return "M" + f1(x + h / 2) + "," + f1(t0) + "L" + f1(x - h / 2) + "," + f1(mid) + "L" + f1(x + h / 2) + "," + f1(b0);
          return "M" + f1(x + h / 2) + "," + f1(t0) + "Q" + f1(x - h * 0.9) + "," + f1(mid) + " " + f1(x + h / 2) + "," + f1(b0);
        };
        var xo = A.l - BR * (jo + 0.5), xc = B.r + BR * (jc + 0.5);
        G2.path.setAttribute("d", glyph(xo, A.t + 4 - jo * 3, A.b - 4 + jo * 3, 1) + glyph(xc, B.t + 4 - jc * 3, B.b - 4 + jc * 3, -1));
        var a = 0.3 * G2.j, v = show(G2.path, sB, a, 0.5); stroke(G2.path, sB, a, 0.5, v);
        // 名前：開きの括弧の上。外の括弧ほど上の段。同じ段・同じ行で前の名前に重なれば右へずらす
        var row = G - 1 - g.depth, tw = Array.from(g.label).length * 24, x = xo - w / 2, y = A.t - 6 - row * TAGROW;
        tags.forEach(function(q){ if (q.line === line[g.a] && q.row === row && x < q.r + 8 && x + tw > q.l - 8) x = q.r + 8; });
        tags.push({line: line[g.a], row: row, l: x, r: x + tw});
        G2.tag.setAttribute("x", f1(x)); G2.tag.setAttribute("y", f1(y));
        show(G2.tag, sB, a, 0.5);
        G2.tagBox = {l: x, r: x + tw, t: y - 21};
      });
      // ---- 矢印：修飾する側（括弧の名前、または語）の上から段の高さへ上がり、頭の語の上へ下りる
      var sA = st("arrows"), ends = {};
      S2.mods.forEach(function(M2){ (ends[M2.o.to] = ends[M2.o.to] || []).push(M2); });
      Object.keys(ends).forEach(function(h){
        var list = ends[h], x = box[+h], n = list.length;
        list.sort(function(p, q){ return p.o.a - q.o.a; });
        list.forEach(function(M2, j){ M2.x1 = n === 1 ? (x.l + x.r) / 2 : x.l + (x.r - x.l) * (j + 1) / (n + 1); });
      });
      S2.mods.forEach(function(M2){
        var o = M2.o, H = box[o.to], x0, y0, x1 = M2.x1, y1 = H.t + 3, left = o.to < o.a;
        if (o.from.group !== undefined){ var tb = S2.groups[o.from.group].tagBox; x0 = left ? tb.l + 12 : tb.r - 12; y0 = tb.t - 2; }
        else { var F = box[o.from.token]; x0 = (F.l + F.r) / 2; y0 = F.t + 3; }
        var F0 = box[o.a];
        if (line[o.a] !== line[o.to]) warns.push("「" + s.tokens[o.a].t + "」から「" + s.tokens[o.to].t + "」への矢印が行をまたぐ（要素を広くするか size を小さく、文を短く）");
        var yl = Math.min(F0.t, H.t) - 6 - G * TAGROW - 10 - (o.lane - 1) * LANE, rr = Math.min(8, Math.abs(x1 - x0) / 2), sx = x1 < x0 ? -1 : 1;
        var d = "M" + f1(x0) + "," + f1(y0) + "V" + f1(yl + rr) + "Q" + f1(x0) + "," + f1(yl) + " " + f1(x0 + sx * rr) + "," + f1(yl) +
          "H" + f1(x1 - sx * rr) + "Q" + f1(x1) + "," + f1(yl) + " " + f1(x1) + "," + f1(yl + rr) + "V" + f1(y1 - 2);
        M2.path.setAttribute("d", d);
        M2.head.setAttribute("transform", "translate(" + f1(x1) + " " + f1(y1) + ") rotate(90)");
        var a = 0.4 * M2.j, v = show(M2.path, sA, a, 0.6); stroke(M2.path, sA, a, 0.6, v);
        if (draw && !sA.faint) M2.head.setAttribute("opacity", prog(sA.lt, a, 0.6) >= 0.98 ? 1 : 0);
        else show(M2.head, sA, a, 0.6);
      });
      // ---- 和訳
      if (S2.yaku){ var sY = st("yaku"); S2.yaku.style.opacity = (sY.faint ? PV : prog(sY.lt, 0, 0.6)).toFixed(3); }
    });
    // 収まらないとき（1 度だけ知らせる。描く絵は変えない）
    if (!this._warned){
      var last = this.box.lastElementChild, bottom = last ? last.offsetTop + last.offsetHeight : 0;
      if (bottom > this.clientHeight + 2) warns.push("要素の高さ " + this.clientHeight + "px に " + Math.ceil(bottom - this.clientHeight) + "px 足りない（要素を高くするか、文を分ける）");
      if (warns.length && document.fonts && document.fonts.status === "loaded"){ this._warned = true; warns.filter(function(w, i){ return warns.indexOf(w) === i; }).forEach(function(w){ console.warn("m-syntax: " + w); }); }
    }
  }
});
})();
