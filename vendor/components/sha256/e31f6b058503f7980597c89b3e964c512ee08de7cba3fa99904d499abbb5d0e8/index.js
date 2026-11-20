// m-nnet：ニューラルネットの図。層ごとのニューロンの数から列を並べ（座標は書かない）、入力の値から層ごとに前向きの計算を進める。
// ニューロンは 2 通り：まとめた丸（ふつうの図）と、丸を Σ（重み付きの和 z = w·x + b）と f（活性化 a = f(z)）に分けた形（教える用）。
// <m-nnet style="height:520px"><script type="application/json">
//   {"layers": [{"n": 2, "label": "入力層", "names": ["*x*_1", "*x*_2"]}, {"n": 1, "label": "出力層", "act": "step", "form": "split"}],
//    "weights": [[[1, 1]]], "biases": [[-1.5]], "values": {"x": [1, 1], "z": [[0.5]], "a": [[1]]}}
// （JSON の終わり）</m-nnet>
// 値は計算を走らせたスクリプトの出力（重み・バイアス・z・a）。パーツは計算をし直して確かめるだけ（z = W·a_前 + b、a = f(z)。合わなければ data）。
// 活性化関数の曲線は描かない（m-curves で描く）。分けた形の f の側には関数の名前（ReLU、σ など）を出す。
// ステップ（steps を書かないとき）：1 入力の値、続いて層ごとに、まとめた層は 1 ステップ（a が出る）、分けた層は 2 ステップ（z、次に a）。
// steps を書くとき：{"show": "x"}、{"layer": l, "phase": "z" | "a"}、{"open": l}（まとめた丸を Σ|f に開く）、{"focus": [l, i]}（ニューロン i に入る辺と重み）。
// "phase": "delta" と "grad"（誤差逆伝播）は予約。今は data で知らせて飛ばす。
// 色：正の重み --term（実線）、負の重み --emph（点線）。今計算している層に入る辺を濃くする。値の出たニューロンは --accent2 の縁。
egatariParts.define({name: "nnet", version: "2.1.0", requires: {base: "1.3.0"}, element: "m-nnet"}, function(deps){
"use strict";
var base = deps.base;
var NUM = {type: "number"}, VEC = {type: "array", items: NUM}, MAT = {type: "array", items: VEC};
var ACT = {
  identity: {ja: "恒等", en: "identity", f: function(z){ return z; }},
  step:     {ja: "ステップ", en: "step", f: function(z){ return z >= 0 ? 1 : 0; }},
  relu:     {ja: "ReLU", en: "ReLU", f: function(z){ return Math.max(0, z); }},
  sigmoid:  {ja: "σ", en: "σ", f: function(z){ return 1 / (1 + Math.exp(-z)); }},
  tanh:     {ja: "tanh", en: "tanh", f: function(z){ return Math.tanh(z); }},
  softmax:  {ja: "softmax", en: "softmax", f: null},
};
function dec(v){ var s = String(v).split(".")[1]; return s ? s.length : 0; }
return class extends base.MotionElement {
  static partName = "nnet";
  static preview = "none";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["layers"], properties: {
      layers: {type: "array", minItems: 2, maxItems: 6, items: {type: "object", additionalProperties: false, required: ["n"], properties: {
        n: {type: "integer"}, label: {type: "string"}, names: {type: "array", items: {type: "string"}},
        act: {type: "string", enum: ["identity", "step", "relu", "sigmoid", "tanh", "softmax"]}, form: {type: "string", enum: ["combined", "split"]}}}},
      weights: {type: "array", items: MAT},
      biases: {type: "array", items: VEC},
      values: {type: "object", additionalProperties: false, properties: {x: VEC, z: MAT, a: MAT}},
      steps: {type: "array", maxItems: 40, items: {type: "object", additionalProperties: false, properties: {
        show: {type: "string", enum: ["x"]}, layer: {type: "integer"}, phase: {type: "string", enum: ["z", "a", "delta", "grad"]},
        open: {type: "integer"}, focus: {type: "array", minItems: 2, maxItems: 2, items: {type: "integer"}}, note: {type: "string"}}}}}},
    example: {layers: [{n: 2, label: "入力層"}, {n: 1, label: "出力層", act: "step", form: "split"}],
      weights: [[[1, 1]]], biases: [[-1.5]], values: {x: [1, 1], z: [[0.5]], a: [[1]]}},
  };
  static props = {
    dur:    {type: "number", default: 0.8, doc: "1 ステップの秒数"},
    digits: {type: "number", default: 2, doc: "値の小数の桁"},
    edges:  {type: "string", default: "plain", doc: "辺の描き方：plain（細い線）か weight（重みの大きさで太さ、符号で実線と点線）"},
    size:   {type: "number", default: 24, doc: "字の大きさ（px、24 以上）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().states.length - 1;
  }
  // ステップごとの状態（データだけから決まる）と確かめた結果
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, L = d.layers || [], bad = [], V = d.values || {};
    var nL = L.length;
    // 形の確かめ：重み W[l] は n(l+1) 行 × n(l) 列、バイアス b[l] は n(l+1)、z[l]・a[l] は n(l+1)、x は n(0)
    var dims = function(m, r, c){ return Array.isArray(m) && m.length === r && m.every(function(row){ return !c || row.length === c; }); };
    if (d.weights && (d.weights.length !== nL - 1 || d.weights.some(function(W, l){ return !dims(W, L[l + 1].n, L[l].n); }))) bad.push("weights must be " + (nL - 1) + " matrices, n(next) rows × n(previous) columns");
    if (d.biases && (d.biases.length !== nL - 1 || d.biases.some(function(b, l){ return b.length !== L[l + 1].n; }))) bad.push("biases must be " + (nL - 1) + " vectors of n(next)");
    if (V.x && V.x.length !== (L[0] || {}).n) bad.push("values.x must have " + (L[0] || {}).n + " numbers");
    ["z", "a"].forEach(function(k){ if (V[k] && (V[k].length !== nL - 1 || V[k].some(function(v, l){ return v.length !== L[l + 1].n; }))) bad.push("values." + k + " must be " + (nL - 1) + " vectors, one per layer after the input"); });
    L.forEach(function(ly, l){
      if (ly.n < 1 || ly.n > 64) bad.push("layers[" + l + "].n must be 1–64");
      if (ly.names && ly.names.length !== ly.n) bad.push("layers[" + l + "].names must have " + ly.n + " names");
    });
    var ok = !bad.length;
    // 計算の確かめ：z = W·a_前 + b、a = f(z)。値が丸めて書かれていれば、その桁の分だけ許す
    if (ok && d.weights && V.x && V.z) for (var l = 0; l < nL - 1; l++){
      var prev = l === 0 ? V.x : V.a && V.a[l - 1];
      if (!prev) break;
      var dp = Math.max.apply(null, prev.map(dec).concat([0])), dz = Math.max.apply(null, V.z[l].map(dec).concat([0]));
      V.z[l].forEach(function(z, i){
        var W = d.weights[l][i], s = W.reduce(function(a, w, j){ return a + w * prev[j]; }, 0) + (d.biases ? d.biases[l][i] : 0);
        var tol = 1e-6 * Math.max(1, Math.abs(s)) + (dz ? 0.51 * Math.pow(10, -dz) : 0) + (dp ? W.reduce(function(a, w){ return a + Math.abs(w); }, 0) * 0.51 * Math.pow(10, -dp) : 0);
        if (Math.abs(s - z) > tol) bad.push("layer " + (l + 1) + " neuron " + (i + 1) + ": z is " + z + " but W·a + b = " + +s.toFixed(6));
      });
      var act = L[l + 1].act;
      if (act && V.a){
        var zs = V.z[l], da = Math.max.apply(null, V.a[l].map(dec).concat([0])), want;
        if (act === "softmax"){ var m = Math.max.apply(null, zs), ex = zs.map(function(z){ return Math.exp(z - m); }), se = ex.reduce(function(a, b){ return a + b; }, 0); want = ex.map(function(e){ return e / se; }); }
        else want = zs.map(ACT[act].f);
        V.a[l].forEach(function(a, i){
          var t = 1e-6 + (da ? 0.51 * Math.pow(10, -da) : 0) + (dz && act !== "step" ? 0.51 * Math.pow(10, -dz) : 0);
          if (Math.abs(want[i] - a) > t) bad.push("layer " + (l + 1) + " neuron " + (i + 1) + ": a is " + a + " but " + ACT[act].en + "(z) = " + +want[i].toFixed(6));
        });
      }
    }
    // ステップの列
    var steps = d.steps;
    if (!steps){
      steps = [{show: "x"}];
      for (var q = 1; q < nL; q++){
        if (L[q].form === "split") steps.push({layer: q, phase: "z"}, {layer: q, phase: "a"});
        else steps.push({layer: q, phase: "a"});
      }
    }
    var st = {x: false, z: {}, a: {}, form: L.map(function(ly){ return ly.form === "split" ? "split" : "combined"; }), active: -1, focus: null, open: -1, note: ""};
    var states = [st];
    steps.forEach(function(s, j){
      var n = {x: st.x, z: Object.assign({}, st.z), a: Object.assign({}, st.a), form: st.form.slice(), active: -1, focus: null, open: -1, note: s.note || ""};
      if (s.show === "x") n.x = true;
      if (s.layer !== undefined){
        if (s.layer < 1 || s.layer >= nL) bad.push("steps[" + j + "].layer must be 1–" + (nL - 1));
        else if (s.phase === "delta" || s.phase === "grad") bad.push("steps[" + j + "].phase \"" + s.phase + "\" (backpropagation) is reserved and not drawn yet");
        else { n.x = true; n.active = s.layer; if (s.phase !== "a" || n.form[s.layer] === "combined") n.z[s.layer] = true; if (s.phase !== "z") { n.a[s.layer] = true; n.z[s.layer] = true; } }
      }
      if (s.open !== undefined){
        if (s.open < 1 || s.open >= nL) bad.push("steps[" + j + "].open must be 1–" + (nL - 1));
        else { n.form[s.open] = "split"; n.open = s.open; }
      }
      if (s.focus){
        var fl = s.focus[0], fi = s.focus[1];
        if (fl < 1 || fl >= nL || fi < 0 || fi >= L[fl].n) bad.push("steps[" + j + "].focus must be [layer 1–" + (nL - 1) + ", neuron 0–n−1]");
        else if (!d.weights) bad.push("steps[" + j + "].focus needs weights");
        else n.focus = [fl, fi];
      }
      states.push(n); st = n;
    });
    return (this._plan = {L: L, states: states, bad: bad, V: V});
  }
  fmt(v){
    var dg = Math.max(0, Math.min(6, Math.round(this.props.digits))), s = Math.abs(v).toFixed(dg);
    return (v < 0 && +s !== 0 ? "−" : "") + s;
  }
  mount(ctx){
    var self = this, P = this.props, D = base, pl = this.plan(), d = this.data, L = pl.L, V = pl.V, ja = /^ja\b/i.test(ctx.lang || "ja");
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!(P.dur >= 0)){ ctx.report("attr", "[nnet] dur must be ≥ 0; using 0.8"); P.dur = 0.8; }
    if (!(P.size >= 24)){ ctx.report("attr", "[nnet] size must be ≥ 24; using 24"); P.size = 24; }
    if (["plain", "weight"].indexOf(P.edges) < 0){ ctx.report("attr", "[nnet] edges must be plain or weight; using plain"); P.edges = "plain"; }
    pl.bad.forEach(function(m){ ctx.report("data", "[nnet] " + m); });
    var fs = P.size, tw = function(s){ return D.textWidth(s, fs, {font: self}); };
    // ニューロンの大きさ：値の字（とΣ・関数の名前）が入る丸。分けた形は左右に 2 つ分
    var all = [].concat(V.x || [], [].concat.apply([], V.z || []), [].concat.apply([], V.a || []));
    var valW = Math.max(tw("−0." + "0".repeat(Math.max(0, Math.round(P.digits)))), ...all.map(function(v){ return tw(self.fmt(v)); }));
    var actW = Math.max(tw("Σ"), ...L.map(function(ly){ return ly.act ? tw(ACT[ly.act][ja ? "ja" : "en"]) : 0; }));
    var r = Math.ceil(Math.max(fs * 1.1, valW / 2 + 6)), halfW = Math.ceil(Math.max(valW, actW) + 14);
    var gap = 8, capH = Math.ceil(fs * 1.6), labH = L.some(function(ly){ return ly.label; }) ? Math.ceil(fs * 1.6) : 0;
    var noteH = pl.states.some(function(s){ return s.note; }) || pl.states.some(function(s){ return s.focus; }) ? Math.ceil(fs * 1.7) : 0;
    var top = capH + 4, bottom = H - labH - noteH - 4, slotsMax = Math.max(1, Math.floor((bottom - top + gap) / (2 * r + gap)));
    // 横：名前の列（入力の左・出力の右）を取ってから、層の列を等間隔に。分けた形にもなりうる層は幅を広く取る
    var nameW = function(l){ return L[l].names ? Math.max.apply(null, L[l].names.map(function(s){ return tw(s); })) + 16 : 0; };
    var leftW = nameW(0), rightW = nameW(L.length - 1);
    var colW = L.map(function(ly, l){ var sp = pl.states.some(function(s){ return s.form[l] === "split"; }); return sp ? 2 * halfW : 2 * r; });
    var span = W - leftW - rightW - colW[0] / 2 - colW[L.length - 1] / 2 - 8;
    var xs = L.map(function(ly, l){ return leftW + colW[0] / 2 + 4 + (L.length > 1 ? span * l / (L.length - 1) : 0); });
    for (var l2 = 1; l2 < L.length; l2++) if (xs[l2] - xs[l2 - 1] < (colW[l2] + colW[l2 - 1]) / 2 + 60){
      ctx.report("layout", "[nnet] the layers are too close (" + Math.round(xs[l2] - xs[l2 - 1]) + " px between columns " + l2 + " and " + (l2 + 1) + "); use fewer layers, shorter names or a wider element"); break;
    }
    if (slotsMax < 2 || span < 0) ctx.report("size", "[nnet] the element (" + W + "×" + H + " px) is too small; give it about " + Math.ceil(top + 4 * (2 * r + gap) + labH + noteH + 8) + " px of height");
    // 縦：見せるニューロン（多ければ先頭と末尾、間に ⋮）
    this.cols = L.map(function(ly, l){
      var n = ly.n, k = Math.min(n, 8, slotsMax), idx;
      if (n <= k) idx = Array.from({length: n}, function(_, i){ return i; });
      else { var head = Math.ceil((k - 1) / 2), tail = k - 1 - head; idx = Array.from({length: head}, function(_, i){ return i; }).concat([-1], Array.from({length: tail}, function(_, i){ return n - tail + i; })); }
      var h = idx.length * 2 * r + (idx.length - 1) * gap, y0 = top + (bottom - top - h) / 2 + r;
      return idx.map(function(i, j){ return {i: i, x: xs[l], y: y0 + j * (2 * r + gap)}; });
    });
    var gE = D.el("g", {}, svg), gN = D.el("g", {}, svg), gT = D.el("g", {}, svg);
    // 辺
    var maxW = d.weights ? Math.max.apply(null, [].concat.apply([], [].concat.apply([], d.weights)).map(Math.abs).concat([1e-9])) : 1;
    this.edgeEls = [];
    for (var l = 1; l < L.length; l++) this.cols[l].forEach(function(t){
      if (t.i < 0) return;
      self.cols[l - 1].forEach(function(s){
        if (s.i < 0) return;
        var w = d.weights ? d.weights[l - 1][t.i][s.i] : null, wt = P.edges === "weight" && w !== null;
        var x1 = s.x + colHalf(l - 1), x2 = t.x - colHalf(l);
        // data-part：Studio の形の検査（R-geometry）が測る印。ニューロンの枠（n<層>-<番号>）とその中の数・横の名前、層のあいだの線（辺）と重みの札（縁取りあり）
        var eg = D.el("g", {"data-part": "edge", "data-part-id": "n" + (l - 1) + "-" + s.i + ">n" + l + "-" + t.i, "data-part-from": "n" + (l - 1) + "-" + s.i, "data-part-to": "n" + l + "-" + t.i}, gE);
        var e = D.el("line", {"data-part-line": "", x1: x1.toFixed(1), y1: s.y.toFixed(1), x2: x2.toFixed(1), y2: t.y.toFixed(1),
          stroke: wt ? (w < 0 ? "var(--emph)" : "var(--term)") : "var(--line)", "stroke-width": wt ? (1 + 5 * Math.abs(w) / maxW).toFixed(2) : 1.5,
          "stroke-dasharray": wt && w < 0 ? "8 6" : "none", opacity: 0.35}, eg);
        self.edgeEls.push({el: e, l: l, s: s, t: t, w: w});
      });
    });
    function colHalf(l){ return pl.states.some(function(s){ return s.form[l] === "split"; }) ? halfW : r; }
    // ニューロン
    this.neurons = this.cols.map(function(col, l){
      return col.map(function(c){
        if (c.i < 0){ var t = D.el("text", {x: c.x.toFixed(1), y: (c.y + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, gN); t.textContent = "⋮"; return {dots: true}; }
        var g = D.el("g", {}, gN);
        var nid = "n" + l + "-" + c.i;
        var body = D.el("rect", {y: (c.y - r).toFixed(1), height: 2 * r, rx: r, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2, "data-part": "box", "data-part-id": nid}, g);
        var ring = D.el("rect", {y: (c.y - r - 4).toFixed(1), height: 2 * r + 8, rx: r + 4, fill: "none", stroke: "var(--accent2)", "stroke-width": 4, opacity: 0}, g);
        var div = D.el("line", {x1: c.x, x2: c.x, y1: (c.y - r + 6).toFixed(1), y2: (c.y + r - 6).toFixed(1), stroke: "var(--fg)", "stroke-width": 2, opacity: 0}, g);
        var mk = function(){ return D.el("text", {x: c.x, y: (c.y + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)", opacity: 0, style: "font-variant-numeric:tabular-nums", "data-part": "label", "data-part-id": nid, "data-part-of": "box"}, g); };
        var o = {c: c, l: l, body: body, ring: ring, div: div, one: mk(), zT: mk(), aT: mk(), sig: mk(), fn: mk()};
        o.sig.textContent = "Σ"; o.fn.textContent = L[l].act ? ACT[L[l].act][ja ? "ja" : "en"] : "f";
        if (l === 0 && V.x) o.one.textContent = self.fmt(V.x[c.i]);
        if (l > 0){
          if (V.z) o.zT.textContent = self.fmt(V.z[l - 1][c.i]);
          if (V.a) o.one.textContent = o.aT.textContent = self.fmt(V.a[l - 1][c.i]);
        }
        return o;
      });
    });
    this.r = r; this.halfW = halfW;
    // 名前（入力の左、出力の右）、層の名前（下）、分けた層の見出し（上：Σ → ReLU）
    var names = function(l, side){
      if (!L[l].names) return;
      self.cols[l].forEach(function(c){ if (c.i < 0) return; D.mtext(gT, side < 0 ? c.x - colHalf(l) - 10 : c.x + colHalf(l) + 10, c.y + fs * 0.36, L[l].names[c.i], {"font-size": fs, "text-anchor": side < 0 ? "end" : "start", "data-part": "label", "data-part-id": "n" + l + "-" + c.i, "data-part-of": "box", "data-part-at": "outside"}); });
    };
    names(0, -1); if (L.length > 1) names(L.length - 1, 1);
    L.forEach(function(ly, l){
      if (ly.label){ var t = D.el("text", {x: xs[l].toFixed(1), y: (H - noteH - fs * 0.5).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, gT); t.textContent = ly.label; }
    });
    this.caps = L.map(function(ly, l){
      if (l === 0) return null;
      var t = D.el("text", {x: xs[l].toFixed(1), y: (fs * 1.1).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--muted)", opacity: 0}, gT);
      t.textContent = "Σ → " + (ly.act ? ACT[ly.act][ja ? "ja" : "en"] : "f");
      return t;
    });
    // 重みの札（focus）と下の行（説明・式）
    this.wlabels = [];
    if (d.weights) pl.states.forEach(function(s){
      if (!s.focus) return;
      var key = s.focus.join(":");
      if (self.wlabels.some(function(x){ return x.key === key; })) return;
      var tl = s.focus[0], ti = s.focus[1], tgt = self.cols[tl].filter(function(c){ return c.i === ti; })[0], g = D.el("g", {opacity: 0}, gT);
      if (tgt) self.cols[tl - 1].forEach(function(src){
        if (src.i < 0) return;
        var w = d.weights[tl - 1][ti][src.i], x1 = src.x + colHalf(tl - 1), x2 = tgt.x - colHalf(tl), f = 0.22;
        var x = x1 + (x2 - x1) * f, y = src.y + (tgt.y - src.y) * f - fs * 0.45;
        var t = D.el("text", {x: x.toFixed(1), y: y.toFixed(1), "font-size": fs, "text-anchor": "middle", fill: w < 0 ? "var(--emph)" : "var(--term)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", style: "font-variant-numeric:tabular-nums", "data-part": "label", "data-part-id": "n" + (tl - 1) + "-" + src.i + ">n" + tl + "-" + ti, "data-part-of": "edge", "data-part-halo": ""}, g);
        t.textContent = self.fmt(w);
      });
      self.wlabels.push({key: key, g: g, l: tl, i: ti});
    });
    this.noteText = noteH ? D.el("text", {x: 4, y: (H - fs * 0.5).toFixed(1), "font-size": fs, fill: "var(--fg)", opacity: 0}, gT) : null;
    this.noteFor = function(s){
      if (s.note) return s.note;
      if (!s.focus) return "";
      var tl = s.focus[0], ti = s.focus[1], prev = tl === 1 ? V.x : V.a && V.a[tl - 2], w = d.weights[tl - 1][ti];
      if (!prev || !V.z) return "";
      var terms = w.map(function(x, j){ return self.fmt(x) + "×" + self.fmt(prev[j]); }), b = d.biases ? d.biases[tl - 1][ti] : null;
      var s2 = (terms.length > 4 ? terms.slice(0, 3).concat(["…"]) : terms).join(" + ") + (b !== null ? " + " + self.fmt(b) : "") + " = " + self.fmt(V.z[tl - 1][ti]);
      return "z = " + s2.replace(/\+ −/g, "− ");
    };
    if (noteH){
      var long = pl.states.map(function(s, k){ return tw(self.noteFor(s)) > W - 8 ? k : -1; }).filter(function(k){ return k >= 0; });
      if (long.length) ctx.report("layout", "[nnet] the note of step " + long.join(", ") + " is wider than the element; shorten it (it is cut with …)");
    }
    this.fit = function(s){ if (tw(s) <= W - 8) return s; var a = Array.from(s); while (a.length && tw(a.join("") + "…") > W - 8) a.pop(); return a.join("") + "…"; };
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", this.summary(ja));
    this.model = {r: r, cols: this.cols.map(function(c){ return c.map(function(x){ return x.i; }); })};
  }
  summary(ja){
    var pl = this.plan(), L = pl.L, V = pl.V, self = this;
    var s = (ja ? "ニューラルネット（" : "Neural network (") + L.map(function(ly){ return ly.n; }).join("–") + (ja ? "）" : ")");
    var lab = function(l, i){ return L[l].names ? L[l].names[i].replace(/[*_^]/g, "") : (ja ? "ニューロン " : "neuron ") + (i + 1); };
    if (V.x) s += (ja ? "。入力：" : ". Input: ") + V.x.map(function(v, i){ return lab(0, i) + " " + self.fmt(v); }).join(ja ? "、" : ", ");
    if (V.a) { var o = L.length - 1; s += (ja ? "。出力：" : ". Output: ") + V.a[o - 1].map(function(v, i){ return lab(o, i) + " " + self.fmt(v); }).join(ja ? "、" : ", "); }
    return s;
  }
  duration(k){ return k >= 1 && k < this.plan().states.length ? this.props.dur : 0; }
  render(k, t, ctx){
    if (!this.neurons) return;
    var self = this, pl = this.plan(), D = base, P = this.props, r = this.r, hw = this.halfW;
    k = Math.max(0, Math.min(k, pl.states.length - 1));
    var cur = pl.states[k], prev = pl.states[Math.max(0, k - 1)], e = k === 0 ? 1 : D.prog(t, 0, P.dur);
    var mix = function(a, b){ return D.lerp(a ? 1 : 0, b ? 1 : 0, e); };
    this.neurons.forEach(function(col, l){
      col.forEach(function(o){
        if (o.dots) return;
        // 形：まとめた丸 ↔ 分けた形（open は幅を広げ、仕切りを出す）
        var sp = mix(prev.form[l] === "split", cur.form[l] === "split"), w = D.lerp(2 * r, 2 * hw, sp), x = o.c.x;
        o.body.setAttribute("x", (x - w / 2).toFixed(1)); o.body.setAttribute("width", w.toFixed(1)); o.body.setAttribute("rx", D.lerp(r, Math.min(r, 14), sp).toFixed(1));
        o.ring.setAttribute("x", (x - w / 2 - 4).toFixed(1)); o.ring.setAttribute("width", (w + 8).toFixed(1)); o.ring.setAttribute("rx", D.lerp(r + 4, Math.min(r + 4, 18), sp).toFixed(1));
        o.div.setAttribute("opacity", sp.toFixed(3));
        var lx = x - w / 4, rx = x + w / 4;
        o.zT.setAttribute("x", lx.toFixed(1)); o.sig.setAttribute("x", lx.toFixed(1)); o.aT.setAttribute("x", rx.toFixed(1)); o.fn.setAttribute("x", rx.toFixed(1));
        var hasX = l === 0 ? mix(prev.x, cur.x) : 0;
        var zOn = l > 0 ? mix(prev.z[l], cur.z[l]) : 0, aOn = l > 0 ? mix(prev.a[l], cur.a[l]) : 0;
        // まとめた丸：入力は x、ほかは a。分けた形：左は Σ → z、右は関数の名前 → a
        var one = l === 0 ? hasX : aOn * Math.max(0, 1 - 2 * sp);
        o.one.setAttribute("opacity", (o.one.textContent ? one : 0).toFixed(3));
        // 同じ場所の字は重ねない：前半で消し、後半で出す
        var inn = function(v){ return Math.max(0, 2 * v - 1); }, out = function(v){ return Math.max(0, 1 - 2 * v); };
        o.zT.setAttribute("opacity", (o.zT.textContent ? sp * inn(zOn) : 0).toFixed(3));
        o.sig.setAttribute("opacity", (sp * out(zOn)).toFixed(3));
        o.aT.setAttribute("opacity", (o.aT.textContent ? sp * inn(aOn) : 0).toFixed(3));
        o.fn.setAttribute("opacity", (sp * out(aOn)).toFixed(3));
        o.ring.setAttribute("opacity", (l === 0 ? hasX : Math.max(zOn * sp, aOn)).toFixed(3));
      });
      if (self.caps[l]) self.caps[l].setAttribute("opacity", mix(prev.form[l] === "split", cur.form[l] === "split").toFixed(3));
    });
    // 辺：今計算している層に入る辺は濃く、focus のときはそのニューロンに入る辺だけ濃く
    this.edgeEls.forEach(function(x){
      var lvl = function(s){ return s.focus ? (s.focus[0] === x.l && s.focus[1] === x.t.i ? 1 : 0.12) : s.active === x.l ? 1 : 0.35; };
      x.el.setAttribute("opacity", D.lerp(k === 0 ? lvl(cur) : lvl(prev), lvl(cur), e).toFixed(3));
    });
    this.wlabels.forEach(function(x){
      var on = function(s){ return s.focus && s.focus[0] === x.l && s.focus[1] === x.i; };
      x.g.setAttribute("opacity", mix(on(prev) && k > 0, on(cur)).toFixed(3));
    });
    if (this.noteText){
      var n = this.noteFor(cur);
      this.noteText.textContent = n ? this.fit(n) : "";
      this.noteText.setAttribute("opacity", n ? (k === 0 ? 1 : D.prog(t, 0, P.dur * 0.5)).toFixed(3) : 0);
    }
  }
};
});
