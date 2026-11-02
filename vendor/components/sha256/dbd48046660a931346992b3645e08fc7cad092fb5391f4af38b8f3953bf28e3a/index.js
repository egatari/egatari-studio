// m-pie：円グラフとドーナツグラフ。切れの名前と値（と割合）は、大きい切れなら中に、小さい切れなら外に引き出し線で書く
// <m-pie unit="万円" digits="1" show="both" style="height:420px"><script type="application/json">
//   {"slices": [{"label": "食費", "value": 7.2}, {"label": "住まい", "value": 8.5}, {"label": "その他", "value": 2.1, "tone": "muted"}]}
// （JSON の終わり）</m-pie>
// 段階：既定は全部を段階 1 で（全体と内訳は一度に見せる）。per-step="1" で 1 切れずつ（口述原稿が 1 切れずつ話すときだけ）、切れの step で直接
// 切れは 12 時の位置から時計回りに、書いた順に並べる。割合は足して 100 になるように丸める（最大剰余法）
// donut="0.55" でドーナツ（内側の半径の割合）。中の字は JSON の center（{total} は合計に置き換わる）
// 見せ方（docs/conventions.md §1）：fade（フェードして少し上がりながら現れる、既定）・sweep（12 時の位置から時計回りに掃くように現れる）・
// grow（中心から少し小さい大きさで現れて元の大きさに戻る）。段階の数・長さ・最後の中身は同じ
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 負の値と、字が収まらないことは ctx.report で知らせる（1.x の console.warn の代わり）
egatariParts.define({name: "pie", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-pie"}, function(deps){
"use strict";
var base = deps.base;
return class extends base.MotionElement {
  static partName = "pie";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "sweep", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["slices"], properties: {
      slices: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["value"], properties: {
        label: {type: "string"}, value: {type: "number"}, tone: {type: "string"}, step: {type: "integer"}, place: {enum: ["auto", "in", "out"]}}}},
      center: {type: "string"}}},
    example: {slices: [{label: "食費", value: 7.2}, {label: "住まい", value: 8.5}, {label: "その他", value: 2.1, tone: "muted"}]},
    note: {en: "the slices go in \"slices\" (not \"data\" or \"groups\"); value is a number, not a percentage string; the slices are drawn clockwise from 12 o'clock in the written order",
           ja: "切れは \"slices\" に書く（\"data\" や \"groups\" ではない）。value は数（\"26%\" のような字ではない）。12 時の位置から時計回りに、書いた順に並ぶ"},
  };
  static props = {
    donut:      {type: "number", default: 0, doc: "ドーナツの内側の半径の割合（0 = 円グラフ。0.5〜0.6 がよい）"},
    unit:       {type: "string", default: "", doc: "値の単位（数字の後ろに付ける。万円、人、% など）"},
    digits:     {type: "number", default: 0, doc: "値の小数桁"},
    "pct-digits": {type: "number", default: 0, doc: "割合の小数桁"},
    show:       {type: "string", default: "pct", doc: "名前の下に書くもの：pct（割合）・value（値）・both（値と割合）・none"},
    "per-step": {type: "number", default: 0, doc: "1 段階に出す切れの数（0 = 全部を段階 1 で）"},
    dur:        {type: "number", default: 1.0, doc: "1 段階の動きの秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var per = this.props["per-step"];
    return (this._plan = ((this.data || {}).slices || []).map(function(s, i){
      return {s: s, i: i, step: s.step !== undefined ? s.step : per > 0 ? Math.floor(i / per) + 1 : 1};
    }));
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), d = this.data || {};
    this.variant = base.variant(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight, TAU = Math.PI * 2;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var est = function(s, size){ return [...String(s).replace(/[*_^]/g, "")].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
    var total = pl.reduce(function(a, o){ return a + Math.max(0, +o.s.value); }, 0);
    if (!(total > 0)) throw new Error("slices: the values add up to 0 (write positive numbers)");
    pl.forEach(function(o){ if (+o.s.value < 0) ctx.report("data", "[pie] the slice \"" + (o.s.label || o.i) + "\" has a negative value (drawn as 0)"); });
    // 割合：足して 100 になるように丸める（最大剰余法）
    var pd = P["pct-digits"], sc = Math.pow(10, pd), raw = pl.map(function(o){ return Math.max(0, +o.s.value) / total * 100 * sc; });
    var fl = raw.map(Math.floor), left = Math.round(100 * sc) - fl.reduce(function(a, b){ return a + b; }, 0);
    raw.map(function(v, i){ return [v - fl[i], i]; }).sort(function(a, b){ return b[0] - a[0] || a[1] - b[1]; }).slice(0, Math.max(0, left)).forEach(function(x){ fl[x[1]]++; });
    var show = /^(pct|value|both|none)$/.test(P.show) ? P.show : "pct";
    // 角度（12 時の位置から時計回り）と字
    var acc = 0;
    var sl = this.slices = pl.map(function(o, i){
      var v = Math.max(0, +o.s.value), a0 = acc / total * TAU; acc += v;
      var a1 = acc / total * TAU, pct = (fl[i] / sc).toFixed(pd) + "%", val = self.fmt(v);
      var sub = show === "pct" ? pct : show === "value" ? val : show === "both" ? val + "（" + pct + "）" : "";
      var lines = [];
      if (o.s.label) lines.push({t: o.s.label, size: 26, bold: true});
      if (sub) lines.push({t: sub, size: 24, bold: false});
      // 中に入れるときの別の形：値と割合を 2 行に分けて幅を狭くする
      var alt = show === "both" ? lines.slice(0, lines.length - 1).concat([{t: val, size: 24}, {t: pct, size: 24}]) : null;
      // 既定の色：--series-1..3、次に同じ 3 色を薄く（0.5）、7 切れ目から --series-4（灰色は「その他」のために残す）、そのあとは繰り返し
      var j6 = i % 7, tone = /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(o.s.tone || "") ? o.s.tone : j6 === 6 ? "series-4" : "series-" + (j6 % 3 + 1);
      return {o: o, i: i, a0: a0, a1: a1, mid: (a0 + a1) / 2, lines: lines, col: "var(--" + tone + ")", light: !o.s.tone && j6 >= 3 && j6 < 6,
        forms: [lines].concat(alt ? [alt] : []).map(function(ls){ return {lines: ls, w: Math.max.apply(null, ls.map(function(l){ return est(l.t, l.size); }).concat([0])), h: ls.length * 30}; })};
    });
    var ratio = Math.max(0, Math.min(0.85, P.donut || 0));
    // 中に収まるか：字の箱の 4 隅が、その切れの扇形（内側と外側の半径、両端の角度）の中にあるか
    var pt = function(cx, cy, r, a){ return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    var fits1 = function(s, R){
      s.rm = ratio ? (1 + ratio) / 2 : 0.6;
      if (!s.lines.length || s.o.s.place === "in") return true;
      if (s.o.s.place === "out") return false;
      // 字の中心の半径：ドーナツは輪の真ん中、円グラフは 0.6R → 0.5R → 0.7R の順に試す
      var ri = R * ratio, cands = ratio ? [(ri + R) / 2] : [R * 0.6, R * 0.5, R * 0.7];
      for (var n = 0; n < cands.length; n++){
        var c = pt(0, 0, cands[n], s.mid), ok = true;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function(q){
          var x = c[0] + q[0] * (s.w / 2 + 4), y = c[1] + q[1] * (s.h / 2 + 2), r = Math.hypot(x, y), a = Math.atan2(x, -y);
          if (a < 0) a += TAU;
          if (s.a1 - s.a0 < TAU - 1e-6 && !(a >= s.a0 + 0.02 && a <= s.a1 - 0.02)) ok = false;
          if (r > R - 6 || r < ri + 6) ok = false;
        });
        if (ok){ s.rm = cands[n] / R; return true; }
      }
      return false;
    };
    // 形を 1 つずつ試す。どれも入らなければ外に書く形（最初の形）に戻す
    var fits = function(s, R){
      for (var f = 0; f < s.forms.length; f++){ use(s, f); if (fits1(s, R)) return true; }
      use(s, 0);
      return false;
    };
    function use(s, f){ s.lines = s.forms[f].lines; s.w = s.forms[f].w; s.h = s.forms[f].h; }
    sl.forEach(function(s){ use(s, 0); });
    // 半径：外の字の幅の分だけ左右をあける。中に収まる切れが増えれば半径を見直す（2 回）
    var pad = 10, gap = 44, radius = function(outs){
      var wl = 0, wr = 0;
      outs.forEach(function(s){ if (Math.sin(s.mid) >= 0) wr = Math.max(wr, s.w); else wl = Math.max(wl, s.w); });
      var side = Math.max(wl, wr);
      return Math.max(40, Math.min((H / 2 - pad) * (outs.length ? 0.86 : 1), W / 2 - pad - (side ? side + gap : 0)));
    };
    var R = radius(sl.filter(function(s){ return s.lines.length; }));
    for (var pass = 0; pass < 2; pass++){
      sl.forEach(function(s){ s.inside = fits(s, R); });
      R = radius(sl.filter(function(s){ return !s.inside; }));
    }
    sl.forEach(function(s){ if (!s.inside && s.o.s.place !== "out" && fits(s, R)) s.inside = true; });
    // 字が片側だけなら、字と円をひとまとまりとして真ん中に寄せる
    var wl = 0, wr = 0;
    sl.forEach(function(s){ if (!s.inside && s.lines.length){ if (Math.sin(s.mid) >= 0) wr = Math.max(wr, s.w + gap); else wl = Math.max(wl, s.w + gap); } });
    var cx = W / 2 + (wl - wr) / 2, cy = H / 2, ri = R * ratio;
    this.R = R; this.ri = ri; this.cx = cx; this.cy = cy;
    // 1 切れずつ出すときは、全体の輪郭を初めから薄く見せる（どれだけのうちの 1 切れかが分かるように）
    if (pl.some(function(o){ return o.step > 1; })){
      D.el("circle", {cx: cx, cy: cy, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 2}, svg);
      if (ri) D.el("circle", {cx: cx, cy: cy, r: ri, fill: "none", stroke: "var(--line)", "stroke-width": 2}, svg);
    }
    var gS = D.el("g", {}, svg), gL = D.el("g", {}, svg);
    // 外の字：左右の列に置き、縦に重ならないように並べ直す
    [1, -1].forEach(function(side){
      var outs = sl.filter(function(s){ return !s.inside && s.lines.length && (Math.sin(s.mid) >= 0 ? 1 : -1) === side; });
      outs.forEach(function(s){ s.yc = cy - (R + 18) * Math.cos(s.mid); });
      outs.sort(function(a, b){ return a.yc - b.yc; });
      // 上から押し下げ、下からはみ出す分を押し上げる（字の箱の間は 8 px）
      for (var j = 0; j < outs.length; j++){
        var mn = j ? outs[j - 1].yc + (outs[j - 1].h + outs[j].h) / 2 + 8 : outs[0].h / 2 + 2;
        if (outs[j].yc < mn) outs[j].yc = mn;
      }
      for (var q = outs.length - 1; q >= 0; q--){
        var mx = q === outs.length - 1 ? H - 2 - outs[q].h / 2 : outs[q + 1].yc - (outs[q + 1].h + outs[q].h) / 2 - 8;
        if (outs[q].yc > mx) outs[q].yc = mx;
      }
      if (outs.length && outs[0].yc - outs[0].h / 2 < 0) ctx.report("size", "[pie] the labels outside do not fit the height (make the element taller or put fewer slices)");
      var colX = cx + side * (R + gap - 8);
      outs.forEach(function(s){
        // 引き出し線：切れの外の縁から、円の外側を回って字の列へ
        var p1 = pt(cx, cy, R + 4, s.mid), dy = s.yc - cy, rr = R + 14;
        var qx = cx + side * Math.max(Math.abs((R + 16) * Math.sin(s.mid)), Math.sqrt(Math.max(0, rr * rr - dy * dy)));
        s.leader = D.el("path", {d: "M" + p1[0].toFixed(1) + "," + p1[1].toFixed(1) + "L" + qx.toFixed(1) + "," + s.yc.toFixed(1) + "L" + (colX - side * 6).toFixed(1) + "," + s.yc.toFixed(1),
          fill: "none", stroke: "var(--muted)", "stroke-width": 1.5}, gL);
        s.tx = colX; s.anchor = side > 0 ? "start" : "end";
        if (side > 0 ? colX + s.w > W + 1 : colX - s.w < -1) ctx.report("size", "[pie] the label \"" + s.lines[0].t + "\" is wider than the space beside the pie");
      });
    });
    sl.forEach(function(s){
      s.path = D.el("path", {d: "", fill: s.col, "fill-opacity": s.light ? 0.5 : 1, stroke: "var(--bg)", "stroke-width": 2, "stroke-linejoin": "round"}, gS);
      if (!s.lines.length) return;
      var g = s.g = D.el("g", {opacity: 0}, gL), x, y0;
      if (s.inside){
        var c = pt(cx, cy, s.rm * R, s.mid);
        x = c[0]; y0 = c[1] - s.h / 2;
      } else { x = s.tx; y0 = s.yc - s.h / 2; }
      // 中の字は切れの色の上なので背景の色（濃い色の切れ）か本文の色（薄い切れ）
      var fill = s.inside ? (s.light ? "var(--fg)" : "var(--bg)") : "var(--fg)";
      s.lines.forEach(function(l, j){
        D.mtext(g, x, y0 + j * 30 + 24, l.t, {"text-anchor": s.inside ? "middle" : s.anchor, "font-size": l.size, "font-weight": l.bold ? 700 : 400, fill: fill});
      });
    });
    // ドーナツの中の字（{total} は合計）
    this.center = null;
    if (ri && d.center){
      var cl = String(d.center).replace(/\{total\}/g, this.fmt(total)).split("\n"), size = 26;
      var cw = Math.max.apply(null, cl.map(function(t){ return est(t, size); }));
      if (cw > ri * 1.8){ size = 24; cw = cw * 24 / 26; }
      if (cw > ri * 1.8) ctx.report("size", "[pie] the center text is wider than the hole (make donut larger or the text shorter)");
      var cg = this.center = D.el("g", {opacity: 0}, gL);
      cl.forEach(function(t, j){ D.mtext(cg, cx, cy - (cl.length - 1) * 16 + j * 32 + 9, t, {"text-anchor": "middle", "font-size": size, "font-weight": j === 0 ? 700 : 400}); });
    }
  }
  // 数の書き方：3 桁ごとのカンマ、小数桁、単位（m-bars と同じ）
  fmt(v){
    var s = Math.abs(v).toFixed(this.props.digits).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + i + (s[1] ? "." + s[1] : "") + this.props.unit;
  }
  wedge(a0, a1, r0, r1){
    var cx = this.cx, cy = this.cy, TAU = Math.PI * 2;
    if (a1 - a0 <= 1e-6 || r1 <= 0) return "";
    var p = function(r, a){ return (cx + r * Math.sin(a)).toFixed(2) + "," + (cy - r * Math.cos(a)).toFixed(2); };
    if (a1 - a0 >= TAU - 1e-6){
      // 全周：2 つの半円で描く
      var full = "M" + p(r1, 0) + "A" + r1 + "," + r1 + " 0 1,1 " + p(r1, Math.PI) + "A" + r1 + "," + r1 + " 0 1,1 " + p(r1, 0) + "Z";
      return r0 > 0 ? full + "M" + p(r0, 0) + "A" + r0 + "," + r0 + " 0 1,0 " + p(r0, Math.PI) + "A" + r0 + "," + r0 + " 0 1,0 " + p(r0, 0) + "Z" : full;
    }
    var big = a1 - a0 > Math.PI ? 1 : 0;
    var s = "M" + p(r1, a0) + "A" + r1 + "," + r1 + " 0 " + big + ",1 " + p(r1, a1);
    s += r0 > 0 ? "L" + p(r0, a1) + "A" + r0 + "," + r0 + " 0 " + big + ",0 " + p(r0, a0) + "Z" : "L" + cx.toFixed(2) + "," + cy.toFixed(2) + "Z";
    return s;
  }
  duration(k){
    return this.plan().some(function(o){ return o.step === k; }) ? this.props.dur : 0;
  }
  render(k, t, ctx){
    var P = this.props, D = base, self = this, vr = this.variant, dur = P.dur, span = dur * 0.6, lecture = !!ctx.preview, FAINT = 0.45;
    if (lecture) FAINT = base.previewOpacity(this);   // 先の段階の薄さ：テーマの --preview-opacity（ないときは 0.45）
    var TAU = Math.PI * 2, R = this.R, ri = this.ri;
    // 同じ段階の切れが占める角度の範囲（sweep はこの範囲を掃く）
    var rng = {};
    this.slices.forEach(function(s){ var st = s.o.step, q = rng[st] || (rng[st] = [Infinity, -Infinity]); q[0] = Math.min(q[0], s.a0); q[1] = Math.max(q[1], s.a1); });
    var first = Infinity;
    this.slices.forEach(function(s){
      var st = s.o.step, tt = st < k ? Infinity : st > k ? -1 : t, faint = lecture && st > k;
      first = Math.min(first, st);
      var a0 = s.a0, a1 = s.a1, r0 = ri, r1 = R, op = 1, dy = 0, lo;
      if (faint){ op = FAINT; lo = FAINT; }
      else if (tt < 0){ op = 0; lo = 0; }
      else if (vr === "sweep"){
        // 12 時の位置（1 切れずつなら、その段階の最初の切れの端）から時計回りに掃く
        var q = rng[st], e = D.prog(tt, 0, span), edge = q[0] + (q[1] - q[0]) * e;
        a1 = Math.min(a1, edge);
        lo = D.prog(tt, span * (s.a1 - q[0]) / Math.max(1e-6, q[1] - q[0]) * 0.9, dur - span);
      } else if (vr === "grow"){
        // 中心から：外側の縁が 12 px 内側から元の大きさへ（fade の上がる距離と同じ）
        var g = D.prog(tt, 0, span), f = (R - 12 * (1 - g)) / R;
        r0 = ri * f; r1 = R * f; op = Math.min(1, g * 2.5 + (g > 0 ? 0.2 : 0));
        lo = D.prog(tt, span, dur - span);
      } else {
        var e2 = D.prog(tt, 0, span);
        op = e2; dy = (1 - e2) * 12;
        lo = D.prog(tt, span, dur - span);
      }
      s.path.setAttribute("d", op > 0 ? self.wedge(a0, a1, r0, r1) : "");
      s.path.setAttribute("opacity", op.toFixed(3));
      s.path.setAttribute("transform", dy ? "translate(0 " + dy.toFixed(2) + ")" : "");
      if (s.g) s.g.setAttribute("opacity", lo.toFixed(3));
      if (s.leader) s.leader.setAttribute("opacity", lo.toFixed(3));
    });
    if (this.center){
      var c = first < k ? 1 : first > k ? (lecture ? FAINT : 0) : D.prog(t, span, dur - span);
      this.center.setAttribute("opacity", c.toFixed(3));
    }
  }
};
});
