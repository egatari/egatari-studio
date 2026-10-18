// 書き出した動画（render/render.mjs の出力）→ canon の教材バンドル
// canon は TML 研究室の講義配信システム。Marp 形式の md とコマごとの mp4/png という形式なので、
// 同じ形式を受け付けるほかのシステムにも使える
//
//   node render/export-canon.mjs <deckdir | built.html> --render <render の出力> --out <バンドル> [--md 名前.md] [--canon <canon のリポジトリ>]
//
// --canon（または環境変数 CANON_DIR）があれば canon 自身の parser（bun）で md を読んで確かめる。
// なければその検査だけを飛ばす（こちらの規則での検査はいつも行う）
//
// バンドルの形（canon の tools/upload-lesson.ts --bundle <dir> --md <md> --movie clips_per_page --stills stills）
//   <out>/<md>                         Marp 形式。1 段階 = 1 ページ = 1 チャプター
//   <out>/clips_per_page/clip_NNNN.mp4  NNNN = チャプターの seq（0 始まり）
//   <out>/stills/clip_NNNN.png          最終状態
//   <out>/timeline.out.json            （参考）各段階の開始・長さ・原稿。録画モードの transcript_segment 用
// ページの規則（canon の src/server/marp.ts）：frontmatter 必須、ページは ^---$ で区切る、最初の `# ` が題名、
// `<!-- _paginate: hold -->` は同じスライドの次のコマ、口述原稿は「口述原稿」を含むコメントの `Expert:` / `Novice:` の行だけ
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readNarration } from '../kit/narration.mjs';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;   // canon src/server/assets.ts
const MAX_STILL_BYTES = 8 * 1024 * 1024;
function parseArgs(argv) {
  const o = { src: null, render: null, out: null, md: null, canon: process.env.CANON_DIR || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--render') o.render = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--md') o.md = argv[++i];
    else if (a === '--canon') o.canon = argv[++i];
    else o.src = a;
  }
  if (!o.src || !o.render || !o.out) {
    console.error('usage: node render/export-canon.mjs <deckdir | built.html> --render <dir> --out <bundle> [--md name.md] [--canon dir]');
    process.exit(1);
  }
  return o;
}

// render/render.mjs の鮮度の情報（timeline.out.json の stale / 各段階の input と .render-cache.json）で、
// 今の入力と合わない・無いクリップを探す。見つかれば鍵の一覧を返す
const sha = (...bufs) => { const h = crypto.createHash('sha256'); for (const b of bufs) { h.update(b); h.update('\x1f'); } return h.digest('hex').slice(0, 16); };
export function staleClips(renderDir, tl) {
  const out = new Set(tl.stale || []);
  let cache = null;
  try { cache = JSON.parse(readRegular(path.join(renderDir, '.render-cache.json'), { max: READ_LIMITS.json }).toString('utf8')); } catch {}
  for (const s of tl.segments) {
    const c = cache && cache.clips && cache.clips[s.clip.replace(/\.mp4$/, '')];
    if (!s.input || !c || c.input !== s.input || c.key !== s.key || !fs.existsSync(path.join(renderDir, s.clip))) out.add(s.key);
  }
  return [...out];
}

