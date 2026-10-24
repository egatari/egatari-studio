// 編集アプリ（app/）の音声の板の確認（app/audio-panel.js）
//   node tools/test-audio.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// Chromium の偽のマイク（--use-fake-device-for-media-stream と、作った音声のファイル --use-file-for-fake-audio-capture）で録音し、
// TTS は差し替え（モデルを取りに行かない）。録音は録音モードだけ（#82）：板の「● 録音 (r)」がその段階で録音モードを開き、
// Space で録って Space で止め、Esc で板に戻ると、板がその段階の新しい音声を見せる。確かめること：
//   フォルダ：板はプレビューの外・保存の場所の表示・「● 録音 (r)」で録音モード（その段階・板は隠れて開いたまま）・メーター・プレビューは inert・
//     録ったらすぐ使う（audio/rec_<hash>.mp3 と audio/manifest.json（kind recorded・sync none・inputHash）と控え・最新の印）・
//     Esc で板に戻る（フォーカスは「● 録音」）・音量の調整・音が割れた知らせ・600 秒の上限（試験では短く）・書けなかったテイクは
//     「まだ使っていない音声」に残る・マイクを使えない知らせ・録り直し・「前に戻す」→
//     口述原稿を直すと「古い」の印と警告 → TTS（差し替え）で作り直す：読み辞書を通した文・{mark} の区切りの cues・recipe（processing・dictionary）・最新に戻る →
//     前処理の版（recipe.textNormalize を書く。古い版の一覧は出さない。#83）・
//     声の欄（見本・voice.json・知らない声は知らせて既定の声。自分の参照音声の名前の知らせはそのまま見える）・掛け合いの読む原稿の印・Esc で窓を閉じる（上から 1 つずつ・Shift で全部）
//   組み立て：deck-audio に音声の kind（tts・recorded。dry-run は付けない。1 ファイルにも）
//   持ち運べる 1 ファイル：権利の確認のあと録音して使い、「保存」が段 A（音声の段階だけが変わる）で、読み戻すと録音の記録と MP3 の塊
//   プレビューからの知らせでは録音を始められない（板の中身も変わらない）。コンソールのエラーがない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable, build } from '../kit/build.mjs';
import * as PF from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { encodeWav, MP3 } from '../kit/core/audio-core.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { regionDiff } from './tier-a-diff.mjs';
import { clickUntil, clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-audio-')));
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

// ---------------------------------------------------------------- 偽のマイクの音（0.4 秒の無音、話し声らしい音 2.2 秒、0.6 秒の無音。48 kHz）
const SR = 48000;
function speechy(sec, amp) {
  const n = Math.round(sec * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR; ph += (2 * Math.PI * (150 + 25 * Math.sin(2 * Math.PI * 0.8 * t))) / SR;
    let v = 0; for (let k = 1; k <= 6; k++) v += Math.sin(k * ph) / k;
    out[i] = amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t) ** 2) * v * 0.6;
  }
  return out;
}
const mic = new Float32Array(Math.round(3.2 * SR));
mic.set(speechy(2.2, 0.3), Math.round(0.4 * SR));
const MIC = path.join(work, 'mic.wav');
fs.writeFileSync(MIC, encodeWav(mic, SR));

// ---------------------------------------------------------------- 持ち運べる 1 ファイル（examples/minimal ＋ 無音の音声）
const PDIR = path.join(work, 'pmin');
fs.rmSync(PDIR, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), PDIR, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
fs.mkdirSync(path.join(PDIR, 'audio'), { recursive: true });
{
  const segments = {};
  parseNarration(fs.readFileSync(path.join(PDIR, 'narration.md'), 'utf8')).forEach((x, j) => { fs.writeFileSync(path.join(PDIR, 'audio', `seg_js${j}.wav`), silentWav(0.5)); segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'stub-tts' }; });
  fs.writeFileSync(path.join(PDIR, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  fs.writeFileSync(path.join(PDIR, 'egatari.json'), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
}
const pmin = await buildPortable(path.join(PDIR, 'deck.html'), { out: path.join(PDIR, 'out', 'deck.ega.html') });
// ふつうの build：TTS の段階（kind tts・kind のない tts/synth.py の記録）の deck-audio に kind tts、録音は recorded。dry-run の無音には付けない
{
  const man = JSON.parse(fs.readFileSync(path.join(PDIR, 'audio', 'manifest.json'), 'utf8'));
  const ks = Object.keys(man.segments);
  man.segments[ks[0]] = { ...man.segments[ks[0]], kind: 'tts' };
  man.segments[ks[1]] = { ...man.segments[ks[1]], engine: 'irodori' };
  man.segments[ks[2]] = { ...man.segments[ks[2]], kind: 'recorded', sync: 'none' };
  man.segments[ks[3]] = { ...man.segments[ks[3]], engine: 'dry-run' };
  man.segments[ks[4]] = { ...man.segments[ks[4]], kind: 'tts', recipe: { engine: 'dry-run' } };
  const BD = path.join(work, 'bmin');
  fs.rmSync(BD, { recursive: true, force: true });
  fs.cpSync(PDIR, BD, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(PDIR, x)) });
  fs.writeFileSync(path.join(BD, 'audio', 'manifest.json'), JSON.stringify(man));
  const da = JSON.parse(/<script type="application\/json" id="deck-audio">([\s\S]*?)<\/script>/.exec(build(path.join(BD, 'deck.html'), { out: path.join(BD, 'out', 'deck.html') }).html)[1]);
  ok(da[ks[0]].kind === 'tts' && da[ks[1]].kind === 'tts' && da[ks[2]].kind === 'recorded' && !('kind' in da[ks[3]]) && !('kind' in da[ks[4]]), 'build: deck-audio copies kind (tts, recorded; none for dry-run audio)');
  const pa = JSON.parse(/<script type="application\/json" id="deck-audio">([\s\S]*?)<\/script>/.exec(pmin.html)[1]);
  ok(Object.values(pa).every((x) => x.kind === 'tts'), 'build: a single file copies kind into deck-audio too (play-only derivatives keep it)');
}

