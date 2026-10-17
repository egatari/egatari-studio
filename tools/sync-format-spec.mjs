// 持ち運べるデッキの形式の仕様（format spec。場所は kit/core/format.mjs の FORMAT.SPEC_URL）から、試験に要る JSON Schema と
// 試験用の入力だけを vendor/format-spec/ に写す。仕様の本文は写さない（リンクする）。写した版は vendor/format-spec/SOURCE.json に残す
//   node tools/sync-format-spec.mjs <仕様のリポジトリの clone> [--ref <commit>]   （既定は HEAD）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'vendor', 'format-spec');
const PARTS = ['schema', 'fixtures', 'LICENSE'];   // Schema・試験用のデータは MIT（LICENSE）

const args = process.argv.slice(2);
const ri = args.indexOf('--ref');
const ref = ri >= 0 ? args[ri + 1] : 'HEAD';
const src = args.find((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
if (!src) { console.error('usage: node tools/sync-format-spec.mjs <path to the spec clone> [--ref <commit>]'); process.exit(2); }

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
fs.writeFileSync(path.join(OUT, 'SOURCE.json'), JSON.stringify({
  repository: FORMAT.SPEC_URL, commit: sha, files: files.length,
  note: 'Copied by tools/sync-format-spec.mjs. Do not edit; change the spec repository and sync again.',
}, null, 2) + '\n');
console.log(`vendor/format-spec: ${files.length} files from ${FORMAT.SPEC_URL} ${sha.slice(0, 7)}`);
