// スライドに安定した id を付ける（npm run ids）。format spec §8.1、docs/contract.md §4
//   npm run ids -- <デッキのフォルダ | deck.html> [--dry-run]
//   node tools/ids.mjs <デッキのフォルダ | deck.html> [--dry-run]
//
// - id のない <section class="slide"> に id="s-xxxxxx"（base32 の小文字 6 字、乱数）を付ける。
//   文書の中のすべての id（注目の演出の目印・\htmlId）とスライドの鍵を避ける
// - narration.md の見出しを「## 見出し {#id}」に書き換える（見出しの文字列はそのまま残す）
// - audio/manifest.json・timeline.json・comments.json の鍵（"旧い鍵:段階"）を新しい id に付け替える（あるものだけ）。
//   音声のファイルは作り直さない（digest は鍵を含まない）
// - data-morph="旧い鍵" も新しい id にする
// - 書き換えるファイルは、先に .cache/edits/<時刻>-<名前> に控えを残す（開発サーバーと同じ。新しい 30 個）
// - 改行（CRLF / LF）はそのまま。2 回目は何も変えない
// - 鍵が重なる・id がほかの id と重なる・id の書式が誤っているデッキでは何もしない（先に手で直す）
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSlideIds } from '../kit/build.mjs';
import { splitKey, isSlideId } from '../kit/narration.mjs';
import { planIds, rewriteDeckIds, rewriteNarrationIds } from '../kit/core/slide-ids.mjs';
import { safeWriteFile, readContained, checkWritable, backupFile, pruneBackups } from '../kit/safe-fs.mjs';
import { READ_LIMITS } from '../kit/bounded-read.mjs';

const USAGE = 'usage: npm run ids -- <working folder | deck.html> [--dry-run]';
const KEEP_EDITS = 30;
const fail = (msg) => { console.error(`ids: ${msg}`); process.exit(1); };
const shown = (p) => { const r = path.relative(process.env.INIT_CWD || process.cwd(), p); return !r || r.startsWith('..') || path.isAbsolute(r) ? p : r; };

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const rest = args.filter((a) => a !== '--dry-run');
if (args.includes('-h') || args.includes('--help')) { console.log(USAGE); process.exit(0); }
if (rest.length !== 1 || rest[0].startsWith('--')) fail(USAGE);
const base = process.env.INIT_CWD || process.cwd();
let SRC = path.resolve(base, rest[0]);
if (fs.existsSync(SRC) && fs.statSync(SRC).isDirectory()) SRC = path.join(SRC, 'deck.html');
if (!fs.existsSync(SRC)) fail(`not found: ${SRC}`);
const DIR = path.dirname(SRC);
// 読み書きは原稿のフォルダの中だけ（kit/safe-fs.mjs：外を指すリンクは読まない、リンクを通しては書かない。format spec §11）
// 上限（バイト。kit/core/bounded-read-core.mjs の READ_LIMITS）：原稿・口述原稿・コメント・小さな JSON（manifest・timeline）ごとに。超えれば読まずに断る
const limitOf = (file) => { const b = path.basename(file); return b === 'narration.md' ? READ_LIMITS.narration : b === 'comments.json' ? READ_LIMITS.comments : /\.json$/i.test(b) ? READ_LIMITS.json : READ_LIMITS.source; };
const rd = (file) => { try { return readContained(DIR, file, 'utf8', { max: limitOf(file) }); } catch (e) { fail(e.message); } };
const has = (file) => rd(file) !== null;
const FILES = { narration: path.join(DIR, 'narration.md'), manifest: path.join(DIR, 'audio', 'manifest.json'),
  timeline: path.join(DIR, 'timeline.json'), comments: path.join(DIR, 'comments.json') };

// ---------------------------------------------------------------- 1. 原稿を調べる（本体は kit/core/slide-ids.mjs。編集アプリの貼り付けと共有）
const src = rd(SRC);
if (src === null) fail(`not found: ${SRC}`);
const plan = planIds(src);
const { slides, problems, rename, newIds } = plan;
if (problems.length) {
  console.error('ids: このデッキには id を付けられない（先に直すこと）');
  for (const p of problems) console.error('  ' + p.msg);
  process.exit(1);
}
if (!rename.size) { console.log(`ids: ${shown(SRC)}: どのスライドにも id がある。変えるものはない / every slide already has an id; nothing to do`); process.exit(0); }

// ---------------------------------------------------------------- 2・3. deck.html（id を足し、data-morph の参照を付け替える）と narration.md（「## 見出し {#id}」に）
const rewriteDeck = (text) => rewriteDeckIds(text, plan);
const rewriteNarration = (text) => rewriteNarrationIds(text, plan);

