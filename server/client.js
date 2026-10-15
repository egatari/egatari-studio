// 開発サーバーの編集用の画面（server/dev.mjs が </body> の前に入れる）
// e：編集モード（ダブルクリックで原稿を直す）、n：口述原稿の引き出し、c：コメントの一覧、Alt+クリック：Claude への指示
// 部品はすべて class="edit-ui" で #stage の外に置く（印刷では base.css が隠す）
(function(){
"use strict";
var Q = new URLSearchParams(location.search);
var POS_KEY = "dev-pos:" + location.pathname + location.search;
var UI_KEY = "dev-ui";
var TOKEN = window.__DECK_DEV_TOKEN || "";      // dev.mjs が画面に埋め込む合言葉。/__dev/ への問い合わせには必ず付ける
function ss(k, v){ try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || "null"); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

// ---------------------------------------------------------------- 再読み込み（Server-Sent Events）
var blockers = [];   // 未保存の入力があれば、再読み込みを待つ
var pending = false;
function canReload(){ return !blockers.some(function(f){ return f(); }); }
function reloadNow(){ ss("dev-restore", 1); location.reload(); }
function onReload(){
  if (canReload()) reloadNow();
  else if (!pending){ pending = true; toast("原稿が更新されました。保存か取消のあとで読み込み直します", "warn"); }
}
function maybePending(){ if (pending && canReload()) reloadNow(); }

var embedded = !!Q.get("view");                 // 発表者ビューの中の画面：発表者ビューが読み込み直すので何もしない
var presenter = !!Q.get("presenter");
if (embedded) return;
var es = new EventSource("/__dev/events?token=" + encodeURIComponent(TOKEN));
es.addEventListener("reload", onReload);
if (presenter){
  // 発表者ビュー：本体と同時に読み込み直されるので、本体に何度か挨拶して位置を受け取り直す
  [600, 1500, 3000].forEach(function(ms){ setTimeout(function(){ try { window.opener && window.opener.postMessage({type: "deck-cmd", cmd: "hello"}, "*"); } catch (e) {} }, ms); });
  return;
}
if (!window.DECK) return;      // 組み立ての失敗の画面
var DECK = window.DECK;

// ---------------------------------------------------------------- 見た目
var css = [
  ".edit-ui{font:14px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans','BIZ UDPGothic',sans-serif;color:#1d2330;box-sizing:border-box}",
  ".edit-ui *{box-sizing:border-box}",
  ".edit-ui button{font:inherit;font-size:13px;border:1px solid #c7ccd6;background:#fff;color:#1d2330;border-radius:6px;padding:4px 10px;cursor:pointer}",
  ".edit-ui button:hover{background:#f1f3f7}.edit-ui button:disabled{opacity:.45;cursor:default}",
  ".dev-msg button{margin-left:8px;font-size:12px;padding:1px 8px}",
  ".edit-ui button.dv-pri{background:#2563eb;border-color:#2563eb;color:#fff}.edit-ui button.dv-pri:hover{background:#1d4fd8}",
  ".edit-ui button.dv-ghost{border-color:transparent;background:transparent;color:#5b6475;padding:2px 6px}",
  ".edit-ui textarea,.edit-ui select{font:inherit;color:#1d2330;background:#fff;border:1px solid #c7ccd6;border-radius:6px}",
  ".edit-ui textarea:focus,.edit-ui select:focus{outline:2px solid #93b4f5;outline-offset:0;border-color:#2563eb}",
  ".dev-card{position:fixed;z-index:1000;background:#fff;border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.08)}",
  "#dev-badge{position:fixed;z-index:1001;left:12px;top:12px;display:none;align-items:center;gap:8px;background:#2563eb;color:#fff;border-radius:999px;padding:4px 12px 4px 10px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.3)}",
  "#dev-badge b{font-weight:700}#dev-badge span{opacity:.85;font-size:12px}",
  "#dev-badge .dv-warn{background:#f59e0b;color:#231400;border-radius:999px;padding:0 8px;cursor:pointer;opacity:1}",
  "html.dev-edit #dev-badge{display:flex}",
  "html.dev-edit #stage .slide.active [data-src]{outline:1px dashed rgba(37,99,235,.28);outline-offset:2px}",
  "html.dev-edit #stage [data-src].dev-hover{outline:2px solid #2563eb!important;outline-offset:3px;background:rgba(37,99,235,.06);cursor:text}",
  "#stage .dev-target{outline:2px solid #f59e0b!important;outline-offset:3px}",
  // 原稿の編集
  "#dev-editor{width:640px;max-width:calc(100vw - 24px);padding:12px 14px}",
  ".dev-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.dev-head .dv-t{font-weight:700}.dev-head .dv-m{color:#6b7385;font-size:12px;font-family:ui-monospace,Menlo,monospace}.dev-head .dv-sp{flex:1}",
  "#dev-editor textarea{width:100%;min-height:96px;max-height:50vh;padding:8px 10px;font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;white-space:pre-wrap}",
  ".dev-foot{display:flex;align-items:center;gap:8px;margin-top:8px}.dev-foot .dv-hint{color:#6b7385;font-size:12px;flex:1}",
  ".dev-msg{display:none;margin-top:8px;padding:6px 10px;border-radius:6px;font-size:13px}",
  ".dev-msg.dv-err{display:block;background:#fde8e8;color:#9b1c1c;border:1px solid #f5b5b5}.dev-msg.dv-ok{display:block;background:#e7f6ec;color:#16632f}",
  // コメント
  "#dev-comment{width:420px;max-width:calc(100vw - 24px);padding:12px 14px}",
  "#dev-comment .dv-q{color:#4b5363;background:#f4f5f8;border-left:3px solid #f59e0b;padding:4px 8px;margin-bottom:8px;font-size:12.5px;max-height:4.6em;overflow:hidden}",
  "#dev-comment textarea{width:100%;min-height:84px;padding:8px 10px;resize:vertical}",
  "#dev-comments{left:12px;top:52px;width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 80px);display:flex;flex-direction:column}",
  "#dev-comments .dev-head{padding:10px 12px 6px;margin:0;border-bottom:1px solid #e5e7ee}",
  "#dev-comments .dv-list{overflow:auto;padding:6px 8px 10px}",
  ".dev-c{padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}.dev-c:hover{background:#f4f6fb;border-color:#e0e5f0}",
  ".dev-c .dv-k{font-size:11.5px;color:#6b7385}.dev-c .dv-q{font-size:12px;color:#6b7385;border-left:2px solid #f59e0b;padding-left:6px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".dev-c .dv-c{white-space:pre-wrap}.dev-c .dv-row{display:flex;justify-content:flex-end;margin-top:4px}",
  ".dev-empty{color:#8a91a1;padding:14px 8px;text-align:center}",
  // 口述原稿の引き出し
  "#dev-narr{position:fixed;z-index:1000;right:0;top:0;bottom:0;width:400px;max-width:100vw;background:#f7f8fb;border-left:1px solid #d9dde6;box-shadow:-6px 0 24px rgba(0,0,0,.25);display:flex;flex-direction:column}",
  "#dev-narr .dev-head{padding:10px 14px;margin:0;background:#fff;border-bottom:1px solid #e3e6ee}",
  "#dev-narr .dv-sub{padding:6px 14px 0;color:#6b7385;font-size:12px}",
  "#dev-narr .dv-body{flex:1;overflow:auto;padding:8px 14px 14px}",
  ".dev-turn{background:#fff;border:1px solid #e0e4ec;border-radius:8px;padding:8px;margin-bottom:8px}",
  ".dev-turn .dv-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}.dev-turn .dv-row .dv-sp{flex:1}",
  ".dev-turn select{padding:2px 6px;font-size:13px}",
  ".dev-turn.novice{border-left:4px solid #f59e0b}.dev-turn.expert{border-left:4px solid #2563eb}",
  ".dev-turn textarea{width:100%;min-height:70px;padding:6px 8px;font-size:14px;line-height:1.6;resize:vertical}",
  "#dev-narr .dv-tools{display:flex;gap:8px;align-items:center;margin:4px 0 12px}",
  "#dev-narr .dv-next{border-top:1px dashed #cfd4de;padding-top:8px;color:#5b6475}",
  "#dev-narr .dv-next .dv-lab{font-size:12px;color:#8a91a1;margin-bottom:4px}#dev-narr .dv-next p{margin:0 0 6px;font-size:13px}",
  "#dev-narr .dv-next .dv-role{font-size:11px;color:#b7791f;margin-right:4px}",
  "#dev-narr .dv-foot{padding:10px 14px;background:#fff;border-top:1px solid #e3e6ee;display:flex;gap:8px;align-items:center}",
  "#dev-narr .dv-foot .dv-st{flex:1;font-size:12px;color:#6b7385}#dev-narr .dv-foot .dv-st.dv-dirty{color:#b45309}",
  "#dev-narr .dv-stale{display:none;margin:8px 0 0;padding:6px 8px;background:#fff7e6;border:1px solid #f5d38a;border-radius:6px;font-size:12.5px;color:#7a4b00}",
  "@media screen and (min-width:900px){html.dev-narr #stage{left:calc((100% - 400px) / 2)!important;transform:translate(-50%,-50%) scale(var(--dev-k,1))!important}}",
  // 知らせ
  "#dev-toast{position:fixed;z-index:1002;left:50%;bottom:22px;transform:translateX(-50%);background:#1d2330;color:#fff;padding:8px 16px;border-radius:8px;font-size:13.5px;box-shadow:0 4px 18px rgba(0,0,0,.35);display:none;max-width:80vw}",
  "#dev-toast.dv-warn{background:#92400e}#dev-toast.dv-err{background:#9b1c1c}"
].join("\n");
var st = document.createElement("style"); st.className = "edit-ui"; st.textContent = css; document.head.appendChild(st);

function h(tag, props, kids){
  var e = document.createElement(tag);
  for (var k in props || {}){
    if (k === "text") e.textContent = props[k];
    else if (k === "on") for (var ev in props.on) e.addEventListener(ev, props.on[ev]);
    else if (k === "cls") e.className = props[k];
    else e.setAttribute(k, props[k]);
  }
  (kids || []).forEach(function(c){ if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}
function api(method, url, body){
  var headers = {"x-deck-token": TOKEN};
  if (body) headers["content-type"] = "application/json";
  return fetch(url, {method: method, headers: headers, body: body ? JSON.stringify(body) : undefined})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j._status = r.status; return j; }); });
}
var toastTimer = 0;
function toast(msg, kind){
  var t = document.getElementById("dev-toast");
  if (!t){ t = h("div", {id: "dev-toast", cls: "edit-ui"}); document.body.appendChild(t); }
  t.textContent = msg; t.className = "edit-ui " + (kind ? "dv-" + kind : ""); t.style.display = "block";
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.style.display = "none"; }, kind === "warn" ? 6000 : 2600);
}
function typing(e){ var t = e.target; return t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)); }
function place(card, rect){
  // 要素の下（入らなければ上）に置き、画面からはみ出さないようにする
  var W = window.innerWidth, H = window.innerHeight, w = card.offsetWidth, hh = card.offsetHeight;
  var x = Math.max(12, Math.min(W - w - 12, rect.left));
  var y = rect.bottom + 10;
  if (y + hh > H - 12) y = rect.top - hh - 10;
  if (y < 12) y = Math.max(12, Math.min(H - hh - 12, (H - hh) / 2));
  card.style.left = x + "px"; card.style.top = y + "px";
}
function stage(){ return document.getElementById("stage"); }
function inStage(el){ var s = stage(); return s && el && s.contains(el); }

