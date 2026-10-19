// 生の読み取りの見張り（npm test の単体の検査）：リポジトリのコードから、上限つきの読み取りの口（kit/bounded-read.mjs・app/bounded-read.js）を
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// 通さない読み取り（readFileSync・fs.readFile・readSync・createReadStream・File/Response の text()・arrayBuffer()・bytes()・blob()・json()・
// FileReader・getReader() など）を探し、下の許し（ALLOW）にないものが 1 つでもあれば失敗する
//   node tools/test-raw-reads.mjs
// 信頼しないデータ（原稿のフォルダ・作業場所・持ち運べる 1 ファイル・選んだファイル）は、どれも上限つきの読み取りの口を通して読む（SECURITY.md）。
// 許すのは、リポジトリの中の決まったファイル（実行系・KaTeX・字・package.json）だけを読むもの、試験、ブラウザの記録（console の text()）など。
// 許しの 1 つ 1 つに理由を書く。許しのどれにも当たらない呼び出しを足すと、この試験が失敗する（許すなら理由を添えてここに足す）。
// 使われなくなった許しも失敗にする（許しを古いまま残さない）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 生の読み取りの形
const RAW = /\breadFileSync\b|\breadFile\b|\breadv?Sync\b|\bfs\.read\(|\bcreateReadStream\b|\bopenAsBlob\b|\.text\(\)|\.arrayBuffer\(\)|\.bytes\(\)|\.blob\(\)|\.json\(\)|\bFileReader\b|\.getReader\(\)|\.stream\(\)/g;

// 見ないもの：上限つきの読み取りの口そのもの、写し（vendor/）・依存・組んだもの、試験（試験は自分で作ったファイルと試験用のデータだけを読む）
const SKIP = [
  /^kit\/bounded-read\.mjs$/,          // 上限つきの読み取りの口（Node）：ここだけが readSync で読む
  /^app\/bounded-read\.js$/,           // 上限つきの読み取りの口（ブラウザ）：ここだけが File.arrayBuffer() を呼ぶ
  /^vendor\//, /^lab\/vendor\//, /^node_modules\//, /^dist\//,   // 写し・依存・組んだもの（このリポジトリのコードでない）
  /^tools\/test-[^/]*\.mjs$/,          // 試験：自分で作った一時のファイルと、リポジトリの試験用のデータ・examples だけを読む
  /^tools\/test-raw-reads\.mjs$/,      // この試験（形を文字列に持つ）
];

// 許し：[ファイル, その行に含まれる文字列, 理由]
const ALLOW = [
  ['kit/build.mjs', "fs.readFileSync(path.join(ROOT, 'package.json')", 'リポジトリの package.json（版）を読む'],
  ['kit/build.mjs', 'update(fs.readFileSync(f))', 'リポジトリの fonts/ の TTF（字の絞り込みの鍵の hash）を読む'],
  ['server/dev.mjs', "fs.readFileSync(path.join(HERE, 'hints.js')", 'リポジトリの server/hints.js を読む'],
  ['server/dev.mjs', 'fs.createReadStream(file).pipe(res);', '外枠の部品（server/ の中の決まったファイル）を流す（serveFile。原稿のフォルダのファイルではない）'],
  ['server/dev.mjs', 'fs.createReadStream(file, { start: 0, end: st.size - 1 })', '原稿のフォルダのファイルを stat の大きさまで流す（中身をメモリに貯めない。通常のファイルだけ）'],
  ['server/shell.js', 'r.json()', '開発サーバー自身の API の答え（同じ origin・合言葉つき）'],
  ['app/main.js', 'await r.arrayBuffer()', 'アプリに同梱した字の分割ファイルを、アプリ自身の配信元から fetch する'],
  ['tools/i18n-pairs.mjs', "fs.readFileSync(path.join(root, f), 'utf8')", 'リポジトリの文書の組（X.md と X.ja.md。node_modules・vendor・out・dist の外）を読む（開発者の道具。原稿のフォルダは読まない）'],
  ['kit/check.mjs', 'm.text()', 'ブラウザの console の記録（Playwright の ConsoleMessage）。ファイルは読まない'],
  ['render/render.mjs', 'm.text()', 'ブラウザの console の記録（Playwright の ConsoleMessage）'],
  ['tools/smoke.mjs', 'm.text()', 'ブラウザの console の記録（Playwright の ConsoleMessage）'],
  ['examples/tmlr2026-calibration/scripts/shots_figs.mjs', 'm.text()', 'ブラウザの console の記録（Playwright の ConsoleMessage）'],
  ['render/export-canon.mjs', 'import { readFileSync } from "node:fs";', 'bun に渡すコードの文字列（canon の parser に、このツールが書いたばかりの md を読ませる）'],
  ['render/export-canon.mjs', 'parseMarp(readFileSync(', 'bun に渡すコードの文字列（このツールが書いたばかりの md）'],
  ['lab/irodori.js', 'await hit.arrayBuffer()', '試験ページ：Cache Storage に自分で入れた重み（固定の Hugging Face の版）。読んだ後に期待の大きさと比べる'],
  ['lab/irodori.js', 'await res.arrayBuffer()', '試験ページ：固定の Hugging Face の版の重み・同梱の既定の声（自分の配信元）を fetch する'],
  ['lab/irodori.js', 'res.body.getReader()', '試験ページ：重みの fetch を読みながら進み具合を出す（content-length の大きさで確保）'],
  ['lab/irodori.js', 'await f.arrayBuffer()', '試験ページ：選んだ声のファイル。直前に File.size を、読んだ後に byteLength を 64 MiB と比べる（lab/ は app/ を読み込めない）'],
  ['tools/build-app.mjs', 'fs.readFileSync(', '編集アプリを組む：リポジトリの kit/・components/・themes/・app/・KaTeX・字を集める'],
  ['tools/catalog.mjs', "fs.readFileSync(file, 'utf8')", '部品庫の一覧を作る：リポジトリの components/ の README を読む'],
  ['tools/catalog.mjs', "fs.readFileSync(OUT, 'utf8')", '部品庫の一覧：作り直したものと比べるために、このツールが書く components/CATALOG.md を読む（--check）'],
  ['tools/make-llm-guide.mjs', "fs.readFileSync(rel(...p), 'utf8')", 'AI への指示を作る：リポジトリの tools/llm-guide/・docs/contract・components/ の README と index.js を読む（開発者の道具）'],
  ['tools/make-llm-guide.mjs', "fs.readFileSync(rel(file), 'utf8')", 'AI への指示を作る：リポジトリの docs/authoring-with-llms*.md（作ったもの）を読んで比べる'],
  ['tools/get-fonts.mjs', 'sha(fs.readFileSync(out))', '字：リポジトリの fonts/ の、決まった大きさのファイルのハッシュを確かめる（取ってくる側は決まったコミット・大きさの上限・SHA-256 で確かめる）'],
  ['tools/hostile-deck.mjs', 'fs.readFileSync(path.join(min,', '試験の材料：リポジトリの examples/minimal を読む'],
  ['tools/katex-ranges.mjs', 'fs.readFileSync(', 'node_modules の KaTeX（package.json と字）と、このツールが書く表を読む'],
  ['lab/tts-engine.mjs', 'await hit.arrayBuffer()', 'TTS の窓と試験ページ：Cache Storage に自分で入れた重み（固定の Hugging Face の版）。読んだ後に期待の大きさと比べる'],
  ['lab/tts-engine.mjs', 'await res.arrayBuffer()', 'TTS の窓と試験ページ：固定の Hugging Face の版の重み・同梱の既定の声（自分の配信元）を fetch する'],
  ['lab/tts-engine.mjs', 'res.body.getReader()', 'TTS の窓と試験ページ：重みの fetch を読みながら進み具合を出す（content-length の大きさで確保）'],
  ['tools/changelog.mjs', "const read = (f) => fs.readFileSync(f, 'utf8')", 'CHANGELOG の道具：リポジトリの changes/*.md・CHANGELOG.md・package.json・package-lock.json を読む（開発者の道具）'],
  ['tools/release-assets.mjs', "fs.readFileSync(path.join(ROOT, 'package.json')", 'リポジトリの package.json（版）を読む'],
];

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT }).toString().split('\0')
  .filter((f) => /\.(?:m?js|cjs)$/.test(f) && !SKIP.some((re) => re.test(f)) && fs.existsSync(path.join(ROOT, f)));
