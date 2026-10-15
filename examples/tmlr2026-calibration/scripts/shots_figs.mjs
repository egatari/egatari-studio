// Screenshots + checks for the deck-local figure components (m-points, m-qq, m-bars)
//   node examples/tmlr2026-calibration/scripts/shots_figs.mjs <built deck.html> <out dir> [slideKey …]
// For each slide: every step at t = 0.35·anim, 0.7·anim, end (+ step-2 at fixed times around the cue);
// determinism (fresh seek vs after other seeks: pixel-identical), figure text ≥ 24 px, nothing below 565 px.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('package.json'));
const { launch, fileUrl } = await import('../../../kit/browser.mjs');

const [file, outDir, ...keys0] = process.argv.slice(2);
const keys = keys0.length ? keys0 : ['synthetic', 'learner', 'breaks'];
fs.mkdirSync(outDir, { recursive: true });
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);
const raf2 = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const seek = async (i, k, t) => { await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [i, k, t]); await raf2(); };
const fig = async (i) => p.evaluate((i) => { const c = DECK.slides[i]._comps[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, i);
let bad = 0;
for (const key of keys) {
  const info = await p.evaluate((key) => {
    const i = DECK.slides.findIndex((s) => s._key === key), s = DECK.slides[i], c = s._comps[0];
    const tl = DECK.timeline().filter((x) => x.i === i);
    return { i, max: s._max, anim: tl.map((x) => x.anim), cues: [1, 2].map((k) => c.cues(k)), dur: [1, 2].map((k) => c.duration(k)) };
  }, key);
  console.log(key, JSON.stringify(info));
  const plan = [];
  for (let k = 0; k <= info.max; k++) {
    const a = info.anim[k];
    for (const t of (a > 0 ? [a * 0.35, a * 0.7, null] : [null])) plan.push([k, t]);
  }
  for (const t of [0.6, 1.6, 2.2]) plan.push([2, t]);
  for (const [k, t] of plan) {
    await seek(info.i, k, t);
    await p.screenshot({ path: path.join(outDir, `${key}_k${k}_${t === null ? 'end' : t.toFixed(2)}.png`) });
  }
  // determinism: fresh vs after other seeks
  for (const [k, t] of [[1, 0.5], [2, 1.0], [2, 1.9], [2, null]]) {
    await seek(info.i, k, t); const clip = await fig(info.i);
    const A = await p.screenshot({ clip });
    await seek(info.i, info.max, null); await seek(info.i, 0, null); await seek(info.i, 2, 0.3); await seek(info.i + 1, 0, null);
    await seek(info.i, k, t); const B = await p.screenshot({ clip });
    if (!A.equals(B)) { bad++; console.log(`  ✗ nondeterministic ${key} k${k} t${t}`); }
  }
  // text size and bottom limit, at each step's end
  for (let k = 1; k <= info.max; k++) {
    await seek(info.i, k, null);
    const r = await p.evaluate((i) => {
      const sl = DECK.slides[i], R = sl.getBoundingClientRect(), sc = R.width / 1280, out = [];
      const vis = (e) => { for (let x = e; x && x !== sl; x = x.parentElement) { const o = +(x.getAttribute && x.getAttribute('opacity') || getComputedStyle(x).opacity); if (o < 0.5) return false; } return true; };
      for (const c of sl._comps) for (const e of c.querySelectorAll('text')) {
        if (!e.textContent.trim() || !vis(e)) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize) * (c.getBoundingClientRect().width / c.querySelector('svg').viewBox.baseVal.width) / sc;
        const bb = e.getBoundingClientRect(), bottom = (bb.bottom - R.top) / sc;
        if (fs < 23.5) out.push(`small ${fs.toFixed(1)}px "${e.textContent}"`);
        if (bottom > 565) out.push(`below 565: ${bottom.toFixed(0)} "${e.textContent}"`);
      }
      for (const c of sl._comps) { const b2 = (c.getBoundingClientRect().bottom - R.top) / sc; if (b2 > 565) out.push('figure bottom ' + b2.toFixed(0)); }
      return out;
    }, info.i);
    for (const m of r) { bad++; console.log(`  ✗ ${key} k${k}: ${m}`); }
  }
}
if (errs.length) { bad++; console.log('errors:', errs); }
console.log(bad ? `FAIL (${bad})` : 'OK');
await b.close();
