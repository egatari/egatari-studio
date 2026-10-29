// 書き出しの印（index.exportedFrom、format spec §3.1）の試験
//   node tools/test-exported-from.mjs [作業フォルダ]
// test-all: unit
// 作業フォルダからの書き出し（CLI の --portable・npm run portable -- pack）は {kind: "folder", sourceSha256} を書き、値はその書き出しの sourceSha256。
// 1 ファイルの保存（段 A・段 B の作り直し）は印を変えずに残し（新しい docId の教材として保存するときは外す）、写しの sourceSha256 が印の値と違うことで書き出しの後の編集が分かる。
// 展開したフォルダ（設定のファイル）は印を持たず、pack(unpack(x)) は x と同じバイト。再生専用の派生と、1 ファイルが原本の教材（carry なしの書き出し）は印なし。
// npm run portable -- compare：写しとフォルダの両方があるとき、どちらを直したか（写し・フォルダ・両方）を言う
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { buildPortable, nodeEnv } from '../kit/build.mjs';
import { unpack, compare } from './portable.mjs';
import { makeDeck } from './portable-fixtures.mjs';
import { buildExamples } from './examples-portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPEC = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-exported-from-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const enc = new TextEncoder(), dec = new TextDecoder();
const plainJson = (o) => JSON.parse(JSON.stringify(o));
const CFG = FORMAT.CONFIG_FILE, EXT = FORMAT.FILE_EXT;

const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: () => { throw new Error('no network'); } });
for (const f of fs.readdirSync(path.join(SPEC, 'schema'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SPEC, 'schema', f), 'utf8')));
const vIndex = ajv.getSchema(FORMAT.SCHEMA_BASE + FORMAT.SCHEMA_PREFIX + 'index.schema.json');

// 1 ファイルを作業場所（メモリの Map）にする（編集アプリと同じ：audio/manifest.json を索引から作る）
const workspace = (r) => {
  const m = new Map(Object.entries(r.files));
  if (r.index.audio && Object.keys(r.index.audio).length) m.set('audio/manifest.json', enc.encode(PF.manifestFromAudio(r.index.audio)));
  return m;
};
const writeTree = (dir, files) => {
  for (const [p, b] of files) { const t = path.join(dir, ...p.split('/')); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, b); }
  return dir;
};
const noIndex = (html) => html.replace(new RegExp(`<script type="[^"]*" id="${FORMAT.INDEX_ID}"[\\s\\S]*?</script>`), '');
const cli = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });

const D = makeDeck(path.join(work, 'deck'));
const OUT = path.join(work, 'deck-export' + EXT);
let x, xr;

ok('CLI（node kit/build.mjs --portable）：作業フォルダからの書き出しは exportedFrom = {kind: "folder", sourceSha256: その書き出しの sourceSha256} を書く（時刻・パス・名前なし。Schema と検査器が通す）', async () => {
  const r = cli('kit/build.mjs', path.join(D, 'deck.html'), '--portable', '-o', OUT);
  assert.equal(r.status, 0, r.stderr);
  x = fs.readFileSync(OUT, 'utf8');
  xr = await PF.readPortable(x);
  assert.ok(xr.sourceMatches);
  assert.deepEqual(plainJson(xr.index.exportedFrom), { kind: 'folder', sourceSha256: xr.index.sourceSha256 });
  // 値はフォルダの原稿の hash（§3.4 の数え方で files から求め直したもの）
  const shas = Object.fromEntries(Object.entries(xr.index.files).map(([p, id]) => [p, xr.index.blobs[id].sha256]));
  assert.equal(xr.index.exportedFrom.sourceSha256, await PF.sourceSha256(shas));
  assert.deepEqual(Object.keys(xr.index.exportedFrom), ['kind', 'sourceSha256']);
  assert.equal(Object.keys(xr.index).at(-1), 'exportedFrom', 'the new member is last (everything before it is as before)');
  assert.ok(vIndex(plainJson(xr.index)), JSON.stringify(vIndex.errors));
  assert.deepEqual(PF.validateIndex(xr.index), []);
  assert.deepEqual(plainJson(PF.exportedState(xr.index)), { exportedSha256: xr.index.sourceSha256, copyEdited: false, folderEdited: null, both: false });
  // 同じフォルダから書き出し直すと同じバイト（再現できる）。印のない書き出しとの違いは索引の exportedFrom だけ
  const again = await buildPortable(path.join(D, 'deck.html'), { out: OUT });
  assert.equal(again.html, x, 'export is byte-reproducible');
  const plain = await PF.exportPortable(nodeEnv, path.join(D, 'deck.html'), {});
  assert.equal(plain.index.exportedFrom, undefined);
  const { exportedFrom, ...rest } = xr.index;
  assert.deepEqual(plainJson(rest), plainJson(plain.index), 'only exportedFrom differs');
  assert.ok(noIndex(x).length < x.length, 'the index was found');
  assert.equal(noIndex(x), noIndex(plain.html), 'everything outside the index is byte-identical');
});

