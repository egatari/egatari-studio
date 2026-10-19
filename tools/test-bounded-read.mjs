// 上限つきの読み取り（kit/bounded-read.mjs・app/bounded-read.js・kit/core/bounded-read-core.mjs）と、それを通す読み取りの単体の試験（ブラウザなし）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-bounded-read.mjs
// Codex の 6 回目の指摘（2026-10-18）の 2〜6 を確かめる（1 は test-workspace）。大きなファイルは中身が 0 の疎なファイル（ftruncate。ディスクを
// 使わない）にし、読まずに断ること（子の process の最大 RSS が小さいまま）を見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MiB = 1048576;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-bounded-'));
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const sparse = (f, n) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, n); fs.closeSync(fd); return f; };
const DECK = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide"><h2>x</h2></section></div></body></html>';
let nDeck = 0;
const deckDir = (files = {}) => {
  const d = path.join(tmp, 'd' + nDeck++); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'deck.html'), DECK);
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  return d;
};
// 子の process で動かし、最後の行の JSON を返す（{m, ms, rss（KiB）}）。rss は読み込みの後からの最大 RSS の増え（KiB）：Node の版や
// 機械で変わる起動と読み込みの分（Node 24 の CI で 200 MiB を超えた）を数えず、読んでしまったか（1 GiB 以上増える）だけを見る
const RSS_GROWTH = 64 * 1024;
const child = (code, timeout = 60000, env = process.env) => {
  const rr = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout, env });
  try { return JSON.parse(rr.stdout.trim().split('\n').pop()); } catch { return { m: rr.error && rr.error.code === 'ETIMEDOUT' ? 'hung (timeout)' : 'no result: ' + String(rr.stderr).slice(0, 300) }; }
};
// 子の process の import に渡す指定子：file:// の URL（Windows の絶対パス C:\... は ESM の指定子にならない）
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

// ---------------------------------------------------------------- 上限つきの読み取りの口そのもの
const hasFifo = process.platform !== 'win32' && spawnSync('mkfifo', ['--help']).error?.code !== 'ENOENT';
const fifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); spawnSync('mkfifo', [f]); return f; };
ok('Node の readRegular：max を超える大きさは読まずに断る（1 GiB の疎なファイルでも最大 RSS は小さい）・既定は 32 MiB・FIFO は開かずに断る', async () => {
  const big = sparse(path.join(tmp, 'big.bin'), 1024 * MiB);
  const o = child(`import { readRegular } from ${mod('kit/bounded-read.mjs')}; const t0 = Date.now(), rss0 = process.resourceUsage().maxRSS; let m = 'read';
    try { readRegular(${JSON.stringify(big)}, { max: 1000 }); } catch (e) { m = e.code + ' ' + e.n; }
    let d = 'read'; try { readRegular(${JSON.stringify(big)}); } catch (e) { d = e.code + ' ' + e.max; }
    console.log(JSON.stringify({ m, d, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS - rss0 }));`);
  assert.equal(o.m, `read-over ${1024 * MiB}`, JSON.stringify(o));
  assert.equal(o.d, `read-over ${32 * MiB}`, 'default max is READ_LIMITS.default');
  assert.ok(o.ms < 5000 && o.rss < RSS_GROWTH, JSON.stringify(o));
  const { readRegular, readRegularText } = await import('../kit/bounded-read.mjs');
  const t = path.join(tmp, 'mb.txt'); fs.writeFileSync(t, 'あいう');
  assert.deepEqual(readRegularText(t, { max: 9 }), { text: 'あいう', bytes: 9 });
  assert.throws(() => readRegularText(t, { max: 8 }), (e) => e.code === 'read-over' && e.n === 9);
  assert.equal(readRegular(t, 9).length, 9, 'a number is accepted as max');
  if (hasFifo) {
    const p = fifo(path.join(tmp, 'pipe'));
    const r = child(`import { readRegular } from ${mod('kit/bounded-read.mjs')}; let m = 'read'; try { readRegular(${JSON.stringify(p)}); } catch (e) { m = e.code; } console.log(JSON.stringify({ m }));`, 10000);
    assert.equal(r.m, 'build-not-a-file');
  }
});
ok('ブラウザの readFileBounded：File.size が max を超えるなら arrayBuffer() を呼ばない・読んだ後も実際のバイト数で断る・文字はバイト数を返す', async () => {
  const { readFileBounded, readFileBoundedText } = await import('../app/bounded-read.js');
  const calls = { n: 0 };
  const fakeFile = (size, bytes) => ({ size, async arrayBuffer() { calls.n++; return bytes.buffer; }, async text() { throw new Error('text() must not be used'); } });
  await assert.rejects(readFileBounded(fakeFile(1 << 30, new Uint8Array(1)), { max: 100 }), (e) => e.code === 'read-over' && e.n === 1 << 30);
  assert.equal(calls.n, 0, 'arrayBuffer() not called when File.size is over max');
  await assert.rejects(readFileBounded(fakeFile(3, new Uint8Array(500)), { max: 100 }), (e) => e.code === 'read-over' && e.n === 500);
  await assert.rejects(readFileBounded(fakeFile(NaN, new Uint8Array(1)), { max: 100 }), (e) => e.code === 'read-over');
  // ハンドル（getFile）も受ける
  const enc = new TextEncoder().encode('あいう');
  assert.deepEqual(await readFileBoundedText({ getFile: async () => fakeFile(9, enc) }, { max: 9 }), { text: 'あいう', bytes: 9 });
  await assert.rejects(readFileBoundedText(fakeFile(9, enc), { max: 8 }), (e) => e.code === 'read-over');
  // 既定の上限（32 MiB）
  await assert.rejects(readFileBounded(fakeFile(33 * MiB, new Uint8Array(1))), (e) => e.code === 'read-over' && e.max === 32 * MiB);
});

