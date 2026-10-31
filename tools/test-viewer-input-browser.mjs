// Browser regression: node tools/test-viewer-input-browser.mjs [--build-only]
// Uses the REAL locked registry predict/timer, both 1.x and 2.0, and the editor's presenter relay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, buildPortable } from '../kit/build.mjs';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import { launch } from '../kit/browser.mjs';
import { clickCommand } from './click-retry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-input-'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const deck = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Viewer input</title></head><body><div id="stage">
<section class="slide" id="s-input"><h2>Viewer input</h2><div class="body" style="display:flex;gap:24px">
<m-predict style="display:block;width:580px;height:432px"><script type="application/json">{"question":"Choose","choices":[{"label":"A"},{"label":"B"}],"answer":1,"counts":[2,3]}</script></m-predict>
<m-timer style="display:block;width:580px;height:432px"><script type="application/json">{"phases":[{"title":"Discuss","sec":90},{"title":"Compare","sec":2}]}</script></m-timer>
</div></section><section class="slide" id="s-other"><h2>Other slide</h2><p data-step="1">Next</p></section></div></body></html>`;
const built = new Map();
for (const catalogue of ['1', '2']) {
  const dir = path.join(work, catalogue); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'deck.html'), deck);
  fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ componentsCatalogue: catalogue }));
  const r = build(path.join(dir, 'deck.html'), { subset: false });
  for (const name of ['predict', 'timer']) {
    const version = catalogue === '2' ? '2.0.0' : lock.components[name].default;
    const code = fs.readFileSync(path.join(resolveComponent(path, ROOT, lock, name, version), 'index.js'), 'utf8');
    assert.ok(code.includes('egatari-input'), `${name}@${version} is the real input-capable vendored part`);
    assert.equal(r.stats.viewerInputs['m-' + name], true);
    assert.ok(r.html.includes(code.split('\n').find((l) => /static viewerInput/.test(l))));
  }
  assert.equal(r.stats.warn.filter((w) => /refused|not found/.test(w)).length, 0, JSON.stringify(r.stats.warn));
  const portable = await buildPortable(path.join(dir, 'deck.html'), { subset: false });
  for (const name of ['predict', 'timer']) assert.equal(portable.index.components.find((p) => p.name === name).viewerInput, true);
  built.set('/' + catalogue, r.html);
}
console.log('ok   offline fixtures use locked predict/timer 1.x and 2.0; built capability maps and portable index flags');
if (process.argv.includes('--build-only')) process.exit(0);
const dist = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', dist, '--no-single', '--no-examples'], { stdio: 'pipe' });
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local'), html = built.get(u.pathname);
  if (html) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
  const f = path.resolve(dist, '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(dist + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const ready = (f) => f.waitForFunction(() => window.DECK && DECK.ready);
const counts = (f) => f.evaluate(() => document.querySelector('m-predict').counts());
const waitCounts = (f, expected) => f.waitForFunction((v) => JSON.stringify(document.querySelector('m-predict').counts()) === JSON.stringify(v), expected);
const waitTotal = (f, expected) => f.waitForFunction((n) => document.querySelector('m-timer')._ctx.extend(0) === n, expected);
const suite = async (ctx, stage, pv, presenterFrame, label) => {
  await ready(stage);
  await stage.evaluate(() => { DECK.muteSounds(true); DECK.go(0, 1, true); });
  await presenterFrame.waitForSelector('#f-cur');
  const follow = presenterFrame.childFrames().find((f) => /view=follow/.test(f.url())) || await (await presenterFrame.$('#f-cur')).contentFrame();
  const next = await (await presenterFrame.$('#f-next')).contentFrame();
  await ready(follow); await ready(next);
  await follow.waitForFunction(() => DECK.state().step === 1);
  const originalTimeline = await stage.evaluate(() => JSON.stringify(DECK.timeline()));
  // Real field events travel follow -> presenter -> trusted stage, never navigating while typing.
  const field = follow.locator('m-predict .pd-num').first();
  await field.fill('22'); await field.press('ArrowUp'); await field.press('ArrowDown'); await field.press(' ');
  await field.fill(''); await field.pressSequentially('37'); await field.press('ArrowRight'); await field.press('Enter');
  await waitCounts(stage, [37, 3]); await waitCounts(follow, [37, 3]);
  assert.equal(await stage.evaluate(() => DECK.state().step), 1, label + ': field keys do not advance');
  await stage.evaluate(() => document.querySelector('m-predict').input(1, 17));
  await waitCounts(follow, [37, 17]);
  assert.deepEqual(await counts(next), [2, 3], label + ': next pane uses author values');
  await stage.evaluate(() => DECK.next()); await follow.waitForFunction(() => DECK.state().step === 2);
  await waitCounts(stage, [37, 17]); await waitCounts(follow, [37, 17]);
  await stage.evaluate(() => DECK.prev()); await follow.waitForFunction(() => DECK.state().step === 1);
  await waitCounts(stage, [37, 17]); await waitCounts(follow, [37, 17]);
  // Mouse clicks blur the timer's button; the player never restores that focus.
  const plus = follow.locator('m-timer .tm-btn').filter({ hasText: '+1 min' });
  const minus = follow.locator('m-timer .tm-btn').filter({ hasText: '−1 min' });
  await plus.click(); await waitTotal(stage, 60); await waitTotal(follow, 60);
  assert.equal(await follow.evaluate(() => document.activeElement?.classList.contains('tm-btn')), false);
  await minus.click(); await waitTotal(stage, 0); await waitTotal(follow, 0);
  await stage.evaluate(() => document.querySelector('m-timer').extend(60));
  await waitTotal(follow, 60);
  await stage.evaluate(() => DECK.next()); await follow.waitForFunction(() => DECK.state().step === 2);
  await stage.evaluate(() => DECK.prev()); await follow.waitForFunction(() => DECK.state().step === 1);
  await waitTotal(stage, 60); await waitTotal(follow, 60);
  await stage.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.deepEqual(await stage.evaluate(() => [...document.querySelector('m-predict').rows].map((r) => r.val.textContent)), ['2', '3'], 'print uses author counts');
  assert.equal(await stage.evaluate(() => DECK.stepExtension()), 0, 'print uses author timing');
  await stage.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await waitCounts(stage, [37, 17]); await waitTotal(stage, 60);
  assert.equal(await stage.evaluate(() => JSON.stringify(DECK.timeline())), originalTimeline, 'authored timeline is unchanged');
  assert.equal(await stage.evaluate(() => document.querySelector('m-timer').duration(1)), 90);
  // Same-slide jumps must reset the follow copy too (the slide index alone is insufficient).
  await stage.evaluate(() => DECK.go(0, 1, true));
  await waitCounts(stage, [2, 3]); await waitCounts(follow, [2, 3]); await waitTotal(stage, 0); await waitTotal(follow, 0);
  await field.fill('14'); await field.press('Enter'); await waitCounts(stage, [14, 3]);
  await stage.evaluate(() => DECK.go(1, 0, false)); await follow.waitForFunction(() => DECK.state().slide === 2);
  await stage.evaluate(() => DECK.prev()); await follow.waitForFunction(() => DECK.state().slide === 1);
  await waitCounts(stage, [2, 3]); await waitCounts(follow, [2, 3]);
  // A short second phase really keeps running beyond its authored duration after extension.
  await stage.evaluate(() => DECK.go(0, 2, true)); await follow.waitForFunction(() => DECK.state().step === 2);
  await plus.click(); await waitTotal(stage, 60); await waitTotal(follow, 60);
  await pv.waitForTimeout(2300);
  assert.ok(await stage.evaluate(() => { const c = document.querySelector('m-timer'); return c._t > 2 && c._t < 62; }));
  await stage.evaluate(() => DECK.go(0, 1, true)); await follow.waitForFunction(() => DECK.state().step === 1);
  // Digits on a timer button do not change its value or get assigned to its controls.
  await plus.focus(); await plus.press('4'); await waitTotal(stage, 0);
  assert.equal(await follow.evaluate(() => DECK.state().step), 1);
  // Space after a mouse timer click advances rather than clicking the button again.
  await plus.click(); await waitTotal(stage, 60); await pv.keyboard.press('Space');
  await stage.waitForFunction(() => DECK.state().step === 2);
  console.log('ok   ' + label + ': forwarding, mirroring, keys/focus, persistence, jump/entry reset and extended live clock');
};
try {
  browser = await launch();
  for (const catalogue of ['1', '2']) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'no-preference' });
    ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    const stage = await ctx.newPage(); await stage.goto(base + '/' + catalogue); await ready(stage);
    const [pv] = await Promise.all([ctx.waitForEvent('page'), stage.keyboard.press('p')]);
    await pv.waitForLoadState(); await pv.setViewportSize({ width: 1600, height: 960 });
    await suite(ctx, stage, pv, pv.mainFrame(), 'built ' + catalogue);
    // Outside a part, digits followed by Enter still select a page.
    await stage.bringToFront(); await stage.locator('#stage').click({ position: { x: 10, y: 10 } });
    await stage.keyboard.press('2'); await stage.keyboard.press('Enter');
    await stage.waitForFunction(() => DECK.state().slide === 2);
    await ctx.close();
    const videoCtx = await browser.newContext(); const video = await videoCtx.newPage();
    await video.goto(base + '/' + catalogue + '?mode=video'); await ready(video);
    const [vp] = await Promise.all([videoCtx.waitForEvent('page'), video.keyboard.press('p')]);
    await vp.waitForLoadState(); await vp.waitForSelector('#f-cur');
    await vp.evaluate(() => opener.postMessage({ type: 'deck-cmd', cmd: 'input', input: { type: 'input', key: 's-input:0', id: 0, value: 77 } }, '*'));
    await vp.evaluate(() => opener.postMessage({ type: 'deck-cmd', cmd: 'input', input: { type: 'input', key: 's-input:1', id: 'extend', value: 60 } }, '*'));
    await video.waitForTimeout(200);
    assert.deepEqual(await counts(video), [2, 3]); assert.equal(await video.evaluate(() => DECK.stepExtension()), 0);
    assert.equal(await video.locator('.pd-num,.tm-btn').count(), 0);
    await videoCtx.close();
  }
  // The app wraps the presenter in #pf and relays through its parent, just like test-input-focus #4 A.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const app = await ctx.newPage(); await app.goto(base + '/'); await app.waitForSelector('#drop');
  await app.evaluate(async (deck) => {
    const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('input-fixture', { create: true });
    for (const [name, text] of Object.entries({ 'deck.html': deck, 'egatari.json': '{"componentsCatalogue":"2"}' })) {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
    }
    await window.__APP_TEST_OPEN(dir);
  }, deck);
  const stage = await (await app.waitForSelector('#preview')).contentFrame(); await ready(stage);
  const [pv] = await Promise.all([ctx.waitForEvent('page'), clickCommand(app, '#b-presenter')]);
  await pv.waitForLoadState(); await pv.setViewportSize({ width: 1600, height: 960 });
  const pf = await (await pv.waitForSelector('#pf')).contentFrame();
  await suite(ctx, stage, pv, pf, 'editor relay 2.0');
  await ctx.close();
  assert.deepEqual(errors, [], 'no browser exceptions');
} finally { if (browser) await browser.close(); await new Promise((r) => server.close(r)); }
