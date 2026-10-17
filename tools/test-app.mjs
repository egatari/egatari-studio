// 編集アプリ（app/）の確認
//   node tools/test-app.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 1. tools/build-app.mjs で作業用のフォルダに組み、dist/editor/ を 127.0.0.1 で配る
// 2. OPFS（navigator.storage.getDirectory()）に examples/minimal を写したフォルダを作り、window.__APP_TEST_OPEN(handle) で開く
// 3. ブラウザで組んだ HTML が Node の build（字を絞り込まない）と同じか・原稿の編集・口述原稿・コメント・外での変更・
//    組み立ての失敗・書き出し・簡易チェック・発表者ビュー・1 ファイル版（file://）を確かめる。コンソールのエラーが無いこと
// 4. 持ち運べる 1 ファイル（examples/minimal ＋ dry-run の音声、tools/portable-fixtures.mjs）：フォルダなしで開く・権利の確認・
//    編集・保存（OPFS のファイルのハンドルに上書き）・開き直し・フォルダへの書き出し・フォルダからの書き出し・改変を認めないライセンス・
//    独自のコードの知らせ・印のスクリプトが取り出しで動かない（アプリのページと Worker）・壊れた・新しい版のファイルを断る・ダウンロード
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from '../kit/browser.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable, isStale, scanDocument, replaceIndexText } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { unpack } from './portable.mjs';
import { makeFixtures, silentWav } from './portable-fixtures.mjs';

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

