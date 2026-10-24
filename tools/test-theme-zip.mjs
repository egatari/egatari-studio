// テーマの zip（app/theme-zip.js）と自分のテーマの作業場所（app/my-themes.js）の単体の試験（ブラウザなし）：GitHub の「Download ZIP」の深さ・いくつものテーマ・zip の中の extends・
// ..・絶対パス・シンボリックリンク・名前の決まり・大きすぎるもの、読むのはテーマに要るものだけ、フォルダとの後先、
// 取り出したテーマで組んだものがフォルダのテーマで組んだものと同じ（コマンドの組み立て、EGATARI_THEMES）。編集アプリでの読み込みは tools/test-app.mjs
// test-all: unit
//   node tools/test-theme-zip.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../kit/core/zip-read.mjs';
import { readThemeZip, themeZipErrorKind, THEME_ZIP_LIMITS } from '../app/theme-zip.js';
import { mergedThemeWorkspace, themeNamesOf, themeLabelOf, putMyTheme } from '../app/my-themes.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const enc = new TextEncoder();
const dec = new TextDecoder();
const kind = async (p) => { try { await p; } catch (e) { return [themeZipErrorKind(e), e]; } assert.fail('expected an error'); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// 縮めた項目（macOS の「圧縮」・GitHub と同じ deflate）
const z = (entries) => writeZip(entries.map(([n, d, o]) => { const b = typeof d === 'string' ? enc.encode(d) : new Uint8Array(d); return [n, b, { comp: zlib.deflateRawSync(b), ...(o || {}) }]; }));
const THEME = {
  'tml/tokens.css': ':root{--base:#123456;--theme-probe:#123456}\n',
  'tml/theme.json': JSON.stringify({ title: 'TML lab', logos: ['logos/mark.png'] }),
  'tml/logos/mark.png': PNG,
  'tml/logos/unused.png': PNG,
  'tml/README.md': '# readme\n',
  'tml/LICENSE': 'CC BY 4.0\n',
};
const under = (prefix, files) => Object.entries(files).map(([k, v]) => [prefix + k, v]);

ok('GitHub-style nested zip: themes/<name>/ under <repo>-main/ is found; only tokens.css, theme.json, the listed logo and LICENSE are read', async () => {
  const t = await readThemeZip(z([['egatari-themes-main/', ''], ['egatari-themes-main/README.md', '# repo'], ...under('egatari-themes-main/themes/', THEME), ['egatari-themes-main/tools/x.js', 'x']]), 'egatari-themes-main.zip');
  assert.deepEqual([...t.keys()], ['tml']);
  assert.deepEqual([...t.get('tml').keys()].sort(), ['LICENSE', 'logos/mark.png', 'theme.json', 'tokens.css']);
  assert.equal(dec.decode(t.get('tml').get('tokens.css')), THEME['tml/tokens.css']);
  assert.deepEqual([...t.get('tml').get('logos/mark.png')], [...PNG]);
});
ok('macOS 「圧縮」: <name>/… with __MACOSX/ and ._ files; a theme at the top of the zip takes the zip name', async () => {
  const t = await readThemeZip(z([...under('', THEME), ['__MACOSX/tml/._tokens.css', 'x'], ['tml/.DS_Store', 'x']]), 'tml.zip');
  assert.deepEqual([...t.keys()], ['tml']);
  const top = await readThemeZip(z([['tokens.css', ':root{}'], ['theme.json', '{}']]), 'mytheme.zip');
  assert.deepEqual([...top.keys()], ['mytheme']);
});
ok('several themes in one zip are all loaded; depth is capped', async () => {
  const t = await readThemeZip(z([['a/b/one/tokens.css', ':root{}'], ['two/tokens.css', ':root{}'], ['1/2/3/4/5/deep/tokens.css', ':root{}']]), 'x.zip');
  assert.deepEqual([...t.keys()].sort(), ['one', 'two']);
  const [k] = await kind(readThemeZip(z([['1/2/3/4/5/deep/tokens.css', ':root{}']]), 'x.zip'));
  assert.equal(k, 'no-theme');
});
ok('refused: .., absolute paths, backslashes, symbolic links, bad or duplicate theme names', async () => {
  for (const [entries, why] of [
    [[['x/../../evil/tokens.css', ':root{}']], 'path'],
    [[['/etc/tokens.css', ':root{}']], 'path'],
    [[['C:/t/tokens.css', ':root{}']], 'path'],
    [[['t\\tokens.css', ':root{}']], 'path'],
    [[['ok/tokens.css', ':root{}'], ['ok/logo.png', '/etc/passwd', { mode: 0o120777 }]], 'link'],
    [[['Bad_Name/tokens.css', ':root{}']], 'name'],
    [[['a/tml/tokens.css', ':root{}'], ['b/tml/tokens.css', ':root{}']], 'dup'],
  ]) {
    const [k, e] = await kind(readThemeZip(z(entries), 'x.zip'));
    assert.equal(k, 'refused', entries[0][0]);
    assert.equal(e.why, why, entries[0][0]);
    assert.ok(e.entry, 'the refused entry is named');
  }
});
ok('too large: the zip, a member, the total, the member count; broken and empty zips', async () => {
  const big = new Uint8Array(THEME_ZIP_LIMITS.tokens + 1);
  assert.equal((await kind(readThemeZip(z([['t/tokens.css', big]]), 'x.zip')))[0], 'too-large');
  // 宣言を偽った zip 爆弾（宣言は小さく、展開すると大きい）
  const bomb = new Uint8Array(8 * 1048576);
  assert.equal((await kind(readThemeZip(writeZip([['t/tokens.css', bomb, { comp: zlib.deflateRawSync(bomb), usize: 1000 }]]), 'x.zip')))[0], 'too-large');
  const logos = Array.from({ length: 5 }, (_, i) => `l${i}.png`);
  const four = new Uint8Array(THEME_ZIP_LIMITS.logo - 10);
  assert.equal((await kind(readThemeZip(z([['t/tokens.css', ':root{}'], ['t/theme.json', JSON.stringify({ logos })], ...logos.map((l) => ['t/' + l, four])]), 'x.zip')))[0], 'too-large');
  assert.equal((await kind(readThemeZip(writeZip(Array.from({ length: THEME_ZIP_LIMITS.members + 1 }, (_, i) => ['f' + i, enc.encode('x')])), 'x.zip')))[0], 'too-large');
  const good = z([['t/tokens.css', ':root{}']]);
  assert.equal((await kind(readThemeZip(good.slice(0, good.length - 30), 'x.zip')))[0], 'broken');
  assert.equal((await kind(readThemeZip(enc.encode('not a zip'), 'x.zip')))[0], 'broken');
  assert.equal((await kind(readThemeZip(z([['readme.txt', 'x']]), 'x.zip')))[0], 'no-theme');
});
ok('logos outside the theme directory and documents are not read', async () => {
  const t = await readThemeZip(z([['t/tokens.css', ':root{}'], ['t/theme.json', JSON.stringify({ logos: ['../u/logo.png', 'README.md', 'ok.png'] })], ['u/logo.png', PNG], ['t/README.md', 'x'], ['t/ok.png', PNG]]), 'x.zip');
  assert.deepEqual([...t.get('t').keys()].sort(), ['ok.png', 'theme.json', 'tokens.css']);
});

// ---------------------------------------------------------------- 作業場所（組み立てに渡す list・readBytes）と、フォルダとの後先
const memWs = (files, at = 1) => ({
  name: 'folder',
  list: async () => { const L = { files: new Map(), dirs: new Set() }; for (const [k, v] of Object.entries(files)) { L.files.set(k, { m: at, s: v.length }); const s = k.split('/'); for (let i = 1; i < s.length; i++) L.dirs.add(s.slice(0, i).join('/')); } return L; },
  readBytes: async (rel) => { if (!(rel in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return enc.encode(files[rel]); },
});
ok('merged workspace: zip themes and folder themes together; for the same name the more recent one wins', async () => {
  const zt = await readThemeZip(z([...under('', THEME), ['other/tokens.css', ':root{--z:1}']]), 'x.zip');
  const zipThemes = new Map([...zt].map(([n, files]) => [n, { files, at: 200 }]));
  const folder = memWs({ 'tml/tokens.css': ':root{--from:folder}', 'mine/tokens.css': ':root{}' });
  // フォルダが新しい（300）→ tml はフォルダ、other は zip
  let w = mergedThemeWorkspace(folder, 300, zipThemes);
  assert.deepEqual(await themeNamesOf(w), ['mine', 'other', 'tml']);
  assert.equal(dec.decode(await w.readBytes('tml/tokens.css')), ':root{--from:folder}');
  assert.equal(dec.decode(await w.readBytes('other/tokens.css')), ':root{--z:1}');
  assert.ok(!(await w.list()).files.has('tml/theme.json'), 'the folder theme is used whole (no files mixed in from the zip theme)');
  // zip が新しい（フォルダは 100）→ tml は zip
  w = mergedThemeWorkspace(folder, 100, zipThemes);
  const L = await w.list();
  assert.ok(L.files.has('tml/logos/mark.png') && L.dirs.has('tml/logos'));
  assert.equal(dec.decode(await w.readBytes('tml/tokens.css')), THEME['tml/tokens.css']);
  assert.equal(await themeLabelOf(w, 'tml'), 'TML lab');
  await assert.rejects(w.readBytes('tml/tokens.css', { max: 3 }), (e) => e.code === 'read-over');
  await assert.rejects(w.readBytes('tml/nothing.css'), (e) => e.code === 'ENOENT');
  // フォルダなし
  w = mergedThemeWorkspace(null, 0, zipThemes);
  assert.deepEqual(await themeNamesOf(w), ['other', 'tml']);
});

ok('my themes: putMyTheme (for other modules, e.g. a theme builder) refuses a bad name or a set without tokens.css before storing', async () => {
  const f = new Map([['tokens.css', enc.encode(':root{}')]]);
  await assert.rejects(putMyTheme('../x', f, { source: 'builder' }), TypeError);
  await assert.rejects(putMyTheme('Upper', f), TypeError);
  await assert.rejects(putMyTheme('ok', new Map([['theme.json', enc.encode('{}')]])), TypeError);
  await assert.rejects(putMyTheme('ok', new Map([['tokens.css', ':root{}']])), TypeError);
});

// ---------------------------------------------------------------- 組み立て：zip から取り出したテーマ（extends も zip の中）＝ フォルダのテーマ
ok('build: a deck built with themes taken from a zip (child extends a parent in the same zip) equals the build with the same themes from a folder', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-zip-'));
  try {
    const files = { ...THEME,
      'tml-dark/tokens.css': ':root{--bg:#101010;--theme-probe:#abcdef}\n',
      'tml-dark/theme.json': JSON.stringify({ extends: 'tml' }) };
    const folder = path.join(work, 'folder'), fromZip = path.join(work, 'from-zip');
    for (const [k, v] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(folder, k)), { recursive: true }); fs.writeFileSync(path.join(folder, k), v); }
    const t = await readThemeZip(z(under('egatari-themes-main/themes/', files)), 'egatari-themes-main.zip');
    assert.deepEqual([...t.keys()].sort(), ['tml', 'tml-dark']);
    for (const [n, m] of t) for (const [rel, b] of m) { const p = path.join(fromZip, n, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
    const deck = path.join(work, 'deck');
    fs.mkdirSync(deck);
    fs.writeFileSync(path.join(deck, 'deck.html'), fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8').replace('data-theme="default"', 'data-theme="tml-dark"'));
    fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(deck, 'narration.md'));
    const build = (dir, out) => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(deck, 'deck.html'), '-o', out], { encoding: 'utf8', env: { ...process.env, EGATARI_THEMES: dir, HOME: work } });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!/theme not found/.test(r.stdout + r.stderr), r.stdout + r.stderr);
      return fs.readFileSync(out, 'utf8');
    };
    const a = build(folder, path.join(work, 'a.html')), b = build(fromZip, path.join(work, 'b.html'));
    assert.ok(a.includes('--theme-probe:#abcdef') && a.includes('--base:#123456') && a.includes('data:image/png;base64,'), 'the child and its parent (and the parent logo) are in the build');
    assert.equal(a, b);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok  ' + name); } catch (e) { failed++; console.log('NG  ' + name + '\n    ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n    ')); }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
