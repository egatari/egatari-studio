// m-quad：2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）。点を段階ごとに 1 つずつ置く
// <m-quad style="height:420px"><script type="application/json">
//   {"x": {"lo": "手作業", "hi": "自動"}, "y": {"lo": "高い", "hi": "安い"},
//    "quads": {"tr": "狙う場所", "tl": "", "bl": "", "br": ""},
//    "items": [{"label": "A 社", "x": 0.25, "y": 0.7}, {"label": "自社", "x": 0.8, "y": 0.82, "self": true, "to": {"x": 0.9, "y": 0.9, "label": "3 年後"}}]}
// （JSON の終わり）</m-quad>
// 座標は 0〜1（0.5 が軸の交わるところ）。軸と両端の言葉は段階 0 から見える。象限の名前は quads-step（既定 0）で出る
// 点は既定で 1 つ = 1 段階（step で直接、at で段階の中の開始秒）。self の点は強調の色で大きく、着いたときに輪が広がる
// to は移動先：to.step（既定は点の次の段階）に、点が破線の跡を引きながら滑る
DECK.define("m-quad", class extends DECK.MotionElement {
  // データの形（kit/shape.js）。x・y は 0〜1（0.5 が軸の交わるところ）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["items"], properties: {
      x: {type: "object", properties: {lo: {type: "string"}, hi: {type: "string"}}}, y: {type: "object", properties: {lo: {type: "string"}, hi: {type: "string"}}},
      quads: {type: "object", properties: {tr: {type: "string"}, tl: {type: "string"}, bl: {type: "string"}, br: {type: "string"}, fill: {type: "string"}}},
      items: {type: "array", minItems: 1, items: {type: "object", required: ["x", "y"], properties: {
        label: {type: "string"}, x: {type: "number"}, y: {type: "number"}, step: {type: "integer"}, at: {type: "number"}, tone: {type: "string"}, anchor: {enum: ["right", "left", "above", "below"]},
        r: {type: "number"}, self: {type: "boolean"}, to: {type: "object", required: ["x", "y"], properties: {x: {type: "number"}, y: {type: "number"}, label: {type: "string"}, step: {type: "integer"}, at: {type: "number"}}}}}}}},
    example: {x: {lo: "手作業", hi: "自動"}, y: {lo: "高い", hi: "安い"}, items: [{label: "A 社", x: 0.25, y: 0.7}, {label: "自社", x: 0.8, y: 0.82, self: true}]},
  };
  static props = {
    fade:  {type: "number", default: 0.5, doc: "点が現れる秒数"},
    move:  {type: "number", default: 1.2, doc: "to の移動の秒数"},
    size:  {type: "number", default: 26, doc: "点の名前の字の大きさ（px）"},
    "quads-step": {type: "number", default: 0, doc: "象限の名前を出す段階（0 = 初めから）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = this.props["quads-step"];
    this.plan().forEach(function(o){ m = Math.max(m, o.step, o.to ? o.to.step : 0); });
    return m;
  }
  // 点の段階と開始時刻（データだけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, q0 = this.props["quads-step"], n = 0, seen = {};
    return (this._plan = (d.items || []).map(function(it){
      var step = it.step !== undefined ? it.step : q0 + (++n);
      n = Math.max(n, step - q0);
      var j = seen[step] = (seen[step] || 0) + 1;
      var to = it.to ? {x: it.to.x, y: it.to.y, label: it.to.label || "", step: it.to.step !== undefined ? it.to.step : step + 1, at: it.to.at || 0} : null;
      return {it: it, step: step, at: it.at !== undefined ? it.at : (j - 1) * 0.6, to: to};
    }));
  }
  mount(){
    var P = this.props, D = DECK, self = this, d = this.data || {};
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    // 図の枠：両端の言葉の分だけ上下と左右に余白
    var m = {l: 12, r: 12, t: 40, b: 40};
    var x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.X = function(v){ return x0 + v * (x1 - x0); };
    this.Y = function(v){ return y1 - v * (y1 - y0); };
    // 象限の地（右上だけ淡く塗れる：quads.fill = "tr" など）と名前
    var q = d.quads || {}, gQ = D.el("g", {}, svg);
    this.quadG = D.el("g", {}, svg);
    var corner = {tr: [cx, y0, x1 - cx, cy - y0, x1 - 16, y0 + 34, "end"], tl: [x0, y0, cx - x0, cy - y0, x0 + 16, y0 + 34, "start"],
                  bl: [x0, cy, cx - x0, y1 - cy, x0 + 16, y1 - 16, "start"], br: [cx, cy, x1 - cx, y1 - cy, x1 - 16, y1 - 16, "end"]};
    ["tr", "tl", "bl", "br"].forEach(function(key){
      var c = corner[key];
      if (q.fill === key) D.el("rect", {x: c[0], y: c[1], width: c[2], height: c[3], fill: "var(--term-tint)"}, gQ);
      if (q[key]) D.mtext(self.quadG, c[4], c[5], q[key], {"text-anchor": c[6], "font-size": 26, "font-weight": 700, fill: q.fill === key ? "var(--term)" : "var(--muted)"});
    });
    // 軸（両向きの矢印）と両端の言葉。横軸の言葉は軸の下、縦軸の言葉は軸の上端・下端の外
    var ax = D.el("g", {}, svg), K = "var(--fg)";
    D.el("line", {x1: x0, y1: cy, x2: x1, y2: cy, stroke: K, "stroke-width": 2, class: "axis"}, ax);
    D.el("line", {x1: cx, y1: y0, x2: cx, y2: y1, stroke: K, "stroke-width": 2, class: "axis"}, ax);
    [[x1, cy, 0], [x0, cy, 180], [cx, y0, -90], [cx, y1, 90]].forEach(function(a){
      D.el("path", {d: "M0,0L-14,-7L-14,7Z", fill: K, transform: "translate(" + a[0] + " " + a[1] + ") rotate(" + a[2] + ")"}, ax);
    });
    var xa = d.x || {}, ya = d.y || {};
    if (xa.lo) D.mtext(ax, x0 + 4, cy + 34, xa.lo, {"text-anchor": "start", "font-size": 24});
    if (xa.hi) D.mtext(ax, x1 - 4, cy + 34, xa.hi, {"text-anchor": "end", "font-size": 24});
    if (ya.hi) D.mtext(ax, cx, y0 - 14, ya.hi, {"text-anchor": "middle", "font-size": 24});
    if (ya.lo) D.mtext(ax, cx, y1 + 32, ya.lo, {"text-anchor": "middle", "font-size": 24});
    // 点：丸と名前（既定は右。anchor で left / above / below）
    var gT = D.el("g", {}, svg), gP = D.el("g", {}, svg);
    this.pts = this.plan().map(function(o){
      var it = o.it, me = !!it.self, col = me ? "var(--emph)" : it.tone === "term" ? "var(--term)" : it.tone === "fg" ? "var(--fg)" : "var(--muted)";
      var r = it.r || (me ? 14 : 11);
      var trail = o.to ? D.el("line", {stroke: col, "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0}, gT) : null;
      var ring = me ? D.el("circle", {r: r, fill: "none", stroke: col, "stroke-width": 3, opacity: 0}, gP) : null;
      var g = D.el("g", {opacity: 0}, gP);
      D.el("circle", {cx: 0, cy: 0, r: r, fill: col, stroke: "var(--bg)", "stroke-width": 2.5}, g);
      var off = r + 10;
      var place = function(an){ return an === "left" ? [-off, 9, "end"] : an === "above" ? [0, -off - 4, "middle"] : an === "below" ? [0, off + 22, "middle"] : [off, 9, "start"]; };
      // 名前が軸の線を横切るなら、丸の反対の側 → 上 → 下の順に置き直す（点の始めの位置と to の位置の両方で確かめる）。
      // 幅は字数から見積もる（和文 1 字 = 1 字幅、ほかは 0.58 字幅）
      var w = [...String(it.label || "")].reduce(function(a, ch){ return a + (/[\u0000-\u024f]/.test(ch) ? 0.58 : 1); }, 0) * P.size;
      var crosses = function(an, px, py){
        var lp = place(an), lx = px + lp[0], ly = py + lp[1], a0 = lp[2] === "start" ? lx : lp[2] === "end" ? lx - w : lx - w / 2;
        return (a0 - 6 < cx && a0 + w + 6 > cx && ly - P.size * 0.88 < y1 && ly + P.size * 0.22 > y0) ||
               (ly - P.size * 0.88 - 6 < cy && ly + P.size * 0.22 + 6 > cy && a0 < x1 && a0 + w > x0);
      };
      var pts = [[self.X(it.x), self.Y(it.y)]].concat(o.to ? [[self.X(o.to.x), self.Y(o.to.y)]] : []);
      var pref = it.anchor || "right", order = [pref, pref === "left" ? "right" : pref === "right" ? "left" : pref === "above" ? "below" : "above", "above", "below", "left", "right"];
      var an = order.filter(function(a){ return !pts.some(function(q){ return crosses(a, q[0], q[1]); }); })[0] || pref;
      var lp = place(an);
      D.mtext(g, lp[0], lp[1], it.label || "", {"text-anchor": lp[2], "font-size": P.size, "font-weight": me ? 700 : 400, fill: me ? col : "var(--fg)"});
      var lab2 = o.to && o.to.label ? D.mtext(gP, 0, 0, o.to.label, {"text-anchor": "middle", "font-size": 24, fill: col, opacity: 0}) : null;
      return {o: o, g: g, ring: ring, r: r, trail: trail, lab2: lab2};
    });
  }
  duration(k){
    var P = this.props, d = k === P["quads-step"] && k > 0 ? P.fade : 0;
    this.plan().forEach(function(o){
      if (o.step === k) d = Math.max(d, o.at + P.fade + (o.it.self ? 0.6 : 0));
      if (o.to && o.to.step === k) d = Math.max(d, o.to.at + P.move + 0.3);
    });
    return d;
  }
  // 同じ段階に 2 つ以上の点があれば、2 つ目からの開始時刻を口述原稿の {cue} に合わせられる
  cues(k){
    var c = [];
    this.plan().forEach(function(o){ if (o.step === k && o.at > 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t){
    var P = this.props, D = DECK, self = this;
    var pr = function(step, at, dur){ return step < k ? 1 : step > k ? 0 : D.prog(t, at, dur); };
    var qs = P["quads-step"];
    this.quadG.setAttribute("opacity", (qs === 0 ? 1 : pr(qs, 0, P.fade)).toFixed(3));
    this.pts.forEach(function(p){
      var o = p.o, e = pr(o.step, o.at, P.fade);
      var m = o.to ? pr(o.to.step, o.to.at, P.move) : 0;
      var x0 = self.X(o.it.x), y0 = self.Y(o.it.y);
      var x = o.to ? D.lerp(x0, self.X(o.to.x), m) : x0, y = o.to ? D.lerp(y0, self.Y(o.to.y), m) : y0;
      var s = D.lerp(0.6, 1, e);
      p.g.setAttribute("opacity", e.toFixed(3));
      p.g.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") scale(" + s.toFixed(4) + ")");
      // 自社の点：着いたときに輪が 1 回広がって消える（最終状態では出さない）
      if (p.ring){
        var rt = o.step === k && t !== Infinity ? D.clamp01((t - o.at - P.fade * 0.6) / 0.8) : 1;
        p.ring.setAttribute("cx", x.toFixed(2)); p.ring.setAttribute("cy", y.toFixed(2));
        p.ring.setAttribute("r", (p.r * (1 + 1.6 * rt)).toFixed(2));
        p.ring.setAttribute("opacity", (rt > 0 && rt < 1 ? 0.8 * (1 - rt) : 0).toFixed(3));
      }
      if (p.trail){
        p.trail.setAttribute("x1", x0.toFixed(2)); p.trail.setAttribute("y1", y0.toFixed(2));
        p.trail.setAttribute("x2", x.toFixed(2)); p.trail.setAttribute("y2", y.toFixed(2));
        p.trail.setAttribute("opacity", m > 0 ? 0.9 : 0);
      }
      if (p.lab2){
        p.lab2.setAttribute("x", self.X(o.to.x).toFixed(2)); p.lab2.setAttribute("y", (self.Y(o.to.y) - p.r - 14).toFixed(2));
        p.lab2.setAttribute("opacity", pr(o.to.step, o.to.at + P.move * 0.8, 0.3).toFixed(3));
      }
    });
  }
});
