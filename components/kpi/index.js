// m-kpi：大きな数字の札（KPI）を段階ごとに出す。数字は 0（か from）から数え上げ、下に増減の矢印と一言
// <m-kpi style="height:300px"><script type="application/json">
//   {"cards": [{"label": "作成時間", "value": 62, "unit": "%", "prefix": "−", "delta": {"dir": "down", "text": "前の版から 8 pt", "good": true}, "note": "1 本あたり"}]}
// （JSON の終わり）</m-kpi>
// 段階：既定は札 1 枚 = 1 段階（per-step で n 枚ずつ、札の step で直接、at で段階の中の開始秒）
// 数え上げは (k, t) だけで決まる（初めに速く、終わりにゆっくり。t = Infinity なら最後の値）。count="false" で数えずに出す
// 札の幅は cols（既定は札の数、4 まで）で決める。数字と単位の幅は字数から見積もって中央にそろえる（字の読み込みを待たない）
DECK.define("m-kpi", class extends DECK.MotionElement {
  static props = {
    cols:       {type: "number", default: 0, doc: "1 行の札の数（0 = 札の数、4 まで）"},
    digits:     {type: "number", default: 0, doc: "数字の小数桁（札の digits が優先）"},
    "per-step": {type: "number", default: 1, doc: "1 段階に出す札の数（0 = 全部を段階 1 で）"},
    dur:        {type: "number", default: 1.2, doc: "数え上げの秒数"},
    stagger:    {type: "number", default: 0.3, doc: "同じ段階の札の出だしのずれ（秒）"},
    count:      {type: "bool", default: true, doc: "数字を数え上げる"},
    size:       {type: "number", default: 0, doc: "数字の字の大きさ（px。0 = 札の高さから）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var P = this.props, per = P["per-step"], seen = {};
    return (this._plan = ((this.data || {}).cards || []).map(function(c, i){
      var step = c.step !== undefined ? c.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {c: c, step: step, at: c.at !== undefined ? c.at : +((j - 1) * P.stagger).toFixed(3)};
    }));
  }
  mount(){
    var P = this.props, D = DECK, self = this, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var n = pl.length || 1, cols = P.cols || Math.min(4, n), rows = Math.ceil(n / cols), gap = 28;
    var cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
    var size = P.size || Math.max(48, Math.min(84, ch * 0.3, cw * 0.24));
    var est = function(s, sz){ return [...String(s)].reduce(function(a, c){ return a + (/[0-9.,+−-]/.test(c) ? 0.58 : /[\u0000-ɏ]/.test(c) ? 0.62 : 1); }, 0) * sz; };
    this.cards = pl.map(function(o, i){
      var c = o.c, x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap), cx = x + cw / 2;
      var col = "var(--" + (/^(term|emph|accent2|series-[1-4])$/.test(c.tone || "") ? c.tone : "term") + ")";
      var g = D.el("g", {opacity: 0}, svg);
      D.el("rect", {x: x, y: y, width: cw, height: ch, rx: 12, fill: "var(--term-tint)"}, g);
      D.el("rect", {x: x, y: y, width: cw, height: 7, rx: 3, fill: col}, g);
      // 行の位置：名前・数字・増減・一言を札の高さに配る
      var hasD = !!c.delta, hasN = !!c.note;
      var yl = y + 26 + 26, yn = y + ch * (hasD || hasN ? 0.5 : 0.6) + size * 0.36;
      D.mtext(g, cx, yl, c.label || "", {"text-anchor": "middle", "font-size": 26, "font-weight": 700});
      var dg = c.digits !== undefined ? c.digits : P.digits, usz = Math.round(size * 0.46);
      var finalS = (c.prefix || "") + self.fmt(c.value, dg);
      var nw = est(finalS, size), uw = c.unit ? est(c.unit, usz) + 6 : 0, xr = cx - (nw + uw) / 2 + nw;
      var num = D.el("text", {x: xr.toFixed(1), y: yn.toFixed(1), "text-anchor": "end", "font-size": size, "font-weight": 700, fill: col, style: "font-variant-numeric:tabular-nums"}, g);
      if (c.unit){ var u = D.el("text", {x: (xr + 6).toFixed(1), y: yn.toFixed(1), "font-size": usz, "font-weight": 700, fill: col}, g); u.textContent = c.unit; }
      var gd = null;
      if (hasD){
        // 増減：▲ / ▼ と一言。良い向き（good、既定は up）なら --term、悪い向きなら --emph
        var up = c.delta.dir !== "down", good = c.delta.good !== undefined ? !!c.delta.good : up;
        var dc = good ? "var(--term)" : "var(--emph)", yd = yn + Math.max(44, size * 0.62), tw = est(c.delta.text || "", 24) + 30;
        gd = D.el("g", {opacity: 0}, g);
        var tx = cx - tw / 2;
        D.el("path", {d: up ? "M0,-9L9,7L-9,7Z" : "M0,9L9,-7L-9,-7Z", fill: dc, transform: "translate(" + (tx + 9).toFixed(1) + " " + (yd - 8).toFixed(1) + ")"}, gd);
        D.mtext(gd, tx + 30, yd, c.delta.text || "", {"font-size": 24, fill: dc, "font-weight": 700});
      }
      var note = hasN ? D.mtext(g, cx, y + ch - 22, c.note, {"text-anchor": "middle", "font-size": 24, fill: "var(--muted)"}) : null;
      return {o: o, g: g, num: num, gd: gd, dg: dg, from: c.from || 0, cx: cx, cy: y + ch / 2};
    });
  }
  fmt(v, dg){
    var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + i + (s[1] ? "." + s[1] : "");
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + (P.count ? P.dur : 0.45) + (o.c.delta ? 0.4 : 0)); });
    return d;
  }
  cues(k){
    var c = [];
    this.plan().forEach(function(o){ if (o.step === k && o.at > 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t){
    var P = this.props, D = DECK, self = this;
    this.cards.forEach(function(o){
      var s = o.o.step, at = o.o.at;
      var tt = s < k ? Infinity : s > k ? -1 : t;   // この札の段階の中の時刻（-1 = まだ）
      var e = tt < 0 ? 0 : D.prog(tt, at, 0.45);
      o.g.setAttribute("opacity", e.toFixed(3));
      o.g.setAttribute("transform", "translate(0 " + ((1 - e) * 14).toFixed(2) + ")");
      // 数え上げ：ease-out（初めに速く）。t = Infinity なら最後の値
      var c = tt < 0 ? 0 : tt === Infinity || !P.count ? 1 : D.clamp01((tt - at) / P.dur);
      var q = 1 - Math.pow(1 - c, 3), v = D.lerp(o.from, o.o.c.value, q);
      o.num.textContent = (o.o.c.prefix || "") + self.fmt(c >= 1 ? o.o.c.value : v, o.dg);
      if (o.gd) o.gd.setAttribute("opacity", (tt < 0 ? 0 : D.prog(tt, at + (P.count ? P.dur : 0.45) * 0.85, 0.4)).toFixed(3));
    });
  }
});
