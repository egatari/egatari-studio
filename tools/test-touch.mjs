// タッチ画面（iPad・スマートフォン）での操作の帯（kit/tools.js）
//   node tools/test-touch.mjs <built.html> [画面の保存先]
// Chromium と、入っていれば WebKit（npx playwright-core install webkit。なければ「skip」）で、タッチを模して：
// - 帯が隠れた後、スライドを指でタップすると帯が出る（位置は動かない）。何度でも
// - 帯のボタンは指のタップで 1 回だけ効く（次へ・前へ・字幕。ブラウザが click も送っても 2 回にならない）
// - 指で押した後も、帯は決まった時間で隠れる（:hover が残っても）
// - マウスのクリックは今までどおり 1 回
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webkit } from 'playwright-core';
import { launch, fileUrl } from '../kit/browser.mjs';

const [file, outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-touch-'))] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-touch.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const url = fileUrl(file);

async function run(name, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url + '#2');
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
  const pos = () => p.evaluate(() => { const s = DECK.state(); return s.slide * 100 + s.step; });
  const shown = () => p.evaluate(() => { const c = document.getElementById('dt-cb'); return !!c && c.classList.contains('show'); });
  const btn = (n) => `#dt-cb button[data-b="${n}"]`;
  const tapStage = async () => { const r = await p.evaluate(() => document.getElementById('stage').getBoundingClientRect().toJSON()); await p.touchscreen.tap(r.x + r.width * 0.5, r.y + r.height * 0.35); };
  await p.waitForTimeout(5400);
  ok(!(await shown()), `${name}: the bar hides after its first seconds`);
  const p0 = await pos();
  await tapStage(); await p.waitForTimeout(300);
  ok(await shown(), `${name}: a tap on the slide brings the bar back`);
  ok(await pos() === p0, `${name}: the tap on the slide does not advance (${p0} → ${await pos()})`);
  await p.screenshot({ path: path.join(outdir, name + '-woken.png') });
  await p.waitForTimeout(3200);
  ok(!(await shown()), `${name}: the bar hides again`);
  await tapStage(); await p.waitForTimeout(300);
  ok(await shown(), `${name}: and comes back on the next tap`);
  // 帯のボタン：1 回のタップで 1 回
  await p.tap(btn('next')); await p.waitForTimeout(900);
  const p1 = await pos();
  ok(p1 === p0 + 1, `${name}: one tap on ▶ is exactly one step (${p0} → ${p1})`);
  await p.tap(btn('next')); await p.waitForTimeout(900);
  ok(await pos() === p0 + 2, `${name}: a second tap is one more step (${await pos()})`);
  await p.tap(btn('prev')); await p.waitForTimeout(900);
  ok(await pos() === p0 + 1, `${name}: one tap on ◀ is one step back (${await pos()})`);
  const cap0 = await p.evaluate(() => !!(DECK.captions && DECK.captions()));
  await p.tap(btn('cap')); await p.waitForTimeout(900);
  ok(await p.evaluate(() => !!(DECK.captions && DECK.captions())) === !cap0, `${name}: one tap on the captions button toggles them once`);
  await p.tap(btn('cap')); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.activeElement || !document.activeElement.closest('#dt-cb')), `${name}: no focus is left on the bar after a tap`);
  await p.waitForTimeout(3500);
  ok(!(await shown()), `${name}: after tapping its buttons the bar still hides (no stuck hover)`);
  // マウス（同じ窓で）：クリックは今までどおり 1 回
  await p.mouse.move(512, 740, { steps: 3 }); await p.waitForTimeout(300);
  const q0 = await pos();
  await p.click(btn('next')); await p.waitForTimeout(900);
  ok(await pos() === q0 + 1, `${name}: a mouse click is still one step (${q0} → ${await pos()})`);
  ok(errs.length === 0, `${name}: no page errors` + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

const cr = await launch();
await run('chromium', cr);
await cr.close();
let wk = null;
try { wk = await webkit.launch(); } catch (e) { console.log(`skip webkit: not installed (npx playwright-core install webkit): ${String(e.message || e).split('\n')[0]}`); }
if (wk) { await run('webkit', wk); await wk.close(); }
console.log(fails ? `${fails} failed` : 'all passed', '→', outdir);
process.exit(fails ? 1 : 0);
