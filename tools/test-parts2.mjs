// 部品庫 2.0 のパーツの単体の検査（ブラウザなし。format spec §6.1・§6.2）
// test-all: unit
//   登録簿（kit/parts-registry.js）：status() の形（failed[].element）と失敗の理由（meta・factory・missing・dependency・duplicate・element）・依存の順・先の参照・factory の失敗とその伝わり・
//   同じ名前の 2 つの版・返り値を凍らせる・要素の定義・要素の名前の 2 度目・形の違う meta
//   kit/core/parts2.mjs：依存の解決と順・要素の名前のぶつかり（conflicts。組み立ては断る）・カタログの選び方・meta を字で読む（字のままでなければ知らせる。写しのパーツは全部読める）・
//   描く欄の道筋と欄の名前・絞り込み（同じキーなら同じバイト、_ の欄は先にそのまま、宣言ごとに宣言した順、keys は合わせて符号の順）
//   写し：vendor/components/sha256 と components2.lock.json が合っている（tools/components2-update.mjs --check と同じ）
import fs from 'node:fs';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseLock2, resolveParts, pickCatalogue, readDefineMeta, metaMismatch, eachField, renderFields, subsetCode, lock2Problems, renderedFieldNames } from '../kit/core/parts2.mjs';
import { applyRelease2, checkVendor2 } from './components2-update.mjs';
import { validateIndex } from '../kit/core/portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const partFile = (n, v) => path.join(resolveComponent(path, ROOT, contentLock, n, v), 'index.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 取り込みも同じ content 表に書く。1.x の既定と、先に取り込んだ同じ版の写しを残す。
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-store-'));
  try {
    const legacy = { source: 'https://github.com/egatari/components', yanked: { '1.0.0': { replacement: '1.13.1', reason: 'old release', date: '2026-10-20' } },
      components: { bars: { default: '1.13.1', versions: ['1.13.1'], sha256: { '1.13.1': '1'.repeat(64) }, content: { '1.13.1': '2'.repeat(64) } } } };
    fs.writeFileSync(path.join(root, 'components.lock.json'), JSON.stringify(legacy));
    const code = Buffer.from('egatariParts.define({name: "base", version: "1.0.0", requires: {}}, function(){ return {}; });\n');
    const record = { sha256: crypto.createHash('sha256').update(code).digest('hex'), kind: 'library', requires: {}, license: 'MIT' };
    const release = (version, readme) => ({ version, tag: 'v' + version, tarballSha256: version === '2.0.0' ? 'a'.repeat(64) : 'b'.repeat(64), manifest: Buffer.from('{}'), license: Buffer.from('MIT'),
      parts: { base: { version: '1.0.0', record, files: new Map([['index.js', code], ['README.md', Buffer.from(readme)]]) } } });
    applyRelease2(release('2.0.0', 'first'), { root });
    const first = JSON.parse(fs.readFileSync(path.join(root, 'components.lock.json'), 'utf8'));
    const dir = resolveComponent(path, root, first, 'base', '1.0.0');
    ok(dir.includes('/vendor/components/sha256/') && fs.existsSync(path.join(dir, 'index.js')), '2.0 import writes content-addressed code, resolved through the shared lock');
    ok(first.components.bars.default === '1.13.1' && checkVendor2(root).length === 0, '2.0 import preserves 1.x defaults and does not apply release-wide 1.x withdrawals to library versions');
    const second = applyRelease2(release('2.0.1', 'changed documentation'), { root });
    const next = JSON.parse(fs.readFileSync(path.join(root, 'components.lock.json'), 'utf8'));
    ok(second.written.length === 0 && resolveComponent(path, root, next, 'base', '1.0.0') === dir && fs.readFileSync(path.join(dir, 'README.md'), 'utf8') === 'first', 'another catalogue keeps the original content of an already imported part version');
    fs.appendFileSync(path.join(dir, 'README.md'), 'tampered');
    ok(checkVendor2(root).some((e) => /content hash mismatch/.test(e)), '2.0 storage check covers the whole content object, including documentation');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- 登録簿
const REG = fs.readFileSync(path.join(ROOT, 'kit/parts-registry.js'), 'utf8');
function sandbox() {
  class HTMLElement {}
  const defined = new Map();
  const warns = [];
  const ctx = { HTMLElement, console: { warn: (m) => warns.push(String(m)) }, customElements: { get: (n) => defined.get(n), define: (n, c) => { if (defined.has(n) || n === 'm-boom-throw') throw new Error('already'); defined.set(n, c); } } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(REG, ctx);
  return { R: ctx.egatariParts, ctx, defined, warns, run: (code) => vm.runInContext(code, ctx) };
}
{
  const { R, defined, run } = sandbox();
  ok(Object.isFrozen(R) && eq(Object.keys(R), ['define']), 'egatariParts exposes only define (status is not enumerable) and is frozen');
  run(`egatariParts.define({name: "lib", version: "1.0.0"}, () => ({x: 1, nested: {y: 2}}));`);
  run(`egatariParts.define({name: "lib", version: "1.1.0"}, () => ({x: 11}));`);
  run(`globalThis.seen = [];
       egatariParts.define({name: "a", version: "2.0.0", requires: {lib: "1.0.0"}, element: "m-a"}, (d) => { seen.push(d.lib.x, Object.isFrozen(d.lib), Object.isFrozen(d.lib.nested), Object.isFrozen(d)); try { d.lib.x = 5; } catch (e) { seen.push('threw'); } return class extends HTMLElement {}; });
       egatariParts.define({name: "b", version: "2.0.0", requires: {lib: "1.1.0"}, element: "m-b"}, (d) => { seen.push(d.lib.x); return class extends HTMLElement {}; });`);
  ok(eq(run('seen'), [1, true, false, true, 11]), `deps hold each required version's value; values frozen shallowly (${JSON.stringify(run('seen'))})`);
  ok(defined.has('m-a') && defined.has('m-b'), 'element parts are defined as custom elements');
  run(`egatariParts.define({name: "late", version: "1.0.0", requires: {later: "1.0.0"}, element: "m-late"}, () => class extends HTMLElement {});
       egatariParts.define({name: "later", version: "1.0.0"}, () => ({}));`);
  run(`egatariParts.define({name: "bad", version: "1.0.0", element: "m-bad"}, () => { throw new Error("nope"); });
       egatariParts.define({name: "dep", version: "1.0.0", requires: {bad: "1.0.0"}, element: "m-dep"}, () => class extends HTMLElement {});
       egatariParts.define({name: "notcls", version: "1.0.0", element: "m-notcls"}, () => ({}));
       egatariParts.define({name: "Bad Name", version: "1"}, () => ({}));
       egatariParts.define({name: "rng", version: "1.0.0", requires: {lib: "^1.0"}}, () => ({}));`);
  run(`egatariParts.define({name: "lib", version: "1.0.0"}, () => ({x: 99}));`);
  ok(eq(run('seen'), [1, true, false, true, 11]), 'a second define of the same name@version is ignored (the first value is kept)');
  run(`customElements.define("m-taken", class extends HTMLElement {}); globalThis.called = 0; egatariParts.define({name: "taken", version: "1.0.0", element: "m-taken"}, () => { called++; return class extends HTMLElement {}; });
       egatariParts.define({name: "a2", version: "2.1.0", element: "m-a"}, () => { called++; return class extends HTMLElement {}; });
       egatariParts.define({name: "usestaken", version: "1.0.0", requires: {taken: "1.0.0"}}, () => ({}));
       egatariParts.define("nometa", () => ({}));
       egatariParts.define({name: "nofn", version: "1.0.0"}, 42);
       egatariParts.define({name: "badname", version: "1.0.0", element: "m-boom-throw"}, () => class extends HTMLElement {});`);
  const st = R.status();
  ok(eq(Object.keys(st), ['defined', 'failed']) && st.failed.every((f) => eq(Object.keys(f), f.element === undefined ? ['name', 'version', 'reason'] : ['name', 'version', 'element', 'reason'])),
    `status() is {defined, failed: [{name, version, element?, reason}]} (${Object.keys(st)})`);
  ok(st.failed.every((f) => ['meta', 'factory', 'missing', 'dependency', 'duplicate', 'element'].includes(f.reason)), `every reason is one of meta | factory | missing | dependency | duplicate | element (${[...new Set(st.failed.map((f) => f.reason))]})`);
  const el = (n) => (st.failed.find((f) => f.name === n) || {}).element;
  ok(el('late') === 'm-late' && el('dep') === 'm-dep' && el('taken') === 'm-taken' && el('rng') === undefined && el('lib') === undefined, 'failed[].element is the meta\'s element (absent for a library part)');
  const why = (n, v) => (st.failed.find((f) => f.name === n && (!v || f.version === v)) || {}).reason || '';
  ok(why('late') === 'missing' && !defined.has('m-late'), 'a part that requires a later part fails as missing (no forward reference)');
  ok(why('bad') === 'factory' && why('dep') === 'dependency' && !defined.has('m-dep'), 'a throwing factory fails as factory, its dependants as dependency');
  ok(why('notcls') === 'factory', 'an element part must return an HTMLElement class (factory)');
  ok(why('Bad Name') === 'meta' && why('rng') === 'meta' && why('undefined') === 'meta', 'a meta of the wrong shape fails as meta (name, exact versions; no ranges in a file; not an object)');
  ok(why('nofn') === 'factory', 'a factory that is not a function fails as factory');
  ok(why('badname') === 'element', 'customElements.define that throws fails as element');
  ok(why('lib', '1.0.0') === 'duplicate' && st.defined.filter((x) => x === 'lib@1.0.0').length === 1, 'a second define of the same name@version is recorded as duplicate');
  ok(why('taken') === 'element' && why('a2') === 'element' && defined.get('m-a') !== undefined && run('called') === 0 && why('usestaken') === 'dependency',
    'a second definition of an element name is recorded as element and the first is kept (its factory is not called; dependants fail)');
  ok(eq(st.defined, ['lib@1.0.0', 'lib@1.1.0', 'a@2.0.0', 'b@2.0.0', 'later@1.0.0']), `defined lists what was defined, in call order (${st.defined.join(' ')})`);
  ok(eq(st.failed.map((f) => f.name), ['late', 'bad', 'dep', 'notcls', 'Bad Name', 'rng', 'lib', 'taken', 'a2', 'usestaken', 'undefined', 'nofn', 'badname']), `failed is in call order (${st.failed.map((f) => f.name).join(' ')})`);
  ok(R.status() !== R.status() && (R.status().failed.push(1), R.status().failed.length === st.failed.length), 'status() returns a fresh copy');
  const again = sandbox();
  again.run('globalThis.first = egatariParts;');
  again.run(REG);
  ok(again.run('first === egatariParts'), 'writing the registry twice keeps the first');
}

// ---------------------------------------------------------------- 解決と順
const lock2 = parseLock2(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
{
  const cat = lock2.default;
  const r = resolveParts(lock2, cat, ['m-boxplot', 'm-cycle', 'm-nope']);
  const ids = r.parts.map((p) => `${p.name}@${p.version}`);
  const pos = (n) => ids.findIndex((x) => x.startsWith(n + '@'));
  ok(pos('shape') < pos('base') && pos('base') < pos('plot') && pos('plot') < pos('boxplot') && pos('boxplot-core') < pos('boxplot') && pos('markup-reader') < pos('cycle'), `dependency order: ${ids.join(' ')}`);
  ok(new Set(ids).size === ids.length && eq(r.missing, ['m-nope']), 'each part once; unknown elements are listed as missing');
  ok(eq(resolveParts(lock2, cat, ['m-cycle', 'm-boxplot']).parts.map((p) => p.name), r.parts.map((p) => p.name)), 'the order does not depend on the order of use');
  // 同じ名前の 2 つの版：埋め込みのパーツが base の別の版を要る（固定のファイルにない版は書かず、知らせる）
  const local = { 'm-x': { meta: { name: 'x', version: '0.1.0', requires: { base: '9.9.9' }, element: 'm-x' }, code: '', where: 'components/x/index.js' } };
  const r2 = resolveParts(lock2, cat, ['m-bars', 'm-x'], { local });
  ok(r2.warn.some((w) => /base@9\.9\.9 \(required by x@0\.1\.0\) is not in components2\.lock\.json/.test(w)) && r2.parts.some((p) => p.name === 'x' && p.source === 'embedded'), 'a missing exact version is reported, never replaced by another');
  // 2 つの版が並ぶ（試しの固定のファイル）
  const two = JSON.parse(JSON.stringify(lock2));
  two.parts.base['1.1.0'] = { ...two.parts.base['1.0.0'] };
  two.parts.pie['2.1.0'] = { ...two.parts.pie['2.0.0'], requires: { base: '1.1.0' } };
  ok(lock2Problems(two).length === 0, 'test lock with two base versions is well formed');
  const r3 = resolveParts(two, cat, ['m-bars', 'm-pie'], { pins: { pie: '2.1.0' } });
  const ids3 = r3.parts.map((p) => `${p.name}@${p.version}`);
  ok(ids3.includes('base@1.0.0') && ids3.includes('base@1.1.0') && ids3.indexOf('base@1.1.0') < ids3.indexOf('pie@2.1.0'), `two versions of base side by side: ${ids3.join(' ')}`);
  const r4 = resolveParts(lock2, cat, ['m-bars'], { pins: { bars: '7.0.0' } });
  ok(r4.parts.some((p) => p.name === 'bars' && p.version === '2.0.0') && r4.warn.some((w) => /bars: version "7\.0\.0" is not in/.test(w)), 'a pin that is not vendored falls back to the catalogue with a warning');
  // 要素の名前は 1 つ（§6.1 Order）：同じ要素の名前を定義するパーツが 2 つ要る → conflicts（組み立ては断る）
  const three = JSON.parse(JSON.stringify(lock2));
  three.parts.bars['2.1.0'] = { ...three.parts.bars['2.0.0'] };
  const localB = { 'm-y': { meta: { name: 'y', version: '0.1.0', requires: { bars: '2.1.0' }, element: 'm-y' }, code: '', where: 'components/y/index.js' } };
  const r5 = resolveParts(three, cat, ['m-bars', 'm-y'], { local: localB });
  ok(r5.conflicts.length === 1 && /<m-bars> is defined by bars@2\.0\.0 and bars@2\.1\.0/.test(r5.conflicts[0]), `two versions of one element part are a conflict (${r5.conflicts[0]})`);
  const localC = { 'm-pie': { meta: { name: 'mypie', version: '0.1.0', requires: {}, element: 'm-pie' }, code: '', where: 'components/pie/index.js' },
    'm-z': { meta: { name: 'z', version: '0.1.0', requires: { pie: '2.0.0' }, element: 'm-z' }, code: '', where: 'components/z/index.js' } };
  const r6 = resolveParts(lock2, cat, ['m-pie', 'm-z'], { local: localC });
  ok(r6.conflicts.length === 1 && /<m-pie> is defined by (mypie@0\.1\.0 and pie@2\.0\.0|pie@2\.0\.0 and mypie@0\.1\.0)/.test(r6.conflicts[0]), `two differently named parts defining one element are a conflict (${r6.conflicts[0]})`);
  ok(r.conflicts.length === 0 && r3.conflicts.length === 0, 'no conflict for distinct elements or two versions of a library part');
  ok(pickCatalogue(lock2, undefined).catalogue === null && pickCatalogue(lock2, '1').catalogue === null && pickCatalogue(lock2, '2').catalogue === cat && pickCatalogue(lock2, cat).catalogue === cat && /not in/.test(pickCatalogue(lock2, '2.9.9').note) && pickCatalogue(null, '2').catalogue === null,
    'catalogue choice: absent or 1 → 1.x; 2 → the default 2.x catalogue; an unknown version → the default with a note; no lock → 1.x with a note');
}

// ---------------------------------------------------------------- meta を字で読む（§6.1：define の最初の引数は、式のない JSON の object の字）
ok(eq(readDefineMeta(`// c\negatariParts.define({name: "p", version: "0.1.0", requires: {base: "1.0.0", "box-core": "1.0.0"}, element: "m-p"}, function(d){ return 1; });`),
  { meta: { name: 'p', version: '0.1.0', requires: { base: '1.0.0', 'box-core': '1.0.0' }, element: 'm-p' } }), 'readDefineMeta reads name, version, requires and element without running the code');
ok(eq(readDefineMeta(`egatariParts.define({"name": "q", "version": "1.0.0"}, f)`), { meta: { name: 'q', version: '1.0.0', requires: {} } }), 'quoted keys and no requires');
ok(readDefineMeta('DECK.define("m-old", class {});') === null, 'a 1.x part (DECK.define) has no 2.0 meta');
for (const [code, what] of [
  ['egatariParts.define(META, f)', 'a variable'],
  ['egatariParts.define({name: "p", version: V}, f)', 'an expression as a value'],
  ['egatariParts.define({name: "p" + "q", version: "1.0.0"}, f)', 'string concatenation'],
  ["egatariParts.define({name: 'p', version: '1.0.0'}, f)", 'single quotes'],
  ['egatariParts.define({name: "p", version: "1.0.0", ...X}, f)', 'a spread'],
  ['egatariParts.define({name: "p", version: "1.0.0", requires: {base: "1.0.0",}}, f)', 'a trailing comma'],
  ['egatariParts.define({name: "p", version: "1.0.0", n: 1}, f)', 'a number'],
  ['egatariParts.define({name: "p", name: "q", version: "1.0.0"}, f)', 'a repeated key'],
  ['egatariParts.define({name: "p", version: "1.0.0" /* c */}, f)', 'a comment'],
  ['egatariParts.define({name: "p", version: "^1.0"}, f)', 'a version range'],
]) ok(/egatariParts\.define/.test((readDefineMeta(code) || {}).problem || ''), `a meta that is not a literal JSON object is reported: ${what}`);
{
  // 部品庫のパーツは全部、字で読めて固定のファイルと合う
  const L = parseLock2(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8')), bad = [];
  for (const [n, vs] of Object.entries(L.parts)) for (const [v, rec] of Object.entries(vs)) {
    const r = readDefineMeta(fs.readFileSync(partFile(n, v), 'utf8'));
    if (!r || r.problem || r.meta.name !== n || r.meta.version !== v || metaMismatch(r.meta, rec).length) bad.push(`${n}@${v}: ${r ? r.problem || metaMismatch(r.meta, rec).join('; ') || r.meta.name + '@' + r.meta.version : 'no define'}`);
  }
  ok(bad.length === 0, `every vendored part's meta is literal and matches components2.lock.json${bad.length ? ': ' + bad.join(' | ') : ''}`);
}

// ---------------------------------------------------------------- 描く欄
{
  const d = { nodes: [{ tex: 'a' }, { label: 'x' }, { tex: 'b' }], center: { tex: 'c' }, abc: 'X:1' };
  const seen = [];
  eachField(d, 'nodes[].tex', (h, k) => seen.push(h[k]));
  eachField(d, 'center.tex', (h, k) => seen.push(h[k]));
  eachField(d, 'abc', (h, k) => seen.push(h[k]));
  eachField(d, 'missing[].tex', (h, k) => seen.push(h[k]));
  ok(eq(seen, ['a', 'b', 'c', 'X:1']), 'field paths: nodes[].tex, center.tex, abc');
  const r = renderFields(d, { fields: { 'nodes[].tex': 'katex', abc: 'abcjs' }, options: { katex: { output: 'html' } } },
    { katex: { version: '0.0.1', defaults: { output: 'htmlAndMathml' }, render: (src, opt) => ({ Html: `<b>${src}:${opt.output}</b>`, Other: 'x' }) } });
  ok(d.nodes[0].texHtml === '<b>a:html</b>' && d.nodes[1].texHtml === undefined && d.nodes[0].texOther === undefined && eq(d.renderers, { katex: { version: '0.0.1', options: { output: 'html' } } }) && eq(r.missing, ['abcjs']) && r.rendered === 2,
    'renderFields adds <field>Html (no other names), records each renderer once with its options, and lists missing renderers');
  const m = { score: { abc: 'X:1' } };
  renderFields(m, { fields: { 'score.abc': 'abcjs' } }, { abcjs: { version: '9.9.9', render: () => ({ Svg: '<svg/>', Map: { n: 1 }, Html: 'no' }) } });
  ok(m.score.abcSvg === '<svg/>' && eq(m.score.abcMap, { n: 1 }) && m.score.abcHtml === undefined && eq(renderedFieldNames('abcjs', 'abc'), ['abcSvg', 'abcMap']) && eq(renderedFieldNames('katex', 'tex'), ['texHtml']),
    'rendered field names are normative: katex <field>Html; abcjs <field>Svg and <field>Map');
}

// 索引の components[].renderers（index schema・§6.2 Render）：読み手が形を確かめる（2.0 の教材の書き出しはまだ断る。記録は組み立ての stats.parts にある）
{
  const c = { tag: 'm-flow', name: 'flow', version: '2.0.0', sha256: 'a'.repeat(64), source: 'registry' };
  const v = (r) => validateIndex({ components: [{ ...c, ...r }] }).filter((x) => /^components/.test(x));
  ok(v({ renderers: { katex: { version: '0.19.0', options: { output: 'html' } }, abcjs: { version: '6.4.4' } } }).length === 0 && v({ renderers: [] }).length === 1 && v({ renderers: { katex: { options: 1 } } }).length === 2,
    'index components[].renderers: name → {version, options?} is checked');
}

// ---------------------------------------------------------------- 絞り込み
{
  const code = 'var A = /*@egatari-block m*/{"_license":"OFL","あ":[1],"い":[2],"う":[3]}/*@egatari-block-end*/;\nvar B = /*@egatari-block s*/[{"char":"い","d":1},{"char":"え","d":2}]/*@egatari-block-end*/;\nvar C = 1;';
  const r = subsetCode(code, [{ data: 'block:m', key: 'char' }, { data: 'block:s', key: 'char' }], 'いあお');
  ok(r.code.includes('/*@egatari-block m*/{"_license":"OFL","あ":[1],"い":[2]}/*@egatari-block-end*/') && r.code.includes('/*@egatari-block s*/[{"char":"い","d":1}]/*@egatari-block-end*/') && r.code.endsWith('var C = 1;'),
    'subset keeps the keys in the text, _ members first and unchanged, bytes outside the markers as they were');
  ok(r.keys === 'あい' && eq(r.blocks, ['m', 's']), `kept keys are recorded in code point order (${r.keys})`);
  ok(subsetCode(code, [{ data: 'block:m', key: 'char' }, { data: 'block:s', key: 'char' }], r.keys).code === r.code, 'applying the recorded keys to the full code gives the same bytes');
  ok(subsetCode(code, { data: 'block:zz', key: 'char' }, 'あ').problems.some((x) => /zz: not found/.test(x)), 'a declared block that is not in the code is reported');
  // 宣言ごとに別々に、宣言した順に：同じ塊に 2 つの宣言（キーの欄が違う）
  const c2 = 'X = /*@egatari-block t*/[{"char":"あ","alt":"か"},{"char":"い","alt":"あ"},{"char":"う","alt":"う"}]/*@egatari-block-end*/;';
  const r2 = subsetCode(c2, [{ data: 'block:t', key: 'char' }, { data: 'block:t', key: 'alt' }], 'あか');
  ok(r2.code.includes('/*@egatari-block t*/[{"char":"あ","alt":"か"}]/*@egatari-block-end*/') && r2.keys === 'あか' && eq(r2.blocks, ['t']), `several entries subset on their own, in declared order; keys are the union, each once, in code point order (${r2.keys})`);
  ok(subsetCode(code, { data: 'strokes', key: 'char' }, 'あ').problems.some((x) => /is not block:<name>/.test(x)), 'a subset entry whose data is not block:<name> is reported (1.0: blocks only)');
}

// ---------------------------------------------------------------- 写し
{
  const e = checkVendor2(ROOT);
  ok(e.length === 0, `content-addressed parts match components2.lock.json${e.length ? ': ' + e.join('; ') : ''}`);
  const rc = lock2.catalogues['2.0.0-rc.1'];
  ok(rc && rc.tarballSha256 === 'efc672e96c1842834eff4c1fcc3603bc2efa4ce4076768b4e27ad6df7a69cf1c' && rc.tag === 'v2.0.0-rc.1', 'components 2.0.0-rc.1 is pinned to the verified tarball');
  // 2.0 のパーツは再生器のグローバル（DECK）を使わない（注釈の外）
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const uses = Object.entries(rc.parts).filter(([n, v]) => /\bDECK\s*\./.test(strip(fs.readFileSync(partFile(n, v), 'utf8')))).map(([n]) => n);
  ok(uses.length === 0, `no 2.0 part reads DECK (${uses.join(', ') || 'none'})`);
}
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
