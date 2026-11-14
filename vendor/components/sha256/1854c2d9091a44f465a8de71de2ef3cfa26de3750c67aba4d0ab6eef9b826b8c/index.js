// m-checklist：確かめる一覧。項目を並べ、ステップごとに 1 つずつ印（✓）を描く
// <m-checklist style="height:420px"><script type="application/json">
//   {"items": [{"label": "名札を付けた"}, {"label": "手を洗った", "note": "30 秒"}, {"label": "指輪を外した", "mark": "cross"}]}
// （JSON の終わり）</m-checklist>
// 印はスライドの中身（作者が決めた ✓ と ×）で、見ている人の操作ではない。押しても変わらず、何も保存しない
// reveal="false"（既定）：項目はステップ 0 から全部見え、ステップごとに次の項目に印が付く。reveal="true"：項目もそのステップで現れる
egatariParts.define({name: "checklist", version: "2.0.0", requires: {base: "1.2.0"}, element: "m-checklist"}, function(deps){
"use strict";
var base = deps.base;
return class extends base.MotionElement {
  static partName = "checklist";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["items"], properties: {
      items: {type: "array", minItems: 1, items: {type: "object", required: ["label"], properties: {
        label: {type: "string"}, note: {type: "string"}, mark: {enum: ["check", "cross", "none"]}, step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {items: [{label: "名札を付けた"}, {label: "手を洗った", note: "30 秒"}]},
  };
  static props = {
    reveal:     {type: "bool", default: false, doc: "項目もそのステップで現れる（false なら項目はステップ 0 から全部見え、印だけがステップごとに付く）"},
    "per-step": {type: "number", default: 1, doc: "1 ステップに印を付ける項目の数（0 = 全部をステップ 1 で）"},
    dur:        {type: "number", default: 0.6, doc: "1 つの印を描く秒数"},
    stagger:    {type: "number", default: 0.25, doc: "同じステップの印の出だしのずれ（秒）"},
    size:       {type: "number", default: 32, doc: "項目の字の大きさ（px、24 以上）。メモはその 0.8 倍（24 以上）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var m = 0;
    this.plan().forEach(function(p){ m = Math.max(m, p.step); });
    return m;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, per = P["per-step"], seen = {};
    return (this._plan = (d.items || []).map(function(it, i){
      var step = it.step !== undefined ? it.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {it: it, step: step, at: it.at !== undefined ? it.at : +((j - 1) * P.stagger).toFixed(3), mark: it.mark || "check"};
    }));
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan();
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!pl.length){ ctx.report("data", "[checklist] items is empty"); return; }
    var fs = Math.max(24, P.size), ns = Math.max(24, Math.round(fs * 0.8));
    var est = function(s, size){ return D.textWidth(s, size, {font: self, mark: true}); };
    // 行の高さ：字の行（項目と、あればメモ）に上下の余白。枠に入らなければ詰め、それでも入らなければ知らせる
    var lineH = function(p){ return String(p.it.label).split("\n").length * fs * 1.3 + (p.it.note ? ns * 1.35 : 0); };
    var need = pl.reduce(function(a, p){ return a + lineH(p); }, 0), gap = Math.max(8, Math.min(28, (H - need) / Math.max(1, pl.length)));
    if (need + 8 * pl.length > H) ctx.report("size", "[checklist] " + pl.length + " items need about " + Math.round(need + 8 * pl.length) + " px of height; the element is " + H + " px");
    var box = Math.round(fs * 1.15), x0 = 8, tx = x0 + box + 24, y = Math.max(0, (H - need - gap * pl.length) / 2);
    var gB = D.el("g", {}, svg), gM = D.el("g", {}, svg), gT = D.el("g", {}, svg);
    this.rows = pl.map(function(p){
      var h = lineH(p) + gap, cy = y + gap / 2 + fs * 0.65;
      var g = D.el("g", {}, gT);
      var r = {p: p, g: g, box: D.el("rect", {x: x0, y: (cy - box / 2).toFixed(1), width: box, height: box, rx: 6, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2.5}, gB)};
      String(p.it.label).split("\n").forEach(function(s, j){
        D.mtext(g, tx, (cy + fs * 0.36 + j * fs * 1.3).toFixed(1), s, {"font-size": fs});
        if (tx + est(s, fs) > W + 1) ctx.report("size", "[checklist] \"" + s + "\" is wider than the element; break it with \\n or make the element wider");
      });
      if (p.it.note) D.mtext(g, tx, (cy + fs * 0.36 + (String(p.it.label).split("\n").length - 1) * fs * 1.3 + ns * 1.35).toFixed(1), p.it.note, {"font-size": ns, fill: "var(--muted)"});
      // 印：✓ は --term、× は --emph。描く長さで出す（stroke-dasharray）
      var s = box, bx = x0, by = cy - box / 2;
      if (p.mark === "check") r.mk = [D.el("path", {d: "M" + (bx + s * 0.2).toFixed(1) + "," + (by + s * 0.52).toFixed(1) + "L" + (bx + s * 0.42).toFixed(1) + "," + (by + s * 0.76).toFixed(1) + "L" + (bx + s * 0.84).toFixed(1) + "," + (by + s * 0.22).toFixed(1), fill: "none", stroke: "var(--term)", "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round"}, gM)];
      else if (p.mark === "cross") r.mk = [
        D.el("path", {d: "M" + (bx + s * 0.24).toFixed(1) + "," + (by + s * 0.24).toFixed(1) + "L" + (bx + s * 0.76).toFixed(1) + "," + (by + s * 0.76).toFixed(1), fill: "none", stroke: "var(--emph)", "stroke-width": 5, "stroke-linecap": "round"}, gM),
        D.el("path", {d: "M" + (bx + s * 0.76).toFixed(1) + "," + (by + s * 0.24).toFixed(1) + "L" + (bx + s * 0.24).toFixed(1) + "," + (by + s * 0.76).toFixed(1), fill: "none", stroke: "var(--emph)", "stroke-width": 5, "stroke-linecap": "round"}, gM)];
      else r.mk = [];
      r.len = r.mk.map(function(el){ return p.mark === "check" ? s * (Math.hypot(0.22, 0.24) + Math.hypot(0.42, 0.54)) : s * Math.hypot(0.52, 0.52); });
      r.mk.forEach(function(el, i){ el.setAttribute("stroke-dasharray", r.len[i].toFixed(1) + " " + r.len[i].toFixed(1)); });
      y += h;
      return r;
    });
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria){
      var ja = /^ja\b/i.test(ctx.lang || "ja");
      var word = {check: ja ? "済" : "done", cross: ja ? "×" : "no", none: ja ? "未" : "open"};
      this.setAttribute("aria-label", (ja ? "確かめる一覧：" : "Checklist: ") + pl.map(function(p){
        return String(p.it.label).replace(/\s*\n\s*/g, " ") + (ja ? "（" + word[p.mark] + "）" : " (" + word[p.mark] + ")");
      }).join(ja ? "、" : "; "));
    }
  }
  duration(k){
    var P = this.props, d = 0;
    this.plan().forEach(function(p){ if (p.step === k) d = Math.max(d, p.at + (P.reveal ? 0.35 : 0) + P.dur); });
    return d;
  }
  render(k, t, ctx){
    if (!this.rows) return;
    var P = this.props, D = base, preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 1;
    this.rows.forEach(function(r){
      var p = r.p, ahead = preview && p.step > k;
      // 項目：reveal なら、そのステップで現れる（先のステップは薄く）
      var show = !P.reveal ? 1 : ahead ? PV : p.step < k ? 1 : p.step > k ? 0 : D.prog(t, p.at, 0.35);
      r.g.setAttribute("opacity", show.toFixed(3)); r.box.setAttribute("opacity", show.toFixed(3));
      // 印：現れてから描く
      var e = ahead ? 1 : p.step < k ? 1 : p.step > k ? 0 : D.prog(t, p.at + (P.reveal ? 0.35 : 0), P.dur);
      r.mk.forEach(function(el, i){
        var n = r.mk.length, ei = Math.max(0, Math.min(1, e * n - i));
        el.setAttribute("stroke-dashoffset", (r.len[i] * (1 - ei)).toFixed(1));
        el.setAttribute("opacity", ahead ? PV : ei > 0 ? 1 : 0);
      });
    });
  }
};
});
