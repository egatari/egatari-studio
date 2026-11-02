// 版ごとの編集アプリ（tools/site-versions.mjs・app/version-ui.js）の単体の試験。ブラウザもネットワークも使わない
// test-all: unit
//   URL のパス → 凍結した写しの版・tar.gz の往復（並びと時刻を固定して同じバイト・長いパス・GNU tar でも読める）・変なパスやリンクを断る・
//   リリースの説明の sha256 の行と GitHub の digest・サイトの組み立て（根・/v<今の版>/・前の版・versions.json・古い写しへの案内の読み込み）・
//   パーツのサンプルのページ（/parts/v<版>/ を版の写しから出す・最初に公開したリリースのページを残す・/parts/index.html と versions.json）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { packSite, readTar, unpackSite, recordedSha, verifyAsset, shaLine, sha256, assemble, injectNotice, assetName, safeRel } from './site-versions.mjs';
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
const r = assemble({ site: SITE, current: '0.4.3', releases: [rel('0.4.1', OLD), rel('0.4.2', NEW), rel('0.4.3', OLD)], log: (m) => logs.push(m) });
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
throws(() => assemble({ site: SITE, current: '0.4.3', releases: [bad], log: () => {} }), /does not match/, 'assemble: a release whose asset does not match its notes fails the build');
const noIndex = path.join(tmp, 'noindex'); put(noIndex, 'app.js', 'x');
throws(() => assemble({ site: SITE, current: '0.4.3', releases: [rel('0.3.0', noIndex)], log: () => {} }), /no index\.html/, 'assemble: an asset without index.html fails');


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
ok(assemble({ site: NP, current: '0.4.3', releases: [rel('0.4.1', OLD)], log: () => {} }).parts === null && !fs.existsSync(path.join(NP, 'parts')), 'assemble parts: no parts pages anywhere writes no /parts/');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
