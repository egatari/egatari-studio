// test-all: unit
// Extension governance (§9A): opaque higher versions and optional members within v1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPortable, nodeEnv } from '../kit/build.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { addLive, lessonLive, mergeLive, parseRoomBlock } from '../kit/core/live.mjs';
import { extensionSources, policyText, findPolicies, checkFilePolicy } from '../kit/core/file-policy.mjs';
import { makeDeck } from './portable-fixtures.mjs';
import { unpack } from './portable.mjs';
import { roomMatch } from '../kit/core/live-results.mjs';
import { startLive } from '../play/live-host.mjs';
import { createLivePanel } from '../app/live-panel.js';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(ROOT, '.tmp-live-extension-versions'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const LP = LivePolicy();
const plain = (v) => JSON.parse(JSON.stringify(v));
const enc = new TextEncoder(), dec = new TextDecoder();
const extra = { futureOptional: { keep: ['unchanged', 42] } };
const live = { v: 1, endpoint: 'https://live.example.org', room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD',
  window: { from: '2026-10-30T00:00:00Z', to: '2026-10-30T02:00:00Z', ...extra },
  activities: { '*': [{ id: 'qa', kind: 'qa', ...extra }] }, ...extra };
const embed = { v: 1, items: { video: { src: 'https://www.youtube-nocookie.com/embed/example', title: 'Example', ...extra } }, ...extra };
assert.deepEqual(LP.validate(live, { key: true }), []);
assert.ok(LP.socketUrl(live, 'p7Hk2mQx9LwR4tZa'));
assert.equal(LP.activitiesFor(live, '*').length, 1);
assert.deepEqual(parseRoomBlock(JSON.stringify(live)), live);
assert.deepEqual(lessonLive(live), (({ key, ...rest }) => rest)(live));
const future = { ...live, v: 2 };
assert.deepEqual(LP.validate({ v: 2 }, { key: true }).map((e) => e.code), ['version']);
assert.equal(LP.socketUrl(future, 'p7Hk2mQx9LwR4tZa'), null);
assert.equal(LP.joinUrl(future), null);
assert.deepEqual(LP.activitiesFor(future, '*'), []);
assert.deepEqual(mergeLive(future, live), future);
assert.deepEqual(mergeLive(lessonLive(live), { ...live, window: { from: live.window.from, to: live.window.to } }).window, live.window);
assert.equal(startLive({ live: future, policy: LP }), null);
assert.equal(roomMatch({ room: live.room }, live), 'match');
assert.equal(roomMatch({ room: live.room }, future), 'none');
assert.deepEqual(lessonLive(future), future);
assert.throws(() => parseRoomBlock(JSON.stringify(future)), /invalid/);
// The bundled reader exits before any DOM construction or connection for higher v.
let calls = 0;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'kit/live.js'), 'utf8'), {
  window: { DECK: { LivePolicy } }, URLSearchParams, location: { search: '' }, console: { warn() {} },
  document: { documentElement: { getAttribute: () => null }, getElementById: () => ({ type: 'application/json', textContent: JSON.stringify({ live: future }) }), createElement() { calls++; throw new Error('unexpected UI'); } },
  WebSocket() { calls++; throw new Error('unexpected connection'); }, fetch() { calls++; throw new Error('unexpected request'); },
});
assert.equal(calls, 0);

