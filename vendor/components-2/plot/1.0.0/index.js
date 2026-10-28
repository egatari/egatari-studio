// plot 1.0.0: axes for figures of Egatari components 2.0 (a library part, Egatari spec §6.1). It requires base (el, mtext)
// and returns {Plot}: Plot(box, o) draws the axes into box (an element or its id) and returns
// {svg, W, H, m, x(v), y(v), clip, d(f, a, b, n), poly(pts)}. Plot.n counts the clip paths of this copy; their ids are
// prefixed with this part's name and version (plot-1-0-0-clip1, plot-1-0-0-clip2, …), so that they are unique across parts
// and part versions in one file and deterministic (spec §6.1 Identifiers: a counter, no randomness, no timing). This is the
// one deliberate difference from DECK.Plot, whose ids are clip1, clip2, … (CHANGELOG; tools/test-part-plot.mjs allows it).
//
// Provenance: Plot is copied verbatim from Egatari Studio's kit/deck.js (https://github.com/egatari/egatari-studio, commit
// 03eaf0607598b993eb020f8e619caa53526bc771, DECK.Plot there), MIT License, Copyright (c) 2026 Gendo Kumoi, the same owner
// and licence as this repository; el and mtext come from base instead of deck.js's closure.
// tools/test-part-plot.mjs compares it with the pinned Studio's DECK.Plot.
egatariParts.define({name: "plot", version: "1.0.0", requires: {base: "1.0.0"}}, function(deps){
"use strict";
var el = deps.base.el, mtext = deps.base.mtext;
var ID = "plot-1-0-0-";   // name and version of this part, dots replaced (spec §6.1 Identifiers)

// 座標軸つきの図（キットの Plot。色はテーマの変数）
// o = {xr:[min,max], yr:[min,max], xt:[目盛り], yt:[目盛り], xf:小数桁, yf:小数桁, xl:"横軸名", xl2:"横軸の補足", yl:"縦軸名", noY:true, m:{l,r,t,b}}
function Plot(box, o){
  if (typeof box === "string") box = document.getElementById(box);
  var W = box.clientWidth, H = box.clientHeight, m = o.m || {l: 86, r: 20, t: 16, b: 64};
  var svg = el("svg", {viewBox: "0 0 " + W + " " + H, class: "plotsvg"}, box);
  var p = {svg: svg, W: W, H: H, m: m,
    x: function(v){ return m.l + (v - o.xr[0]) / (o.xr[1] - o.xr[0]) * (W - m.l - m.r); },
    y: function(v){ return H - m.b - (v - o.yr[0]) / (o.yr[1] - o.yr[0]) * (H - m.t - m.b); }};
  var cid = ID + "clip" + (++Plot.n);
  var cp = el("clipPath", {id: cid}, el("defs", {}, svg));
  el("rect", {x: m.l, y: m.t - 4, width: W - m.l - m.r, height: H - m.t - m.b + 4}, cp);
  p.clip = "url(#" + cid + ")";
  var ax = el("g", {class: "axes"}, svg);
  var K = "var(--fg)";
  el("line", {x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, stroke: K, "stroke-width": 1.5}, ax);
  if (!o.noY) el("line", {x1: m.l, y1: m.t, x2: m.l, y2: H - m.b, stroke: K, "stroke-width": 1.5}, ax);
  var fmt = function(v, f){ return (f !== undefined ? v.toFixed(f) : String(v)).replace("-", "−"); };
  (o.xt || []).forEach(function(v){
    el("line", {x1: p.x(v), y1: H - m.b, x2: p.x(v), y2: H - m.b + 6, stroke: K, "stroke-width": 1.5}, ax);
    mtext(ax, p.x(v), H - m.b + 30, fmt(v, o.xf), {"text-anchor": "middle"});
  });
  (o.yt || []).forEach(function(v){
    el("line", {x1: m.l - 6, y1: p.y(v), x2: m.l, y2: p.y(v), stroke: K, "stroke-width": 1.5}, ax);
    mtext(ax, m.l - 10, p.y(v) + 8, fmt(v, o.yf), {"text-anchor": "end"});
  });
  if (o.xl) mtext(ax, (m.l + W - m.r) / 2, H - (o.xl2 ? 38 : 6), o.xl, {"text-anchor": "middle"});
  if (o.xl2) mtext(ax, (m.l + W - m.r) / 2, H - 6, o.xl2, {"text-anchor": "middle", fill: "var(--muted)"});
  if (o.yl) mtext(ax, 22, (m.t + H - m.b) / 2, o.yl, {"text-anchor": "middle", transform: "rotate(-90 22 " + (m.t + H - m.b) / 2 + ")"});
  // 関数 f を [a,b] で n 分割した折れ線の d 属性
  p.d = function(f, a, b, n){
    var s = "";
    for (var i = 0; i <= n; i++){ var v = a + (b - a) * i / n; s += (i ? "L" : "M") + p.x(v).toFixed(1) + "," + p.y(f(v)).toFixed(1); }
    return s;
  };
  // 点列 [[x,y],…] の折れ線
  p.poly = function(pts){ return pts.map(function(q, i){ return (i ? "L" : "M") + p.x(q[0]).toFixed(1) + "," + p.y(q[1]).toFixed(1); }).join(""); };
  return p;
}
Plot.n = 0;

return {Plot: Plot};
});
