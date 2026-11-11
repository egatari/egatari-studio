// 版ごとの編集アプリ（tools/site-versions.mjs・app/version-ui.js）の単体の試験。ブラウザもネットワークも使わない
// test-all: unit
//   URL のパス → 凍結した写しの版・tar.gz の往復（並びと時刻を固定して同じバイト・長いパス・GNU tar でも読める）・変なパスやリンクを断る・
//   リリースの説明の sha256 の行と GitHub の digest・サイトの組み立て（根・/v<今の版>/・前の版・versions.json・古い写しへの案内の読み込み）・
//   パーツのサンプルのページ（/parts/v<版>/ を版の写しから出す・最初に公開したリリースのページを残す・/parts/index.html と versions.json）・
//   置く版の下限（HOSTED_FROM より前は tar.gz を取らず広げず、/vX.Y.Z/ に「もう置いていない」のページだけ。versions.json に入れない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packSite, readTar, unpackSite, recordedSha, verifyAsset, shaLine, sha256, assemble, injectNotice, assetName, safeRel,
  HOSTED_FROM, KEEP_PREVIOUS, hostedFloor, SITE_WARN, archivedAssetName, stubHtml, parseReleases, fetchReleases, floorCandidates } from './site-versions.mjs';
import { partsIndexHtml, STATIC_PAGE_CSP } from './parts-gallery.mjs';
import { siteVersionOf, cmpVersion, MARK } from '../app/version-ui.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const throws = (fn, re, m) => { try { fn(); ok(false, m + ' (did not throw)'); } catch (e) { ok(re.test(e.message), `${m}: ${e.message}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-versions-'));
const put = (dir, rel, text) => { const f = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

// ---------------------------------------------------------------- URL のパス
const cases = [['/', null], ['/index.html', null], ['/v0.4.2/', '0.4.2'], ['/v0.4.2/index.html', '0.4.2'], ['/v0.4.2/editor.html', '0.4.2'],
  ['/egatari-studio/v0.4.2/', '0.4.2'], ['/egatari-studio/', null], ['/v0.4.2/lab/irodori.html', null], ['/v0.4.2', null], ['/v0.4/', null], ['/v0.4.2-rc.1/', null], ['/x/v1.10.0/', '1.10.0']];
ok(cases.every(([p, v]) => siteVersionOf(p) === v), 'siteVersionOf: ' + cases.map(([p, v]) => `${p}→${siteVersionOf(p)}${siteVersionOf(p) === v ? '' : ' (want ' + v + ')'}`).join(', '));
ok(['0.4.1', '0.10.0', '0.4.10', '1.0.0', '0.4.2'].sort(cmpVersion).join() === '1.0.0,0.10.0,0.4.10,0.4.2,0.4.1', 'cmpVersion: newest first, numeric');

// ---------------------------------------------------------------- tar.gz
const A = path.join(tmp, 'a');
put(A, 'index.html', '<!DOCTYPE html><title>x</title>');
put(A, 'fonts/@fontsource/biz-udpgothic/files/' + 'very-long-name-'.repeat(4) + 'japanese-400-normal.woff2', Buffer.from([0, 1, 2, 3, 255]));
put(A, 'lab/日本語.txt', 'utf8 name');
put(A, 'empty.txt', '');
const gz1 = packSite(A), gz2 = packSite(A);
ok(Buffer.compare(gz1, gz2) === 0 && gz1[9] === 255, 'pack: the same folder gives the same bytes (no time, no OS byte)');
const ents = readTar(gz1);
ok(ents.map((e) => e.name).join('|') === ['empty.txt', 'fonts/@fontsource/biz-udpgothic/files/' + 'very-long-name-'.repeat(4) + 'japanese-400-normal.woff2', 'index.html', 'lab/日本語.txt'].join('|'), 'pack: files in name order, long path split into prefix and name');
const B = path.join(tmp, 'b');
unpackSite(gz1, B);
ok(packSite(B).equals(gz1), 'unpack: unpacking and packing again gives the same bytes');
fs.writeFileSync(path.join(tmp, 'x.tgz'), gz1);
// Windows の tar（bsdtar）は C:\ のパスと UTF-8 の名前の扱いが違うので、ほかの OS だけで（ワークフローが広げるのは Linux）
const lt = process.platform === 'win32' ? { error: true } : spawnSync('tar', ['-tzf', path.join(tmp, 'x.tgz')], { encoding: 'utf8' });
if (lt.error || lt.status !== 0) console.log('  skip system tar is not available (or Windows)');
else ok(lt.stdout.trim().split(/\r?\n/).sort().join('|') === ents.map((e) => e.name).sort().join('|'), 'pack: the system tar lists the same files');
// 変な中身
const rawTar = (name, type = '0', body = 'x') => {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(body.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.fill(' ', 148, 156); h.write(type, 156);
  h.write('ustar\0', 257); h.write('00', 263);
  let s = 0; for (const b of h) s += b; h.write(s.toString(8).padStart(6, '0') + '\0 ', 148);
  const d = Buffer.alloc(512); d.write(body);
  return zlib.gzipSync(Buffer.concat([h, d, Buffer.alloc(1024)]));
};
ok(readTar(rawTar('ok.txt')).length === 1, 'readTar: a hand-made entry reads');
throws(() => readTar(rawTar('../evil.txt')), /unsafe path/, 'readTar refuses ..');
throws(() => readTar(rawTar('/etc/evil')), /unsafe path/, 'readTar refuses an absolute path');
throws(() => readTar(rawTar('a/./b')), /unsafe path/, 'readTar refuses .');
throws(() => readTar(rawTar('link', '2')), /not allowed/, 'readTar refuses a symlink');
throws(() => readTar(rawTar('x', 'x')), /not allowed/, 'readTar refuses a pax header');
const badSum = Buffer.from(zlib.gunzipSync(rawTar('ok.txt'))); badSum[0] = 'p'.charCodeAt(0);
throws(() => readTar(zlib.gzipSync(badSum)), /checksum/, 'readTar refuses a bad checksum');
ok(!safeRel('a\\b') && !safeRel('') && !safeRel('a//b') && safeRel('a/b.c'), 'safeRel');

// ---------------------------------------------------------------- sha256 の記録
const hex = sha256(gz1);
const body = `## [0.4.1] - 2026-09-01\n\n- things\n\n${shaLine('0.4.1', hex)}\n`;
ok(recordedSha(body, '0.4.1') === hex && recordedSha(body, '0.4.2') === null, 'recordedSha: reads the line for its version only');
ok(recordedSha(`Editor site: \`${assetName('0.4.1')}\` sha256 \`${hex.toUpperCase()}\``, '0.4.1') === hex, 'recordedSha: tolerates code marks and upper case');
ok(verifyAsset(gz1, { version: '0.4.1', body, digest: 'sha256:' + hex }) === hex, 'verifyAsset: notes and digest match');
throws(() => verifyAsset(gz1, { version: '0.4.1', body: 'no line' }), /do not record/, 'verifyAsset: notes without the line');
throws(() => verifyAsset(gz1, { version: '0.4.1', body: shaLine('0.4.1', '0'.repeat(64)) }), /does not match the release notes/, 'verifyAsset: wrong sha in the notes');
throws(() => verifyAsset(gz1, { version: '0.4.1', body, digest: 'sha256:' + '1'.repeat(64) }), /digest/, "verifyAsset: GitHub's digest differs");

// ---------------------------------------------------------------- 組み立て
const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">';
const OLD = path.join(tmp, 'old');   // 案内を持たない古い版
put(OLD, 'index.html', `<!DOCTYPE html><html><head><meta charset="utf-8">\n${csp}\n<title>old</title></head><body></body></html>`);
put(OLD, 'editor.html', `<!DOCTYPE html><html><head>${csp}<script>var s="</head>";</script></head><body></body></html>`);
put(OLD, 'app.js', 'console.log("old")');
put(OLD, 'lab/irodori.html', 'lab');
const NEW = path.join(tmp, 'new');   // 案内を持つ版
put(NEW, 'index.html', `<!DOCTYPE html><html><head>${csp}</head></html>`);
put(NEW, 'app.js', `var MARK="${MARK}";`);
for (const lang of ['ja', 'en']) put(NEW, `egatari-make-0.4.2-${lang}.zip`, Buffer.from([0x50, 0x4b, lang === 'ja' ? 1 : 2]));
const SITE = path.join(tmp, 'site');
put(SITE, 'index.html', `<!DOCTYPE html><html><head>${csp}</head></html>`);
put(SITE, 'app.js', `var MARK="${MARK}"; /* root */`);
put(SITE, 'version-notice.js', '/* notice */');
put(SITE, 'examples/minimal.ega.html', 'ex');
for (const lang of ['ja', 'en']) put(SITE, `egatari-make-0.4.3-${lang}.zip`, Buffer.from([0x50, 0x4b, lang === 'ja' ? 3 : 4]));
put(SITE, 'v9.9.9/stale.txt', 'left from an earlier assemble');
const rel = (version, dir) => { const buf = packSite(dir); return { version, buf, body: shaLine(version, sha256(buf)), digest: null }; };
const logs = [];
const r = assemble({ site: SITE, current: '0.4.3', hostedFrom: '0.0.0', releases: [rel('0.4.1', OLD), rel('0.4.2', NEW), rel('0.4.3', OLD)], log: (m) => logs.push(m) });
const vj = JSON.parse(fs.readFileSync(path.join(SITE, 'versions.json'), 'utf8'));
ok(vj.root === '0.4.3' && vj.versions.join() === '0.4.3,0.4.2,0.4.1', 'assemble: versions.json lists the root and every frozen copy, newest first ' + JSON.stringify(vj));
ok(!fs.existsSync(path.join(SITE, 'v9.9.9')), 'assemble: version folders from an earlier run are removed');
for (const lang of ['ja', 'en']) {
  for (const [version, source] of [['0.4.3', SITE], ['0.4.2', NEW]]) {
    const name = `egatari-make-${version}-${lang}.zip`;
    ok(fs.readFileSync(path.join(SITE, `v${version}`, name)).equals(fs.readFileSync(path.join(source, name))), `assemble: ${name} stays byte-identical in the frozen copy`);
  }
}
ok(fs.readFileSync(path.join(SITE, 'v0.4.3', 'app.js'), 'utf8').includes('root') && fs.existsSync(path.join(SITE, 'v0.4.3', 'examples', 'minimal.ega.html')) && !fs.existsSync(path.join(SITE, 'v0.4.3', 'versions.json')),
  'assemble: /v<current>/ is a copy of the new build (the release asset of the same version is not used)');
const oi = fs.readFileSync(path.join(SITE, 'v0.4.1', 'index.html'), 'utf8'), oe = fs.readFileSync(path.join(SITE, 'v0.4.1', 'editor.html'), 'utf8');
ok(oi.includes(csp + `\n<script src="../version-notice.js" defer data-${MARK}></script>`) && oe.indexOf('../version-notice.js') > oe.indexOf(csp) && oe.indexOf('../version-notice.js') < oe.indexOf('var s='),
  'assemble: an old copy without the version notice loads ../version-notice.js right after its CSP (index.html and editor.html)');
ok(!fs.readFileSync(path.join(SITE, 'v0.4.2', 'index.html'), 'utf8').includes('version-notice') && r.injected['0.4.1'] && !r.injected['0.4.2'], 'assemble: a copy with its own notice is left as it is');
ok(fs.readFileSync(path.join(SITE, 'v0.4.1', 'lab', 'irodori.html'), 'utf8') === 'lab' && fs.readFileSync(path.join(SITE, 'app.js'), 'utf8').includes('root'), 'assemble: the old copy is unpacked as is; the root stays the new build');
ok(injectNotice(path.join(SITE, 'v0.4.1')).length === 0, 'injectNotice: running again changes nothing');
const bad = rel('0.4.0', OLD); bad.body = shaLine('0.4.0', 'f'.repeat(64));
throws(() => assemble({ site: SITE, current: '0.4.3', hostedFrom: '0.0.0', releases: [bad], log: () => {} }), /does not match/, 'assemble: a release whose asset does not match its notes fails the build');
const noIndex = path.join(tmp, 'noindex'); put(noIndex, 'app.js', 'x');
throws(() => assemble({ site: SITE, current: '0.4.3', hostedFrom: '0.0.0', releases: [rel('0.3.0', noIndex)], log: () => {} }), /no index\.html/, 'assemble: an asset without index.html fails');


// 候補（package.json が X.Y.Z-rc.N）：受け付ける。/v…/ の写しは作らず、版の一覧と根の版は前のリリースだけ（置かない版）
{
  const RS = path.join(tmp, 'rcsite');
  put(RS, 'index.html', 'rc build'); put(RS, 'app.js', 'x'); put(RS, 'v9.9.9/stale.txt', 'old');
  const rr = assemble({ site: RS, current: '0.4.4-rc.1', hostedFrom: '0.0.0', releases: [rel('0.4.3', OLD), rel('0.4.2', NEW)], log: () => {} });
  const rv = JSON.parse(fs.readFileSync(path.join(RS, 'versions.json'), 'utf8'));
  ok(rr.versions.join() === '0.4.3,0.4.2' && rv.root === '0.4.3' && rv.versions.join() === '0.4.3,0.4.2', 'assemble: an rc current lists the releases only; the root is the last full release ' + JSON.stringify(rv));
  ok(!fs.existsSync(path.join(RS, 'v0.4.4-rc.1')) && !fs.existsSync(path.join(RS, 'v0.4.4')) && fs.existsSync(path.join(RS, 'v0.4.3', 'index.html')), 'assemble: no /v…/ folder for an rc (nor for its X.Y.Z)');
  ok(!fs.existsSync(path.join(RS, 'v9.9.9')) && fs.readFileSync(path.join(RS, 'index.html'), 'utf8') === 'rc build', 'assemble: with an rc, stale folders go and the root stays the new build');
  const RN = path.join(tmp, 'rcnone'); put(RN, 'index.html', 'rc build');
  assemble({ site: RN, current: '0.0.1-rc.2', hostedFrom: '0.0.0', releases: [], log: () => {} });
  ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(RN, 'versions.json'), 'utf8'))) === '{"versions":[]}', 'assemble: an rc with no release before it writes an empty list and no root');
  for (const badv of ['0.4.4-rc', '0.4.4-rc.x', '0.4.4-beta.1', '0.4.4-rc.1-x', 'v0.4.4']) throws(() => assemble({ site: RS, current: badv, releases: [], log: () => {} }), /bad current version/, `assemble: ${badv} is refused`);
  // 道具の入口（package.json の版が候補で、--current も同じ）：版の読み方を通る
  const cli = (...a) => spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'site-versions.mjs'), 'assemble', ...a], { encoding: 'utf8' });
  const c = cli('--site', path.join(tmp, 'nosite'), '--current', 'v0.4.4-rc.x');
  ok(c.status === 1 && /not a release tag/.test(c.stderr), 'assemble CLI: --current must be vX.Y.Z or vX.Y.Z-rc.N');
}

