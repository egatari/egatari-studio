// SPDX-License-Identifier: MIT
// Tests of the part-request relay, with Node only (no Wrangler, no network): `npm test` here, and from the Studio repo
// root through tools/test-relay.mjs (npm test). The Worker's fetch handler is called with a fake env: a fake rate
// limiter, Cloudflare's Turnstile test secrets (answered locally), and an injected fetch that stands in for siteverify and
// the GitHub API.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import worker, { widgetCsp } from '../src/index.js';
import { LIMITS, checkRequest, cleanText, fenced, issueTitle, issueBody, originAllowed, RequestError, TURNSTILE_ACTION } from '../src/request.js';
import { WIDGET_JS, widgetHtml } from '../src/widget.js';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { fails++; console.log('  FAIL ' + msg); } else if (process.env.RELAY_TEST_VERBOSE) console.log('  ok   ' + msg); };

// The Worker must not log anything (observability is off, and nothing should reach console either)
const logged = [];
const ORIG = { ...console };
for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { if (a.length && typeof a[0] === 'string' && /^ {2}(ok|FAIL) /.test(a[0])) return orig(...a); logged.push(a.join(' ')); };
}

const PASS = '1x0000000000000000000000000000000AA', FAILS = '2x0000000000000000000000000000000AA';
const ORIGIN = 'https://request.egatari.org', STUDIO = 'https://studio.egatari.org';
const limiter = (allow = true) => ({ calls: [], async limit(o) { this.calls.push(o); return { success: allow }; } });
const envOf = (over = {}) => ({
  PUBLIC_ORIGIN: ORIGIN, STUDIO_ORIGINS: `${STUDIO}, http://localhost:*`, GITHUB_REPO: 'egatari/components', ISSUE_LABEL: 'request',
  TURNSTILE_SITEKEY: '', TURNSTILE_SECRET: PASS, GITHUB_TOKEN: 'test-token', REQUEST_LIMITER: limiter(), ...over,
});
// The injected fetch: GitHub answers 201 with an issue unless told otherwise; siteverify as given
const fakeFetch = ({ github = null, siteverify = null } = {}) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://api.github.com/')) {
      if (github) return github(url, init);
      return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/egatari/components/issues/7' }), { status: 201 });
    }
    if (String(url).startsWith('https://challenges.cloudflare.com/')) return new Response(JSON.stringify(siteverify || { success: true, action: TURNSTILE_ACTION, hostname: 'request.egatari.org' }));
    throw new Error('unexpected fetch ' + url);
  };
  f.calls = calls;
  return f;
};
const body = (over = {}) => ({ what: '水の循環を、蒸発・凝結・降水の順に矢印で見せたい', subject: '理科', grade: '中学 2 年', parent: STUDIO, turnstile: 'tok', ...over });
const post = (env, b, { origin = ORIGIN, type = 'application/json', ip = '203.0.113.9', fetchImpl = fakeFetch(), raw = null } = {}) => {
  const headers = { 'content-type': type, 'cf-connecting-ip': ip };
  if (origin !== null) headers.origin = origin;
  return worker.fetch(new Request(ORIGIN + '/api/request', { method: 'POST', headers, body: raw !== null ? raw : JSON.stringify(b) }), env, {}, { fetchImpl });
};
const errOf = async (res) => { try { return (await res.json()).error; } catch { return null; } };

