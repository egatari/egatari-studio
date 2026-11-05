// 編集アプリの本（format spec §9C。v0.6.5 E2〜E5。app/book.js）
//   node tools/test-app-book.mjs [作業用のフォルダ]
// 本のある見本（tools/fixtures/article-book：章・付録・前書き・文献）を 1 ファイルに詰め、編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る）で：
//   本の道具は app.js に入らず、本のある教材を開いたときだけ読み込む（article-tools.js・citeproc）。本のない教材では読み込まない
//   開ける（前は article-unsupported で断っていた）・プレビューの「本」・citeproc の帰属の 1 行
//   「本」の板：本文を文字の欄で直して保存 → 本が組み直る・「スライドと本が合っていないかもしれません」→ 確認済みにする（egatari.json の articleLinks）
//   1 ファイルの保存：本文だけを組み直す（段 A の決まり。スライドの部分のバイトはそのまま）。スライドを直したら組み直す保存（段 B）も本を残す
//   本の誤り（§9C.8）は保存しない
//   「本を印刷」：ステップへのリンクの後ろに教材の言葉で「→ スライド N・ステップ K」（ステップ 0 は「→ スライド N」。§9C.13）。本のない教材は「台本を印刷」（小さなスライドと台本）
//   作業フォルダ：本文の欄の保存はフォルダのファイルに書き、前の中身を .cache/edits/ に控える
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { CITEPROC_CREDIT } from '../kit/core/citeproc-credit.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-book-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const dec = new TextDecoder();