// ---------------------------------------------------------------- パーツのサンプルのページ（/parts/。backlog #158）
// 前のリリース 0.6.4（2.1.1 を公開）・0.6.5（2.1.1 と 2.2.0 を持つ）、いま組んだ 0.6.6（2.2.0 と 2.3.0）：2.1.1 は 0.6.4 の、2.2.0 は 0.6.5 のページを残し、2.3.0 だけいま組んだもの
const P4 = path.join(tmp, 'p4'), P5 = path.join(tmp, 'p5'), PS = path.join(tmp, 'psite');
put(P4, 'index.html', 'v0.6.4'); put(P4, 'app.js', `var MARK="${MARK}";`); put(P4, 'parts/v2.1.1/index.html', 'gallery 2.1.1 from 0.6.4'); put(P4, 'parts/index.html', 'list 0.6.4');
put(P5, 'index.html', 'v0.6.5'); put(P5, 'app.js', `var MARK="${MARK}";`); put(P5, 'parts/v2.1.1/index.html', 'gallery 2.1.1 from 0.6.5'); put(P5, 'parts/v2.2.0/index.html', 'gallery 2.2.0 from 0.6.5');
put(PS, 'index.html', 'root'); put(PS, 'parts/v2.2.0/index.html', 'gallery 2.2.0 from 0.6.6'); put(PS, 'parts/v2.3.0/index.html', 'gallery 2.3.0 from 0.6.6');
put(PS, 'parts/versions.json', JSON.stringify({ current: '2.3.0', versions: ['2.2.0', '2.3.0'] }));
const pr = assemble({ site: PS, current: '0.6.6', releases: [rel('0.6.5', P5), rel('0.6.4', P4)], log: () => {} });
const pg = (v) => fs.readFileSync(path.join(PS, 'parts', 'v' + v, 'index.html'), 'utf8');
ok(pg('2.1.1') === 'gallery 2.1.1 from 0.6.4' && pg('2.2.0') === 'gallery 2.2.0 from 0.6.5' && pg('2.3.0') === 'gallery 2.3.0 from 0.6.6',
  'assemble parts: each parts library version keeps the page of the first release that published it; the new build fills the rest');
