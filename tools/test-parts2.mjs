// 部品庫 2.0 のパーツの単体の検査（ブラウザなし。format spec §6.1・§6.2）
// test-all: unit
//   登録簿（kit/parts-registry.js）：依存の順・先の参照・factory の失敗とその伝わり・同じ名前の 2 つの版・返り値を凍らせる・要素の定義・形の違う meta
//   kit/core/parts2.mjs：依存の解決と順・カタログの選び方・埋め込みのパーツの meta を字で読む・描く欄の道筋・絞り込み（同じキーなら同じバイト、_ の欄は先にそのまま）
//   写し：vendor/components-2 と components2.lock.json が合っている（tools/components2-update.mjs --check と同じ）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseLock2, resolveParts, pickCatalogue, readDefineMeta, eachField, renderFields, subsetCode, lock2Problems } from '../kit/core/parts2.mjs';
import { checkVendor2 } from './components2-update.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- 登録簿
const REG = fs.readFileSync(path.join(ROOT, 'kit/parts-registry.js'), 'utf8');
function sandbox() {
  class HTMLElement {}
  const defined = new Map();
  const warns = [];
  const ctx = { HTMLElement, console: { warn: (m) => warns.push(String(m)) }, customElements: { get: (n) => defined.get(n), define: (n, c) => { if (defined.has(n)) throw new Error('already'); defined.set(n, c); } } };
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
  const st = R.status();
  const why = (n) => (st.failures.find((f) => f.name === n) || {}).reason || '';
  ok(/not defined before it/.test(why('late')) && !defined.has('m-late'), 'a part that requires a later part fails (no forward reference)');
  ok(/factory threw: nope/.test(why('bad')) && /bad@1\.0\.0, which failed/.test(why('dep')) && !defined.has('m-dep'), 'a throwing factory fails, and so do its dependants');
  ok(/did not return a class/.test(why('notcls')), 'an element part must return an HTMLElement class');
  ok(/not a part name/.test(why('Bad Name')) && /not an exact version/.test(why('rng')), 'meta is checked (name, exact versions; no ranges in a file)');
  ok(eq(st.defined, ['lib@1.0.0', 'lib@1.1.0', 'a@2.0.0', 'b@2.0.0', 'later@1.0.0']) && st.elements['m-a'] === 'a@2.0.0', `status lists what was defined, in order (${st.defined.join(' ')})`);
  run(`egatariParts.define({name: "lib", version: "1.0.0"}, () => ({x: 99}));`);
  ok(eq(run('seen'), [1, true, false, true, 11]) && R.status().defined.length === 5, 'a second define of the same name@version is ignored');
  run(`customElements.define("m-taken", class extends HTMLElement {}); egatariParts.define({name: "taken", version: "1.0.0", element: "m-taken"}, () => class extends HTMLElement {});`);
  ok(!R.status().elements['m-taken'] && R.status().defined.includes('taken@1.0.0'), 'an element already defined is not redefined');
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
  ok(pickCatalogue(lock2, undefined).catalogue === null && pickCatalogue(lock2, '1').catalogue === null && pickCatalogue(lock2, '2').catalogue === cat && pickCatalogue(lock2, cat).catalogue === cat && /not in/.test(pickCatalogue(lock2, '2.9.9').note) && pickCatalogue(null, '2').catalogue === null,
    'catalogue choice: absent or 1 → 1.x; 2 → the default 2.x catalogue; an unknown version → the default with a note; no lock → 1.x with a note');
}

// ---------------------------------------------------------------- 埋め込みのパーツの meta
ok(eq(readDefineMeta(`// c\negatariParts.define({name: "p", version: "0.1.0", requires: {base: "1.0.0", "box-core": "1.0.0"}, element: "m-p"}, function(d){ return 1; });`),
  { name: 'p', version: '0.1.0', requires: { base: '1.0.0', 'box-core': '1.0.0' }, element: 'm-p' }), 'readDefineMeta reads name, version, requires and element without running the code');
ok(readDefineMeta('DECK.define("m-old", class {});') === null, 'a 1.x part (DECK.define) has no 2.0 meta');

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
    { katex: { version: '0.0.1', defaults: { output: 'htmlAndMathml' }, render: (src, opt, key) => ({ [key + 'Html']: `<b>${src}:${opt.output}</b>` }) } });
  ok(d.nodes[0].texHtml === '<b>a:html</b>' && d.nodes[1].texHtml === undefined && eq(d.renderers, { katex: { version: '0.0.1', options: { output: 'html' } } }) && eq(r.missing, ['abcjs']) && r.rendered === 2,
    'renderFields adds <field>Html, records each renderer once with its options, and lists missing renderers');
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
}

// ---------------------------------------------------------------- 写し
{
  const e = checkVendor2(ROOT);
  ok(e.length === 0, `vendor/components-2 matches components2.lock.json${e.length ? ': ' + e.join('; ') : ''}`);
  const rc = lock2.catalogues['2.0.0-rc.1'];
  ok(rc && rc.tarballSha256 === 'efc672e96c1842834eff4c1fcc3603bc2efa4ce4076768b4e27ad6df7a69cf1c' && rc.tag === 'v2.0.0-rc.1', 'components 2.0.0-rc.1 is pinned to the verified tarball');
  // 2.0 のパーツは再生器のグローバル（DECK）を使わない（注釈の外）
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const uses = Object.entries(rc.parts).filter(([n, v]) => /\bDECK\s*\./.test(strip(fs.readFileSync(path.join(ROOT, 'vendor/components-2', n, v, 'index.js'), 'utf8')))).map(([n]) => n);
  ok(uses.length === 0, `no 2.0 part reads DECK (${uses.join(', ') || 'none'})`);
}
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
