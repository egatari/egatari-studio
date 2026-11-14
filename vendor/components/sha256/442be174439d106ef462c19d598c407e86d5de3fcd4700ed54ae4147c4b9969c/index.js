// m-folds: the validation block advances through k train/validation splits.
egatariParts.define({name: "folds", version: "2.0.1", requires: {base: "1.2.0"}, element: "m-folds"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {train: "学習（学）", validate: "検証（検・枠）", t: "学", v: "検", error: "誤差", mean: "平均", fold: "分割"},
  en: {train: "train (T)", validate: "validate (V, outline)", t: "T", v: "V", error: "error", mean: "mean", fold: "fold"}
};
function set(e, a, v){ e.setAttribute(a, String(v)); }
function fmt(v){ return v.toFixed(2); }
return class extends base.MotionElement {
  static partName = "folds";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["k"], properties: {
    k: {type: "number"}, errors: {type: "array", items: {type: "number"}}, labels: {type: "array", items: {type: "string"}}
  }}, example: {k: 5, errors: [0.21, 0.18, 0.25, 0.19, 0.22], labels: ["1", "2", "3", "4", "5"]}};
  static props = {
    dur: {type: "number", default: 1, doc: "ステップの秒数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は 26）"}
  };
  get steps(){ var k = this.data.k; return Number.isInteger(k) && k >= 2 && k <= 10 ? k + 1 : 0; }
  duration(k){ return k >= 1 && k <= this.steps ? this.props.dur : 0; }
  label(g, x, y, s, anchor){
    var e = base.el("text", {x: x, y: y, "font-size": this.fs, "text-anchor": anchor || "start", fill: "var(--fg)"}, g);
    e.textContent = s; return e;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props;
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    var T = this.T;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[folds] dur must be positive; using 1"); P.dur = 1; }
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[folds] size must be 0 or at least 24; using 26"); P.size = 0; }
    this.fs = P.size || 26;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb"; this.setAttribute("role", "img");
    if (!Number.isInteger(d.k) || d.k < 2 || d.k > 10){ ctx.report("data", "[folds] k must be an integer 2–10"); return; }
    if (d.errors && (d.errors.length !== d.k || d.errors.some(function(v){ return v < 0; }))){ ctx.report("data", "[folds] errors must contain k non-negative numbers"); return; }
    if (d.labels && d.labels.length !== d.k){ ctx.report("data", "[folds] labels must contain k names"); return; }
    var labels = d.labels || Array.from({length: d.k}, function(_, i){ return String(i + 1); });
    var errors = d.errors || null, mean = errors ? errors.reduce(function(s, v){ return s + v / d.k; }, 0) : null;
    this.model = {k: d.k, labels: labels, errors: errors, mean: mean};
    var summary = labels.map(function(s, i){ return T.fold + " " + (i + 1) + ": " + T.validate + " " + s + ", " + T.train + " " + labels.filter(function(_, j){ return j !== i; }).join(", ") + (errors ? "; " + T.error + " " + fmt(errors[i]) : ""); }).join("; ");
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", summary + (errors ? "; " + T.mean + " " + fmt(mean) : ""));
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = this.fs, line = fs * 1.45 + 4;
    var width = function(s){ return base.textWidth(s, fs, {font: self}); };
    var errorWidth = errors ? Math.max(width(T.error), width(T.mean + " " + fmt(mean)), ...errors.map(function(v){ return Math.max(width(fmt(v)), fmt(v).length * fs * 0.62); })) + 8 : 0;
    var left = Math.max(42, width(String(d.k)) + 16), ex = W - errorWidth - 8, right = errors ? ex - 20 : W - 8;
    var bw = (right - left) / d.k, top = 2 * line + 16;
    var footer = errors ? line + fs * 0.4 : 0, minRow = Math.max(32, Math.ceil(fs * 1.2));
    var minHeight = Math.ceil(top + d.k * minRow + footer + 4);
    var rh = Math.max(minRow, Math.min(Math.max(44, line + 4), (H - top - footer - 4) / d.k)), bh = rh - 6;
    var letters = bh >= fs * 1.43;
    this.geometry = {row: rh, minRow: minRow, minHeight: minHeight, letters: letters};
    // Compact row numbers/errors use a monospace font whose box fits 32px rows.
    function rowLabel(g, x, y, s, anchor){
      var e = self.label(g, x, y, s, anchor);
      if (!letters) e.setAttribute("style", "font-family:ui-monospace, Menlo, Consolas, monospace;fill:var(--fg)");
      return e;
    }
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    this.header = base.el("g", {opacity: 0}, this.svg);
    function swatch(x, validate, text){
      base.el("rect", {x: x, y: 8, width: 32, height: fs * 1.45, fill: validate ? "var(--emph-tint)" : "var(--term-tint)", stroke: validate ? "var(--emph)" : "none", "stroke-width": 3}, self.header);
      self.label(self.header, x + 42, fs + 4, text);
    }
    var legend2 = 8 + 42 + width(T.train) + 28;
    swatch(8, false, T.train); swatch(legend2, true, T.validate);
    var legendWidth = Math.ceil(legend2 + 42 + width(T.validate) + 8);
    if (legendWidth > W) ctx.report("size", "[folds] legend needs " + legendWidth + " px width; element has " + W + " px");
    if (bw < 8) ctx.report("size", "[folds] " + d.k + " blocks have " + Math.floor(bw) + " px each; allow at least 8 px per block");
    labels.forEach(function(s, i){
      self.label(self.header, left + (i + 0.5) * bw, 2 * line, s, "middle");
      if (width(s) > bw - 8) ctx.report("size", "[folds] label " + (i + 1) + " needs " + Math.ceil(width(s)) + " px; block fits " + Math.max(0, Math.floor(bw - 8)) + " px (shorten the label)");
    });
    if (errors) this.label(this.header, ex, 2 * line, T.error);
    this.rows = labels.map(function(_, i){
      var g = base.el("g", {opacity: 0}, self.svg), y = top + i * rh;
      rowLabel(g, left - 12, y + bh / 2 + fs * 0.31, String(i + 1), "end");
      var blocks = labels.map(function(_, j){
        var valid = i === j, x = left + j * bw + 3;
        var rect = base.el("rect", {x: x, y: y, width: Math.max(1, bw - 6), height: bh, rx: 3, fill: valid ? "var(--emph-tint)" : "var(--term-tint)", stroke: valid ? "var(--emph)" : "none", "stroke-width": 3}, g);
        if (letters && bw - 6 >= 40) self.label(g, x + (bw - 6) / 2, y + bh / 2 + fs * 0.31, valid ? T.v : T.t, "middle");
        return {rect: rect, validation: valid};
      });
      if (errors) rowLabel(g, ex, y + bh / 2 + fs * 0.31, fmt(errors[i]));
      return {g: g, blocks: blocks};
    });
    this.finalLayer = base.el("g", {opacity: 0}, this.svg);
    var bottom = top + d.k * rh, finalY = bottom + line;
    if (errors){
      base.el("line", {x1: ex, x2: W - 8, y1: bottom + 6, y2: bottom + 6, stroke: "var(--muted)", "stroke-width": 2}, this.finalLayer);
      this.label(this.finalLayer, ex, finalY, T.mean + " " + fmt(mean));
    }
    if (H < minHeight) ctx.report("size", "[folds] k = " + d.k + " needs at least " + minHeight + " px height (header " + top.toFixed(1) + " + " + d.k + " × " + minRow + " rows + " + (footer + 4).toFixed(1) + " footer); element has " + H + " px");
  }
  render(k, t){
    if (!this.model) return;
    var dur = this.props.dur, phase = function(step){ return k > step ? 1 : k < step ? 0 : base.prog(t, 0, dur); };
    set(this.header, "opacity", phase(1));
    this.rows.forEach(function(o, i){ set(o.g, "opacity", phase(i + 1)); });
    set(this.finalLayer, "opacity", phase(this.model.k + 1));
  }
};
});
