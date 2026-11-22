// 窓・欄を開く項目の 2 度押し（ダブルクリック・遅い端末での押し直し・試験の押し直し）で、入力の途中の欄を作り直さない
//   node tools/test-app-double-open.mjs [作業用のフォルダ]
// 項目ごとに：同じ評価の中で 2 度押し、窓が開いたら欄に入れ、もう 1 度押す。少し待っても、入れたものが残り、欄が 1 つだけ。
// 共通の窓（ask）は開いている間にもう一度呼ぶと本体を作り直すので、開く前に await する項目は、遅れて終わった 2 度目が入力を消していた
// （「ファイルの情報…」は tools/test-app-file-info.mjs で試す）
//   しおりを付ける…・画像を挿入…・テーマを変更…・LMS 用（SCORM）・参加者用（再生専用）…・名前を付けて保存…・修正…（AI の窓）・「本」の板
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { answerCreator } from './edit-role-answer.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { exportPortable } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-double-open-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 材料：examples/minimal と本のある見本（tools/fixtures/article-book）を 1 ファイルに
const noOut = (x) => !/[\\/](out|audio|\.cache)([\\/]|$)/.test(path.relative(ROOT, x));
const minDir = path.join(work, 'minimal');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), minDir, { recursive: true, filter: noOut });
const pMin = await exportPortable(nodeEnv, path.join(minDir, 'deck.html'), {});
const bookDir = path.join(work, 'book');
fs.cpSync(path.join(ROOT, 'tools', 'fixtures', 'article-book'), bookDir, { recursive: true, filter: noOut });
const pBook = await exportPortable(nodeEnv, path.join(bookDir, 'deck.html'), {});

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
const browser = answerCreator(await launch());
const errs = [];

// 開く（fresh：権利の確認を出さない。編集の前の確かめで止まらないように）
async function session(label, html, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label} pageerror: ${e.message}`));
  await page.goto(BASE);
  await page.waitForFunction(() => !!window.__APP_TEST);
  const b64 = Buffer.from(html).toString('base64');
  const opened = await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name, fresh: true }); }, [b64, label + FORMAT.FILE_EXT]);
  ok(opened === true, `${label}: opens`);
  await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return !s.building && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: scaled(60000) });
  try { await fn(page); } finally { await ctx.close(); }
}
const press = (page, sel, n) => page.evaluate(([s, n]) => { const b = document.querySelector(s); for (let i = 0; i < n; i++) b.click(); }, [sel, n]);
// 2 度押し → 開くのを待つ → 入れる → もう 1 度押す → 待つ → 入れたものが残り、欄が 1 つ、窓は開いたまま
//   field：欄。put(page)：入れる。read(page)：入れたものか。close：閉じる（窓のボタン）
async function twice(page, name, { item, field, put, read, close = '#dlg-cancel', dialog = true, again = true }) {
  await press(page, item, 2);
  const shown = await page.waitForSelector(field, { state: 'visible', timeout: scaled(15000) }).then(() => true, () => false);
  ok(shown, `${name}: opens`);
  if (!shown) return;
  await put(page);
  if (again) await press(page, item, 1);
  await page.waitForTimeout(scaled(1500));
  const kept = await read(page).catch(() => false);
  const n = (await page.$$(field)).length;
  const open = dialog ? await page.evaluate(() => document.getElementById('dlg').open) : true;
  ok(kept && n === 1 && open, `${name}: pressing it again keeps what is being typed (kept ${kept}, fields ${n}, open ${open})`);
  if (dialog && open) {
    await page.click(close);
    await page.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: scaled(5000) }).catch(() => {});
  }
  // 閉じた後の続き（once が離れるまで）を待つ
  await page.waitForTimeout(scaled(300));
}

try {
  await session('min', pMin.html, async (page) => {
    await twice(page, 'bookmark', { item: '#b-bookmark', field: '#bookmark-name',
      put: (p) => p.fill('#bookmark-name', '二度押し'), read: async (p) => (await p.inputValue('#bookmark-name')) === '二度押し' });
    await twice(page, 'image', { item: '#b-image', field: '#img-alt',
      put: (p) => p.fill('#img-alt', '二度押しの代替テキスト'), read: async (p) => (await p.inputValue('#img-alt')) === '二度押しの代替テキスト' });
    let pick = null;
    await twice(page, 'theme switch', { item: '#b-theme-switch', field: '#theme-switch-list',
      put: async (p) => { pick = await p.evaluate(() => { const r = document.querySelector('#theme-switch-list input[type=radio]:not(:checked):not(:disabled)'); r.click(); return r.id; }); },
      read: (p) => p.evaluate((id) => !!document.getElementById(id) && document.getElementById(id).checked, pick) });
    let last = null;
    await twice(page, 'SCORM', { item: '#b-export-scorm', field: '#scorm-checks',
      put: async (p) => { last = await p.evaluate(() => { const s = document.getElementById('scorm-checks'); s.value = s.options[s.options.length - 1].value; return s.value; }); },
      read: async (p) => (await p.inputValue('#scorm-checks')) === last && last !== 'none' });
    await twice(page, 'participant export', { item: '#b-export-play', field: '#play-live',
      put: (p) => p.check('#play-live'), read: (p) => p.isChecked('#play-live') });
    await twice(page, 'save as', { item: '#b-saveas', field: '#saveas-new',
      put: (p) => p.check('#saveas-new'), read: (p) => p.isChecked('#saveas-new') });
    await twice(page, 'revise (AI)', { item: '#b-revise-cmd', field: '#paste-wish',
      put: (p) => p.fill('#paste-wish', '二度押しの直してほしいこと'), read: async (p) => (await p.inputValue('#paste-wish')) === '二度押しの直してほしいこと' });
  });
  // 「本」の板（横の板。押すたびに開く・閉じるので、3 度目は押さない）：開く途中の 2 度目が、入れている本文を作り直さない
  await session('book', pBook.html, async (page) => {
    await page.waitForFunction(() => !document.getElementById('b-book').hidden && (window.__APP_TEST.book().renders > 0 || !!window.__APP_TEST.book().error), null, { timeout: scaled(60000) });
    await twice(page, 'book panel', { item: '#b-book', field: '#book-text', dialog: false, again: false,
      put: async (p) => { await p.waitForFunction(() => document.getElementById('book-text').value.length > 0, null, { timeout: scaled(10000) }); await p.fill('#book-text', '二度押しの本文'); },
      read: async (p) => (await p.inputValue('#book-text')) === '二度押しの本文' });
  });
} finally {
  await browser.close();
  srv.close();
}
ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
console.log(fails ? `\n${fails} failure(s)` : '\nall ok');
process.exit(fails ? 1 : 0);
