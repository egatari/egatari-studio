// 添付の中身の検査（format spec §3.8 の役割ごとの型と条件）。開かない・実行しない：バイトを数え、決まった形だけを読む。
// Node にもブラウザにも依存しない（展開は標準の DecompressionStream。上限つきで、上限を超えたらそこで止める）
//
//   kindOfName(path)                 名前（拡張子・決まった名前）から：{kind, mime} | {forbidden: 分類} | null（許されない型）
//   roleAllows(role, kind)           その役割にその型を添付できるか
//   inspectAttachment(path, bytes)   中身を調べる（async）→ {kind, mime, problems}
//   roleProblem(path, role)          役割と型の組の問題（なければ null）
//   blocking(problem)                入れない問題か（level が must か should）
//
// problems：{code, path, level, …}。code は kit/check-messages.mjs の attach…。level：
//   must    仕様が MUST NOT とするもの（許されない型・実行できるもの・入れ物・HTML/SVG・マクロ・JavaScript のある PDF・ほかの型と重ねたファイル）
//   should  仕様が「断るべき」（SHOULD reject）とするもの：役割の条件（自動の動作・埋め込み・外への参照・DDE・フィールド）と、中身が型と違う・調べられない
//   advice  気をつけるだけのもの：数式として読まれる値（formula injection）・資格情報や機械のパスらしい文字
// 書き出し・編集器・段 A の保存は must と should を入れない（断る）。検査器は must をエラー、ほかを警告にする

const MiB = 1048576;
// 説明（description）の字数の上限（kit/core/attachments.mjs の ATTACH_LIMITS・再生器 kit/tools.js が同じ数を使う）
export const DESCRIPTION_CHARS = 300;
// 調べるときの上限（展開の爆弾。宣言の大きさは偽れるので、展開しながら数えて止める）
export const INSPECT_LIMITS = Object.freeze({
  zipEntries: 2000,          // OOXML の項目の数
  zipDeclared: 256 * MiB,    // 宣言の展開後の大きさの合計
  zipEntry: 64 * MiB,        // 1 つの項目の宣言の展開後の大きさ
  zipRatio: 200,             // 16 MiB を超える項目の圧縮率の上限
  inflateTotal: 64 * MiB,    // 実際に展開して読む合計（OOXML の XML の部分・PDF の object stream）
  pdfObjStreams: 4096,       // PDF の object stream の数
});

// ---------------------------------------------------------------- 型（kind）と媒体型（mime）
const T = 'text/plain';
const KINDS = {
  pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp',
  text: T, csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ipynb: 'application/x-ipynb+json', tex: 'text/x-tex', markdown: 'text/markdown',
  code: T, env: T,
};
const TEXT_KINDS = new Set(['text', 'csv', 'tsv', 'json', 'ipynb', 'tex', 'markdown', 'code', 'env']);
// 役割 → 添付できる型（§3.8 の表）
export const ROLE_KINDS = Object.freeze({
  pdf: ['pdf'],
  data: ['csv', 'tsv', 'json', 'text', 'xlsx'],
  code: ['code', 'env', 'text', 'ipynb'],
  source: ['tex', 'markdown', 'text', 'docx'],
  supplement: ['png', 'jpeg', 'webp', 'pdf', 'text'],
});
const EXT_KIND = {
  pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', txt: 'text', text: 'text',
  csv: 'csv', tsv: 'tsv', tab: 'tsv', json: 'json', xlsx: 'xlsx', docx: 'docx', ipynb: 'ipynb',
  tex: 'tex', ltx: 'tex', sty: 'tex', cls: 'tex', bst: 'text', bib: 'text', md: 'markdown', markdown: 'markdown',
  // 環境の定義（§3.8 code）
  toml: 'env', yml: 'env', yaml: 'env', lock: 'env', cfg: 'env', ini: 'env',
};
// プログラムの原稿（開いても動かないもの。Windows・macOS が開くと実行する拡張子（.js .vbs .bat .cmd .command など）は含めない）
const CODE_EXT = ('py pyi r rmd qmd jl m c h cc cpp cxx hpp hh hxx cu cuh rs go java kt kts scala swift mjs cjs ts mts cts rb pl pm php lua hs lhs ' +
  'ml mli fs clj cljs ex exs erl hrl dart nim zig v sv vh vhd vhdl f f90 f95 f03 f08 for sql sh bash zsh fish do ado sas stan nix cmake mk ' +
  'groovy gradle cs lisp lsp scm rkt el asm s proto ipy rst').split(' ');
for (const e of CODE_EXT) EXT_KIND[e] = 'code';
// 拡張子のない、あるいは決まった名前の環境の定義
const ENV_NAMES = new Set(['dockerfile', 'containerfile', 'makefile', 'pipfile', 'pipfile.lock', 'description', 'gemfile', 'gemfile.lock', 'brewfile',
  'requirements.txt', 'package.json', 'package-lock.json', 'pyproject.toml', 'environment.yml', 'environment.yaml', 'renv.lock', 'postbuild', 'apt.txt', 'runtime.txt', 'install.r']);
// 許されないもの（名前から）：分類 → 拡張子
const FORBIDDEN_EXT = {
  executable: 'exe dll so dylib msi msp msix appx com scr pif bat cmd vbs vbe js jse wsf wsh wsc hta jar apk app command lnk reg cpl sys drv ocx class pyc pyo ps1 psm1 deb rpm appimage run elf',
  wasm: 'wasm wat',
  'office-legacy': 'doc dot xls xlt xla ppt pot pps rtf',
  'office-macro': 'docm dotm xlsm xltm xlam xlsb pptm potm ppsm ppam sldm',
  html: 'html htm xhtml xht shtml mht mhtml',
  svg: 'svg svgz',
  archive: 'zip tar gz tgz bz2 tbz tbz2 xz txz 7z rar zst lz lzma lz4 cab iso img dmg whl egg epub',
};
const FORBIDDEN_BY_EXT = Object.create(null);
for (const [k, list] of Object.entries(FORBIDDEN_EXT)) for (const e of list.split(' ')) FORBIDDEN_BY_EXT[e] = k;

