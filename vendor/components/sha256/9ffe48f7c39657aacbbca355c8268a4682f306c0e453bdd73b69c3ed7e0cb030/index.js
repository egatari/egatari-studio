// m-diverge：ウォーターフォール。基準の棒から始め、増減を前の棒の端から上下に積み、最後に合計の棒を立てる
// <m-diverge unit="億円" style="height:420px"><script type="application/json">
//   {"items": [{"label": "前年の利益", "value": 120, "total": true},
//              {"label": "売上の増加", "value": 45}, {"label": "原価の増加", "value": -30},
//              {"label": "今年の利益", "total": true}]}
// （JSON の終わり）</m-diverge>
// 合計の棒（total: true）は 0 から、増減の棒は前の棒の端（それまでの累計）から伸びる。最初の合計の棒の value が基準。
// 後の合計の棒は累計から決め、value を書いたら累計と合うかを確かめる（合わなければ data で知らせ、累計を描く）
// 色：合計 --term、増加 --accent2、減少 --emph（item の tone で変えられる）。値の数字は棒の端の外（増加と合計は上、減少は下）に、
// 増減には符号を付けて書く。隣の棒とは累計の高さで点線をつなぐ
// ステップ：既定は棒 1 本 = 1 ステップ（per-step で n 本ずつ、item の step で直接）。軸・目盛り・棒の名前はステップ 0 から見える
egatariParts.define({name: "diverge", version: "2.0.0", requires: {base: "1.2.0"}, element: "m-diverge"}, function(deps){
"use strict";
var base = deps.base;
return class extends base.MotionElement {
  static partName = "diverge";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["items"], properties: {
      items: {type: "array", minItems: 1, items: {type: "object", required: ["label"], properties: {
        label: {type: "string"}, value: {type: "number"}, total: {type: "boolean"}, tone: {type: "string"}, step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {items: [{label: "前年", value: 120, total: true}, {label: "増加", value: 45}, {label: "減少", value: -30}, {label: "今年", total: true}]},
  };
  static props = {
    unit:       {type: "string", default: "", doc: "値の単位（数字の後ろに付ける。億円、人、% など）"},
    digits:     {type: "number", default: 0, doc: "値の小数桁"},
    "per-step": {type: "number", default: 1, doc: "1 ステップに出す棒の数（0 = 全部をステップ 1 で）"},
    dur:        {type: "number", default: 0.8, doc: "1 本が伸びる秒数"},
    stagger:    {type: "number", default: 0.3, doc: "同じステップの棒の出だしのずれ（秒）"},
    min:        {type: "number", default: 0, doc: "値の軸の始まり（0 = 0 から。正の値なら軸をそこから始め、切れ目の印を付ける。棒の端がすべてそれ以上のときだけ）"},
    ticks:      {type: "bool", default: true, doc: "値の軸の目盛りと格子"},
    links:      {type: "bool", default: true, doc: "隣の棒を累計の高さの点線でつなぐ"},
    al:         {type: "string", default: "", doc: "値の軸の名前"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().bars.forEach(function(b){ m = Math.max(m, b.step); });
    return m;
  }
  // 棒ごとの始め・終わり（累計）、ステップと開始時刻。データだけから決める（mount の前にも steps が要る）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, per = P["per-step"], seen = {}, run = 0, bad = [];
    var bars = (d.items || []).map(function(it, i){
      var step = it.step !== undefined ? it.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1, at = it.at !== undefined ? it.at : +((j - 1) * P.stagger).toFixed(3);
      var b = {it: it, i: i, step: step, at: at, total: !!it.total};
      if (b.total){
        // 最初の棒か、それまでに増減がない合計の棒は value が基準になる。それ以外は累計（value は確かめに使う）
        var given = typeof it.value === "number" && isFinite(it.value);
        if (given && i > 0 && Math.abs(it.value - run) > 1e-6 * Math.max(1, Math.abs(run))) bad.push({label: it.label, given: it.value, run: run});
        if (given && i === 0) run = it.value;
        b.from = 0; b.to = run; b.v = run;
      } else {
        var v = +it.value || 0;
        b.from = run; b.to = run + v; b.v = v; run = b.to;
      }
      return b;
    });
    return (this._plan = {bars: bars, bad: bad});
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!pl.bars.length){ ctx.report("data", "[diverge] items is empty"); return; }
    if (pl.bars[0].total && typeof pl.bars[0].it.value !== "number") ctx.report("data", "[diverge] the first total bar needs a value (the baseline)");
    pl.bad.forEach(function(x){ ctx.report("data", "[diverge] the total \"" + x.label + "\" is " + x.given + " but the running total is " + +x.run.toFixed(6) + "; drawing the running total"); });
    var est = function(s, size, mk){ return D.textWidth(s, size, {font: self, mark: !!mk}); };
    // 値の軸：棒の端（0 を含む）から。上は値の数字の分、下は負の棒の数字の分をあける
    var ends = [0];
    pl.bars.forEach(function(b){ ends.push(b.from, b.to); });
    var hi = Math.max.apply(null, ends), lo = Math.min.apply(null, ends);
    // min（正）：軸をそこから始める（合計の棒は軸の下の端から）。増減の棒の端と合計がすべて min 以上のときだけ
    var cut = 0;
    if (P.min > 0){
      var low = Math.min.apply(null, pl.bars.map(function(b){ return b.total ? b.to : Math.min(b.from, b.to); }));
      if (low < P.min) ctx.report("data", "[diverge] min " + P.min + " is above the lowest bar end (" + +low.toFixed(6) + "); the axis starts at 0");
      else { cut = P.min; lo = cut; }
    }
    this.cut = cut;
    var lines = Math.max.apply(null, pl.bars.map(function(b){ return String(b.it.label || "").split("\n").length; }).concat([1]));
    var m = {l: 16, r: 16, t: 44, b: 18 + 30 * lines};
    // 目盛りの字の幅は軸が決まってから測るので、ここでは大きめの見積もりで決め、後で広げる
    this.y0 = m.t; this.y1 = H - m.b;
    var span = Math.max(1, this.y1 - this.y0), room = Math.min(0.3, 40 / span);
    var top = hi > 0 ? nice(hi / (1 - room)) : 0, bot = lo < 0 ? -nice(-lo / (1 - room)) : 0;
    if (cut){ bot = cut; top = cut + nice(Math.max(hi - cut, 1e-9) / (1 - room)); }
    if (top === 0 && bot === 0) top = 1;
    this.top = top; this.bot = bot;
    var st = tickStep(top - bot), dec = decs(st);
    var tickVals = [];
    if (cut) tickVals.push(cut);
    for (var v = Math.ceil(bot / st - 1e-9) * st; v <= top + 1e-9; v += st) if (!cut || v > cut + st * 0.4) tickVals.push(+v.toFixed(8));
    var tickW = Math.max.apply(null, tickVals.map(function(x){ return est(self.fmt(x, dec, ""), 24); }).concat([0]));
    if (P.ticks) m.l = 24 + tickW + (P.al ? 36 : 0);
    this.x0 = m.l; this.x1 = W - m.r;
    if (this.x1 < this.x0 || this.y1 < this.y0){
      ctx.report("size", "[diverge] the element (" + W + "×" + H + " px) is too small for the bars; give it a size, e.g. style=\"height:420px\"");
      this.x1 = Math.max(this.x0, this.x1); this.y1 = Math.max(this.y0, this.y1);
    }
    var y = this.y = function(v){ return self.y1 - (v - bot) / (top - bot) * (self.y1 - self.y0); };
    var gT = D.el("g", {}, svg);
    if (P.ticks) tickVals.forEach(function(v){
      if (Math.abs(v - (cut || 0)) > 1e-9) D.el("line", {x1: self.x0, x2: self.x1, y1: y(v).toFixed(1), y2: y(v).toFixed(1), stroke: "var(--line)", "stroke-width": 1.2, opacity: 0.8}, gT);
      var tx = D.el("text", {x: self.x0 - 10, y: (y(v) + 8).toFixed(1), "font-size": 24, "text-anchor": "end", style: "font-variant-numeric:tabular-nums"}, gT);
      tx.textContent = self.fmt(v, dec, "");
    });
    if (P.al) D.mtext(svg, 20, (this.y0 + this.y1) / 2, P.al, {"text-anchor": "middle", fill: "var(--muted)", transform: "rotate(-90 20 " + (this.y0 + this.y1) / 2 + ")"});
    var gK = D.el("g", {}, svg), gB = D.el("g", {}, svg), gL = D.el("g", {}, svg);
    var yb0 = y(cut || 0);
    D.el("line", {x1: this.x0, x2: this.x1, y1: yb0.toFixed(1), y2: yb0.toFixed(1), stroke: "var(--fg)", "stroke-width": 1.5}, svg);
    // 軸が 0 から始まらないときの切れ目の印：基線の左の端に斜めの 2 本
    if (cut) [-5, 5].forEach(function(dx){ D.el("line", {x1: (self.x0 + 8 + dx - 6).toFixed(1), y1: (yb0 + 10).toFixed(1), x2: (self.x0 + 8 + dx + 6).toFixed(1), y2: (yb0 - 10).toFixed(1), stroke: "var(--fg)", "stroke-width": 2}, svg); });
    var n = pl.bars.length, slot = Math.max(0, this.x1 - this.x0) / n, bw = Math.min(110, slot * 0.64);
    this.bw = bw;
    this.items = pl.bars.map(function(b, i){
      var c = self.x0 + slot * (i + 0.5);
      String(b.it.label || "").split("\n").forEach(function(s, j){ D.mtext(gL, c, self.y1 + 34 + j * 30, s, {"text-anchor": "middle", "font-size": 26}); });
      var col = tone(b.it.tone || (b.total ? "term" : b.v < 0 ? "emph" : "accent2"));
      var o = {b: b, c: c, col: col, rect: D.el("rect", {rx: 3, fill: col, opacity: 0}, gB),
        val: D.el("text", {"font-size": 26, "font-weight": 700, "text-anchor": "middle", fill: b.total ? "var(--fg)" : col, opacity: 0, style: "font-variant-numeric:tabular-nums"}, gL)};
      o.val.textContent = b.total ? self.fmt(b.v) : (b.v < 0 ? "−" : "+") + self.fmt(Math.abs(b.v));
      // 前の棒の端（累計）から、この棒の左の辺までの点線
      if (i > 0 && P.links) o.link = D.el("line", {stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 5", opacity: 0}, gK);
      return o;
    });
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", this.summary(/^ja\b/i.test(ctx.lang || "ja")));
    function nice(v){ var e = Math.pow(10, Math.floor(Math.log10(v))), x = v / e;
      return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function(s){ return s >= x - 1e-9; })[0] * e; }
    function tickStep(M){ var r = M / 4.5, e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e;
      return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e; }
    function decs(s){ var k = 0; while (Math.abs(s * Math.pow(10, k) - Math.round(s * Math.pow(10, k))) > 1e-6 && k < 6) k++; return k; }
    function tone(t){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(t) ? "var(--" + t + ")" : "var(--term)"; }
  }
  // 読み上げ：「前年の利益 120億円、売上の増加 +45億円、原価の増加 −30億円、今年の利益 135億円」。棒が 16 本より多ければ初めの 16 本と本数
  summary(ja){
    var self = this, P = this.props, bars = this.plan().bars;
    var head = P.al || (ja ? "増減の内訳" : "Changes");
    if (P.unit) head += ja ? "（" + P.unit + "）" : " (" + P.unit + ")";
    var gs = bars.slice(0, 16).map(function(b){
      var lab = String(b.it.label || "").replace(/\s*\n\s*/g, " ");
      return (lab ? lab + " " : "") + (b.total ? self.fmt(b.v) : (b.v < 0 ? "−" : "+") + self.fmt(Math.abs(b.v)));
    });
    if (bars.length > 16) gs.push(ja ? "…（全 " + bars.length + " 本）" : "… (" + bars.length + " bars)");
    return head + (ja ? "：" : ": ") + gs.join(ja ? "、" : "; ");
  }
  fmt(v, digits, unit){
    var dg = digits !== undefined ? digits : this.props.digits;
    var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var neg = v < 0 && +Math.abs(v).toFixed(dg) !== 0;
    return (neg ? "−" : "") + i + (s[1] ? "." + s[1] : "") + (unit !== undefined ? unit : this.props.unit);
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().bars.forEach(function(b){ if (b.step === k) d = Math.max(d, b.at + P.dur + 0.35); });
    return d;
  }
  render(k, t, ctx){
    if (!this.items) return;
    var P = this.props, D = base, self = this, y = this.y, w = this.bw;
    var preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 1;
    this.items.forEach(function(o, i){
      var b = o.b, ahead = preview && b.step > k;
      var e = b.step < k || ahead ? 1 : b.step > k ? 0 : D.prog(t, b.at, P.dur);
      // 合計は 0 から、増減は前の累計から伸びる
      var a = b.total ? self.cut : b.from, z = a + (b.to - a) * e, ya = y(a), yz = y(z);
      o.rect.setAttribute("x", (o.c - w / 2).toFixed(1)); o.rect.setAttribute("width", w.toFixed(1));
      o.rect.setAttribute("y", Math.min(ya, yz).toFixed(1)); o.rect.setAttribute("height", Math.abs(yz - ya).toFixed(1));
      o.rect.setAttribute("opacity", ahead ? PV : e > 0 ? 1 : 0);
      var vo = ahead ? PV : b.step < k ? 1 : b.step > k ? 0 : D.prog(t, b.at + P.dur, 0.35);
      // 値の数字は棒の上の端の上（減少も：下の端は次の棒へつなぐ点線と基線の側なので空けておく）。
      // 棒がすべて 0 より下にあるときだけ、下の端の下
      var ye = y(b.to), yb = y(b.total ? self.cut : b.from), under = Math.max(b.from, b.to) <= 0 && Math.min(b.from, b.to) < 0;
      var yt = under ? Math.max(ye, yb) + 32 : Math.min(ye, yb) - 12;
      o.val.setAttribute("x", o.c.toFixed(1)); o.val.setAttribute("y", yt.toFixed(1));
      o.val.setAttribute("opacity", vo.toFixed(3));
      if (o.link){
        // 点線は前の棒の右の辺からこの棒の左の辺まで、前の棒の終わりの高さ（= この棒の始まり、合計なら同じ累計）で
        var p = self.items[i - 1], lv = y(p.b.to);
        o.link.setAttribute("x1", (p.c + w / 2).toFixed(1)); o.link.setAttribute("x2", (o.c - w / 2).toFixed(1));
        o.link.setAttribute("y1", lv.toFixed(1)); o.link.setAttribute("y2", lv.toFixed(1));
        var lo = ahead ? PV : b.step < k ? 1 : b.step > k ? 0 : D.prog(t, b.at, 0.3);
        o.link.setAttribute("opacity", lo.toFixed(3));
      }
    });
  }
};
});
