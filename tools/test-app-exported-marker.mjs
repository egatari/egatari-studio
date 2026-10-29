// 手で書き換えた・崩れた書き出しの印（index.exportedFrom、format spec §3.1）を編集アプリで開く
//   node tools/test-app-exported-marker.mjs [作業用のフォルダ]
// v0.6.1 の試し歩きで、作業フォルダから書き出したファイル（examples/minimal の写しを node kit/build.mjs --portable で）の 3 か所の hash
// （索引の sourceSha256・exportedFrom.sourceSha256・deck-meta の sourceSha256）を手で書き換えて開くと、アプリが止まったように見えた。
// 止まってはいない：索引の hash（data-sha256）が合わないので「開けません」の窓を出し、OK を押すまで開く処理（__APP_TEST.openFile）が待つ。
// ここでは、どの崩し方でも窓が出るか開くかし、その間もページが答え、OK で閉じられることを確かめる。開けるもの（data-sha256 も直したもの）は
// 書き出しの印の知らせを出し、組んだ教材と原稿が食い違えば、印の値が索引と同じでも「書き出したあと、このファイルで直した所があります」と言う
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scanDocument, replaceIndexText, readPortable } from '../kit/core/portable.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-exported-marker-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

// 作業フォルダから書き出したファイル（書き出しは id をフォルダに書き戻すので写しで）
const src = path.join(work, 'src');
fs.rmSync(src, { recursive: true, force: true });
fs.mkdirSync(src, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(src, f));
const good = (await buildPortable(path.join(src, 'deck.html'), { out: path.join(work, 'lesson' + FORMAT.FILE_EXT) })).html;
const gr = await readPortable(good);
const H = gr.index.sourceSha256, B = 'b'.repeat(64);
ok(gr.index.exportedFrom && gr.index.exportedFrom.sourceSha256 === H && good.split(H).length - 1 === 3, 'fixture: an export from a folder, the hash in three places (index, marker, deck-meta)');
const ixText = (h) => scanDocument(h).byId.get(FORMAT.INDEX_ID).text;
const viaIndex = (f) => { const ix = JSON.parse(ixText(good)); f(ix); return replaceIndexText(good, JSON.stringify(ix, null, 1)); };
const handAll3 = good.split(H).join(B);
const dm = good.lastIndexOf(H);
// [名前, 中身, 期待：'opens' | 断るときのコード, 書き出しの後に直したと言うか]
const CASES = [
  ['export as is', good, 'opens', false],
  ['hand edit of all three copies (data-sha256 not updated)', handAll3, 'bad-index-hash'],
  ['hand edit of the marker only (data-sha256 not updated)', good.replace(`"kind": "folder",\n  "sourceSha256": "${H}"`, `"kind": "folder",\n  "sourceSha256": "${B}"`), 'bad-index-hash'],
  ['all three copies, data-sha256 updated', await replaceIndexText(handAll3, ixText(handAll3)), 'opens', true],
  ['marker differs', await viaIndex((ix) => { ix.exportedFrom.sourceSha256 = B; }), 'opens', true],
  ['index sourceSha256 differs', await viaIndex((ix) => { ix.sourceSha256 = B; }), 'opens', true],
  ['deck-meta sourceSha256 differs', good.slice(0, dm) + B + good.slice(dm + 64), 'opens', true],
  ['marker without sourceSha256', await viaIndex((ix) => { delete ix.exportedFrom.sourceSha256; }), 'invalid-index'],
  ['marker without kind', await viaIndex((ix) => { delete ix.exportedFrom.kind; }), 'invalid-index'],
  ['marker sourceSha256 is a number', await viaIndex((ix) => { ix.exportedFrom.sourceSha256 = 12345; }), 'invalid-index'],
  ['marker sourceSha256 is null', await viaIndex((ix) => { ix.exportedFrom.sourceSha256 = null; }), 'invalid-index'],
  ['marker is a string', await viaIndex((ix) => { ix.exportedFrom = 'folder'; }), 'invalid-index'],
  ['marker with an extra member', await viaIndex((ix) => { ix.exportedFrom.path = '/home/x/folder'; }), 'invalid-index'],
  ['marker sourceSha256 of 8 MB', await viaIndex((ix) => { ix.exportedFrom.sourceSha256 = 'a'.repeat(8 * 1024 * 1024); }), 'index-too-large'],
];

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
// ページが答えるか（止まっていれば evaluate が返らない）
const answers = (page) => Promise.race([page.evaluate(() => true), sleep(5000, false)]);
try {
  for (const [name, html, want, edited] of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await page.goto(`${HOST}?lang=ja`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    const t0 = Date.now();
    const opening = page.evaluate(([data, n]) => {
      const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__APP_TEST.openFile({ bytes: u, name: n });
    }, [Buffer.from(html).toString('base64'), 'x' + FORMAT.FILE_EXT]);
    // 開き終わるか、断る窓が出るまで（どちらも 30 秒以内）
    const first = await Promise.race([opening.then((v) => ({ done: v })), page.waitForSelector('#dlg[open] #refuse-reason', { timeout: 30000 }).then(() => ({ refused: true }), () => ({ timeout: true }))]);
    if (want === 'opens') {
      ok(first.done === true, `${name}: opens (${Date.now() - t0} ms)`);
      await page.waitForSelector('#notice-exported', { timeout: 30000 }).catch(() => {});
      const t = (await page.textContent('#notice-exported').catch(() => '')) || '';
      ok(t.includes('作業フォルダのファイルは変わりません') && t.includes('書き出したあと、このファイルで直した所があります。') === edited,
        `${name}: the exported-copy notice ${edited ? 'says the copy was edited since export' : 'does not say it was edited'}`);
    } else {
      ok(!!first.refused, `${name}: the "cannot open" dialog comes up (${Date.now() - t0} ms)`);
      const tech = (await page.textContent('#dlg[open] pre.tech').catch(() => '')) || '';
      ok(tech.startsWith(`[${want}]`), `${name}: refused with ${want} (${tech.slice(0, 90)})`);
      ok(await answers(page), `${name}: the page answers while the dialog waits for OK`);
      await clickDlg(page, '#dlg-ok');
      const r = await Promise.race([opening, sleep(10000, 'still waiting')]);
      ok(r === false, `${name}: after OK, opening ends without opening the file (${r})`);
      ok((await page.evaluate(() => window.__APP_TEST.state().open)) === false && await page.isHidden('#notice-exported'), `${name}: nothing is open`);
    }
    ok(await answers(page), `${name}: the page answers`);
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
