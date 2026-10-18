// m-codetree：符号の木で 2 値の系列を復号する（ファクシミリの MH 符号：白と黒のランを交互に読む）
// <m-codetree style="height:530px"><script type="application/json">
//   {"table": [{"run": 2, "white": "0111", "black": "11"}, {"run": 64, "white": "11011", "black": "0000001111"}, …],
//    "bits": "11011011111"}
// （JSON の終わり）</m-codetree>
// 木は表から作る（根の左が白の木、右が黒の木。枝の 0 が左、1 が右）。表は [{run, white, black}] か {"white": {"符号": ラン}, "black": {…}}。
// run が 64 以上はメイクアップ符号（同じ色のまま、次に終端符号が続く）、64 未満は終端符号（次は反対の色）、"EOL" は行の終わり（次は白）。
// 1 段階 = 1 符号語。段階の中で読む 1 ビットごとに cue（口述原稿の {cue}）。最後の段階は「まとめ」（復号した符号語の道をすべて出す）。
// 画面：上に符号の系列と読む位置、中に木（今の色の木だけを広げ、ほかは畳む）、下に復号した画素の並び（ランの長さだけの白・黒の升目）。
// 段階の決め方：1 ビット 1 段階にすると口述原稿が 1 ビット 1 行に細切れになるので、1 符号語 = 1 段階とし、ビットは段階の中の cue にした
//   （cues(k) は読むビットごとの時刻。原稿に {cue} をビットの数だけ書けば読む位置が言葉に合い、書かなければ動きの長さのまま）。
//   段階 0 は白の木だけを広げた初めの姿。段階 k の中：木を広げ直す（move 秒）→ 根から色の木へ → 1 ビットごとに 1 本（bit 秒）→ 葉に着く →
//   画素の升目を塗る（fill 秒）。最後の段階（summary="false" で外す）は両方の木と復号したすべての道（印刷・静止の姿）
// data-mark（頭の ct は属性 mark で変える）：ct-root、ct-w / ct-b（色の木の根）、ct-w-1101（白の木の符号 1101 の節・葉）、ct-w64 / ct-b2 / ct-weol
//   （葉の数字）、ct-bit-3（系列の 3 桁目）、ct-cw-2（2 つ目の符号語の括弧と結果）、ct-run-1（1 つ目の画素のラン）、ct-scan（画素の並び）、ct-bad（表にない枝）、
//   ct-crumb（窓の上の「ここまで」）
// 深い木（黒の符号は 13 ビットまで）：入らなければ window 段の窓だけを見せ、たどる点を追って木を下から上へ流す（窓の位置も (k, t) だけで決まる）。
//   窓の上に「黒の木：ここまで 0000 0110」。window="auto"（既定）は段の間が 44 px より狭くなるときだけ流す。まとめの段階はいちばん深い道の窓
// JSON の labels で文言を変える：white black start read makeup term eol invalid incomplete dangling done scan crumb（{c} は色、{n} は桁）
// 復号の規則は DECK.codetree（試験は tools/test-codetree.mjs）
(function(){
var D = window.DECK;

// ---------------------------------------------------------------- 表・木・復号（ブラウザによらない）
var COLORS = ["white", "black"];
function runOf(v, where){
  if (typeof v === "number" && v >= 0 && Math.floor(v) === v) return v;
  var s = String(v).trim();
  if (/^\d+$/.test(s)) return +s;
  if (/^eol$/i.test(s)) return "EOL";
  throw new Error("m-codetree: " + where + " のランの長さ " + JSON.stringify(v) + " は 0 以上の整数か \"EOL\"");
}
function kindOf(run){ return run === "EOL" ? "eol" : run >= 64 ? "makeup" : "term"; }
// 表を {white: [{code, run}], black: […]} にする
function normalize(tab){
  var out = {white: [], black: []};
  if (Array.isArray(tab)) tab.forEach(function(r, i){
    COLORS.forEach(function(c){
      if (r[c] === undefined || r[c] === null || r[c] === "") return;
      out[c].push({code: String(r[c]).replace(/\s+/g, ""), run: runOf(r.run, "table[" + i + "]")});
    });
  });
  else if (tab && typeof tab === "object") COLORS.forEach(function(c){
    var o = tab[c] || {};
    Object.keys(o).forEach(function(code){ out[c].push({code: code.replace(/\s+/g, ""), run: runOf(o[code], c + "." + code)}); });
  });
  else throw new Error("m-codetree: table は配列か {white, black}");
  return out;
}
// 符号の木（2 分木）。節は {code, kids: [0 の子, 1 の子], leaf: {run, kind} | null}。頭が重なる符号は誤り
function buildTree(list, color){
  var root = {code: "", kids: [null, null], leaf: null};
  list.forEach(function(e){
    if (!/^[01]+$/.test(e.code)) throw new Error("m-codetree: " + color + " の符号 " + JSON.stringify(e.code) + " は 0 と 1 だけで書く");
    var n = root;
    for (var i = 0; i < e.code.length; i++){
      if (n.leaf) throw new Error("m-codetree: " + color + " の符号 " + e.code + " の頭が " + n.code + "（ラン " + n.leaf.run + "）と同じ（語頭符号でない）");
      var b = +e.code[i];
      n = n.kids[b] || (n.kids[b] = {code: e.code.slice(0, i + 1), kids: [null, null], leaf: null});
    }
    if (n.leaf || n.kids[0] || n.kids[1]) throw new Error("m-codetree: " + color + " の符号 " + e.code + " がほかの符号と重なる");
    n.leaf = {run: e.run, kind: kindOf(e.run)};
  });
  return root;
}
function build(tab){
  var n = normalize(tab);
  return {white: buildTree(n.white, "white"), black: buildTree(n.black, "black")};
}
// MH の復号：白から始め、木を根からたどって葉に着いたら 1 語。終端符号のあとは反対の色、メイクアップ符号のあとは同じ色、EOL のあとは白。
// error：invalid（表にない枝。pos はその桁）、incomplete（系列が符号の途中で終わる）、dangling（メイクアップ符号の後に終端符号がない）
function decode(trees, bits){
  bits = String(bits || "").replace(/\s+/g, "");
  if (!/^[01]*$/.test(bits)) throw new Error("m-codetree: bits は 0 と 1 だけで書く");
  var color = "white", pos = 0, tokens = [], error = null;
  while (pos < bits.length){
    var n = trees[color], start = pos;
    while (!n.leaf){
      if (pos >= bits.length){ error = {kind: "incomplete", start: start, pos: pos, color: color, code: bits.slice(start)}; break; }
      var nx = n.kids[+bits[pos]];
      if (!nx){ error = {kind: "invalid", start: start, pos: pos, color: color, code: bits.slice(start, pos + 1), at: n.code}; break; }
      n = nx; pos++;
    }
    if (error) break;
    tokens.push({code: n.code, start: start, end: pos, color: color, run: n.leaf.run, kind: n.leaf.kind});
    if (n.leaf.kind === "term") color = color === "white" ? "black" : "white";
    else if (n.leaf.kind === "eol") color = "white";
  }
  if (!error && tokens.length && tokens[tokens.length - 1].kind === "makeup") error = {kind: "dangling", start: pos, pos: pos, color: color, code: ""};
  return {bits: bits, tokens: tokens, error: error, next: color};
}
// 画素のラン：続く同じ色の符号語（メイクアップ＋終端）を 1 つのランにまとめる。EOL は区切り
function runs(tokens){
  var out = [], cur = null, cell = 0;
  tokens.forEach(function(t, i){
    if (t.kind === "eol"){ cur = null; return; }
    if (!cur || cur.color !== t.color){ cur = {color: t.color, toks: [], start: cell, len: 0}; out.push(cur); }
    cur.toks.push(i); cur.len += t.run; cell += t.run;
  });
  return out;
}
D.codetree = {normalize: normalize, build: build, decode: decode, runs: runs};
if (!D.MotionElement) return;   // 試験（Node）では復号の規則だけ

// ---------------------------------------------------------------- 部品
var NAMES = {white: "白", black: "黒", start: "最初は白の木から読む", read: "{c}の木をたどる", makeup: "メイクアップ符号：次も{c}",
  term: "終端符号：次は{c}", eol: "行の終わり：次は白", invalid: "表にない符号（{n} 桁目）", incomplete: "系列が符号の途中で終わる",
  dangling: "メイクアップ符号の後に終端符号がない", done: "復号完了", scan: "画素", crumb: "{c}の木：ここまで"};
var LETTER = {white: "w", black: "b"};
// 字の幅の見積もり（字の読み込みによらず同じ配置にする）
// 誤りの段階でたどれる道（表にない枝の手前まで）
function errPath(e){ return e.kind === "invalid" ? e.code.slice(0, -1) : e.code; }
// 枝の字の位置：親 a から子 b への線の f の所から、線に垂直に外側へ off px（字の中心。y は字の基線）
function labelAt(a, b, f, off){
  var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = dx < 0 ? -dy / L : dy / L, ny = -Math.abs(dx) / L;
  return {x: a.x + dx * f + nx * off, y: a.y + dy * f + ny * off + 8};
}
function fmt0(s, c){ return String(s).replace("{c}", c); }
function textW(s, fs){ return [...String(s)].reduce(function(a, ch){ return a + (/[\u0000-ɏ]/.test(ch) ? 0.6 : 1); }, 0) * fs; }

D.define("m-codetree", class extends D.MotionElement {
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["table"], properties: {
      table: {type: ["array", "object"], items: {type: "object", required: ["run"], properties: {run: {type: ["integer", "string"]}, white: {type: "string"}, black: {type: "string"}}},
        properties: {white: {type: "object"}, black: {type: "object"}}},
      bits: {type: "string"}, labels: {type: "object"}}},
    example: {table: [{run: 2, white: "0111", black: "11"}, {run: 64, white: "11011", black: "0000001111"}], bits: "110110111"},
  };
  static props = {
    bits:    {type: "string", default: "", doc: "復号する系列（JSON の bits より先）"},
    depth:   {type: "number", default: 4, doc: "畳まずに見せる深さ（読む道はいつも広げる）"},
    bit:     {type: "number", default: 0.6, doc: "1 ビットを読む秒数"},
    move:    {type: "number", default: 0.6, doc: "木を広げ直す秒数"},
    fill:    {type: "number", default: 0.8, doc: "画素の升目を塗る秒数"},
    summary: {type: "bool", default: true, doc: "最後にまとめの段階を足す"},
    mark:    {type: "string", default: "ct", doc: "data-mark の頭"},
    window:  {type: "string", default: "auto", doc: "木を見せる段の数（auto：入らなければ、たどる点を追って木を流す）"},
  };
  // 復号と段階の計画（データだけから決める）
  model(){
    if (this._model) return this._model;
    var d = this.data || {}, P = this.props;
    var trees = build(d.table), r = decode(trees, P.bits || d.bits || "");
    var plan = r.tokens.map(function(t, i){ return {type: "tok", tok: i}; });
    if (r.error && r.error.kind !== "dangling") plan.push({type: "err"});
    if (P.summary && plan.length) plan.push({type: "sum"});
    return (this._model = {trees: trees, dec: r, plan: plan, runs: runs(r.tokens), L: Object.assign({}, NAMES, d.labels || {})});
  }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.model().plan.length;
  }
  // 段階 k（1〜）の時刻：s(i) は道の i 本目（0 本目は根から色の木へ）を引き始める時刻。cue は読む 1 ビットごと
  times(k){
    var m = this.model(), P = this.props, p = m.plan[k - 1];
    if (!p) return null;
    var nb = p.type === "tok" ? m.dec.tokens[p.tok].code.length : p.type === "err" ? m.dec.error.code.length : 0;
    var s = function(i){ return P.move + i * P.bit; };
    var A = s(nb) + 0.7 * P.bit;   // 葉に着く
    return {nb: nb, s: s, A: A, F0: A + 0.15, F1: A + 0.15 + P.fill};
  }
  duration(k){
    var m = this.model(), p = m.plan[k - 1], T = this.times(k);
    if (!p) return 0;
    if (p.type === "sum") return this.props.move + 1.1;
    if (p.type === "err") return T.A + 0.5;
    return T.F1 + 0.1;
  }
  cues(k){
    var p = this.model().plan[k - 1], T = this.times(k);
    if (!p || p.type === "sum") return null;
    var c = [];
    for (var i = 1; i <= T.nb; i++) c.push(+T.s(i).toFixed(3));
    return c;
  }
  // 段階 k の木の形：見せる節の位置と種類（int 広げた節・fan 畳んだ節・leaf 葉）
  layoutFor(k){
    var m = this.model(), p = k ? m.plan[k - 1] : null, dec = m.dec;
    var focus, paths = {white: [], black: []}, both = false, cur = null;
    if (!p){ focus = "white"; }
    else if (p.type === "tok"){ var t = dec.tokens[p.tok]; focus = t.color; paths[focus].push(t.code); cur = {color: focus, code: t.code}; }
    else if (p.type === "err"){ focus = dec.error.color; var ep = errPath(dec.error); paths[focus].push(dec.error.code); cur = {color: focus, code: ep, bad: dec.error.kind === "invalid" ? dec.error.code : null}; }
    else {
      both = true;
      dec.tokens.forEach(function(t){ paths[t.color].push(t.code); });
      if (dec.error && dec.error.kind !== "dangling") paths[dec.error.color].push(dec.error.code);
    }
    var W = this.W, G = this.G, self = this;
    var make = function(depth){
      var nodes = {}, slots = [], maxLv = 1, ghosts = {};
      var open = function(c, n){
        if (n.leaf) return false;
        if (!both && c !== focus) return false;
        if (n.code.length < depth) return true;
        return paths[c].some(function(q){ return q.length > n.code.length && q.slice(0, n.code.length) === n.code; });
      };
      var visit = function(c, n, id, lv, parent){
        var o = {id: id, c: c, code: n.code, lv: lv, parent: parent, leaf: n.leaf, kids: []};
        nodes[id] = o; maxLv = Math.max(maxLv, lv);
        if (open(c, n)){
          o.kind = "int";
          // 表にない枝は空きの場所（ghost）にする：1 の子だけでも右に寄り、誤りの × をそこに置ける
          [0, 1].forEach(function(b){
            if (n.kids[b]) o.kids.push(visit(c, n.kids[b], id + b, lv + 1, id));
            else { var g = {id: id + b, lv: lv + 1, ghost: true, kids: []}; ghosts[id + b] = g; slots.push(g); o.kids.push(g); }
          });
          if (!o.kids.length){ o.kind = "fan"; slots.push(o); }
        } else { o.kind = n.leaf ? "leaf" : "fan"; slots.push(o); }
        return o;
      };
      nodes.r = {id: "r", lv: 0, kind: "int", kids: [], c: null, code: ""};
      COLORS.forEach(function(c){ nodes.r.kids.push(visit(c, m.trees[c], LETTER[c], 1, "r")); });
      return {nodes: nodes, slots: slots, maxLv: maxLv, ghosts: ghosts};
    };
    var d = Math.max(1, this.props.depth), L = make(d);
    while (d > 1 && W / L.slots.length < 64){ d--; L = make(d); }
    var sw = W / L.slots.length;
    L.slots.forEach(function(o, i){ o.x = (i + 0.5) * sw; });
    var px = function(o){ if (o.x === undefined){ o.kids.forEach(px); o.x = (o.kids[0].x + o.kids[o.kids.length - 1].x) / 2; } return o.x; };
    px(L.nodes.r);
    // 段の間：葉の数字と畳んだ節の三角の分を下に空ける
    // 木が入らなければ（段の間が 44 px より狭くなる、または段の数が属性 window より多い）、win 段の窓だけを見せ、
    // たどる点を追って窓を下へ流す（窓の上は「ここまで」の行）。段の位置は y0 + (lv − cam) × gap（cam は render が (k, t) から決める）
    var avail = G.treeBottom - G.treeTop - 44, wp = String(this.props.window || "auto").trim(), nwin = /^\d+$/.test(wp) ? Math.max(2, +wp) : 0;
    L.follow = nwin ? L.maxLv > nwin : avail / L.maxLv < 44;
    if (!L.follow){ L.y0 = G.treeTop; L.win = L.maxLv; L.gap = Math.min(78, avail / L.maxLv); }
    else { L.y0 = G.treeTop + 44; var av2 = G.treeBottom - 44 - L.y0; L.win = nwin || Math.max(3, Math.floor(av2 / 56)); L.gap = av2 / L.win; }
    L.camMax = Math.max(0, L.maxLv - L.win);
    var gap = L.gap;
    Object.keys(L.nodes).forEach(function(id){ var o = L.nodes[id]; o.y = L.y0 + o.lv * gap; });
    Object.keys(L.ghosts).forEach(function(id){ var o = L.ghosts[id]; o.y = L.y0 + o.lv * gap; });
    // まとめで窓を合わせる道（いちばん深い道）
    L.deep = null;
    COLORS.forEach(function(c){ paths[c].forEach(function(q){ if (!L.deep || q.length > L.deep.code.length) L.deep = {color: c, code: q}; }); });
    // 0 と 1 を書く枝：今の道（とまとめのすべての道）の節の 2 つの子へ。根から色の木への枝はいつも
    var lab = {w: 1, b: 1};
    COLORS.forEach(function(c){ paths[c].forEach(function(q){ for (var i = 0; i < q.length; i++){ var pre = LETTER[c] + q.slice(0, i); lab[pre + "0"] = 1; lab[pre + "1"] = 1; } }); });
    if (cur && cur.bad){ var pre = LETTER[cur.color] + cur.code; lab[pre + "0"] = 1; lab[pre + "1"] = 1; }
    L.lab = lab; L.sw = sw; L.gap = gap; L.cur = cur; L.paths = paths; L.both = both; L.focus = focus;
    return L;
  }
  // 窓の位置（段の数で。0 は根が窓の上の段）：たどる点の段 λ の 1 段下までが窓に入るように、λ から滑らかに決める
  camAt(k, t){
    var L = this.lay[k];
    if (!L.follow) return 0;
    var p = k ? this.model().plan[k - 1] : null, lam = 0;
    if (p && (p.type === "tok" || p.type === "err")){
      var T = this.times(k), P = this.props, n = L.cur.code.length + 1;
      for (var i = 0; i < n; i++) lam += D.prog(t, T.s(i), 0.7 * P.bit);
      if (L.cur.bad) lam += 0.6 * D.prog(t, T.s(T.nb), 0.3);
    } else if (p && L.deep) lam = L.deep.code.length + 1;
    return Math.max(0, Math.min(L.camMax, lam + 1 - L.win));
  }
  mount(){
    var D2 = D, P = this.props, self = this, m = this.model(), dec = m.dec, Lb = m.L, MK = P.mark;
    this.style.display = "block"; this.style.position = "relative";
    var W0 = this.clientWidth, H = this.clientHeight;
    this.W = W0 - 8; this.H = H;
    this.G = {treeTop: 112, treeBottom: H - 96, scanY: H - 82};
    var svg = D2.el("svg", {viewBox: "0 0 " + W0 + " " + H, width: W0, height: H, style: "display:block;overflow:visible"}, this);
    var root = D2.el("g", {transform: "translate(4 0)"}, svg);
    this.lay = [];
    for (var k = 0; k <= m.plan.length; k++) this.lay.push(this.layoutFor(k));
    // ---- 上：符号の系列と読む位置
    var nb = dec.bits.length, label0 = D2.el("text", {x: 0, y: 34, "font-size": 24, fill: "var(--muted)"}, root);
    label0.textContent = "符号";
    var bx0 = 64, cs = Math.max(22, Math.min(44, (this.W * 0.56 - bx0) / Math.max(1, nb))), bfs = Math.max(24, Math.min(32, cs * 0.75));
    this.B = {x0: bx0, cs: cs};
    var gBits = D2.el("g", {}, root);
    this.ptr = D2.el("rect", {x: 0, y: 4, width: cs - 2, height: 40, rx: 6, fill: "none", stroke: "var(--emph)", "stroke-width": 3, opacity: 0}, gBits);
    this.bitEls = [...dec.bits].map(function(b, j){
      var e = D2.el("text", {x: bx0 + (j + 0.5) * cs, y: 35, "font-size": bfs, "text-anchor": "middle", "font-weight": 700, fill: "var(--muted)", "data-mark": MK + "-bit-" + (j + 1)}, gBits);
      e.textContent = b; return e;
    });
    // 符号語ごとの括弧と結果（色の升目＋ランの長さ）
    var swatch = function(g, x, y, c, s){ return D2.el("rect", {x: x, y: y, width: s, height: s, fill: c === "black" ? "var(--fg)" : "var(--bg)", stroke: "var(--fg)", "stroke-width": 2}, g); };
    var bRight = -Infinity;
    this.brk = dec.tokens.map(function(t, i){
      var g = D2.el("g", {opacity: 0, "data-mark": MK + "-cw-" + (i + 1)}, root);
      var a = bx0 + t.start * cs + 4, b = bx0 + t.end * cs - 4;
      D2.el("path", {d: "M" + a + ",48v8H" + b + "v-8", fill: "none", stroke: "var(--fg)", "stroke-width": 2}, g);
      var s = t.kind === "eol" ? "EOL" : Lb[t.color] + " " + t.run, w = t.kind === "eol" ? textW(s, 24) : 20 + 6 + textW(s, 24), x = Math.max((a + b) / 2 - w / 2, bRight + 12);
      bRight = x + w;
      if (t.kind !== "eol") swatch(g, x, 64, t.color, 18);
      var tx = D2.el("text", {x: t.kind === "eol" ? x : x + 26, y: 82, "font-size": 24, fill: "var(--fg)"}, g);
      tx.textContent = s;
      return g;
    });
    // 右上の一言（読む前と読んだ後の 2 つを重ねて入れ替える）
    this.note = [0, 1].map(function(){ return D2.el("text", {x: self.W, y: 34, "font-size": 24, "text-anchor": "end", fill: "var(--fg)", opacity: 0}, root); });
    // ---- 中：木。どの段階かで見せる節をまとめて作る
    var gE = D2.el("g", {}, root), gP = D2.el("g", {}, root), gN = D2.el("g", {}, root);
    var all = {};
    this.lay.forEach(function(L){ Object.keys(L.nodes).forEach(function(id){ all[id] = L.nodes[id]; }); });
    this.els = {};
    Object.keys(all).forEach(function(id){
      var o = all[id], e = {id: id, parent: o.parent};
      if (o.parent){
        e.edge = D2.el("line", {stroke: "var(--line)", "stroke-width": 2.5}, gE);
        var top = o.parent === "r";
        e.lab = D2.el("text", {"font-size": 24, "text-anchor": "middle", fill: "var(--muted)"}, gE);
        e.lab.textContent = top ? Lb[o.c] : id.slice(-1);
        e.bit = id.slice(-1);
      }
      var g = D2.el("g", {}, gN);
      if (id !== "r") g.setAttribute("data-mark", MK + "-" + (o.c === "white" ? "w" : "b") + (o.code ? "-" + o.code : ""));
      else g.setAttribute("data-mark", MK + "-root");
      e.fan = D2.el("path", {d: "M0,13L-15,36L15,36Z", fill: "var(--line)", opacity: 0}, g);
      if (o.leaf){
        e.dot = D2.el("circle", {r: 13, fill: "var(--accent2)"}, g);
        e.ring = D2.el("circle", {r: 13, fill: "none", stroke: "var(--emph)", "stroke-width": 3, opacity: 0}, g);
        e.num = D2.el("text", {y: 42, "font-size": 24, "text-anchor": "middle", fill: "var(--fg)", "data-mark": MK + "-" + LETTER[o.c] + (o.leaf.run === "EOL" ? "eol" : o.leaf.run)}, g);
        e.num.textContent = o.leaf.run === "EOL" ? "EOL" : String(o.leaf.run);
      } else if (id === "r") e.dot = D2.el("circle", {r: 9, fill: "var(--fg)"}, g);
      else e.dot = D2.el("circle", {r: o.lv === 1 ? 12 : 10, fill: o.c === "black" ? "var(--fg)" : "var(--bg)", stroke: "var(--fg)", "stroke-width": 2.5}, g);
      e.g = g;
      self.els[id] = e;
    });
    // 道（段階ごとに 1 本。まとめではすべて）
    this.paths = m.plan.map(function(p, j){
      var o = j < m.plan.length && p.type !== "sum" ? self.lay[j + 1].cur : null;
      if (!o) return null;
      var ids = ["r", LETTER[o.color]];
      for (var i = 1; i <= o.code.length; i++) ids.push(LETTER[o.color] + o.code.slice(0, i));
      var segs = ids.slice(1).map(function(id, i){ return {a: ids[i], b: id, line: D2.el("line", {stroke: "var(--emph)", "stroke-width": 6, "stroke-linecap": "round", opacity: 0}, gP)}; });
      return {ids: ids, segs: segs, bad: o.bad};
    });
    // 表にない枝：破線の枝と × と、読んだビット
    this.stub = D2.el("g", {opacity: 0, "data-mark": MK + "-bad"}, gP);
    this.stubLine = D2.el("line", {stroke: "var(--emph)", "stroke-width": 4, "stroke-dasharray": "7 6"}, this.stub);
    this.stubLab = D2.el("text", {"font-size": 24, "font-weight": 700, "text-anchor": "middle", fill: "var(--emph)"}, this.stub);
    this.cross = D2.el("text", {"font-size": 34, "font-weight": 700, "text-anchor": "middle", fill: "var(--emph)"}, this.stub);
    this.cross.textContent = "×";
    // 窓の上の「ここまで」の行：今の符号語の色と、ここまで読んだビット
    this.crumb = D2.el("text", {x: 0, y: this.G.treeTop + 14, "font-size": 24, fill: "var(--muted)", opacity: 0, "data-mark": MK + "-crumb"}, root);
    this.crumbHead = D2.el("tspan", {}, this.crumb);
    this.crumbBits = D2.el("tspan", {"font-weight": 700, fill: "var(--emph)"}, this.crumb);
    this.token = D2.el("circle", {r: 9, fill: "var(--emph)", stroke: "var(--bg)", "stroke-width": 2.5, opacity: 0}, gP);
    // ---- 下：復号した画素の並び
    var G = this.G, sx0 = 70, total = m.runs.reduce(function(a, r){ return a + r.len; }, 0);
    var sl = D2.el("text", {x: 0, y: G.scanY + 22, "font-size": 24, fill: "var(--muted)"}, root);
    sl.textContent = Lb.scan;
    var sc = total ? Math.min(20, (this.W - sx0) / total) : 0;
    this.S = {x0: sx0, sc: sc, total: total};
    var gS = D2.el("g", {"data-mark": MK + "-scan"}, root);
    D2.el("line", {x1: sx0, x2: sx0 + total * sc, y1: G.scanY + 28, y2: G.scanY + 28, stroke: "var(--line)", "stroke-width": 2}, gS);
    var cellEach = total <= 160 && sc >= 5;
    this.cells = [];
    var cell = 0;
    dec.tokens.forEach(function(t, i){
      if (t.kind === "eol") return;
      var c = t.color === "black" ? "var(--fg)" : "var(--bg)";
      if (cellEach) for (var q = 0; q < t.run; q++) self.cells.push({tok: i, n: q, e: D2.el("rect", {x: sx0 + (cell + q) * sc, y: G.scanY, width: sc, height: 28, fill: c, stroke: "var(--fg)", "stroke-width": 1, opacity: 0}, gS)});
      else self.cells.push({tok: i, n: -1, run: t.run, x: sx0 + cell * sc, e: D2.el("rect", {x: sx0 + cell * sc, y: G.scanY, width: 0, height: 28, fill: c, stroke: "var(--fg)", "stroke-width": 1.5}, gS)});
      cell += t.run;
    });
    // ランの括弧と長さ（メイクアップ＋終端は「64 ＋ 2 ＝ 66」）
    this.runEls = m.runs.map(function(r, j){
      var g = D2.el("g", {opacity: 0, "data-mark": MK + "-run-" + (j + 1)}, root);
      var br = D2.el("path", {fill: "none", stroke: "var(--fg)", "stroke-width": 2}, g);
      var sw = swatch(g, 0, G.scanY + 46, r.color, 18);
      var tx = D2.el("text", {y: G.scanY + 64, "font-size": 24, fill: "var(--fg)"}, g);
      return {g: g, br: br, sw: sw, tx: tx, r: r};
    });
  }
  // 段階 k の今の道の進み（0〜1 の各辺）と、葉の後の進み
  render(k, t){
    var D2 = D, P = this.props, m = this.model(), dec = m.dec, self = this, Lb = m.L;
    var p = k ? m.plan[k - 1] : null, T = k ? this.times(k) : null;
    var A = k ? this.lay[k - 1] : this.lay[0], B = this.lay[k];
    var mv = k ? D2.prog(t, 0, P.move) : 1;
    // ---- 節の位置：両方にあれば滑らせ、片方だけなら近い祖先から伸びる／祖先へ縮む
    var anc = function(L, id){ var o = L.nodes[id]; if (o) return o; var e = self.els[id]; while (e && !L.nodes[e.id]) e = self.els[e.parent]; return e ? L.nodes[e.id] : L.nodes.r; };
    var camA = k ? this.camAt(k - 1, Infinity) : 0, camB = this.camAt(k, t), G = this.G;
    var yOf = function(L, o, cam){ return L.y0 + (o.lv - cam) * L.gap; };
    // 窓の上下（木が入るときは広く）。外へ出る節は 26 px で薄れる
    var bnd = function(L){ return L.follow ? [L.y0 - 8, L.y0 + L.win * L.gap + 8] : [G.treeTop - 40, G.treeBottom + 40]; };
    var bA = bnd(A), bB = bnd(B), wTop = D2.lerp(bA[0], bB[0], mv), wBot = D2.lerp(bA[1], bB[1], mv);
    var wf = function(y){ return D2.clamp01((y - (wTop - 26)) / 26) * D2.clamp01((wBot + 26 - y) / 26); };
    var lim = wTop - 10;
    // 線の始め（親）が窓の上にあれば、窓の上の縁で切る（線は上から流れ込む）
    var clip = function(a, b){ if (a.y >= lim || b.y <= lim) return a; var f = (lim - a.y) / (b.y - a.y); return {x: D2.lerp(a.x, b.x, f), y: lim}; };
    var pos = {};
    Object.keys(this.els).forEach(function(id){
      var a = A.nodes[id], b = B.nodes[id], pa = a || anc(A, id), pb = b || anc(B, id);
      // 消える節は前半で消え、現れる節は後半で現れる（深い木を畳むときに途中の姿が重ならない）
      var op = (a ? Math.max(0, 1 - 2 * mv) : 0) + (b ? Math.max(0, 2 * mv - 1) : 0);
      if (a && b) op = 1;
      var fan = ((a && a.kind === "fan" ? 1 - mv : 0) + (b && b.kind === "fan" ? mv : 0));
      var y = D2.lerp(yOf(A, pa, camA), yOf(B, pb, camB), mv);
      pos[id] = {x: D2.lerp(pa.x, pb.x, mv), y: y, op: op * wf(y), fan: fan,
        lab: (A.lab[id] && a ? (b ? 1 - mv : 1) : 0) + (B.lab[id] && b ? (a ? mv : 1) : 0)};
    });
    // ---- 今の道・前の道
    var segP = function(i){ return T ? D2.prog(t, T.s(i), 0.7 * P.bit) : 0; };
    var onPath = {};
    this.paths.forEach(function(q, j){
      if (!q) return;
      var st = j + 1, dr, op;
      if (p && p.type === "sum"){ op = 1; dr = function(){ return st === k - 1 ? 1 : D2.prog(t, P.move * 0.5, 0.9); }; }
      else if (st === k){ op = 1; dr = segP; }
      else if (st === k - 1){ op = Math.max(0, 1 - 2 * mv); dr = function(){ return 1; }; }
      else { op = 0; dr = function(){ return 0; }; }
      q.segs.forEach(function(s, i){
        var a = pos[s.a], b = pos[s.b], f = dr(i), tip = {x: D2.lerp(a.x, b.x, f), y: D2.lerp(a.y, b.y, f)}, a0 = clip(a, tip);
        s.line.setAttribute("x1", a0.x.toFixed(2)); s.line.setAttribute("y1", a0.y.toFixed(2));
        s.line.setAttribute("x2", tip.x.toFixed(2)); s.line.setAttribute("y2", tip.y.toFixed(2));
        s.line.setAttribute("opacity", f > 0 && tip.y > lim ? (op * Math.min(1, wf(tip.y) * 1.5)).toFixed(3) : 0);
        if (f >= 1 && op > 0.5) onPath[s.b] = 1;
      });
    });
    // ---- 節と枝
    var hit = {};   // 葉に着いた（葉の数字を強調）
    if (p && p.type === "tok"){ var tk = dec.tokens[p.tok]; if (t >= T.A) hit[LETTER[tk.color] + tk.code] = 1; }
    if (p && p.type === "sum") dec.tokens.forEach(function(x){ hit[LETTER[x.color] + x.code] = 1; });
    Object.keys(this.els).forEach(function(id){
      var e = self.els[id], q = pos[id];
      e.g.setAttribute("transform", "translate(" + q.x.toFixed(2) + " " + q.y.toFixed(2) + ")");
      e.g.setAttribute("opacity", q.op.toFixed(3));
      e.fan.setAttribute("opacity", q.fan.toFixed(3));
      if (e.edge){
        var a = pos[e.parent], a1 = clip(a, q);
        e.edge.setAttribute("x1", a1.x.toFixed(2)); e.edge.setAttribute("y1", a1.y.toFixed(2));
        e.edge.setAttribute("x2", q.x.toFixed(2)); e.edge.setAttribute("y2", q.y.toFixed(2));
        e.edge.setAttribute("opacity", q.op.toFixed(3));
        // 枝の字：根からの枝は線の中ほどの上、0 と 1 は親に近いところの外側
        // 線に垂直に、外側（0 は左上、1 は右上）へ離す
        var top = e.parent === "r", lp = labelAt(a, q, top ? 0.5 : 0.42, top ? 20 : 17);
        e.lab.setAttribute("x", lp.x.toFixed(2)); e.lab.setAttribute("y", lp.y.toFixed(2));
        e.lab.setAttribute("opacity", Math.min(q.op, q.lab, wf(lp.y - 8)).toFixed(3));
        e.lab.style.fill = onPath[id] ? "var(--emph)" : "var(--muted)";
        e.lab.setAttribute("font-weight", onPath[id] ? 700 : 400);
      }
      if (e.num){
        var h = !!hit[id];
        e.num.style.fill = h ? "var(--emph)" : "var(--fg)";
        e.num.setAttribute("font-weight", h ? 700 : 400);
        // 着いたときに輪が 1 回広がる（最終状態には出ない）
        var u = p && p.type === "tok" && h && t !== Infinity ? (t - T.A) / 0.6 : -1;
        if (u > 0 && u < 1){ e.ring.setAttribute("r", (13 + 14 * u).toFixed(2)); e.ring.setAttribute("opacity", (1 - u).toFixed(3)); }
        else e.ring.setAttribute("opacity", 0);
      }
    });
    // ---- 道をたどる点
    var tokOp = 0, tp = pos.r;
    if (p && (p.type === "tok" || p.type === "err") && t !== Infinity){
      var q = this.paths[k - 1], i = 0;
      while (i < q.segs.length - 1 && segP(i) >= 1) i++;
      var s = q.segs[i], f = segP(i), a = pos[s.a], b = pos[s.b];
      tp = {x: D2.lerp(a.x, b.x, f), y: D2.lerp(a.y, b.y, f)};
      tokOp = D2.prog(t, T.s(0) - 0.2, 0.2) * (1 - D2.prog(t, T.A, 0.4));
    }
    this.token.setAttribute("cx", tp.x.toFixed(2)); this.token.setAttribute("cy", tp.y.toFixed(2));
    this.token.setAttribute("opacity", tokOp.toFixed(3));
    // 表にない枝の × （誤りの段階と、まとめ）
    var cx = 0;
    if (p && dec.error && dec.error.kind === "invalid" && (p.type === "err" || p.type === "sum")){
      var er = dec.error, last = pos[LETTER[er.color] + errPath(er)], gh = this.lay[k].ghosts[LETTER[er.color] + er.code];
      if (gh){
        gh = {x: gh.x, y: yOf(this.lay[k], gh, camB)};
        this.stubLine.setAttribute("x1", last.x.toFixed(2)); this.stubLine.setAttribute("y1", last.y.toFixed(2));
        this.stubLine.setAttribute("x2", gh.x.toFixed(2)); this.stubLine.setAttribute("y2", (gh.y - 14).toFixed(2));
        this.cross.setAttribute("x", gh.x.toFixed(2)); this.cross.setAttribute("y", (gh.y + 12).toFixed(2));
        var sp = labelAt(last, gh, 0.42, 17);
        this.stubLab.setAttribute("x", sp.x.toFixed(2)); this.stubLab.setAttribute("y", sp.y.toFixed(2));
        this.stubLab.textContent = er.code.slice(-1);
        cx = p.type === "err" ? D2.prog(t, T.s(T.nb), 0.3) : 1;
      }
    }
    this.stub.setAttribute("opacity", cx.toFixed(3));
    // ---- 系列：読んだ符号語は fg、今の符号語の読んだビットは emph、まだのビットは muted
    var cur = p && p.type === "tok" ? dec.tokens[p.tok] : p && p.type === "err" ? dec.error : null;
    var doneEnd = p && p.type === "sum" ? dec.bits.length : cur ? cur.start : 0;
    var readUpTo = -1;   // 今の符号語で読んだビット（の桁）
    if (cur && T) for (var j = 1; j <= T.nb; j++) if (t >= T.s(j)) readUpTo = cur.start + j - 1;
    if (p && p.type === "err" && dec.error.kind === "invalid" && t >= T.s(T.nb)) readUpTo = dec.error.pos;
    this.bitEls.forEach(function(e, j){
      var c = j < doneEnd ? "var(--fg)" : j <= readUpTo ? "var(--emph)" : "var(--muted)";
      if (p && p.type === "sum" && dec.error && dec.error.kind !== "dangling" && j >= dec.error.start) c = "var(--emph)";
      if (p && p.type === "tok" && j >= cur.start && j < cur.end && t >= T.F0) c = "var(--fg)";
      e.style.fill = c;
    });
    var po = 0, pj = 0;
    if (cur && T && t !== Infinity){
      var jj = 0;
      for (var j2 = 1; j2 <= T.nb; j2++) if (t >= T.s(j2)) jj = j2;
      pj = cur.start + (jj >= 2 ? D2.lerp(jj - 2, jj - 1, D2.prog(t, T.s(jj), 0.2)) : 0);
      po = D2.prog(t, T.s(1) - 0.25, 0.25) * (p.type === "tok" ? 1 - D2.prog(t, T.F0, 0.4) : 1);
    }
    if (p && p.type === "err" && t === Infinity){ pj = dec.error.start + T.nb - 1; po = 1; }
    this.ptr.setAttribute("x", (this.B.x0 + pj * this.B.cs + 1).toFixed(2));
    this.ptr.setAttribute("opacity", po.toFixed(3));
    // 符号語の括弧：読み終えた符号語
    var tokDone = function(i){ if (!p) return 0; if (p.type === "sum" || p.type === "err") return 1; return i < p.tok ? 1 : i === p.tok ? D2.prog(t, T.F0, 0.3) : 0; };
    this.brk.forEach(function(g, i){ g.setAttribute("opacity", tokDone(i).toFixed(3)); });
    // ---- 画素：葉に着いてから升目を左から塗る
    var fillOf = function(i){ if (!p) return 0; if (p.type === "sum" || p.type === "err") return 1; return i < p.tok ? 1 : i === p.tok ? D2.prog(t, T.F0, P.fill) : 0; };
    var shown = {};   // 符号語ごとの塗った升目の数
    dec.tokens.forEach(function(x, i){ shown[i] = x.kind === "eol" ? 0 : Math.round(x.run * fillOf(i)); });
    this.cells.forEach(function(c){
      if (c.n >= 0) c.e.setAttribute("opacity", c.n < shown[c.tok] ? 1 : 0);
      else c.e.setAttribute("width", (shown[c.tok] * self.S.sc).toFixed(2));
    });
    // ランの括弧と長さ。字は重ならないように左から順に置く
    var right = -Infinity, S = this.S, G = this.G;
    this.runEls.forEach(function(o){
      var vis = o.r.toks.filter(function(i){ return shown[i] > 0; });
      if (!vis.length){ o.g.setAttribute("opacity", 0); return; }
      var len = vis.reduce(function(a, i){ return a + shown[i]; }, 0);
      var parts = vis.map(function(i){ return dec.tokens[i].run; });
      var full = vis.every(function(i){ return shown[i] === dec.tokens[i].run; });
      var s = Lb[o.r.color] + " " + (parts.length > 1 ? parts.join(" ＋ ") + " ＝ " + parts.reduce(function(a, b){ return a + b; }, 0) : String(full ? parts[0] : len));
      var a = S.x0 + o.r.start * S.sc, b = a + len * S.sc;
      o.br.setAttribute("d", "M" + (a + 1) + "," + (G.scanY + 34) + "v6H" + Math.max(a + 2, b - 1) + "v-6");
      var w = 26 + textW(s, 24), x = Math.max((a + b) / 2 - w / 2, right + 16, S.x0);
      x = Math.min(x, self.W - w);
      right = x + w;
      o.sw.setAttribute("x", x.toFixed(2));
      o.tx.setAttribute("x", (x + 26).toFixed(2));
      o.tx.textContent = s;
      o.g.setAttribute("opacity", 1);
    });
    // ---- 「ここまで」の行：窓が根から離れたときだけ。今の段階でまだ読んでいなければ前の符号語
    var cw = null, nread = 0;
    if (p && (p.type === "tok" || p.type === "err")){
      cw = this.lay[k].cur; for (var j3 = 1; j3 <= T.nb; j3++) if (t >= T.s(j3)) nread = j3;
      cw = {color: cw.color, code: (cw.bad || cw.code).slice(0, nread)};
    } else if (p && p.type === "sum") cw = B.deep;
    if ((!cw || !cw.code) && k > 1 && this.lay[k - 1].cur) cw = this.lay[k - 1].cur;
    var camNow = D2.lerp(camA, camB, mv), co = cw && cw.code ? D2.clamp01((camNow - 0.3) / 0.4) * (B.follow ? 1 : Math.max(0, 1 - 2 * mv)) : 0;
    if (cw){
      this.crumbHead.textContent = fmt0(Lb.crumb, cw.color ? Lb[cw.color] : "") + " ";
      this.crumbBits.textContent = (cw.code.match(/.{1,4}/g) || []).join(" ");
    }
    this.crumb.setAttribute("opacity", co.toFixed(3));
    // ---- 右上の一言
    var fmt = function(s, o){ return s.replace("{c}", o.c ? Lb[o.c] : "").replace("{n}", o.n || ""); };
    var other = function(c){ return c === "white" ? "black" : "white"; };
    var n0 = "", n1 = "", sw = 0;
    if (!p){ n1 = Lb.start; sw = 1; }
    else if (p.type === "tok"){
      var x = dec.tokens[p.tok];
      n0 = fmt(Lb.read, {c: x.color});
      n1 = fmt(Lb[x.kind], {c: x.kind === "term" ? other(x.color) : x.color});
      sw = D2.prog(t, T.F0, 0.4);
    } else if (p.type === "err"){
      n0 = fmt(Lb.read, {c: dec.error.color});
      n1 = fmt(Lb[dec.error.kind], {n: dec.error.pos + 1});
      sw = D2.prog(t, T.s(T.nb), 0.4);
    } else {
      n0 = ""; n1 = !dec.error ? Lb.done : fmt(Lb[dec.error.kind], {n: dec.error.pos + 1}); sw = D2.prog(t, P.move, 0.4);
    }
    this.note[0].textContent = n0; this.note[1].textContent = n1;
    // 前の一言が消えてから次を出す（重ねて入れ替えると読めない）
    this.note[0].setAttribute("opacity", Math.max(0, 1 - 2 * sw).toFixed(3)); this.note[1].setAttribute("opacity", Math.max(0, 2 * sw - 1).toFixed(3));
    this.note[1].style.fill = p && (p.type === "err" || p.type === "sum") ? "var(--emph)" : "var(--fg)";
  }
});
})();
