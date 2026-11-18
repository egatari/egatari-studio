// m-folds: the validation block advances through k train/validation splits.
// 2.1.0: with `splits` (and `samples`), each sample is a cell and each row is one split from scikit-learn's splitter
// (KFold with shuffle, StratifiedKFold = クラスの比率を保つ KFold, GroupKFold, TimeSeriesSplit, a holdout): test cells as the
// validation block, train cells as before, unused cells empty; class colours and names, group runs, time order. The k mode
// draws exactly as 2.0.1.
egatariParts.define({name: "folds", version: "2.1.1", requires: {base: "1.3.0"}, element: "m-folds"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {train: "学習（学）", validate: "検証（検・枠）", t: "学", v: "検", error: "誤差", mean: "平均", fold: "分割", unused: "使わない", cls: "クラス", group: "グループ", time: "時間 →", test: "検証", trainS: "訓練"},
  en: {train: "train (T)", validate: "validate (V, outline)", t: "T", v: "V", error: "error", mean: "mean", fold: "fold", unused: "unused", cls: "class", group: "group", time: "time →", test: "validate", trainS: "train"}
};
function set(e, a, v){ e.setAttribute(a, String(v)); }
function fmt(v){ return v.toFixed(2); }
var PAL = ["var(--series-1)", "var(--series-3)", "var(--fg)", "var(--series-4)"];   // m-classify2d の CLASS_COLORS と同じ並び
return class extends base.MotionElement {
  static partName = "folds";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, anyOf: [{required: ["k"]}, {required: ["splits"]}], properties: {
    k: {type: "number"}, errors: {type: "array", items: {type: "number"}}, labels: {type: "array", items: {type: "string"}},
    samples: {type: "array", minItems: 2, maxItems: 60, items: {type: "object", additionalProperties: false, properties: {class: {type: "integer"}, group: {type: "string"}, t: {type: ["number", "string"]}}}},
    splits: {type: "array", minItems: 1, maxItems: 10, items: {type: "object", additionalProperties: false, required: ["test"], properties: {test: {type: "array", items: {type: "integer"}}, train: {type: "array", items: {type: "integer"}}}}},
    splitter: {type: "string", enum: ["KFold", "StratifiedKFold", "GroupKFold", "TimeSeriesSplit", "ShuffleSplit", "holdout"]},
    classes: {type: "array", maxItems: 4, items: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "integer"}, label: {type: "string"}}}}
  }}, example: {k: 5, errors: [0.21, 0.18, 0.25, 0.19, 0.22], labels: ["1", "2", "3", "4", "5"]}};
  static props = {
    dur: {type: "number", default: 1, doc: "ステップの秒数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は 26）"}
  };
  get steps(){ if (this.data.splits) return this.data.splits.length + 1; var k = this.data.k; return Number.isInteger(k) && k >= 2 && k <= 10 ? k + 1 : 0; }
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
    if (d.splits) return this.mountSamples(ctx);
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
    if (this.sm) return this.renderSamples(k, t);
    if (!this.model) return;
    var dur = this.props.dur, phase = function(step){ return k > step ? 1 : k < step ? 0 : base.prog(t, 0, dur); };
    set(this.header, "opacity", phase(1));
    this.rows.forEach(function(o, i){ set(o.g, "opacity", phase(i + 1)); });
    set(this.finalLayer, "opacity", phase(this.model.k + 1));
  }
  // 標本のモード（2.1.0）：列が標本、行が分割。データの確かめと描き方。クラスの色は --emph（検証の枠）と同じ色にならないよう
  // --series-2 を飛ばす（1 つの意味に 1 つの色）。m-classify2d の CLASS_COLORS と同じ並び
  mountSamples(ctx){
    var self = this, d = this.data, T = this.T, sp = d.splits, kind = d.splitter || "";
    var n = d.samples ? d.samples.length : 1 + Math.max.apply(null, [].concat.apply([], sp.map(function(s){ return s.test.concat(s.train || []); })).concat([0]));
    var samples = d.samples || Array.from({length: n}, function(){ return {}; }), bad = [];
    if (n < 2 || n > 60) bad.push("splits cover " + n + " samples; 2–60 can be drawn");
    var cls = {}; (d.classes || []).forEach(function(c, i){ cls[c.id] = i; });
    samples.forEach(function(s, i){ if (s.class !== undefined && !(s.class in cls)) bad.push("samples[" + i + "].class " + s.class + " is not in classes"); });
    var role = sp.map(function(s, r){
      var a = Array(n).fill(0), testSet = {};
      s.test.forEach(function(i){ if (!(i >= 0 && i < n)) bad.push("splits[" + r + "].test has " + i + " (samples 0–" + (n - 1) + ")"); else { a[i] = 2; testSet[i] = 1; } });
      (s.train || Array.from({length: n}, function(_, i){ return i; }).filter(function(i){ return !testSet[i]; })).forEach(function(i){
        if (!(i >= 0 && i < n)) bad.push("splits[" + r + "].train has " + i); else if (testSet[i]) bad.push("splits[" + r + "]: sample " + i + " is in both train and test"); else a[i] = 1;
      });
      return a;
    });
    // 分け方の決まり：KFold の仲間は、どの標本もちょうど 1 回だけ検証に入る
    var kfold = !kind || kind === "KFold" || kind === "StratifiedKFold" || kind === "GroupKFold";
    if (kfold){
      for (var i = 0; i < n; i++){ var c = role.filter(function(a){ return a[i] === 2; }).length; if (c !== 1){ bad.push("sample " + i + " is in the test set of " + c + " splits; " + (kind || "KFold") + " uses each sample once (set splitter for TimeSeriesSplit, ShuffleSplit or holdout)"); break; } }
    }
    if (kind === "GroupKFold") role.forEach(function(a, r){ var tr = {}, te = {}; a.forEach(function(v, i){ var g = samples[i].group; if (v === 1) tr[g] = 1; if (v === 2) te[g] = 1; }); Object.keys(te).forEach(function(g){ if (tr[g]) bad.push("splits[" + r + "]: group \"" + g + "\" is in both train and test (GroupKFold keeps a group together)"); }); });
    if (kind === "TimeSeriesSplit") role.forEach(function(a, r){ var lastTrain = a.lastIndexOf(1), firstTest = a.indexOf(2); if (lastTrain > firstTest && firstTest >= 0) bad.push("splits[" + r + "]: a train sample comes after a test sample (TimeSeriesSplit trains on the past)"); });
    if (kind === "holdout" && sp.length !== 1) bad.push("holdout has one split; got " + sp.length);
    if (kind === "StratifiedKFold") role.forEach(function(a, r){
      // クラスの比率を保つ：検証に入る各クラスの数が、全体の数 ÷ 分割数から 1 未満しかずれない
      Object.keys(cls).forEach(function(c){ var tot = samples.filter(function(s){ return String(s.class) === c; }).length, got = a.filter(function(v, i){ return v === 2 && String(samples[i].class) === c; }).length; if (Math.abs(got - tot / sp.length) >= 1) bad.push("splits[" + r + "]: class " + c + " has " + got + " test samples; StratifiedKFold keeps about " + +(tot / sp.length).toFixed(2)); });
    });
    if (d.errors && (d.errors.length !== sp.length || d.errors.some(function(v){ return v < 0; }))) bad.push("errors must contain one non-negative number per split");
    bad.forEach(function(s){ ctx.report("data", "[folds] " + s); });
    if (bad.length && bad.some(function(s){ return /samples 0–|2–60|errors must/.test(s); })) return;
    var errors = d.errors && d.errors.length === sp.length ? d.errors : null, mean = errors ? errors.reduce(function(s, v){ return s + v / errors.length; }, 0) : null;
    this.sm = {n: n, role: role, errors: errors, mean: mean};
    var used = role.some(function(a){ return a.indexOf(0) >= 0; });
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", (kind ? kind + ": " : "") + role.map(function(a, r){ return T.fold + " " + (r + 1) + ": " + T.test + " " + a.map(function(v, i){ return v === 2 ? i + 1 : null; }).filter(Boolean).join(", ") + (errors ? "; " + T.error + " " + fmt(errors[r]) : ""); }).join("; ") + (errors ? "; " + T.mean + " " + fmt(mean) : ""));
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = this.fs, line = Math.ceil(fs * 1.45 + 4);
    var width = function(s){ return base.textWidth(s, fs, {font: self}); };
    var hasCls = samples.some(function(s){ return s.class !== undefined; }), hasGrp = samples.some(function(s){ return s.group !== undefined; }), hasT = samples.some(function(s){ return s.t !== undefined; });
    var errorWidth = errors ? Math.max(width(T.error), width(T.mean + " " + fmt(mean)), width("0.00")) + 8 : 0;
    var stripLab = Math.max(hasCls ? width(T.cls) : 0, hasGrp ? width(T.group) : 0, width(String(sp.length))) + 16;
    var left = Math.max(42, stripLab), ex = W - errorWidth - 8, right = errors ? ex - 20 : W - 8, cw = (right - left) / n;
    var strips = (hasCls ? 1 : 0) + (hasGrp ? 1 : 0) + (hasT ? 1 : 0), top = line + 8 + strips * line;
    var footer = errors ? line + 8 : 4, rh = Math.max(28, Math.min(Math.ceil(fs * 2.6), (H - top - footer) / sp.length)), bh = rh - 6;
    if (cw < 6) ctx.report("size", "[folds] " + n + " samples have " + cw.toFixed(1) + " px each; allow at least 6 px per sample (a wider element or fewer samples)");
    if (H < top + sp.length * 28 + footer) ctx.report("size", "[folds] " + sp.length + " splits need at least " + Math.ceil(top + sp.length * 28 + footer) + " px height; element has " + H + " px");
    this.geometry = {cell: cw, row: rh, top: top};
    var svg = this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var head = this.header = base.el("g", {opacity: 0}, svg);
    // 凡例：学習・検証（・使わない）・クラスの名前（右へ並べる）
    var x = 8, item = function(fill, stroke, text, dash){ base.el("rect", {x: x, y: 8, width: 28, height: fs * 1.2, fill: fill, stroke: stroke || "none", "stroke-width": 3, "stroke-dasharray": dash ? "4 3" : null}, head); self.label(head, x + 36, fs + 4, text); x += 36 + width(text) + 24; };
    item("var(--term-tint)", null, T.trainS); item("var(--emph-tint)", "var(--emph)", T.test);
    if (used) item("var(--bg)", "var(--line)", T.unused, true);
    (d.classes || []).forEach(function(c, i){ base.el("circle", {cx: x + 10, cy: 8 + fs * 0.6, r: 9, fill: PAL[i]}, head); self.label(head, x + 26, fs + 4, c.label || String(c.id)); x += 26 + width(c.label || String(c.id)) + 24; });
    if (x > W) ctx.report("size", "[folds] the legend needs " + Math.ceil(x) + " px width; element has " + W + " px");
    var sy = line + 8;
    if (hasCls){
      self.label(head, left - 12, sy + fs * 0.85, T.cls, "end");
      samples.forEach(function(s, i){ if (s.class !== undefined) base.el("rect", {x: left + i * cw + 1, y: sy + 4, width: Math.max(1, cw - 2), height: line - 12, fill: PAL[cls[s.class] || 0]}, head); });
      sy += line;
    }
    if (hasGrp){
      self.label(head, left - 12, sy + fs * 0.85, T.group, "end");
      // 同じグループの続き：枠で囲み、入れば名前
      var i0 = 0;
      for (var i = 1; i <= n; i++) if (i === n || samples[i].group !== samples[i0].group){
        base.el("rect", {x: left + i0 * cw + 1, y: sy + 4, width: Math.max(1, (i - i0) * cw - 2), height: line - 12, fill: "none", stroke: "var(--muted)", "stroke-width": 2, rx: 4}, head);
        var gname = samples[i0].group === undefined ? "" : String(samples[i0].group);
        if (gname && width(gname) <= (i - i0) * cw - 8) self.label(head, left + (i0 + (i - i0) / 2) * cw, sy + fs * 0.85, gname, "middle");
        i0 = i;
      }
      sy += line;
    }
    if (hasT){
      self.label(head, left, sy + fs * 0.85, String(samples[0].t !== undefined ? samples[0].t : ""));
      var tEnd = String(samples[n - 1].t !== undefined ? samples[n - 1].t : "");
      self.label(head, right, sy + fs * 0.85, tEnd, "end");
      var mid = left + (right - left) / 2, tw0 = width(T.time);
      if (width(String(samples[0].t)) + width(tEnd) + tw0 + 48 <= right - left) self.label(head, mid, sy + fs * 0.85, T.time, "middle");
    }
    if (errors) this.label(head, ex, top - 8, T.error);
    this.rows = role.map(function(a, r){
      var g = base.el("g", {opacity: 0}, svg), y = top + r * rh;
      self.label(g, left - 12, y + bh / 2 + fs * 0.31, String(r + 1), "end");
      a.forEach(function(v, i){
        base.el("rect", {x: left + i * cw + 1, y: y, width: Math.max(1, cw - 2), height: bh, rx: Math.min(3, cw / 4), fill: v === 2 ? "var(--emph-tint)" : v === 1 ? "var(--term-tint)" : "var(--bg)", stroke: v === 2 ? "var(--emph)" : v === 0 ? "var(--line)" : "none", "stroke-width": v === 2 ? 2.5 : 1.5, "stroke-dasharray": v === 0 ? "4 3" : null}, g);
      });
      if (errors) self.label(g, ex, y + bh / 2 + fs * 0.31, fmt(errors[r]));
      return {g: g};
    });
    this.finalLayer = base.el("g", {opacity: 0}, svg);
    if (errors){ var bottom = top + sp.length * rh; base.el("line", {x1: ex, x2: W - 8, y1: bottom + 2, y2: bottom + 2, stroke: "var(--muted)", "stroke-width": 2}, this.finalLayer); this.label(this.finalLayer, ex, bottom + line - 4, T.mean + " " + fmt(mean)); }
  }
  renderSamples(k, t){
    var dur = this.props.dur, n = this.sm.role.length, phase = function(step){ return k > step ? 1 : k < step ? 0 : base.prog(t, 0, dur); };
    set(this.header, "opacity", phase(1));
    this.rows.forEach(function(o, i){ set(o.g, "opacity", phase(i + 1)); });
    set(this.finalLayer, "opacity", phase(n + 1));
  }
};
});
