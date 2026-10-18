// 添付（format spec §9C.3。名前と識別子は kit/core/format.mjs の ATTACH_*）：読み手のためのファイル（元の原稿・PDF・コード・データ・補足）。
// 組み立てには使わない。再生器はダウンロードだけを出し、開かない・実行しない。Node にもブラウザにも依存しない
//
//   作業フォルダ：ファイルは attachments/ の下。役割と題は設定のファイル（FORMAT.CONFIG_FILE）の項目 FORMAT.ATTACH_KEY：
//     {"docId": …, "attachments": [{"path": "attachments/paper.pdf", "role": "pdf", "title": "論文（PDF）"}]}（索引の index.attachments と同じ形）
//   1 ファイル（.ega.html）：ファイルは files（archive path 'attachments/…'）、一覧は index.attachments（役割のあるものだけ）
//
//   configEntries(conf)                 設定のファイルの一覧 → {entries: Map(path → 項目), problems}
//   planAttachments(files, conf, opts)  作業フォルダの attachments/ のファイル（[{path, size}]）と設定 → {include, list, problems}
//   attachmentsOf(index)                文書の索引から、再生器・編集器が出す添付（files にあり、役割が正しいもの）
//   attachmentName(path)                ダウンロードの名前（パスの最後。危ない字を _ に）
// problems：{code, path?, …}。code は kit/check-messages.mjs の attach…（検査器と書き出しの知らせが同じ言葉を使う）
import { FORMAT } from './format.mjs';
import { pathProblem, excludedReason, foldPath } from './portable.mjs';

const MiB = 1024 * 1024;
// 添付の上限（このエディタの決め）：1 つ 20 MiB、合わせて 50 MiB、100 個まで。書き出した 1 ファイルは base64 で 4/3 倍になる
// （50 MiB → 約 67 MiB。形式の推奨の上限は 1 ファイル 100 MiB・取り出した合計 128 MiB・1 つ 32 MiB、§11）。題は 200 字まで
export const ATTACH_LIMITS = Object.freeze({ fileBytes: 20 * MiB, totalBytes: 50 * MiB, count: 100, titleChars: 200 });
export const ATTACH_ROLES = FORMAT.ATTACH_ROLES;
const PREFIX = FORMAT.ATTACH_DIR + '/';
export const ATTACH_PREFIX = PREFIX;
export const isAttachPath = (p) => typeof p === 'string' && p.startsWith(PREFIX) && p.length > PREFIX.length;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// 1 つのパスの問題（添付として）。なければ null
export function attachPathProblem(p) {
  if (typeof p !== 'string' || !p) return 'not a path';
  if (!isAttachPath(p)) return `not under ${PREFIX}`;
  const why = pathProblem(p);
  if (why) return why;
  const ex = excludedReason(p);
  if (ex) return `excluded (${ex})`;
  return null;
}

// 設定のファイル（parse した object）の添付の一覧。並びは書いた順。同じパスが 2 度なら後のものを捨てる
export function configEntries(conf) {
  const entries = new Map(), problems = [];
  const list = isObj(conf) ? conf[FORMAT.ATTACH_KEY] : undefined;
  if (list === undefined) return { entries, problems };
  if (!Array.isArray(list)) { problems.push({ code: 'attachBadConfig', why: `"${FORMAT.ATTACH_KEY}" is not an array` }); return { entries, problems }; }
  const seen = new Map();
  list.forEach((e, j) => {
    if (!isObj(e) || typeof e.path !== 'string') { problems.push({ code: 'attachBadConfig', why: `${FORMAT.ATTACH_KEY}[${j}] has no "path"` }); return; }
    const why = attachPathProblem(e.path);
    if (why) { problems.push({ code: 'attachBadName', path: e.path, why }); return; }
    const f = foldPath(e.path);
    if (seen.has(f)) { problems.push({ code: 'attachDuplicate', path: e.path, other: seen.get(f) }); return; }
    seen.set(f, e.path);
    if (own(e, 'role') && !ATTACH_ROLES.includes(e.role)) problems.push({ code: 'attachBadRole', path: e.path, role: String(e.role).slice(0, 40) });
    if (own(e, 'title') && (typeof e.title !== 'string' || e.title.length > ATTACH_LIMITS.titleChars)) problems.push({ code: 'attachBadTitle', path: e.path, max: ATTACH_LIMITS.titleChars });
    entries.set(e.path, e);
  });
  return { entries, problems };
}

// 索引に書く項目：path・role・title（あれば）と、ほかの書き手が足した知らない項目（そのまま残す。§7.1）
function indexEntry(e) {
  const o = { path: e.path, role: e.role };
  if (typeof e.title === 'string' && e.title && e.title.length <= ATTACH_LIMITS.titleChars) o.title = e.title;
  for (const k of Object.keys(e)) if (!own(o, k) && k !== 'title') o[k] = e[k];
  return o;
}