ok('検査器と Schema：kind が folder でない・sha256 でない・余分な項目・object でない exportedFrom を断る（同じ判定）', () => {
  const bad = [{ kind: 'file', sourceSha256: 'a'.repeat(64) }, { kind: 'folder', sourceSha256: 'A'.repeat(64) }, { kind: 'folder' }, { kind: 'folder', sourceSha256: 'a'.repeat(64), at: '2026-10-21' }, 'folder', null];
  for (const b of bad) {
    const ix = { ...plainJson(xr.index), exportedFrom: b };
    assert.equal(vIndex(ix), false, `schema accepts ${JSON.stringify(b)}`);
    assert.ok(PF.validateIndex(ix).length > 0, `validateIndex accepts ${JSON.stringify(b)}`);
  }
});

ok('1 ファイルの保存（段 A）：口述原稿を直して保存しても exportedFrom は同じバイトのまま。写しの sourceSha256 が変わり、書き出しの後に直したと分かる', async () => {
  const ws = workspace(xr);
  ws.set('narration.md', enc.encode(dec.decode(ws.get('narration.md')).replace('これは試験用の教材です。', 'これは試験用です。')));
  const a = await tierA(x, ws, {});
  assert.ok(a.ok, `tier A refused: [${a.code}] ${a.reason}`);
  const ar = await PF.readPortable(a.html);
  assert.ok(ar.sourceMatches);
  assert.deepEqual(plainJson(ar.index.exportedFrom), plainJson(xr.index.exportedFrom));
  assert.notEqual(ar.index.sourceSha256, xr.index.sourceSha256);
  const st = PF.exportedState(ar.index);
  assert.equal(st.copyEdited, true);
  assert.equal(st.folderEdited, null, 'the folder state is not known from the copy alone');
  // 何も変えずに保存すると同じバイト
  const same = await tierA(x, workspace(xr), {});
  assert.ok(same.ok && same.html === x);
});

ok('1 ファイルの保存（段 B：作り直し、carry）：exportedFrom は元のまま（書き出しの印を新しくしない）。新しい教材として保存（新しい docId）は外す', async () => {
  const U = path.join(work, 'tier-b');
  writeTree(U, workspace(xr));
  fs.writeFileSync(path.join(U, 'deck.html'), fs.readFileSync(path.join(U, 'deck.html'), 'utf8').replace('次の段階</p>', '次の段階（直した）</p>'));
  const b = await PF.exportPortable(nodeEnv, path.join(U, 'deck.html'), { carry: xr.index });
  assert.deepEqual(plainJson(b.index.exportedFrom), plainJson(xr.index.exportedFrom));
  assert.notEqual(b.index.sourceSha256, xr.index.sourceSha256);
  assert.equal(PF.exportedState(b.index).copyEdited, true);
  const docId = PF.newDocId();
  const n = await PF.exportPortable(nodeEnv, path.join(U, 'deck.html'), { carry: xr.index, identity: { docId, derivedFrom: { docId: xr.index.docId, sourceSha256: xr.index.sourceSha256 } } });
  assert.equal(n.index.docId, docId);
  assert.equal(n.index.exportedFrom, undefined, 'a new lesson (new docId) is not a copy');
});

