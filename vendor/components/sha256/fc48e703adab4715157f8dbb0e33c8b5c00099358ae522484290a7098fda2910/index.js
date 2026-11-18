// m-classify2d：2 次元の分類の図を、scikit-learn が出した値のとおりに描く。点・領域（格子の上の predict）・境界・
// 確率や決定関数の等高線（contour-core）・サポートベクトル・ボロノイ図（パーツが種の点から計算）・決定木の分割・k 平均法。
// 値は tools/sk2ega.py の出力を書く。パーツはモデルの計算をしない（k 平均法の割り当てと重心だけ確かめる）。
// <m-classify2d style="height:440px"><script type="application/json">
//   {"axes": {"x": {"label": "x₁", "range": [-3, 3]}, "y": {"label": "x₂", "range": [-2, 2]}},
//    "classes": [{"id": 0, "label": "A"}, {"id": 1, "label": "B"}], "points": [[0.4, 1.2, 1], [-1.1, 0.3, 0]],
//    "grid": {"nx": 60, "ny": 40, "labels": "0*35 1*25 …"}}
// （JSON の終わり）</m-classify2d>
// 格子：x は range を nx 点、y は ny 点に等分した点（両端を含む。numpy の linspace と meshgrid）。labels と fields の値は行ごと
// （行 0 が y の最小）。labels は 2 次元の配列か「クラス*個数」を空白で区切った行の順の続け書き。
// 色：クラスごとに CLASS_COLORS（--series-1・--series-3・--fg・--series-4）と点の形（○・□・△・◇。色だけに頼らない）、領域はその色の薄い塗り、境界と等高線 --fg、
// サポートベクトルの輪 --fg（クラスの色と --emph が近いテーマでも紛れない）、k 平均法の重心は × の印。
egatariParts.define({name: "classify2d", version: "2.0.0", requires: {base: "1.2.0", "contour-core": "1.0.0"}, element: "m-classify2d"}, function(deps){
"use strict";
var base = deps.base, D = base, K = deps["contour-core"], clipN = 0;
var NUM = {type: "number"}, PT = {type: "array", minItems: 2, maxItems: 3, items: {type: ["number", "null"]}};
var CAP = {classes: 4, points: 300, nx: 160, ny: 120, seeds: 40, nodes: 31, iters: 10, levels: 5};
var SHAPES = ["circle", "square", "triangle", "diamond"];
// クラスの色の並び（m-folds の classes と同じ。1 つの意味に 1 つの色）：--series-2 は印の色 --emph と同じテーマがあるので使わない。
// 既定のテーマでは --series-3 = --accent2、--series-4 = --muted なので、3 つ目は --fg（4 つ目の --muted は、k 平均法のまだ割り当てていない点と同じ色）
var CLASS_COLORS = ["var(--series-1)", "var(--series-3)", "var(--fg)", "var(--series-4)"];
var T = {
  ja: {summary: function(c, n){ return "分類の図：クラス " + c.join("・") + "、点 " + n + " 個"; }, regions: "領域", tree: "決定木の分割", kmeans: function(n){ return "k 平均法（" + n + " 回の繰り返し）"; }, sv: "サポートベクトル"},
  en: {summary: function(c, n){ return "Classification: classes " + c.join(", ") + "; " + n + " points"; }, regions: "regions", tree: "decision tree splits", kmeans: function(n){ return "k-means (" + n + " iterations)"; }, sv: "support vectors"}
};
function nice(lo, hi, n){
  var span = hi - lo, raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, st = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p, out = [];
  for (var v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9 * span; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return {ticks: out, step: st};
}
function fmt(v, st){ var d = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); var s = v.toFixed(Math.min(4, d)); return s.indexOf("-") === 0 ? "−" + s.slice(1) : s; }
function rle(s){ var out = []; String(s).trim().split(/\s+/).forEach(function(tok){ var m = /^(-?\d+)\*(\d+)$/.exec(tok); if (m){ for (var i = 0; i < +m[2]; i++) out.push(+m[1]); } else if (/^-?\d+$/.test(tok)) out.push(+tok); else out.push(NaN); }); return out; }
// 種の点 s のボロノイ領域：長方形を、ほかの種との垂直二等分線で切っていく（半平面の切り取り）
function cell(seeds, s, rect){
  var poly = [[rect[0], rect[2]], [rect[1], rect[2]], [rect[1], rect[3]], [rect[0], rect[3]]], p = seeds[s];
  for (var o = 0; o < seeds.length && poly.length; o++){
    if (o === s) continue;
    var q = seeds[o], nx = q[0] - p[0], ny = q[1] - p[1], c = (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2;
    if (!nx && !ny) continue;
    var inside = function(v){ return v[0] * nx + v[1] * ny <= c + 1e-12; }, out = [];
    for (var i = 0; i < poly.length; i++){
      var a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib){ var da = a[0] * nx + a[1] * ny - c, db = b[0] * nx + b[1] * ny - c, u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
    }
    poly = out;
  }
  return poly;
}
return class extends base.MotionElement {
  static partName = "classify2d";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["axes", "points"], properties: {
    axes: {type: "object", additionalProperties: false, required: ["x", "y"], properties: {
      x: {type: "object", additionalProperties: false, required: ["range"], properties: {label: {type: "string"}, range: {type: "array", minItems: 2, maxItems: 2, items: NUM}}},
      y: {type: "object", additionalProperties: false, required: ["range"], properties: {label: {type: "string"}, range: {type: "array", minItems: 2, maxItems: 2, items: NUM}}}}},
    classes: {type: "array", minItems: 1, maxItems: 4, items: {type: "object", additionalProperties: false, required: ["id"], properties: {id: {type: "integer"}, label: {type: "string"}}}},
    points: {type: "array", minItems: 1, maxItems: 300, items: PT},
    grid: {type: "object", additionalProperties: false, required: ["nx", "ny"], properties: {nx: {type: "integer"}, ny: {type: "integer"}, labels: {type: ["string", "array"]}}},
    fields: {type: "array", maxItems: 2, items: {type: "object", additionalProperties: false, required: ["values", "levels"], properties: {
      name: {type: "string"}, class: {type: "integer"}, values: {type: "array"}, levels: {type: "array", minItems: 1, maxItems: 5, items: NUM}, style: {type: "array", items: {type: "string", enum: ["solid", "dash"]}}, labels: {type: "boolean"}}}},
    sv: {type: "array", items: {type: "integer"}},
    voronoi: {type: "object", additionalProperties: false, required: ["seeds"], properties: {seeds: {type: "array", minItems: 1, maxItems: 40, items: PT}}},
    tree: {type: "object", additionalProperties: false, required: ["nodes"], properties: {nodes: {type: "array", minItems: 1, maxItems: 31, items: {type: "object", additionalProperties: false, required: ["id"], properties: {
      id: {type: "string"}, feature: {type: "integer", enum: [0, 1]}, threshold: NUM, left: {type: "string"}, right: {type: "string"}, class: {type: "integer"}}}}}},
    kmeans: {type: "object", additionalProperties: false, required: ["iters"], properties: {iters: {type: "array", minItems: 1, maxItems: 10, items: {type: "object", additionalProperties: false, required: ["centroids", "assign"], properties: {
      centroids: {type: "array", minItems: 1, maxItems: 4, items: {type: "array", minItems: 2, maxItems: 2, items: NUM}}, assign: {type: "array", items: {type: "integer"}}}}}}}
  }}, example: /*@egatari-block example*/{"axes":{"x":{"label":"x₁","range":[0,4]},"y":{"label":"x₂","range":[0,3]}},"classes":[{"id":0,"label":"A"},{"id":1,"label":"B"}],"points":[[1,1,0],[1.2,2,0],[2.8,1.1,1],[3.1,2.4,1]],"grid":{"nx":5,"ny":4,"labels":"0*2 1*3 0*2 1*3 0*2 1*3 0*3 1*2"}}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 0.9, doc: "1 ステップの秒数"},
    size: {type: "number", default: 24, doc: "字の大きさ（px、24 以上）"},
    marker: {type: "number", default: 8, doc: "点の印の半径（px）"}
  };
  get steps(){ return this.plan().steps.length; }
  duration(k){ return k >= 1 && k <= this.plan().steps.length ? this.props.dur : 0; }
  // データだけから決まること：ステップの並びと、確かめ（bad）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], steps = [], pts = d.points || [], classes = d.classes || [], cls = {};
    classes.forEach(function(c, i){ cls[c.id] = i; });
    var known = function(c){ return c === null || c === undefined || c in cls; };
    pts.forEach(function(p, i){ if (!known(p[2])) bad.push("points[" + i + "]: class " + p[2] + " is not in classes"); });
    var rx = d.axes && d.axes.x.range, ry = d.axes && d.axes.y.range;
    if (rx && !(rx[1] > rx[0])) bad.push("axes.x.range must be [min, max] with min < max");
    if (ry && !(ry[1] > ry[0])) bad.push("axes.y.range must be [min, max] with min < max");
    var labels = null;
    if (d.grid){
      var g = d.grid;
      if (!(g.nx >= 2 && g.nx <= CAP.nx && g.ny >= 2 && g.ny <= CAP.ny)) bad.push("grid: nx 2–" + CAP.nx + " and ny 2–" + CAP.ny + " (got " + g.nx + " × " + g.ny + ")");
      if (g.labels !== undefined){
        var flat = typeof g.labels === "string" ? rle(g.labels) : [].concat.apply([], g.labels);
        if (flat.length !== g.nx * g.ny) bad.push("grid.labels has " + flat.length + " values; nx × ny = " + g.nx * g.ny);
        else if (flat.some(function(v){ return !(v in cls); })) bad.push("grid.labels has a class that is not in classes");
        else { labels = []; for (var j = 0; j < g.ny; j++) labels.push(flat.slice(j * g.nx, (j + 1) * g.nx)); }
      }
    }
    var fields = (d.fields || []).map(function(f, i){
      var ok = d.grid && Array.isArray(f.values) && f.values.length === d.grid.ny && f.values.every(function(r){ return Array.isArray(r) && r.length === d.grid.nx && r.every(function(v){ return typeof v === "number"; }); });
      if (!ok) bad.push("fields[" + i + "].values must be ny × nx numbers (a grid is needed)");
      if (f.class !== undefined && !known(f.class)) bad.push("fields[" + i + "].class: " + f.class + " is not in classes");
      return ok ? f : null;
    }).filter(Boolean);
    (d.sv || []).forEach(function(n){ if (!(n >= 0 && n < pts.length)) bad.push("sv: " + n + " is not a point index (0–" + (pts.length - 1) + ")"); });
    (d.voronoi ? d.voronoi.seeds : []).forEach(function(s, i){ if (!known(s[2])) bad.push("voronoi.seeds[" + i + "]: class " + s[2] + " is not in classes"); });
    // 決定木：根から幅優先で分割を並べ、節ごとに長方形を持たせる
    var splits = [], leaves = [];
    if (d.tree && rx && ry){
      var byId = {}; d.tree.nodes.forEach(function(n){ byId[n.id] = n; });
      var queue = [{n: d.tree.nodes[0], r: [rx[0], rx[1], ry[0], ry[1]]}], seen = {};
      while (queue.length){
        var q = queue.shift(), n = q.n;
        if (seen[n.id]){ bad.push("tree: node \"" + n.id + "\" is reached twice"); continue; }
        seen[n.id] = true;
        if (n.left !== undefined || n.right !== undefined){
          var L = byId[n.left], R = byId[n.right];
          if (!L || !R){ bad.push("tree: node \"" + n.id + "\" needs left and right that exist"); continue; }
          var lo = n.feature === 0 ? q.r[0] : q.r[2], hi = n.feature === 0 ? q.r[1] : q.r[3];
          if (!(n.feature === 0 || n.feature === 1) || !(n.threshold > lo && n.threshold < hi)) bad.push("tree: node \"" + n.id + "\" threshold " + n.threshold + " is not inside its cell (" + lo + " to " + hi + " on feature " + n.feature + ")");
          var rl = q.r.slice(), rr = q.r.slice();
          if (n.feature === 0){ rl[1] = n.threshold; rr[0] = n.threshold; } else { rl[3] = n.threshold; rr[2] = n.threshold; }
          splits.push({id: n.id, feature: n.feature, t: n.threshold, r: q.r});
          queue.push({n: L, r: rl}, {n: R, r: rr});
        } else {
          if (!(n.class in cls)) bad.push("tree: leaf \"" + n.id + "\" needs a class from classes");
          leaves.push({id: n.id, cls: n.class, r: q.r});
        }
      }
    }
    // k 平均法：割り当ては最も近い重心か（同じ距離は許す）、次の重心は割り当てた点の平均か
    var km = d.kmeans ? d.kmeans.iters : null;
    if (km) km.forEach(function(it, i){
      if (it.assign.length !== pts.length){ bad.push("kmeans.iters[" + i + "].assign has " + it.assign.length + " entries; points has " + pts.length); return; }
      var C = it.centroids, d2 = function(p, c){ return (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]); };
      it.assign.forEach(function(a, n){
        if (!(a >= 0 && a < C.length)){ bad.push("kmeans.iters[" + i + "].assign[" + n + "] is not a centroid index"); return; }
        var best = Math.min.apply(null, C.map(function(c){ return d2(pts[n], c); }));
        if (d2(pts[n], C[a]) > best * (1 + 1e-9) + 1e-12) bad.push("kmeans.iters[" + i + "].assign[" + n + "] = " + a + " is not the nearest centroid");
      });
      if (km[i + 1]){
        C.forEach(function(_, c){
          var m = [0, 0], cnt = 0; it.assign.forEach(function(a, n){ if (a === c){ m[0] += pts[n][0]; m[1] += pts[n][1]; cnt++; } });
          if (!cnt) return;
          var want = [m[0] / cnt, m[1] / cnt], got = km[i + 1].centroids[c];
          if (!got || Math.abs(got[0] - want[0]) > 1e-6 * Math.max(1, Math.abs(want[0])) + 0.51 * Math.pow(10, -dec(got[0])) || Math.abs(got[1] - want[1]) > 1e-6 * Math.max(1, Math.abs(want[1])) + 0.51 * Math.pow(10, -dec(got[1])))
            bad.push("kmeans.iters[" + (i + 1) + "].centroids[" + c + "] should be the mean of the points assigned in iteration " + i + ": (" + +want[0].toFixed(6) + ", " + +want[1].toFixed(6) + ")");
        });
      }
    });
    function dec(v){ var s = String(v).split(".")[1]; return s ? Math.min(s.length, 12) : 12; }
    // ステップ
    steps.push({kind: "points"});
    if (km){ km.forEach(function(_, i){ steps.push({kind: "assign", i: i}); if (i + 1 < km.length) steps.push({kind: "update", i: i}); }); }
    else if (d.tree){ splits.forEach(function(s, i){ steps.push({kind: "split", i: i}); }); steps.push({kind: "leaves"}); }
    else {
      if (labels || d.voronoi) steps.push({kind: "regions"});
      fields.forEach(function(f, i){ steps.push({kind: "field", i: i}); });
      if ((d.sv || []).length) steps.push({kind: "sv"});
    }
    if (d.tree && (labels || d.voronoi || fields.length)) bad.push("tree mode draws its own regions: leave out grid, fields and voronoi");
    if (km && (d.tree || labels || d.voronoi)) bad.push("kmeans mode draws its own cells: leave out grid, voronoi and tree");
    return (this._plan = {d: d, bad: bad, steps: steps, cls: cls, classes: classes, labels: labels, fields: fields, splits: splits, leaves: leaves, km: km});
  }
  mount(ctx){
    var self = this, P = this.props, pl = this.plan(), d = pl.d, ja = /^ja\b/i.test(ctx.lang || "ja"), L = ja ? T.ja : T.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[classify2d] dur must be positive; using 0.9"); P.dur = 0.9; }
    if (!(Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[classify2d] size must be at least 24; using 24"); P.size = 24; }
    if (!(Number.isFinite(P.marker) && P.marker >= 4)){ ctx.report("attr", "[classify2d] marker must be at least 4; using 8"); P.marker = 8; }
    pl.bad.forEach(function(s){ ctx.report("data", "[classify2d] " + s); });
    this.style.display = "block"; this.style.position = "relative";
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = P.size, mr = P.marker;
    var rx = d.axes.x.range, ry = d.axes.y.range, tx = nice(rx[0], rx[1], 6), ty = nice(ry[0], ry[1], 5);
    var tw = function(s){ return base.textWidth(s, fs, {font: self}); };
    var yTickW = Math.max.apply(null, ty.ticks.map(function(v){ return tw(fmt(v, ty.step)); }).concat([0]));
    // 上：凡例の行（クラスの印と名前）と y 軸の名前。下：x の目盛りと x 軸の名前
    var legendH = Math.ceil(fs * 1.7), m = {l: Math.ceil(yTickW) + 14, r: 12, t: legendH + 6, b: Math.ceil(fs * 1.3) + 6};
    var px = m.l, py = m.t, pw = Math.max(1, W - m.l - m.r), ph = Math.max(1, H - m.t - m.b);
    if (pw < 200 || ph < 150) ctx.report("size", "[classify2d] element is " + W + " × " + H + " px; allow at least " + Math.ceil(m.l + m.r + 200) + " × " + Math.ceil(m.t + m.b + 150) + " px");
    var X = function(x){ return px + (x - rx[0]) / (rx[1] - rx[0]) * pw; }, Y = function(y){ return py + (ry[1] - y) / (ry[1] - ry[0]) * ph; };
    this.geo = {X: X, Y: Y, px: px, py: py, pw: pw, ph: ph, rect: [rx[0], rx[1], ry[0], ry[1]]};
    var colOf = function(c){ var i = pl.cls[c]; return i === undefined ? "var(--muted)" : CLASS_COLORS[i]; };
    this.colOf = colOf;
    this.setAttribute("role", "img");
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    var names = pl.classes.map(function(c){ return c.label || String(c.id); });
    if (!this._aria) this.setAttribute("aria-label", L.summary(names, d.points.length) + (pl.km ? "; " + L.kmeans(pl.km.length) : d.tree ? "; " + L.tree : pl.labels || d.voronoi ? "; " + L.regions : "") + ((d.sv || []).length ? "; " + L.sv + " " + d.sv.length : ""));
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var cid = "classify2d-2-0-0-clip" + (++clipN);
    D.el("rect", {x: px, y: py, width: pw, height: ph}, D.el("clipPath", {id: cid}, D.el("defs", {}, svg)));
    var plot = D.el("g", {"clip-path": "url(#" + cid + ")"}, svg);
    // 層：領域 → ボロノイ → 決定木の葉 → 格子線 → 等高線 → 分割の線 → 点 → 輪 → 重心
    this.regionG = D.el("g", {opacity: 0, "shape-rendering": "crispEdges"}, plot);
    this.vorG = D.el("g", {opacity: 0}, plot);
    this.leafG = D.el("g", {opacity: 0}, plot);
    this.kmG = D.el("g", {}, plot);
    var gridG = D.el("g", {}, plot);
    tx.ticks.forEach(function(v){ D.el("line", {x1: X(v), y1: py, x2: X(v), y2: py + ph, stroke: "var(--line)", "stroke-width": 1, opacity: 0.6}, gridG); });
    ty.ticks.forEach(function(v){ D.el("line", {x1: px, y1: Y(v), x2: px + pw, y2: Y(v), stroke: "var(--line)", "stroke-width": 1, opacity: 0.6}, gridG); });
    this.boundaryG = D.el("g", {opacity: 0}, plot);
    this.fieldG = pl.fields.map(function(){ return D.el("g", {opacity: 0}, plot); });
    this.splitEls = [];
    var splitG = D.el("g", {}, plot);
    D.el("rect", {x: px, y: py, width: pw, height: ph, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, svg);
    // 目盛りと軸の名前
    // x の目盛りの数は、右端の x 軸の名前と重ならないものだけ
    var xLabW = d.axes.x.label ? tw(d.axes.x.label.replace(/[*_]/g, "")) + 12 : 0;
    tx.ticks.forEach(function(v){ var s = fmt(v, tx.step); if (X(v) + tw(s) / 2 > px + pw - xLabW) return; D.el("text", {x: X(v), y: py + ph + fs + 2, "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, svg).textContent = s; });
    ty.ticks.forEach(function(v){ D.el("text", {x: px - 8, y: Y(v) + fs * 0.35, "font-size": fs, "text-anchor": "end", fill: "var(--muted)"}, svg).textContent = fmt(v, ty.step); });
    if (d.axes.y.label) D.mtext(svg, px, legendH - fs * 0.45, d.axes.y.label, {"font-size": fs, fill: "var(--fg)"});
    // 凡例：右上にクラスの印と名前（k 平均法はクラスターなので書かない）
    var legW = 0, legend = pl.km ? [] : pl.classes.map(function(c, i){ var t = c.label || String(c.id), w = 2 * mr + 10 + tw(t) + 20; legW += w; return {t: t, w: w, i: i, id: c.id}; });
    var lx = W - m.r - legW, yLabW = d.axes.y.label ? tw(d.axes.y.label.replace(/[*_]/g, "")) + 16 : 0;
    if (lx < px + yLabW) ctx.report("layout", "[classify2d] the class names need " + Math.ceil(legW) + " px beside the y-axis name; shorten them");
    legend.forEach(function(o){ self.marker(svg, lx + mr, legendH / 2 + 2, o.i, colOf(o.id), mr); D.el("text", {x: lx + 2 * mr + 10, y: legendH / 2 + 2 + fs * 0.35, "font-size": fs, fill: "var(--fg)"}, svg).textContent = o.t; lx += o.w; });
    // x 軸の名前：目盛りの右端の数の左に入らなければ、目盛りの行の右に
    if (d.axes.x.label) D.mtext(svg, px + pw, py + ph + fs + 2, d.axes.x.label, {"font-size": fs, "text-anchor": "end", fill: "var(--fg)", "data-xlabel": ""});
    // 領域（格子の上の predict）：行ごとに同じクラスの続きを 1 つの長方形に。境界は違うクラスの間のセルの辺（階段）
    if (pl.labels){
      var g = d.grid, dx = (rx[1] - rx[0]) / (g.nx - 1), dy = (ry[1] - ry[0]) / (g.ny - 1), lab = pl.labels;
      var cx = function(i){ return Math.max(rx[0], Math.min(rx[1], rx[0] + (i - 0.5) * dx)); }, cy = function(j){ return Math.max(ry[0], Math.min(ry[1], ry[0] + (j - 0.5) * dy)); };
      lab.forEach(function(row, j){
        var i0 = 0;
        for (var i = 1; i <= row.length; i++) if (i === row.length || row[i] !== row[i0]){
          D.el("rect", {x: X(cx(i0)).toFixed(1), y: Y(cy(j + 1)).toFixed(1), width: (X(cx(i)) - X(cx(i0))).toFixed(1), height: (Y(cy(j)) - Y(cy(j + 1))).toFixed(1), fill: colOf(row[i0]), "fill-opacity": 0.2}, self.regionG);
          i0 = i;
        }
      });
      var path = "";
      for (var j = 0; j < g.ny; j++) for (var i = 0; i < g.nx; i++){
        if (i + 1 < g.nx && lab[j][i] !== lab[j][i + 1]) path += "M" + X(cx(i + 1)).toFixed(1) + " " + Y(cy(j)).toFixed(1) + "V" + Y(cy(j + 1)).toFixed(1);
        if (j + 1 < g.ny && lab[j][i] !== lab[j + 1][i]) path += "M" + X(cx(i)).toFixed(1) + " " + Y(cy(j + 1)).toFixed(1) + "H" + X(cx(i + 1)).toFixed(1);
      }
      // 確率や決定関数の等高線があれば、境界はそちらの滑らかな線で見せる（階段は描かない）
      if (path && !pl.fields.length) D.el("path", {d: path, fill: "none", stroke: "var(--fg)", "stroke-width": 2.5, "stroke-linecap": "square"}, this.boundaryG);
    }
    // ボロノイ図（種の点から計算）
    if (d.voronoi){
      var seeds = d.voronoi.seeds, rect = this.geo.rect;
      seeds.forEach(function(sd, s){
        var poly = cell(seeds, s, rect);
        if (poly.length < 3) return;
        D.el("path", {d: "M" + poly.map(function(v){ return X(v[0]).toFixed(1) + " " + Y(v[1]).toFixed(1); }).join("L") + "Z", fill: sd[2] === null || sd[2] === undefined ? "none" : colOf(sd[2]), "fill-opacity": 0.2, stroke: "var(--fg)", "stroke-width": 2}, self.vorG);
      });
      seeds.forEach(function(sd){ D.el("circle", {cx: X(sd[0]), cy: Y(sd[1]), r: 4, fill: "var(--fg)"}, self.vorG); });
    }
    // 等高線（確率・決定関数）と、その値の名前（線の上、地の色の縁取り）
    pl.fields.forEach(function(f, n){
      var g = d.grid, dx = (rx[1] - rx[0]) / (g.nx - 1), dy = (ry[1] - ry[0]) / (g.ny - 1);
      var gxp = function(p){ return X(rx[0] + p[0] * dx); }, gyp = function(p){ return Y(ry[0] + p[1] * dy); };
      f.levels.forEach(function(lv, li){
        var dash = (f.style || [])[li] === "dash";
        K.lines(f.values, lv).forEach(function(line){
          if (line.length < 2) return;
          D.el("path", {d: "M" + line.map(function(p){ return gxp(p).toFixed(1) + " " + gyp(p).toFixed(1); }).join("L"), fill: "none", stroke: "var(--fg)", "stroke-width": dash ? 2 : 3, "stroke-dasharray": dash ? "10 8" : null}, self.fieldG[n]);
          if (f.labels !== false){
            var at = K.labelAt(line), x = gxp([at.x, at.y]), y = gyp([at.x, at.y]), len = Math.hypot(gxp(line[line.length - 1]) - gxp(line[0]), gyp(line[line.length - 1]) - gyp(line[0]));
            if (at.length && (len > 3 * fs || line.length > 8)){
              var t = D.el("text", {x: x.toFixed(1), y: (y + fs * 0.35).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", "stroke-linejoin": "round"}, self.fieldG[n]);
              t.textContent = (lv < 0 ? "−" : "") + String(Math.abs(lv));
            }
          }
        });
      });
    });
    // 決定木の分割（親のセルの中の線）と葉
    pl.splits.forEach(function(s){
      var e = s.feature === 0 ? D.el("line", {x1: X(s.t), y1: Y(s.r[3]), x2: X(s.t), y2: Y(s.r[3]), stroke: "var(--fg)", "stroke-width": 3}, splitG) : D.el("line", {x1: X(s.r[0]), y1: Y(s.t), x2: X(s.r[0]), y2: Y(s.t), stroke: "var(--fg)", "stroke-width": 3}, splitG);
      self.splitEls.push(e);
    });
    pl.leaves.forEach(function(lf){ D.el("rect", {x: X(lf.r[0]), y: Y(lf.r[3]), width: X(lf.r[1]) - X(lf.r[0]), height: Y(lf.r[2]) - Y(lf.r[3]), fill: colOf(lf.cls), "fill-opacity": 0.2}, self.leafG); });
    // k 平均法のセル（重心のボロノイ図。描くたびに重心から計算）
    if (pl.km){ this.kmCells = pl.km[0].centroids.map(function(_, c){ return D.el("path", {fill: CLASS_COLORS[c], "fill-opacity": 0.18, stroke: "var(--fg)", "stroke-width": 2, opacity: 0}, self.kmG); }); }
    // 点
    var ptG = this.ptG = D.el("g", {opacity: 0}, svg);
    this.ptEls = d.points.map(function(p){ return self.marker(ptG, X(p[0]), Y(p[1]), pl.km ? -1 : pl.cls[p[2]], pl.km ? "var(--muted)" : colOf(p[2]), mr); });
    this.svG = D.el("g", {opacity: 0}, svg);
    (d.sv || []).forEach(function(n){ var p = d.points[n]; if (p) D.el("circle", {cx: X(p[0]), cy: Y(p[1]), r: mr + 7, fill: "none", stroke: "var(--fg)", "stroke-width": 3}, self.svG); });
    if (pl.km) this.cEls = pl.km[0].centroids.map(function(_, c){ var g = D.el("g", {opacity: 0}, svg); D.el("path", {d: "M-12 -12L12 12M-12 12L12 -12", stroke: "var(--bg)", "stroke-width": 9, "stroke-linecap": "round"}, g); D.el("path", {d: "M-12 -12L12 12M-12 12L12 -12", stroke: CLASS_COLORS[c], "stroke-width": 5, "stroke-linecap": "round"}, g); return g; });
    if (d.points.length * Math.PI * mr * mr > pw * ph * 0.35) ctx.report("layout", "[classify2d] " + d.points.length + " points cover more than a third of the plot at marker " + mr + " px; use a smaller marker or fewer points");
  }
  // クラスの印：○・□・△・◇（クラスの順）。i < 0 は印なしの○
  marker(g, x, y, i, col, r){
    var s = SHAPES[i] || "circle", e;
    if (s === "circle") e = D.el("circle", {cx: x.toFixed(1), cy: y.toFixed(1), r: r, fill: col, stroke: "var(--bg)", "stroke-width": 1.5}, g);
    else if (s === "square") e = D.el("rect", {x: (x - r * 0.9).toFixed(1), y: (y - r * 0.9).toFixed(1), width: (1.8 * r).toFixed(1), height: (1.8 * r).toFixed(1), fill: col, stroke: "var(--bg)", "stroke-width": 1.5}, g);
    else if (s === "triangle") e = D.el("path", {d: "M" + x.toFixed(1) + " " + (y - 1.2 * r).toFixed(1) + "L" + (x + 1.1 * r).toFixed(1) + " " + (y + 0.8 * r).toFixed(1) + "L" + (x - 1.1 * r).toFixed(1) + " " + (y + 0.8 * r).toFixed(1) + "Z", fill: col, stroke: "var(--bg)", "stroke-width": 1.5}, g);
    else e = D.el("path", {d: "M" + x.toFixed(1) + " " + (y - 1.25 * r).toFixed(1) + "L" + (x + 1.1 * r).toFixed(1) + " " + y.toFixed(1) + "L" + x.toFixed(1) + " " + (y + 1.25 * r).toFixed(1) + "L" + (x - 1.1 * r).toFixed(1) + " " + y.toFixed(1) + "Z", fill: col, stroke: "var(--bg)", "stroke-width": 1.5}, g);
    return e;
  }
  render(k, t){
    if (!this.svg) return;
    var self = this, pl = this.plan(), G = this.geo, dur = this.props.dur, steps = pl.steps;
    var ph = function(i){ return k > i + 1 ? 1 : k < i + 1 ? 0 : base.prog(t, 0, dur); };
    var at = function(kind, i){ for (var n = 0; n < steps.length; n++) if (steps[n].kind === kind && (i === undefined || steps[n].i === i)) return n; return -1; };
    this.ptG.setAttribute("opacity", ph(0).toFixed(3));
    var r = at("regions"); this.regionG.setAttribute("opacity", r >= 0 ? ph(r).toFixed(3) : 0); this.vorG.setAttribute("opacity", r >= 0 ? ph(r).toFixed(3) : 0); this.boundaryG.setAttribute("opacity", r >= 0 ? ph(r).toFixed(3) : 0);
    this.fieldG.forEach(function(g, n){ var s = at("field", n); g.setAttribute("opacity", ph(s).toFixed(3)); });
    var sv = at("sv"); this.svG.setAttribute("opacity", sv >= 0 ? ph(sv).toFixed(3) : 0);
    // 決定木：分割の線が親のセルの端から端へ伸びる
    pl.splits.forEach(function(s, n){
      var e = ph(at("split", n)), el = self.splitEls[n];
      if (s.feature === 0){ el.setAttribute("y1", G.Y(s.r[3]).toFixed(1)); el.setAttribute("y2", G.Y(s.r[3] + (s.r[2] - s.r[3]) * e).toFixed(1)); }
      else { el.setAttribute("x1", G.X(s.r[0]).toFixed(1)); el.setAttribute("x2", G.X(s.r[0] + (s.r[1] - s.r[0]) * e).toFixed(1)); }
      el.setAttribute("opacity", e > 0 ? 1 : 0);
    });
    var lv = at("leaves"); this.leafG.setAttribute("opacity", lv >= 0 ? ph(lv).toFixed(3) : 0);
    // k 平均法：割り当て（点の色とセル）、更新（重心が動き、セルが付いていく）
    if (pl.km){
      var km = pl.km, cur = -1, cs = km[0].centroids, assign = null, showCells = 0;
      steps.forEach(function(s, n){
        var e = ph(n);
        if (e <= 0) return;
        if (s.kind === "assign"){ cur = s.i; cs = km[s.i].centroids; assign = km[s.i].assign; showCells = e; }
        if (s.kind === "update"){ var a = km[s.i].centroids, b = km[s.i + 1].centroids; cs = a.map(function(c, j){ return [c[0] + (b[j][0] - c[0]) * e, c[1] + (b[j][1] - c[1]) * e]; }); showCells = 1; }
      });
      var first = ph(0) > 0 ? 1 : 0;
      this.cEls.forEach(function(g, j){ var c = cs[j]; g.setAttribute("transform", "translate(" + G.X(c[0]).toFixed(1) + " " + G.Y(c[1]).toFixed(1) + ")"); g.setAttribute("opacity", first); });
      this.kmCells.forEach(function(p, j){ var poly = cell(cs, j, G.rect); p.setAttribute("d", poly.length > 2 ? "M" + poly.map(function(v){ return G.X(v[0]).toFixed(1) + " " + G.Y(v[1]).toFixed(1); }).join("L") + "Z" : ""); p.setAttribute("opacity", showCells.toFixed(3)); });
      this.ptEls.forEach(function(e, n){ e.setAttribute("style", "fill:" + (assign ? CLASS_COLORS[assign[n]] : "var(--muted)")); });
    }
  }
};
});
