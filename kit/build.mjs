// 原稿（deck.html）を、外部の読み込みなしで表示できる 1 つの HTML にする
//
//   node kit/build.mjs <deck.html> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio] [--portable] [--play-only]
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
//   <m-名前 …>              部品。components/名前/index.js（原稿のフォルダ → リポジトリの順に探す）を自動で読み込む
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
function subsetCss(text) {
  const chars = [...new Set(text)].filter((c) => c.codePointAt(0) >= 0x20).sort().join('');
  const out = [];
  for (const [w, f] of [[400, 'BIZUDPGothic-Regular.ttf'], [700, 'BIZUDPGothic-Bold.ttf']]) {
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
    out.push(`@font-face{font-family:"BIZ UDPGothic";font-style:normal;font-display:block;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(woff).toString('base64')}) format("woff2")}`);
  }
  return { css: out.join('\n') + '\n', n: out.length, bytes: 0 };
}

// ---------------------------------------------------------------- 音声の圧縮
// 埋め込む音声は AAC（64 kbps・モノラル）にする。WAV のままだと 5 分で 30 MB を超える。結果はキャッシュする
function compressAudio(file) {
  if (!/\.wav$/i.test(file)) return file;
  const out = path.join(os.tmpdir(), 'motion-slides-audio', short(fs.readFileSync(file).toString('base64')) + '.m4a');
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', out]);
  if (r.status === 0) return out;
  compressAudio.failed = true;   // ffmpeg がない：WAV のまま埋め込む（大きくなる）
  return file;
}

// ---------------------------------------------------------------- Node の読み書き（kit/core/build-core.mjs の env）
// p が dir の中にあるか（実体のパスで比べる。シンボリックリンクで外に出るものは外とみなす）
function within(p, dir) {
  try {
    const rp = fs.realpathSync(p), rd = fs.realpathSync(dir);
    return rp === rd || rp.startsWith(rd + path.sep);
  } catch { return false; }
}
export const nodeEnv = {
  path, KIT, ROOT, version: VERSION, katex,
  katexDir: path.dirname(require.resolve('katex')),
  fontDir: (pkg) => path.dirname(require.resolve(`${pkg}/package.json`)),
  exists: (p) => fs.existsSync(p),
  isFile: (p) => fs.statSync(p).isFile(),
  readText: (p) => fs.readFileSync(p, 'utf8'),
  readBase64: (p) => fs.readFileSync(p).toString('base64'),
  readBytes: (p) => new Uint8Array(fs.readFileSync(p)),
  within,
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
  for (const [rel, text] of Object.entries(r.writes)) fs.writeFileSync(path.join(deckDir, rel), text);
  if (opts.playOnly) r.html = playOnly(r.html);
  return r;
}
export function defaultPortableOut(srcPath, playOnlyOut = false) {
  const p = path.parse(path.resolve(srcPath));
  return path.join(p.dir, 'out', p.name + (playOnlyOut ? FORMAT.PLAY_EXT : FORMAT.FILE_EXT));
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
  if (!src) { console.error('usage: node kit/build.mjs <deck.html> [-o out.html] [--theme name] [--dev] [--embed-audio] [--portable] [--play-only]'); process.exit(1); }
  if (opts.portable) {
    if (opts.dev) { console.error('--portable cannot be combined with --dev'); process.exit(1); }
    const out = opts.out || defaultPortableOut(src, opts.playOnly);
    let r;
    try { r = await buildPortable(src, { ...opts, out }); } catch (e) { console.error(`portable: ${e.code ? `[${e.code}] ` : ''}${e.message}`); process.exit(1); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.html);
    const s = r.stats;
    if (Object.keys(r.writes).length) console.log(`  docId ${r.index.docId} -> ${path.join(path.dirname(path.resolve(src)), FORMAT.CONFIG_FILE)}（keep this file with the deck）`);
    console.log(`portable${opts.playOnly ? ' (play-only)' : ''}: slides: ${s.slides}, source files: ${s.files}, audio: ${s.audio}, profile: ${r.index.profile}, size: ${(Buffer.byteLength(r.html) / 1024).toFixed(0)} KB -> ${out}`);
    for (const w of r.warnings) console.warn('  ⚠ ' + w);
  } else {
    const out = opts.out || defaultOut(src);
    const r = build(src, { ...opts, out });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.html);
    const s = r.stats;
    console.log(`slides: ${s.slides}, math: ${s.math}, components: ${s.components.join(' ') || '-'}, font files: ${s.fontFiles}, narration: ${s.narration}, audio: ${s.audio}, theme: ${s.theme}, size: ${(r.html.length / 1024).toFixed(0)} KB -> ${out}`);
    for (const w of s.warn) console.warn('  ⚠ ' + w);
  }
}
