// 発表者ビュー（presenter.js）。本体で p を押すと、同じ HTML を ?presenter=1 で開く
// 左：今の画面、右上：次の段階、右下：口述原稿（カンペ）、上：位置・経過時間・時刻
// 本体とは postMessage でやり取りする（file:// でも動く）
// ボタンは Tab で選べ（枠は :focus-visible のときだけ）、名前（aria-label）と、道具は入／切（aria-pressed）を持つ
(function(){
"use strict";
var DECK = window.DECK;
// 画面の言葉（<html lang> が ja 以外なら英語。deck.js の DECK.ja）
var L = DECK.ja === false
  ? {cur: "Current slide", nextFrame: "Next step preview", auto: "Autoplay", stop: "Stop", autoKey: "Autoplay (a)", reset: "Reset timer", next: "Next", notes: "Script", slide: "Slide ", step: "Step ", none: "(no script)", nextStep: "Next step",
     laser: "Laser pointer (x)", pen: "Pen (d)", color: "Pen color", vpen: "Fading pen (v)", clear: "Clear ink", over: "Overview on the main window (o)", lect: "Show later steps faintly (l)",
     feedback: "Send feedback", back: "Back", close: "Close presenter view (p)", tap: "Click here to control", black: "Black screen", blackT: "The audience screen is black (b, or click it, to return)",
     legend: [["→/Space", "next"], ["←", "prev"], ["a", "autoplay"], ["b", "black screen"], ["x", "laser pointer"], ["d", "pen"], ["v", "fading pen"], ["o", "overview"], ["Esc", "exit tool / close"], ["p", "close"]]}
  : {cur: "今の画面", nextFrame: "次のステップの画面", auto: "自動再生", stop: "停止", autoKey: "自動再生（a）", reset: "経過時間を戻す", next: "次", notes: "台本", slide: "スライド ", step: "ステップ ", none: "（台本なし）", nextStep: "次のステップ",
     laser: "レーザーポインター（x）", pen: "ペン（d）", color: "ペンの色", vpen: "消えるペン（v）", clear: "書き込みを消す", over: "本体でスライド一覧（o）", lect: "先のステップを薄く見せる（l）",
     feedback: "フィードバックを送る", back: "戻る", close: "発表者ビューを閉じる（p）", tap: "ここを押すと操作できます", black: "黒い画面中", blackT: "本体の画面は真っ黒です（b か、本体の画面のクリックで戻る）",
     legend: [["→/Space", "次"], ["←", "前"], ["a", "自動再生"], ["b", "黒い画面"], ["x", "レーザーポインター"], ["d", "ペン"], ["v", "消えるペン"], ["o", "一覧"], ["Esc", "解除・閉じる"], ["p", "閉じる"]]};
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
      (/^(laser|pen|vpen|lect)$/.test(t[0]) ? ' aria-pressed="false"' : "") + ">" + (ic[t[0]] || t[0]) + '<kbd aria-hidden="true">' + t[2] + "</kbd>" +
      (/^(pen|vpen)$/.test(t[0]) ? '<i class="pv-dot" aria-hidden="true"></i>' : "") + "</button>" +
      // 消えるペンの後ろに、ペンの間だけ出る色のボタン（本体と同じ番号を送る）
      (t[0] === "vpen" && PT.colors ? '<span class="pv-sw" role="group" aria-label="' + L.color + '" hidden>' + PT.colors.map(function(c, j){
        return '<button type="button" data-c="' + j + '" title="' + PT.label(j) + '" aria-label="' + PT.label(j) + '" aria-pressed="false"><i aria-hidden="true" style="background:var(--' + c + ')"></i></button>';
      }).join("") + "</span>" : "");
  }).join("") + "</span>" : "";
  var legend = L.legend.map(function(x){ return "<span><kbd>" + x[0] + "</kbd> " + x[1] + "</span>"; }).join("");
  // 凡例の行の右端にフィードバックのリンク（版・ブラウザ・言語・モードだけ。デッキの中身は送らない）
  var fb = DECK.feedbackUrl && DECK.feedbackUrl();
  if (fb) legend += '<a id="pv-fb" href="' + fb.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' + L.feedback +
    (DECK.VERSION ? " · v" + DECK.VERSION : "") + "</a>";
  document.body.innerHTML =
    '<div id="pv">' +
    ' <header><span id="pv-pos"></span><span id="pv-step"></span><span id="pv-black" role="status" title="' + L.blackT + '" hidden>■ ' + L.black + '</span><span class="sp"></span>' +
    '  <button type="button" id="pv-back" aria-label="' + L.back + '" hidden>← ' + L.back + '</button>' +
    '  <button type="button" id="pv-auto" title="' + L.autoKey + '" aria-pressed="false">▶ ' + L.auto + '</button>' + tools +
    '<button type="button" id="pv-reset" title="' + L.reset + '" aria-label="' + L.reset + '">⟲</button>' +
    '  <span id="pv-timer" role="timer">00:00</span><span id="pv-clock"></span>' +
    '  <button type="button" id="pv-close">' + L.close + '</button></header>' +
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
    // 「次」の画面は見るだけ：押しても中にフォーカスを入れない（中のデッキはキーを受けないので、キーが止まってしまう）。押すと発表者ビューに残る
    "#pv-next iframe{width:100%;aspect-ratio:16/9;border:0;background:#000;opacity:.85;pointer-events:none}" +
    "#pv .lab{font-size:13px;color:#999;margin-bottom:4px}" +
    "#pv-notes{flex:1;overflow:auto;background:#262626;border-radius:8px;padding:10px 14px}" +
    "#pv-text .ai{font-size:12px;color:#aaa;margin:0 0 6px}" +
    "#pv-text p{margin:0 0 10px;font-size:22px;line-height:1.6}#pv-text .role{color:#9cf;font-size:14px;margin-right:6px}" +
    "#pv-text .next{color:#888}#pv-text .next p{font-size:18px}" +
    "#pv header button{height:34px}#pv-back{max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pv-back[hidden]{display:none}" +
    "#pv .pv-tools{display:flex;gap:4px}" +
    "#pv .pv-tools button{display:flex;align-items:center;gap:5px;padding:0 9px;user-select:none}" +
    "#pv .pv-tools button:hover{background:#3d3d3d}#pv .pv-tools button.on{background:#e8e8e8;color:#151515;border-color:#e8e8e8}" +
    "#pv .pv-tools svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}" +
    "#pv .pv-tools button{position:relative}#pv .pv-dot{position:absolute;right:3px;top:3px;width:7px;height:7px;border-radius:50%;box-shadow:0 0 0 1.5px #fff}" +
    "#pv .pv-sw{display:flex;gap:3px}#pv .pv-sw[hidden]{display:none}#pv .pv-sw button{padding:0 7px}" +
    "#pv .pv-sw i{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 2px #fff}#pv .pv-sw button[aria-pressed=true]{background:#555;border-color:#ddd}" +
    "#pv .pv-sw button[aria-pressed=true] i{box-shadow:0 0 0 2px #fff}" +
    "#pv .pv-tools kbd{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.6}" +
    "#pv-auto.on{background:#e8e8e8;color:#151515;border-color:#e8e8e8}" +
    // 暗転中（本体の画面が真っ黒）：見落とさないように、地を反転した札
    "#pv-black{padding:2px 12px;border-radius:6px;background:#fff;color:#000;font-weight:700;letter-spacing:.04em;box-shadow:0 0 0 2px #e11d48}#pv-black[hidden]{display:none}" +
    "#pv.pv-black #pv-cur iframe{opacity:.35}" +
    // まだキーを受けられない（窓にフォーカスがない）ときの覆い：最初のクリックを受けてフォーカスを取り、消える
    "#pv-tap{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);color:#fff;font-size:34px;font-weight:700;cursor:pointer;border:0;width:100%;border-radius:0}" +
    "#pv-tap[hidden]{display:none}" +
    "#pv-keys{display:flex;flex-wrap:wrap;gap:4px 18px;padding:5px 16px 7px;background:#111;color:#999;font-size:13px}" +
    "#pv-keys #pv-fb{margin-left:auto;color:#8ab4e8;text-decoration:none}#pv-keys #pv-fb:hover{text-decoration:underline}@media print{#pv-fb{display:none}}" +
    "#pv-keys kbd{display:inline-block;padding:0 5px;border:1px solid #444;border-radius:4px;background:#222;color:#ddd;font:600 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}";
  document.head.appendChild(st);
  var fc = document.getElementById("f-cur"), fn = document.getElementById("f-next");
  fc.src = base + q + sep + "view=follow"; fn.src = base + q + sep + "view=next";
  var pos = null, started = Date.now();
  // 暗転（本体の b）：札を出し、今の画面を薄くする（発表者には中身を見せたまま）
  function setBlack(on){
    on = !!on;
    document.getElementById("pv-black").hidden = !on;
    document.getElementById("pv").classList.toggle("pv-black", on);
  }
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
    syncTools();
    document.getElementById("pv-step").textContent = L.step + pos.k + " / " + pos.max;
    // リンクで来たとき：本体と同じ「戻る」
    var bb = document.getElementById("pv-back");
    bb.hidden = !pos.back;
    if (pos.back){ var c = DECK.ja === false ? ": " : "："; bb.textContent = "← " + L.back + c + pos.back; bb.title = L.back + c + pos.back + (DECK.ja === false ? " (Backspace / Alt+←)" : "（Backspace / Alt+←）"); bb.setAttribute("aria-label", L.back + c + pos.back); }
    fc.contentWindow && fc.contentWindow.postMessage({type: "deck-goto", i: pos.i, k: pos.k, animate: true}, "*");
    var ni = pos.k < pos.max ? pos.i : pos.i + 1, nk = pos.k < pos.max ? pos.k + 1 : 0;
    fn.contentWindow && fn.contentWindow.postMessage({type: "deck-goto", i: ni, k: nk, animate: false}, "*");
    var cur = notes(pos.key), nxt = pos.nextKey ? notes(pos.nextKey) : [];
    // 合成した声・作り方の記録がない音声の段階：口述原稿の上に 1 行（format spec §7.3。キーの一覧と同じ文）
    var vn = DECK.voiceNote ? DECK.voiceNote(pos.key) : "";
    var ai = vn ? '<div class="ai">' + vn + "</div>" : "";
    document.getElementById("pv-text").innerHTML = ai + (html(cur) || '<p style="color:#777">' + L.none + '</p>') +
      (nxt.length ? '<div class="next"><div class="lab">' + L.nextStep + '</div>' + html(nxt) + "</div>" : "");
  }
  window.addEventListener("message", function(e){
    var m = e.data || {};
    if (m.type === "deck-pos" && e.source === opener){ pos = m; update(); if (typeof m.black === "boolean") setBlack(m.black); }
    if (m.type === "deck-black" && e.source === opener) setBlack(m.on);
    if (m.type === "deck-pos" && (e.source === fc.contentWindow || e.source === fn.contentWindow) && !pos){ /* iframe の起動 */ }
  });
  fc.addEventListener("load", function(){ setTimeout(update, 300); });
  fn.addEventListener("load", function(){ setTimeout(update, 300); });
  // 閉じる（Esc・p・閉じるのボタン）：全画面なら全画面をやめるだけ。そうでなければ窓を閉じて、本体の窓にフォーカスを返す（できるとき）。
  // 編集アプリでは、この文書は発表者の窓の中の枠（#pf）にあるので、窓を閉じるのは親（app/main.js の PRES_DOC）に頼む
  function closeView(){
    if (document.fullscreenElement){ if (document.exitFullscreen) document.exitFullscreen().catch(function(){}); return; }
    if (window.parent !== window){ try { window.parent.postMessage({type: "app-pres-close"}, "*"); } catch (e) {} return; }
    try { if (opener && !opener.closed) opener.focus(); } catch (e) {}
    window.close();
  }
  DECK.presenterClose = closeView;
  document.getElementById("pv-close").onclick = function(){ closeView(); };
  // 開いたらフォーカスを取る。まだキーを受けられなければ、大きな覆いで最初のクリックを受ける
  var tap = document.createElement("button");
  tap.type = "button"; tap.id = "pv-tap"; tap.textContent = L.tap; tap.hidden = true;
  document.body.appendChild(tap);
  function unTap(){ if (!tap.hidden){ tap.hidden = true; } }
  tap.addEventListener("pointerdown", function(e){ e.preventDefault(); e.stopPropagation(); try { window.focus(); } catch (err) {} unTap(); });
  tap.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); try { window.focus(); } catch (err) {} unTap(); });
  window.addEventListener("focus", unTap);
  document.addEventListener("keydown", unTap, true);   // キーが届いているなら覆いはいらない
  try { window.focus(); } catch (e) {}
  // 編集アプリの窓の中の枠（#pf）では、枠の hasFocus は窓にフォーカスがあっても false のことがある。窓（app/main.js の PRES_DOC）が自分の hasFocus を見て知らせる
  if (window.parent !== window) window.addEventListener("message", function(e){ if (e.source === window.parent && e.data && e.data.type === "app-pres-tap" && !document.hasFocus()) tap.hidden = false; });
  else setTimeout(function(){ if (!document.hasFocus()) tap.hidden = false; }, 300);
  document.addEventListener("keydown", function(e){
    var k = e.key;
    // フォーカスのあるボタンは Enter / Space でそれ自身を押す
    if ((k === " " || k === "Enter") && e.target && e.target.closest && e.target.closest("button, a[href]")) return;
    // Esc（道具を使っていれば tools.js が先に切る：defaultPrevented）と p：閉じる。全画面のときの Esc は止めない（ブラウザのもの）
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey && (k === "Escape" || k === "p")){
      if (k === "p" || !document.fullscreenElement) e.preventDefault();
      closeView(); return;
    }
    // 戻る（リンクの前の位置へ）。ペンのときの Backspace は tools.js が書き込みを消すのに使う（defaultPrevented）
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && ((k === "Backspace" && !e.altKey) || (k === "ArrowLeft" && e.altKey))){ e.preventDefault(); send("back"); return; }
    if (e.altKey) return;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown"){ e.preventDefault(); send("next"); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp"){ e.preventDefault(); send("prev"); }
    else if (e.metaKey || e.ctrlKey) return;
    else if (k === "a") send("auto");
    else if (k === "b"){ e.preventDefault(); send("blackout"); }
  });
  // マウスで押したらフォーカスを残さない（キーボードで押したとき、detail = 0、は残す）
  document.getElementById("pv-auto").onclick = function(e){ send("auto"); if (e.detail !== 0) this.blur(); };
  document.getElementById("pv-back").onclick = function(e){ send("back"); if (e.detail !== 0) this.blur(); };
  // 道具のボタン：キーと同じ（tools.js の DECK.ptools.key）。フォーカスを奪わないので、押した後も矢印で送れる
  [].forEach.call(document.querySelectorAll("#pv button"), function(b){ b.addEventListener("mousedown", function(e){ e.preventDefault(); }); });
  [].forEach.call(document.querySelectorAll("#pv .pv-tools button"), function(b){
    b.onclick = function(e){ if (b.hasAttribute("data-c")) PT.color(+b.getAttribute("data-c")); else PT.key(b.getAttribute("data-k")); if (e.detail !== 0) b.blur(); };
  });
  function syncTools(){
    var m = PT && PT.mode();
    var c = PT && PT.color ? PT.color() : 0, sw = document.querySelector("#pv .pv-sw");
    if (sw) sw.hidden = !(m === "pen" || m === "vpen");
    [].forEach.call(document.querySelectorAll("#pv .pv-sw button"), function(b){ b.setAttribute("aria-pressed", +b.getAttribute("data-c") === c ? "true" : "false"); });
    [].forEach.call(document.querySelectorAll("#pv .pv-dot"), function(d){ d.style.background = "var(--" + PT.colors[c] + ")"; });
    [].forEach.call(document.querySelectorAll("#pv .pv-tools [data-b]"), function(b){
      var n = b.getAttribute("data-b"), on = n === "lect" ? DECK.mode === "lecture" : n === m;   // 先のステップを薄く見せる：字幕と同じ入／切
      b.classList.toggle("on", on);
      if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.addEventListener("deck:ptool", syncTools);
  syncTools();
  document.getElementById("pv-reset").onclick = function(){ started = Date.now(); };
  setInterval(function(){
    var s = Math.floor((Date.now() - started) / 1000);
    document.getElementById("pv-timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    var d = new Date(); document.getElementById("pv-clock").textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }, 500);
  send("hello");
};
})();
