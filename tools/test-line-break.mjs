// 日本語の行の分け方（format spec §8.0。kit/base.css の :root:lang(ja) {line-break: strict}）
//   node tools/test-line-break.mjs <built.html（ja のデッキ）>
// - スライドの本文・字幕・発表者ビューの台本で、計算された line-break が strict
// - 幅を少しずつ変えた狭い箱で：strict では行の初めに「ゃ」「ー」が来ない（loose では来る幅があることも確かめ、試験が効いていることを示す）
// - 「……」「――」・数字の並びが途中で切れないか（知らせ。切れる幅があれば note として出す。CSS だけでは止めない）
import { launch, fileUrl } from '../kit/browser.mjs';

const [file] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-line-break.mjs <built.html>'); process.exit(2); }
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(fileUrl(file) + '#2');
await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
ok(await p.evaluate(() => document.documentElement.lang) === 'ja', 'the deck is Japanese');
ok(await p.evaluate(() => getComputedStyle(document.querySelector('.slide.active .body') || document.querySelector('.slide.active')).lineBreak) === 'strict', 'slide body: line-break strict');
await p.keyboard.press('s'); await p.waitForTimeout(300);
ok(await p.evaluate(() => { const c = document.querySelector('#deck-cap .cap-line'); return !!c && getComputedStyle(c).lineBreak === 'strict'; }), 'captions: line-break strict');
await p.keyboard.press('s');
const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
await pv.waitForFunction(() => document.querySelector('#pv-text p'), null, { timeout: 20000 });
ok(await pv.evaluate(() => getComputedStyle(document.querySelector('#pv-text p')).lineBreak) === 'strict', 'presenter view script: line-break strict');
await pv.close();

// 狭い箱：幅を 1px ずつ変えて、行の初めの字を集める
const starts = (text, lb) => p.evaluate(([text, lb]) => {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;left:0;top:0;z-index:99;font-size:20px;line-height:1.6;background:#fff;line-break:${lb}`;
  d.textContent = text; document.body.appendChild(d);
  const out = new Set();
  for (let w = 40; w <= 400; w++) {
    d.style.width = w + 'px';
    const n = d.firstChild, r = document.createRange();
    let top = null;
    for (let i = 0; i < text.length; i++) {
      r.setStart(n, i); r.setEnd(n, i + 1);
      const rc = r.getClientRects()[0]; if (!rc) continue;
      if (top !== null && rc.top > top + 5) out.add(i);
      top = rc.top;
    }
  }
  d.remove();
  return [...out];
}, [text, lb]);
const T1 = 'あいうえおかきくけこきゃくさしすせそーるたちつてと'.repeat(2);
const bad = (idx, chars) => idx.filter((i) => chars.includes(T1[i]));
const loose = await starts(T1, 'loose'), strict = await starts(T1, 'strict');
ok(bad(loose, 'ゃー').length > 0, `control: with line-break loose some widths start a line with ゃ or ー (${bad(loose, 'ゃー').map((i) => T1[i]).join('')})`);
ok(bad(strict, 'ゃー').length === 0, `strict: no line starts with ゃ or ー at any width from 40 to 400 px (${bad(strict, 'ゃー').map((i) => T1[i]).join('')})`);
const inherited = await starts(T1, 'inherit');
ok(bad(inherited, 'ゃー').length === 0, 'inherited from :root:lang(ja): no line starts with ゃ or ー');
// 知らせ：…… ―― 数字
for (const [name, text, pair] of [['……', 'あいうえおかき……くけこさしす……せそたち'.repeat(2), '…'], ['――', 'あいうえおかき――くけこさしす――せそたち'.repeat(2), '―'], ['digits', 'あいうえおかき123456くけこさしす7890せそたち'.repeat(2), '0123456789']]) {
  const st = await starts(text, 'inherit');
  const split = st.filter((i) => pair.includes(text[i]) && pair.includes(text[i - 1]));
  console.log(`note ${name}: ${split.length ? 'can split inside (' + split.length + ' break positions); not prevented by CSS' : 'never split at any width'}`);
}
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