ok('新しい教材として保存（段 A、新しい docId）：exportedFrom を外す（ほかは段 A の場所だけ）。開き直しても印なし。同じ docId の段 A の保存は残す', async () => {
  const ws = workspace(xr);
  const docId = PF.newDocId(), derivedFrom = { docId: xr.index.docId, sourceSha256: xr.index.sourceSha256 };
  const cfg = JSON.parse(dec.decode(ws.get(CFG)));
  ws.set(CFG, enc.encode(JSON.stringify({ ...cfg, docId, metadata: { ...cfg.metadata, derivedFrom } }, null, 2) + '\n'));
  const a = await tierA(x, ws, { identity: { docId, derivedFrom } });
  assert.ok(a.ok, `tier A refused: [${a.code}] ${a.reason}`);
  const ar = await PF.readPortable(a.html);
  assert.ok(ar.sourceMatches);
  assert.equal(ar.docId, docId);
  assert.equal(ar.index.exportedFrom, undefined);
  assert.ok(!a.html.includes('"exportedFrom"'));
  assert.equal(PF.exportedState(ar.index), null);
  assert.deepEqual(PF.validateIndex(ar.index), []);
  // 同じ docId の保存（口述原稿だけ直す）は残す
  const ws2 = workspace(xr);
  ws2.set('narration.md', enc.encode(dec.decode(ws2.get('narration.md')).replace('次の段階です。', '次です。')));
  const k = await tierA(x, ws2, {});
  assert.ok(k.ok);
  assert.deepEqual(plainJson((await PF.readPortable(k.html)).index.exportedFrom), plainJson(xr.index.exportedFrom));
});

ok('1 ファイルが原本の教材（carry なし・印のない carry の書き出し：編集アプリの保存・貼り付け・deck.html だけ）には exportedFrom がない', async () => {
  const S = makeDeck(path.join(work, 'single'));
  const r = await PF.exportPortable(nodeEnv, path.join(S, 'deck.html'), {});
  assert.equal(r.index.exportedFrom, undefined);
  assert.ok(!r.html.includes('"exportedFrom"'));
  assert.equal(PF.exportedState(r.index), null);
  const { exportedFrom, ...noMark } = plainJson(xr.index);
  const c = await PF.exportPortable(nodeEnv, path.join(S, 'deck.html'), { carry: noMark });
  assert.equal(c.index.exportedFrom, undefined);
  // buildPortable で印を書かない（fromFolder: false）
  const f = await buildPortable(path.join(S, 'deck.html'), { out: path.join(S, 'out', 'x' + EXT), fromFolder: false });
  assert.equal(f.index.exportedFrom, undefined);
});

ok('再生専用の派生（--play-only・playOnly）：索引がないので印もない', async () => {
  const po = PF.playOnly(x);
  assert.ok(!po.includes('exportedFrom'));
  const r = cli('kit/build.mjs', path.join(D, 'deck.html'), '--play-only', '-o', path.join(work, 'deck' + FORMAT.PLAY_EXT));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.readFileSync(path.join(work, 'deck' + FORMAT.PLAY_EXT), 'utf8').includes('exportedFrom'));
});

