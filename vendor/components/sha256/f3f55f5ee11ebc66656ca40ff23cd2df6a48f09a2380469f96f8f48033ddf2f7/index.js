// m-timer：グループワークの進行タイマー。段階 0 は準備の画面、段階 k で phases[k-1] の残り時間を数える（元は雲居玄道が研修の資料のために作った部品）
// <m-timer style="height:432px"><script type="application/json">
//   {"ready": {"title": "準備の確認", "text": "用紙とペンがそろっているか"},
//    "phases": [{"title": "① 付箋に書く", "short": "付箋に書く", "text": "1 枚に 1 件", "sec": 180}, …]}
// （JSON の終わり）</m-timer>
// duration(k) = phases[k-1].sec。実行系は t を実時間で進めるので、時計は (k, t) だけで決まる。→ キー（段階を進める）がスタートの合図
// 左：題・説明・残り時間の大きな時計・進みの棒。右：区切りの一覧（今の区切りに枠、終わった区切りは --muted）
// 最後の 1 分は時計と棒が --emph。最後の 10 秒は時計が 1 秒おきに薄くなる（注目のため。動画・動きを減らす設定・最後の状態では止まる）
// 字は部品の中に書かない：授業の言語（ctx.lang。<html lang> から）で日本語か英語の表を選び、データの labels で上書きできる
// ＋1 分・−1 分（仕様 §8.4 ctx.extend、egatari-spec 485ae54）：実行系が ctx.extend を渡すときだけボタンを出す。延ばした秒数は見る人の状態で、
//   同じスライドにいるあいだは残り、ほかのスライドから入ったとき・飛んだとき（ctx.entered）だけ戻る。ctx.reset ではボタンのフォーカスだけを戻す（仕様 §8.4）。動画・印刷は作者の秒数
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog を使い、プレイヤーのグローバルは使わない。
//   延長を戻すのは ctx.entered だけ（1.x の deck:pos の代わりはない）。日本語かどうかは mount の ctx.lang、動画かどうかは ctx.mode。
//   要素の大きさの問題は ctx.report("size", …)。印刷の前後は document.defaultView の beforeprint・afterprint
egatariParts.define({name: "timer", version: "2.0.1", requires: {base: "1.0.0"}, element: "m-timer"}, function(deps){
"use strict";
var base = deps.base;
var CSS_ID = "timer-2-0-0-css";   // the style element this part writes, named with its name and version (spec §6.1 Identifiers)
var JA = {ready: "準備の確認", total: "合計", remaining: "残り", done: "時間", start: "準備ができたら　→ キーでスタート", next: "終了　→ キーで次へ", end: "終了",
          min: "分", sec: "秒", plus: "＋1 分", minus: "−1 分"};
var EN = {ready: "Ready?", total: "Total", remaining: "Remaining", done: "Time's up", start: "When ready, press → to start", next: "Time's up. Press → for the next", end: "Time's up",
          min: " min", sec: " s", plus: "+1 min", minus: "−1 min"};
var CSS = [
  "m-timer .tm-say{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  "m-timer .tm-ctl{position:absolute;display:flex;gap:12px}",
  "m-timer .tm-btn{min-width:112px;height:52px;padding:0 14px;font:700 27px/1 var(--font-cap,var(--font-sans,sans-serif));color:var(--fg);background:var(--bg);border:2px solid var(--term);border-radius:8px;cursor:pointer;touch-action:manipulation}",
  "m-timer .tm-btn:active{background:var(--term-tint)}",
  "m-timer .tm-btn:focus-visible{outline:3px solid var(--emph);outline-offset:2px}",
  "@media print{m-timer .tm-ctl{display:none!important}}",
].join("\n");
return class extends base.MotionElement {
  static partName = "timer";   // the registry name (define meta name), for report prefixes
  static variants = ["fade"];
  static interactive = true;   // 操作できるパーツ（docs/conventions.md §6）
  static preview = "none";     // 先の時間は中身ではないので、授業の表示でも先の区切りを見せない（仕様 §8.4、docs/conventions.md §1.2）
  static clock = true;         // 経った時間そのものが中身：動きを減らす設定でも実時間の t で描く（仕様 §9.1）
  // 「道具」の組（頼まれたときだけ使う部品）と、新規作成の道具の札（docs/conventions.md §7。tools/release.mjs が manifest に写す。JSON で書く）
  static group = "tool";
  static tile = {"label": {"ja": "タイマー", "en": "Timer"}, "examples": {"ja": "グループワークの時間・残り時間・ベル", "en": "Group-work time, time left, bells"}, "icon": "timer"};
  static viewerInput = true;   // 見る人の入力（区切りの時間を延ばす・縮める。仕様 §8.4）
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["phases"], properties: {
      ready: {type: "object", additionalProperties: false, properties: {title: {type: "string"}, text: {type: "string"}}},
      phases: {type: "array", minItems: 1, maxItems: 8, items: {type: "object", additionalProperties: false, required: ["title", "sec"], properties: {
        title: {type: "string"}, short: {type: "string"}, text: {type: "string"}, sec: {type: "integer"}, bells: {type: "array", maxItems: 6, items: {type: "object", additionalProperties: false, required: ["left"], properties: {left: {type: "integer"}, count: {type: "integer"}}}}}}},
      bells: {type: "array", maxItems: 6, items: {type: "object", additionalProperties: false, required: ["left"], properties: {left: {type: "integer"}, count: {type: "integer"}}}},
      done: {type: "string"},
      labels: {type: "object", additionalProperties: false, properties: {
        ready: {type: "string"}, total: {type: "string"}, remaining: {type: "string"}, done: {type: "string"}, start: {type: "string"},
        next: {type: "string"}, end: {type: "string"}, min: {type: "string"}, sec: {type: "string"}, plus: {type: "string"}, minus: {type: "string"}}}}},
    example: {ready: {title: "準備の確認", text: "用紙とペンがそろっているか"}, phases: [{title: "① 付箋に書く", short: "付箋に書く", sec: 180}, {title: "② 島で選ぶ", short: "島で選ぶ", sec: 300}]},
    note: {en: "phases is a list of {\"title\", \"sec\"} (sec: whole seconds, not \"3分\"); one phase per step",
           ja: "phases は {\"title\", \"sec\"} の並び（sec は秒の整数。\"3分\" のような字ではない）。区切り 1 つが 1 段階"},
  };
  static props = {};
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : ((this.data || {}).phases || []).length; }
  // 字の表（授業の言語 ctx.lang で選ぶ。mount が this.ja を決めてから読む。データの labels が勝つ。古い書き方の "done" も受け付ける）
  get L(){
    if (this._L) return this._L;
    var d = this.data || {}, tbl = this.ja ? JA : EN, o = {};
    for (var k in tbl) o[k] = tbl[k];
    if (typeof d.done === "string") o.done = o.end = d.done;
    var lb = d.labels || {};
    for (var j in lb) o[j] = lb[j];
    return (this._L = o);
  }
  mount(ctx){
    this.ja = /^ja\b/i.test(ctx.lang);
    var self = this, d = this.data || {};
    this.P = d.phases || [];
    if (this.P.some(function(p){ return !(p.sec > 0); })) throw new Error("every phase needs sec > 0 (whole seconds)");
    this.video = ctx.mode === "video";
    this.style.display = "block"; this.style.position = "relative";
    if (!document.getElementById(CSS_ID)){ var st = document.createElement("style"); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
    // 読み上げソフトへの知らせ（区切りの始まりと終わりだけ。毎秒は読まない）
    this.say = document.createElement("div"); this.say.className = "tm-say"; this.say.setAttribute("role", "status"); this.say.setAttribute("aria-live", "polite");
    this.appendChild(this.say);
    this._ext = {};
    this.total = this.P.reduce(function(a, p){ return a + p.sec; }, 0);
    // 印刷は作者の秒数で描く（延長は消さない。afterprint で戻す）。beforeprint・afterprint は文書の窓（document.defaultView）に来る
    var view = document.defaultView;
    if (!this.video && view){
      view.addEventListener("beforeprint", function(){ self._printing = true; self.redraw(); });
      view.addEventListener("afterprint", function(){ self._printing = false; self.redraw(); });
    }
    this.place(ctx);
  }
  // 配置が変わった知らせ（仕様 §8.4 layout）：要素の大きさが mount のときと変わったときだけ置き直す（変換で縮めるだけなら呼ばれない。
  // 横に並んだ文の字が後から読み込まれて、段組みの中の幅が変わるときなど）。大きさ 0（隠れている）なら前の配置のまま
  layout(ctx){
    var W = this.clientWidth, H = this.clientHeight;
    if (!W || !H || (W === this.W && H === this.H)) return;
    this.place(ctx);
    this.redraw();
  }
  // 大きさで決まる絵（svg と区切りの一覧、ボタンの位置）を作る。延長・読み上げの知らせは残す
  place(ctx){
    var self = this, D = base, d = this.data || {}, L = this.L;
    var W = this.clientWidth, H = this.clientHeight;
    if (this.svg) this.svg.remove();
    var f = this.f = Math.max(0.6, Math.min(1.2, H / 432, W / 1180)), F = function(z){ return Math.max(24, Math.round(z * f)); };
    var LW = this.LW = W * 0.525, RX = W * 0.576;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"});
    this.insertBefore(svg, this.say);
    var est = this.est = function(s, z){ return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * z; };
    // 題（長ければ 24 px まで小さく）と説明（2 行まで。幅で折り返す）
    var fit = function(s, max, z, what){
      var y = z; while (y > 24 && est(s, y) > max) y--;
      if (est(s, y) > max) ctx.report("size", "[timer] the " + what + " " + JSON.stringify(s) + " does not fit (" + Math.ceil(est(s, y) - max) + " px too wide); shorten it");
      return y;
    };
    var wrap = function(s, max, z, what){
      var out = [];
      String(s || "").split("\n").forEach(function(line){
        var cur = "";
        [...line].forEach(function(c){ if (cur && est(cur + c, z) > max){ out.push(cur); cur = ""; } cur += c; });
        out.push(cur);
      });
      if (out.length > 2) ctx.report("size", "[timer] the text of " + what + " needs " + out.length + " lines (2 fit); shorten it");
      return out.slice(0, 2);
    };
    var heads = [d.ready || {}].concat(this.P);
    this.heads = heads.map(function(h, j){
      var title = h.title || (j === 0 ? L.ready : "");
      return {title: title, size: fit(title, LW, F(44), j ? "title of phase " + j : "ready title"), lines: wrap(h.text, LW, F(30), j ? "phase " + j : "ready")};
    });
    this.ttl = D.el("text", {x: 0, y: 46 * f, "font-weight": 700}, svg);
    this.l1 = D.el("text", {x: 0, y: 96 * f, "font-size": F(30), fill: "var(--fg)"}, svg);
    this.l2 = D.el("text", {x: 0, y: 136 * f, "font-size": F(30), fill: "var(--fg)"}, svg);
    this.lab = D.el("text", {x: 0, y: 190 * f, "font-size": F(26), fill: "var(--muted)"}, svg);
    // 時計：「00:00」が左の幅に収まる大きさ。字の上端が「残り」の字に重ならないように下げる
    var cz = Math.min(150 * f, LW / 3.0), cy = 190 * f + 14 + cz * 0.98, by = cy + 18 * f;
    this.clock = D.el("text", {x: 0, y: cy.toFixed(1), "font-size": cz.toFixed(0), "font-weight": 700, style: "font-variant-numeric:tabular-nums"}, svg);
    D.el("rect", {x: 0, y: by.toFixed(1), width: LW, height: 20 * f, rx: 10 * f, fill: "var(--line)"}, svg);
    this.bar = D.el("rect", {x: 0, y: by.toFixed(1), width: 0, height: 20 * f, rx: 10 * f}, svg);
    if (by + 20 * f > H - 40 * f) ctx.report("size", "[timer] the element is too low for the clock, the bar and the line under it (make it taller)");
    this.foot = D.el("text", {x: 0, y: H - 4, "font-size": F(32), "font-weight": 700, fill: "var(--emph)"}, svg);
    // 区切りの一覧
    var n = this.P.length, top = 180 * f, rh = Math.min(48 * f, (H - top) / Math.max(n, 1));
    if (rh < 34) ctx.report("size", "[timer] " + n + " phases do not fit in the list (make the element taller or use fewer phases)");
    this.rows = this.P.map(function(p, j){
      var y = top + j * rh, s = (j + 1) + (self.ja ? "　" : "  ") + self.span(p.sec) + (self.ja ? "　" : "  ") + (p.short || p.title);
      var box = D.el("rect", {x: RX, y: y, width: W - RX, height: rh - 6, rx: 8, fill: "none", stroke: "none", "stroke-width": 2.5}, svg);
      var tx = D.el("text", {x: RX + 14, y: y + rh / 2 + 7, "font-size": fit(s, W - RX - 28, F(28), "phase list entry")}, svg);
      tx.textContent = s;
      return {box: box, tx: tx};
    });
    this.RX = RX; this.W = W; this.H = H;
    if (this.btns) Object.assign(this.btns.style, {left: RX + "px", top: Math.round(96 * f - 34) + "px"});
  }
  // 秒数の書き方：「3分」「20秒」「1分30秒」（英語は 3 min・20 s）
  span(s){
    var L = this.L, m = Math.floor(s / 60), r = s % 60;
    return s < 60 ? s + L.sec : r === 0 ? m + L.min : m + L.min + (this.ja ? "" : " ") + r + L.sec;
  }
  clockText(s){ s = Math.max(0, Math.ceil(s - 1e-9)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  duration(k){ return k >= 1 && this.P[k - 1] ? this.P[k - 1].sec : 0; }
  // 学会タイマーのようなベル（仕様 §8.4「Component sounds」）：部品は音を鳴らさず、鳴らす時刻を宣言するだけ。鳴らすのは再生器
  // （発表の再生で t が前へ越えたときだけ、Web Audio で合成。動画には同じ時刻で入る。延長は再生器がずらす）。
  // bells は区切りの bells か、全体の bells：[{left: 残りの秒, count: 1〜3}]。書かなければ鳴らない。音だけに頼らず、時計と色でも示す
  events(k){
    var p = k >= 1 && this.P[k - 1];
    if (!p) return [];
    var bells = (p.bells || (this.data && this.data.bells) || []);
    return bells.filter(function(b){ return b.left >= 0 && b.left <= p.sec; })
      .map(function(b){ return {t: p.sec - b.left, sound: "bell", count: Math.max(1, Math.min(3, b.count || 1))}; })
      .sort(function(a, b){ return a.t - b.t; });
  }
  // ---- 見る人の状態：区切りごとに延ばした秒数（−sec より短くはしない）
  ext(k){ return this.video || this._printing ? 0 : this._ext[k] || 0; }
  extend(dl){
    var ctx = this._ctx, k = this._k;
    if (this.video || !ctx || typeof ctx.extend !== "function" || !(k >= 1)) return;
    var sec = this.P[k - 1].sec, cur = this._ext[k] || 0, el = this._t === Infinity ? sec + cur : Math.min(this._t || 0, sec + cur);
    // 縮めるのは今の時刻まで（0:00 で終わる）。延ばすのは 1 時間まで
    var next = Math.max(cur + dl, el - sec, -sec);
    next = Math.min(next, 3600);
    if (next === cur) return;
    var r = ctx.extend(next - cur);
    this._ext[k] = typeof r === "number" && isFinite(r) ? r : next;
    this.redraw();
    this.say.textContent = this.L.remaining + " " + this.clockText(sec + this._ext[k] - Math.min(el, sec + this._ext[k]));
    this.dispatchEvent(new CustomEvent("egatari-input", {bubbles: true, detail: {step: k, extend: this._ext[k]}}));
  }
  reset(){
    var had = Object.keys(this._ext).some(function(k){ return this._ext[k]; }, this);
    this._ext = {};
    if (had) this.dispatchEvent(new CustomEvent("egatari-input", {bubbles: true, detail: {step: this._k, extend: 0}}));
    return had;
  }
  // 触った跡だけを戻す（ctx.reset）：ボタンのフォーカスを外す。延長（見る人の入力）は残す
  untouch(){
    var a = document.activeElement;
    if (a && a !== this && this.contains(a) && a.blur) a.blur();
  }
  // 入力のあとの描き直し：最後の (k, t) で paint だけを呼ぶ（render を通さないので、ctx.entered・ctx.reset を繰り返さない）
  redraw(){ if (this._k !== undefined) this.paint(this._k, this._t, this._ctx); }
  // ＋1 分・−1 分：実行系が ctx.extend を渡したときに初めて作る（渡さない実行系・動画では作らない）
  buttons(){
    if (this.btns || this.video) return;
    var self = this, L = this.L, box = this.btns = document.createElement("div");
    box.className = "tm-ctl";
    Object.assign(box.style, {left: this.RX + "px", top: Math.round(96 * this.f - 34) + "px"});
    [[L.minus, -60], [L.plus, 60]].forEach(function(b){
      var e = document.createElement("button");
      e.type = "button"; e.className = "tm-btn"; e.textContent = b[0]; e.setAttribute("aria-label", b[0]);
      e.addEventListener("click", function(ev){ ev.stopPropagation(); self.extend(b[1]); if (ev.detail !== 0) e.blur(); });
      e.addEventListener("keydown", function(ev){
        var up = ev.key === "+", dn = ev.key === "-" || ev.key === "−";
        if (up || dn){ ev.preventDefault(); ev.stopPropagation(); self.extend(up ? 60 : -60); }
      });
      box.appendChild(e);
    });
    this.appendChild(box);
  }
  render(k, t, ctx){
    if (ctx.entered === true) this.reset();
    if (ctx.reset) this.untouch();
    // 描き直し（redraw）で reset・entered をもう一度使わないように、それを除いて覚える（extend などはそのまま）
    this._k = k; this._t = t; this._ctx = Object.assign({}, ctx); delete this._ctx.reset; delete this._ctx.entered;
    this.paint(k, t, this._ctx);
  }
  // (k, t) と延長の絵。ctx は render の ctx から reset・entered を除いたもの
  paint(k, t, ctx){
    var D = base, L = this.L, P = this.P, n = P.length, run = k >= 1 && P[k - 1];
    var hasExt = !this.video && ctx && typeof ctx.extend === "function";
    if (hasExt) this.buttons();
    if (this.btns) this.btns.style.display = hasExt && run ? "" : "none";
    // 延ばした合計は実行系が持つ（ctx.extend(0) は変えずに読むだけ。仕様 §8.4）。発表者の画面で延ばした分もこれでそろう
    if (hasExt && run){ var r0 = ctx.extend(0); if (typeof r0 === "number" && isFinite(r0)) this._ext[k] = r0; }
    var sec = run ? P[k - 1].sec : 0, end = sec + (run ? this.ext(k) : 0);
    var el = !run ? 0 : t === Infinity ? end : Math.min(Math.max(0, t), end);
    var rem = run ? end - el : this.total, finished = run && el >= end, warn = run && rem <= 60;
    // fade（見せ方 0）：区切りが始まると、題・説明・時計がフェードして現れる
    var a = run && t !== Infinity ? D.prog(t, 0, 0.4) : 1;
    var h = this.heads[run ? k : 0];
    this.ttl.textContent = h.title; this.ttl.setAttribute("font-size", h.size);
    this.ttl.style.fill = run ? "var(--term)" : "var(--emph)";
    this.l1.textContent = h.lines[0] || ""; this.l2.textContent = h.lines[1] || "";
    [this.ttl, this.l1, this.l2].forEach(function(e){ e.setAttribute("opacity", a.toFixed(3)); });
    this.lab.textContent = !run ? L.total : finished ? L.done : L.remaining;
    this.clock.textContent = this.clockText(rem);
    this.clock.style.fill = !run ? "var(--muted)" : warn || finished ? "var(--emph)" : "var(--fg)";
    // 最後の 10 秒は 1 秒おきに薄く（注目のため。動画・最後の状態では止まる。動きを減らす設定では実行系が最後の状態で描く）
    var pulse = run && !finished && rem <= 10 && t !== Infinity && !this.video && Math.floor(t) % 2 === 1;
    this.clock.setAttribute("opacity", (pulse ? 0.45 : a).toFixed(3));
    this.bar.setAttribute("width", (this.LW * (run ? el / end : 0)).toFixed(1));
    this.bar.style.fill = warn || finished ? "var(--emph)" : "var(--term)";
    this.foot.textContent = !run ? L.start : finished ? (k < n ? L.next : L.end) : "";
    this.rows.forEach(function(r, j){
      var cur = run && j + 1 === k, done = run && j + 1 < k;
      r.box.style.fill = cur ? "var(--term-tint)" : "none";
      r.box.style.stroke = cur ? "var(--term)" : "none";
      // 終わった区切りは --muted（薄くしても 4.5:1 は保つので、透明にはしない）
      r.tx.style.fill = done ? "var(--muted)" : "var(--fg)";
      r.tx.setAttribute("font-weight", cur ? "700" : "400");
    });
    var s = !run ? "" : finished ? h.title + "：" + L.done : h.title;
    if (this._said !== s && !this.video){ this._said = s; this.say.textContent = s; }
  }
};
});
