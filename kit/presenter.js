// 発表者ビュー（presenter.js）。本体で p を押すと、同じ HTML を ?presenter=1 で開く
// 左：今の画面、右上：次の段階、右下：口述原稿（カンペ）、上：位置・経過時間・時刻
// 本体とは postMessage でやり取りする（file:// でも動く）
// ボタンは Tab で選べ（枠は :focus-visible のときだけ）、名前（aria-label）と、道具は入／切（aria-pressed）を持つ
(function(){
"use strict";
var DECK = window.DECK;
// 画面の言葉（<html lang> が ja 以外なら英語。deck.js の DECK.ja）
var L = DECK.ja === false
  ? {cur: "Current slide", nextFrame: "Next step preview", auto: "Autoplay", stop: "Stop", autoKey: "Autoplay (a)", reset: "Reset timer", next: "Next", notes: "Speaker notes", slide: "Slide ", step: "Step ", none: "(no notes)", nextStep: "Next step",
     laser: "Laser (x)", pen: "Pen (d)", vpen: "Fading pen (v)", clear: "Clear ink", over: "Overview on the main window (o)", lect: "Lecture mode (l)",
     feedback: "Send feedback", legend: [["→/Space", "next"], ["←", "prev"], ["a", "autoplay"], ["x", "laser"], ["d", "pen"], ["v", "fading pen"], ["o", "overview"], ["Esc", "exit tool"]]}
  : {cur: "今の画面", nextFrame: "次の段階の画面", auto: "自動再生", stop: "停止", autoKey: "自動再生（a）", reset: "経過時間を戻す", next: "次", notes: "口述原稿", slide: "スライド ", step: "段階 ", none: "（口述原稿なし）", nextStep: "次の段階",
     laser: "レーザー（x）", pen: "ペン（d）", vpen: "消えるペン（v）", clear: "書き込みを消す", over: "本体でスライド一覧（o）", lect: "授業モード（l）",
     feedback: "フィードバックを送る", legend: [["→/Space", "次"], ["←", "前"], ["a", "自動再生"], ["x", "レーザー"], ["d", "ペン"], ["v", "消えるペン"], ["o", "一覧"], ["Esc", "解除"]]};
// 道具のボタン：[絵の名前, キー（DECK.ptools.key に渡す）, 表示するキー]
var TOOLS = [["laser", "x", "x"], ["pen", "d", "d"], ["vpen", "v", "v"], ["clear", "clear", "⌫"], ["over", "o", "o"], ["lect", "l", "l"]];
DECK.presenterView = function(){
  var opener = window.opener;
  document.documentElement.classList.add("presenter");
  var base = location.href.replace(/[?#].*$/, "");
  var q = location.search.replace(/[?&]presenter=1/, "").replace(/^&/, "?");
  var sep = q ? "&" : "?";
  var PT = DECK.ptools, ic = (PT && PT.icons) || {};
  var tools = PT ? '<span class="pv-tools">' + TOOLS.map(function(t){
    var name = L[t[0]].replace(/\s*[（(][^）)]*[）)]$/, "");
    return '<button type="button" data-k="' + t[1] + '" data-b="' + t[0] + '" title="' + L[t[0]] + '" aria-label="' + name + '"' +
      (/^(laser|pen|vpen)$/.test(t[0]) ? ' aria-pressed="false"' : "") + ">" + (ic[t[0]] || t[0]) + '<kbd aria-hidden="true">' + t[2] + "</kbd></button>";
  }).join("") + "</span>" : "";
  var legend = L.legend.map(function(x){ return "<span><kbd>" + x[0] + "</kbd> " + x[1] + "</span>"; }).join("");
  // 凡例の行の右端にフィードバックのリンク（版・ブラウザ・言語・モードだけ。デッキの中身は送らない）
  var fb = DECK.feedbackUrl && DECK.feedbackUrl();
  if (fb) legend += '<a id="pv-fb" href="' + fb.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' + L.feedback +
    (DECK.VERSION ? " · v" + DECK.VERSION : "") + "</a>";
  document.body.innerHTML =
    '<div id="pv">' +
    ' <header><span id="pv-pos"></span><span id="pv-step"></span><span class="sp"></span>' +
    '  <button type="button" id="pv-auto" title="' + L.autoKey + '" aria-pressed="false">▶ ' + L.auto + '</button>' + tools +
    '<button type="button" id="pv-reset" title="' + L.reset + '" aria-label="' + L.reset + '">⟲</button>' +
    '  <span id="pv-timer" role="timer">00:00</span><span id="pv-clock"></span></header>' +
    ' <main><div id="pv-cur"><iframe id="f-cur" title="' + L.cur + '"></iframe></div>' +
    '  <aside><div id="pv-next"><div class="lab">' + L.next + '</div><iframe id="f-next" title="' + L.nextFrame + '" tabindex="-1"></iframe></div>' +
    '   <div id="pv-notes"><div class="lab">' + L.notes + '</div><div id="pv-text"></div></div></aside></main>' +
    ' <footer id="pv-keys">' + legend + '</footer>' +
    '</div>';
  var st = document.createElement("style");
  st.textContent =
    "html.presenter,html.presenter body{background:#1b1b1b;color:#eee;overflow:hidden;height:100%;margin:0}" +
    "#pv{display:flex;flex-direction:column;height:100vh;font:16px/1.5 var(--font-sans,sans-serif)}" +
    "#pv header{display:flex;gap:18px;align-items:center;padding:8px 16px;background:#111;font-size:18px}" +
    "#pv header .sp{flex:1}#pv-timer{font-size:28px;font-variant-numeric:tabular-nums}#pv-clock{color:#aaa;font-variant-numeric:tabular-nums}" +
    "#pv button{background:#333;color:#eee;border:1px solid #555;border-radius:6px;padding:4px 12px;font-size:15px;cursor:pointer}" +
    "#pv button:focus{outline:none}#pv button:focus-visible{outline:2px solid #9cf;outline-offset:2px}" +
    "#pv main{flex:1;display:flex;gap:14px;padding:14px;min-height:0}" +
    "#pv-cur{flex:0 0 62%;display:flex;align-items:center}#pv-cur iframe{width:100%;aspect-ratio:16/9;border:0;background:#000}" +
    "#pv aside{flex:1;display:flex;flex-direction:column;gap:12px;min-width:0}" +
    "#pv-next iframe{width:100%;aspect-ratio:16/9;border:0;background:#000;opacity:.85}" +
    "#pv .lab{font-size:13px;color:#999;margin-bottom:4px}" +
    "#pv-notes{flex:1;overflow:auto;background:#262626;border-radius:8px;padding:10px 14px}" +
    "#pv-text p{margin:0 0 10px;font-size:22px;line-height:1.6}#pv-text .role{color:#9cf;font-size:14px;margin-right:6px}" +
    "#pv-text .next{color:#888}#pv-text .next p{font-size:18px}" +
    "#pv header button{height:34px}" +
    "#pv .pv-tools{display:flex;gap:4px}" +
    "#pv .pv-tools button{display:flex;align-items:center;gap:5px;padding:0 9px;user-select:none}" +
    "#pv .pv-tools button:hover{background:#3d3d3d}#pv .pv-tools button.on{background:#e8e8e8;color:#151515;border-color:#e8e8e8}" +
    "#pv .pv-tools svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}" +
    "#pv .pv-tools kbd{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.6}" +
    "#pv-auto.on{background:#e8e8e8;color:#151515;border-color:#e8e8e8}" +
    "#pv-keys{display:flex;flex-wrap:wrap;gap:4px 18px;padding:5px 16px 7px;background:#111;color:#999;font-size:13px}" +
    "#pv-keys #pv-fb{margin-left:auto;color:#8ab4e8;text-decoration:none}#pv-keys #pv-fb:hover{text-decoration:underline}@media print{#pv-fb{display:none}}" +
    "#pv-keys kbd{display:inline-block;padding:0 5px;border:1px solid #444;border-radius:4px;background:#222;color:#ddd;font:600 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}";
  document.head.appendChild(st);
  var fc = document.getElementById("f-cur"), fn = document.getElementById("f-next");
  fc.src = base + q + sep + "view=follow"; fn.src = base + q + sep + "view=next";
  var pos = null, started = Date.now();
  function send(cmd, extra){ if (opener && !opener.closed) opener.postMessage(Object.assign({type: "deck-cmd", cmd: cmd}, extra || {}), "*"); }
  function notes(key){
    var p = key.lastIndexOf(":"), sk = key.slice(0, p), stp = key.slice(p + 1);
    return ((DECK.NARRATION[sk] || {})[stp]) || [];
  }
  function html(turns){
    return turns.map(function(t){ return "<p>" + (t.role === "novice" ? '<span class="role">Novice</span>' : "") + esc(t.text) + "</p>"; }).join("");
  }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]; }); }
  function update(){
    if (!pos) return;
    document.getElementById("pv-pos").textContent = L.slide + (pos.i + 1) + " / " + pos.n;
    var ab = document.getElementById("pv-auto");
    ab.textContent = (pos.auto ? "■ " : "▶ ") + (pos.auto ? L.stop : L.auto); ab.classList.toggle("on", !!pos.auto);
    ab.setAttribute("aria-pressed", pos.auto ? "true" : "false");
    document.getElementById("pv-step").textContent = L.step + pos.k + " / " + pos.max;
    fc.contentWindow && fc.contentWindow.postMessage({type: "deck-goto", i: pos.i, k: pos.k, animate: true}, "*");
    var ni = pos.k < pos.max ? pos.i : pos.i + 1, nk = pos.k < pos.max ? pos.k + 1 : 0;
    fn.contentWindow && fn.contentWindow.postMessage({type: "deck-goto", i: ni, k: nk, animate: false}, "*");
    var cur = notes(pos.key), nxt = pos.nextKey ? notes(pos.nextKey) : [];
    document.getElementById("pv-text").innerHTML = (html(cur) || '<p style="color:#777">' + L.none + '</p>') +
      (nxt.length ? '<div class="next"><div class="lab">' + L.nextStep + '</div>' + html(nxt) + "</div>" : "");
  }
  window.addEventListener("message", function(e){
    var m = e.data || {};
    if (m.type === "deck-pos" && e.source === opener){ pos = m; update(); }
    if (m.type === "deck-pos" && (e.source === fc.contentWindow || e.source === fn.contentWindow) && !pos){ /* iframe の起動 */ }
  });
  fc.addEventListener("load", function(){ setTimeout(update, 300); });
  fn.addEventListener("load", function(){ setTimeout(update, 300); });
  document.addEventListener("keydown", function(e){
    var k = e.key;
    // フォーカスのあるボタンは Enter / Space でそれ自身を押す
    if ((k === " " || k === "Enter") && e.target && e.target.closest && e.target.closest("button, a[href]")) return;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown"){ e.preventDefault(); send("next"); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp"){ e.preventDefault(); send("prev"); }
    else if (k === "a") send("auto");
  });
  // マウスで押したらフォーカスを残さない（キーボードで押したとき、detail = 0、は残す）
  document.getElementById("pv-auto").onclick = function(e){ send("auto"); if (e.detail !== 0) this.blur(); };
  // 道具のボタン：キーと同じ（tools.js の DECK.ptools.key）。フォーカスを奪わないので、押した後も矢印で送れる
  [].forEach.call(document.querySelectorAll("#pv button"), function(b){ b.addEventListener("mousedown", function(e){ e.preventDefault(); }); });
  [].forEach.call(document.querySelectorAll("#pv .pv-tools button"), function(b){
    b.onclick = function(e){ PT.key(b.getAttribute("data-k")); if (e.detail !== 0) b.blur(); };
  });
  function syncTools(){
    var m = PT && PT.mode();
    [].forEach.call(document.querySelectorAll("#pv .pv-tools button"), function(b){
      var on = b.getAttribute("data-b") === m;
      b.classList.toggle("on", on);
      if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.addEventListener("deck:ptool", syncTools);
  document.getElementById("pv-reset").onclick = function(){ started = Date.now(); };
  setInterval(function(){
    var s = Math.floor((Date.now() - started) / 1000);
    document.getElementById("pv-timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    var d = new Date(); document.getElementById("pv-clock").textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }, 500);
  send("hello");
};
})();
