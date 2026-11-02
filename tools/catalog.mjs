// 部品の一覧（vendor/components/CATALOG.md）を、部品庫の写しの既定の版（components.lock.json）の README.md の先頭（frontmatter）から作る
//   node tools/catalog.mjs           書き直す
//   node tools/catalog.mjs --check   今の CATALOG.md が作り直したものと同じか、かつ全てのリンク先が実在するかを確かめる（違えば終了コード 1。npm test と CI）
//
// リンクは vendor/components/ からの相対パスで書く（CATALOG.md がそこに置かれるため）。部品の写しは components.lock.json に
// content（フォルダ全体の sha256）があれば vendor/components/sha256/<hash>/ に、なければ旧来の vendor/components/<name>/<version>/ に
// ある（resolveComponent が解決する）。版ごとに名前の入った固定のパス（<name>/<version>/）では「もうない」ことがあるので、
// 必ず vendorComponents() が返す実際の dir から相対パスを作る（手で name/version を組み立てない）。
import fs from 'node:fs';
import path from 'node:path';
import { vendorComponents, vendorComponents2, vendorLibrary2, vendorBase, ROOT } from './vendor-components.mjs';

const DIR = vendorBase();
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// DIR から file への相対リンク（GitHub 上でも vendor/components/ 直下に置かれた CATALOG.md から見ても解決するよう、/ 区切りにする）
const link = (file) => path.relative(DIR, file).split(path.sep).join('/');

function front(file) {
  const m = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const x = line.match(/^([\w-]+):\s*(.*)$/);
    if (x) o[x[1]] = x[2].trim();
  }
  return o;
}

function row(name, version, dir) {
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) return null;
  const f = front(readme);
  if (!f) { console.warn(`frontmatter がない: ${name}/${version}/README.md`); return null; }
  const demoFile = path.join(dir, 'demo.html');
  const demo = fs.existsSync(demoFile) ? `[demo](${link(demoFile)})` : '—';
  return `| [\`<${cell(f.name)}>\`](${link(readme)}) | ${cell(version)} | ${cell(f.summary)} | ${cell(f.steps)} | ${cell(f.props)} | ${demo} |`;
}

const rows = [];
for (const { name, version, dir } of vendorComponents()) {
  const r = row(name, version, dir);
  if (r) rows.push(r);
}

// 2.x 専用の要素パーツ（components2.lock.json の既定のカタログ。vendor-components.mjs の注記のとおり、
// 1.x の目録に出ない：components.lock.json で catalogue: "2" の部品のうち kind: "element" のもの）
const { catalogue: catalogue2, parts: parts2 } = vendorComponents2();
const rows2 = [];
for (const { name, version, dir } of parts2) {
  const r = row(name, version, dir);
  if (r) rows2.push(r);
}
// 土台パーツ（kind: "library"）は一覧に出さないが、icons（名前で引く線のアイコン）だけは README への 1 行の言及を添える
const iconsLib = vendorLibrary2(ROOT, 'icons');

const md = `# 部品の一覧

\`node tools/catalog.mjs\` が部品庫の写しの既定の版（\`components.lock.json\`）の README.md の先頭から作る。手で直さない。
部品は [egatari/components](https://github.com/egatari/components) のリリースの写し（\`npm run components:update -- vX.Y.Z\` で取り込む）。

| 部品 | 版 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|---|
${rows.join('\n')}

## 2.x のパーツ（components2.lock.json の既定の版 ${catalogue2}）

1.x の目録にない、2.x 専用の要素パーツ（\`kind: "element"\`）。土台パーツ（\`kind: "library"\`：base・boxplot-core・codetree-core・
expr・heatmap-core・hist-core・icons・kanbun-core・markup-reader・plot・shape）は教材の作者が直接書かないので一覧には出さない。

| 部品 | 版 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|---|
${rows2.join('\n')}

名前で引く線のアイコン（土台パーツ \`icons\`）は[この README](${iconsLib ? link(path.join(iconsLib.dir, 'README.md')) : '?'}) を見る。
`;
const OUT = path.join(DIR, 'CATALOG.md');

// md の中の相対リンク（[...](...)）が、DIR から見て実在するか確かめる。http(s) の外部リンクは見ない。返すもの：見つからないリンクの配列
function brokenLinks(md) {
  const broken = [];
  for (const m of md.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z]+:\/\//i.test(target)) continue;
    if (!fs.existsSync(path.join(DIR, target))) broken.push(target);
  }
  return broken;
}

const broken = brokenLinks(md);
if (broken.length) {
  console.error(`vendor/components/CATALOG.md would contain ${broken.length} broken link(s):`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  // 改行は比べない（Windows の git は CRLF で取り出すことがある）
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === md;
  console.log(same ? `vendor/components/CATALOG.md is up to date (${rows.length} components, all links resolve)` : 'vendor/components/CATALOG.md is out of date: run node tools/catalog.mjs (or npm run gen)');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, md);
console.log(`vendor/components/CATALOG.md: ${rows.length} components, all links resolve`);
