// m-ci: repeated normal samples and known-sigma z confidence intervals.
egatariParts.define({name: "ci", version: "2.0.1", requires: {base: "1.2.0", plot: "1.1.2"}, element: "m-ci"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {count: function(h, r, p){ return "μ を含む：" + h + " / " + r + "（" + p + " %）"; }, meaning: "信頼区間：反復した区間の約", end: " % が μ を含む"},
  en: {count: function(h, r, p){ return "contain μ: " + h + " / " + r + " (" + p + " %)"; }, meaning: "Confidence intervals: about ", end: "% of repeated intervals contain μ"}
};
function set(e, a, v){ e.setAttribute(a, String(v)); }
function random(seed){
  return function(){
    seed = (seed + 0x6D2B79F5) | 0;
    var z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z ^= z + Math.imul(z ^ z >>> 7, 61 | z);
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
// Acklam's rational inverse-normal approximation; central and tail regions.
function quantile(p){
  var q, r;
  if (p < 0.02425 || p > 0.97575){
    q = Math.sqrt(-2 * Math.log(p < 0.02425 ? p : 1 - p));
    r = (((((-0.007784894002430293 * q - 0.3223964580411365) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783) /
      ((((0.007784695709041462 * q + 0.3224671290700398) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1);
    return p < 0.02425 ? r : -r;
  }
  q = p - 0.5; r = q * q;
  return (((((-39.69683028665376 * r + 220.9460984245205) * r - 275.9285104469687) * r + 138.357751867269) * r - 30.66479806614716) * r + 2.506628277459239) * q /
    (((((-54.47609879822406 * r + 161.5858368580409) * r - 155.6989798598866) * r + 66.80131188771972) * r - 13.28068155288572) * r + 1);
}
function ticks(lo, hi){
  var rough = (hi - lo) / 5, power = Math.pow(10, Math.floor(Math.log10(rough))), f = rough / power;
  var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power, out = [];
  for (var i = Math.ceil(lo / step); out.length < 10 && i * step <= hi + step * 1e-9; i++) out.push(+(i * step).toPrecision(12));
  return out;
}
function num(v){ return String(+v.toPrecision(6)); }
return class extends base.MotionElement {
  static partName = "ci";
  static preview = "none";
  static steps = 3;
  static shape = {schema: {type: "object", additionalProperties: false, required: ["mu", "sigma", "n"], properties: {
    mu: {type: "number"}, sigma: {type: "number"}, n: {type: "number"}, reps: {type: "number"}, level: {type: "number"}, seed: {type: "number"}
  }}, example: {mu: 50, sigma: 10, n: 25, reps: 40, level: 0.95, seed: 2}};
  static props = {
    dur: {type: "number", default: 1, doc: "ステップの秒数"},
    fast: {type: "number", default: 2.5, doc: "残りの区間の秒数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は 26）"}
  };
  duration(k){
    if (k < 1 || k > 3) return 0;
    var r = this.model ? this.model.reps : this.data.reps === undefined ? 40 : this.data.reps;
    return k === 2 ? Math.min(3, r) * this.props.dur + (r > 3 ? this.props.fast : 0) : this.props.dur;
  }
  label(g, x, y, s, anchor){
    var e = base.el("text", {x: x, y: y, "font-size": this.fs, "text-anchor": anchor || "start", fill: "var(--fg)"}, g);
    e.textContent = s; return e;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props;
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    ["dur", "fast"].forEach(function(key){ if (!(Number.isFinite(P[key]) && P[key] > 0)){ ctx.report("attr", "[ci] invalid " + key + "; using default"); P[key] = key === "dur" ? 1 : 2.5; } });
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[ci] size must be 0 or at least 24; using 26"); P.size = 0; }
    this.fs = P.size || 26;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.setAttribute("role", "img");
    var reps = d.reps === undefined ? 40 : d.reps, level = d.level === undefined ? 0.95 : d.level, seed = d.seed === undefined ? 2 : d.seed;
    if (!(d.sigma > 0) || !Number.isSafeInteger(d.n) || d.n < 1 || !Number.isSafeInteger(reps) || reps < 1 || !(level > 0 && level < 1)){
      ctx.report("data", "[ci] sigma > 0, positive safe integers n and reps and 0 < level < 1 required"); return;
    }
    if (!Number.isSafeInteger(seed)){ ctx.report("data", "[ci] seed must be a safe integer; using 2"); seed = 2; }
    var z = level === 0.9 ? 1.645 : level === 0.95 ? 1.96 : level === 0.99 ? 2.576 : -quantile((1 - level) / 2);
    var half = z * (d.sigma / Math.sqrt(d.n)), rng = random(seed), intervals = [], spare = null;
    function normal(){
      if (spare !== null){ var saved = spare; spare = null; return saved; }
      // 1-rng() is in (0,1], so Box–Muller never takes log(0).
      var radius = Math.sqrt(-2 * Math.log(1 - rng())), angle = 2 * Math.PI * rng();
      spare = radius * Math.sin(angle);
      return radius * Math.cos(angle);
    }
    for (var i = 0; i < reps; i++){
      var sum = 0;
      for (var j = 0; j < d.n; j++){
        sum += normal();
      }
      var mean = d.mu + d.sigma * (sum / d.n), lo = mean - half, hi = mean + half;
      intervals.push({mean: mean, lo: lo, hi: hi, hit: lo <= d.mu && hi >= d.mu});
    }
    var low = Math.min(d.mu, ...intervals.map(function(o){ return o.lo; })), high = Math.max(d.mu, ...intervals.map(function(o){ return o.hi; }));
    if (![z, half, low, high, high - low].every(Number.isFinite) || !(high > low)){
      ctx.report("data", "[ci] numerical range cannot represent these intervals; rescale mu and sigma"); return;
    }
    var hits = intervals.filter(function(o){ return o.hit; }).length;
    this.model = {mu: d.mu, sigma: d.sigma, n: d.n, reps: reps, level: level, seed: seed, z: z, half: half, intervals: intervals, hits: hits};
    var count = this.T.count(hits, reps, +(100 * hits / reps).toFixed(1)), muLabel = "μ = " + num(d.mu);
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.T.meaning + num(level * 100) + this.T.end + "; " + muLabel + "; σ = " + num(d.sigma) + "; n = " + d.n + "; " + count);
    var fs = this.fs, line = fs * 1.45 + 4, W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight);
    var axisY = H - 2 * line - fs * 0.4 - 4, top = line + 14, bottom = axisY - 14;
    var pad = (high - low) * 0.05;
    if (!Number.isFinite(low - pad) || !Number.isFinite(high + pad) || !Number.isFinite((high + pad) - (low - pad))) pad = 0;
    low -= pad; high += pad;
    var plot = deps.plot.Plot(this, {xr: [low, high], yr: [0, 1], xt: [], yt: [], noY: true, m: {l: 48, r: 48, t: 0, b: H - axisY}});
    this.svg = plot.svg; set(this.svg, "width", W); set(this.svg, "height", H); set(this.svg, "aria-hidden", "true");
    var axes = Array.from(this.svg.children).filter(function(e){ return e.getAttribute("class") === "axes"; })[0]; this.svg.removeChild(axes);
    this.axisLayer = base.el("g", {opacity: 0}, this.svg);
    base.el("line", {x1: 48, x2: W - 48, y1: axisY, y2: axisY, stroke: "var(--muted)", "stroke-width": 2}, this.axisLayer);
    var small = W < 160 || bottom - top < Math.max(1, reps - 1) * 6, lastRight = -Infinity;
    ticks(low, high).forEach(function(v){
      var x = plot.x(v), s = num(v), w = base.textWidth(s, fs, {font: self});
      if (x - w / 2 < lastRight + 4 || x - w / 2 < 0 || x + w / 2 > W) small = true;
      lastRight = x + w / 2;
      base.el("line", {x1: x, x2: x, y1: axisY, y2: axisY + 6, stroke: "var(--muted)", "stroke-width": 2}, self.axisLayer);
      self.label(self.axisLayer, x, axisY + line, s, "middle");
    });
    base.el("line", {x1: plot.x(d.mu), x2: plot.x(d.mu), y1: top - 4, y2: axisY, stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 4"}, this.axisLayer);
    var muWidth = base.textWidth(muLabel, fs, {font: this}), mx = Math.max(muWidth / 2 + 4, Math.min(W - muWidth / 2 - 4, plot.x(d.mu)));
    this.label(this.axisLayer, mx, fs + 4, muLabel, "middle");
    this.intervals = intervals.map(function(o, i){
      var g = base.el("g", {opacity: 0}, self.svg), y = reps === 1 ? (top + bottom) / 2 : top + i * (bottom - top) / (reps - 1);
      var segment = base.el("line", {x1: plot.x(o.lo), x2: plot.x(o.hi), y1: y, y2: y, stroke: "var(--term)", "stroke-width": 2}, g);
      var dot = base.el("circle", {cx: plot.x(o.mean), cy: y, r: 2.5, fill: "var(--term)"}, g);
      return {g: g, segment: segment, dot: dot};
    });
    this.finalLayer = base.el("g", {opacity: 0}, this.svg);
    this.label(this.finalLayer, W / 2, H - fs * 0.4 - 4, count, "middle");
    if (base.textWidth(count, fs, {font: this}) > W - 8 || muWidth > W - 8 || top > bottom) small = true;
    if (small) ctx.report("size", "[ci] intervals or labels do not fit; enlarge the element or reduce reps");
  }
  render(k, t){
    if (!this.model) return;
    var P = this.props, m = this.model;
    set(this.axisLayer, "opacity", k > 1 ? 1 : k < 1 ? 0 : base.prog(t, 0, P.dur));
    this.intervals.forEach(function(o, i){
      var start = i < 3 ? i * P.dur : 3 * P.dur + (i - 3) * P.fast / (m.reps - 3);
      var dur = i < 3 ? P.dur : P.fast / (m.reps - 3);
      set(o.g, "opacity", k > 2 ? 1 : k < 2 ? 0 : base.prog(t, start, dur));
      var miss = k >= 3 && !m.intervals[i].hit;
      set(o.segment, "style", "stroke:var(--" + (miss ? "emph" : "term") + ")");
      set(o.segment, "stroke-width", miss ? 4 : 2);
      set(o.dot, "style", "fill:var(--" + (miss ? "emph" : "term") + ")");
    });
    set(this.finalLayer, "opacity", k > 3 ? 1 : k < 3 ? 0 : base.prog(t, 0, P.dur));
  }
};
});
