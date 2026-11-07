// 部品庫 2.0 のパーツの単体の検査（ブラウザなし。format spec §6.1・§6.2）
// test-all: unit
//   登録簿（kit/parts-registry.js）：status() の形（failed[].element）と失敗の理由（meta・factory・missing・dependency・duplicate・element）・依存の順・先の参照・factory の失敗とその伝わり・
//   同じ名前の 2 つの版・返り値を凍らせる・要素の定義・要素の名前の 2 度目・形の違う meta
//   kit/core/parts2.mjs：依存の解決と順・要素の名前のぶつかり（conflicts。組み立ては断る）・カタログの選び方・meta を字で読む（字のままでなければ知らせる。写しのパーツは全部読める）・
//   描く欄の道筋と欄の名前・絞り込み（同じキーなら同じバイト、_ の欄は先にそのまま、宣言ごとに宣言した順、keys は合わせて符号の順）・
//   名前で絞る（match: "name"。tools/fixtures/subset-names の部品庫の参照の実装が出したものとバイトまで同じ、語の切り方、keep、names の記録）・
//   教材の字（lessonText：char も name も同じ字。parse5 で文書として読み、木の順に。参照の実装の §9・§10・parse-cases.json）・形の悪い宣言（パーツを全部のまま、subset を記録しない）
//   写し：vendor/components/sha256 と components2.lock.json が合っている（tools/components2-update.mjs --check と同じ）
//   選んだカタログにない要素（#165）：deckElements（要素として使う名前・原稿の <script> が定義する名前）と catalogueHint（どこにあるか・直し方）。登録簿は再生器の代わりの受けを置き換える
import fs from 'node:fs';
import { resolveComponent, resolveCatalogueContent } from '../kit/core/components-lock.mjs';
import { identityBytes } from '../kit/core/identity-hash.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { deckElements, catalogueHint, catalogueMessage, parseLock2, resolveParts, pickCatalogue, readDefineMeta, metaMismatch, eachField, renderFields, subsetCode, lessonText, lessonTokens, htmlPieces, lock2Problems, renderedFieldNames } from '../kit/core/parts2.mjs';
import { applyRelease2, checkVendor2 } from './components2-update.mjs';
import { validateIndex } from '../kit/core/portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const partFile = (n, v) => path.join(resolveComponent(path, ROOT, contentLock, n, v), 'index.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 取り込みも同じ content 表に書く。1.x の既定と、先に取り込んだ同じ版の index.js は残す。ほかのファイル（README・demo など）だけが
// カタログの間で変わったときは、per-file の sha256（manifest.json、format spec §6）から作った content hash の違いで見分け、新しいカタログに
// 新しい写しを置く。前のカタログは前のリリースのバイトのまま（components2.lock.json の catalogues.<版>.content）。版の写し
// （components.lock.json の content.<版>：組み立てが index.js を読む）は変えない。index.js 自体が同じ版で違えば、部品庫側の誤りとして断る。
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-store-'));
  try {
    const legacy = { source: 'https://github.com/egatari/components', yanked: { '1.0.0': { replacement: '1.13.1', reason: 'old release', date: '2026-10-20' } },
      components: { bars: { default: '1.13.1', versions: ['1.13.1'], sha256: { '1.13.1': '1'.repeat(64) }, content: { '1.13.1': '2'.repeat(64) } } } };
    fs.writeFileSync(path.join(root, 'components.lock.json'), JSON.stringify(legacy));
    const code = Buffer.from('egatariParts.define({name: "base", version: "1.0.0", requires: {}}, function(){ return {}; });\n');
    const h = (b) => crypto.createHash('sha256').update(b).digest('hex');
    const record = { sha256: h(code), kind: 'library', requires: {}, license: 'MIT' };
    const tarballs = { '2.0.0': 'a', '2.0.1': 'b', '2.0.2': 'c' };
    const release = (version, readme, { code: c = code } = {}) => {
      const files = new Map([['index.js', c], ['README.md', Buffer.from(readme)]]);
      // manifest の files：各ファイルの同一性の sha256（checkVendor2 がカタログの写しと照らす）
      const manifest = Buffer.from(JSON.stringify({ version, files: Object.fromEntries([...files].map(([f, b]) => [`base/${f}`, h(b)])) }));
      return { version, tag: 'v' + version, tarballSha256: tarballs[version].repeat(64), manifest, license: Buffer.from('MIT'),
        parts: { base: { version: '1.0.0', record: c === code ? record : { ...record, sha256: h(c) }, files } } };
    };
    const lockOf = () => JSON.parse(fs.readFileSync(path.join(root, 'components.lock.json'), 'utf8'));
    const lock2Of = () => JSON.parse(fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8'));
    const readme = (cv) => fs.readFileSync(path.join(resolveCatalogueContent(path, root, lockOf(), lock2Of(), cv, 'base'), 'README.md'), 'utf8');
    applyRelease2(release('2.0.0', 'first'), { root });
    const first = lockOf();
    const dir = resolveComponent(path, root, first, 'base', '1.0.0');
    ok(dir.split(path.sep).join('/').includes('/vendor/components/sha256/') && fs.existsSync(path.join(dir, 'index.js')), '2.0 import writes content-addressed code, resolved through the shared lock');
    ok(first.components.bars.default === '1.13.1' && checkVendor2(root).length === 0, '2.0 import preserves 1.x defaults and does not apply release-wide 1.x withdrawals to library versions');
    ok(lock2Of().catalogues['2.0.0'].content.base === first.components.base.content['1.0.0'], 'the catalogue records the content of each part (catalogues.<version>.content)');

    // case 1: 同じ版・同じ index.js・違う README → 新しいカタログに新しい写し（written ではなく refreshed）。前のカタログは前のバイトのまま
    const second = applyRelease2(release('2.0.1', 'changed documentation'), { root });
    const next = lockOf();
    ok(second.written.length === 0 && eq(second.refreshed, ['base@1.0.0']), 'another catalogue with the same index.js but a changed README is reported as refreshed, not written');
    ok(readme('2.0.1') === 'changed documentation' && readme('2.0.0') === 'first', 'the new catalogue resolves the new README; the older catalogue still resolves its own release’s README');
    ok(eq(next.components.base, first.components.base) && resolveComponent(path, root, next, 'base', '1.0.0') === dir && fs.existsSync(dir),
      'components.lock.json keeps the version’s content (the code the build reads and records stays where it was) and the older copy is kept');
    const dir2 = resolveCatalogueContent(path, root, next, lock2Of(), '2.0.1', 'base');
    ok(dir2 !== dir && fs.readFileSync(path.join(dir2, 'index.js')).equals(code), 'both copies hold the same index.js');
    ok(checkVendor2(root).length === 0, 'the store still matches components2.lock.json, components.lock.json and each catalogue’s manifest');
    // 取り直し（同じリリースをもう一度）は何も変えない
    const before = fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8');
    applyRelease2(release('2.0.0', 'first'), { root });
    ok(fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8') === before, 'importing an imported release again changes nothing');
    fs.appendFileSync(path.join(dir2, 'README.md'), 'tampered');
    ok(checkVendor2(root).some((e) => /2\.0\.1: base@1\.0\.0: content hash mismatch/.test(e)), 'the storage check covers each catalogue’s whole content object, including documentation');
    fs.writeFileSync(path.join(dir2, 'README.md'), 'changed documentation');
    // カタログの写しと manifest の files が違えば言う（写しと記録した hash が一緒に書き替わっていても）
    const m1 = path.join(root, 'vendor', 'components-2', 'manifest-2.0.1.json');
    const lk = lock2Of();
    lk.catalogues['2.0.1'].content.base = lk.catalogues['2.0.0'].content.base;
    fs.writeFileSync(path.join(root, 'components2.lock.json'), JSON.stringify(lk));
    ok(checkVendor2(root).some((e) => /catalogue 2\.0\.1: base\/README\.md does not match manifest-2\.0\.1\.json/.test(e)), 'a catalogue pointing at another release’s bytes is reported against its manifest');
    fs.writeFileSync(path.join(root, 'components2.lock.json'), before);
    ok(fs.existsSync(m1) && checkVendor2(root).length === 0, 'restored');
    // content のない古い固定：版の写しに戻る（1.x の components.lock.json だけを読む人・前の Studio の固定）
    const old2 = lock2Of();
    for (const c of Object.values(old2.catalogues)) delete c.content;
    ok(lock2Problems(old2).length === 0 && resolveCatalogueContent(path, root, next, old2, '2.0.1', 'base') === dir, 'a lock without catalogue content is valid and resolves the version’s content');
    ok(resolveCatalogueContent(path, root, next, lock2Of(), '2.0.1', 'base', '9.9.9') === null && resolveCatalogueContent(path, root, next, lock2Of(), '9.9.9', 'base') === null,
      'an unknown version or catalogue resolves nothing');
    const badLock = lock2Of(); badLock.catalogues['2.0.0'].content = { base: 'x', extra: '0'.repeat(64) };
    ok(lock2Problems(badLock).some((x) => /content\.base is not a sha256/.test(x)) && lock2Problems(badLock).some((x) => /content\.extra is not a part/.test(x)), 'lock2Problems checks catalogue content');

    // case 2: 同じ版・違う index.js → 断る（版を付け替えずに中身（コード）を変えた部品庫側の誤り）
    const badCode = Buffer.from('egatariParts.define({name: "base", version: "1.0.0", requires: {}}, function(){ return {x: 1}; });\n');
    let threw = null;
    try { applyRelease2(release('2.0.2', 'changed documentation again', { code: badCode }), { root }); } catch (e) { threw = e; }
    ok(threw && /base@1\.0\.0: index\.js differs/.test(threw.message), 'the same version with a different index.js is refused, not silently vendored, even though only the README also changed');
    ok(lock2Of().catalogues['2.0.2'] === undefined, 'a refused import writes nothing (no partial catalogue)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 取り込んだカタログに、README だけ直した新しいリリース（合成の版 2.9.9。実在のどのカタログの版ともぶつからない）を足しても、
// 前のカタログはどれも前のバイトのまま（写しの複製に、2.1.2 の写しから作ったリリースを当てる。boxplot-core・shape の README だけを変え、版はそのまま）
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-refresh-'));
  try {
    for (const f of ['components.lock.json', 'components2.lock.json']) fs.copyFileSync(path.join(ROOT, f), path.join(root, f));
    fs.cpSync(path.join(ROOT, 'vendor', 'components'), path.join(root, 'vendor', 'components'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'vendor', 'components-2'), path.join(root, 'vendor', 'components-2'), { recursive: true });
    const lockA = JSON.parse(fs.readFileSync(path.join(root, 'components.lock.json'), 'utf8')), lockA2 = JSON.parse(fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8'));
    const lock1Bytes = fs.readFileSync(path.join(root, 'components.lock.json'));
    const resolvedAll = () => Object.fromEntries(Object.entries(lockA2.catalogues).flatMap(([cv, c]) => Object.keys(c.parts).map((n) => [`${cv}/${n}`, resolveCatalogueContent(path, root, lockA, JSON.parse(fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8')), cv, n)])));
    const was = resolvedAll();
    const m212 = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'components-2', 'manifest-2.1.2.json'), 'utf8'));
    const cat = lockA2.catalogues['2.1.2'], parts = {}, mfiles = {};
    for (const [name, v] of Object.entries(cat.parts)) {
      const d = resolveCatalogueContent(path, root, lockA, lockA2, '2.1.2', name);
      const files = new Map();
      const walk = (rel) => { for (const e of fs.readdirSync(path.join(d, rel), { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else files.set(r, fs.readFileSync(path.join(d, r))); } };
      walk('');
      if (name === 'boxplot-core' || name === 'shape') files.set('README.md', Buffer.concat([files.get('README.md'), Buffer.from('\nA documentation fix in 2.9.9.\n')]));
      for (const [f, b] of files) mfiles[`${name}/${f}`] = crypto.createHash('sha256').update(identityBytes(`${name}/${f}`, b)).digest('hex');
      parts[name] = { version: v, record: lockA2.parts[name][v], files };
    }
    const manifest = Buffer.from(JSON.stringify({ ...m212, version: '2.9.9', tag: 'v2.9.9', files: mfiles }, null, 2));
    const r = applyRelease2({ version: '2.9.9', tag: 'v2.9.9', tarballSha256: 'f'.repeat(64), manifest, license: fs.readFileSync(path.join(root, 'vendor', 'components-2', 'LICENSE')), parts }, { root });
    ok(eq(r.refreshed.sort(), ['boxplot-core@1.0.0', 'shape@1.0.0']) && r.written.length === 0, `a README-only release is reported as refreshed (${r.refreshed.join(', ')})`);
    const now = resolvedAll();
    const moved = Object.keys(was).filter((k) => was[k] !== now[k]);
    ok(moved.length === 0, `every older catalogue resolves the same folders as before (${Object.keys(was).length} parts in ${Object.keys(lockA2.catalogues).length} catalogues)${moved.length ? ': moved ' + moved.join(', ') : ''}`);
    ok(fs.readFileSync(path.join(root, 'components.lock.json')).equals(lock1Bytes), 'components.lock.json is byte-for-byte unchanged (the build reads and records the same code paths)');
    const lockB2 = JSON.parse(fs.readFileSync(path.join(root, 'components2.lock.json'), 'utf8'));
    ok(/A documentation fix in 2\.9\.9/.test(fs.readFileSync(path.join(resolveCatalogueContent(path, root, lockA, lockB2, '2.9.9', 'boxplot-core'), 'README.md'), 'utf8')) &&
      !/A documentation fix/.test(fs.readFileSync(path.join(resolveCatalogueContent(path, root, lockA, lockB2, '2.1.2', 'boxplot-core'), 'README.md'), 'utf8')), 'the new catalogue resolves the new README; 2.1.2 keeps its own');
    const e = checkVendor2(root);
    ok(e.length === 0, `every catalogue, old and new, matches its own manifest after the import${e.length ? ': ' + e.slice(0, 5).join('; ') : ''}`);
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
  ok(eq(r2.requiresMissing, [{ part: 'x@0.1.0', requires: 'base@9.9.9' }]) && r.requiresMissing.length === 0,
    'missing requirements are separate from unknown top-level elements');
  const absent = { 'm-x': { ...local['m-x'], meta: { ...local['m-x'].meta, requires: { absent: '1.0.0', base: '9.9.9' } } } };
  ok(eq(resolveParts(lock2, cat, ['m-x'], { local: absent }).requiresMissing,
    [{ part: 'x@0.1.0', requires: 'absent@1.0.0' }, { part: 'x@0.1.0', requires: 'base@9.9.9' }]), 'every unavailable requirement is listed, including an unknown name');
  const available = { ...local, 'm-localbase': { meta: { name: 'base', version: '9.9.9', requires: {}, element: 'm-localbase' }, code: '', where: 'components/localbase/index.js' } };
  const resolvedLocal = resolveParts(lock2, cat, ['m-x'], { local: available });
  ok(resolvedLocal.requiresMissing.length === 0 && resolvedLocal.parts[0].version === '9.9.9', 'an exact embedded requirement needs no catalogue entry');
  // bars・pie が既定のカタログで要る base の版（固定の文字列にしない：既定のカタログが変わっても通る）
  const barsBase = lock2.parts.bars[lock2.catalogues[cat].parts.bars].requires.base;
  const pieVersion = lock2.catalogues[cat].parts.pie;
  const broken = structuredClone(lock2);
  broken.parts.base[barsBase].requires = { absent: '1.0.0' };
  ok(eq(resolveParts(broken, cat, ['m-bars']).requiresMissing, [{ part: `base@${barsBase}`, requires: 'absent@1.0.0' }]), 'transitive requirements name the part that needs them');
  const cyclic = { 'm-x': { ...local['m-x'], meta: { ...local['m-x'].meta, requires: { x: '0.1.0' } } } };
  const cycle = resolveParts(lock2, cat, ['m-x'], { local: cyclic });
  ok(cycle.requiresMissing.length === 0 && cycle.warn.some((w) => /cycle/.test(w)), 'cycles keep their existing warning without a missing requirement');
  // 2 つの版が並ぶ（試しの固定のファイル。合成の版 9.9.9 は既定のカタログの実在の版とぶつからない）
  const two = JSON.parse(JSON.stringify(lock2));
  two.parts.base['9.9.9'] = { ...two.parts.base[barsBase] };
  two.parts.pie['9.9.9'] = { ...two.parts.pie[pieVersion], requires: { base: '9.9.9' } };
  ok(lock2Problems(two).length === 0, 'test lock with two base versions is well formed');
  const r3 = resolveParts(two, cat, ['m-bars', 'm-pie'], { pins: { pie: '9.9.9' } });
  const ids3 = r3.parts.map((p) => `${p.name}@${p.version}`);
  ok(ids3.includes(`base@${barsBase}`) && ids3.includes('base@9.9.9') && ids3.indexOf('base@9.9.9') < ids3.indexOf('pie@9.9.9'), `two versions of base side by side: ${ids3.join(' ')}`);
  const barsDefault = lock2.catalogues[cat].parts.bars;
  const r4 = resolveParts(lock2, cat, ['m-bars'], { pins: { bars: '7.0.0' } });
  ok(r4.parts.some((p) => p.name === 'bars' && p.version === barsDefault) && r4.warn.some((w) => /bars: version "7\.0\.0" is not in/.test(w)), 'a pin that is not vendored falls back to the catalogue with a warning');
  // 要素の名前は 1 つ（§6.1 Order）：同じ要素の名前を定義するパーツが 2 つ要る → conflicts（組み立ては断る）
  const three = JSON.parse(JSON.stringify(lock2));
  three.parts.bars['2.1.0'] = { ...three.parts.bars[barsDefault] };
  const localB = { 'm-y': { meta: { name: 'y', version: '0.1.0', requires: { bars: '2.1.0' }, element: 'm-y' }, code: '', where: 'components/y/index.js' } };
  const r5 = resolveParts(three, cat, ['m-bars', 'm-y'], { local: localB });
  ok(r5.conflicts.length === 1 && new RegExp(`<m-bars> is defined by bars@${barsDefault.replace(/\./g, '\\.')} and bars@2\\.1\\.0`).test(r5.conflicts[0]), `two versions of one element part are a conflict (${r5.conflicts[0]})`);
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

// ---------------------------------------------------------------- 名前で絞る（§6.2 Subset by name）と教材の字（§6.2 Subset、egatari-spec 6f2670b）
// tools/fixtures/subset-names/expected.json は部品庫の参照の実装（egatari/components tools/subset-produce.mjs の produce、c004416）が同じ入力から出したもの。
// 同じ宣言・同じ教材（.html は原稿、.md は口述原稿）・同じ glyphs なら、絞ったコードのバイト（sha256）・keys・names が同じ。形の悪い宣言はパーツを全部のまま
{
  const FX = path.join(ROOT, 'tools/fixtures/subset-names');
  const rd = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
  const hash = (s) => crypto.createHash('sha256').update(String(s).replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
  const exp = JSON.parse(rd('expected.json'));
  const textOf = (c) => lessonText(c.inline || c.lessons.map((f) => (f.endsWith('.md') ? { narration: rd(f) } : { html: rd(f) })), c.glyphs || '');
  for (const c of exp.cases) {
    const full = rd(c.part);
    const r = subsetCode(full, c.build.subset, textOf(c));
    if (c.warning) {
      ok(hash(full) === c.full && r.problems.length > 0 && r.code === full && !r.blocks.length && hash(r.code) === c.sha256,
        `${c.name}: reported and kept whole, as the reference (${r.problems.join('; ')} / reference: ${c.warning})`);
      continue;
    }
    ok(hash(full) === c.full && !r.problems.length && hash(r.code) === c.sha256 && Buffer.byteLength(r.code) === c.bytes && r.keys === c.keys && eq(r.names, c.names),
      `${c.name}: the same bytes as the reference (${c.bytes} B, sha256 ${c.sha256.slice(0, 12)}…), keys ${JSON.stringify(r.keys)}, names ${JSON.stringify(r.names)}${r.problems.length ? ' / ' + r.problems.join('; ') : ''}`);
    const again = subsetCode(full, c.build.subset, r.keys, [...(r.names || [])].reverse());
    ok(again.code === r.code && eq(again.names, r.names), `${c.name}: applying the recorded keys and names (in any order) to the full code gives the same bytes`);
  }
  // 部品庫の §9 の確かめ（tools/test-subset.mjs 9）：教材の字の節
  const T9 = lessonText([{ html: `<section class="slide" data-home="user-plus"><h2>A &amp; B &#x3042;&nbsp;x</h2><!-- comment-word -->
<m-cards title='chart-line'><script type="application/json">{"cards":[{"icon":"chart-pie","n":12.5,"ok":true}]}</script></m-cards>
<m-x><script type="application/json">{"broken": </script></m-x><script>var hidden = "script-word";</script><style>.style-word{}</style></section>` },
  { narration: '<b>narr-word</b>' }], 'G');
  const P9 = T9.split('\n');
  ok(['A & B あ\u00a0x', 'user-plus', 'chart-line', 'cards', 'icon', 'chart-pie', 'n', '12.5', '{"broken": ', '<b>narr-word</b>', 'G'].every((x) => P9.includes(x)),
    'counted: text (references decoded), attribute values, JSON names, strings (escapes decoded) and numbers, invalid JSON as written, narration as written, glyphs');
  ok(!/section|data-home|class|m-cards|m-x|comment-word|script-word|style-word|true|hidden/.test(T9.replace('<b>narr-word</b>', '')) && P9.includes('slide') && P9.includes('application/json'),
    'not counted: tag and attribute names, comments, other <script>, <style>, booleans (attribute values such as slide and application/json are)');
  const tk = lessonTokens(lessonText([{ html: '<m-cards><script type="application/json">{"cards":[{"icon":"\\u0075ser"}]}</script></m-cards>' }]));
  ok(eq([...tk].sort(), ['application', 'cards', 'icon', 'json', 'user']), `tokens of a lesson: ${JSON.stringify([...tk].sort())} (the type attribute's value counts; the tag names do not; \\u is read)`);
  // 字の参照（egatari-spec c09b233）：HTML のパーサーが読むとおり（WHATWG の全部の表と最長一致、; のない古い名前と属性の値の例外、数の参照の直し、CR・CRLF）。
  // references.json は参照の実装（c004416）の htmlPieces が出したもの
  const R9 = lessonText([{ html: '<p title="&copy2 &amp=x &hellip;">&hellip;&mdash;&copy2 &notit; &#x80;&#0;&#12354 AT&T &unknown;</p>' }]).split('\n');
  ok(R9[0] === '&copy2 &amp=x …' && R9[1] === '…—©2 ¬it; €\ufffdあ AT&T &unknown;', `character references as an HTML parser yields them: ${JSON.stringify(R9)}`);
  const refs = JSON.parse(rd('references.json')).cases, refBad = refs.filter((c) => !eq(htmlPieces(c.html), c.pieces));
  ok(refs.length >= 25 && !refBad.length, `${refs.length} reference edge cases (text and attribute values) read as the reference does${refBad.length ? ': ' + refBad.map((c) => c.html + ' → ' + JSON.stringify(htmlPieces(c.html))).join('; ') : ''}`);
  // 文書として読む（egatari-spec subset-parse c6024bf）：parse-cases.json は参照の実装（c004416）の htmlPieces が出したもの（はじめ規格から手で書き、照らして一致）
  const pc = JSON.parse(rd('parse-cases.json')).cases, pcBad = pc.filter((c) => !eq(htmlPieces(c.html), c.pieces));
  ok(pc.length >= 10 && !pcBad.length, `${pc.length} parse cases as the reference: doctype, comments, duplicate attributes, <plaintext>, SVG CDATA, <title>, <textarea>, <noscript>, template${pcBad.length ? ' / ' + pcBad.map((c) => c.name + ' → ' + JSON.stringify(htmlPieces(c.html))).join('; ') : ''}`);
  // 部品庫の §10 の確かめ（tools/test-subset.mjs 10）
  const P10 = lessonText([{ html: `<!DOCTYPE html><html lang="ja"><head><title>T &amp; <b>in-title</b></title></head><body>
<p a="first" a="second">p</p><textarea>x <i>in-textarea</i> &lt;</textarea><noscript><span>in-noscript</span></noscript><xmp><u>in-xmp</u> &amp;</xmp>
<div><![CDATA[<em>html-cdata</em>]]><?pi <em>in-pi</em>?></div>
<template><span>in-template</span></template>
<svg><text><![CDATA[svg-cdata <tag>]]></text><style>.svg-style{}</style></svg>
<plaintext><q>in-plaintext</q> &amp;` }]).split('\n');
  const has = (x) => P10.includes(x);
  ok(!P10.includes('html') && P10.includes('ja'), 'the doctype yields nothing (no token html); the lang attribute value counts');
  ok(has('T & <b>in-title</b>') && has('x <i>in-textarea</i> <'), `<title> and <textarea> are one text node each, references decoded: ${JSON.stringify(P10.filter((x) => /title|textarea/.test(x)))}`);
  ok(has('<span>in-noscript</span>') && has('<u>in-xmp</u> &amp;'), '<noscript> (scripting enabled) and <xmp> are raw text, not tags (and no references decoded in <xmp>)');
  ok(!P10.some((x) => /CDATA|<em>|\?pi/.test(x)) && has('html-cdata]]>') && has('in-pi?>'), 'CDATA and processing instructions in HTML are bogus comments up to the first ">" (not counted); what follows is parsed as usual');
  ok(has('first') && !has('second'), 'duplicate attributes: only the first is kept');
  ok(has('in-template'), 'template contents count');
  ok(has('svg-cdata <tag>') && !P10.some((x) => /svg-style/.test(x)), 'CDATA in SVG is text; <style> in SVG is not counted');
  ok(P10.at(-1) === '<q>in-plaintext</q> &amp;\n' || P10.at(-1) === '<q>in-plaintext</q> &amp;', `<plaintext> takes the rest as raw text: ${JSON.stringify(P10.at(-1))}`);
  ok(eq([...lessonTokens('ab\ncd')], ['ab', 'cd']), 'pieces are joined by a line feed: tokens never fuse across them');
  // 部品庫の §8 の確かめ（tools/test-subset.mjs 8）
  const t = lessonTokens(lessonText([rd('lesson-names.html')]));
  ok(!t.has('chart-bar') && t.has('chart-bar-popular') && t.has('chart') && !t.has('home') && !t.has('Chart-Bar') && !t.has('chart_bar'),
    'tokens: chart-bar-popular stays whole, "_" and case split or differ, comments do not count');
  const blk = (code, name = 'icons') => JSON.parse(new RegExp(`/\\*@egatari-block ${name}\\*/([\\s\\S]*?)/\\*@egatari-block-end\\*/`).exec(code)[1]);
  const npart = rd('names-part.js'), ndecl = exp.cases[0].build.subset;
  const nr = subsetCode(npart, ndecl, lessonText([rd('lesson-names.html')]));
  ok(eq(Object.keys(blk(nr.code)), ['_notice', 'chart-bar-popular', 'user', 'x']) && eq(Object.keys(blk(nr.code, 'marks')), ['_n', 'あ']) && nr.keys === 'あ' && eq(nr.names, ['chart-bar-popular', 'user', 'x']),
    `chart-bar-popular does not keep chart-bar; keep: ["x"] is kept; keys hold char entries only, names in code point order (${JSON.stringify(nr.names)})`);
  // ライブラリのパーツ（icons 1.0.0 の形）：MIT の _notice は最初の欄のまま残る
  const ic = rd('icons.js'), icDecl = exp.cases[2].build.subset, icSub = subsetCode(ic, icDecl, lessonText([rd('lesson-icons.html')]));
  ok(Object.keys(blk(icSub.code))[0] === '_notice' && blk(icSub.code)._notice === blk(ic)._notice && /MIT License/.test(blk(ic)._notice) && icSub.code.includes('/* MIT data: Tabler Icons'),
    'icons: the MIT notice (the block\'s first member "_notice", and the comment before the block) survives the subset');
  ok(eq(subsetCode(ic, icDecl, 'chart-bar user', []).names, []), 'names given: the text is not split again; a part with a name entry that keeps none records names []');
  const cOnly = subsetCode('A = /*@egatari-block m*/{"あ":1,"い":2}/*@egatari-block-end*/;', { data: 'block:m', key: 'char' }, 'あ user');
  ok(cOnly.names === null && cOnly.keys === 'あ', 'a part with char entries only records no names');
  // 形の悪い宣言（§6.2 Bad declarations）：知らせて、パーツは全部のまま（ほかの塊も絞らない）、blocks は []（索引に subset を書かない）
  const whole = (decl, code = npart) => { const x = subsetCode(code, decl, 'あ user', undefined); return { p: x.problems.join('; '), whole: x.code === code && !x.blocks.length && x.names === null }; };
  const marks = { data: 'block:marks', key: 'char' };
  const bad = [
    ['an unknown match', [marks, { data: 'block:icons', key: 'name', match: 'word' }], /is not "char" or "name"/],
    ['a keep name outside ^[a-z0-9]+(-[a-z0-9]+)*$', [marks, { data: 'block:icons', key: 'name', match: 'name', keep: ['Bad'] }], /keep is not an array of names/],
    ['keep that is not an array', [marks, { data: 'block:icons', key: 'name', match: 'name', keep: 'x' }], /keep is not an array of names/],
    ['keep on a char entry', [{ ...marks, keep: ['x'] }, { data: 'block:icons', key: 'name', match: 'name' }], /keep is not an array of names/],
    ['a missing block', [marks, { data: 'block:nope', key: 'name', match: 'name' }], /nope: not found/],
    ['a block that is not JSON', [marks, { data: 'block:icons', key: 'name', match: 'name' }], /not JSON/, npart.replace('"user": [', '"user": [,')],
    ['a name key that is not a name', [marks, { data: 'block:icons', key: 'name', match: 'name' }], /\["Home"\] are not names/, npart.replace('"home"', '"Home"')],
    ['a non-string key (array item, name entry)', { data: 'block:list', key: 'id', match: 'name' }, /no string "id"/, rd('names-array.js').replace('{"id":"x","d":3}', '{"id":3,"d":3}')],
    ['a non-string key (array item, char entry)', { data: 'block:s', key: 'char' }, /no string "char"/, 'B = /*@egatari-block s*/[{"char":"あ"},{"char":1}]/*@egatari-block-end*/; C = /*@egatari-block t*/{"あ":1,"い":1}/*@egatari-block-end*/;'],
    ['an array item that is not an object', { data: 'block:s', key: 'char' }, /no string "char"/, 'B = /*@egatari-block s*/[{"char":"あ"},"い"]/*@egatari-block-end*/;'],
  ];
  const res = bad.map(([what, decl, re, code]) => { const w = whole(decl, code); return [what, re.test(w.p) && w.whole, w.p]; });
  ok(res.every((x) => x[1]), `bad declarations are reported and the whole part is kept, its other blocks too: ${res.filter((x) => !x[1]).map((x) => x[0] + ' (' + x[2] + ')').join('; ') || res.map((x) => x[0]).join(', ')}`);
  // 索引の components[].subset.names（index schema）
  const c = { name: 'icons', version: '1.0.0', sha256: 'a'.repeat(64), source: 'registry' };
  const v = (s) => validateIndex({ components: [{ ...c, subset: { keys: '', sha256: 'b'.repeat(64), ...s } }] }).filter((x) => /^components/.test(x));
  ok(v({ names: ['chart-bar', 'user'] }).length === 0 && v({ names: [] }).length === 0 && v({ names: 'user' }).length === 1 && v({ names: ['User'] }).length === 1 && v({ names: ['x', 'x'] }).length === 1,
    'index components[].subset.names: an array of names, each once, is checked');
}

// ---------------------------------------------------------------- 写し
{
  const e = checkVendor2(ROOT);
  ok(e.length === 0, `content-addressed parts match components2.lock.json${e.length ? ': ' + e.join('; ') : ''}`);
  // カタログごとに、引いた写しのファイルがそのリリースの manifest の files（各ファイルの同一性の sha256）とちょうど同じ
  for (const cv of Object.keys(lock2.catalogues).sort()) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components-2', `manifest-${cv}.json`), 'utf8'));
    const bad = [], got = new Set();
    for (const [name, v] of Object.entries(lock2.catalogues[cv].parts)) {
      const d = resolveCatalogueContent(path, ROOT, contentLock, lock2, cv, name);
      const walk = (rel) => { for (const x of fs.readdirSync(path.join(d, rel), { withFileTypes: true })) { const r = rel ? `${rel}/${x.name}` : x.name; if (x.isDirectory()) walk(r); else got.add(`${name}/${r}`); } };
      walk('');
      if (m.components[name].version !== v) bad.push(`${name}@${v} is ${m.components[name].version} in the manifest`);
    }
    for (const f of got) if (!m.files[f] || crypto.createHash('sha256').update(identityBytes(f, fs.readFileSync(path.join(resolveCatalogueContent(path, ROOT, contentLock, lock2, cv, f.split('/')[0]), ...f.split('/').slice(1))))).digest('hex') !== m.files[f]) bad.push(f);
    for (const f of Object.keys(m.files)) if (f !== 'LICENSE' && !got.has(f)) bad.push(`${f} missing`);
    ok(bad.length === 0, `catalogue ${cv}: every resolved file matches manifest-${cv}.json (${got.size} files)${bad.length ? ': ' + bad.slice(0, 8).join(', ') : ''}`);
  }
  const rc = lock2.catalogues['2.0.0-rc.1'];
  ok(rc && rc.tarballSha256 === 'efc672e96c1842834eff4c1fcc3603bc2efa4ce4076768b4e27ad6df7a69cf1c' && rc.tag === 'v2.0.0-rc.1', 'components 2.0.0-rc.1 is pinned to the verified tarball');
  const v2 = lock2.catalogues['2.0.0'];
  ok(v2 && v2.tag === 'v2.0.0' && v2.tarballSha256 === 'a6bf864ca7b4034af2125f2c8f67d51bb6671a9f7a8c543ca16d288f283bd7db' &&
    v2.manifestSha256 === 'b8e117f4e67cc292200d4fae4752a3c6a38c597a6ce951ad2e766d731503095f' &&
    ['timer', 'predict', 'flow', 'quad', 'cycle'].every((n) => v2.parts[n] === '2.0.1'), 'components 2.0.0 is pinned to the verified release (timer/predict/flow/quad/cycle 2.0.1)');
  // 2.1.0（#142 のアイコンと札の並び・m-keyboard 2.0.1・m-orbit）：配布物と manifest の sha256 は部品庫のリリースのもの
  const v21 = lock2.catalogues['2.1.0'];
  ok(v21 && v21.tag === 'v2.1.0' && v21.tarballSha256 === '53b86b055b6905b3aad26e88ab0222ab76f518c0ba4a005e6bb237b2e14760cc' &&
    v21.manifestSha256 === '38757400260bbed882befb19144d18f30147c9256bb4e3551b8f6c39529c1334' &&
    v21.parts.cards === '2.0.0' && v21.parts.icons === '1.0.0' && v21.parts.keyboard === '2.0.1' && v21.parts.orbit === '2.0.0' &&
    lock2.parts.icons['1.0.0'].build.subset[0].match === 'name', 'components 2.1.0 is pinned to the verified release (cards, icons with subset by name, keyboard 2.0.1, orbit)');
  // 2.1.1（m-orbit 2.0.1 の直し・timer と tape の demo.html の直し。他の部品は 2.1.0 と同じ版・同じ sha256）：配布物と manifest の sha256 は部品庫のリリースのもの
  const v211 = lock2.catalogues['2.1.1'];
  ok(v211 && v211.tag === 'v2.1.1' && v211.tarballSha256 === '29cfc2c344ddf4b785469e8634a7f7cf31e3d307e3bcf71ec4b6ed0166b9a6a7' &&
    v211.manifestSha256 === 'fe7d165827e4ab6226cdb0d343db07f4304134af178edf7735e3a0eed760fe1f' &&
    v211.parts.orbit === '2.0.1' && lock2.parts.orbit['2.0.1'].sha256 === 'dbbd262ab28045a0f5e0cbec09b6068a0343668bf21e61bb02f8d0c4c1bc2ea7' &&
    Object.keys(v211.parts).filter((n) => n !== 'orbit').every((n) => v211.parts[n] === v21.parts[n]),
    'components 2.1.1 is pinned to the verified release (m-orbit 2.0.1 fix; every other part the same version as 2.1.0)');
  // 2.1.2（38 の要素のパーツの監査からの直し。コードだけで、README・demo の文言・doc・static shape は変えない。m-kakijun だけ版そのまま、
  // ほかの 37 はパッチが上がる。各パーツの sha256 は egatari/components のリリースの published.json から）：既定。配布物と manifest の
  // sha256 は部品庫のリリースのもの
  const v212 = lock2.catalogues['2.1.2'];
  const LIBRARIES_212 = ['base', 'boxplot-core', 'codetree-core', 'expr', 'heatmap-core', 'hist-core', 'icons', 'kanbun-core', 'markup-reader', 'plot', 'shape'];
  const bumped212 = Object.keys(v212.parts).filter((n) => n !== 'kakijun' && !LIBRARIES_212.includes(n));
  ok(v212 && v212.tag === 'v2.1.2' && v212.tarballSha256 === '7204e2a70cfa725405bd68025976f463019f73ac9932d519ff2afa97d7d9f21e' &&
    v212.manifestSha256 === '454c03bd99ee12b9ad84ba97cb46981508c3f276f7a808c160cfc65cec7ac517',
    'components 2.1.2 is pinned to the verified release');
  ok(v212.parts.kakijun === v211.parts.kakijun && LIBRARIES_212.every((n) => v212.parts[n] === v211.parts[n]),
    'm-kakijun and every library part keep the same version as 2.1.1 (unaudited / unchanged code)');
  ok(bumped212.length === 37 && bumped212.every((n) => v212.parts[n] !== v211.parts[n]),
    '37 element parts (every element but m-kakijun) get a new patch version in 2.1.2');
  ok(v212.parts.hissan === '2.0.1' && lock2.parts.hissan['2.0.1'].sha256 === '46b986360d7ff3b688c071a850fed436eec264cf5c7b36ba6c7047735b15c806' &&
    v212.parts.boxplot === '2.0.1' && lock2.parts.boxplot['2.0.1'].sha256 === '91dbe36e346e2601a70b7b80fc2c56b6bd675cd390eb2f6c55947cbdfee3545d' &&
    v212.parts.orbit === '2.0.2' && lock2.parts.orbit['2.0.2'].sha256 === '7dbbb3852a77a1a3dcfba8c69574d2a87e6b87adbfa84f30c0359e2bae0afb2b',
    'components 2.1.2 fixes land in the pinned code (m-hissan products past 2^53, m-boxplot quartile rounding, m-orbit lit/shadow sides; sha256 from published.json)');
  // 候補 2.2.0（components 側はまだタグ・リリースなし。branch c2-base、5 度目の取り直し：bcb6c70 → 364e27f（14 の README から
  // 共通の表記の説明を抜く）→ b2711f8（国語の README をさらに削り、ライブラリの README の「2.0 alpha; not for lessons」の行も消す）
  // → 8d566f2（評価 B 向けのさらなる調整）→ 8b14bd5（リリース形。m-kakijun の README の frontmatter だけ tier: extra・set
  // （kokugo）を外す。コードは変えず 2.0.1 のまま）。標準化チームの評価用）：base 1.1.0 が下付き・上付きを 24px 以上・幅を測った
  // 推定に直し、要素パーツ 41 個（m-kakijun も含め全要素）がそれを求めて版が上がる（8 つのライブラリの土台は index.js そのまま、
  // README だけ refreshed）。manifest・tarball の sha256 は manifest.json のもの（まだ GitHub のリリースはないので published.json
  // との突き合わせはできない）
  const v220 = lock2.catalogues['2.2.0'];
  const LIBRARIES_220 = ['boxplot-core', 'codetree-core', 'expr', 'heatmap-core', 'hist-core', 'icons', 'kanbun-core', 'shape'];
  const bumped220 = Object.keys(v220.parts).filter((n) => !LIBRARIES_220.includes(n));
  ok(v220 && v220.tag === 'v2.2.0' && v220.tarballSha256 === 'abec0042fefb438b28df88b8af38b7b07577c61140b5576f4fff5e1d43deb3a2' &&
    v220.manifestSha256 === '26b3e9b50956ac0f70f6f132cf2af2de0de3d684f3df8c2181b6c2eb4d878ec1',
    'components 2.2.0 (release tag v2.2.0) is pinned to its tarball');
  ok(LIBRARIES_220.every((n) => v220.parts[n] === v212.parts[n]),
    'the 8 untouched library parts keep their 2.1.2 version in components 2.2.0 (README-only refresh, index.js unchanged)');
  ok(bumped220.length === 41 && bumped220.every((n) => v220.parts[n] !== v212.parts[n]) && v220.parts.kakijun === '2.0.1' && v220.parts.kakijun !== v212.parts.kakijun,
    'components 2.2.0: 41 parts get a new version, m-kakijun included this time (base 1.1.0 requires it everywhere)');
  ok(v220.parts.base === '1.1.0' && lock2.parts.base['1.1.0'].sha256 === '1a2d752bfea7b9c23871a46a77afd3585d71a9b041c078135195eccc0b347f85' &&
    v220.parts.kakijun === '2.0.1' && lock2.parts.kakijun['2.0.1'].sha256 === '5560e0b72fb55f574165d7bc915b511897a830ca7c6d0b7a06d61aed3bfae5f1',
    'components 2.2.0: base 1.1.0 (measured sub/superscript width, 24px floor) and m-kakijun 2.0.1 land in the pinned code (sha256 from the tarball; unchanged across every README-only rebuild)');
  ok(v220.parts.base === '1.1.0' && v220.parts['markup-reader'] === '1.0.1' && v220.parts.plot === '1.0.1' &&
    v220.parts.score === '2.1.0' && lock2.parts.score['2.1.0'].requires.base === '1.1.0',
    'components 2.2.0: base 1.1.0 / markup-reader 1.0.1 / plot 1.0.1 bump together; m-score 2.1.0 adds per-step (by="measure") and requires both');
  // 候補 2.3.0（components 側はまだタグ・リリースなし。branch c2-base d26231c）：版が上がるのは m-codetree 2.0.3 だけ（要素の
  // aria-label を表示名のハフマン木 / Huffman tree に合わせる、#168）。版を上げずに変わったのは codetree-core 1.0.0（README）、
  // icons 1.0.0（README と、アイコンの名前の言葉 en.json・ja.json が新しく入る。編集アプリのアイコンの検索が使う）、
  // m-predict 2.0.3（README：学ぶ人 → 学習者）で、どれも index.js はそのまま（refreshed）。manifest・tarball の sha256 は manifest.json のもの
  const v230 = lock2.catalogues['2.3.0'];
  ok(v230 && v230.tag === 'v2.3.0' && v230.tarballSha256 === '46480ea715b73ef01bed807501316df96f5aacb63a96fa01af5cf14ede7f0f39' &&
    v230.manifestSha256 === 'da1c17682f3b6df228453e4acc0b90d3e9c4c71d3fe9cf2cf8fa3f7de4d8b205',
    'components 2.3.0 is pinned to the released tarball (v2.3.0)');
  const bumped230 = Object.keys(v230.parts).filter((n) => v230.parts[n] !== v220.parts[n]);
  ok(Object.keys(v230.parts).length === Object.keys(v220.parts).length && bumped230.join() === 'codetree' && v220.parts.codetree === '2.0.2' && v230.parts.codetree === '2.0.3' &&
    lock2.parts.codetree['2.0.3'].sha256 === '3d67eecc6eab90e8832bbdfa6fff6bcc471c755132434fc3defd80999acd2fe3',
    `CANDIDATE 2.3.0: only m-codetree gets a new version (2.0.2 → 2.0.3) (${bumped230.join(', ')})`);
  const codetreeJs = fs.readFileSync(partFile('codetree', '2.0.3'), 'utf8');
  ok(codetreeJs.includes('"ハフマン木で "') && codetreeJs.includes('" with the Huffman tree: "') && !/符号の木|code tree/i.test(codetreeJs),
    'CANDIDATE 2.3.0: m-codetree 2.0.3 names itself ハフマン木 / Huffman tree in its aria-label (「ハフマン木で…を復号」 / "Decoding … with the Huffman tree")');
  const changed230 = Object.keys(v230.content).filter((n) => !bumped230.includes(n) && v230.content[n] !== v220.content[n]).sort();
  ok(changed230.join() === 'codetree-core,icons,predict', `CANDIDATE 2.3.0: only codetree-core@1.0.0, icons@1.0.0 and predict@2.0.3 change without a version bump (${changed230.join(', ')})`);
  const iconsDir = path.join(ROOT, 'vendor', 'components', 'sha256', v230.content.icons);
  ok(['en.json', 'ja.json'].every((f) => fs.existsSync(path.join(iconsDir, f))) && ['en.json', 'ja.json'].every((f) => !fs.existsSync(path.join(ROOT, 'vendor', 'components', 'sha256', v220.content.icons, f))),
    'CANDIDATE 2.3.0: icons 1.0.0 brings en.json and ja.json (icon words for the editor\'s icon search); the 2.2.0 copy has none');
  // 部品庫 2.4.0（リリース a383099、c2-base 54bf442）：新しいパーツ m-particles 2.0.0（理科の束）だけ。ほかのパーツは版も中身も 2.3.0 のまま
  const v240 = lock2.catalogues['2.4.0'];
  ok(v240 && v240.tag === 'v2.4.0' && v240.tarballSha256 === '4e8202f3b4cd742a78560789976f622c0f0c0380e3452a0274a952b25ee9574d' && v240.manifestSha256 === '468299a10cdb1336f370ff3c16032bd0dc1aef4e271613b64651d68efe06889e',
    'components 2.4.0 is pinned to the released tarball and manifest (v2.4.0)');
  const added240 = Object.keys(v240.parts).filter((n) => !(n in v230.parts));
  const bumped240 = Object.keys(v230.parts).filter((n) => v240.parts[n] !== v230.parts[n]);
  ok(added240.join() === 'particles' && v240.parts.particles === '2.0.0' && bumped240.length === 0,
    `2.4.0: only m-particles 2.0.0 is new; no other part changes version (new: ${added240.join(', ')}; bumped: ${bumped240.join(', ')})`);
  // 部品庫 2.4.1（リリース 24c70da、c2-base 9d18ad8）：sweep・curves 2.1.0、plot 1.1.0、boxplot・hist・scatter・seq 2.0.3、codetree 2.0.4。ほかは 2.4.0 のまま
  const v241 = lock2.catalogues['2.4.1'];
  ok(lock2.default === '2.4.1' && v241 && v241.tarballSha256 === 'aa686b0f27e338a518774906f3820b6020c1d7921828f6b9a26bc904cfa0d54d' && v241.manifestSha256 === '378a0360434f063451d112069eb8db7941982dc689669558742ad4f50f501ee1',
    'components 2.4.1 is the default and pinned to the released tarball and manifest (v2.4.1)');
  const bumped241 = Object.keys(v241.parts).filter((n) => v241.parts[n] !== v240.parts[n]).sort();
  ok(bumped241.join() === 'boxplot,codetree,curves,hist,plot,scatter,seq,sweep' && Object.keys(v241.parts).length === Object.keys(v240.parts).length,
    `2.4.1: exactly boxplot, codetree, curves, hist, plot, scatter, seq and sweep get new versions (${bumped241.join(', ')})`);
  // 2.0 のパーツは再生器のグローバル（DECK）を使わない（注釈の外）
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const uses = Object.entries(rc.parts).filter(([n, v]) => /\bDECK\s*\./.test(strip(fs.readFileSync(partFile(n, v), 'utf8')))).map(([n]) => n);
  ok(uses.length === 0, `no 2.0 part reads DECK (${uses.join(', ') || 'none'})`);
}
// ---------------------------------------------------------------- 選んだカタログにない要素（#165。format spec §6）
{
  const u = deckElements(`<html><body><m-a></m-a><!-- <m-b></m-b> --><template><m-c></m-c></template><pre>&lt;m-d&gt;</pre>
<script>DECK.define("m-e", class {}); customElements.define('m-f', class {}); egatariParts.define({name: "g", version: "1.0.0", element: "m-g"}, () => class {}); var s = "<m-h>";</script>
<script type="application/json">{"x": "<m-i>"}</script></body></html>`);
  ok(eq([...u.elements].sort(), ['m-a', 'm-c']) && eq([...u.defined].sort(), ['m-e', 'm-f', 'm-g']),
    `deckElements: elements outside comments, scripts and text; names the deck's scripts define (${JSON.stringify([[...u.elements], [...u.defined]])})`);
  ok(u.legacyApi === true && deckElements('<p>DECK.el in text</p><script type="application/json">"DECK.define"</script><script>egatariParts.define({name: "a", version: "1.0.0"}, () => ({}));</script>').legacyApi === false,
    "deckElements: legacyApi only when the deck's own code uses the player's 1.x helpers");
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8')), lock2 = parseLock2(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
  ok(eq(catalogueHint(lock, lock2, 'm-score'), { tag: 'm-score', catalogue: '1.x', hint: 'select2', value: '2' }), '1.x lesson, 2.x-only element: select "componentsCatalogue": "2"');
  ok(catalogueHint(lock, lock2, 'm-bars', null, '2.0.0').hint === 'pin' && catalogueHint(lock, lock2, 'm-bars', null, '1.13.0').hint === 'pin', 'a pinned element in a 1.x lesson names the pin (only asked when the pinned file is a 2.x part)');
  ok(eq(catalogueHint(lock, lock2, 'm-cards', '2.0.0'), { tag: 'm-cards', catalogue: '2.0.0', hint: 'select2', value: '2' }), '2.0.0 lesson, element added in 2.1.0: select the default catalogue');
  ok(catalogueHint(lock, lock2, 'm-plot').hint === 'library' && catalogueHint(lock, lock2, 'm-plot', '2.1.0').hint === 'library', 'a library part name is not an element in either catalogue');
  ok(catalogueHint(lock, lock2, 'm-nowhere').hint === 'unknown' && catalogueHint(lock, null, 'm-score').value === '2', 'unknown names stay unknown; without components2.lock.json the 1.x lock still points to 2.x');
  for (const a of [catalogueHint(lock, lock2, 'm-score'), catalogueHint(lock, lock2, 'm-cards', '2.0.0'), catalogueHint(lock, lock2, 'm-plot'), catalogueHint(lock, lock2, 'm-bars', null, '2.0.0')])
    ok(['ja', 'en'].every((l) => { const m = catalogueMessage(l, a); return m.includes('<' + a.tag + '>') && (a.hint === 'library' || m.includes('"componentsCatalogue": "2"')); }), `the ${a.hint} message names the element and the fix in ja and en`);
  // 登録簿は、再生器（kit/deck.js）の代わりの受け（playerGuard）を置き換える。ほかのものがあれば最初のものを残す
  const ctx = { HTMLElement: class {}, console: { warn() {} }, customElements: { get: () => undefined, define() {} } };
  ctx.globalThis = ctx;
  Object.defineProperty(ctx, 'egatariParts', { value: { define() {}, playerGuard: true }, configurable: true, writable: true });
  vm.createContext(ctx);
  vm.runInContext(REG, ctx);
  ok(!ctx.egatariParts.playerGuard && typeof ctx.egatariParts.status === 'function', "the registry replaces the player's guard");
}
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
