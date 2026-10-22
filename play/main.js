// Egatari Play (play.egatari.org): open an Egatari file (.ega.html) on this device and play it (docs/play.md).
// - The file is read in this page and never uploaded. It plays in a sandboxed frame with an opaque origin (play/frame.mjs).
// - Recent files stay on this device (play/recents.mjs). Android shares arrive through the service worker (play/sw.js).
// - Live is held by this page, not by the lesson (play/live-host.mjs). Links the lesson asks to open go through the
//   link rule in this page's chrome (play/links.mjs).
// - The page refuses to run inside a frame (play/guard.js, and the server's frame-ancestors 'none').
import { WORDS, initialLang, saveLang, apply } from './i18n.mjs';
import { lessonDocument, makeFrame } from './frame.mjs';
import { openRecents } from './recents.mjs';
import { startLive } from './live-host.mjs';
import { computeLayout, isPhoneLandscape } from './layout.mjs';
import { linkBox } from './links.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { readFileBoundedText } from '../app/bounded-read.js';

/* global __PLAY_VERSION__, __PLAY_LIVE__, __PLAY_DEV__, __LESSON_SHIM__ */
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

const S = { playing: null, frame: null, live: null, recents: null, reloading: false, updateReady: false, doc: null, title: '', layout: null, layoutKey: '', hasPolls: false };
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
  renderRecents();
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

async function openFile(blob, name, opts = {}) {
  showMsg('');
  if (!blob || typeof blob.size !== 'number') { showMsg(W().errRead); return false; }
  if (blob.size > MAX_BYTES) { showMsg(W().errTooLarge(MAX_BYTES / 1024 / 1024)); return false; }
  announce(W().reading);
  let text;
  try { text = (await readFileBoundedText(blob, { max: MAX_BYTES, what: 'lesson' })).text; } catch (e) { showMsg(e && e.code === 'read-over' ? W().errTooLarge(MAX_BYTES / 1024 / 1024) : W().errRead); return false; }
  const r = await scan(text);
  if (!r || !r.ok) { showMsg(r && r.error === 'not-egatari' ? W().errNotEgatari : W().errParse); return false; }
  const info = { name: String(name || 'lesson.ega.html').slice(0, 300), title: r.meta.title, kind: r.kind, docId: r.meta.docId };
  if (opts.recentId) { try { await S.recents.touch(opts.recentId); } catch { /* keep playing */ } }
  else if ($('keep').checked && !$('shared').checked && S.recents && S.recents.kind !== 'none') { try { await S.recents.add(blob, info); } catch { /* storage full or blocked: still play */ } }
  play(text, r, info);
  return true;
}

