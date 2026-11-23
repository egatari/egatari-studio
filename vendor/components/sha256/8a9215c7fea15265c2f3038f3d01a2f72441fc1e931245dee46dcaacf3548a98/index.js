// m-code: a program, successive line explanations, then its supplied output. Never executes code.
// 2.2.0: the drawing helpers live in code-core. Whenever 2.1.0's layout fits (no layout report), the same layout is drawn.
// Otherwise (code taller or wider than the box, a note too long for the band, or a step that lists 3+ lines) the fit layout
// is drawn instead: notes in the band (up to 2 rows), long lines soft-wrapped under a "↪" gutter, and a moving window of rows
// centred on each step's lines with "⋮" markers for the hidden ones. The full source and output stay in a child
// <pre data-readable> (the readable layer copies it as visible text).
egatariParts.define({name: "code", version: "2.2.1", requires: {base: "1.3.0", "code-core": "1.0.1"}, element: "m-code"}, function(deps){
"use strict";
var base = deps.base, MONO = deps["code-core"].MONO;
var TEXT = {
  ja: {output: "出力", run: "▶ 実行", readable: "コードと出力", summary: function(lang, n, output){ return (lang || "プログラム") + " のコード " + n + " 行" + (output ? "と出力" : ""); }},
  en: {output: "Output", run: "▶ Run", readable: "Code and output", summary: function(lang, n, output){ return (lang || "Program") + ": " + n + " lines of code" + (output ? " and output" : ""); }}
};
var C = deps["code-core"], set = C.set, lines = C.lines, monoWidth = C.monoWidth, cut = C.cut, spans = C.spans, wrap = C.wrap;
return class extends base.MotionElement {
  static partName = "code";
  static shape = {schema: {type: "object", additionalProperties: false, required: ["code", "steps"], properties: {
    code: {type: "string"}, lang: {type: "string"}, output: {type: "string"},
    steps: {type: "array", items: {type: "object", additionalProperties: false, required: ["lines", "note"], properties: {
      lines: {type: "array", minItems: 1, maxItems: 16, items: {type: ["integer", "array"], minItems: 2, maxItems: 2, items: {type: "integer"}}}, note: {type: "string"}
    }}}
  }}, example: /*@egatari-block example*/{"lang":"python","code":"import pandas as pd\ndf = pd.read_csv(\"sales.csv\")\ndf.groupby(\"store\")[\"sales\"].mean()","steps":[{"lines":[1],"note":"pandas を読み込む"},{"lines":[2],"note":"CSV を表として読む"},{"lines":[3],"note":"店ごとの平均"}],"output":"store\nA    120.5\nB     98.0"}/*@egatari-block-end*/};
  static props = {
    dur: {type: "number", default: 0.6, doc: "ステップの秒数"},
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
    // [[3, 4]] is read as [3, 4] (one range per step); any other nesting is a range problem below
    var self = this, d = Object.assign({}, this.data, {steps: this.data.steps.map(function(s, j){
      var r = s.lines.length === 1 && Array.isArray(s.lines[0]) ? s.lines[0] : s.lines;
      if (r.some(Array.isArray)){ ctx.report("range", "[code] steps[" + j + "].lines: one range per step, e.g. [3, 4]"); return {lines: [0], note: s.note, nested: true}; }
      // 3 つ以上の整数は、その行だけ（飛び飛びでよい）。1〜2 個は今までどおり 1 行か範囲
      if (r.length >= 3) return {lines: [Math.min.apply(null, r), Math.max.apply(null, r)], set: r.slice().sort(function(x, y){ return x - y; }), note: s.note};
      return {lines: r, note: s.note};
    })}), P = this.props, T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    if (!(Number.isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[code] dur must be positive; using 0.6"); P.dur = 0.6; }
    if (!(P.size === 0 || Number.isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[code] size must be 0 or at least 24; using defaults"); P.size = 0; }
    if (!["auto", "below", "right"].includes(P.outputPos)){ ctx.report("attr", "[code] invalid outputPos; using auto"); P.outputPos = "auto"; }
    // 大きさを測る前にブロックにする（インラインのままだと幅が 0 になる）
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.fs = P.size || 24; this.noteSize = P.size || 26;
    var fs = this.fs, nf = this.noteSize, row = Math.ceil(fs * 1.4), noteRow = Math.ceil(nf * 1.45 + 4);
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), program = lines(d.code), output = d.output === undefined ? [] : lines(d.output);
    var lang = d.lang || "", marks = spans(program, lang.toLowerCase());
    this.setAttribute("role", "figure");   // 中の読める pre が読まれるように（img の子は読まれない）
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", T.summary(lang.toLowerCase() === "python" ? "Python" : lang, program.length, d.output !== undefined) + "; " + d.steps.map(function(s){ return s.note; }).join("; "));
    // Keep the full source readable inside the figure even when the SVG is truncated.
    var pre = document.createElement("pre"); pre.className = "sr-only";
    pre.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:pre;border:0");
    pre.setAttribute("aria-label", T.readable); pre.setAttribute("data-readable", "");
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
    // 下帯の最終一覧：説明ごとに行の範囲を付け（「3–4：…」）、説明の途中では折らずに行へ詰める。字は 24px、行間は字の箱 1.45em
    var listFont = Math.max(24, nf - 2), listRow = Math.ceil(listFont * 1.45);
    var items = d.steps.map(function(s){ var r = Array.isArray(s.lines) ? s.lines : []; var x = r[0], y = r.length > 1 ? r[1] : r[0]; return x + (y === x ? "" : "–" + y) + (T === TEXT.ja ? "：" : ": ") + s.note.replace(/\s*\n\s*/g, " "); });
    // 出力が下に回るときは説明帯の右に並べ、帯と出力の高い方だけを使う
    var sideW = Math.max(120, outNatural);
    var side = !beside && !right && output.length > 0 && P.outputPos === "auto" && d.steps.length > 0 && outNatural <= W * 0.45 && W - sideW - gap >= W * 0.4;
    if (side){ nw = W - sideW - gap; areaH = H; }
    var list = [];
    if (!beside && d.steps.length){
      var cur = "", sep = T === TEXT.ja ? "　" : "   ";
      items.forEach(function(t){
        var cand = cur ? cur + sep + t : t;
        if (cur && base.textWidth(cand, listFont, {font: self}) > nw - 24){ list.push(cur); cur = t; } else cur = cand;
      });
      if (cur) list.push(cur);
    }
    // 高さの式は 1 つ：コード部 + 帯（一覧 r 行）と横の出力の高い方 + 下の出力。報告もこの式で数える
    function bandFor(r){ return r ? noteRow + 16 + (r - 1) * listRow : 0; }
    function need(n, r){ var zone = Math.max(bandFor(r), side ? outputH : 0); return Math.ceil(header + n * row + pad + (zone ? 8 + zone : 0) + (!right && !side && output.length ? outputH + 16 : 0)); }
    var want = Math.min(16, program.length), rows = list.length, fullList = true;
    function fitsAt(h, r){ return Math.max(0, Math.floor((h - need(0, r)) / row)); }
    var capacity = fitsAt(H, rows);
    if (capacity < want && rows > 1 && fitsAt(H, 1) >= want){ fullList = false; capacity = fitsAt(H, 1); }   // コードを全部残し、最終一覧は最後の説明だけ
    var bandH = bandFor(fullList ? rows : Math.min(1, rows)), bandSpace = bandH ? bandH + 8 : 0;
    var count = Math.min(want, capacity), codeH = header + count * row + pad;
    var neededH = need(want, rows), SLIDE = 440;
    function advice(){
      return neededH <= SLIDE ? "give the element about " + neededH + " px" : "more than a slide body under a heading (about " + SLIDE + " px) holds; " + SLIDE + " px fits " + Math.min(want, fitsAt(SLIDE, rows)) + " lines with these notes: show fewer lines, shorten notes or split the slide";
    }
    var textX = pad + numW, firstY = header + fs, textW = Math.max(0, codeW - textX - pad);
    // 2.1.0 の配置で収まらないとき（報告が出るとき）だけ、収める配置に切り替える
    var noteTooLong = !beside && d.steps.some(function(s){
      var a = s.lines[0], b = s.lines.length === 2 ? s.lines[1] : a, pre = (T === TEXT.ja ? a + (b === a ? "" : "–" + b) + " 行目" : (a === b ? "line " + a : "lines " + a + "–" + b)) + " · ";
      return base.textWidth(s.note, nf, {font: self}) > Math.max(0, nw - 24 - base.textWidth(pre, nf, {font: self})) || lines(s.note).length > 1;
    });
    if (count < program.length || monoWidth(longest, fs) > textW || noteTooLong || d.steps.some(function(s){ return s.set; })){
      this.fit = true; return this.mountFit(ctx, d, T, program, output, marks, lang);
    }
    if (count < program.length) ctx.report("layout", "[code] " + program.length + " lines; this height fits " + Math.min(16, capacity) + " (" + advice() + (neededH <= SLIDE ? ", or show fewer lines" : "") + ")" + (program.length > 16 ? "; at most 16 lines per panel" : ""));
    if (monoWidth(longest, fs) > textW) ctx.report("layout", "[code] the longest line is " + [...longest].length + " characters; this width fits " + Math.floor(textW / (0.6 * fs)) + " at " + fs + "px (break the line)");
    this.geometry = {side: side, listRows: rows, codeW: codeW, codeH: codeH, nx: nx, nw: nw, row: row, firstY: firstY, right: right, count: count, neededH: neededH, bandH: bandH, noteLayout: this.noteLayout};
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
      // One <text> per line; coloured runs are tspans, so the browser's own advance places them (indices after tab expansion)
      var e = this.label(this.codeLayer, textX, y, "", fs, "var(--fg)", true), pos = 0, line = program[i];
      var put = function(a, b, role){ if (b > a) base.el("tspan", role ? {fill: "var(--" + role + ")"} : {}, e).textContent = s.slice(a, b); };
      marks[i].forEach(function(m){
        var a = Math.min(s.length, line.slice(0, m[0]).replace(/\t/g, "    ").length), b = Math.min(s.length, line.slice(0, m[1]).replace(/\t/g, "    ").length);
        put(pos, a); put(a, b, m[2]); pos = b;
      });
      put(pos, s.length);
    }
    if (count === 0 || W < 360 || textW < fs){
      ctx.report("size", "[code] element is " + W + " × " + H + " px; allow at least 360 × " + Math.ceil(header + row + pad + bandSpace) + " px for one code line and notes");
    }
    // Even unusably small boxes retain a clipped panel and an ellipsis.
    this.svg.setAttribute("style", "overflow:hidden");
    if (!count) this.label(this.codeLayer, Math.min(pad, W / 4), Math.min(fs, H), "…", fs);
    nextY = header;
    var bandY = codeH + 8, bandRoom = Math.max(0, areaH - bandY);
    function proseCut(s, width, f){
      f = f || nf;
      if (base.textWidth(s, f, {font: self}) <= width) return s;
      var chars = [...s];
      while (chars.length && base.textWidth(chars.join("") + "…", f, {font: self}) > width) chars.pop();
      return width >= f ? chars.join("") + "…" : "";
    }
    function marker(a, b){ return T === TEXT.ja ? a + (b === a ? "" : "–" + b) + " 行目" : (a === b ? "line " + a : "lines " + a + "–" + b); }
    this.notes = d.steps.map(function(s, j){
      var a = s.lines[0], b = s.lines.length === 2 ? s.lines[1] : a;
      var valid = a >= 1 && b >= a && b <= program.length;
      if (!valid && !s.nested) ctx.report("range", "[code] steps[" + j + "].lines must be an inclusive range within 1–" + program.length);
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
        top = bandY; h = Math.min(bandFor(1), bandRoom);
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
      list = list.map(function(t){ return proseCut(t, nw - 24, listFont); });
      if (!fullList || bandFor(list.length) > bandRoom){
        // 最後の説明だけを残す（説明はすべて読み上げの要約にある）。報告にはせず、要素に印を付ける
        this.setAttribute("data-fit", "last-note");
        list = [proseCut(items[items.length - 1], nw - 24, listFont)];
      }
      base.el("rect", {x: 1, y: bandY, width: Math.max(1, nw - 2), height: Math.max(1, Math.min(bandRoom, bandFor(list.length))), rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, this.finalNotes);
      list.forEach(function(s, i){ self.label(self.finalNotes, 12, bandY + 8 + nf + i * listRow, s, listFont); });
    }
    this.outputLayer = base.el("g", {opacity: 0}, this.svg);
    if (output.length){
      var ox = right ? W - outW : side ? W - sideW : 0, oy = right ? 0 : side ? codeH + 8 : areaH + 16, ow = right ? outW : side ? sideW : codeW;
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
  // 収める配置（2.2.0）：説明は下の帯（2 行まで）、長い行は折り返し（続きの行は番号の欄に ↪）、行が多ければステップごとに
  // そのステップの行が中央に来るようにスクロールして表示する（隠れた行は ⋮ と数）。表示する範囲はステップの前半で消え、後半で新しい位置に出る（(k, t) だけで決まる）
  mountFit(ctx, d, T, program, output, marks, lang){
    var self = this, P = this.props, fs = this.fs, nf = this.noteSize, row = Math.ceil(fs * 1.4), noteRow = Math.ceil(nf * 1.45 + 4);
    var W = Math.max(1, this.clientWidth), H = Math.max(1, this.clientHeight), header = row + 16, pad = 16, gap = 32, ja = T === TEXT.ja;
    this.ja = ja;
    var outNatural = Math.max(monoWidth(T.output, fs) + monoWidth(T.run, fs) + pad + 8, ...output.slice(0, 8).map(function(s){ return monoWidth(s.replace(/\t/g, "    "), fs); })) + 2 * pad;
    var outputH = output.length ? header + row * Math.min(8, output.length) + pad : 0;
    var right = output.length > 0 && (P.outputPos === "right" || P.outputPos === "auto" && W - gap - Math.max(120, outNatural) >= W * 0.55);
    var outW = right ? Math.max(120, Math.min(outNatural, W * 0.4)) : 0, codeW = right ? W - outW - gap : W;
    // 出力が下に回るとき、帯が幅の 4 割以上残るなら、出力は帯の右に並べる（帯と出力の高い方だけ使う）
    var sideW = Math.max(120, outNatural), side = !right && output.length > 0 && P.outputPos === "auto" && d.steps.length > 0 && W - sideW - gap >= W * 0.4;
    var numW = monoWidth(String(program.length), fs) + 16, textX = pad + numW, textW = Math.max(fs, codeW - textX - pad), firstY = header + fs;
    // 見た目の行：元の行ごとに折り返す。色の範囲は字下げを広げた後の位置に直して、行の切れ目で分ける
    var vrows = [], rowsOf = [];
    program.forEach(function(line, i){
      var ex = line.replace(/\t/g, "    "), chars = [...ex], at = function(m){ return [...line.slice(0, m).replace(/\t/g, "    ")].length; };
      var segs = C.softWrap(ex, textW, fs), mine = [];
      segs.forEach(function(g, j){
        var sp = marks[i].map(function(m){ return [Math.max(at(m[0]), g.from) - g.from, Math.min(at(m[1]), g.to) - g.from, m[2]]; }).filter(function(m){ return m[1] > m[0]; });
        mine.push(vrows.length); vrows.push({line: i + 1, cont: j > 0, text: chars.slice(g.from, g.to).join(""), spans: sp});
      });
      rowsOf.push(mine);
    });
    var stepRows = d.steps.map(function(s){
      var want = s.set ? s.set : s.lines.length === 2 ? range(s.lines[0], s.lines[1]) : [s.lines[0]];
      var ok = want.every(function(n){ return n >= 1 && n <= program.length; }) && !s.nested && (s.set || s.lines.length === 1 || s.lines[1] >= s.lines[0]);
      if (!ok && !s.nested) ctx.report("range", "[code] steps[" + d.steps.indexOf(s) + "].lines must be within 1–" + program.length);
      var rs = ok ? [].concat.apply([], want.map(function(n){ return rowsOf[n - 1]; })) : [];
      return {lines: ok ? want : [], rows: rs};
    });
    function range(a, b){ var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
    // 帯の説明：「3–4 行目 · 説明」を 2 行までに折る。3 行以上なら 2 行目の末を … にして知らせる
    var nw = side ? W - sideW - gap : codeW, marker = function(st){ var L = st.lines; if (!L.length) return ""; var cont = L.every(function(n, i){ return i === 0 || n === L[i - 1] + 1; });
      var t = cont ? (L.length === 1 ? String(L[0]) : L[0] + "–" + L[L.length - 1]) : L.join(", ");
      return ja ? t + " 行目" : (L.length === 1 ? "line " : "lines ") + t; };
    var noteLines = d.steps.map(function(s, j){
      var w = wrap(marker(stepRows[j]) + " · " + s.note.replace(/\s*\n\s*/g, " "), nw - 24, nf, self);
      if (w.length > 2){
        ctx.report("layout", "[code] note " + (j + 1) + " needs " + w.length + " rows in the band (2 fit); shorten it");
        w = [w[0], proseCut(w.slice(1).join(" "), nw - 24, nf)];
      }
      return w;
    });
    function proseCut(s, width, f){
      f = f || nf;
      if (base.textWidth(s, f, {font: self}) <= width) return s;
      var ch = [...s];
      while (ch.length && base.textWidth(ch.join("") + "…", f, {font: self}) > width) ch.pop();
      return width >= f ? ch.join("") + "…" : "";
    }
    var nr = Math.max(1, ...noteLines.map(function(w){ return w.length; })), bandH = d.steps.length ? nr * noteRow + 16 : 0;
    // 最後の一覧：説明ごとに「3–4：…」を行へ詰める。入らなければ最後の説明だけ（data-fit="last-note"）
    var listFont = Math.max(24, nf - 2), listRow = Math.ceil(listFont * 1.45), sep = ja ? "　" : "   ", list = [], cur = "";
    d.steps.forEach(function(s, j){
      var L = stepRows[j].lines, t = (L.length ? (marker(stepRows[j]).replace(/ 行目$|^lines? /, "")) : "?") + (ja ? "：" : ": ") + s.note.replace(/\s*\n\s*/g, " ");
      var cand = cur ? cur + sep + t : t;
      if (cur && base.textWidth(cand, listFont, {font: self}) > nw - 24){ list.push(cur); cur = t; } else cur = cand;
    });
    if (cur) list.push(cur);
    var listH = list.length ? noteRow + 16 + (list.length - 1) * listRow : 0, below = !right && !side && output.length ? outputH + 16 : 0;
    var zone = Math.max(bandH, listH, side ? outputH : 0), slots = Math.floor((H - header - pad - (zone ? 8 + zone : 0) - below) / row);
    // コードを先に：最後の一覧の分だけコードの行が減るなら、一覧は最後の説明だけにする
    var zoneNoList = Math.max(bandH, side ? outputH : 0), slotsNoList = Math.floor((H - header - pad - (zoneNoList ? 8 + zoneNoList : 0) - below) / row);
    if (list.length > 1 && slots < Math.min(vrows.length, slotsNoList)){
      zone = zoneNoList; slots = slotsNoList;
      this.setAttribute("data-fit", "last-note"); list = [proseCut(list[list.length - 1], nw - 24, listFont)];
      listH = noteRow + 16;
    }
    if (slots < 3){
      var needH = header + pad + 3 * row + (zone ? 8 + zone : 0) + below;
      ctx.report("size", "[code] element is " + W + " × " + H + " px; the fit layout needs at least " + Math.ceil(needH) + " px height for 3 code rows and the notes");
      slots = Math.max(1, slots);
    }
    var shown = Math.min(slots, vrows.length), codeH = header + shown * row + pad;
    this.windows = stepRows.map(function(st, j){
      var ra = st.rows.length ? Math.min.apply(null, st.rows) : 0, rb = st.rows.length ? Math.max.apply(null, st.rows) : 0, w = C.windowFor(vrows.length, shown, ra, rb);
      if (!w.fits && shown >= 3) ctx.report("layout", "[code] step " + (j + 1) + " highlights " + (rb - ra + 1) + " rows; the code view shows " + shown + " (split the step or give the element more height)");
      return w;
    });
    this.window0 = C.windowFor(vrows.length, shown, 0, 0);
    this.geometry = {fit: true, side: side, codeW: codeW, codeH: codeH, rows: vrows.length, slots: shown, right: right, bandRows: nr, listRows: list.length, windowed: vrows.length > shown};
    this.noteLayout = "band";
    var g = this.codeLayer = base.el("g", {opacity: 0}, this.svg);
    base.el("rect", {x: 1, y: 1, width: Math.max(1, codeW - 2), height: Math.max(1, codeH - 2), rx: 12, fill: "var(--term-tint, color-mix(in srgb, var(--fg) 5%, var(--bg)))", stroke: "var(--line)", "stroke-width": 2}, g);
    var tag = cut(lang, Math.max(1, codeW - 2 * pad), fs);
    this.label(g, codeW - pad - monoWidth(tag, fs), pad + fs, tag, fs, "var(--muted)", true);
    this.fitBands = d.steps.map(function(){ return base.el("g", {opacity: 0}, g); });
    this.fitBandRects = stepRows.map(function(st, j){ return st.rows.map(function(){ return base.el("rect", {x: 4, y: header, width: Math.max(1, codeW - 8), height: row, fill: "var(--emph-tint, color-mix(in srgb, var(--emph) 12%, var(--bg)))"}, self.fitBands[j]); }); });
    this.vrows = vrows.map(function(r){
      var num = self.label(g, pad, firstY, r.cont ? "↪" : String(r.line), fs, "var(--muted)", true);
      var e = self.label(g, textX, firstY, "", fs, "var(--fg)", true), pos = 0;
      var put = function(a, b, role){ if (b > a) base.el("tspan", role ? {fill: "var(--" + role + ")"} : {}, e).textContent = [...r.text].slice(a, b).join(""); };
      r.spans.forEach(function(m){ put(pos, m[0]); put(m[0], m[1], m[2]); pos = m[1]; });
      put(pos, [...r.text].length);
      return {num: num, text: e, line: r.line};
    });
    this.markTop = this.label(g, pad, firstY, "", fs, "var(--muted)", true);
    this.markBottom = this.label(g, pad, firstY, "", fs, "var(--muted)", true);
    this.fitGeo = {header: header, row: row, firstY: firstY};
    this.stepLines = stepRows.map(function(st){ return st.lines; });
    var bandY = codeH + 8;
    this.notes = d.steps.map(function(s, j){
      var ng = base.el("g", {opacity: 0}, self.svg);
      base.el("rect", {x: 1, y: bandY, width: Math.max(1, nw - 2), height: bandH, rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, ng);
      var labels = noteLines[j].map(function(t, i){ return self.label(ng, 12, bandY + 8 + nf + i * noteRow, t, nf); });
      return {g: ng, labels: labels};
    });
    this.finalNotes = base.el("g", {opacity: 0}, this.svg);
    if (list.length){
      base.el("rect", {x: 1, y: bandY, width: Math.max(1, nw - 2), height: listH, rx: 8, fill: "var(--bg)", stroke: "var(--line)", "stroke-width": 2}, this.finalNotes);
      list.forEach(function(t, i){ self.label(self.finalNotes, 12, bandY + 8 + nf + i * listRow, proseCut(t, nw - 24, listFont), listFont); });
    }
    this.outputLayer = base.el("g", {opacity: 0}, this.svg);
    if (output.length){
      var ox = right ? W - outW : side ? W - sideW : 0, oy = right ? 0 : side ? bandY : bandY + zone + 16, ow = right ? outW : side ? sideW : codeW;
      var oc = Math.max(0, Math.min(8, output.length, Math.floor((H - oy - header - pad) / row)));
      base.el("rect", {x: ox + 1, y: oy + 1, width: Math.max(1, ow - 2), height: Math.max(1, header + oc * row + pad - 2), rx: 12, fill: "var(--term-tint, color-mix(in srgb, var(--fg) 5%, var(--bg)))", stroke: "var(--line)", "stroke-width": 2}, this.outputLayer);
      this.label(this.outputLayer, ox + pad, oy + pad + fs, cut(T.output, ow - 2 * pad, fs), fs);
      var run = cut(T.run, ow - 2 * pad - monoWidth(T.output, fs) - pad, fs);
      this.label(this.outputLayer, ox + ow - pad - monoWidth(run, fs), oy + pad + fs, run, fs, "var(--muted)", true);
      var outputCut = oc < output.length || run !== T.run;
      output.slice(0, oc).forEach(function(s, i){
        var txt = cut(s.replace(/\t/g, "    "), ow - 2 * pad, fs);
        if (i === oc - 1 && oc < output.length) txt = cut(txt + "…", ow - 2 * pad, fs);
        if (txt !== s) outputCut = true;
        self.label(self.outputLayer, ox + pad, oy + header + fs + i * row, txt, fs, "var(--fg)", true);
      });
      if (outputCut) ctx.report("layout", "[code] output exceeds eight lines or panel width/height; showing what fits with …");
    }
    this.svg.setAttribute("style", "overflow:hidden");
  }
  // 表示する範囲：k ≤ 1 は先頭、説明のステップはその説明の範囲、最後の状態は最後の説明の範囲
  windowAt(k){ var n = this.windows.length; return k <= 1 || !n ? this.window0 : this.windows[Math.min(k - 2, n - 1)]; }
  renderFit(k, t, ctx){
    ctx = ctx || {};
    var self = this, P = this.props, G = this.fitGeo, preview = ctx.preview || ctx.mode === "lecture", faint = preview ? base.previewOpacity(this) : 0;
    var phase = function(step){ return k > step ? 1 : k < step ? faint : base.prog(t, 0, P.dur); };
    set(this.codeLayer, "opacity", phase(1));
    var nNotes = this.notes.length, final = k > this.steps || k === this.steps && t >= P.dur, active = !final && k >= 2 && k <= nNotes + 1 ? k - 2 : -1;
    var w1 = this.windowAt(k), w0 = this.windowAt(k - 1), e = base.prog(t, 0, P.dur), moving = w0.f !== w1.f || w0.l !== w1.l;
    var w = moving && e < 0.5 ? w0 : w1, fade = moving ? (e < 0.5 ? 1 - 2 * e : 2 * e - 1) : 1;
    var slotY = function(r){ return G.firstY + (r - w.f + (w.top ? 1 : 0)) * G.row; };
    var lit = active >= 0 ? this.stepLines[active] : [];
    this.vrows.forEach(function(o, r){
      var vis = r >= w.f && r <= w.l, y = vis ? slotY(r) : G.firstY;
      set(o.num, "y", y); set(o.text, "y", y);
      set(o.num, "opacity", vis ? fade.toFixed(3) : 0); set(o.text, "opacity", vis ? fade.toFixed(3) : 0);
      set(o.num, "style", "font-family:" + MONO + ";white-space:pre;fill:var(--" + (lit.indexOf(o.line) >= 0 ? "emph" : "muted") + ")");
    });
    // 隠れた行の数（折り返しの続きは数えない、元の行の数）
    var vr = this.vrows, linesIn = function(a, b){ var seen = {}; for (var r = a; r <= b; r++) if (vr[r]) seen[vr[r].line] = 1; return Object.keys(seen).length; };
    var more = function(n){ return self.ja ? "⋮（ほか " + n + " 行）" : "⋮ (" + n + " more line" + (n === 1 ? "" : "s") + ")"; };
    var hiddenTop = w.top ? linesIn(0, w.f - 1) - (vr[w.f] && vr[w.f].cont && vr[w.f - 1] && vr[w.f - 1].line === vr[w.f].line ? 1 : 0) : 0, hiddenBottom = w.bottom ? linesIn(w.l + 1, vr.length - 1) : 0;
    this.markTop.textContent = w.top ? more(Math.max(1, hiddenTop)) : ""; set(this.markTop, "y", G.firstY); set(this.markTop, "opacity", w.top ? fade.toFixed(3) : 0);
    this.markBottom.textContent = w.bottom ? more(Math.max(1, hiddenBottom)) : ""; set(this.markBottom, "y", slotY(w.l + 1)); set(this.markBottom, "opacity", w.bottom ? fade.toFixed(3) : 0);
    this.fitBands.forEach(function(bg, j){
      var rows = self.vrows.map(function(o, r){ return self.stepLines[j].indexOf(o.line) >= 0 ? r : -1; }).filter(function(r){ return r >= 0; });
      self.fitBandRects[j].forEach(function(rect, i){ var r = rows[i], vis = r !== undefined && r >= w.f && r <= w.l; set(rect, "y", vis ? slotY(r) - G.firstY + G.header : G.header); set(rect, "opacity", vis ? 1 : 0); });
      set(bg, "opacity", j === active ? (moving ? Math.max(0, 2 * e - 1) : e).toFixed(3) : 0);
    });
    this.notes.forEach(function(n, i){
      set(n.g, "opacity", !final && i === active ? phase(i + 2) : !final && active < 0 && k > nNotes + 1 && i === nNotes - 1 ? 1 : 0);
    });
    set(this.finalNotes, "opacity", final ? 1 : k < 2 ? faint : 0);
    set(this.outputLayer, "opacity", phase(nNotes + 2));
  }
  render(k, t, ctx){
    if (!this.codeLayer) return;
    if (this.fit) return this.renderFit(k, t, ctx);
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