// ---------------------------------------------------------------- 位置の保存と復元
function posOfKey(key){
  var p = key.lastIndexOf(":"), sk = key.slice(0, p), stp = key.slice(p + 1);
  var i = (DECK.slides || []).findIndex(function(s){ return s._key === sk; });
  if (i < 0) return null;
  var s = DECK.slides[i];
  var k = stp === "concl" ? (s._cstep >= 0 ? s._cstep : s._max) : Math.min(+stp || 0, s._max);
  return {i: i, k: k};
}
var curPos = null;
var savedPos = ss(POS_KEY), savedFlag = ss("dev-restore");   // 起動時の deck:pos で上書きされる前に読む
ss("dev-restore", null);
document.addEventListener("deck:pos", function(e){
  curPos = e.detail;
  ss(POS_KEY, {i: e.detail.i, k: e.detail.k});
  if (narrOpen) narrFollow();
});
function restore(){
  var p = savedPos, flag = savedFlag;
  var hi = parseInt((location.hash || "").slice(1), 10) - 1;
  if (p && (flag || hi === p.i)) DECK.go(p.i, p.k, false);
  var ui = ss(UI_KEY) || {};
  if (ui.edit) setEdit(true);
  if (ui.narr) toggleNarr(true);
  if (ui.comments) toggleComments(true);
}
function saveUi(){ ss(UI_KEY, {edit: editOn, narr: narrOpen, comments: commentsOpen}); }
if (DECK.ready) setTimeout(restore, 0); else document.addEventListener("deck:ready", restore);

