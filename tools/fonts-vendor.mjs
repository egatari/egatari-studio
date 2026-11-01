// npm の包みに入れる字の写し（fonts/@fontsource/<名前>/）を node_modules の @fontsource から作る（#157）
//   node tools/fonts-vendor.mjs          作り直す（npm pack の前に prepack が呼ぶ）
//   node tools/fonts-vendor.mjs --check  写しがあれば node_modules から作るものと同じか（なければ何もしない。gen:check）
// 入れるのは組み立てが読むものだけ：kit/core/build-core.mjs の FONT_LIST の太さ（weights）の {w}.css（斜体のある字体は {w}-italic.css も）、
// そこから参照される woff2（woff は読まない）、OFL の LICENSE、名前と版だけの package.json。@fontsource は devDependencies なので、
// 入れた人は写しだけを使う（kit/build.mjs の fontDir が写し → node_modules の順に探す）。写しはリポジトリに入れない（.gitignore）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_LIST } from '../kit/core/build-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'fonts', '@fontsource');
const require = createRequire(import.meta.url);
const check = process.argv.includes('--check');

// 作るファイル：fonts/@fontsource の下の場所 → 中身
function plan() {
  const files = new Map();
  for (const f of FONT_LIST) {
    const src = path.dirname(require.resolve(`${f.pkg}/package.json`));
    const name = f.pkg.replace(/^@fontsource\//, '');
    const put = (rel, buf) => files.set(`${name}/${rel}`, buf);
    for (const w of f.weights) {
      for (const sfx of f.italic ? ['', '-italic'] : ['']) {
        const css = fs.readFileSync(path.join(src, `${w}${sfx}.css`));
        put(`${w}${sfx}.css`, css);
        for (const m of css.toString('utf8').matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) put(`files/${m[1]}`, fs.readFileSync(path.join(src, 'files', m[1])));
      }
    }
    put('LICENSE', fs.readFileSync(path.join(src, 'LICENSE')));
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    put('package.json', Buffer.from(JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, homepage: pkg.homepage }, null, 2) + '\n'));
  }
  return files;
}
// dir の下のファイル（/ 区切りの場所）
function list(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const want = plan();
const mb = (n) => (n / 1048576).toFixed(1) + ' MiB';
const total = [...want.values()].reduce((s, b) => s + b.length, 0);
if (check) {
  if (!fs.existsSync(OUT)) { console.log('fonts-vendor: fonts/@fontsource はない / not present (npm pack writes it)'); process.exit(0); }
  const have = new Set(list(OUT)), bad = [];
  for (const [rel, buf] of want) if (!have.has(rel)) bad.push('missing ' + rel); else if (!fs.readFileSync(path.join(OUT, rel)).equals(buf)) bad.push('differs ' + rel);
  for (const rel of have) if (!want.has(rel)) bad.push('extra ' + rel);
  if (bad.length) { console.error(`fonts-vendor: fonts/@fontsource が古い / is stale (${bad.length}):\n  ${bad.slice(0, 10).join('\n  ')}\n  直す / fix: node tools/fonts-vendor.mjs`); process.exit(1); }
  console.log(`fonts-vendor: ok (${want.size} files, ${mb(total)})`);
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const [rel, buf] of want) {
    const p = path.join(OUT, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  console.log(`fonts-vendor: ${want.size} files, ${mb(total)} -> ${path.relative(ROOT, OUT)}`);
}
