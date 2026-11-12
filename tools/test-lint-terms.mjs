// 画面の言葉の検査（tools/lint-terms.mjs）の試験：terms-allow.json の noPairs
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// avoidPatterns（版の単独＝バージョン。正式版などの複合は当たらない）と --prose（ほかのリポジトリの文書を同じ用語集で照らす）。
// play/（Viewer）の文字列も app/ と同じに照らす。noPairs に書いた用語の id は、ja↔en の組の検査をしない（ja の言葉が短く一般的：本 → 「2 本」「日本語」）。書かない用語は今までどおり組を確かめる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkPairs, loadRules, lintFile, runProse, UI_CODE, globRe } from './lint-terms.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lint-terms-'));
const term = (id, ja, en) => ({ id, group: 'test', en, ja, definition: '', avoid: { ja: [], en: [] }, internal: '', decided: '2026-10-26', by: 'test', note: '' });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.mkdirSync(path.join(root, 'app'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'terms.json'), JSON.stringify({ version: 1, terms: [term('book', '本', 'Book'), term('slide', 'スライド', 'Slide')] }));
// 「2 本」（本数）と「日本語」は本（book）ではない。スライドは組がない（en に slide がない）
fs.writeFileSync(path.join(root, 'app', 'x.js'), "export const T = { ja: { n: '線が 2 本', lang: '日本語', s: 'スライド' }, en: { n: 'two lines', lang: 'Japanese', s: 'page' } };\n");
const pairs = (cfg) => {
  fs.writeFileSync(path.join(root, 'docs', 'terms-allow.json'), JSON.stringify(cfg));
  return checkPairs(root, 'app/x.js', loadRules(root)).filter((w) => w.kind === 'term').map((w) => w.id + ' ' + w.key).sort();
};
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok ' + name); };
ok('without noPairs, 本 in 「2 本」 and 「日本語」 is paired against Book (the false positives noPairs is for)', () => {
  assert.deepEqual(pairs({ allow: [] }), ['book lang', 'book n', 'slide s']);
});
ok('noPairs: ["book"] skips the pair check for book only; other terms are still checked', () => {
  assert.deepEqual(pairs({ allow: [], noPairs: ['book'] }), ['slide s']);
  assert.ok(loadRules(root).noPairs.has('book'));
});
ok('the repository lists book, format-version and no-results (見つかりません is generic) and note (メモ is inside メモリ) in noPairs', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../docs/terms-allow.json', import.meta.url), 'utf8'));
  assert.deepEqual(cfg.noPairs, ['book', 'format-version', 'no-results', 'note']);
});
ok('the Viewer\'s strings (play/i18n.mjs, play/main.js) are scanned like app/*.js', () => {
  for (const f of ['play/i18n.mjs', 'play/main.js', 'app/main.js']) assert.ok(UI_CODE.some((g) => globRe(g).test(f)), f);
});
ok('the repository\'s lone-版 pattern flags 版 alone and leaves the compounds', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../docs/terms-allow.json', import.meta.url), 'utf8'));
  const re = new RegExp(cfg.avoidPatterns.find((a) => a.term === 'software-version').pattern, 'g');
  const hits = (t) => (t.match(re) || []).length;
  for (const t of ['この版', '前の版の Studio', '版を選ぶ', '新しい版は', '版 0.6.10']) assert.equal(hits(t), 1, t);
  for (const t of ['正式版', '最新版', '日本語版', '英語版', 'ブラウザ版', 'オフライン版', 'コマンド版', 'ベータ版', '再生専用版', '配信版', '出版', '版権']) assert.equal(hits(t), 0, t);
});
ok('avoidPatterns: a pattern is an avoid rule of its term, in docs too with docsToo; --prose lints another folder with this glossary', () => {
  fs.writeFileSync(path.join(root, 'docs', 'terms.json'), JSON.stringify({ version: 1, terms: [term('software-version', 'バージョン', 'Version')] }));
  fs.writeFileSync(path.join(root, 'docs', 'terms-allow.json'), JSON.stringify({ allow: [], avoidPatterns: [{ term: 'software-version', lang: 'ja', label: '版（単独）', pattern: '(?<!正式)版', docsToo: true }] }));
  fs.writeFileSync(path.join(root, 'README.ja.md'), '正式版です。この版は古い。\n');
  const rules = loadRules(root);
  assert.deepEqual(lintFile(root, 'README.ja.md', rules).map((h) => [h.id, h.found, h.to]), [['software-version', '版', 'バージョン']]);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lint-terms-other-'));
  fs.mkdirSync(path.join(other, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(other, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(other, 'src', 'pages', 'index.astro'), '<p>前の版の Studio</p>\n');
  fs.writeFileSync(path.join(other, 'README.md'), '正式版\n');
  fs.writeFileSync(path.join(other, 'node_modules', 'x', 'a.md'), 'この版\n');
  const r = runProse(root, other);
  assert.deepEqual(r.hits.map((h) => h.file), ['src/pages/index.astro']);
  assert.deepEqual(runProse(root, other, ['README*.md']).files, ['README.md']);
  fs.rmSync(other, { recursive: true, force: true });
});
fs.rmSync(root, { recursive: true, force: true });
console.log(`lint-terms: ${n} ok`);
