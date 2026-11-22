// 編集アプリの「ファイルの情報…」で、タイトル・作成者・著作権の表示・ライセンス・クレジットを書く（handoff #88）と、
// 初めての保存の問い「このファイルは、あなたが作ったものですか。」（ライセンスのないファイルなら、同じ窓でライセンスを選ぶ）
//   node tools/test-app-file-info.mjs [作業用のフォルダ]
// 1. 初めての保存：問いと 2 つの答え。「はい」でライセンスのないファイルなら、ライセンス（3 つと付けない）・作成者・著作権の表示。
//    ライセンスを選ぶまで保存できない。選んだものが保存したファイルの索引と deck-meta に入る
// 2. Egatari ファイルの「ファイルの情報…」：説明の文・欄（書き換えられないという文はない）・その他の名前の確かめ・保存の知らせ・
//    保存していない変更になり、次の保存でファイルに入る。「付けない」で license がなくなる。英語
// 3. ほかの人のファイルを直している（この端末で「いいえ」と答えた）なら、作成者の欄に 1 行
// 4. 作業フォルダ：保存で egatari.json の metadata に書く（ほかの項目はそのまま）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { clickDlg, clickCommand } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-file-info-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
const CFG = FORMAT.CONFIG_FILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dec = new TextDecoder();

function prepare(dir, config) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.writeFileSync(path.join(dir, CFG), JSON.stringify(config, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
// ライセンスのない、ほかの人の名前のあるファイル（著作権の表示はない：改変を認めない扱いにならない）
const NOLIC = { creators: ['Test Author'], attribution: 'Test Lab' };
const pNo = await buildPortable(prepare(path.join(work, 'src-nolic'), { metadata: NOLIC }), { out: path.join(work, 'nolic' + FORMAT.FILE_EXT) });
const LIC = { license: 'CC-BY-4.0', creators: ['Test Author'], copyright: '© 2026 Test Author' };
const pLic = await buildPortable(prepare(path.join(work, 'src-lic'), { metadata: LIC }), { out: path.join(work, 'lic' + FORMAT.FILE_EXT) });
const rLic = await readPortable(pLic.html);
// 直す台本のステップ（組み立てで id が付くので、ファイルごとに）
const keyOf = async (html) => { const seg = parseNarration(dec.decode((await readPortable(html)).files['narration.md']))[0]; return `${seg.slideKey}:${seg.stepKey}`; };
const NKEY = { [pNo.html]: await keyOf(pNo.html), [pLic.html]: await keyOf(pLic.html) };
// 作業フォルダ（ほかの項目を残すかを見るため、知らない項目と docId を置く）
const FOLDER_CONF = { docId: 'ega-test-file-info', producerX: { keep: [1, 2] }, metadata: { title: 'Folder title', lang: 'ja', license: 'CC-BY-4.0' } };
const FDIR = path.join(work, 'src-folder');
prepare(FDIR, FOLDER_CONF);

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
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
// 開く（OPFS に保存先のハンドルを置く）。init：ページを開く前に動かす（この端末の答えを置くなど）
async function openPage(label, html, { lang = 'ja', init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(`${HOST}?lang=${lang}`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate(async (n) => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle(n, { create: true }); }, `${label}.ega.html`);
  const opened = await page.evaluate((data) => { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson.ega.html' }); }, Buffer.from(html).toString('base64'));
  ok(opened === true, `${label}: opens`);
  await page.waitForFunction(() => !window.__APP_TEST.state().building, null, { timeout: scaled(30000) });
  page.__key = NKEY[html];
  return { ctx, page };
}
// 保存して、保存したファイルを読む（段 B の確かめが出れば再ビルド）
async function saveAndRead(page) {
  // 初めての保存の問いには、作成者と答えたことにする（問いそのものは 1. で試す）
  await page.evaluate(() => { window.__APP_TEST.editRole = 'creator'; });
  const sv = page.evaluate(() => window.__APP_TEST.save('save'));
  const which = await Promise.race([sv.then(() => 'saved'), page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(30000) }).then(() => 'tierB', () => 'saved')]);
  if (which === 'tierB') await clickDlg(page, '#dlg-rebuild');
  await sv;
  await page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
  return readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
}
async function editScript(page, suffix) {
  const key = page.__key;
  const g = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), key);
  const post = page.evaluate(([k, rev, turns]) => { const i = k.lastIndexOf(':'); return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, i), stepKey: k.slice(i + 1), rev, turns }); },
    [key, g.rev, g.turns.map((t) => ({ role: t.role, text: t.text + suffix }))]);
  if (await Promise.race([post.then(() => false), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(8000) }).then(() => true, () => false)])) await clickDlg(page, '#dlg-ok');
  const r = await post;
  return r && r._status === 200;
}
async function openInfo(page) {
  await clickCommand(page, '#b-info');
  await page.waitForSelector('#info-form');
}
const toastIs = (page, t) => page.waitForFunction((t) => document.getElementById('toast').textContent === t, t, { timeout: scaled(15000) }).then(() => true, () => false);

