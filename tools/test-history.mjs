// 元に戻す・やり直しの履歴（app/history.js。handoff #86）の検査。作業場所はメモリの上のもの（app/memfs.js。ブラウザなしで動く）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-history.mjs
// 多段の元に戻す・やり直し、新しい記録でやり直しが消える、ほかの編集で変わっていれば断って列を捨てる、ないファイル（null）とバイト、
// 直前の記録に足す（merge）、深さと大きさの上限、clear、フックの順
import assert from 'node:assert/strict';
import { createHistory, filesMatch, writeFiles, same } from '../app/history.js';
import { memoryWorkspace } from '../app/memfs.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok   ' + name); };
const ws0 = () => memoryWorkspace('t', { 'deck.html': 'A', 'narration.md': 'N0' });
// 書いてから記録する（app/slides-panel.js・app/devapi.js と同じ順）
async function edit(h, ws, rel, text, label, extra = {}) {
  const before = await ws.readText(rel);
  if (text === null) await ws.remove(rel); else await ws.writeText(rel, text);
  h.record({ label, files: [{ rel, before, after: text }], ...extra });
}

await t('several levels of undo and redo, in order, with labels', async () => {
  let changes = 0;
  const h = createHistory({ onChange: () => changes++ }), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await edit(h, ws, 'deck.html', 'C', 'two');
  await edit(h, ws, 'narration.md', 'N1', 'three');
  assert.deepEqual(h.state().undo, ['one', 'two', 'three']);
  assert.ok(changes >= 3);
  let r = await h.undo(ws); assert.ok(r.ok); assert.equal(r.entry.label, 'three');
  assert.equal(await ws.readText('narration.md'), 'N0');
  r = await h.undo(ws); assert.equal(r.entry.label, 'two');
  assert.equal(await ws.readText('deck.html'), 'B');
  assert.ok(h.canRedo());
  r = await h.redo(ws); assert.equal(r.entry.label, 'two');
  assert.equal(await ws.readText('deck.html'), 'C');
  await h.undo(ws); await h.undo(ws); await h.undo(ws);
  assert.equal(await ws.readText('deck.html'), 'A');
  assert.equal((await h.undo(ws)).why, 'empty');
  assert.ok(!h.canUndo() && h.canRedo());
  await h.redo(ws); await h.redo(ws); await h.redo(ws);
  assert.equal(await ws.readText('deck.html'), 'C'); assert.equal(await ws.readText('narration.md'), 'N1');
  assert.equal((await h.redo(ws)).why, 'empty');
});

await t('a new action clears the redo stack; saving does not touch the history', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await h.undo(ws);
  assert.ok(h.canRedo());
  await edit(h, ws, 'deck.html', 'X', 'other');
  assert.ok(!h.canRedo());
  ws.markClean();
  assert.deepEqual(h.state().undo, ['other']);
});

await t('undo refuses when a touched file changed since, and drops the stale entries', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await edit(h, ws, 'deck.html', 'C', 'two');
  await ws.writeText('deck.html', 'outside');
  const r = await h.undo(ws);
  assert.equal(r.ok, false); assert.equal(r.why, 'changed');
  assert.equal(await ws.readText('deck.html'), 'outside');
  assert.ok(!h.canUndo());
});

await t('a change to an untouched file does not block undo', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await ws.writeText('narration.md', 'other tool');
  assert.ok((await h.undo(ws)).ok);
  assert.equal(await ws.readText('deck.html'), 'A');
});

await t('redo refuses when the file changed after the undo, and drops the redo stack', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await h.undo(ws);
  await ws.writeText('deck.html', 'outside');
  const r = await h.redo(ws);
  assert.equal(r.why, 'changed'); assert.ok(!h.canRedo());
  assert.equal(await ws.readText('deck.html'), 'outside');
});

