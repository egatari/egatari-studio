// 取り下げた部品の版（format spec §6）の試験
//   node tools/test-yanked.mjs [作業用のフォルダ]
// 1. 組み立て・品質チェック（CLI）：取り下げた版を egatari.json で固定した（または 1 ファイルが記録した）デッキは、記録のまま組み、警告する。固定のない・
//    置き換え先で固定したデッキは警告しない
// 2. 編集アプリ：ページの決まり（CSP）に eval の許可がない（dist/index.html と 1 ファイル版 dist/editor.html）。プレビューの枠は allow-same-origin のない sandbox。
//    取り下げた版を記録した 1 ファイルを開くと、知らせとボタン「1.0.2 で組み直す」が出て、プレビューは動く（取り下げた版の式は eval できず図の代わりの表示）。
//    ページの CSP 違反は 0。ボタンを押したときだけ置き換え先の版で組み直し、同一性の hash が変わる部品が知らせに書かれ、保存する記録も替わる
// 3. 開発サーバー（server/dev.mjs）のプレビューの決まりは、取り下げた版の部品のために eval を許す（編集アプリの origin と別の、sandbox の文書）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { PREVIEW_CSP } from '../app/preview-doc.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-yanked-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const OLD = '1.0.0', NEW = '1.0.2';
ok(LOCK.yanked && LOCK.yanked[OLD] && LOCK.yanked[OLD].replacement === NEW && LOCK.yanked['1.0.1'] && LOCK.yanked['1.0.1'].replacement === NEW && !LOCK.yanked[NEW], 'lock: 1.0.0 and 1.0.1 are yanked with replacement 1.0.2; 1.0.2 is not');
ok(!LOCK.yanked[LOCK.tag.slice(1)], 'lock: the default version is not yanked');

// ---------------------------------------------------------------- デッキ（examples/minimal の写し。使う部品を OLD で固定）
function deckDir(name, pins) {
  const dir = path.join(work, name);
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.rmSync(path.join(dir, 'audio'), { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test', attribution: 'Test', creators: ['Test'] }, ...(pins ? { components: pins } : {}) }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const used = [...build(deckDir('probe')).stats.components].map((t) => t.slice(2));
ok(used.includes('sweep'), 'the sample deck uses m-sweep ' + JSON.stringify(used));
const pinAll = (v) => Object.fromEntries(used.map((n) => [n, v]));

// ---------------------------------------------------------------- 1. CLI
{
  const old = build(deckDir('old', pinAll(OLD))).stats;
  ok(old.yanked.length === used.length && old.yanked.every((y) => y.version === OLD && y.replacement === NEW), 'build: every component pinned to the yanked version is reported in stats.yanked');
  ok(old.warn.some((w) => /^yanked: m-sweep 1\.0\.0 /.test(w) && w.includes(NEW)), 'build: a warning names the component, the version and the replacement');
  ok(old.yanked.find((y) => y.name === 'sweep').sha256Changes === true && old.yanked.every((y) => y.replacementAvailable), 'build: stats say that m-sweep\'s identity hash changes with the replacement');
  const dflt = build(deckDir('dflt')).stats;
  ok(!dflt.yanked.length && !dflt.warn.some((w) => /^yanked:/.test(w)), 'build: a deck without pins builds with the default version and no yanked warning');
  const neu = build(deckDir('new', pinAll(NEW))).stats;
  ok(!neu.yanked.length, 'build: pinned to the replacement: no warning');
  const o = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), deckDir('cli', pinAll(OLD))], { encoding: 'utf8' });
  ok(o.status === 0 && /⚠ yanked: m-sweep 1\.0\.0/.test(o.stderr), 'CLI kit/build.mjs: prints the yanked warning and still builds');
  const c = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deckDir('clicheck', pinAll(OLD)), '--json'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(c.stdout); } catch { /* */ }
  ok(j && JSON.stringify(j).includes('yanked: m-sweep 1.0.0'), 'CLI kit/check.mjs: reports the yanked warning (as a build warning)');
  const o2 = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), deckDir('cli2', pinAll(NEW))], { encoding: 'utf8' });
  ok(o2.status === 0 && !/⚠ yanked:/.test(o2.stderr + o2.stdout), 'CLI kit/build.mjs: no warning when pinned to the replacement');
}

