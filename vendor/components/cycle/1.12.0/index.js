// m-cycle：循環の図。段階の箱を円（横に長い場所では楕円）の上に 12 時から時計回りに並べ、となりの段階へ円に沿った矢印でつなぐ
// <m-cycle style="height:420px"><script type="application/json">
//   {"center": {"label": "PDCA"},
//    "nodes": [{"label": "計画", "note": "目標と手順"}, {"label": "実行"}, {"label": "評価"}, {"label": "改善"}]}
// （JSON の終わり）</m-cycle>
// 座標はデータに書かない（docs/conventions.md §2）。配列の順に回り、最後から最初へ戻る矢印は自動で引く（最後の段階と一緒に出る）
// 段階は 3〜8 個を想定。箱の幅は字数から見積もる（字の読み込みを待たない）。入らなければ字を 24px まで縮め、それでも入らなければ console.warn
// center（任意）：真ん中の名前。最初の段階と一緒に出る（center.step で変えられる）
// 段階：既定は 1 段階に 1 つ（per-step で n 個ずつ、node の step で直接、at で段階の中の開始秒）
// 見せ方（docs/conventions.md §2.5）：fade（既定。箱が下から 12 px 上がりながら現れてから入ってくる矢印を引く）・draw（矢印を先に引き、
// その先に箱が前の箱の側から 12 px 寄りながら出る）・grow（矢印を引きながら、箱が前の箱の側から 12 px 寄って 0.92 → 1 に大きくなる）。
// 箱の動きはどれも 12 px まで。段階の数・長さ・合図・最後の中身はどれも同じ
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (the first is the default) and calls VARIANT.of(this) once, in mount. The variant is the component's
// `variant` attribute when it names one of them, otherwise the first name. There is no seed: lessons do not carry one
// (spec §8.4 since egatari-spec 28d8801), and `seed` / `data-egatari-seed` are not read.
// The choice is a pure function of the attribute: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null && names.indexOf(v) >= 0) return v;
    if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
    return names[0] || null;
  }
  return {of: of};
})();
// ---- END egatari-variant ----
(function(){
"use strict";
DECK.define("m-cycle", class extends DECK.MotionElement {
  static variants = ["fade", "draw", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 2, items: {type: "object", properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        step: {type: "integer"}, at: {type: "number"}}}},
      center: {type: "object", properties: {label: {type: "string"}, tex: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        step: {type: "integer"}, at: {type: "number"}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {center: {label: "PDCA"}, nodes: [{label: "計画"}, {label: "実行"}, {label: "評価"}, {label: "改善"}]},
  };
  static props = {
    "per-step": {type: "number", default: 1, doc: "1 段階に出す段階（箱）の数（0 = 全部を段階 1 で）"},
    size:       {type: "number", default: 26, doc: "箱の字の大きさ（px。入らなければ 24 まで縮める）"},
    dur:        {type: "number", default: 0.8, doc: "1 つの段階（入ってくる矢印と箱）が現れる秒数"},
    stagger:    {type: "number", default: 0.3, doc: "同じ段階の箱の出だしのずれ（秒）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var p = this.plan(), m = p.center ? p.center.step : 0;
    p.stages.concat(p.arrows, p.edges).forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var P = this.props, per = P["per-step"], T = P.dur, data = this.data || {}, seen = {};
    var stages = (data.nodes || []).map(function(n, i){
      var step = n.step !== undefined ? n.step : per > 0 ? Math.floor(i / per) + 1 : 1, j = seen[step] = (seen[step] || 0) + 1;
      return {n: n, i: i, step: step, at0: n.at !== undefined ? n.at : +((j - 1) * P.stagger).toFixed(3)};
    });
    stages.forEach(function(o){ o.at = o.at0; });
    var N = stages.length, arrows = [];
    // 矢印 i：段階 i から i + 1 へ（最後は最初へ戻る）。後に出る端の段階と一緒に出る
    for (var i = 0; i < N && N > 1; i++){
      var a = stages[i], b = stages[(i + 1) % N], closing = i === N - 1;
      var owner = closing ? (a.step >= b.step ? a : b) : (b.step >= a.step ? b : a);
      // ふつうは入っていく先の箱と一緒（見せ方で順が変わる）。戻る矢印と、先の箱がもう出ているものは、持ち主の箱が出終わってから
      var withBox = !closing && owner === b;
      arrows.push({i: i, from: a, to: b, step: owner.step, owner: owner, withBox: withBox, at: withBox ? owner.at : +(owner.at + T).toFixed(3)});
    }
    stages.forEach(function(o){ o.inArrow = null; });
    arrows.forEach(function(r){ if (r.withBox) r.to.inArrow = r; });
    var c = data.center ? {n: data.center, step: data.center.step !== undefined ? data.center.step : stages.length ? stages[0].step : 1, at: data.center.at || 0} : null;
    var byId = {};
    stages.forEach(function(o){ if (o.n.id !== undefined) byId[o.n.id] = o; });
    var edges = (data.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b){ console.warn("m-cycle: edge to an unknown node", e.from, e.to); return null; }
      var step = e.step !== undefined ? e.step : Math.max(a.step, b.step), at = 0;
      [a, b].forEach(function(o){ if (o.step === step) at = Math.max(at, o.at + T); });
      return {e: e, a: a, b: b, step: step, at: e.at !== undefined ? e.at : at};
    }).filter(Boolean);
    return (this._plan = {stages: stages, arrows: arrows, center: c, edges: edges});
  }
  mount(){
    var P = this.props, D = DECK, self = this;
    this.variant = VARIANT.of(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.W = this.clientWidth, H = this.H = this.clientHeight;
    this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var L = null;
    for (var s = P.size; ; s = Math.max(24, s - 2)){
      L = this.layout(s);
      if (L.fits || s <= 24) break;
    }
    if (!L.fits) console.warn("m-cycle: the cycle does not fit its box even at 24px (" + L.why + "); make the element larger or shorten the labels");
    this.draw(L);
  }
  layout(size){
    var self = this, W = this.W, H = this.H, pl = this.plan(), N = pl.stages.length, why = [];
    var th = function(i){ return -Math.PI / 2 + 2 * Math.PI * i / N; };
    var boxes = pl.stages.map(function(o, i){
      var lines = labelLines(o.n, size, textFill(o.n.tone));
      // 強調の箱（--emph-tint の地）の中の補足は --fg（--muted では 4.5:1 に届かない。共通の決まり §2.3）
      if (o.n.note) lines.push({text: o.n.note, size: 24, fill: o.n.tone === "emph" ? "var(--fg)" : "var(--muted)"});
      var bs = boxSize(self, lines);
      return {o: o, bs: bs, w: bs.w, h: bs.h, th: th(i)};
    });
    var cen = null;
    if (pl.center){
      var cl = labelLines(pl.center.n, size + 4).map(function(l){ l.weight = 700; l.fill = tone(pl.center.n.tone); return l; });
      if (pl.center.n.note) cl.push({text: pl.center.n.note, size: 24, fill: "var(--muted)"});
      cen = boxSize(self, cl);
    }
    // 縦：箱と円の上端から下端までが H に入る最大の ry（二分法）。横：箱と円が W に入る最大の rx（縦の 1.9 倍まで）。
    // 円は縦に長くしない（ry ≤ rx の上限）
    var span = function(ry){
      var lo = -ry, hi = ry;
      boxes.forEach(function(b){ var y = ry * Math.sin(b.th); lo = Math.min(lo, y - b.h / 2); hi = Math.max(hi, y + b.h / 2); });
      return [lo, hi];
    };
    var rxMax = W / 2 - 4;
    boxes.forEach(function(b){ var c = Math.abs(Math.cos(b.th)); if (c > 1e-6) rxMax = Math.min(rxMax, (W / 2 - 3 - b.w / 2) / c); });
    var a = 0, b = H;
    for (var it = 0; it < 40; it++){ var m = (a + b) / 2, sp = span(m); if (sp[1] - sp[0] <= H - 6) a = m; else b = m; }
    var ry = Math.max(0, Math.min(a, rxMax)), sp = span(ry), cy = 3 - sp[0] + (H - 6 - (sp[1] - sp[0])) / 2, cx = W / 2;
    var rx = Math.max(0, Math.min(rxMax, ry * 1.9));
    if (ry < 40 || rx < 40) why.push("no room for the circle");
    var P = function(t){ return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; };
    boxes.forEach(function(b){ var p = P(b.th); b.cx = p[0]; b.cy = p[1]; b.x = p[0] - b.w / 2; b.y = p[1] - b.h / 2; });
    // 箱どうしが近すぎないか
    for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++){
      var p = boxes[i], q = boxes[j];
      if (p.x < q.x + q.w + 8 && q.x < p.x + p.w + 8 && p.y < q.y + q.h + 8 && q.y < p.y + p.h + 8) why.push("boxes " + (i + 1) + " and " + (j + 1) + " overlap");
    }
    // 矢印：円に沿って、箱 i の外へ出たところから、箱 i+1 に入る手前まで（箱から 8px 空ける）
    var inside = function(bx, t){ var p = P(t); return p[0] > bx.x - 8 && p[0] < bx.x + bx.w + 8 && p[1] > bx.y - 8 && p[1] < bx.y + bx.h + 8; };
    var arcs = pl.arrows.map(function(r){
      var A = boxes[r.i], B = boxes[(r.i + 1) % N], t0 = A.th, t1 = r.i === N - 1 ? B.th + 2 * Math.PI : B.th, d = 0.002;
      while (t0 < t1 && inside(A, t0)) t0 += d;
      while (t1 > t0 && inside(B, t1)) t1 -= d;
      var len = 0, q = P(t0);
      for (var t = t0 + d; t <= t1; t += d){ var p2 = P(t); len += Math.hypot(p2[0] - q[0], p2[1] - q[1]); q = p2; }
      if (len < 30) why.push("no room for the arrow from " + (r.i + 1));
      return {r: r, t0: t0, t1: t1, len: len};
    });
    if (cen){
      var hw = cen.w / 2 + 16, hh = cen.h / 2 + 16;
      if (Math.pow(hw / rx, 2) + Math.pow(hh / ry, 2) > 1) why.push("the center label is too large for the circle");
      boxes.forEach(function(b){ if (Math.abs(b.cx - cx) < b.w / 2 + hw && Math.abs(b.cy - cy) < b.h / 2 + hh) why.push("the center label touches a box"); });
    }
    return {fits: !why.length, why: why.join("; "), size: size, boxes: boxes, arcs: arcs, cen: cen, cx: cx, cy: cy, rx: rx, ry: ry};
  }
  draw(L){
    var D = DECK, self = this, svg = this.svg;
    var gA = D.el("g", {}, svg), gB = D.el("g", {}, svg), gE = D.el("g", {}, svg), gC = D.el("g", {}, svg);
    this.L = L;
    this.pt = function(t){ return [L.cx + L.rx * Math.cos(t), L.cy + L.ry * Math.sin(t)]; };
    var rects = {};
    this.boxes = L.boxes.map(function(b){
      var col = tone(b.o.n.tone), g = D.el("g", {opacity: 0}, gB);
      D.el("rect", {class: "box", x: b.x.toFixed(1), y: b.y.toFixed(1), width: b.w, height: b.h, rx: 12, fill: boxFill(b.o.n.tone), stroke: col, "stroke-width": b.o.n.tone === "emph" ? 3 : 2.2}, g);
      boxDraw(self, g, b.x, b.y, b.bs);
      if (b.o.n.id !== undefined) rects[b.o.n.id] = b;
      return {b: b, g: g, o: b.o};
    });
    this.arcs = L.arcs.map(function(a){
      var col = "var(--muted)", g = D.el("g", {opacity: 0}, gA);
      return {a: a, r: a.r, g: g, path: D.el("path", {d: "", fill: "none", stroke: col, "stroke-width": 3, "stroke-linecap": "round"}, g),
        head: D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g)};
    });
    // 前の段階の箱から、この箱へ向かう向き（draw と grow で箱が寄ってくる向き）
    this.boxes.forEach(function(o, i){
      var q = L.boxes[(i + L.boxes.length - 1) % L.boxes.length], dx = o.b.cx - q.cx, dy = o.b.cy - q.cy, dl = Math.hypot(dx, dy) || 1;
      o.dir = [dx / dl, dy / dl];
    });
    this.center = null;
    if (L.cen){
      var g = D.el("g", {opacity: 0}, gC);
      boxDraw(self, g, L.cx - L.cen.w / 2, L.cy - L.cen.h / 2, L.cen);
      this.center = {g: g};
    }
    this.edges = this.plan().edges.map(function(x){
      var e = x.e, A = rects[e.from], B = rects[e.to];
      if (!A || !B) return null;
      var dx = B.cx - A.cx, dy = B.cy - A.cy, Lh = Math.hypot(dx, dy) || 1;
      var cut = function(R, sx, sy){ var s = Math.min(sx ? (R.w / 2 + 6) / Math.abs(sx) : Infinity, sy ? (R.h / 2 + 6) / Math.abs(sy) : Infinity); return [R.cx + sx * s, R.cy + sy * s]; };
      var p0 = cut(A, dx / Lh, dy / Lh), p1 = cut(B, -dx / Lh, -dy / Lh), col = e.tone ? tone(e.tone) : "var(--muted)";
      var g = D.el("g", {opacity: 0}, gE), ux = p1[0] - p0[0], uy = p1[1] - p0[1], l2 = Math.hypot(ux, uy) || 1;
      D.el("line", {x1: p0[0].toFixed(1), y1: p0[1].toFixed(1), x2: (p1[0] - ux / l2 * 14).toFixed(1), y2: (p1[1] - uy / l2 * 14).toFixed(1), stroke: col, "stroke-width": 3, "stroke-dasharray": e.dash === false ? "none" : "8 6"}, g);
      D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col, transform: "translate(" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + ") rotate(" + (Math.atan2(uy, ux) * 180 / Math.PI).toFixed(1) + ")"}, g);
      if (e.label){
        var nx = -uy / l2, ny = ux / l2;
        if (ny > 0){ nx = -nx; ny = -ny; }
        D.mtext(g, (p0[0] + p1[0]) / 2 + nx * 16, (p0[1] + p1[1]) / 2 + ny * 16, e.label, {"text-anchor": "middle", "font-size": 24, fill: e.tone ? col : "var(--muted)"});
      }
      return {g: g, step: x.step, at: x.at};
    }).filter(Boolean);
  }
  duration(k){
    var T = this.props.dur, p = this.plan(), d = 0;
    p.stages.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + T); });
    p.arrows.forEach(function(o){ if (o.step === k && !o.withBox) d = Math.max(d, o.at + 0.5); });
    if (p.center && p.center.step === k) d = Math.max(d, p.center.at + 0.45);
    p.edges.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + 0.4); });
    return d;
  }
  // 同じ段階の 2 つ目からの箱の開始時刻（口述原稿の {cue} に合わせられる）
  cues(k){
    var c = [];
    this.plan().stages.forEach(function(o){ if (o.step === k && o.at0 > 0 && c.indexOf(o.at) < 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var D = DECK, self = this, vr = this.variant, T = this.props.dur, L = this.L;
    var lecture = !!(ctx && (ctx.preview || ctx.mode === "lecture")), FAINT = 0.45;
    if (lecture){ var pv = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); FAINT = pv >= 0 && pv <= 1 ? pv : 0.45; }
    var pr = function(s, start, len){ return s < k ? 1 : s > k ? 0 : D.prog(t, start, len); };
    // 授業の表示：後の段階は最後の形を薄く（テーマの --preview-opacity、ないときは 0.45）、今の段階はその薄さから濃くなる。形は動かさない（どの見せ方でも同じ）
    var faint = function(s, start, len){ return s < k ? 1 : s > k ? FAINT : FAINT + (1 - FAINT) * D.prog(t, start, len); };
    var boxE = {}, arrE = {};
    // 段階ごとの箱と、一緒に出る入ってくる矢印の進み
    // 箱の動きは 12 px まで（docs/conventions.md §1.2：どの見せ方も fade より遠くへ動かさない）
    var OFF = 12;
    this.boxes.forEach(function(o){
      var s = o.o.step, st = o.o.at, op, sc = 1, e = 1, d = [0, -1], ar;
      if (lecture){ op = faint(s, st, T); ar = 1; }
      else if (vr === "draw"){
        // 矢印を先に引き、その先に箱が前の箱の側から 12 px 寄りながら出る
        ar = pr(s, st, 0.5 * T); e = op = pr(s, st + 0.45 * T, 0.55 * T); sc = 0.92 + 0.08 * e; d = o.dir;
      } else if (vr === "grow"){
        // 矢印を引きながら、箱が前の箱の側から 12 px 寄り、0.92 → 1 に大きくなる
        ar = pr(s, st, 0.5 * T); e = pr(s, st + 0.3 * T, 0.55 * T); op = Math.min(1, e * 1.6); sc = 0.92 + 0.08 * e; d = o.dir;
      } else {
        // fade：箱が下から 12 px 上がりながら現れてから、入ってくる矢印を引く
        e = op = pr(s, st, 0.55 * T); sc = 0.92 + 0.08 * e; ar = pr(s, st + 0.45 * T, 0.55 * T);
      }
      var dx = -d[0] * OFF * (1 - e), dy = -d[1] * OFF * (1 - e), cx = o.b.cx, cy = o.b.cy;
      o.g.setAttribute("opacity", op.toFixed(3));
      o.g.setAttribute("transform", sc >= 1 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? "" :
        "translate(" + (cx + dx).toFixed(2) + " " + (cy + dy).toFixed(2) + ") scale(" + sc.toFixed(4) + ") translate(" + (-cx).toFixed(2) + " " + (-cy).toFixed(2) + ")");
      if (o.o.inArrow) arrE[o.o.inArrow.i] = lecture ? [1, op] : [ar, 1];
    });
    this.arcs.forEach(function(o){
      var r = o.r, v = arrE[r.i] || (lecture ? [1, faint(r.step, r.at, 0.5)] : [pr(r.step, r.at, 0.5), 1]);
      var e = v[0], a = o.a, tc = a.t0 + (a.t1 - a.t0) * e;
      o.g.setAttribute("opacity", e > 0 ? v[1].toFixed(3) : 0);
      // 見えない矢印も、render が書く属性はすべて書き直す（前の呼び出しの transform を残さない。docs/contract.md §3）
      if (e <= 0){ o.path.setAttribute("d", ""); o.head.removeAttribute("transform"); return; }
      // 線は矢じりの根元まで（矢じりは 14px、線が 20px 伸びるまでに大きくなる）
      var p = self.pt(tc), sp = Math.hypot(L.rx * Math.sin(tc), L.ry * Math.cos(tc)) || 1;
      var back = Math.min(14 / sp, tc - a.t0), te = tc - back, q0 = self.pt(a.t0), q1 = self.pt(te);
      o.path.setAttribute("d", "M" + q0[0].toFixed(2) + "," + q0[1].toFixed(2) + "A" + L.rx.toFixed(2) + "," + L.ry.toFixed(2) + " 0 " + (te - a.t0 > Math.PI ? 1 : 0) + " 1 " + q1[0].toFixed(2) + "," + q1[1].toFixed(2));
      var ang = Math.atan2(L.ry * Math.cos(tc), -L.rx * Math.sin(tc)) * 180 / Math.PI, hs = Math.min(1, a.len * e / 20);
      o.head.setAttribute("transform", "translate(" + p[0].toFixed(2) + " " + p[1].toFixed(2) + ") rotate(" + ang.toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
    });
    var c = this.plan().center;
    if (this.center) this.center.g.setAttribute("opacity", (lecture ? faint(c.step, c.at, 0.45) : pr(c.step, c.at, 0.45)).toFixed(3));
    this.edges.forEach(function(o){ o.g.setAttribute("opacity", (lecture ? faint(o.step, o.at, 0.4) : pr(o.step, o.at, 0.4)).toFixed(3)); });
  }
});

// ---- 下の関数は m-cycle の中だけで使う（字の幅の見積もり・箱の中の行）
function tone(t){ return "var(--" + (/^(term|emph|muted|accent2|series-[1-4])$/.test(t || "") ? t : "term") + ")"; }
// 箱の地と字の色（m-tree・m-fishbone と同じ決まり）：term と emph はテーマの薄い色の地、emph は字も emph
function boxFill(t){ return t === "emph" ? "var(--emph-tint)" : /^(muted|accent2|series-[1-4])$/.test(t || "") ? tint(tone(t), 12) : "var(--term-tint)"; }
function textFill(t){ return t === "emph" ? "var(--emph)" : "var(--fg)"; }
function tint(c, p){ return "color-mix(in srgb," + c + " " + p + "%,var(--bg))"; }
// 字の幅（px）：数字 0.6 字、ほかの欧文 0.62 字、空白 0.3 字、和文 1 字。*斜体* の * は数えない
function est(s, fs){
  var w = 0;
  for (var ch of String(s).replace(/\*/g, "")) w += /[0-9]/.test(ch) ? 0.6 : ch === " " ? 0.3 : /[\u0000-ɏ]/.test(ch) ? 0.62 : /[｡-ﾟ]/.test(ch) ? 0.5 : 1;
  return w * fs;
}
// KaTeX の式の幅：一度置いて測る
function texWidth(el, l){
  var g = DECK.el("g", {opacity: 0}, el.svg), fo = DECK.svgMath(g, 0, 0, l.tex, {size: l.size, anchor: "start"});
  var w = Math.max(0, (+fo.getAttribute("width") || 4) - 4);
  el.svg.removeChild(g);
  return w;
}
function labelLines(n, size, fill){
  fill = fill || "var(--fg)";
  if (n.tex) return [{tex: n.tex, size: size, fill: fill}];
  return String(n.label || "").split("\n").map(function(s){ return {text: s, size: size, fill: fill}; });
}
// 箱の大きさと行の位置（基線は前の行の下 0.3 字 ＋ 今の行の 1.12 字：字の箱どうしが重ならない）
function boxSize(el, lines){
  var w = 0, y = 10, prev = null;
  lines.forEach(function(l){
    l.w = l.tex ? texWidth(el, l) : est(l.text, l.size) * (l.weight ? 1.05 : 1);
    w = Math.max(w, l.w);
    y += prev ? 0.3 * prev.size + 1.12 * l.size : 0.9 * l.size;
    l.y = y; prev = l;
  });
  return {w: Math.ceil(w + 36), h: Math.ceil(y + 0.28 * prev.size + 10), lines: lines};
}
function boxDraw(el, g, x, y, bs){
  bs.lines.forEach(function(l){
    if (l.tex) DECK.svgMath(g, x + bs.w / 2, y + l.y, l.tex, {size: l.size, anchor: "middle", color: l.fill, w: l.w + 8, h: l.size * 1.6}).firstChild.style.verticalAlign = "top";
    else DECK.mtext(g, x + bs.w / 2, y + l.y, l.text, {"text-anchor": "middle", "font-size": l.size, fill: l.fill, "font-weight": l.weight || 400});
  });
}
})();
