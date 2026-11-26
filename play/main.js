// Egatari Viewer (viewer.egatari.org): open an Egatari file (.ega.html) on this device and play it (docs/viewer.md).
// - The file is read in this page and never uploaded. It plays in a sandboxed frame with an opaque origin (play/frame.mjs).
// - Recent files stay on this device (play/recents.mjs). Android shares arrive through the service worker (play/sw.js).
// - Live is held by this page, not by the lesson (play/live-host.mjs). Links the lesson asks to open go through the
//   link rule in this page's chrome (play/links.mjs).
// - The page refuses to run inside a frame (play/guard.js, and the server's frame-ancestors 'none').
import { WORDS, initialLang, saveLang, apply } from './i18n.mjs';
import { lessonDocument, makeFrame } from './frame.mjs';
import { openRecents } from './recents.mjs';
import * as resume from './resume.mjs';
import * as prefs from './prefs.mjs';
import { startLive } from './live-host.mjs';
import { computeLayout, isPhoneLandscape } from './layout.mjs';
import { linkBox } from './links.mjs';
import { markup, clearAllRecords, countRecords } from './markup.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { readFileBounded } from '../app/bounded-read.js';
import { sha256Hex } from './markup.mjs';
import { ink, countInk, clearInk, inkOf, addInk, W as INK_W, H as INK_H, MEMO_H as INK_MEMO, GAP as INK_GAP } from './ink.mjs';
import { noteEditor } from './notes.mjs';
import { exchangeOf, readExchange, markdownOf, fileName } from './notes-export.mjs';

/* global __PLAY_VERSION__, __PLAY_LIVE__, __PLAY_DEV__, __LESSON_SHIM__, __PRINT_SHIM__ */
const VERSION = __PLAY_VERSION__;
const LIVE_ALLOWED = new Set(__PLAY_LIVE__);
const LP = LivePolicy({ allowLoopback: __PLAY_DEV__ === true });
const MAX_BYTES = 100 * 1024 * 1024;   // spec §11's recommended file limit
// 「共有の端末」 (Shared device) when the viewer has not chosen: false keeps recent files (up to 10, play/recents.mjs MAX).
// The owner has not decided the default yet; flip this one constant to make shared-device mode the default.
const SHARED_DEVICE_DEFAULT = false;

const $ = (id) => document.getElementById(id);
const framed = document.documentElement.hasAttribute('data-framed');
let lang = initialLang();
const W = () => WORDS[lang];

const S = { playing: null, opening: 0, frame: null, live: null, recents: null, doc: null, title: '', layout: null, layoutKey: '', hasPolls: false };
const sr = $('sr');
function announce(t) { sr.textContent = ''; setTimeout(() => { sr.textContent = t; }, 30); }
function showMsg(t) { $('msg').textContent = t || ''; }

// ---------------------------------------------------------------- language
function setLang(l) {
  lang = l; saveLang(l); apply(l);
  $('b-lang').textContent = l === 'ja' ? 'English' : '日本語';
  $('b-lang').lang = l === 'ja' ? 'en' : 'ja';
  $('player').setAttribute('aria-label', W().lessonFrame);
  if (S.playing) $('lesson-kind').textContent = S.playing.kind === 'editable' ? W().kindEditable : W().kindPlayOnly;
  renderCredit();
  renderRecents();
  renderInstallHint();
  if (M) M.setWords(W);
  if (INK.ui) INK.ui.relabel();
  // the open notes: their labels and placeholders in the new language (what is typed is saved first)
  if (NOTE.ed && NOTE.ed.at && M) NOTE.ed.show(NOTE.ed.at, (NOTE.ed.flush(), M.getNote(NOTE.ed.at)), slideLabel(NOTE.ed.at.slide));
  if (PANEL.ed && PANEL.at && M) { const t = W().nSectionLabel(M.sections()[PANEL.at.section] || ''); $('note-panel-t').textContent = t; PANEL.ed.show(PANEL.at, (PANEL.ed.flush(), M.getNote(PANEL.at)), t); }
}

// ---------------------------------------------------------------- reading a file (in a Worker: play/reader-worker.mjs)
let reader = null, readSeq = 0;
const waiting = new Map();
function getReader() {
  if (reader) return reader;
  reader = new Worker('./reader.js', { name: 'lesson-reader' });
  reader.onmessage = (e) => { const m = e.data || {}; const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.result); } };
  reader.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); for (const w of waiting.values()) w({ ok: false, error: 'parse' }); waiting.clear(); reader.terminate(); reader = null; };
  return reader;
}
function scan(text) { return new Promise((res) => { const id = ++readSeq; waiting.set(id, res); getReader().postMessage({ id, text }); }); }

// S.opening counts the files being read and checked. Meanwhile the Viewer counts as playing: no new version takes over (initSW below).
// Only S.playing (set once the check is done) was looked at before, so a takeover between choosing a file and its start reloaded the page and the file was gone
async function openFile(blob, name, opts = {}) {
  S.opening++;
  try { return await openChecked(blob, name, opts); } finally { S.opening--; }
}
async function openChecked(blob, name, opts) {
  showMsg('');
  if (!blob || typeof blob.size !== 'number') { showMsg(W().errRead); return false; }
  if (blob.size > MAX_BYTES) { showMsg(W().errTooLarge(MAX_BYTES / 1024 / 1024)); return false; }
  announce(W().reading);
  let text;
  // the bytes are read once, through the bounded reader: the text to play, and the file's SHA-256 for the markup record (madeOn)
  let fileSha = Promise.resolve('');
  try { const bytes = await readFileBounded(blob, { max: MAX_BYTES, what: 'lesson' }); text = new TextDecoder().decode(bytes); fileSha = sha256Hex(bytes); } catch (e) { showMsg(e && e.code === 'read-over' ? W().errTooLarge(MAX_BYTES / 1024 / 1024) : W().errRead); return false; }
  const r = await scan(text);
  if (!r || !r.ok) { showMsg(r && r.error === 'not-egatari' ? W().errNotEgatari : W().errParse); return false; }
  const info = { name: String(name || 'lesson.ega.html').slice(0, 300), title: r.meta.title, kind: r.kind, docId: r.meta.docId };
  if (opts.recentId) { try { await S.recents.touch(opts.recentId); } catch { /* keep playing */ } }
  else if ($('keep').checked && !$('shared').checked && S.recents && S.recents.kind !== 'none') {
    try { await S.recents.add(blob, info); maybeRequestPersist(); } catch { /* storage full or blocked: still play */ }
  }
  play(text, r, info, fileSha);
  return true;
}

