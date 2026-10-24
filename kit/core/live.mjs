// 授業の部屋（拡張 live。format spec の extensions/live.md）を、再生専用の派生（§3.7）に付ける書き手の側。Node と編集アプリが共有する
// （node: の読み込み・fs を使わない。再生器のスクリプトの字は呼ぶ側が渡す：Node は kit/build.mjs、編集アプリは tools/build-app.mjs が同梱したもの）
//
//   addLive(playOnlyHtml, live, runtime)   部屋を付けた派生（live.sourceSha256 があれば拡張のブロックに入れる：質問を教材の版に結び付ける）：CSP の <meta>（<head> の開始タグの直後。どのスクリプトよりも前）・
//                                          拡張のブロック（#LIVE_BLOCK_ID）・再生器（kit/live.js）。live は鍵を含む完全なもの（validate {key:true}）
//   liveCsp(endpoint)                      派生の CSP（connect-src は endpoint の https: と wss: だけ）
//   liveRuntime(policySrc, clientSrc)      再生器の <script>（kit/core/live-policy.mjs を DECK.LivePolicy にして、kit/live.js を続ける）
//   parseRoomBlock(text)                   教員のページの「コピー」の字（{v, endpoint, room, key, window, activities?}）→ その object（違えば Error）
//   lessonLive(live)                       教材（作業フォルダの FORMAT.CONFIG_FILE と索引の extensions.live）に残す形：鍵を除く
//   mergeLive(lesson, room)                教材の設定と部屋の字を合わせる（部屋・鍵・窓・endpoint は部屋の字、活動は教材にあれば教材）
//   activitiesText(live)                   教員のページに渡す活動の JSON（部屋は同じ活動を知っている必要がある）
//   localToRfc3339(value, offsetMin)       <input type="datetime-local"> の値と、その時の時差（Date#getTimezoneOffset の符号を反転したもの）→ RFC 3339
//   stepLabel(stepKey, slides, lang)       活動の表示名（label）：「4 枚目『XML の壁』・段階 1」/ "Slide 4 'XML の壁', step 1"。slides は [{key, heading}]
//                                          （スライドの順）。番号は 1 から。見出しは約 24 字で切り、なければ鍵。* は「教材全体」。スライドが見つからなければ stepFallback
//   stepFallback(stepKey, lang)            label のない活動の表示：「s-xxx · 段階 1」（<slide>:<k> の k が数なら k + 1）。* は「教材全体」
//   stepText(stepKey, label, lang)         表示する字：label があればそれ、なければ stepFallback
//
// エディタからの一方向の設定（format spec の extensions/live.md §4、egatari/live の PROTOCOL.md §2.1）。どれも要求を出さない（乱数は crypto.getRandomValues、ハッシュは crypto.subtle）
//   newLiveSetup(rand?)                    → Promise<{setup, room, key}>：setup は 32 バイトの乱数（base64url 43 字）、room と key はそこから SHA-256 で導く
//   liveSetupIds(setup)                    → Promise<{room, key}>：導き方（サービスも同じ計算で確かめる。教材ファイルには setup が入らないので、ファイルだけでは部屋を作れない）
//   liveSetupString(live)                  {endpoint, room, key, setup, window, activities} → ホストのページに 1 回貼る 1 本の文字列（FORMAT.LIVE_SETUP_PREFIX + base64url(JSON)）
//   parseLiveSetupString(text)             その逆（空白・改行は無視）。形が違えば Error（message は 'prefix' | 'decode' | 'shape'）
//
// 部屋を付けない派生には、どれも触れない（今と同じバイト）
import { parse } from 'parse5';
import { LivePolicy } from './live-policy.mjs';
import { classicModule, jsonScript } from './build-core.mjs';
import { FORMAT } from './format.mjs';
import { SCRIPTING } from './code-scan.mjs';

const LP = LivePolicy();
const LP_DEV = LivePolicy({ allowLoopback: true });
const LOOPBACK_LINE = 'var LOOPBACK = false;';
export const LIVE_BLOCK_ID = 'deck-extensions';   // 再生専用の派生で、再生器が読む拡張のブロック（{live: …}。索引は派生にないので）
export const LIVE_EXT = 'live';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function liveCsp(endpoint, opts = {}) {
  const cs = (opts.devLoopback ? LP_DEV : LP).connectSrc(endpoint);
  if (!cs) throw new Error(`live: endpoint "${endpoint}" is not an https origin`);
  // 再生器が要るもの：埋め込んだスクリプトと CSS（inline）、data: と blob: の画像・字・音声と動画（音声の塊は blob: か data:）、
  // 発表者ビューの枠（同じファイルを ?view= で開く。file:// では file: ）。外へ出るのは endpoint だけ。eval・フォーム・<base>・object は使わない
  return [
    "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:', 'media-src data: blob:',
    `connect-src ${cs}`, "frame-src 'self' file:", "worker-src 'none'", "object-src 'none'", "manifest-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
}

const scriptSafe = (t) => String(t).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
// opts.devLoopback：開発版の再生器（ループバックの http: の部屋につなげる）。試験だけが使う。既定の再生器は https: だけ
export function liveRuntime(policySrc, clientSrc, opts = {}) {
  let src = String(policySrc);
  if (src.split(LOOPBACK_LINE).length !== 2) throw new Error('live: the player policy has no single LOOPBACK switch');
  if (opts.devLoopback) src = src.replace(LOOPBACK_LINE, 'var LOOPBACK = true;');
  policySrc = src;
  const cfg = JSON.stringify({ storePrefix: FORMAT.LIVE_STORE_PREFIX, blockId: LIVE_BLOCK_ID });
  return `<script>\nwindow.DECK = window.DECK || {}; DECK.LIVE_CFG = ${cfg};\n${scriptSafe(classicModule(policySrc, 'LivePolicy'))}\n${scriptSafe(clientSrc)}\n</script>`;
}

// <head> の開始タグの終わり（本物の要素。注釈や <template> の中の字ではない）
function headEnd(html) {
  const doc = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: SCRIPTING });
  const h = (doc.childNodes || []).find((n) => n.tagName === 'html');
  const head = h && (h.childNodes || []).find((n) => n.tagName === 'head');
  const st = head && head.sourceCodeLocation && head.sourceCodeLocation.startTag;
  return st ? st.endOffset : -1;
}

