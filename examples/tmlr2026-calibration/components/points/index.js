// m-points: binned reliability points before / after temperature scaling, with the theoretical curve
// <m-points style="height:380px"><script type="application/json">{{JSON:points.json}}</script></m-points>
// data = {tau, T, bins:[{x_raw,y_raw,x_cor,y_cor,n}], theory:{p:[…], C:[…]}}  (scripts/make_data.py)
// step 1: the theory curve draws, raw bin points pop in (radius ∝ sqrt(n))
// step 2: lead-in (0–1.0 s) the curve fades to muted; from the cue (1.2 s) the points slide onto the diagonal
DECK.define("m-points", class extends DECK.MotionElement {
  static steps = 2;
  static props = {
    cue:  {type: "number", default: 1.2, doc: "step 2: when the points start to move (s); cues(2) = [0, cue]"},
    move: {type: "number", default: 1.4, doc: "step 2: seconds per point move"},
  };
  mount(){
    var D = DECK, d = this.data, self = this;
    this.classList.add("plot"); this.style.display = "block";
    var p = this.p = D.Plot(this, {xr: [0, 1], yr: [0, 1], xt: [0, 0.5, 1], yt: [0, 0.5, 1], xf: 1, yf: 1,
                                   xl: "predicted", yl: "true probability", m: {l: 86, r: 24, t: 20, b: 64}});
    D.el("line", {x1: p.x(0), y1: p.y(0), x2: p.x(1), y2: p.y(1), stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "8 7"}, p.svg);
    var th = d.theory, pts = th.p.map(function(v, i){ return [v, th.C[i]]; });
    this.curve = D.el("path", {d: p.poly(pts), fill: "none", stroke: "var(--term)", "stroke-width": 3.5, "stroke-linejoin": "round",
                               pathLength: 1, "stroke-dasharray": "1 2", "clip-path": p.clip}, p.svg);
    // curve label below the curve, right half (the inverse S lies under the diagonal there)
    var j = nearest(th.p, 0.8);
    this.curveLab = D.mtext(p.svg, p.x(th.p[j]) + 4, p.y(th.C[j]) + 40, "theory", {fill: "var(--term)", "font-size": 26, "font-weight": 700});
    // status labels, top-left (empty region above the diagonal)
    this.labA = D.mtext(p.svg, p.x(0.03), p.y(0.95), "before", {fill: "var(--emph)", "font-size": 26, "font-weight": 700});
    this.labB = D.mtext(p.svg, p.x(0.03), p.y(0.95), "after, *T*\u00a0= " + (+d.T).toFixed(2), {fill: "var(--emph)", "font-size": 26, "font-weight": 700});
    var nmax = Math.max.apply(null, d.bins.map(function(b){ return b.n; }));
    var g = D.el("g", {}, p.svg);
    this.dots = d.bins.filter(function(b){ return b.n > 0; }).map(function(b){
      var c = D.el("path", {fill: "var(--emph)", stroke: "var(--bg)", "stroke-width": 1.5, "fill-opacity": 0.9}, g);
      return {c: c, b: b, r: +(4 + 10 * Math.sqrt(b.n / nmax)).toFixed(1)};
    });
    function nearest(a, v){ var k = 0; a.forEach(function(x, i){ if (Math.abs(x - v) < Math.abs(a[k] - v)) k = i; }); return k; }
  }
  duration(k){ var n = this.dots.length; return k === 1 ? 1.7 : k === 2 ? this.props.cue + this.props.move + 0.025 * (n - 1) : 0; }
  cues(k){ return k === 2 ? [this.props.cue] : null; }
  render(k, t){
    var D = DECK, p = this.p, P = this.props, n = this.dots.length;
    var tt = k >= 2 ? Infinity : t;                               // step-1 progress (complete from step 2 on)
    var draw = k < 1 ? 0 : D.prog(tt, 0, 1.0);
    var fade = k < 2 ? 0 : D.prog(t, 0, 1.0);                    // step-2 lead-in: curve to muted
    this.curve.setAttribute("stroke-dasharray", draw >= 1 ? "none" : "1 2");   // fully drawn: plain stroke (stable raster)
    this.curve.setAttribute("stroke-dashoffset", (1 - draw).toFixed(4));
    this.curve.setAttribute("opacity", draw > 0 ? D.lerp(1, 0.45, fade).toFixed(3) : 0);
    this.curve.style.stroke = fade > 0.5 ? "var(--muted)" : "var(--term)";
    this.curveLab.setAttribute("opacity", (k < 1 ? 0 : D.prog(tt, 0.8, 0.5) * D.lerp(1, 0.45, fade)).toFixed(3));
    this.curveLab.style.fill = fade > 0.5 ? "var(--muted)" : "var(--term)";
    var out = k < 2 ? 0 : D.prog(t, P.cue, 0.3), inn = k < 2 ? 0 : D.prog(t, P.cue + 0.3, 0.4);   // label swap at the cue, no overlap
    this.labA.setAttribute("opacity", (k < 1 ? 0 : D.prog(tt, 0.6, 0.5) * (1 - out)).toFixed(3));
    this.labB.setAttribute("opacity", inn.toFixed(3));
    this.dots.forEach(function(o, i){
      var a = k < 1 ? 0 : D.prog(tt, 0.4 + 0.05 * i, 0.3);
      var e = k < 2 ? 0 : D.prog(t, P.cue + 0.025 * i, P.move);
      o.c.setAttribute("d", pointsDot(p.x(D.lerp(o.b.x_raw, o.b.x_cor, e)), p.y(D.lerp(o.b.y_raw, o.b.y_cor, e)), o.r));
      o.c.setAttribute("opacity", a.toFixed(3));
    });
  }
});
// dots are <path> arcs, not <circle> (see m-qq: circle raster was not pixel-stable across seeks)
function pointsDot(x, y, r){ return "M" + (x - r).toFixed(1) + "," + y.toFixed(1) + "a" + r + "," + r + " 0 1,0 " + 2 * r + ",0a" + r + "," + r + " 0 1,0 " + (-2 * r) + ",0Z"; }
