// 古いプレーヤーのファイルに編集の記録を足すときの知らせ（format spec §3.6.1・§7.3。app/main.js の editsNotShown と savePortableBound、
// kit/core/player.mjs の EDITS_SHOWN_SINCE・playerShowsEdits）
//   node tools/test-app-old-player.mjs [作業用のフォルダ]
// 1. playerShowsEdits：Egatari Player の 1.9.0 以上（"+dev…" は見ない）だけが表示する。ほかのプレーヤー・player がない・読めない版は「表示しない」
// 2. 編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る）。作成者とライセンスのある教材（examples/minimal を写して詰めたもの）の
//    索引と deck-meta の player.version を書き換えた写し（1.8.0・1.9.0）を開き、台本を直して「ほかの人の教材を編集しています」と答えて保存する：
//    a. 1.8.0 → 「編集の記録が表示されません」の知らせ。キャンセル → 保存しない。もう一度保存すると、また知らせる
//    d. 1.8.0 で「保存」→ 段 A のまま。プレーヤーは 1.8.0 のままで、編集の記録は索引と deck-meta に入る。開いている間は、もう知らせない
//    c. 1.8.0 で「プレーヤーを新しくして保存」（英語の画面）→ 段 B の確かめ（「スライドを再ビルドして保存します」）→ 保存したファイルは
//       今のプレーヤー（1.9.0 以上）で、編集の記録と台本の直しが入る
//    b. 1.9.0 → 知らせない（段 A）
// 1.8.0 のファイル：この Studio で詰めたファイルの player.version だけを書き換えたもの（読む側は版を問わない。中身の再生器は今のもの）。
// 編集アプリは索引の player だけを見て知らせるので、知らせと保存の試験にはこれで足りる（古い再生器が表示しないことは試さない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scanDocument, replaceIndexText, readPortable } from '../kit/core/portable.mjs';
import { PLAYER, EDITS_SHOWN_SINCE, compareVersions, playerShowsEdits } from '../kit/core/player.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-old-player-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dec = new TextDecoder();

// ---------------------------------------------------------------- 1. playerShowsEdits
{
  const eg = (version) => ({ name: PLAYER.name, version });
  ok(EDITS_SHOWN_SINCE === '1.9.0', 'EDITS_SHOWN_SINCE is 1.9.0');
  ok(playerShowsEdits(eg('1.9.0')) && playerShowsEdits(eg('1.9.0+dev.abc1234')) && playerShowsEdits(eg('1.10.0')) && playerShowsEdits(eg('2.0.0')), 'Egatari Player 1.9.0 and later (also +dev builds) show edits');
  ok(![eg('1.8.0'), eg('1.8.9+dev'), eg('0.9.0'), eg('1.9'), eg(''), eg(undefined), { name: 'other-player', version: '3.0.0' }, null, undefined].some(playerShowsEdits), 'earlier versions, another player, no player and unreadable versions: not shown');
  ok(compareVersions('1.10.0', '1.9.0') === 1 && compareVersions('1.9.0+dev', '1.9.0') === 0 && compareVersions('x', '1.9.0') === null, 'compareVersions: numeric parts, build metadata ignored, unreadable → null');
}

