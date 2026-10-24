// 発表者ビューから抜けること（v0.4.6）
//   node tools/test-presenter-exit.mjs [作業用のフォルダ]
// 見本：examples/minimal を組んだデッキ。B（組んだデッキを 127.0.0.1 で配る。本体と発表者ビューが同じ origin なので、本体の focus を数えられる）と
// A（編集アプリ。tools/build-app.mjs で組んだ dist/ を 127.0.0.1 で配り、OPFS のフォルダを開く。発表者ビューは app/main.js の窓の中の枠 #pf）で：
//   #1  本体で p：発表者ビューが開いていれば閉じる（B・A）
//   #2  発表者ビューで Esc・p：窓を閉じ、本体の窓にフォーカスを返す（B・A）。A ではキーが窓の中の枠に届くこと（→ でプレビューが進み、覆いが残らない）も
//   #3  全画面のとき（document.fullscreenElement を差し替え）の Esc・p：窓は閉じず、全画面をやめるだけ（B・A）
//   #4  「発表者ビューを閉じる（p）」のボタン：窓を閉じる（B・A）
//   #5  「今の画面」（iframe）にフォーカスがあるときの Esc・p も閉じる。ペンを使っていれば Esc はまずペンを切る（B・A）
//   #6  窓にフォーカスがないとき（document.hasFocus を差し替え）：「ここを押すと操作できます」の覆いが出て、最初のクリックで消える。
//       フォーカスがあるときは出ない。押した後はキーが効く（B）。「今の画面」「次」の中には覆いも閉じるボタンもない（B）
// C（開発サーバー server/dev.mjs。発表者の窓は外枠 shell.js が開き、デッキは窓の中の枠）：本体の p は入り切り（#1）、発表者ビューの p・Esc で窓を閉じる（#2）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-presenter-exit-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 見本と配る口
const FX = path.join(work, 'fx');
fs.rmSync(FX, { recursive: true, force: true });
fs.mkdirSync(FX, { recursive: true });
const deck = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const narr = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
fs.writeFileSync(path.join(FX, 'deck.html'), deck);
fs.writeFileSync(path.join(FX, 'narration.md'), narr);
execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(FX, 'deck.html')], { stdio: 'pipe' });
const OUT = path.join(FX, 'out');
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single', '--no-examples'], { stdio: 'pipe' });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
const serve = async (dir) => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
};
const S_DECK = await serve(OUT), S_APP = await serve(DIST);

// 全画面の差し替え：window.__fs が true の間は全画面。exitFullscreen は数えて全画面をやめる
const FS_STUB = () => {
  window.__fs = false; window.__exit = 0;
  Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get() { return window.__fs ? document.documentElement : null; } });
  Document.prototype.exitFullscreen = function () { window.__exit++; window.__fs = false; return Promise.resolve(); };
};

