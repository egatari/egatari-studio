// 原稿（deck.html）を、外部の読み込みなしで表示できる 1 つの HTML にする
//
//   node kit/build.mjs <deck.html | デッキのフォルダ> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio] [--portable] [--play-only]
//
//   --portable   持ち運べる 1 ファイル（format spec。out/<名前><FORMAT.FILE_EXT>）：再生できる HTML に原稿と音声を入れたもの（kit/core/portable.mjs）。
//                音声は --embed-audio と同じく AAC に圧縮する（ffmpeg がなければ WAV）。docId は原稿のフォルダの FORMAT.CONFIG_FILE に残す
//   --play-only  その再生専用の派生（out/<名前><FORMAT.PLAY_EXT>）：原稿を入れず、音声だけを持つ
//   形式の名前・拡張子は kit/core/format.mjs
//
// 原稿の中で使える記法
//   \( … \)，\[ … \]        数式。KaTeX で事前に組む（<script> <style> <svg> <textarea> の中は対象外）
//   /*INCLUDE:ファイル*/     ファイルの中身をそのまま入れる（原稿のフォルダ → kit の順に探す）
//   {{FIG:名前}}            figs/名前.svg（なければ原稿のフォルダの 名前.svg）を埋め込む。id に図の名前を前置する
//   {{JSON:ファイル}}        JSON をそのまま入れる（data/ → 原稿のフォルダの順に探す）
//   <m-名前 …>              部品。components/名前/index.js（作業フォルダ）→ 部品庫の写し vendor/components/名前/<版>/index.js（版は components.lock.json）の順に探して自動で読み込む
// 原稿のフォルダに置くと読まれるもの
//   narration.md（口述原稿）、timeline.json（秒数の調整）、audio/manifest.json（TTS の出力）、macros.tex（数式のマクロ）
//
// 組む本体は kit/core/build-core.mjs（ブラウザの編集アプリと共有）。ここは Node の読み書き・字の絞り込み（fonttools）・音声の圧縮（ffmpeg）・CLI
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as core from './core/build-core.mjs';
import { exportPortable, playOnly } from './core/portable.mjs';
import { FORMAT } from './core/format.mjs';
import { safeWriteFile } from './safe-fs.mjs';
import { readRegular, readRegularText, regularStat } from './bounded-read.mjs';
import { userThemeDirs } from './theme-dirs.mjs';

export { annotate, analyzeSlideIds, readMacros, isJapanese, decodeEntities, glyphText } from './core/build-core.mjs';

const require = createRequire(import.meta.url);
const katex = require('katex');
const KIT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(KIT);
// 版（package.json の version）。デッキに DECK.VERSION として埋め込む（フィードバックの欄に入れる）
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '';
const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

