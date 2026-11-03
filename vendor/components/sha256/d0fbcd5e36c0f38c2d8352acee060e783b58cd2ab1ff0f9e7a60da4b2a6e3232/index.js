// m-gendai：現代文の読解の図。傍線・二重傍線を引き、指示語から指す内容へ矢印を出し、段落を役割（主張・具体例・対比）の枠で囲んで線でつなぐ
// <m-gendai tate style="height:440px">
//   @具体例#p1>p3
//   駅までの道を、私は{地図アプリ|#app}に頼って歩く。…{それ|>app}を閉じると、…
//
//   @主張#p3
//   便利な道具は、私たちから=={迷う機会を奪う}==。…{迷うことこそが…営みなのである|_A}
// </m-gendai>
// 段落は空行で区切る。段落の頭の行「@役割#名前」で役割（主張・具体例・対比・反論・結論など、自由な言葉）と名前を付け、
// 「>名前」（その段落を支える・つながる。矢印）か「~名前」（対比。両向きの線）で別の段落とつなぐ。
// 本文の中：__語句__ 傍線、==語句== 二重傍線、{語句|しるし,…}（しるし：_A 傍線と記号 A、=B 二重傍線と記号 B、#名前 指す先、>名前 指示語）
// 段階（phases の順。中身のないものは飛ばす。既定は marks refs roles）：marks 傍線 → refs 指示語の矢印 → roles 段落の枠と線
// 線と枠は、字の位置を測って SVG で描く（部品の中の座標。描く度に測るので、呼び出しの順によらない）
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 書き方の誤りは ctx.report("data", "[gendai] …") で知らせる（1.x の console.warn("m-gendai: …") の代わり）。
// 読み取り（parse）は試験のために static testing に出す（ほかのパーツは読まない）
egatariParts.define({name: "gendai", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-gendai"}, function(deps){
"use strict";
var base = deps.base;
var D = base;

// ---------------------------------------------------------------- 読み取り
// parse(文字列) → {paras: [{role, id, to, rel, runs: [{t, line, label, id, ref}]}], warnings}
function parse(src){
  var paras = [], warnings = [], blocks = String(src || "").replace(/\r/g, "").split(/\n\s*\n/);
  blocks.forEach(function(b){
    var lines = b.split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    if (!lines.length) return;
    var p = {role: "", id: "", to: "", rel: "", runs: []};
    var m = /^@([^#>~\s]*)(?:#([^>~\s]+))?(?:([>~])(\S+))?\s*$/.exec(lines[0]);
    if (m){ p.role = m[1]; p.id = m[2] || ""; p.rel = m[3] || ""; p.to = m[4] || ""; lines.shift(); }
    p.runs = inline(lines.join(""), warnings);
    paras.push(p);
  });
  var ids = {};
  paras.forEach(function(p){ if (p.id) ids[p.id] = true; });
  paras.forEach(function(p){ if (p.to && !ids[p.to]) warnings.push("段落「" + p.to + "」がない（@" + p.role + "）"); });
  var anchors = {};
  paras.forEach(function(p){ p.runs.forEach(function(r){ if (r.id) anchors[r.id] = true; }); });
  paras.forEach(function(p){ p.runs.forEach(function(r){ if (r.ref && !anchors[r.ref]) warnings.push("指す先「#" + r.ref + "」がない（" + r.t + "）"); }); });
  return {paras: paras, warnings: warnings};
}
// 本文の中のしるし → 字の並び（runs）。run = {t, line: 0 | 1 | 2（傍線・二重傍線）, label, id, ref}
function inline(s, warnings){
  var runs = [], re = /__(.+?)__|==(.+?)==|\{([^{}|]+)\|([^{}]*)\}/g, last = 0, m;
  var plain = function(t){ if (t) runs.push({t: t, line: 0, label: "", id: "", ref: ""}); };
  while ((m = re.exec(s))){
    plain(s.slice(last, m.index)); last = re.lastIndex;
    if (m[1] !== undefined){ runs.push({t: m[1], line: 1, label: "", id: "", ref: ""}); continue; }
    if (m[2] !== undefined){ runs.push({t: m[2], line: 2, label: "", id: "", ref: ""}); continue; }
    var r = {t: m[3], line: 0, label: "", id: "", ref: ""};
    m[4].split(/[,，、]/).map(function(f){ return f.trim(); }).filter(Boolean).forEach(function(f){
      if (f[0] === "_"){ r.line = 1; r.label = f.slice(1); }
      else if (f[0] === "="){ r.line = 2; r.label = f.slice(1); }
      else if (f[0] === "#") r.id = f.slice(1);
      else if (f[0] === ">") r.ref = f.slice(1);
      else warnings.push("知らないしるし「" + f + "」（" + m[3] + "）");
    });
    runs.push(r);
  }
  plain(s.slice(last));
  // 残った { } __ ==：閉じていないか、入れ子にしたしるし（しるしは入れ子にできない。{語句|=,#名前} のように 1 つにまとめる）
  runs.forEach(function(r){ if (/[{}]|__|==/.test(r.t)) warnings.push("しるしの書き方が違う（閉じていない・入れ子）：" + r.t); });
  return runs;
}

// ---------------------------------------------------------------- 部品
var ROLE_COLOR = function(role){ return /主張|結論|筆者/.test(role) ? "var(--emph)" : /対比|反論|対立/.test(role) ? "var(--accent2)" : /具体|例/.test(role) ? "var(--term)" : "var(--muted)"; };
var PH = ["marks", "refs", "roles"];
// 枠をつなぐ線は札（枠の上の名前）から札へ、札と枠の外の通り道（縦書きは札の上、横書きは札の左）を通す。
// 通り道は線ごとに段（level）を分け、間の段落を越える線ほど外の段を通る。段の数だけ場所を空ける（線が札や枠に重ならないように）
var CHIP = 34;              // 札の高さ
var STUB = 22, STEP = 16;   // 札から 1 段目までの距離、段の間
var LH_TATE = 2.4;          // 縦書きの行の送り（傍線と記号 A の入る列の間を空ける）
return class extends base.MotionElement {
  static partName = "gendai";   // the registry name (define meta name), for report prefixes
  static testing = {parse: parse};   // for tools/test-kokugo.mjs only (no part reads it)
  // データの形（kit/shape.js）：JSON ではなく、要素の中に本文の字（段落は空行で区切る）
  static shape = {text: true, example: "@主張#p1\n便利な道具は、私たちから==迷う機会を奪う==。"};
  static props = {
    size:   {type: "number", default: 28, doc: "本文の字の大きさ（px）"},
    tate:   {type: "bool", default: false, doc: "縦書きにする（段落は右から左へ、枠をつなぐ線は上を通す）"},
    phases: {type: "string", default: "marks refs roles", doc: "段階の並び（marks 傍線・refs 指示語・roles 段落の枠から選ぶ。中身のないものは飛ばす）"},
    draw:   {type: "number", default: 0.7, doc: "線 1 本を引く秒数"},
  };
  get model(){ if (!this._m) this._m = parse(this._src !== undefined ? this._src : this.textContent); return this._m; }
  get phaseList(){
    var m = this.model, has = {
      marks: m.paras.some(function(p){ return p.runs.some(function(r){ return r.line; }); }),
      refs: m.paras.some(function(p){ return p.runs.some(function(r){ return r.ref; }); }),
      roles: m.paras.some(function(p){ return p.role; })};
    return String(this.props.phases || "").split(/[\s,]+/).filter(function(x){ return PH.indexOf(x) >= 0 && has[x]; });
  }
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.phaseList.length; }
  phaseStep(name){ return this.phaseList.indexOf(name) + 1; }
  mount(ctx){
    var self = this, P = this.props, tate = P.tate;
    this._src = this.textContent;
    var m = this.model;
    m.warnings.forEach(function(w){ ctx.report("data", "[gendai] " + w); });
    this.textContent = "";
    this.classList.add("plot");
    this.style.display = "block"; this.style.position = "relative";
    this.style.fontFamily = "var(--font-mincho)";
    var W =this.clientWidth || 1184, H = this.clientHeight || 440;
    var roles = m.paras.some(function(p){ return p.role; });
    // つなぐ線の段：つなぐ段落の間の短いものから順に、重なる線より 1 つ外の段へ
    var pIdx = {};
    m.paras.forEach(function(p, i){ if (p.id) pIdx[p.id] = i; });
    var spans = m.paras.map(function(p, i){ return p.to && pIdx[p.to] !== undefined ? {i: i, lo: Math.min(i, pIdx[p.to]), hi: Math.max(i, pIdx[p.to])} : null; }).filter(Boolean)
      .sort(function(a, b){ return (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo; });
    var levelOf = {}, placed = [], nLev = 0;
    spans.forEach(function(o){
      var lv = 1;
      placed.forEach(function(q){ if (q.lo < o.hi && o.lo < q.hi) lv = Math.max(lv, q.lv + 1); });
      o.lv = lv; placed.push(o); levelOf[o.i] = lv; nLev = Math.max(nLev, lv);
    });
    this.nLev = nLev;
    // 通り道と札の場所：縦書きは上に（札 + 段）、横書きは左に（段）と上に（札）
    var lane = nLev ? STUB + (nLev - 1) * STEP + 10 : 0;
    this.padTop = tate ? (roles ? CHIP + lane + 10 : 20) : (roles ? CHIP + 10 : 20);
    this.padLeft = tate ? 0 : (nLev ? lane - 2 : 4);
    // 重ね順：塗り（指す先の淡い色）→ 字 → 線・枠・矢印
    this.back = D.el("svg", {width: W, height: H, viewBox: "0 0 " + W + " " + H, style: "position:absolute;left:0;top:0;overflow:visible;pointer-events:none"}, this);
    var text = document.createElement("div");
    text.style.cssText = "position:absolute;inset:0;font-size:" + P.size + "px;line-height:" + (tate ? LH_TATE : 1.85) + ";padding-top:" + this.padTop + "px;" + (tate ? "writing-mode:vertical-rl;" : "padding-left:" + this.padLeft + "px;");
    this.appendChild(text);
    this.front = D.el("svg", {width: W, height: H, viewBox: "0 0 " + W + " " + H, style: "position:absolute;left:0;top:0;overflow:visible;pointer-events:none"}, this);
    this.text = text;
    var byId = {};
    this.paras = m.paras.map(function(p, pi){
      var d = document.createElement("div");
      // 枠の内側の余白と、段落の間（枠の名前の札が入る）
      // 横書きは次の段落の札が前の枠に掛からないように空ける
      d.style.cssText = "padding:10px 14px;text-indent:1em;" + (tate ? "margin:0 0 0 22px;" : "margin:0 0 " + (roles ? CHIP + 12 : 22) + "px 0;");
      text.appendChild(d);
      var P2 = {p: p, el: d, spans: []};
      p.runs.forEach(function(r){
        if (!r.line && !r.id && !r.ref){ d.appendChild(document.createTextNode(r.t)); return; }
        var s = document.createElement("span"); s.textContent = r.t; d.appendChild(s);
        P2.spans.push({r: r, el: s});
        if (r.id) byId[r.id] = s;
      });
      return P2;
    });
    this.byId = byId;
    // 傍線（引く順に）
    this.lines = [];
    this.paras.forEach(function(P2){ P2.spans.forEach(function(s){ if (s.r.line){
      var g = D.el("g", {}, self.front), o = {el: s.el, r: s.r, g: g, segs: [], lab: null};
      if (s.r.label) o.lab = D.el("text", {"font-size": 24, "font-weight": 700, fill: "var(--emph)", "text-anchor": "middle", opacity: 0}, g);
      if (o.lab) o.lab.textContent = s.r.label;
      self.lines.push(o);
    } }); });
    // 指示語 → 指す先
    this.refs = [];
    this.paras.forEach(function(P2){ P2.spans.forEach(function(s){ if (s.r.ref && byId[s.r.ref]){
      self.refs.push({from: s.el, to: byId[s.r.ref],
        fill: D.el("g", {opacity: 0}, self.back),
        box: D.el("g", {opacity: 0}, self.front),
        path: D.el("path", {fill: "none", stroke: "var(--emph)", "stroke-width": 3, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1}, self.front),
        head: D.el("path", {d: "M0,0L-14,-7L-14,7Z", fill: "var(--emph)", opacity: 0}, self.front)});
    } }); });
    // 段落の枠・札・つなぐ線
    var pById = {};
    this.paras.forEach(function(P2){ if (P2.p.id) pById[P2.p.id] = P2; });
    this.boxes = this.paras.filter(function(P2){ return P2.p.role; }).map(function(P2){
      var c = ROLE_COLOR(P2.p.role);
      var rect = D.el("rect", {fill: "none", stroke: c, "stroke-width": 2.5, rx: 10, pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1}, self.front);
      var chip = D.el("g", {opacity: 0}, self.front);
      var cr = D.el("rect", {fill: "var(--bg)", stroke: c, "stroke-width": 2, rx: 14, height: 34}, chip);
      var ct = D.el("text", {"font-size": 24, "font-weight": 700, fill: c, "text-anchor": "middle"}, chip);
      ct.textContent = P2.p.role;
      return {P2: P2, c: c, rect: rect, chip: chip, cr: cr, ct: ct};
    });
    this.links = this.paras.filter(function(P2){ return P2.p.to && pById[P2.p.to]; }).map(function(P2){
      var c = P2.p.rel === "~" ? "var(--accent2)" : "var(--muted)";
      return {a: P2, b: pById[P2.p.to], rel: P2.p.rel, c: c, lv: levelOf[self.paras.indexOf(P2)] || 1,
        path: D.el("path", {fill: "none", stroke: c, "stroke-width": 2.5, "stroke-dasharray": P2.p.rel === "~" ? "none" : "none", pathLength: 1}, self.front),
        h1: D.el("path", {d: "M0,0L-13,-6.5L-13,6.5Z", fill: c, opacity: 0}, self.front),
        h0: P2.p.rel === "~" ? D.el("path", {d: "M0,0L-13,-6.5L-13,6.5Z", fill: c, opacity: 0}, self.front) : null};
    });
    this.setAttribute("aria-label", m.paras.map(function(p){ return (p.role ? "【" + p.role + "】" : "") + p.runs.map(function(r){ return r.t; }).join(""); }).join(" "));
  }
  // 要素の字の箱（行ごと）を部品の座標で。部品の外側の拡大（舞台の scale・段階の translate）によらない
  rects(e){
    var R = this.getBoundingClientRect(), sc = R.width / (this.offsetWidth || 1) || 1;
    return [].map.call(e.getClientRects(), function(r){ return {l: (r.left - R.left) / sc, t: (r.top - R.top) / sc, r: (r.right - R.left) / sc, b: (r.bottom - R.top) / sc}; })
      .filter(function(r){ return r.r - r.l > 0.5 && r.b - r.t > 0.5; });
  }
  box(e){ var r = this.rects(e), o = null; r.forEach(function(x){ o = o ? {l: Math.min(o.l, x.l), t: Math.min(o.t, x.t), r: Math.max(o.r, x.r), b: Math.max(o.b, x.b)} : x; }); return o; }
  duration(k){
    var name = this.phaseList[k - 1], P = this.props;
    if (name === "marks") return this.lines.length * P.draw * 0.8 + 0.3;
    if (name === "refs") return this.refs.length * (P.draw + 0.3) + 0.2;
    if (name === "roles") return this.boxes.length * 0.35 + P.draw + (this.links.length ? 0.3 + P.draw : 0);
    return 0;
  }
  render(k, t, ctx){
    var self = this, P = this.props, tate = P.tate;
    var at = function(name){ var s = self.phaseStep(name); if (!s) return -1; return k > s ? Infinity : k < s ? -1 : t; };
    var pr = function(tt, a, d){ return tt < 0 ? 0 : D.prog(tt, a, d); };
    var tm = at("marks"), trf = at("refs"), tro = at("roles");
    // 先の段階を薄く見せる表示（授業の表示）：後の段階の傍線・指示語の囲みと矢印・段落の枠と札とつなぐ線を、
    // 引き終えた形のまま --preview-opacity の濃さで出す
    var preview = !!ctx.preview, PV = preview ? base.previewOpacity(this) : 0.45;
    var later = function(name){ return preview && self.phaseStep(name) > k; };
    var fM = later("marks"), fR = later("refs"), fO = later("roles");
    if (fM) tm = Infinity;
    if (fR) trf = Infinity;
    if (fO) tro = Infinity;
    var f1 = function(x){ return x.toFixed(1); };
    // ---- 傍線：縦書きは字の右、横書きは字の下。二重傍線は 2 本。行をまたぐときは行ごとに順に引く
    this.lines.forEach(function(o, j){
      var e = pr(tm, j * P.draw * 0.8, P.draw), rs = self.rects(o.el), total = 0;
      rs.forEach(function(r){ total += tate ? r.b - r.t : r.r - r.l; });
      while (o.g.childNodes.length > (o.lab ? 1 : 0)) o.g.removeChild(o.g.lastChild);
      if (fM) o.g.setAttribute("opacity", PV); else o.g.removeAttribute("opacity");
      var left = e * total;
      rs.forEach(function(r){
        var len = tate ? r.b - r.t : r.r - r.l, d = Math.max(0, Math.min(len, left)); left -= len;
        if (d <= 0) return;
        for (var q = 0; q < o.r.line; q++){
          var off = 3 + q * 5;
          var attrs = tate ? {x1: f1(r.r + off), x2: f1(r.r + off), y1: f1(r.t), y2: f1(r.t + d)} : {x1: f1(r.l), x2: f1(r.l + d), y1: f1(r.b + off), y2: f1(r.b + off)};
          attrs.stroke = "var(--emph)"; attrs["stroke-width"] = 2.2;
          D.el("line", attrs, o.g);
        }
      });
      if (o.lab && rs.length){
        var r0 = rs[0];
        // 記号（A など）は線の始まりの外：縦書きは線の右の列の間で始まりより上、横書きは線の下の行の間
        // 縦書きは線のすぐ右（列の間の、自分の列に寄ったところ）に、線の始まりから下へ
        if (tate){ o.lab.setAttribute("x", f1(r0.r + 3 + o.r.line * 5 + 7)); o.lab.setAttribute("y", f1(r0.t + 22)); }
        else { o.lab.setAttribute("x", f1(r0.l + 10)); o.lab.setAttribute("y", f1(r0.b + 3 + o.r.line * 5 + 20)); }
        o.lab.setAttribute("opacity", pr(tm, j * P.draw * 0.8, 0.3).toFixed(3));
      }
    });
    // ---- 指示語：指示語を四角で囲み、指す先に淡い色を敷き、指示語から指す先へ矢印
    this.refs.forEach(function(o, j){
      var a0 = j * (P.draw + 0.3), eb = pr(trf, a0, 0.3), ea = pr(trf, a0 + 0.25, P.draw);
      var A = self.box(o.from), B = self.box(o.to);
      while (o.box.firstChild) o.box.removeChild(o.box.firstChild);
      while (o.fill.firstChild) o.fill.removeChild(o.fill.firstChild);
      if (!A || !B){ o.box.setAttribute("opacity", 0); return; }
      if (fR) eb = ea = PV;
      D.el("rect", {x: f1(A.l - 3), y: f1(A.t - 2), width: f1(A.r - A.l + 6), height: f1(A.b - A.t + 4), rx: 5, fill: "none", stroke: "var(--emph)", "stroke-width": 2.5}, o.box);
      self.rects(o.to).forEach(function(r){ D.el("rect", {x: f1(r.l - 2), y: f1(r.t), width: f1(r.r - r.l + 4), height: f1(r.b - r.t), rx: 4, fill: "var(--emph-tint)"}, o.fill); });
      o.box.setAttribute("opacity", eb.toFixed(3)); o.fill.setAttribute("opacity", ea.toFixed(3));
      // 矢印：指す先の行（字の箱）のうち指示語に近いものへ。同じ列（行）なら列の右（行の上）に弧、違えば列の頭（行の上）の側を通す
      var ac = {x: (A.l + A.r) / 2, y: (A.t + A.b) / 2}, Bn = null, bd = Infinity;
      self.rects(o.to).forEach(function(r){ var d = Math.hypot((r.l + r.r) / 2 - ac.x, (r.t + r.b) / 2 - ac.y); if (d < bd){ bd = d; Bn = r; } });
      var x0, y0, x1, y1, cx, cy, same = tate ? Math.abs((Bn.l + Bn.r) / 2 - ac.x) < 6 : Math.abs((Bn.t + Bn.b) / 2 - ac.y) < 6;
      if (tate && same){ var up = Bn.b <= A.t; x0 = A.r + 4; y0 = up ? A.t + 4 : A.b - 4; x1 = Bn.r + 4; y1 = up ? Bn.b - 4 : Bn.t + 4; cx = Math.max(x0, x1) + 44; cy = (y0 + y1) / 2; }
      else if (tate){ x0 = ac.x; y0 = A.t - 4; x1 = (Bn.l + Bn.r) / 2; y1 = Bn.t - 4; cx = (x0 + x1) / 2; cy = Math.min(y0, y1) - 60; }
      else if (same){ x0 = ac.x; y0 = A.t - 2; x1 = (Bn.l + Bn.r) / 2; y1 = Bn.t - 2; cx = (x0 + x1) / 2; cy = Math.min(y0, y1) - 46; }
      else { var above = Bn.b <= A.t; x0 = ac.x; y0 = above ? A.t - 2 : A.b + 2; x1 = (Bn.l + Bn.r) / 2; y1 = above ? Bn.b + 2 : Bn.t - 2; cx = (x0 + x1) / 2 + 40; cy = (y0 + y1) / 2; }
      // 指示語と指す先が同じ段落なら、弧の膨らみをその段落の枠の内側にとどめる（2 次曲線の頂は端と制御点の中ほど）
      var para = o.from.parentNode === o.to.parentNode ? self.box(o.from.parentNode) : null, pad = 6;
      if (para){
        var mid = function(a, b){ return (a + b) / 2; };
        if (cy < mid(y0, y1)) cy = Math.max(cy, 2 * (para.t + pad) - mid(y0, y1));
        if (cx > mid(x0, x1)) cx = Math.min(cx, 2 * (para.r - pad) - mid(x0, x1));
      }
      o.path.setAttribute("d", "M" + f1(x0) + "," + f1(y0) + "Q" + f1(cx) + "," + f1(cy) + " " + f1(x1) + "," + f1(y1));
      o.path.setAttribute("stroke-dashoffset", (fR ? 0 : 1 - ea).toFixed(4));
      o.path.setAttribute("opacity", fR ? PV : ea > 0 ? 1 : 0);
      o.head.setAttribute("transform", "translate(" + f1(x1) + " " + f1(y1) + ") rotate(" + (Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI).toFixed(1) + ")");
      o.head.setAttribute("opacity", fR ? PV : ea >= 0.98 ? 1 : 0);
    });
    // ---- 段落の枠：順に囲み、札を出し、最後につなぐ線
    var nb = this.boxes.length, tLink = nb * 0.35 + P.draw;
    var boxOf = {}, chipOf = {};
    this.boxes.forEach(function(o, j){
      var e = pr(tro, j * 0.35, P.draw), el = o.P2.el;
      var x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      // offset は .text の中の座標。.text は部品の左上にある
      boxOf[o.P2.p.id || j] = {x: x, y: y, w: w, h: h};
      o.rect.setAttribute("x", x); o.rect.setAttribute("y", y); o.rect.setAttribute("width", w); o.rect.setAttribute("height", h);
      o.rect.setAttribute("stroke-dashoffset", (1 - e).toFixed(4));
      o.rect.setAttribute("opacity", fO ? PV : e > 0 ? 1 : 0);
      // 札：縦書きは枠の上の辺の右寄り、横書きは左上の角
      var tw = Array.from(o.P2.p.role).length * 24 + 24;
      var cx = tate ? x + w - tw / 2 - 12 : x + tw / 2 + 12, cy = tate ? y - 17 : y - 17;
      o.cr.setAttribute("x", f1(cx - tw / 2)); o.cr.setAttribute("y", f1(cy - 17)); o.cr.setAttribute("width", tw);
      o.ct.setAttribute("x", f1(cx)); o.ct.setAttribute("y", f1(cy + 8.5));
      o.chip.setAttribute("opacity", (fO ? PV : pr(tro, j * 0.35 + P.draw * 0.5, 0.3)).toFixed(3));
      chipOf[o.P2.p.id || j] = {l: cx - tw / 2, r: cx + tw / 2, t: cy - 17, b: cy + 17, at: []};
    });
    // 札に付く線の端：縦書きは札の上の辺に左から、横書きは札の左の辺に上から並べる。
    // 相手が左（上）にある線を先に、段の低い順に。相手が右（下）にある線は後に、段の高い順に（縦の線が横の線を横切らないように）
    var ends = [];
    this.links.forEach(function(o){
      var A = chipOf[o.a.p.id], B = chipOf[o.b.p.id];
      if (!A || !B) return;
      var ca = tate ? (A.l + A.r) / 2 : (A.t + A.b) / 2, cb = tate ? (B.l + B.r) / 2 : (B.t + B.b) / 2;
      o.ea = {link: o, chip: A, dir: cb < ca ? -1 : 1}; o.eb = {link: o, chip: B, dir: ca < cb ? -1 : 1};
      A.at.push(o.ea); B.at.push(o.eb); ends.push(A, B);
    });
    ends.forEach(function(C){
      if (C.done) return; C.done = true;
      C.at.sort(function(p, q){ return p.dir !== q.dir ? p.dir - q.dir : p.dir < 0 ? p.link.lv - q.link.lv : q.link.lv - p.link.lv; });
      var n = C.at.length;
      C.at.forEach(function(e, i){
        if (tate){ e.x = C.l + (C.r - C.l) * (i + 1) / (n + 1); e.y = C.t - 1; }
        else { e.x = C.l - 1; e.y = C.t + (C.b - C.t) * (i + 1) / (n + 1); }
      });
    });
    this.links.forEach(function(o){
      if (!o.ea){ o.path.setAttribute("opacity", 0); o.h1.setAttribute("opacity", 0); if (o.h0) o.h0.setAttribute("opacity", 0); return; }
      var e = pr(tro, tLink, P.draw), d, ang1, ang0, x0 = o.ea.x, y0 = o.ea.y, x1 = o.eb.x, y1 = o.eb.y, rr = 8;
      if (tate){
        // 札の上の辺から上へ出て、段の高さを横に通り、相手の札の上の辺へ下りる（角は丸める）
        var top = Math.min(o.ea.chip.t, o.eb.chip.t), yl = top - STUB - (o.lv - 1) * STEP, sx = x1 < x0 ? -1 : 1;
        d = "M" + f1(x0) + "," + f1(y0) + "V" + f1(yl + rr) + "Q" + f1(x0) + "," + f1(yl) + " " + f1(x0 + sx * rr) + "," + f1(yl) +
          "H" + f1(x1 - sx * rr) + "Q" + f1(x1) + "," + f1(yl) + " " + f1(x1) + "," + f1(yl + rr) + "V" + f1(y1);
        ang1 = 90; ang0 = 90;
      } else {
        // 札の左の辺から左へ出て、段の位置を縦に通り、相手の札の左の辺へ
        var lft = Math.min(o.ea.chip.l, o.eb.chip.l), xl = lft - STUB - (o.lv - 1) * STEP, sy = y1 < y0 ? -1 : 1;
        d = "M" + f1(x0) + "," + f1(y0) + "H" + f1(xl + rr) + "Q" + f1(xl) + "," + f1(y0) + " " + f1(xl) + "," + f1(y0 + sy * rr) +
          "V" + f1(y1 - sy * rr) + "Q" + f1(xl) + "," + f1(y1) + " " + f1(xl + rr) + "," + f1(y1) + "H" + f1(x1);
        ang1 = 0; ang0 = 0;
      }
      o.path.setAttribute("d", d);
      o.path.setAttribute("stroke-dasharray", "1"); o.path.setAttribute("stroke-dashoffset", (1 - e).toFixed(4));
      o.path.setAttribute("opacity", fO ? PV : e > 0 ? 1 : 0);
      o.h1.setAttribute("transform", "translate(" + f1(x1) + " " + f1(y1) + ") rotate(" + ang1 + ")");
      o.h1.setAttribute("opacity", fO ? PV : e >= 0.98 ? 1 : 0);
      if (o.h0){ o.h0.setAttribute("transform", "translate(" + f1(x0) + " " + f1(y0) + ") rotate(" + ang0 + ")"); o.h0.setAttribute("opacity", fO ? PV : e >= 0.98 ? 1 : 0); }
    });
  }
};
});
