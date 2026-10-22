// Egatari Play: count taps on the page's Live controls that the browser hands to the lesson's frame instead (docs/play.md "Layout").
// Not part of npm test (it takes minutes and is meant to run several copies at once to load the machine):
//   node tools/play-tap-measure.mjs <work dir> [--n 15] [--cases join,poll-portrait,poll-slack,poll-strip,poll-overlay,rotate,leave (also: poll-wide)] [--shots <dir>]
// Each case opens a new browser context, opens a Live lesson (a test room: tools/live-fake-server.mjs) and taps right away, as fast as
// Playwright can (it waits only for the control to be visible and stable). A tap counts as missed when the page does not receive the
// click; the frame's own listener tells whether the lesson got it. Prints one JSON line per case: {case, taps, missed, toFrame, slide}.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay } from './build-play.mjs';
import { startFakeLive } from './live-fake-server.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const W = path.resolve(args[0] || 'tap-measure');
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--n', 15);
const CASES = opt('--cases', 'join,poll-portrait,poll-slack,poll-strip,poll-overlay,rotate,leave').split(',');
const SHOTS = opt('--shots', '');
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const deckDir = path.join(W, 'deck'); fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true });
const deck = path.join(deckDir, 'deck.html'); await buildPortable(deck, {});
const fake = await startFakeLive();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const POLL_STEP = '何を最小化するか:0';
const cfg = path.join(deckDir, FORMAT.CONFIG_FILE); const c0 = JSON.parse(fs.readFileSync(cfg, 'utf8'));
fs.writeFileSync(cfg, JSON.stringify({ ...c0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: { '*': [{ id: 'qa', kind: 'qa' }], [POLL_STEP]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'] }] } } } }));
const now = Date.now();
const html = (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: { v: 1, endpoint: fake.endpoint, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(now - 60e3), to: iso(now + 3600e3) } } })).html;
const FIX = path.join(W, 'live.play.ega.html'); fs.writeFileSync(FIX, html);
const OUT = path.join(W, '_play'); await buildPlay({ out: OUT, endpoints: [fake.endpoint], devLoopback: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = new URL(q.url, 'http://x').pathname; if (p.endsWith('/')) p += 'index.html'; const f = path.join(OUT, p); if (!f.startsWith(OUT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(40); } return false; };

const SIZE = { join: [844, 390], 'poll-portrait': [375, 667], 'poll-wide': [1280, 800], 'poll-slack': [844, 390], 'poll-strip': [667, 375], 'poll-overlay': [667, 375], rotate: [375, 667], leave: [844, 390] };
async function session(c) {
  const [w, h] = SIZE[c];
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL0 + (c === 'poll-strip' ? '?noslack=strip' : ''));   // the overlay is the default (play/main.js NO_SLACK_VARIANT) await p.waitForSelector('html[data-ready]');
  await p.evaluate(() => { window.__clicks = []; document.addEventListener('click', (e) => window.__clicks.push(e.target.closest('[id]') ? e.target.closest('[id]').id : e.target.tagName), true); });
  await p.setInputFiles('#file', FIX);
  return { ctx, p };
}
async function frameOf(p) {
  await p.waitForSelector('#lesson');
  const f = await (await p.$('#lesson')).contentFrame();
  await until(() => f.evaluate(() => !!(window.DECK && DECK.ready)), 15000);
  await f.evaluate(() => { window.__fclicks = 0; window.addEventListener('click', () => { window.__fclicks++; }, true); });
  return f;
}
// one tap: did the page get it? (else: did the frame?)
async function tap(p, f, sel, id) {
  const before = await p.evaluate(() => window.__clicks.length), fb = f ? await f.evaluate(() => window.__fclicks) : 0;
  await p.click(sel);   // no pause before or after: the next tap follows as soon as its control is visible and stable
  const got = await p.evaluate(([n, want]) => window.__clicks.slice(n).some((x) => x === want), [before, id]);
  const toFrame = f ? (await f.evaluate(() => window.__fclicks)) > fb : false;
  return { got, toFrame };
}
const slideOf = (f) => f.evaluate(() => { const s = document.getElementById('stage'); if (!s) return null; const r = s.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });

const results = {};
for (const c of CASES) {
  const R = results[c] = { case: c, taps: 0, missed: 0, toFrame: 0, byControl: {}, slide: null, slideAfter: null };
  const count = (name, t) => { R.taps++; const b = R.byControl[name] = R.byControl[name] || { taps: 0, missed: 0 }; b.taps++; if (!t.got) { R.missed++; b.missed++; } if (t.toFrame && !t.got) R.toFrame++; };
  for (let i = 0; i < N; i++) {
    const { ctx, p } = await session(c);
    await p.waitForSelector('#live-start', { state: 'visible' });
    if (c === 'join') {
      count('join', await tap(p, null, '#b-start-join', 'b-start-join'));
      await ctx.close(); continue;
    }
    await p.click('#b-start-join');
    const f = await frameOf(p);
    await until(() => p.evaluate(() => window.__play.state().live && window.__play.state().live.state === 'connected'));
    if (!R.slide) R.slide = await slideOf(f);
    if (c === 'leave') { count('leave', await tap(p, f, '#b-leave', 'b-leave')); await ctx.close(); continue; }
    if (c === 'rotate') {
      await p.setViewportSize({ width: 844, height: 390 });
      count('leave after rotation', await tap(p, f, '#b-leave', 'b-leave'));
      if (!R.slideAfter) R.slideAfter = await slideOf(f);
      await ctx.close(); continue;
    }
    await f.evaluate(() => DECK.go(1, 0));
    if (c !== 'poll-portrait' && c !== 'poll-wide') { await p.waitForSelector('#b-poll', { state: 'visible' }); count('poll button (indicator)', await tap(p, f, '#b-poll', 'b-poll')); }
    await p.waitForSelector('#live fieldset[data-poll="p1"] input[value="1"]', { state: 'visible' });
    if (SHOTS && i === 0) await p.screenshot({ path: path.join(SHOTS, `poll-${c}.png`) });
    // the choice's whole row (its label) is the target: tap the row, away from the radio itself
    count('poll choice', await tap(p, f, '#live fieldset[data-poll="p1"] label:has(input[value="1"]) span', 'live-polls'));
    if (!(await p.isChecked('#live fieldset[data-poll="p1"] input[value="1"]'))) R.notChecked = (R.notChecked || 0) + 1;
    count('poll vote', await tap(p, f, '#live fieldset[data-poll="p1"] button.vote', 'live-polls'));
    if (c === 'poll-strip' || c === 'poll-overlay') { count('back', await tap(p, f, '#b-poll-back', 'b-poll-back')); count('leave', await tap(p, f, '#b-leave', 'b-leave')); }
    await ctx.close();
  }
  console.log(JSON.stringify(R));
}
await browser.close(); srv.close(); await fake.close();
