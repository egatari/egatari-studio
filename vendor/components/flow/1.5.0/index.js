// m-flow：流れ図の箱と矢印を段階ごとに出して、図を組み立てる
// <m-flow style="height:400px"><script type="application/json">
//   {"nodes":[{"id":"a","label":"観測 *w*","x":20,"y":40,"w":200,"h":70,"step":1}, …],
//    "edges":[{"from":"a","to":"b","step":2,"label":"更新"}]}
// （JSON の終わり）</m-flow>
// 座標は要素の箱の px（x, y は箱の左上）。箱は段階 step で現れ、矢印は同じ段階の箱の後に引く
// 箱の字は label（*斜体*、_下付き、^上付き、\n で改行）か tex（KaTeX）。tone は term / emph / muted
// お金・モノの流れ（ビジネスモデルの図）：edge の kind（money / service / data）で色と線種を決め、amount（金額など）を太字で添える。
// 同じ 2 つの箱の行きと帰りは shift（線に垂直にずらす px）で分ける。pulse の辺は、点の列が始点から終点へ流れる
// （pulse: true なら辺の段階に 1 回、[段階, …] ならその段階ごとに 1 回。位置は (k, t) だけで決まり、流れ終わると消える）
DECK.define("m-flow", class extends DECK.MotionElement {
  // データの形（kit/shape.js）。座標は要素の箱の px（x, y は箱の左上）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id", "x", "y", "w", "h"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, x: {type: "number"}, y: {type: "number"}, w: {type: "number"}, h: {type: "number"},
        step: {type: "integer"}, tone: {type: "string"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, step: {type: "integer"}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        kind: {enum: ["money", "service", "data"]}, amount: {type: ["string", "number"]}, shift: {type: "number"}, pulse: {type: ["boolean", "array"]}, offset: {type: "number"}, at: {type: "number"}}}}}},
    example: {nodes: [{id: "a", label: "観測", x: 20, y: 40, w: 200, h: 70, step: 1}, {id: "b", label: "更新", x: 320, y: 40, w: 200, h: 70, step: 2}], edges: [{from: "a", to: "b", step: 2}]},
  };
  static props = {
    fade: {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw: {type: "number", default: 0.6, doc: "矢印を引く秒数"},
    size: {type: "number", default: 26, doc: "箱の字の大きさ（px）"},
    "pulse-dur": {type: "number", default: 1.2, doc: "pulse の点が始点から終点まで流れる秒数"},
    "pulse-n":   {type: "number", default: 3, doc: "pulse で流れる点の数"},
    "label-gap": {type: "number", default: 12, doc: "辺の名前・金額と箱との最小の間（px）。近ければ線から離す"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var d = this.data || {}, m = 0;
    (d.nodes || []).concat(d.edges || []).forEach(function(x){ m = Math.max(m, x.step || 1); });
    // pulse の段階（[段階, …]）も数える
    (d.edges || []).forEach(function(x){ if (Array.isArray(x.pulse)) x.pulse.forEach(function(k){ m = Math.max(m, k); }); });
    return m;
  }
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data || {nodes: [], edges: []};
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var gE = D.el("g", {}, svg), gN = D.el("g", {}, svg);
    var tone = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"],
                muted: ["var(--muted)", "var(--bg)", "var(--fg)"]};   // muted：枠は --muted、字は --fg（字は情報。薄い字は投影で読めない）
    var byId = {};
    // 箱。段階の中の開始時刻 at（既定 0）
    this.nodes = (data.nodes || []).map(function(n){
      var c = tone[n.tone || "term"] || tone.term, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      var g = D.el("g", {opacity: 0}, gN);
      D.el("rect", {class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, g);
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
      // shift：線に垂直に（進む向きの右へ）ずらす。行きと帰りの 2 本を並べるときに使う
      if (e.shift){ var sx = -dy / L * e.shift, sy = dx / L * e.shift; p0 = [p0[0] + sx, p0[1] + sy]; p1 = [p1[0] + sx, p1[1] + sy]; }
      // kind：money（--emph の太線）、service（--term）、data（--muted の破線）。tone と dash を書けばそちらが勝つ
      var kind = {money: ["emph", false, 3.5], service: ["term", false, 2.5], data: ["muted", true, 2.5]}[e.kind] || [null, false, 2.5];
      var tn = e.tone || kind[0], dash = e.dash !== undefined ? e.dash : kind[1];
      var col = tn ? (tone[tn] || tone.term)[0] : "var(--fg)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = D.el("line", {x1: p0[0], y1: p0[1], x2: p0[0], y2: p0[1], stroke: col, "stroke-width": kind[2], "stroke-dasharray": dash ? "8 6" : "none"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = null, amt = null;
      // 線の中点から、線に垂直な向き（上か右）へずらして置く。amount は反対の側（label がなければ同じ側）に太字で
      var nx = -dy / L, ny = dx / L;
      if (ny > 0 || (ny === 0 && nx < 0)){ nx = -nx; ny = -ny; }
      // 字の箱が箱（node）に label-gap px より近いか図の外に出るなら、線から離していく（6 px ずつ、60 px まで）。
      // それでも離れなければ線の反対の側で同じように試す（label と amount が両側にあるときは自分の側だけ）。
      // 幅は字数から見積もる（和文 1 字 = 1 字幅、ほかは 0.6 字幅）ので、字の読み込みによらず同じ位置になる
      var side = function(sg, text, attrs, both){
        var fs = attrs["font-size"] || 24, base = e.offset !== undefined ? e.offset : 18, pos = null, anc0 = null;
        var w = [...text].reduce(function(a, ch){ return a + (/[\u0000-\u024f]/.test(ch) ? 0.6 : 1); }, 0) * fs;
        var sides = both ? [sg, -sg] : [sg];
        search: for (var si = 0; si < sides.length; si++){
          var sgn = sides[si], anc = Math.abs(nx) < 0.3 ? "middle" : nx * sgn > 0 ? "start" : "end";
          for (var extra = 0; extra <= 60; extra += 6){
            var off = (base + extra) * sgn, mx = (p0[0] + p1[0]) / 2 + nx * off, my = (p0[1] + p1[1]) / 2 + ny * off;
            var y = my + (ny * sgn < -0.3 ? 0 : ny * sgn > 0.3 ? 20 : 8);
            var x0 = anc === "start" ? mx : anc === "end" ? mx - w : mx - w / 2, gp = P["label-gap"];
            var hit = x0 < 0 || x0 + w > W || y - fs * 0.88 < 0 || y + fs * 0.22 > H || self.nodes.some(function(o){ var n = o.n;
              return x0 < n.x + n.w + gp && x0 + w > n.x - gp && y - fs * 0.88 < n.y + n.h + gp && y + fs * 0.22 > n.y - gp; });
            if (!pos){ pos = [mx, y]; anc0 = anc; }
            if (!hit){ pos = [mx, y]; anc0 = anc; break search; }
          }
        }
        return D.mtext(g, pos[0], pos[1], text, Object.assign({"text-anchor": anc0, "font-size": 24, opacity: 0}, attrs));
      };
      // shift でずらした辺は、ずらした側に書く（行きと帰りの字が同じ側に重ならない）
      var sg = e.shift && (-dy * nx + dx * ny) * e.shift < 0 ? -1 : 1;
      var hasAmt = e.amount !== undefined && e.amount !== "";
      if (e.label) lab = side(sg, e.label, {fill: tn ? col : "var(--fg)"}, !hasAmt);
      if (hasAmt) amt = side(e.label ? -sg : sg, String(e.amount), {fill: col, "font-weight": 700, "font-size": 26}, !e.label);
      var step = e.step || Math.max(a.step, b.step);
      // 同じ段階で出る箱があれば、その箱が出てから引く
      var after = Math.max(a.step === step ? a.at + P.fade * 0.6 : 0, b.step === step ? b.at + P.fade * 0.6 : 0);
      var at = e.at !== undefined ? e.at : after;
      // pulse の段階と開始時刻：辺の段階なら引き終わってから、ほかの段階なら pulseAt（既定 0.2 秒）から
      var pk = e.pulse === true ? [step] : Array.isArray(e.pulse) ? e.pulse : [];
      var pulses = pk.map(function(k){ return {k: k, at: e.pulseAt !== undefined ? e.pulseAt : k === step ? +(at + P.draw).toFixed(3) : 0.2}; });
      var dots = pulses.length ? Array.from({length: Math.max(1, P["pulse-n"])}, function(){ return D.el("circle", {r: kind[2] + 3.5, fill: col, stroke: "var(--bg)", "stroke-width": 2, opacity: 0}, gE); }) : [];
      return {g: g, line: line, head: head, lab: lab, amt: amt, p0: p0, p1: p1, ang: Math.atan2(dy, dx) * 180 / Math.PI, step: step, at: at, pulses: pulses, dots: dots};
    }).filter(Boolean);
  }
  // pulse の点の列が流れ終わるまでの長さ（点の間は 0.22 秒）
  pulseLen(){ return this.props["pulse-dur"] + 0.22 * (Math.max(1, this.props["pulse-n"]) - 1); }
  duration(k){
    var P = this.props, d = 0, pl = this.pulseLen();
    this.nodes.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.fade); });
    this.edges.forEach(function(o){
      if (o.step === k) d = Math.max(d, o.at + P.draw + (o.lab || o.amt ? 0.3 : 0));
      o.pulses.forEach(function(q){ if (q.k === k) d = Math.max(d, q.at + pl); });
    });
    return d;
  }
  // pulse の開始時刻を口述原稿の {cue} に合わせられる（pulse のない図はこれまでどおり null）
  cues(k){
    var c = [];
    this.edges.forEach(function(o){ o.pulses.forEach(function(q){ if (q.k === k && q.at > 0 && c.indexOf(q.at) < 0) c.push(q.at); }); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
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
      var lo = pr(o.step, o.at + P.draw * 0.8, 0.3).toFixed(3);
      if (o.lab) o.lab.setAttribute("opacity", lo);
      if (o.amt) o.amt.setAttribute("opacity", lo);
      // pulse：今の段階に pulse があれば、点の列を (t - 開始) から置く。流れ終わった点と t = Infinity では出さない
      var q = null;
      o.pulses.forEach(function(x){ if (x.k === k) q = x; });
      o.dots.forEach(function(dot, j){
        var u = q && t !== Infinity ? (t - q.at - 0.22 * j) / P["pulse-dur"] : -1;
        if (u <= 0 || u >= 1 || e < 1){ dot.setAttribute("opacity", 0); return; }
        var w = D.ease(u);
        dot.setAttribute("cx", D.lerp(o.p0[0], o.p1[0], w).toFixed(2)); dot.setAttribute("cy", D.lerp(o.p0[1], o.p1[1], w).toFixed(2));
        dot.setAttribute("opacity", Math.min(1, u * 8, (1 - u) * 8).toFixed(3));
      });
    });
  }
});