ok(['v0.6.6', 'v0.6.5', 'v0.6.4'].every((d) => !fs.existsSync(path.join(PS, d, 'parts'))) && fs.readFileSync(path.join(PS, 'v0.6.4', 'index.html'), 'utf8') === 'v0.6.4',
  'assemble parts: no /vX.Y.Z/parts/ (the pages live only under /parts/); the copies are otherwise as unpacked');
const pj = JSON.parse(fs.readFileSync(path.join(PS, 'parts', 'versions.json'), 'utf8'));
ok(pj.current === '2.3.0' && pj.versions.join() === '2.1.1,2.2.0,2.3.0' && pj.studio['2.1.1'] === '0.6.4' && pj.studio['2.2.0'] === '0.6.5' && pj.studio['2.3.0'] === '0.6.6' && pr.parts.current === '2.3.0',
  'assemble parts: parts/versions.json lists the versions, the current one (the root editor\'s) and which Studio published each ' + JSON.stringify(pj));
const li = fs.readFileSync(path.join(PS, 'parts', 'index.html'), 'utf8');
const at = (v) => li.indexOf(`href="v${v}/"`);
ok(at('2.3.0') > 0 && at('2.3.0') < at('2.2.0') && at('2.2.0') < at('2.1.1') && /<html lang="ja">/.test(li), 'assemble parts: parts/index.html links every version, current first, then newest first');
// 前のリリースが前に組んだ版を、置き直し（Run workflow でいまより前のタグ）でも残す：いま組んだ 0.6.4 より後の 0.6.5 の 2.1.1 は使わない
const PR = path.join(tmp, 'predeploy'); put(PR, 'index.html', 'root'); put(PR, 'parts/v2.1.1/index.html', 'gallery 2.1.1 from 0.6.4 (rebuilt)');
put(PR, 'parts/versions.json', JSON.stringify({ current: '2.1.1', versions: ['2.1.1'] }));
assemble({ site: PR, current: '0.6.4', releases: [rel('0.6.5', P5)], log: () => {} });
ok(fs.readFileSync(path.join(PR, 'parts', 'v2.1.1', 'index.html'), 'utf8') === 'gallery 2.1.1 from 0.6.4 (rebuilt)' && fs.existsSync(path.join(PR, 'parts', 'v2.2.0', 'index.html')),
  'assemble parts: deploying an earlier tag again keeps its own page and takes only versions it did not have from later releases');
