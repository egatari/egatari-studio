// m-vector：平面のベクトルと 2 × 2 の行列。座標平面にベクトルを描き、和・差・スカラー倍・正射影・内積を 1 ステップずつ、
// 行列の 1 次変換（格子と単位正方形が I から M へ動く。固有ベクトルの向きは変わらない。面積は |det|）と、基底の取り替えを見せる。
// 2 次元の計算はパーツがする（書いた value は計算と比べて確かめる）。右の欄に、ステップごとの式を 1 行ずつ足す。
// <m-vector style="height:440px"><script type="application/json">
//   {"range": [-4, 4, -3, 3], "vectors": [{"id": "a", "v": [2, 1], "label": "*a*"}, {"id": "b", "v": [-1, 2], "label": "*b*"}],
//    "ops": [{"sum": ["a", "b"], "as": "c", "label": "*a* + *b*"}, {"dot": ["a", "b"]}]}
// （JSON の終わり）</m-vector>
// 色：ベクトル --term、そのステップの結果 --emph、補助の線（平行移動・垂線）--muted の破線、変換した格子・新しい基底 --accent2、
// 固有ベクトルの向き --emph の破線。
egatariParts.define({name: "vector", version: "2.1.0", requires: {base: "1.3.0"}, element: "m-vector"}, function(deps){
"use strict";
var base = deps.base, D = base, clipN = 0;
var NUM = {type: "number"}, V2 = {type: "array", minItems: 2, maxItems: 2, items: NUM}, ID = {type: "string"};
var T = {
  ja: {proj: function(a, b){ return a + " の " + b + " への正射影"; }, det: function(d){ return "det *M* = " + d + "（単位正方形の面積が " + d.replace(/^−/, "") + " 倍" + (d.indexOf("−") === 0 ? "、向きが裏返る" : "") + "）"; },
       eigen: function(l){ return "固有値 " + l.join("、") + "（固有ベクトルの向きは変わらない）"; }, complex: "固有値は複素数（向きの変わらないベクトルはない）",
       basis: function(b1, b2){ return "新しい基底 " + b1 + "、" + b2; }, inBasis: function(lab, s){ return lab + " = " + s; }, area: function(d){ return "面積 " + d; }},
  en: {proj: function(a, b){ return "proj of " + a + " onto " + b; }, det: function(d){ return "det *M* = " + d + " (the unit square's area × " + d.replace(/^−/, "") + (d.indexOf("−") === 0 ? ", flipped" : "") + ")"; },
       eigen: function(l){ return "eigenvalues " + l.join(", ") + " (eigenvectors keep their direction)"; }, complex: "complex eigenvalues (no direction is kept)",
       basis: function(b1, b2){ return "new basis " + b1 + ", " + b2; }, inBasis: function(lab, s){ return lab + " = " + s; }, area: function(d){ return "area " + d; }}
};
// 数の字：小数 2 桁まで、末尾の 0 は書かない、負号は −
function num(v){ var r = Math.round(v * 100) / 100; if (Object.is(r, -0) || Math.abs(r) < 1e-12) r = 0; return (r < 0 ? "−" : "") + String(Math.abs(r)); }
function pair(v){ return "(" + num(v[0]) + ", " + num(v[1]) + ")"; }
function paren(v){ var s = num(v); return v < 0 ? "(" + s + ")" : s; }
function mul(M, v){ return [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]]; }
function dec(v){ var s = String(v).split(".")[1]; return s ? s.length : 0; }
return class extends base.MotionElement {
  static partName = "vector";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["vectors"], properties: {
    range: {type: "array", minItems: 4, maxItems: 4, items: NUM},
    vectors: {type: "array", minItems: 1, maxItems: 6, items: {type: "object", additionalProperties: false, required: ["id", "v"], properties: {id: ID, v: V2, label: {type: "string"}, from: V2}}},
    ops: {type: "array", maxItems: 8, items: {type: "object", additionalProperties: false, anyOf: [{required: ["sum"]}, {required: ["diff"]}, {required: ["scale"]}, {required: ["proj"]}, {required: ["dot"]}], properties: {
      sum: {type: "array", minItems: 2, maxItems: 2, items: ID}, diff: {type: "array", minItems: 2, maxItems: 2, items: ID},
      scale: {type: "array", minItems: 2, maxItems: 2, items: {type: ["string", "number"]}}, proj: {type: "array", minItems: 2, maxItems: 2, items: ID}, dot: {type: "array", minItems: 2, maxItems: 2, items: ID},
      as: ID, label: {type: "string"}, value: {type: ["number", "array"], items: NUM}, note: {type: "string"}}}},
    matrix: {type: "array", minItems: 2, maxItems: 2, items: V2},
    basis: {type: "array", minItems: 2, maxItems: 2, items: V2},
    basisLabels: {type: "array", minItems: 2, maxItems: 2, items: {type: "string"}},
    show: {type: "array", items: {type: "string", enum: ["grid", "unit", "eigen", "det"]}}
  }}, example: /*@egatari-block example*/{"range":[-4,4,-3,3],"vectors":[{"id":"a","v":[2,1],"label":"*a*"},{"id":"b","v":[-1,2],"label":"*b*"}],"ops":[{"sum":["a","b"],"as":"c","label":"*a* + *b*"},{"dot":["a","b"],"value":0}]}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 1, doc: "1 ステップの秒数"},
    size: {type: "number", default: 26, doc: "字の大きさ（px、24 以上）"}
  };
  get steps(){ var p = this.plan(); return p.steps.length; }
  duration(k){ return k >= 1 && k <= this.plan().steps.length ? this.props.dur : 0; }
  // データだけから決まる計算：ベクトル（id → 値と名前）、ステップ（種類・図形・右の欄の行）、確かめ（bad）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], ja = !/^en\b/i.test(this.getAttribute("lang") || (this.closest && this.closest("[lang]") ? this.closest("[lang]").getAttribute("lang") : "ja") || "ja");
    var L = ja ? T.ja : T.en, vec = {}, steps = [], show = d.show || ["grid", "unit"];
    var lab = function(id){ return vec[id] ? vec[id].label : id; };
    (d.vectors || []).forEach(function(o, i){
      if (vec[o.id]) bad.push("vectors[" + i + "]: id \"" + o.id + "\" is used twice");
      vec[o.id] = {v: o.v, label: o.label || "*" + o.id + "*", from: o.from || [0, 0], base: true};
    });
    steps.push({kind: "vectors", lines: (d.vectors || []).map(function(o){ return lab(o.id) + " = " + pair(o.v); })});
    var need = function(id, j){ if (!vec[id]){ bad.push("ops[" + j + "]: unknown vector \"" + id + "\""); return false; } return true; };
    var check = function(j, got, want){
      if (got === undefined) return;
      var g = [].concat(got), w = [].concat(want);
      var okv = g.length === w.length && g.every(function(x, i){ return Math.abs(x - w[i]) <= 0.51 * Math.pow(10, -dec(x)) + 1e-9; });
      if (!okv) bad.push("ops[" + j + "].value is " + JSON.stringify(got) + " but the part computes " + (w.length === 1 ? +w[0].toFixed(6) : "[" + w.map(function(x){ return +x.toFixed(6); }).join(", ") + "]"));
    };
    (d.ops || []).forEach(function(op, j){
      var s = null;
      if (op.sum && need(op.sum[0], j) && need(op.sum[1], j)){
        var A = vec[op.sum[0]].v, B = vec[op.sum[1]].v, r = [A[0] + B[0], A[1] + B[1]];
        s = {kind: "sum", a: op.sum[0], b: op.sum[1], r: r, lines: [lab(op.sum[0]) + " + " + lab(op.sum[1]) + " = " + pair(r)]}; check(j, op.value, r);
      } else if (op.diff && need(op.diff[0], j) && need(op.diff[1], j)){
        var A2 = vec[op.diff[0]].v, B2 = vec[op.diff[1]].v, r2 = [A2[0] - B2[0], A2[1] - B2[1]];
        s = {kind: "diff", a: op.diff[0], b: op.diff[1], r: r2, lines: [lab(op.diff[0]) + " − " + lab(op.diff[1]) + " = " + pair(r2)]}; check(j, op.value, r2);
      } else if (op.scale){
        var id = typeof op.scale[0] === "string" ? op.scale[0] : op.scale[1], k = typeof op.scale[0] === "number" ? op.scale[0] : op.scale[1];
        if (typeof id !== "string" || typeof k !== "number") bad.push("ops[" + j + "].scale is [vector id, number]");
        else if (need(id, j)){ var r3 = [k * vec[id].v[0], k * vec[id].v[1]]; s = {kind: "scale", a: id, k: k, r: r3, lines: [num(k) + lab(id) + " = " + pair(r3)]}; check(j, op.value, r3); }
      } else if ((op.proj || op.dot) && need((op.proj || op.dot)[0], j) && need((op.proj || op.dot)[1], j)){
        var ids = op.proj || op.dot, A4 = vec[ids[0]].v, B4 = vec[ids[1]].v, bb = B4[0] * B4[0] + B4[1] * B4[1], dot = A4[0] * B4[0] + A4[1] * B4[1];
        if (bb === 0){ bad.push("ops[" + j + "]: " + ids[1] + " is the zero vector"); }
        else {
          var c = dot / bb, r4 = [c * B4[0], c * B4[1]];
          if (op.proj){ s = {kind: "proj", a: ids[0], b: ids[1], r: r4, lines: [L.proj(lab(ids[0]), lab(ids[1])) + " = " + pair(r4)]}; check(j, op.value, r4); }
          else { s = {kind: "dot", a: ids[0], b: ids[1], r: r4, value: dot, lines: [lab(ids[0]) + "·" + lab(ids[1]) + " = " + paren(A4[0]) + "×" + paren(B4[0]) + " + " + paren(A4[1]) + "×" + paren(B4[1]) + " = " + num(dot)]}; check(j, op.value, dot); }
        }
      }
      if (!s){ if (!bad.length) bad.push("ops[" + j + "] needs one of sum, diff, scale, proj, dot"); steps.push({kind: "none", lines: []}); return; }
      if (op.note) s.lines.push(op.note);
      s.label = op.label || (op.as ? "*" + op.as + "*" : s.kind === "scale" ? num(s.k) + lab(s.a) : "");
      if (op.as){
        if (vec[op.as]) bad.push("ops[" + j + "].as \"" + op.as + "\" is already a vector");
        else if (s.kind !== "dot") vec[op.as] = {v: s.r, label: op.label || "*" + op.as + "*", from: [0, 0]};
      }
      steps.push(s);
    });
    if (d.matrix && d.basis) bad.push("matrix and basis are separate lessons: give one of them");
    if (d.matrix){
      var M = d.matrix, det = M[0][0] * M[1][1] - M[0][1] * M[1][0], tr = M[0][0] + M[1][1], disc = tr * tr - 4 * det, ev = [];
      var lines = ["*M* = ((" + num(M[0][0]) + ", " + num(M[0][1]) + "), (" + num(M[1][0]) + ", " + num(M[1][1]) + "))"];
      if (show.indexOf("det") >= 0 || show.indexOf("unit") >= 0) lines.push(L.det(num(det)));
      if (show.indexOf("eigen") >= 0){
        if (disc < -1e-12){ bad.push("matrix has complex eigenvalues; its eigenvector spans are not drawn (leave eigen out of show)"); lines.push(L.complex); }
        else {
          var sq = Math.sqrt(Math.max(0, disc)), ls = disc > 1e-12 ? [(tr + sq) / 2, (tr - sq) / 2] : [tr / 2];
          ls.forEach(function(l){
            // (M − λI) x = 0 の解の向き
            var a = M[0][0] - l, b = M[0][1], c2 = M[1][0], e = M[1][1] - l, u = Math.abs(a) + Math.abs(b) > 1e-9 ? [-b, a] : Math.abs(c2) + Math.abs(e) > 1e-9 ? [-e, c2] : [1, 0];
            var n = Math.hypot(u[0], u[1]); ev.push({l: l, u: [u[0] / n, u[1] / n]});
            if (Math.abs(a) + Math.abs(b) + Math.abs(c2) + Math.abs(e) < 1e-9) ev.push({l: l, u: [0, 1]});   // M = λI：どの向きも
          });
          lines.push(L.eigen(ls.map(num)));
        }
      }
      steps.push({kind: "matrix", M: M, det: det, ev: ev, lines: lines});
    }
    if (d.basis){
      var Bm = d.basis, bd = Bm[0][0] * Bm[1][1] - Bm[1][0] * Bm[0][1], bl = d.basisLabels || ["*b*_1", "*b*_2"];
      if (Math.abs(bd) < 1e-12) bad.push("basis vectors are parallel (not a basis)");
      var lines2 = [L.basis(bl[0] + " = " + pair(Bm[0]), bl[1] + " = " + pair(Bm[1]))];
      if (Math.abs(bd) >= 1e-12) (d.vectors || []).forEach(function(o){
        // v = c1 b1 + c2 b2 → (c1, c2) = B⁻¹ v（B の列が b1, b2）
        var c1 = (o.v[0] * Bm[1][1] - o.v[1] * Bm[1][0]) / bd, c2 = (Bm[0][0] * o.v[1] - Bm[0][1] * o.v[0]) / bd;
        var term = function(c, l, first){ if (Math.abs(c) < 1e-12) return ""; var s = Math.abs(Math.abs(c) - 1) < 1e-12 ? l : num(Math.abs(c)) + l; return (c < 0 ? (first ? "−" : " − ") : (first ? "" : " + ")) + s; };
        var t1 = term(c1, bl[0], true), t2 = term(c2, bl[1], !t1);
        lines2.push(L.inBasis(lab(o.id), (t1 + t2) || "0"));
      });
      steps.push({kind: "basis", B: Bm, labels: bl, lines: lines2});
    }
    // 範囲：書いていなければ、すべてのベクトルと結果が入る整数の範囲（1 の余白）
    var r = d.range;
    if (!r){
      var xs = [0], ys = [0];
      Object.keys(vec).forEach(function(id){ var o = vec[id]; xs.push(o.from[0], o.from[0] + o.v[0]); ys.push(o.from[1], o.from[1] + o.v[1]); });
      steps.forEach(function(s){ if (s.r){ xs.push(s.r[0]); ys.push(s.r[1]); } if (s.kind === "sum"){ var A = vec[s.a].v, B = vec[s.b].v; xs.push(A[0] + B[0]); ys.push(A[1] + B[1]); } });
      if (d.matrix) Object.keys(vec).forEach(function(id){ var w = mul(d.matrix, vec[id].v); xs.push(w[0]); ys.push(w[1]); });
      if (d.basis) d.basis.forEach(function(b){ xs.push(b[0]); ys.push(b[1]); });
      r = [Math.floor(Math.min.apply(null, xs)) - 1, Math.ceil(Math.max.apply(null, xs)) + 1, Math.floor(Math.min.apply(null, ys)) - 1, Math.ceil(Math.max.apply(null, ys)) + 1];
    } else if (!(r[1] > r[0] && r[3] > r[2])) { bad.push("range is [xmin, xmax, ymin, ymax] with min < max"); r = [-4, 4, -3, 3]; }
    return (this._plan = {vec: vec, steps: steps, bad: bad, range: r, show: show, L: L, ja: ja, d: d});
  }
  mount(ctx){
    var self = this, P = this.props, pl = this.plan(), d = pl.d;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[vector] dur must be positive; using 1"); P.dur = 1; }
    if (!(Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[vector] size must be at least 24; using 26"); P.size = 26; }
    pl.bad.forEach(function(s){ ctx.report("data", "[vector] " + s); });
    this.style.display = "block"; this.style.position = "relative";
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), fs = P.size, tick = 24, row = Math.ceil(fs * 1.65), r = pl.range;
    // 右の欄の行（ステップごとに足す）
    var allLines = [].concat.apply([], pl.steps.map(function(s){ return s.lines; }));
    var tw = function(s){ return base.textWidth(s.replace(/\*/g, "").replace(/_(\d)/g, "$1"), fs, {font: self}); };
    var panelNatural = Math.max(200, Math.max.apply(null, allLines.map(tw).concat([0]))) + 32;
    var m = {l: 44, r: 16, t: 24, b: 42};   // 目盛りの数字の分
    var sx = r[1] - r[0], sy = r[3] - r[2];
    var s0 = Math.min((W - panelNatural - 24 - m.l - m.r) / sx, (H - m.t - m.b) / sy);
    var s = Math.max(4, Math.min(s0, (H - m.t - m.b) / sy));
    if (s0 < 30) s = Math.max(4, Math.min((W * 0.6 - m.l - m.r) / sx, (H - m.t - m.b) / sy));
    var pw = sx * s, ph = sy * s, ox = m.l, oy = Math.max(m.t, (H - m.b - ph) / 2 + m.t / 2);
    var panelX = ox + pw + m.r + 24, panelW = Math.max(1, W - panelX);
    if (s < 30 || panelW < 200) ctx.report("size", "[vector] element is " + W + " × " + H + " px; allow about " + Math.ceil(m.l + m.r + 30 * sx + 24 + panelNatural) + " × " + Math.ceil(m.t + m.b + 30 * sy) + " px for this range and the formulas (a unit of at least 30 px)");
    var X = function(x){ return ox + (x - r[0]) * s; }, Y = function(y){ return oy + (r[3] - y) * s; };
    this.geo = {X: X, Y: Y, s: s, ox: ox, oy: oy, pw: pw, ph: ph, fs: fs};
    this.setAttribute("role", "img");
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    if (!this._aria) this.setAttribute("aria-label", allLines.map(function(t){ return t.replace(/\*/g, "").replace(/_(\d)/g, "$1"); }).join("; "));
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var id = "vector-2-0-0-clip" + (++clipN), defs = D.el("defs", {}, svg), cp = D.el("clipPath", {id: id}, defs);
    D.el("rect", {x: ox, y: oy, width: pw, height: ph}, cp);
    var plane = D.el("g", {"clip-path": "url(#" + id + ")"}, svg);
    // 格子と軸
    var step = sx > 16 || sy > 16 ? 2 : 1, gx = [], gy = [];
    for (var x = Math.ceil(r[0] / step) * step; x <= r[1] + 1e-9; x += step) gx.push(x);
    for (var y = Math.ceil(r[2] / step) * step; y <= r[3] + 1e-9; y += step) gy.push(y);
    this.gridG = D.el("g", {}, plane);
    if (pl.show.indexOf("grid") >= 0){
      gx.forEach(function(x){ D.el("line", {x1: X(x), y1: Y(r[2]), x2: X(x), y2: Y(r[3]), stroke: "var(--line)", "stroke-width": x === 0 ? 0 : 1.5}, self.gridG); });
      gy.forEach(function(y){ D.el("line", {x1: X(r[0]), y1: Y(y), x2: X(r[1]), y2: Y(y), stroke: "var(--line)", "stroke-width": y === 0 ? 0 : 1.5}, self.gridG); });
    }
    if (r[0] <= 0 && r[1] >= 0) D.el("line", {x1: X(0), y1: Y(r[2]), x2: X(0), y2: Y(r[3]), stroke: "var(--muted)", "stroke-width": 2}, plane);
    if (r[2] <= 0 && r[3] >= 0) D.el("line", {x1: X(r[0]), y1: Y(0), x2: X(r[1]), y2: Y(0), stroke: "var(--muted)", "stroke-width": 2}, plane);
    D.el("rect", {x: ox, y: oy, width: pw, height: ph, fill: "none", stroke: "var(--line)", "stroke-width": 2}, svg);
    // 目盛りの数字（0 は書かない。混むときは 1 つおき）
    var every = Math.max(1, Math.ceil(36 / (s * step)));
    gx.forEach(function(x, i){ if (x !== 0 && i % every === 0) D.el("text", {x: X(x), y: oy + ph + tick + 2, "font-size": tick, "text-anchor": "middle", fill: "var(--muted)"}, svg).textContent = num(x); });
    gy.forEach(function(y, i){ if (y !== 0 && y !== r[2] && i % every === 0) D.el("text", {x: ox - 8, y: Y(y) + tick * 0.36, "font-size": tick, "text-anchor": "end", fill: "var(--muted)"}, svg).textContent = num(y); });
    // 変換する層（格子・単位正方形・固有ベクトルの向き）と、新しい基底の格子
    var mx = pl.steps.find(function(q){ return q.kind === "matrix"; }), bs = pl.steps.find(function(q){ return q.kind === "basis"; });
    var R = Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2]), Math.abs(r[3])) * 4 + 4;
    this.tGrid = []; this.eigenL = []; this.unit = null; this.bGrid = [];
    if (mx){
      var gT = this.tGridG = D.el("g", {opacity: 0}, plane);
      for (var i = -Math.ceil(R); i <= Math.ceil(R); i++){
        this.tGrid.push({p: [i, -R], q: [i, R], e: D.el("line", {stroke: "var(--accent2)", "stroke-width": i === 0 ? 3 : 1.5}, gT)});
        this.tGrid.push({p: [-R, i], q: [R, i], e: D.el("line", {stroke: "var(--accent2)", "stroke-width": i === 0 ? 3 : 1.5}, gT)});
      }
      if (pl.show.indexOf("unit") >= 0) this.unit = D.el("path", {fill: "var(--accent2)", "fill-opacity": 0.25, stroke: "var(--accent2)", "stroke-width": 2, opacity: 0}, plane);
      mx.ev.forEach(function(e){ self.eigenL.push(D.el("line", {x1: X(-R * e.u[0]), y1: Y(-R * e.u[1]), x2: X(R * e.u[0]), y2: Y(R * e.u[1]), stroke: "var(--emph)", "stroke-width": 2.5, "stroke-dasharray": "10 8", opacity: 0}, plane)); });
    }
    if (bs){
      var gB = this.bGridG = D.el("g", {opacity: 0}, plane), B = bs.B;
      for (var i2 = -Math.ceil(R); i2 <= Math.ceil(R); i2++){
        [[[i2, -R], [i2, R]], [[-R, i2], [R, i2]]].forEach(function(pq){
          var p = [pq[0][0] * B[0][0] + pq[0][1] * B[1][0], pq[0][0] * B[0][1] + pq[0][1] * B[1][1]], q = [pq[1][0] * B[0][0] + pq[1][1] * B[1][0], pq[1][0] * B[0][1] + pq[1][1] * B[1][1]];
          D.el("line", {x1: X(p[0]), y1: Y(p[1]), x2: X(q[0]), y2: Y(q[1]), stroke: "var(--accent2)", "stroke-width": i2 === 0 ? 3 : 1.5}, gB);
        });
      }
    }
    // 矢印（線と先の三角）。描くたびに座標を書く
    var arrowG = D.el("g", {}, svg);
    var all = this.allArrows = [], labs = this.allLabels = [];
    // marks for the geometry check (spec §8.4): each arrow is an edge (its line, not the head) between unnamed ends, and a name is a label of its arrow
    var mk = function(col, dash, wd, id){ var g = D.el("g", {opacity: 0, "data-part": "edge", "data-part-id": id, "data-part-from": "@" + id, "data-part-to": "@" + id}, arrowG); return all[all.length] = {g: g, line: D.el("line", Object.assign({"data-part-line": "", stroke: col, "stroke-width": wd || 4, "stroke-linecap": "round"}, dash ? {"stroke-dasharray": "10 8"} : {}), g), head: D.el("path", {fill: col}, g), col: col}; };
    this.arrows = {};
    Object.keys(pl.vec).forEach(function(k){ if (pl.vec[k].base) self.arrows[k] = mk("var(--term)", false, 0, "v-" + k); });
    this.labG = D.el("g", {}, svg);
    this.labels = {};
    // 添え字（_1・^2）のある名前は 32px 以上で組む：mtext の添え字は 24px より小さくしないので、本文が 24〜26px だと同じ大きさに見える
    var mkLab = function(t, id){ var g = D.el("g", {opacity: 0}, self.labG); D.mtext(g, 0, 0, t, {"data-part": "label", "data-part-id": id, "data-part-of": "edge", "font-size": /(^|[^\\])[_^]./.test(t) ? Math.max(fs, 32) : fs, "text-anchor": "middle", fill: "var(--fg)"}); labs.push(g); return g; };
    Object.keys(pl.vec).forEach(function(k){ if (pl.vec[k].base) self.labels[k] = mkLab(pl.vec[k].label, "v-" + k); });
    // ステップごとの補助と結果
    this.opG = pl.steps.map(function(st, si){
      var o = {}, sid = "step" + (si + 1);
      if (st.kind === "sum" || st.kind === "diff" || st.kind === "proj" || st.kind === "dot") o.help = mk("var(--muted)", true, 3, sid + "-help");
      if (st.kind === "proj" || st.kind === "dot"){ var b2 = pl.vec[st.b].v, nb = Math.hypot(b2[0], b2[1]) || 1, RR = 1000; o.lineB = D.el("line", {x1: X(-RR * b2[0] / nb), y1: Y(-RR * b2[1] / nb), x2: X(RR * b2[0] / nb), y2: Y(RR * b2[1] / nb), stroke: "var(--muted)", "stroke-width": 1.5, opacity: 0}, plane); }
      if (st.kind !== "vectors" && st.kind !== "matrix" && st.kind !== "basis" && st.kind !== "none"){ o.res = mk("var(--emph)", false, 5, sid); if (st.label) o.lab = mkLab(st.label, sid); }
      if (st.kind === "basis"){ o.b1 = mk("var(--accent2)", false, 5, sid + "-b1"); o.b2 = mk("var(--accent2)", false, 5, sid + "-b2"); o.l1 = mkLab(st.labels[0], sid + "-b1"); o.l2 = mkLab(st.labels[1], sid + "-b2"); }
      return o;
    });
    // 右の欄
    var lg = D.el("g", {}, svg), y0 = oy + fs, maxLines = Math.floor((H - y0 + fs) / row);
    if (allLines.length > maxLines) ctx.report("layout", "[vector] the formulas need " + allLines.length + " lines; the panel holds " + maxLines + " (fewer ops, or a taller element)");
    var n = 0;
    this.lineG = pl.steps.map(function(st){
      return st.lines.map(function(t){
        var g = D.el("g", {opacity: 0}, lg), yy = y0 + Math.min(n, maxLines - 1) * row; n++;
        var txt = t; if (tw(t) > panelW - 8){ ctx.report("layout", "[vector] the line \"" + t.replace(/\*/g, "").slice(0, 24) + "…\" is wider than the panel (" + Math.floor(panelW) + " px)"); }
        D.mtext(g, panelX, yy, txt, {"font-size": fs, fill: "var(--fg)"});
        return g;
      });
    });
  }
  // 矢印を p から q へ（e は 0〜1 の伸び）
  arrow(a, p, q, e){
    var G = this.geo, x0 = G.X(p[0]), y0 = G.Y(p[1]), x1 = G.X(p[0] + (q[0] - p[0]) * e), y1 = G.Y(p[1] + (q[1] - p[1]) * e), dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy);
    if (n < 1){ a.g.setAttribute("opacity", 0); return; }
    var ux = dx / n, uy = dy / n, h = Math.min(18, n * 0.6), w = h * 0.55, bx = x1 - ux * h, by = y1 - uy * h;
    a.line.setAttribute("x1", x0.toFixed(1)); a.line.setAttribute("y1", y0.toFixed(1)); a.line.setAttribute("x2", bx.toFixed(1)); a.line.setAttribute("y2", by.toFixed(1));
    a.head.setAttribute("d", "M" + x1.toFixed(1) + " " + y1.toFixed(1) + " L" + (bx - uy * w).toFixed(1) + " " + (by + ux * w).toFixed(1) + " L" + (bx + uy * w).toFixed(1) + " " + (by - ux * w).toFixed(1) + " Z");
    a.g.setAttribute("opacity", 1);
  }
  // 名前を矢印の先の少し先に
  place(g, p, q, op){
    var G = this.geo, dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy) || 1, off = G.fs * 0.9;
    var x = G.X(q[0]) + dx / n * off, y = G.Y(q[1]) - dy / n * off + G.fs * 0.35;
    g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")"); g.setAttribute("opacity", op);
  }
  render(k, t){
    if (!this.svg) return;
    var self = this, pl = this.plan(), G = this.geo, dur = this.props.dur, steps = pl.steps, ph = function(i){ return k > i + 1 ? 1 : k < i + 1 ? 0 : base.prog(t, 0, dur); };
    var mi = steps.findIndex(function(q){ return q.kind === "matrix"; }), bi = steps.findIndex(function(q){ return q.kind === "basis"; });
    var em = mi >= 0 ? ph(mi) : 0, M = mi >= 0 ? steps[mi].M : null;
    var A = M ? [[1 + (M[0][0] - 1) * em, M[0][1] * em], [M[1][0] * em, 1 + (M[1][1] - 1) * em]] : null;
    var tf = function(v){ return A ? mul(A, v) : v; };
    // ベクトル
    this.allArrows.forEach(function(a){ a.line.setAttribute("x1", 0); a.line.setAttribute("y1", 0); a.line.setAttribute("x2", 0); a.line.setAttribute("y2", 0); a.head.setAttribute("d", ""); a.head.setAttribute("opacity", 1); a.g.setAttribute("opacity", 0); });
    this.allLabels.forEach(function(g){ g.setAttribute("transform", "translate(0 0)"); g.setAttribute("opacity", 0); });
    var e0 = ph(0);
    Object.keys(this.arrows).forEach(function(id){
      var o = pl.vec[id], p = tf(o.from), q = tf([o.from[0] + o.v[0], o.from[1] + o.v[1]]);
      if (e0 <= 0){ self.arrows[id].g.setAttribute("opacity", 0); self.labels[id].setAttribute("opacity", 0); return; }
      self.arrows[id].g.setAttribute("opacity", 1); self.arrow(self.arrows[id], p, q, e0); self.place(self.labels[id], p, [p[0] + (q[0] - p[0]) * e0, p[1] + (q[1] - p[1]) * e0], e0.toFixed(3));
    });
    // 操作：補助は そのステップの間だけ（次のステップで消える）、結果は残す（行列の変換にも付いていく）
    steps.forEach(function(st, i){
      var o = self.opG[i], e = ph(i);
      var e1 = k > i + 1 ? 1 : k < i + 1 ? 0 : base.prog(t, 0, dur / 2), e2 = k > i + 1 ? 1 : k < i + 1 ? 0 : base.prog(t, dur / 2, dur / 2);
      var helpOn = k === i + 1;
      if (o.help) o.help.g.setAttribute("opacity", 0);
      if (o.lineB) o.lineB.setAttribute("opacity", 0);
      if (st.kind === "sum" || st.kind === "diff"){
        var a = pl.vec[st.a].v, b = pl.vec[st.b].v;
        if (helpOn){
          if (st.kind === "sum") self.arrow(o.help, tf([a[0] * e1, a[1] * e1]), tf([a[0] * e1 + b[0], a[1] * e1 + b[1]]), 1);   // b を a の先へ平行移動
          else self.arrow(o.help, tf(b), tf(a), e1);   // b の先から a の先へ
        }
        if (e2 > 0) self.arrow(o.res, [0, 0], tf(st.r), e2); else o.res.g.setAttribute("opacity", 0);
      } else if (st.kind === "scale"){
        var v = pl.vec[st.a].v;
        if (e > 0) self.arrow(o.res, [0, 0], tf([v[0] * (1 + (st.k - 1) * e), v[1] * (1 + (st.k - 1) * e)]), 1); else o.res.g.setAttribute("opacity", 0);
      } else if (st.kind === "proj" || st.kind === "dot"){
        var a2 = pl.vec[st.a].v;
        if (helpOn){
          o.lineB.setAttribute("opacity", 1);
          self.arrow(o.help, a2, st.r, e1); o.help.head.setAttribute("opacity", 0);
        }
        if (e2 > 0) self.arrow(o.res, [0, 0], tf(st.r), e2); else o.res.g.setAttribute("opacity", 0);
      } else if (st.kind === "basis"){
        var B = st.B;
        if (e > 0){ self.arrow(o.b1, [0, 0], B[0], e); self.arrow(o.b2, [0, 0], B[1], e); self.place(o.l1, [0, 0], [B[0][0] * e, B[0][1] * e], e.toFixed(3)); self.place(o.l2, [0, 0], [B[1][0] * e, B[1][1] * e], e.toFixed(3)); }
        else { o.b1.g.setAttribute("opacity", 0); o.b2.g.setAttribute("opacity", 0); o.l1.setAttribute("opacity", 0); o.l2.setAttribute("opacity", 0); }
      }
      if (o.lab){ if (o.res && o.res.g.getAttribute("opacity") !== "0" && (e2 > 0 || st.kind === "scale" && e > 0)) self.place(o.lab, [0, 0], tf(st.kind === "scale" ? [pl.vec[st.a].v[0] * (1 + (st.k - 1) * e), pl.vec[st.a].v[1] * (1 + (st.k - 1) * e)] : st.r), (st.kind === "scale" ? e : e2).toFixed(3)); else o.lab.setAttribute("opacity", 0); }
      // 右の欄：そのステップで出す
      self.lineG[i].forEach(function(g){ g.setAttribute("opacity", (k > i + 1 ? 1 : k < i + 1 ? 0 : base.prog(t, 0, dur / 2)).toFixed(3)); });
    });
    // 行列：格子・単位正方形・固有ベクトルの向き
    if (A){
      this.tGrid.forEach(function(L){ var p = mul(A, L.p), q = mul(A, L.q); L.e.setAttribute("x1", G.X(p[0]).toFixed(1)); L.e.setAttribute("y1", G.Y(p[1]).toFixed(1)); L.e.setAttribute("x2", G.X(q[0]).toFixed(1)); L.e.setAttribute("y2", G.Y(q[1]).toFixed(1)); });
      this.tGridG.setAttribute("opacity", k >= mi + 1 ? 1 : 0);
      this.gridG.setAttribute("opacity", k >= mi + 1 ? 0.35 : 1);
      if (this.unit){ var c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(function(v){ var w = mul(A, v); return G.X(w[0]).toFixed(1) + " " + G.Y(w[1]).toFixed(1); }); this.unit.setAttribute("d", "M" + c.join(" L") + " Z"); this.unit.setAttribute("opacity", k >= mi + 1 ? 1 : 0); }
      this.eigenL.forEach(function(l){ l.setAttribute("opacity", k >= mi + 1 ? 1 : 0); });
    }
    if (bi >= 0){ var eb = ph(bi); this.bGridG.setAttribute("opacity", eb.toFixed(3)); this.gridG.setAttribute("opacity", (1 - 0.65 * eb).toFixed(3)); }
  }
};
});
