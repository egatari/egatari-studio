// 編集アプリの作業場所の単体の試験（ブラウザなし）
//   node tools/test-workspace.mjs
// 1. メモリの上の作業場所（app/memfs.js）：一覧はフォルダの walk と同じものを外す・読み書き・控え（30 個）・更新時刻・dirty・書き込みの守り
// 2. 権利の表示（app/rights.js）：改変を認めないライセンス（CC の -ND・All rights reserved）とライセンスのない著作権の表示
// 3. 持ち運べる 1 ファイルから作る作業場所（app/portable-ws.js）：audio/manifest.json・docId と権利の表示・フォルダへ書き出すもの・
//    部品庫の hash の比べ方・古い音声
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { memoryWorkspace, badRel, KEEP_EDITS } from '../app/memfs.js';
import { folderWorkspace } from '../app/workspace.js';
import { writeFile, backup as folderBackup, KEEP_EDITS as FOLDER_KEEP } from '../app/fsx.js';
import { isBackupName, BACKUP_RE, backupStamp } from '../kit/core/backup-name.mjs';
import * as SAFE from '../kit/safe-fs.mjs';
import { createDevApi } from '../app/devapi.js';
import { short } from '../kit/core/sha1.mjs';
import { rightsOf, isNoDerivatives } from '../app/rights.js';
import { workspaceFromPortable, archiveFiles, writeToDirectory, registryProblems, staleSteps, packFiles, unpackFiles } from '../app/portable-ws.js';
import { readPortable, parseJsonStrict, inputHash } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPortable } from '../kit/build.mjs';
import { makeDeck } from './portable-fixtures.mjs';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const dec = new TextDecoder();

ok('保存の競合：作業場所とその代に結び付け、控えの間に別の作業場所を開いたら書かずに取り消す・書く直前に原稿を読み直す・保存は 1 つずつ', async () => {
  const deck = '<h2>A の見出し</h2>';
  const mk = (name) => memoryWorkspace(name, { 'deck.html': deck, 'narration.md': '# n\n\n## s\n[0] x\n' });
  const A = mk('A'), B = mk('B');
  const ctx = { ws: A, gen: 1, generation() { return this.gen; }, deckFile: () => 'deck.html', slideOrder: () => [{ key: 's' }], editable: () => true,
    afterWrite: async () => false, msg: { conflict: 'conflict', cancelled: 'cancelled', notFound: 'nf', badRange: 'br', narrConflict: 'nc', badNarr: 'bn', noRev: 'nr', narrHead: '# n\n' } };
  const api = createDevApi(ctx);
  const range = `4-${4 + 'A の見出し'.length}`, h = short('A の見出し');
  // 1. A で保存を始め、控え（await）の間に B を開く → B には何も書かず、A の保存は取り消し（理由つき）
  let release; const gate = new Promise((r) => { release = r; });
  const backup0 = A.backup; A.backup = async (rel) => { await gate; return backup0(rel); };
  const p1 = api('POST', '/__dev/edit', { range, h, text: '直した' });
  await new Promise((r) => setTimeout(r, 10));
  ctx.ws = B; ctx.gen = 2;
  release();
  const r1 = await p1;
  assert.equal(r1._status, 410); assert.equal(r1.error, 'cancelled');
  assert.equal(await B.readText('deck.html'), deck, 'nothing written to B');
  assert.equal(await A.readText('deck.html'), deck, 'A not written either (cancelled, with a message)');
  // 2. 確かめと書き込みの間（控えの間）に外で原稿が変わった → 409、上書きしない
  ctx.ws = A; ctx.gen = 3;
  A.backup = async (rel) => { await backup0(rel); await A.writeText('deck.html', deck + '<p>外で</p>'); };
  const r2 = await api('POST', '/__dev/edit', { range, h, text: '直した' });
  assert.equal(r2._status, 409);
  assert.equal(await A.readText('deck.html'), deck + '<p>外で</p>', 'the outside change is kept');
  // 口述原稿も同じ
  A.backup = async (rel) => { await backup0(rel); if (rel === 'narration.md') await A.writeText('narration.md', '# n\n\n## s\n[0] 外で\n'); };
  const g = await api('GET', '/__dev/narration?key=s:0');
  const r3 = await api('POST', '/__dev/narration', { slideKey: 's', stepKey: '0', turns: [{ role: 'expert', text: 'y' }], rev: g.rev });
  assert.equal(r3._status, 409); assert.match(await A.readText('narration.md'), /外で/);
  // 3. 保存は 1 つずつ：2 つ同時に頼むと、後のものは前のものが書いた後の原稿で確かめる（同じ範囲の hash が変わっていて 409）
  A.backup = backup0;
  await A.writeText('deck.html', deck);
  const [a, b] = await Promise.all([api('POST', '/__dev/edit', { range, h, text: '一つ目' }), api('POST', '/__dev/edit', { range, h, text: '二つ目' })]);
  assert.deepEqual([a._status, b._status], [200, 409]);
  assert.equal(await A.readText('deck.html'), '<h2>一つ目</h2>');
});