// ---------------------------------------------------------------- 組んで配る
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single'], { stdio: 'inherit' });
// MP3 のエンコーダ（LGPL の LAME）は app.js に入れず、npm のファイルを手を加えずに vendor/lame-wasm/ に置く（LICENSE も）
{
  const v = path.join(DIST, 'vendor', 'lame-wasm'), src = path.join(ROOT, 'node_modules', 'lame-wasm');
  ok(['index.js', 'LICENSE', 'package.json', 'README.md'].every((f) => fs.existsSync(path.join(v, f))) && fs.readFileSync(path.join(v, 'index.js')).equals(fs.readFileSync(path.join(src, 'dist', 'index.js'))), 'dist: vendor/lame-wasm/ holds the unmodified npm file and its LICENSE');
  ok(!/LAME encoding library|Failed to initialize LAME/.test(fs.readFileSync(path.join(DIST, 'app.js'), 'utf8')), 'dist: app.js does not contain LAME');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${MIC}%noloop`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', permissions: ['microphone'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push('console: ' + m.text()); if (process.env.APP_DEBUG) console.log('    [' + m.type() + '] ' + m.text()); });
const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
async function frameReady(timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = deckFrame();
    const want = await page.evaluate(() => window.__APP_TEST.state().loads);
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.__APP_LOAD === w), want)) { await page.waitForTimeout(120); return f; } } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
const audioState = () => page.evaluate(() => window.__APP_TEST.audio());
const opfsRead = (rel, bin) => page.evaluate(async ([rel, bin]) => {
  try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x); const f = await (await d.getFileHandle(name)).getFile(); return bin ? [...new Uint8Array(await f.arrayBuffer()).slice(0, 4)] : await f.text(); }
  catch { return null; }
}, [rel, !!bin]);
const opfsList = (rel) => page.evaluate(async (rel) => { try { let d = window.__testDir; for (const x of rel.split('/').filter(Boolean)) d = await d.getDirectoryHandle(x); const out = []; for await (const k of d.keys()) out.push(k); return out.sort(); } catch { return null; } }, rel);
// 作った音声がその段階の音声になるまで（すぐ使う。#45）：kind と、前に戻せる記録の数
const waitUsed = (kind, back, timeout = 30000) => page.waitForFunction(([kind, back]) => { const s = window.__APP_TEST.audio(); return !s.busy && !s.loading && s.entry && s.entry.kind === kind && (s.history[s.key] || []).length === back; }, [kind, back], { timeout });
const recState = () => page.evaluate(() => window.__APP_TEST.rec());
// 板の「● 録音 (r)」で録音モードを開く（その段階で）。戻り値：開いた段階
async function openRecFromPanel(key) {
  await clickUntil(page, '#dev-audio-rec', () => page.waitForSelector('#rec-mode', { timeout: 2500 }));
  await page.waitForFunction((k) => { const s = window.__APP_TEST.rec(); return s.open && s.ready && s.phase === 'idle' && s.key === k; }, key, { timeout: 15000 });
  return (await recState()).key;
}
// 録音モードで 1 段：Space → ms 待つ → Space（stop が false なら止めない：上限で止まるのを待つ）→ 書き終わるまで
async function recordOne(ms, stop = true) {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__APP_TEST.rec().phase === 'recording', null, { timeout: 10000 });
  await page.waitForTimeout(ms);
  if (stop) await page.keyboard.press('Space');
  await page.waitForFunction(() => { const s = window.__APP_TEST.rec(); return s.phase === 'idle' && !!s.result; }, null, { timeout: 30000 });
  return (await recState()).result;
}
async function closeRec() {
  await page.keyboard.press('Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
}
// 板の「● 録音」→ 録音モードで 1 段（Space・Space）→ Esc で板に戻る
async function recordViaPanel(key, ms = 3400) {
  await openRecFromPanel(key);
  const r = await recordOne(ms);
  await closeRec();
  return r;
}
const trustedOutside = () => page.evaluate(() => {
  const f = document.getElementById('preview').getBoundingClientRect(), r = document.getElementById('dev-audio').getBoundingClientRect();
  return r.right <= f.left + 0.5 || r.left >= f.right - 0.5;
});

// TTS の差し替え：文の長さに比例した長さの音（48 kHz）。呼ばれた文を残す
const STUB = `window.__ttsCalls = [];
window.__APP_TEST.tts = {
  info: (lang) => ({ ok: true, label: 'stub TTS (' + lang + ')', reason: '' }),
  synth: async ({ lang, text, role, voices, onProgress }) => {
    window.__ttsCalls.push({ lang, text, role, voices });
    onProgress && onProgress(0.5, 'stub: synthesizing');
    const sr = 48000, n = Math.round((0.3 + text.length * 0.06) * sr), pcm = new Float32Array(n + sr * 0.3);
    for (let i = 0; i < n; i++) pcm[i + Math.round(sr * 0.15)] = 0.25 * Math.sin(2 * Math.PI * 180 * i / sr) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2.5 * i / sr));
    return { pcm, sr, recipe: { engine: 'stub', model: 'stub-model-1', voice: { expert: voices.expert, novice: voices.novice }, seed: 42 } };
  },
};`;

try {
  await page.goto(BASE);
  await page.waitForSelector('#drop');
  // ---------------------------------------------------------------- 1. フォルダ
  const SRC = path.join(ROOT, 'examples/minimal');
  const files = { 'deck.html': fs.readFileSync(path.join(SRC, 'deck.html'), 'utf8'), 'narration.md': fs.readFileSync(path.join(SRC, 'narration.md'), 'utf8') };
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('audio-deck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('audio-deck', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, files);
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'folder: opened');
  let f = await frameReady();
  await page.evaluate(STUB);
  await f.evaluate(() => DECK.go(2, 2, false));
  await page.waitForFunction(() => (window.__APP_TEST.ui().pos || {}).k === 2);
  const key = (await page.evaluate(() => window.__APP_TEST.ui().pos)).key;
  await page.click('#b-audio');
  await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction((k) => window.__APP_TEST.audio().key === k, key);
  ok(await trustedOutside(), 'panel: the audio panel is outside the preview (trusted side panel)');
  ok((await page.textContent('#dev-audio-cur')).includes('まだありません'), 'panel: no audio yet for ' + key);
  ok((await page.textContent('#dev-audio .dv-script')).includes('学習率'), 'panel: shows the step script to read');
  ok((await page.textContent('#saveloc')) === '作業フォルダ「audio-deck」に保存済み' && (await page.getAttribute('#saveloc', 'title')).includes('書き出す'), 'save location: a working folder says it is saved there and how to hand it out');
  // 録音：板の「● 録音 (r)」は録音モードをこの段階で開く（録り方は 1 つ。#82）
  const rb = await page.evaluate(() => { const b = document.getElementById('dev-audio-rec'); return { text: b.textContent, ks: b.getAttribute('aria-keyshortcuts'), pop: b.getAttribute('aria-haspopup'), title: b.title }; });
  ok(rb.text.includes('録音') && rb.text.includes('(r)') && rb.ks === 'r' && rb.pop === 'dialog' && rb.title.includes('録音モード'), 'record: the panel button names its key (r) and says it opens recording mode ' + JSON.stringify(rb));
  ok(!(await page.$('#dev-audio-recmode')) && !(await page.$('#dev-audio-meter')), 'record: no second way to record in the panel (no separate recording-mode button, no panel meter)');
  ok(await openRecFromPanel(key) === key, 'record: the panel button opens recording mode at the panel\'s step (' + key + ')');
  const hid = await page.evaluate(() => ({ panelOpen: window.__APP_TEST.audio().open, shown: !!document.getElementById('dev-audio') && document.getElementById('dev-audio').getClientRects().length > 0, focus: document.activeElement && document.activeElement.id }));
  ok(hid.panelOpen && !hid.shown && hid.focus === 'rec-mode', 'record: the panel stays open but hidden while recording mode has the focus ' + JSON.stringify(hid));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__APP_TEST.rec().phase === 'recording');
  let mw = 0;
  for (let i = 0; i < 20; i++) { mw = Math.max(mw, await page.evaluate(() => parseFloat(document.querySelector('#rec-meter i').style.width) || 0)); await page.waitForTimeout(100); }
  ok(mw > 10, `record: the level meter is beside the large script (${mw.toFixed(0)}%)`);
  ok(await page.evaluate(() => document.getElementById('preview').inert), 'record: the preview is inert while recording');
  await shot(page, 'audio-recording.png');
  await page.waitForTimeout(1400);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => { const s = window.__APP_TEST.rec(); return s.phase === 'idle' && !!s.result; }, null, { timeout: 30000 });
  const g1 = await page.evaluate(() => (document.getElementById('rec-result') || {}).textContent || '');
  ok(/音量を [+-]\d+\.\d dB 調整/.test(g1), 'gain: recording mode shows the gain applied to the take: ' + g1);
  ok(!(await page.$('#rec-clip')), 'clipping: a normal take has no clipping warning');
  await closeRec();
  await waitUsed('recorded', 1);
  let st = await audioState();
  const t1 = st.entry;
  ok(t1 && t1.kind === 'recorded' && t1.dur > 1.9 && t1.dur < 2.6, `record: after Esc the panel shows the new take for the step, silence trimmed (${t1 && t1.dur} s of 2.2 s voice + 2 × 0.05 s)`);
  ok(st.key === key && await page.isVisible('#dev-audio'), 'record: back in the panel, on the same step');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'dev-audio-rec', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'dev-audio-rec'), 'a11y: focus returns to the panel\'s record button ' + await page.evaluate(() => document.activeElement && (document.activeElement.tagName + '#' + document.activeElement.id)));
  ok(JSON.stringify(st.history[key]) === '[null]' && !(st.takes[key] || []).length && await page.isVisible('#dev-audio-revert'), 'record: no take left to "use"; Revert to previous goes back to no audio');
  ok(!(await page.evaluate(() => document.getElementById('preview').inert)), 'record: the preview takes clicks again after recording');
  // 2 つ目（録り直し）：これもすぐ使い、前の録音は「前に戻す」で（偽のマイクは開くたびに頭から鳴るので、短く録って 1 つ目と違う音にする）
  await recordViaPanel(key, 2000);
  await waitUsed('recorded', 2);
  st = await audioState();
  ok(st.entry.file !== t1.file && st.history[key][1] === t1.file, 'record again: the new take replaces the first, which stays in the revert history ' + JSON.stringify([st.entry.file, t1.file, st.history[key]]));
  await shot(page, 'audio-recorded.png');
  // プレビューからの知らせ（鍵）で板は替わらない・録音も始まらない（r は録音モードの画面を開くだけで、それも tools/test-recording.mjs が確かめる）
  await (await frameReady()).evaluate(() => { for (const k of ['a', 'x', ' ']) window.parent.postMessage({ type: 'edit-hint', kind: 'key', key: k }, '*'); });
  await page.waitForTimeout(200);
  ok(!(await recState()).open && !(await recState()).mic, 'security: hints from the preview cannot start a recording');
  // 前に戻す：1 つ目の録音に戻る（音声のファイルは消さない）
  await page.click('#dev-audio-revert');
  await page.waitForFunction(([k, f]) => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && s.entry.file === f && s.key === k && s.history[k].length === 1; }, [key, t1.file], { timeout: 30000 });
  ok(true, 'revert: back to the first recording');
  const man1 = JSON.parse(await opfsRead('audio/manifest.json'));
  const e1 = man1.segments[key];
  const narr0 = files['narration.md'];
  const seg0 = parseNarration(narr0).find((s) => `${s.slideKey}:${s.stepKey}` === key);
  ok(e1 && e1.kind === 'recorded' && e1.sync === 'none' && Array.isArray(e1.cues) && !e1.cues.length && e1.inputHash === await PF.inputHash(seg0), 'use: manifest entry is kind recorded, sync none, inputHash of the narration');
  ok(/^rec_[0-9a-f]{16}\.mp3$/.test(e1.file) && Math.abs(e1.dur - t1.dur) < 0.002, `use: audio/${e1.file} (${e1.dur} s)`);
  ok(e1.processing === 'trim-45-loud-20-cap-v1' && e1.startOffset === MP3.startOffset, `use: processing profile and the MP3 encoder delay as startOffset (${e1.startOffset} s)`);
  ok(JSON.stringify(Object.keys(e1)) === JSON.stringify(['file', 'dur', 'cues', 'sync', 'kind', 'inputHash', 'processing', 'startOffset']), 'use: no capture metadata (device, file name) in the record: ' + Object.keys(e1).join(','));
  // Chrome で戻すと、音の始まりは「残した無音（0.05 秒）＋ startOffset」：startOffset から鳴らせば音声の 0 秒（cues の 0）と合う
  const onset = await page.evaluate(async (rel) => {
    const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x);
    const ab = await (await (await d.getFileHandle(name)).getFile()).arrayBuffer();
    const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab), x = buf.getChannelData(0);
    let i = 0; while (i < x.length && Math.abs(x[i]) < 0.02) i++;
    return i / buf.sampleRate;
  }, 'audio/' + e1.file);
  ok(Math.abs(onset - (0.05 + MP3.startOffset)) < 0.012, `use: in Chrome the voice starts at ${onset.toFixed(4)} s = 0.05 s kept + startOffset ${MP3.startOffset} s`);
  ok(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /\/vendor\/lame-wasm\/index\.js$/.test(r.name))), 'use: the MP3 encoder was loaded on demand from vendor/lame-wasm/index.js');
  const head = await opfsRead('audio/' + e1.file, true);
  ok(head && (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 || String.fromCharCode(...head.slice(0, 3)) === 'ID3'), 'use: the file is MP3');
  ok((await opfsList('.cache/edits') || []).some((n) => n.endsWith('-manifest.json')), 'use: the manifest is backed up before each change after the first');
  ok((await opfsList('audio')).filter((n) => n.endsWith('.mp3')).length === 2, 'revert: both recordings stay in audio/');
  st = await audioState();
  ok(st.state === 'fresh' && !(st.takes[key] || []).length, 'use: the panel shows the take as up to date; no unused takes');
  ok(await page.evaluate(() => !!document.querySelector('#dev-audio-player') && document.querySelector('#dev-audio-player').src.startsWith('blob:')), 'use: the current take plays from the workspace (blob in this page)');
  const dur = await page.evaluate(() => new Promise((res) => { const a = document.querySelector('#dev-audio-player'); if (a.readyState >= 1) res(a.duration); else a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(-1); }));
  ok(dur > 1.9 && dur < 2.8, `use: the browser decodes the MP3 (${dur.toFixed(2)} s)`);
  // デッキを録音した段階に戻す（板はデッキの位置に付いていく）
  f = await frameReady();
  await f.evaluate(() => DECK.go(2, 2, false));
  await page.waitForFunction((k) => window.__APP_TEST.audio().key === k && window.__APP_TEST.audio().entry, key);
  // 口述原稿を直す → 古い
  const nr = await page.evaluate(([k]) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), [key]);
  const r1 = await page.evaluate(([k, nr]) => window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, k.lastIndexOf(':')), stepKey: k.slice(k.lastIndexOf(':') + 1), rev: nr.rev, turns: nr.turns.map((t, i) => (i ? t : { ...t, text: t.text + '（直した）' })) }), [key, nr]);
  ok(r1._status === 200 && r1.changed, 'stale: narration edited');
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => window.__APP_TEST.audio().state === 'stale', null, { timeout: 15000 });
  ok(await page.isVisible('#dev-audio-stale'), 'stale: the panel shows the stale badge');
  ok((await page.evaluate(() => window.__APP_TEST.state().warn)).some((w) => w.includes(key) && w.includes('古い')), 'stale: the build warnings list the stale step (folder)');
  await shot(page, 'audio-stale.png');
  await page.click('#b-check');
  await page.waitForFunction(() => [...document.querySelectorAll('#panel-body .res')].some((e) => e.textContent.includes('音声が古い')), null, { timeout: 30000 });
  ok(true, 'stale: the quality check lists the stale step');
  await page.click('#panel-close');
  // TTS（差し替え）で作り直す
  await page.click('#dev-audio-tts');
  await waitUsed('tts', 2);
  st = await audioState();
  const tt = st.entry;
  const calls = await page.evaluate(() => window.__ttsCalls);
  ok(tt.kind === 'tts' && tt.recipe && tt.recipe.processing === 'trim-45-loud-20-cap-v1' && /^[0-9a-f]{64}$/.test(tt.recipe.dictionary || ''), 'tts: a TTS take with recipe (processing profile, reading dictionary hash)');
  ok(calls.length === 1 && calls[0].text.includes('イータ') && !calls[0].text.includes('{'), `tts: the reading of {η|イータ} is passed, without markup (${calls[0] && calls[0].text})`);
  ok(Array.isArray(tt.cues) && tt.cues.length === 1 && tt.cues[0] === 0, 'tts: one cue per {mark} boundary (synth.py rule)');
  await shot(page, 'audio-tts-take.png');
  const man2 = JSON.parse(await opfsRead('audio/manifest.json'));
  const e2 = man2.segments[key];
  ok(e2.kind === 'tts' && e2.sync === 'auto' && e2.recipe.engine === 'stub' && e2.recipe.seed === 42 && e2.recipe.voice.expert === 'bob' && !('novice' in e2.recipe.voice) && e2.recipe.textNormalize === 'join-num-counter@1', 'tts: manifest entry kind tts with recipe (voices of the roles that speak, textNormalize)');
  ok((await audioState()).state === 'fresh', 'tts: up to date again');
  ok((await opfsList('.cache/edits') || []).some((n) => n.endsWith('-manifest.json')), 'tts: the previous manifest was backed up to .cache/edits/');
  ok((await opfsList('audio')).filter((n) => n.endsWith('.mp3')).length === 3, 'tts: the earlier recordings stay in audio/ (not deleted)');
  await page.waitForFunction((k) => !window.__APP_TEST.state().warn.some((w) => w.includes(k) && w.includes('古い')), key, { timeout: 15000 });
  ok(true, 'tts: the stale warning is gone');
  // MP3 のエンコーダを読み込めない（1 ファイル版と同じ）：WAV で保存し、startOffset は書かない
  await page.evaluate(() => { window.__APP_TEST.mp3 = 'off'; });
  await page.click('#dev-audio-tts');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && /\.wav$/.test(s.entry.file); }, null, { timeout: 30000 });
  const e3 = JSON.parse(await opfsRead('audio/manifest.json')).segments[key];
  ok(/^tts_[0-9a-f]{16}\.wav$/.test(e3.file) && !('startOffset' in e3) && String.fromCharCode(...(await opfsRead('audio/' + e3.file, true))) === 'RIFF', 'no MP3 encoder: the take is saved as WAV without startOffset');
  await page.evaluate(() => { window.__APP_TEST.mp3 = undefined; });
  // 前処理の版（format spec §5.4）：「1 歩」は合成の直前だけ「1歩」にする（ttsParts・inputHash は変えない）。recipe.textNormalize は書く。
  // recipe.textNormalize のない古い TTS は stale ではなく（鳴らし続ける）、板に「前処理の版が古い」の一覧は出さない（#83）。勝手に作り直さない
  {
    const nrN = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), key);
    const rN = await page.evaluate(([k, nr]) => window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, k.lastIndexOf(':')), stepKey: k.slice(k.lastIndexOf(':') + 1), rev: nr.rev, turns: nr.turns.map((t, i) => (i ? t : { ...t, text: t.text + '1 歩進みます。' })) }), [key, nrN]);
    ok(rN._status === 200 && rN.changed, 'textNormalize: narration with "1 歩" written');
    await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
    await page.waitForFunction(() => window.__APP_TEST.audio().state === 'stale', null, { timeout: 15000 });
    const nCalls = (await page.evaluate(() => window.__ttsCalls)).length;
    await page.click('#dev-audio-tts');
    await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && !s.loading && s.state === 'fresh'; }, null, { timeout: 30000 });
    const callsN = (await page.evaluate(() => window.__ttsCalls)).slice(nCalls);
    ok(callsN.some((c) => c.text.includes('1歩進みます')) && !callsN.some((c) => /1\s+歩/.test(c.text)), `textNormalize: the engine gets "1歩" (${callsN.map((c) => c.text).join(' / ')})`);
    const eN = JSON.parse(await opfsRead('audio/manifest.json')).segments[key];
    ok(eN.recipe.textNormalize === 'join-num-counter@1', 'textNormalize: a new TTS take records recipe.textNormalize');
    const segN = parseNarration(await opfsRead('narration.md')).find((x) => `${x.slideKey}:${x.stepKey}` === key);
    ok(eN.inputHash === await PF.inputHash(segN) && segN.turns[0].ttsParts.join('').includes('1 歩'), 'textNormalize: inputHash is still of the text with the space (ttsParts unchanged)');
    ok(!(await page.$('#dev-audio-oldnorm')), 'textNormalize: no old-pre-processing list in the panel');
    // 古い版：field を外し、別の段階に（録音・取り込み・もう 1 つの古い TTS）を足す
    const others = parseNarration(files['narration.md']).map((x) => `${x.slideKey}:${x.stepKey}`).filter((k) => k !== key);
    const manN = JSON.parse(await opfsRead('audio/manifest.json'));
    const { textNormalize: _drop, ...oldRecipe } = manN.segments[key].recipe;
    manN.segments[key] = { ...manN.segments[key], recipe: oldRecipe };
    manN.segments[others[0]] = { ...manN.segments[key], inputHash: null };
    manN.segments[others[1]] = { file: eN.file, dur: eN.dur, kind: 'recorded', sync: 'none', cues: [], inputHash: null };
    manN.segments[others[2]] = { file: eN.file, dur: eN.dur, kind: 'imported', sync: 'none', cues: [], inputHash: null };
    await page.evaluate(async (txt) => { const w = await (await window.__testDir.getDirectoryHandle('audio')).getFileHandle('manifest.json'); const x = await w.createWritable(); await x.write(txt); await x.close(); }, JSON.stringify(manN, null, 1));
    const before = JSON.stringify(manN.segments[key]);
    await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
    await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.loading && s.entry && document.getElementById('dev-audio-voices'); }, null, { timeout: 15000 });
    ok((await audioState()).state === 'fresh' && !(await page.isVisible('#dev-audio-stale')), 'textNormalize: an old take without the field is not stale (keeps playing)');
    const panelText = await page.textContent('#dev-audio');
    ok(!(await page.$('#dev-audio-oldnorm')) && !panelText.includes('前処理の版') && !panelText.includes('いちぽ'), 'textNormalize: old TTS steps are not listed (no deck-wide pre-processing notice; #83)');
    const nIdle = (await page.evaluate(() => window.__ttsCalls)).length;
    await page.waitForTimeout(800);
    ok((await page.evaluate(() => window.__ttsCalls)).length === nIdle && JSON.stringify(JSON.parse(await opfsRead('audio/manifest.json')).segments[key]) === before, 'textNormalize: nothing is regenerated by itself');
    await shot(page, 'audio-old-textnormalize.png');
    // 後始末：足した段階の記録を外す
    const manC = JSON.parse(await opfsRead('audio/manifest.json'));
    for (const k of others.slice(0, 3)) delete manC.segments[k];
    await page.evaluate(async (txt) => { const w = await (await window.__testDir.getDirectoryHandle('audio')).getFileHandle('manifest.json'); const x = await w.createWritable(); await x.write(txt); await x.close(); }, JSON.stringify(manC, null, 1));
    await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
    await page.waitForFunction(() => !window.__APP_TEST.audio().loading && document.getElementById('dev-audio-voices'), null, { timeout: 15000 });
  }
  // 声の欄（#18・#19）：1 人の語りなら欄は 1 つ。見本を鳴らす（モデルは読み込まない）。選ぶと voice.json に書く
  ok(await page.evaluate(() => { const s = [...document.querySelectorAll('#dev-audio-voices select')]; return s.length === 1 && [...s[0].options].map((x) => x.value).join() === 'bob,alice' && s[0].value === 'bob'; }), 'voice: one picker for a one-speaker deck, bob and alice for Japanese');
  await page.click('#dev-audio-voices .dv-sample');
  await page.waitForFunction(() => window.__APP_TEST.audio().sample === 'bob' && document.querySelector('#dev-audio-voices .dv-sample').textContent.includes('■'));
  ok(true, 'voice: the sample plays a pre-made file (lab/voices/samples/bob.mp3; no TTS call) and the button can stop it');
  await page.selectOption('#dev-audio-voices select[data-role="expert"]', 'alice');
  await page.waitForFunction(() => /alice/.test(document.getElementById('dev-audio-msg').textContent));
  ok(JSON.parse(await opfsRead('voice.json')).expert === 'alice', 'voice: the choice is written to voice.json');
  // voice.json の声がブラウザの TTS にない（自分の参照音声の名前。ここでは myvoice）：板の知らせはそのまま見える（#83 で消したのは前処理の一覧だけ）
  await page.evaluate(async () => { const w = await (await window.__testDir.getFileHandle('voice.json')).createWritable(); await w.write('{"expert": "myvoice"}'); await w.close(); });
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForSelector('#dev-audio .dv-voice-warn');
  const vw48 = await page.evaluate(() => { const e = document.querySelector('#dev-audio .dv-voice-warn'); return { text: e.textContent, shown: e.getClientRects().length > 0 && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' }; });
  ok(vw48.shown && vw48.text === 'voice.json の Expert の声「myvoice」は、ブラウザの TTS に入っていません。TTS で作るときは既定の声「bob」を使います（上の欄で選び直せます）', 'voice fallback: the myvoice notice is shown, unchanged: ' + vw48.text);
  await page.$eval('#dev-audio .dv-voice-warn', (e) => e.scrollIntoView({ block: 'nearest' }));
  ok(await page.isVisible('#dev-audio .dv-voice-warn'), 'voice fallback: the notice is visible in the panel');
  await shot(page, 'audio-voice-fallback.png');
  // 知らない声：日本語も英語も同じ（知らせて既定の声で作る）
  await page.evaluate(async () => { const w = await (await window.__testDir.getFileHandle('voice.json')).createWritable(); await w.write('{"expert": "zed"}'); await w.close(); });
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForSelector('#dev-audio .dv-voice-warn');
  ok((await page.textContent('#dev-audio .dv-voice-warn')).includes('「zed」') && (await page.textContent('#dev-audio .dv-voice-warn')).includes('「bob」'), 'unknown voice: the panel names it and the default voice it uses');
  await page.evaluate(() => { window.__ttsCalls.length = 0; });
  await page.click('#dev-audio-tts');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && s.entry.kind === 'tts' && window.__ttsCalls.length > 0; }, null, { timeout: 30000 });
  ok((await page.evaluate(() => window.__ttsCalls[0].voices.expert)) === 'bob' && (await audioState()).entry.recipe.voice.expert === 'bob', 'unknown voice: TTS falls back to bob and records it');
  await shot(page, 'audio-voice.png');
  // 口述原稿の言語で TTS のエンジンを選ぶ：voice.json の "lang" ＞ 発言の文字 ＞ <html lang>（日本語のスライドに英語の口述原稿）
  await page.evaluate(async () => { const w = await (await window.__testDir.getFileHandle('voice.json')).createWritable(); await w.write('{"lang": "en"}'); await w.close(); });
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => /\(en\)/.test((document.getElementById('dev-audio-ttsinfo') || {}).textContent || ''));
  ok(await page.evaluate(() => { const o = [...document.querySelectorAll('#dev-audio-voices select option')].map((x) => x.value); return o.includes('am_michael') && !o.includes('bob') && document.querySelector('#dev-audio-voices select').value === 'am_michael'; }), 'narration language: voice.json "lang": "en" picks Kokoro voices for a Japanese deck');
  await page.evaluate(() => { window.__ttsCalls.length = 0; });
  await page.click('#dev-audio-tts');
  await waitUsed('tts', 6);
  ok(await page.evaluate(() => window.__ttsCalls.length > 0 && window.__ttsCalls.every((c) => c.lang === 'en' && c.voices.expert === 'am_michael')), 'narration language: TTS is asked for English with a Kokoro voice');
  await page.evaluate(async () => { const w = await (await window.__testDir.getFileHandle('voice.json')).createWritable(); await w.write('{}'); await w.close(); });
  // 掛け合いにすると、読む原稿の各ターンに Expert / Novice の印、声の欄は役ごと
  const nr2 = await page.evaluate(([k]) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), [key]);
  await page.evaluate(([k, nr]) => window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, k.lastIndexOf(':')), stepKey: k.slice(k.lastIndexOf(':') + 1), rev: nr.rev, turns: [...nr.turns, { role: 'novice', text: 'それは、どのくらい小さくすればよいのですか？ 小さすぎると進まない気がします。' }, { role: 'expert', text: '良い質問です。まず大きめに始めて、損失が落ち着かなければ半分にします。何度か試すと、ちょうどよいところが分かってきます。' }] }), [key, nr2]);
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => document.querySelectorAll('#dev-audio-voices select').length === 2, null, { timeout: 15000 });
  ok(await page.evaluate(() => [...document.querySelectorAll('#dev-audio .dv-script .dv-role')].map((e) => e.textContent).join() === 'Expert,Novice,Expert'), 'dialogue: every turn of the script is labelled, Expert too');
  const sh = await page.evaluate(() => { const e = document.getElementById('dev-audio-script'); return { h: e.clientHeight, sh: e.scrollHeight, resize: getComputedStyle(e).resize }; });
  ok(sh.h >= sh.sh - 1 && sh.resize === 'vertical', `script: the field grows with the narration (${sh.h}/${sh.sh} px) and can be resized`);
  await openRecFromPanel(key);
  ok(await page.evaluate(() => [...document.querySelectorAll('#rec-script .rm-role')].map((e) => e.textContent).join() === 'Expert,Novice,Expert'), 'dialogue: recording mode labels every turn too');
  await shot(page, 'audio-recording-dialogue.png');
  await recordOne(3400);
  await closeRec();
  await waitUsed('recorded', 7);
  // Esc（#48）：後に開いた窓から 1 つずつ。Shift+Esc で全部
  await page.click('#b-narr');
  await page.waitForSelector('#dev-narr');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(!(await page.$('#dev-narr')) && await page.isVisible('#dev-audio'), 'Esc: closes the narration drawer (opened last) and leaves the Audio panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(!(await page.isVisible('#dev-audio')), 'Esc: a second Esc closes the Audio panel');
  await page.click('#b-audio'); await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.click('#b-narr'); await page.waitForSelector('#dev-narr');
  await page.click('#b-help'); await page.waitForSelector('#panel:not([hidden])');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Shift+Escape');
  await page.waitForTimeout(150);
  ok(!(await page.$('#dev-narr')) && !(await page.isVisible('#dev-audio')) && await page.evaluate(() => document.getElementById('panel').hidden), 'Shift+Esc: closes all the open cards ' + JSON.stringify(await page.evaluate(() => ({ narr: !!document.getElementById('dev-narr'), audio: window.__APP_TEST.audio().open, panel: !document.getElementById('panel').hidden }))));

  // ---------------------------------------------------------------- 録音モードが、板の録音のしていたことをする（#82 の対応表。docs/recording-parity.md）
  await page.click('#b-audio'); await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return s.open && !s.loading && !s.busy && s.key; });
  const pk = (await audioState()).key;
  // 音が割れた：入力の峰を 1 近くにする（AnalyserNode の読みに足す。偽のマイクの音は割れない大きさ）
  await page.evaluate(() => { const g = AnalyserNode.prototype.getFloatTimeDomainData; window.__clip = true; AnalyserNode.prototype.getFloatTimeDomainData = function (b) { g.call(this, b); if (window.__clip) b[0] = 0.995; }; });
  await openRecFromPanel(pk);
  const rClip = await recordOne(3400);
  const clipText = await page.evaluate(() => (document.getElementById('rec-clip') || {}).textContent || '');
  ok(rClip.clip && /音が割れている/.test(clipText), 'clipping: a take that hit full scale warns that it may be distorted: ' + clipText);
  ok(await page.waitForFunction(() => /音が割れている/.test(document.getElementById('rec-live').textContent), null, { timeout: 3000 }).then(() => true, () => false), 'clipping: the warning is announced too');
  await page.evaluate(() => { window.__clip = false; });
  await closeRec();
  // 600 秒の上限（試験では 1.5 秒に縮める）：止めて、そこまでを使う
  await page.evaluate(() => { window.__APP_TEST.recMaxSeconds = 1.5; });
  await openRecFromPanel(pk);
  const manL0 = JSON.parse(await opfsRead('audio/manifest.json')).segments[pk];
  const rLim = await recordOne(3500, false);
  const limText = await page.evaluate(() => (document.getElementById('rec-limit') || {}).textContent || '');
  const eLim = JSON.parse(await opfsRead('audio/manifest.json')).segments[pk];
  ok(/1\.5 秒を超えたので止めました/.test(limText) && rLim.raw < 2.2 && eLim.file !== manL0.file && eLim.dur <= 1.6, `limit: recording stops at the limit and the take up to it is used (${rLim.raw} s raw, ${eLim.dur} s; ${limText})`);
  ok(/1\.5 秒を超えた/.test(await page.evaluate(() => document.getElementById('rec-alert').textContent) || ''), 'limit: the stop is reported in the alert region');
  await page.evaluate(() => { window.__APP_TEST.recMaxSeconds = undefined; });
  await closeRec();
  // 書けなかったテイク（manifest が壊れている）：録音モードがそう言い、板の「まだ使っていない音声」に残り、そこから使える
  const goodMan = await opfsRead('audio/manifest.json');
  const writeMan = (txt) => page.evaluate(async (txt) => { const w = await (await window.__testDir.getDirectoryHandle('audio')).getFileHandle('manifest.json'); const x = await w.createWritable(); await x.write(txt); await x.close(); }, txt);
  await writeMan('{ not json');
  await openRecFromPanel(pk);
  const rBad = await recordOne(3400);
  const badText = await page.evaluate(() => (document.getElementById('rec-err') || {}).textContent || '');
  ok(rBad.error && /書き込めませんでした/.test(badText) && /この音声を使う/.test(badText), 'unused take: recording mode says it was not written and where to use it: ' + badText);
  await closeRec();
  await page.waitForSelector('#dev-audio-takes .dv-take[data-kind="recorded"]');
  st = await audioState();
  ok((st.takes[pk] || []).length === 1 && st.takes[pk][0].kind === 'recorded' && typeof st.takes[pk][0].inputHash === 'string' && /dB/.test(await page.textContent('#dev-audio-takes .dv-prov')), 'unused take: the take is kept under 「まだ使っていない音声」 with its gain and inputHash');
  ok((await page.textContent('#dev-audio')).includes('まだ使っていない音声'), 'unused take: the panel heading is shown');
  await writeMan(goodMan);
  await page.click('#dev-audio-takes .dv-use');
  await page.waitForFunction((k) => { const s = window.__APP_TEST.audio(); return !s.busy && !(s.takes[k] || []).length && s.entry && s.entry.kind === 'recorded'; }, pk, { timeout: 30000 });
  const eUse = JSON.parse(await opfsRead('audio/manifest.json')).segments[pk];
  ok(eUse.kind === 'recorded' && eUse.file !== eLim.file && (await opfsList('.cache/edits') || []).some((n) => n.endsWith('-manifest.json')), 'unused take: “Use this take” writes it (manifest backed up first)');
  // マイクを使えない：録音モードがそう言い（alert）、待機に戻る
  await page.evaluate(() => { window.__gum = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
  await openRecFromPanel(pk);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => /マイクを使えません/.test((document.getElementById('rec-err') || {}).textContent || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__APP_TEST.rec().phase === 'idle');
  ok(await page.waitForFunction(() => /マイクを許可/.test(document.getElementById('rec-alert').textContent), null, { timeout: 3000 }).then(() => true, () => false) && !(await recState()).mic, 'mic error: a refused microphone is reported (alert) with how to allow it, and the screen waits');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__gum; });
  await closeRec();
  // MediaRecorder を作れない（その形式に対応しないブラウザなど）：録音モードがそう言い（alert）、待機に戻る
  await page.evaluate(() => { window.__MR = window.MediaRecorder; window.MediaRecorder = function () { throw new DOMException('no recorder here', 'NotSupportedError'); }; });
  await openRecFromPanel(pk);
  const manMR = await opfsRead('audio/manifest.json');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => /no recorder here/.test((document.getElementById('rec-err') || {}).textContent || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__APP_TEST.rec().phase === 'idle');
  ok(await page.waitForFunction(() => /no recorder here/.test(document.getElementById('rec-alert').textContent), null, { timeout: 3000 }).then(() => true, () => false) && (await recState()).open && !(await recState()).taps && await opfsRead('audio/manifest.json') === manMR,
    'recorder error: a MediaRecorder that cannot be created is reported (screen and alert), the screen waits and nothing is written');
  await page.evaluate(() => { window.MediaRecorder = window.__MR; });
  await closeRec();
  // 録音中に作業場所が替わる（同じフォルダを開き直す：generation が進む）：テイクは捨て、録音モードは閉じて元に戻る
  await openRecFromPanel(pk);
  const manGen = await opfsRead('audio/manifest.json');
  const filesGen = (await opfsList('audio')).join();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__APP_TEST.rec().phase === 'recording', null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const g0 = await page.evaluate(() => window.__APP_TEST.state().gen);
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'workspace change: the same folder opened again during a take');
  await page.waitForSelector('#rec-mode', { state: 'detached', timeout: 10000 });
  await page.waitForTimeout(1500);
  const gs = await page.evaluate(() => ({ rec: window.__APP_TEST.rec(), audio: window.__APP_TEST.audio(), gen: window.__APP_TEST.state().gen, rmOn: document.getElementById('deck').classList.contains('rec-on'), topInert: document.getElementById('top').inert }));
  ok(!gs.rec.open && gs.rec.phase === 'idle' && !gs.rec.mic && !gs.rec.taps && !gs.rec.mine.length && !gs.rmOn && !gs.topInert && typeof g0 === "number" && gs.gen > g0, 'workspace change: recording mode resets (closed, idle, microphone released, toolbar usable) ' + JSON.stringify({ g0, gen: gs.gen, phase: gs.rec.phase, mic: gs.rec.mic }));
  ok(await opfsRead('audio/manifest.json') === manGen && (await opfsList('audio')).join() === filesGen && !Object.keys(gs.audio.takes).length && !gs.audio.open, 'workspace change: the take is discarded (no file, no manifest change, no unused take)');

  // ---------------------------------------------------------------- 2. 持ち運べる 1 ファイル（段 A で保存）
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('audio-saved.ega.html', { create: true });
    window.__APP_TEST.saveHandle = h;
  });
  ok(await page.evaluate(([html]) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(html), name: 'deck.ega.html' }), [pmin.html]), 'portable: opened');
  f = await frameReady();
  await page.evaluate(STUB);
  await f.evaluate(() => DECK.go(1, 1, false));
  await page.waitForFunction(() => (window.__APP_TEST.ui().pos || {}).i === 1 && window.__APP_TEST.ui().pos.k === 1);
  const pkey = (await page.evaluate(() => window.__APP_TEST.ui().pos)).key;
  await page.click('#b-audio');
  await page.waitForSelector('#dlg[open]');
  await clickDlg(page, '#dlg-ok');
  await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction((k) => window.__APP_TEST.audio().key === k && window.__APP_TEST.audio().entry, pkey);
  ok((await audioState()).entry.kind === 'tts', 'portable: the current (dry-run) audio is shown');
  await recordViaPanel(pkey);
  await waitUsed('recorded', 1);
  ok((await page.evaluate(() => window.__APP_TEST.state().portable.dirty)), 'portable: the new take marks the file unsaved');
  ok((await page.textContent('#saveloc')).includes('保存していない変更') && (await page.getAttribute('#saveloc', 'class')).includes('dirty'), 'save location: unsaved changes are shown');
  await shot(page, 'saveloc-unsaved.png');
  // 1 ファイルの声の選択は、この画面の間だけ（voice.json を変えると組み直しの保存になる）
  await page.selectOption('#dev-audio-voices select[data-role="expert"]', 'alice');
  await page.waitForFunction(() => window.__APP_TEST.audio().voices.expert === 'alice');
  await page.evaluate(() => window.__APP_TEST.save('save'));
  const ps = await page.evaluate(() => window.__APP_TEST.state().portable);
  ok(ps.lastTier === 'A' && ps.lastTierA && JSON.stringify(ps.lastTierA.audio) === JSON.stringify([pkey]) && !ps.dirty, `portable: saved by tier A, only ${pkey} audio changed (the voice choice did not touch voice.json)`);
  await page.waitForFunction(() => document.getElementById('saveloc').textContent === '「audio-saved.ega.html」に保存済み');
  ok(true, 'save location: after Save it names the saved file');
  await shot(page, 'saveloc-saved.png');
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true;
  try { regionDiff(pmin.html, saved, { audio: [pkey] }); } catch (e) { diffOk = false; console.log('       ' + e.message.slice(0, 300)); }
  ok(diffOk, 'portable: bytes outside the tier A regions are identical (region diff)');
  const back = await PF.readPortable(saved);
  const rec = back.index.audio[pkey];
  ok(rec.kind === 'recorded' && rec.sync === 'none' && back.index.blobs[back.index.files[rec.file]].mime === 'audio/mpeg', 'portable: read back: recorded record, MP3 blob');
  ok(rec.startOffset === MP3.startOffset && rec.processing === 'trim-45-loud-20-cap-v1', 'portable: read back: startOffset and processing on the record');
  // 実行系：自動再生はその段階の音声を startOffset から鳴らす（currentTime）、タイムラインにも出る
  const pp = await ctx.newPage();
  await pp.setContent(saved);
  await pp.waitForFunction(() => window.DECK && DECK.ready);
  const rt = await pp.evaluate(async (k) => {
    window.__plays = []; HTMLMediaElement.prototype.play = function(){ window.__plays.push(this.currentTime); return Promise.resolve(); };
    const g = DECK.timeline().find((x) => x.key === k);
    DECK.go(g.i, g.k, true); DECK.autoplay(true);
    await new Promise((r) => setTimeout(r, (g.lead + 0.4) * 1000));
    DECK.autoplay(false);
    return { offset: g.audioOffset, plays: window.__plays, entry: DECK.AUDIO[k] && DECK.AUDIO[k].startOffset };
  }, pkey);
  ok(rt.offset === MP3.startOffset && rt.entry === MP3.startOffset && rt.plays.length && Math.abs(rt.plays[0] - MP3.startOffset) < 1e-6, `runtime: autoplay starts the step's audio at startOffset (${JSON.stringify(rt.plays)})`);
  // AI の声（#33・format spec §7.3）：索引の記録が kind tts の段階だけ（録音は違う）。舞台と字幕には何も出さず、操作の帯に札「AI 音声」
  await pp.waitForFunction(() => Object.keys(DECK.AI_AUDIO).length > 0, null, { timeout: 5000 });
  const ai = await pp.evaluate(async (k) => {
    const tts = DECK.timeline().find((x) => x.audio && x.key !== k);
    DECK.go(tts.i, tts.k, false); DECK.autoplay(true);
    await new Promise((r) => setTimeout(r, (tts.lead + 0.15) * 1000));
    const stage = !!document.getElementById('deck-ai') || document.documentElement.classList.contains('ai-voice');
    DECK.autoplay(false);
    DECK.captions(true); DECK.go(tts.i, tts.k, false);
    const cap = !!document.querySelector('#deck-cap .cap-ai') || /AI で合成|AI-generated|AI 音声/.test(document.getElementById('deck-cap').textContent);
    const b = document.querySelector('#dt-cb .dt-aib');
    const r = { rec: DECK.aiVoice(k), tts: DECK.aiVoice(tts.key), stage, cap, badge: b && b.textContent, tip: b && b.title, aria: b && b.getAttribute('aria-label'), note: DECK.voiceNote(tts.key), recNote: DECK.voiceNote(k) };
    DECK.captions(false);
    return r;
  }, pkey);
  ok(!ai.rec && ai.tts && !ai.stage && !ai.cap && ai.badge === 'AI 音声' && ai.tip === '音声は AI で合成したものです' && ai.aria === ai.tip && ai.note === ai.tip && ai.recNote === '',
    `runtime: TTS steps: a badge "AI 音声" in the control bar, nothing on the stage or with the captions; the recorded step has no note (${JSON.stringify(ai)})`);
  await pp.close();
  ok(!(await PF.isStale(rec, parseNarration(back.files['narration.md'] ? new TextDecoder().decode(back.files['narration.md']) : '').find((s) => `${s.slideKey}:${s.stepKey}` === pkey))), 'portable: read back: the take is up to date (inputHash)');

  // ---------------------------------------------------------------- 3. TTS の窓（lab/tts-helper.html。?stub=1 でモデルを取らない）
  const popupErrs = [];
  ctx.on('page', (p) => { p.on('pageerror', (e) => popupErrs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') popupErrs.push('console: ' + m.text()); }); });
  await page.evaluate(() => { window.__APP_TEST.tts = null; window.__APP_TEST.ttsHelper = 'lab/tts-helper.html?stub=1'; if (!navigator.gpu) Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true }); });
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => { const b = document.getElementById('dev-audio-tts'); return b && !b.disabled; });
  ok((await page.textContent('#dev-audio-ttsinfo')).includes('Irodori-TTS 500M-v3'), 'tts window: the panel names the engine for a Japanese deck');
  const back0 = ((await audioState()).history[pkey] || []).length;
  await clickUntil(page, '#dev-audio-tts', () => page.waitForSelector('#dlg[open] #tts-what', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #tts-what');
  ok(/1\.26 GB/.test(await page.textContent('#tts-what')), 'tts window: asks before the first download and shows its size');
  await shot(page, 'audio-tts-confirm.png');
  const popupP = ctx.waitForEvent('page');
  await clickDlg(page, '#dlg-ok');
  const popup = await popupP;
  await waitUsed('tts', back0 + 1, 60000);
  ok(new URL(popup.url()).pathname.endsWith('/lab/tts-helper.html'), 'tts window: synthesis runs in the separate TTS page');
  const tw = (await audioState()).entry;
  ok(tw.kind === 'tts' && tw.recipe.engine === 'stub' && tw.dur > 0.3, `tts window: a take came back from the window (${tw.dur} s)`);
  ok(!popupErrs.length, 'tts window: no errors in the TTS page' + (popupErrs.length ? '\n       ' + popupErrs.join('\n       ') : ''));
  // 窓でない所からの答えは受けない（プレビューが同じ形の知らせを送っても）
  await (await frameReady()).evaluate(() => window.parent.postMessage({ type: 'studio-tts', kind: 'result', id: 99, pcm: new Float32Array(10), sr: 48000 }, '*'));
  await popup.close();
  // WebGPU がない
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => document.getElementById('dev-audio-tts') && document.getElementById('dev-audio-tts').disabled);
  const nog = await page.textContent('#dev-audio-ttsinfo');
  ok(nog.includes('WebGPU') && /^上の「● 録音」/.test(nog) && !nog.includes('synth.py'), 'no WebGPU: the button is off and the panel suggests recording first (no command line)');
  await shot(page, 'audio-no-webgpu.png');

  ok(!errs.length, 'console: no errors' + (errs.length ? '\n       ' + errs.join('\n       ') : ''));
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e.message));
  await shot(page, 'audio-failure.png').catch(() => {});
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