// ---------------------------------------------------------------- 編集モード
var editOn = false, hoverEl = null;
var badge = h("div", {id: "dev-badge", cls: "edit-ui"}, [h("b", {text: "編集モード"}), h("span", {text: "ダブルクリックで編集 · Alt+クリックで指示 · e で終了"})]);
var warns = window.__DEV_WARN || [];
if (warns.length){
  var wb = h("span", {cls: "dv-warn", text: "警告 " + warns.length, title: warns.join("\n"), on: {click: function(){ alert(warns.join("\n")); }}});
  badge.appendChild(wb);
  console.warn("[dev] 組み立ての警告\n" + warns.join("\n"));
}
document.body.appendChild(badge);
function setEdit(on){
  editOn = on;
  document.documentElement.classList.toggle("dev-edit", on);
  if (!on && hoverEl){ hoverEl.classList.remove("dev-hover"); hoverEl = null; }
  saveUi();
}
document.addEventListener("mouseover", function(e){
  if (!editOn) return;
  var t = e.target && e.target.closest ? e.target.closest("[data-src]") : null;
  if (t && !inStage(t)) t = null;
  if (t === hoverEl) return;
  if (hoverEl) hoverEl.classList.remove("dev-hover");
  hoverEl = t;
  if (t) t.classList.add("dev-hover");
});
document.addEventListener("dblclick", function(e){
  if (!editOn) return;
  var t = e.target && e.target.closest ? e.target.closest("[data-src]") : null;
  if (!t || !inStage(t)) return;
  e.preventDefault();
  var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
  openEditor(t);
});

