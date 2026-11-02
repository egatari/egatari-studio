// m-venn：2 つか 3 つの集合の円（ベン図）。集合を 1 つずつ出し、最後に重なりを強めて、その中の項目を出す
// <m-venn style="height:420px"><script type="application/json">
//   {"sets": [{"label": "哺乳類"}, {"label": "海の生き物"}],
//    "regions": {"A": ["ライオン", "ウマ"], "B": ["マグロ", "タコ"], "AB": ["クジラ", "イルカ"]}}
// （JSON の終わり）</m-venn>
// 円は左右対称の決まった配置（面積は値に比例させない）。2 つは左右に、3 つは左上・右上・下に置く。集合の名前は円の外に書く
// regions の鍵は集合の文字（1 つ目 A、2 つ目 B、3 つ目 C）の組：A は「A だけ」、AB は「A と B（C ではない）」、ABC は 3 つとも
// 項目は 1 つ 1 行で、その領域の中に収まる位置を探して置く（字数から幅を見積もる）。字は size から 24 px まで縮め、収まらなければ ctx.report（size）
// 段階：既定は 集合を 1 つずつ（その集合だけの項目と一緒に）→ 重なり（項目のある重なりを --emph で囲んで薄く塗り、項目を出す）。
// overlaps="each" なら重なりを 1 つずつ（AB・AC・BC・ABC の順）
// 見せ方（docs/conventions.md §1）：fade（既定。円が薄く現れる）・draw（円の線を引いてから、塗りと字が現れる）。
// どちらも長さは dur で、段階の数・長さ・最後の中身は変わらない
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 切り抜き（clipPath）の id は venn-2-0-0-<n>-in<i>・-out<i>（部品の名前と版。n はこの部品の数え。1.x は m-venn-<n>）
egatariParts.define({name: "venn", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-venn"}, function(deps){
"use strict";
var base = deps.base;
var ID = "venn-2-0-0-", count = 0;   // ids this part writes: its name and version, and a counter of its own (spec §6.1 Identifiers)
// 形の要素ごとに、書き直すと形が作り直される属性（render の終わりで使う）
var SHAPE_GEOM = {rect: "width", circle: "r", ellipse: "rx", path: "d", line: "x1", polyline: "points", polygon: "points"};
return class extends base.MotionElement {
  static partName = "venn";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "draw"];
  // データの形（kit/shape.js）
  static shape = (function(){
    var items = {type: ["array", "string"], items: {type: "string"}};
    return {
      schema: {type: "object", additionalProperties: false, required: ["sets"], properties: {
        sets: {type: "array", minItems: 2, maxItems: 3, items: {type: "object", additionalProperties: false, required: ["label"], properties: {
          label: {type: "string"}, tone: {type: "string"}}}},
        regions: {type: "object", additionalProperties: false, properties: {A: items, B: items, C: items, AB: items, AC: items, BC: items, ABC: items}}}},
      example: {sets: [{label: "哺乳類"}, {label: "海の生き物"}], regions: {A: ["ライオン"], B: ["マグロ"], AB: ["クジラ", "イルカ"]}},
    };
  })();
  static props = {
    size:     {type: "number", default: 26, doc: "項目の字の大きさ（px）。収まらなければ 24 まで縮める"},
    dur:      {type: "number", default: 0.7, doc: "1 つの集合（と重なり）が現れる秒数"},
    spread:   {type: "number", default: 1, doc: "円の中心の間の距離 ÷ 半径（小さいほど重なりが広い。0.7〜1.3）"},
    overlaps: {type: "string", default: "together", doc: "together（重なりを 1 段階でまとめて）か each（1 つずつ）"},
  };
  // 項目のある重なりの鍵（なければ 2 つの集合の重なりすべて）。順は AB・AC・BC・ABC
  overlapKeys(){
    var d = this.data || {}, n = Math.min(3, (d.sets || []).length), R = d.regions || {};
    var all = n === 3 ? ["AB", "AC", "BC", "ABC"] : ["AB"];
    var has = all.filter(function(k){ var v = R[k]; return v && (Array.isArray(v) ? v.length : String(v).trim()); });
    return has.length ? has : n === 3 ? ["AB", "AC", "BC", "ABC"] : ["AB"];
  }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var n = ((this.data || {}).sets || []).length;
    return n + (this.props.overlaps === "each" ? this.overlapKeys().length : 1);
  }
  mount(ctx){
    var P = this.props, D = base, data = this.data || {sets: []}, self = this, id = ID + (++count);
    this.variant = base.variant(this);
    // 形（static shape）では書けない決まり：集合が 2 つなら C を含む領域（C・AC・BC・ABC）は書けない。黙って項目を落とさない
    if ((data.sets || []).length < 3){
      var bad = Object.keys(data.regions || {}).filter(function(k){ return k.indexOf("C") >= 0; });
      if (bad.length) throw new Error("m-venn: regions " + bad.join(", ") + " need a third set, but sets has " + (data.sets || []).length + " (with two sets write only A, B and AB)");
    }
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var sets = data.sets || [], n = sets.length, R = data.regions || {}, LET = "ABC";
    var TONES = /^(term|emph|muted|accent2|series-[1-4])$/, DEF = ["term", "accent2", "series-4"];
    var tone = function(i){ return "var(--" + (TONES.test(sets[i].tone || "") ? sets[i].tone : DEF[i]) + ")"; };
    var est = function(s, fs, bold){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.33 : /[\u0000-ɏ]/.test(c) ? 0.6 : 1); }, 0) * fs * (bold ? 1.04 : 1); };
    var linesOf = function(v){ return v === undefined ? [] : Array.isArray(v) ? v.map(String) : String(v).split("\n"); };
    // 円の配置：名前の幅を外に取って、要素の箱に収まる最大の半径
    var LS = 30, sp = Math.max(0.5, Math.min(1.5, P.spread));
    var lab = sets.map(function(s){ return est(s.label, LS, true); });
    var lw = Math.max.apply(null, lab.concat([0])) + 14;
    var C = [], r;
    if (n === 3){
      // 左上 A・右上 B・下 C。高さ 2r + 0.866 d、幅 2r + d と左右の名前
      r = Math.min((H - 8) / (2 + 0.866 * sp), (W - 2 * lw) / (2 + sp));
      var d = sp * r, top = (H - (2 * r + 0.866 * d)) / 2 + r;
      C = [{x: W / 2 - d / 2, y: top}, {x: W / 2 + d / 2, y: top}, {x: W / 2, y: top + 0.866 * d}];
    } else {
      r = Math.min((H - 8) / 2, (W - 2 * lw) / (2 + sp));
      var d2 = sp * r;
      C = [{x: W / 2 - d2 / 2, y: H / 2}, {x: W / 2 + d2 / 2, y: H / 2}];
    }
    C.forEach(function(c){ c.r = r; });
    // 点 (x, y) を含む集合の文字の組（"", "A", "AB", …）
    var keyAt = function(x, y){ var s = ""; for (var i = 0; i < n; i++) if ((x - C[i].x) * (x - C[i].x) + (y - C[i].y) * (y - C[i].y) < r * r) s += LET[i]; return s; };
    var clear = function(x, y){ var m = Infinity; for (var i = 0; i < n; i++) m = Math.min(m, Math.abs(Math.hypot(x - C[i].x, y - C[i].y) - r)); return m; };
    // 領域 key の中に、行の幅 ws・行の高さ lh の字の塊を置く位置：どの行の箱も領域の中にあり、円の線から最も離れる中心
    var place = function(key, ws, lh){
      var inc = [...key].map(function(ch){ return C[LET.indexOf(ch)]; });
      var x0 = Math.max.apply(null, inc.map(function(c){ return c.x - r; })), x1 = Math.min.apply(null, inc.map(function(c){ return c.x + r; }));
      var y0 = Math.max.apply(null, inc.map(function(c){ return c.y - r; })), y1 = Math.min.apply(null, inc.map(function(c){ return c.y + r; }));
      var h = ws.length * lh, best = null, part = null, pad = 6;
      for (var py = y0 + h / 2; py <= y1 - h / 2; py += 4) for (var px = x0; px <= x1; px += 4){
        var sc = Infinity, inside = 0, tot = 0;
        for (var j = 0; j < ws.length; j++){
          var ya = py - h / 2 + j * lh - pad, yb = ya + lh + pad * 2, hw = ws[j] / 2 + pad, nx = Math.max(2, Math.ceil(hw / 20));
          for (var q = 0; q <= nx; q++) for (var yy = 0; yy < 2; yy++){
            var xx = px - hw + 2 * hw * q / nx, y = yy ? yb : ya;
            tot++;
            if (keyAt(xx, y) === key){ inside++; sc = Math.min(sc, clear(xx, y)); }
          }
        }
        // 全部が中に入る位置のうち円の線から最も離れる所。なければ中に入る点の多い所（収まらない印 fit: false）
        if (inside === tot){ if (!best || sc > best.sc + 0.01) best = {x: px, y: py, sc: sc, fit: true}; }
        else if (!part || inside / tot > part.f + 1e-9) part = {x: px, y: py, f: inside / tot, fit: false};
      }
      return best || part;
    };
    var keys = n === 3 ? ["A", "B", "C", "AB", "AC", "BC", "ABC"] : ["A", "B", "AB"];
    var L = null;
    for (var fs = Math.max(24, P.size); fs >= 24; fs--){
      var lh = Math.round(fs * 1.25), ok = true, pos = {};
      keys.forEach(function(k){
        var ls = linesOf(R[k]);
        if (!ls.length) return;
        var ws = ls.map(function(s){ return est(s, fs, k.length > 1); }), p = place(k, ws, lh);
        if (!p || !p.fit){ ok = false; if (!p){ var inc = [...k].map(function(ch){ return C[LET.indexOf(ch)]; });
          p = {x: inc.reduce(function(a, c){ return a + c.x; }, 0) / inc.length, y: inc.reduce(function(a, c){ return a + c.y; }, 0) / inc.length}; } }
        pos[k] = {x: p.x, y: p.y, lines: ls};
      });
      L = {fs: fs, lh: lh, pos: pos, ok: ok};
      if (ok) break;
    }
    if (!L.ok) ctx.report("size", "[venn] the items do not fit in their regions even at 24 px (shorten them or make the element larger)");
    // 切り抜き：円 i の内（in）と外（out。大きな四角から円をくりぬく）
    var defs = D.el("defs", {}, svg);
    var circ = function(c){ return "M" + (c.x - r).toFixed(2) + "," + c.y.toFixed(2) + "a" + r.toFixed(2) + "," + r.toFixed(2) + " 0 1,0 " + (2 * r).toFixed(2) + ",0a" + r.toFixed(2) + "," + r.toFixed(2) + " 0 1,0 " + (-2 * r).toFixed(2) + ",0Z"; };
    C.forEach(function(c, i){
      D.el("circle", {cx: c.x, cy: c.y, r: r}, D.el("clipPath", {id: id + "-in" + i}, defs));
      D.el("path", {d: "M-20,-20H" + (W + 20) + "V" + (H + 20) + "H-20Z" + circ(c), "clip-rule": "evenodd"}, D.el("clipPath", {id: id + "-out" + i}, defs));
    });
    // 領域 key の形に切り抜いた入れ物（except の円は切り抜きに使わない：その円の線を、その円の外側の条件なしで描くため）
    var clipped = function(parent, key, except){
      var g = parent;
      for (var i = 0; i < n; i++){
        if (i === except) continue;
        g = D.el("g", {"clip-path": "url(#" + id + (key.indexOf(LET[i]) >= 0 ? "-in" : "-out") + i + ")"}, g);
      }
      return g;
    };
    var gFill = D.el("g", {}, svg), gLine = D.el("g", {}, svg), gHi = D.el("g", {}, svg), gText = D.el("g", {}, svg);
    var text = function(g, k, bold){
      var p = L.pos[k];
      if (!p) return;
      var y0 = p.y - (p.lines.length - 1) * L.lh / 2 + L.fs * 0.36;
      p.lines.forEach(function(s, j){ D.mtext(g, p.x, y0 + j * L.lh, s, {"text-anchor": "middle", "font-size": L.fs, fill: "var(--fg)", "font-weight": bold ? 700 : 400}); });
    };
    // 集合：塗り・線・名前・その集合だけの項目
    this.sets = C.map(function(c, i){
      var col = tone(i), st = i + 1;
      var fill = D.el("circle", {cx: c.x, cy: c.y, r: r, fill: col, "fill-opacity": 0.13, opacity: 0}, gFill);
      var line = D.el("circle", {cx: c.x, cy: c.y, r: r, fill: "none", stroke: col, "stroke-width": 3, pathLength: 1, opacity: 0,
        transform: "rotate(" + (i === 0 ? 180 : i === 1 ? 0 : 90) + " " + c.x.toFixed(2) + " " + c.y.toFixed(2) + ")"}, gLine);
      var gt = D.el("g", {opacity: 0}, gText);
      // 名前は円の外：A は左上、B は右上、C は右下
      var ang = n === 3 ? [150, 30, -30][i] : [135, 45][i], ca = Math.cos(ang * Math.PI / 180), sa = Math.sin(ang * Math.PI / 180);
      var lx = c.x + ca * (r + 12), ly = c.y - sa * (r + 12) + (sa < 0 ? LS * 0.8 : 0);
      // 灰色の集合（--muted・--series-4）の名前は、ほかの円の薄い塗りに重なると 4.5:1 に届かないので --fg（共通の決まり §2.3）
      D.mtext(gt, lx, ly, sets[i].label, {"text-anchor": ca < 0 ? "end" : "start", "font-size": LS, "font-weight": 700, fill: /muted|series-4/.test(col) ? "var(--fg)" : col});
      text(gt, LET[i], false);
      return {fill: fill, line: line, gt: gt, step: st};
    });
    // 重なり：--emph-tint で塗り、縁を --emph の線で囲み、項目を太字で出す
    var oks = this.overlapKeys(), each = P.overlaps === "each";
    this.hi = oks.map(function(k, j){
      var g = D.el("g", {opacity: 0}, gHi);
      D.el("rect", {x: -20, y: -20, width: W + 40, height: H + 40, fill: "var(--emph-tint)"}, clipped(g, k, -1));
      for (var i = 0; i < n; i++) D.el("circle", {cx: C[i].x, cy: C[i].y, r: r, fill: "none", stroke: "var(--emph)", "stroke-width": 4}, clipped(g, k, i));
      var gt = D.el("g", {opacity: 0}, gText);
      text(gt, k, true);
      return {g: g, gt: gt, step: n + (each ? j + 1 : 1)};
    });
    // 形の一覧（render の終わりに形を作り直すため。下の render を見る）
    this.shapes = [].slice.call(svg.querySelectorAll("rect,circle,ellipse,path,line,polyline,polygon"));
  }
  duration(k){
    return k >= 1 && k <= this.steps ? this.props.dur : 0;
  }
  cues(){ return null; }
  render(k, t, ctx){
    var D = base, F = this.props.dur, draw = this.variant === "draw", lecture = !!ctx.preview;
    // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    var dim = lecture ? base.previewOpacity(this) : 0.45;
    // 段階 s の中の進み具合（0〜1）：start から len 秒。授業の表示では先の段階を dim の濃さで見せる
    var pr = function(s, start, len){
      var e = s < k ? 1 : s > k ? 0 : D.prog(t, start, len);
      return lecture ? (s > k ? dim : s === k ? D.lerp(dim, 1, e) : 1) : e;
    };
    this.sets.forEach(function(o){
      if (draw && !lecture){
        // 線を引く（dur の 60 %）→ 塗りと字（後ろの 50 %）
        var a = pr(o.step, 0, F * 0.6), b = pr(o.step, F * 0.5, F * 0.5);
        o.line.setAttribute("opacity", a > 0 ? 1 : 0);
        o.line.setAttribute("stroke-dasharray", a >= 1 ? "none" : a.toFixed(4) + " 1");
        o.fill.setAttribute("opacity", b.toFixed(3));
        o.gt.setAttribute("opacity", b.toFixed(3));
      } else {
        var e = pr(o.step, 0, F);
        o.line.setAttribute("opacity", e.toFixed(3));
        o.line.removeAttribute("stroke-dasharray");
        o.fill.setAttribute("opacity", e.toFixed(3));
        o.gt.setAttribute("opacity", e.toFixed(3));
      }
    });
    // 重なり：塗りと縁（dur の前の 60 %）、項目（後ろの 60 %）。見せ方によらず同じ
    this.hi.forEach(function(o){
      o.g.setAttribute("opacity", pr(o.step, 0, F * 0.6).toFixed(3));
      o.gt.setAttribute("opacity", pr(o.step, F * 0.4, F * 0.6).toFixed(3));
    });
    // 形を作り直す（同じ値を書き直すだけで、DOM は変わらない）。Chrome は、変わっていない形を近くの変化のために塗り直す（ラスタライズし直す）と、
    // 2 回目からその形の輪郭（曲線の縁）を別の方法で描き、縁の画素が数十個変わる（ソフトウェアの GPU、CI の Linux・Windows）。
    // 何回塗り直されたかは呼び出しの間にコマが描かれたかで決まるので、作り直さないと同じ (k, t) でも呼び出しの順と時刻で画素が変わる（docs/contract.md §3）
    this.shapes.forEach(function(e){ var a = SHAPE_GEOM[e.localName], v = e.getAttribute(a); if (v !== null) e.setAttribute(a, v); });
  }
};
});
