// 部品の一覧（vendor/components/CATALOG.md）を、部品庫の写しの既定の版（components.lock.json）の README.md の先頭（frontmatter）から作る
//   node tools/catalog.mjs           書き直す
//   node tools/catalog.mjs --check   今の CATALOG.md が作り直したものと同じかだけを確かめる（違えば終了コード 1。npm test と CI）
import fs from 'node:fs';
import path from 'node:path';
import { vendorComponents, vendorBase } from './vendor-components.mjs';

const DIR = vendorBase();
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

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

const rows = [];
for (const { name, version, dir } of vendorComponents()) {
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) continue;
  const f = front(readme);
  if (!f) { console.warn(`frontmatter がない: ${name}/${version}/README.md`); continue; }
  const demo = fs.existsSync(path.join(dir, 'demo.html')) ? `[demo](${name}/${version}/demo.html)` : '—';
  rows.push(`| [\`<${cell(f.name)}>\`](${name}/${version}/README.md) | ${cell(version)} | ${cell(f.summary)} | ${cell(f.steps)} | ${cell(f.props)} | ${demo} |`);
}
const md = `# 部品の一覧

\`node tools/catalog.mjs\` が部品庫の写しの既定の版（\`components.lock.json\`）の README.md の先頭から作る。手で直さない。
部品は [egatari/components](https://github.com/egatari/components) のリリースの写し（\`npm run components:update -- vX.Y.Z\` で取り込む）。

| 部品 | 版 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
const OUT = path.join(DIR, 'CATALOG.md');
if (process.argv.includes('--check')) {
  // 改行は比べない（Windows の git は CRLF で取り出すことがある）
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === md;
  console.log(same ? `vendor/components/CATALOG.md is up to date (${rows.length} components)` : 'vendor/components/CATALOG.md is out of date: run node tools/catalog.mjs (or npm run gen)');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, md);
console.log(`vendor/components/CATALOG.md: ${rows.length} components`);