// ---------------------------------------------------------------- 字の絞り込み（fonts/ に TTF があるとき）
// 字の絞り込みに使う fonttools / brotli の版（キャッシュの鍵にも入れる）
const FONTTOOLS = '4.67.0', BROTLI = '1.2.0';
const _hash = new Map();
function fileHash(f) { if (!_hash.has(f)) _hash.set(f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16)); return _hash.get(f); }
// fonts/ に TTF があれば、使っている字だけに絞った woff2 を作る（uv で fonttools を動かす。結果はキャッシュする）
// font：'gothic'（既定。BIZ UDPゴシック）か 'mincho'（BIZ UDP明朝。デッキが明朝を使うときだけ build-core が頼む）
const SUBSET_FONTS = {
  gothic: { family: 'BIZ UDPGothic', files: [[400, 'BIZUDPGothic-Regular.ttf'], [700, 'BIZUDPGothic-Bold.ttf']] },
  mincho: { family: 'BIZ UDPMincho', files: [[400, 'BIZUDPMincho-Regular.ttf'], [700, 'BIZUDPMincho-Bold.ttf']] },
};
function subsetCss(text, font = 'gothic') {
  const F = SUBSET_FONTS[font] || SUBSET_FONTS.gothic;
  const chars = [...new Set(text)].filter((c) => c.codePointAt(0) >= 0x20).sort().join('');
  const out = [];
  for (const [w, f] of F.files) {
    const ttf = path.join(ROOT, 'fonts', f);
    if (!fs.existsSync(ttf)) return null;
    const cache = path.join(os.tmpdir(), 'motion-slides-fonts');
    fs.mkdirSync(cache, { recursive: true });
    const woff = path.join(cache, `${w}-${short(chars + w + fileHash(ttf) + FONTTOOLS)}.woff2`);
    if (!fs.existsSync(woff)) {
      const txt = woff + '.txt'; fs.writeFileSync(txt, chars);
      const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', `fonttools==${FONTTOOLS}`, '--with', `brotli==${BROTLI}`, 'pyftsubset', ttf,
        `--text-file=${txt}`, '--flavor=woff2', `--output-file=${woff}`, '--layout-features=*', '--no-hinting'], { encoding: 'utf8' });
      if (r.error && r.error.code === 'ENOENT') {
        // uv が入っていないだけ：失敗ではないので stderr に出さない（PowerShell は stderr を失敗のように見せる）
        if (!subsetCss.noUv) console.log('  uv がないので和文の字の絞り込みは飛ばす（任意。uv を入れると HTML が小さくなる）');
        subsetCss.noUv = true; return null;
      }
      if (r.status !== 0) { console.warn('  ⚠ フォントの絞り込みに失敗（分割ファイルを使う）: ' + (r.stderr || r.error)); return null; }
    }
    // 絞り込んだ woff2 はキャッシュ（一時フォルダ）から上限つきで読む（通常のファイルだけ、32 MiB まで。kit/bounded-read.mjs）
    // unicode-range：絞り込んだ字（format spec §7.2。段 A の編集が、どの字を持つかを範囲から知れるように）
    out.push(`@font-face{font-family:"${F.family}";font-style:normal;font-display:block;font-weight:${w};src:url(data:font/woff2;base64,${readRegular(woff).toString('base64')}) format("woff2");unicode-range:${core.unicodeRange(core.rangesOf(chars))}}`);
  }
  return { css: out.join('\n') + '\n', n: out.length, bytes: 0 };
}

