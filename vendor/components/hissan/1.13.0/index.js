// m-hissan：筆算（たし算・ひき算・かけ算・わり算。小数も）。式を書くだけで、部品が教科書の手順のとおりに 1 段階ずつ計算して書く
// <m-hissan expr="487+356" style="height:420px"></m-hissan>
// 段階（build="steps"、既定）：
//   ＋・−：一の位から 1 つの位ずつ（くり上がりの小さな 1、くり下がりの斜線と小さな数）。小数は最後に答えの小数点をうつ
//   ×：かける数の 1 けたごとに 1 段（fine="on" は 1 けたずつ、小さなくり上がり）→ たす → 0 をおろす → 小数点をうつ（数えて）
//   ÷：商 1 けたごとに 1 段（per="round"、既定。たてる・かける・ひく・おろす が段階の中で順に）。per="phase" は 4 つを別の段に。
//       わる数が小数なら、はじめに小数点をうつす段。kari="on" は大きすぎる仮の商を 1 回見せて直す
// build="whole" は 1 段階で全部。数は部品が計算する（tools/test-hissan.mjs が普通の計算と照らし合わせる。customElements.get("m-hissan").calc）
// 見せ方（docs/conventions.md §1）：fade（既定。字も線もフェード）・draw（線・斜線・矢印を引く）
(function(){
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (the first is the default) and calls VARIANT.of(this) once, in mount. The variant is the component's
// `variant` attribute when it names one of them, otherwise the first name. There is no seed: lessons do not carry one
// (spec §8.4 since egatari-spec 28d8801), and `seed` / `data-egatari-seed` are not read.
// The choice is a pure function of the attribute: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null && names.indexOf(v) >= 0) return v;
    if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
    return names[0] || null;
  }
  return {of: of};
})();
// ---- END egatari-variant ----
// ---- 計算と配置（DOM を使わない。tools/test-hissan.mjs が vm で読む） ----
var CALC = (function(){
  "use strict";
  var INT = ["一", "十", "百", "千", "一万", "十万", "百万", "千万", "一億", "十億", "百億", "千億"];
  var FRAC = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  function placeName(p){ return p >= 0 ? (INT[p] || "") + "の位" : "小数第" + (FRAC[-p - 1] || String(-p)) + "位"; }
  var OPS = {"+": "+", "−": "−", "×": "×", "÷": "÷"};
  // 数：書かれたとおりの数字と位（p：一の位が 0、小数第一位が −1）、小数点の右の桁数 scale、整数として読んだ値 int
  function num(s, what){
    var m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) throw new Error('m-hissan: ' + what + ' "' + s + '" is not a number (write digits, optionally with one decimal point)');
    var ip = m[1].replace(/^0+(?=\d)/, ""), fp = m[2] || "";
    if ((ip + fp).replace(/^0+/, "").length > 12) throw new Error("m-hissan: " + what + " has more than 12 digits");
    var ds = [];
    for (var i = 0; i < ip.length; i++) ds.push({p: ip.length - 1 - i, d: +ip[i]});
    for (var j = 0; j < fp.length; j++) ds.push({p: -(j + 1), d: +fp[j]});
    return {text: ip + (m[2] !== undefined ? "." + fp : ""), ip: ip, fp: fp, scale: fp.length, ds: ds, int: +(ip + fp), point: m[2] !== undefined,
      at: function(p){ for (var k = 0; k < ds.length; k++) if (ds[k].p === p) return ds[k].d; return undefined; }};
  }
  function parse(expr){
    var s = String(expr == null ? "" : expr).replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/．/g, ".").replace(/[\s　]/g, "").replace(/[=＝]$/, "")
      .replace(/[＋]/g, "+").replace(/[-－−ー]/g, "−").replace(/[*＊xX✕]/g, "×").replace(/[/／]/g, "÷").replace(/^\./, "0.").replace(/([+−×÷])\./, "$10.");
    var m = /^([\d.]+)([+−×÷])([\d.]+)$/.exec(s);
    if (!m) throw new Error('m-hissan: expr="' + expr + '" is not one calculation like "487+356", "1003-457", "3.6×2.4" or "7.56÷1.8"');
    var A = num(m[1], "the first number"), B = num(m[3], "the second number");
    return {op: OPS[m[2]], A: A, B: B};
  }
  function pow10(n){ var x = 1; while (n-- > 0) x *= 10; return x; }
  function digitsOf(n){ return String(n).split("").map(Number); }
  // 小数の文字（整数 n、小数点の右の桁数 s）
  function dec(n, s){
    var t = String(n);
    if (!s) return t;
    while (t.length <= s) t = "0" + t;
    t = t.slice(0, t.length - s) + "." + t.slice(t.length - s);
    return t.replace(/0+$/, "").replace(/\.$/, "");
  }
  // 筆算の中身：行（rows）・書くもの（items）・手順（phases）
  //   行の種類：L 大きな字の行、S 小さな字の行（くり上がり・くり下がり）、R 線、B わり算の横線、M 小数点の矢印、A 小数点を数える弧と数
  //   items：t = d（数字）・op（記号）・pt（小数点。p の位の右）・slash（字の斜線）・strike（終わりの 0 を消す線。p0〜p1、withPt）・
  //          rule（線。p0〜p1）・bar・bracket・div（わる数。わり算）・move（小数点をうつす矢印）・count（数える弧と番号）・
  //          xline（仮の積に引く線）・cap（手順の言葉。その段階の中だけ）・lab（残る短い言葉）・focus（いま計算している所）
  //   g：現れる手順の番号（−1 は問題として最初から）、o・l：手順の中の始まりと長さ（手順の長さを 1 として）、end：消える手順
  function Model(op){ this.op = op; this.rows = []; this.items = []; this.phases = []; this.info = {}; }
  Model.prototype.row = function(k){ this.rows.push({k: k}); return this.rows.length - 1; };
  Model.prototype.ph = function(grp, name){ this.phases.push({grp: grp, name: name || ""}); return this.phases.length - 1; };
  Model.prototype.add = function(o){ if (o.g === undefined) o.g = -1; this.items.push(o); return o; };
  Model.prototype.cap = function(r, g, s){ return this.add({t: "cap", r: r, g: g, s: s}); };

  // ---------------- たし算・ひき算 ----------------
  function addsub(A, B, op, o){
    var M = new Model(op), s = Math.max(A.scale, B.scale), plus = op === "+";
    if (!plus) M.cw = CWSUB;
    var Ai = A.int * pow10(s - A.scale), Bi = B.int * pow10(s - B.scale);
    if (!plus && Ai < Bi) throw new Error("m-hissan: " + A.text + "−" + B.text + " is negative (the first number must not be smaller)");
    // 小さな字の行：ひき算と carry="top" は上の数の上、たし算の既定は 2 つめの数と線の間（くり上がりは答えの線のすぐ上）
    var top1 = !plus || (o && o.carry === "top");
    var rS = top1 ? M.row("S") : null, rA = M.row("L"), rB = M.row("L");
    if (!top1) rS = M.row("S");
    var rR = M.row("R"), rC = M.row("L"), rF = top1 ? rS : rA;   // rF：位の色の上端
    A.ds.forEach(function(d){ M.add({t: "d", r: rA, p: d.p, s: String(d.d), id: "a" + d.p}); });
    B.ds.forEach(function(d){ M.add({t: "d", r: rB, p: d.p, s: String(d.d)}); });
    if (A.point) M.add({t: "pt", r: rA, p: 0});
    if (B.point) M.add({t: "pt", r: rB, p: 0});
    var topA = A.ip.length - 1, topB = B.ip.length - 1, top = Math.max(topA, topB);
    M.add({t: "op", r: rB, s: plus ? "+" : "−"});
    M.add({t: "rule", r: rR});
    var res = {}, cols = [];
    if (plus){
      var carry = 0;
      for (var p = -s; p <= top; p++){
        var a = A.at(p), b = B.at(p), sum = (a || 0) + (b || 0) + carry;
        cols.push({p: p, a: a, b: b, cin: carry, sum: sum, d: sum % 10, cout: sum >= 10 ? 1 : 0});
        res[p] = sum % 10; carry = sum >= 10 ? 1 : 0;
      }
      if (carry) res[top + 1] = 1;
      cols.forEach(function(c){
        var g = M.ph("c" + c.p, "col");
        M.add({t: "d", r: rC, p: c.p, s: String(c.d), g: g});
        M.add({t: "focus", r0: rF, r1: rC, p0: c.p, p1: c.p, g: g});
        var terms = [c.a, c.b].filter(function(v){ return v !== undefined; }).concat(c.cin ? [1] : []);
        var say = placeName(c.p) + "：" + (terms.length > 1 ? terms.join("＋") + "＝" + c.sum : c.sum + " をそのまま書く");
        if (c.cout){
          if (c.p === top){ M.add({t: "d", r: rC, p: c.p + 1, s: "1", g: g, o: 0.3}); M.items[M.items.length - 2].p1 = c.p; M.items[M.items.length - 2].p0 = c.p + 1; }
          else M.add({t: "d", r: rS, p: c.p + 1, s: "1", sz: "S", tone: "term", g: g, o: 0.3});
          if (c.p !== top) say += "、1 くり上がる";
        }
        M.cap(rC, g, say);
      });
    } else {
      var cur = {}, reduced = {}, lead = {};
      A.ds.forEach(function(d){ cur[d.p] = d.d; });
      // 答えの上の位の 0 は書かない（一の位より上で、それより上がすべて 0）：差の値から先に決める
      var diff = String(Ai - Bi), dtop = Math.max(0, diff.length - 1 - s);
      for (var h = dtop + 1; h <= topA; h++) lead[h] = true;
      for (var q = -s; q <= topA; q++){
        var grp = "c" + q, b2 = B.at(q) || 0, bq = B.at(q);
        if (q === -s && s > A.scale){
          // 小数の位が足りない：0 を書きたす（たとえば 5 → 5.00）
          var g0 = M.ph(grp, "zero");
          for (var z = -s; z < -A.scale; z++){ cur[z] = 0; M.add({t: "d", r: rA, p: z, s: "0", tone: "term", g: g0}); }
          if (!A.point) M.add({t: "pt", r: rA, p: 0, g: g0});
          M.cap(rC, g0, "小数点より右に 0 を書きたす");
        }
        if (cur[q] < b2){
          var gb = M.ph(grp, "borrow");
          var L = q + 1; while (L <= topA && !(cur[L] > 0)) L++;
          if (L > topA) throw new Error("m-hissan: internal: nothing to borrow from");
          for (var x = L; x > q; x--){
            M.add({t: "slash", r: rA, p: x, g: gb, l: 0.4, o: (L - x) * 0.1});
            var nv = x === L ? cur[x] - 1 : 9;
            if (!(nv === 0 && x === topA)) M.add({t: "d", r: rS, p: x, s: String(nv), sz: "S", tone: "term", g: gb, o: 0.15 + (L - x) * 0.1});
            cur[x] = nv; reduced[x] = true;
          }
          // くり下げてもらった 1：くり下げた数（小さな数）があればその左、なければ大きな字の左肩（字の中ほどの高さ、その列の中）
          if (reduced[q]) M.add({t: "d", r: rS, p: q, s: "1", sz: "S", tone: "term", pos: "beside", g: gb, o: 0.35});
          else M.add({t: "d", r: rA, p: q, s: "1", sz: "S", tone: "term", pos: "shoulder", g: gb, o: 0.35});
          cur[q] += 10;
          M.cap(rC, gb, placeName(q) + "：" + placeName(L) + "から" + (L > q + 1 ? "順に" : "") + " 1 くり下げる");
          M.add({t: "focus", r0: rS, r1: rC, p0: L, p1: q, g: gb});
        }
        res[q] = cur[q] - b2;
        if (lead[q]){
          // 上の位の 0：ひく数に字があれば、0 になることを言って書かない（52−48 の十の位）
          if (bq === undefined) continue;
          var gz = M.ph(grp, "col");
          M.add({t: "focus", r0: rS, r1: rC, p0: q, p1: q, g: gz});
          M.cap(rC, gz, placeName(q) + "：" + cur[q] + "−" + bq + "＝0、0 は書かない");
          continue;
        }
        var g = M.ph(grp, "col");
        M.add({t: "d", r: rC, p: q, s: String(res[q]), g: g});
        M.add({t: "focus", r0: rS, r1: rC, p0: q, p1: q, g: g});
        M.cap(rC, g, placeName(q) + "：" + (bq !== undefined ? cur[q] + "−" + bq + "＝" + res[q] : res[q] + " をそのまま書く"));
      }
      Object.keys(lead).forEach(function(k){ delete res[k]; });
    }
    // 小数：答えの小数点、終わりの 0 を消す
    if (s > 0){
      var gp = M.ph("pt", "point");
      M.add({t: "pt", r: rC, p: 0, g: gp});
      M.cap(rC, gp, "小数点をそろえて、答えの小数点をうつ");
      strikeZeros(M, rC, res, s, 0, "pt");
    }
    var ans = plus ? Ai + Bi : Ai - Bi;
    M.info = {struck: M.struck || 0, answerRow: rC, value: dec(ans, s), rows: {A: rA, B: rB, S: rS}};
    return M;
  }
  // 答えの小数の終わりの 0 に斜線（教科書：0 を消す）。全部 0 なら小数点ごと
  function strikeZeros(M, r, res, s, shift, grp){
    var z = 0; for (var p = -s + shift; p < shift && res[p] === 0; p++) z++;
    if (!z) return;
    var g = M.ph(grp, "strike");
    M.add({t: "strike", r: r, p0: -s + shift + z - 1, p1: -s + shift, withPt: z === s, ptP: shift, g: g});
    M.cap(r, g, "終わりの 0 を消す");
    M.struck = z;
  }

  // ---------------- かけ算 ----------------
  function tz(ip){ var m = /0+$/.exec(ip); return m && m[0].length < ip.length ? m[0].length : 0; }
  function mul(A, B, o){
    var M = new Model("×"), fine = o.fine;
    var za = A.scale === 0 ? tz(A.ip) : 0, zb = B.scale === 0 ? tz(B.ip) : 0, Z = za + zb, S = A.scale + B.scale;
    var a1 = Math.round(A.int / pow10(za)), b1 = Math.round(B.int / pow10(zb));
    // 列（c）：0 の右端をのぞいた数を右にそろえる。A の書いた位 p の列は p + scale − z
    var colA = function(p){ return p + A.scale - za; }, colB = function(p){ return p + B.scale - zb; };
    var rA = M.row("L"), rB = M.row("L"), rR = M.row("R");
    A.ds.forEach(function(d){ M.add({t: "d", r: rA, p: colA(d.p), s: String(d.d)}); });
    B.ds.forEach(function(d){ M.add({t: "d", r: rB, p: colB(d.p), s: String(d.d)}); });
    if (A.point) M.add({t: "pt", r: rA, p: colA(0)});
    if (B.point) M.add({t: "pt", r: rB, p: colB(0)});
    M.add({t: "op", r: rB, s: "×"});
    M.add({t: "rule", r: rR});
    var bd = digitsOf(b1).reverse(), ad = digitsOf(a1).reverse(), parts = [];
    bd.forEach(function(bj, j){
      if (bj === 0 && bd.length > 1) return;   // 0 の段は書かない（教科書）
      var rs = fine ? M.row("S") : null, r = M.row("L"), v = a1 * bj;
      parts.push({j: j, b: bj, value: v, row: r, srow: rs});
    });
    var multi = parts.length > 1, rR2 = multi ? M.row("R") : null, rP = multi ? M.row("L") : parts[parts.length - 1].row;
    var nA = ad.length;
    parts.forEach(function(pt, k){
      if (fine){
        var carry = 0;
        ad.forEach(function(ai, i){
          var g = M.ph("p" + k + "d" + i, "digit"), x = ai * pt.b + carry, last = i === nA - 1;
          M.add({t: "d", r: pt.row, p: i + pt.j, s: String(last ? x : x % 10).slice(-1), g: g});
          if (last && x >= 10) M.add({t: "d", r: pt.row, p: i + pt.j + 1, s: String(Math.floor(x / 10)), g: g});
          if (!last && x >= 10) M.add({t: "d", r: pt.srow, p: i + pt.j + 1, s: String(Math.floor(x / 10)), sz: "S", tone: "term", g: g, o: 0.3});
          var y = ai * pt.b;
          M.cap(pt.row, g, ai + "×" + pt.b + "＝" + y + (carry ? "、" + y + "＋" + carry + "＝" + x : ""));
          M.add({t: "focus", r0: pt.srow, r1: pt.row, p0: i + pt.j + (last && x >= 10 ? 1 : 0), p1: i + pt.j, g: g});
          carry = last ? 0 : Math.floor(x / 10);
        });
      } else {
        var g = M.ph("p" + k, "part"), ds = digitsOf(pt.value);
        ds.forEach(function(d, i){ M.add({t: "d", r: pt.row, p: pt.j + ds.length - 1 - i, s: String(d), g: g}); });
        M.cap(pt.row, g, a1 + "×" + pt.b + "＝" + pt.value + (pt.j ? "、" + placeName(pt.j) + "から書く" : ""));
        M.add({t: "focus", r0: pt.row, r1: pt.row, p0: pt.j + ds.length - 1, p1: pt.j, g: g});
      }
    });
    var prod = a1 * b1, res = {};
    digitsOf(prod).reverse().forEach(function(d, i){ res[i] = d; });
    if (multi){
      var gs = M.ph("sum", "sum"), pd = digitsOf(prod);
      M.add({t: "rule", r: rR2, g: gs, l: 0.3});
      pd.forEach(function(d, i){ M.add({t: "d", r: rP, p: pd.length - 1 - i, s: String(d), g: gs, o: 0.25}); });
      M.cap(rP, gs, "たす：" + parts.map(function(pt){ return pt.value * pow10(pt.j); }).join("＋") + "＝" + prod);
      M.add({t: "focus", r0: parts[0].row, r1: rP, p0: pd.length - 1, p1: 0, g: gs});
    }
    if (Z){
      var gz = M.ph("zero", "zero");
      for (var z = 1; z <= Z; z++){ M.add({t: "d", r: rP, p: -z, s: "0", g: gz}); res[-z] = 0; }
      M.cap(rP, gz, "0 を " + Z + " こつける");
      M.add({t: "focus", r0: rA, r1: rP, p0: -1, p1: -Z, g: gz});
    }
    // 小数：かけられる数・かける数の小数点の右のけた数をたして、積の右から数えて小数点をうつ。終わりの 0 を消す
    if (S > 0){
      var rC = M.row("A");
      var gc = M.ph("dec", "count"), gp = M.ph("dec", "point");
      if (A.scale) M.add({t: "lab", r: rA, s: "小数点の右に " + A.scale + " けた", g: gc});
      if (B.scale) M.add({t: "lab", r: rB, s: "小数点の右に " + B.scale + " けた", g: gc, o: 0.2});
      var right = -Z;
      for (var c = 0; c < S; c++) M.add({t: "count", r: rC, p: right + c, n: c + 1, g: gc, o: 0.3 + 0.5 * c / S, l: 0.5 / S + 0.1});
      M.add({t: "lab", r: rP, s: (A.scale && B.scale ? A.scale + "＋" + B.scale + "＝" : "") + S + " けた", g: gc, o: 0.6});
      var ptP = S - Z, topP = digitsOf(prod).length - 1;
      for (var q = topP + 1; q <= ptP; q++){ M.add({t: "d", r: rP, p: q, s: "0", tone: "term", g: gp}); res[q] = 0; }
      M.add({t: "pt", r: rP, p: ptP, g: gp});
      M.cap(rP, gp, "右から " + S + " けた数えて、小数点をうつ");
      var full = {}; Object.keys(res).forEach(function(k){ full[+k - ptP] = res[k]; });
      strikeZeros(M, rP, full, S, 0, "dec");
      // strikeZeros は小数点を位 0 の右と考える：列にもどす
      M.items.forEach(function(it){ if (it.t === "strike" && it.ptP === 0 && it.r === rP && it.shifted === undefined){ it.p0 += ptP; it.p1 += ptP; it.ptP = ptP; it.shifted = true; } });
      M.add({t: "focus", r0: rP, r1: rC, p0: ptP, p1: right, g: gc});
    }
    M.info = {struck: M.struck || 0, answerRow: rP, value: dec(a1 * b1 * pow10(Z), S), parts: parts.map(function(p){ return {row: p.row, j: p.j, value: p.value}; }), a1: a1, b1: b1, Z: Z,
      rows: {A: rA, B: rB}, colA: colA, colB: colB};
    return M;
  }

  // ---------------- わり算 ----------------
  // o.digits：商を小数第何位まで（null なら、整数どうしは あまり を出し、小数があればわり切れるまで o.cap 位まで）
  function div(A, B, o){
    var M = new Model("÷");
    if (B.int === 0) throw new Error("m-hissan: division by zero");
    var m = B.scale, d = B.int, dI = digitsOf(d);
    // 列（c）：小数点をうつしたあとの、わられる数の位。書いた位 p の列は p + m
    var col = function(p){ return p + m; };
    var dv = {};
    A.ds.forEach(function(x){ dv[col(x.p)] = x.d; });
    var cL = col(A.ip.length - 1), lastWritten = col(-A.scale);
    var remMode = o.rem || (o.digits == null && A.scale === 0 && m === 0);
    var frac = remMode ? 0 : (o.digits != null ? Math.max(0, o.digits) : o.cap);
    var cEnd = remMode ? 0 : -frac;   // 商を求める最後の列
    var at = function(c){ return dv[c] !== undefined ? dv[c] : 0; };
    // 書いた わられる数 の、列 c より右に 0 でない字が残っているか
    var restNonzero = function(c){ for (var x = c - 1; x >= lastWritten; x--) if (at(x)) return true; return false; };
    // 下書き：各回の (列, わられる部分, 商)。仮の商を見せる回は、見当が商と違う最初の回。
    // 見当：わる数を上の 1 けたの位で四捨五入（23→20、27→30）、わられる部分をその位で切り捨て（85→80）てわる
    var sim = [], r0 = 0, st0 = false;
    for (var c0 = cL; c0 >= cEnd; c0--){
      var P0 = r0 * 10 + at(c0), q0 = Math.floor(P0 / d);
      if (!st0 && q0 === 0 && c0 > 0){ r0 = P0; continue; }
      st0 = true; r0 = P0 - q0 * d;
      var mm = dI.length - 1, dt = Math.round(d / pow10(mm)) * pow10(mm), e0 = Math.max(1, Math.min(9, Math.floor(Math.floor(P0 / pow10(mm)) * pow10(mm) / dt)));
      sim.push({c: c0, P: P0, q: q0, e: e0, dt: dt, mm: mm});
      if (r0 === 0 && c0 <= 0 && !restNonzero(c0) && !remMode) break;
    }
    var kariCol = null;
    if (o.kari){
      var k1 = sim.filter(function(s){ return s.q > 0 && s.e !== s.q; })[0];
      if (k1) kariCol = k1.c;
    }
    var rQ = M.row("L"), rBar = M.row("B"), rD = M.row("L");
    if (m > 0) M.row("M");
    A.ds.forEach(function(x){ M.add({t: "d", r: rD, p: col(x.p), s: String(x.d)}); });
    if (A.point) M.add({t: "pt", r: rD, p: col(0)});
    M.add({t: "div", s: B.text, point: B.point, m: m, r: rD});
    M.add({t: "bracket", r: rD});
    var has = {};   // 行 r・列 p に大きな字があるか
    var digit = function(o2){ has[o2.r + ":" + o2.p] = true; return M.add(Object.assign({t: "d"}, o2)); };
    A.ds.forEach(function(x){ has[rD + ":" + col(x.p)] = true; });
    var appended = [], gMove = null, dPt = !!(A.point && m === 0);   // dPt：わられる数の（うつしたあとの）小数点を書いたか
    // 小数点をうつす（わる数を整数に）。わられる数の位が足りなければ 0 を書きたす（7.5÷0.25 → 750÷25）
    if (m > 0){
      gMove = M.ph("move", "move");
      M.add({t: "move", who: "div", n: m, g: gMove, l: 0.5});
      M.add({t: "move", who: "D", r: rD, from: col(0), n: m, g: gMove, o: 0.4, l: 0.5});
      if (A.point) M.add({t: "ptx", r: rD, p: col(0), g: gMove, o: 0.4});
      for (var c = lastWritten - 1; c >= 0; c--){ dv[c] = 0; appended.push(c); digit({r: rD, p: c, s: "0", tone: "term", g: gMove, o: 0.7}); }
      if (lastWritten < 0 || (sim.length && sim[sim.length - 1].c < 0)){ M.add({t: "pt", r: rD, p: 0, g: gMove, o: 0.7}); dPt = true; }
      M.cap(rD, gMove, "わる数が整数になるように、小数点を " + m + " けた右へうつす");
    }
    var lastC = cL, rounds = [], r = 0, started = false, cur = rD, partialLeft = cL, qDigits = {};
    for (var c2 = cL; c2 >= cEnd; c2--){
      var P = r * 10 + at(c2), q = Math.floor(P / d), rn = P - q * d;
      if (!started && q === 0 && c2 > 0){ r = P; continue; }   // 商は、わることができる位から（上の位の 0 は書かない）
      var finish = c2 === cEnd || (!remMode && rn === 0 && c2 <= 0 && !restNonzero(c2));
      var grp = "r" + c2, R = {c: c2, P: P, q: q, prod: q * d, r: rn, rowP: null, rowR: null, partialRow: cur, left: partialLeft};
      if (c2 === kariCol){
        // 仮の商：見当の商から 1 ずつなおす。1 回の試し＝たてる（なおす）→ かける →（小さすぎるときは ひく）→ 斜線で消してなおす
        var s0 = sim.filter(function(s){ return s.c === c2; })[0], x = s0.e, Pt = Math.floor(P / pow10(s0.mm)) * pow10(s0.mm);
        R.rowP = M.row("L"); R.rRule = M.row("R"); R.rowR = M.row("L"); R.tries = [];
        var gk = M.ph(grp, "kari");
        var dig = M.add({t: "d", r: rQ, p: c2, s: String(x), g: gk});
        M.cap(rQ, gk, "たてる：" + P + "÷" + d + " を " + Pt + "÷" + s0.dt + " とみて " + x);
        M.add({t: "focus", r0: rQ, r1: rQ, p0: c2, p1: c2, g: gk});
        while (x !== q){
          var big = x > q, tryItems = [dig], kd = digitsOf(x * d), kl = c2 + kd.length - 1;
          // 積が わられる部分 より左にはみ出す（99÷14 の 126）：列には書かず、言葉だけで言う（図の幅を変えない）
          var wide = big && kl > Math.max(partialLeft, c2);
          if (!wide){
            var gk2 = M.ph(grp, "kari-mul");
            kd.forEach(function(v, i){ tryItems.push(M.add({t: "d", r: R.rowP, p: kl - i, s: String(v), g: gk2})); });
            M.cap(R.rowP, gk2, "かける：" + d + "×" + x + "＝" + x * d);
            M.add({t: "focus", r0: R.rowP, r1: R.rowP, p0: kl, p1: c2, g: gk2});
          }
          var rr = P - x * d, kleft = Math.max(partialLeft, kl);
          if (!big){
            var gk3 = M.ph(grp, "kari-sub"), rdg = digitsOf(rr);
            tryItems.push(M.add({t: "rule", r: R.rRule, p0: kleft, p1: c2, g: gk3, l: 0.35}));
            rdg.forEach(function(v, i){ tryItems.push(M.add({t: "d", r: R.rowR, p: c2 + rdg.length - 1 - i, s: String(v), g: gk3, o: 0.3})); });
            M.cap(R.rowR, gk3, "ひく：" + P + "−" + x * d + "＝" + rr);
            M.add({t: "focus", r0: cur, r1: R.rowR, p0: kleft, p1: c2, g: gk3});
          }
          var gfix = M.ph(grp, "fix"), nx = big ? x - 1 : x + 1;
          tryItems.push(M.add({t: "slash", r: rQ, p: c2, g: gfix, l: 0.25}));
          if (!wide) tryItems.push(M.add({t: "xline", r: R.rowP, p0: kl, p1: c2, g: gfix, l: 0.25}));
          if (!big) tryItems.push(M.add({t: "xline", r: R.rowR, p0: c2 + digitsOf(rr).length - 1, p1: c2, g: gfix, l: 0.25}));
          tryItems.forEach(function(it){ it.end = gfix; it.endo = 0.5; it.kari = true; });
          dig = M.add({t: "d", r: rQ, p: c2, s: String(nx), g: gfix, o: 0.6, l: 0.35});
          M.cap(rQ, gfix, big ? (wide ? d + "×" + x + "＝" : "") + x * d + " は " + P + " より大きくてひけないので、1 小さくする（" + nx + "）"
                              : "あまりが " + d + (rr === d ? " と同じなので" : " より大きいので") + "、1 大きくする（" + nx + "）");
          M.add({t: "focus", r0: rQ, r1: wide ? rQ : big ? R.rowP : R.rowR, p0: wide ? c2 : Math.max(kl, partialLeft), p1: c2, g: gfix});
          R.tries.push({q: x, prod: x * d, r: big ? null : rr, big: big, wide: wide});
          x = nx;
        }
        has[rQ + ":" + c2] = true;
        R.kari = s0.e;
      } else {
        var gt = M.ph(grp, "tate");
        digit({r: rQ, p: c2, s: String(q), g: gt});
        M.cap(rQ, gt, "たてる：" + P + "÷" + d + " → " + q);
        M.add({t: "focus", r0: rQ, r1: rQ, p0: c2, p1: c2, g: gt});
      }
      qDigits[c2] = q;
      if (q > 0){
        if (!R.rowP) R.rowP = M.row("L");
        var rRule = R.rRule !== undefined ? R.rRule : M.row("R");
        if (R.rRule === undefined) R.rowR = M.row("L");
        var gm = M.ph(grp, "kake"), pd = digitsOf(q * d);
        pd.forEach(function(x, i){ digit({r: R.rowP, p: c2 + pd.length - 1 - i, s: String(x), g: gm}); });
        M.cap(R.rowP, gm, "かける：" + d + "×" + q + "＝" + q * d);
        M.add({t: "focus", r0: R.rowP, r1: R.rowP, p0: c2 + pd.length - 1, p1: c2, g: gm});
        var gh = M.ph(grp, "hiku"), left = Math.max(partialLeft, c2 + pd.length - 1);
        M.add({t: "rule", r: rRule, p0: left, p1: c2, g: gh, l: 0.35});
        // ひいた答え：0 は書かない（次の位をおろす）。最後なら 0 も書く（あまりで、のこりの位をおろすときは書かない）
        var restRem = remMode && finish && cEnd - 1 >= lastWritten;
        var rd = rn > 0 || (finish && !restRem) ? digitsOf(rn) : [];
        rd.forEach(function(x, i){ digit({r: R.rowR, p: c2 + rd.length - 1 - i, s: String(x), g: gh, o: 0.3}); });
        M.cap(R.rowR, gh, "ひく：" + P + "−" + q * d + "＝" + rn);
        M.add({t: "focus", r0: cur, r1: R.rowR, p0: left, p1: c2, g: gh});
        cur = R.rowR; partialLeft = rn > 0 ? c2 + rd.length - 1 : c2 - 1;
      } else R.rowR = cur;
      started = true; r = rn; lastC = c2;
      rounds.push(R);
      if (finish) break;
      // おろす
      var go = M.ph(grp, "orosu"), nd = c2 - 1, nv = at(nd), add0 = dv[nd] === undefined;
      if (add0){ dv[nd] = 0; appended.push(nd); digit({r: rD, p: nd, s: "0", tone: "term", g: go}); }
      var ptNow = nd === -1;
      if (ptNow){
        M.add({t: "pt", r: rQ, p: 0, g: go});   // 商の小数点：わられる数の（うつした）小数点の上
        if (!dPt){ M.add({t: "pt", r: rD, p: 0, g: go}); dPt = true; }
      }
      if (cur !== rD){
        digit({r: cur, p: nd, s: String(nv), g: go, o: 0.2});
        M.cap(cur, go, "おろす：" + nv + " をおろす" + (ptNow ? "（商に小数点をうつ）" : ""));
      } else M.cap(rD, go, (add0 ? "0 をつけたして、" : "") + "次の位もあわせて考える" + (ptNow ? "（商に小数点をうつ）" : ""));
      M.add({t: "focus", r0: rD, r1: cur, p0: nd, p1: nd, g: go});
    }
    // あまり（整数の商で止めるとき）：のこりの位をおろし、もとの小数点にそろえて あまりの小数点をうつ
    var remInfo = null;
    if (remMode){
      var rr = cur, gR = M.phases.length - 1, remVal = r, remScale = 0;
      var restCols = []; for (var c3 = cEnd - 1; c3 >= lastWritten; c3--) restCols.push(c3);
      if (restCols.length){
        gR = M.ph(rounds.length ? "r" + rounds[rounds.length - 1].c : "rest", "rest");
        restCols.forEach(function(c4){ digit({r: rr, p: c4, s: String(at(c4)), g: gR, o: 0.2}); remVal = remVal * 10 + at(c4); remScale++; });
        M.cap(rr, gR, "のこりの位をそのままおろす");
      }
      var rs = remScale + m;   // あまりは、もとの わられる数 の位で読む（小数点を m けたうつしたので）
      if (remVal > 0 && rs > 0){
        for (var c5 = cEnd - remScale + 1; c5 <= m; c5++) if (!has[rr + ":" + c5]) digit({r: rr, p: c5, s: "0", tone: "term", g: gR, o: 0.5});
        M.add({t: "pt", r: rr, p: m, g: gR, o: 0.5});
      }
      if (remVal > 0) M.add({t: "lab", r: rr, s: "あまり", g: gR, o: 0.5});
      remInfo = {value: dec(remVal, rs), row: rr, cols: restCols};
    }
    var qs = Object.keys(qDigits).map(Number).sort(function(a, b){ return b - a; });
    var qInt = 0, qMin = 0; qs.forEach(function(c6){ qInt = qInt * 10 + qDigits[c6]; qMin = c6; });
    M.info = {qRow: rQ, dRow: rD, rounds: rounds, quotient: dec(qInt, Math.max(0, -qMin)), qInt: qInt, qScale: Math.max(0, -qMin), remainder: remInfo, rem: remMode,
      frac: frac, d: d, m: m, cL: cL, cEnd: cEnd, divisor: B.text, dividend: A.text, appended: appended, exact: r === 0 && !restNonzero(lastC), lastR: r, kariCol: kariCol};
    return M;
  }
  // 式から筆算の中身を作る。o = {fine, kari, rem, digits, cap}
  function build(expr, o){
    o = o || {};
    var e = parse(expr);
    if (e.op === "+" || e.op === "−") return addsub(e.A, e.B, e.op, o);
    if (e.op === "×") return mul(e.A, e.B, o);
    return div(e.A, e.B, {kari: !!o.kari, rem: !!o.rem, digits: o.digits, cap: o.cap === undefined ? 3 : o.cap});
  }
  // ---- 配置（px）。字の大きさ：大きな字 FS、小さな字 SS ----
  // CW0：列の幅。ひき算は、くり下げてもらった 1 を字の左肩（その列の中）に置くので CWSUB
  // SHX・SHY：左肩の 1（24 px）の右端は列の中心から SHX 左（52 px の数字の左端の外）、字の下端は数字の下端から SHY 上（字の中ほど）
  var FS = 52, SS = 26, CW0 = 56, CWSUB = 74, CAP = 26, FIT = 470, OPG = 10, SHX = 20.5, SHY = 12;
  var ROWH = {L: 62, S: 30, R: 16, B: 14, M: 22, A: 60};
  function geom(M){
    var ys = [], y = 0;
    M.rows.forEach(function(r, i){ ys.push(y); y += ROWH[r.k]; });
    var ps = [];
    M.items.forEach(function(it){
      ["p", "p0", "p1"].forEach(function(k){ if (typeof it[k] === "number") ps.push(it[k]); });
    });
    var hi = Math.max.apply(null, ps), lo = Math.min.apply(null, ps);
    return {top: ys, h: y, hi: hi, lo: lo,
      base: function(r){ var k = M.rows[r].k; return ys[r] + (k === "L" ? 50 : k === "S" ? 25 : ROWH[k] / 2); },
      bot: function(r){ return ys[r] + ROWH[M.rows[r].k]; }};
  }
  // 行 r の最後に見えている字（消える字・消した 0 を除く）を読む："8.64"
  function read(M, r){
    var struck = {};
    M.items.forEach(function(it){ if (it.t === "strike" && it.r === r){ for (var p = it.p1; p <= it.p0; p++) struck[p] = true; if (it.withPt) struck.pt = true; } });
    var ds = {}, pt = null;
    M.items.forEach(function(it){
      if (it.r !== r || it.end !== undefined) return;
      if (it.t === "d" && it.sz !== "S" && !struck[it.p]) ds[it.p] = it.s;
      if (it.t === "pt" && !struck.pt) pt = it.p;
    });
    var ks = Object.keys(ds).map(Number).sort(function(a, b){ return b - a; }), s = "";
    if (!ks.length) return "";
    for (var p = ks[0]; p >= ks[ks.length - 1]; p--){ s += ds[p] !== undefined ? ds[p] : "_"; if (pt === p && p !== ks[ks.length - 1]) s += "."; }
    return s;
  }
  // 字の幅の見積もり（字が読み込まれる前でも同じ配置。数字は BIZ UDPGothic で約 0.76 字）
  function est(s, size){ return Array.from(String(s)).reduce(function(a, c){ return a + (/[0-9]/.test(c) ? 0.78 : /[−×÷＋＝→]/.test(c) ? 1 : /[\u0000-\u024f]/.test(c) ? 0.6 : 1); }, 0) * size; }
  // 要素の中の配置：列 p の中心 X(p)、行 r の字の下端 Yb(r)。図と右の言葉をまとめて左右の真ん中に、上下も真ん中に
  function layout(M, W, H, whole){
    var G = geom(M), opCol = G.hi + 1, divItem = M.items.filter(function(it){ return it.t === "div"; })[0];
    var CW = M.cw || CW0;
    var leftExtra = divItem ? divItem.s.replace(".", "").length * CW + 30 : OPG;   // 記号は数字から OPG px 離す
    var labW = {}, capW = 0;
    M.items.forEach(function(it){ if (it.t === "lab") labW[it.r] = Math.max(labW[it.r] || 0, est(it.s, CAP) + 24); });
    M.items.forEach(function(it){ if (it.t === "cap" && !whole) capW = Math.max(capW, (labW[it.r] || 0) + est(it.s, CAP)); });
    var labMax = Math.max.apply(null, [0].concat(Object.keys(labW).map(function(k){ return labW[k]; })));
    var figW = divItem ? (G.hi - G.lo + 1) * CW + leftExtra : (opCol - G.lo + 1) * CW + OPG;
    var totW = figW + 28 + Math.max(capW, labMax);
    var x0 = Math.max(8, (W - totW) / 2), y0 = Math.max(0, (H - G.h) / 2), leftCol = divItem ? G.hi : opCol;
    return {cw: CW, G: G, opCol: opCol, opX: x0 + CW / 2, divItem: divItem, labW: labW, figW: figW, totW: totW, x0: x0, y0: y0, capX: x0 + figW + 28,
      X: function(p){ return x0 + leftExtra + (leftCol - p) * CW + CW / 2; },
      Yb: function(r){ return y0 + G.base(r); }, Yt: function(r){ return y0 + G.top[r]; }, Ybot: function(r){ return y0 + G.bot(r); }};
  }
  return {parse: parse, build: build, geom: geom, layout: layout, est: est, read: read, dec: dec, placeName: placeName, FS: FS, SS: SS, CW: CW0, CWSUB: CWSUB, SHX: SHX, SHY: SHY, CAP: CAP, FIT: FIT, ROWH: ROWH};
})();

