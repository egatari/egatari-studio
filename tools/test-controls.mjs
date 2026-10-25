// 操作の帯と「?」のキー一覧（kit/tools.js）、発表者ビューの道具のボタン（kit/presenter.js）の確認
//   node tools/test-controls.mjs <built.html> [画面の保存先]
// 帯が出て隠れる・余白に置かれる・ボタンで送れる・ペンを押しても矢印が効く・ボタンの下に描かない・
// ? で一覧・発表者ビューのボタンで本体の道具が変わる・動画 / 埋め込み / 印刷では出ない
import { launch, fileUrl } from '../kit/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const [file, outdir = path.join(os.tmpdir(), 'test-controls')] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-controls.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const url = fileUrl(file);
const b = await launch();
const errs = [];
const watch = (p, name) => {
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message));
};
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const shot = (p, name) => p.screenshot({ path: path.join(outdir, name + '.png') });
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const shown = (p) => p.evaluate(() => { const c = document.getElementById('dt-cb'); return !!c && c.classList.contains('show') && +getComputedStyle(c).opacity > .5; });
const pos = (p) => p.evaluate(() => { const s = DECK.state(); return s.slide * 100 + s.step; });
const inked = (p) => p.evaluate(() => {
  const c = document.getElementById('dt-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n;
});
const btn = (name) => `#dt-cb button[data-b="${name}"]`;

// ---- 16:10 に近い画面（舞台の下に余白がある）
const ctx = await b.newContext({ viewport: { width: 1280, height: 840 } });
const p = await ctx.newPage(); watch(p, '本体');
await p.goto(url + '#2'); await ready(p);
await p.evaluate(() => document.fonts.ready);
ok(await shown(p), '開いた直後に帯を一度見せる');
await p.waitForTimeout(2900);
ok(!(await shown(p)), '2.5 秒止まると帯が隠れる');
await p.mouse.move(300, 300); await p.mouse.move(320, 310, { steps: 3 });
await p.waitForTimeout(350);
ok(await shown(p), 'マウスを動かすと帯が出る');
const geo = await p.evaluate(() => ({ bar: document.getElementById('dt-cb').getBoundingClientRect().toJSON(), st: document.getElementById('stage').getBoundingClientRect().toJSON() }));
ok(geo.bar.top >= geo.st.bottom - .5, `余白があるときは舞台に重ならない（帯の上端 ${geo.bar.top.toFixed(0)} ≥ 舞台の下端 ${geo.st.bottom.toFixed(0)}）`);
await shot(p, 'main-bar');

// 次へ・前へ
const p0 = await pos(p);
await p.click(btn('next')); await p.waitForTimeout(250);
const p1 = await pos(p);
ok(p1 > p0, `▶ で次へ（${p0} → ${p1}）`);
await p.click(btn('prev')); await p.waitForTimeout(250);
ok(await pos(p) === p0, '◀ で戻る');

// ペンを押す → 矢印がそのまま効く、フォーカスはボタンに残らない
await p.click(btn('pen'));
ok(await p.evaluate(() => DECK.tools.mode()) === 'pen', 'ペンのボタンでペンになる');
ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="pen"]').classList.contains('on')), 'ペンのボタンが強調される');
ok(await p.evaluate(() => !document.activeElement || !document.activeElement.closest('#dt-cb')), 'フォーカスがボタンに残らない');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
ok(await pos(p) > p0, 'ボタンを押した後も → で送れる');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(250);
await p.keyboard.press('d');
ok(await p.evaluate(() => DECK.tools.mode()) === null && !(await p.evaluate(() => document.querySelector('#dt-cb [data-b="pen"]').classList.contains('on'))), 'キーで解除すると強調も消える');

// ペンの色：ペンの間だけ帯に赤・青・黒のボタン。押すと色が変わり、aria-pressed・知らせ・左下の表示・ペンのボタンの点に出る
const sw = () => p.evaluate(() => { const g = document.querySelector('#dt-cb .dt-sw'); return { hidden: g.hidden || getComputedStyle(g).display === 'none', n: g.querySelectorAll('button').length,
  pressed: [...g.querySelectorAll('button')].map((x) => x.getAttribute('aria-pressed')), labels: [...g.querySelectorAll('button')].map((x) => x.getAttribute('aria-label')) }; });