var editor = null;
function closeEditor(){
  if (!editor) return;
  editor.target.classList.remove("dev-target");
  editor.card.remove(); editor = null;
  maybePending();
}
blockers.push(function(){ return editor && editor.ta.value !== editor.orig; });
function openEditor(el){
  closeEditor();
  var range = el.getAttribute("data-src"), hh = el.getAttribute("data-src-h");
  var ta = h("textarea", {spellcheck: "false"});
  var msg = h("div", {cls: "dev-msg"});
  var save = h("button", {cls: "dv-pri", text: "保存"});
  var cancel = h("button", {text: "取消"});
  var card = h("div", {id: "dev-editor", cls: "edit-ui dev-card"}, [
    h("div", {cls: "dev-head"}, [h("span", {cls: "dv-t", text: "原稿を編集"}), h("span", {cls: "dv-m", text: "<" + el.tagName.toLowerCase() + "> " + range}), h("span", {cls: "dv-sp"}),
      h("button", {cls: "dv-ghost", text: "✕", title: "閉じる（Esc）", on: {click: closeEditor}})]),
    ta, msg,
    h("div", {cls: "dev-foot"}, [h("span", {cls: "dv-hint", text: "⌘/Ctrl+Enter で保存 · Esc で取消 · 数式は \\( … \\) のまま書けます"}), cancel, save])
  ]);
  document.body.appendChild(card);
  el.classList.add("dev-target");
  editor = {card: card, ta: ta, target: el, orig: "", h: hh, range: range};
  ta.value = "読み込み中…"; ta.disabled = true;
  place(card, el.getBoundingClientRect());
  api("GET", "/__dev/source?range=" + encodeURIComponent(range)).then(function(j){
    if (!editor || editor.card !== card) return;
    ta.disabled = false;
    if (j._status !== 200){ ta.value = ""; showErr(msg, j.error || "読み込めませんでした"); return; }
    ta.value = j.text; editor.orig = j.text;
    if (j.h !== hh){ showErr(msg, "原稿が変わっています。再読み込みしてください（この画面は古い原稿から作られています）", true); save.disabled = true; }
    ta.rows = Math.min(16, Math.max(4, j.text.split("\n").length + 1));
    place(card, el.getBoundingClientRect());
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  function doSave(){
    if (save.disabled) return;
    if (ta.value === editor.orig){ closeEditor(); return; }
    save.disabled = true; save.textContent = "保存中…";
    api("POST", "/__dev/edit", {range: range, h: hh, text: ta.value}).then(function(j){
      if (j._status === 200){
        editor.orig = ta.value;   // 未保存ではなくなったので、再読み込みを止めない
        msg.className = "dev-msg dv-ok"; msg.textContent = j.error || "保存しました";
        setTimeout(function(){ if (pending) maybePending(); }, 50);
      } else {
        save.disabled = j._status === 409; save.textContent = "保存";
        showErr(msg, j._status === 409 ? "原稿が変わっています。再読み込みしてください（入力した内容はコピーしておいてください）" : (j.error || "保存できませんでした"), j._status === 409);
        if (j._status !== 409) save.disabled = false;
      }
    }, function(){ save.disabled = false; save.textContent = "保存"; showErr(msg, "サーバーに繋がりません"); });
  }
  save.onclick = doSave;
  cancel.onclick = closeEditor;
  ta.addEventListener("keydown", function(e){
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)){ e.preventDefault(); doSave(); }
    else if (e.key === "Escape"){ e.preventDefault(); closeEditor(); }
    e.stopPropagation();
  });
}
function showErr(msg, text, reload){
  msg.className = "dev-msg dv-err"; msg.textContent = text;
  if (reload) msg.appendChild(h("button", {text: "再読み込み", on: {click: function(){ closeEditor(); reloadNow(); }}}));
}