// ---------------------------------------------------------------- playing
// A lesson with Live starts on a start screen (Join, or 「参加しないで見る」) and the frame is placed only after that, so the Join
// tap can never meet the lesson's frame. Then the layout is chosen once from the lesson's activities and the screen
// (play/layout.mjs) and kept while the lesson plays; only a rotation (or a window resize) lays it out again.
function play(text, r, info) {
  closeLesson(true);
  const live = r.live && LP.validate(r.live, { key: true }).length === 0 ? r.live : null;
  const title = r.meta.title || info.name;
  S.playing = { kind: r.kind, title, live: !!live, liveFrom: r.liveFrom, keyless: !!r.live && !live, docId: r.meta.docId, started: false };
  S.doc = lessonDocument(text, { shim: __LESSON_SHIM__, hideLive: !!r.live });
  S.title = title;
  document.body.classList.add('playing');
  $('start').hidden = true;
  $('player').hidden = false;
  $('lesson-info').hidden = false;
  $('lesson-title').textContent = title;
  $('lesson-title').lang = r.meta.lang || '';
  $('lesson-kind').textContent = r.kind === 'editable' ? W().kindEditable : W().kindPlayOnly;
  $('b-close').hidden = false;
  $('update').hidden = true;   // held back while a lesson plays
  if (!(history.state && history.state.egaPlay)) history.pushState({ egaPlay: 1 }, '');
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
  S.doc = null;
  applyLayout();                       // everything around the frame is placed first
  $('stage-wrap').appendChild(S.frame);
  try { S.frame.focus(); } catch { /* not focusable yet */ }
}
// the no-slack variant for phones in landscape on 16:9 screens (play/layout.mjs). The owner chose 'overlay' (the full screen for the
// slide); 'strip' is the alternative. ?noslack=strip or ?noslack=overlay switches it for measuring (docs/play.md).
// The overlay is safe only because its indicator is always shown over the frame's top edge from the moment the frame is placed,
// and is never toggled (hidden, then shown) over the frame: taps were lost exactly when page chrome switched from hidden to shown
// over the out-of-process frame. Any change to that (hiding the indicator, a sheet that appears where nothing was) must be
// measured again with tools/play-tap-measure.mjs
const NO_SLACK_VARIANT = 'overlay';
const variant = () => { const q = new URLSearchParams(location.search).get('noslack'); return q === 'overlay' || q === 'strip' ? q : NO_SLACK_VARIANT; };
function applyLayout() {
  const live = !!(S.playing && S.playing.live);
  const vw = window.innerWidth, vh = window.innerHeight;
  const headless = live && isPhoneLandscape(vw, vh);
  document.body.classList.toggle('headless', headless);
  const P = $('player').getBoundingClientRect();
  const L = computeLayout({ w: vw, h: vh, headerH: vh - P.height, live, polls: S.hasPolls, variant: variant() });
  S.layout = L;
  const place = (el, q) => { el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; el.style.width = q.w + 'px'; el.style.height = q.h + 'px'; };
  place($('stage-wrap'), L.frame);
  $('player').setAttribute('data-mode', L.mode);
  $('b-live').hidden = !live || headless;
  if (L.live) { place($('live'), L.live); $('live').hidden = false; } else $('live').hidden = true;
  $('live').setAttribute('data-mode', L.mode);
  setPollView(false);
  S.layoutKey = layoutKey();
}
const layoutKey = () => `${window.innerWidth > window.innerHeight ? 'l' : 'p'}${isPhoneLandscape(window.innerWidth, window.innerHeight) ? 'h' : ''}`;
// rotation: lay out again at once; any other resize (a desktop window): once it settles
let resizeTimer = null;
function onResize() {
  if (!S.frame) return;
  clearTimeout(resizeTimer);
  if (layoutKey() !== S.layoutKey) applyLayout();
  else resizeTimer = setTimeout(() => { if (S.frame) applyLayout(); }, 250);
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
function closeLesson(quiet) {
  if (S.live) { S.live.stop(); S.live = null; }
  if (S.frame) { S.frame.remove(); S.frame = null; }
  S.doc = null; S.layout = null; S.hasPolls = false;
  $('live').hidden = true;
  $('live-start').hidden = true;
  $('b-live').hidden = true;
  document.body.classList.remove('headless');
  S.playing = null;
  if (quiet) return;
  if (S.updateReady) $('update').hidden = false;   // held back while the lesson played
  document.body.classList.remove('playing');
  $('player').hidden = true;
  $('lesson-info').hidden = true;
  $('b-close').hidden = true;
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
  const f = S.frame;
  if (!f || e.source !== f.contentWindow || e.origin !== 'null') return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  // spec §9.4 openLink: {egatari, href, text, download?}; text at most 200 characters; download only as true.
  // Untrusted: links.request applies §11 and asks for a tap; a download is refused (the frame cannot save files)
  if (m.egatari === 'openLink' && isStr(m.href, 4096) && isStr(m.text, 200) && openLinkShape(m)) links.request({ href: m.href, text: m.text, download: m.download === true });
  else if (m.egatari === 'position' && isStr(m.slideKey, 200) && isStr(m.stepKey, 16)) { if (S.live) S.live.setStep(m.slideKey + ':' + m.stepKey); }
  else if (m.type === 'deck-pos' && isStr(m.key, 220)) { if (S.live) S.live.setStep(m.key); }
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
}
const KEEP_KEY = 'egatari-play-keep', SHARED_KEY = 'egatari-play-shared';
const getPref = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* memory only */ } };
function isShared() { const v = getPref(SHARED_KEY); return v === '1' ? true : v === '0' ? false : SHARED_DEVICE_DEFAULT; }
function syncKeep() {
  const shared = $('shared').checked;
  $('keep').disabled = shared;
  $('keep').checked = !shared && getPref(KEEP_KEY) !== '0';
}
function initKeep() {
  $('shared').checked = isShared();
  syncKeep();
  $('keep').addEventListener('change', () => setPref(KEEP_KEY, $('keep').checked ? '1' : '0'));
  $('shared').addEventListener('change', async () => {
    setPref(SHARED_KEY, $('shared').checked ? '1' : '0');
    syncKeep();
    if ($('shared').checked) { await clearRecents(); announce(W().sharedOn); }
  });
}
async function clearRecents() { if (S.recents) { try { await S.recents.clear(); } catch { /* nothing kept */ } } await renderRecents(); }

