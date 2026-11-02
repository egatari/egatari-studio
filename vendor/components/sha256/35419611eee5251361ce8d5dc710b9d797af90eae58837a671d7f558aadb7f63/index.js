// m-heatmap：値で塗ったセルの格子（混同行列・相関行列・注意の重みなど）。行を 1 段階ずつ、または全体を出し、強調するセルを 1 つずつ囲む
// <m-heatmap normalize="row" diag="on" xl="予測" yl="正解" style="height:430px">
//   <script type="application/json">{"rows": ["ねこ", "いぬ", "うさぎ"], "cols": ["ねこ", "いぬ", "うさぎ"], "values": [[45, 3, 2], [6, 38, 6], [1, 4, 45]]}
// （JSON の終わり）</m-heatmap>
// 色（テーマの色だけ）：scale="sequential"（既定）は var(--bg) から tone（var(--term)）へ、scale="diverging" は center（既定 0）を地の色に、
//       上は tone・下は lowtone（var(--emph)）へ。どれも color-mix(in oklab, …) で混ぜる。数字の色はセルごとに var(--fg) と var(--bg) の
//       コントラストを計算して高い方（4.5:1 以上）。どちらも 4.5:1 に届かない明るさのセルは、届く所まで混ぜる割合を寄せる
// 段階：build="rows"（行を 1 つずつ。normalize="row" の既定）・"whole"（全体を 1 段階）・"cells"（全体、それから強調を 1 つずつ。highlight があるときの既定）
// 字は 24 px 以上：列の名前は長ければ縦に、それでも入らなければ k 個おきに出して知らせる。12×12 を超えるとセルの数字は自動で消える（知らせる）
// 見せ方（docs/conventions.md §1）：fade（セルがフェード、既定）・sweep（同じ段階のセルが左上から順に）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog・variant・previewOpacity と、計算は heatmap-core（1.x の
// static calc）を使い、プレイヤーのグローバルは使わない。書き方やデータの知らせ（1.x の console.warn）は mount で ctx.report に。
// 言語は ctx.lang（mount で読む）。凡例のグラデーションの id は heatmap-2-0-0-legend-<n>（1.x は m-heatmap-legend-<n>）
egatariParts.define({name: "heatmap", version: "2.0.0", requires: {base: "1.0.0", "heatmap-core": "1.0.0"}, element: "m-heatmap"}, function(deps){
"use strict";
var base = deps.base;
// ---- 計算（heatmap-core。tools/test-heatmap.mjs がブラウザなしで試す） ----
var CALC = deps["heatmap-core"];
// テーマの色を sRGB で読む（キャンバスに 1 点塗って読む。読めなければ null）。m-map-japan と同じ
function rgbOf(css){
  try {
    var cv = document.createElement("canvas"); cv.width = cv.height = 1;
    var g = cv.getContext("2d", {willReadFrequently: true});
    if (!g) return null;
    g.fillStyle = "#010203"; g.fillStyle = css;
    if (/^#010203$/i.test(g.fillStyle) && !/^#010203$/i.test(css)) return null;
    g.fillRect(0, 0, 1, 1);
    var d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch (e) { return null; }
}
var ON = function(v){ return /^(on|true|yes)$/i.test(String(v || "").trim()); };
var TONES = ["term", "emph", "accent2"];
var ID = "heatmap-2-0-0-";   // name and version of this part, dots replaced (spec §6.1 Identifiers)
var SEQ = 0;   // 凡例のグラデーションの id（ページの中で部品ごとに別。mount は 1 回だけ。このパーツだけの数え）
return class extends base.MotionElement {
  static partName = "heatmap";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "sweep"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["rows", "cols", "values"], properties: {
      rows: {type: "array", minItems: 1, items: {type: "string"}},
      cols: {type: "array", minItems: 1, items: {type: "string"}},
      values: {type: "array", minItems: 1, items: {type: "array", minItems: 1, items: {type: "number"}}},
      unit: {type: "string"}, digits: {type: "number"},
      highlight: {type: "array", items: {type: "array", minItems: 2, maxItems: 3, items: {type: "number"}}}}},
    example: {rows: ["ねこ", "いぬ"], cols: ["ねこ", "いぬ"], values: [[45, 5], [6, 44]]},
    note: {en: "values[row][col], one row per label in rows and one number per label in cols; highlight [[row, col] or [row, col, step]] (0-based)",
           ja: "values[行][列]。rows の名前ごとに 1 行、cols の名前ごとに 1 つの数。highlight は [[行, 列] か [行, 列, 段階]]（0 から数える）"},
  };
  static props = {
    scale:     {type: "string", default: "sequential", doc: "sequential か diverging（center を地の色に 2 色）"},
    center:    {type: "number", default: 0, doc: "diverging の真ん中の値"},
    range:     {type: "json", default: null, doc: "色の範囲 [最小, 最大]"},
    tone:      {type: "string", default: "term", doc: "濃い側の色：term・emph・accent2"},
    lowtone:   {type: "string", default: "emph", doc: "diverging の center より下の色"},
    normalize: {type: "string", default: "none", doc: "row：行ごとの割合（混同行列）"},
    show:      {type: "string", default: "percent", doc: "normalize=row の数字：percent・count・both"},
    numbers:   {type: "string", default: "auto", doc: "セルの数字：auto・on・off"},
    diag:      {type: "string", default: "off", doc: "on：対角を枠で強調"},
    build:     {type: "string", default: "", doc: "rows・whole・cells"},
    rotate:    {type: "string", default: "auto", doc: "列の名前：auto・0・90"},
    xl:        {type: "string", default: "", doc: "列の見出し"},
    yl:        {type: "string", default: "", doc: "行の見出し"},
    unit:      {type: "string", default: undefined},
    digits:    {type: "number", default: undefined},
    dur:       {type: "number", default: 0.8, doc: "1 段階の秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // データと属性だけから決まること（mount の前にも steps が要る）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, notes = [], C = CALC;
    var rows = (d.rows || []).map(String), cols = (d.cols || []).map(String), raw = (d.values || []).map(function(r){ return r.map(Number); });
    if (raw.length !== rows.length) throw new Error("m-heatmap: values has " + raw.length + " rows but rows has " + rows.length + " labels");
    raw.forEach(function(r, i){ if (r.length !== cols.length) throw new Error("m-heatmap: values row " + i + " has " + r.length + " numbers but cols has " + cols.length + " labels"); });
    var norm = P.normalize === "row";
    if (["none", "row"].indexOf(P.normalize) < 0) notes.push(["attr", '[heatmap] normalize="' + P.normalize + '" is not row (none is used)']);
    var kind = P.scale === "diverging" ? "diverging" : "sequential";
    if (["sequential", "diverging"].indexOf(P.scale) < 0) notes.push(["attr", '[heatmap] scale="' + P.scale + '" is not sequential or diverging (sequential is used)']);
    var build = P.build || (norm ? "rows" : (d.highlight || []).length ? "cells" : "whole");
    if (["rows", "whole", "cells"].indexOf(build) < 0){ notes.push(["attr", '[heatmap] build="' + build + '" is not rows, whole or cells (whole is used)']); build = "whole"; }
    var hl = (d.highlight || []).filter(function(h){
      var ok = h[0] >= 0 && h[0] < rows.length && h[1] >= 0 && h[1] < cols.length && h[0] === Math.round(h[0]) && h[1] === Math.round(h[1]);
      if (!ok) notes.push(["data", "[heatmap] highlight [" + h.join(", ") + "] is outside the " + rows.length + "×" + cols.length + " grid (0-based; ignored)"]);
      return ok;
    });
    var shown = norm ? C.normalizeRows(raw) : raw;
    var show = norm ? P.show : "count";
    if (norm && ["count", "percent", "both"].indexOf(show) < 0){ notes.push(["attr", '[heatmap] show="' + show + '" is not count, percent or both (percent is used)']); show = "percent"; }
    if (norm && raw.some(function(r){ return !r.reduce(function(a, v){ return a + v; }, 0); })) notes.push(["data", "[heatmap] a row sums to 0; its proportions are drawn as 0"]);
    var dom = C.domain(shown, kind, +P.center || 0, norm && !P.range ? [0, 1] : P.range);
    var st = C.steps(rows.length, cols.length, build, hl);
    var dec = function(v){ var m = String(v).match(/\.(\d+)$/); return m ? m[1].length : 0; };
    var digits = P.digits !== undefined ? P.digits : d.digits !== undefined ? d.digits : Math.min(2, Math.max.apply(null, [0].concat([].concat.apply([], raw).map(dec))));
    var unit = P.unit !== undefined ? P.unit : d.unit || "";
    return (this._plan = {rows: rows, cols: cols, raw: raw, val: shown, norm: norm, kind: kind, build: build, show: show, dom: dom,
      cell: st.cell, hl: st.hl, steps: st.steps, digits: digits, unit: unit, notes: notes});
  }
  fmt(v, dg){
    var s = Math.abs(v).toFixed(dg), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 && +s !== 0 ? "−" : "") + i + (p[1] ? "." + p[1] : "");
  }
  // 凡例の数：終わりの 0 を落とす
  lfmt(v){
    var pl = this.plan();
    if (pl.norm) return Math.round(v * 100) + "%";
    var s = this.fmt(v, pl.digits); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s + pl.unit;
  }
  // セルの字（1 行か 2 行）
  texts(r, c){
    var pl = this.plan(), cnt = this.fmt(pl.raw[r][c], pl.digits) + pl.unit;
    if (!pl.norm) return [cnt];
    var pct = this.fmt(pl.val[r][c] * 100, this.props.digits !== undefined ? this.props.digits : 0) + "%";
    return pl.show === "count" ? [cnt] : pl.show === "both" ? [cnt, pct] : [pct];
  }
  mount(ctx){
    var P = this.props, D = base, C = CALC, self = this, pl = this.plan();
    this.variant = base.variant(this);
    // 書き方とデータの知らせ（plan が集めた [code, message]）
    // ctx.report with each code as a literal (lint checks them): plan's notes are attr or data
    pl.notes.forEach(function(n){ var code = n[0], msg = n[1]; if (code === "attr") ctx.report("attr", msg); else ctx.report("data", msg); });
    this.classList.add("plot"); this.style.display = "block";
    var ja = this.ja = /^ja\b/i.test(ctx.lang), W = this.clientWidth, H = this.clientHeight, nr = pl.rows.length, nc = pl.cols.length;
    // ---- 色：テーマの色を読み、セルごとに混ぜる割合と字の色を決める ----
    var tone = TONES.indexOf(P.tone) >= 0 ? P.tone : "term", low = TONES.indexOf(P.lowtone) >= 0 ? P.lowtone : "emph";
    if (TONES.indexOf(P.tone) < 0) ctx.report("attr", '[heatmap] tone="' + P.tone + '" is not term, emph or accent2 (term is used)');
    if (TONES.indexOf(P.lowtone) < 0) ctx.report("attr", '[heatmap] lowtone="' + P.lowtone + '" is not term, emph or accent2 (emph is used)');
    if (pl.kind === "diverging" && tone === low) ctx.report("attr", "[heatmap] tone and lowtone are the same colour; the two sides cannot be told apart");
    var cs0 = getComputedStyle(this), get = function(v){ return rgbOf(cs0.getPropertyValue(v).trim()); };
    var RGB = {bg: get("--bg"), fg: get("--fg"), term: get("--term"), emph: get("--emph"), accent2: get("--accent2")};
    var paint = function(f){
      var side = f < 0 ? low : tone, p = Math.abs(f), o;
      if (RGB.bg && RGB.fg && RGB[side]) o = C.pick(RGB[side], RGB.bg, RGB.fg, p);
      else o = {p: p, text: p > 0.55 ? "bg" : "fg", halo: true};   // テーマの色が読めなければ、いつも縁を付ける
      var pc = Math.round(o.p * 10000) / 100;
      return {fill: pc <= 0 ? "var(--bg)" : pc >= 100 ? "var(--" + side + ")" : "color-mix(in oklab, var(--" + side + ") " + pc + "%, var(--bg))", text: "var(--" + o.text + ")",
              halo: o.halo ? "var(--" + (o.text === "fg" ? "bg" : "fg") + ")" : null};
    };
    // ---- 配置 ----
    var dm = pl.dom, legend = [this.lfmt(dm.hi), this.lfmt(dm.c), this.lfmt(dm.lo)];
    var L = C.layout({W: W, H: H, rows: pl.rows, cols: pl.cols, legend: legend, xl: P.xl, yl: P.yl, rotate: P.rotate});
    L.notes.forEach(function(n){ ctx.report("size", "[heatmap] " + n); });
    var cs = L.cs, fs = L.fs;
    // セルの数字：12×12 を超えたら自動で消す。24 px で入らなければ消す（both は割合だけに）
    var mode = ["auto", "on", "off"].indexOf(P.numbers) >= 0 ? P.numbers : (ctx.report("attr", '[heatmap] numbers="' + P.numbers + '" is not auto, on or off (auto is used)'), "auto");
    var nf = 0, lines = pl.show === "both" ? 2 : 1, all = [];
    for (var r0 = 0; r0 < nr; r0++) for (var c0 = 0; c0 < nc; c0++) all = all.concat(this.texts(r0, c0));
    if (mode === "auto" && (nr > 12 || nc > 12)){ mode = "off"; ctx.report("size", "[heatmap] " + nr + "×" + nc + " cells is more than 12×12; the numbers in the cells are turned off (numbers=\"on\" to keep them where they fit)"); }
    if (mode !== "off"){
      nf = C.numberSize(cs, all, lines);
      if (!nf && lines === 2){
        lines = 1; all = []; for (var r1 = 0; r1 < nr; r1++) for (var c1 = 0; c1 < nc; c1++) all.push(this.texts(r1, c1)[1]);
        nf = C.numberSize(cs, all, 1);
        if (nf) ctx.report("size", '[heatmap] the cells (' + Math.round(cs) + ' px) are too small for two lines at 24 px; show="both" shows the percentages only');
      }
      if (!nf) ctx.report("size", "[heatmap] the cells (" + Math.round(cs) + " px) are too small for numbers at 24 px; the numbers are turned off");
    }
    this.lines = lines;
    var svg = D.el("svg", {width: W, height: H, viewBox: "0 0 " + W + " " + H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    var gGrid = D.el("g", {}, svg), gCell = D.el("g", {}, svg), gOut = D.el("g", {}, svg), gLab = D.el("g", {}, svg);
    var X = function(c){ return L.gx + c * cs; }, Y = function(r){ return L.gy + r * cs; }, f1 = function(v){ return (+v).toFixed(1); };
    var items = this.items = [], dur = P.dur, sweep = this.variant === "sweep";
    // 空の格子（段階 0 から）
    D.el("rect", {x: f1(L.gx), y: f1(L.gy), width: f1(L.gw), height: f1(L.gh), fill: "none", stroke: "var(--line)", "stroke-width": 1.5}, gGrid);
    for (var i = 1; i < nc; i++) D.el("line", {x1: f1(X(i)), y1: f1(L.gy), x2: f1(X(i)), y2: f1(L.gy + L.gh), stroke: "var(--line)", "stroke-width": 1}, gGrid);
    for (i = 1; i < nr; i++) D.el("line", {x1: f1(L.gx), y1: f1(Y(i)), x2: f1(L.gx + L.gw), y2: f1(Y(i)), stroke: "var(--line)", "stroke-width": 1}, gGrid);
    // セル：段階ごとに、見せ方 sweep は左上から順に（同じ段階の中の順番）
    var order = {}, gap = cs >= 16 ? 0.75 : 0;   // セルの間の細い隙間（小さいセルでは網目に見えるので付けない）
    for (var r = 0; r < nr; r++) for (var c = 0; c < nc; c++){
      var k = pl.cell[r][c]; (order[k] = order[k] || []).push([r, c]);
    }
    Object.keys(order).forEach(function(k){ order[k].sort(function(a, b){ return (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]; }); });
    for (r = 0; r < nr; r++) for (c = 0; c < nc; c++){
      var st = pl.cell[r][c], pos = order[st].findIndex(function(o){ return o[0] === r && o[1] === c; }), n = order[st].length;
      var pt = paint(C.frac(pl.val[r][c], pl.kind, pl.dom));
      var g = D.el("g", {opacity: 0}, gCell);
      D.el("rect", {x: f1(X(c) + gap), y: f1(Y(r) + gap), width: f1(cs - 2 * gap), height: f1(cs - 2 * gap), fill: pt.fill}, g);
      if (nf){
        var tx = this.texts(r, c); if (lines === 1 && tx.length === 2) tx = [tx[1]];
        tx.forEach(function(s, j){
          var y = Y(r) + cs / 2 + nf * 0.36 + (tx.length === 2 ? (j ? 0.62 : -0.62) * nf : 0);
          var ta = {x: f1(X(c) + cs / 2), y: f1(y), "font-size": j ? Math.max(24, nf - 4) : nf, "text-anchor": "middle", fill: pt.text, "font-weight": j || tx.length === 1 ? 700 : 400, style: "font-variant-numeric:tabular-nums"};
          // 縁（halo）：セルの色に対してどちらの字の色も 4.5:1 に届かないとき、反対の色の 3 px の線を字の下に
          if (pt.halo) Object.assign(ta, {stroke: pt.halo, "stroke-width": 3, "stroke-linejoin": "round", "paint-order": "stroke"});
          D.el("text", ta, g).textContent = s;
        });
      }
      var at = sweep && n > 1 ? dur * 0.6 * pos / (n - 1) : 0, len = sweep ? dur * 0.4 : dur;
      items.push({el: g, st: st, at: at, len: len});
    }
    // 枠（対角は --fg、強調は --emph）：地の色の太い線の上に色の線（濃いセルの上でも明るいセルの上でも見える）
    var frame = function(r, c, col, st, at){
      var g = D.el("g", {opacity: 0}, gOut), a = {x: f1(X(c) + 1), y: f1(Y(r) + 1), width: f1(cs - 2), height: f1(cs - 2), fill: "none"};
      D.el("rect", Object.assign({stroke: "var(--bg)", "stroke-width": 8}, a), g);
      D.el("rect", Object.assign({stroke: col, "stroke-width": 4}, a), g);
      items.push({el: g, st: st, at: at, len: dur * 0.5});
    };
    if (ON(P.diag)) for (i = 0; i < Math.min(nr, nc); i++) frame(i, i, "var(--fg)", pl.cell[i][i], dur * 0.5);
    else if (P.diag !== "off") ctx.report("attr", '[heatmap] diag="' + P.diag + '" is not on or off (off is used)');
    pl.hl.forEach(function(h){ frame(h.r, h.c, "var(--emph)", h.st, h.st === pl.cell[h.r][h.c] ? dur * 0.5 : 0); });
    // ---- 名前（段階 0 から） ----
    var lab = function(x, y, s, a){ return D.el("text", Object.assign({x: f1(x), y: f1(y), "font-size": fs, fill: "var(--fg)"}, a || {}), gLab); };
    C.shown(nr, L.kr).forEach(function(r){ lab(L.gx - 12, Y(r) + cs / 2 + fs * 0.36, pl.rows[r], {"text-anchor": "end"}).textContent = pl.rows[r]; });
    C.shown(nc, L.kc).forEach(function(c){
      var x = X(c) + cs / 2, t;
      if (L.orient === "h") t = lab(x, L.gy - 10, "", {"text-anchor": "middle"});
      else t = lab(x + fs * 0.36, L.gy - 10, "", {"text-anchor": "start", transform: "rotate(-90 " + f1(x + fs * 0.36) + " " + f1(L.gy - 10) + ")"});
      t.textContent = pl.cols[c];
    });
    if (P.xl){ var tl = lab(L.gx + L.gw / 2, L.gy - (L.top - (P.xl ? 40 : 0)) - 12, "", {"text-anchor": "middle", "font-weight": 700, "font-size": 26}); tl.textContent = P.xl; }
    if (P.yl){ var yx = L.x0 + 26, yy = L.gy + L.gh / 2, ty = lab(yx, yy, "", {"text-anchor": "middle", "font-weight": 700, "font-size": 26, transform: "rotate(-90 " + f1(yx) + " " + f1(yy) + ")"}); ty.textContent = P.yl; }
    // ---- 凡例の帯：上が最大、真ん中が center（sequential は真ん中の値）、下が最小 ----
    var bx = L.gx + L.gw + 22, bh = L.gh, gid = ID + "legend-" + (++SEQ);
    // 帯は混ぜる割合をそのまま（セルの字のために寄せた割合ではなく、尺度そのもの）
    var grad = D.el("linearGradient", {id: gid, x1: 0, y1: 0, x2: 0, y2: 1}, D.el("defs", {}, svg));
    for (i = 0; i <= 20; i++){
      var f = C.frac(dm.hi - (dm.hi - dm.lo) * i / 20, pl.kind, dm), pc = Math.round(Math.abs(f) * 10000) / 100, side = f < 0 ? low : tone;
      D.el("stop", {offset: (i / 20).toFixed(3), "stop-color": pc <= 0 ? "var(--bg)" : "color-mix(in oklab, var(--" + side + ") " + pc + "%, var(--bg))"}, grad);
    }
    D.el("rect", {x: f1(bx), y: f1(L.gy), width: 24, height: f1(bh), fill: "url(#" + gid + ")", stroke: "var(--line)", "stroke-width": 1.5}, gGrid);
    var marks = bh >= 3 * 30 ? [[0, legend[0]], [0.5, legend[1]], [1, legend[2]]] : [[0, legend[0]], [1, legend[2]]];
    marks.forEach(function(m){
      var y = L.gy + bh * m[0];
      D.el("line", {x1: f1(bx + 24), y1: f1(y), x2: f1(bx + 30), y2: f1(y), stroke: "var(--muted)", "stroke-width": 1.5}, gGrid);
      lab(bx + 34, Math.max(L.gy + 20, Math.min(L.gy + bh - 2, y + 8)), "", {"font-size": 24, "text-anchor": "start"}).textContent = m[1];
    });
    // ---- 読める層（画面にも印刷にも出ない）：値の表 ----
    var wrap = document.createElement("div");
    wrap.className = "sr-only";
    wrap.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0");
    var tbl = document.createElement("table");
    tbl.setAttribute("style", "font-size:24px");
    var cap = document.createElement("caption"); cap.textContent = this.getAttribute("aria-label") || (P.xl || P.yl ? [P.yl, P.xl].filter(Boolean).join(ja ? " × " : " by ") : (ja ? "ヒートマップ" : "Heat map")); tbl.appendChild(cap);
    var tr = document.createElement("tr"), th = document.createElement("th"); th.textContent = ja ? "行＼列" : "row \\ column"; tr.appendChild(th);
    pl.cols.forEach(function(s){ var x = document.createElement("th"); x.setAttribute("scope", "col"); x.textContent = s; tr.appendChild(x); });
    tbl.appendChild(tr);
    pl.rows.forEach(function(s, r){
      var row = document.createElement("tr"), h = document.createElement("th"); h.setAttribute("scope", "row"); h.textContent = s; row.appendChild(h);
      pl.cols.forEach(function(_, c){
        var x = document.createElement("td"), t = self.texts(r, c);
        var hit = pl.hl.some(function(o){ return o.r === r && o.c === c; });
        x.textContent = (t.length === 2 ? t[0] + "（" + t[1] + "）" : t[0]) + (hit ? (ja ? "（強調）" : " (highlighted)") : "");
        row.appendChild(x);
      });
      tbl.appendChild(row);
    });
    wrap.appendChild(tbl); this.appendChild(wrap);
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", (ja ? "ヒートマップ：" : "Heat map: ") + nr + " × " + nc);
  }
  duration(k){
    var pl = this.plan();
    if (k < 1) return 0;
    var any = pl.cell.some(function(row){ return row.indexOf(k) >= 0; }) || pl.hl.some(function(h){ return h.st === k; });
    return any ? this.props.dur : 0;
  }
  render(k, t, ctx){
    var D = base, lecture = !!ctx.preview, FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    this.items.forEach(function(it){
      var op = it.st < k ? 1 : it.st > k ? (lecture ? FAINT : 0) : D.prog(t, it.at, it.len);
      it.el.setAttribute("opacity", op.toFixed(3));
    });
  }
};
});
