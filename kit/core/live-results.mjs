// 授業の部屋の結果（拡張 live の §3 Results。形は egatari/live の PROTOCOL.md の results、写しは FORMAT.LIVE_VENDOR_DIR の schema.json の $defs/results）。
// 部屋のサービスから先生がダウンロードした JSON を、先生の教材に役割 data の添付（format spec §3.8）として足すための純ロジック。
// Node にもブラウザにも依存しない（DOM・fs・時計に触れない）
//
//   parseResults(bytes)          → {ok: true, results} | {ok: false, code, errors}。code：'too-large' | 'not-utf8' | 'not-json' | 'not-results'
//                                  （写しの Schema と同じ形か。tools/test-live-results.mjs が ajv と比べる）
//   isLiveResults(bytes)         結果のファイルか（中身で見分ける。名前を替えても分かる）
//   summarizeResults(results)    {questions, responses, polls: [{id, step, prompt, choices, counts, total}]}（投票は活動の並び、その後に活動にない投票）
//   resultsDate(results)         開いた日（window.from の日付。その時刻の時間帯のまま）
//   roomMatch(results, live)     'match' | 'mismatch' | 'none'（教材の extensions.live に部屋がない）
//   liveResultsWarning(paths)    1 ファイルに結果が入るときの知らせ（コマンド）
//   resultsRecord(results, lang, taken)  添付の項目 {path, role: 'data', title, description}（題は部屋と日付だけ。学ぶ人の字も件数も入れない）
//
// 結果には学ぶ人が打った字（質問・名前）が入る。教材のファイルには残すが、学ぶ人に渡すもの（再生専用の派生・学ぶ人向けの添付）には入れない
// （拡張 live §3：Results are never written into play-only derivatives）。表示は必ず文字として（textContent）
import { FORMAT } from './format.mjs';

export const RESULTS_MAX_BYTES = 10 * 1024 * 1024;   // 添付 1 つの上限（kit/core/attachments.mjs の ATTACH_LIMITS.fileBytes。§3.8）

// 写しの Schema の $defs と同じ形（room・pid・activityId・stepKey・itemId・datetime）と上限
const RE = {
  room: /^r-[a-z2-7]{8}$/,
  pid: /^[A-Za-z0-9_-]{16,43}$/,
  activity: /^[A-Za-z0-9_-]{1,32}$/,
  step: /^(\*|[^\u0000-\u001f\u007f:]{1,80}:[^\u0000-\u001f\u007f:]{1,16})$/,
  item: /^q-[a-z2-7]{10}$/,
  datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/,
};
const MAX = { prompt: 300, choice: 100, choices: 12, name: 40, text: 500, choiceIndex: 11, label: 80 };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v) => typeof v === 'string';
// JSON Schema の maxLength は Unicode の符号位置で数える
const cps = (s) => { let n = 0; for (const _ of s) n++; return n; };
const short = (s, n) => str(s) && cps(s) <= n;
const onlyKeys = (o, keys, at, e) => { for (const k of Object.keys(o)) if (!keys.includes(k)) e.push(`${at}: unknown member "${k.slice(0, 40)}"`); };
const need = (o, keys, at, e) => { for (const k of keys) if (!own(o, k)) e.push(`${at}: "${k}" is missing`); };

