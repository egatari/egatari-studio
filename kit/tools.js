// 発表中の道具（tools.js）：一覧表示、レーザーポインタ、ペン、消えるペン。(i, k, t) の描画とは独立した重ね描き
// - o：一覧（矢印で選び Enter・クリックで移る、Esc / o で閉じる）
// - x：レーザー、d：ペン、v：消えるペン（もう一度押すか Esc で解除）、Shift+d：ペンの色（--emph → --term → --fg、赤・青・黒）
//   ペンの間は帯のペンのボタンの後ろに色のボタンが出る。色を変えると短く知らせ、発表者ビューにも番号で知らせる
// - Backspace：今のスライドの書き込みを消す（ペンのとき）、Shift+Backspace：全スライドの書き込みを消す
// - 動画（?mode=video）では何も作らない。印刷では隠す。発表者ビューの「今の画面」で描いた線は本体に送る
// - 操作の帯：マウスを動かすと下の余白（足りなければ下端）に出て、2.5 秒止まると隠れる。ボタンはキーと同じ操作をする
// - ?：キーの一覧（開発サーバーのときは e / n / c も載せる）。下に「フィードバックを送る」（DECK.feedbackUrl、data-feedback="off" で消える）
// - キーボードだけでも使える：帯のボタンは Tab で選べ（フォーカスの枠は :focus-visible のときだけ）、切り替えのボタンは aria-pressed、
//   一覧の縮図はボタンで、矢印で選ぶとフォーカスも動く。一覧・キーの一覧を Esc で閉じると、開く前のフォーカスに戻す
(function(){
"use strict";
var DECK = window.DECK;
if (!DECK || DECK.mode === "video") return;
var Q = new URLSearchParams(location.search);
var W = 1280, H = 720;
var COLORS = ["emph", "term", "fg"];
var LABEL = DECK.ja === false ? {laser: "Laser", pen: "Pen", vpen: "Fading pen"} : {laser: "レーザー", pen: "ペン", vpen: "消えるペン"};
// ペンの色の名前（COLORS の順）と、色を選ぶボタンの名前
var CNAME = DECK.ja === false ? ["Red", "Blue", "Black"] : ["赤", "青", "黒"];
var CLAB = function(c){ return (DECK.ja === false ? "Pen color: " : "ペンの色：") + CNAME[c]; };
var HOLD = .7, FADE = .5;        // 消えるペン：書き終えてから HOLD 秒後に FADE 秒で消える
var IDLE = 2000;                 // レーザー：マウスが止まって 2 秒で消える

// ボタンの絵（操作の帯と発表者ビューで共通）
var SVG = function(d){ return '<svg viewBox="0 0 16 16" aria-hidden="true">' + d + "</svg>"; };
var PEN = '<path d="M4.2 10.6l.9-3L10.6 2.1l2.3 2.3-5.5 5.5z"/><path d="M9.3 3.4l2.3 2.3"/>';
var ICON = {
  prev: SVG('<path d="M10 3.2L5.2 8l4.8 4.8"/>'),
  next: SVG('<path d="M6 3.2L10.8 8 6 12.8"/>'),
  play: SVG('<path d="M5 3.2l8 4.8-8 4.8z" fill="currentColor"/>'),
  stop: SVG('<rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor"/>'),
  laser: SVG('<circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="5.6" opacity=".5"/>'),
  pen: SVG(PEN + '<path d="M2 14h12"/>'),
  vpen: SVG(PEN + '<path d="M2 14h12" stroke-dasharray="1.4 2.2"/>'),
  clear: SVG('<path d="M7.4 13.5H14"/><path d="M5.6 13.5L2.6 10.5a1.2 1.2 0 0 1 0-1.7l6-6a1.2 1.2 0 0 1 1.7 0l3 3a1.2 1.2 0 0 1 0 1.7L7.4 13.5z"/><path d="M5.4 6.2l4.4 4.4"/>'),
  over: SVG('<rect x="2" y="2.8" width="5" height="4" rx=".8"/><rect x="9" y="2.8" width="5" height="4" rx=".8"/><rect x="2" y="9.2" width="5" height="4" rx=".8"/><rect x="9" y="9.2" width="5" height="4" rx=".8"/>'),
  lect: SVG('<rect x="2" y="6.3" width="8.5" height="3.4" rx=".6" fill="currentColor" stroke="none" opacity=".4"/><path d="M2.5 4h11M2.5 8h7.5M2.5 12h11"/>'),
  pres: SVG('<rect x="1.5" y="2.5" width="13" height="8.8" rx="1.2"/><path d="M8 11.3v2.4M5 13.7h6M4.2 5.6h4.6M4.2 8.1h2.8"/>'),
  full: SVG('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'),
  help: SVG('<path d="M5.8 5.8a2.3 2.3 0 1 1 3.3 2.1c-.7.3-1.1.9-1.1 1.6v.4"/><circle cx="8" cy="12.6" r=".4" fill="currentColor"/>'),
  cap: SVG('<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.6"/><path d="M7 6.6a1.7 1.7 0 1 0 0 2.8M11.6 6.6a1.7 1.7 0 1 0 0 2.8"/>')
};
function typing(t){ return t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)); }
function css(text){ var s = document.createElement("style"); s.className = "deck-tools"; s.textContent = text; document.head.appendChild(s); }

