// m-contrast 2.0.0: a contrast figure, earlier work against this work, for positioning a study (handoff #71).
//   kind "answers" (default): questions and their answers. A row per question (1 to 3): the question on the left, the
//     earlier answer in the middle ({"text", "by"}, or {"unknown": true, "near"}: a dashed box with 不明 / Unknown and what is
//     known under nearby conditions), an arrow, and this work's answer on the right with its basis, framed in --emph.
//     Columns are headed 問い / 従来 / 本研究 (heads, selfLabel). Steps (order "build"): the questions → the earlier
//     answers → the arrows and this work's answers; order "row": a row per step; order "whole": everything at once.
//   kind "assumptions": the assumptions of near studies (2 to 3 rows of chips, each with what it yields), then this work's
//     row: the assumptions it keeps, those it drops (written 外した / dropped, struck through) and those it adds (written
//     加えた / added, in --emph), and what it newly yields. Steps: the studies → this work's row with what it keeps and
//     drops → what it adds → its result (order "whole": at once).
// This work is written out (selfLabel, default 本研究 / This work) and framed, never colour alone. The readable table
// (data-readable) gives the final state. Boxes and chips are data-part boxes and their texts labels (Studio's geometry
// check). Text is size px (≥ 24); when the figure does not fit at 24 px the part reports size with what it needs.
// Colours: earlier boxes --muted, unknown dashed --muted, this work --emph, chips --term, lines --line, notes --muted.
egatariParts.define({name: "contrast", version: "2.0.0", requires: {base: "1.3.0"}, element: "m-contrast"}, function(deps){
"use strict";
var base = deps.base;
var T = {ja: {self: "本研究", answers: ["問い", "従来", null], assumptions: ["研究", "仮定", "得られること"], unknown: "不明",
              dropped: "外した", added: "加えた", sep: "：", label: "対比の図：", list: "、"},
         en: {self: "This work", answers: ["Question", "Earlier", null], assumptions: ["Study", "Assumptions", "Yields"], unknown: "Unknown",
              dropped: "dropped", added: "added", sep: ": ", label: "Contrast: ", list: ", "}};
var STR = {type: "string"}, STRS = {type: "array", items: STR};
// lines no wider than maxW by measure (as m-matrix 2.1): "\n" breaks; Latin runs, "7 割" and 、。）」 stay together;
// a break after 、。 late in the line, or after hiragana before a kanji, is preferred
var TOKEN = /[A-Za-z0-9.,%+\-\/]+(?: [^\sA-Za-z0-9、。，．）」])?[、。，．）」]*|\S[、。，．・）」]*|\s+/g;
var HIRA = /[ぁ-ゟ]/, WORD = /[一-鿿゠-ヿA-Za-z0-9]/;
function breakAt(t){
  var n = t.length, i;
  for (i = n - 1; i >= n * 0.6; i--) if (/[、。，．]/.test(t[i - 1]) && i < n) return i;
  for (i = n - 1; i >= n * 0.35; i--) if (HIRA.test(t[i - 1]) && (WORD.test(t[i]) || (t[i] === " " && WORD.test(t[i + 1] || "")))) return i;
  return -1;
}
function wrap(s, maxW, measure){
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
// balanced: the narrowest width that keeps the number of lines (no one-character last line)
function balanced(s, full, measure){
  var ls = wrap(s, full, measure);
  if (ls.length < 2) return ls;
  var lo = full / ls.length, hi = full;
  for (var it = 0; it < 12; it++) { var mid = (lo + hi) / 2; if (wrap(s, mid, measure).length > ls.length) lo = mid; else hi = mid; }
  return wrap(s, hi, measure);
}
var str = function(v){ return typeof v === "string" && v.trim() ? v.trim() : ""; };
var arr = function(v){ return Array.isArray(v) ? v.map(String).filter(function(s){ return s.trim(); }) : []; };
return class extends base.MotionElement {
  static partName = "contrast";
  static shape = {
    schema: {type: "object", additionalProperties: false, properties: {
      kind: {type: "string", enum: ["answers", "assumptions"]},
      heads: {type: "array", minItems: 3, maxItems: 3, items: STR},
      selfLabel: STR,
      rows: {type: "array", minItems: 1, maxItems: 3, items: {type: "object", additionalProperties: false, required: ["q", "before", "after"], properties: {
        q: STR, after: STR, basis: STR,
        before: {type: "object", additionalProperties: false, properties: {text: STR, by: STR, unknown: {type: "boolean"}, near: STR}}}}},
      studies: {type: "array", minItems: 1, maxItems: 3, items: {type: "object", additionalProperties: false, required: ["label", "chips", "result"], properties: {
        label: STR, chips: STRS, result: STR}}},
      self: {type: "object", additionalProperties: false, required: ["result"], properties: {dropped: STRS, kept: STRS, added: STRS, result: STR}}}},
    example: {kind: "answers", rows: [{q: "差はどこにあるか", before: {unknown: true, near: "国の間の差は [2]"}, after: "7 割は学校の間", basis: "3 年分の全数データ"}]},
    note: {en: "answers: rows [{\"q\", \"before\": {\"text\", \"by\"} or {\"unknown\": true, \"near\"}, \"after\", \"basis\"?}]. assumptions: studies [{\"label\", \"chips\", \"result\"}], self {\"kept\", \"dropped\", \"added\", \"result\"}",
           ja: "answers：rows は [{\"q\", \"before\": {\"text\", \"by\"} か {\"unknown\": true, \"near\"}, \"after\", \"basis\"?}]。assumptions：studies は [{\"label\", \"chips\", \"result\"}]、self は {\"kept\", \"dropped\", \"added\", \"result\"}"},
  };
  static props = {
    order: {type: "string", default: "", doc: "出し方：build（既定。answers は列ごと、assumptions は研究 → 本研究）・row（answers の行ごと）・whole"},
    dur:   {type: "number", default: 0.6, doc: "1 ステップの秒数"},
    size:  {type: "number", default: 28, doc: "字の大きさ（px、24 以上。入らなければ 24 まで縮める）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // what is drawn and when; from the data alone
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], lang = this.closest && this.closest("[lang]") ? this.closest("[lang]").getAttribute("lang") : "ja";
    var L = /^en\b/i.test(lang) ? T.en : T.ja, kind = d.kind || "answers", order = this.props.order || "build", selfLabel = str(d.selfLabel) || L.self;
    if (kind !== "answers" && kind !== "assumptions") { bad.push("kind is answers or assumptions, not " + kind); kind = "answers"; }
    var heads = (L[kind]).map(function(h, i){ var v = Array.isArray(d.heads) ? str(d.heads[i]) : ""; return v || h || selfLabel; });
    if (d.heads !== undefined && (!Array.isArray(d.heads) || d.heads.length !== 3)) bad.push("heads is 3 texts (" + L[kind].map(function(h){ return h || selfLabel; }).join(", ") + ")");
    var steps = 1, rows = [];
    if (kind === "answers") {
      if (["build", "row", "whole"].indexOf(order) < 0) bad.push("order for answers is build, row or whole, not " + order);
      var rs = Array.isArray(d.rows) ? d.rows : [];
      if (rs.length < 1 || rs.length > 3) bad.push("answers needs 1 to 3 rows (a question each); split the slide for more");
      rs.slice(0, 3).forEach(function(r, i){
        r = r || {};
        var b = r.before && typeof r.before === "object" ? r.before : {}, unknown = b.unknown === true;
        if (!str(r.q)) bad.push("row " + (i + 1) + " has no question (q)");
        if (!str(r.after)) bad.push("row " + (i + 1) + " has no answer of this work (after)");
        if (!unknown && !str(b.text)) bad.push("row " + (i + 1) + ": before is {\"text\", \"by\"} or {\"unknown\": true, \"near\"}");
        var at = function(col){ return order === "whole" ? 1 : order === "row" ? i + 1 : col; };
        rows.push({q: str(r.q), before: unknown ? {unknown: true, near: str(b.near)} : {text: str(b.text), by: str(b.by)},
          after: str(r.after), basis: str(r.basis), sQ: at(1), sB: at(2), sA: at(3)});
      });
      steps = order === "whole" ? 1 : order === "row" ? Math.max(1, rows.length) : 3;
    } else {
      if (["build", "whole"].indexOf(order) < 0) bad.push("order for assumptions is build or whole, not " + order);
      var whole = order === "whole", ss = Array.isArray(d.studies) ? d.studies : [], me = d.self && typeof d.self === "object" ? d.self : null;
      if (ss.length < 1 || ss.length > 3) bad.push("assumptions needs 1 to 3 near studies (studies)");
      ss.slice(0, 3).forEach(function(s, i){
        s = s || {};
        if (!str(s.label) || !arr(s.chips).length) bad.push("study " + (i + 1) + " needs a label and its assumptions (chips)");
        rows.push({label: str(s.label), chips: arr(s.chips).map(function(c){ return {text: c, step: 1}; }), result: str(s.result), sL: 1, sR: 1});
      });
      if (!me) bad.push("assumptions needs this work's row (self: {\"kept\", \"dropped\", \"added\", \"result\"})");
      me = me || {};
      var added = arr(me.added), sAdd = whole ? 1 : 3, sRes = whole ? 1 : added.length ? 4 : 3;
      if (!arr(me.dropped).length && !added.length) bad.push("this work's row drops or adds at least one assumption (self.dropped, self.added)");
      rows.push({self: true, label: selfLabel, result: str(me.result), sL: whole ? 1 : 2, sR: sRes,
        chips: arr(me.kept).map(function(c){ return {text: c, step: whole ? 1 : 2}; })
          .concat(arr(me.dropped).map(function(c){ return {text: c, step: whole ? 1 : 2, dropped: true}; }))
          .concat(added.map(function(c){ return {text: c, step: sAdd, added: true}; }))});
      steps = whole ? 1 : sRes;
    }
    return (this._plan = {kind: kind, L: L, bad: bad, heads: heads, rows: rows, steps: steps, selfLabel: selfLabel});
  }
  mount(ctx){
    var self = this, P = this.props, D = base, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    if (!(P.dur >= 0)) { ctx.report("attr", "[contrast] dur must be ≥ 0; using 0.6"); P.dur = 0.6; }
    if (!(P.size >= 24)) { ctx.report("attr", "[contrast] size must be ≥ 24; using 28"); P.size = 28; }
    pl.bad.forEach(function(m){ ctx.report("data", "[contrast] " + m); });
    if (!pl.rows.length) return;
    var fit = null;
    for (var fs = Math.round(P.size); fs >= 24 && !fit; fs -= 2) fit = this._fit(fs, W, H);
    if (!fit) {
      fit = this._fit(24, W, H, true);
      ctx.report("size", "[contrast] the figure needs " + Math.ceil(fit.needW) + " × " + Math.ceil(fit.needH) + " px at 24 px; the element is " + W + " × " + H + " px (fewer rows, shorter texts, or a larger element)");
    }
    var G = this.geo = fit, fsz = G.fs, lh = G.lh;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    var gL = D.el("g", {}, svg), gI = D.el("g", {}, svg);
    // the header: a label over each column, a line under them
    this.items = [];
    var add = function(step, g){ self.items.push({step: step, g: g}); return g; };
    var gH = add(0, D.el("g", {}, gI));
    G.heads.forEach(function(h){
      var t = D.el("text", {x: h.x.toFixed(1), y: h.y.toFixed(1), "font-size": fsz, "font-weight": 700, "text-anchor": "middle", fill: "var(--fg)"}, gH);
      t.textContent = h.s;
    });
    D.el("line", {x1: G.x0, x2: G.x1, y1: G.headLine, y2: G.headLine, stroke: "var(--line)", "stroke-width": 2.5}, gL);
    G.seps.forEach(function(y){ D.el("line", {x1: G.x0, x2: G.x1, y1: y, y2: y, stroke: "var(--line)", "stroke-width": 1.2}, gL); });
    // a box with its lines of text; lines are {s, tone: fg|muted|emph, bold, strike}
    var text = function(g, b, id){
      var n = b.lines.length, top = b.y + b.h / 2 - (n - 1) * lh / 2 + fsz * 0.36, left = b.align === "start";
      b.lines.forEach(function(l, i){
        var t = D.el("text", {x: (left ? b.x + G.pad : b.x + b.w / 2).toFixed(1), y: (top + i * lh).toFixed(1), "font-size": fsz,
          "text-anchor": left ? "start" : "middle", fill: "var(--" + (l.tone || "fg") + ")", "font-weight": l.bold ? 700 : 400,
          "data-part": "label", "data-part-id": id, "data-part-of": "box"}, g);
        t.textContent = l.s;
      });
    };
    G.boxes.forEach(function(b, i){
      var g = add(b.step, D.el("g", {}, gI)), id = b.id || "b" + i;
      var r = D.el("rect", {x: b.x.toFixed(1), y: b.y.toFixed(1), width: b.w.toFixed(1), height: b.h.toFixed(1), rx: b.rx || 10,
        fill: b.fill || "none", stroke: b.stroke || "none", "stroke-width": b.sw || 0, "data-part": "box", "data-part-id": id}, g);
      if (b.dash) r.setAttribute("stroke-dasharray", "9 6");
      text(g, b, id);
      if (b.strike) D.el("line", {x1: (b.x + b.strike[0]).toFixed(1), x2: (b.x + b.w - b.strike[1]).toFixed(1), y1: (b.y + b.h / 2).toFixed(1), y2: (b.y + b.h / 2).toFixed(1),
        stroke: "var(--fg)", "stroke-width": 2.5}, g);
    });
    G.arrows.forEach(function(a){
      var g = add(a.step, D.el("g", {}, gI)), hd = fsz * 0.42;
      D.el("line", {x1: a.x1.toFixed(1), x2: (a.x2 - hd).toFixed(1), y1: a.y.toFixed(1), y2: a.y.toFixed(1), stroke: "var(--muted)", "stroke-width": 3}, g);
      D.el("path", {d: "M" + (a.x2 - hd).toFixed(1) + "," + (a.y - hd * 0.6).toFixed(1) + "L" + a.x2.toFixed(1) + "," + a.y.toFixed(1) + "L" + (a.x2 - hd).toFixed(1) + "," + (a.y + hd * 0.6).toFixed(1) + "Z", fill: "var(--muted)"}, g);
    });
    G.frames.forEach(function(f){
      add(f.step, D.el("rect", {x: f.x.toFixed(1), y: f.y.toFixed(1), width: f.w.toFixed(1), height: f.h.toFixed(1), rx: 8, fill: "none", stroke: "var(--emph)", "stroke-width": 4}, gI));
    });
    // the readable table: the final state
    var L = pl.L, tbl = document.createElement("table");
    tbl.className = "sr-only"; tbl.setAttribute("data-readable", "");
    tbl.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);border:0");
    var tr = function(list, th){ var e = document.createElement("tr"); list.forEach(function(s, i){ var td = document.createElement(th || i === 0 ? "th" : "td"); td.textContent = s; e.appendChild(td); }); tbl.appendChild(e); };
    tr(pl.heads, true);
    pl.rows.forEach(function(r){
      if (pl.kind === "answers") {
        var b = r.before.unknown ? L.unknown + (r.before.near ? "（" + r.before.near + "）" : "") : r.before.text + (r.before.by ? " " + r.before.by : "");
        tr([r.q, b, r.after + (r.basis ? "（" + r.basis + "）" : "")]);
      } else {
        tr([r.label, r.chips.map(function(c){ return (c.dropped ? L.dropped + L.sep : c.added ? L.added + L.sep : "") + c.text; }).join(L.list), r.result]);
      }
    });
    this.appendChild(tbl);
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", L.label + pl.heads.join(" / "));
  }
  // the geometry at font size fs; null when it does not fit W × H (unless force)
  _fit(fs, W, H, force){
    var pl = this.plan(), D = base, self = this, pad = Math.round(fs * 0.5), lh = Math.ceil(fs * 1.3);
    var tw = function(s, b){ return D.textWidth(s, fs, {font: self}) * (b ? 1.06 : 1); };
    var m = function(t){ return tw(t); }, mb = function(t){ return tw(t, true); };
    var lines = function(s, w, tone, bold){ return s ? balanced(s, w, bold ? mb : m).map(function(x){ return {s: x, tone: tone, bold: bold}; }) : []; };
    var arrowW = Math.round(fs * 2.2), x0 = 2, x1 = W - 2, inner = x1 - x0, hh = Math.ceil(fs * 1.5), gap = Math.round(fs * 0.45);
    var boxH = function(n){ return Math.ceil(n * lh + fs * 0.7); };
    var boxes = [], arrows = [], frames = [], heads = [], seps = [], rowsH = [], cols, needW = inner;
    if (pl.kind === "answers") {
      var qW = Math.round((inner - arrowW) * 0.27), bW = Math.round((inner - arrowW) * 0.33), aW = inner - arrowW - qW - bW - gap;
      cols = [x0, x0 + qW + gap, x0 + qW + gap + bW + arrowW];
      var widths = [qW, bW, aW];
      pl.heads.forEach(function(h, i){ heads.push({s: h, x: cols[i] + widths[i] / 2}); if (tw(h, true) > widths[i]) needW = Math.max(needW, inner * tw(h, true) / widths[i]); });
      pl.rows.forEach(function(r, i){
        var tw2 = function(w){ return w - 2 * pad; };
        var q = lines(r.q, tw2(qW), "fg");
        var b = r.before.unknown ? [{s: pl.L.unknown, tone: "muted", bold: true}].concat(lines(r.before.near, tw2(bW), "muted"))
                                 : lines(r.before.text, tw2(bW), "fg").concat(lines(r.before.by, tw2(bW), "muted"));
        var a = lines(r.after, tw2(aW), "fg").concat(lines(r.basis, tw2(aW), "muted"));
        rowsH.push({q: q, b: b, a: a, h: boxH(Math.max(q.length, b.length, a.length))});
      });
    } else {
      var labW = Math.max.apply(null, pl.rows.map(function(r){ return tw(r.label, true); })) + 2 * pad;
      labW = Math.min(Math.ceil(labW), Math.round(inner * 0.22));
      var chipH = Math.ceil(fs * 1.45), cpad = Math.round(fs * 0.45), cgap = Math.round(fs * 0.35);
      var pre = function(c){ return c.dropped ? pl.L.dropped + " " : c.added ? pl.L.added + " " : ""; };
      var chipW = function(c){ return Math.ceil(tw(pre(c) + c.text, !!pre(c)) + 2 * cpad); };
      // the chips column as wide as the longest row of chips needs, leaving the result at least a quarter
      var nat = Math.max.apply(null, pl.rows.map(function(r){ return r.chips.reduce(function(a, c){ return a + chipW(c) + cgap; }, -cgap); }));
      var cW = Math.max(fs * 4, Math.min(nat, inner - labW - arrowW - gap - Math.round(inner * 0.24))), rW = inner - labW - gap - cW - arrowW;
      cols = [x0, x0 + labW + gap, x0 + labW + gap + cW + arrowW];
      [labW, cW, rW].forEach(function(w, i){ heads.push({s: pl.heads[i], x: cols[i] + w / 2}); });
      pl.rows.forEach(function(r){
        // chips flow into lines inside the chips column
        var cx = 0, ln = 0, placed = [];
        r.chips.forEach(function(c){
          var p = pre(c), w = chipW(c);
          if (w > cW) needW = Math.max(needW, inner + w - cW);
          if (cx > 0 && cx + w > cW) { ln++; cx = 0; }
          placed.push({c: c, pre: p, dx: cx, ln: ln, w: Math.min(w, cW), sx: c.dropped ? cpad + tw(p, true) : 0}); cx += w + cgap;
        });
        var end = placed.reduce(function(a, q){ return Math.max(a, q.dx + q.w); }, 0);
        var nl = placed.length ? ln + 1 : 0, chipsH = nl * chipH + Math.max(0, nl - 1) * cgap;
        var lab = lines(r.label, labW - 2 * pad, r.self ? "emph" : "fg", true), res = lines(r.result, rW - 2 * pad, "fg", !!r.self);
        rowsH.push({placed: placed, end: end, chipsH: chipsH, lab: lab, res: res, h: Math.max(boxH(Math.max(lab.length, res.length)), chipsH + fs * 0.7)});
      });
      var chipGeo = {chipH: chipH, cgap: cgap, cpad: cpad, cW: cW, labW: labW, rW: rW};
    }
    var bodyH = rowsH.reduce(function(s, r){ return s + r.h; }, 0) + gap * 2 * rowsH.length;
    var needH = 4 + hh + bodyH + 4;
    if (!force && (needH > H || needW > inner + 0.5)) return null;
    // fill the element's height: rows grow, each to at most twice its height (no wide empty band under the figure)
    if (needH < H) { var each = Math.min((H - needH) / rowsH.length, Math.min.apply(null, rowsH.map(function(r){ return r.h; }))); rowsH.forEach(function(r){ r.h += each; }); needH += each * rowsH.length; }
    var y = 4 + hh, headLine = y;
    heads.forEach(function(h){ h.y = 4 + hh / 2 + fs * 0.36; });
    rowsH.forEach(function(R, i){
      var top = y + gap, h = R.h, mid = top + h / 2, r = pl.rows[i];
      if (i > 0) seps.push(y);
      if (pl.kind === "answers") {
        var qW2 = cols[1] - gap - cols[0], bW2 = cols[2] - arrowW - cols[1], aW2 = x1 - cols[2];
        boxes.push({id: "q" + i, x: cols[0], y: top, w: qW2, h: h, lines: R.q, align: "start", step: r.sQ});
        boxes.push({id: "b" + i, x: cols[1], y: top, w: bW2, h: h, lines: R.b, step: r.sB, stroke: "var(--muted)", sw: 2.2, dash: !!r.before.unknown});
        boxes.push({id: "a" + i, x: cols[2], y: top, w: aW2, h: h, lines: R.a, step: r.sA, stroke: "var(--emph)", sw: 4});
        arrows.push({x1: cols[1] + bW2 + 8, x2: cols[2] - 8, y: mid, step: r.sA});
      } else {
        var g = chipGeo;
        boxes.push({id: "l" + i, x: cols[0], y: top, w: g.labW, h: h, lines: R.lab, align: "start", step: r.sL});
        var cy0 = mid - R.chipsH / 2;
        R.placed.forEach(function(p, j){
          var c = p.c, l = p.pre ? [{s: p.pre + c.text, tone: c.added ? "emph" : "muted", bold: true}] : [{s: c.text, tone: "fg"}];
          boxes.push({id: "c" + i + "-" + j, x: cols[1] + p.dx, y: cy0 + p.ln * (g.chipH + g.cgap), w: p.w, h: g.chipH, lines: l, step: c.step, rx: g.chipH / 2,
            stroke: c.added ? "var(--emph)" : c.dropped ? "var(--muted)" : "var(--term)", sw: c.added ? 3 : 2, dash: !!c.dropped,
            fill: c.added ? "var(--emph-tint)" : c.dropped ? "none" : "var(--term-tint)", strike: c.dropped ? [p.sx, g.cpad] : null});
        });
        boxes.push({id: "r" + i, x: cols[2], y: top, w: g.rW, h: h, lines: R.res, step: r.sR});
        arrows.push({x1: cols[1] + R.end + 10, x2: cols[2] - 8, y: mid, step: r.sR});
        if (r.self) frames.push({x: x0, y: top - gap * 0.6, w: inner, h: h + gap * 1.2, step: r.sL});
      }
      y = top + h + gap;
    });
    return {fs: fs, pad: pad, lh: lh, x0: x0, x1: x1, heads: heads, headLine: headLine, seps: seps, boxes: boxes, arrows: arrows, frames: frames, needW: needW, needH: needH};
  }
  duration(k){ return k >= 1 && k <= this.plan().steps ? this.props.dur : 0; }
  render(k, t, ctx){
    if (!this.items) return;
    var D = base, P = this.props, N = this.plan().steps, faint = ctx && (ctx.preview || ctx.mode === "lecture") ? base.previewOpacity(this) : 0;
    k = Math.max(0, Math.min(k, N));
    var e = k === 0 ? 1 : D.prog(t, 0, P.dur);
    this.items.forEach(function(o){ var v = o.step < k ? 1 : o.step > k ? 0 : e; o.g.setAttribute("opacity", Math.max(v, o.step > k ? faint : 0).toFixed(3)); });
  }
};
});
