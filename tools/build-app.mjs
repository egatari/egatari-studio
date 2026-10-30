// 編集アプリ（app/）を組む：dist/ の根に配信版（GitHub Pages などで配る形。dist/index.html）と dist/editor.html（1 ファイル版）。説明は docs/editor.md
// 試験ページ lab/ も dist/lab/ にそのまま写す（lab/irodori.html：ブラウザだけで Irodori-TTS を動かす）
// dist/editor/index.html は、前の場所（/editor/）からの古いリンクを根へ送る（問い合わせと # はそのまま）。
// どのパスも相対なので、サイトの根（https://studio.egatari.org/）でも下のパス（https://egatari.github.io/egatari-studio/）でも動く
//   node tools/build-app.mjs [--out dist] [--no-single] [--no-examples]
// 見本：examples/ の見本を持ち運べる 1 ファイルに組んで dist/examples/<名前><FORMAT.FILE_EXT> に置き（tools/examples-portable.mjs）、
// その一覧をアプリに入れる（はじめの画面の「見本の教材」が同じ場所から読み、ほかのファイルと同じ道で開く）
// アプリに入れるもの：kit/core（組み立ての本体と持ち運べる 1 ファイルの読み書き）・持ち運べる 1 ファイルを読む Worker・KaTeX・parse5・kit の実行系・部品庫の写し（vendor/components/sha256/*/index.js と components.lock.json）・themes/*（と前の版の写し vendor/themes/、themes.lock.json）・
// server/hints.js（プレビューの中の知らせの部品。編集の画面 server/editor-ui.js は main.js と一緒に組む）・@fontsource の BIZ UDPゴシックと Source Sans 3（400・700）、配信版だけ BIZ UDP明朝。
// 字の分割ファイル（woff2）は、配信版では fonts/ に置いて使う分だけ読み、1 ファイル版では全部を埋め込む（約 12 MB）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { FORMAT } from '../kit/core/format.mjs';
import { parseYomiTerms } from '../kit/core/yomi.mjs';
import { RUNTIME_MODULES, RUNTIME_NAMESPACES } from '../kit/core/build-core.mjs';
import { PLAYER_JSON, PLAYER_LOCK, PLAYER_FILES } from '../kit/core/player.mjs';
import { buildExamples } from './examples-portable.mjs';
import { vendorComponents, appComponentFiles, componentLicenseFiles } from './vendor-components.mjs';
import { excludedFromThemeHash } from '../kit/core/themes-lock.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'dist'));
const SINGLE = !args.includes('--no-single');
const EXAMPLES = !args.includes('--no-examples');
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
// 実行系に入れる kit/core の ES モジュール（build-core の RUNTIME_MODULES。classicModule が DECK.PositionStore などにする。組み立てが字として読む）
for (const f of [...Object.keys(RUNTIME_MODULES), ...Object.keys(RUNTIME_NAMESPACES)]) text['/repo/kit/' + f] = fs.readFileSync(rel('kit', ...f.split('/')), 'utf8');
// 部品：content 表が指す写し vendor/components/sha256/<hash>/index.js（同じ写しは 1 回だけ）と components.lock.json（tools/vendor-components.mjs）
const components = vendorComponents(ROOT).map((c) => c.name);
for (const [virt, file] of appComponentFiles(ROOT)) add(virt, file);
// テーマ（ロゴも）
const themes = [];
for (const d of fs.readdirSync(rel('themes'), { withFileTypes: true })) {
  if (!d.isDirectory() || !fs.existsSync(rel('themes', d.name, 'tokens.css'))) continue;
  themes.push(d.name); addTree('/repo/themes/' + d.name, rel('themes', d.name), (f) => !excludedFromThemeHash(path.relative(rel('themes', d.name), f)));
}
themes.sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
// 同梱のテーマの版の固定（themes.lock.json）と前の版の写し（vendor/themes/<名前>/<版>/。教材が記録した版で組み直す。kit/core/themes-lock.mjs）
if (fs.existsSync(rel('themes.lock.json'))) add('/repo/themes.lock.json', rel('themes.lock.json'));
// 説明の文書（テーマのフォルダの最上位の README*・LICENSE*・*.md）はテーマの一部でないので入れない（kit/core/themes-lock.mjs の excludedFromThemeHash）
if (fs.existsSync(rel('vendor', 'themes'))) addTree('/repo/vendor/themes', rel('vendor', 'themes'), (f) => !excludedFromThemeHash(path.relative(rel('vendor', 'themes'), f).split(path.sep).slice(2).join('/')));
// KaTeX：CSS・実行時の JS（SVG の中の式）・字（woff2 だけ）
const kdir = path.dirname(require.resolve('katex'));
add('/repo/katex/katex.min.css', path.join(kdir, 'katex.min.css'));
add('/repo/katex/katex.min.js', path.join(kdir, 'katex.min.js'));
for (const f of fs.readdirSync(path.join(kdir, 'fonts'))) if (f.endsWith('.woff2')) add('/repo/katex/fonts/' + f, path.join(kdir, 'fonts', f));
// 字：@fontsource の 400・700 の CSS と、そこから参照される woff2（あとで読む）。
// BIZ UDP明朝（明朝を使うデッキだけが読む）は配信版にだけ入れる。1 ファイル版に埋め込むと約 11 MB 増えるので、1 ファイル版の
// アプリは明朝を知らずに組む（明朝を使うデッキは、開く端末の明朝で表示されると知らせる。kit/core/build-core.mjs の fontCss）
const MINCHO = '@fontsource/biz-udpmincho';
for (const pkg of ['@fontsource/biz-udpgothic', '@fontsource/source-sans-3', MINCHO]) {
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
for (const [name, s] of [['server/hints.js', hints], ['app/frame-shim.js', fs.readFileSync(rel('app', 'frame-shim.js'), 'utf8')], ['kit/core/layout-scan.mjs', fs.readFileSync(rel('kit', 'core', 'layout-scan.mjs'), 'utf8')]]) {
  // デッキの <script> の中にそのまま入れるので、</script と <!-- を含んではいけない（layout-scan は仲立ちに包んで入れる）
  if (/<\/script|<!--/i.test(s)) throw new Error(`${name} contains </script or <!-- (cannot be inlined)`);
}
// 読み辞書（tts/yomi.yaml の terms と、その sha256。音声の板のブラウザの TTS が、tts/yomi.py と同じ規則で使う。kit/core/yomi.mjs）
const yomiText = fs.readFileSync(rel('tts', 'yomi.yaml'), 'utf8');
const yomi = { terms: parseYomiTerms(yomiText), sha256: crypto.createHash('sha256').update(fs.readFileSync(rel('tts', 'yomi.yaml'))).digest('hex') };
// 見本の持ち運べる 1 ファイル（dist/examples/。前の組み立ての残りは消してから書く）
fs.rmSync(path.join(OUT, 'examples'), { recursive: true, force: true });
const examples = EXAMPLES ? await buildExamples(path.join(OUT, 'examples'), { log: (m) => console.warn(m) }) : [];
// 従う仕様の日付の版（vendor/egatari-spec/SOURCE.json の snapshot。日付の付いた版でなければ null）
const specSnapshot = (() => { try { return JSON.parse(fs.readFileSync(rel(...FORMAT.VENDOR_DIR.split('/'), 'SOURCE.json'), 'utf8')).snapshot || null; } catch { return null; } })();
// 同梱の再生器（kit/core/player.mjs）：版の決め方に使うファイル（kit/player.json・kit/player.lock.json と中身の PLAYER_FILES）を字として入れ、
// アプリを組んだ commit を渡す（中身が出した版と違えば "+dev.<commit>"。git がなければ "+dev"）
for (const f of [PLAYER_JSON, PLAYER_LOCK, ...PLAYER_FILES]) text['/repo/' + f] = fs.readFileSync(rel(...f.split('/')), 'utf8');
const commit = (() => { const r = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }); return r.status === 0 && /^[0-9a-f]{4,40}$/.test(r.stdout.trim()) ? r.stdout.trim() : ''; })();
const resources = { version, commit, specSnapshot, text, b64, lazy, hints, themes, components, yomi, examples };
const isMincho = (v) => v.startsWith(`/repo/fonts/${MINCHO}/`);
const resourcesSingle = { ...resources, text: Object.fromEntries(Object.entries(text).filter(([v]) => !isMincho(v))), lazy: lazy.filter((v) => !isMincho(v)) };

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
// res：アプリに入れる資源（配信版は resources、1 ファイル版は明朝を除いた resourcesSingle）
const plugin = (res) => ({
  name: 'app',
  setup(b) {
    b.onResolve({ filter: /^virtual:resources$/ }, () => ({ path: 'resources', namespace: 'virtual' }));
    b.onResolve({ filter: /^virtual:portable-worker$/ }, () => ({ path: 'portable-worker', namespace: 'virtual' }));
    b.onResolve({ filter: /^virtual:build-worker$/ }, () => ({ path: 'build-worker', namespace: 'virtual' }));
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, (a) => ({ contents: 'export default ' + JSON.stringify(a.path === 'portable-worker' ? workerJs : a.path === 'build-worker' ? buildWorkerJs : res), loader: 'js' }));
    b.onResolve({ filter: /\?text$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?text$/, '')), namespace: 'text' }));
    b.onLoad({ filter: /.*/, namespace: 'text' }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').trim(), loader: 'text' }));
  },
});
const bundleMain = async (res) => (await esbuild.build({
  entryPoints: [rel('app', 'main.js')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['chrome110', 'edge110'], plugins: [plugin(res)], legalComments: 'none', charset: 'utf8', logLevel: 'warning',
  conditions: ['import', 'browser', 'default'],
})).outputFiles[0].text;
let js = await bundleMain(resources);
const css = fs.readFileSync(rel('app', 'app.css'), 'utf8');
const html = fs.readFileSync(rel('app', 'index.html'), 'utf8');
// Studio のアイコン「す」（assets/logo/studio/。作者の決めた印 src/*.svg から tools/studio-icons.mjs が作る。MIT の対象外：NOTICE）：
// ファビコン（16・32・48 px。暗い画面は favicon-dark.ico。配信版はさらに明るい・暗いを 1 つにした favicon.svg）・apple-touch-icon（180 px）・ウェブアプリの manifest の 192・512 px。
// 「え」（assets/logo/）は Egatari の印：見出しのロゴ・Egatari Viewer・書き出した .ega.html のファビコン（kit/core/favicon.mjs）に使い、Studio のタブとホーム画面は「す」。
// 配信版はファイルとして根に置き、1 ファイル版は data: で埋め込む（manifest は file:// では使えないので入れない）。.ega.html の実行系・再生にはこれを入れない
const LOGO = (f) => rel('assets', 'logo', 'studio', f);
const ICON_FILES = ['favicon.ico', 'favicon-dark.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const iconLinks = (href) => [
  `<link rel="icon" href="${href('favicon.ico')}" sizes="16x16 32x32 48x48">`,
  `<link rel="icon" href="${href('favicon-dark.ico')}" sizes="16x16 32x32 48x48" media="(prefers-color-scheme: dark)">`,
  `<link rel="apple-touch-icon" href="${href('apple-touch-icon.png')}">`,
].join('\n');
const dataUri = (f) => `data:${f.endsWith('.png') ? 'image/png' : 'image/x-icon'};base64,` + fs.readFileSync(LOGO(f)).toString('base64');
const MANIFEST = {
  name: 'Egatari Studio', short_name: 'Egatari Studio', start_url: './', scope: './', display: 'standalone',
  background_color: '#f4f5f8', theme_color: '#ffffff',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
};
const NOTICE = `/* Egatari Studio ${version} — https://github.com/egatari/egatari-studio (MIT). Bundles KaTeX (MIT), parse5 (MIT), BIZ UDPGothic, BIZ UDPMincho and Source Sans 3 (SIL OFL 1.1), and the parts of egatari/components (MIT; the stroke data in m-kakijun is SIL OFL 1.1, see vendor/components/sha256/). The MP3 encoder (lame-wasm with LAME, LGPL) is a separate file, vendor/lame-wasm/ (see NOTICE.txt). */\n`;

// 配信版：dist/ の根。前の組み立ての残り（前の形の dist/editor/ も）を消してから書く
const ED = OUT;
fs.mkdirSync(ED, { recursive: true });
for (const f of ['index.html', 'app.js', 'app.css', 'fonts', 'editor', 'lab', 'vendor', 'LICENSE.txt', 'NOTICE.txt', '.nojekyll', 'manifest.webmanifest', 'version-notice.js', 'versions.json', 'favicon.svg', ...ICON_FILES]) fs.rmSync(path.join(ED, f), { recursive: true, force: true });
fs.writeFileSync(path.join(ED, 'app.js'), NOTICE + js);
fs.writeFileSync(path.join(ED, 'app.css'), css);
fs.writeFileSync(path.join(ED, 'index.html'), html.replace('<!--APP_ICONS-->', () => iconLinks((f) => f) + '\n<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<link rel="manifest" href="manifest.webmanifest">')
  .replace('<!--APP_CSS-->', '<link rel="stylesheet" href="app.css">').replace('<!--APP_JS-->', '<script src="app.js"></script>'));
for (const f of [...ICON_FILES, 'favicon.svg']) fs.copyFileSync(LOGO(f), path.join(ED, f));
fs.writeFileSync(path.join(ED, 'manifest.webmanifest'), JSON.stringify(MANIFEST, null, 2) + '\n');
fs.writeFileSync(path.join(ED, '.nojekyll'), '');
let fontBytes = 0;
for (const [v, f] of Object.entries(lazyFiles)) {
  const to = path.join(ED, v.replace(/^\/repo\//, ''));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(f, to);
  fontBytes += fs.statSync(f).size;
}
for (const f of ['LICENSE', 'NOTICE']) if (fs.existsSync(rel(f))) fs.copyFileSync(rel(f), path.join(ED, f + '.txt'));
// MP3 のエンコーダ（npm の lame-wasm。LAME（LGPL）のオブジェクトコードを含む）：app.js には組み込まず、npm のファイルを手を加えずに
// vendor/lame-wasm/ に写す（LICENSE・package.json・README も）。編集アプリは MP3 にするときだけ読み込み（app/mp3-loader.js）、使う人が
// 同じ名前の別のファイルに置き換えてもよい（NOTICE）。1 ファイル版には入れない（WAV で保存する）
const LAME_DIR = path.join(path.dirname(require.resolve('lame-wasm')), '..');   // dist/index.umd.cjs の上（exports が package.json を出さない）
fs.mkdirSync(path.join(ED, 'vendor', 'lame-wasm'), { recursive: true });
for (const [from, to] of [['dist/index.js', 'index.js'], ['LICENSE', 'LICENSE'], ['package.json', 'package.json'], ['README.md', 'README.md']]) fs.copyFileSync(path.join(LAME_DIR, from), path.join(ED, 'vendor', 'lame-wasm', to));
// 部品の使用条件：app.js に入れた部品の index.js のうち、MIT のほかの条件を持つもの（部品庫の manifest の license。m-kakijun の字の形は SIL OFL 1.1）は、
// その部品のフォルダの使用条件のファイル（LICENSE*・OFL*・COPYING*・NOTICE* と、変えた所の記録 *CHANGES.md）を vendor/components/sha256/<hash>/ に写す。
// 部品庫全体の MIT は vendor/components/LICENSE
const partLicenses = componentLicenseFiles(ROOT);
for (const [virt, file] of partLicenses) { const to = path.join(ED, virt.replace(/^\/repo\//, '')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(file, to); }
fs.mkdirSync(path.join(ED, 'vendor', 'components'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'vendor', 'components', 'LICENSE'), path.join(ED, 'vendor', 'components', 'LICENSE'));
// 版の案内だけを組んだもの（app/version-notice.js）：サイトの組み立て（tools/site-versions.mjs）が、案内を持たない古い凍結した写し（/vX.Y.Z/）に
// ../version-notice.js として読み込ませる（この版の編集アプリは app.js に同じものを持つ）
fs.writeFileSync(path.join(ED, 'version-notice.js'), (await esbuild.build({
  entryPoints: [rel('app', 'version-notice.js')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: ['chrome110', 'edge110'], legalComments: 'none', charset: 'utf8', logLevel: 'warning',
})).outputFiles[0].text);
// 版の一覧（app/version-ui.js が読む）：ここでは凍結した写しなし。公開のときに tools/site-versions.mjs assemble が書き直す
fs.writeFileSync(path.join(ED, 'versions.json'), JSON.stringify({ root: version, versions: [] }, null, 1) + '\n');
// 試験ページ（lab/）：そのまま写す（静的なファイルだけ。重みは実行時に Hugging Face から取る）
const LAB = path.join(OUT, 'lab');
if (fs.existsSync(rel('lab'))) fs.cpSync(rel('lab'), LAB, { recursive: true, filter: (f) => !path.basename(f).startsWith('.') });
// 参照音声（lab/tts-engine.mjs が lab/voices/<名前>.wav として読む）：元は tts/voices/ の 1 か所だけ。ここで dist/lab/voices/ に写す（#137）
for (const n of ['alice', 'bob']) {
  const v = rel('tts', 'voices', `${n}.wav`);
  if (fs.existsSync(v)) { fs.mkdirSync(path.join(LAB, 'voices'), { recursive: true }); fs.copyFileSync(v, path.join(LAB, 'voices', `${n}.wav`)); }
}
// 前の場所 editor/ からは根へ（問い合わせ ?lang=en と # を残す）。スクリプトが動かなくても meta refresh とリンクで行ける
fs.mkdirSync(path.join(OUT, 'editor'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'editor', 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Egatari Studio</title>
<link rel="icon" href="../favicon.ico">
<script>try { var u = new URL('../', location.href); u.search = location.search; u.hash = location.hash; location.replace(u.href); } catch (e) {}</script>
<meta http-equiv="refresh" content="0; url=../">
<link rel="canonical" href="../">
</head>
<body><p>The editor has moved to <a href="../">the top of this site</a>. / 編集器は<a href="../">このサイトの最上位</a>に移りました。</p></body>
</html>
`);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
if (examples.length) console.log(`dist/examples/: ${examples.map((x) => `${x.file} ${kb(x.bytes)}`).join(', ')}`);
console.log(`dist/ (hosted editor): app.js ${kb(js.length)} (reader worker ${kb(workerJs.length)}), fonts ${lazy.length} files ${kb(fontBytes)} -> ${ED}`);

// 1 ファイル版：dist/editor.html（字を全部埋め込む。明朝は入れない）
if (SINGLE) {
  const inline = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  const pack = {};
  for (const [v, f] of Object.entries(lazyFiles)) if (!isMincho(v)) pack[v] = fs.readFileSync(f).toString('base64');
  const jsSingle = await bundleMain(resourcesSingle);
  const one = html
    .replace('<!--APP_ICONS-->', () => iconLinks((f) => dataUri(f)))
    .replace('<!--APP_CSS-->', () => `<style>\n${css}</style>`)
    .replace('<!--APP_JS-->', () => `<script>window.__FONTPACK=${JSON.stringify(pack)};</script>\n<script>${inline(NOTICE + jsSingle)}</script>`);
  fs.writeFileSync(path.join(OUT, 'editor.html'), one);
  console.log(`dist/editor.html: ${kb(one.length)} (fonts embedded)`);
}
