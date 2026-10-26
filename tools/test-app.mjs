// 編集アプリ（app/）の確認
//   node tools/test-app.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 1. tools/build-app.mjs で作業用のフォルダに組み、dist/ を 127.0.0.1 で配る（根と /egatari-studio/ の両方。13 でサイトの形を確かめる）
// 2. OPFS（navigator.storage.getDirectory()）に examples/minimal を写したフォルダを作り、window.__APP_TEST_OPEN(handle) で開く
// 3. ブラウザで組んだ HTML が Node の build（字を絞り込まない）と同じか・原稿の編集・口述原稿・コメント・外での変更・
//    組み立ての失敗・書き出し・品質チェック・発表者ビュー・1 ファイル版（file://）を確かめる。コンソールのエラーが無いこと
// 4. 持ち運べる 1 ファイル（examples/minimal ＋ dry-run の音声、tools/portable-fixtures.mjs）：フォルダなしで開く・権利の確認・
//    編集・保存（OPFS のファイルのハンドルに上書き）・開き直し・フォルダへの書き出し・フォルダからの書き出し・改変を認めないライセンス・
//    独自のコードの知らせ・印のスクリプトが取り出しで動かない（アプリのページと Worker）・壊れた・新しい版のファイルを断る・ダウンロード
// 6. スライド一覧（tools/test-app-slides.mjs）：足す・複製・削除と元に戻す・並べ替え（作業フォルダと 1 ファイル）
// 5. 利用者のテーマのフォルダ（OPFS のフォルダを選ぶ）：見つからないテーマの知らせ・選ぶ・探す順・根の決まり・1 ファイルへの書き出し・残す・許可の求め直し・忘れる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from '../kit/browser.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { exportName, titleOf } from '../kit/core/export-name.mjs';
import { readPortable, isStale, scanDocument, replaceIndexText } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { unpack } from './portable.mjs';
import { makeFixtures, silentWav } from './portable-fixtures.mjs';
import { hostileFiles, PWNED } from './hostile-deck.mjs';
import { regionDiff } from './tier-a-diff.mjs';
import { testLlm } from './test-app-llm.mjs';
import { testAppLive } from './test-app-live.mjs';
import { testAppSlides } from './test-app-slides.mjs';
import { clickUntil, clickDlg, clickMenuOpen, clickMenuItem } from './click-retry.mjs';
import { EXAMPLES } from './examples-portable.mjs';
import { assemble, packSite, sha256, shaLine } from './site-versions.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-app-')));
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DIST = path.join(work, 'dist');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
// 食い違ったら最初に違う所の前後を出す（Windows などで原因を追うため）
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && a.length === b.length ? '' : `\n       at ${i}: app …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 120))}\n       node …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 120))}`; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

// ---------------------------------------------------------------- 0. 持ち運べる 1 ファイルを作る（Node）
// examples/minimal に音声（TTS の dry-run。uv がなければ JS の無音）と権利の表示を足して 1 ファイルに。ライセンスを変えた写しも
function prepareDeck(dir, metadata) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  const r = spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), dir, '--dry-run'], { encoding: 'utf8' });
  if (r.status !== 0) {
    fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
    const segments = {};
    parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8')).forEach((x, j) => {
      fs.writeFileSync(path.join(dir, 'audio', `seg_js${j}.wav`), silentWav(0.5));
      segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' };
    });
    fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  }
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const PW = path.join(work, 'portable');
fs.rmSync(PW, { recursive: true, force: true });
const pmin = await buildPortable(prepareDeck(path.join(PW, 'min'), { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author, Minimal lesson', creators: ['Test Author'] }), { out: path.join(PW, 'min.html') });
const pnd = await buildPortable(prepareDeck(path.join(PW, 'nd'), { license: 'CC-BY-ND-4.0', copyright: '© 2026 Rights Holder' }), { out: path.join(PW, 'nd.html') });
const fixtures = await makeFixtures(path.join(PW, 'fixtures'));
// テーマ庫のテーマの hash が、このエディタのものと違う文書（作り直しの編集はできない → 読むだけで開く）
const pother = await (async () => {
  const ix = JSON.parse(scanDocument(pmin.html).byId.get(FORMAT.INDEX_ID).text);
  if (!ix.themes || !ix.themes.length) throw new Error('minimal portable file has no registry theme');
  ix.themes[0].sha256 = '0'.repeat(64);
  return replaceIndexText(pmin.html, JSON.stringify(ix, null, 1));
})();
const fixture = (name) => fixtures.find((f) => f.name === name);

// ---------------------------------------------------------------- 1. 組んで配る
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain', '.md': 'text/plain', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
let fontFetches = 0;
// dist/ をサイトの根（https://studio.egatari.org/ の形）と下のパス /egatari-studio/（https://egatari.github.io/egatari-studio/ の形）の両方で配る
const SUB = 'egatari-studio/';
// 版を並べたサイト（tools/site-versions.mjs assemble：根に今の版、/v<今の版>/ にその写し、/v0.0.1/ に版の案内を持たない古い版の代わり）を /site/ で配る（13b）
const SITE = path.join(work, 'site'), SITEP = 'site/';
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname), dir = DIST;
  if (p.startsWith('/' + SUB)) p = p.slice(SUB.length);
  else if (p.startsWith('/' + SITEP)) { p = p.slice(SITEP.length); dir = SITE; }
  const file = path.join(dir, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  if (file.endsWith('.woff2')) fontFetches++;
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
console.log('app', BASE);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
const page = await ctx.newPage();
const errs = [];
let hostileQuiet = false;   // 書き込みを試みるデッキの試験の間は、決まり（CSP）に止められた知らせを数えない（止められることを確かめている）
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  if (process.env.APP_DEBUG) p.on('console', (m) => console.log(`    [${tag} ${m.type()}] ${m.text()}`));
  // 衝突の確認（409）とポップアップの許可は意図したもの
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text()) && !(hostileQuiet && /Content Security Policy|Refused to|Failed to fetch|ERR_/.test(m.text()))) errs.push(`${tag} console: ${m.text()}`); });
};
watch(page, 'main');

// OPFS のフォルダの読み書き（ページの中で）
const opfs = {
  write: (rel, text) => page.evaluate(async ([rel, text]) => {
    const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir;
    for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
  }, [rel, text]),
  read: (rel) => page.evaluate(async (rel) => {
    try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(name)).getFile()).text(); }
    catch { return null; }
  }, rel),
  list: (rel) => page.evaluate(async (rel) => {
    let d = window.__testDir; for (const x of rel.split('/').filter(Boolean)) d = await d.getDirectoryHandle(x);
    const out = []; for await (const k of d.keys()) out.push(k); return out.sort();
  }, rel),
};
// プレビューの枠（スライド一覧の縮図の枠 sl-thumbs は除く）
const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
async function frameReady(timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = deckFrame();
    // 今の読み込み（アプリの loads）の画面が組み上がるまで待つ（前の画面を掴まない）
    const want = await page.evaluate(() => window.__APP_TEST.state().loads);
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.DECK_DEV && window.__APP_LOAD === w), want)) { await page.waitForTimeout(120); return f; } } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
// 信頼する編集の道具がどれもプレビューの外にあるか（矩形が重ならない）。印の帯が見えるか。欄を開いている間、プレビューは inert か
const trustedLayout = (p, frameId) => p.evaluate((fid) => {
  const f = document.getElementById(fid).getBoundingClientRect();
  const ids = ['dev-side', 'dev-mark', 'dev-badge', 'dev-editor', 'dev-comment', 'dev-comments', 'dev-narr'].filter((id) => { const e = document.getElementById(id); return e && e.getClientRects().length; });
  const outside = ids.every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.right <= f.left + 0.5 || r.left >= f.right - 0.5 || r.bottom <= f.top + 0.5 || r.top >= f.bottom - 0.5; });
  const mark = document.getElementById('dev-mark');
  return { ids, outside, mark: mark && mark.getClientRects().length ? mark.textContent : null, inert: document.getElementById(fid).inert };
}, frameId);
const loads = () => page.evaluate(() => window.__APP_TEST.state().loads);
const POLL_WAIT = 3500;   // 外での変更の見張り（1.5 秒ごと）と組み直しが一巡りする時間
// 「書き出す ▾」の一覧の項目を押す（一覧を開いてから）
async function menuClick(id, p = page, menu = '#b-exportmenu') { await clickMenuOpen(p, menu); await p.waitForSelector(`#${await p.getAttribute(menu, 'aria-controls')}:not([hidden])`); await clickMenuItem(p, id); }
// プレビューが空か（確かめの前に、前のデッキも新しいデッキも何も出ていない・動いていない）
async function previewBlank(p = page) {
  const attr = await p.evaluate(() => { const f = document.getElementById('preview'); return { srcdoc: f.hasAttribute('srcdoc'), src: f.getAttribute('src') }; });
  const fr = p.frames().find((x) => x.parentFrame() === p.mainFrame());
  let inner = null;
  try { inner = fr ? await fr.evaluate(() => ({ deck: typeof window.DECK !== 'undefined', kids: document.body ? document.body.childElementCount : 0, url: location.href })) : null; } catch { inner = null; }
  return !attr.srcdoc && !attr.src && (!inner || (!inner.deck && inner.kids === 0));
}
// プレビューで音声が鳴る（backlog #49）：deck-audio の src がプレビューの文書の blob: になり、自動再生で鳴って時刻が進む
// （キーの操作のない再生はブラウザが止めるので、試験では音を消して鳴らす）
async function previewAudioPlays(fr, tag) {
  let srcs = [];
  for (let i = 0; i < 100; i++) {
    srcs = await fr.evaluate(() => Object.values(DECK.AUDIO).map((a) => a.src));
    if (srcs.length && srcs.every((s) => s.startsWith('blob:'))) break;
    await page.waitForTimeout(100);
  }
  ok(srcs.length > 0 && srcs.every((s) => s.startsWith('blob:')), `${tag}: every deck-audio src is a blob: URL of the preview document (${srcs.length})`);
  await fr.evaluate(() => { const pl = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__au = this; this.muted = true; return pl.call(this); }; DECK.go(0, 0, false); });
  await fr.evaluate(() => DECK.autoplay(true));
  let st = null;
  for (let i = 0; i < 60; i++) {
    st = await fr.evaluate(() => (window.__au ? { src: window.__au.src, t: window.__au.currentTime, err: window.__au.error && window.__au.error.code } : { auto: document.documentElement.classList.contains('autoplay') }));
    if (st && st.t > 0) break;   // st.auto：まだ鳴らしていない（自動再生の状態だけ）
    await page.waitForTimeout(100);
  }
  ok(!!st && !!st.src && st.src.startsWith('blob:') && st.t > 0 && !st.err, `${tag}: autoplay plays the audio (currentTime advances) ${JSON.stringify(st)}`);
  await fr.evaluate(() => { DECK.autoplay(false); DECK.go(0, 0, false); });
}
// 発表者ビューから自動再生を始めると、プレビュー（本体）の音声が鳴る（音は消さない：キーを押したのは発表者ビューの窓なので、
// プレビューの枠に allow="autoplay" がないとブラウザが NotAllowedError で止める）。発表者ビューの中のデッキ（発表者の画面・今と次の画面）は
// 何も鳴らさない（二重に鳴らない）。Playwright の evaluate はその枠をユーザーが操作したことにする（以後は再生を許す）ので、新しい context で、
// 鳴らす前にはプレビューの枠で evaluate しない：再生の見張りは addInitScript で入れ、結果は鳴らした後で読む
async function presenterAudioPlays(html, tag) {
  const cx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  await cx.addInitScript(() => {
    const pl = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__plays = (window.__plays || 0) + 1; window.__au = this; const r = pl.call(this); r.then(() => { window.__auRes = 'ok'; }, (e) => { window.__auRes = e.name; }); return r; };
  });
  const pg = await cx.newPage();
  watch(pg, tag);
  try {
    await pg.goto(BASE);
    await pg.waitForSelector('#drop');
    const l0 = await pg.evaluate(() => window.__APP_TEST.state().loads);
    await pg.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'min' + ext }); }, [Buffer.from(html).toString('base64'), FORMAT.FILE_EXT]);
    await pg.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads; }, l0, { timeout: 30000 });
    await pg.waitForTimeout(2500);   // 音声のバイトがプレビューに届き、blob: になるまで
    const [pop] = await Promise.all([cx.waitForEvent('page'), pg.click('#b-presenter')]);
    watch(pop, tag + ' presenter');
    let pv = null;
    for (let i = 0; i < 200 && !pv; i++) { const x = pop.frames().find((y) => y.parentFrame() === pop.mainFrame()); try { if (x && await x.evaluate(() => !!document.getElementById('pv'))) pv = x; } catch { /* 読み込み中 */ } if (!pv) await pop.waitForTimeout(100); }
    if (!pv) { ok(false, `${tag}: presenter view did not load`); return; }
    await pop.waitForTimeout(800);
    await pv.click('#pv-notes');
    await pop.keyboard.press('a');
    const fr = pg.frames().find((y) => y.parentFrame() === pg.mainFrame());
    let st = null;
    for (let i = 0; i < 80; i++) {
      await pg.waitForTimeout(100);
      st = await fr.evaluate(() => ({ res: window.__auRes || null, src: window.__au ? window.__au.src : null, t: window.__au ? window.__au.currentTime : 0, muted: window.__au ? window.__au.muted : null, plays: window.__plays || 0 }));
      if ((st.res && st.res !== 'ok') || (st.res === 'ok' && st.t > 0)) break;
    }
    ok(st.res === 'ok' && st.t > 0 && st.muted === false && /^blob:/.test(st.src || ''), `${tag}: autoplay started in the presenter view plays the preview's audio (not muted) ${JSON.stringify(st)}`);
    const plays = [];
    for (const x of [pv, ...pv.childFrames()]) plays.push(await x.evaluate(() => window.__plays || 0).catch(() => -1));
    ok(plays.length === 3 && plays.every((n) => n === 0), `${tag}: the presenter view itself plays nothing (no double playback) ${JSON.stringify(plays)}`);
    await pop.keyboard.press('a');
  } finally { await cx.close(); }
}
async function waitLoads(n, timeout = 15000) {
  await page.waitForFunction((n) => window.__APP_TEST.state().loads > n, n, { timeout });
  return frameReady();
}