var ON = function(v){ return /^(on|true|yes)$/i.test(String(v || "").trim()); };
DECK.define("m-hissan", class extends DECK.MotionElement {
  static variants = ["fade", "draw"];
  static preview = "none";   // 数字は計算そのものなので、授業の表示でも先の段階を見せない（仕様 §8.4、docs/conventions.md §1.2）
  static calc = CALC;
  // データは属性だけ（子の JSON はない）
  static shape = {schema: null, example: '<m-hissan expr="487+356"></m-hissan>'};
  static props = {
    expr:   {type: "string", default: "", doc: "式：487+356、1003-457、36×24、851÷23、3.6×2.4、7.56÷1.8（× は * でも、÷ は / でもよい）"},
    build:  {type: "string", default: "steps", doc: "steps（手順ごと）か whole（1 段階で全部）"},
    fine:   {type: "string", default: "off", doc: "かけ算：on なら 1 けたずつ（小さなくり上がりを書く）"},
    per:    {type: "string", default: "round", doc: "わり算：round（商 1 けた＝1 段階）か phase（たてる・かける・ひく・おろす を別の段階に）"},
    kari:   {type: "string", default: "off", doc: "わり算：on なら大きすぎる仮の商を 1 回見せて直す"},
    rem:    {type: "string", default: "off", doc: "わり算：on なら商を整数で止めて あまり を出す"},
    digits: {type: "json", default: null, doc: "わり算：商を小数第何位まで求めるか", shape: {type: "integer"}, example: 2},
    carry:  {type: "string", default: "line", doc: "たし算のくり上がり：line（答えの線のすぐ上）か top（上の数の上）"},
    words:  {type: "string", default: "on", doc: "off なら右の手順の言葉を出さない"},
    focus:  {type: "string", default: "on", doc: "いま計算している位・行に薄い色"},
    dur:    {type: "number", default: 0.9, doc: "1 つの手順の秒数"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps;
  }
  // 筆算の中身と段階（mount の前にも steps が要るので、属性と大きさだけから決める）
  plan(){
    if (this._plan) return this._plan;
    var P = this.props, notes = [], build = P.build, per = P.per;
    if (["steps", "whole"].indexOf(build) < 0){ notes.push('m-hissan: build="' + build + '" is not steps or whole (steps is used)'); build = "steps"; }
    if (["round", "phase"].indexOf(per) < 0){ notes.push('m-hissan: per="' + per + '" is not round or phase (round is used)'); per = "round"; }
    var e = CALC.parse(P.expr), o = {fine: ON(P.fine), kari: ON(P.kari), rem: ON(P.rem), digits: P.digits, carry: P.carry};
    if (["line", "top"].indexOf(P.carry) < 0){ notes.push('m-hissan: carry="' + P.carry + '" is not line or top (line is used)'); o.carry = "line"; }
    if (o.digits != null && (!isFinite(o.digits) || o.digits < 0 || o.digits > 8)){ notes.push("m-hissan: digits=" + o.digits + " is not 0–8 (ignored)"); o.digits = null; }
    var M;
    if (e.op === "÷" && o.digits == null && !o.rem && !(e.A.scale === 0 && e.B.scale === 0)){
      // 小数のわり算で digits がない：わり切れるまで。ただし、スライドの本文に入る高さ（CALC.FIT px）まで。
      // 要素の大きさで決めない（段階の数が配置の前に決まるように）。入らなければ止めて知らせる
      var best = null;
      for (var cap = 0; cap <= 4; cap++){
        var Mc = CALC.build(P.expr, Object.assign({}, o, {cap: cap}));
        if (best && CALC.geom(Mc).h > CALC.FIT) break;
        best = Mc;
        if (Mc.info.exact) break;
      }
      M = best;
      if (!M.info.exact) notes.push("m-hissan: " + P.expr + " does not end within " + M.info.frac + " decimal place(s) that fit the element; write digits=\"…\" or rem=\"on\"");
    } else M = CALC.build(P.expr, o);
    if (e.op !== "÷" && (ON(P.kari) || ON(P.rem) || P.digits != null)) notes.push("m-hissan: kari, rem and digits are for division (ignored)");
    if (e.op !== "×" && ON(P.fine)) notes.push('m-hissan: fine="on" is for multiplication (ignored)');
    if (o.kari && e.op === "÷" && !M.info.rounds.some(function(r){ return r.kari !== undefined; })) notes.push('m-hissan: kari="on", but no provisional quotient is too big in ' + P.expr + " (nothing to correct)");
    // 手順（phase）→ 段階（step）と段階の中の順（ph）
    var map = [], steps = 0, nph = [0], prev = null;
    M.phases.forEach(function(ph, i){
      var k, j;
      if (build === "whole"){ k = 1; j = 0; }
      else if (M.op === "÷" && per === "phase"){ k = ++steps; j = 0; }
      else { if (ph.grp !== prev){ steps++; nph[steps] = 0; prev = ph.grp; } k = steps; j = nph[k]; }
      if (build === "whole") steps = 1;
      nph[k] = Math.max(nph[k] || 0, j + 1);
      map.push({k: k, j: j});
    });
    if (build === "whole"){ steps = 1; nph = [0, 1]; }
    else if (M.op === "÷" && per === "phase"){ nph = [0]; for (var s = 1; s <= steps; s++) nph.push(1); }
    return (this._plan = {M: M, map: map, steps: Math.max(1, steps), nph: nph, build: build, per: per, notes: notes});
  }
  mount(){
    var self = this, P = this.props, D = DECK, pl = this.plan(), M = pl.M, C = CALC;
    this.variant = VARIANT.of(this);
    pl.notes.forEach(function(n){ console.warn(n); });
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight, whole = pl.build === "whole", words = !whole && ON(P.words), FS = C.FS, SS = C.SS, CAPS = C.CAP;
    var Lo = C.layout(M, W, H, !words), CW = Lo.cw, G = Lo.G, X = Lo.X, Yb = Lo.Yb, Yt = Lo.Yt, Ybot = Lo.Ybot, capX = Lo.capX, labW = Lo.labW, divItem = Lo.divItem, opCol = Lo.opCol;
    if (Lo.totW > W - 8) console.warn("m-hissan: " + P.expr + " needs " + Math.round(Lo.totW) + " px of width, but the element is " + W + " px (it overflows); give it more width");
    if (G.h > H) console.warn("m-hissan: " + P.expr + " needs " + Math.round(G.h) + " px of height, but the element is " + H + " px (it overflows); give it more height" + (M.op === "÷" ? " or fewer digits" : ""));
    this.geo = {X: X, Yb: Yb, capX: capX};
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var gF = D.el("g", {}, svg), gL = D.el("g", {}, svg), gT = D.el("g", {}, svg);
    var items = this.items = [], draw = this.variant === "draw";
    var put = function(el, it, kind){ items.push({el: el, it: it, kind: kind}); return el; };
    var num = function(par, x, y, s, size, tone, anchor){
      var t = D.el("text", {x: x.toFixed(1), y: y.toFixed(1), "font-size": size, "text-anchor": anchor || "middle", fill: "var(--" + (tone || "fg") + ")", opacity: 0,
        style: "font-variant-numeric:tabular-nums"}, par);
      t.textContent = s; return t;
    };
    var line = function(par, x1, y1, x2, y2, attrs){ return D.el("line", Object.assign({x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: "var(--fg)", "stroke-width": 3, "stroke-linecap": "round", opacity: 0}, attrs || {}), par); };
    var path = function(par, d, attrs){ return D.el("path", Object.assign({d: d, fill: "none", stroke: "var(--fg)", "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0}, attrs || {}), par); };
    // 小さな数の横の 1：その位に小さな数（くり下げた数）があればその左、なければ大きな字の左上
    var smallAt = {};
    M.items.forEach(function(it){ if (it.t === "d" && it.sz === "S" && !it.pos) smallAt[it.r + ":" + it.p] = it; });
    var rows = M.rows;
    var ruleL = Lo.opX - CW / 2 + 4, ruleR = X(G.lo) + CW / 2 - 4;
    M.items.forEach(function(it){
      var el;
      switch (it.t){
        case "d": {
          var small = it.sz === "S", x = X(it.p), y = Yb(it.r);
          if (it.pos === "shoulder") el = num(gT, x - C.SHX, y - C.SHY, it.s, 24, it.tone, "end");
          else if (it.pos === "beside"){
            var red = smallAt[it.r + ":" + it.p];
            el = num(gT, red ? x - 11 : x - 8, y, it.s, SS, it.tone, "end");
          } else el = num(gT, x, y, it.s, small ? SS : FS, it.tone);
          put(el, it, "text"); break;
        }
        case "op": put(num(gT, Lo.opX, Yb(it.r), it.s, FS, "fg"), it, "text"); break;
        case "pt": {
          var px = X(it.p) + CW / 2, py = Yb(it.r) - 3;
          put(D.el("circle", {cx: px.toFixed(1), cy: py.toFixed(1), r: 4.5, fill: "var(--fg)", opacity: 0}, gT), it, "shape"); break;
        }
        case "ptx": {
          var qx = X(it.p) + CW / 2, qy = Yb(it.r) - 3;
          put(line(gL, qx - 7, qy + 7, qx + 7, qy - 7, {stroke: "var(--emph)", "stroke-width": 2.5}), it, "line");
          put(line(gL, qx - 7, qy - 7, qx + 7, qy + 7, {stroke: "var(--emph)", "stroke-width": 2.5}), it, "line"); break;
        }
        case "slash": {
          var sx = X(it.p), sy = Yb(it.r);
          put(line(gL, sx - 15, sy + 2, sx + 15, sy - 40, {stroke: "var(--emph)"}), it, "line"); break;
        }
        case "strike": {
          var a = X(it.p0) - (it.withPt ? CW / 2 + 6 : 15), b = X(it.p1) + 15, ty = Yb(it.r);
          put(line(gL, a, ty + 2, b, ty - 40, {stroke: "var(--emph)"}), it, "line"); break;
        }
        case "xline": {
          var xy = Yb(it.r) - 18;
          put(line(gL, X(it.p0) - 20, xy, X(it.p1) + 20, xy, {stroke: "var(--emph)"}), it, "line"); break;
        }
        case "rule": {
          var ry = Yb(it.r);
          if (it.p0 !== undefined) put(line(gL, X(it.p0) - CW / 2 + 4, ry, X(it.p1) + CW / 2 - 4, ry), it, "line");
          else put(line(gL, ruleL, ry, ruleR, ry), it, "line");
          break;
        }
        case "bracket": {
          var bt = Yt(it.r) - 6, bb = Ybot(it.r) - 2, bx = X(G.hi) - CW / 2 - 6;
          put(path(gL, "M" + bx.toFixed(1) + "," + bt.toFixed(1) + " C" + (bx + 16).toFixed(1) + "," + (bt + (bb - bt) * 0.3).toFixed(1) + " " + (bx + 16).toFixed(1) + "," + (bt + (bb - bt) * 0.7).toFixed(1) + " " + bx.toFixed(1) + "," + bb.toFixed(1), {"stroke-width": 3}), it, "line");
          put(line(gL, bx, bt, X(G.lo) + CW / 2, bt), it, "line");
          self.geo.bx = bx;
          break;
        }
        case "div": {
          // わる数：括弧の左に右寄せ。小数点はうつす前の位置に
          var bx2 = X(G.hi) - CW / 2 - 6, ds = it.s.replace(".", "").split(""), n = ds.length, y2 = Yb(it.r), fp = it.point ? it.s.split(".")[1].length : 0;
          var dx = function(i){ return bx2 - 14 - (n - 1 - i) * CW - CW / 2; };
          ds.forEach(function(c, i){ put(num(gT, dx(i), y2, c, FS, "fg"), it, "text"); });
          if (it.point){
            var dpx = dx(n - 1 - fp) + CW / 2;
            put(D.el("circle", {cx: dpx.toFixed(1), cy: (y2 - 3).toFixed(1), r: 4.5, fill: "var(--fg)", opacity: 0}, gT), it, "shape");
          }
          self.geo.divX = dx; self.geo.divN = n; self.geo.divFp = fp;
          break;
        }
        case "move": {
          // 小数点をうつす矢印：1 けたずつ、字の下に
          var my, xs;
          if (it.who === "div"){
            my = Yb(divItem.r) + 8; var gdx = self.geo.divX, nn = self.geo.divN, ff = self.geo.divFp; xs = [];
            for (var i2 = 0; i2 <= ff; i2++) xs.push(gdx(nn - 1 - ff + i2) + CW / 2);
            // わる数のもとの小数点に ×
            put(line(gL, xs[0] - 7, my - 4, xs[0] + 7, my - 18, {stroke: "var(--emph)", "stroke-width": 2.5}), it, "line");
            put(line(gL, xs[0] - 7, my - 18, xs[0] + 7, my - 4, {stroke: "var(--emph)", "stroke-width": 2.5}), it, "line");
          }
          else { my = Yb(it.r) + 8; xs = []; for (var i3 = 0; i3 <= it.n; i3++) xs.push(X(it.from - i3) + CW / 2); }
          for (var h = 0; h + 1 < xs.length; h++){
            var xa = xs[h] + 3, xb = xs[h + 1] - 3, mid = (xa + xb) / 2;
            put(path(gL, "M" + xa.toFixed(1) + "," + my.toFixed(1) + " Q" + mid.toFixed(1) + "," + (my + 16).toFixed(1) + " " + xb.toFixed(1) + "," + my.toFixed(1) +
              " M" + (xb - 8).toFixed(1) + "," + (my + 1).toFixed(1) + " L" + xb.toFixed(1) + "," + my.toFixed(1) + " L" + (xb - 2).toFixed(1) + "," + (my + 8).toFixed(1), {stroke: "var(--emph)"}), Object.assign({}, it, {o: (it.o || 0) + h * 0.12}), "line");
          }
          break;
        }
        case "count": {
          var cy = Yt(it.r) + 4, xr = X(it.p) + CW / 2 - 3, xl = X(it.p) - CW / 2 + 3, cm = (xr + xl) / 2;
          put(path(gL, "M" + xr.toFixed(1) + "," + cy.toFixed(1) + " Q" + cm.toFixed(1) + "," + (cy + 18).toFixed(1) + " " + xl.toFixed(1) + "," + cy.toFixed(1) +
            " M" + (xl + 8).toFixed(1) + "," + (cy + 1).toFixed(1) + " L" + xl.toFixed(1) + "," + cy.toFixed(1) + " L" + (xl + 2).toFixed(1) + "," + (cy + 8).toFixed(1), {stroke: "var(--emph)"}), it, "line");
          put(num(gT, cm, cy + 46, String(it.n), 24, "emph"), it, "text");
          break;
        }
        case "lab": put(num(gT, capX, Yb(it.r) - (rows[it.r].k === "L" ? 10 : 0), it.s, CAPS, "fg", "start"), it, "text"); break;
        case "cap": if (words) put(num(gT, capX + (labW[it.r] || 0), Yb(it.r) - (rows[it.r].k === "L" ? 10 : 0), it.s, CAPS, "fg", "start"), it, "cap"); break;
        case "focus": {
          if (whole || !ON(P.focus)) break;
          var fx = X(it.p0) - CW / 2 + 3, fw = X(it.p1) + CW / 2 - 3 - fx, ft = it.r0 === null || it.r0 === undefined ? Yt(it.r1) : Yt(it.r0), fb = Ybot(it.r1);
          put(D.el("rect", {x: fx.toFixed(1), y: (ft + 2).toFixed(1), width: fw.toFixed(1), height: (fb - ft - 4).toFixed(1), rx: 8, fill: "var(--emph)", "fill-opacity": 0.1, stroke: "none", opacity: 0}, gF), it, "cap");
          break;
        }
      }
    });
    // 線を引く見せ方（draw）：線は pathLength 1 の破線で伸ばす
    if (draw) items.forEach(function(o){ if (o.kind === "line") o.el.setAttribute("pathLength", 1); });
    // 手順の番号 → (段階, 段階の中の順)。キャプションとフォーカスは、同じ段階の次のキャプション・フォーカスまで
    var at = function(g){ return g < 0 ? {k: 0, j: 0} : pl.map[g]; };
    items.forEach(function(o){
      var a = at(o.it.g);
      o.k = a.k; o.j = a.j;
      if (o.it.end !== undefined){ var e = at(o.it.end); o.ek = e.k; o.ej = e.j; }
    });
    ["cap"].forEach(function(kind){
      // 同じ段階の中で、次に現れる同じ種類（言葉は言葉、フォーカスはフォーカス）の手前で消す
      items.forEach(function(o){
        if (o.kind !== kind) return;
        var type = o.it.t, nxt = null;
        items.forEach(function(p){ if (p.kind === kind && p.it.t === type && p.k === o.k && p.j > o.j && (nxt === null || p.j < nxt)) nxt = p.j; });
        o.until = nxt;
      });
    });
  }
  duration(k){
    var pl = this.plan();
    return k >= 1 && k <= pl.steps ? (pl.nph[k] || 1) * this.props.dur : 0;
  }
  cues(k){
    var pl = this.plan(), n = pl.nph[k] || 0, P = this.props.dur, out = [];
    for (var j = 1; j < n; j++) out.push(+(j * P).toFixed(3));
    return out.length ? out : null;
  }
  render(k, t, ctx){
    // 先の段階は授業の表示（ctx.preview）でも見せない：筆算の数字は計算そのもので、先に見えると答えになる（static preview = "none"）
    var D = DECK, P = this.props.dur, draw = this.variant === "draw", whole = this.plan().build === "whole";
    this.items.forEach(function(o){
      var it = o.it, e, op;
      var o0 = (it.o || 0) * P, len = (it.l !== undefined ? it.l : 0.6) * P;
      var start = whole ? 0 : o.j * P + o0;
      if (o.kind === "cap"){
        // その段階の中だけ
        if (o.k !== k){ o.el.setAttribute("opacity", 0); return; }
        var on = D.prog(t, o.j * P, P * 0.3), off = o.until === null ? 0 : D.prog(t, o.until * P, 0.001);
        o.el.setAttribute("opacity", (on * (1 - off)).toFixed(3));
        return;
      }
      if (it.g < 0 || o.k < k) e = 1;
      else if (o.k > k) e = 0;
      else e = D.prog(t, start, len);
      // 消えるもの（仮の商とその積）
      var gone = 0;
      if (it.end !== undefined){
        if (o.ek < k) gone = 1;
        else if (o.ek === k) gone = D.prog(t, (whole ? 0 : o.ej * P) + (it.endo || 0) * P, P * 0.3);
        if (whole) gone = 1;
      }
      op = e;
      if (draw && o.kind === "line"){
        o.el.setAttribute("stroke-dasharray", e >= 1 ? "none" : e.toFixed(4) + " 2");
        op = e > 0 ? 1 : 0;
      }
      o.el.setAttribute("opacity", (op * (1 - gone)).toFixed(3));
    });
  }
});
})();
