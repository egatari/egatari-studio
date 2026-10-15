// 全スライドの最終状態を 1 枚の一覧にする：node scripts/sheet.mjs <built.html> <out.png>
import { launch, fileUrl } from '../../../kit/browser.mjs';
const [file, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);
const n = await p.evaluate(() => DECK.slides.length);
const shots = [];
for (let i = 0; i < n; i++) {
  await p.evaluate((i) => DECK.seek(i, DECK.slides[i]._max, Infinity), i);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  shots.push((await p.screenshot()).toString('base64'));
}
const cols = 3, w = 640, h = 360;
await p.setViewportSize({ width: cols * w, height: Math.ceil(n / cols) * h });
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:0;background:#888">${shots.map((s) => `<img style="width:${w}px;height:${h}px;outline:1px solid #888" src="data:image/png;base64,${s}">`).join('')}</body>`);
await p.waitForLoadState('load');
await p.screenshot({ path: out, fullPage: true });
await b.close();
