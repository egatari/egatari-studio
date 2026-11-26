// SPDX-License-Identifier: MIT
// Egatari part-request relay (Cloudflare Worker): turns a "Request a part…" from Egatari Studio into a public issue in
// the GitHub repository egatari/components with the label `request`, so that teachers can ask for a part without a
// GitHub account. See README.md (what is sent, abuse controls, setup).
//
// Routes:
//   GET  /widget?parent=<Studio origin>&lang=ja|en   the page Studio shows in a frame (Turnstile + sending; src/widget.js)
//   GET  /widget.js, /widget.css                     its script and style
//   POST /api/request                                from the widget page only (same origin): {what, subject, grade, lang, parent, turnstile}
//   GET  /api/health
// The Worker stores nothing and logs nothing: no console output, observability off in wrangler.toml.
import { LIMITS, RequestError, checkRequest, issueTitle, issueBody, originAllowed, parseOrigins } from './request.js';
import { verifyTurnstile } from './turnstile.js';
import { widgetHtml, WIDGET_JS, WIDGET_CSS, TURNSTILE_API } from './widget.js';

const API_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: API_HEADERS });
const fail = (status, code, message) => json({ v: 1, error: code, ...(message ? { message } : {}) }, status);

const TURNSTILE_ORIGIN = new URL(TURNSTILE_API).origin;

// The widget page's policy: its own script and style, the Turnstile script and frame, requests to itself only, and it may
// be framed only by the Studio origins (frame-ancestors; X-Frame-Options cannot list origins, so it is not sent)
export function widgetCsp(env) {
  const ancestors = parseOrigins(env.STUDIO_ORIGINS);
  return [
    "default-src 'none'",
    `script-src 'self' ${TURNSTILE_ORIGIN}`,
    "style-src 'self'",
    `frame-src ${TURNSTILE_ORIGIN}`,
    "connect-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${ancestors.length ? ancestors.join(' ') : "'none'"}`,
  ].join('; ');
}

function page(body, type, env) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': type,
      'content-security-policy': widgetCsp(env),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cache-control': type.startsWith('text/html') ? 'no-cache, no-transform' : 'no-cache',
    },
  });
}

async function createIssue(env, req, fetchImpl) {
  const repo = env.GITHUB_REPO || '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, status: 503, code: 'unavailable' };
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'egatari-part-request-relay',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ title: issueTitle(req), body: issueBody(req), labels: env.ISSUE_LABEL ? [env.ISSUE_LABEL] : [] }),
  });
  if (res.status !== 201) return { ok: false, status: 502, code: 'github_failed' };
  const data = await res.json();
  const prefix = `https://github.com/${repo}/issues/`;
  if (!data || typeof data.html_url !== 'string' || !data.html_url.startsWith(prefix) || !Number.isInteger(data.number)) {
    return { ok: false, status: 502, code: 'github_failed' };
  }
  return { ok: true, url: data.html_url, number: data.number };
}

// Read the body, stopping as soon as it passes `max` bytes (a missing or wrong Content-Length cannot make the relay read more).
// → the bytes, or null when too large
export async function readCapped(request, max) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { try { await reader.cancel(); } catch { /* already closed */ } return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function handleRequest(request, env, origin, { fetchImpl = fetch } = {}) {
  // From the widget page only: a browser always sends Origin on a POST, and it must be this relay's own origin
  if (request.headers.get('origin') !== origin) return fail(403, 'forbidden', 'send from the widget page');
  if (!env.GITHUB_TOKEN || !env.TURNSTILE_SECRET) return fail(503, 'unavailable', 'the relay is not set up');
  // Per-sender rate limit (Workers Rate Limiting binding, keyed by the client IP; counted in memory at Cloudflare, not stored)
  if (!env.REQUEST_LIMITER) return fail(503, 'unavailable', 'rate limiter not configured');
  const ip = request.headers.get('cf-connecting-ip') || '';
  const { success } = await env.REQUEST_LIMITER.limit({ key: 'request:' + (ip || 'unknown') });
  if (!success) return fail(429, 'rate_limited', 'too many requests; try again in a minute');
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return fail(415, 'bad_request', 'send application/json');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > LIMITS.BODY_MAX_BYTES) return fail(413, 'too_large');
  const bytes = await readCapped(request, LIMITS.BODY_MAX_BYTES);
  if (!bytes) return fail(413, 'too_large');
  let req, token, parent;
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    req = checkRequest(body, { extra: ['turnstile', 'parent'] });
    token = body.turnstile;
    parent = body.parent;
  } catch (e) {
    return fail(400, e instanceof RequestError ? e.code : 'bad_request', e instanceof RequestError ? e.message : 'body is not JSON');
  }
  if (!originAllowed(parent, env.STUDIO_ORIGINS)) return fail(403, 'forbidden', 'not from Egatari Studio');
  // Turnstile last, so that a malformed request does not spend the token
  if (typeof token !== 'string' || !token || token.length > LIMITS.TOKEN_MAX) return fail(400, 'turnstile_required', 'a Turnstile token is required');
  const v = await verifyTurnstile(env, token, ip, { fetchImpl, expectedHostname: new URL(origin).hostname });
  if (!v.ok) return fail(v.status, v.status === 503 ? 'unavailable' : 'turnstile_failed', 'Turnstile: ' + v.reason);
  let made;
  try { made = await createIssue(env, req, fetchImpl); } catch { made = { ok: false, status: 502, code: 'github_failed' }; }
  if (!made.ok) return fail(made.status, made.code);
  return json({ v: 1, url: made.url, number: made.number }, 201);
}

export default {
  async fetch(request, env, ctx, { fetchImpl } = {}) {
    const url = new URL(request.url);
    const origin = env.PUBLIC_ORIGIN || url.origin;
    const path = url.pathname;
    const get = request.method === 'GET' || request.method === 'HEAD';

    if (path === '/api/request') {
      if (request.method !== 'POST') return fail(405, 'bad_request', 'use POST');
      return handleRequest(request, env, origin, fetchImpl ? { fetchImpl } : {});
    }
    if (path === '/api/health' && get) return json({ v: 1, ok: true, service: 'egatari-part-request' });
    if (path === '/widget' && get) {
      // The page talks only to the Studio origin named here, and only if it is one of the allowed origins
      if (!originAllowed(url.searchParams.get('parent'), env.STUDIO_ORIGINS)) return fail(403, 'forbidden', 'not from Egatari Studio');
      const lang = url.searchParams.get('lang') === 'ja' ? 'ja' : 'en';
      return page(widgetHtml({ sitekey: env.TURNSTILE_SITEKEY || '', lang }), 'text/html; charset=utf-8', env);
    }
    if (path === '/widget.js' && get) return page(WIDGET_JS, 'text/javascript; charset=utf-8', env);
    if (path === '/widget.css' && get) return page(WIDGET_CSS, 'text/css; charset=utf-8', env);
    return fail(404, 'not_found');
  },
};
