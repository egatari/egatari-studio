// 品質チェックの「呼び出し順に依存」の誤検出を調べる：node tools/flake.mjs <built.html> <i> <k> <outdir>
import { launch, fileUrl } from '../kit/browser.mjs';
import fs from 'node:fs';
const [file, i, k, out] = process.argv.slice(2);
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const settle = () => page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
for (let n = 0; n < 4; n++) {
  await page.goto(fileUrl(file)); await page.waitForFunction(() => window.DECK && DECK.ready); await settle();
  await page.evaluate(([i, k]) => DECK.seek(+i, +k, 0.4), [i, k]); await settle();
  const A = await page.screenshot();
  const mx = await page.evaluate(([i]) => DECK.slides[+i]._max, [i]);
  await page.evaluate(([i, m]) => DECK.seek(+i, m, Infinity), [i, mx]); await page.evaluate(([i]) => DECK.seek(+i, 0, Infinity), [i]);
  await page.evaluate(([i, k]) => DECK.seek(+i, +k, 0.4), [i, k]); await settle();
  const B = await page.screenshot();
  const html = await page.evaluate(([i]) => DECK.slides[+i].innerHTML.length, [i]);
  console.log(n, A.equals(B) ? 'same' : 'DIFF', html);
  if (!A.equals(B)) { fs.writeFileSync(`${out}/A${n}.png`, A); fs.writeFileSync(`${out}/B${n}.png`, B); }
}
await b.close();
