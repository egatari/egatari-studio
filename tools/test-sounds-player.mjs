// Browser regression: node tools/test-sounds-player.mjs [--build-only]
// Stubs Web Audio, never outputs actual audio. --build-only verifies the self-contained fixture offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { launch } from '../kit/browser.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sounds-player-'));
const fixture = path.join(work, 'src');
fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), fixture, { recursive: true });
fs.writeFileSync(path.join(fixture, 'deck.html'), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Sound crossings</title></head><body><div id="stage">
<section class="slide" id="sound-one"><h2>Visible timer</h2><m-probe sound-events input-clock data-from="1" style="display:block;width:400px;height:100px"></m-probe></section>
<section class="slide" id="sound-two"><h2>Next slide</h2><p data-step="1">Visible end</p></section></div></body></html>`);
fs.rmSync(path.join(fixture, 'narration.md'), { force: true });
fs.rmSync(path.join(fixture, 'timeline.json'), { force: true });
const html = build(path.join(fixture, 'deck.html'), { subset: false }).html;
const plain = build(path.join(ROOT, 'examples/minimal/deck.html'), { subset: false }).html;
assert.ok(html.includes('DECK.Sounds = {') && html.includes('DECK.SoundPreferences = {'));
assert.ok(!html.includes('import { createMuteSetting'));
console.log('ok   self-contained sound fixture includes synthesis and preference namespaces');
if (process.argv.includes('--build-only')) process.exit(0);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url.startsWith('/plain') ? plain : html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    window.__sound = { contexts: 0, resumes: 0, voices: [] };
    class AudioContext {
      constructor() { window.__sound.contexts++; this.state = 'suspended'; this.sampleRate = 48000; this.destination = {}; }
      get currentTime() { return performance.now() / 1000; }
      resume() { window.__sound.resumes++; return Promise.resolve().then(() => { this.state = 'running'; }); }
      createOscillator() {
        const voice = { freq: 0, stops: [] }; window.__sound.voices.push(voice);
        return { frequency: { setValueAtTime(v) { voice.freq = v; } }, connect() {}, disconnect() {},
          start(t) { voice.start = t; }, stop(t) { voice.stops.push(t); } };
      }
      createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }; }
    }
    window.AudioContext = AudioContext;
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const open = async (query = '') => {
    await page.goto(base + '/sounds' + query);
    await page.waitForFunction(() => window.DECK && DECK.ready);
  };
  const voices = () => page.evaluate(() => __sound.voices.length);
  const forward = () => page.keyboard.press('ArrowRight');
  const reset = () => page.evaluate(() => DECK.go(0, 0, false));
  await open();
  assert.equal(await page.evaluate(() => __sound.contexts), 0);
  await page.evaluate(() => DECK.next()); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => __sound.contexts), 0, 'programmatic playback before gesture stays silent');
  assert.equal(await voices(), 0);
  assert.equal(await page.locator('[data-b="mute"]').count(), 1);
  for (const mode of ['talk', 'learn']) {
    await page.evaluate((m) => { DECK.mode = m; DECK.go(0, 0, false); }, mode);
    const before = await voices(); await forward();
    await page.waitForFunction((n) => __sound.voices.length >= n + 5, before);
    assert.equal(await voices(), before + 5, mode + ': note and bell, unknown ignored');
    const note = await page.evaluate(() => __sound.voices.slice(-5, -3));
    assert.ok(note.every((v) => v.stops.length === 1 && Math.abs(v.stops[0] - v.start - 5) < .05));
    await forward();
    assert.ok((await page.evaluate((n) => __sound.voices.slice(n, n + 2), before)).every((v) => v.stops.length === 1), 'note tails survive forward step');
    const n = await voices(); await page.keyboard.press('ArrowLeft');
    assert.equal(await voices(), n, 'back is silent');
    assert.ok((await page.evaluate((n) => __sound.voices.slice(n, n + 2), before)).every((v) => v.stops.length === 2), 'back stops tails');
  }
  for (const kind of ['jump', 'seek']) {
    await reset(); const n = await voices();
    await page.evaluate((k) => k === 'jump' ? DECK.go(0, 1, true) : DECK.seek(0, 1, .3), kind);
    await page.waitForTimeout(500); assert.equal(await voices(), n, kind);
  }
  await reset(); await forward();
  await page.evaluate(() => DECK.seek(0, 1, .3));
  assert.ok((await page.evaluate(() => __sound.voices.slice(-2))).every((v) => v.stops.length === 2), 'seek stops tails');
  for (const kind of ['print', 'thumbnails']) {
    await reset(); const n = await voices();
    await page.evaluate((k) => {
      if (k === 'print') { window.dispatchEvent(new Event('beforeprint')); DECK.next(); }
      else DECK.aside(() => { DECK.seek(0, 1, .3); });
    }, kind);
    await page.waitForTimeout(500); assert.equal(await voices(), n, kind);
    if (kind === 'print') await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
  // Retiming: extension moves the .2 bell beyond its original crossing; zero note still sounds.
  await reset(); await forward();
  const afterZero = await voices();
  await page.evaluate(() => document.querySelector('m-probe')._ctx.extend(2));
  await page.waitForTimeout(350); assert.equal(await voices(), afterZero);
  await page.waitForFunction((n) => __sound.voices.length === n + 3, afterZero);
  // Keyboard-only toggle; aria-pressed mirrors the saved choice, including reload.
  const mute = page.locator('[data-b="mute"]');
  await mute.focus(); await page.keyboard.press('Space');
  assert.equal(await mute.getAttribute('aria-pressed'), 'true');
  await reset(); const muted = await voices(); await forward(); await page.waitForTimeout(500);
  assert.equal(await voices(), muted);
  await page.reload(); await page.waitForFunction(() => window.DECK && DECK.ready);
  assert.equal(await page.locator('[data-b="mute"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('deck-mute-sounds')), '1');
  await page.locator('[data-b="mute"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => localStorage.getItem('deck-mute-sounds')), '0');
  for (const query of ['?view=follow', '?view=next', '?mode=video', '?presenter=1']) {
    await page.goto(base + '/sounds' + query);
    if (query.includes('presenter')) await page.waitForSelector('#pv-auto');
    else { await page.waitForFunction(() => window.DECK && DECK.ready); await forward(); await page.waitForTimeout(500); }
    assert.equal(await voices(), 0, query);
    assert.equal(await page.evaluate(() => __sound.contexts), 0, query + ': no AudioContext');
  }
  // Open the presenter without a stage gesture; its first step key unlocks stage audio only.
  await open();
  const popupReady = page.waitForEvent('popup');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
  const presenter = await popupReady; await presenter.waitForSelector('#pv-auto');
  assert.equal(await page.evaluate(() => __sound.contexts), 0);
  await presenter.keyboard.press('ArrowRight');
  await page.waitForFunction(() => __sound.voices.length >= 5);
  assert.equal(await presenter.evaluate(() => __sound.contexts), 0, 'presenter gesture unlocks only the stage');
  for (const f of presenter.frames()) {
    if (await f.evaluate(() => !!window.__sound)) assert.equal(await f.evaluate(() => __sound.voices.length), 0);
  }
  await presenter.close();
  await page.goto(base + '/plain'); await page.waitForFunction(() => window.DECK && DECK.ready);
  assert.equal(await page.locator('[data-b="mute"]').count(), 0, 'no control on a lesson without event-capable components');
  assert.deepEqual(errors, []);
  console.log('ok   browser: talk/learn crossings, tails, back/jump/seek, extension, print/thumbnails/presenter/video, lazy audio, accessible mute and persistence');
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