// ---------------------------------------------------------------- Claude への指示（Alt+クリック）
var cbox = null;
function closeComment(){ if (!cbox) return; if (cbox.target) cbox.target.classList.remove("dev-target"); cbox.card.remove(); cbox = null; maybePending(); }
blockers.push(function(){ return cbox && cbox.ta.value.trim(); });
document.addEventListener("click", function(e){
  if (!e.altKey || !inStage(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  openComment(e.target, e.clientX, e.clientY);
}, true);
function openComment(target, x, y){
  closeComment();
  var el = target.closest("[data-src]") || target.closest("[data-step], m-sweep, svg, .concl, .body, .slide") || target;
  var quote = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  var key = DECK.state().key;
  var ta = h("textarea", {placeholder: "例：この行をもっと短く / 図の色を合わせて / 例を一つ足して"});
  var msg = h("div", {cls: "dev-msg"});
  var save = h("button", {cls: "dv-pri", text: "残す"});
  var card = h("div", {id: "dev-comment", cls: "edit-ui dev-card"}, [
    h("div", {cls: "dev-head"}, [h("span", {cls: "dv-t", text: "Claudeへの指示"}), h("span", {cls: "dv-m", text: key}), h("span", {cls: "dv-sp"}),
      h("button", {cls: "dv-ghost", text: "✕", title: "閉じる（Esc）", on: {click: closeComment}})]),
    quote ? h("div", {cls: "dv-q", text: quote}) : null,
    ta, msg,
    h("div", {cls: "dev-foot"}, [h("span", {cls: "dv-hint", text: "⌘/Ctrl+Enter で残す · comments.json に書きます"}), h("button", {text: "取消", on: {click: closeComment}}), save])
  ]);
  document.body.appendChild(card);
  el.classList.add("dev-target");
  cbox = {card: card, ta: ta, target: el};
  place(card, {left: x - 20, right: x, top: y - 8, bottom: y + 8});
  ta.focus();
  function doSave(){
    if (!ta.value.trim()) return;
    save.disabled = true;
    api("POST", "/__dev/comment", {key: key, range: el.getAttribute("data-src") || null, quote: quote, comment: ta.value}).then(function(j){
      if (j._status !== 200){ save.disabled = false; showErr(msg, j.error || "残せませんでした"); return; }
      ta.value = ""; closeComment(); toast("指示を残しました（comments.json）");
      if (commentsOpen) loadComments();
    });
  }
  save.onclick = doSave;
  ta.addEventListener("keydown", function(e){
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)){ e.preventDefault(); doSave(); }
    else if (e.key === "Escape"){ e.preventDefault(); ta.value = ""; closeComment(); }
    e.stopPropagation();
  });
}

