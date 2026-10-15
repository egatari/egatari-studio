// 組んだ HTML の (i, k) の最終状態を PNG にする：node tools/shot.mjs <built.html> <out.png> <i> <k> [mode]
import { launch, fileUrl } from '../kit/browser.mjs';
const [file, out, i = '0', k = '0', mode = 'talk'] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.error('pageerror:', e.message));
await p.goto(fileUrl(file) + '?mode=' + mode);
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(([i, k]) => DECK.seek(+i, +k, Infinity), [i, k]);
await p.screenshot({ path: out });
await b.close();
