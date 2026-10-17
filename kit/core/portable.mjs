// 持ち運べるデッキの形式（format spec 1.0。名前と場所は kit/core/format.mjs）の入れ物：書き出し・読み取り・検査・再生専用の派生。
// Node にもブラウザにも依存しない（node: の読み込みなし。SHA-256 は Web Crypto の crypto.subtle、Node 22 以上とブラウザで動く）
//
//   exportPortable(env, deck.html, opts)  組み立て（build-core）の読み込みを記録して依存の閉包を取り、持ち運べる 1 ファイルの文字列を作る
//   readPortable(text | bytes, opts)    文字列として読む（何も実行しない）。索引・ハッシュ・塊・上限・パスを検査し、メモリ上のフォルダを返す
//   playOnly(text)                     再生専用の派生（§3.7）：索引と、実行系が参照しない塊を除く
//   validateIndex(index)               索引の形（vendor/format-spec/schema と同じ規則。依存なし）→ エラーの配列
//   checkArchivePaths(paths)           パスの規則（§3.3）→ エラーの配列
//   parseJsonStrict(text, opts)        同じ名前の重複を断る JSON の解析（原型のない object を作る）
//
// 鍵で引く表はすべて原型のない object か Map（__proto__ などの鍵で取り違えない）
import { parse as parseHtml } from 'parse5';
import { build as coreBuild, jsonScript, MIME } from './build-core.mjs';
import { parseNarration } from './narration-core.mjs';
import { FORMAT } from './format.mjs';

// 形式の名前から作る識別子（kit/core/format.mjs だけに名前を書く）
const FID = FORMAT.FORMAT_ID, IX_ID = FORMAT.INDEX_ID, BP = FORMAT.BLOB_PREFIX, SCHEME = FORMAT.URI_SCHEME, CFG = FORMAT.CONFIG_FILE, RD_ID = FORMAT.READABLE_ID;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SRC_RE = new RegExp(`^${reEsc(SCHEME)}([A-Za-z0-9_]{1,32})$`);
const LOG = 'portable';   // 知らせの前置

export const FORMAT_VERSION = Object.freeze({ major: 1, minor: 0 });
export const CONTRACTS = Object.freeze({ source: 1, runtime: 1 });
export const FEATURES = Object.freeze(['sources-v1', 'audio-v1']);
export const GENERATOR = 'motion-academic-slides';
const MiB = 1024 * 1024;
// §11 の推奨の上限（読み手が断ってよい値）と §3.2 の塊の大きさ
export const LIMITS = Object.freeze({
  fileBytes: 100 * MiB, archiveBytes: 128 * MiB, files: 3000, depth: 10, indexBytes: 4 * MiB, fileMax: 32 * MiB,
  chunkChars: 262144, chunkBytes: 196608, chunkMax: 9999, members: 200000, jsonDepth: 64, pathBytes: 1024,
});
// 書き出しで「大きい」と知らせる大きさ（章ごとに分けることを勧める）
export const WARN_BYTES = 30 * MiB;

