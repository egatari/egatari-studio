// m-fishbone：原因と結果の図（特性要因図・フィッシュボーン図）を、骨 1 本ずつ組み立てる
// <m-fishbone style="height:450px"><script type="application/json">
//   {"effect": {"label": "配送の遅れ"},
//    "nodes": [{"id": "p", "label": "人"}, {"id": "p1", "label": "人手が足りない", "parent": "p"}, …]}
// （JSON の終わり）</m-fishbone>
// 座標は書かない（docs/conventions.md §2）。parent のない節が大骨（分類：人・機械・方法・材料など）、その子が原因（中骨）、孫が細かい原因（小骨）。3 段まで
// 頭（結果の箱）は右、背骨は横。大骨は上下に交互に、斜めに付く。原因は大骨に付く横の線の上に書き、細かい原因は原因の線から大骨と平行に下ろした線に付ける
// 段階：order="causes-first"（既定：大骨 1 本ずつ（その原因と一緒に）、最後に頭）か order="effect-first"（頭と背骨、それから大骨 1 本ずつ）。節の step が勝つ
// edges：原因どうしなど、ほかのつながり（破線、矢印つき）。段階は両端の遅いほう
// 字の大きさは要素の大きさから決め（27 px から）、入らなければ 24 px まで縮める。それでも入らなければ、字は 24 px のまま
// 大骨の間を詰め、要素の箱からはみ出して ctx.report("size", …)（足りない px）
// 見せ方（docs/conventions.md §2.5）：fade（箱と字が下から 12 px 上がりながら現れてから線を引く、既定）・draw（線を先に引き、
// その先に箱と字が現れる）・grow（分類の箱が背骨の側から 12 px 寄りながら 0.92 → 1 に、原因の字が大骨の側から 12 px 寄って出る）。
// 箱と字の動きはどれも 12 px まで。段階の数・長さ・最後の中身はどれも同じ
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 式（tex）は組み立てのときに KaTeX で描く（spec §6.2）：build.fields の effect.tex・nodes[].tex を作り手が描いて texHtml を足し、
// この部品は markup-reader で決まった要素と属性だけを読んで置く（再生のときに KaTeX は動かない）。描いた結果がなければ tex を字のまま出して知らせる。
// 入らないときは ctx.report("size", "[fishbone] …") で知らせる（1.x の console.warn の代わり）
egatariParts.define({name: "fishbone", version: "2.0.0", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-fishbone"}, function(deps){
"use strict";
var base = deps.base, MR = deps["markup-reader"];
var Part = class extends base.MotionElement {
  static partName = "fishbone";   // the registry name (define meta name), for report prefixes
  // 組み立てのときに描く欄（spec §6.2）。式の意味は字（tex）でも持つので、KaTeX の出力は HTML だけ
  static build = {fields: {"effect.tex": "katex", "nodes[].tex": "katex"}, options: {katex: {output: "html"}}};
  static variants = ["fade", "draw", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["effect", "nodes"], properties: {
      effect: {type: "object", properties: {label: {type: "string"}, tex: {type: "string"}, texHtml: {type: "string"}, note: {type: "string"}, tone: {type: "string"}, step: {type: "integer"}, at: {type: "number"}}},
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, texHtml: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        parent: {type: ["string", "integer"]}, step: {type: "integer"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        step: {type: "integer"}, at: {type: "number"}}}},
      renderers: {type: "object"}}},
    example: {effect: {label: "配送の遅れ"}, nodes: [{id: "p", label: "人"}, {id: "p1", label: "人手が足りない", parent: "p"}, {id: "m", label: "機械"}, {id: "m1", label: "車の故障", parent: "m"}]},
    note: "parent のない節が大骨（分類）、その子が原因、孫が細かい原因（3 段まで）",
  };
  static props = {
    order: {type: "string", default: "causes-first", doc: "段階の順：causes-first（大骨 1 本ずつ、最後に頭、既定）か effect-first（頭と背骨が先）"},
    size:  {type: "number", default: 0, doc: "箱の字の大きさ（px。0 = 27 から入るまで 24 まで縮める）"},
    fade:  {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw:  {type: "number", default: 0.5, doc: "線を引く秒数"},
  };
  // 骨の形と段階（mount の前にも段階の数のために使う）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, byId = {}, cats = [];
    var nodes = (d.nodes || []).map(function(n){ var o = {n: n, kids: []}; byId[n.id] = o; return o; });
    nodes.forEach(function(o){
      if (o.n.parent === undefined || o.n.parent === null) cats.push(o);
      else if (!byId[o.n.parent]) throw new Error("m-fishbone: node " + JSON.stringify(o.n.id) + " has an unknown parent " + JSON.stringify(o.n.parent));
      else byId[o.n.parent].kids.push(o);
    });
    if (!cats.length) throw new Error("m-fishbone: no main bone (a node without parent)");
    var seen = 0;
    cats.forEach(function(c){
      (function walk(o, lv){
        if (++seen > nodes.length) throw new Error("m-fishbone: the parents form a loop");
        if (lv > 2) throw new Error("m-fishbone: " + JSON.stringify(o.n.id) + " is deeper than 3 levels (main bone, cause, sub-cause)");
        o.lv = lv; o.kids.forEach(function(k){ k.par = o; walk(k, lv + 1); });
      })(c, 0);
    });
    if (seen !== nodes.length) throw new Error("m-fishbone: the parents form a loop");
    var ef = d.effect || {}, effFirst = P.order === "effect-first", n = cats.length;
    var head = {n: ef, step: ef.step !== undefined ? ef.step : effFirst ? 1 : n + 1, at: ef.at || 0};
    var spineStep = effFirst ? head.step : 1;
    cats.forEach(function(c, i){
      c.step = c.n.step !== undefined ? c.n.step : effFirst ? i + 2 : i + 1;
      // 大骨の行：原因と、その下の細かい原因（上から下の順）
      c.rows = [];
      c.kids.forEach(function(k){ c.rows.push(k); k.kids.forEach(function(s){ c.rows.push(s); }); });
      c.rows.forEach(function(r){ r.step = r.n.step !== undefined ? r.n.step : c.step; r.cat = c; });
    });
    var edges = (d.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) throw new Error("m-fishbone: edge to an unknown node " + JSON.stringify(a ? e.to : e.from));
      return {e: e, a: a, b: b, step: e.step !== undefined ? e.step : Math.max(a.step, b.step)};
    });
    return (this._plan = {cats: cats, nodes: nodes, head: head, spineStep: spineStep, edges: edges, byId: byId});
  }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var p = this.plan(), m = Math.max(p.head.step, p.spineStep);
    p.nodes.concat(p.edges).forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  // 1 つのものが現れて線を引き終わるまで（どの見せ方でも同じ）
  span(){ return this.props.fade * 0.6 + this.props.draw; }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), sk = MR.sink(this, ctx);
    this.variant = base.variant(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var root = D.el("g", {}, svg), gL = D.el("g", {}, root), gT = D.el("g", {}, root), gE = D.el("g", {}, root), gN = D.el("g", {}, root);
    var plain = function(s){ return String(s).replace(/\*/g, "").replace(/[_^](.)/g, "$1"); };
    var est = function(s){ return [...plain(s)].reduce(function(a, ch){ return a + (/[\u0000-ɏ]/.test(ch) ? 0.6 : 1); }, 0); };
    var texEst = function(s){ return Math.max(1, String(s).replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_\\ ]/g, "").length) * 0.62; };
    var tones = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"]};
    var toneOf = function(t, dflt){
      if (tones[t]) return tones[t];
      if (/^(muted|accent2|series-[1-4])$/.test(t || "")) return ["var(--" + t + ")", "var(--bg)", "var(--" + t + ")"];
      return tones[dflt || "term"];
    };
    var NS = 24, NLH = 30, cats = pl.cats, nc = cats.length, cols = Math.ceil(nc / 2);
    var R = Math.max(1, Math.max.apply(null, cats.map(function(c){ return c.rows.length; })));
    var M1 = 12, M2 = 14, TXT = 31;   // 箱と最初の行の間、最後の行と背骨の間、字の行の高さ（字の上端から線まで）
    // 大きさ s、行の高さ rh、傾き k（縦 1 px あたりの横）で 1 本の大骨を局所座標（背骨に付く点が原点）で測る
    function box(n, s){
      var lines = n.tex ? [n.tex] : String(n.label || "").split("\n");
      var tw = n.tex ? texEst(n.tex) * s : Math.max.apply(null, lines.map(est)) * s;
      var notes = n.note ? String(n.note).split("\n") : [];
      return {lines: lines, w: Math.max(s * 2.4, tw + s * 1.3), h: (n.tex ? s * 1.5 : lines.length * s * 1.25) + s * 0.75,
        notes: notes, nw: notes.length ? Math.max.apply(null, notes.map(est)) * NS : 0, nh: notes.length ? notes.length * NLH + 4 : 0};
    }
    function boneGeom(c, i, s, rh, k){
      var up = i % 2 === 0, sg = up ? -1 : 1, cs = Math.max(24, s - 1), ss = 24;
      var Lv = R * rh + M1 + M2, g = {up: up, sg: sg, Lv: Lv, k: k, cs: cs};
      g.b = box(c.n, s);
      var xo = -Lv * k;
      g.outer = [xo, sg * Lv];
      g.boxX = xo - g.b.w / 2; g.boxY = up ? -Lv - g.b.h : Lv;
      var xb = function(v){ return -v * k; };
      var lo = Math.min(g.boxX, xo - g.b.nw / 2), hi = Math.max(0, g.boxX + g.b.w, xo + g.b.nw / 2);
      g.rows = [];
      c.rows.forEach(function(o, r){
        // 行 r の横の線の、背骨からの縦の距離 v（上の骨は外から内へ、下の骨は内から外へ並ぶ）。字は線の上（画面で上）に書く
        var v = up ? Lv - M1 - (r + 1) * rh + 6 : M2 + (r + 1) * rh - 6, y = sg * v, sz = o.lv === 1 ? cs : ss;
        // 字の幅：tex は字数から見積もる。note は後ろに続けて小さく（--muted）書く
        var nw = o.n.note ? est("  " + o.n.note) * NS : 0, tw = (o.n.tex ? texEst(o.n.tex) * sz : est(o.n.label || "") * sz) + nw, x0, xe, mini = null;
        if (o.lv === 1){ x0 = xb(v); xe = Math.min(xb(v), xb(v - sg * TXT)) - 10; }
        else {
          // 細かい原因：親の原因の線から、大骨と平行な線を下ろした先に付く
          var pr = g.rows[c.rows.indexOf(o.par)], xp = xb(pr.v) - (40 + 30 * k), py = pr.y;
          var xm = function(yy){ return xp + (up ? 1 : -1) * k * (yy - py); };
          x0 = xm(y); xe = Math.min(xm(y), xm(y - TXT)) - 10;
          pr.miniEnd = Math.max(pr.miniEnd || 0, y - py);
          pr.mini = {x0: xp, xm: xm};
        }
        var xl = xe - tw - 8;
        lo = Math.min(lo, xl); hi = Math.max(hi, x0);
        g.rows.push({o: o, v: v, y: y, x0: x0, xe: xe, xl: xl, tw: tw, nw: nw, sz: sz});
      });
      g.lo = lo; g.hi = hi;
      g.ext = Lv + g.b.h + g.b.nh;   // 背骨からの縦の広がり
      return g;
    }
    function layout(s, rh, k, cgap){
      var geo = cats.map(function(c, i){ return boneGeom(c, i, s, rh, k); });
      var hb = box(pl.head.n, s), xs = [], x = 0;
      for (var j = 0; j < cols; j++){
        var a = geo[2 * j], b = geo[2 * j + 1], lo = Math.min(a.lo, b ? b.lo : 0), hi = Math.max(a.hi, b ? b.hi : 0);
        x = j === 0 ? -lo : x + cgap - lo;
        xs.push(x); x += hi;
      }
      var tail = Math.min(0, xs[0] + Math.min(geo[0].outer[0], geo[1] ? geo[1].outer[0] : 0) - 24);
      var spineEnd = x + Math.max(36, cgap), width = spineEnd + hb.w - tail;
      var ext = Math.max.apply(null, geo.map(function(g){ return g.ext; }));
      var hh = Math.max(ext * 2, hb.h + 2 * hb.nh);
      return {geo: geo, hb: hb, xs: xs, tail: tail, spineEnd: spineEnd, width: width, height: hh, ext: ext};
    }
    // 入る大きさを探す：字（27 → 24 px）、行の高さ（52 → 40 px）、傾き（0.5 → 0.3）
    var sizes = P.size ? [P.size] : [27, 26, 25, 24], L = null, fit = true;
    search: for (var si = 0; si < sizes.length; si++){
      for (var rh = 52; rh >= 40; rh -= 2){
        for (var k = 0.5; k >= 0.29; k -= 0.1){
          var t = layout(sizes[si], rh, k, 28);
          if (t.width <= W && t.height <= H){ L = t; L.s = sizes[si]; L.rh = rh; L.k = k; break search; }
        }
      }
    }
    if (!L){
      // 24 px でも入らない：字は小さくせず、大骨の間を 12 px まで詰め、はみ出しのいちばん少ない形にする（中央に置き、両側へ同じだけはみ出す）
      fit = false;
      var s24 = sizes[sizes.length - 1], miss = function(t){ return Math.max(0, t.width - W) + Math.max(0, t.height - H); };
      for (var cg0 = 28; cg0 >= 12; cg0 -= 4){ var t0 = layout(s24, 40, 0.3, cg0); if (!L || miss(t0) < miss(L)) L = t0; }
      L.s = s24; L.rh = 40; L.k = 0.3;
      ctx.report("size", "[fishbone] the diagram does not fit at " + s24 + " px; it overflows its box by " + Math.ceil(Math.max(0, L.width - W)) + " px across and " +
        Math.ceil(Math.max(0, L.height - H)) + " px up and down (text is not made smaller). Use fewer causes per bone, shorter causes or a larger element");
    }
    // 横に余れば、大骨の間を広げる（80 px まで）
    if (fit) for (var cg = 80; cg > 28; cg -= 4){ var t2 = layout(L.s, L.rh, L.k, cg); if (t2.width <= W){ t2.s = L.s; t2.rh = L.rh; t2.k = L.k; L = t2; break; } }
    var s = L.s, ox = (W - L.width) / 2 - L.tail, oy = H / 2;
    this.size = s;
    var X = function(x){ return ox + x; }, Y = function(y){ return oy + y; };
    var mkLine = function(parent, w, col){ return D.el("path", {d: "", fill: "none", stroke: col || "var(--muted)", "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round"}, parent); };
    var boxText = function(g, b, n, x, y, c, sz){
      var cx = x + b.w / 2, cy = y + b.h / 2;
      if (n.tex) MR.texFrame(g, cx, cy + sz * 0.36, n, "tex", {size: sz, anchor: "middle", color: c[2], w: b.w, h: b.h}, sk).firstChild.style.verticalAlign = "top";
      else {
        var lh = sz * 1.25, y0 = cy - (b.lines.length - 1) * lh / 2 + sz * 0.36;
        b.lines.forEach(function(t, j){ D.mtext(g, cx, y0 + j * lh, t, {"text-anchor": "middle", "font-size": sz, fill: c[2]}); });
      }
    };
    // 頭（結果）
    var hb = L.hb, hx = X(L.spineEnd), hy = Y(0) - hb.h / 2, hc = toneOf(pl.head.n.tone, "emph");
    var H0 = this.head = {o: pl.head, g: D.el("g", {opacity: 0}, gN), x: hx, y: hy, cx: hx + hb.w / 2, cy: Y(0), inP: [hx, Y(0)]};
    D.el("rect", {class: "box", x: hx.toFixed(1), y: hy.toFixed(1), width: hb.w.toFixed(1), height: hb.h.toFixed(1), rx: 10, fill: hc[1], stroke: hc[0], "stroke-width": 3}, H0.g);
    boxText(H0.g, hb, pl.head.n, hx, hy, hc, s);
    hb.notes.forEach(function(t, j){ D.mtext(H0.g, hx + hb.w / 2, hy + hb.h + 4 + NLH * j + NS * 0.95, t, {"text-anchor": "middle", "font-size": NS, fill: "var(--muted)"}); });
    // 背骨（尾から頭の手前まで）と矢じり
    this.spine = {path: this.poly([[X(L.tail), Y(0)], [hx - 3, Y(0)]]), line: mkLine(gL, 5), step: pl.spineStep};
    H0.arrow = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: "var(--muted)", transform: "translate(" + (hx - 1).toFixed(1) + " " + Y(0).toFixed(1) + ")", opacity: 0}, gL);
    // 大骨と原因
    var cnt = {};
    this.bones = cats.map(function(c, i){
      var g = L.geo[i], bx = L.xs[Math.floor(i / 2)], col = c.n.tone ? toneOf(c.n.tone)[0] : "var(--muted)", cc = toneOf(c.n.tone);
      var at = c.n.at !== undefined ? c.n.at : c.step === pl.spineStep && c.step !== pl.head.step ? P.draw * 0.8 : c.step === pl.head.step ? self.span() : 0;
      var B = {o: c, step: c.step, at: at, g: D.el("g", {opacity: 0}, gN)};
      // 大骨：背骨の点から外の端まで（path は外から背骨へ。fade と grow は外から引く、draw は背骨から引く）
      B.spineP = [X(bx), Y(0)]; B.outP = [X(bx + g.outer[0]), Y(g.outer[1])];
      B.path = self.poly([B.outP, B.spineP]); B.rpath = self.poly([B.spineP, B.outP]);
      B.line = mkLine(gL, 3.5, col);
      var x0 = X(bx + g.boxX), y0 = Y(g.boxY);
      D.el("rect", {class: "box", x: x0.toFixed(1), y: y0.toFixed(1), width: g.b.w.toFixed(1), height: g.b.h.toFixed(1), rx: 10, fill: cc[1], stroke: cc[0], "stroke-width": c.n.tone === "emph" ? 3 : 2.2}, B.g);
      boxText(B.g, g.b, c.n, x0, y0, cc, s);
      g.b.notes.forEach(function(t, j){
        var ny = g.up ? y0 - 8 - NLH * (g.b.notes.length - 1 - j) : y0 + g.b.h + 4 + NLH * j + NS * 0.95;
        D.mtext(B.g, x0 + g.b.w / 2, ny, t, {"text-anchor": "middle", "font-size": NS, fill: "var(--muted)"});
      });
      B.cx = x0 + g.b.w / 2; B.cy = y0 + g.b.h / 2;
      // 背骨の側から箱へ向かう向き（draw と grow で箱が寄ってくる向き）
      var dx = B.cx - B.spineP[0], dy = B.cy - B.spineP[1], dl = Math.hypot(dx, dy) || 1;
      B.dir = [dx / dl, dy / dl];
      // 原因：横の線（大骨の点から左へ）と、その上の字
      B.rows = g.rows.map(function(r, j){
        var o = r.o, tc = o.n.tone ? toneOf(o.n.tone)[0] : "var(--fg)", lc = o.n.tone ? toneOf(o.n.tone)[0] : "var(--muted)";
        var gr = D.el("g", {opacity: 0}, gT);
        var y = Y(r.y), xa = X(bx + r.x0), xl = X(bx + r.xl);
        var rec = {o: o, step: o.step, g: gr, path: self.poly([[xa, y], [xl, y]]), line: mkLine(gL, 2.5, lc)};
        if (r.miniEnd){
          // 細かい原因へ下ろす、大骨と平行な線（親の原因の行が持つ）
          var p0 = [X(bx + r.mini.x0), y], p1 = [X(bx + r.mini.xm(r.y + r.miniEnd)), y + r.miniEnd];
          rec.mpath = self.poly([p0, p1]); rec.mline = mkLine(gL, 2.5, lc);
        }
        var tx, xe = X(bx + r.xe);
        if (o.n.tex){
          // 式（組み立てのときに描いた KaTeX）：箱と同じ枠（MR.texFrame）で、行の右端に寄せる。note はその右に別の字で
          MR.texFrame(gr, xe - r.nw, y - 8, o.n, "tex", {size: r.sz, anchor: "end", color: tc, w: r.tw - r.nw + 40, h: r.sz * 1.6}, sk).firstChild.style.verticalAlign = "top";
          if (o.n.note) D.mtext(gr, xe, y - 8, "  " + o.n.note, {"text-anchor": "end", "font-size": NS, fill: "var(--muted)"});
        } else {
          tx = D.mtext(gr, xe, y - 8, o.n.label || "", {"text-anchor": "end", "font-size": r.sz, fill: tc});
          if (o.n.tone === "emph") tx.setAttribute("font-weight", 700);
          if (o.n.note){ var ns = D.el("tspan", {"font-size": NS, fill: "var(--muted)", "font-weight": 400}, tx); ns.textContent = "  " + o.n.note; }
        }
        // 段階の中の開始時刻：同じ段階の行を上から順に少しずつずらす
        var key = rec.step, base = rec.step === c.step ? at + self.span() * 0.8 : 0;
        cnt[key + "|" + i] = (cnt[key + "|" + i] || 0) + 1;
        rec.at = o.n.at !== undefined ? o.n.at : +(base + 0.12 * (cnt[key + "|" + i] - 1)).toFixed(3);
        return rec;
      });
      return B;
    });
    // 細かい原因の平行の線は、細かい原因の行と同じ段階・時刻で引く（最初の子に合わせる）
    this.bones.forEach(function(B){
      B.rows.forEach(function(r){
        if (!r.mpath) return;
        var first = B.rows.filter(function(q){ return q.o.par === r.o; })[0];
        r.mstep = first.step; r.mat = first.at;
      });
    });
    // そのほかのつながり：字の左端どうしを、左へふくらむ破線で
    var rowOf = {};
    this.bones.forEach(function(B){ B.rows.forEach(function(r){ rowOf[r.o.n.id] = r; }); });
    this.edges = pl.edges.map(function(x){
      var e = x.e, ra = rowOf[e.from], rb = rowOf[e.to];
      if (!ra || !rb) throw new Error("m-fishbone: edges connect causes (not main bones)");
      var pa = [ra.path.pts[1][0] - 6, ra.path.pts[1][1]], pb = [rb.path.pts[1][0] - 10, rb.path.pts[1][1]];
      var mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], far = Math.min(pa[0], pb[0]) - 40, ctl = [2 * far - mid[0], mid[1]];
      var pts = [];
      for (var j = 0; j <= 24; j++){ var u = j / 24, v = 1 - u; pts.push([v * v * pa[0] + 2 * u * v * ctl[0] + u * u * pb[0], v * v * pa[1] + 2 * u * v * ctl[1] + u * u * pb[1]]); }
      var col = e.tone ? toneOf(e.tone)[0] : "var(--muted)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = D.el("path", {d: "", fill: "none", stroke: col, "stroke-width": 3, "stroke-dasharray": e.dash === false ? "none" : "8 6"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = e.label ? D.mtext(g, far - 8, mid[1] + 8, e.label, {"text-anchor": "end", "font-size": 24, fill: col, opacity: 0}) : null;
      var after = 0;
      [ra, rb].forEach(function(r){ if (r.step === x.step) after = Math.max(after, r.at + 0.45); });
      return {g: g, line: line, head: head, lab: lab, path: self.poly(pts), step: x.step, at: e.at !== undefined ? e.at : after};
    });
    sk.flush();   // what the formulas have to report, once per kind (spec §6.2)
  }
  poly(pts){
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts: pts, L: L, len: L[L.length - 1] || 1};
  }
  part(pl, f){
    var want = pl.len * Math.max(0, Math.min(1, f)), pts = pl.pts, out = [pts[0]], i = 1;
    for (; i < pts.length && pl.L[i] <= want; i++) out.push(pts[i]);
    var end = out[out.length - 1];
    if (i < pts.length && want > pl.L[i - 1]){
      var u = (want - pl.L[i - 1]) / (pl.L[i] - pl.L[i - 1]);
      end = [base.lerp(pts[i - 1][0], pts[i][0], u), base.lerp(pts[i - 1][1], pts[i][1], u)];
      out.push(end);
    }
    var pv = out.length > 1 ? out[out.length - 2] : pts[0], nx = i < pts.length ? pts[i] : end;
    var ang = out.length < 2 ? Math.atan2(nx[1] - end[1], nx[0] - end[0]) : Math.atan2(end[1] - pv[1], end[0] - pv[0]);
    return {d: "M" + out.map(function(p){ return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"), end: end, ang: ang};
  }
  duration(k){
    var self = this, P = this.props, d = 0, S = this.span(), pl = this.plan();
    if (pl.spineStep === k) d = Math.max(d, P.draw);
    if (pl.head.step === k) d = Math.max(d, (pl.head.n.at || 0) + S);
    (this.bones || []).forEach(function(B){
      if (B.step === k) d = Math.max(d, B.at + S);
      B.rows.forEach(function(r){ if (r.step === k) d = Math.max(d, r.at + 0.45); });
    });
    (this.edges || []).forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.draw + (o.lab ? 0.3 : 0)); });
    return d;
  }
  render(k, t, ctx){
    var P = this.props, D = base, self = this, vr = this.variant, lect = !!ctx.preview, S = this.span(), FAINT = 0.45;
    if (lect) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    var tOf = function(step){ return step < k ? Infinity : step > k ? -1 : t; };
    var pr = function(tt, at, dur){ return tt < 0 ? 0 : D.prog(tt, at, dur); };
    // 授業の表示：後の段階は薄く（--preview-opacity）、今の段階は薄い状態から濃くなる。位置は動かさない（どの見せ方でも同じ）
    var faint = function(tt, e){ return tt < 0 ? FAINT : FAINT + (1 - FAINT) * e; };
    var line = function(el, path, e){ el.setAttribute("d", e > 0 ? self.part(path, e).d : ""); };
    // 背骨：尾から頭へ引く（どの見せ方でも同じ）
    var sp = this.spine, ts = tOf(sp.step), es = pr(ts, 0, P.draw);
    if (lect){ line(sp.line, sp.path, 1); sp.line.setAttribute("opacity", faint(ts, es).toFixed(3)); }
    else { line(sp.line, sp.path, es); sp.line.setAttribute("opacity", es > 0 ? 1 : 0); }
    // 箱と字の動きは 12 px まで（docs/conventions.md §1.2：どの見せ方も fade より遠くへ動かさない）
    // fade：下から 12 px 上がりながら現れる（0.92 → 1）。draw：線の後、背骨の側から 12 px 寄りながら現れる。
    // grow：背骨の側から 12 px 寄りながら 0.92 → 1 に大きくなる
    var OFF = 12;
    var tf = function(cx, cy, s, dx, dy){
      return s >= 1 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? "" :
        "translate(" + (cx + dx).toFixed(2) + " " + (cy + dy).toFixed(2) + ") scale(" + s.toFixed(4) + ") translate(" + (-cx).toFixed(2) + " " + (-cy).toFixed(2) + ")";
    };
    // 頭（背骨は左から来る）
    var h = this.head, th = tOf(h.o.step), at = h.o.n.at || 0, eb, ea, sc = 1, m, sh;
    if (vr === "draw"){ ea = pr(th, at, S * 0.5); eb = pr(th, at + S * 0.45, S * 0.55); sc = D.lerp(0.92, 1, eb); sh = [-OFF * (1 - eb), 0]; }
    else if (vr === "grow"){ m = pr(th, at, P.fade); eb = pr(th, at, P.fade * 0.6); ea = pr(th, at, S * 0.5); sc = D.lerp(0.92, 1, m); sh = [-OFF * (1 - m), 0]; }
    else { eb = pr(th, at, P.fade); ea = pr(th, at + P.fade * 0.6, P.draw * 0.5); sc = D.lerp(0.92, 1, eb); sh = [0, OFF * (1 - eb)]; }
    if (lect){ var fh = faint(th, eb); h.g.setAttribute("opacity", fh.toFixed(3)); h.g.setAttribute("transform", ""); h.arrow.setAttribute("opacity", fh.toFixed(3)); }
    else {
      h.g.setAttribute("opacity", eb.toFixed(3));
      h.g.setAttribute("transform", tf(h.cx, h.cy, sc, sh[0], sh[1]));
      h.arrow.setAttribute("opacity", ea.toFixed(3));
    }
    // 大骨
    this.bones.forEach(function(B){
      var tt = tOf(B.step), eb, el, sc = 1, m, sh, path = B.path;
      if (vr === "draw"){
        el = pr(tt, B.at, S * 0.5); eb = pr(tt, B.at + S * 0.45, S * 0.55); sc = D.lerp(0.92, 1, eb); path = B.rpath;
        sh = [-B.dir[0] * OFF * (1 - eb), -B.dir[1] * OFF * (1 - eb)];
      } else if (vr === "grow"){
        m = pr(tt, B.at, P.fade); eb = pr(tt, B.at, P.fade * 0.6); el = pr(tt, B.at, S); sc = D.lerp(0.92, 1, m); path = B.rpath;
        sh = [-B.dir[0] * OFF * (1 - m), -B.dir[1] * OFF * (1 - m)];
      } else { eb = pr(tt, B.at, P.fade); el = pr(tt, B.at + P.fade * 0.6, P.draw); sc = D.lerp(0.92, 1, eb); sh = [0, OFF * (1 - eb)]; }
      if (lect){ var f = faint(tt, eb); B.g.setAttribute("opacity", f.toFixed(3)); B.g.setAttribute("transform", ""); line(B.line, B.path, 1); B.line.setAttribute("opacity", f.toFixed(3)); }
      else {
        B.g.setAttribute("opacity", eb.toFixed(3));
        B.g.setAttribute("transform", tf(B.cx, B.cy, sc, sh[0], sh[1]));
        line(B.line, path, el); B.line.setAttribute("opacity", el > 0 ? 1 : 0);
      }
      // 原因の行（どれも 0.45 秒）：fade は字が下から 12 px 上がりながら現れてから線、draw は線から字、
      // grow は字が大骨の側（右）から 12 px 寄りながら現れ、線は同時に大骨から引く
      B.rows.forEach(function(r){
        var tr = tOf(r.step), et, el2, dx = 0, dy = 0;
        if (vr === "draw"){ el2 = pr(tr, r.at, 0.25); et = pr(tr, r.at + 0.15, 0.3); }
        else if (vr === "grow"){ el2 = pr(tr, r.at, 0.45); et = pr(tr, r.at, 0.3); dx = OFF * (1 - et); }
        else { et = pr(tr, r.at, 0.3); el2 = pr(tr, r.at + 0.15, 0.3); dy = OFF * (1 - et); }
        if (lect){
          var f = faint(tr, et);
          r.g.setAttribute("opacity", f.toFixed(3)); r.g.setAttribute("transform", "");
          line(r.line, r.path, 1); r.line.setAttribute("opacity", f.toFixed(3));
        } else {
          r.g.setAttribute("opacity", et.toFixed(3));
          r.g.setAttribute("transform", Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 ? "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ")" : "");
          line(r.line, r.path, el2); r.line.setAttribute("opacity", el2 > 0 ? 1 : 0);
        }
        if (r.mline){
          var tm = tOf(r.mstep), em = pr(tm, r.mat, vr === "fade" ? 0.3 : 0.25);
          if (vr === "fade") em = pr(tm, r.mat + 0.15, 0.3);
          if (lect){ line(r.mline, r.mpath, 1); r.mline.setAttribute("opacity", faint(tm, em).toFixed(3)); }
          else { line(r.mline, r.mpath, em); r.mline.setAttribute("opacity", em > 0 ? 1 : 0); }
        }
      });
    });
    this.edges.forEach(function(o){
      var tt = tOf(o.step), e = pr(tt, o.at, P.draw), lo = pr(tt, o.at + P.draw * 0.8, 0.3);
      if (lect){ var f = faint(tt, e); e = 1; lo = 1; o.g.setAttribute("opacity", f.toFixed(3)); }
      else o.g.setAttribute("opacity", e > 0 ? 1 : 0);
      var p = self.part(o.path, e);
      o.line.setAttribute("d", e > 0 ? p.d : "");
      var hs = Math.min(1, e * o.path.len / 20);
      o.head.setAttribute("transform", "translate(" + p.end[0].toFixed(2) + " " + p.end[1].toFixed(2) + ") rotate(" + (p.ang * 180 / Math.PI).toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      if (o.lab) o.lab.setAttribute("opacity", lo.toFixed(3));
    });
  }
};
return Part;
});
