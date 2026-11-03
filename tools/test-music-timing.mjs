// Browser regression: live autoplay keeps musical steps on time (m-score by="measure", 2/4 at ♩=88).
// test-all: serial（音の時刻：AudioContext の予定の時刻を 8 小節にわたって計画と比べる。--jobs が 2 以上でも、最後にほかと重ねずに走らせる）
//   node tools/test-music-timing.mjs
// Onsets are the times passed to OscillatorNode.start on a real AudioContext (its clock, not the wall clock).
// Each must be within 2 ms of the plan (first onset + the measure's planned start + the note's beat), across 8 measures,
// including across a 600 ms main-thread stall in measure 4 and an audio clock that falls 124 ms behind from measure 5.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build } from '../kit/build.mjs';
import { launch } from '../kit/browser.mjs';

const MEASURES = 8, BPM = 88, SPB = 60 / BPM, SPM = 2 * SPB;
const bars = Array.from({ length: MEASURES }, (_, m) => m % 2 ? 'GG GG' : 'GG G2').join(' | ');
const abc = `X:1\nM:2/4\nL:1/8\nQ:1/4=${BPM}\nK:C\n${bars} |]`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'music-timing-'));
const src = path.join(work, 'deck.html');
fs.writeFileSync(src, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Measures</title></head><body><div id="stage">
<section class="slide" id="score"><h2>Score</h2><div class="body"><m-score by="measure" style="height:400px" aria-label="Score"><script type="application/json">${JSON.stringify({ abc }).replace(/</g, '\\u003c')}</script></m-score></div></section>
</div></body></html>`);
const html = build(src, { subset: false, componentsCatalogue: '2' }).html;
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await launch();
  // real: the browser's own audio clock (with a main-thread stall). skewed: an audio clock that starts late from 0
  // and later falls behind (both seen on CI runners), reproduced the same way on every machine.
  for (const scenario of ['real', 'skewed']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((skewed) => {
    window.__onsets = []; window.__steps = [];
    document.addEventListener('deck:pos', (e) => {
      window.__steps.push({ k: e.detail.k, at: performance.now() });
      // A stalled main thread (no frames, no timers) in the middle of measure 4, as a loaded CI runner can do:
      // notes must not depend on a frame arriving shortly before them.
      if (skewed && e.detail.k === 5) window.__skew = .124;
      if (e.detail.k === 4 && !window.__stalled) {
        window.__stalled = true;
        setTimeout(() => { const end = performance.now() + 600; while (performance.now() < end); }, 250);
      }
    });
    // The audio clock can fall behind performance.now() for a moment (a device callback stalls on a loaded runner):
    // from measure 5 on, the context reports a time 124 ms behind. Notes must stay on the grid already scheduled.
    window.__skew = 0;
    // A context that has just resumed reads 0 for a moment, then its clock moves from 0 about 20 ms late (under the
    // 50 ms that renews the mapping), as on Linux and Windows runners. The clock is derived from performance.now() so
    // that this start is the same on every machine; the times recorded below are on it.
    if (skewed) Object.defineProperty(BaseAudioContext.prototype, 'currentTime', { configurable: true, get() {
      if (this.state === 'running' && window.__base === undefined) window.__base = performance.now() + 20;
      if (window.__base === undefined) return 0;
      const t = (performance.now() - window.__base) / 1000;
      return t > 0 ? Math.floor((t - window.__skew) * 375) / 375 : 0;   // 128-sample steps at 48 kHz
    } });
    const start = OscillatorNode.prototype.start, stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function (when) {
      // Each note is two voices (sine + triangle) at one time: keep one onset per time.
      if (this.type === 'sine') window.__onsets.push(this.__onset = { when, at: this.context.currentTime, stops: [] });
      return start.apply(this, arguments);
    };
    // A voice stopped at or before its start never sounds (scheduled ahead, then cancelled and scheduled again).
    OscillatorNode.prototype.stop = function (when) {
      if (this.__onset) this.__onset.stops.push(when);
      return stop.apply(this, arguments);
    };
  }, scenario === 'skewed');
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.DECK && DECK.ready);
  const tl = await page.evaluate(() => DECK.timeline().map((g) => ({ k: g.k, dur: g.dur })));
  assert.equal(tl.length, MEASURES + 1, 'step 0 and one step per measure');
  for (const g of tl.slice(1)) assert.ok(Math.abs(g.dur - SPM) < 1e-5, `measure step lasts ${SPM} s (${g.dur})`);
  // Planned onsets in seconds from the first measure's start: the timeline's step starts plus the beat (eighth = half a beat).
  const plan = [];
  let start = 0;
  tl.slice(1).forEach((g, m) => { for (const b of m % 2 ? [0, .5, 1, 1.5] : [0, .5, 1]) plan.push(start + b * SPB); start += g.dur; });
  // Start on step 0 so that autoplay enters measure 1 through an ordinary forward step; 'a' is a trusted gesture (audio).
  await page.keyboard.press('a');
  await page.waitForFunction((n) => window.__onsets.filter((o) => !o.stops.some((x) => x <= o.when)).length >= n, plan.length, { timeout: (tl.reduce((a, g) => a + g.dur, 0) + 10) * 1000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('autoplay'), null, { timeout: 10000 });
  const onsets = (await page.evaluate(() => window.__onsets)).filter((o) => !o.stops.some((x) => x <= o.when));
  assert.equal(onsets.length, plan.length, `one onset per note (${onsets.length})`);
  // Measure 1 starts at the first onset; every later onset is planned from there.
  const t0 = onsets[0].when;
  const errs = onsets.map((o, n) => (o.when - t0 - plan[n]) * 1000);
  const worst = Math.max(...errs.map(Math.abs));
  console.log(`${scenario}: onset error vs plan (ms): ${errs.map((e) => e.toFixed(2)).join(' ')}`);
  console.log(`${scenario}: worst ${worst.toFixed(2)} ms, last measure ${errs.at(-1).toFixed(2)} ms; ahead of the clock by ${(onsets.reduce((a, o) => Math.min(a, o.when - o.at), Infinity) * 1000).toFixed(1)}..${(onsets.reduce((a, o) => Math.max(a, o.when - o.at), -Infinity) * 1000).toFixed(1)} ms`);
  assert.ok(worst <= 2, `${scenario}: every onset within 2 ms of the plan over ${MEASURES} measures (worst ${worst.toFixed(2)} ms)`);
  // Step changes (wall clock): each within one late timer of the plan, not adding up over the measures.
  const steps = (await page.evaluate(() => window.__steps)).filter((x, n, a) => x.k >= 1 && (n === 0 || a[n - 1].k !== x.k));
  assert.deepEqual(steps.map((x) => x.k), tl.slice(1).map((g) => g.k), 'autoplay visits every measure in order');
  let planned = 0;
  const late = steps.map((x, n) => { const e = x.at - steps[0].at - planned * 1000; planned += tl[n + 1].dur; return e; });
  console.log(`${scenario}: step change vs plan (ms, wall clock): ${late.map((e) => e.toFixed(1)).join(' ')}`);
  // Slow macOS runners fire timers up to ~40 ms late (run 41629700452: -38..+23 ms). The point is that the
  // error does not add up, so allow one late timer per change and check the drift separately.
  assert.ok(Math.max(...late.map(Math.abs)) < 60, `step changes stay within one late timer of the absolute plan (${late.map((e) => e.toFixed(1)).join(' ')})`);
  const half = Math.floor(late.length / 2), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(Math.abs(mean(late.slice(half)) - mean(late.slice(0, half))) < 25, 'step changes do not drift over the measures');
  assert.deepEqual(errors, []);
  console.log(`ok   live autoplay (${scenario} clock): ${plan.length} onsets over ${MEASURES} measures within 2 ms of the plan on the AudioContext clock`);
  await page.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  fs.rmSync(work, { recursive: true, force: true });
}
