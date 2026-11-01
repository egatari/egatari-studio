// m-orbit：月の満ち欠け（mode="moon"、既定）と金星の満ち欠け（mode="venus"）。左に北極の上から見た図、右に地球から見た形を並べ、同じ角度で動かす
// <m-orbit style="height:440px"></m-orbit>（データは省ける。8 つの位置を新月から順に回り、最後に新月へ戻る）
// <m-orbit mode="venus" style="height:440px"><script type="application/json">{"visit": [3, 4, 5]}</script></m-orbit>
// 形は絵ではなく位置から計算する：太陽・地球・天体の角度から、光っている側（地球から見て右か左か）と欠け方（明暗の境の楕円）を決める。
// 大きさと距離は実際の比ではない（教えるための図）。比は earth・moon の属性で変えられる。
// 月：位置 i は太陽の向きから反時計回りに 360°·i/N（0 が新月）。太陽の光は sun の側から来る。地球の上の人（observer）は、
//   月が真夜中の側にあるとき（90°〜270°）は月が南中する時刻に、夕方の側（0°〜90°）は日の入り、明け方の側（270°〜360°）は日の出に立つ。
//   新月は正午。人の時刻は段階の間で反時計回りに進む。
// 金星：太陽を中心に、地球を下に止めて（地球との位置の関係だけを見せる）、位置 i は外合から反時計回りに 360°·i/N。
//   地球から見た大きさは距離に反比例し、太陽からの離角で夕方の西の空か明け方の東の空かを決める。
// 字は部品の中の表から授業の言語（ctx.lang）で選ぶ。データの labels・notes で位置ごとに上書きできる（null は表のまま、"" は字なし）。
// eclipse（月だけ）：新月と満月の位置で、太陽・月・地球がそろったときの影（日食・月食）を描く。月の軌道の傾きは描かない（README）。
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog・lerp だけを使い、プレイヤーのグローバルは使わない。
egatariParts.define({name: "orbit", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-orbit"}, function(deps){
"use strict";
var base = deps.base;
var TAU = 2 * Math.PI;
// 字の表。ja と en。位置の名前は角度（度）で引く
var TEXT = {
  ja: {top: "北極の上から見た図", moonView: "地球から見た月", venusView: "地球から見た金星", light: "太陽の光", sun: "太陽", earth: "地球",
    moon: {0: "新月", 45: "三日月", 90: "上弦の月", 180: "満月", 270: "下弦の月"},
    venusEast: "よいの明星", venusWest: "明けの明星",
    solar: "日食", lunar: "月食", solarNote: "月が太陽をかくす", lunarNote: "月が地球の影に入る",
    hidden: "見えない", nearSun: "太陽に近くて見えない", eveningSky: "夕方・西の空", dawnSky: "明け方・東の空",
    time: function(h){ return h === 0 ? "真夜中" : h === 6 ? "明け方" : h === 12 ? "正午" : h === 18 ? "夕方" : h + "時ごろ"; },
    sky: function(d){ return d + "の空"; }, join: "・",
    dirs: {S: "南", SE: "南東", SW: "南西", E: "東", W: "西", N: "北", NE: "北東", NW: "北西"}},
  en: {top: "Seen from above the North Pole", moonView: "The Moon from Earth", venusView: "Venus from Earth", light: "Sunlight", sun: "Sun", earth: "Earth",
    moon: {0: "new moon", 45: "waxing crescent", 90: "first quarter", 180: "full moon", 270: "last quarter"},
    venusEast: "evening star", venusWest: "morning star",
    solar: "solar eclipse", lunar: "lunar eclipse", solarNote: "the Moon hides the Sun", lunarNote: "the Moon is in Earth's shadow",
    hidden: "not visible", nearSun: "too close to the Sun to see", eveningSky: "evening, western sky", dawnSky: "dawn, eastern sky",
    time: function(h){ return h === 0 ? "midnight" : h === 6 ? "dawn" : h === 12 ? "noon" : h === 18 ? "evening" : "about " + (h % 12 || 12) + (h < 12 ? " am" : " pm"); },
    sky: function(d){ return d + " sky"; }, join: ", ",
    dirs: {S: "southern", SE: "southeastern", SW: "southwestern", E: "eastern", W: "western", N: "northern", NE: "northeastern", NW: "northwestern"}},
};
// 金星の軌道の半径（地球の軌道を 1 とした比。距離と最大離角はこの値から計算する）
var VENUS_R = 0.723;
// 光っている面と影の面の色（テーマの色だけ。明るい面は --accent2 を地に薄く混ぜ、影の面は字の色を地に混ぜた灰）
var LIT = "color-mix(in srgb, var(--accent2) 22%, var(--bg))", DARK = "color-mix(in srgb, var(--fg) 42%, var(--bg))";
var Part = class extends base.MotionElement {
  static partName = "orbit";
  // 先の形は答え（どう欠けるかを予想させる）：授業の表示でも先を見せない
  static preview = "none";
  static shape = {
    schema: {type: "object", additionalProperties: false, properties: {
      positions: {type: "integer"}, start: {type: "integer"}, visit: {type: "array", items: {type: "integer"}},
      labels: {type: "array", items: {type: ["string", "null"]}}, notes: {type: "array", items: {type: ["string", "null"]}},
      eclipse: {type: "boolean"}}},
    example: {positions: 8, visit: [1, 2, 3, 4, 5, 6, 7, 0]},
  };
  static props = {
    mode:       {type: "string", default: "moon", doc: "moon（月の満ち欠け）か venus（金星の満ち欠け）"},
    hemisphere: {type: "string", default: "north", doc: "north（北半球から見た形。満ちていく月は右が光る）か south（南半球。左右が逆）"},
    sun:        {type: "string", default: "right", doc: "月の図で太陽の光が来る側（right か left）"},
    earth:      {type: "number", default: 0.2, doc: "地球の半径（月の軌道の半径に対する比。金星の図では地球の軌道に対する比の半分）"},
    moon:       {type: "number", default: 0.5, doc: "月の半径（地球の半径に対する比。実際の月は 0.27。金星の図では金星をこの 1.4 倍に）"},
    observer:   {type: "bool", default: true, doc: "月の図で、地球の上の人と、月を見る向きを描く"},
    size:       {type: "number", default: 28, doc: "地球から見た形の名前の字の大きさ（px。24 以上）"},
    dur:        {type: "number", default: 1.2, doc: "となりの位置へ動く秒数（2 つ先なら 2 倍）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().visit.length;
  }
  plan(){
    if (this._plan) return this._plan;
    var notes = this._notes = [], d = this.data || {}, venus = this.props.mode === "venus";
    var N = d.positions !== undefined ? d.positions : 8;
    if (!(N >= 4 && N <= 24)){ notes.push("[orbit] positions must be 4 to 24 (got " + N + "); using 8"); N = 8; }
    var fix = function(i, what){
      if (i >= 0 && i < N) return i;
      notes.push("[orbit] " + what + " " + i + " is not a position 0 to " + (N - 1) + " (wrapped)");
      return ((i % N) + N) % N;
    };
    var start = d.start !== undefined ? fix(d.start, "start") : 0;
    var visit = d.visit ? d.visit.map(function(i){ return fix(i, "visit"); }) : null;
    if (!visit){ visit = []; for (var i = 1; i <= N; i++) visit.push((start + i) % N); }
    // 段階ごとの出発点・到着点と、反時計回りに進む位置の数
    var legs = [], prev = start;
    visit.forEach(function(v){ legs.push({from: prev, to: v, n: ((v - prev) % N + N) % N}); prev = v; });
    return (this._plan = {N: N, venus: venus, start: start, visit: visit, legs: legs, eclipse: !venus && !!d.eclipse});
  }
  duration(k){
    var l = this.plan().legs[k - 1];
    return l ? l.n * this.props.dur : 0;
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan();
    this._notes.forEach(function(m){ ctx.report("data", m); });
    ["mode", "hemisphere", "sun"].forEach(function(a){
      var ok = {mode: ["moon", "venus"], hemisphere: ["north", "south"], sun: ["right", "left"]}[a];
      if (ok.indexOf(P[a]) < 0) ctx.report("attr", "[orbit] " + a + "=\"" + P[a] + "\" is not one of " + ok.join(", ") + "; using " + ok[0]);
    });
    this.south = P.hemisphere === "south";
    this.sunLeft = !pl.venus && P.sun === "left";
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    this.labels = this.positionLabels();
    this.noteData = (this.data && this.data.notes) || [];
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    var W = this.W = this.clientWidth, H = this.H = this.clientHeight;
    this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var L = this.L = this.arrange();
    if (!L.fits) ctx.report("size", "[orbit] the diagram does not fit its box (" + L.why + "); make the element larger");
    this.draw(L);
  }
  // 位置ごとの名前：データの labels が先、なければ表（月は角度で、金星は最大離角に近い位置）
  positionLabels(){
    var pl = this.plan(), N = pl.N, T = this.T, given = (this.data && this.data.labels) || [], out = [];
    for (var i = 0; i < N; i++){
      var def = "";
      if (!pl.venus){
        var deg = 360 * i / N;
        if (Math.abs(deg - Math.round(deg)) < 1e-9 && T.moon[Math.round(deg)]) def = T.moon[Math.round(deg)];
      } else {
        var ge = Math.round(N * (180 - Math.acos(VENUS_R) * 180 / Math.PI) / 360);
        if (i === ge) def = T.venusEast; else if (i === N - ge) def = T.venusWest;
      }
      out.push(given[i] === undefined || given[i] === null ? def : given[i]);
    }
    return out;
  }
  // 配置：左に上から見た図（正方形に近い）、右に地球から見た形。上に 2 つの図の題
  arrange(){
    var W = this.W, H = this.H, P = this.props, pl = this.plan(), N = pl.N, why = [];
    var head = 40, gap = 24, fs = Math.max(24, P.size);
    var rightW = Math.max(300, Math.min(420, W * 0.32)), topW = W - rightW - gap, rightX = topW + gap;
    var lab = 24, lh = 30, labelW = 0, self = this;
    this.labels.forEach(function(s){ labelW = Math.max(labelW, est(s, lab)); });
    var L = {head: head, topW: topW, rightX: rightX, rightW: rightW, fs: fs, lab: lab, why: why};
    var areaTop = head, areaH = H - head;
    if (!pl.venus){
      // 太陽の光の矢印の列（太陽の側の端）。題の字の幅だけ取る
      var col = Math.max(70, est(this.T.light, 24) + 8);
      var side = this.sunLeft ? -1 : 1;
      // 軌道の半径 R：横は（光の列を除いた幅）、縦は（高さ）に、月と名前が入る最大
      var mr = function(R){ return R * P.earth * P.moon; };
      // 軌道と名前の幅（blockW）の太陽の側に、16px あけて光の列を置き、全体を左の図の幅の中ほどに
      var blockW = function(R){ return 2 * (R + mr(R) + 10 + labelW); };
      var fitsR = function(R){
        var hNeed = 2 * (R + mr(R) + 8 + (labelW ? lh : 0));
        return blockW(R) + 16 + col <= topW && hNeed <= areaH;
      };
      var lo = 20, hi = Math.max(lo, Math.min(topW, areaH));
      for (var it = 0; it < 40; it++){ var mid = (lo + hi) / 2; if (fitsR(mid)) lo = mid; else hi = mid; }
      var R = lo, bw = blockW(R), x0 = Math.max(0, (topW - bw - 16 - col) / 2);
      L.R = R; L.cy = areaTop + areaH / 2; L.er = R * P.earth; L.mr = mr(R); L.col = col; L.side = side;
      L.cx = side > 0 ? x0 + bw / 2 : x0 + col + 16 + bw / 2;
      L.colX = side > 0 ? x0 + bw + 16 : x0;
      if (L.er + (P.observer ? 34 : 0) + L.mr + 6 > R) why.push("the Earth and the Moon touch; lower earth or moon");
      if (R < 60) why.push("the orbit is " + Math.round(R) + "px");
    } else {
      // 金星：太陽が中心、地球の軌道 RE。地球は下、名前は右の図だけ
      // 地球の名前を地球の下に置く分（34px）を下にあける
      var RE = Math.min(topW / 2 - 12, (areaH - 34) / 2 - 12) / (1 + P.earth * 0.5);
      L.R = RE; L.cx = topW / 2; L.cy = areaTop + (areaH - 34) / 2; L.er = RE * P.earth * 0.5; L.mr = L.er * P.moon * 1.4; L.sr = RE * 0.14;
      if (RE < 80) why.push("the orbit is " + Math.round(RE) + "px");
    }
    // 右の図：大きな円盤と、その下の名前（fs）と説明（24px）の 2 行
    var textH = fs * 1.3 + 24 * 1.3 + 12;
    L.dr = Math.max(10, Math.min(150, rightW / 2 - 12, (areaH - textH) / 2 - 8));
    L.dcx = rightX + rightW / 2; L.dcy = areaTop + 8 + L.dr;
    L.nameY = L.dcy + L.dr + 12 + fs; L.noteY = L.nameY + 10 + 24;
    var noteW = 0;
    this.L = L;   // caption が位置の幾何を使う
    for (var i = 0; i < N; i++) noteW = Math.max(noteW, est(this.caption(i, this.observerAngleAt(i)), 24), est(this.labels[i], fs));
    if (noteW > rightW) why.push("a caption is " + Math.round(noteW) + "px wide, the right side " + Math.round(rightW) + "px");
    if (L.dr < 50) why.push("the view from Earth is " + Math.round(L.dr) + "px");
    L.fits = !why.length; L.why = why.join("; ");
    return L;
  }
  // ---- 幾何（数学の向き：x は右、y は上。描くときに SVG の向きに直す）
  // 位置 a（小数可）の天体の中心（上から見た図）と、太陽の向き（天体から太陽への単位ベクトル）
  bodyAt(a){
    var L = this.L, pl = this.plan(), th = TAU * a / pl.N;
    if (!pl.venus){
      var s = this.sunLeft ? Math.PI : 0, g = s + th;
      return {x: L.R * Math.cos(g), y: L.R * Math.sin(g), sun: [Math.cos(s), Math.sin(s)], earth: [0, 0]};
    }
    // 金星：外合（地球の反対側、上）から反時計回り
    var psi = Math.PI / 2 + th, r = L.R * VENUS_R, x = r * Math.cos(psi), y = r * Math.sin(psi), d = Math.hypot(x, y);
    return {x: x, y: y, sun: [-x / d, -y / d], earth: [0, -L.R]};
  }
  // 地球から見た形：照らされた割合のもとの cos（位相角）、光っている側（+1 右、-1 左）、地球からの距離と離角
  phaseAt(a){
    var b = this.bodyAt(a), ex = b.earth[0], ey = b.earth[1], dx = b.x - ex, dy = b.y - ey, d = Math.hypot(dx, dy) || 1;
    var ux = dx / d, uy = dy / d;
    // 天体から地球への向きと、天体から太陽への向きのなす角（位相角）
    var cosP = b.sun[0] * (-ux) + b.sun[1] * (-uy);
    // 見る人の左（上から見て反時計回りに 90°）は東。太陽が西（右）にあれば右が光る
    var east = b.sun[0] * (-uy) + b.sun[1] * ux;
    var side = east < 0 ? 1 : -1;
    if (this.south) side = -side;
    // 地球から見た太陽の向きと天体の向きの離角（東が正）
    var sx = -ex, sy = -ey, sd = Math.hypot(sx, sy);
    var elong = sd ? Math.atan2(sx * uy - sy * ux, sx * ux + sy * uy) : 0;
    if (!this.plan().venus){ elong = Math.atan2(this.bodyAt(0).sun[0] * uy - this.bodyAt(0).sun[1] * ux, this.bodyAt(0).sun[0] * ux + this.bodyAt(0).sun[1] * uy); }
    return {cosP: Math.max(-1, Math.min(1, cosP)), side: side, d: d, elong: elong};
  }
  // 位置 i にいるときの地球の上の人の角度（太陽の向きから反時計回り、度）。0 は正午、90 は夕方、180 は真夜中、270 は明け方
  observerAngleAt(i){
    var e = 360 * i / this.plan().N;
    if (e === 0) return 0;
    if (e < 90) return 90;
    if (e > 270) return 270;
    return e;
  }
  caption(i, w){
    var T = this.T, pl = this.plan();
    var given = this.noteData && this.noteData[i];
    if (given !== undefined && given !== null) return given;
    var ph = this.phaseAt(i), lit = (1 + ph.cosP) / 2;
    if (pl.venus){
      var deg = ph.elong * 180 / Math.PI;
      if (Math.abs(deg) < 10) return T.nearSun;
      return deg > 0 ? T.eveningSky : T.dawnSky;
    }
    if (pl.eclipse){
      var e0 = (360 * i / pl.N) % 360;
      if (e0 === 0) return T.solarNote;
      if (e0 === 180) return T.lunarNote;
    }
    var h = Math.round(((12 + w / 15) % 24 + 24) % 24);
    // 見る向き：人の真上から月への角（東が正）。南（南半球は北）の空を基準に 45° ごと
    var a = ((360 * i / pl.N - w) % 360 + 540) % 360 - 180, n = this.south ? "N" : "S";
    var dir = Math.abs(a) <= 22.5 ? n : Math.abs(a) < 67.5 ? n + (a > 0 ? "E" : "W") : (a > 0 ? "E" : "W");
    var s = T.time(h) + T.join + T.sky(T.dirs[dir]);
    if (lit < 0.02) s = T.time(h) + T.join + T.hidden;
    return s;
  }
  draw(L){
    var D = base, svg = this.svg, pl = this.plan(), N = pl.N, self = this, T = this.T, P = this.props;
    var X = function(x){ return L.cx + x; }, Y = function(y){ return L.cy - y; };
    // 題
    D.el("text", {x: 0, y: 28, "font-size": 24, fill: "var(--muted)"}, svg).textContent = T.top;
    D.el("text", {x: L.dcx, y: 28, "font-size": 24, fill: "var(--muted)", "text-anchor": "middle"}, svg).textContent = pl.venus ? T.venusView : T.moonView;
    var fig = D.el("g", {}, svg);
    if (!pl.venus){
      // 太陽の光：端の列に、地球の側へ向かう矢印
      var side = L.side, x0 = L.colX + (side > 0 ? L.col - 4 : 4), x1 = L.colX + (side > 0 ? 4 : L.col - 4);
      var lg = D.el("g", {}, fig);
      for (var j = 0; j < 4; j++){
        var yy = L.cy - L.R * 0.75 + j * L.R * 0.5;
        D.el("line", {x1: x0, y1: yy, x2: x1 + (side > 0 ? 10 : -10), y2: yy, stroke: "var(--accent2)", "stroke-width": 3}, lg);
        D.el("path", {d: "M" + x1 + "," + yy + "l" + (side > 0 ? 14 : -14) + ",-7v14z", fill: "var(--accent2)"}, lg);
      }
      D.el("text", {x: side > 0 ? L.colX + L.col : L.colX, y: L.cy - L.R * 0.75 - 18, "font-size": 24, fill: "var(--fg)", "text-anchor": side > 0 ? "end" : "start"}, lg).textContent = T.light;
      // 軌道
      D.el("circle", {cx: X(0), cy: Y(0), r: L.R, fill: "none", stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6"}, fig);
    } else {
      D.el("circle", {cx: X(0), cy: Y(0), r: L.R, fill: "none", stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6"}, fig);
      D.el("circle", {cx: X(0), cy: Y(0), r: L.R * VENUS_R, fill: "none", stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6"}, fig);
      D.el("circle", {cx: X(0), cy: Y(0), r: L.sr, fill: "var(--accent2)"}, fig);
    }
    // 影（食）。render が濃さを決める
    this.shadow = D.el("path", {d: "", fill: "var(--fg)", opacity: 0}, fig);
    // 位置の印：薄い天体（光っている半分は太陽の側）
    this.ghosts = [];
    for (var i = 0; i < N; i++){
      var b = this.bodyAt(i), g = D.el("g", {opacity: 0.35}, fig);
      body(g, X(b.x), Y(b.y), L.mr, b.sun);
      this.ghosts.push(g);
    }
    // 地球
    var eb = pl.venus ? {x: 0, y: -L.R} : {x: 0, y: 0}, esun = pl.venus ? [0, 1] : this.bodyAt(0).sun;
    body(D.el("g", {}, fig), X(eb.x), Y(eb.y), L.er, esun, "var(--term)");
    if (pl.venus) D.el("text", {x: X(eb.x), y: Y(eb.y) + L.er + 28, "font-size": 24, fill: "var(--fg)", "text-anchor": "middle"}, fig).textContent = T.earth;
    // 見る線（地球の上の人、または地球から天体へ）と人
    this.sight = D.el("path", {d: "", fill: "none", stroke: "var(--fg)", "stroke-width": 2, "stroke-dasharray": "4 5"}, fig);
    this.person = D.el("g", {}, fig);
    if (!pl.venus && P.observer){
      // 地球の表面に立つ人（上が外向き）。render が回す
      D.el("line", {x1: 0, y1: 0, x2: 0, y2: -16, stroke: "var(--fg)", "stroke-width": 3}, this.person);
      D.el("line", {x1: -7, y1: -10, x2: 7, y2: -10, stroke: "var(--fg)", "stroke-width": 3}, this.person);
      D.el("circle", {cx: 0, cy: -22, r: 6, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 3}, this.person);
    }
    // 今の天体
    this.cur = D.el("g", {}, fig);
    // 上から見た図の位置の名前（月だけ）：軌道の外、天体の外側に
    this.posLabels = [];
    if (!pl.venus){
      for (i = 0; i < N; i++){
        if (!this.labels[i]) { this.posLabels.push(null); continue; }
        var th = (this.sunLeft ? Math.PI : 0) + TAU * i / N, c = Math.cos(th), s = Math.sin(th), rr = L.R + L.mr + 10;
        var anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        var ty = Y(rr * s) + (s > 0.3 ? -6 : s < -0.3 ? 24 : 8) + (anchor === "middle" ? 0 : 0);
        var tx = X(rr * c);
        var t = D.el("text", {x: tx.toFixed(1), y: ty.toFixed(1), "font-size": L.lab, fill: "var(--fg)", "text-anchor": anchor, opacity: 0}, fig);
        t.textContent = this.labels[i];
        this.posLabels.push(t);
      }
    }
    // 右：地球から見た形
    var view = D.el("g", {}, svg);
    this.vSun = D.el("circle", {cx: L.dcx, cy: L.dcy, r: L.dr, fill: "var(--accent2)", opacity: 0}, view);
    this.vDark = D.el("circle", {cx: L.dcx, cy: L.dcy, r: L.dr, fill: DARK}, view);
    this.vLit = D.el("path", {d: "", fill: LIT}, view);
    this.vRim = D.el("circle", {cx: L.dcx, cy: L.dcy, r: L.dr, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, view);
    this.vName = D.el("text", {x: L.dcx, y: L.nameY, "font-size": L.fs, "font-weight": 700, fill: "var(--fg)", "text-anchor": "middle"}, view);
    this.vNote = D.el("text", {x: L.dcx, y: L.noteY, "font-size": 24, fill: "var(--muted)", "text-anchor": "middle"}, view);
  }
  render(k, t, ctx){
    var pl = this.plan(), L = this.L, N = pl.N, self = this, D = base;
    if (!L) return;
    var X = function(x){ return L.cx + x; }, Y = function(y){ return L.cy - y; };
    var leg = k >= 1 ? pl.legs[Math.min(k, pl.legs.length) - 1] : null;
    var from = leg ? leg.from : pl.start, to = leg ? leg.to : pl.start, n = leg ? leg.n : 0;
    var dur = n * this.props.dur, e = k > pl.legs.length || !leg || !n ? 1 : D.prog(t, 0, dur);
    var a = from + n * e;   // 位置（小数）
    // 天体
    var b = this.bodyAt(a), ph = this.phaseAt(a);
    while (this.cur.firstChild) this.cur.removeChild(this.cur.firstChild);
    body(this.cur, X(b.x), Y(b.y), L.mr, b.sun);
    // 地球の上の人と見る線
    if (!pl.venus){
      var w0 = this.observerAngleAt(from), w1 = this.observerAngleAt(to);
      if (n && w1 <= w0) w1 += 360;
      var w = n ? D.lerp(w0, w1, e) : w1;
      var wr = (this.sunLeft ? 180 : 0) + w, wrad = wr * Math.PI / 180;
      var ox = (L.er + 22) * Math.cos(wrad), oy = (L.er + 22) * Math.sin(wrad);
      if (this.props.observer){
        setIf(this.person, "transform", "translate(" + X(L.er * Math.cos(wrad)).toFixed(2) + " " + Y(L.er * Math.sin(wrad)).toFixed(2) + ") rotate(" + (90 - wr).toFixed(2) + ")");
        sightLine(this.sight, X(ox), Y(oy), X(b.x), Y(b.y), L.mr + 4);
      } else setIf(this.sight, "d", "");
    } else sightLine(this.sight, X(0), Y(-L.R + L.er + 4), X(b.x), Y(b.y), L.mr + 4);
    // 位置の名前（上から見た図）：着いた位置から出る
    var seen = {};
    seen[pl.start] = 1;
    for (var s = 1; s < k && s <= pl.legs.length; s++) seen[pl.legs[s - 1].to] = 1;
    this.posLabels.forEach(function(el, i){
      if (!el) return;
      var op = seen[i] ? 1 : i === to && leg && k <= pl.legs.length ? D.prog(t, Math.max(0, dur - 0.3), 0.3) : 0;
      if (i === to && k > pl.legs.length) op = 1;
      setIf(el, "opacity", (+op).toFixed(3));
    });
    // 右の図
    var R = L.dr, scale = 1;
    if (pl.venus){
      // 大きさは距離に反比例。いちばん近い位置を R にする
      var dmin = Infinity;
      for (var i = 0; i < N; i++) dmin = Math.min(dmin, this.phaseAt(i).d);
      var near = Math.max(dmin, L.R * (1 - VENUS_R) * 1.4);
      scale = Math.min(1, near / ph.d);
    }
    var r = R * scale;
    setIf(this.vDark, "r", r.toFixed(2));
    setIf(this.vRim, "r", r.toFixed(2));
    setIf(this.vLit, "d", litPath(L.dcx, L.dcy, r, ph.cosP, ph.side));
    // 食：そろった位置のまわり 12° で濃くなる
    var deg = ((360 * a / N) % 360 + 360) % 360, solar = 0, lunar = 0;
    if (pl.eclipse){
      solar = Math.max(0, 1 - Math.min(deg, 360 - deg) / 12);
      lunar = Math.max(0, 1 - Math.abs(deg - 180) / 12);
    }
    setIf(this.vSun, "opacity", solar.toFixed(3));
    setIf(this.vSun, "r", (r * 1.1).toFixed(2));   // 日食：月のまわりに太陽の縁が少し出る
    // 月食：影に入った月は暗く（--muted）
    setIf(this.vDark, "style", "fill:" + (lunar > 0.5 ? "var(--muted)" : DARK) + ";");   // base.el と同じ書き方
    if (lunar > 0) setIf(this.vLit, "opacity", (1 - lunar).toFixed(3)); else setIf(this.vLit, "opacity", "1");
    // 影の形：日食は月から地球へ、月食は地球から月の先へ
    var sd = "";
    if (solar > 0 || lunar > 0){
      var sun = this.bodyAt(0).sun, px = -sun[1], py = sun[0];
      if (solar > 0){
        sd = poly([[b.x + px * L.mr, b.y + py * L.mr], [b.x - px * L.mr, b.y - py * L.mr], [-sun[0] * L.er * 0.2 - px * 2, -sun[1] * L.er * 0.2 - py * 2], [-sun[0] * L.er * 0.2 + px * 2, -sun[1] * L.er * 0.2 + py * 2]], X, Y);
      } else {
        var far = L.R + L.mr * 2.5;
        sd = poly([[px * L.er, py * L.er], [-px * L.er, -py * L.er], [-sun[0] * far - px * L.er * 0.7, -sun[1] * far - py * L.er * 0.7], [-sun[0] * far + px * L.er * 0.7, -sun[1] * far + py * L.er * 0.7]], X, Y);
      }
    }
    setIf(this.shadow, "d", sd);
    setIf(this.shadow, "opacity", (0.22 * Math.max(solar, lunar)).toFixed(3));
    // 名前と説明：前半は出発点のものが消え、後半に到着点のものが出る
    var useTo = !n || e >= 0.5 || k > pl.legs.length;
    var idx = useTo ? to : from, op = !n || k > pl.legs.length ? 1 : useTo ? D.prog(t, dur * 0.75, dur * 0.25) : 1 - D.prog(t, 0, dur * 0.25);
    var name = this.labels[idx] || "";
    if (pl.eclipse && useTo){
      var dg = (360 * idx / N) % 360;
      if (dg === 0) name = (name ? name + "（" : "") + this.T.solar + (name ? "）" : "");
      if (dg === 180) name = (name ? name + "（" : "") + this.T.lunar + (name ? "）" : "");
    }
    if (this.T === TEXT.en) name = name.replace("（", " (").replace("）", ")");
    setText(this.vName, name);
    setText(this.vNote, this.caption(idx, this.observerAngleAt(idx)));
    setIf(this.vName, "opacity", op.toFixed(3));
    setIf(this.vNote, "opacity", op.toFixed(3));
  }
};

// ---- 下の関数は m-orbit の中だけで使う
function setIf(el, a, v){ v = String(v); if (el.getAttribute(a) !== v) el.setAttribute(a, v); }
function setText(el, s){ if (el.textContent !== s) el.textContent = s; }
// 字の幅（px）：数字 0.6 字、ほかの欧文 0.55 字、空白 0.3 字、和文 1 字
function est(s, fs){
  var w = 0;
  for (var ch of String(s || "")) w += /[0-9]/.test(ch) ? 0.6 : ch === " " ? 0.3 : /[\u0000-ɏ]/.test(ch) ? 0.55 : 1;
  return w * fs;
}
// 上から見た天体：暗い円盤と、太陽の側の明るい半分
function body(g, cx, cy, r, sun, litFill){
  base.el("circle", {cx: cx.toFixed(2), cy: cy.toFixed(2), r: r.toFixed(2), fill: DARK}, g);
  var a = Math.atan2(-sun[1], sun[0]), p = [];
  for (var i = 0; i <= 24; i++){ var u = a - Math.PI / 2 + Math.PI * i / 24; p.push([cx + r * Math.cos(u), cy + r * Math.sin(u)]); }
  base.el("path", {d: "M" + p.map(function(q){ return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join("L") + "Z", fill: litFill || LIT}, g);
  base.el("circle", {cx: cx.toFixed(2), cy: cy.toFixed(2), r: r.toFixed(2), fill: "none", stroke: "var(--muted)", "stroke-width": 1.5}, g);
}
// 地球から見た明るい部分：光っている側の縁（半円）と、明暗の境（横の半径が r·|cos 位相角| の半楕円）
function litPath(cx, cy, r, cosP, side){
  if ((1 + cosP) / 2 < 1e-4) return "";
  var pts = [], M = 48, i, u;
  for (i = 0; i <= M; i++){ u = -Math.PI / 2 + Math.PI * i / M; pts.push([cx + side * r * Math.cos(u), cy + r * Math.sin(u)]); }
  for (i = M; i >= 0; i--){ u = -Math.PI / 2 + Math.PI * i / M; pts.push([cx - side * cosP * r * Math.cos(u), cy + r * Math.sin(u)]); }
  return "M" + pts.map(function(q){ return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join("L") + "Z";
}
function poly(pts, X, Y){ return "M" + pts.map(function(q){ return X(q[0]).toFixed(2) + "," + Y(q[1]).toFixed(2); }).join("L") + "Z"; }
// 見る線：出発点から天体の縁の手前まで、先に小さな矢じり
function sightLine(el, x0, y0, x1, y1, stop){
  var dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (d <= stop + 4){ setIf(el, "d", ""); return; }
  var ux = dx / d, uy = dy / d, ex = x1 - ux * stop, ey = y1 - uy * stop, px = -uy, py = ux;
  setIf(el, "d", "M" + x0.toFixed(2) + "," + y0.toFixed(2) + "L" + ex.toFixed(2) + "," + ey.toFixed(2) +
    "M" + (ex - ux * 9 + px * 5).toFixed(2) + "," + (ey - uy * 9 + py * 5).toFixed(2) + "L" + ex.toFixed(2) + "," + ey.toFixed(2) + "L" + (ex - ux * 9 - px * 5).toFixed(2) + "," + (ey - uy * 9 - py * 5).toFixed(2));
}
return Part;
});
