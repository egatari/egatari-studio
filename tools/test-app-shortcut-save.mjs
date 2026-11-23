// ⌘S・Ctrl+S がブラウザの「ページを保存」でなく、ファイル ▾ → 保存と同じになる（handoff #100 の 2）
//   node tools/test-app-shortcut-save.mjs [作業用のフォルダ]
//   文書を開く前：既定の動き（ページの保存）を止めるだけ・スライドを直して ⌘S で保存される・入力の欄（検索の欄）の中でも・窓が開いている間は保存しない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scaled } from './wait-scale.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-shortcut-save-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

const packDir = path.join(work, 'src');
fs.rmSync(packDir, { recursive: true, force: true });
fs.mkdirSync(packDir, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(packDir, f));
const packed = path.join(work, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', packDir, '-o', packed], { stdio: 'pipe' });
const lessonB64 = fs.readFileSync(packed).toString('base64');
const NAME = 'lesson' + FORMAT.FILE_EXT;

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch();
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });

async function newTab(label) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(`${HOST}?lang=ja`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate(() => { window.__APP_TEST.noteLimits = { tickMs: 100 }; window.__APP_TEST.draftLimits = { quietMs: 150, maxWaitMs: 600, tickMs: 100 }; window.__APP_TEST.mp3 = 'off'; window.__APP_TEST.editRole = 'creator'; window.__APP_TEST.licenseAsk = false; });
  return page;
}
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
async function open(page, b64 = lessonB64) {
  const n = (await state(page)).loads;
  await page.evaluate(([data, name]) => {
    const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return window.__APP_TEST.openFile({ bytes: u, name });
  }, [b64, NAME]);
  await page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !s.building; }, n, { timeout: scaled(60000) });
}
const commentList = async (page) => { const r = await page.evaluate(() => window.__APP_TEST.api('GET', '/__dev/comments')); return Array.isArray(r) ? r : (r.comments || r.list || []); };
const kept = (page) => page.evaluate(() => window.__APP_TEST.notesKept());
const addComment = (page, text) => page.evaluate((t) => window.__APP_TEST.api('POST', '/__dev/comment', { key: '', comment: t }), text);

// スライドの文を 1 か所直す（test-app-drafts と同じ）
async function editText(page, mark) {
  const t0 = Date.now();
  let range = null;
  while (!range && Date.now() - t0 < scaled(30000)) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide h2[data-src], #stage .slide p[data-src], #stage .slide li[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  let src = null;
  for (let i = 0; i < 60 && !(src && src.text); i++) { src = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(src && src.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(src.text) ? src.text.replace(/>([^<]+)</, `>$1${mark}<`) : src.text + mark;
  const call = page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, src.h, next]);
  const rights = await Promise.race([call.then(() => null), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(30000) }).catch(() => null)]);
  if (rights) await clickDlg(page, '#dlg-ok');
  const res = await call;
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(30000) });
  return res && res._status === 200;
}


const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
// 押したキーの既定の動きが止められたか（ページの中で合成したキーで見る）
const prevented = (page) => page.evaluate((mac) => { const e = new KeyboardEvent('keydown', { key: 's', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(e); return e.defaultPrevented; }, MOD === 'Meta');
const saveDance = async (page, press) => {
  await press();
  const seen = await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(20000) }).then(() => true, () => false);
  if (seen) await clickDlg(page, '#dlg-rebuild');
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
};

try {
  const a = await newTab('A');
  ok(await prevented(a), 'before a file is open, ⌘S / Ctrl+S does not save the page');
  await open(a);
  await a.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('saved-shortcut.html', { create: true }); });
  // 1. フォーカスがツールの列（欄の外）
  ok(await editText(a, '（一）'), 'edit a slide');
  await a.focus('#b-help');
  await saveDance(a, () => a.keyboard.press(`${MOD}+s`));
  const size1 = await a.evaluate(async () => { const root = await navigator.storage.getDirectory(); return (await (await root.getFileHandle('saved-shortcut.html')).getFile()).size; });
  ok(size1 > 1000, `⌘S / Ctrl+S saves the file (${size1} bytes)`);
  // 2. 入力の欄（検索と置換の欄）の中
  ok(await editText(a, '（二）'), 'edit again');
  await a.keyboard.press(`${MOD}+f`);
  const field = await a.waitForSelector('#find-panel input, dialog[open] input[type=search], dialog[open] input[type=text]', { timeout: scaled(10000) }).catch(() => null);
  if (field) { await field.focus(); await a.keyboard.type('x'); }
  ok(!!field, 'the find field has the focus');
  // 検索の窓（dialog）が開いている間は保存しない：閉じてから欄にフォーカスがある形も見る
  const dlgOpen = await a.evaluate(() => !!document.querySelector('#dlg[open]'));
  if (!dlgOpen) {
    await saveDance(a, () => a.keyboard.press(`${MOD}+s`));
    ok(!(await state(a)).portable.dirty, '⌘S / Ctrl+S in a field saves the file');
    ok(await a.evaluate(() => { const e = document.activeElement; return !!e && /^(INPUT|TEXTAREA)$/.test(e.tagName); }), 'the focus stays in the field');
  } else ok(true, '(the find card is a dialog: skipped)');
  // 3. 窓（#dlg）が開いている間は保存しない
  ok(await editText(a, '（三）'), 'edit once more');
  await a.evaluate(() => { const d = document.getElementById('dlg'); d.showModal(); });
  await a.keyboard.press(`${MOD}+s`);
  await a.waitForTimeout(500);
  ok((await state(a)).portable.dirty, 'while a dialog is open, ⌘S / Ctrl+S does not save');
  await a.evaluate(() => document.getElementById('dlg').close());
} catch (e) {
  console.log('  FAIL ' + (e.stack || e));
  fails++;
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