// files：作業フォルダの attachments/ の下のファイル [{path, size}]（size は分からなければ null）。conf：設定のファイルの object。
// opts.carry：開いた文書の index.attachments（その文書を作り直すとき、設定のファイルに書いていない役割と題を引き継ぐ。ほかの書き手の文書）
// opts.limits：上限（試験用）
// 返すもの：include（文書に入れるパス。並びは設定の順、残りはパスの順）・list（index.attachments：役割のあるもの）・problems
export function planAttachments(files, conf, opts = {}) {
  const L = { ...ATTACH_LIMITS, ...(opts.limits || {}) };
  const { entries, problems } = configEntries(conf);
  const carry = new Map();
  if (Array.isArray(opts.carry)) for (const c of opts.carry) if (isObj(c) && typeof c.path === 'string' && !entries.has(c.path)) carry.set(c.path, c);
  const sizeOf = new Map();
  const all = [];
  for (const f of files || []) {
    const p = typeof f === 'string' ? f : f && f.path;
    if (!isAttachPath(p)) continue;
    const why = attachPathProblem(p);
    if (why) { problems.push({ code: /^excluded/.test(why) ? 'attachExcluded' : 'attachBadName', path: p, why }); continue; }
    sizeOf.set(p, f && Number.isFinite(f.size) ? f.size : null);
    all.push(p);
  }
  for (const p of entries.keys()) if (!sizeOf.has(p)) problems.push({ code: 'attachMissing', path: p });
  const order = [...[...entries.keys()].filter((p) => sizeOf.has(p)), ...all.filter((p) => !entries.has(p)).sort()];
  const include = [], list = [];
  let total = 0;
  for (const p of order) {
    const n = sizeOf.get(p);
    if (n !== null && n > L.fileBytes) { problems.push({ code: 'attachTooLarge', path: p, n, max: L.fileBytes }); continue; }
    if (include.length >= L.count) { problems.push({ code: 'attachCount', path: p, max: L.count }); continue; }
    if (n !== null && total + n > L.totalBytes) { problems.push({ code: 'attachTotal', path: p, n: total + n, max: L.totalBytes }); continue; }
    total += n || 0;
    include.push(p);
    const e = entries.get(p) || carry.get(p) || null;
    if (!e || !ATTACH_ROLES.includes(e.role)) { if (!e || !own(e, 'role')) problems.push({ code: 'attachNoRole', path: p }); continue; }
    list.push(indexEntry({ ...e, path: p }));
  }
  return { include, list, problems, total, limits: L };
}

// 文書の索引の添付：files にあり、役割が正しく、パスが添付の場所のもの。題・役割・大きさ・塊を添える（読み手は塊を復号して hash を確かめてから渡す）
export function attachmentsOf(index) {
  const out = [];
  if (!isObj(index) || !Array.isArray(index[FORMAT.ATTACH_KEY]) || !isObj(index.files) || !isObj(index.blobs)) return out;
  const seen = new Set();
  for (const e of index[FORMAT.ATTACH_KEY]) {
    if (!isObj(e) || typeof e.path !== 'string' || !isAttachPath(e.path) || pathProblem(e.path) || !ATTACH_ROLES.includes(e.role) || seen.has(e.path)) continue;
    if (!own(index.files, e.path)) continue;
    const b = index.blobs[index.files[e.path]];
    if (!isObj(b)) continue;
    seen.add(e.path);
    out.push({ path: e.path, role: e.role, title: typeof e.title === 'string' ? e.title : null, bytes: b.bytes, sha256: b.sha256, blob: index.files[e.path] });
  }
  return out;
}
// 索引の添付の一覧の問題（読み手の知らせ。文書は断らない：一覧から外すだけ）
export function attachmentIndexWarnings(index) {
  const w = [];
  if (!isObj(index) || !own(index, FORMAT.ATTACH_KEY)) return w;
  const list = index[FORMAT.ATTACH_KEY];
  if (!Array.isArray(list)) return [`${FORMAT.ATTACH_KEY}: not an array; ignored`];
  list.forEach((e, j) => {
    const at = `${FORMAT.ATTACH_KEY}[${j}]`;
    if (!isObj(e) || typeof e.path !== 'string') { w.push(`${at}: no path; ignored`); return; }
    if (!isAttachPath(e.path) || pathProblem(e.path)) { w.push(`${at}: "${e.path.slice(0, 80)}" is not a path under ${PREFIX}; ignored`); return; }
    if (!ATTACH_ROLES.includes(e.role)) w.push(`${at}: role "${String(e.role).slice(0, 40)}" is not one of ${ATTACH_ROLES.join(', ')}; ignored`);
    else if (!isObj(index.files) || !own(index.files, e.path)) w.push(`${at}: "${e.path.slice(0, 80)}" is not in files; ignored`);
  });
  return w;
}

// ダウンロードの名前：パスの最後の部分。制御文字と、OS が断る字（\ / : * ? " < > |）は _ に。空なら "attachment"
export function attachmentName(p) {
  const n = String(p || '').split('/').pop().replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g, '_').trim();
  return n || 'attachment';
}

// 書き出しの知らせ（英語、'portable: …'）
export function problemText(x) {
  const p = x.path ? `"${x.path}"` : '';
  switch (x.code) {
    case 'attachBadConfig': return `attachments: ${x.why}`;
    case 'attachBadName': return `attachment ${p}: ${x.why}; not included`;
    case 'attachExcluded': return `attachment ${p}: ${x.why}; not included`;
    case 'attachDuplicate': return `attachment ${p} is listed twice (also as "${x.other}"); the second entry is ignored`;
    case 'attachBadRole': return `attachment ${p}: role "${x.role}" is not one of ${ATTACH_ROLES.join(', ')}; it is included but not listed for readers`;
    case 'attachBadTitle': return `attachment ${p}: the title is not a string of at most ${x.max} characters; left out`;
    case 'attachMissing': return `attachment ${p} is listed in ${FORMAT.CONFIG_FILE} but the file does not exist`;
    case 'attachTooLarge': return `attachment ${p} is ${x.n} bytes, over the limit of ${x.max}; not included`;
    case 'attachTotal': return `attachment ${p}: the attachments would be ${x.n} bytes together, over the limit of ${x.max}; not included`;
    case 'attachCount': return `attachment ${p}: more than ${x.max} attachments; not included`;
    case 'attachNoRole': return `attachment ${p} has no role in ${FORMAT.CONFIG_FILE} (${ATTACH_ROLES.join(', ')}); it is included but not listed for readers`;
    default: return `attachment ${p}: ${x.code}`;
  }
}
