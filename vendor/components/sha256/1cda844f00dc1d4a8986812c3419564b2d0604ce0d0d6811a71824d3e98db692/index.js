// m-timeline：年表。出来事を時間の軸の上に 1 つずつ出す。期間（end のある node）は帯にして、重なる期間は段を分ける
// <m-timeline style="height:420px"><script type="application/json">
//   {"nodes": [{"label": "明治維新", "when": "1868"}, {"label": "憲法の発布", "when": "1889-02-11", "note": "2 月 11 日"},
//              {"label": "夏目漱石", "when": "1867", "end": "1916", "lane": "作家"}]}
// （JSON の終わり）</m-timeline>
// 座標はデータに書かない（docs/conventions.md §2）。時刻 when は数か "YYYY" "YYYY-MM" "YYYY-MM-DD"。end があれば期間（帯）
// 出来事（end も lane もない node）：軸の上の点と、日付と名前の箱。箱は軸の上と下に交互に（v なら左と右に）。混んでいれば 2 段にする
// 期間（end のある node）：軸の下（v なら右）の段（lane）に帯で描く。重なる期間は自動で別の段に積む。lane（文字列）で名前の付いた
// 段のまとまりに分け、まとまりの名前を左（v なら上）に書く。lane のある出来事（end なし）は、その段の中の ◆（節目）になる
// 期間があるときは軸に目盛りを付け、出来事の箱はすべて軸の上（v なら左）に置く
// 段階：既定は時刻の順に 1 つずつ（per-step で n 個ずつ、node の step で直接、at で段階の中の開始秒）。軸は最初の出来事と一緒に出る
// 見せ方（docs/conventions.md §2.5）：fade（既定。箱が軸の側から 12 px 寄りながら現れてから軸からの線を引く）・draw（軸からの線を先に引き、
// その先に箱が軸の側から 12 px 寄りながら出る。帯は始まりから終わりへ引く）・grow（箱が軸の側から 12 px 寄りながら 0.92 → 1 に大きくなる。
// 帯は両端が 12 px ずつ伸びる）。箱の動きはどれも 12 px まで。段階の数・長さ・合図・最後の中身はどれも同じ
// 字の幅は字数から見積もる（字の読み込みを待たない）。入らなければ字を 24px まで縮め、それでも入らなければ console.warn
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
(function(){
"use strict";
DECK.define("m-timeline", class extends DECK.MotionElement {
  static variants = ["fade", "draw", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["when"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        when: {type: ["number", "string"]}, whenLabel: {type: "string"}, end: {type: ["number", "string"]}, lane: {type: "string"}, step: {type: "integer"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {nodes: [{id: "a", label: "明治維新", when: "1868", whenLabel: "明治元年"}, {id: "b", label: "憲法の発布", when: "1889", note: "2 月 11 日"},
      {id: "c", label: "日清戦争", when: "1894", end: "1895", tone: "emph"}]},
    note: "when / end: a number or \"YYYY\", \"YYYY-MM\", \"YYYY-MM-DD\"; end is exclusive (\"1912\" is the start of 1912). whenLabel: the date text shown instead of the computed one (when still sets the position). A node with end is a period (a band); lane groups bands into named lanes",
  };
  static props = {
    orient:     {type: "string", default: "h", doc: "h（左から右へ）か v（上から下へ）"},
    scale:      {type: "string", default: "time", doc: "time（時間に比例した間隔）か even（等間隔。間がとても不ぞろいなとき）"},
    "per-step": {type: "number", default: 1, doc: "1 段階に出す出来事の数（0 = 全部を段階 1 で）"},
    size:       {type: "number", default: 26, doc: "名前の字の大きさ（px。入らなければ 24 まで縮める）"},
    dur:        {type: "number", default: 0.6, doc: "1 つの出来事が現れる秒数"},
    stagger:    {type: "number", default: 0.3, doc: "同じ段階の出来事の出だしのずれ（秒）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().items.forEach(function(o){ m = Math.max(m, o.step); });
    this.plan().edges.forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var P = this.props, per = P["per-step"], data = this.data || {}, items = [], T = parseTime;
    (data.nodes || []).forEach(function(n, idx){
      var a = T(n.when);
      if (!a){ console.warn("m-timeline: when=" + JSON.stringify(n.when) + " is not a time (number, \"YYYY\", \"YYYY-MM\" or \"YYYY-MM-DD\"); skipped"); return; }
      var b = null;
      if (n.end !== undefined){
        b = T(n.end);
        if (!b) console.warn("m-timeline: end=" + JSON.stringify(n.end) + " is not a time; drawn as an event");
        else if (b.v < a.v){ console.warn("m-timeline: end " + JSON.stringify(n.end) + " is before when " + JSON.stringify(n.when) + "; swapped"); var x = a; a = b; b = x; }
      }
      items.push({n: n, idx: idx, a: a, b: b, kind: b ? "band" : n.lane !== undefined ? "ms" : "point"});
    });
    // 時刻の順（同じ時刻は書いた順）
    items.sort(function(p, q){ return p.a.v - q.a.v || p.idx - q.idx; });
    var seen = {}, axisStep = Infinity;
    items.forEach(function(o, j){
      o.step = o.n.step !== undefined ? o.n.step : per > 0 ? Math.floor(j / per) + 1 : 1;
      axisStep = Math.min(axisStep, o.step);
    });
    items.forEach(function(o){
      var i = seen[o.step] = (seen[o.step] || 0) + 1;
      o.at0 = o.n.at !== undefined ? o.n.at : +((i - 1) * P.stagger).toFixed(3);
      // 軸と同じ段階なら、軸が引かれ始めてから
      o.at = +(o.at0 + (o.step === axisStep ? 0.35 : 0)).toFixed(3);
    });
    var byId = {};
    items.forEach(function(o){ if (o.n.id !== undefined) byId[o.n.id] = o; });
    var edges = (data.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b){ console.warn("m-timeline: edge to an unknown node", e.from, e.to); return null; }
      var step = e.step !== undefined ? e.step : Math.max(a.step, b.step), at = 0;
      [a, b].forEach(function(o){ if (o.step === step) at = Math.max(at, o.at + P.dur); });
      return {e: e, a: a, b: b, step: step, at: e.at !== undefined ? e.at : at};
    }).filter(Boolean);
    return (this._plan = {items: items, edges: edges, axisStep: axisStep === Infinity ? 1 : axisStep});
  }
  mount(){
    var P = this.props, D = DECK, self = this;
    this.variant = VARIANT.of(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.W = this.clientWidth, H = this.H = this.clientHeight;
    this.hz = P.orient !== "v";
    this.ja = /^ja/i.test(document.documentElement.getAttribute("lang") || "");
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    // 字の大きさ：size から 24 まで、入るまで 2px ずつ縮める
    var L = null;
    for (var s = P.size; ; s = Math.max(24, s - 2)){
      L = this.layout(s);
      if (L.fits || s <= 24) break;
    }
    if (!L.fits) console.warn("m-timeline: the timeline does not fit its box even at 24px (" + L.why + "); make the element larger, shorten the labels or use per-step / scale=\"even\"");
    this.draw(L);
  }
  // ---- 配置（u：軸に沿った位置、c：軸に直交する位置。h なら u = x、v なら u = y）
  layout(size){
    var self = this, P = this.props, hz = this.hz, W = this.W, H = this.H, Lu = hz ? W : H, Lc = hz ? H : W;
    var pl = this.plan(), its = pl.items, ja = this.ja;
    var STEM = 30, ROWG = 10, GAP = 14, LANEG = 6, GROUPG = 16, why = [];
    var points = its.filter(function(o){ return o.kind === "point"; }), lanesIt = its.filter(function(o){ return o.kind !== "point"; }), hasL = lanesIt.length > 0;
    points.forEach(function(o){
      var lines = [{text: o.n.whenLabel !== undefined ? String(o.n.whenLabel) : fmtTime(o.a, ja), size: 24, fill: tone(o.n.tone), weight: 700}].concat(labelLines(o.n, size, textFill(o.n.tone)));
      // 強調の箱（--emph-tint の地）の中の補足は --fg（--muted では 4.5:1 に届かない。共通の決まり §2.3）
      if (o.n.note) lines.push({text: o.n.note, size: 24, fill: o.n.tone === "emph" ? "var(--fg)" : "var(--muted)"});
      o.bs = boxSize(self, lines);
      o.eu = hz ? o.bs.w : o.bs.h; o.ec = hz ? o.bs.h : o.bs.w;
    });
    // 段のまとまり（lane）：出てくる順
    var groups = [], gi = {};
    lanesIt.forEach(function(o){
      var key = o.n.lane === undefined ? "" : String(o.n.lane);
      if (!(key in gi)){ gi[key] = groups.length; groups.push({name: key, items: []}); }
      groups[gi[key]].items.push(o);
    });
    var named = groups.some(function(g){ return g.name; });
    var M = !named ? 0 : hz ? Math.max.apply(null, groups.map(function(g){ return g.name ? est(g.name, 24) * 1.05 : 0; })) + 22 : 44;
    // 時刻 → u
    var ts = [];
    its.forEach(function(o){ ts.push(o.a.v); if (o.b) ts.push(o.b.v); });
    var tmin = Math.min.apply(null, ts), tmax = Math.max.apply(null, ts);
    var uniq = ts.slice().sort(function(a, b){ return a - b; }).filter(function(v, i, a){ return !i || v !== a[i - 1]; });
    var pad0 = 16, pad1 = 36;
    if (!hasL && points.length){
      pad0 = Math.min(points[0].eu / 2, Lu * 0.15);
      pad1 = Math.min(points[points.length - 1].eu / 2, Lu * 0.15) + 24;
    }
    var uA = M + pad0, uB = Lu - pad1, even = P.scale === "even";
    var U = function(v){
      if (tmax === tmin) return (uA + uB) / 2;
      if (even){ var i = uniq.indexOf(v); return uA + (uB - uA) * i / (uniq.length - 1); }
      return uA + (uB - uA) * (v - tmin) / (tmax - tmin);
    };
    points.forEach(function(o){ o.u = U(o.a.v); });
    // 出来事の箱：側（-1 = 上・左、1 = 下・右）と段（0 = 軸の近く）。期間があれば全部 -1 の側
    var tryRows = function(rows){
      var bins = {}, disp = 0, over = false;
      points.forEach(function(o, j){
        o.side = hasL ? -1 : j % 2 ? 1 : -1;
        o.row = rows === 1 ? 0 : hasL ? j % 2 : Math.floor(j / 2) % 2;
        var key = o.side + ":" + o.row;
        (bins[key] = bins[key] || []).push(o);
      });
      Object.keys(bins).forEach(function(key){
        var r = pack(bins[key], 0, Lu, GAP);
        disp = Math.max(disp, r.disp); over = over || r.over;
      });
      var ext = {"-1": [0, 0], "1": [0, 0]};
      points.forEach(function(o){ ext[o.side][o.row] = Math.max(ext[o.side][o.row], o.ec); });
      var se = function(s){ var e = ext[s]; return e[0] ? STEM + e[0] + (e[1] ? ROWG + e[1] : 0) : 0; };
      return {rows: rows, disp: disp, over: over, ext: ext, above: se(-1), below: se(1)};
    };
    // 混んでいて箱が点から離れすぎる（か入らない）なら 2 段
    var R = tryRows(1);
    if (points.length > 2 && (R.over || R.disp > 70)){
      var R2 = tryRows(2), crossOK = function(r){ return r.above + r.below + 16 <= Lc; };
      if ((R2.disp < R.disp || R.over) && (crossOK(R2) || !crossOK(R))) R = R2;
      else R = tryRows(1);
    }
    if (R.over) why.push("the event boxes are wider than the timeline");
    // 期間の段：帯の名前を中・右・左（v なら中・下・上）に置き、u の区間が重ならない段に積む
    var tickExt = 0, ticks = [];
    lanesIt.forEach(function(o){
      // 名前は \n で何行でも（帯を太くするか、帯の横に行を重ねる）。note は最後の行に続けて小さく
      var labs = labelLines(o.n, size), nl = labs.length, lab = labs[0], ws = labs.map(function(l){ return l.tex ? texWidth(self, l) : est(l.text, size); });
      ws[nl - 1] += o.n.note ? est("  " + o.n.note, 24) : 0;
      var tw = Math.max.apply(null, ws), lb = nl * size * 1.25;
      o.tw = tw; o.lab = lab; o.labs = labs;
      // 帯（h）と節目の段の太さ：1 行なら今まで通り 1.7 字
      o.need = Math.max(Math.round(size * 1.7), Math.ceil(lb + (o.kind === "band" ? size * 0.45 : 4)));
      if (o.kind === "band"){
        var u0 = U(o.a.v), u1 = U(o.b.v), len = u1 - u0, th = size * 1.3 * nl;
        o.u0 = u0; o.u1 = u1;
        if (hz){
          o.where = tw + 20 <= len ? "in" : u1 + 10 + tw <= Lu ? "after" : u0 - 10 - tw >= M ? "before" : "in";
          o.lo = o.where === "before" ? u0 - 10 - tw : u0; o.hi = o.where === "after" ? u1 + 10 + tw : u1;
          if (o.where === "in" && tw + 8 > len) why.push("the band \"" + lab.text + "\" is too short for its name");
        } else {
          o.where = th + 8 <= len ? "in" : u1 + 6 + th <= Lu ? "after" : u0 - 6 - th >= M ? "before" : "in";
          o.lo = o.where === "before" ? u0 - 6 - th : u0; o.hi = o.where === "after" ? u1 + 6 + th : u1;
        }
      } else {
        var u = U(o.a.v);
        o.u0 = o.u1 = u;
        if (hz){
          o.where = u + 21 + tw <= Lu ? "after" : "before";
          o.lo = o.where === "before" ? u - 21 - tw : u - 11; o.hi = o.where === "after" ? u + 21 + tw : u + 11;
        } else { o.where = "after"; o.lo = u - Math.max(11, lb / 2 + 2); o.hi = u + Math.max(11, lb / 2 + 2); }
      }
    });
    var lanesExt = 0;
    groups.forEach(function(g, gk){
      g.subs = [];
      g.items.slice().sort(function(p, q){ return p.lo - q.lo || p.idx - q.idx; }).forEach(function(o){
        // 前の帯の終わりと次の帯の始まりが同じ時刻で、名前が外に出ていなければ、同じ段に続けて置ける
        var ok = function(sub){
          var last = sub[sub.length - 1];
          var touch = last.kind === "band" && o.kind === "band" && last.where !== "after" && o.where !== "before" && last.b.v <= o.a.v;
          return touch ? o.lo >= last.hi - 0.5 : o.lo >= last.hi + 10;
        };
        var sub = g.subs.filter(ok)[0];
        if (!sub) g.subs.push(sub = []);
        sub.push(o);
        o.group = gk; o.sub = g.subs.indexOf(sub);
      });
      g.thick = g.subs.map(function(sub){
        var m = 0;
        if (hz){ sub.forEach(function(o){ m = Math.max(m, o.need); }); return m; }
        sub.forEach(function(o){ m = Math.max(m, o.kind === "band" ? o.tw + 24 : 30 + o.tw + 10); });
        return Math.ceil(m);
      });
      g.ext = g.thick.reduce(function(a, b){ return a + b; }, 0) + LANEG * (g.thick.length - 1);
      lanesExt += g.ext + (gk ? GROUPG : 0);
    });
    if (hasL){
      ticks = makeTicks(its, tmin, tmax, uniq, U, uA, uB, even, ja, hz, M, Lu);
      tickExt = hz ? 50 : 18 + Math.max(0, Math.max.apply(null, ticks.map(function(x){ return est(x.text, 24) * 1.1; }))) + 22;
    }
    // c の配置：全体を中央に
    var total = hasL ? R.above + tickExt + lanesExt : R.above + R.below + 16;
    var off = Math.max(0, (Lc - total) / 2), axisC = hasL ? off + R.above : off + R.above + 8;
    if (!hasL && !R.above) axisC = off + 8;
    if (total > Lc + 0.5) why.push("needs " + Math.ceil(total) + "px across the axis, has " + Lc);
    // 出来事の箱の位置
    points.forEach(function(o){
      var ext = R.ext[o.side], near = STEM + (o.row ? ext[0] + ROWG : 0);
      o.c0 = o.side < 0 ? axisC - near - o.ec : axisC + near;
      // 側の段の中で、軸に近い辺をそろえる
      o.cn = o.side < 0 ? o.c0 + o.ec : o.c0;
    });
    // 段の位置
    var c = axisC + tickExt;
    groups.forEach(function(g, gk){
      if (gk) c += GROUPG;
      g.c0 = c; g.subC = [];
      g.thick.forEach(function(t, j){ g.subC.push(c); c += t + (j < g.thick.length - 1 ? LANEG : 0); });
      g.c1 = c;
    });
    return {fits: !why.length, why: why.join("; "), size: size, points: points, lanesIt: lanesIt, groups: groups, ticks: ticks, M: M, axisC: axisC,
      axisU0: hasL ? M : 0, axisU1: Lu - 4, hasL: hasL};
  }
  // (u, c) → [x, y]
  xy(u, c){ return this.hz ? [u, c] : [c, u]; }
  draw(L){
    var D = DECK, self = this, P = this.props, hz = this.hz, svg = this.svg, size = L.size, ja = this.ja;
    var gLane = D.el("g", {}, svg), gStem = D.el("g", {}, svg), gAxis = D.el("g", {opacity: 0}, svg), gBand = D.el("g", {}, svg),
        gDot = D.el("g", {}, svg), gBox = D.el("g", {}, svg), gEdge = D.el("g", {}, svg);
    this.L = L;
    // 軸（印 class="axis"：試験が軸を横切る字を探す）と矢じり、目盛り
    var a0 = this.xy(L.axisU0, L.axisC), a1 = this.xy(L.axisU1, L.axisC);
    this.axis = {g: gAxis, line: D.el("line", {class: "axis", x1: a0[0], y1: a0[1], x2: a0[0], y2: a0[1], stroke: "var(--muted)", "stroke-width": 5}, gAxis),
      head: D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: "var(--muted)"}, gAxis), p0: a0, p1: a1, ang: hz ? 0 : 90,
      ticks: D.el("g", {opacity: 0}, gAxis)};
    L.ticks.forEach(function(k){
      var p = self.xy(k.u, L.axisC), q = self.xy(k.u, L.axisC + 11);
      D.el("line", {x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: "var(--muted)", "stroke-width": 2}, self.axis.ticks);
      if (hz) D.el("text", {x: k.x.toFixed(1), y: (L.axisC + 40).toFixed(1), "text-anchor": k.anchor, "font-size": size, fill: "var(--muted)"}, self.axis.ticks).textContent = k.text;
      else D.el("text", {x: (L.axisC + 18).toFixed(1), y: (k.u + 9).toFixed(1), "font-size": size, fill: "var(--muted)"}, self.axis.ticks).textContent = k.text;
    });
    // 段のまとまりの名前と、まとまりの間の線
    this.laneLabels = L.groups.map(function(g, gk){
      var e = D.el("g", {opacity: 0}, gLane);
      if (g.name){
        if (hz) D.el("text", {x: 0, y: ((g.c0 + g.c1) / 2 + 8).toFixed(1), "font-size": 24, "font-weight": 700, fill: "var(--fg)"}, e).textContent = g.name;
        else D.el("text", {x: g.c0.toFixed(1), y: (L.M - 14).toFixed(1), "font-size": 24, "font-weight": 700, fill: "var(--fg)"}, e).textContent = g.name;
      }
      if (gk){
        var cs = g.c0 - 8, p = self.xy(L.axisU0, cs), q = self.xy(L.axisU1, cs);
        D.el("line", {x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: "var(--line)", "stroke-width": 1.5, "stroke-dasharray": "4 6"}, e);
      }
      var first = Infinity;
      g.items.forEach(function(o){ first = Math.min(first, o.step); });
      return {g: e, step: first};
    });
    var rects = {};
    // 出来事：点、軸からの線、箱
    this.points = L.points.map(function(o){
      var col = tone(o.n.tone), bs = o.bs, r = hz ? {x: o.u0b, y: o.c0, w: bs.w, h: bs.h} : {x: o.c0, y: o.u0b, w: bs.w, h: bs.h};
      var dot = D.el("circle", {cx: self.xy(o.u, L.axisC)[0], cy: self.xy(o.u, L.axisC)[1], r: 8, fill: col, stroke: "var(--bg)", "stroke-width": 2.5, opacity: 0}, gDot);
      // 箱の軸に近い辺の、点にいちばん近いところへ線を引く
      var ua = Math.max(o.u0b + 14, Math.min(o.u0b + o.eu - 14, o.u));
      var p0 = self.xy(o.u, L.axisC), p1 = self.xy(ua, o.cn);
      var stem = D.el("line", {x1: p0[0], y1: p0[1], x2: p0[0], y2: p0[1], stroke: "var(--muted)", "stroke-width": 3, opacity: 0}, gStem);
      var g = D.el("g", {opacity: 0}, gBox);
      D.el("rect", {class: "box", x: r.x.toFixed(1), y: r.y.toFixed(1), width: bs.w, height: bs.h, rx: 10, fill: boxFill(o.n.tone), stroke: col, "stroke-width": o.n.tone === "emph" ? 3 : 2.2}, g);
      boxDraw(self, g, r.x, r.y, bs);
      rects[o.n.id] = r;
      // 軸から箱へ向かう向き（箱は軸の側から寄ってくる）
      return {o: o, g: g, dot: dot, stem: stem, p0: p0, p1: p1, cx: r.x + bs.w / 2, cy: r.y + bs.h / 2, dir: hz ? [0, o.side] : [o.side, 0]};
    });
    // 期間（帯）と節目（◆）
    this.lanes = L.lanesIt.map(function(o){
      var g0 = L.groups[o.group], c0 = g0.subC[o.sub], th = g0.thick[o.sub], col = tone(o.n.tone);
      var g = D.el("g", {opacity: 0}, gBand), lg = D.el("g", {}), rect = null, dia = null, r;
      var noteSpan = function(t){ if (o.n.note){ var s = D.el("tspan", {"font-size": 24, fill: "var(--muted)"}, t); s.textContent = "  " + o.n.note; } return t; };
      // 名前の行を、行の塊の中心 yc に合わせて書く
      var text = function(x, yc, anchor, lh){
        var nl = o.labs.length, y0 = yc - (nl - 1) * lh / 2 + size * 0.36;
        o.labs.forEach(function(l, j){
          if (l.tex){ D.svgMath(lg, x, y0 + j * lh, l.tex, {size: size, anchor: anchor, color: "var(--fg)", w: o.tw + 8, h: size * 1.6}).firstChild.style.verticalAlign = "top"; return; }
          var t = D.mtext(lg, x, y0 + j * lh, l.text, {"text-anchor": anchor, "font-size": size, fill: "var(--fg)"});
          if (j === nl - 1) noteSpan(t);
        });
      };
      if (o.kind === "band"){
        // 隣の帯と線が重ならないように両端を 1.5px 内へ
        var u0 = o.u0 + 1.5, u1 = Math.max(o.u0 + 3, o.u1 - 1.5);
        r = hz ? {x: u0, y: c0, w: u1 - u0, h: th} : {x: c0, y: u0, w: th, h: u1 - u0};
        rect = D.el("rect", {class: "box", x: r.x.toFixed(1), y: r.y.toFixed(1), width: r.w.toFixed(1), height: r.h.toFixed(1), rx: 8, fill: tint(col, 26), stroke: col, "stroke-width": 2}, g);
        if (hz){
          var by = c0 + th / 2, lhh = size * 1.25;
          if (o.where === "in") text((u0 + u1) / 2, by, "middle", lhh);
          else if (o.where === "after") text(o.u1 + 10, by, "start", lhh);
          else text(o.u0 - 10, by, "end", lhh);
        } else {
          var bx = c0 + th / 2, th2 = size * 1.3, blk = th2 * o.labs.length;
          if (o.where === "in") text(bx, (u0 + u1) / 2, "middle", th2);
          else if (o.where === "after") text(bx, o.u1 + 6 + blk / 2, "middle", th2);
          else text(bx, o.u0 - 6 - blk / 2, "middle", th2);
        }
      } else {
        var mc = hz ? [o.u0, c0 + th / 2] : [c0 + 15, o.u0];
        dia = D.el("path", {d: "M0,-12L12,0L0,12L-12,0Z", fill: col, stroke: "var(--bg)", "stroke-width": 2, transform: "translate(" + mc[0].toFixed(1) + " " + mc[1].toFixed(1) + ")"}, g);
        r = {x: mc[0] - 12, y: mc[1] - 12, w: 24, h: 24};
        if (hz) text(o.where === "after" ? o.u0 + 21 : o.u0 - 21, mc[1], o.where === "after" ? "start" : "end", size * 1.25);
        else text(c0 + 33, o.u0, "start", size * 1.25);
      }
      g.appendChild(lg);   // 名前は帯の上に（帯と同じ g の中：試験は帯の中の字を除く）
      rects[o.n.id] = r;
      return {o: o, g: g, lg: lg, rect: rect, dia: dia, r: r, mc: dia ? (hz ? [o.u0, c0 + th / 2] : [c0 + 15, o.u0]) : null,
        cx: r.x + r.w / 2, cy: r.y + r.h / 2};
    });
    // ほかのつながり（edges）：破線、箱の縁から縁へ
    this.edges = this.plan().edges.map(function(x){
      var e = x.e, A = rects[e.from], B = rects[e.to];
      if (!A || !B) return null;
      var ac = [A.x + A.w / 2, A.y + A.h / 2], bc = [B.x + B.w / 2, B.y + B.h / 2], dx = bc[0] - ac[0], dy = bc[1] - ac[1], Lh = Math.hypot(dx, dy) || 1;
      var cut = function(R, c, sx, sy){ var s = Math.min(sx ? (R.w / 2 + 6) / Math.abs(sx) : Infinity, sy ? (R.h / 2 + 6) / Math.abs(sy) : Infinity); return [c[0] + sx * s, c[1] + sy * s]; };
      var p0 = cut(A, ac, dx / Lh, dy / Lh), p1 = cut(B, bc, -dx / Lh, -dy / Lh), col = e.tone ? tone(e.tone) : "var(--muted)";
      var g = D.el("g", {opacity: 0}, gEdge), ux = (p1[0] - p0[0]), uy = (p1[1] - p0[1]), l2 = Math.hypot(ux, uy) || 1;
      D.el("line", {x1: p0[0].toFixed(1), y1: p0[1].toFixed(1), x2: (p1[0] - ux / l2 * 14).toFixed(1), y2: (p1[1] - uy / l2 * 14).toFixed(1), stroke: col, "stroke-width": 3, "stroke-dasharray": e.dash === false ? "none" : "8 6"}, g);
      D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col, transform: "translate(" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + ") rotate(" + (Math.atan2(uy, ux) * 180 / Math.PI).toFixed(1) + ")"}, g);
      if (e.label){
        var nx = -uy / l2, ny = ux / l2;
        if (ny > 0){ nx = -nx; ny = -ny; }
        D.mtext(g, (p0[0] + p1[0]) / 2 + nx * 16, (p0[1] + p1[1]) / 2 + ny * 16, e.label, {"text-anchor": "middle", "font-size": 24, fill: e.tone ? col : "var(--muted)"});
      }
      return {g: g, step: x.step, at: x.at};
    }).filter(Boolean);
  }
  duration(k){
    var P = this.props, pl = this.plan(), d = k === pl.axisStep ? 0.5 : 0;
    pl.items.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.dur); });
    pl.edges.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + 0.4); });
    return d;
  }
  // 同じ段階の 2 つ目からの出来事の開始時刻（口述原稿の {cue} に合わせられる）
  cues(k){
    var c = [];
    this.plan().items.forEach(function(o){ if (o.step === k && o.at0 > 0 && c.indexOf(o.at) < 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var D = DECK, P = this.props, self = this, vr = this.variant, T = P.dur, hz = this.hz;
    var lecture = !!(ctx && ctx.mode === "lecture"), pl = this.plan();
    // 段階 s の、start から len 秒の進み（前の段階なら 1、後の段階なら 0）
    var pr = function(s, start, len){ return s < k ? 1 : s > k ? 0 : D.prog(t, start, len); };
    // 授業の表示：後の段階は最後の形を薄く（0.45）、今の段階は 0.45 から濃くなる。形は動かさない（どの見せ方でも同じ）
    var faint = function(s, start){ return s < k ? 1 : s > k ? 0.45 : 0.45 + 0.55 * D.prog(t, start, T); };
    // 軸
    var A = this.axis, ea = lecture ? 1 : pr(pl.axisStep, 0, 0.5);
    var ax = D.lerp(A.p0[0], A.p1[0], ea), ay = D.lerp(A.p0[1], A.p1[1], ea);
    A.line.setAttribute("x2", (hz ? ax - 12 * Math.min(1, ea * 8) : ax).toFixed(2)); A.line.setAttribute("y2", (hz ? ay : ay - 12 * Math.min(1, ea * 8)).toFixed(2));
    A.head.setAttribute("transform", "translate(" + ax.toFixed(2) + " " + ay.toFixed(2) + ") rotate(" + A.ang + ") scale(" + Math.min(1, ea * 8).toFixed(3) + ")");
    A.g.setAttribute("opacity", lecture ? faint(pl.axisStep, 0).toFixed(3) : ea > 0 ? 1 : 0);
    A.ticks.setAttribute("opacity", (lecture ? 1 : pr(pl.axisStep, 0.2, 0.4)).toFixed(3));
    this.laneLabels.forEach(function(o){ o.g.setAttribute("opacity", (lecture ? faint(o.step, 0) : pr(o.step, 0, 0.45)).toFixed(3)); });
    var setLine = function(ln, p0, p1, e){
      ln.setAttribute("x1", p0[0].toFixed(2)); ln.setAttribute("y1", p0[1].toFixed(2));
      ln.setAttribute("x2", D.lerp(p0[0], p1[0], e).toFixed(2)); ln.setAttribute("y2", D.lerp(p0[1], p1[1], e).toFixed(2));
      ln.setAttribute("opacity", e > 0 ? 1 : 0);
    };
    // 箱の動きは 12 px まで（docs/conventions.md §1.2：どの見せ方も fade より遠くへ動かさない）。箱は軸の側から寄ってくる
    var OFF = 12;
    var place = function(g, cx, cy, s, d, e){
      var dx = -d[0] * OFF * (1 - e), dy = -d[1] * OFF * (1 - e);
      g.setAttribute("transform", s >= 1 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? "" :
        "translate(" + (cx + dx).toFixed(2) + " " + (cy + dy).toFixed(2) + ") scale(" + s.toFixed(4) + ") translate(" + (-cx).toFixed(2) + " " + (-cy).toFixed(2) + ")");
    };
    this.points.forEach(function(o){
      var s = o.o.step, st = o.o.at, boxO, boxS = 1, e = 1, dotO, stemE;
      if (lecture){ boxO = dotO = faint(s, st); stemE = 1; o.stem.setAttribute("opacity", 1); }
      else if (vr === "draw"){
        // 軸からの線を先に引き、その先に箱が軸の側から 12 px 寄りながら出る
        dotO = pr(s, st, 0.2 * T); stemE = pr(s, st, 0.5 * T); e = boxO = pr(s, st + 0.45 * T, 0.55 * T); boxS = 0.92 + 0.08 * e;
      } else if (vr === "grow"){
        // 線を引きながら、箱が軸の側から 12 px 寄り、0.92 → 1 に大きくなる
        dotO = pr(s, st, 0.2 * T); stemE = pr(s, st, 0.4 * T);
        e = pr(s, st + 0.25 * T, 0.75 * T); boxO = Math.min(1, e * 1.6); boxS = 0.92 + 0.08 * e;
      } else {
        // fade：箱が軸の側から 12 px 寄りながら現れてから、線を引く
        e = pr(s, st, 0.75 * T); boxO = dotO = e; boxS = 0.92 + 0.08 * e; stemE = pr(s, st + 0.5 * T, 0.5 * T);
      }
      o.g.setAttribute("opacity", boxO.toFixed(3));
      place(o.g, o.cx, o.cy, boxS, o.dir, lecture ? 1 : e);
      o.dot.setAttribute("opacity", dotO.toFixed(3));
      setLine(o.stem, o.p0, o.p1, stemE);
      if (lecture) o.stem.setAttribute("opacity", dotO.toFixed(3));
    });
    // 期間と節目：段は軸の下（v なら右）。fade と grow は軸の側から 12 px 寄りながら現れる（grow は帯が両端 12 px ずつ伸びる）。
    // draw は帯を始まりから終わりへ引き（線を引くのと同じ）、名前は後から
    var ld = hz ? [0, 1] : [1, 0];
    this.lanes.forEach(function(o){
      var s = o.o.step, st = o.o.at, gO = 1, labO = 1, e = 1, w = 1, grow = 0, diaS = 1;
      if (lecture) gO = faint(s, st);
      else if (vr === "fade"){ e = gO = pr(s, st, 0.75 * T); }
      else if (vr === "grow"){ e = pr(s, st, 0.75 * T); gO = Math.min(1, e * 1.6); grow = 1 - e; if (o.dia) diaS = 0.92 + 0.08 * e; }
      else {
        w = pr(s, st, 0.7 * T); labO = pr(s, st + 0.6 * T, 0.4 * T); gO = w > 0 ? 1 : 0;
        if (o.dia){ diaS = pr(s, st, 0.4 * T); labO = pr(s, st + 0.4 * T, 0.6 * T); gO = diaS > 0 ? 1 : 0; }
      }
      o.g.setAttribute("opacity", gO.toFixed(3));
      o.lg.setAttribute("opacity", labO.toFixed(3));
      place(o.g, o.cx, o.cy, 1, ld, e);
      if (o.rect){
        var r = o.r, len = hz ? r.w : r.h, l = len * w, p = hz ? r.x : r.y;
        if (grow > 0){ var cut = Math.min(len * 0.15, 2 * OFF) * grow; l = len - cut; p += cut / 2; }
        o.rect.setAttribute(hz ? "x" : "y", p.toFixed(2)); o.rect.setAttribute(hz ? "width" : "height", Math.max(0, l).toFixed(2));
      }
      if (o.dia) o.dia.setAttribute("transform", "translate(" + o.mc[0].toFixed(1) + " " + o.mc[1].toFixed(1) + ")" + (diaS < 1 ? " scale(" + diaS.toFixed(4) + ")" : ""));
    });
    this.edges.forEach(function(o){ o.g.setAttribute("opacity", (lecture ? faint(o.step, o.at) : pr(o.step, o.at, 0.4)).toFixed(3)); });
  }
});

// ---- 下の関数は m-timeline の中だけで使う（字の幅の見積もり・箱の中の行・詰め方・目盛り）
// 時刻：{v: 年を単位にした数, p: "n" | "y" | "m" | "d", y, m, d}。読めなければ null（日付の計算は Date を使わない）
function parseTime(v){
  if (typeof v === "number") return isFinite(v) ? {v: v, p: "n", y: v} : null;
  var m = /^\s*(-?\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?\s*$/.exec(String(v));
  if (!m) return null;
  var y = +m[1], mo = m[2] ? +m[2] : 1, d = m[3] ? +m[3] : 1;
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  var ml = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > ml[mo - 1]) return null;
  var doy = d - 1;
  for (var i = 0; i < mo - 1; i++) doy += ml[i];
  return {v: y + doy / (leap ? 366 : 365), p: m[3] ? "d" : m[2] ? "m" : "y", y: y, m: mo, d: d};
}
function tone(t){ return "var(--" + (/^(term|emph|muted|accent2|series-[1-4])$/.test(t || "") ? t : "term") + ")"; }
// 箱の地と字の色（m-tree・m-fishbone と同じ決まり）：term と emph はテーマの薄い色の地、emph は字も emph
function boxFill(t){ return t === "emph" ? "var(--emph-tint)" : /^(muted|accent2|series-[1-4])$/.test(t || "") ? tint(tone(t), 12) : "var(--term-tint)"; }
function textFill(t){ return t === "emph" ? "var(--emph)" : "var(--fg)"; }
function tint(c, p){ return "color-mix(in srgb," + c + " " + p + "%,var(--bg))"; }
// 字の幅（px）：数字 0.6 字、ほかの欧文 0.62 字、空白 0.3 字、和文 1 字。*斜体* の * は数えない
function est(s, fs){
  var w = 0;
  for (var ch of String(s).replace(/\*/g, "")) w += /[0-9]/.test(ch) ? 0.6 : ch === " " ? 0.3 : /[\u0000-ɏ]/.test(ch) ? 0.62 : /[｡-ﾟ]/.test(ch) ? 0.5 : 1;
  return w * fs;
}
// KaTeX の式の幅：一度置いて測る
function texWidth(el, l){
  var g = DECK.el("g", {opacity: 0}, el.svg), fo = DECK.svgMath(g, 0, 0, l.tex, {size: l.size, anchor: "start"});
  var w = Math.max(0, (+fo.getAttribute("width") || 4) - 4);
  el.svg.removeChild(g);
  return w;
}
function labelLines(n, size, fill){
  fill = fill || "var(--fg)";
  if (n.tex) return [{tex: n.tex, size: size, fill: fill}];
  return String(n.label || "").split("\n").map(function(s){ return {text: s, size: size, fill: fill}; });
}
// 箱の大きさと行の位置（基線は前の行の下 0.3 字 ＋ 今の行の 1.12 字：字の箱どうしが重ならない）
function boxSize(el, lines){
  var w = 0, y = 10, prev = null;
  lines.forEach(function(l){
    l.w = l.tex ? texWidth(el, l) : est(l.text, l.size) * (l.weight ? 1.05 : 1);
    w = Math.max(w, l.w);
    y += prev ? 0.3 * prev.size + 1.12 * l.size : 0.9 * l.size;
    l.y = y; prev = l;
  });
  return {w: Math.ceil(w + 32), h: Math.ceil(y + 0.28 * prev.size + 10), lines: lines};
}
function boxDraw(el, g, x, y, bs){
  bs.lines.forEach(function(l){
    if (l.tex) DECK.svgMath(g, x + bs.w / 2, y + l.y, l.tex, {size: l.size, anchor: "middle", color: l.fill, w: l.w + 8, h: l.size * 1.6}).firstChild.style.verticalAlign = "top";
    else DECK.mtext(g, x + bs.w / 2, y + l.y, l.text, {"text-anchor": "middle", "font-size": l.size, fill: l.fill, "font-weight": l.weight || 400});
  });
}
// 箱を軸に沿って並べる：望む位置（o.u）を中心に、重ならないように塊にまとめてずらす（順は変えない）。o.u0b に左（上）端
function pack(list, A, B, gap){
  var cl = [];
  list.slice().sort(function(p, q){ return p.u - q.u; }).forEach(function(o){
    var c = {items: [o], ext: o.eu, want: o.u - o.eu / 2};
    c.start = Math.max(A, Math.min(B - c.ext, c.want));
    cl.push(c);
    while (cl.length > 1){
      var p = cl[cl.length - 2], q = cl[cl.length - 1];
      if (p.start + p.ext + gap <= q.start + 0.01) break;
      // 塊をまとめ、望む位置の平均に置く
      var items = p.items.concat(q.items), ext = 0, sum = 0;
      items.forEach(function(x, j){ sum += x.u - x.eu / 2 - ext; ext += x.eu + (j < items.length - 1 ? gap : 0); });
      cl.splice(cl.length - 2, 2, {items: items, ext: ext, want: sum / items.length, start: Math.max(A, Math.min(B - ext, sum / items.length))});
    }
  });
  var disp = 0, over = false;
  cl.forEach(function(c){
    if (c.ext > B - A + 0.5) over = true;
    var s = c.start;
    c.items.forEach(function(x){ x.u0b = s; disp = Math.max(disp, Math.abs(s + x.eu / 2 - x.u)); s += x.eu + gap; });
  });
  return {disp: disp, over: over};
}
function fmtTime(a, ja){
  var neg = a.y < 0, y = Math.abs(a.y);
  if (a.p === "n") return (a.v < 0 ? "−" : "") + String(Math.abs(a.v));
  if (ja){
    var s = (neg ? "前" : "") + y + "年";
    return a.p === "y" ? s : a.p === "m" ? s + a.m + "月" : s + a.m + "月" + a.d + "日";
  }
  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };
  return (neg ? "−" : "") + y + (a.p === "y" ? "" : "-" + p2(a.m) + (a.p === "d" ? "-" + p2(a.d) : ""));
}
// 目盛り（期間があるときだけ）：time は切りのよい間隔（年・月・数）、even は使った時刻ごと。字が重なるものは間引く
function makeTicks(its, tmin, tmax, uniq, U, uA, uB, even, ja, hz, M, Lu){
  var out = [], T = parseTime;
  var minGap = function(w){ return hz ? w + 24 : 24 * 1.3 + 10; };
  if (even){
    var txt = {};
    its.forEach(function(o){ [o.a, o.b].forEach(function(a){ if (a && !(a.v in txt)) txt[a.v] = fmtTime(a, ja).replace(/年$/, ""); }); });
    uniq.forEach(function(v){ out.push({u: U(v), text: txt[v]}); });
  } else if (tmax > tmin){
    var fine = its.some(function(o){ return o.a.p === "m" || o.a.p === "d" || (o.b && (o.b.p === "m" || o.b.p === "d")); });
    var span = tmax - tmin, px = (uB - uA) / span;
    if (fine && span <= 4){
      var y0 = Math.floor(tmin), m0 = 0;
      [1, 2, 3, 6, 12].some(function(stp){
        out = [];
        for (var mi = y0 * 12; mi <= Math.ceil(tmax) * 12; mi += stp){
          var y = Math.floor(mi / 12), m = mi - y * 12 + 1, v = T(y + "-" + m).v;
          if (v < tmin - 1e-9 || v > tmax + 1e-9) continue;
          out.push({u: U(v), y: y, m: m});
        }
        out.forEach(function(k, j){ k.text = ja ? (j === 0 || k.m === 1 ? k.y + "年" : "") + k.m + "月" : k.y + "-" + (k.m < 10 ? "0" : "") + k.m; });
        var wmax = Math.max.apply(null, out.map(function(k){ return est(k.text, 24); }).concat([0]));
        return out.length < 2 || px * stp / 12 >= minGap(wmax);
      });
    } else {
      var ints = its.every(function(o){ return o.a.p !== "n" || Math.round(o.a.v) === o.a.v; });
      var cands = [];
      for (var e = -3; e <= 6; e++) [1, 2, 5].forEach(function(m){ cands.push(m * Math.pow(10, e)); });
      cands.some(function(stp){
        if (ints && stp < 1) return false;
        var dg = Math.max(0, -Math.floor(Math.log10(stp) + 1e-9));
        out = [];
        for (var v = Math.ceil(tmin / stp - 1e-9) * stp; v <= tmax + 1e-9; v += stp) out.push({u: U(v), text: (v < 0 ? "−" : "") + Math.abs(v).toFixed(dg)});
        var wmax = Math.max.apply(null, out.map(function(k){ return est(k.text, 24); }).concat([0]));
        return out.length <= 12 && px * stp >= minGap(wmax);
      });
    }
  }
  // 位置と寄せ：両端で外に出ないように。重なるものは間引く
  var kept = [], last = -Infinity;
  out.forEach(function(k){
    var w = est(k.text, 24);
    if (hz){
      k.x = k.u; k.anchor = "middle";
      if (k.u - w / 2 < M){ k.x = Math.max(M, k.u - 6); k.anchor = "start"; }
      if (k.u + w / 2 > Lu){ k.x = Lu; k.anchor = "end"; }
      var lo = k.anchor === "start" ? k.x : k.anchor === "end" ? k.x - w : k.x - w / 2;
      if (lo < last + 16) return;
      last = lo + w;
    } else {
      if (k.u - 24 < last + 6) return;
      last = k.u + 8;
    }
    kept.push(k);
  });
  return kept;
}
})();