// ---------------------------------------------------------------- 発表者ビュー：キーを本体と「今の画面」に中継する
if (Q.get("presenter")){
  var pmode = null, pcolor = 0;
  var post = function(m){
    m.type = "deck-tool";
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(m, "*"); } catch (e) {}
    var f = document.getElementById("f-cur");
    if (f && f.contentWindow) f.contentWindow.postMessage(m, "*");
  };
  var key = function(k, shift){
    if (k === "x" || k === "d" || k === "v"){ var m = {x: "laser", d: "pen", v: "vpen"}[k]; pmode = pmode === m ? null : m; post({cmd: "mode", mode: pmode}); }
    else if (k === "D"){ pcolor = (pcolor + 1) % COLORS.length; post({cmd: "color", c: pcolor}); }
    else if (k === "Escape" && pmode){ pmode = null; post({cmd: "mode", mode: null}); }
    else if (k === "Backspace" && (pmode === "pen" || pmode === "vpen")) post({cmd: shift ? "clearAll" : "clear"});
    else if (k === "clear") post({cmd: "clear"});                 // 発表者ビューの「消す」ボタン（ペンでなくても消す）
    else if (k === "o" || k === "l") post({cmd: "key", key: k});  // 一覧・授業モードは本体のキーとして押す
    else return false;
    if (k !== "o" && k !== "l") document.dispatchEvent(new CustomEvent("deck:ptool", {detail: {mode: pmode}}));
    return true;
  };
  // 発表者ビュー（presenter.js）のボタンから使う
  // 色は番号で送る（本体・「今の画面」と食い違わないように）
  var setPColor = function(c){ pcolor = c; post({cmd: "color", c: c}); document.dispatchEvent(new CustomEvent("deck:ptool", {detail: {mode: pmode}})); };
  DECK.ptools = {key: key, mode: function(){ return pmode; }, icons: ICON, colors: COLORS, names: CNAME, label: CLAB,
    color: function(c){ if (c === undefined) return pcolor; setPColor(c); }};
  document.addEventListener("keydown", function(e){
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (key(e.key, e.shiftKey)) e.preventDefault();
  });
  window.addEventListener("message", function(e){
    var m = e.data || {}, f = document.getElementById("f-cur");
    // 本体でペンの色が変わった：覚えて「今の画面」にも渡す
    if (m.type === "deck-tool-state" && e.source === window.opener && typeof m.color === "number"){
      if (m.color !== pcolor){ pcolor = m.color; if (f && f.contentWindow) f.contentWindow.postMessage({type: "deck-tool", cmd: "color", c: pcolor}, "*"); document.dispatchEvent(new CustomEvent("deck:ptool", {detail: {mode: pmode}})); }
      return;
    }
    if (!f || e.source !== f.contentWindow) return;
    if (m.type === "deck-tool" && m.cmd === "pt"){ try { window.opener && window.opener.postMessage(m, "*"); } catch (err) {} }
    else if (m.type === "deck-tool-key" && !key(m.key, m.shift)){
      // 「今の画面」にフォーカスがあるときの送り操作
      var nx = /^(ArrowRight|ArrowDown|PageDown| )$/.test(m.key), pv = /^(ArrowLeft|ArrowUp|PageUp)$/.test(m.key);
      if ((nx || pv) && window.opener) window.opener.postMessage({type: "deck-cmd", cmd: nx ? "next" : "prev"}, "*");
    }
  });
  return;
}
if (DECK.view && DECK.view !== "follow") return;
var FOLLOW = DECK.view === "follow";     // 発表者ビューの中の「今の画面」：描いた点を親に送る

