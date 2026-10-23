// キーがスライドに届くこと（入力のフォーカス。v0.4.6）
//   node tools/test-input-focus.mjs [作業用のフォルダ]
// 見本：examples/minimal の表紙に、外へのリンク（#xl）・ボタン（#tbtn）・入力の欄（#tin）を足したもの
// B（組んだデッキを file:// で開く）と A（編集アプリ。tools/build-app.mjs で組んだ dist/ を 127.0.0.1 で配り、OPFS のフォルダを開く）で：
//   #1  b で窓全体が真っ黒（A。B は tools/test-blackout.mjs）
//   #9  キーの一覧（?）を開いたまま b：覆いが一覧より上。Esc はまず暗転、次に一覧（A。B は test-blackout）
//   #2  ペン・レーザーのままスライドを押すと、フォーカスがデッキに戻り、矢印が効く（A：編集アプリの枠から。B：入力の欄から）。操作の帯を押しても同じ
//   #6  外へのリンクの確認の箱：箱の字を押してもフォーカスは箱の中、Esc で閉じる、Tab は箱のボタンの中（A・B）
//   #7  編集アプリの枠（見出し・状態の行・道具の列）を押した後も、矢印・PageUp/PageDown・Home/End・b・a がプレビューに届く。Space・Enter・欄・
//       口述原稿の引き出しからは送らない。道具の列のボタンはマウスで押すとフォーカスを残さず、キーボードでは残す。
//       プレビューは送られたキー（deck-cmd の key）を親の窓からだけ受け、自分・子の枠からのものは無視する（A。B は自分からのもの）
//   #3  未保存の口述原稿でプレビューが止まっている間に押す・キーを押す：わけ（live region）と保存・元に戻すのボタン（A）
//   #8  口述原稿の欄から離れた後の最初のクリックで、プレビューにフォーカスが入る（A）
//   #4  発表者ビューの「次」の画面を押しても、キーが止まらない（A・B）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-input-focus-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 見本
const FX = path.join(work, 'fx');
fs.rmSync(FX, { recursive: true, force: true });
fs.mkdirSync(FX, { recursive: true });
let deck = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const EXTRA = '<p style="position:absolute;left:60px;bottom:40px;font-size:20px"><a id="xl" href="https://example.com/">example.com</a> <button id="tbtn" type="button">btn</button> <input id="tin" value="x"></p>';
const at = deck.indexOf('</section>');
if (at < 0) throw new Error('examples/minimal/deck.html: no </section>');
deck = deck.slice(0, at) + EXTRA + '\n' + deck.slice(at);
fs.writeFileSync(path.join(FX, 'deck.html'), deck);
fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(FX, 'narration.md'));
execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(FX, 'deck.html')], { stdio: 'pipe' });
const BUILT = path.join(FX, 'out', 'deck.html');

