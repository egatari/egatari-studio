// 新規作成 ③ のテーマの見本の絵（app/llm.js の themeQuestion、tools/theme-thumbs.mjs が作る app/theme-thumbs/）の試験
//   node tools/test-app-theme-thumbs.mjs [作業用のフォルダ] [--shots <フォルダ>]
// 1. 配信版（dist/theme-thumbs/ に 2 枚ずつ）：選べるテーマごとに、選ぶと表紙と本文の 2 枚が出て、alt が「<テーマ名> のサンプル：表紙」「… のサンプル：本文」、
//    絵が読み込める（naturalWidth 640）。押すと大きく出る窓が新規作成の窓の上に開き、Esc で閉じても新規作成の窓は開いたまま・押した絵に戻る。× でも閉じる
// 2. 英語の画面：alt が「<theme> sample: cover」「… sample: body」、× の名前が Close
// 3. 幅 390 px：2 枚が縦に並び、横にスクロールしない（--shots なら themethumbs-1280.png・themethumbs-390.png）
// 4. 1 ファイル版（editor.html）：絵は data: URL
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { CHOOSABLE } from '../kit/core/themes-list.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const si = argv.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(argv.splice(si, 2)[1]) : null;
const work = path.resolve(argv[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-theme-thumbs-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const REC = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'theme-thumbs', 'index.json'), 'utf8'));
const THEMES = CHOOSABLE.filter((t) => REC.themes[t.name]);