ok('書き込みの取り消し：書いている途中で作業場所が替われば abort（入れ替えない）・live が false なら書かない・中身の版と markClean(rev)', async () => {
  // fsx.js の writeFile（File System Access API のハンドルの形を真似る）
  const mk = (gate) => { const h = { log: [], data: 'old', createWritable: async () => { h.log.push('create'); let b = null; return {
    write: async (d) => { h.log.push('write'); if (gate) await gate; b = d; }, close: async () => { h.log.push('close'); h.data = b; }, abort: async () => { h.log.push('abort'); } }; } }; return h; };
  let alive = true, release; const gate = new Promise((r) => { release = r; });
  const h = mk(gate);
  const p = writeFile(h, 'new', () => alive);
  await new Promise((r) => setTimeout(r, 5));
  alive = false; release();
  await assert.rejects(p, (e) => e.name === 'Cancelled');
  assert.deepEqual(h.log, ['create', 'write', 'abort']); assert.equal(h.data, 'old', 'not replaced');
  const h2 = mk(null);
  await assert.rejects(writeFile(h2, 'x', () => false), (e) => e.name === 'Cancelled');
  assert.deepEqual(h2.log, [], 'nothing created when already stale');
  await writeFile(h2, 'ok'); assert.equal(h2.data, 'ok');
  // フォルダの作業場所（folderWorkspace）を通した devapi の保存：書き込みの途中で替われば 410、ファイルはそのまま
  const fileH = (text, g) => { const f = { kind: 'file', text, log: [], getFile: async () => ({ text: async () => f.text, arrayBuffer: async () => new TextEncoder().encode(f.text).buffer, size: f.text.length, lastModified: 1 }),
    createWritable: async () => { let b = null; return { write: async (d) => { f.log.push('write'); if (g && g.on) await g.p; b = d; }, close: async () => { f.log.push('close'); f.text = b; }, abort: async () => { f.log.push('abort'); } }; } }; return f; };
  const g = { on: false }; g.p = new Promise((r) => { g.r = r; });
  const deck = '<h2>A の見出し</h2>';
  const files = { 'deck.html': fileH(deck, g) };
  const dir = { kind: 'directory', name: 'F', getFileHandle: async (n) => { if (!files[n]) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); return files[n]; },
    getDirectoryHandle: async (n) => { if (n === '.cache') return dir2; throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); } };
  const dir2 = { getDirectoryHandle: async () => dir3 }, dir3 = { getFileHandle: async () => fileH(''), async *entries() {}, removeEntry: async () => {} };
  const F = folderWorkspace(dir), B = memoryWorkspace('B', { 'deck.html': deck });
  const ctx = { ws: F, gen: 1, generation() { return this.gen; }, deckFile: () => 'deck.html', slideOrder: () => [], editable: () => true, afterWrite: async () => false, msg: { conflict: 'c', cancelled: 'cancelled', notFound: 'nf', badRange: 'br' } };
  const api = createDevApi(ctx);
  g.on = true;
  const pr = api('POST', '/__dev/edit', { range: `4-${4 + 'A の見出し'.length}`, h: short('A の見出し'), text: '直した' });
  for (let i = 0; i < 50 && !files['deck.html'].log.includes('write'); i++) await new Promise((r) => setTimeout(r, 2));
  ctx.ws = B; ctx.gen = 2; g.r();
  const res = await pr;
  assert.equal(res._status, 410);
  assert.equal(files['deck.html'].text, deck, 'the folder file was not replaced');
  assert.ok(files['deck.html'].log.includes('abort') && !files['deck.html'].log.includes('close'));
  assert.equal(await B.readText('deck.html'), deck, 'nothing written to the new workspace');
  // メモリの作業場所：live が false なら書かない。版は書くたびに増え、markClean は渡した版が今の版のときだけ効く
  const M = memoryWorkspace('M', { 'a.txt': '1' });
  await assert.rejects(M.writeText('a.txt', '2', { live: () => false }), (e) => e.name === 'Cancelled');
  assert.equal(await M.readText('a.txt'), '1'); assert.equal(M.revision, 0); assert.equal(M.dirty, false);
  await M.writeText('a.txt', '2'); const r1 = M.revision;
  await M.writeText('a.txt', '3');
  assert.equal(M.markClean(r1), false); assert.equal(M.dirty, true, 'an edit after the snapshot keeps it dirty');
  assert.equal(M.markClean(M.revision), true); assert.equal(M.dirty, false);
});

