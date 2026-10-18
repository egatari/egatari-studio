// 編集アプリ（app/）の音声の板の確認（app/audio-panel.js）
//   node tools/test-audio.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// Chromium の偽のマイク（--use-fake-device-for-media-stream と、作った音声のファイル --use-file-for-fake-audio-capture）で録音し、
// TTS は差し替え（モデルを取りに行かない）。確かめること：
//   フォルダ：板はプレビューの外・録音の大きさの表示・録音している間プレビューは inert・取り直しの一覧・「この音声を使う」で
//     audio/rec_<hash>.mp3 と audio/manifest.json（kind recorded・sync none・inputHash）と控え・最新の印 → 口述原稿を直すと「古い」の印と警告 →
//     TTS（差し替え）で作り直す：読み辞書を通した文・{mark} の区切りの cues・recipe（processing・dictionary）→ 使うと最新に戻る
//   持ち運べる 1 ファイル：権利の確認のあと録音して使い、「保存」が段 A（音声の段階だけが変わる）で、読み戻すと録音の記録と MP3 の塊
//   プレビューからの知らせでは録音を始められない（板の中身も変わらない）。コンソールのエラーがない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import * as PF from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { encodeWav } from '../kit/core/audio-core.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { regionDiff } from './tier-a-diff.mjs';

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
  parseNarration(fs.readFileSync(path.join(PDIR, 'narration.md'), 'utf8')).forEach((x, j) => { fs.writeFileSync(path.join(PDIR, 'audio', `seg_js${j}.wav`), silentWav(0.5)); segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' }; });
  fs.writeFileSync(path.join(PDIR, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  fs.writeFileSync(path.join(PDIR, 'egatari.json'), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
}
const pmin = await buildPortable(path.join(PDIR, 'deck.html'), { out: path.join(PDIR, 'out', 'deck.ega.html') });

// ---------------------------------------------------------------- 組んで配る
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single'], { stdio: 'inherit' });
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
// 板の中の取り直し（data-kind）が n 個になるまで
const waitTakes = (n, timeout = 30000) => page.waitForFunction((n) => document.querySelectorAll('#dev-audio-takes .dv-take').length === n && !window.__APP_TEST.audio().busy, n, { timeout });
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
  // 録音
  await page.click('#dev-audio-rec');
  await page.waitForFunction(() => window.__APP_TEST.audio().recording);
  await page.waitForTimeout(1500);
  const meter = await page.evaluate(() => ({ shown: !document.getElementById('dev-audio-meter').hidden, w: parseFloat(document.querySelector('#dev-audio-meter i').style.width) || 0, inert: document.getElementById('preview').inert }));
  ok(meter.shown && meter.w > 10, `record: level meter moves (${meter.w.toFixed(0)}%)`);
  ok(meter.inert, 'record: the preview is inert while recording');
  await shot(page, 'audio-recording.png');
  // 録音している間は、デッキからの位置の知らせで段階を替えない
  await f.evaluate(() => DECK.go(2, 3, false));
  await page.waitForTimeout(300);
  ok((await audioState()).key === key, 'record: stays on the recorded step when the deck moves');
  await page.waitForTimeout(1700);
  await page.click('#dev-audio-rec');
  await waitTakes(1);
  let st = await audioState();
  const t1 = st.takes[key] && st.takes[key][0];
  ok(t1 && t1.kind === 'recorded' && t1.dur > 1.9 && t1.dur < 2.6, `record: one recorded take, silence trimmed (${t1 && t1.dur} s of 2.2 s voice + 2 × 0.05 s)`);
  ok(t1 && Math.abs(t1.gainDb) < 30, `record: loudness normalised (gain ${t1 && t1.gainDb.toFixed(1)} dB)`);
  ok(!(await page.evaluate(() => document.getElementById('preview').inert)), 'record: the preview takes clicks again after recording');
  // 2 つ目（録り直し）。前の取り直しは残る
  await page.click('#dev-audio-rec');
  await page.waitForFunction(() => window.__APP_TEST.audio().recording);
  await page.waitForTimeout(1200);
  await page.click('#dev-audio-rec');
  await waitTakes(2);
  ok((await page.textContent('#dev-audio-rec')).includes('録り直す'), 'record: the button says "record again" once there is a take');
  await shot(page, 'audio-takes.png');
  // プレビューからの知らせ（鍵）で板は替わらない・録音も始まらない
  await f.evaluate(() => { for (const k of ['a', 'r', 'x']) window.parent.postMessage({ type: 'edit-hint', kind: 'key', key: k }, '*'); });
  await page.waitForTimeout(200);
  ok(!(await audioState()).recording, 'security: hints from the preview cannot start a recording');
  // 1 つ目を使う
  await page.click(`#dev-audio-takes .dv-take[data-id="${t1.id}"] .dv-use`);
  await page.waitForFunction((k) => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && s.entry.kind === 'recorded' && s.key === k; }, key, { timeout: 30000 });
  const man1 = JSON.parse(await opfsRead('audio/manifest.json'));
  const e1 = man1.segments[key];
  const narr0 = files['narration.md'];
  const seg0 = parseNarration(narr0).find((s) => `${s.slideKey}:${s.stepKey}` === key);
  ok(e1 && e1.kind === 'recorded' && e1.sync === 'none' && Array.isArray(e1.cues) && !e1.cues.length && e1.inputHash === await PF.inputHash(seg0), 'use: manifest entry is kind recorded, sync none, inputHash of the narration');
  ok(/^rec_[0-9a-f]{16}\.mp3$/.test(e1.file) && Math.abs(e1.dur - t1.dur) < 0.002, `use: audio/${e1.file} (${e1.dur} s)`);
  const head = await opfsRead('audio/' + e1.file, true);
  ok(head && (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 || String.fromCharCode(...head.slice(0, 3)) === 'ID3'), 'use: the file is MP3');
  ok((await opfsList('.cache/edits')) === null, 'use: no backup for a new manifest (nothing to back up)');
  st = await audioState();
  ok(st.state === 'fresh' && !(st.takes[key] || []).length, 'use: the panel shows the new take as up to date; the takes are cleared');
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
  ok(true, 'stale: the quick check lists the stale step');
  await page.click('#panel-close');
  // TTS（差し替え）で作り直す
  await page.click('#dev-audio-tts');
  await waitTakes(1);
  st = await audioState();
  const tt = st.takes[key][0];
  const calls = await page.evaluate(() => window.__ttsCalls);
  ok(tt.kind === 'tts' && tt.recipe && tt.recipe.processing === 'trim-45-loud-20-v1' && /^[0-9a-f]{64}$/.test(tt.recipe.dictionary || ''), 'tts: a TTS take with recipe (processing profile, reading dictionary hash)');
  ok(calls.length === 1 && calls[0].text.includes('イータ') && !calls[0].text.includes('{'), `tts: the reading of {η|イータ} is passed, without markup (${calls[0] && calls[0].text})`);
  ok(Array.isArray(tt.cues) && tt.cues.length === 1 && tt.cues[0] === 0, 'tts: one cue per {mark} boundary (synth.py rule)');
  await shot(page, 'audio-tts-take.png');
  await page.click('#dev-audio-takes .dv-take .dv-use');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && s.entry.kind === 'tts'; }, null, { timeout: 30000 });
  const man2 = JSON.parse(await opfsRead('audio/manifest.json'));
  const e2 = man2.segments[key];
  ok(e2.kind === 'tts' && e2.sync === 'auto' && e2.recipe.engine === 'stub' && e2.recipe.seed === 42 && e2.recipe.voice.expert === 'bob' && !('novice' in e2.recipe.voice), 'tts: manifest entry kind tts with recipe (voices of the roles that speak)');
  ok((await audioState()).state === 'fresh', 'tts: up to date again');
  ok((await opfsList('.cache/edits') || []).some((n) => n.endsWith('-manifest.json')), 'tts: the previous manifest was backed up to .cache/edits/');
  ok((await opfsList('audio')).filter((n) => n.endsWith('.mp3')).length === 2, 'tts: the earlier recording stays in audio/ (not deleted)');
  await page.waitForFunction((k) => !window.__APP_TEST.state().warn.some((w) => w.includes(k) && w.includes('古い')), key, { timeout: 15000 });
  ok(true, 'tts: the stale warning is gone');
  // Node の build が、録音の sync none を持ち運ぶ（フォルダを写して組む）
  await page.click('#dev-audio .dv-ghost');
  ok(!(await page.isVisible('#dev-audio')), 'panel: closes');

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
  await page.click('#dlg-ok');
  await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction((k) => window.__APP_TEST.audio().key === k && window.__APP_TEST.audio().entry, pkey);
  ok((await audioState()).entry.kind === 'tts', 'portable: the current (dry-run) audio is shown');
  await page.click('#dev-audio-rec');
  await page.waitForFunction(() => window.__APP_TEST.audio().recording);
  await page.waitForTimeout(1200);
  await page.click('#dev-audio-rec');
  await waitTakes(1);
  await page.click('#dev-audio-takes .dv-take .dv-use');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && s.entry && s.entry.kind === 'recorded'; }, null, { timeout: 30000 });
  ok((await page.evaluate(() => window.__APP_TEST.state().portable.dirty)), 'portable: using a take marks the file unsaved');
  await page.evaluate(() => window.__APP_TEST.save('save'));
  const ps = await page.evaluate(() => window.__APP_TEST.state().portable);
  ok(ps.lastTier === 'A' && ps.lastTierA && JSON.stringify(ps.lastTierA.audio) === JSON.stringify([pkey]) && !ps.dirty, `portable: saved by tier A, only ${pkey} audio changed`);
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true;
  try { regionDiff(pmin.html, saved, { audio: [pkey] }); } catch (e) { diffOk = false; console.log('       ' + e.message.slice(0, 300)); }
  ok(diffOk, 'portable: bytes outside the tier A regions are identical (region diff)');
  const back = await PF.readPortable(saved);
  const rec = back.index.audio[pkey];
  ok(rec.kind === 'recorded' && rec.sync === 'none' && back.index.blobs[back.index.files[rec.file]].mime === 'audio/mpeg', 'portable: read back: recorded record, MP3 blob');
  ok(!(await PF.isStale(rec, parseNarration(back.files['narration.md'] ? new TextDecoder().decode(back.files['narration.md']) : '').find((s) => `${s.slideKey}:${s.stepKey}` === pkey))), 'portable: read back: the take is up to date (inputHash)');

  // ---------------------------------------------------------------- 3. TTS の窓（lab/tts-helper.html。?stub=1 でモデルを取らない）
  const popupErrs = [];
  ctx.on('page', (p) => { p.on('pageerror', (e) => popupErrs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') popupErrs.push('console: ' + m.text()); }); });
  await page.evaluate(() => { window.__APP_TEST.tts = null; window.__APP_TEST.ttsHelper = 'lab/tts-helper.html?stub=1'; if (!navigator.gpu) Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true }); });
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => { const b = document.getElementById('dev-audio-tts'); return b && !b.disabled; });
  ok((await page.textContent('#dev-audio-ttsinfo')).includes('Irodori-TTS 500M-v3'), 'tts window: the panel names the engine for a Japanese deck');
  await page.click('#dev-audio-tts');
  await page.waitForSelector('#dlg[open] #tts-what');
  ok(/1\.26 GB/.test(await page.textContent('#tts-what')), 'tts window: asks before the first download and shows its size');
  await shot(page, 'audio-tts-confirm.png');
  const popupP = ctx.waitForEvent('page');
  await page.click('#dlg-ok');
  const popup = await popupP;
  await waitTakes(1, 60000);
  ok(new URL(popup.url()).pathname.endsWith('/lab/tts-helper.html'), 'tts window: synthesis runs in the separate TTS page');
  const tw = (await audioState()).takes[pkey][0];
  ok(tw.kind === 'tts' && tw.recipe.engine === 'stub' && tw.dur > 0.3, `tts window: a take came back from the window (${tw.dur} s)`);
  ok(!popupErrs.length, 'tts window: no errors in the TTS page' + (popupErrs.length ? '\n       ' + popupErrs.join('\n       ') : ''));
  // 窓でない所からの答えは受けない（プレビューが同じ形の知らせを送っても）
  await (await frameReady()).evaluate(() => window.parent.postMessage({ type: 'studio-tts', kind: 'result', id: 99, pcm: new Float32Array(10), sr: 48000 }, '*'));
  await popup.close();
  // WebGPU がない
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await page.waitForFunction(() => document.getElementById('dev-audio-tts') && document.getElementById('dev-audio-tts').disabled);
  ok((await page.textContent('#dev-audio-ttsinfo')).includes('WebGPU'), 'no WebGPU: the button is off and the panel explains the fallback (record, or tts/synth.py)');
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
