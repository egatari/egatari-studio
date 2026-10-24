// 設定のファイル（egatari.json）のほかの作り手の項目を、Studio のどの書き込みもバイトのまま残すこと（format spec §3.3：作り手は自分の状態を
// 自分の名前の項目 1 つに置いてよく、ほかの作り手と編集器はその項目を変えずに残し、意味を与えない。kit/core/config-file.mjs の updateConfig）
//   node tools/test-config-preserve.mjs [作業用のフォルダ]
// 1. updateConfig：変える項目の値だけを差し替える（ほかの項目はバイトのまま。大きな整数・1e400・"10" という名前の項目も）。読めないものは断る
// 2. コマンド：1 ファイルに書き出す（作業フォルダに docId を足す・1 ファイルの写しに components・themes・attachments を書く）、
//    新しい教材として書き出す（identity）、展開（unpack）と組み直し、段 A の保存（kit/core/tier-a.mjs）、授業の結果を添付する（portable attach）、
//    テーマの版の固定を今の版にする（--update-themes）
// 3. 編集アプリ：作業フォルダ（OPFS）の 1 ファイルの書き出し・添付の板・授業の部屋の板の保存、1 ファイルを開く・添付を足して保存（段 A）・
//    新しい教材として保存・「テーマを更新」
// どれも、egatari.json の {"otherTool": {...}} と知らない最上位の項目が、元の文字列のまま（バイトのまま）残ること
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable, nodeEnv, updateThemePins } from '../kit/build.mjs';
import { exportPortable, readPortable } from '../kit/core/portable.mjs';
import { build as coreBuild } from '../kit/core/build-core.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { updateConfig, merge, configObject } from '../kit/core/config-file.mjs';
import { unpack, attachLiveResults } from './portable.mjs';
import { clickMenuOpen, clickMenuItem, clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-config-preserve-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;
const dec = new TextDecoder();

// ほかの作り手の項目（1 行に詰めた書き方・大きな整数・1.50・1e400 は JSON.parse → JSON.stringify では変わる）と、知らない最上位の項目
const OTHER = '"otherTool": {"x": 1, "big": 12345678901234567890, "f": 1.50, "e": 1e400, "s": "\\u00e9"}';
const UNKNOWN = '"zzUnknown": [ 1,2 ,{"k" : null} ]';
const NUMKEY = '"10": "numeric name"';
const DOC = '3f2c9a8e-1b2d-4c5e-9f00-112233445566';
const confText = ({ docId = true, themes = null, extra = '' } = {}) => '{\n'
  + (docId ? `  "docId": "${DOC}",\n` : '')
  + `  ${OTHER},\n`
  + '  "metadata": {"license": "CC-BY-4.0", "copyright": "© 2026 Test Author", "creators": ["Test Author"]},\n'
  + (themes ? `  "themes": ${JSON.stringify(themes)},\n` : '')
  + extra
  + `  ${NUMKEY},\n`
  + `  ${UNKNOWN}\n}\n`;
// 残っていること：元の文字列のまま、"10" はほかの作り手の項目の後ろのまま
const kept = (text) => typeof text === 'string' && text.includes(OTHER) && text.includes(UNKNOWN) && text.includes(NUMKEY) && text.indexOf(OTHER) < text.indexOf(NUMKEY);
const show = (text) => (typeof text === 'string' ? text.slice(0, 600) : String(text));

// 作業フォルダ：examples/minimal と、添付 1 つ（題と役割は egatari.json に書かない：書き出しの写しの attachments を書き換えさせる）
function deck(name, opts = {}) {
  const d = path.join(work, name);
  fs.mkdirSync(path.join(d, 'attachments'), { recursive: true });
  for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples/minimal', f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'attachments', 'notes.txt'), 'notes\n');
  fs.writeFileSync(path.join(d, CFG), confText(opts));
  return path.join(d, 'deck.html');
}
const cfgOf = (deckFile) => fs.readFileSync(path.join(path.dirname(deckFile), CFG), 'utf8');

// ---------------------------------------------------------------- 1. updateConfig
{
  const t = confText();
  ok(updateConfig(t, { docId: DOC }) === t, 'updateConfig: the same value leaves the file byte for byte');
  const a = updateConfig(t, { components: { bars: '1.0.0' }, metadata: merge({ derivedFrom: { docId: DOC, sourceSha256: 'a'.repeat(64) } }), [KEY]: [{ path: 'attachments/x.txt', role: 'supplement', title: 'X' }] });
  const ap = configObject(a);
  ok(kept(a) && ap.components.bars === '1.0.0' && ap.metadata.derivedFrom.docId === DOC && ap.metadata.license === 'CC-BY-4.0' && ap[KEY].length === 1, 'updateConfig: adds and merges Studio members; the other members stay byte for byte\n' + show(a));
  const b = updateConfig(a, { components: undefined, [KEY]: undefined, metadata: merge({ derivedFrom: undefined }) });
  ok(kept(b) && !('components' in configObject(b)) && !(KEY in configObject(b)) && !('derivedFrom' in configObject(b).metadata), 'updateConfig: removes Studio members; the other members stay byte for byte');
  ok(updateConfig('{"a":1,"b":2,"c":3}', { b: undefined, c: undefined, d: 4 }) === '{"a":1, "d": 4}' && updateConfig('{"a":1,"b":2}', { a: undefined }) === '{"b":2}' && updateConfig('{ }', { a: 1 }) === '{\n  "a": 1\n}', 'updateConfig: removing and adding keep the commas right (one-line and empty objects)');
  ok(updateConfig(null, { docId: DOC }) === `{\n  "docId": "${DOC}"\n}\n`, 'updateConfig: no file → a new one');
  let e1 = null, e2 = null;
  try { updateConfig('{"a": 1,}', { b: 1 }); } catch (e) { e1 = e; }
  try { updateConfig('[1]', { b: 1 }); } catch (e) { e2 = e; }
  ok(e1 && e1.code === 'bad-config' && e2 && e2.code === 'bad-config', 'updateConfig: a file that is not a JSON object is refused (never overwritten)');
  const nested = updateConfig('{"extensions": {"otherExt": {"v": 1, "n": 1.50}}}', { extensions: merge({ live: { v: 1, room: 'r-x' } }) });
  ok(nested.includes('"otherExt": {"v": 1, "n": 1.50}') && configObject(nested).extensions.live.room === 'r-x', 'updateConfig: merge into extensions keeps other extensions byte for byte');
}

// ---------------------------------------------------------------- 2. コマンド
// 書き出し：作業フォルダに docId を足す（ない教材）、1 ファイルの写しは components・themes・attachments を持つ
const d1 = deck('folder', { docId: false });
const p1 = await buildPortable(d1, {});
const f1 = cfgOf(d1);
ok(kept(f1) && configObject(f1).docId === p1.index.docId, `export (folder): the docId added to the working folder's ${CFG} keeps the other members byte for byte\n` + show(f1));
const a1 = dec.decode(p1.files[CFG]);
const a1p = configObject(a1);
ok(kept(a1) && a1p.components && a1p.themes && a1p.themes.default && Array.isArray(a1p[KEY]) === false, `export (archive copy): ${CFG} with components and themes keeps the other members byte for byte\n` + show(a1));
// 添付の題と役割を書いた教材：写しの attachments は index.attachments
const d1b = deck('folder-attach', { extra: `  "${KEY}": [{"path": "attachments/notes.txt", "role": "supplement", "title": "Notes"}, {"path": "attachments/gone.txt", "role": "supplement", "title": "Gone"}],\n` });
const p1b = await buildPortable(d1b, {});
const a1b = dec.decode(p1b.files[CFG]);
ok(kept(a1b) && configObject(a1b)[KEY].length === 1 && kept(cfgOf(d1b)) && configObject(cfgOf(d1b))[KEY].length === 2, `export (archive copy): attachments rewritten to index.attachments keep the other members; the working folder is unchanged`);
// 新しい教材として書き出す（identity）
const NEWID = '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const p2 = await exportPortable(nodeEnv, deck('identity'), { identity: { docId: NEWID, derivedFrom: { docId: DOC, sourceSha256: p1.index.sourceSha256 } } });
ok(kept(p2.writes[CFG]) && configObject(p2.writes[CFG]).docId === NEWID && configObject(p2.writes[CFG]).metadata.derivedFrom.docId === DOC, 'save as a new lesson (identity): docId and derivedFrom change; the other members stay byte for byte\n' + show(p2.writes[CFG]));
// 展開（unpack）と組み直し：1 ファイルの写しのまま（byte for byte）、組み直しても同じ sourceSha256
const file1 = path.join(work, 'one' + FORMAT.FILE_EXT);
fs.writeFileSync(file1, p1.html);
const U = path.join(work, 'unpacked');
await unpack(file1, U);
const u1 = fs.readFileSync(path.join(U, CFG), 'utf8');
ok(u1 === a1, `unpack: ${CFG} is the single file's copy byte for byte`);
const p3 = await buildPortable(path.join(U, 'deck.html'), {});
ok(p3.index.sourceSha256 === p1.index.sourceSha256 && dec.decode(p3.files[CFG]) === a1 && fs.readFileSync(path.join(U, CFG), 'utf8') === a1, 'portable round trip: pack(unpack(x)) keeps the source hash and egatari.json byte for byte');
// 前の 1 ファイル（egatari.json に themes がない。v0.4.6 までの Studio）の展開：固定を足しても、ほかの項目はバイトのまま
{
  const noPins = (env, src, o) => { const x = coreBuild(env, src, o); x.stats.themeVersions = {}; return x; };
  const old = await exportPortable(nodeEnv, deck('old-nopins'), { fromFolder: true, build: noPins });
  ok(!('themes' in configObject(dec.decode(old.files[CFG]))), 'fixture: a single file whose egatari.json has no themes pin');
  const f = path.join(work, 'old-nopins' + FORMAT.FILE_EXT);
  fs.writeFileSync(f, old.html);
  const U2 = path.join(work, 'unpacked-old');
  await unpack(f, U2);
  const u2 = fs.readFileSync(path.join(U2, CFG), 'utf8');
  ok(kept(u2) && configObject(u2).themes && configObject(u2).themes.default, `unpack (no themes pin in the file): the pin added to ${CFG} keeps the other members byte for byte\n` + show(u2));
}
// 段 A の保存（1 ファイル）：添付の一覧を変える（ファイルのない項目は落とす）→ egatari.json の attachments だけが書き直される
{
  const r = await readPortable(p1.html);
  const files = new Map(Object.entries(r.files));
  files.set(CFG, new TextEncoder().encode(updateConfig(dec.decode(files.get(CFG)), { [KEY]: [{ path: 'attachments/notes.txt', role: 'supplement', title: 'Notes (renamed)' }, { path: 'attachments/notes.txt.bak' }] })));
  const a = await tierA(p1.html, files, {});
  ok(a.ok && kept(a.config) && configObject(a.config)[KEY].length === 1 && configObject(a.config)[KEY][0].title === 'Notes (renamed)', `tier A save (single file): the saved ${CFG} keeps the other members byte for byte ` + (a.ok ? '' : `[${a.code}] ${a.reason}`));
  if (a.ok) { const s = await readPortable(a.html); ok(kept(dec.decode(s.files[CFG])), `tier A save (single file): the ${CFG} inside the saved file keeps them too`); }
}
// 授業の結果を添付する（npm run portable -- attach）
{
  const d = deck('attach-results');
  const resFile = path.join(ROOT, ...FORMAT.LIVE_VENDOR_DIR.split('/'), 'fixtures', 'http', 'results.json');
  let done = false;
  try { await attachLiveResults(path.dirname(d), resFile, { lang: 'en' }); done = true; } catch (e) { console.log('    ' + e.message); }
  ok(done && kept(cfgOf(d)) && configObject(cfgOf(d))[KEY].some((e) => e.role === 'data'), `attach live results: the attachment record added to ${CFG} keeps the other members byte for byte `);
}
// テーマの版の固定を今の版にする（--update-themes、kit/build.mjs の updateThemePins）
{
  const d = deck('update-themes', { themes: { default: '1.0.0' } });
  const up = updateThemePins(d);
  const t = cfgOf(d);
  ok(up.length === 1 && kept(t) && configObject(t).themes.default !== '1.0.0', 'theme pin update (--update-themes): only themes changes; the other members stay byte for byte\n' + show(t));
  const o = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), deck('update-themes-cli', { themes: { default: '1.0.0' } }), '--update-themes'], { encoding: 'utf8' });
  ok(o.status === 0 && kept(fs.readFileSync(path.join(work, 'update-themes-cli', CFG), 'utf8')), 'theme pin update (CLI --update-themes): the other members stay byte for byte');
}
// 読めない egatari.json は上書きしない（断る）
{
  const d = deck('broken', { themes: { default: '1.0.0' } });
  fs.writeFileSync(path.join(path.dirname(d), CFG), '{"otherTool": {"x": 1}, "themes": {"default": "1.0.0"},}\n');
  let err = null;
  try { updateThemePins(d); } catch (e) { err = e; }
  ok(err && fs.readFileSync(path.join(path.dirname(d), CFG), 'utf8').includes('"otherTool": {"x": 1}'), `a ${CFG} that is not JSON is refused, not overwritten`);
}

