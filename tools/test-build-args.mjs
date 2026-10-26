// kit/build.mjs の原稿の引数（npm test の単体の検査）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
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
// 2. deck.html を渡す今までの形（--portable の前に：書き出しは id のないスライドに id を付けて原稿に書き戻す。format spec §8.1）
r = run(path.join(deck, 'deck.html'), '-o', path.join(tmp, 'b.html'));
assert.equal(r.status, 0, r.stderr);
assert.equal(fs.readFileSync(path.join(tmp, 'a.html'), 'utf8'), fs.readFileSync(path.join(tmp, 'b.html'), 'utf8'), 'the folder and its deck.html build the same file');
r = run(deck, '--portable', '-o', path.join(tmp, 'a.ega.html'));
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(path.join(tmp, 'a.ega.html')).size > 0);
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
// 4. 既定の書き出し先：原稿のフォルダの最上位に、題名から作った名前（なければデッキの名前）。絶対パスを知らせる。out/ には書かない
const d4 = path.join(tmp, 'd4');
fs.cpSync(path.join(ROOT, 'examples/minimal'), d4, { recursive: true, filter: (s) => !/[\\/](out|\.cache)$/.test(s) });
let before = fs.readFileSync(path.join(d4, 'deck.html'), 'utf8');
r = run(d4, '--portable');
assert.equal(r.status, 0, r.stderr);
// 最初の書き出しは id を付けて原稿に書き戻す（見本の原稿は id を持たない）。その後の書き出しは原稿を変えない
assert.notEqual(fs.readFileSync(path.join(d4, 'deck.html'), 'utf8'), before, 'the first export wrote the slide ids back');
before = fs.readFileSync(path.join(d4, 'deck.html'), 'utf8');
const narr = fs.readFileSync(path.join(d4, 'narration.md'), 'utf8');
const title = (before.match(/<title>([^<]*)<\/title>/) || [])[1];
const f1 = path.join(d4, `${title}.ega.html`);
assert.ok(fs.statSync(f1).size > 0, 'default: <deck>/<title>.ega.html');
assert.ok(r.stdout.includes(path.resolve(f1)), 'default: the full path is printed');
r = run(d4, '--play-only');
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(path.join(d4, `${title}.play.ega.html`)).size > 0, 'default: <deck>/<title>.play.ega.html');
assert.ok(!fs.existsSync(path.join(d4, 'out')), 'default: nothing in out/');
// 4b. 題名の名前に普通のファイルでないものがあれば、デッキの名前に替える。原稿のファイルは変わらない
fs.rmSync(f1);
fs.mkdirSync(f1);
r = run(d4, '--portable');
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(path.join(d4, 'deck.ega.html')).isFile(), 'collision with a folder: falls back to the deck name');
assert.ok(fs.statSync(f1).isDirectory(), 'collision: the folder is untouched');
assert.equal(fs.readFileSync(path.join(d4, 'deck.html'), 'utf8'), before);
assert.equal(fs.readFileSync(path.join(d4, 'narration.md'), 'utf8'), narr);
// 4c. 題名の名前に今ある .ega.html は上書きする（書き出し直し）
fs.rmSync(f1, { recursive: true });
fs.writeFileSync(f1, 'old');
r = run(d4, '--portable');
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.statSync(f1).size > 100, 'an existing .ega.html is replaced');
// 4d. -o は今までどおり
r = run(d4, '--portable', '-o', path.join(tmp, 'o.ega.html'));
assert.equal(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(tmp, 'o.ega.html')));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-build-args: ok');
