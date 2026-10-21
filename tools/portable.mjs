// 持ち運べる 1 ファイル（format spec。拡張子は kit/core/format.mjs の FORMAT.FILE_EXT）とフォルダの相互変換（npm run portable -- …）
//
//   npm run portable -- unpack <file> <dir> [--force]          原稿と音声をフォルダに出す（スクリプトは実行しない）
//   npm run portable -- pack <dir> [-o out] [--play-only]      フォルダを 1 ファイルにする（= node kit/build.mjs <dir>/deck.html --portable）
//   npm run portable -- compare <file> <dir>                   作業フォルダから書き出した写しとそのフォルダの、書き出しの後に直した側（写し・フォルダ・両方）を言う
//
// unpack は <dir> の外に書かない。<dir> が空でなければ断る（--force で上書き。シンボリックリンクを通る書き込みは断る）。
// 音声の記録（index.audio）から audio/manifest.json を作り、設定のファイル（FORMAT.CONFIG_FILE）に docId・権利の表示・添付の一覧（index.attachments）を
// 書くので、展開したフォルダはそのまま build・pack できる（pack は添付の一覧を設定のファイルから読む）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPortable, manifestFromAudio, FormatError, RE, LIMITS, folderConfig, parseJsonStrict, exportPortable, exportedState } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { LOCK_FILE, VENDOR_COMPONENTS, VERSION_RE, parseLock, versionForSha } from '../kit/core/components-lock.mjs';
import { normalizeEol } from '../kit/core/identity-hash.mjs';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';
import { buildPortable, defaultPortableOut, writeOutput, nodeEnv } from '../kit/build.mjs';
import { safeWriteFile, checkWritable, readContained } from '../kit/safe-fs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 読む前に開いた fd の大きさを形式の上限（LIMITS.fileBytes）と比べ、超えるなら読まずに断る。通常のファイルだけ（FIFO で止まらない）、
// 写さずに（Buffer の上の Uint8Array のまま）読み取りに渡す（kit/bounded-read.mjs）
async function readSingleFile(file) {
  let buf;
  try { buf = readRegular(file, { max: LIMITS.fileBytes }); } catch (e) {
    if (e && e.code === 'read-over') throw new FormatError('file-too-large', `file is larger than ${LIMITS.fileBytes} bytes (${e.n})`);
    if (e && e.code === 'build-not-a-file') throw new FormatError('not-a-file', `${file} is not a regular file`);
    throw e;
  }
  return readPortable(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
}

// 展開する。返すもの：{written: [rel…], warnings}。展開したフォルダが原本になる：設定のファイルに書き出しの印（index.exportedFrom、§3.1）は
// 入れない（folderConfig は写さない）ので、次の書き出しが新しい印を書く
export async function unpack(file, dir, { force = false } = {}) {
  const r = await readSingleFile(file);
  const out = path.resolve(dir);
  if (fs.existsSync(out)) {
    if (!fs.lstatSync(out).isDirectory()) throw new FormatError('bad-target', `${dir} is not a directory`);
    if (fs.readdirSync(out).length && !force) throw new FormatError('not-empty', `${dir} is not empty (use --force to overwrite)`);
  }
  fs.mkdirSync(out, { recursive: true });
  const real = fs.realpathSync(out);
  const files = { ...r.files };
  if (Object.keys(r.audio).length) {
    if (files['audio/manifest.json']) throw new FormatError('bad-path', 'audio/manifest.json is reserved');
    files['audio/manifest.json'] = new TextEncoder().encode(manifestFromAudio(r.audio));
  }
  // 設定のファイル（§3.3・§3.8）：docId・索引の権利の表示・添付の一覧（index.attachments）を残す（展開したフォルダを組み直しても同じ文書と一覧。
  // 編集アプリの作業場所と同じ。kit/core/portable.mjs の folderConfig）
  const CFG = FORMAT.CONFIG_FILE;
  const cfgText = folderConfig(r.index, files[CFG] ? parseJsonStrict(new TextDecoder().decode(files[CFG])) : null);
  if (cfgText !== null) files[CFG] = new TextEncoder().encode(cfgText);
  // 部品庫の部品の版を、設定のファイルの components に固定する（format spec §3.3：展開したフォルダを組み直しても版が黙って変わらないように。
  // 版は index.js の hash が合う手元の版、なければ記録の版。設定のファイルに components がもうあれば変えない。kit/core/components-lock.mjs）
  const pinned = unpackPins(r.index);
  if (Object.keys(pinned).length) {
    const conf = files[CFG] ? parseJsonStrict(new TextDecoder().decode(files[CFG])) : { docId: r.index.docId };
    if (!Object.prototype.hasOwnProperty.call(conf, 'components')) files[CFG] = new TextEncoder().encode(JSON.stringify({ ...conf, components: pinned }, null, 2) + '\n');
  }
  const written = [];
  // 書く先は <dir> の中だけで、途中のフォルダも書く先もシンボリックリンクでないこと（壊れたリンクも。kit/safe-fs.mjs）。
  // どれか 1 つでも断るなら、何も書かないうちに断る
  const targets = Object.keys(files).sort().map((rel) => {
    const target = path.resolve(real, ...rel.split('/'));
    if (!target.startsWith(real + path.sep)) throw new FormatError('bad-path', `refusing to write outside ${dir}: ${rel}`);
    return [rel, target];
  });
  const safe = (fn) => { try { return fn(); } catch (e) { if (e.code === 'unsafe-path') throw new FormatError('bad-path', e.message); throw e; } };
  for (const [, target] of targets) safe(() => checkWritable(real, target));
  for (const [rel, target] of targets) {
    safe(() => safeWriteFile(real, target, files[rel]));
    written.push(rel);
  }
  const warnings = [...r.warnings];
  warnings.push(...registryWarnings(r.index));
  return { written, warnings, index: r.index };
}

// 書き出した写し（1 ファイル）と、同じ docId の作業フォルダを、書き出しの印（index.exportedFrom、§3.1）で比べる。何も書かない。
// フォルダの今の sourceSha256 は、書き出しと同じ数え方で求める（組み立てる。設定のファイルは書かない）。
// 返すもの：{state: 'same' | 'copy' | 'folder' | 'both', docId, exportedSha256, copySha256, folderSha256}
export async function compare(file, dir) {
  const r = await readSingleFile(file);
  const st = exportedState(r.index);
  if (!st) throw new FormatError('not-exported', `${file} has no exportedFrom: it was not exported from a working folder`);
  const src = entryOf(dir);
  const CFG = FORMAT.CONFIG_FILE, cp = path.join(path.dirname(src), CFG);
  let conf = null;
  try { conf = parseJsonStrict(readRegular(cp, { max: READ_LIMITS.json }).toString('utf8')); } catch { conf = null; }
  if (!conf || conf.docId !== r.index.docId) throw new FormatError('other-lesson', `${dir}: ${CFG} does not have the docId ${r.index.docId}: not the folder this copy was exported from`);
  const f = await exportPortable(nodeEnv, src, {});
  const s = exportedState(r.index, f.index.sourceSha256);
  const state = s.both ? 'both' : s.copyEdited ? 'copy' : s.folderEdited ? 'folder' : 'same';
  return { state, docId: r.index.docId, exportedSha256: s.exportedSha256, copySha256: r.index.sourceSha256, folderSha256: f.index.sourceSha256 };
}
const COMPARE_TEXT = {
  same: 'neither was edited since the export',
  copy: 'the copy was edited since the export; the folder was not (unpack the copy to bring the edits back)',
  folder: 'the folder was edited since the export; the copy was not (export again to replace the copy)',
  both: 'both the copy and the folder were edited since the export: choose which to keep (they are not merged)',
};

// 部品庫の固定（components.lock.json）。読めなければ null
function lockAt(root) {
  try { return parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8')); } catch { return null; }
}
// 展開で設定のファイルに書く版：{名前: 版}。文書の部品庫の部品ごとに、記録の hash が合う手元の版（components.lock.json）、なければ記録の版
export function unpackPins(index, root = ROOT) {
  const lock = lockAt(root);
  const out = {};
  for (const c of Array.isArray(index.components) ? index.components : []) {
    if (!c || c.source !== 'registry' || typeof c.name !== 'string' || !RE.registryName.test(c.name)) continue;
    const v = lock ? versionForSha(lock, c.name, c.sha256, c.version) : null;
    if (v) out[c.name] = v; else if (typeof c.version === 'string' && VERSION_RE.test(c.version)) out[c.name] = c.version;
  }
  return out;
}

// 部品庫・テーマ庫の部品が、このリポジトリの写しにあるか（なければ段 B・C の編集はできない）。返すもの：知らせの配列。
// 部品は index.js の sha256 で版を探し（components.lock.json。改行をそろえる前の CRLF の hash も）、その版の写し vendor/components/<名前>/<版>/index.js の
// 同一性の hash（改行をそろえる。kit/core/identity-hash.mjs）が固定のものかでも確かめる。
// 名前は文書が書いたもの（信頼しない）：1 つの識別子（RE.registryName。readPortable の検査器も断るが、ここでも確かめる）だけを
// 写しのフォルダに結び、実体が vendor/components/ の中にある普通のファイルだけを読む（readContained。外を指すリンクは読まない）
export function registryWarnings(index, root = ROOT) {
  const warnings = [];
  const regDir = path.join(root, ...VENDOR_COMPONENTS);
  const lock = lockAt(root);
  for (const c of index.components || []) {
    if (c.source !== 'registry') continue;
    if (typeof c.name !== 'string' || !RE.registryName.test(c.name)) { warnings.push(`component ${c.tag}: "${String(c.name).slice(0, 80)}" is not a registry name; not checked`); continue; }
    const known = !!lock && Object.prototype.hasOwnProperty.call(lock.components, c.name);
    const v = known ? versionForSha(lock, c.name, c.sha256, c.version) : null;
    let bytes = null;
    if (v) { try { bytes = readContained(regDir, path.join(regDir, c.name, v, 'index.js'), null, { max: READ_LIMITS.component }); } catch { bytes = null; } }
    if (!known) warnings.push(`component ${c.tag} (${c.name} ${c.version}) is not in this registry`);
    else if (!v) warnings.push(`component ${c.tag}: this registry has a different version (hash differs from ${c.version})`);
    else if (bytes === null) warnings.push(`component ${c.tag} (${c.name} ${v}) is in ${LOCK_FILE} but not in vendor/components`);
    else if (crypto.createHash('sha256').update(normalizeEol(bytes)).digest('hex') !== lock.components[c.name].sha256[v]) warnings.push(`component ${c.tag}: vendor/components/${c.name}/${v}/index.js does not match ${LOCK_FILE}`);
  }
  for (const t of index.themes || []) {
    if (t.source === 'registry' && !(typeof t.name === 'string' && RE.registryName.test(t.name))) warnings.push(`theme "${String(t.name).slice(0, 80)}" is not a registry name`);
  }
  return warnings;
}

// フォルダの原稿（deck.html。なければ最上位の .html が 1 つだけのとき）
export function entryOf(dir) {
  if (fs.existsSync(path.join(dir, 'deck.html'))) return path.join(dir, 'deck.html');
  const html = fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f));
  if (html.length === 1) return path.join(dir, html[0]);
  throw new Error(`no deck.html in ${dir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const oi = rest.indexOf('-o');
  const pos = rest.filter((a, i) => !a.startsWith('-') && !(oi >= 0 && i === oi + 1));
  try {
    if (cmd === 'unpack' && pos.length === 2) {
      const r = await unpack(pos[0], pos[1], { force: flags.has('--force') });
      console.log(`unpacked ${r.written.length} files (docId ${r.index.docId}) -> ${pos[1]}`);
      for (const w of r.warnings) console.warn('  ⚠ ' + w);
    } else if (cmd === 'compare' && pos.length === 2) {
      const r = await compare(pos[0], pos[1]);
      console.log(`${r.state}: ${COMPARE_TEXT[r.state]} (docId ${r.docId}; exported ${r.exportedSha256.slice(0, 12)}…, copy ${r.copySha256.slice(0, 12)}…, folder ${r.folderSha256.slice(0, 12)}…)`);
    } else if (cmd === 'pack' && pos.length === 1) {
      const src = entryOf(pos[0]);
      const playOnly = flags.has('--play-only');
      const out = oi >= 0 ? rest[oi + 1] : defaultPortableOut(src, playOnly);
      const r = await buildPortable(src, { out, playOnly });
      writeOutput(src, out, r.html);
      console.log(`packed ${r.stats.files} source files, ${r.stats.audio} audio (docId ${r.index.docId}, sourceSha256 ${r.index.sourceSha256.slice(0, 12)}…) -> ${out}`);
      for (const w of r.warnings) console.warn('  ⚠ ' + w);
    } else {
      console.error('usage: npm run portable -- unpack <file> <dir> [--force]\n       npm run portable -- pack <dir> [-o out] [--play-only]\n       npm run portable -- compare <file> <dir>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`portable ${cmd}: ${e.code ? `[${e.code}] ` : ''}${e.message}`);
    process.exit(1);
  }
}