// opts.devLoopback：ループバックの http: の endpoint を許す（開発版。runtime も liveRuntime(…, {devLoopback: true}) のもの）
export function addLive(html, live, runtime, opts = {}) {
  const errs = (opts.devLoopback ? LP_DEV : LP).validate(live, { key: true });
  if (errs.length) throw new Error('live: ' + errs.join('; '));
  if (typeof runtime !== 'string' || !runtime.startsWith('<script>')) throw new Error('live: no player runtime');
  const text = String(html);
  if (text.includes(`id="${FORMAT.INDEX_ID}"`)) throw new Error('live: a live room is added only to a play-only derivative (this file still has its index)');
  if (/<meta\s+http-equiv\s*=\s*["']?content-security-policy/i.test(text)) throw new Error('live: the file already has a content security policy');
  if (text.includes(`id="${LIVE_BLOCK_ID}"`)) throw new Error('live: the file already carries a live room');
  const at = headEnd(text);
  if (at < 0) throw new Error('live: no <head>');
  if (/<script/i.test(text.slice(0, at))) throw new Error('live: a script comes before <head>; the policy must come first');
  const meta = `\n<meta http-equiv="Content-Security-Policy" content="${liveCsp(live.endpoint, opts).replace(/"/g, '&quot;')}">`;
  // 拡張のブロックと再生器：deck-meta の直後（実行系の前。再生器は deck:ready を待つ）
  const m = /<script type="application\/json" id="deck-meta">[^<]*<\/script>/.exec(text);
  if (!m || m.index < at) throw new Error('live: no deck-meta');
  const ix = m.index + m[0].length;
  // sourceSha256（あれば）：教材の版。再生専用の派生の deck-meta からは消える（format spec §3.7）ので、質問を教材のその版に結び付けるためにここに入れる（拡張 live §1）
  const data = { v: live.v, endpoint: live.endpoint, room: live.room, key: live.key, window: { from: live.window.from, to: live.window.to }, activities: live.activities,
    ...(typeof live.sourceSha256 === 'string' ? { sourceSha256: live.sourceSha256 } : {}) };
  const block = '\n' + jsonScript(LIVE_BLOCK_ID, { [LIVE_EXT]: data }) + '\n' + runtime;
  return text.slice(0, at) + meta + text.slice(at, ix) + block + text.slice(ix);
}

export function parseRoomBlock(input, opts = {}) {
  const s = String(input || '').trim();
  if (/[#&?]admin=|"adminKey"/.test(s)) throw new Error('admin');   // 教員の鍵（教員のリンク）は貼らない
  let o;
  try { o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { throw new Error('json'); }
  if (!isObj(o)) throw new Error('json');
  const out = { v: 1, endpoint: o.endpoint, room: o.room, key: o.key, window: o.window };
  if (isObj(o.activities)) out.activities = o.activities;
  const errs = (opts.devLoopback ? LP_DEV : LP).validate({ ...out, activities: out.activities || {} }, { key: true });
  if (errs.length) { const e = new Error('invalid'); e.details = errs; throw e; }
  return out;
}

// ---------------------------------------------------------------- 一方向の設定（PROTOCOL.md §2.1）
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const RE_SETUP = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// 5 バイト → base32 8 字（RFC 4648 の字、小文字）
function b32of5(b) {
  let s = '', bits = 0, acc = 0;
  for (const x of b.slice(0, 5)) {
    acc = (acc << 8) | x; bits += 8;
    while (bits >= 5) { bits -= 5; s += B32[(acc >> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  return s;
}
async function sha256(text) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
export async function liveSetupIds(setup) {
  if (typeof setup !== 'string' || !RE_SETUP.test(setup)) throw new Error('live: setup must be 43 base64url characters (32 random bytes)');
  const room = 'r-' + b32of5(await sha256(`${FORMAT.NAME}-live/v1/room:` + setup));
  const key = b64url((await sha256(`${FORMAT.NAME}-live/v1/key:` + setup)).slice(0, 16));
  return { room, key };
}
export async function newLiveSetup(rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = rand(32);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('live: the random source gave no 32 bytes');
  const setup = b64url(bytes);
  return { setup, ...(await liveSetupIds(setup)) };
}
const SETUP_MEMBERS = ['v', 'endpoint', 'room', 'key', 'setup', 'window', 'activities'];
export function liveSetupString(live) {
  const L = isObj(live) ? live : {};
  if (typeof L.setup !== 'string' || !RE_SETUP.test(L.setup)) throw new Error('live: no setup secret');
  const data = { v: 1, endpoint: L.endpoint, room: L.room, key: L.key, setup: L.setup,
    window: isObj(L.window) ? { from: L.window.from, to: L.window.to } : L.window, activities: isObj(L.activities) ? L.activities : {} };
  return FORMAT.LIVE_SETUP_PREFIX + b64url(new TextEncoder().encode(JSON.stringify(data)));
}
export function parseLiveSetupString(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const at = s.indexOf(FORMAT.LIVE_SETUP_PREFIX);
  if (at < 0) throw new Error('prefix');
  const body = s.slice(at + FORMAT.LIVE_SETUP_PREFIX.length);
  let o;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('decode');
    o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(body)));
  } catch { throw new Error('decode'); }
  if (!isObj(o) || o.v !== 1 || Object.keys(o).some((k) => !SETUP_MEMBERS.includes(k)) || SETUP_MEMBERS.some((k) => !own(o, k)) || !RE_SETUP.test(String(o.setup))) throw new Error('shape');
  return o;
}

export function lessonLive(live) {
  if (!isObj(live)) return null;
  const out = {};
  for (const k of ['v', 'endpoint', 'room', 'window', 'activities']) if (own(live, k)) out[k] = live[k];
  return out;
}

export function mergeLive(lesson, room) {
  const L = isObj(lesson) ? lesson : {}, R = isObj(room) ? room : {};
  const acts = isObj(L.activities) && Object.keys(L.activities).length ? L.activities : isObj(R.activities) ? R.activities : {};
  return { v: 1, endpoint: R.endpoint || L.endpoint || FORMAT.LIVE_ENDPOINT, room: R.room || L.room, key: R.key, window: R.window || L.window, activities: acts };
}

export function activitiesText(live) {
  return JSON.stringify(isObj(live) && isObj(live.activities) ? live.activities : {}, null, 2);
}

export function localToRfc3339(value, offsetMin) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(String(value || ''));
  if (!m || !Number.isInteger(offsetMin)) return '';
  const sign = offsetMin >= 0 ? '+' : '-', a = Math.abs(offsetMin);
  return `${m[1]}T${m[2]}:${m[3] || '00'}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// 活動の表示名（label。egatari/live の PROTOCOL.md §1：80 字まで、表示だけの字）。鍵はそのまま
const LABEL_MAX = LP.LIMITS.label;
const HEADING_MAX = 24;
const WORDS = {
  ja: { whole: '教材全体', step: (k) => `ステップ ${k}`, concl: '結論', slide: (n, h, st) => `${n} 枚目『${h}』・${st}`, fb: (s, st) => `${s} · ${st}` },
  en: { whole: 'whole lesson', step: (k) => `step ${k}`, concl: 'conclusion', slide: (n, h, st) => `Slide ${n} '${h}', ${st}`, fb: (s, st) => `${s} · ${st}` },
};
const words = (lang) => WORDS[lang === 'en' ? 'en' : 'ja'];
const cut = (t, n) => { const c = [...t]; return c.length <= n ? t : c.slice(0, n - 1).join('').trimEnd() + '…'; };
function splitStep(stepKey) {
  const s = String(stepKey || ''), i = s.lastIndexOf(':');
  return i > 0 ? { slide: s.slice(0, i), k: s.slice(i + 1) } : null;
}
function stepPart(W, k) { return /^\d+$/.test(k) ? W.step(Number(k) + 1) : k === 'concl' ? W.concl : W.step(k); }
export function stepFallback(stepKey, lang) {
  const W = words(lang);
  if (stepKey === '*') return W.whole;
  const p = splitStep(stepKey);
  return p ? W.fb(p.slide, stepPart(W, p.k)) : String(stepKey || '');
}
export function stepLabel(stepKey, slides, lang) {
  const W = words(lang);
  if (stepKey === '*') return W.whole;
  const p = splitStep(stepKey);
  const list = Array.isArray(slides) ? slides : [];
  const i = p ? list.findIndex((x) => x && x.key === p.slide) : -1;
  if (i < 0) return cut(stepFallback(stepKey, lang), LABEL_MAX);
  const h = cut(String(list[i].heading || '').replace(/\s+/g, ' ').trim() || p.slide, HEADING_MAX);
  return cut(W.slide(i + 1, h, stepPart(W, p.k)), LABEL_MAX);
}
export function stepText(stepKey, label, lang) {
  return typeof label === 'string' && label.trim() ? label.trim() : stepFallback(stepKey, lang);
}
