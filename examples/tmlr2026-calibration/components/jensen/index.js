// m-jensen：シグモイドを事後分布で平均すると 0.5 の側へ縮む（Jensen の不等式）ことを見せる
// <m-jensen style="height:380px"><script type="application/json">{{JSON:jensen.json}}</script></m-jensen>
// data = {theta:[…], sigmoid:[…], mu, sd, pdf:[…], sig_of_mean, mean_of_sig}（scripts/make_data.py）
// 段階 0：シグモイドを薄く／段階 1 の前半（0〜split 秒）：事後分布の山が μ のまわりに立ち上がる
// 後半（split〜2·split 秒）：σ(E[θ]) と E[σ(θ)] の点・縦軸への補助線・「toward 0.5」の矢印。cues(1) = [split]
DECK.define("m-jensen", class extends DECK.MotionElement {
  static steps = 1;
  static props = {
    split: {type: "number", default: 1.3, doc: "前半（事後分布）と後半（2 つの値）の境の秒数。後半も同じ長さ"},
    peak:  {type: "number", default: 0.35, doc: "事後分布の山の高さ（縦軸の値）"},
  };
  mount(){
    var P = this.props, D = DECK, data = this.data, th = data.theta;
    this.classList.add("plot"); this.style.display = "block";
    var xr = [th[0], th[th.length - 1]];
    var p = this.p = D.Plot(this, {xr: xr, yr: [0, 1], xt: [-6, -3, 0, 3, 6].filter(function(v){ return v >= xr[0] && v <= xr[1]; }), yt: [0, 0.5, 1], yf: undefined,
                                   xl: "logit *θ*", yl: "probability", m: {l: 86, r: 24, t: 20, b: 72}});
    var mu = data.mu, ys = data.sig_of_mean, ym = data.mean_of_sig, xm = p.x(mu), x0 = p.m.l;
    var pk = Math.max.apply(null, data.pdf), sc = P.peak / pk;
    this.pts = th.map(function(v, i){ return [v, data.pdf[i] * sc]; });
    // 事後分布の山（塗りと線）。縦に伸ばして立ち上げる
    this.bump = D.el("g", {}, p.svg);
    var d = p.poly(this.pts);
    D.el("path", {d: d + "L" + p.x(xr[1]).toFixed(1) + "," + p.y(0).toFixed(1) + "L" + p.x(xr[0]).toFixed(1) + "," + p.y(0).toFixed(1) + "Z",
                  fill: "color-mix(in oklab, var(--muted) 20%, transparent)", stroke: "none"}, this.bump);
    D.el("path", {d: d, fill: "none", stroke: "var(--muted)", "stroke-width": 3, "clip-path": p.clip}, this.bump);
    this.bumpLab = D.mtext(p.svg, xm + 14, p.y(P.peak + 0.03), "posterior", {fill: "var(--muted)", "font-size": 26, "font-weight": 700, opacity: 0});
    this.muLine = D.el("line", {x1: xm, y1: p.y(0), x2: xm, y2: p.y(ys), stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "5 5", opacity: 0}, p.svg);
    // シグモイド
    this.sig = D.el("path", {d: p.poly(th.map(function(v, i){ return [v, data.sigmoid[i]]; })), fill: "none", stroke: "var(--term)", "stroke-width": 4, "clip-path": p.clip}, p.svg);
    this.sigLab = D.svgMath(p.svg, p.x(xr[0] + 0.5), p.y(0.12), "\\sigma(\\theta)", {size: 28, color: "var(--term)"});
    // 2 つの値：点、縦軸への補助線、名前
    this.gTop = D.el("g", {opacity: 0}, p.svg);
    D.el("line", {x1: x0, y1: p.y(ys), x2: xm, y2: p.y(ys), stroke: "var(--term)", "stroke-width": 2, "stroke-dasharray": "5 5"}, this.gTop);
    D.el("circle", {cx: xm, cy: p.y(ys), r: 8, fill: "var(--term)"}, this.gTop);
    D.svgMath(this.gTop, x0 + 12, p.y(ys) - 14, "\\sigma(\\mathbb{E}[\\theta]) = " + ys.toFixed(2), {size: 26, color: "var(--term)"});
    this.gLow = D.el("g", {opacity: 0}, p.svg);
    D.el("line", {x1: x0, y1: p.y(ym), x2: xm, y2: p.y(ym), stroke: "var(--emph)", "stroke-width": 2.5, "stroke-dasharray": "5 5"}, this.gLow);
    D.el("circle", {cx: xm, cy: p.y(ym), r: 8, fill: "var(--emph)"}, this.gLow);
    D.svgMath(this.gLow, x0 + 12, p.y(ym) + 32, "\\mathbb{E}[\\sigma(\\theta)] = " + ym.toFixed(2), {size: 26, color: "var(--emph)"});
    // 矢印（上の点から下の点へ）と「toward 0.5」
    var ax = xm + 22, ay0 = p.y(ys), ay1 = p.y(ym);
    this.arrow = D.el("g", {opacity: 0}, p.svg);
    this.shaft = D.el("line", {x1: ax, y1: ay0, x2: ax, y2: ay0, stroke: "var(--emph)", "stroke-width": 3}, this.arrow);
    this.head = D.el("path", {d: "M-6,-9L0,0L6,-9Z", fill: "var(--emph)"}, this.arrow);
    this.ay = [ay0, ay1, ax];
    this.toward = D.mtext(p.svg, ax + 14, (ay0 + ay1) / 2 + 8, "toward 0.5", {fill: "var(--emph)", "font-size": 24, "font-weight": 700, "font-style": "italic", opacity: 0});
  }
  duration(k){ return k >= 1 ? 2 * this.props.split : 0; }
  cues(k){ return k >= 1 ? [this.props.split] : null; }
  render(k, t){
    var D = DECK, s = this.props.split, p = this.p;
    var A = k >= 1 ? D.prog(t, 0, s * 0.85) : 0;                 // 山の立ち上がり
    var sigOp = k >= 1 ? 0.35 + 0.65 * D.prog(t, 0, 0.4) : 0.35;
    var B1 = k >= 1 ? D.prog(t, s, 0.45) : 0;                    // σ(E[θ])
    var B2 = k >= 1 ? D.prog(t, s + 0.4, 0.45) : 0;              // E[σ(θ)]
    var B3 = k >= 1 ? D.prog(t, s + 0.75, 0.6) : 0;              // 矢印
    var B4 = k >= 1 ? D.prog(t, s + 1.05, 0.4) : 0;              // 「toward 0.5」
    var y0 = p.y(0);
    this.bump.setAttribute("transform", "translate(0," + (y0 * (1 - A)).toFixed(2) + ") scale(1," + Math.max(A, 1e-4).toFixed(4) + ")");
    this.bump.setAttribute("visibility", A > 0.002 ? "visible" : "hidden");   // 潰れた山を軸の上に残さない
    this.bumpLab.setAttribute("opacity", (k >= 1 ? D.prog(t, s * 0.6, 0.4) : 0).toFixed(3));
    this.sig.setAttribute("opacity", sigOp.toFixed(3));
    this.sigLab.setAttribute("opacity", sigOp.toFixed(3));
    this.muLine.setAttribute("opacity", B1.toFixed(3));
    this.gTop.setAttribute("opacity", B1.toFixed(3));
    this.gLow.setAttribute("opacity", B2.toFixed(3));
    var a0 = this.ay[0], a1 = this.ay[1], ye = D.lerp(a0, a1, B3);
    this.shaft.setAttribute("y2", Math.max(a0, ye - 6).toFixed(1));
    this.head.setAttribute("transform", "translate(" + this.ay[2] + "," + ye.toFixed(1) + ")");
    this.arrow.setAttribute("opacity", B3 > 0 ? 1 : 0);
    this.toward.setAttribute("opacity", B4.toFixed(3));
  }
});
