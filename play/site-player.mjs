// Site player: plays one play-only sample lesson on a static site (egatari.org's /gallery/play/?id=<id>), the way Egatari Viewer
// plays a file (docs/viewer.md "Site player"). Built by tools/build-site-player.mjs into site-play.js; the site vendors that file.
// - The lesson's bytes come from the site's own origin and must match the site's lock (tools/gallery.mjs: id, size, SHA-256)
//   before anything is parsed: a file that differs is never played.
// - It plays in the Viewer's frame (play/frame.mjs): srcdoc = the trusted prefix (app/preview-doc.js: the preview policy, then the
//   lesson shim) + the bytes unchanged, sandbox="allow-scripts" (an opaque origin: no access to the site's storage or DOM).
//   The srcdoc document also inherits the page's own policy (a <meta> CSP on a host that cannot send headers): tools/build-site-player.mjs
//   prints the policy the page must carry.
// - From the frame it takes only the Viewer's shapes: openLink (through the link box of play/links.mjs, spec §11), fullscreen
//   requests (only the frame element goes fullscreen, on the viewer's own activation), and position events (ignored).
// - No Live, no markup, no recent files, nothing stored, no service worker.
//
// The page: <div id="egatari-player" data-lock="<lock URL>" data-files="<folder URL>"></div> and <script type="module" src="site-play.js">;
// optionally an element with data-player-title, which gets the lesson's title.
// The file of a lesson is <data-files><id>.ega.bin (served as application/octet-stream, so opening it directly never renders it).
import { WORDS } from './i18n.mjs';
import { lessonDocument, makeFrame } from './frame.mjs';
import { linkBox } from './links.mjs';

/* global __LESSON_SHIM__, __SITE_PLAYER_VERSION__ */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX = /^[0-9a-f]{64}$/;
const MAX_BYTES = 25 * 1024 * 1024;
async function sha256Hex(bytes) { const h = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join(''); }
const lang = /^en\b/i.test(document.documentElement.lang || '') ? 'en' : 'ja';
const W = () => WORDS[lang];
const T = lang === 'en'
  ? { loading: 'Loading the lesson…', unknown: 'This lesson is not in the gallery.', noId: 'No lesson was chosen.', fetch: 'The lesson could not be loaded.',
    mismatch: 'The file does not match the gallery list, so it is not played.', framed: 'This page does not run inside another page\'s frame.', frame: 'Lesson' }
  : { loading: '教材を読み込んでいます…', unknown: 'この教材は一覧にありません。', noId: '教材が選ばれていません。', fetch: '教材を読み込めませんでした。',
    mismatch: 'ファイルが一覧と合わないため、再生しません。', framed: 'このページはほかのページの枠の中では動きません。', frame: '教材' };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const root = document.getElementById('egatari-player');
const S = { frame: null, state: 'start', id: '', lesson: null };
const status = el('p', 'sp-status'); status.setAttribute('role', 'status');
const stage = el('div', 'sp-stage');

function say(t, kind = 'info') { status.textContent = t; status.dataset.kind = kind; status.hidden = !t; }
function sameOrigin(u) { try { const x = new URL(u, location.href); return x.origin === location.origin ? x : null; } catch { return null; } }

// the link box: the Viewer's own (play/links.mjs), in this page's chrome, outside the lesson's frame
function linkDialog() {
  const box = el('dialog', 'sp-link'); box.id = 'link-box';
  const title = el('h2'); title.id = 'link-t';
  const host = el('p', 'host'), url = el('p', 'url'), notes = el('ul'); notes.id = 'link-n';
  box.setAttribute('aria-labelledby', 'link-t'); box.setAttribute('aria-describedby', 'link-n');
  const row = el('div', 'row');
  const cancel = el('button'); cancel.type = 'button';
  const open = el('a', 'pri'); open.target = '_blank'; open.rel = 'noopener noreferrer'; open.referrerPolicy = 'no-referrer';
  row.append(cancel, open); box.append(title, host, url, notes, row);
  document.body.appendChild(box);
  return { box, title, host, url, notes, cancel, open };
}
const links = linkBox({ words: W, dlg: linkDialog() });

// fullscreen: the frame has no permission of its own (play/frame.mjs); the shim asks, this page puts the frame element fullscreen
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function fsEnabled() { const f = S.frame; if (!f || !(f.requestFullscreen || f.webkitRequestFullscreen)) return false; return (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) !== false; }
function fsState(refused) {
  const f = S.frame; if (!f || !f.contentWindow) return;
  const m = { egaViewer: 'fullscreen-state', on: fsElement() === f, enabled: fsEnabled() };
  if (refused) m.refused = true;
  f.contentWindow.postMessage(m, '*');
}
function fsRequest(on) {
  const f = S.frame; if (!f) return;
  if (on === (fsElement() === f)) { fsState(); return; }
  if (on) {
    const go = f.requestFullscreen || f.webkitRequestFullscreen;
    if (!go || !fsEnabled()) { fsState(true); return; }
    try { const p = go.call(f); if (p && typeof p.then === 'function') p.then(() => { try { f.contentWindow.focus(); } catch { /* refused */ } }, () => fsState(true)); } catch { fsState(true); }
    return;
  }
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  try { const p = ex && ex.call(document); if (p && typeof p.catch === 'function') p.catch(() => fsState()); } catch { fsState(); }
}
for (const t of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(t, () => fsState());

// navigation keys pressed in this page (not in the frame) go to the lesson, as in the Viewer (play/main.js forwardKey)
const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
document.addEventListener('keydown', (e) => {
  const f = S.frame;
  if (!f || !f.contentWindow || !NAV_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (e.key === ' ' && t.closest('button, a[href], summary, label')))) return;
  e.preventDefault();
  f.contentWindow.postMessage({ egaViewer: 'key', key: e.key, shift: e.shiftKey }, '*');
});

