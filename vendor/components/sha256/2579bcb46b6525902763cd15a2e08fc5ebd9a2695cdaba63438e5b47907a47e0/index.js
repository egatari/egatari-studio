// m-network：グラフの探索と巡回路。頂点（作者の座標）と辺（重み・向き）を描き、ステップごとに今の頂点・候補・訪れた頂点を
// 塗り分け、選んだ辺を 1 本ずつ引き、経路の長さなどの合計を出す。数値と状態は、探索を実際に走らせたスクリプトの出力を書く
// <m-network style="height:480px"><script type="application/json">
//   {"nodes": [{"id": "A", "x": 0, "y": 0}, {"id": "B", "x": 4, "y": 0}, {"id": "C", "x": 2, "y": 3}],
//    "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 3}, {"from": "B", "to": "C", "w": 2}],
//    "frontierKind": "queue", "total": {"label": "経路の長さ"},
//    "steps": [{"current": "A", "visited": ["A"], "frontier": ["B", "C"], "parent": {"B": "A", "C": "A"}},
//              {"current": "C", "visited": ["A", "C"], "frontier": ["B"], "take": [["A", "C"]], "total": 3}]}
// （JSON の終わり）</m-network>
// 座標は作者の単位のまま（y は下向き）。パーツが縦横の比を保って枠に収める。
// ステップの状態：current・visited・frontier・total は書いたステップからその値（書かなければ前のステップのまま。current の null で消す）。
// parent は前のステップに足していく（null で消す）。take と drop は選んだ辺の集まりを前のステップから増減する。
// 状態はステップ 1..k だけから決まる（(k, t) だけで画面が決まる）。
// 色：今の頂点 --emph（太い輪）、候補 --accent2（点線の輪と下の帯）、訪れた頂点 --muted の塗り、選んだ辺と探索の木 --term、ほかの辺 --line。
// 確かめること（data）：知らない id、ない辺の take（complete のときを除く）、選んでいない辺の drop、
// 選んだ辺がすべて重みを持つときに total が重みの和と合わないこと（total.check: false で確かめない）
egatariParts.define({name: "network", version: "2.2.0", requires: {base: "1.3.0"}, element: "m-network"}, function(deps){
"use strict";
var base = deps.base;
var ID = {type: "string"};
var PAIR = {type: "array", minItems: 2, maxItems: 2, items: ID};
var KIND = {
  queue: {ja: "待ち行列（左が先頭）", en: "Queue (front on the left)"},
  stack: {ja: "スタック（右が上）", en: "Stack (top on the right)"},
  pq:    {ja: "優先度付きキュー", en: "Priority queue"},
  set:   {ja: "候補", en: "Frontier"},
};
return class extends base.MotionElement {
  static partName = "network";
  static preview = "none";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["steps"], anyOf: [{required: ["nodes"]}, {required: ["layout"]}], properties: {
      directed: {type: "boolean"},
      complete: {type: "boolean"},
      stochastic: {type: "boolean"},
      frontierKind: {type: "string", enum: ["queue", "stack", "pq", "set"]},
      total: {type: "object", additionalProperties: false, properties: {label: {type: "string"}, unit: {type: "string"}, digits: {type: "integer"}, check: {type: "boolean"}, of: {type: "string", enum: ["path", "taken"]}}},
      nodes: {type: "array", minItems: 1, maxItems: 24, items: {type: "object", additionalProperties: false, required: ["id", "x", "y"], properties: {
        id: ID, x: {type: "number"}, y: {type: "number"}, label: {type: "string"}, shape: {type: "string", enum: ["circle", "ellipse", "box"]}, observed: {type: "boolean"}}}},
      edges: {type: "array", maxItems: 60, items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: ID, to: ID, w: {type: "number"}, bi: {type: "boolean"}}}},
      plates: {type: "array", maxItems: 4, items: {type: "object", additionalProperties: false, required: ["nodes"], properties: {nodes: {type: "array", minItems: 1, items: ID}, label: {type: "string"}}}},
      layout: {type: "string", enum: ["trellis"]},
      states: {type: "array", minItems: 1, maxItems: 6, items: ID},
      T: {type: "integer"},
      transitions: {type: "array", maxItems: 36, items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {from: ID, to: ID, w: {type: "number"}}}},
      steps: {type: "array", minItems: 1, maxItems: 40, items: {type: "object", additionalProperties: false, properties: {
        current: {type: ["string", "null"]},
        visited: {type: "array", items: ID},
        frontier: {type: "array", items: {type: ["string", "array"]}},
        parent: {type: "object"},
        take: {type: "array", items: PAIR},
        drop: {type: "array", items: PAIR},
        total: {type: "number"},
        note: {type: "string"}}}}}},
    example: {nodes: [{id: "A", x: 0, y: 0}, {id: "B", x: 4, y: 0}], edges: [{from: "A", to: "B", w: 4}],
      steps: [{current: "A", frontier: ["B"]}, {current: "B", take: [["A", "B"]], total: 4}]},
  };
  static props = {
    dur:     {type: "number", default: 0.6, doc: "1 本の辺を引く秒数（頂点の色の変化はその半分）"},
    size:    {type: "number", default: 24, doc: "字の大きさ（px、24 以上）"},
    weights: {type: "bool", default: true, doc: "辺の重みを書く"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return ((this.data || {}).steps || []).length;
  }
  // 書いたデータ。layout: "trellis"（隠れマルコフモデルの格子）なら、状態 × 時刻の頂点（id は "状態@時刻"）と、隣の時刻への遷移の辺に広げる
  get net(){
    if (this._net !== undefined) return this._net;
    var d = this.data || {};
    if (d.layout !== "trellis") return (this._net = d);
    var S = d.states || [], T = Math.max(1, Math.min(8, d.T || 1)), nodes = [], edges = [];
    for (var t = 1; t <= T; t++) S.forEach(function(s, i){ nodes.push({id: s + "@" + t, x: (t - 1) * 3, y: i * 1.6, label: s}); });
    for (var t2 = 1; t2 < T; t2++) (d.transitions || []).forEach(function(e){ edges.push({from: e.from + "@" + t2, to: e.to + "@" + (t2 + 1), w: e.w}); });
    return (this._net = Object.assign({}, d, {nodes: nodes, edges: edges, directed: true, trellisT: T}));
  }
  // 辺の鍵：向きのないグラフでは [A, B] と [B, A] を同じ辺にする
  key(a, b){ return this.directed || a < b ? a + "\u0000" + b : b + "\u0000" + a; }
  // ステップ 0..N の状態と、確かめた結果。データだけから決める（mount の前にも steps が要る）
  plan(){
    if (this._plan) return this._plan;
    var self = this, d = this.net || {}, bad = [];
    if (!(d.nodes || []).length) bad.push("nodes (or layout: \"trellis\" with states and T) are needed");
    if (d.layout === "trellis" && !(this.data.states || []).length) bad.push("layout: \"trellis\" needs states");
    (d.plates || []).forEach(function(pt, i){ (pt.nodes || []).forEach(function(id){ if (!(d.nodes || []).some(function(n){ return n.id === id; })) bad.push("plates[" + i + "]: unknown node \"" + id + "\""); }); });
    this.directed = !!d.directed;
    var ids = {}, edges = {};
    (d.nodes || []).forEach(function(n){ if (ids[n.id]) bad.push("node id \"" + n.id + "\" is used twice"); ids[n.id] = n; });
    (d.edges || []).forEach(function(e, i){
      if (!ids[e.from] || !ids[e.to]){ bad.push("edges[" + i + "] joins an unknown node (" + (ids[e.from] ? e.to : e.from) + ")"); return; }
      edges[self.key(e.from, e.to)] = e;
    });
    // stochastic：向きのあるグラフで、各頂点から出る辺の w の和が 1（推移確率）
    if (d.stochastic){
      if (!this.directed) bad.push("stochastic needs directed: true");
      else Object.keys(ids).forEach(function(id){
        var out = Object.keys(edges).map(function(k){ return edges[k]; }).filter(function(e){ return e.from === id; });
        if (!out.length) return;
        if (out.some(function(e){ return typeof e.w !== "number"; })){ bad.push("stochastic: an edge from " + id + " has no w"); return; }
        var sum = out.reduce(function(a, e){ return a + e.w; }, 0);
        if (Math.abs(sum - 1) > 1e-6) bad.push("stochastic: the edges from " + id + " sum to " + +sum.toFixed(9) + ", not 1");
      });
    }
    var known = function(id, where){ if (ids[id]) return true; bad.push(where + ": unknown node \"" + id + "\""); return false; };
    var check = !(d.total && d.total.check === false);
    var st = {current: null, visited: [], frontier: [], parent: {}, chosen: {}, total: undefined, note: "", take: [], drop: []};
    var states = [st];
    (d.steps || []).forEach(function(s, i){
      var w = "steps[" + i + "]", n = {current: st.current, visited: st.visited, frontier: st.frontier, parent: Object.assign({}, st.parent),
        chosen: Object.assign({}, st.chosen), total: st.total, note: s.note || "", take: [], drop: []};
      if (s.current !== undefined) n.current = s.current === null || known(s.current, w + ".current") ? s.current : null;
      if (s.visited) n.visited = s.visited.filter(function(id){ return known(id, w + ".visited"); });
      if (s.frontier) n.frontier = s.frontier.map(function(f){
        var id = Array.isArray(f) ? f[0] : f;
        if (typeof id !== "string" || !known(id, w + ".frontier")) return null;
        return {id: id, key: Array.isArray(f) && f.length > 1 ? f[1] : undefined};
      }).filter(Boolean);
      if (s.parent) Object.keys(s.parent).forEach(function(c){
        var p = s.parent[c];
        if (!known(c, w + ".parent")) return;
        if (p === null){ delete n.parent[c]; return; }
        if (typeof p === "string" && known(p, w + ".parent." + c)) n.parent[c] = p;
      });
      (s.drop || []).forEach(function(pr){
        var k = self.key(pr[0], pr[1]);
        if (!n.chosen[k]){ bad.push(w + ".drop: " + pr[0] + "–" + pr[1] + " was not chosen"); return; }
        delete n.chosen[k]; n.drop.push(k);
      });
      (s.take || []).forEach(function(pr){
        if (!known(pr[0], w + ".take") || !known(pr[1], w + ".take")) return;
        var k = self.key(pr[0], pr[1]);
        if (!d.complete && !edges[k]){ bad.push(w + ".take: there is no edge " + pr[0] + (self.directed ? "→" : "–") + pr[1]); return; }
        n.chosen[k] = [pr[0], pr[1]]; n.take.push({k: k, a: pr[0], b: pr[1]});
      });
      if (s.total !== undefined){
        n.total = s.total;
        // 何の合計か：total.of、なければ parent があるときは出発点から current までの道のり（探索）、ないときは選んだ辺の w の和（経路・巡回路）
        var of = d.total && d.total.of ? d.total.of : Object.keys(n.parent).length ? "path" : "taken", ws = null, what = "";
        if (of === "path" && n.current){
          ws = []; var c = n.current, seen = {};
          while (n.parent[c] !== undefined && !seen[c]){ seen[c] = 1; var e = edges[self.key(n.parent[c], c)]; if (!e || typeof e.w !== "number"){ ws = null; break; } ws.push(e.w); c = n.parent[c]; }
          what = "the path to " + n.current + " along parent";
        } else if (of === "taken"){
          var ks = Object.keys(n.chosen);
          ws = ks.length && ks.every(function(k){ return edges[k] && typeof edges[k].w === "number"; }) ? ks.map(function(k){ return edges[k].w; }) : null;
          what = "the chosen edges' weights";
        }
        if (check && ws && ws.length){
          var sum = ws.reduce(function(a, x){ return a + x; }, 0);
          // 見せている桁の分だけ許す：辺の数 × ½·10^−d（d は w の小数の桁の最大）
          var dec = ws.reduce(function(m, x){ var f = String(x).split(".")[1]; return Math.max(m, f ? f.length : 0); }, 0);
          // total が w より細かい桁で書かれているときだけ（w を丸めて書いたとき）。同じ桁なら正確に合うはず
          var decT = (String(s.total).split(".")[1] || "").length, exact = 1e-9 * Math.max(1, Math.abs(sum));
          var tol = decT > dec ? Math.max(exact, ws.length * 0.5 * Math.pow(10, -dec) + 1e-12) : exact;
          if (Math.abs(sum - s.total) > tol)
            bad.push(w + ".total is " + s.total + " but " + what + " sums to " + +sum.toFixed(9) + " (total.of: \"path\" or \"taken\"; total.check: false if the total is something else)");
        }
      }
      states.push(n); st = n;
    });
    var digits = d.total && d.total.digits !== undefined ? d.total.digits : states.reduce(function(m, s){
      if (typeof s.total !== "number") return m;
      var x = String(s.total).split(".")[1];
      return Math.max(m, x ? Math.min(4, x.length) : 0);
    }, 0);
    return (this._plan = {ids: ids, edges: edges, states: states, bad: bad, digits: digits,
      hasFrontier: states.some(function(s){ return s.frontier.length; }), hasTotal: states.some(function(s){ return typeof s.total === "number"; }),
      hasNote: states.some(function(s){ return s.note; })});
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), d = this.net, ja = /^ja\b/i.test(ctx.lang || "ja");
    this.ja = ja;
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!(P.dur >= 0)){ ctx.report("attr", "[network] dur must be ≥ 0 (got " + this.getAttribute("dur") + "); using 0.6"); P.dur = 0.6; }
    if (!(P.size >= 24)){ ctx.report("attr", "[network] size must be ≥ 24 (got " + this.getAttribute("size") + "); using 24"); P.size = 24; }
    pl.bad.forEach(function(m){ ctx.report("data", "[network] " + m); });
    var fs = P.size, tw = function(s){ return D.textWidth(s, fs, {font: self}); };
    // mtext の記法（*x*_i など）があるときだけ mtext で書く（ない字はこれまでどおり）。幅は記号を除いて測る
    var MARK = /\*[^*\s][^*]*\*|[_^]\S/, plain = function(s){ return s.replace(/\*([^*\s][^*]*)\*/g, "$1").replace(/[_^](\S)/g, "$1"); };
    this.MARK = MARK;
    // 下の帯：1 段目は候補の並びと合計、2 段目はステップの説明
    var rowH = Math.ceil(fs * 1.75), rows = (pl.hasFrontier || pl.hasTotal ? 1 : 0) + (pl.hasNote ? 1 : 0);
    var band = rows ? rows * rowH + 10 : 0;
    // 頂点の大きさ：字の幅 + 余白。短い名前は円、長い名前は角の丸い箱
    var nh = Math.ceil(fs * 1.75), nodes = d.nodes.map(function(n){
      var lab = n.label !== undefined ? n.label : n.id;
      var sh = n.shape || "circle", lw = tw(MARK.test(lab) ? plain(lab) : lab);
      return {n: n, lab: lab, sh: sh, w: sh === "ellipse" ? Math.max(Math.ceil(nh * 1.5), Math.ceil(lw) + 36) : Math.max(nh, Math.ceil(lw) + 24), h: nh};
    });
    var pad = 8, gx0 = pad, gx1 = W - pad, gy0 = pad, gy1 = H - band - pad;
    var hasLoop = Object.keys(pl.edges).some(function(k){ return pl.edges[k].from === pl.edges[k].to; });
    var plateM = (d.plates || []).length ? Math.ceil(fs * 1.3) + 18 : 0, timeRow = d.trellisT ? Math.ceil(fs * 1.5) : 0;
    gy0 += timeRow;
    var mw = Math.max.apply(null, nodes.map(function(o){ return o.w; })) / 2 + 6 + (hasLoop ? nh * 1.6 : 0) + plateM, mh = nh / 2 + 6 + (hasLoop ? nh * 1.6 : 0) + plateM;
    var xs = d.nodes.map(function(n){ return n.x; }), ys = d.nodes.map(function(n){ return n.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var aw = gx1 - gx0 - 2 * mw, ah = gy1 - gy0 - 2 * mh;
    if (aw < nh || ah < nh){
      ctx.report("size", "[network] the element (" + W + "×" + H + " px) is too small for the graph; give it a size, e.g. style=\"height:480px\"");
      aw = Math.max(aw, 1); ah = Math.max(ah, 1);
    }
    var sc = Math.min(x1 > x0 ? aw / (x1 - x0) : Infinity, y1 > y0 ? ah / (y1 - y0) : Infinity);
    if (!isFinite(sc)) sc = 1;
    var ox = gx0 + mw + (aw - (x1 - x0) * sc) / 2, oy = gy0 + mh + (ah - (y1 - y0) * sc) / 2;
    var at = this.at = {};
    nodes.forEach(function(o){ o.x = ox + (o.n.x - x0) * sc; o.y = oy + (o.n.y - y0) * sc; at[o.n.id] = o; });
    // 頂点どうしの重なり
    var gap = 6;
    for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++){
      var a = nodes[i], b = nodes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap){
        var need = Math.max(((a.w + b.w) / 2 + gap) / Math.max(1e-9, Math.abs(a.n.x - b.n.x) || 1e-9), ((a.h + b.h) / 2 + gap) / Math.max(1e-9, Math.abs(a.n.y - b.n.y) || 1e-9));
        ctx.report("layout", "[network] nodes " + a.n.id + " and " + b.n.id + " overlap at this size; move them apart (they need about " + Math.ceil(Math.min(need, 1e6) / sc * 100) + "% of their distance) or make the element larger");
      }
    }
    // 辺の形：点の列（頂点の縁から縁まで）。直線、向きの逆の辺もあるときの弧、自己ループ
    var cutAt = function(o, ux, uy){
      if (o.sh === "ellipse") return 1 / Math.sqrt(Math.pow(ux / (o.w / 2), 2) + Math.pow(uy / (o.h / 2), 2));
      if (o.w <= o.h + 0.5 && o.sh !== "box") return o.h / 2;
      var tx = Math.abs(ux) > 1e-9 ? (o.w / 2) / Math.abs(ux) : Infinity, ty = Math.abs(uy) > 1e-9 ? (o.h / 2) / Math.abs(uy) : Infinity;
      return Math.min(tx, ty);
    };
    var rim = function(o, ang){ var ux = Math.cos(ang), uy = Math.sin(ang), c = cutAt(o, ux, uy); return {x: o.x + ux * c, y: o.y + uy * c}; };
    var dirTo = function(o, x, y){ return Math.atan2(y - o.y, x - o.x); };
    // 自己ループの向き：ほかの辺からいちばん離れ、枠の中に収まる向き（上から時計回りに 8 方向）
    var loopExt = nh * 1.25, loopAng = {};
    Object.keys(pl.edges).forEach(function(k){
      var e = pl.edges[k];
      if (e.from !== e.to) return;
      var o = at[e.from], used = [];
      Object.keys(pl.edges).forEach(function(k2){
        var f = pl.edges[k2];
        if (f.from === f.to) return;
        if (f.from === e.from) used.push(dirTo(o, at[f.to].x, at[f.to].y));
        if (f.to === e.from) used.push(dirTo(o, at[f.from].x, at[f.from].y));
      });
      var best = null, bestScore = -1;
      for (var q = 0; q < 8; q++){
        var ang = -Math.PI / 2 + q * Math.PI / 4, r = rim(o, ang), ax = r.x + Math.cos(ang) * loopExt, ay = r.y + Math.sin(ang) * loopExt;
        var fits = ax > nh * 0.5 && ax < W - nh * 0.5 && ay > nh * 0.5 && ay < H - band - nh * 0.5;
        var gapMin = used.reduce(function(m, u){ var dd = Math.abs(((ang - u) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return Math.min(m, dd); }, Math.PI);
        var score = gapMin + (fits ? 10 : 0);
        if (score > bestScore + 1e-9){ bestScore = score; best = ang; }
      }
      loopAng[e.from] = best;
    });
    var geoms = {};
    var geom = this.geom = function(a, b){
      var gk = a + "\u0000" + b;
      if (geoms[gk]) return geoms[gk];
      var A = at[a], B = at[b], pts = [];
      var bez = function(p0, p1, p2, p3){
        for (var i = 0; i <= 24; i++){
          var t = i / 24, u = 1 - t;
          pts.push(p3 ? {x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y}
                      : {x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y});
        }
      };
      if (a === b){
        var th = loopAng[a] !== undefined ? loopAng[a] : -Math.PI / 2, sp = 0.5, r0 = rim(A, th - sp), r1 = rim(A, th + sp);
        var c0 = {x: r0.x + Math.cos(th - sp * 1.4) * loopExt * 1.3, y: r0.y + Math.sin(th - sp * 1.4) * loopExt * 1.3};
        var c1 = {x: r1.x + Math.cos(th + sp * 1.4) * loopExt * 1.3, y: r1.y + Math.sin(th + sp * 1.4) * loopExt * 1.3};
        bez(r0, c0, c1, r1);
      } else if (self.directed && pl.edges[self.key(b, a)] && pl.edges[self.key(a, b)]){
        // 往復の辺：進む向きの右側へふくらむ弧（逆向きの辺は反対側になる）
        var dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, bend = Math.min(0.2 * L, nh * 1.6);
        var cx = (A.x + B.x) / 2 - dy / L * bend, cy = (A.y + B.y) / 2 + dx / L * bend;
        bez(rim(A, dirTo(A, cx, cy)), {x: cx, y: cy}, rim(B, dirTo(B, cx, cy)));
      } else {
        var ang2 = Math.atan2(B.y - A.y, B.x - A.x);
        pts.push(rim(A, ang2), rim(B, ang2 + Math.PI));
      }
      return (geoms[gk] = pts);
    };
    var lenOf = function(pts){ var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
    // 点の列の先頭から割合 f までの点の列（f = 1 で全部）と、そこでの向き
    var cutPts = this.cutPts = function(pts, f){
      var L = lenOf(pts) * Math.max(0, Math.min(1, f)), out = [pts[0]], acc = 0;
      for (var i = 1; i < pts.length; i++){
        var sl = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc + sl >= L){ var r = sl ? (L - acc) / sl : 0; out.push({x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r}); return out; }
        acc += sl; out.push(pts[i]);
      }
      return out;
    };
    var pathD = this.pathD = function(pts){ return pts.map(function(p, i){ return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(""); };
    var at2 = function(pts, f){
      var q = cutPts(pts, f), n = q.length, p = q[n - 1], o = n > 1 ? q[n - 2] : pts[0];
      if (Math.hypot(p.x - o.x, p.y - o.y) < 1e-6){ o = pts[0]; p = pts[1] || pts[0]; }
      var L = Math.hypot(p.x - o.x, p.y - o.y) || 1;
      return {x: q[n - 1].x, y: q[n - 1].y, ux: (p.x - o.x) / L, uy: (p.y - o.y) / L};
    };
    // 板（plate）：頂点の組を囲む角の丸い枠、右下の隅に N。いちばん下の層に
    var gPl = D.el("g", {}, svg);
    this.plateLabels = [];
    (d.plates || []).forEach(function(pt){
      var os = (pt.nodes || []).map(function(id){ return at[id]; }).filter(Boolean);
      if (!os.length) return;
      var x0 = Math.min.apply(null, os.map(function(o){ return o.x - o.w / 2; })) - 14, x1 = Math.max.apply(null, os.map(function(o){ return o.x + o.w / 2; })) + 14;
      var y0 = Math.min.apply(null, os.map(function(o){ return o.y - o.h / 2; })) - 14, y1 = Math.max.apply(null, os.map(function(o){ return o.y + o.h / 2; })) + (pt.label ? Math.ceil(fs * 1.3) + 10 : 14);
      D.el("rect", {x: x0.toFixed(1), y: y0.toFixed(1), width: (x1 - x0).toFixed(1), height: (y1 - y0).toFixed(1), rx: 12, fill: "none", stroke: "var(--fg)", "stroke-width": 1.5}, gPl);
      if (pt.label){ var lt = D.el("text", {x: (x1 - 10).toFixed(1), y: (y1 - 10).toFixed(1), "font-size": fs, "text-anchor": "end", fill: "var(--fg)"}, gPl); lt.textContent = pt.label; self.plateLabels.push(lt); }
    });
    // 格子（trellis）：列の上に時刻
    if (d.trellisT) for (var tt = 1; tt <= d.trellisT; tt++){
      var col = nodes.filter(function(o){ return /@(\d+)$/.exec(o.n.id) && +/@(\d+)$/.exec(o.n.id)[1] === tt; });
      if (!col.length) continue;
      var ty = Math.min.apply(null, col.map(function(o){ return o.y - o.h / 2; })) - 12, tl = D.el("text", {x: col[0].x.toFixed(1), y: ty.toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--muted)"}, gPl);
      tl.textContent = "t = " + tt;
    }
    var gE = D.el("g", {}, svg), gT = D.el("g", {}, svg), gC = D.el("g", {}, svg), gN = D.el("g", {}, svg), gW = D.el("g", {}, svg), gB = D.el("g", {}, svg);
    var headD = this.headD = function(pts, f, wd){
      var e = at2(pts, f), s = 10 + wd, x = e.x, y = e.y, px = -e.uy, py = e.ux;
      return "M" + x.toFixed(1) + " " + y.toFixed(1) + "L" + (x - e.ux * s + px * s * 0.5).toFixed(1) + " " + (y - e.uy * s + py * s * 0.5).toFixed(1) +
        "L" + (x - e.ux * s - px * s * 0.5).toFixed(1) + " " + (y - e.uy * s - py * s * 0.5).toFixed(1) + "Z";
    };
    var arrow = function(g, pts, col, wd){ return D.el("path", {d: headD(pts, 1, wd), fill: col}, g); };
    // ほかの辺（--line）と重み
    var placed = nodes.map(function(o){ return {x0: o.x - o.w / 2 - 4, x1: o.x + o.w / 2 + 4, y0: o.y - o.h / 2 - 4, y1: o.y + o.h / 2 + 4}; });
    var hit = function(r){ return placed.some(function(q){ return r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1; }); };
    var inside = function(r){ return r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= H - band; };
    var crowded = [];
    this.wlabels = [];
    // data-part：Studio の形の検査（R-geometry）が測る印。頂点の枠（下の 1 枚だけ。訪れた・候補・今の重ねは測らない）とその名前、辺（自分への辺は除く。矢じりは除く）と重み（縁取りあり）。
    // 探索の木・選んだ辺は同じ辺の上に重ねる線なので測らない
    Object.keys(pl.edges).forEach(function(k){
      var e = pl.edges[k], pts = geom(e.from, e.to), eid = String(e.from) + (self.directed ? ">" : "-") + String(e.to), loop0 = e.from === e.to;
      var ge = loop0 ? gE : D.el("g", {"data-part": "edge", "data-part-id": eid, "data-part-from": String(e.from), "data-part-to": String(e.to)}, gE);
      // 双方向の辺（bi：潜在の交絡）は破線で両端に矢じり
      D.el("path", Object.assign({d: pathD(pts), fill: "none", stroke: "var(--line)", "stroke-width": 2.5}, e.bi ? {"stroke-dasharray": "8 6"} : {}, loop0 ? {} : {"data-part-line": ""}), ge);
      if (self.directed || e.bi) arrow(ge, pts, "var(--line)", 2.5);
      if (e.bi) arrow(ge, pts.slice().reverse(), "var(--line)", 2.5);
      if (!P.weights || typeof e.w !== "number") return;
      var s = fmt(e.w, decimals(e.w)), w = tw(s) + 8, h = fs + 6, best = null, loop = e.from === e.to;
      (loop ? [0.5] : [0.5, 0.38, 0.62, 0.28, 0.72]).some(function(f){
        return (loop ? [1, -1, 1.8, -1.8] : [1, -1]).some(function(side){
          var g = at2(pts, f), off = (fs * 0.62 + 4) * side, cx = g.x - g.uy * off, cy = g.y + g.ux * off;
          var r = {x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, cx: cx, cy: cy};
          if (!hit(r) && inside(r)){ best = r; return true; }
          return false;
        });
      });
      if (!best){ crowded.push(e.from + (self.directed ? "→" : "–") + e.to); return; }
      placed.push(best);
      var t = D.el("text", Object.assign({x: best.cx.toFixed(1), y: (best.cy + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)",
        stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", style: "font-variant-numeric:tabular-nums"}, loop ? {} : {"data-part": "label", "data-part-id": eid, "data-part-of": "edge", "data-part-halo": ""}), gW);
      t.textContent = s;
      self.wlabels.push(t);
    });
    if (crowded.length) ctx.report("layout", "[network] no room for the weight of " + crowded.join(", ") + "; move the nodes apart, make the element larger or set weights=\"false\"");
    // 探索の木（parent）と選んだ辺（take）：出てきた組ごとに 1 本ずつ作る
    this.tree = {}; this.chosen = {};
    pl.states.forEach(function(s){
      Object.keys(s.parent).forEach(function(c){
        var p = s.parent[c], k = p + "\u0000" + c;
        if (self.tree[k] || p === c) return;
        var pts = geom(p, c), L = lenOf(pts);
        self.tree[k] = {el: D.el("g", {opacity: 0}, gT)};
        D.el("path", {d: pathD(cutPts(pts, Math.max(0, (L - 8) / L))), fill: "none", stroke: "var(--term)", "stroke-width": 4.5, "stroke-linecap": "round"}, self.tree[k].el);
        arrow(self.tree[k].el, pts, "var(--term)", 4.5);
      });
      Object.keys(s.chosen).forEach(function(k){
        if (self.chosen[k]) return;
        self.chosen[k] = {el: D.el("path", {d: "M0 0", fill: "none", stroke: "var(--term)", "stroke-width": 8, "stroke-linecap": "round", opacity: 0}, gC), a: s.chosen[k][0], b: s.chosen[k][1],
          head: self.directed ? D.el("path", {d: "M0 0", fill: "var(--term)", opacity: 0}, gC) : null};
      });
    });
    // 頂点：塗り（訪れた）、点線の輪（候補）、太い輪（今）、名前
    nodes.forEach(function(o){
      var rect = function(grow, attrs){
        var w = o.w + 2 * grow, h = o.h + 2 * grow;
        var shp = o.sh === "ellipse" ? {rx: (w / 2).toFixed(1), ry: (h / 2).toFixed(1)} : o.sh === "box" ? {rx: 6} : {rx: (h / 2).toFixed(1)};
        return D.el("rect", Object.assign({x: (o.x - w / 2).toFixed(1), y: (o.y - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1)}, shp, attrs), gN);
      };
      // 観測した変数（observed）は塗る（グラフィカルモデルの習わし）
      var nid = String(o.n.id), nl = {"data-part": "label", "data-part-id": nid, "data-part-of": "box"};
      rect(0, {fill: o.n.observed ? "var(--line)" : "var(--bg)", stroke: "var(--fg)", "stroke-width": 2, "data-part": "box", "data-part-id": nid});
      o.vis = rect(0, {fill: "var(--muted)", opacity: 0});
      o.fr = rect(6, {fill: "none", stroke: "var(--accent2)", "stroke-width": 4, "stroke-dasharray": "8 6", opacity: 0});
      o.cur = rect(4, {fill: "none", stroke: "var(--emph)", "stroke-width": 7, opacity: 0});
      if (MARK.test(o.lab)) D.mtext(gN, o.x, o.y + fs * 0.36, o.lab, Object.assign({"font-size": fs, "text-anchor": "middle", fill: "var(--fg)"}, nl));
      else { var t = D.el("text", Object.assign({x: o.x.toFixed(1), y: (o.y + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)"}, nl), gN); t.textContent = o.lab; }
    });
    this.nodes = nodes;
    // 下の帯
    var by = H - band + 4;
    this.band = {y1: by + rowH / 2 + fs * 0.36, y2: by + rowH * ((pl.hasFrontier || pl.hasTotal) ? 1.5 : 0.5) + fs * 0.36, W: W, g: gB};
    if (pl.hasTotal){
      var tl = d.total && d.total.label !== undefined ? d.total.label : ja ? "合計" : "Total";
      this.totalText = D.el("text", {x: W - 4, y: this.band.y1.toFixed(1), "font-size": fs, "text-anchor": "end", fill: "var(--fg)", style: "font-variant-numeric:tabular-nums", opacity: 0}, gB);
      this.totalLabel = tl;
      var maxs = pl.states.reduce(function(m, s){ return typeof s.total === "number" ? Math.max(m, tw(self.totalString(s.total))) : m; }, 0);
      this.totalW = maxs + 24;
    } else this.totalW = 0;
    if (pl.hasFrontier){
      var kind = KIND[d.frontierKind || "set"];
      this.capText = D.el("text", {x: 4, y: this.band.y1.toFixed(1), "font-size": fs, fill: "var(--fg)"}, gB);
      this.capText.textContent = ja ? kind.ja : kind.en;
      this.capW = tw(this.capText.textContent) + 16;
      if (this.capW + nh + this.totalW > W){ ctx.report("size", "[network] the frontier row has no room (" + W + " px wide)"); }
      var most = Math.max.apply(null, pl.states.map(function(s){ return s.frontier.length; }));
      this.slots = [];
      for (var q = 0; q < most + 1; q++){
        var sg = D.el("g", {opacity: 0}, gB);
        this.slots.push({g: sg, rect: D.el("rect", {x: 0, y: 0, width: 0, height: nh - 8, rx: 6, opacity: 0, fill: "none", stroke: "var(--accent2)", "stroke-width": 3, "stroke-dasharray": "8 6"}, sg),
          text: D.el("text", {x: 0, y: 0, "font-size": fs, "text-anchor": "middle", fill: "var(--fg)"}, sg)});
      }
    }
    if (pl.hasNote){
      this.noteText = D.el("text", {x: 4, y: this.band.y2.toFixed(1), "font-size": fs, fill: "var(--fg)", opacity: 0}, gB);
      // 記法のある説明は、その説明ごとに mtext で作っておき、そのステップで出す
      this.markNotes = {};
      pl.states.forEach(function(st2, k2){ if (st2.note && MARK.test(st2.note)) self.markNotes[k2] = D.mtext(gB, 4, self.band.y2, st2.note, {"font-size": fs, fill: "var(--fg)", opacity: 0}); });
      var long = [];
      pl.states.forEach(function(s, k){ if (s.note && tw(s.note) > W - 8) long.push(k); });
      if (long.length) ctx.report("layout", "[network] the note of step " + long.join(", ") + " is wider than the element (" + W + " px); shorten it (it is cut with …)");
    }
    this.fit = function(s, room){
      if (tw(s) <= room) return s;
      var a = Array.from(s);
      while (a.length && tw(a.join("") + "…") > room) a.pop();
      return a.join("") + "…";
    };
    this.tw = tw;
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", this.summary(ja));
    this.model = {nodes: nodes.map(function(o){ return [o.n.id, +o.x.toFixed(1), +o.y.toFixed(1)]; }), states: pl.states.length};
    function decimals(v){ var x = String(v).split(".")[1]; return x ? Math.min(3, x.length) : 0; }
  }
  totalString(v){
    var u = this.net.total && this.net.total.unit ? this.net.total.unit : "";
    return this.totalLabel + " " + fmt(v, this.plan().digits) + (u ? " " + u : "");
  }
  // 読み上げ：頂点と辺の数、最後に選んだ辺、合計
  summary(ja){
    var pl = this.plan(), d = this.net, last = pl.states[pl.states.length - 1], self = this;
    var ne = Object.keys(pl.edges).length;
    var s = ja ? "グラフ（頂点 " + d.nodes.length + "、辺 " + ne + "）" : "Graph (" + d.nodes.length + " nodes, " + ne + " edges)";
    var ch = Object.keys(last.chosen).map(function(k){ return last.chosen[k].join(self.directed ? "→" : "–"); });
    if (ch.length) s += ja ? "。選んだ辺：" + ch.join("、") : ". Chosen edges: " + ch.join(", ");
    var tr = Object.keys(last.parent).map(function(c){ return last.parent[c] + "→" + c; });
    if (tr.length) s += ja ? "。探索の木：" + tr.join("、") : ". Search tree: " + tr.join(", ");
    if (typeof last.total === "number"){
      var u = d.total && d.total.unit ? d.total.unit : "", lab = d.total && d.total.label !== undefined ? d.total.label : ja ? "合計" : "Total";
      s += (ja ? "。" : ". ") + lab + " " + fmt(last.total, pl.digits) + (u ? " " + u : "");
    }
    return s;
  }
  // ステップ k の時刻：drop が消える（前半）→ take を 1 本ずつ引く。頂点の色は前半で変わる
  timing(k){
    var s = this.plan().states[k], P = this.props;
    if (!s || k === 0) return {fade: 0, start: 0, end: 0};
    var fade = P.dur * 0.5, start = s.drop.length ? fade : 0;
    return {fade: fade, start: start, end: Math.max(fade, start + s.take.length * P.dur)};
  }
  duration(k){ return this.timing(k).end; }
  render(k, t, ctx){
    if (!this.nodes) return;
    var self = this, pl = this.plan(), D = base, P = this.props;
    k = Math.max(0, Math.min(k, pl.states.length - 1));
    var cur = pl.states[k], prev = pl.states[Math.max(0, k - 1)], tm = this.timing(k);
    var e = k === 0 ? 1 : D.prog(t, 0, tm.fade);
    var mix = function(a, b){ return D.lerp(a ? 1 : 0, b ? 1 : 0, e); };
    var inF = function(s, id){ return s.frontier.some(function(f){ return f.id === id; }); };
    this.nodes.forEach(function(o){
      var id = o.n.id;
      o.vis.setAttribute("opacity", (0.35 * mix(prev.visited.indexOf(id) >= 0, cur.visited.indexOf(id) >= 0)).toFixed(3));
      o.fr.setAttribute("opacity", mix(inF(prev, id), inF(cur, id)).toFixed(3));
      o.cur.setAttribute("opacity", mix(prev.current === id, cur.current === id).toFixed(3));
    });
    Object.keys(this.tree).forEach(function(k2){
      var parts = k2.split("\u0000"), was = prev.parent[parts[1]] === parts[0], is = cur.parent[parts[1]] === parts[0];
      self.tree[k2].el.setAttribute("opacity", (k === 0 ? 0 : mix(was, is)).toFixed(3));
    });
    // 選んだ辺：前のステップから残る辺は引いたまま、drop は前半で消え、take は順に端から端へ
    var takeAt = {};
    cur.take.forEach(function(x, j){ takeAt[x.k] = {j: j, a: x.a, b: x.b}; });
    Object.keys(this.chosen).forEach(function(k2){
      var c = self.chosen[k2], el = c.el, a = c.a, b = c.b, f = 0, op = 0;
      if (takeAt[k2] && k > 0){
        a = takeAt[k2].a; b = takeAt[k2].b;
        f = D.prog(t, tm.start + takeAt[k2].j * P.dur, P.dur); op = f > 0 ? 1 : 0;
      } else if (cur.chosen[k2]){
        a = cur.chosen[k2][0]; b = cur.chosen[k2][1]; f = 1; op = 1;
      } else if (prev.chosen[k2] && k > 0){
        a = prev.chosen[k2][0]; b = prev.chosen[k2][1]; f = 1; op = 1 - D.prog(t, 0, tm.fade);
      }
      var pts = self.geom(a, b), L = 0;
      for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      // 向きのあるグラフ：線は矢じりの手前で止め、矢じりを線の先に付ける
      var fl = c.head ? f * Math.max(0, (L - 12) / (L || 1)) : f;
      el.setAttribute("d", f > 0 ? self.pathD(self.cutPts(pts, fl)) : "M0 0");
      el.setAttribute("opacity", op.toFixed(3));
      if (c.head){ c.head.setAttribute("d", f > 0 ? self.headD(pts, f, 8) : "M0 0"); c.head.setAttribute("opacity", op.toFixed(3)); }
    });
    // 合計：前の値から今の値へ数え上げる
    if (this.totalText){
      var has = typeof cur.total === "number", from = typeof prev.total === "number" && k > 0 ? prev.total : has ? cur.total : 0;
      var v = has ? D.lerp(from, cur.total, k === 0 ? 1 : D.prog(t, 0, Math.max(tm.end, 0.3))) : 0;
      this.totalText.textContent = has ? this.totalString(+v.toFixed(pl.digits)) : "";
      this.totalText.setAttribute("opacity", has ? 1 : 0);
    }
    // 候補の並び：今のステップの frontier（前半で入れ替わる。どちらか一方だけを見せる）
    if (this.slots){
      var show = k === 0 ? cur : e < 0.5 ? prev : cur, x = this.capW, room = this.band.W - this.totalW - 4, fsz = P.size;
      var items = show.frontier.map(function(f){ return f.key !== undefined ? f.id + " " + fmt(f.key, decimals(f.key)) : (self.at[f.id] ? self.at[f.id].lab : f.id); });
      var empty = !items.length && k > 0;
      if (empty) items = [this.ja ? "（空）" : "(empty)"];
      var nShow = items.length, widths = items.map(function(s){ return Math.max(self.tw(s) + 20, fsz * 1.4); });
      var more = function(n){ return "…+" + n; };
      while (nShow > 0){
        var used = x, j2;
        for (j2 = 0; j2 < nShow; j2++) used += widths[j2] + 8;
        if (nShow < items.length) used += self.tw(more(items.length - nShow)) + 8;
        if (used <= room) break;
        nShow--;
      }
      var op2 = k === 0 ? 1 : Math.abs(e - 0.5) * 2;
      this.slots.forEach(function(sl, j){
        if (j < nShow){
          sl.rect.setAttribute("x", x.toFixed(1)); sl.rect.setAttribute("y", (self.band.y1 - fsz * 0.36 - (self.nodes[0].h - 8) / 2).toFixed(1)); sl.rect.setAttribute("width", widths[j].toFixed(1));
          sl.rect.setAttribute("opacity", empty ? 0 : 1);
          sl.text.setAttribute("x", (x + widths[j] / 2).toFixed(1)); sl.text.setAttribute("y", self.band.y1.toFixed(1)); sl.text.textContent = items[j];
          sl.g.setAttribute("opacity", op2.toFixed(3)); x += widths[j] + 8;
        } else if (j === nShow && nShow < items.length){
          ["x", "y", "width"].forEach(function(a){ sl.rect.setAttribute(a, 0); });
          sl.rect.setAttribute("opacity", 0);
          sl.text.setAttribute("x", (x + self.tw(more(items.length - nShow)) / 2).toFixed(1)); sl.text.setAttribute("y", self.band.y1.toFixed(1)); sl.text.textContent = more(items.length - nShow);
          sl.g.setAttribute("opacity", op2.toFixed(3));
        } else {
          ["x", "y", "width"].forEach(function(a){ sl.rect.setAttribute(a, 0); });
          sl.rect.setAttribute("opacity", 0); sl.text.setAttribute("x", 0); sl.text.setAttribute("y", 0); sl.text.textContent = ""; sl.g.setAttribute("opacity", 0);
        }
      });
    }
    if (this.noteText){
      var mk = this.markNotes[k], no = cur.note ? (k === 0 ? 1 : D.prog(t, 0, tm.fade)).toFixed(3) : 0;
      this.noteText.textContent = cur.note && !mk ? this.fit(cur.note, this.band.W - 8) : "";
      this.noteText.setAttribute("opacity", mk ? 0 : no);
      for (var mkk in this.markNotes) this.markNotes[mkk].setAttribute("opacity", +mkk === k ? no : 0);
    }
    function decimals(v){ var x = String(v).split(".")[1]; return x ? Math.min(3, x.length) : 0; }
  }
};
function fmt(v, dg){
  var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  var neg = v < 0 && +Math.abs(v).toFixed(dg) !== 0;
  return (neg ? "−" : "") + i + (s[1] ? "." + s[1] : "");
}
});