const baseName = (p) => String(p || '').split('/').pop();
const extOf = (p) => (baseName(p).match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// 名前から：{kind, mime} | {forbidden} | null（どの役割にも許されない型）
export function kindOfName(p) {
  const name = baseName(p).toLowerCase();
  if (/\.ega(?:\.html?)?$/.test(name)) return { forbidden: 'egatari' };
  const ext = extOf(p);
  if (FORBIDDEN_BY_EXT[ext]) return { forbidden: FORBIDDEN_BY_EXT[ext] };
  if (ENV_NAMES.has(name)) return { kind: 'env', mime: ext === 'json' ? KINDS.json : T };
  const kind = EXT_KIND[ext];
  if (!kind) return null;
  return { kind, mime: KINDS[kind] };
}
export const roleAllows = (role, kind) => Array.isArray(ROLE_KINDS[role]) && ROLE_KINDS[role].includes(kind);
// 添付の塊の媒体型（名前から。許されない名前は application/octet-stream）
export function attachmentMime(p) { const k = kindOfName(p); return k && k.kind ? k.mime : 'application/octet-stream'; }
// 役割と型の組の問題（role が役割でないときは見ない）
export function roleProblem(p, role) {
  if (!ROLE_KINDS[role]) return null;
  const k = kindOfName(p);
  if (!k || !k.kind) return null;   // 名前の問題は別に（kindOfName の forbidden・null）
  if (roleAllows(role, k.kind)) return null;
  return { code: 'attachType', path: p, level: 'must', role, ext: extOf(p) || baseName(p) };
}
// 名前だけの問題（許されない型・どの役割にもない型）。なければ null
export function nameProblem(p) {
  const k = kindOfName(p);
  if (k && k.forbidden) return { code: 'attachForbidden', path: p, level: 'must', kind: k.forbidden, by: 'name' };
  if (!k) return { code: 'attachType', path: p, level: 'must', ext: extOf(p) || baseName(p) };
  return null;
}
export const blocking = (x) => !!x && (x.level === 'must' || x.level === 'should');

// ---------------------------------------------------------------- 先頭のバイト
const asc = (b, i, n) => { let s = ''; for (let j = i; j < i + n && j < b.length; j++) s += String.fromCharCode(b[j]); return s; };
const startsWith = (b, sig, at = 0) => { for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false; return b.length >= at + sig.length; };
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
// 中身の形（先頭の印）：'pdf' | 'png' | 'jpeg' | 'webp' | 'zip' | 'ole' | 'executable' | 'wasm' | 'archive' | 'rtf' | 'image' | 'binary-other' | null（印なし）
export function sniffKind(b) {
  if (!b || !b.length) return null;
  if (asc(b, 0, 5) === '%PDF-') return 'pdf';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (asc(b, 0, 4) === 'RIFF' && asc(b, 8, 4) === 'WEBP') return 'webp';
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08])) return 'zip';
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return 'executable';
  if (asc(b, 0, 2) === 'MZ' && b.length >= 0x40) { const o = u32(b, 0x3c); if (o + 4 <= b.length && asc(b, o, 4) === 'PE\0\0') return 'executable'; }
  if (asc(b, 0, 2) === 'MZ' && b.length >= 0x40 && b.subarray(0, 64).includes(0)) return 'executable';
  for (const sig of [[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]]) if (startsWith(b, sig)) return 'executable';
  if (startsWith(b, [0x00, 0x61, 0x73, 0x6d])) return 'wasm';
  if (startsWith(b, [0x1f, 0x8b]) || startsWith(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) || startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
    asc(b, 0, 6) === 'Rar!\x1a\x07' || startsWith(b, [0x28, 0xb5, 0x2f, 0xfd]) || asc(b, 0, 4) === 'MSCF' || startsWith(b, [0x04, 0x22, 0x4d, 0x18]) ||
    asc(b, 0, 4) === 'LZIP' || (asc(b, 0, 3) === 'BZh' && b[3] >= 0x31 && b[3] <= 0x39 && asc(b, 4, 6) === '1AY&SY') || asc(b, 257, 5) === 'ustar') return 'archive';
  if (asc(b, 0, 5) === '{\\rtf') return 'rtf';
  if (asc(b, 0, 6) === 'GIF87a' || asc(b, 0, 6) === 'GIF89a' || asc(b, 0, 4) === 'II*\0' || asc(b, 0, 4) === 'MM\0*' ||
    (asc(b, 4, 4) === 'ftyp' && /^(?:avif|avis|heic|heix|mif1|msf1)$/.test(asc(b, 8, 4)))) return 'image';
  if (asc(b, 0, 16) === 'SQLite format 3\0') return 'binary-other';
  return null;
}
// 文字のファイルが HTML・SVG で始まるか（BOM と空白の後）：'html' | 'svg' | null
function markupKind(text) {
  const t = text.replace(/^﻿/, '').trimStart().slice(0, 2048).toLowerCase();
  if (/^<!doctype\s+html|^<html[\s>]|^<head[\s>]|^<body[\s>]|^<script[\s>]|^<iframe[\s>]/.test(t)) return 'html';
  if (/^<svg[\s>]/.test(t)) return 'svg';
  if (/^<\?xml[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+svg[^>]*>\s*)?<svg[\s>]/.test(t)) return 'svg';
  if (/^<\?xml[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/.test(t)) return 'html';
  return null;
}
// 文字の符号化：UTF-16 は BOM のときだけ。ほかは NUL がないこと（UTF-8・Shift_JIS などの 8 ビットの符号）
function decodeText(b) {
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) {
    try { return new TextDecoder(b[0] === 0xff ? 'utf-16le' : 'utf-16be', { fatal: true }).decode(b); } catch { return null; }
  }
  if (b.includes(0)) return null;
  return new TextDecoder('utf-8').decode(b);   // 不正な UTF-8 は U+FFFD（Shift_JIS の CSV も、先頭の字を見るには足りる）
}