for (const v of [1, 2]) {
  const extensions = { live: v === 1 ? lessonLive(live) : future, embed: { ...embed, v } };
  const sources = extensionSources(extensions);
  assert.deepEqual(sources, v === 1 ? { connect: ['https://live.example.org', 'wss://live.example.org'], frame: ['https://www.youtube-nocookie.com'] } : { connect: [], frame: [] });
  const dir = makeDeck(path.join(work, `v${v}`));
  const narration = path.join(dir, 'narration.md');
  fs.writeFileSync(narration, fs.readFileSync(narration, 'utf8').replace(/^@x-.*\n/gm, ''));
  const cfg = path.join(dir, FORMAT.CONFIG_FILE);
  fs.writeFileSync(cfg, JSON.stringify({ extensions }, null, 2) + '\n');
  const deck = path.join(dir, 'deck.html');
  const packed = path.join(work, `v${v}.ega.html`);
  const cli = spawnSync(process.execPath, ['tools/portable.mjs', 'pack', dir, '-o', packed], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const html = fs.readFileSync(packed, 'utf8');
  const r = await PF.readPortable(html);
  assert.deepEqual(plain(r.index.extensions), extensions);
  assert.deepEqual(PF.validateIndex(r.index), []);
  assert.deepEqual(checkFilePolicy(html), []);
  const exported = await buildPortable(deck, { playOnly: true });
  const runtime = JSON.parse(/id="deck-extensions">([^<]*)<\/script>/.exec(exported.html)[1]);
  assert.deepEqual(runtime.embed, extensions.embed);
  if (v === 2) {
    assert.deepEqual(runtime.live, future);
    assert.equal(findPolicies(exported.html)[0].content, policyText());
    assert.deepEqual(checkFilePolicy(exported.html), []);
    const indexOnly = html.replace(/<script type="application\/json" id="deck-extensions">[^<]*<\/script>/, '');
    const direct = PF.playOnly(indexOnly);
    assert.deepEqual(JSON.parse(/id="deck-extensions">([^<]*)<\/script>/.exec(direct)[1]), extensions);
    assert.equal(findPolicies(direct)[0].content, policyText());
    const withRoom = await buildPortable(deck, { playOnly: true, live });
    assert.equal(withRoom.html, exported.html, 'a v1 room must not reinterpret a v2 lesson');
    const added = addLive(exported.html.replace(/<script type="application\/json" id="deck-extensions">[^<]*<\/script>/, ''), future);
    assert.equal(findPolicies(added)[0].content, policyText());
    assert.deepEqual(checkFilePolicy(added), []);
  } else {
    const withRoom = await buildPortable(deck, { playOnly: true, live });
    const data = JSON.parse(/id="deck-extensions">([^<]*)<\/script>/.exec(withRoom.html)[1]);
    assert.deepEqual(data.live.futureOptional, extra.futureOptional);
    assert.deepEqual(data.live.window, live.window);
    assert.deepEqual(data.live.activities, live.activities);
    assert.deepEqual(LP.validate(data.live, { key: true }), []);
  }
  // The editor's tier A save preserves the original extension JSON bytes.
  const ws = new Map(Object.entries(r.files));
  ws.set('narration.md', enc.encode(dec.decode(ws.get('narration.md')).replace('これは試験用の教材です。', 'これは試験用です。')));
  const saved = await tierA(html, ws, {});
  assert.ok(saved.ok, `${saved.code}: ${saved.reason}`);
  assert.notEqual(saved.html, html, 'a real editor edit was saved');
  const sr = await PF.readPortable(saved.html);
  assert.deepEqual(plain(sr.index.extensions), extensions);
  const extensionBytes = (s) => /"extensions":([\s\S]*?),\n "exportedFrom"/.exec(PF.scanDocument(s).byId.get(FORMAT.INDEX_ID).text)?.[1];
  assert.ok(extensionBytes(html));
  assert.equal(extensionBytes(saved.html), extensionBytes(html));
  // A rebuild save (tier B) keeps content too.
  const rebuilt = await PF.exportPortable(nodeEnv, deck, { carry: sr.index });
  assert.deepEqual(plain(rebuilt.index.extensions), extensions);
  const dest = path.join(work, `unpack-v${v}`);
  await unpack(packed, dest);
  const repacked = await buildPortable(path.join(dest, 'deck.html'));
  assert.deepEqual(plain(repacked.index.extensions), extensions);
  // Extensions present only in the index must survive unpack into a folder.
  const { extensions: ignored, ...config } = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const folderConfig = PF.folderConfig(r.index, JSON.stringify(config));
  assert.deepEqual(JSON.parse(folderConfig).extensions, extensions);
  console.log(`ok extension v${v}: policy, export, pack/unpack, editor saves and optional members`);
}

// The Live panel does not interpret or overwrite an unsupported version.
let writes = 0, body;
const panel = createLivePanel({
  lang: 'en', ws: () => ({ readText: async () => JSON.stringify({ extensions: { live: { v: 2, activities: 'opaque', window: 'opaque' } } }), writeText: () => { writes++; } }),
  el: (tag, attrs, children) => ({ tag, attrs, children }), openPanel: (_, content) => { body = content; }, isOpen: () => true,
});
await panel.open();
assert.ok(JSON.stringify(body).includes('not supported'));
assert.equal(panel.ready(), false);
assert.equal(await panel.prepare(), null);
assert.equal(writes, 0);
console.log('ok higher live v: Viewer host and editor panel do not interpret or connect');
