// test-all: unit
// 部品庫 2.0 の 1 ファイル：コードと索引の一致、依存の版、絞り込み、描画の記録、段 A と往復（ブラウザなし）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { build, buildPortable, nodeEnv } from '../kit/build.mjs';
import { exportPortable, readPortable, sha256Hex, replaceIndexText, validateIndex, playOnly } from '../kit/core/portable.mjs';
import { normalizeEol } from '../kit/core/identity-hash.mjs';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import { subsetCode } from '../kit/core/parts2.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { unpack } from './portable.mjs';
import { missingParts2Requirement } from './parts2-fixtures.mjs';
import { registryProblems, workspaceFromPortable } from '../app/portable-ws.js';
import { appComponentFiles } from './vendor-components.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-portable-'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
const safe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--').replace(/\r\n?/g, '\n');
try {
  const src = path.join(work, 'src');
  fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), src, { recursive: true });
  const r = await buildPortable(path.join(src, 'deck.html'), { subset: false });
  const read = await readPortable(r.html);
  assert.deepEqual(validateIndex(r.index), []);
  const ajv = new Ajv({ strict: false });
  for (const f of fs.readdirSync(path.join(ROOT, 'vendor/egatari-spec/schema'))) if (f !== 'egatari-index.schema.json') ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/egatari-spec/schema', f), 'utf8')));
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/egatari-spec/schema/egatari-index.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);
  assert.ok(validate(JSON.parse(JSON.stringify(r.index))), JSON.stringify(validate.errors));
  assert.ok(read.sourceMatches);
  const parts = r.index.components, seen = new Set();
  assert.ok(parts.some((p) => p.name === 'base' && !p.tag));
  for (const p of parts) {
    for (const [n, v] of Object.entries(p.requires || {})) assert.ok(seen.has(`${n}@${v}`), `${p.name} needs ${n}@${v} first`);
    seen.add(`${p.name}@${p.version}`);
    const full = p.source === 'registry'
      ? fs.readFileSync(path.join(resolveComponent(path, ROOT, lock, p.name, p.version), 'index.js'), 'utf8')
      : new TextDecoder().decode(read.files[p.path]);
    assert.equal(p.sha256, await sha256Hex(normalizeEol(new TextEncoder().encode(full))), `${p.name}: full identity`);
    let code = full;
    if (p.subset) {
      code = subsetCode(full, lock2.parts[p.name][p.version].build.subset, p.subset.keys).code;
      assert.equal(p.subset.sha256, await sha256Hex(safe(code)), `${p.name}: written subset`);
      assert.notEqual(p.subset.sha256, p.sha256);
    }
    assert.ok(r.html.includes(safe(code)), `${p.name}: recorded code is in the file`);
    assert.ok(!('code' in p) && !('fullCode' in p));
  }
  assert.equal(parts.find((p) => p.name === 'probe').version, '0.1.0');
  assert.ok(!parts.some((p) => p.name === 'nonlit'));
  const flow = JSON.parse(/<m-flow[^>]*><script type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)[1]);
  assert.deepEqual(flow.renderers, parts.find((p) => p.name === 'flow').renderers);
  assert.match(flow.nodes[0].texHtml, /class="katex"/);
  const cfg = JSON.parse(new TextDecoder().decode(read.files['egatari.json']));
  assert.equal(cfg.componentsCatalogue, lock2.default);
  assert.equal(cfg.components.base, '1.0.0');
  assert.ok(!/class MotionElement|DECK\.define =|DECK\.mtext =|DECK\.svgMath =|DECK\.shape =|DECK\.tween =/.test(r.html.slice(0, r.html.indexOf('// ---- egatariParts registry'))));
  assert.match(build(path.join(ROOT, 'examples/minimal/deck.html'), { subset: false }).html, /DECK\.define =/);
  // どのスクリプトも構文として正しい（実行はしない）。登録簿とパーツの JS も含む。
  for (const m of r.html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (!/\btype=/.test(m[0].slice(0, m[0].indexOf('>')))) new vm.Script(m[1]);
  console.log('ok   portable: schema, exact code, dependencies, embedded meta, subsets, KaTeX, 1.x base isolation');

  const file = path.join(work, 'lesson.ega.html');
  fs.writeFileSync(file, r.html);
  const back = path.join(work, 'back');
  await unpack(file, back);
  const rebuilt = await buildPortable(path.join(back, 'deck.html'), { subset: false, carry: read.index });
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt.index.components)), JSON.parse(JSON.stringify(r.index.components)));
  assert.equal(rebuilt.index.sourceSha256, r.index.sourceSha256);
  assert.deepEqual(registryProblems(read.index, rebuilt.index), []);
  const wrong = structuredClone(rebuilt.index);
  wrong.components.find((p) => p.name === 'shape').sha256 = '0'.repeat(64);
  assert.ok(registryProblems(read.index, wrong).some((p) => p.includes('shape@1.0.0')));
  const edited = { ...read.files, 'narration.md': new TextEncoder().encode(new TextDecoder().decode(read.files['narration.md'] || new Uint8Array()) + '\n') };
  const a = await tierA(r.html, edited);
  assert.ok(a.ok, a.reason);
  assert.deepEqual(JSON.parse(JSON.stringify((await readPortable(a.html)).index.components)), JSON.parse(JSON.stringify(r.index.components)));
  assert.ok(playOnly(r.html).includes('egatariParts.define'));
  assert.ok(!playOnly(r.html).includes('id="egatari-index"'));
  console.log('ok   portable: unpack/rebuild pins, separate library identities, tier A, play-only');

  // 前の書き手が許した依存不足：読込・展開は続けられる（組み直すときだけ断る）。
  const oldHtml = await missingParts2Requirement(r.html);
  const opened = await readPortable(oldHtml);
  assert.ok(opened.sourceMatches);
  assert.equal(opened.index.components.find((p) => p.name === 'probe').requires.base, '9.9.9');
  const oldFile = path.join(work, 'requires-missing.ega.html'), oldBack = path.join(work, 'requires-missing-back');
  fs.writeFileSync(oldFile, oldHtml);
  await unpack(oldFile, oldBack);
  const probePath = 'components/probe/index.js';
  assert.match(fs.readFileSync(path.join(oldBack, probePath), 'utf8'), /requires: \{base: "9\.9\.9"\}/);
  const ws = workspaceFromPortable('missing.ega.html', opened);
  assert.match(await ws.readText(probePath), /requires: \{base: "9\.9\.9"\}/);
  assert.throws(() => build(path.join(oldBack, 'deck.html')), (e) => e.code === 'component-requires-missing');
  console.log('ok   existing files with missing requirements still open and unpack; rebuilding refuses');

  // 同梱・埋め込みの子テーマは親を記録する。親も独立した項目で、根には extends がない。
  const themeDeck = path.join(work, 'theme-src');
  fs.cpSync(src, themeDeck, { recursive: true });
  const themeSrc = path.join(themeDeck, 'deck.html');
  const original = fs.readFileSync(themeSrc, 'utf8');
  fs.writeFileSync(themeSrc, original.replace(/data-theme="[^"]*"/, 'data-theme="business"'));
  const themed = await buildPortable(themeSrc, { subset: false });
  assert.equal(themed.index.themes.find((t) => t.name === 'business').extends, 'default');
  assert.ok(!('extends' in themed.index.themes.find((t) => t.name === 'default')));
  assert.deepEqual(validateIndex(themed.index), []);
  assert.ok(validate(JSON.parse(JSON.stringify(themed.index))), JSON.stringify(validate.errors));
  assert.equal((await readPortable(themed.html)).index.themes.find((t) => t.name === 'business').extends, 'default');
  const legacyThemes = structuredClone(themed.index);
  for (const t of legacyThemes.themes) delete t.extends;
  assert.deepEqual(validateIndex(legacyThemes), []);
  assert.ok(validate(legacyThemes));
  await readPortable(await replaceIndexText(themed.html, JSON.stringify(legacyThemes)));
  for (const value of ['', 1, null]) {
    const badTheme = structuredClone(themed.index);
    badTheme.themes[0].extends = value;
    assert.ok(validateIndex(badTheme).some((p) => /\.extends:/.test(p)));
    assert.equal(validate(badTheme), false);
  }
  fs.mkdirSync(path.join(themeDeck, 'themes/child'), { recursive: true });
  fs.writeFileSync(path.join(themeDeck, 'themes/child/theme.json'), JSON.stringify({ name: 'child', extends: 'business' }));
  fs.writeFileSync(path.join(themeDeck, 'themes/child/tokens.css'), ':root{--base:#335577}\n');
  fs.writeFileSync(themeSrc, original.replace(/data-theme="[^"]*"/, 'data-theme="child"'));
  const embedded = await buildPortable(themeSrc, { subset: false });
  assert.equal(embedded.index.themes.find((t) => t.name === 'child').extends, 'business');
  assert.equal(embedded.index.themes.find((t) => t.name === 'business').extends, 'default');
  assert.ok(!('extends' in embedded.index.themes.find((t) => t.name === 'default')));
  assert.deepEqual(validateIndex(embedded.index), []);
  assert.ok(validate(JSON.parse(JSON.stringify(embedded.index))), JSON.stringify(validate.errors));
  const themeFile = path.join(work, 'theme.ega.html'), themeBack = path.join(work, 'theme-back');
  fs.writeFileSync(themeFile, embedded.html);
  await unpack(themeFile, themeBack);
  const themeRebuilt = await buildPortable(path.join(themeBack, 'deck.html'), { carry: embedded.index, subset: false });
  assert.deepEqual(JSON.parse(JSON.stringify(themeRebuilt.index.themes)), JSON.parse(JSON.stringify(embedded.index.themes)));
  console.log('ok   portable themes: parent entries, optional extends, schema, legacy reading and rebuild');

  const appFiles = new Map(appComponentFiles(ROOT));
  for (const p of parts.filter((p) => p.source === 'registry')) {
    const dir = resolveComponent(path, ROOT, lock, p.name, p.version);
    assert.ok(appFiles.has('/repo/' + path.relative(ROOT, dir).split(path.sep).join('/') + '/index.js'));
  }
  console.log('ok   editor resources carry every selected 2.0 dependency through the content table');
  const shape = path.join(resolveComponent(path, ROOT, lock, 'shape', '1.0.0'), 'index.js');
  const tampered = { ...nodeEnv, readTextBytes: undefined, readText: (p) => { const code = nodeEnv.readText(p); return p === shape ? code.slice(0, -1) + ' ' : code; } };
  await assert.rejects(exportPortable(tampered, path.join(src, 'deck.html'), { subset: false }), (e) => e.code === 'component-hash');
  console.log('ok   portable refuses code whose full identity differs from the lock');

} finally { fs.rmSync(work, { recursive: true, force: true }); }