// ---------------------------------------------------------------- 6. 大きさはバイト数
ok('組み立ての数え方：大きさを返さない env の文字の読み取りを UTF-16 の字数でなく UTF-8 のバイト数で数える（指摘 6）', async () => {
  const core = await import('../kit/core/build-core.mjs');
  // 3 バイトの字 1000 個：字数なら 1000、バイト数なら 3000
  const noSize = { path, readText: () => 'あ'.repeat(1000) };
  const b1 = core.buildBudget({}); core.chargedEnv(noSize, b1).readText('/a');
  assert.equal(b1.input, 3000);
  const b2 = core.buildBudget({ readChars: 2000 }); let e = null;
  try { core.chargedEnv(noSize, b2).readText('/a'); } catch (x) { e = x; }
  assert.ok(e && e.code === 'build-too-large' && /files read/.test(e.message), String(e && e.message));
  // 不正確な size（字数を返す）：読んだバイト数（3000）が見積もり（1000）を超えるので「変わった」で断る
  const charSize = { path, readText: () => 'あ'.repeat(1000), size: () => 1000 };
  let e2 = null; try { core.chargedEnv(charSize, core.buildBudget({})).readText('/a'); } catch (x) { e2 = x; }
  assert.ok(e2 && e2.what === 'changed file', String(e2 && e2.message));
  // readTextBytes（読んだバイト数を返す env）はそのバイト数で数える：不正な UTF-8（1 バイトが U+FFFD の 3 バイトに）も読んだ大きさのまま
  const withBytes = { path, readText: () => { throw new Error('readText must not be used'); }, readTextBytes: () => ({ text: '�'.repeat(4), bytes: 4 }), size: () => 4 };
  const b3 = core.buildBudget({}); assert.equal(core.chargedEnv(withBytes, b3).readText('/a'), '�'.repeat(4));
  assert.equal(b3.input, 4);
  // Node の env：多バイトの字の取り込みはバイト数で数える
  const { nodeEnv } = await import('../kit/build.mjs');
  const f = path.join(tmp, 'ja.txt'); fs.writeFileSync(f, 'あ'.repeat(100));
  const b4 = core.buildBudget({}); core.chargedEnv(nodeEnv, b4).readText(f);
  assert.equal(b4.input, 300);
});