// ---------------------------------------------------------------- 見た目
css(
  "@media print{.deck-tools{display:none!important}}" +
  "#dt-layer{position:absolute;inset:0;z-index:20;pointer-events:none;touch-action:none}" +
  "#dt-layer.on{pointer-events:auto}#dt-layer.laser{cursor:none}#dt-layer.pen,#dt-layer.vpen{cursor:crosshair}" +
  "#dt-canvas{position:absolute;left:0;top:0;width:1280px;height:720px}" +
  "#dt-laser{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;opacity:0;transition:opacity .35s;" +
  " background:radial-gradient(circle,#fff 0 18%,#ff3b30 34%,rgba(255,40,40,.85) 60%,rgba(255,40,40,0) 72%);" +
  " box-shadow:0 0 10px 4px rgba(255,40,40,.55),0 0 26px 10px rgba(255,40,40,.22)}" +
  "#dt-laser.show{opacity:1;transition:opacity .08s}" +
  "#dt-ind{position:fixed;left:12px;bottom:12px;z-index:30;display:none;align-items:center;gap:7px;padding:3px 10px 3px 8px;border-radius:999px;" +
  " background:rgba(20,20,20,.62);color:#fff;font:12.5px/1.6 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;pointer-events:none;opacity:.85}" +
  "#dt-ind.on{display:flex}#dt-ind i{width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 2px #fff}#dt-ind small{opacity:.6;font-size:11px}" +
  "#dt-ov{position:fixed;inset:0;z-index:40;overflow:auto;background:#161618;padding:28px 32px 40px}" +
  "#dt-ov .dt-head,#dt-ov .dt-cap{font:14px/1.4 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;color:#ddd}" +
  "#dt-ov .dt-head{display:flex;gap:16px;align-items:baseline;margin:0 0 18px;color:#aaa;font-size:13px}#dt-ov .dt-head b{color:#fff;font-size:16px}" +
  "#dt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:22px 20px}" +
  ".dt-cell{all:unset;display:block;cursor:pointer;min-width:0}" +
  ".dt-thumb{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:6px;background:var(--bg,#fff);box-shadow:0 2px 10px rgba(0,0,0,.4);" +
  " outline:3px solid transparent;outline-offset:3px;transition:outline-color .12s}" +
  ".dt-thumb>.slide{position:absolute!important;left:0;top:0;transform-origin:0 0;transform:scale(var(--ov-s,.18));pointer-events:none}" +
  ".dt-cell:hover .dt-thumb{outline-color:rgba(255,255,255,.35)}.dt-cell.sel .dt-thumb{outline-color:#fff}" +
  ".dt-cap{display:flex;gap:8px;margin-top:8px;white-space:nowrap;overflow:hidden}.dt-cap span{overflow:hidden;text-overflow:ellipsis}" +
  ".dt-cap b{font-variant-numeric:tabular-nums;color:#999;font-weight:600}" +
  ".dt-cell.cur .dt-cap b{color:#fff;background:var(--emph,#d33);border-radius:4px;padding:0 6px}.dt-cell.sel .dt-cap{color:#fff}" +
  // 操作の帯（モード表示と同じ、暗い半透明の丸い帯）
  "#dt-cb{position:fixed;left:50%;bottom:10px;z-index:35;display:flex;align-items:center;gap:1px;padding:3px 7px;border-radius:999px;" +
  " background:rgba(20,20,20,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 2px 12px rgba(0,0,0,.25);" +
  " opacity:0;pointer-events:none;transform:translate(-50%,6px);transition:opacity .25s,transform .25s;user-select:none;-webkit-user-select:none}" +
  "#dt-cb.show{opacity:.92;pointer-events:auto;transform:translate(-50%,0)}#dt-cb.show:hover{opacity:1}" +
  "#dt-cb button{all:unset;position:relative;box-sizing:border-box;width:32px;height:32px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,.86);" +
  " display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:background .12s,color .12s}" +
  "#dt-cb button:hover{background:rgba(255,255,255,.14);color:#fff}" +
  "#dt-cb button.on{background:rgba(255,255,255,.88);color:#151515}" +
  // キーボードで選んだときだけ枠を出す（マウスで押したときは出さない）
  "#dt-cb button:focus-visible{outline:2px solid #fff;outline-offset:1px;box-shadow:0 0 0 4px rgba(0,0,0,.55)}" +
  ".dt-cell:focus-visible .dt-thumb{outline-color:#fff}#dt-help .dt-card:focus{outline:none}#dt-help .dt-fb a:focus-visible{outline:2px solid #9cc8ff;outline-offset:2px}" +
  "#dt-cb svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}" +
  "#dt-cb kbd{font:600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.55;letter-spacing:.02em}#dt-cb button.on kbd{opacity:.7}" +
  "#dt-cb .sep{width:1px;height:18px;background:rgba(255,255,255,.18);margin:0 5px}" +
  // ペンのボタンの今の色（右上の点）と、ペンの間だけ出る色のボタン（赤・青・黒）
  "#dt-cb .dt-dot{position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;box-shadow:0 0 0 1.5px #fff}" +
  "#dt-cb .dt-sw{display:flex;align-items:center;gap:1px;margin:0 2px}#dt-cb .dt-sw[hidden]{display:none}" +
  "#dt-cb .dt-sw button{width:24px}#dt-cb .dt-sw i{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 2px #fff}" +
  "#dt-cb .dt-sw button[aria-pressed=true]{background:rgba(255,255,255,.2)}#dt-cb .dt-sw button[aria-pressed=true] i{box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(255,255,255,.35)}" +
  // キーの一覧（?）
  "#dt-help{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.32);padding:16px}" +
  "#dt-help.show{display:flex}" +
  "#dt-help .dt-card{max-width:860px;width:fit-content;max-height:100%;overflow:auto;padding:18px 22px 14px;border-radius:14px;background:rgba(22,22,24,.94);" +
  " color:#e8e8e8;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.45)}" +
  "#dt-help .dt-cols{display:grid;grid-auto-flow:column;align-items:start;gap:6px 36px}" +
  "@media (max-width:760px){#dt-help .dt-cols{grid-auto-flow:row}}" +
  "#dt-help .dt-sec{display:grid;grid-template-columns:auto auto;align-content:start;column-gap:10px}#dt-help h3{grid-column:1/-1}" +
  "#dt-help h3{margin:10px 0 4px;font-size:11.5px;font-weight:600;color:#9a9a9a;letter-spacing:.04em}" +
  "#dt-help .dt-row{display:contents}#dt-help .dt-row>span{padding:3px 0;white-space:nowrap}#dt-help .dt-row>span:first-child{text-align:right}" +
  "#dt-help kbd{display:inline-block;min-width:20px;margin:0 1px;padding:1px 5px;border:1px solid rgba(255,255,255,.22);border-bottom-width:2px;border-radius:5px;" +
  " background:rgba(255,255,255,.07);font:600 11.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;color:#fff}" +
  "#dt-help .dt-foot{margin-top:12px;color:#888;font-size:11.5px;text-align:center}" +
  "#dt-help .dt-fb{margin-top:8px;text-align:center;font-size:12px}#dt-help .dt-fb a{color:#9cc8ff;text-decoration:none}#dt-help .dt-fb a:hover{text-decoration:underline}" +
  "#dt-help .dt-ver{margin-left:10px;color:#777;font-variant-numeric:tabular-nums}"
);

// ---------------------------------------------------------------- 状態
var mode = null, color = 0, cur = 0;
var strokes = {};          // スライド番号 → ペンの線 [{pts:[[x,y,p]…], c, w, v}]
var vanish = [], vEnd = 0; // 消えるペンの線と、最後に書き終えた時刻
var drawing = null, layer, canvas, g, dot, ind, idleT = 0, raf = 0, scale = 1;
var colorCache = {};

// テーマの色を canvas で使える形にする（oklch() や color-mix() のままだと読めないことがあるので、塗って読む）
function rgb(name){
  if (colorCache[name]) return colorCache[name];
  var p = document.createElement("i"); p.style.color = "var(--" + name + ")"; document.body.appendChild(p);
  var c = getComputedStyle(p).color; p.remove();
  var cv = document.createElement("canvas"); cv.width = cv.height = 1;
  var x = cv.getContext("2d", {willReadFrequently: true}); x.fillStyle = "#d22"; x.fillStyle = c; x.fillRect(0, 0, 1, 1);
  var d = x.getImageData(0, 0, 1, 1).data;
  return (colorCache[name] = "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")");
}