const NP = path.join(tmp, 'noparts'); put(NP, 'index.html', 'root');
ok(assemble({ site: NP, current: '0.4.3', hostedFrom: '0.0.0', releases: [rel('0.4.1', OLD)], log: () => {} }).parts === null && !fs.existsSync(path.join(NP, 'parts')), 'assemble parts: no parts pages anywhere writes no /parts/');

// ---------------------------------------------------------------- 置く版の下限（HOSTED_FROM。作者の決定 2026-11-06）
ok(HOSTED_FROM === '0.6.0', 'HOSTED_FROM is 0.6.0');
{
  // gh の答え：v0.4.1 は tar.gz を .archived.tar.gz に名前を変えた、v0.4.8 は名前を戻した（.tar.gz）、v0.4.0 は tar.gz なし、v0.6.0・v0.6.5 は置く版
  const gh = [
    { tag: 'v0.4.0', draft: false, prerelease: false, body: '', assets: [] },
    { tag: 'v0.4.1', draft: false, prerelease: false, body: '', assets: [{ name: archivedAssetName('0.4.1'), digest: 'sha256:' + 'a'.repeat(64) }] },
    { tag: 'v0.4.8', draft: false, prerelease: false, body: shaLine('0.4.8', 'b'.repeat(64)), assets: [{ name: assetName('0.4.8'), digest: null }] },
    { tag: 'v0.6.0', draft: false, prerelease: false, body: '', assets: [{ name: assetName('0.6.0'), digest: null }] },
    { tag: 'v0.6.5', draft: false, prerelease: false, body: '', assets: [{ name: assetName('0.6.5'), digest: null }, { name: 'egatari-make-0.6.5-ja.zip', digest: null }] },
    { tag: 'v0.6.6-rc.1', draft: false, prerelease: true, body: '', assets: [{ name: assetName('0.6.6-rc.1'), digest: null }] },
  ].map((r) => JSON.stringify(r)).join('\n');
  const list = parseReleases(gh);
  const lr = (v) => list.find((r) => r.version === v);
  ok(list.map((r) => r.version).join() === '0.6.5,0.6.0,0.4.8,0.4.1,0.4.0' && lr('0.4.1').archived && !lr('0.4.1').asset && lr('0.4.8').asset && !lr('0.4.8').archived,
    'parseReleases: releases only (no rc), newest first, with the asset under either name');
  const asked = [], logs2 = [];
  const got = fetchReleases('o/r', { list: () => list, get: (repo, r) => { asked.push(r.version); return Buffer.from('x'); }, log: (m) => logs2.push(m) });
  ok(asked.join() === '0.6.5,0.6.0', 'fetchReleases: downloads only the hosted versions (none below the floor) ' + JSON.stringify(asked));
  ok(got.filter((r) => r.stub).map((r) => r.version).join() === '0.4.8,0.4.1' && got.filter((r) => r.stub).every((r) => !r.buf),
    'fetchReleases: below-floor releases with editor-site-vX.tar.gz or .archived.tar.gz are listed as stubs, without a download');
  ok(!got.some((r) => r.version === '0.4.0') && logs2.some((m) => /v0\.4\.0: no editor-site-v0\.4\.0\.tar\.gz/.test(m)), 'fetchReleases: a below-floor release without either asset is skipped');
  const asked2 = [];
  fetchReleases('o/r', { floor: null, list: () => list, get: (repo, r) => { asked2.push(r.version); return Buffer.from('x'); }, log: () => {} });
  ok(asked2.join() === '0.6.5,0.6.0,0.4.8', 'fetchReleases (verify, no floor): downloads every editor-site-vX.tar.gz, not the archived ones');

  // 組み立て：v0.4.1（.archived の目印だけ）・v0.4.8（tar.gz を渡しても sha が合わなくても使わない）は「もう置いていない」のページ、v0.6.0 は広げる
  const FS = path.join(tmp, 'floorsite'), F6 = path.join(tmp, 'f6');
  put(FS, 'index.html', `<!DOCTYPE html><html><head>${csp}</head></html>`); put(FS, 'app.js', `var MARK="${MARK}";`);
  put(F6, 'index.html', 'v0.6.0'); put(F6, 'app.js', `var MARK="${MARK}";`);
  const unverified = { version: '0.4.8', buf: packSite(OLD), body: shaLine('0.4.8', 'f'.repeat(64)), digest: null };
  const fl = [];
  const fr = assemble({ site: FS, current: '0.6.5', repo: 'o/r', releases: [{ version: '0.4.1', stub: true }, unverified, rel('0.6.0', F6)], log: (m) => fl.push(m) });
  const fv = JSON.parse(fs.readFileSync(path.join(FS, 'versions.json'), 'utf8'));
  ok(fv.versions.join() === '0.6.5,0.6.0' && fr.versions.join() === '0.6.5,0.6.0' && fr.stubs.join() === '0.4.8,0.4.1', 'assemble floor: versions.json lists only hosted versions; stubs are returned apart ' + JSON.stringify(fv));
  for (const v of ['0.4.1', '0.4.8']) {
    ok(fs.readdirSync(path.join(FS, 'v' + v)).join() === 'index.html', `assemble floor: /v${v}/ has only the stub index.html (nothing unpacked, no notice script)`);
    ok(fl.filter((m) => m.startsWith(`v${v}: below the hosting floor v0.6.0`)).length === 1, `assemble floor: one log line for v${v}`);
  }
  ok(fs.readFileSync(path.join(FS, 'v0.6.0', 'index.html'), 'utf8') === 'v0.6.0', 'assemble floor: a release at the floor is unpacked as before');
  const stub = fs.readFileSync(path.join(FS, 'v0.4.8', 'index.html'), 'utf8');
  ok(stub === stubHtml({ version: '0.4.8', repo: 'o/r' }), 'assemble floor: the stub is stubHtml');
  ok(stub.includes('href="https://github.com/o/r/releases/tag/v0.4.8"') && (stub.match(/href="\.\.\/"/g) || []).length === 2, 'stub: links to its GitHub release and to the latest (../), in both languages');
  ok(stub.includes('Egatari Studio v0.4.8 は、このサイトにはもう置いていません。一式は <a href="https://github.com/o/r/releases/tag/v0.4.8">GitHub のリリース</a>から取れます。') && stub.includes('>最新版を開く</a>'), 'stub: Japanese text');
  ok(stub.includes('Egatari Studio v0.4.8 is no longer hosted on this site. You can download it from its <a href="https://github.com/o/r/releases/tag/v0.4.8">GitHub release</a>.') && stub.includes('>Open the latest version</a>') && /<section lang="en">/.test(stub), 'stub: English text');
  // ほかのページと同じ点検：パーツの一覧（parts/index.html）と同じ決まりの <meta>、スクリプトなし、外から読むものなし、viewport・暗い色・lang
  const metaCsp = (h) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(h)?.[1];
  ok(metaCsp(stub) === STATIC_PAGE_CSP && metaCsp(partsIndexHtml({ current: '1.0.0', versions: ['1.0.0'] })) === STATIC_PAGE_CSP, 'stub: the same CSP meta as parts/index.html ' + metaCsp(stub));
  ok(!/<script/i.test(stub) && !/\son\w+=/i.test(stub) && !/(src|href)="(?!\.\.\/|https:\/\/github\.com\/o\/r\/releases\/tag\/v0\.4\.8")/.test(stub), 'stub: no scripts, no event handlers, no resources but ../favicon.svg; links only to the release and ../');
  ok(/<html lang="ja">/.test(stub) && /<meta charset="utf-8">/.test(stub) && /<meta name="viewport"/.test(stub) && /prefers-color-scheme:dark/.test(stub), 'stub: lang, charset, viewport and dark colours');
  ok(stubHtml({ version: '0.4.1', repo: 'a"b/<c>' }).includes('https://github.com/a&quot;b/&lt;c&gt;/releases/tag/v0.4.1'), 'stub: the repository name is escaped');
  // 名前を戻しても下限より前は置かない：tar.gz（正しい sha）を渡しても広げない
  const FS2 = path.join(tmp, 'floorsite2'); put(FS2, 'index.html', 'root');
  assemble({ site: FS2, current: '0.6.5', releases: [rel('0.4.2', OLD)], log: () => {} });
  ok(fs.readdirSync(path.join(FS2, 'v0.4.2')).join() === 'index.html' && JSON.parse(fs.readFileSync(path.join(FS2, 'versions.json'), 'utf8')).versions.join() === '0.6.5',
    'assemble floor: a below-floor release with a valid editor-site-vX.tar.gz is still only a stub (renaming the asset back does not re-host it)');
  ok(fs.readFileSync(path.join(FS2, 'v0.4.2', 'index.html'), 'utf8').includes('https://github.com/egatari/egatari-studio/releases/tag/v0.4.2'), 'stub: the default repository is egatari/egatari-studio');

  // 大きいサイトの知らせ：次に下限を上げる候補（置いている最も古い版）を挙げる
  const M = 1048576, sz = { '0.6.6': 60 * M, '0.6.5': 300 * M, '0.6.4': 300 * M, '0.6.0': 250 * M };
  const fc = floorCandidates(['0.6.6', '0.6.5', '0.6.4', '0.6.0'], '0.6.6', sz, 910 * M);
  ok(fc.drop.join() === '0.6.0' && fc.next === '0.6.4', 'floorCandidates: the oldest hosted versions until the site is under the warning size ' + JSON.stringify(fc));
  ok(floorCandidates(['0.6.6', '0.6.5', '0.6.4', '0.6.0'], '0.6.6', sz, 1150 * M).drop.join() === '0.6.0,0.6.4' && floorCandidates(['0.6.6'], '0.6.6', sz, 900 * M).drop.length === 0, 'floorCandidates: more when needed; none without older versions');
  const BIG = path.join(tmp, 'big'), B0 = path.join(tmp, 'b0'), B1 = path.join(tmp, 'b1');
  put(BIG, 'index.html', 'root'); put(B0, 'index.html', 'v0.6.0'); put(B1, 'index.html', 'v0.6.1'); put(B0, 'app.js', `var MARK="${MARK}";`); put(B1, 'app.js', `var MARK="${MARK}";`);
  const bl = [];
  assemble({ site: BIG, current: '0.6.2', releases: [rel('0.6.0', B0), rel('0.6.1', B1)], log: (m) => bl.push(m), hostedFrom: '0.6.0' });
  ok(!bl.some((m) => /^warning/.test(m)), 'assemble: no size warning for a small site');
  const wl = [];
  assemble({ site: BIG, current: '0.6.2', releases: [rel('0.6.0', B0), rel('0.6.1', B1)], log: (m) => wl.push(m), hostedFrom: '0.6.0', warnAt: 10 });
  const w = wl.find((m) => /^warning/.test(m)) || '';
  ok(/Candidates for the next floor raise \(HOSTED_FROM in tools\/site-versions\.mjs, now 0\.6\.0\): the oldest hosted versions v0\.6\.0 \(\d+ MB\), v0\.6\.1 \(\d+ MB\); set HOSTED_FROM to '0\.6\.2'/.test(w), 'assemble: the size warning names the oldest hosted versions as candidates for the next floor raise: ' + w);
  throws(() => assemble({ site: BIG, current: '0.6.2', releases: [rel('0.6.0', B0), rel('0.6.1', B1)], log: () => {}, hostedFrom: '0.6.0', maxAt: 10 }), /over the GitHub Pages limit.*the oldest hosted versions v0\.6\.0/, 'assemble: over the limit fails and names the candidates');
  ok(SITE_WARN === 800 * M && fc.next, 'SITE_WARN unchanged');
}

