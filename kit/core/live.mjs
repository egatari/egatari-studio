// 授業の部屋（拡張 live。format spec の extensions/live.md）を、再生専用の派生（§3.7）に付ける書き手の側。Node と編集アプリが共有する
// （node: の読み込み・fs を使わない。再生器のスクリプトの字は呼ぶ側が渡す：Node は kit/build.mjs、編集アプリは tools/build-app.mjs が同梱したもの）
//
//   addLive(playOnlyHtml, live, runtime)   部屋を付けた派生：CSP の <meta>（<head> の開始タグの直後。どのスクリプトよりも前）・
//                                          拡張のブロック（#LIVE_BLOCK_ID）・再生器（kit/live.js）。live は鍵を含む完全なもの（validate {key:true}）
//   liveCsp(endpoint)                      派生の CSP（connect-src は endpoint の https: と wss: だけ）
//   liveRuntime(policySrc, clientSrc)      再生器の <script>（kit/core/live-policy.mjs を DECK.LivePolicy にして、kit/live.js を続ける）
//   parseRoomBlock(text)                   教員のページの「コピー」の字（{v, endpoint, room, key, window, activities?}）→ その object（違えば Error）
//   lessonLive(live)                       教材（作業フォルダの FORMAT.CONFIG_FILE と索引の extensions.live）に残す形：鍵を除く
//   mergeLive(lesson, room)                教材の設定と部屋の字を合わせる（部屋・鍵・窓・endpoint は部屋の字、活動は教材にあれば教材）
//   activitiesText(live)                   教員のページに渡す活動の JSON（部屋は同じ活動を知っている必要がある）
//   localToRfc3339(value, offsetMin)       <input type="datetime-local"> の値と、その時の時差（Date#getTimezoneOffset の符号を反転したもの）→ RFC 3339
//
// 部屋を付けない派生には、どれも触れない（今と同じバイト）
import { parse } from 'parse5';
import { LivePolicy } from './live-policy.mjs';
import { classicModule, jsonScript } from './build-core.mjs';
import { FORMAT } from './format.mjs';
import { SCRIPTING } from './code-scan.mjs';

const LP = LivePolicy();
export const LIVE_BLOCK_ID = 'deck-extensions';   // 再生専用の派生で、再生器が読む拡張のブロック（{live: …}。索引は派生にないので）
export const LIVE_EXT = 'live';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function liveCsp(endpoint) {
  const cs = LP.connectSrc(endpoint);
  if (!cs) throw new Error(`live: endpoint "${endpoint}" is not an https origin`);
  // 再生器が要るもの：埋め込んだスクリプトと CSS（inline）、data: と blob: の画像・字・音声と動画（音声の塊は blob: か data:）、
  // 発表者ビューの枠（同じファイルを ?view= で開く。file:// では file: ）。外へ出るのは endpoint だけ。eval・フォーム・<base>・object は使わない
  return [
    "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:', 'media-src data: blob:',
    `connect-src ${cs}`, "frame-src 'self' file:", "worker-src 'none'", "object-src 'none'", "manifest-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
}

const scriptSafe = (t) => String(t).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
export function liveRuntime(policySrc, clientSrc) {
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

export function addLive(html, live, runtime) {
  const errs = LP.validate(live, { key: true });
  if (errs.length) throw new Error('live: ' + errs.join('; '));
  if (typeof runtime !== 'string' || !runtime.startsWith('<script>')) throw new Error('live: no player runtime');
  const text = String(html);
  if (text.includes(`id="${FORMAT.INDEX_ID}"`)) throw new Error('live: a live room is added only to a play-only derivative (this file still has its index)');
  if (/<meta\s+http-equiv\s*=\s*["']?content-security-policy/i.test(text)) throw new Error('live: the file already has a content security policy');
  if (text.includes(`id="${LIVE_BLOCK_ID}"`)) throw new Error('live: the file already carries a live room');
  const at = headEnd(text);
  if (at < 0) throw new Error('live: no <head>');
  if (/<script/i.test(text.slice(0, at))) throw new Error('live: a script comes before <head>; the policy must come first');
  const meta = `\n<meta http-equiv="Content-Security-Policy" content="${liveCsp(live.endpoint).replace(/"/g, '&quot;')}">`;
  // 拡張のブロックと再生器：deck-meta の直後（実行系の前。再生器は deck:ready を待つ）
  const m = /<script type="application\/json" id="deck-meta">[^<]*<\/script>/.exec(text);
  if (!m || m.index < at) throw new Error('live: no deck-meta');
  const ix = m.index + m[0].length;
  const data = { v: live.v, endpoint: live.endpoint, room: live.room, key: live.key, window: { from: live.window.from, to: live.window.to }, activities: live.activities };
  const block = '\n' + jsonScript(LIVE_BLOCK_ID, { [LIVE_EXT]: data }) + '\n' + runtime;
  return text.slice(0, at) + meta + text.slice(at, ix) + block + text.slice(ix);
}

export function parseRoomBlock(input) {
  const s = String(input || '').trim();
  if (/[#&?]admin=|"adminKey"/.test(s)) throw new Error('admin');   // 教員の鍵（教員のリンク）は貼らない
  let o;
  try { o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { throw new Error('json'); }
  if (!isObj(o)) throw new Error('json');
  const out = { v: 1, endpoint: o.endpoint, room: o.room, key: o.key, window: o.window };
  if (isObj(o.activities)) out.activities = o.activities;
  const errs = LP.validate({ ...out, activities: out.activities || {} }, { key: true });
  if (errs.length) { const e = new Error('invalid'); e.details = errs; throw e; }
  return out;
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
