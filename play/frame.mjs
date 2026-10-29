// Egatari Viewer: the lesson's frame (spec §10.1.2, §11; live §2A).
// The lesson document is the page's trusted prefix followed by the file's bytes unchanged (app/preview-doc.js): the prefix carries
// the preview policy (PREVIEW_CSP: connect-src 'none', frame-src 'none', only data: and blob: resources), so it is in force before
// any untrusted byte is parsed, and the page never searches the lesson's markup for a place to insert anything.
// The frame is sandbox="allow-scripts" (no allow-same-origin, allow-popups, allow-forms, allow-modals, allow-downloads,
// allow-top-navigation): an opaque origin, so the lesson cannot read this page's OPFS, IndexedDB, cookies or DOM.
// A srcdoc document also inherits this page's own policy (both apply): the page's connect-src (its Live endpoints)
// is narrowed to 'none' by the prefix, so only the page itself can reach a Live room.
//
//   lessonDocument(text, {shim, hideLive}) → the srcdoc string
//     shim      the page's lesson shim source (play/lesson-shim.js, inlined at build time)
//     hideLive  hide the lesson's own Live mark and pane (kit/live.js): the page shows Live in its own chrome
//   SANDBOX     the frame's sandbox flags
//   makeFrame(doc, title) → a new <iframe> element (not yet in the document)
import { trustedPrefix } from '../app/preview-doc.js';

export const SANDBOX = 'allow-scripts';
const HIDE_LIVE = '<style>#live-mark,#live-pane,#live-pane-status{display:none!important}</style>';

export function lessonDocument(text, { shim = '', hideLive = false } = {}) {
  return trustedPrefix(shim) + (hideLive ? HIDE_LIVE : '') + String(text);
}

export function makeFrame(doc, title) {
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', SANDBOX);
  f.setAttribute('allow', 'autoplay');
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.setAttribute('title', title);
  f.id = 'lesson';
  f.srcdoc = doc;
  return f;
}