// ---------------------------------------------------------------- the request's shape (src/request.js)
{
  const r = checkRequest({ what: '  a\r\nb\u202e ', subject: 'x' });
  ok(r.what === 'a\nb' && r.subject === 'x' && r.grade === '' && Object.keys(r).sort().join() === 'grade,subject,what', 'checkRequest: cleans text (CRLF, bidi override, spaces), grade optional');
  const code = (b, o) => { try { checkRequest(b, o); return 'ok'; } catch (e) { return e instanceof RequestError ? e.code : 'other'; } };
  ok(code({ what: 'x', image: 'data:image/png;base64,AAAA' }) === 'unknown_field', 'checkRequest: an image (or any other field) is refused');
  ok(code({ what: 'x', name: 'Taro' }) === 'unknown_field' && code({ what: 'x', email: 'a@b' }) === 'unknown_field', 'checkRequest: name and e-mail fields are refused');
  ok(code({ what: '' }) === 'what_required' && code({ what: ' \n ' }) === 'what_required' && code({}) === 'what_required', 'checkRequest: "what to show" is required');
  ok(code({ what: 'x'.repeat(LIMITS.WHAT_MAX) }) === 'ok' && code({ what: 'x'.repeat(LIMITS.WHAT_MAX + 1) }) === 'too_long', 'checkRequest: what is at most WHAT_MAX characters');
  ok(code({ what: '字'.repeat(LIMITS.WHAT_MAX) }) === 'ok', 'checkRequest: the limit counts characters, not bytes');
  ok(code({ what: 'x', subject: 'y'.repeat(LIMITS.SHORT_MAX + 1) }) === 'too_long' && code({ what: 'x', grade: 'a\nb' }) === 'bad_field', 'checkRequest: subject and grade are short, one line');
  ok(code({ what: 1 }) === 'bad_field' && code({ what: 'x', lang: 'ja' }) === 'unknown_field' && code([]) === 'bad_request' && code(null) === 'bad_request', 'checkRequest: types; the screen language is not part of a request');
  ok(code({ what: 'x', turnstile: 't' }) === 'unknown_field' && code({ what: 'x', turnstile: 't' }, { extra: ['turnstile'] }) === 'ok', 'checkRequest: extra keys only when the caller allows them');
  ok(cleanText('a\u0000b\u2066c\u2028d') === 'abcd', 'cleanText: control characters and isolates removed');
}
{
  const t = 'see ``` and ````` here';
  const f = fenced(t);
  const fence = f.split('\n')[0].replace(/text$/, '');
  ok(fence.length === 6 && f.endsWith('\n' + fence), 'fenced: the fence is longer than any backtick run inside');
  const req = checkRequest({ what: '@octocat look #1 egatari/egatari-studio#2 <img src=x> [l](https://x)\n2nd line', subject: '@team', grade: '' });
  const b = issueBody(req);
  const outside = b.replace(/(`{3,})text\n[\s\S]*?\n\1/g, '');
  ok(!/@octocat|@team|#1|#2|<img|https:\/\/x/.test(outside), 'issueBody: the teacher\'s text appears only inside fences (no mentions, references, HTML or links rendered)');
  ok(b.includes('(none) （なし）') && /Sent from Egatari Studio/.test(b) && !/version|browser|ip|user.?agent/i.test(b.replace(/Sent from[^\n]*\n/, '')), 'issueBody: empty grade shown as none; a fixed footer, nothing collected automatically');
  ok(issueTitle(req) === '[request] @octocat look #1 egatari/egatari-studio#2 <img src=x> [l](https://x)', 'issueTitle: prefix and the first line');
  ok([...issueTitle(checkRequest({ what: 'あ'.repeat(200) }))].length === '[request] '.length + LIMITS.TITLE_MAX && issueTitle(checkRequest({ what: 'あ'.repeat(200) })).endsWith('…'), 'issueTitle: shortened to TITLE_MAX characters');
}
{
  const L = `${STUDIO}, http://localhost:*, http://127.0.0.1:*`;
  ok(originAllowed(STUDIO, L) && originAllowed('http://localhost:8080', L) && originAllowed('http://127.0.0.1:5', L) && originAllowed('http://localhost', L), 'originAllowed: the Studio origin and localhost on any port (when listed)');
  ok(!originAllowed('https://studio.egatari.org.evil.example', L) && !originAllowed('http://localhost.evil:80', L) && !originAllowed('null', L) && !originAllowed('', L) && !originAllowed(undefined, L)
    && !originAllowed('https://localhost:8080', L) && !originAllowed('http://localhost:8080', STUDIO), 'originAllowed: look-alikes, null and unlisted localhost are refused');
}

// ---------------------------------------------------------------- POST /api/request
{
  const env = envOf(), f = fakeFetch();
  const res = await post(env, body(), { fetchImpl: f });
  const data = await res.json();
  ok(res.status === 201 && data.url === 'https://github.com/egatari/components/issues/7' && data.number === 7, 'a good request creates an issue and returns its URL');
  ok(res.headers.get('cache-control') === 'no-store' && !res.headers.get('access-control-allow-origin'), 'the answer is not cached and carries no CORS header (same-origin only)');
  const gh = f.calls.find((c) => c.url.startsWith('https://api.github.com/'));
  ok(gh && gh.url === 'https://api.github.com/repos/egatari/components/issues' && gh.init.method === 'POST', 'GitHub: POST /repos/egatari/components/issues');
  ok(gh && gh.init.headers.authorization === 'Bearer test-token' && gh.init.headers['x-github-api-version'] && gh.init.headers['user-agent'], 'GitHub: the token as a Bearer header, the API version and a user agent');
  const sent = gh ? JSON.parse(gh.init.body) : {};
  ok(sent.title === '[request] 水の循環を、蒸発・凝結・降水の順に矢印で見せたい' && JSON.stringify(sent.labels) === '["request"]' && Object.keys(sent).sort().join() === 'body,labels,title', 'GitHub: title, body and the label only');
  ok(sent.body && sent.body.includes('理科') && sent.body.includes('中学 2 年') && !sent.body.includes('203.0.113.9') && !sent.body.includes(STUDIO) && !sent.body.includes('tok\n'), 'GitHub: the body has the typed text, and not the IP, the Studio origin or the token');
  ok(env.REQUEST_LIMITER.calls.length === 1 && env.REQUEST_LIMITER.calls[0].key === 'request:203.0.113.9', 'rate limit keyed by the sender\'s IP');
  ok(!f.calls.some((c) => c.url.startsWith('https://challenges.cloudflare.com/')), 'a Turnstile test secret is answered locally (no siteverify call)');
}
{
  const s = async (env, b, o) => { const r = await post(env, b, o); return `${r.status} ${await errOf(r)}`; };
  ok(await s(envOf(), body(), { origin: STUDIO }) === '403 forbidden', 'a request with another Origin (Studio itself, any site) is refused: only the widget page may send');
  ok(await s(envOf(), body(), { origin: null }) === '403 forbidden', 'a request without Origin is refused');
  ok(await s(envOf({ GITHUB_TOKEN: '' }), body()) === '503 unavailable' && await s(envOf({ TURNSTILE_SECRET: '' }), body()) === '503 unavailable', 'missing secrets: fails closed (503)');
  ok(await s(envOf({ REQUEST_LIMITER: undefined }), body()) === '503 unavailable', 'missing rate limiter: fails closed (503)');
  ok(await s(envOf({ REQUEST_LIMITER: limiter(false) }), body()) === '429 rate_limited', 'over the rate limit: 429');
  ok(await s(envOf(), body(), { type: 'text/plain' }) === '415 bad_request', 'not JSON: 415');
  ok(await s(envOf(), null, { raw: JSON.stringify(body({ what: 'x'.repeat(LIMITS.BODY_MAX_BYTES) })) }) === '413 too_large', 'a body over BODY_MAX_BYTES: 413');
  ok(await s(envOf(), null, { raw: '{"what":' }) === '400 bad_request', 'broken JSON: 400');
  {
    // A body sent in chunks without Content-Length: the relay stops reading once it passes the cap
    let pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled++; if (pulled > 100) c.close(); else c.enqueue(new Uint8Array(1024).fill(32)); } });
    const res = await worker.fetch(new Request(ORIGIN + '/api/request', { method: 'POST', duplex: 'half', body: stream, headers: { origin: ORIGIN, 'content-type': 'application/json' } }), envOf(), {}, { fetchImpl: fakeFetch() });
    ok(res.status === 413 && pulled < 20, `a chunked body without Content-Length: 413, read stops early (${pulled} chunks of 1 KiB pulled)`);
  }
  ok(await s(envOf(), body({ image: 'data:image/png;base64,AAAA' })) === '400 unknown_field', 'an image field: 400 unknown_field');
  ok(await s(envOf(), body({ what: '' })) === '400 what_required', 'empty "what to show": 400');
  ok(await s(envOf(), body({ parent: 'https://evil.example' })) === '403 forbidden' && await s(envOf(), body({ parent: undefined })) === '403 forbidden', 'a parent that is not a Studio origin: 403');
  ok(await s(envOf(), body({ turnstile: '' })) === '400 turnstile_required' && await s(envOf(), body({ turnstile: 'x'.repeat(LIMITS.TOKEN_MAX + 1) })) === '400 turnstile_required', 'no or oversized Turnstile token: 400');
  ok(await s(envOf({ TURNSTILE_SECRET: FAILS }), body()) === '403 turnstile_failed', 'Turnstile fails: 403, no issue');
  const f = fakeFetch();
  await post(envOf({ TURNSTILE_SECRET: FAILS }), body(), { fetchImpl: f });
  ok(!f.calls.length, 'Turnstile fails: GitHub is not called');
  ok(await s(envOf(), body(), { fetchImpl: fakeFetch({ github: () => new Response('{}', { status: 403 }) }) }) === '502 github_failed', 'GitHub refuses: 502');
  ok(await s(envOf(), body(), { fetchImpl: fakeFetch({ github: () => new Response(JSON.stringify({ number: 1, html_url: 'https://evil.example/1' }), { status: 201 }) }) }) === '502 github_failed', 'GitHub answers an unexpected URL: 502 (only issue URLs of the repository are passed on)');
  ok(await s(envOf(), body(), { fetchImpl: fakeFetch({ github: () => { throw new Error('down'); } }) }) === '502 github_failed', 'GitHub unreachable: 502');
  ok(await s(envOf({ GITHUB_REPO: '' }), body()) === '503 unavailable', 'no repository configured: 503');
  const g = await worker.fetch(new Request(ORIGIN + '/api/request'), envOf());
  ok(g.status === 405, 'GET /api/request: 405');
}
{
  // A production secret goes to siteverify; the action and the hostname must match
  const prod = envOf({ TURNSTILE_SECRET: '0x-production-secret' });
  const f = fakeFetch();
  const r1 = await post(prod, body(), { fetchImpl: f });
  const sv = f.calls.find((c) => c.url.startsWith('https://challenges.cloudflare.com/'));
  ok(r1.status === 201 && sv && sv.init.body.get('remoteip') === '203.0.113.9' && sv.init.body.get('response') === 'tok', 'production secret: siteverify gets the token and the IP (not stored)');
  const st = async (siteverify) => (await post(prod, body(), { fetchImpl: fakeFetch({ siteverify }) })).status;
  ok(await st({ success: true, action: 'create-room', hostname: 'request.egatari.org' }) === 403, 'siteverify: a token made for another action (e.g. Live\'s create-room) is refused');
  ok(await st({ success: true, action: TURNSTILE_ACTION, hostname: 'studio.egatari.org' }) === 403, 'siteverify: a token from another hostname is refused');
  ok(await st({ success: false, 'error-codes': ['invalid-input-response'] }) === 403, 'siteverify: failure refused');
}

