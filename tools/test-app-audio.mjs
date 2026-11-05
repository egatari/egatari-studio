// 編集アプリ（app/）のプレビューで音声が鳴ること（backlog #49）：test-app から分けた音声の確かめ（backlog #156）
//   node tools/test-app-audio.mjs [作業用のフォルダ]
// 時間に敏感（自動再生で currentTime が進むこと）なので、ほかの段と同時に走らせない。test-app はほかの段と同時に走らせてよい
// 1. examples/minimal ＋ dry-run の音声の 1 ファイル（test-app と同じ作り方）と、それを npm run portable -- unpack で展開したフォルダを作る
// 2. tools/build-app.mjs で組んだ dist/ を 127.0.0.1 で配り、1 ファイル（メモリの作業場所）・発表者ビュー・展開したフォルダで鳴ることを確かめる。コンソールのエラーが無いこと
// test-all: serial
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { unpack } from './portable.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { clickCommand } from './click-retry.mjs';
import { exampleRand } from './examples-portable.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-app-audio-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 1. 1 ファイルと展開したフォルダ（test-app の 0. と同じ作り方）
const MINI = assignIds(fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), 'utf8'), { rand: exampleRand('minimal') });
function prepareDeck(dir, metadata) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.writeFileSync(path.join(dir, 'deck.html'), MINI.deck); fs.writeFileSync(path.join(dir, 'narration.md'), MINI.narration);
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
const MINF = 'min' + FORMAT.FILE_EXT;
const pmin = await buildPortable(prepareDeck(path.join(PW, 'min'), { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author, Minimal lesson', creators: ['Test Author'] }), { out: path.join(PW, MINF) });
fs.writeFileSync(path.join(PW, MINF), pmin.html);
const U = path.join(PW, 'unpacked');
const u = await unpack(path.join(PW, MINF), U);

// ---------------------------------------------------------------- 2. 組んで配る
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain', '.md': 'text/plain', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
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
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  if (process.env.APP_DEBUG) p.on('console', (m) => console.log(`    [${tag} ${m.type()}] ${m.text()}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
};
watch(page, 'main');

// プレビューの枠（スライド一覧の縮図の枠 sl-thumbs は除く）
const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
async function frameReady(timeout = process.platform === 'win32' ? 40000 : 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = deckFrame();
    const want = await page.evaluate(() => window.__APP_TEST.state().loads);
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.DECK_DEV && window.__APP_LOAD === w), want)) { await page.waitForTimeout(120); return f; } } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
const loads = () => page.evaluate(() => window.__APP_TEST.state().loads);
async function waitLoads(n, timeout = 30000) {
  await page.waitForFunction((n) => window.__APP_TEST.state().loads > n, n, { timeout });
  return frameReady();
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
    // 結果は最後の play() のものだけ：前の play() は、次の play()・load で中断されると AbortError で終わる（メディアのふつうの動き。ほかの段と同時に走る CI で起きた）
    HTMLMediaElement.prototype.play = function () { const id = window.__plays = (window.__plays || 0) + 1; window.__au = this; window.__auRes = null; const r = pl.call(this); r.then(() => { if (window.__plays === id) window.__auRes = 'ok'; }, (e) => { if (window.__plays === id) window.__auRes = e.name; }); return r; };
  });
  const pg = await cx.newPage();
  watch(pg, tag);
  try {
    await pg.goto(BASE);
    await pg.waitForSelector('#drop');
    const l0 = await pg.evaluate(() => window.__APP_TEST.state().loads);
    await pg.evaluate(([b64, ext]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'min' + ext }); }, [Buffer.from(html).toString('base64'), FORMAT.FILE_EXT]);
    await pg.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.loads > n && s.frameLoaded === s.loads; }, l0, { timeout: scaled(30000) });
    await pg.waitForTimeout(2500);   // 音声のバイトがプレビューに届き、blob: になるまで
    const [pop] = await Promise.all([cx.waitForEvent('page'), clickCommand(pg, '#b-presenter')]);
    watch(pop, tag + ' presenter');
    let pv = null;
    for (let i = 0; i < 200 && !pv; i++) { const x = pop.frames().find((y) => y.parentFrame() === pop.mainFrame()); try { if (x && await x.evaluate(() => !!document.getElementById('pv'))) pv = x; } catch { /* 読み込み中 */ } if (!pv) await pop.waitForTimeout(100); }
    if (!pv) { ok(false, `${tag}: presenter view did not load`); return; }
    await pop.waitForTimeout(800);
    await pv.click('#pv-notes');
    await pop.keyboard.press('a');
    const fr = pg.frames().find((y) => y.parentFrame() === pg.mainFrame());
    let st = null;
    // AbortError（読み込み直しなどで中断された play()）では止めず、次の play() を待つ。ほかの失敗（NotAllowedError など）はすぐ落とす
    for (let i = 0; i < 150; i++) {
      await pg.waitForTimeout(100);
      st = await fr.evaluate(() => ({ res: window.__auRes || null, src: window.__au ? window.__au.src : null, t: window.__au ? window.__au.currentTime : 0, muted: window.__au ? window.__au.muted : null, plays: window.__plays || 0 }));
      if ((st.res && st.res !== 'ok' && st.res !== 'AbortError') || (st.res === 'ok' && st.t > 0)) break;
    }
    ok(st.res === 'ok' && st.t > 0 && st.muted === false && /^blob:/.test(st.src || ''), `${tag}: autoplay started in the presenter view plays the preview's audio (not muted) ${JSON.stringify(st)}`);
    const plays = [];
    for (const x of [pv, ...pv.childFrames()]) plays.push(await x.evaluate(() => window.__plays || 0).catch(() => -1));
    ok(plays.length === 3 && plays.every((n) => n === 0), `${tag}: the presenter view itself plays nothing (no double playback) ${JSON.stringify(plays)}`);
    await pop.keyboard.press('a');
  } finally { await cx.close(); }
}

try {
  await page.goto(BASE);
  await page.waitForSelector('#drop');

  // 1 ファイル（メモリの作業場所）：OPFS の pf/ に置いたファイルのハンドルで開く（test-app の 10b と同じ）
  await page.evaluate(async ([name, b64]) => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle('pf', { create: true });
    const h = await d.getFileHandle(name, { create: true });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = await h.createWritable(); await w.write(u); await w.close();
    (window.__pf ||= {})[name] = h;
  }, [MINF, Buffer.from(pmin.html).toString('base64')]);
  let n = await loads();
  ok(await page.evaluate((name) => window.__APP_TEST.openFile({ handle: window.__pf[name] }), MINF) === true, 'portable: opened the minimal portable file without a folder');
  const f = await waitLoads(n);
  ok((await page.evaluate(() => window.__APP_TEST.state().kind)) === 'memory', 'portable: in-memory workspace');
  await previewAudioPlays(f, 'preview audio (single file in memory)');
  await presenterAudioPlays(pmin.html, 'presenter audio');

  // 展開したフォルダ（npm run portable -- unpack）を OPFS に写し、フォルダとして開く
  const files = Object.fromEntries(u.written.map((k) => [k, fs.readFileSync(path.join(U, k)).toString('base64')]));
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('unpacked', { recursive: true }).catch(() => {});
    const top = await root.getDirectoryHandle('unpacked', { create: true });
    for (const [rel, b64] of Object.entries(files)) {
      const parts = rel.split('/'); const name = parts.pop(); let d = top;
      for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
      const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(a); await w.close();
    }
    (window.__dirs ||= {}).unpacked = top;
  }, files);
  n = await loads();
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dirs.unpacked)) === true, `export folder: the unpacked folder opens as a folder (${u.written.length} files)`);
  await previewAudioPlays(await waitLoads(n), 'preview audio (folder)');
} catch (e) {
  console.error(e);
  fails++;
} finally {
  ok(errs.length === 0, 'no console errors' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await browser.close();
  srv.close();
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
