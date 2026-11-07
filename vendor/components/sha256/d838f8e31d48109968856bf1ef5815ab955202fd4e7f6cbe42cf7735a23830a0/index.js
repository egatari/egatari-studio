// m-sweep：パラメータを動かして関数の形の変化を見せる。前の形は灰色で残す
// <m-sweep f="u*u + c*u*u*u + c*c*u**4" values="[0,0.5,1]" xr="[-3,3]" yr="[0,16]" xt="[-2,0,2]" yt="[0,5,10,15]"
//          xl="*u*" yl="損失" param="c" style="height:380px"></m-sweep>
// 段階 k（1〜values.length-1）で、値を values[k-1] から values[k] へ動かす。at="[0.5, 3]" なら変化をすべて段階 1 に入れ、
// i 番目の変化を at[i] 秒から始める。point='{"u": 9.8, "label": "平均待ち {y} 日"}' は u の所の曲線の上の点（値の変化について動く）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity、plot の Plot、expr の compile を使い、
// プレイヤーのグローバルは使わない（1.x は式の評価器 egatari-expr を写して持っていた）
egatariParts.define({name: "sweep", version: "2.1.0", requires: {base: "1.1.0", expr: "1.0.0", plot: "1.1.0"}, element: "m-sweep"}, function(deps){
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
    at:     {type: "json",   default: null, doc: "変化ごとの開始秒（増える順）。あれば全部を段階 1 で", shape: {type: "array", items: {type: "number"}}, example: [0.5, 3]},
    point:  {type: "json",   default: null, doc: "曲線上の点 {u, label（{y} = 値）, digits}", shape: {type: "object", properties: {u: {type: "number"}, label: {type: "string"}, digits: {type: "number"}}, required: ["u"]}, example: {u: 9.8, label: "平均待ち {y} 日", digits: 1}},
    dur: {type: "number", default: 1.2, doc: "1 段階の動きの秒数"},
    size: {type: "number", default: 0, doc: "字の大きさ（24 以上。0 = 既定）"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.ats ? 1 : this.props.values.length - 1; }
  // at のときの変化の開始秒（なければ null）。数でない・数が合わない・減る列は知らせて、段階ごとの動きに戻す
  get ats(){
    var A = this.props.at, n = this.props.values.length - 1;
    if (A === null || A === undefined) return null;
    if (!Array.isArray(A) || A.length !== n || A.some(function(x, i){ return typeof x !== "number" || !isFinite(x) || x < 0 || (i > 0 && x < A[i - 1]); })) return null;
    return A;
  }
  mount(ctx){
    var P = this.props, D = base, self = this;
    this.classList.add("plot"); this.style.display = "block";
    // 式は木にしてから計算する（コードとしては実行しない。Egatari spec §6）。書けない式は SyntaxError で、base が受け止めて札を出す（spec §6.1 Containment）
    var g = expr.compile(P.f, {name: "f", vars: ["u", "c"]});
    this.g = function(c){ return function(u){ return g(u, c); }; };
    // size：字の大きさ（24 未満は 24 にして知らせる）。0 なら 2.0 と同じ大きさと余白
    var S = P.size > 0 ? Math.max(24, P.size) : 0, k = S ? S / 26 : 1;
    if (P.size > 0 && P.size < 24) ctx.report("attr", "[sweep] size " + P.size + " is under 24 px; 24 is used");
    this.fs = {lab: S ? Math.round(S * 1.04) : 27, ghost: S ? Math.max(24, Math.round(S * 0.92)) : 24, pt: S || 26};
    var p = this.p = plot.Plot(this, {xr: P.xr, yr: P.yr, xt: P.xt, yt: P.yt, xl: P.xl, yl: P.yl, fs: S || undefined, m: {l: Math.round(86 * k), r: 10, t: Math.round(40 * k), b: Math.round(64 * k)}});
    this.ghosts = P.values.map(function(){ return D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, "clip-path": p.clip, opacity: 0}, p.svg); });
    // 有限でない値のある線は、その所で切って引き、値ごとに 1 回知らせる
    var pts = P.values.map(function(v, i){
      var q = samples(p, self.g(v), P.xr[0], P.xr[1], 300);
      self.ghosts[i].setAttribute("d", pathOf(q));
      if (q.indexOf(null) >= 0) ctx.report("data", "[sweep] f is not a finite number (NaN or ±Infinity) at some u for " + P.param + " = " + v + "; the line is broken there");
      return q;
    });
    this.cur = D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 3.5, "clip-path": p.clip}, p.svg);
    if (P.at !== null && P.at !== undefined && !this.ats) ctx.report("attr", "[sweep] at must be " + (P.values.length - 1) + " non-negative seconds in increasing order (one per change); each change gets its own step instead");
    var A = this.ats; if (A) for (var j = 1; j < A.length; j++) if (A[j] < A[j - 1] + P.dur) { ctx.report("attr", "[sweep] change " + (j + 1) + " starts at " + A[j] + " s, before change " + j + " ends (" + (A[j - 1] + P.dur) + " s); it takes over from there"); break; }
    // 曲線の上の点：u の所の f。値ごとに図の中にあるか確かめる（外なら知らせて、その間は点と字を隠す）
    this.pt = null;
    if (P.point !== null && P.point !== undefined){
      var pt = P.point;
      if (!pt || typeof pt !== "object" || typeof pt.u !== "number" || !isFinite(pt.u)) ctx.report("attr", "[sweep] point needs a number u (where on the curve)");
      else {
        if (pt.u < Math.min(P.xr[0], P.xr[1]) || pt.u > Math.max(P.xr[0], P.xr[1])) ctx.report("range", "[sweep] point.u = " + pt.u + " is outside xr");
        P.values.forEach(function(v){ var y = self.g(v)(pt.u); if (!isFinite(y) || y < Math.min(P.yr[0], P.yr[1]) || y > Math.max(P.yr[0], P.yr[1])) ctx.report("range", "[sweep] the point at u = " + pt.u + " is " + (isFinite(y) ? y : "not a number") + " for " + P.param + " = " + v + ", outside yr (hidden there)"); });
        this.pt = {u: pt.u, label: typeof pt.label === "string" ? pt.label : "", digits: typeof pt.digits === "number" ? pt.digits : P.digits,
          dot: D.el("circle", {r: 9, fill: "var(--emph)", stroke: "var(--bg)", "stroke-width": 3}, p.svg),
          text: D.el("text", {fill: "var(--emph)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", "font-size": this.fs.pt}, p.svg)};
      }
    }
    this.lab = D.mtext(p.svg, p.m.l + 10, Math.round(30 * k), "", {fill: "var(--emph)", "font-size": this.fs.lab});
    // 灰色の線の名前（「σ = 0.5」）：最後の段階で残る線（最後の値と違う値。同じ値は最初の 1 本）に、--muted の 24px で線の上に（背景色で縁取って）書く。
    // 5 本以上なら最初と最後だけ。置き場所は最後の段階の形（今の線と灰色の線）で決め、灰色の線が見えている間だけ出す
    var V = P.values, L = V.length - 1, fs = this.fs.ghost, wOf = function(str){ return D.textWidth(str, fs, {font: self, mark: true}); };   // base の textWidth（記法の * _ ^ を除く）
    var shown = [];
    V.forEach(function(v, i){ if (i < L && v !== V[L] && V.indexOf(v) === i) shown.push(i); });
    if (shown.length > 4) shown = [shown[0], shown[shown.length - 1]];
    var LS = this.fs.lab, LY = Math.round(30 * k), lw = 0; V.forEach(function(v){ lw = Math.max(lw, wOf(P.param + " = " + v.toFixed(P.digits)) * LS / fs); });
    var boxes = [[p.m.l + 10, LY - LS * 0.88, p.m.l + 10 + lw, LY + LS * 0.22]];
    // 曲線の上の点の字（最後の値の所）にも灰色の線の名前をかけない
    if (this.pt){ var fa = this.ptAt(V[L]); if (fa.inside && fa.str) boxes.push(fa.box); }
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
  // 曲線の上の点の置き場所（値 c のとき）：点、字（{y} を今の値に）、字の箱。字は点の右上、図の右端に近ければ左上。図の外なら inside = false
  ptAt(c){
    var q = this.pt, P = this.props, p = this.p, y = this.g(c)(q.u), inside = isFinite(y) && y >= Math.min(P.yr[0], P.yr[1]) && y <= Math.max(P.yr[0], P.yr[1]);
    var X = p.x(q.u), Y = inside ? p.y(y) : 0, str = q.label.replace(/\{y\}/g, inside ? y.toFixed(q.digits) : "");
    var F = this.fs.pt, w = base.textWidth(str, F, {font: this}), right = X + 14 + w <= p.W - p.m.r, tx = right ? X + 14 : X - 14, ty = Math.max(p.m.t + F * 0.8, Y - 14);
    return {inside: inside, X: X, Y: Y, str: str, tx: tx, ty: ty, anchor: right ? "start" : "end", box: [right ? tx : tx - w, ty - F * 0.88, right ? tx + w : tx, ty + F * 0.22]};
  }
  duration(k){ var A = this.ats; return k >= 1 ? (A ? A[A.length - 1] + this.props.dur : this.props.dur) : 0; }
  // 変化の始まり（at のとき）：口述原稿の {cue} に合わせる同期点
  cues(k){ var A = this.ats; return A && k === 1 ? A.slice() : null; }
  render(k, t, ctx){
    var P = this.props, V = P.values, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0;
    // 先を薄く見せる表示：後の段階で動いていく先の値の線を、強調の色でテーマの --preview-opacity（なければ 0.45）で描く
    // pos：始まった変化の数（灰色の線と先を見せる線の境）。at なら段階 1 の中の秒で、なければ段階で決まる
    var A = this.ats, c, pos;
    if (A){
      pos = 0; c = V[0];
      if (k >= 1) for (var i = 0; i < A.length; i++) if (t >= A[i]){ pos = i + 1; c = base.lerp(V[i], V[i + 1], base.prog(t, A[i], P.dur)); }
    } else {
      var to = V[Math.min(k, V.length - 1)], from = k >= 1 ? V[k - 1] : to;
      c = base.lerp(from, to, base.prog(t, 0, P.dur)); pos = Math.min(k, V.length - 1);
    }
    this.cur.setAttribute("d", pathOf(samples(this.p, this.g(c), P.xr[0], P.xr[1], 300)));
    this.lab.textContent = P.param + " = " + c.toFixed(P.digits);
    V.forEach(function(v, i){
      var e = this.ghosts[i], ahead = preview && i > pos && v !== c, col = ahead ? "var(--emph)" : "var(--line)";
      // style は base.el と同じ書き方で書く（style.stroke に代入すると "stroke: var(--x);" になり、作った直後と字が変わる）
      e.setAttribute("style", "stroke:" + col + ";");
      e.setAttribute("opacity", ahead ? PV : i < pos && v !== c ? 1 : 0);
    }, this);
    // 灰色の線の名前は、その線が灰色で見えている間だけ
    this.glabs.forEach(function(o){ o.el.setAttribute("opacity", o.i < pos && V[o.i] !== c ? 1 : 0); });
    // 曲線の上の点と、その字（{y} は今の値）。字は点の右上、図の右端に近ければ左上。図の外の値なら隠す
    var q = this.pt;
    if (q){
      var a = this.ptAt(c);
      q.dot.setAttribute("cx", a.X.toFixed(1)); q.dot.setAttribute("cy", a.Y.toFixed(1)); q.dot.setAttribute("opacity", a.inside ? 1 : 0);
      q.text.setAttribute("x", a.tx.toFixed(1)); q.text.setAttribute("y", a.ty.toFixed(1)); q.text.setAttribute("text-anchor", a.anchor);
      if (q.text.textContent !== a.str) q.text.textContent = a.str;
      q.text.setAttribute("opacity", a.inside && a.str ? 1 : 0);
    }
  }
};
});