try {
  // ---------------------------------------------------------------- 2. はじめの画面
  await page.goto(BASE);
  await page.waitForSelector('#drop');
  ok(await page.isVisible('#w-open') && await page.evaluate(() => document.getElementById('w-openfile').classList.contains('pri') && !document.getElementById('w-open').classList.contains('pri')), 'welcome: open-folder button visible (secondary)');
  ok((await page.textContent('#welcome h1')).includes('1 ファイル（.ega.html）'), 'welcome: Japanese UI for ja locale');
  ok(!(await page.isVisible('#unsupported')), 'welcome: File System Access available (no "unsupported" note)');
  await shot(page, 'welcome.png');

  // 新しいデッキ：フォルダを選ぶ画面の代わりに OPFS の空でないフォルダを返す → 中に新しいフォルダを作って開く
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('talks', { recursive: true }).catch(() => {});
    const parent = await root.getDirectoryHandle('talks', { create: true });
    await parent.getFileHandle('other.txt', { create: true });
    window.__parent = parent;
    window.showDirectoryPicker = async () => parent;
  });
  // 新規作成…：白紙から・雛形から・チャットの AI に書いてもらう の 3 つ。雛形から（見本のスライド入り）
  await page.click('#w-new');
  await page.waitForSelector('#dlg[open] #dlg-new-template');
  ok((await page.textContent('#w-new')) === '新規作成…' && (await page.textContent('#dlg-title')) === '新規作成' && (await page.textContent('#dlg-new-blank')) === '白紙から' && (await page.textContent('#dlg-new-template')) === '雛形から' && (await page.textContent('#dlg-new-ai')) === 'チャットの AI に書いてもらう…',
    'new: 「新規作成…」 offers 白紙から, 雛形から and チャットの AI に書いてもらう');
  await page.click('#dlg-new-template');
  await page.waitForSelector('#newform:not([hidden])');
  ok((await page.textContent('#n-head')) === '新規作成：雛形から', 'new: 雛形から opens the form for a deck with the sample slides');
  await page.fill('#n-title', 'テスト用のデッキ');
  await page.click('#n-go');
  await page.waitForFunction(() => window.__APP_TEST.state().open && window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
  const made = await page.evaluate(async () => { const d = await window.__parent.getDirectoryHandle('テスト用のデッキ'); const out = []; for await (const k of d.keys()) out.push(k); return out.sort().join(','); });
  ok(made === 'deck.html,narration.md', 'new deck: created deck.html and narration.md in a new subfolder of a non-empty folder');
  ok(!(await page.evaluate(() => window.__APP_TEST.state().error)), 'new deck: the template builds without error');
  await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });
  // 白紙から（デッキを開いているときは「開く ▾ → 新規作成…」。最初の画面のフォームへ戻る）：表紙だけのデッキ
  await page.click('#b-openmenu');
  await page.click('#b-new');
  await page.waitForSelector('#dlg[open] #dlg-new-blank');
  await page.click('#dlg-new-blank');
  await page.waitForSelector('#newform:not([hidden])');
  ok((await page.textContent('#n-head')) === '新規作成：白紙から', 'new: 白紙から (from the Open menu with a deck open) goes back to the form');
  await page.fill('#n-title', '白紙のデッキ');
  await page.click('#n-go');
  await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.open && s.loads > 0 && /白紙のデッキ/.test(document.getElementById('deckname').textContent); }, null, { timeout: 20000 });
  const blankDeck = await page.evaluate(async () => (await (await (await window.__parent.getDirectoryHandle('白紙のデッキ')).getFileHandle('deck.html')).getFile()).text());
  ok((blankDeck.match(/<section class="slide/g) || []).length === 1 && /<h1>白紙のデッキ<\/h1>/.test(blankDeck) && !(await page.evaluate(() => window.__APP_TEST.state().error)), 'new: 白紙から makes a deck with only the title slide, and it builds');
  await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });

  // examples/minimal を OPFS に写して開く
  const SRC = path.join(ROOT, 'examples/minimal');
  const files = { 'deck.html': fs.readFileSync(path.join(SRC, 'deck.html'), 'utf8'), 'narration.md': fs.readFileSync(path.join(SRC, 'narration.md'), 'utf8') };
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('minimal', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('minimal', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, files);
  let n = await loads();
  const opened = await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir));
  ok(opened === true, 'open: __APP_TEST_OPEN(handle) opened the OPFS folder');
  let f = await waitLoads(n);
  const st0 = await page.evaluate(() => window.__APP_TEST.state());
  ok(st0.deckFile === 'deck.html' && !st0.error, 'open: built deck.html without error');
  ok(fontFetches > 0, `fonts: fetched only the needed woff2 chunks (${fontFetches})`);
  ok(await f.evaluate(() => DECK.slides.length) === 6, 'preview: 6 slides in the sandboxed iframe');
  ok(await f.evaluate(() => { try { return window.parent.document && 'reachable'; } catch { return 'blocked'; } }) === 'blocked', 'sandbox: the deck cannot reach the app document (opaque origin)');

  // ブラウザで組んだものと Node の build が同じ（字を絞り込まない設定で）
  const appHtml = await page.evaluate(() => window.__APP_TEST.build({ dev: false }));
  const nodeHtml = build(path.join(SRC, 'deck.html'), { subset: false }).html;
  ok(appHtml === nodeHtml, `build: browser build is byte-identical to Node build (subset off) (${(appHtml.length / 1024).toFixed(0)} KB)` + firstDiff(appHtml, nodeHtml));
  const appDev = await page.evaluate(() => window.__APP_TEST.build({ dev: true }));
  const nodeDev = build(path.join(SRC, 'deck.html'), { dev: true }).html;
  ok(appDev === nodeDev, 'build: dev build (data-src) is byte-identical to Node' + firstDiff(appDev, nodeDev));

  // ---------------------------------------------------------------- 3. 原稿の編集（プレビューは知らせるだけ。欄はアプリのページに出る）
  await f.evaluate(() => DECK.go(2, 3, false));
  // 発表の道具（ペン）を選んでから編集モードに入る（#69）：道具は切れ、ダブルクリックは編集になり、線は描かれない。画面の端に今のモード
  await f.evaluate(() => window.focus());   // プレビューの文書にフォーカスを（別のプロセスの iframe なので、本体を押すだけでは届かないことがある）
  await f.locator('body').press('d');
  await page.waitForFunction(() => document.getElementById('dev-mode') && document.getElementById('dev-mode').textContent === '発表の道具：ペン');
  ok(await f.evaluate(() => DECK.tools.mode()) === 'pen' && await page.evaluate(() => !!document.querySelector('#status #st-mode #dev-mode[aria-live=polite]')), 'tools vs edit: the pen is on and the footer shows 発表の道具：ペン (aria-live)');
  await page.click('#b-edit');
  await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
  ok(true, 'edit: toolbar button turns on edit mode');
  ok(await f.evaluate(() => DECK.tools.mode() === null && !document.querySelector('#dt-layer.on') && getComputedStyle(document.querySelector('#dt-cb [data-b=laser]')).display === 'none'
    && document.querySelector('#dt-cb [data-b=pen]').getAttribute('aria-label') === 'マーカー'), 'tools vs edit: entering edit mode turns the pen off, hides the tool buttons and turns the pen button into マーカー (#70)');
  ok(await page.evaluate(() => document.getElementById('dev-mode').textContent) === '編集中', 'tools vs edit: the footer shows 編集中');
  await f.evaluate(() => window.focus());
  for (const k of ['x', 'v']) await f.locator('body').press(k);
  ok(await f.evaluate(() => DECK.tools.mode()) === null, 'tools vs edit: x / v do nothing while editing');
  // ペンのキー d はマーカー（#70）：画面の端は「編集中：マーカー」、もう一度 d で切れる
  await f.locator('body').press('d');
  await page.waitForFunction(() => document.getElementById('dev-mode').textContent === '編集中：マーカー', null, { timeout: 5000 }).catch(() => {});
  ok(await f.evaluate(() => DECK.tools.mode()) === 'ink' && await page.evaluate(() => document.getElementById('dev-mode').textContent) === '編集中：マーカー', 'tools vs edit: d enters the marker while editing (footer: 編集中：マーカー)');
  await f.locator('body').press('d');
  await page.waitForFunction(() => document.getElementById('dev-mode').textContent === '編集中', null, { timeout: 5000 }).catch(() => {});
  ok(await f.evaluate(() => DECK.tools.mode()) === null, 'tools vs edit: d again leaves the marker');
  const li = f.locator('#stage .slide.active li[data-step="2"]');
  await li.dblclick();
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  const ta = page.locator('#dev-editor textarea');
  ok((await ta.inputValue()).includes('学習率'), 'edit: the editor (in the app page, outside the preview) shows the raw source');
  ok(!(await f.$('#dev-editor')), 'edit: no editor inside the preview');
  const lay = await trustedLayout(page, 'preview');
  ok(lay.outside && lay.ids.includes('dev-editor') && lay.mark === '編集中 — アプリ' && lay.inert === true, 'edit: every trusted control is outside the slide area, under the "編集中 — アプリ" marker; the preview is inert while the editor is open ' + JSON.stringify(lay));
  await ta.fill('\\(\\eta>0\\)：<b>学習率</b>（アプリで編集）');
  await shot(page, 'editing.png');
  n = await loads();
  await ta.press('Meta+Enter');
  f = await waitLoads(n);
  const deck1 = await opfs.read('deck.html');
  ok(deck1.includes('<li data-step="2">\\(\\eta>0\\)：<b>学習率</b>（アプリで編集）</li>'), 'edit: deck.html in the folder changed');
  const st1 = await f.evaluate(() => DECK.state());
  ok(st1.slide === 3 && st1.step === 3, `edit: position kept after reload (${st1.slide}:${st1.step})`);
  ok(await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('アプリで編集')), 'edit: preview shows the new text');
  const backups = await opfs.list('.cache/edits');
  ok(backups.length === 1 && backups[0].endsWith('-deck.html'), 'edit: backup in .cache/edits/');
  // 書きかけのあいだに外で原稿が変わった → 保存は 409（入力は残る）
  await f.locator('#stage .slide.active li[data-step="3"]').dblclick();
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  await page.fill('#dev-editor textarea', '書きかけ');
  n = await loads();
  const deckExt = deck1.replace('<h2>更新の式</h2>', '<h2>更新の式（外で）</h2>');
  await opfs.write('deck.html', deckExt);
  f = await waitLoads(n, 10000);
  ok((await page.inputValue('#dev-editor textarea')) === '書きかけ', 'edit conflict: the open editor keeps unsaved input across the reload');
  await page.press('#dev-editor textarea', 'Meta+Enter');
  await page.waitForSelector('#dev-editor .dev-msg.dv-err');
  ok(/原稿が変わっています/.test(await page.textContent('#dev-editor .dev-msg')) && (await opfs.read('deck.html')) === deckExt, 'edit conflict: stale hash is rejected (409), shown in the editor, file untouched');
  await page.press('#dev-editor textarea', 'Escape');
  n = await loads();
  await opfs.write('deck.html', deck1);
  f = await waitLoads(n, 10000);

  // ---------------------------------------------------------------- 4. 口述原稿（narration.md を CRLF にして、書き戻しが CRLF のままか）
  // （改行だけの違いは組み立ての結果を変えないので、プレビューは読み込み直さない。組み直しを待つ）
  const b0 = await page.evaluate(() => window.__APP_TEST.state().builds);
  await opfs.write('narration.md', (await opfs.read('narration.md')).replace(/\r?\n/g, '\r\n'));
  await page.waitForFunction((b0) => window.__APP_TEST.state().builds > b0, b0, { timeout: 10000 });
  await f.locator('body').press('e');   // 編集モードを切る（デッキで押した e は知らせとしてアプリに届く）
  await page.waitForFunction(() => !window.__APP_TEST.ui().edit);
  ok(!(await f.evaluate(() => document.documentElement.classList.contains('dev-edit'))), 'edit: e pressed in the preview turns edit mode off (forwarded hint)');
  ok(await f.evaluate(() => DECK.tools.mode()) === null && await page.evaluate(() => document.getElementById('dev-mode').textContent) === '表示', 'tools vs edit: leaving edit mode does not bring the pen back (footer: 表示)');
  await f.evaluate(() => DECK.go(1, 0, false));
  await page.click('#b-narr');
  await page.waitForSelector('#dev-narr .dev-turn textarea');
  const nta = page.locator('#dev-narr .dev-turn textarea').first();
  await nta.fill('アプリから書き直した口述原稿です。');
  await page.click('#dev-narr button:has-text("発言を足す")');
  await page.locator('#dev-narr .dev-turn textarea').last().fill('足した発言です。');
  await shot(page, 'narration.png');
  ok(await page.evaluate(() => document.getElementById('preview').inert && window.__APP_TEST.ui().editing), 'narration: the preview is inert while a narration field is being edited (unsaved)');
  n = await loads();
  await page.click('#dev-narr .dv-foot button.dv-pri');
  f = await waitLoads(n);
  ok(await page.evaluate(() => !document.getElementById('preview').inert && !window.__APP_TEST.ui().editing), 'narration: after Save the preview takes input again');
  const narr1 = await opfs.read('narration.md');
  ok(narr1.includes('アプリから書き直した口述原稿です。') && narr1.includes('足した発言です。'), 'narration: narration.md changed (turn added)');
  ok(!/(^|[^\r])\n/.test(narr1), 'narration: CRLF line endings kept');
  ok(await f.evaluate(() => JSON.stringify(DECK.NARRATION).includes('アプリから書き直した')), 'narration: rebuilt deck has the new narration');
  // 保存の途中の入力：書き込みを止めておき、その間にまた入力する。応答の後も未保存のままで、入力は消えず、プレビューは inert のまま
  {
    await page.evaluate(() => {
      const orig = FileSystemFileHandle.prototype.createWritable; window.__origCW = orig; window.__holdNarr = true; window.__nGate = null;
      FileSystemFileHandle.prototype.createWritable = async function (...a) {
        if (this.name === 'narration.md' && window.__holdNarr) await new Promise((r) => { window.__nGate = r; });
        return orig.apply(this, a);
      };
    });
    const ta = page.locator('#dev-narr .dev-turn textarea').first();
    await ta.fill('保存する入力（アプリ）');
    await page.click('#dev-narr .dv-foot button.dv-pri');
    await page.waitForFunction(() => !!window.__nGate);
    await ta.fill('保存する入力（アプリ）、その後の入力');
    await page.locator('#dev-narr .dev-head .dv-t').click();
    n = await loads();
    await page.evaluate(() => { window.__holdNarr = false; window.__nGate(); });
    f = await waitLoads(n);
    await page.waitForFunction(() => !document.querySelector('#dev-narr .dv-foot button.dv-pri').disabled);
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ ui: window.__APP_TEST.ui(), inert: document.getElementById('preview').inert, v: document.querySelector('#dev-narr .dev-turn textarea').value }));
    ok(st.ui.narrDirty && st.ui.editing && st.inert && st.v === '保存する入力（アプリ）、その後の入力' && (await opfs.read('narration.md')).includes('保存する入力（アプリ）') && !(await opfs.read('narration.md')).includes('その後の入力'),
      'narration: typing again before the save finishes keeps the drawer dirty and the newer input, and the preview stays inert ' + JSON.stringify({ dirty: st.ui.narrDirty, inert: st.inert, v: st.v }));
    await page.evaluate(() => { FileSystemFileHandle.prototype.createWritable = window.__origCW; });
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    await page.waitForFunction(() => !window.__APP_TEST.ui().narrDirty);
    ok(await page.evaluate(() => !document.getElementById('preview').inert) && (await opfs.read('narration.md')).includes('保存する入力（アプリ）、その後の入力'), 'narration: the next save stores the newer input and the preview takes input again');
  }
  ok(await page.isVisible('#dev-narr'), 'narration: drawer stays open after reload');
  // 外で変わった後の保存は 409（引き出しに出る）
  await page.locator('#dev-narr .dev-turn textarea').first().fill('書きかけ');
  n = await loads();
  const narrExt = narr1.replace('足した発言です。', '外で直した発言です。');
  await opfs.write('narration.md', narrExt);
  f = await waitLoads(n, 10000);
  await page.press('#dev-narr .dev-turn textarea >> nth=0', 'Meta+Enter');
  await page.waitForSelector('#dev-narr .dev-msg.dv-err');
  ok(/口述原稿が変わっています/.test(await page.textContent('#dev-narr .dev-msg')) && (await opfs.read('narration.md')) === narrExt, 'narration: stale revision is rejected (409), file untouched');
  n = await loads();
  await page.click('#dev-narr .dev-msg button');
  f = await waitLoads(n);
  await page.waitForFunction(() => [...document.querySelectorAll('#dev-narr .dev-turn textarea')].some((t) => t.value === '外で直した発言です。'));
  ok(true, 'narration: reload after the conflict shows the current text');
  await page.click('#b-narr');

  // ---------------------------------------------------------------- 5. コメント（Alt+クリック）
  const target = f.locator('#stage .slide.active h2');
  // 直前に口述原稿の板を閉じたので、枠が広がり、デッキが舞台を合わせ直す。合わせ直しが終わる前に測ると、押す点（Playwright は見出しが
  // 止まってから押す）と測った点がずれる（遅い CI で起きた）。舞台が枠に合った大きさで、2 コマ続けて動かなくなるまで待つ
  await f.waitForFunction(() => new Promise((res) => {
    const s0 = document.getElementById('stage').getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = document.getElementById('stage').getBoundingClientRect(), k = Math.min(innerWidth / 1280, innerHeight / 720);
      res(Math.abs(s.width - 1280 * k) < 0.5 && s.left === s0.left && s.top === s0.top && s.width === s0.width);
    }));
  }), null, { timeout: 10000 });
  const cwant = await target.evaluate((el) => {
    const r = el.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
    return { x: (r.left + 20 - s.left) * 1280 / s.width, y: (r.top + r.height / 2 - s.top) * 720 / s.height, h: r.height, unit: 1280 / s.width };
  });
  await target.click({ modifiers: ['Alt'], position: { x: 20, y: cwant.h / 2 } });
  await page.waitForSelector('#dev-comment textarea');
  await page.fill('#dev-comment textarea', 'この見出しを短く');
  await shot(page, 'comment.png');
  const lay2 = await trustedLayout(page, 'preview');
  ok(lay2.outside && lay2.ids.includes('dev-comment') && lay2.inert === true, 'comment: the note box is in the trusted side panel, the preview is inert ' + JSON.stringify(lay2));
  await page.press('#dev-comment textarea', 'Meta+Enter');
  await page.waitForTimeout(400);
  ok((await trustedLayout(page, 'preview')).inert === false, 'comment: the preview takes clicks again after the note box closes');
  const comments = JSON.parse(await opfs.read('comments.json') || '[]');
  ok(comments.length === 1 && comments[0].comment === 'この見出しを短く' && comments[0].status === 'open' && comments[0].key === '何を最小化するか:0', 'comment: comments.json written');
  // 許す差：画面の 1 px（押す点は画面の px に丸められる。枠が小さいとスライドの座標で 1 を超える）と、点の 0.1 への丸め
  const ctol = cwant.unit + 0.1;
  ok(comments[0].pin && Math.abs(comments[0].pin.x - cwant.x) < ctol && Math.abs(comments[0].pin.y - cwant.y) < ctol, 'comment: the clicked point is kept in slide coordinates ' + JSON.stringify({ pin: comments[0].pin, cwant }));
  // 点の形が違う・範囲の外（アプリの devapi.js も開発サーバーと同じ規則）
  const appPins = [];
  for (const pin of [{ x: '1', y: 2 }, { x: -50, y: 9999 }, { x: 3.21, y: 4, z: 1 }]) appPins.push((await page.evaluate((pin) => window.__APP_TEST.api('POST', '/__dev/comment', { key: '何を最小化するか:0', comment: 'pin test', pin }), pin)).pin ?? null);
  ok(JSON.stringify(appPins) === JSON.stringify([null, { x: 0, y: 720 }, { x: 3.2, y: 4 }]), 'comment: forged or out-of-range points are dropped or clamped in the app too ' + JSON.stringify(appPins));
  for (const c of JSON.parse(await opfs.read('comments.json')).slice(1)) await page.evaluate((id) => window.__APP_TEST.api('POST', '/__dev/comment/resolve', { id }), c.id);
  await f.evaluate(() => DECK.go(0, 0, false));
  await page.click('#b-comments');
  await page.waitForSelector('#dev-comments .dev-c');
  ok((await page.textContent('#dev-comments')).includes('この見出しを短く'), 'comment: listed in the comments panel');
  ok(await page.locator('#dev-comments-volatile').count() === 0, 'comment: a working folder shows no “not saved” notice');
  ok((await page.evaluate(() => window.__APP_TEST.ui().pins)) === 0, 'comment: no pin is drawn on another slide');
  await page.click('#dev-comments .dev-c');
  // 移った知らせ（deck-pos）が届いて印が光るまで待つ（決まった時間では、遅い CI で印がまだない・前の段階の位置のことがある）
  await f.waitForFunction(() => DECK.state().key === '何を最小化するか:0', null, { timeout: 10000 });
  await page.waitForFunction(() => !!document.querySelector('#dev-pins .dev-pin.dv-flash'), null, { timeout: 10000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // 枠の大きさの変化（ResizeObserver）で描き直した後
  const appPin = await page.evaluate(() => { const e = document.querySelector('#dev-pins .dev-pin'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, flash: e.classList.contains('dv-flash') }; });
  const appWant = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { l: r.left, t: r.top }; });
  const hAt = await f.evaluate((p) => { const s = document.getElementById('stage').getBoundingClientRect(); return { x: s.left + p.x * s.width / 1280, y: s.top + p.y * s.height / 720 }; }, comments[0].pin);
  ok((await f.evaluate(() => DECK.state().key)) === '何を最小化するか:0' && appPin && appPin.flash && Math.abs(appPin.x - appWant.l - hAt.x) < 1.5 && Math.abs(appPin.y - appWant.t - hAt.y) < 1.5,
    'comment: clicking it in the list goes to its step and flashes the marker on the clicked spot ' + JSON.stringify({ appPin, appWant, hAt }));
  await shot(page, 'comment-pin.png');
  await page.click('#dev-comments .dev-c button');
  await page.waitForTimeout(300);
  ok(JSON.parse(await opfs.read('comments.json'))[0].status === 'resolved', 'comment: resolved from the panel');
  await page.click('#b-comments');
  // ---------------------------------------------------------------- 6. 外での変更（Claude Code など）
  await f.evaluate(() => DECK.go(4, 1, false));
  n = await loads();
  const deck2 = (await opfs.read('deck.html')).replace('<h2>学習率と収束</h2>', '<h2>学習率と収束（外で変更）</h2>');
  ok(deck2.includes('外で変更'), 'external: test edit applies');
  await opfs.write('deck.html', deck2);
  f = await waitLoads(n, 10000);
  ok(await f.evaluate(() => document.querySelector('#stage .slide.active h2').textContent.includes('外で変更')), 'external: change detected, rebuilt and reloaded');
  const st2 = await f.evaluate(() => DECK.state());
  ok(st2.slide === 5 && st2.step === 1, `external: slide and step kept (${st2.slide}:${st2.step})`);

  // 組み立ての失敗 → 重ね表示、直すと消える
  await opfs.write('deck.html', deck2.replace(/<head>[\s\S]*?<\/head>/, ''));
  await page.waitForSelector('#errbox:not([hidden])', { timeout: 10000 });
  ok((await page.textContent('#errtext')).includes('<head>'), 'error: build failure shown over the preview');
  await shot(page, 'error.png');
  n = await loads();
  await opfs.write('deck.html', deck2);
  await page.waitForSelector('#errbox[hidden]', { state: 'attached', timeout: 10000 });
  ok(await page.isHidden('#errbox'), 'error: overlay disappears after the fix');

  // ---------------------------------------------------------------- 7. 品質チェック
  await page.click('#b-check');
  await page.waitForSelector('#panel-body .sum', { timeout: 20000 });
  const sum = await page.textContent('#panel-body .sum');
  ok(/エラー \d+ · 警告 \d+/.test(sum), 'check: quality check summary shown: ' + sum);
  await shot(page, 'check.png');
  await clickUntil(page, '#panel-close', () => page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));

  // ---------------------------------------------------------------- 8. 書き出し
  await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('export.html', { create: true }); });
  await menuClick('#b-export');
  let exp = '';
  for (let i = 0; i < 200 && exp.length < 1000; i++) { await page.waitForTimeout(100); exp = (await opfs.read('export.html')) || ''; }
  ok(exp.startsWith('<!DOCTYPE html>') && exp.includes('id="deck-narration"') && !exp.includes('data-src=') && !exp.includes('edit-hint'), `export: single HTML without editing hooks (${(exp.length / 1024).toFixed(0)} KB)`);
  const ep = await ctx.newPage();
  watch(ep, 'export');
  await ep.setContent(exp, { waitUntil: 'load' });
  await ep.waitForFunction(() => window.DECK && DECK.ready);
  ok(await ep.evaluate(() => DECK.slides.length) === 6, 'export: exported HTML runs on its own');
  const expName = await page.evaluate(() => window.__APP_TEST.lastSaveName);
  ok(titleOf(exp) && expName === exportName(titleOf(exp), 'deck', '.html') && expName !== 'deck.html', `export: the default file name is the deck title (${expName})`);
  await ep.close();

  // ---------------------------------------------------------------- 8b. 授業の部屋を付けて配る（tools/test-app-live.mjs）
  await testAppLive({ page, ctx, BASE, ok, opfs, menuClick, frame: f, shot });

  // ---------------------------------------------------------------- 9. 発表者ビュー
  await f.evaluate(() => DECK.go(1, 0, false));
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('#b-presenter')]);
  watch(pop, 'presenter');
  const pf = async () => { for (let i = 0; i < 200; i++) { const x = pop.frames().find((fr) => fr.parentFrame() === pop.mainFrame()); try { if (x && await x.evaluate(() => !!document.getElementById('pv'))) return x; } catch { /* 読み込み中 */ } await pop.waitForTimeout(100); } throw new Error('presenter frame not ready'); };
  const pv = await pf();
  await pop.waitForTimeout(800);
  ok((await pv.textContent('#pv-pos')).includes('2'), 'presenter: shows the current slide: ' + (await pv.textContent('#pv-pos')));
  ok((await pv.textContent('#pv-text')).length > 5, 'presenter: notes shown');
  const before = await f.evaluate(() => DECK.state());
  await pv.click('#pv-notes');
  await pop.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  const after = await f.evaluate(() => DECK.state());
  ok(after.slide * 100 + after.step > before.slide * 100 + before.step, `presenter: → in the presenter view moves the main deck (${before.slide}:${before.step} → ${after.slide}:${after.step})`);
  const nested = pv.childFrames();
  ok(nested.length === 2, 'presenter: current and next views are loaded (srcdoc)');
  await shot(pop, 'presenter.png');
  await pop.close();
  await page.bringToFront();

  // ---------------------------------------------------------------- 10. 部品・データ・マクロのあるデッキ（examples/tmlr2026-calibration）
  {
    const T = path.join(ROOT, 'examples/tmlr2026-calibration');
    const tf = {};
    const addf = (rel) => { tf[rel] = fs.readFileSync(path.join(T, rel), 'utf8'); };
    for (const rel of ['deck.html', 'narration.md', 'macros.tex']) addf(rel);
    for (const d of fs.readdirSync(path.join(T, 'components'))) addf(`components/${d}/index.js`);
    for (const d of fs.readdirSync(path.join(T, 'data'))) addf(`data/${d}`);
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('tmlr2026-calibration', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('tmlr2026-calibration', { create: true });
      for (const [rel, text] of Object.entries(files)) {
        const parts = rel.split('/'); const name = parts.pop(); let x = d;
        for (const p of parts) x = await x.getDirectoryHandle(p, { create: true });
        const w = await (await x.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
      }
      window.__tmlr = d;
    }, tf);
    const n0 = await loads();
    // 原稿のフォルダの部品（そのデッキのコード）：プレビューを始める前に知らせる
    const op = page.evaluate(() => window.__APP_TEST_OPEN(window.__tmlr));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-lead')).includes('components/') && (await loads()) === n0, 'tmlr: deck-local components → asked before the preview starts (nothing loaded yet)');
    ok(await previewBlank(), 'tmlr: the preview is blank behind the question (the previous deck is gone, nothing of the new deck rendered or ran)');
    await shot(page, 'code-consent.png');
    await clickDlg(page, '#dlg-run');
    ok(await op === true, 'tmlr: opened after "Start the preview"');
    await waitLoads(n0);
    // 部品の出どころの注釈（原稿のフォルダの場所）だけが違う
    const norm = (h) => h.replace(/\/\/ ---- (m-[a-z0-9-]+) \([^)]*\)/g, '// ---- $1');
    const a = norm(await page.evaluate(() => window.__APP_TEST.build({ dev: false })));
    const b = norm(build(path.join(T, 'deck.html'), { subset: false, noAudio: true }).html);
    ok(a === b, `tmlr: browser build equals Node build (subset off, no audio) (${(a.length / 1024).toFixed(0)} KB)`);
    const terr = await page.evaluate(() => window.__APP_TEST.state().error);
    ok(!terr, 'tmlr: no build error' + (terr ? ': ' + terr.slice(0, 300) : ''));
  }

  // ---------------------------------------------------------------- 10b. 持ち運べる 1 ファイル（フォルダなし）
  {
    // OPFS の pf/ にファイルを置き、ハンドルを window.__pf[名前] に（保存はこのハンドルに上書きする）
    const putFile = (name, buf) => page.evaluate(async ([name, b64]) => {
      const root = await navigator.storage.getDirectory();
      const d = await root.getDirectoryHandle('pf', { create: true });
      const h = await d.getFileHandle(name, { create: true });
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await h.createWritable(); await w.write(u); await w.close();
      (window.__pf ||= {})[name] = h;
    }, [name, Buffer.from(buf).toString('base64')]);
    const getFile = async (name) => Buffer.from(await page.evaluate(async (name) => {
      const u = new Uint8Array(await (await window.__pf[name].getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s);
    }, name), 'base64');
    // 空の OPFS のフォルダ（フォルダを選ぶ画面の代わり）
    const emptyDir = (name) => page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(name, { create: true });
      (window.__dirs ||= {})[name] = d;
      window.showDirectoryPicker = async () => d;
    }, name);
    const dirFiles = (name) => page.evaluate(async (name) => {
      const out = {};
      async function go(d, pre) { for await (const [k, h] of d.entries()) { if (h.kind === 'directory') await go(h, pre + k + '/'); else { const u = new Uint8Array(await (await h.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[pre + k] = btoa(s); } } }
      await go(window.__dirs[name], ''); return out;
    }, name);
    // 開く。独自のコードを含むファイルなら、プレビューを始める前の確かめが出る（run：始める／取り消す）
    const openFile = async (name, run = true) => {
      const n0 = await loads();
      const p = page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), name);
      const asked = await Promise.race([p.then(() => false), page.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 }).then(() => true)]);
      let blank = null;
      if (asked) { if ((await loads()) !== n0) throw new Error('preview loaded before the code notice'); blank = await previewBlank(); await clickDlg(page, run ? '#dlg-run' : '#dlg-cancel'); }
      return { r: await p, n0, asked, blank };
    };
    const pstate = () => page.evaluate(() => window.__APP_TEST.state());
    const dlgOpen = () => page.evaluate(() => document.getElementById('dlg').open);
    const MINF = 'min' + FORMAT.FILE_EXT;

    // 印のスクリプトのある文書：取り出しの間、アプリのページでも Worker でも動かない
    await putFile('canary' + FORMAT.FILE_EXT, fs.readFileSync(fixture('canary-script').file));
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: canary not set before opening');
    let o = await openFile('canary' + FORMAT.FILE_EXT, false);
    ok(o.asked && o.blank && o.r === false && (await pstate()).kind === 'folder', 'portable: a file with its own code asks before any of it runs (the preview is blank behind the question); Cancel → not opened (the folder stays)');
    await waitLoads(o.n0);
    ok(await deckFrame().evaluate(() => DECK.slides.length) > 0, 'portable: after Cancel the open folder\'s preview comes back');
    o = await openFile('canary' + FORMAT.FILE_EXT);
    ok(o.asked && o.blank && o.r === true, 'portable: canary fixture opens after "Start the preview" (blank preview while asking)');
    await waitLoads(o.n0);
    ok(await page.evaluate(() => window.__portableCanary) === undefined, 'portable: the canary script never ran in the app page (import reads bytes in a worker)');
    ok(await page.evaluate(() => window.__APP_TEST.workerProbe('__portableCanary')) === null, 'portable: the canary script never ran in the reader worker');
    ok((await pstate()).portable.profile === 'extended' && await page.isVisible('#notice-extended'), 'portable: a file with its own code (extended profile) shows the notice');
    ok((await page.textContent('#notice-extended')).includes('独自のコード'), 'portable: extended notice text (ja)');

    // 独自の部品（原稿のフォルダの部品）のある文書も同じ知らせ
    await putFile('ext' + FORMAT.FILE_EXT, fs.readFileSync(fixture('portable-extended').file));
    o = await openFile('ext' + FORMAT.FILE_EXT);
    ok(o.asked, 'portable: embedded component → asked before the preview starts');
    await waitLoads(o.n0);
    ok((await pstate()).portable.profile === 'extended' && await page.isVisible('#notice-extended'), 'portable: embedded component → extended notice');

    // examples/minimal の 1 ファイルを開く
    await putFile(MINF, pmin.html);
    o = await openFile(MINF);
    ok(o.r === true, 'portable: opened the minimal portable file without a folder');
    f = await waitLoads(o.n0);
    let ps = await pstate();
    ok(ps.kind === 'memory' && ps.portable.docId === pmin.index.docId && !ps.error, `portable: in-memory workspace, docId ${ps.portable.docId}`);
    ok(await f.evaluate(() => DECK.slides.length) === 6, 'portable: slides render in the preview');
    await previewAudioPlays(f, 'preview audio (single file in memory)');
    await presenterAudioPlays(pmin.html, 'presenter audio');
    ok(ps.portable.profile === 'core' && await page.isHidden('#notice-extended'), 'portable: core profile → no code notice');
    // コメントの欄：1 ファイルではコメントは保存されない（閉じると消える）と知らせる
    await page.click('#b-comments');
    await page.waitForSelector('#dev-comments');
    ok((await page.textContent('#dev-comments-volatile')) === '1 ファイルではコメントは保存されません（閉じると消えます）。残すなら作業フォルダで', 'portable: the comments pane says notes are not saved in a single file');
    await page.click('#b-comments');
    // 作業フォルダから書き出した写し（exportedFrom、format spec §3.1）：ここで直してもフォルダに入らないと知らせ、「作業フォルダに書き出す…」のボタンを出す（編集は断らない。下で編集して保存する）
    ok(pmin.index.exportedFrom && pmin.index.exportedFrom.sourceSha256 === pmin.index.sourceSha256, 'exportedFrom: the CLI folder export carries the marker with its own sourceSha256');
    ok(await page.isVisible('#notice-exported') && (await page.textContent('#notice-exported')).startsWith('フォルダから書き出した写しです。ここで直した分は、フォルダには入りません。フォルダに戻すには『作業フォルダに書き出す』を使ってください。')
      && !(await page.textContent('#notice-exported')).includes('書き出したあと') && await page.isVisible('#notice-exported #b-exported-unpack') && (await page.textContent('#b-exported-unpack')) === '作業フォルダに書き出す…', 'exportedFrom: opening the exported copy shows the notice (ja) with the "Export working folder…" button (the menu item\'s name); not edited since export');
    await shot(page, 'portable-exported-notice.png');
    ok(await page.isVisible('#b-save') && await page.isVisible('#b-savemenu') && await page.isHidden('#m-save'), 'portable: toolbar shows Save and its menu button');
    await clickMenuOpen(page, '#b-savemenu');
    ok(await page.isVisible('#b-savenew') && await page.isVisible('#b-saveas'), 'portable: the Save menu has Save as new lesson / Save a copy');
    await shot(page, 'portable-save-menu.png');
    await page.keyboard.press('Escape');
    await clickMenuOpen(page, '#b-exportmenu');
    ok(await page.isVisible('#b-unpack') && await page.isHidden('#b-export') && await page.isHidden('#b-export-portable') && await page.isHidden('#m-save'), 'portable: the Export menu has Export folder, not the folder exports (and opening it closed the Save menu)');
    await page.keyboard.press('Escape');
    ok(await page.isHidden('#m-export'), 'menu: Esc closes the Export menu');
    ok(ps.portable.stale.length === 0 && ps.portable.readOnly === null, 'portable: no stale audio, editable');

    // 最初の編集の前に権利を見せる
    await f.evaluate(() => DECK.go(2, 3, false));
    await page.click('#b-edit');
    await page.waitForSelector('#dlg[open]');
    const rights = await page.textContent('#rights-list');
    ok(rights.includes('CC-BY-4.0') && rights.includes('© 2026 Test Author') && rights.includes('Test Author, Minimal lesson'), 'rights: license, copyright and attribution shown before the first edit');
    ok(!(await page.$('#rights-nd')) && !(await page.isDisabled('#dlg-ok')), 'rights: CC BY needs no extra confirmation');
    await shot(page, 'portable-rights.png');
    await clickDlg(page, '#dlg-ok');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
    ok((await pstate()).portable.rightsOk, 'rights: accepted, edit mode on');
    await page.click('#b-edit');

    // 段 A：口述原稿だけを直して保存 → 組み直さない。決まった場所の外は 1 バイトも変わらず、新しい字は字の補いで
    await f.evaluate(() => DECK.go(1, 0, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('まず、何を最小化するのかを確かめます。蒼穹の下で考えます。');   // 「蒼」「穹」は minimal が埋め込む字にない（fonts/*.ttf がなく @fontsource の分割ファイルを丸ごと埋め込んでも。「鬱」は入ってしまう。test-tier-a と同じ）
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    await page.click('#b-narr');
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    ok(!(await dlgOpen()), 'tier A: narration-only change saves without the rebuild warning');
    const aBuf = await getFile(MINF);
    let ps0 = await pstate();
    ok(ps0.portable.lastTier === 'A' && ps0.portable.lastTierA && ps0.portable.lastTierA.narration.join() === '何を最小化するか:0', 'tier A: saved without rebuilding (only the edited step)');
    try { regionDiff(pmin.html, aBuf.toString(), { narration: ['何を最小化するか:0'] }); ok(true, 'tier A: every byte outside the §7.2 regions is unchanged (region-aware diff)'); }
    catch (e) { ok(false, 'tier A: region-aware diff: ' + e.message.slice(0, 300)); }
    ok(aBuf.toString().includes(`id="${FORMAT.FONT_SUPPLEMENT_PREFIX}0"`) && ps0.portable.lastTierA.supplement && [...'蒼穹'].every((c) => ps0.portable.lastTierA.supplement.chars.includes(c)), 'tier A: a font supplement for the new glyphs (fetched from the app\'s own font files)');
    const aRead = await readPortable(new Uint8Array(aBuf));
    ok(aRead.sourceMatches && aRead.warnings.length === 0 && aRead.docId === pmin.index.docId && !aRead.index.metadata.derivedFrom, 'tier A: the saved file reads back cleanly, same docId, no derivedFrom');
    ok(JSON.stringify(aRead.index.exportedFrom) === JSON.stringify(pmin.index.exportedFrom) && aRead.index.sourceSha256 !== aRead.index.exportedFrom.sourceSha256, 'exportedFrom: the tier A save keeps the marker unchanged (the copy\'s sourceSha256 now differs from it)');
    ok(await page.isVisible('#notice-exported') && (await page.textContent('#notice-exported')).includes('ここで直した分は、フォルダには入りません。') && (await page.textContent('#notice-exported')).includes('書き出したあと、この写しで直した所があります。'), 'exportedFrom: after the save the notice says the copy was edited since export');
    fs.writeFileSync(path.join(PW, 'exported-edited' + FORMAT.FILE_EXT), aBuf);   // 英語の画面（下の 11.）で開く
    ok(ps0.portable.stale.includes('何を最小化するか:0') && JSON.stringify(aRead.index.audio['何を最小化するか:0']) === JSON.stringify(pmin.index.audio['何を最小化するか:0']), 'tier A: the edited step\'s audio is kept as is and shown as stale');
    await shot(page, 'portable-tier-a-saved.png');
    await f.evaluate(() => DECK.go(2, 3, false));
    await page.click('#b-edit');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));

    // 文字を直す（いつもの編集の画面）
    const pli = f.locator('#stage .slide.active li[data-step="2"]');
    await pli.dblclick();
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    await page.locator('#dev-editor textarea').fill('\\(\\eta>0\\)：<b>学習率</b>（1 ファイルで編集）');
    n = await loads();
    await page.click('#dev-editor button.dv-pri');   // 保存（⌘+Enter はフォルダの試験で確かめた）
    f = await waitLoads(n);
    const wsFiles = async () => Object.fromEntries(Object.entries(await page.evaluate(() => window.__APP_TEST.files())).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
    let mem = await wsFiles();
    ok(mem['deck.html'].toString().includes('（1 ファイルで編集）'), 'portable edit: deck.html changed in memory');
    ok(await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'portable edit: preview shows the new text');
    ok((await pstate()).portable.dirty && (await page.textContent('#deckname')).startsWith('●'), 'portable edit: marked as unsaved');
    ok(Object.keys(mem).some((k) => k.startsWith('.cache/edits/')), 'portable edit: backup kept in memory');
    await page.click('#b-edit');

    // 口述原稿を直す → その段階の音声は古い（消さない）
    await f.evaluate(() => DECK.go(1, 0, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('1 ファイルで書き直した口述原稿です。');
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    mem = await wsFiles();
    ok(mem['narration.md'].toString().includes('1 ファイルで書き直した口述原稿です。'), 'portable narration: narration.md changed in memory');
    ps = await pstate();
    ok(ps.portable.stale.length === 1 && ps.portable.stale[0] === '何を最小化するか:0' && ps.warn.some((w) => w.includes('何を最小化するか:0')), `portable narration: the edited step is shown as stale (${ps.portable.stale.join(', ')})`);
    await page.click('#b-narr');

    // 保存：スライドを直したので段 B（組み直す）。保存の前に、編集していないスライドの見え方が変わりうることを知らせる
    await page.click('#b-save');
    await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
    ok((await page.textContent('#tier-b-warn')).includes('編集していないスライドも、見え方が変わることがあります'), 'tier B: warns before saving that slides you did not edit may look different');
    ok((await page.textContent('#dlg-body')).includes('スライドの原稿を直したので'), 'tier B: says why it cannot save without rebuilding');
    await shot(page, 'portable-tier-b-warning.png');
    await clickDlg(page, '#dlg-cancel');
    await page.waitForTimeout(200);
    ok((await pstate()).portable.dirty, 'tier B: Cancel → not saved');
    await page.click('#b-save');
    await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
    await clickDlg(page, '#dlg-rebuild');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    ok((await pstate()).portable.lastTier === 'B', 'tier B: rebuilt and saved');
    const savedBuf = await getFile(MINF);
    const saved = await readPortable(new Uint8Array(savedBuf));
    ok(savedBuf.toString() === (await page.evaluate(() => window.__APP_TEST.saved())), 'save: the file handle was overwritten with the saved document');
    ok(saved.docId === pmin.index.docId && saved.deckMeta.docId === pmin.index.docId, 'save: docId unchanged');
    ok(saved.sourceMatches && saved.warnings.length === 0, 'save: the saved file reads back cleanly (hashes, sourceSha256)' + (saved.warnings.length ? ': ' + saved.warnings.join('; ') : ''));
    ok(new TextDecoder().decode(saved.files['deck.html']).includes('（1 ファイルで編集）') && new TextDecoder().decode(saved.files['narration.md']).includes('1 ファイルで書き直した'), 'save: edits are in the saved source');
    const sameAudio = Object.values(pmin.index.audio).every((a) => saved.index.files[a.file] && saved.index.blobs[saved.index.files[a.file]].sha256 === pmin.index.blobs[pmin.index.files[a.file]].sha256);
    ok(sameAudio && Object.keys(saved.index.audio).length === Object.keys(pmin.index.audio).length, 'save: unchanged audio blobs keep the same sha256');
    const mk = '何を最小化するか:0';
    ok(saved.index.audio[mk].inputHash === pmin.index.audio[mk].inputHash && await isStale(saved.index.audio[mk], parseNarration(new TextDecoder().decode(saved.files['narration.md'])).find((x) => `${x.slideKey}:${x.stepKey}` === mk)), 'save: the edited step keeps its old inputHash (stale, audio not deleted)');
    ok(['license', 'copyright', 'attribution', 'creators'].every((k) => JSON.stringify(saved.index.metadata[k]) === JSON.stringify(pmin.index.metadata[k])), 'save: license, copyright, attribution and creators kept');
    ok(!saved.index.metadata.derivedFrom, 'save: same docId → no derivedFrom');
    ok(JSON.stringify(saved.index.exportedFrom) === JSON.stringify(pmin.index.exportedFrom), 'exportedFrom: the tier B save (rebuild) keeps the marker unchanged');
    ok(!Object.keys(saved.files).some((k) => /^\.cache|comments\.json/.test(k)), 'save: backups and notes are not in the file');
    // 展開したフォルダ（npm run portable -- unpack）がメモリの作業場所と同じ
    fs.writeFileSync(path.join(PW, 'saved' + FORMAT.FILE_EXT), savedBuf);
    const U = path.join(PW, 'saved-unpacked');
    const u = await unpack(path.join(PW, 'saved' + FORMAT.FILE_EXT), U);
    mem = await wsFiles();
    const memArchive = Object.keys(mem).filter((k) => !/^\.cache\//.test(k) && k !== 'comments.json').sort();
    ok(JSON.stringify(u.written.slice().sort()) === JSON.stringify(memArchive) && u.written.every((k) => fs.readFileSync(path.join(U, k)).equals(mem[k])), `save: unpacked folder matches the in-memory workspace (${u.written.length} files)`);

    // 新しい教材として保存：新しい docId と derivedFrom（元の docId と sourceSha256）。権利の表示と作り手はそのまま。変更がなければ段 A
    await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('pf', { create: true }); window.__APP_TEST.saveHandle = await d.getFileHandle('new-lesson.html', { create: true }); });
    await menuClick('#b-savenew', page, '#b-savemenu');
    await page.waitForFunction((id) => window.__APP_TEST.state().portable.docId !== id, pmin.index.docId, { timeout: 30000 });
    const nl = await readPortable(new Uint8Array(Buffer.from(await page.evaluate(async () => { const u = new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }), 'base64')));
    ok(nl.docId !== pmin.index.docId && nl.deckMeta.docId === nl.docId && JSON.parse(new TextDecoder().decode(nl.files[FORMAT.CONFIG_FILE])).docId === nl.docId, `save as new lesson: new docId ${nl.docId} (index, deck-meta and ${FORMAT.CONFIG_FILE})`);
    ok(JSON.stringify(nl.index.metadata.derivedFrom) === JSON.stringify({ docId: pmin.index.docId, sourceSha256: saved.index.sourceSha256 }), 'save as new lesson: derivedFrom = the original docId and sourceSha256');
    ok(['license', 'copyright', 'attribution', 'creators'].every((k) => JSON.stringify(nl.index.metadata[k]) === JSON.stringify(pmin.index.metadata[k])), 'save as new lesson: copyright, attribution and creators kept');
    ok((await pstate()).portable.lastTier === 'A' && nl.sourceMatches, 'save as new lesson: no other change → saved without rebuilding');
    // 新しい docId の教材は写しではない（exportedFrom、§3.1）：印を外し、知らせも消える。開き直しても知らせなし
    ok(saved.index.exportedFrom && nl.index.exportedFrom === undefined && !(await page.isVisible('#notice-exported')), 'exportedFrom: Save as new lesson (tier A, new docId) drops the marker and the notice');
    await putFile('new-lesson' + FORMAT.FILE_EXT, Buffer.from(await page.evaluate(async () => { const u = new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }), 'base64'));
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    o = await openFile('new-lesson' + FORMAT.FILE_EXT);
    await waitLoads(o.n0);
    ok(o.r === true && (await pstate()).portable.docId === nl.docId && !(await page.isVisible('#notice-exported')), 'exportedFrom: reopening the new lesson shows no exported-copy notice');

    // 開き直す
    o = await openFile(MINF);
    f = await waitLoads(o.n0);
    await f.evaluate(() => DECK.go(2, 3, false));
    ok(o.r === true && await f.evaluate(() => document.querySelector('#stage .slide.active li[data-step="2"]').textContent.includes('1 ファイルで編集')), 'reopen: the saved edit is there');
    ok(!(await pstate()).portable.rightsOk, 'reopen: the rights prompt comes again for the newly opened file');

    // フォルダに書き出す（空のフォルダ）→ 中身は unpack と同じ。空でないフォルダは断る
    await emptyDir('unpacked');
    await menuClick('#b-unpack');
    await page.waitForFunction(() => document.getElementById('st-msg').textContent.includes('unpacked'), null, { timeout: 15000 });
    const out1 = await dirFiles('unpacked');
    ok(JSON.stringify(Object.keys(out1).sort()) === JSON.stringify(u.written.slice().sort()) && u.written.every((k) => Buffer.from(out1[k], 'base64').equals(fs.readFileSync(path.join(U, k)))), `export folder: same files and bytes as npm run portable -- unpack (${Object.keys(out1).length})`);
    await menuClick('#b-unpack');
    await page.waitForSelector('#toast.show.bad');
    ok((await page.textContent('#toast')).includes('空ではありません') && Object.keys(await dirFiles('unpacked')).length === Object.keys(out1).length, 'export folder: a non-empty folder is refused');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });

    // 書き出したフォルダを開き、持ち運べる 1 ファイルに書き出す（フォルダの「1 ファイルを書き出す」）→ 同じ文書
    n = await loads();
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dirs.unpacked)) === true, 'export folder: the exported folder opens as a folder');
    await previewAudioPlays(await waitLoads(n), 'preview audio (folder)');
    await clickMenuOpen(page, '#b-exportmenu');
    ok(await page.isVisible('#b-export-portable') && await page.isHidden('#b-save') && await page.isHidden('#b-savenew'), 'folder: the Export menu has Export portable file; Save is hidden');
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__dirs.unpacked.getFileHandle('re-exported.html', { create: true }); });
    await menuClick('#b-export-portable');
    let rx = '';
    for (let i = 0; i < 300 && rx.length < 1000; i++) { await page.waitForTimeout(100); rx = Buffer.from((await dirFiles('unpacked'))['re-exported.html'] || '', 'base64').toString(); }
    const rxr = await readPortable(rx);
    const rxName = await page.evaluate(() => window.__APP_TEST.lastSaveName);
    ok(rxName === exportName(rxr.index.metadata.title, 'deck', FORMAT.FILE_EXT) && rxName !== 'deck' + FORMAT.FILE_EXT, `export portable (folder): the default file name is the deck title (${rxName})`);
    ok(rxr.docId === pmin.index.docId && rxr.index.sourceSha256 === saved.index.sourceSha256, 'export portable (folder): same docId and sourceSha256 as the saved file');
    // 作業フォルダからの書き出しは新しい印（そのフォルダの sourceSha256）。保存した写しは書き出したときの印のまま。違いは索引だけ
    const noIx = (h) => h.replace(new RegExp(`<script type="[^"]*" id="${FORMAT.INDEX_ID}"[\\s\\S]*?</script>`), '');
    ok(JSON.stringify(rxr.index.exportedFrom) === JSON.stringify({ kind: 'folder', sourceSha256: rxr.index.sourceSha256 }) && JSON.stringify(saved.index.exportedFrom) === JSON.stringify(pmin.index.exportedFrom), 'exportedFrom: the editor\'s folder export writes a fresh marker (the unpacked folder is the master now)');
    { const { exportedFrom: _a, ...ra } = rxr.index, { exportedFrom: _b, ...sa } = saved.index;
      ok(noIx(rx) !== rx && noIx(rx) === noIx(savedBuf.toString()) && JSON.stringify(ra) === JSON.stringify(sa), 'export portable (folder): byte-identical to the file saved from memory (same editor build) except for the index member exportedFrom'); }
    ok(!Object.keys(out1).some((k) => Buffer.from(out1[k], 'base64').toString().includes('exportedFrom')), 'exportedFrom: the unpacked folder (Export folder) carries no marker');
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });

    // 改変を認めないライセンス：はっきり確認するまで編集できない。編集の口（プレビューからの書き込み）でも同じ
    await putFile('nd' + FORMAT.FILE_EXT, pnd.html);
    o = await openFile('nd' + FORMAT.FILE_EXT);
    f = await waitLoads(o.n0);
    // コメントは原稿の編集ではない（権利を聞かない）
    await f.locator('#stage .slide.active h1, #stage .slide.active h2').first().click({ modifiers: ['Alt'] });
    await page.waitForSelector('#dev-comment textarea');
    await page.fill('#dev-comment textarea', 'x');
    await page.press('#dev-comment textarea', 'Meta+Enter');
    await page.waitForSelector('#dev-comment', { state: 'detached' });
    ok(!(await dlgOpen()), 'rights: a note (comment) is not an edit and does not ask');
    // デッキで押した n（知らせ）でも、口述原稿を開く前に権利を見せる
    await f.locator('body').press('n');
    await page.waitForSelector('#dlg[open]');
    ok(await page.isVisible('#rights-nd') && (await page.textContent('#rights-nd')).includes('改変を認めていません'), 'rights: ND license → warning shown (also when n is pressed in the preview)');
    ok(await page.isDisabled('#dlg-ok'), 'rights: ND license → "Start editing" disabled until confirmed');
    await shot(page, 'portable-rights-nd.png');
    await clickDlg(page, '#dlg-cancel');
    await page.waitForTimeout(200);
    ok(!(await page.$('#dev-narr')) && !(await pstate()).portable.dirty, 'rights: declined → the drawer does not open, nothing changed');
    await page.click('#b-narr');
    await page.waitForSelector('#dlg[open]');
    await page.check('#dlg-confirm');
    ok(!(await page.isDisabled('#dlg-ok')), 'rights: confirmed → "Start editing" enabled');
    await clickDlg(page, '#dlg-ok');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    ok((await pstate()).portable.rightsOk, 'rights: ND license accepted after explicit confirmation');
    await page.click('#b-narr');

    // 段階の口述原稿をまるごと消して保存（段 A）→ その音声の記録と塊も消え、保存の知らせと警告の一覧に出る（§5.4）
    const rk = '何を最小化するか:3';
    ok(!!pnd.index.audio[rk], 'removed step: it had audio');
    await f.evaluate(() => DECK.go(1, 3, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    for (let i = 0; i < 10 && await page.locator('#dev-narr .dev-turn').count(); i++) await page.locator('#dev-narr .dev-turn').first().locator('button.dv-ghost').last().click();
    n = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    f = await waitLoads(n);
    await page.click('#b-narr');
    ok(!parseNarration((await wsFiles())['narration.md'].toString()).some((x) => `${x.slideKey}:${x.stepKey}` === rk), 'removed step: gone from narration.md');
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    const rps = await pstate();
    ok(rps.portable.lastTier === 'A' && rps.portable.lastTierA.audio.includes(rk), 'removed step: saved with tier A, its audio record changed');
    ok(rps.portable.saveWarnings.some((w) => w.includes(`"${rk}"`) && /removed/.test(w)) && rps.warn.some((w) => w.includes(`"${rk}"`) && /removed/.test(w)), `removed step: the warning is returned and in the warnings list (${JSON.stringify(rps.portable.saveWarnings)})`);
    ok((await page.textContent('#toast')).includes('保存の警告') && await page.isVisible('#b-warn'), 'removed step: the save notice says there are warnings');
    const rsaved = await readPortable(new Uint8Array(await getFile('nd' + FORMAT.FILE_EXT)));
    const rblob = pnd.index.files[pnd.index.audio[rk].file];
    const rshared = Object.entries(pnd.index.audio).some(([k, x]) => k !== rk && pnd.index.files[x.file] === rblob);
    ok(rsaved.sourceMatches && !rsaved.index.audio[rk] && (rshared || !rsaved.index.blobs[rblob]) && Object.keys(rsaved.index.audio).length === Object.keys(pnd.index.audio).length - 1, 'removed step: the saved file has no record or blob for it, the other audio is kept');

    // 断るファイル：理由を見せる。新しい major の版だけは原稿をフォルダに取り出せる
    for (const [name, code, extract] of [['path-traversal', 'bad-path', false], ['duplicate-member', 'duplicate-member', false], ['unknown-required-feature', 'unknown-feature', true], ['manifest-in-files', 'bad-path', false], ['future-major', 'unsupported-version', true]]) {
      await putFile(name + FORMAT.FILE_EXT, fs.readFileSync(fixture(name).file));
      const before = (await pstate()).portable.name;
      const p = page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), name + FORMAT.FILE_EXT);
      await page.waitForSelector('#dlg[open]');
      const tech = await page.textContent('#dlg pre.tech');
      ok(tech.includes(`[${code}]`) && (await page.textContent('#refuse-reason')).length > 10, `refuse: ${name} → [${code}] with a message`);
      ok(!!(await page.$('#dlg-extract')) === extract, `refuse: ${name} → ${extract ? 'offers' : 'does not offer'} "Export folder…"`);
      if (extract) {
        await emptyDir('extracted');
        await clickDlg(page, '#dlg-extract');
        ok(await p === false, `refuse: ${name} is not opened for editing`);
        await page.waitForFunction(() => document.getElementById('st-msg').textContent.includes('extracted'), null, { timeout: 15000 });
        const ex = await dirFiles('extracted');
        ok(!!ex['deck.html'] && !!ex['narration.md'] && !!ex['audio/manifest.json'], `refuse: ${name} → source extracted to an empty folder (${Object.keys(ex).length} files)`);
      } else {
        await clickDlg(page, '#dlg-ok');
        ok(await p === false, `refuse: ${name} is not opened`);
      }
      ok((await pstate()).portable.name === before, `refuse: ${name} → the open file stays open`);
    }

    // 知らない項目をどの深さにも持つ文書：段 A の保存でも段 B の保存でも残る（§7.1）
    {
      const UF = 'unknown' + FORMAT.FILE_EXT;
      await putFile(UF, fs.readFileSync(fixture('unknown-members-everywhere').file));
      o = await openFile(UF);
      f = await waitLoads(o.n0);
      const kept = (ix) => ix.futureMember && ix.futureMember.kept === true && ix.version.xPatch === 7 && ix.metadata.xAudienceNote === 'kept'
        && Object.values(ix.audio).every((a) => a.xTake && a.xTake.kept === true) && ix.extensions.chapters && ix.extensions.chapters.xNote === 'kept'
        && (ix.themes || []).every((t) => t.xRegistryUrl === 'kept');
      await page.click('#b-narr');
      await page.waitForSelector('#dlg[open] #dlg-ok');
      await clickDlg(page, '#dlg-ok');
      await page.waitForSelector('#dev-narr .dev-turn textarea');
      await page.locator('#dev-narr .dev-turn textarea').first().fill('知らない項目を残す試験です。');
      n = await loads();
      await page.click('#dev-narr .dv-foot button.dv-pri');
      f = await waitLoads(n);
      await page.click('#b-narr');
      await page.click('#b-save');
      await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
      const u1 = await readPortable(new Uint8Array(await getFile(UF)));
      ok((await pstate()).portable.lastTier === 'A' && kept(u1.index) && u1.sourceMatches, 'unknown members: kept at every level by a tier A save');
      // スライドを直す → 段 B（組み直し）でも残る
      await page.click('#b-edit');
      await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
      await f.locator('#stage .slide.active h1, #stage .slide.active h2').first().dblclick();
      await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
      await page.locator('#dev-editor textarea').fill('はじめに（段 B）');
      n = await loads();
      await page.click('#dev-editor button.dv-pri');
      f = await waitLoads(n);
      await page.click('#b-edit');
      await page.click('#b-save');
      await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
      await clickDlg(page, '#dlg-rebuild');
      await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
      const u2 = await readPortable(new Uint8Array(await getFile(UF)));
      ok((await pstate()).portable.lastTier === 'B' && kept(u2.index) && u2.sourceMatches && new TextDecoder().decode(u2.files['deck.html']).includes('はじめに（段 B）'), 'unknown members: kept at every level by a tier B save (rebuild)');
      ok(!u2.index.metadata.derivedFrom && u2.docId === u1.docId, 'unknown members: Save keeps the docId and adds no derivedFrom');
    }
  }

  // 部品庫・テーマ庫がこのエディタと違う文書：読むだけ（編集・保存は断り、フォルダへの書き出しはできる）
  {
    const n0 = await loads();
    await page.evaluate(async (b64) => {
      const root = await navigator.storage.getDirectory();
      const h = await (await root.getDirectoryHandle('pf', { create: true })).getFileHandle('other.html', { create: true });
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await h.createWritable(); await w.write(u); await w.close();
      window.__other = h;
    }, Buffer.from(pother).toString('base64'));
    ok(await page.evaluate(() => window.__APP_TEST.openFile({ handle: window.__other })) === true, 'read-only: a file whose registry theme differs still opens');
    await waitLoads(n0);
    const st = await page.evaluate(() => window.__APP_TEST.state());
    ok(/theme default/.test(st.portable.tierAOnly || '') && !st.portable.readOnly && await page.isVisible('#notice-tier-a'), 'tier A only: registry hash mismatch → only narration, audio and timing can be edited (§6): ' + st.portable.tierAOnly);
    await page.click('#b-edit');
    await page.waitForSelector('#toast.show.bad');
    ok(!(await page.evaluate(() => document.getElementById('dlg').open)) && (await page.textContent('#toast')).includes('スライドを編集できません'), 'tier A only: slide editing is refused (no rights prompt)');
    await shot(page, 'portable-tier-a-only.png');
    await page.waitForSelector('#toast:not(.show)', { state: 'attached', timeout: 10000 });
    // 口述原稿は直せる（権利を見せてから）。保存は段 A
    let of = deckFrame();
    await of.evaluate(() => DECK.go(1, 1, false));
    await page.click('#b-narr');
    await page.waitForSelector('#dlg[open] #dlg-ok');
    await clickDlg(page, '#dlg-ok');
    await page.waitForSelector('#dev-narr .dev-turn textarea');
    await page.locator('#dev-narr .dev-turn textarea').first().fill('部品庫の違う文書でも口述原稿は直せます。');
    const nn = await loads();
    await page.click('#dev-narr .dv-foot button.dv-pri');
    of = await waitLoads(nn);
    await page.click('#b-narr');
    await page.click('#b-save');
    await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    const oth = await page.evaluate(async () => { const u = new Uint8Array(await (await window.__other.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    const othText = Buffer.from(oth, 'base64').toString();
    let othOk = true; try { regionDiff(pother, othText, { narration: ['何を最小化するか:1'] }); } catch (e) { othOk = false; console.log('    ' + e.message.slice(0, 300)); }
    ok((await page.evaluate(() => window.__APP_TEST.state())).portable.lastTier === 'A' && othOk && JSON.parse(scanDocument(othText).byId.get(FORMAT.INDEX_ID).text).themes[0].sha256 === '0'.repeat(64), 'tier A only: narration saved without rebuilding; the registry entry and every other byte kept');
  }

  // ---------------------------------------------------------------- 10c. 書き込みを試みるデッキ（tools/hostile-deck.mjs：部品とインラインのスクリプト）
  // プレビューからは何も書けない：古い書き込みの知らせ（app-api）は受け取られず、ネットワークは決まり（CSP）で止まり、合言葉もアプリの文書もない。
  // 知らせ（edit-hint）はアプリの欄を開くだけで、書き込みはアプリの欄の「保存」を押したときだけ
  {
    const HF = hostileFiles();
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('hostile', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('hostile', { create: true });
      for (const [rel, text] of Object.entries(files)) {
        const parts = rel.split('/'); const name = parts.pop(); let x = d;
        for (const q of parts) x = await x.getDirectoryHandle(q, { create: true });
        const w = await (await x.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
      }
      window.__hostile = d;
    }, HF);
    const hsnap = () => page.evaluate(async (names) => {
      const out = {};
      for (const rel of names) {
        try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__hostile; for (const x of parts) d = await d.getDirectoryHandle(x); out[rel] = await (await (await d.getFileHandle(name)).getFile()).text(); }
        catch { out[rel] = null; }
      }
      out['.cache'] = await window.__hostile.getDirectoryHandle('.cache').then(() => 'exists', () => null);
      return out;
    }, [...Object.keys(HF), 'comments.json']);
    const want0 = JSON.stringify({ ...HF, 'comments.json': null, '.cache': null });
    const untouched = async () => JSON.stringify(await hsnap()) === want0;
    hostileQuiet = true;
    // 1. 取り消せばプレビューは始まらない
    let n0 = await loads();
    let op = page.evaluate(() => window.__APP_TEST_OPEN(window.__hostile));
    await page.waitForSelector('#dlg[open] #dlg-run');
    await clickDlg(page, '#dlg-cancel');
    ok(await op === false && (await loads()) === n0 && !(await page.evaluate(() => window.__APP_TEST.state().open)), 'hostile: Cancel on the code notice → the folder is not opened and no preview runs');
    // 2. 始める → 部品とスクリプトはプレビューの中だけで動く
    op = page.evaluate(() => window.__APP_TEST_OPEN(window.__hostile));
    await page.waitForSelector('#dlg[open] #dlg-run');
    await clickDlg(page, '#dlg-run');
    ok(await op === true, 'hostile: opened after "Start the preview"');
    f = await waitLoads(n0);
    ok(await f.evaluate(() => window.__evilMounted === true), 'hostile: the component ran (in the sandboxed preview)');
    await page.waitForTimeout(600);   // 読み込んだときの試み（古い書き込みの知らせ）
    const R = await f.evaluate((o) => window.__attack(o), { base: BASE, guess: '0'.repeat(48) });
    ok(R.token === 'undefined' && R.parentToken === 'blocked', 'hostile: no token in the preview');
    ok(R.parentDoc === 'blocked' && R.topDoc === 'blocked' && R.storage === 'blocked', 'hostile: parent.document / top.document / storage blocked (opaque origin)');
    ok(R.net.length === 12 && R.net.every((x) => / blocked$/.test(x)), 'hostile: fetch / XHR POST to /__dev/edit, /__dev/narration, /__dev/comment blocked by the preview CSP (connect-src \'none\') ' + JSON.stringify(R.net));
    ok(R.violations.some((v) => v.startsWith('connect-src')), 'hostile: connect-src violations reported');
    await page.waitForTimeout(400);
    ok(await untouched(), 'hostile: the old app-api write messages and the network attempts changed nothing in the folder');
    // 3. 偽の本文を付けた知らせ
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForTimeout(300);
    ok(!(await page.$('#dev-editor')), 'hostile: an edit hint outside edit mode opens nothing');
    await page.click('#b-edit');
    await f.waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    const range = await f.evaluate(() => document.querySelector('#stage [data-src]').getAttribute('data-src').split('-').map(Number));
    const shown = await page.inputValue('#dev-editor textarea');
    ok(shown === HF['deck.html'].slice(range[0], range[1]) && !shown.includes(PWNED), 'hostile: the edit hint opens the app editor with the real source, not the forged text: ' + JSON.stringify(shown));
    await shot(page, 'hostile-hint.png');
    await page.waitForTimeout(300);
    ok(await untouched(), 'hostile: nothing written while the editor is open');
    await page.press('#dev-editor textarea', 'Escape');
    await f.evaluate(() => window.__hint('comment'));
    await page.waitForSelector('#dev-comment textarea');
    ok((await page.inputValue('#dev-comment textarea')) === '' && (await page.textContent('#dev-comment .dv-q')).includes(PWNED + '-QUOTE'), 'hostile: a comment hint opens an empty note box (the forged note text is ignored)');
    await page.press('#dev-comment textarea', 'Escape');
    await f.evaluate(() => window.__hint('n'));
    await page.waitForSelector('#dev-narr');
    await page.waitForTimeout(300);
    ok(await untouched(), 'hostile: forged hints (edit, comment, n) wrote nothing');
    // 4. アプリの欄の「保存」を押したときだけ書く
    await f.evaluate(() => window.__hint('edit'));
    await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
    await page.fill('#dev-editor textarea', '信頼する画面で直した見出し');
    n0 = await loads();
    await page.click('#dev-editor button.dv-pri');
    f = await waitLoads(n0);
    const after = await hsnap();
    ok(after['deck.html'].includes('信頼する画面で直した見出し') && after['narration.md'] === HF['narration.md'] && after['comments.json'] === null, 'hostile: the write happens only on Save in the app editor');
    await page.click('#b-narr');
    await page.click('#b-edit');
    hostileQuiet = false;
  }

  // ---------------------------------------------------------------- 10e. コードが動くかは中身から決める（申告の profile を信じない。§6）・確かめはプレビューと発表者ビューのどちらにも効く
  {
    hostileQuiet = true;
    const MIN = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
    const ONERR = MIN.replace('</section>', '<img alt="" src="data:," onerror="window.__onerrorRan = 1">\n</section>');
    const mkdir = (name, files) => page.evaluate(async ([name, files]) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(name, { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      (window.__cdirs ||= {})[name] = d;
    }, [name, files]);
    const narrMin = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
    // 大きすぎるファイル：File.size で読む前に断る（arrayBuffer() を呼ばない）
    const big = page.evaluate(() => window.__APP_TEST.openFile({ file: { name: 'big.html', size: 200 * 1024 * 1024, arrayBuffer() { window.__bigRead = true; return Promise.resolve(new ArrayBuffer(8)); } } }));
    await page.waitForSelector('#dlg[open] #refuse-reason');
    ok((await page.textContent('#dlg .tech')).includes('file-too-large') && !(await page.evaluate(() => window.__bigRead)), 'size: an oversized file is refused from File.size before it is read');
    await clickDlg(page, '#dlg-ok');
    ok(await big === false, 'size: the oversized file is not opened');
    // 解析の上限（§11）：上限の大きさより小さいが、小さな要素が何百万もある文書は、Worker の中で解析の途中に断る（全部の木を作らない）
    const leave = async () => { if (await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: 1000 }).catch(() => null)) await clickDlg(page, '#dlg-discard'); };
    const t0c = Date.now();
    let opc = page.evaluate((h) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(h), name: 'tiny-elements.html' }), pmin.html.replace('<body>', '<body>' + '<p>'.repeat(3000000)));
    await leave();
    await page.waitForSelector('#dlg[open] #refuse-reason', { timeout: 30000 });
    ok((await page.textContent('#dlg .tech')).includes('too-complex') && Date.now() - t0c < 20000, `bounded: a file with millions of tiny elements is refused while parsing (too-complex, ${Date.now() - t0c} ms including the transfer)`);
    await clickDlg(page, '#dlg-ok');
    ok(await opc === false, 'bounded: the file is not opened');
    // 読み取りの期限：過ぎたら Worker を止めて断る。次の読み取りは新しい Worker で動く
    await page.evaluate(() => { window.__APP_TEST.readerTimeout = 1; });
    opc = page.evaluate((h) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(h), name: 'slow.html' }), pmin.html);
    await leave();
    await page.waitForSelector('#dlg[open] #refuse-reason', { timeout: 30000 });
    ok((await page.textContent('#dlg .tech')).includes('reader-timeout'), 'deadline: reading past the deadline terminates the reader worker and refuses the file');
    await clickDlg(page, '#dlg-ok');
    ok(await opc === false, 'deadline: the file is not opened');
    await page.evaluate(() => { window.__APP_TEST.readerTimeout = null; });
    ok((await page.evaluate(() => window.__APP_TEST.workerProbe('__nothing'))) === null, 'deadline: a new reader worker answers after the old one was terminated');
    // 組み立ての上限と期限（§11）：開いたデッキの組み立てと判定は Worker の中（app/build-worker.js）。小さな依存を 100000 回取り込むデッキは
    // 断り（build-too-large）、上限の内でも重い組み立ては期限で Worker ごと止める（build-timeout）。その間もページは動く（10 ms ごとのタイマーの
    // 間が開かない）。次の組み立ては新しい Worker で
    {
      const gapStart = () => page.evaluate(() => { window.__gap = 0; let last = performance.now(); clearInterval(window.__gapT); window.__gapT = setInterval(() => { const t = performance.now(); window.__gap = Math.max(window.__gap, t - last); last = t; }, 10); });
      const gapEnd = () => page.evaluate(() => { clearInterval(window.__gapT); return Math.round(window.__gap); });
      await mkdir('c-bomb', { 'deck.html': MIN.replace('</section>', '/*INCLUDE:dep.txt*/'.repeat(100000) + '</section>'), 'dep.txt': '<p>x</p>', 'narration.md': narrMin });
      await gapStart();
      const tb = Date.now();
      page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-bomb'])).catch(() => {});
      await page.waitForFunction(() => /build-too-large|over the limit/.test(window.__APP_TEST.state().error || ''), null, { timeout: 30000 });
      const gb = await gapEnd();
      ok(Date.now() - tb < 15000 && gb < 300, `build limits: a folder deck including a small file 100000 times is refused (build-too-large) in ${Date.now() - tb} ms; the page stayed responsive (longest timer gap ${gb} ms)`);
      // 重い組み立て（式 15000）を期限 800 ms で：Worker を止めて失敗にし、その間もページは動く
      await mkdir('c-slow', { 'deck.html': MIN.replace('</section>', '\\(\\frac{a^2+b^2}{\\sqrt{c}}\\)'.repeat(15000) + '</section>'), 'narration.md': narrMin });
      await page.evaluate(() => { window.__APP_TEST.buildTimeout = 800; });
      await gapStart();
      const ts = Date.now();
      page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-slow'])).catch(() => {});
      await page.waitForFunction(() => /build-timeout|longer than/.test(window.__APP_TEST.state().error || ''), null, { timeout: 30000 });
      const gs = await gapEnd();
      ok(Date.now() - ts < 15000 && gs < 300, `build deadline: a slow build is stopped after the deadline (build-timeout, ${Date.now() - ts} ms); the page stayed responsive (longest timer gap ${gs} ms)`);
      await page.evaluate(() => { window.__APP_TEST.buildTimeout = 0; });
      ok((await page.evaluate(() => window.__APP_TEST.buildWorkerProbe('__nothing'))) === null, 'build deadline: a new build worker answers after the old one was terminated');
    }
    // フォルダ：<script> も部品もなく、<img onerror> だけ → 聞く（以前は見逃していた）
    await mkdir('c-onerror', { 'deck.html': ONERR, 'narration.md': narrMin });
    let n0 = await loads();
    let op = page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-onerror']));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-why')).includes('onerror') && (await loads()) === n0, 'consent: a folder deck with only <img onerror> (no <script>, no component) is asked about before anything runs');
    await clickDlg(page, '#dlg-cancel');
    ok(await op === false && (await loads()) === n0, 'consent: Cancel → not opened, nothing loaded');
    // 持ち運べる 1 ファイル：申告は core、中身には <script>（hash は正しい） → コードを含むものとして聞き、食い違いを知らせる
    const mis = fs.readFileSync(fixture('mislabelled-core-script').file);
    n0 = await loads();
    op = page.evaluate((b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'mislabelled.html' }); }, mis.toString('base64'));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok(await page.isVisible('#code-mislabel') && (await page.textContent('#code-why')).includes('<script>') && (await loads()) === n0 && await previewBlank(), 'consent: a hash-valid archive labelled core but carrying <script> is asked about (label ignored), with a warning about the inconsistent label; the preview is blank meanwhile');
    await shot(page, 'code-mislabelled.png');
    await clickDlg(page, '#dlg-run');
    ok(await op === true, 'consent: opened after "Start the preview"');
    await waitLoads(n0);
    const ms = (await page.evaluate(() => window.__APP_TEST.state())).portable;
    ok(ms.profile === 'core' && ms.extended && ms.mislabelled && await page.isVisible('#notice-mislabel') && (await page.evaluate(() => window.__APP_TEST.state().warn)).some((w) => /core/.test(w)), 'consent: the mislabelled file is treated as containing code (notice and warning shown)');
    // 取り込み（/*INCLUDE:…*/）で、拡張子が画像のファイルの中のスクリプトが文書に入る：組んだ文書から決めるので聞く（format spec §6）
    const PAYLOAD = '<script>window.__includeRan = 1</script>';
    const INC = MIN.replace('</section>', '/*INCLUDE:payload.png*/\n</section>');
    await mkdir('c-include', { 'deck.html': INC, 'narration.md': narrMin, 'payload.png': PAYLOAD });
    n0 = await loads();
    op = page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-include']));
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-why')).includes('<script>') && (await loads()) === n0, 'consent: a folder deck that includes payload.png carrying <script> is asked about (the expanded document is classified, not the file extension)');
    await clickDlg(page, '#dlg-cancel');
    ok(await op === false && (await loads()) === n0, 'consent: include payload: Cancel → not opened, nothing loaded');
    // 同じものを持ち運べる 1 ファイルで（正しく extended と書いたもの・core と偽ったもの）。読み取りの補いは画像の拡張子を読まないが、組んだ文書の判定が見つける
    const incDir = path.join(PW, 'inc');
    fs.rmSync(incDir, { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'examples', 'minimal'), incDir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
    fs.writeFileSync(path.join(incDir, 'deck.html'), INC); fs.writeFileSync(path.join(incDir, 'payload.png'), PAYLOAD);
    const pinc = await buildPortable(path.join(incDir, 'deck.html'), { out: path.join(PW, 'inc.html') });
    const ixInc = JSON.parse(scanDocument(pinc.html).byId.get(FORMAT.INDEX_ID).text);
    ok(ixInc.profile === 'extended' && Object.keys(ixInc.files).includes('payload.png'), 'include payload: the exporter labels the lesson extended (decided from the built document) ' + ixInc.profile);
    const forged = await replaceIndexText(pinc.html, JSON.stringify({ ...ixInc, profile: 'core' }));
    for (const [label, html] of [['extended', pinc.html], ['forged core', forged]]) {
      n0 = await loads();
      op = page.evaluate(([h, nm]) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(h), name: nm }), [html, 'inc.html']);
      await page.waitForSelector('#dlg[open] #dlg-run');
      ok((await page.textContent('#code-why')).includes('<script>') && (await loads()) === n0 && await previewBlank(), `consent: include payload in a portable file (${label}) is asked about before anything runs`);
      await clickDlg(page, '#dlg-cancel');
      ok(await op === false && (await loads()) === n0, `consent: include payload in a portable file (${label}): Cancel → not opened`);
    }
    // 読むたびに中身が変わる作業場所：初めの読み込みはスクリプト、2 回目からは無害（調べるときに読み直すと、調べたものと表示するものが違う）。
    // 判定は組んだ文書（表示するバイト）からなので、読み直しても入れ替わらない：聞かれ、取り消せばスクリプトは動かない
    n0 = await loads();
    op = page.evaluate(([deck, narr, evil]) => {
      const enc = new TextEncoder();
      const benign = '<!--' + ' '.repeat(Math.max(0, evil.length - 7)) + '-->';
      let reads = 0;
      const fileH = (name, bytes) => ({ kind: 'file', name, getFile: async () => {
        const b = typeof bytes === 'function' ? bytes() : bytes;
        return { name, size: b.length, lastModified: 1, arrayBuffer: async () => (typeof bytes === 'function' ? enc.encode(name === 'payload.png' && reads++ > 0 ? benign : evil) : b).slice().buffer, text: async () => new TextDecoder().decode(b) };
      } });
      const files = { 'deck.html': fileH('deck.html', enc.encode(deck)), 'narration.md': fileH('narration.md', enc.encode(narr)), 'payload.png': fileH('payload.png', () => enc.encode(evil)) };
      window.__raceReads = () => reads;
      const dir = { kind: 'directory', name: 'race', async *entries() { for (const [k, v] of Object.entries(files)) yield [k, v]; }, async *keys() { for (const k of Object.keys(files)) yield k; },
        getFileHandle: async (n) => { if (!files[n]) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); return files[n]; },
        getDirectoryHandle: async () => { throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); }, isSameEntry: async () => false };
      return window.__APP_TEST_OPEN(dir);
    }, [INC, narrMin, PAYLOAD]);
    await page.waitForSelector('#dlg[open] #dlg-run');
    ok((await page.textContent('#code-why')).includes('<script>') && (await loads()) === n0, 'race: a workspace that returns different bytes on the next read cannot swap the classified bytes (asked; the classified document is the rendered one)');
    await clickDlg(page, '#dlg-cancel');
    ok(await op === false && (await loads()) === n0 && !(await page.evaluate(() => window.__includeRan)), 'race: Cancel → nothing loaded, the payload never ran');

    // 組み直し（外での変更の見張り）で後からコードが現れたとき：取り消せば、プレビューも発表者ビューも読み込まない
    await mkdir('c-poll', { 'deck.html': MIN, 'narration.md': narrMin });
    op = await page.evaluate(() => window.__APP_TEST_OPEN(window.__cdirs['c-poll']));
    await frameReady();
    ok(op === true && !(await page.$('#dlg[open]')), 'consent: a deck without code opens without a question');
    const [pp] = await Promise.all([ctx.waitForEvent('page'), page.click('#b-presenter')]);
    await page.waitForFunction(() => window.__APP_TEST.state().presLoads > 0);
    const before = await page.evaluate(() => window.__APP_TEST.state());
    await page.evaluate(async (text) => { const w = await (await window.__cdirs['c-poll'].getFileHandle('deck.html')).createWritable(); await w.write(text); await w.close(); }, ONERR);
    await page.waitForSelector('#dlg[open] #dlg-run', { timeout: 20000 });
    ok((await page.evaluate(() => window.__APP_TEST.state().presLoads)) === before.presLoads && (await loads()) === before.loads, 'consent: code appearing on a polling rebuild is asked about before the preview or the presenter view loads it');
    await clickDlg(page, '#dlg-cancel');
    await page.waitForTimeout(POLL_WAIT);
    await page.evaluate(async (text) => { const w = await (await window.__cdirs['c-poll'].getFileHandle('deck.html')).createWritable(); await w.write(text); await w.close(); }, ONERR.replace('</body>', '<p>again</p></body>'));
    await page.waitForTimeout(POLL_WAIT);
    const aft = await page.evaluate(() => window.__APP_TEST.state());
    ok(aft.presLoads === before.presLoads && aft.loads === before.loads && !aft.allowed && !aft.presenter && pp.isClosed() && await previewBlank() && !(await page.$('#dlg[open]')),
      'consent: after Cancel, later rebuilds load neither the preview nor the presenter view (presenter closed, preview blank, not asked again) ' + JSON.stringify({ presLoads: [before.presLoads, aft.presLoads], loads: [before.loads, aft.loads], allowed: aft.allowed }));
    hostileQuiet = false;
  }

  // ---------------------------------------------------------------- 10f. 保存の生き死に：await（権利の確認・選ぶ画面・書き込み）のたびに作業場所を確かめ、
  // 書き込みの中まで取り消しを運ぶ。保存の途中の編集は「保存した」にしない。設定の書き込みと「保存した」は最後の書き込みが済んでから
  {
    await page.evaluate(() => {
      window.__gates = {};
      window.__gate = (k) => new Promise((r) => { window.__gates[k] = r; });
      // 試験用のファイルのハンドル：権利の確認・書き込み・close を待たせられ、何をしたかを log に残す
      window.__mkHandle = (name, o = {}) => {
        const h = { kind: 'file', name, log: [], data: null,
          getFile: async () => new File([o.initial || ''], name),
          queryPermission: async () => (o.perm ? 'prompt' : 'granted'),
          requestPermission: async () => { h.log.push('ask'); if (o.perm) await window.__gate('perm'); return 'granted'; },
          createWritable: async () => { h.log.push('create'); let buf = null; return {
            write: async (d) => { h.log.push('write'); if (o.writeGate) await window.__gate(o.writeGate); buf = d; },
            close: async () => { h.log.push('close'); if (o.closeFail) throw new Error('disk full'); h.data = typeof buf === 'string' ? buf : new TextDecoder().decode(buf); },
            abort: async () => { h.log.push('abort'); } }; } };
        return h;
      };
    });
    const KEY = '何を最小化するか:0';
    const edit = async (text) => {
      const g = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), KEY);
      const pr = page.evaluate(([k, rev, turns]) => { const [sk, st] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]; return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: sk, stepKey: st, rev, turns }); },
        [KEY, g.rev, g.turns.map((t) => ({ role: t.role, text }))]);
      // 最初の編集の前の権利の確認
      const first = await Promise.race([pr.then(() => 'done'), page.waitForSelector('#dlg[open] #rights-list', { timeout: 8000 }).then(() => 'rights', () => 'none')]);
      if (first === 'rights') await clickDlg(page, '#dlg-ok');
      const r = await pr;
      if (r._status !== 200) throw new Error('edit failed ' + JSON.stringify(r));
    };
    // 開く（今のものが未保存なら「捨てる」）
    const discardIfAsked = async () => { if (await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: 1500 }).catch(() => null)) await clickDlg(page, '#dlg-discard'); };
    const openWith = async (handleJs) => {
      const n0 = await loads();
      const pr = page.evaluate(([js, html]) => { const h = new Function('html', 'return ' + js)(html); window.__H = h; return window.__APP_TEST.openFile({ handle: h }); }, [handleJs, pmin.html]);
      await discardIfAsked();
      ok(await pr === true, 'liveness: opened the lesson with a test handle');
      await waitLoads(n0);
    };
    const switchAway = async () => {
      const pr = page.evaluate(async () => { const root = await navigator.storage.getDirectory(); return window.__APP_TEST_OPEN(await root.getDirectoryHandle('minimal')); });
      await discardIfAsked();
      ok(await pr === true, 'liveness: another workspace (a folder) was opened during the save');
    };
    const minimalBefore = { deck: await opfs.read('deck.html'), narr: await opfs.read('narration.md'), cfg: await opfs.read(FORMAT.CONFIG_FILE) };
    const minimalSame = async () => (await opfs.read('deck.html')) === minimalBefore.deck && (await opfs.read('narration.md')) === minimalBefore.narr && (await opfs.read(FORMAT.CONFIG_FILE)) === minimalBefore.cfg;
    const hlog = () => page.evaluate(() => window.__H.log.slice());

    // 1. 権利の確認（requestPermission）を待つ間に別の作業場所を開く → そのファイルに書かない（書き込みを作りもしない）
    await openWith(`window.__mkHandle('a.html', { initial: html, perm: true })`);
    await edit('保存の途中で替える 1');
    let sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForFunction(() => window.__H.log.includes('ask'));
    await switchAway();
    await page.evaluate(() => window.__gates.perm());
    await sv;
    ok(!(await hlog()).includes('create') && await minimalSame(), 'liveness: switching workspace during the permission prompt → nothing written to the file or to the new workspace (cancelled) ' + JSON.stringify(await hlog()));

    // 2. 書き込みの途中（write を待つ間）に替える → abort（入れ替えない）。close しない
    await openWith(`window.__mkHandle('b.html', { initial: html, writeGate: 'w' })`);
    await edit('保存の途中で替える 2');
    sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForFunction(() => window.__H.log.includes('write'));
    await switchAway();
    await page.evaluate(() => window.__gates.w());
    await sv;
    const l2 = await hlog();
    ok(l2.includes('abort') && !l2.includes('close') && (await page.evaluate(() => window.__H.data)) === null && await minimalSame(), 'liveness: switching during the write aborts the writable stream (the file is not replaced) ' + JSON.stringify(l2));

    // 3. 選ぶ画面（showSaveFilePicker）を待つ間に替える → 選んだファイルに書かない
    await openWith(`window.__mkHandle('c.html', { initial: html })`);
    await edit('保存の途中で替える 3');
    await page.evaluate(() => { window.__P = window.__mkHandle('picked.html'); window.__origPicker = window.showSaveFilePicker; window.showSaveFilePicker = () => window.__gate('pick').then(() => window.__P); window.__APP_TEST.saveHandle = null; });
    sv = page.evaluate(() => window.__APP_TEST.save('copy'));
    await page.waitForFunction(() => !!window.__gates.pick);
    await switchAway();
    await page.evaluate(() => window.__gates.pick());
    await sv;
    ok((await page.evaluate(() => window.__P.log.slice())).length === 0 && await minimalSame(), 'liveness: switching while the save picker is open → the picked file is not written');
    await page.evaluate(() => { window.showSaveFilePicker = window.__origPicker; delete window.__gates.pick; });

    // 4. 保存の途中の編集：保存したファイルに入らない編集が残るので、「保存した」にしない（dirty のまま）
    await openWith(`window.__mkHandle('d.html', { initial: html, writeGate: 'w4' })`);
    await edit('保存する版');
    sv = page.evaluate(() => window.__APP_TEST.save('save'));
    await page.waitForFunction(() => window.__H.log.includes('write'));
    await edit('保存の途中の編集');
    await page.evaluate(() => window.__gates.w4());
    await sv;
    const d4 = await page.evaluate(() => window.__H.data || '');
    const st4 = (await page.evaluate(() => window.__APP_TEST.state())).portable;
    ok(d4.includes('保存する版') && !d4.includes('保存の途中の編集') && st4.dirty === true && (await page.textContent('#deckname')).startsWith('●'), 'liveness: an edit made while the save was pending keeps the unsaved mark (only the snapshot was saved) ' + JSON.stringify({ dirty: st4.dirty }));
    // 次の保存でその編集も保存し、そのときは「保存した」になる
    await page.evaluate(() => { window.__H = window.__mkHandle('d2.html'); window.__APP_TEST.state(); });
    await page.evaluate(() => { window.__APP_TEST.saveHandle = window.__H; });
    await page.evaluate(() => window.__APP_TEST.save('copy'));
    ok((await page.evaluate(() => window.__H.data || '')).includes('保存の途中の編集') && !(await page.evaluate(() => window.__APP_TEST.state())).portable.dirty, 'liveness: the next save includes the edit and marks the lesson saved');

    // 5. 「新しい教材として保存」で書き込みが失敗（close で失敗）→ 作業場所の設定のファイル（新しい docId）を書かず、dirty のまま
    await edit('新しい教材の失敗');
    const cfg0 = await page.evaluate((c) => { const f = window.__APP_TEST.files(); return f[c] || null; }, FORMAT.CONFIG_FILE);
    await page.evaluate(() => { window.__APP_TEST.saveHandle = window.__mkHandle('new.html', { closeFail: true }); });
    await page.evaluate(() => window.__APP_TEST.save('new'));
    const cfg1 = await page.evaluate((c) => { const f = window.__APP_TEST.files(); return f[c] || null; }, FORMAT.CONFIG_FILE);
    ok(cfg1 === cfg0 && (await page.evaluate(() => window.__APP_TEST.state())).portable.dirty, 'liveness: when the final write fails, the config (new docId) is not written and the lesson stays unsaved');
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    await discardIfAsked();
  }

  // ---------------------------------------------------------------- 10d. 道具の列：1280 px 以上では 1 行に収まる（日本語・英語、フォルダ・1 ファイル）
  for (const lang of ['ja', 'en']) {
    const pt = await ctx.newPage();   // 同じ文脈（OPFS の minimal を開く）。言葉は ?lang= で
    watch(pt, 'toolbar-' + lang);
    await pt.goto(BASE + '?lang=' + lang);
    await pt.waitForSelector('#drop');
    const rows = () => pt.evaluate(() => {
      const els = [...document.querySelectorAll('#top > *, #tools > *')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && e.id !== 'tools');
      const mids = els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
      const right = Math.round(Math.max(...els.map((e) => e.getBoundingClientRect().right)));
      return { spread: Math.max(...mids) - Math.min(...mids), h: document.getElementById('top').getBoundingClientRect().height, n: els.length, right, fits: right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    await pt.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__open = await root.getDirectoryHandle('minimal'); });
    await pt.evaluate(() => window.__APP_TEST_OPEN(window.__open));
    await pt.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
    for (const [kind, open] of [['folder', null], ['portable', async () => {
      await pt.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson-with-a-long-name' + ext }); }, [Buffer.from(pmin.html).toString('base64'), FORMAT.FILE_EXT]);
      await pt.waitForFunction(() => window.__APP_TEST.state().kind === 'memory' && window.__APP_TEST.state().loads > 0, null, { timeout: 20000 });
    }]]) {
      if (open) await open();
      // 警告のボタンも出ているとき（いちばん長いとき）
      await pt.evaluate(() => { const b = document.getElementById('b-warn'); b.hidden = false; b.textContent = document.documentElement.lang === 'en' ? '12 warnings' : '警告 12'; });
      for (const w of [1440, 1280]) {
        await pt.setViewportSize({ width: w, height: 860 });
        await pt.waitForTimeout(150);
        const r = await rows();
        ok(r.spread <= 6 && r.fits, `toolbar (${lang}, ${kind}, ${w} px): one row, nothing cut off (${r.n} items, height ${Math.round(r.h)} px, spread ${r.spread} px, right edge ${r.right}/${w})`);
        if (SHOTS && w === 1440) await pt.screenshot({ path: path.join(SHOTS, `toolbar-${lang}-${kind}-${w}.png`), clip: { x: 0, y: 0, width: w, height: 120 } });
      }
      await pt.setViewportSize({ width: 1440, height: 860 });
      // プレビューを表示し終えてから（loads は srcdoc を渡した数。iframe の load はその後で、プレビューに focus を移す）
      const shown = () => pt.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 20000 });
      await shown();
      await clickMenuOpen(pt, '#b-exportmenu');
      await pt.waitForSelector('#m-export:not([hidden])');
      if (SHOTS) await pt.screenshot({ path: path.join(SHOTS, `toolbar-${lang}-${kind}-menu.png`), clip: { x: 640, y: 0, width: 800, height: 300 } });
      ok(await pt.evaluate(() => document.activeElement && document.activeElement.closest('#m-export') !== null), `menu (${lang}, ${kind}): opening focuses the first item`);
      // 一覧を開いている間にプレビューの読み込みが終わっても、focus は一覧に残る（Windows でここが時々落ちた：load の focus が一覧から奪い、
      // Esc がデッキへ行って一覧が開いたまま残り、次に押した「書き出す ▾」が一覧を閉じた）
      await pt.evaluate(() => window.__APP_TEST.reloadPreview());
      await shown();
      ok(await pt.evaluate(() => document.activeElement && document.activeElement.closest('#m-export') !== null) && await pt.isVisible('#m-export'),
        `menu (${lang}, ${kind}): a preview load that finishes while the menu is open does not take the focus`);
      await pt.keyboard.press('ArrowDown');
      await pt.keyboard.press('Escape');
      ok(await pt.isHidden('#m-export') && await pt.evaluate(() => document.activeElement.id === 'b-exportmenu'), `menu (${lang}, ${kind}): Esc closes it and returns focus`);
      // 狭い幅では 2 行に折り返し、はみ出さない
      await pt.setViewportSize({ width: 900, height: 860 });
      await pt.waitForTimeout(150);
      ok(await pt.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `toolbar (${lang}, ${kind}, 900 px): wraps without horizontal overflow`);
      await pt.setViewportSize({ width: 1440, height: 860 });
    }
    await pt.close();
  }

  // ---------------------------------------------------------------- 10c. 原稿の deck.html・組んだ HTML・見本の教材（はじめの画面）
  // 「ファイルを開く」で原稿の deck.html：断らずに、フォルダを開くか、このファイルだけを開くかを聞く。組んだ発表の HTML・再生専用の
  // 1 ファイル・ほかの HTML は、それぞれの言葉で断る。見本（dist/examples/）は一覧から、ほかのファイルと同じ道で開く
  {
    const po = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1280, height: 800 } });
    watch(po, 'openfile');
    await po.goto(BASE);
    await po.waitForSelector('#drop');
    const pst = () => po.evaluate(() => window.__APP_TEST.state());
    const pframe = () => po.frames().find((x) => x.parentFrame() === po.mainFrame());
    // 開くのを待つ（独自のコードの確かめが出たら「始める」）。返すもの：openFile の答え
    const settle = async (p) => {
      const asked = await Promise.race([p.then(() => false), po.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 }).then(() => true)]);
      if (asked) await clickDlg(po, '#dlg-run');
      const r = await p;
      if (r) await po.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
      return r;
    };
    const slidesNow = async () => { for (let i = 0; i < 100; i++) { try { const f = pframe(); const n = f && await f.evaluate(() => (window.DECK && DECK.ready ? DECK.slides.length : 0)); if (n) return n; } catch { /* 読み込み中 */ } await po.waitForTimeout(100); } return 0; };
    // 開く（保存していない変更を捨ててよいかを聞かれたら「捨てる」）
    const openBytes = (text, name) => {
      const p = po.evaluate(([t, n]) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(t), name: n }), [text, name]);
      return (async () => { if (await po.evaluate(() => !!(window.__APP_TEST.state().portable && window.__APP_TEST.state().portable.dirty))) { await po.waitForSelector('#dlg[open] #dlg-discard'); await clickUntil(po, '#dlg-discard', () => po.waitForSelector('#dlg[open] #dlg-discard', { state: 'detached', timeout: 2500 })); } return p; })();
    };
    // 品質チェックのエラーの数
    const quickErrors = async () => {
      await po.click('#b-check');
      await po.waitForSelector('#panel-body .sum', { timeout: 20000 });
      const t = await po.textContent('#panel-body .sum');
      await clickUntil(po, '#panel-close', () => po.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));
      return { n: Number((t.match(/エラー (\d+)/) || [])[1]), t };
    };

    // 見本の一覧：配信版の dist/examples/ と同じもの（tools/examples-portable.mjs の順）
    const exNames = await po.$$eval('#examples-list li', (li) => li.map((x) => x.getAttribute('data-example')));
    ok(await po.isVisible('#examples') && exNames.join(',') === EXAMPLES.join(','), `examples: the first screen lists the examples (${exNames.join(', ')})`);
    if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'examples-list.png') });
    for (const name of EXAMPLES) {
      const file = path.join(DIST, 'examples', name + FORMAT.FILE_EXT);
      const want = await readPortable(new Uint8Array(fs.readFileSync(file)));
      await po.goto(BASE);
      await po.waitForSelector(`#examples-list li[data-example="${name}"] button`);
      await po.click(`#examples-list li[data-example="${name}"] button`);
      // 開いた後の状態を待つ（独自のコードの確かめは「始める」）
      const asked = await Promise.race([po.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.name === n; }, name + FORMAT.FILE_EXT, { timeout: 30000 }).then(() => false), po.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 }).then(() => true)]);
      if (asked) { await clickDlg(po, '#dlg-run'); await po.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.name === n; }, name + FORMAT.FILE_EXT, { timeout: 30000 }); }
      await po.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
      const s = await pst();
      ok(s.portable.docId === want.docId && !s.error && !s.portable.readOnly, `examples: ${name} opens from the list (docId ${s.portable.docId.slice(0, 8)}…, ${want.index.profile}${asked ? ', asked before its own code ran' : ''}, no build error)`);
      ok(asked === (want.index.profile === 'extended'), `examples: ${name} → the code notice ${want.index.profile === 'extended' ? 'is' : 'is not'} shown (same import checks as any file)`);
      ok((await slidesNow()) > 0 && !s.portable.tierAOnly, `examples: ${name} renders and can be rebuilt (registry matches this editor)`);
    }

    // 原稿の deck.html（examples/kokugo-kanbun）
    await po.goto(BASE);
    await po.waitForSelector('#drop');
    const ksrc = fs.readFileSync(path.join(ROOT, 'examples/kokugo-kanbun/deck.html'), 'utf8');
    let p = openBytes(ksrc, 'deck.html');
    await po.waitForSelector('#dlg[open] #dlg-only');
    ok((await po.textContent('#dlg-title')).includes('deck.html') && (await po.textContent('#source-lead')).includes('narration.md') && !!(await po.$('#dlg-folder')) && !(await po.$('#refuse-reason')),
      'source: opening a deck source file asks (open the folder / this file only / cancel) instead of refusing');
    if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'source-dialog.png') });
    await clickDlg(po, '#dlg-cancel');
    ok(await p === false && !(await pst()).open, 'source: Cancel → nothing opened');
    // フォルダを開く：フォルダを選ぶ画面（ここでは OPFS のフォルダ）→ ふつうのフォルダの作業場所
    await po.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('src-folder', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('src-folder', { create: true });
      for (const [k, v] of Object.entries(files)) { const w = await (await d.getFileHandle(k, { create: true })).createWritable(); await w.write(v); await w.close(); }
      window.__srcPick = window.showDirectoryPicker; window.showDirectoryPicker = async () => d;
    }, { 'deck.html': ksrc, 'narration.md': fs.readFileSync(path.join(ROOT, 'examples/kokugo-kanbun/narration.md'), 'utf8') });
    p = openBytes(ksrc, 'deck.html');
    await po.waitForSelector('#dlg[open] #dlg-folder');
    await clickDlg(po, '#dlg-folder');
    ok(await settle(p) === true && (await pst()).kind === 'folder' && (await pst()).deckFile === 'deck.html', 'source: "Open the folder…" opens the picked folder as a folder workspace');
    const folderCheck = await quickErrors();
    // ルビの振り仮名（rt）は本文の半分の大きさが決まり：品質チェックも kit/check.mjs と同じく字の大きさに数えない
    ok(folderCheck.n === 0, 'quality check (kokugo-kanbun): ruby rt is not counted as small text, as in kit/check.mjs (errors 0): ' + folderCheck.t);
    await po.evaluate(() => { window.showDirectoryPicker = window.__srcPick; });
    // このファイルだけ：メモリの上（deck.html だけ）で開き、品質チェックが通る
    p = openBytes(ksrc, 'deck.html');
    await po.waitForSelector('#dlg[open] #dlg-only');
    await clickDlg(po, '#dlg-only');
    ok(await settle(p) === true, 'source: "Open this file only" opens');
    let s = await pst();
    ok(s.kind === 'memory' && s.portable.sourceOnly && s.portable.name === 'deck' + FORMAT.FILE_EXT && s.portable.dirty && !s.error && (await slidesNow()) === 11,
      `source only: an in-memory workspace with only deck.html (${s.portable.name}, unsaved, 11 slides, no build error)`);
    const sfiles = await po.evaluate(() => Object.keys(window.__APP_TEST.files()).filter((k) => !k.startsWith('.')).sort());
    ok(sfiles.join(',') === ['deck.html', FORMAT.CONFIG_FILE].join(','), 'source only: the workspace holds deck.html (and the new docId), no narration or audio: ' + sfiles.join(', '));
    ok(await po.isVisible('#notice-source-only') && (await po.textContent('#notice-source-only')).includes('deck.html だけ'), 'source only: the notice says only deck.html is open and not saved yet');
    if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'source-only.png') });
    const srcCheck = await quickErrors();
    ok(srcCheck.n === folderCheck.n, `source only: the quality check finds no error that the folder does not have (${srcCheck.t} / folder: ${folderCheck.t})`);
    // 保存：どこにも保存していないので、1 ファイルか空のフォルダかを選ぶ
    await po.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('source-only' + '.ega.html', { create: true }); });
    await clickUntil(po, '#b-save', () => po.waitForSelector('#dlg[open] #save-where', { timeout: 2500 }));
    await po.waitForSelector('#dlg[open] #save-where');
    ok(!!(await po.$('#dlg-file')) && !!(await po.$('#dlg-folder')), 'source only: Save asks where (a single file or a folder)');
    if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'save-where.png') });
    await clickDlg(po, '#dlg-file');
    await po.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
    const sv = await readPortable(new Uint8Array(Buffer.from(await po.evaluate(async () => { const u = new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()); let x = ''; for (let i = 0; i < u.length; i += 0x8000) x += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(x); }), 'base64')));
    s = await pst();
    ok(sv.index.entry === 'deck.html' && new TextDecoder().decode(sv.files['deck.html']) === ksrc && !sv.files['narration.md'] && sv.docId === s.portable.docId && !(await po.isVisible('#notice-source-only')),
      'source only: saved as a portable file with the same deck.html and docId; the "not saved" notice goes away');
    // examples/minimal の deck.html だけ：品質チェックが通る（エラー 0）
    p = openBytes(fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8'), 'deck.html');
    await po.waitForSelector('#dlg[open] #dlg-only');
    await clickDlg(po, '#dlg-only');
    ok(await settle(p) === true && (await pst()).portable.sourceOnly, 'source only (minimal): opens');
    const minCheck = await quickErrors();
    ok(minCheck.n === 0, 'source only (minimal): the quality check passes (no errors): ' + minCheck.t);
    // 部品とデータが原稿のフォルダにあるデッキ（examples/tmlr2026-calibration）：ないものは組み立ての知らせになり、開ける
    p = openBytes(fs.readFileSync(path.join(ROOT, 'examples/tmlr2026-calibration/deck.html'), 'utf8'), 'deck.html');
    await po.waitForSelector('#dlg[open] #dlg-only');
    await clickDlg(po, '#dlg-only');
    ok(await settle(p) === true, 'source only (tmlr): opens');
    s = await pst();
    ok(!s.error && s.warn.some((w) => w.includes('relcurve.json')) && s.warn.some((w) => /component not found: m-relcurve/.test(w)) && s.warn.filter((w) => w.includes('「relcurve.json」')).length === 1,
      'source only (tmlr): missing data files and deck-local components are build warnings (each once), not an error');

    // 組んだ発表の HTML・再生専用の 1 ファイル・ほかの HTML：それぞれの言葉で断る
    const built = build(path.join(ROOT, 'examples/minimal/deck.html'), { subset: false, noAudio: true }).html;
    for (const [what, text, kind, folder] of [['built output', built, 'built-output', true], ['play-only', fs.readFileSync(fixture('minimal-play-only').file, 'utf8'), 'play-only', false], ['other HTML', '<!DOCTYPE html><title>x</title><p>hello</p>', 'no-source', false]]) {
      p = openBytes(text, 'deck.html');
      await po.waitForSelector('#dlg[open] #refuse-reason');
      const k = await po.getAttribute('#refuse-reason', 'data-kind');
      const msg = await po.textContent('#refuse-reason');
      ok(k === kind && (await po.textContent('#dlg pre.tech')).includes('[no-source]') && !!(await po.$('#dlg-folder')) === folder && !(await po.$('#dlg-only')), `refuse: ${what} → its own message (${kind}${folder ? ', offers "Open the folder…"' : ''}): ${msg.slice(0, 60)}…`);
      if (kind === 'built-output') { ok(/組み立てた発表用の HTML/.test(msg) && msg.includes(FORMAT.FILE_EXT), 'refuse: the built-output message says it is a presentation build and to open the source folder or a portable file'); if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'built-output.png') }); }
      if (kind === 'play-only') ok(/再生専用版/.test(msg), 'refuse: the play-only message names the play-only portable file');
      await clickDlg(po, '#dlg-ok');
      ok(await p === false, `refuse: ${what} is not opened`);
    }

    // ---------------------------------------------------------------- 利用者のテーマのフォルダ（app/theme-folder.js）
    // OPFS のフォルダを「テーマのフォルダ」として選ぶ（tml に似たテスト用のテーマ：色とロゴ）。探す順・根の決まり・残す・許可の求め直し・忘れる・1 ファイルへの書き出し
    {
      const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const minDeck = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
      const deckWith = (t) => minDeck.replace('data-theme="default"', `data-theme="${t}"`);
      const themeFiles = {
        'mytml/tokens.css': ':root{--accent:#1a2b3c;--theme-probe:#1a2b3c}\n',
        'mytml/theme.json': JSON.stringify({ logos: ['logos/mark.png'] }),
        'mytml/logos/mark.png': { b64: PNG },
        // ロゴがそのテーマのフォルダの外（同じテーマのフォルダの中でも）：読まない
        'evil/tokens.css': ':root{--theme-probe:#0e0e0e}\n',
        'evil/theme.json': JSON.stringify({ logos: ['../mytml/logos/mark.png'] }),
      };
      await po.goto(BASE);
      await po.waitForSelector('#drop');
      await po.evaluate(async ([deck, narr, tf]) => {
        await new Promise((r) => { const q = indexedDB.deleteDatabase('egatari-theme-folder'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
        const root = await navigator.storage.getDirectory();
        for (const n of ['thm-deck', 'thm-user']) await root.removeEntry(n, { recursive: true }).catch(() => {});
        const put = async (d, rel, v) => {
          const parts = rel.split('/'), name = parts.pop();
          for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
          const w = await (await d.getFileHandle(name, { create: true })).createWritable();
          await w.write(typeof v === 'string' ? v : Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0))); await w.close();
        };
        const d = await root.getDirectoryHandle('thm-deck', { create: true });
        await put(d, 'deck.html', deck); await put(d, 'narration.md', narr);
        const u = await root.getDirectoryHandle('thm-user', { create: true });
        for (const [k, v] of Object.entries(tf)) await put(u, k, v);
        window.__thmDeck = d; window.__thmUser = u;
        window.__putDeck = (rel, v) => put(d, rel, v);
        await window.__APP_TEST.initThemeFolder();
      }, [deckWith('mytml'), fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8'), themeFiles]);
      const tst = () => po.evaluate(() => window.__APP_TEST.themeFolder());
      const builds = () => po.evaluate(() => window.__APP_TEST.state().builds);
      const afterBuild = (n0) => po.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.builds > n && !window.__APP_TEST.state().error; }, n0, { timeout: 30000 });
      const themeWarn = (s, n = 'mytml') => s.warn.find((w) => w.startsWith(`theme not found: "${n}"`));
      const appHtml = () => po.evaluate(() => window.__APP_TEST.build({}));
      ok((await tst()).name === null && (await tst()).state === 'none', 'theme folder: none chosen at first');
      ok(await po.evaluate(() => window.__APP_TEST_OPEN(window.__thmDeck)) === true, 'theme folder: a folder deck whose theme (mytml) is not bundled opens');
      let s = await pst();
      ok(!s.error && /「テーマのフォルダを選ぶ…」/.test(themeWarn(s) || ''), 'theme folder: the build warns theme not found and names "Choose theme folder…": ' + (themeWarn(s) || '').slice(0, 90));
      ok(await po.isVisible('#notice-theme') && await po.isVisible('#notice-theme #b-theme-choose') && (await po.textContent('#notice-theme')).includes('mytml'), 'theme folder: the notice names the missing theme and offers "Choose theme folder…"');
      if (SHOTS) { await slidesNow(); await po.waitForTimeout(300); await po.screenshot({ path: path.join(SHOTS, 'theme-folder-prompt.png') }); }
      // 警告の一覧にも同じボタン。プレビューの読み込みが終わるのを待ってから板を開く：読み込み中に開くと、閉じる押下が
      // 読み直し中の iframe に届いてしまう（測定済み。試験の競合で、アプリの不具合ではない）
      await po.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
      await po.click('#b-warn');
      ok(await po.isVisible('#panel-body .theme-warn #b-theme-choose'), 'theme folder: the theme warning in the warnings panel has the button too');
      await clickUntil(po, '#panel-close', () => po.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));
      // 選ぶ（選ぶ画面の代わりに OPFS のフォルダ）→ 組み直して、そのテーマ（色とロゴ）で組む
      await po.evaluate(() => { window.__APP_TEST.themePicker = async (o) => { window.__pickOpts = o; return window.__thmUser; }; });
      let n0 = await builds();
      await po.click('#notice-theme #b-theme-choose');
      await afterBuild(n0);
      s = await pst();
      let html = await appHtml();
      ok(!themeWarn(s) && (await tst()).inBuild && (await tst()).name === 'thm-user' && !(await po.isVisible('#notice-theme')), 'theme folder: after choosing, the deck builds with the theme from the folder (no warning, notice gone)');
      ok((await po.evaluate(() => window.__pickOpts.mode)) === 'read', 'theme folder: the picker asks for read access only');
      ok(html.includes('--theme-probe:#1a2b3c') && html.includes('data:image/png;base64,' + PNG.slice(0, 20)), 'theme folder: tokens.css and the logo of the user theme are in the build (main-thread engine)');
      const fr = pframe();
      ok(!!fr && (await fr.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--theme-probe').trim())) === '#1a2b3c', 'theme folder: the preview (worker build) uses the user theme');
      // 探す順：原稿のフォルダの themes/ が先
      n0 = await builds();
      await po.evaluate(() => window.__putDeck('themes/mytml/tokens.css', ':root{--theme-probe:#654321}\n'));
      await po.evaluate(() => window.__APP_TEST.rebuild());
      html = await appHtml();
      ok(html.includes('--theme-probe:#654321') && !html.includes('--theme-probe:#1a2b3c'), 'theme folder: the deck\'s own themes/mytml wins over the user theme folder (same order as the CLI)');
      await po.evaluate(async () => { await window.__thmDeck.removeEntry('themes', { recursive: true }); });
      // 根の決まり：テーマのロゴがそのテーマのフォルダの外なら読まない
      await po.evaluate(([t]) => window.__putDeck('deck.html', t), [deckWith('evil')]);
      await po.evaluate(() => window.__APP_TEST.rebuild());
      s = await pst();
      html = await appHtml();
      ok(s.warn.some((w) => /refused: テーマのロゴ「\.\.\/mytml\/logos\/mark\.png」/.test(w)) && html.includes('--theme-probe:#0e0e0e') && !html.includes('data:image/png;base64,' + PNG.slice(0, 20)), 'theme folder: a logo outside its theme directory is refused (containment as in the CLI)');
      await po.evaluate(([t]) => window.__putDeck('deck.html', t), [deckWith('mytml')]);
      await po.evaluate(() => window.__APP_TEST.rebuild());
      // 持ち運べる 1 ファイル：使ったテーマは原稿の themes/mytml/ として入る（ほかの機械でも同じテーマで組める）
      await po.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('thm-export.ega.html', { create: true }); });
      await po.evaluate(() => document.getElementById('b-export-portable').click());
      for (let i = 0; i < 150 && !(await po.evaluate(async () => (await window.__APP_TEST.saveHandle.getFile()).size > 1000)); i++) await po.waitForTimeout(200);
      const xp = await readPortable(new Uint8Array(Buffer.from(await po.evaluate(async () => { const u = new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()); let x = ''; for (let i = 0; i < u.length; i += 0x8000) x += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(x); }), 'base64')));
      await po.evaluate(() => { window.__APP_TEST.saveHandle = null; });
      ok(!!xp.files['themes/mytml/tokens.css'] && !!xp.files['themes/mytml/theme.json'] && !!xp.files['themes/mytml/logos/mark.png'] && !xp.files['themes/evil/tokens.css'], 'theme folder: the portable export stores the user theme as themes/mytml/ (only the theme it used)');
      // 残す：読み込み直しても同じフォルダ（IndexedDB）
      await po.goto(BASE);
      await po.waitForSelector('#drop');
      await po.waitForFunction(() => window.__APP_TEST.themeFolder().name === 'thm-user', null, { timeout: 10000 });
      ok((await tst()).state === 'granted' && (await po.textContent('#w-themes-state')).includes('thm-user'), 'theme folder: remembered after a reload (handle in IndexedDB), shown on the first screen');
      // 許可の求め直し：次の訪問では許可が切れている（prompt）。知らせの「「thm-user」を使う」で求め直し、許せば組み直す
      await po.evaluate(async () => {
        const H = window.FileSystemHandle.prototype;
        window.__perm = { q: H.queryPermission, r: H.requestPermission, granted: false, asked: 0 };
        H.queryPermission = async function () { return window.__perm.granted ? 'granted' : 'prompt'; };
        H.requestPermission = async function (o) { window.__perm.asked++; window.__perm.mode = o && o.mode; window.__perm.granted = true; return 'granted'; };
        await window.__APP_TEST.initThemeFolder();
        window.__thmDeck = await (await navigator.storage.getDirectory()).getDirectoryHandle('thm-deck');
      });
      ok((await tst()).state === 'prompt' && !(await tst()).inBuild, 'theme folder: a remembered folder without permission is not read until asked');
      await po.evaluate(() => { window.__perm.granted = true; });   // デッキのフォルダを開く許可（このテストでは同じ prototype）
      await po.evaluate(() => window.__APP_TEST_OPEN(window.__thmDeck));
      await po.evaluate(() => { window.__perm.granted = false; window.__perm.asked = 0; });
      s = await pst();
      ok(!!themeWarn(s) && await po.isVisible('#notice-theme #b-theme-allow') && (await po.textContent('#notice-theme #b-theme-allow')).includes('thm-user') && /もう一度許可/.test(await po.textContent('#notice-theme')), 'theme folder: the notice offers to use the remembered folder (asks for permission again)');
      if (SHOTS) { await slidesNow(); await po.waitForTimeout(300); await po.screenshot({ path: path.join(SHOTS, 'theme-folder-allow.png') }); }
      n0 = await builds();
      await po.click('#notice-theme #b-theme-allow');
      await afterBuild(n0);
      s = await pst();
      ok((await po.evaluate(() => window.__perm.asked)) === 1 && (await po.evaluate(() => window.__perm.mode)) === 'read' && !themeWarn(s) && (await tst()).inBuild, 'theme folder: permission is requested again (read) and the deck builds with the theme');
      await po.evaluate(() => { const H = window.FileSystemHandle.prototype; H.queryPermission = window.__perm.q; H.requestPermission = window.__perm.r; });
      // 設定の窓（「開く ▾」の「テーマのフォルダ…」）：今のフォルダとテーマの名前。忘れる → 知らせが戻り、読み込み直しても選んでいない
      await po.evaluate(() => document.getElementById('b-themes').click());
      await po.waitForSelector('#dlg[open] #dlg-forget');
      ok((await po.textContent('#theme-now')).includes('thm-user') && (await po.textContent('#theme-names')).includes('evil, mytml') && !!(await po.$('#dlg-choose')), 'theme folder: the settings dialog shows the folder and its themes, with Change and Forget');
      if (SHOTS) await po.screenshot({ path: path.join(SHOTS, 'theme-folder-dialog.png') });
      n0 = await builds();
      await clickDlg(po, '#dlg-forget');
      await afterBuild(n0);
      s = await pst();
      ok(!!themeWarn(s) && (await tst()).name === null && !(await tst()).inBuild && await po.isVisible('#notice-theme #b-theme-choose'), 'theme folder: Forget → the deck builds without it again and the notice is back');
      await po.goto(BASE);
      await po.waitForSelector('#drop');
      await po.waitForTimeout(300);
      ok((await tst()).name === null, 'theme folder: forgotten after a reload too (removed from IndexedDB)');
      // 空のフォルダ（テーマがない）は選ばない
      await po.evaluate(async () => { const root = await navigator.storage.getDirectory(); const e = await root.getDirectoryHandle('thm-empty', { create: true }); window.__APP_TEST.themePicker = async () => e; document.getElementById('w-themes').click(); });
      await po.waitForSelector('#dlg[open] #dlg-choose');
      await clickDlg(po, '#dlg-choose');
      await po.waitForTimeout(300);
      ok((await tst()).name === null && /テーマ（<名前>\/tokens\.css）が見つかりません/.test(await po.textContent('#toast')), 'theme folder: a folder without themes is not taken (says so)');
      await po.evaluate(() => { window.__APP_TEST.themePicker = null; });
    }
    await po.close();
  }

  // ---------------------------------------------------------------- 10c. 再生専用の書き出し・最近開いたもの（1 ファイル）・Safari の注意・TTS のモデルのキャッシュ
  {
    const pq = await browser.newPage({ locale: 'ja-JP' });
    watch(pq, 'play-recent');
    await pq.goto(BASE);
    await pq.waitForSelector('#drop');
    ok(await pq.isHidden('#save-note'), 'welcome: no download-save note when the save picker exists');
    // OPFS の pq/ に 1 ファイル（開く）と、書き出し先のファイル
    await pq.evaluate(async ([b64, ext, files]) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('pq', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('pq', { create: true });
      const h = await d.getFileHandle('lesson' + ext, { create: true });
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = await h.createWritable(); await w.write(u); await w.close();
      const deck = await d.getDirectoryHandle('deck', { create: true });
      for (const [k, v] of Object.entries(files)) { const fh = await deck.getFileHandle(k, { create: true }); const fw = await fh.createWritable(); await fw.write(v); await fw.close(); }
      window.__pq = { d, h, deck };
    }, [Buffer.from(pmin.html).toString('base64'), FORMAT.FILE_EXT, files]);
    const readOut = async (name) => {
      let x = '';
      for (let i = 0; i < 900 && x.length < 1000; i++) {   // 作業フォルダは組んでから書く（npm test の負荷の下では 30 秒を超えることがある）
        await pq.waitForTimeout(100);
        x = await pq.evaluate(async (name) => { try { return await (await (await window.__pq.d.getFileHandle(name)).getFile()).text(); } catch { return ''; } }, name);
      }
      return x;
    };
    const kindOf = async (html) => { try { await readPortable(html); return 'source'; } catch (e) { return (e.details && e.details.kind) || e.code; } };
    const exportPlay = async (name) => {
      await pq.evaluate(async (name) => { window.__APP_TEST.saveHandle = await window.__pq.d.getFileHandle(name, { create: true }); }, name);
      await clickMenuOpen(pq, '#b-exportmenu');
      ok(await pq.isVisible('#b-export-play'), `play-only (${name}): the Export menu has Export play-only copy`);
      await pq.evaluate(() => document.getElementById('b-export-play').click());
      const x = await readOut(name);
      if (!x) console.log('       (toast: ' + await pq.textContent('#toast') + ' / status: ' + await pq.textContent('#st-msg') + ' / state: ' + JSON.stringify(await pq.evaluate(() => { const s = window.__APP_TEST.state(); return { dirty: s.portable && s.portable.dirty, loads: s.loads, error: s.error }; })) + ')');
      await pq.evaluate(() => { window.__APP_TEST.saveHandle = null; });
      return x;
    };
    // 1 ファイル：開いて、再生専用を書き出す → 原稿（索引）のない再生専用。同じ docId
    const n0 = await pq.evaluate(() => window.__APP_TEST.state().loads);
    ok(await pq.evaluate(() => window.__APP_TEST.openFile({ handle: window.__pq.h })) === true, 'play-only: opened a single file');
    await pq.waitForFunction((n) => window.__APP_TEST.state().loads > n, n0, { timeout: 20000 });
    let po = await exportPlay('lesson.play.html');
    ok(await kindOf(po) === 'play-only' && po.includes(pmin.index.docId) && !scanDocument(po).byId.has(FORMAT.INDEX_ID), `play-only (single file): exported a play-only file (${(po.length / 1024).toFixed(0)} KB, same docId, no index)`);
    // 最近開いたもの：1 ファイルも並び、そこから開き直せる
    await pq.reload();
    await pq.waitForSelector('#recent:not([hidden])');
    ok(await pq.isVisible('#recent-list li[data-kind=file]') && (await pq.textContent('#recent-list li[data-kind=file] .nm')) === 'lesson' + FORMAT.FILE_EXT && (await pq.textContent('#recent-list li[data-kind=file] .kind')) === '1 ファイル', 'recent: the opened single file is listed (marked as a single file)');
    await pq.click('#recent-list li[data-kind=file] button:not(.ghost)');
    await pq.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0; }, null, { timeout: 20000 });
    ok((await pq.evaluate(() => window.__APP_TEST.state().portable.name)) === 'lesson' + FORMAT.FILE_EXT, 'recent: reopened the single file from the list');
    await pq.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('pq'); window.__pq = { d, deck: await d.getDirectoryHandle('deck') }; });   // 読み直しで消えたハンドル
    // 作業フォルダ：再生専用も書き出せる
    const n1 = await pq.evaluate(() => window.__APP_TEST.state().loads);
    ok(await pq.evaluate(() => window.__APP_TEST_OPEN(window.__pq.deck)) === true, 'play-only: opened a working folder');
    await pq.waitForFunction((n) => window.__APP_TEST.state().loads > n, n1, { timeout: 20000 });
    po = await exportPlay('deck.play.html');
    ok(await kindOf(po) === 'play-only', 'play-only (working folder): exported a play-only file' + (po ? '' : ': ' + await pq.textContent('#toast')));
    // TTS のモデルのキャッシュ：「使い方」に使用量と入っているモデル。「モデルを消す」で消える（ほかのキャッシュは残る）
    await pq.evaluate(async () => {
      const c = await caches.open('irodori-lab-000000000000');
      await c.put('https://huggingface.co/x/dit.onnx', new Response(new Uint8Array(1000), { headers: { 'content-length': '1000' } }));
      await (await caches.open('other-cache')).put('https://example.org/a', new Response('a'));
    });
    await pq.click('#b-help');
    await pq.waitForFunction(() => /Irodori-TTS/.test((document.getElementById('model-cache-info') || {}).textContent || ''));
    const info = await pq.textContent('#model-cache-info');
    await shot(pq, 'help-model-cache.png');
    ok(/保存領域を [\d.]+ [MG]B 使っています/.test(info) && info.includes('版 000000000000') && !(await pq.isDisabled('#b-model-delete')), 'model cache: Help shows storage use and the stored model');
    await pq.click('#b-model-delete');
    await pq.waitForSelector('#dlg[open] #dlg-delete');
    await clickDlg(pq, '#dlg-delete');
    await pq.waitForFunction(() => /入っていません/.test(document.getElementById('model-cache-info').textContent));
    ok(JSON.stringify(await pq.evaluate(() => caches.keys())) === '["other-cache"]' && await pq.isDisabled('#b-model-delete'), 'model cache: Delete models removes the model caches only');
    await pq.evaluate(() => caches.delete('other-cache'));
    await pq.close();
    // Safari・iPad の形（フォルダとファイルを選ぶ画面がない）：新しく作る道（貼り付け）と、保存がダウンロードになる注意
    const ps = await browser.newPage({ locale: 'ja-JP' });
    watch(ps, 'safari');
    await ps.addInitScript(() => { delete window.showDirectoryPicker; delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete Window.prototype.showDirectoryPicker; delete Window.prototype.showSaveFilePicker; delete Window.prototype.showOpenFilePicker; });
    await ps.goto(BASE);
    await ps.waitForSelector('#drop');
    ok(await ps.isVisible('#unsupported') && (await ps.textContent('#unsupported')).includes('「チャットの AI に書いてもらう」') && !(await ps.isDisabled('#w-new')) && !(await ps.$('#w-paste')), 'safari: the note says how to make a new lesson (新規作成… → チャットの AI に書いてもらう); 新規作成… stays on');
    await ps.click('#w-new');
    await ps.waitForSelector('#dlg[open] #dlg-new-ai');
    ok(!(await ps.$('#dlg-new-blank')) && !(await ps.$('#dlg-new-template')) && await ps.isVisible('#new-nofolder'), 'safari: 新規作成… offers only the chat AI (no working folders), and says why');
    await ps.click('#dlg-cancel');
    ok(await ps.isVisible('#save-note') && (await ps.textContent('#save-note')).includes('新しいファイル'), 'safari: the welcome screen says each save downloads a new file');
    await shot(ps, 'welcome-safari.png');
    await ps.close();
  }

  // ---------------------------------------------------------------- 11. 英語の画面
  const pe = await browser.newPage({ locale: 'en-US' });
  watch(pe, 'en');
  await pe.goto(BASE);
  ok((await pe.textContent('#welcome h1')) === 'Open a single file (.ega.html) to view and edit', 'i18n: English UI for en locale');
  // 書き出した写しで直したもの：英語の知らせ（両方の文）。編集は断らない
  await pe.evaluate(async (b64) => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('exported-edited.ega.html', { create: true });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = await h.createWritable(); await w.write(u); await w.close();
    await window.__APP_TEST.openFile({ handle: h });
  }, fs.readFileSync(path.join(PW, 'exported-edited' + FORMAT.FILE_EXT)).toString('base64'));
  await pe.waitForSelector('#notice-exported', { timeout: 30000 });
  { const t = await pe.textContent('#notice-exported');
    ok(t.startsWith("This is a copy exported from a lesson folder. Changes made here do not go back into the folder. To bring them back, use 'Export working folder'.") && t.includes('This copy has been edited since it was exported.') && (await pe.textContent('#b-exported-unpack')) === 'Export working folder…', 'exportedFrom: the notice in English (both sentences) and the "Export working folder…" button');
    const st = await pe.evaluate(() => window.__APP_TEST.state().portable);
    ok(st && st.readOnly === null && !st.tierAOnly, 'exportedFrom: the exported copy stays editable (not read-only)'); }
  await pe.close();

  // ---------------------------------------------------------------- 12. 1 ファイル版（file://）
  const p1 = await browser.newPage({ locale: 'ja-JP' });
  watch(p1, 'single');
  await p1.goto(pathToFileURL(path.join(DIST, 'editor.html')).href);
  await p1.waitForSelector('#drop');
  ok(await p1.evaluate(() => typeof window.showDirectoryPicker === 'function' && isSecureContext), 'single file: File System Access API available on file://');
  ok(await p1.evaluate(() => [...document.querySelectorAll('link[rel=icon]')].map((l) => l.getAttribute('href').slice(0, 23)).join() === 'data:image/x-icon;base6,data:image/x-icon;base6' && /^data:image\/png;base64,/.test(document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')) && !document.querySelector('link[rel=manifest]')), 'single file: icons embedded as data: URIs, no manifest');
  ok(await p1.isHidden('#examples'), 'single file: no examples list on file:// (the examples are files of the site)');
  // file:// では OPFS が使えないので、メモリの上のフォルダ（同じ形のハンドル）で開く
  await p1.evaluate((files) => {
    class FileH { constructor(name, text) { this.kind = 'file'; this.name = name; this.text = text; this.m = Date.now(); }
      async getFile() { return new File([this.text], this.name, { lastModified: this.m }); }
      async createWritable() { const self = this; let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { self.text = buf; self.m = Date.now(); } }; }
      async isSameEntry(o) { return o === this; } }
    class DirH { constructor(name) { this.kind = 'directory'; this.name = name; this.c = new Map(); }
      async *entries() { for (const e of this.c) yield e; } async *keys() { for (const k of this.c.keys()) yield k; }
      async getFileHandle(n, o = {}) { let h = this.c.get(n); if (!h) { if (!o.create) throw new DOMException('no', 'NotFoundError'); h = new FileH(n, ''); this.c.set(n, h); } if (h.kind !== 'file') throw new DOMException('dir', 'TypeMismatchError'); return h; }
      async getDirectoryHandle(n, o = {}) { let h = this.c.get(n); if (!h) { if (!o.create) throw new DOMException('no', 'NotFoundError'); h = new DirH(n); this.c.set(n, h); } return h; }
      async removeEntry(n) { this.c.delete(n); } async isSameEntry(o) { return o === this; } }
    const d = new DirH('memdeck');
    for (const [k, v] of Object.entries(files)) d.c.set(k, new FileH(k, v));
    window.__mem = d;
  }, files);
  ok(await p1.evaluate(() => window.__APP_TEST_OPEN(window.__mem)) === true, 'single file: opened a folder');
  await p1.waitForFunction(() => window.__APP_TEST.state().loads > 0 && !window.__APP_TEST.state().error, null, { timeout: 20000 });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { const fr = p1.frames().find((x) => x.parentFrame() === p1.mainFrame()); try { ready = !!(fr && await fr.evaluate(() => window.DECK && DECK.ready)); } catch { /* 読み込み中 */ } if (!ready) await p1.waitForTimeout(100); }
  ok(ready, 'single file: preview renders from file:// (fonts embedded)');
  // 音声の板：1 ファイル版では TTS の窓がないので、ボタンは押せず、録音を先に勧めて配信版を案内する
  await p1.click('#b-audio');
  await p1.waitForSelector('#dev-audio-ttsinfo');
  ok(await p1.evaluate(() => document.getElementById('dev-audio-tts').disabled && /1 ファイル版のエディタ（file:\/\/）では使えません/.test(document.getElementById('dev-audio-ttsinfo').textContent) && /録音/.test(document.getElementById('dev-audio-ttsinfo').textContent)), 'single file: the Audio panel says TTS is not available on file:// and suggests recording');
  await p1.click('#dev-audio .dv-ghost');
  // 持ち運べる 1 ファイル：file:// でも Worker で読める。ファイルを選ぶ画面がなければ「保存」はダウンロード
  await p1.evaluate(() => { window.showSaveFilePicker = undefined; });
  const l1 = await p1.evaluate(() => window.__APP_TEST.state().loads);
  ok(await p1.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'dl' + ext }); }, [Buffer.from(pmin.html).toString('base64'), FORMAT.FILE_EXT]) === true, 'single file: opened a portable file from bytes on file:// (reader worker from a blob URL)');
  await p1.waitForFunction((n) => window.__APP_TEST.state().loads > n, l1, { timeout: 20000 });
  const [dl] = await Promise.all([p1.waitForEvent('download'), p1.click('#b-save')]);
  const dlr = await readPortable(new Uint8Array(fs.readFileSync(await dl.path())));
  ok(dl.suggestedFilename() === 'dl' + FORMAT.FILE_EXT && dlr.docId === pmin.index.docId, `single file: Save without a file handle or picker downloads ${dl.suggestedFilename()} (same docId)`);
  await p1.close();

  // ---------------------------------------------------------------- 12b. チャットの AI との行き来：貼り付け・修正依頼（tools/test-app-llm.mjs）
  await testLlm({ browser, BASE, ok, watch, shotDir: SHOTS });

  // ---------------------------------------------------------------- 12c. スライド一覧：足す・複製・削除（元に戻す）・並べ替え（tools/test-app-slides.mjs）
  await testAppSlides({ browser, BASE, ok, watch, work, shotDir: SHOTS });

  // ---------------------------------------------------------------- 13. サイトの形（GitHub Pages）：根と下のパスの両方
  // 根 = 配信版の編集アプリ、/editor/ = 前の場所（根へ移す。問い合わせと # を残す）、/editor.html = 1 ファイル版、/lab/irodori.html = 試験ページ
  for (const base of [BASE, BASE + SUB]) {
    const tag = base === BASE ? 'root' : 'subpath';
    const ps = await browser.newPage({ locale: 'ja-JP' });
    watch(ps, 'site-' + tag);
    await ps.goto(base);
    await ps.waitForSelector('#drop');
    ok(await ps.evaluate(() => [...document.styleSheets].some((x) => x.href && x.href.endsWith('/app.css')) && document.title === 'Egatari Studio'), `site (${tag}): the editor loads at ${base}`);
    await ps.goto(base + 'editor/?lang=en#x');
    await ps.waitForURL(base + '?lang=en#x', { timeout: 10000 }).catch(() => {});
    await ps.waitForSelector('#drop');
    ok(ps.url() === base + '?lang=en#x' && (await ps.textContent('#welcome h1')) === 'Open a single file (.ega.html) to view and edit', `site (${tag}): editor/?lang=en#x redirects to ${ps.url()} (English UI)`);
    // スクリプトが動かなくても行ける：meta refresh とリンク（ページを開くと移ってしまうので、HTML を読んで確かめる）
    const stub = await (await fetch(base + 'editor/')).text();
    ok(/<meta http-equiv="refresh" content="0; url=\.\.\/">/.test(stub) && /<a href="\.\.\/">/.test(stub) && /location\.replace/.test(stub), `site (${tag}): editor/ also has a meta refresh and a link to ../`);
    await ps.goto(base + 'editor.html');
    await ps.waitForSelector('#drop');
    ok(await ps.evaluate(() => typeof window.__FONTPACK === 'object'), `site (${tag}): editor.html (single file) loads`);
    const lr = await ps.goto(base + 'lab/irodori.html');
    await ps.waitForLoadState('load');
    ok(lr.status() === 200 && (await ps.title()).length > 0 && await ps.evaluate(() => document.querySelectorAll('script[type=module]').length > 0), `site (${tag}): lab/irodori.html loads`);
    // ロゴ（assets/logo/）：ファビコン（明るい・暗い）・apple-touch-icon・manifest（192・512）。見出しのロゴ。.ega.html の再生には入れない
    const ico = new Uint8Array(await (await fetch(base + 'favicon.ico')).arrayBuffer());
    const icoDark = await fetch(base + 'favicon-dark.ico');
    ok(ico.length > 100 && ico[0] === 0 && ico[2] === 1 && ico[4] === 3 && icoDark.status === 200, `site (${tag}): favicon.ico (3 sizes) and favicon-dark.ico are served`);
    const man = await (await fetch(base + 'manifest.webmanifest')).json().catch(() => null);
    const manIcons = man && Array.isArray(man.icons) ? await Promise.all(man.icons.map(async (x) => (await fetch(new URL(x.src, base + 'manifest.webmanifest'))).status)) : [];
    ok(!!man && man.name === 'Egatari Studio' && man.icons.map((x) => x.sizes).join() === '192x192,512x512' && manIcons.every((x) => x === 200) && (await fetch(base + 'apple-touch-icon.png')).status === 200, `site (${tag}): manifest with 192/512 icons and apple-touch-icon`);
    await ps.goto(base);
    await ps.waitForSelector('#drop');
    ok(await ps.evaluate(() => !!document.querySelector('link[rel=icon][href="favicon.ico"]') && !!document.querySelector('link[rel=icon][media="(prefers-color-scheme: dark)"][href="favicon-dark.ico"]') && !!document.querySelector('link[rel=manifest]') && !!document.querySelector('#top .brand svg.logo circle.sun')), `site (${tag}): icon links and the header logo`);
    if (tag === 'root') {
      // 約 1 秒を超える待ち（見本を開く）：はじめの画面の上にロゴを描く。すぐ終わるときは出さない
      await ps.route('**/examples/minimal' + FORMAT.FILE_EXT, async (route) => { await new Promise((r) => setTimeout(r, 1800)); await route.continue(); });
      await ps.click('#examples-list li[data-example="minimal"] button');
      ok(await ps.waitForSelector('#wait:not([hidden]) img.wait-logo', { timeout: 4000 }).then(() => true).catch(() => false), 'wait: a slow open draws the logo after about 1 s');
      await ps.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0; }, null, { timeout: 30000 }).catch(() => {});
      ok(await ps.evaluate(() => document.getElementById('wait').hidden && !document.querySelector('.wait-logo')), 'wait: the logo is gone once the deck is shown');
      await ps.unroute('**/examples/minimal' + FORMAT.FILE_EXT);
    }
    // 見本の持ち運べる 1 ファイル（dist/examples/）：配られていて、はじめの画面の一覧から開ける（相対の場所なので下のパスでも）
    const exOk = [];
    for (const name of EXAMPLES) { const r = await fetch(base + 'examples/' + name + FORMAT.FILE_EXT); exOk.push(r.status === 200 && (await r.text()).includes(FORMAT.INDEX_ID)); }
    ok(exOk.every(Boolean), `site (${tag}): dist/examples/ serves ${EXAMPLES.length} portable examples`);
    if (tag === 'root') {
      const ex = await (await fetch(base + 'examples/minimal' + FORMAT.FILE_EXT)).text();
      ok(!ex.includes('M84 40H40V152') && !ex.includes('egatari-draw'), 'logo: the .ega.html player does not contain the logo');
    }
    await ps.goto(base);
    await ps.waitForSelector('#examples-list li[data-example="minimal"] button');
    await ps.click('#examples-list li[data-example="minimal"] button');
    await ps.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.name === n && s.loads > 0 && !s.error; }, 'minimal' + FORMAT.FILE_EXT, { timeout: 30000 }).catch(() => {});
    ok(await ps.evaluate((n) => { const s = window.__APP_TEST.state(); return !!(s.portable && s.portable.name === n && !s.error); }, 'minimal' + FORMAT.FILE_EXT), `site (${tag}): the minimal example opens from the first screen`);
    await ps.close();
  }

  // ---------------------------------------------------------------- 13b. 版ごとの URL（#32）：根 = 最新版、/vX.Y.Z/ = 凍結した写し
  {
    const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    fs.rmSync(SITE, { recursive: true, force: true });
    fs.cpSync(DIST, SITE, { recursive: true });
    const OLD = path.join(work, 'old-site');   // 版の案内を持たない古い版の代わり（決まりの <meta> のあるページだけ）
    fs.rmSync(OLD, { recursive: true, force: true });
    fs.mkdirSync(OLD);
    fs.writeFileSync(path.join(OLD, 'index.html'), fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8').replace(/<body>[\s\S]*<\/body>/, '<body><h1>old</h1></body>').replace(/<!--APP_\w+-->/g, ''));
    const gz = packSite(OLD);
    const r = assemble({ site: SITE, current: cur, releases: [{ version: '0.0.1', buf: gz, body: shaLine('0.0.1', sha256(gz)) }], log: () => {} });
    ok(r.versions.join() === `${cur},0.0.1` && r.injected['0.0.1'], `versions: assembled the site (root v${cur}, /v${cur}/, /v0.0.1/ with the notice script added)`);
    const SB = BASE + SITEP;
    for (const lang of ['ja', 'en']) {
      const pv = await browser.newPage({ locale: lang === 'en' ? 'en-US' : 'ja-JP' });
      watch(pv, 'versions-' + lang);
      const reqs = [];
      pv.on('request', (q) => reqs.push(q.url()));
      // 根：はじめの画面の下に版の一覧。凍結の知らせはない
      await pv.goto(SB + '?lang=' + lang);
      await pv.waitForSelector('#version-line select', { timeout: 10000 }).catch(() => {});
      const root = await pv.evaluate(() => ({ line: document.getElementById('version-line')?.textContent || '', opts: [...document.querySelectorAll('#version-pick option')].map((o) => o.value + (o.selected ? '*' : '')), note: !!document.getElementById('version-note') }));
      ok(root.line.includes('v' + cur) && root.opts.join() === `${cur}*,0.0.1` && !root.note, `versions (${lang}): the root shows v${cur} and a list of versions, no frozen notice ${JSON.stringify(root)}`);
      // 根で古い版を選ぶ → /v0.0.1/（?lang は残す）
      await Promise.all([pv.waitForURL(SB + 'v0.0.1/?lang=' + lang, { timeout: 10000 }).catch(() => {}), pv.selectOption('#version-pick', '0.0.1')]);
      await pv.waitForSelector('#version-note', { timeout: 10000 }).catch(() => {});
      const old = await pv.evaluate(() => ({ url: location.href, text: document.getElementById('version-note')?.textContent || '', href: document.getElementById('version-latest')?.href || '' }));
      ok(old.url === SB + 'v0.0.1/?lang=' + lang && old.text.includes('v0.0.1') && old.href === SB + '?lang=' + lang, `versions (${lang}): choosing v0.0.1 opens the old copy; its added notice says v0.0.1 and links to the latest ${JSON.stringify(old)}`);
      // 今の版の写し：編集アプリそのもの（資源はその下から読む）。知らせは「これが最新」
      reqs.length = 0;
      await pv.goto(SB + `v${cur}/?lang=` + lang);
      await pv.waitForSelector('#drop');
      await pv.waitForSelector('#version-note', { timeout: 10000 }).catch(() => {});
      const fz = await pv.evaluate(() => ({ text: document.getElementById('version-note')?.textContent || '', href: document.getElementById('version-latest')?.href || '', line: !!document.getElementById('version-line'), opts: [...document.querySelectorAll('#version-pick option')].map((o) => o.value + (o.selected ? '*' : '')) }));
      const own = reqs.filter((u) => /\/(app\.js|app\.css)$/.test(u));
      ok(fz.text.includes('v' + cur) && fz.href === SB + '?lang=' + lang && !fz.line && fz.opts.join() === `${cur}*,0.0.1` && own.length === 2 && own.every((u) => u.startsWith(SB + `v${cur}/`)),
        `versions (${lang}): /v${cur}/ is the editor itself (its own app.js and app.css), with the frozen notice, a link to the latest and the version list ${JSON.stringify({ ...fz, own })}`);
      ok(lang === 'en' ? /frozen copy/.test(fz.text) : /凍結/.test(fz.text), `versions (${lang}): the notice is in the UI language`);
      if (lang === 'ja') {
        await shot(pv, 'version-frozen.png');
        // 写しでも見本を開ける（相対の場所）
        await pv.click('#examples-list li[data-example="minimal"] button');
        await pv.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0; }, null, { timeout: 30000 }).catch(() => {});
        ok(await pv.evaluate(() => { const s = window.__APP_TEST.state(); return !!(s.portable && !s.error); }), `versions: the minimal example opens in /v${cur}/`);
        // 写しの TTS の窓・試験ページ（lab/）も、その写しの下にある
        ok((await fetch(SB + `v${cur}/lab/tts-helper.html`)).status === 200 && (await fetch(SB + 'v0.0.1/index.html')).status === 200, 'versions: lab/ is served inside the frozen copy');
        // 知らせを隠す
        await pv.click('#version-note button');
        ok(!(await pv.$('#version-note')), 'versions: the notice can be hidden');
      }
      await pv.close();
    }
  }
} catch (e) {
  console.error(e);
  fails++;
  await shot(page, 'failure.png').catch(() => {});
} finally {
  ok(errs.length === 0, 'no console errors' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await browser.close();
  srv.close();
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