ok((await sw()).hidden, 'ペンでないときは色のボタンを出さない');
await p.mouse.move(320, 330, { steps: 2 }); await p.click(btn('pen'));
let s0 = await sw();
ok(!s0.hidden && s0.n === 3 && s0.pressed.join() === 'true,false,false' && s0.labels.join() === 'ペンの色：赤,ペンの色：青,ペンの色：黒', `ペンの間は色のボタンが 3 つ（${s0.labels.join(' / ')}）`);
await p.click('#dt-cb .dt-sw [data-c="1"]'); await p.waitForTimeout(100);
s0 = await sw();
ok(await p.evaluate(() => DECK.tools.color()) === 1 && s0.pressed.join() === 'false,true,false', '青のボタンで青になり aria-pressed="true"');
ok(await p.evaluate(() => { const t = document.getElementById('deck-toast'); return t && t.classList.contains('show') && t.textContent; }) === 'ペンの色：青', '色を変えると「ペンの色：青」と知らせる');
ok(/青/.test(await p.locator('#dt-ind').innerText()), '左下の表示にも色の名前');
ok(await p.evaluate(() => { const d = document.querySelector('#dt-cb [data-b="pen"] .dt-dot'); return getComputedStyle(d).backgroundColor === getComputedStyle(document.querySelector('#dt-cb .dt-sw [data-c="1"] i')).backgroundColor; }), 'ペンのボタンの点が今の色');
await p.keyboard.press('Shift+D'); await p.waitForTimeout(100);
ok(await p.evaluate(() => DECK.tools.color()) === 2 && (await sw()).pressed[2] === 'true' && await p.evaluate(() => document.getElementById('deck-toast').textContent) === 'ペンの色：黒', 'Shift+d でも色のボタンと知らせが変わる');
await p.mouse.move(330, 330, { steps: 2 }); await p.waitForTimeout(150);
await shot(p, 'pen-swatches');
await p.keyboard.press('Shift+D'); await p.keyboard.press('d');
ok((await sw()).hidden && await p.evaluate(() => DECK.tools.color()) === 0, 'ペンを解除すると色のボタンが隠れる');

// 自動再生のボタン：■ に変わる
await p.click(btn('auto')); await p.waitForTimeout(200);
const autoOn = await p.evaluate(() => document.documentElement.classList.contains('autoplay') && document.querySelector('#dt-cb [data-b="auto"]').classList.contains('on'));
await p.click(btn('auto')); await p.waitForTimeout(200);
const autoOff = await p.evaluate(() => !document.documentElement.classList.contains('autoplay'));
ok(autoOn && autoOff, '自動再生のボタンで始めて止める（状態が出る）');

// 授業モード
await p.click(btn('lect'));
ok(await p.evaluate(() => DECK.mode === 'lecture' && document.querySelector('#dt-cb [data-b="lect"]').classList.contains('on')), '授業モードのボタン');
// 授業の表示には今の段階の印（蛍光ペンも .cur も）がなく、先の段階は --lecture-dim で薄い（backlog #86）
const lectProbe = () => p.evaluate(() => {
  const i = DECK.slides.findIndex((s) => s._max >= 2), k = 1;
  DECK.seek(i, k, Infinity);
  const dim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lecture-dim'));
  const items = [...DECK.slides[i].querySelectorAll('[data-step]')];
  const marked = items.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage) || e.classList.contains('cur'));
  const future = items.filter((e) => +e.getAttribute('data-step') > k), now = items.filter((e) => +e.getAttribute('data-step') <= k);
  return { i, dim, nItems: items.length, nFuture: future.length, marked: marked.length, cur: document.querySelectorAll('.cur').length,
    futureOp: future.map((e) => +e.style.opacity), nowOp: now.map((e) => +e.style.opacity) };
});
const lp = await lectProbe();
ok(lp.i >= 0 && lp.nItems > 0 && lp.nFuture > 0, '授業の表示で確かめる段階がある（' + JSON.stringify([lp.i, lp.nItems, lp.nFuture]) + '）');
ok(lp.cur === 0 && lp.marked === 0, '授業の表示に今の段階の印（.cur・蛍光ペンの地）がない');
ok(lp.dim >= .45 && lp.dim <= .5 && lp.futureOp.every((o) => o === lp.dim) && lp.nowOp.every((o) => o === 1), '先の段階は --lecture-dim（' + lp.dim + '）で薄く、今までの段階は濃い');
await p.evaluate(() => document.documentElement.style.setProperty('--lecture-dim', '.45'));
const lp2 = await lectProbe();
ok(lp2.futureOp.length > 0 && lp2.futureOp.every((o) => o === .45), 'テーマが --lecture-dim を変えると先の段階がそれに従う');
await p.evaluate(() => document.documentElement.style.removeProperty('--lecture-dim'));
ok(!/\.cur\b|emph-tint/.test(fs.readFileSync(new URL('../kit/base.css', import.meta.url), 'utf8')), 'kit/base.css に今の段階の強調の規則がない');
await p.click(btn('lect'));
ok(await p.evaluate(() => DECK.mode) === 'talk', '授業モードを戻す');
ok(await p.evaluate(() => document.querySelectorAll('.cur').length) === 0, '発表のモードにも .cur はない');