const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
ok(THEMES.length >= 7 && THEMES.every((t) => ['cover', 'body'].every((k) => fs.existsSync(path.join(DIST, 'theme-thumbs', `${t.name}-${k}.webp`)))), `build: dist/theme-thumbs/ has 2 pictures for each of the ${THEMES.length} themes`);
const single = fs.readFileSync(path.join(DIST, 'editor.html'), 'utf8');
ok(/"themeThumbs":\s*\{\s*"default":\s*\{\s*"cover":\s*"data:image\/webp;base64,/.test(single) && !/theme-thumbs\/default-cover\.webp/.test(single), 'build: the single-file editor carries the pictures as data: URLs');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
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

async function toThemeStep(page) {
  await page.click('#w-new');
  await page.waitForSelector('#dlg[open] #paste-step-kind');
  await page.check('#paste-cat-other');
  await page.click('#paste-next-kind');
  await page.fill('#paste-title', 'theme');
  await page.click('#paste-next-content');
  await page.waitForSelector('#paste-theme', { state: 'visible' });
}
const pics = (page) => page.$$eval('#paste-theme-samples:not([hidden]) .theme-sample img', (a) => a.map((i) => ({ alt: i.alt, src: i.getAttribute('src'), w: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width), top: Math.round(i.getBoundingClientRect().top), left: Math.round(i.getBoundingClientRect().left) })));
const loaded = (page) => page.waitForFunction(() => [...document.querySelectorAll('#paste-theme-samples .theme-sample img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});

async function session(lang, viewport, fn) {
  const ctx = await browser.newContext({ viewport, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${lang} console: ${m.text()}`); });
  await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
  await page.waitForSelector('#drop');
  try { await fn(page); } finally { await ctx.close(); }
}

try {
  // ---------------------------------------------------------------- 1. 日本語・幅 1280
  await session('ja', { width: 1280, height: 860 }, async (page) => {
    await toThemeStep(page);
    for (const t of THEMES) {
      await page.selectOption('#paste-theme', t.name);
      await loaded(page);
      const p = await pics(page);
      ok(p.length === 2 && p[0].alt === `${t.label.ja} のサンプル：表紙` && p[1].alt === `${t.label.ja} のサンプル：本文`
        && p[0].src === `theme-thumbs/${t.name}-cover.webp` && p[1].src === `theme-thumbs/${t.name}-body.webp` && p.every((x) => x.w === 640 && x.shown === 320),
      `ja ${t.name}: two pictures, 320 px wide, alt 「${t.label.ja} のサンプル：表紙」「…：本文」 ` + JSON.stringify(p.map((x) => [x.alt, x.w, x.shown])));
    }
    await page.selectOption('#paste-theme', 'default');
    await loaded(page);
    const p = await pics(page);
    ok(p[0].top === p[1].top && p[1].left > p[0].left, 'ja 1280: the two pictures sit side by side');
    if (SHOTS) { await page.mouse.move(0, 0); await page.locator('#paste-step-theme').screenshot({ path: path.join(SHOTS, 'themethumbs-1280.png') }); }
    // 押すと大きく出す → Esc で閉じる（新規作成の窓は開いたまま、押した絵に戻る）
    await page.click('#paste-theme-samples .theme-sample[data-kind=body]');
    await page.waitForSelector('#theme-sample-zoom[open]');
    const z = await page.evaluate(() => { const d = document.getElementById('theme-sample-zoom'), i = d.querySelector('img'); return { label: d.getAttribute('aria-label'), alt: i.alt, src: i.getAttribute('src'), w: Math.round(i.getBoundingClientRect().width), close: document.getElementById('theme-sample-close').getAttribute('aria-label'), focus: document.activeElement && document.activeElement.id }; });
    ok(z.label === '藍 のサンプル：本文' && z.alt === '藍 のサンプル：本文' && z.src === 'theme-thumbs/default-body.webp' && z.w > 600 && z.close === '閉じる' && z.focus === 'theme-sample-close',
      'ja zoom: clicking the body picture shows it larger, named 「藍 のサンプル：本文」, with a × button 「閉じる」 that has the focus ' + JSON.stringify(z));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#theme-sample-zoom', { state: 'detached' });
    ok(await page.evaluate(() => document.getElementById('dlg').open) && await page.evaluate(() => document.activeElement && document.activeElement.matches('.theme-sample[data-kind=body]')),
      'ja zoom: Esc closes only the larger view; the New dialog stays open and the focus is back on the picture');
    await page.click('#paste-theme-samples .theme-sample[data-kind=cover]');
    await page.waitForSelector('#theme-sample-zoom[open]');
    await page.click('#theme-sample-close');
    await page.waitForSelector('#theme-sample-zoom', { state: 'detached' });
    ok(await page.evaluate(() => document.getElementById('dlg').open), 'ja zoom: × closes the larger view, the New dialog stays open');
    // ③ を答えた行は今までどおり
    await page.click('#paste-next-theme');
    ok((await page.textContent('#paste-step-theme-answer .paste-answer-text')) === 'テーマ：藍' && await page.isHidden('#paste-theme-samples'), 'ja: ③ still collapses to 「テーマ：藍」, the pictures with it');
    await clickDlg(page, '#dlg-cancel');
  });

  // ---------------------------------------------------------------- 2. 英語
  await session('en', { width: 1280, height: 860 }, async (page) => {
    await toThemeStep(page);
    for (const t of THEMES) {
      await page.selectOption('#paste-theme', t.name);
      const p = await pics(page);
      ok(p.length === 2 && p[0].alt === `${t.label.en} sample: cover` && p[1].alt === `${t.label.en} sample: body`, `en ${t.name}: alt 「${t.label.en} sample: cover」「… sample: body」`);
    }
    await page.click('#paste-theme-samples .theme-sample[data-kind=cover]');
    await page.waitForSelector('#theme-sample-zoom[open]');
    ok(await page.getAttribute('#theme-sample-close', 'aria-label') === 'Close' && await page.getAttribute('#theme-sample-zoom', 'aria-label') === 'Red ochre sample: cover', 'en zoom: named after the picture, × is 「Close」');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#theme-sample-zoom', { state: 'detached' });
    await clickDlg(page, '#dlg-cancel');
  });

  // ---------------------------------------------------------------- 3. 幅 390
  await session('ja', { width: 390, height: 844 }, async (page) => {
    await toThemeStep(page);
    await loaded(page);
    const p = await pics(page);
    const wide = await page.evaluate(() => { const d = document.getElementById('dlg'); return { dlg: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    ok(p.length === 2 && p[1].top > p[0].top && p.every((x) => x.shown <= 340 && x.shown > 250) && wide.dlg <= 0 && wide.doc <= 0,
      'ja 390: the pictures stack and fit the width; no horizontal scroll ' + JSON.stringify({ p: p.map((x) => x.shown), wide }));
    if (SHOTS) {
      await page.mouse.move(0, 0);
      await page.evaluate(() => { const d = document.getElementById('dlg'); d.scrollTop += document.getElementById('paste-step-theme').getBoundingClientRect().top - 48; });
      await page.screenshot({ path: path.join(SHOTS, 'themethumbs-390.png') });
    }
    await page.click('#paste-theme-samples .theme-sample[data-kind=body]');
    await page.waitForSelector('#theme-sample-zoom[open]');
    const box = await page.evaluate(() => { const r = document.getElementById('theme-sample-zoom').getBoundingClientRect(), c = document.getElementById('theme-sample-close').getBoundingClientRect(); return { l: r.left, r: r.right, cr: c.right, ct: c.top, b: r.bottom }; });
    ok(box.l >= 0 && box.r <= 390 && box.cr <= 390 && box.ct >= 0, 'ja 390: the larger view and its × fit the screen ' + JSON.stringify(box));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#theme-sample-zoom', { state: 'detached' });
  });
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
