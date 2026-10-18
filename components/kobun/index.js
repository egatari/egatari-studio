// m-kobun：古文の品詞分解（語をスラッシュで切り、品詞で色を分ける）を 1 文ずつ見せ、最後に現代語訳と並べる
// <m-kobun style="height:430px">
//   春[名]/は[係助]/あけぼの[名]。
//   = 春は明け方（がよい）。
//   紫だち[動・タ四・連用]/たる[助動・たり・存続・連体]/雲[名]/の[格助]/…
// </m-kobun>
// 1 行が 1 文（1 段階）。語は / で切り、語の後ろの [ ] に品詞と詳しいこと（・で区切る）を書く。[ ] の後ろの字（、。）は語に付けて出す。
// 「= …」の行は直前の文の現代語訳（最後の段階で、本文の下（縦書きでは左）に並べる）。{漢字|かな} は振り仮名。
// 助動詞は [助動・基本形・意味・活用形]：押す（タップする）と、その助動詞の活用表と意味を出す（部品の中の表から。読み込みはしない）。
// 押して出した札は発表の操作で、画面の決まり（DECK.seek(i, k, t)）の外：段階を動かす・もう一度押す・札を押すと消え、動画と印刷には出ない
(function(){
"use strict";
var D = window.DECK;

// ---------------------------------------------------------------- 品詞
// 品詞の頭の字 → [種類, 名前]。色は種類ごと（テーマの変数だけ）
var POS = [
  ["助動", "aux", "助動詞"], ["格助", "pt", "格助詞"], ["係助", "pt", "係助詞"], ["副助", "pt", "副助詞"], ["接助", "pt", "接続助詞"],
  ["終助", "pt", "終助詞"], ["間助", "pt", "間投助詞"], ["助", "pt", "助詞"], ["形動", "adj", "形容動詞"], ["形", "adj", "形容詞"],
  ["動", "verb", "動詞"], ["補動", "verb", "補助動詞"], ["名", "noun", "名詞"], ["代", "noun", "代名詞"], ["副", "etc", "副詞"],
  ["連体", "etc", "連体詞"], ["接", "etc", "接続詞"], ["感", "etc", "感動詞"], ["接頭", "etc", "接頭語"], ["接尾", "etc", "接尾語"]];
var COLOR = {noun: "var(--fg)", verb: "var(--term)", adj: "var(--accent2)", aux: "var(--emph)", pt: "var(--muted)", etc: "var(--fg)"};
function posOf(tag){ for (var i = 0; i < POS.length; i++) if (tag.indexOf(POS[i][0]) === 0) return {kind: POS[i][1], name: POS[i][2], short: POS[i][0]}; return {kind: "etc", name: tag, short: tag}; }

// ---------------------------------------------------------------- 文語の助動詞（活用・接続・意味）
// 活用は 未然・連用・終止・連体・已然・命令（○ は形がない、（ ）はまれな形）
var AUX = {
  "る":   {f: "れ れ る るる るれ れよ", type: "下二段型", conn: "未然形（四段・ナ変・ラ変）", mean: "受身・尊敬・自発・可能"},
  "らる": {f: "られ られ らる らるる らるれ られよ", type: "下二段型", conn: "未然形（四段・ナ変・ラ変以外）", mean: "受身・尊敬・自発・可能"},
  "す":   {f: "せ せ す する すれ せよ", type: "下二段型", conn: "未然形（四段・ナ変・ラ変）", mean: "使役・尊敬"},
  "さす": {f: "させ させ さす さする さすれ させよ", type: "下二段型", conn: "未然形（四段・ナ変・ラ変以外）", mean: "使役・尊敬"},
  "しむ": {f: "しめ しめ しむ しむる しむれ しめよ", type: "下二段型", conn: "未然形", mean: "使役・尊敬"},
  "ず":   {f: "ず・ざら ず・ざり ず ぬ・ざる ね・ざれ ざれ", type: "特殊型", conn: "未然形", mean: "打消"},
  "じ":   {f: "○ ○ じ じ じ ○", type: "無変化型", conn: "未然形", mean: "打消推量・打消意志"},
  "む":   {f: "（ま） ○ む（ん） む（ん） め ○", type: "四段型", conn: "未然形", mean: "推量・意志・適当・勧誘・仮定・婉曲"},
  "むず": {f: "○ ○ むず むずる むずれ ○", type: "サ変型", conn: "未然形", mean: "推量・意志・適当・勧誘・仮定・婉曲"},
  "まし": {f: "ましか・（ませ） ○ まし まし ましか ○", type: "特殊型", conn: "未然形", mean: "反実仮想・ためらいの意志・推量"},
  "べし": {f: "べから べく・べかり べし べき・べかる べけれ ○", type: "形容詞型（ク活用）", conn: "終止形（ラ変型には連体形）", mean: "推量・意志・可能・当然・命令・適当"},
  "まじ": {f: "まじから まじく・まじかり まじ まじき・まじかる まじけれ ○", type: "形容詞型（シク活用）", conn: "終止形（ラ変型には連体形）", mean: "打消推量・打消意志・不可能・打消当然・禁止・不適当"},
  "らむ": {f: "○ ○ らむ（らん） らむ（らん） らめ ○", type: "四段型", conn: "終止形（ラ変型には連体形）", mean: "現在推量・現在の原因推量・伝聞・婉曲"},
  "けむ": {f: "○ ○ けむ（けん） けむ（けん） けめ ○", type: "四段型", conn: "連用形", mean: "過去推量・過去の原因推量・過去の伝聞・婉曲"},
  "き":   {f: "（せ） ○ き し しか ○", type: "特殊型", conn: "連用形（カ変・サ変には未然形にも）", mean: "過去（自分が経験したこと）"},
  "けり": {f: "（けら） ○ けり ける けれ ○", type: "ラ変型", conn: "連用形", mean: "過去（伝え聞いたこと）・詠嘆"},
  "つ":   {f: "て て つ つる つれ てよ", type: "下二段型", conn: "連用形", mean: "完了・強意・並列"},
  "ぬ":   {f: "な に ぬ ぬる ぬれ ね", type: "ナ変型", conn: "連用形", mean: "完了・強意・並列"},
  "たり(完了)": {f: "たら たり たり たる たれ たれ", type: "ラ変型", conn: "連用形", mean: "完了・存続"},
  "り":   {f: "ら り り る れ れ", type: "ラ変型", conn: "サ変の未然形・四段の已然形", mean: "完了・存続"},
  "なり(断定)": {f: "なら なり・に なり なる なれ なれ", type: "形容動詞型（ナリ活用）", conn: "体言・連体形", mean: "断定・存在"},
  "なり(伝聞推定)": {f: "○ （なり） なり なる なれ ○", type: "ラ変型", conn: "終止形（ラ変型には連体形）", mean: "伝聞・推定"},
  "めり": {f: "○ （めり） めり める めれ ○", type: "ラ変型", conn: "終止形（ラ変型には連体形）", mean: "推定・婉曲"},
  "らし": {f: "○ ○ らし らし らし ○", type: "無変化型", conn: "終止形（ラ変型には連体形）", mean: "推定"},
  "たり(断定)": {f: "たら たり・と たり たる たれ たれ", type: "形容動詞型（タリ活用）", conn: "体言", mean: "断定"},
  "ごとし": {f: "○ ごとく ごとし ごとき ○ ○", type: "形容詞型（ク活用）", conn: "連体形・助詞「の」「が」", mean: "比況・例示"},
  "まほし": {f: "まほしから まほしく・まほしかり まほし まほしき・まほしかる まほしけれ ○", type: "形容詞型（シク活用）", conn: "未然形", mean: "希望"},
  "たし": {f: "たから たく・たかり たし たき・たかる たけれ ○", type: "形容詞型（ク活用）", conn: "連用形", mean: "希望"},
};
var FORMS = ["未然", "連用", "終止", "連体", "已然", "命令"];
// 基本形と意味から表の項目を選ぶ（なり・たりは意味で分ける）
function auxOf(base, mean){
  var b = String(base || "").replace(/[（(].*$/, "");
  if (AUX[base]) return {key: base, a: AUX[base]};
  if (b === "なり") return /伝聞|推定/.test(mean || "") ? {key: "なり(伝聞推定)", a: AUX["なり(伝聞推定)"]} : {key: "なり(断定)", a: AUX["なり(断定)"]};
  if (b === "たり") return /断定/.test(mean || "") ? {key: "たり(断定)", a: AUX["たり(断定)"]} : {key: "たり(完了)", a: AUX["たり(完了)"]};
  if (b === "ん") return {key: "む", a: AUX["む"]};
  if (b === "んず") return {key: "むず", a: AUX["むず"]};
  return AUX[b] ? {key: b, a: AUX[b]} : null;
}

// ---------------------------------------------------------------- 読み取り
// parse(文字列) → {lines: [{words: [{text: [{t, rb}], tail, tag, pos, info, aux}], yaku}], warnings}
function rubyText(s){
  var out = [], re = /\{([^|{}]*)\|([^{}]*)\}/g, last = 0, m;
  while ((m = re.exec(s))){ if (m.index > last) out.push({t: s.slice(last, m.index)}); out.push({t: m[1], rb: m[2]}); last = re.lastIndex; }
  if (last < s.length) out.push({t: s.slice(last)});
  return out;
}
function parse(src){
  var lines = [], warnings = [];
  String(src || "").split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean).forEach(function(l){
    if (/^[=＝]/.test(l)){
      if (!lines.length) warnings.push("現代語訳の前に本文がない：" + l);
      else lines[lines.length - 1].yaku = l.replace(/^[=＝]\s*/, "");
      return;
    }
    var words = l.split(/[/／]/).filter(function(w){ return w.trim() !== ""; }).map(function(w){
      var m = /^(.*?)(?:[[［]([^\]］]*)[\]］])?([^[\]［］]*)$/.exec(w.trim());
      var tag = m[2] ? m[2].trim() : "", parts = tag ? tag.split(/[・･]/) : [], pos = tag ? posOf(parts[0]) : null;
      var word = {text: rubyText(m[1]), tail: m[3] || "", tag: tag, pos: pos, info: parts.slice(1), aux: null};
      if (pos && pos.kind === "aux"){
        // [助動・基本形・意味・活用形]
        var x = auxOf(parts[1], parts[2]);
        if (!x) warnings.push("表にない助動詞「" + (parts[1] || "") + "」（" + w + "）");
        word.aux = {base: parts[1] || "", mean: parts[2] || "", form: parts[3] || "", entry: x};
      }
      return word;
    });
    lines.push({words: words, yaku: ""});
  });
  return {lines: lines, warnings: warnings};
}
D.kobun = {parse: parse, AUX: AUX, FORMS: FORMS, auxOf: auxOf, posOf: posOf};
if (!D.MotionElement) return;   // 試験（Node）では読み取りだけ

// ---------------------------------------------------------------- 部品
var CSS = [
  "m-kobun{display:block;position:relative;font-family:var(--font-mincho);color:var(--fg)}",
  "m-kobun .kb-text{position:absolute;inset:0;line-height:1.5}",
  "m-kobun.tate .kb-text{writing-mode:vertical-rl}",
  "m-kobun .kb-line{display:flex;flex-direction:column;margin:0 0 6px}",
  "m-kobun.tate .kb-line{margin:0 0 0 14px}",
  "m-kobun .kb-src{display:block}",
  "m-kobun .kb-w{display:inline-flex;flex-direction:column;align-items:center;vertical-align:top}",
  "m-kobun .kb-tag{font-size:24px;line-height:1.1;white-space:nowrap;font-family:var(--font-cap,var(--font-sans))}",
  // スラッシュ：横書きでは斜めの線、縦書きでは横の線（背景で描く）
  "m-kobun .kb-sep{display:inline-block;height:1.3em;vertical-align:top;background:linear-gradient(to bottom right,transparent calc(50% - 1.3px),var(--muted) calc(50% - 1.3px),var(--muted) calc(50% + 1.3px),transparent calc(50% + 1.3px))}",
  "m-kobun.tate .kb-sep{height:auto;width:1.1em;background:linear-gradient(var(--muted),var(--muted)) center/70% 2.5px no-repeat}",
  "m-kobun .kb-aux{cursor:pointer;border-radius:4px}",
  "m-kobun .kb-aux:focus-visible{outline:2px solid var(--emph);outline-offset:2px}",
  "m-kobun .kb-yaku{display:block;font-size:27px;line-height:1.5;color:var(--term);font-family:var(--font-cap,var(--font-sans))}",
  "m-kobun .kb-pop{position:absolute;z-index:5;writing-mode:horizontal-tb;background:var(--bg);border:2px solid var(--emph);border-radius:10px;" +
    "padding:10px 16px;box-shadow:0 4px 18px color-mix(in srgb,var(--fg) 22%,transparent);font-family:var(--font-cap,var(--font-sans));font-size:24px;line-height:1.35;color:var(--fg);display:none}",
  "m-kobun .kb-pop b{color:var(--emph)}",
  "m-kobun .kb-pop table{border-collapse:collapse;margin-top:6px;font-size:24px;width:auto}",
  "m-kobun .kb-pop th,m-kobun .kb-pop td{border:1px solid var(--line);padding:2px 8px;text-align:center;font-weight:400;color:var(--fg)}",
  "m-kobun .kb-pop td.on{background:var(--emph-tint);color:var(--emph);font-weight:700}",
  "@media print{m-kobun .kb-pop{display:none!important}}",
].join("\n");
D.define("m-kobun", class extends D.MotionElement {
  static props = {
    size: {type: "number", default: 34, doc: "本文の字の大きさ（px）"},
    tate: {type: "bool", default: false, doc: "縦書きにする（品詞は語の左、現代語訳は文の左に）"},
    yaku: {type: "bool", default: true, doc: "現代語訳（= の行）があれば、最後の段階で並べる"},
    fade: {type: "number", default: 0.6, doc: "1 文の品詞分解を出す秒数"},
    detail: {type: "bool", default: false, doc: "品詞の下に [ ] の中をすべて（活用の種類・活用形など）出す"},
  };
  get model(){ if (!this._m) this._m = parse(this._src !== undefined ? this._src : this.textContent); return this._m; }
  get hasYaku(){ return this.props.yaku && this.model.lines.some(function(l){ return l.yaku; }); }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.model.lines.length + (this.hasYaku ? 1 : 0); }
  mount(){
    var self = this, P = this.props;
    this._src = this.textContent;
    var m = this.model;
    m.warnings.forEach(function(w){ console.warn("m-kobun: " + w); });
    this.textContent = "";
    this.classList.add("plot");
    if (P.tate) this.classList.add("tate");
    if (!document.getElementById("m-kobun-css")){ var st = document.createElement("style"); st.id = "m-kobun-css"; st.textContent = CSS; document.head.appendChild(st); }
    var mk = function(tag, cls, parent, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; parent.appendChild(e); return e; };
    var box = mk("div", "kb-text", this);
    box.style.fontSize = P.size + "px";
    this.lines = m.lines.map(function(line, li){
      var L = {el: mk("div", "kb-line", box), words: [], seps: []};
      var src = mk("span", "kb-src", L.el);
      line.words.forEach(function(w, wi){
        if (wi > 0){
          // スラッシュ（背景で描く）。幅（縦書きでは高さ）は段階で 0 から広げる
          var sp = mk("span", "kb-sep", src);
          L.seps.push(sp);
        }
        var we = mk("span", "kb-w", src);
        var tx = mk("span", "kb-wt", we);
        w.text.forEach(function(s){
          if (s.rb){ var r = mk("ruby", "", tx, s.t); mk("rt", "", r, s.rb); }
          else tx.appendChild(document.createTextNode(s.t));
        });
        if (w.tail) tx.appendChild(document.createTextNode(w.tail));
        var tg = mk("span", "kb-tag", we, w.pos ? (P.detail ? w.tag : w.pos.short) :" ");
        var W = {el: we, tx: tx, tag: tg, w: w};
        if (w.aux && w.aux.entry){
          we.classList.add("kb-aux"); we.tabIndex = 0; we.setAttribute("role", "button");
          we.setAttribute("aria-label", plainText(w) + "：助動詞「" + w.aux.base + "」" + w.aux.mean + "・" + w.aux.form + "形（押すと活用表）");
          var open = function(e){ e.preventDefault(); e.stopPropagation(); self.toggle(li, wi); };
          we.addEventListener("click", open);
          we.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ open(e); } });
        }
        L.words.push(W);
      });
      if (line.yaku) L.yaku = mk("span", "kb-yaku", L.el, line.yaku);
      return L;
    });
    this.pop = mk("div", "kb-pop", this);
    this.pop.addEventListener("click", function(e){ e.stopPropagation(); self._open = null; self.redraw(); });
    this.setAttribute("aria-label", m.lines.map(function(l){ return l.words.map(plainText).join(""); }).join(""));
  }
  // 押した助動詞の札：開いている札と同じなら閉じる。今の段階で開いた札だけを出す
  toggle(li, wi){
    if (DECK.mode === "video") return;
    var o = this._open;
    this._open = o && o.li === li && o.wi === wi ? null : {li: li, wi: wi, k: this._k};
    this.redraw();
  }
  redraw(){ if (this._k !== undefined) this.render(this._k, this._t); }
  duration(k){
    var n = this.model.lines.length;
    if (k >= 1 && k <= n) return this.props.fade + 0.2;
    if (k === n + 1) return 0.6;
    return 0;
  }
  render(k, t){
    var self = this, P = this.props, n = this.model.lines.length, tate = P.tate;
    if (this._open && this._open.k !== k) this._open = null;   // 段階が動いたら札を閉じる
    this._k = k; this._t = t;
    this.lines.forEach(function(L, li){
      // 文 li の品詞分解は段階 li + 1 に出る
      var s = li + 1, e = k > s ? 1 : k < s ? 0 : D.prog(t, 0, P.fade);
      L.seps.forEach(function(sp){
        sp.style[tate ? "height" : "width"] = (e * 0.55).toFixed(3) + "em";
        sp.style.opacity = e.toFixed(3);
      });
      L.words.forEach(function(W){
        var col = W.w.pos ? COLOR[W.w.pos.kind] : "var(--fg)";
        W.tx.style.color = e > 0.5 ? col : "var(--fg)";
        W.tx.style.fontWeight = e > 0.5 && W.w.pos && W.w.pos.kind === "aux" ? 700 : 400;
        W.tag.style.color = col;
        W.tag.style.opacity = W.w.pos ? e.toFixed(3) : 0;
        W.el.style.background = W.w.aux && e > 0.5 ? "var(--emph-tint)" : "transparent";
      });
      if (L.yaku){ var y = self.hasYaku ? (k > n + 1 ? 1 : k < n + 1 ? 0 : D.prog(t, li * 0.12, 0.45)) : 0; L.yaku.style.opacity = y.toFixed(3); }
    });
    // 札
    var o = this._open;
    if (!o){ this.pop.style.display = "none"; return; }
    var W = this.lines[o.li].words[o.wi], a = W.w.aux, ent = a.entry;
    this.pop.textContent = "";
    var head = document.createElement("div");
    var b = document.createElement("b"); b.textContent = a.base; head.appendChild(b);
    head.appendChild(document.createTextNode("（助動詞・" + ent.a.type + "）　この文では " + a.mean + "・" + a.form + "形"));
    this.pop.appendChild(head);
    var row = function(label, text){ var d = document.createElement("div"); d.textContent = label + "：" + text; self.pop.appendChild(d); };
    row("接続", ent.a.conn); row("意味", ent.a.mean);
    var tb = document.createElement("table"), tr1 = document.createElement("tr"), tr2 = document.createElement("tr"), forms = ent.a.f.split(" ");
    FORMS.forEach(function(f, j){
      var th = document.createElement("th"); th.textContent = f; tr1.appendChild(th);
      var td = document.createElement("td"); td.textContent = forms[j] || "○"; if (a.form && a.form.indexOf(f) === 0) td.className = "on"; tr2.appendChild(td);
    });
    tb.appendChild(tr1); tb.appendChild(tr2); this.pop.appendChild(tb);
    this.pop.style.display = "block";
    // 語の近く（下か左）に置き、部品の外にはみ出さない
    var r = W.el.getBoundingClientRect(), R = this.getBoundingClientRect(), sc = R.width / (this.offsetWidth || 1) || 1;
    var x = (r.left - R.left) / sc, y = (r.bottom - R.top) / sc + 8, pw = this.pop.offsetWidth, ph = this.pop.offsetHeight;
    if (tate){ x = (r.left - R.left) / sc - pw - 10; y = (r.top - R.top) / sc; }
    // 横書きで下に入らなければ語の上へ
    if (!tate && y + ph > this.offsetHeight) y = (r.top - R.top) / sc - ph - 8;
    x = Math.max(0, Math.min(this.offsetWidth - pw, x)); y = Math.max(0, Math.min(Math.max(0, this.offsetHeight - ph), y));
    this.pop.style.left = x.toFixed(1) + "px"; this.pop.style.top = y.toFixed(1) + "px";
  }
});
function plainText(w){ return w.text.map(function(s){ return s.t; }).join("") + w.tail; }
})();
