// 画像を挿入…（スライド ▾。app/image-insert.js・kit/core/image-insert.mjs。handoff #85）の編集アプリの試験
//   node tools/test-app-image-insert.mjs [作業用のフォルダ]
// 開いた 1 ファイル（examples/minimal）の 2 枚目（本文の箇条が 1 つずつ出るスライド）で：
// 1. 窓の言葉（見出し・ファイル・置き方の 5 つ・代替テキスト・飾り・出すステップ・ボタン）。背景は出さない。
//    画像がない間・代替テキストがない間は［挿入］を押せず、すぐ左にわけ。「飾りの画像」に印で欄が使えなくなり押せる
// 2. 1 MiB を超える画像で大きさの知らせ（警告だけ）。PNG・JPEG・WebP・SVG でないファイルは断る。貼り付けでも入る
// 3. PNG を代替テキスト付き・本文の中（半分）・ステップ 1 で挿入：原稿は insertImage と同じバイト、プレビューでその画像が読めて幅が本文の半分、
//    ステップ 1 で出る。スライド一覧の「元に戻す」（画像の挿入）で原稿がバイトまで戻る
// 4. 編集パネルの HTML の欄に画像を持ってくると「画像をここにドロップすると挿入します」、落とすと同じ窓がそのファイルで開く
// 5. 英語の画面の言葉
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { answerCreator } from './edit-role-answer.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { exportPortable } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { insertImage, dataUrl } from '../kit/core/image-insert.mjs';
import { clickCommand, clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-image-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 小さな本物の PNG（w × h、1 色）
function png(w, h, rgb) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png(80, 40, [40, 120, 200]);
const BIG = Buffer.concat([PNG, Buffer.alloc(1.5 * 1048576)]);   // 先頭は PNG（種類は中身の頭で決まる）、1.5 MiB

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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
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
async function goSlide(page, i, k = 0) {
  await frame(page).evaluate(([i, k]) => DECK.go(i, k, false), [i, k]);
  await page.waitForFunction(([i, k]) => { const s = window.__APP_TEST.state(); return s.pos && s.pos.i === i && s.pos.k === k; }, [i, k], { timeout: scaled(5000) }).catch(() => {});
}
// 窓の様子
const dialog = (page) => page.evaluate(() => {
  const t = (s) => (document.querySelector(s) || {}).textContent || null;
  const go = document.getElementById('dlg-insert'), note = document.getElementById('img-go-note');
  return {
    title: t('#dlg-title'), pick: t('#img-pick'), place: t('#img-place legend'), places: [...document.querySelectorAll('#img-place label')].map((l) => l.textContent),
    checked: (document.querySelector('#img-place input:checked') || {}).value, alt: t('#img-alt-label'), deco: t('#img-deco-label'),
    step: t('.img-step-row label'), steps: [...document.querySelectorAll('#img-step option')].map((o) => o.textContent),
    insert: go && go.textContent, cancel: t('#dlg-cancel'), disabled: !!(go && go.disabled), why: note && !note.hidden ? note.textContent : '', describedby: go && go.getAttribute('aria-describedby'),
    big: document.getElementById('img-big').hidden ? '' : t('#img-big'), err: document.getElementById('img-err').hidden ? '' : t('#img-err'),
    altDisabled: document.getElementById('img-alt').disabled, preview: !document.getElementById('img-preview').hidden,
  };
});
// 合成のファイルを窓へ（貼り付け・ドロップ）。type は 'paste' | 'drop'
const synth = (page, sel, type, b64, name, mime) => page.evaluate(([sel, type, b64, name, mime]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([u], name, { type: mime }));
  const t = document.querySelector(sel);
  if (type === 'paste') t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  else { t.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); if (type === 'drop') t.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }
}, [sel, type, b64, name, mime]);

// スライド ▾ の「画像を挿入…」。初めの編集では先に権利の確認が出る（「続ける」）
async function openImage(page) {
  await clickCommand(page, '#b-image');
  const rights = await page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(1500) }).catch(() => null);
  if (rights) await clickDlg(page, '#dlg-ok');
  await page.waitForSelector('#dlg[open] #img-dialog');
}