ok('展開（npm run portable -- unpack）：展開したフォルダが原本になる。設定のファイルにもほかのファイルにも印はなく、pack(unpack(x)) は x と同じバイト。次の書き出しは新しい値', async () => {
  const U = path.join(work, 'unpacked');
  const u = await unpack(OUT, U);
  for (const rel of u.written) assert.ok(!fs.readFileSync(path.join(U, rel)).includes('exportedFrom'), `${rel} carries exportedFrom`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(U, CFG), 'utf8')).exportedFrom, undefined);
  const r = cli('tools/portable.mjs', 'pack', U, '-o', path.join(work, 'repacked' + EXT));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(work, 'repacked' + EXT), 'utf8'), x, 'pack(unpack(x)) === x');
  // 写しで直した文書を展開して書き出す：印は展開したフォルダの今の hash（前の値ではない）
  const ws = workspace(xr);
  ws.set('narration.md', enc.encode(dec.decode(ws.get('narration.md')).replace('一歩ずつ進みます。', '進みます。')));
  const a = await tierA(x, ws, {});
  fs.writeFileSync(path.join(work, 'edited' + EXT), a.html);
  const U2 = path.join(work, 'unpacked-edited');
  await unpack(path.join(work, 'edited' + EXT), U2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(U2, CFG), 'utf8')).exportedFrom, undefined);
  const p = await buildPortable(path.join(U2, 'deck.html'), { out: path.join(U2, 'out', 'deck' + EXT) });
  assert.equal(p.index.sourceSha256, a.index.sourceSha256);
  assert.deepEqual(plainJson(p.index.exportedFrom), { kind: 'folder', sourceSha256: a.index.sourceSha256 });
  assert.notEqual(p.index.exportedFrom.sourceSha256, xr.index.exportedFrom.sourceSha256);
});

ok('書き出し直し：フォルダを直してから書き出すと、印は新しい sourceSha256 に置き換わる', async () => {
  const R = path.join(work, 'reexport');
  fs.cpSync(D, R, { recursive: true });
  fs.writeFileSync(path.join(R, 'narration.md'), fs.readFileSync(path.join(R, 'narration.md'), 'utf8').replace('次の段階です。', '次です。'));
  const r = await buildPortable(path.join(R, 'deck.html'), { out: path.join(R, 'out', 'deck' + EXT) });
  assert.notEqual(r.index.sourceSha256, xr.index.sourceSha256);
  assert.deepEqual(plainJson(r.index.exportedFrom), { kind: 'folder', sourceSha256: r.index.sourceSha256 });
});

ok('npm run portable -- compare：写しとフォルダのどちらを書き出しの後に直したか（same・copy・folder・both）。両方なら選ばせる（混ぜない）。docId が違うフォルダ・印のない文書は断る', async () => {
  const F = path.join(work, 'cmp');
  fs.cpSync(D, F, { recursive: true });
  const copy = path.join(work, 'cmp' + EXT);
  fs.writeFileSync(copy, (await buildPortable(path.join(F, 'deck.html'), { out: copy })).html);
  assert.equal((await compare(copy, F)).state, 'same');
  // 写しだけ直す
  const cr = await PF.readPortable(fs.readFileSync(copy, 'utf8'));
  const ws = workspace(cr);
  ws.set('narration.md', enc.encode(dec.decode(ws.get('narration.md')).replace('これは試験用の教材です。', 'これは教材です。')));
  const edited = path.join(work, 'cmp-edited' + EXT);
  fs.writeFileSync(edited, (await tierA(fs.readFileSync(copy, 'utf8'), ws, {})).html);
  assert.equal((await compare(edited, F)).state, 'copy');
  // フォルダだけ直す
  fs.writeFileSync(path.join(F, 'narration.md'), fs.readFileSync(path.join(F, 'narration.md'), 'utf8').replace('次の段階です。', '次です。'));
  const fr = await compare(copy, F);
  assert.equal(fr.state, 'folder');
  assert.equal(fr.exportedSha256, fr.copySha256);
  assert.notEqual(fr.folderSha256, fr.exportedSha256);
  // 両方
  const r = cli('tools/portable.mjs', 'compare', edited, F);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^both: both the copy and the folder were edited since the export: choose which to keep \(they are not merged\)/);
  // 断る：docId が違うフォルダ・印のない文書
  const O = makeDeck(path.join(work, 'other'));
  fs.writeFileSync(path.join(O, CFG), JSON.stringify({ docId: PF.newDocId() }) + '\n');
  await assert.rejects(compare(copy, O), (e) => e.code === 'other-lesson');
  const noMark = path.join(work, 'nomark' + EXT);
  fs.writeFileSync(noMark, (await PF.exportPortable(nodeEnv, path.join(F, 'deck.html'), {})).html);
  await assert.rejects(compare(noMark, F), (e) => e.code === 'not-exported');
  // 作業フォルダに設定のファイル（docId）がなく、初めての書き出しが作ったときも、書き出した直後は same
  const N = path.join(work, 'fresh');
  fs.cpSync(D, N, { recursive: true });
  fs.rmSync(path.join(N, CFG));
  const fresh = path.join(work, 'fresh' + EXT);
  const fx = await buildPortable(path.join(N, 'deck.html'), { out: fresh });
  fs.writeFileSync(fresh, fx.html);
  assert.ok(fs.existsSync(path.join(N, CFG)));
  assert.equal((await compare(fresh, N)).state, 'same');
});

