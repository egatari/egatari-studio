// 組み直す保存（段 B）の確かめの窓とそのわけ（app/main.js の savePortableBound・themeOnlyChange）
//   node tools/test-app-save-rebuild.mjs [作業用のフォルダ]
// この Studio で書き出した 1.0 のファイル（examples/minimal を写して詰めたもの）を編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る）で、
// まだどこにも保存していない文書として開き（AI の出力から作ったときと同じ fresh）、日本語と英語の画面で：
//   1. テーマを変更 → 保存：確かめの窓は出ない（この Studio が組んだものなので、組み直しても見え方は変わらない）。保存したファイルは新しいテーマ・段 B
//   2. 保存した後にテーマをもう一度変更 → 保存：確かめの窓は出るが、わけはテーマを変えたことだけ（「スライドの HTML を直した」「見え方が変わる」は出ない）
//   3. 保存した後にスライドの文を直す → 保存：今までどおり「スライドの HTML を直した」わけと見え方の知らせ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { themeOf } from '../app/theme-switch.js';
import { clickDlg, clickCommand } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-save-rebuild-')));
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
const lesson = fs.readFileSync(packedPath, 'utf8');
const deck0 = new TextDecoder().decode((await readPortable(lesson)).files['deck.html']);
ok(themeOf(deck0) === 'default', 'fixture: the lesson uses the default theme');

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

// 画面の言葉（app/i18n.js と同じもの。変えたらここも）
const WORDS = {
  ja: { theme: 'テーマを替えたので、スライドを新しいテーマで組み直して保存します。組み直さない保存（台本・音声・秒数の所だけの書き換え）では、テーマは変わりません。',
    html: 'スライドの HTML を直したので', look: '見え方が変わることがあります' },
  en: { theme: 'You changed the theme, so the slides are rebuilt with the new theme and saved. Saving without rebuilding (rewriting only script, audio and timing) would not change the theme.',
    html: 'You edited the slides HTML', look: 'may look different' },
};

const browser = await launch();
const errs = [];
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy; }, n, { timeout: 60000 });
const savedFile = async (page) => readPortable(await page.evaluate(() => window.__APP_TEST.saved()));
// スライド ▾ → テーマを変更… → 選ぶ → 変更（初めの編集では権利の確認に「続ける」）
async function switchTo(page, name) {
  await clickCommand(page, '#b-theme-switch');
  await page.waitForSelector('#dlg[open] #theme-switch-list');
  const n = (await state(page)).loads;
  await page.check(`#theme-opt-${name}`);
  await clickDlg(page, '#dlg-change');
  const rights = await page.waitForSelector('#dlg[open] #rights-list', { timeout: 1500 }).catch(() => null);
  if (rights) await clickDlg(page, '#dlg-ok');
  await waitLoads(page, n);
  await page.waitForFunction(() => window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
}
// 保存して、確かめの窓が出たら中身を読んで「組み直して保存」を押す。窓が出なければ null
async function saveAndRead(page) {
  await page.evaluate(() => { window.__tierBSeen = 0; });
  const p = page.evaluate(() => window.__APP_TEST.save('save'));
  // 窓が出たかを、保存が終わるまで見張る（出てすぐ閉じられても見落とさない）
  const seen = await Promise.race([p.then(() => false), page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 60000 }).then(() => true, () => false)]);
  let dlg = null;
  if (seen) {
    dlg = await page.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, why: (document.getElementById('tier-b-why') || {}).textContent || null,
      warn: !!document.getElementById('tier-b-warn'), text: document.getElementById('dlg').textContent }));
    await clickDlg(page, '#dlg-rebuild');
  }
  await p;
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
  return { dlg, seenDuring: await page.evaluate(() => window.__tierBSeen) };
}
// スライドの文を 1 か所直す（直せる範囲：プレビューの data-src）
async function editText(page) {
  const t0 = Date.now();
  let range = null;
  while (!range && Date.now() - t0 < 30000) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide li[data-src], #stage .slide p[data-src], #stage .slide h2[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  let src = null;
  for (let i = 0; i < 60 && !(src && src.text); i++) { src = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(src && src.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(src.text) ? src.text.replace(/>([^<]+)</, '>$1（直した）<') : src.text + '（直した）';
  const res = await page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, src.h, next]);
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  return res && res._status === 200;
}

try {
  for (const lang of ['ja', 'en']) {
    const W = WORDS[lang];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
    await page.goto(`${HOST}?lang=${lang}`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    await page.evaluate(async (lang) => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('sr-' + lang, { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('saved.html', { create: true }); }, lang);
    // 確かめの窓が開いた回数（保存が窓を出さずに終わったことを確かめる）
    await page.evaluate(() => { window.__tierBSeen = 0; new MutationObserver(() => { if (document.querySelector('#dlg[open] #dlg-rebuild')) window.__tierBSeen++; }).observe(document.body, { subtree: true, childList: true, attributes: true }); });

    // まだどこにも保存していない文書（AI の出力から作ったときと同じ）
    const n0 = (await state(page)).loads;
    const opened = await page.evaluate(([data, name]) => {
      const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__APP_TEST.openFile({ bytes: u, name, fresh: true });
    }, [Buffer.from(lesson).toString('base64'), 'new' + FORMAT.FILE_EXT]);
    ok(opened === true, `${lang}: a never-saved lesson opens`);
    await waitLoads(page, n0);

    // 1. 保存していない文書：テーマを変更 → 保存で窓は出ない
    await switchTo(page, 'sumi');
    let r = await saveAndRead(page);
    let st = await state(page);
    let saved = await savedFile(page);
    ok(r.dlg === null && r.seenDuring === 0, `${lang} never saved: theme changed → Save asks nothing ` + JSON.stringify(r));
    ok(st.portable.lastTier === 'B' && themeOf(new TextDecoder().decode(saved.files['deck.html'])) === 'sumi', `${lang} never saved: rebuilt and saved with the new theme (tier ${st.portable.lastTier})`);

    // 2. 保存した文書：テーマだけを変えた → わけはテーマのことだけ
    await switchTo(page, 'kokugo');
    r = await saveAndRead(page);
    st = await state(page);
    saved = await savedFile(page);
    ok(r.dlg && r.dlg.why === W.theme, `${lang} saved, theme only: the dialog gives the theme reason ` + JSON.stringify(r.dlg && r.dlg.why));
    ok(r.dlg && !r.dlg.warn && !r.dlg.text.includes(W.html) && !r.dlg.text.includes(W.look), `${lang} saved, theme only: no “HTML edited” or “may look different” wording ` + JSON.stringify(r.dlg && r.dlg.text));
    ok(st.portable.lastTier === 'B' && st.portable.lastRefusal && st.portable.lastRefusal.code === 'source-changed' && themeOf(new TextDecoder().decode(saved.files['deck.html'])) === 'kokugo', `${lang} saved, theme only: Rebuild and save → saved with kokugo`);

    // 3. 保存した文書：スライドの文を直した → 今までどおりのわけと知らせ
    ok(await editText(page), `${lang} saved, slide edited: the slide text is edited`);
    r = await saveAndRead(page);
    ok(r.dlg && r.dlg.warn && r.dlg.why && r.dlg.why.startsWith(W.html) && r.dlg.text.includes(W.look), `${lang} saved, slide edited: the HTML reason and the appearance warning ` + JSON.stringify(r.dlg && r.dlg.why));
    await ctx.close();
  }
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
