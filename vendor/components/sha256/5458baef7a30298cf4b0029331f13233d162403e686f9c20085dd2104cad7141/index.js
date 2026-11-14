// m-balance: expectation is the zero-moment position of probability weights.
egatariParts.define({name: "balance", version: "2.0.1", requires: {base: "1.2.0", plot: "1.1.2"}, element: "m-balance"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {title: "期待値はつり合いの位置", probability: "確率", sum: "確率の合計", expectation: "期待値"},
  en: {title: "Expectation is the balance point", probability: "probability", sum: "probability total", expectation: "expectation"}
};
function set(e, a, v){ e.setAttribute(a, String(v)); }
function ticks(lo, hi){
  var rough = (hi - lo) / 5, power = Math.pow(10, Math.floor(Math.log10(rough))), f = rough / power;
  var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power, out = [];
  for (var i = Math.ceil(lo / step); out.length < 10 && i * step <= hi + step * 1e-9; i++) out.push(+(i * step).toPrecision(12));
  return out;
}
function num(v){ return String(+v.toPrecision(6)); }
return class extends base.MotionElement {
  static partName = "balance";
  static preview = "none";
  static steps = 3;
  static shape = {schema: {type: "object", additionalProperties: false, required: ["values", "probs"], properties: {
    values: {type: "array", minItems: 2, maxItems: 12, items: {type: "number"}},
    probs: {type: "array", minItems: 2, maxItems: 12, items: {type: "number"}}, name: {type: "string"}
  }}, example: {values: [0, 1, 2, 3], probs: [0.1, 0.3, 0.4, 0.2], name: "X"}};
  static props = {
    dur: {type: "number", default: 1.5, doc: "ステップの秒数"},
    digits: {type: "number", default: 2, doc: "期待値の小数桁"},
    size: {type: "number", default: 0, doc: "文字 px（0 は 26）"}
  };
  duration(k){ return k >= 1 && k <= 3 ? this.props.dur : 0; }
  label(g, x, y, s, anchor){
    var e = base.el("text", {x: x, y: y, "font-size": this.fs, "text-anchor": anchor || "start", fill: "var(--fg)"}, g);
    e.textContent = s; return e;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props;
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[balance] dur must be positive; using 1.5"); P.dur = 1.5; }
    if (!Number.isInteger(P.digits) || P.digits < 0 || P.digits > 10){ ctx.report("attr", "[balance] digits must be an integer 0–10; using 2"); P.digits = 2; }
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[balance] size must be 0 or at least 24; using 26"); P.size = 0; }
    this.fs = P.size || 26;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb"; this.setAttribute("role", "img");
    if (d.values.length !== d.probs.length || new Set(d.values).size !== d.values.length){ ctx.report("data", "[balance] values must be distinct and probs must have the same length"); return; }
    var total = d.probs.reduce(function(s, p){ return s + p; }, 0);
    if (Math.abs(total - 1) > 1e-9) ctx.report("data", "[balance] probs must sum to 1 (±1e-9); drawing supplied weights, total " + total);
    if (d.probs.some(function(p){ return p < 0 || p > 1; })){ ctx.report("data", "[balance] probabilities must be between 0 and 1"); return; }
    // Scale before sums and coordinate differences to keep finite extreme values usable.
    var scale = Math.pow(10, Math.floor(Math.log10(Math.max(1, ...d.values.map(Math.abs))))), vals = d.values.map(function(v){ return v / scale; });
    var expectedN = vals.reduce(function(s, v, i){ return s + v * d.probs[i]; }, 0), expected = expectedN * scale;
    if (!Number.isFinite(expected)){ ctx.report("data", "[balance] expectation exceeds the numerical range; rescale values"); return; }
    var lo = Math.min(...vals, expectedN), hi = Math.max(...vals, expectedN), span = hi - lo;
    if (!(span > 0)){ ctx.report("data", "[balance] values are too close to represent; rescale values"); return; }
    var name = d.name === undefined ? "X" : d.name, answer = String(+expected.toFixed(P.digits));
    var expectation = "E[" + name + "] = " + answer;
    var terms = d.values.map(function(v, i){ return (v < 0 ? "(" + num(v) + ")" : num(v)) + "×" + num(d.probs[i]); });
    var formula = terms.slice(0, 6).join(" + ") + (terms.length > 6 ? " + …" : "") + " = " + answer;
    this.model = {values: d.values.slice(), probs: d.probs.slice(), total: total, expected: expected, expectedN: expectedN, scale: scale, name: name, formula: formula, lo: lo, hi: hi};
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.T.title + "; " + d.values.map(function(v, i){ return num(v) + ": " + self.T.probability + " " + num(d.probs[i]); }).join("; ") + "; " + this.T.sum + " " + num(total) + "; " + this.T.expectation + " " + expectation + "; " + formula);
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = this.fs, line = fs * 1.45 + 4;
    var width = function(s){ return base.textWidth(s, fs, {font: self}); };
    var pad = Math.max(56, ...d.values.map(function(v){ return width(num(v)) / 2 + 16; }));
    var axisY = H / 2, plot = deps.plot.Plot(this, {xr: [lo, hi], yr: [0, 1], xt: [], yt: [], noY: true, m: {l: pad, r: pad, t: 0, b: H - axisY}});
    this.svg = plot.svg; set(this.svg, "width", W); set(this.svg, "height", H); set(this.svg, "aria-hidden", "true");
    var axes = Array.from(this.svg.children).filter(function(e){ return e.getAttribute("class") === "axes"; })[0]; this.svg.removeChild(axes);
    this.weightLayer = base.el("g", {opacity: 0}, this.svg);
    this.beam = base.el("g", {}, this.weightLayer);
    base.el("line", {x1: pad, x2: W - pad, y1: axisY, y2: axisY, stroke: "var(--muted)", "stroke-width": 4}, this.beam);
    var plotWidth = Math.max(1, W - 2 * pad), maxRise = plotWidth * Math.sin(8 * Math.PI / 180) / 4;
    var barH = Math.max(20, axisY - 1.45 * fs - maxRise - 24), maxP = Math.max(1e-12, ...d.probs);
    var positions = vals.map(plot.x), sorted = positions.slice().sort(function(a, b){ return a - b; });
    var minGap = Math.min(...sorted.slice(1).map(function(x, i){ return x - sorted[i]; })), bw = Math.max(2, Math.min(44, minGap - 12));
    var small = W < 2 * pad + 40 || axisY - barH - 1.1 * fs - maxRise < 0 || axisY + plotWidth * Math.sin(8 * Math.PI / 180) + line + fs * 0.4 > H;
    this.bars = d.values.map(function(v, i){
      var h = d.probs[i] / maxP * barH, x = positions[i], s = num(d.probs[i]);
      var bar = base.el("rect", {x: x - bw / 2, y: axisY - h, width: bw, height: h, fill: "var(--term)"}, self.beam);
      var text = self.label(self.beam, x, axisY - h - fs * 0.4 - 8, s, "middle");
      return {bar: bar, text: text, x: x, h: h, w: width(s)};
    });
    this.bars.forEach(function(a, i){ self.bars.slice(i + 1).forEach(function(b){
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && Math.abs(a.h - b.h) < 1.45 * fs + 4) small = true;
      // A neighbouring tall bar must not run through a probability label.
      if (Math.abs(a.x - b.x) < a.w / 2 + bw / 2 + 4 && b.h > a.h + 4 || Math.abs(a.x - b.x) < b.w / 2 + bw / 2 + 4 && a.h > b.h + 4) small = true;
    }); });
    // Nice ticks in normalized coordinates; labels retain the original units.
    this.ticks = ticks(lo, hi);
    var lastRight = -Infinity;
    this.ticks.forEach(function(v){
      var x = plot.x(v), s = num(v * scale), w = width(s);
      if (x - w / 2 < lastRight + 4 || x - w / 2 < 0 || x + w / 2 > W) small = true;
      lastRight = x + w / 2;
      base.el("line", {x1: x, x2: x, y1: axisY, y2: axisY + 6, stroke: "var(--muted)", "stroke-width": 2}, self.beam);
      self.label(self.beam, x, axisY + line, s, "middle");
    });
    this.fulcrum = base.el("g", {opacity: 0}, this.svg);
    base.el("path", {d: "M0," + (axisY + 2) + "l-18,26h36Z", fill: "var(--emph-tint)", stroke: "var(--emph)", "stroke-width": 3}, this.fulcrum);
    this.finalLayer = base.el("g", {opacity: 0}, this.svg);
    this.start = plot.x(Math.min(...vals)); this.end = plot.x(expectedN); this.axisY = axisY;
    var ew = width(expectation), labelX = Math.max(ew / 2 + 4, Math.min(W - ew / 2 - 4, this.end));
    var labelY = axisY + 2 * line + 14, formulaY = H - fs * 0.4 - 4;
    this.label(this.finalLayer, labelX, labelY, expectation, "middle");
    // The sum has numeric terms only; variable names above are literal text.
    this.formulaText = base.mtext(this.finalLayer, W / 2, formulaY, formula, {"font-size": fs, "text-anchor": "middle", fill: "var(--fg)"});
    if (ew > W - 8 || width(formula) > W - 8 || formulaY - labelY < line || labelY + fs * 0.4 > H) small = true;
    if (small) ctx.report("size", "[balance] weights, ticks, tilt or formula do not fit; enlarge the element or separate close values");
  }
  render(k, t){
    if (!this.model) return;
    var dur = this.props.dur, e = k > 2 ? 1 : k < 2 ? 0 : base.prog(t, 0, dur);
    var pivot = base.lerp(this.start, this.end, e), m = this.model;
    var pivotN = base.lerp(Math.min(...m.values.map(function(v){ return v / m.scale; })), m.expectedN, e);
    // Positive moment means a heavier right side (clockwise in SVG). At E, the beam levels.
    var moment = m.values.reduce(function(s, v, i){ return s + (v / m.scale - pivotN) * m.probs[i]; }, 0);
    var angle = k >= 2 && e < 1 ? Math.max(-8, Math.min(8, 8 * moment / (m.hi - m.lo))) : 0;
    set(this.weightLayer, "opacity", k > 1 ? 1 : k < 1 ? 0 : base.prog(t, 0, dur));
    set(this.beam, "transform", "rotate(" + angle + " " + pivot + " " + this.axisY + ")");
    set(this.fulcrum, "opacity", k >= 1 ? 1 : 0); set(this.fulcrum, "transform", "translate(" + pivot + " 0)");
    set(this.finalLayer, "opacity", k > 3 ? 1 : k < 3 ? 0 : base.prog(t, 0, dur));
  }
};
});
