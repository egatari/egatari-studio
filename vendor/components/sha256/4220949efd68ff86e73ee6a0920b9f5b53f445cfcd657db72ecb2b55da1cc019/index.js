// m-trace：コードの実行を 1 行ずつ追う。左にコード（今の行に印）、右に変数（変わった変数に印）と、その時点までの出力。
// 値はトレーサー（tools/trace.py、sys.settrace）が書いた JSON だけを描く。パーツはコードを実行しない。
// <m-trace style="height:440px"><script type="application/json">
//   {"lang": "python", "code": "xs = [3, 1, 2]\ntotal = 0\nfor x in xs:\n    total += x\nprint(total)",
//    "source": {"tool": "egatari-trace 0.1", "python": "3.13.1", "sha256": "…", "truncated": false},
//    "steps": [{"line": 1, "vars": {"xs": [3, 1, 2]}}, …, {"line": 5, "vars": {…}, "out": "6\n"}]}
// （JSON の終わり）</m-trace>
// steps[i]：line（または lines: [a, b]）、vars（その行を実行した後の、見せる変数すべての値。差分ではない）、out（その行の出力）、note。
// ステップ：k = 0 はコードと空の変数、k = i + 1 はトレースの i 番目（by="time" なら 1 つのステップの中で rate 個/秒で進む）。
// 色：今の行 --emph の地と行番号、変わった変数 --emph の字と地と太字（色だけに頼らない）。
egatariParts.define({name: "trace", version: "2.0.0", requires: {base: "1.2.0", "code-core": "1.0.0"}, element: "m-trace"}, function(deps){
"use strict";
var base = deps.base, C = deps["code-core"], MONO = C.MONO, set = C.set, monoWidth = C.monoWidth, cut = C.cut;
var CAP = {lines: 16, steps: 60, show: 6, str: 40, list: 12, grid: 6, dict: 8, out: 8};
var TEXT = {
  ja: {vars: "変数", output: "出力", readable: "コードと出力", final: "最後の変数", name: "変数", value: "値", more: function(n){ return "⋮（ほか " + n + " 行）"; }, older: function(n){ return "…（前の " + n + " 行）"; },
       line: function(a, b){ return (a === b ? a : a + "–" + b) + " 行目"; }, summary: function(lang, n, m){ return lang + " のコード " + n + " 行の実行を " + m + " ステップで追う"; }},
  en: {vars: "Variables", output: "Output", readable: "Code and output", final: "Final variables", name: "Variable", value: "Value", more: function(n){ return "⋮ (" + n + " more line" + (n === 1 ? "" : "s") + ")"; }, older: function(n){ return "… (" + n + " earlier)"; },
       line: function(a, b){ return a === b ? "line " + a : "lines " + a + "–" + b; }, summary: function(lang, n, m){ return lang + ": " + n + " lines of code traced in " + m + " steps"; }}
};
// 値の文法：数・文字（40 字まで）・真偽・null、リスト（12 個まで、2 次元なら 6 × 6 まで）、辞書（8 個まで）、入れ子は 2 段まで、ほかは {"repr": "…"}
function grammar(v, depth){
  if (v === null || typeof v === "boolean") return "";
  if (typeof v === "number") return isFinite(v) ? "" : "a number that is not finite";
  if (typeof v === "string") return [...v].length <= CAP.str ? "" : "a string over " + CAP.str + " characters (write {\"repr\": …})";
  if (depth >= 2) return "values nested deeper than 2 levels (write {\"repr\": …})";
  if (Array.isArray(v)){
    if (v.length && v.every(Array.isArray)){ if (v.length > CAP.grid || v.some(function(r){ return r.length > CAP.grid; })) return "a 2-D list over " + CAP.grid + " × " + CAP.grid; }
    else if (v.length > CAP.list) return "a list over " + CAP.list + " items";
    for (var i = 0; i < v.length; i++){ var e = grammar(v[i], depth + 1); if (e) return e; }
    return "";
  }
  if (typeof v === "object"){
    var ks = Object.keys(v);
    if ("repr" in v) return ks.length === 1 && typeof v.repr === "string" ? "" : "{\"repr\"} takes one string and nothing else";
    if (ks.length > CAP.dict) return "a dict over " + CAP.dict + " keys";
    for (var j = 0; j < ks.length; j++){ var e2 = grammar(v[ks[j]], depth + 1); if (e2) return e2; }
    return "";
  }
  return "an unknown value";
}
// 値の字（Python なら Python の書き方：'a'・True・None）。2 次元のリストは 1 行ずつ
function fmt(v, py){
  if (v === null) return py ? "None" : "null";
  if (typeof v === "boolean") return py ? (v ? "True" : "False") : String(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return py ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'" : JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(function(x){ return fmt(x, py); }).join(", ") + "]";
  if (v && typeof v === "object"){
    if ("repr" in v) return String(v.repr);
    return "{" + Object.keys(v).map(function(k){ return fmt(k, py) + ": " + fmt(v[k], py); }).join(", ") + "}";
  }
  return String(v);
}
function rowsOf(v, py){
  if (Array.isArray(v) && v.length > 1 && v.every(Array.isArray)) return v.map(function(r, i){ return (i ? " " : "[") + fmt(r, py) + (i < v.length - 1 ? "," : "]"); });
  return [fmt(v, py)];
}
function outLines(s){ var L = s.replace(/\r\n?/g, "\n").split("\n"); if (L[L.length - 1] === "") L.pop(); return L; }
return class extends base.MotionElement {
  static partName = "trace";
  static preview = "none";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["code", "steps"], properties: {
    lang: {type: "string"}, code: {type: "string"},
    source: {type: "object", additionalProperties: false, properties: {tool: {type: "string"}, python: {type: "string"}, sha256: {type: "string"}, truncated: {type: "boolean"}}},
    show: {type: "array", minItems: 1, maxItems: 6, items: {type: "string"}},
    steps: {type: "array", minItems: 1, maxItems: 60, items: {type: "object", additionalProperties: false, required: ["vars"], anyOf: [{required: ["line"]}, {required: ["lines"]}], properties: {
      line: {type: "integer"}, lines: {type: "array", minItems: 2, maxItems: 2, items: {type: "integer"}}, vars: {type: "object"}, out: {type: "string"}, note: {type: "string"}
    }}}
  }}, example: /*@egatari-block example*/{"lang":"python","code":"total = 0\nfor x in [3, 1]:\n    total += x\nprint(total)","source":{"tool":"egatari-trace 0.1","python":"3.13.1","sha256":"","truncated":false},"steps":[{"line":1,"vars":{"total":0}},{"line":2,"vars":{"total":0,"x":3}},{"line":3,"vars":{"total":3,"x":3}},{"line":2,"vars":{"total":3,"x":1}},{"line":3,"vars":{"total":4,"x":1}},{"line":2,"vars":{"total":4,"x":1}},{"line":4,"vars":{"total":4,"x":1},"out":"4\n"}]}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 0.5, doc: "1 ステップの秒数"},
    by: {type: "enum", values: ["step", "time"], default: "step", doc: "step はトレースの 1 行を 1 ステップに、time は全体を 1 ステップの中で流す"},
    rate: {type: "number", default: 2, doc: "by=\"time\" のとき 1 秒に進む行の数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は既定）"}
  };
  get steps(){ var n = ((this.data || {}).steps || []).length; return this.props.by === "time" ? (n ? 1 : 0) : n; }
  duration(k){ var n = this.data.steps.length; return this.props.by === "time" ? (k === 1 ? n / this.props.rate : 0) : (k >= 1 && k <= n ? this.props.dur : 0); }
  cues(k){ var r = this.props.rate; return this.props.by === "time" && k === 1 ? this.data.steps.map(function(_, i){ return i / r; }) : null; }
  label(g, x, y, s, fs, color, mono){
    var e = base.el("text", {x: x, y: y, "font-size": fs, fill: color || "var(--fg)"}, g);
    if (mono) e.setAttribute("style", "font-family:" + MONO + ";white-space:pre;");
    e.textContent = s; return e;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props, T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[trace] dur must be positive; using 0.5"); P.dur = 0.5; }
    if (!(Number.isFinite(P.rate) && P.rate > 0)){ ctx.report("attr", "[trace] rate must be positive; using 2"); P.rate = 2; }
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[trace] size must be 0 or at least 24; using defaults"); P.size = 0; }
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    var lang = d.lang || "", py = /^python/i.test(lang), program = C.lines(d.code), marks = C.spans(program, lang.toLowerCase()), N = d.steps.length;
    this.T = T; this.py = py;
    // ---- データの確かめ（形は shape、ここでは欄どうしの関係と値の文法）
    var bad = function(s){ ctx.report("data", "[trace] " + s); };
    if (program.length > CAP.lines) bad("code has " + program.length + " lines; at most " + CAP.lines + " (trace a shorter program or one function)");
    var st = d.steps.map(function(s, i){
      var a = s.line !== undefined ? s.line : s.lines[0], b = s.line !== undefined ? s.line : s.lines[1];
      if (!(a >= 1 && b >= a && b <= program.length)){ bad("steps[" + i + "]: line " + (a === b ? a : a + "–" + b) + " is outside 1–" + program.length); a = b = 0; }
      Object.keys(s.vars).forEach(function(k){ var e = grammar(s.vars[k], 0); if (e) bad("steps[" + i + "].vars." + k + ": " + e); });
      return {a: a, b: b, vars: s.vars, out: s.out || "", note: s.note || ""};
    });
    var seen = []; st.forEach(function(s){ Object.keys(s.vars).forEach(function(k){ if (seen.indexOf(k) < 0) seen.push(k); }); });
    var names = d.show ? d.show.slice() : seen.slice(0, CAP.show);
    if (!d.show && seen.length > CAP.show) bad(seen.length + " variables (" + seen.join(", ") + "); at most " + CAP.show + " are shown: choose them with show");
    if (d.show) d.show.forEach(function(k){ if (seen.indexOf(k) < 0) bad("show: \"" + k + "\" is in no step's vars"); });
    var acc = [], all = "";
    st.forEach(function(s, i){
      all += s.out; acc.push(outLines(all));
      var prev = i ? st[i - 1].vars : {};
      s.changed = names.filter(function(k){ return (k in s.vars) && JSON.stringify(s.vars[k]) !== JSON.stringify(prev[k]); });
    });
    var outTotal = acc.length ? acc[acc.length - 1].length : 0;
    if (outTotal > CAP.out) bad("the output has " + outTotal + " lines; at most " + CAP.out + " (print less, or trace a shorter run)");
    this.st = st; this.names = names; this.acc = acc;
    // ---- 読める層：コードと出力（pre）、最後の変数（table）
    this.setAttribute("role", "figure");
    var langName = py ? "Python" : lang || (T === TEXT.ja ? "プログラム" : "Program");
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.summary(langName, program.length, N) + (st.some(function(s){ return s.note; }) ? "; " + st.map(function(s){ return s.note; }).filter(Boolean).join("; ") : ""));
    var hide = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);border:0;";
    var pre = document.createElement("pre"); pre.className = "sr-only"; pre.setAttribute("style", hide + "white-space:pre"); pre.setAttribute("aria-label", T.readable); pre.setAttribute("data-readable", "");
    pre.textContent = d.code + (all ? "\n\n" + T.output + "\n" + all.replace(/\n$/, "") : ""); this.appendChild(pre);
    var tbl = document.createElement("table"); tbl.className = "sr-only"; tbl.setAttribute("style", hide); tbl.setAttribute("data-readable", ""); tbl.setAttribute("aria-label", T.final);
    var last = st[N - 1].vars, head = document.createElement("tr");
    [T.name, T.value].forEach(function(h){ var th = document.createElement("th"); th.textContent = h; head.appendChild(th); }); tbl.appendChild(head);
    names.filter(function(k){ return k in last; }).forEach(function(k){
      var tr = document.createElement("tr"), th = document.createElement("th"), td = document.createElement("td");
      th.textContent = k; td.textContent = fmt(last[k], py); tr.appendChild(th); tr.appendChild(td); tbl.appendChild(tr);
    });
    this.appendChild(tbl);
    // ---- 配置：左にコードと説明の帯、右に変数と出力
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight);
    var fs = P.size || 24, nf = P.size || 26, row = Math.ceil(fs * 1.4), noteRow = Math.ceil(nf * 1.45 + 4), pad = 16, gap = 24, header = row + 16;
    var expanded = program.map(function(s){ return s.replace(/\t/g, "    "); });
    var numW = monoWidth(String(program.length), fs) + 16, textX = pad + numW;
    var codeNatural = textX + Math.max(160, Math.max.apply(null, expanded.map(function(s){ return monoWidth(s, fs); }))) + pad;
    var nameW = Math.max(0, Math.max.apply(null, names.map(function(k){ return monoWidth(k + " = ", fs); })));
    var valueW = 0, varRows = 1;
    st.forEach(function(s){
      var r = 0;
      names.forEach(function(k){ if (k in s.vars){ var R = rowsOf(s.vars[k], py); r += R.length; R.forEach(function(t){ valueW = Math.max(valueW, monoWidth(t, fs)); }); } });
      varRows = Math.max(varRows, r);
    });
    var hasOut = all.length > 0, outW = hasOut ? Math.max.apply(null, acc[N - 1].map(function(s){ return monoWidth(s.replace(/\t/g, "    "), fs); }).concat([0])) : 0;
    var counterW = monoWidth(N + " / " + N, fs);
    var rightNatural = Math.max(240, 2 * pad + nameW + valueW, 2 * pad + outW, 2 * pad + base.textWidth(T.vars, fs, {font: this}) + 16 + counterW);
    var codeW, rightW;
    if (codeNatural + gap + rightNatural <= W){ codeW = Math.max(codeNatural, Math.min(W * 0.5, W - gap - rightNatural)); }
    else codeW = Math.max(Math.min(codeNatural, W * 0.45), W - gap - rightNatural);
    codeW = Math.max(1, Math.min(codeW, W - gap - 120)); rightW = Math.max(1, W - codeW - gap);
    var rx = codeW + gap;
    // 説明の帯（コードの下、2 行まで）
    var noteLines = st.map(function(s, i){
      if (!s.note) return [];
      var w = C.wrap(s.note.replace(/\s*\n\s*/g, " "), codeW - 24, nf, self);
      if (w.length > 2){ ctx.report("layout", "[trace] note of step " + (i + 1) + " needs " + w.length + " rows in the band (2 fit); shorten it"); w = [w[0], proseCut(w.slice(1).join(""), codeW - 24, nf)]; }
      return w;
    });
    function proseCut(s, width, f){
      if (base.textWidth(s, f, {font: self}) <= width) return s;
      var ch = [...s]; while (ch.length && base.textWidth(ch.join("") + "…", f, {font: self}) > width) ch.pop();
      return width >= f ? ch.join("") + "…" : "";
    }
    var nr = Math.max(0, Math.max.apply(null, noteLines.map(function(w){ return w.length; }))), bandH = nr ? nr * noteRow + 16 : 0;
    var codeH = H - (bandH ? bandH + 8 : 0);
    // コードの見た目の行（長い行は折り返し、続きの行は番号の欄に ↪）
    var textW = Math.max(fs, codeW - textX - pad), vrows = [], rowsOfLine = [];
    program.forEach(function(line, i){
      var ex = expanded[i], chars = [...ex], at = function(m){ return [...line.slice(0, m).replace(/\t/g, "    ")].length; }, mine = [];
      C.softWrap(ex, textW, fs).forEach(function(g, j){
        var sp = marks[i].map(function(m){ return [Math.max(at(m[0]), g.from) - g.from, Math.min(at(m[1]), g.to) - g.from, m[2]]; }).filter(function(m){ return m[1] > m[0]; });
        mine.push(vrows.length); vrows.push({line: i + 1, cont: j > 0, text: chars.slice(g.from, g.to).join(""), spans: sp});
      });
      rowsOfLine.push(mine);
    });
    var slots = Math.floor((codeH - header - pad) / row);
    if (slots < 3) ctx.report("size", "[trace] element is " + W + " × " + H + " px; the code needs at least " + Math.ceil(header + pad + 3 * row + (bandH ? bandH + 8 : 0)) + " px height for 3 rows and the notes");
    var shown = Math.max(1, Math.min(slots, vrows.length));
    var span = function(s){ if (!s || !s.a) return null; var r = [].concat.apply([], rowsOfLine.slice(s.a - 1, s.b)); return [Math.min.apply(null, r), Math.max.apply(null, r)]; };
    this.window0 = C.windowFor(vrows.length, shown, 0, 0);
    this.windows = st.map(function(s){ var r = span(s); return r ? C.windowFor(vrows.length, shown, r[0], r[1]) : self.window0; });
    this.spans = st.map(span);
    // 右：変数のパネルと出力のパネル
    var varsH = hasOut ? Math.min(H, header + varRows * row + pad) : H, outY = varsH + 8, outSlots = hasOut ? Math.floor((H - outY - header - pad) / row) : 0;
    if (hasOut && outSlots < 1) ctx.report("size", "[trace] element is " + W + " × " + H + " px; the variables and the output need about " + Math.ceil(header + varRows * row + pad + 8 + header + row + pad) + " px height");
    if (header + varRows * row + pad > H) ctx.report("size", "[trace] the variables need " + varRows + " rows (" + Math.ceil(header + varRows * row + pad) + " px); the element is " + H + " px high");
    var cutValue = false;
    st.forEach(function(s){ names.forEach(function(k){ if (k in s.vars) rowsOf(s.vars[k], py).forEach(function(t){ if (monoWidth(t, fs) > rightW - 2 * pad - nameW) cutValue = true; }); }); });
    if (cutValue) ctx.report("layout", "[trace] a value is wider than the variables panel (" + Math.floor(rightW - 2 * pad - nameW) + " px); it is cut with …");
    this.geo = {W: W, H: H, fs: fs, row: row, pad: pad, header: header, firstY: header + fs, codeW: codeW, codeH: codeH, rx: rx, rightW: rightW, varsH: varsH, outY: outY, outSlots: Math.max(0, outSlots), nameW: nameW, slots: shown, rows: vrows.length, bandH: bandH, varRows: varRows};
    this.geometry = {codeW: codeW, codeH: codeH, rightW: rightW, varsH: varsH, outSlots: Math.max(0, outSlots), slots: shown, rows: vrows.length, windowed: vrows.length > shown, bandRows: nr};
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "overflow:hidden"}, this);
    var panel = function(x, y, w, h){ base.el("rect", {x: x + 1, y: y + 1, width: Math.max(1, w - 2), height: Math.max(1, h - 2), rx: 12, fill: "var(--term-tint, color-mix(in srgb, var(--fg) 5%, var(--bg)))", stroke: "var(--line)", "stroke-width": 2}, self.svg); };
    var tint = "var(--emph-tint, color-mix(in srgb, var(--emph) 12%, var(--bg)))";
    // コード
    panel(0, 0, codeW, codeH);
    var tag = cut(lang, Math.max(1, codeW - 2 * pad), fs);
    this.label(this.svg, codeW - pad - monoWidth(tag, fs), pad + fs, tag, fs, "var(--muted)", true);
    this.band = base.el("rect", {x: 4, y: header, width: Math.max(1, codeW - 8), height: row, rx: 4, fill: tint, opacity: 0}, this.svg);
    this.vrows = vrows.map(function(r){
      var num = self.label(self.svg, pad, header + fs, r.cont ? "↪" : String(r.line), fs, "var(--muted)", true);
      var e = self.label(self.svg, textX, header + fs, "", fs, "var(--fg)", true), pos = 0, ch = [...r.text];
      var put = function(a, b, role){ if (b > a) base.el("tspan", role ? {fill: "var(--" + role + ")"} : {}, e).textContent = ch.slice(a, b).join(""); };
      r.spans.forEach(function(m){ put(pos, m[0]); put(m[0], m[1], m[2]); pos = m[1]; });
      put(pos, ch.length);
      return {num: num, text: e, line: r.line};
    });
    this.markTop = this.label(this.svg, pad, header + fs, "", fs, "var(--muted)", true);
    this.markBottom = this.label(this.svg, pad, header + fs, "", fs, "var(--muted)", true);
    // 説明の帯
    this.notes = noteLines.map(function(w){
      var g = base.el("g", {opacity: 0}, self.svg);
      if (w.length){
        base.el("rect", {x: 1, y: codeH + 8, width: Math.max(1, codeW - 2), height: bandH, rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, g);
        w.forEach(function(t, i){ self.label(g, 12, codeH + 8 + 8 + nf + i * noteRow, t, nf); });
      }
      return g;
    });
    // 変数
    panel(rx, 0, rightW, varsH);
    this.label(this.svg, rx + pad, pad + fs, T.vars, fs);
    this.counter = this.label(this.svg, rx + rightW - pad, pad + fs, "", fs, "var(--muted)", true); this.counter.setAttribute("text-anchor", "end");
    var vRoom = Math.max(1, Math.floor((varsH - header - pad) / row));
    this.varSlots = [];
    for (var i = 0; i < Math.min(varRows, vRoom); i++){
      var y = header + fs + i * row;
      this.varSlots.push({
        bg: base.el("rect", {x: rx + 6, y: header + i * row, width: Math.max(1, rightW - 12), height: row, rx: 4, fill: tint, opacity: 0}, this.svg),
        name: this.label(this.svg, rx + pad, y, "", fs, "var(--fg)", true),
        value: this.label(this.svg, rx + pad + nameW, y, "", fs, "var(--fg)", true)
      });
    }
    // 出力
    this.outLabels = [];
    if (hasOut && outSlots >= 1){
      panel(rx, outY, rightW, H - outY);
      this.label(this.svg, rx + pad, outY + pad + fs, T.output, fs);
      for (var j = 0; j < outSlots; j++) this.outLabels.push(this.label(this.svg, rx + pad, outY + header + fs + j * row, "", fs, "var(--fg)", true));
    }
  }
  // (k, t) → トレースの何番目（-1 はまだ何も実行していない）と、その中の進み具合 e（0〜1）
  at(k, t){
    var n = this.st.length, P = this.props;
    if (k < 1) return {i: -1, e: 1};
    if (P.by === "time"){
      if (k > 1 || t === Infinity) return {i: n - 1, e: 1};
      var x = Math.max(0, t) * P.rate, i = Math.min(n - 1, Math.floor(x));
      return {i: i, e: i === n - 1 && x >= n ? 1 : Math.min(1, (x - i) * 2.5)};
    }
    if (k > n) return {i: n - 1, e: 1};
    return {i: k - 1, e: base.prog(t, 0, P.dur)};
  }
  render(k, t, ctx){
    if (!this.svg) return;
    var self = this, G = this.geo, T = this.T, py = this.py, s = this.at(k, t), i = s.i, e = s.e, st = this.st;
    var cur = i >= 0 ? st[i] : null, win = function(j){ return j < 0 ? self.window0 : self.windows[j]; };
    // 表示する範囲：変わるときは前半で消えて後半で新しい位置に出る
    var w0 = win(i - 1), w1 = win(i), moving = w0.f !== w1.f || w0.l !== w1.l, w = moving && e < 0.5 ? w0 : w1, fade = moving ? (e < 0.5 ? 1 - 2 * e : 2 * e - 1) : 1;
    var slotY = function(r, ww){ ww = ww || w; return G.firstY + (r - ww.f + (ww.top ? 1 : 0)) * G.row; };
    this.vrows.forEach(function(o, r){
      var vis = r >= w.f && r <= w.l, y = vis ? slotY(r) : G.firstY, lit = cur && o.line >= cur.a && o.line <= cur.b;
      set(o.num, "y", y); set(o.text, "y", y);
      set(o.num, "opacity", vis ? fade.toFixed(3) : 0); set(o.text, "opacity", vis ? fade.toFixed(3) : 0);
      set(o.num, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--" + (lit ? "emph" : "muted") + ")" + (lit ? ";font-weight:700" : ""));
    });
    var vr = this.vrows, linesIn = function(a, b){ var seen = {}; for (var r = a; r <= b; r++) if (vr[r]) seen[vr[r].line] = 1; return Object.keys(seen).length; };
    this.markTop.textContent = w.top ? T.more(Math.max(1, linesIn(0, w.f - 1))) : ""; set(this.markTop, "y", G.firstY); set(this.markTop, "opacity", w.top ? fade.toFixed(3) : 0);
    this.markBottom.textContent = w.bottom ? T.more(Math.max(1, linesIn(w.l + 1, vr.length - 1))) : ""; set(this.markBottom, "y", slotY(w.l + 1)); set(this.markBottom, "opacity", w.bottom ? fade.toFixed(3) : 0);
    // 今の行の地：同じ表示する範囲の中なら前の行から滑らせる
    var sp1 = i >= 0 ? this.spans[i] : null, sp0 = i >= 1 ? this.spans[i - 1] : null;
    if (sp1){
      var top1 = slotY(sp1[0], w1) - G.fs, h1 = (sp1[1] - sp1[0] + 1) * G.row, top = top1, h = h1, op = 1;
      if (!moving && sp0){ var top0 = slotY(sp0[0], w0) - G.fs, h0 = (sp0[1] - sp0[0] + 1) * G.row; top = base.lerp(top0, top1, e); h = base.lerp(h0, h1, e); }
      else if (moving) op = e < 0.5 ? 0 : fade;
      else op = e;
      set(this.band, "y", +top.toFixed(1)); set(this.band, "height", +h.toFixed(1)); set(this.band, "opacity", op.toFixed(3));
    } else { set(this.band, "y", G.header); set(this.band, "height", G.row); set(this.band, "opacity", 0); }
    this.notes.forEach(function(g, j){ set(g, "opacity", j === i ? (i >= 1 && st[i - 1].note === st[i].note ? 1 : e).toFixed(3) : 0); });
    this.counter.textContent = (i + 1) + " / " + st.length;
    // 変数：その時点の値。変わった変数は字と地と太字で
    var slot = 0, vars = cur ? cur.vars : {};
    this.names.forEach(function(k){
      if (!(k in vars)) return;
      var ch = cur.changed.indexOf(k) >= 0, vx = monoWidth(k + " = ", G.fs);
      rowsOf(vars[k], py).forEach(function(txt, r){
        var o = self.varSlots[slot++]; if (!o) return;
        o.name.textContent = r ? "" : k + " = ";
        set(o.value, "x", +(G.rx + G.pad + vx).toFixed(1));
        o.value.textContent = cut(txt, G.rightW - 2 * G.pad - vx, G.fs);
        set(o.value, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--" + (ch ? "emph" : "fg") + ")" + (ch ? ";font-weight:700" : ""));
        set(o.bg, "opacity", ch ? e.toFixed(3) : 0);
      });
    });
    for (; slot < this.varSlots.length; slot++){ var o = this.varSlots[slot]; o.name.textContent = ""; o.value.textContent = ""; set(o.value, "x", G.rx + G.pad + G.nameW); set(o.value, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--fg)"); set(o.bg, "opacity", 0); }
    // 出力：その時点までの出力。入らなければ新しい行を残し、上に「…（前の n 行）」
    var L = i >= 0 ? this.acc[i] : [], n = this.outLabels.length, from = L.length > n ? L.length - n + 1 : 0;
    var newFrom = i >= 1 ? this.acc[i - 1].length : 0;
    this.outLabels.forEach(function(lab, j){
      var idx = from ? from + j - 1 : j, txt = from && j === 0 ? T.older(from) : idx < L.length ? cut(L[idx].replace(/\t/g, "    "), G.rightW - 2 * G.pad, G.fs) : "";
      lab.textContent = txt;
      set(lab, "opacity", !(from && j === 0) && idx >= newFrom && idx < L.length ? e.toFixed(3) : 1);
      set(lab, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--" + (from && j === 0 ? "muted" : "fg") + ")");
    });
  }
};
});