// 本のある見本を写して 1 ファイルに（書き出しは id をフォルダに書き戻すので写しで）
const src = path.join(work, 'book');
fs.cpSync(path.join(ROOT, 'tools', 'fixtures', 'article-book'), src, { recursive: true, filter: (f) => !/[\\/](out|\.cache)$/.test(f) });
const packed = path.join(work, 'book' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', src, '-o', packed], { stdio: 'pipe' });
const BOOK = fs.readFileSync(packed);
// 本のない教材
const plainDir = path.join(work, 'plain');
fs.mkdirSync(plainDir, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(plainDir, f));
const plainPacked = path.join(work, 'plain' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', plainDir, '-o', plainPacked], { stdio: 'pipe' });
const PLAIN = fs.readFileSync(plainPacked);

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
// 本の道具は app.js に入らない（あとで読み込むファイルにだけある）
const appJs = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
const toolsJs = fs.readFileSync(path.join(DIST, 'article-tools.js'), 'utf8');
ok(!/mystDirective|mystRole/.test(appJs) && !appJs.includes('CSL.Engine.prototype') && /mystDirective/.test(toolsJs) && !toolsJs.includes('CSL.Engine.prototype'), 'dist: myst-parser and citeproc are not in app.js; article-tools.js carries the book tools (not citeproc)');
// citeproc（CPAL-1.0）：配る字は npm の citeproc 2.4.63 の citeproc_commonjs.js とバイトまで同じ（縮めず・変換せず、app.js の外）。横に上流の LICENSE と CPAL の全文
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const npmCiteproc = fs.readFileSync(path.join(ROOT, 'node_modules', 'citeproc', 'citeproc_commonjs.js'));
const CSRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'citeproc', 'SOURCE.json'), 'utf8'));
ok(sha(fs.readFileSync(path.join(DIST, 'vendor', 'citeproc', 'citeproc_commonjs.js'))) === sha(npmCiteproc) && sha(npmCiteproc) === CSRC.sha256['citeproc_commonjs.js'] && CSRC.version === '2.4.63', 'dist: the served citeproc_commonjs.js has the sha256 of node_modules/citeproc (2.4.63)');
const cpal = fs.readFileSync(path.join(DIST, 'vendor', 'citeproc', 'CPAL'), 'utf8');
ok(sha(fs.readFileSync(path.join(DIST, 'vendor', 'citeproc', 'LICENSE'))) === sha(fs.readFileSync(path.join(ROOT, 'node_modules', 'citeproc', 'LICENSE'))) && /EXHIBIT A\. Common Public Attribution License/.test(cpal) && /EXHIBIT B\. Attribution Information/.test(cpal), 'dist: the upstream LICENSE and the CPAL text with Exhibits A and B are next to it');
// Offline editor：citeproc は <script type="text/plain" id="egatari-citeproc"> の中に、元の字のまま（見出しの注記も）
const single = fs.readFileSync(path.join(DIST, 'editor.html'));
const OPEN = Buffer.from('<script type="text/plain" id="egatari-citeproc">'), at = single.indexOf(OPEN) + OPEN.length, end = single.indexOf(Buffer.from('</script>'), at);
ok(at > OPEN.length && sha(single.subarray(at, end)) === sha(npmCiteproc) && single.subarray(at, at + 40).toString('utf8').startsWith('/*\nCopyright (c) 2009-2019 Frank Bennett'), 'offline: editor.html carries citeproc byte for byte, header comment included');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const fetched = [];
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  fetched.push(p);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];
const b64 = (u8) => Buffer.from(u8).toString('base64');
const st = (page) => page.evaluate(() => window.__APP_TEST.state());
const bk = (page) => page.evaluate(() => window.__APP_TEST.book());
const openBytes = (page, bytes, name) => page.evaluate(([data, name]) => {
  const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return window.__APP_TEST.openFile({ bytes: u, name });
}, [b64(bytes), name]);
const bookRendered = (page, n) => page.waitForFunction((n) => { const b = window.__APP_TEST.book(); return b.renders > n || !!b.error; }, n, { timeout: 60000 });
const savedText = (page) => page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer())));
async function inBook(page, fn, arg) {
  for (let i = 0; i < 100; i++) {
    const h = await page.$('#preview');
    const f = h && await h.contentFrame();
    if (f) { try { const r = await f.evaluate(fn, arg); if (r !== undefined && r !== null && r !== false) return r; } catch { /* 読み込み中 */ } }
    await page.waitForTimeout(150);
  }
  return null;
}
const egatariArticle = (html) => { const i = html.indexOf('<article id="egatari-article"'); return i < 0 ? '' : html.slice(i, html.indexOf('</article>\n</section>', i) + '</article>'.length); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await page.goto(`${HOST}?lang=ja`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('book', { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('saved' + Date.now() + '.ega.html', { create: true }); });

  // ---------------------------------------------------------------- 本のない教材：本の道具を読み込まない・「台本を印刷」
  ok(await openBytes(page, PLAIN, 'plain' + FORMAT.FILE_EXT), 'plain lesson: opens');
  await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.builds > 0 && s.frameLoaded === s.loads && s.loads > 0; }, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  let b = await bk(page);
  ok(!b.present && !b.loaded.tools && !fetched.includes('/article-tools.js'), 'plain lesson: the book tools are not loaded');
  ok(await page.isHidden('#b-book') && (await page.textContent('#b-print-book')) === '台本を印刷' && (await page.textContent('#b-print')) === 'スライドを印刷', 'plain lesson: no 本 button; the print items are スライドを印刷 / 台本を印刷');
  {
    const pf = await (await page.$('#preview')).contentFrame();
    await pf.evaluate(() => { window.__printed = null; window.print = () => { const b = document.getElementById('egatari-print-script'); window.__printed = b ? { n: b.querySelectorAll('.eps-item').length, thumbs: b.querySelectorAll('.eps-thumb .slide').length, text: b.textContent.slice(0, 400) } : { n: -1 }; }; });
    await page.evaluate(() => document.getElementById('b-print-book').click());
    const pr = await pf.waitForFunction(() => window.__printed, null, { timeout: 20000 }).then((h) => h.jsonValue());
    ok(pr.n > 0 && pr.thumbs === pr.n && /スライド 1/.test(pr.text) && pr.text.length > 40, `print script: small slides with their script (${pr.n} slides): ${pr.text.replace(/\s+/g, " ").slice(0, 80)}`);
    ok(await pf.evaluate(() => /size:\s*A4 portrait/.test((document.getElementById('egatari-print-script-css') || {}).textContent || '')), 'print script: A4 portrait');
  }

  // ---------------------------------------------------------------- 本のある 1 ファイル
  ok(await openBytes(page, BOOK, 'book' + FORMAT.FILE_EXT), 'book file: opens (no article-unsupported)');
  await page.waitForFunction(() => window.__APP_TEST.book().renders > 0 || !!window.__APP_TEST.book().error, null, { timeout: 90000 });
  b = await bk(page);
  let s = await st(page);
  ok(b.present && !b.error && b.loaded.tools && b.loaded.citeproc && b.extra, `book file: book tools and citeproc loaded on the page and in the build worker ${b.error || ''}`);
  ok(fetched.includes('/article-tools.js') && fetched.includes('/vendor/citeproc/citeproc_commonjs.js'), 'book file: the tools come from their own files');
  ok(!s.portable.readOnly && !s.portable.tierAOnly, `book file: editable (not read-only, not tier A only) ${JSON.stringify([s.portable.readOnly, s.portable.tierAOnly])}`);
  ok(b.files.join() === 'article/00-preface.md,article/01.md,article/09-answers.md' && b.citeproc, `book file: chapter files in reading order; citations formatted by citeproc (${b.files.join()})`);
  ok(!b.problems.some((p) => p.sev === 'error'), `book file: no errors in the book (${JSON.stringify(b.problems)})`);
  ok(await page.isVisible('#b-book') && (await page.textContent('#b-print-book')) === '本を印刷', 'book file: 本 button; print item 本を印刷');

  // E2：プレビューの本
  await page.waitForFunction(() => window.__APP_TEST.state().frameLoaded === window.__APP_TEST.state().loads, null, { timeout: 60000 });
  await page.evaluate(() => window.__APP_TEST.setView('book'));
  ok(await inBook(page, () => window.DECK && DECK.panes && DECK.panes.state().layout === 'book' && DECK.panes.state().article), 'view: 本 shows the player’s book pane (kit/panes.js) with the article');
  await page.evaluate(() => window.__APP_TEST.setView('split'));
  ok(await inBook(page, () => DECK.panes.state().layout === 'split') && (await page.getAttribute('#b-view-split', 'aria-checked')) === 'true', 'view: スライドと本 puts the slides and the book side by side');
  await inBook(page, () => { DECK.panes.layout('book'); return true; });
  await page.waitForFunction(() => document.getElementById('b-view-book').getAttribute('aria-checked') === 'true', null, { timeout: 10000 }).catch(() => {});
  ok((await page.getAttribute('#b-view-book', 'aria-checked')) === 'true', 'view: a layout chosen inside the player updates Preview ▾ → View');
  // 読むための助け（v0.6.5 C）：プレビューの sandbox（localStorage なし）でも字の設定・続きからが落ちない。⌘F・Ctrl+F はプレビューの本の窓の検索
  const pv = await (await page.$('#preview')).contentFrame();
  const rd = await pv.evaluate(() => { let ls = 'ok'; try { localStorage.getItem('x'); } catch (e) { ls = 'blocked'; } return { ls, reading: DECK.panes.state().reading }; });
  ok(rd.reading && typeof rd.reading.size !== 'undefined', `reading aids: text settings work in the sandboxed preview (localStorage ${rd.ls})`);
  await (await page.$('#preview')).click({ position: { x: 600, y: 300 } }).catch(() => {});
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  await page.waitForTimeout(400);
  ok(!!(await pv.evaluate(() => DECK.panes.state().find)), 'reading aids: ⌘F / Ctrl+F in the preview opens the book pane’s own search');
  await page.keyboard.press('Escape');
  ok(await pv.evaluate(() => !(window.__APP_LOAD && document.querySelectorAll('.deck-error').length)) && !(await page.evaluate(() => window.__APP_TEST.state().error)), 'reading aids: no build or player error');
  // 自習と記録（v0.6.5 D）：プレビューは記録しない（DECK_DEV）。「前回の続きから」は本の窓の 1 つだけ（編集アプリは足さない）。learn のプレビューは速さを操れる
  ok(await pv.evaluate(() => DECK.trackingAdapter() === null && DECK.tracking().adapter === null), 'tracking: the sandboxed preview records nothing (no adapter) and raises no error');
  ok(await page.evaluate(() => document.body.textContent.includes('前回の続きから')) === false && await pv.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent === '前回の続きから').length <= 1), 'resume: at most one 「前回の続きから」 (the player’s), none from the editor');
  {
    const l0 = (await st(page)).loads;
    await page.evaluate(() => window.__APP_TEST.previewMode('learn'));
    await page.waitForFunction((l0) => { const s = window.__APP_TEST.state(); return s.loads > l0 && s.frameLoaded === s.loads; }, l0, { timeout: 30000 });
    let lm = null;
    for (let i = 0; i < 50 && !(lm && lm.mode === 'learn'); i++) { try { const f = await (await page.$('#preview')).contentFrame(); lm = await f.evaluate(() => (window.DECK && DECK.ready ? { mode: DECK.mode, r1: (DECK.rate(1.5), DECK.state().rate), tracking: DECK.tracking().adapter } : null)); } catch { /* 読み込み中 */ } if (!(lm && lm.mode === 'learn')) await page.waitForTimeout(150); }
    ok(lm && lm.mode === 'learn' && lm.r1 === 1.5 && lm.tracking === null, `learn: the preview plays in learn mode with rate control and no tracking (${JSON.stringify(lm)})`);
    const l1 = (await st(page)).loads;
    await page.evaluate(() => window.__APP_TEST.previewMode('talk'));
    await page.waitForFunction((l1) => { const s = window.__APP_TEST.state(); return s.loads > l1 && s.frameLoaded === s.loads; }, l1, { timeout: 30000 });
  }
  const h1 = await inBook(page, () => { const a = document.getElementById('egatari-article'); return a ? [...a.querySelectorAll('h1')].map((x) => x.textContent).join(' / ') : null; });
  ok(/平均と中央値/.test(h1 || ''), `view: the book frame shows the rendered article (${h1})`);
  ok(await inBook(page, () => !!document.querySelector('#egatari-article a.egatari-cite')), 'view: citations are formatted');
  ok((await page.textContent('#book-credit')) === CITEPROC_CREDIT && await page.isVisible('#book-credit'), 'view: the citeproc-js attribution (CPAL Exhibit B) is shown under the book');
  ok((await page.textContent('#book-credit')).includes('(c) Frank Bennett — citeproc-js implements the Citation Style Language — https://citationstyles.org/'), 'view: the attribution has the owner’s line');
  await page.screenshot({ path: path.join(work, 'book-view.png') });

  // E5：本を印刷（ステップへのリンクは「→ スライド N・ステップ K」、ステップ 0 は「→ スライド N」）
  await page.evaluate(() => { window.__APP_TEST.printDry = true; document.getElementById('b-print-book').click(); });
  await page.waitForFunction(() => !!window.__APP_TEST.book().lastPrint, null, { timeout: 20000 });
  const lp = (await bk(page)).lastPrint, printed = lp.texts;
  ok(Array.isArray(printed) && printed.length > 0 && printed.every((t) => /^ → スライド \d+(・ステップ (\d+|結論))?$/.test(t) && !/・ステップ 0$/.test(t)) && printed.includes(' → スライド 1・ステップ 1'), `print book: step links print as → スライド N・ステップ K in the lesson language (${JSON.stringify(printed)})`);
  ok(lp.a4 && !(await page.$('#book-print')), 'print book: A4 portrait; the print frame is removed afterwards');

  // E3：記録のないつながり（まだ確認していません）→ すべて確認済みにする
  await page.evaluate(() => window.__APP_TEST.bookPanel(true));
  await page.waitForSelector('#book-text');
  b = await bk(page);
  ok(b.states.length >= 2 && b.states.every((x) => x.state === 'unconfirmed') && /まだ確認していません/.test(await page.textContent('#book-stale')), `stale: links without a record are shown as not checked yet (${JSON.stringify(b.states)})`);
  // 組み直しの途中で板が描き直されることがある（本の道具を読み込んだ後の組み直し）：組み終えてから、ボタンを DOM で押す
  await page.waitForFunction(() => !window.__APP_TEST.state().building && window.__APP_TEST.state().frameLoaded === window.__APP_TEST.state().loads, null, { timeout: 60000 }).catch(() => {});
  let r0 = (await bk(page)).renders;
  await page.evaluate(() => document.getElementById('book-confirm-all').click());
  await page.waitForFunction(() => window.__APP_TEST.book().states.length > 0 && window.__APP_TEST.book().states.every((x) => x.state === 'ok'), null, { timeout: 60000 }).catch(() => {});
  ok((await bk(page)).states.every((x) => x.state === 'ok') && !(await page.$('#book-stale')), 'stale: すべて確認済みにする records every pair');

  // E4：本文の欄で直す（保存は作業場所へ。本が組み直る）
  ok((await page.inputValue('#book-file')) === 'article/00-preface.md' && (await page.inputValue('#book-text')).startsWith('---'), 'panel: the first book file in a plain text field');
  await page.selectOption('#book-file', 'article/01.md');
  await page.waitForFunction(() => /2 つの代表値/.test(document.getElementById('book-text').value));
  const before = await page.inputValue('#book-text');
  const para = before.split('\n').find((l) => l.startsWith('平均は外れ値'));
  ok(!!para, 'panel: article/01.md loaded');
  await page.fill('#book-text', before.replace('## 2 つの代表値\n\n', '## 2 つの代表値\n\n中央値と平均を比べる。\n\n'));
  ok(await page.isEnabled('#book-save') && await page.isVisible('#book-dirty'), 'panel: unsaved changes are shown and Save is enabled');
  r0 = (await bk(page)).renders;
  await page.click('#book-save');
  await bookRendered(page, r0);
  s = await st(page);
  b = await bk(page);
  ok(!b.dirty && s.portable.dirty, 'panel: Save writes the text to the lesson (the file is now unsaved)');
  ok(await inBook(page, () => /中央値と平均を比べる。/.test(document.getElementById('egatari-article').textContent)), 'panel: the book view shows the edit');

  // E3：合っていないかもしれない組 → 確認済みにする
  ok(b.states.some((x) => x.state === 'article') && b.states.filter((x) => x.state !== 'ok').length === 1, `stale: the changed section is shown as possibly out of date (${JSON.stringify(b.states)})`);
  await page.waitForSelector('#book-stale');
  ok((await page.textContent('#book-stale-h')) === 'スライドと本が合っていないかもしれません' && /本の節が変わりました/.test(await page.textContent('#book-stale')), 'stale: the panel says スライドと本が合っていないかもしれません / 本の節が変わりました');
  await page.screenshot({ path: path.join(work, 'book-panel.png') });
  r0 = (await bk(page)).renders;
  await page.evaluate(() => document.querySelector('#book-stale .book-confirm').click());
  await bookRendered(page, r0);
  await page.waitForFunction(() => window.__APP_TEST.book().states.every((x) => x.state === 'ok'), null, { timeout: 30000 }).catch(() => {});
  b = await bk(page);
  ok(b.states.every((x) => x.state === 'ok') && !(await page.$('#book-stale')), `stale: 確認済みにする records the current hashes (${JSON.stringify(b.states)})`);
  const files = await page.evaluate(() => window.__APP_TEST.files());
  const conf = JSON.parse(Buffer.from(files['egatari.json'], 'base64').toString('utf8'));
  ok(conf.articleLinks && Object.keys(conf.articleLinks).length > 0, 'stale: egatari.json carries the articleLinks');

  // 1 ファイルの保存：本文だけを組み直す
  const orig = BOOK.toString('utf8');
  await page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
  s = await st(page);
  const saved = await savedText(page);
  const sp = await readPortable(new TextEncoder().encode(saved));
  ok(s.portable.lastTier === 'A' && s.portable.lastTierA.article.includes('article/01.md'), `save: the book edit is saved without rebuilding the slides (tier ${s.portable.lastTier}, ${JSON.stringify(s.portable.lastTierA && s.portable.lastTierA.article)})`);
  ok(sp.sourceMatches && egatariArticle(saved).includes('中央値と平均を比べる。') && dec.decode(sp.files['article/01.md']).includes('中央値と平均を比べる。'), 'save: the saved file has the new article text and the re-rendered book');
  const head = (h) => h.slice(0, h.indexOf('<section id="egatari-readable"'));
  ok(head(saved) === head(orig), 'save: the runtime before the readable layer is byte-identical');
  ok(JSON.stringify(sp.index.articleLinks) === JSON.stringify(conf.articleLinks), 'save: index.articleLinks equals egatari.json (§9C.7)');

  // 本の誤り（§9C.8）は保存しない
  await page.fill('#book-text', (await page.inputValue('#book-text')) + '\n[](#fig-nowhere)\n');
  r0 = (await bk(page)).renders;
  await page.click('#book-save');
  await bookRendered(page, r0);
  b = await bk(page);
  ok(b.problems.some((p) => p.sev === 'error') && await page.isVisible('#book-problems'), `errors: the panel lists the book errors (${JSON.stringify(b.problems.filter((p) => p.sev === 'error'))})`);
  let p = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #book-save-errors', { timeout: 30000 });
  ok(/fig-nowhere/.test(await page.textContent('#dlg')), 'errors: saving is refused and names the error');
  await clickDlg(page, '#dlg-ok');
  await p;
  ok((await st(page)).portable.dirty, 'errors: nothing saved');
  await page.fill('#book-text', (await page.inputValue('#book-text')).replace('\n[](#fig-nowhere)\n', ''));
  r0 = (await bk(page)).renders;
  await page.click('#book-save');
  await bookRendered(page, r0);

  // スライドを直したら組み直す保存（段 B）：本を残す（前は article-unsupported で断っていた）
  await page.evaluate(() => window.__APP_TEST.setView('slides'));
  let range = null;
  for (let t = 0; t < 200 && !range; t++) {
    const f = await (await page.$('#preview')).contentFrame();
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide li[data-src], #stage .slide p[data-src], #stage .slide h2[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  let srcR = null;
  for (let i = 0; i < 60 && !(srcR && srcR.text); i++) { srcR = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(srcR && srcR.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(srcR.text) ? srcR.text.replace(/>([^<]+)</, '>$1（直した）<') : srcR.text + '（直した）';
  const post = page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, srcR.h, next]);
  const asked = await Promise.race([post.then(() => false), page.waitForSelector('#dlg[open] #dlg-ok', { timeout: 20000 }).then(() => true, () => false)]);
  if (asked) await clickDlg(page, '#dlg-ok');
  ok((await post)._status === 200, 'tier B: a slide text is edited');
  p = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 60000 });
  await clickDlg(page, '#dlg-rebuild');
  await p;
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 90000 }).catch(() => {});
  s = await st(page);
  const savedB = await savedText(page);
  const spB = await readPortable(new TextEncoder().encode(savedB));
  ok(s.portable.lastTier === 'B' && !s.portable.dirty && spB.index.article && egatariArticle(savedB).includes('中央値と平均を比べる。') && dec.decode(spB.files['deck.html']).includes('（直した）'),
    `tier B: the rebuilt file keeps the book (tier ${s.portable.lastTier}, article ${!!spB.index.article})`);
  await ctx.close();

  // ---------------------------------------------------------------- 作業フォルダ（OPFS）：本文の欄はフォルダに書き、控えを残す
  const cf = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const pf = await cf.newPage();
  pf.on('pageerror', (e) => errs.push(`folder pageerror: ${e.message}`));
  await pf.goto(`${HOST}?lang=en`);
  await pf.waitForFunction(() => !!window.__APP_TEST);
  const filesOf = (dir) => { const out = {}; const walk = (d, pre) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'out' || e.name === '.cache') continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f, pre + e.name + '/'); else out[pre + e.name] = fs.readFileSync(f).toString('base64'); } }; walk(dir, ''); return out; };
  await pf.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('bookdir', { recursive: true }).catch(() => {});
    const top = await root.getDirectoryHandle('bookdir', { create: true });
    for (const [rel, b] of Object.entries(files)) {
      const parts = rel.split('/'), name = parts.pop(); let d = top;
      for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
      const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(u); await w.close();
    }
    window.__bd = top;
  }, filesOf(src));
  await pf.evaluate(() => window.__APP_TEST_OPEN(window.__bd));
  await pf.waitForFunction(() => window.__APP_TEST.book().renders > 0 || !!window.__APP_TEST.book().error, null, { timeout: 90000 });
  b = await bk(pf);
  ok(b.present && !b.error, `folder: the book is built (${b.error || ''})`);
  ok((await pf.textContent('#b-print-book')) === 'Print book' && (await pf.textContent('#b-view-book')) === 'Book' && (await pf.textContent('#b-book')) === 'Book', 'folder (en): Book / Print book');
  await pf.evaluate(() => window.__APP_TEST.bookPanel(true));
  await pf.waitForSelector('#book-text');
  await pf.selectOption('#book-file', 'article/09-answers.md');
  await pf.waitForFunction(() => document.getElementById('book-text').value.length > 0);
  const t9 = await pf.inputValue('#book-text');
  r0 = (await bk(pf)).renders;
  await pf.fill('#book-text', t9.replace(/\r\n/g, '\n') + '\nA new line.\n');
  await pf.press('#book-text', process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await bookRendered(pf, r0);
  const disk = await pf.evaluate(async () => {
    const d = await window.__bd.getDirectoryHandle('article');
    const text = await (await (await d.getFileHandle('09-answers.md')).getFile()).text();
    let backups = 0;
    try { const e = await (await window.__bd.getDirectoryHandle('.cache')).getDirectoryHandle('edits'); for await (const k of e.keys()) if (/09-answers\.md$/.test(k)) backups++; } catch { /* なし */ }
    return { text, backups };
  });
  ok(disk.text.endsWith('\nA new line.\n') && disk.backups >= 1, `folder: ⌘/Ctrl+Enter writes the file in the folder and keeps a backup in .cache/edits/ (${disk.backups})`);
  await cf.close();

  // ---------------------------------------------------------------- Offline editor（dist/editor.html、file://）：本の道具は同梱の字から動かす
  const co = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ja-JP' });
  const po = await co.newPage();
  po.on('pageerror', (e) => errs.push(`offline pageerror: ${e.message}`));
  await po.goto('file://' + path.join(DIST, 'editor.html').split(path.sep).join('/') + '?lang=ja');
  await po.waitForFunction(() => !!window.__APP_TEST);
  ok(await openBytes(po, BOOK, 'book' + FORMAT.FILE_EXT), 'offline: the book file opens');
  await po.waitForFunction(() => window.__APP_TEST.book().renders > 0 || !!window.__APP_TEST.book().error, null, { timeout: 120000 });
  b = await bk(po);
  ok(b.present && !b.error && b.loaded.tools && b.loaded.citeproc && b.citeproc, `offline: the bundled book tools and citeproc run from file:// (${b.error || ''})`);
  ok(sha(Buffer.from(await po.evaluate(() => document.getElementById('egatari-citeproc').textContent), 'utf8')) === sha(npmCiteproc), 'offline: the page reads the same citeproc text it runs');
  await co.close();
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close().catch(() => {});
  srv.close();
}
for (const e of errs) console.log('  ' + e);
ok(!errs.length, 'no page errors');
console.log(fails ? `test-app-book: ${fails} failed` : 'test-app-book: all passed');
process.exit(fails ? 1 : 0);
