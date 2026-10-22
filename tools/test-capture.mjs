// 画面を撮る共通の道具（kit/browser.mjs の stableCapture・captureUrl）：発表（talk）の操作の帯が写り込まず、撮る時刻で絵が変わらないこと
//   node tools/test-capture.mjs [出力先]
// 確かめること：talk の読み込み直後は帯 #dt-cb が出ている／stableCapture の絵は、読み込みの 0.5 秒後でも 3 秒後（帯が消えたあと）でも同じ／
// captureUrl は mode=video を付け（#hash は保つ）、video では帯を作らない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, stableCapture, captureUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-capture-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

const deck = path.join(out, 'deck.html');
execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(ROOT, 'examples', 'pitch-fictional', 'deck.html'), '-o', deck], { stdio: 'pipe' });
const b = await launch();
try {
  const open = async (url) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => console.error('pageerror:', e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.DECK && DECK.ready);
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  const barShown = (p) => p.evaluate(() => { const e = document.getElementById('dt-cb'); return !!e && getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0.5; });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = await open(fileUrl(deck) + '?mode=talk');
  const t0 = Date.now();
  ok(await barShown(p), 'talk: the control bar is visible right after load (the thing the helper must hide)');
  await p.evaluate(() => DECK.seek(1, 1, Infinity));
  await sleep(Math.max(0, 500 - (Date.now() - t0)));
  const early = await stableCapture(p);
  await sleep(Math.max(0, 3000 - (Date.now() - t0)));
  const late = await stableCapture(p);
  fs.writeFileSync(path.join(out, 'early.png'), early); fs.writeFileSync(path.join(out, 'late.png'), late);
  ok(early.equals(late), 'talk: stableCapture at ~0.5 s and ~3 s after load is byte-identical');
  await p.close();

  const u = captureUrl(fileUrl(deck) + '?mode=talk#3');
  ok(/[?&]mode=video(&|#|$)/.test(u) && !/mode=talk/.test(u) && u.endsWith('#3'), `captureUrl sets mode=video and keeps the hash (${u.replace(/^.*\//, '')})`);
  const v = await open(u);
  ok(!(await v.evaluate(() => !!document.getElementById('dt-cb'))), 'video: the control bar is never built');
  await v.close();
} finally { await b.close(); }
console.log(fail ? `${fail} failure(s)` : 'all passed');
process.exit(fail ? 1 : 0);
