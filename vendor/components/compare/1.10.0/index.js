// m-compare：2 つ（3 つまで）を横に並べて比べる表。列ごとに見出し、行ごとに比べる観点、最後に行ごとの違い
// <m-compare style="height:420px"><script type="application/json">
//   {"sides": [{"label": "紙の申請", "tone": "muted"}, {"label": "オンライン申請"}],
//    "rows": [{"label": "受付時間", "values": ["平日 9〜17 時", "24 時間"], "better": 1, "diff": "いつでも出せる"}, …]}
// （JSON の終わり）</m-compare>
// 段階：既定は 一方の列 → もう一方の列（→ 3 つ目の列）→ 違い（diff の列と better の枠）。違いのない表は列の数だけ
// 観点の名前（行の名前）は最初の列と一緒に出る。値は列の幅で折り返す（字数から幅を見積もる。\n で改行）
// 字は size（既定 28 px）から 24 px まで縮めて要素の箱に収める。収まらなければ console.warn
// 見せ方（docs/conventions.md §1）：fade（既定。列が少し上がりながら現れる）・slide（列が自分の側から横に寄って現れる）・
// reveal（列の中を上の行から 1 行ずつ）。どれも動く距離（16 px）と長さ（dur）は同じで、段階の数・長さ・最後の中身は変わらない
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (index 0 is variant 0) and calls VARIANT.of(this) once, in mount. The choice reads, in order:
//   the component's `variant` attribute (a name) → its `seed` attribute → `data-egatari-seed` on the root element → 0.
// Seed 0 gives variant 0. Any other seed s gives the name v with the largest h("<s>|<tag>|<v>") (highest random weight),
// so every instance of a component in one lesson shows the same variant, components choose independently, and adding a
// variant later changes only the lessons where the new one wins. h is FNV-1a followed by the mixing of kit/deck.js's rng.
// The choice is a pure function of these values: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function mix(h){
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash(s){
    var h = 2166136261;
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return mix(h);
  }
  // A seed is a decimal integer 0 ≤ N < 2^32. Anything else is warned about and ignored (null)
  function seedOf(v, what){
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (/^\d{1,10}$/.test(s) && +s < 4294967296) return +s;
    console.warn(what + "=" + JSON.stringify(v) + " is not an integer 0 ≤ N < 2^32 (ignored)");
    return null;
  }
  // The variant name for seed s among names (for tools and tests; components call of)
  function pick(s, tag, names){
    if (!names.length) return null;
    if (!s) return names[0];
    var best = names[0], bh = -1;
    names.forEach(function(v){ var x = hash(s + "|" + tag + "|" + v); if (x > bh){ bh = x; best = v; } });
    return best;
  }
  // The effective seed of a component element (0 when nothing is written)
  function seed(el){
    var tag = el.tagName.toLowerCase(), s = seedOf(el.getAttribute("seed"), tag + " seed");
    if (s === null) s = seedOf(document.documentElement.getAttribute("data-egatari-seed"), "data-egatari-seed");
    return s === null ? 0 : s;
  }
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null){
      if (names.indexOf(v) >= 0) return v;
      console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (variant 0 is used)");
      return names[0] || null;
    }
    return pick(seed(el), tag, names);
  }
  // A seeded generator for a variant that needs randomness (0 ≤ x < 1), from the same seed, tag and a key of your own
  function rng(el, key){
    var h = hash(seed(el) + "|" + el.tagName.toLowerCase() + "|" + (key || ""));
    return function(){ h = mix((h + 0x9e3779b9) >>> 0); return h / 4294967296; };
  }
  return {of: of, pick: pick, seed: seed, rng: rng, hash: hash};
})();
// ---- END egatari-variant ----
DECK.define("m-compare", class extends DECK.MotionElement {
  static variants = ["fade", "slide", "reveal"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["sides", "rows"], properties: {
      sides: {type: "array", minItems: 2, maxItems: 3, items: {type: "object", additionalProperties: false, required: ["label"], properties: {
        label: {type: "string"}, tone: {type: "string"}, step: {type: "integer"}}}},
      rows: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["values"], properties: {
        label: {type: "string"}, values: {type: "array", items: {type: ["string", "number"]}}, diff: {type: "string"}, better: {type: "integer"}}}}}},
    example: {sides: [{label: "紙の申請", tone: "muted"}, {label: "オンライン申請"}],
      rows: [{label: "受付時間", values: ["平日 9〜17 時", "24 時間"], better: 1, diff: "いつでも出せる"}]},
  };
  static props = {
    size:         {type: "number", default: 28, doc: "値の字の大きさ（px）。収まらなければ 24 まで縮める"},
    dur:          {type: "number", default: 0.6, doc: "1 つの列（と違い）が現れる秒数"},
    "diff-label": {type: "string", default: "", doc: "違いの列の見出し（空なら「違い」）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var d = this.data || {}, m = 0;
    (d.sides || []).forEach(function(s, i){ m = Math.max(m, s.step || i + 1); });
    return m + (this.hasDiff() ? 1 : 0);
  }
  hasDiff(){
    return ((this.data || {}).rows || []).some(function(r){ return (r.diff !== undefined && r.diff !== "") || r.better !== undefined; });
  }
  mount(){
    var P = this.props, D = DECK, self = this, data = this.data || {sides: [], rows: []};
    this.variant = VARIANT.of(this);
    // 形（static shape）では書けない決まり：values は列の数だけ、better は列の番号（0 から）。黙って値を落とさない
    var ns = (data.sides || []).length;
    (data.rows || []).forEach(function(r, j){
      var nv = (r.values || []).length;
      if (nv !== ns) throw new Error("m-compare: rows[" + j + "].values has " + nv + " value(s) but there are " + ns + " sides (write one value per side, in the order of sides)");
      if (r.better !== undefined && !(r.better >= 0 && r.better < ns)) throw new Error("m-compare: rows[" + j + "].better is " + JSON.stringify(r.better) + " but it must be a side number from 0 to " + (ns - 1));
    });
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var sides = data.sides || [], rows = data.rows || [], n = sides.length;
    var TONES = /^(term|emph|muted|accent2|series-[1-4])$/, DEF = ["term", "accent2", "series-4"];
    var tone = function(s, i){ return "var(--" + (TONES.test(s.tone || "") ? s.tone : DEF[i] || "term") + ")"; };
    var hasDiff = this.hasDiff(), hasDiffCol = rows.some(function(r){ return r.diff !== undefined && r.diff !== ""; });
    var diffHead = P["diff-label"] || (D.ja !== false ? "違い" : "Difference");
    // 字の幅の見積もり（和文 1 字 = 1 字幅、英数字 0.6、空白 0.33。太字は 1.04 倍）
    var est = function(s, fs, bold){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.33 : /[\u0000-ɏ]/.test(c) ? 0.6 : 1); }, 0) * fs * (bold ? 1.04 : 1); };
    // 折り返し：英数字の語はまとめ、行頭に来てはいけない字（、。）」など）の前では折らない
    var wrap = function(s, maxW, fs, bold){
      var out = [], over = false;
      String(s === undefined ? "" : s).split("\n").forEach(function(par){
        var toks = par.match(/[A-Za-z0-9.,%+\-−:\/'’]+|\s+|[^]/gu) || [""], line = "", w = 0;
        toks.forEach(function(tk){
          var tw = est(tk, fs, bold), sp = /^\s+$/.test(tk);
          if (line && w + tw > maxW && !sp && !/^[、。，．）」』！？ー々ゃゅょっャュョッぁぃぅぇぉ〜]/.test(tk)){ out.push(line.trim()); line = ""; w = 0; }
          if (sp && !line) return;
          line += tk; w += tw;
        });
        out.push(line.trim());
      });
      out.forEach(function(l){ if (est(l, fs, bold) > maxW + 0.5) over = true; });
      return {lines: out, over: over};
    };
    // 字の大きさを size から 24 まで下げて、要素の箱に収まる配置を探す
    var gap = 14, padX = 16, padY = 12, bar = 7, L = null;
    for (var fs = Math.max(24, P.size); fs >= 24; fs--){
      L = (function(fs){
        var lh = Math.round(fs * 1.3), hs = fs + 2, hlh = Math.round(hs * 1.25), over = false;
        var anyLabel = rows.some(function(r){ return r.label; });
        var lw = anyLabel ? Math.min(W * 0.24, Math.max(W * 0.1, Math.max.apply(null, rows.map(function(r){ return est(r.label || "", fs, true); })) + padX * 2)) : 0;
        var dw = hasDiffCol ? Math.min(W * 0.3, Math.max(W * 0.18, Math.max.apply(null, rows.map(function(r){ return est(r.diff || "", fs, true); })) + padX * 2)) : 0;
        var cw = (W - lw - dw - gap * (n - 1 + (lw ? 1 : 0) + (dw ? 1 : 0))) / n;
        var heads = sides.map(function(s){ var w = wrap(s.label, cw - padX * 2, hs, true); over = over || w.over; return w.lines; });
        var cells = rows.map(function(r){
          var lab = wrap(r.label || "", lw - padX * 2, fs, true), dif = wrap(r.diff || "", dw - padX * 2, fs, true);
          var vals = sides.map(function(s, i){ var v = (r.values || [])[i]; return wrap(v === undefined || v === null ? "" : v, cw - padX * 2, fs, r.better === i); });
          over = over || (lw && lab.over) || (dw && dif.over) || vals.some(function(v){ return v.over; });
          var nl = Math.max(lw ? lab.lines.length : 1, dw ? dif.lines.length : 1, Math.max.apply(null, vals.map(function(v){ return v.lines.length; })));
          return {lab: lab.lines, dif: dif.lines, vals: vals.map(function(v){ return v.lines; }), h: nl * lh + padY * 2};
        });
        var hh = bar + padY * 2 + Math.max.apply(null, heads.map(function(h){ return h.length; })) * hlh;
        var tot = hh + cells.reduce(function(a, c){ return a + c.h; }, 0);
        return {fs: fs, lh: lh, hs: hs, hlh: hlh, lw: lw, dw: dw, cw: cw, heads: heads, cells: cells, hh: hh, tot: tot, ok: !over && tot <= H};
      })(fs);
      if (L.ok) break;
    }
    if (!L.ok) console.warn("m-compare: the table does not fit in " + W + "×" + H + " px even at 24 px (shorten the texts or make the element taller)");
    // 余った高さは行に分ける（1 行につき字の行の高さまで。表は上にそろえる）
    var extra = Math.max(0, Math.min((H - L.tot) / Math.max(1, rows.length), L.lh));
    var ys = [], y = L.hh;
    L.cells.forEach(function(c){ c.h += extra; ys.push(y); y += c.h; });
    var tableH = y;
    var x = 0, colX = {};
    if (L.lw){ colX.label = x; x += L.lw + gap; }
    colX.sides = sides.map(function(){ var x0 = x; x += L.cw + gap; return x0; });
    if (L.dw) colX.diff = x;
    var lastSide = 0;
    sides.forEach(function(s, i){ lastSide = Math.max(lastSide, s.step || i + 1); });
    var diffStep = lastSide + 1;
    // 字の塊を (cx, 行の中央) に置く
    var block = function(g, lines, xx, yc, anchor, attrs, lh){
      var y0 = yc - (lines.length - 1) * lh / 2 + L.fs * 0.36;
      lines.forEach(function(s, j){ if (s) D.mtext(g, xx, y0 + j * lh, s, Object.assign({"text-anchor": anchor, "font-size": L.fs}, attrs)); });
    };
    // 現れる単位（piece）：{g, step, row（reveal の順。見出しは 0、行 j は j + 1）, dir（slide の向き：-1 左から、1 右から、0 下から）}
    var pieces = [], m = rows.length + 1;
    var piece = function(step, row, dir){ var g = D.el("g", {opacity: 0}, svg); pieces.push({g: g, step: step, row: row, dir: dir}); return g; };
    var sepLine = function(g, x0, w, yy){ D.el("line", {x1: x0, x2: x0 + w, y1: yy, y2: yy, stroke: "var(--line)", "stroke-width": 1.5}, g); };
    // 左右の列は外から、3 つの列の真ん中は下から寄る
    var dirOf = function(i){ return i === 0 ? -1 : i === n - 1 ? 1 : 0; };
    // 観点の名前（最初の列と一緒に、その列の向きで）
    var s0 = sides.length ? (sides[0].step || 1) : 1;
    if (L.lw) L.cells.forEach(function(c, j){
      var g = piece(s0, j + 1, -1);
      block(g, c.lab, colX.label + padX * 0.5, ys[j] + c.h / 2, "start", {"font-weight": 700, fill: "var(--fg)"}, L.lh);
      if (j < rows.length - 1) sepLine(g, colX.label, L.lw, ys[j] + c.h);
    });
    // 列：薄い地の札・上の帯・見出し、行ごとの値
    sides.forEach(function(s, i){
      var st = s.step || i + 1, col = tone(s, i), x0 = colX.sides[i], dir = dirOf(i);
      var g = piece(st, 0, dir);
      D.el("rect", {x: x0, y: 0, width: L.cw, height: tableH, rx: 12, fill: col, "fill-opacity": 0.07}, g);
      D.el("rect", {x: x0, y: 0, width: L.cw, height: bar, rx: 3, fill: col}, g);
      var hl = L.heads[i];
      hl.forEach(function(t, j){
        D.mtext(g, x0 + L.cw / 2, bar + padY + (L.hh - bar - padY * 2 - hl.length * L.hlh) / 2 + j * L.hlh + L.hlh / 2 + L.hs * 0.36, t,
          {"text-anchor": "middle", "font-size": L.hs, "font-weight": 700, fill: col});
      });
      L.cells.forEach(function(c, j){
        var gc = piece(st, j + 1, dir), r = rows[j];
        block(gc, c.vals[i], x0 + L.cw / 2, ys[j] + c.h / 2, "middle", r.better === i ? {"font-weight": 700, fill: col} : {fill: "var(--fg)"}, L.lh);
        sepLine(gc, x0 + 10, L.cw - 20, ys[j]);
      });
    });
    // 違い：右の列（見出しと diff の字）と、better の値を囲む枠
    if (hasDiff){
      if (L.dw){
        var gd = piece(diffStep, 0, 1);
        D.el("rect", {x: colX.diff, y: 0, width: L.dw, height: tableH, rx: 12, fill: "var(--emph-tint)"}, gd);
        D.el("rect", {x: colX.diff, y: 0, width: L.dw, height: bar, rx: 3, fill: "var(--emph)"}, gd);
        D.mtext(gd, colX.diff + L.dw / 2, bar + (L.hh - bar) / 2 + L.hs * 0.36, diffHead, {"text-anchor": "middle", "font-size": L.hs, "font-weight": 700, fill: "var(--emph)"});
      }
      L.cells.forEach(function(c, j){
        var r = rows[j], hasD = r.diff !== undefined && r.diff !== "", hasB = r.better !== undefined && r.better >= 0 && r.better < n;
        if (!hasD && !hasB && !L.dw) return;
        var g = piece(diffStep, j + 1, 1);
        if (L.dw){
          if (hasD) block(g, c.dif, colX.diff + padX, ys[j] + c.h / 2, "start", {"font-weight": 700, fill: "var(--emph)"}, L.lh);
          D.el("line", {x1: colX.diff + 10, x2: colX.diff + L.dw - 10, y1: ys[j], y2: ys[j], stroke: "var(--line)", "stroke-width": 1.5}, g);
        }
        if (hasB) D.el("rect", {x: colX.sides[r.better] + 5, y: ys[j] + 5, width: L.cw - 10, height: c.h - 10, rx: 9, fill: "none", stroke: "var(--emph)", "stroke-width": 3}, g);
      });
    }
    this.pieces = pieces; this.m = m;
  }
  duration(k){
    var d = 0, F = this.props.dur;
    (this.pieces || []).forEach(function(p){ if (p.step === k) d = F; });
    return d;
  }
  cues(){ return null; }
  render(k, t, ctx){
    var D = DECK, F = this.props.dur, vr = this.variant, m = this.m, lecture = ctx && (ctx.preview || ctx.mode === "lecture");
    var dim = 0.5;
    if (lecture){ var dv = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lecture-dim")); if (dv >= 0.45 && dv <= 0.5) dim = dv; }
    var TRAVEL = 16;
    this.pieces.forEach(function(p){
      // reveal：行ごとに F/2 秒ずつ、出だしを F/2 の中で上から順にずらす（全体で F 秒。fade と同じ長さ）
      var at = 0, len = F;
      if (vr === "reveal"){ len = F / 2; at = m > 1 ? p.row / (m - 1) * F / 2 : 0; }
      var e = p.step < k ? 1 : p.step > k ? 0 : D.prog(t, at, len);
      if (lecture){
        p.g.setAttribute("opacity", (p.step > k ? dim : p.step === k ? D.lerp(dim, 1, e) : 1).toFixed(3));
        p.g.removeAttribute("transform");
        return;
      }
      p.g.setAttribute("opacity", e.toFixed(3));
      var off = (1 - e) * TRAVEL, tr = "";
      if (off > 0.01) tr = vr === "slide" && p.dir ? "translate(" + (p.dir * off).toFixed(2) + " 0)" : "translate(0 " + off.toFixed(2) + ")";
      if (tr) p.g.setAttribute("transform", tr); else p.g.removeAttribute("transform");
    });
  }
});
