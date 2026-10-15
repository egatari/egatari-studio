// 組んだ HTML を PDF にする（ブラウザの印刷と同じ。各スライドの最終状態が 1 ページずつ）：node tools/pdf.mjs <built.html> <out.pdf>
import { launch, fileUrl } from '../kit/browser.mjs';
const [file, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
await p.pdf({ path: out, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
await b.close();
