// test-all: unit
// 作業フォルダのパーツのフォルダ名（backlog #197）：components/<タグから m- を除いた名前>/ と components/<タグ>/ のどちらも読む。
// 同じタグで両方あれば、黙って片方を選ばずに組み立てを止め、2 つのパスを言う。どちらもなければ、期待する形を言って知らせる
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'part-folder-'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ok ' + m); n++; };
const PART = (word) => `DECK.define('m-hello', class extends HTMLElement { mount() { this.textContent = '${word}'; } render() {} });\n`;
function deck(name, folders) {
  const dir = path.join(tmp, name);
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  const f = path.join(dir, 'deck.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<h2>何を最小化するか</h2>', '<h2>何を最小化するか</h2>\n  <m-hello aria-label="あいさつ"></m-hello>'));
  for (const [folder, word] of folders) { fs.mkdirSync(path.join(dir, 'components', folder), { recursive: true }); fs.writeFileSync(path.join(dir, 'components', folder, 'index.js'), PART(word)); }
  return f;
}
try {
  const short = build(deck('short', [['hello', 'from-hello']]), {});
  ok(short.html.includes('from-hello') && /\/\/ ---- m-hello \(components\/hello\/index\.js\)/.test(short.html), 'components/hello/ (the tag without m-) is read');
  const full = build(deck('full', [['m-hello', 'from-m-hello']]), {});
  ok(full.html.includes('from-m-hello') && /\/\/ ---- m-hello \(components\/m-hello\/index\.js\)/.test(full.html), 'components/m-hello/ (the whole tag) is read');
  let err = null;
  try { build(deck('both', [['hello', 'a'], ['m-hello', 'b']]), {}); } catch (e) { err = e; }
  ok(err && err.code === 'component-folder-twice' && err.message.includes('components/hello/index.js') && err.message.includes('components/m-hello/index.js'), `both folders: the build stops and names the two paths (${err && err.message})`);
  const none = build(deck('none', []), {});
  ok(none.stats.warn.some((w) => /component not found: m-hello \(a lesson's own part goes in components\/hello\/index\.js or components\/m-hello\/index\.js/.test(w)), 'no folder: the notice says where a lesson\'s own part goes');
  console.log(`part-folder: ${n} ok`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
