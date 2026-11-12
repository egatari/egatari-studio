// 見本（examples/）を持ち運べる 1 ファイル（--portable）に組む。編集アプリの配信版（tools/build-app.mjs の dist/examples/）と
// リリースに添えるファイル（tools/release-assets.mjs の out/release/）が同じものを使う
//   buildExamples(outDir) → [{name, file, title, lang, slides, bytes, profile, sha256, sample, book}]（outDir/<name><FORMAT.FILE_EXT> に書く。book：本（article）を持つか）
//   sample：サンプルのフォルダの sample.json（テーマは何でもよい。引き継ぐのは同梱の選べるテーマだけで、ほかは default：kit/core/new-deck-pack.mjs の sampleTheme）（kit/core/sample-info.mjs。「このサンプルを参考に作る」で引き継ぐもの。backlog #130）。ないか正しくなければ組まない
//   readSample(name) → sample.json の中身（確かめたもの）
// 本のあるサンプル（heikin-chuouchi・rashomon）は egatari/examples の books/<名前> の写し（SOURCE.json にリポジトリとコミットと各ファイルの sha256。直さず、元を直して写し直す）
// 見本には音声がない（audio/ はリポジトリに入れない）ので、音声なしの 1 ファイルになる（再生は推定の秒数。TTS も dry-run の無音も作らない）。
// 組むのは見本のフォルダの写し（一時フォルダ）から：リポジトリの見本に設定のファイル（egatari.json）を書かない。設定のファイルのない見本
// （minimal は新しいデッキの雛形にしてよいので docId を持たせない）には、名前から決めた docId を与える（組むたびに同じ文書）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPortable, writeOutput } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { sampleProblems } from '../kit/core/new-deck-pack.mjs';
import { readIndex } from './examples-sync.mjs';
import { CATEGORIES } from '../kit/core/new-deck.mjs';

// パーツの札：既定のカタログの manifest のパーツ（教材が自分で定義したものは札にしない）と、その段（特殊・専門を先に並べる）
const LOCK2 = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'components2.lock.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'vendor', 'components-2', `manifest-${LOCK2.default}.json`), 'utf8'));
const LIBRARY_TAGS = new Set(Object.entries(MANIFEST.components).filter(([, c]) => c.kind === 'element').map(([n, c]) => c.tag || 'm-' + n));
const TIER_OF = new Map(Object.entries(MANIFEST.components).filter(([, c]) => c.kind === 'element').map(([n, c]) => [c.tag || 'm-' + n, c.tier]));
const TIER_RANK = (t) => ({ extra: 0, specialized: 1 })[TIER_OF.get(t)] ?? 2;
// 場面の 1 行：sample.json の分類と小分類（新規作成 ① の言葉）
const sceneOf = (s) => {
  const c = s && CATEGORIES.find((x) => x.id === s.category);
  const sub = c && c.subs.find((x) => x.id === s.subcategory);
  return sub ? sub.label : c ? c.label : null;
};

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 並べる順と区分（はじめの画面の一覧もこの順）：examples/index.json（tools/examples-sync.mjs が写しと区分を確かめる）
export const INDEX = readIndex();
export const EXAMPLES = INDEX.examples.map((e) => e.name);
export const SECTIONS = INDEX.sections;
// 区分の中の小見出しの決まり（教科の順と最低件数。kit/core/sample-layout.mjs）
export const GROUPING = { subjects: INDEX.subjects || [], subjectLabels: INDEX.subjectLabels || {}, grouping: INDEX.grouping || {} };
// 「このサンプルを参考に作る」と ?from-sample= に使えるもの（fromSample: false のパーツ図鑑は再生だけ）
export const FROM_SAMPLE = INDEX.examples.filter((e) => e.fromSample !== false).map((e) => e.name);
export const sectionOf = (name) => (INDEX.examples.find((e) => e.name === name) || {}).section;

// 名前から決めた docId（小文字の UUID の形。版 4・変種 RFC 4122 の桁にそろえる）
export function exampleDocId(name) {
  const h = crypto.createHash('sha256').update('egatari-studio example: ' + name).digest('hex').split('');
  h[12] = '4'; h[16] = '89ab'[parseInt(h[16], 16) & 3];
  const x = h.join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// 名前から決めた乱数（rand(n) → n バイト。kit/core/narration-core.mjs の newSlideId に渡す）：sha256 を数え上げで伸ばす
export function exampleRand(name) {
  let i = 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let o = 0; o < n; o += 32) out.set(crypto.createHash('sha256').update(`egatari-studio example ids: ${name}: ${i++}`).digest().subarray(0, n - o), o);
    return out;
  };
}

