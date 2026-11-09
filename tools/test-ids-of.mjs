// egatari ids-of（tools/ids-of.mjs）の試験
// test-all: unit
//   node tools/test-ids-of.mjs
// 普通の 1 ファイル・再生専用・書き換えたファイル（警告だけ）・Egatari でないファイル（エラー）・複数ファイル・--json・--help の一覧。
// 試験用のファイルは examples/minimal の写しから kit/build.mjs で作る（例の作業フォルダには書かない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'test-ids-of-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
const cli = (...a) => node(['bin/egatari.mjs', 'ids-of', ...a]);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

const dir = path.join(work, 'minimal');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true });
const full = path.join(work, 'full.ega.html'), play = path.join(work, 'play.ega.html');
for (const [out, extra] of [[full, []], [play, ['--play-only']]]) {
  const r = node(['kit/build.mjs', path.join(dir, 'deck.html'), '--portable', ...extra, '-o', out]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
}
const rows = (s) => s.trimEnd().split('\n').map((l) => l.split('\t'));
const SHA = /^[0-9a-f]{64}$/;

let docId, srcSha;
t('普通の 1 ファイル：docId・sourceSha256・ファイル全体の SHA-256 をタブ区切りで 1 行', () => {
  const r = cli(full);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const [row, ...more] = rows(r.stdout);
  assert.equal(more.length, 0);
  assert.equal(row.length, 3);
  [docId, srcSha] = row;
  assert.ok(docId.length > 0);
  assert.match(srcSha, SHA);
  assert.equal(row[2], sha(fs.readFileSync(full)));
});

t('再生専用：docId とファイル全体の SHA-256 だけ（sourceSha256 は -）。docId は同じ教材と同じ', () => {
  const r = cli(play);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const [row] = rows(r.stdout);
  assert.deepEqual([row[0], row[1], row[2]], [docId, '-', sha(fs.readFileSync(play))]);
});

t('書き換えたファイル：索引の sourceSha256 を変えると警告（stderr）。計算し直した値を出し、終了コードは 0', () => {
  const text = fs.readFileSync(full, 'utf8');
  const m = text.match(/(<script\b[^>]*\bid="egatari-index"[^>]*>)([\s\S]*?)(<\/script>)/);
  assert.ok(m, 'index element');
  const idx = JSON.parse(m[2]);
  assert.equal(idx.sourceSha256, srcSha);
  idx.sourceSha256 = '0'.repeat(64);
  const body = JSON.stringify(idx);
  const open = m[1].replace(/data-sha256="[0-9a-f]+"/, `data-sha256="${sha(body)}"`);
  const bad = path.join(work, 'tampered.ega.html');
  fs.writeFileSync(bad, text.replace(m[0], open + body + m[3]));
  const r = cli(bad);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /warning:.*sourceSha256 differs/);
  const [row] = rows(r.stdout);
  assert.equal(row[1], srcSha);
});

t('Egatari ファイルでない・読めないもの：エラー（終了コード 1）。ほかのファイルは続ける', () => {
  const other = path.join(work, 'other.html');
  fs.writeFileSync(other, '<!doctype html><title>x</title><p>hello</p>');
  const r = cli(other, full, path.join(work, 'missing.ega.html'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /error: .*other\.html: not an Egatari file/);
  assert.match(r.stderr, /error: .*missing\.ega\.html: file not found/);
  assert.equal(rows(r.stdout).length, 1);
  assert.equal(rows(r.stdout)[0][0], docId);
  assert.equal(cli(path.join(dir, 'deck.html')).status, 1);
});

t('複数のファイル：ファイルごとに 1 行、引数の順', () => {
  const r = cli(play, full);
  assert.equal(r.status, 0, r.stderr);
  const rs = rows(r.stdout);
  assert.equal(rs.length, 2);
  assert.equal(rs[0][1], '-');
  assert.equal(rs[1][1], srcSha);
});

t('--json：ファイルごとに 1 つの JSON（再生専用の sourceSha256 は null）', () => {
  const r = cli('--json', full, play);
  assert.equal(r.status, 0, r.stderr);
  const [a, b] = r.stdout.trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(a, { file: full, docId, sourceSha256: srcSha, fileSha256: sha(fs.readFileSync(full)) });
  assert.deepEqual(b, { file: play, docId, sourceSha256: null, fileSha256: sha(fs.readFileSync(play)) });
});

t('引数なしは使い方を出して終了コード 1', () => {
  const r = cli();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});

t('egatari --help に ids-of が出る', () => {
  const r = node(['bin/egatari.mjs', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ids-of/);
  assert.match(r.stdout, /egatari ids-of <file\.ega\.html>/);
});

fs.rmSync(work, { recursive: true, force: true });
console.log(`\ntest-ids-of: ${n} passed`);
