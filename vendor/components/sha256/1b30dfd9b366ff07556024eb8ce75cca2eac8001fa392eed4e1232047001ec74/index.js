// m-particles：状態変化の粒子モデルと、化学変化で保存される原子のモデル。
egatariParts.define({name: "particles", version: "2.0.1", requires: {base: "1.2.0"}, element: "m-particles"}, function(deps){
"use strict";
var base = deps.base;
var STATES = ["solid", "liquid", "gas"];
var SHAPES = ["linear", "bent", "trigonal", "tetrahedral", "chain"];
var MOLECULE_SHAPES = {H2O: "bent", H2S: "bent", SO2: "bent", CO2: "linear", NH3: "trigonal", CH4: "tetrahedral"};
var TEXT = {
  ja: {states: ["固体", "液体", "気体"], changes: {solidliquid: "融解", liquidgas: "沸騰", liquidsolid: "凝固", gasliquid: "凝縮", solidgas: "昇華", gassolid: "昇華"}, before: "反応前", apart: "原子に分かれる", after: "反応後", atoms: "原子の数：", invalid: "データを確認してください"},
  en: {states: ["Solid", "Liquid", "Gas"], changes: {solidliquid: "melting", liquidgas: "boiling", liquidsolid: "freezing", gasliquid: "condensation", solidgas: "sublimation", gassolid: "sublimation"}, before: "Reactants", apart: "Separate atoms", after: "Products", atoms: "Atoms: ", invalid: "Check the data"}
};
var COLORS = ["series-1", "series-2", "series-3", "series-4", "term", "accent2"];
// 全体が読めたときだけ採用する。括弧・電荷・係数・0・不正な桁を黙って落とさない。
function parseFormula(s){
  if (typeof s !== "string" || !/^(?:[A-Z][a-z]?(?:[1-9][0-9]*)?)+$/.test(s)) throw new Error("formula " + JSON.stringify(s) + ": use element symbols and positive integer counts (no parentheses or charges)");
  var out = [], counts = Object.create(null), re = /([A-Z][a-z]?)([1-9][0-9]*)?/g, m;
  while ((m = re.exec(s))){
    var n = m[2] ? +m[2] : 1;
    if (!Number.isSafeInteger(n) || n > 24 || out.length + n > 24) throw new Error("formula " + s + ": more than 24 atoms");
    counts[m[1]] = (counts[m[1]] || 0) + n;
    for (var i = 0; i < n; i++) out.push(m[1]);
  }
  return {atoms: out, counts: counts};
}
function formulaText(s){ return s.replace(/([0-9])/g, "_$1"); }
function unicodeFormula(s){ return s.replace(/[0-9]/g, function(n){ return "₀₁₂₃₄₅₆₇₈₉"[+n]; }); }
function equation(side, format){ return side.map(function(m){ return (m.n === 1 ? "" : m.n) + format(m.formula); }).join(" + "); }
function hash(i){
  var n = Math.imul(i + 1, 2654435761); n ^= n >>> 16;
  n = Math.imul(n, 2246822507); n ^= n >>> 13; n = Math.imul(n, 3266489909); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
// 正方形に近い因数の組を選ぶ。素数や容器に収まる組がない場合は最終行を中央に置く。
function latticeColumns(n, aspect, maxCols){
  var ideal = Math.sqrt(n * aspect), best = 0, error = Infinity;
  for (var c = Math.ceil(Math.sqrt(n)); c <= Math.min(maxCols || n, n > 3 ? n / 2 : n); c++) if (n % c === 0){
    var d = Math.abs(c - ideal); if (d < error){ best = c; error = d; }
  }
  return best || Math.min(maxCols || n, Math.ceil(ideal));
}
function segmentDistance(p, a, b){
  var dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
  var u = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
}
function set(e, a, v){ v = String(v); if (e.getAttribute(a) !== v) e.setAttribute(a, v); }
function text(e, s){ if (e.textContent !== s) e.textContent = s; }
var Part = class extends base.MotionElement {
  static partName = "particles";
  // 先の並び方・生成物を授業で予想させる（orbit と同じ扱い）。
  static preview = "none";
  static steps = 2;
  static shape = {
    schema: {type: "object", additionalProperties: false, properties: {
      states: {type: "array", minItems: 1, items: {type: "string", enum: STATES}},
      substance: {type: "string"},
      labels: {type: ["array", "object"], items: {type: ["string", "null"]}, properties: {before: {type: "string"}, apart: {type: "string"}, after: {type: "string"}, atoms: {type: "string"}}, additionalProperties: false},
      reactants: {type: "array", minItems: 1, maxItems: 24, items: {type: "object", required: ["formula", "n"], additionalProperties: false, properties: {formula: {type: "string"}, n: {type: "integer"}, shape: {type: "string", enum: SHAPES}}}},
      products: {type: "array", minItems: 1, maxItems: 24, items: {type: "object", required: ["formula", "n"], additionalProperties: false, properties: {formula: {type: "string"}, n: {type: "integer"}, shape: {type: "string", enum: SHAPES}}}}
    }},
    example: {states: ["solid", "liquid", "gas"], substance: "水"}
  };
  static props = {
    mode: {type: "string", default: "state", doc: "state（状態変化）か reaction（化学変化）"},
    count: {type: "number", default: 16, doc: "状態変化で描く粒子の数（6〜30 の整数。数と大きさは一定）"},
    size: {type: "number", default: 28, doc: "名前・式の字の大きさ（px。24 以上）"},
    dur: {type: "number", default: 1.2, doc: "1 ステップの動きの秒数"},
    volume: {type: "bool", default: false, doc: "状態に合わせて容器の幅を変える（気体は広い）"},
    motion: {type: "bool", default: true, doc: "状態変化の粒子に静止した運動の印を付ける"}
  };
  get data(){
    var d = super.data;
    // JSON がない場合だけ既定値。JSON の null や不正な型は base の shape 検査へ渡す。
    var hasJSON = [].some.call(this.children, function(c){ return c.localName === "script" && String(c.getAttribute("type") || "").trim().toLowerCase() === "application/json"; });
    return d === null && !hasJSON ? {} : d;
  }
  get steps(){ return this.plan().reaction ? 3 : this.plan().states.length - 1; }
  duration(k){ return k >= 1 && k <= this.steps ? (Number.isFinite(this.props.dur) && this.props.dur > 0 ? this.props.dur : 1.2) : 0; }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, p = {reaction: this.props.mode === "reaction", states: d.states || STATES, notes: [], fatal: false};
    if (!p.reaction){
      if (d.reactants || d.products || (d.labels && !Array.isArray(d.labels))){ p.notes.push("state mode takes states and a labels array"); p.fatal = true; }
      return (this._plan = p);
    }
    p.elements = []; p.sides = []; p.totals = [];
    try {
      if (!d.reactants || !d.products || Array.isArray(d.labels) || d.states || d.substance) throw new Error("reaction mode needs reactants, products and optional labels object");
      [d.reactants, d.products].forEach(function(side){
        var molecules = [], total = Object.create(null), N = 0;
        side.forEach(function(m){
          if (!Number.isSafeInteger(m.n) || m.n < 1 || m.n > 24) throw new Error("coefficient n must be an integer from 1 to 24");
          var f = parseFormula(m.formula);
          N += f.atoms.length * m.n;
          if (N > 24) throw new Error("more than 24 atoms on one side (maximum conserved inventory: 24)");
          Object.keys(f.counts).forEach(function(e){
            if (p.elements.indexOf(e) < 0) p.elements.push(e);
            total[e] = (total[e] || 0) + f.counts[e] * m.n;
          });
          for (var j = 0; j < m.n; j++) molecules.push({atoms: f.atoms.slice(), shape: m.shape || MOLECULE_SHAPES[m.formula] || (f.atoms.length <= 3 ? "linear" : "chain")});
        });
        p.sides.push(molecules); p.totals.push(total);
      });
      if (p.elements.length > 6) throw new Error("more than 6 elements");
      p.balanced = p.elements.every(function(e){ return (p.totals[0][e] || 0) === (p.totals[1][e] || 0); });
      p.counts = p.elements.map(function(e){ return e + " " + (p.totals[0][e] || 0) + " → " + (p.totals[1][e] || 0); });
      if (!p.balanced) p.notes.push("unbalanced equation: " + p.counts.join(", ") + "; static comparison only");
      p.eq = equation(d.reactants, formulaText) + " → " + equation(d.products, formulaText);
      p.accessible = equation(d.reactants, unicodeFormula) + " → " + equation(d.products, unicodeFormula);
    } catch (e){ p.notes.push(e.message); p.fatal = true; }
    return (this._plan = p);
  }
  mount(ctx){
    var P = this.props, p = this.plan(), self = this;
    p.notes.forEach(function(m){ ctx.report("data", "[particles] " + m); });
    if (["state", "reaction"].indexOf(P.mode) < 0) ctx.report("attr", "[particles] unknown mode; using state");
    [["count", 16, function(v){ return Number.isInteger(v) && v >= 6 && v <= 30; }], ["size", 28, function(v){ return Number.isFinite(v) && v >= 24; }], ["dur", 1.2, function(v){ return Number.isFinite(v) && v > 0; }]].forEach(function(a){
      if (!a[2](P[a[0]])){ ctx.report("attr", "[particles] invalid " + a[0] + "; using " + a[1]); P[a[0]] = a[1]; }
    });
    var lang = this.closest("[lang]");
    this.T = /^ja\b/i.test((lang && lang.getAttribute("lang")) || ctx.lang || "") ? TEXT.ja : TEXT.en;
    this.words = Object.assign({}, this.T, p.reaction ? (this.data || {}).labels : {});
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.W = this.clientWidth; this.H = this.clientHeight;
    this.svg = base.el("svg", {viewBox: "0 0 " + this.W + " " + this.H, width: this.W, height: this.H, "aria-hidden": "true", style: "display:block"}, this);
    this.setAttribute("role", "img");
    if (p.fatal){ this.label(this.svg, this.W / 2, this.H / 2, this.T.invalid); if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.T.invalid); return; }
    if (p.reaction) this.drawReaction(ctx); else this.drawState(ctx);
    if (!this.getAttribute("aria-label")){
      var ja = this.T === TEXT.ja;
      var name = p.reaction ? p.accessible + ". " + this.words.atoms + p.counts.join(ja ? "、" : ", ") :
        ((this.data || {}).substance ? this.data.substance + (ja ? "の" : " ") : "") + (ja ? "粒子のモデル：" : "particle model: ") + p.states.map(function(s, i){ return self.stateLabel(i); }).join("→") +
        (ja ? "。粒子の数（" + P.count + "）と大きさは変わらず、間隔と動きが変わる" : ". Particle count (" + P.count + ") and size stay constant; spacing and motion change.");
      this.setAttribute("aria-label", name);
    }
  }
  label(g, x, y, s, fs, anchor, tone){
    return base.mtext(g, x, y, s, {"font-size": fs || this.props.size, "text-anchor": anchor || "middle", fill: "var(--" + (tone || "fg") + ")"});
  }
  checkWidth(s, fs, width, ctx){ if (base.textWidth(s, fs, {font: this, mark: true}) > width) ctx.report("size", "[particles] a label does not fit; shorten it or make the element larger"); }
  stateLabel(i){ var d = this.data || {}, v = (d.labels || [])[i]; return v === undefined || v === null ? this.T.states[STATES.indexOf(this.plan().states[i])] : v; }
  stateBox(s){
    var full = Math.min(this.W - 40, 700), w = full;
    if (this.props.volume && s !== "gas"){
      var layerWidth = 54;
      for (var i = 1; i < Math.ceil((this.props.count + 1) / 2); i++) layerWidth += 38.2 + 3 * hash(i + 71);
      w = Math.min(full, Math.max(full * 0.72, layerWidth));
    }
    var h = Math.min(this.H - 108, Math.max(240, Math.ceil(this.props.count / 6) * 50 + 40));
    return {x: (this.W - w) / 2, y: 44, width: w, height: h};
  }
  boxWidth(s){ return this.stateBox(s).width; }
  arrangement(s){
    var N = this.props.count, r = 19, box = this.stateBox(s), floor = box.y + box.height - r - 1.5, out = [], i;
    if (s === "gas"){
      // 最良候補法。格子からずらすのでなく、既存の点から最も離れた候補を採る。
      var margin = r + 30;
      for (i = 0; i < N; i++){
        var best = null, score = -1;
        for (var j = 0; j < 768; j++){
          var seed = i * 1536 + j * 2 + 503;
          var q = {x: box.x + margin + hash(seed) * (box.width - 2 * margin), y: box.y + margin + hash(seed + 1) * (box.height - 2 * margin)};
          var d = out.length ? Math.min.apply(null, out.map(function(a){ return Math.hypot(q.x - a.x, q.y - a.y); })) : 1;
          if (d > score){ score = d; best = q; }
          if (!i) break;
        }
        out.push(best);
      }
    } else if (s === "solid"){
      var pitch = 2 * r + 3, cols = latticeColumns(N, 1, Math.floor((box.width - 2 * r - 8) / pitch) + 1);
      for (i = 0; i < N;){
        var row = Math.floor(i / cols), n = Math.min(cols, N - i);
        for (var c = 0; c < n; c++, i++) out.push({x: this.W / 2 + (c - (n - 1) / 2) * pitch, y: floor - row * pitch});
      }
    } else {
      // 床の列から積む。上の粒子は下の隣接する 2 粒子に接し、全ての中心間距離は 2r 以上。
      var contact = 2 * r + 0.2;
      var cols = Math.ceil((N + 1) / 2);
      var row = [], x = 0;
      for (i = 0; i < Math.min(cols, N); i++){
        if (i){
          var nextX = x + contact + 3 * hash(i + 71);
          if (nextX + 2 * r + 16 > box.width + 1e-6) break;
          x = nextX;
        }
        row.push({x: x, y: floor});
      }
      var offset = this.W / 2 - x / 2;
      row.forEach(function(q){ q.x += offset; out.push(q); });
      while (out.length < N && row.length > 1){
        var next = [];
        for (i = 0; i < row.length - 1; i++){
          var a = row[i], b = row[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          var lift = Math.sqrt(Math.max(0, contact * contact - d * d / 4));
          next.push({x: (a.x + b.x) / 2 + dy / d * lift, y: (a.y + b.y) / 2 - dx / d * lift});
        }
        var need = Math.min(next.length, N - out.length), start = Math.floor((next.length - need) / 2);
        row = next.slice(start, start + need); row.forEach(function(q){ out.push(q); });
      }
    }
    return out;
  }
  separateParticles(points, box){
    // 補間の途中も円を重ねない。毎フレーム同じ入力から解き、前の render に依存しない。
    for (var it = 0; it < 240; it++){
      var moved = false;
      for (var i = 0; i < points.length; i++) for (var j = i + 1; j < points.length; j++){
        var a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 38) continue;
        var angle = hash(i * 31 + j) * 2 * Math.PI, ux = d > 1e-8 ? dx / d : Math.cos(angle), uy = d > 1e-8 ? dy / d : Math.sin(angle), shift = (38.02 - d) / 2;
        a.x -= ux * shift; a.y -= uy * shift; b.x += ux * shift; b.y += uy * shift; moved = true;
      }
      points.forEach(function(q){ q.x = Math.max(box.x + 20.5, Math.min(box.x + box.width - 20.5, q.x)); q.y = Math.max(box.y + 20.5, Math.min(box.y + box.height - 20.5, q.y)); });
      if (!moved) break;
    }
    return points;
  }
  transitionLabel(k){
    if (!k) return this.stateLabel(0);
    var p = this.plan(), change = this.T.changes[p.states[k - 1] + p.states[k]], ja = this.T === TEXT.ja;
    return this.stateLabel(k - 1) + " → " + this.stateLabel(k) + (change ? (ja ? "（" : " (") + change + (ja ? "）" : ")") : "");
  }
  // 矢印の軸・矢じりの全てが、容器の中かつ他の粒子の外にある向きを選ぶ。
  motionArrow(points, i, length, box){
    var r = 19, p = points[i], best = null, score = -Infinity;
    for (var n = 0; n < 72; n++){
      var angle = (hash(i + 101) * 360 + n * 5) * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
      var tip = r + 1.5 + length, local = [[r + 1.5, 0], [tip, 0], [tip - 3, -1.5], [tip - 3, 1.5]];
      var q = local.map(function(v){ return {x: p.x + co * v[0] - si * v[1], y: p.y + si * v[0] + co * v[1]}; });
      if (!q.every(function(v){ return v.x >= box.x + 2 && v.x <= box.x + box.width - 2 && v.y >= box.y + 2 && v.y <= box.y + box.height - 2; })) continue;
      var segments = [[q[0], q[1]], [q[1], q[2]], [q[1], q[3]]], clearance = Infinity;
      points.forEach(function(a, j){ if (j !== i) segments.forEach(function(seg){ clearance = Math.min(clearance, segmentDistance(a, seg[0], seg[1]) - r); }); });
      if (clearance >= 1.2 && clearance > score){ score = clearance; best = {angle: angle * 180 / Math.PI, segments: segments, path: "M" + (r + 1.5) + ",0H" + tip + "m-3,-1.5L" + tip + ",0l-3,1.5"}; }
    }
    return best;
  }
  drawState(ctx){
    var p = this.plan(), self = this, N = this.props.count;
    this.particleRadius = 19; this.arrangements = {};
    STATES.forEach(function(s){ self.arrangements[s] = self.arrangement(s); });
    var fits = STATES.every(function(s){
      var box = self.stateBox(s), points = self.arrangements[s];
      return points.length === N && points.every(function(q, i){
        return q.x - 19 >= box.x && q.x + 19 <= box.x + box.width && q.y - 19 >= box.y && q.y + 19 <= box.y + box.height &&
          points.every(function(a, j){ return i === j || Math.hypot(q.x - a.x, q.y - a.y) >= (s === "gas" ? 2.6 * 19 : 38) - 1e-6; });
      });
    });
    if (!fits) ctx.report("size", "[particles] particle model needs a larger box");
    this.label(this.svg, this.W / 2, 29, (this.data || {}).substance || "");
    this.box = base.el("rect", {rx: 16, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, this.svg);
    this.particles = []; this.marks = [];
    for (var i = 0; i < N; i++){
      var g = base.el("g", {"data-particle": i}, this.svg);
      base.el("circle", {r: 19, fill: "var(--term)"}, g);
      this.marks.push(base.el("path", {fill: "none", stroke: "var(--fg)", "stroke-width": 1.5}, g));
      this.particles.push(g);
    }
    this.stateName = this.label(this.svg, this.W / 2, this.stateBox("gas").y + this.stateBox("gas").height + 42, "");
    for (var k = 0; k <= this.steps; k++) self.checkWidth(this.transitionLabel(k), this.props.size, this.W - 16, ctx);
    this.checkWidth((this.data || {}).substance || "", this.props.size, this.W - 16, ctx);
  }
  // 中心原子と周囲の原子を平面に置く。未知の 3 原子分子は直線にする。
  molecule(atoms, r, shape){
    shape = shape || (atoms.length <= 3 ? "linear" : "chain");
    var order = atoms.map(function(_, i){ return i; }), counts = {};
    atoms.forEach(function(e){ counts[e] = (counts[e] || 0) + 1; });
    var radial = (shape === "bent" && atoms.length === 3) || (shape === "trigonal" && atoms.length === 4) || (shape === "tetrahedral" && atoms.length === 5);
    if (radial || (shape === "linear" && atoms.length === 3)){
      var center = atoms.findIndex(function(e){ return counts[e] === 1; });
      if (center >= 0){ order.splice(order.indexOf(center), 1); order.unshift(center); }
    }
    var cols = shape === "linear" ? atoms.length : Math.min(6, atoms.length), out = [];
    order.forEach(function(j, i){
      if (radial){
        var angle = shape === "bent" ? (i === 1 ? 5 : 1) * Math.PI / 6 : -Math.PI / 2 + (i - 1) * 2 * Math.PI / (atoms.length - 1);
        out[j] = i ? [2 * r * Math.cos(angle), 2 * r * Math.sin(angle)] : [0, 0];
      } else if (shape === "linear" && atoms.length === 3){
        out[j] = [[0, 0], [-2 * r, 0], [2 * r, 0]][i];
      } else out[j] = [(i % cols) * r * 2, Math.floor(i / cols) * r * 2];
    });
    var minX = Math.min.apply(null, out.map(function(a){ return a[0]; })), minY = Math.min.apply(null, out.map(function(a){ return a[1]; }));
    return out.map(function(a){ return {x: a[0] - minX + r, y: a[1] - minY + r}; });
  }
  moleculeLayout(side, width, r){
    var self = this, slots = [], rows = [], row = [], rowW = 0, rowH = 0;
    function flush(){ if (row.length) rows.push({molecules: row, width: rowW, height: rowH}); row = []; rowW = rowH = 0; }
    side.forEach(function(m){
      var atoms = m.atoms, pts = self.molecule(atoms, r, m.shape), w = Math.max.apply(null, pts.map(function(q){ return q.x; })) + r, h = Math.max.apply(null, pts.map(function(q){ return q.y; })) + r;
      if (row.length && rowW + 24 + w > width) flush();
      row.push({atoms: atoms, points: pts, width: w, height: h}); rowW += (row.length > 1 ? 24 : 0) + w; rowH = Math.max(rowH, h);
    });
    flush();
    var y = 0, maxW = 0;
    rows.forEach(function(row){
      var x = (width - row.width) / 2; maxW = Math.max(maxW, row.width);
      row.molecules.forEach(function(m){
        m.points.forEach(function(q, i){ slots.push({e: m.atoms[i], x: x + q.x, y: y + (row.height - m.height) / 2 + q.y}); });
        x += m.width + 24;
      });
      y += row.height + 22;
    });
    return {slots: slots, width: maxW, height: y - 22};
  }
  separatedLayout(n, r){
    var cols = Math.min(n, latticeColumns(n, 2.5, Math.max(1, Math.floor((this.W - 24 - 2 * r) / (3 * r + 8)) + 1))), rows = Math.ceil(n / cols), pitch = 3 * r + 8, points = [];
    for (var i = 0; i < n;){
      var row = Math.floor(i / cols), count = Math.min(cols, n - i);
      for (var j = 0; j < count; j++, i++) points.push({x: (j - (count - 1) / 2) * pitch, y: row * pitch + r});
    }
    return {points: points, width: (cols - 1) * pitch + 2 * r, height: (rows - 1) * pitch + 2 * r};
  }
  atom(g, a, id){
    var p = this.plan(), tone = COLORS[p.elements.indexOf(a.e)], group = base.el("g", id === null ? {} : {"data-atom": id, "data-element": a.e}, g);
    base.el("circle", {r: this.radius, fill: "none", stroke: "var(--" + tone + ")", "stroke-width": 3}, group);
    this.label(group, 0, 8, a.e, 24, "middle", tone);
    set(group, "transform", "translate(" + a.x + " " + a.y + ")");
    return group;
  }
  drawReaction(ctx){
    var p = this.plan(), self = this, W = this.W, gutter = 112, maxSide = (W - 24 - gutter) / 2, L;
    // 全段階で同じ半径。大きいデータだけ少し小さくし、分離時にも一半径以上の隙間を確保する。
    for (var r = 34; r >= 24; r--){
      var source = this.moleculeLayout(p.sides[0], maxSide, r), target = this.moleculeLayout(p.sides[1], maxSide, r), free = this.separatedLayout(source.slots.length, r);
      var pictureH = Math.max(source.height, target.height), height = Math.max(44 + pictureH + 94, 44 + free.height);
      L = {radius: r, source: source, target: target, free: free, pictureH: pictureH, height: height};
      if (height <= this.H - 8 && source.width <= maxSide && target.width <= maxSide && free.width <= W - 24) break;
    }
    if (L.height > this.H - 8 || L.source.width > maxSide || L.target.width > maxSide || L.free.width > W - 24) ctx.report("size", "[particles] molecules need a larger element");
    this.radius = L.radius;
    var sideW = Math.max(L.source.width, L.target.width, base.textWidth(this.words.before, 24, {font: this}), base.textWidth(this.words.after, 24, {font: this}), 160);
    if (sideW > maxSide) ctx.report("size", "[particles] group captions need a wider element");
    var left = (W - 2 * sideW - gutter) / 2, top = (this.H - L.height) / 2, captionY = top + 24, pictureTop = top + 44;
    source = this.moleculeLayout(p.sides[0], sideW, L.radius); target = this.moleculeLayout(p.sides[1], sideW, L.radius);
    function place(layout, x){ return layout.slots.map(function(q){ return {e: q.e, x: q.x + x, y: q.y + pictureTop + (L.pictureH - layout.height) / 2}; }); }
    this.source = place(source, left); this.target = place(target, left + sideW + gutter);
    this.separated = L.free.points.map(function(q){ return {x: W / 2 + q.x, y: pictureTop + q.y}; });
    this.reactionLayout = {captionY: captionY, pictureTop: pictureTop, pictureBottom: pictureTop + L.pictureH, arrowY: pictureTop + L.pictureH / 2};
    this.beforeName = this.label(this.svg, left + sideW / 2, captionY, this.words.before, 24);
    this.afterName = this.label(this.svg, left + sideW * 1.5 + gutter, captionY, this.words.after, 24);
    this.stageName = this.label(this.svg, W / 2, captionY, "", 24);
    this.arrow = base.el("path", {d: "M" + (W / 2 - 32) + "," + this.reactionLayout.arrowY + "h64m-12,-8l12,8l-12,8", fill: "none", stroke: "var(--muted)", "stroke-width": 3}, this.svg);
    this.reference = base.el("g", {"data-reference": "reactants"}, this.svg);
    this.source.forEach(function(a){ self.atom(self.reference, a, null); });
    this.live = base.el("g", {}, this.svg);
    this.atoms = this.source.map(function(a, i){ return self.atom(self.live, a, i); });
    var queues = Object.create(null);
    this.source.forEach(function(a, i){ (queues[a.e] || (queues[a.e] = [])).push(i); });
    this.destinations = this.source.map(function(a){ return a; });
    if (p.balanced) this.target.forEach(function(a){ self.destinations[queues[a.e].shift()] = a; });
    this.productReference = base.el("g", {"data-reference": "products"}, this.svg);
    if (!p.balanced) this.target.forEach(function(a){ self.atom(self.productReference, a, null); });
    this.summary = base.el("g", {}, this.svg);
    this.equationName = this.label(this.summary, W / 2, this.reactionLayout.pictureBottom + 42, p.eq);
    this.checkWidth(p.eq, this.props.size, W - 24, ctx);
    var sep = this.T === TEXT.ja ? "、" : ", ", countText = this.words.atoms + p.counts.join(sep);
    this.countsLine = base.el("text", {x: W / 2, y: this.reactionLayout.pictureBottom + 86, "font-size": 24, "text-anchor": "middle", fill: "var(--fg)"}, this.summary);
    base.el("tspan", {}, this.countsLine).textContent = this.words.atoms;
    p.elements.forEach(function(e, i){
      base.el("tspan", {fill: "var(--" + ((p.totals[0][e] || 0) === (p.totals[1][e] || 0) ? "fg" : "emph") + ")"}, self.countsLine).textContent = (i ? sep : "") + p.counts[i];
    });
    this.checkWidth(countText, 24, W - 24, ctx);
    [this.words.before, this.words.after].forEach(function(s){ self.checkWidth(s, 24, sideW, ctx); });
    this.checkWidth(this.words.apart, 24, W - 24, ctx);
  }
  render(k, t){
    var p = this.plan(); if (!this.svg || p.fatal) return;
    k = Math.max(0, Math.min(this.steps, k));
    var e = k ? base.prog(t, 0, this.duration(k)) : 0, self = this;
    if (!p.reaction){
      var a = Math.max(0, k - 1), b = k, from = p.states[a], to = p.states[b], A = this.arrangements[from], B = this.arrangements[to];
      var boxA = this.stateBox(from), boxB = this.stateBox(to), box = {};
      ["x", "y", "width", "height"].forEach(function(key){ box[key] = base.lerp(boxA[key], boxB[key], e); set(self.box, key, box[key]); });
      var points = this.currentParticles = this.separateParticles(A.map(function(q, i){ return {x: base.lerp(q.x, B[i].x, e), y: base.lerp(q.y, B[i].y, e)}; }), box);
      this.motionPaths = [];
      this.particles.forEach(function(g, i){
        set(g, "transform", "translate(" + points[i].x.toFixed(3) + " " + points[i].y.toFixed(3) + ")");
        var state = e < 0.5 ? from : to, solid = state === "solid", mark = null;
        // 密に接した内部の粒子では、短縮せず空きのある粒子だけに矢印を描く。
        if (self.props.motion && !solid) mark = self.motionArrow(points, i, state === "gas" ? 24 : 18, box);
        self.motionPaths.push(mark);
        set(self.marks[i], "transform", mark ? "rotate(" + mark.angle.toFixed(3) + ")" : "");
        set(self.marks[i], "d", !self.props.motion ? "" : solid ? "M14,-19q4,2 5,5M-14,19q-4,-2 -5,-5" : mark ? mark.path : "");
      });
      text(this.stateName, this.transitionLabel(k));
      return;
    }
    var final = k === 3 ? e : 0, visible = k === 0 ? 0 : k === 1 ? e : 1;
    set(this.summary, "opacity", p.balanced ? final : visible);
    set(this.live, "opacity", visible); set(this.arrow, "opacity", k >= 3 || !p.balanced ? 1 : 0);
    set(this.reference, "opacity", p.balanced ? final : 0);
    set(this.productReference, "opacity", p.balanced ? 0 : visible);
    set(this.afterName, "opacity", p.balanced ? final : visible);
    set(this.beforeName, "opacity", k === 3 || !p.balanced ? 1 : 0);
    text(this.stageName, k === 3 || !p.balanced ? "" : k === 2 ? this.words.apart : this.words.before);
    this.atoms.forEach(function(g, i){
      var a = self.source[i], b = self.destinations[i], free = self.separated[i];
      var from = k === 3 ? free : a, to = k >= 2 ? (k === 3 ? b : free) : a, q = k >= 2 ? e : 0;
      if (!p.balanced){ from = to = a; q = 0; }
      set(g, "transform", "translate(" + base.lerp(from.x, to.x, q).toFixed(3) + " " + base.lerp(from.y, to.y, q).toFixed(3) + ")");
    });
  }
};
return Part;
});