function checkActivity(a, at, e) {
  if (!isObj(a)) { e.push(`${at}: not an object`); return; }
  if (a.kind === 'qa') { onlyKeys(a, ['id', 'kind', 'label'], at, e); need(a, ['id', 'kind'], at, e); }
  else if (a.kind === 'poll') {
    onlyKeys(a, ['id', 'kind', 'prompt', 'choices', 'label'], at, e); need(a, ['id', 'kind'], at, e);
    if (own(a, 'prompt') && !short(a.prompt, MAX.prompt)) e.push(`${at}.prompt: not a string of at most ${MAX.prompt} characters`);
    if (own(a, 'choices') && !(Array.isArray(a.choices) && a.choices.length <= MAX.choices && a.choices.every((c) => short(c, MAX.choice)))) e.push(`${at}.choices: not a list of at most ${MAX.choices} strings of at most ${MAX.choice} characters`);
  } else { e.push(`${at}.kind: not "qa" or "poll"`); return; }
  if (own(a, 'id') && !(str(a.id) && RE.activity.test(a.id))) e.push(`${at}.id: not an activity id`);
  // 表示名（label。egatari/live の活動の表示だけの字。省ける）
  if (own(a, 'label') && !short(a.label, MAX.label)) e.push(`${at}.label: not a string of at most ${MAX.label} characters`);
}
function checkResponse(r, at, e) {
  if (!isObj(r)) { e.push(`${at}: not an object`); return; }
  const common = ['kind', 'activity', 'step', 'pid', 'at'];
  if (r.kind === 'qa') {
    const req = [...common, 'id', 'text', 'read', 'answered', 'shown', 'hidden'];
    onlyKeys(r, [...req, 'name'], at, e); need(r, req, at, e);
    if (own(r, 'id') && !(str(r.id) && RE.item.test(r.id))) e.push(`${at}.id: not a question id`);
    if (own(r, 'text') && !short(r.text, MAX.text)) e.push(`${at}.text: not a string of at most ${MAX.text} characters`);
    for (const k of ['read', 'answered', 'shown', 'hidden']) if (own(r, k) && typeof r[k] !== 'boolean') e.push(`${at}.${k}: not true or false`);
  } else if (r.kind === 'poll') {
    const req = [...common, 'choice'];
    onlyKeys(r, [...req, 'name'], at, e); need(r, req, at, e);
    if (own(r, 'choice') && !(Number.isInteger(r.choice) && r.choice >= 0 && r.choice <= MAX.choiceIndex)) e.push(`${at}.choice: not an integer from 0 to ${MAX.choiceIndex}`);
  } else { e.push(`${at}.kind: not "qa" or "poll"`); return; }
  if (own(r, 'activity') && !(str(r.activity) && RE.activity.test(r.activity))) e.push(`${at}.activity: not an activity id`);
  if (own(r, 'step') && !(str(r.step) && RE.step.test(r.step))) e.push(`${at}.step: not a step key`);
  if (own(r, 'pid') && !(str(r.pid) && RE.pid.test(r.pid))) e.push(`${at}.pid: not a participant id`);
  if (own(r, 'at') && !(str(r.at) && RE.datetime.test(r.at))) e.push(`${at}.at: not an RFC 3339 time`);
  if (own(r, 'name') && !short(r.name, MAX.name)) e.push(`${at}.name: not a string of at most ${MAX.name} characters`);
}
// 写しの Schema の $defs/results と同じ判定。返すもの：エラーの配列（[] なら正しい。多すぎるときは始めの 20）
export function resultsErrors(v) {
  const e = [];
  if (!isObj(v)) return ['not an object'];
  const keys = ['v', 'room', 'window', 'activities', 'responses', 'exportedAt'];
  onlyKeys(v, keys, 'results', e); need(v, keys, 'results', e);
  if (own(v, 'v') && v.v !== 1) e.push('v: not 1');
  if (own(v, 'room') && !(str(v.room) && RE.room.test(v.room))) e.push('room: not a room id (r- and 8 characters)');
  if (own(v, 'window')) {
    const w = v.window;
    if (!isObj(w)) e.push('window: not an object');
    else { onlyKeys(w, ['from', 'to'], 'window', e); need(w, ['from', 'to'], 'window', e); for (const k of ['from', 'to']) if (own(w, k) && !(str(w[k]) && RE.datetime.test(w[k]))) e.push(`window.${k}: not an RFC 3339 time`); }
  }
  if (own(v, 'exportedAt') && !(str(v.exportedAt) && RE.datetime.test(v.exportedAt))) e.push('exportedAt: not an RFC 3339 time');
  if (own(v, 'activities')) {
    if (!isObj(v.activities)) e.push('activities: not an object');
    else for (const [k, list] of Object.entries(v.activities)) {
      if (!RE.step.test(k)) e.push(`activities: "${k.slice(0, 40)}" is not a step key`);
      if (!Array.isArray(list)) { e.push(`activities["${k.slice(0, 40)}"]: not a list`); continue; }
      list.forEach((a, i) => checkActivity(a, `activities["${k.slice(0, 40)}"][${i}]`, e));
      if (e.length > 20) break;
    }
  }
  if (own(v, 'responses')) {
    if (!Array.isArray(v.responses)) e.push('responses: not a list');
    else for (let i = 0; i < v.responses.length && e.length <= 20; i++) checkResponse(v.responses[i], `responses[${i}]`, e);
  }
  return e.slice(0, 20);
}

// bytes（Uint8Array）を読む：上限・UTF-8（BOM は除く）・JSON・Schema の形
export function parseResults(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length > RESULTS_MAX_BYTES) return { ok: false, code: 'too-large', errors: [`${b.length} bytes, over the limit of ${RESULTS_MAX_BYTES}`], n: b.length };
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return { ok: false, code: 'not-utf8', errors: ['not UTF-8 text'] }; }
  let v;
  try { v = JSON.parse(text.replace(/^﻿/, '')); } catch (err) { return { ok: false, code: 'not-json', errors: [String((err && err.message) || err).slice(0, 200)] }; }
  const errors = resultsErrors(v);
  if (errors.length) return { ok: false, code: 'not-results', errors };
  return { ok: true, results: v };
}
// 中身で見分ける（JSON で、結果の形のもの）。大きなものは JSON にする前に、先頭の印で外す
export function isLiveResults(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!b.length || b.length > RESULTS_MAX_BYTES) return false;
  const head = new TextDecoder('utf-8').decode(b.subarray(0, 64)).replace(/^﻿/, '').trimStart();
  if (head[0] !== '{') return false;
  return parseResults(b).ok;
}

