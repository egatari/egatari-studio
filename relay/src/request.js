// SPDX-License-Identifier: MIT
// Part requests ("I want a part like this"): the request shape, its checks, and the issue it becomes.
// Pure code (no Workers or browser APIs): the relay Worker (src/index.js), the Studio editor (app/part-request.js)
// and the tests (tools/test-relay.mjs) share it.
//
// What a request holds is only what the teacher typed: what they want to show, and optionally the subject and the
// grade. No lesson content, no name, no e-mail, no image, nothing collected automatically. Unknown fields are refused,
// so a client cannot add anything else (an image included: the GitHub token is limited to Issues and there is no
// other storage, so drawings are described in words).

export const LIMITS = Object.freeze({
  WHAT_MAX: 2000,        // characters of "what to show" (required)
  SHORT_MAX: 60,         // characters of the subject and of the grade (optional)
  BODY_MAX_BYTES: 8192,  // the JSON request body, Turnstile token included
  TOKEN_MAX: 2048,       // characters of the Turnstile token
  TITLE_MAX: 80,         // characters of the issue title after the prefix
});
export const FIELDS = Object.freeze(['what', 'subject', 'grade']);
export const TITLE_PREFIX = '[request] ';
export const TURNSTILE_ACTION = 'part-request';
// The messages between Studio and the relay's widget page (postMessage). `type` keeps them apart from other messages
export const MSG_TYPE = 'egatari-part-request';

export class RequestError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// Control characters other than tab and newline, the Unicode line and paragraph separators, and bidi overrides
// (which could make the text read differently from what it holds) are removed; CRLF becomes LF.
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
export const cleanText = (s) => String(s).replace(/\r\n?/g, '\n').replace(STRIP, '').trim();
const len = (s) => [...s].length;

/**
 * Check a request body (already parsed JSON). Returns {what, subject, grade} with cleaned text,
 * or throws a RequestError. `extra` lists other keys the caller allows (the relay allows `turnstile`).
 */
export function checkRequest(body, { extra = [] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('bad_request', 'the body must be a JSON object');
  const allowed = new Set([...FIELDS, ...extra]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) throw new RequestError('unknown_field', `unknown field: ${k.slice(0, 40)}`);
  const out = {};
  for (const k of FIELDS) {
    const v = body[k] === undefined ? '' : body[k];
    if (typeof v !== 'string') throw new RequestError('bad_field', `${k} must be text`);
    const t = cleanText(v);
    const max = k === 'what' ? LIMITS.WHAT_MAX : LIMITS.SHORT_MAX;
    if (len(t) > max) throw new RequestError('too_long', `${k} is longer than ${max} characters`);
    if (k !== 'what' && /\n/.test(t)) throw new RequestError('bad_field', `${k} must be one line`);
    out[k] = t;
  }
  if (!out.what) throw new RequestError('what_required', 'say what you want to show');
  return out;
}

// A fence longer than any run of backticks in the text, so that nothing inside can close it: the teacher's text is shown
// as typed and GitHub renders nothing in it (no @mentions that notify people, no #123 or owner/repo#1 references that
// show up in other issues, no links, no images, no HTML)
export function fenced(text) {
  const runs = text.match(/`+/g) || [];
  const n = Math.max(3, ...runs.map((r) => r.length + 1));
  return '`'.repeat(n) + 'text\n' + text + '\n' + '`'.repeat(n);
}

// The issue title: the prefix and the first line of "what to show", shortened. Titles do not notify mentioned people;
// line breaks are already gone (first line only)
export function issueTitle(req) {
  const first = req.what.split('\n')[0].replace(/\s+/g, ' ').trim();
  const chars = [...first];
  return TITLE_PREFIX + (chars.length > LIMITS.TITLE_MAX ? chars.slice(0, LIMITS.TITLE_MAX - 1).join('') + '…' : first);
}

const HEAD = {
  ja: { what: '見せたいもの', subject: '分野', grade: '学年・対象', none: '（なし）' },
  en: { what: 'What to show', subject: 'Subject or field', grade: 'Grade or audience', none: '(none)' },
};
// The issue body: both languages' headings (the maintainers and other teachers read it), the teacher's text in fences,
// and a footer that says where it came from. Nothing else: no version, browser or time is added
export function issueBody(req) {
  const h = (k) => `${HEAD.en[k]} / ${HEAD.ja[k]}`;
  const short = (v) => (v ? fenced(v) : `${HEAD.en.none} ${HEAD.ja.none}`);
  return [
    `### ${h('what')}`, '', fenced(req.what), '',
    `### ${h('subject')}`, '', short(req.subject), '',
    `### ${h('grade')}`, '', short(req.grade), '',
    '---',
    'Sent from Egatari Studio ("Request a part…", no GitHub account). The sender typed only the text above; nothing else was sent.',
    'Egatari Studio の「こんなパーツが欲しい…」から送られました（GitHub のアカウントなし）。送った人が書いた上の文字のほかは、何も送られていません。',
  ].join('\n');
}

// Origins allowed to embed the widget and to receive its messages: a comma-separated list of exact origins.
// http://localhost:* and http://127.0.0.1:* are accepted only when the list says so (development config)
export function parseOrigins(list) {
  return String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function originAllowed(origin, list) {
  if (typeof origin !== 'string' || !origin || origin === 'null') return false;
  for (const o of parseOrigins(list)) {
    if (o === origin) return true;
    const m = /^(http:\/\/(?:localhost|127\.0\.0\.1)):\*$/.exec(o);
    if (m && new RegExp('^' + m[1].replace(/\./g, '\\.') + '(?::\\d{1,5})?$').test(origin)) return true;
  }
  return false;
}
