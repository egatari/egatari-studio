// m-tree：階層・分類の木（組織図、生物の分類など）を、上の段から順に組み立てる
// <m-tree style="height:480px"><script type="application/json">
//   {"nodes": [{"id": "co", "label": "本社"}, {"id": "a", "label": "営業部", "parent": "co"}, …],
//    "edges": [{"from": "a", "to": "b", "label": "連携"}]}
// （JSON の終わり）</m-tree>
// 座標は書かない（docs/conventions.md §2）。parent のない節がちょうど 1 つ（根）。子は配列の順に並べる
// 配置：親を子の並びの中央に置き、隣り合う部分木は段ごとの輪郭（左右の端）がぶつからないところまで寄せる（Reingold–Tilford の考え方）
// orient：down（既定、上から下）か right（左から右）。link：elbow（既定、かぎ形）か straight（まっすぐ）
// 段階：by="level"（既定、根、それから深さごとに 1 段）か by="node"（深さ優先の順に 1 つずつ）。節の step が勝つ
// edges：親子のほかのつながり（破線、矢印つき）。段階は両端の遅いほう
// 字の大きさは要素の大きさから決め（27 px から）、入らなければ 24 px まで縮める。それでも入らなければ、字は 24 px のまま
// 葉だけの子を 2 段に互い違いに並べ、名前を 2 行に折る。それでも入らなければ要素の箱からはみ出して console.warn（足りない px）
// 見せ方（docs/conventions.md §2.5）：fade（箱が下から 12 px 上がりながら現れてから線を引く、既定）・draw（線を先に引き、
// その先に箱が親の側から 12 px 寄りながら現れる）・grow（箱が親の側から 12 px 寄りながら 0.92 → 1 に大きくなる）。
// 箱の動きはどれも 12 px まで。段階の数・長さ・最後の中身はどれも同じ
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
DECK.define("m-tree", class extends DECK.MotionElement {
  static variants = ["fade", "draw", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        parent: {type: ["string", "integer"]}, step: {type: "integer"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {nodes: [{id: "r", label: "動物"}, {id: "a", label: "脊椎動物", parent: "r"}, {id: "b", label: "無脊椎動物", parent: "r"}]},
    note: "parent のない節（根）はちょうど 1 つ",
  };
  static props = {
    orient: {type: "string", default: "down", doc: "down（上から下、既定）か right（左から右）"},
    by:     {type: "string", default: "level", doc: "段階の分け方：level（深さごと、既定）か node（1 つずつ、深さ優先の順）"},
    link:   {type: "string", default: "elbow", doc: "親子の線：elbow（かぎ形、既定）か straight（まっすぐ）"},
    size:   {type: "number", default: 0, doc: "箱の字の大きさ（px。0 = 27 から入るまで 24 まで縮める）"},
    fade:   {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw:   {type: "number", default: 0.5, doc: "線を引く秒数"},
  };
  // 木の形と段階（mount の前にも段階の数のために使う）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, byId = {}, roots = [];
    var nodes = (d.nodes || []).map(function(n){ var o = {n: n, kids: [], depth: 0}; byId[n.id] = o; return o; });
    nodes.forEach(function(o){
      if (o.n.parent === undefined || o.n.parent === null) roots.push(o);
      else if (!byId[o.n.parent]) throw new Error("m-tree: node " + JSON.stringify(o.n.id) + " has an unknown parent " + JSON.stringify(o.n.parent));
      else byId[o.n.parent].kids.push(o);
    });
    if (roots.length !== 1) throw new Error("m-tree: exactly one node must have no parent (the root); found " + roots.length);
    var order = [], seen = 0;
    (function walk(o, dep){
      if (++seen > nodes.length) throw new Error("m-tree: the parents form a loop");
      o.depth = dep; order.push(o);
      o.kids.forEach(function(c){ c.par = o; walk(c, dep + 1); });
    })(roots[0], 0);
    if (order.length !== nodes.length) throw new Error("m-tree: the parents form a loop");
    var byNode = P.by === "node";
    order.forEach(function(o, i){ o.step = o.n.step !== undefined ? o.n.step : byNode ? i + 1 : o.depth + 1; o.at = o.n.at || 0; });
    var edges = (d.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) throw new Error("m-tree: edge to an unknown node " + JSON.stringify(a ? e.to : e.from));
      return {e: e, a: a, b: b, step: e.step !== undefined ? e.step : Math.max(a.step, b.step)};
    });
    return (this._plan = {nodes: nodes, order: order, root: roots[0], byId: byId, edges: edges});
  }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var p = this.plan(), m = 1;
    p.nodes.concat(p.edges).forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  mount(){
    var P = this.props, D = DECK, self = this, pl = this.plan();
    this.variant = VARIANT.of(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight, right = P.orient === "right";
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var root = D.el("g", {}, svg), gL = D.el("g", {}, root), gE = D.el("g", {}, root), gN = D.el("g", {}, root);
    // 字の幅の見積もり（和文 1 字 = 1 字幅、ほかは 0.6 字幅。*斜体* などの記号は数えない）
    var plain = function(s){ return String(s).replace(/\*/g, "").replace(/[_^](.)/g, "$1"); };
    var est = function(s){ return [...plain(s)].reduce(function(a, ch){ return a + (/[\u0000-ɏ]/.test(ch) ? 0.6 : 1); }, 0); };
    var texEst = function(s){ return Math.max(1, String(s).replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_\\ ]/g, "").length) * 0.62; };
    var NS = 24, NLH = 30;   // 注（note）の字の大きさと行の高さ
    var levels = 0;
    pl.nodes.forEach(function(o){ levels = Math.max(levels, o.depth + 1); });
    var labW = 0;
    pl.edges.forEach(function(x){ if (x.e.label) labW = Math.max(labW, est(x.e.label) * 24); });
    var edgeRoom = pl.edges.length ? 56 + (labW ? (right ? labW + 14 : 36) : 0) : 0;
    // 名前を 2 行に折る（入らないときだけ）。\n も *_^ もない 4 字以上の名前に限る。空白があれば真ん中に近い空白で、
    // 和文は真ん中あたりで（小さい仮名・長音・句読点を行の頭にしない）。空白のない欧文の 1 語は折らない
    function wrap2(t){
      var ch = [...t], n = ch.length, best = -1;
      if (n < 4 || /[*_^]/.test(t)) return null;
      if (/ /.test(t)){
        ch.forEach(function(c, i){ if (c === " " && (best < 0 || Math.abs(i - n / 2) < Math.abs(best - n / 2))) best = i; });
        return [ch.slice(0, best).join(""), ch.slice(best + 1).join("")];
      }
      if (/^[\u0000-ɏ]+$/.test(t)) return null;
      // 真ん中から 2 字以内で、平仮名の後ろで平仮名でない字の前（「とても長い｜分類」）があればそこで
      var cut = Math.ceil(n / 2), hira = /[ぁ-ゖ]/, d;
      for (d = 0; d <= 2; d++){
        if (cut - d >= 2 && hira.test(ch[cut - d - 1]) && !hira.test(ch[cut - d])){ cut -= d; break; }
        if (d && cut + d <= n - 2 && hira.test(ch[cut + d - 1]) && !hira.test(ch[cut + d])){ cut += d; break; }
      }
      while (cut < n - 1 && /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー、。・）」』]/.test(ch[cut])) cut++;
      return [ch.slice(0, cut).join(""), ch.slice(cut).join("")];
    }
    var wrapOn = false, RG = 14;   // RG：2 段に並べた子の、段の間
    // 大きさ s の字で箱を測る（b：並ぶ向きの幅、d：深さの向きの幅）
    function measure(s){
      pl.nodes.forEach(function(o){
        var n = o.n, lines = n.tex ? [n.tex] : String(n.label || "").split("\n");
        if (wrapOn && !n.tex && lines.length === 1){ var w2 = wrap2(lines[0]); if (w2) lines = w2; }
        var tw = n.tex ? texEst(n.tex) * s : Math.max.apply(null, lines.map(est)) * s;
        o.lines = lines;
        o.w = Math.max(s * 2.4, tw + s * 1.3); o.h = (n.tex ? s * 1.5 : lines.length * s * 1.25) + s * 0.75;
        o.notes = n.note ? String(n.note).split("\n") : [];
        o.nw = o.notes.length ? Math.max.apply(null, o.notes.map(est)) * NS : 0; o.nh = o.notes.length ? o.notes.length * NLH + 4 : 0;
        o.fb = right ? o.h + o.nh : Math.max(o.w, o.nw);
        o.fd = right ? Math.max(o.w, o.nw) : o.h + o.nh;
      });
    }
    // 部分木を置く：段ごとの輪郭 [左, 右] を返し、子の親からのずれ off を決める
    function lay(o, gap){
      var half = o.fb / 2, ks = o.kids;
      if (!ks.length){ o.cont = [[-half, half]]; return; }
      if (o.fold){
        // 葉だけの子を 2 段に互い違いに並べる（row 1 が奥の段）。奥の段への線は手前の段の箱の間を通るので、箱から C 空ける
        var p = [], C = 12;
        ks.forEach(function(c, j){
          c.cont = [[-c.fb / 2, c.fb / 2]];
          if (!j){ p.push(0); return; }
          var v = j % 2 ? p[j - 1] + ks[j - 1].fb / 2 + C : p[j - 1] + C + c.fb / 2;
          if (j >= 2) v = Math.max(v, p[j - 2] + (ks[j - 2].fb + c.fb) / 2 + gap);
          p.push(v);
        });
        var m0 = (p[0] + p[p.length - 1]) / 2, lo = Infinity, hi = -Infinity;
        ks.forEach(function(c, j){ c.off = p[j] - m0; c.row = j % 2; lo = Math.min(lo, c.off - c.fb / 2); hi = Math.max(hi, c.off + c.fb / 2); });
        o.cont = [[-half, half], [lo, hi]];
        return;
      }
      var acc = null, pos = [];
      ks.forEach(function(c){
        c.row = 0;
        lay(c, gap);
        if (!acc){ pos.push(0); acc = c.cont.map(function(a){ return a.slice(); }); return; }
        var sh = -Infinity, dd;
        for (dd = 0; dd < Math.min(acc.length, c.cont.length); dd++) sh = Math.max(sh, acc[dd][1] + gap - c.cont[dd][0]);
        pos.push(sh);
        for (dd = 0; dd < c.cont.length; dd++){
          var l = c.cont[dd][0] + sh, r = c.cont[dd][1] + sh;
          if (dd < acc.length){ acc[dd][0] = Math.min(acc[dd][0], l); acc[dd][1] = Math.max(acc[dd][1], r); } else acc.push([l, r]);
        }
      });
      var mid = (pos[0] + pos[pos.length - 1]) / 2;
      ks.forEach(function(c, i){ c.off = pos[i] - mid; });
      o.cont = [[-half, half]].concat(acc.map(function(a){ return [a[0] - mid, a[1] - mid]; }));
    }
    function breadth(gap){
      lay(pl.root, gap);
      var lo = Infinity, hi = -Infinity;
      pl.root.cont.forEach(function(a){ lo = Math.min(lo, a[0]); hi = Math.max(hi, a[1]); });
      return {lo: lo, hi: hi, span: hi - lo};
    }
    // 深さの向きの段ごとの幅（2 段に並べた子のある段は、奥の段の分だけ広い）
    function depthSum(){
      var ext = [], r2 = [], rowOff = [];
      pl.nodes.forEach(function(o){ if (o.row) r2[o.depth] = Math.max(r2[o.depth] || 0, o.fd); else ext[o.depth] = Math.max(ext[o.depth] || 0, o.fd); });
      r2.forEach(function(e, d){ rowOff[d] = (ext[d] || 0) + RG; ext[d] = rowOff[d] + e; });
      return {ext: ext, rowOff: rowOff, sum: ext.reduce(function(a, b){ return a + b; }, 0)};
    }
    var B = right ? H : W, DA = (right ? W : H) - edgeRoom;
    var gmin = right ? 14 : 22, gmax = right ? 30 : 64, lgmin = right ? 56 : 40, lgmax = right ? 110 : 90;
    // 入れ方を順に試す：字を 27 → 24 px、それでも入らなければ 24 px のまま、葉だけの子の多い親から順に子を 2 段にし、
    // さらに名前を 2 行に折る。字は 24 px より小さくしない（docs/conventions.md §2.3）。どれでも入らなければ、
    // はみ出しのいちばん少ない形で描き、足りない px を console.warn で知らせる
    var cands = P.link === "straight" ? [] : pl.nodes.filter(function(o){ return o.kids.length >= 3 && o.kids.every(function(c){ return !c.kids.length; }); })
      .sort(function(a, b){ return b.kids.length - a.kids.length; });
    var sizes = P.size ? [P.size] : [27, 26, 25, 24], s24 = sizes[sizes.length - 1], tries = [], cfg = null, best = null, nf;
    sizes.forEach(function(z){ tries.push([z, false, 0]); });
    for (nf = 1; nf <= cands.length; nf++) tries.push([s24, false, nf]);
    for (nf = 0; nf <= cands.length; nf++) tries.push([s24, true, nf]);
    var setup = function(t){
      wrapOn = t[1];
      pl.nodes.forEach(function(o){ o.fold = false; o.row = 0; });
      cands.slice(0, t[2]).forEach(function(o){ o.fold = true; });
      measure(t[0]);
      var b = breadth(gmin), d = depthSum();
      return [Math.max(0, b.span - B), Math.max(0, d.sum + (levels - 1) * lgmin - DA)];
    };
    for (var i = 0; i < tries.length && !cfg; i++){
      var miss = setup(tries[i]);
      if (!miss[0] && !miss[1]) cfg = tries[i];
      else if (!best || miss[0] + miss[1] < best.m[0] + best.m[1]) best = {t: tries[i], m: miss};
    }
    var fit = !!cfg;
    if (!fit){ cfg = best.t; console.warn("m-tree: the tree does not fit at " + cfg[0] + " px; it overflows its box by " + Math.ceil(best.m[0]) + " px across and " + Math.ceil(best.m[1]) + " px along the levels (text is not made smaller). Split the tree, shorten the labels or make the element larger"); }
    setup(cfg);
    var s = cfg[0], br, ds;
    // 並ぶ向きの間：入る範囲で広げる
    var gap = gmin;
    if (fit) for (var g = gmax; g > gmin; g -= 2){ if (breadth(g).span <= B){ gap = g; break; } }
    br = breadth(gap); ds = depthSum();
    var lgap = levels > 1 ? Math.max(lgmin, Math.min(lgmax, (DA - ds.sum) / (levels - 1))) : 0;
    var totalD = ds.sum + (levels - 1) * lgap;
    var lvStart = [], acc = 0;
    ds.ext.forEach(function(e, d){ lvStart[d] = acc; acc += e + lgap; });
    // 絶対位置（b：並ぶ向きの中心、d0：その段の始まり）。入らないときは並ぶ向きに中央（両側へ同じだけはみ出す）、深さの向きは端から
    (function place(o, b){ o.b = b; o.kids.forEach(function(c){ place(c, b + c.off); }); })(pl.root, 0);
    var oB = (B - br.span) / 2 - br.lo, oD = Math.max(0, (DA - totalD) / 2);
    var tones = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"]};
    var toneOf = function(t){
      if (tones[t]) return tones[t];
      if (/^(muted|accent2|series-[1-4])$/.test(t || "")) return ["var(--" + t + ")", "var(--bg)", "var(--" + t + ")"];
      return tones.term;
    };
    this.size = s;
    // 箱
    pl.nodes.forEach(function(o){
      var n = o.n, c = toneOf(n.tone), b = o.b + oB, d0 = lvStart[o.depth] + oD + (o.row ? ds.rowOff[o.depth] : 0);
      if (right){ o.x = d0; o.y = b - o.fb / 2; } else { o.x = b - o.w / 2; o.y = d0; }
      o.cx = o.x + o.w / 2; o.cy = o.y + o.h / 2;
      o.g = D.el("g", {opacity: 0}, gN);
      D.el("rect", {class: "box", x: o.x.toFixed(1), y: o.y.toFixed(1), width: o.w.toFixed(1), height: o.h.toFixed(1), rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, o.g);
      if (n.tex) D.svgMath(o.g, o.cx, o.cy + s * 0.36, n.tex, {size: s, anchor: "middle", color: c[2], w: o.w, h: o.h}).firstChild.style.verticalAlign = "top";
      else {
        var lh = s * 1.25, y0 = o.cy - (o.lines.length - 1) * lh / 2 + s * 0.36;
        o.lines.forEach(function(t, j){ D.mtext(o.g, o.cx, y0 + j * lh, t, {"text-anchor": "middle", "font-size": s, fill: c[2]}); });
      }
      o.notes.forEach(function(t, j){
        var ny = o.y + o.h + 4 + NLH * j + NS * 0.95;
        D.mtext(o.g, right ? o.x + 2 : o.cx, ny, t, {"text-anchor": right ? "start" : "middle", "font-size": NS, fill: "var(--muted)"});
      });
      // 線が付く点：入る点（親からの線の終わり）と出る点（子への線の始まり）
      o.inP = right ? [o.x, o.cy] : [o.cx, o.y];
      o.outP = right ? [o.x + o.w, o.cy] : [o.cx, o.y + o.h + o.nh];
    });
    // 親子の線。o.dir：親の中心から箱の中心への向き（draw と grow で箱が寄ってくる向き）
    pl.nodes.forEach(function(o){
      if (!o.par){ o.dir = [0, 1]; return; }
      var dx = o.cx - o.par.cx, dy = o.cy - o.par.cy, dl = Math.hypot(dx, dy) || 1;
      o.dir = [dx / dl, dy / dl];
      var p = o.par, a = p.outP, z = o.inP, pts;
      if (P.link === "straight") pts = [a, z];
      else if (right){ var bx = lvStart[p.depth] + oD + ds.ext[p.depth] + lgap / 2; pts = [a, [bx, a[1]], [bx, z[1]], z]; }
      else { var by = lvStart[p.depth] + oD + ds.ext[p.depth] + lgap / 2; pts = [a, [a[0], by], [z[0], by], z]; }
      o.path = self.poly(pts);
      o.line = D.el("path", {d: "", fill: "none", stroke: "var(--muted)", "stroke-width": 3, "stroke-linejoin": "round"}, gL);
    });
    // そのほかのつながり：外側（down は下、right は右）にふくらむ破線の曲線
    var depthEnd = oD + totalD;
    this.edges = pl.edges.map(function(x){
      var e = x.e, a = x.a, b = x.b;
      var pa = right ? [a.x + a.fd, a.cy] : [a.cx, a.y + a.fd], pb = right ? [b.x + b.fd, b.cy] : [b.cx, b.y + b.fd];
      var sg = right ? (b.cy > a.cy ? 1 : -1) : (b.cx > a.cx ? 1 : -1), q = Math.min(18, (right ? a.fb : a.w) / 4);
      if (right){ pa = [pa[0] + 6, pa[1] + sg * q]; pb = [pb[0] + 10, pb[1] - sg * q]; } else { pa = [pa[0] + sg * q, pa[1] + 6]; pb = [pb[0] - sg * q, pb[1] + 10]; }
      var far = Math.max(right ? pa[0] : pa[1], right ? pb[0] : pb[1]) + 44;
      var mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], ctl = right ? [2 * far - mid[0], mid[1]] : [mid[0], 2 * far - mid[1]];
      // 頂点が far になるように制御点を置く（2 次ベジェの中点 = (端の中点 + 制御点) / 2）
      var pts = [];
      for (var j = 0; j <= 24; j++){
        var u = j / 24, v = 1 - u;
        pts.push([v * v * pa[0] + 2 * u * v * ctl[0] + u * u * pb[0], v * v * pa[1] + 2 * u * v * ctl[1] + u * u * pb[1]]);
      }
      var col = e.tone ? toneOf(e.tone)[0] : "var(--muted)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = D.el("path", {d: "", fill: "none", stroke: col, "stroke-width": 3, "stroke-dasharray": e.dash === false ? "none" : "8 6"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = e.label ? D.mtext(g, right ? far + 10 : (pa[0] + pb[0]) / 2, right ? mid[1] + 8 : far + 30, e.label,
        {"text-anchor": right ? "start" : "middle", "font-size": 24, fill: col, opacity: 0}) : null;
      depthEnd = Math.max(depthEnd, far);
      var after = 0;
      [a, b].forEach(function(o){ if (o.step === x.step) after = Math.max(after, o.at + self.span()); });
      return {g: g, line: line, head: head, lab: lab, path: self.poly(pts), step: x.step, at: e.at !== undefined ? e.at : after};
    });
  }
  // 箱 1 つの動きの長さ（どの見せ方でも同じ）：箱が現れて線を引き終わるまで
  span(){ return this.props.fade * 0.6 + this.props.draw; }
  // 折れ線：点と累積の長さ
  poly(pts){
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts: pts, L: L, len: L[L.length - 1] || 1};
  }
  // 折れ線の始めから割合 f までの部分：{d, end, ang}
  part(pl, f){
    var want = pl.len * Math.max(0, Math.min(1, f)), pts = pl.pts, out = [pts[0]], i = 1;
    for (; i < pts.length && pl.L[i] <= want; i++) out.push(pts[i]);
    var end = out[out.length - 1];
    if (i < pts.length && want > pl.L[i - 1]){
      var u = (want - pl.L[i - 1]) / (pl.L[i] - pl.L[i - 1]);
      end = [DECK.lerp(pts[i - 1][0], pts[i][0], u), DECK.lerp(pts[i - 1][1], pts[i][1], u)];
      out.push(end);
    }
    var pv = out.length > 1 ? out[out.length - 2] : pts[0], nx = i < pts.length ? pts[i] : end;
    var ang = Math.atan2(end[1] - pv[1], end[0] - pv[0]);
    if (out.length < 2) ang = Math.atan2(nx[1] - end[1], nx[0] - end[0]);
    return {d: "M" + out.map(function(p){ return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"), end: end, ang: ang};
  }
  duration(k){
    var self = this, d = 0, pl = this.plan();
    pl.nodes.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + (o.par ? self.span() : self.props.fade)); });
    (this.edges || []).forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + self.props.draw + (o.lab ? 0.3 : 0)); });
    return d;
  }
  render(k, t, ctx){
    var P = this.props, D = DECK, self = this, vr = this.variant, lect = ctx && (ctx.preview || ctx.mode === "lecture"), S = this.span(), FAINT = 0.45;
    // 段階 step の要素の、その段階の中の時刻（-1 = まだ、Infinity = 済み）
    var tOf = function(step){ return step < k ? Infinity : step > k ? -1 : t; };
    var pr = function(tt, at, dur){ return tt < 0 ? 0 : D.prog(tt, at, dur); };
    // 箱の動きは 12 px まで（docs/conventions.md §1.2：どの見せ方も fade より遠くへ動かさない）
    var OFF = 12;
    this.plan().nodes.forEach(function(o){
      var tt = tOf(o.step), eb, el, sc = 1, m, sh;
      if (!o.par || vr === "fade"){
        // fade：箱が下から 12 px 上がりながら現れ（0.92 → 1）、それから線を引く
        eb = pr(tt, o.at, P.fade); el = pr(tt, o.at + P.fade * 0.6, P.draw); sc = D.lerp(0.92, 1, eb); sh = [0, OFF * (1 - eb)];
      } else if (vr === "draw"){
        // draw：線を先に引き、その先に箱が親の側から 12 px 寄りながら現れる
        el = pr(tt, o.at, S * 0.5); eb = pr(tt, o.at + S * 0.45, S * 0.55); sc = D.lerp(0.92, 1, eb);
        sh = [-o.dir[0] * OFF * (1 - eb), -o.dir[1] * OFF * (1 - eb)];
      } else {
        // grow：箱が親の側から 12 px 寄りながら 0.92 → 1 に大きくなる。線は同時に親から引く
        m = pr(tt, o.at, P.fade); eb = pr(tt, o.at, P.fade * 0.6); el = pr(tt, o.at, S); sc = D.lerp(0.92, 1, m);
        sh = [-o.dir[0] * OFF * (1 - m), -o.dir[1] * OFF * (1 - m)];
      }
      if (lect){
        // 授業の表示：後の段階は薄く、今の段階は薄い状態から濃くなる（位置は動かさない。どの見せ方でも同じ）
        var f = tt < 0 ? FAINT : FAINT + (1 - FAINT) * eb;
        o.g.setAttribute("opacity", f.toFixed(3)); o.g.setAttribute("transform", "");
        if (o.line){ o.line.setAttribute("d", self.part(o.path, 1).d); o.line.setAttribute("opacity", f.toFixed(3)); }
        return;
      }
      o.g.setAttribute("opacity", eb.toFixed(3));
      o.g.setAttribute("transform", sc >= 1 && Math.abs(sh[0]) < 0.01 && Math.abs(sh[1]) < 0.01 ? "" :
        "translate(" + (o.cx + sh[0]).toFixed(2) + " " + (o.cy + sh[1]).toFixed(2) + ") scale(" + sc.toFixed(4) + ") translate(" + (-o.cx).toFixed(2) + " " + (-o.cy).toFixed(2) + ")");
      if (o.line){ o.line.setAttribute("d", el > 0 ? self.part(o.path, el).d : ""); o.line.setAttribute("opacity", el > 0 ? 1 : 0); }
    });
    this.edges.forEach(function(o){
      var tt = tOf(o.step), e = pr(tt, o.at, P.draw), lo = pr(tt, o.at + P.draw * 0.8, 0.3);
      if (lect){ var f = tt < 0 ? FAINT : FAINT + (1 - FAINT) * e; e = 1; lo = 1; o.g.setAttribute("opacity", f.toFixed(3)); }
      else o.g.setAttribute("opacity", e > 0 ? 1 : 0);
      var p = self.part(o.path, e);
      o.line.setAttribute("d", e > 0 ? p.d : "");
      // 矢じりは線が 20px 伸びるまでに大きくなる
      var hs = Math.min(1, e * o.path.len / 20);
      o.head.setAttribute("transform", "translate(" + p.end[0].toFixed(2) + " " + p.end[1].toFixed(2) + ") rotate(" + (p.ang * 180 / Math.PI).toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      if (o.lab) o.lab.setAttribute("opacity", lo.toFixed(3));
    });
  }
});
