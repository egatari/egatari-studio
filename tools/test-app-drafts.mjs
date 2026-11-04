// 保存していない変更をブラウザの中に残し、次に開いたときに復元する（app/drafts.js、backlog #55。設計は handoff/autosave-design-2026-11-04.md）
//   node tools/test-app-drafts.mjs [作業用のフォルダ]
// 1 つのブラウザの文脈（同じ origin の IndexedDB と Web Locks）で、タブを開いて閉じて確かめる：
//   残す（台本でなくスライドの文の編集と、録音 1 本）→ タブを閉じる → 同じファイルを開くと「復元しますか」→ 復元で編集と録音が戻る
//   2 つのタブ（開いているタブの変更は問わない・互いを上書きしない）・はじめの画面の一覧から復元・変更を捨てる・
//   保存領域の不足（IndexedDB の put が QuotaExceededError）を知らせて止まらない・本当に保存したら消える・30 日を過ぎたものの掃除
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-drafts-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 教材（examples/minimal を 1 ファイルに）
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
const LIMITS = { quietMs: 150, maxWaitMs: 600, tickMs: 100 };

async function newTab(label) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(`${HOST}?lang=ja`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate((L) => { window.__APP_TEST.draftLimits = L; window.__APP_TEST.mp3 = 'off'; }, LIMITS);
  return page;
}
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const draftsOf = (page) => page.evaluate(() => window.__APP_TEST.drafts());
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !s.building; }, n, { timeout: 60000 });
// ファイルを開く（開く処理は「復元しますか」の窓の間も待つので、待たずに返す）
function openLesson(page) {
  return page.evaluate(([data, name]) => {
    const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return window.__APP_TEST.openFile({ bytes: u, name });
  }, [lessonB64, NAME]);
}
// 開いて、窓（復元の問い）が出るか、開き終わるかを待つ → 'ask' | 'opened'
async function openAndSee(page) {
  const n = (await state(page)).loads;
  const p = openLesson(page);
  const r = await Promise.race([p.then(() => 'opened'), page.waitForSelector('#dlg[open] #draft-ask', { timeout: 90000 }).then(() => 'ask')]);
  if (r === 'opened') await waitLoads(page, n);
  return { r, done: p };
}
// スライドの文を 1 か所直す（プレビューの data-src から。test-app-save-rebuild と同じ）
async function editText(page, mark) {
  const t0 = Date.now();
  let range = null;
  while (!range && Date.now() - t0 < 30000) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide h2[data-src], #stage .slide p[data-src], #stage .slide li[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  let src = null;
  for (let i = 0; i < 60 && !(src && src.text); i++) { src = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(src && src.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(src.text) ? src.text.replace(/>([^<]+)</, `>$1${mark}<`) : src.text + mark;
  const call = page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, src.h, next]);
  // 開いたファイルの初めの編集では、権利の確認（このファイルを編集しますか）が出る：「続ける」
  const rights = await Promise.race([call.then(() => null), page.waitForSelector('#dlg[open] #rights-list', { timeout: 30000 }).catch(() => null)]);
  if (rights) await clickDlg(page, '#dlg-ok');
  const res = await call;
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  return res && res._status === 200;
}
const deckText = (page) => page.evaluate(() => { const b = atob(window.__APP_TEST.files()['deck.html'] || ''); return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))); });
const filesOf = (page) => page.evaluate(() => Object.keys(window.__APP_TEST.files() || {}));
// 残し終わるまで（今の版を残した）
const waitKept = (page) => page.waitForFunction(() => { const d = window.__APP_TEST.draftState(); return d && d.kept && d.savedRev === d.revision; }, null, { timeout: 30000 });

