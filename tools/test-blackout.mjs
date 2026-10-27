// 暗転（b）：窓全体が真っ黒（#000）になり、もう一度 b・クリック・Esc で元の画面に戻ること
//   node tools/test-blackout.mjs <組んだ deck.html> [<画像を書くフォルダ>]
// 1. ペンの線・字幕・操作の帯・知らせ（ペンの色）を出した画面で b：窓全体の画素が #000（ほぼ）。もう一度 b で、前と同じ画面
// 2. クリックと Esc でも戻る（クリックは送らない・描かない。Esc はペンを切らない）。暗転の間のフォーカスは覆いにあり、Tab で下に抜けない。戻るとフォーカスも戻る
// 3. 発表者ビュー：本体の b で「暗転中」の札が出て、発表者ビューの b で本体が戻る（札も消える）。暗転の間の発表者ビューの矢印・Space・PageUp/PageDown は暗転を終えるだけで送らない
// 3b. キーの一覧（?）を開いたままの b：覆いが一覧より上で、Esc はまず暗転、次に一覧。外へのリンクの箱は暗転に入るとやめる
// 4. 印刷：暗転していても、印刷の画面（beforeprint と print の media）は暗転していないときと同じ
// 5. 動画（?mode=video）：b で暗転しない（隅の知らせも出ない）
// 6. 暗転を終えるキー：矢印・Space・PageUp/PageDown・Home/End は暗転を終えるだけで、スライドも段階も動かさない
// 7. 隅の知らせ（「暗転中 — b か Esc で戻ります」）：入ったときに出て約 2 秒で消え、マウスを動かすとまた出る。印刷には出ない
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
  // 隅の知らせ（#deck-black-hint、約 2 秒）の箱は数えない（知らせそのものは下の 6 で確かめる）
  const nonBlack = async (png) => p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const h = document.getElementById('deck-black-hint'), r = h ? h.getBoundingClientRect() : null, sc = c.width / innerWidth;
    const inHint = (x, y) => r && x >= (r.left - 4) * sc && x <= (r.right + 4) * sc && y >= (r.top - 4) * sc && y <= (r.bottom + 4) * sc;
    let n = 0; for (let i = 0; i < d.length; i += 4) {
      if (!(d[i] > 2 || d[i + 1] > 2 || d[i + 2] > 2)) continue;
      const q = i / 4; if (inHint(q % c.width, Math.floor(q / c.width))) continue;
      n++;
    }
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
  ok(hidden0 && pv1.shown && /黒い画面中|Black screen/.test(pv1.text), 'the presenter view shows the blacked-out indicator while the main window is black ' + JSON.stringify({ hidden0, ...pv1 }));
  await pv.bringToFront();
  await pv.keyboard.press('b');
  await p.waitForFunction(() => !document.documentElement.classList.contains('blackout'), null, { timeout: 5000 }).catch(() => {});
  await pv.waitForFunction(() => document.getElementById('pv-black').hidden, null, { timeout: 5000 }).catch(() => {});
  const r = { main: await p.evaluate(() => document.documentElement.classList.contains('blackout')), ind: await pv.evaluate(() => document.getElementById('pv-black').hidden) };
  ok(!r.main && r.ind, 'b in the presenter view ends blackout on the main window, and the indicator goes ' + JSON.stringify(r));
  await pv.keyboard.press('b');
  await p.waitForFunction(() => document.documentElement.classList.contains('blackout'), null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => document.documentElement.classList.contains('blackout')), 'b in the presenter view also starts blackout on the main window');
  // 暗転の間に発表者ビューで送りのキー：本体のキーと同じく暗転を終えるだけで、スライドも段階も動かさない
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Space', 'PageDown', 'PageUp']) {
    const a = await p.evaluate(() => DECK.state());
    const on = await p.evaluate(() => document.documentElement.classList.contains('blackout'));
    await pv.keyboard.press(k);
    await p.waitForFunction(() => !document.documentElement.classList.contains('blackout'), null, { timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(300);
    const z = await p.evaluate(() => ({ st: DECK.state(), black: document.documentElement.classList.contains('blackout') }));
    await pv.waitForFunction(() => document.getElementById('pv-black').hidden, null, { timeout: 3000 }).catch(() => {});
    const ind = await pv.evaluate(() => document.getElementById('pv-black').hidden);
    ok(on && !z.black && ind && z.st.slide === a.slide && z.st.step === a.step, `${k} in the presenter view ends blackout on the main window and leaves the slide and step unchanged ` + JSON.stringify({ before: [a.slide, a.step], after: [z.st.slide, z.st.step], on, black: z.black, indicatorHidden: ind }));
    await pv.keyboard.press('b');
    await p.waitForFunction(() => document.documentElement.classList.contains('blackout'), null, { timeout: 3000 }).catch(() => {});
  }
  await pv.close();
  await p.bringToFront();
  await p.keyboard.press('b');

  // キーの一覧（?）を開いたまま b（#9）：覆いは一覧より上。Esc はまず暗転をやめ、次の Esc で一覧を閉じる
  await p.keyboard.press('?');
  await p.keyboard.press('b');
  await settle();
  const hb = await p.evaluate(() => {
    const help = document.getElementById('dt-help'), c = document.getElementById('deck-black');
    const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { help: !!(help && help.classList.contains('show')), cover: !!c, top: top && top.id };
  });
  const hshot = await p.screenshot();
  save('blackout-3-help.png', hshot);
  const hn = await nonBlack(hshot);
  ok(hb.help && hb.cover && hb.top === 'deck-black' && hn.n <= hn.total * 0.0005, 'b with the key help open: the black cover is above the help ' + JSON.stringify({ ...hb, nonBlack: hn.n }));
  await p.keyboard.press('Escape');
  const he1 = await p.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), help: document.getElementById('dt-help').classList.contains('show') }));
  await p.keyboard.press('Escape');
  const he2 = await p.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), help: document.getElementById('dt-help').classList.contains('show') }));
  ok(!he1.black && he1.help && !he2.black && !he2.help, 'Esc first leaves blackout, then the next Esc closes the help ' + JSON.stringify({ he1, he2 }));

  // 外へのリンクの確認の箱を開いたまま暗転に入ると、箱は「やめる」になる
  await p.evaluate(() => DECK.extLink('https://example.com/', 'example.com'));
  const ext0 = await p.evaluate(() => !!document.getElementById('deck-extlink'));
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('b');
  const ext1 = await p.evaluate(() => ({ box: !!document.getElementById('deck-extlink'), black: document.documentElement.classList.contains('blackout'), stageInert: document.getElementById('stage').inert }));
  await p.keyboard.press('b');
  ok(ext0 && !ext1.box && ext1.black && !ext1.stageInert, 'entering blackout closes the outside-link box ' + JSON.stringify({ ext0, ...ext1 }));

  // 6. 暗転を終えるキー：どれも暗転を終えるだけ（スライドも段階も変わらない）
  await p.keyboard.press('Escape');   // 念のため（ペンは切っておく）
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End']) {
    const a = await p.evaluate(() => DECK.state());
    await p.keyboard.press('b');
    const on = await p.evaluate(() => document.documentElement.classList.contains('blackout'));
    await p.keyboard.press(k);
    await settle();
    const z = await p.evaluate(() => ({ st: DECK.state(), black: document.documentElement.classList.contains('blackout'), cover: !!document.getElementById('deck-black') }));
    ok(on && !z.black && !z.cover && z.st.slide === a.slide && z.st.step === a.step, `${k} ends blackout and leaves the slide and step unchanged ` + JSON.stringify({ before: [a.slide, a.step], after: [z.st.slide, z.st.step], on, black: z.black }));
  }

  // 7. 隅の知らせ：入ると出る → 約 2 秒で消える → マウスを動かすとまた出る → 約 2 秒で消える
  const hint = () => p.evaluate(() => { const h = document.getElementById('deck-black-hint'); return h ? { show: h.classList.contains('show'), text: h.textContent, op: +getComputedStyle(h).opacity } : null; });
  await p.mouse.move(600, 400);
  await p.keyboard.press('b');
  await p.waitForTimeout(400);
  const h0 = await hint();
  await p.waitForTimeout(2000);
  const h1 = await hint();
  await p.mouse.move(620, 420); await p.mouse.move(640, 440);
  await p.waitForTimeout(400);
  const h2 = await hint();
  await p.waitForTimeout(2100);
  const h3 = await hint();
  ok(h0 && h0.show && h0.op > 0.9 && /黒い画面中|Black screen/.test(h0.text), 'the corner hint shows when blackout starts ' + JSON.stringify(h0));
  ok(h1 && !h1.show && h1.op < 0.1, 'the hint hides after about 2 s ' + JSON.stringify(h1));
  ok(h2 && h2.show, 'moving the mouse during blackout shows the hint again ' + JSON.stringify(h2));
  ok(h3 && !h3.show, 'and it hides again after about 2 s ' + JSON.stringify(h3));
  await p.keyboard.press('b');
  ok(!(await p.evaluate(() => !!document.getElementById('deck-black-hint'))), 'the hint goes away with the cover');

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
    await q.evaluate(() => document.fonts.ready);
    await q.waitForTimeout(300);
    const png = await q.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
    const black = await q.evaluate(() => { const c = document.getElementById('deck-black'), h = document.getElementById('deck-black-hint'); return document.documentElement.classList.contains('blackout') && !!c && getComputedStyle(c).display === 'none' && !!h && getComputedStyle(h).display === 'none'; });
    await q.close();
    return { png, black };
  };
  const pr0 = await printShot(false), pr1 = await printShot(true);
  // 画素で比べる（字の描き方のわずかな揺れは許す。暗転の覆いが出ていれば窓の大半が黒くなって大きく違う）
  const diff = await p.evaluate(async ([a, b]) => {
    const load = async (x) => { const i = new Image(); i.src = 'data:image/png;base64,' + x; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data }; };
    const A = await load(a), B = await load(b);
    if (A.w !== B.w || A.h !== B.h) return { size: [A.w, A.h, B.w, B.h], n: -1, total: 0 };
    let n = 0; for (let i = 0; i < A.d.length; i += 4) if (Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]) > 48) n++;
    return { n, total: A.d.length / 4 };
  }, [pr0.png.toString('base64'), pr1.png.toString('base64')]);
  ok(pr1.black && diff.n >= 0 && diff.n <= diff.total * 0.002, 'print output is the same with and without blackout (the cover is not printed) ' + JSON.stringify({ ...diff, identical: Buffer.compare(pr0.png, pr1.png) === 0 }));

  // 動画：b で暗転しない
  const v = await ctx.newPage();
  await v.goto(fileUrl(html) + '?mode=video');
  await v.waitForFunction(() => window.DECK && DECK.ready);
  await v.keyboard.press('b');
  await v.mouse.move(400, 300); await v.mouse.move(420, 320);
  const vb = await v.evaluate(() => ({ black: document.documentElement.classList.contains('blackout'), cover: !!document.getElementById('deck-black'), hint: !!document.getElementById('deck-black-hint') }));
  ok(!vb.black && !vb.cover && !vb.hint, 'video mode cannot enter blackout and shows no hint ' + JSON.stringify(vb));
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} finally { await b.close(); }
if (fails) { console.log(`test-blackout: ${fails} failed`); process.exit(1); }
console.log('test-blackout: all ok');
