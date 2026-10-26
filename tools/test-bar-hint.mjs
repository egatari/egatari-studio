// ツールバーの見つけ方（kit/tools.js、backlog #122）
//   node tools/test-bar-hint.mjs <built.html> [画面の保存先]
// - 開くと帯を 5 秒ほど見せる。その端末で初めてなら、帯の上に出し方の 1 行。隠れると 1 行も消える
// - 2 回目に開いたときは 1 行を出さない（localStorage に覚える）。localStorage が使えなければ毎回出す
// - 帯が隠れている間は左下に薄い取っ手。クリック・タップ・キーボード（Enter）で帯が出る。押してもフォーカスを奪わない
// - 動画・発表者ビューの中の画面・埋め込みの controls=0・印刷では、取っ手も 1 行も出さない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from '../kit/browser.mjs';

const [file, outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-bar-hint-'))] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-bar-hint.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const url = fileUrl(file);
const b = await launch();
const errs = [];
const HINT_JA = 'マウスを画面の下に動かす（タップする）と、ツールバーが出ます';
const st = (p) => p.evaluate(() => {
  const cb = document.getElementById('dt-cb'), h = document.getElementById('dt-hint'), hd = document.getElementById('dt-handle');
  const r = hd && hd.getBoundingClientRect();
  return { bar: !!cb && cb.classList.contains('show'), hint: h ? h.textContent : null, hintRole: h ? h.getAttribute('role') : null, hintAria: h ? h.getAttribute('aria-hidden') : null, handle: !!hd && hd.classList.contains('show'),
    handleOp: hd ? +getComputedStyle(hd).opacity : null, handleTab: hd ? hd.tabIndex : null, handleAria: hd ? hd.getAttribute('aria-hidden') : null,
    handleName: hd ? hd.getAttribute('aria-label') : null, handleBox: r ? { l: r.left, b: innerHeight - r.bottom, w: r.width, h: r.height } : null,
    pos: DECK.state().slide * 100 + DECK.state().step, focusHandle: document.activeElement === hd };
});
async function open(ctx, q = '') {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url + q + '#2');
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
  return p;
}

// ---- 初めて開く → 帯と 1 行。5 秒ほどで隠れて取っ手。2 回目は 1 行なし
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  let p = await open(ctx);
  let s = await st(p);
  ok(s.bar && s.hint === HINT_JA, `first open: the bar and the hint line are shown (${s.hint})`);
  ok(s.hintRole === null && s.hintAria === 'true', `the hint line is not announced to screen readers (no role, aria-hidden) ${JSON.stringify([s.hintRole, s.hintAria])}`);
  ok(!s.handle && s.handleTab === -1 && s.handleAria === 'true', 'first open: no handle while the bar is shown (not in the Tab order)');
  await p.screenshot({ path: path.join(outdir, 'first-open.png') });
  await p.waitForTimeout(3600);
  s = await st(p);
  ok(s.bar && s.hint === HINT_JA, 'first open: still shown after 3.6 s (about 5 s)');
  await p.waitForTimeout(2000);
  s = await st(p);
  ok(!s.bar && s.hint === null, 'first open: the bar and the hint hide after about 5 s');
  ok(s.handle && s.handleOp > 0.15 && s.handleOp < 0.5 && s.handleTab === 0 && s.handleAria === null, `the handle is shown, faint (opacity ${s.handleOp}), and in the Tab order`);
  ok(s.handleName === 'ツールバーを表示', `the handle has an accessible name (${s.handleName})`);
  ok(s.handleBox && s.handleBox.l < 20 && s.handleBox.b < 16 && s.handleBox.w <= 40 && s.handleBox.h <= 24, `the handle is small, at the bottom left (${JSON.stringify(s.handleBox)})`);
  await p.screenshot({ path: path.join(outdir, 'handle.png') });
  // クリックで帯が出る。送らず、フォーカスも奪わない
  const p0 = s.pos;
  await p.click('#dt-handle');
  await p.waitForTimeout(250);
  s = await st(p);
  ok(s.bar && !s.handle && s.pos === p0 && !s.focusHandle, 'a click on the handle shows the bar, does not advance and leaves no focus on it');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  ok((await st(p)).pos === p0 + 1, 'arrow keys still move the slides after clicking the handle');
  await p.mouse.move(640, 300); await p.waitForTimeout(3000);
  s = await st(p);
  ok(!s.bar && s.handle, 'the bar hides again (after 2.5 s) and the handle comes back');
  // キーボード：取っ手を選んで Enter で帯が出て、帯の最初のボタンへ
  await p.evaluate(() => document.getElementById('dt-handle').focus());
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  s = await st(p);
  ok(s.bar && await p.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#dt-cb')), 'Enter on the handle shows the bar and moves the focus into it');
  // 印刷では出ない
  await p.keyboard.press('Escape'); await p.mouse.move(640, 300); await p.waitForTimeout(3000);
  await p.emulateMedia({ media: 'print' });
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('dt-handle')).display === 'none'), 'print: no handle');
  await p.emulateMedia({ media: 'screen' });
  await p.close();
  p = await open(ctx);
  s = await st(p);
  ok(s.bar && s.hint === null, 'second open on the same device: the bar is shown but no hint line');
  await p.close();
  await ctx.close();
}

// ---- タップ（タッチ画面）
{
  const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const p = await open(ctx);
  await p.waitForTimeout(5600);
  let s = await st(p);
  ok(!s.bar && s.handle, 'touch: the handle is shown while the bar is hidden');
  await p.tap('#dt-handle'); await p.waitForTimeout(300);
  s = await st(p);
  ok(s.bar && !s.handle && !s.focusHandle, 'touch: a tap on the handle shows the bar');
  await ctx.close();
}

// ---- localStorage が使えない：毎回 1 行を出す
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage disabled'); } }); });
  for (const n of [1, 2]) {
    const p = await open(ctx);
    const s = await st(p);
    ok(s.bar && s.hint === HINT_JA, `no localStorage, open ${n}: the hint is shown`);
    await p.close();
  }
  await ctx.close();
}

// ---- 動画・発表者ビューの中の画面・埋め込みの controls=0：取っ手も 1 行もない
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  for (const q of ['?mode=video', '?view=next', '?view=follow', '?embed=1&controls=0']) {
    const p = await open(ctx, q);
    await p.waitForTimeout(300);
    const n = await p.evaluate(() => ({ handle: !!document.getElementById('dt-handle'), hint: !!document.getElementById('dt-hint'), bar: !!document.getElementById('dt-cb') }));
    ok(!n.handle && !n.hint && !n.bar, `${q}: no handle, no hint line, no bar ${JSON.stringify(n)}`);
    await p.close();
  }
  await ctx.close();
}

ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed', '→', outdir);
process.exit(fails ? 1 : 0);
