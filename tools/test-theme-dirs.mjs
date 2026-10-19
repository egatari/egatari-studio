// 利用者のテーマのフォルダ（npm test の単体の検査）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-theme-dirs.mjs
// 確かめること：探す順（原稿のフォルダ → その themes/ → 利用者のテーマのフォルダ（EGATARI_THEMES の並びの順 → ~/.egatari/themes）→ 同梱の themes/）／
// EGATARI_THEMES（OS の区切り・見つからないフォルダの知らせ）と ~/.egatari/themes（シンボリックリンクのフォルダでもよい）／見つからないテーマは
// 名前を言って default で組む（編集アプリ向けの言い方も）。--theme で選んで見つからないものは今までどおり誤り／根の中の決まり（リンクや extends で
// 利用者のフォルダの外に出ない。extends "default" は同梱の default）／持ち運べる 1 ファイルは利用者のテーマを原稿の themes/<名前>/ として入れる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as core from '../kit/core/build-core.mjs';
import { nodeEnv, build, buildPortable } from '../kit/build.mjs';
import { userThemeDirs } from '../kit/theme-dirs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'motion-theme-dirs-')));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok   ' + name); };
let canLink = true;
try { fs.symlinkSync(tmp, path.join(tmp, '.probe'), 'dir'); fs.unlinkSync(path.join(tmp, '.probe')); } catch { canLink = false; }

// テーマ：tokens.css に印の色を入れる（組んだ HTML にその色があるかで、どれが選ばれたかを見る）
const theme = (dir, name, color, cfg = null) => {
  const d = path.join(dir, name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'tokens.css'), `:root{ --base: ${color}; }\n`);
  if (cfg) fs.writeFileSync(path.join(d, 'theme.json'), JSON.stringify(cfg));
  return d;
};
const DECK_SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const deck = (name, themeName) => {
  const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), DECK_SRC.replace(/(<html[^>]*\s)data-theme="[^"]*"/, `$1data-theme="${themeName}"`).replace(/<html(?![^>]*data-theme)/, `<html data-theme="${themeName}"`));
  return path.join(d, 'deck.html');
};
const buildWith = (dirs, f, opts = {}) => core.build({ ...nodeEnv, themeDirs: dirs }, f, { subset: false, ...opts });
const has = (r, color) => r.html.includes(`--base: ${color}`);

const U1 = path.join(tmp, 'u1'), U2 = path.join(tmp, 'u2'), OUT = path.join(tmp, 'outside');
theme(U1, 'mine', '#111111', { extends: 'default' });
theme(U1, 'only1', '#121212', { extends: 'default' });
theme(U2, 'mine', '#222222');
theme(U2, 'only2', '#232323', { extends: 'only1' });   // 親は別の利用者のフォルダから
theme(OUT, 'far', '#999999');
fs.writeFileSync(path.join(OUT, 'evil.css'), ':root{ --base: #666666; }\n');
const DEFAULT_BASE = '#1d4f91';

ok('order: user dirs in list order, before the bundled themes', () => {
  const f = deck('d-order', 'mine');
  let r = buildWith([U1, U2], f);
  assert.equal(r.stats.theme, 'mine'); assert.ok(has(r, '#111111')); assert.ok(!has(r, '#222222'));
  r = buildWith([U2, U1], f);
  assert.ok(has(r, '#222222') && !has(r, '#111111'));
  // extends "default" of a user theme is the bundled default
  r = buildWith([U1], f);
  assert.ok(r.html.includes(DEFAULT_BASE), 'the bundled default comes first');
  // a parent in another user dir
  r = buildWith([U1, U2], deck('d-chain', 'only2'));
  assert.ok(has(r, '#232323') && has(r, '#121212') && r.html.includes(DEFAULT_BASE));
});

ok('order: the deck folder and its themes/ win over user dirs', () => {
  const f = deck('d-local', 'mine');
  theme(path.join(tmp, 'd-local', 'themes'), 'mine', '#333333');
  const r = buildWith([U1], f);
  assert.ok(has(r, '#333333') && !has(r, '#111111'));
});

ok('order: user dirs win over the bundled themes', () => {
  const U3 = path.join(tmp, 'u3'); theme(U3, 'business', '#444444');
  const r = buildWith([U3], deck('d-shadow', 'business'));
  assert.ok(has(r, '#444444'));
});