// ---------------------------------------------------------------- playing
// A lesson with Live starts on a start screen (Join, or 「参加しないで見る」) and the frame is placed only after that, so the Join
// tap can never meet the lesson's frame. Then the layout is chosen once from the lesson's activities and the screen
// (play/layout.mjs) and kept while the lesson plays; only a rotation (or a window resize) lays it out again.
function play(text, r, info, fileSha = Promise.resolve('')) {
  closeLesson(true);
  const live = r.live && LP.validate(r.live, { key: true }).length === 0 ? r.live : null;
  const title = r.meta.title || info.name;
  S.playing = { kind: r.kind, title, live: !!live, liveFrom: r.liveFrom, keyless: !!r.live && !live, docId: r.meta.docId, sourceSha256: r.meta.sourceSha256 || '', fileSha, started: false, credits: r.meta.credits || null, lang: r.meta.lang || '' };
  S.doc = lessonDocument(text, { shim: __LESSON_SHIM__, hideLive: !!r.live });
  S.playing.text = text;   // for the frame that prints the notes (printNotes)
  S.title = title;
  document.body.classList.add('playing');
  $('start').hidden = true;
  $('player').hidden = false;
  $('lesson-info').hidden = false;
  $('lesson-title').textContent = title;
  $('lesson-title').lang = r.meta.lang || '';
  $('lesson-kind').textContent = r.kind === 'editable' ? W().kindEditable : W().kindPlayOnly;
  renderCredit();
  $('b-close').hidden = false;
  if (!(history.state && history.state.egaViewer)) history.pushState({ egaViewer: 1 }, '');
  if (!live) { startFrame(); return; }
  S.live = startLive({ live, words: W(), lang, allowed: LIVE_ALLOWED, policy: LP, announce, onOpen: onLive, el: liveEls() });
  S.hasPolls = S.live.hasPolls;
  showLiveStart();
}
function showLiveStart() {
  const L = S.live, st = L.state();
  $('live-start').hidden = false;
  $('live-start-notice').textContent = st.direct ? W().notice(L.host) : W().noDirect(L.host);
  $('live-start-window').textContent = $('live-window').textContent;
  const ph = L.phase();
  $('live-start-state').textContent = ph === 'before' || ph === 'after' ? $('live-state').textContent : '';
  $('b-start-join').hidden = !st.direct;
  $('b-start-join').disabled = !L.canJoin();
  $('a-start-join').hidden = !L.joinUrl || ph !== 'open';
  if (L.joinUrl) $('a-start-join').href = L.joinUrl;
  $('live-dest').textContent = W().dest(L.joinUrl ? new URL(L.joinUrl).host : L.host);
  const first = !$('b-start-join').hidden && !$('b-start-join').disabled ? $('b-start-join') : $('b-watch');
  first.focus();
}
function startFrame() {
  if (!S.playing || S.frame) return;
  $('live-start').hidden = true;
  S.playing.started = true;
  S.frame = makeFrame(S.doc, S.title);
  $('b-ink').hidden = !!(S.playing && S.playing.live);
  $('b-note').hidden = !!(S.playing && S.playing.live);
  S.doc = null;
  applyLayout();                       // everything around the frame is placed first
  $('stage-wrap').appendChild(S.frame);
  const f = S.frame;
  // markup (play/markup.mjs): the docId is the one read from this file, never one from the frame
  M.open({ frame: f, docId: S.playing.docId, sourceSha256: S.playing.sourceSha256, fileSha: S.playing.fileSha, shared: $('shared').checked });
  try { f.focus(); } catch { /* not focusable yet */ }
  // Chrome gives the focus to the frame's first, empty document and keeps the keys in this page once the lesson replaces it;
  // so focus it again when the lesson has loaded, unless the viewer has meanwhile moved the focus elsewhere in this page.
  // Safari may refuse either; the keys pressed in this page are handed over anyway (forwardKey)
  f.addEventListener('load', () => {
    fsState();                         // the lesson learns whether fullscreen is available (play/lesson-shim.js 4)
    const a = document.activeElement;
    if (S.frame !== f || (a && a !== document.body && a !== f)) return;
    try { f.contentWindow.focus(); } catch { /* refused */ }
  }, { once: true });
}
// Fullscreen for the lesson. The frame has no fullscreen permission (play/frame.mjs: a lesson cannot take the screen by itself),
// and Safari ignores allow="fullscreen" on an opaque-origin srcdoc frame anyway. The lesson's shim asks {egaViewer: "fullscreen", on}
// (play/lesson-shim.js 4, on the player's 全画面 button or f); this page puts the frame element itself into fullscreen, which the
// browser allows only on the viewer's own activation (it reaches this page from the tap in the frame), and reports the state back
// {egaViewer: "fullscreen-state", on, enabled, refused?}, also when the viewer leaves with Esc or the system's gesture.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function fsEnabled() {
  const f = S.frame;
  if (!f || !(f.requestFullscreen || f.webkitRequestFullscreen)) return false;   // iPhone Safari: no element fullscreen
  const en = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  return en !== false;
}
function fsState(refused) {
  const f = S.frame;
  if (!f || !f.contentWindow) return;
  const m = { egaViewer: 'fullscreen-state', on: fsElement() === f, enabled: fsEnabled() };
  if (refused) m.refused = true;
  f.contentWindow.postMessage(m, '*');
}
function fsRequest(on) {
  const f = S.frame;
  if (!f) return;
  if (on === (fsElement() === f)) { fsState(); return; }
  if (on) {
    const go = f.requestFullscreen || f.webkitRequestFullscreen;
    if (!go || !fsEnabled()) { fsState(true); return; }
    let p;
    try { p = go.call(f); } catch { fsState(true); return; }
    if (p && typeof p.then === 'function') p.then(() => { try { f.contentWindow.focus(); } catch { /* refused */ } }, () => fsState(true));
    else fsNoPromise = true;   // an old Safari returns nothing: webkitfullscreenchange or webkitfullscreenerror follows
    return;
  }
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  try { const p = ex && ex.call(document); if (p && typeof p.catch === 'function') p.catch(() => fsState()); } catch { fsState(); }
}
let fsNoPromise = false;
for (const t of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(t, () => { fsNoPromise = false; fsState(); });
for (const t of ['fullscreenerror', 'webkitfullscreenerror']) document.addEventListener(t, () => { if (fsNoPromise) { fsNoPromise = false; fsState(true); } });

// The navigation keys (arrows, PageUp/PageDown, Home/End, Space) pressed while the focus is in this page, not in the lesson's
// frame (its bar or buttons, the Live pane, or a frame that never got the focus): handed to the lesson, which presses them as
// its own buttons do (play/lesson-shim.js). Not from a field, a widget that uses arrows, or the link box; Space not on a
// button or link, which it presses. Keys pressed in the frame never reach this page.
const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const ARROW_WIDGET = '[role=radiogroup],[role=listbox],[role=menu],[role=menubar],[role=tablist],[role=slider],[role=grid],[role=tree],dialog';
// m in this page (not in a field): the memo view (handoff #107). The same key pressed in the lesson comes as {egaViewer: "note-key"}
function noteKey(e) {
  if (e.key !== 'm' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.isComposing || !S.frame || $('b-note').hidden) return false;
  const t = e.target;
  if (t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('dialog'))) return false;
  e.preventDefault(); toggleNote(); return true;
}
function forwardKey(e) {
  if (noteKey(e)) return;
  const f = S.frame;
  if (!f || !f.contentWindow || !NAV_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.isComposing) return;
  if ($('link-box').open) return;
  const t = e.target;
  if (t && t.nodeType === 1) {
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest(ARROW_WIDGET)) return;
    if (e.key === ' ' && t.closest('button, a[href], summary, label, [role=button]')) return;
  }
  e.preventDefault();
  f.contentWindow.postMessage({ egaViewer: 'key', key: e.key, shift: e.shiftKey }, '*');
}
// the no-slack variant for phones in landscape on 16:9 screens (play/layout.mjs). The owner chose 'overlay' (the full screen for the
// slide); 'strip' is the alternative. ?noslack=strip or ?noslack=overlay switches it for measuring (docs/viewer.md).
// The overlay is safe only because its indicator is always shown over the frame's top edge from the moment the frame is placed,
// and is never toggled (hidden, then shown) over the frame: taps were lost exactly when page chrome switched from hidden to shown
// over the out-of-process frame. Any change to that (hiding the indicator, a sheet that appears where nothing was) must be
// measured again with tools/play-tap-measure.mjs
const NO_SLACK_VARIANT = 'overlay';
const variant = () => { const q = new URLSearchParams(location.search).get('noslack'); return q === 'overlay' || q === 'strip' ? q : NO_SLACK_VARIANT; };
// The visible size. On iPadOS the Home Screen app keeps innerHeight (and the page's own height) from before a rotation for a moment,
// above all when the status bar was shown in portrait; visualViewport follows the screen. The page itself never scrolls while playing
// (play.css body.playing), and is put back at the top in case it scrolled before.
// While a text field has the focus the on-screen keyboard shrinks visualViewport, so the frame keeps innerHeight then.
// The page's own height is that same visible height (--view-h on <html>, read by play.css body.playing), not 100dvh: in Chrome on
// iPad, 100dvh can stay at the portrait height after a rotation, and the frame (the player's height) then ran below the screen, with
// a dark band above a slide cut at the bottom, and a page that scrolled and was put back at the top on every resize (handoff #18).
const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
const viewSize = () => { const v = typing() ? null : window.visualViewport; return { vw: Math.round(v ? v.width : window.innerWidth), vh: Math.round(v ? v.height : window.innerHeight) }; };
function applyLayout() {
  const live = !!(S.playing && S.playing.live);
  const { vw, vh } = viewSize();
  document.documentElement.style.setProperty('--view-h', vh + 'px');
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  const headless = live && isPhoneLandscape(vw, vh);
  document.body.classList.toggle('headless', headless);
  const P = $('player').getBoundingClientRect();
  const L = computeLayout({ w: vw, h: vh, headerH: vh - P.height, live, polls: S.hasPolls, variant: variant() });
  S.layout = L;
  const place = (el, q) => { el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; el.style.width = q.w + 'px'; el.style.height = q.h + 'px'; };
  if (!$('note-panel').hidden) {
    const ph = Math.max(160, Math.round(L.frame.h * 0.4));
    L.frame = { ...L.frame, h: Math.max(120, L.frame.h - ph) };
    place($('note-panel'), { x: L.frame.x, y: L.frame.y + L.frame.h, w: L.frame.w, h: ph });
  }
  place($('stage-wrap'), L.frame);
  if (NOTE.view && L.mode === 'none') memoLayout(L, place);
  $('player').setAttribute('data-mode', L.mode);
  $('b-live').hidden = !live || headless;
  if (L.live) { place($('live'), L.live); $('live').hidden = false; } else $('live').hidden = true;
  $('live').setAttribute('data-mode', L.mode);
  setPollView(false);
  S.layoutKey = layoutKey();
}
const layoutKey = () => { const { vw, vh } = viewSize(); return `${vw > vh ? 'l' : 'p'}${isPhoneLandscape(vw, vh) ? 'h' : ''}`; };
// rotation: lay out again at once, and again once it settles (the size reported first can still be the old one); any other resize
// (a desktop window, the status bar shown or hidden): once it settles
let resizeTimer = null, settleTimer = null;
function onResize() {
  if (!S.frame) return;
  clearTimeout(resizeTimer);
  if (layoutKey() !== S.layoutKey) {
    applyLayout();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { if (S.frame) applyLayout(); }, 600);
  } else resizeTimer = setTimeout(() => { if (S.frame) applyLayout(); }, 250);
}
// the poll view in the compact modes (slack, strip, overlay, bar): the strip's content changes, the frame does not
function setPollView(open) {
  const compact = S.layout && ['slack', 'strip', 'overlay', 'bar'].includes(S.layout.mode);
  const o = !!open && compact;
  $('live').classList.toggle('poll-open', o);
  $('b-poll').setAttribute('aria-expanded', o ? 'true' : 'false');
  if (o) { const first = $('live-polls').querySelector('input, button'); if (first) first.focus(); }
}
function onLive(kind, n) {
  if (kind === 'polls' && n === 0) setPollView(false);
}
// ---------------------------------------------------------------- credits (spec §3.6.1 edits, §7.3)
// When the lesson records edits, a line under the title says who created it and the most recent edit
// (「作成：A ／ 編集：B ほか n 件」); pressing it lists them all. The Viewer reads them from deck-meta (play/scan.mjs),
// so they show whatever player the file carries: a tier A save adds edits but keeps the file's player, which may not show them.
function renderCredit() {
  const b = $('lesson-credit'), c = S.playing && S.playing.credits;
  if (!c || !c.edits.length) { b.hidden = true; b.textContent = ''; if ($('cred-box').open) $('cred-box').close(); return; }
  const last = c.edits[c.edits.length - 1];
  // 「作成：…」と「編集：…」はそれぞれ 1 つのまとまりで折り返す（狭い画面で「編／集」と切れないように）
  const part = (t) => { const s = document.createElement('span'); s.className = 'cred-part'; s.textContent = t; return s; };
  b.replaceChildren(...(c.creators.length ? [part(W().credLineCreated(c.creators.join(W().credJoin))), W().credLineSep] : []), part(W().credLineEdited(last.by, c.edits.length - 1)));
  b.title = W().credOpenHint;
  b.setAttribute('aria-haspopup', 'dialog');
  b.hidden = false;
  if ($('cred-box').open) fillCredits();
}
function fillCredits() {
  const c = S.playing.credits, w = W(), dl = $('cred-list');
  $('cred-lesson').textContent = S.playing.title; $('cred-lesson').lang = S.playing.lang;
  dl.replaceChildren();
  const row = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); };
  if (c.creators.length) row(w.credCreated, c.creators.join(w.credJoin));
  for (const e of c.edits) row(e.by ? w.credEdited : w.credEditedNoBy, (e.by || w.credNoBy) + (e.note ? (lang === 'ja' ? `（${e.note}）` : ` (${e.note})`) : ''));
  if (c.copyright) row(w.credCopyright, c.copyright);
  row(w.credLicense, c.license || w.credLicenseNone);
}
function openCredits() { fillCredits(); $('cred-box').showModal(); $('b-cred-close').focus(); }
// ---------------------------------------------------------------- the memo view: notes and handwriting (handoff #27, #107; play/ink.mjs, play/notes.mjs)
// 「メモ」 and 「手書き」: the frame shrinks to the slide's height and a memo area appears below the slide. The slide (1280×720) and the
// memo area are one surface in stage units: the typed note of this slide is laid out in the memo area at a size in stage units, so
// its lines break at the same words on every screen and handwriting over it (an arrow from a word up into the slide) stays where it
// was drawn. 「メモ」 alone: the note can be typed, and the handwriting is shown. 「手書き」: the pen draws over both (the note cannot
// be typed then). On a screen narrower than NARROW the memo area keeps the page's own text size (no handwriting there).
// Only in the player's slides view: turning it on asks the player for that view, and choosing the book or 「スライドと本」 in the
// player closes it (play/lesson-shim.js 6; the owner's iPad check 11/20: the strokes lay off the shrunk slide and over the book).
// Not for lessons with a Live (the Live pane needs the room). Notes and handwriting are kept per lesson (its docId, or the file's
// SHA-256 when it has none) and slide key, on this device only; nothing is kept on a shared device. The memo area takes the slide's
// background, which the lesson's shim reports on request (play/lesson-shim.js 5): untrusted, so only three whole numbers 0–255 are taken.
const INK = { on: false, ui: null };
const NOTE = { view: false, byInk: false, ed: null, bg: [255, 255, 255], narrow: false };
const NARROW = 600, NOTE_FONT = 26;
const inkDoc = () => (S.playing.docId ? 'doc:' + S.playing.docId : 'file:' + S.playing.fileSha);
// the slides: the player's timeline (ready), or, when the player gave none, the list the markup script finds in the frame
const slideKeys = () => { const P = S.playing; if (P && P.timeline && P.timeline.length) return [...new Set(P.timeline.map((x) => x.s))]; return M ? M.frameSlides().map((x) => x.key) : []; };
function slideTitle(key) { const P = S.playing, t = P && P.timeline ? P.timeline.find((x) => x.s === key) : null; if (t) return t.title; const f = M ? M.frameSlides().find((x) => x.key === key) : null; return f ? f.title : ''; }
function slideNo(key) { return slideKeys().indexOf(key) + 1; }
function slideLabel(key) { const n = slideNo(key), t = slideTitle(key); return W().nSlideLabel(n, t); }
function inkPage(slideKey) {
  if (!NOTE.view) return;
  if (INK.ui) INK.ui.setPage(inkDoc(), slideKey);
  if (NOTE.ed && M && (!NOTE.ed.at || NOTE.ed.at.slide !== slideKey)) NOTE.ed.show({ slide: slideKey }, M.getNote({ slide: slideKey }), slideLabel(slideKey));
  if (S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage({ egaViewer: 'ink-bg' }, '*');
}
const rgbOk = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
function setMemoBackground(rgb) {
  NOTE.bg = rgb;
  const a = $('note-area'), dark = toneDark(rgb);
  a.style.background = `rgb(${rgb.join(',')})`;
  a.classList.toggle('dark', dark);
  if (INK.ui) INK.ui.setBackground(rgb);
}
function toneDark(rgb) {
  const l = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] < 0.25;
}
function memoLayout(L, place) {
  const ratio = (INK_H + INK_MEMO) / INK_W, barH = INK.on ? 52 : 0;
  const sw = Math.floor(Math.min(L.frame.w, (L.frame.h - barH) / ratio)), sh = Math.round(sw * INK_H / INK_W);
  place($('stage-wrap'), { x: L.frame.x, y: L.frame.y, w: L.frame.w, h: sh });
  const r = { x: L.frame.x + Math.round((L.frame.w - sw) / 2), y: L.frame.y, w: sw, h: Math.round(sw * ratio) };
  const k = sw / INK_W, a = $('note-area');
  NOTE.narrow = sw < NARROW;
  a.classList.toggle('narrow', NOTE.narrow); document.body.classList.toggle('note-narrow', NOTE.narrow);
  // the memo area: below the slide and its gap, in stage units scaled to the slide (or, narrow, in page units with the page's text size)
  const top = r.y + Math.round((INK_H + INK_GAP) * k), h = r.y + r.h - top;
  if (NOTE.narrow) Object.assign(a.style, { left: r.x + 'px', top: top + 'px', width: sw + 'px', height: (L.frame.y + L.frame.h - barH - top) + 'px', transform: '', fontSize: '' });
  else Object.assign(a.style, { left: r.x + 'px', top: top + 'px', width: INK_W + 'px', height: Math.round(h / k) + 'px', transform: `scale(${k})`, fontSize: NOTE_FONT + 'px' });
  if (INK.ui) {
    INK.ui.place(r);
    Object.assign(INK.ui.barEl.style, { left: '50%', top: (r.y + r.h + 4) + 'px' });
  }
}
function askSlidesView() { if (S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage({ egatari: 'layout', layout: 'slides' }, '*'); }
function newInk() {
  INK.ui = ink({ root: $('player'), words: W, shared: () => $('shared').checked,
    send: (key, shift) => { if (S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage({ egaViewer: 'key', key, shift: !!shift }, '*'); } });
  INK.ui.setBackground(NOTE.bg);
  INK.ui.setActive(INK.on);
}
// 「メモ」 (or m): with the slides on screen, the slide's memo area; with the book on screen (the player's book or 「スライドと本」
// view), the note of the section being read, below the frame (it does not switch the view back to the slides)
function toggleNote() {
  if (NOTE.view) { setNoteView(false); return; }
  if (PANEL.at) { closeSection(); return; }
  if (M && (S.deckLayout === 'book' || S.deckLayout === 'split')) { M.noteHere(); return; }
  setNoteView(true);
}
function setNoteView(on) {
  if (on === NOTE.view || (on && (!M || !S.frame))) return;
  NOTE.view = on;
  $('b-note').setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('noting', on);
  const a = $('note-area');
  if (on) {
    a.hidden = false;
    NOTE.ed = noteEditor({ root: a, words: W, onSave: (at, blocks) => M.setNote(at, blocks), onGo: goQuote, onEscape: () => $('b-note').focus(),
      placeholder: () => ($('shared').checked ? W().nShared : W().nPlaceholder) });
    newInk();   // the handwriting of this slide is shown with the note; 「手書き」 lets the pen draw
    if (S.slideKey) inkPage(S.slideKey);
    askSlidesView();
  } else {
    if (INK.on) setInk(false, true);
    if (INK.ui) { INK.ui.destroy(); INK.ui = null; }
    if (NOTE.ed) { NOTE.ed.clear(); NOTE.ed = null; }
    a.replaceChildren(); a.hidden = true; document.body.classList.remove('note-narrow');
  }
  applyLayout();
}
// 「手書き」 opens the memo view when it was closed, and closes it again when it ends
function setInk(on, keepView) {
  if (on === INK.on) return;
  INK.on = on;
  $('b-ink').setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('inking', on);
  if (on && !NOTE.view) { setNoteView(true); NOTE.byInk = true; }
  if (INK.ui) INK.ui.setActive(on);
  if (NOTE.ed) { NOTE.ed.flush(); NOTE.ed.setReadOnly(on); }
  if (!on && NOTE.byInk) { NOTE.byInk = false; if (!keepView) { setNoteView(false); return; } }
  applyLayout();
}
// the note of a section of the book: in this page, below the lesson's frame (the frame gives it room: no sheet over the frame), with
// the page's own text size. Its words never go into the frame (annotations.md, Note record)
const PANEL = { at: null, ed: null };
function openSection(section) {
  if (!M || !S.frame || S.playing.live) return null;
  if (NOTE.view) setNoteView(false);
  const p = $('note-panel'), title = M.sections()[section] || '';
  if (!PANEL.ed) PANEL.ed = noteEditor({ root: $('note-panel-body'), words: W, onSave: (at, blocks) => M.setNote(at, blocks), onGo: goQuote, onEscape: closeSection, placeholder: () => W().nPlaceholderSection });
  PANEL.at = { section };
  $('note-panel-t').textContent = W().nSectionLabel(title);
  $('note-panel-shared').hidden = !$('shared').checked;
  PANEL.ed.show(PANEL.at, M.getNote(PANEL.at), W().nSectionLabel(title));
  const was = !p.hidden;
  p.hidden = false;
  if (!was) applyLayout();
  return PANEL.ed;
}
function closeSection() {
  const p = $('note-panel');
  if (p.hidden) return;
  if (PANEL.ed) PANEL.ed.flush();
  p.hidden = true; PANEL.at = null;
  applyLayout();
  try { S.frame.focus(); } catch { /* gone */ }
}
// 「メモ」 in the small window: the quote goes into the note of its slide (the memo view opens) or of its section (the panel opens)
function onQuote(at, block) {
  let ed = null;
  if (at.slide != null) { if (!NOTE.view) setNoteView(true); ed = NOTE.ed && NOTE.ed.at && NOTE.ed.at.slide === at.slide ? NOTE.ed : null; }
  else ed = openSection(at.section);
  if (ed) ed.addQuote(block);
  else M.setNote(at, [...M.getNote(at), block]);   // not on screen (the slide moved on): kept all the same
  announce(W().nQuoted);
}
// a note from the list: a slide's opens the memo view on that slide, a section's opens the panel
function openNote(at) {
  if (at.slide != null) {
    const P = S.playing, first = P && P.timeline ? P.timeline.find((x) => x.s === at.slide) : null;
    if (first && at.slide !== S.slideKey) seekTo(first.s, first.k);
    if (!NOTE.view) setNoteView(true);
    setTimeout(() => { if (NOTE.ed) NOTE.ed.focus(); }, 300);
  } else { const ed = openSection(at.section); if (ed) ed.focus(); }
}
// ---------------------------------------------------------------- export and read in (handoff #107, annotations.md "Exchange file")
// From the markup bar's 「エクスポート」: PDF (play/notes-print.mjs), Markdown, and the backup (.ega-notes.json: highlights, notes and
// handwriting). The files are made in this page and saved by the browser (a download): nothing is sent anywhere.
function saveFile(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $('x-status').textContent = W().xSaved(name);
}
const slideList = () => slideKeys().map((k, i) => ({ key: k, name: W().nSlideName(i + 1, slideTitle(k)) }));
async function exportAs(kind) {
  const st = M && M.state(), rec = st && st.record, P = S.playing;
  if (!rec || !P) return;
  if (NOTE.ed) NOTE.ed.flush(); if (PANEL.ed) PANEL.ed.flush();
  if (INK.ui) await INK.ui.flush();
  const ink = $('shared').checked ? [] : await inkOf(inkDoc());
  if (kind === 'md') saveFile(fileName(P.title, 'md', new Date(), W()), 'text/markdown;charset=utf-8',
    markdownOf({ title: P.title, record: M.state().record, slides: slideList(), sections: M.sections(), words: W(), inkSlides: ink.map((x) => x.slide) }));
  else if (kind === 'json') saveFile(fileName(P.title, 'exchange', new Date(), W()), 'application/json',
    JSON.stringify(exchangeOf({ record: M.state().record, docId: P.docId || '', fileSha256: await P.fileSha, ink }), null, 1));
}
async function importFile(file) {
  const P = S.playing, st = $('x-status');
  if (!P || !M || !file) return;
  if (file.size > 20 * 1024 * 1024) { st.textContent = W().xTooBig; return; }
  let j = null;
  try { j = JSON.parse(await file.text()); } catch { j = null; }
  const r = readExchange(j, { docId: P.docId || '', fileSha256: await P.fileSha });
  if (!r.ok) { st.textContent = r.why === 'other' ? W().xOtherFile : W().xBadFile; return; }
  if (NOTE.ed) NOTE.ed.flush(); if (PANEL.ed) PANEL.ed.flush();
  const n = M.importRecord(r) || { highlights: 0, notes: 0 };
  const k = $('shared').checked ? 0 : await addInk(inkDoc(), r.ink);
  // what is on screen shows what was read in
  if (NOTE.view && S.slideKey) { if (NOTE.ed) NOTE.ed.show({ slide: S.slideKey }, M.getNote({ slide: S.slideKey }), slideLabel(S.slideKey)); if (INK.ui) { INK.ui.destroy(); INK.ui = null; newInk(); INK.ui.setPage(inkDoc(), S.slideKey); applyLayout(); } }
  if (PANEL.at && PANEL.ed) PANEL.ed.show(PANEL.at, M.getNote(PANEL.at), $('note-panel-t').textContent);
  st.textContent = W().xRead(n.highlights, n.notes, k);
  announce(st.textContent);
}
// PDF (handoff #107, standards 11/27): only the page prints (on an iPad, print() in a frame prints the whole page). A frame with the
// lesson again (play/print-frame.js; sandbox "allow-scripts" like the playing frame, connect-src 'none') lays out the slides; the
// notes and the handwriting never go into it: the page draws them in #print-root, shown only in print, and calls print() itself.
// Two ways to show the slides, both tried on a real iPad (the one that prints stays):
//   A ('stack'): that one frame, the slides one under another, one A4 page apart; the page lays its memo areas over it
//   B ('snap'): that frame makes a still copy of each slide; the page checks it and shows it in a frame with sandbox="" (no scripts)
const PR = { W: 1280, H: 720, GAP: 12, MEMO: 468, FONT: 26, K: 0.549, PAGE: '273mm' };   // A4 portrait, 12 mm margins: 186 × 273 mm
const PRINT = { frame: null, root: null, mode: '', data: null, timer: 0, title: '' };
function endPrint(msg) {
  clearTimeout(PRINT.timer);
  if (PRINT.root) { PRINT.root.remove(); PRINT.root = null; }
  PRINT.frame = null; PRINT.data = null; PRINT.mode = '';
  document.documentElement.classList.remove('printing');
  if (PRINT.title) { document.title = PRINT.title; PRINT.title = ''; }
  if (msg) $('x-status').textContent = msg;
}
const INKC = { k: '#1f1f1f', r: '#d22a3a', b: '#1f5fbf' };
function inkSvg(strokes, y0, h, cls) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 ${y0} ${PR.W} ${h}`); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  for (const st of strokes || []) {
    const p = st && Array.isArray(st.p) ? st.p : [];
    if (p.length < 3) continue;
    let d = '';
    for (let i = 0; i + 2 < p.length; i += 3) d += (i ? 'L' : 'M') + (+p[i] || 0).toFixed(1) + ' ' + (+p[i + 1] || 0).toFixed(1);
    if (p.length === 3) d += 'l0.1 0';
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', INKC[st.c] || INKC.r);
    path.setAttribute('stroke-width', '3.5'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    s.appendChild(path);
  }
  return s;
}
function blocksEl(blocks, cls) {
  const box = document.createElement('div'); box.className = cls;
  for (const b of blocks || []) {
    if (b && typeof b.text === 'string') { const p = document.createElement('p'); p.textContent = b.text; box.appendChild(p); }
    else if (b && b.quote && typeof b.quote.exact === 'string') { const q = document.createElement('blockquote'); q.textContent = b.quote.exact; box.appendChild(q); }
  }
  return box;
}
// one page of the handout: the slide's place (A: empty, over the frame; B: the copy goes in), its label, its memo area
function printBlock(pg) {
  const b = document.createElement('div'); b.className = 'pr-block';
  const slide = document.createElement('div'); slide.className = 'pr-slide';
  if (pg.ink.length) slide.appendChild(inkSvg(pg.ink, 0, PR.H, 'pr-ink'));
  const head = document.createElement('p'); head.className = 'pr-head'; head.textContent = W().pSlide.replace('{n}', String(pg.n));
  const area = blocksEl(pg.blocks, 'pr-memo');
  if (pg.ink.length) area.appendChild(inkSvg(pg.ink, PR.H + PR.GAP, PR.MEMO, 'pr-ink'));
  b.append(slide, head, area);
  return b;
}
function printSections(sections) {
  const box = document.createElement('div'); box.className = 'pr-secs';
  if (!sections.length) return box;
  const h1 = document.createElement('h1'); h1.textContent = W().pSections; box.appendChild(h1);
  for (const s of sections) { const h2 = document.createElement('h2'); h2.textContent = s.title; box.append(h2, blocksEl(s.blocks, 'pr-sec')); }
  return box;
}
// a slide's still copy (B): untrusted HTML. Parsed inert here, stripped of what could load or run, then shown with sandbox="" and a
// policy that loads nothing but data: images and fonts
const NAME = /^[a-zA-Z][a-zA-Z0-9_:.-]*$/;
const attrStr = (o) => (o && typeof o === 'object' ? Object.entries(o) : []).filter(([k, v]) => NAME.test(k) && !/^on/i.test(k) && typeof v === 'string' && v.length < 100000)
  .map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`).join('');
function cleanSlide(html) {
  const d = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
  d.querySelectorAll('script,iframe,frame,frameset,object,embed,meta,base,link,portal,noscript').forEach((x) => x.remove());
  for (const el of d.body.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  return d.body.innerHTML;
}
function snapDoc(r, html) {
  const css = String(r.css).replace(/<\/style/gi, '<\\/style');
  const fix = `html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:${PR.W}px;height:${PR.H}px}` +
    `#stage{position:static!important;transform:none!important;width:${PR.W}px!important;height:${PR.H}px!important;margin:0!important}` +
    `#stage>.slide{position:relative!important;left:0!important;top:0!important;display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;width:${PR.W}px!important;height:${PR.H}px!important}`;
  return `<!doctype html><html${attrStr(r.attrs.html)}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">` +
    `<style>${css}</style><style>${fix}</style></head><body${attrStr(r.attrs.body)}><div${attrStr(Object.assign({}, r.attrs.stage, { id: 'stage' }))}>${cleanSlide(html)}</div></body></html>`;
}
const frameLoaded = (f) => new Promise((res) => { f.addEventListener('load', res, { once: true }); setTimeout(res, 8000); });
async function printNow() {
  if (!PRINT.root) return;
  await document.fonts.ready.catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  if (!PRINT.root) return;
  if ($('m-export').open) $('m-export').close();
  document.documentElement.classList.add('printing');
  // the PDF is named after the page's title (Safari and Chrome): 「（題名）のメモ（日付）」 while printing, the page's own after
  PRINT.title = document.title; document.title = PRINT.data.title;
  clearTimeout(PRINT.timer);
  window.addEventListener('afterprint', () => endPrint(W().pDone), { once: true });
  try { window.print(); } catch { endPrint(W().pFailed); }
}
async function printNotes(mode) {
  const P = S.playing;
  if (!P || !M || !P.text) return;
  endPrint();
  if (NOTE.ed) NOTE.ed.flush(); if (PANEL.ed) PANEL.ed.flush();
  if (INK.ui) await INK.ui.flush();
  const ink = $('shared').checked ? [] : await inkOf(inkDoc());
  const notes = M.notes(), secs = M.sections(), all = $('x-all').checked;
  const pages = slideList().map(({ key }, i) => { const n = notes.find((x) => x.at.slide === key), k = ink.find((x) => x.slide === key); return { slide: key, n: i + 1, blocks: n ? n.blocks : [], ink: k ? k.strokes : [] }; })
    .filter((p) => all || p.blocks.length || p.ink.length);
  const sections = notes.filter((n) => n.at.section != null).map((n) => ({ title: n.at.section === '' ? W().mdNoSection : (secs[n.at.section] || W().mdLost), blocks: n.blocks }));
  if (!pages.length && !sections.length) { $('x-status').textContent = W().pEmpty; return; }
  const root = document.createElement('div'); root.id = 'print-root'; root.setAttribute('aria-hidden', 'true');
  root.style.setProperty('--pr-k', String(PR.K)); root.style.setProperty('--pr-page', PR.PAGE);
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('referrerpolicy', 'no-referrer'); f.tabIndex = -1;
  f.className = 'print-frame';
  PRINT.root = root; PRINT.frame = f; PRINT.mode = mode === 'snap' ? 'snap' : 'stack'; PRINT.data = { pages, sections, title: fileName(P.title, 'pdf', new Date(), W()).replace(/\.pdf$/, '') };
  if (PRINT.mode === 'stack') {
    // A: the frame under the blocks, as tall as all the pages
    const stack = document.createElement('div'); stack.className = 'pr-stack';
    f.style.height = `calc(${PR.PAGE} * ${pages.length})`;
    stack.appendChild(f);
    pages.forEach((pg, i) => { const b = printBlock(pg); b.style.top = `calc(${PR.PAGE} * ${i})`; stack.appendChild(b); });
    stack.style.height = `calc(${PR.PAGE} * ${pages.length} - 2px)`;   // a hair under the pages, so no empty page follows
    if (pages.length) root.appendChild(stack);   // none: only the notes on sections print, from the first page
  } else {
    // B: the frame only makes the copies; it stays off the printed page
    f.classList.add('pr-maker');
    root.appendChild(f);
  }
  root.appendChild(printSections(sections));
  document.body.appendChild(root);
  f.srcdoc = lessonDocument(P.text, { shim: __PRINT_SHIM__ });
  $('x-status').textContent = W().pPreparing;
  PRINT.timer = setTimeout(() => endPrint(W().pFailed), 60000);   // the lesson never got ready
  if (!pages.length) { f.remove(); PRINT.frame = null; printNow(); }
}
async function printSnaps(r) {
  const { pages } = PRINT.data, before = PRINT.root.querySelector('.pr-secs'), waits = [];
  for (const pg of pages) {
    const html = typeof r.html[pg.slide] === 'string' ? r.html[pg.slide] : '';
    const b = printBlock(pg);
    if (html) {
      const fr = document.createElement('iframe');
      fr.setAttribute('sandbox', ''); fr.setAttribute('referrerpolicy', 'no-referrer'); fr.tabIndex = -1; fr.className = 'pr-copy';
      fr.srcdoc = snapDoc(r, html);
      waits.push(frameLoaded(fr));
      b.querySelector('.pr-slide').prepend(fr);
    }
    PRINT.root.insertBefore(b, before);
  }
  const blocks = PRINT.root.querySelectorAll(':scope > .pr-block'); if (blocks.length && !PRINT.data.sections.length) blocks[blocks.length - 1].classList.add('pr-last');
  if (PRINT.frame) { PRINT.frame.remove(); PRINT.frame = null; }   // the lesson is no longer needed
  await Promise.all(waits);
  printNow();
}
function openExport() { if (!M || !S.playing) return; $('x-status').textContent = ''; $('m-export').showModal(); }

// ↗ on a quote: a quote from another slide goes to that slide first
function goQuote(q) {
  if (!M) return;
  if (q.target.slide != null && q.target.slide !== S.slideKey) {
    const P = S.playing, first = P && P.timeline ? P.timeline.find((x) => x.s === q.target.slide) : null;
    if (first) seekTo(first.s, first.k);
    setTimeout(() => M.goQuote(q), 450);   // the frame finds the slide's words once the slide is on screen
  } else M.goQuote(q);
}

// ---------------------------------------------------------------- reopening where the viewer left off, with the viewer's preferences (player spec P5, handoff #94)
// The player's ready (spec P8) lists the timeline; the last position kept for this lesson (play/resume.mjs) is sent back as a seek,
// and a notice offers 「最初から再生」. Not on a shared device, not for lessons with a Live (the host leads), not for an older player that
// sends no ready. Untrusted: only slide keys and step keys that are strings are read from the timeline, and a kept position is used
// only when the timeline has it.
const RESUME = { timer: 0 };
function onReady(timeline, commands) {
  const P = S.playing;
  if (!P || P.timeline) return;
  P.timeline = timeline.filter((x) => x && isStr(x.slideKey, 200) && isStr(String(x.stepKey), 16)).map((x) => ({ s: x.slideKey, k: String(x.stepKey), title: isStr(x.slideTitle, 300) ? x.slideTitle : '' }));
  // preferences first (spec P5: sent before the first step), only to a player that lists the prefs command (an older one would answer unsupported)
  P.prefs = commands.includes('prefs');
  if (P.prefs && !$('shared').checked) {
    const kept = prefs.get(inkDoc());
    if (Object.keys(kept).length && S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage({ egatari: 'prefs', prefs: kept }, '*');
  }
  if ($('shared').checked || P.live || P.liveFrom || !P.timeline.length) return;
  const r = resume.get(inkDoc());
  if (!r) return;
  const at = P.timeline.findIndex((x) => x.s === r.slideKey && x.k === r.stepKey);
  if (at <= 0) return;
  P.resumed = true;
  seekTo(r.slideKey, r.stepKey);
  showResume(P.timeline[at].title);
}
function seekTo(slide, step) { if (S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage({ egatari: 'seek', slide, step, t: null }, '*'); }
function keepPosition(slideKey, stepKey) {
  const P = S.playing;
  if (!P || !P.timeline || $('shared').checked || P.live || P.liveFrom) return;
  const first = P.timeline[0];
  resume.set(inkDoc(), slideKey, stepKey, !!first && first.s === slideKey && first.k === stepKey);
}
function showResume(title) {
  const el = $('resume');
  $('resume-text').textContent = title ? W().resumedAt(title.slice(0, 80)) : W().resumed;
  el.hidden = false;
  clearTimeout(RESUME.timer);
  RESUME.timer = setTimeout(hideResume, 12000);
}
function hideResume() { clearTimeout(RESUME.timer); $('resume').hidden = true; }

function closeLesson(quiet) {
  hideResume();
  setInk(false); setNoteView(false); closeSection(); endPrint(); S.slideKey = ''; S.posEvents = false;
  if (M) M.close();
  if ($('cred-box').open) $('cred-box').close();
  if (S.frame && fsElement() === S.frame) fsRequest(false);
  if (S.live) { S.live.stop(); S.live = null; }
  if (S.frame) { S.frame.remove(); S.frame = null; }
  S.doc = null; S.layout = null; S.deckLayout = ''; S.hasPolls = false;
  $('live').hidden = true;
  $('live-start').hidden = true;
  $('b-live').hidden = true;
  document.body.classList.remove('headless');
  S.playing = null;
  if (quiet) return;
  document.body.classList.remove('playing');
  document.documentElement.style.removeProperty('--view-h');
  $('player').hidden = true;
  $('lesson-info').hidden = true;
  $('b-close').hidden = true;
  $('b-ink').hidden = true;
  $('b-note').hidden = true;
  $('start').hidden = false;
  renderRecents();
  try { $('main').focus(); } catch { /* ignore */ }
}
function liveEls() {
  return { root: $('live'), button: $('b-live'), buttonState: $('b-live-state'), state: $('live-state'), notice: $('live-notice'), window: $('live-window'), msg: $('live-msg'),
    join: $('b-join'), dest: $('live-dest'), linkRow: $('live-link-row'), joinLink: $('a-join'), linkDest: $('live-link-dest'),
    nameRow: $('live-name-row'), name: $('live-name'), polls: $('live-polls'), qa: $('live-qa'), q: $('live-q'), send: $('b-send'),
    shown: $('live-shown'), shownList: $('live-shown-list'), leave: $('b-leave'), pollBtn: $('b-poll') };
}
// the Live button takes the focus into the pane (the first control that can act now)
function focusLive() {
  const first = [...$('live').querySelectorAll('button, a[href], input, textarea')].find((e) => !e.closest('[hidden]') && !e.disabled && e.offsetParent !== null);
  (first || $('live')).focus();
}

// messages from the lesson's frame: untrusted. Only from that frame (source), only from an opaque origin, only these shapes
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
const openLinkShape = (m) => { const k = Object.keys(m); return k.every((x) => x === 'egatari' || x === 'href' || x === 'text' || (x === 'download' && m.download === true)) && k.length === (m.download === true ? 4 : 3); };
window.addEventListener('message', (e) => {
  // the print frame (printNotes): only from it, only these shapes
  if (PRINT.frame && e.source === PRINT.frame.contentWindow && e.origin === 'null') {
    const m = e.data, k = m && typeof m === 'object' ? m.egaViewer : '';
    const keys = PRINT.data ? PRINT.data.pages.map((p) => p.slide) : [];
    if (k === 'print-ready' && PRINT.data) {
      clearTimeout(PRINT.timer); PRINT.timer = setTimeout(() => endPrint(W().pFailed), 120000);
      PRINT.frame.contentWindow.postMessage(PRINT.mode === 'snap' ? { egaViewer: 'print-snap', slides: keys } : { egaViewer: 'print-stack', slides: keys, k: PR.K, page: PR.PAGE }, '*');
    } else if (k === 'print-stacked' && PRINT.mode === 'stack' && Number.isInteger(m.n)) {
      if (m.n > 0) printNow(); else endPrint(W().pFailed);
    } else if (k === 'print-snaps' && PRINT.mode === 'snap' && typeof m.css === 'string' && m.css.length <= 40e6 && m.html && typeof m.html === 'object' && m.attrs && typeof m.attrs === 'object') {
      printSnaps(m);
    }
    return;
  }
  const f = S.frame;
  if (!f || e.source !== f.contentWindow || e.origin !== 'null') return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (M.message(m)) return;            // markup requests (play/markup.mjs checks each one)
  // spec §9.4 openLink: {egatari, href, text, download?}; text at most 200 characters; download only as true.
  // Untrusted: links.request applies §11 and asks for a tap; a download is refused (the frame cannot save files)
  if (m.egatari === 'openLink' && isStr(m.href, 4096) && isStr(m.text, 200) && openLinkShape(m)) links.request({ href: m.href, text: m.text, download: m.download === true });
  else if (m.egatari === 'position' && isStr(m.slideKey, 200) && isStr(m.stepKey, 16)) { S.posEvents = true; S.slideKey = m.slideKey; inkPage(m.slideKey); if (S.live) S.live.setStep(m.slideKey + ':' + m.stepKey); keepPosition(m.slideKey, m.stepKey); }
  else if (m.egatari === 'ready' && Array.isArray(m.timeline) && m.timeline.length <= 5000) onReady(m.timeline, Array.isArray(m.commands) ? m.commands : []);
  // the viewer changed a preference in the player (spec P5, P8): kept on this page for this lesson and device (play/prefs.mjs)
  else if (m.egatari === 'prefs' && S.playing && S.playing.prefs && !$('shared').checked) prefs.keep(inkDoc(), m.prefs);
  else if (m.type === 'deck-pos' && isStr(m.key, 220)) {
    // an older player inside the file sends only these: the slide key is the part before ':'
    if (!S.posEvents) { S.slideKey = m.key.split(':')[0]; inkPage(S.slideKey); }
    if (S.live) S.live.setStep(m.key);
  }
  // m in the lesson (play/lesson-shim.js 7): the memo view, like the 「メモ」 button. Untrusted: exactly {egaViewer}
  else if (m.egaViewer === 'note-key' && Object.keys(m).length === 1) { if (!$('b-note').hidden) toggleNote(); }
  else if (m.egaViewer === 'ink-bg' && Object.keys(m).length === 2 && rgbOk(m.rgb)) { if (NOTE.view) setMemoBackground(m.rgb); }
  // the player's view changed (play/lesson-shim.js 6): handwriting is drawn over the slide as the slides view shows it, so in the
  // book or 「スライドと本」 it would lie off the slide; it closes (the strokes stay on this device). Untrusted: exactly {egaViewer, layout}
  else if (m.egaViewer === 'layout' && Object.keys(m).length === 2 && (m.layout === 'book' || m.layout === 'split' || m.layout === 'slides')) {
    S.deckLayout = m.layout;
    if (NOTE.view && m.layout !== 'slides') { setNoteView(false); announce(W().noteClosedView); }
  }
  // the lesson's shim asks for fullscreen (play/lesson-shim.js 4): exactly {egaViewer, on}. Untrusted: the browser enters it only
  // on the viewer's own activation, and only the frame element goes fullscreen
  else if (m.egaViewer === 'fullscreen' && typeof m.on === 'boolean' && Object.keys(m).length === 2) fsRequest(m.on);
});

// the learner's markup: highlights and 暗記 in the book (play/markup.mjs, play/markup-frame.js)
const M = framed ? null : markup({
  words: W,
  els: { header: $('bar'), button: $('b-markup'), bar: $('markup-bar'), recall: $('b-recall'), recallColours: $('recall-colours'), listButton: $('b-mlist'),
    note: $('markup-note'), hint: $('markup-hint'), filtered: $('m-filtered'), filteredShow: $('b-mshow'), list: $('m-list'), listBody: $('m-list-body'), listClose: $('b-mlist-close'),
    confirm: $('m-confirm'), confirmText: $('m-confirm-t'), confirmNo: $('b-mconfirm-no'), confirmYes: $('b-mconfirm-yes'), announce: (t) => announce(t) },
  onPersist: () => maybeRequestPersist(),
  onQuote: (at, block) => onQuote(at, block),
  slides: () => slideKeys(),
  slideName: (k) => { const n = slideNo(k), t = slideTitle(k); return n ? W().nSlideName(n, t) : k; },
  onGo: (q) => goQuote(q),
  onOpenNote: (at) => openNote(at),
  onNoteSection: (section) => { const ed = openSection(section); if (ed) ed.focus(); },
});
const links = linkBox({ words: W, dlg: { box: $('link-box'), title: $('link-t'), host: $('link-host'), url: $('link-url'), notes: $('link-n'), cancel: $('b-link-cancel'), open: $('a-link-open') } });

// ---------------------------------------------------------------- recent files
async function renderRecents() {
  const R = S.recents, ul = $('recent-list');
  if (!R) return;
  $('recent-store').textContent = R.kind === 'opfs' ? W().storeOpfs : R.kind === 'idb' ? W().storeIdb : W().storeNone;
  let list = [];
  try { list = await R.list(); } catch { list = []; }
  ul.textContent = '';
  for (const e of list) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'open'; b.setAttribute('aria-label', W().openLabel(e.title || e.name));
    const t = document.createElement('span'); t.className = 't'; t.textContent = e.title || e.name;
    const m = document.createElement('span'); m.className = 'm';
    m.textContent = `${e.kind === 'editable' ? W().kindEditable : W().kindPlayOnly} · ${e.name} · ${(e.size / 1024 / 1024).toFixed(1)} MB · ${new Date(e.openedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    b.appendChild(t); b.appendChild(m);
    b.addEventListener('click', async () => { const blob = await R.get(e.id); if (blob) openFile(blob, e.name, { recentId: e.id }); else { await R.remove(e.id); renderRecents(); } });
    const d = document.createElement('button'); d.type = 'button'; d.className = 'del'; d.textContent = W().del; d.setAttribute('aria-label', W().delLabel(e.title || e.name));
    d.addEventListener('click', async () => { await R.remove(e.id); await renderRecents(); announce(W().del); $('b-clear').hidden ? $('file').focus() : $('b-clear').focus(); });
    li.appendChild(b); li.appendChild(d); ul.appendChild(li);
  }
  $('recent-empty').hidden = list.length > 0;
  $('b-clear').hidden = list.length === 0;
  renderKeepLine(list.length);
  await renderPersistNote(list.length > 0);
}
// One line under "Open a file": whether opened files are copied onto this device (the same condition as openFile), with a link
// to the 「共有の端末」 switch and, when copies exist, 「すべて削除」 (the same action and confirmation as the button in Recent files).
// Schools use shared iPads and Chromebooks; the default keeps copies (SHARED_DEVICE_DEFAULT), so say so where the file is opened.
let keptCount = 0;
function renderKeepLine(n = keptCount) {
  keptCount = n;
  const keeping = $('keep').checked && !$('shared').checked && !!S.recents && S.recents.kind !== 'none';
  $('keep-line-text').textContent = keeping ? W().keepLineOn : $('shared').checked ? W().keepLineShared : W().keepLineOff;
  $('keep-line-clear').hidden = n === 0;
}
// WebKit (Safari 17+, iOS 17+) never evicts an origin once navigator.storage.persist() has succeeded for it (other browsers may
// still ask the viewer, or decide on their own heuristics). Asked once per launch, right after the first file actually lands in
// recents (not on a cold load with nothing kept, and never in shared-device mode: the call site in openChecked already gates on
// keep && !shared). Fire-and-forget: never awaited before playback continues.
let persistAsked = false;
function maybeRequestPersist() {
  if (persistAsked || typeof navigator.storage?.persist !== 'function') return;
  persistAsked = true;
  navigator.storage.persist().then(updatePersistNote, updatePersistNote);
}
async function updatePersistNote() {
  if (!S.recents) return;
  let n = 0;
  try { n = (await S.recents.list()).length; } catch { n = 0; }
  await renderPersistNote(n > 0);
}
// under 「この端末にだけ保存されます」: the browser's actual answer to persist(), read fresh each time (it can already be true from
// an earlier launch). Hidden in shared-device mode or with nothing kept, where it would say nothing useful.
async function renderPersistNote(hasKept) {
  const el = $('recent-persist');
  if (!el) return;
  if ($('shared').checked || !hasKept) { el.hidden = true; el.textContent = ''; return; }
  let persisted = false;
  try { persisted = typeof navigator.storage?.persisted === 'function' ? await navigator.storage.persisted() : false; } catch { persisted = false; }
  el.hidden = false;
  el.textContent = persisted ? W().persistYes : W().persistNo;
}
const KEEP_KEY = 'egatari-viewer-keep', SHARED_KEY = 'egatari-viewer-shared';
const getPref = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* memory only */ } };
function isShared() { const v = getPref(SHARED_KEY); return v === '1' ? true : v === '0' ? false : SHARED_DEVICE_DEFAULT; }
function syncKeep() {
  const shared = $('shared').checked;
  $('keep').disabled = shared;
  $('keep').checked = !shared && getPref(KEEP_KEY) !== '0';
  renderKeepLine();
}
function initKeep() {
  $('shared').checked = isShared();
  syncKeep();
  $('keep').addEventListener('change', () => { setPref(KEEP_KEY, $('keep').checked ? '1' : '0'); renderKeepLine(); });
  $('a-keep-shared').addEventListener('click', (e) => { e.preventDefault(); $('shared').scrollIntoView({ block: 'center' }); $('shared').focus(); });
  $('shared').addEventListener('change', async () => {
    setPref(SHARED_KEY, $('shared').checked ? '1' : '0');
    syncKeep();
    if (!$('shared').checked) return;
    // highlights and handwriting are the learner's own work: ask first, with what would go (play/markup.mjs, play/ink.mjs);
    // none saved → switch at once.
    // やめる turns the switch back off before anything is deleted
    const n = await countRecords(), k = await countInk();
    if ((n.highlights > 0 || n.notes > 0 || k > 0) && !(await M.ask(W().mSharedAsk(n.lessons, n.highlights, k, n.notes), W().mSharedYes))) {
      $('shared').checked = false; setPref(SHARED_KEY, '0'); syncKeep(); $('shared').focus(); return;
    }
    await clearRecents(); await clearAllRecords(); await clearInk(); resume.clear(); prefs.clear(); announce(W().sharedOn);
  });
}
async function clearRecents() { if (S.recents) { try { await S.recents.clear(); } catch { /* nothing kept */ } } await renderRecents(); }

// ---------------------------------------------------------------- service worker: the app shell offline; a new version on the next launch
// The service worker (play/sw.js) caches this page's own files, so the Viewer opens with no network once it has been opened.
// A new version installs beside the running one and waits. It takes over only on a launch: when no window of the Viewer is open
// (the browser then activates it by itself), or at the start screen of a fresh launch, where this page asks the waiting worker to
// take over and reloads once. The worker agrees only when this is the Viewer's only window (play/sw.js 'activate-if-idle').
// Nothing is swapped while a lesson is open: no request is made while playing, and a takeover that races with opening a file does
// not reload (the running page keeps its own scripts; every file it needs is already loaded).
// Coming back to the Viewer (visibilitychange) counts as a launch only on the start screen, with no lesson open.
// Two races at a launch (seen on slow CI runners, also possible on a slow phone): the window this page replaced (the same tab's previous
// page, still unloading) can still be listed for a moment, so the worker answers 'busy': during a launch the page asks again after a second.
// And a takeover granted just before this page loaded (asked by the previous page) arrives here as a new controller this page did not ask
// for: during a launch, at the start screen, the page reloads for it too (not when the first worker claims a page that had none).
async function initSW() {
  if (!('serviceWorker' in navigator)) return null;
  let reg;
  try { reg = await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch { return null; }
  if (!reg) return null;   // a browser that blocks service workers may resolve without a registration
  // a launch: the first seconds after the page started. Later, an update found while the Viewer is in use waits for the next launch
  let launching = true;
  setTimeout(() => { launching = false; }, 10000);
  let asked = false, retry = 0, controlled = !!navigator.serviceWorker.controller;
  const takeOver = () => {
    if (S.playing || S.opening || asked || !reg.waiting || !navigator.serviceWorker.controller) return;
    asked = true;
    reg.waiting.postMessage({ type: 'activate-if-idle' });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const replaced = controlled; controlled = true;
    if ((asked || (launching && replaced)) && !S.playing && !S.opening) location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (!(e.data && e.data.type === 'busy')) return;
    asked = false;
    clearTimeout(retry);
    if (launching) retry = setTimeout(() => { if (launching) takeOver(); }, 1000);
  });
  takeOver();
  reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && launching) takeOver(); }); });
  if (!S.playing && !S.opening) reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || S.playing || S.opening) return;
    asked = false;
    launching = true;
    setTimeout(() => { launching = false; }, 10000);
    takeOver();
    reg.update().catch(() => {});
  });
  return reg;
}

// Android share_target: the service worker received the POST and holds the file until this page claims it (play/sw.js)
function initShare() {
  const q = new URLSearchParams(location.search);
  const st = q.get('share');
  if (!st) return;
  history.replaceState(null, '', './');
  if (st !== '1' || !navigator.serviceWorker) { showMsg(W().errShare); return; }
  const timer = setTimeout(() => showMsg(W().errShare), 10000);
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type !== 'share-file') return;
    clearTimeout(timer);
    if (m.file instanceof Blob) openFile(m.file, m.file.name || 'shared.ega.html');
    else showMsg(W().errShareNone);
  });
  navigator.serviceWorker.ready.then((reg) => {
    const ctl = navigator.serviceWorker.controller || reg.active;
    if (ctl) ctl.postMessage({ type: 'share-claim' });
  });
}

// ---------------------------------------------------------------- adding the Viewer to the device (iPhone, iPad, Android)
// iOS and iPadOS offer no install prompt, so in a browser tab the start screen says how to add the Viewer, with iOS's own labels:
// Safari, or Chrome on iOS (CriOS: its share sheet hides 「ホーム画面に追加」 behind 「表示を増やす」, and its 「Web アプリとして
// 開く」 must stay on for a standalone, offline Viewer), or one sentence for any other browser. iPadOS asking for the desktop site
// reports a Mac with touch. On Android, when the browser offers installing (beforeinstallprompt), the line carries a real
// 「インストール」 button that calls prompt(). Never when opened from the Home Screen (navigator.standalone, display-mode),
// never after × (remembered on this device), and never on a PC: there the .ega.html plays in the browser itself.
const INSTALL_KEY = 'egatari-viewer-install-hint';
let installEvent = null;   // Android's deferred beforeinstallprompt
function isStandalone() {
  if (navigator.standalone === true) return true;
  try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches; } catch { return false; }
}
function installKind() {
  const ua = navigator.userAgent || '';
  if (isStandalone() || getPref(INSTALL_KEY) === 'dismissed') return null;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS/.test(ua) ? 'installChrome' : /FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'installOther' : /Safari\//.test(ua) ? 'installSafari' : 'installOther';
  if (/Android/.test(ua) && installEvent) return 'installAndroid';
  return null;
}
function renderInstallHint() {
  const k = installKind();
  $('install').hidden = !k;
  $('b-install').hidden = k !== 'installAndroid';
  if (k) $('install-text').textContent = W()[k];
}
window.addEventListener('beforeinstallprompt', (e) => {
  if (!/Android/.test(navigator.userAgent || '')) return;   // a PC keeps the browser's own UI; the Viewer is not needed there
  e.preventDefault();
  installEvent = e;
  if (document.documentElement.hasAttribute('data-ready')) renderInstallHint();
});
window.addEventListener('appinstalled', () => { installEvent = null; if (document.documentElement.hasAttribute('data-ready')) renderInstallHint(); });
function initInstallHint() {
  $('b-install-x').addEventListener('click', () => { setPref(INSTALL_KEY, 'dismissed'); $('install').hidden = true; try { $('file').focus(); } catch { /* ignore */ } });
  $('b-install').addEventListener('click', async () => {
    const e = installEvent;
    if (!e) return;
    installEvent = null;
    try { await e.prompt(); await e.userChoice; } catch { /* the browser declined */ }
    renderInstallHint();
  });
  renderInstallHint();
}

// ---------------------------------------------------------------- start
async function main() {
  if (framed) return;
  setLang(lang);
  $('version').textContent = VERSION;
  initKeep();
  initInstallHint();
  getReader();   // now, so that opening a lesson later makes no request at all
  $('b-lang').addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
  $('file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) openFile(f, f.name); e.target.value = ''; });
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f, f.name); });
  $('lesson-credit').addEventListener('click', openCredits);
  $('b-cred-close').addEventListener('click', () => $('cred-box').close());
  $('cred-box').addEventListener('close', () => { if (S.playing && !$('lesson-credit').hidden) $('lesson-credit').focus(); });
  $('b-ink').addEventListener('click', () => setInk(!INK.on));
  $('b-note').addEventListener('click', toggleNote);
  $('b-np-close').addEventListener('click', closeSection);
  $('b-mexport').addEventListener('click', openExport);
  $('b-mexport-close').addEventListener('click', () => $('m-export').close());
  $('b-x-md').addEventListener('click', () => exportAs('md'));
  $('b-x-json').addEventListener('click', () => exportAs('json'));
  $('b-x-pdf').addEventListener('click', () => printNotes('stack'));
  $('b-x-pdf2').addEventListener('click', () => printNotes('snap'));
  $('x-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; importFile(f); });
  $('b-resume-start').addEventListener('click', () => { const P = S.playing; hideResume(); if (P && P.timeline && P.timeline[0]) { seekTo(P.timeline[0].s, P.timeline[0].k); announce(W().resumeFromStart); } });
  $('b-resume-x').addEventListener('click', hideResume);
  $('b-close').addEventListener('click', () => { if (history.state && history.state.egaViewer) history.back(); else closeLesson(); });
  window.addEventListener('popstate', () => { if (S.playing) closeLesson(); });
  $('b-live').addEventListener('click', focusLive);
  $('b-start-join').addEventListener('click', () => { if (S.live) S.live.join(); startFrame(); });
  $('a-start-join').addEventListener('click', () => setTimeout(startFrame, 0));
  $('b-watch').addEventListener('click', startFrame);
  $('b-poll').addEventListener('click', () => setPollView(!$('live').classList.contains('poll-open')));
  $('b-poll-back').addEventListener('click', () => { setPollView(false); $('b-poll').focus(); });
  $('b-strip-close').addEventListener('click', () => $('b-close').click());
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (!typing()) onResize(); });
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('keydown', forwardKey);
  $('live').addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; e.preventDefault(); if ($('live').classList.contains('poll-open')) { setPollView(false); $('b-poll').focus(); } else if (!$('b-live').hidden) $('b-live').focus(); });
  const clearAll = async () => { if (!window.confirm(W().clearConfirm)) return; await S.recents.clear(); resume.clear(); await renderRecents(); $('file').focus(); };
  $('b-clear').addEventListener('click', clearAll);
  $('b-keep-clear').addEventListener('click', clearAll);
  // the "home" link: back to the start without reloading while a lesson plays
  $('home').addEventListener('click', (e) => { if (S.playing) { e.preventDefault(); $('b-close').click(); } });
  try { S.recents = await openRecents({ prefer: new URLSearchParams(location.search).get('store') === 'idb' ? 'idb' : '' }); } catch { S.recents = null; }
  if ($('shared').checked) await clearRecents(); else await renderRecents();
  initShare();
  let reg = null;
  initSW().then((r) => { reg = r; });
  window.__play = { version: VERSION, state: () => ({ playing: S.playing, layout: S.layout, live: S.live ? S.live.state() : null, store: S.recents && S.recents.kind, sw: !!reg, markup: M.state() }), openFile, links, markupSaved: () => M.saved() };
  document.documentElement.setAttribute('data-ready', '');
}
main();
