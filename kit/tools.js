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
  attach: SVG('<path d="M10.6 4.6L5.4 9.8a1.4 1.4 0 0 0 2 2l5.4-5.4a2.6 2.6 0 0 0-3.7-3.7L3.7 8.1a3.8 3.8 0 0 0 5.4 5.4l4.2-4.2"/>'),
  cap: SVG('<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.6"/><path d="M7 6.6a1.7 1.7 0 1 0 0 2.8M11.6 6.6a1.7 1.7 0 1 0 0 2.8"/>'),
  read: SVG('<path d="M2.4 6.2h2.4L8.2 3.4v9.2L4.8 9.8H2.4z"/><path d="M10.6 5.6a3.2 3.2 0 0 1 0 4.8M12.4 3.8a5.8 5.8 0 0 1 0 8.4"/>')
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
    else if (m.type === "deck-link" && typeof m.frag === "string"){
      // 「今の画面」で押したスライドへのリンク：本体でたどる（本体の位置が変われば、この画面もついてくる）
      if (window.opener) window.opener.postMessage({type: "deck-cmd", cmd: "link", frag: m.frag}, "*");
    }
    else if (m.type === "deck-tool-key" && !m.mod && (m.alt || !key(m.key, m.shift))){
      // Esc（道具を使っていなければ。使っていれば上の key が切る）と p：発表者ビューを閉じる（presenter.js。全画面なら全画面をやめるだけ）
      if (!m.alt && (m.key === "Escape" || m.key === "p")){ if (DECK.presenterClose) DECK.presenterClose(); return; }
      // 「今の画面」にフォーカスがあるときの送り操作。Backspace・Alt+← はリンクの前の位置へ戻る
      var bk = (m.key === "Backspace" && !m.alt && !m.shift) || (m.key === "ArrowLeft" && m.alt);
      var nx = !m.alt && /^(ArrowRight|ArrowDown|PageDown| )$/.test(m.key), pv = !m.alt && /^(ArrowLeft|ArrowUp|PageUp)$/.test(m.key);
      if ((nx || pv || bk) && window.opener) window.opener.postMessage({type: "deck-cmd", cmd: bk ? "back" : nx ? "next" : "prev"}, "*");
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
  // 合成した声の札（format spec §7.3）：帯と一緒に出て、一緒に隠れる
  // 読み上げ中の札（format spec §5.6：端末の声で読んでいることを示す）。読んでいる間だけ出る。印刷には出さない
  "#dt-ra{position:fixed;left:12px;top:12px;z-index:36;display:none;align-items:center;gap:7px;padding:4px 12px 4px 9px;border-radius:999px;" +
  " background:rgba(20,20,20,.72);color:#fff;font:600 12.5px/1.6 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;pointer-events:none}" +
  "#dt-ra.on{display:flex}#dt-ra svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}#dt-ra small{opacity:.65;font-weight:400;font-size:11px}" +
  "#dt-cb button[aria-disabled=true]{opacity:.38;cursor:default}#dt-cb button[aria-disabled=true]:hover{background:none;color:rgba(255,255,255,.86)}" +
  "#dt-cb .dt-aib{margin:0 3px 0 1px;padding:3px 7px;border:1px solid rgba(255,255,255,.3);border-radius:999px;color:rgba(255,255,255,.78);" +
  " font:600 10.5px/1 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;letter-spacing:.02em;white-space:nowrap;cursor:default}" +
  // 帯が字幕の上に重なるときは、帯が出ている間だけ字幕を帯の上へ（--dt-cb-lift は舞台の座標。隠れると戻る）
  "#deck-cap{transition:transform .25s}html.dt-cb-lift #deck-cap{transform:translateY(calc(-1 * var(--dt-cb-lift,0px)))}" +
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
  "#dt-help .dt-ai{margin:10px 0 0;text-align:center;font-size:12px;color:#c9ced8}" +
  "#dt-help .dt-fb{margin-top:8px;text-align:center;font-size:12px}#dt-help .dt-fb a{color:#9cc8ff;text-decoration:none}#dt-help .dt-fb a:hover{text-decoration:underline}" +
  "#dt-help .dt-ver{margin-left:10px;color:#777;font-variant-numeric:tabular-nums}" +
  // 添付（ダウンロードだけ）
  "#dt-help .dt-att{margin-top:12px;border-top:1px solid rgba(255,255,255,.14);padding-top:4px}#dt-help .dt-att ul{list-style:none;margin:0;padding:0}" +
  "#dt-help .dt-att li{display:flex;align-items:center;gap:12px;padding:5px 0}#dt-help .dt-att .dt-att-n{flex:1;min-width:0}" +
  "#dt-help .dt-att .dt-att-t{display:block;color:#fff;overflow-wrap:anywhere}#dt-help .dt-att .dt-att-m{display:block;color:#9a9a9a;font-size:11.5px;overflow-wrap:anywhere}" +
  "#dt-help .dt-att button{font:inherit;font-size:12px;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);border-radius:7px;padding:3px 10px;cursor:pointer}" +
  "#dt-help .dt-att button:hover{background:rgba(255,255,255,.18)}#dt-help .dt-att button:focus-visible{outline:2px solid #9cc8ff;outline-offset:2px}" +
  "#dt-help .dt-att .dt-att-note{margin:4px 0 0;color:#888;font-size:11.5px}#dt-help .dt-att .dt-att-err{color:#fca5a5}" +
  "#dt-help .dt-att .dt-att-d{display:block;color:#d4d4d4;font-size:12px;overflow-wrap:anywhere}#dt-help .dt-att .dt-att-w{display:block;color:#fcd34d;font-size:11.5px}"
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

// 押したときにフォーカスをこの文書の舞台（tabindex=-1、枠は出さない）に置く。道具の面と操作の帯は pointerdown を止めるので、ブラウザは
// フォーカスを動かさない：そのままでは、編集アプリの枠や欄にあったフォーカスが残り、押した後のキーがスライドに届かない（ふつうのクリックと同じにする）
// この文書にフォーカスがあり、本体（body）か帯のボタンにあるなら動かさない（キーはもう本体に届く）
function focusDeck(){
  var st = document.getElementById("stage"), a = document.activeElement;
  if (document.hasFocus() && (!a || a === document.body || a === document.documentElement || a === st || (cb && cb.contains(a)))) return;
  try { window.focus(); } catch (e) {}
  if (st){
    if (!st.hasAttribute("tabindex")) st.tabIndex = -1;
    try { st.focus({preventScroll: true}); } catch (e) {}
  }
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
  // 描くために既定の動き（選択・フォーカスの移動）は止めるが、フォーカスはこの文書の舞台に置く（編集アプリの枠などにフォーカスがあっても、
  // 押した後のキーがスライドに届くように）
  layer.addEventListener("pointerdown", function(e){ e.preventDefault(); focusDeck(); if (e.button > 0) return; layer.setPointerCapture(e.pointerId); input("down", pt(e)); });
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
  if (!FOLLOW){ buildBar(); loadAttachments(); }
}

// ---------------------------------------------------------------- 添付（format spec §3.8）：ダウンロードだけ
// 1 ファイル（.ega.html）の索引（DECK.FORMAT.indexId。data-sha256 を確かめる）の attachments を読み、キーの一覧（?）の下と帯のボタンに出す。
// 出すのは §3.8 の役割と型に合うものだけ（attType）。ダウンロードは塊を復号し、大きさと sha256 と先頭の印（attContentOk）を確かめてから、中身によらない型（application/octet-stream）の Blob を <a download> で渡す：
// このページでも新しいタブでも開かない（HTML・SVG・PDF も描かない・実行しない）。再生専用の派生と組んだ HTML には索引がないので出ない
var FMT = DECK.FORMAT || null, ATT = [];
function roleName(r){ return (JA ? {source: "元の原稿", pdf: "PDF", code: "コード", data: "データ", supplement: "補足資料"} : {source: "Source", pdf: "PDF", code: "Code", data: "Data", supplement: "Supplement"})[r] || r; }
var HAS = function(o, k){ return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); };
function hexOf(buf){ var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? "0" : "") + u[i].toString(16); return s; }
function esc(t){ return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// 保存する名前は path の最後の部分そのもの（§3.8）。OS が受けない字・末尾の点や空白のある名前は、替えずに一覧から外す（attNameOk）
function attName(p){ return String(p).split("/").pop(); }
function attNameOk(n){ return !!n && !/[\u0000-\u001f\u007f-\u009f\\:*?"<>|]/.test(n) && !/^\s|[. \s]$/.test(n); }
// 題・説明（§3.8・Schema）：字（符号位置）の数が上限まで・改行なし。題は空白だけでない
function attChars(s){ var n = 0; for (var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length){ var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) i++; } n++; } return n; }
function attText(s, max){ return typeof s === "string" && attChars(s) <= max && !/[\r\n]/.test(s); }
// §3.8 の型（DECK.FORMAT.attachTypes。kit/core/attach-content.mjs の runtimeAttachTypes）：役割が受ける拡張子（code は決まった名前も）で、
// 塊の媒体型がその型のものだけを出す。ほかの型（実行できるもの・HTML・SVG・入れ物など）は、索引に書いてあっても出さない
function attType(path, role, mime){
  var T = FMT.attachTypes;
  if (!T || !T.roles || typeof T.roles[role] !== "string") return null;
  var name = attName(path).toLowerCase(), m = name.match(/\.([^.]+)$/), ext = m ? m[1] : "";
  if (/\.ega(?:\.html?)?$/.test(name)) return null;
  var byName = role === "code" && (" " + T.names + " ").indexOf(" " + name + " ") >= 0;
  if (!byName && (!ext || (" " + T.roles[role] + " ").indexOf(" " + ext + " ") < 0)) return null;
  var want = byName ? (ext === "json" ? T.mime.json : T.text) : (HAS(T.mime, ext) ? T.mime[ext] : T.text);
  return mime === want ? want : null;
}
// 保存する前に、中身の先頭がその型か（PDF・PNG・JPEG・WebP・ZIP の印。文字のファイルは NUL がなく、HTML・SVG で始まらない）
function attContentOk(type, u){
  var asc = function(i, n){ var t = ""; for (var j = i; j < i + n && j < u.length; j++) t += String.fromCharCode(u[j]); return t; };
  if (type === "application/pdf") return asc(0, 5) === "%PDF-";
  if (type === "image/png") return asc(0, 8) === "\x89PNG\r\n\x1a\n";
  if (type === "image/jpeg") return u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
  if (type === "image/webp") return asc(0, 4) === "RIFF" && asc(8, 4) === "WEBP";
  if (/officedocument/.test(type)) return asc(0, 4) === "PK\x03\x04";
  var bom16 = (u[0] === 0xff && u[1] === 0xfe) || (u[0] === 0xfe && u[1] === 0xff);
  if (!bom16) for (var k = 0; k < u.length; k++) if (u[k] === 0) return false;
  var head = asc(0, 2048).replace(/^\xef\xbb\xbf/, "").replace(/^\s+/, "").toLowerCase();
  return !/^(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<iframe[\s>]|<svg[\s>]|<\?xml[^>]*>\s*<(?:svg|html|!doctype)[\s>])/.test(head);
}
function attSize(n){ return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
function loadAttachments(){
  if (!FMT || !FMT.indexId || !FMT.attachKey || !window.crypto || !crypto.subtle || typeof TextEncoder === "undefined") return;
  var el = document.getElementById(FMT.indexId);
  if (!el || el.tagName !== "SCRIPT") return;
  var t = el.textContent || "";
  if (t.indexOf('"' + FMT.attachKey + '"') < 0) return;
  var want = (el.getAttribute("data-sha256") || "").trim();
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function(d){
    if (hexOf(d) !== want) return;   // 索引が壊れている：何も出さない
    var ix; try { ix = JSON.parse(t); } catch (e) { return; }
    var list = HAS(ix, FMT.attachKey) ? ix[FMT.attachKey] : null, files = HAS(ix, "files") ? ix.files : null, blobs = HAS(ix, "blobs") ? ix.blobs : null;
    if (!Array.isArray(list) || !files || !blobs) return;
    var pre = FMT.attachDir + "/", seen = Object.create(null);
    list.forEach(function(e){
      if (!e || typeof e.path !== "string" || e.path.indexOf(pre) !== 0 || FMT.attachRoles.indexOf(e.role) < 0 || seen[e.path]) return;
      if (e.path.split("/").some(function(x){ return x === "" || x === "." || x === ".." || x === "__proto__"; })) return;
      if (!HAS(files, e.path) || typeof files[e.path] !== "string" || !HAS(blobs, files[e.path])) return;
      var id = files[e.path], b = blobs[id];
      if (!b || !Array.isArray(b.chunks) || !b.chunks.length || typeof b.sha256 !== "string" || typeof b.bytes !== "number") return;
      if (!b.chunks.every(function(c, j){ return c === FMT.blobPrefix + id + "-" + j; })) return;
      if (!attText(e.title, FMT.attachTypes.titleChars || 120) || !e.title.trim()) return;   // 題は要る（§3.8。120 字まで・1 行）
      if (!attNameOk(attName(e.path))) return;
      var type = attType(e.path, e.role, b.mime);
      if (!type) return;
      seen[e.path] = 1;
      var desc = attText(e.description, FMT.attachTypes.descriptionChars || 300) ? e.description.trim() : "";   // 正しくない説明は出さない
      ATT.push({path: e.path, role: e.role, title: e.title, description: desc || null, type: type, bytes: b.bytes, sha256: b.sha256, chunks: b.chunks.slice()});
    });
    if (ATT.length) addAttachButton();
  }).catch(function(){});
}
function addAttachButton(){
  if (!cb || cb.querySelector('[data-b="attach"]')) return;
  var lab = (JA ? "添付ファイル（" : "Attachments (") + ATT.length + (JA ? "）" : ")");
  var e = document.createElement("button"); e.type = "button"; e.setAttribute("data-b", "attach");
  e.title = lab; e.setAttribute("aria-label", lab);
  e.innerHTML = ICON.attach + "<kbd>" + ATT.length + "</kbd>";
  e._act = function(){ toggleHelp(true); var f = helpBox && helpBox.querySelector("[data-att]"); if (f) f.focus({preventScroll: false}); };
  var h = cb.querySelector('[data-b="help"]');
  cb.insertBefore(e, h);
  DECK.attachments = ATT.map(function(a){ return {path: a.path, role: a.role, title: a.title, description: a.description, bytes: a.bytes}; });
  document.dispatchEvent(new CustomEvent("deck:attachments", {detail: {n: ATT.length}}));
}
// 合成した声・作り方の記録がない音声の段階があれば、教材の情報として 1 行ずつ（format spec §7.3。文は DECK.VOICE_NOTE）
function aiHtml(){
  var out = "", N = DECK.VOICE_NOTE || {};
  if (DECK.hasAiVoice && DECK.hasAiVoice() && N.tts) out += '<p class="dt-ai">' + esc(N.tts) + "</p>";
  if (DECK.hasUnknownVoice && DECK.hasUnknownVoice() && N.imported) out += '<p class="dt-ai">' + esc(N.imported) + "</p>";
  return out;
}
// 操作の帯の小さな札「AI 音声」：どこかの段階が合成した声（kind: tts）のときだけ。索引から遅れて分かったとき（deck:aiaudio）にも足す
function addAiBadge(){
  if (!cb || cb.querySelector(".dt-aib") || !(DECK.hasAiVoice && DECK.hasAiVoice())) return;
  var t = (DECK.VOICE_NOTE && DECK.VOICE_NOTE.tts) || "";
  var e = document.createElement("span"); e.className = "dt-aib";
  e.setAttribute("role", "img"); e.title = t; e.setAttribute("aria-label", t);
  e.textContent = JA ? "AI 音声" : "AI voice";
  var s = document.createElement("i"); s.className = "sep"; s.setAttribute("aria-hidden", "true");
  cb.appendChild(s); cb.appendChild(e);
}
function attHtml(){
  if (!ATT.length) return "";
  var rows = ATT.map(function(a, i){
    var n = attName(a.path);
    // コード：信頼できる出どころのものだけを動かすよう添える（§3.8 の SHOULD）
    var warn = a.role === "code" ? '<span class="dt-att-w">' + (JA ? "出どころを信頼できるときだけ、コードを実行してください" : "Run code only if you trust its source") + '</span>' : '';
    return '<li><span class="dt-att-n"><span class="dt-att-t">' + esc(a.title || n) + '</span>' + (a.description ? '<span class="dt-att-d">' + esc(a.description) + '</span>' : '') + '<span class="dt-att-m">' + esc((a.title ? n + " · " : "") + roleName(a.role) + " · " + attSize(a.bytes)) +
      '</span>' + warn + '</span><button type="button" data-att="' + i + '">' + (JA ? "ダウンロード" : "Download") + "</button></li>";
  }).join("");
  return '<div class="dt-att"><h3>' + (JA ? "添付ファイル" : "Attachments") + "</h3><ul>" + rows + '</ul><p class="dt-att-note" aria-live="polite">' +
    (JA ? "保存するだけで、このページでは開きません" : "Saved as files only; nothing is opened in this page") + "</p></div>";
}
// 塊を復号して確かめ、Blob（application/octet-stream）を <a download> で保存させる。何も開かない・実行しない
function downloadAttachment(i, btn){
  var a = ATT[i], note = helpBox && helpBox.querySelector(".dt-att-note");
  var fail = function(){ if (note){ note.textContent = (JA ? "壊れているので保存できません：" : "Corrupt, not saved: ") + attName(a.path); note.classList.add("dt-att-err"); } };
  if (!a) return;
  var parts = [], n = 0;
  for (var j = 0; j < a.chunks.length; j++){
    var el = document.getElementById(a.chunks[j]);
    if (!el || el.tagName !== "SCRIPT" || (el.getAttribute("type") || "").toLowerCase() !== "application/octet-stream") return fail();
    var bin; try { bin = atob((el.textContent || "").trim()); } catch (e) { return fail(); }
    var u = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    parts.push(u); n += u.length;
    if (n > a.bytes) return fail();
  }
  if (n !== a.bytes) return fail();
  var all = new Uint8Array(n), o = 0;
  parts.forEach(function(x){ all.set(x, o); o += x.length; });
  crypto.subtle.digest("SHA-256", all).then(function(d){
    if (hexOf(d) !== a.sha256) return fail();
    if (!attContentOk(a.type, all)){ if (note){ note.textContent = (JA ? "中身が形式と合わないので保存しません：" : "Not saved, the content does not match its type: ") + attName(a.path); note.classList.add("dt-att-err"); } return; }
    var url = URL.createObjectURL(new Blob([all], {type: "application/octet-stream"}));
    var l = document.createElement("a");
    l.href = url; l.download = attName(a.path); l.rel = "noopener"; l.style.display = "none"; l.__egaOwn = true;
    document.body.appendChild(l); l.click(); l.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
    if (note){ note.classList.remove("dt-att-err"); note.textContent = (JA ? "保存しました：" : "Saved: ") + attName(a.path); }
  }, fail);
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

// ---------------------------------------------------------------- 読み上げで聞く（端末の声。format spec §5.6、backlog #89）
// 音声のないステップだけを、見る人が押したときだけ、端末の中の声（localService）で読む（kit/core/read-aloud.mjs。build が DECK.ReadAloud にする）。
// 音声ファイルにはならない：何も書かず、タイムラインも (i, k, t) の描画も変えない（この道具は動画では作らない。札は印刷に出さない）。
// 音声のあるステップは、そのまま音声を使う（自動再生 a）。次のステップに進む・戻る・Esc・もう一度押すと止める。読んでいる間は札「読み上げ中（この端末の声）」
var RA = (function(){
  var M = DECK.ReadAloud, S = null, U = null;
  try { S = window.speechSynthesis || null; U = window.SpeechSynthesisUtterance || null; } catch (e) {}
  if (!M || !S || typeof U !== "function" || FOLLOW) return null;
  // 読めるステップ（口述原稿があり、音声がない）が 1 つもなければ出さない
  var any = false;
  for (var sk in DECK.NARRATION) for (var st in DECK.NARRATION[sk]) if (!DECK.AUDIO[sk + ":" + st] && (DECK.NARRATION[sk][st] || []).length) any = true;
  if (!any) return null;
  return {M: M, reader: M.createReader({synth: S, Utterance: U}), synth: S, key: null, el: null};
})();
var RA_T = DECK.ja !== false
  ? {btn: "読み上げで聞く（音声ファイルにはなりません）", stop: "読み上げを止める", on: "読み上げ中（この端末の声）", esc: "Esc で止める",
     audio: "このステップには音声があります（自動再生 a で流れます）", none: "このステップには台本がありません", voice: "この端末には、この言語の読み上げの声がありません"}
  : {btn: "Listen with read-aloud (not saved as audio)", stop: "Stop read-aloud", on: "Reading aloud (this device's voice)", esc: "Esc to stop",
     audio: "This step has audio (autoplay a plays it)", none: "This step has no script", voice: "This device has no read-aloud voice for this language"};
function deckLang(){ return document.documentElement.lang || (DECK.ja !== false ? "ja" : "en"); }
function raTurns(key){
  var p = key.lastIndexOf(":"), sk = key.slice(0, p), st = key.slice(p + 1);
  var n = DECK.NARRATION[sk];
  return (n && n[st]) || [];
}
// 今のステップで読めないわけ（なければ null）
function raWhy(key){
  if (DECK.AUDIO[key]) return RA_T.audio;
  return RA.M.spokenTurns(raTurns(key), {lang: deckLang(), normalize: DECK.TtsNormalize && DECK.TtsNormalize.normalizeTtsText}).length ? null : RA_T.none;
}
function raShow(on){
  if (!RA) return;
  if (!RA.el){
    RA.el = document.createElement("div"); RA.el.id = "dt-ra"; RA.el.className = "deck-tools";
    RA.el.setAttribute("role", "status"); RA.el.setAttribute("aria-live", "polite");
    document.body.appendChild(RA.el);
  }
  RA.el.innerHTML = on ? ICON.read + "<span>" + RA_T.on + "</span><small>" + RA_T.esc + "</small>" : "";
  RA.el.classList.toggle("on", !!on);
  syncBar();
}
function raStop(){
  if (!RA) return false;
  var was = RA.key !== null;
  RA.key = null;
  RA.reader.cancel();
  if (was) raShow(false);
  return was;
}
function raStart(){
  if (!RA) return;
  if (RA.key !== null){ raStop(); return; }   // 読んでいる間にもう一度押すと止める
  var key = DECK.state().key, why = raWhy(key);
  if (why){ if (DECK.toast) DECK.toast(why); return; }
  if (document.documentElement.classList.contains("autoplay")) DECK.autoplay(false);
  var lang = deckLang();
  var turns = RA.M.spokenTurns(raTurns(key), {lang: lang, normalize: DECK.TtsNormalize && DECK.TtsNormalize.normalizeTtsText});
  RA.M.whenVoices(RA.synth, 1500).then(function(){
    if (DECK.state().key !== key) return;    // 待つ間に動いた
    var r = RA.reader.speak(turns, lang, {onend: function(){ if (RA.key === key){ RA.key = null; raShow(false); } }});
    if (!r.ok){ if (DECK.toast) DECK.toast(r.reason === "no-voice" ? RA_T.voice : RA_T.none); return; }
    RA.key = key;
    raShow(true);
  });
}
function raSync(b){
  if (!RA || !b) return;
  var why = raWhy(DECK.state().key), on = RA.key !== null;
  if (why && !on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
  var lab = on ? RA_T.stop : why || RA_T.btn;
  b.title = lab; b.setAttribute("aria-label", on ? RA_T.stop : RA_T.btn);
  if (why && !on) b.setAttribute("aria-description", why); else b.removeAttribute("aria-description");
}
if (RA){
  // 次のステップ・前のステップへ動いたら止める（同じステップのままの知らせでは止めない）
  document.addEventListener("deck:pos", function(e){ if (RA.key !== null && e.detail && e.detail.key !== RA.key) raStop(); });
  window.addEventListener("pagehide", raStop);
}

// ---------------------------------------------------------------- 操作の帯とキーの一覧（?）
// ボタンはキーを押したのと同じにする（deck.js のキーも、この道具のキーも、同じ経路を通る）
function press(k, shift){ document.dispatchEvent(new KeyboardEvent("keydown", {key: k, shiftKey: !!shift, bubbles: true, cancelable: true})); }
var JA = DECK.ja !== false;
var TIP = JA
  ? {prev: "前へ", next: "次へ", auto: "自動再生", laser: "レーザー", pen: "ペン", vpen: "消えるペン", clear: "書き込みを消す", over: "スライド一覧",
     lect: "授業モード", cap: "字幕", read: "読み上げで聞く（音声ファイルにはなりません）", pres: "発表者ビュー", full: "全画面", help: "キーの一覧"}
  : {prev: "Previous", next: "Next", auto: "Autoplay", laser: "Laser", pen: "Pen", vpen: "Fading pen", clear: "Clear ink", over: "Slide overview",
     lect: "Lecture mode", cap: "Captions", read: "Listen with read-aloud (not saved as audio)", pres: "Presenter view", full: "Fullscreen", help: "Keyboard shortcuts"};
// [名前, 表示するキー, 押すキー（関数なら直接呼ぶ）]。null は区切り
var BTNS = [["prev", "←", "ArrowLeft"], ["next", "→", "ArrowRight"], ["auto", "a", "a"], null,
  ["laser", "x", "x"], ["pen", "d", "d"], ["vpen", "v", "v"], ["clear", "⌫", function(){ clear(false); }], null,
  ["over", "o", "o"], ["lect", "l", "l"], ["cap", "s", "s"], ["read", "", function(){ raStart(); }], ["pres", "p", "p"], ["full", "f", "f"], null, ["help", "?", "?"]];
// 押すと入／切が変わるボタン（aria-pressed を付ける）
var TOGGLES = ["auto", "laser", "pen", "vpen", "lect", "cap", "read", "full", "help"];
function kk(k){ return JA ? "（" + k + "）" : " (" + k + ")"; }
var cb = null, hideT = 0, helpBox = null, OVER_ZONE = 140, SHOW_MS = 2500;

function buildBar(){
  cb = document.createElement("div"); cb.id = "dt-cb"; cb.className = "deck-tools";
  cb.setAttribute("role", "toolbar");
  cb.setAttribute("aria-label", JA ? "スライドの操作" : "Slide controls");
  BTNS.forEach(function(b){
    if (!b){ var s = document.createElement("i"); s.className = "sep"; s.setAttribute("aria-hidden", "true"); cb.appendChild(s); return; }
    if (b[0] === "read" && !RA) return;   // 読み上げ：端末で読めないとき・読めるステップがないときは出さない
    var e = document.createElement("button"); e.type = "button";
    e.setAttribute("data-b", b[0]);
    e.title = TIP[b[0]] + (b[1] ? kk(b[1]) : "");
    e.setAttribute("aria-label", TIP[b[0]]);
    if (b[1]) e.setAttribute("aria-keyshortcuts", {"←": "ArrowLeft", "→": "ArrowRight", "⌫": "Backspace", "?": "Shift+?"}[b[1]] || b[1]);
    if (TOGGLES.indexOf(b[0]) >= 0) e.setAttribute("aria-pressed", "false");
    e.innerHTML = (ICON[b[0]] || ICON.play) + (b[1] ? "<kbd>" + b[1] + "</kbd>" : "") + (b[0] === "pen" || b[0] === "vpen" ? '<i class="dt-dot" aria-hidden="true"></i>' : "");
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
  addAiBadge();
  document.addEventListener("deck:aiaudio", addAiBadge);
  // 押してもフォーカスを奪わず（矢印キーがそのまま効く）、下の舞台にも届かない（ペンで描かない・クリックで送らない）
  ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick"].forEach(function(t){
    cb.addEventListener(t, function(e){ e.preventDefault(); e.stopPropagation(); if (t === "pointerdown") focusDeck(); });
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
  document.addEventListener("deck:captions", function(){ syncBar(); liftCaptions(); });
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
  liftCaptions();
}
// 帯が出ていて字幕の下端に重なるなら、重なる分（＋6px）だけ字幕を上げる。帯が余白にあるとき・隠れたときは 0（上げた分は戻る）
function liftCaptions(){
  var cap = document.getElementById("deck-cap"), lift = 0;
  if (cb && cb.classList.contains("show") && cap && !cap.hidden){
    var k = Math.min(innerWidth / W, innerHeight / H), m = (innerHeight - H * k) / 2;
    var need = (parseFloat(cb.style.bottom) || 0) + cb.offsetHeight + 6 - (m + (parseFloat(getComputedStyle(cap).bottom) || 0) * k);
    if (need > 0) lift = Math.ceil(need / k);
  }
  var de = document.documentElement;
  if (lift) de.style.setProperty("--dt-cb-lift", lift + "px");
  de.classList.toggle("dt-cb-lift", lift > 0);
}
function wake(e){
  if (!cb) return;
  // 舞台に重ねるときは、下のほうにマウスが来たときだけ出す（レーザーやペンの邪魔をしない）
  if (e && cb._over && e.clientY < innerHeight - OVER_ZONE && !cb.classList.contains("show")) return;
  cb.classList.add("show");
  liftCaptions();
  clearTimeout(hideT);
  hideT = setTimeout(function hide(){
    if (cb.matches(":hover") || cb.contains(document.activeElement)){ hideT = setTimeout(hide, 800); return; }
    cb.classList.remove("show");
    liftCaptions();
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
  if (RA) raSync(on("read", RA.key !== null));
  var playing = document.documentElement.classList.contains("autoplay"), a = on("auto", playing);
  if (a && a._p !== playing){
    a._p = playing;
    a.innerHTML = (playing ? ICON.stop : ICON.play) + "<kbd>a</kbd>";
    a.title = (playing ? (JA ? "自動再生を止める" : "Stop autoplay") : TIP.auto) + kk("a");
    a.setAttribute("aria-label", playing ? (JA ? "自動再生を止める" : "Stop autoplay") : TIP.auto);
  }
}

// 開発サーバー・編集アプリのプレビューか（そこに入る server/hints.js が DECK_DEV を立てる）。そうなら e / n / c も一覧に載せる
function isDev(){ return !!window.DECK_DEV; }
function helpHtml(){
  var K = function(){ return [].map.call(arguments, function(k){ return "<kbd>" + k + "</kbd>"; }).join(""); };
  var row = function(k, t){ return '<div class="dt-row"><span>' + k + "</span><span>" + t + "</span></div>"; };
  var sec = function(h, rows){ return '<div class="dt-sec"><h3>' + h + "</h3>" + rows.join("") + "</div>"; };
  var j = JA, cols = [
    sec(j ? "移動" : "Navigate", [
      row(K("→", "Space"), j ? "次の段階" : "Next step"), row(K("←"), j ? "前の段階" : "Previous step"),
      row(K("Shift") + "+" + K("←", "→"), j ? "スライド単位" : "By slide"), row(K("Home", "End"), j ? "最初 / 最後" : "First / last"),
      row(K("12") + " " + K("Enter"), j ? "そのページへ" : "Go to slide"), row(K("o"), j ? "スライド一覧" : "Overview"),
      row(K("Backspace") + " / " + K("Alt") + "+" + K("←"), j ? "リンクの前に戻る" : "Back (after a link)")]),
    sec(j ? "表示" : "View", [
      row(K("a"), j ? "自動再生" : "Autoplay"), row(K("l"), j ? "授業モード" : "Lecture mode"), row(K("s"), j ? "字幕" : "Captions"),
      row(K("Shift") + "+" + K("s"), j ? "字幕の大きさ（S / M / L）" : "Caption size (S / M / L)"),
      row(K("b"), j ? "暗転" : "Blackout"), row(K("f"), j ? "全画面" : "Fullscreen"), row(K("p"), j ? "発表者ビュー" : "Presenter view"),
      row(K("?"), j ? "このキーの一覧" : "This help")]),
    sec(j ? "道具" : "Tools", [
      row(K("x"), j ? "レーザー" : "Laser"), row(K("d"), j ? "ペン" : "Pen"), row(K("v"), j ? "消えるペン" : "Fading pen"),
      row(K("Shift") + "+" + K("d"), j ? "ペンの色" : "Pen color"), row(K("Backspace"), j ? "ペンのとき：書き込みを消す（Shift で全部）" : "With a pen: clear ink (Shift: all slides)"),
      row(K("Esc"), j ? "道具を解除" : "Exit tool")])
  ];
  if (isDev()) cols.push(sec(j ? "開発サーバー" : "Dev server", [
    row(K("e"), j ? "編集モード" : "Edit mode"), row(K("n"), j ? "口述原稿" : "Narration"), row(K("c"), j ? "コメントの一覧" : "Comments"),
    row(K(/mac|iphone|ipad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent) ? "⌥ option" : "Alt") + "+" + (j ? "クリック" : "click"), j ? "AI へのメモ" : "Note for the AI")]));
  // フィードバック：版・ブラウザ・言語・モードだけを入れた issue form を開く（デッキの中身は送らない）
  var fb = DECK.feedbackUrl && DECK.feedbackUrl();
  var fbHtml = fb ? '<div class="dt-fb"><a href="' + fb.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' +
    (j ? "フィードバックを送る" : "Send feedback") + "</a>" +
    (DECK.VERSION ? '<span class="dt-ver">v' + DECK.VERSION + "</span>" : "") + "</div>" : "";
  return '<div class="dt-card"><div class="dt-cols">' + cols.join("") + '</div><div class="dt-foot">' +
    (j ? "下の帯のボタンでも同じ操作ができます · ? / Esc で閉じる" : "The buttons in the bottom bar do the same · ? / Esc to close") + "</div>" +
    // 発表者ビューから抜けられないとき（窓が前に出たまま・全画面のまま）の逃げ道
    '<div class="dt-foot dt-pres-tip">' + (j ? "発表者ビューから抜けられないとき：Mac は cmd+Tab で本体の窓に戻って p（Windows は Alt+Tab）"
      : "Stuck in the presenter view? On a Mac, press cmd+Tab to get back to the main window, then p (on Windows, Alt+Tab)") + "</div>" + aiHtml() + attHtml() + fbHtml + "</div>";
}
function toggleHelp(on){
  if (!helpBox){
    helpBox = document.createElement("div"); helpBox.id = "dt-help"; helpBox.className = "deck-tools";
    helpBox.setAttribute("role", "dialog"); helpBox.setAttribute("aria-modal", "true"); helpBox.setAttribute("aria-label", TIP.help);
    helpBox.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
    helpBox.addEventListener("click", function(e){
      e.stopPropagation(); if (e.target === helpBox) toggleHelp(false);
      var d = e.target.closest && e.target.closest("[data-att]");
      if (d){ e.preventDefault(); downloadAttachment(+d.getAttribute("data-att"), d); }
    });
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
    if (!typing(e.target)) window.parent.postMessage({type: "deck-tool-key", key: e.key, shift: e.shiftKey, alt: e.altKey, mod: e.metaKey || e.ctrlKey}, "*");
    return;
  }
  if (!layer || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  // 暗転の間（kit/deck.js の b）：道具のキーは使わない（b・Esc・クリックで戻すのは deck.js）
  if (document.documentElement.classList.contains("blackout")) return;
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
  else if (k === "Escape" && RA && RA.key !== null) raStop();
  else if (k === "Escape" && mode) setMode(null);
  else if (k === "Escape" && cb && cb.contains(document.activeElement)) document.activeElement.blur();   // 帯から本体に戻る
  else if (k === "Backspace" && (mode === "pen" || mode === "vpen")) clear(e.shiftKey);
  else done = false;
  if (done){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

if (DECK.ready) build(); else document.addEventListener("deck:ready", build);
DECK.tools = {mode: function(){ return mode; }, setMode: setMode, clear: clear, help: function(on){ toggleHelp(on); },
  color: function(c){ if (c === undefined) return color; setColor(c); },
  overview: function(on){ if (on === false) closeOverview(); else if (!ov) openOverview(); },
  readAloud: function(on){ if (on === undefined) return !!(RA && RA.key !== null); if (on) { if (!RA || RA.key === null) raStart(); } else raStop(); }};
})();
