// m-scatter：散布図。点の組（系列）を段階ごとに出し、そのあと傾向の線を引く
// <m-scatter xr="[20,36]" yr="[0,800]" xl="最高気温（℃）" yl="売上（個）" style="height:420px">
//   <script type="application/json">{"series": [{"label": "晴れ", "points": [[24, 210], [31, 560]]}], "trend": "linear"}
// （JSON の終わり）</m-scatter>
// 段階：既定は系列 1 つ = 1 段階、そのあと傾向の線（全部で 1 段階）。系列・線の step で直接
// 軸の属性（xr yr xt yt xf yf xl yl）は m-curves と同じ名前と意味。xr / yr を書かなければデータから切りのよい範囲を決め、
// xt / yt を書かなければ目盛りも決める
// 見せ方（docs/conventions.md §1）：fade（点がフェードして現れる、既定）・sweep（左から右へ順に現れる）・grow（点が小さい点から
// 大きくなる）。傾向の線は fade では薄く現れ、sweep では左から引き、grow では真ん中から両側へ伸びる。段階の数・長さ・最後の中身は同じ
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・variant・previewOpacity と plot の Plot を使い、
// プレイヤーのグローバルは使わない。名前の置き場がない・傾向の線が軸の外・上の名前が図より広い、は ctx.report で知らせる
// （1.x は console.warn）
egatariParts.define({name: "scatter", version: "2.0.5", requires: {base: "1.2.0", plot: "1.1.2"}, element: "m-scatter"}, function(deps){
"use strict";
var base = deps.base, plot = deps.plot;
return class extends base.MotionElement {
  static partName = "scatter";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "sweep", "grow"];
  // データの形（kit/shape.js）
  static shape = (function(){
    // 傾向の線の 2 点：ちょうど 2 つの [x, y]
    var PTS = {type: "array", minItems: 2, maxItems: 2, items: {type: "array", minItems: 2, maxItems: 2, items: {type: "number"}}};
    return {
      schema: {type: "object", additionalProperties: false, required: ["series"], properties: {
        series: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["points"], properties: {
          label: {type: "string"}, tone: {type: "string"}, step: {type: "integer"}, at: {type: "number"},
          points: {type: "array", items: {type: ["array", "object"], items: {type: "number"}, minItems: 2, maxItems: 2, required: ["x", "y"],
            properties: {x: {type: "number"}, y: {type: "number"}, label: {type: "string"}, anchor: {enum: ["right", "left", "above", "below", "top", "bottom"]}, tone: {type: "string"}}}}}}},
        trend: {type: ["string", "object", "array"], properties: {fit: {enum: ["linear"]}, pts: PTS, series: {type: ["integer", "array"]},
          label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"}, step: {type: "integer"}, at: {type: "number"}, digits: {type: "integer"}},
          items: {type: "object", properties: {fit: {enum: ["linear"]}, pts: PTS, series: {type: ["integer", "array"]},
            label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"}, step: {type: "integer"}, at: {type: "number"}, digits: {type: "integer"}}}}}},
      example: {series: [{label: "晴れ", points: [[24, 210], [28, 380], [31, 560], {x: 34, y: 690, label: "猛暑日"}]}], trend: "linear"},
      note: {en: "points are [x, y] or {\"x\", \"y\", \"label\"}; axes go in attributes (xr=\"[0,10]\" xl=\"…\"); trend is \"linear\" or {\"fit\": \"linear\", \"label\": \"…\"} or {\"pts\": [[x0, y0], [x1, y1]]}",
             ja: "点は [x, y] か {\"x\", \"y\", \"label\"}。軸は属性に書く（xr=\"[0,10]\" xl=\"…\"）。trend は \"linear\" か {\"fit\": \"linear\", \"label\": \"…\"} か {\"pts\": [[x0, y0], [x1, y1]]}"},
    };
  })();
  static props = {
    xr: {type: "json", default: null, doc: "横軸の範囲（書かなければデータから）"}, yr: {type: "json", default: null, doc: "縦軸の範囲（書かなければデータから）"},
    xt: {type: "json", default: null, doc: "横軸の目盛り（書かなければ自動）"}, yt: {type: "json", default: null, doc: "縦軸の目盛り（書かなければ自動）"},
    xf: {type: "number", default: undefined, doc: "横軸の目盛りの小数桁"}, yf: {type: "number", default: undefined, doc: "縦軸の目盛りの小数桁"},
    xl: {type: "string", default: ""}, yl: {type: "string", default: ""},
    r:   {type: "number", default: 9, doc: "点の半径（px）"},
    dur: {type: "number", default: 1.0, doc: "1 ステップの動きの秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0, pl = this.plan();
    pl.series.forEach(function(s){ m = Math.max(m, s.step); });
    pl.trends.forEach(function(s){ m = Math.max(m, s.step); });
    return m;
  }
  // 系列と傾向の線の段階（mount の前にも steps が要るので、データだけから決める）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, last = 0;
    var series = (d.series || []).map(function(s, i){
      var step = s.step !== undefined ? s.step : i + 1;
      last = Math.max(last, step);
      return {s: s, i: i, step: step, at: s.at || 0};
    });
    var tr = d.trend === undefined || d.trend === null || d.trend === false ? [] : Array.isArray(d.trend) ? d.trend : [d.trend];
    var trends = tr.map(function(t, i){
      if (typeof t === "string") t = {fit: t};   // "linear" のほかは mount で知らせる（steps の計算では投げない）
      return {t: t, i: i, step: t.step !== undefined ? t.step : last + 1, at: t.at || 0};
    });
    return (this._plan = {series: series, trends: trends});
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan();
    this.variant = base.variant(this);
    this.classList.add("plot"); this.style.display = "block";
    // 字の幅（base の textWidth：テーマの字で測った幅。mtext の *_^ は数えない）
    var est = function(s, size){ return D.textWidth(s, size, {font: self, mark: true}); };
    var colorOf = function(c, i){
      if (!c) return "var(--series-" + (i % 4 + 1) + ")";
      return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(c) ? "var(--" + c + ")" : "var(--series-" + (i % 4 + 1) + ")";
    };
    // 点を {x, y, label, anchor, tone} にそろえる
    var all = [];
    pl.series.forEach(function(o){
      o.pts = (o.s.points || []).map(function(q){ var p = Array.isArray(q) ? {x: +q[0], y: +q[1]} : {x: +q.x, y: +q.y, label: q.label, anchor: q.anchor, tone: q.tone}; all.push(p); return p; });
    });
    // 軸の範囲と目盛り：書かれていなければデータから切りのよい数に
    var auto = function(vals, pad){
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (!isFinite(lo)) return [0, 1];
      if (hi === lo){ hi += 1; lo -= 1; }
      var st = tickStep((hi - lo) * (1 + 2 * pad)), a = Math.floor((lo - (hi - lo) * pad) / st) * st, b = Math.ceil((hi + (hi - lo) * pad) / st) * st;
      if (lo >= 0 && a < 0) a = 0;
      return [+a.toFixed(10), +b.toFixed(10)];
    };
    // 書かれた範囲は [小, 大] の 2 つの数のときだけ使う（1 つの数・逆向き・数でない、は知らせてデータから決める）
    var range = function(name){
      var v = P[name];
      if (v === null || v === undefined) return null;
      if (Array.isArray(v) && v.length === 2 && v.every(function(x){ return typeof x === "number" && isFinite(x); }) && v[0] < v[1]) return v;
      ctx.report("attr", "[scatter] " + name + "=\"" + self.getAttribute(name) + "\" is not a range [low, high] of two numbers with low < high (the range is taken from the data)");
      return null;
    };
    var xr = range("xr") || auto(all.map(function(p){ return p.x; }), 0.04), yr = range("yr") || auto(all.map(function(p){ return p.y; }), 0.06);
    // 範囲の外の点は描かない（軸の外や枠の外に出さない）。系列ごとにまとめて知らせる
    pl.series.forEach(function(o){
      var outs = o.pts.filter(function(q){ return !(q.x >= xr[0] && q.x <= xr[1] && q.y >= yr[0] && q.y <= yr[1]); });
      outs.forEach(function(q){ q.out = true; });
      if (outs.length) ctx.report("data", "[scatter] " + outs.length + " point" + (outs.length > 1 ? "s" : "") + (o.s.label ? " of \"" + o.s.label + "\"" : " of series " + (o.i + 1)) + " lie outside xr/yr and are not drawn: " +
        outs.slice(0, 3).map(function(q){ return "(" + q.x + ", " + q.y + ")"; }).join(", ") + (outs.length > 3 ? ", …" : "") + " (widen xr/yr or leave them out)");
    });
    var ticks = function(r){ var st = tickStep(r[1] - r[0]), out = []; for (var v = Math.ceil(r[0] / st - 1e-9) * st; v <= r[1] + st * 1e-6; v += st) out.push(+v.toFixed(10)); return out; };
    var xt = P.xt || ticks(xr), yt = P.yt || ticks(yr);
    var fmt = function(v, f){ return f !== undefined ? v.toFixed(f) : String(v); };
    var named = pl.series.some(function(o){ return o.s.label; }) || pl.trends.some(function(o){ return o.t.label; });
    var yw = Math.max.apply(null, yt.map(function(v){ return est(fmt(v, P.yf), 24); }).concat([0]));
    var m = {l: Math.max(64, yw + 22 + (P.yl ? 40 : 0)), r: 24, t: named ? 72 : 20, b: P.xl ? 66 : 42};
    var p = this.p = plot.Plot(this, {xr: xr, yr: yr, xt: xt, yt: yt, xf: P.xf, yf: P.yf, xl: P.xl, yl: P.yl, m: m});
    p.svg.setAttribute("aria-hidden", "true");
    // 軸の線（横軸と縦軸。目盛りの短い線は除く）に印を付ける（tools/test-components.mjs が字との交差を見る）
    var axl = p.svg.querySelectorAll("g.axes > line");
    for (var a = 0; a < Math.min(2, axl.length); a++) axl[a].setAttribute("class", "axis");
    var W = p.W, H = p.H, x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
    var gT = D.el("g", {}, p.svg), gP = D.el("g", {}, p.svg), gL = D.el("g", {}, p.svg);
    var R = P.r;
    if (!(typeof R === "number" && isFinite(R) && R > 0)){
      ctx.report("attr", "[scatter] r=\"" + this.getAttribute("r") + "\" is not a positive number (the default radius 9 is used)");
      R = 9;
    }
    // 系列の印の形：丸・四角・三角・ひし形（色だけに頼らない）
    var shapes = [
      function(r){ return "M" + r + ",0A" + r + "," + r + " 0 1,1 " + (-r) + ",0A" + r + "," + r + " 0 1,1 " + r + ",0Z"; },
      function(r){ var s = r * 0.86; return "M" + (-s) + "," + (-s) + "H" + s + "V" + s + "H" + (-s) + "Z"; },
      function(r){ var s = r * 1.2; return "M0," + (-s) + "L" + (s * 0.95).toFixed(2) + "," + (s * 0.62).toFixed(2) + "H" + (-s * 0.95).toFixed(2) + "Z"; },
      function(r){ var s = r * 1.2; return "M0," + (-s) + "L" + s + ",0L0," + s + "L" + (-s) + ",0Z"; }];
    // 置いた字と点の箱（重なりを避ける）
    var boxes = [];
    all.forEach(function(q){ if (!q.out) boxes.push({l: p.x(q.x) - R - 2, r: p.x(q.x) + R + 2, t: p.y(q.y) - R - 2, b: p.y(q.y) + R + 2, pt: q}); });
    var hits = function(b, self2){ return boxes.some(function(o){ return o.pt !== self2 && b.l < o.r && o.l < b.r && b.t < o.b && o.t < b.b; }); };
    this.series = pl.series.map(function(o){
      var col = colorOf(o.s.tone, o.i), path = shapes[o.i % 4](R);
      var marks = o.pts.filter(function(q){ return !q.out; }).map(function(q){
        var g = D.el("g", {transform: "translate(" + p.x(q.x).toFixed(1) + " " + p.y(q.y).toFixed(1) + ")", opacity: 0}, gP);
        var c = q.tone ? colorOf(q.tone, o.i) : col;
        var sh = D.el("path", {d: path, fill: c, "fill-opacity": 0.85, stroke: "var(--bg)", "stroke-width": 1.5}, g);
        return {q: q, g: g, sh: sh, cx: p.x(q.x), cy: p.y(q.y)};
      });
      // 左から右の順（sweep）
      var order = marks.slice().sort(function(u, v){ return u.cx - v.cx; });
      order.forEach(function(mk, j){ mk.rank = order.length > 1 ? j / (order.length - 1) : 0; });
      // 名前のある点：右 → 左 → 上 → 下（anchor があればそれを先に）の順に、点・字・軸と重ならず枠に収まる所へ
      var labels = marks.filter(function(mk){ return mk.q.label; }).map(function(mk){
        var w = est(mk.q.label, 24), cands = {
          right: {x: mk.cx + R + 8, y: mk.cy + 8, a: "start", b: {l: mk.cx + R + 6, r: mk.cx + R + 10 + w, t: mk.cy - 14, b: mk.cy + 12}},
          left: {x: mk.cx - R - 8, y: mk.cy + 8, a: "end", b: {l: mk.cx - R - 10 - w, r: mk.cx - R - 6, t: mk.cy - 14, b: mk.cy + 12}},
          above: {x: mk.cx, y: mk.cy - R - 10, a: "middle", b: {l: mk.cx - w / 2 - 2, r: mk.cx + w / 2 + 2, t: mk.cy - R - 34, b: mk.cy - R - 4}},
          below: {x: mk.cx, y: mk.cy + R + 28, a: "middle", b: {l: mk.cx - w / 2 - 2, r: mk.cx + w / 2 + 2, t: mk.cy + R + 4, b: mk.cy + R + 34}}};
        var pref = ["right", "left", "above", "below"];
        var an = {top: "above", bottom: "below"}[mk.q.anchor] || mk.q.anchor;   // top / bottom は above / below の別名
        if (an) pref = [an].concat(pref.filter(function(x){ return x !== an; }));
        var inPlot = function(b){ return b.l >= x0 + 4 && b.r <= x1 && b.t >= y0 && b.b <= y1 - 4; };
        var inBox = function(b){ return b.l >= 0 && b.r <= W && b.t >= 0 && b.b <= H; };
        var pick = pref.filter(function(k){ return inPlot(cands[k].b) && !hits(cands[k].b, mk.q); })[0]
          || pref.filter(function(k){ return inBox(cands[k].b) && !hits(cands[k].b, mk.q); })[0];
        if (!pick){ pick = pref.filter(function(k){ return inBox(cands[k].b); })[0] || pref[0]; ctx.report("layout", "[scatter] the label \"" + mk.q.label + "\" has no free place (it may overlap)"); }
        var c = cands[pick];
        boxes.push({l: c.b.l, r: c.b.r, t: c.b.t, b: c.b.b, pt: mk.q});
        return D.mtext(gL, c.x, c.y, mk.q.label, {"text-anchor": c.a, "font-size": 24, fill: mk.q.tone ? colorOf(mk.q.tone, o.i) : "var(--fg)", opacity: 0});
      });
      return {o: o, col: col, path: path, marks: marks, labels: labels};
    });
    // 傾向の線：最小二乗の直線（fit: "linear"）か、2 点（pts）
    this.trends = pl.trends.map(function(o){
      var t = o.t, a, b, r = null, xa, xb;
      var ya, yb;
      if (t.pts){
        if (t.pts.length !== 2 || !t.pts.every(function(q){ return Array.isArray(q) && q.length === 2 && q.every(isFinite); }))
          throw new Error("trend.pts: write two points [[x0, y0], [x1, y1]]");
        xa = +t.pts[0][0]; xb = +t.pts[1][0]; ya = +t.pts[0][1]; yb = +t.pts[1][1];
        if (xa === xb && ya === yb) throw new Error("trend.pts: the two points are the same (write two different points)");
        // 書いた 2 点をそのまま端にする（縦の線なら傾きと切片はない）
        if (xb !== xa){ a = (yb - ya) / (xb - xa); b = ya - a * xa; } else { a = null; b = null; }
      } else {
        if (t.fit !== undefined && t.fit !== "linear") throw new Error('trend: "' + t.fit + '" is not "linear" (write "linear", {"fit": "linear"} or {"pts": [[x0, y0], [x1, y1]]})');
        var use = t.series === undefined ? pl.series : [].concat(t.series).map(function(i){ return pl.series[i]; }).filter(Boolean);
        var q = [].concat.apply([], use.map(function(s){ return s.pts; }));
        if (q.length < 2) throw new Error("trend: a linear fit needs two or more points");
        var n = q.length, sx = 0, sy = 0;
        q.forEach(function(v){ sx += v.x; sy += v.y; });
        var mx = sx / n, my = sy / n, sxx = 0, sxy = 0, syy = 0;
        q.forEach(function(v){ sxx += (v.x - mx) * (v.x - mx); sxy += (v.x - mx) * (v.y - my); syy += (v.y - my) * (v.y - my); });
        a = sxx ? sxy / sxx : 0; b = my - a * mx;
        r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
        xa = Math.min.apply(null, q.map(function(v){ return v.x; })); xb = Math.max.apply(null, q.map(function(v){ return v.x; }));
        ya = a * xa + b; yb = a * xb + b;
      }
      var col = t.tone ? colorOf(t.tone, 0) : "var(--fg)";
      var A = [p.x(xa), p.y(ya)], B = [p.x(xb), p.y(yb)], out = false;
      // 図の枠の中に切る（Liang–Barsky。clip-path は使わない）
      var u0 = 0, u1 = 1, dx = B[0] - A[0], dy = B[1] - A[1];
      [[-dx, A[0] - x0], [dx, x1 - A[0]], [-dy, A[1] - y0], [dy, y1 - A[1]]].forEach(function(c){
        if (c[0] === 0){ if (c[1] < 0) u1 = -1; return; }
        var u = c[1] / c[0];
        if (c[0] < 0) u0 = Math.max(u0, u); else u1 = Math.min(u1, u);
      });
      // 枠の外の線は描かない（名前も図の上に出さない）
      if (u1 <= u0){ out = true; ctx.report("range", "[scatter] the trend line is outside the axes (it is not drawn)"); }
      else { B = [A[0] + dx * u1, A[1] + dy * u1]; A = [A[0] + dx * u0, A[1] + dy * u0]; }
      var line = D.el("path", {d: "M0,0", fill: "none", stroke: col, "stroke-width": 3.5, "stroke-linecap": "round", opacity: 0}, gT);
      if (t.dash) line.setAttribute("stroke-dasharray", "12 9");
      // 名前：{r} {a} {b} を相関係数・傾き・切片に置き換える（digits 桁、既定 2）
      var dg = t.digits !== undefined ? t.digits : 2, num = function(v){ return v === null ? "" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(dg); };
      var text = String(t.label || "").replace(/\{r\}/g, num(r)).replace(/\{a\}/g, num(a)).replace(/\{b\}/g, num(b));
      var len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      return {o: o, line: line, text: out ? "" : text, col: col, A: A, B: B, len: len, dash: !!t.dash, out: out, a: a};
    });
    // 系列と傾向の線の名前：図の上（右寄せ）に印と一緒に並べる（凡例の箱は作らない。点や線と重ならない）
    var lx = x1, entries = this.series.filter(function(se){ return se.o.s.label; }).map(function(se){ return {it: se, text: se.o.s.label, col: se.col, path: se.path}; })
      .concat(this.trends.filter(function(tr){ return tr.text; }).map(function(tr){ return {it: tr, text: tr.text, col: tr.col, line: true, dash: tr.dash}; }));
    // 印を左、字をその右に置く（字の幅は見積もりなので、ずれは右端に出る）
    entries.reverse().forEach(function(en){
      var w = est(en.text, 24), sw = en.line ? 40 : 2 * R, sx = lx - w - 10 - sw;
      var g = D.el("g", {opacity: 0}, gL);
      if (en.line){
        var ln = D.el("line", {x1: sx, x2: sx + sw, y1: 26, y2: 26, stroke: en.col, "stroke-width": 3.5, "stroke-linecap": "round"}, g);
        if (en.dash) ln.setAttribute("stroke-dasharray", "10 7");
      } else D.el("path", {d: en.path, fill: en.col, "fill-opacity": 0.85, transform: "translate(" + (sx + R).toFixed(1) + " 26)"}, g);
      D.mtext(g, sx + sw + 10, 34, en.text, {"font-size": 24, "font-weight": 700, fill: en.col});
      en.it.leg = g;
      lx = sx - 32;
    });
    if (lx + 32 < 0) ctx.report("size", "[scatter] the names above the figure are wider than the figure");
    // 読み上げ：最後の形（描いた点と傾向の線）を 1 文で。作者の aria-label があればそれを使う（上書きしない）
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", this.summary(/^ja\b/i.test(ctx.lang || "ja")));
    function tickStep(span){ var r = span / 5, e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e;
      return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e; }
  }
  // 最後の形を 1 文で（読み上げの名前）：「散布図（横：最高気温、縦：売上）：12 点（晴れ 8 点、雨 4 点）、横 24〜34、縦 210〜690、
  // 猛暑日 (34, 690)、傾向の線は右上がり（r = 0.93）」。範囲の外で描かない点は数えない
  summary(ja){
    var P = this.props, self = this, one = function(s){ return String(s || "").replace(/\s*\n\s*/g, " ").replace(/[*_^]/g, ""); };
    var ax = [P.xl ? (ja ? "横：" : "x: ") + one(P.xl) : "", P.yl ? (ja ? "縦：" : "y: ") + one(P.yl) : ""].filter(Boolean).join(ja ? "、" : ", ");
    var pts = [], ss = this.series.map(function(se){ se.marks.forEach(function(mk){ pts.push(mk.q); }); return {l: se.o.s.label, n: se.marks.length}; });
    var cnt = function(n){ return ja ? n + " 点" : n + (n === 1 ? " point" : " points"); };
    var out = [cnt(pts.length) + (ss.length > 1 && ss.some(function(x){ return x.l; }) ? (ja ? "（" : " (") + ss.map(function(x){ return (x.l ? one(x.l) + " " : "") + cnt(x.n); }).join(ja ? "、" : ", ") + (ja ? "）" : ")") : "")];
    if (pts.length){
      var mm = function(f){ var v = pts.map(f), lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); return lo === hi ? String(lo) : lo + (ja ? "〜" : " to ") + hi; };
      out.push((ja ? "横 " : "x ") + mm(function(q){ return q.x; }), (ja ? "縦 " : "y ") + mm(function(q){ return q.y; }));
    }
    pts.filter(function(q){ return q.label; }).slice(0, 6).forEach(function(q){ out.push(one(q.label) + " (" + q.x + ", " + q.y + ")"); });
    this.trends.forEach(function(tr){
      if (tr.out) return;
      var dir = tr.a === null ? (ja ? "垂直" : "vertical") : tr.a > 0 ? (ja ? "右上がり" : "rising") : tr.a < 0 ? (ja ? "右下がり" : "falling") : (ja ? "水平" : "flat");
      var ts = tr.o.t.series, sn = !tr.o.t.pts && ts !== undefined && [].concat(ts).length === 1 && self.series[[].concat(ts)[0]] ? self.series[[].concat(ts)[0]].o.s.label : "";
      out.push((sn ? one(sn) + (ja ? "の" : ": ") : "") + (ja ? "傾向の線は" : "the trend line is ") + dir + (tr.text ? (ja ? "（" : " (") + one(tr.text) + (ja ? "）" : ")") : ""));
    });
    return (ja ? "散布図" : "Scatter plot") + (ax ? (ja ? "（" + ax + "）" : " (" + ax + ")") : "") + (ja ? "：" : ": ") + out.join(ja ? "、" : ", ");
  }
  duration(k){
    var P = this.props, d = 0, pl = this.plan();
    pl.series.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.dur); });
    pl.trends.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.dur); });
    return d;
  }
  cues(k){
    var c = [], pl = this.plan();
    pl.series.concat(pl.trends).forEach(function(o){ if (o.step === k && o.at > 0 && c.indexOf(o.at) < 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var P = this.props, D = base, vr = this.variant, dur = P.dur, lecture = !!ctx.preview, FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    // この部品の段階の中の時刻（-1 = まだ。授業の表示では先の段階を薄く見せる）
    var local = function(o){ return o.step < k ? Infinity : o.step > k ? -1 : t - o.at; };
    var faint = function(o){ return lecture && o.step > k; };
    this.series.forEach(function(se){
      var o = se.o, tt = local(o), f = faint(o), span = dur * 0.7;
      se.marks.forEach(function(mk){
        var op, sc = 1;
        if (f){ op = FAINT; }
        else if (tt < 0){ op = 0; }
        else if (vr === "sweep"){ op = D.prog(tt, mk.rank * (span - 0.2), 0.2); }
        else if (vr === "grow"){ sc = D.prog(tt, 0, span); op = sc > 0 ? Math.min(1, sc * 3) : 0; }
        else { op = D.prog(tt, 0, span); }
        mk.g.setAttribute("opacity", op.toFixed(3));
        mk.g.setAttribute("transform", "translate(" + mk.cx.toFixed(1) + " " + mk.cy.toFixed(1) + ")" + (sc < 1 ? " scale(" + Math.max(0.001, sc).toFixed(4) + ")" : ""));
      });
      var lo = f ? FAINT : tt < 0 ? 0 : D.prog(tt, dur * 0.6, dur * 0.4);
      se.labels.forEach(function(l){ l.setAttribute("opacity", lo.toFixed(3)); });
      if (se.leg) se.leg.setAttribute("opacity", (f ? FAINT : tt < 0 ? 0 : D.prog(tt, 0, dur * 0.5)).toFixed(3));
    });
    this.trends.forEach(function(tr){
      var o = tr.o, tt = local(o), f = faint(o), span = dur * 0.7, A = tr.A, B = tr.B, e = f ? 1 : tt < 0 ? 0 : D.prog(tt, 0, span);
      var s0 = 0, s1 = 1, op = e > 0 ? 1 : 0;
      if (!f && vr === "sweep"){ s1 = e; }
      else if (!f && vr === "grow"){ s0 = 0.5 - e / 2; s1 = 0.5 + e / 2; }
      else op = e;
      tr.line.setAttribute("d", "M" + D.lerp(A[0], B[0], s0).toFixed(1) + "," + D.lerp(A[1], B[1], s0).toFixed(1) + "L" + D.lerp(A[0], B[0], s1).toFixed(1) + "," + D.lerp(A[1], B[1], s1).toFixed(1));
      if (tr.dash) tr.line.setAttribute("stroke-dashoffset", (s0 * tr.len).toFixed(1));
      tr.line.setAttribute("opacity", (tr.out ? 0 : f ? FAINT : op).toFixed(3));
      if (tr.leg) tr.leg.setAttribute("opacity", (f ? FAINT : tt < 0 ? 0 : D.prog(tt, span, dur * 0.3)).toFixed(3));
    });
  }
};
});
