// 発表中の道具（kit/tools.js）の確認：node tools/test-tools.mjs <built.html> [画面の保存先]
// 一覧・ペン（スライドごとに残る）・消えるペン・レーザー・動画モード・印刷・発表者ビューからの書き込み
import { launch, fileUrl } from '../kit/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [file, outdir = '/tmp/test-tools'] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-tools.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const url = fileUrl(file);
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [];
const watch = (p, name) => {
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
};
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const shot = (p, name) => p.screenshot({ path: path.join(outdir, name + '.png') });
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
// canvas の (x, y)（舞台の座標）付近に色が塗られているか
const inked = (p) => p.evaluate(() => {
  const c = document.getElementById('dt-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n;
});
async function stroke(p, pts) {
  const r = await p.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.left, y: b.top, k: b.width / 1280 }; });
  const at = ([x, y]) => [r.x + x * r.k, r.y + y * r.k];
  await p.mouse.move(...at(pts[0])); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(...at(q), { steps: 6 });
  await p.mouse.up();
}
const wave = (x0, y0, w, h) => Array.from({ length: 13 }, (_, i) => [x0 + i * w / 12, y0 + Math.sin(i / 2) * h]);

// ---- 本体
const p = await ctx.newPage(); watch(p, '本体');
await p.goto(url + '#3'); await ready(p);
await p.evaluate(() => document.fonts.ready);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(800);
const st0 = await p.evaluate(() => DECK.state());

