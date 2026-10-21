// 暗転（b）：窓全体が真っ黒（#000）になり、もう一度 b・クリック・Esc で元の画面に戻ること
//   node tools/test-blackout.mjs <組んだ deck.html> [<画像を書くフォルダ>]
// 1. ペンの線・字幕・操作の帯・知らせ（ペンの色）を出した画面で b：窓全体の画素が #000（ほぼ）。もう一度 b で、前と同じ画面
// 2. クリックと Esc でも戻る（クリックは送らない・描かない。Esc はペンを切らない）。暗転の間のフォーカスは覆いにあり、Tab で下に抜けない。戻るとフォーカスも戻る
// 3. 発表者ビュー：本体の b で「暗転中」の札が出て、発表者ビューの b で本体が戻る（札も消える）
// 4. 印刷：暗転していても、印刷の画面（beforeprint と print の media）は暗転していないときと同じ
// 5. 動画（?mode=video）：b で暗転しない
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from '../kit/browser.mjs';

const html = path.resolve(process.argv[2] || 'examples/minimal/out/deck.html');
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const b = await launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(fileUrl(html) + '?captions=1#2');
  await p.waitForFunction(() => window.DECK && DECK.ready);
  await p.evaluate(() => document.fonts.ready);
  await p.keyboard.press('ArrowRight');
  // 窓の画素のうち #000 から 2 より離れたものの数（ブラウザの中の canvas で数える）
  const nonBlack = async (png) => p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 2 || d[i + 1] > 2 || d[i + 2] > 2) n++;
    return { n, total: d.length / 4 };
  }, png.toString('base64'));
  const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const show = async () => { await p.mouse.move(640, 760); await p.mouse.move(641, 761); await p.waitForTimeout(350); await settle(); };
  const save = (name, png) => { if (outDir) fs.writeFileSync(path.join(outDir, name), png); };

  // ペンで線を描き、字幕と操作の帯が出ている画面
  await p.keyboard.press('d');
  await p.mouse.move(300, 300); await p.mouse.down();
  for (let i = 0; i < 20; i++) await p.mouse.move(300 + i * 20, 300 + Math.sin(i / 3) * 60);
  await p.mouse.up();
  await show();
  const st0 = await p.evaluate(() => ({ cap: !!document.querySelector('#deck-cap:not(.empty):not([hidden])'), cb: getComputedStyle(document.getElementById('dt-cb')).opacity, ink: DECK.tools && DECK.tools.mode && DECK.tools.mode() }));
  const before = await p.screenshot();
  save('blackout-0-before.png', before);
  ok(st0.cap && +st0.cb > 0.9 && st0.ink === 'pen', 'before: captions, the control bar and the pen are showing ' + JSON.stringify(st0));

  // 知らせ（ペンの色。3 回で元の色）が出ている間に b
  for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+D');
  const toast = await p.evaluate(() => !!document.querySelector('#deck-toast.show'));
  await p.keyboard.press('b');
  await p.mouse.move(640, 762);   // 帯を出そうとしても
  await p.keyboard.press('x');     // 道具のキーも効かない
  await settle();
  const black = await p.screenshot();
  save('blackout-1-black.png', black);
  const nb = await nonBlack(black);
  ok(nb.n <= nb.total * 0.0005, `after b the whole viewport is black (#000): ${nb.n} of ${nb.total} pixels differ`);
  const f1 = await p.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), focus: document.activeElement && document.activeElement.id }));
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  const f2 = await p.evaluate(() => document.activeElement && document.activeElement.id);
  ok(f1.black && f1.focus === 'deck-black' && f2 === 'deck-black', 'while blacked out, focus is on the cover and Tab does not leave it ' + JSON.stringify({ f1, f2 }));

  ok(toast && await p.evaluate(() => DECK.tools.mode() === 'pen'), 'a toast was showing when b was pressed, and tool keys do nothing while blacked out');
  await p.waitForTimeout(1600);   // 色の知らせが消えるまで
  await p.keyboard.press('b');
  await show();
  const after = await p.screenshot();
  save('blackout-2-after.png', after);
  ok(Buffer.compare(before, after) === 0, 'after b again the screenshot is identical to the one before blackout');

  // クリックで戻る：送らない・描かない
  const s1 = await p.evaluate(() => DECK.state());
  await p.keyboard.press('b');
  const ink1 = await p.evaluate(() => document.getElementById('dt-canvas').toDataURL());
  await p.mouse.click(700, 400);
  await settle();
  const s2 = await p.evaluate(() => ({ st: DECK.state(), black: document.documentElement.classList.contains('blackout'), cover: !!document.getElementById('deck-black'), ink: document.getElementById('dt-canvas').toDataURL(), mode: DECK.tools.mode() }));
  ok(!s2.black && !s2.cover && s2.st.slide === s1.slide && s2.st.step === s1.step && s2.ink === ink1 && s2.mode === 'pen', 'a click ends blackout without advancing or drawing ' + JSON.stringify({ s1, st: s2.st, black: s2.black, mode: s2.mode }));
  // Esc で戻る：ペンは切らない
  await p.keyboard.press('b');
  await p.keyboard.press('Escape');
  const s3 = await p.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), mode: DECK.tools.mode() }));
  ok(!s3.black && s3.mode === 'pen', 'Esc ends blackout and leaves the pen on ' + JSON.stringify(s3));
  // フォーカス：暗転の前にフォーカスのあった帯のボタンに戻る
  await p.keyboard.press('Escape');   // ペンを切る
  await show();
  await p.focus('#dt-cb button');
  const fb = await p.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.title);
  await p.keyboard.press('b'); await p.keyboard.press('b');
  const fa = await p.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.title);
  ok(fb && fa === fb, 'focus goes back to where it was before blackout ' + JSON.stringify({ fb, fa }));
  await p.evaluate(() => document.activeElement.blur());

  // 発表者ビュー
  const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
  await pv.waitForSelector('#pv-black', { state: 'attached' });
  await pv.waitForTimeout(900);
  const hidden0 = await pv.evaluate(() => document.getElementById('pv-black').hidden);
  await p.bringToFront();
  await p.keyboard.press('b');
  await pv.waitForFunction(() => !document.getElementById('pv-black').hidden, null, { timeout: 5000 }).catch(() => {});
  const pv1 = await pv.evaluate(() => { const e = document.getElementById('pv-black'); return { shown: !e.hidden && e.getBoundingClientRect().width > 0, text: e.textContent }; });
  if (outDir) await pv.screenshot({ path: path.join(outDir, 'blackout-presenter.png') });
  ok(hidden0 && pv1.shown && /暗転中|Blacked out/.test(pv1.text), 'the presenter view shows the blacked-out indicator while the main window is black ' + JSON.stringify({ hidden0, ...pv1 }));
  await pv.bringToFront();
  await pv.keyboard.press('b');
  await p.waitForFunction(() => !document.documentElement.classList.contains('blackout'), null, { timeout: 5000 }).catch(() => {});
  await pv.waitForFunction(() => document.getElementById('pv-black').hidden, null, { timeout: 5000 }).catch(() => {});
  const r = { main: await p.evaluate(() => document.documentElement.classList.contains('blackout')), ind: await pv.evaluate(() => document.getElementById('pv-black').hidden) };
  ok(!r.main && r.ind, 'b in the presenter view ends blackout on the main window, and the indicator goes ' + JSON.stringify(r));
  await pv.keyboard.press('b');
  await p.waitForFunction(() => document.documentElement.classList.contains('blackout'), null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => document.documentElement.classList.contains('blackout')), 'b in the presenter view also starts blackout on the main window');
  await pv.close();
  await p.bringToFront();
  await p.keyboard.press('b');

  // 印刷：暗転していても同じ
  const printShot = async (on) => {
    const q = await ctx.newPage();
    await q.goto(fileUrl(html));
    await q.waitForFunction(() => window.DECK && DECK.ready);
    await q.evaluate(() => document.fonts.ready);
    if (on) await q.keyboard.press('b');
    await q.emulateMedia({ media: 'print' });
    await q.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await q.screenshot({ fullPage: true });
    const black = await q.evaluate(() => document.documentElement.classList.contains('blackout'));
    await q.close();
    return { png, black };
  };
  const pr0 = await printShot(false), pr1 = await printShot(true);
  ok(pr1.black && Buffer.compare(pr0.png, pr1.png) === 0, 'print output is the same with and without blackout');

  // 動画：b で暗転しない
  const v = await ctx.newPage();
  await v.goto(fileUrl(html) + '?mode=video');
  await v.waitForFunction(() => window.DECK && DECK.ready);
  await v.keyboard.press('b');
  const vb = await v.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), cover: !!document.getElementById('deck-black') }));
  ok(!vb.black && !vb.cover, 'video mode cannot enter blackout ' + JSON.stringify(vb));
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} finally { await b.close(); }
if (fails) { console.log(`test-blackout: ${fails} failed`); process.exit(1); }
console.log('test-blackout: all ok');
