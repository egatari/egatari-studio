// m-cards：カードを横一列（row）か 2 段（grid：2×2、5〜6 枚なら 3×2）に並べ、段階ごとに出す。カードは番号の丸・アイコン・見出し・説明
// <m-cards arrows style="height:320px"><script type="application/json">
//   {"cards": [{"icon": "user", "title": "聞く", "text": "相手の困りごとを聞く"}, {"icon": "bulb", "title": "考える"}]}
// （JSON の終わり）</m-cards>
// 段階：既定はカード 1 枚 = 1 段階（per-step で n 枚ずつ、カードの step で直接）
// アイコンは名前で引く（ライブラリ部品 icons、Tabler Icons outline）。組み立てはレッスンに書かれた名前のアイコンだけを残す
// 説明は和文を文節の切れ目らしい所（平仮名の後ろで平仮名でない字の前、読点・空白の後ろ）で折り返し、入らなければ … で切って ctx.report
// 見せ方（docs/conventions.md §1）：rise（下から、既定）・fade（その場で）・draw（枠と矢印を描いてから中身）。段階の数・長さ・最後の中身はどれも同じ
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・clamp・variant・previewOpacity と icons の svg を使い、プレイヤーのグローバルは使わない
egatariParts.define({name: "cards", version: "2.0.4", requires: {base: "1.2.0", icons: "1.0.0"}, element: "m-cards"}, function(deps){
"use strict";
var base = deps.base, icons = deps.icons;
var TONES = /^(term|emph|accent2|series-[1-4])$/;
// 字の幅の見積もり（字の大きさ 1 あたり。base の textWidth：font の要素の字で測った幅。mtext で書くので *_^ は数えない）
function est(s, font){ return base.textWidth(s, 1, {font: font, mark: true}); }
// 折ってよい所：空白・読点の後ろ、平仮名の後ろで平仮名でない字の前、欧文と和文の境（数と単位の間は除く）。行の頭に置かない字（小さい仮名・長音・句読点・閉じ括弧）の前では折らない
var HEADLESS = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー、。，．・）」』】〕！？!?,.)]/, HIRA = /[ぁ-ゖ]/, LATIN = /[\u0000-ɏ]/;
function breaks(ch){
  var ok = [];
  for (var i = 1; i < ch.length; i++){
    var a = ch[i - 1], b = ch[i];
    // 数と単位（「5 分」「1 枚」）の間では折らない
    if (/[0-9]/.test(a) && (b === " " || !LATIN.test(b)) || a === " " && /[0-9]/.test(ch[i - 2] || "") && !LATIN.test(b)){ ok[i] = false; continue; }
    ok[i] = !HEADLESS.test(b) && !/[（「『【〔(]/.test(a) &&
      (a === " " || /[、。，．]/.test(a) || (HIRA.test(a) && !HIRA.test(b)) || (LATIN.test(a) !== LATIN.test(b) && b !== " "));
  }
  return ok;
}
// s を幅 w（字の大きさ size、字は要素 font のもの）の行に折る。行の数が max を超えれば最後の行を … で切る。{lines, cut}
function wrap(s, w, size, max, font){
  var out = [], paras = String(s).split("\n"), cut = false;
  paras.forEach(function(p){
    var ch = [...p], ok = breaks(ch), start = 0, last = -1;
    for (var i = 0; i <= ch.length; i++){
      if (i > start && est(ch.slice(start, i).join(""), font) * size > w){
        // 入らない：最後の折ってよい所で折る（なければ字の所で。行の頭に置かない字は前の行に残す）
        var at = last > start ? last : i - 1;
        if (at <= start) at = start + 1;
        while (last <= start && at < ch.length && HEADLESS.test(ch[at]) && at - start > 1) at--;
        out.push(ch.slice(start, at).join("").replace(/ +$/, ""));
        start = at; while (ch[start] === " ") start++;
        last = -1; i = start;
        continue;
      }
      if (i < ch.length && ok[i]) last = i;
    }
    out.push(ch.slice(start).join(""));
  });
  if (out.length > max){
    cut = true; out = out.slice(0, max);
    var l = [...out[max - 1]];
    while (l.length && est(l.join("") + "…", font) * size > w) l.pop();
    out[max - 1] = l.join("").replace(/[、。 ]$/, "") + "…";
  }
  return {lines: out, cut: cut};
}
return class extends base.MotionElement {
  static partName = "cards";   // the registry name (define meta name), for report prefixes
  static variants = ["rise", "fade", "draw"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["cards"], properties: {
      cards: {type: "array", minItems: 2, maxItems: 6, items: {type: "object", additionalProperties: false, required: ["title"], properties: {
        n: {type: "string"}, icon: {type: "string"}, title: {type: "string"}, text: {type: "string"}, step: {type: "integer"}, tone: {type: "string"}}}}}},
    example: {cards: [{icon: "user", title: "聞く", text: "相手の困りごとを聞く"}, {icon: "bulb", title: "考える", text: "案を 3 つ出す"}, {icon: "rocket", title: "試す", text: "小さく作って見せる"}]},
  };
  static props = {
    layout:     {type: "enum", values: ["row", "grid"], default: "row", doc: "row：横一列。grid：2 段（4 枚までは 2×2、5〜6 枚は 3×2）"},
    arrows:     {type: "bool", default: false, doc: "カードの間に順の矢印（grid では 1→2→3→4 の Z の順）"},
    nums:       {type: "bool", default: false, doc: "番号の丸を出す（カードの n が優先。n だけ書いたカードはそれを出す）"},
    hilite:     {type: "string", default: "", doc: "強調するカード：last か番号（1 から）。--emph の枠と地"},
    "per-step": {type: "number", default: 1, doc: "1 ステップに出すカードの数（0 = 全部をステップ 1 で）"},
    stagger:    {type: "number", default: 0.25, doc: "同じステップのカードの出だしのずれ（秒）"},
    dur:        {type: "number", default: 0.5, doc: "1 枚が出る秒数"},
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
    return (this._plan = ((this.data || {}).cards || []).slice(0, 6).map(function(c, i){
      var step = c.step !== undefined ? c.step : per > 0 ? Math.floor(i / per) + 1 : 1;
      var j = seen[step] = (seen[step] || 0) + 1;
      return {c: c, i: i, step: step, at: +((j - 1) * P.stagger).toFixed(3)};
    }));
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), n = pl.length;
    this.variant = base.variant(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var grid = P.layout === "grid" && n > 2, cols = grid ? (n <= 4 ? 2 : 3) : n, rows = grid ? 2 : 1;
    var gap = P.arrows ? 60 : 24, vgap = P.arrows ? 48 : 24;
    var cw = (W - gap * (cols - 1)) / cols, ch = (H - vgap * (rows - 1)) / rows;
    this.cards = []; this.arrows = [];
    // 高さ（幅）のない要素：カードの枠が負の大きさになる。描かずに知らせる
    if (!(cw > 0 && ch > 0)){
      ctx.report("size", "[cards] the element is " + W + "×" + H + "px, too small for " + n + " card" + (n === 1 ? "" : "s") + "; give it a height (e.g. style=\"height:320px\")");
      return;
    }
    // 読み上げの名前：作者の aria-label、なければカードの数と見出し
    var ja = /^ja\b/i.test(ctx.lang || "ja");
    var name = this.getAttribute("aria-label") || (ja ? "カード " + n + " 枚：" : n + " cards: ") + pl.map(function(o){ return o.c.title; }).join(ja ? "、" : ", ");
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "list", "aria-label": name, style: "display:block;overflow:visible"}, this);
    var hl = P.hilite === "last" ? n - 1 : /^\d+$/.test(P.hilite) ? +P.hilite - 1 : -1;
    if (P.hilite && (hl < 0 || hl >= n)) ctx.report("attr", '[cards] hilite="' + P.hilite + '" is not last or a card number 1–' + n);
    // カードの中：横に広いカード（幅が高さの 1.6 倍以上）は 番号・アイコン・見出しを 1 行に、ほかは縦に積む
    var pad = 20, wide = cw >= ch * 1.6;
    var isz = Math.round(Math.max(32, Math.min(64, cw * 0.22, ch * 0.24)));
    var tsz = Math.round(Math.max(26, Math.min(34, cw * 0.11))), xsz = 24, lh = 34, bd = 44;
    var missing = function(m){ ctx.report("data", "[cards] " + m); };
    var unfit = [];
    this.cards = pl.map(function(o, i){
      var c = o.c, col = i % cols, row = Math.floor(i / cols);
      var x = col * (cw + gap), y = row * (ch + vgap);
      var tone = TONES.test(c.tone || "") ? c.tone : "term", hi = i === hl;
      var g = D.el("g", {opacity: 0, role: "listitem", "aria-label": [c.n || (P.nums ? String(i + 1) : ""), c.title, c.text || ""].filter(Boolean).join(" ")}, svg);
      var frame = D.el("rect", {x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 14, fill: hi ? "var(--emph-tint)" : "var(--term-tint)", stroke: hi ? "var(--emph)" : "var(--line)", "stroke-width": hi ? 4 : 2}, g);
      var body = D.el("g", {}, g);
      var badge = c.n !== undefined ? String(c.n) : P.nums ? String(i + 1) : "";
      var cy = y + pad, textW = cw - 2 * pad, hx = x + pad, corner = null;
      if (wide){
        // 1 行目：番号・アイコン・見出し（左から）
        var lineH = Math.max(bd, isz * 0.8);
        if (badge){ self.badge(body, hx + bd / 2, cy + lineH / 2, badge, tone); hx += bd + 14; }
        if (c.icon){ self.icon(body, c.icon, hx, cy + lineH / 2 - isz * 0.4, isz * 0.8, tone, missing); hx += isz * 0.8 + 14; }
        var tw = wrap(c.title, x + cw - pad - hx, tsz, 2, self);
        tw.lines.forEach(function(s, j){ D.mtext(body, hx, cy + lineH / 2 + tsz * 0.36 + (j - (tw.lines.length - 1) / 2) * (tsz + 6), s, {"font-size": tsz, "font-weight": 700}); });
        if (tw.cut) unfit.push(i + 1 + " (title)");
        cy += Math.max(lineH, tw.lines.length * (tsz + 6)) + 16;
      } else {
        // 縦：番号は左上、アイコンは上の真ん中、その下に見出し（真ん中）
        corner = badge ? D.el("g", {}, body) : null;   // 番号は左上の角に固定（中身を縦の真ん中へ寄せても動かない）
        if (badge) self.badge(corner, x + pad + bd / 2, y + pad + bd / 2, badge, tone);
        if (c.icon){ self.icon(body, c.icon, x + cw / 2 - isz / 2, cy, isz, tone, missing); cy += isz + 14; }
        else if (badge) cy += bd + 8;
        var tw2 = wrap(c.title, textW, tsz, 2, self);
        tw2.lines.forEach(function(s){ cy += tsz; D.mtext(body, x + cw / 2, cy, s, {"text-anchor": "middle", "font-size": tsz, "font-weight": 700}); cy += 6; });
        if (tw2.cut) unfit.push(i + 1 + " (title)");
        cy += 12;
      }
      var end = cy - 12;
      if (c.text){
        var room = Math.max(0, Math.floor((y + ch - pad - cy + (lh - xsz)) / lh));
        var tx = wrap(c.text, textW, xsz, Math.max(1, room), self);
        var center = !wide && tx.lines.length === 1;
        tx.lines.forEach(function(s, j){ D.mtext(body, center ? x + cw / 2 : x + pad, cy + xsz + j * lh, s, center ? {"text-anchor": "middle", "font-size": xsz} : {"font-size": xsz}); });
        if (tx.cut || room < 1) unfit.push(String(i + 1));
        end = cy + xsz + (tx.lines.length - 1) * lh + 8;
      }
      // 高さが余るカード：中身（アイコン・見出し・説明）を縦の真ん中へ。上の余白は pad のまま、余りの半分だけ下げる（2.5.0）
      var spare = y + ch - pad - end;
      if (spare > 2){
        body.setAttribute("transform", "translate(0 " + (spare / 2).toFixed(1) + ")");
        if (!wide && corner) corner.setAttribute("transform", "translate(0 " + (-spare / 2).toFixed(1) + ")");
      }
      // 前のカードからの矢印（この カードと一緒に出る）
      var arrow = null;
      if (P.arrows && i > 0){
        var pc = (i - 1) % cols, pr = Math.floor((i - 1) / cols);
        var ax, ay, d, alen = 60;
        if (pr === row){ ax = pc * (cw + gap) + cw + gap / 2; ay = y + ch / 2; d = "M" + (ax - 10) + "," + (ay - 16) + "L" + (ax + 8) + "," + ay + "L" + (ax - 10) + "," + (ay + 16); }
        else {
          // 段が変わる（grid の 2→3、3→4）：前の段の最後のカードの下から出て、段の間を左へ、次の段の最初のカードへ下りる
          var bx = pc * (cw + gap) + cw / 2, ex = col * (cw + gap) + cw / 2, y0 = pr * (ch + vgap) + ch + 6, ym = y0 - 6 + vgap / 2, y1 = y - 6;
          d = "M" + bx + "," + y0 + "V" + ym + "H" + ex + "V" + y1 + "L" + (ex - 10) + "," + (y1 - 9) + "L" + ex + "," + y1 + "L" + (ex + 10) + "," + (y1 - 9);
          alen = (ym - y0) + Math.abs(bx - ex) + (y1 - ym) + 42;   // 1 本の道（破線で描くとき矢じりが最後に出る）
        }
        arrow = D.el("path", {d: d, fill: "none", stroke: "var(--muted)", "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0, "aria-hidden": "true"}, svg);
        arrow._len = alen;
        self.arrows.push(arrow);
      }
      return {o: o, g: g, body: body, frame: frame, arrow: arrow, per: 2 * (cw + ch)};
    });
    if (unfit.length) ctx.report("layout", "[cards] the text of card " + unfit.join(", ") + " does not fit; it is cut with …. Shorten it, or give the element more height");
  }
  badge(parent, cx, cy, s, tone){
    var D = base;
    D.el("circle", {cx: cx, cy: cy, r: 22, fill: "var(--" + tone + ")"}, parent);
    D.mtext(parent, cx, cy + 9, s, {"text-anchor": "middle", "font-size": 26, "font-weight": 700, fill: "var(--bg)"});
  }
  icon(parent, name, x, y, size, tone, missing){
    var wrapG = base.el("g", {style: "color:var(--" + tone + ");"}, parent);
    wrapG.appendChild(icons.svg(name, {x: x, y: y, size: size, missing: missing}));
  }
  duration(k){
    var P = this.props, d = 0, dr = this.variant === "draw" ? 0.4 : 0;
    this.plan().forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + dr + P.dur); });
    return d;
  }
  cues(k){
    var c = [];
    this.plan().forEach(function(o){ if (o.step === k && o.at > 0) c.push(o.at); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var P = this.props, D = base, vr = this.variant;
    // 先の段階を薄く見せる表示（授業の表示）：後の段階のカードを最後の形で、テーマの --preview-opacity の濃さに
    var preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 1;
    this.cards.forEach(function(o){
      var s = o.o.step, at = o.o.at, ahead = preview && s > k;
      var tt = s < k || ahead ? Infinity : s > k ? -1 : t;   // このカードの段階の中の時刻（-1 = まだ）
      var dr = vr === "draw" ? 0.4 : 0;
      var e = tt < 0 ? 0 : D.prog(tt, at + dr, P.dur);
      if (vr === "draw"){
        // 枠を描いてから中身
        var f = tt < 0 ? 0 : D.prog(tt, at, dr + P.dur * 0.3);
        o.g.setAttribute("opacity", ahead ? PV.toFixed(3) : tt < 0 ? "0" : "1");
        o.frame.setAttribute("stroke-dasharray", f >= 1 ? "" : (o.per * f).toFixed(1) + " " + o.per.toFixed(1));
        o.frame.setAttribute("fill-opacity", f >= 1 ? "1" : "0");
        o.body.setAttribute("opacity", e.toFixed(3));
      } else {
        o.g.setAttribute("opacity", ahead ? PV.toFixed(3) : e.toFixed(3));
        o.g.setAttribute("transform", vr === "rise" && e < 1 ? "translate(0 " + ((1 - e) * 16).toFixed(2) + ")" : "");
      }
      if (o.arrow){
        var a = tt < 0 ? 0 : D.prog(tt, at, vr === "draw" ? dr : P.dur * 0.6);
        o.arrow.setAttribute("opacity", ahead ? PV.toFixed(3) : vr === "draw" ? (a > 0 ? "1" : "0") : a.toFixed(3));
        o.arrow.setAttribute("stroke-dasharray", vr === "draw" && a < 1 ? (o.arrow._len * a).toFixed(1) + " " + o.arrow._len.toFixed(1) : "");
      }
    });
  }
};
});
