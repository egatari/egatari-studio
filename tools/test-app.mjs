// 編集アプリ（app/）の確認
//   node tools/test-app.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 1. tools/build-app.mjs で作業用のフォルダに組み、dist/editor/ を 127.0.0.1 で配る
// 2. OPFS（navigator.storage.getDirectory()）に examples/minimal を写したフォルダを作り、window.__APP_TEST_OPEN(handle) で開く
// 3. ブラウザで組んだ HTML が Node の build（字を絞り込まない）と同じか・原稿の編集・口述原稿・コメント・外での変更・
//    組み立ての失敗・書き出し・簡易チェック・発表者ビュー・1 ファイル版（file://）を確かめる。コンソールのエラーが無いこと
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { build } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-app-')));
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DIST = path.join(work, 'dist');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
// 食い違ったら最初に違う所の前後を出す（Windows などで原因を追うため）
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && a.length === b.length ? '' : `\n       at ${i}: app …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 120))}\n       node …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 120))}`; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

// ---------------------------------------------------------------- 1. 組んで配る
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain' };
let fontFetches = 0;
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, 'editor', p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(path.join(DIST, 'editor')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  if (file.endsWith('.woff2')) fontFetches++;
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
console.log('app', BASE);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
const page = await ctx.newPage();
const errs = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  // 衝突の確認（409）とポップアップの許可は意図したもの
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
};
watch(page, 'main');

// OPFS のフォルダの読み書き（ページの中で）
const opfs = {
  write: (rel, text) => page.evaluate(async ([rel, text]) => {
    const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir;
    for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
  }, [rel, text]),
  read: (rel) => page.evaluate(async (rel) => {
    try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(name)).getFile()).text(); }
    catch { return null; }
  }, rel),
  list: (rel) => page.evaluate(async (rel) => {
    let d = window.__testDir; for (const x of rel.split('/').filter(Boolean)) d = await d.getDirectoryHandle(x);
    const out = []; for await (const k of d.keys()) out.push(k); return out.sort();
  }, rel),
};
const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
async function frameReady(timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = deckFrame();
    // 今の読み込み（アプリの loads）の画面が組み上がるまで待つ（前の画面を掴まない）
    const want = await page.evaluate(() => window.__APP_TEST.state().loads);
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.__DECK_DEV_TRANSPORT && window.__APP_LOAD === w), want)) return f; } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
const loads = () => page.evaluate(() => window.__APP_TEST.state().loads);
async function waitLoads(n, timeout = 15000) {
  await page.waitForFunction((n) => window.__APP_TEST.state().loads > n, n, { timeout });
  return frameReady();
}