ok('Worker との受け渡し：同じ塊を指すパスは 1 つのバッファを 1 回だけ渡し、取り出した側でも作業場所でも写さない', async () => {
  const blob = new Uint8Array([1, 2, 3, 4]), other = new Uint8Array([9]);
  const files = { 'a.bin': blob, 'b.bin': blob, 'c.bin': blob, 'd.bin': other };
  const msg = packFiles(files);
  assert.equal(msg.buffers.length, 2);
  assert.deepEqual(msg.table.map(([, i]) => i), [0, 0, 0, 1]);
  const back = structuredClone(msg, { transfer: msg.buffers });
  const m = unpackFiles(back);
  assert.ok(m.get('a.bin') === m.get('b.bin') && m.get('b.bin') === m.get('c.bin') && m.get('a.bin') !== m.get('d.bin'));
  assert.equal(blob.byteLength, 0, 'the original buffer was transferred, not copied');
  const ws = memoryWorkspace('w', m);
  assert.deepEqual([...await ws.readBytes('c.bin')], [1, 2, 3, 4]);
  await ws.writeBytes('a.bin', new Uint8Array([7]));
  assert.deepEqual([...await ws.readBytes('b.bin')], [1, 2, 3, 4], 'writing one path does not change the others');
});

ok('メモリの作業場所：一覧はドットで始まる名前・out・audio などを外す（{audio: true} で audio/ を入れる）。フォルダの一覧も作る', async () => {
  const ws = memoryWorkspace('m', { 'deck.html': '<p>', 'figs/a.svg': '<svg/>', '.cache/edits/x': 'b', 'out/deck.html': 'o', 'audio/manifest.json': '{}', 'audio/seg.wav': new Uint8Array([1, 2]), 'a/node_modules/x.js': '1', 'a/.git/HEAD': 'h' });
  const l = await ws.list();
  assert.deepEqual([...l.files.keys()], ['deck.html', 'figs/a.svg']);
  assert.deepEqual([...l.dirs], ['figs']);
  assert.deepEqual([...(await ws.list({ audio: true })).files.keys()], ['audio/manifest.json', 'audio/seg.wav', 'deck.html', 'figs/a.svg']);
  assert.equal(l.files.get('deck.html').s, 3);
  assert.equal(ws.kind, 'memory'); assert.equal(ws.name, 'm');
});
ok('メモリの作業場所：読み書き・ないファイル（readText は null、readBytes は NotFoundError）・exists・更新時刻は書くたびに増える・dirty', async () => {
  let t = 1000;
  const ws = memoryWorkspace('m', { 'deck.html': 'a' }, { now: () => t });
  assert.equal(await ws.readText('deck.html'), 'a');
  assert.equal(await ws.readText('nope.md'), null);
  await assert.rejects(ws.readBytes('nope.md'), (e) => e.name === 'NotFoundError');
  assert.equal(await ws.exists('deck.html'), true); assert.equal(await ws.exists('x'), false);
  assert.equal(ws.dirty, false);
  const m0 = (await ws.list()).files.get('deck.html').m;
  await ws.writeText('deck.html', 'b');
  const m1 = (await ws.list()).files.get('deck.html').m;
  await ws.writeText('deck.html', 'c');   // 同じ時刻でも増える（一覧の署名が変わる）
  const m2 = (await ws.list()).files.get('deck.html').m;
  assert.ok(m0 < m1 && m1 < m2, `${m0} ${m1} ${m2}`);
  assert.equal(ws.dirty, true);
  ws.markClean(); assert.equal(ws.dirty, false);
  await ws.writeBytes('figs/x.bin', new Uint8Array([0, 255]));
  assert.deepEqual([...(await ws.readBytes('figs/x.bin'))], [0, 255]);
  assert.equal(await ws.exists('figs'), true);
  // 読んだバイト列を書き換えても中身は変わらない（写しを返す）
  (await ws.readBytes('figs/x.bin'))[0] = 9;
  assert.equal((await ws.readBytes('figs/x.bin'))[0], 0);
});
ok('メモリの作業場所：書き込みの守り（外へのパス・ファイルとフォルダの重なり）', async () => {
  const ws = memoryWorkspace('m', { 'deck.html': 'a' });
  for (const bad of ['../x', '/abs', 'a\\b', 'C:/x', 'a//b', './a', 'a/__proto__', 'x\u0000y', '']) {
    assert.ok(badRel(bad), bad);
    await assert.rejects(ws.writeText(bad, 'x'), (e) => e.code === 'bad-path', bad);
  }
  await assert.rejects(ws.writeText('deck.html/x', 'x'), (e) => e.code === 'bad-path');
  assert.throws(() => memoryWorkspace('m', { a: '1', 'a/b': '2' }), (e) => e.code === 'bad-path');
});
ok(`メモリの作業場所：控えは .cache/edits/ に（一覧と書き出しには入らない）、新しい ${KEEP_EDITS} 個だけ`, async () => {
  let t = Date.UTC(2026, 0, 1);
  const ws = memoryWorkspace('m', { 'deck.html': 'v0', 'narration.md': 'n' }, { now: () => t });
  for (let i = 1; i <= KEEP_EDITS + 5; i++) { await ws.backup('deck.html'); await ws.writeText('deck.html', 'v' + i); t += 1000; }
  await ws.backup('missing.md');   // ないものは何もしない
  const edits = [...ws.snapshot().keys()].filter((k) => k.startsWith('.cache/edits/'));
  assert.equal(edits.length, KEEP_EDITS);
  assert.equal(dec.decode(ws.snapshot().get(edits.sort().at(-1))), 'v' + (KEEP_EDITS + 4));
  assert.ok(edits.every((k) => k.endsWith('-deck.html')));
  assert.ok(![...(await ws.list({ audio: true })).files.keys()].some((k) => k.startsWith('.cache')));
  assert.ok(![...archiveFiles(ws).keys()].some((k) => k.startsWith('.cache')));
  // 同じ時刻の控えは名前を変えて残す
  const w2 = memoryWorkspace('m', { 'a.md': '1' }, { now: () => t });
  await w2.backup('a.md'); await w2.backup('a.md');
  assert.equal([...w2.snapshot().keys()].filter((k) => k.startsWith('.cache/')).length, 2);
});