function build(){
  var stage = document.getElementById("stage");
  if (!stage || layer) return;
  layer = document.createElement("div"); layer.id = "dt-layer"; layer.className = "deck-tools";
  layer.setAttribute("aria-hidden", "true");   // 描くための面。フォーカスは取らない（tabindex なし、押してもフォーカスを動かさない）
  canvas = document.createElement("canvas"); canvas.id = "dt-canvas";
  dot = document.createElement("div"); dot.id = "dt-laser";
  layer.appendChild(canvas); layer.appendChild(dot); stage.appendChild(layer);
  ind = document.createElement("div"); ind.id = "dt-ind"; ind.className = "deck-tools"; ind.setAttribute("role", "status"); document.body.appendChild(ind);
  g = canvas.getContext("2d");
  cur = DECK.state().slide - 1;
  resize();
  layer.addEventListener("pointerdown", function(e){ e.preventDefault(); if (e.button > 0) return; layer.setPointerCapture(e.pointerId); input("down", pt(e)); });
  layer.addEventListener("pointermove", function(e){
    var ev = drawing && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (ev.length ? ev : [e]).forEach(function(x){ input("move", pt(x)); });
  });
  layer.addEventListener("pointerup", function(e){ input("up", pt(e)); });
  layer.addEventListener("pointercancel", function(e){ input("up", pt(e)); });
  layer.addEventListener("pointerleave", function(){ if (!drawing) input("leave"); });
  // 道具を使っている間は、舞台へのクリック（Alt+クリックの指示など）を止める
  window.addEventListener("click", function(e){ if (mode && layer.contains(e.target)){ e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener("deck:pos", function(e){
    // 発表者ビューから送られたら一覧を閉じる（自動再生で進むときはそのまま）
    if (ov && !e.detail.auto) closeOverview();
    if (e.detail.i === cur) return;
    cur = e.detail.i; drawing = null; vanish = []; redraw();
  });
  window.addEventListener("resize", function(){ requestAnimationFrame(resize); });
  if (!FOLLOW) buildBar();
}

// canvas の画素数を、画面上の舞台の大きさに合わせる（座標は常に 1280×720）
function resize(){
  var r = layer.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  scale = Math.max(.25, r.width / W) * dpr;
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  redraw();
}
function pt(e){
  var r = layer.getBoundingClientRect();
  var p = e.pointerType === "mouse" || !e.pressure ? .5 : e.pressure;
  return {x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, p: p};
}

// ---------------------------------------------------------------- 入力（手元のポインタと、発表者ビューから送られた点の両方）
function input(phase, q){
  if (FOLLOW && mode) window.parent.postMessage({type: "deck-tool", cmd: "pt", phase: phase, x: q && q.x, y: q && q.y, p: q && q.p, c: COLORS[color]}, "*");
  if (mode === "laser"){
    if (phase === "leave"){ dot.classList.remove("show"); return; }
    dot.style.transform = "translate(" + q.x.toFixed(1) + "px," + q.y.toFixed(1) + "px)";
    dot.classList.add("show");
    clearTimeout(idleT); idleT = setTimeout(function(){ dot.classList.remove("show"); }, IDLE);
    return;
  }
  if (mode !== "pen" && mode !== "vpen") return;
  if (phase === "down"){
    drawing = {pts: [[q.x, q.y, q.p]], c: q.c || COLORS[color], w: mode === "vpen" ? 6 : 5, v: mode === "vpen"};
    (drawing.v ? vanish : (strokes[cur] = strokes[cur] || [])).push(drawing);
    redraw();
  } else if (phase === "move" && drawing){
    var l = drawing.pts[drawing.pts.length - 1];
    if (Math.abs(l[0] - q.x) + Math.abs(l[1] - q.y) < .6) return;
    drawing.pts.push([q.x, q.y, q.p]); redraw();
  } else if (phase === "up" && drawing){
    var v = drawing.v; drawing = null;
    if (v){ vEnd = performance.now(); loop(); }
    redraw();
  }
}

// ---------------------------------------------------------------- 描く
function line(s, alpha){
  var P = s.pts, n = P.length, col = rgb(s.c);
  g.globalAlpha = alpha; g.strokeStyle = g.fillStyle = col;
  g.lineCap = g.lineJoin = "round";
  g.shadowBlur = s.v ? 8 * scale : 0; g.shadowColor = col;
  var wd = function(p){ return s.w * (.55 + .9 * p); };
  if (n === 1){ g.beginPath(); g.arc(P[0][0], P[0][1], wd(P[0][2]) / 2, 0, 7); g.fill(); return; }
  // 圧力が一定なら 1 本の滑らかな線、変わるなら区間ごとに太さを変える
  var flat = P.every(function(q){ return q[2] === P[0][2]; });
  if (flat){
    g.lineWidth = wd(P[0][2]); g.beginPath(); g.moveTo(P[0][0], P[0][1]);
    for (var i = 1; i < n - 1; i++) g.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    g.lineTo(P[n - 1][0], P[n - 1][1]); g.stroke(); return;
  }
  var mx = P[0][0], my = P[0][1];
  for (var j = 1; j < n; j++){
    var ex = j < n - 1 ? (P[j][0] + P[j + 1][0]) / 2 : P[j][0], ey = j < n - 1 ? (P[j][1] + P[j + 1][1]) / 2 : P[j][1];
    g.lineWidth = wd((P[j - 1][2] + P[j][2]) / 2);
    g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo(P[j][0], P[j][1], ex, ey); g.stroke();
    mx = ex; my = ey;
  }
}
// 消えるペンの濃さ。書いている間は 1、書き終えて HOLD 秒後から FADE 秒で 0
function vAlpha(now){
  if (drawing && drawing.v) return 1;
  return Math.max(0, 1 - Math.max(0, (now - vEnd) / 1000 - HOLD) / FADE);
}
function redraw(){
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  (strokes[cur] || []).forEach(function(s){ line(s, 1); });
  var a = vAlpha(performance.now());
  if (a <= 0) vanish = [];
  vanish.forEach(function(s){ line(s, a); });
  g.globalAlpha = 1; g.shadowBlur = 0;
}
function loop(){
  if (raf) return;
  (function f(){
    redraw();
    raf = vanish.length ? requestAnimationFrame(f) : 0;
  })();
}

// ---------------------------------------------------------------- 道具の切り替え
function setMode(m){
  mode = m || null; drawing = null;
  if (!layer) return;
  layer.className = "deck-tools" + (mode ? " on " + mode : "");
  if (mode !== "laser"){ dot.classList.remove("show"); clearTimeout(idleT); }
  showInd(); syncBar();
}
function showInd(){
  ind.className = "deck-tools" + (mode ? " on" : "");
  if (!mode) return;
  ind.innerHTML = '<i style="background:' + (mode === "laser" ? "#ff3b30" : rgb(COLORS[color])) + '"></i>' +
    LABEL[mode] + (mode === "laser" ? "" : " · " + CNAME[color]) + (FOLLOW ? "" : "<small>" + (DECK.ja === false ? "Esc to exit" : "Esc で解除") + "</small>");
}
function toggle(m){ setMode(mode === m ? null : m); }
function clear(all){ if (all) strokes = {}; else delete strokes[cur]; vanish = []; drawing = null; redraw(); }
// ペンの色を変える（Shift+d・色のボタン・発表者ビュー）。短く知らせ、発表者ビューにも番号を知らせる
function setColor(c, quiet){
  c = ((+c % COLORS.length) + COLORS.length) % COLORS.length;
  if (isNaN(c)) return;
  color = c; showInd(); syncBar();
  if (!quiet && !FOLLOW && DECK.toast) DECK.toast(CLAB(color));
  sendState();
}
function nextColor(){ setColor(color + 1); }
function sendState(){ if (!FOLLOW && DECK.toPresenter) DECK.toPresenter({type: "deck-tool-state", color: color}); }
document.addEventListener("deck:presenter", sendState);

// 発表者ビューから（または発表者ビューが「今の画面」へ）送る操作
window.addEventListener("message", function(e){
  var m = e.data || {};
  if (m.type !== "deck-tool" || !layer) return;
  if (FOLLOW && e.source !== window.parent) return;
  if (m.cmd === "mode") setMode(m.mode);
  else if (m.cmd === "color"){ if (typeof m.c === "number") setColor(m.c, FOLLOW); else nextColor(); }
  else if (m.cmd === "clear" || m.cmd === "clearAll") clear(m.cmd === "clearAll");
  else if (m.cmd === "pt" && !FOLLOW && mode) input(m.phase, m.phase === "leave" ? null : {x: m.x, y: m.y, p: m.p, c: COLORS.indexOf(m.c) >= 0 ? m.c : null});
  else if (m.cmd === "key" && m.key === "l"){
    // 授業モード：本体はキーとして押し、「今の画面」は自分で切り替える（deck.js は埋め込みのキーを受けない）
    if (!FOLLOW) press("l");
    else { DECK.mode = DECK.mode === "lecture" ? "talk" : "lecture"; document.documentElement.setAttribute("data-mode", DECK.mode); var s = DECK.state(); DECK.seek(s.slide - 1, s.step, Infinity); }
  }
  else if (m.cmd === "key" && m.key === "o" && !FOLLOW){ if (ov) closeOverview(); else openOverview(); }
});

// ---------------------------------------------------------------- 一覧（o）
// 各スライドを一度だけ最終状態に描いて複製し、縮めて並べる。終わったら元の位置に描き直す
var ov = null;
function titleOf(s){ var h = s.querySelector("h2, h1"); return h ? (h.getAttribute("data-title") || h.textContent.replace(/\s+/g, " ").trim()) : ""; }
// 複製の中の id を付け替え、url(#…) と href="#…" も合わせる（元の clipPath などを指したままだと図が欠ける）
function uniqIds(root, pre){
  var all = root.querySelectorAll("[id]");
  if (!all.length) return;
  var map = {};
  [].forEach.call(all, function(e){ map[e.id] = pre + e.id; e.id = pre + e.id; });
  var re = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/g;
  [].forEach.call(root.querySelectorAll("*"), function(e){
    [].slice.call(e.attributes).forEach(function(a){
      var v = a.value, nv = v;
      if (v.indexOf("url(") >= 0) nv = v.replace(re, function(m, id){ return map[id] ? "url(#" + map[id] + ")" : m; });
      else if ((a.name === "href" || a.name === "xlink:href") && v[0] === "#" && map[v.slice(1)]) nv = "#" + map[v.slice(1)];
      if (nv !== v) e.setAttribute(a.name, nv);
    });
  });
}
// 開く前のフォーカスを覚えて、閉じたら戻す（なければ本体に戻す）
function keepFocus(){ var a = document.activeElement; return a && a !== document.body && !(cb && cb.contains(a) && !a.matches(":focus-visible")) ? a : null; }
function restoreFocus(a){
  if (a && a.isConnected && !a.closest("[inert]")){ try { a.focus({preventScroll: true}); return; } catch (e) {} }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}
function openOverview(){
  var slides = DECK.slides || [], st = DECK.state(), ci = st.slide - 1, ck = st.step, back = keepFocus();
  var box = document.createElement("div"); box.id = "dt-ov"; box.className = "deck-tools";
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", JA ? "スライド一覧" : "Slide overview");
  box.innerHTML = (DECK.ja === false
    ? '<div class="dt-head"><b>Slides</b><span>Arrows to select · Enter / click to go · Esc to close</span></div>'
    : '<div class="dt-head"><b>スライド一覧</b><span>矢印で選ぶ · Enter / クリックで移る · Esc で閉じる</span></div>') + '<div id="dt-grid"></div>';
  var grid = box.querySelector("#dt-grid"), cells = [];
  slides.forEach(function(s, i){
    DECK.seek(i, s._max, Infinity);
    var c = s.cloneNode(true);
    c.classList.remove("active"); c.removeAttribute("id"); uniqIds(c, "dt" + i + "-");
    c.style.visibility = "visible"; c.style.opacity = 1; c.style.zIndex = "auto";
    // 縮図は絵として扱う（中の文字や部品を読ませず、Tab でも入らない）。名前はボタンに付ける
    c.setAttribute("aria-hidden", "true"); c.inert = true;
    var cell = document.createElement("button"); cell.type = "button"; cell.className = "dt-cell" + (i === ci ? " cur" : "");
    cell.setAttribute("aria-label", (i + 1) + ". " + (titleOf(s) || (JA ? "スライド " : "Slide ") + (i + 1)));
    if (i === ci) cell.setAttribute("aria-current", "page");
    cell.innerHTML = '<span class="dt-thumb" style="display:block" aria-hidden="true"></span><span class="dt-cap" style="display:flex" aria-hidden="true"><b>' + (i + 1) + "</b><span></span></span>";
    cell.querySelector(".dt-thumb").appendChild(c);
    cell.querySelector(".dt-cap span").textContent = titleOf(s);
    cell.addEventListener("click", function(){ pick(i); });
    grid.appendChild(cell); cells.push(cell);
  });
  DECK.seek(ci, ck, Infinity);     // 元の位置に戻す
  document.body.appendChild(box);
  ov = {box: box, cells: cells, sel: ci, ci: ci, back: back};
  if (cb) cb.inert = true;   // 一覧の間は Tab が下の帯に抜けない
  fitOv(); select(ci);
}
function fitOv(){
  if (!ov || !ov.cells.length) return;
  ov.box.style.setProperty("--ov-s", ov.cells[0].querySelector(".dt-thumb").clientWidth / W);
}
function select(i){
  ov.sel = Math.max(0, Math.min(ov.cells.length - 1, i));
  ov.cells.forEach(function(c, j){ c.classList.toggle("sel", j === ov.sel); });
  ov.cells[ov.sel].focus({preventScroll: true});   // フォーカスも選んだ縮図に動かす（読み上げソフトが名前を読む）
  ov.cells[ov.sel].scrollIntoView({block: "nearest"});
}
function closeOverview(){ if (ov){ var back = ov.back; ov.box.remove(); ov = null; if (cb) cb.inert = false; restoreFocus(back); } }
function pick(i){
  var same = i === ov.ci;
  closeOverview();
  if (!same){ DECK.autoplay(false); DECK.go(i, 0, false); }
}
function cols(){ return getComputedStyle(ov.box.querySelector("#dt-grid")).gridTemplateColumns.split(" ").length; }
window.addEventListener("resize", fitOv);

// ---------------------------------------------------------------- 操作の帯とキーの一覧（?）
// ボタンはキーを押したのと同じにする（deck.js のキーも、この道具のキーも、同じ経路を通る）
function press(k, shift){ document.dispatchEvent(new KeyboardEvent("keydown", {key: k, shiftKey: !!shift, bubbles: true, cancelable: true})); }
var JA = DECK.ja !== false;
var TIP = JA
  ? {prev: "前へ", next: "次へ", auto: "自動再生", laser: "レーザー", pen: "ペン", vpen: "消えるペン", clear: "書き込みを消す", over: "スライド一覧",
     lect: "授業モード", cap: "字幕", pres: "発表者ビュー", full: "全画面", help: "キーの一覧"}
  : {prev: "Previous", next: "Next", auto: "Autoplay", laser: "Laser", pen: "Pen", vpen: "Fading pen", clear: "Clear ink", over: "Slide overview",
     lect: "Lecture mode", cap: "Captions", pres: "Presenter view", full: "Fullscreen", help: "Keyboard shortcuts"};
// [名前, 表示するキー, 押すキー（関数なら直接呼ぶ）]。null は区切り
var BTNS = [["prev", "←", "ArrowLeft"], ["next", "→", "ArrowRight"], ["auto", "a", "a"], null,
  ["laser", "x", "x"], ["pen", "d", "d"], ["vpen", "v", "v"], ["clear", "⌫", function(){ clear(false); }], null,
  ["over", "o", "o"], ["lect", "l", "l"], ["cap", "s", "s"], ["pres", "p", "p"], ["full", "f", "f"], null, ["help", "?", "?"]];
// 押すと入／切が変わるボタン（aria-pressed を付ける）
var TOGGLES = ["auto", "laser", "pen", "vpen", "lect", "cap", "full", "help"];
function kk(k){ return JA ? "（" + k + "）" : " (" + k + ")"; }
var cb = null, hideT = 0, helpBox = null, OVER_ZONE = 140, SHOW_MS = 2500;

function buildBar(){
  cb = document.createElement("div"); cb.id = "dt-cb"; cb.className = "deck-tools";
  cb.setAttribute("role", "toolbar");
  cb.setAttribute("aria-label", JA ? "スライドの操作" : "Slide controls");
  BTNS.forEach(function(b){
    if (!b){ var s = document.createElement("i"); s.className = "sep"; s.setAttribute("aria-hidden", "true"); cb.appendChild(s); return; }
    var e = document.createElement("button"); e.type = "button";
    e.setAttribute("data-b", b[0]);
    e.title = TIP[b[0]] + kk(b[1]);
    e.setAttribute("aria-label", TIP[b[0]]);
    e.setAttribute("aria-keyshortcuts", {"←": "ArrowLeft", "→": "ArrowRight", "⌫": "Backspace", "?": "Shift+?"}[b[1]] || b[1]);
    if (TOGGLES.indexOf(b[0]) >= 0) e.setAttribute("aria-pressed", "false");
    e.innerHTML = (ICON[b[0]] || ICON.play) + "<kbd>" + b[1] + "</kbd>" + (b[0] === "pen" || b[0] === "vpen" ? '<i class="dt-dot" aria-hidden="true"></i>' : "");
    e._act = b[2];
    cb.appendChild(e);
    // 消えるペンの後ろに、ペンの間だけ出る色のボタン
    if (b[0] === "vpen"){
      var sw = document.createElement("span"); sw.className = "dt-sw"; sw.hidden = true;
      sw.setAttribute("role", "group"); sw.setAttribute("aria-label", JA ? "ペンの色" : "Pen color");
      COLORS.forEach(function(c, j){
        var x = document.createElement("button"); x.type = "button";
        x.setAttribute("data-c", j); x.title = CLAB(j) + kk("Shift+d"); x.setAttribute("aria-label", CLAB(j)); x.setAttribute("aria-pressed", "false");
        x.innerHTML = '<i aria-hidden="true" style="background:var(--' + c + ')"></i>';
        x._act = function(){ setColor(j); };
        sw.appendChild(x);
      });
      cb.appendChild(sw);
    }
  });
  document.body.appendChild(cb);
  // 押してもフォーカスを奪わず（矢印キーがそのまま効く）、下の舞台にも届かない（ペンで描かない・クリックで送らない）
  ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick"].forEach(function(t){
    cb.addEventListener(t, function(e){ e.preventDefault(); e.stopPropagation(); });
  });
  cb.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation();
    var b = e.target.closest("button");
    if (!b) return;
    if (typeof b._act === "function") b._act(); else press(b._act);
    // マウスで押したらフォーカスを残さない（矢印キーがそのまま効く）。キーボード（Enter / Space、detail = 0）なら残す
    if (e.detail !== 0){
      b.blur();
      if (document.activeElement && cb.contains(document.activeElement)) document.activeElement.blur();
    }
    wake();
  });
  // Tab で帯に入ったら見せておく
  cb.addEventListener("focusin", function(){ wake(); });
  document.addEventListener("deck:captions", syncBar);
  window.addEventListener("pointermove", function(e){ if (!e.buttons) wake(e); }, {passive: true});
  window.addEventListener("resize", placeBar);
  document.addEventListener("fullscreenchange", function(){ placeBar(); syncBar(); });
  document.addEventListener("deck:pos", syncBar);
  new MutationObserver(syncBar).observe(document.documentElement, {attributes: true, attributeFilter: ["class", "data-mode"]});
  placeBar(); syncBar();
  wake();              // 開いたときに一度見せて、あることを知らせる
}
// 舞台の下に 44px 以上の余白があれば余白の真ん中に、なければ下端に重ねる
function placeBar(){
  if (!cb) return;
  var k = Math.min(innerWidth / W, innerHeight / H), m = (innerHeight - H * k) / 2;
  cb._over = m < 44;
  cb.style.bottom = (cb._over ? 10 : Math.max(5, Math.round((m - 38) / 2))) + "px";
}
function wake(e){
  if (!cb) return;
  // 舞台に重ねるときは、下のほうにマウスが来たときだけ出す（レーザーやペンの邪魔をしない）
  if (e && cb._over && e.clientY < innerHeight - OVER_ZONE && !cb.classList.contains("show")) return;
  cb.classList.add("show");
  clearTimeout(hideT);
  hideT = setTimeout(function hide(){
    if (cb.matches(":hover") || cb.contains(document.activeElement)){ hideT = setTimeout(hide, 800); return; }
    cb.classList.remove("show");
  }, SHOW_MS);
}
function syncBar(){
  if (!cb) return;
  var on = function(n, v){
    var b = cb.querySelector('[data-b="' + n + '"]');
    if (b){ b.classList.toggle("on", !!v); if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", v ? "true" : "false"); }
    return b;
  };
  on("laser", mode === "laser"); on("pen", mode === "pen"); on("vpen", mode === "vpen");
  var pen = mode === "pen" || mode === "vpen", sw = cb.querySelector(".dt-sw");
  if (sw){
    sw.hidden = !pen;
    [].forEach.call(sw.children, function(x, j){ x.setAttribute("aria-pressed", j === color ? "true" : "false"); });
  }
  [].forEach.call(cb.querySelectorAll(".dt-dot"), function(d){ d.style.background = "var(--" + COLORS[color] + ")"; });
  on("lect", DECK.mode === "lecture"); on("cap", DECK.captions && DECK.captions()); on("full", !!document.fullscreenElement); on("help", !!(helpBox && helpBox.classList.contains("show")));
  var playing = document.documentElement.classList.contains("autoplay"), a = on("auto", playing);
  if (a && a._p !== playing){
    a._p = playing;
    a.innerHTML = (playing ? ICON.stop : ICON.play) + "<kbd>a</kbd>";
    a.title = (playing ? (JA ? "自動再生を止める" : "Stop autoplay") : TIP.auto) + kk("a");
    a.setAttribute("aria-label", playing ? (JA ? "自動再生を止める" : "Stop autoplay") : TIP.auto);
  }
}

// 開発サーバー（server/client.js）が入っているか。入っていれば e / n / c も一覧に載せる
function isDev(){ return !!(window.DECK_DEV || document.querySelector('script[src*="/__dev/client.js"]') || document.getElementById("dev-badge")); }
function helpHtml(){
  var K = function(){ return [].map.call(arguments, function(k){ return "<kbd>" + k + "</kbd>"; }).join(""); };
  var row = function(k, t){ return '<div class="dt-row"><span>' + k + "</span><span>" + t + "</span></div>"; };
  var sec = function(h, rows){ return '<div class="dt-sec"><h3>' + h + "</h3>" + rows.join("") + "</div>"; };
  var j = JA, cols = [
    sec(j ? "移動" : "Navigate", [
      row(K("→", "Space"), j ? "次の段階" : "Next step"), row(K("←"), j ? "前の段階" : "Previous step"),
      row(K("Shift") + "+" + K("←", "→"), j ? "スライド単位" : "By slide"), row(K("Home", "End"), j ? "最初 / 最後" : "First / last"),
      row(K("12") + " " + K("Enter"), j ? "そのページへ" : "Go to slide"), row(K("o"), j ? "スライド一覧" : "Overview")]),
    sec(j ? "表示" : "View", [
      row(K("a"), j ? "自動再生" : "Autoplay"), row(K("l"), j ? "授業モード" : "Lecture mode"), row(K("s"), j ? "字幕" : "Captions"),
      row(K("Shift") + "+" + K("s"), j ? "字幕の大きさ（S / M / L）" : "Caption size (S / M / L)"),
      row(K("b"), j ? "暗転" : "Blackout"), row(K("f"), j ? "全画面" : "Fullscreen"), row(K("p"), j ? "発表者ビュー" : "Presenter view"),
      row(K("?"), j ? "このキーの一覧" : "This help")]),
    sec(j ? "道具" : "Tools", [
      row(K("x"), j ? "レーザー" : "Laser"), row(K("d"), j ? "ペン" : "Pen"), row(K("v"), j ? "消えるペン" : "Fading pen"),
      row(K("Shift") + "+" + K("d"), j ? "ペンの色" : "Pen color"), row(K("Backspace"), j ? "書き込みを消す（Shift で全部）" : "Clear ink (Shift: all slides)"),
      row(K("Esc"), j ? "道具を解除" : "Exit tool")])
  ];
  if (isDev()) cols.push(sec(j ? "開発サーバー" : "Dev server", [
    row(K("e"), j ? "編集モード" : "Edit mode"), row(K("n"), j ? "口述原稿" : "Narration"), row(K("c"), j ? "コメントの一覧" : "Comments"),
    row(K(/mac|iphone|ipad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent) ? "⌥ option" : "Alt") + "+" + (j ? "クリック" : "click"), j ? "Claude への指示" : "Note to Claude")]));
  // フィードバック：版・ブラウザ・言語・モードだけを入れた issue form を開く（デッキの中身は送らない）
  var fb = DECK.feedbackUrl && DECK.feedbackUrl();
  var fbHtml = fb ? '<div class="dt-fb"><a href="' + fb.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' +
    (j ? "フィードバックを送る" : "Send feedback") + "</a>" +
    (DECK.VERSION ? '<span class="dt-ver">v' + DECK.VERSION + "</span>" : "") + "</div>" : "";
  return '<div class="dt-card"><div class="dt-cols">' + cols.join("") + '</div><div class="dt-foot">' +
    (j ? "下の帯のボタンでも同じ操作ができます · ? / Esc で閉じる" : "The buttons in the bottom bar do the same · ? / Esc to close") + "</div>" + fbHtml + "</div>";
}
function toggleHelp(on){
  if (!helpBox){
    helpBox = document.createElement("div"); helpBox.id = "dt-help"; helpBox.className = "deck-tools";
    helpBox.setAttribute("role", "dialog"); helpBox.setAttribute("aria-modal", "true"); helpBox.setAttribute("aria-label", TIP.help);
    helpBox.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
    helpBox.addEventListener("click", function(e){ e.stopPropagation(); if (e.target === helpBox) toggleHelp(false); });
    document.body.appendChild(helpBox);
  }
  if (on === undefined) on = !helpBox.classList.contains("show");
  var was = helpBox.classList.contains("show");
  if (on) helpBox.innerHTML = helpHtml();
  helpBox.classList.toggle("show", on);
  if (on && !was){
    helpBox._back = keepFocus();
    var card = helpBox.querySelector(".dt-card"); card.tabIndex = -1; card.focus({preventScroll: true});
  } else if (on){ var c2 = helpBox.querySelector(".dt-card"); c2.tabIndex = -1; c2.focus({preventScroll: true}); }
  else if (was){ var back = helpBox._back; helpBox._back = null; restoreFocus(back); }
  syncBar();
}

