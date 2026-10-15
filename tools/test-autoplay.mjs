// 自動再生と発表者ビュー：a で始め、発表者ビューから送ると止まり、ボタンの表示が変わる
//   node tools/test-autoplay.mjs <built.html>
import { launch, fileUrl } from '../kit/browser.mjs';
const file = process.argv[2];
if (!file) { console.error('usage: node tools/test-autoplay.mjs <built.html>'); process.exit(2); }
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = [];
const watch = (pg, name) => {
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  pg.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message));
};
watch(p, '本体');
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready);
const pres = ctx.waitForEvent('page');
await p.keyboard.press('p');
const v = await pres; watch(v, '発表者ビュー');
await v.waitForLoadState('load'); await v.waitForTimeout(1200);
const label = () => v.evaluate(() => document.getElementById('pv-auto').textContent);
const isAuto = () => p.evaluate(() => document.documentElement.classList.contains('autoplay'));
await p.bringToFront(); await p.keyboard.press('a'); await p.waitForTimeout(600);
const got = { autoOn: await isAuto(), buttonOn: await label() };
await v.bringToFront(); await v.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
got.afterArrow = await isAuto(); got.buttonOff = await label();
await v.click('#pv-auto'); await p.waitForTimeout(500);
got.buttonStart = await isAuto();
await v.click('#pv-auto'); await p.waitForTimeout(500);
got.buttonStop = await isAuto();
console.log(JSON.stringify(got));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
ok(got.autoOn === true, 'a で自動再生が始まる');
ok(/^■/.test(got.buttonOn), `自動再生中は発表者ビューのボタンが「■ 停止」（${got.buttonOn}）`);
ok(got.afterArrow === false, '発表者ビューで → を押すと自動再生が止まる');
ok(/^▶/.test(got.buttonOff), `止まるとボタンが「▶ 自動再生」に戻る（${got.buttonOff}）`);
ok(got.buttonStart === true, '発表者ビューのボタンで自動再生が始まる');
ok(got.buttonStop === false, 'もう一度押すと止まる');
// 既知：deck.js が起動前に発表者ビューの iframe から deck-goto を受けると落ちる（test-tools.mjs と同じ扱い）
const known = [];   // 以前の既知の不具合（発表者ビューに届いた命令で _max を読む）は deck.js で直した
if (known.length) console.log('note 既知のエラー（deck.js の起動前の deck-goto）', known.length, '件');
const rest = errs.filter((e) => !known.includes(e));
ok(rest.length === 0, 'コンソールのエラーなし' + (rest.length ? '：' + rest.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} 件の失敗` : 'すべて通過');
process.exit(fails ? 1 : 0);
