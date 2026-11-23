// 品質チェックの「保存で見え方が変わるスライド」（handoff #100 の 7。app/look-change.js）
//   node tools/test-app-look-change.mjs [作業用のフォルダ]
// examples/minimal を 1 ファイルにし、組んだ文書の <head> にだけ（原稿には入れずに）スライド 2 と 5 の見出しの色を変える style を足す：
// ファイル自身のプレーヤーやパーツが、このエディタの組み直しと違う見え方をしている場合の代わり。
//   編集する前（次の保存は組み直さない）：比べない・出さない
//   スライド 2 を編集した後：スライド 5 だけを出す（2 は違うが編集したので出さない）。押すとそのスライドへ
//   足さないファイルでスライド 2 を編集：比べて何も出さない（プレビューの組み立てと保存の組み立てで画像が同じ）
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
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-look-change-')));
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
const plain = fs.readFileSync(packed, 'utf8');
const cut = plain.indexOf('</head>');
// pack は原稿のフォルダに id を書き戻す：スライド 2 と 5 の id
const IDS = [...fs.readFileSync(path.join(packDir, 'deck.html'), 'utf8').matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
const tinted = plain.slice(0, cut) + '<style>#' + IDS[1] + ' h2, #' + IDS[4] + ' h2 { color: #e00000 !important; background: #ffe000 !important; }</style>' + plain.slice(cut);
const tintedB64 = Buffer.from(tinted, 'utf8').toString('base64');
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP', acceptDownloads: true });

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



// 品質チェックを走らせ、見え方の比べが終わるのを待つ
async function check(page) {
  const n0 = await page.evaluate(() => window.__APP_TEST.lookRuns || 0);
  await page.click('#b-check');
  await page.waitForFunction((n) => (window.__APP_TEST.lookRuns || 0) > n, n0, { timeout: scaled(120000) });
  return page.evaluate(() => ({ r: window.__APP_TEST.lastLookChange, title: !!document.querySelector('#look-title'), items: [...document.querySelectorAll('#look-change .look-slide')].map((e) => [e.dataset.key, e.querySelector('.where').textContent]) }));
}

try {
  ok(tinted.length > plain.length, 'the tinted file is made');
  // 1. 色を足したファイル
  const a = await newTab('A');
  await open(a, tintedB64);
  ok(!!(await state(a)).portable && !(await state(a)).portable.readOnly, `the tinted file opens for editing (${JSON.stringify((await state(a)).portable && (await state(a)).portable.readOnly)})`);
  let c = await check(a);
  ok(!c.r && !c.title, `before any edit (the next save does not rebuild), nothing is compared or listed (${JSON.stringify(c)})`);
  ok(await editText(a, '（直し）'), 'edit slide 2');
  c = await check(a);
  console.log('       ' + JSON.stringify(c));
  ok(c.r && c.r.compared === 5, 'the 5 unedited slides are compared');
  ok(c.r && c.r.slides.join() === IDS[4], 'only slide 5 is found (slide 2 differs too but was edited)');
  ok(c.title && c.items.length === 1 && /スライド 5/.test(c.items[0][1]), 'the panel lists slide 5 under 保存で見え方が変わるスライド');
  ok(await a.$eval('#look-title', (e) => e.textContent) === '保存で見え方が変わるスライド', 'the section title');
  await a.click('#look-change .look-slide');
  await a.waitForFunction(() => { const p = window.__APP_TEST.state().pos; return p && p.i === 4; }, null, { timeout: scaled(10000) }).then(() => ok(true, 'clicking goes to slide 5'), () => ok(false, 'clicking goes to slide 5'));
  await a.close();
  // 2. 足さないファイル：比べて何も出さない
  const b = await newTab('B');
  await open(b);
  ok(await editText(b, '（直し）'), 'B: edit slide 2');
  c = await check(b);
  console.log('       ' + JSON.stringify(c));
  ok(c.r && c.r.compared === 5 && c.r.slides.length === 0 && !c.title, 'B: the unchanged file: 5 slides compared, none listed');
} catch (e) {
  console.log('  FAIL ' + (e.stack || e));
  fails++;
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
