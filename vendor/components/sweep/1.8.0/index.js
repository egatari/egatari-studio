// m-sweep：パラメータを動かして関数の形の変化を見せる。前の形は灰色で残す
// <m-sweep f="u*u + c*u*u*u + c*c*u**4" values="[0,0.5,1]" xr="[-3,3]" yr="[0,16]" xt="[-2,0,2]" yt="[0,5,10,15]"
//          xl="*u*" yl="損失" param="c" style="height:380px"></m-sweep>
// 段階 k（1〜values.length-1）で、値を values[k-1] から values[k] へ動かす
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
DECK.define("m-sweep", class extends DECK.MotionElement {
  // データの形（kit/shape.js）：JSON の子はなく、属性で書く（values は数の配列、2 つ以上）
  static shape = {schema: null, example: '<m-sweep f="u*u + c*u" values="[0,0.5,1]" xr="[-3,3]" yr="[0,10]"></m-sweep>'};
  static props = {
    f:      {type: "string", default: "u*u", doc: "関数の式（算術の式。変数は横軸 u とパラメータ c。Math.exp(…) などの Math の関数と定数、+ - * / % **、比較と ? : が使える）"},
    values: {type: "json",   default: [0, 1], doc: "パラメータの値の列。段階ごとに次の値へ動く", shape: {type: "array", items: {type: "number"}, minItems: 2}, example: [0, 0.5, 1]},
    param:  {type: "string", default: "c", doc: "表示するパラメータの名前"},
    xr: {type: "json", default: [-3, 3]}, yr: {type: "json", default: [0, 10]},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    digits: {type: "number", default: 2, doc: "表示する値の小数の桁数"},
    dur: {type: "number", default: 1.2, doc: "1 段階の動きの秒数"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.props.values.length - 1; }
  mount(){
    var P = this.props, D = DECK;
    this.classList.add("plot"); this.style.display = "block";
    // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、実行系が札を出す
    var g = EXPR.compile(P.f, {name: "f", vars: ["u", "c"]});
    this.g = function(c){ return function(u){ return g(u, c); }; };
    var p = this.p = D.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xl: P.xl, yl: P.yl, m: {l: 86, r: 10, t: 40, b: 64}});
    this.ghosts = P.values.map(function(){ return D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, "clip-path": p.clip, opacity: 0}, p.svg); });
    this.ghosts.forEach(function(e, i){ e.setAttribute("d", p.d(this.g(P.values[i]), P.xr[0], P.xr[1], 300)); }, this);
    this.cur = D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 3.5, "clip-path": p.clip}, p.svg);
    this.lab = D.mtext(p.svg, p.m.l + 10, 30, "", {fill: "var(--emph)", "font-size": 27});
  }
  duration(k){ return k >= 1 ? this.props.dur : 0; }
  render(k, t){
    var P = this.props, V = P.values;
    var to = V[Math.min(k, V.length - 1)], from = k >= 1 ? V[k - 1] : to;
    var c = DECK.lerp(from, to, DECK.prog(t, 0, P.dur));
    this.cur.setAttribute("d", this.p.d(this.g(c), P.xr[0], P.xr[1], 300));
    this.lab.textContent = P.param + " = " + c.toFixed(P.digits);
    V.forEach(function(v, i){ this.ghosts[i].setAttribute("opacity", i < k && v !== c ? 1 : 0); }, this);
  }
});
})();
