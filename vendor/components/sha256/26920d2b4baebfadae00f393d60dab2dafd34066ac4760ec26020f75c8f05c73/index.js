// m-sweep：パラメータを動かして関数の形の変化を見せる。前の形は灰色で残す
// <m-sweep f="u*u + c*u*u*u + c*c*u**4" values="[0,0.5,1]" xr="[-3,3]" yr="[0,16]" xt="[-2,0,2]" yt="[0,5,10,15]"
//          xl="*u*" yl="損失" param="c" style="height:380px"></m-sweep>
// 段階 k（1〜values.length-1）で、値を values[k-1] から values[k] へ動かす
DECK.define("m-sweep", class extends DECK.MotionElement {
  // データの形（kit/shape.js）：JSON の子はなく、属性で書く（values は数の配列、2 つ以上）
  static shape = {schema: null, example: '<m-sweep f="u*u + c*u" values="[0,0.5,1]" xr="[-3,3]" yr="[0,10]"></m-sweep>'};
  static props = {
    f:      {type: "string", default: "u*u", doc: "関数の式（JavaScript の式。変数は横軸 u とパラメータ c）"},
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
    var g = new Function("u", "c", "return " + P.f + ";");
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