// 手で書き換えた印（v0.6.1 の試し歩き：索引の 2 つと deck-meta の 3 か所の hash を書き換えたファイルを編集アプリで開くと止まったように見えた）。
// 止まる所はない：data-sha256 を直さずに書き換えると索引が壊れたファイルとして断り（編集アプリは OK を押すまで待つ窓）、data-sha256 も直すと
// 組んだ教材と原稿が食い違う写しとして開く。印の値が索引の sourceSha256 と同じでも、中身の hash と合わないので「書き出しの後に直した」とする
ok('手で書き換えた印：3 か所の hash を書き換えると、索引の hash が合わず断る（すぐ答える）。data-sha256 も直すと開け、印の値が同じでも書き出しの後に直したことになる。compare は both', async () => {
  const H = xr.index.sourceSha256, B = 'b'.repeat(64);
  assert.equal(x.split(H).length - 1, 3, 'the hash appears three times: index sourceSha256, exportedFrom.sourceSha256, deck-meta sourceSha256');
  const raw = x.split(H).join(B);
  let t0 = Date.now();
  await assert.rejects(PF.readPortable(raw), (e) => e.code === 'bad-index-hash');
  assert.ok(Date.now() - t0 < 10000, 'answers at once');
  const ixText = (h) => PF.scanDocument(h).byId.get(FORMAT.INDEX_ID).text;
  const rehashed = await PF.replaceIndexText(raw, ixText(raw));
  t0 = Date.now();
  const rr = await PF.readPortable(rehashed);
  assert.ok(Date.now() - t0 < 10000, 'answers at once');
  assert.equal(rr.sourceMatches, false);
  assert.equal(rr.index.sourceSha256, rr.index.exportedFrom.sourceSha256, 'the marker equals the (false) index sourceSha256');
  assert.equal(PF.exportedState(rr.index).copyEdited, false, 'the index alone cannot tell');
  assert.deepEqual(plainJson(PF.exportedState(rr.index, null, { sourceMatches: rr.sourceMatches })), { exportedSha256: B, copyEdited: true, folderEdited: null, both: false });
  // 3 か所のうち 1 か所だけ違う（data-sha256 は直す）：どれも開けて、書き出しの後に直したことになる
  const variants = {
    marker: (ix) => { ix.exportedFrom.sourceSha256 = B; },
    top: (ix) => { ix.sourceSha256 = B; },
    both: (ix) => { ix.sourceSha256 = B; ix.exportedFrom.sourceSha256 = B; },
  };
  for (const [k, f] of Object.entries(variants)) {
    const ix = JSON.parse(ixText(x)); f(ix);
    const r = await PF.readPortable(await PF.replaceIndexText(x, JSON.stringify(ix, null, 1)));
    assert.equal(PF.exportedState(r.index, null, { sourceMatches: r.sourceMatches }).copyEdited, true, k);
  }
  const dm = x.lastIndexOf(H);
  const r3 = await PF.readPortable(x.slice(0, dm) + B + x.slice(dm + 64));
  assert.equal(r3.sourceMatches, false);
  assert.equal(PF.exportedState(r3.index, null, { sourceMatches: r3.sourceMatches }).copyEdited, true, 'deck-meta differs');
  // compare（CLI）：写しは直したもの。印の値も書き換わっていてフォルダの今の値と合わないので、フォルダも直したことになり both（どちらを残すか選ばせる。混ぜない）
  const F = path.join(work, 'hand');
  fs.cpSync(D, F, { recursive: true });
  const copy = path.join(work, 'hand' + EXT);
  const hx = (await buildPortable(path.join(F, 'deck.html'), { out: copy })).html;
  const hb = hx.split(hx.match(/"sourceSha256": ?"([0-9a-f]{64})"/)[1]).join(B);
  fs.writeFileSync(copy, await PF.replaceIndexText(hb, ixText(hb)));
  assert.equal((await compare(copy, F)).state, 'both');
});