// ---------------------------------------------------------------- 0. 持ち運べる 1 ファイルを作る（Node）
// examples/minimal に音声（TTS の dry-run。uv がなければ JS の無音）と権利の表示を足して 1 ファイルに。ライセンスを変えた写しも
function prepareDeck(dir, metadata) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  const r = spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), dir, '--dry-run'], { encoding: 'utf8' });
  if (r.status !== 0) {
    fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
    const segments = {};
    parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8')).forEach((x, j) => {
      fs.writeFileSync(path.join(dir, 'audio', `seg_js${j}.wav`), silentWav(0.5));
      segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' };
    });
    fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  }
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const PW = path.join(work, 'portable');
fs.rmSync(PW, { recursive: true, force: true });
const pmin = await buildPortable(prepareDeck(path.join(PW, 'min'), { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author, Minimal lesson', creators: ['Test Author'] }), { out: path.join(PW, 'min.html') });
const pnd = await buildPortable(prepareDeck(path.join(PW, 'nd'), { license: 'CC-BY-ND-4.0', copyright: '© 2026 Rights Holder' }), { out: path.join(PW, 'nd.html') });
const fixtures = await makeFixtures(path.join(PW, 'fixtures'));
// テーマ庫のテーマの hash が、このエディタのものと違う文書（作り直しの編集はできない → 読むだけで開く）
const pother = await (async () => {
  const ix = JSON.parse(scanDocument(pmin.html).byId.get(FORMAT.INDEX_ID).text);
  if (!ix.themes || !ix.themes.length) throw new Error('minimal portable file has no registry theme');
  ix.themes[0].sha256 = '0'.repeat(64);
  return replaceIndexText(pmin.html, JSON.stringify(ix, null, 1));
})();
const fixture = (name) => fixtures.find((f) => f.name === name);

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

  // ---------------------------------------------------------------- 10b. 持ち運べる 1 ファイル（フォルダなし）
  {
    // OPFS の pf/ にファイルを置き、ハンドルを window.__pf[名前] に（保存はこのハンドルに上書きする）
    const putFile = (name, buf) => page.evaluate(async ([name, b64]) => {
      const root = await navigator.storage.getDirectory();
      const d = await root.getDirectoryHandle('pf', { create: true });
      const h = await d.getFileHandle(name, { create: true });
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await h.createWritable(); await w.write(u); await w.close();
      (window.__pf ||= {})[name] = h;
    }, [name, Buffer.from(buf).toString('base64')]);
    const getFile = async (name) => Buffer.from(await page.evaluate(async (name) => {
      const u = new Uint8Array(await (await window.__pf[name].getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s);
    }, name), 'base64');
    // 空の OPFS のフォルダ（フォルダを選ぶ画面の代わり）
    const emptyDir = (name) => page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(name, { create: true });
      (window.__dirs ||= {})[name] = d;
      window.showDirectoryPicker = async () => d;
    }, name);
    const dirFiles = (name) => page.evaluate(async (name) => {
      const out = {};
      async function go(d, pre) { for await (const [k, h] of d.entries()) { if (h.kind === 'directory') await go(h, pre + k + '/'); else { const u = new Uint8Array(await (await h.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[pre + k] = btoa(s); } } }
      await go(window.__dirs[name], ''); return out;
    }, name);
    const openFile = async (name) => { const n0 = await loads(); const r = await page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), name); return { r, n0 }; };
    const pstate = () => page.evaluate(() => window.__APP_TEST.state());
    const dlgOpen = () => page.evaluate(() => document.getElementById('dlg').open);
    const MINF = 'min' + FORMAT.FILE_EXT;

    // 印のスクリプトのある文書：取り出しの間、アプリのページでも Worker でも動かない
    await putFile('canary' + FORMAT.FILE_EXT, fs.readFileSync(fixture('canary-script').file));
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: canary not set before opening');
    let o = await openFile('canary' + FORMAT.FILE_EXT);
    ok(o.r === true, 'portable: canary fixture opens');
    await waitLoads(o.n0);
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: the canary script never ran in the app page (import reads bytes in a worker)');
    ok(await page.evaluate(() => window.__APP_TEST.workerProbe('__portableCanary')) === null, 'portable: the canary script never ran in the reader worker');
    ok((await pstate()).portable.profile === 'extended' && await page.isVisible('#notice-extended'), 'portable: a file with its own code (extended profile) shows the notice');
    ok((await page.textContent('#notice-extended')).includes('独自のコード'), 'portable: extended notice text (ja)');

    // 独自の部品（原稿のフォルダの部品）のある文書も同じ知らせ
    await putFile('ext' + FORMAT.FILE_EXT, fs.readFileSync(fixture('portable-extended').file));
    o = await openFile('ext' + FORMAT.FILE_EXT);
    await waitLoads(o.n0);
    ok((await pstate()).portable.profile === 'extended' && await page.isVisible('#notice-extended'), 'portable: embedded component → extended notice');

    // examples/minimal の 1 ファイルを開く
    await putFile(MINF, pmin.html);
    o = await openFile(MINF);
    ok(o.r === true, 'portable: opened the minimal portable file without a folder');
    f = await waitLoads(o.n0);
    let ps = await pstate();
    ok(ps.kind === 'memory' && ps.portable.docId === pmin.index.docId && !ps.error, `portable: in-memory workspace, docId ${ps.portable.docId}`);
    ok(await f.evaluate(() => DECK.slides.length) === 6, 'portable: slides render in the preview');
    ok(ps.portable.profile === 'core' && await page.isHidden('#notice'), 'portable: core profile → no code notice');
    ok(await page.isVisible('#b-save') && await page.isVisible('#b-unpack') && await page.isHidden('#b-export') && await page.isHidden('#b-export-portable'), 'portable: toolbar shows Save / Export folder, hides the folder exports');
    ok(ps.portable.stale.length === 0 && ps.portable.readOnly === null, 'portable: no stale audio, editable');

    // 最初の編集の前に権利を見せる
    await f.evaluate(() => DECK.go(2, 3, false));
    await page.click('#b-edit');
    await page.waitForSelector('#dlg[open]');
    const rights = await page.textContent('#rights-list');
    ok(rights.includes('CC-BY-4.0') && rights.includes('© 2026 Test Author') && rights.includes('Test Author, Minimal lesson'), 'rights: license, copyright and attribution shown before the first edit');
    ok(!(await page.$('#rights-nd')) && !(await page.isDisabled('#dlg-ok')), 'rights: CC BY needs no extra confirmation');
    await shot(page, 'portable-rights.png');
    await page.click('#dlg-ok');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
    ok((await pstate()).portable.rightsOk, 'rights: accepted, edit mode on');

    // 文字を直す（いつもの編集の画面）
    const pli = f.locator('#stage .slide.active li[data-step="2"]');
    await pli.dblclick();
    await f.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    await f.locator('#dev-editor textarea').fill('\\(\\eta>0\\)：<b>学習率</b>（1 ファイルで編集）');
    n = await loads();
    await f.locator('#dev-editor textarea').press('Meta+Enter');
    f = await waitLoads(n);
    const wsFiles = async () => Object.fromEntries(Object.entries(await page.evaluate(() => window.__APP_TEST.files())).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
    let mem = await wsFiles();
    ok(mem['deck.html'].toString().includes('（1 ファイルで編集）'), 'portable edit: deck.html changed in memory');
    ok(await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'portable edit: preview shows the new text');
    ok((await pstate()).portable.dirty && (await page.textContent('#deckname')).startsWith('●'), 'portable edit: marked as unsaved');
    ok(Object.keys(mem).some((k) => k.startsWith('.cache/edits/')), 'portable edit: backup kept in memory');
    await page.keyboard.press('e');

    // 口述原稿を直す → その段階の音声は古い（消さない）
    await f.evaluate(() => DECK.go(1, 0, false));
    await page.click('#b-narr');
    await f.waitForSelector('#dev-narr .dev-turn textarea');
    await f.locator('#dev-narr .dev-turn textarea').first().fill('1 ファイルで書き直した口述原稿です。');
    n = await loads();
    await f.locator('#dev-narr .dev-turn textarea').first().press('Meta+Enter');   // ⌘+Enter で保存（引き出しの描き直しでクリックを取りこぼさない）
    f = await waitLoads(n);
    mem = await wsFiles();
    ok(mem['narration.md'].toString().includes('1 ファイルで書き直した口述原稿です。'), 'portable narration: narration.md changed in memory');
    ps = await pstate();
    ok(ps.portable.stale.length === 1 && ps.portable.stale[0] === '何を最小化するか:0' && ps.warn.some((w) => w.includes('何を最小化するか:0')), `portable narration: the edited step is shown as stale (${ps.portable.stale.join(', ')})`);
    await page.click('#b-narr');

    // 保存：同じファイル（OPFS のハンドル）に上書き
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    const savedBuf = await getFile(MINF);
    const saved = await readPortable(new Uint8Array(savedBuf));
    ok(savedBuf.toString() === (await page.evaluate(() => window.__APP_TEST.saved())), 'save: the file handle was overwritten with the saved document');
    ok(saved.docId === pmin.index.docId && saved.deckMeta.docId === pmin.index.docId, 'save: docId unchanged');
    ok(saved.sourceMatches && saved.warnings.length === 0, 'save: the saved file reads back cleanly (hashes, sourceSha256)' + (saved.warnings.length ? ': ' + saved.warnings.join('; ') : ''));
    ok(new TextDecoder().decode(saved.files['deck.html']).includes('（1 ファイルで編集）') && new TextDecoder().decode(saved.files['narration.md']).includes('1 ファイルで書き直した'), 'save: edits are in the saved source');
    const sameAudio = Object.values(pmin.index.audio).every((a) => saved.index.files[a.file] && saved.index.blobs[saved.index.files[a.file]].sha256 === pmin.index.blobs[pmin.index.files[a.file]].sha256);
    ok(sameAudio && Object.keys(saved.index.audio).length === Object.keys(pmin.index.audio).length, 'save: unchanged audio blobs keep the same sha256');
    const mk = '何を最小化するか:0';
    ok(saved.index.audio[mk].inputHash === pmin.index.audio[mk].inputHash && await isStale(saved.index.audio[mk], parseNarration(new TextDecoder().decode(saved.files['narration.md'])).find((x) => `${x.slideKey}:${x.stepKey}` === mk)), 'save: the edited step keeps its old inputHash (stale, audio not deleted)');
    ok(['license', 'copyright', 'attribution', 'creators'].every((k) => JSON.stringify(saved.index.metadata[k]) === JSON.stringify(pmin.index.metadata[k])), 'save: license, copyright, attribution and creators kept');
    ok(!saved.index.metadata.derivedFrom, 'save: same docId → no derivedFrom');
    ok(!Object.keys(saved.files).some((k) => /^\.cache|comments\.json/.test(k)), 'save: backups and notes are not in the file');
    // 展開したフォルダ（npm run portable -- unpack）がメモリの作業場所と同じ
    fs.writeFileSync(path.join(PW, 'saved' + FORMAT.FILE_EXT), savedBuf);
    const U = path.join(PW, 'saved-unpacked');
    const u = await unpack(path.join(PW, 'saved' + FORMAT.FILE_EXT), U);
    mem = await wsFiles();
    const memArchive = Object.keys(mem).filter((k) => !/^\.cache\//.test(k) && k !== 'comments.json').sort();
    ok(JSON.stringify(u.written.slice().sort()) === JSON.stringify(memArchive) && u.written.every((k) => fs.readFileSync(path.join(U, k)).equals(mem[k])), `save: unpacked folder matches the in-memory workspace (${u.written.length} files)`);

    // 開き直す
    o = await openFile(MINF);
    f = await waitLoads(o.n0);
    await f.evaluate(() => DECK.go(2, 3, false));
    ok(o.r === true && await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'reopen: the saved edit is there');
    ok(!(await pstate()).portable.rightsOk, 'reopen: the rights prompt comes again for the newly opened file');

    // フォルダに書き出す（空のフォルダ）→ 中身は unpack と同じ。空でないフォルダは断る
    await emptyDir('unpacked');
    await page.click('#b-unpack');
    await page.waitForFunction(() => document.getElementById('st-msg').textContent.includes('unpacked'), null, { timeout: 15000 });
    const out1 = await dirFiles('unpacked');
    ok(JSON.stringify(Object.keys(out1).sort()) === JSON.stringify(u.written.slice().sort()) && u.written.every((k) => Buffer.from(out1[k], 'base64').equals(fs.readFileSync(path.join(U, k)))), `export folder: same files and bytes as npm run portable -- unpack (${Object.keys(out1).length})`);
    await page.click('#b-unpack');
    await page.waitForSelector('#toast.show.bad');
    ok((await page.textContent('#toast')).includes('空ではありません') && Object.keys(await dirFiles('unpacked')).length === Object.keys(out1).length, 'export folder: a non-empty folder is refused');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });

    // 書き出したフォルダを開き、持ち運べる 1 ファイルに書き出す（フォルダの「1 ファイルを書き出す」）→ 同じ文書
    n = await loads();
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dirs.unpacked)) === true, 'export folder: the exported folder opens as a folder');
    await waitLoads(n);
    ok(await page.isVisible('#b-export-portable') && await page.isHidden('#b-save'), 'folder: toolbar shows Export portable file, hides Save');
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__dirs.unpacked.getFileHandle('re-exported.html', { create: true }); });
    await page.click('#b-export-portable');
    let rx = '';
    for (let i = 0; i < 300 && rx.length < 1000; i++) { await page.waitForTimeout(100); rx = Buffer.from((await dirFiles('unpacked'))['re-exported.html'] || '', 'base64').toString(); }
    const rxr = await readPortable(rx);
    ok(rxr.docId === pmin.index.docId && rxr.index.sourceSha256 === saved.index.sourceSha256, 'export portable (folder): same docId and sourceSha256 as the saved file');
    ok(rx === savedBuf.toString(), 'export portable (folder): byte-identical to the file saved from memory (same editor build)');
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });

    // 改変を認めないライセンス：はっきり確認するまで編集できない。編集の口（プレビューからの書き込み）でも同じ
    await putFile('nd' + FORMAT.FILE_EXT, pnd.html);
    o = await openFile('nd' + FORMAT.FILE_EXT);
    f = await waitLoads(o.n0);
    await f.evaluate(() => { window.__w = window.__DECK_DEV_TRANSPORT.api('POST', '/__dev/comment', { comment: 'x' }); });   // コメントは原稿の編集ではない
    await f.evaluate(() => window.__w);
    ok(!(await dlgOpen()), 'rights: a note (comment) is not an edit and does not ask');
    await f.evaluate(async () => {
      const k = '何を最小化するか';
      const cur = await window.__DECK_DEV_TRANSPORT.api('GET', '/__dev/narration?key=' + encodeURIComponent(k + ':0'));
      window.__w = window.__DECK_DEV_TRANSPORT.api('POST', '/__dev/narration', { slideKey: k, stepKey: '0', rev: cur.rev, turns: [{ role: 'expert', text: '書き換え' }] });
    });
    await page.waitForSelector('#dlg[open]');
    ok(await page.isVisible('#rights-nd') && (await page.textContent('#rights-nd')).includes('改変を認めていません'), 'rights: ND license → warning shown (also when the write comes from the preview)');
    ok(await page.isDisabled('#dlg-ok'), 'rights: ND license → "Start editing" disabled until confirmed');
    await shot(page, 'portable-rights-nd.png');
    await page.click('#dlg-cancel');
    const refused = await f.evaluate(() => window.__w);
    ok(refused._status === 403 && !(await pstate()).portable.dirty, 'rights: declined → the write is refused (403), nothing changed');
    await page.click('#b-narr');
    await page.waitForSelector('#dlg[open]');
    await page.check('#dlg-confirm');
    ok(!(await page.isDisabled('#dlg-ok')), 'rights: confirmed → "Start editing" enabled');
    await page.click('#dlg-ok');
    await f.waitForSelector('#dev-narr .dev-turn textarea');
    ok((await pstate()).portable.rightsOk, 'rights: ND license accepted after explicit confirmation');
    await page.click('#b-narr');

    // 断るファイル：理由を見せる。新しい major の版だけは原稿をフォルダに取り出せる
    for (const [name, code, extract] of [['path-traversal', 'bad-path', false], ['duplicate-member', 'duplicate-member', false], ['unknown-required-feature', 'unknown-feature', false], ['manifest-in-files', 'bad-path', false], ['future-major', 'unsupported-version', true]]) {
      await putFile(name + FORMAT.FILE_EXT, fs.readFileSync(fixture(name).file));
      const before = (await pstate()).portable.name;
      const p = page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), name + FORMAT.FILE_EXT);
      await page.waitForSelector('#dlg[open]');
      const tech = await page.textContent('#dlg pre.tech');
      ok(tech.includes(`[${code}]`) && (await page.textContent('#refuse-reason')).length > 10, `refuse: ${name} → [${code}] with a message`);
      ok(!!(await page.$('#dlg-extract')) === extract, `refuse: ${name} → ${extract ? 'offers' : 'does not offer'} "Export folder…"`);
      if (extract) {
        await emptyDir('extracted');
        await page.click('#dlg-extract');
        ok(await p === false, `refuse: ${name} is not opened for editing`);
        await page.waitForFunction(() => document.getElementById('st-msg').textContent.includes('extracted'), null, { timeout: 15000 });
        const ex = await dirFiles('extracted');
        ok(!!ex['deck.html'] && !!ex['narration.md'] && !!ex['audio/manifest.json'], `refuse: ${name} → source extracted to an empty folder (${Object.keys(ex).length} files)`);
      } else {
        await page.click('#dlg-ok');
        ok(await p === false, `refuse: ${name} is not opened`);
      }
      ok((await pstate()).portable.name === before, `refuse: ${name} → the open file stays open`);
    }
  }

  // 部品庫・テーマ庫がこのエディタと違う文書：読むだけ（編集・保存は断り、フォルダへの書き出しはできる）
  {
    const n0 = await loads();
    await page.evaluate(async (b64) => {
      const root = await navigator.storage.getDirectory();
      const h = await (await root.getDirectoryHandle('pf', { create: true })).getFileHandle('other.html', { create: true });
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await h.createWritable(); await w.write(u); await w.close();
      window.__other = h;
    }, Buffer.from(pother).toString('base64'));
    ok(await page.evaluate(() => window.__APP_TEST.openFile({ handle: window.__other })) === true, 'read-only: a file whose registry theme differs still opens');
    await waitLoads(n0);
    const st = await page.evaluate(() => window.__APP_TEST.state());
    ok(/theme default/.test(st.portable.readOnly || '') && await page.isVisible('#notice-readonly'), 'read-only: registry hash mismatch → read-only notice: ' + st.portable.readOnly);
    await page.click('#b-edit');
    await page.waitForSelector('#toast.show.bad');
    ok(!(await page.evaluate(() => document.getElementById('dlg').open)) && (await page.textContent('#toast')).includes('読むだけ'), 'read-only: editing is refused (no rights prompt)');
    await page.click('#b-save');
    ok((await page.textContent('#toast')).includes('保存できません'), 'read-only: saving is refused');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });
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
  // 持ち運べる 1 ファイル：file:// でも Worker で読める。ファイルを選ぶ画面がなければ「保存」はダウンロード
  await p1.evaluate(() => { window.showSaveFilePicker = undefined; });
  const l1 = await p1.evaluate(() => window.__APP_TEST.state().loads);
  ok(await p1.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'dl' + ext }); }, [Buffer.from(pmin.html).toString('base64'), FORMAT.FILE_EXT]) === true, 'single file: opened a portable file from bytes on file:// (reader worker from a blob URL)');
  await p1.waitForFunction((n) => window.__APP_TEST.state().loads > n, l1, { timeout: 20000 });
  const [dl] = await Promise.all([p1.waitForEvent('download'), p1.click('#b-save')]);
  const dlr = await readPortable(new Uint8Array(fs.readFileSync(await dl.path())));
  ok(dl.suggestedFilename() === 'dl' + FORMAT.FILE_EXT && dlr.docId === pmin.index.docId, `single file: Save without a file handle or picker downloads ${dl.suggestedFilename()} (same docId)`);
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