const used = new Set(), bad = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');   // この試験が読むのはリポジトリのコード
  lines.forEach((ln, i) => {
    RAW.lastIndex = 0;
    if (!RAW.test(ln)) return;
    // コメントだけの行は見ない
    if (/^\s*(?:\/\/|\*|\/\*)/.test(ln)) return;
    const a = ALLOW.findIndex(([file, needle]) => file === f && ln.includes(needle));
    if (a < 0) bad.push(`${f}:${i + 1}: ${ln.trim().slice(0, 160)}`);
    else used.add(a);
  });
}
const stale = ALLOW.filter((_, i) => !used.has(i)).map(([f, n]) => `${f}: "${n}"`);
let fails = 0;
if (bad.length) { fails++; console.log('FAIL raw reads outside kit/bounded-read.mjs / app/bounded-read.js (route them through the bounded readers, or add an ALLOW entry with a reason):'); for (const b of bad) console.log('  ' + b); }
else console.log(`ok   no raw reads outside the bounded readers (${files.length} files, ${used.size} allowed)`);
if (stale.length) { fails++; console.log('FAIL ALLOW entries that match nothing (remove them):'); for (const s of stale) console.log('  ' + s); }
else console.log('ok   every ALLOW entry is used');
process.exit(fails ? 1 : 0);