ok('控えの掃除は控えの名前の形のファイルだけを消す（フォルダの作業場所・メモリの作業場所・開発サーバーの pruneBackups が同じ判定）', async () => {
  assert.equal(SAFE.BACKUP_RE, BACKUP_RE); assert.equal(SAFE.isBackupName, isBackupName);
  assert.equal(FOLDER_KEEP, KEEP_EDITS);
  const stamp0 = Date.UTC(2026, 0, 1);
  const OTHER = ['notes.txt', 'keep-me.md', '2026-01-01-deck.html', '0000-00-00T00-00-00-000Z', 'README', '.hidden', 'a2026-01-01T00-00-00-000Z-x'];
  for (const n of OTHER) assert.ok(!isBackupName(n), n);
  assert.ok(isBackupName(`${backupStamp(stamp0)}-deck.html`) && isBackupName(`${backupStamp(stamp0)}-2-deck.html`));
  // フォルダ（File System Access の口をまねる）：控えの 40 個と、ほかのファイル・フォルダ
  const entries = new Map(), removed = [];
  for (let i = 0; i < 40; i++) entries.set(`${backupStamp(stamp0 + i * 1000)}-deck.html`, { kind: 'file' });
  for (const n of OTHER) entries.set(n, { kind: 'file' });
  entries.set(`${backupStamp(stamp0 - 1000)}-old-dir`, { kind: 'directory' });   // 名前が控えの形でもフォルダは消さない
  const edits = {
    getFileHandle: async (n, o) => { if (!entries.has(n) && o && o.create) entries.set(n, { kind: 'file' }); return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }; },
    async *entries() { for (const [n, e] of entries) yield [n, e]; },
    removeEntry: async (n) => { removed.push(n); entries.delete(n); },
  };
  const deckH = { kind: 'file', getFile: async () => ({ text: async () => 'deck' }) };
  const root = { getFileHandle: async (n) => { if (n === 'deck.html') return deckH; throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); },
    getDirectoryHandle: async (n) => { if (n === '.cache') return { getDirectoryHandle: async () => edits }; throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); } };
  await folderBackup(root, 'deck.html', () => stamp0 + 100000);
  assert.equal(removed.length, 41 - KEEP_EDITS, removed.join(','));
  assert.ok(removed.every(isBackupName), 'only backups are removed');
  for (const n of OTHER) assert.ok(entries.has(n), `kept ${n}`);
  assert.ok(entries.has(`${backupStamp(stamp0 - 1000)}-old-dir`), 'a directory is kept');
  assert.equal([...entries.keys()].filter((n) => isBackupName(n) && entries.get(n).kind === 'file').length, KEEP_EDITS);
  // メモリの作業場所
  let t = stamp0;
  const init = { 'deck.html': 'v0' };
  for (const n of OTHER) init[`.cache/edits/${n}`] = 'x';
  init[`.cache/edits/sub/${backupStamp(stamp0 - 5000)}-deck.html`] = 'nested';
  const ws = memoryWorkspace('m', init, { now: () => t });
  for (let i = 0; i < KEEP_EDITS + 10; i++) { await ws.backup('deck.html'); t += 1000; }
  const keys = [...ws.snapshot().keys()];
  for (const n of OTHER) assert.ok(keys.includes(`.cache/edits/${n}`), `memory kept ${n}`);
  assert.ok(keys.includes(`.cache/edits/sub/${backupStamp(stamp0 - 5000)}-deck.html`), 'memory: nested file kept');
  assert.equal(keys.filter((k) => /^\.cache\/edits\/[^/]+$/.test(k) && isBackupName(k.split('/').pop())).length, KEEP_EDITS);
  // 開発サーバー・npm run の掃除（kit/safe-fs.mjs）
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  try {
    const ed = path.join(d, '.cache', 'edits'); fs.mkdirSync(ed, { recursive: true });
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(ed, `${backupStamp(stamp0 + i * 1000)}-deck.html`), 'b');
    for (const n of OTHER) fs.writeFileSync(path.join(ed, n), 'x');
    const gone = SAFE.pruneBackups(d, path.join('.cache', 'edits'), KEEP_EDITS);
    assert.equal(gone.length, 40 - KEEP_EDITS); assert.ok(gone.every(isBackupName));
    for (const n of OTHER) assert.ok(fs.existsSync(path.join(ed, n)), `node kept ${n}`);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// Worker の口（app/build-client.js・app/portable.js）を、Worker をまねた object で試す（virtual: の Worker の中身は空にして 1 本にまとめる）
