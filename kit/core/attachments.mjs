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
// problems：{code, path?, …}。code は kit/check-messages.mjs の attach…（品質チェックと書き出しの知らせが同じ言葉を使う）
import { FORMAT } from './format.mjs';
import { pathProblem, excludedReason, foldPath } from './portable.mjs';
import { inspectAttachment, nameProblem, roleProblem, blocking, kindOfName, roleAllows, attachmentMime, ROLE_KINDS, TITLE_CHARS, DESCRIPTION_CHARS, titleProblem, descriptionProblem, clipChars } from './attach-content.mjs';
export { inspectAttachment, nameProblem, roleProblem, blocking, kindOfName, roleAllows, attachmentMime, ROLE_KINDS, titleProblem, descriptionProblem, clipChars };

const MiB = 1024 * 1024;
// 添付の上限：1 つ 10 MiB、合わせて 20 MiB（形式の §3.8 の案の推奨と同じ。超えるものは断る）、100 個まで。書き出した 1 ファイルは base64 で 4/3 倍になる
// （20 MiB → 約 27 MiB。形式の上限は §11）。題は要る（§3.8 の案）・120 字まで・1 行。説明（description。1〜2 文の文字だけ）は 300 字まで・1 行
export const ATTACH_LIMITS = Object.freeze({ fileBytes: 10 * MiB, totalBytes: 20 * MiB, count: 100, titleChars: TITLE_CHARS, descriptionChars: DESCRIPTION_CHARS });

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
  if (byName) return { code: 'attachMedia', path: p, level: 'must', kind: byName, by: 'name' };
  const byContent = bytes ? sniffMedia(bytes) : null;
  return byContent ? { code: 'attachMedia', path: p, level: 'must', kind: byContent, by: 'content' } : null;
}
// 題（title。§3.8・Schema：1〜120 字・1 行・空白だけでない）と説明（description。300 字まで・1 行）の検査は attach-content.mjs の titleProblem・descriptionProblem
const hasTitle = (e) => !titleProblem(e.title);
const blankTitle = (e) => !own(e, 'title') || (typeof e.title === 'string' && !e.title.trim());
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
    entries.set(e.path, e);
  });
  return { entries, problems };
}

// 索引に書く項目：path・role・title（要る）・description（正しいときだけ。空なら書かない）と、ほかの書き手が足した知らない項目（そのまま残す。§7.1）
function indexEntry(e) {
  const o = { path: e.path, role: e.role, title: e.title };
  if (typeof e.description === 'string' && e.description.trim() && !descriptionProblem(e.description)) o.description = e.description.trim();
  for (const k of Object.keys(e)) if (!own(o, k) && k !== 'title' && k !== 'description') o[k] = e[k];
  return o;
}

// files：作業フォルダの attachments/ の下のファイル [{path, size}]（size は分からなければ null）。conf：設定のファイルの object。
// opts.carry：開いた文書の index.attachments（その文書を作り直すとき、設定のファイルに書いていない役割と題を引き継ぐ。ほかの書き手の文書）
// opts.limits：上限（試験用）
// opts.keep：§3.8 の型の検査（名前・役割と型の組・中身）をしないパスの Set（段 A の保存で、前からあって中身も記録も変わらない添付。
//   前の版で入れたものを、口述原稿を直しただけの保存で落とさない。知らせは呼び手が出す）
// 返すもの：include（文書に入れるパス。並びは設定の順、残りはパスの順）・list（index.attachments：役割のあるもの）・problems
export function planAttachments(files, conf, opts = {}) {
  const L = { ...ATTACH_LIMITS, ...(opts.limits || {}) };
  const { entries, problems } = configEntries(conf);
  const carry = new Map();
  if (Array.isArray(opts.carry)) for (const c of opts.carry) if (isObj(c) && typeof c.path === 'string' && !entries.has(c.path)) carry.set(c.path, c);
  const sizeOf = new Map();
  const all = [], refused = new Set();
  for (const f of files || []) {
    const p = typeof f === 'string' ? f : f && f.path;
    if (!isAttachPath(p)) continue;
    const why = attachPathProblem(p);
    if (why) { problems.push({ code: /^excluded/.test(why) ? 'attachExcluded' : 'attachBadName', path: p, why }); refused.add(p); continue; }
    const media = attachMediaProblem(p, f && f.head);
    if (media) { problems.push(media); refused.add(p); continue; }
    // 型（§3.8）：名前が許されない型（実行できるもの・入れ物など）・どの役割にもない型は入れない。中身の検査の結果（f.problems。
    // inspectAttachment）があれば、入れない問題（must・should）のあるものも入れない
    const kept = opts.keep instanceof Set && opts.keep.has(p);
    const np = kept ? null : nameProblem(p);
    if (np) { problems.push(np); refused.add(p); continue; }
    const cps = f && Array.isArray(f.problems) ? f.problems : [];
    for (const x of cps) problems.push(x);
    if (cps.some(blocking)) { refused.add(p); continue; }
    sizeOf.set(p, f && Number.isFinite(f.size) ? f.size : null);
    all.push(p);
  }
  for (const p of entries.keys()) if (!sizeOf.has(p) && !refused.has(p)) problems.push({ code: 'attachMissing', path: p });
  const order = [...[...entries.keys()].filter((p) => sizeOf.has(p)), ...all.filter((p) => !entries.has(p)).sort()];
  const include = [], list = [];
  let total = 0;
  for (const p of order) {
    const n = sizeOf.get(p);
    const e0 = entries.get(p) || carry.get(p) || null;
    // 役割と型の組（pdf に CSV など）：入れない
    const rp = e0 && ATTACH_ROLES.includes(e0.role) && !(opts.keep instanceof Set && opts.keep.has(p)) ? roleProblem(p, e0.role) : null;
    if (rp) { problems.push(rp); continue; }
    if (n !== null && n > L.fileBytes) { problems.push({ code: 'attachTooLarge', path: p, n, max: L.fileBytes }); continue; }
    if (include.length >= L.count) { problems.push({ code: 'attachCount', path: p, max: L.count }); continue; }
    if (n !== null && total + n > L.totalBytes) { problems.push({ code: 'attachTotal', path: p, n: total + n, max: L.totalBytes }); continue; }
    total += n || 0;
    include.push(p);
    const e = entries.get(p) || carry.get(p) || null;
    if (!e || !ATTACH_ROLES.includes(e.role)) { if (!e || !own(e, 'role')) problems.push({ code: 'attachNoRole', path: p }); continue; }
    // 題が正しくない：入れるが一覧に出さない（知らせる）。説明が正しくない：説明を落として一覧に出す（知らせる）
    if (!hasTitle(e)) { problems.push(blankTitle(e) ? { code: 'attachNoTitle', path: p } : { code: 'attachBadTitle', path: p, why: titleProblem(e.title), max: ATTACH_LIMITS.titleChars }); continue; }
    if (own(e, 'description')) { const why = descriptionProblem(e.description); if (why) problems.push({ code: 'attachBadDescription', path: p, why, max: ATTACH_LIMITS.descriptionChars }); }
    list.push(indexEntry({ ...e, path: p }));
  }
  return { include, list, problems, total, limits: L };
}

