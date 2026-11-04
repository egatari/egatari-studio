// Diagnostic only (branch v0.6.4-timing4-diag): why is autoplay's 4th step change late on macOS runners?
// Same deck and scenario as tools/test-music-timing.mjs ('real' clock, 600 ms stall in measure 4), N runs, each in a new browser.
// Per step: the planned boundary, the step timer's due and fire times, the step change, the toolbar's class changes,
// long tasks, and (from a Chrome trace) what the renderer main thread and the compositor/GPU threads did before each change.
//   node tools/_diag-timing.mjs [runs] [outdir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build } from '../kit/build.mjs';
import { launch } from '../kit/browser.mjs';

const RUNS = Number(process.argv[2] || 4), OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
fs.mkdirSync(OUT, { recursive: true });
const MEASURES = 8, BPM = 88;
const bars = Array.from({ length: MEASURES }, (_, m) => m % 2 ? 'GG GG' : 'GG G2').join(' | ');
const abc = `X:1\nM:2/4\nL:1/8\nQ:1/4=${BPM}\nK:C\n${bars} |]`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'music-diag-'));
const src = path.join(work, 'deck.html');
fs.writeFileSync(src, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Measures</title></head><body><div id="stage">
<section class="slide" id="score"><h2>Score</h2><div class="body"><m-score by="measure" style="height:400px" aria-label="Score"><script type="application/json">${JSON.stringify({ abc }).replace(/</g, '\\u003c')}</script></m-score></div></section>
</div></body></html>`);
const html = build(src, { subset: false, componentsCatalogue: '2' }).html;
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const NOTOOLBAR = process.env.DIAG_NO_TOOLBAR === '1';

for (let run = 0; run < RUNS; run++) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((noToolbar) => {
    window.__steps = []; window.__timers = []; window.__cb = []; window.__long = []; window.__raf = [];
    const st = window.setTimeout;
    window.setTimeout = function (fn, d, ...a) {
      if (!(d >= 400) || typeof fn !== 'function') return st.apply(this, arguments);
      const rec = { set: performance.now(), d, due: performance.now() + d, src: String(fn).slice(0, 60) };
      window.__timers.push(rec);
      return st.call(this, function () { rec.fire = performance.now(); try { return fn.apply(this, arguments); } finally { rec.end = performance.now(); } }, d, ...a);
    };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
    (function f(t) { window.__raf.push(t); requestAnimationFrame(f); })(0);
    new MutationObserver((ms) => { for (const m of ms) if (m.target.id === 'dt-cb') window.__cb.push({ at: performance.now(), show: m.target.classList.contains('show') }); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (noToolbar) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#dt-cb{transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'; document.head.appendChild(s); });
    document.addEventListener('deck:pos', (e) => {
      const at = performance.now();
      window.__steps.push({ k: e.detail.k, at });
      performance.mark('step-' + e.detail.k);
      if (e.detail.k === 4 && !window.__stalled) {
        window.__stalled = true;
        setTimeout(() => { const end = performance.now() + 600; while (performance.now() < end); }, 250);
      }
    });
  }, NOTOOLBAR);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.DECK && DECK.ready);
  const tl = await page.evaluate(() => DECK.timeline().map((g) => ({ k: g.k, dur: g.dur })));
  const tracePath = path.join(OUT, `trace-${run}.json`);
  await browser.startTracing(page, { path: tracePath, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8', 'toplevel', 'cc', 'viz', 'gpu', 'benchmark', 'disabled-by-default-devtools.timeline.frame'] });
  await page.evaluate(() => performance.mark('sync'));
  const syncPerf = await page.evaluate(() => performance.getEntriesByName('sync')[0].startTime);
  const pressAt = await page.evaluate(() => performance.now());
  await page.keyboard.press('a');
  await page.waitForFunction(() => !document.documentElement.classList.contains('autoplay'), null, { timeout: 30000 });
  await browser.stopTracing();
  const d = await page.evaluate(() => ({ steps: window.__steps, timers: window.__timers, cb: window.__cb, long: window.__long, raf: window.__raf, mount: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd }));
  await browser.close();

  const steps = d.steps.filter((x, n, a) => x.k >= 1 && (n === 0 || a[n - 1].k !== x.k));
  const planned = steps.map((_, n) => tl.slice(1, n + 1).reduce((a, g) => a + g.dur, 0) * 1000);
  const t0 = steps[0].at;
  const late = steps.map((x, n) => x.at - t0 - planned[n]);
  console.log(`\n=== run ${run}${NOTOOLBAR ? ' (toolbar without transition/backdrop)' : ''}: step 0 ${(tl[0].dur * 1000).toFixed(0)} ms; 'a' pressed ${(pressAt - (d.mount || 0)).toFixed(0)} ms after DOMContentLoaded; step 1 change at ${(t0 - pressAt).toFixed(0)} ms after 'a'`);
  console.log(`late (ms, vs step 1): ${late.map((e) => e.toFixed(1)).join(' ')}`);
  console.log(`toolbar class changes (ms after step 1 change): ${d.cb.map((c) => (c.at - t0).toFixed(0) + (c.show ? '+' : '-')).join(' ')}`);
  console.log(`timers >= 400 ms (due rel. step 1 / fire late / callback ms): ${d.timers.filter((t) => t.fire !== undefined && t.due > t0 - 2000).map((t) => `[${(t.due - t0).toFixed(0)} +${(t.fire - t.due).toFixed(1)} ${(t.end - t.fire).toFixed(1)} d=${t.d.toFixed(0)}]`).join(' ')}`);
  console.log(`long tasks (start rel. step 1, dur): ${d.long.filter((l) => l.start > t0 - 2000).map((l) => `${(l.start - t0).toFixed(0)}/${l.dur.toFixed(0)}`).join(' ')}`);
  // Frame gaps over 40 ms near each boundary
  const raf = d.raf.filter((t) => t > 0);
  steps.forEach((x, n) => {
    const b = t0 + planned[n], gaps = [];
    for (let i = 1; i < raf.length; i++) if (raf[i] > b - 400 && raf[i - 1] < x.at + 50 && raf[i] - raf[i - 1] > 40) gaps.push(`${(raf[i - 1] - b).toFixed(0)}..${(raf[i] - b).toFixed(0)}`);
    if (gaps.length) console.log(`  step ${n + 1}: frame gaps > 40 ms around the boundary (ms rel. planned boundary): ${gaps.join(' ')}`);
  });

  // Trace: what each renderer/GPU/browser thread did in the 300 ms before each step change.
  let trace;
  try { trace = JSON.parse(fs.readFileSync(tracePath, 'utf8')); } catch (e) { console.log('trace unreadable', e.message); continue; }
  const ev = trace.traceEvents || trace;
  const names = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const pnames = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'process_name') pnames.set(e.pid, e.args.name);
  const sync = ev.find((e) => e.name === 'sync' && e.cat && e.cat.includes('user_timing'));
  if (!sync) { console.log('no sync mark in trace'); continue; }
  const toPerf = (ts) => ts / 1000 - sync.ts / 1000 + syncPerf;   // trace µs → page performance.now() ms
  const X = ev.filter((e) => e.ph === 'X' && e.dur >= 3000);
  steps.forEach((x, n) => {
    const b = t0 + planned[n];
    const lo = Math.min(b, x.at) - 300, hi = x.at + 5;
    const hits = X.filter((e) => { const s = toPerf(e.ts), f = s + e.dur / 1000; return f > lo && s < hi; });
    const byThread = new Map();
    for (const e of hits) {
      const th = `${pnames.get(e.pid) || e.pid}/${names.get(`${e.pid}:${e.tid}`) || e.tid}`;
      if (!byThread.has(th)) byThread.set(th, []);
      byThread.get(th).push(`${e.name}@${(toPerf(e.ts) - b).toFixed(0)}+${(e.dur / 1000).toFixed(0)}`);
    }
    console.log(`  step ${n + 1} (late ${late[n].toFixed(1)} ms), events >= 3 ms from 300 ms before the boundary to the change (ms rel. planned boundary):`);
    for (const [th, l] of byThread) console.log(`    ${th}: ${l.slice(0, 14).join(' ')}${l.length > 14 ? ` (+${l.length - 14})` : ''}`);
  });
}
server.close();
fs.rmSync(work, { recursive: true, force: true });
console.log(`traces in ${OUT}`);