try {
  await session('ja', async (page) => {
    ok(await openBytes(page, pf.html, 'img' + FORMAT.FILE_EXT) === true, 'ja: opens');
    const deck0 = await memFile(page, 'deck.html');
    await goSlide(page, 1);
    // ---------------------------------------------------------------- 1. 窓
    await openImage(page);
    let d = await dialog(page);
    ok(d.title === '画像を挿入' && d.pick === '画像を選ぶ…（PNG・JPEG・WebP・SVG）' && d.place === '置き方'
      && JSON.stringify(d.places) === JSON.stringify(['本文の中（全幅）', '本文の中（半分）', '本文の中（3 分の 1）', '2 列の左', '2 列の右']) && d.checked === 'half'
      && d.alt === '代替テキスト（画像の内容を短い文で）' && d.deco === '飾りの画像（読み上げない）' && d.step === '出すステップ'
      && JSON.stringify(d.steps) === JSON.stringify(['最初から', 'ステップ 1', 'ステップ 2', 'ステップ 3', 'ステップ 4']) && d.insert === '挿入' && d.cancel === 'キャンセル',
    'ja: the dialog words, five placements (no background), half by default, steps up to one after the last ' + JSON.stringify(d));
    ok(d.disabled && d.why === '画像を選ぶか、貼り付けるかドロップしてください' && d.describedby === 'img-go-note', 'ja: without an image 挿入 cannot be pressed and says why ' + JSON.stringify(d.why));
    // ---------------------------------------------------------------- 2. 大きさの知らせ・種類・貼り付け
    await page.setInputFiles('#img-file', { name: 'big.png', mimeType: 'image/png', buffer: BIG });
    await page.waitForFunction(() => !document.getElementById('img-big').hidden, null, { timeout: scaled(5000) }).catch(() => {});
    d = await dialog(page);
    ok(d.big === 'この画像は 1.5 MB あります。1 MB を超える画像はファイルが重くなるので、小さくしてから入れることをおすすめします', 'ja: an image over 1 MiB shows the size notice ' + JSON.stringify(d.big));
    ok(d.disabled && d.why === '代替テキストを入力するか、「飾りの画像」に印を付けてください', 'ja: without alt text 挿入 cannot be pressed: ' + d.why);
    await page.setInputFiles('#img-file', { name: 'note.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a......') });
    await page.waitForFunction(() => !document.getElementById('img-err').hidden, null, { timeout: scaled(5000) }).catch(() => {});
    ok((await dialog(page)).err === 'PNG・JPEG・WebP・SVG の画像を選んでください', 'ja: a GIF is refused');
    await synth(page, '#img-alt', 'paste', PNG.toString('base64'), 'image.png', 'image/png');
    await page.waitForFunction(() => document.getElementById('img-big').hidden && document.getElementById('img-err').hidden, null, { timeout: scaled(5000) }).catch(() => {});
    d = await dialog(page);
    ok(d.big === '' && d.err === '' && d.preview, 'ja: pasting a small PNG replaces it (no size notice, a preview)');
    await page.check('#img-deco');
    d = await dialog(page);
    ok(d.altDisabled && !d.disabled && d.why === '', 'ja: 「飾りの画像」 disables the alt field and enables 挿入');
    await page.uncheck('#img-deco');
    await page.fill('#img-alt', '勾配の向きを示す図');
    d = await dialog(page);
    ok(!d.altDisabled && !d.disabled, 'ja: typing alt text enables 挿入');
    // ---------------------------------------------------------------- 3. 挿入・プレビュー・元に戻す
    await page.selectOption('#img-step', '1');
    const n = await loads(page);
    await clickDlg(page, '#dlg-insert');
    await waitLoads(page, n).catch(() => {});
    const deck1 = await memFile(page, 'deck.html');
    const want = insertImage(deck0, 1, { src: dataUrl(PNG, 'image/png'), alt: '勾配の向きを示す図', placement: 'half', step: 1 });
    ok(deck1 === want, 'ja: the source is exactly insertImage(half, step 1, alt) on slide 2');
    ok(/<div class="fig" data-step="1"><img src="data:image\/png;base64,[^"]+" alt="勾配の向きを示す図" style="display:block;width:50%;height:auto;margin:0 auto"><\/div>/.test(deck1), 'ja: <img src="data:image/png…" alt> in a .fig with data-step="1"');
    await goSlide(page, 1, 1);
    const pv = await frame(page).waitForFunction(() => {
      const s = document.querySelectorAll('#stage section.slide')[1], img = s && s.querySelector('.fig img');
      if (!img || !img.complete || !img.naturalWidth) return null;
      const body = s.querySelector('.body').getBoundingClientRect(), r = img.getBoundingClientRect();
      return { alt: img.alt, nw: img.naturalWidth, ratio: r.width / body.width, aspect: r.width / r.height, step: img.closest('[data-step]').getAttribute('data-step'), op: getComputedStyle(img.closest('.fig')).opacity };
    }, null, { timeout: scaled(10000) }).then((h) => h.jsonValue()).catch(() => null);
    ok(pv && pv.alt === '勾配の向きを示す図' && pv.nw === 80 && Math.abs(pv.ratio - 0.5) < 0.01 && Math.abs(pv.aspect - 2) < 0.05 && pv.step === '1' && Number(pv.op) > 0.9,
      'ja: the preview shows the image at half the body width, aspect kept, at step 1 ' + JSON.stringify(pv));
    if (!(await page.evaluate(() => window.__APP_TEST.slides().open))) await page.click('#b-slides');
    await page.waitForSelector('#sl-undo-row:not([hidden])');
    ok(await page.textContent('#sl-undo-what') === '画像の挿入', 'ja: the undo entry is 「画像の挿入」');
    const n2 = await loads(page);
    await page.click('#sl-undo');
    await waitLoads(page, n2);
    ok(await memFile(page, 'deck.html') === deck0, 'ja: undo restores the source byte for byte');
    await page.click('#sl-close');
    // ---------------------------------------------------------------- 4. 編集パネルの HTML の欄へのドロップ
    await goSlide(page, 1);
    await page.click('#b-edit');
    const f = frame(page);
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
    await f.locator('#stage .slide.active li').first().dblclick();
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; }, null, { timeout: scaled(10000) });
    await synth(page, '#dev-editor textarea', 'over', PNG.toString('base64'), 'drop.png', 'image/png');
    ok(await page.evaluate(() => { const e = document.getElementById('dev-drop'); return e && e.classList.contains('on') && getComputedStyle(e).display !== 'none' ? e.textContent : null; }) === '画像をここにドロップすると挿入します',
      'ja: dragging an image over the HTML field shows 「画像をここにドロップすると挿入します」');
    await synth(page, '#dev-editor textarea', 'drop', PNG.toString('base64'), 'drop.png', 'image/png');
    await page.waitForSelector('#dlg[open] #img-dialog', { timeout: scaled(5000) }).catch(() => {});
    await page.waitForFunction(() => !document.getElementById('img-preview').hidden, null, { timeout: scaled(5000) }).catch(() => {});
    d = await dialog(page).catch(() => null);
    ok(!!d && d.title === '画像を挿入' && d.preview && d.why === '代替テキストを入力するか、「飾りの画像」に印を付けてください' && !(await page.$('#dev-editor')),
      'ja: dropping it closes the unchanged HTML field and opens the same dialog with the file');
    await clickDlg(page, '#dlg-cancel');
    ok(await memFile(page, 'deck.html') === deck0, 'ja: cancel changes nothing');
  });

  // ---------------------------------------------------------------- 5. 英語
  await session('en', async (page) => {
    ok(await openBytes(page, pf.html, 'img-en' + FORMAT.FILE_EXT) === true, 'en: opens');
    await goSlide(page, 0);
    ok(await page.evaluate(() => document.getElementById('b-image').textContent) === 'Insert image…', 'en: 「Insert image…」 in the Slide menu');
    await openImage(page);
    await page.setInputFiles('#img-file', { name: 'big.png', mimeType: 'image/png', buffer: BIG });
    await page.waitForFunction(() => !document.getElementById('img-big').hidden, null, { timeout: scaled(5000) }).catch(() => {});
    const d = await dialog(page);
    ok(d.title === 'Insert image' && d.pick === 'Choose image… (PNG, JPEG, WebP, SVG)' && d.place === 'Placement'
      && JSON.stringify(d.places) === JSON.stringify(['In the body (full width)', 'In the body (half)', 'In the body (one third)', 'Left column', 'Right column'])
      && d.alt === 'Alt text (describe the image briefly)' && d.deco === 'Decorative (not read aloud)' && d.step === 'Show at' && JSON.stringify(d.steps) === JSON.stringify(['From the start'])
      && d.insert === 'Insert' && d.cancel === 'Cancel' && d.why === 'Enter alt text, or mark the image as decorative'
      && d.big === 'This image is 1.5 MB. Images over 1 MB make the file heavy; consider making it smaller first',
    'en: the dialog words; the title slide (static) offers only “From the start” ' + JSON.stringify(d));
    await clickDlg(page, '#dlg-cancel');
  });
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