// ---------------------------------------------------------------- 4. JSON の鍵：書き方（字下げ・改行・末尾の改行）を元に合わせて書き直す
const renameKey = (k) => {
  const s = String(k);
  if (!s.includes(':')) return rename.has(s) ? rename.get(s) : s;
  const [sk, st] = splitKey(s);
  return rename.has(sk) ? `${rename.get(sk)}:${st}` : s;
};
function renameObjectKeys(o) {
  let n = 0;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const nk = renameKey(k);
    if (nk !== k) n++;
    // 同じ鍵が既にあれば（以前に付け替えたものなど）上書きしない
    if (Object.prototype.hasOwnProperty.call(out, nk)) continue;
    Object.defineProperty(out, nk, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return { out, n };
}
function writeJsonLike(orig, value) {
  const eol = orig.includes('\r\n') ? '\r\n' : '\n';
  const m = orig.match(/\n([ \t]+)\S/);
  const indent = m ? m[1] : (orig.trim().includes('\n') ? 2 : 0);
  let t = JSON.stringify(value, null, indent);
  if (eol === '\r\n') t = t.replace(/\n/g, '\r\n');
  return t + (/\r?\n$/.test(orig) ? eol : '');
}
function rewriteJson(file, fn) {
  const text = rd(file);
  let j;
  try { j = JSON.parse(text); } catch (e) { fail(`${path.relative(DIR, file)} が JSON として読めない: ${e.message}`); }
  const r = fn(j);
  return r.n ? { out: writeJsonLike(text, r.value), n: r.n } : { out: text, n: 0 };
}

// ---------------------------------------------------------------- 5. 書き換えを先に全部作ってから書く
const writes = [];   // [file, text]
const summary = [];
const deck = rewriteDeck(src);
writes.push([SRC, deck.out]);
summary.push(`deck.html: ${rename.size} 枚に id を付けた${deck.morphs ? `、data-morph ${deck.morphs} 個を付け替えた` : ''}`);
for (const s of slides) if (newIds.has(s.index)) summary.push(`  ${String(s.index + 1).padStart(3)}  ${newIds.get(s.index)}  ← ${s.key}`);

if (has(FILES.narration)) {
  const text = rd(FILES.narration);
  const r = rewriteNarration(text);
  if (r.n) { writes.push([FILES.narration, r.out]); summary.push(`narration.md: 見出し ${r.n} 個を「## 見出し {#id}」にした`); }
  else summary.push('narration.md: 変えるものはない');
}
if (has(FILES.manifest)) {
  const r = rewriteJson(FILES.manifest, (j) => {
    if (j && typeof j === 'object' && j.segments && typeof j.segments === 'object') { const x = renameObjectKeys(j.segments); return { value: { ...j, segments: x.out }, n: x.n }; }
    const x = renameObjectKeys(j || {}); return { value: x.out, n: x.n };
  });
  if (r.n) { writes.push([FILES.manifest, r.out]); summary.push(`audio/manifest.json: 鍵 ${r.n} 個を付け替えた（音声は作り直さない）`); }
}
if (has(FILES.timeline)) {
  const r = rewriteJson(FILES.timeline, (j) => { const x = renameObjectKeys(j || {}); return { value: x.out, n: x.n }; });
  if (r.n) { writes.push([FILES.timeline, r.out]); summary.push(`timeline.json: 鍵 ${r.n} 個を付け替えた`); }
}
if (has(FILES.comments)) {
  const r = rewriteJson(FILES.comments, (j) => {
    if (!Array.isArray(j)) return { value: j, n: 0 };
    let n = 0;
    const value = j.map((c) => {
      if (!c || typeof c !== 'object' || typeof c.key !== 'string') return c;
      const nk = renameKey(c.key);
      if (nk === c.key) return c;
      n++; return { ...c, key: nk };
    });
    return { value, n };
  });
  if (r.n) { writes.push([FILES.comments, r.out]); summary.push(`comments.json: 鍵 ${r.n} 個を付け替えた`); }
}

// 念のため：新しい原稿が検査を通り、新しい id がそのまま鍵になるか
{
  const after = analyzeSlideIds(deck.out);
  if (after.problems.length || after.slides.some((s) => !isSlideId(s.id || ''))) fail('書き換えた原稿の検査に失敗した（何も書いていない）: ' + after.problems.map((p) => p.msg).join(' / '));
}

// ---------------------------------------------------------------- 6. 控えを残して書く
// 控えも書き込みも、リンクを通らない（kit/safe-fs.mjs）。どれか 1 つでも断るなら、何も書かないうちに断る
const EDITS_REL = path.join('.cache', 'edits');
const EDITS = path.join(DIR, EDITS_REL);
if (!dry) {
  try {
    for (const [file] of writes) { checkWritable(DIR, file); checkWritable(DIR, path.join(EDITS, `2000-01-01T00-00-00-000Z-${path.basename(file)}`)); }
  } catch (e) { fail(`${e.message}（何も書いていない / nothing written）`); }
  for (const [file, text] of writes) { backupFile(DIR, file, EDITS_REL, { max: limitOf(file) }); safeWriteFile(DIR, file, text); }
  pruneBackups(DIR, EDITS_REL, KEEP_EDITS);
}
console.log((dry ? '[dry-run] ' : '') + summary.join('\n'));
if (!dry) console.log(`控え / backups: ${shown(EDITS)}\n動画（render/）の書き出しは鍵が変わったので作り直しになる / re-render videos: their keys changed`);