// messages from the lesson's frame: untrusted. Only from that frame, only from an opaque origin, only these shapes
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
const openLinkShape = (m) => { const k = Object.keys(m); return k.every((x) => x === 'egatari' || x === 'href' || x === 'text' || (x === 'download' && m.download === true)) && k.length === (m.download === true ? 4 : 3); };
window.addEventListener('message', (e) => {
  const f = S.frame;
  if (!f || e.source !== f.contentWindow || e.origin !== 'null') return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.egatari === 'openLink' && isStr(m.href, 4096) && isStr(m.text, 200) && openLinkShape(m)) links.request({ href: m.href, text: m.text, download: m.download === true });
  else if (m.egaViewer === 'fullscreen' && typeof m.on === 'boolean' && Object.keys(m).length === 2) fsRequest(m.on);
});

async function readCapped(res, max) {
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); if (b.length > max) throw new Error('over'); return b; }
  const r = res.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > max) { try { r.cancel(); } catch { /* gone */ } throw new Error('over'); } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function start() {
  if (!root) return;
  root.textContent = '';
  root.append(status, stage);
  let framed = true;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed) { S.state = 'framed'; say(T.framed, 'error'); return; }
  const id = new URLSearchParams(location.search).get('id') || '';
  if (!id) { S.state = 'no-id'; say(T.noId, 'error'); return; }
  if (!ID_RE.test(id)) { S.state = 'unknown'; say(T.unknown, 'error'); return; }
  S.id = id;
  const lockUrl = sameOrigin(root.dataset.lock || 'lock.json'), files = sameOrigin(root.dataset.files || 'files/');
  if (!lockUrl || !files) { S.state = 'fetch'; say(T.fetch, 'error'); return; }
  say(T.loading);
  let lesson;
  try {
    const lock = await (await fetch(lockUrl.href, { credentials: 'omit', cache: 'no-cache' })).json();
    lesson = Array.isArray(lock && lock.lessons) ? lock.lessons.find((l) => l && l.id === id) : null;
  } catch { S.state = 'fetch'; say(T.fetch, 'error'); return; }
  if (!lesson || !HEX.test(lesson.sha256 || '') || !Number.isInteger(lesson.size) || lesson.size <= 0 || lesson.size > MAX_BYTES) { S.state = 'unknown'; say(T.unknown, 'error'); return; }
  S.lesson = { id, title: String(lesson.title || id).slice(0, 300), lang: String(lesson.lang || '').slice(0, 35) };
  // the page may show the title: an element with data-player-title gets it as text (in the lesson's language), and the tab's title starts with it
  const shown = document.querySelector('[data-player-title]');
  if (shown) { shown.textContent = S.lesson.title; if (S.lesson.lang) shown.lang = S.lesson.lang; }
  document.title = S.lesson.title + ' – ' + document.title;
  let bytes;
  try {
    const res = await fetch(new URL(id + '.ega.bin', files).href, { credentials: 'omit' });
    if (!res.ok) throw new Error('http ' + res.status);
    bytes = await readCapped(res, lesson.size);
  } catch (e) { S.state = e && e.message === 'over' ? 'mismatch' : 'fetch'; say(S.state === 'mismatch' ? T.mismatch : T.fetch, 'error'); return; }
  if (bytes.length !== lesson.size || (await sha256Hex(bytes)) !== lesson.sha256) { S.state = 'mismatch'; say(T.mismatch, 'error'); return; }
  const text = new TextDecoder().decode(bytes);
  S.frame = makeFrame(lessonDocument(text, { shim: __LESSON_SHIM__ }), S.lesson.title || T.frame);
  if (S.lesson.lang) S.frame.setAttribute('lang', S.lesson.lang);
  say('');
  stage.appendChild(S.frame);
  S.frame.addEventListener('load', () => { fsState(); try { S.frame.contentWindow.focus(); } catch { /* refused */ } }, { once: true });
  S.state = 'playing';
}

window.__sitePlayer = { version: __SITE_PLAYER_VERSION__, state: () => ({ state: S.state, id: S.id, lesson: S.lesson }), links };
start().finally(() => document.documentElement.setAttribute('data-player-ready', ''));