// ---------------------------------------------------------------- 2. 音声の圧縮
ok('音声の圧縮：数えた大きさ（max）までだけ読む（1 GiB の .wav は読まずに断る）・数えた後に大きくなった .wav は断る（指摘 2）', async () => {
  const big = sparse(path.join(tmp, 'aud', 'big.wav'), 1024 * MiB);
  const o = child(`import { nodeEnv } from ${mod('kit/build.mjs')}; const t0 = Date.now(), rss0 = process.resourceUsage().maxRSS; let m = 'compressed';
    try { nodeEnv.compressAudio(${JSON.stringify(big)}, 4096); } catch (e) { m = e.code; }
    console.log(JSON.stringify({ m, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS - rss0 }));`);
  assert.ok(o.m === 'read-over' && o.ms < 5000 && o.rss < RSS_GROWTH, JSON.stringify(o));
  // chargedEnv が数えた大きさ（size）を max として渡す：size の後に大きくなったものは、上限の内でも断る
  const core = await import('../kit/core/build-core.mjs');
  const { nodeEnv } = await import('../kit/build.mjs');
  const w = path.join(tmp, 'aud', 'grow.wav'); fs.writeFileSync(w, Buffer.alloc(100));
  const env = { ...nodeEnv, size: (p) => { const n = nodeEnv.size(p); if (p === w) fs.appendFileSync(p, Buffer.alloc(1 << 20)); return n; } };
  let e = null; try { core.chargedEnv(env, core.buildBudget({})).compressAudio(w); } catch (x) { e = x; }
  assert.ok(e && e.what === 'changed file', String(e && e.message));
  const b = core.buildBudget({ readChars: 50 }); let e2 = null;
  try { core.chargedEnv(nodeEnv, b).compressAudio(path.join(tmp, 'aud', 'grow.wav')); } catch (x) { e2 = x; }
  assert.ok(e2 && e2.code === 'build-too-large' && /files read/.test(e2.message), 'the source of compression is charged before reading');
});
ok('音声の圧縮：ffmpeg には元のパスを開き直させず、読んだバイトを自分だけが読める一時フォルダの写しから渡す（指摘 2）', async () => {
  if (process.platform === 'win32') return;
  // 偽の ffmpeg（PATH の先頭）：受け取った -i のパス・そのフォルダの権限・中身を記録し、出力を作る
  const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
  const log = path.join(tmp, 'ffmpeg.log');
  fs.writeFileSync(path.join(bin, 'ffmpeg'), `#!/bin/sh
while [ $# -gt 1 ]; do if [ "$1" = "-i" ]; then IN="$2"; fi; OUT="$2"; shift; done
OUT="$1"
{ echo "$IN"; stat -c '%a' "$(dirname "$IN")" 2>/dev/null || stat -f '%Lp' "$(dirname "$IN")"; cat "$IN"; } > ${JSON.stringify(log)}
printf m4a > "$OUT"
`, { mode: 0o755 });
  const d = path.join(tmp, 'aud2'); fs.mkdirSync(d);
  const wav = path.join(d, 'a.wav'); fs.writeFileSync(wav, 'RIFF-unique-' + Date.now());
  const o = child(`import { nodeEnv } from ${mod('kit/build.mjs')}; const r = nodeEnv.compressAudio(${JSON.stringify(wav)}, 1000); console.log(JSON.stringify(r));`, 60000, { ...process.env, PATH: bin + path.delimiter + process.env.PATH });
  const lines = fs.readFileSync(log, 'utf8').split('\n');
  assert.ok(o.path && o.path.endsWith('.m4a') && o.read === fs.statSync(wav).size, JSON.stringify(o));
  assert.notEqual(lines[0], wav, 'ffmpeg did not get the original path');
  assert.ok(lines[0].startsWith(os.tmpdir()) && /motion-slides-wav-/.test(lines[0]), lines[0]);
  assert.equal(lines[1], '700', 'the private copy is in a 0700 folder');
  assert.equal(lines.slice(2).join('\n'), fs.readFileSync(wav, 'utf8'), 'ffmpeg got the bytes that were read');
  assert.ok(!fs.existsSync(path.dirname(lines[0])), 'the private copy is removed');
  fs.rmSync(o.path, { force: true });
});

