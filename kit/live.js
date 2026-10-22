// 授業の部屋の再生器（拡張 live。format spec の extensions/live.md、通信は egatari/live の PROTOCOL.md）
// 部屋を付けた再生専用の派生にだけ入る（kit/core/live.mjs の addLive が、deck-meta の直後に DECK.LivePolicy と一緒に入れる）。ほかの出力には入らない
// - 初めはたたんだ印（#live-mark。右上の小さなボタン）だけ。舞台（#stage）は窓いっぱい。印を押すか、投票のある段階に来ると板（#live-pane）を開く：
//   横長の画面では右、縦長では下。開いている間、舞台は板を除いた場所に収める（中の (i, k, t) の描画・字幕・印・動画・印刷は変えない）。
//   投票で開いた板は、その段階を離れるとたたむ（板の「開いたままにする」か、印から開いたときはたたまない）
// - 何も送らない・つながない：動画（?mode=video）・印刷・発表者ビューとその中の画面（?presenter・?view）・枠の中（編集アプリのプレビュー・srcdoc・LMS）・
//   http(s)・file:・content:（Android）でない文書・この派生の決まり（CSP）でない文書・窓（window）の外。迷ったらつながず、部屋の場所を字で見せる
// - 初めてつなぐ前に、つながる先を見せて「参加する」を 1 回押してもらう（覚えるのはこのタブのあいだだけ。sessionStorage）
// - 送るのは、学ぶ人が送ると決めたもの（質問・投票）と、端末で作った乱数の pid（localStorage。使えなければメモリ）と、入れたときだけ名前、ping だけ。
//   見ている位置や時間は送らない。"*" の Q&A の段階の鍵は、送るときに画面にある段階（学ぶ人が送ると決めたものに付けるだけ）
// - サーバーの字はすべて textContent（HTML にしない）。つなぐ URL の origin は endpoint と同じか確かめる
(function(){
"use strict";
var DECK = window.DECK = window.DECK || {};
var CFG = DECK.LIVE_CFG || {};
var Q = new URLSearchParams(location.search);
var MODE = Q.get("mode") || document.documentElement.getAttribute("data-mode") || "talk";
// 動画・発表者ビュー・その中の画面では、板も作らない
if (MODE === "video" || Q.get("presenter") || Q.get("view")) return;
var LP = typeof DECK.LivePolicy === "function" ? DECK.LivePolicy() : null;
if (!LP) return;
var live = null;
try {
  var blk = document.getElementById(CFG.blockId || "deck-extensions");
  var d = blk && blk.type === "application/json" ? JSON.parse(blk.textContent) : null;
  live = d && d.live;
} catch (e) { live = null; }
if (!live) return;
var bad = LP.validate(live, {key: true});
if (bad.length){ console.warn("live: ignored (" + bad.join("; ") + ")"); return; }

var JA = /^ja\b/i.test(document.documentElement.lang || "ja");
var HOST = LP.hostOf(live.endpoint);
var S = JA ? {
  title: "ライブ（質問・投票）", again: "もう一度試す", notice: "この教材から、" + HOST + " のライブで先生に質問や投票を送れます", join: "参加する", leave: "退出する", fold: "たたむ", unfold: "ひらく", badge: "ライブ", pin: "開いたままにする", pollOpen: "このステップに投票があります。ライブの板を開きました",
  off: "つないでいません", connecting: "つないでいます…", connected: "参加中", waiting: "待機室で待っています", retrying: function(s){ return s + " 秒後につなぎ直します"; },
  before: function(t){ return "ライブは " + t + " に始まります"; }, after: "ライブの時間は終わりました", noNet: "この画面からは参加できません。教材のファイルをダウンロードして、ブラウザ（Chrome・Safari など）で直接開いてください。ライブ ID：",
  noNetLink: "この画面からは参加できません。ブラウザの新しいタブで参加できます。", openJoin: "ブラウザで参加する", joinTo: "参加先：", roomLabel: "ライブ ID：",
  name: "名前（任意）", nameNote: "名前はホストだけに見えます（入れなければ名前なしで送られます）", ask: "先生への質問", send: "送る", sent: "質問を送りました", vote: "投票する", voted: "投票しました", revote: "選び直して投票できます",
  shown: "ホストが全員に表示した質問", leftMsg: "切断しました。もう一度参加できます", window: function(a, b){ return a + " – " + b; }, privacy: "送るのは、送ると決めた質問と投票（と入れたときの名前）、この端末で作った番号だけです。見ている位置や時間は送りません",
  stop: {bad_key: "この教材の鍵では部屋に入れません（鍵が違います）", room_not_found: "部屋が見つかりません", superseded: "ほかのタブや窓で参加したので、ここは切れました",
    room_expired: "部屋の時間が終わりました", room_closed: "ホストがライブを終えました。再開したら、もう一度「参加する」を押してください", too_early: "まだライブの時間になっていません（この端末の時計も確かめてください）",
    room_full: "部屋が満員です。少し待ってから、もう一度参加してください", key_replaced: "先生が参加の鍵を替えました。このファイルでは入れません。新しいファイルをもらってください",
    not_approved: "先生が参加を認めませんでした", bad_message: "通信の約束が合いません（教材かサーバーの不具合）", window_over: "授業の部屋の時間は終わりました", unknown: "部屋から切断されました",
    bad_endpoint: "つなぐ先が教材の宣言と違うので、つなぎません", network: "つなげませんでした"},
  err: {unknown_activity: "この活動は部屋にありません", wrong_kind: "活動の種類が違います", bad_choice: "選択肢がありません", text_too_long: "質問が長すぎます", empty_text: "質問が空です",
    rate_limited: "送るのが速すぎます。少し待ってください", quota_exceeded: "送れる質問の数を超えました", room_limit: "部屋がいっぱいです", not_admitted: "先生の承認を待っています", other: "送れませんでした"}
} : {
  title: "Live (questions and polls)", again: "Try again", notice: "From this lesson you can send questions and votes to your teacher through Live at " + HOST, join: "Join", leave: "Leave", fold: "Fold", unfold: "Unfold", badge: "Live", pin: "Keep open", pollOpen: "This step has a poll. The Live pane is open",
  off: "Not connected", connecting: "Connecting…", connected: "Joined", waiting: "Waiting in the waiting room", retrying: function(s){ return "Reconnecting in " + s + " s"; },
  before: function(t){ return "The Live starts at " + t; }, after: "The live time is over", noNet: "You cannot join from this screen. Download the lesson file and open it directly in a browser (Chrome, Safari, …). Live ID: ",
  noNetLink: "You cannot join from this screen. You can join in a new browser tab.", openJoin: "Join in the browser", joinTo: "Goes to: ", roomLabel: "Live ID: ",
  name: "Name (optional)", nameNote: "Only the host sees your name (leave it empty to send without one)", ask: "Question for the teacher", send: "Send", sent: "Question sent", vote: "Vote", voted: "Vote recorded", revote: "You can change your vote",
  shown: "Questions the host showed to everyone", leftMsg: "Disconnected. You can join again", window: function(a, b){ return a + " – " + b; }, privacy: "Only what you choose to send (questions, votes, and a name if you type one) and a random id made on this device are sent. Your viewing position and timing are not",
  stop: {bad_key: "This lesson's key does not open the room (wrong key)", room_not_found: "The room does not exist", superseded: "You joined in another tab or window, so this one was disconnected",
    room_expired: "The room's time is over", room_closed: "The host ended the Live. When it reopens, press Join again", too_early: "The Live has not started yet (also check this device's clock)",
    room_full: "The room is full. Wait a little and join again", key_replaced: "The teacher replaced the key: this file can no longer join. Ask for a new file",
    not_approved: "The teacher did not admit you", bad_message: "Protocol mismatch (a bug in the lesson or the server)", window_over: "The live room has ended", unknown: "Disconnected by the room",
    bad_endpoint: "The address does not match the one the lesson declares; not connecting", network: "Could not connect"},
  err: {unknown_activity: "This activity is not in the room", wrong_kind: "Wrong kind of activity", bad_choice: "No such choice", text_too_long: "The question is too long", empty_text: "The question is empty",
    rate_limited: "Sending too fast. Wait a moment", quota_exceeded: "You have sent the maximum number of questions", room_limit: "The room is full", not_admitted: "Waiting for the teacher to admit you", other: "Could not send"}
};
// 手動で「参加する」から試し直せる止まり方（ほかは、このファイルでは入れない）
var REJOIN = {room_closed: 1, too_early: 1, room_full: 1, rate_limited: 1, superseded: 1, not_approved: 1, network: 1, unknown: 1, window_over: 0};

// ---------------------------------------------------------------- つないでよい場所か（迷ったら否）
function docInfo(){
  var framed = true;
  try { framed = window.top !== window; } catch (e) { framed = true; }
  var metas = [].filter.call(document.querySelectorAll("meta[http-equiv]"), function(m){ return /^content-security-policy$/i.test(m.getAttribute("http-equiv") || ""); });
  return {framed: framed, protocol: location.protocol, origin: location.origin, pathname: location.pathname, csp: metas.map(function(m){ return m.getAttribute("content") || ""; })};
}
// file: と content:（Android のファイルのアプリ）は学ぶ人が自分で開いたファイル。決まりは kit/core/live-policy.mjs の docContext
var DOC = docInfo();
function context(){ return LP.docContext(DOC, live.endpoint); }
var CTX = context();

// ---------------------------------------------------------------- 記憶（どれも使えなければメモリだけ）
var MEM = {};
function store(kind){ try { var s = window[kind]; if (s) { s.getItem("x"); return s; } } catch (e) {} return null; }
function getItem(kind, k){ var s = store(kind); try { if (s) { var v = s.getItem(k); if (v !== null) return v; } } catch (e) {} return Object.prototype.hasOwnProperty.call(MEM, kind + k) ? MEM[kind + k] : null; }
function setItem(kind, k, v){ var s = store(kind); try { if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch (e) {} if (v === null) delete MEM[kind + k]; else MEM[kind + k] = v; }
var PFX = CFG.storePrefix || "live-";
var JOINED_KEY = PFX + "joined:" + live.room, PID_KEY = PFX + "pid:" + live.room;
function newPid(){
  var b = new Uint8Array(16), s = "";
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function(_, i){ b[i] = Math.floor(Math.random() * 256); });
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pid(){
  var p = getItem("localStorage", PID_KEY);
  if (!p || !LP.RE.pid.test(p)){ p = newPid(); setItem("localStorage", PID_KEY, p); }
  return p;
}

// ---------------------------------------------------------------- 板
function h(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
var css = h("style"); css.id = "live-pane-style";
css.textContent =
  "#live-pane{position:fixed;z-index:37;box-sizing:border-box;display:flex;flex-direction:column;background:#1d1f22;color:#eceef0;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden}" +
  "html.lv-side #live-pane{top:0;right:0;bottom:0;width:var(--lv-w);border-left:1px solid #3a3d42}" +
  "html.lv-bottom #live-pane{left:0;right:0;bottom:0;height:var(--lv-h);border-top:1px solid #3a3d42}" +
  "#live-pane .lv-head{display:flex;align-items:center;gap:8px;padding:8px 10px;flex:none;border-bottom:1px solid #33363a;min-height:44px;box-sizing:border-box}" +
  "html.lv-collapsed #live-pane{display:none}" +
  "#live-mark{all:unset;position:fixed;right:10px;top:7px;z-index:38;box-sizing:border-box;display:flex;align-items:center;gap:6px;height:30px;padding:0 11px 0 9px;border-radius:999px;" +
  "background:rgba(20,20,20,.78);color:#fff;font:600 12.5px/1 system-ui,-apple-system,'Segoe UI',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
  "#live-mark:hover{background:rgba(20,20,20,.92)}#live-mark:focus-visible{outline:2px solid #9cc8ff;outline-offset:2px}#live-mark[aria-expanded=true]{background:#24436e}" +
  "html.lv-side #live-mark{right:calc(var(--lv-w) + 10px)}" +
  ".lv-dot{width:10px;height:10px;border-radius:50%;background:#7a7f86;flex:none}" +
  "[data-state=connected]>.lv-dot,[data-state=connected]>.lv-head>.lv-dot{background:#3fbf6f}" +
  "[data-state=waiting]>.lv-dot,[data-state=connecting]>.lv-dot,[data-state=retrying]>.lv-dot,[data-state=waiting]>.lv-head>.lv-dot,[data-state=connecting]>.lv-head>.lv-dot,[data-state=retrying]>.lv-head>.lv-dot{background:#e0b341}" +
  "[data-state=stopped]>.lv-dot,[data-state=stopped]>.lv-head>.lv-dot{background:#e0605a}" +
  "#live-pane .lv-title{font-weight:700}#live-pane .lv-state{flex:1;min-width:0;color:#b9bec5;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  "#live-pane .lv-body{flex:1;overflow:auto;padding:10px 12px 14px}" +
  "#live-pane p{margin:0 0 8px}#live-pane .lv-small{font-size:12px;color:#a3a9b0}#live-pane .lv-msg:empty{display:none}#live-pane .lv-msg{color:#ffd28a}" +
  "#live-pane .lv-addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;user-select:all}" +
  "#live-pane button{font:inherit;color:#111;background:#e9ecef;border:1px solid #c9ced4;border-radius:6px;padding:4px 12px;cursor:pointer}" +
  "#live-pane a.lv-join-link{display:inline-block;background:#4d8dff;border:1px solid #4d8dff;border-radius:6px;padding:4px 12px;color:#fff;font-weight:600;text-decoration:none}" +
  "#live-pane a.lv-join-link:focus-visible{outline:2px solid #9cc8ff;outline-offset:2px}" +
  "#live-pane button.lv-pri{background:#4d8dff;border-color:#4d8dff;color:#fff;font-weight:600}#live-pane button:disabled{opacity:.5;cursor:default}" +
  "#live-pane .lv-head button{padding:2px 8px;font-size:12.5px}" +
  "#live-pane .lv-head button.lv-pin{display:flex;align-items:center;padding:2px 5px;background:transparent;border-color:#5a5f66;color:#c4c9cf}" +
  "#live-pane .lv-head button.lv-pin[aria-pressed=true]{background:#4d8dff;border-color:#4d8dff;color:#fff}" +
  "#live-pane .lv-pin svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round}" +
  "#live-pane button:focus-visible,#live-pane input:focus-visible,#live-pane textarea:focus-visible{outline:2px solid #9cc8ff;outline-offset:2px}" +
  "#live-pane label{display:block;font-size:12.5px;color:#c4c9cf;margin:8px 0 3px}" +
  "#live-pane input[type=text],#live-pane textarea{box-sizing:border-box;width:100%;font:inherit;color:#111;background:#fff;border:1px solid #9aa1a9;border-radius:6px;padding:4px 6px}" +
  "#live-pane textarea{min-height:64px;resize:vertical}#live-pane .lv-row{display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap}" +
  "#live-pane fieldset{border:1px solid #3d4146;border-radius:8px;margin:10px 0;padding:6px 10px 10px}#live-pane legend{font-weight:600;padding:0 4px}" +
  "#live-pane fieldset label{display:flex;gap:6px;align-items:flex-start;font-size:14px;color:#eceef0;margin:4px 0}" +
  "#live-pane h3{font-size:12.5px;margin:14px 0 4px;color:#c4c9cf}#live-pane ul{margin:0;padding-left:18px}#live-pane li{margin:3px 0}" +
  "#live-pane .lv-sec[hidden],#live-pane [hidden]{display:none!important}" +
  "html.lv-side #dt-cb{left:calc((100% - var(--lv-w)) / 2)}html.lv-side #deck-toast{left:calc((100% - var(--lv-w)) / 2)}html.lv-side #jump{right:calc(var(--lv-w) + 12px)}html.lv-side #bar{max-width:calc(100% - var(--lv-w))}" +
  "html.lv-bottom #dt-cb{bottom:calc(var(--lv-h) + 10px)}html.lv-bottom #bar{bottom:var(--lv-h)}html.lv-bottom #jump,html.lv-bottom #dt-ind{bottom:calc(var(--lv-h) + 10px)}" +
  "@keyframes lv-in{from{opacity:0}to{opacity:1}}" +
  "@media (prefers-reduced-motion:no-preference){.lv-dot{transition:background-color .2s}#live-pane{animation:lv-in .16s ease-out}}" +
  ".printing #live-pane,.printing #live-mark{display:none!important}@media print{#live-pane,#live-mark{display:none!important}}";
var pane = h("aside"); pane.id = "live-pane"; pane.setAttribute("aria-label", S.title); pane.setAttribute("data-state", "off");
var head = h("div", "lv-head"), dot = h("span", "lv-dot"), title = h("span", "lv-title", S.title), state = h("span", "lv-state", S.off);
dot.setAttribute("aria-hidden", "true");
var bLeave = h("button", "lv-leave", S.leave); bLeave.type = "button"; bLeave.hidden = true;
var bPin = h("button", "lv-pin"); bPin.type = "button"; bPin.setAttribute("aria-label", S.pin); bPin.title = S.pin; bPin.setAttribute("aria-pressed", "false");
bPin.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5h4l-.6 4 2.3 2.3H4.3L6.6 6.5zM8 8.8v4.7"/></svg>';
var bFold = h("button", "lv-fold", "×"); bFold.type = "button"; bFold.setAttribute("aria-label", S.fold); bFold.title = S.fold;
head.appendChild(dot); head.appendChild(title); head.appendChild(state); head.appendChild(bLeave); head.appendChild(bPin); head.appendChild(bFold);
// たたんだ印：本物のボタン（aria-expanded）。つながっている間も印の点と読み上げ用の字で状態を見せる
var mark = h("button"); mark.id = "live-mark"; mark.type = "button"; mark.setAttribute("aria-expanded", "false"); mark.setAttribute("aria-controls", "live-pane"); mark.setAttribute("data-state", "off");
var mDot = h("span", "lv-dot"), mBadge = h("span", "lv-badge", S.badge), mState = h("span", "sr-only");
mDot.setAttribute("aria-hidden", "true");
mark.appendChild(mDot); mark.appendChild(mBadge); mark.appendChild(mState);
var body = h("div", "lv-body");
var pNotice = h("p", "lv-notice", S.notice);
var pWin = h("p", "lv-small");
var pMsg = h("p", "lv-msg"); pMsg.setAttribute("role", "alert");
var pAddr = h("p", "lv-small"), addr = h("span", "lv-addr");
// つなげない文書：参加用のページ（新しいタブ。押すまで何も読み込まない。鍵は # の後ろ）。編集アプリのプレビューでは出さない
var JOIN_URL = CTX && LP.offerJoinLink(CTX, DOC) ? LP.joinUrl(live) : null;
var linkRow = h("div", "lv-row"), aJoin = h("a", "lv-join-link lv-pri", S.openJoin); linkRow.hidden = true;
if (JOIN_URL){ aJoin.href = JOIN_URL; aJoin.target = "_blank"; aJoin.rel = "noopener noreferrer"; aJoin.__egaOwn = true; linkRow.appendChild(aJoin); }
var bJoin = h("button", "lv-join lv-pri", S.join); bJoin.type = "button";
var joinRow = h("div", "lv-row"); joinRow.appendChild(bJoin);
var nameL = h("label", "", S.name), nameI = h("input"); nameI.type = "text"; nameI.className = "lv-name"; nameI.maxLength = LP.LIMITS.name; nameI.autocomplete = "off"; nameI.id = "live-pane-name"; nameL.htmlFor = nameI.id;
var nameNote = h("p", "lv-small", S.nameNote);
var polls = h("div", "lv-sec lv-polls");
var qa = h("div", "lv-sec lv-qa"), qaL = h("label", "", S.ask), qaT = h("textarea"), bSend = h("button", "lv-send lv-pri", S.send);
qaT.id = "live-pane-q"; qaL.htmlFor = qaT.id; qaT.maxLength = LP.LIMITS.question; bSend.type = "button";
var qaRow = h("div", "lv-row"); qaRow.appendChild(bSend);
qa.appendChild(qaL); qa.appendChild(qaT); qa.appendChild(qaRow);
var shownSec = h("div", "lv-sec lv-shown"), shownH = h("h3", "", S.shown), shownUl = h("ul");
shownSec.appendChild(shownH); shownSec.appendChild(shownUl);
var pPriv = h("p", "lv-small", S.privacy);
// 知らせる場所は板の外（たたんでいる間も読み上げる）
var sr = h("div", "sr-only"); sr.setAttribute("role", "status"); sr.setAttribute("aria-live", "polite"); sr.id = "live-pane-status";
[pNotice, pWin, pMsg, pAddr, linkRow, joinRow, nameL, nameI, nameNote, polls, qa, shownSec, pPriv].forEach(function(e){ body.appendChild(e); });
pane.appendChild(head); pane.appendChild(body);

var fmt = function(s){ try { return new Date(s).toLocaleString(JA ? "ja-JP" : "en-US", {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"}); } catch (e) { return s; } };
pWin.textContent = S.window(fmt(live.window.from), fmt(live.window.to));
function announce(t){ sr.textContent = ""; setTimeout(function(){ sr.textContent = t; }, 30); }

// ---------------------------------------------------------------- 開く・たたむ
// pinned：印から開いたか「開いたままにする」。auto：投票のある段階で開いた（その段階を離れるとたたむ）。dismissed：その段階で学ぶ人がたたんだ
var pinned = false, auto = false, dismissed = null;
function isOpen(){ return pinned || auto; }
// 投票で開くのは、窓の中で、ここからつなげるか「ブラウザで参加する」を出せるときだけ（編集アプリのプレビューでは開かない）。"*" の投票では開かない
function pollHere(){ return LP.activitiesFor(live, stepKey).some(function(x){ return x.step !== "*" && x.a.kind === "poll"; }); }
function autoWanted(){ return phase() === "open" && (!CTX || !!JOIN_URL) && pollHere() && dismissed !== stepKey; }
function focusIn(){ var a = document.activeElement; return !!(a && pane.contains(a)); }
function apply(wasOpen, how){
  var o = isOpen();
  if (o === wasOpen) { render(); return; }
  var back = !o && focusIn();
  layout(); render();
  if (back) mark.focus();
  if (o && how === "poll") announce(S.pollOpen);
  if (o && how === "mark"){
    var to = !qa.hidden ? qaT : !joinRow.hidden && !bJoin.disabled ? bJoin : JOIN_URL && !linkRow.hidden ? aJoin : bFold;
    try { to.focus({preventScroll: true}); } catch (e) {}
  }
}
function syncAuto(){ var was = isOpen(); auto = autoWanted(); apply(was, "poll"); }
function openPane(how){ var was = isOpen(); pinned = true; apply(was, how); }
function collapse(){ var was = isOpen(); pinned = false; auto = false; dismissed = stepKey; apply(was); }
mark.addEventListener("click", function(){ if (isOpen()) collapse(); else openPane("mark"); });
bFold.addEventListener("click", collapse);
bPin.addEventListener("click", function(){ var was = isOpen(); pinned = !pinned; if (!pinned) auto = autoWanted(); apply(was); });
pane.addEventListener("keydown", function(e){ if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey){ e.preventDefault(); e.stopPropagation(); collapse(); mark.focus(); } });

// ---------------------------------------------------------------- 舞台を板の外に収める（deck.js の fit と同じ式で、板を除いた広さに）。たたんでいる間は窓いっぱい（deck.js の fit と同じ）
var docked = null;
function layout(){
  var root = document.documentElement, W = window.innerWidth, H = window.innerHeight;
  var st = document.getElementById("stage"), open = isOpen();
  root.classList.toggle("lv-collapsed", !open);
  if (!open){
    root.classList.remove("lv-side", "lv-bottom");
    root.style.setProperty("--lv-w", "0px"); root.style.setProperty("--lv-h", "0px");
    docked = null;
    if (st){ st.style.left = st.style.top = ""; st.style.transform = "translate(-50%,-50%) scale(" + Math.min(W / 1280, H / 720) + ")"; }
    return;
  }
  var side = W / Math.max(1, H) >= 1.25 && W >= 760;
  var size = side ? Math.round(Math.min(360, Math.max(260, W * 0.26))) : Math.round(Math.min(320, Math.max(160, H * 0.4)));
  root.classList.toggle("lv-side", side); root.classList.toggle("lv-bottom", !side);
  root.style.setProperty("--lv-w", (side ? size : 0) + "px"); root.style.setProperty("--lv-h", (side ? 0 : size) + "px");
  docked = {side: side, size: size};
  var aw = side ? W - size : W, ah = side ? H : H - size;
  if (!st) return;
  var k = Math.min(aw / 1280, ah / 720);
  st.style.left = (aw / 2) + "px"; st.style.top = (ah / 2) + "px";
  st.style.transform = "translate(-50%,-50%) scale(" + k + ")";
}

// ---------------------------------------------------------------- 状態
var ST = "off", ws = null, attempt = 0, retryTimer = null, retryAt = 0, tickTimer = null, pingTimer = null, endTimer = null, startTimer = null;
var lastCode = 0, admitted = false, stepKey = "*", refN = 0, pending = {}, votes = {}, shownItems = [], nameSent = "", stopReason = "", left = false, info = "";
function setState(s, why){ ST = s; stopReason = why || ""; render(); }
function now(){ return Date.now(); }
function phase(){ var t = now(); if (t < LP.windowStart(live.window)) return "before"; if (t > LP.windowEnd(live.window)) return "after"; return "open"; }
function render(){
  var ph = phase(), conn = ST === "connected" || ST === "waiting";
  pane.setAttribute("data-state", ST);
  var label = ST === "connected" ? S.connected : ST === "waiting" ? S.waiting : ST === "connecting" ? S.connecting
    : ST === "retrying" ? S.retrying(Math.max(1, Math.ceil((retryAt - now()) / 1000))) : ST === "stopped" ? (S.stop[stopReason] || S.stop.unknown)
    : ph === "before" ? S.before(fmt(live.window.from)) : ph === "after" ? S.after : S.off;
  state.textContent = label; state.title = label;
  mark.setAttribute("data-state", ST); mark.setAttribute("aria-expanded", isOpen() ? "true" : "false");
  mState.textContent = (JA ? "：" : ": ") + label; mark.title = S.title + (JA ? "：" : ": ") + label;
  bPin.setAttribute("aria-pressed", pinned ? "true" : "false");
  bLeave.hidden = !(conn || ST === "connecting" || ST === "retrying");
  var canJoin = !CTX && ph === "open" && (ST === "off" || (ST === "stopped" && REJOIN[stopReason] === 1));
  joinRow.hidden = !!CTX || ph !== "open" || conn || ST === "connecting" || ST === "retrying" || (ST === "stopped" && REJOIN[stopReason] !== 1);
  bJoin.disabled = !canJoin;
  bJoin.textContent = ST === "stopped" ? S.again : S.join;
  pNotice.hidden = !!CTX;
  pAddr.hidden = !CTX;
  linkRow.hidden = !JOIN_URL;
  if (CTX && !pAddr.firstChild){
    if (JOIN_URL){ pAddr.textContent = S.noNetLink + " " + S.roomLabel; addr.textContent = live.room + " · " + S.joinTo + new URL(JOIN_URL).host; }
    else { pAddr.textContent = S.noNet; addr.textContent = live.endpoint + " · " + live.room; }
    pAddr.appendChild(addr);
  }
  pMsg.textContent = ST === "stopped" ? (S.stop[stopReason] || S.stop.unknown) : info;
  nameL.hidden = nameI.hidden = nameNote.hidden = !!CTX || ph !== "open";
  renderActivities(conn && admitted);
  shownSec.hidden = !(conn && shownItems.length);
  shownUl.textContent = "";
  shownItems.forEach(function(it){ if (it && typeof it.text === "string") shownUl.appendChild(h("li", "", it.text)); });
}
function current(kind){
  return LP.activitiesFor(live, stepKey).filter(function(x){ return x.a.kind === kind; });
}
function renderActivities(on){
  var qas = current("qa");
  qa.hidden = !on || !qas.length;
  bSend.disabled = !on;
  var want = on ? current("poll").filter(function(x){ return Array.isArray(x.a.choices); }) : [];
  var sig = want.map(function(x){ return x.step + "/" + x.a.id; }).join("|");
  if (polls.getAttribute("data-sig") === sig){ want.forEach(function(x){ var n = polls.querySelector('[data-poll="' + x.a.id + '"] .lv-note'); if (n) n.textContent = votes[x.a.id] && votes[x.a.id].ok ? S.voted + " · " + S.revote : ""; }); return; }
  polls.setAttribute("data-sig", sig);
  polls.textContent = "";
  want.forEach(function(x){
    var fs = h("fieldset"); fs.setAttribute("data-poll", x.a.id);
    fs.appendChild(h("legend", "", x.a.prompt));
    x.a.choices.forEach(function(c, j){
      var l = h("label"), r = h("input"); r.type = "radio"; r.name = "lv-poll-" + x.a.id; r.value = String(j);
      if (votes[x.a.id] && votes[x.a.id].choice === j) r.checked = true;
      l.appendChild(r); l.appendChild(h("span", "", c)); fs.appendChild(l);
    });
    var row = h("div", "lv-row"), b = h("button", "lv-vote", S.vote), note = h("span", "lv-note lv-small", votes[x.a.id] && votes[x.a.id].ok ? S.voted + " · " + S.revote : "");
    b.type = "button";
    b.addEventListener("click", function(){
      var sel = fs.querySelector("input:checked");
      if (!sel) return;
      vote(x, +sel.value);
    });
    row.appendChild(b); row.appendChild(note); fs.appendChild(row);
    polls.appendChild(fs);
  });
}

// ---------------------------------------------------------------- 通信
function send(o){
  if (!ws || ws.readyState !== 1) return false;
  try { ws.send(JSON.stringify(o)); return true; } catch (e) { return false; }
}
function nextRef(){ refN = (refN + 1) % 1e6; return "r" + refN; }
function ask(){
  var text = qaT.value.trim();
  if (!text){ info = S.err.empty_text; render(); return; }
  var a = current("qa")[0];
  if (!a) return;
  // "*" の Q&A：送るときに画面にある段階。段階に置いた Q&A：その段階
  var step = a.step === "*" ? (LP.RE.step.test(stepKey) ? stepKey : "*") : a.step;
  var ref = nextRef();
  if (send({v: 1, t: "ask", ref: ref, activity: a.a.id, step: step, text: text.slice(0, LP.LIMITS.question)})){ pending[ref] = {kind: "ask"}; bSend.disabled = true; }
}
function vote(x, choice){
  var ref = nextRef();
  if (send({v: 1, t: "vote", ref: ref, activity: x.a.id, step: x.step, choice: choice})){ pending[ref] = {kind: "vote", id: x.a.id, choice: choice}; votes[x.a.id] = {choice: choice, ok: false}; }
}
function sendName(){
  var n = nameI.value.trim().slice(0, LP.LIMITS.name);
  if (n === nameSent || (!n && !nameSent)) return;   // 入れたときだけ（消したときは空で消す）
  var ref = nextRef();
  if (send({v: 1, t: "name", ref: ref, name: n})){ pending[ref] = {kind: "name", name: n}; }
}
function onMessage(ev){
  if (typeof ev.data !== "string" || ev.data.length > 262144) return;
  var m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (!m || typeof m !== "object" || m.v !== 1 || typeof m.t !== "string") return;
  var items = function(l){ return Array.isArray(l) ? l.filter(function(x){ return x && typeof x.text === "string"; }).slice(0, 50) : []; };
  if (m.t === "welcome"){
    attempt = 0; admitted = m.status === "admitted"; shownItems = items(m.shown); info = "";
    setState(admitted ? "connected" : "waiting");
    announce(admitted ? S.connected : S.waiting);
    if (nameI.value.trim()) sendName();
  } else if (m.t === "admitted"){
    admitted = true; shownItems = items(m.shown); setState("connected"); announce(S.connected);
  } else if (m.t === "shown"){
    shownItems = items(m.items); render();
  } else if (m.t === "ack"){
    var p = typeof m.ref === "string" ? pending[m.ref] : null;
    if (!p) return;
    delete pending[m.ref];
    if (p.kind === "ask"){ qaT.value = ""; info = S.sent; announce(S.sent); }
    else if (p.kind === "vote"){ votes[p.id] = {choice: p.choice, ok: true}; info = ""; announce(S.voted); }
    else if (p.kind === "name"){ nameSent = p.name; }
    render();
  } else if (m.t === "error"){
    var q = typeof m.ref === "string" ? pending[m.ref] : null;
    if (q) delete pending[m.ref];
    var code = typeof m.code === "string" ? m.code : "";
    info = S.err[code] || S.err.other; announce(info); render();
  }
}
function clearTimers(){ clearTimeout(retryTimer); clearInterval(tickTimer); clearInterval(pingTimer); retryTimer = tickTimer = pingTimer = null; }
function connect(){
  clearTimers();
  if (CTX || left || phase() !== "open") { render(); return; }
  var url = LP.socketUrl(live, pid());
  if (!url || !LP.sameEndpoint(url, live.endpoint)){ setState("stopped", "bad_endpoint"); return; }
  var s;
  try { s = new WebSocket(url); } catch (e) { onClose({code: 1006}); return; }
  ws = s; admitted = false; pending = {};
  setState("connecting");
  s.onmessage = function(ev){ if (ws === s) onMessage(ev); };
  s.onopen = function(){ if (ws !== s) return; pingTimer = setInterval(function(){ send({v: 1, t: "ping"}); }, 45000); };
  s.onclose = function(ev){ if (ws !== s) return; ws = null; onClose(ev); };
  s.onerror = function(){};
  scheduleEnd();
}
function onClose(ev){
  clearTimers(); admitted = false;
  if (left) return;
  var code = ev && typeof ev.code === "number" ? ev.code : 1006;
  lastCode = code;
  var p = LP.plan(code, attempt, now(), live.window, Math.random());
  if (!p.retry){
    if (code === 4410 || p.reason === "window_over") setItem("sessionStorage", JOINED_KEY, null);
    setState("stopped", p.reason); announce(S.stop[p.reason] || S.stop.unknown); return;
  }
  attempt++;
  retryAt = now() + p.delayMs;
  setState("retrying");
  tickTimer = setInterval(render, 1000);
  retryTimer = setTimeout(connect, p.delayMs);
}
function scheduleEnd(){
  clearTimeout(endTimer);
  var ms = LP.windowEnd(live.window) - now();
  if (!(ms > 0)) return;
  endTimer = setTimeout(function(){
    clearTimers();
    if (ws){ var s = ws; ws = null; try { s.close(1000, "window"); } catch (e) {} }
    setItem("sessionStorage", JOINED_KEY, null);
    if (ST !== "off") setState("stopped", "window_over"); else render();
  }, Math.min(ms + 500, 2147483000));
}
function join(){
  if (CTX || phase() !== "open") return;
  left = false; attempt = 0; info = "";
  setItem("sessionStorage", JOINED_KEY, "1");
  connect();
}
function leave(){
  left = true; clearTimers();
  setItem("sessionStorage", JOINED_KEY, null);
  if (ws){ var s = ws; ws = null; try { s.close(1000, "bye"); } catch (e) {} }
  admitted = false; info = S.leftMsg; setState("off"); announce(S.leftMsg);
}
bJoin.addEventListener("click", join);
bLeave.addEventListener("click", leave);
bSend.addEventListener("click", ask);
qaT.addEventListener("keydown", function(e){ if (e.key === "Enter" && (e.metaKey || e.ctrlKey)){ e.preventDefault(); ask(); } });
nameI.addEventListener("change", sendName);

// ---------------------------------------------------------------- 起動（deck.js が舞台を作った後）
document.addEventListener("deck:pos", function(e){
  var k = e.detail && e.detail.key;
  if (typeof k === "string" && k !== stepKey){ stepKey = k; dismissed = null; if (pane.parentNode) syncAuto(); else render(); }
});
function start(){
  document.head.appendChild(css);
  document.body.appendChild(mark);
  document.body.appendChild(pane);
  document.body.appendChild(sr);
  layout();
  window.addEventListener("resize", layout);
  syncAuto();
  // 窓が開く時刻に、もう一度描く（通信はしない）
  var ms = LP.windowStart(live.window) - now();
  if (ms > 0) startTimer = setTimeout(function(){ syncAuto(); render(); scheduleEnd(); }, Math.min(ms + 200, 2147483000));
  scheduleEnd();
  // このタブで参加したことがあれば（読み直しなど）、窓の中なら押さずにつなぐ
  if (!CTX && phase() === "open" && getItem("sessionStorage", JOINED_KEY) === "1") join();
}
DECK.live = {state: function(){ return {state: ST, reason: stopReason, code: lastCode, retryIn: ST === "retrying" ? retryAt - now() : null, context: CTX, joinLink: !!JOIN_URL, admitted: admitted, step: stepKey, attempt: attempt, open: isOpen(), pinned: pinned, auto: auto}; }};
if (DECK.ready) start(); else document.addEventListener("deck:ready", start, {once: true});
})();
