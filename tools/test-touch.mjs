// タッチ画面（iPad・スマートフォン）での操作の帯（kit/tools.js）
// test-all: serial（操作の帯が数秒で隠れるのを決まった待ちで確かめる。--jobs が 2 以上でも、最後にほかと重ねずに走らせる）
// test-all: platform（--platform でも走らせる：WebKit でも）
//   node tools/test-touch.mjs <built.html> [画面の保存先]
// Chromium と、入っていれば WebKit（npx playwright-core install webkit。なければ「skip」）で、タッチを模して：
// - 帯が隠れた後、スライドを指でタップすると帯が出る（位置は動かない）。何度でも
// - 帯のボタンは指のタップで 1 回だけ効く（次へ・前へ・字幕。ブラウザが click も送っても 2 回にならない）
// - 指で押した後も、帯は決まった時間で隠れる（:hover が残っても）
// - マウスのクリックは今までどおり 1 回
// - 指で進める（handoff #97）：舞台の上で横に払う（左へ＝次・右へ＝前）か、左右の端（幅の 15%）のタップで 1 ステップ。帯は出さない。
//   リンク・パーツ（カスタム要素）・縦の払い・2 本の指・暗転・操作を隠したとき（deck-nocontrols）・ペンの間は動かない。マウスで払っても動かない
// - 帯を起こすタップ（隠れた帯の「読み上げで聞く」・次への場所、取っ手）と、出てくる途中のマウスのクリックはボタンを押さない
// - スマートフォンの幅（390×844 の縦と 844×390 の横。Chromium は isMobile も）：ページが広がらず、スライドは画面の幅に収まり、
//   帯は画面からはみ出さない（縦では 2 行に折り返す）。出し方の 1 行はタップの言い方。iPad の幅では帯は 1 行
// - キーの一覧（?）が 1280×800 の窓とスマートフォンの縦（390）で窓に収まり、中の字が右で切れない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webkit } from 'playwright-core';
import { launch, fileUrl } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';

