// 持ち運べるデッキの形式の仕様（format spec。場所は kit/core/format.mjs の FORMAT.SPEC_URL）から、試験が読む JSON Schema と
// 試験用の入力だけ（許可リスト。下の PARTS）を FORMAT.VENDOR_DIR（vendor/<名前>-spec/）に写す。仕様の本文は写さない（リンクする）。写した版はその SOURCE.json に残す
//   node tools/sync-spec.mjs <仕様のリポジトリの clone> [--ref <commit か wd-* のタグ>] [--branch <名前>]   （既定は HEAD）
//   --branch：タグでない版（main の次の WD の前など）を写すとき、どの枝から取ったかを SOURCE.json の branch に書く
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'));
// 写すのは試験が読むものだけ（許可リスト。#137）。試験が新しく仕様の写しのファイルを読むようになったら、ここに足す
//   schema：Schema（test-portable・test-file-shape・test-exported-from・test-attachments）
//   fixtures/index：索引の試験用の入力（test-portable・test-file-shape）
//   fixtures/documents-1.0：1.0 の形の文書とその expect.json（test-portable）
//   fixtures/documents/legacy-heading-keys.ega.html：1.0 より前の草案の例（test-app-earlier）。documents/ の残りは 1.0 より前のもので、読まない
//   fixtures/input-hash：入力のハッシュの例（test-narration）
const PARTS = ['schema', 'fixtures/index', 'fixtures/documents-1.0', 'fixtures/documents/legacy-heading-keys.ega.html', 'fixtures/input-hash', 'LICENSE'];   // Schema・試験用のデータは MIT（LICENSE）

const args = process.argv.slice(2);
const ri = args.indexOf('--ref');
const ref = ri >= 0 ? args[ri + 1] : 'HEAD';
const bi = args.indexOf('--branch');
const branch = bi >= 0 ? args[bi + 1] : null;
const src = args.find((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1) && !(bi >= 0 && i === bi + 1));
if (!src) { console.error('usage: node tools/sync-spec.mjs <path to the spec clone> [--ref <commit>]'); process.exit(2); }

const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'buffer', maxBuffer: 64 << 20 });
const sha = git('rev-parse', `${ref}^{commit}`).toString().trim();
const files = git('ls-tree', '-r', '--name-only', sha, '--', ...PARTS).toString().split('\n').filter(Boolean);
if (!files.length) { console.error(`nothing to copy at ${sha}`); process.exit(1); }

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  const dst = path.join(OUT, ...f.split('/'));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, git('show', `${sha}:${f}`));   // バイトのまま（改行も変えない）
}
// 日付の付いた版（annotated tag wd-YYYY-MM-DD）に ちょうど当たるときだけ snapshot に入れる。違えば null
const tags = git('tag', '--points-at', sha).toString().split('\n').filter((t) => /^wd-\d{4}-\d{2}-\d{2}[a-z]?$/.test(t)).sort();
const snapshot = tags.length ? tags[tags.length - 1] : null;
if (!snapshot) console.warn(`warning: ${sha.slice(0, 7)} is not a wd-* snapshot tag; SOURCE.json gets snapshot: null`);
fs.writeFileSync(path.join(OUT, 'SOURCE.json'), JSON.stringify({
  repository: FORMAT.SPEC_URL, commit: sha, snapshot, ...(branch && !snapshot ? { branch, note_ref: `the ${branch} branch at ${sha.slice(0, 7)}, not a tag (wd-*): re-vendor the next wd-* tag at rc prep` } : {}), files: files.length,
  note: 'Copied by tools/sync-spec.mjs. Do not edit; change the spec repository and sync again.',
}, null, 2) + '\n');
console.log(`${FORMAT.VENDOR_DIR}: ${files.length} files from ${FORMAT.SPEC_URL} ${sha.slice(0, 7)}`);
