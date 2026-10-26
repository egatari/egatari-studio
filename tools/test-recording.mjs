// 編集アプリ（app/）の録音モードの確認（app/rec-mode.js。backlog #47）
//   node tools/test-recording.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// Chromium の偽のマイク（--use-fake-device-for-media-stream と、作った音声のファイル --use-file-for-fake-audio-capture。繰り返し鳴る）で、
// キーボードだけで録る。確かめること：
//   r（このページ・デッキからの知らせ）で開く・開いたらフォーカスは板・プレビューは inert・上の帯は inert・舞台がプレビューで横に出る（その段階へ動く）
//   Space で録音（メーター・経過）→ Space で止めるとすぐその段階の音声（kind recorded・前後の無音を削る・manifest・前に戻せる）
//   Enter で採用して次の段階へ（次は待機：自動では録り始めない）・音声のない段階の Enter は進まず知らせる・Space→話す→Enter で 1 段が録り切れる
//   C で {cue} を置く：数が合えば sync manual（cues は音声の長さの中・増える順）、足りない・多ければ sync none（警告）、取り直しは前の cue を使わない
//   Backspace：録音中は今のテイクを捨てる（書かない）・録った後は「前に戻す」で前の音声へ
//   ← → で段階の移動・端の知らせ・Esc で閉じてフォーカスが戻る・録音中の Esc は今のテイクを捨てる
//   記録の kind は recorded（印は付けない）・e n r のキーはこの板の間は何もしない・プレビューからの知らせでは録音が始まらない
//   音声の板の「● 録音 (r)」：その段階で開く・1 段録って Esc で板に戻ると、板がその段階の新しい音声を見せる（録り方は 1 つ。#82）
//   読み上げソフトへ：live region（段階・録音中・できた）・alert・ボタンの名前と aria-pressed・dialog の属性・reduced-motion・English
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { build } from '../kit/build.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { encodeWav } from '../kit/core/audio-core.mjs';
import { clickUntil } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-rec-')));
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

// ---------------------------------------------------------------- 偽のマイクの音：3.2 秒の繰り返し（0.4 秒の無音・話し声らしい音 2.2 秒・0.6 秒の無音。48 kHz）。
// 録音は 3.4 秒以上にするので、どこから録っても話し声の全体が入る
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

// ---------------------------------------------------------------- 教材：examples/minimal の口述原稿の 1 段階に {cue} を 2 つ足す
const SRC = path.join(ROOT, 'examples/minimal');
const CUE_LINE = '次の点は、今の点から勾配に比例した分だけ引いて作ります。';
let narr = fs.readFileSync(path.join(SRC, 'narration.md'), 'utf8');
if (!narr.includes(CUE_LINE)) throw new Error('fixture changed: ' + CUE_LINE);
// {mark:…} も区切り：{mark:grad} の段階に {cue} を足して、mark と cue が混じった 2 つの区切りの段階にする
const MIX_LINE = '{mark:grad}勾配は、損失が最も急に増える向きです。';
if (!narr.includes(MIX_LINE)) throw new Error('fixture changed: ' + MIX_LINE);
narr = narr.replace(MIX_LINE, '{mark:grad}勾配は、損失が{cue}最も急に増える向きです。');
narr = narr.replace(CUE_LINE, '次の点は、{cue}今の点から{cue}勾配に比例した分だけ引いて作ります。');
const segs = parseNarration(narr);
const keyOf = (s) => `${s.slideKey}:${s.stepKey}`;
const keys = segs.map(keyOf);
const CUE2 = keys[segs.findIndex((s) => s.bounds.length === 2)];       // 区切りが 2 個の段階
const MARK1 = keys[segs.findIndex((s) => s.bounds.length === 1)];      // 区切りが 1 個の段階
const MIXI = segs.findIndex((s) => s.turns.some((t) => t.raw.includes('{mark:grad}')));
const NONE0 = keys.findIndex((k, j) => segs[j].bounds.length === 0);   // 区切りのない段階（先頭付近）
const iCue = keys.indexOf(CUE2);
ok(MIXI > iCue && segs[MIXI].bounds.length === 2 && segs[MIXI].bounds[0].type === 'mark' && segs[MIXI].bounds[1].type === 'cue', 'fixture: a step with a mark and a cue');
ok(iCue > 1 && NONE0 >= 0 && keys.indexOf(MARK1) >= 0, `fixture: ${keys.length} steps; cue step ${CUE2} (#${iCue}), mark step ${MARK1}`);

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

