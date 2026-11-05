// m-seq：観測を 1 つずつ加えて、分布（事後分布など）と数値が更新されていく様子を見せる
// <m-seq per-step="2" style="height:400px"><script type="application/json">
//   {"xs":[…], "steps":[{"dens":[…], "readout":{"n":0,"μ_n":0.00}}, {"dens":[…], "readout":{…}, "mark":1.2}, …],
//    "xl":"*θ*", "yl":"密度", "yr":[0,2], "digits":{"n":0}, "markLabel":"*y*_n"}
// （JSON の終わり）</m-seq>
// steps[0] は始めの状態（段階 0）。steps[1..] が 1 回ずつの更新。1 段階に per-step 回の更新を、等しい時間枠で順に動かす。
// 今の分布は濃く、前の分布は薄い線で残す。右の欄に readout の数値（桁をそろえる）。mark は今回の観測の位置
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity と plot の Plot を使い、プレイヤーのグローバルは使わない
egatariParts.define({name: "seq", version: "2.0.2", requires: {base: "1.1.0", plot: "1.0.1"}, element: "m-seq"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot;
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
  static partName = "seq";   // the registry name (define meta name), for report prefixes
  // データの形（kit/shape.js）。軸の設定（xl yl yr など）も JSON に書ける
  static shape = {
    schema: {type: "object", required: ["xs", "steps"], properties: {
      xs: {type: "array", minItems: 2, items: {type: "number"}},
      steps: {type: "array", minItems: 1, items: {type: "object", required: ["dens"], properties: {dens: {type: "array", items: {type: "number"}}, readout: {type: "object"}, mark: {type: "number"}}}},
      digits: {type: "object"}, markLabel: {type: "string"}}},
    example: {xs: [-2, -1, 0, 1, 2], steps: [{dens: [0.05, 0.24, 0.4, 0.24, 0.05], readout: {n: 0}}, {dens: [0.02, 0.2, 0.5, 0.2, 0.02], readout: {n: 1}, mark: 0.3}]},
  };
  static props = {
    "per-step": {type: "number", default: 1, doc: "1 段階で動かす更新の回数"},
    slot:  {type: "number", default: 0.9, doc: "更新 1 回の秒数（cues はこの間隔）"},
    xr: {type: "json", default: null, doc: "横軸の範囲（既定は xs の端）"}, yr: {type: "json", default: [0, 1]},
    xt: {type: "json", default: []}, yt: {type: "json", default: []},
    xf: {type: "number", default: undefined}, yf: {type: "number", default: undefined},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    digits: {type: "number", default: 2, doc: "数値の小数の桁数（data.digits で名前ごとに上書き）"},
    panel:  {type: "number", default: 250, doc: "右の数値の欄の幅（px）"},
    ghosts: {type: "number", default: 99, doc: "残す前の分布の数"},
  };
  // 属性があれば属性、なければ data の同名の値、なければ既定
  opt(name){ var d = this.data || {}; return this.hasAttribute(name) || d[name] === undefined ? this.props[name] : d[name]; }
  get updates(){ return Math.max(0, ((this.data || {}).steps || []).length - 1); }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : Math.ceil(this.updates / this.props["per-step"]); }
  mount(ctx){
    var D = base, self = this, data = this.data, xs = data.xs;
    this.classList.add("plot"); this.style.display = "block";
    var xr = this.opt("xr") || [xs[0], xs[xs.length - 1]], pw = this.opt("panel");
    var p = this.p = plot.Plot(this, {xr: xr, yr: this.opt("yr"), xt: this.opt("xt"), yt: this.opt("yt"), xf: this.opt("xf"), yf: this.opt("yf"),
                                   xl: this.opt("xl"), yl: this.opt("yl"), m: {l: 86, r: pw + 16, t: 24, b: 64}});
    // 密度の点列（px）。有限でない値（NaN・±Infinity・足りない値）の点は null で、線はそこで切る
    this.pts = function(dens){ return xs.map(function(x, i){ var X = p.x(x), Y = p.y(dens[i]); return typeof dens[i] === "number" && isFinite(X) && isFinite(Y) ? [X, Y] : null; }); };
    var bad = [];
    data.steps.forEach(function(s, i){ if (self.pts(s.dens).indexOf(null) >= 0) bad.push(i); });
    if (bad.length) ctx.report("data", "[seq] steps " + bad.join(", ") + ": dens has values that are not finite numbers (NaN, ±Infinity or missing for some xs); the curve is broken there");
    // 塗り（今の分布の下）→ 前の分布の薄い線 → 今の分布の線 の順に重ねる
    this.area = D.el("path", {fill: "var(--term-tint)", stroke: "none", "clip-path": p.clip}, p.svg);
    var gG = D.el("g", {"clip-path": p.clip}, p.svg);
    this.ghostEls = data.steps.map(function(s){
      var e = D.el("path", {fill: "none", stroke: "var(--line)", "stroke-width": 2.5, opacity: 0}, gG);
      e.setAttribute("d", pathOf(self.pts(s.dens)));
      return e;
    });
    this.cur = D.el("path", {fill: "none", stroke: "var(--term)", "stroke-width": 3.5, "stroke-linejoin": "round", "clip-path": p.clip}, p.svg);
    // 観測の印：今回は縦の点線と名前、前の観測は横軸の上の小さな点
    this.dots = data.steps.map(function(s){
      return s.mark === undefined ? null : D.el("circle", {cx: p.x(s.mark), cy: p.H - p.m.b - 7, r: 6, fill: "var(--muted)", opacity: 0}, p.svg);
    });
    this.markLine = D.el("line", {x1: 0, x2: 0, y1: p.m.t + 34, y2: p.H - p.m.b, stroke: "var(--emph)", "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, p.svg);
    this.markLab = D.mtext(p.svg, 0, p.m.t + 24, data.markLabel || "", {"text-anchor": "middle", fill: "var(--emph)", "font-size": 26, opacity: 0});
    // 数値の欄（名前は左寄せ、値は右寄せ。等幅の数字）
    var keys = Object.keys(data.steps[0].readout || {}), px = p.W - pw + 8, px2 = p.W - 8;
    D.el("rect", {x: px - 8, y: p.m.t, width: pw, height: 40 + keys.length * 44, rx: 10, fill: "var(--term-tint)", stroke: "var(--line)", "stroke-width": 1.5}, p.svg);
    this.rows = keys.map(function(key, j){
      var y = p.m.t + 44 + j * 44;
      D.mtext(p.svg, px + 12, y, key, {"font-size": 28});
      var v = D.el("text", {x: px2 - 12, y: y, "text-anchor": "end", "font-size": 28, style: "font-variant-numeric:tabular-nums;font-feature-settings:'tnum'"}, p.svg);
      return {key: key, el: v, dg: (data.digits || {})[key] !== undefined ? data.digits[key] : self.props.digits};
    });
    // readout に書いていない名前は、前の値のまま出す（1 回だけ知らせる）
    var miss = [];
    keys.forEach(function(key){
      var at = []; data.steps.forEach(function(s, i){ if ((s.readout || {})[key] === undefined) at.push(i); });
      if (at.length) miss.push(JSON.stringify(key) + " (steps " + at.join(", ") + ")");
    });
    if (miss.length) ctx.report("data", "[seq] readout has no value for " + miss.join(", ") + "; the previous value is shown");
    // 灰色の線（前の分布）の名前「n = 3」：最後の段階で残る線に、--muted の 24px で線の上に（背景色で縁取って）書く。
    // 5 本以上なら最初と最後だけ。n は readout の n（*n* など、字が n の名前）の値、なければ更新の回数。
    // 置き場所は最後の段階の形（今の線・灰色の線・観測の印）で決め、その線が灰色で見えている間だけ出す
    var last = this.updates, G = this.props.ghosts, fs = 24, nk = null;
    keys.forEach(function(key){ if (nk === null && key.replace(/[*_^]/g, "") === "n") nk = key; });
    var wOf = function(str){ return D.textWidth(str, fs, {font: self, mark: true}); };   // base の textWidth（記法の * _ ^ を除く）
    var shown = [];
    for (var i = Math.max(0, last - G); i < last; i++) shown.push(i);
    if (shown.length > 4) shown = [shown[0], shown[shown.length - 1]];
    var gp = data.steps.map(function(s){ return self.pts(s.dens); });
    var lines = [gp[last]].concat(gp.slice(Math.max(0, last - G), last)), lm = data.steps[last].mark, boxes = [];
    if (lm !== undefined && last > 0){
      lines.push([[p.x(lm), p.m.t + 34], [p.x(lm), p.H - p.m.b]]);
      var mw = wOf(data.markLabel || "") * 26 / 24;
      boxes.push([p.x(lm) - mw / 2, p.m.t + 24 - 26 * 0.88, p.x(lm) + mw / 2, p.m.t + 24 + 26 * 0.22]);
    }
    data.steps.forEach(function(s, i){ if (s.mark !== undefined && i < last) boxes.push([p.x(s.mark) - 6, p.H - p.m.b - 13, p.x(s.mark) + 6, p.H - p.m.b - 1]); });
    var bd = [p.m.l + 4, 4, p.W - pw - 16, p.H - p.m.b - 2], cl = [p.m.l, p.m.t - 4, p.W - pw - 16, p.H - p.m.b];
    this.glabs = [];
    shown.forEach(function(i){
      var v = nk !== null ? (data.steps[i].readout || {})[nk] : i;
      if (v === undefined) v = i;
      var dg = nk !== null && (data.digits || {})[nk] !== undefined ? data.digits[nk] : 0;
      var str = (nk !== null ? nk : "*n*") + " = " + (typeof v === "number" ? v.toFixed(dg).replace("-", "−") : String(v));
      var at = placeOn(gp[i], wOf(str), fs, lines, boxes, bd, cl);
      if (!at){ ctx.report("layout", "[seq] no free place for the name of the grey curve " + JSON.stringify(str) + " (not drawn)"); return; }
      boxes.push(at.box);
      self.glabs.push({i: i, el: D.mtext(p.svg, +at.x.toFixed(1), +at.y.toFixed(1), str, {"text-anchor": "middle", fill: "var(--muted)", stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", "font-size": fs, opacity: 0})});
    });
  }
  // 段階 i までで readout の key に最後に書かれた値（なければ undefined）
  valAt(i, key){ var S = this.data.steps; for (; i >= 0; i--){ var v = (S[i].readout || {})[key]; if (v !== undefined) return v; } return undefined; }
  // 段階 k が受け持つ更新の番号 [first, last]
  span(k){ var P = this.props["per-step"]; return [(k - 1) * P + 1, Math.min(k * P, this.updates)]; }
  duration(k){ if (k < 1) return 0; var s = this.span(k); return Math.max(0, s[1] - s[0] + 1) * this.props.slot; }
  cues(k){
    if (k < 1) return null;
    var s = this.span(k), out = [];
    for (var j = 0; j <= s[1] - s[0]; j++) out.push(+(j * this.props.slot).toFixed(4));
    return out;
  }
  render(k, t, ctx){
    var D = base, S = this.data.steps, p = this.p, slot = this.props.slot;
    var preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 1;

    // 今の更新の番号 idx と、その更新の進み具合 e（0 なら一つ前の状態、1 なら更新後）
    var idx = 0, e = 1, tm = 0;
    if (k >= 1){
      var s = this.span(k), n = s[1] - s[0] + 1;
      if (t === Infinity){ idx = s[1]; tm = Infinity; }
      else { var j = Math.max(0, Math.min(n - 1, Math.floor(t / slot))); idx = s[0] + j; tm = t - j * slot; }
      e = D.prog(tm, 0, slot * 0.8);
    }
    var a = S[Math.max(0, idx - 1)], b = S[idx];
    // 前後のどちらかが有限でなければ補間せず、動き終わり（e = 1）は後の値、始め（e = 0）は前の値
    var dens = this.data.xs.map(function(_, i){
      var A = a.dens[i], B = b.dens[i];
      return typeof A === "number" && typeof B === "number" && isFinite(A) && isFinite(B) ? D.lerp(A, B, e) : e >= 1 ? B : e <= 0 ? A : NaN;
    });
    // 線は有限な区間ごとに引き、塗りも区間ごとに横軸まで閉じる（切れ目がなければ今までと同じ d）
    var q = this.pts(dens), d = pathOf(q), ar = "", y0 = p.y(0).toFixed(1);
    for (var i = 0; i < q.length; i++){
      if (!q[i]) continue;
      var j = i; while (j + 1 < q.length && q[j + 1]) j++;
      ar += pathOf(q.slice(i, j + 1)) + "L" + q[j][0].toFixed(1) + "," + y0 + "L" + q[i][0].toFixed(1) + "," + y0 + "Z";
      i = j;
    }
    this.cur.setAttribute("d", d);
    this.area.setAttribute("d", ar);
    var G = this.props.ghosts, last = this.updates, end = this.span(k)[1];
    // 先の段階を薄く見せる表示（授業の表示）：後の段階の終わりの分布を今の線の色で、後の観測の点とともに、
    // テーマの --preview-opacity の濃さに（途中の分布は重ねない）
    var ahead = function(i){ return preview && i > Math.max(idx, k >= 1 ? end : 0); };
    this.ghostEls.forEach(function(g, i){
      var f = ahead(i) && i === last;
      var col = f ? "var(--term)" : "var(--line)";
      // style は base.el と同じ書き方で書く（style.stroke に代入すると "stroke: var(--x);" になり、作った直後と字が変わる）
      g.setAttribute("style", "stroke:" + col + ";");
      g.setAttribute("opacity", f ? PV : i < idx && i >= idx - G ? 1 : 0);
    });
    this.dots.forEach(function(c, i){ if (c) c.setAttribute("opacity", ahead(i) ? PV : i < idx ? 1 : 0); });
    var mo = b.mark !== undefined && idx > 0 ? D.prog(tm, 0, 0.25) : 0;
    // 印のない段階では作った直後の位置（0）に戻す（前の段階の位置を残さない。docs/contract.md §3）
    var mx = b.mark !== undefined ? p.x(b.mark) : 0;
    this.markLine.setAttribute("x1", mx); this.markLine.setAttribute("x2", mx); this.markLab.setAttribute("x", mx);
    this.markLine.setAttribute("opacity", mo.toFixed(3));
    this.markLab.setAttribute("opacity", mo.toFixed(3));
    var self = this, ia = Math.max(0, idx - 1);
    this.rows.forEach(function(r){
      // 書いていない値は前の段階の値（桁もそろえる）
      var va = self.valAt(ia, r.key), vb = self.valAt(idx, r.key), v;
      if (typeof va === "number" && typeof vb === "number") v = D.lerp(va, vb, e);
      else v = e < 0.5 && va !== undefined ? va : vb;
      v = typeof v === "number" ? v.toFixed(r.dg).replace("-", "−") : String(v);
      r.el.textContent = v === "−0" || /^−0\.0*$/.test(v) ? v.slice(1) : v;
    });
    // 灰色の線の名前は、その線が灰色で見えている間だけ
    this.glabs.forEach(function(o){ o.el.setAttribute("opacity", !ahead(o.i) && o.i < idx && o.i >= idx - G ? 1 : 0); });
  }
};
});