ok('印の形の崩れ（なし・型違い・巨大・入れ子）：exportedState は投げずにすぐ null（印なしとして扱う）。検査器はそのような索引を断る', () => {
  const base = plainJson(xr.index), H = base.sourceSha256;
  const odd = [undefined, null, 0, 1, true, 'folder', [], [base.exportedFrom], {}, { kind: 'folder' }, { sourceSha256: H }, { kind: 'file', sourceSha256: H },
    { kind: 'folder', sourceSha256: 1 }, { kind: 'folder', sourceSha256: null }, { kind: 'folder', sourceSha256: [H] }, { kind: 'folder', sourceSha256: { H } },
    { kind: 'folder', sourceSha256: H.toUpperCase() }, { kind: 'folder', sourceSha256: H + '0' }, { kind: 'folder', sourceSha256: 'a'.repeat(8 * 1024 * 1024) },
    { kind: ['folder'], sourceSha256: H }, { kind: 'folder', sourceSha256: { toString: () => H } }];
  let deep = {}; const root = deep; for (let i = 0; i < 2000; i++) deep = (deep.x = {}); odd.push(root);
  // 試験の名前に使う短い説明（入れ子の深い値を JSON.stringify しない）
  const show = (m) => (m === root ? 'nested 2000 deep' : typeof m === 'string' || (m && typeof m.sourceSha256 === 'string') ? `${typeof m} ${String(m.sourceSha256 ?? m).length} chars` : `${typeof m} ${Array.isArray(m) ? 'array' : Object.keys(Object(m)).join(',')}`);
  const t0 = Date.now();
  for (const m of odd) {
    const ix = { ...base, exportedFrom: m };
    if (m === undefined) delete ix.exportedFrom;
    for (const sm of [true, false, undefined]) assert.equal(PF.exportedState(ix, H, { sourceMatches: sm }), null, show(m));
    if (m !== undefined) assert.ok(PF.validateIndex(ix).length > 0, `validateIndex accepts ${show(m)}`);
  }
  for (const ix of [undefined, null, 'x', 1, [], {}]) assert.equal(PF.exportedState(ix), null);
  // 索引の sourceSha256 のほうが崩れている（印は正しい）：投げずに、書き出しの後に直したことにする（検査器は索引を断る）
  for (const top of [undefined, null, 1, 'x', 'a'.repeat(8 * 1024 * 1024)]) assert.equal(PF.exportedState({ ...base, sourceSha256: top }).copyEdited, true);
  assert.ok(Date.now() - t0 < 5000, 'answers at once');
});

ok('見本（examples/）：配る 1 ファイルは書き出しの印を持たない（フォルダを持たない人が開くので。CLI の --portable は印を書くまま）', async () => {
  const list = await buildExamples(path.join(work, 'examples-out'), { log: () => {} });
  assert.ok(list.length >= 4);
  for (const x of list) assert.ok(!fs.readFileSync(path.join(work, 'examples-out', x.file), 'utf8').includes('"exportedFrom"'), `${x.name} carries exportedFrom`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 6).join('\n     ')); }
}
console.log(`exported-from: ${tests.length - failed}/${tests.length} ok (${work})`);
process.exit(failed ? 1 : 0);