// ---------------------------------------------------------------- 4. npm run portable -- unpack
ok('npm run portable -- unpack：入力は形式の上限（fileBytes）で読む前に断る（2 GiB の疎なファイル）・FIFO は止まらずに断る（指摘 4）', async () => {
  const big = sparse(path.join(tmp, 'big' + '.html'), 2048 * MiB);
  const code = (f, out) => `import { unpack } from ${mod('tools/portable.mjs')}; const t0 = Date.now(), rss0 = process.resourceUsage().maxRSS; let m = 'unpacked';
    try { await unpack(${JSON.stringify(f)}, ${JSON.stringify(out)}); } catch (e) { m = e.code; }
    console.log(JSON.stringify({ m, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS - rss0 }));`;
  const o = child(code(big, path.join(tmp, 'unp1')));
  assert.ok(o.m === 'file-too-large' && o.ms < 5000 && o.rss < RSS_GROWTH && !fs.existsSync(path.join(tmp, 'unp1')), JSON.stringify(o));
  if (hasFifo) {
    const p = fifo(path.join(tmp, 'pipe.html'));
    const r = child(code(p, path.join(tmp, 'unp2')), 10000);
    assert.equal(r.m, 'not-a-file', JSON.stringify(r));
  }
});

// ---------------------------------------------------------------- 5. 開発サーバーと編集アプリの原稿・口述原稿・コメント
ok('編集アプリの問い合わせ：原稿・口述原稿・コメントは決まった上限で読み、超えるなら読まずに・書かずに 413（指摘 5）', async () => {
  const { memoryWorkspace } = await import('../app/memfs.js');
  const { createDevApi } = await import('../app/devapi.js');
  const { short } = await import('../kit/core/sha1.mjs');
  const { READ_LIMITS } = await import('../kit/core/bounded-read-core.mjs');
  const M = { conflict: 'conflict', cancelled: 'cancelled', notFound: 'nf', badRange: 'br', narrConflict: 'nc', badNarr: 'bn', noRev: 'nr', narrHead: '# n\n', emptyComment: 'ec', noComment: 'nc2' };
  const mkApi = (files) => { const ws = memoryWorkspace('m', files); const ctx = { ws, deckFile: () => 'deck.html', slideOrder: () => [{ key: 's' }], editable: () => true, afterWrite: async () => false, msg: M }; return { ws, api: createDevApi(ctx) }; };
  // コメント（4 MiB を超える comments.json）：読まずに 413、新しいコメントも書かない（これまでは File.text() で全部読み、読めなければ [] で上書きした）
  { const big = '[' + '"x",'.repeat(READ_LIMITS.comments / 4) + '"x"]';
    const { ws, api } = mkApi({ 'deck.html': '<h2>A</h2>', 'comments.json': big });
    assert.equal((await api('GET', '/__dev/comments'))._status, 413);
    assert.equal((await api('POST', '/__dev/comment', { comment: 'hi' }))._status, 413);
    assert.equal(await ws.readText('comments.json', { max: Infinity }), big, 'comments.json untouched'); }
  // コメントを足すと上限を超える：書かずに 413
  { const near = JSON.stringify([{ id: 'a', comment: 'y'.repeat(READ_LIMITS.comments - 200) }]);
    const { ws, api } = mkApi({ 'deck.html': '<h2>A</h2>', 'comments.json': near });
    assert.equal((await api('POST', '/__dev/comment', { comment: 'z'.repeat(1000) }))._status, 413);
    assert.equal(await ws.readText('comments.json'), near); }
  // 口述原稿（16 MiB を超える）：読まずに 413
  { const { api } = mkApi({ 'deck.html': '<h2>A</h2>', 'narration.md': '# n\n\n## s\n[0] ' + 'x'.repeat(READ_LIMITS.narration) + '\n' });
    assert.equal((await api('GET', '/__dev/narration?key=s:0'))._status, 413);
    assert.equal((await api('POST', '/__dev/narration', { slideKey: 's', stepKey: '0', rev: 'x', turns: [] }))._status, 413); }
  // 原稿（32 MiB を超える）：読まずに 413。上限の内でも、直すと上限を超えるなら書かず、控えも作らない
  { const { api } = mkApi({ 'deck.html': '<h2>A</h2>' + 'x'.repeat(READ_LIMITS.source) });
    assert.equal((await api('GET', '/__dev/source?range=4-5'))._status, 413); }
  { const deck = '<h2>A</h2>' + 'x'.repeat(READ_LIMITS.source - 100);
    const { ws, api } = mkApi({ 'deck.html': deck });
    const r = await api('POST', '/__dev/edit', { range: '4-5', h: short('A'), text: 'B'.repeat(1000) });
    assert.equal(r._status, 413);
    assert.equal(await ws.readText('deck.html'), deck);
    assert.ok(![...ws.snapshot().keys()].some((k) => k.startsWith('.cache/')), 'no backup was written'); }
});
ok('編集アプリのフォルダの読み取り（fsx.readText）：File.size が上限を超えるなら arrayBuffer() も text() も呼ばない（指摘 5）', async () => {
  const { readText } = await import('../app/fsx.js');
  const calls = { n: 0 };
  const root = (size, bytes) => ({ async getFileHandle() { return { async getFile() { return { size, async arrayBuffer() { calls.n++; return bytes.buffer; }, async text() { calls.n++; return ''; } }; } }; } });
  await assert.rejects(readText(root(1 << 30, new Uint8Array(1)), 'comments.json', { max: 4 * MiB }), (e) => e.code === 'read-over');
  await assert.rejects(readText(root(1 << 30, new Uint8Array(1)), 'comments.json'), (e) => e.code === 'read-over' && e.max === 32 * MiB);
  assert.equal(calls.n, 0);
  await assert.rejects(readText(root(2, new Uint8Array(10)), 'c.json', { max: 5 }), (e) => e.code === 'read-over' && e.n === 10);
  assert.equal(await readText(root(3, new TextEncoder().encode('abc')), 'c.json', { max: 3 }), 'abc');
});
ok('kit/safe-fs.mjs の readContained・backupFile：上限つきで読む（1 GiB の疎なファイルは読まずに断る）（指摘 5）', async () => {
  const d = deckDir(); sparse(path.join(d, 'comments.json'), 1024 * MiB);
  const o = child(`import { readContained, backupFile } from ${mod('kit/safe-fs.mjs')}; const t0 = Date.now(), rss0 = process.resourceUsage().maxRSS; let m = 'read', b = 'backed up';
    try { readContained(${JSON.stringify(d)}, ${JSON.stringify(path.join(d, 'comments.json'))}, 'utf8', { max: 4 << 20 }); } catch (e) { m = e.code; }
    try { backupFile(${JSON.stringify(d)}, ${JSON.stringify(path.join(d, 'comments.json'))}); } catch (e) { b = e.code; }
    console.log(JSON.stringify({ m, b, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS - rss0 }));`);
  assert.ok(o.m === 'read-over' && o.b === 'read-over' && o.ms < 5000 && o.rss < RSS_GROWTH, JSON.stringify(o));
  assert.ok(!fs.existsSync(path.join(d, '.cache')), 'no backup');
  const { readContained } = await import('../kit/safe-fs.mjs');
  fs.writeFileSync(path.join(d, 'small.txt'), 'abc');
  assert.equal(readContained(d, path.join(d, 'small.txt'), 'utf8', { max: 3 }), 'abc');
  assert.throws(() => readContained(d, path.join(d, 'small.txt'), 'utf8', { max: 2 }), (e) => e.code === 'read-over');
});
ok('開発サーバー：1 GiB の comments.json・narration.md は読まずに 413（サーバーの RSS は小さいまま）（指摘 5）', async () => {
  const d = deckDir({ 'narration.md': '# n\n\n## x\n[0] hello\n' });
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), path.join(d, 'deck.html'), '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let log = '';
    const base = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('server did not start\n' + log)), 20000);
      srv.stderr.on('data', (x) => { log += x; });
      srv.stdout.on('data', (x) => { log += x; const m = String(x).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
    });
    const u = new URL(base);
    const req = (method, p, headers = {}, body) => new Promise((res, rej) => {
      const r = http.request({ host: '127.0.0.1', port: u.port, method, path: p, headers: { host: u.host, ...headers } }, (resp) => { let b = ''; resp.on('data', (c) => { b += c; }); resp.on('end', () => res({ status: resp.statusCode, body: b })); });
      r.on('error', rej); if (body) r.write(body); r.end();
    });
    const shell = await req('GET', '/');
    const token = JSON.parse(/<script type="application\/json" id="dev-cfg">([^<]*)<\/script>/.exec(shell.body)[1]).token;
    const H = { 'x-deck-token': token };
    sparse(path.join(d, 'comments.json'), 1024 * MiB);
    const rssOf = () => +spawnSync('ps', ['-o', 'rss=', '-p', String(srv.pid)], { encoding: 'utf8' }).stdout.trim();
    const rss0 = rssOf();
    const t0 = Date.now();
    const c1 = await req('GET', '/__dev/comments', H);
    const c2 = await req('POST', '/__dev/comment', { ...H, 'content-type': 'application/json' }, JSON.stringify({ comment: 'hi' }));
    assert.equal(c1.status, 413, c1.body); assert.equal(c2.status, 413, c2.body);
    assert.equal(fs.statSync(path.join(d, 'comments.json')).size, 1024 * MiB, 'comments.json not overwritten');
    sparse(path.join(d, 'narration.md'), 1024 * MiB);
    const n1 = await req('GET', '/__dev/narration?key=x:0', H);
    assert.equal(n1.status, 413, n1.body);
    assert.ok(Date.now() - t0 < 5000);
    const rss = rssOf();
    assert.ok(!rss || !rss0 || rss - rss0 < RSS_GROWTH, `server RSS grew from ${rss0} to ${rss} KiB`);
  } finally { srv.kill('SIGKILL'); await new Promise((r) => (srv.exitCode !== null || srv.signalCode ? r() : srv.on('exit', r))); }
});

