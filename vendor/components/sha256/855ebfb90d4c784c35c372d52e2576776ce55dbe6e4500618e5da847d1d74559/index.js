// m-kanbun：白文に返り点・送り仮名を付け、訓読の順に読み、書き下し文にする（縦書き）
// <m-kanbun style="height:440px">
//   春眠不{=ず}レ覚(エ)レ暁(ヲ)
//   処処聞(ク)[二]啼鳥(ヲ)[一]
// </m-kanbun>
// 1 行が 1 列（句）。行の中の空白は読まない。字の後ろに付けるもの（順は問わない）：
//   (送り仮名)   [返り点]（レ・一二三四五・上中下・甲乙丙丁・天地人、一レ・上レ・甲レ・天レ）。レ点だけは [ ] なしの「レ」でもよい
//   {振り仮名}   {=かな}（書き下し文で平仮名にする字：不{=ず}、也{=なり}）   {-}（置き字：読まない）
//   (右|二度目)  再読文字：右の送り仮名と二度目の読み（未(ダ|ず)、将(ニ|ス)）。二度目の読みの片仮名は左の送り仮名として出す
//   字-字        竪点（続けて読む熟語。返り点はまとまり全体に効く）    、。        句読点（白文では出さない）
// 段階（phases の順。既定は kunten order kaki）：段階 0 は白文 → kunten 訓点（返り点・送り仮名）→ order 読む順（目が字を順にたどり、
// 返り点で上へ戻るところに弧を描く）→ kaki 書き下し文（左に縦書きで）。読む順の計算は kanbun-core の order（試験は tools/test-kokugo.mjs）
// order は既定（order-by="col"）で列（句）ごとに 1 段階：読む順の字を、字の列が変わるところで切る。order-by="all" で全体を 1 段階（v1.3.0 まで）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・prog・lerp・previewOpacity と、読み取り・訓読の順の kanbun-core を使い、
// プレイヤーのグローバルは使わない。書き方の誤りは ctx.report("data", "[kanbun] …")、要素に収まらないときは
// ctx.report("size", "[kanbun] …") で知らせる（1.x の console.warn("m-kanbun: …") の代わり）
egatariParts.define({name: "kanbun", version: "2.0.0", requires: {base: "1.0.0", "kanbun-core": "1.0.0"}, element: "m-kanbun"}, function(deps){
"use strict";
var base = deps.base;
var D = base;

// ---------------------------------------------------------------- 読み取りと訓読の順（kanbun-core）
var K = deps["kanbun-core"];
var parse = K.parse, order = K.order, charEvents = K.charEvents, kakikudashi = K.kakikudashi, stepGroups = K.stepGroups;
var plain = function(line){ return line.map(function(s){ return s.t; }).join(""); };

// ---------------------------------------------------------------- 部品
var PH = ["kunten", "order", "kaki"];
// 長い送り仮名を詰める：fit は自然の長さ（字数 × 字の大きさ）に対する割合。まず字間を詰め（1 字につき字の大きさの 0.12 まで）、
// 残りを縦に縮める（transform。字の大きさ・字の幅は変えない）。OK_MIN より詰めない（それより長ければ次の字を下げる）
var OK_MIN = 0.78, OK_TRACK = 0.12, GAP_OK = 8, OK_DELAY = 0.36;
// 要素に収めるときの字の大きさの下限（px）。振り仮名・送り仮名・返り点は 24px のままなので、これより小さいと
// 返り点が隣の列の送り仮名に 4px より近づく（列の間 1.3 字 = 返り点と送り仮名 2 つ分の 48px ＋ 3px ＋ 4px）
var FIT_MIN = 42;
// 高さは要素を FIT_SLACK px まで超えてよい（最後の仮名の字の枠の下の余白。見本の『史記』は size=56 で 4.4px 超えていて、これまでどおりに描く）
var FIT_SLACK = 6;
function okSquash(n, F, fit){
  if (!(fit < 0.999) || !n) return "";
  var ls = Math.max(-OK_TRACK * F, (fit - 1) * F), sy = fit * F / (F + ls);
  return ";letter-spacing:" + ls.toFixed(2) + "px" + (sy < 0.999 ? ";transform:scaleY(" + sy.toFixed(3) + ");transform-origin:50% 0" : "");
}
return class extends base.MotionElement {
  static partName = "kanbun";   // the registry name (define meta name), for report prefixes
  // データの形（kit/shape.js）：JSON ではなく、要素の中に 1 行 1 句の字（送り仮名 (…)・返り点 […]）
  static shape = {text: true, example: "学(ビテ)而{-}時(ニ)習(フ)[レ]之(ヲ)"};
  static props = {
    size:   {type: "number", default: 60, doc: "漢字の大きさ（px）。送り仮名・返り点はその 0.42 倍（24px より小さくしない）"},
    slot:   {type: "number", default: 0.55, doc: "読む順で 1 字にかける秒数"},
    phases: {type: "string", default: "kunten order kaki", doc: "段階の並び（kunten 訓点・order 読む順・kaki 書き下し文から選ぶ）"},
    kaki:   {type: "number", default: 36, doc: "書き下し文の字の大きさ（px）"},
    nums:   {type: "bool", default: true, doc: "読む順の番号を字の左上に出す"},
    "order-by": {type: "string", default: "col", doc: "読む順の段階の分け方：col は列（句）ごとに 1 段階、all は読む順の全体で 1 段階（v1.3.0 まで）"},
  };
  get phaseList(){
    var a = String(this.props.phases || "").split(/[\s,]+/).filter(function(x){ return PH.indexOf(x) >= 0; });
    return a.length ? a : PH.slice();
  }
  // 読み取りと読む順（段階の数を決めるので mount の前にも読む）。groups：読む順の段階ごとの字の事柄の範囲（stepGroups）
  get kd(){
    if (!this._kd){
      var p = parse(this._src !== undefined ? this._src : this.textContent), o = order(p.chars), ce = charEvents(o);
      this._kd = {p: p, o: o, ce: ce, groups: stepGroups(p.chars, ce, this.props["order-by"])};
    }
    return this._kd;
  }
  // 段階の並び：phases の各段階。order は groups の数だけ（{name, g}）
  get stepList(){
    var G = this.kd.groups;
    return this.phaseList.reduce(function(a, name){ return a.concat(name === "order" ? G.map(function(g){ return {name: name, g: g}; }) : [{name: name}]); }, []);
  }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.stepList.length; }
  // 段階 name の（最初の）番号（1 から）。phases になければ 0
  phaseStep(name){ var L = this.stepList; for (var i = 0; i < L.length; i++) if (L[i].name === name) return i + 1; return 0; }
  mount(ctx){
    var self = this, P = this.props;
    this._src = this.textContent;
    var kd = this.kd, p = kd.p, o = kd.o, kaki = kakikudashi(p.chars, o);
    p.warnings.concat(o.warnings).forEach(function(w){ ctx.report("data", "[kanbun] " + w); });
    this.k = {p: p, o: o, ce: kd.ce, kaki: kaki, groups: kd.groups};
    this.textContent = "";
    this.classList.add("plot", "kanbun");
    this.style.display = "block"; this.style.position = "relative";
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", p.chars.map(function(c){ return c.ch; }).join("") + "。書き下し文：" + kaki.map(plain).join(""));
    // ---- 配置：列は右から左へ。列の中は 左の欄（返り点・再読の左の送り仮名）・漢字・右の欄（振り仮名・送り仮名）
    // lay(S)：字の大きさ S で並べる（字の位置を p.chars に書き、寸法を返す）。B は字の下端（振り仮名・送り仮名・返り点・句読点を含む）
    var S, F, L, R, G, PITCH, cols, H, XR;
    var lay = function(S0){
      S = S0; F = Math.max(24, Math.round(S * 0.42));
      L = Math.round(S * 0.5); R = Math.round(S * 0.5); G = Math.round(S * 0.3); PITCH = L + S + R + G;
      cols = []; H = 0;
      p.chars.forEach(function(c, n){
        var col = cols[c.col] = cols[c.col] || {y: 0, rEnd: 0, lEnd: 0, list: [], prevOk: null};
        // 前の字の右と左の欄の終わりにぶつからないところまで下げる
        var rStart = c.ruby ? 0 : S * 0.52, lStart = S * 0.5;
        // 番号（左上）を出すときは、前の字の左の欄（一レ点・再読文字の左の送り仮名）の下から始める
        var y = Math.max(col.y, col.lEnd - (P.nums ? 0 : lStart) + 2);
        // 右の欄：前の字の送り仮名は、この字を下げずに収まるように詰める（印刷の組み方：字間を詰め、それでも長ければ縦に縮める。
        // 字の大きさは変えない）。この字に振り仮名も送り仮名もなければ、この字の右の欄の 0.8 まではみ出してよい。
        // 振り仮名は前の字の送り仮名から少し離す（続けて読まないように）。縮めきっても入らないときだけ下げる
        var pk = col.prevOk;
        if (pk){
          // 次の字の送り仮名は下で OK_DELAY まで下げうるので、ここではそれを見込む（足りなければ下で後ろの字をまとめて下げる）
          var room = c.ruby ? -10 : c.okuri ? rStart - GAP_OK + S * OK_DELAY : S * 0.8;
          var need = pk.len * OK_MIN;
          y = Math.max(y, pk.top + need - room);
          pk.c.okFit = Math.min(1, (y + room - pk.top) / pk.len);
        } else y = Math.max(y, col.rEnd - rStart + (c.ruby ? 10 : 6));
        c.y = y; c.n = n;
        var rr = y + (c.ruby ? 0 : S * 0.52);
        if (c.ruby){ c.rubyY = y + Math.max(0, (S * 0.52 - Array.from(c.ruby).length * F) / 2); rr = Math.max(y + S * 0.52, c.rubyY + Array.from(c.ruby).length * F); }
        c.okY = rr; c.okFit = 1;
        var okLen = Array.from(c.okuri).length * F;
        col.rEnd = rr + okLen; col.prevOk = okLen ? {c: c, top: rr, len: okLen} : null;
        var ll = y + S * 0.5, leftKana = c.second ? (c.second.match(/[ァ-ヶー]/g) || []).join("") : "";
        c.leftKana = leftKana; c.lkY = ll; ll += Array.from(leftKana).length * F;
        // 返り点は左下：字の下端をまたぐところ（天を字の 0.72 の高さに）
        c.kaeriY = Math.max(ll, y + S * 0.72); c.kaeriN = (c.mark ? 1 : 0) + (c.re ? 1 : 0);
        col.lEnd = c.kaeriN ? c.kaeriY + c.kaeriN * F * 0.92 : ll;
        col.y = y + S * 1.2 + (c.punct ? S * 0.42 : 0) + (c.join ? S * 0.22 : 0);
        col.list.push(n);
        H = Math.max(H, col.y, col.rEnd, col.lEnd);
      });
      // 右の欄の送り仮名を列ごとに置き直す（字の位置は上で決まったまま）。送り仮名は字の下半分から始め、長ければ詰める。
      // 次の字の送り仮名がその次の字までに楽に収まるなら、次の字の送り仮名を字の 0.36（OK_DELAY）まで下げて、前の長い送り仮名に場所を譲る
      var okLen = function(c){ return Array.from(c.okuri).length * F; };
      cols.forEach(function(col){
        var L2 = col.list.map(function(n){ return p.chars[n]; }), prevEnd = -Infinity;
        // 字 i の送り仮名の終わりの上限（次の字の振り仮名・送り仮名・字そのもの）。delay：次の字の送り仮名を下げる量
        var limitOf = function(i, delay){
          var d = L2[i + 1];
          if (!d) return Infinity;
          return d.ruby ? d.rubyY - 10 : d.okuri ? d.okY + delay - GAP_OK : d.y + S * 0.8;
        };
        L2.forEach(function(c, i){
          if (!c.okuri) return;
          var top = Math.max(c.okY, prevEnd + GAP_OK), len = okLen(c), d = L2[i + 1], delay = 0;
          if (d && d.okuri && !d.ruby){
            var slack = limitOf(i + 1, 0) - (d.okY + okLen(d));
            delay = Math.max(0, Math.min(S * OK_DELAY, slack, top + len + GAP_OK - d.okY));
          }
          var lim = limitOf(i, delay);
          // 縮めきっても入らなければ、この列の後ろの字をまとめて下げる（字どうしの間は変えない）
          var short = top + len * OK_MIN - lim;
          if (short > 0) L2.slice(i + 1).forEach(function(e){
            e.y += short; e.okY += short; e.lkY += short; e.kaeriY += short; if (e.ruby) e.rubyY += short;
            H = Math.max(H, e.y + S * 1.2 + (e.punct ? S * 0.42 : 0), e.kaeriY + e.kaeriN * F * 0.92, e.lkY + Array.from(e.leftKana).length * F);
          });
          if (short > 0) lim += short;
          c.okY = top; c.okFit = Math.max(OK_MIN, Math.min(1, (lim - top) / len));
          prevEnd = top + len * c.okFit;
          H = Math.max(H, prevEnd);
        });
      });
      var B = 0;
      p.chars.forEach(function(c){
        B = Math.max(B, c.y + S, c.okY + Array.from(c.okuri).length * F * c.okFit, c.lkY + Array.from(c.leftKana).length * F);
        if (c.ruby) B = Math.max(B, c.rubyY + Array.from(c.ruby).length * F);
        if (c.kaeriN) B = Math.max(B, c.kaeriY + (c.kaeriN - 1) * F * 0.92 + F);
        if (c.punct) B = Math.max(B, c.y + S * 1.02 + Math.round(S * 0.6));
        if (c.join) B = Math.max(B, c.y + S * 1.06 + Math.round(S * 0.24));
      });
      // 幅：列と、書き下し文との間。字が小さいと右端の列の送り仮名（24px）が右の欄（字の 0.5）からはみ出すので、その分（XR）も
      XR = Math.max(0, F + 1 - R);
      return {S: S, B: B, W: cols.length * PITCH - G + Math.round(S * 0.9) + XR};
    };
    // 要素の高さと幅に収める：字の大きさ size で収まらなければ、字の大きさと字の送りを一緒に 1px ずつ下げる（FIT_MIN まで）。
    // 収まるときは size のまま（配置は今までと同じ）。幅は列と書き下し文（字の大きさによらない）の合計
    var KS = P.kaki, avH = this.clientHeight, HA0 = Math.max(KS * 4, avH), W = this.clientWidth || 1184;
    var kakiW = function(HA){
      var perCol = Math.max(1, Math.floor(HA / KS));
      return kaki.reduce(function(a, line){ return a + Math.max(1, Math.ceil(Array.from(plain(line)).length / perCol)); }, 0) * KS * 1.9;
    };
    var over = function(g){ return {h: avH ? g.B - FIT_SLACK - avH : 0, w: g.W + kakiW(avH ? HA0 : Math.max(KS * 4, H)) - W}; };
    var g = lay(P.size), o2 = over(g);
    while ((o2.h > 0.5 || o2.w > 0.5) && S > FIT_MIN){ g = lay(Math.max(FIT_MIN, Math.ceil(S) - 1)); o2 = over(g); }
    if (o2.h > 0.5 || o2.w > 0.5){
      var at = S < P.size ? "字を size=" + S + " まで小さくしても" : "size=" + S + " では";
      if (o2.h > 0.5) ctx.report("size", "[kanbun] " + at + "要素の高さ " + avH + "px に " + Math.ceil(g.B - avH) + "px 足りない（いちばん長い列 " + Math.ceil(g.B) + "px）。" +
        "高さを " + Math.ceil(g.B) + "px 以上にするか、1 行の字を減らす（長い文は句読点のところで行を分ける）");
      if (o2.w > 0.5) ctx.report("size", "[kanbun] " + at + "要素の幅 " + W + "px に " + Math.ceil(o2.w) + "px 足りない（" + cols.length + " 列と書き下し文）。" +
        "詩を分けて 2 枚にする（1 枚に 2 句など）");
    }
    var nc = cols.length, WK = nc * PITCH - G;
    // 書き下し文：部品の高さで折り返す。列の数は字数から見積もる（振り仮名は数えない）
    var HA = Math.max(KS * 4, avH || H), KW = kakiW(HA), GAP = Math.round(S * 0.9);
    var X0 = Math.max(0, Math.round((W - (WK + GAP + KW + XR)) / 2));
    this.geom = {S: S, F: F, L: L, PITCH: PITCH, WK: WK, H: H};
    var box = function(tag, cls, css, parent, text){
      var e = document.createElement(tag); e.className = cls; e.style.cssText = css; if (text !== undefined) e.textContent = text; (parent || self).appendChild(e); return e;
    };
    var kb = box("div", "kb", "position:absolute;top:0;left:" + (X0 + KW + GAP) + "px;width:" + WK + "px;height:" + Math.ceil(H) + "px;font-family:var(--font-mincho);color:var(--fg)");
    // 列 c の左端（kb の中の x）
    var colLeft = function(c){ return WK - (c + 1) * PITCH + G; };
    this.cells = p.chars.map(function(c){
      var x = colLeft(c.col) + L, e = {c: c, x: x, y: c.y};
      e.bg = box("div", "kb-bg", "position:absolute;left:" + (x - 3) + "px;top:" + (c.y - 3) + "px;width:" + (S + 6) + "px;height:" + (S + 6) + "px;border-radius:6px;background:var(--term-tint);opacity:0", kb);
      e.ch = box("span", "kb-ch", "position:absolute;left:" + x + "px;top:" + c.y + "px;width:" + S + "px;height:" + S + "px;font-size:" + S + "px;line-height:" + S + "px;text-align:center", kb, c.ch);
      var vt = "writing-mode:vertical-rl;text-orientation:upright;position:absolute;font-size:" + F + "px;line-height:" + F + "px;white-space:nowrap;opacity:0;";
      e.ann = [];
      // 右の欄：振り仮名（上）と送り仮名（下半分から）。左の欄：再読文字の二度目の片仮名、その下に返り点
      if (c.ruby) e.ann.push(box("span", "kb-ruby", vt + "left:" + (x + S + 1) + "px;top:" + c.rubyY + "px;color:var(--muted)", kb, c.ruby));
      if (c.okuri) e.ann.push(box("span", "kb-ok", vt + "left:" + (x + S + 1) + "px;top:" + c.okY + "px;color:var(--term)" + okSquash(Array.from(c.okuri).length, F, c.okFit), kb, c.okuri));
      if (c.leftKana) e.ann.push(box("span", "kb-ok kb-left", vt + "left:" + (x - F - 1) + "px;top:" + c.lkY + "px;color:var(--term)", kb, c.leftKana));
      e.kaeri = [];
      var ky = c.kaeriY, kx = x - F - 2;
      var mk = function(s){ var k = box("span", "kb-kaeri", "position:absolute;left:" + kx + "px;top:" + ky + "px;width:" + F + "px;font-size:" + F + "px;line-height:" + F + "px;text-align:center;color:var(--emph);font-weight:700;opacity:0", kb, s); e.kaeri.push(k); ky += F * 0.92; };
      if (c.mark) mk(c.mark);
      if (c.re) mk("レ");
      if (c.punct) e.punct = box("span", "kb-punct", "writing-mode:vertical-rl;position:absolute;left:" + (x + S * 0.2) + "px;top:" + (c.y + S * 1.02) + "px;font-size:" + Math.round(S * 0.6) + "px;line-height:" + Math.round(S * 0.6) + "px;opacity:0", kb, c.punct);
      if (c.join) e.join = box("span", "kb-join", "position:absolute;left:" + (x + S / 2 - 1.5) + "px;top:" + (c.y + S * 1.06) + "px;width:3px;height:" + Math.round(S * 0.24) + "px;background:var(--fg);opacity:0", kb);
      e.nums = [];
      return e;
    });
    // 読む順：字ごとの番号（左上。再読文字の二度目は右上、振り仮名があれば左上の番号の上）
    var ce = this.k.ce, NF = Math.max(24, Math.round(S * 0.4));
    ce.forEach(function(ev, m){
      var e = self.cells[ev.c], second = ev.kind === "second" && e.c.second !== null;
      // 右上の番号は、字が小さいとき（要素に収めたとき）に送り仮名と重ならないよう、送り仮名の上に上げる
      var nx = second && !e.c.ruby ? e.x + S + 1 : e.x - L, ny = second && e.c.ruby ? e.y - NF : second && e.c.okuri ? Math.min(e.y + 3, e.c.okY - NF - 1) : e.y + 3;
      // 二桁以上は箱（幅 L）に収まるよう字の大きさだけを下げる（数字 1 つの幅を 0.75em と見て 2 px の余白を残す）。一桁は従来のまま
      var nd = String(m + 1).length, NS = nd > 1 ? Math.floor(Math.min(NF, (L - 2) / (nd * 0.75)) * 2) / 2 : NF;
      var nb = box("span", "kb-num", "position:absolute;left:" + nx + "px;top:" + ny + "px;width:" + L + "px;font-family:var(--font-sans);font-size:" + NS + "px;line-height:" + NF + "px;text-align:center;font-weight:700;color:var(--emph);font-variant-numeric:tabular-nums;opacity:0", kb, String(m + 1));
      // 字の脇に添える小さい注記の印（Egatari Studio の品質チェックが字の大きさの最小を見ない。docs/contract.md §10）
      nb.setAttribute("data-annot", "");
      e.nums.push(nb); ev.num = nb;
    });
    // 目（今読んでいる字の枠）と、上へ戻るところの弧
    this.eye = box("div", "kb-eye", "position:absolute;left:0;top:0;width:" + (S + 10) + "px;height:" + (S + 10) + "px;border:3px solid var(--emph);border-radius:9px;opacity:0", kb);
    var svg = D.el("svg", {width: WK, height: Math.ceil(H), viewBox: "0 0 " + WK + " " + Math.ceil(H), style: "position:absolute;left:0;top:0;overflow:visible;pointer-events:none"}, kb);
    this.jumps = [];
    ce.forEach(function(ev, m){
      if (m === 0) return;
      var a = self.cells[ce[m - 1].c], b = self.cells[ev.c];
      // 同じ列の上の字へ戻るとき（または右の列へ戻るとき）に弧を描く
      var back = a.c.col === b.c.col ? b.c.n < a.c.n : b.c.col < a.c.col;
      if (!back) return;
      // 弧は左の欄（返り点・番号）の外を通す（2 次曲線の頂点は制御点までの半分）
      var x0 = a.x - 4, y0 = a.y + S / 2, x1 = b.x - 4, y1 = b.y + S / 2, cx = Math.min(x0, x1) - S * 1.3;
      if (a.c.col !== b.c.col){ x0 = a.x + S / 2; y0 = a.y - 4; x1 = b.x + S / 2; y1 = b.y - 4; cx = (x0 + x1) / 2; }
      var cy = a.c.col !== b.c.col ? Math.min(y0, y1) - S * 0.8 : (y0 + y1) / 2;
      var d = "M" + x0.toFixed(1) + "," + y0.toFixed(1) + "Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + x1.toFixed(1) + "," + y1.toFixed(1);
      var g = D.el("g", {opacity: 0}, svg);
      var path = D.el("path", {d: d, fill: "none", stroke: "var(--emph)", "stroke-width": 3, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1}, g);
      // 矢じり：終わりの点での向き（2 次曲線の終わりの接線は制御点 → 終点）
      var ang = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI;
      var head = D.el("path", {d: "M0,0L-13,-6L-13,6Z", fill: "var(--emph)", transform: "translate(" + x1.toFixed(1) + " " + y1.toFixed(1) + ") rotate(" + ang.toFixed(1) + ")", opacity: 0}, g);
      self.jumps.push({m: m, g: g, path: path, head: head});
    });
    // 書き下し文（縦書き、左に）
    var kk = box("div", "kb-kaki", "position:absolute;top:0;left:" + X0 + "px;width:" + Math.ceil(KW) + "px;height:" + Math.ceil(HA) + "px;writing-mode:vertical-rl;font-family:var(--font-mincho);font-size:" + KS + "px;line-height:1.9;color:var(--fg);line-break:strict");
    this.kakiLines = kaki.map(function(line){
      var d = box("div", "kb-kaki-line", "opacity:0", kk);
      line.forEach(function(s){
        if (s.rb){ var r = document.createElement("ruby"); r.textContent = s.t; var rt = document.createElement("rt"); rt.textContent = s.rb; r.appendChild(rt); d.appendChild(r); }
        else d.appendChild(document.createTextNode(s.t));
      });
      return d;
    });
  }
  duration(k){
    var st = this.stepList[k - 1], name = st && st.name;
    if (name === "kunten") return 0.9;
    if (name === "order") return (st.g.b - st.g.a) * this.props.slot + 0.3;
    if (name === "kaki") return (this.kakiLines ? this.kakiLines.length : 1) * 0.3 + 0.45;
    return 0;
  }
  // 読む順の段階：その段階の中で列が変わる字（order-by="all" では 2 列目からの各列の読み始め）の時刻。
  // order-by="col" では列が変わるところで段階が分かれるので、段階の中に合図はない
  cues(k){
    var st = this.stepList[k - 1];
    if (!st || st.name !== "order") return null;
    var ce = this.kd.ce, ch = this.kd.p.chars, slot = this.props.slot, a = st.g.a, out = [];
    for (var m = a + 1; m < st.g.b; m++) if (ch[ce[m].c].col !== ch[ce[m - 1].c].col) out.push(+((m - a) * slot).toFixed(4));
    return out.length ? out : null;
  }
  render(k, t, ctx){
    var self = this, S = this.geom.S, slot = this.props.slot;
    // 先の段階を薄く見せる表示（授業の表示）：後の段階の訓点・読む順の番号と弧・書き下し文を、最後の形のまま --preview-opacity の濃さで
    var preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0.45;
    // 段階 name の進み：まだなら -1、済んだら Infinity、今なら t。phases になければ、訓点は初めから済み、ほかは来ない
    var at = function(name){ var s = self.phaseStep(name); if (!s) return name === "kunten" ? Infinity : -1; return k > s ? Infinity : k < s ? -1 : t; };
    var pr = function(tt, a, d){ return tt < 0 ? 0 : D.prog(tt, a, d); };
    var tk = at("kunten"), tw = at("kaki");
    // 読む順の段階は groups の数だけ続く（first から last）。今の段階の範囲 [a, a + len) と、その中の時刻 to
    var first = this.phaseStep("order"), G = this.k.groups, last = first ? first + G.length - 1 : 0;
    var started = first > 0 && k >= first, done = started && k > last, a = 0, len = 0, to = -1;
    if (started && !done){ a = G[k - first].a; len = G[k - first].b - a; to = t; }
    var eK = pr(tk, 0, 0.4), eO = pr(tk, 0.3, 0.45), eP = pr(tk, 0.45, 0.3);
    if (preview && tk < 0) eK = eO = eP = PV;
    this.cells.forEach(function(e){
      e.kaeri.forEach(function(x){ x.style.opacity = eK.toFixed(3); });
      e.ann.forEach(function(x){ x.style.opacity = eO.toFixed(3); });
      if (e.punct) e.punct.style.opacity = eP.toFixed(3);
      if (e.join) e.join.style.opacity = eK.toFixed(3);
      e.bg.style.opacity = 0;
      // 置き字は読む順の段階から薄くする（読まない字）
      e.ch.style.color = e.c.oki && started ? "var(--muted)" : "";
    });
    // 読む順：事柄 m は m * slot 秒に始まる。今の事柄 j
    // 段階の終わりの 0.3 秒（tail）で、今の字の印（目の枠・朱の字）を消し、弧を読み終えた濃さにする：段階の長さの時点で最後の状態と同じ
    var ce = this.k.ce, n = ce.length, j = -1, tail = done ? 1 : to >= 0 ? pr(to - len * slot, 0, 0.25) : 0;
    if (done) j = n;
    else if (to >= 0) j = a + Math.max(0, Math.min(len - 1, Math.floor(to / slot)));
    // 事柄 m の始まりからの時刻
    var lt = function(m){ return to - (m - a) * slot; };
    var seen = {}, numFade = 1 - 0.6 * pr(tw, 0, 0.45);   // 書き下し文が出るときに番号を薄くする
    ce.forEach(function(ev, m){
      var e = self.cells[ev.c], v = m < j ? 1 : m === j ? pr(lt(m), 0.12 * slot, 0.3 * slot) : 0;
      if (v > 0) seen[ev.c] = Math.max(seen[ev.c] || 0, v);
      // 後の段階の事柄（読む順の段階の前、または今の段階より後）
      var later = preview && first > 0 && (!started || (!done && m >= a + len));
      ev.num.style.opacity = self.props.nums ? (later ? PV : v * numFade).toFixed(3) : 0;
    });
    Object.keys(seen).forEach(function(c){ self.cells[c].bg.style.opacity = (seen[c] * 0.9).toFixed(3); });
    var fade = 1 - pr(tw, 0, 0.45);   // 書き下し文が出るときに弧を薄くする
    this.jumps.forEach(function(J){
      if (preview && first > 0 && (!started || (!done && J.m >= a + len))){
        // 後の段階の弧：引き終えた形を、読み終えた弧の濃さ（0.55）のまま薄く
        J.path.setAttribute("stroke-dashoffset", "0.0000"); J.head.setAttribute("opacity", 1); J.g.setAttribute("opacity", (0.55 * PV).toFixed(3));
        return;
      }
      var d = J.m < j ? 1 : J.m === j ? pr(lt(J.m), 0, 0.35 * slot) : 0;
      J.path.setAttribute("stroke-dashoffset", (1 - d).toFixed(4));
      J.head.setAttribute("opacity", d >= 0.98 ? 1 : 0);
      J.g.setAttribute("opacity", d <= 0 ? 0 : ((J.m === j && !done ? 1 - 0.45 * tail : 0.55) * fade).toFixed(3));
    });
    // 目：前の字から今の字へ 0.35 slot で動く。読み終えたら消える
    if (j >= 0 && j < n && !done && tail < 1){
      var cur = this.cells[ce[j].c], prev = j > 0 ? this.cells[ce[j - 1].c] : cur;
      // 同じ列の中では滑らせ、列が変わるとき（次の句へ）は今の字で現れる
      var e2 = pr(lt(j), 0, 0.35 * slot), hop = prev.c.col !== cur.c.col;
      var x = hop ? cur.x : D.lerp(prev.x, cur.x, e2), y = hop ? cur.y : D.lerp(prev.y, cur.y, e2);
      this.eye.style.left = (x - 8).toFixed(2) + "px"; this.eye.style.top = (y - 8).toFixed(2) + "px";
      this.eye.style.opacity = ((j === 0 ? pr(to, 0, 0.15) : hop ? e2 : 1) * (1 - tail)).toFixed(3);
      cur.ch.style.color = tail > 0 ? "color-mix(in srgb, var(--emph) " + (100 * (1 - tail)).toFixed(1) + "%, var(--fg))" : "var(--emph)";
    } else this.eye.style.opacity = 0;
    // 書き下し文：行ごとに 0.3 秒ずつ遅らせて出す
    this.kakiLines.forEach(function(d, L){ d.style.opacity = (preview && tw < 0 && self.phaseStep("kaki") ? PV : pr(tw, L * 0.3, 0.45)).toFixed(3); });
  }
};
});
