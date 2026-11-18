// 品質チェックの「スライドの画像と確認の依頼をコピー」（backlog #227、handoff Issue #44）
//   node tools/test-app-copyshot.mjs [作業用のフォルダ]
// examples/population の写しを 1 ファイルにして編集アプリで開き、3 枚目（地図と結論の行）で品質チェックの板を開いて押す：
//   C1（ja、クリップボードの許可あり）：1 回の書き込みに image/png（1280×720・中身のある絵）と text/plain（依頼の文）が入る。知らせは「コピーしました…」。
//      プレビューの位置は押す前のまま（最後のステップにして写しても、見ている位置は動かない）
//   C2（en、ClipboardItem のないブラウザ）：窓に代わる。「Save image」で PNG を保存、「Copy request」で文だけをコピー
//   C3（ja、書き込みが断られる＝許可がない）：同じ窓（日本語）
// 画像は作業用のフォルダの copyshot-*.png に残す（目で見る）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-copyshot-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 作業フォルダ：examples/population（地図・グラフと結論の行）を写して 1 ファイルに
const src = path.join(work, 'src');
fs.rmSync(src, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'examples', 'population'), src, { recursive: true });
const packed = path.join(work, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', src, '-o', packed], { stdio: 'pipe' });
const lesson = fs.readFileSync(packed);

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
const W = {
  ja: { btn: 'スライドの画像と確認の依頼をコピー', done: (n) => `コピーしました（スライド ${n} の画像と依頼の文）。チャットの AI に貼り付けてください`,
    failTitle: '画像をクリップボードにコピーできませんでした', save: '画像を保存', copy: '依頼の文をコピー',
    copied: '依頼の文をコピーしました。チャットの AI に貼り付け、保存した画像を添付してください',
    req: (n, title, id, k) => ['このスライドの画像を見て、次の 3 つを確かめてください。', '1. 図と結論の行（スライドの下の 1 文）が、同じことを言っているか',
      '2. 図がつぶれたり、切れたりしていないか', '3. 直すところがあれば、スライドの HTML（deck.html）のどこをどう直せばよいか', '',
      `画像：スライド ${n}「${title}」（id：${id}）の最後のステップ（ステップ ${k}）`].join('\n') },
  en: { btn: 'Copy slide image and check request', done: (n) => `Copied (the image of slide ${n} and the request). Paste it into your chat AI`,
    failTitle: 'Could not copy the image to the clipboard', save: 'Save image', copy: 'Copy request',
    copied: 'Copied the request. Paste it into your chat AI and attach the saved image',
    req: (n, title, id, k) => ['Look at the image of this slide and check three things:', '1. Do the figure and the conclusion line (the one sentence at the bottom of the slide) say the same thing?',
      '2. Is the figure squashed or cut off?', '3. If something needs fixing, where and how should the slides HTML (deck.html) change?', '',
      `Image: slide ${n} “${title}” (id: ${id}), at its last step (step ${k})`].join('\n') },
};
const I = 2;   // 3 枚目

const browser = await launch();
const errs = [];
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy && !s.building; }, n, { timeout: scaled(60000) });
// PNG の大きさと、絵に中身があるか（色の数）をページの中で見る
const pngInfo = (page, b64) => page.evaluate(async (b64) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const bm = await createImageBitmap(new Blob([u], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bm.width, bm.height), g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
  const d = g.getImageData(0, 0, bm.width, bm.height).data, colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return { w: bm.width, h: bm.height, colors: colors.size };
}, b64);

async function openLesson(lang, { grant = true, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP', acceptDownloads: true });
  if (grant) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOST.replace(/\/$/, '') });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
  await page.goto(`${HOST}?lang=${lang}`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  const n0 = (await page.evaluate(() => window.__APP_TEST.state())).loads;
  const opened = await page.evaluate(([data, name]) => {
    const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return window.__APP_TEST.openFile({ bytes: u, name });
  }, [lesson.toString('base64'), 'lesson' + FORMAT.FILE_EXT]);
  ok(opened === true, `${lang}: opens the lesson`);
  await waitLoads(page, n0);
  // 3 枚目の 1 つ目のステップへ（最後のステップではない所から押す）
  await page.evaluate((i) => document.getElementById('preview').contentWindow.postMessage({ type: 'app-go', i, k: 0 }, '*'), I);
  await page.waitForFunction((i) => { const p = window.__APP_TEST.state().pos; return p && p.i === i && p.k === 0; }, I, { timeout: scaled(20000) });
  await page.click('#b-check');
  await page.waitForSelector('#b-copyshot', { timeout: scaled(60000) });
  return { ctx, page };
}

