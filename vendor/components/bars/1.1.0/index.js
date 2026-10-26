// m-bars：棒を段階ごとに 0 から伸ばす（縦棒・横棒。系列が 2 つ以上なら組の棒）。値の数字は棒の端に直接書く
// <m-bars unit="億円" style="height:400px"><script type="application/json">
//   {"series": [{"label": "売上"}],
//    "groups": [{"label": "1 年目", "value": 1.2}, {"label": "3 年目", "values": [9.8], "tone": "emph"}]}
// （JSON の終わり）</m-bars>
// 段階：既定は組 1 つ = 1 段階（per-step で n 組ずつ、組の step で直接）。軸・目盛り・組の名前は段階 0 から見える
// scale：[{"step": 3, "max": 200}] で、その段階の始めに値の軸の上限を動かす（対数で補間。前の上限までの範囲は薄い帯で残す）。
//        上限を超える棒は軸の上端で止まり、上限が広がるにつれて伸びる（「軸を突き抜ける」見せ方）
// 値の数字は伸びきってから出す（途中の値を読ませない）。count="true" なら伸びに合わせて数え上げる
DECK.define("m-bars", class extends DECK.MotionElement {
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["groups"], properties: {
      groups: {type: "array", minItems: 1, items: {type: "object", anyOf: [{required: ["value"]}, {required: ["values"]}], properties: {
        label: {type: "string"}, value: {type: "number"}, values: {type: "array", items: {type: "number"}}, step: {type: "integer"}, at: {type: "number"}, tone: {type: "string"}}}},
      series: {type: "array", items: {type: "object", properties: {label: {type: "string"}, tone: {type: "string"}}}},
      scale: {type: "array", items: {type: "object", required: ["step"], properties: {step: {type: "integer"}, max: {type: "number"}, at: {type: "number"}}}},
      max: {type: "number"}}},
    example: {series: [{label: "売上"}], groups: [{label: "1 年目", value: 1.2}, {label: "2 年目", value: 3.4}]},
  };
  static props = {
    orient:     {type: "string", default: "v", doc: "v（縦棒）か h（横棒。順位や比較に）"},
    max:        {type: "number", default: 0, doc: "値の軸の上限（0 = 自動。scale があれば最初の上限）"},
    unit:       {type: "string", default: "", doc: "値の単位（数字の後ろに付ける。億円、%、社 など）"},
    digits:     {type: "number", default: 0, doc: "値の小数桁"},
    "per-step": {type: "number", default: 1, doc: "1 段階に出す組の数（0 = 全部を段階 1 で）"},
    dur:        {type: "number", default: 0.8, doc: "1 本が伸びる秒数"},
    stagger:    {type: "number", default: 0.15, doc: "同じ段階の組の出だしのずれ（秒）"},
    count:      {type: "bool", default: false, doc: "値の数字を伸びに合わせて数え上げる"},
    ticks:      {type: "bool", default: true, doc: "値の軸の目盛りと格子"},
    zoom:       {type: "number", default: 1.6, doc: "scale で上限を動かす秒数"},
    al:         {type: "string", default: "", doc: "値の軸の名前"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().groups.forEach(function(g){ m = Math.max(m, g.step); });
    (this.plan().scale).forEach(function(s){ m = Math.max(m, s.step); });
    return m;
  }
  // 組の段階と開始時刻、上限の動き（mount の前にも steps が要るので、データだけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, per = P["per-step"], seen = {};
    var groups = (d.groups || []).map(function(g, i){
      var vals = Array.isArray(g.values) ? g.values : [g.value];
      var step = g.step !== undefined ? g.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {g: g, vals: vals.map(Number), step: step, at: g.at !== undefined ? g.at : +((j - 1) * P.stagger).toFixed(3)};
    });
    var scale = (d.scale || []).map(function(s){ return {step: s.step, max: +s.max, at: s.at || 0}; })
      .sort(function(a, b){ return a.step - b.step; });
    return (this._plan = {groups: groups, scale: scale});
  }
  mount(){
    var P = this.props, D = DECK, self = this, d = this.data || {}, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight, hor = P.orient === "h";
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var series = d.series && d.series.length ? d.series : [{}];
    var ns = Math.max(series.length, Math.max.apply(null, pl.groups.map(function(g){ return g.vals.length; }).concat([1])));
    var all = [].concat.apply([], pl.groups.map(function(g){ return g.vals; }));
    // 軸の上限：scale の最初の段階より前に出る棒が収まるように
    var first = pl.scale.length ? pl.scale[0].step : Infinity;
    var early = [].concat.apply([], pl.groups.filter(function(g){ return g.step < first; }).map(function(g){ return g.vals; }));
    this.M0 = P.max || d.max || nice(Math.max.apply(null, (early.length ? early : all).concat([1e-9])) * 1.12);
    this.levels = [this.M0].concat(pl.scale.map(function(s){ return s.max || nice(Math.max.apply(null, all) * 1.12); }));
    pl.scale.forEach(function(s, i){ s.max = self.levels[i + 1]; });
    // 余白：横棒は組の名前の幅（和文 1 字 = 1 字幅、ほかは 0.55 字幅の見積もり）、縦棒は値の軸の目盛り
    var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
    var longest = Math.max.apply(null, pl.groups.map(function(g){ return Math.max.apply(null, String(g.g.label || "").split("\n").map(function(s){ return est(s, 26); })); }).concat([0]));
    var valW = Math.max.apply(null, all.map(function(v){ return est(self.fmt(v), 26); }).concat([0]));
    var lines = Math.max.apply(null, pl.groups.map(function(g){ return String(g.g.label || "").split("\n").length; }).concat([1]));
    var m = this.m = hor ? {l: Math.min(W * 0.42, longest + 24), r: valW + 24, t: P.al ? 40 : 8, b: P.ticks ? 44 : 8}
                         : {l: P.ticks ? 24 + est(this.fmtTick(this.levels[this.levels.length - 1], 1), 24) + (P.al ? 36 : 0) : 16, r: 16, t: ns > 1 ? 80 : 44, b: 18 + 30 * lines};
    this.x0 = m.l; this.x1 = W - m.r; this.y0 = m.t; this.y1 = H - m.b;
    this.len = hor ? this.x1 - this.x0 : this.y1 - this.y0;
    // 前の上限までの範囲（上限を動かす間だけ）
    this.band = D.el("rect", {fill: "var(--term-tint)", opacity: 0}, svg);
    // 目盛り：上限ごとに 1 組。上限が動く間は前の組を薄くし、次の組を濃くする
    var gT = D.el("g", {}, svg);
    this.tickSets = !P.ticks ? [] : this.levels.map(function(M){
      var st = tickStep(M), dec = decs(st);
      var out = [];
      for (var i = 1; i * st <= M * 1.0001; i++){
        var v = +(i * st).toFixed(8);
        out.push({v: v, grid: D.el("line", {stroke: "var(--line)", "stroke-width": 1.2}, gT),
          text: D.el("text", {"font-size": 24, "text-anchor": hor ? "middle" : "end", style: "font-variant-numeric:tabular-nums"}, gT), label: self.fmtTick(v, dec)});
      }
      out.forEach(function(o){ o.text.textContent = o.label; });
      return out;
    });
    // 0 の目盛りと基線（いつも出す）
    if (P.ticks){
      var z = D.el("text", {"font-size": 24, "text-anchor": hor ? "middle" : "end"}, gT);
      z.textContent = "0";
      if (hor){ z.setAttribute("x", this.x0); z.setAttribute("y", this.y1 + 32); } else { z.setAttribute("x", this.x0 - 10); z.setAttribute("y", this.y1 + 8); }
    }
    if (P.al){
      if (hor) D.mtext(svg, this.x1, this.y0 - 14, P.al, {"text-anchor": "end", fill: "var(--muted)"});
      else D.mtext(svg, 20, (this.y0 + this.y1) / 2, P.al, {"text-anchor": "middle", fill: "var(--muted)", transform: "rotate(-90 20 " + (this.y0 + this.y1) / 2 + ")"});
    }
    var gB = D.el("g", {}, svg), gL = D.el("g", {}, svg);
    if (hor) D.el("line", {x1: this.x0, y1: this.y0, x2: this.x0, y2: this.y1, stroke: "var(--fg)", "stroke-width": 1.5}, svg);
    else D.el("line", {x1: this.x0, y1: this.y1, x2: this.x1, y2: this.y1, stroke: "var(--fg)", "stroke-width": 1.5}, svg);
    // 組と棒の位置（組の幅は枠の 64%、棒は組の幅を系列で分ける）
    var n = pl.groups.length || 1, cross = hor ? this.y1 - this.y0 : this.x1 - this.x0, slot = cross / n;
    var bw = Math.min(hor ? 56 : 96, slot * 0.64 / ns);
    this.bars = [];
    this.groups = pl.groups.map(function(o, i){
      var c = (hor ? self.y0 : self.x0) + slot * (i + 0.5);
      var lab = String(o.g.label || "").split("\n").map(function(s, j, a){
        return hor ? D.mtext(gL, self.x0 - 12, c + 8 + (j - (a.length - 1) / 2) * 30, s, {"text-anchor": "end", "font-size": 26})
                   : D.mtext(gL, c, self.y1 + 34 + j * 30, s, {"text-anchor": "middle", "font-size": 26});
      });
      o.vals.forEach(function(v, j){
        var col = tone(o.g.tone || series[j] && series[j].tone || (ns > 1 ? "series-" + (j % 4 + 1) : "term"));
        var off = (j - (ns - 1) / 2) * (bw + 4);
        var b = {o: o, v: v, j: j, c: c + off, col: col,
          rect: D.el("rect", {rx: 3, fill: col}, gB),
          val: D.el("text", {"font-size": 26, "font-weight": 700, "text-anchor": hor ? "start" : "middle", fill: o.g.tone ? col : "var(--fg)", style: "font-variant-numeric:tabular-nums"}, gL)};
        // 系列の名前は最初の組の棒の上（横棒なら右）に直接書く（凡例は作らない）
        if (i === 0 && ns > 1 && series[j] && series[j].label) b.ser = D.mtext(gL, 0, 0, series[j].label, {"text-anchor": hor ? "start" : "middle", "font-size": 24, "font-weight": 700, fill: col});
        self.bars.push(b);
      });
      return {o: o, lab: lab};
    });
    this.bw = bw;
    this.hor = hor;
    function nice(v){ var e = Math.pow(10, Math.floor(Math.log10(v))), x = v / e;
      return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function(s){ return s >= x - 1e-9; })[0] * e; }
    function tickStep(M){ var r = M / 4.5, e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e;
      return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e; }
    function decs(s){ var k = 0; while (Math.abs(s * Math.pow(10, k) - Math.round(s * Math.pow(10, k))) > 1e-6 && k < 6) k++; return k; }
    function tone(t){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(t) ? "var(--" + t + ")" : "var(--term)"; }
  }
  // 数の書き方：3 桁ごとのカンマ、小数桁、単位
  fmt(v, digits, unit){
    var dg = digits !== undefined ? digits : this.props.digits;
    var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + i + (s[1] ? "." + s[1] : "") + (unit !== undefined ? unit : this.props.unit);
  }
  fmtTick(v, dec){ return this.fmt(v, dec, ""); }
  // 段階 k、時刻 t の上限
  maxAt(k, t){
    var P = this.props, m = this.M0, from = 0, e = 1, lv = 0;
    for (var i = 0; i < this.plan().scale.length; i++){
      var s = this.plan().scale[i];
      if (s.step < k){ m = s.max; lv = i + 1; continue; }
      if (s.step === k){ e = DECK.prog(t, s.at, P.zoom); from = m; m = Math.exp(DECK.lerp(Math.log(m), Math.log(s.max), e)); return {m: m, lv: i + 1, e: e, from: from}; }
      break;
    }
    return {m: m, lv: lv, e: 1, from: null};
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().groups.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + 0.1 * (o.vals.length - 1) + P.dur + (P.count ? 0 : 0.35)); });
    this.plan().scale.forEach(function(s){ if (s.step === k) d = Math.max(d, s.at + P.zoom + 0.3); });
    return d;
  }
  render(k, t){
    var P = this.props, D = DECK, self = this, hor = this.hor;
    var sc = this.maxAt(k, t), M = sc.m;
    var pos = function(v){ var r = Math.min(v, M * 1.04) / M * self.len; return hor ? self.x0 + r : self.y1 - r; };
    // 目盛り：今の上限の組を濃く、動いている間は前の組を薄く
    // 前の組と次の組に同じ値の目盛りがあれば、重ねずに次の組のものだけを濃く出す
    var moving = sc.from !== null, has = function(li, v){ return (self.tickSets[li] || []).some(function(o){ return Math.abs(o.v - v) < 1e-9; }); };
    this.tickSets.forEach(function(set, li){
      var op = li === sc.lv ? sc.e : li === sc.lv - 1 && moving ? 1 - sc.e : 0;
      set.forEach(function(o){
        var b = op;
        if (moving && li === sc.lv - 1 && has(sc.lv, o.v)) b = 0;
        if (moving && li === sc.lv && has(sc.lv - 1, o.v)) b = 1;
        var p = pos(o.v), a = o.v > M * 1.001 ? 0 : b;
        if (hor){ o.grid.setAttribute("x1", p.toFixed(1)); o.grid.setAttribute("x2", p.toFixed(1)); o.grid.setAttribute("y1", self.y0); o.grid.setAttribute("y2", self.y1);
                  o.text.setAttribute("x", p.toFixed(1)); o.text.setAttribute("y", self.y1 + 32); }
        else { o.grid.setAttribute("y1", p.toFixed(1)); o.grid.setAttribute("y2", p.toFixed(1)); o.grid.setAttribute("x1", self.x0); o.grid.setAttribute("x2", self.x1);
               o.text.setAttribute("x", self.x0 - 10); o.text.setAttribute("y", (p + 8).toFixed(1)); }
        o.grid.setAttribute("opacity", (0.8 * a).toFixed(3)); o.text.setAttribute("opacity", a.toFixed(3));
      });
    });
    // 前の上限までの帯（上限が動く間だけ）
    var bo = sc.from === null ? 0 : 0.6 * Math.min(1, sc.e * 4) * (1 - D.prog(t, P.zoom * 0.8, P.zoom * 0.4));
    var pb = pos(Math.min(sc.from || 0, M));
    if (hor){ this.band.setAttribute("x", this.x0); this.band.setAttribute("width", Math.max(0, pb - this.x0).toFixed(1)); this.band.setAttribute("y", this.y0); this.band.setAttribute("height", this.y1 - this.y0); }
    else { this.band.setAttribute("x", this.x0); this.band.setAttribute("width", this.x1 - this.x0); this.band.setAttribute("y", pb.toFixed(1)); this.band.setAttribute("height", Math.max(0, this.y1 - pb).toFixed(1)); }
    this.band.setAttribute("opacity", bo.toFixed(3));
    this.bars.forEach(function(b){
      var o = b.o, at = o.at + 0.1 * b.j;
      var e = o.step < k ? 1 : o.step > k ? 0 : D.prog(t, at, P.dur);
      var v = b.v * e, p = pos(v), w = self.bw;
      if (hor){ b.rect.setAttribute("x", self.x0); b.rect.setAttribute("width", Math.max(0, p - self.x0).toFixed(1)); b.rect.setAttribute("y", (b.c - w / 2).toFixed(1)); b.rect.setAttribute("height", w.toFixed(1)); }
      else { b.rect.setAttribute("x", (b.c - w / 2).toFixed(1)); b.rect.setAttribute("width", w.toFixed(1)); b.rect.setAttribute("y", p.toFixed(1)); b.rect.setAttribute("height", Math.max(0, self.y1 - p).toFixed(1)); }
      b.rect.setAttribute("opacity", e > 0 ? 1 : 0);
      // 値の数字：既定は伸びきってから。count なら伸びに合わせて
      var vo = P.count ? (e > 0 ? 1 : 0) : o.step < k ? 1 : o.step > k ? 0 : D.prog(t, at + P.dur, 0.35);
      b.val.textContent = self.fmt(P.count ? v : b.v);
      var pe = P.count ? p : pos(b.v);
      if (hor){ b.val.setAttribute("x", (pe + 10).toFixed(1)); b.val.setAttribute("y", (b.c + 9).toFixed(1)); }
      else { b.val.setAttribute("x", b.c.toFixed(1)); b.val.setAttribute("y", (pe - 12).toFixed(1)); }
      b.val.setAttribute("opacity", vo.toFixed(3));
      if (b.ser){
        if (hor){ b.ser.setAttribute("x", (pos(b.v) + 24 + self.fmt(b.v).length * 15).toFixed(1)); b.ser.setAttribute("y", (b.c + 8).toFixed(1)); }
        else { b.ser.setAttribute("x", b.c.toFixed(1)); b.ser.setAttribute("y", (pos(b.v) - 44).toFixed(1)); }
        b.ser.setAttribute("opacity", vo.toFixed(3));
      }
    });
  }
});
