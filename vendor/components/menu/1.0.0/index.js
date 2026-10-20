// m-menu：スライドへのリンクの札を格子に並べる（目次・単元の選び方・「どこから見るか」）
// <m-menu cols="3">
//   <a href="#s-njd4kp" data-icon="一" data-sub="孟浩然">春暁</a>      ← スライドへ（その段階 0）
//   <a href="#s-uhqygr:2" data-sub="杜甫（読む順から）">春望</a>       ← スライドの段階へ（#<id>:<段階の鍵>）
//   <a href="lesson2.ega.html" data-sub="次の課">返り点の練習</a>       ← ほかのファイル：ふつうのリンク
// </m-menu>
// 札はふつうの <a href>（format spec §9.1A：スクリプトのないリンクで、Core の文書に入れてよい）。部品は見た目を整えるだけで、
// 押したときの動き（発表では最終状態へ、自動再生中はそこから続ける、「戻る」）は実行系（kit/deck.js）が受け持つ。
// 段階：per-step="n" なら札が n 枚ずつ段階ごとに出る（data-from から）。0（既定）なら初めから全部（段階を使わない）。
// 「見た」の印：このセッションで札の行き先のスライドを開いたら、札の右上に印（保存しない。動画では付けない、印刷に出ない）。
// 印は発表の操作の側の表示で、DECK.seek(i, k, t) の外（m-kobun の札と同じ扱い）。visited="false" で付けない
// 大きさ：札の高さの下限は --mm-h（既定 104px）、間は --mm-gap。CSS の transition は使わない（実時間で動くので、画面が (k, t) で決まらなくなる）
(function(){
"use strict";
var D = window.DECK;
var CSS =
  "m-menu{display:grid;gap:var(--mm-gap,18px);grid-template-columns:repeat(var(--mm-cols,3),minmax(0,1fr));grid-auto-rows:minmax(var(--mm-h,104px),auto);align-content:start}" +
  "m-menu>a{position:relative;display:flex;align-items:center;gap:18px;padding:14px 22px;box-sizing:border-box;" +
  "border:2px solid var(--line);border-radius:14px;background:var(--bg);color:var(--fg);text-decoration:none;cursor:pointer}" +
  "m-menu>a:hover{border-color:var(--term);box-shadow:0 3px 14px color-mix(in srgb,var(--term) 18%,transparent)}" +
  "m-menu>a:focus{outline:none}m-menu>a:focus-visible{outline:3px solid var(--term);outline-offset:3px}" +
  "m-menu .mm-icon{flex:none;display:grid;place-items:center;width:1.9em;height:1.9em;border-radius:50%;background:var(--term);color:var(--bg);font-weight:700;line-height:1}" +
  "m-menu .mm-text{display:flex;flex-direction:column;gap:4px;min-width:0}" +
  "m-menu .mm-title{font-weight:700;line-height:1.25}" +
  "m-menu .mm-sub{font-size:max(27px,.8em);line-height:1.3;color:var(--muted)}" +
  "m-menu .mm-ext{position:absolute;right:12px;bottom:10px;width:20px;height:20px;color:var(--muted)}" +
  "m-menu .mm-seen{position:absolute;right:10px;top:10px;display:none;width:26px;height:26px;border-radius:50%;background:var(--muted);color:var(--bg)}" +
  "m-menu>a.mm-visited{border-color:color-mix(in srgb,var(--muted) 55%,var(--line))}" +
  "m-menu>a.mm-visited .mm-seen{display:block}" +
  "m-menu svg{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
  ".printing m-menu .mm-seen{display:none!important}@media print{m-menu .mm-seen{display:none!important}}" +
  ".mm-sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}";
var CHECK = '<svg class="mm-seen" viewBox="0 0 26 26" aria-hidden="true"><path d="M7.5 13.5l3.6 3.6 7.4-8"/></svg>';
var EXT = '<svg class="mm-ext" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8"/></svg>';
function cards(el){ return [].filter.call(el.children, function(x){ return x.localName === "a" && x.hasAttribute("href"); }); }

D.define("m-menu", class extends D.MotionElement {
  // データの形（kit/shape.js）：JSON ではなく、子のリンク <a href="#<スライドの id>">題</a>
  static shape = {links: true, example: '<a href="#s-abc123" data-sub="副題">題</a>'};
  static props = {
    cols:       {type: "number", default: 0, doc: "列の数（0 なら札の数から：3 枚までは 1 行、4 枚は 2 列、それより多ければ 3 列）"},
    "per-step": {type: "number", default: 0, doc: "1 段階に出す札の数（0 なら初めから全部出し、段階を使わない）"},
    size:       {type: "number", default: 34, doc: "札の題の字の大きさ（px）。副題はその 0.8 倍（本文の下限の 27px より小さくしない）"},
    fade:       {type: "number", default: 0.4, doc: "札が出る秒数"},
    stagger:    {type: "number", default: 0.12, doc: "同じ段階の札どうしの出るずれ（秒）"},
    visited:    {type: "bool", default: true, doc: "このセッションで行き先のスライドを開いた札に「見た」の印を付ける"},
  };
  get steps(){
    var a = this.getAttribute("steps");
    if (a !== null && /^\d+$/.test(a.trim())) return +a;
    var per = +this.getAttribute("per-step") || 0;
    return per > 0 ? Math.ceil(cards(this).length / per) : 0;
  }
  mount(ctx){
    var P = this.props, self = this, list = cards(this), n = list.length;
    if (!document.getElementById("m-menu-css")){ var st = document.createElement("style"); st.id = "m-menu-css"; st.textContent = CSS; document.head.appendChild(st); }
    var cols = P.cols > 0 ? P.cols : n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
    this.style.setProperty("--mm-cols", cols);
    this.style.fontSize = P.size + "px";
    var per = P["per-step"] > 0 ? P["per-step"] : 0;
    this.cards = list.map(function(a, j){
      // 書いた中身（文字・<b> など）を題にし、data-icon と data-sub から丸の字と副題を足す（リンクはそのまま）
      var title = document.createElement("span"); title.className = "mm-title";
      while (a.firstChild) title.appendChild(a.firstChild);
      var text = document.createElement("span"); text.className = "mm-text"; text.appendChild(title);
      var sub = a.getAttribute("data-sub");
      if (sub){ var sp = document.createElement("span"); sp.className = "mm-sub"; sp.textContent = sub; text.appendChild(sp); }
      var icon = a.getAttribute("data-icon");
      if (icon){ var ic = document.createElement("span"); ic.className = "mm-icon"; ic.setAttribute("aria-hidden", "true"); ic.textContent = icon; a.appendChild(ic); }
      a.appendChild(text);
      var href = a.getAttribute("href"), inDoc = href.charAt(0) === "#";
      a.insertAdjacentHTML("beforeend", CHECK + (inDoc ? "" : EXT));
      var sr = document.createElement("span"); sr.className = "mm-sr"; a.appendChild(sr);
      return {a: a, sr: sr, frag: inDoc ? href.slice(1) : null, ext: !inDoc, step: per ? Math.floor(j / per) + 1 : 0, at: per ? (j % per) * P.stagger : 0};
    });
    this.visitedOn = P.visited && ctx.mode !== "video";
    if (this.visitedOn){
      var upd = function(){ self.markVisited(); };
      document.addEventListener("deck:pos", upd);
      upd();
    }
  }
  // 「見た」の印（発表の操作の側の表示。DECK.seek の外）
  markVisited(){
    var ja = D.ja !== false;
    this.cards.forEach(function(c){
      var v = false;
      if (c.frag !== null && D.resolveFragment && D.visited){ var r = D.resolveFragment(c.frag); v = !r.error && D.visited(r.i); }
      c.a.classList.toggle("mm-visited", v);
      c.sr.textContent = (v ? (ja ? "（見た）" : " (visited)") : "") + (c.ext ? (ja ? "（別のファイル）" : " (another file)") : "");
    });
  }
  duration(k){
    var d = 0, F = this.props.fade;
    this.cards.forEach(function(c){ if (c.step === k) d = Math.max(d, c.at + F); });
    return d;
  }
  render(k, t, ctx){
    var F = this.props.fade, lecture = ctx && ctx.mode === "lecture";
    this.cards.forEach(function(c){
      var p = c.step < k ? 1 : c.step > k ? 0 : D.prog(t, c.at, F);
      if (lecture && p < 1) p = Math.max(p, c.step > k ? 0.28 : p);
      c.a.style.opacity = p.toFixed(3);
      c.a.style.transform = p < 1 && !lecture ? "translateY(" + ((1 - p) * 14).toFixed(2) + "px)" : "";
      // 見えていない札は押せない・選べない・読み上げない
      var off = p <= 0;
      c.a.style.pointerEvents = off ? "none" : "";
      if (off){ c.a.setAttribute("tabindex", "-1"); c.a.setAttribute("aria-hidden", "true"); }
      else { c.a.removeAttribute("tabindex"); c.a.removeAttribute("aria-hidden"); }
    });
  }
});
})();
