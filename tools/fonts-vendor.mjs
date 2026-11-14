// npm の包みに入れる字の写しを node_modules の @fontsource から作る（#157・#176）
//   egatari：fonts/@fontsource/<名前>/（既定の 3 つ：BIZ UDPゴシック・BIZ UDP明朝・Source Sans 3 と、同梱のテーマが使う Zen Maru Gothic（asagi）・Fraunces（kinari の見出し））
//   @egatari/fonts-extra：packages/fonts-extra/@fontsource/<名前>/（FONT_LIST の extra の 6 つ。packages/fonts-extra の prepack も呼ぶ）
//   node tools/fonts-vendor.mjs          作り直す（npm pack の前に prepack が呼ぶ。同じなら書かない。違えば隣の一時のフォルダに書いて入れ替える）
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
const TARGETS = [
  { out: path.join(ROOT, 'fonts', '@fontsource'), fonts: FONT_LIST.filter((f) => !f.extra) },
  { out: path.join(ROOT, 'packages', 'fonts-extra', '@fontsource'), fonts: FONT_LIST.filter((f) => f.extra) },
];
const require = createRequire(import.meta.url);
const check = process.argv.includes('--check');

// 作るファイル：<out> の下の場所 → 中身
function plan(fonts) {
  const files = new Map();
  for (const f of fonts) {
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

const mb = (n) => (n / 1048576).toFixed(1) + ' MiB';
let failed = false;
for (const { out: OUT, fonts } of TARGETS) {
  const want = plan(fonts);
  const total = [...want.values()].reduce((s, b) => s + b.length, 0);
  const where = path.relative(ROOT, OUT).split(path.sep).join('/');
  // 写しと作るものの違い（ないときは null）
  const stale = () => {
    if (!fs.existsSync(OUT)) return null;
    const have = new Set(list(OUT)), bad = [];
    for (const [rel, buf] of want) if (!have.has(rel)) bad.push('missing ' + rel); else if (!fs.readFileSync(path.join(OUT, rel)).equals(buf)) bad.push('differs ' + rel);
    for (const rel of have) if (!want.has(rel)) bad.push('extra ' + rel);
    return bad;
  };
  if (check) {
    const bad = stale();
    if (!bad) { console.log(`fonts-vendor: ${where} はない / not present (npm pack writes it)`); continue; }
    if (bad.length) { failed = true; console.error(`fonts-vendor: ${where} が古い / is stale (${bad.length}):\n  ${bad.slice(0, 10).join('\n  ')}\n  直す / fix: node tools/fonts-vendor.mjs`); continue; }
    console.log(`fonts-vendor: ${where} ok (${want.size} files, ${mb(total)})`);
  } else if (stale()?.length === 0) {
    // 同じなら書き直さない（npm test の test-npm-pack と同時に組む段が、消している途中の写しを読まないように）
    console.log(`fonts-vendor: up to date (${want.size} files, ${mb(total)}) -> ${where}`);
  } else {
    // 隣の一時のフォルダに書いてから入れ替える：組み立て（kit/build.mjs の fontDir）は、書きかけの写しを見ず、写しか node_modules（同じ中身）を読む
    const tmpOut = path.join(path.dirname(OUT), `.@fontsource-${process.pid}`);
    fs.rmSync(tmpOut, { recursive: true, force: true });
    for (const [rel, buf] of want) {
      const p = path.join(tmpOut, ...rel.split('/'));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.renameSync(tmpOut, OUT);
    console.log(`fonts-vendor: ${want.size} files, ${mb(total)} -> ${where}`);
  }
}
if (failed) process.exit(1);