class FakeWorker {
  static all = [];
  constructor() { this.sent = []; this.terminated = false; FakeWorker.all.push(this); }
  postMessage(m) { if (this.terminated) throw new Error('posted to a terminated worker'); this.sent.push(m); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage && this.onmessage({ data }); }     // 止めた後に届いたメッセージも渡す（まねる）
}
async function bundleApp(file) {
  const r = await esbuild.build({ entryPoints: [path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'app', file)], bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: [{ name: 'virt', setup(b) { b.onResolve({ filter: /^virtual:/ }, (a) => ({ path: a.path, namespace: 'virt' })); b.onLoad({ filter: /.*/, namespace: 'virt' }, () => ({ contents: 'export default ""', loader: 'js' })); } }] });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-')), file.replace(/\.js$/, '.mjs'));
  fs.writeFileSync(f, r.outputFiles[0].text);
  return import(pathToFileURL(f).href);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

ok('組み立ての Worker の口：止めた Worker からの答え・問い合わせは捨て、新しい Worker の要求に混ざらない。読み出しは要求の作業場所だけ・同時に 8 つまで', async () => {
  const { createBuildClient, READ_CONCURRENCY } = await bundleApp('build-client.js');
  FakeWorker.all.length = 0;
  let reads = 0, inFlight = 0, maxInFlight = 0;
  const mkWs = (name) => { const w = memoryWorkspace(name, { 'deck.html': name, 'a.txt': 'a' }); const rb = w.readBytes; w.readBytes = async (rel) => { reads++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return rb(rel); }; return w; };
  const A = mkWs('A'), B = mkWs('B');
  const c = createBuildClient({ text: {}, b64: {} }, async () => 'lazy', { WorkerClass: FakeWorker });
  const L = await A.list();
  const p1 = c.build(A, L, 'deck.html', {}, null, { timeout: 60000 });
  const W1 = FakeWorker.all[0];
  const req1 = W1.sent.find((m) => m.op === 'build');
  assert.equal(W1.sent[0].gen, 1);
  // 要求の作業場所を読む（答えは出した Worker に）
  W1.emit({ rpc: 1, gen: 1, op: 'read', arg: { ws: req1.ws, req: req1.id, rel: 'deck.html' } });
  for (let i = 0; i < 20 && !W1.sent.some((m) => m.rpcReply === 1); i++) await new Promise((r) => setTimeout(r, 5));
  const rep1 = W1.sent.find((m) => m.rpcReply === 1);
  assert.ok(rep1 && rep1.ok && dec.decode(rep1.value) === 'A' && rep1.gen === 1);
  // 要求のない作業場所（番号を偽っても）は読まない
  const before = reads;
  W1.emit({ rpc: 2, gen: 1, op: 'read', arg: { ws: req1.ws + 1, req: req1.id, rel: 'deck.html' } });
  await tick(); await tick();
  const rep2 = W1.sent.find((m) => m.rpcReply === 2);
  assert.ok(rep2 && !rep2.ok && reads === before, 'a read for a workspace without a pending request is refused');
  // 読み出しの途中で止める：その読み出しの答えはどこにも送られない
  W1.emit({ rpc: 3, gen: 1, op: 'read', arg: { ws: req1.ws, req: req1.id, rel: 'a.txt' } });
  await tick();
  c.terminate();
  await assert.rejects(p1, (e) => e.code === 'cancelled');
  assert.ok(W1.terminated);
  // 新しい Worker で新しい要求
  const p2 = c.build(B, await B.list(), 'deck.html', {}, null, { timeout: 60000 });
  const W2 = FakeWorker.all[1];
  const req2 = W2.sent.find((m) => m.op === 'build');
  assert.ok(W2 !== W1 && W2.sent[0].gen === 2);
  assert.notEqual(req2.id, req1.id, 'request ids are unique across generations');
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(!W1.sent.some((m) => m.rpcReply === 3) && !W2.sent.some((m) => m.rpcReply !== undefined), 'the pending read of the stopped worker is answered to nobody');
  // 止めた Worker からの答え（古い番号・新しい要求の番号を名乗るもの）と問い合わせは捨てる
  const r0 = reads;
  W1.emit({ id: req1.id, ok: true, value: 'OLD' });
  W1.emit({ id: req2.id, ok: true, value: 'OLD-FOR-NEW' });
  W1.emit({ rpc: 1, gen: 1, op: 'read', arg: { ws: req2.ws, req: req2.id, rel: 'deck.html' } });
  W1.emit({ rpc: 1, gen: 1, op: 'lazy', arg: '/x' });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(reads, r0, 'nothing is read for the stopped worker');
  assert.ok(!W2.sent.some((m) => m.rpcReply !== undefined), 'no reply reaches the new worker');
  // 新しい Worker の問い合わせ：同時に読むのは 8 つまで
  maxInFlight = 0;
  for (let i = 1; i <= 20; i++) W2.emit({ rpc: i, gen: 2, op: 'read', arg: { ws: req2.ws, req: req2.id, rel: i % 2 ? 'deck.html' : 'a.txt' } });
  for (let i = 0; i < 200 && W2.sent.filter((m) => m.rpcReply !== undefined).length < 20; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(W2.sent.filter((m) => m.rpcReply !== undefined && m.ok).length, 20);
  assert.ok(maxInFlight <= READ_CONCURRENCY && maxInFlight > 1, `in flight ${maxInFlight}`);
  assert.ok(W2.sent.filter((m) => m.rpcReply !== undefined).every((m) => m.gen === 2));
  // 新しい要求はふつうに終わる
  W2.emit({ id: req2.id, ok: true, value: 'NEW' });
  assert.equal(await p2, 'NEW');
  // 期限：止めるのは要求を出した Worker だけ（替わった後の古い期限は新しい Worker に触れない）
  const p3 = c.build(B, await B.list(), 'deck.html', {}, null, { timeout: 20 });
  await assert.rejects(p3, (e) => e.code === 'build-timeout');
  assert.ok(W2.terminated);
});

ok('持ち運べる 1 ファイルを読む Worker の口：期限で止めた Worker の答えは捨て、新しい読み取りに混ざらない', async () => {
  const PW = await bundleApp('portable.js');
  FakeWorker.all.length = 0;
  PW._setWorkerClass(FakeWorker);
  const p1 = PW.readInWorker(new Uint8Array([1]), { timeout: 20 });
  const W1 = FakeWorker.all[0], id1 = W1.sent[0].id;
  await assert.rejects(p1, (e) => e.code === 'reader-timeout');
  assert.ok(W1.terminated);
  const p2 = PW.readInWorker(new Uint8Array([2]), { timeout: 60000 });
  const W2 = FakeWorker.all[1], id2 = W2.sent[0].id;
  assert.ok(W2 !== W1 && id2 !== id1);
  let settled = false; p2.then(() => { settled = true; }, () => { settled = true; });
  W1.emit({ id: id1, ok: false, error: { code: 'x', message: 'old' } });
  W1.emit({ id: id2, ok: true, indexText: '{"forged":true}', buffers: [], table: [] });
  await tick(); await tick();
  assert.equal(settled, false, 'replies of the stopped worker are dropped');
  W2.emit({ id: id2, ok: true, indexText: '{"docId":"new"}', deckMetaText: null, buffers: [], table: [], warnings: [] });
  const r = await p2;
  assert.equal(r.index.docId, 'new');
  // 古い Worker の失敗も新しい Worker の要求を断らない
  const p3 = PW.readInWorker(new Uint8Array([3]), { timeout: 60000 });
  const id3 = W2.sent.at(-1).id;
  W1.onerror && W1.onerror({ message: 'old failure', preventDefault() {} });
  W2.emit({ id: id3, ok: true, indexText: '{"docId":"three"}', deckMetaText: null, buffers: [], table: [], warnings: [] });
  assert.equal((await p3).index.docId, 'three');
  assert.ok(!W2.terminated);
});

ok('権利：改変を認めないライセンスと、ライセンスのない著作権の表示は確認が要る', () => {
  for (const l of ['CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0', 'https://creativecommons.org/licenses/by-nd/4.0/', 'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ja', 'CC BY-ND 4.0', 'All rights reserved']) assert.ok(isNoDerivatives(l), l);
  for (const l of ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'MIT', 'CC0-1.0', 'https://creativecommons.org/licenses/by/4.0/', 'LicenseRef-and', '', null]) assert.ok(!isNoDerivatives(l), String(l));
  assert.deepEqual(rightsOf({ license: 'CC-BY-ND-4.0', copyright: '© A' }).reason, 'nd-license');
  assert.deepEqual(rightsOf({ copyright: '© A' }).reason, 'copyright-only');
  assert.equal(rightsOf({ license: 'CC-BY-4.0', copyright: '© A' }).noDerivatives, false);
  assert.equal(rightsOf({}).noDerivatives, false);
  const r = rightsOf({ title: 'T', creators: ['A', 3, ' '], attribution: ' X ', license: 'MIT' });
  assert.deepEqual([r.title, r.creators, r.attribution, r.license], ['T', ['A'], 'X', 'MIT']);
  assert.equal(rightsOf(null).license, null);
});

