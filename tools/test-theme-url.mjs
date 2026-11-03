// テーマの tokens.css の url(…)（画像）を組み立てが data: URI にする（npm test の単体の検査）
// test-all: unit
//   node tools/test-theme-url.mjs
// 確かめること：url(cover.png)（直接・--cover-bg のような変数・引用符つき・svg）が埋め込まれ組んだ HTML に url(cover.png) が残らない／
// data:・http(s):・絶対のパス・#断片は触らない／cover.png を変えるとテーマの sha256（index.themes）が変わる／pack → unpack → pack が同じ・
// themes/<名前>/ に画像が入る／テーマのフォルダの外を指す url は読まず知らせる（ロゴと同じ）／zip のテーマも tokens.css の url の画像を読む
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, buildPortable } from '../kit/build.mjs';
import { unpack } from './portable.mjs';
import { writeZip } from '../kit/core/zip-read.mjs';
import { readThemeZip } from '../app/theme-zip.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'motion-theme-url-')));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PNG2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#f00"/></svg>';
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const DECK_SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const TOKENS = `:root{ --base: #101010; --cover-bg: url(cover.png); --q: url("cover.png?v=1"); --s: url('img/mark.svg'); --ext: url(https://example.com/x.png); --d: url(data:image/png;base64,AAAA); --f: url(#frag); --abs: url(/etc/x.png); }
/* url(commented.png) */
.cover{ background: url( cover.png ) center/cover; }
`;
// deck: <tmp>/<name>/{deck.html, themes/t/{tokens.css, cover.png, img/mark.svg}}
const mk = (name, tokens = TOKENS, png = PNG) => {
  const d = path.join(tmp, name), t = path.join(d, 'themes', 't');
  fs.mkdirSync(path.join(t, 'img'), { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), DECK_SRC.replace(/(<html[^>]*\s)data-theme="[^"]*"/, '$1data-theme="t"').replace(/<html(?![^>]*data-theme)/, '<html data-theme="t"'));
  fs.writeFileSync(path.join(t, 'tokens.css'), tokens);
  fs.writeFileSync(path.join(t, 'cover.png'), png);
  fs.writeFileSync(path.join(t, 'img', 'mark.svg'), SVG);
  return { d, t, f: path.join(d, 'deck.html') };
};
const themeOf = (r, n = 't') => r.index.themes.find((x) => x.name === n);

ok('build: url(cover.png) (direct, via a custom property, quoted, ?query, svg) is inlined; others are left alone', () => {
  const { f } = mk('inline');
  const r = build(f, { subset: false });
  assert.ok(!/url\(\s*["']?cover\.png/.test(r.html), 'url(cover.png) is left');
  assert.ok(!r.html.includes('mark.svg'), 'svg is left');
  const b64 = PNG.toString('base64');
  assert.ok(r.html.includes(`--cover-bg: url("data:image/png;base64,${b64}")`));
  assert.ok(r.html.includes(`--q: url("data:image/png;base64,${b64}")`));
  assert.ok(r.html.includes(`background: url("data:image/png;base64,${b64}") center/cover`));
  assert.ok(r.html.includes('url("data:image/svg+xml;base64,'));
  for (const keep of ['url(https://example.com/x.png)', 'url(data:image/png;base64,AAAA)', 'url(#frag)', 'url(/etc/x.png)', 'url(commented.png)']) assert.ok(r.html.includes(keep), keep);
  assert.deepEqual(r.stats.warn.filter((w) => /テーマ/.test(w)), []);
});
ok('a url that is missing is left as it is and reported', () => {
  const { f } = mk('missing', ':root{ --base: #101010; --x: url(nope.png); }\n');
  const r = build(f, { subset: false });
  assert.ok(r.html.includes('url(nope.png)'));
  assert.ok(r.stats.warn.some((w) => /missing: テーマ「t」/.test(w) && /nope\.png/.test(w)), r.stats.warn.join('\n'));
});
ok('a url that leaves the theme folder is refused (not read) like a logo', () => {
  const { d, f } = mk('outside', ':root{ --base: #101010; --x: url(../../secret.png); --y: url(../../../secret.png); }\n');
  fs.writeFileSync(path.join(d, 'secret.png'), PNG);
  fs.writeFileSync(path.join(path.dirname(d), 'secret.png'), PNG);
  const r = build(f, { subset: false });
  assert.ok(r.html.includes('url(../../secret.png)') && r.html.includes('url(../../../secret.png)'));
  assert.ok(!r.html.includes(PNG.toString('base64')), 'the outside file was inlined');
  assert.equal(r.stats.warn.filter((w) => /refused: テーマ「t」の tokens\.css の url/.test(w)).length, 2, r.stats.warn.join('\n'));
});
ok('portable: cover.png is in themes/t/, changing it changes the theme sha256, pack -> unpack -> pack is identical', async () => {
  const a = mk('pk');
  const r1 = await buildPortable(a.f, { subset: false });
  assert.ok(r1.files['themes/t/cover.png'] && r1.files['themes/t/img/mark.svg'], Object.keys(r1.files).join(' '));
  assert.deepEqual(Buffer.from(r1.files['themes/t/cover.png']), PNG);
  const sha1 = themeOf(r1).sha256;
  assert.match(sha1, /^[0-9a-f]{64}$/);
  fs.writeFileSync(path.join(a.t, 'cover.png'), PNG2);
  const r2 = await buildPortable(a.f, { subset: false });
  assert.notEqual(themeOf(r2).sha256, sha1, 'sha256 did not change with cover.png');
  fs.writeFileSync(path.join(a.t, 'cover.png'), PNG);
  const r3 = await buildPortable(a.f, { subset: false });
  assert.equal(themeOf(r3).sha256, sha1);
  // pack -> unpack -> pack
  const out = path.join(a.d, 'out', 'deck.ega.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r3.html);
  const U = path.join(tmp, 'pk-unpacked');
  await unpack(out, U);
  assert.deepEqual(fs.readFileSync(path.join(U, 'themes/t/cover.png')), PNG);
  const again = await buildPortable(path.join(U, 'deck.html'), { subset: false });
  assert.equal(again.html, r3.html, 'pack(unpack(x)) === x');
  assert.equal(themeOf(again).sha256, sha1);
});
ok('theme zip: images named by url(…) in tokens.css are read (and nothing outside the folder)', async () => {
  const enc = new TextEncoder();
  const z = writeZip([['t/tokens.css', enc.encode(':root{--a:url(cover.png);--b:url(../x.png);--c:url(img/../cover.png)}')], ['t/cover.png', new Uint8Array(PNG)], ['x.png', new Uint8Array(PNG)], ['t/other.png', new Uint8Array(PNG)]].map(([n, b]) => [n, b, {}]));
  const t = await readThemeZip(z, 't.zip');
  assert.deepEqual([...t.get('t').keys()].sort(), ['cover.png', 'tokens.css']);
});

let n = 0;
try { for (const [name, fn] of tests) { await fn(); n++; console.log('ok   ' + name); } }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`ok   ${n} theme-url checks`);
