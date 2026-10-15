import { launch, fileUrl } from '../kit/browser.mjs';
const [file, outdir] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const tl = await p.evaluate(() => DECK.timeline().map(x => [x.key, +x.anim.toFixed(2), +x.dur.toFixed(2)]));
console.log('timeline', tl.length, JSON.stringify(tl.slice(0, 12)));
const shots = [[0,0,1e9],[1,1,0.2],[2,3,1e9],[4,1,0.6],[4,3,1e9],[3,2,1e9]];
for (const [i,k,t] of shots) {
  await p.evaluate(([i,k,t]) => DECK.seek(i,k,t>1e8?Infinity:t, i-1), [i,k,t]);
  await p.screenshot({ path: `${outdir}/s${i}_${k}_${t>1e8?'end':t}.png` });
}
await p.goto(fileUrl(file) + '?mode=lecture#3');
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => DECK.seek(2, 2, Infinity));
await p.screenshot({ path: `${outdir}/lecture_2_2.png` });
console.log('errors', errs);
await b.close();