// ---------------------------------------------------------------- キー（deck.js より先に受け取る）
window.addEventListener("keydown", function(e){
  if (FOLLOW){
    // 「今の画面」にフォーカスがあるときは、キーを発表者ビューに渡す
    if (!typing(e.target)) window.parent.postMessage({type: "deck-tool-key", key: e.key, shift: e.shiftKey}, "*");
    return;
  }
  if (!layer || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  var k = e.key, done = true;
  if (ov){
    if (k === "ArrowRight") select(ov.sel + 1);
    else if (k === "ArrowLeft") select(ov.sel - 1);
    else if (k === "ArrowDown") select(ov.sel + cols());
    else if (k === "ArrowUp") select(ov.sel - cols());
    else if (k === "Home") select(0);
    else if (k === "End") select(ov.cells.length - 1);
    else if (k === "Enter" || k === " ") pick(ov.sel);
    else if (k === "Escape" || k === "o") closeOverview();
    // それ以外のキーも一覧の間は止める
  }
  else if (k === "?") toggleHelp();
  else if (k === "Escape" && helpBox && helpBox.classList.contains("show")) toggleHelp(false);
  else if (k === "o") openOverview();
  else if (k === "x") toggle("laser");
  else if (k === "d") toggle("pen");
  else if (k === "v") toggle("vpen");
  else if (k === "D") nextColor();
  else if (k === "Escape" && mode) setMode(null);
  else if (k === "Escape" && cb && cb.contains(document.activeElement)) document.activeElement.blur();   // 帯から本体に戻る
  else if (k === "Backspace" && (mode === "pen" || mode === "vpen")) clear(e.shiftKey);
  else done = false;
  if (done){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

if (DECK.ready) build(); else document.addEventListener("deck:ready", build);
DECK.tools = {mode: function(){ return mode; }, setMode: setMode, clear: clear, help: function(on){ toggleHelp(on); },
  color: function(c){ if (c === undefined) return color; setColor(c); },
  overview: function(on){ if (on === false) closeOverview(); else if (!ov) openOverview(); }};
})();
