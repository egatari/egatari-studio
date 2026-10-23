// 写した仕様（vendor/egatari-spec）が、仕様の日付の付いた版（annotated tag wd-YYYY-MM-DD）かを見る。
//   node tools/spec-snapshot.mjs --check     snapshot が null か、形が違えば知らせる（知らせだけ。終了コードは 0。ブランチでは普通）
//   node tools/spec-snapshot.mjs             snapshot の名前を出す
// 写し方は tools/sync-spec.mjs（RELEASING.md の手順 1：候補のタグの前に、最新の wd-* と同じにする）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gha = !!process.env.GITHUB_ACTIONS;
const warn = (msg) => console.log(gha ? `::warning file=${FORMAT.VENDOR_DIR}/SOURCE.json::${msg}` : `warning: ${msg}`);
const src = JSON.parse(fs.readFileSync(path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'), 'SOURCE.json'), 'utf8'));
const snap = src.snapshot;
if (process.argv.includes('--check')) {
  if (snap === undefined) warn(`${FORMAT.VENDOR_DIR}/SOURCE.json has no "snapshot" field; sync again with tools/sync-spec.mjs`);
  else if (snap === null) warn(`${FORMAT.VENDOR_DIR} is spec commit ${String(src.commit).slice(0, 7)}, not a dated snapshot (wd-*). Fine on a branch; before an rc, sync to the latest wd-* tag (RELEASING.md step 1)`);
  else if (!/^wd-\d{4}-\d{2}-\d{2}$/.test(snap)) warn(`snapshot "${snap}" is not of the form wd-YYYY-MM-DD`);
  else console.log(`ok   spec snapshot ${snap} (${String(src.commit).slice(0, 7)})`);
} else console.log(snap ?? 'null');
