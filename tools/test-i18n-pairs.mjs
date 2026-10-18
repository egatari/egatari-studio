// tools/i18n-pairs.mjs の試験（一時フォルダの中で）
//   node tools/test-i18n-pairs.mjs
// 揃っている組・片方だけ直した組・印の行がない組・CRLF の違い・--stamp・--strict・GitHub の注記の形
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPairs, findPairs, hashOf } from './i18n-pairs.mjs';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n-pairs.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-pairs-'));
const EN = '# Title\n\nHello.\n\n## Usage\n\nRun it.\n';
const JA = '# 題\n\nこんにちは。\n\n## 使い方\n\n走らせる。\n';
let n = 0;
const fresh = (name) => {
  const d = path.join(tmp, name);
  fs.mkdirSync(path.join(d, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'docs', 'guide.md'), EN);
  fs.writeFileSync(path.join(d, 'docs', 'guide.ja.md'), JA);
  fs.writeFileSync(path.join(d, 'node_modules', 'x', 'a.ja.md'), JA); // 見ない
  fs.writeFileSync(path.join(d, 'node_modules', 'x', 'a.md'), EN);
  return d;
};
const cli = (root, ...args) => spawnSync(process.execPath, [TOOL, ...args, '--root', root], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } });
const p = (d, f) => path.join(d, f);
const msgs = (d) => checkPairs(d).map((w) => w.msg);
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

test('finds pairs, skips node_modules', () => {
  const d = fresh('find');
  assert.deepEqual(findPairs(d), [['docs/guide.md', 'docs/guide.ja.md']]);
});

test('missing comment warns on both sides', () => {
  const d = fresh('missing');
  const m = msgs(d);
  assert.equal(m.length, 2);
  assert.ok(m.every((s) => /has no i18n stamp/.test(s)));
  assert.equal(cli(d, '--check').status, 0);
  assert.equal(cli(d, '--check', '--strict').status, 1);
});

test('stamp writes a first-line comment to both files; then in sync', () => {
  const d = fresh('stamp');
  const r = cli(d, '--stamp', 'docs/guide.ja.md');
  assert.equal(r.status, 0, r.stderr);
  const en = fs.readFileSync(p(d, 'docs/guide.md'), 'utf8');
  const ja = fs.readFileSync(p(d, 'docs/guide.ja.md'), 'utf8');
  assert.equal(ja.split('\n')[0], `<!-- i18n: pair=guide.md sha256=${hashOf(EN)} -->`);
  assert.equal(en.split('\n')[0], `<!-- i18n: pair=guide.ja.md sha256=${hashOf(JA)} -->`);
  assert.equal(ja.split('\n').slice(1).join('\n'), JA);
  assert.deepEqual(msgs(d), []);
  assert.equal(cli(d, '--check', '--strict').status, 0);
  // もう一度書いても行は 1 つ
  cli(d, '--stamp', 'docs/guide.md');
  assert.equal(fs.readFileSync(p(d, 'docs/guide.md'), 'utf8').match(/i18n:/g).length, 1);
  assert.equal(cli(d, '--stamp', 'docs/none.md').status, 1);
});

test('English edited -> ja is older', () => {
  const d = fresh('edit-en');
  cli(d, '--stamp-all');
  fs.appendFileSync(p(d, 'docs/guide.md'), '\nNew paragraph.\n');
  const ws = checkPairs(d);
  assert.equal(ws.length, 1);
  assert.equal(ws[0].file, 'docs/guide.ja.md');
  assert.match(ws[0].msg, /docs\/guide\.ja\.md is older than docs\/guide\.md/);
  assert.equal(cli(d, '--check', '--strict').status, 1);
  // 訳を直して印を付け直すと消える
  fs.appendFileSync(p(d, 'docs/guide.ja.md'), '\n新しい段落。\n');
  cli(d, '--stamp', 'docs/guide.ja.md');
  assert.deepEqual(msgs(d), []);
});

test('Japanese edited -> en is older; both edited -> one combined warning', () => {
  const d = fresh('edit-ja');
  cli(d, '--stamp-all');
  fs.appendFileSync(p(d, 'docs/guide.ja.md'), '\n足した。\n');
  assert.deepEqual(msgs(d), ['docs/guide.md is older than docs/guide.ja.md; update it, then run: npm run i18n -- --stamp docs/guide.md']);
  fs.appendFileSync(p(d, 'docs/guide.md'), '\nAdded.\n');
  const m = msgs(d);
  assert.equal(m.length, 1);
  assert.match(m[0], /both edited/);
});

test('CRLF and trailing whitespace do not count as changes', () => {
  const d = fresh('crlf');
  cli(d, '--stamp-all');
  for (const f of ['docs/guide.md', 'docs/guide.ja.md']) {
    const t = fs.readFileSync(p(d, f), 'utf8');
    fs.writeFileSync(p(d, f), t.replace(/\n/g, '   \r\n') + '\r\n\r\n');
  }
  assert.deepEqual(msgs(d), []);
  assert.equal(hashOf(EN), hashOf(EN.replace(/\n/g, '\r\n')));
  // CRLF のファイルに付け直しても CRLF のまま
  cli(d, '--stamp', 'docs/guide.md');
  assert.ok(!/[^\r]\n/.test(fs.readFileSync(p(d, 'docs/guide.md'), 'utf8')));
  assert.deepEqual(msgs(d), []);
});

test('wrong pair name and missing English counterpart warn', () => {
  const d = fresh('wrong');
  cli(d, '--stamp-all');
  const ja = fs.readFileSync(p(d, 'docs/guide.ja.md'), 'utf8');
  fs.writeFileSync(p(d, 'docs/guide.ja.md'), ja.replace('pair=guide.md', 'pair=other.md'));
  fs.writeFileSync(p(d, 'orphan.ja.md'), JA);
  const m = msgs(d);
  assert.ok(m.some((s) => /pair=other\.md, expected guide\.md/.test(s)));
  assert.ok(m.some((s) => /orphan\.ja\.md has no English counterpart/.test(s)));
});

test('GitHub annotation format in CI, plain with --plain', () => {
  const d = fresh('gh');
  const env = { ...process.env, GITHUB_ACTIONS: 'true' };
  const gh = spawnSync(process.execPath, [TOOL, '--check', '--root', d], { encoding: 'utf8', env });
  assert.equal(gh.status, 0);
  assert.match(gh.stdout, /^::warning file=docs\/guide\.ja\.md,line=1,title=i18n pair::/m);
  const plain = spawnSync(process.execPath, [TOOL, '--check', '--plain', '--root', d], { encoding: 'utf8', env });
  assert.doesNotMatch(plain.stdout, /::warning/);
  assert.match(plain.stdout, /^warning: /m);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test-i18n-pairs: ${n} passed`);