const browser = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${MIC}`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, locale: 'ja-JP', permissions: ['microphone'] });
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
const recState = () => page.evaluate(() => window.__APP_TEST.rec());
// ページの中で述語を走らせる（CSP が文字列の eval を許さないので、関数をそのまま渡す）
const waitRec = (fn, arg, timeout = 30000) => page.waitForFunction(([fn, arg]) => { const s = window.__APP_TEST.rec(); return window.__pred[fn](s, arg); }, [fn, arg ?? null], { timeout });
const waitPhase = (p) => waitRec('phase', p);
const waitIdx = (n) => waitRec('idx', n);
const opfsRead = (rel) => page.evaluate(async (rel) => {
  try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(name)).getFile()).text(); }
  catch { return null; }
}, rel);
const manifest = async () => { const t = await opfsRead('audio/manifest.json'); return t ? JSON.parse(t).segments : {}; };
// 録ったテイクが manifest に書かれ、板が待機に戻るまで（前の記録 prev と違う記録になるまで）
async function waitWritten(key, prev) {
  for (let i = 0; i < 300; i++) {
    const e = (await manifest())[key];
    if (e && (!prev || e.file !== prev.file) && (await recState()).phase === 'idle') return e;
    await page.waitForTimeout(100);
  }
  throw new Error('take was not written for ' + key + ' ' + JSON.stringify(await recState()) + ' alert=' + await alertText() + ' note=' + await page.evaluate(() => (document.getElementById('rec-take') || {}).textContent) + ' man=' + (await opfsRead('audio/manifest.json')) + ' files=' + await page.evaluate(async () => { const out = []; async function walk(d, p) { for await (const [k, v] of d.entries()) { out.push(p + k); if (v.kind === 'directory') await walk(v, p + k + '/'); } } await walk(window.__testDir, ''); return out.join(','); }));
}
const live = () => page.evaluate(() => document.getElementById('rec-live') && document.getElementById('rec-live').textContent);
const alertText = () => page.evaluate(() => document.getElementById('rec-alert') && document.getElementById('rec-alert').textContent);
const liveHas = async (re, timeout = 4000) => { const t0 = Date.now(); for (;;) { const t = await live(); if (re.test(t || '')) return t; if (Date.now() - t0 > timeout) return t; await page.waitForTimeout(60); } };
// Space で始め、ms 待ち（taps の各時刻に C を押す）、止めずに終わる。stop：'Space' | 'Enter'
async function record(ms, taps = [], stop = 'Space') {
  await page.keyboard.press('Space');
  await waitPhase('recording');
  const t0 = Date.now();
  for (const at of taps) { await page.waitForTimeout(Math.max(0, at - (Date.now() - t0))); await page.keyboard.press('c'); }
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  await page.keyboard.press(stop);
}

try {
  await page.goto(BASE);
  await page.waitForSelector('#drop');
  const files = { 'deck.html': fs.readFileSync(path.join(SRC, 'deck.html'), 'utf8'), 'narration.md': narr };
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('rec-deck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('rec-deck', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, files);
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'folder: opened');
  const f = await frameReady();
  await page.evaluate(() => { window.__pred = { phase: (s, p) => s.phase === p, idx: (s, n) => s.open && s.ready && s.idx === n && s.phase === 'idle' && !!s.key, idle: (s) => s.open && s.ready && s.phase === 'idle' && !!s.key }; });
  ok(!(await page.$('#b-rec')), 'toolbar: no extra button (the toolbar must stay on one row); the entry is r and the Audio panel');

  // ---------------------------------------------------------------- 開く（r）
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('r');
  await page.waitForSelector('#rec-mode');
  await waitRec('idle');
  let st = await recState();
  ok(st.steps === keys.length && st.idx === 0 && st.key === keys[0], `open: r opens at the step on screen (${st.key}, ${st.steps} steps)`);
  const a11y = await page.evaluate(() => { const r = document.getElementById('rec-mode'); return { role: r.getAttribute('role'), modal: r.getAttribute('aria-modal'), lab: r.getAttribute('aria-labelledby'), title: document.getElementById('rec-title').textContent, focus: document.activeElement === r, topInert: document.getElementById('top').inert, prevInert: document.getElementById('preview').inert, side: getComputedStyle(document.getElementById('dev-side')).display, live: document.getElementById('rec-live').getAttribute('aria-live'), alert: document.getElementById('rec-alert').getAttribute('role') }; });
  ok(a11y.role === 'dialog' && a11y.modal === 'true' && a11y.lab === 'rec-title' && a11y.title === '録音モード', 'a11y: a modal dialog named by its title');
  ok(a11y.focus, 'a11y: focus moves to the recording screen');
  ok(a11y.topInert && a11y.prevInert, 'a11y: the toolbar and the preview are inert while it is open');
  ok(a11y.live === 'polite' && a11y.alert === 'alert', 'a11y: a polite live region and an alert region');
  ok(/録音モード/.test(await liveHas(/録音モード/)) && /Space/.test(await live()) && /段階 1 \/ \d+/.test(await live()), 'live: opening announces the mode, the keys and the step');
  const names = await page.evaluate(() => [...document.querySelectorAll('#rec-mode button')].map((b) => ({ id: b.id, name: b.textContent.trim(), ks: b.getAttribute('aria-keyshortcuts') })));
  ok(names.length === 7 && names.every((b) => b.name && b.ks), 'a11y: every key also has a button with a name and aria-keyshortcuts ' + names.map((b) => b.ks).join(','));
  const pr = await page.evaluate(() => ({ text: document.getElementById('rec-script').textContent, pos: document.getElementById('rec-pos').textContent, fs: parseFloat(getComputedStyle(document.getElementById('rec-script')).fontSize), vb: document.getElementById('viewer').getBoundingClientRect().width, rb: document.getElementById('rec-mode').getBoundingClientRect().width, state: document.getElementById('rec-state').textContent }));
  ok(pr.text.includes('勾配降下法の基本') && pr.fs >= 26 && pr.rb > pr.vb && pr.state === '待機', `prompter: the narration is large (${pr.fs.toFixed(0)} px), wider than the stage thumbnail (${pr.rb.toFixed(0)} vs ${pr.vb.toFixed(0)}), state ${pr.state}`);
  ok(pr.vb > 200, 'stage: the preview stays beside the prompter (it is the stage thumbnail)');
  await shot(page, 'rec-open.png');
  // e・n・r は何もしない（口述原稿・編集・コメントの欄が開かない）
  for (const k of ['e', 'n', 'r']) await page.keyboard.press(k);
  await page.waitForTimeout(150);
  const ui0 = await page.evaluate(() => window.__APP_TEST.ui());
  ok(!ui0.edit && !ui0.narr && !ui0.comments && (await recState()).open, 'keys: e, n and r do nothing while recording mode is open');
  // デッキ（プレビュー）からの知らせ：開けるだけ・録音は始まらない
  await f.evaluate(() => { for (const k of ['r', 'x', ' ']) window.parent.postMessage({ type: 'edit-hint', kind: 'key', key: k }, '*'); });
  await page.waitForTimeout(250);
  ok((await recState()).phase === 'idle' && !(await recState()).mic, 'security: hints from the preview cannot start a recording or open the microphone');

  // ---------------------------------------------------------------- ← →（端の知らせ）
  await page.keyboard.press('ArrowLeft');
  ok(/最初/.test(await liveHas(/最初/)) && (await recState()).idx === 0, 'move: ← on the first step says so');
  await page.keyboard.press('ArrowRight'); await waitIdx(1);
  st = await recState();
  ok(st.key === keys[1], 'move: → goes to the next step (' + st.key + ')');
  await page.waitForFunction((k) => (window.__APP_TEST.ui().pos || {}).key === k, keys[1], { timeout: 10000 });
  ok(true, 'stage: the preview follows the recording cursor');
  ok(/段階 2 \/ \d+/.test(await liveHas(/段階 2 \//)), 'live: a step change announces "step n of N"');
  await page.keyboard.press('ArrowLeft'); await waitIdx(0);

  // ---------------------------------------------------------------- Enter：音声のない段階では進まない
  await page.keyboard.press('Enter');
  ok(/まだ音声がありません/.test(await (async () => { for (let i = 0; i < 40; i++) { const t = await alertText(); if (t) return t; await page.waitForTimeout(50); } return ''; })()) && (await recState()).idx === 0, 'Enter: a step with no audio does not advance and says so (alert)');

  // ---------------------------------------------------------------- 1 段：Space → 話す → Enter（停止・採用・次へ）
  await record(3600, [], 'Enter');
  const e0 = await waitWritten(keys[0], null);
  await waitIdx(1);
  ok(e0.kind === 'recorded' && e0.sync === 'none' && e0.cues.length === 0 && typeof e0.inputHash === 'string', `one step: Space, speak, Enter → kind recorded, sync none, inputHash (${e0.dur} s)`);
  // 偽のマイクは遅れて始まることがあり、録音の長さも実行環境で揺れる。実測の raw・head・tail（アプリが報告する）に対して性質を確かめる
  const r0 = (await recState()).result;
  const TOL = 0.05;
  ok(r0 && r0.key === keys[0] && r0.raw > 0, `post-processing: the app reports the raw take (${r0 && r0.raw} s, head ${r0 && r0.head} s, tail ${r0 && r0.tail} s)`);
  ok(e0.dur > 1.9 && e0.dur <= r0.raw + TOL, `post-processing: the take is trimmed, not longer than the raw take (${e0.dur} s from ${r0.raw} s raw; the trimming itself is checked in test-audio-core)`);
  ok(Math.abs(e0.dur - (r0.raw - r0.head - r0.tail)) <= TOL, `post-processing: dur = raw - head - tail (${e0.dur} vs ${(r0.raw - r0.head - r0.tail).toFixed(3)})`);
  const lev0 = r0.loudness + r0.gainDb;
  ok(Math.abs(lev0 - (-20)) < 1.0 || Math.abs(r0.peakDb - (-1.5)) < 0.1, `post-processing: the take is levelled (${lev0.toFixed(1)} LUFS for the -20 target, true peak ${r0.peakDb.toFixed(1)} dB)`);
  ok(r0.peakDb <= -1.5 + 0.1, `post-processing: the true peak stays under the limit (${r0.peakDb.toFixed(2)} dB)`);
  ok(!(await opfsRead('audio/' + e0.file) === null), 'write: the audio file is in audio/');
  st = await recState();
  ok(st.phase === 'idle' && st.key === keys[1] && st.mine.includes(keys[0]), 'Enter: moved to the next step, which waits (recording never starts by itself)');
  await page.waitForTimeout(600);
  ok((await recState()).phase === 'idle' && !(await recState()).taps, 'Enter: still waiting a moment later');
  ok(/段階 2 \/ \d+/.test(await live()), 'live: the next step is announced');

  // ---------------------------------------------------------------- Space で止める：同じ段階に留まり、結果が見える
  await record(3500, [], 'Space');
  const e1 = await waitWritten(keys[1], null);
  st = await recState();
  ok(st.key === keys[1] && st.idx === 1, 'Space: stopping stays on the same step');
  await liveHas(/Enter で次の段階/);
  const res = await page.evaluate(() => ({ r: (document.getElementById('rec-result') || {}).textContent, cur: document.getElementById('rec-cur').textContent, live: document.getElementById('rec-live').textContent }));
  ok(/録音しました：\d\.\d\d 秒/.test(res.r || '') && /録音/.test(res.cur) && /Enter で次の段階/.test(res.live), 'Space: the take length and gain are shown and announced ' + JSON.stringify(res));
  await shot(page, 'rec-taken.png');
  // Enter（録った後）：採用して次へ（書き換えない）
  await page.keyboard.press('Enter'); await waitIdx(2);
  ok((await manifest())[keys[1]].file === e1.file, 'Enter after a take only moves on (the take is already in use)');

  // ---------------------------------------------------------------- Backspace：録った後は「前に戻す」
  await page.keyboard.press('ArrowLeft'); await waitIdx(1);
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 100 && (await manifest())[keys[1]]; i++) await page.waitForTimeout(100);
  ok(!(await manifest())[keys[1]], 'Backspace: after a take it reverts to the previous audio (here: none)');
  ok(/前の音声に戻しました/.test(await liveHas(/前の音声に戻しました/)), 'live: the retake is announced');
  await waitPhase('idle');
  await page.keyboard.press('Backspace');
  ok(/取り直すテイクがありません/.test(await (async () => { for (let i = 0; i < 40; i++) { const t = await alertText(); if (/取り直す/.test(t || '')) return t; await page.waitForTimeout(50); } return ''; })()), 'Backspace: nothing to retake says so');
  // 録音中の Backspace は今のテイクを捨てる（書かない）
  const before = JSON.stringify(await manifest());
  await page.keyboard.press('Space'); await waitPhase('recording');
  // 偽のマイクは繰り返しなので、メーターは数秒のうちに最大になる所を見る
  let mw = 0;
  for (let i = 0; i < 30; i++) { mw = Math.max(mw, await page.evaluate(() => parseFloat(document.querySelector('#rec-meter i').style.width) || 0)); await page.waitForTimeout(100); }
  const rm = await page.evaluate((mw) => ({ w: mw, t: document.getElementById('rec-time').textContent, on: document.getElementById('rec-b-space').getAttribute('aria-pressed'), prevInert: document.getElementById('preview').inert, st: document.getElementById('rec-state').textContent }), mw);
  ok(rm.w > 5 && /^[0-9.]+ s$/.test(rm.t) && rm.on === 'true' && rm.prevInert && rm.st === '録音中', `recording: the level meter moves (${rm.w.toFixed(0)}%), elapsed ${rm.t}, the record button is pressed, the preview is inert`);
  ok(/録音中/.test(await live()), 'live: "recording" is announced');
  await shot(page, 'rec-recording.png');
  await page.keyboard.press('Backspace');
  await waitPhase('idle');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await manifest()) === before, 'Backspace while recording: the take is thrown away and nothing is written');

  // ---------------------------------------------------------------- C：{cue} を置く（sync manual）
  // 矢印を続けて押しても、数えこぼさない（段階を読み込んでいる最中でも）
  const at0 = (await recState()).idx;
  for (let i = at0; i < iCue; i++) await page.keyboard.press('ArrowRight');
  await waitIdx(iCue);
  const cueGuide = await page.evaluate(() => ({ chips: document.querySelectorAll('.rm-chip').length, notes: document.getElementById('rec-notes').textContent, lab: document.querySelector('.rm-chip').getAttribute('aria-label') }));
  ok(cueGuide.chips === 2 && /区切りが 2 個/.test(cueGuide.notes + '') === false && /未設定/.test(cueGuide.notes) && /区切り 1 \/ 2/.test(cueGuide.lab), 'cue step: the boundaries are chips (2), with a note that they are not set yet');
  await page.keyboard.press('Space'); await waitPhase('recording');
  const chipState = async () => page.evaluate(() => [...document.querySelectorAll('.rm-chip')].map((c) => c.className.replace('rm-chip', '').trim() + ':' + c.textContent));
  ok((await chipState())[0].startsWith('next'), 'cue: while recording the first chip is lit as the next one ' + JSON.stringify(await chipState()));
  await page.waitForTimeout(1200);
  await page.keyboard.press('c');
  ok(/区切り 1 \/ 2/.test(await liveHas(/区切り 1 \/ 2/)), 'live: each C press announces "cue n of N"');
  await page.waitForTimeout(1000);
  await page.keyboard.press('c');
  ok((await chipState()).every((c) => c.startsWith('done')), 'cue: both chips are marked done after two presses ' + JSON.stringify(await chipState()));
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  const ec = await waitWritten(CUE2, null);
  const rc = (await recState()).result;
  const tp = rc.tapTimes;
  ok(ec.kind === 'recorded' && ec.sync === 'manual' && ec.cues.length === 2 && rc.key === CUE2 && tp.length === 2, `cue: two presses → sync manual, cues ${JSON.stringify(ec.cues)} inside the ${ec.dur} s audio (raw ${rc.raw} s, head trimmed ${rc.head} s)`);
  ok(ec.cues[0] >= 0 && ec.cues[1] > ec.cues[0] && ec.cues[1] <= ec.dur, `cue: increasing and inside [0, ${ec.dur}] (${JSON.stringify(ec.cues)})`);
  // 各 cue は「押した時刻 − 実測の head」（[0, dur] に収めた値）：head がどれだけ削れても成り立つ
  const wantCue = tp.map((x) => Math.max(0, Math.min(ec.dur, x - rc.head)));
  ok(ec.cues.every((c, i) => Math.abs(c - wantCue[i]) <= 0.01), `cue: each cue is the press time minus the measured head (${JSON.stringify(tp.map((x) => +x.toFixed(3)))} - ${rc.head} → ${JSON.stringify(ec.cues)})`);
  // 間隔：押した間隔に等しい（端で [0, dur] に切られていなければ）。押した間隔そのものは待ち時間の約 1.0 秒
  const pressGap = tp[1] - tp[0], cueGap = ec.cues[1] - ec.cues[0];
  const clamped = tp[0] - rc.head < 0 || tp[1] - rc.head > ec.dur;
  ok(Math.abs(pressGap - 1.0) < 0.35, `cue: the presses were about 1.0 s apart (${pressGap.toFixed(2)} s)`);
  ok(clamped ? cueGap <= pressGap + 0.01 : Math.abs(cueGap - pressGap) <= 0.01, `cue: the spacing of the cues follows the presses (${cueGap.toFixed(3)} s for ${pressGap.toFixed(3)} s${clamped ? ', one end clamped' : ''})`);
  // 取り直し：前の cue は使わない（C を押さなければ sync none）
  await waitPhase('idle');
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 100 && (await manifest())[CUE2]; i++) await page.waitForTimeout(100);
  await waitPhase('idle');
  await record(3500, [], 'Space');
  const ec2 = await waitWritten(CUE2, null);
  ok(ec2.sync === 'none' && ec2.cues.length === 0, 'retake: the new take starts from sync none (the earlier cues are not reused)');
  ok(/2 個/.test(await page.textContent('#rec-nocues') || '') && /未設定/.test(await page.textContent('#rec-nocues')), 'cue: a step with unset cues warns that figures advance by time ' + await page.textContent('#rec-notes'));
  // 数が合わない（1 回だけ押す）：sync none ＋ 警告
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 100 && (await manifest())[CUE2]; i++) await page.waitForTimeout(100);
  await waitPhase('idle');
  await record(3500, [1200], 'Space');
  const ec3 = await waitWritten(CUE2, null);
  ok(ec3.sync === 'none' && ec3.cues.length === 0, 'mismatch: one press for two cues → sync none, no wrong cues');
  const mm = await page.evaluate(() => (document.getElementById('rec-mismatch') || {}).textContent);
  ok(/1 回押しました/.test(mm || '') && /2 個/.test(mm), 'mismatch: the screen says how many presses and cues there were');
  ok(/数が合わない/.test(await liveHas(/数が合わない/)), 'live: the mismatch is announced');
  // 2 回の C を押して手直し（manual に戻る）
  await record(3600, [1200, 2200], 'Space');
  const ec4 = await waitWritten(CUE2, ec3);
  ok(ec4.sync === 'manual' && ec4.cues.length === 2, 'cue: a new take with the right number of presses is manual again');
  await shot(page, 'rec-cues.png');

  // ---------------------------------------------------------------- 履歴（前に戻す 20 件の中）と build への反映（deck-audio の kind・sync）
  // 作業フォルダの中身をディスクへ写して、ふつうの build（kit/build.mjs）に通す：deck-audio に kind recorded・sync manual・cues が渡る
  const dump = await page.evaluate(async () => {
    const out = {};
    async function walk(d, p) { for await (const [k, v] of d.entries()) { if (v.kind === 'directory') { if (k !== '.cache') await walk(v, p + k + '/'); } else { const b = new Uint8Array(await (await v.getFile()).arrayBuffer()); let bin = ''; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192)); out[p + k] = btoa(bin); } } }
    await walk(window.__testDir, '');
    return out;
  });
  const BD = path.join(work, 'bdeck');
  fs.rmSync(BD, { recursive: true, force: true });
  for (const [rel, b64] of Object.entries(dump)) { const fp = path.join(BD, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.from(b64, 'base64')); }
  const da = JSON.parse(/<script type="application\/json" id="deck-audio">([\s\S]*?)<\/script>/.exec(build(path.join(BD, 'deck.html'), { out: path.join(BD, 'out', 'deck.html') }).html)[1]);
  ok(da[CUE2] && da[CUE2].kind === 'recorded' && da[CUE2].sync === 'manual' && da[CUE2].cues.length === 2 && da[keys[0]] && da[keys[0]].kind === 'recorded' && da[keys[0]].sync === 'none', 'build: deck-audio carries kind recorded, and sync manual with the two cues for the cued step ' + JSON.stringify(da[CUE2] && { k: da[CUE2].kind, s: da[CUE2].sync, c: da[CUE2].cues }));

  // ---------------------------------------------------------------- {mark} も区切り：mark と cue が混じった段階（チップ・数・sync manual）
  await page.keyboard.press('ArrowRight'); await waitIdx(iCue + 1);   // 更新の式:2（{mark} 1 個）
  const mk = keys[iCue + 1];
  ok(MARK1 === mk && await page.evaluate(() => document.querySelectorAll('.rm-chip').length) === 1, 'mark: a {mark} boundary is a chip too');
  await record(3500, [1200], 'Space');
  const em = await waitWritten(mk, null);
  ok(em.sync === 'manual' && em.cues.length === 1, `mark: one press for one {mark} → sync manual (${JSON.stringify(em.cues)})`);
  await page.keyboard.press('ArrowRight'); await waitIdx(MIXI);
  const mx = await page.evaluate(() => [...document.querySelectorAll('.rm-chip')].map((c) => c.getAttribute('aria-label')));
  ok(mx.length === 2 && /印/.test(mx[0]) && !/印/.test(mx[1]), 'mix: a mark and a cue are both chips, labelled by kind ' + JSON.stringify(mx));
  await page.keyboard.press('Space'); await waitPhase('recording');
  const cnt0 = await page.textContent('#rec-count');
  await page.waitForTimeout(900); await page.keyboard.press('c');
  const cs1 = await page.evaluate(() => ({ c: document.getElementById('rec-count').textContent, k: [...document.querySelectorAll('.rm-chip')].map((x) => x.className.replace('rm-chip', '').trim()) }));
  ok(/0 \/ 2/.test(cnt0) && /1 \/ 2/.test(cs1.c) && cs1.k[0] === 'done' && cs1.k[1] === 'next', `count: "0 / 2" then "1 / 2", the pressed chip is done and the next one is outlined (${cnt0} → ${cs1.c} ${JSON.stringify(cs1.k)})`);
  await page.waitForTimeout(800); await page.keyboard.press('c');
  await page.waitForTimeout(1900); await page.keyboard.press('Space');
  const e1m = await waitWritten(MIXI === -1 ? mk : keys[MIXI], null);
  ok(e1m.sync === 'manual' && e1m.cues.length === 2, 'mix: mark + cue, two presses → sync manual with 2 cues');
  // 取り直し：前のテイクの cue を決して使わない（§5.3）。1 回目の間隔は約 0.8 秒 → Backspace → 2 回目の間隔は 0.4 秒 → Enter：manifest の cue は 2 回目だけから
  const firstCues = e1m.cues.slice();
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 100 && (await manifest())[keys[MIXI]]; i++) await page.waitForTimeout(100);
  await waitPhase('idle');
  await page.keyboard.press('Space'); await waitPhase('recording');
  await page.waitForTimeout(1500); await page.keyboard.press('c');
  await page.waitForTimeout(400); await page.keyboard.press('c');
  await page.waitForTimeout(1700);
  await page.keyboard.press('Enter');
  const e2m = await waitWritten(keys[MIXI], null);
  ok(e2m.sync === 'manual' && e2m.cues.length === 2 && Math.abs((e2m.cues[1] - e2m.cues[0]) - 0.4) < 0.3 && Math.abs((e2m.cues[1] - e2m.cues[0]) - (firstCues[1] - firstCues[0])) > 0.2,
    `retake: after Backspace and a second take the manifest cues come only from the second take (${JSON.stringify(firstCues)} → ${JSON.stringify(e2m.cues)})`);
  await waitIdx(MIXI + 1);
  // もう一度：2 回押して Backspace → 1 回だけ押して Enter：cue は引き継がれず sync none
  await page.keyboard.press('ArrowLeft'); await waitIdx(MIXI);
  await record(3500, [1000, 1800], 'Space');
  const e3m = await waitWritten(keys[MIXI], e2m);
  ok(e3m.sync === 'manual', 'retake: (setup) a third take with two presses is manual');
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 100 && (await manifest())[keys[MIXI]].file === e3m.file; i++) await page.waitForTimeout(100);
  await waitPhase('idle');
  await page.keyboard.press('Space'); await waitPhase('recording');
  await page.waitForTimeout(1000); await page.keyboard.press('c');
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  const e4m = await waitWritten(keys[MIXI], e3m);
  ok(e4m.file !== e3m.file && e4m.sync === 'none' && e4m.cues.length === 0, `retake: a different number of presses on the second take → sync none, none of the first take's cues survive (${JSON.stringify(e3m.cues)} → ${JSON.stringify(e4m.cues)})`);
  await waitIdx(MIXI + 1);
  for (let j = MIXI + 1; j > iCue; j--) { await page.keyboard.press('ArrowLeft'); await waitIdx(j - 1); }

  // ---------------------------------------------------------------- 録音中の Enter（停止＋採用＋次へ）・← →（先に停止して採用）
  await page.keyboard.press('Space'); await waitPhase('recording');
  await page.waitForTimeout(3500);
  await page.keyboard.press('ArrowRight');
  await waitIdx(iCue + 1);
  const eNext = await manifest();
  ok(eNext[CUE2].file !== ec4.file, '→ while recording: the take is stopped and kept first, then it moves');
  await page.keyboard.press('Space'); await waitPhase('recording');
  await page.waitForTimeout(800);
  // 録音中の Esc：今のテイクを捨てて閉じる
  const m2 = JSON.stringify(await manifest());
  await page.keyboard.press('Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  await page.waitForTimeout(400);
  ok(JSON.stringify(await manifest()) === m2, 'Esc while recording: the take is thrown away, nothing is written');
  const after = await page.evaluate(() => ({ topInert: document.getElementById('top').inert, prevInert: document.getElementById('preview').inert, on: document.getElementById('deck').classList.contains('rec-on'), mic: window.__APP_TEST.rec().mic, focusBody: document.activeElement === document.body || document.activeElement.id === 'preview' }));
  ok(!after.topInert && !after.prevInert && !after.on && !after.mic, 'close: the toolbar and the preview are usable again and the microphone is released');
  ok(after.focusBody, 'close: focus goes back to where it was ' + await page.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id));
  // 音声の板の「● 録音 (r)」：録り方は録音モードだけ（#82）。その段階で開き、1 段だけ録って Esc で板に戻ると、板が新しい音声を見せる
  await page.click('#b-audio');
  await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return s.open && !s.loading && s.key; });
  const pkey = (await page.evaluate(() => window.__APP_TEST.audio())).key;
  ok((await page.textContent('#dev-audio-rec')).includes('(r)') && !(await page.$('#dev-audio-recmode')), 'entry: the Audio panel has one record button, “● 録音 (r)”, and no second way to record');
  const prevE = (await manifest())[pkey];
  await clickUntil(page, '#dev-audio-rec', () => page.waitForSelector('#rec-mode', { timeout: 2500 }));
  await waitRec('idle');
  ok((await recState()).key === pkey, 'panel: the button opens recording mode at the panel\'s step (' + pkey + ')');
  await record(3500, [], 'Space');
  const eP = await waitWritten(pkey, prevE);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  await page.waitForFunction(([k, f]) => { const s = window.__APP_TEST.audio(); return s.open && !s.loading && !s.busy && s.key === k && s.entry && s.entry.file === f; }, [pkey, eP.file], { timeout: 15000 });
  ok(await page.isVisible('#dev-audio-player') && await page.isVisible('#dev-audio-revert'), 'panel: after Esc the panel shows the new take for that step, with Revert to previous');
  // r で開いても、開いていた板は閉じない（録音モードの間は隠れるだけ）
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('r');
  await page.waitForSelector('#rec-mode');
  await waitRec('idle');
  ok((await page.evaluate(() => window.__APP_TEST.audio().open)), 'r: the Audio panel stays open behind recording mode');
  await page.keyboard.press('Shift+Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  ok(!(await page.evaluate(() => window.__APP_TEST.audio().open)), 'close: Shift+Esc closes recording mode and the panel');

  // ---------------------------------------------------------------- 準備中に押した Space（r の直後）：覚えておき、準備ができたら 1 回だけ録り始める
  // 遅い PC・macOS のマイクの許可を真似る：ファイルの読み（口述原稿・manifest）を 250 ms、getUserMedia を 300 ms 遅らせる
  await page.evaluate(() => {
    window.__slow = { gf: FileSystemFileHandle.prototype.getFile, gum: navigator.mediaDevices.getUserMedia, start: MediaRecorder.prototype.start, starts: 0, gums: 0 };
    const S = window.__slow;
    FileSystemFileHandle.prototype.getFile = function (...a) { return new Promise((r) => setTimeout(r, 250)).then(() => S.gf.apply(this, a)); };
    navigator.mediaDevices.getUserMedia = function (...a) { S.gums++; return new Promise((r) => setTimeout(r, 300)).then(() => S.gum.apply(navigator.mediaDevices, a)); };
    MediaRecorder.prototype.start = function (...a) { S.starts++; return S.start.apply(this, a); };
  });
  const unslow = () => page.evaluate(() => { const S = window.__slow; FileSystemFileHandle.prototype.getFile = S.gf; navigator.mediaDevices.getUserMedia = S.gum; MediaRecorder.prototype.start = S.start; });
  const slowCounts = () => page.evaluate(() => ({ starts: window.__slow.starts, gums: window.__slow.gums, dialogs: document.querySelectorAll('#rec-mode').length }));
  await page.evaluate(() => { window.__slow.starts = 0; window.__slow.gums = 0; document.body.focus(); });
  await page.keyboard.press('r');
  await page.keyboard.press('Space');
  await page.keyboard.press('r');       // 開いている途中にもう一度 r：画面は 1 つのまま
  await page.keyboard.press('Space');   // 準備中にもう一度押しても、2 回は始めない
  const prep = await page.evaluate(() => { const b = document.getElementById('rec-b-space'); const s = window.__APP_TEST.rec(); return { ready: s.ready, pending: s.pending, text: b && b.textContent, busy: b && b.getAttribute('aria-busy'), state: (document.getElementById('rec-state') || {}).textContent, focus: document.activeElement && document.activeElement.id, dialogs: document.querySelectorAll('#rec-mode').length }; });
  ok(!prep.ready && prep.pending && /準備中/.test(prep.text) && prep.busy === 'true' && /準備中/.test(prep.state), 'ready: while it is getting ready the record control says 準備中 (aria-busy) and keeps the Space press ' + JSON.stringify(prep));
  ok(prep.focus === 'rec-mode' && prep.dialogs === 1, 'ready: the screen and the focus are there at once, before it is ready; r again while opening keeps one screen ' + JSON.stringify(prep));
  await waitPhase('recording');
  await page.waitForTimeout(800);
  let sc = await slowCounts();
  ok(sc.starts === 1 && sc.gums === 1 && sc.dialogs === 1 && (await recState()).ready && !(await recState()).pending, 'ready: Space pressed right after r (slow files, getUserMedia +300 ms) starts exactly one take ' + JSON.stringify(sc));
  await page.keyboard.press('r');       // 開いているときの r：何もしない（画面は 1 つ）
  await page.waitForTimeout(300);
  ok((await slowCounts()).dialogs === 1 && (await recState()).phase === 'recording', 'ready: opening again while it is open keeps the one screen and the take');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  // プレビューにフォーカスがあるとき、r と同時の Space：デッキは段階を進めない（録音モードはすぐフォーカスを移す）
  {
    await page.click('#preview', { position: { x: 40, y: 40 } });
    await page.waitForTimeout(400);
    const k0 = (await page.evaluate(() => window.__APP_TEST.ui().pos)).key;
    // デッキが受けた Space を数える（デッキの送りのキーと同じ document の keydown）
    const df = page.frames().find((x) => x.parentFrame() === page.mainFrame());
    await df.evaluate(() => { window.__deckSpace = 0; document.addEventListener('keydown', (e) => { if (e.key === ' ') window.__deckSpace++; }); });
    const inFrame = await page.evaluate(() => document.activeElement && document.activeElement.id === 'preview');
    await page.evaluate(() => { window.__slow.starts = 0; });
    await page.keyboard.press('r');
    await page.keyboard.press('Space');
    await page.waitForSelector('#rec-mode');
    await waitRec('idle').catch(() => {});
    await page.waitForTimeout(1200);
    const pos1 = (await page.evaluate(() => window.__APP_TEST.ui().pos)).key;
    const deckSpace = await df.evaluate(() => window.__deckSpace);
    sc = await slowCounts();
    ok(inFrame && deckSpace === 0 && pos1 === k0 && sc.dialogs === 1 && sc.starts <= 1, 'ready: Space at the same instant as r in the preview does not reach the deck (it does not advance) ' + JSON.stringify({ inFrame, deckSpace, k0, pos1, ...sc }));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#rec-mode', { state: 'detached' });
  }
  // 音声の板の「● 録音 (r)」を押してすぐ Space（フォーカスはまだボタン）：録音の画面は 1 つ、テイクは 1 つ
  await page.click('#b-audio');
  await page.waitForSelector('#dev-audio #dev-audio-rec');
  await page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return s.open && !s.loading && s.key; });
  await page.evaluate(() => { window.__slow.starts = 0; window.__slow.gums = 0; });
  await page.click('#dev-audio-rec');
  await page.keyboard.press('Space');
  await waitPhase('recording');
  await page.waitForTimeout(800);
  sc = await slowCounts();
  ok(sc.starts === 1 && sc.dialogs === 1, 'ready: Space right after the panel\'s ● Record button opens one recording screen and starts one take ' + JSON.stringify(sc));
  await page.keyboard.press('Shift+Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  ok((await slowCounts()).dialogs === 0, 'ready: Esc leaves no recording screen behind');
  // 準備に失敗（マイクを使えない）：覚えた Space は捨て、いつもの知らせ。録音は始まらない
  await page.evaluate(() => { window.__slow.starts = 0; navigator.mediaDevices.getUserMedia = () => new Promise((_, rej) => setTimeout(() => rej(new DOMException('Permission denied', 'NotAllowedError')), 300)); document.body.focus(); });
  await page.keyboard.press('r');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => /マイクを使えません/.test((document.getElementById('rec-err') || {}).textContent || ''), null, { timeout: 10000 });
  await waitRec('idle');
  await page.waitForTimeout(400);
  sc = await slowCounts();
  ok(sc.starts === 0 && !(await recState()).pending && /マイクを許可/.test(await alertText()), 'ready: if the microphone is refused, the kept Space is dropped and the usual error is shown ' + JSON.stringify(sc));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#rec-mode', { state: 'detached' });
  await unslow();

  // ---------------------------------------------------------------- English
  await page.goto(BASE + '?lang=en');
  await page.waitForSelector('#drop');
  await page.evaluate(() => { document.getElementById('b-rec'); });
  ok(await page.evaluate(() => document.documentElement.lang === 'en'), 'English: page reloaded');

  ok(!errs.length, 'console: no errors' + (errs.length ? '\n       ' + errs.join('\n       ') : ''));
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e.message));
  await shot(page, 'rec-failure.png').catch(() => {});
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
