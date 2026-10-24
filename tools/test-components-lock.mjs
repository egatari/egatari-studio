// 部品庫の写しと版の固定の試験（ブラウザなし。ネットワークなし）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-components-lock.mjs
// 1. components.lock.json の読み取りと版の決め方（kit/core/components-lock.mjs）
// 2. 取り込み（tools/components-update.mjs）：試験用に作ったリリース（tarball と manifest.json）で、確かめてから書くこと・改ざんを断ること・
//    版を残すこと・同じ版を違う中身で置き換えないこと・付け替えたタグを断ること
// 3. 組み立ての版の選び方：一時のリポジトリの根（themes と写しと固定）に 2 つの版を置き、既定の版・opts.componentVersions・作業フォルダの
//    egatari.json の components・1 ファイルの組み直し（記録した sha256 に合う版）で、それぞれ正しい版の index.js を読むこと。展開が固定を書くこと
// 4. このリポジトリの写しが固定と合っていること（components:check と同じ）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parseLock, lockProblems, yankedInfo, replacementPlan, pickVersion, versionForSha, pinsForIndex, configPins } from '../kit/core/components-lock.mjs';
import { verifyRelease, applyRelease, checkVendor } from './components-update.mjs';
import { writeTarGz } from './components-tar.mjs';
import { nodeEnv } from '../kit/build.mjs';
import * as core from '../kit/core/build-core.mjs';
import { exportPortable, readPortable } from '../kit/core/portable.mjs';
import { ROOT } from './vendor-components.mjs';
import { unpackPins, registryWarnings } from './portable.mjs';
import { normalizeEol, toCrlf, identityBytes } from '../kit/core/identity-hash.mjs';
import { registryProblems } from '../app/portable-ws.js';

let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enc = (s) => new TextEncoder().encode(s);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-components-lock-'));

