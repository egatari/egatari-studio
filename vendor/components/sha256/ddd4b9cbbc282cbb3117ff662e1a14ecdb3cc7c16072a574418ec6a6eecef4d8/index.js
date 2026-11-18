// code-core 1.0.0: shared code drawing for m-code and m-trace (a library part, Egatari spec §6.1). Pure functions of their
// arguments except wrap, which measures prose with base.textWidth. No DOM is created here and no state is kept.
// Moved verbatim from m-code 2.1.0 (lines, monoWidth, cut, the colour roles of KEYWORDS / dialect / spans, wrap) so that m-code
// 2.2.0 draws the same pixels; new in 1.0.0: softWrap (visual rows of a long code line) and windowFor (the lines a moving
// window shows for a step).
//   returns {MONO, set, lines, monoWidth, cut, dialect, spans, wrap, softWrap, windowFor}
egatariParts.define({name: "code-core", version: "1.0.0", requires: {base: "1.2.0"}}, function(deps){
"use strict";
var base = deps.base, MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
function set(e, a, v){ e.setAttribute(a, String(v)); }
function lines(s){ return s.replace(/\r\n?/g, "\n").split("\n"); }
function monoWidth(s, fs){ return [...s].reduce(function(w, ch){ return w + (/[\u0000-\u024f]/.test(ch) ? 0.6 : 1); }, 0) * fs; }
function cut(s, w, fs){
  if (monoWidth(s, fs) <= w) return s;
  var ch = [...s];
  while (ch.length && monoWidth(ch.join("") + "…", fs) > w) ch.pop();
  return w >= fs ? ch.join("") + "…" : "";
}
// Colour roles for code: keywords term, strings accent2, comments muted (theme roles only; the text stays readable without colour).
var KEYWORDS = {
  python: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield",
  js: "async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return super switch this throw true try typeof undefined var void while yield",
  r: "if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA return",
  shell: "if then else elif fi case esac for while until do done in function return export local"
};
function dialect(lang){ return lang === "javascript" ? "js" : lang === "sh" || lang === "bash" ? "shell" : KEYWORDS[lang] ? lang : ""; }
// Split each line into [start, end, role] spans: strings (also across lines for Python triple quotes / JS templates),
// line comments outside strings, keywords outside both. Unknown languages give no spans.
function spans(program, lang){
  var L = dialect(lang), kw = L ? new Set(KEYWORDS[L].split(" ")) : null, quote = "", triple = false;
  return program.map(function(s){
    var out = [], from = quote ? 0 : -1;
    if (!L) return out;
    for (var i = 0; i < s.length; i++){
      var c = s[i];
      if (quote){
        if (c === "\\"){ i++; continue; }
        if (c === quote && (!triple || s.slice(i, i + 3) === quote.repeat(3))){ i += triple ? 2 : 0; out.push([from, i + 1, "accent2"]); quote = ""; triple = false; }
      } else if (c === '"' || c === "'" || L === "js" && c === "`"){
        from = i; quote = c; triple = L === "python" && s.slice(i, i + 3) === c.repeat(3); if (triple) i += 2;
      } else if (L !== "js" && c === "#" && (L !== "shell" || i === 0 || /\s/.test(s[i - 1])) || L === "js" && s.slice(i, i + 2) === "//"){
        out.push([i, s.length, "muted"]); return out;
      } else if (/[A-Za-z_]/.test(c) && (i === 0 || !/[\w.$]/.test(s[i - 1]))){
        var m = /^[A-Za-z_]\w*/.exec(s.slice(i))[0];
        if (kw.has(m)) out.push([i, i + m.length, "term"]);
        i += m.length - 1;
      }
    }
    if (quote){ out.push([from, s.length, "accent2"]); if (!triple && quote !== "`") quote = ""; }
    return out;
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
// Visual rows of one code line (tabs already expanded) that fit `width` px at `fs` px: break after the last space, comma or
// opening bracket that fits, else at the width. → [{from, to}] character offsets into the line (code points), at least one row.
function softWrap(s, width, fs){
  var ch = [...s], out = [], from = 0;
  if (!ch.length) return [{from: 0, to: 0}];
  while (from < ch.length){
    var n = 0;
    while (from + n < ch.length && monoWidth(ch.slice(from, from + n + 1).join(""), fs) <= width) n++;
    n = Math.max(1, n);
    if (from + n < ch.length){
      for (var k = n; k > Math.floor(n / 3); k--){ if (/[ ,([{]/.test(ch[from + k - 1])){ n = k; break; } }
    }
    out.push({from: from, to: from + n}); from += n;
  }
  return out;
}
// The rows a moving window of `slots` rows shows so that rows ra..rb are visible, centred where possible. A hidden part
// above or below costs one row for its "⋮" marker. → {f, l, top, bottom, fits}: rows f..l are shown; top / bottom are true when
// a marker sits above / below them; fits is false when ra..rb is taller than the window (then the window starts at ra).
function windowFor(n, slots, ra, rb){
  if (n <= slots) return {f: 0, l: n - 1, top: false, bottom: false, fits: true};
  var best = null;
  for (var f = 0; f < n; f++){
    var top = f > 0, room = slots - (top ? 1 : 0), l = f + room - 1, bottom = l < n - 1;
    if (bottom) l -= 1;
    if (l >= n - 1){ l = n - 1; bottom = false; }
    if (l < f) continue;
    // まず表示する範囲を埋める（空いた行が少ない方）、次に中心が近い方
    var unused = slots - (top ? 1 : 0) - (bottom ? 1 : 0) - (l - f + 1), fits = ra >= f && rb <= l, score = unused * 1000 + Math.abs((f + l) / 2 - (ra + rb) / 2);
    if (fits && (!best || score < best.score - 1e-9)) best = {f: f, l: l, top: top, bottom: bottom, fits: true, score: score};
  }
  if (best){ delete best.score; return best; }
  var f2 = Math.max(0, Math.min(ra, n - 1)), top2 = f2 > 0, l2 = Math.min(n - 1, f2 + slots - (top2 ? 1 : 0) - 1), bottom2 = l2 < n - 1;
  if (bottom2) l2 -= 1;
  return {f: f2, l: Math.max(f2, l2), top: top2, bottom: bottom2, fits: false};
}
return {MONO: MONO, set: set, lines: lines, monoWidth: monoWidth, cut: cut, dialect: dialect, spans: spans, wrap: wrap, softWrap: softWrap, windowFor: windowFor};
});