// ---------------------------------------------------------------- 持ち運べる 1 ファイルから
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'test-workspace-'));
async function portable(name, edit) {
  const dir = makeDeck(path.join(work, name));
  if (edit) edit(dir);
  const r = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(dir, 'out.html') });
  return { r, read: await readPortable(r.html) };
}
ok('持ち運べる 1 ファイルから：audio/manifest.json を作る・egatari.json はそのまま（docId と権利が索引と同じ）・書き出すものは unpack と同じ', async () => {
  const { r, read } = await portable('a');
  const ws = workspaceFromPortable('a' + FORMAT.FILE_EXT, read);
  assert.equal(ws.dirty, false);
  const snap = ws.snapshot();
  for (const p of Object.keys(read.files)) assert.deepEqual(snap.get(p), read.files[p], p);
  const man = JSON.parse(dec.decode(snap.get('audio/manifest.json')));
  assert.deepEqual(Object.keys(man.segments), Object.keys(r.index.audio));
  assert.equal(snap.get(FORMAT.CONFIG_FILE).length, read.files[FORMAT.CONFIG_FILE].length, 'config untouched');
  assert.deepEqual([...archiveFiles(ws).keys()].sort(), [...Object.keys(read.files), 'audio/manifest.json'].sort());
  // コメント（Claude への指示）と控えはフォルダへの書き出しに入らない
  await ws.writeText('comments.json', '[]'); await ws.backup('deck.html');
  assert.ok(!archiveFiles(ws).has('comments.json'));
  assert.equal(ws.dirty, false, 'a note is not an unsaved change of the lesson');
  assert.deepEqual(await staleSteps(ws), []);
  // 口述原稿を直すと、その段階の音声は古い（消さない）
  const narr = (await ws.readText('narration.md')).replace('これは試験用の教材です。', 'これは直した教材です。');
  await ws.writeText('narration.md', narr);
  assert.deepEqual(await staleSteps(ws), ['s-intro1:0']);
});
ok('持ち運べる 1 ファイルから：egatari.json がなければ索引の docId と metadata で作り、あっても権利の表示がなければ索引から足す', async () => {
  const { read } = await portable('b');
  const files = { ...read.files }; delete files[FORMAT.CONFIG_FILE];
  const ws = workspaceFromPortable('b', { ...read, files: new Map(Object.entries(files)) });
  const cfg = JSON.parse(await ws.readText(FORMAT.CONFIG_FILE));
  assert.equal(cfg.docId, read.index.docId);
  assert.equal(cfg.metadata.copyright, '© 2026 Test Author');
  assert.equal(cfg.metadata.license, 'CC-BY-4.0');
  const f2 = new Map(Object.entries(read.files));
  f2.set(FORMAT.CONFIG_FILE, new TextEncoder().encode(JSON.stringify({ docId: read.index.docId, metadata: { description: 'd' } })));
  const c2 = JSON.parse(await workspaceFromPortable('b', { ...read, files: f2 }).readText(FORMAT.CONFIG_FILE));
  assert.deepEqual(c2.metadata, { description: 'd', license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author, Test lesson' });
});
ok('部品庫・テーマ庫の hash：同じなら問題なし、違う・ない部品は知らせる（原稿のフォルダの部品は比べない）', () => {
  const orig = parseJsonStrict(JSON.stringify({ components: [{ tag: 'm-a', name: 'a', version: '1', sha256: 'a'.repeat(64), source: 'registry' }, { tag: 'm-b', name: 'b', version: '1', sha256: 'b'.repeat(64), source: 'registry' }, { tag: 'm-c', name: 'c', version: 'local', sha256: 'c'.repeat(64), source: 'embedded', path: 'components/c/index.js' }],
    themes: [{ name: 'default', version: '1', sha256: 'd'.repeat(64), source: 'registry' }] }));
  assert.deepEqual(registryProblems(orig, orig), []);
  const fresh = { components: [{ tag: 'm-a', name: 'a', version: '2', sha256: 'a'.repeat(64), source: 'registry' }], themes: [{ name: 'default', version: '1', sha256: 'e'.repeat(64), source: 'registry' }] };
  const p = registryProblems(orig, fresh);
  assert.equal(p.length, 2, p.join('; '));
  assert.ok(p.some((x) => /m-b .*not in this editor/.test(x)) && p.some((x) => /theme default/.test(x)));
});
ok('フォルダへの書き出し：空でないフォルダには書かない・入れ子のフォルダを作る', async () => {
  // File System Access のフォルダのハンドルと同じ形の、メモリの上のもの
  class F { constructor() { this.kind = 'file'; this.data = null; } async createWritable() { return { write: async (d) => { this.data = d; }, close: async () => {} }; } }
  class D { constructor(name) { this.kind = 'directory'; this.name = name; this.c = new Map(); }
    keys() { const m = this.c; return (async function* () { yield* m.keys(); })(); }
    async getDirectoryHandle(n, o) { if (!this.c.has(n) && o && o.create) this.c.set(n, new D(n)); return this.c.get(n); }
    async getFileHandle(n, o) { if (!this.c.has(n) && o && o.create) this.c.set(n, new F()); return this.c.get(n); } }
  const d = new D('out');
  const files = new Map([['deck.html', new Uint8Array([1])], ['audio/x/seg.wav', new Uint8Array([2])]]);
  assert.equal(await writeToDirectory(d, files), 2);
  assert.deepEqual([...d.c.get('audio').c.get('x').c.get('seg.wav').data], [2]);
  await assert.rejects(writeToDirectory(d, files), (e) => e.code === 'not-empty');
  await assert.rejects(writeToDirectory(new D('e'), new Map([['../x', new Uint8Array(1)]])), (e) => e.code === 'bad-path');
});
ok('inputHash の確かめ：作業場所の古い段階は §5.4 の hash で決まる', async () => {
  const { read } = await portable('c');
  const segs = parseNarration(dec.decode(read.files['narration.md']));
  const k = Object.keys(read.index.audio)[0];
  assert.equal(read.index.audio[k].inputHash, await inputHash(segs.find((s) => `${s.slideKey}:${s.stepKey}` === k)));
});

let n = 0;
for (const [name, fn] of tests) {
  try { await fn(); n++; console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`workspace: ${n}/${tests.length} ok`);
