// m-collect：並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる
// <m-collect style="height:400px"><script type="application/json">
//   {"chips":[{"label":"回答 1","to":[0,1]}, …], "targets":[{"label":"事後平均","tex":"\\mu_n"}, …], "cols":4}
// （JSON の終わり）</m-collect>
// 段階 1 で、札 i が targets[to] へ動く（to は番号か番号の配列。配列なら札の写しがそれぞれへ動く）。
// 箱は始めに点線の枠だけ出し、札が着いてから中身（label / tex / value）を出す
DECK.define("m-collect", class extends DECK.MotionElement {
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["chips", "targets"], properties: {
      chips: {type: "array", minItems: 1, items: {type: "object", required: ["to"], properties: {label: {type: "string"}, to: {type: ["integer", "array"], items: {type: "integer"}}}}},
      targets: {type: "array", minItems: 1, items: {type: "object", properties: {label: {type: "string"}, tex: {type: "string"}, value: {type: ["string", "number"]}, tone: {type: "string"}, x: {type: "number"}, y: {type: "number"}}}},
      cols: {type: "integer"}}},
    example: {chips: [{label: "表", to: 0}, {label: "裏", to: 1}], targets: [{label: "表の数"}, {label: "裏の数"}], cols: 2},
  };
  static steps = 1;
  static props = {
    move:    {type: "number", default: 0.9, doc: "札 1 枚が動く秒数"},
    stagger: {type: "number", default: 0.08, doc: "札ごとの出発のずれ（秒）"},
    shrink:  {type: "number", default: 0.35, doc: "着いたときの札の縮尺"},
    "chip-w": {type: "number", default: 0, doc: "札の幅（0 なら列の数から決める）"},
    "chip-h": {type: "number", default: 56, doc: "札の高さ"},
    "box-w":  {type: "number", default: 260, doc: "箱の幅"},
    "box-h":  {type: "number", default: 110, doc: "箱の高さ"},
  };
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data || {chips: [], targets: []};
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var tone = {term: ["var(--term)", "var(--term-tint)"], emph: ["var(--emph)", "var(--emph-tint)"], muted: ["var(--muted)", "var(--bg)"]};
    // 札の並び：上の段に cols 列で並べる
    var C = data.chips || [], n = C.length, cols = data.cols || n, rows = Math.ceil(n / cols), gap = 14;
    var cw = P["chip-w"] || Math.min(220, (W - gap * (cols - 1)) / cols), ch = P["chip-h"];
    var gx = (W - (cw * cols + gap * (cols - 1))) / 2;
    // 箱の並び：下の段に等間隔（x, y を書けばその位置。中心の座標）
    var T = data.targets || [], bw = P["box-w"], bh = P["box-h"];
    this.targets = T.map(function(tg, j){
      var cx = tg.x !== undefined ? tg.x : W * (j + 1) / (T.length + 1), cy = tg.y !== undefined ? tg.y : H - bh / 2 - 4;
      var c = tone[tg.tone || "emph"] || tone.emph;
      var frame = D.el("rect", {x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh, rx: 12, fill: "none", stroke: "var(--line)", "stroke-width": 2, "stroke-dasharray": "8 6", opacity: 0}, svg);
      var g = D.el("g", {opacity: 0}, svg);
      D.el("rect", {x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh, rx: 12, fill: c[1], stroke: c[0], "stroke-width": 3}, g);
      var hasV = tg.value !== undefined, ly = cy + (hasV ? -16 : 9);
      if (tg.tex) D.svgMath(g, cx, ly + 4, tg.tex, {size: 30, anchor: "middle", color: c[0], w: bw, h: 50}).firstChild.style.verticalAlign = "top";
      else D.mtext(g, cx, ly, tg.label || "", {"text-anchor": "middle", "font-size": 28, "font-weight": 700, fill: c[0]});
      if (hasV) D.mtext(g, cx, cy + 38, String(tg.value), {"text-anchor": "middle", "font-size": 24, fill: "var(--fg)"});
      if (tg.tex && tg.label) D.mtext(g, cx, cy + bh / 2 + 32, tg.label, {"text-anchor": "middle", "font-size": 24, fill: "var(--muted)"});
      return {frame: frame, g: g, cx: cx, cy: cy, col: c, last: 0};
    });
    // 札と、行き先ごとの写し
    this.chips = [];
    C.forEach(function(cp, i){
      var r = Math.floor(i / cols), q = i % cols;
      var x = gx + q * (cw + gap) + cw / 2, y = 4 + ch / 2 + r * (ch + gap);
      var to = Array.isArray(cp.to) ? cp.to : [cp.to === undefined ? 0 : cp.to];
      var start = i * P.stagger;
      to.forEach(function(j){
        var tg = self.targets[j]; if (!tg) return;
        var c = tone[cp.tone || "term"] || tone.term;
        var g = D.el("g", {}, svg);
        D.el("rect", {x: -cw / 2, y: -ch / 2, width: cw, height: ch, rx: 8, fill: c[1], stroke: c[0], "stroke-width": 2}, g);
        D.mtext(g, 0, 9, cp.label || "", {"text-anchor": "middle", "font-size": 24});
        tg.last = Math.max(tg.last, start + P.move);
        self.chips.push({g: g, x0: x, y0: y, x1: tg.cx, y1: tg.cy, start: start});
      });
    });
    this.rows = rows;
  }
  duration(k){ var d = 0; this.targets.forEach(function(tg){ d = Math.max(d, tg.last + 0.3); }); return k >= 1 ? d : 0; }
  render(k, t){
    var P = this.props, D = DECK;
    var T = k < 1 ? -Infinity : t;   // 段階 0 は動く前
    var pr = function(start, dur){ return T === -Infinity ? 0 : D.prog(T, start, dur); };
    this.chips.forEach(function(c){
      var e = pr(c.start, P.move);
      // 少し持ち上げてから落ちる弧（中点で上へ 40px）
      var x = D.lerp(c.x0, c.x1, e), y = D.lerp(c.y0, c.y1, e) - Math.sin(Math.PI * e) * 40;
      var s = D.lerp(1, P.shrink, e), op = e < 0.75 ? 1 : 1 - (e - 0.75) / 0.25;
      c.g.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") scale(" + s.toFixed(4) + ")");
      c.g.setAttribute("opacity", op.toFixed(3));
    });
    this.targets.forEach(function(tg){
      tg.frame.setAttribute("opacity", (pr(0, 0.3) * (1 - pr(tg.last - 0.1, 0.3))).toFixed(3));
      var e = pr(tg.last - 0.15, 0.45);
      tg.g.setAttribute("opacity", e.toFixed(3));
      var s = D.lerp(0.9, 1, e);
      tg.g.setAttribute("transform", "translate(" + tg.cx + " " + tg.cy + ") scale(" + s.toFixed(4) + ") translate(" + (-tg.cx) + " " + (-tg.cy) + ")");
    });
  }
});