const [file, outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-touch-'))] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-touch.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const url = fileUrl(file);

async function run(name, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  // 読み上げ（speechSynthesis.speak）が呼ばれた回数
  await ctx.addInitScript(() => { window.__spoken = 0; try { const S = window.speechSynthesis; if (S) { const o = S.speak.bind(S); S.speak = (u) => { window.__spoken++; try { o(u); } catch (e) {} }; } } catch (e) {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url + '#2');
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(20000) });
  const pos = () => p.evaluate(() => { const s = DECK.state(); return s.slide * 100 + s.step; });
  const shown = () => p.evaluate(() => { const c = document.getElementById('dt-cb'); return !!c && c.classList.contains('show'); });
  const btn = (n) => `#dt-cb button[data-b="${n}"]`;
  const tapStage = async () => { const r = await p.evaluate(() => document.getElementById('stage').getBoundingClientRect().toJSON()); await p.touchscreen.tap(r.x + r.width * 0.5, r.y + r.height * 0.35); };
  await p.waitForTimeout(5400);
  ok(!(await shown()), `${name}: the bar hides after its first seconds`);
  const p0 = await pos();
  await tapStage(); await p.waitForTimeout(600);
  ok(await shown(), `${name}: a tap on the slide brings the bar back`);
  ok(await pos() === p0, `${name}: the tap on the slide does not advance (${p0} → ${await pos()})`);
  await p.screenshot({ path: path.join(outdir, name + '-woken.png') });
  await p.waitForTimeout(3200);
  ok(!(await shown()), `${name}: the bar hides again`);
  await tapStage(); await p.waitForTimeout(600);
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
  await p.mouse.move(512, 740, { steps: 3 }); await p.waitForTimeout(600);
  const q0 = await pos();
  await p.click(btn('next')); await p.waitForTimeout(900);
  ok(await pos() === q0 + 1, `${name}: a mouse click is still one step (${q0} → ${await pos()})`);
  // 帯を起こすタップは、ボタンを押したことにならない（隠れた帯の「読み上げで聞く」の場所・取っ手）
  for (const target of ['read', 'next']) {
    await p.evaluate(() => { if (DECK.tools.readAloud()) DECK.tools.readAloud(false); document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await p.mouse.move(512, 300); await p.waitForTimeout(3300);
    const hid = !(await shown());
    const r = await p.evaluate((n) => { const b = document.querySelector('#dt-cb [data-b="' + n + '"]'); if (!b) return null; const x = b.getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; }, target);
    if (!r) { console.log(`note ${name}: no ${target} button in this deck`); continue; }
    const s0 = await pos(), sp0 = await p.evaluate(() => window.__spoken || 0);
    await p.touchscreen.tap(r.x, r.y); await p.waitForTimeout(800);
    const after = await p.evaluate(() => ({ reading: DECK.tools.readAloud(), spoken: window.__spoken || 0 }));
    ok(hid && await shown() && await pos() === s0 && !after.reading && after.spoken === sp0, `${name}: a tap on the hidden bar where ${target} is only wakes the bar (no step, no read-aloud)`);
  }
  await p.mouse.move(512, 300); await p.waitForTimeout(3300);
  const h0 = await pos();
  await p.tap('#dt-handle'); await p.waitForTimeout(800);
  ok(await shown() && await pos() === h0 && !(await p.evaluate(() => DECK.tools.readAloud())), `${name}: a tap on the faint handle only wakes the bar`);
  // ---- 指で進める（handoff #97）。指のイベントを合成する（pointerType touch。舞台の上の点 fx, fy は舞台の幅・高さの割合）
  const finger = (from, to, o = {}) => p.evaluate(([from, to, o]) => {
    const r = document.getElementById('stage').getBoundingClientRect(), at = ([fx, fy]) => [r.left + fx * r.width, r.top + fy * r.height];
    const [x0, y0] = at(from), [x1, y1] = at(to), t = o.target ? document.querySelector(o.target) : document.elementFromPoint(x0, y0);
    const ev = (type, x, y, id = 11, primary = true) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: o.type || 'touch', isPrimary: primary, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
    ev('pointerdown', x0, y0);
    if (o.second) ev('pointerdown', x0 + 40, y0 + 40, 12, false);
    for (let i = 1; i <= 5; i++) ev('pointermove', x0 + (x1 - x0) * i / 5, y0 + (y1 - y0) * i / 5);
    if (o.second) ev('pointerup', x0 + 40, y0 + 40, 12, false);
    ev('pointerup', x1, y1);
  }, [from, to, o]);
  const hideBar = async () => { await p.evaluate(() => { const c = document.getElementById('dt-cb'); if (c) c.classList.remove('show'); }); };
  await hideBar();
  // 位置はタイムラインの何番目か（ステップの番号はスライドごとに 0 に戻るので、pos() の +1 では比べない）
  const at = () => p.evaluate(() => { const k = DECK.state().key; return DECK.timeline().findIndex((x) => DECK.stepKey(x.i, x.k) === k); });
  const posAt = pos;
  const g0 = await at();
  await finger([0.7, 0.5], [0.3, 0.52]); await p.waitForTimeout(600);
  ok(await at() === g0 + 1 && !(await shown()), `${name}: a finger swipe to the left is the next step, and the bar stays hidden (${g0} → ${await at()})`);
  await finger([0.3, 0.5], [0.7, 0.5]); await p.waitForTimeout(600);
  ok(await at() === g0, `${name}: a swipe to the right is the step before (${await at()})`);
  await finger([0.95, 0.5], [0.95, 0.5]); await p.waitForTimeout(600);
  ok(await at() === g0 + 1 && !(await shown()), `${name}: a tap on the right edge (15%) is the next step (${await at()})`);
  await finger([0.04, 0.5], [0.04, 0.5]); await p.waitForTimeout(600);
  ok(await at() === g0, `${name}: a tap on the left edge is the step before (${await at()})`);
  await finger([0.5, 0.5], [0.5, 0.5]); await p.waitForTimeout(600);
  ok(await at() === g0 && await shown(), `${name}: a tap in the middle still only wakes the bar`);
  await hideBar();
  await finger([0.5, 0.3], [0.55, 0.8]); await p.waitForTimeout(500);
  ok(await at() === g0, `${name}: a vertical swipe does not move`);
  await finger([0.7, 0.5], [0.3, 0.5], { second: true }); await p.waitForTimeout(500);
  ok(await at() === g0, `${name}: a swipe with two fingers (a pinch) does not move`);
  await finger([0.7, 0.5], [0.3, 0.5], { type: 'mouse' }); await p.waitForTimeout(500);
  ok(await at() === g0, `${name}: a mouse drag does not move (fingers only)`);
  // リンクとパーツの上では動かない：今のスライドに足して確かめる
  await p.evaluate(() => {
    const s = document.querySelector('#stage .slide.active') || document.querySelector('#stage .slide');
    const a = document.createElement('a'); a.id = 'g-link'; a.href = '#zz'; a.textContent = 'link'; a.style.cssText = 'position:absolute;right:0;top:40%;width:20%;height:20%;display:block;z-index:9';
    const m = document.createElement('m-gesture-probe'); m.id = 'g-part'; m.style.cssText = 'position:absolute;left:0;top:40%;width:20%;height:20%;display:block;z-index:9';
    s.appendChild(a); s.appendChild(m);
  });
  await finger([0.95, 0.5], [0.95, 0.5], { target: '#g-link' }); await p.waitForTimeout(500);
  await finger([0.04, 0.5], [0.04, 0.5], { target: '#g-part' }); await p.waitForTimeout(500);
  await finger([0.1, 0.5], [0.0, 0.5], { target: '#g-part' }); await p.waitForTimeout(500);
  ok(await at() === g0, `${name}: taps and swipes on a link or inside a part do not move (${await at()})`);
  await p.evaluate(() => { document.getElementById('g-link').remove(); document.getElementById('g-part').remove(); });
  await p.evaluate(() => document.documentElement.classList.add('deck-nocontrols'));
  await finger([0.95, 0.5], [0.95, 0.5]); await finger([0.7, 0.5], [0.3, 0.5]); await p.waitForTimeout(500);
  ok(await at() === g0, `${name}: with the controls hidden by a host (deck-nocontrols), neither moves`);
  await p.evaluate(() => document.documentElement.classList.remove('deck-nocontrols'));
  await p.keyboard.press('b'); await p.waitForTimeout(300);
  await finger([0.7, 0.5], [0.3, 0.5]); await p.waitForTimeout(500);
  const blk = await p.evaluate(() => !!document.getElementById('deck-black'));
  ok(await at() === g0, `${name}: during a blackout a swipe does not move (it only ends the blackout: ${!blk})`);
  if (blk) { await p.keyboard.press('b'); await p.waitForTimeout(300); }
  await hideBar();
  // マウス：出てくる途中（隠れた帯の場所）のクリックは押したことにしない。出た後のクリックは効く
  await p.mouse.move(512, 300); await p.waitForTimeout(3300);
  const m0 = await pos();
  const nb = await p.evaluate(() => { const x = document.querySelector('#dt-cb [data-b="next"]').getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; });
  await p.mouse.move(nb.x, nb.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600);
  ok(await pos() === m0, `${name}: a mouse click while the bar is fading in does not press the button under it`);
  await p.mouse.click(nb.x, nb.y); await p.waitForTimeout(600);
  ok(await pos() === m0 + 1, `${name}: once shown, a click presses it (${m0} → ${await pos()})`);
  ok(errs.length === 0, `${name}: no page errors` + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

// キーの一覧（?）が窓に収まり、中の字が欄の右で切れないこと（1280×800 の窓、スマートフォンの縦 390 の幅）
async function helpFits(p, label, W) {
  await p.evaluate(() => DECK.tools.help(true));
  await p.waitForTimeout(150);
  const m = await p.evaluate(() => {
    const c = document.querySelector('#dt-help .dt-card'), cr = c.getBoundingClientRect(), edge = cr.right - parseFloat(getComputedStyle(c).paddingRight);
    let worst = 0, what = '';
    for (const e of c.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && r.right - edge > worst) { worst = r.right - edge; what = e.textContent.slice(0, 24); } }
    return { sw: c.scrollWidth, cw: c.clientWidth, worst, what, left: cr.left, right: cr.right };
  });
  ok(m.sw <= m.cw && m.worst <= 1 && m.left >= 0 && m.right <= W, `${label}: the ? panel fits (card ${Math.round(m.left)}–${Math.round(m.right)} of ${W}, scrollWidth ${m.sw} ≤ ${m.cw}, overflow ${m.worst.toFixed(1)}px${m.what ? ` at “${m.what}”` : ''})`);
  await p.evaluate(() => DECK.tools.help(false));
}
async function desktopHelp(name, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(20000) });
  await helpFits(p, `${name} 1280×800`, 1280);
  await ctx.close();
}

async function phone(name, browser) {
  for (const [tag, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }], ['ipad', { width: 1024, height: 768 }]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: tag !== 'ipad', locale: 'ja-JP' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url + '#2');
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(20000) });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const r = (id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().toJSON() : null; };
      const h = document.getElementById('dt-hint');
      return { iw: innerWidth, sw: document.documentElement.scrollWidth, stage: r('stage'), cb: r('dt-cb'), hint: h ? h.textContent : null, hintBox: r('dt-hint') };
    });
    const W = vp.width, H = vp.height, px = (x) => Math.round(x);
    ok(m.iw === W && m.sw <= W, `${name} ${tag}: the page does not widen (innerWidth ${m.iw}, scrollWidth ${m.sw}, viewport ${W})`);
    ok(m.stage.left >= -1 && m.stage.right <= W + 1 && m.stage.top >= -1 && m.stage.bottom <= H + 1, `${name} ${tag}: the slide fits the screen (${px(m.stage.left)}–${px(m.stage.right)} × ${px(m.stage.top)}–${px(m.stage.bottom)})`);
    ok(m.cb.left >= 0 && m.cb.right <= W && m.cb.bottom <= H, `${name} ${tag}: the toolbar stays on the screen (${px(m.cb.left)}–${px(m.cb.right)}, bottom ${px(m.cb.bottom)})`);
    if (tag === 'portrait') ok(m.cb.height > 50 && m.cb.height < 90, `${name} ${tag}: the toolbar wraps onto two rows (${px(m.cb.height)} px)`);
    else ok(m.cb.height < 50, `${name} ${tag}: the toolbar is one row (${px(m.cb.height)} px)`);
    ok(m.hint === '画面をタップすると、ツールバーが出ます', `${name} ${tag}: the hint says to tap (${m.hint})`);
    ok(m.hintBox && m.hintBox.bottom <= m.cb.top + 1 && m.hintBox.left >= 0 && m.hintBox.right <= W, `${name} ${tag}: the hint sits above the toolbar, on the screen`);
    await p.screenshot({ path: path.join(outdir, `${name}-phone-${tag}.png`) });
    // 縦：帯のボタン（2 行目のものも）が指で押せる
    if (tag === 'portrait') {
      const p0 = await p.evaluate(() => { const s = DECK.state(); return s.slide * 100 + s.step; });
      await p.tap('#dt-cb button[data-b="next"]'); await p.waitForTimeout(700);
      const p1 = await p.evaluate(() => { const s = DECK.state(); return s.slide * 100 + s.step; });
      ok(p1 === p0 + 1, `${name} ${tag}: a tap on ▶ in the wrapped toolbar is one step (${p0} → ${p1})`);
    }
    if (tag === 'portrait') await helpFits(p, `${name} ${tag}`, W);
    ok(errs.length === 0, `${name} ${tag}: no page errors` + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
}

const cr = await launch();
await run('chromium', cr);
await phone('chromium', cr);
await desktopHelp('chromium', cr);
await cr.close();
let wk = null;
try { wk = await webkit.launch(); } catch (e) { console.log(`skip webkit: not installed (npx playwright-core install webkit): ${String(e.message || e).split('\n')[0]}`); }
if (wk) { await run('webkit', wk); await phone('webkit', wk); await desktopHelp('webkit', wk); await wk.close(); }
console.log(fails ? `${fails} failed` : 'all passed', '→', outdir);
process.exit(fails ? 1 : 0);