try {
  // ---- 1. 残す：スライドの文の編集と録音 1 本
  const A = await newTab('A');
  ok(await A.isHidden('#drafts'), '1: no unsaved changes on the first screen at first');
  let o = await openAndSee(A);
  ok(o.r === 'opened', '1: opening the lesson asks nothing (no unsaved changes yet)');
  ok(await editText(A, '（下書き1）'), '1: edit a slide text');
  await waitKept(A);
  let list = await draftsOf(A);
  ok(list.length === 1 && list[0].name === NAME && list[0].changed.includes('deck.html') && /^[0-9a-f]{64}$/.test(list[0].baseSha), '1: the change is kept in this browser (name, base hash, deck.html) ' + JSON.stringify(list.map((m) => [m.name, m.changed])));
  const tip = await A.getAttribute('#saveloc', 'title');
  ok(/次に開いたときに復元できます/.test(tip || ''), '1: the status bar says the changes can be restored: ' + tip);
  // 録音 1 本（録音モードが書くのと同じ口：audioPanel.commit。MP3 のエンコーダを読まずに WAV）
  const key = await A.evaluate(async () => {
    const P = window.__APP_TEST.audioPanel;
    P.toggle(true);
    for (let i = 0; i < 100 && !(window.__APP_TEST.audio().key && !window.__APP_TEST.audio().loading); i++) await new Promise((r) => setTimeout(r, 100));
    const k = window.__APP_TEST.audio().key;
    const sr = 44100, pcm = new Float32Array(sr / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.2 * Math.sin(i / 10);
    const r = await P.commit(k, { pcm, sr, dur: 0.5, gainDb: 0 });
    return r.ok ? k : 'failed: ' + JSON.stringify(r);
  });
  ok(!/^failed/.test(key || 'failed'), '1: a take is recorded and written for step ' + key);
  await waitKept(A);
  list = await draftsOf(A);
  const takeFile = list[0].changed.find((r) => /^audio\/rec_/.test(r));
  ok(!!takeFile && list[0].changed.includes('audio/manifest.json'), '1: the take and audio/manifest.json are kept too ' + JSON.stringify(list[0].changed));
  const firstId = list[0].id;
  // タブが落ちた（beforeunload を通さずに閉じる）
  await A.close({ runBeforeUnload: false });

  // ---- 2. 読み込み直して復元：はじめの画面に出て、同じファイルを開くと問う
  const B = await newTab('B');
  await B.waitForSelector('#drafts:not([hidden]) #drafts-list li', { timeout: 10000 });
  ok((await B.textContent('#drafts-list')).includes(NAME) && (await B.textContent('#drafts-lead')).includes('ブラウザが消すことがあります'), '2: the first screen lists the unsaved changes and says the browser may delete them');
  o = await openAndSee(B);
  ok(o.r === 'ask', '2: opening the same file asks to restore');
  const ask = await B.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, body: document.getElementById('draft-ask').textContent, restore: (document.getElementById('dlg-restore') || {}).textContent, discard: (document.getElementById('dlg-discard') || {}).textContent }));
  ok(ask.title === '保存していない変更があります' && /復元しますか？$/.test(ask.body) && ask.restore === '復元' && ask.discard === '変更を捨てる', '2: the question and its buttons ' + JSON.stringify(ask));
  let n = (await state(B)).loads;
  await clickDlg(B, '#dlg-restore');
  await o.done;
  await waitLoads(B, n).catch(() => {});
  await B.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  ok((await deckText(B)).includes('（下書き1）'), '2: the slide edit is back');
  const fb = await filesOf(B);
  const man = await B.evaluate(() => atob(window.__APP_TEST.files()['audio/manifest.json'] || ''));
  ok(fb.includes(takeFile) && man.includes(takeFile.slice('audio/'.length)), '2: the recording is back (file and manifest entry)');
  await waitKept(B);
  list = await draftsOf(B);
  ok(list.length === 1 && list[0].id === firstId && (await B.evaluate(() => window.__APP_TEST.draftState().id)) === firstId, '2: the restoring tab carries on the same kept changes (one entry)');

  // ---- 3. 2 つのタブ：B が持っている変更は、C で開いても問わない。C の変更は別に残り、B のものを上書きしない
  const C = await newTab('C');
  ok(await C.isHidden('#drafts'), '3: changes open in another tab are not listed on the first screen');
  o = await openAndSee(C);
  ok(o.r === 'opened', '3: a second tab opening the same file is not asked (the changes are open in the first tab)');
  ok(await editText(C, '（タブC）'), '3: edit in the second tab');
  await waitKept(C);
  list = await draftsOf(C);
  const cId = await C.evaluate(() => window.__APP_TEST.draftState().id);
  ok(list.length === 2 && list.some((m) => m.id === firstId) && list.some((m) => m.id === cId) && cId !== firstId, '3: two tabs keep two separate sets of changes');
  ok((await deckText(B)).includes('（下書き1）') && !(await deckText(B)).includes('（タブC）'), '3: the first tab is not overwritten');

  // ---- 4. 本当に保存したら消える（B）
  await B.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('saved-b.html', { create: true }); });
  const saving = B.evaluate(() => window.__APP_TEST.save('save'));
  // 組み直す保存の確かめ（スライドの文を直したので段 B）
  const seen = await Promise.race([saving.then(() => false), B.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 60000 }).then(() => true, () => false)]);
  if (seen) await clickDlg(B, '#dlg-rebuild');
  const rights = await B.waitForSelector('#dlg[open] #rights-list', { timeout: 1000 }).catch(() => null);
  if (rights) await clickDlg(B, '#dlg-ok');
  await saving;
  await B.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
  await sleep(300);
  list = await draftsOf(B);
  ok(!list.some((m) => m.id === firstId) && list.some((m) => m.id === cId), '4: saving the file deletes its kept changes (the other tab’s stay)');
  ok(!(await B.evaluate(() => window.__APP_TEST.draftState().kept)), '4: after saving, nothing is kept for the saved file');

  // ---- 5. はじめの画面の一覧から復元（C を落とす → D の一覧の「復元」）
  await C.close({ runBeforeUnload: false });
  await B.close({ runBeforeUnload: false });
  const D = await newTab('D');
  await D.waitForSelector('#drafts:not([hidden]) #drafts-list li', { timeout: 10000 });
  n = (await state(D)).loads;
  await D.click(`#drafts-list li[data-draft="${cId}"] .draft-restore`);
  await waitLoads(D, n);
  await D.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  ok((await deckText(D)).includes('（タブC）'), '5: Restore on the first screen opens the lesson with the changes');
  ok((await D.textContent('#toast')).includes('復元しました'), '5: it says the changes were restored');
  await D.close({ runBeforeUnload: false });

  // ---- 6. 変更を捨てる（開いたときの問いで）
  const E = await newTab('E');
  o = await openAndSee(E);
  ok(o.r === 'ask', '6: the left changes are offered again');
  await clickDlg(E, '#dlg-discard');
  await o.done;
  await sleep(300);
  list = await draftsOf(E);
  ok(!list.some((m) => m.id === cId), '6: Discard changes deletes them from this browser');
  ok(!(await deckText(E)).includes('（タブC）') && !(await state(E)).portable.dirty, '6: the file opens as saved');

  // ---- 7. 保存領域の不足：知らせて、編集は続けられ、次の変更でまた残す
  await E.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (window.__quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return put.apply(this, a); };
    window.__quota = true;
  });
  ok(await editText(E, '（容量）'), '7: edit while the storage is full');
  await E.waitForFunction(() => { const d = window.__APP_TEST.draftState(); return d && d.error === 'quota'; }, null, { timeout: 30000 });
  const tq = await E.textContent('#toast');
  ok(/保存領域が足りません/.test(tq) && /保存/.test(tq), '7: the quota error is shown with what to do: ' + tq);
  ok(/このタブを閉じると/.test((await E.getAttribute('#saveloc', 'title')) || ''), '7: the status bar no longer promises a restore');
  ok((await state(E)).portable.dirty && await E.evaluate(() => true), '7: the page still answers and the edit stays unsaved');
  await E.evaluate(() => { window.__quota = false; });
  ok(await editText(E, '（容量2）'), '7: edit again after space is freed');
  await waitKept(E);
  ok((await E.evaluate(() => window.__APP_TEST.draftState().error)) === null, '7: the next change is kept again');

  // ---- 8. 掃除：30 日を過ぎた変更は消す。使い方の節の件数と「すべて捨てる」
  await E.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('egatari-drafts', 1);
    r.onsuccess = () => {
      const t = r.result.transaction(['meta', 'base'], 'readwrite');
      t.objectStore('meta').put({ id: 'dold', name: 'old' + '.ega.html', baseSha: '0'.repeat(64), created: 0, updated: Date.now() - 31 * 864e5, bytes: 10, changed: [], removed: [] });
      t.objectStore('base').put({ id: 'dold', text: 'x' });
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    };
  }));
  ok((await draftsOf(E)).some((m) => m.id === 'dold'), '8: fixture: a set of changes last touched 31 days ago');
  const F = await newTab('F');
  await F.waitForTimeout(500);
  ok(!(await draftsOf(F)).some((m) => m.id === 'dold'), '8: changes older than 30 days are deleted when the first screen opens');
  // 使い方の節（文書を開いている E で）：今の文書のもの以外の件数、「すべて捨てる」は今の文書のものを残す
  await E.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('egatari-drafts', 1);
    r.onsuccess = () => {
      const t = r.result.transaction(['meta', 'base'], 'readwrite');
      t.objectStore('meta').put({ id: 'dother', name: 'other' + '.ega.html', baseSha: '1'.repeat(64), created: Date.now(), updated: Date.now(), bytes: 2048, changed: [], removed: [] });
      t.objectStore('base').put({ id: 'dother', text: 'x' });
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    };
  }));
  const eId = await E.evaluate(() => window.__APP_TEST.draftState().id);
  await E.evaluate(() => window.__APP_TEST.help());
  await E.waitForFunction(() => /件|ありません/.test((document.getElementById('drafts-help-info') || {}).textContent || ''), null, { timeout: 10000 });
  const info = await E.textContent('#drafts-help-info');
  ok(/^1 件/.test(info) && /アップロードしません/.test(info), '8: help shows how many other sets of changes are kept: ' + info.slice(0, 50));
  await E.click('#b-drafts-delete');
  await clickDlg(E, '#dlg-delete');
  await E.waitForFunction(() => /ありません/.test(document.getElementById('drafts-help-info').textContent), null, { timeout: 10000 });
  list = await draftsOf(E);
  ok(!list.some((m) => m.id === 'dother') && list.some((m) => m.id === eId), '8: Discard all deletes the others and keeps the open file’s changes');
  await E.close({ runBeforeUnload: false });
  await F.close({ runBeforeUnload: false });
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e));
} finally {
  await browser.close();
  srv.close();
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
