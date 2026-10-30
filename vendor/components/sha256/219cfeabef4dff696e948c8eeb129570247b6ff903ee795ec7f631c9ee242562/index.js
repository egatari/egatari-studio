// m-hist：ヒストグラム（柱状グラフ）・度数折れ線・ドットプロット。生の値から部品が度数を数えるか、度数分布表を書く
// <m-hist xl="記録（m）" yl="人数（人）" polygon="on" marks="mean,median,mode" style="height:440px">
//   <script type="application/json">{"values": [23, 31, 27], "bins": {"start": 15, "width": 5}}
// （JSON の終わり）</m-hist>
// 段階：分布（既定は系列 1 つ = 1 段階。build="bins" は階級 1 つ = 1 段階、build="values" は値が 1 つずつ落ちて積もる）→ 度数折れ線（polygon="on"）
//       → 代表値の印を 1 つずつ（marks の順）
// 軸の属性（xr yr xt yt xf yf xl yl）は m-curves と同じ名前と意味。階級は「以上・未満」（start + i·width 以上、start + (i+1)·width 未満）
// 見せ方（docs/conventions.md §1）：fade（棒・点がフェードして現れる、既定）・grow（棒が下から伸びる。点は下の段から順に現れる）
(function(){
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
// ---- 代表値と度数（tools/test-stats.mjs が試す。customElements.get("m-hist").stats） ----
var STATS = (function(){
  function sorted(a){ return a.slice().sort(function(x, y){ return x - y; }); }
  function sum(a){ var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a){ return sum(a) / a.length; }
  // 中央値：小さい順に並べた真ん中の値（偶数個なら真ん中の 2 つの平均）
  function median(a){ var s = sorted(a), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  // 最頻値：いちばん多く出る値（同数なら全部、小さい順）。どの値も 1 回ずつ（2 個以上）なら最頻値はない（[]）
  function modes(a){
    var c = {}, keys = [], mx = 0;
    a.forEach(function(v){ var k = String(v); if (!(k in c)){ c[k] = 0; keys.push(v); } c[k]++; mx = Math.max(mx, c[k]); });
    if (mx === 1 && a.length > 1) return [];
    return sorted(keys.filter(function(v){ return c[String(v)] === mx; }));
  }
  // 階級の番号（start + i·width 以上、start + (i+1)·width 未満。浮動小数の誤差を少し許す）
  function binOf(v, start, width){ return Math.floor((v - start) / width + 1e-9); }
  function counts(values, start, width, nb){
    var c = []; for (var i = 0; i < nb; i++) c.push(0);
    values.forEach(function(v){ var b = binOf(v, start, width); if (b >= 0 && b < nb) c[b]++; });
    return c;
  }
  function mids(start, width, nb){ var m = []; for (var i = 0; i < nb; i++) m.push(clean(start + (i + 0.5) * width)); return m; }
  // 度数分布表からの平均値：Σ（階級値 × 度数）÷ 度数の合計
  function tableMean(mid, cnt){ var s = 0, n = 0; mid.forEach(function(m, i){ s += m * cnt[i]; n += cnt[i]; }); return s / n; }
  // 度数分布表の最頻値：度数がいちばん多い階級の階級値（同数なら全部）
  function binModes(mid, cnt){ var mx = Math.max.apply(null, cnt); return mx > 0 ? mid.filter(function(m, i){ return cnt[i] === mx; }) : []; }
  // 度数分布表の中央値：真ん中の順位の値が入る階級（{bin}）。偶数個で真ん中の 2 つが別の階級なら、その境の値（{at}）
  function tableMedian(start, width, cnt){
    var n = sum(cnt), r1 = n % 2 ? (n + 1) / 2 : n / 2, r2 = n % 2 ? r1 : n / 2 + 1, find = function(r){ var c = 0; for (var i = 0; i < cnt.length; i++){ c += cnt[i]; if (c >= r) return i; } return cnt.length - 1; };
    var a = find(r1), b = find(r2);
    return a === b ? {bin: a, from: clean(start + a * width), to: clean(start + (a + 1) * width), x: clean(start + (a + 0.5) * width)} : {at: clean(start + b * width), x: clean(start + b * width)};
  }
  function cumulative(c){ var s = 0; return c.map(function(v){ return (s += v); }); }
  function clean(v){ return +(+v).toFixed(10); }
  return {sorted: sorted, sum: sum, mean: mean, median: median, modes: modes, binOf: binOf, counts: counts, mids: mids,
          tableMean: tableMean, binModes: binModes, tableMedian: tableMedian, cumulative: cumulative, clean: clean};
})();
// 印の名前の置き場所：線の頭の右（start）か左（end）。名前がほかの印の線にかからない側を選び、名前がかかる線の印は
// それより下の行に置く（線は自分の名前の行までしか伸びないので、上の名前を横切らない）。同じ行の名前は 14 px あける。
// fl：[{x, w}]（x は線の位置、w は名前の幅）。各要素に a（start / end）・L・R・row を書き、行の数を返す
function FLAGS(fl, W, tag){
  var span = function(f, a){ var l = a === "start" ? f.x + 8 : f.x - 8 - f.w; return [l, l + f.w]; };
  var covers = function(f, g){ return g !== f && g.x > f.L - 6 && g.x < f.R + 6; };
  fl.forEach(function(f){
    var best = null;
    ["start", "end"].forEach(function(a){
      var sp = span(f, a);
      if (sp[0] < 2 || sp[1] > W - 2) return;
      var n = fl.filter(function(g){ return g !== f && g.x > sp[0] - 6 && g.x < sp[1] + 6; }).length;
      if (!best || n < best.n) best = {a: a, n: n};
    });
    f.a = best ? best.a : (f.x < W / 2 ? "start" : "end");
    var sp2 = span(f, f.a); f.L = sp2[0]; f.R = sp2[1];
  });
  // 名前がかかる線の印が先（下の行）
  var lv = fl.map(function(){ return 0; });
  for (var it = 0; it < fl.length; it++) fl.forEach(function(f, i){ fl.forEach(function(g, j){ if (covers(f, g)) lv[i] = Math.max(lv[i], Math.min(fl.length, lv[j] + 1)); }); });
  var order = fl.map(function(f, i){ return i; }).sort(function(a, b){ return lv[a] - lv[b] || a - b; });
  var placed = [], rows = 0;
  order.forEach(function(i){
    var f = fl[i], row = 0;
    placed.forEach(function(o){ if (covers(f, o)) row = Math.max(row, o.row + 1); });
    for (;; row++){
      var clash = placed.some(function(o){
        return (o.row === row && f.L < o.R + 14 && o.L < f.R + 14) || (o.row < row && covers(o, f)) || (o.row > row && covers(f, o));
      });
      if (!clash) break;
      if (row > 12){ console.warn(tag + ': no free place for the name "' + (f.text || "") + '" (it may overlap)'); break; }
    }
    f.row = row; placed.push(f); rows = Math.max(rows, row + 1);
  });
  return rows;
}
var ON = function(v){ return /^(on|true|yes)$/i.test(String(v || "").trim()); };
DECK.define("m-hist", class extends DECK.MotionElement {
  static variants = ["fade", "grow"];
  static stats = STATS;
  // データの形（kit/shape.js）
  static shape = (function(){
    var NUMS = {type: "array", minItems: 1, items: {type: "number"}};
    var TABLE = {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["from", "to", "count"],
      properties: {from: {type: "number"}, to: {type: "number"}, count: {type: "integer"}}}};
    return {
      schema: {type: "object", additionalProperties: false, anyOf: [{required: ["values"]}, {required: ["table"]}, {required: ["series"]}], properties: {
        values: NUMS, table: TABLE,
        bins: {type: "object", additionalProperties: false, required: ["start", "width"], properties: {start: {type: "number"}, width: {type: "number"}}},
        series: {type: "array", minItems: 1, maxItems: 2, items: {type: "object", additionalProperties: false, anyOf: [{required: ["values"]}, {required: ["table"]}],
          properties: {label: {type: "string"}, tone: {type: "string"}, values: NUMS, table: TABLE}}}}},
      example: {values: [23, 31, 27, 18, 25, 29, 33, 22, 26, 28], bins: {start: 15, width: 5}},
      note: {en: "raw values with bins {start, width} (the part counts), or a frequency table [{from, to, count}]; up to 2 series [{label, tone, values | table}]",
             ja: "生の値と階級 {start, width}（部品が数える）か、度数分布表 [{from, to, count}]。系列は 2 つまで [{label, tone, values か table}]"},
    };
  })();
  static props = {
    xr: {type: "json", default: null, doc: "横軸の範囲（書かなければ階級から）"}, yr: {type: "json", default: null, doc: "縦軸の範囲（書かなければ度数から）"},
    xt: {type: "json", default: null, doc: "横軸の目盛り（書かなければ階級の境）"}, yt: {type: "json", default: null, doc: "縦軸の目盛り（書かなければ自動）"},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    unit:       {type: "string", default: "", doc: "代表値の数の後ろに付ける単位"},
    digits:     {type: "number", default: undefined, doc: "代表値の小数桁（書かなければ値の桁＋1 まで）"},
    polygon:    {type: "string", default: "off", doc: "on：度数折れ線"},
    relative:   {type: "string", default: "off", doc: "on：相対度数"},
    cumulative: {type: "string", default: "off", doc: "on：累積度数"},
    kind:       {type: "string", default: "bars", doc: "bars（柱状グラフ）か dots（ドットプロット）"},
    marks:      {type: "string", default: "", doc: "代表値の印：mean,median,mode のどれか（書いた順に 1 つずつ）"},
    build:      {type: "string", default: "whole", doc: "whole・values（値を 1 つずつ数える）・bins（階級を 1 つずつ）"},
    dur:        {type: "number", default: 0.8, doc: "1 段階の動きの秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // 系列・階級・度数・代表値・段階（mount の前にも steps が要るので、データと属性だけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, S = STATS, notes = [];
    var kind = P.kind, sa = this.getAttribute("style");
    // style="dots" と書かれたとき（style は大きさに使う属性なので kind を勧める）
    if (/^\s*(bars|dots)\s*$/.test(sa || "")){ kind = sa.trim(); notes.push('m-hist: write kind="' + kind + '" (style is for the size, e.g. style="height:420px")'); }
    if (kind !== "bars" && kind !== "dots"){ notes.push('m-hist: kind="' + kind + '" is not bars or dots (bars is used)'); kind = "bars"; }
    var src = Array.isArray(d.series) && d.series.length ? d.series : [{values: d.values, table: d.table}];
    var ser = src.map(function(s, i){
      return {i: i, label: s.label || "", tone: s.tone, values: Array.isArray(s.values) ? s.values.map(Number) : null,
              table: Array.isArray(s.table) ? s.table.map(function(r){ return {from: +r.from, to: +r.to, count: +r.count}; }).sort(function(a, b){ return a.from - b.from; }) : null};
    });
    var raw = ser.every(function(s){ return s.values; });
    if (kind === "dots" && !raw) throw new Error("m-hist: kind=\"dots\" needs raw values (\"values\": [...]), not a frequency table");
    // 階級：度数分布表から、なければ bins から、なければ値から（柱状グラフのとき）
    var bins = null, tab = ser.filter(function(s){ return s.table; });
    var eq = function(a, b, w){ return Math.abs(a - b) <= Math.abs(w) * 1e-6; };
    if (tab.length){
      var t0 = tab[0].table, w = t0[0].to - t0[0].from;
      if (!(w > 0)) throw new Error("m-hist: table rows need from < to");
      t0.forEach(function(r, j){
        if (!eq(r.to - r.from, w, w) || (j && !eq(r.from, t0[j - 1].to, w))) throw new Error("m-hist: the table's classes must have equal widths and follow each other (" + r.from + "〜" + r.to + ")");
      });
      bins = {start: t0[0].from, width: w, nb: t0.length};
      tab.forEach(function(s){
        if (s.table.length !== t0.length || s.table.some(function(r, j){ return !eq(r.from, t0[j].from, w) || !eq(r.to, t0[j].to, w); }))
          throw new Error("m-hist: the two tables must have the same classes");
      });
    } else if (d.bins){
      if (!(+d.bins.width > 0)) throw new Error("m-hist: bins.width must be greater than 0");
      bins = {start: +d.bins.start, width: +d.bins.width, nb: 0};
    }
    var all = [].concat.apply([], ser.map(function(s){ return s.values || []; }));
    var lo = all.length ? Math.min.apply(null, all) : 0, hi = all.length ? Math.max.apply(null, all) : 0;
    var given = !!bins;
    if (!bins && kind === "bars"){
      // 階級を書かなければ、およそ 1 + log2(n) 個の切りのよい幅
      var k0 = Math.max(1, Math.ceil(1 + Math.log2(Math.max(1, all.length)))), w0 = niceStep((hi - lo || 1) / k0);
      bins = {start: S.clean(Math.floor(lo / w0 + 1e-9) * w0), width: w0, nb: 0};
      notes.push("m-hist: no bins were written; classes of width " + w0 + " from " + bins.start + " are used (write \"bins\": {\"start\", \"width\"})");
    }
    if (bins && all.length){
      if (S.binOf(lo, bins.start, bins.width) < 0) throw new Error("m-hist: the value " + lo + " is below bins.start (" + bins.start + ")");
      var need = S.binOf(hi, bins.start, bins.width) + 1;
      if (tab.length && need > bins.nb) throw new Error("m-hist: the value " + hi + " is outside the table's classes");
      bins.nb = Math.max(bins.nb, need);
    }
    if (bins){
      bins.edges = []; for (var e = 0; e <= bins.nb; e++) bins.edges.push(S.clean(bins.start + e * bins.width));
      bins.mids = S.mids(bins.start, bins.width, bins.nb);
    }
    var dec = function(v){ var s = String(v), m = s.match(/\.(\d+)$/); return m ? m[1].length : 0; };
    var base = Math.max.apply(null, all.map(dec).concat(bins ? [dec(bins.start), dec(bins.width)] : []).concat([0]));
    ser.forEach(function(s){
      if (bins) s.counts = s.values ? S.counts(s.values, bins.start, bins.width, bins.nb) : s.table.map(function(r){ return r.count; });
      s.n = s.values ? s.values.length : S.sum(s.counts);
    });
    // 代表値（marks の順）
    var marks = [];
    String(P.marks || "").split(/[\s,、]+/).filter(Boolean).forEach(function(m){
      if (["mean", "median", "mode"].indexOf(m) < 0){ notes.push('m-hist: marks: "' + m + '" is not mean, median or mode (ignored)'); return; }
      if (marks.some(function(x){ return x.type === m; })) return;
      var per = ser.map(function(s){
        if (!s.n) return null;
        if (m === "mean") return {xs: [s.values ? S.mean(s.values) : S.tableMean(bins.mids, s.counts)]};
        if (m === "median"){
          if (s.values) return {xs: [S.median(s.values)]};
          var md = S.tableMedian(bins.start, bins.width, s.counts);
          return md.bin !== undefined ? {xs: [md.x], cls: [md.from, md.to]} : {xs: [md.at]};
        }
        // 最頻値：点を値の上に積むときは値から、階級でまとめるときは度数がいちばん多い階級の階級値
        var mo = kind === "dots" && !given ? S.modes(s.values) : S.binModes(bins.mids, s.counts);
        if (!mo.length){ notes.push("m-hist: " + (s.label || "the data") + " has no mode (every value appears once); the mark is left out"); return null; }
        return {xs: mo, cls: kind === "dots" && !given ? null : true};
      });
      if (per.some(Boolean)) marks.push({type: m, per: per});
    });
    // 段階
    var build = P.build;
    if (["whole", "values", "bins"].indexOf(build) < 0){ notes.push('m-hist: build="' + build + '" is not whole, values or bins (whole is used)'); build = "whole"; }
    if (build === "values" && !raw){ notes.push('m-hist: build="values" needs raw values; build="bins" is used'); build = "bins"; }
    if (build === "bins" && kind === "dots"){ notes.push('m-hist: build="bins" is for bars; build="values" is used for dots'); build = "values"; }
    var poly = ON(P.polygon), rel = ON(P.relative), cum = ON(P.cumulative);
    if (kind === "dots" && (poly || rel || cum)){ notes.push("m-hist: polygon, relative and cumulative are for bars (ignored with kind=\"dots\")"); poly = rel = cum = false; }
    var k = 0;
    if (build === "bins"){ ser.forEach(function(s){ s.step = 1; }); bins.step0 = 1; k = bins.nb; }
    else ser.forEach(function(s){ s.step = ++k; });
    var polyStep = poly ? ++k : 0;
    marks.forEach(function(m){ m.step = ++k; });
    // build="values"：値が落ちる間隔。1 段階が 3 秒ほどに収まるように（9 個までは 0.3 秒おき、それより多ければ詰める）
    var DROP = 0.45;
    ser.forEach(function(s){
      s.gap = build === "values" && s.n > 1 ? Math.min(0.3, 2.5 / (s.n - 1)) : 0;
      s.len = build === "values" ? (s.n - 1) * s.gap + DROP + 0.1 : P.dur;
    });
    return (this._plan = {kind: kind, ser: ser, bins: bins, given: given, marks: marks, build: build, poly: poly, rel: rel, cum: cum,
      polyStep: polyStep, steps: Math.max(1, k), base: base, notes: notes, DROP: DROP, lo: lo, hi: hi});
    function niceStep(r){ var e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e; return S.clean((x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e); }
  }
  // 代表値の数の書き方：digits があればその桁、なければ値の桁＋1 まで（終わりの 0 は値の桁まで落とす）
  fmt(v){
    var P = this.props, pl = this.plan(), s;
    if (P.digits !== undefined && isFinite(P.digits)) s = Math.abs(v).toFixed(P.digits);
    else { s = Math.abs(v).toFixed(pl.base + 1); if (s.indexOf(".") >= 0){ var keep = pl.base; s = s.replace(/0+$/, ""); var dd = (s.split(".")[1] || "").length; if (dd < keep) s += Array(keep - dd + 1).join("0"); s = s.replace(/\.$/, ""); } }
    var p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 && +s !== 0 ? "−" : "") + i + (p[1] ? "." + p[1] : "");
  }
  mount(){
    var P = this.props, D = DECK, self = this, pl = this.plan(), S = STATS;
    this.variant = VARIANT.of(this);
    pl.notes.forEach(function(n){ console.warn(n); });
    this.classList.add("plot"); this.style.display = "block";
    var ja = DECK.ja !== false;
    var est = function(s, size){ return [...String(s).replace(/[*_^]/g, "")].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
    var colorOf = function(c, i){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(c || "") ? "var(--" + c + ")" : null; };
    var two = pl.ser.length > 1, dots = pl.kind === "dots", bins = pl.bins;
    pl.ser.forEach(function(s, i){ s.col = colorOf(s.tone) || (two ? "var(--series-" + (i + 1) + ")" : "var(--term)"); });
    var W = this.clientWidth, H = this.clientHeight;
    // 高さ：度数・相対度数・累積度数
    var heights = function(c, n){ var h = pl.cum ? S.cumulative(c) : c.slice(); return pl.rel ? h.map(function(v){ return v / n; }) : h; };
    // 横軸の範囲と目盛り
    var xr = P.xr, xt = P.xt;
    if (!xr){
      if (bins) xr = pl.poly && !pl.cum ? [S.clean(bins.start - bins.width), S.clean(bins.edges[bins.nb] + bins.width)] : [bins.start, bins.edges[bins.nb]];
      else { var st0 = dotStep(pl.hi - pl.lo); xr = [S.clean(Math.floor(pl.lo / st0 + 1e-9) * st0), S.clean(Math.ceil(pl.hi / st0 - 1e-9) * st0)]; if (xr[0] === xr[1]) xr = [xr[0] - st0, xr[1] + st0]; }
    }
    if (!xt){
      if (bins){
        // 階級の境（度数折れ線のために足した両端の階級には目盛りの数を書かない）
        var ed = bins.edges.filter(function(v){ return v >= xr[0] - 1e-9 && v <= xr[1] + 1e-9; });
        // 目盛りの数が重ならないように間引く（目盛りの数の幅＋12 px が、境の間隔の何個分か）
        var dd0 = Math.max.apply(null, ed.map(function(x){ var mm = String(x).match(/\.(\d+)$/); return mm ? mm[1].length : 0; }).concat([0]));
        var lw0 = Math.max.apply(null, ed.map(function(x){ return est(x.toFixed(dd0), 24); })) + 12;
        var pxBin = (W - (dots ? 56 : 130)) * bins.width / (xr[1] - xr[0]);
        var every = Math.max(Math.ceil(ed.length / 13), Math.ceil(lw0 / Math.max(1, pxBin))); xt = ed.filter(function(x, j){ return j % every === 0; });
      } else { var st1 = dotStep(xr[1] - xr[0]); xt = []; for (var u = Math.ceil(xr[0] / st1 - 1e-9) * st1; u <= xr[1] + st1 * 1e-6; u += st1) xt.push(S.clean(u)); }
    }
    var xf = P.xf !== undefined ? P.xf : Math.max.apply(null, xt.map(function(x){ var m = String(x).match(/\.(\d+)$/); return m ? m[1].length : 0; }).concat([0]));
    // 縦軸（柱状グラフ）
    var yr = P.yr, yt = P.yt, yf = P.yf, top = 1e-9;
    if (!dots){
      pl.ser.forEach(function(s){ top = Math.max(top, Math.max.apply(null, heights(s.counts, s.n))); });
      if (!yr){ var ys = niceStep(top * 1.12 / 5, !pl.rel); yr = [0, S.clean(Math.ceil(top * 1.12 / ys - 1e-9) * ys)]; }
      if (!yt){ var ys2 = niceStep((yr[1] - yr[0]) / 5, !pl.rel); yt = []; for (var q = Math.ceil(yr[0] / ys2 - 1e-9) * ys2; q <= yr[1] + ys2 * 1e-6; q += ys2) yt.push(S.clean(q)); }
      if (yf === undefined) yf = Math.max.apply(null, yt.map(function(x){ var m = String(x).match(/\.(\d+)$/); return m ? m[1].length : 0; }).concat([0]));
    } else { yr = [0, 1]; yt = []; }
    var yl = dots ? "" : P.yl || (pl.cum ? (pl.rel ? (ja ? "累積相対度数" : "Cumulative relative frequency") : (ja ? "累積度数" : "Cumulative frequency")) : pl.rel ? (ja ? "相対度数" : "Relative frequency") : (ja ? "度数" : "Frequency"));
    var yw = Math.max.apply(null, yt.map(function(v){ return est(v.toFixed(yf), 24); }).concat([0]));
    var m = {l: dots ? 28 : Math.max(64, yw + 22 + (yl ? 40 : 0)), r: 28, t: 16, b: P.xl ? 70 : 44};
    // 系列の名前（2 つのとき）：図の上に右寄せで、印と一緒に
    // 2 組の名前はいつも出す（label が無ければ「1 組目」「2 組目」にして知らせる）
    if (two) pl.ser.forEach(function(s, i){ if (!s.label){ s.label = ja ? (i + 1) + " 組目" : "Group " + (i + 1); console.warn("m-hist: series " + (i + 1) + " has no label; write \"label\" for the legend"); } });
    var legendH = two ? 46 : 0;
    // 代表値の名前：図の上の行に、印の線の頭の右か左に置く（ほかの名前と線に重ならない行へ）
    var px0 = m.l, px1 = W - m.r, X = function(v){ return px0 + (v - xr[0]) / (xr[1] - xr[0]) * (px1 - px0); };
    var NAMES = ja ? {mean: "平均値", median: "中央値", mode: "最頻値"} : {mean: "Mean", median: "Median", mode: "Mode"};
    var flags = [];
    pl.marks.forEach(function(mk){
      mk.per.forEach(function(r, si){
        if (!r) return;
        var s = pl.ser[si], txt;
        if (mk.type === "median" && r.cls) txt = (ja ? "中央値の階級 " : "Median class ") + self.fmt(r.cls[0]) + "〜" + self.fmt(r.cls[1]) + P.unit;
        else txt = NAMES[mk.type] + " " + r.xs.map(function(x){ return self.fmt(x); }).join(", ") + P.unit;
        flags.push({mk: mk, s: s, r: r, x: X(r.xs[0]), text: txt, w: est(txt, 24), col: two ? s.col : {mean: "var(--emph)", median: "var(--accent2)", mode: "var(--fg)"}[mk.type],
          dash: {mean: null, median: "12 7", mode: "3 6"}[mk.type]});
      });
    });
    var rows = FLAGS(flags, W, "m-hist");
    m.t = legendH + (rows ? rows * 34 + 14 : 16);
    // 数を棒の上に書く余白（系列が 1 つの柱状グラフ）
    var p = this.p = D.Plot(this, {xr: xr, yr: yr, xt: xt, yt: dots ? [] : yt, xf: xf, yf: yf, xl: P.xl, yl: yl, noY: dots, m: m});
    var axl = p.svg.querySelectorAll("g.axes > line");
    for (var a = 0; a < Math.min(dots ? 1 : 2, axl.length); a++) axl[a].setAttribute("class", "axis");
    var x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
    if (y1 - y0 < 60) console.warn("m-hist: the element (" + W + "×" + H + " px) is too small for the figure; give it more height");
    this.geo = {x0: x0, x1: x1, y0: y0, y1: y1, W: W, H: H};
    var gB = D.el("g", {}, p.svg), gM = D.el("g", {}, p.svg), gP = D.el("g", {}, p.svg), gD = D.el("g", {}, p.svg), gT = D.el("g", {}, p.svg);
    this.heights = heights;
    // 柱状グラフ：系列ごとに階級の数だけの長方形（隙間なし）。2 系列は塗りを薄くして重ね、2 つ目は破線
    if (!dots){
      pl.ser.forEach(function(s, si){
        s.H = heights(s.counts, s.n);
        s.rects = bins.mids.map(function(mid, b){
          var r = D.el("rect", {x: p.x(bins.edges[b]).toFixed(1), width: Math.max(0, p.x(bins.edges[b + 1]) - p.x(bins.edges[b])).toFixed(1), y: y1, height: 0,
            fill: s.col, "fill-opacity": two ? 0.16 : 0.26, stroke: s.col, "stroke-width": two ? 3 : 2.5, opacity: 0, class: "outline"}, gB);
          if (two && si === 1) r.setAttribute("stroke-dasharray", "10 6");
          return r;
        });
        // 棒の上の数（系列が 1 つで、棒の幅に収まるとき）
        var bw = p.x(bins.edges[1]) - p.x(bins.edges[0]);
        s.nums = two ? [] : bins.mids.map(function(mid, b){
          var txt = pl.rel ? s.H[b].toFixed(2) : String(s.H[b]);
          if (est(txt, 24) > bw - 4) return null;
          // 度数折れ線があれば、折れ線が棒の上を通らない側（となりの低い方）に寄せる（累積は右上がりなので左）
          var x = p.x(mid), an = "middle";
          if (pl.poly){
            var hl = b ? s.H[b - 1] : 0, hr = b < bins.nb - 1 ? s.H[b + 1] : 0;
            if (pl.cum || hl <= hr){ x = p.x(bins.edges[b]) + 6; an = "start"; } else { x = p.x(bins.edges[b + 1]) - 6; an = "end"; }
          }
          return D.el("text", {x: x.toFixed(1), y: y1, "font-size": 24, "text-anchor": an, fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 5,
            "paint-order": "stroke", opacity: 0, style: "font-variant-numeric:tabular-nums"}, gT);
        });
        if (s.values){
          // build="values"：値ごとの階級と、その値が積もる前の高さ・後の高さ
          s.drops = s.values.map(function(v, j){
            var b = S.binOf(v, bins.start, bins.width), cb = s.counts.map(function(){ return 0; });
            for (var i = 0; i < j; i++) cb[S.binOf(s.values[i], bins.start, bins.width)]++;
            var before = heights(cb, s.n)[b]; cb[b]++; var after = heights(cb, s.n)[b];
            return {v: v, b: b, before: before, after: after};
          });
        }
      });
      // 落ちる値（build="values"）：1 つの箱と、間隔が広ければその値の数字
      if (pl.build === "values"){
        var bw2 = p.x(bins.edges[1]) - p.x(bins.edges[0]);
        pl.ser.forEach(function(s){
          var show = s.gap >= 0.2;
          s.fall = s.drops.map(function(o){
            var g = D.el("g", {opacity: 0}, gD);
            D.el("rect", {x: (-bw2 / 2 + 4).toFixed(1), y: 0, width: Math.max(2, bw2 - 8).toFixed(1), height: 10, fill: s.col, "fill-opacity": 0.6, stroke: s.col, "stroke-width": 2}, g);
            if (show) D.el("text", {x: 0, y: -8, "font-size": 24, "text-anchor": "middle", fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 5, "paint-order": "stroke"}, g).textContent = self.fmt(o.v);
            return {g: g, rect: g.firstChild};
          });
        });
      }
      // 度数折れ線：両端に度数 0 の階級を足して階級値を結ぶ。累積度数なら階級の右の端を結ぶ
      if (pl.poly){
        pl.ser.forEach(function(s, si){
          var pts = pl.cum ? [[bins.edges[0], 0]].concat(s.H.map(function(h, b){ return [bins.edges[b + 1], h]; }))
                           : [[S.clean(bins.start - bins.width / 2), 0]].concat(s.H.map(function(h, b){ return [bins.mids[b], h]; })).concat([[S.clean(bins.edges[bins.nb] + bins.width / 2), 0]]);
          var P2 = pts.map(function(q){ return [p.x(q[0]), p.y(q[1])]; }), len = 0;
          for (var i = 1; i < P2.length; i++) len += Math.hypot(P2[i][0] - P2[i - 1][0], P2[i][1] - P2[i - 1][1]);
          var col = two ? s.col : "var(--emph)";
          var path = D.el("path", {d: P2.map(function(q, i){ return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(""), fill: "none", stroke: col, "stroke-width": 3.5, "stroke-linejoin": "round", opacity: 0}, gP);
          var acc = 0, vs = P2.map(function(q, i){ if (i) acc += Math.hypot(q[0] - P2[i - 1][0], q[1] - P2[i - 1][1]); return {c: D.el("circle", {cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 5.5, fill: col, opacity: 0}, gP), f: len ? acc / len : 0}; });
          s.poly = {path: path, len: len, vs: vs};
        });
      }
    } else {
      // ドットプロット：値（bins を書けば階級値）の上に、出てきた順に下から積む
      var pos = function(v){ return pl.given ? bins.mids[S.binOf(v, bins.start, bins.width)] : v; };
      var stack = {}, maxS = 1, xs = [];
      pl.ser.forEach(function(s){ s.dpos = s.values.map(function(v){ var x = pos(v), k = String(x); stack[k] = (stack[k] || 0) + 1; maxS = Math.max(maxS, stack[k]); if (xs.indexOf(x) < 0) xs.push(x); return {x: x, lv: stack[k] - 1}; }); });
      xs.sort(function(a2, b2){ return a2 - b2; });
      var gapPx = Infinity; for (var i2 = 1; i2 < xs.length; i2++) gapPx = Math.min(gapPx, p.x(xs[i2]) - p.x(xs[i2 - 1]));
      if (pl.given) gapPx = Math.min(gapPx, p.x(bins.edges[1]) - p.x(bins.edges[0]));
      var R = Math.min(15, (y1 - y0 - 8) / (2 * maxS) - 1.5, isFinite(gapPx) ? gapPx / 2 - 1.5 : 15);
      if (R < 4){ console.warn("m-hist: the dots are too small (" + R.toFixed(1) + " px); give the element more height or fewer values"); R = Math.max(R, 2); }
      this.R = R;
      var shapes = [function(r){ return "M" + r + ",0A" + r + "," + r + " 0 1,1 " + (-r) + ",0A" + r + "," + r + " 0 1,1 " + r + ",0Z"; },
                    function(r){ var s2 = r * 0.86; return "M" + (-s2) + "," + (-s2) + "H" + s2 + "V" + s2 + "H" + (-s2) + "Z"; }];
      pl.ser.forEach(function(s, si){
        s.dots = s.dpos.map(function(o){
          var cx = p.x(o.x), cy = y1 - 3 - R - o.lv * (2 * R + 3);
          return {cx: cx, cy: cy, lv: o.lv, g: D.el("path", {d: shapes[si](R), transform: "translate(" + cx.toFixed(1) + " " + cy.toFixed(1) + ")", fill: s.col, "fill-opacity": 0.9, opacity: 0}, gB)};
        });
        s.maxLv = Math.max.apply(null, s.dots.map(function(o){ return o.lv; }));
      });
    }
    // 系列の名前（2 つのとき）
    var lx = W - m.r;
    pl.ser.slice().reverse().forEach(function(s, ri){
      if (!legendH) return;
      var si = pl.ser.length - 1 - ri, w = est(s.label, 24), sx = lx - w - 12 - 30;
      var g = D.el("g", {opacity: 0}, gT);
      if (dots) D.el("path", {d: si ? "M-10,-10H10V10H-10Z" : "M12,0A12,12 0 1,1 -12,0A12,12 0 1,1 12,0Z", fill: s.col, transform: "translate(" + (sx + 15) + " 24)"}, g);
      else { var sw = D.el("rect", {x: sx, y: 13, width: 30, height: 22, fill: s.col, "fill-opacity": 0.16, stroke: s.col, "stroke-width": 3}, g); if (si) sw.setAttribute("stroke-dasharray", "8 5"); }
      D.mtext(g, sx + 40, 33, s.label, {"font-size": 24, "font-weight": 700, fill: s.col});
      s.leg = g; lx = sx - 32;
    });
    // 代表値の印：軸から名前の行まで伸びる線と名前
    this.flags = flags.map(function(f){
      var base = y0 - 14 - f.row * 34, tipY = base - 9;
      var lines = f.r.xs.map(function(x, j){
        var ln = D.el("line", {x1: p.x(x).toFixed(1), x2: p.x(x).toFixed(1), y1: y1, y2: j ? y0 - 4 : tipY, stroke: f.col, "stroke-width": 3.5, "stroke-linecap": "round", opacity: 0}, gM);
        if (f.dash) ln.setAttribute("stroke-dasharray", f.dash);
        return {el: ln, top: j ? y0 - 4 : tipY};
      });
      var tx = D.mtext(gT, f.a === "start" ? f.x + 8 : f.x - 8, base, f.text, {"text-anchor": f.a, "font-size": 24, "font-weight": 700, fill: f.col, opacity: 0});
      return {f: f, lines: lines, text: tx};
    });
    function niceStep(r, whole){ var e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e, s3 = (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e; return whole ? (s3 === 2.5 ? 2 : Math.max(1, Math.round(s3))) : S.clean(s3); }
    // ドットプロットの目盛り：整数の値で幅が 24 までなら 1 ずつ
    function dotStep(span){ var allInt = pl.ser.every(function(s){ return s.values.every(function(v){ return v === Math.floor(v); }); }); return allInt && span <= 24 ? 1 : niceStep(Math.max(span, 1e-9) / 8, allInt); }
  }
  duration(k){
    var P = this.props, pl = this.plan(), d = 0;
    if (pl.build === "bins"){ if (k >= 1 && k <= pl.bins.nb) d = P.dur * 0.75; }
    else pl.ser.forEach(function(s){ if (s.step === k) d = Math.max(d, s.len); });
    if (k === pl.polyStep) d = Math.max(d, P.dur);
    pl.marks.forEach(function(mk){ if (mk.step === k) d = Math.max(d, 0.7); });
    return d;
  }
  render(k, t, ctx){
    var P = this.props, D = DECK, pl = this.plan(), self = this, vr = this.variant, lecture = ctx && ctx.mode === "lecture", p = this.p, g = this.geo, dur = P.dur;
    // 段階 st の、時刻 at から len 秒の進み（授業の表示では先の段階を薄く：-1 を返す）
    var ph = function(st, at, len){ return st < k ? 1 : st > k ? (lecture ? -1 : 0) : D.prog(t, at, len); };
    var FAINT = 0.45;
    var binStep = function(b){ return pl.build === "bins" ? b + 1 : null; };
    pl.ser.forEach(function(s){
      if (s.leg){ var le = ph(pl.build === "bins" ? 1 : s.step, 0, 0.4); s.leg.setAttribute("opacity", (le < 0 ? FAINT : le).toFixed(3)); }
      if (pl.kind === "dots"){
        // 点：values は 1 つずつ落ちる。whole の fade はそろってフェード、grow は下の段から順に
        var st = s.step, tt = st < k ? Infinity : st > k ? -1 : t;
        s.dots.forEach(function(o, j){
          var op = 1, dy = 0;
          if (st > k){ op = lecture ? FAINT : 0; }
          else if (tt !== Infinity){
            if (pl.build === "values"){ var e = D.prog(tt, j * s.gap, pl.DROP); op = tt >= j * s.gap ? 1 : 0; dy = (1 - e) * (o.cy - (g.y0 - 10)); }
            else if (vr === "grow"){ var span = dur * 0.7, sl = s.maxLv > 0 ? (span - 0.2) / (s.maxLv) : 0; op = D.prog(tt, o.lv * sl, 0.2); }
            else op = D.prog(tt, 0, dur * 0.7);
          }
          o.g.setAttribute("opacity", op.toFixed(3));
          o.g.setAttribute("transform", "translate(" + o.cx.toFixed(1) + " " + (o.cy - dy).toFixed(1) + ")");
        });
        return;
      }
      // 柱状グラフ
      var vals = pl.build === "values" ? null : s.H, cur = s.H.slice(), fall = null;
      if (pl.build === "values"){
        var st2 = s.step;
        if (st2 < k || (st2 > k && lecture)) cur = s.H.slice();
        else if (st2 > k) cur = s.H.map(function(){ return 0; });
        else {
          // 落ちきった値だけを数える
          var cb = s.counts.map(function(){ return 0; });
          s.values.forEach(function(v, j){ if (t >= j * s.gap + pl.DROP) cb[s.drops[j].b]++; });
          cur = self.heights(cb, s.n);
          fall = true;
        }
      }
      s.rects.forEach(function(r, b){
        var st3 = pl.build === "bins" ? binStep(b) : s.step, e = ph(st3, 0, pl.build === "bins" ? dur * 0.75 : dur), h = cur[b], op = 1;
        if (pl.build === "values"){ op = st3 > k ? (lecture ? FAINT : 0) : 1; e = 1; }
        else if (e < 0){ op = FAINT; e = 1; }
        else if (vr === "grow"){ h = s.H[b] * e; op = e > 0 ? 1 : 0; }
        else op = e;
        var yy = p.y(Math.max(0, h));
        r.setAttribute("y", yy.toFixed(1)); r.setAttribute("height", Math.max(0, g.y1 - yy).toFixed(1));
        r.setAttribute("opacity", (h > 0 ? op : 0).toFixed(3));
        var nt = s.nums[b];
        if (nt){
          var no = pl.build === "values" ? (st3 > k ? (lecture ? FAINT : 0) : 1) : (function(){ var e2 = ph(st3, (pl.build === "bins" ? dur * 0.75 : dur) * 0.55, (pl.build === "bins" ? dur * 0.75 : dur) * 0.45); return e2 < 0 ? FAINT : e2; })();
          var hv = pl.build === "values" ? h : s.H[b];
          nt.textContent = pl.rel ? hv.toFixed(2) : String(Math.round(hv));
          nt.setAttribute("y", (p.y(pl.build === "values" ? h : s.H[b]) - 8).toFixed(1));
          nt.setAttribute("opacity", (hv > 0 ? no : 0).toFixed(3));   // 度数 0 の階級には書かない
        }
      });
      if (s.fall) s.fall.forEach(function(f, j){
        var o = s.drops[j], on = fall && t >= j * s.gap && t < j * s.gap + pl.DROP;
        if (!on){ f.g.setAttribute("opacity", 0); return; }
        var e = D.prog(t, j * s.gap, pl.DROP), yTop = p.y(o.after), yBot = p.y(o.before), hh = Math.max(4, yBot - yTop);
        var y = D.lerp(g.y0 - hh - 6, yTop, e);
        f.rect.setAttribute("height", hh.toFixed(1));
        f.g.setAttribute("transform", "translate(" + p.x(pl.bins.mids[o.b]).toFixed(1) + " " + y.toFixed(1) + ")");
        f.g.setAttribute("opacity", 1);
      });
      if (s.poly){
        var e3 = ph(pl.polyStep, 0, dur), po = s.poly;
        if (e3 < 0){ po.path.setAttribute("opacity", FAINT); po.path.removeAttribute("stroke-dasharray"); po.vs.forEach(function(v){ v.c.setAttribute("opacity", FAINT); }); }
        else if (vr === "grow"){
          po.path.setAttribute("stroke-dasharray", po.len.toFixed(1) + " " + (po.len + 10).toFixed(1));
          po.path.setAttribute("stroke-dashoffset", (po.len * (1 - e3)).toFixed(1));
          po.path.setAttribute("opacity", e3 > 0 ? 1 : 0);
          po.vs.forEach(function(v){ v.c.setAttribute("opacity", e3 >= v.f - 1e-6 && e3 > 0 ? 1 : 0); });
        } else { po.path.removeAttribute("stroke-dasharray"); po.path.setAttribute("opacity", e3.toFixed(3)); po.vs.forEach(function(v){ v.c.setAttribute("opacity", e3.toFixed(3)); }); }
      }
    });
    // 代表値の印：fade は線と名前がフェード、grow は線が軸から上へ伸びてから名前
    this.flags.forEach(function(F){
      var e = ph(F.f.mk.step, 0, 0.7);
      F.lines.forEach(function(L){
        var y2 = L.top, op = e;
        if (e < 0) op = FAINT;
        else if (vr === "grow"){ y2 = D.lerp(g.y1, L.top, D.prog(t === Infinity || F.f.mk.step < k ? Infinity : t, 0, 0.45)); op = e > 0 ? 1 : 0; }
        L.el.setAttribute("y2", y2.toFixed(1)); L.el.setAttribute("opacity", op.toFixed(3));
      });
      var te = vr === "grow" ? ph(F.f.mk.step, 0.35, 0.35) : e;
      F.text.setAttribute("opacity", (te < 0 ? FAINT : te).toFixed(3));
    });
  }
});
})();
