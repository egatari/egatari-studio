// heatmap-core 1.0.0: m-heatmap's calculations (a library part, Egatari spec §6.1): row normalisation, the colour domain and
// the place of a value on it, mixing in OKLab and WCAG contrast (the text colour and halo per cell), the layout (cell size,
// label thinning, vertical column labels), the size of the numbers in the cells and the steps. Pure functions of their
// arguments: no DOM, no state. m-heatmap 2.0.0 requires it; tools/test-heatmap.mjs tests it without a browser. Moved from
// m-heatmap 1.13.0 (its `static calc`) unchanged, except that layout's notes no longer start with "m-heatmap: ".
//   returns {clean, normalizeRows, domain, frac, mix, contrast, lum, pick, est, layout, shown, numberSize, steps}
egatariParts.define({name: "heatmap-core", version: "1.0.0", requires: {}}, function(){
  "use strict";
  function clean(v){ return +(+v).toFixed(10); }
  // 行ごとの割合（混同行列）。行の和が 0 なら 0 のまま
  function normalizeRows(values){
    return values.map(function(row){
      var s = row.reduce(function(a, v){ return a + v; }, 0);
      return row.map(function(v){ return s ? v / s : 0; });
    });
  }
  // 色の範囲：sequential は [min(0, 最小), 最大]、diverging は center を真ん中に対称（|値 − center| の最大）
  function domain(values, kind, center, range){
    var all = [].concat.apply([], values).filter(function(v){ return isFinite(v); });
    if (range && range.length === 2) return {lo: +range[0], hi: +range[1], c: kind === "diverging" ? center : (+range[0] + +range[1]) / 2};
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (kind === "diverging"){
      var m = Math.max(Math.abs(hi - center), Math.abs(lo - center)) || 1;
      return {lo: clean(center - m), hi: clean(center + m), c: center};
    }
    lo = Math.min(0, lo);
    if (hi === lo) hi = lo + 1;
    return {lo: lo, hi: hi, c: clean((lo + hi) / 2)};
  }
  // 値 → 混ぜる割合 f（sequential は 0〜1、diverging は −1〜1。負は lowtone の側）。範囲の外は端にそろえる
  function frac(v, kind, d){
    if (kind === "diverging"){
      var f = v >= d.c ? (d.hi > d.c ? (v - d.c) / (d.hi - d.c) : 0) : (d.lo < d.c ? -(d.c - v) / (d.c - d.lo) : 0);
      return Math.max(-1, Math.min(1, f));
    }
    return Math.max(0, Math.min(1, (v - d.lo) / (d.hi - d.lo)));
  }
  // ---- 色（sRGB 0〜255 の [r, g, b]） ----
  function lin(c){ c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c){ return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function oklab(c){
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOklab(o){
    var l = Math.pow(o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2], 3), m = Math.pow(o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2], 3), s = Math.pow(o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2], 3);
    var f = function(x){ x = Math.max(0, Math.min(1, x)); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); };
    return [f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), f(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function contrast(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // color-mix(in oklab, tone p, bg) の色（oklab での直線の補間）
  function mix(tone, bg, p){ var a = oklab(tone), b = oklab(bg); return fromOklab([0, 1, 2].map(function(i){ return b[i] + (a[i] - b[i]) * p; })); }
  var MIN = 4.6;   // 4.5:1 に、ブラウザの丸めの分の余裕
  // 字の色：割合 p（0〜1）の色（セルの色は変えない。色がデータなので）に対して、--fg と --bg のうちコントラストの高い方。
  // それでも MIN に届かない（明るさがちょうど中くらいの帯）ときは halo：字の周りに反対の色の細い縁（paint-order: stroke）を付ける。
  // 返すのは {p, text: "fg" | "bg", cr, halo}
  function pick(tone, bg, fg, p){
    var c = mix(tone, bg, p), a = contrast(c, fg), b = contrast(c, bg), o = a >= b ? {p: p, text: "fg", cr: a} : {p: p, text: "bg", cr: b};
    o.halo = o.cr < MIN;
    return o;
  }
  // ---- 配置（字の幅は見積もり：半角 0.56 字、全角 1 字） ----
  // セルの数字は表の数字の幅（0.7 字。−も同じ）で見積もる
  function est(s, size, an){ an = an || 0.56; return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ−]/.test(c) ? an : 1); }, 0) * size; }
  // o: {W, H, rows, cols, legend: [字], xl, yl, rotate: "auto" | "0" | "90"}。
  // 字は 26 px（入らなければ 24 px。それより小さくしない）。列の名前は横か縦（rotate）。入らなければ k 個おきに出す
  function layout(o){
    var nr = o.rows.length, nc = o.cols.length, best = null;
    var rot = String(o.rotate || "auto"), orients = rot === "0" ? ["h"] : rot === "90" ? ["v"] : ["h", "v"];
    var legW = Math.max.apply(null, [0].concat((o.legend || []).map(function(s){ return est(s, 24); })));
    [26, 24].forEach(function(fs){
      var rowW = Math.max.apply(null, [0].concat(o.rows.map(function(s){ return est(s, fs); })));
      var colW = Math.max.apply(null, [0].concat(o.cols.map(function(s){ return est(s, fs); })));
      var left = (o.yl ? 40 : 0) + (rowW ? rowW + 14 : 4), right = o.legend ? 22 + 24 + 10 + legW + 4 : 4;
      orients.forEach(function(or){
        var top = (o.xl ? 40 : 0) + (colW ? (or === "h" ? Math.ceil(fs * 1.25) + 8 : Math.ceil(colW) + 14) : 4);
        var cs = Math.min((o.W - left - right) / nc, (o.H - top - 4) / nr, 180);
        if (!(cs > 0)) cs = 0;
        var kc = colW ? Math.max(1, Math.ceil((or === "h" ? colW + 10 : fs * 1.25) / Math.max(cs, 1e-6) - 1e-9)) : 1;
        var kr = rowW ? Math.max(1, Math.ceil(fs * 1.25 / Math.max(cs, 1e-6) - 1e-9)) : 1;
        var c = {fs: fs, orient: or, left: left, right: right, top: top, cs: cs, kc: kc, kr: kr, rowW: rowW, colW: colW, legW: legW};
        var score = function(x){ return (x.kc - 1) + (x.kr - 1); };
        if (!best || score(c) < score(best) || (score(c) === score(best) && c.cs > best.cs + 0.5 && score(c) > 0)) best = c;
      });
    });
    var b = best, gw = nc * b.cs, gh = nr * b.cs, total = b.left + gw + b.right;
    b.x0 = Math.max(0, (o.W - total) / 2);   // 左の端（行の名前の左）
    b.gx = b.x0 + b.left; b.gy = b.top + Math.max(0, (o.H - b.top - gh - 4) / 2);
    b.gw = gw; b.gh = gh;
    b.notes = [];   // messages without a prefix: m-heatmap reports them with its own
    if (b.kc > 1) b.notes.push(nc + " columns are too many to label at 24 px; every " + ord(b.kc) + " column label is shown");
    if (b.kr > 1) b.notes.push(nr + " rows are too many to label at 24 px; every " + ord(b.kr) + " row label is shown");
    if (b.cs < 4) b.notes.push("the element (" + o.W + "×" + o.H + " px) is too small for " + nr + "×" + nc + " cells");
    return b;
  }
  function ord(k){ return k + (k % 10 === 2 && k % 100 !== 12 ? "nd" : k % 10 === 3 && k % 100 !== 13 ? "rd" : "th"); }
  // 出す名前の番号（k 個おき、0 から）
  function shown(n, k){ var out = []; for (var i = 0; i < n; i += k) out.push(i); return out; }
  // セルの数字の大きさ：lines 行（1 か 2）の字 texts が cs の正方形に収まる最も大きい大きさ（34 px まで）。24 px でも入らなければ 0
  function numberSize(cs, texts, lines){
    var w = Math.max.apply(null, [0].concat(texts.map(function(s){ return est(s, 1, 0.7); })));
    for (var f = Math.min(34, Math.floor(cs * 0.28)); f >= 24; f--){
      if (w * f <= cs - 12 && lines * f * 1.2 <= cs - 6) return f;
    }
    return w * 24 <= cs - 12 && lines * 24 * 1.2 <= cs - 6 ? 24 : 0;
  }
  // 段階：セルごとの段階 cell[r][c]、強調の段階、全体の段階の数
  function steps(nr, nc, build, highlight){
    var cell = [], k = 1, hs;
    for (var r = 0; r < nr; r++){ cell.push([]); for (var c = 0; c < nc; c++) cell[r].push(build === "rows" ? r + 1 : 1); }
    var last = build === "rows" ? nr : 1;
    hs = (highlight || []).map(function(h, i){
      var st = h.length > 2 && isFinite(h[2]) ? Math.max(1, Math.round(h[2])) : build === "cells" ? 2 + i : build === "rows" ? nr + 1 : 1;
      return {r: h[0], c: h[1], st: st};
    });
    k = Math.max.apply(null, [last].concat(hs.map(function(h){ return h.st; })));
    return {cell: cell, hl: hs, steps: Math.max(1, k)};
  }
  return {clean: clean, normalizeRows: normalizeRows, domain: domain, frac: frac, mix: mix, contrast: contrast, lum: lum, pick: pick,
          est: est, layout: layout, shown: shown, numberSize: numberSize, steps: steps, MIN: MIN};
});
