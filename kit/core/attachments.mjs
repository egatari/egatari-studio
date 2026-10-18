// 添付（format spec §3.8。名前と識別子は kit/core/format.mjs の ATTACH_*）：読み手のためのファイル（元の原稿・PDF・コード・データ・補足）。
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
// 添付の上限：1 つ 10 MiB、合わせて 20 MiB（形式の §3.8 の案の推奨と同じ。超えるものは断る）、100 個まで。書き出した 1 ファイルは base64 で 4/3 倍になる
// （20 MiB → 約 27 MiB。形式の上限は §11）。題は要る（§3.8 の案）・200 字まで
export const ATTACH_LIMITS = Object.freeze({ fileBytes: 10 * MiB, totalBytes: 20 * MiB, count: 100, titleChars: 200 });

// 音声と動画は添付にしない（§3.8 の案：教材が鳴らさないものは添付しない）。拡張子と、先頭のバイト（よくある形式の印）で見分ける
const MEDIA_EXT = {
  audio: ['mp3', 'm4a', 'm4b', 'aac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff', 'wma', 'amr', 'weba', 'mka'],
  video: ['mp4', 'm4v', 'mov', 'qt', 'webm', 'mkv', 'ogv', 'avi', 'wmv', 'mpg', 'mpeg', '3gp', '3g2'],
};
// 拡張子から：'audio' | 'video' | null
export function mediaKindOfName(p) {
  const ext = (String(p || '').match(/\.([^./]+)$/)?.[1] || '').toLowerCase();
  for (const [k, list] of Object.entries(MEDIA_EXT)) if (list.includes(ext)) return k;
  return null;
}
// 先頭のバイト（16 バイトあれば足りる）から：'audio' | 'video' | null。mp3（ID3・MPEG の音声の枠）・AAC（ADTS・ADIF）・WAV・AIFF・AVI・
// Ogg（Vorbis・Opus・Theora）・FLAC・WebM/Matroska・MP4/M4A/MOV（ftyp・moov・mdat。HEIF・AVIF の画像の ftyp は除く）
const IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis', 'crx ']);
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B ']);
export function sniffMedia(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const asc = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length < 4) return null;
  if (asc(0, 3) === 'ID3' || asc(0, 4) === 'ADIF' || asc(0, 4) === 'fLaC') return 'audio';
  if (asc(0, 4) === 'OggS') return /theora/i.test(asc(28, 8)) ? 'video' : 'audio';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video';
  if (b.length >= 12 && asc(0, 4) === 'RIFF') { const t = asc(8, 4); if (t === 'WAVE') return 'audio'; if (t === 'AVI ') return 'video'; return null; }
  if (b.length >= 12 && asc(0, 4) === 'FORM' && /^AIF[FC]$/.test(asc(8, 4))) return 'audio';
  if (b.length >= 8) {
    const box = asc(4, 4);
    if (box === 'ftyp' && b.length >= 12) { const brand = asc(8, 4); if (IMAGE_BRANDS.has(brand)) return null; return AUDIO_BRANDS.has(brand) ? 'audio' : 'video'; }
    if (box === 'moov' || box === 'mdat' || box === 'wide') return 'video';
  }
  // MPEG の音声の枠（mp3 など）と AAC の ADTS：FF Ex/Fx。UTF-16 の BOM（FF FE）と FF FF は除く
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && b[1] !== 0xfe && b[1] !== 0xff && b.length >= 3) {
    const layer = (b[1] >> 1) & 3;
    if (layer === 0) return (b[1] & 0xf6) === 0xf0 ? 'audio' : null;   // ADTS
    if (((b[1] >> 3) & 3) !== 1 && (b[2] >> 4) !== 15 && ((b[2] >> 2) & 3) !== 3) return 'audio';
  }
  return null;
}
// 音声・動画の添付の問題（なければ null）：{code: 'attachMedia', path, kind, by: 'name' | 'content'}
export function attachMediaProblem(p, bytes) {
  const byName = mediaKindOfName(p);
  if (byName) return { code: 'attachMedia', path: p, kind: byName, by: 'name' };
  const byContent = bytes ? sniffMedia(bytes) : null;
  return byContent ? { code: 'attachMedia', path: p, kind: byContent, by: 'content' } : null;
}
const hasTitle = (e) => typeof e.title === 'string' && e.title.trim() !== '' && e.title.length <= ATTACH_LIMITS.titleChars;
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

// 索引に書く項目：path・role・title（要る）と、ほかの書き手が足した知らない項目（そのまま残す。§7.1）
function indexEntry(e) {
  const o = { path: e.path, role: e.role, title: e.title };
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
    const media = attachMediaProblem(p, f && f.head);
    if (media) { problems.push(media); continue; }
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
    if (!hasTitle(e)) { if (!own(e, 'title') || (typeof e.title === 'string' && e.title.trim() === '')) problems.push({ code: 'attachNoTitle', path: p }); continue; }
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
    if (!isObj(e) || typeof e.path !== 'string' || !isAttachPath(e.path) || pathProblem(e.path) || !ATTACH_ROLES.includes(e.role) || !hasTitle(e) || seen.has(e.path)) continue;
    if (!own(index.files, e.path)) continue;
    const b = index.blobs[index.files[e.path]];
    if (!isObj(b)) continue;
    seen.add(e.path);
    out.push({ path: e.path, role: e.role, title: e.title, bytes: b.bytes, sha256: b.sha256, blob: index.files[e.path] });
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
    else if (!hasTitle(e)) w.push(`${at}: "${e.path.slice(0, 80)}" has no title (required); ignored`);
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
    case 'attachBadTitle': return `attachment ${p}: the title is not a string of at most ${x.max} characters; it is included but not listed for readers`;
    case 'attachMissing': return `attachment ${p} is listed in ${FORMAT.CONFIG_FILE} but the file does not exist`;
    case 'attachTooLarge': return `attachment ${p} is ${x.n} bytes, over the limit of ${x.max}; not included`;
    case 'attachTotal': return `attachment ${p}: the attachments would be ${x.n} bytes together, over the limit of ${x.max}; not included`;
    case 'attachCount': return `attachment ${p}: more than ${x.max} attachments; not included`;
    case 'attachNoTitle': return `attachment ${p} has no title in ${FORMAT.CONFIG_FILE} (required); it is included but not listed for readers`;
    case 'attachMedia': return `attachment ${p} is ${x.kind === 'video' ? 'a video' : 'audio'} (${x.by === 'content' ? 'by its content' : 'by its name'}); audio and video are not attachments, not included`;
    case 'attachNoRole': return `attachment ${p} has no role in ${FORMAT.CONFIG_FILE} (${ATTACH_ROLES.join(', ')}); it is included but not listed for readers`;
    default: return `attachment ${p}: ${x.code}`;
  }
}