try {
  // ---------------------------------------------------------------- 2. はじめの画面
  await page.goto(BASE);
  await page.waitForSelector('#drop');
  ok(await page.isVisible('#w-open'), 'welcome: open-folder button visible');
  ok((await page.textContent('#welcome h1')).includes('フォルダ'), 'welcome: Japanese UI for ja locale');
  ok(!(await page.isVisible('#unsupported')), 'welcome: File System Access available (no "unsupported" note)');
  await shot(page, 'welcome.png');

  // 新しいデッキ：フォルダを選ぶ画面の代わりに OPFS の空でないフォルダを返す → 中に新しいフォルダを作って開く
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('talks', { recursive: true }).catch(() => {});
    const parent = await root.getDirectoryHandle('talks', { create: true });
    await parent.getFileHandle('other.txt', { create: true });
    window.__parent = parent;
    window.showDirectoryPicker = async () => parent;
  });
  await page.click('#w-new');
  await page.fill('#n-title', 'テスト用のデッキ');
  await page.click('#n-go');
  await page.waitForFunction(() => window.__APP_TEST.state().open && window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
  const made = await page.evaluate(async () => { const d = await window.__parent.getDirectoryHandle('テスト用のデッキ'); const out = []; for await (const k of d.keys()) out.push(k); return out.sort().join(','); });
  ok(made === 'deck.html,narration.md', 'new deck: created deck.html and narration.md in a new subfolder of a non-empty folder');
  ok(!(await page.evaluate(() => window.__APP_TEST.state().error)), 'new deck: the template builds without error');
  await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });

  // examples/minimal を OPFS に写して開く
  const SRC = path.join(ROOT, 'examples/minimal');
  const files = { 'deck.html': fs.readFileSync(path.join(SRC, 'deck.html'), 'utf8'), 'narration.md': fs.readFileSync(path.join(SRC, 'narration.md'), 'utf8') };
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('minimal', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('minimal', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, files);
  let n = await loads();
  const opened = await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir));
  ok(opened === true, 'open: __APP_TEST_OPEN(handle) opened the OPFS folder');
  let f = await waitLoads(n);
  const st0 = await page.evaluate(() => window.__APP_TEST.state());
  ok(st0.deckFile === 'deck.html' && !st0.error, 'open: built deck.html without error');
  ok(fontFetches > 0, `fonts: fetched only the needed woff2 chunks (${fontFetches})`);
  ok(await f.evaluate(() => DECK.slides.length) === 6, 'preview: 6 slides in the sandboxed iframe');
  ok(await f.evaluate(() => { try { return window.parent.document && 'reachable'; } catch { return 'blocked'; } }) === 'blocked', 'sandbox: the deck cannot reach the app document (opaque origin)');

  // ブラウザで組んだものと Node の build が同じ（字を絞り込まない設定で）
  const appHtml = await page.evaluate(() => window.__APP_TEST.build({ dev: false }));
  const nodeHtml = build(path.join(SRC, 'deck.html'), { subset: false }).html;
  ok(appHtml === nodeHtml, `build: browser build is byte-identical to Node build (subset off) (${(appHtml.length / 1024).toFixed(0)} KB)` + firstDiff(appHtml, nodeHtml));
  const appDev = await page.evaluate(() => window.__APP_TEST.build({ dev: true }));
  const nodeDev = build(path.join(SRC, 'deck.html'), { dev: true }).html;
  ok(appDev === nodeDev, 'build: dev build (data-src) is byte-identical to Node' + firstDiff(appDev, nodeDev));

  // ---------------------------------------------------------------- 3. 原稿の編集
  await f.evaluate(() => DECK.go(2, 3, false));
  await page.click('#b-edit');
  ok(await f.evaluate(() => document.documentElement.classList.contains('dev-edit')), 'edit: toolbar button turns on edit mode');
  const li = f.locator('#stage .slide.active li[data-step="2"]');
  await li.dblclick();
  await f.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  const ta = f.locator('#dev-editor textarea');
  ok((await ta.inputValue()).includes('学習率'), 'edit: editor shows the raw source');
  await ta.fill('\\(\\eta>0\\)：<b>学習率</b>（アプリで編集）');
  await shot(page, 'editing.png');
  n = await loads();
  await ta.press('Meta+Enter');
  f = await waitLoads(n);
  const deck1 = await opfs.read('deck.html');
  ok(deck1.includes('<li data-step="2">\\(\\eta>0\\)：<b>学習率</b>（アプリで編集）</li>'), 'edit: deck.html in the folder changed');
  const st1 = await f.evaluate(() => DECK.state());
  ok(st1.slide === 3 && st1.step === 3, `edit: position kept after reload (${st1.slide}:${st1.step})`);
  ok(await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('アプリで編集')), 'edit: preview shows the new text');
  const backups = await opfs.list('.cache/edits');
  ok(backups.length === 1 && backups[0].endsWith('-deck.html'), 'edit: backup in .cache/edits/');
  // 古い hash での保存は 409
  const conflict = await f.evaluate(() => window.__DECK_DEV_TRANSPORT.api('POST', '/__dev/edit', { range: '0-5', h: 'deadbeef', text: 'x' }));
  ok(conflict._status === 409, 'edit: stale hash is rejected (409)');

  // ---------------------------------------------------------------- 4. 口述原稿
  await page.keyboard.press('e');   // 編集モードを切る（フォーカスはデッキ）
  await f.evaluate(() => DECK.go(1, 0, false));
  await page.click('#b-narr');
  await f.waitForSelector('#dev-narr .dev-turn textarea');
  const nta = f.locator('#dev-narr .dev-turn textarea').first();
  await nta.fill('アプリから書き直した口述原稿です。');
  await shot(page, 'narration.png');
  n = await loads();
  await f.click('#dev-narr .dv-foot button.dv-pri');
  f = await waitLoads(n);
  const narr1 = await opfs.read('narration.md');
  ok(narr1.includes('アプリから書き直した口述原稿です。'), 'narration: narration.md changed');
  ok(await f.evaluate(() => JSON.stringify(DECK.NARRATION).includes('アプリから書き直した')), 'narration: rebuilt deck has the new narration');
  ok(await f.isVisible('#dev-narr'), 'narration: drawer stays open after reload');
  const stale = await f.evaluate(() => window.__DECK_DEV_TRANSPORT.api('POST', '/__dev/narration', { slideKey: 'x', stepKey: '0', turns: [], rev: 'nope' }));
  ok(stale._status === 409, 'narration: stale revision is rejected (409)');
  await page.click('#b-narr');

  // ---------------------------------------------------------------- 5. コメント（Alt+クリック）
  const target = f.locator('#stage .slide.active h2');
  await target.click({ modifiers: ['Alt'] });
  await f.waitForSelector('#dev-comment textarea');
  await f.fill('#dev-comment textarea', 'この見出しを短く');
  await f.press('#dev-comment textarea', 'Meta+Enter');
  await page.waitForTimeout(400);
  const comments = JSON.parse(await opfs.read('comments.json') || '[]');
  ok(comments.length === 1 && comments[0].comment === 'この見出しを短く' && comments[0].status === 'open', 'comment: comments.json written');
  await page.click('#b-comments');
  await f.waitForSelector('#dev-comments .dev-c');
  ok((await f.textContent('#dev-comments')).includes('この見出しを短く'), 'comment: listed in the comments panel');
  await f.click('#dev-comments .dev-c button');
  await page.waitForTimeout(300);
  ok(JSON.parse(await opfs.read('comments.json'))[0].status === 'resolved', 'comment: resolved from the panel');
  await page.click('#b-comments');

  // ---------------------------------------------------------------- 6. 外での変更（Claude Code など）
  await f.evaluate(() => DECK.go(4, 1, false));
  n = await loads();
  const deck2 = (await opfs.read('deck.html')).replace('<h2>学習率と収束</h2>', '<h2>学習率と収束（外で変更）</h2>');
  ok(deck2.includes('外で変更'), 'external: test edit applies');
  await opfs.write('deck.html', deck2);
  f = await waitLoads(n, 10000);
  ok(await f.evaluate(() => document.querySelector('#stage .slide.active h2').textContent.includes('外で変更')), 'external: change detected, rebuilt and reloaded');
  const st2 = await f.evaluate(() => DECK.state());
  ok(st2.slide === 5 && st2.step === 1, `external: slide and step kept (${st2.slide}:${st2.step})`);

  // 組み立ての失敗 → 重ね表示、直すと消える
  await opfs.write('deck.html', deck2.replace(/<head>[\s\S]*?<\/head>/, ''));
  await page.waitForSelector('#errbox:not([hidden])', { timeout: 10000 });
  ok((await page.textContent('#errtext')).includes('<head>'), 'error: build failure shown over the preview');
  await shot(page, 'error.png');
  n = await loads();
  await opfs.write('deck.html', deck2);
  await page.waitForSelector('#errbox[hidden]', { state: 'attached', timeout: 10000 });
  ok(await page.isHidden('#errbox'), 'error: overlay disappears after the fix');

  // ---------------------------------------------------------------- 7. 簡易チェック
  await page.click('#b-check');
  await page.waitForSelector('#panel-body .sum', { timeout: 20000 });
  const sum = await page.textContent('#panel-body .sum');
  ok(/エラー \d+ · 警告 \d+/.test(sum), 'check: quick check summary shown: ' + sum);
  await shot(page, 'check.png');
  await page.click('#panel-close');

  // ---------------------------------------------------------------- 8. 書き出し
  await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('export.html', { create: true }); });
  await page.click('#b-export');
  let exp = '';
  for (let i = 0; i < 200 && exp.length < 1000; i++) { await page.waitForTimeout(100); exp = (await opfs.read('export.html')) || ''; }
  ok(exp.startsWith('<!DOCTYPE html>') && exp.includes('id="deck-narration"') && !exp.includes('data-src=') && !exp.includes('__DECK_DEV_TRANSPORT'), `export: single HTML without editing hooks (${(exp.length / 1024).toFixed(0)} KB)`);
  const ep = await ctx.newPage();
  watch(ep, 'export');
  await ep.setContent(exp, { waitUntil: 'load' });
  await ep.waitForFunction(() => window.DECK && DECK.ready);
  ok(await ep.evaluate(() => DECK.slides.length) === 6, 'export: exported HTML runs on its own');
  await ep.close();

  // ---------------------------------------------------------------- 9. 発表者ビュー
  await f.evaluate(() => DECK.go(1, 0, false));
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('#b-presenter')]);
  watch(pop, 'presenter');
  const pf = async () => { for (let i = 0; i < 200; i++) { const x = pop.frames().find((fr) => fr.parentFrame() === pop.mainFrame()); try { if (x && await x.evaluate(() => !!document.getElementById('pv'))) return x; } catch { /* 読み込み中 */ } await pop.waitForTimeout(100); } throw new Error('presenter frame not ready'); };
  const pv = await pf();
  await pop.waitForTimeout(800);
  ok((await pv.textContent('#pv-pos')).includes('2'), 'presenter: shows the current slide: ' + (await pv.textContent('#pv-pos')));
  ok((await pv.textContent('#pv-text')).length > 5, 'presenter: notes shown');
  const before = await f.evaluate(() => DECK.state());
  await pv.click('#pv-notes');
  await pop.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  const after = await f.evaluate(() => DECK.state());
  ok(after.slide * 100 + after.step > before.slide * 100 + before.step, `presenter: → in the presenter view moves the main deck (${before.slide}:${before.step} → ${after.slide}:${after.step})`);
  const nested = pv.childFrames();
  ok(nested.length === 2, 'presenter: current and next views are loaded (srcdoc)');
  await shot(pop, 'presenter.png');
  await pop.close();
  await page.bringToFront();

  // ---------------------------------------------------------------- 10. 部品・データ・マクロのあるデッキ（examples/tmlr2026-calibration）
  {
    const T = path.join(ROOT, 'examples/tmlr2026-calibration');
    const tf = {};
    const addf = (rel) => { tf[rel] = fs.readFileSync(path.join(T, rel), 'utf8'); };
    for (const rel of ['deck.html', 'narration.md', 'macros.tex']) addf(rel);
    for (const d of fs.readdirSync(path.join(T, 'components'))) addf(`components/${d}/index.js`);
    for (const d of fs.readdirSync(path.join(T, 'data'))) addf(`data/${d}`);
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('tmlr2026-calibration', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('tmlr2026-calibration', { create: true });
      for (const [rel, text] of Object.entries(files)) {
        const parts = rel.split('/'); const name = parts.pop(); let x = d;
        for (const p of parts) x = await x.getDirectoryHandle(p, { create: true });
        const w = await (await x.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
      }
      window.__tmlr = d;
    }, tf);
    const n0 = await loads();
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__tmlr)) === true, 'tmlr: opened');
    await waitLoads(n0);
    // 部品の出どころの注釈（原稿のフォルダの場所）だけが違う
    const norm = (h) => h.replace(/\/\/ ---- (m-[a-z0-9-]+) \([^)]*\)/g, '// ---- $1');
    const a = norm(await page.evaluate(() => window.__APP_TEST.build({ dev: false })));
    const b = norm(build(path.join(T, 'deck.html'), { subset: false, noAudio: true }).html);
    ok(a === b, `tmlr: browser build equals Node build (subset off, no audio) (${(a.length / 1024).toFixed(0)} KB)`);
    const terr = await page.evaluate(() => window.__APP_TEST.state().error);
    ok(!terr, 'tmlr: no build error' + (terr ? ': ' + terr.slice(0, 300) : ''));
  }

  // ---------------------------------------------------------------- 11. 英語の画面
  const pe = await browser.newPage({ locale: 'en-US' });
  watch(pe, 'en');
  await pe.goto(BASE);
  ok((await pe.textContent('#welcome h1')) === 'Open a deck folder', 'i18n: English UI for en locale');
  await pe.close();

  // ---------------------------------------------------------------- 12. 1 ファイル版（file://）
  const p1 = await browser.newPage({ locale: 'ja-JP' });
  watch(p1, 'single');
  await p1.goto(pathToFileURL(path.join(DIST, 'editor.html')).href);
  await p1.waitForSelector('#drop');
  ok(await p1.evaluate(() => typeof window.showDirectoryPicker === 'function' && isSecureContext), 'single file: File System Access API available on file://');
  // file:// では OPFS が使えないので、メモリの上のフォルダ（同じ形のハンドル）で開く
  await p1.evaluate((files) => {
    class FileH { constructor(name, text) { this.kind = 'file'; this.name = name; this.text = text; this.m = Date.now(); }
      async getFile() { return new File([this.text], this.name, { lastModified: this.m }); }
      async createWritable() { const self = this; let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { self.text = buf; self.m = Date.now(); } }; }
      async isSameEntry(o) { return o === this; } }
    class DirH { constructor(name) { this.kind = 'directory'; this.name = name; this.c = new Map(); }
      async *entries() { for (const e of this.c) yield e; } async *keys() { for (const k of this.c.keys()) yield k; }
      async getFileHandle(n, o = {}) { let h = this.c.get(n); if (!h) { if (!o.create) throw new DOMException('no', 'NotFoundError'); h = new FileH(n, ''); this.c.set(n, h); } if (h.kind !== 'file') throw new DOMException('dir', 'TypeMismatchError'); return h; }
      async getDirectoryHandle(n, o = {}) { let h = this.c.get(n); if (!h) { if (!o.create) throw new DOMException('no', 'NotFoundError'); h = new DirH(n); this.c.set(n, h); } return h; }
      async removeEntry(n) { this.c.delete(n); } async isSameEntry(o) { return o === this; } }
    const d = new DirH('memdeck');
    for (const [k, v] of Object.entries(files)) d.c.set(k, new FileH(k, v));
    window.__mem = d;
  }, files);
  ok(await p1.evaluate(() => window.__APP_TEST_OPEN(window.__mem)) === true, 'single file: opened a folder');
  await p1.waitForFunction(() => window.__APP_TEST.state().loads > 0 && !window.__APP_TEST.state().error, null, { timeout: 20000 });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { const fr = p1.frames().find((x) => x.parentFrame() === p1.mainFrame()); try { ready = !!(fr && await fr.evaluate(() => window.DECK && DECK.ready)); } catch { /* 読み込み中 */ } if (!ready) await p1.waitForTimeout(100); }
  ok(ready, 'single file: preview renders from file:// (fonts embedded)');
  await p1.close();
} catch (e) {
  console.error(e);
  fails++;
  await shot(page, 'failure.png').catch(() => {});
} finally {
  ok(errs.length === 0, 'no console errors' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await browser.close();
  srv.close();
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
