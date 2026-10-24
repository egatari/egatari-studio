// 同梱のテーマの版の固定（themes.lock.json・vendor/themes/。kit/core/themes-lock.mjs）の試験
//   node tools/test-theme-version.mjs [作業用のフォルダ]
// 1. 固定のファイル：themes.lock.json と themes/・vendor/themes/ の hash が合う（tools/themes-lock.mjs --check と同じ）。読み方の関数
// 2. 組み立て（CLI）：egatari.json の themes で前の版に固定したデッキは前の版の色で組み、変わる色を警告する。固定のないデッキ・今の版の固定は警告しない。
//    --update-themes は egatari.json を今の版にして、今の色で組む
// 3. 持ち運べる 1 ファイル：前の版で組んだ 1 ファイルは、埋め込んだ前の色のまま再生する。展開（unpack）は記録の sha256 から egatari.json に版を固定し、
//    組み直しても前の色のまま（記録の sha256 も同じ）。今の版で書き出した 1 ファイルの egatari.json は themes を持ち、展開して組み直すと同じバイト
// 5. テーマのフォルダの最上位の文書（README*・LICENSE*・*.md）はテーマの一部でない：足しても hash は変わらず、themes:check も通り、ロゴに書いても読まない。
//    利用者のテーマを 1 ファイルに入れるとき、README*・*.md は写さず、LICENSE* は写す（展開で戻る。format spec §6・§3.3）
// 4. 編集アプリ：前の版を記録した 1 ファイル（egatari.json に themes のない、前の Studio が書いたもの）を開くと、プレビューは前の色のまま、
//    知らせに変わる色（前 → 今、色見本）と「テーマを更新」。押したときだけ今の版で組み直し、egatari.json と記録が替わる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { build, buildPortable, nodeEnv } from '../kit/build.mjs';
import { build as coreBuild } from '../kit/core/build-core.mjs';
import { exportPortable, readPortable } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { excludedFromThemeHash, excludedFromThemeCopy } from '../kit/core/themes-lock.mjs';
import { parseThemesLock, themesLockProblems, themeVersionForSha, themePinsForIndex, pickThemeVersion, themeUpdate, configThemePins } from '../kit/core/themes-lock.mjs';
import { themesLockCheck, themeDirSha } from './themes-lock.mjs';
import { unpack } from './portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-theme-version-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const LOCK = parseThemesLock(fs.readFileSync(path.join(ROOT, 'themes.lock.json'), 'utf8'));
const D = LOCK.themes.default, NEW = D.current, OLD = '1.0.0';
const OLD_EMPH = 'rgb(197, 5, 22)', OLD_EMPH_CSS = 'oklch(0.52 0.21 27)', NEW_EMPH = 'rgb(190, 48, 18)', OLD_MUTED = 'rgb(110, 110, 110)', NEW_MUTED = 'rgb(92, 88, 83)';

