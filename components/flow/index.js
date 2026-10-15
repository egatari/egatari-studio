// m-flow：流れ図の箱と矢印を段階ごとに出して、図を組み立てる
// <m-flow style="height:400px"><script type="application/json">
//   {"nodes":[{"id":"a","label":"観測 *w*","x":20,"y":40,"w":200,"h":70,"step":1}, …],
//    "edges":[{"from":"a","to":"b","step":2,"label":"更新"}]}
// （JSON の終わり）</m-flow>
// 座標は要素の箱の px（x, y は箱の左上）。箱は段階 step で現れ、矢印は同じ段階の箱の後に引く
// 箱の字は label（*斜体*、_下付き、^上付き、\n で改行）か tex（KaTeX）。tone は term / emph / muted
DECK.define("m-flow", class extends DECK.MotionElement {
  static props = {
    fade: {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw: {type: "number", default: 0.6, doc: "矢印を引く秒数"},
    size: {type: "number", default: 26, doc: "箱の字の大きさ（px）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var d = this.data || {}, m = 0;
    (d.nodes || []).concat(d.edges || []).forEach(function(x){ m = Math.max(m, x.step || 1); });
    return m;
  }
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data || {nodes: [], edges: []};
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var gE = D.el("g", {}, svg), gN = D.el("g", {}, svg);
    var tone = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"],
                muted: ["var(--muted)", "var(--bg)", "var(--muted)"]};
    var byId = {};
    // 箱。段階の中の開始時刻 at（既定 0）
    this.nodes = (data.nodes || []).map(function(n){
      var c = tone[n.tone || "term"] || tone.term, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      var g = D.el("g", {opacity: 0}, gN);
      D.el("rect", {x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, g);
      // svgMath の div は行の中の inline-block なので、上端にそろえないと親の行の高さの分だけ下へずれる
      if (n.tex) D.svgMath(g, cx, cy + P.size * 0.36, n.tex, {size: P.size, anchor: "middle", color: c[2], w: n.w, h: n.h}).firstChild.style.verticalAlign = "top";
      else {
        var lines = String(n.label || "").split("\n"), lh = P.size * 1.25, y0 = cy - (lines.length - 1) * lh / 2 + P.size * 0.36;
        lines.forEach(function(s, j){ D.mtext(g, cx, y0 + j * lh, s, {"text-anchor": "middle", "font-size": P.size, fill: c[2]}); });
      }
      var o = {g: g, cx: cx, cy: cy, n: n, step: n.step || 1, at: n.at || 0};
      byId[n.id] = o;
      return o;
    });
    // 矢印：箱の中心どうしを結ぶ線を、箱の縁で切る
    function edgePt(n, dx, dy, gap){
      var hw = n.w / 2 + gap, hh = n.h / 2 + gap;
      var s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return [n.x + n.w / 2 + dx * s, n.y + n.h / 2 + dy * s];
    }
    this.edges = (data.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b){ console.error("m-flow: unknown node", e.from, e.to); return null; }
      var dx = b.cx - a.cx, dy = b.cy - a.cy, L = Math.hypot(dx, dy) || 1;
      var p0 = edgePt(a.n, dx / L, dy / L, 6), p1 = edgePt(b.n, -dx / L, -dy / L, 6);
      var col = e.tone ? (tone[e.tone] || tone.term)[0] : "var(--fg)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = D.el("line", {x1: p0[0], y1: p0[1], x2: p0[0], y2: p0[1], stroke: col, "stroke-width": 2.5, "stroke-dasharray": e.dash ? "8 6" : "none"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = null;
      if (e.label){
        // 線の中点から、線に垂直な向き（上か右）へずらして置く
        var nx = -dy / L, ny = dx / L;
        if (ny > 0 || (ny === 0 && nx < 0)){ nx = -nx; ny = -ny; }
        var off = e.offset !== undefined ? e.offset : 18, mx = (p0[0] + p1[0]) / 2 + nx * off, my = (p0[1] + p1[1]) / 2 + ny * off;
        var anc = Math.abs(nx) < 0.3 ? "middle" : nx > 0 ? "start" : "end";
        lab = D.mtext(g, mx, my + (ny < -0.3 ? 0 : 8), e.label, {"text-anchor": anc, "font-size": 24, fill: e.tone ? col : "var(--muted)", opacity: 0});
      }
      var step = e.step || Math.max(a.step, b.step);
      // 同じ段階で出る箱があれば、その箱が出てから引く
      var after = Math.max(a.step === step ? a.at + P.fade * 0.6 : 0, b.step === step ? b.at + P.fade * 0.6 : 0);
      return {g: g, line: line, head: head, lab: lab, p0: p0, p1: p1, ang: Math.atan2(dy, dx) * 180 / Math.PI, step: step, at: e.at !== undefined ? e.at : after};
    }).filter(Boolean);
  }
  duration(k){
    var P = this.props, d = 0;
    this.nodes.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.fade); });
    this.edges.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.draw + (o.lab ? 0.3 : 0)); });
    return d;
  }
  render(k, t){
    var P = this.props, D = DECK;
    var pr = function(step, at, dur){ return step < k ? 1 : step > k ? 0 : D.prog(t, at, dur); };
    this.nodes.forEach(function(o){
      var e = pr(o.step, o.at, P.fade), s = D.lerp(0.92, 1, e);
      o.g.setAttribute("opacity", e.toFixed(3));
      o.g.setAttribute("transform", "translate(" + o.cx + " " + o.cy + ") scale(" + s.toFixed(4) + ") translate(" + (-o.cx) + " " + (-o.cy) + ")");
    });
    this.edges.forEach(function(o){
      var e = pr(o.step, o.at, P.draw);
      var tx = D.lerp(o.p0[0], o.p1[0], e), ty = D.lerp(o.p0[1], o.p1[1], e);
      var L = Math.hypot(o.p1[0] - o.p0[0], o.p1[1] - o.p0[1]) || 1, back = Math.min(14, e * L);
      // 線は矢じりの根元まで。矢じりは線の先端について動く
      o.line.setAttribute("x2", (tx - (o.p1[0] - o.p0[0]) / L * back).toFixed(2));
      o.line.setAttribute("y2", (ty - (o.p1[1] - o.p0[1]) / L * back).toFixed(2));
      // 矢じりは線が 20px 伸びるまでに大きくなる（始めに箱からはみ出さない）
      var hs = Math.min(1, e * L / 20);
      o.head.setAttribute("transform", "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ") rotate(" + o.ang.toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      o.g.setAttribute("opacity", e > 0 ? 1 : 0);
      if (o.lab) o.lab.setAttribute("opacity", pr(o.step, o.at + P.draw * 0.8, 0.3).toFixed(3));
    });
  }
});