// ---------------------------------------------------------------- 1
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const LOCK = { components: { bars: { default: '1.1.0', versions: ['1.0.0', '1.1.0'], sha256: { '1.0.0': A, '1.1.0': B } } } };
await t('lock: valid lock; problems are named', () => {
  assert.deepEqual(lockProblems(LOCK), []);
  assert.ok(lockProblems({ components: { bars: { default: '2.0.0', versions: ['1.0.0'], sha256: { '1.0.0': A } } } }).some((x) => /default/.test(x)));
  assert.ok(lockProblems({ components: { '../x': { default: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': A } } } }).some((x) => /registry name/.test(x)));
  assert.ok(lockProblems({ components: { bars: { default: '../1', versions: ['../1'], sha256: { '../1': A } } } }).some((x) => /not a version/.test(x)));
  assert.ok(lockProblems({ components: { bars: { default: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': 'x' } } } }).some((x) => /sha256/.test(x)));
  assert.throws(() => parseLock('{'), /components\.lock\.json/);
});
await t('lock: version choice (pin, default, unknown pin) and hash lookup', () => {
  assert.equal(pickVersion(LOCK, 'bars').version, '1.1.0');
  assert.equal(pickVersion(LOCK, 'bars', '1.0.0').version, '1.0.0');
  const u = pickVersion(LOCK, 'bars', '9.9.9');
  assert.equal(u.version, '1.1.0'); assert.match(u.note, /9\.9\.9.*not in components\.lock\.json/);
  assert.equal(pickVersion(LOCK, 'nothing').version, null);
  assert.equal(versionForSha(LOCK, 'bars', A), '1.0.0');
  assert.equal(versionForSha(LOCK, 'bars', B), '1.1.0');
  assert.equal(versionForSha(LOCK, 'bars', 'c'.repeat(64)), null);
  const p = pinsForIndex(LOCK, [{ tag: 'm-bars', name: 'bars', version: '0.4.3', sha256: A, source: 'registry' }, { tag: 'm-x', name: 'x', version: '1', sha256: A, source: 'registry' }, { tag: 'm-y', name: 'y', version: 'local', sha256: A, source: 'embedded' }]);
  assert.deepEqual(p.pins, { bars: '1.0.0' });
  assert.deepEqual(p.missing.map((c) => c.name), ['x']);
  assert.deepEqual(configPins({ components: { bars: '1.0.0', '../x': '1.0.0', kpi: '../1', menu: 3 } }), { bars: '1.0.0' });
});

// ---------------------------------------------------------------- 2
function makeRelease(version, comps, { extra = null, license = 'MIT License\n', yanked } = {}) {
  const entries = [['LICENSE', enc(license)]];
  const components = {};
  for (const [name, files] of Object.entries(comps)) {
    const shas = {};
    for (const [f, text] of Object.entries(files)) { entries.push([`${name}/${f}`, enc(text)]); shas[f] = sha(enc(text)); }
    components[name] = { tag: `m-${name}`, sha256: shas['index.js'], files: shas };
  }
  if (extra) entries.push(extra);
  entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const gz = writeTarGz(entries);
  const manifest = { name: 'egatari-components', version, tag: `v${version}`, tarball: { file: `egatari-components-v${version}.tar.gz`, sha256: sha(gz) }, components,
    ...(yanked ? { yanked } : {}),
    files: Object.fromEntries(entries.filter(([p]) => !extra || p !== extra[0]).map(([p, b]) => [p, sha(b)])) };
  return { gz, manifest: enc(JSON.stringify(manifest)), m: manifest };
}
const R = path.join(tmp, 'root');
fs.mkdirSync(R, { recursive: true });
const V1 = { bars: { 'index.js': '// bars 1.0.0\n', 'README.md': '---\nname: m-bars\n---\n' }, kpi: { 'index.js': '// kpi 1.0.0\n' } };
const V2 = { bars: { 'index.js': '// bars 1.1.0\n', 'README.md': '---\nname: m-bars\n---\n' } };
await t('update: a release is checked, written to vendor/components/<name>/<version>/ and pinned', () => {
  const r1 = makeRelease('1.0.0', V1);
  const rel = verifyRelease('v1.0.0', r1.manifest, r1.gz);
  const out = applyRelease('v1.0.0', rel, { root: R });
  assert.deepEqual(out.added.sort(), ['bars', 'kpi']);
  assert.equal(fs.readFileSync(path.join(R, 'vendor/components/bars/1.0.0/index.js'), 'utf8'), '// bars 1.0.0\n');
  assert.equal(fs.readFileSync(path.join(R, 'vendor/components/LICENSE'), 'utf8'), 'MIT License\n');
  const lock = JSON.parse(fs.readFileSync(path.join(R, 'components.lock.json'), 'utf8'));
  assert.equal(lock.tag, 'v1.0.0'); assert.equal(lock.tarballSha256, r1.m.tarball.sha256);
  assert.deepEqual(lock.components.bars, { default: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': sha(enc(V1.bars['index.js'])) }, crlfSha256: { '1.0.0': sha(toCrlf(enc(V1.bars['index.js']))) } });
  assert.deepEqual(checkVendor(R).filter((x) => !/source is/.test(x)), []);
});
await t('update: a newer release keeps the old version; components not in it keep their default; re-importing is a no-op', () => {
  const r2 = makeRelease('1.1.0', V2);
  const out = applyRelease('v1.1.0', verifyRelease('v1.1.0', r2.manifest, r2.gz), { root: R });
  assert.deepEqual(out.added, ['bars']); assert.deepEqual(out.kept, ['kpi']);
  assert.ok(fs.existsSync(path.join(R, 'vendor/components/bars/1.0.0/index.js')), '1.0.0 kept');
  const lock = JSON.parse(fs.readFileSync(path.join(R, 'components.lock.json'), 'utf8'));
  assert.deepEqual(lock.components.bars.versions, ['1.0.0', '1.1.0']);
  assert.equal(lock.components.bars.default, '1.1.0');
  assert.equal(lock.components.kpi.default, '1.0.0');
  assert.deepEqual(Object.keys(lock.releases), ['v1.0.0', 'v1.1.0']);
  const again = applyRelease('v1.1.0', verifyRelease('v1.1.0', r2.manifest, r2.gz), { root: R });
  assert.deepEqual(again.added, []); assert.deepEqual(again.same, ['bars']);
  assert.deepEqual(checkVendor(R).filter((x) => !/source is/.test(x)), []);
  // リリースの manifest.json をバイトのまま写しに置き、lock に sha256（言いたいこと・見せ方を手元で読む。#99）
  const mf = path.join(R, 'vendor/components/manifest.json');
  assert.ok(Buffer.from(r2.manifest).equals(fs.readFileSync(mf)), 'the release manifest.json is kept byte for byte');
  assert.equal(JSON.parse(fs.readFileSync(path.join(R, 'components.lock.json'), 'utf8')).manifestSha256, sha(r2.manifest));
  fs.writeFileSync(mf, fs.readFileSync(mf, 'utf8').replace('1.1.0', '1.1.9'));
  assert.ok(checkVendor(R).some((x) => /manifest\.json does not match/.test(x)), 'a changed manifest.json is found');
  fs.writeFileSync(mf, Buffer.from(r2.manifest));
});
await t('update: refuses a tampered tarball, a file not in the manifest, a wrong version, a moved tag, and a replaced version', () => {
  const r = makeRelease('1.2.0', V2);
  const bad = Buffer.from(r.gz); bad[bad.length - 5] ^= 1;
  assert.throws(() => verifyRelease('v1.2.0', r.manifest, bad), /tarball sha256/);
  assert.throws(() => verifyRelease('v1.3.0', r.manifest, r.gz), /expected 1\.3\.0/);
  const m = JSON.parse(new TextDecoder().decode(r.manifest)); m.files['bars/index.js'] = A;
  assert.throws(() => verifyRelease('v1.2.0', enc(JSON.stringify(m)), r.gz), /does not match its sha256/);
  const x = makeRelease('1.2.0', V2, { extra: ['bars/evil.js', enc('x')] });
  assert.throws(() => verifyRelease('v1.2.0', x.manifest, x.gz), /not in manifest\.json/);
  // 同じタグを違う tarball で：付け替えたタグ
  const moved = makeRelease('1.1.0', { bars: { 'index.js': '// different\n' } });
  assert.throws(() => applyRelease('v1.1.0', verifyRelease('v1.1.0', moved.manifest, moved.gz), { root: R }), /Tags are never moved/);
  // 違うタグで同じ版の名前の写しを違う中身に：断る
  const lock = JSON.parse(fs.readFileSync(path.join(R, 'components.lock.json'), 'utf8'));
  delete lock.releases['v1.1.0']; fs.writeFileSync(path.join(R, 'components.lock.json'), JSON.stringify(lock));
  assert.throws(() => applyRelease('v1.1.0', verifyRelease('v1.1.0', moved.manifest, moved.gz), { root: R }), /never replaced/);
  assert.equal(fs.readFileSync(path.join(R, 'vendor/components/bars/1.1.0/index.js'), 'utf8'), '// bars 1.1.0\n', 'nothing written');
});
await t('update: unsafe paths in the tarball are refused', () => {
  assert.throws(() => writeTarGz([['../x', enc('1')]]), /unsafe path/);
});

// ---------------------------------------------------------------- 2b 取り下げた版（format spec §6）
const Y = path.join(tmp, 'yroot');
fs.mkdirSync(Y, { recursive: true });
const YK = { '1.0.0': { replacement: '1.1.0', reason: 'security fix', date: '2026-10-20' } };
await t('yanked: the lock records the manifest\'s yanked versions and replacement; older versions stay; a later manifest only adds', () => {
  const V2K = { ...V2, kpi: { 'index.js': '// kpi 1.1.0\n' } };   // 取り下げる版が既定のままの部品は残せない（lockProblems）ので、置き換えの版に全部の部品を入れる
  const a = makeRelease('1.0.0', V1), b = makeRelease('1.1.0', V2K, { yanked: YK });
  applyRelease('v1.0.0', verifyRelease('v1.0.0', a.manifest, a.gz), { root: Y });
  assert.equal(JSON.parse(fs.readFileSync(path.join(Y, 'components.lock.json'), 'utf8')).yanked, undefined);
  applyRelease('v1.1.0', verifyRelease('v1.1.0', b.manifest, b.gz), { root: Y });
  const lock = JSON.parse(fs.readFileSync(path.join(Y, 'components.lock.json'), 'utf8'));
  assert.deepEqual(lock.yanked, YK);
  assert.ok(fs.existsSync(path.join(Y, 'vendor/components/bars/1.0.0/index.js')), 'the yanked version is kept, not deleted');
  assert.deepEqual(lockProblems(lock), []); assert.deepEqual(checkVendor(Y).filter((x) => !/source is/.test(x)), []);
  assert.deepEqual(yankedInfo(lock, '1.0.0'), YK['1.0.0']); assert.equal(yankedInfo(lock, '1.1.0'), null);
  const c = makeRelease('1.2.0', V2K, { yanked: {} });
  applyRelease('v1.2.0', verifyRelease('v1.2.0', c.manifest, c.gz), { root: Y });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(Y, 'components.lock.json'), 'utf8')).yanked, YK, 'a yank is never forgotten');
  // 組み直しの案：bars・kpi とも index.js が変わる。部品庫にない部品は案に入らない
  const plan = replacementPlan(lock, [{ name: 'bars', version: '1.0.0' }, { name: 'nope', version: '1.0.0' }, { name: 'bars', version: '1.1.0' }]);
  assert.equal(plan.length, 1); assert.deepEqual([plan[0].name, plan[0].to, plan[0].sha256Changes], ['bars', '1.1.0', true]);
});
await t('yanked: malformed yanked in a manifest or lock is refused', () => {
  const bad = (y, re) => { const r = makeRelease('2.0.0', V2, { yanked: y }); assert.throws(() => verifyRelease('v2.0.0', r.manifest, r.gz), re); };
  bad({ '1.0.0': { replacement: '1.0.0', reason: 'x', date: '2026-10-20' } }, /later version/);
  bad({ '1.0.0': { replacement: '3.0.0', reason: 'x', date: '2026-10-20' } }, /newer than 2\.0\.0/);
  bad({ '2.0.0': { replacement: '2.0.1', reason: 'x', date: '2026-10-20' } }, /itself|newer|lists itself/);
  bad({ '1.0.0': { replacement: '1.1.0', reason: 'x', date: '2026-10-20' }, '1.1.0': { replacement: '1.2.0', reason: 'x', date: '2026-10-20' } }, /itself yanked/);
  bad({ '1.0.0': { replacement: '1.1.0', reason: '', date: 'today' } }, /reason|date/);
  bad([], /not an object/);
  // 既定の版は取り下げられない
  assert.ok(lockProblems({ yanked: YK, components: { bars: { default: '1.0.0', versions: ['1.0.0', '1.1.0'], sha256: { '1.0.0': A, '1.1.0': B } } } }).some((x) => /is yanked/.test(x)));
});

// ---------------------------------------------------------------- 3
// 一時のリポジトリの根：themes と、このリポジトリの m-bars の 2 つの版（1.0.0 は写しのまま、9.9.9 は印の行を足したもの）
const RB = path.join(tmp, 'buildroot');
fs.cpSync(path.join(ROOT, 'themes'), path.join(RB, 'themes'), { recursive: true });
const realLock = parseLock(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const barsV = realLock.components.bars.default;
const barsJs = fs.readFileSync(path.join(ROOT, 'vendor/components/bars', barsV, 'index.js'));
const newJs = Buffer.concat([Buffer.from('// test version 9.9.9\n'), barsJs]);
fs.mkdirSync(path.join(RB, 'vendor/components/bars', barsV), { recursive: true });
fs.mkdirSync(path.join(RB, 'vendor/components/bars/9.9.9'), { recursive: true });
fs.writeFileSync(path.join(RB, 'vendor/components/bars', barsV, 'index.js'), barsJs);
fs.writeFileSync(path.join(RB, 'vendor/components/bars/9.9.9/index.js'), newJs);
fs.writeFileSync(path.join(RB, 'components.lock.json'), JSON.stringify({ components: { bars: { default: '9.9.9', versions: [barsV, '9.9.9'], sha256: { [barsV]: sha(barsJs), '9.9.9': sha(newJs) } } } }));
const env = { ...nodeEnv, ROOT: RB };
const deckDir = path.join(tmp, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
fs.writeFileSync(path.join(deckDir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>版</title></head>
<body><div id="stage">
<section class="slide" id="s-bars1"><h2>棒</h2><div class="body"><m-bars aria-label="棒" style="height:300px"><script type="application/json">{"groups": [{"label": "A", "values": [1]}]}</script></m-bars></div></section>
</div></body></html>
`);
const src = path.join(deckDir, 'deck.html');
const which = (html) => (html.match(/\/\/ ---- m-bars \(([^)]+)\)/) || [])[1];
await t('build: the default version, a pin in opts.componentVersions, a pin in egatari.json, an unknown pin', () => {
  assert.equal(which(core.build(env, src, {}).html), 'vendor/components/bars/9.9.9/index.js');
  assert.equal(which(core.build(env, src, { componentVersions: { bars: barsV } }).html), `vendor/components/bars/${barsV}/index.js`);
  fs.writeFileSync(path.join(deckDir, 'egatari.json'), JSON.stringify({ docId: '00000000-0000-4000-8000-000000000001', components: { bars: barsV } }));
  assert.equal(which(core.build(env, src, {}).html), `vendor/components/bars/${barsV}/index.js`);
  fs.writeFileSync(path.join(deckDir, 'egatari.json'), JSON.stringify({ docId: '00000000-0000-4000-8000-000000000001', components: { bars: '7.7.7' } }));
  const r = core.build(env, src, {});
  assert.equal(which(r.html), 'vendor/components/bars/9.9.9/index.js');
  assert.ok(r.stats.warn.some((w) => /7\.7\.7.*not in components\.lock\.json/.test(w)), r.stats.warn.join('\n'));
  fs.writeFileSync(path.join(deckDir, 'egatari.json'), JSON.stringify({ docId: '00000000-0000-4000-8000-000000000001' }));
});
await t('single file: records the components release as version; rebuilding with carry uses the version whose hash was recorded', async () => {
  const a = await exportPortable(env, src, { componentVersions: { bars: barsV } });
  const ca = a.index.components.find((c) => c.tag === 'm-bars');
  assert.deepEqual([ca.version, ca.sha256, ca.source], [barsV, sha(barsJs), 'registry']);
  // 既定（9.9.9）でなく、記録した hash の版（barsV）で組み直す
  const b = await exportPortable(env, src, { carry: a.index });
  const cb = b.index.components.find((c) => c.tag === 'm-bars');
  assert.deepEqual([cb.version, cb.sha256], [barsV, sha(barsJs)]);
  // 何も固定しなければ既定の版
  const c = await exportPortable(env, src, {});
  assert.equal(c.index.components.find((x) => x.tag === 'm-bars').version, '9.9.9');
  const rd = await readPortable(a.html);
  assert.equal(rd.index.components[0].version, barsV);
  // 展開（npm run portable -- unpack）：記録の版を egatari.json に固定する（既定の版でも。format spec §3.3）。照合は知らせを出さない
  assert.deepEqual(unpackPins(a.index, RB), { bars: barsV });
  assert.deepEqual(unpackPins(c.index, RB), { bars: '9.9.9' });
  assert.deepEqual(registryWarnings(a.index, RB), []);
  const other = { components: [{ ...ca, sha256: 'c'.repeat(64) }] };
  assert.ok(registryWarnings(other, RB).some((w) => /different version/.test(w)));
});

// ---------------------------------------------------------------- 3b 同一性の hash（format spec §6：改行をそろえる）
await t('identity hash: CRLF, lone CR and a leading BOM hash like LF; binary files are not changed', () => {
  const lf = enc('a\nb\n'), crlf = enc('a\r\nb\r\n'), cr = enc('a\rb\r'), bom = new Uint8Array([0xef, 0xbb, 0xbf, ...lf]);
  for (const x of [crlf, cr, bom]) assert.equal(sha(normalizeEol(x)), sha(lf));
  assert.equal(normalizeEol(lf), lf, 'unchanged input is returned as is');
  assert.equal(sha(toCrlf(lf)), sha(crlf));
  const png = new Uint8Array([0x89, 0x0d, 0x0a, 0x1a]);
  assert.equal(identityBytes('logo.png', png), png);
  assert.equal(sha(identityBytes('tokens.css', crlf)), sha(lf));
});
await t('identity hash: a CRLF or BOM checkout of a component records the same sha256 in a single file as LF', async () => {
  const lfHash = sha(normalizeEol(newJs));
  for (const variant of [toCrlf(normalizeEol(newJs)), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), newJs])]) {
    fs.writeFileSync(path.join(RB, 'vendor/components/bars/9.9.9/index.js'), variant);
    const r = await exportPortable(env, src, {});
    assert.equal(r.index.components.find((x) => x.tag === 'm-bars').sha256, lfHash);
  }
  fs.writeFileSync(path.join(RB, 'vendor/components/bars/9.9.9/index.js'), newJs);
});
await t('identity hash: an old single file whose component hash was taken on CRLF bytes (Windows checkout) rebuilds with the same component', async () => {
  // 前の Studio が Windows の checkout で書き出した文書：記録の hash は CRLF のバイトの hash、版は Studio の版
  const lock = JSON.parse(fs.readFileSync(path.join(RB, 'components.lock.json'), 'utf8'));
  lock.components.bars.crlfSha256 = { [barsV]: sha(toCrlf(normalizeEol(barsJs))), '9.9.9': sha(toCrlf(normalizeEol(newJs))) };
  fs.writeFileSync(path.join(RB, 'components.lock.json'), JSON.stringify(lock));
  const a = await exportPortable(env, src, { componentVersions: { bars: barsV } });
  const old = structuredClone(a.index);
  Object.assign(old.components.find((x) => x.tag === 'm-bars'), { version: '0.4.3', sha256: sha(toCrlf(normalizeEol(barsJs))) });
  const b = await exportPortable(env, src, { carry: old });
  const cb = b.index.components.find((x) => x.tag === 'm-bars');
  assert.deepEqual([cb.version, cb.sha256], [barsV, sha(normalizeEol(barsJs))], 'rebuilt with the version the CRLF hash names');
  assert.deepEqual(b.registryEquivalent, ['m-bars']);
  assert.deepEqual(registryProblems(old, b.index, b.registryEquivalent), [], 'the editor allows tier B/C');
  assert.equal(registryProblems(old, b.index).length, 1, 'without the equivalence it would be a different component');
  assert.deepEqual(registryWarnings(old, RB), [], 'npm run portable -- unpack finds it');
  assert.deepEqual(unpackPins(old, RB), { bars: barsV });
});

// ---------------------------------------------------------------- 4
await t('this repository: vendor/components matches components.lock.json', () => {
  assert.deepEqual(checkVendor(ROOT), []);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