// ---------------------------------------------------------------- コメントの一覧（c）
var commentsOpen = false, cpanel = null;
function toggleComments(on){
  commentsOpen = on === undefined ? !commentsOpen : on;
  if (cpanel){ cpanel.remove(); cpanel = null; }
  if (commentsOpen){
    cpanel = h("div", {id: "dev-comments", cls: "edit-ui dev-card"}, [
      h("div", {cls: "dev-head"}, [h("span", {cls: "dv-t", text: "Claudeへの指示（未対応）"}), h("span", {cls: "dv-sp"}),
        h("button", {cls: "dv-ghost", text: "✕", title: "閉じる（c）", on: {click: function(){ toggleComments(false); }}})]),
      h("div", {cls: "dv-list"}, [h("div", {cls: "dev-empty", text: "読み込み中…"})])
    ]);
    document.body.appendChild(cpanel);
    loadComments();
  }
  saveUi();
}
function loadComments(){
  api("GET", "/__dev/comments").then(function(list){
    if (!cpanel) return;
    var box = cpanel.querySelector(".dv-list"); box.innerHTML = "";
    var open = (Array.isArray(list) ? list : []).filter(function(c){ return c.status === "open"; });
    if (!open.length){ box.appendChild(h("div", {cls: "dev-empty", text: "未対応の指示はありません。スライドの上で Alt+クリックすると残せます"})); return; }
    open.forEach(function(c){
      var item = h("div", {cls: "dev-c", title: "クリックでそのスライドへ"}, [
        h("div", {cls: "dv-k", text: c.key + " · " + new Date(c.created).toLocaleString("ja-JP", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"})}),
        c.quote ? h("div", {cls: "dv-q", text: c.quote}) : null,
        h("div", {cls: "dv-c", text: c.comment}),
        h("div", {cls: "dv-row"}, [h("button", {text: "解決", title: "対応済みにする", on: {click: function(e){
          e.stopPropagation();
          api("POST", "/__dev/comment/resolve", {id: c.id}).then(function(){ loadComments(); });
        }}})])
      ]);
      item.addEventListener("click", function(){ var p = posOfKey(c.key); if (p) DECK.go(p.i, p.k, false); else toast("スライドが見つかりません: " + c.key, "warn"); });
      box.appendChild(item);
    });
  });
}

// ---------------------------------------------------------------- 口述原稿の引き出し（n）
var narrOpen = false, drawer = null, narr = null;   // narr = {key, slideKey, stepKey, orig, dirty}
function refit(){
  var k = Math.min((window.innerWidth - 400) / 1280, window.innerHeight / 720);
  document.documentElement.style.setProperty("--dev-k", String(Math.max(0.1, k)));
}
window.addEventListener("resize", refit);
blockers.push(function(){ return narr && narr.dirty; });
function toggleNarr(on){
  narrOpen = on === undefined ? !narrOpen : on;
  document.documentElement.classList.toggle("dev-narr", narrOpen);
  if (drawer){ drawer.remove(); drawer = null; narr = null; }
  if (narrOpen){
    refit();
    drawer = h("div", {id: "dev-narr", cls: "edit-ui"});
    document.body.appendChild(drawer);
    narrFollow(true);
  }
  saveUi();
  maybePending();
}
function splitKey(key){ var p = key.lastIndexOf(":"); return [key.slice(0, p), key.slice(p + 1)]; }
function narrFollow(force){
  if (!drawer) return;
  var s = DECK.state(), key = s.key;
  if (!force && narr && narr.key === key){ renderNext(); return; }
  if (narr && narr.dirty && !force){
    var stale = drawer.querySelector(".dv-stale");
    if (stale){ stale.style.display = "block"; stale.textContent = "表示中の段階（" + key + "）とは別の段階を編集中です。保存か取消のあとで切り替わります"; }
    return;
  }
  var sk = splitKey(key);
  narr = {key: key, slideKey: sk[0], stepKey: sk[1], turns: [], dirty: false};
  renderDrawer(true);
  api("GET", "/__dev/narration?key=" + encodeURIComponent(key)).then(function(j){
    if (!narr || narr.key !== key) return;
    narr.turns = (j.turns || []).map(function(t){ return {role: t.role, text: t.text}; });
    narr.line = j.line; narr.rev = j.rev;
    renderDrawer(false);
  });
}
function renderDrawer(loading){
  drawer.innerHTML = "";
  var s = DECK.state();
  var title = (DECK.slides[s.slide - 1].querySelector("h2, h1") || {}).textContent || narr.slideKey;
  var status = h("span", {cls: "dv-st", text: narr.line ? "narration.md " + narr.line + " 行目" : "まだ口述原稿がありません"});
  var saveBtn = h("button", {cls: "dv-pri", text: "保存"});
  var revert = h("button", {text: "取消", title: "編集前に戻す"});
  var body = h("div", {cls: "dv-body"});
  drawer.appendChild(h("div", {cls: "dev-head"}, [h("span", {cls: "dv-t", text: "口述原稿"}), h("span", {cls: "dv-m", text: "段階 " + narr.stepKey}), h("span", {cls: "dv-sp"}),
    h("button", {cls: "dv-ghost", text: "✕", title: "閉じる（n）", on: {click: function(){ if (!narr.dirty || confirm("保存していない変更を捨てますか")) { narr.dirty = false; toggleNarr(false); } }}})]));
  drawer.appendChild(h("div", {cls: "dv-sub", text: "スライド " + s.slide + "：" + title.replace(/\s+/g, " ").trim()}));
  drawer.appendChild(body);
  drawer.appendChild(h("div", {cls: "dv-foot"}, [status, revert, saveBtn]));
  var stale = h("div", {cls: "dv-stale"}); body.appendChild(stale);
  var nmsg = h("div", {cls: "dev-msg"}); body.appendChild(nmsg);
  if (loading){ body.appendChild(h("div", {cls: "dev-empty", text: "読み込み中…"})); return; }
  function markDirty(){ narr.dirty = true; status.textContent = "未保存の変更があります"; status.className = "dv-st dv-dirty"; }
  var list = h("div", {cls: "dv-turns"}); body.appendChild(list);
  function drawTurns(){
    list.innerHTML = "";
    if (!narr.turns.length) list.appendChild(h("div", {cls: "dev-empty", text: "この段階の口述原稿はまだありません。「発言を足す」で書き始めます"}));
    narr.turns.forEach(function(t, j){
      var sel = h("select", {"aria-label": "話者"}, [h("option", {value: "expert", text: "Expert（説明役）"}), h("option", {value: "novice", text: "Novice（聞き役）"})]);
      sel.value = t.role;
      var ta = h("textarea", {placeholder: "話す内容。{cue} で同期点、{φ|ファイ} で読みを指定できます"});
      ta.value = t.text;
      var card = h("div", {cls: "dev-turn " + t.role}, [
        h("div", {cls: "dv-row"}, [sel, h("span", {cls: "dv-sp"}),
          j > 0 ? h("button", {cls: "dv-ghost", text: "↑", title: "前へ", on: {click: function(){ var x = narr.turns.splice(j, 1)[0]; narr.turns.splice(j - 1, 0, x); markDirty(); drawTurns(); }}}) : null,
          h("button", {cls: "dv-ghost", text: "削除", title: "この発言を消す", on: {click: function(){ narr.turns.splice(j, 1); markDirty(); drawTurns(); }}})]),
        ta]);
      sel.addEventListener("change", function(){ t.role = sel.value; card.className = "dev-turn " + t.role; markDirty(); });
      ta.addEventListener("input", function(){ t.text = ta.value; markDirty(); });
      ta.addEventListener("keydown", keys);
      list.appendChild(card);
    });
  }
  drawTurns();
  var last = function(){ return narr.turns.length ? narr.turns[narr.turns.length - 1].role : "novice"; };
  body.appendChild(h("div", {cls: "dv-tools"}, [h("button", {text: "＋ 発言を足す", on: {click: function(){
    narr.turns.push({role: last() === "expert" ? "novice" : "expert", text: ""}); markDirty(); drawTurns();
    var tas = list.querySelectorAll("textarea"); if (tas.length) tas[tas.length - 1].focus();
  }}})]));
  var next = h("div", {cls: "dv-next"}); body.appendChild(next);
  renderNext(next);
  function doSave(){
    if (saveBtn.disabled) return;
    saveBtn.disabled = true; saveBtn.textContent = "保存中…";
    api("POST", "/__dev/narration", {slideKey: narr.slideKey, stepKey: narr.stepKey, turns: narr.turns, rev: narr.rev}).then(function(j){
      saveBtn.textContent = "保存";
      if (j._status === 409){
        // 原稿の編集と同じ扱い：保存を止め、再読み込みを促す（入力はそのまま残す）
        showErr(nmsg, "口述原稿が変わっています。再読み込みしてください（入力した内容はコピーしておいてください）", true);
        return;
      }
      saveBtn.disabled = false;
      if (j._status !== 200){ status.textContent = j.error || "保存できませんでした"; status.className = "dv-st dv-dirty"; return; }
      if (j.rev) narr.rev = j.rev;
      narr.dirty = false; status.textContent = j.changed ? "保存しました" : "変更はありません"; status.className = "dv-st";
      if (!j.changed) narrFollow(true);
      maybePending();
    }, function(){ saveBtn.disabled = false; saveBtn.textContent = "保存"; status.textContent = "サーバーに繋がりません"; });
  }
  function keys(e){
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)){ e.preventDefault(); doSave(); }
    else if (e.key === "Escape"){ e.preventDefault(); e.target.blur(); }
    e.stopPropagation();
  }
  saveBtn.onclick = doSave;
  revert.onclick = function(){ narr.dirty = false; narrFollow(true); maybePending(); };
}
function renderNext(box){
  box = box || (drawer && drawer.querySelector(".dv-next"));
  if (!box || !curPos) return;
  box.innerHTML = "";
  var nk = curPos.nextKey;
  box.appendChild(h("div", {cls: "dv-lab", text: nk ? "次の段階（" + nk.slice(nk.lastIndexOf(":") + 1) + (nk.split(":")[0] !== narr.slideKey ? "、次のスライド" : "") + "）" : "次の段階はありません"}));
  if (!nk) return;
  var sk = splitKey(nk), turns = ((DECK.NARRATION[sk[0]] || {})[sk[1]]) || [];
  if (!turns.length) box.appendChild(h("p", {text: "（口述原稿なし）"}));
  turns.forEach(function(t){ box.appendChild(h("p", {}, [t.role === "novice" ? h("span", {cls: "dv-role", text: "Novice"}) : null, t.text])); });
}

// ---------------------------------------------------------------- 鍵盤（入力中は何もしない。矢印は実行系に任せる）
document.addEventListener("keydown", function(e){
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "e") setEdit(!editOn);
  else if (e.key === "n") toggleNarr();
  else if (e.key === "c") toggleComments();
  else if (e.key === "Escape"){ closeEditor(); closeComment(); }
});
})();