// ---------------------------------------------------------------- ZIP（読むだけ。書き出さない）
// 末尾の EOCD から中央の一覧を読む。項目：{name, flags, method, csize, usize, local, data}
function readZip(b, L) {
  const problems = [];
  const min = Math.max(0, b.length - 22 - 65535);
  let e = -1;
  for (let i = b.length - 22; i >= min; i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { e = i; break; }
  if (e < 0) return { error: 'no end of central directory' };
  const n = u16(b, e + 10), cdSize = u32(b, e + 12), cdOff = u32(b, e + 16), comLen = u16(b, e + 20);
  if (u16(b, e + 4) !== 0 || u16(b, e + 6) !== 0 || u16(b, e + 8) !== n) return { error: 'multi-disk ZIP' };
  if (n === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) return { unchecked: 'ZIP64' };
  if (e + 22 + comLen !== b.length) problems.push({ trailing: b.length - (e + 22 + comLen) });
  if (cdOff + cdSize !== e) return { error: 'the central directory is not where the end record says', problems };
  if (n > L.zipEntries) return { unchecked: `more than ${L.zipEntries} entries` };
  const entries = [];
  let p = cdOff, declared = 0;
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < n; i++) {
    if (p + 46 > e || u32(b, p) !== 0x02014b50) return { error: 'broken central directory', problems };
    const flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
    const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), local = u32(b, p + 42);
    if (p + 46 + nl > e) return { error: 'broken central directory', problems };
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) return { unchecked: 'ZIP64' };
    if (flags & 1) return { unchecked: 'encrypted entries' };
    if (method !== 0 && method !== 8) return { unchecked: `compression method ${method}` };
    if (usize > L.zipEntry) return { unchecked: `an entry of ${usize} bytes (over ${L.zipEntry})` };
    if (usize > 16 * MiB && usize > csize * L.zipRatio) return { unchecked: `an entry compressed more than ${L.zipRatio} times (decompression bomb)` };
    declared += usize;
    if (declared > L.zipDeclared) return { unchecked: `more than ${L.zipDeclared} bytes when decompressed (decompression bomb)` };
    // 項目の前の局所の見出し：同じ名前、データは中央の一覧の前で、ほかの項目と重ならない
    if (local + 30 > cdOff || u32(b, local) !== 0x04034b50) return { error: `entry "${name.slice(0, 80)}" has no local header`, problems };
    const lnl = u16(b, local + 26), lxl = u16(b, local + 28);
    if (dec.decode(b.subarray(local + 30, local + 30 + lnl)) !== name) return { error: `entry "${name.slice(0, 80)}": local and central names differ`, problems };
    const data = local + 30 + lnl + lxl;
    if (data + csize > cdOff) return { error: `entry "${name.slice(0, 80)}" runs into the central directory`, problems };
    entries.push({ name, flags, method, csize, usize, local, data });
  }
  if (p !== e) return { error: 'broken central directory', problems };
  const sorted = entries.slice().sort((x, y) => x.local - y.local);
  if (sorted.length && sorted[0].local !== 0) problems.push({ prepended: sorted[0].local });
  for (let i = 1; i < sorted.length; i++) if (sorted[i].local < sorted[i - 1].data + sorted[i - 1].csize) return { error: 'overlapping entries (decompression bomb)', problems };
  const seen = new Set();
  for (const x of entries) { const k = x.name.toLowerCase(); if (seen.has(k)) return { error: `duplicate entry "${x.name.slice(0, 80)}"`, problems }; seen.add(k); }
  return { entries, problems };
}
// ZIP の末尾に、中央の一覧があるか（ほかの型と重ねたファイル）。ZIP の読み手は前に付いたデータの分だけずれた位置も読むので、
// 終わりの記録の宣言の位置ではなく、終わりの記録の直前（一覧の大きさの分だけ前）に一覧の印があるかを見る
function hasZipTail(b) {
  const min = Math.max(0, b.length - 22 - 65535);
  for (let e = b.length - 22; e >= min; e--) {
    if (b[e] !== 0x50 || b[e + 1] !== 0x4b || b[e + 2] !== 0x05 || b[e + 3] !== 0x06) continue;
    const n = u16(b, e + 10), cdSize = u32(b, e + 12), cd = e - cdSize;
    if (n > 0 && cdSize >= 46 && cd >= 0 && u32(b, cd) === 0x02014b50) return true;
  }
  return false;
}

// 上限つきの展開。cap を超えたらそこで止めて {over: true}。壊れたデータは {error, bytes（そこまで）}
class Budget { constructor(n) { this.left = n; } }
async function inflate(bytes, format, cap, budget) {
  if (typeof DecompressionStream !== 'function') return { error: 'no DecompressionStream' };
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter(), reader = ds.readable.getReader();
  const w = writer.write(bytes).then(() => writer.close()).catch(() => {});
  const parts = [];
  let n = 0, error = null, over = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > cap || (budget && n > budget.left)) { over = true; await reader.cancel().catch(() => {}); break; }
      parts.push(value);
    }
  } catch (e) { error = String((e && e.message) || e); }
  await w;
  if (budget) budget.left -= Math.min(n, budget.left);
  const out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
  let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return { bytes: out, over, error };
}
async function zipEntryBytes(b, x, budget) {
  const raw = b.subarray(x.data, x.data + x.csize);
  if (x.method === 0) {
    if (x.csize !== x.usize) return { error: 'stored size differs' };
    if (raw.length > budget.left) return { over: true };
    budget.left -= raw.length;
    return { bytes: raw };
  }
  const r = await inflate(raw, 'deflate-raw', x.usize, budget);
  if (r.over && budget.left > 0) return { error: 'decompresses to more than its declared size' };
  if (r.over) return { over: true };
  if (r.error) return { error: r.error };
  if (r.bytes.length !== x.usize) return { error: 'decompressed size differs from the declared size' };
  return { bytes: r.bytes };
}

