// m-pipeline：ロジットのノイズのモデルを 3 本の横の線で見せる。真のロジット θ* → 観測されたロジット θ̂ = θ* + ε → 予測 p̂ = σ(θ̂)
// <m-pipeline style="height:300px"><script type="application/json">{{JSON:pipeline.json}}</script></m-pipeline>
// data = {tau, theta_star:[…], eps:[…], range:[-6,6]}（scripts/make_data.py）
// 段階 1：θ* の線に点が現れる／段階 2：点が θ̂ の線へ落ち、ε だけ横にずれる／段階 3：点が p̂ の線へ落ち、σ で両端に寄る
// 前の線には点を薄く残す
DECK.define("m-pipeline", class extends DECK.MotionElement {
  static steps = 3;
  static props = {
    span: {type: "number", default: 1.5, doc: "ロジットの線の横の範囲（data.range の何倍か。θ̂ は range をはみ出すため）"},
    left: {type: "number", default: 270, doc: "左の名前の欄の幅（px）"},
    dur:  {type: "number", default: 1.4, doc: "段階 2・3 の動きの秒数"},
  };
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data;
    this.classList.add("plot"); this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, class: "plotsvg"}, this);
    var r = data.range, a = r[0] * P.span, b = r[1] * P.span, x0 = P.left, x1 = W - 24;
    this.xl = function(v){ return x0 + (v - a) / (b - a) * (x1 - x0); };       // ロジットの線
    this.xp = function(v){ return x0 + v * (x1 - x0); };                        // 確率の線（同じ幅）
    var top = 80, gap = (H - top - 40) / 2;                                    // 点は線の上に積むので、上を空ける
    this.ys = [top, top + gap, top + 2 * gap];
    var names = [["true logit", "\\theta^*"], ["observed logit", "\\hat\\theta"], ["prediction", "\\hat p"]];
    var axes = D.el("g", {class: "axes"}, svg);
    this.ys.forEach(function(y, j){
      D.el("line", {x1: x0, y1: y, x2: x1, y2: y, stroke: "var(--fg)", "stroke-width": 1.5}, axes);
      var ticks = j < 2 ? [r[0] * P.span, r[0], 0, r[1], r[1] * P.span] : [0, 0.5, 1];
      ticks.forEach(function(v){
        var x = j < 2 ? self.xl(v) : self.xp(v), s = String(v).replace("-", "−");
        if (j < 2 && Math.abs(v) > Math.abs(r[1]) + 1e-9) return;        // 端の目盛りは数字を出さない
        if (j === 0){ D.el("line", {x1: x, y1: y, x2: x, y2: y + 6, stroke: "var(--fg)", "stroke-width": 1.5}, axes); return; }   // θ* は θ̂ と同じ目盛りなので数字は θ̂ の線だけ
        D.el("line", {x1: x, y1: y, x2: x, y2: y + 6, stroke: "var(--fg)", "stroke-width": 1.5}, axes);
        D.mtext(axes, x, y + 29, s, {"text-anchor": "middle", fill: "var(--muted)"});
      });
      D.mtext(axes, 0, y + 9, names[j][0], {"font-size": 26});
      D.svgMath(axes, x0 - 18, y + 9, names[j][1], {size: 30, anchor: "end"});
    });
    // 点：線の上に積み上げる（同じあたりの値が多いほど高く積まれる。ドットプロット）
    var n = Math.min(data.theta_star.length, data.eps.length), R = 7, X = [[], [], []];
    for (var i = 0; i < n; i++){
      var ts = data.theta_star[i], th = ts + data.eps[i];
      X[0].push(this.xl(ts)); X[1].push(this.xl(Math.max(a, Math.min(b, th)))); X[2].push(this.xp(1 / (1 + Math.exp(-th))));
    }
    var lift = X.map(function(xs, j){ return self.stack(xs, R, j ? gap - 14 : self.ys[0] - 16); });
    this.dots = [];
    var gG = D.el("g", {}, svg), gC = D.el("g", {}, svg);                         // 薄い点は動く点より下に
    for (i = 0; i < n; i++){
      var g = D.el("circle", {r: R, fill: "var(--muted)", opacity: 0}, gG);   // 前の線に残す薄い点
      var g2 = D.el("circle", {r: R, fill: "var(--muted)", opacity: 0}, gG);
      var c = D.el("circle", {r: R, "stroke-width": 1.5, style: "stroke:var(--bg)"}, gC);
      this.dots.push({c: c, g1: g, g2: g2, x: [X[0][i], X[1][i], X[2][i]], y: [0, 1, 2].map(function(j){ return self.ys[j] - R - 1 - lift[j][i]; }),
                      ord: (X[0][i] - x0) / (x1 - x0)});
    }
  }
  // 横の位置 xs の点を、重ならないように下から積む高さ（最大 hmax。超えるときは詰める）
  stack(xs, R, hmax){
    var idx = xs.map(function(_, i){ return i; }).sort(function(u, v){ return xs[u] - xs[v]; }), placed = [], h = new Array(xs.length).fill(0);
    idx.forEach(function(i){
      var lv = 0;
      for (;;){
        var y = lv * R * 1.6, ok = placed.every(function(q){ var dx = xs[i] - q[0], dy = y - q[1]; return dx * dx + dy * dy >= 4 * R * R * 0.92; });
        if (ok) break;
        lv++;
      }
      h[i] = lv * R * 1.6; placed.push([xs[i], h[i]]);
    });
    var top = Math.max.apply(null, h), k = top > hmax ? hmax / top : 1;
    return h.map(function(v){ return v * k; });
  }
  duration(k){ return k === 1 ? 1.3 : k >= 2 ? this.props.dur : 0; }
  render(k, t){
    var D = DECK, dur = this.props.dur;
    this.dots.forEach(function(d){
      var x, y, op = 1, s = 1, mix = 0, g1 = 0, g2 = 0;
      if (k === 0){ op = 0; x = d.x[0]; y = d.y[0]; }
      else if (k === 1){ var e = D.prog(t, d.ord * 0.9, 0.35); op = e; s = 0.4 + 0.6 * e; x = d.x[0]; y = d.y[0]; }
      else if (k === 2){
        var f = D.prog(t, 0, dur * 0.45), h = D.prog(t, dur * 0.4, dur * 0.6);
        x = D.lerp(d.x[0], d.x[1], h); y = D.lerp(d.y[0], d.y[1], f); g1 = f;
      } else {
        var f3 = D.prog(t, 0, dur * 0.55), h3 = D.prog(t, dur * 0.15, dur * 0.85);
        x = D.lerp(d.x[1], d.x[2], h3); y = D.lerp(d.y[1], d.y[2], f3); g1 = 1; g2 = f3; mix = h3;
      }
      d.c.setAttribute("cx", x.toFixed(1)); d.c.setAttribute("cy", y.toFixed(1));
      d.c.setAttribute("r", (7 * s).toFixed(2));
      d.c.setAttribute("opacity", op.toFixed(3));
      d.c.style.fill = "color-mix(in oklab, var(--emph) " + (mix * 100).toFixed(1) + "%, var(--term))";
      d.g1.setAttribute("cx", d.x[0].toFixed(1)); d.g1.setAttribute("cy", d.y[0].toFixed(1));
      d.g1.setAttribute("opacity", (0.35 * g1).toFixed(3));
      d.g2.setAttribute("cx", d.x[1].toFixed(1)); d.g2.setAttribute("cy", d.y[1].toFixed(1));
      d.g2.setAttribute("opacity", (0.35 * g2).toFixed(3));
    });
  }
});