// ---------------------------------------------------------------- service worker: only this page's own files; versioned update
async function initSW() {
  if (!('serviceWorker' in navigator)) return null;
  let reg;
  try { reg = await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch { return null; }
  const show = () => { if (reg.waiting && navigator.serviceWorker.controller) { S.updateReady = true; if (!S.playing) $('update').hidden = false; } };
  show();
  reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') show(); }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  $('b-update').addEventListener('click', () => {
    if (S.playing && !window.confirm(W().updateWhilePlaying)) return;
    if (!reg.waiting) { location.reload(); return; }
    S.reloading = true;
    reg.waiting.postMessage({ type: 'skip-waiting' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.reloading) location.reload(); });
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

// ---------------------------------------------------------------- start
async function main() {
  if (framed) return;
  setLang(lang);
  $('version').textContent = VERSION;
  initKeep();
  getReader();   // now, so that opening a lesson later makes no request at all
  $('b-lang').addEventListener('click', () => setLang(lang === 'ja' ? 'en' : 'ja'));
  $('file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) openFile(f, f.name); e.target.value = ''; });
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f, f.name); });
  $('b-close').addEventListener('click', () => { if (history.state && history.state.egaPlay) history.back(); else closeLesson(); });
  window.addEventListener('popstate', () => { if (S.playing) closeLesson(); });
  $('b-live').addEventListener('click', focusLive);
  $('b-start-join').addEventListener('click', () => { if (S.live) S.live.join(); startFrame(); });
  $('a-start-join').addEventListener('click', () => setTimeout(startFrame, 0));
  $('b-watch').addEventListener('click', startFrame);
  $('b-poll').addEventListener('click', () => setPollView(!$('live').classList.contains('poll-open')));
  $('b-poll-back').addEventListener('click', () => { setPollView(false); $('b-poll').focus(); });
  $('b-strip-close').addEventListener('click', () => $('b-close').click());
  window.addEventListener('resize', onResize);
  $('live').addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; e.preventDefault(); if ($('live').classList.contains('poll-open')) { setPollView(false); $('b-poll').focus(); } else if (!$('b-live').hidden) $('b-live').focus(); });
  $('b-clear').addEventListener('click', async () => { if (!window.confirm(W().clearConfirm)) return; await S.recents.clear(); await renderRecents(); $('file').focus(); });
  // the "home" link: back to the start without reloading while a lesson plays
  $('home').addEventListener('click', (e) => { if (S.playing) { e.preventDefault(); $('b-close').click(); } });
  try { S.recents = await openRecents({ prefer: new URLSearchParams(location.search).get('store') === 'idb' ? 'idb' : '' }); } catch { S.recents = null; }
  if ($('shared').checked) await clearRecents(); else await renderRecents();
  initShare();
  let reg = null;
  initSW().then((r) => { reg = r; });
  window.__play = { version: VERSION, state: () => ({ playing: S.playing, layout: S.layout, live: S.live ? S.live.state() : null, store: S.recents && S.recents.kind, sw: !!reg }), openFile, links };
  document.documentElement.setAttribute('data-ready', '');
}
main();
