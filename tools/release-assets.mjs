// リリースに添えるファイルを out/release/ に組む（上げるのは人の手で。このスクリプトはどこにも上げない）
//   node tools/release-assets.mjs [--out out/release]
// 作るもの：見本の持ち運べる 1 ファイル（examples/<名前> を --portable で。tools/examples-portable.mjs。編集アプリの dist/examples/ と同じもの）と、
// その一覧 examples.json（名前・題名・言語・枚数・大きさ・sha256）。
// リリースの手順（RELEASING.md。docs/editor.md の「見本」も）：node tools/changelog.mjs --release で版を上げて CHANGELOG をまとめた後に
//   1. node tools/release-assets.mjs
//   2. gh release create v<版> out/release/* --notes-file <その版の CHANGELOG>   （または GitHub の画面で out/release/ のファイルを添える）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamples } from './examples-portable.mjs';
import { generate, makeSkillZip } from './make-llm-guide.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'out', 'release'));
fs.rmSync(OUT, { recursive: true, force: true });
const list = await buildExamples(OUT, { log: (m) => console.warn(m) });
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '';
for (const lang of ['ja', 'en']) {
  const file = `egatari-make-${version}-${lang}.zip`;
  fs.writeFileSync(path.join(OUT, file), makeSkillZip(generate({ skillLang: lang }).files));
  console.log(file);
}
fs.writeFileSync(path.join(OUT, 'examples.json'), JSON.stringify({ version, examples: list }, null, 2) + '\n');
for (const x of list) console.log(`${x.file}: ${x.slides} slides, ${(x.bytes / 1024).toFixed(0)} KB, ${x.profile}`);
console.log(`release assets (not uploaded) -> ${OUT}`);
