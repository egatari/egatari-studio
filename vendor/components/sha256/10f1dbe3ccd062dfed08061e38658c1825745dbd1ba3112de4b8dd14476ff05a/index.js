// m-code: a program, successive line explanations, then its supplied output. Never executes code.
egatariParts.define({name: "code", version: "2.0.0", requires: {base: "1.1.0"}, element: "m-code"}, function(deps){
"use strict";
var base = deps.base, MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
var TEXT = {
  ja: {output: "出力", run: "▶ 実行", readable: "コードと出力", summary: function(lang, n, output){ return (lang || "プログラム") + " のコード " + n + " 行" + (output ? "と出力" : ""); }},
  en: {output: "Output", run: "▶ Run", readable: "Code and output", summary: function(lang, n, output){ return (lang || "Program") + ": " + n + " lines of code" + (output ? " and output" : ""); }}
};
function set(e, a, v){ e.setAttribute(a, String(v)); }
function lines(s){ return s.replace(/\r\n?/g, "\n").split("\n"); }
function monoWidth(s, fs){ return [...s].reduce(function(w, ch){ return w + (/[\u0000-\u024f]/.test(ch) ? 0.6 : 1); }, 0) * fs; }
function cut(s, w, fs){
  if (monoWidth(s, fs) <= w) return s;
  var ch = [...s];
  while (ch.length && monoWidth(ch.join("") + "…", fs) > w) ch.pop();
  return w >= fs ? ch.join("") + "…" : "";
}
// Recognize line comments outside quoted strings; retain multiline Python strings / JS templates.
function comments(program, lang){
  var quote = "", triple = false;
  return program.map(function(s){
    for (var i = 0; i < s.length; i++){
      var c = s[i];
      if (c === "\\"){ i++; continue; }
      if (quote){
        if (c === quote && (!triple || s.slice(i, i + 3) === quote.repeat(3))){ i += triple ? 2 : 0; quote = ""; triple = false; }
      } else if (c === '"' || c === "'" || (lang === "js" || lang === "javascript") && c === "`"){
        quote = c; triple = lang === "python" && s.slice(i, i + 3) === c.repeat(3); if (triple) i += 2;
      } else if ((lang === "python" || lang === "r" || lang === "shell" || lang === "sh" || lang === "bash") && c === "#" && (!(lang === "shell" || lang === "sh" || lang === "bash") || i === 0 || /\s/.test(s[i - 1])) || (lang === "js" || lang === "javascript") && s.slice(i, i + 2) === "//") return i;
    }
    if (!triple && quote !== "`") quote = "";
    return -1;
  });
}
// Wrap prose on words where possible, falling back to characters for Japanese / long tokens.
function wrap(s, w, fs, font){
  var out = [];
  lines(s).forEach(function(p){
    var rest = [...p];
    while (rest.length){
      var n = 0;
      while (n < rest.length && base.textWidth(rest.slice(0, n + 1).join(""), fs, {font: font}) <= w) n++;
      n = Math.max(1, n);
      if (n < rest.length){ var space = rest.slice(0, n + 1).lastIndexOf(" "); if (space > 0) n = space; }
      out.push(rest.splice(0, n).join("").trimEnd());
      while (rest[0] === " ") rest.shift();
    }
    if (!p) out.push("");
  });
  return out;
}
return class extends base.MotionElement {
  static partName = "code";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["code", "steps"], properties: {
    code: {type: "string"}, lang: {type: "string"}, output: {type: "string"},
    steps: {type: "array", items: {type: "object", additionalProperties: false, required: ["lines", "note"], properties: {
      lines: {type: "array", minItems: 1, maxItems: 2, items: {type: "integer"}}, note: {type: "string"}
    }}}
  }}, example: /*@egatari-block example*/{"lang":"python","code":"import pandas as pd\ndf = pd.read_csv(\"sales.csv\")\ndf.groupby(\"store\")[\"sales\"].mean()","steps":[{"lines":[1],"note":"pandas を読み込む"},{"lines":[2],"note":"CSV を表として読む"},{"lines":[3],"note":"店ごとの平均"}],"output":"store\nA    120.5\nB     98.0"}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 0.6, doc: "段階の秒数"},
    size: {type: "number", default: 0, doc: "文字 px（0 は既定）"},
    outputPos: {type: "enum", values: ["auto", "below", "right"], default: "auto", doc: "出力の位置"}
  };
  get steps(){ return this.data.steps.length + 1 + (this.data.output !== undefined ? 1 : 0); }
  duration(k){ return k >= 1 && k <= this.steps ? this.props.dur : 0; }
  label(g, x, y, s, fs, color, mono){
    var e = base.el("text", {x: x, y: y, "font-size": fs, fill: color || "var(--fg)"}, g);
    // 等幅と空白：テーマの `svg text{font-family}` は属性より強いので style に書く。行頭の字下げを残す（white-space: pre）
    if (mono){ e.setAttribute("style", (e.getAttribute("style") || "") + "font-family:" + MONO + ";white-space:pre;"); }
    e.textContent = s; return e;
  }
  mount(ctx){
    var self = this, d = this.data, P = this.props, T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[code] dur must be positive; using 0.6"); P.dur = 0.6; }
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[code] size must be 0 or at least 24; using defaults"); P.size = 0; }
    if (!["auto", "below", "right"].includes(P.outputPos)){ ctx.report("attr", "[code] invalid outputPos; using auto"); P.outputPos = "auto"; }
    // 大きさを測る前にブロックにする（インラインのままだと幅が 0 になる）
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.fs = P.size || 24; this.noteSize = P.size || 26;
    var fs = this.fs, nf = this.noteSize, row = fs * 1.5 + 4, noteRow = nf * 1.45 + 4;
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), program = lines(d.code), output = d.output === undefined ? [] : lines(d.output);
    var lang = d.lang || "", commentAt = comments(program, lang.toLowerCase());
    this.setAttribute("role", "figure");   // 中の読める pre が読まれるように（img の子は読まれない）
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.summary(lang.toLowerCase() === "python" ? "Python" : lang, program.length, d.output !== undefined) + "; " + d.steps.map(function(s){ return s.note; }).join("; "));
    // A focusable document remains reachable inside role=img (whose ordinary descendants are presentational).
    var pre = document.createElement("pre"); pre.className = "sr-only";
    pre.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:pre;border:0");
    pre.setAttribute("aria-label", T.readable);
    pre.textContent = d.code + (d.output !== undefined ? "\n\n" + T.output + "\n" + d.output : ""); this.appendChild(pre);
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var header = fs * 1.45 + 20, pad = 16, gap = 32, numW = monoWidth(String(program.length), fs) + 16;
    var natural = Math.max(160, ...program.slice(0, 16).map(function(s){ return monoWidth(s.replace(/\t/g, "    "), fs); })) + numW + 2 * pad;
    var outNatural = Math.max(monoWidth(T.output, fs) + monoWidth(T.run, fs) + pad + 8, ...output.slice(0, 8).map(function(s){ return monoWidth(s, fs); })) + 2 * pad;
    var right = output.length > 0 && (P.outputPos === "right" || P.outputPos === "auto" && program.length <= 8 && natural + 280 + outNatural + 2 * gap <= W);
    var outW = right ? Math.max(120, Math.min(outNatural, W * 0.3)) : 0;
    var available = W - (right ? outW + gap : 0), codeW = Math.max(1, Math.min(natural, available - gap - 260));
    var nx = codeW + gap, nw = Math.max(1, available - nx), outputH = output.length ? header + row * Math.min(8, output.length) + pad : 0;
    var areaH = H - (!right && output.length ? outputH + 16 : 0);
    var count = Math.max(0, Math.min(16, program.length, Math.floor((areaH - header - pad) / row)));
    var codeH = header + count * row + pad, textX = pad + numW, firstY = header + fs;
    if (W < 360 || codeW < textX + fs + pad || count === 0 || codeH > H){
      ctx.report("size", "[code] panels do not fit at 24px minimum; enlarge the element"); return;
    }
    this.geometry = {codeW: codeW, codeH: codeH, nx: nx, nw: nw, row: row, firstY: firstY, right: right};
    this.codeLayer = base.el("g", {opacity: 0}, this.svg);
    function panel(g, x, y, w, h){ base.el("rect", {x: x, y: y, width: Math.max(1, w), height: Math.max(1, h), rx: 12, fill: "var(--term-tint, color-mix(in srgb, var(--fg) 5%, var(--bg)))", stroke: "var(--line)", "stroke-width": 2}, g); }
    panel(this.codeLayer, 1, 1, codeW - 2, codeH - 2);
    var tagW = Math.max(1, codeW - 2 * pad), tag = cut(lang, tagW, fs);
    this.label(this.codeLayer, codeW - pad - monoWidth(tag, fs), pad + fs, tag, fs, "var(--muted)", true);
    this.bands = d.steps.map(function(){ return base.el("rect", {x: 4, y: header, width: Math.max(1, codeW - 8), height: row, fill: "var(--emph-tint, color-mix(in srgb, var(--emph) 12%, var(--bg)))", opacity: 0}, self.codeLayer); });
    var truncated = program.length > 16 || count < program.length || tag !== lang;
    this.numbers = [];
    for (var i = 0; i < count; i++){
      var y = firstY + i * row, original = program[i].replace(/\t/g, "    "), s = cut(original, Math.max(0, codeW - textX - pad), fs);
      if (i === count - 1 && count < program.length) s = cut(s + "…", Math.max(0, codeW - textX - pad), fs);
      if (s !== original) truncated = true;
      this.numbers.push(this.label(this.codeLayer, pad, y, String(i + 1), fs, "var(--muted)", true));
      // Index after tab expansion (comment scanner operates on the original program).
      var at = commentAt[i] < 0 ? -1 : program[i].slice(0, commentAt[i]).replace(/\t/g, "    ").length;
      if (at < 0 || at >= s.length) this.label(this.codeLayer, textX, y, s, fs, "var(--fg)", true);
      else {
        this.label(this.codeLayer, textX, y, s.slice(0, at), fs, "var(--fg)", true);
        this.label(this.codeLayer, textX + monoWidth(s.slice(0, at), fs), y, s.slice(at), fs, "var(--muted)", true);
      }
    }
    if (truncated) ctx.report("layout", "[code] code exceeds 16 lines or panel width/height; showing what fits with …");
    var nextY = header, cramped = false;
    this.notes = d.steps.map(function(s, j){
      var a = s.lines[0], b = s.lines.length === 2 ? s.lines[1] : a;
      var valid = a >= 1 && b >= a && b <= program.length;
      if (!valid) ctx.report("range", "[code] steps[" + j + "].lines must be an inclusive range within 1–" + program.length);
      var target = valid && a <= count ? header + ((a - 1 + Math.min(b, count) - 1) / 2 + 0.5) * row : header;
      var text = wrap(s.note, nw - 24, nf, self), h = Math.max(noteRow, text.length * noteRow) + 16;
      var top = Math.max(nextY, target - h / 2), g = base.el("g", {opacity: 0}, self.svg);
      var fits = nw >= nf + 24 && top + h <= areaH;
      if (!fits) cramped = true;
      // Never paint an overflowing note; its full text remains in the accessible summary.
      if (fits){
        if (valid && a <= count) base.el("path", {d: "M " + codeW + " " + target + " H " + (nx - 12) + " V " + (top + h / 2) + " H " + nx, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, g);
        base.el("rect", {x: nx, y: top, width: nw - 1, height: h, rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, g);
      }
      var labels = fits ? text.map(function(t, k){ return self.label(g, nx + 12, top + 8 + nf + k * noteRow, t, nf); }) : [];
      if (valid && a <= count){ set(self.bands[j], "y", header + (a - 1) * row); set(self.bands[j], "height", (Math.min(b, count) - a + 1) * row); }
      nextY = top + h + 8;
      return {g: g, labels: labels, a: a, b: b, valid: valid && a <= count, top: top, height: h, fits: fits};
    });
    if (cramped) ctx.report("layout", "[code] notes exceed available room; enlarge the element or shorten notes");
    this.outputLayer = base.el("g", {opacity: 0}, this.svg);
    if (output.length){
      var ox = right ? W - outW : 0, oy = right ? 0 : codeH + 16, ow = right ? outW : codeW;
      var oc = Math.max(0, Math.min(8, output.length, Math.floor((H - oy - header - pad) / row)));
      panel(this.outputLayer, ox + 1, oy + 1, ow - 2, header + oc * row + pad - 2);
      self.label(this.outputLayer, ox + pad, oy + pad + fs, cut(T.output, ow - 2 * pad, fs), fs);
      // Run precedes the supplied plain text in a separate header region.
      var run = cut(T.run, ow - 2 * pad - monoWidth(T.output, fs) - pad, fs);
      self.label(this.outputLayer, ox + ow - pad - monoWidth(run, fs), oy + pad + fs, run, fs, "var(--muted)", true);
      var outputCut = oc < output.length || run !== T.run || monoWidth(T.output, fs) > ow - 2 * pad;
      output.slice(0, oc).forEach(function(s, i){
        var txt = cut(s.replace(/\t/g, "    "), ow - 2 * pad, fs);
        if (i === oc - 1 && oc < output.length) txt = cut(txt + "…", ow - 2 * pad, fs);
        if (txt !== s) outputCut = true;
        self.label(self.outputLayer, ox + pad, oy + header + fs + i * row, txt, fs, "var(--fg)", true);
      });
      if (outputCut) ctx.report("layout", "[code] output exceeds eight lines or panel width/height; showing what fits with …");
    }
    if (outputH > H) ctx.report("size", "[code] output does not fit; enlarge the element");
  }
  render(k, t, ctx){
    if (!this.codeLayer) return;
    ctx = ctx || {};
    var self = this, preview = ctx.preview || ctx.mode === "lecture", faint = preview ? base.previewOpacity(this) : 0;
    var phase = function(step){ return k > step ? 1 : k < step ? faint : base.prog(t, 0, self.props.dur); };
    set(this.codeLayer, "opacity", phase(1));
    var final = k > this.steps || k === this.steps && t >= this.props.dur, active = !final && k >= 2 && k <= this.notes.length + 1 ? k - 2 : -1;
    this.notes.forEach(function(n, i){
      set(n.g, "opacity", phase(i + 2));
      n.labels.forEach(function(e){ set(e, "style", "fill:var(--" + (i < k - 2 && !final ? "muted" : "fg") + ")"); });
      set(self.bands[i], "opacity", i === active && n.valid ? base.prog(t, 0, self.props.dur) : 0);
    });
    this.numbers.forEach(function(e, i){ var n = self.notes[active]; set(e, "style", "fill:var(--" + (n && n.valid && i + 1 >= n.a && i + 1 <= n.b ? "emph" : "muted") + ")"); });
    set(this.outputLayer, "opacity", phase(this.notes.length + 2));
  }
};
});
