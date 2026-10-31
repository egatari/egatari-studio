// test-all: unit
// Core integration and failure paths without a browser; the DOM adapter is tested in test-abcjs-browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngine } from '../app/engine.js';
import { nodeEnv } from '../kit/build.mjs';
import { build } from '../kit/core/build-core.mjs';
import { exportPortable } from '../kit/core/portable.mjs';
import { PLAYER_JSON, PLAYER_LOCK, PLAYER_FILES } from '../kit/core/player.mjs';
import { ABCJS_OPTIONS, renderScore } from '../kit/core/abcjs.mjs';
import { ROOT, fixtures, scoreDeck, scoreData } from './test-abcjs-fixtures.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abcjs-core-'));
try {
  let source, removed = false;
  const sentinel = new Error('stop before DOM drawing');
  assert.throws(() => renderScore({ abc: 'X:1\nT:Hidden\nQ:1/4=96\nK:C\nC', options: ABCJS_OPTIONS }, {
    renderAbc: (_, abc) => { source = abc; throw sentinel; },
  }, { createElement: () => ({ remove() { removed = true; } }), body: { appendChild() {} } }), (e) => e === sentinel);
  assert.ok(source.includes('%%printtempo false\nQ:1/4=96'));
  assert.ok(!source.includes('T:Hidden')); assert.ok(removed);
  const file = path.join(dir, 'deck.html'), f = fixtures.rhythm;
  fs.writeFileSync(file, scoreDeck(f.abc));
  const opts = { componentsCatalogue: '2', subset: false, noAudio: true };
  let calls = 0;
  const abcjs = { version: '6.7.2', defaults: ABCJS_OPTIONS, render(src, options) {
    calls++; assert.equal(src, f.abc); assert.deepEqual(options, ABCJS_OPTIONS);
    return { Svg: f.abcSvg, Map: f.abcMap };
  } };
  const env = { ...nodeEnv, abcjs };
  const r = build(env, file, opts), data = scoreData(r.html);
  assert.equal(calls, 1); assert.equal(data.abcSvg, f.abcSvg); assert.deepEqual(data.abcMap, f.abcMap);
  assert.deepEqual(data.renderers.abcjs, { version: '6.7.2', options: ABCJS_OPTIONS });
  assert.deepEqual(r.stats.parts.find((p) => p.name === 'score').renderers, data.renderers);
  assert.equal(build(env, file, opts).html, r.html);
  assert.ok(!r.html.includes('function renderScore('));
  const portable = await exportPortable(env, file, { ...opts, fromFolder: false });
  assert.deepEqual(portable.index.components.find((p) => p.name === 'score').renderers, data.renderers);
  const absent = build({ ...nodeEnv, abcjs: null }, file, opts);
  assert.equal(scoreData(absent.html).abcSvg, undefined);
  assert.ok(absent.stats.warn.some((w) => /abcjs renderer is not available/.test(w)));
  const broken = build({ ...nodeEnv, abcjs: { ...abcjs, render() { throw new Error('bad ABC'); } } }, file, opts);
  assert.deepEqual(scoreData(broken.html), { abc: f.abc });
  assert.ok(broken.stats.warn.some((w) => /abcjs.*bad ABC.*left unrendered/.test(w)));
  // Capture just the repository resources used by this deck, then exercise the editor's
  // async rendering/retry loop in Node with a DOM-free stand-in for the RPC endpoint.
  const res = { text: {}, b64: {}, version: nodeEnv.version, commit: nodeEnv.commit };
  const virt = (p) => {
    if (p.startsWith(nodeEnv.katexDir + path.sep)) return '/repo/katex/' + path.relative(nodeEnv.katexDir, p);
    const fonts = path.join(ROOT, 'node_modules', '@fontsource') + path.sep;
    if (p.startsWith(fonts)) return '/repo/fonts/@fontsource/' + p.slice(fonts.length);
    if (p.startsWith(ROOT + path.sep)) return '/repo/' + path.relative(ROOT, p);
    return null;
  };
  const capture = { ...env };
  for (const method of ['readText', 'readTextBytes', 'readBase64', 'readBytes']) capture[method] = (p, max) => {
    const r = nodeEnv[method](p, max), v = virt(p);
    if (v) {
      if (method === 'readTextBytes') res.text[v] = r.text;
      else if (method === 'readText') res.text[v] = r;
      else res.b64[v] = method === 'readBase64' ? r : Buffer.from(r).toString('base64');
    }
    return r;
  };
  build(capture, file, opts);
  for (const f of [PLAYER_JSON, PLAYER_LOCK, ...PLAYER_FILES]) res.text['/repo/' + f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const listing = { files: new Map([['deck.html', { m: 1, s: fs.statSync(file).size }]]), dirs: new Set() };
  const ws = { kind: 'memory', list: async () => listing, readBytes: async (rel) => new Uint8Array(fs.readFileSync(path.join(dir, rel))) };
  let jobs = 0, failRender = false;
  const engine = createEngine(res, null, { renderAbc: async ({ abc, options }) => {
    jobs++; assert.equal(abc, f.abc); assert.deepEqual(options, ABCJS_OPTIONS);
    if (failRender) throw new Error('RPC renderer failed');
    return { Svg: f.abcSvg, Map: f.abcMap };
  } });
  engine.setWorkspace(ws); engine.setListing(listing);
  const e = await engine.build('deck.html', opts);
  assert.equal(jobs, 1); assert.deepEqual(scoreData(e.html), data);
  const x = await engine.exportPortable('deck.html', { ...opts, fromFolder: false });
  assert.equal(jobs, 2);
  assert.deepEqual(x.index.components.find((p) => p.name === 'score').renderers, data.renderers);
  failRender = true;
  const failed = await engine.build('deck.html', opts);
  assert.equal(jobs, 3); assert.equal(scoreData(failed.html).abcSvg, undefined);
  assert.ok(failed.stats.warn.some((w) => /RPC renderer failed.*left unrendered/.test(w)));
  failRender = false;
  assert.deepEqual(scoreData((await engine.build('deck.html', opts)).html), data);
  console.log('abcjs core: data, renderer records, portable index, stable bytes, missing and failed renderers: ok');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
