// 編集アプリの「ファイルの情報…」で、タイトル・作成者・著作権の表示・ライセンス・クレジットを書く（handoff #88）と、
// 初めての保存の問い「このファイルは、あなたが作ったものですか。」（ライセンスのないファイルなら、同じ窓でライセンスを選ぶ）
//   node tools/test-app-file-info.mjs [作業用のフォルダ]
// 1. 初めての保存：問いと 2 つの答え。「はい」でライセンスのないファイルなら、ライセンス（3 つと付けない）・作成者・著作権の表示。
//    ライセンスを選ぶまで保存できない。選んだものが保存したファイルの索引と deck-meta に入る
// 2. Egatari ファイルの「ファイルの情報…」：説明の文・欄（書き換えられないという文はない）・その他の名前の確かめ・保存の知らせ・
//    保存していない変更になり、次の保存でファイルに入る。「付けない」で license がなくなる。英語
// 3. ほかの人のファイルを直している（この端末で「いいえ」と答えた）なら、作成者の欄に 1 行
// 4. 作業フォルダ：保存で egatari.json の metadata に書く（ほかの項目はそのまま）
// 5. ライセンスのない、作ったかを聞かないファイル（Studio 製・権利の表示なし）：初めての保存でライセンスの部分だけを一度聞く。
//    「付けない」はファイルを変えず、次の保存では聞かない。CC BY 4.0 は書く。ライセンスのあるファイル・作業フォルダでは聞かない
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
// 権利の表示がまったくないファイル（2 つ：docId が別）と、権利の表示がなくライセンスだけあるファイル
const pBare1 = await buildPortable(prepare(path.join(work, 'src-bare1'), { metadata: {} }), { out: path.join(work, 'bare1' + FORMAT.FILE_EXT) });
const pBare2 = await buildPortable(prepare(path.join(work, 'src-bare2'), { metadata: {} }), { out: path.join(work, 'bare2' + FORMAT.FILE_EXT) });
const pBare3 = await buildPortable(prepare(path.join(work, 'src-bare3'), { metadata: {} }), { out: path.join(work, 'bare3' + FORMAT.FILE_EXT) });
const pLicOnly = await buildPortable(prepare(path.join(work, 'src-liconly'), { metadata: { license: 'CC-BY-4.0' } }), { out: path.join(work, 'liconly' + FORMAT.FILE_EXT) });
for (const x of [pBare1, pBare2, pBare3, pLicOnly]) NKEY[x.html] = await keyOf(x.html);

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
async function openPage(label, html, { lang = 'ja', init = null, fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  // 落ちたときの手がかり（CI の Windows・node 22 で 3 つ目の場面が止まった）：場面の始まりからの時間・ページの console・止まったときの表示
  const t0 = Date.now(), con = [];
  page.on('console', (m) => con.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m.type()}: ${m.text().slice(0, 200)}`));
  page.__diag = async (what) => {
    console.log(`       ${label}: stuck at ${what} after ${((Date.now() - t0) / 1000).toFixed(1)} s; console:\n         ` + (con.slice(-15).join('\n         ') || '(none)'));
    await page.screenshot({ path: path.join(work, `stuck-${label}.png`), timeout: 5000 }).catch((e) => console.log('       (no screenshot: ' + e.message.split('\n')[0] + ')'));
  };
  await page.goto(`${HOST}?lang=${lang}`);
  await page.waitForFunction(() => !!window.__APP_TEST).catch(async (e) => { await page.__diag('the editor starting'); throw e; });
  console.log(`       ${label}: the editor started in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(async (n) => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle(n, { create: true }); }, `${label}.ega.html`);
  const opened = await page.evaluate(({ data, fresh }) => { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson.ega.html', fresh: data.fresh }); }, { data: Buffer.from(html).toString('base64'), fresh });
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
    ok(same(lics, ['CC-BY-4.0=CC BY 4.0', 'CC-BY-NC-4.0=CC BY-NC 4.0', 'none=ライセンスを付けない（すべての権利を留保）']), 'first save, yes: CC BY 4.0, CC BY-NC 4.0 and no license ' + JSON.stringify(lics));
    ok(await page.isDisabled('#dlg-save'), 'first save, yes: Save stays disabled until a license is chosen (no silent default)');
    ok((await page.inputValue('#edit-creators')) === 'Test Author' && (await page.inputValue('#edit-copyright')) === '', 'first save, yes: the creators and copyright fields show the current values');
    await page.check('#edit-own input[value="CC-BY-NC-4.0"]');
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
    ok(m.license === 'CC-BY-NC-4.0' && m.copyright === '© 2026 Test Author' && same(m.creators, ['Test Author', 'Second Author']) && m.attribution === 'Test Lab', 'first save, yes: license, creators and copyright are in the saved index (attribution kept) ' + JSON.stringify(m));
    ok(saved.deckMeta.license === 'CC-BY-NC-4.0' && same(saved.deckMeta.creators, ['Test Author', 'Second Author']), 'first save, yes: and in deck-meta (what the player shows)');
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
    await page.check('#edit-role-creator').catch(async (e) => { await page.__diag('choosing 「はい」'); throw e; });
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
    // 2 度押し：開いている途中・開いた後にもう一度押しても、入力の途中の欄を作り直さない（遅い CI で押し直しが入力を消した）
    await page.evaluate(() => { const b = document.getElementById('b-info'); b.click(); b.click(); });
    await page.fill('#info-attribution', '二度押しの確かめ');
    const filled = await page.evaluate(() => (document.getElementById('info-attribution') || {}).value);
    await page.evaluate(() => document.getElementById('b-info').click());
    await page.waitForTimeout(scaled(1500));
    const kept = await page.evaluate((filled) => ({ filled, runs: window.__APP_TEST.infoRuns && window.__APP_TEST.infoRuns(), value: (document.getElementById('info-attribution') || {}).value, forms: document.querySelectorAll('#info-form').length, panelHidden: document.getElementById('panel').hidden, active: document.activeElement && document.activeElement.id }), filled);
    const keptOk = kept.value === '二度押しの確かめ' && kept.forms === 1;
    ok(keptOk, 'info: pressing File info… again keeps what is being typed' + (keptOk ? '' : ' ' + JSON.stringify(kept)));
    await page.click('#info-cancel');
    // その他：名前がない・SPDX でない
    await page.selectOption('#info-license', 'other');
    ok(await page.isVisible('#info-license-other'), 'info: Other shows the name field');
    await page.click('#info-save');
    ok(await page.isVisible('#info-error') && (await page.textContent('#info-error')) === 'ライセンスの名前を入力してください', 'info: Other without a name → error');
    await page.fill('#info-license-other', 'All rights reserved');
    await page.click('#info-save');
    // 知らせが出るのを待つ（macOS の CI で、すぐ読むと前の知らせのままのことが 1 度あった）。合わなければ、そのときの欄と知らせを出す
    const want = 'ライセンスは SPDX の名前（例：MIT、CC-BY-4.0）で入力してください';
    const got = await page.waitForFunction((w) => document.getElementById('info-error').textContent === w, want, { timeout: scaled(5000) }).then(() => true, () => false);
    ok(got, 'info: Other that is not an SPDX name → error' + (got ? '' : ' ' + JSON.stringify(await page.evaluate(() => ({
      error: document.getElementById('info-error') && document.getElementById('info-error').textContent, hidden: document.getElementById('info-error') && document.getElementById('info-error').hidden,
      license: document.getElementById('info-license') && document.getElementById('info-license').value, other: document.getElementById('info-license-other') && document.getElementById('info-license-other').value,
      forms: document.querySelectorAll('#info-form').length, toast: document.getElementById('toast').textContent, active: document.activeElement && document.activeElement.id })))));
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

  // ---------------------------------------------------------------- 5. ライセンスの部分だけ（作ったかを聞かないファイル）
  const readSaved = async (page) => readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
  const waitSaved = (page) => page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
  // 保存して、問いが出るか（出たら呼んだ側が答える）
  const startSave = async (page, sel = '#dlg[open] #edit-own') => {
    const sv = page.evaluate(() => window.__APP_TEST.save('save'));
    const shown = await Promise.race([sv.then(() => false), page.waitForSelector(sel, { timeout: scaled(15000) }).then(() => true, () => false)]);
    return { sv, shown };
  };
  const finish = async (page, sv) => {
    const which = await Promise.race([sv.then(() => 'saved'), page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(30000) }).then(() => 'tierB', () => 'saved')]);
    if (which === 'tierB') await clickDlg(page, '#dlg-rebuild');
    await sv;
    await waitSaved(page);
  };
  {
    // Studio 製（AI の返事から作ったのと同じ扱い）のライセンスのないファイル：1 段目の「いいえ、このまま保存」（handoff #112）
    const { ctx, page } = await openPage('lic-only-fresh', pBare1.html, { fresh: true });
    await page.evaluate(() => { window.__APP_TEST.licenseAsk = true; });
    const docId = await page.evaluate(() => window.__APP_TEST.state().portable.docId);
    ok(await editScript(page, '（直した 5）'), 'license only (Studio-made): the script is edited');
    const { sv, shown } = await startSave(page, '#dlg[open] #lic-never');
    ok(shown, 'license only (Studio-made): the first save asks');
    if (shown) {
      ok((await page.textContent('#dlg-title')) === '配布したこのファイルを、ほかの人が使ったり直したりしてもよいですか' && !(await page.$('#dlg[open] #edit-role-creator')) && !(await page.$('#dlg[open] input[type=radio]')), 'step 1: the plain question, no 「作ったものですか」 and no license names or choices');
      const btns = await page.$$eval('#dlg-buttons button', (xs) => xs.map((x) => x.textContent + (x.classList.contains('pri') ? '*' : '')));
      ok(same(btns, ['はい', 'いいえ、このまま保存*']), 'step 1: Yes and No, just save (primary) ' + JSON.stringify(btns));
      ok((await page.textContent('#lic-later')) === 'あとで「ファイルの情報…」で変えられます' && (await page.textContent('#dlg label.confirm')) === '今後は表示しない' && !(await page.isChecked('#lic-never')), 'step 1: can be changed later, and an unticked 「今後は表示しない」');
      ok(!/CC/.test(await page.textContent('#dlg')), 'step 1: no license name');
      await page.screenshot({ path: path.join(work, 'license-step1.png') });
      await clickDlg(page, '#dlg-no');
      await finish(page, sv);
      const saved = await readSaved(page);
      const st = await page.evaluate(() => window.__APP_TEST.state().portable);
      ok(saved.index.metadata.license === undefined && saved.deckMeta.license === undefined && st.lastTier === 'A', `step 1, No: the file has no license and is saved without rebuilding (tier ${st.lastTier})`);
      ok(await page.evaluate((k) => localStorage.getItem(k), 'egatari-license-asked:' + docId) === '1' && await page.evaluate(() => localStorage.getItem('egatari-license-ask-off')) === null, 'step 1, No: remembered for the docId only (not for the device)');
      ok(await editScript(page, '（直した 6）'), 'license only: edited again');
      const second = await startSave(page, '#dlg[open] #lic-never');
      ok(!second.shown, 'license only: the second save does not ask');
      if (second.shown) await clickDlg(page, '#dlg-cancel');
      await finish(page, second.sv);
    } else await sv;
    await ctx.close();
  }
  {
    // 権利の表示がない別のファイル（docId が別）：Esc は保存しない。はい → 2 段目（既定は条件なし＝CC BY 4.0）、戻る、名前を入れて保存
    const { ctx, page } = await openPage('lic-only-bare', pBare2.html);
    await page.evaluate(() => { window.__APP_TEST.licenseAsk = true; });
    ok(await editScript(page, '（直した 7）'), 'license only (no rights info): the script is edited');
    const c = await startSave(page, '#dlg[open] #lic-never');
    ok(c.shown, 'license only (another docId, no rights info): asked');
    if (c.shown) {
      await page.keyboard.press('Escape');
      await c.sv;
      ok(await page.evaluate(() => window.__APP_TEST.state().portable.dirty), 'step 1: Esc cancels the save (still unsaved)');
    } else await c.sv;
    const { sv, shown } = await startSave(page, '#dlg[open] #lic-never');
    ok(shown, 'license only: asked again after Esc');
    if (shown) {
      await clickDlg(page, '#dlg-yes');
      await page.waitForSelector('#dlg[open] #lic-name', { timeout: scaled(10000) });
      ok((await page.textContent('#dlg-title')) === '使ってよい範囲を選んでください' && (await page.textContent('#lic-lead')) === 'どちらを選んでも、作成者としてあなたの名前が表示されます', 'step 2: the title and the line under it');
      const terms = await page.$$eval('#lic-terms label', (xs) => xs.map((x) => x.querySelector('input').value + '=' + x.textContent + (x.querySelector('input').checked ? '*' : '')));
      ok(same(terms, ['CC-BY-4.0=修正も再配布もしてよい（CC BY 4.0）*', 'CC-BY-NC-4.0=修正も再配布もしてよい。ただし、営利目的では使わない（CC BY-NC 4.0）']), 'step 2: two choices in words (no CC BY-SA), license names after, CC BY chosen ' + JSON.stringify(terms));
      ok((await page.textContent('label[for=lic-name]')) === '表示する名前（学校名でもよい）' && (await page.textContent('#lic-later2')) === 'あとで「ファイルの情報…」で変えられます' && /creativecommons\.org/.test(await page.getAttribute('#lic-about', 'href')), 'step 2: the name field, can be changed later, About licenses');
      ok(await page.isDisabled('#dlg-save'), 'step 2: Save waits for a name');
      await page.screenshot({ path: path.join(work, 'license-step2.png') });
      await clickDlg(page, '#dlg-back');
      await page.waitForSelector('#dlg[open] #lic-never', { timeout: scaled(10000) });
      ok((await page.textContent('#dlg-title')) === '配布したこのファイルを、ほかの人が使ったり直したりしてもよいですか', 'step 2, Back: step 1 again');
      await clickDlg(page, '#dlg-yes');
      await page.waitForSelector('#dlg[open] #lic-name', { timeout: scaled(10000) });
      await page.check('#lic-CC-BY-NC-4\\.0');
      await page.fill('#lic-name', '山田 花子');
      ok(!(await page.isDisabled('#dlg-save')), 'step 2: Save is enabled once a name is typed');
      await clickDlg(page, '#dlg-save');
      await finish(page, sv);
      const m = (await readSaved(page)).index.metadata;
      const y = new Date().getFullYear();
      ok(m.license === 'CC-BY-NC-4.0' && same(m.creators, ['山田 花子']) && m.copyright === `© ${y} 山田 花子`, 'step 2: the license, the creator and 「© 年 名前」 are written ' + JSON.stringify(m));
    } else await sv;
    await ctx.close();
  }
  {
    // 「今後は表示しない」：この端末では、どのファイルでも聞かない。使い方の板の「また表示する」で戻る
    const { ctx, page } = await openPage('lic-never', pBare3.html);
    await page.evaluate(() => { window.__APP_TEST.licenseAsk = true; });
    ok(await editScript(page, '（直した 9）'), 'never again: the script is edited');
    const { sv, shown } = await startSave(page, '#dlg[open] #lic-never');
    if (shown) {
      await page.check('#lic-never');
      await clickDlg(page, '#dlg-no');
      await finish(page, sv);
      ok(await page.evaluate(() => localStorage.getItem('egatari-license-ask-off')) === '1', 'never again: kept for this device');
      await page.click('#b-help');
      await page.waitForSelector('#license-ask-help', { timeout: scaled(10000) });
      ok(/表示しない設定/.test(await page.textContent('#license-ask-info')), 'never again: the help panel says so');
      await page.click('#b-license-ask-on');
      ok(await page.evaluate(() => localStorage.getItem('egatari-license-ask-off')) === null && /また表示します/.test(await page.textContent('#license-ask-info')), 'Show it again: turned back on');
    } else { ok(false, 'never again: asked'); await sv; }
    await ctx.close();
  }
  {
    // ライセンスのあるファイル：ライセンスは聞かない（ライセンスは権利の表示なので、今までどおり「作ったか」の問いだけが出る。はいでもライセンスの欄はない）
    const { ctx, page } = await openPage('lic-only-licensed', pLicOnly.html);
    await page.evaluate(() => { window.__APP_TEST.licenseAsk = true; });
    ok(await editScript(page, '（直した 8）'), 'licensed (no other rights info): the script is edited');
    const sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForSelector('#dlg[open] #edit-role-creator', { timeout: scaled(15000) });
    ok((await page.textContent('#dlg-title')) === 'このファイルは、あなたが作ったものですか。', 'licensed file: the existing question, not the license-only one');
    await page.check('#edit-role-creator');
    ok(!(await page.$('#dlg[open] #edit-own')) && !(await page.isDisabled('#dlg-save')), 'licensed file: no license question');
    await clickDlg(page, '#dlg-save');
    await finish(page, sv);
    ok((await readSaved(page)).index.metadata.license === 'CC-BY-4.0', 'licensed file: the license stays');
    await ctx.close();
  }
  {
    // 作業フォルダ：保存しても聞かない
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`folder-lic: ${e.message}`));
    await page.goto(`${HOST}?lang=ja`);
    await page.waitForFunction(() => !!window.__APP_TEST);
    const BDIR = path.join(work, 'src-bare-folder');
    prepare(BDIR, { metadata: {} });
    const ff = {};
    for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(BDIR, f)).toString('base64');
    await page.evaluate(async (files) => {
      window.__APP_TEST.licenseAsk = true;
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('baredeck', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('baredeck', { create: true });
      for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
      window.__APP_TEST.open(d);
    }, ff);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.kind === 'folder' && !s.building; }, null, { timeout: scaled(30000) });
    // 作業フォルダは保存の命令でファイルを書かない（変更はすぐ書かれる）。Egatari ファイルの保存の問いは出ない
    await page.evaluate(() => window.__APP_TEST.save('save'));
    ok(!(await page.waitForSelector('#dlg[open] #lic-never', { timeout: scaled(3000) }).then(() => true, () => false)), 'working folder: not asked');
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