// ---------------------------------------------------------------- 3. 読める層と索引
ok('持ち運べる形式の書き出し：実体参照で膨らむ読める層を、作る前に（数えながら）組んだ文書の上限で断る（指摘 3）', async () => {
  const core = await import('../kit/core/build-core.mjs');
  const { nodeEnv, buildPortable } = await import('../kit/build.mjs');
  // 口述原稿は「&」が 1 MiB：組んだデッキ（JSON の中）では 1 倍、読める層（&amp;）では 5 倍
  const d = deckDir({ 'narration.md': '# n\n\n## x\n[0] ' + '&'.repeat(MiB) + '\n' });
  const f = path.join(d, 'deck.html');
  const r = core.build(nodeEnv, f, { subset: false, budget: core.buildBudget({}), audioRef: () => 'x' });
  // 組んだ出力と塊は入るが、膨らんだ読める層（5 MiB 余り）は入らない上限
  const limits = { bundledChars: r.html.length + 3 * MiB };
  let e = null; try { await buildPortable(f, { subset: false, limits }); } catch (x) { e = x; }
  assert.ok(e && e.code === 'build-too-large' && /readable layer/.test(e.message), String(e && e.message));
  assert.ok(!fs.existsSync(path.join(d, 'out')));
  // 同じものは既定の上限で書き出せる（読める層は 5 倍に膨らむ）
  const ok2 = await buildPortable(f, { subset: false });
  assert.ok(ok2.html.includes('&amp;'.repeat(1000)));
});
ok('持ち運べる形式の書き出し：索引は JSON にする前に大きさを見積もり、読み手の上限（indexBytes）を超えるなら作らずに断る（指摘 3）', async () => {
  const { buildPortable } = await import('../kit/build.mjs');
  const { LIMITS, jsonLowerBound } = await import('../kit/core/portable.mjs');
  assert.equal(jsonLowerBound({ a: [1, 'xy', null], b: { c: true } }), JSON.stringify({ a: [1, 'xy', null], b: { c: true } }).length);
  assert.ok(jsonLowerBound({ s: 'x'.repeat(100) }, 10) > 10);
  const d = deckDir({ 'narration.md': '# n\n\n## x\n[0] hello\n' });
  // 読み取った文書の知らない項目（carry）は残す：5 MiB の知らない項目で索引が 4 MiB を超える
  let e = null; try { await buildPortable(path.join(d, 'deck.html'), { subset: false, carry: { 'x-junk': 'j'.repeat(LIMITS.indexBytes + MiB) } }); } catch (x) { e = x; }
  assert.ok(e && e.code === 'build-too-large' && /portable index/.test(e.message), String(e && e.message));
});

let n = 0;
for (const [name, fn] of tests) {
  try { await fn(); n++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}`); console.log(e && e.stack ? e.stack : e); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`bounded-read: ${n}/${tests.length} ok`);
process.exit(n === tests.length ? 0 : 1);
