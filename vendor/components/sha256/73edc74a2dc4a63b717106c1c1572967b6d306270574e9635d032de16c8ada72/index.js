// m-matrix 2.1.0: a comparison matrix in two forms (handoff #64; 2.1 for the positioning types, handoff #71).
//   kind "cross" (default): the cross of two axes. Rows are the values of axis 1, columns the values of axis 2 (2 to 4 each);
//     a cell lists the studies that fall there (a citation number or "Author (year)", 1 to 3), "self" marks the cell of this work
//     (written as 本研究 / This work and framed, never colour alone; {"self": "one sentence"} adds this work's finding under it),
//     and an empty cell shows — with a note number; the notes ("trivial", "meaningless", "not yet done") stand under the table.
//     A third axis is a mark after a study's name (†, ‡) explained by "marks". "design" adds a small table under the cross
//     (the design of the data or the identification, earlier work against this work, and what it made possible).
//     Steps (order "build", default): the axes and the empty grid → the earlier studies → this work's cell, framed → the notes
//     of the empty cells. order "whole": everything at step 1.
//   kind "attributes": rows are studies (this work first), columns their elements (aim, setting, input, output, criterion …),
//     a cell a short text (✓ △ × too). A column may name where it comes from ({"name", "source"}: the source stands over the
//     name, so a reader sees the requirement was not picked to suit this work). order "whole" (default), "col" (a column per
//     step) or "row" (a row per step); the row marked self is framed at the last step. "marks" explains the symbols under the
//     table ("— not stated" too).
// Headers: a cross table names its axes once (the row axis in the corner, the column axis over its values); the readable
// table (data-readable, the final state) writes each header as "axis: value". Cells are data-part boxes and their texts
// labels, for Studio's geometry check (spec §8.4). Text is size px (≥ 24); when the table does not fit at 24 px the part
// reports size with what it needs. Colours: grid --line, headers --fg bold, this work's frame --emph, notes, sources and
// dashes --muted.
egatariParts.define({name: "matrix", version: "2.1.0", requires: {base: "1.3.0"}, element: "m-matrix"}, function(deps){
"use strict";
var base = deps.base;
var T = {ja: {self: "本研究", note: "注", sep: "：", label: "表：", none: "該当なし", source: "出どころ"},
         en: {self: "This work", note: "Note ", sep: ": ", label: "Table: ", none: "none", source: "From"}};
var STR = {type: "string"};
var CELL = {type: ["array", "object"]};
var WRAP = 11;   // a wrapped text's line before the table is measured, in full-width characters (a half-width one counts 0.55)
var units = function(t){ var w = 0; for (var i = 0; i < t.length; i++) w += t.charCodeAt(i) < 0x100 ? 0.55 : 1; return w; };
// lines no wider than maxW by measure: "\n" breaks where the author wants; otherwise between characters as Japanese text
// breaks, but never inside a run of Latin letters or digits, nor between a number and the word after it ("7 割"), nor
// before 、。）」 (they stay on the line before); a 、 or 。 late in the line is the break when there is one
var TOKEN = /[A-Za-z0-9.,%+\-\/]+(?: [^\sA-Za-z0-9、。，．）」])?[、。，．）」]*|\S[、。，．・）」]*|\s+/g;
// a better break than the last character that fits: after 、 or 。 in the later 40 % of the line, else where hiragana gives way
// to a kanji, katakana or a digit (after a particle: 「割は｜学校の」) in its later half; -1 when there is none
var HIRA = /[\u3041-\u309f]/, WORD = /[\u4e00-\u9fff\u30a0-\u30ffA-Za-z0-9]/;
function breakAt(t){
  var n = t.length, i;
  for (i = n - 1; i >= n * 0.6; i--) if (/[、。，．]/.test(t[i - 1]) && i < n) return i;
  for (i = n - 1; i >= n * 0.5; i--) if (HIRA.test(t[i - 1]) && (WORD.test(t[i]) || (t[i] === " " && WORD.test(t[i + 1] || "")))) return i;
  return -1;
}
function wrap(s, maxW, measure){
  measure = measure || units; maxW = maxW || WRAP;
  var out = [];
  String(s).split("\n").forEach(function(part){
    var cur = "", toks = part.match(TOKEN) || [];
    toks.forEach(function(tok){
      if (/^\s+$/.test(tok)) { if (cur) cur += " "; return; }
      if (!cur || measure(cur + tok) <= maxW) { cur += tok; return; }
      var line = cur.replace(/ +$/, ""), rest = "", p = breakAt(line + tok);
      if (p > 0 && p < line.length) { rest = line.slice(p).replace(/^ +/, ""); line = line.slice(0, p).replace(/ +$/, ""); }
      out.push(line); cur = rest + tok;
    });
    out.push(cur.replace(/ +$/, ""));
  });
  return out;
}
// the marks under the table: one line when they are short (a legend of symbols), else a line each
function markLines(marks, ja){
  var items = marks.map(function(m){ return String(m.mark) + " " + String(m.text); });
  var one = items.join(ja ? "　" : "   "), w = 0;
  for (var i = 0; i < one.length; i++) w += one.charCodeAt(i) < 0x100 ? 0.55 : 1;
  return (items.length > 1 && w <= 40 ? [one] : items).map(function(t){ return {text: t, step: 1}; });
}
return class extends base.MotionElement {
  static partName = "matrix";
  static shape = {
    schema: {type: "object", additionalProperties: false, properties: {
      kind: {type: "string", enum: ["cross", "attributes"]},
      rows: {type: ["object", "array"]},
      cols: {type: ["object", "array"]},
      cells: {type: "array", maxItems: 4, items: {type: "array", maxItems: 4, items: CELL}},
      marks: {type: "array", maxItems: 4, items: {type: "object", additionalProperties: false, required: ["mark", "text"], properties: {mark: STR, text: STR}}},
      design: {type: "object", additionalProperties: false, required: ["cols", "rows"], properties: {
        cols: {type: "array", minItems: 2, maxItems: 3, items: STR},
        rows: {type: "array", minItems: 1, maxItems: 3, items: {type: "object", additionalProperties: false, required: ["cells"], properties: {
          label: STR, self: {type: "boolean"}, cells: {type: "array", items: STR}}}}}},
      self: STR}},
    example: {kind: "cross", rows: {axis: "評価基準", values: ["予測誤差", "ベイズリスク"]}, cols: {axis: "予測の形", values: ["点予測", "分布予測"]},
      cells: [[["[1]", "[2]"], ["[3]"]], [{none: "自明"}, {self: true}]]},
    note: {en: "cross: rows, cols {\"axis\", \"values\"}; cells[r][c] study names, {\"self\": true or \"finding\"} or {\"none\": \"why\"}; design {\"cols\", \"rows\"}. attributes: cols names or {\"name\", \"source\"}, rows {\"label\", \"cells\", \"self\"?}",
           ja: "cross：rows・cols は {\"axis\", \"values\"}、cells[r][c] は研究の名前の並び・{\"self\": true か \"結論\"}・{\"none\": \"理由\"}、design は {\"cols\", \"rows\"}。attributes：cols は名前か {\"name\", \"source\"}、rows は {\"label\", \"cells\", \"self\"?}"},
  };
  static props = {
    order: {type: "string", default: "", doc: "出し方：cross は build（既定）・whole、attributes は whole（既定）・col・row"},
    dur:   {type: "number", default: 0.6, doc: "1 ステップの秒数"},
    size:  {type: "number", default: 28, doc: "字の大きさ（px、24 以上。入らなければ 24 まで縮める）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // the cells and when each appears; from the data alone
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], ja = !/^en\b/i.test(this.closest && this.closest("[lang]") ? this.closest("[lang]").getAttribute("lang") : "ja");
    var L = ja ? T.ja : T.en, selfText = d.self || L.self, kind = d.kind || "cross", order = this.props.order;
    var cells = [], notes = [], grid = {}, steps = 0, selfBox = null;
    var cell = function(r, c, lines, o){ var x = Object.assign({r: r, c: c, lines: lines, step: 0}, o || {}); cells.push(x); if (!x.dz) grid[r + "," + c] = x; return x; };
    var marks = Array.isArray(d.marks) ? d.marks : [];
    var nr, nc, head;
    if (kind === "cross") {
      var R = d.rows && !Array.isArray(d.rows) ? d.rows : {}, C = d.cols && !Array.isArray(d.cols) ? d.cols : {};
      var rv = Array.isArray(R.values) ? R.values.map(String) : [], cv = Array.isArray(C.values) ? C.values.map(String) : [];
      if (rv.length < 2 || rv.length > 4 || cv.length < 2 || cv.length > 4) bad.push("cross needs 2 to 4 values on each axis (rows.values, cols.values)");
      if (order && order !== "build" && order !== "whole") bad.push("order for cross is build or whole, not " + order);
      var whole = order === "whole";
      // grid: row 0 = the column axis's name over its values, row 1 = the column values; column 0 = the row values
      nr = rv.length + 2; nc = cv.length + 1; head = {rows: 2, cols: 1};
      cell(0, 0, [String(R.axis || "")], {head: true, corner: true, span: [2, 1]});
      cell(0, 1, [String(C.axis || "")], {head: true, span: [1, cv.length]});
      cv.forEach(function(v, j){ cell(1, j + 1, [v], {head: true}); });
      rv.forEach(function(v, i){ cell(i + 2, 0, [v], {head: true}); });
      var cs = Array.isArray(d.cells) ? d.cells : [];
      if (cs.length !== rv.length || cs.some(function(row, i){ return !Array.isArray(row) || row.length !== cv.length; })) bad.push("cells must be " + rv.length + " rows of " + cv.length + " cells (rows.values × cols.values)");
      // build: the studies at 1, this work at 2 (when there is one), the notes at the last step (when there are any)
      var anySelf = cs.some(function(row){ return Array.isArray(row) && row.some(function(v){ return v && typeof v === "object" && !Array.isArray(v) && v.self; }); });
      var anyNote = cs.some(function(row){ return Array.isArray(row) && row.some(function(v){ return v && typeof v === "object" && !Array.isArray(v) && typeof v.none === "string" && v.none; }); });
      var sSelf = whole ? 1 : 2, sNote = whole ? 1 : anySelf ? 3 : 2;
      steps = whole ? 1 : 1 + (anySelf ? 1 : 0) + (anyNote ? 1 : 0);
      rv.forEach(function(_, i){ cv.forEach(function(_, j){
        var v = (cs[i] || [])[j], r = i + 2, c = j + 1, obj = v && typeof v === "object" && !Array.isArray(v);
        if (Array.isArray(v) && v.length) {
          if (v.length > 3) bad.push("cell " + (i + 1) + "," + (j + 1) + " lists " + v.length + " studies; at most 3 (pick the main ones)");
          cell(r, c, v.slice(0, 3).map(String), {step: 1});
        } else if (obj && v.self) {
          if (selfBox) bad.push("only one cell is this work's (self)");
          var claim = typeof v.self === "string" && v.self.trim() ? wrap(v.self.trim(), WRAP) : [];
          if (claim.length > 4) bad.push("this work's sentence takes " + claim.length + " lines; at most 4 (about 40 characters: the finding, not the method)");
          var x = cell(r, c, [selfText].concat(claim.slice(0, 4), (Array.isArray(v.studies) ? v.studies : []).map(String)), {step: sSelf, self: !selfBox,
            text: claim.length ? v.self.trim() : "", pre: [selfText], post: (Array.isArray(v.studies) ? v.studies : []).map(String), maxLines: 4});
          if (!selfBox) selfBox = x;
        } else if (obj && typeof v.none === "string" && v.none) {
          notes.push(v.none);
          cell(r, c, ["— " + L.note + notes.length], {step: sNote, dash: true, note: notes.length});
        } else {
          cell(r, c, ["—"], {step: 1, dash: true});
        }
      }); });
      // the design rows under the cross: a header row, then the rows (earlier work with the studies, this work with its cell)
      var design = null, Dz = d.design && typeof d.design === "object" ? d.design : null;
      if (Dz) {
        var dcols = Array.isArray(Dz.cols) ? Dz.cols.map(String) : [], drows = Array.isArray(Dz.rows) ? Dz.rows : [];
        if (dcols.length < 2 || dcols.length > 3) bad.push("design needs 2 or 3 cols");
        if (drows.length < 1 || drows.length > 3) bad.push("design needs 1 to 3 rows");
        if (dcols.length >= 2 && dcols.length <= 3 && drows.length >= 1 && drows.length <= 3) {
          design = {nr: drows.length + 1, nc: dcols.length + 1, cols: dcols, rows: []};
          cell(0, 0, [""], {dz: true, head: true});
          dcols.forEach(function(s, j){ cell(0, j + 1, wrap(s, WRAP + 2), {dz: true, head: true, text: s}); });
          drows.forEach(function(row, i){
            row = row && typeof row === "object" ? row : {};
            var dc = Array.isArray(row.cells) ? row.cells : [], st = row.self ? sSelf : 1;
            if (dc.length !== dcols.length) bad.push("design row " + (i + 1) + " has " + dc.length + " cells; design.cols has " + dcols.length);
            var lab = row.label ? String(row.label) : row.self ? selfText : "";
            cell(i + 1, 0, lab ? wrap(lab, WRAP) : [""], {dz: true, head: true, step: st, self: !!row.self});
            dcols.forEach(function(_, j){
              var s = dc[j] === undefined || dc[j] === null || dc[j] === "" ? "—" : String(dc[j]);
              cell(i + 1, j + 1, wrap(s, WRAP + 2), {dz: true, step: st, dash: s === "—", text: s});
            });
            design.rows.push({label: lab, cells: dcols.map(function(_, j){ return dc[j] === undefined || dc[j] === null || dc[j] === "" ? "—" : String(dc[j]); }), self: !!row.self, step: st});
          });
          if (!whole && !anySelf && design.rows.some(function(r){ return r.self; })) {
            // a self design row without a self cell: it comes after the studies all the same
            steps = Math.max(steps, sSelf);
          }
        }
      }
      var below = markLines(marks, ja)
        .concat(notes.map(function(t, i){ return {text: L.note + (i + 1) + L.sep + t, step: sNote}; }));
      return (this._plan = {kind: kind, L: L, bad: bad, cells: cells, grid: grid, nr: nr, nc: nc, head: head, steps: steps, selfBox: selfBox, below: below,
        design: design, rv: rv, cv: cv, raxis: String(R.axis || ""), caxis: String(C.axis || "")});
    }
    if (kind !== "attributes") bad.push("kind is cross or attributes");
    if (d.design) bad.push("design is for kind cross");
    var colsIn = Array.isArray(d.cols) ? d.cols : [], rows = Array.isArray(d.rows) ? d.rows : [];
    var cols = colsIn.map(function(v){ return v && typeof v === "object" ? String(v.name || "") : String(v); });
    var sources = colsIn.map(function(v){ return v && typeof v === "object" && v.source ? String(v.source) : ""; });
    var anySource = sources.some(Boolean);
    if (cols.length < 1 || cols.length > 6) bad.push("attributes needs 1 to 6 cols");
    if (rows.length < 1 || rows.length > 10) bad.push("attributes needs 1 to 10 rows");
    order = order || "whole";
    if (["whole", "col", "row"].indexOf(order) < 0) { bad.push("order for attributes is whole, col or row, not " + order); order = "whole"; }
    var hr = anySource ? 2 : 1;
    nr = rows.length + hr; nc = cols.length + 1; head = {rows: hr, cols: 1};
    var selfRow = -1;
    rows.forEach(function(r, i){ if (r && r.self && selfRow < 0) selfRow = i; });
    var groups = order === "whole" ? 1 : order === "col" ? cols.length : rows.length;
    steps = groups + (selfRow >= 0 && order !== "whole" ? 1 : 0);
    var colStep = function(j){ return order === "col" ? j + 1 : 0; };
    if (anySource) {
      // the sources stand over the names, with their column
      cell(0, 0, [L.source], {head: true, corner: true, muted: true});
      sources.forEach(function(s, j){ cell(0, j + 1, s ? wrap(s, WRAP) : [""], {muted: true, step: colStep(j), text: s}); });
    }
    cell(hr - 1, 0, [""], {head: true, corner: true});
    cols.forEach(function(v, j){ cell(hr - 1, j + 1, [v], {head: true}); });
    rows.forEach(function(r, i){
      r = r && typeof r === "object" ? r : {};
      var cs = Array.isArray(r.cells) ? r.cells : [];
      if (cs.length !== cols.length) bad.push("row " + (i + 1) + " has " + cs.length + " cells; cols has " + cols.length);
      var at = function(j){ return order === "whole" ? 1 : order === "col" ? j + 1 : i + 1; };
      cell(i + hr, 0, [String(r.label || "")], {head: true, step: order === "row" ? i + 1 : 0, self: i === selfRow});
      cols.forEach(function(_, j){
        var v = cs[j], s = v === undefined || v === null || v === "" ? "—" : String(v);
        cell(i + hr, j + 1, [s], {step: at(j), dash: s === "—"});
      });
    });
    var belowA = markLines(marks, ja);
    return (this._plan = {kind: kind, L: L, bad: bad, cells: cells, grid: grid, nr: nr, nc: nc, head: head, steps: steps, selfRow: selfRow,
      selfStep: selfRow >= 0 ? (order === "whole" ? 1 : steps) : 0, below: belowA, cols: cols, sources: anySource ? sources : null,
      rowsLabels: rows.map(function(r){ return String((r || {}).label || ""); })});
  }
  mount(ctx){
    var self = this, P = this.props, D = base, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    if (!(P.dur >= 0)) { ctx.report("attr", "[matrix] dur must be ≥ 0; using 0.6"); P.dur = 0.6; }
    if (!(P.size >= 24)) { ctx.report("attr", "[matrix] size must be ≥ 24; using 28"); P.size = 28; }
    pl.bad.forEach(function(m){ ctx.report("data", "[matrix] " + m); });
    if (pl.bad.length && (pl.nr < 2 || pl.nc < 2)) return;   // nothing to draw a grid from
    // sizes: the largest font from size down to 24 at which the table fits; else 24 and a size report
    var fit = null;
    for (var fs = Math.round(P.size); fs >= 24 && !fit; fs -= 2) fit = this._fit(fs, W, H);
    if (!fit) {
      var g24 = this._fit(24, W, H, true);
      ctx.report("size", "[matrix] the table needs " + Math.ceil(g24.tableW) + " × " + Math.ceil(g24.needH) + " px at 24 px; the element is " + W + " × " + H + " px (fewer rows or columns, shorter names, or a larger element)");
      fit = g24;
    }
    var G = this.geo = fit, fsz = G.fs;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    var gB = D.el("g", {}, svg), gL = D.el("g", {}, svg), gT = D.el("g", {}, svg), gF = D.el("g", {}, svg), gN = D.el("g", {}, svg);
    var xs = G.xs, ys = G.ys, x0 = xs[0], y0 = ys[0], hr = pl.head.rows, hc = pl.head.cols;
    // grid: thick under the header rows and right of the header column; the column-axis row has no vertical lines inside its span
    for (var r = 0; r <= pl.nr; r++) {
      var xa = pl.kind === "cross" && r === 1 ? xs[1] : x0;
      D.el("line", {x1: xa, x2: xs[pl.nc], y1: ys[r], y2: ys[r], stroke: "var(--line)", "stroke-width": r === hr ? 2.5 : 1.2}, gL);
    }
    for (var c = 0; c <= pl.nc; c++) {
      var ya = pl.kind === "cross" && c >= 2 && c < pl.nc ? ys[1] : y0;
      D.el("line", {x1: xs[c], x2: xs[c], y1: ya, y2: ys[pl.nr], stroke: "var(--line)", "stroke-width": c === hc ? 2.5 : 1.2}, gL);
    }
    var dxs = G.dxs, dys = G.dys, dz = pl.design;
    if (dz) {
      for (var r2 = 0; r2 <= dz.nr; r2++) D.el("line", {x1: dxs[0], x2: dxs[dz.nc], y1: dys[r2], y2: dys[r2], stroke: "var(--line)", "stroke-width": r2 === 1 ? 2.5 : 1.2}, gL);
      for (var c2 = 0; c2 <= dz.nc; c2++) D.el("line", {x1: dxs[c2], x2: dxs[c2], y1: dys[0], y2: dys[dz.nr], stroke: "var(--line)", "stroke-width": c2 === 1 ? 2.5 : 1.2}, gL);
    }
    var lh = Math.ceil(fsz * 1.3), pad = G.pad;
    this.cellEls = pl.cells.map(function(x, ci){
      var X = x.dz ? dxs : xs, Y = x.dz ? dys : ys;
      var sp = x.span || [1, 1], cx0 = X[x.c], cx1 = X[x.c + sp[1]], cy0 = Y[x.r], cy1 = Y[x.r + sp[0]];
      var id = (x.dz ? "d" : "m") + x.r + "-" + x.c, g = D.el("g", {}, gT);
      D.el("rect", {x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0, fill: "none", stroke: "none", "data-part": "box", "data-part-id": id}, gB);
      var ls = G.lines[ci], left = x.head && x.c === 0, n = ls.length, top = (cy0 + cy1) / 2 - (n - 1) * lh / 2 + fsz * 0.36;
      ls.forEach(function(s, i){
        if (!s) return;
        var t = D.el("text", {x: (left ? cx0 + pad : (cx0 + cx1) / 2).toFixed(1), y: (top + i * lh).toFixed(1), "font-size": fsz,
          "text-anchor": left ? "start" : "middle", fill: x.dash || x.muted ? "var(--muted)" : "var(--fg)", "font-weight": x.head && !x.muted || (x.self && i === 0) ? 700 : 400,
          "data-part": "label", "data-part-id": id, "data-part-of": "box"}, g);
        t.textContent = s;
      });
      return {x: x, g: g};
    });
    // this work: the cell (cross) or the row (attributes), framed in --emph; a self design row too
    var frames = [];
    if (pl.selfBox) { var b = pl.selfBox; frames.push({r: [xs[b.c] + 3, ys[b.r] + 3, xs[b.c + 1] - xs[b.c] - 6, ys[b.r + 1] - ys[b.r] - 6], step: b.step}); }
    else if (pl.selfRow >= 0) { var rr = pl.selfRow + hr; frames.push({r: [x0 + 3, ys[rr] + 3, xs[pl.nc] - x0 - 6, ys[rr + 1] - ys[rr] - 6], step: pl.selfStep}); }
    if (dz) dz.rows.forEach(function(o, i){ if (o.self) frames.push({r: [dxs[0] + 3, dys[i + 1] + 3, dxs[dz.nc] - dxs[0] - 6, dys[i + 2] - dys[i + 1] - 6], step: o.step}); });
    this.frames = frames.map(function(f){ return {step: f.step, el: D.el("rect", {x: f.r[0], y: f.r[1], width: f.r[2], height: f.r[3], rx: 5, fill: "none", stroke: "var(--emph)", "stroke-width": 4}, gF)}; });
    // notes and marks under the table (under the design rows when there are any)
    this.belowEls = pl.below.map(function(o, i){
      var t = D.el("text", {x: x0.toFixed(1), y: (G.belowTop + 14 + fsz * 0.9 + i * Math.ceil(fsz * 1.35)).toFixed(1), "font-size": fsz, fill: "var(--fg)"}, gN);
      t.textContent = o.text;
      return {o: o, t: t};
    });
    // the readable table (data-readable): the final state, headers as "axis: value"
    var tbl = document.createElement("table");
    tbl.className = "sr-only"; tbl.setAttribute("data-readable", "");
    tbl.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);border:0");
    var L = pl.L, tr = function(list, th){ var e = document.createElement("tr"); list.forEach(function(s, i){ var td = document.createElement(th || i === 0 ? "th" : "td"); td.textContent = s; e.appendChild(td); }); tbl.appendChild(e); };
    var join = function(x){ return (x.pre || []).concat(x.text ? [x.text] : [], x.post || []).join(" "); };
    if (pl.kind === "cross") {
      tr([pl.raxis + " ＼ " + pl.caxis].concat(pl.cv.map(function(v){ return pl.caxis + L.sep + v; })), true);
      pl.rv.forEach(function(v, i){ tr([pl.raxis + L.sep + v].concat(pl.cv.map(function(_, j){ var x = pl.grid[(i + 2) + "," + (j + 1)]; return x.self ? join(x) : x.lines.join("、"); }))); });
      if (dz) {
        tr([""].concat(dz.cols), true);
        dz.rows.forEach(function(o){ tr([o.label || (o.self ? L.self : "")].concat(o.cells)); });
      }
    } else {
      if (pl.sources) tr([L.source].concat(pl.sources), true);
      tr([""].concat(pl.cols), true);
      pl.rowsLabels.forEach(function(v, i){ tr([v + (i === pl.selfRow ? "（" + L.self + "）" : "")].concat(pl.cols.map(function(_, j){ return pl.grid[(i + hr) + "," + (j + 1)].lines.join(" "); }))); });
    }
    if (pl.below.length) { var cap = document.createElement("caption"); cap.textContent = pl.below.map(function(o){ return o.text; }).join(" "); tbl.insertBefore(cap, tbl.firstChild); }
    this.appendChild(tbl);
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", L.label + (pl.kind === "cross" ? pl.raxis + " × " + pl.caxis : pl.cols.join(pl.L === T.ja ? "、" : ", ")));
  }
  // column widths and row heights at font size fs; null when the table does not fit W × H (unless force)
  _fit(fs, W, H, force){
    var pl = this.plan(), D = base, self = this, pad = Math.round(fs * 0.5), lh = Math.ceil(fs * 1.3);
    var tw = function(s, b){ return D.textWidth(s, fs, {font: self}) * (b ? 1.06 : 1); };
    var cw = [], rh = [], dz = pl.design, dcw = [], drh = [];
    for (var c = 0; c < pl.nc; c++) cw[c] = fs * 2;
    for (var r = 0; r < pl.nr; r++) rh[r] = Math.ceil(fs * 1.6);
    if (dz) { for (var c1 = 0; c1 < dz.nc; c1++) dcw[c1] = fs * 2; for (var r1 = 0; r1 < dz.nr; r1++) drh[r1] = Math.ceil(fs * 1.6); }
    pl.cells.forEach(function(x){
      if (x.span && x.span[1] > 1) return;
      var CW = x.dz ? dcw : cw, RH = x.dz ? drh : rh;
      var w = Math.max.apply(null, x.lines.map(function(s, i){ return tw(s, (x.head && !x.muted) || (x.self && i === 0)); })) + 2 * pad;
      if (w > CW[x.c]) CW[x.c] = Math.ceil(w);
    });
    // value columns of the same width (a matrix reads by its grid), the header column as wide as it needs
    var vmax = Math.max.apply(null, cw.slice(1));
    for (var c2 = 1; c2 < pl.nc; c2++) cw[c2] = vmax;
    // the design rows line up with the cross: the same header column, their value columns sharing the cross's width
    if (dz) { cw[0] = dcw[0] = Math.max(cw[0], dcw[0]); }
    var spanW = pl.kind === "cross" ? tw(pl.caxis, true) + 2 * pad : 0;
    var tableW = cw.reduce(function(a, b){ return a + b; }, 0);
    if (spanW > tableW - cw[0]) { var add = (spanW - (tableW - cw[0])) / (pl.nc - 1); for (var c3 = 1; c3 < pl.nc; c3++) cw[c3] += add; tableW = spanW + cw[0]; }
    if (dz) {
      var dneed = Math.max.apply(null, dcw.slice(1)) * (dz.nc - 1);
      if (dneed > tableW - cw[0]) { var add2 = (dneed - (tableW - cw[0])) / (pl.nc - 1); for (var c5 = 1; c5 < pl.nc; c5++) cw[c5] += add2; tableW = dneed + cw[0]; }
    }
    // spread the value columns over the width the element has, up to 1.4 times what they need
    var room = W - 4 - tableW;
    if (room > 0) { var grow = Math.min(room, (tableW - cw[0]) * 0.4) / (pl.nc - 1); for (var c4 = 1; c4 < pl.nc; c4++) cw[c4] += grow; tableW += grow * (pl.nc - 1); }
    if (dz) for (var c6 = 1; c6 < dz.nc; c6++) dcw[c6] = (tableW - cw[0]) / (dz.nc - 1);
    // the texts that wrap (this work's sentence, the design rows, the sources) take the width their column now has; then the heights
    var lines = pl.cells.map(function(x){
      if (!x.text) return x.lines;
      var CW = x.dz ? dcw : cw, b = !!(x.head && !x.muted);
      var m = function(t){ return tw(t, b); }, full = CW[x.c] - 2 * pad, ls = wrap(x.text, full, m);
      // balanced: the narrowest width that keeps the number of lines (no one-character last line)
      if (ls.length > 1) {
        var lo = full / ls.length, hi = full;
        for (var it = 0; it < 12; it++) { var mid = (lo + hi) / 2; if (wrap(x.text, mid, m).length > ls.length) lo = mid; else hi = mid; }
        ls = wrap(x.text, hi, m);
      }
      if (x.maxLines) ls = ls.slice(0, x.maxLines);
      return (x.pre || []).concat(ls, x.post || []);
    });
    pl.cells.forEach(function(x, i){
      if (x.span && x.span[0] > 1) return;
      var RH = x.dz ? drh : rh, h = Math.ceil(lines[i].length * lh + fs * 0.5);
      if (h > RH[x.r]) RH[x.r] = h;
    });
    var gap = dz ? Math.round(fs * 0.8) : 0, designH = dz ? gap + drh.reduce(function(a, b){ return a + b; }, 0) : 0;
    var tableH = rh.reduce(function(a, b){ return a + b; }, 0), belowH = pl.below.length ? 14 + pl.below.length * Math.ceil(fs * 1.35) : 0;
    var needH = tableH + designH + belowH + 8;
    if (!force && (tableW > W - 2 || needH > H)) return null;
    // fill the element's height: the body rows grow, each to at most 1.8 times its height (no wide empty band under a short table)
    if (needH < H) {
      var nb = pl.nr - pl.head.rows, each = Math.min((H - needH) / nb, Math.min.apply(null, rh.slice(pl.head.rows)) * 0.8);
      for (var r2 = pl.head.rows; r2 < pl.nr; r2++) rh[r2] += each;
      tableH += each * nb; needH += each * nb;
    }
    var x0 = Math.max(1, (W - tableW) / 2), xs = [x0], ys = [4];
    cw.forEach(function(w, i){ xs.push(xs[i] + w); });
    rh.forEach(function(h, i){ ys.push(ys[i] + h); });
    var tableBottom = ys[ys.length - 1], dxs = null, dys = null;
    if (dz) {
      dxs = [x0]; dys = [tableBottom + gap];
      dcw.forEach(function(w, i){ dxs.push(dxs[i] + w); });
      drh.forEach(function(h, i){ dys.push(dys[i] + h); });
    }
    return {fs: fs, pad: pad, lines: lines, xs: xs, ys: ys, dxs: dxs, dys: dys, tableW: tableW, needH: needH, tableBottom: tableBottom,
      belowTop: dz ? dys[dys.length - 1] : tableBottom};
  }
  duration(k){ return k >= 1 && k <= this.plan().steps ? this.props.dur : 0; }
  render(k, t, ctx){
    if (!this.cellEls) return;
    var D = base, P = this.props, N = this.plan().steps, faint = ctx && (ctx.preview || ctx.mode === "lecture") ? base.previewOpacity(this) : 0;
    k = Math.max(0, Math.min(k, N));
    var e = k === 0 ? 1 : D.prog(t, 0, P.dur);
    var op = function(st){ var v = st === 0 || st < k ? 1 : st > k ? 0 : e; return Math.max(v, st > k ? faint : 0); };
    this.cellEls.forEach(function(o){ o.g.setAttribute("opacity", op(o.x.step).toFixed(3)); });
    this.frames.forEach(function(f){ f.el.setAttribute("opacity", (f.step > k ? 0 : f.step < k ? 1 : e).toFixed(3)); });
    this.belowEls.forEach(function(o){ o.t.setAttribute("opacity", op(o.o.step).toFixed(3)); });
  }
};
});