// 原稿の 1 行にする：改行を詰め、コメントの終わり（-->）とページ区切りにならないようにする
const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' ').replace(/--+>/g, (m) => m.replace(/-/g, '‐')).trim();
const plain = (s) => oneLine(s).replace(/<[^>]*>/g, '').replace(/^#+\s*/, '');

// 原稿のフォルダ（narration.md の在りか）と名前を推す
function locateDeck(src) {
  const p = path.resolve(src);
  if (fs.statSync(p).isDirectory()) return { dir: p, name: path.basename(p) };
  let dir = path.dirname(p);
  if (!fs.existsSync(path.join(dir, 'narration.md')) && fs.existsSync(path.join(dir, '..', 'narration.md'))) dir = path.dirname(dir);
  return { dir, name: path.basename(p, path.extname(p)) };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const deck = locateDeck(o.src);
  const renderDir = path.resolve(o.render);
  const outDir = path.resolve(o.out);
  const tl = JSON.parse(readRegular(path.join(renderDir, 'timeline.out.json'), { max: READ_LIMITS.json }).toString('utf8'));
  const segs = tl.segments;
  const mdName = o.md || `${deck.name}_with_narration.md`;
  const warn = [], err = [];

  // 書き出しが揃っていて、今の入力で作られているか（--only のあと・render のあとの build を拾う）
  const stale = staleClips(renderDir, tl);
  const fatal = [];
  if (stale.length) fatal.push(`今の入力と合わない・無いクリップが ${stale.length} 本: ${stale.join(', ')}\n    → node render/render.mjs ${tl.source || '<built.html>'} --out ${o.render}（--only なし）で書き出し直すこと`);
  if (tl.source && tl.sourceHash && fs.existsSync(tl.source) && sha(readRegular(tl.source, { max: READ_LIMITS.built }).toString('utf8')) !== tl.sourceHash)
    fatal.push(`render のあとに ${tl.source} が変わった（build し直した）。render をやり直すこと`);
  if (fatal.length) {
    for (const f of fatal) console.error('  ✗ ' + f);
    console.error('バンドルは作らない / refusing to export stale clips');
    process.exit(1);
  }

  // 書き出しが今の原稿と合っているか（narration.md を直したのに render し直していない、を拾う）
  const narr = readNarration(path.join(deck.dir, 'narration.md'));
  for (const w of narr.warnings || []) warn.push(w);
  if (narr.length) {
    const byKey = new Map(segs.map((s) => [s.key, s]));
    for (const n of narr) {
      const key = `${n.slideKey}:${n.stepKey}`, s = byKey.get(key);
      if (!s) { warn.push(`narration.md ${n.line} 行目「${key}」がタイムラインにない（スライドの鍵か段階の番号の違い）`); continue; }
      const now = n.turns.map((t) => t.display).join(' ');
      if (now !== s.text) warn.push(`${key}: 書き出しの原稿が narration.md と違う（render をやり直すこと）`);
    }
  }

  // dry-run（無音の仮の音声）のまま出していないか
  try {
    const man = JSON.parse(readRegular(path.join(deck.dir, 'audio', 'manifest.json'), { max: READ_LIMITS.json }).toString('utf8'));
    const dry = Object.entries(man.segments || {}).filter(([, v]) => v.engine === 'dry-run').map(([k]) => k);
    if (dry.length) warn.push(`audio/manifest.json に dry-run（無音）の段階が ${dry.length} 個ある（${dry.slice(0, 3).join(', ')}…）。本番の前に tts/synth.py を --dry-run なしで`);
  } catch {}

  // md を組む
  const pages = [];
  let koma = 0;
  for (const s of segs) {
    koma = s.k === 0 ? 1 : koma + 1;
    const title = plain(s.title) || s.slideKey;
    const lines = [];
    if (s.k > 0) lines.push('<!-- _paginate: hold -->', '');
    lines.push(`# ${title}`, '', `![bg contain](stills/${s.still})`, '');
    const turns = (s.transcript || []).filter((t) => oneLine(t.text));
    if (turns.length) {
      lines.push(`<!-- 口述原稿（コマ${koma}）：`);
      for (const t of turns) lines.push(`${t.role === 'novice' ? 'Novice' : 'Expert'}: ${oneLine(t.text)}`);
      lines.push('-->');
    } else warn.push(`ページ ${s.index + 1}（${s.key}）：口述原稿がない`);
    pages.push(lines.join('\n'));
  }
  const deckTitle = plain(segs[0]?.title || deck.name).replace(/"/g, '\\"');
  const front = ['---', 'marp: true', 'theme: default', 'paginate: true', `title: "${deckTitle}"`, 'size: 16:9', '---'].join('\n');
  const md = front + '\n\n' + pages.join('\n\n---\n\n') + '\n';

  // ファイルを置く
  fs.mkdirSync(path.join(outDir, 'clips_per_page'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'stills'), { recursive: true });
  for (const d of ['clips_per_page', 'stills']) for (const f of fs.readdirSync(path.join(outDir, d))) if (/^clip_\d+\./.test(f)) fs.rmSync(path.join(outDir, d, f));
  for (const s of segs) {
    const clip = path.join(renderDir, s.clip), still = path.join(renderDir, s.still);
    if (!fs.existsSync(clip)) { err.push(`ページ ${s.index + 1}（${s.key}）：動画がない ${clip}`); continue; }
    const size = fs.statSync(clip).size;
    if (size > MAX_VIDEO_BYTES) err.push(`${s.clip}：${(size / 1048576).toFixed(1)} MB（上限 80 MB）`);
    fs.copyFileSync(clip, path.join(outDir, 'clips_per_page', `clip_${String(s.index).padStart(4, '0')}.mp4`));
    if (fs.existsSync(still)) {
      if (fs.statSync(still).size > MAX_STILL_BYTES) err.push(`${s.still}：静止画が 8 MB を超える`);
      fs.copyFileSync(still, path.join(outDir, 'stills', `clip_${String(s.index).padStart(4, '0')}.png`));
    } else warn.push(`${s.still}：静止画がない`);
  }
  fs.writeFileSync(path.join(outDir, mdName), md);
  fs.copyFileSync(path.join(renderDir, 'timeline.out.json'), path.join(outDir, 'timeline.out.json'));

  // 検査（こちらの規則で）：ページ数、話者
  const mdPages = md.split(/^---$/m).slice(2);
  if (mdPages.length !== segs.length) err.push(`md のページ数 ${mdPages.length} ≠ 段階の数 ${segs.length}`);
  mdPages.forEach((p, j) => {
    for (const c of p.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (!c[1].includes('口述原稿')) continue;
      for (const ln of c[1].split('\n').map((x) => x.trim()).slice(1)) if (ln && !/^(Expert|Novice):\s*\S/.test(ln)) err.push(`ページ ${j + 1}：話者のない行「${ln.slice(0, 30)}」（canon は黙って落とす）`);
    }
  });

  // canon 自身の parser で読む（canon のリポジトリと bun があれば）
  let canonCheck = 'skipped';
  const marpTs = o.canon ? path.join(o.canon, 'src/server/marp.ts') : null;
  const bun = marpTs ? spawnSync('bun', ['--version'], { encoding: 'utf8' }) : null;
  if (!marpTs) canonCheck = 'skipped（CANON_DIR / --canon が未指定。こちらの規則での検査のみ）';
  else if (bun.status === 0 && fs.existsSync(marpTs)) {
    const code = `import { parseMarp } from ${JSON.stringify(marpTs)}; import { readFileSync } from "node:fs";
      const r = parseMarp(readFileSync(${JSON.stringify(path.join(outDir, mdName))}, "utf8"));
      console.log(JSON.stringify({ n: r.chapters.length, slides: r.slideCount, warnings: r.warnings, chapters: r.chapters.map(c => [c.seq, c.slide, c.koma, c.title, c.script.length]) }));`;
    const r = spawnSync('bun', ['-e', code], { encoding: 'utf8', cwd: o.canon });
    if (r.status !== 0) { err.push(`canon の parser が失敗：${r.stderr.slice(-500)}`); canonCheck = 'failed'; }
    else {
      const res = JSON.parse(r.stdout.trim().split('\n').pop());
      const expSlides = new Set(segs.map((s) => s.i)).size;
      const bad = [];
      res.chapters.forEach(([seq, slide, km, title, nScript]) => {
        const s = segs[seq];
        if (!s) return bad.push(`seq ${seq} が余分`);
        if (title !== (plain(s.title) || s.slideKey)) bad.push(`seq ${seq} 題名 "${title}"`);
        const want = (s.transcript || []).filter((t) => oneLine(t.text)).length;
        if (nScript !== want) bad.push(`seq ${seq} 原稿 ${nScript} 行（期待 ${want}）`);
        if (km !== s.k + 1) bad.push(`seq ${seq} コマ ${km}（期待 ${s.k + 1}）`);
      });
      if (res.n !== segs.length) bad.push(`チャプター ${res.n}（期待 ${segs.length}）`);
      if (res.slides !== expSlides) bad.push(`スライド ${res.slides}（期待 ${expSlides}）`);
      for (const b of bad) err.push('canon parser: ' + b);
      canonCheck = bad.length ? 'mismatch' : `ok（${res.n} チャプター / ${res.slides} スライド、canon の警告 ${res.warnings.length} 件）`;
    }
  } else canonCheck = bun.status !== 0 ? 'skipped（bun がない）' : `skipped（${marpTs} がない）`;

  console.log(`バンドル: ${outDir}`);
  console.log(`  ${mdName}: ${segs.length} ページ / ${new Set(segs.map((s) => s.i)).size} スライド`);
  console.log(`  canon の parser: ${canonCheck}`);
  for (const w of warn) console.warn('  ⚠ ' + w);
  for (const e of err) console.error('  ✗ ' + e);
  console.log(`投入: cd ${o.canon || '<canon のリポジトリ>'} && bun tools/upload-lesson.ts --course <id> --session <n> --bundle ${outDir} --md ${mdName} --movie clips_per_page --stills stills [--dry-run]`);
  if (err.length) process.exit(1);
}

main();
