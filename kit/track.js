// 進み具合の記録（track.js）：Player P6 の記録の口（tracking adapter）、format spec §9.2 の終えた判定、SCORM 1.2 の包み方（spec bindings/scorm12.md）
// - 口は 1 つだけ、この順に探す：SCORM 1.2 の API（自分と親の窓を 7 段まで、次に opener）→ 親の窓への postMessage（埋め込み ?embed=1 の枠の中。
//   埋め込みでない枠には {egatari: …} を送らない：Player P8）→ この端末（localStorage）
// - 出来事：started（見る人の最初の操作）・step {slideKey, stepKey, index, total, via}・completed・suspend {location, data}
//   via "stage"：舞台で再生した（スライド・スライドと本・「スライドで見る」の重ね。本だけの並べ方では台本で読むの縮図で再生している間だけ）。
//   舞台が本の窓に付いていっただけ（本の窓のスクロールで動いた：DECK.panes.state().fromText）の所は再生したことにしない（Player P6、spec 9873b9a）。
//   再生したことになるのは、舞台の再生・送り・舞台のクリック・ステップへのリンクで来た所
//   via "text"：本の窓で読んだ（その読む単位（kit/panes.js の DECK.panes.readable()）が 3 秒続けて見えていた。見えなくなったら数え直す＝読み飛ばしは数えない）
//   舞台の step は位置が変わるたび（舞台が見えているとき）、本の step はそのステップを初めて読んだときに送る
// - 舞台で再生したステップと読んだステップは別々に持つ。終えた判定（deck-meta.completion。なければ索引の metadata.completion）：
//   既定は全ステップ、{visitedFraction} はその割合、{reachedEnd} は最後のステップ。played: true なら舞台で再生したものだけを数える
// - SCORM の再開データ（cmi.suspend_data）：{"v":1,"n","h","seen","stage","text"}。seen は再生か読んだかのどちらか（包み方 §2.2 のまま）、
//   stage・text はその内訳（同じ bitset の形。省かない：spec 9873b9a）
// - 動画・発表者ビュー（とその中の画面）・編集のプレビュー（DECK_DEV）では何もしない。習う人のデータはファイルに書かない（format spec §9.1B）
(function(){
"use strict";
var DECK = window.DECK;
var Q = new URLSearchParams(location.search);
if (!DECK || DECK.mode === "video" || DECK.view || Q.get("presenter")) return;
var JA = DECK.ja !== false;
var DWELL = 3000, TICK = 500, COMMIT_GAP = 30000;

// ---------------------------------------------------------------- SHA-256（同期。file:// や安全でない枠では crypto.subtle がないことがある）
var K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256Hex(str){
  var b = new TextEncoder().encode(str), l = b.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(b); m[l] = 0x80;
  var bits = l * 8; for (var q = 0; q < 8; q++){ m[n - 1 - q] = bits & 255; bits = Math.floor(bits / 256); }
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Array(64);
  var rr = function(x, c){ return (x >>> c) | (x << (32 - c)); };
  for (var o = 0; o < n; o += 64){
    for (var t = 0; t < 16; t++) w[t] = (m[o + 4 * t] << 24) | (m[o + 4 * t + 1] << 16) | (m[o + 4 * t + 2] << 8) | m[o + 4 * t + 3];
    for (t = 16; t < 64; t++){ var s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++){
      var t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function(x){ return ("0000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
}

// ---------------------------------------------------------------- bitset（包み方 §2.2：j 番目は ⌊j/8⌋ バイトの j mod 8 ビット、下位から。base64url、= なし）
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function packBits(arr){
  var bytes = new Uint8Array(Math.ceil(arr.length / 8));
  for (var j = 0; j < arr.length; j++) if (arr[j]) bytes[j >> 3] |= 1 << (j & 7);
  var out = "";
  for (var i = 0; i < bytes.length; i += 3){
    var x = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), left = bytes.length - i;
    out += B64[(x >> 18) & 63] + B64[(x >> 12) & 63] + (left > 1 ? B64[(x >> 6) & 63] : "") + (left > 2 ? B64[x & 63] : "");
  }
  return out;
}
function unpackBits(s, n){
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  var bytes = [], acc = 0, nb = 0;
  for (var i = 0; i < s.length; i++){ acc = (acc << 6) | B64.indexOf(s[i]); nb += 6; if (nb >= 8){ nb -= 8; bytes.push((acc >> nb) & 255); } }
  if (bytes.length !== Math.ceil(n / 8)) return null;
  var out = new Uint8Array(n);
  for (var j = 0; j < n; j++) out[j] = (bytes[j >> 3] >> (j & 7)) & 1;
  return out;
}

// ---------------------------------------------------------------- 状態
var TL = [], ORD = Object.create(null), N = 0, H8 = "", stage = null, text = null, rule = {}, done = false, began = false;
var adapter = null, lastStageKey = null, lastSlide = -1;
function slideOf(j){ return TL[j] ? TL[j].i : -1; }
function stepParts(j){ var key = TL[j].key, c = key.lastIndexOf(":"); return {slideKey: key.slice(0, c), stepKey: key.slice(c + 1)}; }
// 終えた判定の決まり（format spec §9.2）。知らない決まりは「全ステップ」に戻る（schema の説明）
function readRule(){
  var c = DECK.META && DECK.META.completion;
  if (!c || typeof c !== "object"){
    var ix = DECK.FORMAT && DECK.FORMAT.indexId && document.getElementById(DECK.FORMAT.indexId);
    if (ix) try { var j = JSON.parse(ix.textContent); c = j && j.metadata && j.metadata.completion; } catch (e) {}
  }
  var r = {};
  if (c && typeof c === "object"){
    if (c.reachedEnd === true) r.reachedEnd = true;
    else if (typeof c.visitedFraction === "number" && c.visitedFraction > 0 && c.visitedFraction <= 1) r.visitedFraction = c.visitedFraction;
    if (c.played === true) r.played = true;
  }
  return r;
}
function counted(j){ return !!(stage[j] || (!rule.played && text[j])); }
function complete(){
  if (!N) return false;
  if (rule.reachedEnd) return counted(N - 1);
  var c = 0; for (var j = 0; j < N; j++) if (counted(j)) c++;
  return c >= Math.ceil((rule.visitedFraction || 1) * N - 1e-9);
}
function suspendData(){
  var seen = new Uint8Array(N); for (var j = 0; j < N; j++) seen[j] = stage[j] | text[j];
  // 内訳（stage・text）は省かない：包み手が 3 つの bitset で 4096 字を超えうる教材を断る（包み方 §2.2）
  return JSON.stringify({v: 1, n: N, h: H8, seen: packBits(seen), stage: packBits(stage), text: packBits(text)});
}
// 再開データを読む：v・n・h が今の教材と合うときだけ（合わなければ教材が変わった：使わない）。内訳がなければ seen を舞台で再生したものとする
function restore(s){
  var d; try { d = JSON.parse(s); } catch (e) { return false; }
  if (!d || d.v !== 1 || d.n !== N || d.h !== H8) return false;
  var seen = unpackBits(d.seen, N), st = d.stage !== undefined ? unpackBits(d.stage, N) : null, tx = d.text !== undefined ? unpackBits(d.text, N) : null;
  if (!seen) return false;
  for (var j = 0; j < N; j++){ stage[j] |= st && tx ? st[j] : seen[j]; text[j] |= st && tx ? tx[j] : 0; }
  return true;
}
function locationOf(){ var st = DECK.state && DECK.state(), j = st ? ORD[st.key] : undefined; return "#" + (j === undefined ? 0 : j); }

// ---------------------------------------------------------------- 記録の口
// SCORM 1.2（包み方 §2）
function findAPI(w){
  for (var n = 0; w && n <= 7; n++){
    try { if (w.API && typeof w.API.LMSInitialize === "function") return w.API; } catch (e) { return null; }
    var p; try { p = w.parent; } catch (e) { return null; }
    if (!p || p === w) break;
    w = p;
  }
  return null;
}
function scormAdapter(api){
  var t0 = Date.now(), finished = false, commitAt = 0, commitT = 0, review = false, lmsDone = false;
  var call = function(fn, a, b){
    var r; try { r = String(fn === "LMSSetValue" ? api[fn](a, b) : api[fn](a === undefined ? "" : a)); } catch (e) { r = "false"; }
    if (fn === "LMSGetValue" || r !== "true") try { api.LMSGetLastError(); } catch (e) {}
    return r;
  };
  var get = function(k){ return call("LMSGetValue", k); };
  var set = function(k, v){ if (!finished) call("LMSSetValue", k, v); };
  // 保存のたびに、ここまでの時間（session_time）と出口（exit：終えていなければ suspend）も書く。閉じる間（pagehide）の保存は届かないことがある：
  // ILIAS の SCORM 1.2 は同期の XHR で送り、Chrome・Safari はページを閉じる間の同期の XHR を止める。そのとき exit と時間が残らず、次は最初から・時間は 0 になる
  var stamp = function(){ set("cmi.core.session_time", time()); set("cmi.core.exit", done ? "" : "suspend"); };
  var commit = function(){ if (finished) return; clearTimeout(commitT); commitT = 0; commitAt = Date.now(); if (!review) stamp(); call("LMSCommit", ""); };
  var later = function(){ if (commitT) return; commitT = setTimeout(commit, Math.max(0, commitAt + COMMIT_GAP - Date.now())); };
  // CMITimespan（HHHH:MM:SS.SS）。百分の一秒の整数で数える（59.996 秒を "60.00" にしない）。9999 時間で止める
  var time = function(){
    var cs = Math.min(Math.round((Date.now() - t0) / 10), 359999999), pad = function(x, k){ return ("000" + x).slice(-k); };
    return pad(Math.floor(cs / 360000), 4) + ":" + pad(Math.floor(cs / 6000) % 60, 2) + ":" + pad(Math.floor(cs / 100) % 60, 2) + "." + pad(cs % 100, 2);
  };
  var a = {name: "scorm12", resumeAt: null,
    init: function(){
      if (call("LMSInitialize", "") !== "true"){ finished = true; return; }
      review = get("cmi.core.lesson_mode") === "review";
      var status = get("cmi.core.lesson_status"), entry = get("cmi.core.entry"), loc = get("cmi.core.lesson_location"), sd = get("cmi.suspend_data");
      a.status = status;
      lmsDone = status === "completed" || status === "passed";
      if (lmsDone) done = true;
      if (entry === "resume" && restore(sd)){ var m = /^#(0|[1-9][0-9]*)$/.exec(loc || ""); if (m && +m[1] < N) a.resumeAt = +m[1]; }
      if (!done && complete()) done = true;
    },
    started: function(){ if (!review && a.status === "not attempted"){ set("cmi.core.lesson_status", "incomplete"); a.status = "incomplete"; commit(); } },
    step: function(j){
      if (review) return;
      set("cmi.core.lesson_location", locationOf()); set("cmi.suspend_data", suspendData());
      var sl = slideOf(j);
      if (sl !== lastSlide){ lastSlide = sl; commit(); } else if (Date.now() - commitAt >= COMMIT_GAP) commit(); else later();
    },
    completed: function(){ if (review || lmsDone) return; lmsDone = true; set("cmi.core.lesson_status", "completed"); commit(); },
    hidden: function(){ commit(); },
    // beforeunload：pagehide より先に来る。ILIAS は Chrome でこの出来事の中なら sendBeacon で送る（basisAPI.js の useSendBeacon）。終えるのは pagehide のまま
    leaving: function(){ commit(); },
    end: function(){
      if (finished) return;
      if (review) stamp();   // 見直し（review）では閉じるときだけ書く
      commit(); call("LMSFinish", ""); finished = true;
    },
    finished: function(){ return finished; }
  };
  return a;
}
// 親の窓への postMessage（Player P6・P8 と同じ形 {egatari: …}。中身に個人のデータはない）
function postAdapter(){
  var post = function(m){ try { window.parent.postMessage(m, "*"); } catch (e) {} };
  return {name: "postmessage", init: function(){},
    started: function(){ post({egatari: "started"}); },
    step: function(j, via){ var p = stepParts(j); post({egatari: "step", slideKey: p.slideKey, stepKey: p.stepKey, index: j, total: N, via: via}); },
    completed: function(){ post({egatari: "completed"}); },
    hidden: function(){ post({egatari: "suspend", location: locationOf(), data: suspendData()}); },
    end: function(){ post({egatari: "suspend", location: locationOf(), data: suspendData()}); }};
}
// この端末（localStorage）：教材ごとに再開データと同じ形（終えたら done）。位置は覚えない（前の続きからは本の窓の読む助けの仕事）
function localAdapter(){
  var key = ((DECK.FORMAT && DECK.FORMAT.id) || "deck") + "-player-progress:" + ((DECK.META && typeof DECK.META.docId === "string" && DECK.META.docId) || location.pathname);
  var save = function(){ try { var d = JSON.parse(suspendData()); if (done) d.done = true; localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} };
  return {name: "local", key: key,
    init: function(){ var s = null; try { s = localStorage.getItem(key); } catch (e) {} if (s && restore(s)){ try { if (JSON.parse(s).done) done = true; } catch (e) {} } if (!done && complete()) done = true; },
    started: function(){}, step: save, completed: save, hidden: save, end: save};
}

// ---------------------------------------------------------------- 記録する
function begin(){
  if (began || !adapter) return;
  began = true;
  adapter.started();
}
function credit(j, via){
  if (j === undefined || j < 0 || j >= N) return;
  var arr = via === "text" ? text : stage, fresh = !arr[j];
  arr[j] = 1;
  if (via === "text" && !fresh) return;
  adapter.step(j, via);
  if (!done && complete()){ done = true; adapter.completed(); }
}
// 舞台が見えているか（kit/panes.js の並べ方。窓がなければ舞台だけ）
function stageShown(){
  if (document.visibilityState === "hidden") return false;
  var ps = DECK.panes && DECK.panes.state ? DECK.panes.state() : null;
  if (!ps || ps.overlay || ps.layout === "slides" || ps.layout === "split") return true;
  return !ps.article && ps.playing;   // 本だけ：台本で読むの縮図の舞台で再生している間
}
function textShown(){
  if (document.visibilityState === "hidden") return false;
  var ps = DECK.panes && DECK.panes.state ? DECK.panes.state() : null;
  return !!ps && !ps.overlay && (ps.layout === "book" || ps.layout === "split");
}
var followed = false;   // 今の所は、舞台が本の窓に付いていって来ただけ
function onStage(){
  if (followed || !stageShown()) return;
  var st = DECK.state(), j = ORD[st.key];
  if (j === undefined || st.key === lastStageKey) return;
  lastStageKey = st.key;
  credit(j, "stage");
}
// 本の窓：読む単位が窓の読む向きに十分見えている（短い単位は 9 割、長い単位は窓の半分）
var since = new Map(), tickT = 0;
function inView(el, b, vertical){
  var r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  var lo = vertical ? Math.max(r.left, b.left) : Math.max(r.top, b.top), hi = vertical ? Math.min(r.right, b.right) : Math.min(r.bottom, b.bottom);
  var vis = hi - lo, ext = vertical ? r.width : r.height, pane = vertical ? b.width : b.height;
  return vis > 0 && vis >= Math.min(ext * .9, pane * .5);
}
function tick(){
  tickT = 0;
  var rd = textShown() && DECK.panes.readable && DECK.panes.readable();
  if (!rd || !rd.body){ since.clear(); schedule(); return; }
  var b = rd.body.getBoundingClientRect(), now = Date.now(), seen = new Set();
  rd.units.forEach(function(u){
    if (!inView(u.el, b, rd.vertical)) return;
    seen.add(u);
    if (!since.has(u)) since.set(u, now);
    else if (now - since.get(u) >= DWELL) u.steps.forEach(function(s){ credit(ORD[DECK.stepKey(s[0], s[1])], "text"); });
  });
  since.forEach(function(v, u){ if (!seen.has(u)) since.delete(u); });
  schedule();
}
// 試験と調べ物の口：本の窓の大きさと、読む単位の見え方（読む向きの範囲と、見え始めてからの時間）
function readingView(){
  var rd = DECK.panes && DECK.panes.readable && DECK.panes.readable();
  if (!rd || !rd.body) return {shown: textShown(), visibility: document.visibilityState};
  var b = rd.body.getBoundingClientRect(), now = Date.now();
  return {shown: textShown(), visibility: document.visibilityState, body: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
    units: rd.units.map(function(u){ var r = u.el.getBoundingClientRect(); return {steps: u.steps.length, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inView: inView(u.el, b, rd.vertical), ms: since.has(u) ? now - since.get(u) : null}; })};
}
// 文書が見えている間は 0.5 秒ごとに見る（本の窓が後から開く・並べ方が替わるのを出来事に頼らない）
function schedule(){ if (!tickT && document.visibilityState !== "hidden") tickT = setTimeout(tick, TICK); }

// ---------------------------------------------------------------- 起動
function notice(){
  var d = document.createElement("div"); d.id = "deck-track-notice"; d.setAttribute("role", "status");
  d.textContent = JA ? "進行状況を記録できなくなりました。記録するには、この教材を開いた学習サイト（LMS）から開き直してください。" : "Progress can no longer be recorded. To record it, reopen this lesson from your learning platform (LMS).";
  d.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:60;max-width:min(92vw,560px);padding:8px 14px;border-radius:8px;" +
    "background:rgba(20,20,20,.9);color:#fff;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif";
  document.body.appendChild(d);
}
function init(){
  if (window.DECK_DEV) return;   // 編集のプレビュー：記録しない
  TL = DECK.timeline().map(function(g){ return {i: g.i, k: g.k, key: g.key}; });
  N = TL.length;
  if (!N) return;
  TL.forEach(function(g, j){ ORD[g.key] = j; });
  H8 = sha256Hex(TL.map(function(g){ return g.key + "\n"; }).join("")).slice(0, 8);
  stage = new Uint8Array(N); text = new Uint8Array(N);
  rule = readRule();
  var api = LMS_API;
  adapter = api ? scormAdapter(api) : window.parent !== window && Q.get("embed") === "1" ? postAdapter() : localAdapter();
  adapter.init();
  if (adapter.resumeAt !== null && adapter.resumeAt !== undefined){ var g = TL[adapter.resumeAt]; DECK.go(g.i, g.k, false); }
  ["pointerdown", "keydown"].forEach(function(n){ window.addEventListener(n, begin, {capture: true, passive: true}); });
  document.addEventListener("deck:pos", function(e){
    if (e.detail && e.detail.auto) begin();
    var ps = DECK.panes && DECK.panes.state ? DECK.panes.state() : null, st = DECK.state();
    // 本の窓のスクロールで舞台が動いた：再生したことにしない。同じ所で舞台が自分で動く（再生・送り）までそのまま
    if (ps && ps.fromText){ followed = true; lastStageKey = st.key; }
    else if (followed && (st.key !== lastStageKey || (e.detail && e.detail.auto) || (e.detail && e.detail.cause && e.detail.cause !== "seek"))) followed = false;
    onStage(); schedule();
  });
  new MutationObserver(function(){ lastStageKey = stageShown() ? lastStageKey : null; onStage(); schedule(); })
    .observe(document.documentElement, {attributes: true, attributeFilter: ["data-deck-layout", "class"]});
  document.addEventListener("scroll", schedule, {capture: true, passive: true});
  window.addEventListener("resize", schedule);
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "hidden"){ since.clear(); lastStageKey = null; adapter.hidden(); }
    else { onStage(); schedule(); }
  });
  if (adapter.leaving) window.addEventListener("beforeunload", function(){ adapter.leaving(); });
  window.addEventListener("pagehide", function(){ adapter.end(); });
  window.addEventListener("pageshow", function(e){ if (e.persisted && adapter.finished && adapter.finished() && !document.getElementById("deck-track-notice")) notice(); });
  onStage(); schedule();
}
// どの口で記録するか（読み込んだときに決める）。LMS（SCORM）か埋め込みの親が位置を持つときは、この端末の「前回の続きから」（kit/panes.js）を使わない
var LMS_API = (function(){ var a = findAPI(window); if (!a && window.opener) try { a = findAPI(window.opener); } catch (e) {} return a; })();
DECK.trackingAdapter = function(){ return window.DECK_DEV ? null : LMS_API ? "scorm12" : window.parent !== window && Q.get("embed") === "1" ? "postmessage" : "local"; };
DECK.tracking = function(){
  var list = function(a){ var o = []; if (a) for (var j = 0; j < a.length; j++) if (a[j]) o.push(j); return o; };
  return {adapter: adapter ? adapter.name : null, total: N, hash: H8, rule: rule, stage: list(stage), text: list(text), completed: done, started: began,
    suspendData: N ? suspendData() : null, reading: readingView()};
};
// 試験の手前の口：読む単位を見る間（3 秒）
DECK.tracking.DWELL = DWELL;
if (DECK.ready) setTimeout(init, 0); else document.addEventListener("deck:ready", function(){ setTimeout(init, 0); });
})();
