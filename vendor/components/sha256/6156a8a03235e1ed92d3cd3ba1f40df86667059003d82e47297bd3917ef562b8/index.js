// m-ctable：計算して埋まる表。分散分析表・分割表（周辺の計・期待度数・χ²・オッズ比）・潜在結果の表を、ステップごとに埋め、
// 使ったセルと埋めたセルを示し、表の下に式の行を出す。値は計算を走らせたスクリプトの出力を書き、パーツは計算を確かめる（合わなければ data）。
// <m-ctable style="height:440px"><script type="application/json">
//   {"kind": "anova", "rows": [{"name": "要因 A", "ss": 120, "df": 2, "ms": 60, "f": 7.5}, {"name": "誤差", "ss": 96, "df": 12, "ms": 8},
//    {"name": "全体", "ss": 216, "df": 14}]}
// （JSON の終わり）</m-ctable>
// kind：anova（最後の行が全体、その前が誤差。role で変えられる）・contingency（rows・cols・n、margins、expected・chi2・or）・
// po（units の t・y0・y1。見えない半分は「?」、ステップで開き、個人の効果と平均処置効果）・table（header と rows を行ごとに出す）
// 色：使ったセル --accent2 の枠、埋めたセル --emph の枠、見えない値の地 --muted の薄い塗り（字の色だけに頼らず「?」と地で示す）。
egatariParts.define({name: "ctable", version: "2.0.1", requires: {base: "1.3.0"}, element: "m-ctable"}, function(deps){
"use strict";
var base = deps.base;
var NUM = {type: "number"};
var T = {
  ja: {source: "要因", ss: "平方和", df: "自由度", ms: "平均平方", f: "F", p: "p", total: "計", unit: "ID", t: "処置", y0: "Y(0)", y1: "Y(1)", ite: "Y(1) − Y(0)",
       ssF: function(t, ps, v){ return "平方和：" + t + " = " + ps + " = " + v; }, dfF: function(t, ps, v){ return "自由度：" + t + " = " + ps + " = " + v; },
       msF: "平均平方 = 平方和 ÷ 自由度", fF: "F = 要因の平均平方 ÷ 誤差の平均平方", pF: "p は F 分布から（スクリプトの値）",
       margins: "周辺の計 = 行と列の和", exp: "期待度数 = 行の計 × 列の計 ÷ 総数", chi2: "χ² = Σ（観測 − 期待）² ÷ 期待", or: "オッズ比 = (a × d) ÷ (b × c)",
       reveal: "見えない側の値（仮に分かったとして）", iteF: "個人の効果 = Y(1) − Y(0)", ate: "平均処置効果 = 個人の効果の平均", naive: "単純な差 = 処置群の Y の平均 − 対照群の Y の平均"},
  en: {source: "Source", ss: "SS", df: "df", ms: "MS", f: "F", p: "p", total: "Total", unit: "Unit", t: "t", y0: "Y(0)", y1: "Y(1)", ite: "Y(1) − Y(0)",
       ssF: function(t, ps, v){ return "SS: " + t + " = " + ps + " = " + v; }, dfF: function(t, ps, v){ return "df: " + t + " = " + ps + " = " + v; },
       msF: "MS = SS ÷ df", fF: "F = MS(factor) ÷ MS(error)", pF: "p from the F distribution (script value)",
       margins: "Margins = row and column sums", exp: "Expected = row total × column total ÷ N", chi2: "χ² = Σ (observed − expected)² ÷ expected", or: "Odds ratio = (a × d) ÷ (b × c)",
       reveal: "The unobserved side (as if we knew it)", iteF: "Individual effect = Y(1) − Y(0)", ate: "ATE = mean of the individual effects", naive: "Naive difference = mean Y (treated) − mean Y (control)"},
};
function dec(v){ var s = String(v).split(".")[1]; return s ? s.length : 0; }
function fmt(v, dg){ if (typeof v !== "number") return String(v); var s = Math.abs(v).toFixed(dg); return (v < 0 && +s !== 0 ? "−" : "") + s; }
return class extends base.MotionElement {
  static partName = "ctable";
  static preview = "none";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["kind"], properties: {
      kind: {type: "string", enum: ["anova", "contingency", "po", "table"]},
      rows: {type: "array", maxItems: 12, items: {type: ["object", "string", "array"]}},
      cols: {type: "array", maxItems: 8, items: {type: "string"}},
      n: {type: "array", items: {type: "array", items: NUM}},
      margins: {type: "boolean"},
      expected: {type: "array", items: {type: "array", items: NUM}},
      chi2: NUM, or: NUM,
      units: {type: "array", maxItems: 12, items: {type: "object", additionalProperties: false, required: ["t", "y0", "y1"], properties: {
        id: {type: "string"}, t: {type: "integer", enum: [0, 1]}, y0: NUM, y1: NUM}}},
      ate: NUM, naive: NUM,
      header: {type: "array", maxItems: 8, items: {type: "string"}},
      note: {type: "string"}}},
    example: {kind: "anova", rows: [{name: "要因 A", ss: 120, df: 2, ms: 60, f: 7.5}, {name: "誤差", ss: 96, df: 12, ms: 8}, {name: "全体", ss: 216, df: 14}]},
  };
  static props = {
    dur:    {type: "number", default: 0.7, doc: "1 ステップの秒数"},
    digits: {type: "number", default: -1, doc: "値の小数の桁（−1 は書いた値の桁のまま）"},
    size:   {type: "number", default: 26, doc: "字の大きさ（px、24 以上）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps.length;
  }
  // 表のセル（文字・いつ埋まるか・見えない値か）とステップ（埋めるセル・使うセル・式の行）。データだけから決まる
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], ja = !/^en\b/i.test(this.getAttribute("lang") || (this.closest && this.closest("[lang]") ? this.closest("[lang]").getAttribute("lang") : "ja") || "ja");
    var L = ja ? T.ja : T.en, P = this.props, cells = [], steps = [], cols = [], nr = 0;
    var cell = function(r, c, text, o){ var x = Object.assign({r: r, c: c, text: text, step: 0}, o || {}); cells.push(x); return x; };
    var dgOf = function(vals){ return P.digits >= 0 ? Math.min(6, Math.round(P.digits)) : Math.min(4, Math.max.apply(null, vals.filter(function(v){ return typeof v === "number"; }).map(dec).concat([0]))); };
    var close = function(a, b, dg){ return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) + (dg ? 0.51 * Math.pow(10, -dg) : 0); };
    // 丸めの幅：書いた桁の半分（整数なら 0）。式を通した許し：入力の丸めを式に沿って足す
    var hu = function(v){ var q = dec(v); return q ? 0.51 * Math.pow(10, -q) : 0; };
    var near = function(a, b, tol){ return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) + tol; };
    var kind = d.kind;
    if (kind === "anova"){
      var rows = (d.rows || []).filter(function(r){ return r && typeof r === "object" && !Array.isArray(r); });
      if (rows.length < 2) bad.push("anova needs at least a factor row and a total row");
      var role = rows.map(function(r, i){ return r.role || (i === rows.length - 1 ? "total" : i === rows.length - 2 ? "error" : "factor"); });
      var keys = ["ss", "df", "ms", "f", "p"].filter(function(k){ return rows.some(function(r){ return typeof r[k] === "number"; }); });
      cols = [L.source].concat(keys.map(function(k){ return L[k]; }));
      nr = rows.length + 1;
      cols.forEach(function(h, c){ cell(0, c, h, {head: true}); });
      var dgK = {}; keys.forEach(function(k){ dgK[k] = dgOf(rows.map(function(r){ return r[k]; })); });
      rows.forEach(function(r, i){
        cell(i + 1, 0, r.name || "", {head: true});
        keys.forEach(function(k, j){ if (typeof r[k] === "number") cell(i + 1, j + 1, fmt(r[k], dgK[k]), {key: k, row: i, q: true}); });
      });
      var tot = rows[role.indexOf("total")], err = rows[role.indexOf("error")], fac = rows.filter(function(r, i){ return role[i] !== "total"; });
      var colOf = function(k){ return keys.indexOf(k) + 1; }, idx = function(r){ return rows.indexOf(r) + 1; };
      keys.forEach(function(k){
        var fill = cells.filter(function(x){ return x.key === k; }), src = [], text = "";
        if ((k === "ss" || k === "df") && tot && typeof tot[k] === "number"){
          var sum = fac.reduce(function(a, r){ return a + (r[k] || 0); }, 0);
          if (!near(sum, tot[k], fac.reduce(function(a, r){ return a + hu(r[k] || 0); }, hu(tot[k])))) bad.push(tot.name + " " + k + " is " + tot[k] + " but the rows above sum to " + +sum.toFixed(6));
          text = L[k + "F"](tot.name, fac.map(function(r){ return fmt(r[k], dgK[k]); }).join(" + "), fmt(tot[k], dgK[k]));
        } else if (k === "ms"){
          fac.forEach(function(r){ if (typeof r.ms === "number" && typeof r.ss === "number" && r.df){ if (!near(r.ss / r.df, r.ms, hu(r.ms) + hu(r.ss) / r.df)) bad.push(r.name + ": ms is " + r.ms + " but ss ÷ df = " + +(r.ss / r.df).toFixed(6)); src.push([idx(r), colOf("ss")], [idx(r), colOf("df")]); } });
          text = L.msF;
        } else if (k === "f"){
          var f1 = fac.filter(function(r){ return r !== err && typeof r.f === "number"; });
          f1.forEach(function(r){ if (err && err.ms && typeof r.ms === "number" && !near(r.ms / err.ms, r.f, hu(r.f) + hu(r.ms) / err.ms + r.ms * hu(err.ms) / (err.ms * err.ms))) bad.push(r.name + ": F is " + r.f + " but ms ÷ ms(" + err.name + ") = " + +(r.ms / err.ms).toFixed(6)); src.push([idx(r), colOf("ms")]); });
          if (err) src.push([idx(err), colOf("ms")]);
          text = L.fF + (f1.length && err && err.ms ? " = " + fmt(f1[0].ms, dgK.ms) + " ÷ " + fmt(err.ms, dgK.ms) + " = " + fmt(f1[0].f, dgK.f) : "");
        } else if (k === "p") text = L.pF;
        if (k === "ss" || k === "df") fac.forEach(function(r){ if (typeof r[k] === "number") src.push([idx(r), colOf(k)]); });
        steps.push({fill: fill, src: src, line: [text]});
      });
    } else if (kind === "contingency"){
      var R = (d.rows || []).map(String), Cn = d.cols || [], n = d.n || [], mg = d.margins !== false;
      if (!R.length || !Cn.length || n.length !== R.length || n.some(function(row){ return row.length !== Cn.length; })) bad.push("contingency needs rows, cols and n with rows × cols counts");
      else {
        var rs = n.map(function(row){ return row.reduce(function(a, b){ return a + b; }, 0); }), cs = Cn.map(function(_, j){ return n.reduce(function(a, row){ return a + row[j]; }, 0); }), N = rs.reduce(function(a, b){ return a + b; }, 0);
        var dgN = dgOf([].concat.apply([], n)), ex = d.expected, dgE = ex ? dgOf([].concat.apply([], ex)) : 0;
        cols = [""].concat(Cn, mg ? [L.total] : []); nr = R.length + 1 + (mg ? 1 : 0);
        cols.forEach(function(h, c){ if (h) cell(0, c, h, {head: true}); });
        R.forEach(function(r, i){ cell(i + 1, 0, r, {head: true}); });
        if (mg) cell(R.length + 1, 0, L.total, {head: true});
        var counts = [];
        n.forEach(function(row, i){ row.forEach(function(v, j){ counts.push(cell(i + 1, j + 1, fmt(v, dgN), {q: false, val: v})); }); });
        var mcells = [];
        if (mg){
          rs.forEach(function(v, i){ mcells.push(cell(i + 1, Cn.length + 1, fmt(v, dgN), {q: true})); });
          cs.forEach(function(v, j){ mcells.push(cell(R.length + 1, j + 1, fmt(v, dgN), {q: true})); });
          mcells.push(cell(R.length + 1, Cn.length + 1, fmt(N, dgN), {q: true}));
          steps.push({fill: mcells, src: counts.map(function(x){ return [x.r, x.c]; }), line: [L.margins]});
        }
        if (ex){
          if (ex.length !== R.length || ex.some(function(row){ return row.length !== Cn.length; })) bad.push("expected must have rows × cols numbers");
          else {
            var ecells = [];
            ex.forEach(function(row, i){ row.forEach(function(v, j){
              var want = rs[i] * cs[j] / N;
              if (!close(want, v, dgE)) bad.push("expected[" + i + "][" + j + "] is " + v + " but row × column ÷ N = " + +want.toFixed(6));
              ecells.push(cell(i + 1, j + 1, "（" + fmt(v, dgE) + "）", {q: true, sub: true}));
            }); });
            steps.push({fill: ecells, src: mcells.map(function(x){ return [x.r, x.c]; }), line: [L.exp]});
            if (typeof d.chi2 === "number"){
              var chi = 0; n.forEach(function(row, i){ row.forEach(function(o, j){ var e = rs[i] * cs[j] / N; chi += (o - e) * (o - e) / e; }); });
              if (!close(chi, d.chi2, dec(d.chi2))) bad.push("chi2 is " + d.chi2 + " but Σ (o − e)² ÷ e = " + +chi.toFixed(6));
              steps.push({fill: [], src: counts.concat(ecells).map(function(x){ return [x.r, x.c]; }), line: [L.chi2 + " = " + fmt(d.chi2, dec(d.chi2))]});
            }
          }
        } else if (typeof d.chi2 === "number") bad.push("chi2 needs expected");
        if (typeof d.or === "number"){
          if (R.length !== 2 || Cn.length !== 2) bad.push("or (odds ratio) needs a 2 × 2 table");
          else {
            var a = n[0][0], b = n[0][1], c2 = n[1][0], dd = n[1][1], orv = a * dd / (b * c2);
            if (!close(orv, d.or, dec(d.or))) bad.push("or is " + d.or + " but (a × d) ÷ (b × c) = " + +orv.toFixed(6));
            steps.push({fill: [], src: counts.map(function(x){ return [x.r, x.c]; }), line: [L.or + " = (" + a + " × " + dd + ") ÷ (" + b + " × " + c2 + ") = " + fmt(d.or, dec(d.or))]});
          }
        }
      }
    } else if (kind === "po"){
      var U = d.units || [];
      if (U.length < 2) bad.push("po needs at least 2 units");
      var dgY = dgOf([].concat.apply([], U.map(function(u){ return [u.y0, u.y1]; })));
      cols = [L.unit, L.t, L.y0, L.y1, L.ite]; nr = U.length + 1;
      cols.forEach(function(h, c){ cell(0, c, h, {head: true}); });
      var hidden = [], ite = [];
      U.forEach(function(u, i){
        cell(i + 1, 0, u.id || String(i + 1), {head: true});
        cell(i + 1, 1, String(u.t));
        var obs0 = u.t === 0;
        cell(i + 1, 2, fmt(u.y0, dgY), obs0 ? {} : {q: true, hidden: true});
        cell(i + 1, 3, fmt(u.y1, dgY), obs0 ? {q: true, hidden: true} : {});
        hidden.push(cells[cells.length - (obs0 ? 1 : 2)]);
        ite.push(cell(i + 1, 4, fmt(u.y1 - u.y0, dgY), {q: true}));
      });
      steps.push({fill: hidden, src: [], line: [L.reveal]});
      steps.push({fill: ite, src: [].concat.apply([], U.map(function(u, i){ return [[i + 1, 2], [i + 1, 3]]; })), line: [L.iteF]});
      var ateV = U.reduce(function(a, u){ return a + (u.y1 - u.y0); }, 0) / (U.length || 1);
      var tr = U.filter(function(u){ return u.t === 1; }), co = U.filter(function(u){ return u.t === 0; });
      var naiveV = tr.length && co.length ? tr.reduce(function(a, u){ return a + u.y1; }, 0) / tr.length - co.reduce(function(a, u){ return a + u.y0; }, 0) / co.length : NaN;
      if (typeof d.ate === "number" && !close(ateV, d.ate, dec(d.ate))) bad.push("ate is " + d.ate + " but the mean of y1 − y0 = " + +ateV.toFixed(6));
      if (typeof d.naive === "number" && !close(naiveV, d.naive, dec(d.naive))) bad.push("naive is " + d.naive + " but mean y1 (t = 1) − mean y0 (t = 0) = " + +naiveV.toFixed(6));
      var dgA = Math.max(dgY, typeof d.ate === "number" ? dec(d.ate) : 2);
      steps.push({fill: [], src: ite.map(function(x){ return [x.r, x.c]; }), line: [L.ate + " = " + fmt(typeof d.ate === "number" ? d.ate : ateV, dgA),
        isFinite(naiveV) ? L.naive + " = " + fmt(typeof d.naive === "number" ? d.naive : naiveV, dgA) : ""].filter(Boolean)});
    } else if (kind === "table"){
      var H = d.header || [], TR = (d.rows || []).filter(Array.isArray);
      cols = H.slice(); nr = TR.length + 1;
      H.forEach(function(h, c){ cell(0, c, h, {head: true}); });
      TR.forEach(function(row, i){
        if (row.length !== H.length) bad.push("rows[" + i + "] has " + row.length + " cells, header has " + H.length);
        var fill = row.map(function(v, j){ return cell(i + 1, j, typeof v === "number" ? String(v) : String(v), {q: true}); });
        steps.push({fill: fill, src: [], line: []});
      });
    }
    // 埋まるステップ
    steps.forEach(function(s, k){ s.fill.forEach(function(x){ x.step = k + 1; }); });
    // anova：値のセルは列のステップで埋まる（ステップのないセル（p の列の要因以外など）は初めから出す）
    return (this._plan = {cells: cells, steps: steps, bad: bad, cols: cols, nr: nr, L: L, lines: Math.max(1, ...steps.map(function(s){ return s.line.length; }))});
  }
  mount(ctx){
    var self = this, P = this.props, D = base, pl = this.plan(), d = this.data;
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!(P.dur >= 0)){ ctx.report("attr", "[ctable] dur must be ≥ 0; using 0.7"); P.dur = 0.7; }
    if (!(P.size >= 24)){ ctx.report("attr", "[ctable] size must be ≥ 24; using 26"); P.size = 26; }
    pl.bad.forEach(function(m){ ctx.report("data", "[ctable] " + m); });
    var fs = P.size, tw = function(s, b){ return D.textWidth(s, fs, {font: self}) * (b ? 1.06 : 1); };
    var hasSub = pl.cells.some(function(x){ return x.sub; }), rh = Math.ceil(fs * 1.7) * (hasSub ? 2 : 1), pad = 14;
    var nc = pl.cols.length, cw = [];
    for (var c = 0; c < nc; c++) cw[c] = Math.ceil(Math.max(fs * 1.4, ...pl.cells.filter(function(x){ return x.c === c; }).map(function(x){ return tw(x.text, x.head); })) + 2 * pad);
    var tableW = cw.reduce(function(a, b){ return a + b; }, 0), tableH = pl.nr * rh, lineH = Math.ceil(fs * 1.6), formH = pl.steps.some(function(s){ return s.line.length; }) ? pl.lines * lineH + 12 : 0;
    var needH = tableH + formH + 8;
    var need = "[ctable] the table needs " + Math.ceil(tableW) + " × " + Math.ceil(needH) + " px; the element is " + W + " × " + H + " px (fewer rows or columns, shorter names, or a larger element)";
    if (tableW > W || needH > H) ctx.report("size", need);
    var x0 = Math.max(0, (W - tableW) / 2), y0 = 4, xs = [x0];
    cw.forEach(function(w, i){ xs.push(xs[i] + w); });
    this.geo = {x0: x0, y0: y0, xs: xs, rh: rh, W: W, tableW: tableW, tableH: tableH};
    var gB = D.el("g", {}, svg), gL = D.el("g", {}, svg), gT = D.el("g", {}, svg), gH = D.el("g", {}, svg);
    // 表の線：見出しの行の下と見出しの列の右は太く、ほかは細く
    for (var r = 0; r <= pl.nr; r++){ var y = y0 + r * rh; D.el("line", {x1: x0, x2: x0 + tableW, y1: y, y2: y, stroke: "var(--line)", "stroke-width": r === 1 ? 2.5 : 1.2}, gL); }
    for (var c2 = 0; c2 <= nc; c2++) D.el("line", {x1: xs[c2], x2: xs[c2], y1: y0, y2: y0 + tableH, stroke: "var(--line)", "stroke-width": c2 === 1 ? 2.5 : 1.2}, gL);
    this.cellEls = pl.cells.map(function(x){
      var cx0 = xs[x.c], cy0 = y0 + x.r * rh, num = !x.head && /^[−\-]?[\d.]+$|^（/.test(x.text);
      var o = {x: x};
      if (x.hidden) o.bg = D.el("rect", {x: cx0 + 1, y: cy0 + 1, width: cw[x.c] - 2, height: rh - 2, fill: "var(--muted)", opacity: 0.18}, gB);
      var ty = x.sub ? cy0 + rh * 0.75 + fs * 0.36 : hasSub && !x.head && x.r > 0 && !x.sub ? cy0 + rh * 0.3 + fs * 0.36 : cy0 + rh / 2 + fs * 0.36;
      var tx = num ? xs[x.c + 1] - pad : x.head && x.c === 0 ? cx0 + pad : cx0 + cw[x.c] / 2;
      o.t = D.el("text", {x: tx.toFixed(1), y: ty.toFixed(1), "font-size": fs, "text-anchor": num ? "end" : x.head && x.c === 0 ? "start" : "middle",
        fill: x.sub || x.hidden ? "var(--muted)" : "var(--fg)", "font-weight": x.head ? 700 : 400, style: "font-variant-numeric:tabular-nums"}, gT);
      o.t.textContent = x.text;
      if (x.q && !x.sub){ o.qm = D.el("text", {x: (cx0 + cw[x.c] / 2).toFixed(1), y: ty.toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, gT); o.qm.textContent = "?"; }
      o.box = [cx0, cy0, cw[x.c], rh];
      return o;
    });
    // 使ったセル・埋めたセルの枠（ステップごと）
    this.hl = pl.steps.map(function(s){
      var g = D.el("g", {opacity: 0}, gH);
      s.src.forEach(function(rc){ D.el("rect", {x: xs[rc[1]] + 3, y: y0 + rc[0] * rh + 3, width: cw[rc[1]] - 6, height: rh - 6, rx: 4, fill: "none", stroke: "var(--accent2)", "stroke-width": 3}, g); });
      s.fill.forEach(function(x){ D.el("rect", {x: xs[x.c] + 3, y: y0 + x.r * rh + 3, width: cw[x.c] - 6, height: rh - 6, rx: 4, fill: "none", stroke: "var(--emph)", "stroke-width": 3}, g); });
      return g;
    });
    // 式の行（表の下）
    var fy = y0 + tableH + 12 + fs * 0.9;
    this.lines = pl.steps.map(function(s){
      var g = D.el("g", {opacity: 0}, gT);
      s.line.forEach(function(t, i){
        var room = W - 8, txt = t;
        if (tw(txt) > room){ ctx.report("layout", "[ctable] the formula line \"" + t.slice(0, 30) + "…\" is wider than the element; it is cut"); var a = Array.from(txt); while (a.length && tw(a.join("") + "…") > room) a.pop(); txt = a.join("") + "…"; }
        var e = D.el("text", {x: (W / 2).toFixed(1), y: (fy + i * lineH).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)", style: "font-variant-numeric:tabular-nums"}, g);
        e.textContent = txt;
      });
      return g;
    });
    // 読める表（data-readable）：最後の状態の表をそのまま
    var tbl = document.createElement("table");
    tbl.className = "sr-only"; tbl.setAttribute("data-readable", "");
    tbl.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);border:0");
    for (var rr = 0; rr < pl.nr; rr++){
      var tr = document.createElement("tr");
      for (var cc = 0; cc < nc; cc++){
        var x = pl.cells.filter(function(q){ return q.r === rr && q.c === cc; }), td = document.createElement(rr === 0 || cc === 0 ? "th" : "td");
        td.textContent = x.map(function(q){ return q.text; }).join(" ");
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    this.appendChild(tbl);
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", (pl.L === T.ja ? "表：" : "Table: ") + pl.cols.filter(Boolean).join(pl.L === T.ja ? "、" : ", ") + "; " + pl.steps.map(function(s){ return s.line.join(" "); }).filter(Boolean).join("; "));
    this.model = {cols: pl.cols, nr: pl.nr, steps: pl.steps.length};
  }
  duration(k){ return k >= 1 && k <= this.plan().steps.length ? this.props.dur : 0; }
  render(k, t, ctx){
    if (!this.cellEls) return;
    var pl = this.plan(), D = base, P = this.props, N = pl.steps.length;
    k = Math.max(0, Math.min(k, N));
    var e = k === 0 ? 1 : D.prog(t, 0, P.dur), fin = k === N && (t === Infinity || t >= P.dur);
    this.cellEls.forEach(function(o){
      var st = o.x.step, shown = st === 0 ? 1 : st < k ? 1 : st > k ? 0 : e;
      // 埋まる前は「?」、埋まるステップの前半で「?」が消え、後半で値が出る（同じ場所の字は重ねない）
      var vis = st === 0 || !o.x.q ? shown : Math.max(0, 2 * shown - 1);
      o.t.setAttribute("opacity", vis.toFixed(3));
      if (o.qm) o.qm.setAttribute("opacity", (st === 0 ? 0 : st < k ? 0 : st > k ? 1 : Math.max(0, 1 - 2 * e)).toFixed(3));
      if (o.bg) o.bg.setAttribute("opacity", (0.18).toFixed(3));
    });
    this.hl.forEach(function(g, i){ g.setAttribute("opacity", (i + 1 === k && !fin ? e : 0).toFixed(3)); });
    this.lines.forEach(function(g, i){ g.setAttribute("opacity", (i + 1 === k ? e : 0).toFixed(3)); });
  }
};
});