// ---------------------------------------------------------------- 2. 書き換えた写し
const META = { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] };
const packDir = path.join(work, 'src');
fs.rmSync(packDir, { recursive: true, force: true });
fs.mkdirSync(packDir, { recursive: true });
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(packDir, f));
fs.writeFileSync(path.join(packDir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata: META }, null, 2) + '\n');
const packedPath = path.join(work, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', packDir, '-o', packedPath], { stdio: 'pipe' });
const mine = fs.readFileSync(packedPath, 'utf8');
const mineRead = await readPortable(mine);
const CUR = mineRead.index.player;
async function withPlayerVersion(html, version) {
  const scan = scanDocument(html);
  const dm = scan.byId.get('deck-meta');
  const meta = JSON.parse(dm.text);
  meta.player = { ...meta.player, version };
  const t = JSON.stringify(meta).replace(/</g, '\\u003c');
  const h = html.slice(0, dm.start) + `<script type="application/json" id="deck-meta">${t}</script>` + html.slice(dm.end);
  const ix = JSON.parse(scanDocument(h).byId.get(FORMAT.INDEX_ID).text);
  return replaceIndexText(h, JSON.stringify({ ...ix, player: { ...ix.player, version } }));
}
const FILES = { old: await withPlayerVersion(mine, '1.8.0'), cur: await withPlayerVersion(mine, '1.9.0') };
for (const [k, v] of [['old', '1.8.0'], ['cur', '1.9.0']]) {
  const r = await readPortable(FILES[k]);
  ok(r.index.player.version === v && r.deckMeta.player.version === v && r.preDraft === false && r.sourceMatches, `fixture ${k}: index and deck-meta carry Egatari Player ${v}, a 1.0 file that reads`);
}
const seg = parseNarration(dec.decode(mineRead.files['narration.md']))[0];
const NKEY = `${seg.slideKey}:${seg.stepKey}`;

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
const savedOf = async (page) => readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
const state = (page) => page.evaluate(() => window.__APP_TEST.state().portable);
// 窓が出た数を数える（同じ窓の開け閉めを見落とさない）
const countNotice = (page) => page.evaluate(() => { window.__op = 0; new MutationObserver(() => { if (document.querySelector('#dlg[open] #old-player') && !window.__opOpen) { window.__op++; window.__opOpen = true; } if (!document.querySelector('#dlg[open] #old-player')) window.__opOpen = false; }).observe(document.body, { subtree: true, childList: true, attributes: true }); });

async function openPage(label, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(`${HOST}?lang=${lang}`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  await page.evaluate(async (n) => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle(n, { create: true }); }, `${label}.ega.html`);
  await countNotice(page);
  return { ctx, page };
}
async function openAndEditScript(page, label, key, suffix) {
  const b64 = Buffer.from(FILES[key]).toString('base64');
  ok(await page.evaluate((data) => { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson.ega.html' }); }, b64) === true, `${label}: opens`);
  await page.waitForFunction(() => !window.__APP_TEST.state().building, null, { timeout: scaled(30000) });
  const g = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), NKEY);
  const post = page.evaluate(([k, rev, turns]) => { const i = k.lastIndexOf(':'); return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, i), stepKey: k.slice(i + 1), rev, turns }); },
    [NKEY, g.rev, g.turns.map((t) => ({ role: t.role, text: t.text + suffix }))]);
  if (await Promise.race([post.then(() => false), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(8000) }).then(() => true, () => false)])) await clickDlg(page, '#dlg-ok');
  const pr = await post;
  ok(pr && pr._status === 200, `${label}: the script is edited`);
}
// 保存して「ほかの人の教材を編集しています」と答える。→ 保存の約束（終わるのを待つ）と、知らせが出たか
async function saveAsOther(page, label, by) {
  const saving = page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForSelector('#dlg[open] #edit-role-other', { timeout: scaled(15000) });
  await page.check('#edit-role-other');
  await page.fill('#edit-by', by);
  await clickDlg(page, '#dlg-save');
  const notice = await Promise.race([saving.then(() => false), page.waitForSelector('#dlg[open] #old-player', { timeout: scaled(30000) }).then(() => true, () => false)]);
  return { saving, notice };
}
const waitClean = (page) => page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(90000) });

