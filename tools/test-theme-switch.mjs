// テーマを変更…（スライド ▾。app/theme-switch.js）の試験
//   node tools/test-theme-switch.mjs [作業用のフォルダ]
// 1. 開いた 1 ファイル（examples/minimal を default で組んだもの。<html> にシード値などの属性、egatari.json にほかの作り手の項目）：
//    default → business → kokugo と替え、そのたびにプレビューの --emph が替わる・<html> のほかの属性が残る・ほかの作り手の項目がバイトのまま・
//    egatari.json の themes が新しいテーマを今の版で固定し、使わなくなったテーマの固定を外す・保存していない変更（●）になる。
//    「元に戻す」で原稿と egatari.json がバイトまで戻り、プレビューの色も戻る。保存（段 B）した 1 ファイルの索引と egatari.json も新しいテーマ
// 2. 作業フォルダ（OPFS）：egatari.json に themes がなくても固定を書き、ほかの項目を残す。元に戻すと元のバイト。
//    default を前の版 1.0.0 に固定したデッキで business に変えると、土台の default も今の版に固定し直す（選んだテーマの今の見た目）
// 3. 組み直せないファイル（テーマ庫の hash が違う：口述原稿・音声・秒数だけ）：項目は押せない形（aria-disabled）で、わけを title と知らせに出す
// 4. 英語の画面：項目と窓の言葉
// 5. ZIP ファイルのテーマ（自分のテーマ。app/theme-zip.js）：テーマを変更 →「テーマを読み込む…」→「ZIP ファイルを選ぶ…」で読み込むと一覧に加わり（「自分のテーマ」の見出しの下）、
//    新規作成の ③ の一覧と同じ。それに替えるとプレビューの --emph が替わり、egatari.json に "local"（theme.json に version がないので）と土台の default を固定。元に戻す
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { exportPortable, readPortable, scanDocument, replaceIndexText } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { parseThemesLock } from '../kit/core/themes-lock.mjs';
import { clickCommand, clickDlg, clickMenuOpen } from './click-retry.mjs';
import { writeZip } from '../kit/core/zip-read.mjs';
import { themeOf, withTheme } from '../app/theme-switch.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-theme-switch-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const LOCK = parseThemesLock(fs.readFileSync(path.join(ROOT, 'themes.lock.json'), 'utf8'));
const CUR = (n) => LOCK.themes[n].current;
const CFG = FORMAT.CONFIG_FILE;

// ---------------------------------------------------------------- 0. 文字列の操作（ブラウザなし）
{
  const src = '<!DOCTYPE html>\n<html lang="ja" data-theme="default" data-keep="abc" class="x">\n<body></body></html>';
  ok(themeOf(src) === 'default' && themeOf('<html lang="ja">') === 'default' && themeOf("<html data-theme='kokugo'>") === 'kokugo', 'themeOf: reads data-theme, default when absent');
  ok(withTheme(src, 'business') === src.replace('data-theme="default"', 'data-theme="business"'), 'withTheme: only the value changes');
  ok(withTheme('<html lang="en">\n<p data-theme="x">', 'kokugo') === '<html lang="en" data-theme="kokugo">\n<p data-theme="x">', 'withTheme: adds the attribute to <html> only');
  let threw = false; try { withTheme(src, 'a"b'); } catch { threw = true; }
  ok(threw, 'withTheme: refuses a name that is not a plain theme name');
}