try {
  // ---------------------------------------------------------------- 1. 初めての保存（ライセンスのないファイル）
  {
    const { ctx, page } = await openPage('first-save', pNo.html);
    ok(await editScript(page, '（直した）'), 'first save: the script is edited');
    const sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForSelector('#dlg[open] #edit-role-creator', { timeout: scaled(15000) });
    ok((await page.textContent('#dlg-title')) === 'このファイルは、あなたが作ったものですか。', 'first save: the question is 「このファイルは、あなたが作ったものですか。」');
    ok((await page.textContent('label:has(#edit-role-creator)')) === 'はい、自分で作りました' && (await page.textContent('label:has(#edit-role-other)')) === 'いいえ、ほかの人のファイルを直しています', 'first save: the two answers');
    ok(await page.isDisabled('#dlg-save') && !(await page.isVisible('#edit-own')), 'first save: Save is disabled and the license block is hidden until an answer is chosen');
    await page.check('#edit-role-creator');
    ok(await page.isVisible('#edit-own') && (await page.textContent('#edit-license-title')) === 'ライセンスを付けますか' && (await page.textContent('#edit-license-later')) === 'あとで「ファイルの情報…」で変えられます', 'first save, yes: the license question with the note that it can be changed later');
    const lics = await page.$$eval('#edit-own input[name=edit-license]', (xs) => xs.map((x) => x.value + '=' + x.closest('label').textContent));
    ok(same(lics, ['CC-BY-4.0=CC BY 4.0', 'CC-BY-SA-4.0=CC BY-SA 4.0', 'CC-BY-NC-4.0=CC BY-NC 4.0', 'none=ライセンスを付けない（すべての権利を留保）']), 'first save, yes: CC BY 4.0, CC BY-SA 4.0, CC BY-NC 4.0 and no license ' + JSON.stringify(lics));
    ok(await page.isDisabled('#dlg-save'), 'first save, yes: Save stays disabled until a license is chosen (no silent default)');
    ok((await page.inputValue('#edit-creators')) === 'Test Author' && (await page.inputValue('#edit-copyright')) === '', 'first save, yes: the creators and copyright fields show the current values');
    await page.check('#edit-own input[value="CC-BY-SA-4.0"]');
    await page.fill('#edit-creators', 'Test Author\n\n  Second Author ');
    await page.fill('#edit-copyright', '© 2026 Test Author');
    ok(!(await page.isDisabled('#dlg-save')), 'first save, yes: Save is enabled once a license is chosen');
    await page.screenshot({ path: path.join(work, 'first-save.png') });
    await clickDlg(page, '#dlg-save');
    const which = await Promise.race([sv.then(() => 'saved'), page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(30000) }).then(() => 'tierB', () => 'saved')]);
    if (which === 'tierB') { ok(/egatari\.json/.test(await page.textContent('#tier-b-why')), 'first save: the rebuild notice names the file info'); await clickDlg(page, '#dlg-rebuild'); }
    await sv;
    await page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
    const saved = await readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
    const m = saved.index.metadata;
    ok(m.license === 'CC-BY-SA-4.0' && m.copyright === '© 2026 Test Author' && same(m.creators, ['Test Author', 'Second Author']) && m.attribution === 'Test Lab', 'first save, yes: license, creators and copyright are in the saved index (attribution kept) ' + JSON.stringify(m));
    ok(saved.deckMeta.license === 'CC-BY-SA-4.0' && same(saved.deckMeta.creators, ['Test Author', 'Second Author']), 'first save, yes: and in deck-meta (what the player shows)');
    ok(m.edits === undefined, 'first save, yes: no edit entry');
    await ctx.close();
  }
  // 「付けない」：何も書かずに保存する（段 A のまま）
  {
    const { ctx, page } = await openPage('first-save-none', pNo.html);
    ok(await editScript(page, '（直した 2）'), 'first save (no license): the script is edited');
    const sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForSelector('#dlg[open] #edit-role-creator', { timeout: scaled(15000) });
    await page.check('#edit-role-creator');
    await page.check('#edit-license-none');
    await clickDlg(page, '#dlg-save');
    await sv;
    await page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
    const st = await page.evaluate(() => window.__APP_TEST.state().portable);
    const saved = await readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
    ok(st.lastTier === 'A' && saved.index.metadata.license === undefined && same(saved.index.metadata.creators, ['Test Author']), `first save, no license chosen: nothing is written, saved without rebuilding (tier ${st.lastTier})`);
    await ctx.close();
  }
  // ライセンスのあるファイル：「はい」でライセンスは聞かない
  {
    const { ctx, page } = await openPage('first-save-lic', pLic.html);
    ok(await editScript(page, '（直した 3）'), 'first save (licensed): the script is edited');
    const sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForSelector('#dlg[open] #edit-role-creator', { timeout: scaled(15000) });
    await page.check('#edit-role-creator');
    ok(!(await page.$('#edit-own')) && !(await page.isDisabled('#dlg-save')), 'first save, licensed file: no license question, Save is enabled');
    await clickDlg(page, '#dlg-cancel');
    await sv;
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. Egatari ファイルの「ファイルの情報…」
  {
    const { ctx, page } = await openPage('info', pLic.html);
    await openInfo(page);
    const body = await page.textContent('#panel-body');
    ok((await page.textContent('#info-panel .hint')) === 'タイトル・ライセンス・作成者・著作権を書くと、ファイルに保存され、プレーヤーの「ファイルの情報」に表示されます' && !/書き換えられません/.test(body), 'info: the new lead, no 「今は、ここでは書き換えられません」');
    ok((await page.inputValue('#info-title')) === rLic.index.metadata.title || (await page.inputValue('#info-title')) === '', 'info: the title field');
    ok((await page.inputValue('#info-creators')) === 'Test Author' && (await page.inputValue('#info-copyright')) === '© 2026 Test Author' && (await page.inputValue('#info-license')) === 'CC-BY-4.0' && (await page.inputValue('#info-attribution')) === '', 'info: the fields show the current values');
    const opts = await page.$$eval('#info-license option', (xs) => xs.map((x) => x.textContent));
    ok(same(opts, ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'CC BY-NC-ND 4.0', 'CC0 1.0', 'ライセンスを付けない（すべての権利を留保）', 'その他（SPDX の名前を入力）']), 'info: the license choices ' + JSON.stringify(opts));
    ok((await page.textContent('#info-license-help')) === 'ほかの人が使ったり手を加えたりできる範囲です。迷ったら CC BY 4.0（名前を表示すれば、だれでも使ったり手を加えたりできる）', 'info: the license help');
    ok((await page.textContent('#info-save')) === '保存' && (await page.textContent('#info-cancel')) === 'キャンセル' && !(await page.$('#info-other-creator')), 'info: Save / Cancel, no note about another creator');
    // その他：名前がない・SPDX でない
    await page.selectOption('#info-license', 'other');
    ok(await page.isVisible('#info-license-other'), 'info: Other shows the name field');
    await page.click('#info-save');
    ok(await page.isVisible('#info-error') && (await page.textContent('#info-error')) === 'ライセンスの名前を入力してください', 'info: Other without a name → error');
    await page.fill('#info-license-other', 'All rights reserved');
    await page.click('#info-save');
    ok((await page.textContent('#info-error')) === 'ライセンスは SPDX の名前（例：MIT、CC-BY-4.0）で入力してください', 'info: Other that is not an SPDX name → error');
    ok(!(await page.evaluate(() => window.__APP_TEST.state().portable.dirty)), 'info: nothing changed after the errors');
    // キャンセル：欄を今の値に戻す
    await page.fill('#info-title', 'Changed');
    await page.click('#info-cancel');
    ok((await page.inputValue('#info-title')) !== 'Changed' && (await page.inputValue('#info-license')) === 'CC-BY-4.0', 'info: Cancel restores the fields');
    // 保存
    await page.fill('#info-title', 'てこのはたらき');
    await page.fill('#info-creators', 'Test Author\n\n 山田 花子 ');
    await page.fill('#info-copyright', '© 2026 山田 花子');
    await page.selectOption('#info-license', 'other');
    await page.fill('#info-license-other', 'Apache-2.0 OR MIT');
    await page.fill('#info-attribution', '○○大学 ○○研究室');
    await page.screenshot({ path: path.join(work, 'info.png') });
    await page.click('#info-save');
    if (await page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(5000) }).catch(() => null)) await clickDlg(page, '#dlg-ok');
    ok(await toastIs(page, 'ファイルの情報を保存しました'), 'info: the toast 「ファイルの情報を保存しました」');
    ok(await page.evaluate(() => window.__APP_TEST.state().portable.dirty), 'info: an Egatari file now has unsaved changes (written at the next save)');
    ok((await page.inputValue('#info-title')) === 'てこのはたらき' && (await page.inputValue('#info-license')) === 'other' && (await page.inputValue('#info-license-other')) === 'Apache-2.0 OR MIT', 'info: the panel shows the saved values');
    const saved = await saveAndRead(page);
    const m = saved.index.metadata;
    ok(m.title === 'てこのはたらき' && same(m.creators, ['Test Author', '山田 花子']) && m.copyright === '© 2026 山田 花子' && m.license === 'Apache-2.0 OR MIT' && m.attribution === '○○大学 ○○研究室', 'info: the next save writes them into the index ' + JSON.stringify(m));
    ok(saved.deckMeta.title === 'てこのはたらき' && saved.deckMeta.license === 'Apache-2.0 OR MIT' && saved.deckMeta.attribution === '○○大学 ○○研究室', 'info: and into deck-meta');
    // 付けない：license を消す
    await openInfo(page);
    await page.selectOption('#info-license', 'none');
    await page.fill('#info-attribution', '');
    await page.click('#info-save');
    ok(await toastIs(page, 'ファイルの情報を保存しました'), 'info (no license): saved');
    const s2 = await saveAndRead(page);
    ok(!('license' in s2.index.metadata) && !('attribution' in s2.index.metadata) && !('license' in s2.deckMeta) && s2.index.metadata.copyright === '© 2026 山田 花子', 'info: "no license" and an empty attribution remove the keys, the rest stays ' + JSON.stringify(s2.index.metadata) + ' tier ' + (await page.evaluate(() => window.__APP_TEST.state().portable.lastTier)));
    await ctx.close();
  }
  // 英語
  {
    const { ctx, page } = await openPage('info-en', pLic.html, { lang: 'en' });
    await openInfo(page);
    ok((await page.textContent('#info-panel .hint')) === 'Title, license, creators and copyright are saved in the file and shown in the player’s File info', 'en: the lead');
    const labels = await page.$$eval('#info-form > label', (xs) => xs.map((x) => x.textContent));
    ok(same(labels, ['Title', 'Creators (one per line)', 'Copyright notice (e.g. © 2026 Name)', 'License', 'Attribution (e.g. Lab name, University)']), 'en: the field labels ' + JSON.stringify(labels));
    const opts = await page.$$eval('#info-license option', (xs) => xs.map((x) => x.textContent));
    ok(opts.slice(-2).join('|') === 'No license (all rights reserved)|Other (enter an SPDX name)', 'en: the last two license choices');
    await page.fill('#info-attribution', 'Lab');
    await page.click('#info-save');
    if (await page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(5000) }).catch(() => null)) await clickDlg(page, '#dlg-ok');
    ok(await toastIs(page, 'File info saved'), 'en: the toast “File info saved”');
    await ctx.close();
  }

  // ---------------------------------------------------------------- 3. ほかの人のファイル（この端末で「いいえ」と答えた）
  {
    const init = { fn: ([key]) => { try { localStorage.setItem(key, 'other'); } catch { /* なし */ } }, arg: ['egatari-edit-role:' + rLic.index.docId] };
    const { ctx, page } = await openPage('info-other', pLic.html, { init });
    await openInfo(page);
    ok((await page.textContent('#info-other-creator')) === 'このファイルの作成者は Test Author です。作成者を書き換えるのではなく、編集した人として名前を残すには「編集：名前（内容）」を使ってください', 'other: the one line about the creator');
    ok(!(await page.isDisabled('#info-creators')), 'other: the creators field can still be changed');
    await ctx.close();
    const e = await openPage('info-other-en', pLic.html, { lang: 'en', init });
    await openInfo(e.page);
    ok((await e.page.textContent('#info-other-creator')) === 'The creator of this file is Test Author. To record your own changes, use “Edited by” instead of changing the creator', 'other (en): the one line');
    await e.ctx.close();
  }

  // ---------------------------------------------------------------- 4. 作業フォルダ
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`folder: ${e.message}`));
    await page.goto(`${HOST}?lang=ja`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    const ff = {};
    for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(FDIR, f)).toString('base64');
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('infodeck', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('infodeck', { create: true });
      for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
      window.__fd = d;
      window.__APP_TEST.open(d);
    }, ff);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.kind === 'folder' && !s.building; }, null, { timeout: scaled(30000) });
    await openInfo(page);
    ok((await page.inputValue('#info-title')) === 'Folder title' && (await page.inputValue('#info-license')) === 'CC-BY-4.0', 'folder: the fields come from egatari.json');
    await page.fill('#info-creators', '鈴木 太郎');
    await page.selectOption('#info-license', 'CC0-1.0');
    await page.click('#info-save');
    ok(await toastIs(page, 'ファイルの情報を保存しました'), 'folder: saved');
    const conf = JSON.parse(await page.evaluate(async (n) => (await (await window.__fd.getFileHandle(n)).getFile()).text(), CFG));
    ok(same(conf.metadata, { title: 'Folder title', lang: 'ja', license: 'CC0-1.0', creators: ['鈴木 太郎'] }) && conf.docId === FOLDER_CONF.docId && same(conf.producerX, FOLDER_CONF.producerX), 'folder: egatari.json metadata is written, other members kept ' + JSON.stringify(conf));
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