const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single', '--no-examples'], { stdio: 'pipe' });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch();
const wait = (p, ms = 150) => p.waitForTimeout(ms);
const errs = [];
try {
  // ---------------------------------------------------------------- B：組んだデッキ
  const openB = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('B: ' + e.message));
    await p.goto(fileUrl(BUILT));
    await p.waitForFunction(() => window.DECK && DECK.ready);
    await p.mouse.click(1000, 120);
    await wait(p);
    return { ctx, p };
  };
  const stB = (p) => p.evaluate(() => { const s = DECK.state(); return s.slide + ':' + s.step; });
  const clickIn = async (p, frame, sel, dx = 8) => { const el = await frame.$(sel); const bb = await el.boundingBox(); await p.mouse.click(bb.x + Math.min(dx, bb.width / 2), bb.y + bb.height / 2); };
  console.log('B: built deck');
  {
    // #2 B：入力の欄にフォーカス → ペン → スライドを押して描く → 矢印が効く（フォーカスは舞台）
    const { ctx, p } = await openB();
    await clickIn(p, p, '#tin');
    await p.keyboard.press('Escape');               // 欄の中では道具のキーは効かないので、帯のボタンでペンにする
    await p.evaluate(() => DECK.tools.setMode('pen'));
    await p.mouse.move(400, 300); await p.mouse.down(); await p.mouse.move(500, 350, { steps: 4 }); await p.mouse.up();
    await wait(p);
    const s0 = await stB(p);
    await p.keyboard.press('ArrowRight'); await wait(p);
    const s1 = await stB(p);
    const f = await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    ok(s1 !== s0 && f === 'stage', `#2 B: with the pen on, a click on the slide moves focus from a text field to the deck and → advances ${JSON.stringify({ s0, s1, focus: f })}`);
    // 帯を押しても（ペンのまま）
    await clickIn(p, p, '#tin');
    await p.mouse.move(640, 790); await p.mouse.move(645, 795); await wait(p, 400);
    await clickIn(p, p, '#dt-cb [data-b="next"]', 50);
    const s2 = await stB(p);
    await p.keyboard.press('ArrowRight'); await wait(p);
    const s3 = await stB(p);
    ok(s3 !== s2, `#2 B: after a click on the control bar (from a text field), → advances ${JSON.stringify({ s2, s3 })}`);
    await ctx.close();
  }
  {
    // #6 B：外へのリンクの箱の字を押す → Esc で閉じる。Tab は箱のボタンの中
    const { ctx, p } = await openB();
    await clickIn(p, p, '#xl');
    await wait(p, 200);
    await clickIn(p, p, '#deck-extlink .box h2', 20);
    const f0 = await p.evaluate(() => { const d = document.getElementById('deck-extlink'); return !!d && d.contains(document.activeElement); });
    await p.keyboard.press('Tab');
    const f1 = await p.evaluate(() => { const a = document.activeElement; return a && a.tagName === 'BUTTON' && !!a.closest('#deck-extlink'); });
    await clickIn(p, p, '#deck-extlink .box h2', 20);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());   // フォーカスが body に落ちても
    await p.keyboard.press('Escape'); await wait(p);
    const r = await p.evaluate(() => ({ box: !!document.getElementById('deck-extlink'), inert: document.getElementById('stage').inert, focus: document.activeElement && document.activeElement.id }));
    ok(f0 && f1 && !r.box && !r.inert, `#6 B: clicking the link box text keeps focus in it, Tab stays on its buttons, and Esc closes it even with focus on body ${JSON.stringify({ f0, f1, ...r })}`);
    await ctx.close();
  }
  {
    // #7 B：デッキが自分に送った key の命令は受けない
    const { ctx, p } = await openB();
    const s0 = await stB(p);
    await p.evaluate(() => window.postMessage({ type: 'deck-cmd', cmd: 'key', key: 'ArrowRight' }, '*')); await wait(p, 250);
    ok(await stB(p) === s0, '#7 B: a deck-cmd key message in a plain deck (no editor parent) is ignored');
    await ctx.close();
  }
  {
    // #4 B：発表者ビューで「次」の画面を押す → 矢印で本体が進む
    const { ctx, p } = await openB();
    const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
    await pv.waitForLoadState(); await pv.setViewportSize({ width: 1400, height: 820 });
    await pv.waitForSelector('#f-next'); await pv.waitForTimeout(1500);
    const s0 = await stB(p);
    const bb = await (await pv.$('#f-next')).boundingBox();
    await pv.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await pv.waitForTimeout(200);
    await pv.keyboard.press('ArrowRight'); await pv.waitForTimeout(400);
    const s1 = await stB(p);
    const fa = await pv.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    ok(s1 !== s0 && fa !== 'f-next', `#4 B: after a click on the presenter view's next pane, → still advances the main window ${JSON.stringify({ s0, s1, focus: fa })}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- A：編集アプリ
  console.log('A: editor app');
  const files = { 'deck.html': deck, 'narration.md': fs.readFileSync(path.join(FX, 'narration.md'), 'utf8') };
  const openA = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => errs.push('A: ' + e.message));
    await page.goto(BASE);
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
      await wait(page);
    }
    await wait(page, 400);
    return { ctx, page };
  };
  const previewFrame = async (page) => { const el = await page.$('#preview'); return el ? el.contentFrame() : null; };
  const pbox = async (page) => (await page.$('#preview')).boundingBox();
  const clickPrev = async (page, fx = 0.75, fy = 0.25) => { const b = await pbox(page); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); await wait(page); };
  const clickApp = async (page, sel) => { const el = await page.$(sel); const bb = await el.boundingBox(); await page.mouse.click(bb.x + Math.min(10, bb.width / 2), bb.y + bb.height / 2); await wait(page); };
  const st = async (page) => (await previewFrame(page)).evaluate(() => { const s = DECK.state(); return s.slide + ':' + s.step; });
  const fr = async (page, fn, arg) => (await previewFrame(page)).evaluate(fn, arg);
  const frameFocused = async (page) => (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'preview' && await fr(page, () => document.hasFocus());

  {
    // #1 A・#9 A：プレビューで b → 窓全体が覆いの下。? を開いたまま b → 覆いが上、Esc は暗転 → 一覧の順
    const { ctx, page } = await openA();
    await clickPrev(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('b'); await wait(page);
    const b1 = await fr(page, () => { const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const s = document.querySelector('.slide.active'); const r = s.getBoundingClientRect(); const u = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: t && t.id, overSlide: u && u.id }; });
    ok(b1.top === 'deck-black' && b1.overSlide === 'deck-black', `#1 A: b in the editor preview covers the slide with the black cover ${JSON.stringify(b1)}`);
    await page.keyboard.press('b'); await wait(page);
    await page.keyboard.press('?'); await page.keyboard.press('b'); await wait(page);
    const h1 = await fr(page, () => ({ top: (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).id, help: document.getElementById('dt-help').classList.contains('show') }));
    await page.keyboard.press('Escape'); await wait(page);
    const h2 = await fr(page, () => ({ black: !!document.getElementById('deck-black'), help: document.getElementById('dt-help').classList.contains('show') }));
    await page.keyboard.press('Escape'); await wait(page);
    const h3 = await fr(page, () => ({ black: !!document.getElementById('deck-black'), help: document.getElementById('dt-help').classList.contains('show') }));
    ok(h1.top === 'deck-black' && h1.help && !h2.black && h2.help && !h3.help, `#9 A: b with the key help open covers it; Esc leaves blackout first, then closes the help ${JSON.stringify({ h1, h2, h3 })}`);
    await ctx.close();
  }
  for (const tool of ['d', 'x']) {
    // #2 A：ペン（d）・レーザー（x）→ 編集アプリの見出しを押す → スライドを押す → フォーカスはプレビュー、矢印が効く
    const { ctx, page } = await openA();
    await clickPrev(page);
    await page.keyboard.press(tool); await wait(page);
    await clickApp(page, '#deckname');
    await clickPrev(page, 0.5, 0.5);
    const foc = await frameFocused(page);
    const s0 = await st(page);
    await page.keyboard.press('ArrowRight'); await wait(page);
    const s1 = await st(page);
    ok(foc && s1 !== s0, `#2 A: with ${tool === 'd' ? 'the pen' : 'the laser'} on, a click on the slide after the app header puts focus back in the preview and → advances ${JSON.stringify({ foc, s0, s1 })}`);
    if (tool === 'd') {
      // 操作の帯のボタン（次へ）を押しても、フォーカスはプレビュー
      await clickApp(page, '#deckname');
      const b = await pbox(page);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height - 30); await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height - 25); await wait(page, 400);
      const nb = await (await previewFrame(page)).$('#dt-cb [data-b="next"]');
      const nbb = await nb.boundingBox();
      await page.mouse.click(nbb.x + nbb.width / 2, nbb.y + nbb.height / 2); await wait(page);
      ok(await frameFocused(page), '#2 A: a click on the deck control bar (pen on) after the app header puts focus in the preview');
    }
    await ctx.close();
  }
  {
    // #6 A：プレビューの外へのリンクの箱：字を押してもフォーカスは箱の中、Esc で閉じる
    const { ctx, page } = await openA();
    const f = await previewFrame(page);
    await clickIn(page, f, '#xl'); await wait(page, 300);
    await clickIn(page, f, '#deck-extlink .box h2', 20);
    const in0 = await fr(page, () => { const d = document.getElementById('deck-extlink'); return !!d && d.contains(document.activeElement); });
    await page.keyboard.press('Escape'); await wait(page);
    const r = await fr(page, () => ({ box: !!document.getElementById('deck-extlink'), inert: document.getElementById('stage').inert }));
    ok(in0 && !r.box && !r.inert, `#6 A: in the editor preview, clicking the link box text keeps focus in it and Esc closes it ${JSON.stringify({ in0, ...r })}`);
    await ctx.close();
  }
  {
    // #7 A：編集アプリの枠を押した後のキー
    const { ctx, page } = await openA();
    await clickPrev(page);
    for (const sel of ['#deckname', '#status']) {
      await clickApp(page, sel);
      const s0 = await st(page);
      await page.keyboard.press('ArrowRight'); await wait(page);
      const s1 = await st(page);
      ok(s1 !== s0, `#7 A: after a click on ${sel}, → reaches the preview ${JSON.stringify({ s0, s1 })}`);
    }
    await page.keyboard.press('End'); await wait(page);
    const sEnd = await st(page);
    await page.keyboard.press('Home'); await wait(page);
    const sHome = await st(page);
    await page.keyboard.press('PageDown'); await wait(page);
    const sPd = await st(page);
    ok(sEnd.startsWith('6:') && sHome === '1:0' && sPd !== sHome, `#7 A: End, Home and PageDown reach the preview ${JSON.stringify({ sEnd, sHome, sPd })}`);
    await page.keyboard.press('b'); await wait(page);
    const bl = await fr(page, () => !!document.getElementById('deck-black'));
    await page.keyboard.press('b'); await wait(page);
    const bl2 = await fr(page, () => !!document.getElementById('deck-black'));
    ok(bl && !bl2, `#7 A: b from the app chrome turns blackout on and off ${JSON.stringify({ bl, bl2 })}`);
    await page.keyboard.press('a'); await wait(page, 300);
    const au = await fr(page, () => document.documentElement.classList.contains('autoplay'));
    await page.keyboard.press('a'); await wait(page, 300);
    const au2 = await fr(page, () => document.documentElement.classList.contains('autoplay'));
    ok(au && !au2, `#7 A: a from the app chrome starts and stops autoplay ${JSON.stringify({ au, au2 })}`);
    // Space・Enter は送らない
    await clickApp(page, '#deckname');
    const sp0 = await st(page);
    await page.keyboard.press(' '); await page.keyboard.press('Enter'); await wait(page);
    const sp1 = await st(page), spf = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    ok(sp1 === sp0, `#7 A: Space and Enter from the app chrome are not forwarded ${JSON.stringify({ sp0, sp1, focus: spf })}`);
    // 道具の列のボタン：マウスで押すとフォーカスを残さない（Space で押し直さない）。キーボードでは残す
    const editOn = () => fr(page, () => document.documentElement.classList.contains('dev-edit'));
    await clickApp(page, '#b-edit'); await wait(page, 400);
    const e1 = { focus: await page.evaluate(() => document.activeElement && document.activeElement.id), edit: await editOn() };
    await page.keyboard.press(' '); await wait(page, 400);
    const e2 = await editOn();
    ok(e1.edit && e1.focus !== 'b-edit' && e2 === e1.edit, `#7 A: a toolbar button clicked with the mouse does not keep focus, so Space does not press it again ${JSON.stringify({ ...e1, after: e2 })}`);
    await page.focus('#b-edit'); await page.keyboard.press('Enter'); await wait(page, 400);
    const e3 = { focus: await page.evaluate(() => document.activeElement && document.activeElement.id), edit: await editOn() };
    ok(e3.focus === 'b-edit' && e3.edit !== e1.edit, `#7 A: keyboard activation of a toolbar button still works and keeps focus ${JSON.stringify(e3)}`);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    // 口述原稿の引き出しの中（ボタン）からは送らない
    await page.keyboard.press('n'); await page.waitForSelector('#dev-narr .dev-turn textarea', { timeout: 10000 });
    const xb = await page.$('#dev-narr .dev-head button');
    await xb.focus();
    const n0 = await st(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('b'); await wait(page);
    const n1 = await st(page), nb = await fr(page, () => !!document.getElementById('deck-black'));
    ok(n1 === n0 && !nb, `#7 A: keys are not forwarded from the narration drawer ${JSON.stringify({ n0, n1, black: nb })}`);
    // 入力の欄からは送らない
    await page.focus('#dev-narr .dev-turn textarea');
    await page.keyboard.press('End'); await page.keyboard.press('ArrowRight'); await wait(page);
    ok(await st(page) === n0, '#7 A: keys are not forwarded from a text field');
    await page.keyboard.press('Escape'); await wait(page);
    await page.keyboard.press('n'); await wait(page, 300);
    // 送られたキーは親の窓からだけ：自分・子の枠からの deck-cmd key は無視する。親からなら受ける
    const k0 = await st(page);
    await fr(page, () => {
      window.postMessage({ type: 'deck-cmd', cmd: 'key', key: 'ArrowRight' }, '*');
      const c = document.createElement('iframe'); c.id = 'fwd-child';
      c.srcdoc = '<script>parent.postMessage({type:"deck-cmd",cmd:"key",key:"ArrowRight"},"*");parent.postMessage({type:"deck-cmd",cmd:"key",key:"b"},"*")<\/script>';
      document.body.appendChild(c);
    });
    await wait(page, 500);
    const k1 = await st(page), kb = await fr(page, () => !!document.getElementById('deck-black'));
    await page.evaluate(() => document.getElementById('preview').contentWindow.postMessage({ type: 'deck-cmd', cmd: 'key', key: 'ArrowRight' }, '*'));
    await wait(page, 300);
    const k2 = await st(page);
    ok(k1 === k0 && !kb && k2 !== k1, `#7 A: the preview takes forwarded keys only from the editor parent (ignored from itself and a child frame) ${JSON.stringify({ k0, k1, black: kb, k2 })}`);
    await ctx.close();
  }
  {
    // #3 A：口述原稿に入力して保存しない → プレビューを押す・キーを押す → わけと保存・元に戻す
    const { ctx, page } = await openA();
    await clickPrev(page);
    await page.keyboard.press('n');
    await page.waitForSelector('#dev-narr .dev-turn textarea', { timeout: 10000 }); await wait(page, 300);
    await clickApp(page, '#dev-narr .dev-turn textarea');
    await page.keyboard.type('x'); await wait(page);
    await clickPrev(page);
    const n1 = await page.evaluate(() => { const b = document.querySelector('#dev-narr .dv-notice'); return b ? { text: b.textContent, role: b.getAttribute('role'), live: b.getAttribute('aria-live'), btns: [...b.querySelectorAll('button')].map((x) => x.textContent), vis: b.getBoundingClientRect().height > 0 } : null; });
    ok(!!n1 && /ナレーションが保存されていません。保存するか元に戻すと、プレビューを操作できます/.test(n1.text) && n1.role === 'status' && n1.vis && n1.btns.includes('保存') && n1.btns.includes('元に戻す'),
      `#3 A: a click on the preview held by unsaved narration shows why, with Save and Revert, in a live region ${JSON.stringify(n1)}`);
    // キーでも：いったん消してから → を押す
    await page.evaluate(() => { const b = document.querySelector('#dev-narr .dv-notice'); if (b) b.textContent = ''; });
    await page.keyboard.press('ArrowRight'); await wait(page);
    const n2 = await page.evaluate(() => (document.querySelector('#dev-narr .dv-notice') || {}).textContent || '');
    ok(/保存されていません/.test(n2), '#3 A: a key aimed at the held preview also shows the notice');
    // 元に戻す → プレビューが使える
    const rv = await page.$('#dev-narr .dv-notice button:not(.dv-pri)');
    if (rv) await rv.click(); await wait(page, 400);
    const inert = await page.evaluate(() => document.getElementById('preview').inert);
    const s0 = await st(page);
    await page.keyboard.press('ArrowRight'); await wait(page);
    const s1 = await st(page);
    const n3 = await page.evaluate(() => (document.querySelector('#dev-narr .dv-notice') || {}).textContent || '');
    ok(!inert && s1 !== s0 && !n3, `#3 A: Revert in the notice releases the preview and the notice goes ${JSON.stringify({ inert, s0, s1, n3 })}`);
    await ctx.close();
  }
  {
    // #8 A：口述原稿の欄に入っただけ（入力なし）→ プレビューを 1 回押す → フォーカスはプレビュー
    const { ctx, page } = await openA();
    await clickPrev(page);
    await page.keyboard.press('n');
    await page.waitForSelector('#dev-narr .dev-turn textarea', { timeout: 10000 }); await wait(page, 300);
    await clickApp(page, '#dev-narr .dev-turn textarea');
    await clickPrev(page);
    const foc = await frameFocused(page);
    const inert = await page.evaluate(() => document.getElementById('preview').inert);
    ok(foc && !inert, `#8 A: the first click on the preview after leaving a narration field focuses the preview ${JSON.stringify({ foc, inert })}`);
    await ctx.close();
  }
  {
    // #4 A：発表者ビュー（#pf の中）の「次」の画面を押す → 矢印でプレビューが進む
    const { ctx, page } = await openA();
    await clickPrev(page);
    const [pv] = await Promise.all([ctx.waitForEvent('page'), page.click('#b-presenter')]);
    await pv.setViewportSize({ width: 1400, height: 820 });
    let pf = null;
    for (let i = 0; i < 60 && !pf; i++) { pf = pv.frames().find((f) => f.parentFrame() === pv.mainFrame()); if (pf && !(await pf.$('#f-next').catch(() => null))) pf = null; if (!pf) await pv.waitForTimeout(150); }
    await pv.waitForTimeout(1500);
    const s0 = await st(page);
    const bb = await (await pf.$('#f-next')).boundingBox();
    await pv.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await pv.waitForTimeout(200);
    await pv.keyboard.press('ArrowRight'); await pv.waitForTimeout(500);
    const s1 = await st(page);
    ok(s1 !== s0, `#4 A: after a click on the presenter view's next pane, → still advances the preview ${JSON.stringify({ s0, s1 })}`);
    await ctx.close();
  }
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} finally {
  await browser.close();
  srv.close();
}
if (fails) { console.log(`test-input-focus: ${fails} failed`); process.exit(1); }
console.log('test-input-focus: all ok');
