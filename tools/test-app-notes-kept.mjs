// コメント（comments.json）を 1 ファイルの教材ごとにこのブラウザに残し、開き直したら戻す（app/drafts.js の noteStore・createNoteKeeper。handoff #100 の 1）
//   node tools/test-app-notes-kept.mjs [作業用のフォルダ]
// 1 つのブラウザの文脈（同じ origin の IndexedDB）で：
//   コメントを付ける → 「保存していない変更」にならない → タブを閉じる → 同じファイルを開くとコメントが戻る（問いなし）
//   本当に保存してから閉じても戻る（保存で消えない）・全部解決（空）にすると残したものも消える・使い方の板の「すべて削除」
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
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-notes-')));
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

try {
  // 1. コメントを付ける：保存していない変更にはならず、このブラウザに残る
  let a = await newTab('A');
  await open(a);
  const docId = (await state(a)).portable.docId;
  const c1 = await addComment(a, '図の色を濃く');
  ok(c1 && c1.id, 'a comment is added');
  await a.evaluate(() => window.__APP_TEST.notesFlush());
  let k = await kept(a);
  ok(k.length === 1 && k[0].docId === docId && k[0].count === 1, `the comment is kept in this browser for the file (${JSON.stringify(k.map((m) => [m.docId === docId, m.count]))})`);
  ok((await state(a)).portable.dirty === false, 'adding a comment does not make unsaved changes');

  // 2. タブを閉じて同じファイルを開く：問いなしで戻る
  await a.close();
  a = await newTab('A2');
  await open(a);
  let list = await commentList(a);
  ok(list.length === 1 && list[0].comment === '図の色を濃く', `reopening the file brings the comment back (${list.length})`);
  ok(!(await a.$('#dlg[open]')), 'no question is asked');
  ok((await state(a)).portable.dirty === false, 'the restored comment is not an unsaved change');

  // 3. スライドを直して本当に保存し、閉じて、保存したファイルを開いても戻る（保存で消えない）
  await addComment(a, '2 枚目の見出しを短く');
  await a.evaluate(() => window.__APP_TEST.notesFlush());
  ok(await editText(a, '（直し）'), 'edit a slide');
  await a.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('saved-notes.html', { create: true }); });
  const saving = a.evaluate(() => window.__APP_TEST.save('save'));
  const seen = await Promise.race([saving.then(() => false), a.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(60000) }).then(() => true, () => false)]);
  if (seen) await clickDlg(a, '#dlg-rebuild');
  await saving;
  await a.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
  k = await kept(a);
  ok(k.length === 1 && k[0].count === 2, `saving keeps the comments (${k.map((m) => m.count)})`);
  const savedB64 = await a.evaluate(async () => { const root = await navigator.storage.getDirectory(); const f = await (await root.getFileHandle('saved-notes.html')).getFile(); const u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); });
  await a.close();
  a = await newTab('A3');
  await open(a, savedB64);
  ok((await state(a)).portable.docId === docId, 'the saved file is the same lesson (docId)');
  list = await commentList(a);
  ok(list.length === 2, `opening the saved file brings both comments back (${list.length})`);

  // 4. 全部を解決して空にする → 残したものも消える
  for (const c of list) await a.evaluate((id) => window.__APP_TEST.api('POST', '/__dev/comment/resolve', { id }), c.id);
  const after = await commentList(a);
  const open2 = after.filter((c) => c.status === 'open').length;
  await a.evaluate(() => window.__APP_TEST.notesFlush());
  k = await kept(a);
  console.log(`       after resolving: ${after.length} in comments.json (${open2} open), kept ${JSON.stringify(k.map((m) => m.count))}`);
  ok(k.length === 1 ? k[0].count === after.length : after.length === 0, 'the kept copy follows comments.json');

  // 5. 使い方の板：今の教材のものは数えず消さない。別のタブで別の教材のように見せる：docId の違う行を足して数える
  await a.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('egatari-comments', 1);
    r.onsuccess = () => { const t = r.result.transaction(['notes'], 'readwrite'); t.objectStore('notes').put({ docId: 'other-doc', name: 'other.ega.html', text: '[{"id":"x","comment":"y","status":"open"}]', count: 1, updated: Date.now() }); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }));
  await a.click('#b-help');
  await a.waitForSelector('#notes-help-info li', { timeout: scaled(10000) });
  const info = await a.$eval('#notes-help-info', (e) => e.textContent);
  ok(/1 件のファイル/.test(info), `help counts the other file only (${info.slice(0, 40)})`);
  await a.click('#b-notes-delete');
  await a.waitForSelector('#dlg[open]');
  await a.click('#dlg [data-id="delete"], #dlg button.pri');
  await a.waitForFunction(() => /ありません/.test(document.querySelector('#notes-help-info')?.textContent || ''), null, { timeout: scaled(10000) });
  k = await kept(a);
  ok(!k.some((m) => m.docId === 'other-doc'), 'Delete all removes the other file\'s comments');
  ok(k.every((m) => m.docId === docId), 'Delete all keeps the open file\'s comments');
} catch (e) {
  console.log('  FAIL ' + (e.stack || e));
  fails++;
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
