// kit/build.mjs の原稿の引数（npm test の単体の検査）
//   node tools/test-build-args.mjs
// 確かめること：デッキのフォルダを渡すと <フォルダ>/deck.html を組む（ふつうの build と --portable）／deck.html のないフォルダは
// 「deck.html かそれを含むフォルダが要る」と言って終了コード 1 で、何も書かない（紛らわしい build-not-a-file の知らせを出さない）／
// deck.html を渡す今までの形はそのまま
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD = path.join(ROOT, 'kit/build.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-build-args-'));
const run = (...a) => spawnSync(process.execPath, [BUILD, ...a], { cwd: ROOT, encoding: 'utf8' });

// 1. デッキのフォルダ（examples/minimal を写したもの。--portable が egatari.json を書くので元のフォルダを汚さない）
const deck = path.join(tmp, 'deck');
fs.cpSync(path.join(ROOT, 'examples/minimal'), deck, { recursive: true, filter: (s) => !/[\\/](out|\.cache)$/.test(s) });
let r = run(deck, '-o', path.join(tmp, 'a.html'));
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(path.join(tmp, 'a.html')).size > 0);
r = run(deck, '--portable', '-o', path.join(tmp, 'a.ega.html'));
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(path.join(tmp, 'a.ega.html')).size > 0);
// 2. deck.html を渡す今までの形
r = run(path.join(deck, 'deck.html'), '-o', path.join(tmp, 'b.html'));
assert.equal(r.status, 0, r.stderr);
assert.equal(fs.readFileSync(path.join(tmp, 'a.html'), 'utf8'), fs.readFileSync(path.join(tmp, 'b.html'), 'utf8'), 'the folder and its deck.html build the same file');
// 3. deck.html のないフォルダ（ふつうの build と --portable）
const empty = path.join(tmp, 'empty');
fs.mkdirSync(empty);
for (const extra of [[], ['--portable']]) {
  r = run(empty, ...extra, '-o', path.join(tmp, 'c.html'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected a deck\.html file or a folder containing one/);
  assert.doesNotMatch(r.stderr, /FIFO|build-not-a-file/);
  assert.ok(!fs.existsSync(path.join(tmp, 'c.html')));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-build-args: ok');
