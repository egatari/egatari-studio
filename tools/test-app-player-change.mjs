// 保存の前にプレーヤーが変わることを知らせる（format spec §4.1。app/main.js の savePortableBound、kit/core/portable.mjs の exportPortable の playerChange）
//   node tools/test-app-player-change.mjs [作業用のフォルダ]
// この Studio で書き出した 1.0 のファイル（examples/minimal を写して詰めたもの）と、その索引のプレーヤーを別のもの（other-player）にした写しを
// 編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る）で開き、スライドの文を直して保存する（組み直す保存＝段 B）：
//   別のプレーヤーのファイル → 組み直しの確かめの後に「プレーヤーが変わります」の窓（元のプレーヤーと入るプレーヤーの名前と版）。
//     キャンセル → 保存しない（未保存のまま）。保存 → 保存したファイルのプレーヤーは Egatari Player
//   この Studio のファイル → 窓は出ない（同じプレーヤー）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scanDocument, replaceIndexText, readPortable } from '../kit/core/portable.mjs';
import { PLAYER } from '../kit/core/player.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-player-change-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// この Studio の書き出し（書き出しは id をフォルダに書き戻すので写しで）
const packDir = path.join(work, 'src');
fs.mkdirSync(packDir, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(packDir, f));
const packedPath = path.join(work, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', packDir, '-o', packedPath], { stdio: 'pipe' });
const mine = fs.readFileSync(packedPath, 'utf8');
const ix = JSON.parse(scanDocument(mine).byId.get(FORMAT.INDEX_ID).text);
const OTHER = { name: 'other-player', version: '2.0.0', title: 'Other Player' };
const other = await replaceIndexText(mine, JSON.stringify({ ...ix, player: OTHER }));
const FILES = { mine, other };
const read = await readPortable(other);
ok(read.preDraft === false && read.index.player.name === OTHER.name, 'fixture: the copy carries another player and is a 1.0 file (not an earlier-version file)');

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
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
const b64 = (s) => Buffer.from(s).toString('base64');
const savedText = (page) => page.evaluate(async () => {
  const h = window.__APP_TEST.saveHandle; const u = new Uint8Array(await (await h.getFile()).arrayBuffer());
  return new TextDecoder().decode(u);
});

// 開いて、スライドの文を 1 か所直す（直せる範囲：プレビューの data-src）。権利の確かめが出れば OK
async function openAndEdit(page, key) {
  const opened = await page.evaluate(([data, name]) => {
    const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return window.__APP_TEST.openFile({ bytes: u, name });
  }, [b64(FILES[key]), key + FORMAT.FILE_EXT]);
  ok(opened === true, `${key}: opens`);
  // 直せる範囲が届くまで待つ（プレビューが組み上がって data-src を知らせる）
  const t0 = Date.now();
  let range = null;
  while (!range && Date.now() - t0 < 30000) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide li[data-src], #stage .slide p[data-src], #stage .slide h2[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  ok(!!range, `${key}: an editable range in the preview (${range})`);
  let src = null;
  for (let i = 0; i < 60 && !(src && src.text); i++) { src = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(src && src.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(src.text) ? src.text.replace(/>([^<]+)</, '>$1（直した）<') : src.text + '（直した）';
  ok(next !== src.text, `${key}: the edit changes the text`);
  const post = page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, src.h, next]);
  // 権利の確かめ（初めての書き込み）
  const asked = await Promise.race([post.then(() => false), page.waitForSelector('#dlg[open] #dlg-ok', { timeout: 20000 }).then(() => true, () => false)]);
  if (asked) await clickDlg(page, '#dlg-ok');
  const res = await post;
  ok(res && res._status === 200, `${key}: the slide text is edited (${res && res._status} ${res && res.error || ''})`);
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await page.goto(`${HOST}?lang=ja`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('pc', { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('saved.html', { create: true }); });
  // 窓が出たかを数える（同じ窓が開いた・閉じたを見落とさない）
  await page.evaluate(() => { window.__pc = 0; new MutationObserver(() => { if (document.querySelector('#dlg[open] #player-change')) window.__pc++; }).observe(document.body, { subtree: true, childList: true, attributes: true }); });

  // 1. 別のプレーヤーのファイル
  await openAndEdit(page, 'other');
  let p = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
  await clickDlg(page, '#dlg-rebuild');
  await page.waitForSelector('#dlg[open] #player-change', { timeout: 60000 });
  const body = await page.textContent('#player-change');
  ok((await page.textContent('#dlg-title')) === 'プレーヤーが変わります', 'other player: the dialog title says the player will change');
  ok(body.includes('Other Player 2.0.0') && body.includes(`${PLAYER.displayName} `) && body.includes('キャンセル'), 'other player: names the current player and the one the saved file will carry ' + JSON.stringify(body));
  ok((await page.textContent('#dlg-save')) === '保存' && (await page.textContent('#dlg-cancel')) === 'キャンセル', 'other player: buttons キャンセル / 保存');
  await page.screenshot({ path: path.join(work, 'player-change.png') });
  await clickDlg(page, '#dlg-cancel');
  await p;
  let st = await page.evaluate(() => window.__APP_TEST.state());
  ok(st.portable.dirty && (await page.evaluate(() => window.__APP_TEST.saved())) === null, 'other player: Cancel → nothing saved, still unsaved');

  p = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
  await clickDlg(page, '#dlg-rebuild');
  await page.waitForSelector('#dlg[open] #player-change', { timeout: 60000 });
  await clickDlg(page, '#dlg-save');
  await p;
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  const saved = await readPortable(await savedText(page));
  ok(saved.index.player.name === PLAYER.name && saved.deckMeta.player.name === PLAYER.name && new TextDecoder().decode(saved.files['deck.html']).includes('（直した）'), `other player: Save → the saved file carries ${PLAYER.displayName} ${saved.index.player.version} and the edit`);

  // 2. この Studio のファイル：同じプレーヤーなので窓は出ない
  await page.evaluate(() => { window.__pc = 0; });
  await openAndEdit(page, 'mine');
  p = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
  await clickDlg(page, '#dlg-rebuild');
  await p;
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
  ok(await page.evaluate(() => window.__pc) === 0, 'same player: saved without the player dialog');
  await ctx.close();

  // 3. 英語の画面：言葉
  const ce = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'en-US' });
  const pe = await ce.newPage();
  pe.on('pageerror', (e) => errs.push(`en pageerror: ${e.message}`));
  await pe.goto(`${HOST}?lang=en`);
  await pe.waitForFunction(() => !!window.__APP_TEST);
  await pe.evaluate(async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('pce', { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('saved.html', { create: true }); });
  await openAndEdit(pe, 'other');
  p = pe.evaluate(() => window.__APP_TEST.save('save'));
  await pe.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
  await clickDlg(pe, '#dlg-rebuild');
  await pe.waitForSelector('#dlg[open] #player-change', { timeout: 60000 });
  const en = await pe.textContent('#player-change');
  ok((await pe.textContent('#dlg-title')) === 'The player will change' && en.startsWith('This file plays with Other Player 2.0.0. After saving, it will play with Egatari Player ') && (await pe.textContent('#dlg-save')) === 'Save', 'en: title, body and button ' + JSON.stringify(en));
  await clickDlg(pe, '#dlg-cancel');
  await p;
  await ce.close();
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
