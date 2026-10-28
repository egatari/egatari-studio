// m-predict：予想してから答えを開く。問いと選択肢、クラスの数（手を挙げた人数）を選択肢ごとの棒で見せ、作者の書いた段階で答えを開く
// <m-predict unit="人" style="height:440px"><script type="application/json">
//   {"question": "重い球と軽い球、どちらが先に落ちる？",
//    "choices": [{"label": "重い球"}, {"label": "軽い球"}, {"label": "同時"}],
//    "answer": 2, "counts": [14, 3, 9], "note": "空気の抵抗を除けば、重さによらず同時に落ちる（ガリレオ）"}
// （JSON の終わり）</m-predict>
// 段階：0 = 問いと選択肢（と目盛り）。1 = 数の棒。answer-step（既定 2）= 答え（正しい選択肢に枠と ✓、ほかは薄く、note）
// 見る人の入力（仕様 §8.4「Viewer input」、Studio の約束事 §3）：選択肢ごとの −1・＋1 と数の欄（発表者が数える）、選択肢の名前を押すと「自分の予想」。
//   入力は (i, k, t) の外で、同じスライドにいるあいだは（段階を進めても戻っても）残る。ほかのスライドから入ったとき・飛んだとき（ctx.entered）だけ作者の counts に戻る。
//   ctx.reset（触った部品を段階に入るときに戻す）では、触った跡（欄やボタンのフォーカス）だけを戻し、数と予想は残す（仕様 §8.4）
//   動画（?mode=video）では操作を作らず、input() も受け付けない。印刷では操作を隠し、作者の数を字で出す
// live（拡張 live §2.5）：poll="p1" と書き、ctx.live があれば ctx.live.poll("p1") の数（number[] | null）を棒に出す。
//   見せてよいか（先生が見せると決めたか、3 人以上か）は実行系が決める。部品は配列が来たときだけ出し、動画・印刷では出さない
// 見せ方（docs/conventions.md §1）：fade（0。棒と答えの印がフェードして現れる）・draw（棒が上の選択肢から順に現れ、答えの枠を線で引く。長さは同じ）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・variant を使い、プレイヤーのグローバルは使わない。
//   見る人の入力を戻すのは ctx.entered だけ（1.x の deck:pos の代わりはない）。動画かどうかは mount の ctx.mode。
//   要素の大きさの問題は ctx.report("size", …)。印刷の前後は document.defaultView の beforeprint・afterprint
egatariParts.define({name: "predict", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-predict"}, function(deps){
"use strict";
var base = deps.base;
var CSS_ID = "predict-2-0-0-css";   // the style element this part writes, named with its name and version (spec §6.1 Identifiers)
var CSS = [
  "m-predict .pd-say{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  "m-predict .pd-pick{position:absolute;background:transparent;border:0;border-radius:10px;cursor:pointer;padding:0;margin:0}",
  "m-predict .pd-pick:focus-visible,m-predict .pd-btn:focus-visible,m-predict .pd-num:focus-visible{outline:3px solid var(--emph);outline-offset:2px}",
  "m-predict .pd-ctl{position:absolute;display:flex;gap:8px;align-items:center;height:48px}",
  "m-predict .pd-btn{width:60px;height:48px;font:700 27px/1 var(--font-cap,var(--font-sans,sans-serif));color:var(--fg);background:var(--bg);border:2px solid var(--term);border-radius:8px;cursor:pointer;padding:0;touch-action:manipulation}",
  "m-predict .pd-btn:active{background:var(--term-tint)}",
  "m-predict .pd-num{width:80px;height:48px;box-sizing:border-box;font:700 27px/1 var(--font-cap,var(--font-sans,sans-serif));font-variant-numeric:tabular-nums;text-align:center;color:var(--fg);background:var(--bg);border:2px solid var(--muted);border-radius:8px;padding:0}",
  "@media print{m-predict .pd-ctl,m-predict .pd-pick,m-predict .pd-mark,m-predict .pd-live{display:none!important}}",
].join("\n");
return class extends base.MotionElement {
  static partName = "predict";   // the registry name (define meta name), for report prefixes
  static variants = ["fade", "draw"];
  static interactive = true;   // 操作できるパーツ（docs/conventions.md §6）
  static viewerInput = true;   // 見る人の入力を受け付ける（仕様 §8.4）
  static preview = "none";     // 先の段階は答えなので、授業の表示でも先を見せない（仕様 §8.4、docs/conventions.md §1.2）
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["choices", "answer"], properties: {
      question: {type: "string"},
      choices: {type: "array", minItems: 2, maxItems: 6, items: {type: "object", additionalProperties: false, required: ["label"], properties: {
        label: {type: "string"}, tone: {type: "string"}}}},
      answer: {type: "integer"},
      counts: {type: "array", items: {type: "integer"}},
      note: {type: "string"}}},
    example: {question: "重い球と軽い球、どちらが先に落ちる？", choices: [{label: "重い球"}, {label: "軽い球"}, {label: "同時"}], answer: 2, counts: [14, 3, 9], note: "空気の抵抗を除けば同時に落ちる"},
    note: {en: "choices are objects {\"label\": …} (not strings); answer is the 0-based index of the right choice; counts (optional) has one whole number ≥ 0 per choice",
           ja: "choices は {\"label\": …} の並び（字の並びではない）。answer は正しい選択肢の番号（0 から数える）。counts（省略可）は選択肢ごとに 0 以上の整数を 1 つずつ"},
  };
  static props = {
    "answer-step": {type: "number", default: 2, doc: "答えを開く段階（1 以上。1 なら数の棒と同時）"},
    unit:          {type: "string", default: "", doc: "数の単位（人 など）"},
    poll:          {type: "string", default: "", doc: "live の投票の id（live 拡張のある再生で、見せてよいと決まった集計を棒に出す）"},
    ticks:         {type: "bool", default: true, doc: "数の軸の目盛りと格子"},
  };
  get aStep(){ return Math.max(1, Math.round(this.props["answer-step"]) || 2); }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.aStep; }
  // 作者の数（counts。書かなければ全部 0）
  get author(){
    var d = this.data || {}, n = (d.choices || []).length;
    return Array.from({length: n}, function(_, i){ var v = d.counts && d.counts[i]; return Number.isInteger(v) && v > 0 ? v : 0; });
  }
  mount(ctx){
    var self = this, P = this.props, D = base, d = this.data || {}, ch = d.choices || [], n = ch.length;
    if (!(d.answer >= 0 && d.answer < n)) throw new Error("answer " + d.answer + " is not a choice index (0–" + (n - 1) + ")");
    if (d.counts && d.counts.length !== n) throw new Error("counts has " + d.counts.length + " numbers for " + n + " choices");
    if (d.counts && d.counts.some(function(v){ return v < 0; })) throw new Error("counts must be 0 or more");
    this.variant = base.variant(this);
    this.video = ctx.mode === "video";
    this.style.display = "block"; this.style.position = "relative";
    if (!document.getElementById(CSS_ID)){ var st = document.createElement("style"); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
    var W = this.clientWidth, H = this.clientHeight, inter = !this.video;
    var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; };
    // 縦：問い・行・目盛り・注（と予想の当たり外れ）
    var qh = d.question ? 54 : 0, nh = d.note || inter ? 50 : 0, tb = P.ticks ? 40 : 8;
    var rh = Math.min(88, (H - qh - nh - tb) / n);
    if (inter && rh < 54) ctx.report("size", "[predict] rows are " + rh.toFixed(0) + " px high; the −1/+1 buttons need 54 (make the element taller or use fewer choices)");
    // 横：予想の印・選択肢の名前・棒・数と「正解」・操作
    var mk = inter ? 40 : 0, LS = 26;
    var lw = Math.min(W * 0.34, Math.max.apply(null, ch.map(function(c){ return est(c.label, LS); })) + 16);
    var cw = inter ? 232 : 0;
    var valW = est("9999" + P.unit, 26) + 12, okW = est("✓ 正解", 26) + 16;
    this.g = {W: W, H: H, qh: qh, nh: nh, rh: rh, mk: mk, lw: lw, cw: cw,
      x0: mk + lw + 8, x1: W - cw - valW - okW - 8, y0: qh, y1: qh + rh * n};
    var G = this.g;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var fitText = function(el, s, max, size, what){
      var z = size;
      while (z > 24 && est(s, z) > max) z--;
      if (est(s, z) > max) ctx.report("size", "[predict] the " + what + " does not fit (" + Math.ceil(est(s, z) - max) + " px too wide at 24 px); shorten it");
      el.setAttribute("font-size", z);
      return el;
    };
    if (d.question) fitText(D.mtext(svg, 0, 36, d.question, {"font-size": 30, "font-weight": 700}), d.question, W - 8, 30, "question");
    // 答えの枠（行の後ろ）
    this.frame = D.el("rect", {x: 2, y: 0, width: Math.max(0, W - cw - 12), height: rh - 8, rx: 10, fill: "none", stroke: "var(--emph)", "stroke-width": 3, opacity: 0}, svg);
    this.frameLen = 2 * (W - cw - 12 + rh - 8);
    // 目盛り（数の軸の上限は数で決まるので、render で置き直す。入れ物は先に作る）
    var gT = D.el("g", {}, svg);
    this.ticks = !P.ticks ? [] : Array.from({length: 8}, function(){
      return {grid: D.el("line", {stroke: "var(--line)", "stroke-width": 1.2, y1: G.y0 + 4, y2: G.y1}, gT),
              text: D.el("text", {"font-size": 24, "text-anchor": "middle", y: G.y1 + 30, style: "font-variant-numeric:tabular-nums"}, gT)};
    });
    if (P.ticks){ var z = D.el("text", {"font-size": 24, "text-anchor": "middle", x: G.x0, y: G.y1 + 30}, gT); z.textContent = "0"; }
    D.el("line", {x1: G.x0, y1: G.y0 + 4, x2: G.x0, y2: G.y1, stroke: "var(--fg)", "stroke-width": 1.5}, svg);
    var bw = Math.min(46, rh * 0.56);
    this.rows = ch.map(function(c, i){
      var cy = G.y0 + rh * (i + 0.5), col = tone(c.tone);
      var r = {cy: cy, col: col,
        mark: inter ? D.el("circle", {cx: 16, cy: cy, r: 11, fill: "none", stroke: "var(--term)", "stroke-width": 2.5, "class": "pd-mark"}, svg) : null,
        dot: inter ? D.el("circle", {cx: 16, cy: cy, r: 6, fill: "var(--term)", opacity: 0, "class": "pd-mark"}, svg) : null,
        bar: D.el("rect", {x: G.x0, y: (cy - bw / 2).toFixed(1), height: bw.toFixed(1), rx: 3, fill: col, opacity: 0}, svg),
        label: fitText(D.mtext(svg, mk + lw, cy + 9, c.label, {"text-anchor": "end", "font-size": LS}), c.label, lw - 8, LS, "label " + JSON.stringify(c.label)),
        val: D.el("text", {"font-size": 26, "font-weight": 700, y: (cy + 9).toFixed(1), opacity: 0, style: "font-variant-numeric:tabular-nums"}, svg)};
      if (i === d.answer) r.ok = D.el("text", {"font-size": 26, "font-weight": 700, y: (cy + 9).toFixed(1), fill: "var(--emph)", opacity: 0}, svg);
      if (r.ok) r.ok.textContent = "✓ 正解";
      return r;
    });
    this.bw = bw;
    // 注（答えと一緒に）と、予想の当たり外れ（見る人が予想したときだけ）
    this.noteEl = D.el("text", {x: 0, y: H - 14, "font-size": 26, opacity: 0}, svg);
    this.noteText = d.note || "";
    if (d.note) fitText(this.noteEl, "予想ははずれ。" + d.note, W - 8, 26, "note");
    // live の集計の見出し（集計を出すときだけ）
    this.liveEl = D.el("text", {x: W, y: G.y1 + 30, "font-size": 24, "text-anchor": "end", opacity: 0, "class": "pd-live"}, svg);
    this.liveEl.textContent = "投票の結果";
    // 読み上げソフトへの知らせ
    this.say = document.createElement("div"); this.say.className = "pd-say"; this.say.setAttribute("role", "status"); this.say.setAttribute("aria-live", "polite");
    this.appendChild(this.say);
    if (d.question) this.setAttribute("aria-label", d.question);
    // 操作：選択肢の名前（自分の予想）、−1・数の欄・＋1。動画では作らない
    if (inter){
      var mkEl = function(tag, cls, attrs){ var e = document.createElement(tag); e.className = cls; for (var a in attrs) e.setAttribute(a, attrs[a]); self.appendChild(e); return e; };
      var unit = P.unit;
      this.rows.forEach(function(r, i){
        var top = r.cy - 24;
        r.pick = mkEl("button", "pd-pick", {type: "button", "aria-pressed": "false", "aria-label": "予想：" + ch[i].label});
        Object.assign(r.pick.style, {left: "0px", top: (r.cy - rh / 2 + 4) + "px", width: (mk + lw) + "px", height: (rh - 8) + "px"});
        r.pick.addEventListener("click", function(e){ e.stopPropagation(); self.choose(i); });
        var ctl = r.ctl = mkEl("div", "pd-ctl", {role: "group", "aria-label": ch[i].label + "の数"});
        Object.assign(ctl.style, {left: (W - cw + 16) + "px", top: top + "px"});
        var bt = function(txt, dlt, lab){
          var b = document.createElement("button"); b.type = "button"; b.className = "pd-btn"; b.textContent = txt; b.setAttribute("aria-label", ch[i].label + "：" + lab);
          b.addEventListener("click", function(e){ e.stopPropagation(); self.bump(i, dlt); });
          b.addEventListener("keydown", function(e){ self.key(e, i, false); });
          return b;
        };
        ctl.appendChild(bt("−1", -1, "1 減らす"));
        var f = r.field = document.createElement("input");
        f.type = "text"; f.className = "pd-num"; f.setAttribute("inputmode", "numeric"); f.setAttribute("autocomplete", "off");
        f.setAttribute("aria-label", ch[i].label + "の数" + (unit ? "（" + unit + "）" : ""));
        f.addEventListener("keydown", function(e){ self.key(e, i, true); });
        f.addEventListener("input", function(){
          var s = f.value.replace(/[^0-9]/g, "").slice(0, 4);
          if (s !== f.value) f.value = s;
          self.set(i, s === "" ? 0 : +s);
        });
        f.addEventListener("change", function(){ f.value = String(self.counts()[i]); });
        ctl.appendChild(f);
        ctl.appendChild(bt("+1", 1, "1 増やす"));
      });
      // 印刷は作者の値で描く（画面の数は消さない。afterprint で戻す）。beforeprint・afterprint は文書の窓（document.defaultView）に来る
      var view = document.defaultView;
      if (view){
        view.addEventListener("beforeprint", function(){ self._printing = true; self.redraw(); });
        view.addEventListener("afterprint", function(){ self._printing = false; self.redraw(); });
      }
    }
    function tone(t){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(t || "") ? "var(--" + t + ")" : "var(--term)"; }
  }
  // ---- 見る人の状態（(i, k, t) の外）
  // 今の数（見る人が変えていればその値、そうでなければ作者の値）。新しい配列を返す
  counts(){ return (this._vc || this.author).slice(); }
  // 発表者の画面から（Studio が呼ぶ）：choice は 0 から数える選択肢の番号、count は新しい数（0 以上の整数）
  input(choice, count){
    if (this.video) return;
    var n = this.author.length;
    if (!Number.isInteger(choice) || choice < 0 || choice >= n || !Number.isInteger(count) || count < 0 || count > 9999){
      console.warn("[predict] input(" + JSON.stringify(choice) + ", " + JSON.stringify(count) + ") ignored (choice 0–" + (n - 1) + ", count a whole number 0–9999)");
      return;
    }
    this.set(choice, count);
  }
  bump(i, dl){ this.set(i, this.counts()[i] + dl); }
  set(i, v){
    if (this.video || !this.rows) return;
    v = Math.max(0, Math.min(9999, v));
    var c = this.counts();
    if (c[i] === v) return;
    c[i] = v; this._vc = c;
    this.redraw();
    this.say.textContent = this.data.choices[i].label + "：" + v + this.props.unit;
    this.emit();
  }
  // 自分の予想（1 つ。もう一度押すと外す）
  choose(i){
    if (this.video) return;
    var d = this.data;
    this._pick = this._pick === i ? null : i;
    this.redraw();
    var lab = d.choices[i].label;
    this.say.textContent = this._pick === null ? "予想を外しました" : this.revealed() ? (i === d.answer ? "当たり：" + lab : "はずれ。答えは " + d.choices[d.answer].label) : "あなたの予想：" + lab;
  }
  revealed(){ return this._k !== undefined && this._k >= this.aStep; }
  key(e, i, field){
    var k = e.key, up = k === "+" || k === "ArrowUp" || (!field && k === "ArrowRight"), dn = k === "-" || k === "−" || k === "ArrowDown" || (!field && k === "ArrowLeft");
    if (up || dn){ e.preventDefault(); e.stopPropagation(); this.bump(i, up ? 1 : -1); return; }
    if (field){
      // 欄の中のキー（数字・矢印・Space など）はスライドを動かさない。Esc で欄を出る
      e.stopPropagation();
      if (k === "Escape" || k === "Enter") e.target.blur();
    }
  }
  emit(){ this.dispatchEvent(new CustomEvent("egatari-input", {bubbles: true, detail: {counts: this.counts()}})); }
  // 見る人の状態を捨てて作者の値に戻す。数を変えていたら知らせる
  reset(){
    var had = !!this._vc;
    if (!had && this._pick == null) return false;
    this._vc = null; this._pick = null;
    if (had) this.emit();
    return true;
  }
  // 触った跡だけを戻す（ctx.reset）：部品の中のフォーカスを外す（欄は今の数を出し直す）。数と予想（見る人の入力）は残す
  untouch(){
    var a = document.activeElement;
    if (a && a !== this && this.contains(a) && a.blur) a.blur();
  }
  // 入力のあとの描き直し：最後の (k, t) で paint だけを呼ぶ（render を通さないので、ctx.entered・ctx.reset を繰り返さない）
  redraw(){ if (this._k !== undefined) this.paint(this._k, this._t, this._ctx); }
  duration(k){
    var a = this.aStep, d = 0;
    if (k === 1) d = 0.6;
    if (k === a) d += 0.6;
    return d;
  }
  render(k, t, ctx){
    // ほかのスライドから入ったとき・飛んだとき（ctx.entered）だけ、見る人の状態を捨てる。同じスライドの中の段階の移りでは残す。
    // ctx.reset（触った部品が段階に入るとき）は触った跡だけを戻し、見る人の入力は消さない（仕様 §8.4）
    if (ctx.entered === true) this.reset();
    if (ctx.reset) this.untouch();
    this._k = k; this._t = t; this._ctx = {mode: ctx.mode, preview: ctx.preview, live: ctx.live};
    this.paint(k, t, this._ctx);
  }
  // (k, t) と見る人の状態の絵。ctx は {mode, preview, live}
  paint(k, t, ctx){
    var self = this, P = this.props, D = base, G = this.g, dd = this.data, n = this.rows.length, vr = this.variant;
    var a = this.aStep;
    // 数：live の集計（実行系が見せてよいと渡したときだけ）→ 見る人の数 → 作者の数
    var live = null;
    if (P.poll && ctx && ctx.live && typeof ctx.live.poll === "function" && !this.video && !this._printing){
      var lv = ctx.live.poll(P.poll);
      if (Array.isArray(lv)) live = Array.from({length: n}, function(_, i){ var v = +lv[i]; return isFinite(v) && v > 0 ? Math.round(v) : 0; });
    }
    var c = live || (this._printing ? this.author : this.counts()), pick = this._printing ? null : this._pick;
    // 段階 1 の棒（draw は上から順に、同じ長さの中で）、答えの段階
    // 先の段階は授業の表示（ctx.preview）でも見せない：予想する前に棒や答えが見えてはいけない（static preview = "none"）
    var e1 = k > 1 ? 1 : k < 1 ? 0 : null;
    var at1 = 0, ea = k > a ? 1 : k < a ? 0 : D.prog(t, a === 1 ? 0.6 : 0, 0.6);
    var rowE = function(j){
      if (e1 !== null) return e1;
      if (vr === "draw"){ var s = n > 1 ? 0.3 / (n - 1) : 0; return D.prog(t, at1 + j * s, 0.3); }
      return D.prog(t, at1, 0.6);
    };
    // 数の軸
    var M = nice(Math.max(4, Math.max.apply(null, c)) * 1.12), len = G.x1 - G.x0, X = function(v){ return G.x0 + Math.min(v, M) / M * len; };
    var ts = Math.max(1, tickStep(M)), ti = 0;
    this.ticks.forEach(function(o, j){
      var v = (j + 1) * ts, on = v <= M + 1e-9;
      o.grid.setAttribute("x1", X(v).toFixed(1)); o.grid.setAttribute("x2", X(v).toFixed(1));
      o.text.setAttribute("x", X(v).toFixed(1)); o.text.textContent = on ? String(v) : "";
      o.grid.setAttribute("opacity", on ? 0.8 : 0); o.text.setAttribute("opacity", on ? 1 : 0);
    });
    var shown = ea > 0.5;
    this.rows.forEach(function(r, j){
      var e = rowE(j), isA = j === dd.answer, dim = isA ? 1 : 1 - 0.65 * ea;
      r.bar.setAttribute("width", Math.max(0, X(c[j]) - G.x0).toFixed(1));
      r.bar.setAttribute("opacity", (e * dim).toFixed(3));
      r.val.textContent = self.fmt(c[j]);
      r.val.setAttribute("x", (X(c[j]) + 10).toFixed(1));
      r.val.setAttribute("opacity", e.toFixed(3));
      // 答えを開いたら、ほかの選択肢の字は --muted（読める濃さのまま）
      var txt = !isA && shown ? "var(--muted)" : "var(--fg)";
      r.val.style.fill = txt; r.label.style.fill = txt;
      r.label.setAttribute("font-weight", isA && shown ? 700 : 400);
      if (r.ok){ r.ok.setAttribute("x", (X(c[j]) + 10 + est(self.fmt(c[j]), 26) + 14).toFixed(1)); r.ok.setAttribute("opacity", ea.toFixed(3)); }
      if (r.dot){ r.dot.setAttribute("opacity", pick === j ? 1 : 0); r.pick.setAttribute("aria-pressed", pick === j ? "true" : "false"); }
      if (r.ctl){
        r.ctl.style.display = k >= 1 && !live ? "" : "none";
        if (document.activeElement !== r.field) r.field.value = String(c[j]);
      }
    });
    // 答えの枠：fade はフェード、draw は線を引く（同じ長さ）
    var fy = G.y0 + G.rh * dd.answer + 4;
    this.frame.setAttribute("y", fy.toFixed(1));
    if (vr === "draw" && ea > 0 && ea < 1){ this.frame.setAttribute("stroke-dasharray", this.frameLen.toFixed(0)); this.frame.setAttribute("stroke-dashoffset", (this.frameLen * (1 - ea)).toFixed(1)); this.frame.setAttribute("opacity", 1); }
    else { this.frame.removeAttribute("stroke-dasharray"); this.frame.removeAttribute("stroke-dashoffset"); this.frame.setAttribute("opacity", ea.toFixed(3)); }
    // 注と、予想の当たり外れ
    var pk = pick, st = pk != null && k >= a ? (pk === dd.answer ? "予想は当たり。" : "予想ははずれ。") : "";
    this.noteEl.textContent = (k >= a ? st : "") + this.noteText;
    this.noteEl.setAttribute("opacity", ea.toFixed(3));
    this.liveEl.setAttribute("opacity", live && k >= 1 ? 1 : 0);
    // 答えを開いた段階に入ったら知らせる（入力の知らせは set・choose が後から書く）
    if (this._sayK !== k && !this.video){ this._sayK = k; this.say.textContent = k >= a ? "答え：" + dd.choices[dd.answer].label + (this.noteText ? "。" + this.noteText : "") : ""; }
    function est(s, size){ return [...String(s)].reduce(function(a, c){ return a + (/[\u0000-ɏ]/.test(c) ? 0.56 : 1); }, 0) * size; }
    function nice(v){ var e = Math.pow(10, Math.floor(Math.log10(v))), x = v / e;
      return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function(s){ return s >= x - 1e-9; })[0] * e; }
    function tickStep(M){ var r = M / 4.5, e = Math.pow(10, Math.floor(Math.log10(r))), x = r / e;
      return Math.round((x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * e); }
  }
  fmt(v){ return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + this.props.unit; }
};
});