// ---------------------------------------------------------------- 置く前のリリースは 1 つ（KEEP_PREVIOUS。作者の決定 2026-11-11）
{
  ok(KEEP_PREVIOUS === 1, 'KEEP_PREVIOUS is 1');
  const rel = ['0.4.8', '0.6.0', '0.6.5', '0.6.6', '0.6.7', '0.6.8'];
  ok(hostedFloor(rel, '0.6.9') === '0.6.8', 'hostedFloor: releasing 0.6.9 keeps only v0.6.8');
  ok(hostedFloor([...rel, '0.6.9'], '0.6.9') === '0.6.8', 'hostedFloor: the current version itself is not counted as a previous release');
  ok(hostedFloor(rel, '0.6.9-rc.1') === '0.6.8', 'hostedFloor: a release candidate keeps the latest release before X.Y.Z');
  ok(hostedFloor([...rel, '0.6.9'], '0.6.10-rc.1') === '0.6.9', 'hostedFloor: the next candidate moves the window (v0.6.8 drops out)');
  ok(hostedFloor(rel, '0.6.9', { keep: 2 }) === '0.6.7', 'hostedFloor: keep 2');
  ok(hostedFloor(['0.4.8'], '0.6.0') === HOSTED_FROM, 'hostedFloor: no previous release at or above HOSTED_FROM gives HOSTED_FROM');
  // fetchReleases + assemble with the rolling floor: only v0.6.8 is downloaded and unpacked; v0.6.7 and older get the stub
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'site-keep-'));
  fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>now</title>');
  const mk = (v) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'site-keep-src-')); fs.writeFileSync(path.join(d, 'index.html'), `<!doctype html><head>${csp}<title>v${v}</title></head>`); const b = packSite(d); fs.rmSync(d, { recursive: true, force: true }); return b; };
  const bufs = { '0.6.7': mk('0.6.7'), '0.6.8': mk('0.6.8') };
  const list = () => ['0.6.7', '0.6.8'].map((v) => ({ version: v, tag: 'v' + v, body: shaLine(v, sha256(bufs[v])), asset: { name: assetName(v), digest: null }, archived: null }));
  const fetched = [];
  const floor = hostedFloor(['0.6.7', '0.6.8'], '0.6.9');
  const rs = fetchReleases('o/r', { skip: '0.6.9', floor, list, log: () => {}, get: (_repo, r) => { fetched.push(r.version); return bufs[r.version]; } });
  ok(fetched.join() === '0.6.8', 'rolling floor: only v0.6.8 is downloaded: ' + fetched.join());
  const res = assemble({ site, current: '0.6.9', releases: rs, hostedFrom: floor, repo: 'o/r', log: () => {} });
  ok(res.versions.join() === '0.6.9,0.6.8' && res.stubs.join() === '0.6.7', 'rolling floor: hosted v0.6.9 and v0.6.8, v0.6.7 is a stub: ' + JSON.stringify({ v: res.versions, s: res.stubs }));
  ok(fs.readFileSync(path.join(site, 'v0.6.7', 'index.html'), 'utf8') === stubHtml({ version: '0.6.7', repo: 'o/r' }), 'rolling floor: /v0.6.7/ is the stub page');
  fs.rmSync(site, { recursive: true, force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
