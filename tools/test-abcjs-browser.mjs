// Browser required. Run: node tools/test-abcjs-browser.mjs
// test-all: part of test-abcjs-browser
// Fixture widths intentionally differ from Studio's 1100 default: exact fixture parity uses
// their recorded options. Default-width CLI/editor parity is checked separately for every tune.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from '../kit/browser.mjs';
import { build, nodeEnv } from '../kit/build.mjs';
import { build as coreBuild } from '../kit/core/build-core.mjs';
import { exportPortable } from '../kit/core/portable.mjs';
import { ABCJS_OPTIONS, renderScore } from '../kit/core/abcjs.mjs';
import { ROOT, fixtures, scoreDeck, scoreData } from './test-abcjs-fixtures.mjs';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abcjs-browser-'));
const site = path.join(tmp, 'site'), src = path.join(tmp, 'deck.html');
const markup = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/egatari-spec/schema/rendered-markup-1.json'), 'utf8'));
const opts = { subset: false, noAudio: true, componentsCatalogue: '2' };
let browser, server;
try {
  fs.writeFileSync(path.join(tmp, 'egatari.json'), JSON.stringify({ componentsCatalogue: '2' }));
  const defaults = {};
  browser = await launch();
  const inspect = await browser.newPage();
  const tagsAndCheck = (svg) => inspect.evaluate(({ svg, markup }) => {
    const doc = new DOMParser().parseFromString(svg, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root || root.localName !== 'svg') throw new Error('invalid SVG');
    const tags = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.namespaceURI !== 'http://www.w3.org/2000/svg' || !Object.hasOwn(markup.elements.svg, el.localName)) throw new Error('unlisted element ' + el.localName);
      for (const a of el.attributes) {
        if (a.name === 'xmlns' && a.value === el.namespaceURI) continue;
        const allowed = [...markup.global.svg, ...markup.elements.svg[el.localName]];
        if (a.name.startsWith('data-')) {
          if (!new RegExp(markup.values['data-*'].name).test(a.name) || !new RegExp(markup.values['data-*'].value).test(a.value)) throw new Error('invalid data attribute');
        } else if (!allowed.includes(a.name)) throw new Error('unlisted attribute ' + a.name);
        if (a.name === 'id' && !new RegExp(markup.values.id).test(a.value)) throw new Error('invalid id');
        if (Array.isArray(markup.values[a.name]) && !markup.values[a.name].includes(a.value)) throw new Error('invalid value ' + a.name);
        if (a.name === 'style') {
          const length = new RegExp(markup.values.length);
          for (const p of el.style) {
            if (el.style.getPropertyPriority(p)) throw new Error('style priority is not admitted');
            const v = el.style.getPropertyValue(p).trim(), sh = markup.style.shorthands[p], xs = v.split(/\s+/);
            if (!(markup.style.lengths.includes(p) && length.test(v)) && !(markup.style.keywords[p] || []).includes(v)
              && !(sh && xs.length <= sh.max && xs.every((x) => length.test(x) || (sh.keywords || []).includes(x)))) throw new Error('unlisted style ' + p);
          }
        }
        if (/^data-(note|beam|measure|arc)$/.test(a.name)) tags.push([el.localName, a.name, a.value]);
      }
    }
    if (root.querySelector('text, tspan, title, style')) throw new Error('abcjs text or style remains');
    return tags;
  }, { svg, markup });
  for (const [name, f] of Object.entries(fixtures)) {
    fs.writeFileSync(src, scoreDeck(f.abc));
    // The CLI DOM helper, with the exact settings used by the component's fixture generator.
    const env = { ...nodeEnv, abcjs: { ...nodeEnv.abcjs, defaults: f.renderers.abcjs.options } };
    const r = coreBuild(env, src, opts), data = scoreData(r.html);
    assert.deepEqual(data.abcMap, f.abcMap, name + ': fixture map (including boxes)');
    assert.equal(data.abcSvg, f.abcSvg, name + ': fixture SVG bytes');
    assert.deepEqual(await tagsAndCheck(data.abcSvg), await tagsAndCheck(f.abcSvg), name + ': data tags');
    assert.deepEqual(data.renderers, f.renderers);
    assert.equal(coreBuild(env, src, opts).html, r.html, name + ': stable build bytes');
    const normal = build(src, opts);
    defaults[name] = scoreData(normal.html);
    assert.deepEqual(defaults[name].renderers.abcjs.options, ABCJS_OPTIONS);
    assert.ok(!normal.stats.warn.some((w) => /abcjs/.test(w)), normal.stats.warn.join('\n'));
    await tagsAndCheck(defaults[name].abcSvg);
    console.log(name + ': exact fixture map, SVG, tags, renderer options and stable bytes: ok');
  }
  const portable = await exportPortable(nodeEnv, src, { ...opts, fromFolder: false });
  assert.deepEqual(portable.index.components.find((p) => p.name === 'score').renderers.abcjs, defaults.ties.renderers.abcjs);
  // Extra text, unsafe style and unlisted attributes are normalized at the build boundary.
  await inspect.addScriptTag({ path: path.join(ROOT, 'node_modules/abcjs/dist/abcjs-basic.js') });
  const extras = fixtures.doremi.abc.replace('M:4/4', 'T:Hidden title\nM:4/4').replace('C D E F', '"C"!p!C D E F') + '\nw: one two three four';
  const cleaned = await inspect.evaluate(renderScore, { abc: extras, options: ABCJS_OPTIONS, markup });
  await tagsAndCheck(cleaned.Svg);
  // Inject hostile output into abcjs, so sanitizer checks do not just mirror normal abcjs output.
  await inspect.evaluate(() => {
    const original = ABCJS.renderAbc;
    ABCJS.renderAbc = (...args) => {
      const tunes = original(...args), svg = args[0].querySelector('svg');
      svg.setAttribute('onclick', 'alert(1)'); svg.setAttribute('fill', 'url(https://invalid/)');
      svg.setAttribute('style', 'width:10px;color:red;height:20px!important;background:url(https://invalid/)');
      const bad = document.createElementNS(svg.namespaceURI, 'foreignObject'); svg.appendChild(bad);
      return tunes;
    };
  });
  const safe = await inspect.evaluate(renderScore, { abc: fixtures.doremi.abc, options: ABCJS_OPTIONS, markup });
  await tagsAndCheck(safe.Svg);
  assert.ok(!/onclick|foreignObject|https:|color:|background/.test(safe.Svg));

  // Exercise the actual app bundle: Worker -> RPC -> main-thread DOM, plus main-thread exports.
  execFileSync(process.execPath, ['tools/build-app.mjs', '--out', site, '--no-examples'], { cwd: ROOT, stdio: 'pipe' });
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(site, rel);
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!window.__APP_TEST_OPEN);
  // Deliberately hostile editor CSS must not affect score coordinates.
  await page.addStyleTag({ content: 'svg text { font-size:99px!important }' });
  for (const [name, f] of Object.entries(fixtures)) {
    assert.equal(await page.evaluate(async ({ deck, name }) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('score-' + name, { create: true });
      for (const [file, text] of Object.entries({ 'deck.html': deck, 'egatari.json': '{"componentsCatalogue":"2"}' })) {
        const w = await (await dir.getFileHandle(file, { create: true })).createWritable(); await w.write(text); await w.close();
      }
      return window.__APP_TEST_OPEN(dir);
    }, { deck: scoreDeck(f.abc), name }), true);
    await page.waitForFunction(() => {
      const p = document.getElementById('preview');
      // sandboxed preview is read via Playwright below; wait for successful worker build here.
      return p && window.__APP_TEST.state().builds > 0 && !window.__APP_TEST.state().error;
    });
    const preview = page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
    assert.ok(preview, 'preview frame exists');
    await preview.waitForFunction(() => !!document.querySelector('m-score [data-note]'));
    assert.equal(await page.evaluate(() => window.__APP_TEST.buildWorkerProbe('ABCJS')), null, 'abcjs is absent from the DOM-free worker');
    const workerData = await preview.evaluate(() => JSON.parse(document.querySelector('m-score > script[type="application/json"]').textContent));
    assert.deepEqual(workerData, defaults[name], name + ': worker RPC equals CLI');
    const direct = scoreData(await page.evaluate(() => window.__APP_TEST.build({ subset: false, noAudio: true })));
    assert.deepEqual(direct, defaults[name], name + ': main-thread export engine equals CLI');
    assert.ok(!(await page.evaluate(() => window.__APP_TEST.state().warn)).some((w) => /abcjs/.test(w)));
  }
  // The self-contained editor must also carry the renderer, with no asset fetch.
  const single = await browser.newPage();
  await single.goto(fileUrl(path.join(site, 'editor.html')));
  await single.waitForFunction(() => !!window.__APP_TEST_OPEN);
  const singleHtml = await single.evaluate(async (deck) => {
    // Open a minimal folder-shaped handle; no file picker or origin-specific OPFS required.
    const texts = { 'deck.html': deck, 'egatari.json': '{"componentsCatalogue":"2"}' };
    const handle = { kind: 'directory', name: 'score', async *entries() {
      for (const [name, value] of Object.entries(texts)) yield [name, { kind: 'file', name, getFile: async () => new File([value], name, { lastModified: 1 }) }];
    }, getDirectoryHandle: async () => { throw new DOMException('missing', 'NotFoundError'); }, getFileHandle: async (name) => {
      if (!Object.hasOwn(texts, name)) throw new DOMException('missing', 'NotFoundError');
      return { kind: 'file', name, getFile: async () => new File([texts[name]], name, { lastModified: 1 }) };
    } };
    await window.__APP_TEST_OPEN(handle);
    return window.__APP_TEST.build({ subset: false, noAudio: true });
  }, scoreDeck(fixtures.rhythm.abc));
  assert.deepEqual(scoreData(singleHtml), defaults.rhythm, 'single-file editor renderer equals CLI');
  console.log('portable index, markup normalization, editor Worker RPC, export engine and single-file editor: ok');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
