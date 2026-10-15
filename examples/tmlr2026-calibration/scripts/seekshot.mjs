// 1 枚を (k, t) で撮る：node scripts/seekshot.mjs <built.html> <out.png> <slideKey> <k> <t|inf>
import { launch, fileUrl } from '../../../kit/browser.mjs';
const [file, out, key, k, t] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(([key, k, t]) => { const i = DECK.slides.findIndex((s) => s._key === key); DECK.seek(i, +k, t === 'inf' ? Infinity : +t); }, [key, k, t]);
await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.screenshot({ path: out });
await b.close();
