// m-curves：同じ座標軸に線を 1 本ずつ引く。線の名前は凡例でなく線の端に直接書く
// <m-curves xr="[-3,3]" yr="[0,0.5]" xt="[-2,0,2]" yt="[0,0.2,0.4]" xl="*y*" yl="密度" style="height:380px">
//   <script type="application/json">[{"label":"予測分布","f":"N(x,0,1)"},{"label":"中央値","pts":[[0,0],[0,0.4]],"dash":true}]
//   （JSON の終わり）</m-curves>
// 1 系列 = 1 段階（書いた順。系列の step で変えられ、同じ step の系列は一緒に引く）。f は x の式（Math の関数と N(x,平均,標準偏差) が使える）、pts は点列
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・previewOpacity、plot の Plot、expr の compile を使い、
// プレイヤーのグローバルは使わない（1.x は式の評価器 egatari-expr を写して持っていた）。破線の mask の id は
// curves-2-0-2-<n>m<系列>：このパーツの名前と版に、このパーツだけの数え（1.x は mc<n>m<系列> で、DECK.Plot の数えを進めていた）
egatariParts.define({name: "curves", version: "2.1.1", requires: {base: "1.1.0", expr: "1.0.0", plot: "1.1.1"}, element: "m-curves"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot, expr = deps.expr;
var ID = "curves-2-0-2-";   // name and version of this part, dots replaced (spec §6.1 Identifiers)
var count = 0;              // this part's own counter for its ids (deterministic: the order of mounting)
// 線の名前（26px）の下付き・上付きの分の高さ（px）。base 1.1.0 で mtext の下付き・上付きは 24px 以上になり、下付きの字の下端は基線から
// 添字の 0.75 倍まで、上付きの字の上端は 1.4 倍まで届く（Source Sans 3 で測った値。BIZ UDPGothic ではそれぞれ 0.5 倍と 1.2 倍）。
// 字の下の余白（字の 0.12 倍）・上の高さ（0.88 倍）を超える分。記法がなければ 0
function subX(s, fs){ var ss = Math.max(24, Math.round(fs * 0.75)); return /_./.test(s) ? Math.max(0, 0.75 * ss - 0.12 * fs) : 0; }
function supX(s, fs){ var ss = Math.max(24, Math.round(fs * 0.75)); return /\^./.test(s) ? Math.max(0, 1.4 * ss - 0.88 * fs) : 0; }
return class extends base.MotionElement {
  static partName = "curves";   // the registry name (define meta name), for report prefixes
  // データの形（kit/shape.js）：線の配列。軸（xr yr xt yt xl yl）は属性に書く（JSON の中ではない）
  static shape = {
    schema: {type: "array", items: {type: "object", additionalProperties: false, anyOf: [{required: ["f"]}, {required: ["pts"]}],
      properties: {label: {type: "string"}, f: {type: "string"}, pts: {type: "array", items: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2}},
        tone: {type: "string"}, step: {type: "integer"}, labelAt: {type: "number"},
        color: {type: "string"}, dash: {type: "boolean"}, xr: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2},
        at: {type: "number"}, anchor: {enum: ["right", "left", "above", "below", "top", "bottom", "start", "middle", "end"]}, dx: {type: "number"}, dy: {type: "number"}, ly: {type: "number"}}}},
    example: [{label: "需要 D", f: "10 - x"}, {label: "供給 S", f: "2 + x"}, {label: "均衡", pts: [[4, 0], [4, 6]], dash: true}],
    // よくある書き違い（指示の部品の一覧に書く）
    note: {en: "the data is the array itself, not {\"series\": […]}; axes go in attributes (xr=\"[0,10]\" xl=\"…\"); the expression field is f in x (not fn, not u)",
           ja: "データは配列そのもの（{\"series\": […]} ではない）。軸は属性に書く（xr=\"[0,10]\" xl=\"…\"）。式の欄は f で、変数は x（fn・u ではない）"},
  };
  static props = {
    xr: {type: "json", default: [0, 1], doc: "横軸の範囲"}, yr: {type: "json", default: [0, 1], doc: "縦軸の範囲"},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    n:   {type: "number", default: 300, doc: "f を描く分割数"},
    dur: {type: "number", default: 1.0, doc: "1 本を引く秒数"},
    lw:  {type: "number", default: 3.5, doc: "線の太さ"},
    size: {type: "number", default: 0, doc: "字の大きさ（24 以上。0 = 既定）"},
  };
  // 系列 i の段階：step（書いてあれば）、なければ i + 1。段階の数はその最大（step がなければ系列の数で、今までと同じ）
  stepOf(s, i){ return s && s.step !== undefined ? s.step : i + 1; }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var self = this, m = 0;
    (this.data || []).forEach(function(s, i){ m = Math.max(m, self.stepOf(s, i)); });
    return m;
  }
  mount(ctx){
    var P = this.props, D = base, self = this, S = this.data || [];
    this.classList.add("plot"); this.style.display = "block";
    // size：字の大きさ（24 未満は 24 にして知らせる）。0 なら 2.0 と同じ大きさと余白
    var SZ = P.size > 0 ? Math.max(24, P.size) : 0, K = SZ ? SZ / 26 : 1, F = SZ || 26;
    if (P.size > 0 && P.size < 24) ctx.report("attr", "[curves] size " + P.size + " is under 24 px; 24 is used");
    var p = this.p = plot.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xf: P.xf, yf: P.yf, xl: P.xl, yl: P.yl, fs: SZ || undefined, m: {l: Math.round(86 * K), r: 24, t: Math.round(24 * K), b: Math.round(64 * K)}});
    var uid = ID + (++count), defs = D.el("defs", {}, p.svg);
    var N = function(x, m, s){ return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); };
    var x0 = p.m.l, x1 = p.W - p.m.r, y0 = p.m.t, y1 = p.H - p.m.b;
    // 系列ごとに：点列、線、（破線なら）描く範囲の mask、端の名前
    this.items = S.map(function(s, i){
      var pts;
      if (s.pts) pts = s.pts.map(function(q){ return [p.x(q[0]), p.y(q[1])]; });
      else {
        // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、base が受け止めて札を出す（spec §6.1 Containment）
        var g = expr.compile(s.f, {name: "[" + i + "].f", vars: ["x"], funcs: {N: N}, bareMath: true}), a = s.xr ? s.xr[0] : P.xr[0], b = s.xr ? s.xr[1] : P.xr[1];
        pts = [];
        for (var j = 0; j <= P.n; j++){ var v = a + (b - a) * j / P.n; pts.push([p.x(v), p.y(g(v))]); }
      }
      // 有限でない点（NaN・±Infinity）は線を切り、有限な区間ごとに M から引き直す（1 つの NaN で線全体が消えない）
      var d = "", pen = false, gap = false;
      pts.forEach(function(q){
        if (isFinite(q[0]) && isFinite(q[1])){ d += (pen ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); pen = true; }
        else { pen = false; gap = true; }
      });
      if (gap) ctx.report("data", "[curves] series " + i + " (" + JSON.stringify(s.label || "") + ") has points that are not finite numbers (NaN or ±Infinity, e.g. log or division by zero); the line is broken there");
      pts = pts.filter(function(q){ return isFinite(q[0]) && isFinite(q[1]); });
      var col = colorOf(s.tone || s.color, i);
      var it = {step: self.stepOf(s, i)};
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
      // 名前の位置：labelAt（横軸の値）の点、なければ描画範囲の中の最後の点。at は labelAt の古い名前（labelAt がないときだけ）
      var inside = pts.filter(function(q){ return q[0] >= x0 - .5 && q[0] <= x1 + .5 && q[1] >= y0 - .5 && q[1] <= y1 + .5; });
      var end = inside.length ? inside[inside.length - 1] : pts[pts.length - 1];
      var lat = s.labelAt !== undefined ? s.labelAt : s.at;
      if (!end){ it.lx = it.ly = it.x0 = it.x1 = 0; it.anchor = "start"; it.col = col; it.label = ""; return it; }   // 有限な点がない：名前は書かない
      if (lat !== undefined){
        var ax = p.x(lat), best = pts[0];
        pts.forEach(function(q){ if (Math.abs(q[0] - ax) < Math.abs(best[0] - ax)) best = q; });
        end = best;
      }
      // anchor：right（点の右から書く）・left（点の左で終わる）・above / below（点の上・下に中央そろえ、約 0.9 字ぶん離す）。
      // start / middle / end は古い書き方（text-anchor そのもの）で、今までどおり
      var an = {top: "above", bottom: "below"}[s.anchor] || s.anchor;   // top / bottom は above / below の別名
      var side = {right: "start", left: "end", above: "middle", below: "middle"}, anchor = side[an] || an || (end[0] > x1 - 160 ? "end" : "start");
      var ly0 = an === "above" ? end[1] - Math.round(14 * K) : an === "below" ? end[1] + Math.round(32 * K) : end[1] - Math.round(12 * K);
      if (an === "below" && ly0 > y1 - 4) ly0 = end[1] - Math.round(14 * K);   // 下に入らなければ上へ
      it.lx = end[0] + (anchor === "end" ? -8 : anchor === "start" ? 10 : 0) + (s.dx || 0);
      it.ly = (s.ly !== undefined ? p.y(s.ly) : ly0) + (s.dy || 0);
      // 字の幅の見積もり（26px。base の textWidth：テーマの字で測った幅。記法の * _ ^ を除く）
      var w = D.textWidth(s.label || "", F, {font: self, mark: true});
      it.x0 = anchor === "end" ? it.lx - w : anchor === "middle" ? it.lx - w / 2 : it.lx; it.x1 = it.x0 + w;
      it.anchor = anchor; it.col = col; it.label = s.label || "";
      return it;
    });
    // 名前どうしが重ならないように、横に重なる名前を下へずらす。先に描く高さ（上は 26、下は横軸の 6 px 上）に収めてから離し、
    // 下に収まらなければ下から上へ押し戻す（目盛りの数字にかからない）。上付きのある名前は上端を、下付きのある名前は下端を
    // その分だけ内に、上の名前の下付き・下の名前の上付きの分だけ間を広げる（記法がなければ今までと同じ）
    var min = Math.round(32 * K), lo = F, hi = y1 - 6, ov = function(u, v){ return u.x0 < v.x1 && v.x0 < u.x1; };
    var loOf = function(it){ return lo + supX(it.label, F); }, hiOf = function(it){ return hi - subX(it.label, F); };
    var gap = function(u, v){ return min + subX(u.label, F) + supX(v.label, F); };   // u が上、v が下
    var g = self.items.filter(function(it){ return it.label; });
    g.forEach(function(it){ it.ly = Math.min(hiOf(it), Math.max(loOf(it), it.ly)); });
    g.sort(function(u, v){ return u.ly - v.ly; });
    g.forEach(function(it, j){
      for (var q = 0; q < j; q++){
        var o = g[q];
        if (ov(it, o) && it.ly - o.ly < gap(o, it)) it.ly = o.ly + gap(o, it);
      }
    });
    for (var j = g.length - 1; j >= 0; j--){
      var it = g[j];
      it.ly = Math.min(hiOf(it), it.ly);
      for (var q = j + 1; q < g.length; q++) if (ov(it, g[q]) && g[q].ly - it.ly < gap(it, g[q])) it.ly = g[q].ly - gap(it, g[q]);
    }
    g.forEach(function(it){ it.ly = Math.max(loOf(it), it.ly); });
    this.items.forEach(function(it){
      it.lab = D.mtext(p.svg, it.lx, it.ly, it.label, {"text-anchor": it.anchor, fill: it.col, "font-size": F, "font-weight": 700, opacity: 0});
    });
    // tone：テーマの色の名前か var(--…)。知らない名前は既定の色（series-1..4 の順）にして知らせる
    function colorOf(c, i){
      var def = "var(--series-" + (i % 4 + 1) + ")";
      if (!c) return def;
      if (c.indexOf("var(") === 0) return c;
      var nm = c.replace(/^--/, "");
      if (/^(term|emph|accent2|muted|fg|line|series-[1-4])$/.test(nm)) return "var(--" + nm + ")";
      ctx.report("attr", "[curves] series " + i + ": tone " + JSON.stringify(c) + " is not term, emph, accent2, muted, fg or series-1..4 (" + def.slice(6, -1) + " is used)");
      return def;
    }
  }
  duration(k){ return k >= 1 ? this.props.dur * 0.7 + 0.6 : 0; }
  render(k, t, ctx){
    var dur = this.props.dur, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0;
    // 先を薄く見せる表示：後の段階の線と名前を、引き終えた形のままテーマの --preview-opacity（なければ 0.45）で描く
    this.items.forEach(function(it){
      if (preview && it.step > k){
        it.draw.setAttribute("stroke-dashoffset", (0).toFixed(4));
        it.path.setAttribute("opacity", PV);
        it.lab.setAttribute("opacity", PV.toFixed(3));
        return;
      }
      var pd = it.step < k ? 1 : it.step === k ? base.prog(t, 0, dur) : 0;
      var pl = it.step < k ? 1 : it.step === k ? base.prog(t, dur * 0.7, 0.6) : 0;
      it.draw.setAttribute("stroke-dashoffset", (1 - pd).toFixed(4));
      it.path.setAttribute("opacity", pd > 0 ? 1 : 0);
      it.lab.setAttribute("opacity", pl.toFixed(3));
    });
  }
};
});