// 一覧
let t0 = Date.now();
await p.keyboard.press('o');
const n = await p.locator('#dt-ov .dt-cell').count();
ok(n === (await p.evaluate(() => DECK.slides.length)), `一覧のサムネイル ${n} 枚（${Date.now() - t0} ms）`);
ok(await p.locator('#dt-ov .dt-cell.cur.sel').count() === 1, '今のスライドが選ばれている');
await p.waitForTimeout(150); await shot(p, 'overview');
ok(JSON.stringify(await p.evaluate(() => DECK.state())) === JSON.stringify(st0), '一覧を開いても位置が変わらない');
await p.keyboard.press('Escape');
ok(await p.locator('#dt-ov').count() === 0 && JSON.stringify(await p.evaluate(() => DECK.state())) === JSON.stringify(st0), 'Esc で閉じ、位置はそのまま');
const visible = await p.evaluate(() => DECK.slides.filter((s) => getComputedStyle(s).visibility === 'visible').length);
ok(visible === 1, `閉じた後に見えているスライドは 1 枚（${visible}）`);
await p.keyboard.press('o'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter');
ok((await p.evaluate(() => DECK.state().slide)) === st0.slide + 2 && await p.locator('#dt-ov').count() === 0, '矢印＋Enter で 2 枚先に移る');
await p.keyboard.press('o'); await p.locator('#dt-ov .dt-cell').nth(1).click();
ok((await p.evaluate(() => DECK.state().slide)) === 2, 'クリックで移る');

// ペン：スライドごとに残る
await p.keyboard.press('d');
ok(await p.evaluate(() => DECK.tools.mode()) === 'pen' && await p.locator('#dt-ind.on').count() === 1, 'd でペン、表示が出る');
const slideBefore = await p.evaluate(() => DECK.state().slide);
await stroke(p, wave(200, 520, 500, 30));
await p.keyboard.press('Shift+D');
await stroke(p, [[760, 300], [900, 260], [1040, 330], [1100, 420]]);
ok(await p.evaluate(() => DECK.state().slide) === slideBefore, 'ペンで描いてもクリックで送られない');
const ink1 = await inked(p); ok(ink1 > 500, `描いた線がある（${ink1} px）`);
await shot(p, 'pen');
await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowRight');
await p.waitForTimeout(500);
ok(await p.evaluate(() => DECK.state().slide) === slideBefore + 1, 'ペンの間も矢印で送れる');
ok(await inked(p) === 0, '次のスライドでは線が見えない');
await p.keyboard.press('Shift+ArrowLeft'); await p.waitForTimeout(300);
const ink2 = await inked(p); ok(Math.abs(ink2 - ink1) <= ink1 * .06, `戻ると線が残っている（${ink2} px）`);

// 消えるペン
await p.keyboard.press('v');
await stroke(p, wave(160, 200, 400, 40));
await p.waitForTimeout(150);
ok(await inked(p) > ink1, '消えるペンの線が出る');
await shot(p, 'vanish');
await p.waitForTimeout(2000);
const ink3 = await inked(p); ok(Math.abs(ink3 - ink1) <= ink1 * .06, `2 秒後には消えるペンの線だけが消える（${ink3} px）`);

// 印刷では隠す（描き込みとモード表示）
await p.emulateMedia({ media: 'print' });
const hidden = await p.evaluate(() => [...document.querySelectorAll('.deck-tools')].filter((e) => e.tagName !== 'STYLE').every((e) => getComputedStyle(e).display === 'none'));
ok(hidden, '印刷では道具の要素が出ない');
await p.emulateMedia({ media: 'screen' });

// 消す
await p.keyboard.press('d');
await p.keyboard.press('Backspace');
ok(await inked(p) === 0, 'Backspace で今のスライドの線を消す');

// レーザー
await p.keyboard.press('Escape');
ok(await p.evaluate(() => DECK.tools.mode()) === null && await p.locator('#dt-ind.on').count() === 0, 'Esc で道具を解除、表示も消える');
await p.keyboard.press('x');
await p.mouse.move(400, 300); await p.mouse.move(640, 380, { steps: 5 });
await p.waitForTimeout(200);
const laser = await p.evaluate(() => { const d = document.getElementById('dt-laser'); return { op: +getComputedStyle(d).opacity, cur: getComputedStyle(document.getElementById('dt-layer')).cursor }; });
ok(laser.op > .9 && laser.cur === 'none', `レーザーの点が見え、カーソルは隠れる（${JSON.stringify(laser)}）`);
await shot(p, 'laser');
await p.waitForTimeout(2600);
ok(+(await p.evaluate(() => getComputedStyle(document.getElementById('dt-laser')).opacity)) < .05, '止まって 2 秒でレーザーが消える');
await p.keyboard.press('x');

// 数字＋Enter のページ指定は今まで通り
await p.keyboard.press('5'); await p.keyboard.press('Enter');
ok(await p.evaluate(() => DECK.state().slide) === 5, '数字＋Enter のページ指定はそのまま');

// ---- 発表者ビューの「今の画面」から描く（本体に送られる）
await p.keyboard.press('2'); await p.keyboard.press('Enter');
const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
watch(pv, '発表者ビュー');
await pv.waitForLoadState('load');
let fr;
for (let i = 0; i < 50 && !fr; i++) { fr = pv.frames().find((f) => /view=follow/.test(f.url())); if (!fr) await pv.waitForTimeout(100); }
await fr.waitForFunction(() => window.DECK && DECK.ready && DECK.tools, null, { timeout: 10000 });
await pv.waitForTimeout(800);
await pv.keyboard.press('d');
await pv.waitForTimeout(100);
const box = await pv.locator('#f-cur').boundingBox();
const k = box.width / 1280;
await pv.mouse.move(box.x + 300 * k, box.y + 400 * k); await pv.mouse.down();
for (let i = 1; i <= 10; i++) await pv.mouse.move(box.x + (300 + i * 60) * k, box.y + (400 - i * 15) * k, { steps: 3 });
await pv.mouse.up();
await pv.waitForTimeout(300);
ok(await inked(p) > 300, '発表者ビューで描いた線が本体に出る');
const px = await p.evaluate(() => { const c = document.getElementById('dt-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) return [d[i], d[i + 1], d[i + 2]]; });
ok(px && px[0] > px[2], `本体の線は発表者ビューと同じ色（${px}）`);
ok(await fr.evaluate(() => DECK.tools.mode()) === 'pen', '「今の画面」もペンになる');
await shot(pv, 'presenter');
await shot(p, 'presenter-main');
await pv.keyboard.press('Escape');
await pv.waitForTimeout(100);
ok(await p.evaluate(() => DECK.tools.mode()) === null, '発表者ビューの Esc で本体も解除');
await pv.close();

// ---- 動画モードでは何も作らない
const v = await ctx.newPage(); watch(v, '動画');
await v.goto(url + '?mode=video'); await ready(v);
await v.keyboard.press('o'); await v.keyboard.press('d');
ok(await v.evaluate(() => !window.DECK.tools && document.querySelectorAll('.deck-tools').length === 0), '動画モードでは道具がない');

// 既知：deck.js が起動前に発表者ビューの deck-goto を受けると go() が落ちる（tools.js とは無関係。報告済み）
const known = errs.filter((e) => /view=(follow|next)/.test(e) && /reading '_max'/.test(e));
if (known.length) console.log('note 既知のエラー（deck.js の起動前の deck-goto）', known.length, '件');
errs.splice(0, errs.length, ...errs.filter((e) => !known.includes(e)));
ok(errs.length === 0, 'コンソールのエラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} 件の失敗` : 'すべて通過', '→', outdir);
process.exit(fails ? 1 : 0);
