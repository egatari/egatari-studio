// 見本（examples/）を持ち運べる 1 ファイル（--portable）に組む。編集アプリの配信版（tools/build-app.mjs の dist/examples/）と
// リリースに添えるファイル（tools/release-assets.mjs の out/release/）が同じものを使う
//   buildExamples(outDir) → [{name, file, title, lang, slides, bytes, profile, sha256, sample}]（outDir/<name><FORMAT.FILE_EXT> に書く）
//   sample：サンプルのフォルダの sample.json（テーマは新規作成で選べるもの）（kit/core/sample-info.mjs。「このサンプルのように作る」で引き継ぐもの。backlog #130）。ないか正しくなければ組まない
//   readSample(name) → sample.json の中身（確かめたもの）
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
import { validateSample } from '../kit/core/sample-info.mjs';
import { CATEGORIES, partsList } from '../kit/core/new-deck.mjs';
import { CHOOSABLE } from '../kit/core/themes-list.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 並べる順（はじめの画面の一覧もこの順）
export const EXAMPLES = ['minimal', 'pitch-fictional', 'kokugo-kanbun', 'tmlr2026-calibration'];

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
  const errs = validateSample(obj, { categories: CATEGORIES, parts: partsList(null).flatMap((g) => g.parts) });
  // テーマは新しく選べるもの（サンプルの原稿が選べなくしたテーマ（business）なら、その代わりのテーマ）
  if (!errs.length && !CHOOSABLE.some((t) => t.name === obj.theme)) errs.push({ path: 'theme', code: 'not-choosable' });
  if (errs.length) throw new Error(`example ${name}: sample.json: ${errs.map((e) => `${e.path || '(root)'} ${e.code}`).join(', ')}`);
  return obj;
}

export async function buildExamples(outDir, { names = EXAMPLES, log = () => {} } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-examples-'));
  const list = [];
  try {
    for (const name of names) {
      const dir = path.join(ROOT, 'examples', name);
      if (!fs.existsSync(path.join(dir, 'deck.html'))) throw new Error(`example ${name}: ${path.join(dir, 'deck.html')} not found`);
      const sample = readSample(name);
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
      list.push({ name, file, title: String(m.title || name), lang: String(m.lang || ''), slides: r.stats.slides, bytes: Buffer.byteLength(r.html), profile: r.index.profile,
        sha256: crypto.createHash('sha256').update(r.html).digest('hex'), sample });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return list;
}
