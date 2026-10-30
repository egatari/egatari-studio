// m-kpi：大きな数字の札（KPI）を段階ごとに出す。数字は 0（か from）から数え上げ、下に増減の矢印と一言
// <m-kpi style="height:300px"><script type="application/json">
//   {"cards": [{"label": "作成時間", "value": 62, "unit": "%", "prefix": "−", "delta": {"dir": "down", "text": "前の版から 8 pt", "good": true}, "note": "1 本あたり"}]}
// （JSON の終わり）</m-kpi>
// 段階：既定は札 1 枚 = 1 段階（per-step で n 枚ずつ、札の step で直接、at で段階の中の開始秒）
// 数え上げは (k, t) だけで決まる（初めに速く、終わりにゆっくり。t = Infinity なら最後の値）。count="false" で数えずに出す
// 札の幅は cols（既定は札の数、4 まで）で決める。数字と単位の幅は字数から見積もって中央にそろえる（字の読み込みを待たない）
// 見せ方（docs/conventions.md §1）：count（数え上げ、既定）・rise（最後の値のまま少し小さい大きさから戻る）・flip（右の桁から 1 桁ずつ
// めくれて止まる）・underline（出たあと数字の下に線を引く）。段階の数・長さ・合図・最後の中身はどれも同じ
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (the first is the default) and calls VARIANT.of(this) once, in mount. The variant is the component's
// `variant` attribute when it names one of them, otherwise the first name. There is no seed: lessons do not carry one
// (spec §8.4 since egatari-spec 28d8801), and `seed` / `data-egatari-seed` are not read.
// The choice is a pure function of the attribute: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null && names.indexOf(v) >= 0) return v;
    if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
    return names[0] || null;
  }
  return {of: of};
})();
// ---- END egatari-variant ----
DECK.define("m-kpi", class extends DECK.MotionElement {
  static variants = ["count", "rise", "flip", "underline"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["cards"], properties: {
      cards: {type: "array", minItems: 1, items: {type: "object", required: ["value"], properties: {
        label: {type: "string"}, value: {type: "number"}, digits: {type: "integer"}, unit: {type: "string"}, prefix: {type: "string"}, from: {type: "number"}, tone: {type: "string"},
        delta: {type: "object", properties: {dir: {enum: ["up", "down"]}, text: {type: "string"}, good: {type: "boolean"}}}, note: {type: "string"}, step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {cards: [{label: "作成時間", value: 62, unit: "%", prefix: "−", delta: {dir: "down", text: "前の版から 8 pt", good: true}}]},
  };
  static props = {
    cols:       {type: "number", default: 0, doc: "1 行の札の数（0 = 札の数、4 まで）"},
    digits:     {type: "number", default: 0, doc: "数字の小数桁（札の digits が優先）"},
    "per-step": {type: "number", default: 1, doc: "1 段階に出す札の数（0 = 全部を段階 1 で）"},
    dur:        {type: "number", default: 1.2, doc: "数え上げの秒数"},
    stagger:    {type: "number", default: 0.3, doc: "同じ段階の札の出だしのずれ（秒）"},
    count:      {type: "bool", default: true, doc: "数字を数え上げる"},
    size:       {type: "number", default: 0, doc: "数字の字の大きさ（px。0 = 札の高さから）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var P = this.props, per = P["per-step"], seen = {};
    return (this._plan = ((this.data || {}).cards || []).map(function(c, i){
      var step = c.step !== undefined ? c.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {c: c, step: step, at: c.at !== undefined ? c.at : +((j - 1) * P.stagger).toFixed(3)};
    }));
  }
  mount(){
    var P = this.props, D = DECK, self = this, pl = this.plan();
    var vr = this.variant = VARIANT.of(this);
    // count="false"（数えない）が見せ方より強い：数える見せ方なら rise にする
    if (!P.count && (vr === "count" || vr === "flip")){
      console.info('m-kpi: count="false", so the variant "' + vr + '" is shown as "rise"');
      vr = this.variant = "rise";
    }
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var n = pl.length || 1, cols = P.cols || Math.min(4, n), rows = Math.ceil(n / cols), gap = 28;
    var cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
    var size = P.size || Math.max(48, Math.min(84, ch * 0.3, cw * 0.24));
    var est = function(s, sz){ return [...String(s)].reduce(function(a, c){ return a + (/[0-9.,+−-]/.test(c) ? 0.58 : /[\u0000-ɏ]/.test(c) ? 0.62 : 1); }, 0) * sz; };
    this.cards = pl.map(function(o, i){
      var c = o.c, x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap), cx = x + cw / 2;
      var col = "var(--" + (/^(term|emph|accent2|series-[1-4])$/.test(c.tone || "") ? c.tone : "term") + ")";
      var g = D.el("g", {opacity: 0}, svg);
      D.el("rect", {x: x, y: y, width: cw, height: ch, rx: 12, fill: "var(--term-tint)"}, g);
      D.el("rect", {x: x, y: y, width: cw, height: 7, rx: 3, fill: col}, g);
      // 行の位置：名前・数字・増減・一言を札の高さに配る
      var hasD = !!c.delta, hasN = !!c.note;
      var yl = y + 26 + 26, yn = y + ch * (hasD || hasN ? 0.5 : 0.6) + size * 0.36;
      D.mtext(g, cx, yl, c.label || "", {"text-anchor": "middle", "font-size": 26, "font-weight": 700});
      var dg = c.digits !== undefined ? c.digits : P.digits, usz = Math.round(size * 0.46);
      var finalS = (c.prefix || "") + self.fmt(c.value, dg);
      var nw = est(finalS, size), uw = c.unit ? est(c.unit, usz) + 6 : 0, xr = cx - (nw + uw) / 2 + nw;
      var gn = D.el("g", {}, g);   // 数字と単位（rise はこれを拡大する）
      var num = D.el("text", {x: xr.toFixed(1), y: yn.toFixed(1), "text-anchor": "end", "font-size": size, "font-weight": 700, fill: col, style: "font-variant-numeric:tabular-nums"}, gn);
      if (c.unit){ var u = D.el("text", {x: (xr + 6).toFixed(1), y: yn.toFixed(1), "font-size": usz, "font-weight": 700, fill: col}, gn); u.textContent = c.unit; }
      // flip：字ごとの tspan（桁だけがめくれる。y でなく dy で前の字との差を書く：y を書くと字の塊が分かれて右寄せが崩れる）
      var digits = null;
      if (vr === "flip"){
        digits = [...finalS].map(function(ch){
          var ts = D.el("tspan", {}, num); ts.textContent = ch;
          return {ts: ts, d: /[0-9]/.test(ch) ? +ch : null};
        });
        var nd = digits.filter(function(o){ return o.d !== null; }).length, j = 0;
        for (var q = digits.length - 1; q >= 0; q--) if (digits[q].d !== null) digits[q].j = j++, digits[q].n = nd;
      }
      var line = vr === "underline" ? D.el("line", {x1: (xr - nw).toFixed(1), x2: (xr - nw).toFixed(1), y1: (yn + size * 0.14).toFixed(1), y2: (yn + size * 0.14).toFixed(1), stroke: "var(--term)", "stroke-width": 5, "stroke-linecap": "round"}, g) : null;
      var gd = null;
      if (hasD){
        // 増減：▲ / ▼ と一言。良い向き（good、既定は up）なら --term、悪い向きなら --emph
        var up = c.delta.dir !== "down", good = c.delta.good !== undefined ? !!c.delta.good : up;
        var dc = good ? "var(--term)" : "var(--emph)", yd = yn + Math.max(44, size * 0.62), tw = est(c.delta.text || "", 24) + 30;
        gd = D.el("g", {opacity: 0}, g);
        var tx = cx - tw / 2;
        D.el("path", {d: up ? "M0,-9L9,7L-9,7Z" : "M0,9L9,-7L-9,-7Z", fill: dc, transform: "translate(" + (tx + 9).toFixed(1) + " " + (yd - 8).toFixed(1) + ")"}, gd);
        D.mtext(gd, tx + 30, yd, c.delta.text || "", {"font-size": 24, fill: dc, "font-weight": 700});
      }
      var note = hasN ? D.mtext(g, cx, y + ch - 22, c.note, {"text-anchor": "middle", "font-size": 24, fill: "var(--muted)"}) : null;
      return {o: o, g: g, gn: gn, num: num, gd: gd, dg: dg, from: c.from || 0, cx: cx, cy: y + ch / 2, xn: xr - nw / 2 + uw / 2, yn: yn, size: size, digits: digits, line: line, lx: xr - nw, lw: nw + uw};
    });
  }
  fmt(v, dg){
    var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + i + (s[1] ? "." + s[1] : "");
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + (P.count ? P.dur : 0.45) + (o.c.delta ? 0.4 : 0)); });
    return d;
  }
  cues(k){
    var c = [];
    this.plan().forEach(function(o){ if (o.step === k && o.at > 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var P = this.props, D = DECK, self = this;
    // 先の段階を薄く見せる表示（授業の表示）：後の段階の札を最後の値で、テーマの --preview-opacity の濃さに（動かさない）
    var preview = !!(ctx && (ctx.preview || ctx.mode === "lecture")), PV = 1;
    if (preview){ PV = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); if (!(PV >= 0 && PV <= 1)) PV = 0.45; }
    this.cards.forEach(function(o){
      var s = o.o.step, at = o.o.at, ahead = preview && s > k;
      var tt = s < k || ahead ? Infinity : s > k ? -1 : t;   // この札の段階の中の時刻（-1 = まだ）
      var e = tt < 0 ? 0 : D.prog(tt, at, 0.45);
      o.g.setAttribute("opacity", ahead ? PV.toFixed(3) : e.toFixed(3));
      o.g.setAttribute("transform", "translate(0 " + ((1 - e) * 14).toFixed(2) + ")");
      var vr = self.variant, span = P.count ? P.dur : 0.45;
      if (vr === "count"){
        // 数え上げ：ease-out（初めに速く）。t = Infinity なら最後の値
        var c = tt < 0 ? 0 : tt === Infinity || !P.count ? 1 : D.clamp01((tt - at) / P.dur);
        var q = 1 - Math.pow(1 - c, 3), v = D.lerp(o.from, o.o.c.value, q);
        o.num.textContent = (o.o.c.prefix || "") + self.fmt(c >= 1 ? o.o.c.value : v, o.dg);
      } else if (vr === "rise"){
        // 最後の値のまま、0.85 倍から元の大きさへ（札が現れるのと同じ 0.45 秒）
        var s = 0.85 + 0.15 * (tt < 0 ? 0 : D.prog(tt, at, 0.45)), cx = o.xn, cy = o.yn - o.size * 0.35;
        o.num.textContent = (o.o.c.prefix || "") + self.fmt(o.o.c.value, o.dg);
        o.gn.setAttribute("transform", s >= 1 ? "" : "translate(" + cx.toFixed(1) + " " + cy.toFixed(1) + ") scale(" + s.toFixed(4) + ") translate(" + (-cx).toFixed(1) + " " + (-cy).toFixed(1) + ")");
      } else if (vr === "flip"){
        // 札が出たあと（0.45 秒）、右の桁から 1 桁ずつ 0 → 最後の数字へめくれて、上から定位置に止まる（段階の長さの中で終わる）
        var t0 = at + 0.45, len = Math.max(0.1, span - 0.45), prev = 0;
        o.digits.forEach(function(d){
          var off = 0;
          if (d.d !== null){
            var w = len / (d.n + 1), st = t0 + d.j * w, e = tt < 0 ? 0 : tt === Infinity ? 1 : D.clamp01((tt - st) / (2 * w));
            var shown = e >= 1 ? d.d : Math.min(d.d, Math.floor(e * (d.d + 1))), frac = (e * (d.d + 1)) % 1;
            d.ts.textContent = String(shown);
            // めくれる桁は上から少し（字の 0.12）下りて止まる
            off = e > 0 && e < 1 ? -(1 - D.ease(frac)) * o.size * 0.12 : 0;
          }
          d.ts.setAttribute("dy", (off - prev).toFixed(1));
          prev = off;
        });
      } else {
        // underline：最後の値で出て、数字の下に左から右へ線を引く
        o.num.textContent = (o.o.c.prefix || "") + self.fmt(o.o.c.value, o.dg);
        // 線は段階の長さの中で引き終える（count="false" なら段階は 0.45 秒なので、後半の半分で引く）
        var u0 = Math.min(0.45, span * 0.5), u = tt < 0 ? 0 : D.prog(tt, at + u0, span - u0);
        o.line.setAttribute("x2", (o.lx + o.lw * u).toFixed(1));
        o.line.setAttribute("opacity", u > 0 ? 1 : 0);
      }
      if (o.gd) o.gd.setAttribute("opacity", (tt < 0 ? 0 : D.prog(tt, at + (P.count ? P.dur : 0.45) * 0.85, 0.4)).toFixed(3));
    });
  }
});
