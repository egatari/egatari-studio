// m-curves：同じ座標軸に線を 1 本ずつ引く。線の名前は凡例でなく線の端に直接書く
// <m-curves xr="[-3,3]" yr="[0,0.5]" xt="[-2,0,2]" yt="[0,0.2,0.4]" xl="*y*" yl="密度" style="height:380px">
//   <script type="application/json">[{"label":"予測分布","f":"N(x,0,1)"},{"label":"中央値","pts":[[0,0],[0,0.4]],"dash":true}]
//   （JSON の終わり）</m-curves>
// 1 系列 = 1 段階（書いた順。系列の step で変えられ、同じ step の系列は一緒に引く）。f は x の式（Math の関数と N(x,平均,標準偏差) が使える）、pts は点列
(function(){
// ---- BEGIN egatari-expr (source: tools/expr.js; copy with `node tools/expr-sync.mjs`; do not edit inside a component) ----
// A safe arithmetic expression evaluator (Egatari spec §6: a component that evaluates an expression written in an attribute
// or in its data MUST restrict what it can do). It parses the text into a tree and evaluates the tree; it never calls eval,
// new Function or any other way of running text as code. What it accepts (JavaScript's meaning and precedence):
//   numbers 12  1.5  .5  1e-3 (no leading zero such as 010) | the variables the component allows (m-sweep: u c; m-curves: x)
//   Math.<constant>  Math.<function>(…)  — and, where the component allows it, the same names bare (PI, exp(…)) and its own
//   functions (m-curves: N(x, mean, sd)) | ( )  , between arguments only
//   unary + - !  |  **  (right-associative; -a ** b must be written (-a) ** b or -(a ** b))  |  * / %  |  + -
//   < <= > >=  |  == != === !==  |  &&  ||  |  c ? a : b
// Everything else is refused with a SyntaxError that names the problem: other names (fetch, globalThis, constructor, …),
// property access other than Math.<listed name>, calls of anything but the listed functions, strings, [ ], { }, =, ;,
// the comma operator, ^ & | ~ (write ** for a power), more than 2000 characters, nesting deeper than 64.
// Math.random is not listed (a component draws the same picture for the same step and time).
var EXPR = (function(){
  "use strict";
  var MAX_LEN = 2000, MAX_DEPTH = 64;
  var FUNCS = ["abs", "acos", "acosh", "asin", "asinh", "atan", "atan2", "atanh", "cbrt", "ceil", "cos", "cosh", "exp", "expm1",
    "floor", "hypot", "log", "log10", "log1p", "log2", "max", "min", "pow", "round", "sign", "sin", "sinh", "sqrt", "tan", "tanh", "trunc"];
  var CONSTS = ["E", "LN10", "LN2", "LOG10E", "LOG2E", "PI", "SQRT1_2", "SQRT2"];
  var M = Math;
  var TOKEN = /\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_$][\w$]*)|(\*\*|===|!==|==|!=|<=|>=|&&|\|\||[-+*/%<>!?:,().])/y;
  var BIN = {
    "||": 1, "&&": 2, "==": 3, "!=": 3, "===": 3, "!==": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6
  };
  function own(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
  function listed(list, k){ return list.indexOf(k) >= 0; }
  function quote(s){ s = String(s); return '"' + (s.length > 60 ? s.slice(0, 57) + "…" : s) + '"'; }

  function tokenize(src, fail){
    var out = [], i = 0;
    while (i < src.length){
      TOKEN.lastIndex = i;
      var m = TOKEN.exec(src);
      if (!m || m.index !== i){
        var ch = src.charAt(i);
        if (ch === "^") fail("^ is not allowed (write ** for a power)");
        if (ch === "'" || ch === '"' || ch === "`") fail("strings are not allowed");
        if (ch === "[" || ch === "]" || ch === "{" || ch === "}") fail(ch + " is not allowed");
        if (ch === "=") fail("= (assignment) is not allowed");
        fail("the character " + quote(ch) + " is not allowed");
      }
      i = TOKEN.lastIndex;
      if (m[1] !== undefined){
        if (/^0\d/.test(m[1])) fail("a number cannot start with 0 (" + m[1] + ")");
        out.push({k: "num", v: Number(m[1]), s: m[1]});
      }
      else if (m[2] !== undefined) out.push({k: "id", s: m[2]});
      else if (m[3] !== undefined) out.push({k: "op", s: m[3]});
    }
    out.push({k: "end", s: "the end"});
    return out;
  }

  // parse(src, opt) → tree. Nodes: {t: "num", v} {t: "var", i} {t: "call", f, args} {t: "un", op, a} {t: "bin", op, a, b} {t: "cond", c, a, b}
  function parse(src, opt, fail){
    if (typeof src !== "string") fail("the expression is not text");
    if (src.length > MAX_LEN) fail("longer than " + MAX_LEN + " characters");
    var toks = tokenize(src, fail), p = 0, depth = 0;
    var vars = opt.vars || [], funcs = opt.funcs || {}, bare = !!opt.bareMath;
    function peek(){ return toks[p]; }
    function isOp(s){ var t = toks[p]; return t.k === "op" && t.s === s; }
    function take(s){ if (!isOp(s) && isOp(".")) fail("property access is not allowed (only Math.<name>)"); if (!isOp(s)) fail("expected " + s + " before " + quote(peek().s)); p++; }
    function enter(){ if (++depth > MAX_DEPTH) fail("nested deeper than " + MAX_DEPTH); }
    function ternary(){
      enter();
      var c = binary(1);
      if (isOp("?")){ p++; var a = ternary(); take(":"); var b = ternary(); c = {t: "cond", c: c, a: a, b: b}; }
      depth--;
      return c;
    }
    function binary(min){
      var a = expo();
      for (;;){
        var t = peek(), lv = t.k === "op" && own(BIN, t.s) ? BIN[t.s] : 0;
        if (!lv || lv < min) return a;
        p++;
        a = {t: "bin", op: t.s, a: a, b: binary(lv + 1)};
      }
    }
    // ExponentiationExpression: UnaryExpression | UpdateExpression ** ExponentiationExpression (as in JavaScript)
    function expo(){
      var t = peek();
      if (t.k === "op" && (t.s === "-" || t.s === "+" || t.s === "!")){
        var u = unary();
        if (isOp("**")) fail("write (-a) ** b or -(a ** b), not -a ** b");
        return u;
      }
      var b = primary();
      if (isOp("**")){ p++; enter(); var e = expo(); depth--; return {t: "bin", op: "**", a: b, b: e}; }
      return b;
    }
    function unary(){
      var t = peek();
      if (t.k === "op" && (t.s === "-" || t.s === "+" || t.s === "!")){ p++; enter(); var a = unary(); depth--; return {t: "un", op: t.s, a: a}; }
      return primary();
    }
    function call(name, f){
      take("(");
      var args = [];
      if (!isOp(")")) for (;;){ args.push(ternary()); if (isOp(",")){ p++; continue; } break; }
      take(")");
      return {t: "call", name: name, f: f, args: args};
    }
    function mathName(n, shown){
      if (listed(CONSTS, n)) return {t: "num", v: M[n]};
      if (listed(FUNCS, n)){ if (!isOp("(")) fail(shown + " is a function: write " + shown + "(…)"); return call(shown, M[n]); }
      return null;
    }
    function primary(){
      var t = peek();
      if (t.k === "num"){ p++; return {t: "num", v: t.v}; }
      if (t.k === "op" && t.s === "("){ p++; var e = ternary(); take(")"); return e; }
      if (t.k !== "id") fail("unexpected " + quote(t.s));
      p++;
      var n = t.s, r;
      if (n === "Math"){
        take(".");
        var m = peek();
        if (m.k !== "id") fail("expected a name after Math.");
        p++;
        if ((r = mathName(m.s, "Math." + m.s))) return r;
        fail("Math." + m.s + " is not allowed");
      }
      if (bare && (r = mathName(n, n))) return r;
      var vi = vars.indexOf(n);
      if (vi >= 0) return {t: "var", i: vi};
      if (own(funcs, n)){ if (!isOp("(")) fail(n + " is a function: write " + n + "(…)"); return call(n, funcs[n]); }
      fail("the name " + n + " is not allowed (allowed: " + allowedNames(opt) + ")");
    }
    var tree = ternary();
    if (isOp(".")) fail("property access is not allowed (only Math.<name>)");
    if (peek().k !== "end") fail("unexpected " + quote(peek().s));
    return tree;
  }
  function allowedNames(opt){
    var a = (opt.vars || []).concat(Object.keys(opt.funcs || {}).map(function(n){ return n + "(…)"; }));
    return a.concat(opt.bareMath ? ["Math functions and constants (sin, PI, …)"] : ["Math.sin, Math.PI, …"]).join(", ");
  }

  // The tree becomes nested closures over the argument list (no text is run as code)
  function build(n){
    switch (n.t){
      case "num": var v = n.v; return function(){ return v; };
      case "var": var i = n.i; return function(a){ return a[i]; };
      case "call":
        var f = n.f, xs = n.args.map(build), k = xs.length;
        return function(a){ var v2 = new Array(k); for (var j = 0; j < k; j++) v2[j] = xs[j](a); return f.apply(undefined, v2); };
      case "un":
        var u = build(n.a);
        return n.op === "-" ? function(a){ return -u(a); } : n.op === "+" ? function(a){ return +u(a); } : function(a){ return !u(a); };
      case "cond":
        var c = build(n.c), x = build(n.a), y = build(n.b);
        return function(a){ return c(a) ? x(a) : y(a); };
      case "bin":
        var l = build(n.a), r = build(n.b);
        switch (n.op){
          case "+": return function(a){ return l(a) + r(a); };
          case "-": return function(a){ return l(a) - r(a); };
          case "*": return function(a){ return l(a) * r(a); };
          case "/": return function(a){ return l(a) / r(a); };
          case "%": return function(a){ return l(a) % r(a); };
          case "**": return function(a){ return l(a) ** r(a); };
          case "<": return function(a){ return l(a) < r(a); };
          case "<=": return function(a){ return l(a) <= r(a); };
          case ">": return function(a){ return l(a) > r(a); };
          case ">=": return function(a){ return l(a) >= r(a); };
          case "==": return function(a){ return l(a) == r(a); };   // eslint-disable-line eqeqeq
          case "!=": return function(a){ return l(a) != r(a); };   // eslint-disable-line eqeqeq
          case "===": return function(a){ return l(a) === r(a); };
          case "!==": return function(a){ return l(a) !== r(a); };
          case "&&": return function(a){ return l(a) && r(a); };
          case "||": return function(a){ return l(a) || r(a); };
        }
    }
    throw new Error("egatari-expr: unknown node");
  }

  // compile(src, {name, vars: ["u", "c"], funcs: {N: fn}, bareMath}) → function(v0, v1, …) that returns the value.
  // A refused expression throws a SyntaxError whose message starts with `<name> = "<src>": ` (the runtime then shows the
  // component's inline placeholder and records it in DECK.componentErrors).
  function compile(src, opt){
    opt = opt || {};
    var fail = function(msg){ throw new SyntaxError((opt.name || "expression") + " = " + quote(src) + ": " + msg); };
    var run = build(parse(src, opt, fail));
    return function(){ return run(arguments); };
  }
  return {compile: compile, FUNCS: FUNCS.slice(), CONSTS: CONSTS.slice(), MAX_LEN: MAX_LEN, MAX_DEPTH: MAX_DEPTH};
})();
// ---- END egatari-expr ----
DECK.define("m-curves", class extends DECK.MotionElement {
  // データの形（kit/shape.js）：線の配列。軸（xr yr xt yt xl yl）は属性に書く（JSON の中ではない）
  static shape = {
    schema: {type: "array", items: {type: "object", additionalProperties: false, anyOf: [{required: ["f"]}, {required: ["pts"]}],
      properties: {label: {type: "string"}, f: {type: "string"}, pts: {type: "array", items: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2}},
        tone: {type: "string"}, step: {type: "integer"}, labelAt: {type: "number"},
        color: {type: "string"}, dash: {type: "boolean"}, xr: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2},
        at: {type: "number"}, anchor: {enum: ["right", "left", "above", "below", "top", "bottom", "start", "middle", "end"]}, dx: {type: "number"}, dy: {type: "number"}, ly: {type: "number"}}}},
    example: [{label: "需要 D", f: "10 - x"}, {label: "供給 S", f: "2 + x"}, {label: "均衡", pts: [[4, 0], [4, 6]], dash: true}],
    // よくある書き違い（指示の部品の一覧に書く）
    note: {en: "the data is the array itself, not {\"series\": […]}; axes go in attributes (xr=\"[0,10]\" xl=\"…\"); the expression field is f in x (not fn, not u)",
           ja: "データは配列そのもの（{\"series\": […]} ではない）。軸は属性に書く（xr=\"[0,10]\" xl=\"…\"）。式の欄は f で、変数は x（fn・u ではない）"},
  };
  static props = {
    xr: {type: "json", default: [0, 1], doc: "横軸の範囲"}, yr: {type: "json", default: [0, 1], doc: "縦軸の範囲"},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    n:   {type: "number", default: 300, doc: "f を描く分割数"},
    dur: {type: "number", default: 1.0, doc: "1 本を引く秒数"},
    lw:  {type: "number", default: 3.5, doc: "線の太さ"},
  };
  // 系列 i の段階：step（書いてあれば）、なければ i + 1。段階の数はその最大（step がなければ系列の数で、今までと同じ）
  stepOf(s, i){ return s && s.step !== undefined ? s.step : i + 1; }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var self = this, m = 0;
    (this.data || []).forEach(function(s, i){ m = Math.max(m, self.stepOf(s, i)); });
    return m;
  }
  mount(){
    var P = this.props, D = DECK, self = this, S = this.data || [];
    this.classList.add("plot"); this.style.display = "block";
    var p = this.p = D.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xf: P.xf, yf: P.yf, xl: P.xl, yl: P.yl, m: {l: 86, r: 24, t: 24, b: 64}});
    var uid = "mc" + (++D.Plot.n), defs = D.el("defs", {}, p.svg);
    var N = function(x, m, s){ return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); };
    var x0 = p.m.l, x1 = p.W - p.m.r, y0 = p.m.t, y1 = p.H - p.m.b;
    // 系列ごとに：点列、線、（破線なら）描く範囲の mask、端の名前
    this.items = S.map(function(s, i){
      var pts;
      if (s.pts) pts = s.pts.map(function(q){ return [p.x(q[0]), p.y(q[1])]; });
      else {
        // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、実行系が札を出す
        var g = EXPR.compile(s.f, {name: "[" + i + "].f", vars: ["x"], funcs: {N: N}, bareMath: true}), a = s.xr ? s.xr[0] : P.xr[0], b = s.xr ? s.xr[1] : P.xr[1];
        pts = [];
        for (var j = 0; j <= P.n; j++){ var v = a + (b - a) * j / P.n; pts.push([p.x(v), p.y(g(v))]); }
      }
      var d = pts.map(function(q, j){ return (j ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("");
      var col = colorOf(s.tone || s.color, i);
      var it = {step: self.stepOf(s, i)};
      if (s.dash){
        // 破線は dasharray を描画に使えないので、同じ線を mask にして引く
        var mk = D.el("mask", {id: uid + "m" + i, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: p.W, height: p.H}, defs);
        it.mpath = D.el("path", {d: d, fill: "none", stroke: "#fff", "stroke-width": P.lw + 6, pathLength: 1, "stroke-dasharray": "1 2"}, mk);
        var gg = D.el("g", {mask: "url(#" + uid + "m" + i + ")", "clip-path": p.clip}, p.svg);
        it.path = D.el("path", {d: d, fill: "none", stroke: col, "stroke-width": P.lw, "stroke-dasharray": "10 8", "stroke-linecap": "butt"}, gg);
        it.draw = it.mpath;
      } else {
        it.path = D.el("path", {d: d, fill: "none", stroke: col, "stroke-width": P.lw, "clip-path": p.clip, pathLength: 1, "stroke-dasharray": "1 2", "stroke-linejoin": "round"}, p.svg);
        it.draw = it.path;
      }
      // 名前の位置：labelAt（横軸の値）の点、なければ描画範囲の中の最後の点。at は labelAt の古い名前（labelAt がないときだけ）
      var inside = pts.filter(function(q){ return q[0] >= x0 - .5 && q[0] <= x1 + .5 && q[1] >= y0 - .5 && q[1] <= y1 + .5; });
      var end = inside.length ? inside[inside.length - 1] : pts[pts.length - 1];
      var lat = s.labelAt !== undefined ? s.labelAt : s.at;
      if (lat !== undefined){
        var ax = p.x(lat), best = pts[0];
        pts.forEach(function(q){ if (Math.abs(q[0] - ax) < Math.abs(best[0] - ax)) best = q; });
        end = best;
      }
      // anchor：right（点の右から書く）・left（点の左で終わる）・above / below（点の上・下に中央そろえ、約 0.9 字ぶん離す）。
      // start / middle / end は古い書き方（text-anchor そのもの）で、今までどおり
      var an = {top: "above", bottom: "below"}[s.anchor] || s.anchor;   // top / bottom は above / below の別名
      var side = {right: "start", left: "end", above: "middle", below: "middle"}, anchor = side[an] || an || (end[0] > x1 - 160 ? "end" : "start");
      var ly0 = an === "above" ? end[1] - 14 : an === "below" ? end[1] + 32 : end[1] - 12;
      if (an === "below" && ly0 > y1 - 4) ly0 = end[1] - 14;   // 下に入らなければ上へ
      it.lx = end[0] + (anchor === "end" ? -8 : anchor === "start" ? 10 : 0) + (s.dx || 0);
      it.ly = (s.ly !== undefined ? p.y(s.ly) : ly0) + (s.dy || 0);
      // 字の幅の見積もり（記法の * _ ^ を除く。全角 26px、半角 15px）
      var w = 0; String(s.label || "").replace(/[*_^]/g, "").split("").forEach(function(ch){ w += ch.charCodeAt(0) > 255 ? 26 : 15; });
      it.x0 = anchor === "end" ? it.lx - w : anchor === "middle" ? it.lx - w / 2 : it.lx; it.x1 = it.x0 + w;
      it.anchor = anchor; it.col = col; it.label = s.label || "";
      return it;
    });
    // 名前どうしが重ならないように、横に重なる名前を下へずらす
    var min = 32, g = self.items.filter(function(it){ return it.label; }).sort(function(u, v){ return u.ly - v.ly; });
    g.forEach(function(it, j){
      for (var q = 0; q < j; q++){
        var o = g[q];
        if (it.x0 < o.x1 && o.x0 < it.x1 && it.ly - o.ly < min) it.ly = o.ly + min;
      }
    });
    this.items.forEach(function(it){
      it.lab = D.mtext(p.svg, it.lx, Math.max(26, it.ly), it.label, {"text-anchor": it.anchor, fill: it.col, "font-size": 26, "font-weight": 700, opacity: 0});
    });
    function colorOf(c, i){
      if (!c) return "var(--series-" + (i % 4 + 1) + ")";
      return c.indexOf("var(") === 0 ? c : "var(--" + c.replace(/^--/, "") + ")";
    }
  }
  duration(k){ return k >= 1 ? this.props.dur * 0.7 + 0.6 : 0; }
  render(k, t, ctx){
    var dur = this.props.dur, preview = !!(ctx && (ctx.preview || ctx.mode === "lecture")), PV = 0;
    // 先を薄く見せる表示：後の段階の線と名前を、引き終えた形のままテーマの --preview-opacity（なければ 0.45）で描く
    if (preview){ PV = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); if (!(PV >= 0 && PV <= 1)) PV = 0.45; }
    this.items.forEach(function(it){
      if (preview && it.step > k){
        it.draw.setAttribute("stroke-dashoffset", (0).toFixed(4));
        it.path.setAttribute("opacity", PV);
        it.lab.setAttribute("opacity", PV.toFixed(3));
        return;
      }
      var pd = it.step < k ? 1 : it.step === k ? DECK.prog(t, 0, dur) : 0;
      var pl = it.step < k ? 1 : it.step === k ? DECK.prog(t, dur * 0.7, 0.6) : 0;
      it.draw.setAttribute("stroke-dashoffset", (1 - pd).toFixed(4));
      it.path.setAttribute("opacity", pd > 0 ? 1 : 0);
      it.lab.setAttribute("opacity", pl.toFixed(3));
    });
  }
});
})();