await t('files that did not exist (null) and byte files', async () => {
  const h = createHistory(), ws = ws0();
  const wav = new Uint8Array([1, 2, 3, 4]);
  await ws.writeBytes('audio/a.wav', wav);
  // スライドの削除：原稿を書き、音声のファイルを消し、台本を作る（なかったもの）
  await ws.writeText('deck.html', 'A-');
  await ws.remove('audio/a.wav');
  await ws.writeText('new.md', 'X');
  h.record({ label: 'del', files: [{ rel: 'deck.html', before: 'A', after: 'A-' }, { rel: 'audio/a.wav', before: wav, after: null }, { rel: 'new.md', before: null, after: 'X' }, { rel: 'narration.md', before: 'N0', after: 'N0' }] });
  assert.equal(h.peek('undo').files.length, 3, 'unchanged files are not recorded');
  assert.ok((await h.undo(ws)).ok);
  assert.ok(same(await ws.readBytes('audio/a.wav'), wav));
  assert.equal(await ws.exists('new.md'), false);
  assert.equal(await ws.readText('deck.html'), 'A');
  assert.ok((await h.redo(ws)).ok);
  assert.equal(await ws.exists('audio/a.wav'), false);
  assert.equal(await ws.readText('new.md'), 'X');
  // バイトが違えば断る
  await h.undo(ws);
  await ws.writeBytes('audio/a.wav', new Uint8Array([9]));
  assert.equal((await h.redo(ws)).why, 'changed');
});

await t('hooks run after the files are written (undo, then redo)', async () => {
  const h = createHistory(), ws = ws0(), log = [];
  await ws.writeText('deck.html', 'B');
  h.record({ label: 'x', files: [{ rel: 'deck.html', before: 'A', after: 'B' }], at: 2, redoAt: 3,
    undo: () => log.push('undo:' + ws.dirty), redo: () => log.push('redo') });
  const r = await h.undo(ws);
  assert.equal(r.entry.at, 2); assert.equal(r.entry.redoAt, 3);
  await h.redo(ws);
  assert.deepEqual(log, ['undo:true', 'redo']);
});

await t('merge: a following write of the same file joins the previous entry', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'narration.md', 'N1', 'script');
  await edit(h, ws, 'narration.md', 'N2', 'readings', { merge: true });
  assert.deepEqual(h.state().undo, ['script']);
  await h.undo(ws);
  assert.equal(await ws.readText('narration.md'), 'N0');
  // 違うファイルの後には足さない
  await edit(h, ws, 'deck.html', 'B', 'deck');
  await edit(h, ws, 'narration.md', 'N3', 'readings', { merge: true });
  assert.deepEqual(h.state().undo, ['deck', 'readings']);
});

await t('depth and byte caps drop the oldest entries (the newest is always kept)', async () => {
  const h = createHistory({ depth: 3, bytes: 1000 }), ws = ws0();
  for (let i = 0; i < 5; i++) await edit(h, ws, 'deck.html', 'v' + i, 'e' + i);
  assert.deepEqual(h.state().undo, ['e2', 'e3', 'e4']);
  await edit(h, ws, 'deck.html', 'x'.repeat(492), 'big');   // (前 2 字 + 後 492 字) × 2 = 988 バイト。小さい記録は 8 バイト
  assert.deepEqual(h.state().undo, ['e4', 'big']);
  await edit(h, ws, 'deck.html', 'y'.repeat(600), 'huge');
  assert.deepEqual(h.state().undo, ['huge']);
  assert.ok(h.state().bytes > 1000);
});

await t('clear empties both stacks (another file was opened)', async () => {
  const h = createHistory(), ws = ws0();
  await edit(h, ws, 'deck.html', 'B', 'one');
  await edit(h, ws, 'deck.html', 'C', 'two');
  await h.undo(ws);
  h.clear();
  assert.ok(!h.canUndo() && !h.canRedo());
});

await t('filesMatch / writeFiles back up text files and keep cancelled writes out', async () => {
  const ws = ws0();
  const files = [{ rel: 'deck.html', before: 'A', after: 'Z' }];
  assert.ok(await filesMatch(ws, files, 'before'));
  await writeFiles(ws, files, 'before', 'after');
  assert.equal(await ws.readText('deck.html'), 'Z');
  assert.ok([...ws.snapshot().keys()].some((k) => k.startsWith('.cache/edits/') && k.endsWith('deck.html')));
  await assert.rejects(writeFiles(ws, files, 'after', 'before', () => false), (e) => e.name === 'Cancelled');
  assert.equal(await ws.readText('deck.html'), 'Z');
});

console.log(`\n${n} passed`);
