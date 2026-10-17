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
import { hostileFiles, PWNED } from './hostile-deck.mjs';
import { regionDiff } from './tier-a-diff.mjs';

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
let hostileQuiet = false;   // 書き込みを試みるデッキの試験の間は、決まり（CSP）に止められた知らせを数えない（止められることを確かめている）
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  if (process.env.APP_DEBUG) p.on('console', (m) => console.log(`    [${tag} ${m.type()}] ${m.text()}`));
  // 衝突の確認（409）とポップアップの許可は意図したもの
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text()) && !(hostileQuiet && /Content Security Policy|Refused to|Failed to fetch|ERR_/.test(m.text()))) errs.push(`${tag} console: ${m.text()}`); });
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
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.DECK_DEV && window.__APP_LOAD === w), want)) { await page.waitForTimeout(120); return f; } } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
// 信頼する編集の道具がどれもプレビューの外にあるか（矩形が重ならない）。印の帯が見えるか。欄を開いている間、プレビューは inert か
const trustedLayout = (p, frameId) => p.evaluate((fid) => {
  const f = document.getElementById(fid).getBoundingClientRect();
  const ids = ['dev-side', 'dev-mark', 'dev-badge', 'dev-editor', 'dev-comment', 'dev-comments', 'dev-narr'].filter((id) => { const e = document.getElementById(id); return e && e.getClientRects().length; });
  const outside = ids.every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.right <= f.left + 0.5 || r.left >= f.right - 0.5 || r.bottom <= f.top + 0.5 || r.top >= f.bottom - 0.5; });
  const mark = document.getElementById('dev-mark');
  return { ids, outside, mark: mark && mark.getClientRects().length ? mark.textContent : null, inert: document.getElementById(fid).inert };
}, frameId);
const loads = () => page.evaluate(() => window.__APP_TEST.state().loads);
const POLL_WAIT = 3500;   // 外での変更の見張り（1.5 秒ごと）と組み直しが一巡りする時間
// 「書き出す ▾」の一覧の項目を押す（一覧を開いてから）
async function menuClick(id, p = page, menu = '#b-exportmenu') { await p.click(menu); await p.waitForSelector(`#${await p.getAttribute(menu, 'aria-controls')}:not([hidden])`); await p.click(id); }
// プレビューが空か（確かめの前に、前のデッキも新しいデッキも何も出ていない・動いていない）
async function previewBlank(p = page) {
  const attr = await p.evaluate(() => { const f = document.getElementById('preview'); return { srcdoc: f.hasAttribute('srcdoc'), src: f.getAttribute('src') }; });
  const fr = p.frames().find((x) => x.parentFrame() === p.mainFrame());
  let inner = null;
  try { inner = fr ? await fr.evaluate(() => ({ deck: typeof window.DECK !== 'undefined', kids: document.body ? document.body.childElementCount : 0, url: location.href })) : null; } catch { inner = null; }
  return !attr.srcdoc && !attr.src && (!inner || (!inner.deck && inner.kids === 0));
}
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

  // ---------------------------------------------------------------- 3. 原稿の編集（プレビューは知らせるだけ。欄はアプリのページに出る）
  await f.evaluate(() => DECK.go(2, 3, false));
  await page.click('#b-edit');
  await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
  ok(true, 'edit: toolbar button turns on edit mode');
  const li = f.locator('#stage .slide.active li[data-step="2"]');
  await li.dblclick();
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  const ta = page.locator('#dev-editor textarea');
  ok((await ta.inputValue()).includes('学習率'), 'edit: the editor (in the app page, outside the preview) shows the raw source');
  ok(!(await f.$('#dev-editor')), 'edit: no editor inside the preview');
  const lay = await trustedLayout(page, 'preview');
  ok(lay.outside && lay.ids.includes('dev-editor') && lay.mark === '編集中 — アプリ' && lay.inert === true, 'edit: every trusted control is outside the slide area, under the "編集中 — アプリ" marker; the preview is inert while the editor is open ' + JSON.stringify(lay));
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
  // 書きかけのあいだに外で原稿が変わった → 保存は 409（入力は残る）
  await f.locator('#stage .slide.active li[data-step="3"]').dblclick();
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  await page.fill('#dev-editor textarea', '書きかけ');
  n = await loads();
  const deckExt = deck1.replace('<h2>更新の式</h2>', '<h2>更新の式（外で）</h2>');
  await opfs.write('deck.html', deckExt);
  f = await waitLoads(n, 10000);
  ok((await page.inputValue('#dev-editor textarea')) === '書きかけ', 'edit conflict: the open editor keeps unsaved input across the reload');
  await page.press('#dev-editor textarea', 'Meta+Enter');
  await page.waitForSelector('#dev-editor .dev-msg.dv-err');
  ok(/原稿が変わっています/.test(await page.textContent('#dev-editor .dev-msg')) && (await opfs.read('deck.html')) === deckExt, 'edit conflict: stale hash is rejected (409), shown in the editor, file untouched');
  await page.press('#dev-editor textarea', 'Escape');
  n = await loads();
  await opfs.write('deck.html', deck1);
  f = await waitLoads(n, 10000);

  // ---------------------------------------------------------------- 4. 口述原稿（narration.md を CRLF にして、書き戻しが CRLF のままか）
  // （改行だけの違いは組み立ての結果を変えないので、プレビューは読み込み直さない。組み直しを待つ）
  const b0 = await page.evaluate(() => window.__APP_TEST.state().builds);
  await opfs.write('narration.md', (await opfs.read('narration.md')).replace(/\r?\n/g, '\r\n'));
  await page.waitForFunction((b0) => window.__APP_TEST.state().builds > b0, b0, { timeout: 10000 });
  await f.locator('body').press('e');   // 編集モードを切る（デッキで押した e は知らせとしてアプリに届く）
  await page.waitForFunction(() => !window.__APP_TEST.ui().edit);
  ok(!(await f.evaluate(() => document.documentElement.classList.contains('dev-edit'))), 'edit: e pressed in the preview turns edit mode off (forwarded hint)');
  await f.evaluate(() => DECK.go(1, 0, false));
  await page.click('#b-narr');
  await page.waitForSelector('#dev-narr .dev-turn textarea');
  const nta = page.locator('#dev-narr .dev-turn textarea').first();
  await nta.fill('アプリから書き直した口述原稿です。');
  await page.click('#dev-narr button:has-text("発言を足す")');
  await page.locator('#dev-narr .dev-turn textarea').last().fill('足した発言です。');
  await shot(page, 'narration.png');
  n = await loads();
  await page.click('#dev-narr .dv-foot button.dv-pri');
  f = await waitLoads(n);
  const narr1 = await opfs.read('narration.md');
  ok(narr1.includes('アプリから書き直した口述原稿です。') && narr1.includes('足した発言です。'), 'narration: narration.md changed (turn added)');
  ok(!/(^|[^\r])\n/.test(narr1), 'narration: CRLF line endings kept');
  ok(await f.evaluate(() => JSON.stringify(DECK.NARRATION).includes('アプリから書き直した')), 'narration: rebuilt deck has the new narration');
  ok(await page.isVisible('#dev-narr'), 'narration: drawer stays open after reload');
  // 外で変わった後の保存は 409（引き出しに出る）
  await page.locator('#dev-narr .dev-turn textarea').first().fill('書きかけ');
  n = await loads();
  const narrExt = narr1.replace('足した発言です。', '外で直した発言です。');
  await opfs.write('narration.md', narrExt);
  f = await waitLoads(n, 10000);
  await page.press('#dev-narr .dev-turn textarea >> nth=0', 'Meta+Enter');
  await page.waitForSelector('#dev-narr .dev-msg.dv-err');
  ok(/口述原稿が変わっています/.test(await page.textContent('#dev-narr .dev-msg')) && (await opfs.read('narration.md')) === narrExt, 'narration: stale revision is rejected (409), file untouched');
  n = await loads();
  await page.click('#dev-narr .dev-msg button');
  f = await waitLoads(n);
  await page.waitForFunction(() => [...document.querySelectorAll('#dev-narr .dev-turn textarea')].some((t) => t.value === '外で直した発言です。'));
  ok(true, 'narration: reload after the conflict shows the current text');
  await page.click('#b-narr');

  // ---------------------------------------------------------------- 5. コメント（Alt+クリック）
  const target = f.locator('#stage .slide.active h2');
  await target.click({ modifiers: ['Alt'] });
  await page.waitForSelector('#dev-comment textarea');
  await page.fill('#dev-comment textarea', 'この見出しを短く');
  await shot(page, 'comment.png');
  const lay2 = await trustedLayout(page, 'preview');
  ok(lay2.outside && lay2.ids.includes('dev-comment') && lay2.inert === true, 'comment: the note box is in the trusted side panel, the preview is inert ' + JSON.stringify(lay2));
  await page.press('#dev-comment textarea', 'Meta+Enter');
  await page.waitForTimeout(400);
  ok((await trustedLayout(page, 'preview')).inert === false, 'comment: the preview takes clicks again after the note box closes');
  const comments = JSON.parse(await opfs.read('comments.json') || '[]');
  ok(comments.length === 1 && comments[0].comment === 'この見出しを短く' && comments[0].status === 'open' && comments[0].key === '何を最小化するか:0', 'comment: comments.json written');
  await page.click('#b-comments');
  await page.waitForSelector('#dev-comments .dev-c');
  ok((await page.textContent('#dev-comments')).includes('この見出しを短く'), 'comment: listed in the comments panel');
  await page.click('#dev-comments .dev-c button');
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
  await menuClick('#b-export');
  let exp = '';
  for (let i = 0; i < 200 && exp.length < 1000; i++) { await page.waitForTimeout(100); exp = (await opfs.read('export.html')) || ''; }
  ok(exp.startsWith('<!DOCTYPE html>') && exp.includes('id="deck-narration"') && !exp.includes('data-src=') && !exp.includes('edit-hint'), `export: single HTML without editing hooks (${(exp.length / 1024).toFixed(0)} KB)`);
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
    // 原稿のフォルダの部品（そのデッキのコード）：プレビューを始める前に知らせる
    const op = page.evaluate(() => window.__APP_TEST_OPEN(window.__tmlr));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-lead')).includes('components/') && (await loads()) === n0, 'tmlr: deck-local components → asked before the preview starts (nothing loaded yet)');
    ok(await previewBlank(), 'tmlr: the preview is blank behind the question (the previous deck is gone, nothing of the new deck rendered or ran)');
    await shot(page, 'code-consent.png');
    await page.click('#dlg-run');
    ok(await op === true, 'tmlr: opened after "Start the preview"');
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
    // 開く。独自のコードを含むファイルなら、プレビューを始める前の確かめが出る（run：始める／取り消す）
    const openFile = async (name, run = true) => {
      const n0 = await loads();
      const p = page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), name);
      const asked = await Promise.race([p.then(() => false), page.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 }).then(() => true)]);
      let blank = null;
      if (asked) { if ((await loads()) !== n0) throw new Error('preview loaded before the code notice'); blank = await previewBlank(); await page.click(run ? '#dlg-run' : '#dlg-cancel'); }
      return { r: await p, n0, asked, blank };
    };
    const pstate = () => page.evaluate(() => window.__APP_TEST.state());
    const dlgOpen = () => page.evaluate(() => document.getElementById('dlg').open);
    const MINF = 'min' + FORMAT.FILE_EXT;

    // 印のスクリプトのある文書：取り出しの間、アプリのページでも Worker でも動かない
    await putFile('canary' + FORMAT.FILE_EXT, fs.readFileSync(fixture('canary-script').file));
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: canary not set before opening');
    let o = await openFile('canary' + FORMAT.FILE_EXT, false);
    ok(o.asked && o.blank && o.r === false && (await pstate()).kind === 'folder', 'portable: a file with its own code asks before any of it runs (the preview is blank behind the question); Cancel → not opened (the folder stays)');
    await waitLoads(o.n0);
    ok(await deckFrame().evaluate(() => DECK.slides.length) > 0, 'portable: after Cancel the open folder\'s preview comes back');
    o = await openFile('canary' + FORMAT.FILE_EXT);
    ok(o.asked && o.blank && o.r === true, 'portable: canary fixture opens after "Start the preview" (blank preview while asking)');
    await waitLoads(o.n0);
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: the canary script never ran in the app page (import reads bytes in a worker)');
    ok(await page.evaluate(() => window.__APP_TEST.workerProbe('__portableCanary')) === null, 'portable: the canary script never ran in the reader worker');
    ok((await pstate()).portable.profile === 'extended' && await page.isVisible('#notice-extended'), 'portable: a file with its own code (extended profile) shows the notice');
    ok((await page.textContent('#notice-extended')).includes('独自のコード'), 'portable: extended notice text (ja)');

    // 独自の部品（原稿のフォルダの部品）のある文書も同じ知らせ
    await putFile('ext' + FORMAT.FILE_EXT, fs.readFileSync(fixture('portable-extended').file));
    o = await openFile('ext' + FORMAT.FILE_EXT);
    ok(o.asked, 'portable: embedded component → asked before the preview starts');
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
    ok(await page.isVisible('#b-save') && await page.isVisible('#b-savemenu') && await page.isHidden('#m-save'), 'portable: toolbar shows Save and its menu button');
    await page.click('#b-savemenu');
    ok(await page.isVisible('#b-savenew') && await page.isVisible('#b-saveas'), 'portable: the Save menu has Save as new lesson / Save a copy');
    await shot(page, 'portable-save-menu.png');
    await page.keyboard.press('Escape');
    await page.click('#b-exportmenu');
    ok(await page.isVisible('#b-unpack') && await page.isHidden('#b-export') && await page.isHidden('#b-export-portable') && await page.isHidden('#m-save'), 'portable: the Export menu has Export folder, not the folder exports (and opening it closed the Save menu)');
    await page.keyboard.press('Escape');
    ok(await page.isHidden('#m-export'), 'menu: Esc closes the Export menu');
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
    await page.click('#b-edit');

    // 段 A：口述原稿だけを直して保存 → 組み直さない。決まった場所の外は 1 バイトも変わらず、新しい字は字の補いで
    await f.evaluate(() => DECK.go(1, 0, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('まず、何を最小化するのかを確かめます。鬱蒼とした森で考えます。');
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    await page.click('#b-narr');
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    ok(!(await dlgOpen()), 'tier A: narration-only change saves without the rebuild warning');
    const aBuf = await getFile(MINF);
    let ps0 = await pstate();
    ok(ps0.portable.lastTier === 'A' && ps0.portable.lastTierA && ps0.portable.lastTierA.narration.join() === '何を最小化するか:0', 'tier A: saved without rebuilding (only the edited step)');
    try { regionDiff(pmin.html, aBuf.toString(), { narration: ['何を最小化するか:0'] }); ok(true, 'tier A: every byte outside the §7.2 regions is unchanged (region-aware diff)'); }
    catch (e) { ok(false, 'tier A: region-aware diff: ' + e.message.slice(0, 300)); }
    ok(aBuf.toString().includes(`id="${FORMAT.FONT_SUPPLEMENT_PREFIX}0"`) && ps0.portable.lastTierA.supplement && ps0.portable.lastTierA.supplement.chars.includes('鬱'), 'tier A: a font supplement for the new glyphs (fetched from the app\'s own font files)');
    const aRead = await readPortable(new Uint8Array(aBuf));
    ok(aRead.sourceMatches && aRead.warnings.length === 0 && aRead.docId === pmin.index.docId && !aRead.index.metadata.derivedFrom, 'tier A: the saved file reads back cleanly, same docId, no derivedFrom');
    ok(ps0.portable.stale.includes('何を最小化するか:0') && JSON.stringify(aRead.index.audio['何を最小化するか:0']) === JSON.stringify(pmin.index.audio['何を最小化するか:0']), 'tier A: the edited step\'s audio is kept as is and shown as stale');
    await shot(page, 'portable-tier-a-saved.png');
    await f.evaluate(() => DECK.go(2, 3, false));
    await page.click('#b-edit');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));

    // 文字を直す（いつもの編集の画面）
    const pli = f.locator('#stage .slide.active li[data-step="2"]');
    await pli.dblclick();
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    await page.locator('#dev-editor textarea').fill('\\(\\eta>0\\)：<b>学習率</b>（1 ファイルで編集）');
    n = await loads();
    await page.click('#dev-editor button.dv-pri');   // 保存（⌘+Enter はフォルダの試験で確かめた）
    f = await waitLoads(n);
    const wsFiles = async () => Object.fromEntries(Object.entries(await page.evaluate(() => window.__APP_TEST.files())).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
    let mem = await wsFiles();
    ok(mem['deck.html'].toString().includes('（1 ファイルで編集）'), 'portable edit: deck.html changed in memory');
    ok(await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'portable edit: preview shows the new text');
    ok((await pstate()).portable.dirty && (await page.textContent('#deckname')).startsWith('●'), 'portable edit: marked as unsaved');
    ok(Object.keys(mem).some((k) => k.startsWith('.cache/edits/')), 'portable edit: backup kept in memory');
    await page.click('#b-edit');

    // 口述原稿を直す → その段階の音声は古い（消さない）
    await f.evaluate(() => DECK.go(1, 0, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('1 ファイルで書き直した口述原稿です。');
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    mem = await wsFiles();
    ok(mem['narration.md'].toString().includes('1 ファイルで書き直した口述原稿です。'), 'portable narration: narration.md changed in memory');
    ps = await pstate();
    ok(ps.portable.stale.length === 1 && ps.portable.stale[0] === '何を最小化するか:0' && ps.warn.some((w) => w.includes('何を最小化するか:0')), `portable narration: the edited step is shown as stale (${ps.portable.stale.join(', ')})`);
    await page.click('#b-narr');

    // 保存：スライドを直したので段 B（組み直す）。保存の前に、編集していないスライドの見え方が変わりうることを知らせる
    await page.click('#b-save');
    await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
    ok((await page.textContent('#tier-b-warn')).includes('編集していないスライドも、見え方が変わることがあります'), 'tier B: warns before saving that slides you did not edit may look different');
    ok((await page.textContent('#dlg-body')).includes('スライドの原稿を直したので'), 'tier B: says why it cannot save without rebuilding');
    await shot(page, 'portable-tier-b-warning.png');
    await page.click('#dlg-cancel');
    await page.waitForTimeout(200);
    ok((await pstate()).portable.dirty, 'tier B: Cancel → not saved');
    await page.click('#b-save');
    await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
    await page.click('#dlg-rebuild');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    ok((await pstate()).portable.lastTier === 'B', 'tier B: rebuilt and saved');
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

    // 新しい教材として保存：新しい docId と derivedFrom（元の docId と sourceSha256）。権利の表示と作り手はそのまま。変更がなければ段 A
    await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('pf', { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('new-lesson.html', { create: true }); });
    await menuClick('#b-savenew', page, '#b-savemenu');
    await page.waitForFunction((id) => window.__APP_TEST.state().portable.docId !== id, pmin.index.docId, { timeout: 30000 });
    const nl = await readPortable(new Uint8Array(Buffer.from(await page.evaluate(async () => { const u = new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }), 'base64')));
    ok(nl.docId !== pmin.index.docId && nl.deckMeta.docId === nl.docId && JSON.parse(new TextDecoder().decode(nl.files[FORMAT.CONFIG_FILE])).docId === nl.docId, `save as new lesson: new docId ${nl.docId} (index, deck-meta and ${FORMAT.CONFIG_FILE})`);
    ok(JSON.stringify(nl.index.metadata.derivedFrom) === JSON.stringify({ docId: pmin.index.docId, sourceSha256: saved.index.sourceSha256 }), 'save as new lesson: derivedFrom = the original docId and sourceSha256');
    ok(['license', 'copyright', 'attribution', 'creators'].every((k) => JSON.stringify(nl.index.metadata[k]) === JSON.stringify(pmin.index.metadata[k])), 'save as new lesson: copyright, attribution and creators kept');
    ok((await pstate()).portable.lastTier === 'A' && nl.sourceMatches, 'save as new lesson: no other change → saved without rebuilding');
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });

    // 開き直す
    o = await openFile(MINF);
    f = await waitLoads(o.n0);
    await f.evaluate(() => DECK.go(2, 3, false));
    ok(o.r === true && await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'reopen: the saved edit is there');
    ok(!(await pstate()).portable.rightsOk, 'reopen: the rights prompt comes again for the newly opened file');

    // フォルダに書き出す（空のフォルダ）→ 中身は unpack と同じ。空でないフォルダは断る
    await emptyDir('unpacked');
    await menuClick('#b-unpack');
    await page.waitForFunction(() => document.getElementById('st-msg').textContent.includes('unpacked'), null, { timeout: 15000 });
    const out1 = await dirFiles('unpacked');
    ok(JSON.stringify(Object.keys(out1).sort()) === JSON.stringify(u.written.slice().sort()) && u.written.every((k) => Buffer.from(out1[k], 'base64').equals(fs.readFileSync(path.join(U, k)))), `export folder: same files and bytes as npm run portable -- unpack (${Object.keys(out1).length})`);
    await menuClick('#b-unpack');
    await page.waitForSelector('#toast.show.bad');
    ok((await page.textContent('#toast')).includes('空ではありません') && Object.keys(await dirFiles('unpacked')).length === Object.keys(out1).length, 'export folder: a non-empty folder is refused');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });

    // 書き出したフォルダを開き、持ち運べる 1 ファイルに書き出す（フォルダの「1 ファイルを書き出す」）→ 同じ文書
    n = await loads();
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dirs.unpacked)) === true, 'export folder: the exported folder opens as a folder');
    await waitLoads(n);
    await page.click('#b-exportmenu');
    ok(await page.isVisible('#b-export-portable') && await page.isHidden('#b-save') && await page.isHidden('#b-savenew'), 'folder: the Export menu has Export portable file; Save is hidden');
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__dirs.unpacked.getFileHandle('re-exported.html', { create: true }); });
    await menuClick('#b-export-portable');
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
    // コメントは原稿の編集ではない（権利を聞かない）
    await f.locator('#stage .slide.active h1, #stage .slide.active h2').first().click({ modifiers: ['Alt'] });
    await page.waitForSelector('#dev-comment textarea');
    await page.fill('#dev-comment textarea', 'x');
    await page.press('#dev-comment textarea', 'Meta+Enter');
    await page.waitForSelector('#dev-comment', { state: 'detached' });
    ok(!(await dlgOpen()), 'rights: a note (comment) is not an edit and does not ask');
    // デッキで押した n（知らせ）でも、口述原稿を開く前に権利を見せる
    await f.locator('body').press('n');
    await page.waitForSelector('#dlg[open]');
    ok(await page.isVisible('#rights-nd') && (await page.textContent('#rights-nd')).includes('改変を認めていません'), 'rights: ND license → warning shown (also when n is pressed in the preview)');
    ok(await page.isDisabled('#dlg-ok'), 'rights: ND license → "Start editing" disabled until confirmed');
    await shot(page, 'portable-rights-nd.png');
    await page.click('#dlg-cancel');
    await page.waitForTimeout(200);
    ok(!(await page.$('#dev-narr')) && !(await pstate()).portable.dirty, 'rights: declined → the drawer does not open, nothing changed');
    await page.click('#b-narr');
    await page.waitForSelector('#dlg[open]');
    await page.check('#dlg-confirm');
    ok(!(await page.isDisabled('#dlg-ok')), 'rights: confirmed → "Start editing" enabled');
    await page.click('#dlg-ok');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    ok((await pstate()).portable.rightsOk, 'rights: ND license accepted after explicit confirmation');
    await page.click('#b-narr');

    // 断るファイル：理由を見せる。新しい major の版だけは原稿をフォルダに取り出せる
    for (const [name, code, extract] of [['path-traversal', 'bad-path', false], ['duplicate-member', 'duplicate-member', false], ['unknown-required-feature', 'unknown-feature', true], ['manifest-in-files', 'bad-path', false], ['future-major', 'unsupported-version', true]]) {
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

    // 知らない項目をどの深さにも持つ文書：段 A の保存でも段 B の保存でも残る（§7.1）
    {
      const UF = 'unknown' + FORMAT.FILE_EXT;
      await putFile(UF, fs.readFileSync(fixture('unknown-members-everywhere').file));
      o = await openFile(UF);
      f = await waitLoads(o.n0);
      const kept = (ix) => ix.futureMember && ix.futureMember.kept === true && ix.version.xPatch === 7 && ix.metadata.xAudienceNote === 'kept'
        && Object.values(ix.audio).every((a) => a.xTake && a.xTake.kept === true) && ix.extensions.chapters && ix.extensions.chapters.xNote === 'kept'
        && (ix.themes || []).every((t) => t.xRegistryUrl === 'kept');
      await page.click('#b-narr');
      await page.waitForSelector('#dlg[open] #dlg-ok');
      await page.click('#dlg-ok');
      await page.waitForSelector('#dev-narr .dev-turn textarea');
      await page.locator('#dev-narr .dev-turn textarea').first().fill('知らない項目を残す試験です。');
      n = await loads();
      await page.click('#dev-narr .dv-foot button.dv-pri');
      f = await waitLoads(n);
      await page.click('#b-narr');
      await page.click('#b-save');
      await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
      const u1 = await readPortable(new Uint8Array(await getFile(UF)));
      ok((await pstate()).portable.lastTier === 'A' && kept(u1.index) && u1.sourceMatches, 'unknown members: kept at every level by a tier A save');
      // スライドを直す → 段 B（組み直し）でも残る
      await page.click('#b-edit');
      await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
      await f.locator('#stage .slide.active h1, #stage .slide.active h2').first().dblclick();
      await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
      await page.locator('#dev-editor textarea').fill('はじめに（段 B）');
      n = await loads();
      await page.click('#dev-editor button.dv-pri');
      f = await waitLoads(n);
      await page.click('#b-edit');
      await page.click('#b-save');
      await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
      await page.click('#dlg-rebuild');
      await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
      const u2 = await readPortable(new Uint8Array(await getFile(UF)));
      ok((await pstate()).portable.lastTier === 'B' && kept(u2.index) && u2.sourceMatches && new TextDecoder().decode(u2.files['deck.html']).includes('はじめに（段 B）'), 'unknown members: kept at every level by a tier B save (rebuild)');
      ok(!u2.index.metadata.derivedFrom && u2.docId === u1.docId, 'unknown members: Save keeps the docId and adds no derivedFrom');
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
    ok(/theme default/.test(st.portable.tierAOnly || '') && !st.portable.readOnly && await page.isVisible('#notice-tier-a'), 'tier A only: registry hash mismatch → only narration, audio and timing can be edited (§6): ' + st.portable.tierAOnly);
    await page.click('#b-edit');
    await page.waitForSelector('#toast.show.bad');
    ok(!(await page.evaluate(() => document.getElementById('dlg').open)) && (await page.textContent('#toast')).includes('スライドを編集できません'), 'tier A only: slide editing is refused (no rights prompt)');
    await shot(page, 'portable-tier-a-only.png');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });
    // 口述原稿は直せる（権利を見せてから）。保存は段 A
    let of = deckFrame();
    await of.evaluate(() => DECK.go(1, 1, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dlg[open] #dlg-ok');
    await page.click('#dlg-ok');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('部品庫の違う文書でも口述原稿は直せます。');
    const nn = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    of = await waitLoads(nn);
    await page.click('#b-narr');
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    const oth = await page.evaluate(async () => { const u = new Uint8Array(await (await window.__other.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    const othText = Buffer.from(oth, 'base64').toString();
    let othOk = true; try { regionDiff(pother, othText, { narration: ['何を最小化するか:1'] }); } catch (e) { othOk = false; console.log('    ' + e.message.slice(0, 300)); }
    ok((await page.evaluate(() => window.__APP_TEST.state())).portable.lastTier === 'A' && othOk && JSON.parse(scanDocument(othText).byId.get(FORMAT.INDEX_ID).text).themes[0].sha256 === '0'.repeat(64), 'tier A only: narration saved without rebuilding; the registry entry and every other byte kept');
  }

  // ---------------------------------------------------------------- 10c. 書き込みを試みるデッキ（tools/hostile-deck.mjs：部品とインラインのスクリプト）
  // プレビューからは何も書けない：古い書き込みの知らせ（app-api）は受け取られず、ネットワークは決まり（CSP）で止まり、合言葉もアプリの文書もない。
  // 知らせ（edit-hint）はアプリの欄を開くだけで、書き込みはアプリの欄の「保存」を押したときだけ
  {
    const HF = hostileFiles();
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('hostile', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('hostile', { create: true });
      for (const [rel, text] of Object.entries(files)) {
        const parts = rel.split('/'); const name = parts.pop(); let x = d;
        for (const q of parts) x = await x.getDirectoryHandle(q, { create: true });
        const w = await (await x.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
      }
      window.__hostile = d;
    }, HF);
    const hsnap = () => page.evaluate(async (names) => {
      const out = {};
      for (const rel of names) {
        try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__hostile; for (const x of parts) d = await d.getDirectoryHandle(x); out[rel] = await (await (await d.getFileHandle(name)).getFile()).text(); }
        catch { out[rel] = null; }
      }
      out['.cache'] = await window.__hostile.getDirectoryHandle('.cache').then(() => 'exists', () => null);
      return out;
    }, [...Object.keys(HF), 'comments.json']);
    const want0 = JSON.stringify({ ...HF, 'comments.json': null, '.cache': null });
    const untouched = async () => JSON.stringify(await hsnap()) === want0;
    hostileQuiet = true;
    // 1. 取り消せばプレビューは始まらない
    let n0 = await loads();
    let op = page.evaluate(() => window.__APP_TEST_OPEN(window.__hostile));
    await page.waitForSelector('#dlg[open] #dlg-run');
    await page.click('#dlg-cancel');
    ok(await op === false && (await loads()) === n0 && !(await page.evaluate(() => window.__APP_TEST.state().open)), 'hostile: Cancel on the code notice → the folder is not opened and no preview runs');
    // 2. 始める → 部品とスクリプトはプレビューの中だけで動く
    op = page.evaluate(() => window.__APP_TEST_OPEN(window.__hostile));
    await page.waitForSelector('#dlg[open] #dlg-run');
    await page.click('#dlg-run');
    ok(await op === true, 'hostile: opened after "Start the preview"');
    f = await waitLoads(n0);
    ok(await f.evaluate(() => window.__evilMounted === true), 'hostile: the component ran (in the sandboxed preview)');
    await page.waitForTimeout(600);   // 読み込んだときの試み（古い書き込みの知らせ）
    const R = await f.evaluate((o) => window.__attack(o), { base: BASE, guess: '0'.repeat(48) });
    ok(R.token === 'undefined' && R.parentToken === 'blocked', 'hostile: no token in the preview');
    ok(R.parentDoc === 'blocked' && R.topDoc === 'blocked' && R.storage === 'blocked', 'hostile: parent.document / top.document / storage blocked (opaque origin)');
    ok(R.net.length === 12 && R.net.every((x) => / blocked$/.test(x)), 'hostile: fetch / XHR POST to /__dev/edit, /__dev/narration, /__dev/comment blocked by the preview CSP (connect-src \'none\') ' + JSON.stringify(R.net));
    ok(R.violations.some((v) => v.startsWith('connect-src')), 'hostile: connect-src violations reported');
    await page.waitForTimeout(400);
    ok(await untouched(), 'hostile: the old app-api write messages and the network attempts changed nothing in the folder');
    // 3. 偽の本文を付けた知らせ
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForTimeout(300);
    ok(!(await page.$('#dev-editor')), 'hostile: an edit hint outside edit mode opens nothing');
    await page.click('#b-edit');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    const range = await f.evaluate(() => document.querySelector('#stage [data-src]').getAttribute('data-src').split('-').map(Number));
    const shown = await page.inputValue('#dev-editor textarea');
    ok(shown === HF['deck.html'].slice(range[0], range[1]) && !shown.includes(PWNED), 'hostile: the edit hint opens the app editor with the real source, not the forged text: ' + JSON.stringify(shown));
    await shot(page, 'hostile-hint.png');
    await page.waitForTimeout(300);
    ok(await untouched(), 'hostile: nothing written while the editor is open');
    await page.press('#dev-editor textarea', 'Escape');
    await f.evaluate(() => window.__hint('comment'));
    await page.waitForSelector('#dev-comment textarea');
    ok((await page.inputValue('#dev-comment textarea')) === '' && (await page.textContent('#dev-comment .dv-q')).includes(PWNED + '-QUOTE'), 'hostile: a comment hint opens an empty note box (the forged note text is ignored)');
    await page.press('#dev-comment textarea', 'Escape');
    await f.evaluate(() => window.__hint('n'));
    await page.waitForSelector('#dev-narr');
    await page.waitForTimeout(300);
    ok(await untouched(), 'hostile: forged hints (edit, comment, n) wrote nothing');
    // 4. アプリの欄の「保存」を押したときだけ書く
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    await page.fill('#dev-editor textarea', '信頼する画面で直した見出し');
    n0 = await loads();
    await page.click('#dev-editor button.dv-pri');
    f = await waitLoads(n0);
    const after = await hsnap();
    ok(after['deck.html'].includes('信頼する画面で直した見出し') && after['narration.md'] === HF['narration.md'] && after['comments.json'] === null, 'hostile: the write happens only on Save in the app editor');
    await page.click('#b-narr');
    await page.click('#b-edit');
    hostileQuiet = false;
  }

  // ---------------------------------------------------------------- 10e. コードが動くかは中身から決める（申告の profile を信じない。§6）・確かめはプレビューと発表者ビューのどちらにも効く
  {
    hostileQuiet = true;
    const MIN = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
    const ONERR = MIN.replace('</section>', '<img alt="" src="data:," onerror="window.__onerrorRan = 1">\n</section>');
    const mkdir = (name, files) => page.evaluate(async ([name, files]) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(name, { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      (window.__cdirs ||= {})[name] = d;
    }, [name, files]);
    const narrMin = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
    // 大きすぎるファイル：File.size で読む前に断る（arrayBuffer() を呼ばない）
    const big = page.evaluate(() => window.__APP_TEST.openFile({ file: { name: 'big.html', size: 200 * 1024 * 1024, arrayBuffer() { window.__bigRead = true; return Promise.resolve(new ArrayBuffer(8)); } } }));
    await page.waitForSelector('#dlg[open] #refuse-reason');
    ok((await page.textContent('#dlg .tech')).includes('file-too-large') && !(await page.evaluate(() => window.__bigRead)), 'size: an oversized file is refused from File.size before it is read');
    await page.click('#dlg-ok');
    ok(await big === false, 'size: the oversized file is not opened');
    // フォルダ：<script> も部品もなく、<img onerror> だけ → 聞く（以前は見逃していた）
    await mkdir('c-onerror', { 'deck.html': ONERR, 'narration.md': narrMin });
    let n0 = await loads();
    let op = page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-onerror']));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-why')).includes('onerror') && (await loads()) === n0, 'consent: a folder deck with only <img onerror> (no <script>, no component) is asked about before anything runs');
    await page.click('#dlg-cancel');
    ok(await op === false && (await loads()) === n0, 'consent: Cancel → not opened, nothing loaded');
    // 持ち運べる 1 ファイル：申告は core、中身には <script>（hash は正しい） → コードを含むものとして聞き、食い違いを知らせる
    const mis = fs.readFileSync(fixture('mislabelled-core-script').file);
    n0 = await loads();
    op = page.evaluate((b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'mislabelled.html' }); }, mis.toString('base64'));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok(await page.isVisible('#code-mislabel') && (await page.textContent('#code-why')).includes('<script>') && (await loads()) === n0 && await previewBlank(), 'consent: a hash-valid archive labelled core but carrying <script> is asked about (label ignored), with a warning about the inconsistent label; the preview is blank meanwhile');
    await shot(page, 'code-mislabelled.png');
    await page.click('#dlg-run');
    ok(await op === true, 'consent: opened after "Start the preview"');
    await waitLoads(n0);
    const ms = (await page.evaluate(() => window.__APP_TEST.state())).portable;
    ok(ms.profile === 'core' && ms.extended && ms.mislabelled && await page.isVisible('#notice-mislabel') && (await page.evaluate(() => window.__APP_TEST.state().warn)).some((w) => /core/.test(w)), 'consent: the mislabelled file is treated as containing code (notice and warning shown)');
    // 組み直し（外での変更の見張り）で後からコードが現れたとき：取り消せば、プレビューも発表者ビューも読み込まない
    await mkdir('c-poll', { 'deck.html': MIN, 'narration.md': narrMin });
    op = await page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-poll']));
    await frameReady();
    ok(op === true && !(await page.$('#dlg[open]')), 'consent: a deck without code opens without a question');
    const [pp] = await Promise.all([ctx.waitForEvent('page'), page.click('#b-presenter')]);
    await page.waitForFunction(() => window.__APP_TEST.state().presLoads > 0);
    const before = await page.evaluate(() => window.__APP_TEST.state());
    await page.evaluate(async (text) => { const w = await (await window.__cdirs['c-poll'].getFileHandle('deck.html')).createWritable(); await w.write(text); await w.close(); }, ONERR);
    await page.waitForSelector('#dlg[open] #dlg-run', { timeout: 20000 });
    ok((await page.evaluate(() => window.__APP_TEST.state().presLoads)) === before.presLoads && (await loads()) === before.loads, 'consent: code appearing on a polling rebuild is asked about before the preview or the presenter view loads it');
    await page.click('#dlg-cancel');
    await page.waitForTimeout(POLL_WAIT);
    await page.evaluate(async (text) => { const w = await (await window.__cdirs['c-poll'].getFileHandle('deck.html')).createWritable(); await w.write(text); await w.close(); }, ONERR.replace('</body>', '<p>again</p></body>'));
    await page.waitForTimeout(POLL_WAIT);
    const aft = await page.evaluate(() => window.__APP_TEST.state());
    ok(aft.presLoads === before.presLoads && aft.loads === before.loads && !aft.allowed && !aft.presenter && pp.isClosed() && await previewBlank() && !(await page.$('#dlg[open]')),
      'consent: after Cancel, later rebuilds load neither the preview nor the presenter view (presenter closed, preview blank, not asked again) ' + JSON.stringify({ presLoads: [before.presLoads, aft.presLoads], loads: [before.loads, aft.loads], allowed: aft.allowed }));
    hostileQuiet = false;
  }

  // ---------------------------------------------------------------- 10d. 道具の列：1280 px 以上では 1 行に収まる（日本語・英語、フォルダ・1 ファイル）
  for (const lang of ['ja', 'en']) {
    const pt = await ctx.newPage();   // 同じ文脈（OPFS の minimal を開く）。言葉は ?lang= で
    watch(pt, 'toolbar-' + lang);
    await pt.goto(BASE + '?lang=' + lang);
    await pt.waitForSelector('#drop');
    const rows = () => pt.evaluate(() => {
      const els = [...document.querySelectorAll('#top > *, #tools > *')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && e.id !== 'tools');
      const mids = els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
      const right = Math.round(Math.max(...els.map((e) => e.getBoundingClientRect().right)));
      return { spread: Math.max(...mids) - Math.min(...mids), h: document.getElementById('top').getBoundingClientRect().height, n: els.length, right, fits: right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    await pt.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__open = await root.getDirectoryHandle('minimal'); });
    await pt.evaluate(() => window.__APP_TEST_OPEN(window.__open));
    await pt.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
    for (const [kind, open] of [['folder', null], ['portable', async () => {
      await pt.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson-with-a-long-name' + ext }); }, [Buffer.from(pmin.html).toString('base64'), FORMAT.FILE_EXT]);
      await pt.waitForFunction(() => window.__APP_TEST.state().kind === 'memory' && window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
    }]]) {
      if (open) await open();
      // 警告のボタンも出ているとき（いちばん長いとき）
      await pt.evaluate(() => { const b = document.getElementById('b-warn'); b.hidden = false; b.textContent = document.documentElement.lang === 'en' ? '12 warnings' : '警告 12'; });
      for (const w of [1440, 1280]) {
        await pt.setViewportSize({ width: w, height: 860 });
        await pt.waitForTimeout(150);
        const r = await rows();
        ok(r.spread <= 6 && r.fits, `toolbar (${lang}, ${kind}, ${w} px): one row, nothing cut off (${r.n} items, height ${Math.round(r.h)} px, spread ${r.spread} px, right edge ${r.right}/${w})`);
        if (SHOTS && w === 1440) await pt.screenshot({ path: path.join(SHOTS, `toolbar-${lang}-${kind}-${w}.png`), clip: { x: 0, y: 0, width: w, height: 120 } });
      }
      await pt.setViewportSize({ width: 1440, height: 860 });
      await pt.click('#b-exportmenu');
      await pt.waitForSelector('#m-export:not([hidden])');
      if (SHOTS) await pt.screenshot({ path: path.join(SHOTS, `toolbar-${lang}-${kind}-menu.png`), clip: { x: 640, y: 0, width: 800, height: 300 } });
      ok(await pt.evaluate(() => document.activeElement && document.activeElement.closest('#m-export') !== null), `menu (${lang}, ${kind}): opening focuses the first item`);
      await pt.keyboard.press('ArrowDown');
      await pt.keyboard.press('Escape');
      ok(await pt.isHidden('#m-export') && await pt.evaluate(() => document.activeElement.id === 'b-exportmenu'), `menu (${lang}, ${kind}): Esc closes it and returns focus`);
      // 狭い幅では 2 行に折り返し、はみ出さない
      await pt.setViewportSize({ width: 900, height: 860 });
      await pt.waitForTimeout(150);
      ok(await pt.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `toolbar (${lang}, ${kind}, 900 px): wraps without horizontal overflow`);
      await pt.setViewportSize({ width: 1440, height: 860 });
    }
    await pt.close();
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