// ---------------------------------------------------------------- 1. 材料
const FOREIGN = '"org.example.producer": {"big": 12345678901234567890,  "list": [1, 2 ,3], "10": "ten"}';
function deckDir(name) {
  const dir = path.join(work, name);
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/](out|audio)([\\/]|$)/.test(path.relative(ROOT, x)) });
  const deck = path.join(dir, 'deck.html');
  fs.writeFileSync(deck, fs.readFileSync(deck, 'utf8').replace(/<html\b[^>]*>/, `<html lang="ja" data-theme="default" data-keep="1" class="keep-me">`));
  fs.writeFileSync(path.join(dir, CFG), `{\n  "docId": "00000000-0000-4000-8000-000000000042",\n  "metadata": {"license": "CC-BY-4.0", "copyright": "© 2026 Test", "attribution": "Test", "creators": ["Test"]},\n  ${FOREIGN}\n}\n`);
  return deck;
}
const pf = await exportPortable(nodeEnv, deckDir('pf'), {});
const htmlAttrs = (src) => { const m = /<html\b[^>]*>/i.exec(src); return m ? m[0].replace(/\sdata-theme="[^"]*"/, '') : null; };
const ATTRS0 = htmlAttrs(Buffer.from(pf.files['deck.html']).toString('utf8'));
ok(ATTRS0 && ATTRS0.includes('data-keep="1"') && Buffer.from(pf.files[CFG]).toString('utf8').includes(FOREIGN), 'fixture: the single file has the extra <html> attributes and the foreign member');
// テーマ庫の hash が違う 1 ファイル（組み直せない：口述原稿・音声・秒数だけ）
const pother = await (async () => {
  const ix = JSON.parse(scanDocument(pf.html).byId.get(FORMAT.INDEX_ID).text);
  ix.themes[0].sha256 = '0'.repeat(64);
  return replaceIndexText(pf.html, JSON.stringify(ix, null, 1));
})();

// ---------------------------------------------------------------- 配る
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
const browser = await launch();
const errs = [];
const probeEmph = () => { const d = document.createElement('span'); d.style.color = 'var(--emph)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };

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
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy; }, n, { timeout: 60000 });
const frame = (page) => page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
const emph = async (page) => frame(page).evaluate(probeEmph);
const memFile = async (page, rel) => { const f = await page.evaluate(() => window.__APP_TEST.files()); return f && f[rel] ? Buffer.from(f[rel], 'base64').toString('utf8') : null; };
async function openBytes(page, html, name) {
  const n = await loads(page);
  const b64 = Buffer.from(html).toString('base64');
  const r = await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name }); }, [b64, name]);
  await waitLoads(page, n);
  return r;
}
// スライド ▾ → テーマを変更… → 選ぶ → 変更（初めの編集では権利の確認に「続ける」）
async function switchTo(page, name, { expectCurrent } = {}) {
  await clickCommand(page, '#b-theme-switch');
  await page.waitForSelector('#dlg[open] #theme-switch-list');
  const cur = await page.$$eval('#theme-switch-list input:checked', (a) => a.map((x) => x.value));
  if (expectCurrent) ok(cur.length === 1 && cur[0] === expectCurrent, `chooser: the current theme ${expectCurrent} is marked ${JSON.stringify(cur)}`);
  const n = await loads(page);
  await page.check(`#theme-opt-${name}`);
  await clickDlg(page, '#dlg-change');
  const rights = await page.waitForSelector('#dlg[open] #rights-list', { timeout: 1500 }).catch(() => null);
  if (rights) await clickDlg(page, '#dlg-ok');
  await waitLoads(page, n);
}
async function undo(page) {
  if (!(await page.evaluate(() => window.__APP_TEST.slides().open))) await page.click('#b-slides');
  await page.waitForSelector('#sl-undo-row:not([hidden])');
  const n = await loads(page);
  await page.click('#sl-undo');
  await waitLoads(page, n);
}

