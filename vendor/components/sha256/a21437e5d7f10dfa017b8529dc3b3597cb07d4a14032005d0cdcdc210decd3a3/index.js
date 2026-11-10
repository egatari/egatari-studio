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
    var fs = this.fs, nf = this.noteSize, row = Math.ceil(fs * 1.4), noteRow = Math.ceil(nf * 1.45 + 4);
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), program = lines(d.code), output = d.output === undefined ? [] : lines(d.output);
    var lang = d.lang || "", commentAt = comments(program, lang.toLowerCase());
    this.setAttribute("role", "figure");   // 中の読める pre が読まれるように（img の子は読まれない）
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.summary(lang.toLowerCase() === "python" ? "Python" : lang, program.length, d.output !== undefined) + "; " + d.steps.map(function(s){ return s.note; }).join("; "));
    // Keep the full source readable inside the figure even when the SVG is truncated.
    var pre = document.createElement("pre"); pre.className = "sr-only";
    pre.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:pre;border:0");
    pre.setAttribute("aria-label", T.readable);
    pre.textContent = d.code + (d.output !== undefined ? "\n\n" + T.output + "\n" + d.output : ""); this.appendChild(pre);
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true"}, this);
    var header = row + 16, pad = 16, gap = 32, numW = monoWidth(String(program.length), fs) + 16;
    var expanded = program.map(function(s){ return s.replace(/\t/g, "    "); });
    var longest = expanded.reduce(function(a, b){ return monoWidth(a, fs) >= monoWidth(b, fs) ? a : b; }, "");
    var natural = Math.max(160, monoWidth(longest, fs)) + numW + 2 * pad;
    var outNatural = Math.max(monoWidth(T.output, fs) + monoWidth(T.run, fs) + pad + 8, ...output.slice(0, 8).map(function(s){ return monoWidth(s.replace(/\t/g, "    "), fs); })) + 2 * pad;
    var outputH = output.length ? header + row * Math.min(8, output.length) + pad : 0;
    var right = output.length > 0 && (P.outputPos === "right" || P.outputPos === "auto" && program.length <= 8 && natural + 280 + outNatural + 2 * gap <= W);
    var outW = right ? Math.max(120, Math.min(outNatural, W * 0.3)) : 0;
    var available = W - (right ? outW + gap : 0), codeW = natural;
    var nx = codeW + gap, nw = Math.max(1, available - nx);
    var areaH = H - (!right && output.length ? outputH + 16 : 0), nextY = header;
    // Keep the beside layout only if *all* the notes fit at their line targets.
    var beside = natural <= W * 0.55 && natural + gap + 260 <= available;
    d.steps.forEach(function(s){
      var a = s.lines[0], b = s.lines.length === 2 ? s.lines[1] : a;
      var target = header + ((a + b - 2) / 2 + 0.5) * row;
      var h = Math.max(1, wrap(s.note, nw - 24, nf, self).length) * noteRow + 16;
      nextY = Math.max(nextY, target - h / 2) + h + 8;
      if (nextY - 8 > areaH) beside = false;
    });
    this.noteLayout = beside ? "beside" : "band";
    if (!beside){
      // 出力は、コードの横に入るなら右に（幅で決める。短い出力なら広いコードの横にも入る）
      right = output.length > 0 && (P.outputPos === "right" || P.outputPos === "auto" && natural + gap + Math.max(120, outNatural) <= W);
      outW = right ? Math.max(120, Math.min(outNatural, W - gap - natural)) : 0;
      available = W - (right ? outW + gap : 0);
      codeW = Math.max(1, Math.min(natural, available));
      nx = 0; nw = right ? codeW : W;
      areaH = H - (!right && output.length ? outputH + 16 : 0);
    }
    var bandH = !beside && d.steps.length ? noteRow + 16 : 0, bandSpace = bandH ? bandH + 8 : 0;
    var capacity = Math.max(0, Math.floor((areaH - header - pad - bandSpace) / row));
    var count = Math.min(16, program.length, capacity), codeH = header + count * row + pad;
    var neededH = Math.ceil(header + program.length * row + pad + bandSpace + (!right && output.length ? outputH + 16 : 0));
    var textX = pad + numW, firstY = header + fs, textW = Math.max(0, codeW - textX - pad);
    if (count < program.length) ctx.report("layout", "[code] " + program.length + " lines; this height fits " + Math.min(16, capacity) + " (give the element about " + neededH + " px, or show fewer lines)" + (program.length > 16 ? "; at most 16 lines per panel" : ""));
    if (monoWidth(longest, fs) > textW) ctx.report("layout", "[code] the longest line is " + [...longest].length + " characters; this width fits " + Math.floor(textW / (0.6 * fs)) + " at " + fs + "px (break the line)");
    this.geometry = {codeW: codeW, codeH: codeH, nx: nx, nw: nw, row: row, firstY: firstY, right: right, count: count, neededH: neededH, bandH: bandH, noteLayout: this.noteLayout};
    this.codeLayer = base.el("g", {opacity: 0}, this.svg);
    function panel(g, x, y, w, h){ base.el("rect", {x: x, y: y, width: Math.max(1, w), height: Math.max(1, h), rx: 12, fill: "var(--term-tint, color-mix(in srgb, var(--fg) 5%, var(--bg)))", stroke: "var(--line)", "stroke-width": 2}, g); }
    panel(this.codeLayer, 1, 1, codeW - 2, codeH - 2);
    var tagW = Math.max(1, codeW - 2 * pad), tag = cut(lang, tagW, fs);
    if (count || H >= header + pad) this.label(this.codeLayer, codeW - pad - monoWidth(tag, fs), pad + fs, tag, fs, "var(--muted)", true);
    this.bands = d.steps.map(function(){ return base.el("rect", {x: 4, y: header, width: Math.max(1, codeW - 8), height: row, fill: "var(--emph-tint, color-mix(in srgb, var(--emph) 12%, var(--bg)))", opacity: 0}, self.codeLayer); });
    if (tag !== lang) ctx.report("layout", "[code] language tag needs " + Math.ceil(monoWidth(lang, fs)) + " px; header fits " + Math.floor(tagW) + " px");
    this.numbers = [];
    for (var i = 0; i < count; i++){
      var y = firstY + i * row, original = program[i].replace(/\t/g, "    "), s = cut(original, Math.max(0, codeW - textX - pad), fs);
      if (i === count - 1 && count < program.length) s = cut(s + "…", Math.max(0, codeW - textX - pad), fs);
      this.numbers.push(this.label(this.codeLayer, pad, y, String(i + 1), fs, "var(--muted)", true));
      // Index after tab expansion (comment scanner operates on the original program).
      var at = commentAt[i] < 0 ? -1 : program[i].slice(0, commentAt[i]).replace(/\t/g, "    ").length;
      if (at < 0 || at >= s.length) this.label(this.codeLayer, textX, y, s, fs, "var(--fg)", true);
      else {
        this.label(this.codeLayer, textX, y, s.slice(0, at), fs, "var(--fg)", true);
        this.label(this.codeLayer, textX + monoWidth(s.slice(0, at), fs), y, s.slice(at), fs, "var(--muted)", true);
      }
    }
    if (count === 0 || W < 360 || textW < fs){
      ctx.report("size", "[code] element is " + W + " × " + H + " px; allow at least 360 × " + Math.ceil(header + row + pad + bandSpace) + " px for one code line and notes");
    }
    // Even unusably small boxes retain a clipped panel and an ellipsis.
    this.svg.setAttribute("style", "overflow:hidden");
    if (!count) this.label(this.codeLayer, Math.min(pad, W / 4), Math.min(fs, H), "…", fs);
    nextY = header;
    var bandY = codeH + 8, bandRoom = Math.max(0, areaH - bandY), bandRows = Math.max(0, Math.floor((bandRoom - 16) / noteRow));
    function proseCut(s, width){
      if (base.textWidth(s, nf, {font: self}) <= width) return s;
      var chars = [...s];
      while (chars.length && base.textWidth(chars.join("") + "…", nf, {font: self}) > width) chars.pop();
      return width >= nf ? chars.join("") + "…" : "";
    }
    function marker(a, b){ return T === TEXT.ja ? a + (b === a ? "" : "–" + b) + " 行目" : (a === b ? "line " + a : "lines " + a + "–" + b); }
    this.notes = d.steps.map(function(s, j){
      var a = s.lines[0], b = s.lines.length === 2 ? s.lines[1] : a;
      var valid = a >= 1 && b >= a && b <= program.length;
      if (!valid) ctx.report("range", "[code] steps[" + j + "].lines must be an inclusive range within 1–" + program.length);
      var target = valid && a <= count ? header + ((a - 1 + Math.min(b, count) - 1) / 2 + 0.5) * row : header;
      var g = base.el("g", {opacity: 0}, self.svg), text, top, h, labels;
      if (beside){
        text = wrap(s.note, nw - 24, nf, self); h = Math.max(noteRow, text.length * noteRow) + 16;
        top = Math.max(nextY, target - h / 2);
        if (valid && a <= count) base.el("path", {d: "M " + codeW + " " + target + " H " + (nx - 12) + " V " + (top + h / 2) + " H " + nx, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, g);
        base.el("rect", {x: nx, y: top, width: nw - 1, height: h, rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, g);
        labels = text.map(function(t, k){ return self.label(g, nx + 12, top + 8 + nf + k * noteRow, t, nf); });
        nextY = top + h + 8;
      } else {
        top = bandY; h = Math.min(bandH, bandRoom);
        var prefix = marker(a, b) + " · ", prefixW = base.textWidth(prefix, nf, {font: self}), room = Math.max(0, nw - 24 - prefixW);
        var width = base.textWidth(s.note, nf, {font: self});
        if (width > room || lines(s.note).length > 1){
          var approx = Math.max(0, Math.floor([...s.note].length * room / Math.max(1, width)));
          ctx.report("layout", "[code] note " + (j + 1) + " is too long for the band (" + Math.ceil(width) + " px of " + Math.floor(room) + "); shorten it to about " + approx + " characters");
        }
        base.el("rect", {x: 1, y: top, width: Math.max(1, nw - 2), height: Math.max(1, h), rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, g);
        labels = [self.label(g, 12, top + 8 + nf, proseCut(prefix + s.note.replace(/\s*\n\s*/g, " "), nw - 24), nf)];
      }
      if (valid && a <= count){ set(self.bands[j], "y", header + (a - 1) * row); set(self.bands[j], "height", (Math.min(b, count) - a + 1) * row); }
      return {g: g, labels: labels, a: a, b: b, valid: valid && a <= count, top: top, height: h, fits: true};
    });
    this.finalNotes = base.el("g", {opacity: 0}, this.svg);
    if (!beside && d.steps.length){
      // 最後の一覧：説明ごとに行の範囲を付け（「3–4：…」）、説明の途中では折らずに行へ詰める
      var items = d.steps.map(function(s){ var r = Array.isArray(s.lines) ? s.lines : []; var x = r[0], y = r.length > 1 ? r[1] : r[0]; return x + (y === x ? "" : "–" + y) + (T === TEXT.ja ? "：" : ": ") + s.note.replace(/\s*\n\s*/g, " "); });
      var list = [], cur = "", sep = "　　";
      items.forEach(function(t){
        var cand = cur ? cur + sep + t : t;
        if (cur && base.textWidth(cand, nf, {font: self}) > nw - 24){ list.push(cur); cur = t; } else cur = cand;
      });
      if (cur) list.push(cur);
      list = list.map(function(t){ return proseCut(t, nw - 24); });
      var listFits = list.length <= bandRows;
      if (!listFits){
        ctx.report("layout", "[code] " + d.steps.length + " final notes need " + (list.length * noteRow + 16) + " px in the band; " + Math.floor(bandRoom) + " px available (give the element about " + Math.ceil(H + list.length * noteRow + 16 - bandRoom) + " px, or shorten notes); showing the last note");
        var last = d.steps[d.steps.length - 1];
        list = [proseCut(items[items.length - 1], nw - 24)];
      }
      base.el("rect", {x: 1, y: bandY, width: Math.max(1, nw - 2), height: Math.max(1, Math.min(bandRoom, list.length * noteRow + 16)), rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, this.finalNotes);
      list.forEach(function(s, i){ self.label(self.finalNotes, 12, bandY + 8 + nf + i * noteRow, s, nf); });
    }
    this.outputLayer = base.el("g", {opacity: 0}, this.svg);
    if (output.length){
      var ox = right ? W - outW : 0, oy = right ? 0 : areaH + 16, ow = right ? outW : codeW;
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
    if (outputH > H) ctx.report("size", "[code] output needs " + outputH + " px height; element has " + H + " px");
  }
  render(k, t, ctx){
    if (!this.codeLayer) return;
    ctx = ctx || {};
    var self = this, preview = ctx.preview || ctx.mode === "lecture", faint = preview ? base.previewOpacity(this) : 0;
    var phase = function(step){ return k > step ? 1 : k < step ? faint : base.prog(t, 0, self.props.dur); };
    set(this.codeLayer, "opacity", phase(1));
    var final = k > this.steps || k === this.steps && t >= this.props.dur, active = !final && k >= 2 && k <= this.notes.length + 1 ? k - 2 : -1;
    this.notes.forEach(function(n, i){
      var band = self.noteLayout === "band", shown = !final && (i === active || active < 0 && k > self.notes.length + 1 && i === self.notes.length - 1);
      set(n.g, "opacity", band ? (shown ? phase(i + 2) : 0) : phase(i + 2));
      n.labels.forEach(function(e){ set(e, "style", "fill:var(--" + (i < k - 2 && !final ? "muted" : "fg") + ")"); });
      set(self.bands[i], "opacity", i === active && n.valid ? base.prog(t, 0, self.props.dur) : 0);
    });
    set(this.finalNotes, "opacity", this.noteLayout === "band" ? (final ? 1 : k < 2 ? faint : 0) : 0);
    this.numbers.forEach(function(e, i){ var n = self.notes[active]; set(e, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--" + (n && n.valid && i + 1 >= n.a && i + 1 <= n.b ? "emph" : "muted") + ")"); });
    set(this.outputLayer, "opacity", phase(this.notes.length + 2));
  }
};
});
