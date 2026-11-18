// m-contour：2 変数の関数の等高線。等高線を値ごとに引き、勾配の矢印（と接線）、勾配降下法などの反復の道を 1 点ずつ。
// 関数は式 f（expr：算術だけの式。コードとしては動かさない）か、スクリプトが格子の上で計算した値 grid のどちらか。
// <m-contour style="height:440px"><script type="application/json">
//   {"f": "x**2 + 3*y**2", "range": {"x": [-3, 3], "y": [-2, 2]}, "levels": [1, 2, 4, 8],
//    "gradient": {"at": [[1, 1]]}, "path": [[2.5, 1.5], [1.5, 0.3], [0.9, 0.06]], "monotone": true}
// （JSON の終わり）</m-contour>
// 色：等高線 --term、値の名前 --fg（地の色の縁取り）、勾配の矢印 --accent2（接線は --muted の破線）、反復の道 --fg、今の点 --emph。
egatariParts.define({name: "contour", version: "2.0.0", requires: {base: "1.2.0", expr: "1.0.0", "contour-core": "1.0.0"}, element: "m-contour"}, function(deps){
"use strict";
var base = deps.base, D = base, expr = deps.expr, K = deps["contour-core"], clipN = 0;
var NUM = {type: "number"}, R2 = {type: "array", minItems: 2, maxItems: 2, items: NUM}, P2 = {type: "array", minItems: 2, maxItems: 2, items: NUM};
var SAMPLE = {nx: 97, ny: 73};
var T = {
  ja: {iter: function(i, v){ return "反復 " + i + "：f = " + v; }, summary: function(n, lv){ return "等高線の図：値 " + lv.join("、") + (n ? "、反復 " + n + " 回の道" : ""); }, grad: "勾配"},
  en: {iter: function(i, v){ return "iteration " + i + ": f = " + v; }, summary: function(n, lv){ return "Contour plot: levels " + lv.join(", ") + (n ? "; a path of " + n + " iterations" : ""); }, grad: "gradient"}
};
function nice(lo, hi, n){
  var span = hi - lo, raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, st = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p, out = [];
  for (var v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9 * span; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return {ticks: out, step: st};
}
function fmt(v, st){ var d = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); var s = v.toFixed(Math.min(4, d)); return s.indexOf("-") === 0 ? "−" + s.slice(1) : s; }
function num(v){ var a = Math.abs(v), s = a >= 100 ? a.toFixed(0) : a >= 1 ? +a.toFixed(3) + "" : +a.toPrecision(3) + ""; return (v < 0 && +s !== 0 ? "−" : "") + s; }
return class extends base.MotionElement {
  static partName = "contour";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["range", "levels"], anyOf: [{required: ["f"]}, {required: ["grid"]}], properties: {
    f: {type: "string"}, label: {type: "string"},
    grid: {type: "object", additionalProperties: false, required: ["nx", "ny", "values"], properties: {nx: {type: "integer"}, ny: {type: "integer"}, values: {type: "array"}}},
    range: {type: "object", additionalProperties: false, required: ["x", "y"], properties: {x: R2, y: R2}},
    axes: {type: "object", additionalProperties: false, properties: {x: {type: "string"}, y: {type: "string"}}},
    levels: {type: "array", minItems: 1, maxItems: 8, items: NUM},
    gradient: {type: "object", additionalProperties: false, required: ["at"], properties: {at: {type: "array", minItems: 1, maxItems: 6, items: P2}, scale: NUM, tangent: {type: "boolean"}}},
    path: {type: "array", minItems: 1, maxItems: 30, items: P2},
    monotone: {type: "boolean"},
    equal: {type: "boolean"}
  }}, example: /*@egatari-block example*/{"f":"x**2 + 3*y**2","range":{"x":[-3,3],"y":[-2,2]},"levels":[1,2,4,8],"gradient":{"at":[[1,1]]},"path":[[2.5,1.5],[1.5,0.3],[0.9,0.06]],"monotone":true}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 0.8, doc: "1 ステップの秒数"},
    size: {type: "number", default: 24, doc: "字の大きさ（px、24 以上）"},
    by: {type: "enum", values: ["level", "all"], default: "level", doc: "等高線を値ごとに 1 ステップ（level）か、まとめて 1 ステップ（all）"}
  };
  get steps(){ return this.plan().steps.length; }
  duration(k){ return k >= 1 && k <= this.plan().steps.length ? this.props.dur : 0; }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], fn = null, rx = d.range.x, ry = d.range.y, values = null, nx, ny;
    if (d.f !== undefined && d.grid) bad.push("give f or grid, not both");
    if (!(rx[1] > rx[0] && ry[1] > ry[0])) bad.push("range.x and range.y are [min, max] with min < max");
    if (d.f !== undefined && !d.grid){
      try { var g = expr.compile(d.f, {name: "f", vars: ["x", "y"], bareMath: true}); fn = function(x, y){ var v = g(x, y); return typeof v === "number" ? v : NaN; }; }
      catch (e){ bad.push("f: " + (e && e.message || e)); fn = function(){ return NaN; }; }
      nx = SAMPLE.nx; ny = SAMPLE.ny; values = [];
      for (var j = 0; j < ny; j++){ var row = []; for (var i = 0; i < nx; i++) row.push(fn(rx[0] + (rx[1] - rx[0]) * i / (nx - 1), ry[0] + (ry[1] - ry[0]) * j / (ny - 1))); values.push(row); }
    } else if (d.grid){
      nx = d.grid.nx; ny = d.grid.ny; values = d.grid.values;
      var okg = nx >= 2 && ny >= 2 && nx <= 200 && ny <= 200 && Array.isArray(values) && values.length === ny && values.every(function(r){ return Array.isArray(r) && r.length === nx && r.every(function(v){ return typeof v === "number"; }); });
      if (!okg){ bad.push("grid.values must be ny × nx numbers (2–200 each; row 0 is the smallest y)"); values = [[0, 0], [0, 0]]; nx = ny = 2; }
      // 格子の値の双一次補間（勾配と道の f に使う）
      fn = function(x, y){
        var u = (x - rx[0]) / (rx[1] - rx[0]) * (nx - 1), w = (y - ry[0]) / (ry[1] - ry[0]) * (ny - 1);
        if (!(u >= 0 && u <= nx - 1 && w >= 0 && w <= ny - 1)) return NaN;
        var i0 = Math.min(nx - 2, Math.floor(u)), j0 = Math.min(ny - 2, Math.floor(w)), a = u - i0, b = w - j0;
        return values[j0][i0] * (1 - a) * (1 - b) + values[j0][i0 + 1] * a * (1 - b) + values[j0 + 1][i0] * (1 - a) * b + values[j0 + 1][i0 + 1] * a * b;
      };
    }
    var lv = d.levels.slice().sort(function(a, b){ return a - b; }), steps = [];
    var hx = (rx[1] - rx[0]) / (d.grid ? Math.max(1, nx - 1) : 1e4), hy = (ry[1] - ry[0]) / (d.grid ? Math.max(1, ny - 1) : 1e4);
    var grad = function(x, y){ return [(fn(x + hx, y) - fn(x - hx, y)) / (2 * hx), (fn(x, y + hy) - fn(x, y - hy)) / (2 * hy)]; };
    var grads = d.gradient ? d.gradient.at.map(function(p){ return {p: p, g: grad(p[0], p[1])}; }) : [];
    grads.forEach(function(o, i){ if (!o.g.every(Number.isFinite)) bad.push("gradient.at[" + i + "] is outside the range or where f is not defined"); });
    var fp = (d.path || []).map(function(p){ return fn(p[0], p[1]); });
    if (d.monotone) fp.forEach(function(v, i){ if (i && v > fp[i - 1] + 1e-12 * Math.max(1, Math.abs(v))) bad.push("path: f goes up at iteration " + i + " (" + num(fp[i - 1]) + " → " + num(v) + ") but monotone is true"); });
    fp.forEach(function(v, i){ if (!Number.isFinite(v)) bad.push("path[" + i + "] is outside the range or where f is not defined"); });
    if (this.props && this.props.by === "all") steps.push({kind: "levels", levels: lv});
    else lv.forEach(function(l){ steps.push({kind: "levels", levels: [l]}); });
    if (grads.length) steps.push({kind: "gradient"});
    (d.path || []).forEach(function(_, i){ steps.push({kind: "path", i: i}); });
    return (this._plan = {d: d, bad: bad, values: values, nx: nx, ny: ny, levels: lv, steps: steps, grads: grads, fp: fp, rx: rx, ry: ry});
  }
  mount(ctx){
    var self = this, P = this.props, pl, ja = /^ja\b/i.test(ctx.lang || "ja"), L = ja ? T.ja : T.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[contour] dur must be positive; using 0.8"); P.dur = 0.8; }
    if (!(Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[contour] size must be at least 24; using 24"); P.size = 24; }
    if (["level", "all"].indexOf(P.by) < 0){ ctx.report("attr", "[contour] by must be level or all; using level"); P.by = "level"; }
    this._plan = null; pl = this.plan(); var d = pl.d;
    pl.bad.forEach(function(s){ ctx.report("data", "[contour] " + s); });
    this.L = L;
    this.style.display = "block"; this.style.position = "relative";
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = P.size, rx = pl.rx, ry = pl.ry;
    var tw = function(s){ return base.textWidth(s, fs, {font: self}); }, top = Math.ceil(fs * 2.1);
    // 目盛りの数は、描く大きさから（数の幅と字の高さが入る間隔）
    var ty = nice(ry[0], ry[1], Math.max(2, Math.min(5, Math.floor((H - top - 2 * fs) / (2.2 * fs)))));
    var yTickW = Math.max.apply(null, ty.ticks.map(function(v){ return tw(fmt(v, ty.step)); }).concat([0]));
    var m = {l: Math.ceil(yTickW) + 14, r: 12, t: top + 6, b: Math.ceil(fs * 1.3) + 6};
    var aw = Math.max(1, W - m.l - m.r), ah = Math.max(1, H - m.t - m.b), pw = aw, ph = ah;
    if (d.equal !== false){ var s = Math.min(aw / (rx[1] - rx[0]), ah / (ry[1] - ry[0])); pw = s * (rx[1] - rx[0]); ph = s * (ry[1] - ry[0]); }
    // 縦と横をそろえて横が余るときは、図を左に寄せ、右を欄にする（関数の名前と、反復ごとの f の値）
    var side = W - m.l - pw - 32 >= 240, px = side ? m.l : m.l + (aw - pw) / 2, py = m.t;
    if (pw < 160 || ph < 120) ctx.report("size", "[contour] element is " + W + " × " + H + " px; allow at least " + Math.ceil(m.l + m.r + 160) + " × " + Math.ceil(m.t + m.b + 120) + " px");
    var X = function(x){ return px + (x - rx[0]) / (rx[1] - rx[0]) * pw; }, Y = function(y){ return py + (ry[1] - y) / (ry[1] - ry[0]) * ph; };
    var tx = nice(rx[0], rx[1], Math.max(2, Math.min(6, Math.floor(pw / (tw("−0.00") + 24)))));
    this.geo = {X: X, Y: Y, px: px, py: py, pw: pw, ph: ph, fs: fs, top: top};
    this.setAttribute("role", "img");
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    if (!this._aria) this.setAttribute("aria-label", (d.label ? d.label.replace(/[*]/g, "").replace(/[_^]/g, "") + "; " : "") + L.summary((d.path || []).length ? d.path.length - 1 : 0, pl.levels.map(num)));
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var cid = "contour-2-0-0-clip" + (++clipN);
    D.el("rect", {x: px, y: py, width: pw, height: ph}, D.el("clipPath", {id: cid}, D.el("defs", {}, svg)));
    var plot = D.el("g", {"clip-path": "url(#" + cid + ")"}, svg);
    var gridG = D.el("g", {}, plot);
    tx.ticks.forEach(function(v){ D.el("line", {x1: X(v), y1: py, x2: X(v), y2: py + ph, stroke: "var(--line)", "stroke-width": 1, opacity: 0.6}, gridG); });
    ty.ticks.forEach(function(v){ D.el("line", {x1: px, y1: Y(v), x2: px + pw, y2: Y(v), stroke: "var(--line)", "stroke-width": 1, opacity: 0.6}, gridG); });
    D.el("rect", {x: px, y: py, width: pw, height: ph, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, svg);
    // 軸の名前は、添え字（*w*_1）があれば 32px 以上で組む（mtext の添え字は 24px より小さくしないので、本文が 24px だと同じ大きさに見える）
    var axFs = function(t){ return /(^|[^\\])[_^]./.test(t) ? Math.max(fs, 32) : fs; };
    var xLabW = d.axes && d.axes.x ? base.textWidth(d.axes.x.replace(/[*_^]/g, ""), axFs(d.axes.x), {font: self}) + 12 : 0;
    tx.ticks.forEach(function(v){ var s = fmt(v, tx.step); if (X(v) + tw(s) / 2 > px + pw - xLabW) return; D.el("text", {x: X(v), y: py + ph + fs + 2, "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, svg).textContent = s; });
    ty.ticks.forEach(function(v){ if (v === ty.ticks[0] && Math.abs(v - ry[0]) < 1e-9 * (ry[1] - ry[0])) return; D.el("text", {x: px - 8, y: Y(v) + fs * 0.35, "font-size": fs, "text-anchor": "end", fill: "var(--muted)"}, svg).textContent = fmt(v, ty.step); });
    if (d.axes && d.axes.x) D.mtext(svg, px + pw, py + ph + fs + 2, d.axes.x, {"font-size": axFs(d.axes.x), "text-anchor": "end", fill: "var(--fg)"});
    if (d.axes && d.axes.y) D.mtext(svg, px, top - fs * 0.35, d.axes.y, {"font-size": axFs(d.axes.y), fill: "var(--fg)"});
    // 上の行：右に関数の名前（label）、反復の値はそこに替わる
    var yLabW = d.axes && d.axes.y ? base.textWidth(d.axes.y.replace(/[*_^]/g, ""), axFs(d.axes.y), {font: self}) + 24 : 0;
    this.titleG = D.el("g", {}, svg); this.side = side; this.iterRows = [];
    if (side){
      var sx0 = px + pw + 32, sw = W - sx0 - m.r, row = Math.ceil(fs * 1.5), y0 = py + fs;
      if (d.label){ D.mtext(this.titleG, sx0, y0, d.label, {"font-size": fs, fill: "var(--fg)"}); y0 += row * 1.3; if (tw(d.label.replace(/[*_^]/g, "")) > sw) ctx.report("layout", "[contour] the label is wider than the panel beside the plot; shorten it"); }
      // 反復の行：入るだけ（多ければ新しい行を残す）
      var n = (d.path || []).length, fit = Math.max(1, Math.floor((py + ph - y0 + fs) / row));
      this.iterFit = Math.min(n, fit);
      for (var r = 0; r < this.iterFit; r++) this.iterRows.push(D.el("text", {x: sx0, y: y0 + r * row, "font-size": fs, fill: "var(--fg)", opacity: 0}, svg));
    } else if (d.label){ D.mtext(this.titleG, W - m.r, top - fs * 0.35, d.label, {"font-size": fs, "text-anchor": "end", fill: "var(--fg)"}); if (tw(d.label.replace(/[*_^]/g, "")) > W - m.r - px - yLabW) ctx.report("layout", "[contour] the label is wider than the row above the plot; shorten it"); }
    this.iterText = D.el("text", {x: W - m.r, y: top - fs * 0.35, "font-size": fs, "text-anchor": "end", fill: "var(--fg)", opacity: 0}, svg);
    // 等高線（値ごとの群）と値の名前
    var sx = (rx[1] - rx[0]) / (pl.nx - 1), sy = (ry[1] - ry[0]) / (pl.ny - 1), gxp = function(p){ return X(rx[0] + p[0] * sx); }, gyp = function(p){ return Y(ry[0] + p[1] * sy); };
    var placed = [];
    this.levelG = pl.levels.map(function(lv, li){
      var g = D.el("g", {opacity: 0}, plot), lines = K.lines(pl.values, lv);
      if (!lines.length) ctx.report("layout", "[contour] level " + lv + " does not cross the range");
      lines.forEach(function(line){
        if (line.length < 2) return;
        D.el("path", {d: "M" + line.map(function(p){ return gxp(p).toFixed(1) + " " + gyp(p).toFixed(1); }).join("L"), fill: "none", stroke: "var(--term)", "stroke-width": 2.5}, g);
        // 名前：線の長さの何割かの所（値ごとにずらす）。ほかの名前と重なるなら、次の候補へ
        var lenPx = K.labelAt(line).length * Math.max(pw / (pl.nx - 1), ph / (pl.ny - 1));
        if (lenPx < 3 * fs) return;
        var txt = num(lv), w = tw(txt) + 8;
        for (var c = 0; c < 6; c++){
          var at = K.labelAt(line, ((0.2 + 0.13 * li + 0.17 * c) % 1)), x = gxp([at.x, at.y]), y = gyp([at.x, at.y]);
          if (x - w / 2 < px || x + w / 2 > px + pw || y - fs * 0.7 < py || y + fs * 0.4 > py + ph) continue;
          if (placed.some(function(q){ return Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < fs * 1.1; })) continue;
          placed.push({x: x, y: y, w: w});
          D.el("text", {x: x.toFixed(1), y: (y + fs * 0.35).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", "stroke-linejoin": "round"}, g).textContent = txt;
          break;
        }
      });
      return g;
    });
    // 勾配の矢印：長さは scale × |∇f|（書いていなければ、いちばん長い矢印が範囲の幅の 18 %）
    var gmax = Math.max.apply(null, pl.grads.map(function(o){ return Math.hypot(o.g[0], o.g[1]); }).concat([1e-12]));
    var scale = d.gradient && d.gradient.scale ? d.gradient.scale : 0.18 * (rx[1] - rx[0]) / gmax;
    this.gradG = D.el("g", {opacity: 0}, plot);
    pl.grads.forEach(function(o){
      if (!o.g.every(Number.isFinite)) return;
      var x0 = X(o.p[0]), y0 = Y(o.p[1]), x1 = X(o.p[0] + o.g[0] * scale), y1 = Y(o.p[1] + o.g[1] * scale), n = Math.hypot(x1 - x0, y1 - y0);
      if (d.gradient.tangent){ var ux = -(y1 - y0) / (n || 1), uy = (x1 - x0) / (n || 1), tl = 0.12 * pw; D.el("line", {x1: x0 - ux * tl, y1: y0 - uy * tl, x2: x0 + ux * tl, y2: y0 + uy * tl, stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "8 6"}, self.gradG); }
      D.el("circle", {cx: x0, cy: y0, r: 5, fill: "var(--accent2)"}, self.gradG);
      if (n > 4){
        var hx = (x1 - x0) / n, hy = (y1 - y0) / n, h = Math.min(16, n * 0.5), w = h * 0.55, bx = x1 - hx * h, by = y1 - hy * h;
        D.el("line", {x1: x0, y1: y0, x2: bx, y2: by, stroke: "var(--accent2)", "stroke-width": 4}, self.gradG);
        D.el("path", {d: "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + (bx - hy * w).toFixed(1) + " " + (by + hx * w).toFixed(1) + "L" + (bx + hy * w).toFixed(1) + " " + (by - hx * w).toFixed(1) + "Z", fill: "var(--accent2)"}, self.gradG);
      }
    });
    // 反復の道：線分と点（今の点は --emph）
    var pathG = D.el("g", {}, svg);
    this.segs = (d.path || []).map(function(p, i){ return i ? D.el("line", {x1: X(d.path[i - 1][0]), y1: Y(d.path[i - 1][1]), x2: X(d.path[i - 1][0]), y2: Y(d.path[i - 1][1]), stroke: "var(--fg)", "stroke-width": 3, opacity: 0}, pathG) : null; });
    this.dots = (d.path || []).map(function(p){ return D.el("circle", {cx: X(p[0]), cy: Y(p[1]), r: 7, fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 2, opacity: 0}, pathG); });
  }
  render(k, t){
    if (!this.svg) return;
    var self = this, pl = this.plan(), d = pl.d, G = this.geo, dur = this.props.dur, steps = pl.steps;
    var ph = function(n){ return k > n + 1 ? 1 : k < n + 1 ? 0 : base.prog(t, 0, dur); };
    var li = 0;
    steps.forEach(function(s, n){
      var e = ph(n);
      if (s.kind === "levels") s.levels.forEach(function(){ self.levelG[li++].setAttribute("opacity", e.toFixed(3)); });
      if (s.kind === "gradient") self.gradG.setAttribute("opacity", e.toFixed(3));
    });
    var cur = -1, ecur = 0;
    steps.forEach(function(s, n){
      if (s.kind !== "path") return;
      var e = ph(n), i = s.i, p = d.path[i];
      if (e > 0){ cur = i; ecur = e; }
      self.dots[i].setAttribute("opacity", e > 0 ? 1 : 0);
      if (self.segs[i]){
        var q = d.path[i - 1];
        self.segs[i].setAttribute("x2", G.X(q[0] + (p[0] - q[0]) * e).toFixed(1)); self.segs[i].setAttribute("y2", G.Y(q[1] + (p[1] - q[1]) * e).toFixed(1));
        self.segs[i].setAttribute("opacity", e > 0 ? 1 : 0);
        self.dots[i].setAttribute("opacity", e >= 1 ? 1 : 0);
      }
    });
    this.dots.forEach(function(c, i){ c.setAttribute("style", "fill:var(--" + (i === cur ? "emph" : "fg") + ")"); c.setAttribute("r", i === cur ? 9 : 6); });
    if (this.side){
      // 欄：反復 0 から今の反復まで、1 行ずつ（入らなければ新しい行を残す）。今の行は --emph
      var first = Math.max(0, cur - this.iterFit + 1), L = this.L;
      this.iterRows.forEach(function(e, r){
        var i = first + r, on = cur >= 0 && i <= cur;
        e.textContent = on ? L.iter(i, num(pl.fp[i])) : ""; e.setAttribute("opacity", on ? 1 : 0);
        e.setAttribute("style", "fill:var(--" + (i === cur ? "emph" : "fg") + ")");
      });
    } else if (cur >= 0){ this.iterText.textContent = this.L.iter(cur, num(pl.fp[cur])); this.iterText.setAttribute("opacity", 1); this.titleG.setAttribute("opacity", 0); }
    else { this.iterText.textContent = ""; this.iterText.setAttribute("opacity", 0); this.titleG.setAttribute("opacity", 1); }
  }
};
});