export class FormatError extends Error {
  constructor(code, message, details) { super(message); this.name = 'FormatError'; this.code = code; if (details) this.details = details; }
}
const fail = (code, msg, details) => { throw new FormatError(code, msg, details); };
const dict = () => Object.create(null);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- 文字・バイト・ハッシュ
const enc = new TextEncoder();
export const utf8 = (s) => enc.encode(s);
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  let s = ''; for (const b of d) s += HEX[b]; return s;
}
export function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// RFC 4648 §4、改行なし。正しくなければ null
export function fromBase64(s) {
  if (!B64.test(s)) return null;
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s);
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
// JSON を HTML に入れる形（§2）：< をすべて < に、改行は LF だけ（JSON.stringify は生の改行を出さない）
export const htmlSafeJson = (text) => text.replace(/</g, '\\u003c');
// 文字の位置（code point）の順で比べる（§3.4。JS の既定の並びは UTF-16 の単位なので、サロゲートの位置で順が変わる）
export function cmpCodePoint(a, b) {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
// UUID（版 4）。crypto.randomUUID は安全な文脈でしか使えないので、乱数から作る
export function newDocId(rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const b = rand(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => HEX[x]).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const nonce = () => [...globalThis.crypto.getRandomValues(new Uint8Array(9))].map((x) => HEX[x]).join('');

// ---------------------------------------------------------------- 規則
export const RE = Object.freeze({
  sha256: /^[0-9a-f]{64}$/,
  blobId: /^[A-Za-z0-9_]{1,32}$/,
  chunkId: new RegExp(`^${reEsc(BP)}([A-Za-z0-9_]{1,32})-(0|[1-9][0-9]{0,3})$`),
  stepKey: /^.+:(0|[1-9][0-9]{0,2}|concl)$/s,
  docId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  feature: /^[a-z0-9-]+$/,
  mime: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/,
  voice: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  tag: /^[a-z][a-z0-9]*-[a-z0-9-]+$/,
  extName: /^[a-z][a-z0-9]{0,31}$/,
  // vendor/format-spec/schema の metadata の lang と同じ（BCP 47 の近似）
  lang: /^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z0-9]{2,8})+)*(?:-[Xx](?:-[A-Za-z0-9]{1,8})+)?|[Xx](?:-[A-Za-z0-9]{1,8})+|[Ii]-[A-Za-z]+)$/,
});
// 音声の塊に許す MIME（§5.1 と、残すだけのもの）
export const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']);
// 原稿のファイルの MIME（build-core の MIME に、文字のファイルを足したもの）
const TEXT_MIME = { html: 'text/html', htm: 'text/html', md: 'text/markdown', tex: 'text/x-tex', txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', yaml: 'text/yaml', yml: 'text/yaml', mjs: 'text/javascript', xml: 'application/xml' };
export function mimeOf(path) {
  const ext = (path.match(/\.([^./]+)$/)?.[1] || '').toLowerCase();
  return TEXT_MIME[ext] || MIME[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------- パス（§3.3）
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i;
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
// 既定の大文字小文字の畳み込みの近似：NFC → 大文字 → 小文字 → NFC（ß→ss、ﬁ→fi などの完全な畳み込みを含む）
export const foldPath = (p) => p.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
// 1 つのパスの問題（なければ null）
export function pathProblem(p, limits = LIMITS) {
  if (typeof p !== 'string' || !p) return 'empty path';
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(p)) return 'not valid UTF-8 (lone surrogate)';
  if (p.normalize('NFC') !== p) return 'not NFC';
  if (utf8Length(p) > limits.pathBytes) return `longer than ${limits.pathBytes} bytes`;
  if (p.startsWith('/')) return 'absolute path';
  if (p.includes('\\')) return 'backslash';
  if (/^[A-Za-z]:/.test(p)) return 'drive letter';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(p)) return 'control character';
  if (/[<>:"|?*]/.test(p)) return 'forbidden character (< > : " | ? *)';
  if (p.endsWith('/')) return 'ends with /';
  const segs = p.split('/');
  if (segs.length > limits.depth) return `more than ${limits.depth} segments`;
  for (const s of segs) {
    if (s === '') return 'empty segment';
    if (s === '.' || s === '..') return `segment "${s}"`;
    if (/[. ]$/.test(s)) return 'segment ends in a dot or space';
    if (RESERVED.test(s.split('.')[0].trimEnd())) return `Windows reserved name "${s}"`;
    if (PROTO.has(s)) return `reserved segment "${s}"`;
  }
  return null;
}
// パスの集合の問題：1 つずつの規則、大文字小文字を畳んだ重なり、ファイルとフォルダの重なり
export function checkArchivePaths(paths, limits = LIMITS) {
  const errors = [];
  const folded = new Map();
  for (const p of paths) {
    const why = pathProblem(p, limits);
    if (why) { errors.push(`path "${p}": ${why}`); continue; }
    const f = foldPath(p);
    if (folded.has(f)) errors.push(`path "${p}" collides with "${folded.get(f)}" (case-insensitive)`);
    else folded.set(f, p);
  }
  for (const [f, p] of folded) {
    const segs = f.split('/');
    for (let i = 1; i < segs.length; i++) {
      const dir = segs.slice(0, i).join('/');
      if (folded.has(dir)) errors.push(`path "${folded.get(dir)}" is a file and also a directory of "${p}"`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- JSON（同じ名前の重複を断る・上限つき）
// 原型のない object を作る。maxMembers は object の名前と配列の要素の合計、maxDepth は入れ子の深さ
export function parseJsonStrict(text, { maxMembers = LIMITS.members, maxDepth = LIMITS.jsonDepth } = {}) {
  let i = 0, members = 0;
  const err = (msg) => fail('bad-json', `JSON: ${msg} at ${i}`);
  const ws = () => { while (i < text.length) { const c = text.charCodeAt(i); if (c === 32 || c === 10 || c === 13 || c === 9) i++; else break; } };
  const count = () => { if (++members > maxMembers) fail('too-many-members', `JSON: more than ${maxMembers} members`); };
  function str() {
    i++; let out = '', start = i;
    for (;;) {
      if (i >= text.length) err('unterminated string');
      const c = text.charCodeAt(i);
      if (c === 34) { out += text.slice(start, i); i++; return out; }
      if (c < 0x20) err('control character in string');
      if (c === 92) {
        out += text.slice(start, i);
        const e = text[i + 1];
        const m = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[e];
        if (m !== undefined) { out += m; i += 2; } else if (e === 'u') {
          const h = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(h)) err('bad \\u escape');
          out += String.fromCharCode(parseInt(h, 16)); i += 6;
        } else err('bad escape');
        start = i;
      } else i++;
    }
  }
  const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function value(depth) {
    if (depth > maxDepth) fail('too-deep', `JSON: deeper than ${maxDepth}`);
    ws();
    const c = text[i];
    if (c === '{') {
      i++; const o = dict(); ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws(); if (text[i] !== '"') err('expected member name');
        const k = str(); count();
        if (own(o, k)) fail('duplicate-member', `JSON: duplicate member name "${k}"`);
        ws(); if (text[i] !== ':') err('expected :'); i++;
        Object.defineProperty(o, k, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        err('expected , or }');
      }
    }
    if (c === '[') {
      i++; const a = []; ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        count(); a.push(value(depth + 1)); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        err('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    NUM.lastIndex = i;
    const m = NUM.exec(text);
    if (m) { i += m[0].length; return Number(m[0]); }
    err('unexpected character');
  }
  const v = value(0); ws();
  if (i !== text.length) err('trailing characters');
  return v;
}

// ---------------------------------------------------------------- 索引の検査（vendor/format-spec/schema と同じ規則、依存なし）
export function validateIndex(ix) {
  const e = [];
  const need = (o, keys, where) => { for (const k of keys) if (!own(o, k)) e.push(`${where}: missing "${k}"`); };
  const str = (v, where, re, min = 0) => { if (typeof v !== 'string') { e.push(`${where}: not a string`); return false; } if (v.length < min) e.push(`${where}: empty`); if (re && !re.test(v)) e.push(`${where}: "${v.slice(0, 80)}" does not match ${re}`); return true; };
  const int = (v, where, min) => { if (!Number.isInteger(v) || v < min) e.push(`${where}: not an integer >= ${min}`); };
  const path = (v, where) => { if (str(v, where)) { const p = pathProblem(v); if (p) e.push(`${where}: ${p}`); } };
  if (!isObj(ix)) return ['index: not an object'];
  need(ix, ['format', 'version', 'profile', 'requires', 'contracts', 'generator', 'docId', 'entry', 'sourceSha256', 'files', 'blobs', 'metadata'], 'index');
  if (own(ix, 'format') && ix.format !== FID) e.push(`format: not "${FID}"`);
  if (own(ix, 'version')) versionCheck(ix.version, 'version', e);
  if (own(ix, 'profile') && !['core', 'extended'].includes(ix.profile)) e.push('profile: not core or extended');
  if (own(ix, 'requires')) {
    if (!Array.isArray(ix.requires)) e.push('requires: not an array');
    else { ix.requires.forEach((f, j) => str(f, `requires[${j}]`, RE.feature)); if (new Set(ix.requires).size !== ix.requires.length) e.push('requires: duplicate items'); }
  }
  if (own(ix, 'contracts')) contractsCheck(ix.contracts, 'contracts', e);
  if (own(ix, 'generator')) generatorCheck(ix.generator, 'generator', e);
  if (own(ix, 'docId')) str(ix.docId, 'docId', RE.docId);
  if (own(ix, 'entry')) path(ix.entry, 'entry');
  if (own(ix, 'sourceSha256')) str(ix.sourceSha256, 'sourceSha256', RE.sha256);
  if (own(ix, 'files')) {
    if (!isObj(ix.files)) e.push('files: not an object');
    else {
      const keys = Object.keys(ix.files);
      if (!keys.length) e.push('files: empty');
      for (const k of keys) { path(k, `files["${k}"] (path)`); str(ix.files[k], `files["${k}"]`, RE.blobId); }
    }
  }
  if (own(ix, 'blobs')) {
    if (!isObj(ix.blobs)) e.push('blobs: not an object');
    else {
      const keys = Object.keys(ix.blobs);
      if (!keys.length) e.push('blobs: empty');
      for (const k of keys) {
        const w = `blobs["${k}"]`, b = ix.blobs[k];
        if (!RE.blobId.test(k)) e.push(`${w}: bad blob id`);
        if (!isObj(b)) { e.push(`${w}: not an object`); continue; }
        need(b, ['mime', 'bytes', 'sha256', 'chunks'], w);
        if (own(b, 'mime')) str(b.mime, `${w}.mime`, RE.mime);
        if (own(b, 'bytes')) int(b.bytes, `${w}.bytes`, 0);
        if (own(b, 'sha256')) str(b.sha256, `${w}.sha256`, RE.sha256);
        if (own(b, 'chunks')) {
          if (!Array.isArray(b.chunks) || !b.chunks.length) e.push(`${w}.chunks: not a non-empty array`);
          else b.chunks.forEach((c, j) => str(c, `${w}.chunks[${j}]`, RE.chunkId));
        }
      }
    }
  }
  if (own(ix, 'audio')) {
    if (!isObj(ix.audio)) e.push('audio: not an object');
    else for (const k of Object.keys(ix.audio)) {
      if (!RE.stepKey.test(k) || k.length > 200) e.push(`audio["${k}"]: bad step key`);
      audioRecordCheck(ix.audio[k], `audio["${k}"]`, e);
    }
  }
  if (own(ix, 'components')) {
    if (!Array.isArray(ix.components)) e.push('components: not an array');
    else ix.components.forEach((c, j) => {
      const w = `components[${j}]`;
      if (!isObj(c)) { e.push(`${w}: not an object`); return; }
      need(c, ['tag', 'name', 'version', 'sha256', 'source'], w);
      if (own(c, 'tag')) str(c.tag, `${w}.tag`, RE.tag);
      if (own(c, 'name')) str(c.name, `${w}.name`, null, 1);
      if (own(c, 'version')) str(c.version, `${w}.version`, null, 1);
      if (own(c, 'sha256')) str(c.sha256, `${w}.sha256`, RE.sha256);
      if (own(c, 'source') && !['registry', 'embedded'].includes(c.source)) e.push(`${w}.source: not registry or embedded`);
      if (c.source === 'embedded' && !own(c, 'path')) e.push(`${w}: embedded without path`);
      if (own(c, 'path')) path(c.path, `${w}.path`);
    });
  }
  if (own(ix, 'metadata')) metadataCheck(ix.metadata, 'metadata', e);
  if (own(ix, 'excluded') && !(Array.isArray(ix.excluded) && ix.excluded.every((x) => typeof x === 'string'))) e.push('excluded: not an array of strings');
  if (own(ix, 'extensions')) {
    if (!isObj(ix.extensions)) e.push('extensions: not an object');
    else for (const k of Object.keys(ix.extensions)) {
      if (!RE.extName.test(k)) e.push(`extensions["${k}"]: bad extension name`);
      const x = ix.extensions[k];
      if (!isObj(x)) e.push(`extensions["${k}"]: not an object`);
      else if (!own(x, 'v')) e.push(`extensions["${k}"]: missing "v"`);
      else int(x.v, `extensions["${k}"].v`, 1);
    }
  }
  return e;
}
function versionCheck(v, w, e) {
  if (!isObj(v)) { e.push(`${w}: not an object`); return; }
  if (!own(v, 'major') || !own(v, 'minor')) e.push(`${w}: needs major and minor`);
  if (own(v, 'major') && v.major !== 1) e.push(`${w}.major: not 1`);
  if (own(v, 'minor') && !(Number.isInteger(v.minor) && v.minor >= 0)) e.push(`${w}.minor: not an integer >= 0`);
}
function contractsCheck(c, w, e) {
  if (!isObj(c)) { e.push(`${w}: not an object`); return; }
  for (const k of ['source', 'runtime']) if (!(Number.isInteger(c[k]) && c[k] >= 1)) e.push(`${w}.${k}: not an integer >= 1`);
}
function generatorCheck(g, w, e) {
  if (!isObj(g)) { e.push(`${w}: not an object`); return; }
  for (const k of ['name', 'version']) if (!(typeof g[k] === 'string' && g[k].length)) e.push(`${w}.${k}: not a non-empty string`);
}
const numArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);
function audioRecordCheck(r, w, e) {
  if (!isObj(r)) { e.push(`${w}: not an object`); return; }
  for (const k of ['file', 'dur', 'cues', 'kind', 'inputHash']) if (!own(r, k)) e.push(`${w}: missing "${k}"`);
  if (own(r, 'file')) { const p = typeof r.file === 'string' ? pathProblem(r.file) : 'not a string'; if (p) e.push(`${w}.file: ${p}`); else if (!r.file.startsWith('audio/')) e.push(`${w}.file: not under audio/`); }
  if (own(r, 'dur') && !(typeof r.dur === 'number' && r.dur > 0)) e.push(`${w}.dur: not a number > 0`);
  if (own(r, 'cues')) {
    if (!numArr(r.cues)) e.push(`${w}.cues: not an array of numbers >= 0`);
    else if (r.cues.some((x, j) => j && x < r.cues[j - 1])) e.push(`${w}.cues: not in order`);
  }
  if (own(r, 'sync') && !['auto', 'manual', 'none'].includes(r.sync)) e.push(`${w}.sync: not auto, manual or none`);
  if (r.sync === 'none' && Array.isArray(r.cues) && r.cues.length) e.push(`${w}: sync "none" with cues`);
  if (own(r, 'kind') && !['tts', 'recorded', 'imported'].includes(r.kind)) e.push(`${w}.kind: not tts, recorded or imported`);
  if (own(r, 'inputHash') && !(typeof r.inputHash === 'string' && RE.sha256.test(r.inputHash))) e.push(`${w}.inputHash: not a sha256`);
  if (r.kind === 'tts' && !own(r, 'recipe')) e.push(`${w}: tts without recipe`);
  if (own(r, 'recipe')) {
    const c = r.recipe, x = `${w}.recipe`;
    if (!isObj(c)) e.push(`${x}: not an object`);
    else {
      for (const k of ['engine', 'model', 'voice', 'processing']) if (!own(c, k)) e.push(`${x}: missing "${k}"`);
      for (const k of ['engine', 'model', 'processing']) if (own(c, k) && typeof c[k] !== 'string') e.push(`${x}.${k}: not a string`);
      if (own(c, 'voice')) {
        if (!isObj(c.voice)) e.push(`${x}.voice: not an object`);
        else for (const k of Object.keys(c.voice)) {
          if (k !== 'expert' && k !== 'novice') e.push(`${x}.voice: unknown role "${k}"`);
          if (!(typeof c.voice[k] === 'string' && RE.voice.test(c.voice[k]))) e.push(`${x}.voice.${k}: not a public voice identifier`);
        }
      }
      if (own(c, 'seed') && !(c.seed === null || Number.isInteger(c.seed))) e.push(`${x}.seed: not an integer or null`);
      if (own(c, 'dictionary') && !(c.dictionary === null || typeof c.dictionary === 'string')) e.push(`${x}.dictionary: not a string or null`);
    }
  }
  if (own(r, 'recipeDigest') && typeof r.recipeDigest !== 'string') e.push(`${w}.recipeDigest: not a string`);
  if (own(r, 'alternatives')) {
    if (!Array.isArray(r.alternatives)) e.push(`${w}.alternatives: not an array`);
    else r.alternatives.forEach((a, j) => {
      const x = `${w}.alternatives[${j}]`;
      if (!isObj(a)) { e.push(`${x}: not an object`); return; }
      const p = typeof a.file === 'string' ? pathProblem(a.file) : 'not a string';
      if (p) e.push(`${x}.file: ${p}`); else if (!a.file.startsWith('audio/')) e.push(`${x}.file: not under audio/`);
      if (typeof a.mime !== 'string') e.push(`${x}.mime: not a string`);
      if (!(typeof a.startOffset === 'number' && a.startOffset >= 0)) e.push(`${x}.startOffset: not a number >= 0`);
    });
  }
}
const strArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
function metadataCheck(m, w, e) {
  if (!isObj(m)) { e.push(`${w}: not an object`); return; }
  if (!(typeof m.title === 'string' && m.title.length)) e.push(`${w}.title: not a non-empty string`);
  if (!(typeof m.lang === 'string' && m.lang.length <= 64 && RE.lang.test(m.lang))) e.push(`${w}.lang: not a BCP 47 tag`);
  for (const k of ['description', 'license', 'copyright', 'attribution']) if (own(m, k) && typeof m[k] !== 'string') e.push(`${w}.${k}: not a string`);
  for (const k of ['creators', 'curriculum']) if (own(m, k) && !strArr(m[k])) e.push(`${w}.${k}: not an array of strings`);
  for (const k of ['created', 'modified', 'email']) if (own(m, k)) e.push(`${w}: must not contain "${k}"`);
  if (own(m, 'accessibility')) {
    const a = m.accessibility;
    if (!isObj(a)) e.push(`${w}.accessibility: not an object`);
    else {
      for (const k of ['accessMode', 'accessModeSufficient', 'accessibilityFeature', 'accessibilityHazard']) if (own(a, k) && !strArr(a[k])) e.push(`${w}.accessibility.${k}: not an array of strings`);
      if (own(a, 'accessibilitySummary') && typeof a.accessibilitySummary !== 'string') e.push(`${w}.accessibility.accessibilitySummary: not a string`);
    }
  }
  if (own(m, 'completion')) completionCheck(m.completion, `${w}.completion`, e);
  if (own(m, 'derivedFrom')) {
    const d = m.derivedFrom;
    if (!isObj(d)) e.push(`${w}.derivedFrom: not an object`);
    else {
      if (!(typeof d.docId === 'string' && RE.docId.test(d.docId))) e.push(`${w}.derivedFrom.docId: not a UUID`);
      if (!(typeof d.sourceSha256 === 'string' && RE.sha256.test(d.sourceSha256))) e.push(`${w}.derivedFrom.sourceSha256: not a sha256`);
      if (own(d, 'anchor') && !(typeof d.anchor === 'string' && RE.stepKey.test(d.anchor))) e.push(`${w}.derivedFrom.anchor: not a step key`);
    }
  }
  if (own(m, 'authorship')) {
    if (!isObj(m.authorship)) e.push(`${w}.authorship: not an object`);
    else for (const k of Object.keys(m.authorship)) {
      const a = m.authorship[k];
      if (!isObj(a) || !['human', 'ai', 'mixed'].includes(a.by)) e.push(`${w}.authorship["${k}"].by: not human, ai or mixed`);
      else if (own(a, 'reviewed') && typeof a.reviewed !== 'boolean') e.push(`${w}.authorship["${k}"].reviewed: not a boolean`);
    }
  }
  if (own(m, 'audience') && !['public', 'individual'].includes(m.audience)) e.push(`${w}.audience: not public or individual`);
}
function completionCheck(c, w, e) {
  if (!isObj(c)) { e.push(`${w}: not an object`); return; }
  const n = Object.keys(c).length;
  if (n !== 1) e.push(`${w}: needs exactly one rule`);
  if (own(c, 'visitedFraction') && !(typeof c.visitedFraction === 'number' && c.visitedFraction > 0 && c.visitedFraction <= 1)) e.push(`${w}.visitedFraction: not in (0, 1]`);
  if (own(c, 'reachedEnd') && c.reachedEnd !== true) e.push(`${w}.reachedEnd: not true`);
}
// 実行系の deck-meta（vendor/format-spec/schema/deck-meta.schema.json）
export function validateDeckMeta(m) {
  const e = [];
  if (!isObj(m)) return ['deck-meta: not an object'];
  for (const k of ['format', 'version', 'contracts', 'generator', 'docId', 'title', 'lang', 'portable', 'tracking']) if (!own(m, k)) e.push(`deck-meta: missing "${k}"`);
  if (own(m, 'format') && m.format !== FID) e.push(`deck-meta.format: not "${FID}"`);
  if (own(m, 'version')) versionCheck(m.version, 'deck-meta.version', e);
  if (own(m, 'contracts')) contractsCheck(m.contracts, 'deck-meta.contracts', e);
  if (own(m, 'generator')) generatorCheck(m.generator, 'deck-meta.generator', e);
  if (own(m, 'docId') && !(typeof m.docId === 'string' && RE.docId.test(m.docId))) e.push('deck-meta.docId: not a UUID');
  if (own(m, 'title') && !(typeof m.title === 'string' && m.title.length)) e.push('deck-meta.title: not a non-empty string');
  if (own(m, 'lang') && !(typeof m.lang === 'string' && m.lang.length <= 64 && RE.lang.test(m.lang))) e.push('deck-meta.lang: not a BCP 47 tag');
  if (own(m, 'portable') && typeof m.portable !== 'boolean') e.push('deck-meta.portable: not a boolean');
  if (m.portable === true && !own(m, 'sourceSha256')) e.push('deck-meta: portable without sourceSha256');
  if (own(m, 'sourceSha256') && !(typeof m.sourceSha256 === 'string' && RE.sha256.test(m.sourceSha256))) e.push('deck-meta.sourceSha256: not a sha256');
  if (own(m, 'tracking') && !(Array.isArray(m.tracking) && m.tracking.every((x) => typeof x === 'string' && RE.feature.test(x)) && new Set(m.tracking).size === m.tracking.length)) e.push('deck-meta.tracking: not a list of unique adapter names');
  if (own(m, 'completion')) completionCheck(m.completion, 'deck-meta.completion', e);
  for (const k of ['license', 'copyright', 'attribution']) if (own(m, k) && typeof m[k] !== 'string') e.push(`deck-meta.${k}: not a string`);
  return e;
}
// 実行系の deck-audio（vendor/format-spec/schema/deck-audio.schema.json）
export function validateDeckAudio(a) {
  const e = [];
  if (!isObj(a)) return ['deck-audio: not an object'];
  for (const k of Object.keys(a)) {
    const w = `deck-audio["${k}"]`, r = a[k];
    if (!RE.stepKey.test(k) || k.length > 200) e.push(`${w}: bad step key`);
    if (!isObj(r)) { e.push(`${w}: not an object`); continue; }
    if (!(typeof r.src === 'string' && (/^data:audio\/[a-z0-9.+-]+;base64,/.test(r.src) || SRC_RE.test(r.src)))) e.push(`${w}.src: not a data:audio URI or ${SCHEME}<blobId>`);
    if (!(typeof r.dur === 'number' && r.dur > 0)) e.push(`${w}.dur: not a number > 0`);
    if (!numArr(r.cues)) e.push(`${w}.cues: not an array of numbers >= 0`);
    if (own(r, 'sync') && !['auto', 'manual', 'none'].includes(r.sync)) e.push(`${w}.sync: not auto, manual or none`);
    if (r.sync === 'none' && Array.isArray(r.cues) && r.cues.length) e.push(`${w}: sync "none" with cues`);
  }
  return e;
}

// ---------------------------------------------------------------- §5.4 inputHash と §3.4 sourceSha256
const token = (b) => b.type === 'cue' ? 'cue' : b.type === 'clear' ? 'mark:clear' : `mark:${b.id}|${b.effect}` + (b.hold === null || b.hold === undefined ? '' : `|hold=${b.hold}`);
// seg：parseNarration の段階（turns に role・ttsParts・bounds）
export const inputCanonical = (seg) => JSON.stringify(seg.turns.map((t) => [t.role, t.ttsParts, t.bounds.map(token)]));
export const inputHash = (seg) => sha256Hex(inputCanonical(seg));
// fileShas：{path: sha256}（audio/ の下は入れない）
export function sourceSha256(fileShas) {
  const paths = Object.keys(fileShas).filter((p) => !p.startsWith('audio/')).sort(cmpCodePoint);
  return sha256Hex(paths.map((p) => `${p}\t${fileShas[p]}\n`).join(''));
}

// ---------------------------------------------------------------- 書き出しから外すもの（§3.3）
// [正規表現, 分類]。分類は index.excluded に入る（決まった一覧。原稿から何が外れたかには依らない）
const EXCLUDE = [
  [/(^|\/)\./, 'hidden files (.cache, .git, .env, ...)'],
  [/^(?:out|video|bundle|node_modules|__pycache__)(\/|$)/, 'build output and dependencies (out/, video/, bundle/, node_modules/)'],
  [/(^|\/)comments\.json$/, 'review notes (comments.json)'],
  [/(?:\.(?:bak|orig|swp|tmp)|~)$/i, 'backups'],
  [/\.local\.json$/i, 'local settings (*.local.json)'],
  [/(?:\.(?:pem|key|p12|pfx)$|(^|\/)(?:credentials|secrets?)(\.[^/]*)?$)/i, 'credentials'],
];
export const EXCLUDED_CATEGORIES = Object.freeze([...EXCLUDE.map((x) => x[1]), 'audio not referenced by a narration step', 'personal reference voices', 'machine-specific paths in voice.json']);
export const excludedReason = (rel) => (EXCLUDE.find(([re]) => re.test(rel)) || [])[1] || null;

// voice.json：声の指定がパスなら、ファイル名（拡張子なし）だけにする。そのほかの場所らしい値は消す
export function redactVoiceJson(text) {
  let v;
  try { v = JSON.parse(text); } catch { return { text, redacted: [] }; }
  if (!isObj(v)) return { text, redacted: [] };
  const redacted = [];
  const isPath = (s) => typeof s === 'string' && (/[\\/]/.test(s) || /^~/.test(s) || /^[A-Za-z]:/.test(s));
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (isPath(x)) {
      const stem = x.split(/[\\/]/).pop().replace(/\.[^.]*$/, '');
      if ((k === 'expert' || k === 'novice') && RE.voice.test(stem)) out[k] = stem;
      redacted.push(k);
    } else out[k] = x;
  }
  if (!redacted.length) return { text, redacted };
  return { text: JSON.stringify(out, null, 2) + '\n', redacted };
}
// 音声の recipe の声：公開の名前（パスならファイル名、拡張子なし）
export function voiceName(v) {
  if (typeof v !== 'string' || !v) return null;
  const stem = v.split(/[\\/]/).pop().replace(/\.wav$/i, '');
  return RE.voice.test(stem) ? stem : null;
}

// ---------------------------------------------------------------- 書き出し
const readBytesVia = (env, p) => (env.readBytes ? env.readBytes(p) : fromBase64(env.readBase64(p)));
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
const plain = (s) => String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\\\(|\\\)/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const stepOrder = (k) => (k === 'concl' ? Infinity : +k);
// 書き出す metadata：設定のファイル（FORMAT.CONFIG_FILE）の metadata のうち仕様の項目だけ（時刻・メールなどは入れない）
const META_KEYS = ['description', 'license', 'copyright', 'attribution', 'creators', 'accessibility', 'curriculum', 'completion', 'derivedFrom', 'authorship', 'audience'];

// env：build-core の env。必須でないもの：env.readBytes(p)（なければ readBase64）、env.compressAudio、env.audioFailed
// opts：build-core の opts（theme など）に加えて
//   build(env, src, opts)  組み立ての関数（既定は build-core の build。編集アプリは自分の組み立てを渡せる）
// 返すもの：{html, index, deckMeta, files: {path: Uint8Array}, audio, writes: {path: 文字列}（原稿に残すもの：FORMAT.CONFIG_FILE）, warnings, stats}
export async function exportPortable(env, srcPath, opts = {}) {
  const P = env.path;
  const deckDir = P.dirname(P.resolve(srcPath));
  const rel = (p) => P.relative(deckDir, p).split(P.sep).join('/');
  const warnings = [], writes = dict();
  const inDeck = (p) => env.within(p, deckDir);

  // 組み立てが読んだファイルを記録する
  const reads = new Set();
  const rec = { ...env,
    readText(p) { reads.add(P.resolve(p)); return env.readText(p); },
    readBase64(p) { reads.add(P.resolve(p)); return env.readBase64(p); },
  };
  // 口述原稿：音声を段階に結び付け、inputHash と拡張の行に使う（build と同じ規則で読む）
  const narrPath = P.join(deckDir, 'narration.md');
  const segs = env.exists(narrPath) && inDeck(narrPath) ? parseNarration(env.readText(narrPath)) : [];
  const segByKey = new Map(segs.map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  const tag = nonce();
  const pend = [];
  const audioRef = (key, file, v) => {
    if (!segByKey.has(key)) { warnings.push(`${LOG}: audio for "${key}" has no narration step; not included`); return null; }
    if (!(typeof v.dur === 'number' && v.dur > 0)) { warnings.push(`${LOG}: audio for "${key}" has no duration; not included`); return null; }
    pend.push({ key, file, v });
    return `${SCHEME}P${tag}_${pend.length - 1}`;
  };
  const metaPh = { format: FID, placeholder: tag };
  const prefixPh = `<!--archive-${tag}-->`;
  const r = (opts.build || coreBuild)(rec, srcPath, { ...opts, embedAudio: false, audioRef, deckMeta: metaPh, runtimePrefix: prefixPh });
  for (const w of r.stats.warn) warnings.push(w);
  let html = r.html;
  if (new RegExp(`\\bid\\s*=\\s*["']?(?:${[IX_ID, RD_ID, BP, FORMAT.SIGNATURES_ID].map(reEsc).join('|')})`, 'i').test(html)) fail('reserved-id', `the deck uses a reserved id (${IX_ID}, ${RD_ID}, ${BP}…)`);

  // 原稿のファイル（依存の閉包）と、部品庫・テーマ庫の参照
  const files = dict();
  const compDir = P.join(env.ROOT, 'components'), themeDir = P.join(env.ROOT, 'themes');
  const regComp = new Map(), regTheme = new Map();
  for (const p of [...reads].sort()) {
    if (inDeck(p)) {
      const rp = rel(p);
      if (rp.startsWith('audio/')) continue;               // 音声は下で（manifest と控えの JSON は入れない）
      const why = excludedReason(rp);
      if (why) { warnings.push(`${LOG}: "${rp}" was read by the build but is excluded (${why}); the archive cannot rebuild it`); continue; }
      files[rp] = readBytesVia(env, p);
    } else if (env.within(p, compDir)) {
      const name = P.relative(compDir, p).split(P.sep)[0];
      if (!regComp.has(name)) regComp.set(name, new Map());
      regComp.get(name).set(P.relative(P.join(compDir, name), p).split(P.sep).join('/'), readBytesVia(env, p));
    } else if (env.within(p, themeDir)) {
      const name = P.relative(themeDir, p).split(P.sep)[0];
      if (!regTheme.has(name)) regTheme.set(name, new Map());
      regTheme.get(name).set(P.relative(P.join(themeDir, name), p).split(P.sep).join('/'), readBytesVia(env, p));
    }
  }
  const entry = rel(P.resolve(srcPath));
  if (!files[entry]) files[entry] = readBytesVia(env, P.resolve(srcPath));
  // voice.json（TTS の設定。build は読まない）：個人のパスを伏せる
  const vPath = P.join(deckDir, 'voice.json');
  if (env.exists(vPath) && inDeck(vPath)) {
    const red = redactVoiceJson(env.readText(vPath));
    if (red.redacted.length) warnings.push(`${LOG}: voice.json: local paths redacted (${red.redacted.join(', ')})`);
    files['voice.json'] = utf8(red.text);
  }
  // 設定のファイル（FORMAT.CONFIG_FILE）：docId（一度だけ作り、原稿に残して書き出しのたびに同じものを使う）と metadata
  const ePath = P.join(deckDir, CFG);
  let econf = {};
  if (env.exists(ePath) && inDeck(ePath)) {
    try { econf = parseJsonStrict(env.readText(ePath)); } catch (e) { fail('bad-config', `${CFG}: ${e.message}`); }
    if (!isObj(econf)) fail('bad-config', `${CFG}: not an object`);
  }
  if (own(econf, 'docId') && !(typeof econf.docId === 'string' && RE.docId.test(econf.docId))) fail('bad-config', `${CFG}: docId "${econf.docId}" is not a lowercase UUID`);
  if (!own(econf, 'docId')) {
    const text = JSON.stringify({ docId: newDocId(), ...Object.fromEntries(Object.entries(econf)) }, null, 2) + '\n';
    econf = JSON.parse(text);
    writes[CFG] = text;
  }
  files[CFG] = writes[CFG] ? utf8(writes[CFG]) : readBytesVia(env, ePath);
  const docId = econf.docId;

  // 外したもの・パスの規則
  const pathErr = checkArchivePaths(Object.keys(files));
  if (pathErr.length) fail('bad-path', 'archive paths break §3.3: ' + pathErr.join('; '), pathErr);
  for (const p of Object.keys(files)) {
    if (!/^(?:text|application\/(?:json|xml))|svg/.test(mimeOf(p))) continue;
    const t = new TextDecoder().decode(files[p]);
    if (/(?:\/Users\/|\/home\/)[^\s"'<>/]+|[A-Za-z]:\\(?:Users|Documents and Settings)\\/.test(t)) warnings.push(`${LOG}: "${p}" seems to contain a machine-specific path (check before sharing)`);
  }

  // 音声：埋め込みと同じく AAC に圧縮（ffmpeg がなければ WAV のまま）。同じ中身は 1 つの塊に
  const audioFiles = dict(), audio = dict(), fileOfSrc = new Map();
  const segJson = (v) => {
    const p = P.join(deckDir, 'audio', `seg_${v.digest}.json`);
    if (!v.digest || !/^[0-9a-f]+$/.test(v.digest) || !env.exists(p) || !inDeck(p)) return null;
    try { return JSON.parse(env.readText(p)); } catch { return null; }
  };
  for (const { key, file, v } of pend) {
    let apath = fileOfSrc.get(file);
    if (!apath) {
      const packed = env.compressAudio ? env.compressAudio(file) : file;
      const bytes = readBytesVia(env, packed);
      const ext = P.extname(packed).toLowerCase();
      let ar = P.relative(P.join(deckDir, 'audio'), file).split(P.sep).join('/');
      if (ar.startsWith('..')) ar = P.basename(file);
      apath = 'audio/' + ar.replace(/\.[^./]*$/, '') + ext;
      if (audioFiles[apath]) fail('audio-collision', `two audio files map to ${apath}`);
      audioFiles[apath] = bytes;
      fileOfSrc.set(file, apath);
    }
    const seg = segByKey.get(key);
    const rcd = { file: apath, dur: v.dur, cues: v.sync === 'none' ? [] : (v.cues || []), sync: v.sync || 'auto', kind: v.kind || 'tts' };
    // inputHash：manifest にあればそれ（展開したフォルダ）。なければ今の口述原稿から。ただし控えの JSON の声と文で作り直した digest が
    // manifest の digest と違う（原稿を直した後に合成していない）なら、今の原稿の hash は使えないので「古い」印の値にする
    const sj = segJson(v);
    if (typeof v.inputHash === 'string' && RE.sha256.test(v.inputHash)) rcd.inputHash = v.inputHash;
    else {
      rcd.inputHash = await inputHash(seg);
      if (sj && sj.voice && v.digest) {
        const d = (await sha256Hex(JSON.stringify({ turns: seg.turns.map((t) => [t.role, t.ttsParts]), voice: sj.voice }))).slice(0, 12);
        if (d !== v.digest) { rcd.inputHash = await sha256Hex('stale\t' + v.digest); warnings.push(`${LOG}: audio for "${key}" was made from older narration (stale)`); }
      }
    }
    if (rcd.kind === 'tts') rcd.recipe = isObj(v.recipe) ? v.recipe : recipeOf(sj, v);
    if (v.digest) rcd.recipeDigest = String(v.digest);
    audio[key] = rcd;
  }
  if (env.audioFailed && env.audioFailed()) warnings.push(`${LOG}: could not compress audio to AAC (no ffmpeg?); WAV is embedded and the file is large`);

  // 塊：中身の sha256 の先頭 32 字を id に（同じ中身は 1 つ）
  const all = { ...files, ...audioFiles };
  const shaOf = dict();
  for (const p of Object.keys(all)) shaOf[p] = await sha256Hex(all[p]);
  const srcSha = await sourceSha256(Object.fromEntries(Object.keys(files).map((p) => [p, shaOf[p]])));
  const fileMap = dict(), blobs = dict(), chunks = [];
  for (const p of Object.keys(all).sort(cmpCodePoint)) {
    const id = shaOf[p].slice(0, 32);
    fileMap[p] = id;
    if (blobs[id]) { if (blobs[id].sha256 !== shaOf[p]) fail('blob-collision', `blob id collision at ${id}`); continue; }
    const b = all[p], ids = [];
    const n = Math.max(1, Math.ceil(b.length / LIMITS.chunkBytes));
    if (n - 1 > LIMITS.chunkMax) fail('too-large', `${p}: more than ${LIMITS.chunkMax + 1} chunks`);
    for (let j = 0; j < n; j++) {
      ids.push(`${BP}${id}-${j}`);
      chunks.push(`<script type="application/octet-stream" id="${BP}${id}-${j}">${toBase64(b.subarray(j * LIMITS.chunkBytes, (j + 1) * LIMITS.chunkBytes))}</script>`);
    }
    blobs[id] = { mime: p.startsWith('audio/') ? (mimeOf(p) === 'application/octet-stream' ? 'audio/mpeg' : mimeOf(p)) : mimeOf(p), bytes: b.length, sha256: shaOf[p], chunks: ids };
  }

  // 部品とテーマ
  const components = [];
  let embeddedCode = false;
  for (const t of r.stats.components) {
    const name = t.slice(2), local = `components/${name}/index.js`;
    if (files[local]) { components.push({ tag: t, name, version: 'local', sha256: await sha256Hex(files[local]), source: 'embedded', path: local }); embeddedCode = true; }
    else if (regComp.has(name) && regComp.get(name).has('index.js')) components.push({ tag: t, name, version: env.version || '0', sha256: await sha256Hex(regComp.get(name).get('index.js')), source: 'registry' });
  }
  const themes = [];
  for (const [name, m] of regTheme) {
    const lines = [];
    for (const k of [...m.keys()].sort(cmpCodePoint)) lines.push(`${k}\t${await sha256Hex(m.get(k))}\n`);
    themes.push({ name, version: env.version || '0', sha256: await sha256Hex(lines.join('')), source: 'registry' });
  }
  // 原稿の中の実行するスクリプト（部品の定義など）も、文書が持ち込むコード
  const deckSrc = new TextDecoder().decode(files[entry]);
  if ([...deckSrc.matchAll(/<script\b([^>]*)>/gi)].some((m) => !/type\s*=\s*["']?(?:application\/(?:ld\+)?json|text\/x-tex-macros)/i.test(m[1]))) embeddedCode = true;
  if (Object.keys(files).some((p) => /\.m?js$/i.test(p) && !/^components\/[^/]+\/index\.js$/.test(p))) embeddedCode = true;

  // 拡張の行 → extensions.<名前>[<段階の鍵>].<欄>（同じ欄が繰り返せば配列）
  const extensions = dict();
  for (const s of segs) for (const x of s.ext || []) {
    const ext = (extensions[x.name] ||= Object.assign(dict(), { v: 1 }));
    const step = (ext[`${s.slideKey}:${s.stepKey}`] ||= dict());
    if (!own(step, x.field)) step[x.field] = x.value;
    else if (Array.isArray(step[x.field])) step[x.field].push(x.value);
    else step[x.field] = [step[x.field], x.value];
  }

  // metadata と deck-meta
  const lang = (deckSrc.match(/<html[^>]*\slang\s*=\s*["']([^"']*)["']/i)?.[1] || 'ja').trim() || 'ja';
  const title = plain(deckSrc.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || plain(r.slides[0]?.title || '') || entry;
  const metadata = { title, lang };
  const em = isObj(econf.metadata) ? econf.metadata : {};
  for (const k of META_KEYS) if (own(em, k)) metadata[k] = em[k];
  if (own(em, 'title') && typeof em.title === 'string' && em.title) metadata.title = em.title;
  const generator = { name: GENERATOR, version: env.version || '0' };
  const index = {
    format: FID, version: { ...FORMAT_VERSION }, profile: embeddedCode ? 'extended' : 'core',
    requires: Object.keys(audio).length ? ['sources-v1', 'audio-v1'] : ['sources-v1'],
    contracts: { ...CONTRACTS }, generator, docId, entry, sourceSha256: srcSha, files: fileMap, blobs,
    ...(Object.keys(audio).length ? { audio } : {}),
    ...(components.length ? { components } : {}),
    ...(themes.length ? { themes } : {}),
    metadata,
    excluded: [...EXCLUDED_CATEGORIES],
    ...(Object.keys(extensions).length ? { extensions } : {}),
  };
  const ie = validateIndex(index);
  if (ie.length) fail('invalid-index', 'produced index is invalid: ' + ie.join('; '), ie);
  const deckMeta = {
    format: FID, version: { ...FORMAT_VERSION }, contracts: { ...CONTRACTS }, generator, docId, title: metadata.title, lang,
    portable: true, sourceSha256: srcSha, tracking: [],
    ...(metadata.completion ? { completion: metadata.completion } : {}),
    ...Object.fromEntries(['license', 'copyright', 'attribution'].filter((k) => own(metadata, k)).map((k) => [k, metadata[k]])),
  };
  const me = validateDeckMeta(deckMeta);
  if (me.length) fail('invalid-deck-meta', me.join('; '), me);

  // 組み立ての出力に差し込む：deck-meta、音声の参照、読める層・索引・塊
  const oldMeta = jsonScript('deck-meta', metaPh);
  if (html.split(oldMeta).length !== 2) fail('internal', 'deck-meta placeholder not found exactly once');
  html = html.replace(oldMeta, () => jsonScript('deck-meta', deckMeta));
  pend.forEach(({ file }, n) => { html = html.split(`"${SCHEME}P${tag}_${n}"`).join(`"${SCHEME}${fileMap[fileOfSrc.get(file)]}"`); });
  const indexText = htmlSafeJson(JSON.stringify(index, null, 1));
  const layer = readableLayer(r.slides, segs, lang) + '\n' +
    `<script type="${FORMAT.MIME}" id="${IX_ID}" data-sha256="${await sha256Hex(indexText)}">${indexText}</script>\n` +
    chunks.join('\n') + '\n';
  if (html.split(prefixPh).length !== 2) fail('internal', 'archive placeholder not found exactly once');
  html = html.replace(prefixPh, () => layer);
  if (html.includes('\r')) html = html.replace(/\r\n?/g, '\n');
  const size = utf8Length(html);
  if (size > WARN_BYTES) warnings.push(`${LOG}: the file is ${(size / MiB).toFixed(1)} MiB (over ${WARN_BYTES / MiB} MiB): consider splitting the lesson into chapters`);
  if (size > LIMITS.fileBytes) warnings.push(`${LOG}: the file is over ${LIMITS.fileBytes / MiB} MiB; editors may refuse it`);
  return { html, index, deckMeta, files: Object.assign(dict(), files, audioFiles), audio, writes, warnings, stats: { ...r.stats, bytes: size, files: Object.keys(files).length, audio: Object.keys(audio).length, blobs: Object.keys(blobs).length } };
}

// TTS の控え（audio/seg_<digest>.json の voice）→ recipe（§5.2）。声は公開の名前だけ（パスは書かない）
function recipeOf(sj, v) {
  const vc = sj && isObj(sj.voice) ? sj.voice : {};
  const voice = {};
  for (const role of ['expert', 'novice']) { const n = voiceName(vc[role]); if (n) voice[role] = n; }
  const processing = vc.norm || vc.trim || vc.pause_ms != null ? `trim=${vc.trim ?? '-'};norm=${vc.norm ?? '-'};pause_ms=${vc.pause_ms ?? '-'}` : 'unknown';
  return { engine: String(vc.engine || v.engine || 'unknown'), model: String(vc.model || 'unknown'), voice, seed: null, dictionary: typeof vc.yomi === 'string' ? vc.yomi : null, processing };
}

// §2.1 スクリプトなしで読める層：全段階の口述原稿の表示用の文字（スクリプトが動くと deck.js が隠す）
function readableLayer(slides, segs, lang) {
  const bySlide = new Map();
  for (const s of segs) { if (!bySlide.has(s.slideKey)) bySlide.set(s.slideKey, []); bySlide.get(s.slideKey).push(s); }
  const out = [`<div id="${RD_ID}" lang="${escAttr(lang)}">`];
  for (const sl of slides) {
    const steps = (bySlide.get(sl.key) || []).slice().sort((a, b) => stepOrder(a.stepKey) - stepOrder(b.stepKey));
    out.push(`<article data-slide-key="${escAttr(sl.key)}"><h2>${escText(plain(sl.title || sl.key))}</h2>`);
    for (const s of steps) {
      out.push(`<div data-step-key="${escAttr(`${s.slideKey}:${s.stepKey}`)}">` +
        s.turns.map((t) => `<p data-role="${t.role}">${escText(t.display)}</p>`).join('') + '</div>');
    }
    out.push('</article>');
  }
  out.push('</div>');
  return out.join('\n');
}

// ---------------------------------------------------------------- 読み取り（何も実行しない）
// parse5 で文字列として解析し（スクリプトは実行しない・資源も読まない。scriptingEnabled: false は DOMParser と同じ）、
// 形式の id（索引・塊・deck-meta・deck-audio）を持つ要素を集める。同じ id が 2 つあれば断る
const WATCH = new RegExp(`^(?:${reEsc(IX_ID)}|${reEsc(BP)}.*|${reEsc(FORMAT.SIGNATURES_ID)}|deck-meta|deck-audio)$`, 's');
export function scanDocument(text) {
  const doc = parseHtml(text, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  const byId = new Map(), dups = new Set();
  const visit = (n) => {
    if (n.attrs) {
      const ida = n.attrs.find((a) => a.name === 'id');
      if (ida && WATCH.test(ida.value)) {
        if (byId.has(ida.value)) dups.add(ida.value);
        else {
          const at = Object.create(null); for (const a of n.attrs) if (!(a.name in at)) at[a.name] = a.value;
          const html = n.namespaceURI === 'http://www.w3.org/1999/xhtml';
          let t = ''; for (const c of n.childNodes || []) if (c.nodeName === '#text') t += c.value;
          byId.set(ida.value, { tag: html ? n.tagName : `${n.namespaceURI}:${n.tagName}`, attrs: at, text: t, start: n.sourceCodeLocation?.startOffset, end: n.sourceCodeLocation?.endOffset });
        }
      }
    }
    for (const c of n.childNodes || []) visit(c);
    if (n.content) visit(n.content);
  };
  visit(doc);
  return { byId, dups: [...dups] };
}
const isScript = (el, type) => el && el.tag === 'script' && (el.attrs.type || '').trim().toLowerCase() === type;

// 再生器の deck-meta（なければ null）
export function readDeckMeta(scan) {
  const el = scan.byId.get('deck-meta');
  if (!isScript(el, 'application/json')) return null;
  try { return parseJsonStrict(el.text); } catch { return null; }
}

// input：文字列か UTF-8 のバイト列。opts.limits で上限を変えられる（試験用）
// 返すもの：{index, files: {path: Uint8Array}, audio: {stepKey: record}, deckMeta, docId, warnings, sourceMatches}
export async function readPortable(input, opts = {}) {
  const L = { ...LIMITS, ...(opts.limits || {}) };
  // 1. ファイルの大きさ（解析の前）
  let text;
  if (typeof input === 'string') { if (utf8Length(input) > L.fileBytes) fail('file-too-large', `file is larger than ${L.fileBytes} bytes`); text = input; }
  else {
    if (input.length > L.fileBytes) fail('file-too-large', `file is larger than ${L.fileBytes} bytes`);
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(input); } catch { fail('not-utf8', 'file is not valid UTF-8'); }
  }
  const scan = scanDocument(text);
  if (scan.dups.length) fail('duplicate-id', `duplicate element ids: ${scan.dups.slice(0, 5).join(', ')}`);
  const deckMeta = readDeckMeta(scan);
  const ixEl = scan.byId.get(IX_ID);
  if (!ixEl) fail('no-source', deckMeta && deckMeta.format === FID ? `play-only ${FORMAT.DISPLAY_NAME} file: it carries no source to edit` : `not a portable ${FORMAT.DISPLAY_NAME} file (no ${IX_ID})`);
  if (!isScript(ixEl, FORMAT.MIME)) fail('bad-index', `${IX_ID} is not a <script type="${FORMAT.MIME}">`);
  // 2. 索引の大きさ（JSON.parse の前）とハッシュ
  if (utf8Length(ixEl.text) > L.indexBytes) fail('index-too-large', `index is larger than ${L.indexBytes} bytes`);
  const want = (ixEl.attrs['data-sha256'] || '').trim();
  if (!RE.sha256.test(want)) fail('bad-index-hash', `${IX_ID} has no valid data-sha256`);
  if (await sha256Hex(ixEl.text) !== want) fail('bad-index-hash', `${IX_ID} data-sha256 does not match its content`);
  const ix = parseJsonStrict(ixEl.text, { maxMembers: L.members, maxDepth: L.jsonDepth });
  // 3. 版・必須の機能（形の検査より先に、分かりやすい理由で断る）
  if (!isObj(ix) || ix.format !== FID) fail('bad-index', `index format is not "${FID}"`);
  if (!isObj(ix.version) || ix.version.major !== FORMAT_VERSION.major) fail('unsupported-version', `${FORMAT.DISPLAY_NAME} ${isObj(ix.version) ? ix.version.major : '?'}.x is not supported by this reader (it reads 1.x); play the file or extract its source with a newer editor`);
  if (Array.isArray(ix.requires)) {
    const unknown = ix.requires.filter((f) => !FEATURES.includes(f));
    if (unknown.length) fail('unknown-feature', `the file requires features this reader does not implement: ${unknown.join(', ')}`);
  }
  if (isObj(ix.contracts) && Number.isInteger(ix.contracts.source) && ix.contracts.source > CONTRACTS.source) fail('unsupported-contract', `source contract ${ix.contracts.source} is newer than this reader (${CONTRACTS.source})`);
  const errs = validateIndex(ix);
  if (errs.length) fail('invalid-index', 'index is invalid: ' + errs.slice(0, 8).join('; '), errs);
  // 4. パス（フォルダを作る前に全部）
  const paths = Object.keys(ix.files);
  if (paths.length > L.files) fail('too-many-files', `more than ${L.files} files`);
  const pe = checkArchivePaths(paths, L);
  if (pe.length) fail('bad-path', 'archive paths are not allowed: ' + pe.slice(0, 8).join('; '), pe);
  if (!own(ix.files, ix.entry)) fail('invalid-index', `entry "${ix.entry}" is not in files`);
  for (const p of paths) if (!own(ix.blobs, ix.files[p])) fail('invalid-index', `files["${p}"] refers to a missing blob ${ix.files[p]}`);
  if (ix.audio) for (const [k, a] of Object.entries(ix.audio)) {
    if (!own(ix.files, a.file)) fail('invalid-index', `audio["${k}"].file "${a.file}" is not in files`);
    for (const alt of a.alternatives || []) if (!own(ix.files, alt.file)) fail('invalid-index', `audio["${k}"] alternative "${alt.file}" is not in files`);
  }
  // 5. 塊：使う塊だけ、宣言の大きさ → 1 つずつの長さ（復号の前）→ 復号した累計
  const used = [...new Set(paths.map((p) => ix.files[p]))];
  let declared = 0;
  for (const id of used) {
    const b = ix.blobs[id];
    if (b.bytes > L.fileMax) fail('file-too-large', `blob ${id} is larger than ${L.fileMax} bytes`);
    declared += b.bytes;
    b.chunks.forEach((c, j) => { if (c !== `${BP}${id}-${j}`) fail('bad-chunk-id', `blob ${id}: chunk ${j} is "${c}", expected "${BP}${id}-${j}"`); });
    if (b.chunks.length - 1 > L.chunkMax) fail('bad-chunk-id', `blob ${id}: too many chunks`);
    if (paths.some((p) => ix.files[p] === id && p.startsWith('audio/')) && !AUDIO_MIME.has(b.mime)) fail('bad-mime', `blob ${id} is used as audio but its type is ${b.mime}`);
  }
  if (declared > L.archiveBytes) fail('archive-too-large', `archive is larger than ${L.archiveBytes} bytes`);
  const blobBytes = new Map();
  let total = 0;
  for (const id of used) {
    const b = ix.blobs[id], parts = [];
    let len = 0;
    for (const c of b.chunks) {
      const el = scan.byId.get(c);
      if (!el) fail('missing-chunk', `chunk ${c} is missing`);
      if (!isScript(el, 'application/octet-stream')) fail('bad-chunk', `chunk ${c} is not a <script type="application/octet-stream">`);
      if (el.text.length > L.chunkChars) fail('chunk-too-large', `chunk ${c} is longer than ${L.chunkChars} characters`);
      const d = fromBase64(el.text);
      if (!d) fail('bad-chunk', `chunk ${c} is not base64 (RFC 4648 §4, no line breaks)`);
      if (d.length > L.chunkBytes) fail('chunk-too-large', `chunk ${c} decodes to more than ${L.chunkBytes} bytes`);
      total += d.length; len += d.length;
      if (total > L.archiveBytes) fail('archive-too-large', `decoded archive is larger than ${L.archiveBytes} bytes`);
      if (len > b.bytes) fail('bad-blob', `blob ${id} is longer than declared`);
      parts.push(d);
    }
    const out = new Uint8Array(len);
    let o = 0; for (const d of parts) { out.set(d, o); o += d.length; }
    if (len !== b.bytes) fail('bad-blob', `blob ${id} has ${len} bytes, expected ${b.bytes}`);
    if (await sha256Hex(out) !== b.sha256) fail('bad-blob', `blob ${id} is corrupt (sha256 mismatch)`);
    blobBytes.set(id, out);
  }
  const files = dict();
  for (const p of paths) files[p] = blobBytes.get(ix.files[p]);
  const audio = dict();
  if (ix.audio) for (const k of Object.keys(ix.audio)) audio[k] = ix.audio[k];
  // 6. ずれの確認（断らない。知らせて、段 A の編集を止めるのは編集器の役目）
  const warnings = [];
  const shas = dict();
  for (const p of paths) shas[p] = ix.blobs[ix.files[p]].sha256;
  const computed = await sourceSha256(shas);
  if (computed !== ix.sourceSha256) warnings.push('index sourceSha256 does not match its files (the producer wrote a wrong hash)');
  const sourceMatches = !!deckMeta && deckMeta.sourceSha256 === ix.sourceSha256 && computed === ix.sourceSha256;
  if (!deckMeta) warnings.push('no deck-meta in the runtime layer');
  else {
    for (const e of validateDeckMeta(deckMeta)) warnings.push(e);
    if (deckMeta.sourceSha256 !== ix.sourceSha256) warnings.push('the compiled lesson and its source disagree (deck-meta.sourceSha256 differs from the index): tier A edits are not allowed');
    if (deckMeta.docId !== ix.docId) warnings.push('deck-meta.docId differs from the index docId');
  }
  if (isObj(ix.contracts) && ix.contracts.runtime !== CONTRACTS.runtime) warnings.push(`runtime contract ${ix.contracts.runtime} differs from this editor's (${CONTRACTS.runtime}): only tier A edits without an upgrade`);
  const da = scan.byId.get('deck-audio');
  if (isScript(da, 'application/json')) {
    try {
      const dj = parseJsonStrict(da.text);
      for (const [k, a] of Object.entries(dj)) {
        const m = isObj(a) && typeof a.src === 'string' && a.src.match(SRC_RE);
        if (m && !scan.byId.has(`${BP}${m[1]}-0`)) warnings.push(`deck-audio["${k}"] refers to a missing blob ${m[1]}`);
      }
    } catch (e) { warnings.push('deck-audio: ' + e.message); }
  }
  return { index: ix, files, audio, deckMeta, docId: ix.docId, warnings, sourceMatches };
}

// ---------------------------------------------------------------- 再生専用の派生（§3.7）
// 索引と、deck-audio が <scheme><blob> で参照しない塊を除く。deck-meta は portable: false、sourceSha256 なし、docId は残す
export function playOnly(text) {
  const scan = scanDocument(text);
  if (scan.dups.length) fail('duplicate-id', `duplicate element ids: ${scan.dups.slice(0, 5).join(', ')}`);
  const meta = readDeckMeta(scan), metaEl = scan.byId.get('deck-meta');
  if (!meta || meta.format !== FID) fail('not-portable', `not a ${FORMAT.DISPLAY_NAME} file (no deck-meta with format "${FID}")`);
  const keep = new Set();
  const da = scan.byId.get('deck-audio');
  if (isScript(da, 'application/json')) {
    for (const a of Object.values(parseJsonStrict(da.text))) {
      const m = isObj(a) && typeof a.src === 'string' && a.src.match(SRC_RE);
      if (m) keep.add(m[1]);
    }
  }
  const cut = [];
  for (const [id, el] of scan.byId) {
    if (el.start == null) continue;
    const m = id.match(RE.chunkId);
    if (id === IX_ID || (m && !keep.has(m[1]))) cut.push([el.start, el.end]);
  }
  const nm = { ...meta, portable: false };
  delete nm.sourceSha256;
  cut.push([metaEl.start, metaEl.end, jsonScript('deck-meta', nm)]);
  cut.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, rep] of cut) {
    const end = rep === undefined && out[e] === '\n' ? e + 1 : e;
    out = out.slice(0, s) + (rep ?? '') + out.slice(end);
  }
  return out;
}

// ---------------------------------------------------------------- 展開したフォルダの audio/manifest.json（tts/synth.py と build が読む形）
// 音声の記録（index.audio）から作る。kind・inputHash・recipe・sync も残し、もう一度書き出すと同じ記録になるように
export function manifestFromAudio(audio) {
  const segments = {};
  for (const k of Object.keys(audio)) {   // 索引と同じ順（口述原稿の順）
    const a = audio[k];
    const e = { file: a.file.slice('audio/'.length), dur: a.dur, cues: a.cues };
    if (a.recipeDigest) e.digest = a.recipeDigest;
    if (a.recipe && a.recipe.engine) e.engine = a.recipe.engine;
    e.kind = a.kind; e.inputHash = a.inputHash;
    if (a.sync && a.sync !== 'auto') e.sync = a.sync;
    if (a.recipe) e.recipe = a.recipe;
    segments[k] = e;
  }
  return JSON.stringify({ segments }, null, 1) + '\n';
}

// 試験用・仕様の試験用の文書を作る道具：索引を差し替え、data-sha256 を付け直す（indexText は JSON の文字列そのもの）
export async function replaceIndexText(html, indexText) {
  const scan = scanDocument(html);
  const el = scan.byId.get(IX_ID);
  if (!el) fail('no-source', `no ${IX_ID}`);
  const t = htmlSafeJson(indexText);
  return html.slice(0, el.start) + `<script type="${FORMAT.MIME}" id="${IX_ID}" data-sha256="${await sha256Hex(t)}">${t}</script>` + html.slice(el.end);
}
