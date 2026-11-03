// m-boxplot：箱ひげ図。値を小さい順に並べ、中央値・四分位数を求める手順のとおりに組み立てる
// <m-boxplot xl="記録（回）" style="height:440px">
//   <script type="application/json">{"groups": [{"label": "1 組", "values": [3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 18]}]}
// （JSON の終わり）</m-boxplot>
// 段階：build="steps"（既定）は 値の点 → 中央値 → 第1・第3四分位数 → 箱 → ひげ（群が 2 つ以上なら全部の群をそろえて）。
//       build="whole" は群 1 つ = 1 段階で箱ひげ図をまとめて出す
// 四分位数の求め方（method）：jp（既定。中学・数学Ⅰの教科書：前半・後半のそれぞれの中央値。奇数個なら中央値を前半にも後半にも入れない）・
//       inc（表計算の QUARTILE.INC）・exc（QUARTILE.EXC）
// 軸の属性は m-curves と同じ名前：値の軸は orient="h" なら xr xt xf xl、orient="v" なら yr yt yf yl
// 見せ方（docs/conventions.md §1）：fade（フェードして現れる、既定）・draw（箱の枠と線を引く。ひげは箱から外へ伸びる）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・variant・previewOpacity、plot の Plot、
// 四分位数は boxplot-core（1.x の static stats）を使い、プレイヤーのグローバルは使わない。書き方やデータの知らせ
// （1.x の console.warn）は mount で ctx.report に。言語は ctx.lang（mount で読む）
egatariParts.define({name: "boxplot", version: "2.0.0", requires: {base: "1.0.0", "boxplot-core": "1.0.0", plot: "1.0.0"}, element: "m-boxplot"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot;
// ---- 四分位数（boxplot-core。tools/test-stats.mjs が試す） ----
var STATS = deps["boxplot-core"];
// 印の名前の置き場所（m-hist と同じ決まり）：線の頭の右（start）か左（end）。名前がほかの線にかからない側を選び、
// 名前がかかる線の印はそれより下の行に置く。fl：[{x, w}]。各要素に a・L・R・row を書き、行の数を返す。
// 置き場所がないときは report(code, message)（ctx.report）で知らせる
function FLAGS(fl, W, report){
  var span = function(f, a){ var l = a === "start" ? f.x + 8 : f.x - 8 - f.w; return [l, l + f.w]; };
  var covers = function(f, g){ return g !== f && g.x > f.L - 6 && g.x < f.R + 6; };
  fl.forEach(function(f){
    var best = null;
    ["start", "end"].forEach(function(a){
      var sp = span(f, a);
      if (sp[0] < 2 || sp[1] > W - 2) return;
      var n = fl.filter(function(g){ return g !== f && g.x > sp[0] - 6 && g.x < sp[1] + 6; }).length;
      if (!best || n < best.n) best = {a: a, n: n};
    });
    f.a = best ? best.a : (f.x < W / 2 ? "start" : "end");
    var sp2 = span(f, f.a); f.L = sp2[0]; f.R = sp2[1];
  });
  var lv = fl.map(function(){ return 0; });
  for (var it = 0; it < fl.length; it++) fl.forEach(function(f, i){ fl.forEach(function(g, j){ if (covers(f, g)) lv[i] = Math.max(lv[i], Math.min(fl.length, lv[j] + 1)); }); });
  var order = fl.map(function(f, i){ return i; }).sort(function(a, b){ return lv[a] - lv[b] || a - b; });
  var placed = [], rows = 0;
  order.forEach(function(i){
    var f = fl[i], row = 0;
    placed.forEach(function(o){ if (covers(f, o)) row = Math.max(row, o.row + 1); });
    for (;; row++){
      var clash = placed.some(function(o){
        return (o.row === row && f.L < o.R + 14 && o.L < f.R + 14) || (o.row < row && covers(o, f)) || (o.row > row && covers(f, o));
      });
      if (!clash) break;
      if (row > 12){ report("layout", '[boxplot] no free place for the name "' + (f.text || "") + '" (it may overlap)'); break; }
    }
    f.row = row; placed.push(f); rows = Math.max(rows, row + 1);
  });
  return rows;
}
var ON = function(v){ return /^(on|true|yes)$/i.test(String(v || "").trim()); };
return class extends base.MotionElement {
  static partName = "boxplot";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "draw"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["groups"], properties: {
      groups: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, anyOf: [{required: ["values"]}, {required: ["five"]}], properties: {
        label: {type: "string"}, tone: {type: "string"}, values: {type: "array", minItems: 1, items: {type: "number"}},
        five: {type: "array", minItems: 5, maxItems: 5, items: {type: "number"}}}}}}},
    example: {groups: [{label: "1 組", values: [3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 18]}]},
    note: {en: "groups [{label, tone, values}] or [{label, five: [min, q1, median, q3, max]}]; axes go in attributes (xr=\"[0,20]\" xl=\"…\")",
           ja: "groups [{label, tone, values}] か [{label, five: [最小値, 第1四分位数, 中央値, 第3四分位数, 最大値]}]。軸は属性に書く（xr=\"[0,20]\" xl=\"…\"）"},
  };
  static props = {
    orient:   {type: "string", default: "h", doc: "h（横向きの箱、値の軸が横）か v（縦向き）"},
    xr: {type: "json", default: null, doc: "横軸の範囲"}, yr: {type: "json", default: null, doc: "縦軸の範囲"},
    xt: {type: "json", default: null, doc: "横軸の目盛り"}, yt: {type: "json", default: null, doc: "縦軸の目盛り"},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    method:   {type: "string", default: "jp", doc: "四分位数の求め方：jp（教科書）・inc・exc（表計算の QUARTILE.INC / EXC）"},
    outliers: {type: "string", default: "off", doc: "on：1.5×四分位範囲の外を外れ値（点）にし、ひげはその内側まで"},
    dots:     {type: "string", default: "off", doc: "on：値の点を箱の下に並べる（build=\"steps\" ではいつも出る）"},
    build:    {type: "string", default: "steps", doc: "steps（求める手順のとおり）か whole（群 1 つ = 1 段階）"},
    unit:     {type: "string", default: "", doc: "書き出す値の後ろに付ける単位"},
    digits:   {type: "number", default: undefined, doc: "書き出す値の小数桁（書かなければ値の桁＋1 まで）"},
    dur:      {type: "number", default: 0.8, doc: "1 段階の動きの秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // 群・四分位数・段階（mount の前にも steps が要るので、データと属性だけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, notes = [], S = STATS;
    var method = P.method || "jp", out = ON(P.outliers), build = P.build;
    if (["steps", "whole"].indexOf(build) < 0){ notes.push(["attr", '[boxplot] build="' + build + '" is not steps or whole (steps is used)']); build = "steps"; }
    var groups = (d.groups || []).map(function(g, i){
      var o = {i: i, label: g.label || "", tone: g.tone};
      if (Array.isArray(g.values)){
        o.values = g.values.map(Number);
        o.q = S.quartiles(o.values, method);
      } else {
        var f = g.five.map(Number);
        for (var j = 1; j < 5; j++) if (f[j] < f[j - 1]) throw new Error("m-boxplot: five must be in order [min, q1, median, q3, max] (" + f.join(", ") + ")");
        o.q = {min: f[0], q1: f[1], med: f[2], q3: f[3], max: f[4], n: 0};
      }
      o.f = out && o.values ? S.fences(o.q, o.values) : {wlo: o.q.min, whi: o.q.max, out: []};
      return o;
    });
    if (out && groups.some(function(g){ return !g.values; })) notes.push(["data", '[boxplot] outliers="on" needs the values of a group (a group written with "five" has none)']);
    var dec = function(v){ var m = String(v).match(/\.(\d+)$/); return m ? m[1].length : 0; };
    var base = Math.max.apply(null, [0].concat.apply([0], groups.map(function(g){ return g.values ? g.values.map(dec) : [g.q.min, g.q.q1, g.q.med, g.q.q3, g.q.max].map(dec); })));
    var hasVals = groups.some(function(g){ return g.values; }), st = {};
    if (build === "steps"){
      var k = 0;
      if (hasVals) st.dots = ++k;
      st.med = ++k; st.q = ++k; st.box = ++k; st.whisk = ++k;
      groups.forEach(function(g){ g.step = 1; });
    } else groups.forEach(function(g, i){ g.step = i + 1; });
    return (this._plan = {groups: groups, method: method, out: out, build: build, st: st, base: base, notes: notes,
      steps: build === "steps" ? st.whisk : Math.max(1, groups.length)});
  }
  fmt(v){
    var P = this.props, pl = this.plan(), s;
    if (P.digits !== undefined && isFinite(P.digits)) s = Math.abs(v).toFixed(P.digits);
    else { s = Math.abs(v).toFixed(pl.base + 1); if (s.indexOf(".") >= 0){ s = s.replace(/0+$/, ""); var dd = (s.split(".")[1] || "").length; if (dd < pl.base) s += Array(pl.base - dd + 1).join("0"); s = s.replace(/\.$/, ""); } }
    var p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 && +s !== 0 ? "−" : "") + i + (p[1] ? "." + p[1] : "");
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), S = STATS;
    this.variant = base.variant(this);
    // 書き方とデータの知らせ（plan が集めた [code, message]）
    // ctx.report with each code as a literal (lint checks them): plan's notes (attr, data) and the label placer's (layout)
    var report = function(code, msg){ if (code === "attr") ctx.report("attr", msg); else if (code === "layout") ctx.report("layout", msg); else ctx.report("data", msg); };
    pl.notes.forEach(function(n){ report(n[0], n[1]); });
    this.classList.add("plot"); this.style.display = "block";
    var ja = this.ja = /^ja\b/i.test(ctx.lang), hor = P.orient !== "v";
    if (P.orient !== "h" && P.orient !== "v") ctx.report("attr", '[boxplot] orient="' + P.orient + '" is not h or v (h is used)');
    var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
    var toneOf = function(c){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(c || "") ? "var(--" + c + ")" : null; };
    var W = this.clientWidth, H = this.clientHeight, G = pl.groups, steps = pl.build === "steps", st = pl.st;
    var N = ja ? {min: "最小値", q1: "第1四分位数", med: "中央値", q3: "第3四分位数", max: "最大値", out: "外れ値"}
               : {min: "Minimum", q1: "First quartile", med: "Median", q3: "Third quartile", max: "Maximum", out: "Outlier"};
    G.forEach(function(g, i){ g.col = toneOf(g.tone) || (G.length > 1 && !g.tone ? "var(--series-" + (i % 4 + 1) + ")" : "var(--term)"); });
    // 値の軸の範囲と目盛り（書かなければ全部の値から切りのよい数に）
    var all = [].concat.apply([], G.map(function(g){ return g.values || [g.q.min, g.q.max]; }));
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var vr = hor ? P.xr : P.yr, vt = hor ? P.xt : P.yt, vf = hor ? P.xf : P.yf, vl = hor ? P.xl : P.yl;
    if (!vr){ var s0 = niceStep((hi - lo || 1) / 6); vr = [S.clean(Math.floor(lo / s0 + 1e-9) * s0), S.clean(Math.ceil(hi / s0 - 1e-9) * s0)]; if (vr[0] === vr[1]) vr = [vr[0] - s0, vr[1] + s0]; }
    if (!vt){
      // 目盛りの数が重ならない間隔まで広げる（横：字の幅＋16 px、縦：34 px）
      var labeled0 = G.some(function(g){ return g.label; }), gw0 = labeled0 ? Math.max.apply(null, G.map(function(g){ return est(g.label, 26); })) : 0;
      var room = hor ? W - (labeled0 ? Math.min(W * 0.3, gw0 + 28) : 28) - 28 : H - 120;
      var s1 = niceStep((vr[1] - vr[0]) / (hor ? 8 : 6)), fits = function(sp){
        var n2 = Math.floor((vr[1] - vr[0]) / sp + 1e-9) + 1, w2 = hor ? Math.max(est(vr[0].toFixed(dec(sp)), 24), est(vr[1].toFixed(dec(sp)), 24)) + 16 : 34;
        return n2 * w2 <= room; };
      for (var guard = 0; guard < 20 && !fits(s1); guard++) s1 = niceStep(s1 * 1.01);
      vt = []; for (var u = Math.ceil(vr[0] / s1 - 1e-9) * s1; u <= vr[1] + s1 * 1e-6; u += s1) vt.push(S.clean(u));
    }
    if (vf === undefined) vf = Math.max.apply(null, vt.map(function(x){ var m = String(x).match(/\.(\d+)$/); return m ? m[1].length : 0; }).concat([0]));
    // 群の点：小さい順に置き、前の点と重なる（中心が 2R＋1 px より近い）ときは 1 段ずらして積む
    var R = 9;
    var stackDots = function(Vpx){
      G.forEach(function(g){
        g.stack = 0;
        if (!g.values) return;
        var placed = [];
        // 外れ値は点の列に置かず、箱の線の上の白抜きの丸だけで示す（同じ値が 2 つの印に見えないように）
        g.dots = S.sorted(g.values).filter(function(v){ return g.f.out.indexOf(v) < 0; }).map(function(v){
          var x = Vpx(v), lv = 0;
          while (placed.some(function(o){ return o.lv === lv && Math.abs(o.x - x) < 2 * R + 1; })) lv++;
          placed.push({x: x, lv: lv}); g.stack = Math.max(g.stack, lv + 1);
          return {v: v, lv: lv};
        });
      });
    };
    var showDots = function(g){ return g.values && (steps || ON(P.dots)); };
    var labeled = G.some(function(g){ return g.label; });
    // ---- 並べた値の行（build="steps"、群が 1 つ、横向きで、行に収まるとき） ----
    var g0 = G[0], row = null;
    if (steps && hor && G.length === 1 && g0.values){
      var n = g0.q.n, tw = Math.max.apply(null, g0.q.sorted.map(function(v){ return est(self.fmt(v), 26); }));
      var cw = Math.min(70, (W - 40) / n);
      if (cw >= tw + 10){
        row = {n: n, cw: cw, x0: (W - n * cw) / 2, top: 4, h: 46};
        row.cx = function(i){ return row.x0 + (i + 0.5) * row.cw; };
        // 行の下の名前（中央値・四分位数・最小値・最大値）：中心をその位置に、重なれば下の行へ
        var q = g0.q, names = [{k: "med", i: q.imed, st: st.med}, {k: "q1", i: q.iq1, st: st.q}, {k: "q3", i: q.iq3, st: st.q}, {k: "min", i: 0, st: st.whisk}, {k: "max", i: n - 1, st: st.whisk}];
        var put = [], rr = 0;
        names.forEach(function(o){
          o.text = N[o.k]; o.w = est(o.text, 24); o.x = Math.max(o.w / 2 + 2, Math.min(W - o.w / 2 - 2, row.cx(o.i)));
          for (var r = 0; ; r++){ if (!put.some(function(p){ return p.r === r && Math.abs(p.x - o.x) < (p.w + o.w) / 2 + 12; })) { o.r = r; break; } }
          put.push(o); rr = Math.max(rr, o.r + 1);
        });
        row.names = names; row.nrows = rr;
        row.brk = q.halves ? 16 : 0;
        row.bottom = row.top + row.h + row.brk + rr * 30 + 14;
      }
    }
    var top0 = row ? row.bottom : 8;
    // ---- 書き出す値の名前（build="steps"） ----
    var flagsOf = function(g, X){
      if (!steps) return [];
      var q = g.q, f = g.f, o = [];
      var name = function(k, v){ return N[k] + " " + self.fmt(v) + self.props.unit; };
      o.push({k: "med", v: q.med, text: name("med", q.med), st: st.med});
      o.push({k: "q1", v: q.q1, text: name("q1", q.q1), st: st.q});
      o.push({k: "q3", v: q.q3, text: name("q3", q.q3), st: st.q});
      o.push({k: "min", v: f.wlo, text: f.wlo === q.min ? name("min", q.min) : self.fmt(f.wlo) + self.props.unit, st: st.whisk});
      o.push({k: "max", v: f.whi, text: f.whi === q.max ? name("max", q.max) : self.fmt(f.whi) + self.props.unit, st: st.whisk});
      o.forEach(function(x){ x.w = est(x.text, 24); x.x = X ? X(x.v) : 0; });
      return o;
    };
    // 外れ値の名前（3 つまで）：どの build でも、白抜きの丸のすぐ横に
    G.forEach(function(g){
      g.outLab = g.f.out.length && g.f.out.length <= 3 ? g.f.out.map(function(v){ var t = N.out + " " + self.fmt(v) + self.props.unit; return {v: v, text: t, w: est(t, 24)}; }) : [];
    });
    var gLabW = labeled ? Math.max.apply(null, G.map(function(g){ return est(g.label, 26); })) : 0;
    var m, p, X, Y;
    var bands = [];
    if (hor){
      m = {l: labeled ? Math.min(W * 0.3, gLabW + 28) : 28, r: 28, b: P.xl ? 70 : 44, t: top0};
      X = function(v){ return m.l + (v - vr[0]) / (vr[1] - vr[0]) * (W - m.l - m.r); };
      // 群ごとの帯：名前の行・箱・点の段
      var boxH = 56, avail = H - m.b - top0 - 6;
      var need = function(bh, r){ return G.reduce(function(a, g){ return a + g.rows * 34 + (g.rows ? 10 : 0) + bh + (showDots(g) ? 10 + g.stack * (2 * r + 3) : 0) + 14; }, 0); };
      stackDots(X);
      G.forEach(function(g){ g.flags = flagsOf(g, X); g.rows = g.flags.length ? FLAGS(g.flags, W, report) : 0; });
      while (need(boxH, R) > avail && boxH > 30) boxH -= 2;
      while (need(boxH, R) > avail && R > 5) R -= 0.5;
      if (need(boxH, R) > avail) ctx.report("size", "[boxplot] the element (" + W + "×" + H + " px) is too small for the groups; give it more height");
      var extra = Math.max(0, avail - need(boxH, R)), add = Math.min(extra / G.length, 24);
      boxH = Math.min(boxH + add, 72);
      // 余りは群の間に（30 px まで）、残りは上に。いちばん下の群は軸のすぐ上
      var left = Math.max(0, avail - need(boxH, R)), gap = G.length > 1 ? Math.min(30, left / G.length) : 0;
      var y = top0 + left - gap * (G.length - 1);
      G.forEach(function(g, gi){
        if (gi) y += gap;
        y += g.rows * 34 + (g.rows ? 10 : 0);
        g.c = y + boxH / 2; g.bh = boxH;
        y += boxH;
        if (showDots(g)){ g.dotBase = y + 10 + g.stack * (2 * R + 3) - R - 1; y += 10 + g.stack * (2 * R + 3); }
        y += 14;
      });
      p = plot.Plot(this, {xr: vr, yr: [0, 1], xt: vt, xf: vf, xl: P.xl, noY: true, m: {l: m.l, r: m.r, t: top0, b: m.b}});
    } else {
      m = {l: 0, r: 20, t: 16, b: 44 + (labeled ? 34 : 0) + (P.xl ? 34 : 0)};
      var yw = Math.max.apply(null, vt.map(function(v){ return est(v.toFixed(vf), 24); }).concat([0]));
      m.l = Math.max(64, yw + 22 + (vl ? 40 : 0));
      Y = function(v){ return H - m.b - (v - vr[0]) / (vr[1] - vr[0]) * (H - m.b - m.t); };
      stackDots(Y);
      p = plot.Plot(this, {xr: [0, 1], yr: vr, xt: [], yt: vt, yf: vf, xl: P.xl, yl: vl, m: m});
      // 群ごとの幅：点の列・箱・名前
      var slot = (W - m.l - m.r) / G.length;
      G.forEach(function(g, i){
        g.flags = flagsOf(g, null);
        var lw = Math.max(g.flags.length ? Math.max.apply(null, g.flags.map(function(f){ return f.w; })) + 30 : 0,
                          g.outLab.length ? Math.max.apply(null, g.outLab.map(function(o){ return o.w; })) + 20 : 0);
        var dw = showDots(g) ? g.stack * (2 * R + 3) + 10 : 0;
        var bw = Math.max(36, Math.min(80, slot - lw - dw - 24));
        if (lw + dw + bw + 12 > slot) ctx.report("size", "[boxplot] the groups are too narrow for the names; give the element more width");
        var x = m.l + slot * i + (slot - (lw + dw + bw)) / 2;
        g.mid = x + (dw + bw) / 2;   // 群の名前は点の列と箱の真ん中の下
        if (showDots(g)){ g.dotBase = x + g.stack * (2 * R + 3) - R + 2; x += dw; }
        g.c = x + bw / 2; g.bh = bw; g.labX = x + bw + 14;
        // 名前：値の高さに置き、重なれば上下にずらす（30 px あける）
        var fl = g.flags.slice().sort(function(a, b){ return Y(b.v) - Y(a.v); });
        fl.forEach(function(f){ f.y = Y(f.v) + 8; });
        for (var it = 0; it < 30; it++){
          var moved = false;
          for (var j = 1; j < fl.length; j++){ if (fl[j - 1].y - fl[j].y < 30){ var d2 = (30 - (fl[j - 1].y - fl[j].y)) / 2; fl[j - 1].y += d2; fl[j].y -= d2; moved = true; } }
          fl.forEach(function(f){ f.y = Math.max(m.t + 24, Math.min(H - m.b - 4, f.y)); });
          if (!moved) break;
        }
      });
    }
    var axl = p.svg.querySelectorAll("g.axes > line");
    if (axl.length) axl[0].setAttribute("class", "axis");
    if (!hor && axl.length > 1) axl[1].setAttribute("class", "axis");
    var V = hor ? X : Y;
    // 値の軸の位置 v と、群の向きの位置 c から画面の座標
    var pt = function(v, c){ return hor ? [V(v), c] : [c, V(v)]; };
    var gL = D.el("g", {}, p.svg), gB = D.el("g", {}, p.svg), gD = D.el("g", {}, p.svg), gT = D.el("g", {}, p.svg);
    var items = this.items = [], draw = this.variant === "draw";
    var add2 = function(el, o){ o.el = el; items.push(o); return el; };
    var line = function(par, a, b, attrs){ return D.el("line", Object.assign({x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1)}, attrs), par); };
    var dur = P.dur;
    G.forEach(function(g){
      var q = g.q, f = g.f, c = g.c, h = g.bh, a = function(k){ return steps ? st[k] : g.step; };
      // 群の名前
      if (g.label){
        var tl = hor ? D.mtext(gT, m.l - 14, c + 9, g.label, {"text-anchor": "end", "font-size": 26, fill: G.length > 1 ? g.col : "var(--fg)", "font-weight": 700})
                     : D.mtext(gT, g.mid, H - m.b + 64, g.label, {"text-anchor": "middle", "font-size": 26, fill: G.length > 1 ? g.col : "var(--fg)", "font-weight": 700});
        add2(tl, {st: steps ? 1 : g.step, at: 0, len: 0.4, kind: "fade"});
      }
      // 値の点：h は箱の下に右へ並べて積む、v は箱の左に積む
      if (showDots(g)){
        g.dots.forEach(function(o){
          var cc = hor ? g.dotBase - o.lv * (2 * R + 3) : g.dotBase - o.lv * (2 * R + 3);
          var xy = pt(o.v, cc);
          add2(D.el("circle", {cx: xy[0].toFixed(1), cy: xy[1].toFixed(1), r: R.toFixed(1), fill: g.col, "fill-opacity": 0.85, opacity: 0}, gD),
            {st: steps ? st.dots : g.step, at: 0, len: dur * 0.7, kind: "fade"});
        });
      }
      var ends = [c - h / 2, c + h / 2], medCol = G.length > 1 || g.tone === "emph" ? "var(--fg)" : "var(--emph)";
      // 中央値と四分位数の線（箱の前に出る。箱が出たら四分位数の線は箱の辺に替わる）
      add2(line(gB, pt(q.med, ends[0]), pt(q.med, ends[1]), {stroke: medCol, "stroke-width": 4.5, "stroke-linecap": "round", opacity: 0}),
        {st: a("med"), at: 0, len: dur * 0.6, kind: "line"});
      if (steps){
        [q.q1, q.q3].forEach(function(v){
          add2(line(gB, pt(v, ends[0]), pt(v, ends[1]), {stroke: "var(--accent2)", "stroke-width": 3.5, "stroke-dasharray": "8 5", opacity: 0}),
            {st: st.q, at: 0, len: dur * 0.6, kind: "fade", until: st.box});
        });
      }
      // 箱
      var A = pt(q.q1, ends[0]), B = pt(q.q3, ends[1]);
      add2(D.el("rect", {x: Math.min(A[0], B[0]).toFixed(1), y: Math.min(A[1], B[1]).toFixed(1), width: Math.abs(B[0] - A[0]).toFixed(1), height: Math.abs(B[1] - A[1]).toFixed(1),
        fill: g.col, "fill-opacity": 0, stroke: g.col, "stroke-width": 3.5, opacity: 0}, gB), {st: a("box"), at: 0, len: dur, kind: "box"});
      // ひげ：箱の辺から外へ。端に短い線
      [[q.q1, f.wlo], [q.q3, f.whi]].forEach(function(w){
        if (w[0] !== w[1]) add2(line(gB, pt(w[0], c), pt(w[1], c), {stroke: g.col, "stroke-width": 3.5, "stroke-linecap": "round", opacity: 0}), {st: a("whisk"), at: 0, len: dur * 0.7, kind: "line"});
        add2(line(gB, pt(w[1], c - h * 0.28), pt(w[1], c + h * 0.28), {stroke: g.col, "stroke-width": 3.5, "stroke-linecap": "round", opacity: 0}), {st: a("whisk"), at: dur * 0.55, len: dur * 0.3, kind: "fade"});
      });
      f.out.forEach(function(v){
        var xy = pt(v, c);
        add2(D.el("circle", {cx: xy[0].toFixed(1), cy: xy[1].toFixed(1), r: 8, fill: "var(--bg)", stroke: g.col, "stroke-width": 3, opacity: 0}, gB), {st: a("whisk"), at: dur * 0.4, len: dur * 0.4, kind: "fade"});
      });
      // 外れ値の名前：横向きは丸の外側（小さい外れ値は左、大きい外れ値は右）、縦向きは丸の右
      g.outLab.forEach(function(o){
        var xy = pt(o.v, c), x, an;
        if (hor){
          var right = o.v > q.q3;
          x = right ? xy[0] + 18 : xy[0] - 18; an = right ? "start" : "end";
          if (right && x + o.w > W - 2){ x = xy[0] - 18; an = "end"; }
          if (!right && x - o.w < 2){ x = xy[0] + 18; an = "start"; }
        } else { x = xy[0] + 18; an = "start"; }
        add2(D.mtext(gT, x, xy[1] + 8, o.text, {"text-anchor": an, "font-size": 24, fill: "var(--fg)", opacity: 0}), {st: a("whisk"), at: dur * 0.5, len: dur * 0.3, kind: "fade"});
      });
      // 書き出す値：h は箱の上の行に、v は箱の右に。細い線で値の位置とつなぐ
      g.flags.forEach(function(fl){
        var edge = fl.k === "min" || fl.k === "max" ? h * 0.28 : h / 2;
        if (hor){
          var base = c - h / 2 - 14 - fl.row * 34, tip = base - 9, xv = X(fl.v);
          add2(line(gL, [xv, c - edge - 3], [xv, tip], {stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "4 4", opacity: 0}), {st: fl.st, at: dur * 0.3, len: dur * 0.4, kind: "fade"});
          add2(D.mtext(gT, fl.a === "start" ? xv + 8 : xv - 8, base, fl.text, {"text-anchor": fl.a, "font-size": 24, fill: "var(--fg)", opacity: 0}), {st: fl.st, at: dur * 0.3, len: dur * 0.4, kind: "fade"});
        } else {
          var yv = Y(fl.v), x0 = c + edge + 3;
          add2(D.el("path", {d: "M" + x0.toFixed(1) + "," + yv.toFixed(1) + "L" + (g.labX - 4).toFixed(1) + "," + (fl.y - 8).toFixed(1), fill: "none", stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "4 4", opacity: 0}, gL),
            {st: fl.st, at: dur * 0.3, len: dur * 0.4, kind: "fade"});
          add2(D.mtext(gT, g.labX + 4, fl.y, fl.text, {"text-anchor": "start", "font-size": 24, fill: "var(--fg)", opacity: 0}), {st: fl.st, at: dur * 0.3, len: dur * 0.4, kind: "fade"});
        }
      });
    });
    // 並べた値の行
    if (row){
      var q = g0.q, gR = D.el("g", {}, p.svg), ty = row.top + 33;
      q.sorted.forEach(function(v, i){
        add2(D.el("text", {x: row.cx(i).toFixed(1), y: ty, "font-size": 26, "text-anchor": "middle", fill: "var(--fg)", opacity: 0, style: "font-variant-numeric:tabular-nums"}, gR), {st: st.dots, at: 0, len: dur * 0.7, kind: "fade"}).textContent = self.fmt(v);
      });
      // 値を囲む枠（位置が x.5 なら前後の 2 つを、x.25 などなら挟む 2 つを）
      var frame = function(i, col, s2){
        var a2 = Math.floor(i + 1e-9), b2 = Math.ceil(i - 1e-9), x1 = row.x0 + a2 * row.cw + 3, x2 = row.x0 + (b2 + 1) * row.cw - 3;
        add2(D.el("rect", {x: x1.toFixed(1), y: row.top + 2, width: (x2 - x1).toFixed(1), height: row.h - 4, rx: 8, fill: "none", stroke: col, "stroke-width": 3, opacity: 0}, gR), {st: s2, at: 0, len: dur * 0.6, kind: "box"});
      };
      frame(q.imed, "var(--emph)", st.med);
      frame(q.iq1, "var(--accent2)", st.q); frame(q.iq3, "var(--accent2)", st.q);
      frame(0, "var(--fg)", st.whisk); frame(row.n - 1, "var(--fg)", st.whisk);
      // 前半・後半（jp）
      if (q.halves) q.halves.forEach(function(hv){
        var x1 = row.x0 + hv[0] * row.cw + 6, x2 = row.x0 + (hv[1] + 1) * row.cw - 6, yb = row.top + row.h + 9;
        add2(D.el("path", {d: "M" + x1.toFixed(1) + "," + (yb - 6) + "V" + yb + "H" + x2.toFixed(1) + "V" + (yb - 6), fill: "none", stroke: "var(--muted)", "stroke-width": 2, opacity: 0}, gR), {st: st.q, at: 0, len: dur * 0.5, kind: "fade"});
      });
      row.names.forEach(function(o){
        add2(D.mtext(gR, o.x, row.top + row.h + row.brk + 24 + o.r * 30, o.text, {"text-anchor": "middle", "font-size": 24, fill: "var(--fg)", opacity: 0}), {st: o.st, at: dur * 0.2, len: dur * 0.4, kind: "fade"});
      });
    }
    items.forEach(function(it){
      if (!draw || (it.kind !== "line" && it.kind !== "box")) return;
      it.el.setAttribute("pathLength", 1);
    });
    function niceStep(r){ var e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e; return S.clean((x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e); }
    function dec(v){ var mm = String(v).match(/\.(\d+)$/); return mm ? mm[1].length : 0; }
  }
  duration(k){
    var pl = this.plan();
    return k >= 1 && k <= pl.steps ? this.props.dur : 0;
  }
  render(k, t, ctx){
    var D = base, lecture = !!ctx.preview, draw = this.variant === "draw", FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    this.items.forEach(function(it){
      var e = it.st < k ? 1 : it.st > k ? (lecture ? -1 : 0) : D.prog(t, it.at, it.len), op;
      // 箱が出たら消える線（四分位数の仮の線）
      var gone = it.until !== undefined && it.st <= k ? (it.until < k ? 1 : it.until > k ? 0 : D.prog(t, 0, it.len)) : 0;
      if (e < 0){ op = it.until !== undefined ? 0 : FAINT; e = 1; }
      else op = e;
      if (draw && (it.kind === "line" || it.kind === "box")){
        it.el.setAttribute("stroke-dasharray", e >= 1 ? "none" : e.toFixed(4) + " 2");
        op = e > 0 ? (op === FAINT && it.st > k ? FAINT : 1) : 0;
        if (it.kind === "box" && it.el.localName === "rect" && it.el.getAttribute("fill") !== "none") it.el.setAttribute("fill-opacity", (0.14 * e).toFixed(3));
      } else if (it.kind === "box" && it.el.getAttribute("fill") !== "none") it.el.setAttribute("fill-opacity", 0.14);
      it.el.setAttribute("opacity", (op * (1 - gone)).toFixed(3));
    });
  }
};
});
