// 編集アプリ（app/）を組む：dist/ の根に配信版（GitHub Pages などで配る形。dist/index.html）と dist/editor.html（1 ファイル版）。説明は docs/editor.md
// 試験ページ lab/ も dist/lab/ にそのまま写す（lab/irodori.html：ブラウザだけで Irodori-TTS を動かす）
// dist/editor/index.html は、前の場所（/editor/）からの古いリンクを根へ送る（問い合わせと # はそのまま）。
// どのパスも相対なので、サイトの根（https://editor.egatari.org/）でも下のパス（https://egatari.github.io/egatari-studio/）でも動く
//   node tools/build-app.mjs [--out dist] [--no-single]
// アプリに入れるもの：kit/core（組み立ての本体と持ち運べる 1 ファイルの読み書き）・持ち運べる 1 ファイルを読む Worker・KaTeX・parse5・kit の実行系・components/*/index.js・themes/*・
// server/hints.js（プレビューの中の知らせの部品。編集の画面 server/editor-ui.js は main.js と一緒に組む）・@fontsource の BIZ UDPゴシックと Source Sans 3（400・700）。
// 字の分割ファイル（woff2）は、配信版では fonts/ に置いて使う分だけ読み、1 ファイル版では全部を埋め込む（約 12 MB）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'dist'));
const SINGLE = !args.includes('--no-single');
const rel = (...p) => path.join(ROOT, ...p);

// ---------------------------------------------------------------- 資源を集める（場所はアプリの中の仮の場所 /repo/…）
const text = {}, b64 = {}, lazy = [], lazyFiles = {};
const TEXT_EXT = /\.(css|js|json|svg|txt|md|tex)$/i;
function add(virt, file) {
  if (TEXT_EXT.test(file)) text[virt] = fs.readFileSync(file, 'utf8');
  else b64[virt] = fs.readFileSync(file).toString('base64');
}
function addTree(virtDir, dir, filter = () => true) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) addTree(virtDir + '/' + e.name, f, filter);
    else if (filter(f)) add(virtDir + '/' + e.name, f);
  }
}
// kit の実行系（.js .css。Node の .mjs は入れない）
for (const f of fs.readdirSync(rel('kit'))) if (/\.(js|css)$/.test(f)) add('/repo/kit/' + f, rel('kit', f));
// 部品：components/<名前>/index.js
const components = [];
for (const d of fs.readdirSync(rel('components'), { withFileTypes: true })) {
  if (d.isDirectory() && fs.existsSync(rel('components', d.name, 'index.js'))) { add(`/repo/components/${d.name}/index.js`, rel('components', d.name, 'index.js')); components.push(d.name); }
}
// テーマ（ロゴも）
const themes = [];
for (const d of fs.readdirSync(rel('themes'), { withFileTypes: true })) {
  if (!d.isDirectory() || !fs.existsSync(rel('themes', d.name, 'tokens.css'))) continue;
  themes.push(d.name); addTree('/repo/themes/' + d.name, rel('themes', d.name));
}
themes.sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
// KaTeX：CSS・実行時の JS（SVG の中の式）・字（woff2 だけ）
const kdir = path.dirname(require.resolve('katex'));
add('/repo/katex/katex.min.css', path.join(kdir, 'katex.min.css'));
add('/repo/katex/katex.min.js', path.join(kdir, 'katex.min.js'));
for (const f of fs.readdirSync(path.join(kdir, 'fonts'))) if (f.endsWith('.woff2')) add('/repo/katex/fonts/' + f, path.join(kdir, 'fonts', f));
// 字：@fontsource の 400・700 の CSS と、そこから参照される woff2（あとで読む）
for (const pkg of ['@fontsource/biz-udpgothic', '@fontsource/source-sans-3']) {
  const dir = path.dirname(require.resolve(`${pkg}/package.json`));
  for (const w of [400, 700]) {
    const css = fs.readFileSync(path.join(dir, `${w}.css`), 'utf8');
    text[`/repo/fonts/${pkg}/${w}.css`] = css;
    for (const m of css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
      const v = `/repo/fonts/${pkg}/files/${m[1]}`;
      if (!lazyFiles[v]) { lazy.push(v); lazyFiles[v] = path.join(dir, 'files', m[1]); }
    }
  }
}
const hints = fs.readFileSync(rel('server', 'hints.js'), 'utf8');
const version = JSON.parse(fs.readFileSync(rel('package.json'), 'utf8')).version || '';
for (const [name, s] of [['server/hints.js', hints], ['app/frame-shim.js', fs.readFileSync(rel('app', 'frame-shim.js'), 'utf8')]]) {
  // デッキの <script> の中にそのまま入れるので、</script と <!-- を含んではいけない
  if (/<\/script|<!--/i.test(s)) throw new Error(`${name} contains </script or <!-- (cannot be inlined)`);
}
const resources = { version, text, b64, lazy, hints, themes, components };

