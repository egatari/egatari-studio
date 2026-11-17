// SPDX-License-Identifier: MIT
// The relay's widget page (/widget): a small page that Egatari Studio shows in a frame inside its "Request a part…"
// dialog. It holds the Cloudflare Turnstile check and sends the request to this relay (same origin), so that the Studio
// page itself never loads a third-party script and never connects to another server (its CSP keeps connect-src 'self';
// only frame-src names this relay).
//
// Messages (window.postMessage, type MSG_TYPE), to and from the Studio origin named in ?parent= only:
//   widget → Studio  {type, t: "ready", check: bool}   the page is loaded (check: a Turnstile widget is shown)
//                    {type, t: "token", ok: bool}       the check passed (ok: true) or expired / failed (ok: false)
//                    {type, t: "height", px}            the page's height, so the frame fits it
//                    {type, t: "sent", url, number}     the issue was created
//                    {type, t: "error", code, status}   the request was refused (code from the relay)
//   Studio → widget  {type, t: "send", request: {what, subject, grade}}
// The page is served as two files (HTML and /widget.js) so that its CSP needs no inline script.

import { MSG_TYPE, TURNSTILE_ACTION } from './request.js';
import { DUMMY_TOKEN } from './turnstile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function widgetHtml({ sitekey, lang }) {
  const ja = lang === 'ja';
  return `<!DOCTYPE html>
<html lang="${ja ? 'ja' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${ja ? '送る前の確認' : 'Check before sending'}</title>
<link rel="stylesheet" href="/widget.css">
</head>
<body>
<div id="turnstile" data-sitekey="${esc(sitekey)}" data-language="${ja ? 'ja' : 'en'}"></div>
<script src="/widget.js"></script>
</body>
</html>
`;
}

export const WIDGET_CSS = `html,body{margin:0;padding:0;background:transparent;font:14px system-ui,sans-serif}
#turnstile{min-height:0}
`;

// The page's script. Written as a function so that the tests can read it and the Worker serves its source.
// It runs in the browser only; it takes the settings from the page's address.
/* global turnstile */
function widgetMain(MSG, DUMMY, ACTION, API) {
  const q = new URLSearchParams(location.search);
  const parent = q.get('parent') || '';
  const box = document.getElementById('turnstile');
  const hasCheck = !!box.getAttribute('data-sitekey');
  // Without a site key (development): no widget, the dummy token that only Cloudflare's test secrets accept
  let token = hasCheck ? '' : DUMMY;
  const post = (m) => { if (window.parent !== window && parent) window.parent.postMessage({ type: MSG, ...m }, parent); };
  const height = () => post({ t: 'height', px: Math.ceil(document.documentElement.scrollHeight) });
  // Turnstile, rendered explicitly once its script has loaded (the callbacks exist before it can call them)
  if (hasCheck) {
    window.egatariTurnstileLoad = () => {
      turnstile.render(box, {
        sitekey: box.getAttribute('data-sitekey'), action: ACTION, language: box.getAttribute('data-language'), size: 'flexible',
        callback: (t) => { token = t; post({ t: 'token', ok: true }); height(); },
        'expired-callback': () => { token = ''; post({ t: 'token', ok: false }); },
        'error-callback': () => { token = ''; post({ t: 'token', ok: false }); height(); },
      });
    };
    const s = document.createElement('script');
    s.src = API + '?render=explicit&onload=egatariTurnstileLoad';
    s.async = true;
    document.head.append(s);
  }
  let busy = false;
  window.addEventListener('message', async (e) => {
    if (e.source !== window.parent || e.origin !== parent) return;
    const m = e.data;
    if (!m || m.type !== MSG || m.t !== 'send' || busy) return;
    if (!token) { post({ t: 'error', code: 'turnstile_required', status: 400 }); return; }
    busy = true;
    try {
      const res = await fetch('/api/request', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ ...m.request, turnstile: token, parent }),
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok && data && typeof data.url === 'string') post({ t: 'sent', url: data.url, number: data.number });
      else post({ t: 'error', code: (data && data.error) || 'failed', status: res.status });
    } catch {
      post({ t: 'error', code: 'network', status: 0 });
    } finally {
      busy = false;
      // A token is good for one request: after any attempt, ask for a new check
      if (hasCheck) { token = ''; try { turnstile.reset(box); } catch { /* not loaded */ } }
    }
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(height).observe(document.documentElement);
  post({ t: 'ready', check: hasCheck });
  height();
}

export const TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
export const WIDGET_JS = `(${widgetMain})(${[MSG_TYPE, DUMMY_TOKEN, TURNSTILE_ACTION, TURNSTILE_API].map((v) => JSON.stringify(v)).join(', ')});\n`;
