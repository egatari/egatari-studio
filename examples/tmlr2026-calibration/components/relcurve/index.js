// m-relcurve：信頼性図（予測確率 × 真の確率）に、ロジットのノイズ τ のときの最適な補正の曲線 C(p) を描く
// <m-relcurve taus="[0.3, 1.5, 3]" sweep overlay style="height:380px">
//   <script type="application/json">{{JSON:relcurve.json}}</script></m-relcurve>
// data = {p:[…], taus:[…], exact:[[C(p)] per tau], ts:[[σ(logit p / T)] per tau], T:[…]}（scripts/make_data.py）
// 段階 1：taus[0] の曲線を引く（overlay なら温度スケーリングの曲線を破線で続けて引く）
// 段階 j ≥ 2：τ を taus[j-2] から taus[j-1] へ動かす（前の τ の曲線は薄い線で残す）
DECK.define("m-relcurve", class extends DECK.MotionElement {
  static props = {
    taus:    {type: "json",   default: [1.5], doc: "段階ごとの τ の列（データの taus の範囲内）"},
    sweep:   {type: "bool",   default: false, doc: "段階 2 以降で τ を動かす（τ の読み値を出す）"},
    overlay: {type: "bool",   default: false, doc: "温度スケーリングの曲線を破線で重ね、T の読み値も出す"},
    dur:     {type: "number", default: 1.6, doc: "τ を動かす秒数"},
    lead:    {type: "number", default: 0.3, doc: "τ を動かし始めるまでの秒数（cues はこの時刻。{cue} に合わせる）"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.props.taus.length; }
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data;
    this.classList.add("plot"); this.style.display = "block";
    // 信頼性図は正方形にし、右の余白に曲線の名前と τ・T の読み値を置く
    var H = this.clientHeight, W = this.clientWidth, m = {l: 86, t: 20, b: 72};
    m.r = Math.max(24, W - m.l - (H - m.t - m.b));
    var p = this.p = D.Plot(this, {xr: [0, 1], yr: [0, 1], xt: [0, 0.5, 1], yt: [0, 0.5, 1], xl: "predicted", yl: "true probability", m: m});
    var uid = "rc" + (++D.Plot.n), x1 = p.W - p.m.r;
    D.el("line", {x1: p.x(0), y1: p.y(0), x2: p.x(1), y2: p.y(1), stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6"}, p.svg);
    this.ghosts = P.taus.map(function(tau){
      return D.el("path", {d: self.dOf(data.exact, tau), fill: "none", stroke: "var(--line)", "stroke-width": 3, "clip-path": p.clip, opacity: 0}, p.svg);
    });
    // 破線は dasharray を引く動きに使えないので、同じ線を mask にして引く（m-curves と同じ）
    if (P.overlay){
      var mk = D.el("mask", {id: uid + "m", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: p.W, height: p.H}, D.el("defs", {}, p.svg));
      this.tsMask = D.el("path", {fill: "none", stroke: "#fff", "stroke-width": 10, pathLength: 1, "stroke-dasharray": "1 2"}, mk);
    }
    this.cur = D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 4, "stroke-linejoin": "round", "clip-path": p.clip, pathLength: 1, "stroke-dasharray": "1 2"}, p.svg);
    if (P.overlay){
      var gg = D.el("g", {mask: "url(#" + uid + "m)"}, p.svg);
      this.ts = D.el("path", {fill: "none", stroke: "var(--term)", "stroke-width": 3.5, "stroke-dasharray": "11 8", "clip-path": p.clip}, gg);
    }
    // 曲線の名前（右の余白、曲線の右端の高さ）と読み値（右の余白の下）
    var lx = x1 + 12;
    this.labC = D.mtext(p.svg, lx, 0, P.overlay ? "exact *C*(*p*)" : "*C*(*p*)", {fill: "var(--emph)", "font-size": 26, "font-weight": 700, opacity: 0});
    if (P.overlay) this.labT = D.mtext(p.svg, lx, 0, "temp. scaling", {fill: "var(--term)", "font-size": 24, "font-weight": 700, opacity: 0});
    var showTau = P.sweep || P.overlay, yb = p.H - p.m.b;
    if (showTau){
      this.tauLab = D.mtext(p.svg, lx, yb - (P.overlay ? 44 : 6), "", {fill: "var(--emph)", "font-size": 28});
      if (P.overlay) this.TLab = D.mtext(p.svg, lx, yb - 6, "", {fill: "var(--term)", "font-size": 28});
    }
  }
  // τ（データの行の間は線形に補間）の曲線
  rows(rows, tau){
    var T = this.data.taus, j = 0;
    while (j < T.length - 2 && T[j + 1] <= tau) j++;
    var e = Math.max(0, Math.min(1, (tau - T[j]) / (T[j + 1] - T[j])));
    return rows[j].map(function(v, i){ return DECK.lerp(v, rows[j + 1][i], e); });
  }
  val(arr, tau){
    var T = this.data.taus, j = 0;
    while (j < T.length - 2 && T[j + 1] <= tau) j++;
    var e = Math.max(0, Math.min(1, (tau - T[j]) / (T[j + 1] - T[j])));
    return DECK.lerp(arr[j], arr[j + 1], e);
  }
  dOf(rows, tau){ var ps = this.data.p, y = this.rows(rows, tau); return this.p.poly(ps.map(function(x, i){ return [x, y[i]]; })); }
  duration(k){
    if (k < 1) return 0;
    if (k === 1) return this.props.overlay ? 1.9 : 1.2;
    return this.props.lead + this.props.dur;
  }
  cues(k){ return k >= 2 ? [this.props.lead] : null; }
  render(k, t){
    var P = this.props, D = DECK, V = P.taus, data = this.data, p = this.p;
    // 今の τ と、線を引く進み具合
    var tau = V[Math.max(0, Math.min(V.length - 1, k - 1))], draw = k >= 1 ? 1 : 0, drawT = draw, lab = draw, labT = draw;
    if (k === 1){ draw = D.prog(t, 0, 1.0); lab = D.prog(t, 0.7, 0.4); drawT = P.overlay ? D.prog(t, 0.6, 1.0) : 0; labT = D.prog(t, 1.4, 0.4); }
    if (k >= 2 && k <= V.length) tau = D.lerp(V[k - 2], V[k - 1], D.prog(t, P.lead, P.dur));
    this.cur.setAttribute("d", this.dOf(data.exact, tau));
    this.cur.setAttribute("stroke-dashoffset", (1 - draw).toFixed(4));
    this.cur.setAttribute("opacity", draw > 0 ? 1 : 0);
    // 前の τ の曲線を薄く残す（今の曲線と重なるものは出さない）
    this.ghosts.forEach(function(g, i){ g.setAttribute("opacity", i < k - 1 && Math.abs(V[i] - tau) > 1e-6 ? 1 : 0); });
    var yEnd = this.rows(data.exact, tau), pe = Math.max(p.m.t + 14, p.y(yEnd[yEnd.length - 1]));   // 名前が図の上にはみ出さないように
    if (P.overlay){
      var dT = this.dOf(data.ts, tau);
      this.ts.setAttribute("d", dT); this.tsMask.setAttribute("d", dT);
      this.tsMask.setAttribute("stroke-dashoffset", (1 - drawT).toFixed(4));
      this.ts.setAttribute("opacity", drawT > 0 ? 1 : 0);
      // 2 本の右端はほとんど重なるので、名前は上下に分ける
      this.labC.setAttribute("y", (pe - 6).toFixed(1));
      this.labT.setAttribute("y", (pe + 26).toFixed(1));
      this.labT.setAttribute("opacity", labT.toFixed(3));
    } else this.labC.setAttribute("y", (pe + 9).toFixed(1));
    this.labC.setAttribute("opacity", lab.toFixed(3));
    if (this.tauLab){
      this.setText(this.tauLab, "τ", " = " + tau.toFixed(2));
      this.tauLab.setAttribute("opacity", lab.toFixed(3));
      if (this.TLab){ this.setText(this.TLab, "T", " = " + this.val(data.T, tau).toFixed(2)); this.TLab.setAttribute("opacity", labT.toFixed(3)); }
    }
  }
  // 斜体の記号＋値（tspan 2 つ）
  setText(el, sym, rest){
    el.textContent = "";
    var a = DECK.el("tspan", {"font-style": "italic", class: "mi"}, el); a.textContent = sym;
    var b = DECK.el("tspan", {}, el); b.textContent = rest;
  }
});