// サンプルの情報（sample.json）：使う場面の分類と、新規作成の ④ に並ぶパーツに照らして確かめる
export function readSample(name) {
  const file = path.join(ROOT, 'examples', name, 'sample.json');
  if (!fs.existsSync(file)) throw new Error(`example ${name}: ${file} not found`);
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errs = sampleProblems(obj);   // 分類・④ のパーツ・新しく選べるテーマに照らす（kit/core/new-deck-pack.mjs。コマンドの --from-sample と同じ）
  if (errs.length) throw new Error(`example ${name}: sample.json: ${errs.map((e) => `${e.path || '(root)'} ${e.code}`).join(', ')}`);
  return obj;
}

// カードの表紙の絵（tools/example-covers.mjs が作る examples/_covers/<名前>.webp）を <名前>.cover.webp として横に置く。なければ null（カードは題名だけ）
function copyCover(name, outDir) {
  const from = path.join(ROOT, 'examples', '_covers', name + '.webp');
  if (!fs.existsSync(from)) return null;
  const file = name + '.cover.webp';
  fs.copyFileSync(from, path.join(outDir, file));
  return file;
}

// 1 回の試験の間だけ使う組んだサンプルの置き場（tools/test-all.mjs が EGATARI_EXAMPLES_CACHE に一時のフォルダを渡す。d5 11/12）。
// サンプルを組むと 17 本で 70 秒前後かかり、編集アプリの試験の多くが build-app を自分で呼ぶので、同じ入力なら 1 回だけ組んで写す。
// 鍵は入力の中身の sha256（examples/ の原稿・組み立てが使う kit/・vendor/・themes/・package-lock.json と、名前・covers）：
// どれか 1 バイトでも変われば鍵が変わり、組み直す（古いサンプルで試験が通ることはない）。変数がなければ置き場を使わず、いつも組む
export const EXAMPLE_INPUTS = ['examples', 'kit', 'vendor', 'themes', 'package-lock.json'];
export function examplesKey({ root = ROOT, names = EXAMPLES, covers = false, inputs = EXAMPLE_INPUTS } = {}) {
  const h = crypto.createHash('sha256').update(JSON.stringify({ names, covers }));
  const walk = (rel) => {
    const abs = path.join(root, rel);
    let st;
    try { st = fs.lstatSync(abs); } catch { h.update(`missing ${rel}\n`); return; }
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(abs).sort()) { if (n === 'out' || n.startsWith('.')) continue; walk(path.join(rel, n)); }
    } else if (st.isFile()) { h.update(`${rel.split(path.sep).join('/')}\n`); h.update(fs.readFileSync(abs)); }
  };
  for (const r of inputs) walk(r);
  return h.digest('hex').slice(0, 32);
}