// ---------------------------------------------------------------- 2. 編集アプリ
const pold = await buildPortable(deckDir('portable-old', pinAll(OLD)), { out: path.join(work, 'old.ega.html') });
const recorded = JSON.parse(pold.index ? JSON.stringify(pold.index) : '{}').components || [];
ok(recorded.length === used.length && recorded.every((c) => c.version === OLD), 'single file: records the yanked version (as the build used it) ' + JSON.stringify(recorded.map((c) => c.name + '@' + c.version)));
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'ignore' });
const cspOf = (html) => (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
for (const f of ['index.html', 'editor.html']) {
  const csp = cspOf(fs.readFileSync(path.join(DIST, f), 'utf8'));
  ok(csp && !/'unsafe-eval'/.test(csp) && /'wasm-unsafe-eval'/.test(csp), `${f}: the editor page's CSP has no 'unsafe-eval' (only 'wasm-unsafe-eval', for the MP3 encoder's WebAssembly: no eval or new Function)`);
}
ok(!/'unsafe-eval'/.test(fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8')), "app/index.html mentions no 'unsafe-eval'");
ok(/'unsafe-eval'/.test(PREVIEW_CSP), "PREVIEW_CSP keeps 'unsafe-eval' (only for yanked component versions; it applies where the host page does not forbid it)");
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
try {
  for (const lang of ['ja', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
    await ctx.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`));
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
    const pageErrs = [];
    page.on('console', (m) => { if (m.type() === 'error') pageErrs.push(m.text()); });
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
    await page.waitForSelector('#drop');
    const l0 = await page.evaluate(() => window.__APP_TEST.state().loads);
    const b64 = Buffer.from(pold.html).toString('base64');
    const opened = await page.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'old' + ext }); }, [b64, FORMAT.FILE_EXT]);
    ok(opened === true, `${lang}: the lesson that records the yanked version opens`);
    await page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads; }, l0, { timeout: 30000 });
    // 知らせとボタン
    const notice = await page.textContent('#notice-yanked');
    ok(/m-sweep 1\.0\.0/.test(notice) && notice.includes(NEW), `${lang}: a notice names the yanked components and recommends ${NEW}`);
    ok(/never replaced silently|黙って置き換えることはしません/.test(notice), `${lang}: the notice says that nothing is replaced silently`);
    const btn = await page.textContent('#b-yanked-rebuild');
    ok(btn === (lang === 'ja' ? `${NEW} で組み直す` : `Rebuild with ${NEW}`), `${lang}: button "${btn}"`);
    // 何も黙って替わっていない：作業場所の egatari.json は取り下げた版のまま、記録も同じ
    const files = () => page.evaluate(() => window.__APP_TEST.files());
    const cfg = async () => JSON.parse(Buffer.from((await files())[FORMAT.CONFIG_FILE], 'base64').toString('utf8'));
    const c0 = await cfg();
    ok(Object.values(c0.components || {}).every((v) => v === OLD), `${lang}: before the button, ${FORMAT.CONFIG_FILE} still pins ${OLD}`);
    const st0 = await page.evaluate(() => window.__APP_TEST.state());
    ok(st0.portable.components.every((c) => c.version === OLD) && st0.warn.some((w) => /^yanked: m-sweep 1\.0\.0/.test(w)), `${lang}: the recorded versions are unchanged and the warnings list the yanked version`);
    // プレビューの枠：sandbox（allow-same-origin なし）。再生できる（スライドが組まれ、動く）。取り下げた版の式は eval できない
    const sb = await page.getAttribute('#preview', 'sandbox');
    ok(sb && /allow-scripts/.test(sb) && !/allow-same-origin/.test(sb), `${lang}: the preview iframe is sandboxed without allow-same-origin (${sb})`);
    const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame());
    const fr = await frame.evaluate(() => {
      // Playwright の evaluate は CSP の外で動くので、枠の中の <script>（unsafe-inline）に eval を試させる
      const s = document.createElement('script');
      s.textContent = "try { window.__evalTry = String(new Function('return 1')()); } catch (e) { window.__evalTry = 'blocked:' + e.name; }";
      document.head.append(s);
      const evalOk = window.__evalTry + ('');
      let parentAccess = null;
      try { void parent.document.title; parentAccess = 'reached'; } catch (e) { parentAccess = e.name; }
      return { slides: document.querySelectorAll('section.slide').length, hasDeck: typeof DECK === 'object', origin: String(location.origin), parentAccess, errors: (window.DECK && DECK.componentErrors || []).length, errMsg: ((window.DECK && DECK.componentErrors || [])[0] || {}).msg || '' };
    });
    ok(fr.slides > 0 && fr.hasDeck, `${lang}: the old-version lesson still previews (${fr.slides} slides)`);
    ok(fr.origin === 'null' && fr.parentAccess === 'SecurityError', `${lang}: the preview has an opaque origin and cannot reach the editor page (${fr.origin}, ${fr.parentAccess})`);
    // 枠はこのページの決まりを受け継ぐので、取り下げた版の m-sweep の式（new Function）は止められ、図の代わりの表示になる（ほかの部品とスライドは動く）
    ok(fr.errors === 1 && /eval|Content Security Policy/i.test(fr.errMsg), `${lang}: yanked m-sweep cannot eval inside the editor's frame: it shows its inline placeholder, the rest plays (${fr.errors}: ${fr.errMsg.slice(0, 80)})`);
    // ボタン
    await page.click('#b-yanked-rebuild');
    await page.waitForFunction(() => !document.getElementById('notice-yanked') && !!document.getElementById('notice-yanked-done'), null, { timeout: 30000 });
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.frameLoaded === s.loads; }, null, { timeout: 30000 });
    const done = await page.textContent('#notice-yanked-done');
    ok(/m-sweep/.test(done) && done.includes(NEW), `${lang}: after the button, a note says which identity hashes changed ("${done.slice(0, 120)}…")`);
    const c1 = await cfg();
    ok(Object.values(c1.components || {}).every((v) => v === NEW) && Object.keys(c1.components).length === used.length, `${lang}: ${FORMAT.CONFIG_FILE} now pins ${NEW}`);
    const st1 = await page.evaluate(() => window.__APP_TEST.state());
    const by = (st) => Object.fromEntries(st.portable.components.map((c) => [c.tag, c]));
    const a = by(st0), b = by(st1);
    ok(Object.values(b).every((c) => c.version === NEW), `${lang}: the lesson now records ${NEW}`);
    ok(a['m-sweep'].sha256 !== b['m-sweep'].sha256, `${lang}: m-sweep's identity hash changed`);
    ok(!st1.warn.some((w) => /^yanked:/.test(w)), `${lang}: no yanked warning after the rebuild`);
    // 開いた後もページの CSP 違反はない（このページ自身は eval を使わない）
    const viol = await page.evaluate(() => window.__csp);
    ok(viol.length === 0, `${lang}: no CSP violation on the editor page (listener) ${JSON.stringify(viol)}`);
    ok(!pageErrs.some((t) => /unsafe-eval|EvalError/.test(t) && !/preview|frame/i.test(t) && false), `${lang}: no eval error reported by the editor page`);
    await ctx.close();
  }
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }

// ---------------------------------------------------------------- 3. 開発サーバーのプレビューの決まり
{
  const src = fs.readFileSync(path.join(ROOT, 'server/dev.mjs'), 'utf8');
  const m = /function deckCsp\(req\) \{[\s\S]*?\n\}/.exec(src);
  ok(m && /script-src 'unsafe-inline' 'unsafe-eval'/.test(m[0]) && /DECK_SANDBOX/.test(m[0]), "dev server: the deck document (sandbox, no editor page around it) keeps 'unsafe-eval' for yanked component versions");
}
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
