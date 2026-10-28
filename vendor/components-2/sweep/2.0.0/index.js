// m-sweep：パラメータを動かして関数の形の変化を見せる。前の形は灰色で残す
// <m-sweep f="u*u + c*u*u*u + c*c*u**4" values="[0,0.5,1]" xr="[-3,3]" yr="[0,16]" xt="[-2,0,2]" yt="[0,5,10,15]"
//          xl="*u*" yl="損失" param="c" style="height:380px"></m-sweep>
// 段階 k（1〜values.length-1）で、値を values[k-1] から values[k] へ動かす
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity、plot の Plot、expr の compile を使い、
// プレイヤーのグローバルは使わない（1.x は式の評価器 egatari-expr を写して持っていた）
egatariParts.define({name: "sweep", version: "2.0.0", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"}, element: "m-sweep"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot, expr = deps.expr;
return class extends base.MotionElement {
  static partName = "sweep";   // the registry name (define meta name), for report prefixes
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
    var P = this.props, D = base;
    this.classList.add("plot"); this.style.display = "block";
    // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、base が受け止めて札を出す（spec §6.1 Containment）
    var g = expr.compile(P.f, {name: "f", vars: ["u", "c"]});
    this.g = function(c){ return function(u){ return g(u, c); }; };
    var p = this.p = plot.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xl: P.xl, yl: P.yl, m: {l: 86, r: 10, t: 40, b: 64}});
    this.ghosts = P.values.map(function(){ return D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, "clip-path": p.clip, opacity: 0}, p.svg); });
    this.ghosts.forEach(function(e, i){ e.setAttribute("d", p.d(this.g(P.values[i]), P.xr[0], P.xr[1], 300)); }, this);
    this.cur = D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 3.5, "clip-path": p.clip}, p.svg);
    this.lab = D.mtext(p.svg, p.m.l + 10, 30, "", {fill: "var(--emph)", "font-size": 27});
  }
  duration(k){ return k >= 1 ? this.props.dur : 0; }
  render(k, t, ctx){
    var P = this.props, V = P.values, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0;
    // 先を薄く見せる表示：後の段階で動いていく先の値の線を、強調の色でテーマの --preview-opacity（なければ 0.45）で描く
    var to = V[Math.min(k, V.length - 1)], from = k >= 1 ? V[k - 1] : to;
    var c = base.lerp(from, to, base.prog(t, 0, P.dur));
    this.cur.setAttribute("d", this.p.d(this.g(c), P.xr[0], P.xr[1], 300));
    this.lab.textContent = P.param + " = " + c.toFixed(P.digits);
    V.forEach(function(v, i){
      var e = this.ghosts[i], ahead = preview && i > k && v !== c, col = ahead ? "var(--emph)" : "var(--line)";
      // style は base.el と同じ書き方で書く（style.stroke に代入すると "stroke: var(--x);" になり、作った直後と字が変わる）
      e.setAttribute("style", "stroke:" + col + ";");
      e.setAttribute("opacity", ahead ? PV : i < k && v !== c ? 1 : 0);
    }, this);
  }
};
});