try {
  // ---------------------------------------------------------------- 2. 開いた 1 ファイル
  await session('ja', async (page) => {
    ok(await openBytes(page, pf.html, 'switch' + FORMAT.FILE_EXT) === true, '1 file: opens');
    const deck0 = await memFile(page, 'deck.html'), cfg0 = await memFile(page, CFG);
    const e0 = await emph(page);
    ok(themeOf(deck0) === 'default' && cfg0.includes(FOREIGN), `1 file: starts at default (--emph ${e0})`);
    await page.click('#b-slidemenu');
    const item = await page.textContent('#b-theme-switch');
    ok(item === 'テーマを変更…' && (await page.getAttribute('#b-theme-switch', 'aria-disabled')) === 'false', `menu: スライド ▾ has 「${item}」, enabled`);
    await page.keyboard.press('Escape');
    // 窓：見せる名前・今のテーマの印・色見本・テーマを読み込む…
    await clickCommand(page, '#b-theme-switch');
    await page.waitForSelector('#dlg[open] #theme-switch-list');
    const labels = await page.$$eval('#theme-switch-list .theme-opt', (a) => a.map((x) => x.textContent.trim()));
    ok(JSON.stringify(labels) === JSON.stringify(['標準 （今のテーマ）', 'ビジネス', '国語']), 'chooser: display names, the current one marked ' + JSON.stringify(labels));
    const sw = await page.$$eval('#theme-switch-list .swatch', (a) => a.map((e) => getComputedStyle(e).backgroundColor));
    ok(sw.length === 6 && sw.every((c) => c && c !== 'rgba(0, 0, 0, 0)') && sw[3] === 'rgb(186, 60, 5)', 'chooser: a base and an emphasis swatch per theme ' + JSON.stringify(sw));
    ok((await page.textContent('#theme-switch-load')) === 'テーマを読み込む…' && !(await page.$('#theme-switch-mine')), 'chooser: 「テーマを読み込む…」 (the same entry as New ③); no 「自分のテーマ」 heading while there are none');
    const words = [await page.textContent('#dlg-title'), await page.textContent('#theme-switch-lead'), await page.textContent('#dlg-change'), await page.textContent('#dlg-cancel')];
    ok(JSON.stringify(words) === JSON.stringify(['テーマを変更', 'スライドの中身はそのままで、色・書体・ロゴが替わります。', '変更', 'キャンセル']), 'chooser: title, lead and buttons ' + JSON.stringify(words));
    await clickDlg(page, '#dlg-cancel');
    ok(await memFile(page, 'deck.html') === deck0 && !(await state(page)).portable.dirty, 'cancel: nothing changes');

    // default → business
    await switchTo(page, 'business', { expectCurrent: 'default' });
    const deck1 = await memFile(page, 'deck.html'), cfg1 = await memFile(page, CFG), e1 = await emph(page), st1 = await state(page);
    ok(themeOf(deck1) === 'business' && htmlAttrs(deck1) === ATTRS0, '→ business: data-theme changed; every other <html> attribute kept');
    ok(deck1 === deck0.replace('data-theme="default"', 'data-theme="business"'), '→ business: nothing else in the source changed (slides untouched)');
    ok(e1 !== e0 && e1 === 'rgb(186, 60, 5)', `→ business: the preview --emph changed (${e0} → ${e1})`);
    ok(cfg1.includes(FOREIGN), '→ business: the foreign egatari.json member survives byte for byte');
    const p1 = JSON.parse(cfg1).themes;
    ok(p1.business === CUR('business') && p1.default === CUR('default') && Object.keys(p1).length === 2, '→ business: themes pins business at its current version, default (its base) kept ' + JSON.stringify(p1));
    ok(st1.portable.dirty && (await page.textContent('#deckname')).startsWith('●'), '→ business: an unsaved change (●)');
    ok(!st1.warn.some((w) => /^theme (not found|pinned)/.test(w)), '→ business: no theme warnings');

    // 元に戻す：原稿と egatari.json がバイトまで戻り、色も戻る
    await undo(page);
    ok(await memFile(page, 'deck.html') === deck0 && await memFile(page, CFG) === cfg0, 'undo: deck.html and egatari.json are back byte for byte');
    ok(await emph(page) === e0, 'undo: the preview --emph is back');

    // default → business → kokugo
    await switchTo(page, 'business', { expectCurrent: 'default' });
    await switchTo(page, 'kokugo', { expectCurrent: 'business' });
    const deck2 = await memFile(page, 'deck.html'), cfg2 = await memFile(page, CFG), e2 = await emph(page);
    ok(themeOf(deck2) === 'kokugo' && htmlAttrs(deck2) === ATTRS0, '→ kokugo: data-theme changed; other attributes kept');
    ok(e2 !== e1 && e2 !== e0, `→ kokugo: the preview --emph changed again (${e2})`);
    const p2 = JSON.parse(cfg2).themes;
    ok(cfg2.includes(FOREIGN) && p2.kokugo === CUR('kokugo') && p2.default === CUR('default') && !('business' in p2), '→ kokugo: kokugo pinned, business dropped (nothing uses it), foreign member kept ' + JSON.stringify(p2));
    await undo(page);
    ok(themeOf(await memFile(page, 'deck.html')) === 'business' && await emph(page) === e1 && JSON.parse(await memFile(page, CFG)).themes.business === CUR('business'), 'undo after two: back to business (the step before)');
    await switchTo(page, 'kokugo', { expectCurrent: 'business' });

    // 保存（段 B）：保存した 1 ファイルも kokugo で、記録と egatari.json の固定が合う
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      window.__APP_TEST.saveHandle = await root.getFileHandle(name, { create: true });
    }, 'saved' + FORMAT.FILE_EXT);
    await page.evaluate(() => { window.__APP_TEST.save('save'); });   // 段 B の確かめの窓を待つので、終わりを待たない
    const tierB = await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 }).catch(() => null);
    if (tierB) await clickDlg(page, '#dlg-rebuild');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 60000 });
    const saved = await page.evaluate(() => window.__APP_TEST.saved());
    const r = await readPortable(saved);
    const sc = JSON.parse(Buffer.from(r.files[CFG]).toString('utf8'));
    const names = r.index.themes.map((t) => t.name).sort();
    ok(themeOf(Buffer.from(r.files['deck.html']).toString('utf8')) === 'kokugo' && JSON.stringify(names) === '["default","kokugo"]' && sc.themes.kokugo === CUR('kokugo') && !('business' in sc.themes), 'save: the saved file records kokugo (index.themes and egatari.json themes) ' + JSON.stringify(sc.themes));
    ok(Buffer.from(r.files[CFG]).toString('utf8').includes(FOREIGN), 'save: the foreign member is still there');
  });

  // ---------------------------------------------------------------- 3. 作業フォルダ（OPFS）
  await session('ja', async (page) => {
    const dir = path.dirname(deckDir('folder'));
    const cfgF = `{"metadata": {"license": "CC-BY-4.0"}, ${FOREIGN}}\n`;
    const files = { 'deck.html': fs.readFileSync(path.join(dir, 'deck.html'), 'utf8'), 'narration.md': fs.readFileSync(path.join(dir, 'narration.md'), 'utf8'), [CFG]: cfgF };
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('ts', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('ts', { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      window.__testDir = d;
    }, files);
    const read = (rel) => page.evaluate(async (rel) => { try { return await (await (await window.__testDir.getFileHandle(rel)).getFile()).text(); } catch { return null; } }, rel);
    const n = await loads(page);
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'folder: opens');
    await waitLoads(page, n);
    const e0 = await emph(page);
    await switchTo(page, 'business', { expectCurrent: 'default' });
    const d1 = await read('deck.html'), c1 = await read(CFG);
    ok(themeOf(d1) === 'business' && htmlAttrs(d1) === htmlAttrs(files['deck.html']) && await emph(page) !== e0, 'folder: deck.html now says business (other attributes kept); the preview changed');
    ok(c1.includes(FOREIGN) && c1.startsWith('{"metadata": {"license": "CC-BY-4.0"}, ') && JSON.parse(c1).themes.business === CUR('business'), 'folder: egatari.json gets a themes pin; the other members keep their bytes ' + JSON.stringify(c1));
    await undo(page);
    ok(await read('deck.html') === files['deck.html'] && await read(CFG) === cfgF && await emph(page) === e0, 'folder: undo restores both files byte for byte');
  });
  // 前の版の固定：default 1.0.0 → business に変えると default も今の版
  await session('ja', async (page) => {
    const dir = path.dirname(deckDir('folder-old'));
    const OLD = '1.0.0', cfgO = `{"metadata": {"license": "CC-BY-4.0"}, ${FOREIGN}, "themes": {"default": "${OLD}"}}\n`;
    const files = { 'deck.html': fs.readFileSync(path.join(dir, 'deck.html'), 'utf8'), 'narration.md': fs.readFileSync(path.join(dir, 'narration.md'), 'utf8'), [CFG]: cfgO };
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('ts-old', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('ts-old', { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      window.__testDir = d;
    }, files);
    const read = (rel) => page.evaluate(async (rel) => { try { return await (await (await window.__testDir.getFileHandle(rel)).getFile()).text(); } catch { return null; } }, rel);
    const muted = () => frame(page).evaluate(() => { const d = document.createElement('span'); d.style.color = 'var(--muted)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    const n = await loads(page);
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'old pin: opens');
    await waitLoads(page, n);
    const m0 = await muted(), st0 = await state(page);
    ok(m0 === 'rgb(110, 110, 110)' && st0.warn.some((w) => /^theme pinned:/.test(w)), `old pin: the deck builds with default ${OLD} (--muted ${m0})`);
    await switchTo(page, 'business', { expectCurrent: 'default' });
    const c1 = await read(CFG), p1 = JSON.parse(c1).themes, m1 = await muted(), st1 = await state(page);
    ok(p1.default === CUR('default') && p1.business === CUR('business') && Object.keys(p1).length === 2 && c1.includes(FOREIGN), `old pin → business: default (the base) is pinned at current ${CUR('default')} too ` + JSON.stringify(p1));
    ok(!st1.warn.some((w) => /^theme pinned:/.test(w)) && m1 !== m0, `old pin → business: the preview builds default at current too (no pinned-theme warning; --muted ${m1})`);
    await undo(page);
    ok(await read(CFG) === cfgO && await muted() === m0, 'old pin: undo restores the 1.0.0 pin byte for byte and the old colors');
  });

  // ---------------------------------------------------------------- 5. ZIP ファイルのテーマ（自分のテーマ）
  await session('ja', async (page) => {
    const tokens = ':root{\n  --emph: #0a7d6e;\n}\n';
    const zip = writeZip([['zipteal/tokens.css', new Uint8Array(Buffer.from(tokens))], ['zipteal/theme.json', new Uint8Array(Buffer.from('{"title":"ZIP の青緑","extends":"default"}'))]]);
    await page.evaluate((b64) => {
      window.__APP_TEST.themeZipPicker = async () => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'zipteal.zip', { type: 'application/zip' });
    }, Buffer.from(zip).toString('base64'));
    ok(await openBytes(page, pf.html, 'zip' + FORMAT.FILE_EXT) === true, 'zip: opens');
    const deck0 = await memFile(page, 'deck.html'), cfg0 = await memFile(page, CFG), e0 = await emph(page);
    // テーマを変更 → テーマを読み込む… → 読み込みの窓 → ZIP ファイルを選ぶ… → テーマを変更の窓に戻り、一覧に加わる
    await clickCommand(page, '#b-theme-switch');
    await page.waitForSelector('#dlg[open] #theme-switch-load');
    await page.click('#theme-switch-load');
    await page.waitForSelector('#theme-load[open] #theme-load-zip');
    ok((await page.textContent('#theme-load-title')) === 'テーマを読み込む', 'zip: 「テーマを読み込む…」 in テーマを変更 opens the same Load theme dialog');
    const n = await loads(page);
    await page.click('#theme-load-zip');
    await page.waitForSelector('#dlg[open] #theme-opt-zipteal', { timeout: 30000 });
    await waitLoads(page, n).catch(() => {});
    const rows = await page.$$eval('#theme-switch-list > *', (a) => a.map((x) => x.textContent.trim()));
    ok(JSON.stringify(rows) === JSON.stringify(['標準 （今のテーマ）', 'ビジネス', '国語', '自分のテーマ', 'ZIP の青緑']), 'zip: after loading, the list shows the theme under 「自分のテーマ」 by its title ' + JSON.stringify(rows));
    const sw = await page.$$eval('#theme-opt-zipteal ~ .swatch, label[for=theme-opt-zipteal] .swatch', (a) => a.map((e) => getComputedStyle(e).backgroundColor));
    ok(sw.includes('rgb(10, 125, 110)'), 'zip: its emphasis swatch is read from the stored tokens.css ' + JSON.stringify(sw));
    const switchList = await page.$$eval('#theme-switch-list input', (a) => a.map((x) => [x.value, x.closest('label').querySelector('span:not(.swatch):not(.hint)').textContent]));
    await clickDlg(page, '#dlg-cancel');
    // 新規作成の ③ の一覧と同じ（値と見せる名前。「テーマを読み込む…」を除く）
    await clickCommand(page, '#b-new');
    await page.waitForSelector('#dlg[open] #paste-step-kind');
    await page.check('#paste-cat-other');
    await page.click('#paste-next-kind');
    await page.fill('#paste-title', 'theme');
    await page.click('#paste-next-content');
    await page.waitForSelector('#paste-theme', { state: 'visible' });
    const newList = await page.$$eval('#paste-theme option', (a) => a.filter((o) => !o.value.startsWith('\u0000')).map((o) => [o.value, o.textContent]));
    const group = await page.$$eval('#paste-theme optgroup', (a) => a.map((g) => [g.label, [...g.children].map((o) => o.value)]));
    ok(JSON.stringify(newList) === JSON.stringify(switchList) && JSON.stringify(group) === JSON.stringify([['自分のテーマ', ['zipteal']]]), 'lists: New ③ and テーマを変更 list the same themes in the same order, own themes under 「自分のテーマ」 ' + JSON.stringify(switchList));
    await clickDlg(page, '#dlg-cancel');
    // 替える：--emph が替わり、"local" と土台の default を固定。組み立ては保存したテーマを見つける
    await switchTo(page, 'zipteal', { expectCurrent: 'default' });
    const deck1 = await memFile(page, 'deck.html'), cfg1 = await memFile(page, CFG), e1 = await emph(page), st1 = await state(page);
    ok(themeOf(deck1) === 'zipteal' && htmlAttrs(deck1) === ATTRS0, '→ zipteal: data-theme changed; other attributes kept');
    ok(e1 === 'rgb(10, 125, 110)' && e1 !== e0, `→ zipteal: the preview builds with the ZIP theme (--emph ${e0} → ${e1})`);
    const p1 = JSON.parse(cfg1).themes;
    ok(p1.zipteal === 'local' && p1.default === CUR('default') && Object.keys(p1).length === 2 && cfg1.includes(FOREIGN), '→ zipteal: pinned as "local", its base default at current ' + JSON.stringify(p1));
    ok(!st1.warn.some((w) => /^theme (not found|pinned)/.test(w)), '→ zipteal: no theme warnings ' + JSON.stringify(st1.warn));
    await undo(page);
    ok(await memFile(page, 'deck.html') === deck0 && await memFile(page, CFG) === cfg0 && await emph(page) === e0, 'zip undo: deck.html and egatari.json back byte for byte, colors back');
  });

  // ---------------------------------------------------------------- 4. 組み直せないファイル・英語
  for (const lang of ['ja', 'en']) {
    await session(lang, async (page) => {
      ok(await openBytes(page, pother, 'other' + FORMAT.FILE_EXT) === true, `${lang} tier A only: opens`);
      const st = await state(page);
      ok(!!st.portable.tierAOnly, `${lang} tier A only: the file can only have narration, audio and timing edited`);
      await clickMenuOpen(page, '#b-slidemenu');
      const t = { text: await page.textContent('#b-theme-switch'), dis: await page.getAttribute('#b-theme-switch', 'aria-disabled'), title: await page.getAttribute('#b-theme-switch', 'title') };
      const want = lang === 'ja' ? ['テーマを変更…', 'テーマを変更できません'] : ['Change theme…', 'cannot change theme for this file'];
      ok(t.text === want[0] && t.dis === 'true' && t.title.includes(want[1]), `${lang} tier A only: 「${t.text}」 is disabled with the reason ${JSON.stringify(t.title)}`);
      await page.$eval('#b-theme-switch', (b) => b.click());   // aria-disabled（Playwright は押さない）：押せる形のまま、わけを出す
      await page.waitForSelector('#toast.show.bad');
      ok((await page.textContent('#toast')).includes(want[1]) && !(await page.evaluate(() => document.getElementById('dlg').open)), `${lang} tier A only: choosing it shows the reason; no chooser`);
      if (lang === 'en') {
        await openBytes(page, pf.html, 'en' + FORMAT.FILE_EXT);
        await clickCommand(page, '#b-theme-switch');
        await page.waitForSelector('#dlg[open] #theme-switch-list');
        const title = await page.textContent('#dlg-title'), labels = await page.$$eval('#theme-switch-list .theme-opt', (a) => a.map((x) => x.textContent.trim()));
        ok(title === 'Change theme' && JSON.stringify(labels) === JSON.stringify(['Standard (current)', 'Business', 'Kokugo']) && (await page.textContent('#theme-switch-load')) === 'Load theme…' && (await page.textContent('#dlg-change')) === 'Change' && (await page.textContent('#dlg-cancel')) === 'Cancel', 'en: the chooser in English ' + JSON.stringify(labels));
        await clickDlg(page, '#dlg-cancel');
      }
    });
  }
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