// covers：サムネイルを横に置く（編集アプリの dist/examples/。リリースの添付（tools/release-assets.mjs）には置かない）
export async function buildExamples(outDir, { names = EXAMPLES, log = () => {}, covers = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const cacheRoot = process.env.EGATARI_EXAMPLES_CACHE;
  const cached = cacheRoot ? path.join(cacheRoot, examplesKey({ names, covers })) : null;
  const done = () => cached && fs.existsSync(path.join(cached, 'list.json'));
  const copy = () => {
    fs.cpSync(cached, outDir, { recursive: true, filter: (f) => path.relative(cached, f) !== 'list.json' });
    log(`  examples: copied from the shared build ${path.basename(cached)}`);
    return JSON.parse(fs.readFileSync(path.join(cached, 'list.json'), 'utf8'));
  };
  if (done()) return copy();
  // 同時に始まった試験は、先に組み始めたもの（印のフォルダ .lock を作れたもの）を待つ。印が消えても置き場にない（組めなかった）なら自分で組む。
  // 待つのは 20 分まで（TEST_TIMEOUT_SCALE 倍）。過ぎたら自分で組む
  let mine = false;
  if (cached) {
    fs.mkdirSync(cacheRoot, { recursive: true });
    try { fs.mkdirSync(cached + '.lock'); mine = true; } catch {
      const until = Date.now() + 20 * 60000 * (Number(process.env.TEST_TIMEOUT_SCALE) > 0 ? Number(process.env.TEST_TIMEOUT_SCALE) : 1);
      while (!done() && fs.existsSync(cached + '.lock') && Date.now() < until) await new Promise((r) => setTimeout(r, 500));
      if (done()) return copy();
    }
  }
  let list;
  try { list = await buildExamplesNow(outDir, { names, log, covers }); } catch (e) { if (mine) fs.rmSync(cached + '.lock', { recursive: true, force: true }); throw e; }
  if (cached) {
    // 同時に組んだほかの試験と競っても壊れないように、別の名前に写してから名前を変える（先に置かれていればこちらを捨てる）
    const part = `${cached}.part-${process.pid}-${Date.now()}`;
    try {
      fs.cpSync(outDir, part, { recursive: true });
      fs.writeFileSync(path.join(part, 'list.json'), JSON.stringify(list));
      fs.renameSync(part, cached);
    } catch { fs.rmSync(part, { recursive: true, force: true }); }
    if (mine) fs.rmSync(cached + '.lock', { recursive: true, force: true });
  }
  return list;
}

async function buildExamplesNow(outDir, { names, log, covers }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-examples-'));
  const list = [];
  try {
    for (const name of names) {
      const dir = path.join(ROOT, 'examples', name);
      if (!fs.existsSync(path.join(dir, 'deck.html'))) throw new Error(`example ${name}: ${path.join(dir, 'deck.html')} not found`);
      const entry = INDEX.examples.find((e) => e.name === name) || { name, section: '' };
      // fromSample: false（パーツ図鑑）は再生だけ：sample.json を読まない（「このサンプルを参考に作る」も ?from-sample= も出ない）
      const sample = entry.fromSample === false ? null : readSample(name);
      const copy = path.join(tmp, name);
      fs.cpSync(dir, copy, { recursive: true, filter: (f) => { const r = path.relative(dir, f); return !r.split(path.sep).some((s) => s === 'out' || s.startsWith('.')); } });
      const cfg = path.join(copy, FORMAT.CONFIG_FILE);
      if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify({ docId: exampleDocId(name) }, null, 2) + '\n');
      const file = name + FORMAT.FILE_EXT, out = path.join(outDir, file);
      const src = path.join(copy, 'deck.html');
      // id のないスライド（minimal・tmlr2026 の原稿は id を持たない）に書き出しが付ける id も、名前から決めた乱数で（組むたびに同じ文書）
      fs.rmSync(path.join(copy, 'sample.json'), { force: true });   // 教材の中身ではない（一覧に載せる）
      const r = await buildPortable(src, { out, idRand: exampleRand(name), fromFolder: false });
      writeOutput(src, out, r.html);
      for (const w of r.warnings) log(`  ⚠ example ${name}: ${w}`);
      const m = r.index.metadata || {};
      // カードの印：本（本を持つ）・声（AI 音声か録音を持つ。サンプルは音声をリポジトリに入れないので、いまは付かない）・
      // ライブ（投票の id を持つパーツ）・縦書き（layout-tate のスライド）。言語の印は画面の言語と違うときに画面が付ける
      // パーツライブラリのパーツだけ（教材が自分で定義したものは札にしない）。札は 3 つまでなので、その教材らしいもの（特殊・専門）を標準より先に
      const parts = (r.stats.components || []).filter((t) => LIBRARY_TAGS.has(t)).map((t, i) => [t, i]).sort((a, b) => TIER_RANK(a[0]) - TIER_RANK(b[0]) || a[1] - b[1]).map(([t]) => t);
      const deckSrc = fs.readFileSync(path.join(copy, 'deck.html'), 'utf8');
      const tate = /\blayout-tate\b/.test(deckSrc);
      // ライブ：ライブの授業のために作った教材（パーツに投票の id poll="…" がある）。m-predict だけならライブなしでも使えるので付けない
      const live = /\bpoll="[^"]+"/.test(deckSrc);
      list.push({ name, file, title: String(m.title || name), lang: String(m.lang || ''), slides: r.stats.slides, bytes: Buffer.byteLength(r.html), profile: r.index.profile,
        sha256: crypto.createHash('sha256').update(r.html).digest('hex'), sample, book: !!r.index.article,
        section: entry.section, ...(entry.group ? { group: entry.group } : {}), ...(entry.subject ? { subject: entry.subject } : {}), scene: sceneOf(sample), parts,
        voice: (r.stats.audio || 0) > 0, live, tate, cover: covers ? copyCover(name, outDir) : null });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return list;
}
