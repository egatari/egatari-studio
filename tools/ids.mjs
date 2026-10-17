// スライドに安定した id を付ける（npm run ids）。Etoki 1.0 §8.1、docs/contract.md §4
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
import { parseHeading, newSlideId, splitKey, isSlideId } from '../kit/narration.mjs';
import { parse } from 'parse5';

const USAGE = 'usage: npm run ids -- <deck folder | deck.html> [--dry-run]';
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
const FILES = { narration: path.join(DIR, 'narration.md'), manifest: path.join(DIR, 'audio', 'manifest.json'),
  timeline: path.join(DIR, 'timeline.json'), comments: path.join(DIR, 'comments.json') };

// ---------------------------------------------------------------- 1. 原稿を調べる
const src = fs.readFileSync(SRC, 'utf8');
const { slides, docIds, problems } = analyzeSlideIds(src);
if (problems.length) {
  console.error('ids: このデッキには id を付けられない（先に直すこと）');
  for (const p of problems) console.error('  ' + p.msg);
  process.exit(1);
}
const taken = new Set([...docIds.keys(), ...slides.map((s) => s.key)]);
const rename = new Map();   // 旧い鍵 → 新しい id
const newIds = new Map();   // スライドの番号 → 新しい id
for (const s of slides) {
  if (s.id !== null) continue;
  const id = newSlideId(taken);
  taken.add(id); rename.set(s.key, id); newIds.set(s.index, id);
}
if (!rename.size) { console.log(`ids: ${shown(SRC)}: どのスライドにも id がある。変えるものはない / every slide already has an id; nothing to do`); process.exit(0); }

// ---------------------------------------------------------------- 2. deck.html：id を足し、data-morph の参照を付け替える
function rewriteDeck(text) {
  const doc = parse(text, { sourceCodeLocationInfo: true });
  const ins = [];   // [位置, 消す長さ, 入れる文字列]
  let n = 0, morphs = 0;
  const walk = (node) => {
    if (node.tagName && node.sourceCodeLocation) {
      const loc = node.sourceCodeLocation.startTag;
      const has = (a) => (node.attrs || []).find((x) => x.name === a);
      if (node.tagName === 'section' && (has('class')?.value || '').split(/\s+/).includes('slide')) {
        const id = newIds.get(n++);
        if (id) {
          // 開始タグの「>」（自己終了なら「/>」）の手前。class などの後ろに足す
          let at = loc.endOffset - 1;
          if (text[at - 1] === '/') at--;
          while (at > loc.startOffset && /\s/.test(text[at - 1])) at--;
          ins.push([at, 0, ` id="${id}"`]);
        }
      }
      const dm = has('data-morph');
      if (dm && rename.has(dm.value) && loc.attrs && loc.attrs['data-morph']) {
        const a = loc.attrs['data-morph'];
        ins.push([a.startOffset, a.endOffset - a.startOffset, `data-morph="${rename.get(dm.value)}"`]);
        morphs++;
      }
    }
    for (const c of node.childNodes || []) walk(c);
    if (node.content) walk(node.content);
  };
  walk(doc);
  ins.sort((x, y) => y[0] - x[0]);
  let out = text;
  for (const [at, del, t] of ins) out = out.slice(0, at) + t + out.slice(at + del);
  return { out, morphs };
}

// ---------------------------------------------------------------- 3. narration.md：見出しを「## 見出し {#id}」に
// 行の区切り（CRLF / LF）は行ごとにそのまま残す。注釈（<!-- … -->）の中は parseNarration と同じく見ない
function rewriteNarration(text) {
  const parts = text.split(/(\r?\n)/);
  let inComment = false, n = 0;
  for (let j = 0; j < parts.length; j += 2) {
    const ln = parts[j];
    if (inComment) { if (ln.includes('-->')) inComment = false; continue; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; continue; }
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (!h) continue;
    const p = parseHeading(h[1]);
    if (p.id !== null || !rename.has(p.key)) continue;
    parts[j] = `## ${p.heading} {#${rename.get(p.key)}}`;
    n++;
  }
  return { out: parts.join(''), n };
}

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
  const text = fs.readFileSync(file, 'utf8');
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

if (fs.existsSync(FILES.narration)) {
  const text = fs.readFileSync(FILES.narration, 'utf8');
  const r = rewriteNarration(text);
  if (r.n) { writes.push([FILES.narration, r.out]); summary.push(`narration.md: 見出し ${r.n} 個を「## 見出し {#id}」にした`); }
  else summary.push('narration.md: 変えるものはない');
}
if (fs.existsSync(FILES.manifest)) {
  const r = rewriteJson(FILES.manifest, (j) => {
    if (j && typeof j === 'object' && j.segments && typeof j.segments === 'object') { const x = renameObjectKeys(j.segments); return { value: { ...j, segments: x.out }, n: x.n }; }
    const x = renameObjectKeys(j || {}); return { value: x.out, n: x.n };
  });
  if (r.n) { writes.push([FILES.manifest, r.out]); summary.push(`audio/manifest.json: 鍵 ${r.n} 個を付け替えた（音声は作り直さない）`); }
}
if (fs.existsSync(FILES.timeline)) {
  const r = rewriteJson(FILES.timeline, (j) => { const x = renameObjectKeys(j || {}); return { value: x.out, n: x.n }; });
  if (r.n) { writes.push([FILES.timeline, r.out]); summary.push(`timeline.json: 鍵 ${r.n} 個を付け替えた`); }
}
if (fs.existsSync(FILES.comments)) {
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
const EDITS = path.join(DIR, '.cache', 'edits');
function backup(file) {
  fs.mkdirSync(EDITS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, path.join(EDITS, `${stamp}-${path.basename(file)}`));
}
if (!dry) {
  for (const [file, text] of writes) { backup(file); fs.writeFileSync(file, text); }
  const all = fs.readdirSync(EDITS).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_EDITS))) fs.rmSync(path.join(EDITS, f), { force: true });
}
console.log((dry ? '[dry-run] ' : '') + summary.join('\n'));
if (!dry) console.log(`控え / backups: ${shown(EDITS)}\n動画（render/）の書き出しは鍵が変わったので作り直しになる / re-render videos: their keys changed`);