// 文書の索引の添付：files にあり、役割と題が正しく、パスが添付の場所で、型が役割に許され拡張子と媒体型が合うもの。題・役割・大きさ・塊を添える（読み手は塊を復号して hash を確かめてから渡す）
export function attachmentsOf(index) {
  const out = [];
  if (!isObj(index) || !Array.isArray(index[FORMAT.ATTACH_KEY]) || !isObj(index.files) || !isObj(index.blobs)) return out;
  const seen = new Set();
  for (const e of index[FORMAT.ATTACH_KEY]) {
    if (!isObj(e) || typeof e.path !== 'string' || !isAttachPath(e.path) || pathProblem(e.path) || !ATTACH_ROLES.includes(e.role) || !hasTitle(e) || seen.has(e.path)) continue;
    if (!own(index.files, e.path)) continue;
    const b = index.blobs[index.files[e.path]];
    if (!isObj(b)) continue;
    // §3.8：役割に許されない型、拡張子と媒体型の合わないものは出さない
    const k = kindOfName(e.path);
    if (!k || !k.kind || !roleAllows(e.role, k.kind) || b.mime !== k.mime) continue;
    seen.add(e.path);
    out.push({ path: e.path, role: e.role, title: e.title, ...(typeof e.description === 'string' && !descriptionProblem(e.description) ? { description: e.description } : {}), mime: b.mime, bytes: b.bytes, sha256: b.sha256, blob: index.files[e.path] });
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
    else if (!hasTitle(e)) w.push(blankTitle(e) ? `${at}: "${e.path.slice(0, 80)}" has no title (required); ignored` : `${at}: "${e.path.slice(0, 80)}": the title ${titleProblem(e.title)} (at most ${ATTACH_LIMITS.titleChars} characters, one line); ignored`);
    else if (!isObj(index.files) || !own(index.files, e.path)) w.push(`${at}: "${e.path.slice(0, 80)}" is not in files; ignored`);
    else {
      // 型（§3.8）：名前の型が役割に許されないか、塊の媒体型が名前の型と違う（再生器はダウンロードに出さない）
      const k = kindOfName(e.path), b = isObj(index.blobs) ? index.blobs[index.files[e.path]] : null;
      if (!k || !k.kind) w.push(`${at}: "${e.path.slice(0, 80)}" is not a type that may be attached (${k && k.forbidden ? k.forbidden : 'not allowed'}); players do not offer it`);
      else if (!roleAllows(e.role, k.kind)) w.push(`${at}: "${e.path.slice(0, 80)}" (${k.kind}) is not allowed for the role ${e.role}; players do not offer it`);
      else if (isObj(b) && b.mime !== k.mime) w.push(`${at}: "${e.path.slice(0, 80)}" has the media type ${String(b.mime).slice(0, 80)}, expected ${k.mime}; players do not offer it`);
      if (own(e, 'description') && descriptionProblem(e.description)) w.push(`${at}: the description ${descriptionProblem(e.description)}; not shown`);
    }
  });
  return w;
}

