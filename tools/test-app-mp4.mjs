// 「ファイル ▾」→「エクスポート ▸」→「動画（MP4）にする…」（#131、app/main.js の mp4Dialog）
//   node tools/test-app-mp4.mjs [作業用のフォルダ]
// 動画はブラウザの中では作らず、Google Colab のノート（colab/egatari-video.ipynb）に .ega.html を上げてもらう。この窓は案内と、
// 保存・エクスポートの後に Colab を新しいタブで開くだけ。examples/minimal の写し（1 ステップに台本と合わない音声＝更新が必要）で：
//   1. 1 ファイル（保存済み）：項目がある・窓の文にファイルの名前・音声の更新が必要なステップの 1 行・主のボタンは「Colab を開く」・新しいタブで Colab の動画のノート
//   2. 1 ファイル（保存していない変更）：主のボタンは「保存して Colab を開く」→ 保存してから開く。保存の後は「Colab を開く」
//   3. 作業フォルダ（まだエクスポートしていない）：「Egatari ファイルに保存して Colab を開く」→ エクスポートしてから開く。その後は「Colab を開く」
//   4. 新しいタブを開けなかった（ポップアップが止められた）：リンクを押してもらう窓
//   5. 英語の画面：同じ窓の英語
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { colabVideoUrl } from '../kit/core/colab-core.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { exportName } from '../kit/core/export-name.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { clickDlg, clickCommand } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-mp4-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 作業フォルダ：examples/minimal ＋ 1 ステップの音声（inputHash が null なので「更新が必要」）。pack が id を付けてフォルダに書き戻す
const src = path.join(work, 'src');
fs.rmSync(src, { recursive: true, force: true });
fs.mkdirSync(path.join(src, 'audio'), { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(src, f));
const first = parseNarration(fs.readFileSync(path.join(src, 'narration.md'), 'utf8'))[0];
fs.writeFileSync(path.join(src, 'audio', 'a.wav'), silentWav(1));
fs.writeFileSync(path.join(src, 'audio', 'manifest.json'), JSON.stringify({ segments: { [`${first.slideKey}:${first.stepKey}`]: { file: 'a.wav', dur: 1, inputHash: null } } }));
const packed = path.join(work, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', src, '-o', packed], { stdio: 'pipe' });
const lesson = fs.readFileSync(packed, 'utf8');
const folderFiles = {};
for (const rel of ['deck.html', 'narration.md', FORMAT.CONFIG_FILE, 'audio/manifest.json', 'audio/a.wav']) folderFiles[rel] = fs.readFileSync(path.join(src, rel)).toString('base64');
const title = JSON.parse(fs.readFileSync(path.join(src, FORMAT.CONFIG_FILE), 'utf8'))?.metadata?.title || '勾配降下法の基本';
const URL_ = colabVideoUrl();

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
  ja: { item: '動画（MP4）にする…', lead: (n) => `動画は Google Colab で作ります。この教材のファイル（${n}）を Colab に上げてください。Egatari のファイルのまま配れば、動画にしなくても再生できます。`,
    stale: '1 ステップの音声の更新が必要です（動画もその音声のままになります）', open: 'Colab を開く', save: '保存して Colab を開く', exp: 'Egatari ファイルに保存して Colab を開く' },
  en: { item: 'Make a video (MP4)…', lead: (n) => `Videos are made in Google Colab. Upload this lesson's file (${n}) to Colab. If you hand out the Egatari file as it is, it plays without making a video.`,
    stale: '1 step: audio needs updating (the video gets the audio as it is)', open: 'Open Colab', save: 'Save and open Colab', exp: 'Save as Egatari file and open Colab' },
};

const browser = await launch();
const errs = [];
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy && !s.building; }, n, { timeout: scaled(60000) });
// window.open の代わり（開いた URL と target を残す）。blocked なら null を返す（ポップアップが止められた）
const stubOpen = (page, blocked = false) => page.evaluate((blocked) => { window.__opened = []; window.open = (u, t) => { window.__opened.push([String(u), t]); return blocked ? null : {}; }; }, blocked);
async function dialog(page) {
  await clickCommand(page, '#b-export-mp4');
  await page.waitForSelector('#dlg[open] #mp4-lead');
  return page.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, lead: document.getElementById('mp4-lead').textContent,
    stale: (document.getElementById('mp4-stale') || {}).textContent || null, go: document.getElementById('dlg-go').textContent,
    pri: document.getElementById('dlg-go').classList.contains('pri'), cancel: !!document.getElementById('dlg-cancel') }));
}
const opened = (page) => page.waitForFunction(() => window.__opened.length > 0, null, { timeout: scaled(60000) }).then(() => page.evaluate(() => window.__opened), () => []);