const browser = await launch();
const errs = [];
// 押した途中で窓が閉じると keyup が届かず press が投げる。閉じたかどうかは closedSoon で確かめる
const press = (pg, k) => pg.keyboard.press(k).catch((e) => { if (!pg.isClosed()) throw e; });
const closedSoon = (pg, ms = 3000) => Promise.race([pg.waitForEvent('close').then(() => true), new Promise((r) => setTimeout(() => r(pg.isClosed()), ms))]);
try {
  // ---------------------------------------------------------------- B：組んだデッキ
  console.log('B: built deck');
  const openB = async ({ noFocus = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // 発表者ビューの窓：全画面を差し替え。noFocus のときは「フォーカスがない」ことにする（押されるまで）
    // 窓の最初の about:blank で走り、同じ Window のまま発表者ビューに移ることがあるので、窓の場所は呼ばれたときに見る
    await ctx.addInitScript((nf) => {
      const pres = () => /[?&]presenter=1/.test(location.search);
      window.__exit = 0;
      Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get() { return window.__fs ? document.documentElement : null; } });
      Document.prototype.exitFullscreen = function () { window.__exit = (window.__exit || 0) + 1; window.__fs = false; return Promise.resolve(); };
      if (nf) {
        const real = Document.prototype.hasFocus;
        Document.prototype.hasFocus = function () { return pres() && !window.__clicked ? false : real.call(this); };
        addEventListener('pointerdown', () => { if (pres()) window.__clicked = true; }, true);
      }
    }, noFocus);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('B: ' + e.message));
    await p.goto(S_DECK.base + 'deck.html');
    await p.waitForFunction(() => window.DECK && DECK.ready);
    // 本体の窓に focus が来た回数（発表者ビューが opener.focus() を呼ぶ）
    await p.evaluate(() => { window.__focus = 0; const f = window.focus; window.focus = function () { window.__focus++; return f.call(this); }; });
    await p.mouse.click(1000, 120);
    return { ctx, p };
  };
  const openPV = async (ctx, p) => {
    const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
    pv.on('pageerror', (e) => errs.push('B presenter: ' + e.message));
    await pv.waitForLoadState(); await pv.setViewportSize({ width: 1400, height: 820 });
    await pv.waitForSelector('#pv-close'); await pv.waitForTimeout(1200);
    return pv;
  };
  const stB = (p) => p.evaluate(() => { const s = DECK.state(); return s.slide + ':' + s.step; });
  {
    const { ctx, p } = await openB();
    // #1 本体で p：開いていれば閉じる。もう一度 p で開く
    let pv = await openPV(ctx, p);
    const btn = await pv.evaluate(() => { const b = document.getElementById('pv-close'); return b && b.textContent; });
    ok(/発表者ビューを閉じる（p）|Close presenter view \(p\)/.test(btn || ''), '#4 B: the presenter view has a close button ' + JSON.stringify(btn));
    const tap0 = await pv.evaluate(() => { const t = document.getElementById('pv-tap'); return t ? t.hidden : 'none'; });
    ok(tap0 === true, '#6 B: with focus, the "click here to control" overlay stays hidden ' + JSON.stringify(tap0));
    const sub = await pv.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => { const d = f.contentDocument; return d ? { tap: !!d.getElementById('pv-tap'), close: !!d.getElementById('pv-close'), view: f.contentWindow.DECK && f.contentWindow.DECK.view } : null; }));
    ok(sub.length === 2 && sub.every((x) => x && !x.tap && !x.close && x.view), '#6 B: the current and next panes have neither the overlay nor the close button ' + JSON.stringify(sub));
    await p.bringToFront();
    await p.keyboard.press('p');
    ok(await closedSoon(pv), '#1 B: p in the main window closes the open presenter view');
    pv = await openPV(ctx, p);
    ok(!pv.isClosed(), '#1 B: p again opens it again');

    // #2 Esc：窓を閉じて、本体にフォーカスを返す
    await pv.bringToFront();
    let f0 = await p.evaluate(() => window.__focus);
    await press(pv, 'Escape');
    ok(await closedSoon(pv), '#2 B: Esc in the presenter view closes the window');
    ok(await p.evaluate(() => window.__focus) > f0, '#2 B: and asks the main window for focus (opener.focus) ' + JSON.stringify({ before: f0, after: await p.evaluate(() => window.__focus) }));
    // #2 p
    pv = await openPV(ctx, p);
    await pv.bringToFront();
    f0 = await p.evaluate(() => window.__focus);
    await press(pv, 'p');
    ok(await closedSoon(pv), '#2 B: p in the presenter view closes the window');
    ok(await p.evaluate(() => window.__focus) > f0, '#2 B: and gives focus back to the main window');

    // #3 全画面：Esc・p は全画面をやめるだけ
    pv = await openPV(ctx, p);
    await pv.bringToFront();
    for (const k of ['Escape', 'p']) {
      await pv.evaluate(() => { window.__fs = true; });
      await press(pv, k); await pv.waitForTimeout(300);
      const r = await pv.evaluate(() => ({ exit: window.__exit, fs: window.__fs }));
      ok(!pv.isClosed() && !r.fs && r.exit >= 1, `#3 B: ${k} while fullscreen exits fullscreen and keeps the window open ` + JSON.stringify(r));
    }
    // #4 閉じるのボタン
    f0 = await p.evaluate(() => window.__focus);
    await pv.click('#pv-close').catch((e) => { if (!pv.isClosed()) throw e; });
    ok(await closedSoon(pv), '#4 B: the close button closes the window');
    ok(await p.evaluate(() => window.__focus) > f0, '#4 B: and gives focus back to the main window');

    // #5 「今の画面」にフォーカス：ペンなら Esc はペンを切るだけ。次の Esc で閉じる。p でも閉じる
    for (const k of ['Escape', 'p']) {
      pv = await openPV(ctx, p);
      await pv.bringToFront();
      if (k === 'Escape') await press(pv, 'd');
      const bb = await (await pv.$('#f-cur')).boundingBox();
      await pv.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.3); await pv.waitForTimeout(250);
      const inCur = await pv.evaluate(() => document.activeElement && document.activeElement.id);
      if (k === 'Escape') {
        await press(pv, 'Escape'); await pv.waitForTimeout(300);
        const m = pv.isClosed() ? 'closed' : await pv.evaluate(() => DECK.ptools.mode());
        ok(m === null, '#5 B: with the pen on and focus in the current pane, Esc first turns the pen off ' + JSON.stringify({ inCur, mode: m }));
      }
      await press(pv, k);
      ok(inCur === 'f-cur' && await closedSoon(pv), `#5 B: ${k} with focus in the current pane (iframe) closes the presenter view ` + JSON.stringify({ inCur }));
    }
    await ctx.close();
  }
  {
    // #6 フォーカスがない窓：覆いが出て、最初のクリックで消える。その後はキーが効く
    const { ctx, p } = await openB({ noFocus: true });
    const pv = await openPV(ctx, p);
    const t0 = await pv.evaluate(() => { const t = document.getElementById('pv-tap'); return t && { hidden: t.hidden, text: t.textContent, top: (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).id }; });
    ok(t0 && !t0.hidden && t0.top === 'pv-tap' && /ここを押すと操作できます|Click here to control/.test(t0.text), '#6 B: without focus, the overlay covers the presenter view ' + JSON.stringify(t0));
    const s0 = await stB(p);
    await pv.mouse.click(700, 400); await pv.waitForTimeout(200);
    const t1 = await pv.evaluate(() => document.getElementById('pv-tap').hidden);
    const s1 = await stB(p);
    await press(pv, 'ArrowRight'); await pv.waitForTimeout(400);
    const s2 = await stB(p);
    ok(t1 === true && s1 === s0, '#6 B: the first click only removes the overlay (does not advance) ' + JSON.stringify({ hidden: t1, s0, s1 }));
    ok(s2 !== s1, '#6 B: after that click, → in the presenter view advances the main window ' + JSON.stringify({ s1, s2 }));
    // 印刷では出ない
    await pv.evaluate(() => { document.getElementById('pv-tap').hidden = false; });
    await pv.emulateMedia({ media: 'print' });
    const pr = await pv.evaluate(() => getComputedStyle(document.getElementById('pv-tap')).display);
    ok(pr === 'none', '#6 B: the overlay is not printed ' + JSON.stringify(pr));
    await ctx.close();
  }

  // ---------------------------------------------------------------- A：編集アプリ
  console.log('A: editor app');
  const files = { 'deck.html': deck, 'narration.md': narr };
  const openA = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => errs.push('A: ' + e.message));
    await page.goto(S_APP.base);
    await page.waitForSelector('#drop');
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('fx', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('fx', { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      window.__d = d;
    }, files);
    await page.evaluate(() => window.__APP_TEST_OPEN(window.__d));
    const t0 = Date.now();
    for (;;) {
      const f = await previewFrame(page);
      try { if (f && await f.evaluate(() => !!(window.DECK && DECK.ready && window.DECK_DEV))) break; } catch { /* 読み込み中 */ }
      if (Date.now() - t0 > 30000) throw new Error('the preview did not get ready');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__focus = 0; const f = window.focus; window.focus = function () { window.__focus++; return f.call(this); }; });
    return { ctx, page };
  };
  const previewFrame = async (page) => { const el = await page.$('#preview'); return el ? el.contentFrame() : null; };
  const clickPrev = async (page) => { const b = await (await page.$('#preview')).boundingBox(); await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.25); await page.waitForTimeout(150); };
  const openPA = async (ctx, page, how) => {
    const [pv] = await Promise.all([ctx.waitForEvent('page'), how()]);
    pv.on('pageerror', (e) => errs.push('A presenter: ' + e.message));
    await pv.setViewportSize({ width: 1400, height: 820 });
    let pf = null;
    for (let i = 0; i < 80 && !pf; i++) { pf = pv.frames().find((f) => f.parentFrame() === pv.mainFrame()); if (pf && !(await pf.$('#pv-close').catch(() => null))) pf = null; if (!pf) await pv.waitForTimeout(150); }
    await pv.waitForTimeout(1200);
    return { pv, pf };
  };
  {
    const { ctx, page } = await openA();
    await clickPrev(page);
    // #1 A：プレビューで p で開き、もう一度 p で閉じる
    let { pv, pf } = await openPA(ctx, page, () => page.keyboard.press('p'));
    ok(!!pf, '#1 A: p in the preview opens the presenter view');
    await page.bringToFront(); await clickPrev(page);
    await page.keyboard.press('p');
    ok(await closedSoon(pv), '#1 A: p in the preview again closes it');

    // #2 A：Esc・p（#pf の中にフォーカス）で窓を閉じる
    for (const k of ['Escape', 'p']) {
      ({ pv, pf } = await openPA(ctx, page, () => page.click('#b-presenter')));
      await pv.bringToFront();
      // キーは窓の中の枠（#pf、presenter.js）に届く：→ でプレビューが進み、覆いは消える
      const s0 = await (await previewFrame(page)).evaluate(() => DECK.state().slide + ':' + DECK.state().step);
      await press(pv, 'ArrowRight'); await pv.waitForTimeout(400);
      const s1 = await (await previewFrame(page)).evaluate(() => DECK.state().slide + ':' + DECK.state().step);
      const tap = await pf.evaluate(() => document.getElementById('pv-tap').hidden);
      ok(s1 !== s0 && tap === true, `#2 A: keys in the editor's presenter window reach the presenter view (→ advances the preview, no overlay left) ` + JSON.stringify({ s0, s1, tapHidden: tap }));
      const f0 = await page.evaluate(() => window.__focus);
      await press(pv, k);
      ok(await closedSoon(pv), `#2 A: ${k} in the editor's presenter view closes the window`);
      ok(await page.evaluate(() => window.__focus) > f0, `#2 A: and gives focus back to the editor window (${k})`);
    }
    // #3 A：全画面（発表者の窓の文書）では Esc・p は全画面をやめるだけ
    ({ pv, pf } = await openPA(ctx, page, () => page.click('#b-presenter')));
    await pv.bringToFront();
    await pv.evaluate(FS_STUB);
    for (const k of ['Escape', 'p']) {
      await pv.evaluate(() => { window.__fs = true; });
      await press(pv, k); await pv.waitForTimeout(300);
      const r = await pv.evaluate(() => ({ exit: window.__exit, fs: window.__fs }));
      ok(!pv.isClosed() && !r.fs && r.exit >= 1, `#3 A: ${k} while the presenter window is fullscreen exits fullscreen and keeps it open ` + JSON.stringify(r));
    }
    // #4 A：閉じるのボタン
    await pf.click('#pv-close').catch((e) => { if (!pv.isClosed()) throw e; });
    ok(await closedSoon(pv), '#4 A: the close button closes the editor\'s presenter window');
    // #5 A：「今の画面」にフォーカスがあるときの Esc
    ({ pv, pf } = await openPA(ctx, page, () => page.click('#b-presenter')));
    await pv.bringToFront();
    const bb = await (await pf.$('#f-cur')).boundingBox();
    await pv.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.3); await pv.waitForTimeout(250);
    const inCur = await pf.evaluate(() => document.activeElement && document.activeElement.id);
    await press(pv, 'Escape');
    ok(inCur === 'f-cur' && await closedSoon(pv), '#5 A: Esc with focus in the current pane closes the editor\'s presenter window ' + JSON.stringify({ inCur }));
    await ctx.close();
  }
  {
    // ---------------------------------------------------------------- C：開発サーバー（server/dev.mjs。外枠 shell.js がデッキに頼まれて窓を開く。デッキの presenter は親の窓）
    // #1 C：本体（プレビュー）で p をもう一度押すと閉じる。#2 C：発表者ビュー（窓の中の枠 #pf）で p・Esc を押すと閉じる
    console.log('C: dev server');
    const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), path.join(FX, 'deck.html'), '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const base = await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('dev server did not start')), 15000);
        srv.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
      });
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push('C: ' + e.message));
      await p.goto(base);
      const deckFrame = () => p.frames().find((f) => f !== p.mainFrame());
      await p.waitForFunction(() => document.getElementById('deck'));
      await (async () => { for (let i = 0; i < 50; i++) { const f = deckFrame(); if (f && await f.evaluate(() => !!(window.DECK && DECK.ready)).catch(() => false)) return; await p.waitForTimeout(200); } })();
      const openPC = async () => {
        await p.bringToFront(); await p.mouse.click(640, 300); await p.waitForTimeout(150);
        const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
        pv.on('pageerror', (e) => errs.push('C presenter: ' + e.message));
        await pv.waitForLoadState();
        const pf = await (async () => { for (let i = 0; i < 50; i++) { const f = pv.frames().find((x) => x !== pv.mainFrame() && /presenter=1/.test(x.url())); if (f && await f.$('#pv-close').catch(() => null)) return f; await pv.waitForTimeout(200); } return null; })();
        await pv.waitForTimeout(800);
        return { pv, pf };
      };
      let { pv, pf } = await openPC();
      ok(!!pf, '#1 C: p in the dev server preview opens the presenter view');
      await p.bringToFront(); await p.mouse.click(640, 300); await p.waitForTimeout(150);
      await p.keyboard.press('p');
      ok(await closedSoon(pv), '#1 C: p again in the preview closes the presenter view');
      ({ pv, pf } = await openPC());
      ok(!pv.isClosed(), '#1 C: and p opens it again');
      for (const k of ['p', 'Escape']) {
        if (pv.isClosed()) ({ pv, pf } = await openPC());
        await pv.bringToFront();
        await pf.focus('#pv-close'); await pf.evaluate(() => document.activeElement.blur()); await pv.waitForTimeout(150);   // フォーカスを中の発表者ビューの文書に置く（道具のボタンは押さない）
        await press(pv, k);
        ok(await closedSoon(pv), `#2 C: ${k} in the dev server's presenter view closes its window`);
      }
      await ctx.close();
    } finally { srv.kill(); }
  }
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} finally {
  await browser.close();
  S_DECK.srv.close(); S_APP.srv.close();
}
if (fails) { console.log(`test-presenter-exit: ${fails} failed`); process.exit(1); }
console.log('test-presenter-exit: all ok');