// ---------------------------------------------------------------- the widget page
{
  const env = envOf({ TURNSTILE_SITEKEY: '0x4AAA"<x>' });
  const w = await worker.fetch(new Request(ORIGIN + '/widget?parent=' + encodeURIComponent(STUDIO) + '&lang=ja'), env);
  const html = await w.text();
  const csp = w.headers.get('content-security-policy') || '';
  ok(w.status === 200 && /text\/html/.test(w.headers.get('content-type')) && html.includes('lang="ja"') && html.includes('data-sitekey="0x4AAA&quot;&lt;x&gt;"'), '/widget: the page, in the asked language, with the site key escaped');
  ok(/frame-ancestors https:\/\/studio\.egatari\.org http:\/\/localhost:\*$/.test(csp) && /script-src 'self' https:\/\/challenges\.cloudflare\.com;/.test(csp) && /connect-src 'self';/.test(csp) && /default-src 'none'/.test(csp), '/widget: CSP: only the Studio origins may frame it; scripts from itself and Turnstile; requests to itself only');
  ok(!w.headers.get('x-frame-options') && w.headers.get('referrer-policy') === 'no-referrer', '/widget: no X-Frame-Options (Studio frames it), no referrer');
  ok(!/<script>(?!<)/.test(html) && !/\son\w+=/.test(html), '/widget: no inline script or handler (the CSP allows none)');
  for (const p of ['/widget?parent=https%3A%2F%2Fevil.example', '/widget', '/widget?parent=null']) {
    ok((await worker.fetch(new Request(ORIGIN + p), env)).status === 403, `/widget refuses a parent that is not a Studio origin (${p})`);
  }
  const js = await worker.fetch(new Request(ORIGIN + '/widget.js'), env);
  const src = await js.text();
  ok(js.status === 200 && /javascript/.test(js.headers.get('content-type')), '/widget.js is served as JavaScript');
  let parsed = true;
  try { new vm.Script(src); } catch { parsed = false; }
  ok(parsed && src === WIDGET_JS && src.includes("'/api/request'") && src.includes('render=explicit'), '/widget.js parses and posts to /api/request; Turnstile rendered explicitly');
  ok(widgetCsp({ STUDIO_ORIGINS: '' }).endsWith("frame-ancestors 'none'"), 'no Studio origins configured: nobody may frame the widget');
  ok(!widgetHtml({ sitekey: '', lang: 'en' }).includes('challenges.cloudflare.com'), 'without a site key the page loads nothing from Cloudflare (development)');
  ok((await worker.fetch(new Request(ORIGIN + '/nope'), env)).status === 404 && (await (await worker.fetch(new Request(ORIGIN + '/api/health'), env)).json()).ok === true, '404 elsewhere; /api/health');
}

