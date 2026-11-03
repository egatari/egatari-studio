// m-numberline：数直線。目盛り・点・□・ジャンプ（たし算・正負の数）・範囲（不等式）・拡大（0.1 の目盛り）。2 本なら比例数直線
// <m-numberline style="height:360px">
//   <script type="application/json">{"lines": [{"from": 0, "to": 10, "step": 1}], "marks": [{"at": 3}], "jumps": [{"from": 3, "to": 7, "label": "+4"}]}
// （JSON の終わり）</m-numberline>
// 値は数か分数の文字（"1/3"、"-2/5"）。分数の目盛り・名前は縦に積んだ分数で書く。負の数はマイナス記号（−）で書く
// 段階：build（既定 "ticks,marks,links,jumps,ranges,magnify"）の順に、目盛り（全部の線）→ 項目を 1 つずつ。項目の show で段階を指定できる。
//       build="whole" は全部を 1 段階で
// 2 本の線：0 の位置をそろえ、上の線の数は上、下の線の数は下に書く。link は 2 本の線の対応する値を結ぶ（label があれば矢印）
// 拡大（magnify）：線の区間を下に引いた長い線に広げる（既定は 10 等分）。2 つ目からは前の拡大の線を広げる。線が 1 本のときだけ
// 見せ方（docs/conventions.md §1）：fade（フェード、既定）・draw（線・弧・範囲の線を引き、目盛りは左から）。拡大の動きはどちらも同じ
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// データや大きさの問題は ctx.report で知らせる（1.x の console.warn の代わり）。幾何はテストのために static testing.geom（部品は読まない）
egatariParts.define({name: "numberline", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-numberline"}, function(deps){
"use strict";
var base = deps.base;
// 形の要素ごとに、書き直すと形が作り直される属性（render の終わりで使う）
var SHAPE_GEOM = {rect: "width", circle: "r", ellipse: "rx", path: "d", line: "x1", polyline: "points", polygon: "points"};
// ---- 数直線の幾何（tools/test-numberline.mjs が試す。クラスの static testing.geom） ----
var NL = (function(){
  function gcd(a, b){ a = Math.abs(a); b = Math.abs(b); while (b){ var t = a % b; a = b; b = t; } return a || 1; }
  function R(n, d){ if (d < 0){ n = -n; d = -d; } var g = gcd(n, d); return {n: n / g, d: d / g}; }
  // 数・"1/3"・"-2/5"・"−1.5"・"0.25" を有理数 {n, d} に。読めなければ null
  function parse(v){
    var s;
    if (typeof v === "number"){ if (!isFinite(v)) return null; s = String(v); if (/e/i.test(s)) s = v.toFixed(12).replace(/0+$/, "").replace(/\.$/, ""); }
    else if (typeof v === "string") s = v.trim().replace(/^[−–]/, "-");
    else return null;
    var m = s.match(/^([+-]?)(\d+)\/(\d+)$/);
    if (m){ if (+m[3] === 0) return null; return R((m[1] === "-" ? -1 : 1) * +m[2], +m[3]); }
    m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!m) return null;
    var dg = m[3] ? m[3].length : 0, p = Math.pow(10, dg);
    return R((m[1] === "-" ? -1 : 1) * (+m[2] * p + (dg ? +m[3] : 0)), p);
  }
  function isFrac(v){ return typeof v === "string" && /\//.test(v); }
  function decs(v){ if (typeof v === "number"){ var s = String(v), m = s.match(/\.(\d+)$/); return m ? m[1].length : 0; } var m2 = String(v).match(/\.(\d+)$/); return m2 ? m2[1].length : 0; }
  function add(a, b){ return R(a.n * b.d + b.n * a.d, a.d * b.d); }
  function sub(a, b){ return R(a.n * b.d - b.n * a.d, a.d * b.d); }
  function mul(a, k){ return R(a.n * k, a.d); }
  function div(a, b){ return R(a.n * b.d, a.d * b.n); }
  function cmp(a, b){ return a.n * b.d - b.n * a.d; }
  function val(a){ return a.n / a.d; }
  function lcm(a, b){ return a / gcd(a, b) * b; }
  var MINUS = "−";
  // 線の目盛り：[{r, v, major, label}]。分数の線（from・to・step のどれかが "a/b"）は分母をそろえた分数で（整数は整数で）、
  // 小数の線は from・step の桁で書く
  function ticks(line){
    var f = parse(line.from), t = parse(line.to), s = line.step === undefined ? null : parse(line.step);
    if (!f || !t) throw new Error("m-numberline: a line needs from and to as numbers or fractions like \"1/3\"");
    if (cmp(t, f) <= 0) throw new Error("m-numberline: a line's to must be larger than its from");
    if (!s){ var span = val(sub(t, f)); s = parse(nice(span / 10)); }
    if (s.n <= 0) throw new Error("m-numberline: step must be positive");
    var n = Math.floor(val(div(sub(t, f), s)) + 1e-9);
    if (n > 400) throw new Error("m-numberline: too many ticks (" + n + "); use a larger step");
    var frac = isFrac(line.from) || isFrac(line.to) || isFrac(line.step), den = frac ? lcm(s.d, f.d) : 1;
    var dg = Math.max(decs(line.from), decs(line.step === undefined ? fmtNum(val(s)) : line.step));
    var out = [], sb = Math.max(0, Math.floor(+line.sub || 0));
    for (var i = 0; i <= n; i++){
      var r = add(f, mul(s, i));
      out.push({r: r, v: val(r), major: true, i: i, label: frac ? fracLabel(r, den) : fmtDec(val(r), dg)});
      if (sb > 1 && i < n) for (var j = 1; j < sb; j++){
        var q = add(f, R(s.n * (i * sb + j), s.d * sb));
        if (cmp(q, t) > 0) break;
        out.push({r: q, v: val(q), major: false, half: sb % 2 === 0 && j === sb / 2, label: null});
      }
    }
    return out;
  }
  function nice(x){ var e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; }
  function fmtNum(x){ return String(+x.toFixed(10)); }
  // 小数：桁 dg で丸め、終わりの 0 は落とす（0、0.1、…、1）
  function fmtDec(x, dg){ var s = Math.abs(x).toFixed(dg); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return (x < 0 && +s !== 0 ? MINUS : "") + s; }
  // 分母 den にそろえた分数の名前（"2/3"、"−1/4"）。整数は整数のまま
  function fracLabel(r, den){
    if (r.d === 1) return (r.n < 0 ? MINUS : "") + Math.abs(r.n);
    var k = den % r.d === 0 ? den / r.d : 1, d = r.d * k, n = r.n * k;
    return (n < 0 ? MINUS : "") + Math.abs(n) + "/" + d;
  }
  // 名前を字と分数に分ける：[{t: "字"} | {num, den}]。ハイフンのマイナス（-3、x > -2）はマイナス記号に
  function split(str){
    var s = String(str).replace(/(^|[\s(（=＝<>≦≧≤≥+×÷,、])-(?=[\d.\/])/g, "$1" + MINUS), out = [], re = /(\d+)\/(\d+)/g, m, last = 0;
    while ((m = re.exec(s))){
      if (m.index > last) out.push({t: s.slice(last, m.index)});
      out.push({num: m[1], den: m[2]});
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({t: s.slice(last)});
    return out;
  }
  // 字の幅の見積もり（フォントを待たない）
  function est(s, size){
    return [...String(s).replace(/\*/g, "")].reduce(function(a, c){ return a + (c === MINUS ? 0.62 : c === " " ? 0.3 : /[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size;
  }
  var GAP = 4;
  function segW(g, size){ return g.t !== undefined ? est(g.t, size) : Math.max(est(g.num, size), est(g.den, size)) + 10; }
  function width(str, size){ var sg = split(str); return sg.reduce(function(a, g){ return a + segW(g, size); }, 0) + GAP * Math.max(0, sg.length - 1); }
  function hasFrac(str){ return str !== null && str !== undefined && split(str).some(function(g){ return g.num !== undefined; }); }
  // 名前を間引く：items は [{i, x, w, keep}]（x は名前の中心、w は幅）。keep の名前（線の端・labels に書いた値）は必ず残し、
  // 間引くのは部品が作った目盛りの名前だけ。avoid（□ の印など作る人の書いたもの）[{x, w}] と keep の名前に 12 px より近い名前は落とし、
  // 残りが隣と 12 px あく間隔 m（1, 2, 5, 10, …）おきにする。残す名前を x の順に返す
  function pick(items, avoid){
    var near = function(a, b){ return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 12; };
    var fixed = items.filter(function(o){ return o.keep; }), gen = items.filter(function(o){ return !o.keep; }), block = fixed.concat(avoid || []);
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500], cand = [];
    for (var a = 0; a < steps.length; a++){
      var m = steps[a];
      cand = gen.filter(function(o){ return o.i % m === 0 && !block.some(function(b){ return near(o, b); }); });
      var ok = true;
      for (var b = 1; b < cand.length; b++) if (near(cand[b], cand[b - 1])){ ok = false; break; }
      if (ok) break;
    }
    return fixed.concat(cand).sort(function(p, q){ return p.x - q.x; });
  }
  // 線を横に置く：x0..x1 の中に、0 の位置をそろえて（2 本とも 0 を含むとき）。[{a, b, x(v)}]
  function spans(lines, x0, x1){
    var L = x1 - x0, rs = lines.map(function(l){ return [val(parse(l.from)), val(parse(l.to))]; });
    var with0 = rs.length > 1 && rs.every(function(r){ return r[0] <= 0 && r[1] >= 0; });
    if (!with0) return rs.map(function(r){ var s = L / (r[1] - r[0]); return {a: x0, b: x1, z: null, x: function(v){ return x0 + (v - r[0]) * s; }}; });
    var fz = Math.max.apply(null, rs.map(function(r){ return -r[0] / (r[1] - r[0]); })), Z = x0 + L * fz;
    return rs.map(function(r){
      var s = Math.min(r[0] < 0 ? (Z - x0) / -r[0] : Infinity, r[1] > 0 ? (x1 - Z) / r[1] : Infinity);
      return {a: Z + r[0] * s, b: Z + r[1] * s, z: Z, x: function(v){ return Z + v * s; }};
    });
  }
  // 弧（xa から xb、高さ h：tools/test-numberline.mjs の弧と同じ形）の、x が lo..hi の間の一番低い高さ（その範囲に弧がなければ Infinity）
  function arcAt(xa, xb, h, lo, hi){
    var dx = xb - xa, c1 = xa + dx * 0.12, c2 = xb - dx * 0.12, best = Infinity;
    for (var i = 0; i <= 100; i++){
      var t = i / 100, u = 1 - t, x = u * u * u * xa + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * xb, y = 3 * u * t * (u + t) * h * 4 / 3;
      if (x >= lo && x <= hi) best = Math.min(best, y);
    }
    return best;
  }
  // 重なる区間を別の高さに：[{lo, hi}]（端は ±Infinity も可）。order の順に、重なる区間のない一番低い段へ。段の配列を返す
  function levels(iv, order){
    var lv = iv.map(function(){ return -1; });
    (order || iv.map(function(_, i){ return i; })).forEach(function(i){
      var used = {};
      iv.forEach(function(o, j){ if (j !== i && lv[j] >= 0 && iv[i].lo < o.hi && o.lo < iv[i].hi) used[lv[j]] = 1; });
      var l = 0; while (used[l]) l++;
      lv[i] = l;
    });
    return lv;
  }
  // 範囲の共通部分：[{lo, hi, incl: [a, b]}] → {lo, hi, incl} か null（共通部分がない・1 点だけで端を含まない）
  function shared(rs){
    if (rs.length < 2) return null;
    var lo = -Infinity, hi = Infinity, il = false, ih = false;
    rs.forEach(function(r){
      if (r.lo > lo){ lo = r.lo; il = r.incl[0]; } else if (r.lo === lo && lo > -Infinity) il = il && r.incl[0];
      if (r.hi < hi){ hi = r.hi; ih = r.incl[1]; } else if (r.hi === hi && hi < Infinity) ih = ih && r.incl[1];
    });
    if (lo > hi || (lo === hi && !(il && ih))) return null;
    return {lo: lo, hi: hi, incl: [il, ih]};
  }
  return {R: R, sub: sub, div: div, isFrac: isFrac, parse: parse, val: val, cmp: cmp, ticks: ticks, fracLabel: fracLabel, fmtDec: fmtDec, split: split, est: est, width: width,
          hasFrac: hasFrac, pick: pick, arcAt: arcAt, spans: spans, levels: levels, shared: shared, MINUS: MINUS};
})();
var TONES = /^(term|emph|muted|accent2|fg|series-[1-4])$/;
var toneOf = function(c, d){ return TONES.test(c || "") ? "var(--" + c + ")" : d; };
var num = {type: ["number", "string"]};
return class extends base.MotionElement {
  static partName = "numberline";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "draw"];
  static testing = {geom: NL};   // for tools/test-numberline.mjs only (no part reads it)
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["lines"], properties: {
      lines: {type: "array", minItems: 1, maxItems: 2, items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: num, to: num, step: num, sub: {type: "integer"}, unit: {type: "string"}, label: {type: "string"}, labels: {type: ["string", "array"]}}}},
      marks: {type: "array", items: {type: "object", additionalProperties: false, required: ["at"], properties: {
        at: num, line: {type: "integer"}, label: {type: "string"}, kind: {type: "string", enum: ["dot", "open", "box"]}, tone: {type: "string"}, show: {type: "integer"}}}},
      jumps: {type: "array", items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: num, to: num, line: {type: "integer"}, label: {type: "string"}, tone: {type: "string"}, show: {type: "integer"}}}},
      ranges: {type: "array", items: {type: "object", additionalProperties: false, anyOf: [{required: ["from"]}, {required: ["to"]}], properties: {
        from: num, to: num, incl: {type: "array", minItems: 2, maxItems: 2, items: {type: "boolean"}}, line: {type: "integer"}, label: {type: "string"}, tone: {type: "string"}, show: {type: "integer"}}}},
      link: {type: "array", items: {type: ["array", "object"]}},
      magnify: {type: "array", items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: num, to: num, step: num, labels: {type: ["string", "array"]}, show: {type: "integer"}}}}}},
    example: {lines: [{from: 0, to: 10, step: 1}], marks: [{at: 3}], jumps: [{from: 3, to: 7, label: "+4"}]},
    note: {en: "lines [{from, to, step, sub, unit, label, labels}] (1 or 2); marks [{at, kind: dot|open|box, label}]; jumps [{from, to, label}]; ranges [{from, to, incl: [bool, bool]}]; link [[top value, bottom value]]; magnify [{from, to, step}]. Values are numbers or \"1/3\"",
           ja: "lines [{from, to, step, sub, unit, label, labels}]（1 本か 2 本）、marks [{at, kind: dot|open|box, label}]、jumps [{from, to, label}]、ranges [{from, to, incl: [真偽, 真偽]}]、link [[上の値, 下の値]]、magnify [{from, to, step}]。値は数か \"1/3\""},
  };
  static props = {
    build: {type: "string", default: "ticks,marks,links,jumps,ranges,magnify", doc: "出す順（種類をコンマで）か whole（全部を 1 段階で）"},
    arrow: {type: "string", default: "off", doc: "on：線の右の端を矢印に"},
    dur:   {type: "number", default: 0.8, doc: "1 段階の動きの秒数（拡大はその 2 倍）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // 項目と段階（mount の前にも steps と duration が要るので、データと属性だけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, notes = [], G = NL;
    var lines = d.lines.map(function(l, i){ return {i: i, src: l, ticks: G.ticks(l), lo: G.val(G.parse(l.from)), hi: G.val(G.parse(l.to))}; });
    var L = lines.length, NM = L === 1 && d.magnify ? d.magnify.length : 0;   // 線が 1 本なら、拡大の線も line 1, 2, … で指せる
    var pos = function(v, what){ var r = G.parse(v); if (!r) throw new Error("m-numberline: " + what + " " + JSON.stringify(v) + " is not a number or a fraction like \"1/3\""); return G.val(r); };
    var lineOf = function(o, what){
      var li = o.line === undefined ? 0 : o.line;
      if (li < 0 || li >= L + (what === "mark" ? NM : 0)){ notes.push("[numberline] " + what + " line " + li + " does not exist (line 0 is used)"); li = 0; }
      return li;
    };
    var inside = function(li, v, what){ if (li >= L) return; if (v < lines[li].lo - 1e-9 || v > lines[li].hi + 1e-9) notes.push("[numberline] " + what + " " + v + " is outside its line (" + lines[li].lo + " to " + lines[li].hi + ")"); };
    var marks = (d.marks || []).map(function(o){ var li = lineOf(o, "mark"), v = pos(o.at, "mark at"); inside(li, v, "mark at"); return {o: o, li: li, v: v, kind: o.kind || "dot"}; });
    var jumps = (d.jumps || []).map(function(o){ var li = lineOf(o, "jump"), a = pos(o.from, "jump from"), b = pos(o.to, "jump to"); inside(li, a, "jump from"); inside(li, b, "jump to"); return {o: o, li: li, a: a, b: b}; });
    var ranges = (d.ranges || []).map(function(o){
      var li = lineOf(o, "range"), lo = o.from === undefined || o.from === null ? -Infinity : pos(o.from, "range from"), hi = o.to === undefined || o.to === null ? Infinity : pos(o.to, "range to");
      if (lo > hi) throw new Error("m-numberline: a range's from must not be larger than its to");
      return {o: o, li: li, lo: lo, hi: hi, incl: o.incl || [true, true]};
    });
    var links = (d.link || []).map(function(o){
      var at = Array.isArray(o) ? o : o.at;
      if (!Array.isArray(at) || at.length !== 2) throw new Error("m-numberline: a link is [top value, bottom value] or {at: [top, bottom], label}");
      return {o: Array.isArray(o) ? {} : o, a: pos(at[0], "link"), b: pos(at[1], "link")};
    });
    if (links.length && L < 2){ notes.push("[numberline] link needs 2 lines (ignored)"); links = []; }
    var mags = (d.magnify || []).map(function(o){ return {o: o, a: pos(o.from, "magnify from"), b: pos(o.to, "magnify to")}; });
    if (mags.length && L > 1){ notes.push("[numberline] magnify works with 1 line (ignored)"); mags = []; }
    mags.forEach(function(m, j){
      var src = j ? mags[j - 1] : lines[0];
      if (m.b <= m.a) throw new Error("m-numberline: magnify needs from < to");
      var lo = j ? src.a : src.lo, hi = j ? src.b : src.hi;
      if (m.a < lo - 1e-9 || m.b > hi + 1e-9) notes.push("[numberline] magnify " + m.a + " to " + m.b + " is outside the line it magnifies");
      var t = m.o.step;
      if (t === undefined){ var q = G.div(G.sub(G.parse(m.o.to), G.parse(m.o.from)), G.R(10, 1)); t = G.isFrac(m.o.from) || G.isFrac(m.o.to) ? q.n + "/" + q.d : +G.val(q).toFixed(10); }
      m.ticks = G.ticks({from: m.o.from, to: m.o.to, step: t});
      m.labels = m.o.labels;
    });
    // 段階
    var cats = {ticks: [{}], marks: marks, links: links, jumps: jumps, ranges: ranges, magnify: mags}, order;
    var whole = P.build === "whole";
    if (!whole){
      order = String(P.build).split(",").map(function(s){ return s.trim(); }).filter(Boolean);
      var bad = order.filter(function(c){ return !cats[c]; });
      if (bad.length) notes.push('[numberline] build has unknown names ' + bad.join(", ") + " (use ticks, marks, links, jumps, ranges, magnify or whole)");
      order = order.filter(function(c){ return cats[c]; });
      ["ticks", "marks", "links", "jumps", "ranges", "magnify"].forEach(function(c){ if (order.indexOf(c) < 0) order.push(c); });
    } else order = ["ticks", "marks", "links", "jumps", "ranges", "magnify"];
    var k = 0, tickStep = 1;
    order.forEach(function(c){
      cats[c].forEach(function(it){
        var sh = it.o && Number.isInteger(it.o.show) && it.o.show >= 1 ? it.o.show : null;
        if (whole) it.st = sh || 1;
        else if (sh) it.st = sh;
        else it.st = ++k;
        if (c === "ticks") tickStep = it.st;
      });
    });
    var steps = Math.max.apply(null, [1, tickStep].concat([marks, links, jumps, ranges, mags].map(function(a){ return Math.max.apply(null, [0].concat(a.map(function(x){ return x.st; }))); })));
    return (this._plan = {lines: lines, marks: marks, jumps: jumps, ranges: ranges, links: links, mags: mags, tickStep: tickStep, steps: steps, notes: notes});
  }
  duration(k){
    var pl = this.plan(), dur = this.props.dur, out = 0;
    if (k < 1 || k > pl.steps) return 0;
    if (pl.tickStep === k) out = dur;
    [pl.marks, pl.links, pl.jumps, pl.ranges].forEach(function(a){ a.forEach(function(x){ if (x.st === k) out = Math.max(out, dur); }); });
    pl.mags.forEach(function(m){ if (m.st === k) out = Math.max(out, dur * 2); });
    return out;
  }
  mount(ctx){
    var P = this.props, D = base, G = NL, self = this, pl = this.plan();
    this.variant = base.variant(this);
    pl.notes.forEach(function(n){ ctx.report("data", n); });
    if (P.arrow !== "on" && P.arrow !== "off") ctx.report("attr", '[numberline] arrow="' + P.arrow + '" is not on or off');
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight, L = pl.lines.length, dur = P.dur, arrow = P.arrow === "on";
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var items = this.items = [];
    var add = function(el, o){ o.el = el; items.push(o); return el; };
    var FS = 24, ROW = 34, FROW = 68, OVER = 14;
    var rowH = function(labels){ return labels.some(function(s){ return G.hasFrac(s); }) ? FROW : ROW; };
    // 名前を書く（字と縦に積んだ分数）。top は行の上端、frac はその行が分数の行か
    var lab = function(par, x, top, str, o){
      o = o || {};
      var g = D.el("g", {}, par), size = o.size || FS, fill = o.fill || "var(--fg)", segs = G.split(str), base = top + (o.frac ? 42 : 25), bar = base - 8;
      var w = G.width(str, size), x0 = o.anchor === "start" ? x : o.anchor === "end" ? x - w : x - w / 2;
      var attrs = {"font-size": size, fill: fill};
      if (o.weight) attrs["font-weight"] = o.weight;
      if (segs.length === 1 && segs[0].t !== undefined){
        D.mtext(g, x, base, segs[0].t, Object.assign({"text-anchor": o.anchor || "middle"}, attrs));
        return g;
      }
      segs.forEach(function(sg){
        var sw = sg.t !== undefined ? G.est(sg.t, size) : Math.max(G.est(sg.num, size), G.est(sg.den, size)) + 10;
        if (sg.t !== undefined){ if (sg.t.trim()) D.mtext(g, x0 + sw / 2, base, sg.t.trim(), Object.assign({"text-anchor": "middle"}, attrs)); }
        else {
          D.el("text", Object.assign({x: (x0 + sw / 2).toFixed(1), y: (bar - 7).toFixed(1), "text-anchor": "middle"}, attrs), g).textContent = sg.num;
          D.el("line", {x1: (x0 + 2).toFixed(1), x2: (x0 + sw - 2).toFixed(1), y1: bar.toFixed(1), y2: bar.toFixed(1), stroke: fill, "stroke-width": 2}, g);
          D.el("text", Object.assign({x: (x0 + sw / 2).toFixed(1), y: (bar + 27).toFixed(1), "text-anchor": "middle"}, attrs), g).textContent = sg.den;
        }
        x0 += sw + 4;
      });
      return g;
    };
    var arrowHead = function(par, x, y, ang, col){
      var a = 14, b = 7, c = Math.cos(ang), s = Math.sin(ang);
      var p = function(dx, dy){ return (x + dx * c - dy * s).toFixed(1) + "," + (y + dx * s + dy * c).toFixed(1); };
      return D.el("path", {d: "M" + p(0, 0) + "L" + p(-a, -b) + "L" + p(-a, b) + "Z", fill: col}, par);
    };
    // ---- 横の置き場所：線の名前（左）と単位（右）、端の目盛りの名前の半分 ----
    var labW = Math.max.apply(null, [0].concat(pl.lines.map(function(l){ return l.src.label ? G.est(l.src.label, 26) : 0; })));
    var unitW = Math.max.apply(null, [0].concat(pl.lines.map(function(l){ return l.src.unit ? G.width(l.src.unit, FS) : 0; })));
    var endW = function(l, first){ var tk = l.ticks.filter(function(t){ return t.major; }); var t = first ? tk[0] : tk[tk.length - 1]; return t ? G.width(t.label, FS) / 2 : 0; };
    var mL = Math.max(labW ? labW + OVER + 18 : 0, Math.max.apply(null, pl.lines.map(function(l){ return endW(l, true); })) + 6, OVER + 6);
    var mR = Math.max(unitW ? unitW + OVER + (arrow ? 30 : 10) : 0, Math.max.apply(null, pl.lines.map(function(l){ return endW(l, false); })) + 6, OVER + (arrow ? 26 : 6));
    pl.mags.forEach(function(m){ var tk = m.ticks; mL = Math.max(mL, G.width(tk[0].label, FS) / 2 + 6); mR = Math.max(mR, G.width(tk[tk.length - 1].label, FS) / 2 + 6); });
    var x0 = mL, x1 = W - mR, SP = G.spans(pl.lines.map(function(l){ return l.src; }), x0, x1);
    if (L > 1 && SP[0].z === null) ctx.report("data", "[numberline] the 2 lines are not aligned at 0 (one of them does not contain 0)");
    // ---- 目盛りの名前（間引き）と、□ の印が隠す名前 ----
    var pickLabels = function(l, X, boxes){
      var spec = l.src ? l.src.labels : l.labels, tk = l.ticks.filter(function(t){ return t.major; });
      tk.forEach(function(t){ t.x = X(t.v); t.w = G.width(t.label, FS); });
      // □ の印のある値の名前は □ に替わる（□ が答えの数の場所）
      tk = tk.filter(function(t){ return !boxes.some(function(b){ return Math.abs(b.m.v - t.v) < 1e-9; }); });
      tk.forEach(function(t){ t.keep = false; });
      var last = tk.length - 1;
      if (spec === "none") return [];
      if (spec === "ends") return tk.filter(function(t, i){ return i === 0 || i === last; });
      if (Array.isArray(spec)){
        var want = spec.map(function(v){ var r = G.parse(v); if (!r) ctx.report("data", "[numberline] labels value " + JSON.stringify(v) + " is not a number"); return r ? G.val(r) : NaN; });
        var shown = tk.filter(function(t){ return want.some(function(v){ return Math.abs(v - t.v) < 1e-9; }); });
        if (shown.length < want.filter(isFinite).length) ctx.report("data", "[numberline] some labels values are not on a tick of the line");
        return shown;
      }
      if (spec !== undefined && spec !== "all") ctx.report("data", '[numberline] labels="' + spec + '" is not all, ends, none or a list of values');
      // 線の端は必ず書く。間引くのはその間の目盛りの名前だけ（□ の印に近い名前も落とす）
      tk.forEach(function(t, i){ t.keep = i === 0 || i === last; });
      return G.pick(tk, boxes);
    };
    // ---- 縦の置き場所 ----
    var Lx = pl.lines.map(function(l, li){
      var o = {l: l, li: li, X: SP[li].x, a: SP[li].a, b: SP[li].b};
      o.side = L === 1 ? 1 : (li === 0 ? -1 : 1);            // 目盛りの名前の側（1：下、−1：上）
      o.marks = pl.marks.filter(function(m){ return m.li === li; });
      o.jumps = pl.jumps.filter(function(j){ return j.li === li; });
      o.ranges = pl.ranges.filter(function(r){ return r.li === li; });
      o.boxes = o.marks.filter(function(m){ return m.kind === "box"; }).map(function(m){ var w = Math.max(40, m.o.label ? G.width(m.o.label, FS) + 16 : 40); return {m: m, x: o.X(m.v), w: w}; });
      o.shown = pickLabels(l, o.X, o.boxes);
      o.tickH = Math.max(rowH(o.shown.map(function(t){ return t.label; })), o.boxes.length ? 46 : 0, o.boxes.some(function(b){ return G.hasFrac(b.m.o.label); }) ? FROW : 0);
      var named = o.marks.filter(function(m){ return m.kind !== "box" && m.o.label; });
      o.markH = named.length ? rowH(named.map(function(m){ return m.o.label; })) : 0;
      // 点の名前：線が 1 本で、上にジャンプも範囲もなければ線のすぐ上。ほかは目盛りの名前の外側
      o.markUp = L === 1 && !o.jumps.length && !o.ranges.length;
      // ジャンプ：短い弧から段を決める（広い弧ほど外へ）
      var jr = o.jumps.map(function(j){ return {lo: Math.min(j.a, j.b), hi: Math.max(j.a, j.b)}; });
      var ord = jr.map(function(_, i){ return i; }).sort(function(p, q){ return (jr[p].hi - jr[p].lo) - (jr[q].hi - jr[q].lo) || p - q; });
      o.jlv = G.levels(jr, ord);
      o.jRow = o.jumps.length ? rowH(o.jumps.map(function(j){ return j.o.label || ""; })) : 0;
      var hMax = L === 1 ? 46 : 34;
      o.jumps.forEach(function(j){ var dx = Math.abs(o.X(j.b) - o.X(j.a)); j.h = Math.min(hMax, 22 + 0.22 * dx); });
      // 外の弧は、内の弧とその名前より 8 px 以上高く（狭い弧から順に）
      ord.forEach(function(jj, n){
        var j = o.jumps[jj], xa = o.X(j.a), xb = o.X(j.b);
        for (var guard = 0; guard < 120; guard++){
          var clash = ord.slice(0, n).some(function(ii){
            var i = o.jumps[ii], ia = o.X(i.a), ib = o.X(i.b);
            if (Math.max(ia, ib) <= Math.min(xa, xb) + 1 || Math.min(ia, ib) >= Math.max(xa, xb) - 1) return false;
            var top = i.h + 8, w = 0, cx = (ia + ib) / 2;
            if (i.o.label){ w = G.width(i.o.label, FS); top = i.h + 6 + o.jRow + 8; }
            var lo = Math.min(ia, ib), hi = Math.max(ia, ib), m = (hi - lo) * 0.2; lo += m; hi -= m;   // 内の弧の真ん中の 6 割の上
            return G.arcAt(xa, xb, j.h, lo, hi) < i.h + 10 || (w && G.arcAt(xa, xb, j.h, cx - w / 2, cx + w / 2) < top);
          });
          if (!clash) break;
          j.h += 4;
        }
      });
      o.jumpH = o.jumps.length ? Math.max.apply(null, o.jumps.map(function(j){ return j.h + (j.o.label ? o.jRow + 6 : 0); })) + 6 : 0;
      // 範囲：重なれば別の高さに
      o.rlv = G.levels(o.ranges.map(function(r){ return {lo: r.lo, hi: r.hi}; }));
      var rLab = o.ranges.filter(function(r){ return r.o.label; });
      o.rRow = rLab.length ? rowH(rLab.map(function(r){ return r.o.label; })) : 0;
      o.rSp = 30 + (o.rRow ? o.rRow + 4 : 0);
      var nlev = o.ranges.length ? Math.max.apply(null, o.rlv) + 1 : 0;
      o.rangeH = nlev ? 28 + (nlev - 1) * o.rSp + (o.rRow ? o.rRow + 4 : 0) + 8 : 0;
      return o;
    });
    // 外側（目盛りの名前の側）と内側（反対の側）の高さ
    var outer = function(o){ return OVER + o.tickH + (o.markUp ? 0 : o.markH) + (L > 1 ? o.jumpH : 0); };
    var inner = function(o){ return Math.max(OVER, o.rangeH + (L === 1 ? o.jumpH : 0) + (o.markUp && o.markH ? o.markH + 12 : 0)); };
    var magH = pl.mags.map(function(m){ m.shown = null; return 84 + OVER + 0; });
    var need, y0, y1;
    if (L === 1){
      var o0 = Lx[0];
      // 拡大の線の目盛りの名前
      pl.mags.forEach(function(m, j){ m.X = function(v){ return x0 + (v - m.a) / (m.b - m.a) * (x1 - x0); }; m.ticks.forEach(function(t){ t.x = m.X(t.v); }); m.shown = pickLabels(m, m.X, []); m.tickH = rowH(m.shown.map(function(t){ return t.label; }));
        m.marks = pl.marks.filter(function(k){ return k.li === j + 1; });
        var nm = m.marks.filter(function(k){ return k.o.label; });
        m.markH = nm.length ? rowH(nm.map(function(k){ return k.o.label; })) + 2 : 0;
        magH[j] = 84 + OVER + m.tickH + m.markH; });
      need = inner(o0) + outer(o0) + magH.reduce(function(a, b){ return a + b; }, 0) + 8;
      y0 = Math.max(4, (H - need) / 2) + inner(o0);
      Lx[0].y = y0;
    } else {
      var gap = Math.max(100, Lx[0].rangeH + Lx[1].rangeH + 40);
      need = outer(Lx[0]) + gap + outer(Lx[1]) + 8;
      y0 = Math.max(4, (H - need) / 2) + outer(Lx[0]); y1 = y0 + gap;
      Lx[0].y = y0; Lx[1].y = y1;
    }
    if (need > H + 1) ctx.report("size", "[numberline] the element (" + W + "×" + H + " px) is too small; it needs about " + Math.ceil(need) + " px of height");
    var gGrid = D.el("g", {}, svg), gShade = D.el("g", {}, svg), gLine = D.el("g", {}, svg), gMark = D.el("g", {}, svg), gText = D.el("g", {}, svg);
    var draw = this.variant === "draw";
    var tickItems = function(o, y, ticks, shown, top, X, a, b, st, par, parT, frac){
      // 線
      var xa = a - OVER, xb = b + OVER + (arrow && par === gLine ? 12 : 0);
      add(D.el("line", {x1: xa.toFixed(1), x2: xb.toFixed(1), y1: y.toFixed(1), y2: y.toFixed(1), stroke: "var(--fg)", "stroke-width": 3, "stroke-linecap": "round", opacity: 0}, par), {st: st, at: 0, len: dur * 0.6, kind: "line"});
      if (arrow && par === gLine) add(arrowHead(par, xb + 14, y, 0, "var(--fg)"), {st: st, at: dur * 0.45, len: dur * 0.3, kind: "fade"});
      ticks.forEach(function(t){
        var x = X(t.v), h = t.major ? 11 : t.half ? 8 : 5, at = draw ? dur * 0.55 * (x - a) / Math.max(1, b - a) : 0;
        add(D.el("line", {x1: x.toFixed(1), x2: x.toFixed(1), y1: (y - h).toFixed(1), y2: (y + h).toFixed(1), stroke: "var(--fg)", "stroke-width": t.major ? 3 : 2, opacity: 0}, par),
          {st: st, at: at, len: draw ? dur * 0.3 : dur * 0.7, kind: "fade"});
      });
      shown.forEach(function(t){
        var x = X(t.v), at = draw ? dur * 0.55 * (x - a) / Math.max(1, b - a) : 0;
        add(lab(parT, x, top, t.label, {frac: frac}), {st: st, at: at, len: draw ? dur * 0.4 : dur * 0.7, kind: "fade"});
      });
    };
    // ---- 線ごとに描く ----
    Lx.forEach(function(o){
      var y = o.y, s = o.side, X = o.X, st = pl.tickStep;
      var tickTop = s > 0 ? y + OVER : y - OVER - o.tickH, fracT = o.tickH >= FROW;
      tickItems(o, y, o.l.ticks, o.shown, tickTop + (o.tickH - (fracT ? FROW : ROW)) / 2, X, o.a, o.b, st, gLine, gText, fracT);
      // 線の名前（左）と単位（右）
      if (o.l.src.label) add(D.mtext(gText, o.a - OVER - 12, y + 9, o.l.src.label, {"text-anchor": "end", "font-size": 26, "font-weight": 700, fill: "var(--fg)", opacity: 0}), {st: st, at: 0, len: dur * 0.7, kind: "fade"});
      if (o.l.src.unit){ var uf = G.hasFrac(o.l.src.unit); add(lab(gText, o.b + OVER + (arrow ? 30 : 10), y - (uf ? 34 : 17), o.l.src.unit, {anchor: "start", frac: uf}), {st: st, at: 0, len: dur * 0.7, kind: "fade"}); }
      var outerTop = s > 0 ? tickTop + o.tickH : tickTop;      // 目盛りの名前の外側の端
      // 点と □
      var markTop = o.markUp ? y - 12 - o.markH : (s > 0 ? outerTop + 2 : outerTop - 2 - o.markH);
      o.marks.forEach(function(m){
        var x = X(m.v), col = toneOf(m.o.tone, "var(--term)");
        if (m.kind === "box"){
          var bx = o.boxes.filter(function(b){ return b.m === m; })[0], bh = 40, cy = tickTop + o.tickH / 2;
          var g = D.el("g", {opacity: 0}, gMark);
          D.el("line", {x1: x.toFixed(1), x2: x.toFixed(1), y1: (y - 11).toFixed(1), y2: (y + 11).toFixed(1), stroke: "var(--fg)", "stroke-width": 3}, g);
          D.el("rect", {x: (x - bx.w / 2).toFixed(1), y: (cy - bh / 2).toFixed(1), width: bx.w.toFixed(1), height: bh, rx: 3, fill: "var(--bg)", stroke: toneOf(m.o.tone, "var(--fg)"), "stroke-width": 3}, g);
          if (m.o.label){ var bf = G.hasFrac(m.o.label); lab(g, x, cy - (bf ? 34 : 17), m.o.label, {frac: bf}); }
          add(g, {st: m.st, at: 0, len: dur * 0.6, kind: "fade"});
          return;
        }
        add(D.el("circle", {cx: x.toFixed(1), cy: y.toFixed(1), r: 9, fill: m.kind === "open" ? "var(--bg)" : col, stroke: col, "stroke-width": 3, opacity: 0}, gMark), {st: m.st, at: 0, len: dur * 0.6, kind: "fade"});
        if (m.o.label) add(lab(gText, x, markTop + (o.markH - (G.hasFrac(m.o.label) ? FROW : ROW)) / 2, m.o.label, {frac: G.hasFrac(m.o.label), fill: "var(--fg)"}), {st: m.st, at: dur * 0.2, len: dur * 0.5, kind: "fade"});
      });
      // ジャンプ：線が 1 本なら線の上、2 本なら目盛りの名前の外側に弧
      var jd = L === 1 ? -1 : s, jBase = L === 1 ? y - 3 : (s > 0 ? outerTop + (o.markUp ? 0 : o.markH) + 6 : outerTop - (o.markUp ? 0 : o.markH) - 6);
      o.jumps.forEach(function(j){
        var xa = X(j.a), xb = X(j.b), dx = xb - xa, h = j.h, col = toneOf(j.o.tone, "var(--term)"), cy = jBase + jd * h * 4 / 3;
        var c1 = xa + dx * 0.12, c2 = xb - dx * 0.12;
        var path = add(D.el("path", {d: "M" + xa.toFixed(1) + "," + jBase.toFixed(1) + "C" + c1.toFixed(1) + "," + cy.toFixed(1) + " " + c2.toFixed(1) + "," + cy.toFixed(1) + " " + (xb - Math.sign(dx) * 2).toFixed(1) + "," + (jBase + jd * 4).toFixed(1),
          fill: "none", stroke: col, "stroke-width": 3, "stroke-linecap": "round", opacity: 0}, gMark), {st: j.st, at: 0, len: dur * 0.7, kind: "line"});
        add(arrowHead(gMark, xb, jBase, Math.atan2(jBase - cy, xb - c2), col), {st: j.st, at: dur * 0.55, len: dur * 0.2, kind: "fade"});
        if (j.o.label){
          var top = jd < 0 ? jBase - h - 6 - o.jRow : jBase + h + 6;
          var lx = Math.max(G.width(j.o.label, FS) / 2 + 2, Math.min(W - G.width(j.o.label, FS) / 2 - 2, xa + dx / 2));
          add(lab(gText, lx, top + (o.jRow - (G.hasFrac(j.o.label) ? FROW : ROW)) / 2, j.o.label, {frac: G.hasFrac(j.o.label)}), {st: j.st, at: dur * 0.3, len: dur * 0.5, kind: "fade"});
        }
      });
      // 範囲：目盛りの名前と反対の側に。端の丸は線の上、重なる範囲は別の高さ。共通部分を塗る
      var rd = -s, edgeL = o.a - OVER, edgeR = o.b + OVER;
      var lvY = function(lv){ return y + rd * (28 + lv * o.rSp); };
      o.ranges.forEach(function(r, i){
        var col = toneOf(r.o.tone, "var(--series-" + (i % 4 + 1) + ")"), yl = lvY(o.rlv[i]);
        var xl = isFinite(r.lo) ? X(r.lo) : edgeL - 6, xr = isFinite(r.hi) ? X(r.hi) : edgeR + 6;
        var d = (isFinite(r.lo) ? "M" + xl.toFixed(1) + "," + (y + rd * 9).toFixed(1) + "L" : "M") + xl.toFixed(1) + "," + yl.toFixed(1) + "L" + xr.toFixed(1) + "," + yl.toFixed(1) + (isFinite(r.hi) ? "L" + xr.toFixed(1) + "," + (y + rd * 9).toFixed(1) : "");
        add(D.el("path", {d: d, fill: "none", stroke: col, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0}, gMark), {st: r.st, at: dur * 0.15, len: dur * 0.6, kind: "line"});
        if (!isFinite(r.lo)) add(arrowHead(gMark, xl - 4, yl, Math.PI, col), {st: r.st, at: dur * 0.5, len: dur * 0.25, kind: "fade"});
        if (!isFinite(r.hi)) add(arrowHead(gMark, xr + 4, yl, 0, col), {st: r.st, at: dur * 0.5, len: dur * 0.25, kind: "fade"});
        [[r.lo, r.incl[0]], [r.hi, r.incl[1]]].forEach(function(e){
          if (!isFinite(e[0])) return;
          add(D.el("circle", {cx: X(e[0]).toFixed(1), cy: y.toFixed(1), r: 9, fill: e[1] ? col : "var(--bg)", stroke: col, "stroke-width": 3, opacity: 0}, gMark), {st: r.st, at: 0, len: dur * 0.4, kind: "fade"});
        });
        if (r.o.label){
          var rf = G.hasFrac(r.o.label), w = G.width(r.o.label, FS), vl = Math.max(xl, edgeL), vr = Math.min(xr, edgeR);
          var cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, (vl + vr) / 2)), top = rd < 0 ? yl - 4 - o.rRow : yl + 4;
          add(lab(gText, cx, top + (o.rRow - (rf ? FROW : ROW)) / 2, r.o.label, {frac: rf, fill: "var(--fg)"}), {st: r.st, at: dur * 0.4, len: dur * 0.4, kind: "fade"});
        }
      });
      var sh = G.shared(o.ranges);
      if (sh){
        var st2 = Math.max.apply(null, o.ranges.map(function(r){ return r.st; }));
        var sl = isFinite(sh.lo) ? X(sh.lo) : edgeL, sr = isFinite(sh.hi) ? X(sh.hi) : edgeR, top2 = lvY(Math.max.apply(null, o.rlv));
        var ya = Math.min(y, top2), yb = Math.max(y, top2);
        add(D.el("rect", {x: sl.toFixed(1), y: ya.toFixed(1), width: Math.max(0, sr - sl).toFixed(1), height: (yb - ya).toFixed(1), fill: "var(--emph)", "fill-opacity": 0.13, opacity: 0}, gShade), {st: st2, at: dur * 0.6, len: dur * 0.4, kind: "fade"});
        add(D.el("line", {x1: sl.toFixed(1), x2: sr.toFixed(1), y1: y.toFixed(1), y2: y.toFixed(1), stroke: "var(--emph)", "stroke-width": 8, "stroke-linecap": "round", opacity: 0}, gShade), {st: st2, at: dur * 0.6, len: dur * 0.4, kind: "fade"});
      }
    });
    // ---- 2 本の線を結ぶ ----
    if (L > 1) pl.links.forEach(function(k){
      var xa = Lx[0].X(k.a), xb = Lx[1].X(k.b), ya = Lx[0].y + 13, yb = Lx[1].y - 13, up = k.o.dir === "up";
      if (!k.o.label){
        add(D.el("line", {x1: xa.toFixed(1), y1: ya.toFixed(1), x2: xb.toFixed(1), y2: yb.toFixed(1), stroke: "var(--muted)", "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, gGrid), {st: k.st, at: 0, len: dur * 0.6, kind: "fade"});
        return;
      }
      var col = toneOf(k.o.tone, "var(--term)"), s0 = up ? [xb, yb] : [xa, ya], e0 = up ? [xa, ya + 6] : [xb, yb - 6];
      add(D.el("line", {x1: s0[0].toFixed(1), y1: s0[1].toFixed(1), x2: e0[0].toFixed(1), y2: e0[1].toFixed(1), stroke: col, "stroke-width": 3, opacity: 0}, gMark), {st: k.st, at: 0, len: dur * 0.6, kind: "line"});
      add(arrowHead(gMark, up ? xa : xb, up ? ya - 2 : yb + 2, Math.atan2(e0[1] - s0[1], e0[0] - s0[0]), col), {st: k.st, at: dur * 0.5, len: dur * 0.2, kind: "fade"});
      var lf = G.hasFrac(k.o.label), w = G.width(k.o.label, FS), mx = (xa + xb) / 2, my = (ya + yb) / 2, right = mx + 14 + w < W - 2;
      add(lab(gText, right ? mx + 14 : mx - 14, my - (lf ? 34 : 17), k.o.label, {anchor: right ? "start" : "end", frac: lf}), {st: k.st, at: dur * 0.3, len: dur * 0.5, kind: "fade"});
    });
    // ---- 拡大 ----
    if (L === 1 && pl.mags.length){
      var o0 = Lx[0], src = {X: o0.X, y: o0.y, bottom: o0.y + OVER + o0.tickH + (o0.markUp ? 0 : o0.markH)};
      pl.mags.forEach(function(m){
        var xs1 = src.X(m.a), xs2 = src.X(m.b), ys = src.bottom + 4, yN = ys + 84, st = m.st, mdur = dur * 2;
        // 広げる区間（元の線の上を太く）
        add(D.el("line", {x1: xs1.toFixed(1), x2: xs2.toFixed(1), y1: src.y.toFixed(1), y2: src.y.toFixed(1), stroke: "var(--emph)", "stroke-width": 8, "stroke-linecap": "round", opacity: 0}, gShade), {st: st, at: 0, len: mdur * 0.2, kind: "fade"});
        var g = D.el("g", {opacity: 0}, gLine);
        D.el("line", {x1: (x0 - OVER).toFixed(1), x2: (x1 + OVER).toFixed(1), y1: yN, y2: yN, stroke: "var(--fg)", "stroke-width": 3, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke"}, g);
        m.ticks.forEach(function(t){
          var h = t.major ? 11 : 5;
          D.el("line", {x1: t.x.toFixed(1), x2: t.x.toFixed(1), y1: yN - h, y2: yN + h, stroke: "var(--fg)", "stroke-width": t.major ? 3 : 2, "vector-effect": "non-scaling-stroke"}, g);
        });
        var f1 = D.el("line", {stroke: "var(--muted)", "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, gGrid), f2 = D.el("line", {stroke: "var(--muted)", "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, gGrid);
        add(g, {st: st, at: mdur * 0.15, len: mdur * 0.55, kind: "mag", f: [f1, f2], from: [xs1, xs2], to: [x0, x1], ys: ys, yN: yN});
        var fracM = m.tickH >= FROW;
        m.shown.forEach(function(t){ add(lab(gText, t.x, yN + OVER, t.label, {frac: fracM}), {st: st, at: mdur * 0.7, len: mdur * 0.3, kind: "fade"}); });
        // 拡大の線の上の点（line 1, 2, …）。名前は目盛りの名前の下
        m.marks.forEach(function(k){
          var x = m.X(k.v), col = toneOf(k.o.tone, "var(--term)");
          if (k.kind === "box") ctx.report("data", "[numberline] a box mark on a magnified line is drawn as a dot");
          add(D.el("circle", {cx: x.toFixed(1), cy: yN, r: 9, fill: k.kind === "open" ? "var(--bg)" : col, stroke: col, "stroke-width": 3, opacity: 0}, gMark), {st: k.st, at: 0, len: dur * 0.6, kind: "fade"});
          if (k.o.label){ var kf = G.hasFrac(k.o.label); add(lab(gText, x, yN + OVER + m.tickH + 2 + (m.markH - 2 - (kf ? FROW : ROW)) / 2, k.o.label, {frac: kf}), {st: k.st, at: dur * 0.2, len: dur * 0.5, kind: "fade"}); }
        });
        src = {X: m.X, y: yN, bottom: yN + OVER + m.tickH + m.markH};
      });
    }
    if (draw) items.forEach(function(it){ if (it.kind === "line") it.el.setAttribute("pathLength", 1); });
    // 形の一覧（render の終わりに形を作り直すため。下の render を見る）
    this.shapes = [].slice.call(svg.querySelectorAll("rect,circle,ellipse,path,line,polyline,polygon"));
  }
  render(k, t, ctx){
    var D = base, lecture = !!ctx.preview, draw = this.variant === "draw", FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    this.items.forEach(function(it){
      var e = it.st < k ? 1 : it.st > k ? (lecture ? -1 : 0) : D.prog(t, it.at, it.len), op;
      if (e < 0){ op = FAINT; e = 1; } else op = e;
      if (it.kind === "mag"){
        // 区間の幅から長い線の幅へ広がりながら下りる（漏斗の線がついてくる）
        var g = Math.max(0, Math.min(1, e)), opg = it.st > k ? op : Math.min(1, g * 4), a = D.lerp(it.from[0], it.to[0], g), b = D.lerp(it.from[1], it.to[1], g);
        var sx = (b - a) / (it.to[1] - it.to[0]), ty = (1 - g) * (it.ys - it.yN);
        it.el.setAttribute("transform", "matrix(" + sx.toFixed(5) + ",0,0,1," + (a - sx * it.to[0]).toFixed(2) + "," + ty.toFixed(2) + ")");
        it.el.setAttribute("opacity", opg.toFixed(3));
        [[it.f[0], it.from[0], a], [it.f[1], it.from[1], b]].forEach(function(f){
          f[0].setAttribute("x1", f[1].toFixed(1)); f[0].setAttribute("y1", (it.ys - 2).toFixed(1));
          f[0].setAttribute("x2", f[2].toFixed(1)); f[0].setAttribute("y2", (it.yN - 14 + ty).toFixed(1));
          f[0].setAttribute("opacity", opg.toFixed(3));
        });
        return;
      }
      if (draw && it.kind === "line"){
        it.el.setAttribute("stroke-dasharray", e >= 1 ? "none" : e.toFixed(4) + " 2");
        op = e > 0 ? (op === FAINT && it.st > k ? FAINT : 1) : 0;
      }
      it.el.setAttribute("opacity", op.toFixed(3));
    });
    // 形を作り直す（同じ値を書き直すだけで、DOM は変わらない）。Chrome は、変わっていない形を近くの変化のために塗り直す（ラスタライズし直す）と、
    // 2 回目からその形の輪郭（曲線の縁）を別の方法で描き、縁の画素が数十個変わる（ソフトウェアの GPU、CI の Linux・Windows）。
    // 何回塗り直されたかは呼び出しの間にコマが描かれたかで決まるので、作り直さないと同じ (k, t) でも呼び出しの順と時刻で画素が変わる（docs/contract.md §3）
    this.shapes.forEach(function(e){ var a = SHAPE_GEOM[e.localName], v = e.getAttribute(a); if (v !== null) e.setAttribute(a, v); });
  }
};
});
