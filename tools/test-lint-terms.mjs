// 画面の言葉の検査（tools/lint-terms.mjs）の試験：terms-allow.json の noPairs
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// noPairs に書いた用語の id は、ja↔en の組の検査をしない（ja の言葉が短く一般的：本 → 「2 本」「日本語」）。書かない用語は今までどおり組を確かめる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkPairs, loadRules } from './lint-terms.mjs';

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
ok('the repository lists book and format-version in noPairs', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../docs/terms-allow.json', import.meta.url), 'utf8'));
  assert.deepEqual(cfg.noPairs, ['book', 'format-version']);
});
fs.rmSync(root, { recursive: true, force: true });
console.log(`lint-terms: ${n} ok`);
