// m-callout：画面の手順。画面の画像の上に番号の丸を置き、引き出し線で横の説明につなぐ。ステップごとに 1 つずつ
// <m-callout style="height:460px">
//   <img src="screens/apply.png" alt="申請の画面" width="1280" height="800">
//   <script type="application/json">{"callouts": [{"x": 0.12, "y": 0.08, "text": "メニューを開く"},
//     {"x": 0.70, "y": 0.62, "text": "「送る」を押す", "box": [0.62, 0.57, 0.16, 0.1]}]}</script>
// （JSON の終わり）</m-callout>
// 画像は子の <img>（src・alt・width・height）。組み立てが作業フォルダの画像を教材に埋め込む。alt がなければ data で知らせる。
// width と height は画像の縦横比（px の数。なければ data で知らせて 16:10 で描く）。x・y・box は画像の幅と高さに対する割合（0〜1）
// 説明は画像の横（side：right（既定）・left・both）に、丸と同じ上下の順に並べ、重ならないようにずらす。
// 引き出し線は丸から画像の端まで水平に、そこから説明まで斜めにつなぐ。説明の順が丸の上下の順と同じなので、線どうしは交わらない
// ステップ k で k 番目の丸・線・説明が出る（今の丸は --emph、前の丸は --term）
egatariParts.define({name: "callout", version: "2.0.0", requires: {base: "1.2.0"}, element: "m-callout"}, function(deps){
"use strict";
var base = deps.base;
var BIG = 1048576;   // 埋め込んだ画像がこれ（1 MiB）より大きければ size で知らせる
function imgOf(el){ return [].filter.call(el.children, function(x){ return x.localName === "img"; })[0] || null; }
return class extends base.MotionElement {
  static partName = "callout";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["callouts"], properties: {
      callouts: {type: "array", minItems: 1, items: {type: "object", required: ["x", "y", "text"], properties: {
        x: {type: "number"}, y: {type: "number"}, text: {type: "string"}, box: {type: "array", items: {type: "number"}, minItems: 4, maxItems: 4}, step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {callouts: [{x: 0.12, y: 0.08, text: "メニューを開く"}, {x: 0.7, y: 0.62, text: "「送る」を押す"}]},
  };
  static props = {
    side:       {type: "string", default: "right", doc: "説明を置く側：right・left・both（both は画像の左半分の丸を左に、右半分の丸を右に）"},
    "label-width": {type: "number", default: 0.32, doc: "説明の列の幅（要素の幅に対する割合。both なら片側の幅）"},
    "per-step": {type: "number", default: 1, doc: "1 ステップに出す説明の数（0 = 全部をステップ 1 で）"},
    dur:        {type: "number", default: 0.7, doc: "1 つの説明が出る秒数（丸、線、説明の順）"},
    size:       {type: "number", default: 28, doc: "説明の字の大きさ（px、24 以上）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().forEach(function(p){ m = Math.max(m, p.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, per = this.props["per-step"], seen = {};
    return (this._plan = (d.callouts || []).map(function(c, i){
      var step = c.step !== undefined ? c.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {c: c, n: i + 1, step: step, at: c.at !== undefined ? c.at : +((j - 1) * 0.2).toFixed(3)};
    }));
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight, img = imgOf(this);
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!img){ ctx.report("data", "[callout] put the screenshot in as a child <img src alt width height>"); return; }
    img.style.display = "none";
    var src = img.getAttribute("src") || "", alt = (img.getAttribute("alt") || "").trim();
    if (!alt) ctx.report("data", "[callout] the <img> needs alt: say what the screen is (it is read aloud and shown when the image cannot be)");
    // 埋め込んだ画像（data:）の大きさ。base64 なら 4 字で 3 バイト。知らせの終わりの [image bytes=N] は、Studio の教材全体の画像の
    // 確かめ（backlog #207）が同じ画像を 2 度知らせないための目印（ctx.report には文しか渡せない）
    var m = /^data:[^,]*?(;base64)?,/i.exec(src);
    if (m){
      var bytes = m[1] ? Math.floor((src.length - m[0].length) * 3 / 4) : src.length - m[0].length;
      if (bytes > BIG) ctx.report("size", "[callout] the screenshot is " + (bytes / BIG).toFixed(1) + " MiB inside the lesson file; crop it to the part that matters, or save it smaller (JPEG or WebP, about 1600 px wide) [image bytes=" + bytes + "]");
    }
    var iw = +img.getAttribute("width"), ih = +img.getAttribute("height");
    if (!(iw > 0 && ih > 0)){ ctx.report("data", "[callout] the <img> needs width and height (the screenshot's pixel size), so the callouts land in the right place"); iw = 16; ih = 10; }
    var fs = Math.max(24, P.size), lh = fs * 1.3;
    var est = function(s){ return D.textWidth(s, fs, {font: self, mark: true}); };
    var both = P.side === "both", left = P.side === "left";
    var lw = Math.max(200, W * Math.min(0.45, Math.max(0.15, P["label-width"]))), gut = 48;
    // 画像の場所：説明の列とすきま（gut）を除いた範囲に、縦横比を保って入れる
    var ax0 = both ? lw + gut : left ? lw + gut : 0, ax1 = both ? W - lw - gut : left ? W : W - lw - gut;
    var aw = Math.max(0, ax1 - ax0), sc = Math.min(aw / iw, H / ih), dw = iw * sc, dh = ih * sc;
    var ix = both ? (W - dw) / 2 : left ? W - dw : 0, iy = (H - dh) / 2;
    var gI = D.el("g", {}, svg);
    D.el("image", {href: src, x: ix.toFixed(1), y: iy.toFixed(1), width: dw.toFixed(1), height: dh.toFixed(1), preserveAspectRatio: "none"}, gI);
    D.el("rect", {x: ix.toFixed(1), y: iy.toFixed(1), width: dw.toFixed(1), height: dh.toFixed(1), fill: "none", stroke: "var(--line)", "stroke-width": 2}, gI);
    var gB = D.el("g", {}, svg), gK = D.el("g", {}, svg), gN = D.el("g", {}, svg), gL = D.el("g", {}, svg);
    // 説明の位置：側ごとに丸の上下の順に並べ、丸の高さを目安に置いて、重なれば下へ、はみ出せば上へずらす
    var items = pl.map(function(p){
      var c = p.c, tx = ix + Math.max(0, Math.min(1, c.x)) * dw, ty = iy + Math.max(0, Math.min(1, c.y)) * dh;
      var lines = String(c.text).split("\n"), h = lines.length * lh + 12;
      var onLeft = both ? c.x < 0.5 : left;
      lines.forEach(function(s){ if (est(s) > lw - 16) ctx.report("size", "[callout] \"" + s + "\" is wider than the label column; break it with \\n or widen label-width"); });
      return {p: p, tx: tx, ty: ty, lines: lines, h: h, left: onLeft};
    });
    [true, false].forEach(function(sideLeft){
      var col = items.filter(function(o){ return o.left === sideLeft; }).sort(function(a, b){ return a.ty - b.ty || a.tx - b.tx; });
      var y = 0;
      col.forEach(function(o){ o.ly = Math.max(y, o.ty - o.h / 2); y = o.ly + o.h + 12; });
      var over = y - 12 - H;
      for (var i = col.length - 1; i >= 0 && over > 0; i--){
        var lim = i === 0 ? 0 : col[i - 1].ly + col[i - 1].h + 12, room = col[i].ly - lim;
        var mv = Math.min(over, room);
        for (var j = i; j < col.length; j++) col[j].ly -= mv;
        over -= mv;
      }
      if (over > 0) ctx.report("size", "[callout] the labels on the " + (sideLeft ? "left" : "right") + " need " + Math.round(y - 12) + " px of height; the element is " + H + " px");
      // 線の折れ目：画像の端の外。丸の上下の順と説明の順が同じなので、折れ目から説明までの線は交わらない
      col.forEach(function(o){ o.gx = sideLeft ? ix - 14 : ix + dw + 14; o.lx = sideLeft ? lw : W - lw; });
    });
    this.items = items.map(function(o){
      var c = o.p.c, r = 20;
      if (Array.isArray(c.box) && c.box.length === 4)
        o.box = D.el("rect", {x: (ix + c.box[0] * dw).toFixed(1), y: (iy + c.box[1] * dh).toFixed(1), width: (c.box[2] * dw).toFixed(1), height: (c.box[3] * dh).toFixed(1), rx: 6, fill: "none", stroke: "var(--emph)", "stroke-width": 4}, gB);
      o.line = D.el("path", {d: "M" + o.tx.toFixed(1) + "," + o.ty.toFixed(1) + "H" + o.gx.toFixed(1) + "L" + o.lx.toFixed(1) + "," + (o.ly + o.h / 2).toFixed(1),
        fill: "none", stroke: "var(--fg)", "stroke-width": 2.5, "stroke-linejoin": "round"}, gK);
      o.len = Math.abs(o.gx - o.tx) + Math.hypot(o.lx - o.gx, o.ly + o.h / 2 - o.ty);
      o.line.setAttribute("stroke-dasharray", o.len.toFixed(1) + " " + o.len.toFixed(1));
      o.dot = D.el("circle", {cx: o.tx.toFixed(1), cy: o.ty.toFixed(1), r: r, stroke: "var(--bg)", "stroke-width": 3}, gN);
      o.num = D.el("text", {x: o.tx.toFixed(1), y: (o.ty + 8.5).toFixed(1), "font-size": 24, "font-weight": 700, "text-anchor": "middle", fill: "var(--bg)"}, gN);
      o.num.textContent = String(o.p.n);
      // 説明：番号と文。左の列は右寄せ（線の側）
      var g = D.el("g", {}, gL), ax = o.left ? lw - 8 : W - lw + 8;
      o.lines.forEach(function(s, j){ D.mtext(g, ax, (o.ly + 6 + fs * 0.95 + j * lh).toFixed(1), (j === 0 ? o.p.n + ". " : "") + s, {"font-size": fs, "text-anchor": o.left ? "end" : "start"}); });
      o.label = g;
      return o;
    });
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria){
      var ja = /^ja\b/i.test(ctx.lang || "ja");
      this.setAttribute("aria-label", (alt || (ja ? "画面" : "Screen")) + (ja ? "：" : ": ") + pl.map(function(p){ return p.n + ". " + String(p.c.text).replace(/\s*\n\s*/g, " "); }).join(ja ? "、" : "; "));
    }
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().forEach(function(p){ if (p.step === k) d = Math.max(d, p.at + P.dur); });
    return d;
  }
  render(k, t, ctx){
    if (!this.items) return;
    var P = this.props, D = base, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 1;
    this.items.forEach(function(o){
      var p = o.p, ahead = preview && p.step > k, now = p.step === k;
      var e = ahead || p.step < k ? 1 : p.step > k ? 0 : D.prog(t, p.at, P.dur);
      // 丸（最初の 3 割）→ 線（次の 4 割）→ 説明（残り）
      var a = Math.min(1, e / 0.3), b = Math.max(0, Math.min(1, (e - 0.3) / 0.4)), c = Math.max(0, Math.min(1, (e - 0.7) / 0.3));
      var op = function(x){ return ahead ? PV : x > 0 ? x : 0; };
      o.dot.setAttribute("fill", now ? "var(--emph)" : "var(--term)");
      o.dot.setAttribute("opacity", op(a).toFixed(3)); o.num.setAttribute("opacity", op(a).toFixed(3));
      if (o.box){ o.box.setAttribute("opacity", (ahead ? PV : now ? a : 0).toFixed(3)); }
      o.line.setAttribute("stroke-dashoffset", (o.len * (1 - (ahead ? 1 : b))).toFixed(1));
      o.line.setAttribute("opacity", (ahead ? PV : b > 0 ? 1 : 0).toFixed(3));
      o.label.setAttribute("opacity", op(c).toFixed(3));
    });
  }
};
});
