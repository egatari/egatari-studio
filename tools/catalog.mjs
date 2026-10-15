// 部品の一覧（components/CATALOG.md）を、各部品の README.md の先頭（frontmatter）から作る
//   node tools/catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'components');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function front(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const x = line.match(/^([\w-]+):\s*(.*)$/);
    if (x) o[x[1]] = x[2].trim();
  }
  return o;
}

const rows = [];
for (const name of fs.readdirSync(DIR).sort()) {
  const readme = path.join(DIR, name, 'README.md');
  if (!fs.existsSync(readme)) continue;
  const f = front(readme);
  if (!f) { console.warn(`frontmatter がない: ${name}/README.md`); continue; }
  const demo = fs.existsSync(path.join(DIR, name, 'demo.html')) ? `[demo](${name}/demo.html)` : '—';
  rows.push(`| [\`<${cell(f.name)}>\`](${name}/README.md) | ${cell(f.summary)} | ${cell(f.steps)} | ${cell(f.props)} | ${demo} |`);
}
const md = `# 部品の一覧

\`node tools/catalog.mjs\` が各部品の README.md の先頭から作る。手で直さない。

| 部品 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|
${rows.join('\n')}
`;
fs.writeFileSync(path.join(DIR, 'CATALOG.md'), md);
console.log(`components/CATALOG.md: ${rows.length} components`);
