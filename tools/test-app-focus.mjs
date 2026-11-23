// メニューの項目で開いた窓・板のフォーカス（handoff #98）：どの開き方でも、開いてすぐ打った字が最初の欄に入る
//   node tools/test-app-focus.mjs [作業用のフォルダ]
// 項目：ファイルの情報…（横の板）・しおりを付ける…・テーマを変更…・LMS 用（SCORM）…・名前を付けて保存…（窓）
// 開き方：(a) 1 回クリック (b) ダブルクリック (c) フォーカスした項目で Enter 1 回 (d) Enter 2 回。本物のマウスとキー（page.mouse・page.keyboard）で押す。
// 確かめ：最初の欄にフォーカス（字の欄は打った字が入る。しおりは初めの値が選ばれていて、打った字で置き換わる）・メニューが閉じている・ほかの項目が動いていない
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
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-focus-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

const noOut = (x) => !/[\\/](out|audio|\.cache)([\\/]|$)/.test(path.relative(ROOT, x));
const minDir = path.join(work, 'minimal');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), minDir, { recursive: true, filter: noOut });
const pMin = await exportPortable(nodeEnv, path.join(minDir, 'deck.html'), {});

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

// 項目：menu（一覧のボタン）、sub（入れ子の一覧のボタン）、item、field（最初の欄）、text（字の欄なら true）、select（初めの値が全部選ばれている）、
// panel（横の板。閉じるのは #panel-close）、close（窓を閉じる）
const ITEMS = [
  { name: 'file info', menu: '#b-filemenu', item: '#b-info', field: '#info-title', text: true, panel: true },
  { name: 'bookmark', menu: '#b-slidemenu', item: '#b-bookmark', field: '#bookmark-name', text: true, select: true },
  { name: 'theme switch', menu: '#b-slidemenu', item: '#b-theme-switch', field: '#theme-switch-list input' },
  { name: 'SCORM', menu: '#b-filemenu', sub: '#b-exportmenu', item: '#b-export-scorm', field: '#scorm-checks' },
  { name: 'save as', menu: '#b-filemenu', item: '#b-saveas', field: '#saveas-new' },
];
const WAYS = ['click', 'double click', 'Enter', 'Enter twice'];

// 一覧を開き、項目を見えるようにする（入れ子はクリックで開く）
async function openTo(page, it) {
  await page.click(it.menu);
  if (it.sub) await page.click(it.sub);
  await page.waitForSelector(it.item, { state: 'visible', timeout: scaled(5000) });
}
async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function pick(page, it, way) {
  await openTo(page, it);
  if (process.env.FOCUS_DEBUG) await page.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'mousedown', 'click', 'focusin']) document.addEventListener(t, (e) => window.__ev.push(t + ':' + (e.target.id || e.target.tagName) + ':' + e.detail + (e.defaultPrevented ? ':prevented' : '')), true); });
  if (way === 'click' || way === 'double click') {
    const [x, y] = await center(page, it.item);
    // 項目の上へ少しずつ動かす（一度に跳ぶと、ブラウザの当たり判定がプレビューの iframe のままのことがある）
    await page.mouse.move(x - 20, y, { steps: 4 });
    await page.mouse.move(x, y, { steps: 4 });
    if (way === 'click') await page.mouse.click(x, y);
    else await page.mouse.dblclick(x, y);
  } else {
    // 一覧の中を ↓ で項目まで動かす（キーボードの人と同じ）
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate((s) => document.activeElement === document.querySelector(s), it.item)) break;
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    if (way === 'Enter twice') await page.keyboard.press('Enter');
  }
}
async function closeAll(page, it) {
  // 開き直った一覧（直す前の Enter 2 回）は Esc で閉じる
  for (let i = 0; i < 3 && await page.evaluate(() => [...document.querySelectorAll('#tools .menu-list')].some((m) => !m.hidden)); i++) await page.keyboard.press('Escape');
  if (it.panel) {
    if (await page.isVisible('#panel-close')) await page.click('#panel-close');
  }
  if (await page.evaluate(() => document.getElementById('dlg').open)) {
    await page.evaluate(() => document.getElementById('dlg').close('cancel'));
  }
  // 閉じた後の続き（once が離れるまで）を待つ
  await page.waitForTimeout(scaled(400));
  await page.mouse.move(5, 5);
}

