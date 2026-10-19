// 持ち運べる 1 ファイル（format spec。拡張子は kit/core/format.mjs の FORMAT.FILE_EXT）とフォルダの相互変換（npm run portable -- …）
//
//   npm run portable -- unpack <file> <dir> [--force]          原稿と音声をフォルダに出す（スクリプトは実行しない）
//   npm run portable -- pack <dir> [-o out] [--play-only]      フォルダを 1 ファイルにする（= node kit/build.mjs <dir>/deck.html --portable）
//
// unpack は <dir> の外に書かない。<dir> が空でなければ断る（--force で上書き。シンボリックリンクを通る書き込みは断る）。
// 音声の記録（index.audio）から audio/manifest.json を作り、設定のファイル（FORMAT.CONFIG_FILE）に docId・権利の表示・添付の一覧（index.attachments）を
// 書くので、展開したフォルダはそのまま build・pack できる（pack は添付の一覧を設定のファイルから読む）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPortable, manifestFromAudio, FormatError, RE, LIMITS, folderConfig, parseJsonStrict } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';
import { buildPortable, defaultPortableOut, writeOutput } from '../kit/build.mjs';
import { safeWriteFile, checkWritable, readContained } from '../kit/safe-fs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 展開する。返すもの：{written: [rel…], warnings}
export async function unpack(file, dir, { force = false } = {}) {
  // 読む前に開いた fd の大きさを形式の上限（LIMITS.fileBytes）と比べ、超えるなら読まずに断る。通常のファイルだけ（FIFO で止まらない）、
  // 写さずに（Buffer の上の Uint8Array のまま）読み取りに渡す（kit/bounded-read.mjs）
  let buf;
  try { buf = readRegular(file, { max: LIMITS.fileBytes }); } catch (e) {
    if (e && e.code === 'read-over') throw new FormatError('file-too-large', `file is larger than ${LIMITS.fileBytes} bytes (${e.n})`);
    if (e && e.code === 'build-not-a-file') throw new FormatError('not-a-file', `${file} is not a regular file`);
    throw e;
  }
  const r = await readPortable(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
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

// 部品庫・テーマ庫の部品が、このリポジトリのものと同じか（違えば段 B・C の編集はできない）。返すもの：知らせの配列。
// 名前は文書が書いたもの（信頼しない）：1 つの識別子（RE.registryName。readPortable の検査器も断るが、ここでも確かめる）だけを
// <root>/components/<名前>/index.js に結び、実体が components/ の中にある普通のファイルだけを読む（readContained。外を指すリンクは読まない）
export function registryWarnings(index, root = ROOT) {
  const warnings = [];
  const regDir = path.join(root, 'components');
  for (const c of index.components || []) {
    if (c.source !== 'registry') continue;
    if (typeof c.name !== 'string' || !RE.registryName.test(c.name)) { warnings.push(`component ${c.tag}: "${String(c.name).slice(0, 80)}" is not a registry name; not checked`); continue; }
    let bytes = null;
    try { bytes = readContained(regDir, path.join(regDir, c.name, 'index.js'), null, { max: READ_LIMITS.component }); } catch { bytes = null; }
    if (bytes === null) warnings.push(`component ${c.tag} (${c.name} ${c.version}) is not in this registry`);
    else if (crypto.createHash('sha256').update(bytes).digest('hex') !== c.sha256) warnings.push(`component ${c.tag}: this registry has a different version (hash differs from ${c.version})`);
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
    } else if (cmd === 'pack' && pos.length === 1) {
      const src = entryOf(pos[0]);
      const playOnly = flags.has('--play-only');
      const out = oi >= 0 ? rest[oi + 1] : defaultPortableOut(src, playOnly);
      const r = await buildPortable(src, { out, playOnly });
      writeOutput(src, out, r.html);
      console.log(`packed ${r.stats.files} source files, ${r.stats.audio} audio (docId ${r.index.docId}, sourceSha256 ${r.index.sourceSha256.slice(0, 12)}…) -> ${out}`);
      for (const w of r.warnings) console.warn('  ⚠ ' + w);
    } else {
      console.error('usage: npm run portable -- unpack <file> <dir> [--force]\n       npm run portable -- pack <dir> [-o out] [--play-only]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`portable ${cmd}: ${e.code ? `[${e.code}] ` : ''}${e.message}`);
    process.exit(1);
  }
}
