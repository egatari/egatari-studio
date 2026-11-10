// m-sampling: population → sample → simulated sampling distribution.
egatariParts.define({name: "sampling", version: "2.0.0", requires: {base: "1.1.0", plot: "1.1.1"}, element: "m-sampling"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {population: "母集団", sample: "標本", distribution: "標本分布", with: "戻す（復元抽出）", without: "戻さない（非復元抽出）", mean: "平均", proportion: "の割合", meanAxis: "標本平均", proportionAxis: "標本比率", statsMean: "標本統計量の平均", caption: function(n, r){ return "n = " + n + "、" + r + " 回"; }},
  en: {population: "population", sample: "Sample", distribution: "Sampling distribution", with: "with replacement", without: "without replacement", mean: "Mean", proportion: " proportion", meanAxis: "Sample mean", proportionAxis: "Sample proportion", statsMean: "mean of sample statistics", caption: function(n, r){ return "n = " + n + ", " + r + " samples"; }}
};
var OBJ = {white: "#ffffff", black: "#222222", red: "#d62728", green: "#2ca02c", yellow: "#f2c12e", blue: "#1f77b4", brown: "#8c564b", purple: "#9467bd", pink: "#e377c2", orange: "#ff7f0e", gray: "#7f7f7f"};
var OBJ_NAME = {"白": "white", "黒": "black", "赤": "red", "緑": "green", "黄": "yellow", "青": "blue", "茶": "brown", "紫": "purple", "桃": "pink", "橙": "orange", "灰": "gray",
  "白色": "white", "黒色": "black", "赤色": "red", "緑色": "green", "黄色": "yellow", "青色": "blue", "茶色": "brown", "紫色": "purple", "桃色": "pink", "橙色": "orange", "灰色": "gray", "ピンク": "pink", "オレンジ": "orange", "グレー": "gray", "grey": "gray"};
function objColor(name){
  var k = String(name).trim(), lower = k.toLowerCase(), own = Object.prototype.hasOwnProperty;
  var en = own.call(OBJ, lower) ? lower : own.call(OBJ_NAME, k) ? OBJ_NAME[k] : own.call(OBJ_NAME, lower) ? OBJ_NAME[lower] : null;
  return en ? "var(--obj-" + en + ", " + OBJ[en] + ")" : null;
}
// Mulberry32; the only mutable random state lives in mount's local generator.
function random(seed){
  return function(){
    seed = (seed + 0x6D2B79F5) | 0;
    var z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z ^= z + Math.imul(z ^ z >>> 7, 61 | z);
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
function set(e, a, v){ e.setAttribute(a, String(v)); }
function mean(values){
  var scale = Math.max.apply(null, values.map(function(v){ return Math.abs(v); }).concat([1]));
  var average = values.reduce(function(s, v){ return s + v / scale; }, 0) / values.length;
  return Math.max(-1, Math.min(1, average)) * scale;
}
function meanTicks(lo, hi, values){
  if (lo === hi) return [lo];
  if (hi - lo <= 10 && values.every(Number.isInteger)) return Array.from({length: hi - lo + 1}, function(_, i){ return lo + i; });
  var scale = Math.max(1, Math.abs(lo), Math.abs(hi));
  var rough = Math.max(Number.MIN_VALUE, (hi / scale - lo / scale) / 4 * scale);
  var power = Math.pow(10, Math.floor(Math.log10(rough))) || Number.MIN_VALUE, fraction = rough / power;
  var step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  var start = Math.ceil(lo / step), ticks = [];
  for (var i = 0; i < 10; i++){
    var v = (start + i) * step;
    if (!Number.isFinite(v) || v > hi + step * 1e-10) break;
    ticks.push(v);
  }
  return ticks;
}
return class extends base.MotionElement {
  static partName = "sampling";
  static preview = "none";
  static steps = 4;
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["n"], anyOf: [{required: ["balls"]}, {required: ["values"]}], properties: {
      balls: {type: "object"}, values: {type: "array", minItems: 2, maxItems: 30, items: {type: "number"}},
      of: {type: "string"}, n: {type: "number"}, replace: {type: "boolean"}, repeat: {type: "number"}, seed: {type: "number"},
      stat: {enum: ["mean", "proportion"]}, digits: {type: "number"}
    }},
    example: {values: [1, 2, 3, 4, 5, 6], n: 2, replace: true, repeat: 40, seed: 3}
  };
  static props = {
    dur: {type: "number", default: 1, doc: "段階の秒数"},
    stagger: {type: "number", default: 0.25, doc: "抽出のずれ（秒）"},
    fast: {type: "number", default: 2.5, doc: "反復の秒数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は 26）"}
  };
  timing(name, fallback, zero){ var v = this.props[name]; return Number.isFinite(v) && (zero ? v >= 0 : v > 0) ? v : fallback; }
  duration(k){
    if (k < 1 || k > 4) return 0;
    if (k === 4) return this.timing("fast", 2.5);
    var n = this.model ? this.model.n : Math.max(1, Math.min(30, Math.round(this.data.n)));
    return this.timing("dur", 1) + (k === 2 ? (n - 1) * this.timing("stagger", 0.25, true) : 0);
  }
  fmt(v){ return v.toFixed(this.model.digits); }
  label(g, x, y, s, anchor){
    var t = base.el("text", {x: x, y: y, "font-size": this.fs, "text-anchor": anchor || "start", fill: "var(--fg)"}, g);
    t.textContent = s; return t;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props;
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    var T = this.T;
    [["dur", 1, false], ["stagger", 0.25, true], ["fast", 2.5, false]].forEach(function(a){
      if (self.timing(a[0], -1, a[2]) === -1){ ctx.report("attr", "[sampling] invalid " + a[0] + "; using " + a[1]); P[a[0]] = a[1]; }
    });
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[sampling] size must be 0 or at least 24; using 26"); P.size = 0; }
    this.fs = P.size || 26;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.setAttribute("role", "img");
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight);
    var items = [], composition = [], balls = d.balls !== undefined;
    var invalid = balls && d.values !== undefined;
    if (balls){
      Object.keys(d.balls).forEach(function(name){
        var count = d.balls[name], col = objColor(name);
        if (!col) ctx.report("data", "[sampling] unknown colour " + name + "; drawn as gray with its name");
        if (!Number.isInteger(count) || count < 0 || count > 30){ invalid = true; return; }
        composition.push(name + " " + count);
        for (var i = 0; i < count; i++) items.push({label: name, color: col || objColor("gray")});
      });
    } else {
      items = d.values.map(function(v){ return {label: String(v), value: v}; });
      composition = items.map(function(o){ return o.label; });
    }
    if (invalid || items.length < 2 || items.length > 30){
      ctx.report("data", "[sampling] supply exactly one population: 2–30 values or balls with non-negative integer counts totalling 2–30");
      this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
      this.label(this.svg, 8, this.fs + 4, T.population + ": 2–30");
      if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.population + ": 2–30");
      return;
    }
    function integer(key, fallback, lo, hi){
      var v = d[key] === undefined ? fallback : d[key];
      if (!Number.isInteger(v) || v < lo || v > hi){
        v = Math.max(lo, Math.min(hi, Math.round(v)));
        ctx.report("data", "[sampling] " + key + " must be an integer " + lo + "–" + hi + "; clamped to " + v);
      }
      return v;
    }
    var stat = balls ? "proportion" : "mean", of = d.of === undefined ? (balls ? Object.keys(d.balls)[0] : "") : d.of;
    if (d.stat !== undefined && d.stat !== stat) ctx.report("data", "[sampling] stat=" + d.stat + " is incompatible with this population; using " + stat);
    if (balls && !Object.prototype.hasOwnProperty.call(d.balls, of)) ctx.report("data", "[sampling] of=" + of + " is absent from the population; proportion is zero");
    var n = integer("n", 1, 1, d.replace ? 30 : items.length), repeat = integer("repeat", 40, 1, 200), digits = integer("digits", 2, 0, 10);
    var seed = d.seed === undefined ? 1 : d.seed;
    if (!Number.isSafeInteger(seed)){ ctx.report("data", "[sampling] seed must be a safe integer; using 1"); seed = 1; }
    function statistic(sample){
      return balls ? sample.filter(function(id){ return items[id].label === of; }).length / sample.length : mean(sample.map(function(id){ return items[id].value; }));
    }
    var rng = random(seed), samples = [];
    for (var r = 0; r < repeat; r++){
      var pool = items.map(function(_, i){ return i; }), ids = [];
      for (var j = 0; j < n; j++){
        var at = Math.floor(rng() * pool.length); ids.push(pool[at]);
        if (!d.replace) pool.splice(at, 1);
      }
      samples.push({ids: ids, value: statistic(ids)});
    }
    this.model = {items: items, samples: samples, n: n, repeat: repeat, digits: digits, replace: !!d.replace, stat: stat, of: of,
      population: statistic(items.map(function(_, i){ return i; })), average: mean(samples.map(function(o){ return o.value; }))};
    var m = this.model, rule = m.replace ? T.with : T.without;
    this.composition = composition.join(T === TEXT.ja ? "・" : ", ");
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.population + ": " + this.composition + "; " + rule + "; " + T.caption(n, repeat) + "; " + T.population + " " + this.fmt(m.population) + "; " + T.statsMean + " " + this.fmt(m.average));
    // Source Sans 3's SVG box is 1.43em tall, including its descender.
    var fs = this.fs, line = fs * 1.45 + 4, width = function(s){ return base.textWidth(s, fs, {font: self}) + 8; };
    var left = W * 0.24, middle = W * 0.38, sx = left + 22, px = left + middle + 48, pw = Math.max(1, W - px - 22);
    // Plot supplies the numerical mapping and axis; normalized values avoid overflow.
    var vals = items.map(function(o){ return o.value; }), lo = balls ? 0 : Math.min.apply(null, vals), hi = balls ? 1 : Math.max.apply(null, vals);
    var scale = Math.max(1, Math.abs(lo), Math.abs(hi)), a = lo / scale, b = hi / scale;
    var captionY = H - fs * 0.4 - 4, axisY = captionY - 3 * line;
    var plotTop = fs + 4 + fs * 0.4 + 8, plotH = axisY - plotTop;
    var plot = deps.plot.Plot(this, {xr: a === b ? [a - 1, b + 1] : [a, b], yr: [0, 1], xt: [], yt: [], noY: true,
      m: {l: px + 12, r: W - px - 12 - Math.max(1, pw - 24), t: plotTop, b: H - axisY}});
    this.svg = plot.svg;
    set(this.svg, "width", W); set(this.svg, "height", H); set(this.svg, "aria-hidden", "true");
    var axes = [].filter.call(this.svg.children, function(e){ return e.getAttribute("class") === "axes"; })[0];
    this.svg.removeChild(axes);
    var X = function(v){ return plot.x(v / scale); };
    this.populationLayer = base.el("g", {opacity: 0}, this.svg);
    this.sampleLayer = base.el("g", {opacity: 0}, this.svg);
    this.plotLayer = base.el("g", {opacity: 0}, this.svg);
    this.plotLayer.appendChild(axes);
    this.finalLayer = base.el("g", {opacity: 0}, this.plotLayer);
    this.label(this.populationLayer, 8, fs + 4, T.population);
    this.label(this.sampleLayer, sx, fs + 4, T.sample);
    this.label(this.plotLayer, px, fs + 4, T.distribution);
    var small = false, itemW = Math.max(52, ...items.map(function(o){ return width(o.label) + (balls ? 36 : 16); }));
    var cols = Math.max(1, Math.min(items.length, Math.floor((left - 24) / itemW))), rows = Math.ceil(items.length / cols), rowH = Math.max(48, line);
    var bagTop = line + 10, bagBottom = bagTop + rows * rowH + 12;
    base.el("rect", {x: 4, y: bagTop, width: Math.max(1, left - 8), height: bagBottom - bagTop, rx: 18, fill: "none", stroke: "var(--fg)", "stroke-width": 2}, this.populationLayer);
    function item(g, o){
      var shape = base.el(balls ? "circle" : "rect", balls ? {cx: 14, cy: 0, r: 12, fill: o.color, stroke: "var(--fg)", "stroke-width": 2} : {x: 0, y: -rowH / 2 + 3, width: itemW - 8, height: rowH - 6, rx: 6, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2}, g);
      var text = self.label(g, balls ? 34 : (itemW - 8) / 2, fs * 0.312, o.label, balls ? "start" : "middle");
      return {g: g, shape: shape, text: text};
    }
    this.originals = items.map(function(o, i){
      var x = 14 + (i % cols) * itemW, y = bagTop + 8 + rowH / 2 + Math.floor(i / cols) * rowH;
      var q = item(base.el("g", {transform: "translate(" + x + " " + y + ")"}, self.populationLayer), o); q.x = x; q.y = y; return q;
    });
    // Wrap word groups below the bag; reserve a full font box between baselines.
    var y = bagBottom;
    if (balls){
      // Keep separators inside the string: width padding must not add spaces around ・.
      var words = "";
      composition.forEach(function(s){
        var joined = words ? words + (T === TEXT.ja ? "・" : ", ") + s : s;
        if (words && width(joined) > left - 16){ y += line; self.label(self.populationLayer, 8, y, words); words = s; }
        else words = joined;
        if (width(s) > left - 16) small = true;
      });
      y += line; self.label(self.populationLayer, 8, y, words);
    }
    var rules = width(rule) <= left - 16 ? [rule] : (T === TEXT.ja ? [m.replace ? "戻す" : "戻さない", m.replace ? "（復元抽出）" : "（非復元抽出）"] : rule.split(" "));
    rules.forEach(function(s){ y += line; self.label(self.populationLayer, 8, y, s); if (width(s) > left - 16) small = true; });
    if (y + fs * 0.4 + 4 > H || itemW > left - 24) small = true;
    var sampleY = bagTop + rowH / 2 + 8, sampleW = n * itemW;
    if (sampleW > middle - 10) small = true;
    this.drawn = Array.from({length: n}, function(_, j){ var q = item(base.el("g", {}, self.sampleLayer), items[samples[0].ids[j]]); q.x = sx + j * itemW; q.y = sampleY; return q; });
    this.statLayer = base.el("g", {opacity: 0}, this.sampleLayer);
    var statY = sampleY + rowH / 2 + line;
    this.statName = this.label(this.statLayer, sx, statY, balls ? of + T.proportion : T.mean);
    this.statValue = this.label(this.statLayer, sx, statY + line, "");
    var statLabel = balls ? of + T.proportion : T.mean;
    if (width(statLabel) > middle - 10 || statY + line + fs * 0.4 > H) small = true;
    var ticks = balls ? [0, 0.25, 0.5, 0.75, 1] : meanTicks(lo, hi, vals), lastRight = -Infinity;
    ticks.forEach(function(v){
      var xx = X(v), rounded = +v.toPrecision(4), s = Number.isFinite(rounded) ? String(rounded) : String(v), w = width(s);
      base.el("line", {x1: xx, x2: xx, y1: axisY, y2: axisY + 7, stroke: "var(--fg)", "stroke-width": 2}, self.plotLayer);
      var anchor = v === lo ? "start" : v === hi ? "end" : "middle";
      var tx = anchor === "start" ? xx : anchor === "end" ? xx - w : xx - w / 2;
      if (tx < lastRight + 4) small = true; lastRight = tx + w;
      self.label(self.plotLayer, xx, axisY + line, s, anchor);
    });
    this.label(this.plotLayer, px, axisY + 2 * line, balls ? T.proportionAxis : T.meanAxis);
    this.label(this.finalLayer, px, captionY, T.caption(n, repeat));
    var markerLabel = T.population + " " + this.fmt(m.population);
    var markerY = fs + 4 + line, markerRight = px + width(markerLabel);
    this.label(this.finalLayer, px, markerY, markerLabel);
    var markerBottom = markerY + fs * 0.4 + 8;
    base.el("line", {x1: X(m.population), x2: X(m.population), y1: markerBottom, y2: axisY, stroke: "var(--emph)", "stroke-width": 2, "stroke-dasharray": "6 5"}, this.finalLayer);
    // Stack horizontally intersecting dots at separate levels, preserving exact numerical x.
    function stack(radius){
      var levels = [];
      return samples.map(function(o){
        var xx = X(o.value), lv = 0;
        while (levels[lv] && levels[lv].some(function(v){ return Math.abs(v - xx) < 2 * radius + 2; })) lv++;
        if (!levels[lv]) levels[lv] = []; levels[lv].push(xx);
        return {x: xx, level: lv};
      });
    }
    // The marker label occupies only the plot's upper-left corner, not a whole row.
    // A 1px gap between circle fills leaves more room for repeated values.
    function fits(positions, radius){
      return positions.every(function(o){
        var top = axisY - 2 * radius - 3 - o.level * (2 * radius + 1);
        return top >= (o.x - radius < markerRight && o.x + radius > px ? markerBottom : plotTop);
      });
    }
    var radius = 8, positions;
    while (true){
      positions = stack(radius);
      if (fits(positions, radius) || radius === 5) break;
      radius--;
    }
    if (!fits(positions, radius)) ctx.report("size", "[sampling] dot stack exceeds plot at minimum 5px radius; increase height or reduce repeat");
    this.dots = positions.map(function(o){
      var yy = axisY - radius - 3 - o.level * (2 * radius + 1);
      return {x: o.x, y: yy, el: base.el("circle", {cx: o.x, cy: yy, r: radius, fill: "var(--term)", stroke: "var(--fg)", "stroke-width": 1, opacity: 0}, self.plotLayer)};
    });
    this.plotTop = plotTop;
    if ([T.distribution, markerLabel, T.caption(n, repeat), balls ? T.proportionAxis : T.meanAxis].some(function(s){ return width(s) > pw; }) || plotH < 40) small = true;
    if (small) ctx.report("size", "[sampling] population, sample row or plot labels do not fit; enlarge the element or shorten names");
    // Check all statistic strings, since a later sample can be wider than the first.
    if (samples.some(function(o){ return width(self.statText(o)) > middle - 10; })) ctx.report("size", "[sampling] statistic does not fit; enlarge width or reduce digits");
  }
  statText(sample){
    var m = this.model;
    return (m.stat === "proportion" ? sample.ids.filter(function(i){ return m.items[i].label === m.of; }).length + "/" + m.n + " = " : "") + this.fmt(sample.value);
  }
  render(k, t){
    if (!this.model) return;
    var self = this, m = this.model, P = this.props;
    var phase = function(step){ return k > step ? 1 : k < step ? 0 : base.prog(t, 0, P.dur); };
    set(this.populationLayer, "opacity", phase(1));
    set(this.sampleLayer, "opacity", k >= 2 ? 1 : 0);
    set(this.statLayer, "opacity", phase(3));
    set(this.plotLayer, "opacity", phase(3));
    var progress = k > 4 ? 1 : k < 4 ? 0 : Math.max(0, Math.min(1, t / P.fast));
    var completed = k < 3 ? 0 : k === 3 ? (t >= P.dur ? 1 : 0) : 1 + Math.floor(progress * (m.repeat - 1));
    var rep = k >= 4 ? Math.min(m.repeat - 1, completed - 1) : 0, sample = m.samples[rep];
    var full = k >= 4 && progress === 1 || k === 3 && t >= P.dur;
    this.originals.forEach(function(o, i){
      var j = sample.ids.indexOf(i), gone = !m.replace && j >= 0 && !full && (k >= 3 || k === 2 && t > j * P.stagger);
      set(o.g, "opacity", gone ? 0 : 1);
    });
    this.drawn.forEach(function(o, j){
      var id = sample.ids[j], original = self.originals[id], e = k > 2 ? 1 : k < 2 ? 0 : base.prog(t, j * P.stagger, P.dur);
      set(o.g, "opacity", k >= 2 && (k > 2 || t > j * P.stagger) ? 1 : 0);
      set(o.g, "transform", "translate(" + base.lerp(original.x, o.x, e) + " " + base.lerp(original.y, o.y, e) + ")");
      o.text.textContent = m.items[id].label;
      if (m.stat === "proportion") set(o.shape, "style", "fill:" + m.items[id].color + ";stroke:var(--fg)");
    });
    this.statValue.textContent = this.statText(sample);
    this.dots.forEach(function(o, i){
      var drop = i === 0 && k === 3 ? base.prog(t, 0, P.dur) : 1;
      set(o.el, "opacity", i < completed || i === 0 && k === 3 && t > 0 ? 1 : 0);
      set(o.el, "cy", base.lerp(self.plotTop, o.y, drop));
    });
    set(this.finalLayer, "opacity", k >= 4 && progress === 1 ? 1 : 0);
  }
};
});