// ---------------------------------------------------------------- 音声の圧縮
// 埋め込む音声は AAC（64 kbps・モノラル）にする。WAV のままだと 5 分で 30 MB を超える。結果はキャッシュする
// max：読んでよいバイト数（chargedEnv が読む前に数えた大きさ）。元のファイルは上限つきで 1 回だけ読み（通常のファイルだけ。FIFO で止まらない）、
// そのバイトの hash を鍵にし、ffmpeg には元のパスを開き直させず、読んだバイトを自分だけが読める一時フォルダの写しから渡す（確かめた後に
// 差し替えられたファイル・大きくなったファイルを ffmpeg が読まない）。返すもの：{path, read}（read は読んだバイト数）
function compressAudio(file, max) {
  if (!/\.wav$/i.test(file)) return { path: file, read: 0 };
  const bytes = readRegular(file, max === undefined ? undefined : { max });
  const out = path.join(os.tmpdir(), 'motion-slides-audio', crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.m4a');
  if (fs.existsSync(out)) return { path: out, read: bytes.length };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-slides-wav-'));   // 0700
  try {
    const src = path.join(priv, 'in.wav'), tmpOut = path.join(priv, 'out.m4a');
    fs.writeFileSync(src, bytes, { mode: 0o600, flag: 'wx' });
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', tmpOut]);
    if (r.status === 0) { fs.renameSync(tmpOut, out); return { path: out, read: bytes.length }; }
  } finally { fs.rmSync(priv, { recursive: true, force: true }); }
  compressAudio.failed = true;   // ffmpeg がない：WAV のまま埋め込む（大きくなる）
  return { path: file, read: bytes.length };
}

// ---------------------------------------------------------------- Node の読み書き（kit/core/build-core.mjs の env）
// p が dir の中にあるか（実体のパスで比べる。シンボリックリンクで外に出るものは外とみなす）
function within(p, dir) {
  try {
    const rp = fs.realpathSync(p), rd = fs.realpathSync(dir);
    return rp === rd || rp.startsWith(rd + path.sep);
  } catch { return false; }
}
// 読み取りは上限つきの読み取りの口（kit/bounded-read.mjs）だけを通す：通常のファイルだけを、渡された大きさまで
export { readRegular };
// dir の下の通常のファイル（絶対パス、パスの順）。シンボリックリンクはたどらず数えない（ファイルもフォルダも）。ドットで始まる名前は外す。
// 深さ 10・数 LIST_MAX まで（添付の一覧。kit/core/portable.mjs）
const LIST_MAX = 1000;
export function listFiles(dir) {
  const out = [];
  const go = (d, depth) => {
    if (depth > 10 || out.length >= LIST_MAX) return;
    let st; try { st = fs.lstatSync(d); } catch { return; }
    if (!st.isDirectory()) return;
    for (const name of fs.readdirSync(d).sort()) {
      if (name.startsWith('.') || out.length >= LIST_MAX) continue;
      const p = path.join(d, name);
      let s2; try { s2 = fs.lstatSync(p); } catch { continue; }
      if (s2.isSymbolicLink()) continue;
      if (s2.isDirectory()) go(p, depth + 1);
      else if (s2.isFile()) out.push(p);
    }
  };
  go(dir, 1);
  return out;
}
// max：読んでよいバイト数（kit/core/build-core.mjs の chargedEnv が渡す。なければ READ_LIMITS.default）
export const nodeEnv = {
  path, KIT, ROOT, version: VERSION, katex,
  katexDir: path.dirname(require.resolve('katex')),
  fontDir: (pkg) => path.dirname(require.resolve(`${pkg}/package.json`)),
  exists: (p) => fs.existsSync(p),
  isFile: (p) => fs.statSync(p).isFile(),
  readText: (p, max) => readRegular(p, max).toString('utf8'),
  readTextBytes: (p, max) => readRegularText(p, max),   // {text, bytes}：読んだバイト数で数える（chargedEnv）
  readBase64: (p, max) => readRegular(p, max).toString('base64'),
  readBytes: (p, max) => new Uint8Array(readRegular(p, max)),
  // 読む前に組み立ての上限に数える大きさ（kit/core/build-core.mjs の chargedEnv）。通常のファイルでなければ NotRegularFileError
  size: (p) => regularStat(p).size,
  within,
  listFiles,
  // 利用者のテーマのフォルダ（EGATARI_THEMES・~/.egatari/themes。kit/theme-dirs.mjs）：読むたびに求め直す（組み立てが 1 回だけ読む）
  get themeDirs() { return userThemeDirs(); },
  subset: subsetCss,
  compressAudio,
  audioFailed: () => !!compressAudio.failed,
};

// ---------------------------------------------------------------- 本体
export function build(srcPath, opts = {}) { return core.build(nodeEnv, srcPath, opts); }
export function bundleAssets(html, deckDir, warn = []) { return core.bundleAssets(nodeEnv, html, deckDir, warn); }
export function defaultOut(srcPath) { return core.defaultOut(path, srcPath); }

// 持ち運べる 1 ファイル（kit/core/portable.mjs）。設定のファイル（docId）を初めて作ったときは原稿のフォルダに書く
export async function buildPortable(srcPath, opts = {}) {
  const r = await exportPortable(nodeEnv, srcPath, opts);
  const deckDir = path.dirname(path.resolve(srcPath));
  // 原稿のフォルダに残すもの（FORMAT.CONFIG_FILE）：リンクを通しては書かない（kit/safe-fs.mjs）
  for (const [rel, text] of Object.entries(r.writes)) safeWriteFile(deckDir, path.join(deckDir, ...rel.split('/')), text);
  if (opts.playOnly) r.html = playOnly(r.html);
  return r;
}
// 組んだものを書く。原稿のフォルダの中（既定の out/）なら、途中のフォルダも書く先もリンクでないこと（原稿のフォルダに置かれたリンクで
// 外のファイルを上書きしない。format spec §11）。外（-o で選んだ場所）なら、そのフォルダを作り、書く先がリンクでないこと。どちらも一時ファイル + rename
export function writeOutput(srcPath, out, data) {
  const deckDir = path.dirname(path.resolve(srcPath)), o = path.resolve(out);
  const rel = path.relative(deckDir, o);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return safeWriteFile(deckDir, o, data);
  fs.mkdirSync(path.dirname(o), { recursive: true });
  return safeWriteFile(path.dirname(o), o, data);
}
export function defaultPortableOut(srcPath, playOnlyOut = false) {
  const p = path.parse(path.resolve(srcPath));
  return path.join(p.dir, 'out', p.name + (playOnlyOut ? FORMAT.PLAY_EXT : FORMAT.FILE_EXT));
}

// コマンドの引数の原稿：フォルダなら <フォルダ>/deck.html にする。フォルダに deck.html がなければ、何が要るかを言って断る
// （ほかは今までどおり。フォルダをそのまま組み立てに渡すと「通常のファイルでない（FIFO など）」と紛らわしく断られていた）
export function resolveDeckArg(src) {
  let st = null;
  try { st = fs.statSync(src); } catch { return src; }
  if (!st.isDirectory()) return src;
  const f = path.join(src, 'deck.html');
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  const e = new Error(`${src} is a folder without deck.html: expected a deck.html file or a folder containing one`);
  e.code = 'build-no-deck';
  throw e;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opts = {}; let src = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-o') opts.out = a[++i];
    else if (a[i] === '--theme') opts.theme = a[++i];
    else if (a[i] === '--dev') opts.dev = true;
    else if (a[i] === '--embed-audio') opts.embedAudio = true;
    else if (a[i] === '--portable') opts.portable = true;
    else if (a[i] === '--play-only') { opts.portable = true; opts.playOnly = true; }
    else src = a[i];
  }
  if (!src) { console.error('usage: node kit/build.mjs <deck.html | working folder> [-o out.html] [--theme name] [--dev] [--embed-audio] [--portable] [--play-only]'); process.exit(1); }
  try { src = resolveDeckArg(src); } catch (e) { console.error(`build: ${e.message}`); process.exit(1); }
  if (opts.portable) {
    if (opts.dev) { console.error('--portable cannot be combined with --dev'); process.exit(1); }
    const out = opts.out || defaultPortableOut(src, opts.playOnly);
    let r;
    try { r = await buildPortable(src, { ...opts, out }); } catch (e) { console.error(`portable: ${e.code ? `[${e.code}] ` : ''}${e.message}`); process.exit(1); }
    try { writeOutput(src, out, r.html); } catch (e) { console.error(`portable: ${e.message}`); process.exit(1); }
    const s = r.stats;
    if (Object.keys(r.writes).length) console.log(`  docId ${r.index.docId} -> ${path.join(path.dirname(path.resolve(src)), FORMAT.CONFIG_FILE)}（keep this file with the deck）`);
    console.log(`portable${opts.playOnly ? ' (play-only)' : ''}: slides: ${s.slides}, source files: ${s.files}, audio: ${s.audio}, profile: ${r.index.profile}, size: ${(Buffer.byteLength(r.html) / 1024).toFixed(0)} KB -> ${out}`);
    for (const w of r.warnings) console.warn('  ⚠ ' + w);
  } else {
    const out = opts.out || defaultOut(src);
    let r;
    try { r = build(src, { ...opts, out }); } catch (e) { if (e.code !== 'build-too-large' && e.code !== 'build-not-a-file') throw e; console.error(e.message); process.exit(1); }
    try { writeOutput(src, out, r.html); } catch (e) { console.error(`build: ${e.message}`); process.exit(1); }
    const s = r.stats;
    console.log(`slides: ${s.slides}, math: ${s.math}, components: ${s.components.join(' ') || '-'}, font files: ${s.fontFiles}, narration: ${s.narration}, audio: ${s.audio}, theme: ${s.theme}, size: ${(r.html.length / 1024).toFixed(0)} KB -> ${out}`);
    for (const w of s.warn) console.warn('  ⚠ ' + w);
  }
}