// ---------------------------------------------------------------- the configs
{
  const dev = fs.readFileSync(path.join(DIR, 'wrangler.toml'), 'utf8');
  const prod = fs.readFileSync(path.join(DIR, 'wrangler.production.toml'), 'utf8');
  for (const [n, t] of [['wrangler.toml', dev], ['wrangler.production.toml', prod]]) {
    ok(/\[observability\]\s*\nenabled = false/.test(t), `${n}: observability (request logs) off`);
    ok(/name = "REQUEST_LIMITER"/.test(t) && /GITHUB_REPO = "egatari\/components"/.test(t) && /ISSUE_LABEL = "request"/.test(t), `${n}: rate limiter, repository and label`);
    ok(!/^\s*(GITHUB_TOKEN|TURNSTILE_SECRET)\s*=/m.test(t) && !/ghp_|github_pat_/.test(t), `${n}: no secret in the config`);
  }
  ok(/STUDIO_ORIGINS = "https:\/\/studio\.egatari\.org"\s*$/m.test(prod) && !/localhost/.test(prod.replace(/^#.*$/gm, '')), 'production: only https://studio.egatari.org may use the relay');
  ok(/^PUBLIC_ORIGIN = "https:\/\/request\.egatari\.org"/m.test(prod) && /pattern = "request\.egatari\.org", custom_domain = true/.test(prod), 'production: its own origin and custom domain agree');
  const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'));
  ok(Object.values(pkg.devDependencies || {}).every((v) => /^\d+\.\d+\.\d+$/.test(v)) && !pkg.dependencies, 'package.json: exact versions, no runtime dependencies');
}

ok(logged.length === 0, `the relay wrote nothing to the console (${logged.slice(0, 2).join(' | ')})`);
for (const k of Object.keys(ORIG)) console[k] = ORIG[k];
console.log(fails ? `relay: ${fails} of ${count} failed` : `relay: all ${count} passed`);
process.exitCode = fails ? 1 : 0;