// 一覧
await p.click(btn('over'));
ok(await p.locator('#dt-ov').count() === 1, '一覧のボタン');
await p.keyboard.press('Escape');

// ? のキー一覧
await p.keyboard.press('?');
ok(await p.locator('#dt-help.show').count() === 1, '? でキーの一覧が開く');
const helpText = await p.locator('#dt-help').innerText();
ok(/レーザー|Laser/.test(helpText) && !/編集モード|Edit mode/.test(helpText), '開発サーバーでなければ e / n / c を載せない');
await p.mouse.move(640, 790); await p.waitForTimeout(200);
await shot(p, 'help');
await p.keyboard.press('?');
ok(await p.locator('#dt-help.show').count() === 0, 'もう一度 ? で閉じる');
await p.click(btn('help'));
ok(await p.locator('#dt-help.show').count() === 1, '? のボタンでも開く');
await p.keyboard.press('Escape');
ok(await p.locator('#dt-help.show').count() === 0, 'Esc で閉じる');
await p.evaluate(() => { window.DECK_DEV = true; });
await p.keyboard.press('?');
ok(/編集モード|Edit mode/.test(await p.locator('#dt-help').innerText()), 'DECK_DEV のときは e / n / c も載せる');
await p.keyboard.press('Escape');

// 印刷では出ない
await p.mouse.move(500, 500, { steps: 2 });
await p.emulateMedia({ media: 'print' });
ok(await p.evaluate(() => getComputedStyle(document.getElementById('dt-cb')).display === 'none'), '印刷では帯が出ない');
await p.emulateMedia({ media: 'screen' });

