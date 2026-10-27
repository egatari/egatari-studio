// m-keyboard：音楽の授業のピアノの鍵盤。段階ごとに鍵盤を光らせ（音階・和音・半音と全音）、その音を再生器に鳴らしてもらう
// <m-keyboard style="height:380px"><script type="application/json">
//   {"range": "C4-C6", "names": "solfa", "steps": [{"keys": ["C4", "E4", "G4"], "label": "主和音"}]}
// （JSON の終わり）</m-keyboard>
// 段階 0 は鍵盤だけ。段階 k は steps[k-1] の keys を --emph（または step の tone）で光らせる。keys ごとの t（秒）でずらせば音階・分散和音、
// 同じ t なら和音。cumulative: true なら前の段階の鍵盤も薄く光ったまま
// 音（仕様 §8.4「Component sounds」）：events(k) は鍵盤 1 つに 1 つの note（pitch は鍵盤の名前、vel 0.7、dur は dur の欄か、
// 次の t まで（なければ 0.8 秒））。duration(k) は最後の音の終わりまで。音だけに頼らない：光った鍵盤と印がいつも同じことを示す
// 鍵盤の形（customElements.get("m-keyboard").kb、tools/test-keyboard.mjs）：白鍵の幅を 1 として、ド〜ミの 3 つを 5 等分、ファ〜シの 4 つを
// 7 等分した 2・4（・6）番目に黒鍵を置く（本物の鍵盤と同じく、ド♯とレ♯は外へ、ファ♯とラ♯も外へ寄り、ソ♯は真ん中）
// 授業の表示（ctx.preview、古い再生器は ctx.mode === "lecture"）：先の段階の鍵盤をテーマの --preview-opacity（なければ 0.45）で薄く、印なしで見せる
// 見せ方（docs/conventions.md §1）：light（既定。光がフェード）・press（鍵盤が少し沈んで戻る）・rise（光が鍵盤の下から上へ満ちる）
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
// ---- 鍵盤の名前と形（DOM を使わない。tools/test-keyboard.mjs が試す） ----
var KB = (function(){
  var LETTERS = "CDEFGAB", PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  var SOLFA = {C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ"};
  var IROHA = {C: "ハ", D: "ニ", E: "ホ", F: "ヘ", G: "ト", A: "イ", B: "ロ"};
  var BW = 0.58, BH = 0.62;   // 黒鍵の幅（白鍵の幅に対して）と長さ（白鍵の長さに対して）
  // "C4" "C#4" "Db4"（♯ ♭ も）→ {letter, acc: "" | "#" | "b", oct, midi, white, name}。読めなければ null
  function parseKey(s){
    var m = /^([A-G])([#b♯♭]?)(-?\d)$/.exec(String(s).trim());
    if (!m) return null;
    var acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2], oct = +m[3];
    // E♯・B♯・F♭・C♭ は白鍵の別の名前：鍵盤の名前としては使わない
    if ((acc === "#" && (m[1] === "E" || m[1] === "B")) || (acc === "b" && (m[1] === "F" || m[1] === "C"))) return null;
    var midi = 12 * (oct + 1) + PC[m[1]] + (acc === "#" ? 1 : acc === "b" ? -1 : 0);
    return {letter: m[1], acc: acc, oct: oct, midi: midi, white: !acc, name: m[1] + acc + oct};
  }
  // "C4-C6" → {lo, hi}（鍵盤 2 つ）。両端は白鍵、1〜3 オクターブ（半音 12〜36 個）。違えば Error（何が・どう書くか）
  function parseRange(s){
    var m = /^\s*([A-G][#b♯♭]?-?\d)\s*[-–〜~]\s*([A-G][#b♯♭]?-?\d)\s*$/.exec(String(s || ""));
    if (!m) throw new Error('m-keyboard: range "' + s + '" is not two key names such as "C4-C6"');
    var lo = parseKey(m[1]), hi = parseKey(m[2]);
    if (!lo || !hi) throw new Error('m-keyboard: range "' + s + '": ' + (!lo ? m[1] : m[2]) + " is not a key name (C4, F#3, Bb4, …)");
    if (!lo.white || !hi.white) throw new Error('m-keyboard: range "' + s + '" must start and end on white keys (C D E F G A B)');
    var span = hi.midi - lo.midi;
    if (span < 12 || span > 36) throw new Error('m-keyboard: range "' + s + '" covers ' + span + " semitones; it must cover 1–3 octaves (12–36, such as C4-C5 or C3-C6)");
    return {lo: lo, hi: hi};
  }
  // 範囲の鍵盤：白鍵 {midi, white: true, i, x（左の端）, w: 1}、黒鍵 {midi, white: false, x（左の端）, cx（真ん中）, w: BW}。単位は白鍵の幅
  function keys(r){
    var out = [], whites = [], wi = -1;
    for (var mi = r.lo.midi; mi <= r.hi.midi; mi++){
      var pc = ((mi % 12) + 12) % 12, white = [0, 2, 4, 5, 7, 9, 11].indexOf(pc) >= 0;
      if (white){ wi++; var k = {midi: mi, pc: pc, white: true, i: wi, x: wi, w: 1}; whites.push(k); out.push(k); continue; }
      // 黒鍵：下の白鍵（i = wi）の組（ド〜ミ か ファ〜シ）の始まりから数える
      var g = pc < 5 ? {start: wi - (pc - 1) / 2, n: 3, slot: (pc === 1 ? 1 : 3)} : {start: wi - (pc - 6) / 2, n: 4, slot: (pc === 6 ? 1 : pc === 8 ? 3 : 5)};
      var cx = g.start + (g.slot + 0.5) * g.n / (2 * g.n - 1);
      out.push({midi: mi, pc: pc, white: false, below: wi, cx: cx, x: cx - BW / 2, w: BW});
    }
    return {all: out, whites: whites, n: whites.length, BW: BW, BH: BH};
  }
  // 鍵盤の名前：names = "solfa"（ドレミ）・"abc"（CDE）・"iroha"（ハニホ）・"none"（null）。黒鍵は ♯・♭ をつける（ド♯ / C♯、レ♭ / D♭）。
  // iroha は前に 嬰・変 をつける（嬰ハ、変ニ）
  function label(k, names){
    if (names === "none") return null;
    if (names === "iroha") return (k.acc === "#" ? "嬰" : k.acc === "b" ? "変" : "") + IROHA[k.letter];
    var s = names === "abc" ? k.letter : SOLFA[k.letter];
    return s + (k.acc === "#" ? "♯" : k.acc === "b" ? "♭" : "");
  }
  // 白鍵の名前（範囲の中の midi から。白鍵は ♯ も ♭ もない）
  function whiteLetter(midi){ return "C D EF G A B".charAt(((midi % 12) + 12) % 12); }
  // 段階 1 つの音：鍵盤 1 つに 1 つ。t は keys ごと（なければ 0）。dur は step.dur → 全体の dur → 次の（より遅い）t まで → 0.8 秒
  function notes(step, dur){
    var ts = (step.keys || []).map(function(_, i){ return step.t && typeof step.t[i] === "number" ? step.t[i] : 0; });
    var d0 = typeof step.dur === "number" ? step.dur : typeof dur === "number" ? dur : null;
    return step.keys.map(function(key, i){
      var k = parseKey(key), t = ts[i], later = ts.filter(function(u){ return u > t + 1e-9; }), next = later.length ? Math.min.apply(null, later) : null;
      return {t: t, sound: "note", pitch: k ? k.name : String(key), dur: d0 !== null ? d0 : next !== null ? +(next - t).toFixed(6) : 0.8, vel: 0.7};
    });
  }
  // 段階の長さ：最後の音の終わり
  function length(step, dur){ return notes(step, dur).reduce(function(a, n){ return Math.max(a, n.t + n.dur); }, 0); }
  // 段階 k・時刻 t の鍵盤ごとの状態（render が描く。DOM を使わない）。steps は plan の段階（keys は parseKey の結果、ev は notes）。
  // o = {cumulative, preview, variant, prog(t, at, len)}。{midi: {e: 今の段階の光の進み 0〜1, p: 動きの進み, tone, ids: {綴り: e},
  //   faded: 前の段階で光った（cumulative）, fadeTone, fids, pre: 先の段階で光る（授業の表示で薄く。印なし）, preTone}}
  function state(steps, k, t, o){
    var st = {}, cur = steps[k - 1];
    var get = function(m){ return st[m] || (st[m] = {e: 0, p: 0, faded: false, pre: false, tone: null, fadeTone: null, preTone: null, ids: {}, fids: {}}); };
    if (o.cumulative) for (var j = 0; j < k - 1 && j < steps.length; j++){
      var sj = steps[j];
      sj.keys.forEach(function(kk){ var s = get(kk.midi); s.faded = true; s.fadeTone = sj.tone; s.fids[kk.midi + "|" + kk.acc] = true; });
    }
    if (cur) cur.keys.forEach(function(kk, i){
      var n = cur.ev[i], len = o.variant === "light" ? Math.min(0.2, n.dur) : Math.min(0.3, n.dur);
      var e = t === Infinity ? 1 : o.prog(t, n.t, len), s = get(kk.midi), id = kk.midi + "|" + kk.acc;
      if (e >= s.e){ s.e = e; s.p = t === Infinity ? 1 : Math.max(0, Math.min(1, (t - n.t) / len)); }
      s.tone = cur.tone; if (e > 0) s.ids[id] = Math.max(s.ids[id] || 0, e);
    });
    // 授業の表示：先の段階の鍵盤を薄く（いちばん近い段階の色。今・前の段階で光っている鍵盤はそのまま）
    if (o.preview) for (var q = steps.length - 1; q >= Math.max(0, k); q--){
      var sq = steps[q];
      sq.keys.forEach(function(kk){ var s = get(kk.midi); if (s.e > 0 || s.faded) return; s.pre = true; s.preTone = sq.tone; });
    }
    return st;
  }
  return {state: state, parseKey: parseKey, parseRange: parseRange, keys: keys, label: label, whiteLetter: whiteLetter, notes: notes, length: length, LETTERS: LETTERS, BW: BW, BH: BH};
})();

var TONES = /^(term|emph|muted|accent2|fg|series-[1-4])$/;
var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.3 : /[\u0000-ɏ]/.test(c) ? 0.6 : 1); }, 0) * size; };
DECK.define("m-keyboard", class extends DECK.MotionElement {
  static variants = ["light", "press", "rise"];
  static kb = KB;
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["range", "steps"], properties: {
      range: {type: "string"}, names: {type: "string", enum: ["solfa", "abc", "iroha", "none"]}, cumulative: {type: "boolean"}, dur: {type: "number"},
      steps: {type: "array", minItems: 1, items: {type: "object", additionalProperties: false, required: ["keys"], properties: {
        keys: {type: "array", minItems: 1, items: {type: "string"}}, label: {type: "string"}, t: {type: "array", items: {type: "number"}},
        tone: {type: "string"}, dur: {type: "number"}}}}}},
    example: {range: "C4-C6", names: "solfa", steps: [{keys: ["C4", "E4", "G4"], label: "主和音（ドミソ）"}]},
    note: {en: "range \"C4-C6\" (white keys at both ends, 1–3 octaves); steps [{keys: [\"C4\", \"E4\"], label, t: [seconds per key], tone, dur}]",
           ja: "range \"C4-C6\"（両端は白鍵、1〜3 オクターブ）、steps [{keys: [\"C4\", \"E4\"], label, t: [鍵盤ごとの秒], tone, dur}]"},
  };
  static props = {};
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps.length;
  }
  // 範囲と段階を読む（mount の前にも steps が要る）。範囲・鍵盤の名前・t の数が違えば Error（札が出る）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, notes = [];
    var r = KB.parseRange(d.range), kb = KB.keys(r);
    var names = d.names === undefined ? (DECK.ja ? "solfa" : "abc") : d.names;
    var steps = d.steps.map(function(s, j){
      var ks = s.keys.map(function(name){
        var k = KB.parseKey(name);
        if (!k) throw new Error("m-keyboard: steps[" + j + "] key \"" + name + "\" is not a key name (C4, F#3, Bb4, …)");
        if (k.midi < r.lo.midi || k.midi > r.hi.midi) throw new Error("m-keyboard: steps[" + j + "] key " + name + " is outside range " + d.range);
        return k;
      });
      if (s.t && s.t.length !== s.keys.length) throw new Error("m-keyboard: steps[" + j + "] has " + s.keys.length + " keys but " + s.t.length + " times in t (one per key)");
      if (s.t && s.t.some(function(v){ return !(v >= 0); })) throw new Error("m-keyboard: steps[" + j + "] t must be seconds ≥ 0");
      if (s.tone !== undefined && !TONES.test(s.tone)) notes.push('m-keyboard: steps[' + j + '] tone "' + s.tone + '" is not a theme colour (emph is used)');
      var ev = KB.notes(s, d.dur);
      return {o: s, keys: ks, ev: ev, len: KB.length(s, d.dur), tone: TONES.test(s.tone || "") ? s.tone : "emph"};
    });
    return (this._plan = {r: r, kb: kb, names: names, steps: steps, cumulative: d.cumulative === true, notes: notes});
  }
  duration(k){ var s = k >= 1 && this.plan().steps[k - 1]; return s ? s.len : 0; }
  events(k){ var s = k >= 1 && this.plan().steps[k - 1]; return s ? s.ev.map(function(e){ return Object.assign({}, e); }) : []; }
  mount(){
    var self = this, D = DECK, pl = this.plan(), kb = pl.kb;
    this.variant = VARIANT.of(this);
    pl.notes.forEach(function(n){ console.warn(n); });
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var hasLabel = pl.steps.some(function(s){ return s.o.label; });
    // 光る黒鍵の名前の行：となりの名前に重なるなら 2 行目へ（どの段階でも同じ置き場所）
    var LFS = 30, NFS = 26, BFS = 24;
    var unitW = Math.min((W - 6) / kb.n, 96);
    var x0 = (W - unitW * kb.n) / 2;
    var bl = {};
    pl.steps.forEach(function(s){ s.keys.forEach(function(k){ if (!k.white && pl.names !== "none") bl[k.midi + "|" + k.acc] = k; }); });
    var blist = Object.keys(bl).map(function(id){
      var k = bl[id], key = kb.all.filter(function(q){ return q.midi === k.midi; })[0], s = KB.label(k, pl.names);
      return {id: id, k: k, s: s, cx: x0 + key.cx * unitW, w: est(s, BFS)};
    }).sort(function(a, b){ return a.cx - b.cx || a.id.localeCompare(b.id); });
    var rowsEnd = [-1e9, -1e9], nRows = 0;
    blist.forEach(function(b){
      var row = b.cx - b.w / 2 > rowsEnd[0] + 10 ? 0 : 1;
      if (row === 1 && b.cx - b.w / 2 <= rowsEnd[1] + 10) console.warn("m-keyboard: the names of black keys near " + b.s + " overlap (use a wider element or a narrower range)");
      rowsEnd[row] = b.cx + b.w / 2; b.row = row; nRows = Math.max(nRows, row + 1);
    });
    var labH = hasLabel ? 46 : 0, bnH = nRows * 32, namesH = pl.names === "none" ? 0 : 40, gapTop = nRows ? 8 : (hasLabel ? 10 : 0);
    var avail = H - labH - bnH - gapTop - namesH - 8;
    var keyH = Math.min(avail, unitW * 4.4);
    if (avail < 110) console.warn("m-keyboard: the element (" + W + "×" + H + " px) leaves only " + Math.round(avail) + " px for the keys; make it taller (about " + Math.ceil(H + 110 - avail) + " px)");
    if (unitW < 40) console.warn("m-keyboard: white keys are " + unitW.toFixed(0) + " px wide; the names under them may not fit (use a narrower range or a wider element)");
    var used = labH + bnH + gapTop + keyH + namesH, top0 = Math.max(0, (H - used) / 2);
    var labY = top0 + 34, bnTop = top0 + labH, keyTop = bnTop + bnH + gapTop, keyBot = keyTop + keyH, bH = keyH * KB.BH;
    this.geo = {x0: x0, unitW: unitW, keyTop: keyTop, keyH: keyH};
    // 鍵盤：白鍵 → 白鍵の光 → 黒鍵 → 黒鍵の光（黒鍵は短く、上に）
    var gW = D.el("g", {}, svg), gB = D.el("g", {}, svg), gT = D.el("g", {}, svg);
    var K = this.K = {};
    var rise = this.variant === "rise";
    kb.all.forEach(function(key){
      var white = key.white, x = x0 + key.x * unitW, w = key.w * unitW, h = white ? keyH : bH;
      var par = white ? gW : gB, g = D.el("g", {}, par);
      D.el("rect", {x: x.toFixed(1), y: keyTop.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: white ? 4 : 3,
        fill: white ? "var(--bg)" : "var(--fg)", stroke: "var(--fg)", "stroke-width": white ? 2 : 1.5}, g);
      var ins = white ? 3 : 4;
      var lit = D.el("rect", {x: (x + ins).toFixed(1), y: (keyTop + (white ? 2 : 0)).toFixed(1), width: (w - 2 * ins).toFixed(1), height: (h - ins - (white ? 2 : 0)).toFixed(1), rx: 2, opacity: 0}, g);
      var cx = x + w / 2, r = white ? Math.min(9, w * 0.16) : Math.min(7, w * 0.2), cy = keyTop + h - (white ? 14 + r : 10 + r);
      var dot = D.el("circle", {cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(1), opacity: 0}, g);
      K[key.midi] = {key: key, g: g, lit: lit, dot: dot, y: keyTop + (white ? 2 : 0), h: h - ins - (white ? 2 : 0), white: white, nm: null, bn: {}};
    });
    // 白鍵の名前（鍵盤の下）
    if (pl.names !== "none") kb.whites.forEach(function(key){
      var s = KB.label({letter: KB.whiteLetter(key.midi), acc: ""}, pl.names);
      var t = D.el("text", {x: (x0 + (key.x + 0.5) * unitW).toFixed(1), y: (keyBot + 32).toFixed(1), "font-size": NFS, "text-anchor": "middle", fill: "var(--fg)"}, gT);
      t.textContent = s;
      K[key.midi].nm = t;
    });
    // 光る黒鍵の名前（鍵盤の上。光っているときだけ）
    blist.forEach(function(b){
      var t = D.el("text", {x: b.cx.toFixed(1), y: (bnTop + 25 + (nRows - 1 - b.row) * 32).toFixed(1), "font-size": BFS, "font-weight": 700, "text-anchor": "middle", fill: "var(--fg)", opacity: 0}, gT);
      t.textContent = b.s;
      K[b.k.midi].bn[b.id] = t;
    });
    // 段階の名前（鍵盤の上、24 px 以上）
    this.lab = D.el("text", {x: (W / 2).toFixed(1), y: labY.toFixed(1), "font-size": LFS, "font-weight": 700, "text-anchor": "middle", fill: "var(--fg)", opacity: 0}, gT);
    pl.steps.forEach(function(s, j){ if (s.o.label && est(s.o.label, LFS) > W) console.warn("m-keyboard: steps[" + j + "] label is wider than the element; shorten it"); });
    if (rise) Object.keys(K).forEach(function(m){ K[m].lit.setAttribute("data-y", K[m].y); });
  }
  render(k, t, ctx){
    var pl = this.plan(), K = this.K, v = this.variant, cur = pl.steps[k - 1];
    // 薄さはテーマの --preview-opacity（仕様 §8.4「Answers under preview」）。書いていないテーマだけ 0.45
    var FAINT = 0.45;
    if (ctx && (ctx.preview || ctx.mode === "lecture")){ var fv = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); if (fv >= 0 && fv <= 1) FAINT = fv; }
    var st = KB.state(pl.steps, k, t, {cumulative: pl.cumulative, preview: !!(ctx && (ctx.preview || ctx.mode === "lecture")), variant: v, prog: DECK.prog});
    Object.keys(K).forEach(function(m){
      var o = K[m], s = st[m] || {e: 0, faded: false, pre: false, ids: {}, fids: {}}, on = s.e > 0;
      var tone = on ? s.tone : s.faded ? s.fadeTone : s.preTone;
      o.lit.setAttribute("fill", "var(--" + (tone || "emph") + ")");
      var op = on ? (s.faded ? Math.max(0.4, v === "light" ? s.e : 1) : v === "light" ? s.e : 1) : s.faded ? 0.4 : s.pre ? FAINT : 0;
      // rise：光が鍵盤の下から上へ満ちる
      if (v === "rise"){
        var f = on ? (s.faded ? 1 : s.e) : 1, h = o.h * f;
        o.lit.setAttribute("y", (o.y + o.h - h).toFixed(1)); o.lit.setAttribute("height", h.toFixed(1));
      }
      o.lit.setAttribute("opacity", op.toFixed(3));
      // 印：今の段階は塗った丸、前の段階は輪（色だけに頼らない）
      o.dot.setAttribute("fill", on ? "var(--bg)" : "none");
      o.dot.setAttribute("stroke", on ? "none" : o.white ? "var(--fg)" : "var(--bg)");
      o.dot.setAttribute("stroke-width", on ? 0 : 2.5);
      o.dot.setAttribute("opacity", (on ? (v === "press" ? 1 : s.e) : s.faded ? 0.9 : 0).toFixed(3));
      // press：少し沈んで戻る（4 px、0.3 秒まで）
      var dy = v === "press" && on && s.p < 1 ? 4 * Math.sin(Math.PI * s.p) : 0;
      o.g.setAttribute("transform", dy ? "translate(0," + dy.toFixed(2) + ")" : "");
      for (var id in o.bn){
        var a = s.ids[id] ? (v === "light" ? s.ids[id] : 1) : 0;
        if (!a && s.fids[id]) a = 0.75;
        o.bn[id].setAttribute("opacity", a.toFixed(3));
      }
    });
    var lab = cur && cur.o.label;
    this.lab.textContent = lab || "";
    this.lab.setAttribute("opacity", lab ? (t === Infinity ? 1 : DECK.prog(t, 0, Math.min(0.3, cur.len || 0.3))).toFixed(3) : 0);
  }
});
})();
