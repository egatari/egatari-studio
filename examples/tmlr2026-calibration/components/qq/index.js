// m-qq: Q-Q plot of logit residuals; synthetic (straight) morphs into a real learner (S-shape, heavy tails)
// <m-qq style="height:380px"><script type="application/json">{{JSON:qq.json}}</script></m-qq>
// data = {q:[theoretical N(0,1) quantiles], synthetic:[…], learner:[…]}  (standardized sample quantiles, same length)
// step 1: synthetic dots appear left to right along y = x
// step 2: lead-in (0–1.0 s) the "synthetic" label fades; from the cue (1.2 s) the dots morph to the learner
//         quantiles (center first, tails last) and shift color var(--term) → var(--emph)
DECK.define("m-qq", class extends DECK.MotionElement {
  static steps = 2;
  static props = {
    cue:  {type: "number", default: 1.2, doc: "step 2: when the morph starts (s); cues(2) = [0, cue]"},
    move: {type: "number", default: 1.4, doc: "step 2: seconds per dot move"},
    lag:  {type: "number", default: 0.35, doc: "step 2: extra delay of the outermost dots (tails move last)"},
  };
  mount(){
    var D = DECK, d = this.data;
    this.classList.add("plot"); this.style.display = "block";
    var all = d.synthetic.concat(d.learner), qm = Math.max.apply(null, d.q.map(Math.abs));
    var R = Math.max(3, Math.ceil(Math.max.apply(null, all.map(Math.abs)) * 2 + 0.3) / 2);   // half-step headroom
    var X = Math.max(3, Math.ceil(qm * 2 + 0.3) / 2), yt = [];
    for (var v = -2 * Math.floor(R / 2); v <= R; v += 2) yt.push(v);
    var p = this.p = D.Plot(this, {xr: [-X, X], yr: [-R, R], xt: [-2, 0, 2], yt: yt,
                                   xl: "theoretical quantile", yl: "sample quantile", m: {l: 86, r: 24, t: 20, b: 64}});
    var lo = Math.max(-X, -R), hi = Math.min(X, R);
    D.el("line", {x1: p.x(lo), y1: p.y(lo), x2: p.x(hi), y2: p.y(hi), stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "8 7"}, p.svg);
    this.labA = D.mtext(p.svg, p.x(-X) + 14, p.y(R) + 32, "synthetic: straight", {fill: "var(--term)", "font-size": 26, "font-weight": 700});
    this.labB = D.mtext(p.svg, p.x(-X) + 14, p.y(R) + 32, "learner: heavy tails", {fill: "var(--emph)", "font-size": 26, "font-weight": 700});
    var g = D.el("g", {"clip-path": p.clip}, p.svg), n = d.q.length;
    this.dots = d.q.map(function(q, i){
      return {c: D.el("path", {fill: "var(--term)"}, g), x: p.x(q), q: q, s: d.synthetic[i], l: d.learner[i],
              a: i / Math.max(1, n - 1), w: Math.abs(q) / qm};
    });
  }
  duration(k){ return k === 1 ? 1.3 : k === 2 ? this.props.cue + this.props.lag + this.props.move + 0.4 : 0; }
  cues(k){ return k === 2 ? [this.props.cue] : null; }
  render(k, t){
    var D = DECK, p = this.p, P = this.props;
    var tt = k >= 2 ? Infinity : t;
    var lead = k < 2 ? 0 : D.prog(t, 0, 1.0);
    this.labA.setAttribute("opacity", (k < 1 ? 0 : D.prog(tt, 0.7, 0.5) * (1 - lead)).toFixed(3));
    this.labB.setAttribute("opacity", (k < 2 ? 0 : D.prog(t, P.cue + P.lag + P.move - 0.2, 0.6)).toFixed(3));
    this.dots.forEach(function(o){
      var a = k < 1 ? 0 : D.prog(tt, 0.7 * o.a, 0.3);
      var e = k < 2 ? 0 : D.prog(t, P.cue + P.lag * o.w, P.move);
      o.c.setAttribute("d", qqDot(o.x, p.y(D.lerp(o.s, o.l, e)), 4.5));
      o.c.setAttribute("opacity", a.toFixed(3));
      o.c.style.fill = e <= 0 ? "var(--term)" : e >= 1 ? "var(--emph)"
        : "color-mix(in oklab, var(--emph) " + (100 * e).toFixed(1) + "%, var(--term))";
    });
  }
});
// dots are <path> arcs, not <circle>: Chrome's circle raster differed by a few AA pixels after partial repaints
// (kit/check.mjs "depends on call order"); paths raster identically
function qqDot(x, y, r){ return "M" + (x - r).toFixed(1) + "," + y.toFixed(1) + "a" + r + "," + r + " 0 1,0 " + 2 * r + ",0a" + r + "," + r + " 0 1,0 " + (-2 * r) + ",0Z"; }
