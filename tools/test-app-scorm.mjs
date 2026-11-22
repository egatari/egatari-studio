// 編集アプリの「ファイル ▾ → エクスポート ▸ → LMS 用（SCORM）…」（app/main.js の scormExport、kit/core/scorm.mjs）の確認
//   node tools/test-app-scorm.mjs [作業用のフォルダ]
// 1. 窓：題・説明（何ができるか）・完了の決まり（metadata.completion を平たい言葉で。本のない教材は「台本で読む」）・確認問題の選択（完了の条件にしない・
//    すべて答えたら・すべて正解したら。始めは metadata.completion.checks）・確認問題の位置づけ（試験ではない）、ボタンは「キャンセル」と「ダウンロード」。
//    ja と en。キャンセルでは何もダウンロードしない
// 2. ダウンロード：<ファイルの名前>.scorm.zip（開いたファイルの参加者用（再生専用）と同じ名前の付け方。作業フォルダからは題名）。中身は imsmanifest.xml（docId と題）と index.html。index.html は開いたファイルの再生専用の写し
//    （kit/core/portable.mjs の playOnly）とバイトまで同じ。知らせは「… をダウンロードしました」
//    確認問題で「すべて正解したら完了」を選ぶと、index.html は再生専用の写しの deck-meta.completion に checks: "correct" を足したもの（ほかの規則は残る。kit/core/scorm.mjs の withChecks）
// 3. 保存していない変更があるとき：参加者用（再生専用）と同じく、窓を開かずに「先に保存」を知らせる
// 4. 作業フォルダ（ja）：選んだ確認問題の条件を egatari.json の metadata.completion.checks にも書き（ほかの項目は残す）、次に開く窓はその値から。
//    「完了の条件にしない」に戻すと checks だけを消す
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { playOnly } from '../kit/core/portable.mjs';
import { readZip } from '../kit/core/zip-read.mjs';
import { scormManifest, withChecks } from '../kit/core/scorm.mjs';
import { clickCommand, clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-app-scorm-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 作業フォルダから書き出した Egatari ファイル（examples/minimal の写し。完了の決まりは「9 割を再生」）
const DOC_ID = '5e2a9c41-7b3d-4f8e-a1c6-2d9b0e4f7a13';
const src = path.join(work, 'src');
fs.rmSync(src, { recursive: true, force: true });
fs.mkdirSync(src, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(src, f));
fs.writeFileSync(path.join(src, FORMAT.CONFIG_FILE), JSON.stringify({ docId: DOC_ID, metadata: { completion: { visitedFraction: 0.9, played: true } } }, null, 1));
const ega = (await buildPortable(path.join(src, 'deck.html'), { out: path.join(work, 'lesson' + FORMAT.FILE_EXT) })).html;
const title = ega.match(/<title>([^<]*)<\/title>/)[1];

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
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

const WANT = {
  ja: {
    title: 'LMS 用（SCORM）にエクスポート', item: 'LMS 用（SCORM）…',
    lead: 'Moodle などの LMS に「SCORM パッケージ」として追加できる ZIP ファイル（SCORM 1.2）をダウンロードします。',
    rule: 'ステップの 90% 以上をスライドで再生すると「完了」になります（台本で読むだけでは数えません）',
    hint: '答えはファイルの中にあり、学習者の端末で判定するので、ファイルの中身を見れば分かります。確認問題は理解を確かめるためのもので、試験には使えません。成績を付けるときは LMS の小テストを使ってください',
    checksLabel: '確認問題', checks: '完了の条件にしない,すべて答えたら完了,すべて正解したら完了',
    buttons: 'キャンセル,ダウンロード',
    toast: (n) => `${n} をダウンロードしました。LMS で「SCORM パッケージ」として追加してください`,
    unsaved: '保存していない変更があります。LMS 用（SCORM）は保存したものから作るので、先に「保存」してください',
  },
  en: {
    title: 'Export for an LMS (SCORM)', item: 'For an LMS (SCORM)…',
    lead: 'Downloads a ZIP file (SCORM 1.2) that you can add to an LMS such as Moodle as a “SCORM package”.',
    rule: 'It is “completed” when at least 90% of the steps are played on the slides (steps only read with script do not count)',
    hint: 'The answers are in the file and are judged on the learner’s device, so anyone can find them by looking inside the file. Questions are for checking understanding and cannot be used as a test. For grades, use the LMS’s own quizzes',
    checksLabel: 'Questions', checks: 'Not required for completion,Completed when all are answered,Completed when all are answered correctly',
    buttons: 'Cancel,Download',
    toast: (n) => `Downloaded ${n}. In the LMS, add it as a “SCORM package”.`,
    unsaved: 'There are unsaved changes. The LMS copy is made from the saved file, so Save first.',
  },
};

// 開いたファイルの初めの編集（スライドの字を 1 つ足す。tools/test-app-drafts.mjs と同じ）：保存していない変更を作る
async function editText(page, mark) {
  const t0 = Date.now();
  let range = null;
  while (!range && Date.now() - t0 < scaled(30000)) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { range = f && await f.evaluate(() => { const e = document.querySelector('#stage .slide h2[data-src], #stage .slide p[data-src], #stage .slide li[data-src]'); return e ? e.getAttribute('data-src') : null; }); } catch { /* 読み込み中 */ }
    if (!range) await page.waitForTimeout(150);
  }
  let s = null;
  for (let i = 0; i < 60 && !(s && s.text); i++) { s = await page.evaluate((r) => window.__APP_TEST.api('GET', `/__dev/source?range=${r}`), range); if (!(s && s.text)) await page.waitForTimeout(150); }
  const next = /<[^>]*>/.test(s.text) ? s.text.replace(/>([^<]+)</, `>$1${mark}<`) : s.text + mark;
  const call = page.evaluate(([r, h, text]) => window.__APP_TEST.api('POST', '/__dev/edit', { range: r, h, text }), [range, s.h, next]);
  const rights = await Promise.race([call.then(() => null), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(30000) }).catch(() => null)]);
  if (rights) await clickDlg(page, '#dlg-ok');
  await call;
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(30000) });
}

