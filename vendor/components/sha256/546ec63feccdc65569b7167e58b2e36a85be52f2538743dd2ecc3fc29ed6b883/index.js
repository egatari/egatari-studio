// m-tape：テープ図・線分図。行の長さは全部の行で同じ尺度。全体や部分を括る括弧と名前、行から行への「2 倍」の矢印
// <m-tape style="height:360px">
//   <script type="application/json">{"rows": [{"label": "みかん", "segs": [{"v": 8, "label": "食べた 8 こ"}, {"v": 15, "label": "のこり 15 こ"}]}],
//     "brace": [{"row": 0, "from": 0, "to": 1, "label": "はじめ □ こ", "side": "above"}]}
// （JSON の終わり）</m-tape>
// 段階：build="steps"（既定）は 行を 1 つずつ → 括弧を 1 つずつ → 倍の矢印を 1 つずつ。build="rows" は行を 1 つずつ（括弧と矢印はその行と）、
//       build="whole" は全部を 1 段階で。項目の show で段階を指定できる
// kind="tape"（既定、テープ図）か "line"（線分図）
// 見せ方（docs/conventions.md §1）：fade（フェード、既定）・grow（テープが左から伸び、括弧と矢印は線を引く）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// データや大きさの問題は ctx.report で知らせる（1.x の console.warn の代わり）
egatariParts.define({name: "tape", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-tape"}, function(deps){
"use strict";
var base = deps.base;
var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.3 : /[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
var TONES = /^(term|emph|muted|accent2|fg|series-[1-4])$/;
var UNK = ["?", "□"];
return class extends base.MotionElement {
  static partName = "tape";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "grow"];
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["rows"], properties: {
      rows: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["segs"], properties: {
        label: {type: "string"}, tone: {type: "string"}, show: {type: "integer"},
        segs: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["v"], properties: {
          v: {type: "number"}, label: {type: "string"}, unknown: {type: "string"}}}}}}},
      brace: {type: "array", items: {type: "object", additionalProperties: false, required: ["row", "from", "to"], properties: {
        row: {type: "integer"}, from: {type: "integer"}, to: {type: "integer"}, label: {type: "string"}, side: {type: "string", enum: ["above", "below"]}, show: {type: "integer"}}}},
      times: {type: "array", items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: {type: "integer"}, to: {type: "integer"}, label: {type: "string"}, show: {type: "integer"}}}}}},
    example: {rows: [{label: "みかん", segs: [{v: 8, label: "食べた 8 こ"}, {v: 15, label: "のこり 15 こ"}]}], brace: [{row: 0, from: 0, to: 1, label: "はじめ □ こ", side: "above"}]},
    note: {en: "rows [{label, segs: [{v, label, unknown: \"?\" | \"□\"}]}]; brace [{row, from, to, label, side: above|below}] (from/to are segment numbers from 0); times [{from, to, label}] (row numbers)",
           ja: "rows [{label, segs: [{v, label, unknown: \"?\" か \"□\"}]}]、brace [{row, from, to, label, side: above|below}]（from・to は 0 から数えた区切りの番号）、times [{from, to, label}]（行の番号）"},
  };
  static props = {
    kind:  {type: "string", default: "tape", doc: "tape（テープ図）か line（線分図）"},
    build: {type: "string", default: "steps", doc: "steps（行・括弧・矢印を 1 つずつ）・rows（行を 1 つずつ。括弧と矢印はその行と）・whole（全部を 1 段階で）"},
    dur:   {type: "number", default: 0.8, doc: "1 段階の動きの秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, notes = [];
    var rows = d.rows.map(function(r, i){
      r.segs.forEach(function(s){ if (s.unknown !== undefined && UNK.indexOf(s.unknown) < 0) notes.push('[tape] unknown "' + s.unknown + '" is not "?" or "□" ("?" is used)'); if (!(s.v > 0)) throw new Error("m-tape: a segment's v must be a positive number (" + s.v + ")"); });
      return {i: i, o: r};
    });
    var R = rows.length;
    var braces = (d.brace || []).filter(function(b){
      if (b.row < 0 || b.row >= R){ notes.push("[tape] brace row " + b.row + " does not exist (ignored)"); return false; }
      var n = rows[b.row].o.segs.length;
      if (b.from < 0 || b.to >= n || b.from > b.to){ notes.push("[tape] brace from " + b.from + " to " + b.to + " is not a segment range of row " + b.row + " (0 to " + (n - 1) + ")"); return false; }
      if (b.side !== undefined && b.side !== "above" && b.side !== "below"){ notes.push('[tape] brace side "' + b.side + '" is not above or below'); }
      return true;
    }).map(function(b){ return {o: b, row: b.row, side: b.side === "below" ? "below" : "above"}; });
    var times = (d.times || []).filter(function(x){
      var ok = x.from >= 0 && x.from < R && x.to >= 0 && x.to < R && x.from !== x.to;
      if (!ok) notes.push("[tape] times from " + x.from + " to " + x.to + " needs two different rows (ignored)");
      return ok;
    }).map(function(x){ return {o: x}; });
    var build = P.build;
    if (["steps", "rows", "whole"].indexOf(build) < 0){ notes.push('[tape] build="' + build + '" is not steps, rows or whole (steps is used)'); build = "steps"; }
    var sh = function(o){ return Number.isInteger(o.show) && o.show >= 1 ? o.show : null; };
    var k = 0;
    rows.forEach(function(r){ r.st = sh(r.o) || (build === "whole" ? 1 : ++k); });
    braces.forEach(function(b){ b.st = sh(b.o) || (build === "whole" ? 1 : build === "rows" ? rows[b.row].st : ++k); });
    times.forEach(function(x){ x.st = sh(x.o) || (build === "whole" ? 1 : build === "rows" ? Math.max(rows[x.o.from].st, rows[x.o.to].st) : ++k); });
    var steps = Math.max.apply(null, [1].concat(rows.map(function(r){ return r.st; }), braces.map(function(b){ return b.st; }), times.map(function(x){ return x.st; })));
    return (this._plan = {rows: rows, braces: braces, times: times, steps: steps, notes: notes});
  }
  duration(k){ return k >= 1 && k <= this.plan().steps ? this.props.dur : 0; }
  mount(ctx){
    var P = this.props, D = base, pl = this.plan();
    this.variant = base.variant(this);
    pl.notes.forEach(function(n){ ctx.report("data", n); });
    var line = P.kind === "line";
    if (P.kind !== "tape" && P.kind !== "line") ctx.report("data", '[tape] kind="' + P.kind + '" is not tape or line (tape is used)');
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight, dur = P.dur, grow = this.variant === "grow";
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var items = this.items = [];
    var add = function(el, o){ o.el = el; items.push(o); return el; };
    var FS = 24, ROW = 34, BR = 16, BLV = BR + 6 + ROW + 6;
    var rows = pl.rows, labW = Math.max.apply(null, [0].concat(rows.map(function(r){ return r.o.label ? est(r.o.label, 26) : 0; })));
    // 倍の矢印は行の左の端（どの行もそろう）を結ぶ。名前はその左に
    var tW = pl.times.length ? Math.max.apply(null, pl.times.map(function(x){ return x.o.label ? est(x.o.label, 26) + 14 : 0; })) + 52 : 0;
    var x0 = (labW ? labW + 28 : 8) + tW, labX = tW ? labW + 8 : x0 - 18;   // 矢印があれば行の名前は左の列に
    var mR = 10;
    var maxT = Math.max.apply(null, rows.map(function(r){ return r.o.segs.reduce(function(a, s){ return a + s.v; }, 0); }));
    var sc = (W - x0 - mR) / maxT;
    // 区切りの中身（□ の枠・?・名前）と幅
    var content = function(s){
      var parts = [];
      if (s.unknown !== undefined) parts.push(s.unknown === "□" ? {box: true, w: 30} : {t: "?", w: est("?", 28), q: true});
      if (s.label) parts.push({t: s.label, w: est(s.label, FS)});
      return {parts: parts, w: parts.reduce(function(a, p){ return a + p.w; }, 0) + 8 * Math.max(0, parts.length - 1)};
    };
    // 行ごとの寸法
    rows.forEach(function(r){
      var x = x0;
      r.segs = r.o.segs.map(function(s){ var o = {s: s, x: x, w: s.v * sc, c: content(s)}; x += o.w; return o; });
      r.end = x;
      r.tapeH = line ? 24 : 52;
      r.out = line ? r.segs.some(function(g){ return g.c.parts.length; }) : r.segs.some(function(g){ return g.c.parts.length && g.c.w + 14 > g.w; });
      r.segs.forEach(function(g){ g.outside = line || g.c.w + 14 > g.w; });
      var lv = function(side){
        var bs = pl.braces.filter(function(b){ return b.row === r.i && b.side === side; });
        bs.sort(function(a, b){ return (a.o.to - a.o.from) - (b.o.to - b.o.from); });
        var placed = [];
        bs.forEach(function(b){
          var l = 0;
          while (placed.some(function(p){ return p.lv === l && p.o.from <= b.o.to && b.o.from <= p.o.to; })) l++;
          b.lv = l; placed.push(b);
        });
        return bs.length ? Math.max.apply(null, bs.map(function(b){ return b.lv; })) + 1 : 0;
      };
      r.upN = lv("above"); r.downN = lv("below");
      r.above = (r.out ? ROW + 8 : 0) + r.upN * BLV;
      r.below = r.downN * BLV;
      r.h = r.above + r.tapeH + r.below;
    });
    var need = rows.reduce(function(a, r){ return a + r.h; }, 0) + 24 * (rows.length - 1) + 8;
    if (need > H + 1) ctx.report("size", "[tape] the element (" + W + "×" + H + " px) is too small; it needs about " + Math.ceil(need) + " px of height");
    var gap = rows.length > 1 ? Math.min(60, 24 + Math.max(0, H - need) / (rows.length + 1)) : 0;
    var total = rows.reduce(function(a, r){ return a + r.h; }, 0) + gap * (rows.length - 1);
    var y = Math.max(4, (H - total) / 2);
    rows.forEach(function(r){ r.top = y + r.above; r.cy = r.top + r.tapeH / 2; y += r.h + gap; });
    var gT = D.el("g", {}, svg), gS = D.el("g", {}, svg), gA = D.el("g", {}, svg), gX = D.el("g", {}, svg);
    var drawContent = function(par, cx, base, c){
      var x = cx - c.w / 2;
      c.parts.forEach(function(p){
        if (p.box) D.el("rect", {x: x.toFixed(1), y: (base - 25).toFixed(1), width: 30, height: 30, rx: 2, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2.5}, par);
        else D.mtext(par, x + p.w / 2, base, p.t, {"text-anchor": "middle", "font-size": p.q ? 28 : FS, "font-weight": p.q ? 700 : 400, fill: "var(--fg)"});
        x += p.w + 8;
      });
    };
    rows.forEach(function(r, ri){
      var col = TONES.test(r.o.tone || "") ? "var(--" + r.o.tone + ")" : "var(--series-" + (ri % 4 + 1) + ")", st = r.st, n = r.segs.length;
      if (r.o.label) add(D.mtext(gX, labX, r.cy + 9, r.o.label, {"text-anchor": "end", "font-size": 26, "font-weight": 700, fill: "var(--fg)", opacity: 0}), {st: st, at: 0, len: dur * 0.5, kind: "fade"});
      r.segs.forEach(function(g, j){
        var at = grow ? dur * 0.75 * j / n : 0, len = grow ? dur * 0.75 / n : dur * 0.7;
        if (!line){
          var rect = D.el("rect", {x: g.x.toFixed(1), y: r.top.toFixed(1), width: g.w.toFixed(1), height: r.tapeH, fill: col, "fill-opacity": 0.14, stroke: "var(--fg)", "stroke-width": 2.5, opacity: 0}, gS);
          add(rect, {st: st, at: at, len: len, kind: "seg", w: g.w});
        } else {
          add(D.el("line", {x1: g.x.toFixed(1), x2: (g.x + g.w).toFixed(1), y1: r.cy.toFixed(1), y2: r.cy.toFixed(1), stroke: col, "stroke-width": 4, opacity: 0}, gS), {st: st, at: at, len: len, kind: "line"});
          [g.x, g.x + g.w].forEach(function(x, e){
            if (e === 0 && j > 0) return;
            add(D.el("line", {x1: x.toFixed(1), x2: x.toFixed(1), y1: (r.cy - 12).toFixed(1), y2: (r.cy + 12).toFixed(1), stroke: "var(--fg)", "stroke-width": 3, opacity: 0}, gS), {st: st, at: grow ? (e ? at + len * 0.8 : at) : 0, len: grow ? dur * 0.15 : dur * 0.7, kind: "fade"});
          });
        }
        if (g.c.parts.length){
          var cg = D.el("g", {opacity: 0}, gT), base = g.outside ? r.top - 8 - ROW + 25 : r.cy + 9;
          var cx = Math.max(x0 + g.c.w / 2, Math.min(W - g.c.w / 2 - 2, g.x + g.w / 2));
          drawContent(cg, cx, base, g.c);
          add(cg, {st: st, at: grow ? at + len * 0.6 : dur * 0.2, len: grow ? Math.max(0.15, dur * 0.25) : dur * 0.5, kind: "fade"});
        }
      });
      // 括弧
      pl.braces.filter(function(b){ return b.row === ri; }).forEach(function(b){
        var xa = r.segs[b.o.from].x + 2, xb = r.segs[b.o.to].x + r.segs[b.o.to].w - 2, up = b.side === "above", dsg = up ? -1 : 1;
        var yb = up ? r.top - (r.out ? ROW + 8 : 0) - 6 - b.lv * BLV : r.top + r.tapeH + 6 + b.lv * BLV;
        var xm = (xa + xb) / 2, q = BR, rr = Math.min(12, (xb - xa) / 4), f = function(v){ return v.toFixed(1); };
        var d = "M" + f(xa) + "," + f(yb) + "Q" + f(xa) + "," + f(yb + dsg * q / 2) + " " + f(xa + rr) + "," + f(yb + dsg * q / 2) + "L" + f(xm - rr) + "," + f(yb + dsg * q / 2) +
                "Q" + f(xm) + "," + f(yb + dsg * q / 2) + " " + f(xm) + "," + f(yb + dsg * q) + "Q" + f(xm) + "," + f(yb + dsg * q / 2) + " " + f(xm + rr) + "," + f(yb + dsg * q / 2) +
                "L" + f(xb - rr) + "," + f(yb + dsg * q / 2) + "Q" + f(xb) + "," + f(yb + dsg * q / 2) + " " + f(xb) + "," + f(yb);
        add(D.el("path", {d: d, fill: "none", stroke: "var(--fg)", "stroke-width": 2.5, "stroke-linejoin": "round", opacity: 0}, gA), {st: b.st, at: 0, len: dur * 0.6, kind: "line"});
        if (b.o.label){
          var c = content({label: b.o.label}), cx = Math.max(c.w / 2 + 2, Math.min(W - c.w / 2 - 2, xm)), base = up ? yb - q - 6 - ROW + 25 : yb + q + 6 + 25;
          var cg = D.el("g", {opacity: 0}, gT);
          drawContent(cg, cx, base, c);
          add(cg, {st: b.st, at: dur * 0.3, len: dur * 0.5, kind: "fade"});
        }
      });
    });
    // 倍の矢印：行の左の端から端へ、左にふくらむ弧
    pl.times.forEach(function(x){
      var a = rows[x.o.from], b = rows[x.o.to], xs = x0 - 8, xc = x0 - 44, ya = a.cy, yb = b.cy;
      add(D.el("path", {d: "M" + xs.toFixed(1) + "," + ya.toFixed(1) + "C" + xc.toFixed(1) + "," + ya.toFixed(1) + " " + xc.toFixed(1) + "," + yb.toFixed(1) + " " + (xs - 10).toFixed(1) + "," + yb.toFixed(1),
        fill: "none", stroke: "var(--emph)", "stroke-width": 3, "stroke-linecap": "round", opacity: 0}, gA), {st: x.st, at: 0, len: dur * 0.6, kind: "line"});
      add(D.el("path", {d: "M" + xs.toFixed(1) + "," + yb.toFixed(1) + "l-14,-7v14Z", fill: "var(--emph)", opacity: 0}, gA), {st: x.st, at: dur * 0.5, len: dur * 0.2, kind: "fade"});
      if (x.o.label){
        var lx = 0.75 * xc + 0.125 * (xs + xs - 10) - 12;
        add(D.mtext(gT, lx, (ya + yb) / 2 + 9, x.o.label, {"text-anchor": "end", "font-size": 26, "font-weight": 700, fill: "var(--fg)", opacity: 0}), {st: x.st, at: dur * 0.3, len: dur * 0.5, kind: "fade"});
      }
    });
    if (grow) items.forEach(function(it){ if (it.kind === "line") it.el.setAttribute("pathLength", 1); });
  }
  render(k, t, ctx){
    var D = base, lecture = !!ctx.preview, grow = this.variant === "grow", FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    this.items.forEach(function(it){
      var e = it.st < k ? 1 : it.st > k ? (lecture ? -1 : 0) : D.prog(t, it.at, it.len), op;
      if (e < 0){ op = FAINT; e = 1; } else op = e;
      if (grow && it.kind === "seg"){
        it.el.setAttribute("width", (it.w * e).toFixed(1));
        op = e > 0 ? (op === FAINT && it.st > k ? FAINT : 1) : 0;
      } else if (grow && it.kind === "line"){
        it.el.setAttribute("stroke-dasharray", e >= 1 ? "none" : e.toFixed(4) + " 2");
        op = e > 0 ? (op === FAINT && it.st > k ? FAINT : 1) : 0;
      }
      it.el.setAttribute("opacity", op.toFixed(3));
    });
  }
};
});
