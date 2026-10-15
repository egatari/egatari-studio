// m-curves：同じ座標軸に線を 1 本ずつ引く。線の名前は凡例でなく線の端に直接書く
// <m-curves xr="[-3,3]" yr="[0,0.5]" xt="[-2,0,2]" yt="[0,0.2,0.4]" xl="*y*" yl="密度" style="height:380px">
//   <script type="application/json">[{"label":"予測分布","f":"N(x,0,1)"},{"label":"中央値","pts":[[0,0],[0,0.4]],"dash":true}]
//   （JSON の終わり）</m-curves>
// 段階 j（1〜系列の数）で j 本目の線を引く。f は x の式（Math の関数と N(x,平均,標準偏差) が使える）、pts は点列
DECK.define("m-curves", class extends DECK.MotionElement {
  static props = {
    xr: {type: "json", default: [0, 1], doc: "横軸の範囲"}, yr: {type: "json", default: [0, 1], doc: "縦軸の範囲"},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    n:   {type: "number", default: 300, doc: "f を描く分割数"},
    dur: {type: "number", default: 1.0, doc: "1 本を引く秒数"},
    lw:  {type: "number", default: 3.5, doc: "線の太さ"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : (this.data || []).length; }
  mount(){
    var P = this.props, D = DECK, self = this, S = this.data || [];
    this.classList.add("plot"); this.style.display = "block";
    var p = this.p = D.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xf: P.xf, yf: P.yf, xl: P.xl, yl: P.yl, m: {l: 86, r: 24, t: 24, b: 64}});
    var uid = "mc" + (++D.Plot.n), defs = D.el("defs", {}, p.svg);
    var N = function(x, m, s){ return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); };
    var x0 = p.m.l, x1 = p.W - p.m.r, y0 = p.m.t, y1 = p.H - p.m.b;
    // 系列ごとに：点列、線、（破線なら）描く範囲の mask、端の名前
    this.items = S.map(function(s, i){
      var pts;
      if (s.pts) pts = s.pts.map(function(q){ return [p.x(q[0]), p.y(q[1])]; });
      else {
        var g = new Function("x", "N", "with(Math){return " + s.f + ";}"), a = s.xr ? s.xr[0] : P.xr[0], b = s.xr ? s.xr[1] : P.xr[1];
        pts = [];
        for (var j = 0; j <= P.n; j++){ var v = a + (b - a) * j / P.n; pts.push([p.x(v), p.y(g(v, N))]); }
      }
      var d = pts.map(function(q, j){ return (j ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("");
      var col = colorOf(s.color, i);
      var it = {};
      if (s.dash){
        // 破線は dasharray を描画に使えないので、同じ線を mask にして引く
        var mk = D.el("mask", {id: uid + "m" + i, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: p.W, height: p.H}, defs);
        it.mpath = D.el("path", {d: d, fill: "none", stroke: "#fff", "stroke-width": P.lw + 6, pathLength: 1, "stroke-dasharray": "1 2"}, mk);
        var gg = D.el("g", {mask: "url(#" + uid + "m" + i + ")", "clip-path": p.clip}, p.svg);
        it.path = D.el("path", {d: d, fill: "none", stroke: col, "stroke-width": P.lw, "stroke-dasharray": "10 8", "stroke-linecap": "butt"}, gg);
        it.draw = it.mpath;
      } else {
        it.path = D.el("path", {d: d, fill: "none", stroke: col, "stroke-width": P.lw, "clip-path": p.clip, pathLength: 1, "stroke-dasharray": "1 2", "stroke-linejoin": "round"}, p.svg);
        it.draw = it.path;
      }
      // 名前の位置：at（横軸の値）の点、なければ描画範囲の中の最後の点
      var inside = pts.filter(function(q){ return q[0] >= x0 - .5 && q[0] <= x1 + .5 && q[1] >= y0 - .5 && q[1] <= y1 + .5; });
      var end = inside.length ? inside[inside.length - 1] : pts[pts.length - 1];
      if (s.at !== undefined){
        var ax = p.x(s.at), best = pts[0];
        pts.forEach(function(q){ if (Math.abs(q[0] - ax) < Math.abs(best[0] - ax)) best = q; });
        end = best;
      }
      var anchor = s.anchor || (end[0] > x1 - 160 ? "end" : "start");
      it.lx = end[0] + (anchor === "end" ? -8 : anchor === "start" ? 10 : 0) + (s.dx || 0);
      it.ly = (s.ly !== undefined ? p.y(s.ly) : end[1] - 12) + (s.dy || 0);
      // 字の幅の見積もり（記法の * _ ^ を除く。全角 26px、半角 15px）
      var w = 0; String(s.label || "").replace(/[*_^]/g, "").split("").forEach(function(ch){ w += ch.charCodeAt(0) > 255 ? 26 : 15; });
      it.x0 = anchor === "end" ? it.lx - w : anchor === "middle" ? it.lx - w / 2 : it.lx; it.x1 = it.x0 + w;
      it.anchor = anchor; it.col = col; it.label = s.label || "";
      return it;
    });
    // 名前どうしが重ならないように、横に重なる名前を下へずらす
    var min = 32, g = self.items.filter(function(it){ return it.label; }).sort(function(u, v){ return u.ly - v.ly; });
    g.forEach(function(it, j){
      for (var q = 0; q < j; q++){
        var o = g[q];
        if (it.x0 < o.x1 && o.x0 < it.x1 && it.ly - o.ly < min) it.ly = o.ly + min;
      }
    });
    this.items.forEach(function(it){
      it.lab = D.mtext(p.svg, it.lx, Math.max(26, it.ly), it.label, {"text-anchor": it.anchor, fill: it.col, "font-size": 26, "font-weight": 700, opacity: 0});
    });
    function colorOf(c, i){
      if (!c) return "var(--series-" + (i % 4 + 1) + ")";
      return c.indexOf("var(") === 0 ? c : "var(--" + c.replace(/^--/, "") + ")";
    }
  }
  duration(k){ return k >= 1 ? this.props.dur * 0.7 + 0.6 : 0; }
  render(k, t){
    var dur = this.props.dur;
    this.items.forEach(function(it, i){
      var pd = i < k - 1 ? 1 : i === k - 1 ? DECK.prog(t, 0, dur) : 0;
      var pl = i < k - 1 ? 1 : i === k - 1 ? DECK.prog(t, dur * 0.7, 0.6) : 0;
      it.draw.setAttribute("stroke-dashoffset", (1 - pd).toFixed(4));
      it.path.setAttribute("opacity", pd > 0 ? 1 : 0);
      it.lab.setAttribute("opacity", pl.toFixed(3));
    });
  }
});