// 投票ごとの数と、質問の数。投票の並びは活動（その段階の順、"*" が先）、その後に活動にない投票（結果から推した部屋は choices がない）
export function summarizeResults(r) {
  const polls = new Map();
  const acts = isObj(r.activities) ? r.activities : {};
  const keys = Object.keys(acts).sort((a, b) => (a === '*' ? -1 : b === '*' ? 1 : 0));
  for (const step of keys) for (const a of acts[step] || []) if (a.kind === 'poll' && !polls.has(a.id)) polls.set(a.id, { id: a.id, step, prompt: str(a.prompt) ? a.prompt : '', choices: Array.isArray(a.choices) ? a.choices.slice() : [], counts: [], total: 0 });
  let questions = 0;
  for (const x of r.responses || []) {
    if (x.kind === 'qa') { questions++; continue; }
    if (x.kind !== 'poll') continue;
    if (!polls.has(x.activity)) polls.set(x.activity, { id: x.activity, step: x.step, prompt: '', choices: [], counts: [], total: 0 });
    const p = polls.get(x.activity);
    p.counts[x.choice] = (p.counts[x.choice] || 0) + 1;
    p.total++;
  }
  for (const p of polls.values()) { const n = Math.max(p.choices.length, p.counts.length); p.counts = Array.from({ length: n }, (_, i) => p.counts[i] || 0); }
  return { questions, responses: (r.responses || []).length, polls: [...polls.values()] };
}
// 1 行の短い要約（添付の一覧に出す。字は呼ぶ側が textContent で出す）
export function summaryLines(s, lang) {
  const en = lang === 'en';
  const lines = [en ? `Questions: ${s.questions}` : `質問 ${s.questions} 件`];
  for (const p of s.polls) {
    const parts = p.counts.map((n, i) => `${p.choices[i] !== undefined && p.choices[i] !== '' ? p.choices[i] : '#' + (i + 1)}: ${n}`);
    const head = (en ? 'Poll ' : '投票 ') + p.id + (p.prompt ? (en ? ` “${p.prompt}”` : `「${p.prompt}」`) : '');
    lines.push(`${head} — ${parts.length ? parts.join(' · ') : (en ? 'no votes' : '投票なし')}`);
  }
  return lines;
}

export const resultsDate = (r) => r.window.from.slice(0, 10);
// 教材の設定（FORMAT.CONFIG_FILE の extensions.live。鍵なし）の部屋と比べる
export function roomMatch(r, live) {
  const room = isObj(live) && str(live.room) ? live.room : null;
  if (!room) return 'none';
  return room === r.room ? 'match' : 'mismatch';
}
const TXT = {
  ja: { title: (room, d) => `授業の部屋の結果（${room}、${d}）`, desc: '学ぶ人が授業の部屋で送った質問と投票の答え（名前を書いた人はその名前も）が入っています。人に渡すときは外してください' },
  en: { title: (room, d) => `Live room results (${room}, ${d})`, desc: 'Contains the questions and poll answers learners sent in the live room (and names, if they typed one). Remove it before giving the file to others' },
};
// 添付の項目。taken(path) → bool：もうある名前（同じ部屋と日付を 2 度取り込むときは -2・-3 …）
export function resultsRecord(r, lang, taken = () => false) {
  const X = TXT[lang === 'en' ? 'en' : 'ja'];
  const d = resultsDate(r);
  const base = `${FORMAT.ATTACH_DIR}/live-${r.room}-${d}`;
  let path = base + '.json';
  for (let n = 2; taken(path); n++) path = `${base}-${n}.json`;
  return { path, role: 'data', title: X.title(r.room, d), description: X.desc };
}

// 1 ファイル（.ega.html）に結果が入るときの知らせ（コマンド。編集アプリは書き出す前に尋ねる）。paths：exportPortable の stats.liveResults
export function liveResultsWarning(paths) {
  if (!Array.isArray(paths) || !paths.length) return null;
  return `this file contains live room results (${paths.map((x) => `"${x}"`).join(', ')}): learners' questions and answers. Remove them before giving it to others (export with --without-live-results)`;
}
