// m-sweep：パラメータを動かして関数の形の変化を見せる。前の形は灰色で残す
// <m-sweep f="u*u + c*u*u*u + c*c*u**4" values="[0,0.5,1]" xr="[-3,3]" yr="[0,16]" xt="[-2,0,2]" yt="[0,5,10,15]"
//          xl="*u*" yl="損失" param="c" style="height:380px"></m-sweep>
// 段階 k（1〜values.length-1）で、値を values[k-1] から values[k] へ動かす
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity、plot の Plot、expr の compile を使い、
// プレイヤーのグローバルは使わない（1.x は式の評価器 egatari-expr を写して持っていた）
egatariParts.define({name: "sweep", version: "2.0.1", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"}, element: "m-sweep"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot, expr = deps.expr;
// 関数 f を [a, b] で n 分割した点列（px）。有限でない値（NaN・±Infinity）の点は null
function samples(p, f, a, b, n){
  var out = [];
  for (var i = 0; i <= n; i++){ var v = a + (b - a) * i / n, x = p.x(v), y = p.y(f(v)); out.push(isFinite(x) && isFinite(y) ? [x, y] : null); }
  return out;
}
// 点列の d。null の所で線を切り、次の有限な点から M で引き直す（plot の p.d と同じ字。切れ目がなければ同じ d）
function pathOf(pts){
  var d = "", pen = false;
  pts.forEach(function(q){ if (q){ d += (pen ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); pen = true; } else pen = false; });
  return d;
}
// 線分 s = [[x, y], [x, y]] が箱 r = [x0, y0, x1, y1] にかかるか（Liang–Barsky）
function segHitsBox(s, r){
  var x = s[0][0], y = s[0][1], dx = s[1][0] - x, dy = s[1][1] - y, t0 = 0, t1 = 1;
  var pp = [-dx, dx, -dy, dy], qq = [x - r[0], r[2] - x, y - r[1], r[3] - y];
  for (var i = 0; i < 4; i++){
    if (pp[i] === 0){ if (qq[i] < 0) return false; continue; }
    var u = qq[i] / pp[i];
    if (pp[i] < 0){ if (u > t1) return false; if (u > t0) t0 = u; }
    else { if (u < t0) return false; if (u < t1) t1 = u; }
  }
  return true;
}
// 灰色の線の名前の置き場所：その線の上に、線の点を中心にして置く（字は背景色の縁取りで線を切るので、どの線の名前か読める）。
// bd（字を置ける範囲）の中で、置いた字（boxes）に重ならず、ほかの線（lines：点列の配列。cl の中だけ描かれる）にかかる数が最も少なく、
// 自分の線が字の高さの中に収まり（平らな所）、ほかの線から離れている所（40 px まで）。w は字の幅の見積もり、fs は字の大きさ。置けなければ null
function placeOn(own, w, fs, lines, boxes, bd, cl){
  var best = null, bc = Infinity;
  var hits = function(L, r){
    var q = [Math.max(r[0], cl[0]), Math.max(r[1], cl[1]), Math.min(r[2], cl[2]), Math.min(r[3], cl[3])];
    if (q[0] >= q[2] || q[1] >= q[3]) return false;
    for (var i = 1; i < L.length; i++) if (L[i - 1] && L[i] && segHitsBox([L[i - 1], L[i]], q)) return true;
    return false;
  };
  for (var j = 0; j < own.length; j += 3){
    var q = own[j];
    if (!q || q[0] < cl[0] || q[0] > cl[2] || q[1] < cl[1] || q[1] > cl[3]) continue;   // 描かれている点だけ
    // 横軸や上の端に沿う線では、字を範囲の中へ上下にずらす（線のすぐ上・下になる）
    var y = q[1] + fs * 0.33;
    y = Math.max(bd[1] + fs * 0.88, Math.min(bd[3] - fs * 0.22, y));
    var r = [q[0] - w / 2, y - fs * 0.88, q[0] + w / 2, y + fs * 0.22];
    if (r[0] < bd[0] || r[2] > bd[2]) continue;
    if (boxes.some(function(b){ return r[0] < b[2] + 6 && b[0] < r[2] + 6 && r[1] < b[3] + 4 && b[1] < r[3] + 4; })) continue;
    // ほかの線にかかれば 1 本につき 1000。自分の線が字の幅の間に字の高さより大きく上下すれば 300
    var c = 0, r3 = [r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3], gap = 40, lo = Infinity, hi = -Infinity;
    own.forEach(function(z){ if (z && z[0] >= r[0] && z[0] <= r[2]){ lo = Math.min(lo, z[1]); hi = Math.max(hi, z[1]); } });
    if (hi - lo > fs * 0.9) c += 300;
    lines.forEach(function(L){
      if (L === own) return;
      if (hits(L, r3)){ c += 1000; return; }
      L.forEach(function(z){
        if (z && z[0] >= cl[0] && z[0] <= cl[2] && z[1] >= cl[1] && z[1] <= cl[3]) gap = Math.min(gap, Math.hypot(Math.max(r[0] - z[0], 0, z[0] - r[2]), Math.max(r[1] - z[1], 0, z[1] - r[3])));
      });
    });
    c += 40 - gap + (hi - lo) / fs;
    if (c < bc){ bc = c; best = {x: q[0], y: y, box: r}; }
  }
  return best;
}
return class extends base.MotionElement {
  static partName = "sweep";   // the registry name (define meta name), for report prefixes
  // データの形（kit/shape.js）：JSON の子はなく、属性で書く（values は数の配列、2 つ以上）
  static shape = {schema: null, example: '<m-sweep f="u*u + c*u" values="[0,0.5,1]" xr="[-3,3]" yr="[0,10]"></m-sweep>'};
  static props = {
    f:      {type: "string", default: "u*u", doc: "関数の式（算術の式。変数は横軸 u とパラメータ c。Math.exp(…) などの Math の関数と定数、+ - * / % **、比較と ? : が使える）"},
    values: {type: "json",   default: [0, 1], doc: "パラメータの値の列。段階ごとに次の値へ動く", shape: {type: "array", items: {type: "number"}, minItems: 2}, example: [0, 0.5, 1]},
    param:  {type: "string", default: "c", doc: "表示するパラメータの名前"},
    xr: {type: "json", default: [-3, 3]}, yr: {type: "json", default: [0, 10]},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    digits: {type: "number", default: 2, doc: "表示する値の小数の桁数"},
    dur: {type: "number", default: 1.2, doc: "1 段階の動きの秒数"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.props.values.length - 1; }
  mount(ctx){
    var P = this.props, D = base, self = this;
    this.classList.add("plot"); this.style.display = "block";
    // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、base が受け止めて札を出す（spec §6.1 Containment）
    var g = expr.compile(P.f, {name: "f", vars: ["u", "c"]});
    this.g = function(c){ return function(u){ return g(u, c); }; };
    var p = this.p = plot.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xl: P.xl, yl: P.yl, m: {l: 86, r: 10, t: 40, b: 64}});
    this.ghosts = P.values.map(function(){ return D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, "clip-path": p.clip, opacity: 0}, p.svg); });
    // 有限でない値のある線は、その所で切って引き、値ごとに 1 回知らせる
    var pts = P.values.map(function(v, i){
      var q = samples(p, self.g(v), P.xr[0], P.xr[1], 300);
      self.ghosts[i].setAttribute("d", pathOf(q));
      if (q.indexOf(null) >= 0) ctx.report("data", "[sweep] f is not a finite number (NaN or ±Infinity) at some u for " + P.param + " = " + v + "; the line is broken there");
      return q;
    });
    this.cur = D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 3.5, "clip-path": p.clip}, p.svg);
    this.lab = D.mtext(p.svg, p.m.l + 10, 30, "", {fill: "var(--emph)", "font-size": 27});
    // 灰色の線の名前（「σ = 0.5」）：最後の段階で残る線（最後の値と違う値。同じ値は最初の 1 本）に、--muted の 24px で線の上に（背景色で縁取って）書く。
    // 5 本以上なら最初と最後だけ。置き場所は最後の段階の形（今の線と灰色の線）で決め、灰色の線が見えている間だけ出す
    var V = P.values, L = V.length - 1, fs = 24, wOf = function(str){ var w = 0; String(str).replace(/[*_^]/g, "").split("").forEach(function(ch){ w += ch.charCodeAt(0) > 255 ? fs : fs * 0.6; }); return w; };
    var shown = [];
    V.forEach(function(v, i){ if (i < L && v !== V[L] && V.indexOf(v) === i) shown.push(i); });
    if (shown.length > 4) shown = [shown[0], shown[shown.length - 1]];
    var lw = 0; V.forEach(function(v){ lw = Math.max(lw, wOf(P.param + " = " + v.toFixed(P.digits)) * 27 / 24); });
    var boxes = [[p.m.l + 10, 30 - 27 * 0.88, p.m.l + 10 + lw, 30 + 27 * 0.22]];
    var lines = [pts[L]].concat(V.map(function(v, i){ return i < L && v !== V[L] ? pts[i] : null; }).filter(Boolean));
    // 字は図の中か上の余白に（横軸の目盛りの数字にはかからない）。線は clip の中だけ描かれる
    var bd = [p.m.l + 4, 4, p.W - p.m.r, p.H - p.m.b - 2], cl = [p.m.l, p.m.t - 4, p.W - p.m.r, p.H - p.m.b];
    this.glabs = [];
    shown.forEach(function(i){
      var str = P.param + " = " + V[i].toFixed(P.digits), at = placeOn(pts[i], wOf(str), fs, lines, boxes, bd, cl);
      if (!at){ ctx.report("layout", "[sweep] no free place for the name of the grey line " + JSON.stringify(str) + " (not drawn)"); return; }
      boxes.push(at.box);
      self.glabs.push({i: i, el: D.mtext(p.svg, +at.x.toFixed(1), +at.y.toFixed(1), str, {"text-anchor": "middle", fill: "var(--muted)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", "font-size": fs, opacity: 0})});
    });
  }
  duration(k){ return k >= 1 ? this.props.dur : 0; }
  render(k, t, ctx){
    var P = this.props, V = P.values, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0;
    // 先を薄く見せる表示：後の段階で動いていく先の値の線を、強調の色でテーマの --preview-opacity（なければ 0.45）で描く
    var to = V[Math.min(k, V.length - 1)], from = k >= 1 ? V[k - 1] : to;
    var c = base.lerp(from, to, base.prog(t, 0, P.dur));
    this.cur.setAttribute("d", pathOf(samples(this.p, this.g(c), P.xr[0], P.xr[1], 300)));
    this.lab.textContent = P.param + " = " + c.toFixed(P.digits);
    V.forEach(function(v, i){
      var e = this.ghosts[i], ahead = preview && i > k && v !== c, col = ahead ? "var(--emph)" : "var(--line)";
      // style は base.el と同じ書き方で書く（style.stroke に代入すると "stroke: var(--x);" になり、作った直後と字が変わる）
      e.setAttribute("style", "stroke:" + col + ";");
      e.setAttribute("opacity", ahead ? PV : i < k && v !== c ? 1 : 0);
    }, this);
    // 灰色の線の名前は、その線が灰色で見えている間だけ
    this.glabs.forEach(function(o){ o.el.setAttribute("opacity", o.i < k && V[o.i] !== c ? 1 : 0); });
  }
};
});