try {
  // ---------------------------------------------------------------- C1 ja：画像と文を 1 回で
  {
    const T = W.ja;
    const { ctx, page } = await openLesson('ja');
    ok((await page.textContent('#b-copyshot')) === T.btn, `ja: the quality check panel has “${T.btn}”`);
    const pos0 = await page.evaluate(() => window.__APP_TEST.state().pos);
    await page.click('#b-copyshot');
    await page.waitForFunction((t) => document.getElementById('toast').textContent === t, T.done(I + 1), { timeout: scaled(30000) }).catch(() => {});
    ok((await page.textContent('#toast')) === T.done(I + 1), `ja: the notice says it copied (${await page.textContent('#toast')})`);
    const clip = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const out = { n: items.length, types: items.map((x) => x.types.join(',')) };
      const it = items[0];
      if (it && it.types.includes('image/png')) {
        const b = await it.getType('image/png'), u = new Uint8Array(await b.arrayBuffer());
        let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
        out.png = btoa(s); out.size = b.size;
      }
      if (it && it.types.includes('text/plain')) out.text = (await (await it.getType('text/plain')).text()).replace(/\r\n/g, '\n');   // Windows は CRLF で返す
      return out;
    });
    ok(clip.n === 1 && /image\/png/.test(clip.types[0]) && /text\/plain/.test(clip.types[0]), `ja: one clipboard item with image/png and text/plain (${JSON.stringify(clip.types)})`);
    const pos = await page.evaluate(() => window.__APP_TEST.state().pos);
    // 文：スライドの見出し・id・最後のステップ（deck-pos の max + 1）
    const expect = await page.evaluate(() => window.__APP_TEST.lastCopy);
    const m = /^画像：スライド 3「(.+)」（id：(s-[a-z0-9]+)）の最後のステップ（ステップ (\d+)）$/m.exec(clip.text || '');
    ok(!!m && clip.text === expect && clip.text === T.req(3, m[1], m[2], +m[3]), `ja: the text is the request naming slide 3, its id and last step (${JSON.stringify((clip.text || '').split('\n').pop())})`);
    ok(!!m && /8 都県/.test(m[1]) && +m[3] === pos0.max + 1, `ja: title and step come from the lesson (“${m && m[1]}”, step ${m && m[3]}, max ${pos0.max})`);
    if (clip.png) {
      fs.writeFileSync(path.join(work, 'copyshot-ja.png'), Buffer.from(clip.png, 'base64'));
      const info = await pngInfo(page, clip.png);
      ok(info.w === 1280 && info.h === 720 && clip.size > 20000 && info.colors > 30, `ja: the PNG is 1280×720 with content (${clip.size} bytes, ${info.colors} colours)`);
    } else ok(false, 'ja: the PNG is on the clipboard');
    ok(pos && pos.i === I && pos.k === 0, `ja: the preview stays where it was (slide ${pos && pos.i + 1}, step ${pos && pos.k + 1})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- C2 en：ClipboardItem のないブラウザ → 保存とコピーの窓
  {
    const T = W.en;
    const { ctx, page } = await openLesson('en', { init: () => { try { delete window.ClipboardItem; } catch { /* 無視 */ } window.ClipboardItem = undefined; } });
    ok((await page.textContent('#b-copyshot')) === T.btn, `en: the quality check panel has “${T.btn}”`);
    await page.click('#b-copyshot');
    await page.waitForSelector('#dlg[open] #copyshot-lead', { timeout: scaled(30000) });
    ok((await page.textContent('#dlg-title')) === T.failTitle, `en: no image clipboard → the dialog “${T.failTitle}”`);
    ok((await page.textContent('#copyshot-save')) === T.save && (await page.textContent('#copyshot-copy')) === T.copy, 'en: Save image and Copy request buttons');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: scaled(10000) }), page.click('#copyshot-save')]);
    const file = path.join(work, 'copyshot-en.png');
    await dl.saveAs(file);
    const buf = fs.readFileSync(file);
    const info = await pngInfo(page, buf.toString('base64'));
    ok(/\.png$/.test(dl.suggestedFilename()) && info.w === 1280 && info.h === 720 && buf.length > 20000, `en: Save image downloads the PNG (${dl.suggestedFilename()}, ${buf.length} bytes)`);
    await page.click('#copyshot-copy');
    await page.waitForFunction((t) => document.getElementById('copyshot-lead').textContent === t, T.copied, { timeout: scaled(10000) }).catch(() => {});
    ok((await page.textContent('#copyshot-lead')) === T.copied, `en: Copy request says it copied (${await page.textContent('#copyshot-lead')})`);
    // Windows のクリップボードは改行を CRLF で返す（テキストの欄は LF）
    const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    ok(/^Look at the image of this slide/.test(text) && /^Image: slide 3 “.+” \(id: s-[a-z0-9]+\), at its last step \(step \d+\)$/m.test(text) && text === await page.inputValue('#copyshot-text'),
      `en: the clipboard has the request text only (${JSON.stringify(text.split('\n').pop())})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- C3 ja：書き込みが断られる（許可がない）→ 同じ窓
  {
    const T = W.ja;
    const { ctx, page } = await openLesson('ja', { init: () => { if (navigator.clipboard) navigator.clipboard.write = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); } });
    await page.click('#b-copyshot');
    await page.waitForSelector('#dlg[open] #copyshot-lead', { timeout: scaled(30000) });
    ok((await page.textContent('#dlg-title')) === T.failTitle && (await page.textContent('#copyshot-save')) === T.save, `ja: a refused write → the dialog “${T.failTitle}”`);
    ok(/^画像：スライド 3「.+」（id：s-[a-z0-9]+）の最後のステップ（ステップ \d+）$/m.test(await page.inputValue('#copyshot-text')), 'ja: the dialog shows the request text');
    await ctx.close();
  }
} catch (e) {
  console.error(e); fails++;
} finally {
  await browser.close();
  srv.close();
}
for (const e of errs) { console.log('  FAIL ' + e); fails++; }
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