const browser = await launch();
const errs = [];
try {
  for (const lang of ['ja', 'en']) {
    const W = WANT[lang];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${lang}: ${e.message}`));
    await page.goto(`${HOST}?lang=${lang}`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    const opened = await page.evaluate(([data, n]) => {
      const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__APP_TEST.openFile({ bytes: u, name: n });
    }, [Buffer.from(ega).toString('base64'), 'lesson' + FORMAT.FILE_EXT]);
    ok(opened === true, `${lang}: the Egatari file opens`);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.open && !s.building; }, null, { timeout: scaled(60000) });
    ok((await page.textContent('#b-export-scorm')) === W.item, `${lang}: File ▸ Export ▸ ${W.item}`);

    // 1. 窓とキャンセル
    let downloads = 0;
    page.on('download', () => downloads++);
    await clickCommand(page, '#b-export-scorm');
    await page.waitForSelector('#dlg[open] #scorm-rule');
    await page.screenshot({ path: path.join(work, `dialog-${lang}.png`) });   // 目で見る用
    const d = await page.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, lead: document.getElementById('scorm-lead').textContent, rule: document.getElementById('scorm-rule').textContent, hint: document.getElementById('scorm-hint').textContent,
      buttons: [...document.querySelectorAll('#dlg[open] button')].filter((b) => b.offsetParent && b.id.startsWith('dlg-')).map((b) => b.textContent).join(',') }));
    ok(d.title === W.title && d.lead.startsWith(W.lead), `${lang}: the dialog says what it makes (${d.title} / ${d.lead.slice(0, 60)}…)`);
    ok(d.rule === W.rule, `${lang}: the dialog says how completion is decided, from metadata.completion (${d.rule})`);
    ok(d.hint.includes(W.hint), `${lang}: and that questions check understanding, not a test (${d.hint})`);
    const ck = await page.evaluate(() => { const s = document.getElementById('scorm-checks'), l = document.querySelector('label[for="scorm-checks"]');
      return { label: l && l.textContent, options: s && [...s.options].map((o) => o.textContent).join(','), values: s && [...s.options].map((o) => o.value).join(','), value: s && s.value }; });
    ok(ck.label === W.checksLabel && ck.options === W.checks && ck.values === 'none,answered,correct' && ck.value === 'none',
      `${lang}: a labelled choice of whether questions count for completion, starting from metadata.completion (none) (${JSON.stringify(ck)})`);
    ok(d.buttons === W.buttons, `${lang}: buttons are cancel and download (${d.buttons})`);
    await clickDlg(page, '#dlg-cancel');
    await page.waitForTimeout(300);
    ok(downloads === 0 && !(await page.$('#dlg[open]')), `${lang}: Cancel closes the dialog and downloads nothing`);

    // 2. ダウンロード
    await clickCommand(page, '#b-export-scorm');
    await page.waitForSelector('#dlg[open] #scorm-rule');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: scaled(60000) }), clickDlg(page, '#dlg-download')]);
    const name = dl.suggestedFilename();
    ok(name === 'lesson.scorm.zip', `${lang}: downloads <file name>.scorm.zip, named like the play-only export of an opened file (${name})`);
    const zp = path.join(work, `${lang}.zip`);
    await dl.saveAs(zp);
    const files = (await readZip(new Uint8Array(fs.readFileSync(zp)), { maxMembers: 10, maxMemberBytes: () => 64 * 1048576, maxTotalBytes: 128 * 1048576, accept: () => true })).files;
    ok([...files.keys()].join() === 'imsmanifest.xml,index.html', `${lang}: the zip holds imsmanifest.xml and index.html`);
    ok(Buffer.compare(Buffer.from(files.get('index.html')), Buffer.from(playOnly(ega))) === 0, `${lang}: index.html is the play-only copy of the opened file, byte for byte`);
    ok(new TextDecoder().decode(files.get('imsmanifest.xml')) === scormManifest({ docId: DOC_ID, title }), `${lang}: imsmanifest.xml carries the lesson's docId and title`);
    await page.waitForFunction((t) => [...document.querySelectorAll('.toast, #toast, [role=status]')].some((e) => e.textContent.includes(t)), W.toast(name), { timeout: scaled(10000) }).then(() => true, () => false)
      .then((v) => ok(v, `${lang}: the notice says it was downloaded and what to do in the LMS`));
    // 確認問題：すべて正解したら完了
    await clickCommand(page, '#b-export-scorm');
    await page.waitForSelector('#dlg[open] #scorm-checks');
    await page.selectOption('#scorm-checks', 'correct');
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: scaled(60000) }), clickDlg(page, '#dlg-download')]);
    const zp2 = path.join(work, `${lang}-correct.zip`);
    await dl2.saveAs(zp2);
    const idx2 = (await readZip(new Uint8Array(fs.readFileSync(zp2)), { maxMembers: 10, maxMemberBytes: () => 64 * 1048576, maxTotalBytes: 128 * 1048576, accept: () => true })).files.get('index.html');
    const meta2 = JSON.parse(/<script type="application\/json" id="deck-meta">([\s\S]*?)<\/script>/.exec(new TextDecoder().decode(idx2))[1]);
    ok(Buffer.compare(Buffer.from(idx2), Buffer.from(withChecks(playOnly(ega), 'correct'))) === 0 && JSON.stringify(meta2.completion) === '{"visitedFraction":0.9,"played":true,"checks":"correct"}',
      `${lang}: "all answered correctly": index.html is the play-only copy with checks "correct" added to deck-meta.completion (${JSON.stringify(meta2.completion)})`);

    // 3. 保存していない変更
    if (lang === 'ja') {
      await editText(page, '（直した）');
      const before = downloads;
      await clickCommand(page, '#b-export-scorm');
      const shown = await page.waitForFunction((t) => [...document.querySelectorAll('.toast, #toast, [role=status], [role=alert]')].some((e) => e.textContent.includes(t)), W.unsaved, { timeout: scaled(10000) }).then(() => true, () => false);
      ok(shown && !(await page.$('#dlg[open] #scorm-rule')) && downloads === before, 'unsaved changes: no dialog, a notice to save first (the same rule as For participants (play-only)…)');
    }
    await ctx.close();
  }

  // 4. 作業フォルダ：選んだ条件を egatari.json にも書く
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`folder: ${e.message}`));
    await page.goto(`${HOST}?lang=ja`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    const ff = {};
    for (const f of ['deck.html', 'narration.md', FORMAT.CONFIG_FILE]) ff[f] = fs.readFileSync(path.join(src, f)).toString('base64');
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('scormdeck', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('scormdeck', { create: true });
      for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
      window.__fd = d;
      window.__APP_TEST.open(d);
    }, ff);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.kind === 'folder' && !s.building; }, null, { timeout: scaled(60000) });
    const conf = async () => JSON.parse(await page.evaluate(async (n) => (await (await window.__fd.getFileHandle(n)).getFile()).text(), FORMAT.CONFIG_FILE));
    const exportWith = async (v) => {
      await clickCommand(page, '#b-export-scorm');
      await page.waitForSelector('#dlg[open] #scorm-checks');
      const before = await page.inputValue('#scorm-checks');
      await page.selectOption('#scorm-checks', v);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: scaled(90000) }), clickDlg(page, '#dlg-download')]);
      const zp = path.join(work, `folder-${v}.zip`);
      await dl.saveAs(zp);
      const idx = (await readZip(new Uint8Array(fs.readFileSync(zp)), { maxMembers: 10, maxMemberBytes: () => 64 * 1048576, maxTotalBytes: 128 * 1048576, accept: () => true })).files.get('index.html');
      return { before, meta: JSON.parse(/<script type="application\/json" id="deck-meta">([\s\S]*?)<\/script>/.exec(new TextDecoder().decode(idx))[1]) };
    };
    const a = await exportWith('answered');
    const c1 = await conf();
    ok(a.before === 'none' && JSON.stringify(c1.metadata.completion) === '{"visitedFraction":0.9,"played":true,"checks":"answered"}' && c1.docId === DOC_ID && a.meta.completion.checks === 'answered',
      `folder: "all answered" is written to egatari.json metadata.completion.checks (other members kept) and into the package (${JSON.stringify(c1.metadata.completion)})`);
    const b = await exportWith('none');
    const c2 = await conf();
    ok(b.before === 'answered' && JSON.stringify(c2.metadata.completion) === '{"visitedFraction":0.9,"played":true}' && !('checks' in b.meta.completion),
      `folder: the next dialog starts from the saved choice; "not a condition" removes only checks (${b.before}; ${JSON.stringify(c2.metadata.completion)})`);
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
