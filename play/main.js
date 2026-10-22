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
import { linkBox } from './links.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';

/* global __PLAY_VERSION__, __PLAY_LIVE__, __PLAY_DEV__, __LESSON_SHIM__ */
const VERSION = __PLAY_VERSION__;
const LIVE_ALLOWED = new Set(__PLAY_LIVE__);
const LP = LivePolicy({ allowLoopback: __PLAY_DEV__ === true });
const MAX_BYTES = 100 * 1024 * 1024;   // spec §11's recommended file limit

const $ = (id) => document.getElementById(id);
const framed = document.documentElement.hasAttribute('data-framed');
let lang = initialLang();
const W = () => WORDS[lang];

const S = { playing: null, frame: null, live: null, liveOpen: false, recents: null, reloading: false };
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
  try { text = await blob.text(); } catch { showMsg(W().errRead); return false; }
  const r = await scan(text);
  if (!r || !r.ok) { showMsg(r && r.error === 'not-egatari' ? W().errNotEgatari : W().errParse); return false; }
  const info = { name: String(name || 'lesson.ega.html').slice(0, 300), title: r.meta.title, kind: r.kind, docId: r.meta.docId };
  if (opts.recentId) { try { await S.recents.touch(opts.recentId); } catch { /* keep playing */ } }
  else if ($('keep').checked && S.recents && S.recents.kind !== 'none') { try { await S.recents.add(blob, info); } catch { /* storage full or blocked: still play */ } }
  play(text, r, info);
  return true;
}

// ---------------------------------------------------------------- playing
function play(text, r, info) {
  closeLesson(true);
  const live = r.live && LP.validate(r.live, { key: true }).length === 0 ? r.live : null;
  const doc = lessonDocument(text, { shim: __LESSON_SHIM__, hideLive: !!r.live });
  const title = r.meta.title || info.name;
  const f = makeFrame(doc, title);
  S.playing = { kind: r.kind, title, live: !!live, liveFrom: r.liveFrom, keyless: !!r.live && !live, docId: r.meta.docId };
  S.frame = f;
  document.body.classList.add('playing');
  $('start').hidden = true;
  $('player').hidden = false;
  $('lesson-info').hidden = false;
  $('lesson-title').textContent = title;
  $('lesson-title').lang = r.meta.lang || '';
  $('lesson-kind').textContent = r.kind === 'editable' ? W().kindEditable : W().kindPlayOnly;
  $('b-close').hidden = false;
  $('stage-wrap').appendChild(f);
  if (live) {
    $('b-live').hidden = false;
    S.live = startLive({ live, words: W(), lang, allowed: LIVE_ALLOWED, policy: LP, announce, onOpen: (o, how) => setLiveOpen(o, how), el: liveEls() });
  }
  if (!(history.state && history.state.egaPlay)) history.pushState({ egaPlay: 1 }, '');
  try { f.focus(); } catch { /* not focusable yet */ }
}
function closeLesson(quiet) {
  if (S.live) { S.live.stop(); S.live = null; }
  if (S.frame) { S.frame.remove(); S.frame = null; }
  setLiveOpen(false);
  $('b-live').hidden = true;
  S.playing = null;
  if (quiet) return;
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
    joinRow: $('live-join-row'), join: $('b-join'), dest: $('live-dest'), linkRow: $('live-link-row'), joinLink: $('a-join'), linkDest: $('live-link-dest'),
    nameRow: $('live-name-row'), name: $('live-name'), polls: $('live-polls'), qa: $('live-qa'), q: $('live-q'), send: $('b-send'),
    shown: $('live-shown'), shownList: $('live-shown-list'), leave: $('b-leave') };
}
function setLiveOpen(open, how) {
  S.liveOpen = !!open;
  $('live').hidden = !open;
  $('b-live').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && how === 'button') { const j = $('b-join'); (j && !j.closest('[hidden]') && !j.disabled ? j : $('b-live-fold')).focus(); }
}

// messages from the lesson's frame: untrusted. Only from that frame (source), only from an opaque origin, only these shapes
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
window.addEventListener('message', (e) => {
  const f = S.frame;
  if (!f || e.source !== f.contentWindow || e.origin !== 'null') return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.egaPlay === 'openLink' && m.v === 1 && isStr(m.href, 4096) && isStr(m.text, 1000) && typeof m.download === 'boolean') links.request(m);
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
const KEEP_KEY = 'egatari-play-keep';
function initKeep() {
  try { const v = localStorage.getItem(KEEP_KEY); if (v === '0') $('keep').checked = false; } catch { /* default on */ }
  $('keep').addEventListener('change', () => { try { localStorage.setItem(KEEP_KEY, $('keep').checked ? '1' : '0'); } catch { /* memory only */ } });
}

// ---------------------------------------------------------------- service worker: only this page's own files; versioned update
async function initSW() {
  if (!('serviceWorker' in navigator)) return null;
  let reg;
  try { reg = await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch { return null; }
  const show = () => { if (reg.waiting && navigator.serviceWorker.controller) $('update').hidden = false; };
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
  $('b-live').addEventListener('click', () => { const o = !S.liveOpen; if (S.live) S.live.pinned(); setLiveOpen(o, 'button'); if (!o) $('b-live').focus(); });
  $('b-live-fold').addEventListener('click', () => { if (S.live) S.live.pinned(); setLiveOpen(false); $('b-live').focus(); });
  $('live').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); setLiveOpen(false); $('b-live').focus(); } });
  $('b-clear').addEventListener('click', async () => { if (!window.confirm(W().clearConfirm)) return; await S.recents.clear(); await renderRecents(); $('file').focus(); });
  // the "home" link: back to the start without reloading while a lesson plays
  $('home').addEventListener('click', (e) => { if (S.playing) { e.preventDefault(); $('b-close').click(); } });
  try { S.recents = await openRecents({ prefer: new URLSearchParams(location.search).get('store') === 'idb' ? 'idb' : '' }); } catch { S.recents = null; }
  await renderRecents();
  initShare();
  let reg = null;
  initSW().then((r) => { reg = r; });
  window.__play = { version: VERSION, state: () => ({ playing: S.playing, live: S.live ? S.live.state() : null, liveOpen: S.liveOpen, store: S.recents && S.recents.kind, sw: !!reg }), openFile, links };
  document.documentElement.setAttribute('data-ready', '');
}
main();