// ---- 発表者ビューのボタン
const [pv] = await Promise.all([ctx.waitForEvent('page'), p.click(btn('pres'))]);
watch(pv, '発表者ビュー');
await pv.setViewportSize({ width: 1400, height: 820 });
await pv.waitForLoadState('load'); await pv.waitForTimeout(1200);
ok(await pv.locator('#pv .pv-tools button[data-b]').count() === 6, '発表者ビューに道具のボタンが 6 つ');
ok(/レーザー|laser/.test(await pv.locator('#pv-keys').innerText()), '発表者ビューの下にキーの説明');
await pv.click('#pv .pv-tools [data-b="laser"]'); await pv.waitForTimeout(200);
ok(await p.evaluate(() => DECK.tools.mode()) === 'laser', '発表者ビューのレーザーのボタンで本体がレーザーになる');
ok(await pv.evaluate(() => document.querySelector('#pv .pv-tools [data-b="laser"]').classList.contains('on')), '発表者ビューのボタンも強調される');
await pv.click('#pv .pv-tools [data-b="pen"]'); await pv.waitForTimeout(200);
ok(await p.evaluate(() => DECK.tools.mode()) === 'pen', '発表者ビューのペンのボタン');
// 発表者ビューの色のボタン：本体と「今の画面」に番号で送る。本体で変えると発表者ビューも変わる
const pvsw = () => pv.evaluate(() => { const g = document.querySelector('#pv .pv-sw'); return { hidden: g.hidden, pressed: [...g.querySelectorAll('button')].map((x) => x.getAttribute('aria-pressed')).join() }; });
ok(!(await pvsw()).hidden, '発表者ビューでもペンの間は色のボタンが出る');
await pv.click('#pv .pv-sw [data-c="1"]'); await pv.waitForTimeout(250);
const fol = pv.frames().find((f) => /view=follow/.test(f.url()));
ok(await p.evaluate(() => DECK.tools.color()) === 1 && (await pvsw()).pressed === 'false,true,false' && (!fol || await fol.evaluate(() => DECK.tools.color()) === 1), '発表者ビューの青で本体と「今の画面」が青になる');
await p.keyboard.press('Shift+D'); await pv.waitForTimeout(250);
ok((await pvsw()).pressed === 'false,false,true' && (!fol || await fol.evaluate(() => DECK.tools.color()) === 2), '本体で色を変えると発表者ビューの色のボタンも変わる');
await pv.keyboard.press('Shift+D'); await pv.waitForTimeout(250);
ok(await p.evaluate(() => DECK.tools.color()) === 0 && (await pvsw()).pressed === 'true,false,false', '発表者ビューの Shift+d も番号で送る（本体と食い違わない）');
await shot(pv, 'presenter-swatches');
const q0 = await pos(p);
await pv.keyboard.press('ArrowRight'); await pv.waitForTimeout(300);
ok(await pos(p) > q0, '発表者ビューでボタンを押した後も → で送れる');
await pv.click('#pv .pv-tools [data-b="lect"]'); await pv.waitForTimeout(200);
ok(await p.evaluate(() => DECK.mode) === 'lecture', '発表者ビューの授業モードのボタンで本体が授業モードになる');
await pv.waitForTimeout(500);
await shot(pv, 'presenter');
await pv.click('#pv .pv-tools [data-b="lect"]'); await pv.waitForTimeout(150);
await pv.click('#pv .pv-tools [data-b="over"]'); await pv.waitForTimeout(300);
ok(await p.locator('#dt-ov').count() === 1, '発表者ビューの一覧のボタンで本体に一覧が開く');
await pv.keyboard.press('ArrowRight'); await pv.waitForTimeout(300);
ok(await p.locator('#dt-ov').count() === 0, '発表者ビューで送ると本体の一覧が閉じる');
await pv.keyboard.press('Escape'); await pv.waitForTimeout(150);
ok(await p.evaluate(() => DECK.tools.mode()) === null, '発表者ビューの Esc で解除');
await pv.close();

// ---- 16:9 ちょうど（余白がない）：下端に重ねる。ボタンを押しても下に描かない
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 720 } });
const r = await ctx2.newPage(); watch(r, '本体 16:9');
await r.goto(url + '#2'); await ready(r);
await r.waitForTimeout(2900);
await r.mouse.move(640, 300, { steps: 3 }); await r.waitForTimeout(300);
ok(!(await shown(r)), '重ねるときは、舞台の中ほどでマウスを動かしても出ない');
await r.keyboard.press('d');
await r.mouse.move(640, 690, { steps: 3 }); await r.waitForTimeout(300);
ok(await shown(r), '下のほうに来ると出る');
await shot(r, 'main-bar-overlay');
const r0 = await pos(r);
await r.click(btn('vpen')); await r.click(btn('clear')); await r.click(btn('pen'));
ok(await inked(r) === 0 && await pos(r) === r0, 'ペンのままボタンを押しても、下に描かず送られない');
ok(await r.evaluate(() => DECK.tools.mode()) === 'pen', 'ペン → 消えるペン → 消す → ペンの順に効く');

// ---- 動画・埋め込みでは作らない
for (const q of ['?mode=video', '?view=next', '?view=follow']) {
  const v = await ctx2.newPage(); watch(v, q);
  await v.goto(url + q); await ready(v);
  await v.mouse.move(600, 700, { steps: 3 }); await v.keyboard.press('?');
  ok(await v.evaluate(() => !document.getElementById('dt-cb') && !document.getElementById('dt-help')), `${q} では帯もキー一覧もない`);
  await v.close();
}

const known = [];   // 以前の既知の不具合（発表者ビューに届いた命令で _max を読む）は deck.js で直した
errs.splice(0, errs.length, ...errs.filter((e) => !known.includes(e)));
ok(errs.length === 0, 'コンソールのエラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} 件の失敗` : 'すべて通過', '→', outdir);
process.exit(fails ? 1 : 0);