try {
  // a・d. 1.8.0：知らせる。キャンセル → 保存しない。もう一度 → また知らせる。「保存」→ 段 A、1.8.0 のまま、記録は入る
  {
    const { ctx, page } = await openPage('old-keep', 'ja');
    await openAndEditScript(page, 'old 1.8.0', 'old', '（直した）');
    const s = await saveAsOther(page, 'old 1.8.0', '△△中学校');
    ok(s.notice, 'a. 1.8.0 + edits as another person: the notice is shown');
    if (s.notice) {
      ok((await page.textContent('#dlg-title')) === '編集の記録が表示されません', 'a. title ' + JSON.stringify(await page.textContent('#dlg-title')));
      ok((await page.textContent('#old-player')) === 'この Egatari ファイルのプレーヤーは古いため、編集の記録はファイルに入りますが、再生するときに表示されません。', 'a. the body is the requested sentence');
      ok((await page.textContent('#old-player-which')) === 'このファイルのプレーヤー：Egatari Player 1.8.0', 'a. names the player of the file ' + JSON.stringify(await page.textContent('#old-player-which')));
      ok((await page.textContent('#dlg-update-player')) === 'プレーヤーを新しくして保存' && (await page.textContent('#dlg-save')) === '保存' && (await page.textContent('#dlg-cancel')) === 'キャンセル', 'a. buttons キャンセル / 保存 / プレーヤーを新しくして保存');
      await page.screenshot({ path: path.join(work, 'old-player.png') });
      await clickDlg(page, '#dlg-cancel');
    }
    await s.saving;
    ok((await state(page)).dirty && (await page.evaluate(() => window.__APP_TEST.saved())) === null, 'a. Cancel → nothing saved, still unsaved');
    // もう一度保存：作成者かは聞かない（覚えている）が、知らせはもう一度
    const again = page.evaluate(() => window.__APP_TEST.save('save'));
    const shown = await Promise.race([again.then(() => false), page.waitForSelector('#dlg[open] #old-player', { timeout: scaled(30000) }).then(() => true, () => false)]);
    ok(shown && await page.evaluate(() => window.__op) === 2, 'a. after Cancel, the next save shows the notice again');
    if (shown) await clickDlg(page, '#dlg-save');
    await again;
    await waitClean(page);
    const st = await state(page);
    const saved = await savedOf(page);
    ok(st.lastTier === 'A', 'd. Save → saved without rebuilding (tier A)');
    ok(saved.index.player.version === '1.8.0' && saved.deckMeta.player.version === '1.8.0', 'd. the player stays 1.8.0 in the index and deck-meta');
    ok(same(saved.index.metadata.edits, [{ by: '△△中学校' }]) && same(saved.deckMeta.edits, saved.index.metadata.edits), 'd. the edit is recorded in metadata.edits and deck-meta.edits ' + JSON.stringify(saved.index.metadata.edits));
    ok(dec.decode(saved.files['narration.md']).includes('（直した）'), 'd. the script edit is saved');
    // 開いている間は、もう知らせない（次の保存は記録が変わらないので、そもそも当たらない）
    const g = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), NKEY);
    await page.evaluate(([k, rev, turns]) => { const i = k.lastIndexOf(':'); return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, i), stepKey: k.slice(i + 1), rev, turns }); }, [NKEY, g.rev, g.turns.map((t) => ({ role: t.role, text: t.text + '2' }))]);
    await page.evaluate(() => window.__APP_TEST.save('save'));
    await waitClean(page);
    ok(await page.evaluate(() => window.__op) === 2 && (await state(page)).lastTier === 'A', 'd. the next save of the same document: no notice');
    await ctx.close();
  }

  // c. 1.8.0、英語の画面：「プレーヤーを新しくして保存」→ 段 B の確かめ → 今のプレーヤーで保存
  {
    const { ctx, page } = await openPage('old-update', 'en');
    await openAndEditScript(page, 'en old 1.8.0', 'old', ' (edited)');
    const s = await saveAsOther(page, 'en old 1.8.0', 'School B');
    ok(s.notice, 'c. en: the notice is shown');
    if (s.notice) {
      ok((await page.textContent('#dlg-title')) === 'The edit record will not be shown'
        && (await page.textContent('#old-player')) === 'The player of this Egatari file is old: the edit record is saved in the file, but it is not shown when the file is played.'
        && (await page.textContent('#old-player-which')) === 'Player of this file: Egatari Player 1.8.0'
        && (await page.textContent('#dlg-update-player')) === 'Update the player and save' && (await page.textContent('#dlg-save')) === 'Save', 'c. en: title, body, player and buttons');
      await clickDlg(page, '#dlg-update-player');
      await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(30000) });
      ok((await page.textContent('#dlg-title')) === 'The slides will be rebuilt and saved' && (await page.textContent('#tier-b-warn')).startsWith('The slides are rebuilt with the current version')
        && (await page.textContent('#tier-b-why')) === 'To update the player, the slides are rebuilt and saved.', 'c. the existing rebuild confirmation follows, with the reason ' + JSON.stringify(await page.textContent('#tier-b-why')));
      await page.screenshot({ path: path.join(work, 'old-player-rebuild.png') });
      await clickDlg(page, '#dlg-rebuild');
    }
    await s.saving;
    await waitClean(page);
    const st = await state(page);
    const saved = await savedOf(page);
    ok(st.lastTier === 'B', 'c. rebuilt and saved (tier B)');
    ok(saved.index.player.name === PLAYER.name && compareVersions(saved.index.player.version, EDITS_SHOWN_SINCE) >= 0 && saved.index.player.version === CUR.version && saved.deckMeta.player.version === CUR.version,
      `c. the saved file carries the current player ${saved.index.player.version} (index and deck-meta)`);
    ok(same(saved.index.metadata.edits, [{ by: 'School B' }]) && same(saved.deckMeta.edits, saved.index.metadata.edits), 'c. the edit is recorded ' + JSON.stringify(saved.index.metadata.edits));
    ok(dec.decode(saved.files['narration.md']).includes(' (edited)') && ['license', 'copyright', 'creators'].every((k) => same(saved.index.metadata[k], META[k])), 'c. the script edit and the rights are kept');
    await ctx.close();
  }

  // b. 1.9.0：知らせない
  {
    const { ctx, page } = await openPage('cur', 'ja');
    await openAndEditScript(page, 'cur 1.9.0', 'cur', '（直した）');
    const s = await saveAsOther(page, 'cur 1.9.0', '△△中学校');
    ok(!s.notice, 'b. 1.9.0: no notice');
    await s.saving;
    await waitClean(page);
    const saved = await savedOf(page);
    ok((await state(page)).lastTier === 'A' && saved.index.player.version === '1.9.0' && same(saved.index.metadata.edits, [{ by: '△△中学校' }]), 'b. 1.9.0: saved without rebuilding, with the edit');
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