try {
  for (const lang of ['ja', 'en']) {
    const T = W[lang];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
    await page.goto(`${HOST}?lang=${lang}`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    await page.evaluate(async (lang) => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('mp4-' + lang, { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('saved' + '.ega.html', { create: true }); }, lang);

    // 1. 1 ファイル（保存済み）
    const n0 = (await state(page)).loads;
    const okOpen = await page.evaluate(([data, name]) => {
      const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__APP_TEST.openFile({ bytes: u, name });
    }, [Buffer.from(lesson).toString('base64'), 'lesson' + FORMAT.FILE_EXT]);
    ok(okOpen === true, `${lang} file: opens`);
    await waitLoads(page, n0);
    await page.waitForFunction(() => (window.__APP_TEST.state().portable.stale || []).length === 1, null, { timeout: scaled(30000) });
    ok((await page.textContent('#b-export-mp4')) === T.item && (await page.evaluate(() => [...document.querySelectorAll('#m-export [role=menuitem]')].map((b) => b.id).join(','))).startsWith('b-export-play,b-export-mp4'),
      `${lang} file: File ▸ Export ▸ has “${T.item}” after For participants`);
    await stubOpen(page);
    let d = await dialog(page);
    const name = (await state(page)).portable.name;
    ok(d.lead === T.lead(name) && name === 'lesson' + FORMAT.FILE_EXT, `${lang} file: the dialog names this lesson's file (${d.lead})`);
    ok(d.stale === T.stale, `${lang} file: one line for the step whose audio needs updating (${d.stale})`);
    ok(d.go === T.open && d.pri && d.cancel, `${lang} file, saved: the main button is “${T.open}” (${d.go})`);
    await clickDlg(page, '#dlg-go');
    let o = await opened(page);
    ok(o.length === 1 && o[0][0] === URL_ && o[0][1] === '_blank' && URL_.endsWith('/colab/egatari-video.ipynb'), `${lang} file: opens the video notebook in a new tab (${JSON.stringify(o)})`);

    // キャンセルでは何も開かない
    await stubOpen(page);
    await dialog(page);
    await clickDlg(page, '#dlg-cancel');
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__opened.length)) === 0, `${lang} file: Cancel opens nothing`);

    // 2. 保存していない変更（テーマを変更。初めの編集では権利の確認に「続ける」）
    const n1 = (await state(page)).loads;
    await clickCommand(page, '#b-theme-switch');
    await page.waitForSelector('#dlg[open] #theme-switch-list');
    await page.check('#theme-opt-sumi');
    await clickDlg(page, '#dlg-change');
    const rights = await page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(1500) }).catch(() => null);
    if (rights) await clickDlg(page, '#dlg-ok');
    await waitLoads(page, n1);
    await page.waitForFunction(() => window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(30000) });
    await stubOpen(page);
    d = await dialog(page);
    ok(d.go === T.save, `${lang} file, unsaved changes: the main button is “${T.save}” (${d.go})`);
    await clickDlg(page, '#dlg-go');
    // 組み直す保存の確かめが出たら「組み直して保存」
    const rb = await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(5000) }).catch(() => null);
    if (rb) await clickDlg(page, '#dlg-rebuild');
    o = await opened(page);
    const st = await state(page);
    ok(!st.portable.dirty && o.length === 1 && o[0][0] === URL_, `${lang} file, unsaved changes: saves, then opens Colab (dirty ${st.portable.dirty}, ${JSON.stringify(o)})`);
    d = await dialog(page);
    ok(d.go === T.open, `${lang} file: after saving, the main button is “${T.open}” again`);
    await clickDlg(page, '#dlg-cancel');

    // 3. 作業フォルダ（まだエクスポートしていない）
    await page.evaluate(async ([name, files]) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(name, { create: true });
      for (const [rel, b64] of Object.entries(files)) {
        const parts = rel.split('/'); let dir = d;
        for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
        const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable(); await w.write(u); await w.close();
      }
      window.__dir = d;
      window.__APP_TEST.saveHandle = await d.getFileHandle('exported.ega.html', { create: true });
    }, ['mp4-folder-' + lang, folderFiles]);
    const n2 = (await state(page)).loads;
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dir)) === true, `${lang} folder: opens`);
    await waitLoads(page, n2);
    await page.waitForFunction(() => window.__APP_TEST.state().kind === 'folder', null, { timeout: scaled(30000) });
    await stubOpen(page);
    d = await dialog(page);
    const want = exportName(title, 'deck', FORMAT.FILE_EXT);
    ok(d.lead === T.lead(want), `${lang} folder: the dialog names the file it will export (${d.lead})`);
    ok(d.stale === T.stale, `${lang} folder: the audio line too (${d.stale})`);
    ok(d.go === T.exp, `${lang} folder, not exported yet: the main button is “${T.exp}” (${d.go})`);
    await clickDlg(page, '#dlg-go');
    o = await opened(page);
    const exported = await page.evaluate(async () => (await (await window.__APP_TEST.saveHandle.getFile()).text()).length);
    ok(exported > 1000 && o.length === 1 && o[0][0] === URL_, `${lang} folder: exports the Egatari file, then opens Colab (${exported} bytes, ${JSON.stringify(o)})`);
    // 書き出しの記録は Colab を開いたあとに残る（込んだ macOS では、すぐ開き直すと前の文言のことがある）。文言が変わるまで開き直す
    for (let i = 0; ; i++) { d = await dialog(page); if (d.go === T.open || i >= 20) break; await page.keyboard.press('Escape'); await page.waitForSelector('#dlg[open]', { state: 'detached' }).catch(() => {}); await page.waitForTimeout(250); }
    ok(d.go === T.open && d.lead === T.lead('exported.ega.html'), `${lang} folder: after the export, “${T.open}” and the exported file's name (${d.lead})`);

    // 4. ポップアップが止められた：リンクを押してもらう
    await stubOpen(page, true);
    await clickDlg(page, '#dlg-go');
    await page.waitForSelector('#dlg[open] #mp4-blocked', { timeout: scaled(10000) });
    ok((await page.getAttribute('#mp4-link', 'href')) === URL_ && (await page.getAttribute('#mp4-link', 'target')) === '_blank', `${lang}: when the new tab is blocked, a link to the notebook`);
    await clickDlg(page, '#dlg-cancel');
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
