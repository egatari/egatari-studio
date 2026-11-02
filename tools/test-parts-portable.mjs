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
      code = subsetCode(full, lock2.parts[p.name][p.version].build.subset, p.subset.keys, p.subset.names || []).code;
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
  // 見本は 2.0.0 を選んでいる：既定（2.1.0）が変わっても、教材が選んだカタログのまま書く
  assert.equal(cfg.componentsCatalogue, '2.0.0');
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

  // 名前で絞るライブラリのパーツ（§6.2 Subset by name。部品庫 2.1.0 の icons 1.0.0 の形）：部品庫の固定のファイルにはまだないので、
  // 固定のファイル 2 つと写しの場所だけを差し替えた env で組む。build は manifest の library の項目の写し（components2.lock.json の build）から読む
  {
    const FX = path.join(ROOT, 'tools/fixtures/subset-names');
    const iconsJs = fs.readFileSync(path.join(FX, 'icons.js'), 'utf8');
    const exp = JSON.parse(fs.readFileSync(path.join(FX, 'expected.json'), 'utf8'));
    const iconsSha = await sha256Hex(normalizeEol(new TextEncoder().encode(iconsJs)));
    const contentHash = 'f'.repeat(64);
    const lock2x = structuredClone(lock2), lockx = structuredClone(lock);
    lock2x.catalogues[lock2x.default].parts.icons = '1.0.0';
    lock2x.parts.icons = { '1.0.0': { sha256: iconsSha, kind: 'library', requires: {}, build: { subset: [{ data: 'block:icons', key: 'name', match: 'name' }] }, license: 'MIT' } };
    lockx.components.icons = { default: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': iconsSha }, content: { '1.0.0': contentHash }, catalogue: '2' };
    const vfile = path.join(resolveComponent(path, ROOT, lockx, 'icons', '1.0.0'), 'index.js');
    const fake = {
      [path.join(ROOT, 'components2.lock.json')]: JSON.stringify(lock2x), [path.join(ROOT, 'components.lock.json')]: JSON.stringify(lockx), [vfile]: iconsJs,
    };
    const has = (p) => Object.prototype.hasOwnProperty.call(fake, p);
    const env = { ...nodeEnv, readTextBytes: undefined,
      exists: (p) => has(p) || nodeEnv.exists(p), isFile: (p) => has(p) || nodeEnv.isFile(p),
      size: (p) => (has(p) ? Buffer.byteLength(fake[p]) : nodeEnv.size(p)), readText: (p, max) => (has(p) ? fake[p] : nodeEnv.readText(p, max)),
      within: (p, dir) => (p === vfile ? p.startsWith(dir + path.sep) : nodeEnv.within(p, dir)) };
    const d = path.join(work, 'icons-src');
    fs.mkdirSync(path.join(d, 'components', 'icondemo'), { recursive: true });
    fs.writeFileSync(path.join(d, 'egatari.json'), JSON.stringify({ componentsCatalogue: lock2.default }));
    fs.writeFileSync(path.join(d, 'components', 'icondemo', 'index.js'),
      '// m-icondemo: draws the icons named in its data (test of subset by name)\negatariParts.define({name: "icondemo", version: "0.1.0", requires: {icons: "1.0.0"}, element: "m-icondemo"}, function(deps){\n' +
      '  var I = deps.icons;\n  return class extends HTMLElement { connectedCallback(){ var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.appendChild(I.svg(this.getAttribute("icon"))); this.appendChild(s); } };\n});\n');
    const lessonHtml = fs.readFileSync(path.join(FX, 'lesson-mixed.html'), 'utf8')
      .replace('<p title="chart-bar">', '<m-icondemo icon="user" style="display:block;width:48px;height:48px"></m-icondemo><p title="chart-bar">');
    fs.writeFileSync(path.join(d, 'deck.html'), lessonHtml);
    fs.copyFileSync(path.join(FX, 'narration-mixed.md'), path.join(d, 'narration.md'));
    const x = await exportPortable(env, path.join(d, 'deck.html'), { subset: false });
    const ic = x.index.components.find((p) => p.name === 'icons');
    const want = exp.cases.find((c) => c.part === 'icons.js' && c.lessons && c.lessons.includes('narration-mixed.md'));
    assert.ok(ic && !ic.tag && ic.sha256 === iconsSha, 'icons is written as a library with the published identity');
    assert.deepEqual(ic.subset.names, want.names, 'subset.names: the names the reference keeps for the same lesson and narration');
    assert.equal(ic.subset.keys, '');
    const written = subsetCode(iconsJs, lock2x.parts.icons['1.0.0'].build.subset, ic.subset.keys, ic.subset.names);
    assert.equal(ic.subset.sha256, await sha256Hex(safe(written.code)), 'the editor applying {keys, names} to its trusted copy gets the written bytes');
    assert.equal(await sha256Hex(new TextEncoder().encode(written.code)), want.sha256, 'the written subset is byte for byte the reference producer\'s');
    assert.ok(x.html.includes(safe(written.code)) && !x.html.includes('"home":['), 'the subset code is in the file; icons the lesson does not name are not');
    assert.ok(x.html.includes('"_notice":"Tabler Icons 3.49.0'), 'the MIT notice survives');
    assert.deepEqual(validateIndex(x.index), []);
    assert.ok(validate(JSON.parse(JSON.stringify(x.index))), JSON.stringify(validate.errors));
    // 形の悪い宣言（§6.2 Bad declarations）：知らせて、パーツは全部のまま書き、索引に subset を書かない。教材は組める
    lock2x.parts.icons['1.0.0'].build = { subset: [{ data: 'block:icons', key: 'name', match: 'name', keep: ['Not-A-Name'] }] };
    fake[path.join(ROOT, 'components2.lock.json')] = JSON.stringify(lock2x);
    const xb = await exportPortable(env, path.join(d, 'deck.html'), { subset: false });
    const icb = xb.index.components.find((p) => p.name === 'icons');
    assert.ok(icb && !('subset' in icb) && icb.sha256 === iconsSha, 'a bad declaration: no subset in the index entry');
    assert.ok(xb.html.includes(safe(iconsJs)), 'a bad declaration: the whole part is written');
    assert.ok(xb.warnings.some((w) => /part icons@1\.0\.0: bad subset declaration \(.*keep/.test(w)), `a bad declaration is reported, naming the part and the fault: ${xb.warnings.filter((w) => /subset/.test(w)).join(' | ')}`);
    assert.deepEqual(validateIndex(xb.index), []);
    console.log(`ok   subset by name: a library part's build from the lock, subset.names ${JSON.stringify(ic.subset.names)} in the index (schema), the reference's bytes, the notice kept`);
  }

} finally { fs.rmSync(work, { recursive: true, force: true }); }