// ---------------------------------------------------------------- OOXML（xlsx・docx）
const MAIN = {
  xlsx: { ok: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', macro: 'application/vnd.ms-excel.sheet.macroenabled.main+xml', dir: 'xl/' },
  docx: { ok: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', macro: 'application/vnd.ms-word.document.macroenabled.main+xml', dir: 'word/' },
};
const xmlText = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32)).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d || 32)).replace(/&amp;/g, '&');
const attrOf = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? xmlText(m[1] ?? m[2]) : null; };
// 外のデータを取りにいく・実行する関数（§3.8：functions that fetch external data）
const FETCH_FN = /(?:^|[^A-Za-z0-9_.])(?:_xlfn\.|_xll\.)?(WEBSERVICE|RTD|CALL|REGISTER|REGISTER\.ID|EXEC|IMAGE|STOCKHISTORY|CUBEVALUE|CUBEMEMBER|CUBESET|CUBESETCOUNT|CUBERANKEDMEMBER|CUBEMEMBERPROPERTY|CUBEKPIMEMBER)\s*\(/i;
const DDE_FORMULA = /[A-Za-z0-9_]\s*\|\s*'[^']*'\s*!|[A-Za-z0-9_]\|[A-Za-z0-9_ ./\\-]+!/;
// Word のフィールドのうち、実行する・取りにいくもの
const BAD_FIELDS = new Set(['DDE', 'DDEAUTO', 'INCLUDETEXT', 'INCLUDE', 'INCLUDEPICTURE', 'IMPORT', 'LINK', 'MACROBUTTON', 'AUTOOPEN']);
async function inspectOoxml(p, b, kind, add) {
  const z = readZip(b, INSPECT_LIMITS);
  if (z.unchecked) { add('should', 'attachUnchecked', { why: z.unchecked }); return; }
  if (z.error) { add('should', 'attachMismatch', { kind, why: `not a valid ZIP package (${z.error})` }); return; }
  for (const q of z.problems || []) {
    if (q.trailing) add('must', 'attachPolyglot', { also: 'data after the ZIP end record' });
    if (q.prepended) add('must', 'attachPolyglot', { also: 'data before the first ZIP entry' });
  }
  const names = z.entries.map((x) => x.name);
  const byName = new Map(z.entries.map((x) => [x.name, x]));
  const budget = new Budget(INSPECT_LIMITS.inflateTotal);
  const dec = new TextDecoder('utf-8');
  const read = async (name) => {
    const x = byName.get(name);
    if (!x) return null;
    const r = await zipEntryBytes(b, x, budget);
    if (r.over) { add('should', 'attachUnchecked', { why: `more than ${INSPECT_LIMITS.inflateTotal} bytes of XML to check (decompression bomb)` }); return null; }
    if (r.error) { add('should', 'attachMismatch', { kind, why: `${name}: ${r.error}` }); return null; }
    return dec.decode(r.bytes);
  };
  const ct = await read('[Content_Types].xml');
  if (ct === null) { if (!z.entries.some((x) => x.name === '[Content_Types].xml')) add('should', 'attachMismatch', { kind, why: 'no [Content_Types].xml (not an Office Open XML package)' }); return; }
  const types = [];
  for (const m of ct.matchAll(/<(Default|Override)\b[^>]*>/g)) types.push({ part: attrOf(m[0], 'PartName') || ('*.' + (attrOf(m[0], 'Extension') || '')), type: (attrOf(m[0], 'ContentType') || '').toLowerCase() });
  const main = MAIN[kind];
  if (types.some((t) => t.type === main.macro) || types.some((t) => /macroenabled|vbaproject|vbadata|\.macrosheet|intlmacrosheet|dialogsheet|addin\.macroenabled/.test(t.type)) ||
    names.some((n) => /(?:^|\/)vbaProject\.bin$|(?:^|\/)vbaData\.xml$|^xl\/macrosheets\/|^xl\/dialogsheets\//i.test(n))) add('must', 'attachUnsafe', { what: 'macro' });
  if (!types.some((t) => t.type === main.ok) && !types.some((t) => t.type === main.macro)) {
    const other = types.find((t) => /\.main\+xml$/.test(t.type));
    add('should', 'attachMismatch', { kind, why: other ? `the main part is ${other.type}` : `no ${kind} main part` });
  }
  if (names.some((n) => /(?:^|\/)activeX\//i.test(n)) || types.some((t) => /activex/.test(t.type))) add('should', 'attachUnsafe', { what: 'activex' });
  // 埋め込んだ object（OLE・ほかの Office の文書・HTML や MHT の取り込み（altChunk））
  const EMBED = /oleobject|^application\/vnd\.openxmlformats-officedocument\.(?:spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation)$|^application\/(?:msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.package)$|^text\/html|^message\/rfc822|^application\/xhtml\+xml/;
  if (names.some((n) => /(?:^|\/)embeddings\//i.test(n)) || types.some((t) => EMBED.test(t.type))) add('should', 'attachUnsafe', { what: 'embedded-object' });
  if (names.some((n) => /^xl\/externalLinks\//i.test(n)) || types.some((t) => /externallink/.test(t.type))) add('should', 'attachUnsafe', { what: 'external-link' });
  if (names.some((n) => /^xl\/connections\.xml$|^xl\/queryTables\//i.test(n)) || types.some((t) => /\.connections\+xml|querytable/.test(t.type))) add('should', 'attachUnsafe', { what: 'external-data' });
  // 関係（.rels）：外を指すもの（ハイパーリンクのほか）。テンプレートは remote-template
  for (const n of names.filter((x) => /(?:^|\/)_rels\/[^/]*\.rels$/i.test(x))) {
    const t = await read(n);
    if (t === null) continue;
    for (const m of t.matchAll(/<Relationship\b[^>]*>/g)) {
      const type = (attrOf(m[0], 'Type') || '').split('/').pop().toLowerCase(), mode = (attrOf(m[0], 'TargetMode') || '').toLowerCase();
      if (mode !== 'external' || type === 'hyperlink') continue;
      add('should', 'attachUnsafe', { what: type === 'attachedtemplate' ? 'remote-template' : 'external-link', detail: type });
    }
  }
  if (kind === 'xlsx') {
    let injection = 0, at = null;
    for (const n of names.filter((x) => /^xl\/(?:workbook\.xml|worksheets\/[^/]+\.xml|sharedStrings\.xml)$/i.test(x)).sort()) {
      const t = await read(n);
      if (t === null) continue;
      const formulas = [...t.matchAll(/<f\b[^>]*>([\s\S]*?)<\/f>|<definedName\b[^>]*>([\s\S]*?)<\/definedName>/g)].map((m) => xmlText(m[1] ?? m[2]));
      for (const f of formulas) {
        const fn = f.match(FETCH_FN);
        if (fn) { add('should', 'attachUnsafe', { what: 'external-data', detail: fn[1].toUpperCase() }); break; }
        if (DDE_FORMULA.test(f)) { add('should', 'attachUnsafe', { what: 'dde' }); break; }
      }
      // 数式でない文字の値のうち、数式として読まれうるもの（CSV に書き出したとき）
      const strings = /sharedStrings/i.test(n) ? [...t.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])) : [...t.matchAll(/<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1]));
      for (const s of strings) if (looksLikeFormula(s)) { injection++; if (!at) at = { part: n }; }
    }
    if (injection) add('advice', 'attachInjection', { n: injection, where: at.part });
  } else {
    for (const n of names.filter((x) => /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments|glossary\/document)\.xml$/i.test(x)).sort()) {
      const t = await read(n);
      if (t === null) continue;
      const bad = fieldProblem(t);
      if (bad) { add('should', 'attachUnsafe', { what: 'field-code', detail: bad }); break; }
    }
  }
}
// Word のフィールド：fldSimple の w:instr と、fldChar（begin・separate・end）の間の instrText。名前の前に入れ子のフィールドがあれば（名前を作って隠す）それも断る
function fieldProblem(xml) {
  for (const m of xml.matchAll(/<w:fldSimple\b[^>]*>/g)) { const name = (attrOf(m[0], 'w:instr') || '').trim().split(/\s+/)[0].toUpperCase(); if (BAD_FIELDS.has(name)) return name; }
  const stack = [];
  for (const m of xml.matchAll(/<w:fldChar\b[^>]*>|<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g)) {
    if (m[0].startsWith('<w:fldChar')) {
      const t = (attrOf(m[0], 'w:fldCharType') || '').toLowerCase();
      if (t === 'begin') { if (stack.length) { const top = stack[stack.length - 1]; if (top.instr === null && !top.text.trim()) return 'nested field before the field name'; } stack.push({ text: '', instr: null }); }
      else if (t === 'separate' || t === 'end') {
        const top = stack[stack.length - 1];
        if (top && top.instr === null) { top.instr = top.text; const name = top.text.trim().split(/\s+/)[0].toUpperCase(); if (BAD_FIELDS.has(name)) return name; }
        if (t === 'end') stack.pop();
      }
    } else if (stack.length) { const top = stack[stack.length - 1]; if (top.instr === null) top.text += xmlText(m[1]); }
  }
  return null;
}

// ---------------------------------------------------------------- 数式として読まれる値（formula injection）
const NUMERIC = /^[+-]?(?:\d[\d,]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?%?$/;
export function looksLikeFormula(s) {
  if (typeof s !== 'string' || s.length < 2) return false;
  const c = s[0];
  if (c === '\t' || c === '\r') return true;
  if (c !== '=' && c !== '+' && c !== '-' && c !== '@') return false;
  return !NUMERIC.test(s.trim());
}
// CSV・TSV：引用符の中の区切り・改行を読みながら、値の先頭を見る
function csvInjection(text, sep) {
  let n = 0, at = null, row = 1, col = 1, i = 0;
  const L = text.length;
  while (i < L) {
    let v = '';
    if (text[i] === '"') {
      i++;
      for (;;) { if (i >= L) break; if (text[i] === '"') { if (text[i + 1] === '"') { v += '"'; i += 2; continue; } i++; break; } v += text[i++]; }
      while (i < L && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') v += text[i++];
    } else while (i < L && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') v += text[i++];
    if (looksLikeFormula(v)) { n++; if (!at) at = { row, col }; }
    if (text[i] === sep) { i++; col++; continue; }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    row++; col = 1;
  }
  return n ? { n, ...at } : null;
}

// ---------------------------------------------------------------- 資格情報・機械のパスらしいもの（気をつけるだけ）
const PRIVATE = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['access key', /\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{35}\b/],
  ['password or token', /["']?(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ['machine-specific path', /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\/|[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\\s"']+/],
];
function privateProblem(text) { for (const [what, re] of PRIVATE) if (re.test(text)) return what; return null; }

// ---------------------------------------------------------------- PDF
// 字句だけを読む（オブジェクトを組み立てない）：コメント・文字列・16 進の文字列・stream の中身を飛ばし、名前（#xx を戻す）を集める。
// /OpenAction の値（行き先の配列なら動作でない。参照なら、その object が配列か）と、object stream（/Type /ObjStm）の中身の場所も
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
function lexPdf(b, onStreams = true) {
  const names = new Set(), openActions = [], objStreams = [], objAt = new Map();
  let i = 0;
  const L = b.length;
  // 直前の字句（参照「n g R」と「n g obj」を見る）
  let t1 = null, t2 = null, curObj = null, curGen = 0, dictNames = [];
  const push = (tok) => {
    if (tok === 'obj' && /^\d+$/.test(t1 || '') && /^\d+$/.test(t2 || '')) { curObj = +t2; curGen = +t1; dictNames = []; objAt.set(curObj, { buf: b, at: i }); }
    t2 = t1; t1 = tok;
  };
  while (i < L) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 0x25) { while (i < L && b[i] !== 0x0a && b[i] !== 0x0d) i++; continue; }                 // % コメント
    if (c === 0x28) {                                                                                  // ( 文字列 )
      let depth = 1; i++;
      while (i < L && depth) { const d = b[i]; if (d === 0x5c) { i += 2; continue; } if (d === 0x28) depth++; else if (d === 0x29) depth--; i++; }
      push('(str)'); continue;
    }
    if (c === 0x3c) {
      if (b[i + 1] === 0x3c) { i += 2; push('<<'); continue; }
      while (i < L && b[i] !== 0x3e) i++; i++; push('<hex>'); continue;
    }
    if (c === 0x3e) { i += b[i + 1] === 0x3e ? 2 : 1; push('>>'); continue; }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { i++; push(String.fromCharCode(c)); continue; }
    if (c === 0x2f) {                                                                                  // /名前
      i++; let s = '';
      while (i < L && !WS.has(b[i]) && !DELIM.has(b[i])) {
        if (b[i] === 0x23 && i + 2 < L && /^[0-9A-Fa-f]{2}$/.test(String.fromCharCode(b[i + 1], b[i + 2]))) { s += String.fromCharCode(parseInt(String.fromCharCode(b[i + 1], b[i + 2]), 16)); i += 3; }
        else s += String.fromCharCode(b[i++]);
      }
      names.add(s);
      if (curObj !== null) dictNames.push(s);
      push('/' + s);
      if (s === 'OpenAction') openActions.push({ buf: b, at: i });
      continue;
    }
    // 語（数・キーワード）
    let s = '';
    while (i < L && !WS.has(b[i]) && !DELIM.has(b[i])) s += String.fromCharCode(b[i++]);
    if (!s) { i++; continue; }
    if (s === 'stream' && onStreams) {
      // 中身：直後の改行の後から、次の endstream まで（/Length は間接の参照のことがあるので使わない。中身の名前は読まない）
      if (b[i] === 0x0d) i++;
      if (b[i] === 0x0a) i++;
      const start = i, m = findEndstream(b, start), end = m < 0 ? L : m;
      if (dictNames.includes('ObjStm')) objStreams.push({ obj: curObj, gen: curGen, start, end });
      i = m < 0 ? L : end + 9;
      push('endstream');
      continue;
    }
    if (s === 'endobj') { curObj = null; dictNames = []; }
    push(s);
  }
  return { names, openActions, objStreams, objAt };
}
function findEndstream(b, from) {
  const sig = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d];   // endstream
  outer: for (let i = from; i <= b.length - sig.length; i++) {
    if (b[i] !== 0x65) continue;
    for (let j = 1; j < sig.length; j++) if (b[i + j] !== sig[j]) continue outer;
    return i;
  }
  return -1;
}
// object stream の辞書の /Filter（なし・FlateDecode だけを読む）と /First
function objStmInfo(b, meta) {
  // 辞書の文字（stream の前の 4 KiB まで）から
  const head = asc(b, Math.max(0, meta.start - 4096), Math.min(4096, meta.start)).replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const d = head.slice(head.lastIndexOf('obj') + 3);
  const fm = d.match(/\/Filter\s*(?:\[([^\]]*)\]|(\/[A-Za-z0-9]+))/);
  const filter = fm ? (fm[1] ?? fm[2]) : null;
  const first = +((d.match(/\/First\s+(\d+)/) || [])[1] ?? NaN);
  const parms = /\/DecodeParms/.test(d);
  return { filters: filter ? filter.trim().split(/\s*\//).filter(Boolean) : [], first, parms };
}
// ---------------------------------------------------------------- PDF の暗号（標準の暗号、空の利用者パスワード：ISO 32000-2 §7.6.4）
// 利用者のパスワードなしで開ける PDF（権利の制限だけ）の object stream を読むためだけに復号する。返すもの：(bytes, num, gen) → 平文 | null、
// 開けない（パスワードが要る・知らない方式）なら null
const PAD = [0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a];
function md5(data) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const n = data.length, total = ((n + 8) >>> 6) * 64 + 64, m = new Uint8Array(total);
  m.set(data); m[n] = 0x80;
  const bits = n * 8; for (let i = 0; i < 8; i++) m[total - 8 + i] = Math.floor(bits / 2 ** (8 * i)) & 0xff;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) M[i] = m[o + 4 * i] | (m[o + 4 * i + 1] << 8) | (m[o + 4 * i + 2] << 16) | (m[o + 4 * i + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (B & C) | (~B & D); g = i; } else if (i < 32) { f = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { f = B ^ C ^ D; g = (3 * i + 5) % 16; } else { f = C ^ (B | ~D); g = (7 * i) % 16; }
      const t = D; D = C; C = B;
      const x = (A + f + K[i] + M[g]) >>> 0, r = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((x << r) | (x >>> (32 - r)))) >>> 0; A = t;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) out[4 * i + j] = (v >>> (8 * j)) & 0xff; });
  return out;
}
function rc4(key, data) {
  const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
const cat = (...xs) => { const out = new Uint8Array(xs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
async function aesCbcDecrypt(key, data) {
  // stream の中身の後の改行（endstream の前）は数えない
  let n = data.length;
  while (n % 16 && n > 0 && (data[n - 1] === 0x0a || data[n - 1] === 0x0d)) n--;
  data = data.subarray(0, n);
  if (data.length < 32 || data.length % 16) return null;
  try { return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: data.subarray(0, 16) }, await subtle().importKey('raw', key, 'AES-CBC', false, ['decrypt']), data.subarray(16))); } catch { return null; }
}
async function aesNoPad(key, iv, data, mode) {
  // 詰め物なしの AES-CBC：暗号は出力の前の部分（WebCrypto は PKCS#7 を足すので切る）、復号は最後に詰め物の塊を足してから
  const k = await subtle().importKey('raw', key, 'AES-CBC', false, ['encrypt', 'decrypt']);
  if (mode === 'encrypt') return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, k, data)).subarray(0, data.length);
  const last = data.subarray(data.length - 16);
  const padBlock = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: last }, k, new Uint8Array(0))).subarray(0, 16);   // E(last ⊕ 16×0x10)
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, k, cat(data, padBlock)));
}
const digest = async (alg, d) => new Uint8Array(await subtle().digest(alg, d));
// R6 の hash（ISO 32000-2 Algorithm 2.B）。pw は空
async function hash2B(pw, salt, u) {
  let K = await digest('SHA-256', cat(pw, salt, u));
  for (let round = 0; ; round++) {
    const one = cat(pw, K, u), K1 = new Uint8Array(one.length * 64);
    for (let i = 0; i < 64; i++) K1.set(one, i * one.length);
    const E = await aesNoPad(K.subarray(0, 16), K.subarray(16, 32), K1, 'encrypt');
    let sum = 0; for (let i = 0; i < 16; i++) sum += E[i];
    K = await digest(['SHA-256', 'SHA-384', 'SHA-512'][sum % 3], E);
    if (round >= 63 && E[E.length - 1] <= round - 32) return K.subarray(0, 32);
    if (round > 2000) return null;
  }
}
// PDF の文字列（( … ) か < … >）を、書かれた位置から読む
function pdfString(t, i) {
  while (i < t.length && /\s/.test(t[i])) i++;
  if (t[i] === '<') { const e = t.indexOf('>', i); if (e < 0) return null; const h = t.slice(i + 1, e).replace(/\s+/g, ''); const out = new Uint8Array(Math.ceil(h.length / 2)); for (let k = 0; k < out.length; k++) out[k] = parseInt((h.slice(2 * k, 2 * k + 2) + '0').slice(0, 2), 16); return out; }
  if (t[i] !== '(') return null;
  const out = []; let depth = 1; i++;
  while (i < t.length && depth) {
    const c = t[i];
    if (c === '\\') {
      const d = t[i + 1];
      const esc = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 }[d];
      if (esc !== undefined) { out.push(esc); i += 2; continue; }
      if (/[0-7]/.test(d)) { const m = t.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0]; out.push(parseInt(m, 8) & 255); i += 1 + m.length; continue; }
      if (d === '\r') { i += t[i + 2] === '\n' ? 3 : 2; continue; }
      if (d === '\n') { i += 2; continue; }
      i++; continue;
    }
    if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) break; }
    out.push(c.charCodeAt(0) & 255); i++;
  }
  return new Uint8Array(out);
}
async function pdfDecryptor(b) {
  if (!subtle()) return null;
  const t = asc(b, 0, b.length);
  // 暗号の辞書（trailer か xref の stream の辞書の /Encrypt。参照なら、その object）と /ID の最初の文字列
  const refs = [...t.matchAll(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/g)];
  let d = null;
  if (refs.length) {
    const r = refs[refs.length - 1];
    const m = [...t.matchAll(new RegExp(`(?:^|[^0-9])${r[1]}\\s+${r[2]}\\s+obj\\b`, 'g'))].pop();
    if (!m) return null;
    const e = t.indexOf('endobj', m.index);
    d = t.slice(m.index, e < 0 ? m.index + 4096 : e);
  } else { const m = t.match(/\/Encrypt\s*<</); if (!m) return null; d = t.slice(m.index, m.index + 4096); }
  const num = (k) => { const m = d.match(new RegExp(`/${k}\\s*(-?\\d+)`)); return m ? +m[1] : null; };
  const str = (k) => { const m = d.match(new RegExp(`/${k}(?![A-Za-z])`)); return m ? pdfString(d, m.index + m[0].length) : null; };
  if (!/\/Filter\s*\/Standard/.test(d)) return null;
  const V = num('V'), R = num('R'), P = num('P'), O = str('O'), U = str('U');
  if (!O || !U || P === null) return null;
  const idm = [...t.matchAll(/\/ID\s*\[/g)].pop();
  const ID0 = idm ? pdfString(t, idm.index + idm[0].length) : new Uint8Array(0);
  const cfm = (d.match(/\/CFM\s*\/(\w+)/) || [])[1] || (V === 4 ? 'V2' : null);
  if (R === 5 || R === 6) {
    // AES-256：利用者のパスワード（空）を U の検証用の塩で確かめ、UE を復号して鍵に
    const UE = str('UE');
    if (!UE || U.length < 48 || UE.length < 32) return null;
    const h = R === 6 ? await hash2B(new Uint8Array(0), U.subarray(32, 40), new Uint8Array(0)) : await digest('SHA-256', U.subarray(32, 40));
    if (!h || !h.every((x, i) => x === U[i])) return null;
    const ik = R === 6 ? await hash2B(new Uint8Array(0), U.subarray(40, 48), new Uint8Array(0)) : await digest('SHA-256', U.subarray(40, 48));
    if (!ik) return null;
    const key = await aesNoPad(ik, new Uint8Array(16), UE.subarray(0, 32), 'decrypt');
    return (data) => aesCbcDecrypt(key.subarray(0, 32), data);
  }
  if (!(R >= 2 && R <= 4)) return null;
  // 鍵の長さ：V 4（暗号の filter）は 16 バイト、ほかは辞書の /Length（ビット。CF の中の /Length はバイトなので 40 以上のものを使う）
  const bits = [...d.matchAll(/\/Length\s+(\d+)/g)].map((m) => +m[1]).find((v) => v >= 40 && v % 8 === 0);
  const n = R === 2 ? 5 : V === 4 ? 16 : Math.max(5, Math.min(16, (bits || 40) / 8));
  const p = new Uint8Array(4); for (let i = 0; i < 4; i++) p[i] = (P >>> (8 * i)) & 255;
  const meta = R === 4 && /\/EncryptMetadata\s+false/.test(d) ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0);
  let key = md5(cat(new Uint8Array(PAD), O.subarray(0, 32), p, ID0, meta)).subarray(0, n);
  if (R >= 3) for (let i = 0; i < 50; i++) key = md5(key).subarray(0, n);
  // 空の利用者パスワードか（U を確かめる）
  let ok;
  if (R === 2) ok = rc4(key, new Uint8Array(PAD)).every((x, i) => x === U[i]);
  else {
    let x = rc4(key, md5(cat(new Uint8Array(PAD), ID0)));
    for (let i = 1; i <= 19; i++) x = rc4(key.map((k) => k ^ i), x);
    ok = x.every((v, i) => v === U[i]);
  }
  if (!ok) return null;
  const aes = cfm === 'AESV2';
  if (cfm && cfm !== 'V2' && cfm !== 'AESV2' && cfm !== 'None') return null;
  return async (data, obj, gen) => {
    const ok2 = cat(key, new Uint8Array([obj & 255, (obj >> 8) & 255, (obj >> 16) & 255, gen & 255, (gen >> 8) & 255]), aes ? new Uint8Array([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array(0));
    const k = md5(ok2).subarray(0, Math.min(n + 5, 16));
    return aes ? aesCbcDecrypt(k, data) : rc4(k, data);
  };
}

// 値の始まりの字（#xx を戻した 1 KiB）。参照「n g R」はその object へ 1 度だけたどる
const textAt = (o) => asc(o.buf, o.at, 1024).replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function harmlessOpenAction(oa, objAt, depth = 0) {
  const t = textAt(oa).replace(/^[\x00\x09\x0a\x0c\x0d\x20]+/, '');
  if (t[0] === '[') return true;
  const ref = t.match(/^(\d+)\s+(\d+)\s+R\b/);
  if (ref) { const o = objAt.get(+ref[1]); return !!o && depth === 0 && harmlessOpenAction(o, objAt, 1); }
  if (!t.startsWith('<<')) return false;
  // 辞書の終わり（入れ子を数える）までの文字
  let d = 0, end = -1;
  for (let k = 0; k < t.length - 1; k++) { if (t[k] === '<' && t[k + 1] === '<') { d++; k++; } else if (t[k] === '>' && t[k + 1] === '>') { d--; k++; if (!d) { end = k + 1; break; } } }
  if (end < 0) return false;
  const dict = t.slice(0, end);
  return /\/S\s*\/GoTo(?![A-Za-z])/.test(dict) && !/\/(?:Next|JS|JavaScript|Launch|URI|GoToR|GoToE|SubmitForm|ImportData|F)(?![A-Za-z])/.test(dict);
}
async function inspectPdf(p, b, add) {
  const lx = lexPdf(b);
  const names = new Set(lx.names);
  const objAt = new Map(lx.objAt);
  const encrypted = names.has('Encrypt');
  if (lx.objStreams.length > INSPECT_LIMITS.pdfObjStreams) { add('should', 'attachUnchecked', { why: `more than ${INSPECT_LIMITS.pdfObjStreams} object streams` }); return; }
  // 暗号化（標準の暗号、空の利用者パスワード。権利の制限だけの PDF）：object stream を復号して読む。読めなければ確かめられない
  let crypt = null;
  if (encrypted && lx.objStreams.length) {
    crypt = await pdfDecryptor(b);
    if (!crypt) { add('should', 'attachUnchecked', { why: 'encrypted with a password or a method this checker cannot open, with object streams it cannot read' }); return; }
  }
  {
    const budget = new Budget(INSPECT_LIMITS.inflateTotal);
    for (const s of lx.objStreams) {
      const info = objStmInfo(b, s);
      let raw = b.subarray(s.start, s.end);
      if (crypt) { raw = await crypt(raw, s.obj, s.gen); if (!raw) { add('should', 'attachUnchecked', { why: 'an encrypted object stream cannot be decrypted' }); return; } }
      let data = null;
      if (!info.filters.length) data = raw;
      else if (info.filters.length === 1 && info.filters[0] === 'FlateDecode' && !info.parms) {
        const r = await inflate(raw, 'deflate', budget.left, budget);
        if (r.over) { add('should', 'attachUnchecked', { why: `more than ${INSPECT_LIMITS.inflateTotal} bytes in object streams (decompression bomb)` }); return; }
        if (!r.bytes.length) { add('should', 'attachUnchecked', { why: 'an object stream cannot be decompressed' }); return; }
        data = r.bytes;   // 壊れた末尾は、読めたところまで（読み手も同じように読む）
      } else { add('should', 'attachUnchecked', { why: `an object stream with the filter ${info.filters.join(' ') || '?'}${info.parms ? ' and parameters' : ''}` }); return; }
      const inner = lexPdf(data, false);
      for (const n of inner.names) names.add(n);
      lx.openActions.push(...inner.openActions);
      // object stream の中の object の最初の字句（参照の先が配列か）：先頭の「番号 位置 …」の組
      const hdr = asc(data, 0, Number.isFinite(info.first) ? Math.min(info.first, 65536) : 0).trim().split(/\s+/).map(Number);
      for (let k = 0; k + 1 < hdr.length; k += 2) {
        const at = (Number.isFinite(info.first) ? info.first : 0) + hdr[k + 1];
        objAt.set(hdr[k], { buf: data, at });
      }
    }
  }
  if (names.has('JavaScript') || names.has('JS')) add('must', 'attachUnsafe', { what: 'javascript' });
  if (names.has('XFA') || names.has('RichMedia')) add('should', 'attachUnsafe', { what: 'active-content', detail: names.has('XFA') ? 'XFA' : 'RichMedia' });
  if (names.has('Launch')) add('should', 'attachUnsafe', { what: 'launch' });
  if (names.has('AA')) add('should', 'attachUnsafe', { what: 'auto-action', detail: 'AA' });
  // /OpenAction：行き先（配列）と、文書の中の行き先へ移るだけの動作（/S /GoTo。LaTeX の hyperref が書く）は開いたときに何も実行しない。
  // ほかの動作（URI・JavaScript・Launch・ほかのファイルへの GoToR など・続きの /Next）は自動の動作
  for (const oa of lx.openActions) if (!harmlessOpenAction(oa, objAt)) { add('should', 'attachUnsafe', { what: 'auto-action', detail: 'OpenAction' }); break; }
  if (names.has('EmbeddedFile') || names.has('EmbeddedFiles') || names.has('FileAttachment')) add('should', 'attachUnsafe', { what: 'embedded-file' });
}

// ---------------------------------------------------------------- 全体
// path：attachments/ の下のパス。bytes：中身（全部）。返すもの：{kind, mime, problems}（kind・mime は名前から。名前が許されないなら null）
export async function inspectAttachment(p, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const problems = [];
  const seen = new Set();
  const add = (level, code, a = {}) => {
    const key = code + ':' + (a.what || a.kind || a.also || '');
    if (seen.has(key)) return;
    seen.add(key);
    const x = { code, path: p, level };
    for (const [k, v] of Object.entries(a)) if (v !== undefined) x[k] = v;
    problems.push(x);
  };
  const named = kindOfName(p);
  const np = nameProblem(p);
  if (np) add(np.level, np.code, { ...np, path: undefined, level: undefined, code: undefined });
  const kind = named && named.kind ? named.kind : null;
  // 中身の印：許されない型（実行できるもの・入れ物・マクロのある古い Office など）はどの名前でも must
  const sniffed = sniffKind(b);
  const FORBIDDEN_SNIFF = { executable: 'executable', wasm: 'wasm', archive: 'archive', ole: 'office-legacy', rtf: 'office-legacy' };
  if (FORBIDDEN_SNIFF[sniffed]) add('must', 'attachForbidden', { kind: FORBIDDEN_SNIFF[sniffed], by: 'content' });
  if (!kind) return { kind: null, mime: null, problems };
  const ZIP_KINDS = new Set(['xlsx', 'docx']), BIN = new Set(['pdf', 'png', 'jpeg', 'webp']);
  if (BIN.has(kind)) {
    if (sniffed !== kind && !FORBIDDEN_SNIFF[sniffed]) add(sniffed === 'zip' ? 'must' : 'should', sniffed === 'zip' ? 'attachForbidden' : 'attachMismatch', sniffed === 'zip' ? { kind: 'archive', by: 'content' } : { kind, actual: sniffed || 'unknown' });
    // 重ねたファイル：末尾に ZIP、先頭の 1 KiB に PDF（PDF のほか）や HTML
    if (hasZipTail(b)) add('must', 'attachPolyglot', { also: 'ZIP' });
    const head = asc(b, 0, 1024);
    if (kind !== 'pdf' && head.includes('%PDF-')) add('must', 'attachPolyglot', { also: 'PDF' });
    if (/<(?:!doctype\s+html|html[\s>]|script[\s>]|svg[\s>]|iframe[\s>])/i.test(head)) add('must', 'attachPolyglot', { also: 'HTML' });
    if (kind === 'pdf' && sniffed === 'pdf') await inspectPdf(p, b, add);
  } else if (ZIP_KINDS.has(kind)) {
    if (sniffed !== 'zip') { if (!FORBIDDEN_SNIFF[sniffed]) add('should', 'attachMismatch', { kind, actual: sniffed || 'unknown' }); }
    else {
      if (asc(b, 0, 1024).includes('%PDF-')) add('must', 'attachPolyglot', { also: 'PDF' });
      await inspectOoxml(p, b, kind, add);
    }
  } else if (TEXT_KINDS.has(kind)) {
    if (sniffed && !FORBIDDEN_SNIFF[sniffed]) add(sniffed === 'zip' ? 'must' : 'should', sniffed === 'zip' ? 'attachForbidden' : 'attachMismatch', sniffed === 'zip' ? { kind: 'archive', by: 'content' } : { kind, actual: sniffed });
    else if (!sniffed) {
      const text = decodeText(b);
      if (text === null) add('should', 'attachMismatch', { kind, actual: 'binary' });
      else {
        const mk = markupKind(text);
        if (mk) add('must', 'attachForbidden', { kind: mk, by: 'content' });
        if (hasZipTail(b)) add('must', 'attachPolyglot', { also: 'ZIP' });
        if (kind === 'json' || kind === 'ipynb' || (kind === 'env' && extOf(p) === 'json')) {
          let v; try { v = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { add('should', 'attachMismatch', { kind, why: 'not valid JSON' }); }
          if (v !== undefined && kind === 'ipynb' && !(v && typeof v === 'object' && Array.isArray(v.cells) && Number.isInteger(v.nbformat))) add('should', 'attachMismatch', { kind, why: 'not a Jupyter notebook (no cells and nbformat)' });
        }
        if (kind === 'csv' || kind === 'tsv') { const inj = csvInjection(text, kind === 'tsv' ? '\t' : ','); if (inj) add('advice', 'attachInjection', { n: inj.n, row: inj.row, col: inj.col }); }
        const priv = privateProblem(text);
        if (priv) add('advice', 'attachPrivate', { what: priv });
      }
    }
  }
  return { kind, mime: named.mime, problems };
}

// 再生器（kit/tools.js）に渡す表：役割 → 拡張子（空白で区切る）と、決まった名前（code）、拡張子 → 媒体型（text/plain のほか）
export function runtimeAttachTypes() {
  const roles = {};
  for (const [role, kinds] of Object.entries(ROLE_KINDS)) roles[role] = Object.keys(EXT_KIND).filter((e) => kinds.includes(EXT_KIND[e])).join(' ');
  const mime = {};
  for (const [e, k] of Object.entries(EXT_KIND)) if (KINDS[k] !== T) mime[e] = KINDS[k];
  return { roles, names: [...ENV_NAMES].join(' '), mime, text: T, descriptionChars: DESCRIPTION_CHARS };
}
