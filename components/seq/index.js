// m-seq：観測を 1 つずつ加えて、分布（事後分布など）と数値が更新されていく様子を見せる
// <m-seq per-step="2" style="height:400px"><script type="application/json">
//   {"xs":[…], "steps":[{"dens":[…], "readout":{"n":0,"μ_n":0.00}}, {"dens":[…], "readout":{…}, "mark":1.2}, …],
//    "xl":"*θ*", "yl":"密度", "yr":[0,2], "digits":{"n":0}, "markLabel":"*y*_n"}
// （JSON の終わり）</m-seq>
// steps[0] は始めの状態（段階 0）。steps[1..] が 1 回ずつの更新。1 段階に per-step 回の更新を、等しい時間枠で順に動かす。
// 今の分布は濃く、前の分布は薄い線で残す。右の欄に readout の数値（桁をそろえる）。mark は今回の観測の位置
DECK.define("m-seq", class extends DECK.MotionElement {
  static props = {
    "per-step": {type: "number", default: 1, doc: "1 段階で動かす更新の回数"},
    slot:  {type: "number", default: 0.9, doc: "更新 1 回の秒数（cues はこの間隔）"},
    xr: {type: "json", default: null, doc: "横軸の範囲（既定は xs の端）"}, yr: {type: "json", default: [0, 1]},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xf: {type: "number", default: undefined}, yf: {type: "number", default: undefined},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    digits: {type: "number", default: 2, doc: "数値の小数の桁数（data.digits で名前ごとに上書き）"},
    panel:  {type: "number", default: 250, doc: "右の数値の欄の幅（px）"},
    ghosts: {type: "number", default: 99, doc: "残す前の分布の数"},
  };
  // 属性があれば属性、なければ data の同名の値、なければ既定
  opt(name){ var d = this.data || {}; return this.hasAttribute(name) || d[name] === undefined ? this.props[name] : d[name]; }
  get updates(){ return Math.max(0, ((this.data || {}).steps || []).length - 1); }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : Math.ceil(this.updates / this.props["per-step"]); }
  mount(){
    var D = DECK, self = this, data = this.data, xs = data.xs;
    this.classList.add("plot"); this.style.display = "block";
    var xr = this.opt("xr") || [xs[0], xs[xs.length - 1]], pw = this.opt("panel");
    var p = this.p = D.Plot(this, {xr: xr, yr: this.opt("yr"), xt: this.opt("xt"), yt: this.opt("yt"), xf: this.opt("xf"), yf: this.opt("yf"),
                                   xl: this.opt("xl"), yl: this.opt("yl"), m: {l: 86, r: pw + 16, t: 24, b: 64}});
    this.pts = function(dens){ return xs.map(function(x, i){ return [x, dens[i]]; }); };
    // 塗り（今の分布の下）→ 前の分布の薄い線 → 今の分布の線 の順に重ねる
    this.area = D.el("path", {fill: "var(--term-tint)", stroke: "none", "clip-path": p.clip}, p.svg);
    var gG = D.el("g", {"clip-path": p.clip}, p.svg);
    this.ghostEls = data.steps.map(function(s){
      var e = D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, opacity: 0}, gG);
      e.setAttribute("d", p.poly(self.pts(s.dens)));
      return e;
    });
    this.cur = D.el("path", {fill: "none", stroke: "var(--term)", "stroke-width": 3.5, "stroke-linejoin": "round", "clip-path": p.clip}, p.svg);
    // 観測の印：今回は縦の点線と名前、前の観測は横軸の上の小さな点
    this.dots = data.steps.map(function(s){
      return s.mark === undefined ? null : D.el("circle", {cx: p.x(s.mark), cy: p.H - p.m.b - 7, r: 6, fill: "var(--muted)", opacity: 0}, p.svg);
    });
    this.markLine = D.el("line", {x1: 0, x2: 0, y1: p.m.t + 34, y2: p.H - p.m.b, stroke: "var(--emph)", "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, p.svg);
    this.markLab = D.mtext(p.svg, 0, p.m.t + 24, data.markLabel || "", {"text-anchor": "middle", fill: "var(--emph)", "font-size": 26, opacity: 0});
    // 数値の欄（名前は左寄せ、値は右寄せ。等幅の数字）
    var keys = Object.keys(data.steps[0].readout || {}), px = p.W - pw + 8, px2 = p.W - 8;
    D.el("rect", {x: px - 8, y: p.m.t, width: pw, height: 40 + keys.length * 44, rx: 10, fill: "var(--term-tint)", stroke: "var(--line)", "stroke-width": 1.5}, p.svg);
    this.rows = keys.map(function(key, j){
      var y = p.m.t + 44 + j * 44;
      D.mtext(p.svg, px + 12, y, key, {"font-size": 28});
      var v = D.el("text", {x: px2 - 12, y: y, "text-anchor": "end", "font-size": 28, style: "font-variant-numeric:tabular-nums;font-feature-settings:'tnum'"}, p.svg);
      return {key: key, el: v, dg: (data.digits || {})[key] !== undefined ? data.digits[key] : self.props.digits};
    });
  }
  // 段階 k が受け持つ更新の番号 [first, last]
  span(k){ var P = this.props["per-step"]; return [(k - 1) * P + 1, Math.min(k * P, this.updates)]; }
  duration(k){ if (k < 1) return 0; var s = this.span(k); return Math.max(0, s[1] - s[0] + 1) * this.props.slot; }
  cues(k){
    if (k < 1) return null;
    var s = this.span(k), out = [];
    for (var j = 0; j <= s[1] - s[0]; j++) out.push(+(j * this.props.slot).toFixed(4));
    return out;
  }
  render(k, t){
    var D = DECK, S = this.data.steps, p = this.p, slot = this.props.slot;
    // 今の更新の番号 idx と、その更新の進み具合 e（0 なら一つ前の状態、1 なら更新後）
    var idx = 0, e = 1, tm = 0;
    if (k >= 1){
      var s = this.span(k), n = s[1] - s[0] + 1;
      if (t === Infinity){ idx = s[1]; tm = Infinity; }
      else { var j = Math.max(0, Math.min(n - 1, Math.floor(t / slot))); idx = s[0] + j; tm = t - j * slot; }
      e = D.prog(tm, 0, slot * 0.8);
    }
    var a = S[Math.max(0, idx - 1)], b = S[idx];
    var dens = b.dens.map(function(v, i){ return D.lerp(a.dens[i], v, e); });
    var d = p.poly(this.pts(dens));
    this.cur.setAttribute("d", d);
    this.area.setAttribute("d", d + "L" + p.x(this.data.xs[this.data.xs.length - 1]).toFixed(1) + "," + p.y(0).toFixed(1) + "L" + p.x(this.data.xs[0]).toFixed(1) + "," + p.y(0).toFixed(1) + "Z");
    var G = this.props.ghosts;
    this.ghostEls.forEach(function(g, i){ g.setAttribute("opacity", i < idx && i >= idx - G ? 1 : 0); });
    this.dots.forEach(function(c, i){ if (c) c.setAttribute("opacity", i < idx ? 1 : 0); });
    var mo = b.mark !== undefined && idx > 0 ? D.prog(tm, 0, 0.25) : 0;
    if (b.mark !== undefined){ var mx = p.x(b.mark); this.markLine.setAttribute("x1", mx); this.markLine.setAttribute("x2", mx); this.markLab.setAttribute("x", mx); }
    this.markLine.setAttribute("opacity", mo.toFixed(3));
    this.markLab.setAttribute("opacity", mo.toFixed(3));
    this.rows.forEach(function(r){
      var va = (a.readout || {})[r.key], vb = (b.readout || {})[r.key], v;
      if (typeof va === "number" && typeof vb === "number") v = D.lerp(va, vb, e).toFixed(r.dg).replace("-", "−");
      else v = String(e < 0.5 && va !== undefined ? va : vb);
      r.el.textContent = v === "−0" || /^−0\.0*$/.test(v) ? v.slice(1) : v;
    });
  }
});
