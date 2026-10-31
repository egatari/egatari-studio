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
// 流れ図の判断：node の shape: "diamond"（箱の x, y, w, h に内接するひし形）。はい／いいえは出ていく辺の label
// 戻る辺：edge の loop（true / "left" / "right" / "top" / "bottom"）。箱の横から出て、間の箱の外側を回って戻り先の箱の横に入る
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 式（tex）は組み立てのときに KaTeX で描く（spec §6.2）：build.fields の nodes[].tex を作り手が描いて texHtml を足し、
// この部品は markup-reader で決まった要素と属性だけを読んで置く（再生のときに KaTeX は動かない）。描いた結果がなければ tex を字のまま出して知らせる。
// 知らないデータ（loop の値、ない箱を指す辺）は ctx.report で知らせる（1.x の console.warn / console.error の代わり）
egatariParts.define({name: "flow", version: "2.0.1", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-flow"}, function(deps){
"use strict";
var base = deps.base, MR = deps["markup-reader"];
return class extends base.MotionElement {
  static partName = "flow";   // the registry name (define meta name), for report prefixes
  // 組み立てのときに描く欄（spec §6.2）。式の意味は字（tex）でも持つので、KaTeX の出力は HTML だけ
  static build = {fields: {"nodes[].tex": "katex"}, options: {katex: {output: "html"}}};
  // データの形（kit/shape.js）。座標は要素の箱の px（x, y は箱の左上）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id", "x", "y", "w", "h"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, texHtml: {type: "string"}, x: {type: "number"}, y: {type: "number"}, w: {type: "number"}, h: {type: "number"},
        step: {type: "integer"}, tone: {type: "string"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, step: {type: "integer"}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        kind: {enum: ["money", "service", "data"]}, amount: {type: ["string", "number"]}, shift: {type: "number"}, pulse: {type: ["boolean", "array"]}, offset: {type: "number"}, at: {type: "number"}}}},
      renderers: {type: "object"}}},
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
  mount(ctx){
    var P = this.props, D = base, self = this, data = this.data || {nodes: [], edges: []}, sk = MR.sink(this, ctx);
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
      if (n.shape === "diamond") D.el("polygon", {class: "box", points: [cx, n.y, n.x + n.w, cy, cx, n.y + n.h, n.x, cy].join(" "), "stroke-linejoin": "round", fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, g);
      else D.el("rect", {class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, g);
      // 式の div は行の中の inline-block なので、上端にそろえないと親の行の高さの分だけ下へずれる
      if (n.tex) MR.texFrame(g, cx, cy + P.size * 0.36, n, "tex", {size: P.size, anchor: "middle", color: c[2], w: n.w, h: n.h}, sk).firstChild.style.verticalAlign = "top";
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
      // ひし形は |dx| / hw + |dy| / hh = 1 の上で切る
      var s = n.shape === "diamond" ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh) : Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return [n.x + n.w / 2 + dx * s, n.y + n.h / 2 + dy * s];
    }
    // 戻る辺の道：箱の side の側の辺の中点から出て、両端の間にある箱（と両端）の外側 28 px を回り、戻り先の同じ側に入る
    function loopRoute(lp, A, B){
      var sd = lp === true ? (Math.abs(B.y + B.h / 2 - A.y - A.h / 2) >= Math.abs(B.x + B.w / 2 - A.x - A.w / 2) ? "right" : "bottom") : lp;
      if (!/^(left|right|top|bottom)$/.test(sd)){ ctx.report("data", "[flow] loop=" + JSON.stringify(lp) + " is not true, left, right, top or bottom (right is used)"); sd = "right"; }
      var hz = sd === "left" || sd === "right", sg = sd === "right" || sd === "bottom" ? 1 : -1;
      var out = function(n){ return hz ? [sg > 0 ? n.x + n.w + 6 : n.x - 6, n.y + n.h / 2] : [n.x + n.w / 2, sg > 0 ? n.y + n.h + 6 : n.y - 6]; };
      var q0 = out(A), q1 = out(B), j = hz ? 1 : 0, lo = Math.min(q0[j], q1[j]), hi = Math.max(q0[j], q1[j]);
      var ch = sg > 0 ? Math.max(q0[1 - j], q1[1 - j]) : Math.min(q0[1 - j], q1[1 - j]);
      self.nodes.forEach(function(o){
        var n = o.n, a0 = hz ? n.y : n.x, a1 = hz ? n.y + n.h : n.x + n.w;
        if (a1 < lo - 12 || a0 > hi + 12) return;
        var f = hz ? (sg > 0 ? n.x + n.w : n.x) : (sg > 0 ? n.y + n.h : n.y);
        ch = sg > 0 ? Math.max(ch, f + 6) : Math.min(ch, f - 6);
      });
      ch += sg * 28;
      var pts = hz ? [q0, [ch, q0[1]], [ch, q1[1]], q1] : [q0, [q0[0], ch], [q1[0], ch], q1];
      return {pts: pts, poly: self.poly(pts), hz: hz, sg: sg, ch: ch};
    }
    // 線の形を先に全部決める（辺の字は、ほかの辺の線と先に置いた字を避けて置くので）
    var es = data.edges || [];
    // 同じ 2 つの箱の行きと帰りで、どちらも shift も loop も書いていなければ、それぞれ 10 px ずらす（2 本の間は 20 px）
    var autoShift = function(e){
      return !e.shift && !e.loop && es.some(function(f){ return f !== e && f.from === e.to && f.to === e.from && !f.shift && !f.loop; });
    };
    var geo = es.map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return null;
      var dx = b.cx - a.cx, dy = b.cy - a.cy, L = Math.hypot(dx, dy) || 1;
      var p0 = edgePt(a.n, dx / L, dy / L, 6), p1 = edgePt(b.n, -dx / L, -dy / L, 6), route = null;
      if (e.loop) route = loopRoute(e.loop, a.n, b.n);
      if (route){ p0 = route.pts[0]; p1 = route.pts[3]; }
      // shift：線に垂直に（進む向きの右へ）ずらす。行きと帰りの 2 本を並べるときに使う
      var sh = e.shift || (autoShift(e) ? 10 : 0);
      if (sh){ var sx = -dy / L * sh, sy = dx / L * sh; p0 = [p0[0] + sx, p0[1] + sy]; p1 = [p1[0] + sx, p1[1] + sy]; }
      return {a: a, b: b, dx: dx, dy: dy, L: L, p0: p0, p1: p1, route: route, shift: sh};
    });
    // 線分（戻る辺は折れ線の 3 本）と、置いた字の箱 [x0, y0, x1, y1]
    var segs = geo.map(function(q){ return !q ? [] : q.route ? [0, 1, 2].map(function(i){ return [q.route.pts[i], q.route.pts[i + 1]]; }) : [[q.p0, q.p1]]; });
    var boxes = [];
    this.edges = es.map(function(e, ei){
      var q = geo[ei];
      if (!q){ ctx.report("data", "[flow] an edge refers to an unknown node: " + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + " (not drawn)"); return null; }
      var a = q.a, b = q.b, dx = q.dx, dy = q.dy, L = q.L, p0 = q.p0, p1 = q.p1, route = q.route;
      var others = [].concat.apply([], segs.filter(function(_, j){ return j !== ei; }));
      // kind：money（--emph の太線）、service（--term）、data（--muted の破線）。tone と dash を書けばそちらが勝つ
      var kind = {money: ["emph", false, 3.5], service: ["term", false, 2.5], data: ["muted", true, 2.5]}[e.kind] || [null, false, 2.5];
      var tn = e.tone || kind[0], dash = e.dash !== undefined ? e.dash : kind[1];
      var col = tn ? (tone[tn] || tone.term)[0] : "var(--fg)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = route ? D.el("path", {d: "", fill: "none", "stroke-linejoin": "round", stroke: col, "stroke-width": kind[2], "stroke-dasharray": dash ? "8 6" : "none"}, g)
        : D.el("line", {x1: p0[0], y1: p0[1], x2: p0[0], y2: p0[1], stroke: col, "stroke-width": kind[2], "stroke-dasharray": dash ? "8 6" : "none"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = null, amt = null;
      // 線の中点から、線に垂直な向き（上か右）へずらして置く。amount は反対の側（label がなければ同じ側）に太字で
      var nx = -dy / L, ny = dx / L;
      if (ny > 0 || (ny === 0 && nx < 0)){ nx = -nx; ny = -ny; }
      // 字の箱が箱（node）に label-gap px より近いか、図の外に出るか、ほかの辺の線（4 px の間をとる）か先に置いた字に
      // かかるか、自分の線とのあいだにほかの辺の線が入るなら、線から離していく（6 px ずつ、60 px まで）。
      // それでも置けなければ線の反対の側で同じように試す（label は amount があるときは自分の側だけ。amount は両側）。
      // どこにも置けなければ最初の位置に置いて知らせる（layout）。
      // 幅は字数から見積もる（和文 1 字 = 1 字幅、ほかは 0.6 字幅）ので、字の読み込みによらず同じ位置になる
      var mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      var side = function(sg, text, attrs, both){
        var fs = attrs["font-size"] || 24, base = e.offset !== undefined ? e.offset : 18, pos = null, anc0 = null, box0 = null, free = false;
        var w = [...text].reduce(function(a, ch){ return a + (/[\u0000-\u024f]/.test(ch) ? 0.6 : 1); }, 0) * fs;
        var sides = both ? [sg, -sg] : [sg];
        search: for (var si = 0; si < sides.length; si++){
          var sgn = sides[si], anc = Math.abs(nx) < 0.3 ? "middle" : nx * sgn > 0 ? "start" : "end";
          for (var extra = 0; extra <= 60; extra += 6){
            var off = (base + extra) * sgn, mx = (p0[0] + p1[0]) / 2 + nx * off, my = (p0[1] + p1[1]) / 2 + ny * off;
            var y = my + (ny * sgn < -0.3 ? 0 : ny * sgn > 0.3 ? 20 : 8);
            var x0 = anc === "start" ? mx : anc === "end" ? mx - w : mx - w / 2, gp = P["label-gap"];
            var bx = [x0, y - fs * 0.88, x0 + w, y + fs * 0.22], c = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
            var hit = x0 < 0 || x0 + w > W || y - fs * 0.88 < 0 || y + fs * 0.22 > H || self.nodes.some(function(o){ var n = o.n;
              return x0 < n.x + n.w + gp && x0 + w > n.x - gp && y - fs * 0.88 < n.y + n.h + gp && y + fs * 0.22 > n.y - gp; }) ||
              boxes.some(function(r){ return bx[0] < r[2] + 4 && bx[2] > r[0] - 4 && bx[1] < r[3] + 4 && bx[3] > r[1] - 4; }) ||
              others.some(function(sgm){ return segHitsBox(sgm, [bx[0] - 4, bx[1] - 4, bx[2] + 4, bx[3] + 4]) || segsCross(sgm, [mid, c]); });
            if (!pos){ pos = [mx, y]; anc0 = anc; box0 = bx; }
            if (!hit){ pos = [mx, y]; anc0 = anc; box0 = bx; free = true; break search; }
          }
        }
        if (!free) ctx.report("layout", "[flow] no free place for the edge text " + JSON.stringify(text) + " (" + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + "): it touches a box, a line or another text; move the boxes apart or set offset");
        boxes.push(box0);
        return D.mtext(g, pos[0], pos[1], text, Object.assign({"text-anchor": anc0, "font-size": 24, opacity: 0}, attrs));
      };
      // shift でずらした辺は、ずらした側に書く（行きと帰りの字が同じ側に重ならない）
      var sg = q.shift && (-dy * nx + dx * ny) * q.shift < 0 ? -1 : 1;
      var hasAmt = e.amount !== undefined && e.amount !== "";
      // 戻る辺の名前は回り道の長い線の外側に、金額は内側に。外側が図の外に出るなら名前も内側に
      var rside = function(out, text, attrs){
        var r = route, m = r.hz ? (r.pts[1][1] + r.pts[2][1]) / 2 : (r.pts[1][0] + r.pts[2][0]) / 2, o2 = out ? r.sg : -r.sg;
        var tw = [...text].reduce(function(a, ch){ return a + (/[\u0000-\u024f]/.test(ch) ? 0.6 : 1); }, 0) * 26;
        if (out && (r.hz ? (o2 > 0 ? r.ch + 10 + tw > W : r.ch - 10 - tw < 0) : (o2 > 0 ? r.ch + 30 > H : r.ch - 34 < 0))) o2 = -o2;
        var at2 = r.hz ? {x: r.ch + o2 * 10, y: m + 8, a: o2 > 0 ? "start" : "end"} : {x: m, y: r.ch + (o2 > 0 ? 30 : -10), a: "middle"};
        var bx0 = at2.a === "start" ? at2.x : at2.a === "end" ? at2.x - tw : at2.x - tw / 2;
        boxes.push([bx0, at2.y - 26 * 0.88, bx0 + tw, at2.y + 26 * 0.22]);
        return D.mtext(g, +at2.x.toFixed(2), +at2.y.toFixed(2), text, Object.assign({"text-anchor": at2.a, "font-size": 24, opacity: 0}, attrs));
      };
      if (route){
        if (e.label) lab = rside(true, e.label, {fill: tn ? col : "var(--fg)"});
        if (hasAmt) amt = rside(!e.label, String(e.amount), {fill: col, "font-weight": 700, "font-size": 26});
      } else {
      if (e.label) lab = side(sg, e.label, {fill: tn ? col : "var(--fg)"}, !hasAmt);
      if (hasAmt) amt = side(e.label ? -sg : sg, String(e.amount), {fill: col, "font-weight": 700, "font-size": 26}, true);
      }
      var step = e.step || Math.max(a.step, b.step);
      // 同じ段階で出る箱があれば、その箱が出てから引く
      var after = Math.max(a.step === step ? a.at + P.fade * 0.6 : 0, b.step === step ? b.at + P.fade * 0.6 : 0);
      var at = e.at !== undefined ? e.at : after;
      // pulse の段階と開始時刻：辺の段階なら引き終わってから、ほかの段階なら pulseAt（既定 0.2 秒）から
      var pk = e.pulse === true ? [step] : Array.isArray(e.pulse) ? e.pulse : [];
      var pulses = pk.map(function(k){ return {k: k, at: e.pulseAt !== undefined ? e.pulseAt : k === step ? +(at + P.draw).toFixed(3) : 0.2}; });
      var dots = pulses.length ? Array.from({length: Math.max(1, P["pulse-n"])}, function(){ return D.el("circle", {r: kind[2] + 3.5, fill: col, stroke: "var(--bg)", "stroke-width": 2, opacity: 0}, gE); }) : [];
      var o = {g: g, line: line, head: head, lab: lab, amt: amt, p0: p0, p1: p1, ang: Math.atan2(dy, dx) * 180 / Math.PI, step: step, at: at, pulses: pulses, dots: dots};
      if (route) o.poly = route.poly;
      return o;
    }).filter(Boolean);
    sk.flush();   // what the formulas have to report, once per kind (spec §6.2)
    // 線分 s = [[x, y], [x, y]] が箱 r = [x0, y0, x1, y1] にかかるか（Liang–Barsky）
    function segHitsBox(sg, r){
      var x = sg[0][0], y = sg[0][1], ddx = sg[1][0] - x, ddy = sg[1][1] - y, t0 = 0, t1 = 1;
      var pp = [-ddx, ddx, -ddy, ddy], qq = [x - r[0], r[2] - x, y - r[1], r[3] - y];
      for (var i = 0; i < 4; i++){
        if (pp[i] === 0){ if (qq[i] < 0) return false; continue; }
        var u = qq[i] / pp[i];
        if (pp[i] < 0){ if (u > t1) return false; if (u > t0) t0 = u; }
        else { if (u < t0) return false; if (u < t1) t1 = u; }
      }
      return true;
    }
    // 2 つの線分が交わるか（端を除く）
    function segsCross(s1, s2){
      var o = function(a, b, c){ return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
      var d1 = o(s2[0], s2[1], s1[0]), d2 = o(s2[0], s2[1], s1[1]), d3 = o(s1[0], s1[1], s2[0]), d4 = o(s1[0], s1[1], s2[1]);
      return d1 * d2 < 0 && d3 * d4 < 0;
    }
  }
  // 折れ線：点と累積の長さ（戻る辺）
  poly(pts){
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts: pts, L: L, len: L[L.length - 1] || 1};
  }
  // 折れ線の始めから長さ len の点と向き（度）。d：そこまでの線
  polyAt(pl, len){
    var pts = pl.pts, want = Math.max(0, Math.min(pl.len, len)), i = 1, d = "M" + pts[0][0].toFixed(2) + "," + pts[0][1].toFixed(2);
    while (i < pts.length - 1 && pl.L[i] < want){ d += "L" + pts[i][0].toFixed(2) + "," + pts[i][1].toFixed(2); i++; }
    var u = (want - pl.L[i - 1]) / ((pl.L[i] - pl.L[i - 1]) || 1), x = base.lerp(pts[i - 1][0], pts[i][0], u), y = base.lerp(pts[i - 1][1], pts[i][1], u);
    return {x: x, y: y, ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI, d: d + "L" + x.toFixed(2) + "," + y.toFixed(2)};
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
  render(k, t, ctx){
    var P = this.props, D = base, self = this, preview = !!ctx.preview, PV = 0;
    // 先を薄く見せる表示：後の段階の箱と矢印（名前・金額も）を、最後の形のままテーマの --preview-opacity（なければ 0.45）で描く。
    // pulse の点は今の段階のものだけ
    if (preview) PV = base.previewOpacity(this);
    var ahead = function(step){ return preview && step > k; };
    var pr = function(step, at, dur){ return step < k || ahead(step) ? 1 : step > k ? 0 : D.prog(t, at, dur); };
    this.nodes.forEach(function(o){
      var e = pr(o.step, o.at, P.fade), s = D.lerp(0.92, 1, e);
      o.g.setAttribute("opacity", ahead(o.step) ? PV.toFixed(3) : e.toFixed(3));
      o.g.setAttribute("transform", "translate(" + o.cx + " " + o.cy + ") scale(" + s.toFixed(4) + ") translate(" + (-o.cx) + " " + (-o.cy) + ")");
    });
    this.edges.forEach(function(o){
      var e = pr(o.step, o.at, P.draw);
      if (o.poly){
        // 戻る辺：折れ線を始めから引き、矢じりは先端について動く（線は矢じりの根元まで）
        var want = e * o.poly.len, tip = self.polyAt(o.poly, want), hs2 = Math.min(1, want / 20);
        o.line.setAttribute("d", want > 0 ? self.polyAt(o.poly, want - Math.min(14, want)).d : "");
        o.head.setAttribute("transform", "translate(" + tip.x.toFixed(2) + " " + tip.y.toFixed(2) + ") rotate(" + tip.ang.toFixed(2) + ") scale(" + hs2.toFixed(4) + ")");
      } else {
      var tx = D.lerp(o.p0[0], o.p1[0], e), ty = D.lerp(o.p0[1], o.p1[1], e);
      var L = Math.hypot(o.p1[0] - o.p0[0], o.p1[1] - o.p0[1]) || 1, back = Math.min(14, e * L);
      // 線は矢じりの根元まで。矢じりは線の先端について動く
      o.line.setAttribute("x2", (tx - (o.p1[0] - o.p0[0]) / L * back).toFixed(2));
      o.line.setAttribute("y2", (ty - (o.p1[1] - o.p0[1]) / L * back).toFixed(2));
      // 矢じりは線が 20px 伸びるまでに大きくなる（始めに箱からはみ出さない）
      var hs = Math.min(1, e * L / 20);
      o.head.setAttribute("transform", "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ") rotate(" + o.ang.toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      }
      o.g.setAttribute("opacity", ahead(o.step) ? PV : e > 0 ? 1 : 0);
      var lo = pr(o.step, o.at + P.draw * 0.8, 0.3).toFixed(3);
      if (o.lab) o.lab.setAttribute("opacity", lo);
      if (o.amt) o.amt.setAttribute("opacity", lo);
      // pulse：今の段階に pulse があれば、点の列を (t - 開始) から置く。流れ終わった点と t = Infinity では出さない
      var q = null;
      o.pulses.forEach(function(x){ if (x.k === k) q = x; });
      o.dots.forEach(function(dot, j){
        var u = q && t !== Infinity ? (t - q.at - 0.22 * j) / P["pulse-dur"] : -1;
        if (u <= 0 || u >= 1 || e < 1){ dot.setAttribute("opacity", 0); return; }
        var w = D.prog(u, 0, 1);
        if (o.poly){ var pp = self.polyAt(o.poly, w * o.poly.len); dot.setAttribute("cx", pp.x.toFixed(2)); dot.setAttribute("cy", pp.y.toFixed(2)); }
        else { dot.setAttribute("cx", D.lerp(o.p0[0], o.p1[0], w).toFixed(2)); dot.setAttribute("cy", D.lerp(o.p0[1], o.p1[1], w).toFixed(2)); }
        dot.setAttribute("opacity", Math.min(1, u * 8, (1 - u) * 8).toFixed(3));
      });
    });
  }
};
});
