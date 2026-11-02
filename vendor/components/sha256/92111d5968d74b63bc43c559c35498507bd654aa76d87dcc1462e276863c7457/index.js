// m-score：楽譜（五線譜）を 1 音（和音）ずつ、または 1 小節ずつ出し、その音を再生器に鳴らしてもらう
// <m-score names="solfa" style="height:300px"><script type="application/json">
//   {"abc": "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F |]", "abcSvg": "<svg …>…</svg>", "abcMap": {"tempo": 96, "notes": [ … ]},
//    "renderers": {"abcjs": {"version": "6.7.2", "options": {…}}}}
// （JSON の終わり）</m-score>
// 楽譜を描くのは組み立て（作り手。部品庫 2.0 の「組み立てのときの描画」）：作者の書いた abc を abcjs（add_classes）で描き、
// abcSvg（abcjs の SVG）と abcMap（音符ごとの小節 measure・音の高さ・拍・長さ（四分音符 = 1）・符頭の箱、連桁 beams、タイとスラーの弧 arcs）を足して渡す。
// 組み立ては SVG の音符・休符に data-note="i"、連桁に data-beam="k"、小節線に data-measure="m"、弧の線に data-arc="n" を付ける
// 再生のときに abcjs は持たない。この部品は abcSvg を読み、許した要素と属性だけで組み直して（スクリプト・外への参照・色は入らない）、
// 組み立てが付けた印（data-note・data-beam・data-measure・data-arc）で段階ごとに出す（abcjs の class は読まない）。五線・音部記号・調号・拍子は段階 0 から見える
// 段階：by="note"（既定）は音符・和音・休符 1 つ、by="measure" は 1 小節。休符とタイでつながった音は鳴らさずに進む
// 音（仕様 §8.4「Component sounds」）：events(k) は段階 k で出る音の note（pitch・dur（秒、tempo から。タイは次の音符の分も鳴る）・vel 0.7）。
// 和音は同じ t。duration(k) は段階の音符の長さ（by="measure" は小節の終わりまで）
// 名前：names="solfa|abc|iroha|none" で符頭の下（五線の下の帯）に 26 px で書く。位置は abcMap の符頭の箱（box）から。
// 名前が重なる小節は、その小節の名前を全部ジグザグ（奇数番目は上の段、偶数番目は下の段）に
// 今の段階の音符は --emph、前の段階は --fg。授業の表示（ctx.preview）では先の音符を --preview-opacity で薄く
// 読める層：音の名前を文字で（「ド レ ミ ファ｜ソ …」）。描いた図は aria-hidden
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog・variant・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 楽譜の描画は組み立てのとき（spec §6.2 build.fields の abcjs）。レッスンのデータや要素の大きさの問題は ctx.report で知らせる（console.warn の代わり）
egatariParts.define({name: "score", version: "2.0.0", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-score"}, function(deps){
"use strict";
var base = deps.base;
// ---- 楽譜のデータ（DOM を使わない。tools/test-score.mjs が試す） ----
var SC = (function(){
  var SOLFA = {C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ"};
  var IROHA = {C: "ハ", D: "ニ", E: "ホ", F: "ヘ", G: "ト", A: "イ", B: "ロ"};
  var PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  // ---- 描いた SVG を読む（spec §6.2「Rendered output is data」、egatari-spec ce96072 の schema/rendered-markup-1.json の svg の欄） ----
  // 許した要素・属性・値だけの木にする（innerHTML も DOMParser も使わない。データは信用しない）。MARKUP は schema の svg の欄で、
  // markup-reader の LIST から取る（同じ一覧が 1 つだけ。tools/test-score.mjs が spec のファイルと比べる。足すのは spec の側で、ここでは足さない）。
  // 要素は中身ごと、属性・style の宣言はそれだけを捨て、捨てたものを種類（要素・属性・style）ごとに root.dropped に書く
  // （mount が種類ごとに 1 回 ctx.report("data")）。xmlns は名前空間の宣言：要素の名前空間と比べるだけで、属性にはしない
  // 一覧は部品 markup-reader の LIST（tools/markup-sync.mjs が tools/spec.json の egatari-spec から作る。ここでは書かない）の svg の欄
  var LIST = deps["markup-reader"].LIST;
  var MARKUP = {global: LIST.global.svg, elements: LIST.elements.svg, values: LIST.values, style: LIST.style};
  var SVG_NS = "http://www.w3.org/2000/svg";
  var RE = {id: new RegExp(MARKUP.values.id), dataName: new RegExp(MARKUP.values["data-*"].name), dataValue: new RegExp(MARKUP.values["data-*"].value), length: new RegExp(MARKUP.values.length)};
  // 属性 name="v" を element tag に置いてよいか
  function admits(tag, name, v){
    if (/^data-/.test(name)) return MARKUP.global.indexOf("data-*") >= 0 && RE.dataName.test(name) && RE.dataValue.test(v);
    if (MARKUP.global.indexOf(name) < 0 && MARKUP.elements[tag].indexOf(name) < 0) return false;
    if (name === "id") return RE.id.test(v);
    if (Array.isArray(MARKUP.values[name])) return MARKUP.values[name].indexOf(v) >= 0;
    return true;
  }
  // style の 1 つの宣言 p: x を許すか（長さ・決まった語・短縮形は部分ごとに長さか語）
  function admitsDecl(p, x){
    var kw = MARKUP.style.keywords[p], sh = MARKUP.style.shorthands[p];
    if (MARKUP.style.lengths.indexOf(p) >= 0 && RE.length.test(x)) return true;
    if (kw && kw.indexOf(x) >= 0) return true;
    if (sh){
      var parts = x.split(/\s+/).filter(Boolean);
      return parts.length >= 1 && parts.length <= sh.max && parts.every(function(q){ return RE.length.test(q) || (sh.keywords || []).indexOf(q) >= 0; });
    }
    return false;
  }
  // style="p: v; …" → 許した宣言 [[p, v]]（setProperty で 1 つずつ置く）。捨てた宣言は drop に
  function styleDecls(v, drop, where){
    var out = [];
    v.split(";").forEach(function(d){
      if (!d.trim()) return;
      var c = d.indexOf(":"), p = c < 0 ? d.trim() : d.slice(0, c).trim().toLowerCase(), x = c < 0 ? "" : d.slice(c + 1).trim();
      if (admitsDecl(p, x)) out.push([p, x]); else drop("style", where + " " + p);
    });
    return out;
  }
  var ENT = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"};
  function decode(s){
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, function(all, e){
      if (e[0] === "#"){ var c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; }
      return ENT[e] !== undefined ? ENT[e] : "";
    });
  }
  // "<svg …>…</svg>" → {tag: "svg", a: {…}, st: [[p, v]], kids: [{tag, a, st, kids, text}], dropped: ["<style>", "g@fill", …]}
  function parseSvg(src){
    var re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
    var root = null, stack = [], skip = 0, m, dropped = {element: [], attribute: [], style: []};
    var drop = function(kind, what){ if (dropped[kind].indexOf(what) < 0) dropped[kind].push(what); };
    src = String(src || "");
    while ((m = re.exec(src))){
      if (m[5] !== undefined){   // 文字
        var top = stack[stack.length - 1];
        if (!skip && top && (top.tag === "text" || top.tag === "tspan" || top.tag === "title")) top.text = (top.text || "") + decode(m[5]);
        continue;
      }
      if (m[2] === undefined) continue;   // 注釈・宣言
      var tag = m[2], close = m[1] === "/", self = m[4] === "/";
      if (close){
        if (skip){ skip--; continue; }
        if (stack.length && stack[stack.length - 1].tag === tag) stack.pop();
        continue;
      }
      if (skip || !MARKUP.elements.hasOwnProperty(tag) || (tag === "svg" && root) || (!root && tag !== "svg")){ if (!skip) drop("element", "<" + tag + ">"); if (!self) skip++; continue; }
      var a = {}, st = [], ar = /([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g, x, wrongNs = false;
      while ((x = ar.exec(m[3]))){
        var name = x[1], v = decode(x[2] !== undefined ? x[2] : x[3] !== undefined ? x[3] : "").trim();
        if (name === "xmlns"){ if (v !== SVG_NS) wrongNs = true; }
        else if (name === "style" && MARKUP.global.indexOf("style") >= 0) st = styleDecls(v, drop, tag);
        else if (admits(tag, name, v)) a[name] = v;
        else drop("attribute", tag + "@" + name);
      }
      if (wrongNs){ drop("element", "<" + tag + "> (xmlns is not SVG)"); if (!self) skip++; if (!root) break; continue; }
      var node = {tag: tag, a: a, st: st, kids: []};
      if (!root) root = node; else stack[stack.length - 1].kids.push(node);
      if (!self) stack.push(node);
    }
    if (!root) throw new Error("m-score: abcSvg has no <svg> element");
    root.dropped = dropped;
    return root;
  }
  // 音の名前 "C4" "F#4" "Bb3" → {letter, acc: "" | "#" | "b" | "##" | "bb", oct, midi}。読めなければ null
  function parsePitch(s){
    var m = /^([A-G])(##|bb|#|b|♯|♭)?(-?\d)$/.exec(String(s));
    if (!m) return null;
    var acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : (m[2] || ""), oct = +m[3];
    var off = {"": 0, "#": 1, b: -1, "##": 2, bb: -2}[acc];
    return {letter: m[1], acc: acc, oct: oct, midi: 12 * (oct + 1) + PC[m[1]] + off};
  }
  // 符頭の下の名前（solfa・abc・iroha。none は null）
  function label(p, names){
    if (names === "none" || !p) return null;
    var sign = p.acc.replace(/#/g, "♯").replace(/b/g, "♭");
    if (names === "iroha") return (p.acc === "#" ? "嬰" : p.acc === "b" ? "変" : p.acc === "##" ? "重嬰" : p.acc === "bb" ? "重変" : "") + IROHA[p.letter];
    return (names === "abc" ? p.letter : SOLFA[p.letter]) + sign;
  }
  // abcMap を確かめ、段階に分ける。by = "note" | "measure"。違えば Error（どこが・どう書くか）
  // → {tempo, spb（四分音符 1 つの秒）, notes: [{…, p: [parsePitch], i}], steps: [{notes: [i…], len}], stepOf: [i → 段階], at: [i → 段階の中の秒], sound: [i → 鳴る秒]}
  function plan(map, by){
    if (!map || typeof map !== "object") throw new Error("m-score: abcMap is missing (the build renders abc with abcjs and adds abcSvg and abcMap)");
    if (!(map.tempo > 0)) throw new Error("m-score: abcMap.tempo must be quarter notes per minute (> 0)");
    if (!Array.isArray(map.notes) || !map.notes.length) throw new Error("m-score: abcMap.notes is empty");
    if (by !== "note" && by !== "measure") throw new Error('m-score: by="' + by + '" must be "note" or "measure"');
    var spb = 60 / map.tempo;
    var notes = map.notes.map(function(n, i){
      if (!(n.dur > 0)) throw new Error("m-score: abcMap.notes[" + i + "].dur must be > 0 (quarter note = 1)");
      var p = (n.pitch || []).map(function(s){
        var q = parsePitch(s);
        if (!q) throw new Error("m-score: abcMap.notes[" + i + "].pitch \"" + s + "\" is not a pitch such as C4, F#4, Bb3");
        return q;
      });
      if (!(n.measure >= 0) || Math.floor(n.measure) !== n.measure) throw new Error("m-score: abcMap.notes[" + i + "].measure must be the measure number (0, 1, …)");
      return {i: i, m: n.measure, beat: n.beat || 0, dur: n.dur, box: n.box || null, tie: false, p: p, raw: n};
    });
    // 連桁：組み立てが記録した音符の番号の組（beams）
    var beams = map.beams === undefined ? [] : map.beams;
    if (!Array.isArray(beams) || !beams.every(function(x){ return Array.isArray(x) && x.length >= 1 && x.every(function(j, q){ return Math.floor(j) === j && j >= 0 && j < notes.length && (q === 0 || j > x[q - 1]); }); }))
      throw new Error("m-score: abcMap.beams must be lists of increasing note indices (such as [[4, 5, 6, 7]])");
    // 弧（タイとスラー）：{kind, from, to, pitch?（タイは音の高さごと）, n（描いた線の data-arc）}
    var arcs = map.arcs === undefined ? [] : map.arcs, byN = {};
    if (!Array.isArray(arcs)) throw new Error("m-score: abcMap.arcs must be a list of {kind, from, to, pitch, n}");
    var qOf = function(i, s){ var t = parsePitch(s); if (!t) return -1; for (var q = 0; q < notes[i].p.length; q++) if (notes[i].p[q].midi === t.midi) return q; return -1; };
    arcs.forEach(function(a, k){
      var msg = "m-score: abcMap.arcs[" + k + "]";
      if (!a || (a.kind !== "tie" && a.kind !== "slur")) throw new Error(msg + ".kind must be \"tie\" or \"slur\"");
      if (!(Math.floor(a.from) === a.from && Math.floor(a.to) === a.to && a.from >= 0 && a.from < a.to && a.to < notes.length)) throw new Error(msg + ": from and to must be note indices with from < to");
      if (!(Math.floor(a.n) === a.n && a.n >= 0) || byN[a.n]) throw new Error(msg + ".n must be a number used once (the data-arc of its drawn line)");
      if (a.kind === "tie" && (qOf(a.from, a.pitch) < 0 || qOf(a.to, a.pitch) < 0)) throw new Error(msg + ": a tie needs a pitch (such as \"C4\") that both notes have");
      byN[a.n] = a;
    });
    // タイの先の音の高さ（鳴らし直さない）：kind "tie" の弧の to と pitch。held[i][q]
    var held = notes.map(function(n){ return n.p.map(function(){ return false; }); }), next = {};
    arcs.forEach(function(a){ if (a.kind !== "tie") return; held[a.to][qOf(a.to, a.pitch)] = true; next[a.from + ":" + qOf(a.from, a.pitch)] = a; });
    notes.forEach(function(n, i){ n.p.forEach(function(p, q){ p.held = held[i][q]; }); n.tie = n.p.length > 0 && n.p.every(function(p){ return p.held; }); });
    // 鳴る秒：音の高さごとに、タイでつながる先の音符の分まで（鳴るのは始めの音符だけ）
    var sound = notes.map(function(n, i){
      return n.p.map(function(p, q){
        if (p.held) return 0;
        var d = n.dur, a = next[i + ":" + q], guard = 0;
        while (a && guard++ < notes.length){ d += notes[a.to].dur; a = next[a.to + ":" + qOf(a.to, a.pitch)]; }
        return d * spb;
      });
    });
    var steps = [], stepOf = [], at = [];
    if (by === "note") notes.forEach(function(n){ stepOf[n.i] = steps.length + 1; at[n.i] = 0; steps.push({notes: [n.i], len: n.dur * spb}); });
    else notes.forEach(function(n){
      var last = steps[steps.length - 1];
      if (!last || last.m !== n.m){ last = {m: n.m, notes: [], len: 0, b0: n.beat}; steps.push(last); }
      last.notes.push(n.i); stepOf[n.i] = steps.length;
      at[n.i] = Math.max(0, (n.beat - last.b0) * spb);
      last.len = Math.max(last.len, at[n.i] + n.dur * spb);
    });
    steps.forEach(function(s){ s.len = +s.len.toFixed(6); delete s.b0; });
    return {tempo: map.tempo, spb: spb, notes: notes, steps: steps, stepOf: stepOf, at: at, sound: sound, beams: beams, arcs: arcs, byN: byN};
  }
  // 段階 k の音：音の高さ 1 つに 1 つの note（和音は同じ t）。休符・タイの先は鳴らない
  function events(pl, k){
    var s = pl.steps[k - 1], out = [];
    if (!s) return out;
    s.notes.forEach(function(i){
      var n = pl.notes[i];
      n.p.forEach(function(p, q){
        if (!pl.sound[i][q]) return;
        var name = p.letter + p.acc + p.oct;
        out.push({t: +pl.at[i].toFixed(6), sound: "note", pitch: /^[A-G][#b]?-?\d$/.test(name) ? name : p.midi, dur: +pl.sound[i][q].toFixed(6), vel: 0.7});
      });
    });
    return out;
  }
  // 名前の置き場所（DOM を使わない）：音符ごとに {i, x（符頭の箱の真ん中、楽譜の座標）, rows: [{s, r（下へ何行目）}]}。
  // 和音は高い音を上の行に。休符とタイの先は名前なし
  function names(pl, mode){
    var out = [];
    if (mode === "none") return out;
    pl.notes.forEach(function(n){
      if (!n.p.length || n.tie || !n.box) return;
      var ps = n.p.filter(function(p){ return !p.held; }).sort(function(a, b){ return b.midi - a.midi; });
      out.push({i: n.i, m: n.m, x: n.box[0] + n.box[2] / 2, rows: ps.map(function(p, r){ return {s: label(p, mode), r: r}; })});
    });
    return out;
  }
  // 名前を行に置く（px）：x = ox + 楽譜の x × s。和音は高い音が上の行に続けて並ぶ。1 行で重なる名前が小節の中に 1 か所でもあれば
  // （八分音符が続くところ）、その小節の名前を全部、ジグザグに置く：小節の 1・3・5…番目の音符は上の段、2・4…番目は下の段（段の高さは
  // その小節の和音のいちばん多い音の数）。重ならない小節は 1 段のまま。est(文字, 大きさ) は字の幅の見積もり。
  // → {labels: [{i, s, x, row}], rows, zig: [ジグザグにした小節], overlap（ジグザグでも重なった）}
  function place(items, s, ox, size, est){
    var GAP = 4, labels = [], zig = [], overlap = false, rows = 0;
    var list = items.slice().sort(function(a, b){ return a.i - b.i; }).map(function(n){
      return {n: n, x: ox + n.x * s, w: n.rows.map(function(rw){ return est(rw.s, size); })};
    });
    // 同じ行で重なるか（a が前の音符。b が左にあるのは段が変わったところで、重ならない）。名前は譜面の順（i）に並べる
    var hits = function(a, b, ra, rb){
      for (var p = 0; p < a.w.length; p++) for (var q = 0; q < b.w.length; q++)
        if (ra + p === rb + q && b.x >= a.x && b.x - b.w[q] / 2 < a.x + a.w[p] / 2 + GAP) return true;
      return false;
    };
    var ms = [];
    list.forEach(function(e){ var g = ms[ms.length - 1]; if (!g || g.m !== e.n.m){ g = {m: e.n.m, e: []}; ms.push(g); } g.e.push(e); });
    ms.forEach(function(g, gi){
      var c = g.e.reduce(function(a, e){ return Math.max(a, e.w.length); }, 0);
      var crowded = g.e.some(function(e, j){ return j > 0 && hits(g.e[j - 1], e, 0, 0); });
      // 前の小節の最後の名前と、この小節の最初の名前が重なるときも、この小節をジグザグにする
      var prev = gi > 0 ? ms[gi - 1].e[ms[gi - 1].e.length - 1] : null;
      if (!crowded && prev && hits(prev, g.e[0], prev.row0, 0)) crowded = true;
      if (crowded) zig.push(g.m);
      g.e.forEach(function(e, j){
        e.row0 = crowded && j % 2 === 1 ? c : 0;
        e.n.rows.forEach(function(rw, r){ labels.push({i: e.n.i, s: rw.s, x: e.x, row: e.row0 + r}); });
        rows = Math.max(rows, e.row0 + e.w.length);
      });
    });
    // 置いた後も重なっていないか（同じ行の、となり合う名前）
    for (var j = 1; j < list.length; j++) for (var q = j - 1; q >= Math.max(0, j - 3); q--) if (hits(list[q], list[j], list[q].row0, list[j].row0)) overlap = true;
    return {labels: labels, rows: rows, zig: zig, overlap: overlap};
  }
  // 読める層の文：小節は「｜」、和音は「（ド・ミ・ソ）」、休符は「休み」/「rest」、タイの先は「〜」
  function readable(pl, mode, ja){
    var bars = [], cur = null, lastM;
    pl.notes.forEach(function(n){
      if (!cur || n.m !== lastM){ cur = []; bars.push(cur); lastM = n.m; }
      var lb = function(p){ return p.held ? "〜" : label(p, mode); };
      cur.push(n.tie ? "〜" : !n.p.length ? (ja ? "休み" : "rest") : n.p.length > 1 ? (ja ? "（" : "(") + n.p.map(lb).join("・") + (ja ? "）" : ")") : lb(n.p[0]));
    });
    return bars.map(function(b){ return b.join(" "); }).join("｜");
  }
  // 楽譜の木の要素を、どの音符と一緒に出すか決める（DOM を使わない）。組み立てが付けた data- の印だけを読む（abcjs の class は読まない）：
  //   data-note="i"：notes[i] の音符・休符。data-beam="k"：beams[k] の連桁（最初の音符と）。data-measure="m"：小節 m の小節線
  //   （その小節の最後の音符と）。data-arc="n"：arcs の n の弧の線（タイは to の音符と、スラーは from の音符と）。
  //   印のない要素は段階 0 から見える（五線・音部記号・調号・拍子など）。中に印のある g は中を見る。
  // → {parts: [{node, i（null なら段階 0 から）, note, top（いちばん上の子の何番目か＝段）}], missing: [印の要素がない音符], mismatch: [知らせ]}
  function assign(tree, pl){
    var out = [], seen = {}, beamSeen = {}, arcSeen = {}, mismatch = [], lastOf = {};
    var TAGS = ["data-note", "data-beam", "data-measure", "data-arc"];
    var tagged = function(k){ return TAGS.some(function(t){ return k.a[t] !== undefined; }) || k.kids.some(tagged); };
    pl.notes.forEach(function(n){ lastOf[n.m] = n.i; });
    var tag = function(k, name){ var v = k.a[name]; return v === undefined ? null : /^\d{1,6}$/.test(v) ? +v : NaN; };
    tree.kids.forEach(function(top, ti){
      (function walk(k){
        var i = tag(k, "data-note"), b = tag(k, "data-beam"), m = tag(k, "data-measure"), a = tag(k, "data-arc");
        if (i !== null){
          if (i < pl.notes.length && !seen[i]){ seen[i] = true; out.push({node: k, i: i, note: true, top: ti}); }
          else mismatch.push("data-note=\"" + i + "\" is " + (seen[i] ? "used twice" : "not an index of abcMap.notes"));
          return;
        }
        if (b !== null){
          if (pl.beams[b]){ beamSeen[b] = true; out.push({node: k, i: pl.beams[b][0], top: ti}); }
          else mismatch.push("data-beam=\"" + b + "\" is not an index of abcMap.beams");
          return;
        }
        if (m !== null){
          if (lastOf[m] !== undefined) out.push({node: k, i: lastOf[m], top: ti});
          else mismatch.push("data-measure=\"" + m + "\" is not a measure of abcMap.notes");
          return;
        }
        if (a !== null){
          var arc = pl.byN[a];
          if (arc){ arcSeen[a] = true; out.push({node: k, i: arc.kind === "tie" ? arc.to : arc.from, top: ti}); return; }
          mismatch.push("data-arc=\"" + a + "\" is not an n of abcMap.arcs");
        }
        if (k.tag === "g" && k.kids.some(tagged)){ k.kids.forEach(walk); return; }
        out.push({node: k, i: null, top: ti});
      })(top);
    });
    var missing = pl.notes.filter(function(n){ return !seen[n.i]; }).map(function(n){ return n.i; });
    if (missing.length) mismatch.push("no element has data-note for abcMap.notes[" + missing.join(", ") + "]");
    pl.beams.forEach(function(_, k){ if (!beamSeen[k]) mismatch.push("no element has data-beam=\"" + k + "\""); });
    var noArc = pl.arcs.filter(function(x){ return !arcSeen[x.n]; }).map(function(x){ return x.n; });
    if (noArc.length) mismatch.push("no element has data-arc for abcMap.arcs n " + noArc.join(", "));
    return {parts: out, missing: missing, mismatch: mismatch};
  }
  return {MARKUP: MARKUP, place: place, parseSvg: parseSvg, parsePitch: parsePitch, label: label, plan: plan, events: events, names: names, readable: readable, assign: assign};
})();

var FS = 26, ROW = 30;   // 名前の字（24 px 以上）と行の高さ
var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.3 : /[\u0000-ɏ]/.test(c) ? 0.62 : 1); }, 0) * size; };
return class extends base.MotionElement {
  static partName = "score";   // the registry name (define meta name), for report prefixes
  static variants = ["light"];
  static sc = SC;
  static build = {fields: {abc: "abcjs"}};
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["abc"], properties: {
      abc: {type: "string"}, abcSvg: {type: "string"},
      renderers: {type: "object", properties: {abcjs: {type: "object", required: ["version"], properties: {version: {type: "string"}, options: {type: "object"}}}}},
      abcMap: {type: "object", required: ["tempo", "notes"], properties: {
        tempo: {type: "number"},
        notes: {type: "array", minItems: 1, items: {type: "object", required: ["measure", "pitch", "beat", "dur"], properties: {
          measure: {type: "integer"}, pitch: {type: "array", items: {type: "string"}}, beat: {type: "number"}, dur: {type: "number"},
          box: {type: "array", items: {type: "number"}}}}},
        beams: {type: "array", items: {type: "array", items: {type: "integer"}}},
        arcs: {type: "array", items: {type: "object", required: ["kind", "from", "to", "n"], properties: {
          kind: {type: "string", enum: ["tie", "slur"]}, from: {type: "integer"}, to: {type: "integer"}, pitch: {type: "string"}, n: {type: "integer"}}}}}}}},
    example: {abc: "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F |]"},
    note: {en: "write abc only; the build adds abcSvg, abcMap and renderers", ja: "abc だけを書く（abcSvg・abcMap・renderers は組み立てが足す）"},
  };
  static props = {
    by: {type: "string", default: "note", doc: "note（1 音・和音ずつ）| measure（1 小節ずつ）"},
    names: {type: "string", default: "none", doc: "符頭の下の名前：solfa（ドレミ）| abc | iroha（ハニホ）| none"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps.length;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {};
    // 組み立てで描いていない（spec §6.2「Missing output」）：abc をそのまま字で見せ、mount で 1 回だけ知らせる。段階はない
    if (typeof d.abcSvg !== "string" && d.abcMap === undefined) return (this._plan = {missing: true, steps: [], attrNotes: []});
    if (typeof d.abcSvg !== "string" || !d.abcMap) throw new Error("m-score: abcSvg and abcMap come together (the build adds both when it renders abc with abcjs)");
    var names = this.props.names;
    var notes = [];
    if (["solfa", "abc", "iroha", "none"].indexOf(names) < 0){ notes.push('[score] names="' + names + '" is not solfa, abc, iroha or none (none is used)'); names = "none"; }
    var pl = SC.plan(d.abcMap, this.props.by);
    pl.names = names;
    pl.attrNotes = notes;   // attribute problems, reported in mount (steps reads plan before there is a ctx)
    return (this._plan = pl);
  }
  duration(k){ var s = k >= 1 && this.plan().steps[k - 1]; return s ? s.len : 0; }
  events(k){ var pl = this.plan(); return pl.missing ? [] : SC.events(pl, k); }
  mount(ctx){
    var self = this, D = base, pl = this.plan();
    this.variant = base.variant(this);
    this.ja = /^ja\b/i.test(ctx.lang);
    if (pl.missing) return this.showSource(ctx);
    pl.attrNotes.forEach(function(n){ ctx.report("attr", n); });
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight;
    var tree = SC.parseSvg(this.data.abcSvg), as = SC.assign(tree, pl);
    // drops, once per kind (spec §6.2): elements with their subtree, attributes, style declarations
    if (tree.dropped.element.length) ctx.report("data", "[score] abcSvg: dropped elements the rendered-markup list does not admit: " + tree.dropped.element.join(", "));
    if (tree.dropped.attribute.length) ctx.report("data", "[score] abcSvg: dropped attributes the rendered-markup list does not admit: " + tree.dropped.attribute.join(", "));
    if (tree.dropped.style.length) ctx.report("data", "[score] abcSvg: dropped style declarations the rendered-markup list does not admit: " + tree.dropped.style.join(", "));
    as.mismatch.forEach(function(x){ ctx.report("data", "[score] abcSvg and abcMap do not match: " + x + " (an element without a known tag is shown from step 0)"); });
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    // 楽譜の木を組み直す（許した属性だけ。色は currentColor → color: var(--fg)）
    var mk = function(node, parent){
      var e = document.createElementNS("http://www.w3.org/2000/svg", node.tag);
      for (var k in node.a) e.setAttribute(k, node.a[k]);
      node.st.forEach(function(d){ e.style.setProperty(d[0], d[1]); });
      if (node.text) e.textContent = node.text;
      parent.appendChild(e);
      node.kids.forEach(function(c){ mk(c, e); });
      node.el = e;
      return e;
    };
    // 段：楽譜の SVG のいちばん上の子 1 つが 1 段（描き手は段ごとに 1 つの g にまとめる）。段ごとに g に分け、段の間に名前の帯を入れる
    var root = D.el("g", {fill: "currentColor", stroke: "currentColor", style: "color:var(--fg)"}, svg);
    var L = tree.kids.map(function(c, l){
      var g = D.el("g", {}, root);
      mk(c, g);
      var bb = {x: 0, y: 0, width: +tree.a.width || 600, height: +tree.a.height || 100};
      try { var b = g.getBBox(); if (b.height > 0) bb = b; } catch (e) {}
      return {l: l, g: g, top: bb.y, h: bb.height, x0: bb.x, x1: bb.x + bb.width, names: []};
    });
    // 名前（どの段のどの行か）
    var NM = SC.names(pl, pl.names), topOf = {};
    as.parts.forEach(function(p){ if (p.note) topOf[p.i] = p.top; });
    NM.forEach(function(n){
      var ln = L[topOf[n.i] || 0] || L[0];
      ln.names.push(n);
    });
    // 大きさ：幅と高さの両方に収める（名前の字は大きさによらず 26 px）。名前の行の数は倍率で変わるので、2 回まで決め直す
    var GAP = 14, cx0 = Math.min.apply(null, L.map(function(ln){ return ln.x0; })), svgW = Math.max.apply(null, L.map(function(ln){ return ln.x1; })) - cx0;
    var sumH = L.reduce(function(a, ln){ return a + ln.h; }, 0);
    L.forEach(function(ln){ ln.rows = ln.names.reduce(function(a, n){ return Math.max(a, n.rows.length); }, 0); });
    var s, ox;
    for (var pass = 0; pass < 3; pass++){
      var fixed = L.reduce(function(a, ln){ return a + (ln.rows ? 10 + ln.rows * ROW : 0); }, 0) + GAP * (L.length - 1);
      s = Math.min((W - 8) / svgW, (H - fixed - 4) / sumH, 3);
      if (!(s > 0)) s = 0.1;
      ox = (W - svgW * s) / 2 - cx0 * s;
      var same = true;
      L.forEach(function(ln){ ln.pl = SC.place(ln.names, s, ox, FS, est); if (ln.pl.rows > ln.rows){ ln.rows = ln.pl.rows; same = false; } });
      if (same) break;
    }
    L.forEach(function(ln){ ln.band = ln.rows ? 10 + ln.rows * ROW : 0; });
    if (s < 0.9) ctx.report("size", "[score] the element (" + W + "×" + H + " px) draws the staff at " + s.toFixed(2) + "× (the staff lines are " + (7.75 * s).toFixed(1) + " px apart); make it larger or show fewer measures");
    var used = sumH * s + L.reduce(function(a, ln){ return a + ln.band; }, 0) + GAP * (L.length - 1), y = Math.max(0, (H - used) / 2);
    this.geo = {s: s, ox: ox, lines: []};
    var gN = D.el("g", {}, svg);
    var labels = [];
    L.forEach(function(ln){
      ln.g.setAttribute("transform", "translate(" + ox.toFixed(2) + " " + (y - ln.top * s).toFixed(2) + ") scale(" + s.toFixed(4) + ")");
      var bottom = y + ln.h * s;
      self.geo.lines.push({top: y, bottom: bottom});
      if (ln.pl.overlap) ctx.report("size", "[score] the names under the notes overlap; make the element wider or use names=\"none\"");
      ln.pl.labels.forEach(function(lb){
        var t = D.el("text", {x: lb.x.toFixed(1), y: (bottom + 8 + FS + lb.row * ROW).toFixed(1), "font-size": FS, "text-anchor": "middle", fill: "var(--fg)", opacity: 0}, gN);
        t.textContent = lb.s;
        labels.push({i: lb.i, el: t});
      });
      y = bottom + ln.band + GAP;
    });
    if (used > H + 1) ctx.report("size", "[score] the score needs " + Math.ceil(used) + " px but the element is " + H + " px high");
    // 出す単位（音符・休符・小節線・連桁・タイ）。段階 0 から見えるものは触らない
    this.U = as.parts.filter(function(p){ return p.i !== null; }).map(function(p){ return {i: p.i, el: p.node.el, note: !!p.note}; });
    this.N = labels;
    // 読める層（画面にも印刷にも出ない）
    var ja = this.ja, mode = pl.names !== "none" ? pl.names : (ja ? "solfa" : "abc");
    var sr = document.createElement("p");
    sr.className = "sr-only";
    sr.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0");
    sr.textContent = (ja ? "楽譜：" : "Score: ") + SC.readable(pl, mode, ja);
    this.appendChild(sr);
    var nm = pl.steps.length && this.props.by === "measure" ? pl.steps.length : pl.notes.reduce(function(a, n){ return a.indexOf(n.m) < 0 ? a.concat([n.m]) : a; }, []).length;
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", ja ? "楽譜（" + nm + " 小節）" : "Score (" + nm + " measures)");
  }
  // abc not rendered at build time: its source as plain text (spec §6.2 Missing output), reported once
  showSource(ctx){
    ctx.report("data", "[score] abc not rendered at build time (the build renders it with abcjs and adds abcSvg and abcMap); its source is shown as text");
    this.style.display = "block";
    var pre = document.createElement("pre");
    pre.className = "m-score-source";
    pre.setAttribute("style", "margin:0;font-size:24px;line-height:1.3;white-space:pre-wrap;color:var(--fg)");
    pre.textContent = String(this.data.abc || "");
    this.appendChild(pre);
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.ja ? "楽譜（ABC 記譜法）" : "Score (ABC notation)");
  }
  render(k, t, ctx){
    var pl = this.plan(), preview = !!ctx.preview;
    if (pl.missing) return;
    // 薄さはテーマの --preview-opacity（仕様 §8.4「Answers under preview」）。書いていないテーマだけ 0.45
    var FAINT = 0;
    if (preview) FAINT = base.previewOpacity(this);
    var state = function(i){
      var s = pl.stepOf[i];
      if (s < k) return {o: 1, cur: false};
      if (s > k) return {o: FAINT, cur: false};
      var len = Math.min(0.25, pl.notes[i].dur * pl.spb);
      return {o: t === Infinity ? 1 : base.prog(t, pl.at[i], len), cur: true};
    };
    this.U.forEach(function(u){
      var st = state(u.i);
      u.el.setAttribute("opacity", st.o.toFixed(3));
      // 今の段階の音符・休符は --emph、ほかは --fg（親の color）
      if (u.note && st.cur) u.el.setAttribute("style", "color:var(--emph)"); else u.el.removeAttribute("style");
    });
    this.N.forEach(function(n){
      var st = state(n.i);
      n.el.setAttribute("opacity", st.o.toFixed(3));
      n.el.setAttribute("font-weight", st.cur ? 700 : 400);
    });
  }
};
});