// ダウンロードの名前：パスの最後の部分。制御文字と、OS が断る字（\ / : * ? " < > |）は _ に。空なら "attachment"
export function attachmentName(p) {
  const n = String(p || '').split('/').pop().replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g, '_').trim();
  return n || 'attachment';
}

const FORBIDDEN_TEXT = { script: 'a file type that operating systems run or open as a script', executable: 'an executable', wasm: 'WebAssembly', 'office-legacy': 'a legacy binary Office or RTF document', 'office-macro': 'a macro-enabled Office document',
  html: 'HTML', svg: 'SVG', egatari: `another ${FORMAT.DISPLAY_NAME} file`, archive: 'an archive or container' };
const UNSAFE_TEXT = { javascript: 'the PDF contains JavaScript', 'auto-action': 'the PDF runs an action when opened', launch: 'the PDF can launch programs', 'embedded-file': 'the PDF carries embedded files',
  action: 'the PDF has actions other than going to a place in the document or opening a link', 'active-content': 'the PDF has active content', macro: 'the document contains macros', activex: 'the document contains ActiveX controls', 'embedded-object': 'the document contains embedded objects',
  'external-link': 'the document refers to external files or data', 'external-data': 'the document fetches external data', dde: 'the spreadsheet uses DDE', 'field-code': 'the document has a field code that runs or fetches',
  'remote-template': 'the document uses a remote template' };
// 書き出しの知らせ（英語、'portable: …'）
export function problemText(x) {
  const p = x.path ? `"${x.path}"` : '';
  switch (x.code) {
    case 'attachBadConfig': return `attachments: ${x.why}`;
    case 'attachBadName': return `attachment ${p}: ${x.why}; not included`;
    case 'attachExcluded': return `attachment ${p}: ${x.why}; not included`;
    case 'attachDuplicate': return `attachment ${p} is listed twice (also as "${x.other}"); the second entry is ignored`;
    case 'attachBadRole': return `attachment ${p}: role "${x.role}" is not one of ${ATTACH_ROLES.join(', ')}; it is included but not listed for readers`;
    case 'attachBadTitle': return `attachment ${p}: the title ${x.why || 'is not valid'} (at most ${x.max} characters, one line); it is included but not listed for readers`;
    case 'attachMissing': return `attachment ${p} is listed in ${FORMAT.CONFIG_FILE} but the file does not exist`;
    case 'attachTooLarge': return `attachment ${p} is ${x.n} bytes, over the limit of ${x.max}; not included`;
    case 'attachTotal': return `attachment ${p}: the attachments would be ${x.n} bytes together, over the limit of ${x.max}; not included`;
    case 'attachCount': return `attachment ${p}: more than ${x.max} attachments; not included`;
    case 'attachNoTitle': return `attachment ${p} has no title in ${FORMAT.CONFIG_FILE} (required); it is included but not listed for readers`;
    case 'attachMedia': return `attachment ${p} is ${x.kind === 'video' ? 'a video' : 'audio'} (${x.by === 'content' ? 'by its content' : 'by its name'}); audio and video are not attachments, not included`;
    case 'attachType': return x.role ? `attachment ${p}: a .${x.ext} file is not allowed for the role ${x.role} (allowed: ${(ROLE_KINDS[x.role] || []).join(', ')}); not included` : `attachment ${p}: .${x.ext} is not a type that may be attached (§3.8); not included`;
    case 'attachForbidden': return `attachment ${p} is ${FORBIDDEN_TEXT[x.kind] || x.kind} (${x.by === 'content' ? 'by its content' : 'by its name'}), which must not be attached (§3.8); not included`;
    case 'attachMismatch': return `attachment ${p}: the content is not ${x.kind}${x.actual ? ` (it looks like ${x.actual})` : ''}${x.why ? ` (${x.why})` : ''}; not included`;
    case 'attachPolyglot': return `attachment ${p} is also ${x.also} (a file of two types); not included`;
    case 'attachUnsafe': return `attachment ${p}: ${UNSAFE_TEXT[x.what] || x.what}${x.detail ? ` (${x.detail})` : ''}, not allowed for attachments (§3.8); not included`;
    case 'attachUnchecked': return `attachment ${p} cannot be checked (${x.why}); not included`;
    case 'attachInjection': return `attachment ${p}: ${x.n} value(s) start with = + - @ or a tab and may be read as formulas by a spreadsheet${x.row ? ` (first at row ${x.row}, column ${x.col})` : x.where ? ` (in ${x.where})` : ''}; check before sharing`;
    case 'attachPrivate': return `attachment ${p} seems to contain a ${x.what}; check before sharing`;
    case 'attachBadDescription': return `attachment ${p}: the description ${x.why}; it is left out`;
    case 'attachNoRole': return `attachment ${p} has no role in ${FORMAT.CONFIG_FILE} (${ATTACH_ROLES.join(', ')}); it is included but not listed for readers`;
    default: return `attachment ${p}: ${x.code}`;
  }
}