ok('missing theme: named in the warning, built with default', () => {
  const f = deck('d-missing', 'nosuch');
  let r = buildWith([U1], f);
  assert.equal(r.stats.theme, 'default');
  const w = r.stats.warn.find((x) => x.startsWith('theme not found: "nosuch"'));
  assert.ok(w, r.stats.warn.join('\n'));
  assert.match(w, /EGATARI_THEMES/); assert.match(w, /themes\/nosuch\//);
  // the editor app has no user dirs (env.themeDirs is missing): say it cannot read them
  r = core.build({ ...nodeEnv, themeDirs: undefined }, f, { subset: false });
  assert.equal(r.stats.theme, 'default');
  assert.ok(r.stats.warn.some((x) => x.startsWith('theme not found: "nosuch"') && /編集アプリは利用者のテーマのフォルダ/.test(x)), r.stats.warn.join('\n'));
  // --theme given by the caller and not found: still an error
  assert.throws(() => buildWith([U1], f, { theme: 'nosuch' }), /theme not found: nosuch/);
  // a missing parent: warned, built without it
  const U4 = path.join(tmp, 'u4'); theme(U4, 'orphan', '#454545', { extends: 'gone' });
  r = buildWith([U4], deck('d-orphan', 'orphan'));
  assert.ok(has(r, '#454545') && r.stats.warn.some((x) => x.startsWith('theme not found: "gone"')));
});

ok('EGATARI_THEMES and ~/.egatari/themes', () => {
  const home = path.join(tmp, 'home'); fs.mkdirSync(home);
  let d = userThemeDirs({ EGATARI_THEMES: [U2, path.join(tmp, 'nope'), U1, U2].join(path.delimiter) }, home);
  assert.deepEqual([...d], [U2, U1]); assert.deepEqual(d.missing, [path.join(tmp, 'nope')]);
  d = userThemeDirs({}, home);
  assert.deepEqual([...d], []);
  const HT = path.join(home, '.egatari', 'themes'); fs.mkdirSync(HT, { recursive: true });
  d = userThemeDirs({ EGATARI_THEMES: U1 }, home);
  assert.deepEqual([...d], [U1, HT]);
  // through process.env (nodeEnv.themeDirs reads it at build time)
  const save = { E: process.env.EGATARI_THEMES, H: process.env.HOME, P: process.env.USERPROFILE };
  try {
    process.env.EGATARI_THEMES = [path.join(tmp, 'nope'), U2].join(path.delimiter); process.env.HOME = home; process.env.USERPROFILE = home;
    const r = build(deck('d-env', 'mine'), { subset: false });
    assert.ok(has(r, '#222222'));
    assert.ok(r.stats.warn.some((x) => x.startsWith('EGATARI_THEMES:') && x.includes('nope')));
  } finally {
    for (const [k, v] of [['EGATARI_THEMES', save.E], ['HOME', save.H], ['USERPROFILE', save.P]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

if (canLink) ok('~/.egatari/themes may be a symbolic link (the root is its real path)', () => {
  const home = path.join(tmp, 'home2'); fs.mkdirSync(path.join(home, '.egatari'), { recursive: true });
  fs.symlinkSync(U1, path.join(home, '.egatari', 'themes'), 'dir');
  const d = userThemeDirs({}, home);
  assert.deepEqual([...d], [U1]);
  const r = buildWith(d, deck('d-link', 'only1'));
  assert.ok(has(r, '#121212'));
});
else console.log('skip symbolic links (not allowed here)');

if (canLink) ok('containment: no escape from a user dir by links or extends', () => {
  const U5 = path.join(tmp, 'u5');
  const e1 = theme(U5, 'linktok', '#000001'); fs.rmSync(path.join(e1, 'tokens.css')); fs.symlinkSync(path.join(OUT, 'evil.css'), path.join(e1, 'tokens.css'));
  fs.symlinkSync(path.join(OUT, 'far'), path.join(U5, 'linkdir'), 'dir');
  theme(U5, 'extout', '#000003', { extends: path.relative(U5, path.join(OUT, 'far')) });
  theme(U5, 'extabs', '#000004', { extends: path.join(OUT, 'far') });
  for (const [name, own] of [['linktok', null], ['linkdir', null], ['extout', '#000003'], ['extabs', '#000004']]) {
    const r = buildWith([U5], deck('d-esc-' + name, name));
    assert.ok(!has(r, '#999999') && !has(r, '#666666'), name + ': read outside the user dir');
    assert.ok(r.stats.warn.some((x) => x.startsWith('refused:')), name + ': ' + r.stats.warn.join('\n'));
    if (own) assert.ok(has(r, own), name); else assert.equal(r.stats.theme, 'default', name);
  }
  // a deck theme still cannot reach outside through extends, but may extend a user theme
  const f = deck('d-deck-ext', 'loc');
  theme(path.join(tmp, 'd-deck-ext', 'themes'), 'loc', '#000005', { extends: 'only1' });
  const r = buildWith([U1], f);
  assert.ok(has(r, '#000005') && has(r, '#121212'));
});

await (async () => {
  // portable: a user theme goes in as the deck's themes/<name>/ (rebuilds the same elsewhere, also in the editor)
  const save = { E: process.env.EGATARI_THEMES, H: process.env.HOME, P: process.env.USERPROFILE };
  const home = path.join(tmp, 'home3'); fs.mkdirSync(home);
  try {
    process.env.EGATARI_THEMES = U1; process.env.HOME = home; process.env.USERPROFILE = home;
    const f = deck('d-portable', 'mine');
    const r = await buildPortable(f, { subset: false });
    assert.ok(r.files['themes/mine/tokens.css'] && r.files['themes/mine/theme.json'], Object.keys(r.files).join(' '));
    assert.ok(!(r.index.themes || []).some((t) => t.name === 'mine'));
    assert.ok((r.index.themes || []).some((t) => t.name === 'default' && t.source === 'registry'));
    // the unpacked sources build with the same theme without any user dir
    const ex = path.join(tmp, 'extracted'); fs.mkdirSync(ex);
    for (const [p, b] of Object.entries(r.files)) { fs.mkdirSync(path.dirname(path.join(ex, p)), { recursive: true }); fs.writeFileSync(path.join(ex, p), b); }
    const r2 = buildWith([], path.join(ex, r.index.entry));
    assert.ok(has(r2, '#111111') && r2.stats.theme === 'mine');
  } finally {
    for (const [k, v] of [['EGATARI_THEMES', save.E], ['HOME', save.H], ['USERPROFILE', save.P]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  n++; console.log('ok   portable: a user theme is embedded as the deck\'s themes/<name>/');
})();

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`ok   ${n} theme-dir checks`);