// ---------------------------------------------------------------- 組む（esbuild）
// 持ち運べる 1 ファイルを読む Worker（app/portable-worker.js）：先に 1 本にまとめ、main.js に文字列（virtual:portable-worker）で入れる。
// アプリは Blob の URL から Worker を作る（1 ファイル版の file:// でも動く。CSP は worker-src blob:）
const W = await esbuild.build({
  entryPoints: [rel('app', 'portable-worker.js')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['chrome110', 'edge110'], legalComments: 'none', charset: 'utf8', logLevel: 'warning', conditions: ['import', 'browser', 'default'],
});
const workerJs = W.outputFiles[0].text;
// 開いたデッキを組み・判定する Worker（app/build-worker.js）も同じように（virtual:build-worker。期限を過ぎたら止める。app/build-client.js）
const BW = await esbuild.build({
  entryPoints: [rel('app', 'build-worker.js')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['chrome110', 'edge110'], legalComments: 'none', charset: 'utf8', logLevel: 'warning', conditions: ['import', 'browser', 'default'],
});
const buildWorkerJs = BW.outputFiles[0].text;
const plugin = {
  name: 'app',
  setup(b) {
    b.onResolve({ filter: /^virtual:resources$/ }, () => ({ path: 'resources', namespace: 'virtual' }));
    b.onResolve({ filter: /^virtual:portable-worker$/ }, () => ({ path: 'portable-worker', namespace: 'virtual' }));
    b.onResolve({ filter: /^virtual:build-worker$/ }, () => ({ path: 'build-worker', namespace: 'virtual' }));
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, (a) => ({ contents: 'export default ' + JSON.stringify(a.path === 'portable-worker' ? workerJs : a.path === 'build-worker' ? buildWorkerJs : resources), loader: 'js' }));
    b.onResolve({ filter: /\?text$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?text$/, '')), namespace: 'text' }));
    b.onLoad({ filter: /.*/, namespace: 'text' }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').trim(), loader: 'text' }));
  },
};
const r = await esbuild.build({
  entryPoints: [rel('app', 'main.js')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['chrome110', 'edge110'], plugins: [plugin], legalComments: 'none', charset: 'utf8', logLevel: 'warning',
  conditions: ['import', 'browser', 'default'],
});
let js = r.outputFiles[0].text;
const css = fs.readFileSync(rel('app', 'app.css'), 'utf8');
const html = fs.readFileSync(rel('app', 'index.html'), 'utf8');
const NOTICE = `/* Egatari Studio ${version} — https://github.com/egatari/egatari-studio (MIT). Bundles KaTeX (MIT), parse5 (MIT), BIZ UDPGothic and Source Sans 3 (SIL OFL 1.1). */\n`;

// 配信版：dist/ の根。前の組み立ての残り（前の形の dist/editor/ も）を消してから書く
const ED = OUT;
fs.mkdirSync(ED, { recursive: true });
for (const f of ['index.html', 'app.js', 'app.css', 'fonts', 'editor', 'lab', 'LICENSE.txt', 'NOTICE.txt', '.nojekyll']) fs.rmSync(path.join(ED, f), { recursive: true, force: true });
fs.writeFileSync(path.join(ED, 'app.js'), NOTICE + js);
fs.writeFileSync(path.join(ED, 'app.css'), css);
fs.writeFileSync(path.join(ED, 'index.html'), html.replace('<!--APP_CSS-->', '<link rel="stylesheet" href="app.css">').replace('<!--APP_JS-->', '<script src="app.js"></script>'));
fs.writeFileSync(path.join(ED, '.nojekyll'), '');
let fontBytes = 0;
for (const [v, f] of Object.entries(lazyFiles)) {
  const to = path.join(ED, v.replace(/^\/repo\//, ''));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(f, to);
  fontBytes += fs.statSync(f).size;
}
for (const f of ['LICENSE', 'NOTICE']) if (fs.existsSync(rel(f))) fs.copyFileSync(rel(f), path.join(ED, f + '.txt'));
// 試験ページ（lab/）：そのまま写す（静的なファイルだけ。重みは実行時に Hugging Face から取る）
const LAB = path.join(OUT, 'lab');
if (fs.existsSync(rel('lab'))) fs.cpSync(rel('lab'), LAB, { recursive: true, filter: (f) => !path.basename(f).startsWith('.') });
// 前の場所 editor/ からは根へ（問い合わせ ?lang=en と # を残す）。スクリプトが動かなくても meta refresh とリンクで行ける
fs.mkdirSync(path.join(OUT, 'editor'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'editor', 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Egatari Studio</title>
<script>try { var u = new URL('../', location.href); u.search = location.search; u.hash = location.hash; location.replace(u.href); } catch (e) {}</script>
<meta http-equiv="refresh" content="0; url=../">
<link rel="canonical" href="../">
</head>
<body><p>The editor has moved to <a href="../">the top of this site</a>. / 編集器は<a href="../">このサイトの最上位</a>に移りました。</p></body>
</html>
`);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`dist/ (hosted editor): app.js ${kb(js.length)} (reader worker ${kb(workerJs.length)}), fonts ${lazy.length} files ${kb(fontBytes)} -> ${ED}`);

// 1 ファイル版：dist/editor.html（字を全部埋め込む）
if (SINGLE) {
  const inline = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  const pack = {};
  for (const [v, f] of Object.entries(lazyFiles)) pack[v] = fs.readFileSync(f).toString('base64');
  const one = html
    .replace('<!--APP_CSS-->', () => `<style>\n${css}</style>`)
    .replace('<!--APP_JS-->', () => `<script>window.__FONTPACK=${JSON.stringify(pack)};</script>\n<script>${inline(NOTICE + js)}</script>`);
  fs.writeFileSync(path.join(OUT, 'editor.html'), one);
  console.log(`dist/editor.html: ${kb(one.length)} (fonts embedded)`);
}