// ---------------------------------------------------------------- 1. 固定のファイル
ok(themesLockCheck(ROOT).length === 0, 'themes.lock.json matches themes/ and vendor/themes/ ' + JSON.stringify(themesLockCheck(ROOT)));
ok(NEW === JSON.parse(fs.readFileSync(path.join(ROOT, 'themes/default/theme.json'), 'utf8')).version && D.versions.includes(OLD), `default: current ${NEW} (theme.json), earlier ${OLD} kept`);
ok(themeVersionForSha(LOCK, 'default', D.sha256[OLD], '0.4.6') === OLD && themeVersionForSha(LOCK, 'default', D.sha256[NEW], 'x') === NEW && themeVersionForSha(LOCK, 'default', 'f'.repeat(64)) === null, 'a recorded sha256 binds to its version, whatever the recorded version string (the Studio version before 1.1.0)');
ok(JSON.stringify(themePinsForIndex(LOCK, [{ name: 'default', version: '0.4.6', sha256: D.sha256[OLD], source: 'registry' }, { name: 'kokugo', version: '0.4.6', sha256: 'a'.repeat(64), source: 'registry' }]).pins) === JSON.stringify({ default: OLD }), 'pins from an index: only themes in the lock');
ok(pickThemeVersion(LOCK, 'default', OLD).pinned && !pickThemeVersion(LOCK, 'default', NEW).pinned && !pickThemeVersion(LOCK, 'default', undefined).pinned && /not in themes\.lock\.json/.test(pickThemeVersion(LOCK, 'default', '9.9.9').note), 'pick: earlier version pinned, current or none not, unknown version noted');
{
  const u = themeUpdate(LOCK, 'default', OLD);
  ok(u.to === NEW && u.tokens.length === 2 && u.tokens.some((x) => x.token === '--emph' && x.from === '#C50516' && x.to === '#BE3012') && u.tokens.some((x) => x.token === '--muted' && x.from === '#6E6E6E' && x.to === '#5C5853'), 'update from 1.0.0: --emph #C50516 → #BE3012, --muted #6E6E6E → #5C5853 ' + JSON.stringify(u.tokens));
}
ok(themesLockProblems({ themes: { default: { current: '1.0.0', versions: ['1.0.0', '1.1.0'], sha256: { '1.0.0': 'a'.repeat(64), '1.1.0': 'b'.repeat(64) } } } }).some((x) => /latest/.test(x)), 'lock: current must be the latest version');
ok(themesLockProblems({ themes: { '../x': { current: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': 'a'.repeat(64) } } } }).some((x) => /registry name/.test(x)), 'lock: names are registry names');
ok(['README.md', 'readme.ja.md', 'NOTES.md', 'LICENSE', 'LICENSE.md', 'licence.txt'].every(excludedFromThemeHash) && !['tokens.css', 'theme.json', 'logo.svg', 'img/x.md'].some(excludedFromThemeHash), 'hash: README*, LICENSE* and *.md at the theme root are left out, nothing else');
ok(['README.md', 'NOTES.md', 'readme'].every(excludedFromThemeCopy) && !['LICENSE', 'LICENSE.md', 'licence.txt', 'tokens.css', 'img/x.md'].some(excludedFromThemeCopy), 'copy: README* and *.md are not copied; LICENSE* (also LICENSE.md) is');
ok(JSON.stringify(configThemePins({ themes: { default: '1.0.0', '../x': '1.0.0', kokugo: '../1' } })) === JSON.stringify({ default: '1.0.0' }), 'egatari.json themes: malformed entries are ignored');

// ---------------------------------------------------------------- 2. 組み立て（CLI）
function deckDir(name, themes, src = 'minimal') {
  const dir = path.join(work, name);
  fs.cpSync(path.join(ROOT, 'examples', src), dir, { recursive: true, filter: (x) => !/[\\/](out|audio)([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ docId: '00000000-0000-4000-8000-00000000000' + (name.length % 10), metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test', attribution: 'Test', creators: ['Test'] }, ...(themes ? { themes } : {}) }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
{
  const old = build(deckDir('old', { default: OLD }));
  ok(old.stats.themePinned.length === 1 && old.stats.themePinned[0].from === OLD && old.stats.themeVersions.default === OLD, 'build: pinned to 1.0.0 builds with 1.0.0 and reports it in stats.themePinned');
  ok(/#c50516/.test(old.html) && !/#BE3012/.test(old.html), 'build: the pinned build carries the 1.0.0 colors');
  ok(old.stats.warn.some((w) => /^theme pinned: default 1\.0\.0 /.test(w) && w.includes('--emph #C50516 → #BE3012') && w.includes('--update-themes')), 'build: the warning lists old → new colors and explains --update-themes');
  const kok = build(deckDir('kokugo-old', { default: OLD }, 'kokugo-kanbun'));
  ok(kok.stats.themeVersions.default === OLD && /#6e6e6e/.test(kok.html), 'build: a theme extending default uses the pinned parent');
  const dflt = build(deckDir('dflt'));
  ok(!dflt.stats.themePinned.length && !dflt.stats.warn.some((w) => /^theme pinned:/.test(w)) && /#BE3012/.test(dflt.html), 'build: no pin → current version, no warning');
  const cur = build(deckDir('cur', { default: NEW }));
  ok(!cur.stats.themePinned.length && !cur.stats.warn.some((w) => /^theme pinned:/.test(w)), 'build: pinned to the current version: no warning');
  const o = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), deckDir('cli', { default: OLD })], { encoding: 'utf8' });
  ok(o.status === 0 && /⚠ theme pinned: default 1\.0\.0/.test(o.stderr), 'CLI kit/build.mjs: prints the pinned-theme warning and still builds');
  const src = deckDir('cli-up', { default: OLD });
  const u = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), src, '--update-themes'], { encoding: 'utf8' });
  const conf = JSON.parse(fs.readFileSync(path.join(path.dirname(src), FORMAT.CONFIG_FILE), 'utf8'));
  ok(u.status === 0 && /theme updated: default 1\.0\.0 → 1\.1\.0 \(--emph #C50516 → #BE3012, --muted #6E6E6E → #5C5853\)/.test(u.stdout) && !/theme pinned/.test(u.stderr), 'CLI --update-themes: says what changes and builds without the warning');
  ok(conf.themes.default === NEW && conf.docId, `CLI --update-themes: ${FORMAT.CONFIG_FILE} now pins ${NEW} (other fields kept)`);
  const c = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deckDir('clicheck', { default: OLD }), '--json'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(c.stdout); } catch { /* */ }
  ok(j && JSON.stringify(j).includes('theme pinned: default 1.0.0'), 'CLI kit/check.mjs: reports the pinned-theme warning (as a build warning)');
}

// ---------------------------------------------------------------- 3. 持ち運べる 1 ファイル
// 前の Studio（v0.4.6 まで）が書いた 1 ファイルと同じもの：前の版のテーマで組み、egatari.json に themes を書かない
const oldBuild = (env, src, o) => { const r = coreBuild(env, src, { ...o, themeVersions: { default: OLD } }); r.stats.themeVersions = {}; return r; };
const oldSrc = deckDir('portable-old');
const pold = await exportPortable(nodeEnv, oldSrc, { build: oldBuild, fromFolder: true });
const oldFile = path.join(work, 'old' + FORMAT.FILE_EXT);
fs.writeFileSync(oldFile, pold.html);
{
  const t = (pold.index.themes || []).find((x) => x.name === 'default');
  ok(t && t.sha256 === D.sha256[OLD], 'single file (old): records the 1.0.0 identity hash');
  ok(!('themes' in JSON.parse(Buffer.from(pold.files[FORMAT.CONFIG_FILE]).toString('utf8'))), 'single file (old): its egatari.json has no themes (as before 1.1.0)');
  const pnew = await buildPortable(deckDir('portable-new'), { out: path.join(work, 'new' + FORMAT.FILE_EXT) });
  const cfg = JSON.parse(Buffer.from(pnew.files[FORMAT.CONFIG_FILE]).toString('utf8'));
  ok(cfg.themes && cfg.themes.default === NEW && pnew.index.themes.find((x) => x.name === 'default').version === NEW, `single file (new): egatari.json pins themes.default ${NEW}; the index records version ${NEW}`);
  // 展開 → 組み直し：同じバイト（egatari.json の themes が往復する）
  fs.writeFileSync(path.join(work, 'new2' + FORMAT.FILE_EXT), pnew.html);
  const U = path.join(work, 'unpacked-new');
  await unpack(path.join(work, 'new2' + FORMAT.FILE_EXT), U);
  const again = await buildPortable(path.join(U, 'deck.html'), { out: path.join(U, 'x' + FORMAT.FILE_EXT) });
  ok(again.index.sourceSha256 === pnew.index.sourceSha256, 'single file (new): unpack → pack keeps the source hash (egatari.json round-trips)');
  // 前の 1 ファイルの展開：記録の sha256 から 1.0.0 に固定し、知らせる。組み直しても前の色・同じ hash
  const UO = path.join(work, 'unpacked-old');
  const uo = await unpack(oldFile, UO);
  const uconf = JSON.parse(fs.readFileSync(path.join(UO, FORMAT.CONFIG_FILE), 'utf8'));
  ok(uconf.themes && uconf.themes.default === OLD, `unpack (old): ${FORMAT.CONFIG_FILE} pins themes.default ${OLD}`);
  ok(uo.warnings.some((w) => /^theme pinned: default 1\.0\.0/.test(w)), 'unpack (old): warns that the lesson keeps 1.0.0 and what would change');
  const ro = await buildPortable(path.join(UO, 'deck.html'), { out: path.join(UO, 'x' + FORMAT.FILE_EXT) });
  ok(ro.index.themes.find((x) => x.name === 'default').sha256 === D.sha256[OLD] && /#c50516/.test(ro.html), 'unpack (old) → pack: rebuilt with 1.0.0 (same identity hash, old colors)');
  // 組み直す文書（carry）の記録で固定する
  const rc = await exportPortable(nodeEnv, deckDir('carry'), { carry: pold.index });
  ok(rc.index.themes.find((x) => x.name === 'default').sha256 === D.sha256[OLD] && rc.stats.themePinned.length === 1, 'rebuild with carry: the recorded 1.0.0 is kept');
  const rcu = await exportPortable(nodeEnv, deckDir('carry-up'), { carry: pold.index, updateThemes: true });
  ok(rcu.index.themes.find((x) => x.name === 'default').sha256 === D.sha256[NEW] && !rcu.stats.themePinned.length, 'rebuild with carry and updateThemes: the current version');
  const r = await readPortable(new Uint8Array(fs.readFileSync(oldFile)));
  ok(r.sourceMatches === true, 'single file (old): reads cleanly');
}

// ---------------------------------------------------------------- 5. 説明の文書は hash に入らない
{
  const docs = { 'README.md': '# x\n', 'README.ja.md': '# x\n', 'NOTES.md': 'notes\n', 'LICENSE': 'MIT\n', 'LICENSE.txt': 'MIT\n' };
  const addDocs = (dir) => { for (const [f, t] of Object.entries(docs)) fs.writeFileSync(path.join(dir, f), t); };
  // 同梱のテーマ：themes/ と vendor/themes/ に足しても hash と themes:check は同じ
  const R = path.join(work, 'docs-root');
  fs.cpSync(path.join(ROOT, 'themes'), path.join(R, 'themes'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'vendor', 'themes'), path.join(R, 'vendor', 'themes'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'themes.lock.json'), path.join(R, 'themes.lock.json'));
  addDocs(path.join(R, 'themes', 'default')); addDocs(path.join(R, 'vendor', 'themes', 'default', OLD)); addDocs(path.join(R, 'themes', 'kokugo'));
  ok(themeDirSha(path.join(R, 'themes', 'default')) === D.sha256[NEW] && themeDirSha(path.join(R, 'vendor', 'themes', 'default', OLD)) === D.sha256[OLD], 'docs: README*, LICENSE* and *.md in a bundled theme do not change its sha256');
  ok(themeDirSha(path.join(R, 'themes', 'kokugo')) === themeDirSha(path.join(ROOT, 'themes', 'kokugo')), 'docs: the same for a theme without a version (kokugo)');
  ok(themesLockCheck(R).length === 0, 'docs: themes:check still passes with the documents added ' + JSON.stringify(themesLockCheck(R)));
  // 利用者のテーマ：説明の文書を足しても hash は同じ。ロゴに書いた README.md は読まない。1 ファイルには写さない
  const U = path.join(work, 'user-themes'), T = path.join(U, 'mine');
  fs.mkdirSync(T, { recursive: true });
  fs.writeFileSync(path.join(T, 'tokens.css'), ':root{--base:#335577}\n');
  fs.writeFileSync(path.join(T, 'theme.json'), JSON.stringify({ name: 'mine', extends: 'default', logos: ['logo.svg', 'README.md'] }) + '\n');
  fs.writeFileSync(path.join(T, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>\n');
  const before = themeDirSha(T);
  addDocs(T);
  ok(themeDirSha(T) === before, 'docs: README*, LICENSE* and *.md in a user theme do not change its sha256 (also when theme.json lists README.md as a logo)');
  const deck = deckDir('user-theme');
  fs.writeFileSync(deck, fs.readFileSync(deck, 'utf8').replace(/data-theme="[^"]*"/, 'data-theme="mine"'));
  const prev = process.env.EGATARI_THEMES;
  process.env.EGATARI_THEMES = U;
  try {
    const r = await exportPortable(nodeEnv, deck, {});
    const names = Object.keys(r.files).filter((k) => k.startsWith('themes/mine/'));
    ok(names.includes('themes/mine/tokens.css') && names.includes('themes/mine/logo.svg') && names.includes('themes/mine/LICENSE') && names.includes('themes/mine/LICENSE.txt') && !names.some((k) => /README|\.md$/i.test(k)), 'docs: a user theme goes into the single file with its LICENSE* and without README*/*.md ' + JSON.stringify(names));
    ok(Buffer.from(r.files['themes/mine/LICENSE']).toString('utf8') === docs.LICENSE, 'docs: the LICENSE bytes are copied as they are');
    // 展開すると LICENSE が戻る（README は戻らない）
    const pf = path.join(work, 'user-theme' + FORMAT.FILE_EXT);
    fs.writeFileSync(pf, r.html);
    const UD = path.join(work, 'user-theme-unpacked');
    await unpack(pf, UD);
    ok(fs.readFileSync(path.join(UD, 'themes', 'mine', 'LICENSE'), 'utf8') === docs.LICENSE && fs.existsSync(path.join(UD, 'themes', 'mine', 'LICENSE.txt')) && !fs.existsSync(path.join(UD, 'themes', 'mine', 'README.md')), 'docs: unpacking the single file brings LICENSE back (README.md is not there)');
    // その sha256 は、LICENSE も README もないテーマと同じ
    const bare = path.join(work, 'user-theme-bare');
    fs.mkdirSync(bare, { recursive: true });
    for (const f of ['tokens.css', 'theme.json', 'logo.svg']) fs.copyFileSync(path.join(T, f), path.join(bare, f));
    ok(themeDirSha(path.join(UD, 'themes', 'mine')) === themeDirSha(bare) && themeDirSha(T) === themeDirSha(bare), 'docs: the theme sha256 with LICENSE and README.md equals the sha256 without either');
    ok(r.stats.warn.some((w) => /README\.md/.test(w) && /ロゴにしない/.test(w)), 'docs: README.md listed as a logo is not read (warning)');
    ok(!r.html.includes(Buffer.from('# x\n').toString('base64')), 'docs: the README is not embedded');
  } finally { if (prev === undefined) delete process.env.EGATARI_THEMES; else process.env.EGATARI_THEMES = prev; }
  // 原稿のフォルダのテーマ（<作業フォルダ>/themes/<名前>/）も同じ：LICENSE は入り、README.md は入らず、hash は同じ、展開で戻る
  {
    const ldeck = deckDir('local-theme');
    const LT = path.join(path.dirname(ldeck), 'themes', 'local');
    fs.mkdirSync(LT, { recursive: true });
    fs.writeFileSync(path.join(LT, 'tokens.css'), ':root{--base:#553311}\n');
    fs.writeFileSync(path.join(LT, 'theme.json'), JSON.stringify({ name: 'local', extends: 'default' }) + '\n');
    const bareSha = themeDirSha(LT);
    fs.writeFileSync(path.join(LT, 'LICENSE'), docs.LICENSE);
    fs.writeFileSync(path.join(LT, 'README.md'), docs['README.md']);
    ok(themeDirSha(LT) === bareSha, 'docs (lesson-local theme): LICENSE and README.md do not change its sha256');
    fs.writeFileSync(ldeck, fs.readFileSync(ldeck, 'utf8').replace(/data-theme="[^"]*"/, 'data-theme="local"'));
    const r = await exportPortable(nodeEnv, ldeck, {});
    const names = Object.keys(r.files).filter((k) => k.startsWith('themes/local/'));
    ok(r.stats.theme === 'local' && names.includes('themes/local/tokens.css') && names.includes('themes/local/LICENSE') && !names.includes('themes/local/README.md'), 'docs (lesson-local theme): the single file has its LICENSE and not its README.md ' + JSON.stringify(names));
    ok(Buffer.from(r.files['themes/local/LICENSE']).toString('utf8') === docs.LICENSE, 'docs (lesson-local theme): the LICENSE bytes are copied as they are');
    const pf = path.join(work, 'local-theme' + FORMAT.FILE_EXT);
    fs.writeFileSync(pf, r.html);
    const LD = path.join(work, 'local-theme-unpacked');
    await unpack(pf, LD);
    ok(fs.readFileSync(path.join(LD, 'themes', 'local', 'LICENSE'), 'utf8') === docs.LICENSE && !fs.existsSync(path.join(LD, 'themes', 'local', 'README.md')) && themeDirSha(path.join(LD, 'themes', 'local')) === bareSha, 'docs (lesson-local theme): unpacking brings LICENSE back; the theme sha256 is unchanged');
  }
}

// ---------------------------------------------------------------- 4. 再生と編集アプリ
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];
const colors = () => { const cs = getComputedStyle(document.documentElement); const probe = (v) => { const d = document.createElement('span'); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }; return { emph: probe('--emph'), muted: probe('--muted'), hue: cs.getPropertyValue('--emph-hue') }; };
try {
  // 前の 1 ファイルは、埋め込んだ前の色のまま再生する（作り直さない）
  {
    const page = await browser.newPage();
    await page.goto(fileUrl(oldFile) + '?mode=video');
    await page.waitForFunction(() => window.DECK && DECK.ready);
    const c = await page.evaluate(colors);
    ok(c.emph === OLD_EMPH_CSS && c.muted === OLD_MUTED, `player: the old single file plays with its embedded 1.0.0 colors (${c.emph}, ${c.muted})`);
    await page.close();
  }
  for (const lang of ['ja', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
    await page.waitForSelector('#drop');
    const l0 = await page.evaluate(() => window.__APP_TEST.state().loads);
    const b64 = Buffer.from(pold.html).toString('base64');
    const opened = await page.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'old' + ext }); }, [b64, FORMAT.FILE_EXT]);
    ok(opened === true, `${lang}: the lesson that recorded default 1.0.0 opens`);
    await page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads; }, l0, { timeout: 60000 });
    const st0 = await page.evaluate(() => window.__APP_TEST.state());
    ok(!st0.portable.tierAOnly && !st0.portable.readOnly, `${lang}: slide edits stay allowed (the editor has the recorded theme version)`);
    ok(st0.portable.themePins && st0.portable.themePins.default === OLD, `${lang}: the editor builds with the recorded version ${OLD}`);
    const frame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
    const c0 = await frame().evaluate(colors);
    ok(c0.emph === OLD_EMPH_CSS && c0.muted === OLD_MUTED, `${lang}: the preview keeps the 1.0.0 colors (no silent restyle: ${c0.emph}, ${c0.muted})`);
    const notice = await page.textContent('#notice-theme-pinned');
    ok(notice.includes('default') && notice.includes(OLD) && notice.includes(NEW) && notice.includes('#C50516') && notice.includes('#BE3012') && notice.includes('#6E6E6E') && notice.includes('#5C5853'), `${lang}: the notice lists old → new colors`);
    ok(/never restyled silently|黙って新しい色にはしません/.test(notice), `${lang}: the notice says nothing is restyled silently`);
    const sw = await page.$$eval('#notice-theme-pinned .swatch', (a) => a.map((e) => getComputedStyle(e).backgroundColor));
    ok(JSON.stringify(sw) === JSON.stringify([OLD_EMPH, NEW_EMPH, OLD_MUTED, NEW_MUTED]), `${lang}: swatches show the old and new colors ${JSON.stringify(sw)}`);
    const btn = await page.textContent('#b-theme-update');
    ok(btn === (lang === 'ja' ? 'テーマを更新' : 'Update theme'), `${lang}: button "${btn}"`);
    const files = () => page.evaluate(() => window.__APP_TEST.files());
    const cfg = async () => JSON.parse(Buffer.from((await files())[FORMAT.CONFIG_FILE], 'base64').toString('utf8'));
    ok(!('themes' in (await cfg())), `${lang}: before the button, ${FORMAT.CONFIG_FILE} is unchanged`);
    ok(st0.portable.themes.find((t) => t.name === 'default').sha256 === D.sha256[OLD], `${lang}: before the button, the record is unchanged`);
    await page.click('#b-theme-update');
    await page.waitForFunction(() => !document.getElementById('notice-theme-pinned') && !!document.getElementById('notice-theme-done'), null, { timeout: 60000 });
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.frameLoaded === s.loads; }, null, { timeout: 60000 });
    const c1 = await frame().evaluate(colors);
    ok(c1.emph === NEW_EMPH && c1.muted === NEW_MUTED, `${lang}: after the button, the preview has the ${NEW} colors (${c1.emph}, ${c1.muted})`);
    ok((await cfg()).themes.default === NEW, `${lang}: ${FORMAT.CONFIG_FILE} now pins ${NEW}`);
    const st1 = await page.evaluate(() => window.__APP_TEST.state());
    ok(st1.portable.themes.find((t) => t.name === 'default').sha256 === D.sha256[NEW] && !st1.portable.tierAOnly, `${lang}: the lesson now records ${NEW}; edits stay allowed`);
    ok(!st1.warn.some((w) => /^theme pinned:/.test(w)), `${lang}: no pinned-theme warning after the update`);
    await ctx.close();
  }
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
