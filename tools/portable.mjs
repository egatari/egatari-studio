// 持ち運べる 1 ファイル（format spec。拡張子は kit/core/format.mjs の FORMAT.FILE_EXT）とフォルダの相互変換（npm run portable -- …）
//
//   npm run portable -- unpack <file> <dir> [--force]          原稿と音声をフォルダに出す（スクリプトは実行しない）
//   npm run portable -- pack <dir> [-o out] [--play-only]      フォルダを 1 ファイルにする（= node kit/build.mjs <dir>/deck.html --portable）
//
// unpack は <dir> の外に書かない。<dir> が空でなければ断る（--force で上書き。シンボリックリンクを通る書き込みは断る）。
// 音声の記録（index.audio）から audio/manifest.json を作るので、展開したフォルダはそのまま build・pack できる
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPortable, manifestFromAudio, FormatError } from '../kit/core/portable.mjs';
import { buildPortable, defaultPortableOut } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 展開する。返すもの：{written: [rel…], warnings}
export async function unpack(file, dir, { force = false } = {}) {
  const r = await readPortable(new Uint8Array(fs.readFileSync(file)));
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
  const written = [];
  for (const rel of Object.keys(files).sort()) {
    const target = path.resolve(out, ...rel.split('/'));
    if (!target.startsWith(out + path.sep)) throw new FormatError('bad-path', `refusing to write outside ${dir}: ${rel}`);
    // 途中のフォルダ：既にあるならシンボリックリンクでないこと
    let d = out;
    for (const seg of rel.split('/').slice(0, -1)) {
      d = path.join(d, seg);
      if (fs.existsSync(d)) { if (fs.lstatSync(d).isSymbolicLink() || !fs.lstatSync(d).isDirectory()) throw new FormatError('bad-path', `refusing to write through ${path.relative(out, d)}`); }
      else fs.mkdirSync(d);
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new FormatError('bad-path', `refusing to overwrite the symbolic link ${rel}`);
    if (!fs.realpathSync(path.dirname(target)).startsWith(real)) throw new FormatError('bad-path', `refusing to write outside ${dir}: ${rel}`);
    fs.writeFileSync(target, files[rel]);
    written.push(rel);
  }
  const warnings = [...r.warnings];
  // 部品庫・テーマ庫の部品が、このリポジトリのものと同じか（違えば段 B・C の編集はできない）
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  for (const c of r.index.components || []) {
    if (c.source !== 'registry') continue;
    const f = path.join(ROOT, 'components', c.name, 'index.js');
    if (!fs.existsSync(f)) warnings.push(`component ${c.tag} (${c.name} ${c.version}) is not in this registry`);
    else if (sha(f) !== c.sha256) warnings.push(`component ${c.tag}: this registry has a different version (hash differs from ${c.version})`);
  }
  return { written, warnings, index: r.index };
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
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, r.html);
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
