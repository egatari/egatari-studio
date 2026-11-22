// しおり（format spec §8.0）の編集：スライド ▾ の「しおりを付ける…」・「しおりの名前を変更…」・「しおりを外す」の試験
//   node tools/test-app-bookmark.mjs [作業用のフォルダ] [--shots <フォルダ>]
// 1. 文字列の操作（ブラウザなし）：setBookmark は <section> の開始タグの data-bookmark だけを書き、外すときは前の空白ごと。ほかのバイトは変えない
// 2. 開いた 1 ファイル（examples/minimal）：しおりのないスライドでは「しおりを付ける…」だけ（「しおりを外す」はない）。窓の題・欄の名前・既定の名前（そのスライドの見出し「何を最小化するか」。handoff #89）・説明・ボタン。
//    「付ける」で deck.html の 2 枚目の <section> に data-bookmark="何を最小化するか" が付き、プレビューの帯にボタンが出る。開き直すと「しおりの名前を変更…」と「しおりを外す」、
//    窓には今の名前。21 字の名前では閉じない。名前を変えると属性の値だけが変わる。「しおりを外す」で元の原稿にバイトまで戻る。元に戻すも効く
// 3. 英語の画面：項目と窓の言葉、既定の名前は 1 枚目の見出し。2 枚目に付けると 2 枚目の見出し（同じ名前が並ばない：bookmarkDup が出ない）
// --shots <フォルダ> があれば（手引きの画像。日本語・幅 1280）：2. でしおりを付けた後、プレビューの 4 枚目でツールバーにしおりの名前のボタン（bookmark-bar-1280.png）、
//   押して飛んだ後の「元の位置に戻る」（bookmark-back-1280.png）。撮った後はプレビューを 2 枚目に戻す
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
import { setBookmark } from '../kit/core/slide-ops.mjs';
import { bookmarkFindings } from '../kit/core/bookmark.mjs';
import { clickCommand, clickDlg, clickMenuOpen } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const si = argv.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(argv.splice(si, 2)[1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const work = path.resolve(argv[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-bookmark-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 1. 文字列の操作
{
  const src = '<html><body><div id="stage">\n<section class="slide" id="s-a">\n<h2>A</h2></section>\n<section class="slide"  id="s-b"\n  data-bookmark="old">\n<h2>B</h2></section>\n</div></body></html>';
  const a = setBookmark(src, 0, ' 質疑  & "Q" ');
  ok(a === src.replace('id="s-a">', 'id="s-a" data-bookmark="質疑 &amp; &quot;Q&quot;">'), 'setBookmark: adds the attribute at the end of the start tag, spaces folded, escaped');
  ok(setBookmark(a, 0, null) === src && setBookmark(a, 0, '  ') === src, 'setBookmark: removing it restores the bytes');
  ok(setBookmark(src, 1, 'new') === src.replace('data-bookmark="old"', 'data-bookmark="new"'), 'setBookmark: renaming changes only the value');
  ok(setBookmark(src, 1, '') === src.replace('\n  data-bookmark="old"', ''), 'setBookmark: removing takes the whitespace before it');
  let threw = false; try { setBookmark(src, 5, 'x'); } catch (e) { threw = e.code === 'no-slide'; }
  ok(threw, 'setBookmark: no such slide');
}

// ---------------------------------------------------------------- 材料と配る
const dir = path.join(work, 'pf');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/](out|audio)([\\/]|$)/.test(path.relative(ROOT, x)) });
const pf = await exportPortable(nodeEnv, path.join(dir, 'deck.html'), {});
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
async function session(lang, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${lang} console: ${m.text()}`); });
  await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
  await page.waitForSelector('#drop');
  try { await fn(page); } finally { await ctx.close(); }
}
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const loads = async (page) => (await state(page)).loads;
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy; }, n, { timeout: scaled(60000) });
const frame = (page) => page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
const memFile = async (page, rel) => { const f = await page.evaluate(() => window.__APP_TEST.files()); return f && f[rel] ? Buffer.from(f[rel], 'base64').toString('utf8') : null; };
async function openBytes(page, html, name) {
  const n = await loads(page);
  const b64 = Buffer.from(html).toString('base64');
  const r = await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name }); }, [b64, name]);
  await waitLoads(page, n);
  return r;
}
// プレビューを n 枚目へ（スライド ▾ の対象。一覧を閉じていればプレビューの枚）
async function goSlide(page, i) {
  await frame(page).evaluate((i) => DECK.go(i, 0, false), i);
  await page.waitForFunction((i) => { const s = window.__APP_TEST.state(); return s.pos && s.pos.i === i; }, i, { timeout: scaled(5000) }).catch(() => {});
}
async function menuItems(page) {
  await clickMenuOpen(page, '#b-slidemenu');
  const r = await page.evaluate(() => ({ add: document.getElementById('b-bookmark').textContent, del: document.getElementById('b-bookmark-del').hidden ? null : document.getElementById('b-bookmark-del').textContent }));
  await page.keyboard.press('Escape');
  return r;
}
// 窓を開いて名前を入れ、押す。初めの編集では権利の確認に「続ける」
async function bookmarkVia(page, name, button = '#dlg-ok') {
  await clickCommand(page, '#b-bookmark');
  await page.waitForSelector('#dlg[open] #bookmark-name');
  const shown = { title: await page.textContent('#dlg-title'), label: await page.textContent('label[for=bookmark-name]'), value: await page.inputValue('#bookmark-name'),
    desc: await page.textContent('#bookmark-desc'), ok: await page.textContent('#dlg-ok'), cancel: await page.textContent('#dlg-cancel') };
  if (name !== undefined) await page.fill('#bookmark-name', name);
  const n = await loads(page);
  await clickDlg(page, button);
  const rights = await page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(1500) }).catch(() => null);
  if (rights) await clickDlg(page, '#dlg-ok');
  if (button === '#dlg-ok') await waitLoads(page, n).catch(() => {});
  return shown;
}
const slideTag = (src, i) => [...src.matchAll(/<section\b[^>]*>/g)][i]?.[0] || '';

try {
  // ---------------------------------------------------------------- 2. 日本語
  await session('ja', async (page) => {
    ok(await openBytes(page, pf.html, 'bm' + FORMAT.FILE_EXT) === true, 'ja: opens');
    const deck0 = await memFile(page, 'deck.html');
    await goSlide(page, 1);
    const m0 = await menuItems(page);
    ok(m0.add === 'しおりを付ける…' && m0.del === null, `ja: without a bookmark the menu has only 「しおりを付ける…」 ${JSON.stringify(m0)}`);
    const shown = await bookmarkVia(page, undefined);
    ok(JSON.stringify(shown) === JSON.stringify({ title: 'しおりを付ける', label: 'しおりの名前（20 字まで）', value: '何を最小化するか',
      desc: '本編の要所や付録の扉に付けると、このスライドの最終状態へすぐ飛べます。発表のときはツールバーのボタンか q キーで飛び、「元の位置に戻る」か Backspace で戻ります', ok: '付ける', cancel: 'キャンセル' }), 'ja: the dialog words and the default name ' + JSON.stringify(shown));
    const deck1 = await memFile(page, 'deck.html');
    ok(deck1 === setBookmark(deck0, 1, '何を最小化するか') && slideTag(deck1, 1).includes('data-bookmark="何を最小化するか"'), 'ja: 「付ける」 writes data-bookmark on the second <section> and nothing else');
    ok(await frame(page).evaluate(() => [...document.querySelectorAll('#dt-cb [data-bm]')].map((b) => b.textContent).join()) === '何を最小化するか', 'ja: the preview control bar has the bookmark button');
    if (SHOTS) {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: 1280, height: 800 });
      await goSlide(page, 3);
      const bar = async (name) => {
        await page.mouse.move(0, 0);
        await frame(page).evaluate(() => document.getElementById('dt-cb').classList.add('show'));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, name) });
      };
      await bar('bookmark-bar-1280.png');
      await frame(page).evaluate(() => document.querySelector('#dt-cb [data-bm="0"]').click());
      await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.pos && s.pos.i === 1; }, null, { timeout: scaled(5000) }).catch(() => {});
      await frame(page).waitForFunction(() => { const e = document.querySelector('#dt-cb [data-b="bmback"]'); return !!e && !e.hidden; }, null, { timeout: scaled(5000) }).catch(() => {});
      await bar('bookmark-back-1280.png');
      await frame(page).evaluate(() => document.getElementById('dt-cb').classList.remove('show'));
      await goSlide(page, 1);
      await page.setViewportSize(vp);
      await page.waitForTimeout(400);
    }
    const m1 = await menuItems(page);
    ok(m1.add === 'しおりの名前を変更…' && m1.del === 'しおりを外す', `ja: with a bookmark the menu has 「しおりの名前を変更…」 and 「しおりを外す」 ${JSON.stringify(m1)}`);
    // 21 字では閉じない
    await clickCommand(page, '#b-bookmark');
    await page.waitForSelector('#dlg[open] #bookmark-name');
    ok(await page.inputValue('#bookmark-name') === '何を最小化するか', 'ja: renaming shows the current name');
    await page.fill('#bookmark-name', 'あいうえおかきくけこさしすせそたちつてとな');
    await page.click('#dlg-ok');
    ok(await page.evaluate(() => document.getElementById('dlg').open) && await page.getAttribute('#bookmark-name', 'aria-invalid') === 'true', 'ja: a 21-character name keeps the dialog open (aria-invalid)');
    await clickDlg(page, '#dlg-cancel');
    ok(await memFile(page, 'deck.html') === deck1, 'ja: cancel changes nothing');
    await bookmarkVia(page, '結果の表');
    const deck2 = await memFile(page, 'deck.html');
    ok(deck2 === deck1.replace('data-bookmark="何を最小化するか"', 'data-bookmark="結果の表"'), 'ja: renaming changes only the value');
    // しおりを外す
    let n = await loads(page);
    await clickCommand(page, '#b-bookmark-del');
    await waitLoads(page, n);
    ok(await memFile(page, 'deck.html') === deck0, 'ja: 「しおりを外す」 restores the source byte for byte');
    ok((await menuItems(page)).del === null, 'ja: after removing, 「しおりを外す」 is gone');
    // 元に戻す
    await page.waitForSelector('#b-undo:not([disabled])');
    n = await loads(page);
    await page.click('#b-undo');
    await waitLoads(page, n);
    ok(await memFile(page, 'deck.html') === deck2, 'ja: undo brings the bookmark back');
  });

  // ---------------------------------------------------------------- 3. 英語
  await session('en', async (page) => {
    ok(await openBytes(page, pf.html, 'bm-en' + FORMAT.FILE_EXT) === true, 'en: opens');
    await goSlide(page, 0);
    ok((await menuItems(page)).add === 'Add bookmark…', 'en: 「Add bookmark…」');
    const shown = await bookmarkVia(page, undefined);
    ok(JSON.stringify(shown) === JSON.stringify({ title: 'Add bookmark', label: 'Bookmark name (up to 20 characters)', value: '勾配降下法の基本',
      desc: 'Put one on an important slide or the appendix divider to jump straight to this slide’s final state: in a talk, press its button in the toolbar or q, and use “Back to where you were” or Backspace to return', ok: 'Add', cancel: 'Cancel' }), 'en: the dialog words and the default name ' + JSON.stringify(shown));
    ok(slideTag(await memFile(page, 'deck.html'), 0).includes('data-bookmark="勾配降下法の基本"'), 'en: the first <section> carries data-bookmark with its heading');
    const m = await menuItems(page);
    ok(m.add === 'Rename bookmark…' && m.del === 'Remove bookmark', `en: 「Rename bookmark…」 and 「Remove bookmark」 ${JSON.stringify(m)}`);
    // 2 つ目：2 枚目の見出しが既定の名前（同じ名前が並ばない）
    await goSlide(page, 1);
    const shown2 = await bookmarkVia(page, undefined);
    ok(shown2.value === '何を最小化するか', 'en: a second bookmark defaults to that slide’s heading ' + JSON.stringify(shown2.value));
    const deck2 = await memFile(page, 'deck.html');
    const names = [...deck2.matchAll(/data-bookmark="([^"]*)"/g)].map((x) => x[1]);
    ok(JSON.stringify(names) === JSON.stringify(['勾配降下法の基本', '何を最小化するか']) && !bookmarkFindings(deck2).some((f) => f.code === 'bookmarkDup'), 'en: two bookmarks, two names, no bookmarkDup ' + JSON.stringify(names));
  });
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