async function check(page, it, way) {
  const label = `${it.name} by ${way}`;
  await pick(page, it, way);
  const shown = await page.waitForSelector(it.field, { state: 'visible', timeout: scaled(15000) }).then(() => true, () => false);
  if (!shown) {
    const why = await page.evaluate(() => ({ active: document.activeElement && document.activeElement.id, menus: [...document.querySelectorAll('#tools .menu-list')].filter((m) => !m.hidden).map((m) => m.id),
      dlg: document.getElementById('dlg').open, panel: !document.getElementById('panel').hidden, toast: (document.querySelector('.toast, #toast') || {}).textContent || '' }));
    if (process.env.FOCUS_DEBUG) why.ev = await page.evaluate(() => window.__ev);
    ok(false, `${label}: opens ${JSON.stringify(why)}`);
    return;
  }
  ok(true, `${label}: opens`);
  // 開くまでの続き（遅れて動く 2 度目のクリック・Enter）を待ってから打つ
  await page.waitForTimeout(scaled(250));
  const st = await page.evaluate((f) => {
    const a = document.activeElement, first = document.querySelector(f);
    return { onField: !!a && (a === first || (a.matches(f) && a.closest('#theme-switch-list') !== null)), active: a ? a.tagName + '#' + a.id : null,
      selected: a && typeof a.selectionStart === 'number' ? a.selectionStart === 0 && a.selectionEnd === a.value.length && a.value.length > 0 : null,
      menus: [...document.querySelectorAll('#tools .menu-list')].every((m) => m.hidden),
      dlg: document.getElementById('dlg').open, title: document.getElementById('dlg-title').textContent };
  }, it.field);
  ok(st.onField, `${label}: focus is on the first field (${st.active})`);
  ok(st.menus, `${label}: the menu is closed`);
  if (it.panel) ok(!st.dlg, `${label}: no other item ran (no dialog: ${st.title})`);
  if (it.select) ok(st.selected === true, `${label}: the initial value is selected`);
  if (it.text) {
    const before = await page.inputValue(it.field);
    await page.keyboard.type('xq');
    const after = await page.inputValue(it.field);
    if (it.select) ok(after === 'xq', `${label}: typing replaces the initial value (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
    else ok(after.includes('xq'), `${label}: typed text lands in the field (${JSON.stringify(after)})`);
  }
  // ほかの項目（新規作成…など）が動いていない：窓は 1 つ、板は「ファイルの情報…」のときだけ、欄は 1 つ
  const n = (await page.$$(it.field)).length;
  ok(n >= 1 && (it.field.endsWith('input') || n === 1), `${label}: one form (${n})`);
  await closeAll(page, it);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await page.goto(BASE);
  await page.waitForFunction(() => !!window.__APP_TEST);
  const b64 = Buffer.from(pMin.html).toString('base64');
  const opened = await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name, fresh: true }); }, [b64, 'focus' + FORMAT.FILE_EXT]);
  ok(opened === true, 'opens');
  await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return !s.building && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: scaled(60000) });
  for (const it of ITEMS) for (const way of WAYS) {
    try { await check(page, it, way); } catch (e) { ok(false, `${it.name} by ${way}: ${String(e.message || e).split('\n')[0]}`); await closeAll(page, it).catch(() => {}); }
  }
  // 何も開かない項目をキーボードで選んだら、フォーカスは一覧のボタンに戻る（前のまま）：プレビュー ▾ の「先のステップを薄く見せる」（印を切り替えるだけ）
  for (let k = 0; k < 2; k++) {
    await page.focus('#b-previewmenu');
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 20 && (await page.evaluate(() => document.activeElement.id)) !== 'b-lecturemode'; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(scaled(300));
    const a = await page.evaluate(() => document.activeElement.id);
    ok(a === 'b-previewmenu', `an item that opens nothing (keyboard): focus goes back to the menu button (${a})`);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return !s.building && s.frameLoaded === s.loads; }, null, { timeout: scaled(30000) });
  }
  await ctx.close();
} finally {
  await browser.close();
  srv.close();
}
ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
console.log(fails ? `\n${fails} failure(s)` : '\nall ok');
process.exit(fails ? 1 : 0);
