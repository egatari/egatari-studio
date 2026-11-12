// 組んだサンプルの置き場（tools/examples-portable.mjs の examplesKey・buildExamples、EGATARI_EXAMPLES_CACHE。d5 11/12）の試験。ブラウザなし・サンプルは組まない
//   - 鍵は入力の中身で決まる：サンプルの 1 バイト・組み立てのコード（kit/）・名前の並び・covers のどれが変わっても鍵が変わる。同じ中身なら同じ鍵
//   - 置き場に今の鍵のものがあれば写す（組まない）。古い鍵のものは使わない（入力が変われば別の鍵を探すので、古いサンプルで通ることはない）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { examplesKey, buildExamples } from './examples-portable.mjs';

let failed = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };
const okA = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-excache-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
put('examples/a/deck.html', '<section>a</section>');
put('examples/a/narration.md', '[0] a');
put('examples/a/out/deck.html', 'built');
put('kit/build.mjs', 'export const v = 1;');
put('package-lock.json', '{}');
const key = (o = {}) => examplesKey({ root, names: ['a'], ...o });

try {
  const k0 = key();
  ok('the same inputs give the same key', () => assert.equal(key(), k0));
  ok('one byte of a sample changes the key (a stale shared build is never reused)', () => {
    put('examples/a/narration.md', '[0] b');
    assert.notEqual(key(), k0);
    put('examples/a/narration.md', '[0] a');
    assert.equal(key(), k0);
  });
  ok('a change in the build code (kit/) changes the key', () => {
    put('kit/build.mjs', 'export const v = 2;');
    assert.notEqual(key(), k0);
    put('kit/build.mjs', 'export const v = 1;');
  });
  ok('a new file changes the key; out/ and dot files do not', () => {
    put('examples/a/out/more.html', 'x'); put('examples/a/.DS_Store', 'x');
    assert.equal(key(), k0);
    put('examples/a/extra.svg', '<svg/>');
    assert.notEqual(key(), k0);
    fs.rmSync(path.join(root, 'examples/a/extra.svg'));
  });
  ok('the names and covers are part of the key', () => {
    assert.notEqual(key({ names: ['a', 'b'] }), k0);
    assert.notEqual(key({ covers: true }), k0);
  });
  ok('the real inputs give a key (examples/, kit/, vendor/, themes/, package-lock.json)', () => assert.match(examplesKey(), /^[0-9a-f]{32}$/));

  // 置き場：今の鍵のフォルダに list.json があれば、組まずに写す。ここでは本物の鍵の場所に偽の組んだものを置き、写したものが偽のほうであることで「組んでいない」を見る
  const cache = path.join(root, 'cache');
  const prev = process.env.EGATARI_EXAMPLES_CACHE;
  process.env.EGATARI_EXAMPLES_CACHE = cache;
  try {
    const real = path.join(cache, examplesKey({ covers: true }));
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(path.join(real, 'fake.ega.html'), 'fake');
    fs.writeFileSync(path.join(real, 'list.json'), JSON.stringify([{ name: 'fake' }]));
    const out = path.join(root, 'out1');
    await okA('a shared build with the current key is copied, not rebuilt (list.json stays in the cache)', async () => {
      const list = await buildExamples(out, { covers: true });
      assert.deepEqual(list, [{ name: 'fake' }]);
      assert.equal(fs.readFileSync(path.join(out, 'fake.ega.html'), 'utf8'), 'fake');
      assert.ok(!fs.existsSync(path.join(out, 'list.json')));
    });
    ok('a shared build under another key is not used: it would be looked up under a different folder', () => {
      assert.notEqual(examplesKey({ covers: false }), path.basename(real));
      assert.ok(!fs.existsSync(path.join(cache, examplesKey({ covers: false }), 'list.json')));
    });
  } finally {
    if (prev === undefined) delete process.env.EGATARI_EXAMPLES_CACHE; else process.env.EGATARI_EXAMPLES_CACHE = prev;
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }

if (failed) { console.log(`test-examples-cache: ${failed} failed`); process.exit(1); }
console.log('test-examples-cache: ok');