// ---------------------------------------------------------------- 3. 編集アプリ
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '?lang=ja');
  await page.waitForSelector('#drop');
  const menuClick = async (id) => { await clickMenuOpen(page, '#b-exportmenu'); await page.waitForSelector(`#${await page.getAttribute('#b-exportmenu', 'aria-controls')}:not([hidden])`); await clickMenuItem(page, id); };
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await page.waitForTimeout(100); } };
  const okAll = async () => { for (let i = 0; i < 6 && await page.$('#dlg[open]'); i++) { await clickDlg(page, '#dlg-ok'); await page.waitForTimeout(300); } };
  const idle = () => page.waitForFunction(() => !document.querySelector('#dlg[open]') && !window.__APP_TEST.attachBusy(), null, { timeout: 30000 });
  const wsCfg = async () => { const f = await page.evaluate(() => window.__APP_TEST.files()); return f && f[CFG] ? Buffer.from(f[CFG], 'base64').toString('utf8') : null; };

  // 作業フォルダ（OPFS）：docId のない egatari.json
  const SRC = path.dirname(deck('app-folder', { docId: false }));
  const ff = {};
  for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(SRC, f)).toString('base64');
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('cfgdeck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('cfgdeck', { create: true });
    for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
    window.__fd = d;
  }, ff);
  const fread = (rel) => page.evaluate(async (rel) => { try { return await (await (await window.__fd.getFileHandle(rel)).getFile()).text(); } catch { return null; } }, CFG);
  await page.evaluate(() => window.__APP_TEST_OPEN(window.__fd));
  await page.waitForFunction(() => window.__APP_TEST.state().kind === 'folder' && window.__APP_TEST.state().loads > 0, null, { timeout: 60000 });
  // 1 ファイルを書き出す（作業フォルダに docId を残す）
  await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__fd.getFileHandle('out.ega.html', { create: true }); });
  await menuClick('#b-export-portable');
  await okAll();
  const fx1 = await until(async () => { const t = await fread(); return t && configObject(t).docId ? t : null; }, 60000);
  ok(kept(fx1), `editor (folder): exporting the single file writes the docId into ${CFG}; the other members stay byte for byte\n` + show(fx1));
  // 添付の板：足す
  await page.click('#b-attach');
  await page.waitForSelector('#attach-list');
  await page.setInputFiles('#attach-file', { name: 'extra.txt', mimeType: 'text/plain', buffer: Buffer.from('extra\n') });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  await okAll();
  await idle();
  const fx2 = await until(async () => { const t = await fread(); return t && (configObject(t)[KEY] || []).some((e) => e.path === 'attachments/extra.txt') ? t : null; });
  ok(kept(fx2), `editor (folder): the attachments panel writes ${CFG}; the other members stay byte for byte\n` + show(fx2));
  // 授業の部屋の板：保存
  await menuClick('#b-export-live');
  await page.waitForSelector('#live-panel');
  await page.click('#live-save');
  const fx3 = await until(async () => { const t = await fread(); return t && configObject(t).extensions && configObject(t).extensions.live ? t : null; });
  ok(kept(fx3) && fx3.includes(fx2.match(/"attachments": \[[\s\S]*?\n {2}\]/)[0]), `editor (folder): the live panel saves extensions.live into ${CFG}; the other members stay byte for byte\n` + show(fx3));
  await page.keyboard.press('Escape');

  // 1 ファイル（OPFS のハンドル）：前の版のテーマを記録したもの（「テーマを更新」の知らせが出る）
  const pf = await exportPortable(nodeEnv, deck('app-single', { themes: { default: '1.0.0' } }), { fromFolder: true });
  ok(kept(dec.decode(pf.files[CFG])), 'fixture: the single file\'s egatari.json has the other members');
  await page.evaluate(async (b64) => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('cfg.ega.html', { create: true });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = await h.createWritable(); await w.write(u); await w.close();
    window.__ph = h; window.__APP_TEST.saveHandle = h;
  }, Buffer.from(pf.html).toString('base64'));
  const l0 = await page.evaluate(() => window.__APP_TEST.state().loads);
  await page.evaluate(() => window.__APP_TEST.openFile({ handle: window.__ph }));
  await page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.kind === 'memory' && s.loads > n && s.frameLoaded === s.loads; }, l0, { timeout: 60000 });
  await okAll();
  ok(kept(await wsCfg()), `editor (single file): opening keeps ${CFG} byte for byte in the other members`);
  // 添付を足して保存（段 A）
  await page.click('#b-attach');
  await page.waitForSelector('#attach-list');
  await page.setInputFiles('#attach-file', { name: 'more.txt', mimeType: 'text/plain', buffer: Buffer.from('more\n') });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  await okAll();
  await idle();
  const ws1 = await until(async () => { const t = await wsCfg(); return t && (configObject(t)[KEY] || []).some((e) => e.path === 'attachments/more.txt') ? t : null; });
  ok(kept(ws1), `editor (single file): the attachments panel writes ${CFG}; the other members stay byte for byte`);
  await page.evaluate(() => window.__APP_TEST.save('save'));
  await okAll();
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
  const saved = await readPortable(await page.evaluate(() => window.__APP_TEST.saved()));
  ok(kept(dec.decode(saved.files[CFG])) && saved.index[KEY].some((e) => e.path === 'attachments/more.txt'), `editor (single file): Save keeps the other members of ${CFG} byte for byte (tier ${await page.evaluate(() => window.__APP_TEST.state().portable.lastTier)})`);
  // 新しい教材として保存
  await page.evaluate(async () => { window.__APP_TEST.saveHandle = await (await navigator.storage.getDirectory()).getFileHandle('cfg-new.ega.html', { create: true }); });
  await page.evaluate(() => window.__APP_TEST.save('new'));
  await okAll();
  const savedNew = await until(async () => { const h = await page.evaluate(() => window.__APP_TEST.saved()); if (!h) return null; const r = await readPortable(h); return r.index.docId !== saved.index.docId ? r : null; }, 60000);
  ok(savedNew && kept(dec.decode(savedNew.files[CFG])) && kept(await wsCfg()) && configObject(await wsCfg()).docId === savedNew.index.docId, `editor (single file): Save as new lesson changes docId and derivedFrom; the other members of ${CFG} stay byte for byte`);
  // テーマを更新
  await page.waitForSelector('#b-theme-update', { timeout: 30000 });
  await page.click('#b-theme-update');
  await page.waitForFunction(() => !!document.getElementById('notice-theme-done'), null, { timeout: 60000 });
  const ws2 = await wsCfg();
  ok(kept(ws2) && configObject(ws2).themes.default !== '1.0.0', `editor (single file): "Update theme" changes themes in ${CFG}; the other members stay byte for byte\n` + show(ws2));
  await ctx.close();
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
