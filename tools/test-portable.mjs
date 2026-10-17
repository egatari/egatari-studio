// 持ち運べる 1 ファイル（format spec。kit/core/portable.mjs）の試験
//   node tools/test-portable.mjs [作業フォルダ]
// 1. 仕様の写し（FORMAT.VENDOR_DIR）の Schema（ajv。ネットワークは使わない）と、依存のない検査器（validateIndex）が、仕様の試験用の索引で同じ判定をする
// 2. パスの規則・重複を断る JSON・上限の順
// 3. 往復：フォルダ → 1 ファイル → 展開 → フォルダで、原稿のバイト・音声のバイト・docId が同じ。もう一度まとめると同じファイル・同じ sourceSha256。
//    展開したフォルダを組むと同じ HTML。外すもの（comments.json・.cache・out/・使わない音声）と voice.json の伏せ字
// 4. 文書の試験用ファイル（tools/portable-fixtures.mjs）：期待どおり読める・断る。取り出しはスクリプトを実行しない
// 5. ヘッドレス Chrome で file:// から再生：音声の参照が読める・コンソールのエラーなし（再生専用の派生も）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import * as esbuild from 'esbuild';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { unpack } from './portable.mjs';
import { makeFixtures, silentWav } from './portable-fixtures.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPEC = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-portable-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const rejects = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return e; } assert.fail(`expected ${code}, but it was accepted`); };

// ---------------------------------------------------------------- Schema（vendor の写しを $id で引く。ネットワークは使わない）
const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: () => { throw new Error('no network'); } });
for (const f of fs.readdirSync(path.join(SPEC, 'schema'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SPEC, 'schema', f), 'utf8')));
const schema = (name) => { const v = ajv.getSchema(FORMAT.SCHEMA_BASE + name + '.schema.json'); assert.ok(v, `schema ${name} not found by $id ${FORMAT.SCHEMA_BASE}${name}.schema.json`); return v; };
const vIndex = schema(`${FORMAT.SCHEMA_PREFIX}index`), vMeta = schema('deck-meta'), vAudio = schema('deck-audio');
const plainJson = (o) => JSON.parse(JSON.stringify(o));   // 原型のない object を ajv に渡す前にふつうの object に
const schemaOk = (v, o, what) => { assert.ok(v(plainJson(o)), `${what}: ${JSON.stringify(v.errors?.slice(0, 3))}`); };

ok('仕様の試験用の索引：valid はすべて通り、invalid はすべて断る（ajv と依存のない検査器の両方）', () => {
  for (const kind of ['valid', 'invalid']) {
    const dir = path.join(SPEC, 'fixtures', 'index', kind);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.ok(files.length);
    for (const f of files) {
      const ix = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      assert.equal(vIndex(ix), kind === 'valid', `ajv ${kind}/${f}`);
      const errs = PF.validateIndex(PF.parseJsonStrict(fs.readFileSync(path.join(dir, f), 'utf8')));
      assert.equal(errs.length === 0, kind === 'valid', `validateIndex ${kind}/${f}: ${errs.join('; ')}`);
    }
  }
});

// ---------------------------------------------------------------- パス・JSON
ok('パスの規則（§3.3）', () => {
  const bad = ['/abs', 'a\\b', 'C:/x', 'C:x', '//srv/share', 'a//b', 'a/', './a', 'a/../b', '..', 'a.', 'a ', 'b/c./d', 'CON', 'con.txt', 'Aux.tar.gz', 'COM1', 'lpt9.log', 'COM¹', 'LPT³.txt', 'COM ', 'a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\u0000b', 'a\u001fb', 'a\u007fb', 'a\u0085b',
    '__proto__', 'x/constructor/y', 'prototype', 'e\u0301.txt', '\ud800.txt', 'x/'.repeat(10) + 'y', 'a'.repeat(1025)];
  for (const p of bad) assert.ok(PF.pathProblem(p), `should reject ${JSON.stringify(p)}`);
  for (const p of ['deck.html', 'figs/a b.svg', 'components/x/index.js', 'é.txt', 'COM10', 'CONSOLE.txt', 'a.b.c', 'x/'.repeat(9) + 'y', '日本語/図.png']) assert.equal(PF.pathProblem(p), null, p);
  assert.ok(PF.checkArchivePaths(['A.txt', 'a.TXT']).length, 'case collision');
  assert.ok(PF.checkArchivePaths(['straße.md', 'STRASSE.md']).length, 'full case folding');
  assert.ok(PF.checkArchivePaths(['a', 'a/b']).length, 'file and directory');
  assert.ok(PF.checkArchivePaths(['A', 'a/b']).length, 'file and directory, case-folded');
  assert.equal(PF.checkArchivePaths(['a/b', 'a/c', 'ab']).length, 0);
});
ok('JSON：同じ名前の重複を断る・原型のない object・上限', () => {
  assert.throws(() => PF.parseJsonStrict('{"a":1,"a":2}'), (e) => e.code === 'duplicate-member');
  assert.throws(() => PF.parseJsonStrict('{"x":{"b":1,"b":1}}'), (e) => e.code === 'duplicate-member');
  assert.throws(() => PF.parseJsonStrict('{"a":"\\u0061","\\u0061":2}'), (e) => e.code === 'duplicate-member');
  const o = PF.parseJsonStrict('{"__proto__":{"polluted":1},"constructor":2}');
  assert.equal(Object.getPrototypeOf(o), null);
  assert.deepEqual(Object.keys(o), ['__proto__', 'constructor']);
  assert.equal({}.polluted, undefined);
  assert.throws(() => PF.parseJsonStrict('[1,2,3]', { maxMembers: 2 }), (e) => e.code === 'too-many-members');
  assert.throws(() => PF.parseJsonStrict('[[[[1]]]]', { maxDepth: 2 }), (e) => e.code === 'too-deep');
  for (const bad of ['{', '{"a":1,}', '[01]', '"\u0001"', 'tru', '{} x', "{'a':1}"]) assert.throws(() => PF.parseJsonStrict(bad), (e) => e.code === 'bad-json', bad);
  assert.deepEqual(plainJson(PF.parseJsonStrict(' {"a":[1,-2.5e3,true,null,"x\\n\\u00e9"]} ')), { a: [1, -2500, true, null, 'x\né'] });
});

// ---------------------------------------------------------------- 往復
const narr = (dir) => fs.readFileSync(path.join(dir, 'narration.md'), 'utf8');
function prepareMinimal(dir) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (s) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, s)) });
  // 拡張の行（音声には関係しない）
  fs.writeFileSync(path.join(dir, 'narration.md'), narr(dir).replace(/(\[0\] まず[^\n]*\n)/, '$1@x-tutor-q 何を最小化しますか？\n@x-tutor-q 2 つ目の問い\n'));
  // 音声：TTS の dry-run（uv がなければ JS の無音で manifest を作る）
  const r = spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), dir, '--dry-run'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('  (uv/tts dry-run unavailable; writing silent WAVs from JS)');
    fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
    const segments = {};
    parseNarration(narr(dir)).forEach((s, j) => {
      fs.writeFileSync(path.join(dir, 'audio', `seg_js${j}.wav`), silentWav(0.5));
      segments[`${s.slideKey}:${s.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' };
    });
    fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  }
  assert.ok(fs.existsSync(path.join(dir, 'audio', 'manifest.json')), 'audio/manifest.json (run tts dry-run)\n' + (r.stderr || '').slice(-400));
  // 外すもの
  fs.writeFileSync(path.join(dir, 'comments.json'), '{"x":"review note"}');
  fs.mkdirSync(path.join(dir, '.cache', 'edits'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.cache', 'edits', 'old-deck.html'), 'backup');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'out', 'stale.html'), 'old build');
  fs.writeFileSync(path.join(dir, 'audio', 'seg_unused.wav'), fs.readFileSync(path.join(dir, 'audio', fs.readdirSync(path.join(dir, 'audio')).find((f) => f.endsWith('.wav')))));
  fs.writeFileSync(path.join(dir, 'notes.bak'), 'backup');
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ expert: '/Users/someone/voices/me.wav', novice: 'alice', lang: 'ja', ref_dir: '/Users/someone/voices' }));
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test', attribution: 'Test, Minimal lesson', creators: ['Test'], created: 'must not be copied' } }, null, 2) + '\n');
}
const MIN = path.join(work, 'minimal');
let first, firstHtml;
ok('書き出し：Schema に合う・外すもの・伏せ字・docId を残す・拡張の行・metadata と権利の表示を deck-meta に', async () => {
  prepareMinimal(MIN);
  const out = path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT);
  first = await buildPortable(path.join(MIN, 'deck.html'), { out });
  firstHtml = first.html;
  fs.writeFileSync(out, firstHtml);
  schemaOk(vIndex, first.index, 'index');
  schemaOk(vMeta, first.deckMeta, 'deck-meta');
  assert.deepEqual(PF.validateIndex(first.index), []);
  const scan = PF.scanDocument(firstHtml);
  const da = JSON.parse(scan.byId.get('deck-audio').text);
  schemaOk(vAudio, da, 'deck-audio');
  assert.ok(Object.values(da).every((a) => a.src.startsWith(FORMAT.URI_SCHEME)), 'deck-audio refers to blobs');
  // ファイル
  const files = Object.keys(first.index.files);
  for (const p of ['deck.html', 'narration.md', 'voice.json', FORMAT.CONFIG_FILE]) assert.ok(files.includes(p), p);
  for (const p of files) assert.ok(!/comments\.json|^\.cache|^out\/|seg_unused|\.bak$|manifest\.json/.test(p), `excluded: ${p}`);
  const ixText = scan.byId.get(FORMAT.INDEX_ID).text;
  assert.ok(!ixText.includes('/Users/'), 'no local paths in the index');
  assert.ok(!ixText.includes('<'), 'no < in the index text');
  const voice = JSON.parse(new TextDecoder().decode(first.files['voice.json']));
  assert.deepEqual(voice, { expert: 'me', novice: 'alice', lang: 'ja' });
  // docId：原稿のフォルダに残し、同じものを使い続ける
  const conf = JSON.parse(fs.readFileSync(path.join(MIN, FORMAT.CONFIG_FILE), 'utf8'));
  assert.match(conf.docId, PF.RE.docId);
  assert.equal(first.index.docId, conf.docId);
  assert.equal(first.deckMeta.docId, conf.docId);
  const again = await buildPortable(path.join(MIN, 'deck.html'), { out });
  assert.equal(again.index.docId, conf.docId);
  assert.equal(again.html, firstHtml, 'deterministic');
  // metadata：仕様の項目だけ（created は入れない）。license・copyright・attribution は deck-meta にも
  assert.equal(first.index.metadata.title, '勾配降下法の基本');
  assert.equal(first.index.metadata.lang, 'ja');
  assert.equal(first.index.metadata.created, undefined);
  assert.deepEqual(first.index.metadata.creators, ['Test']);
  for (const k of ['license', 'copyright', 'attribution']) assert.equal(first.deckMeta[k], first.index.metadata[k], k);
  assert.equal(first.deckMeta.portable, true);
  assert.equal(first.deckMeta.sourceSha256, first.index.sourceSha256);
  // 音声の記録：3 つの hash・出どころ・recipe（声は公開の名前）
  const recs = Object.entries(first.index.audio);
  assert.ok(recs.length > 10);
  for (const [k, a] of recs) {
    assert.ok(first.index.files[a.file], `${k}: ${a.file} in files`);
    assert.equal(a.kind, 'tts'); assert.match(a.inputHash, PF.RE.sha256); assert.equal(typeof a.recipeDigest, 'string');
    assert.equal(first.index.blobs[first.index.files[a.file]].sha256.length, 64);
    for (const v of Object.values(a.recipe.voice)) assert.match(v, PF.RE.voice);
  }
  // inputHash は §5.4 の正準形の hash（音声を作り直していない段階を除く）
  const segs = parseNarration(narr(MIN));
  const s0 = segs.find((s) => `${s.slideKey}:${s.stepKey}` === recs[0][0]);
  assert.equal(recs[0][1].inputHash, await PF.inputHash(s0));
  // 拡張の行 → extensions.tutor[段階].q（繰り返しは配列）
  const tutor = first.index.extensions.tutor;
  assert.equal(tutor.v, 1);
  assert.deepEqual(Object.values(tutor).find((x) => typeof x === 'object').q, ['何を最小化しますか？', '2 つ目の問い']);
  // 音声は 1 回だけ（同じ中身は 1 つの塊）
  const chunkIds = [...scan.byId.keys()].filter((k) => k.startsWith(FORMAT.BLOB_PREFIX));
  assert.equal(chunkIds.length, Object.values(first.index.blobs).reduce((a, b) => a + b.chunks.length, 0));
  // 読める層：全段階の表示用の文字が、スクリプトの外の DOM に
  assert.ok(scan.byId.size);
  const layer = firstHtml.slice(firstHtml.indexOf(`<div id="${FORMAT.READABLE_ID}"`));
  for (const s of segs) for (const t of s.turns) assert.ok(layer.includes(t.display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), `readable: ${t.display}`);
  assert.ok(!/\r/.test(firstHtml));
});
ok('往復：展開 → もう一度まとめると同じファイル・同じ原稿と音声のバイト・同じ docId と sourceSha256。展開したフォルダを組むと同じ HTML', async () => {
  const r = await PF.readPortable(new Uint8Array(fs.readFileSync(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT))));
  assert.equal(r.sourceMatches, true);
  assert.deepEqual(r.warnings, []);
  assert.equal(Object.getPrototypeOf(r.files), null);
  for (const p of ['deck.html', 'narration.md', FORMAT.CONFIG_FILE]) assert.deepEqual(Buffer.from(r.files[p]), fs.readFileSync(path.join(MIN, p)), p);
  for (const [p, b] of Object.entries(first.files)) assert.deepEqual(Buffer.from(r.files[p]), Buffer.from(b), p);
  const U = path.join(work, 'unpacked');
  const u = await unpack(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT), U);
  assert.ok(u.written.includes('audio/manifest.json'));
  const second = await buildPortable(path.join(U, 'deck.html'), { out: path.join(U, 'out', 'deck' + FORMAT.FILE_EXT) });
  assert.deepEqual(second.writes, Object.create(null), 'no new docId');
  assert.equal(second.index.docId, first.index.docId);
  assert.equal(second.index.sourceSha256, first.index.sourceSha256);
  assert.equal(second.html, firstHtml, 'pack(unpack(x)) === x');
  // ふつうの build（音声を埋め込む）も同じ
  const a = build(path.join(MIN, 'deck.html'), { embedAudio: true, out: path.join(MIN, 'out', 'x.html') }).html;
  const b = build(path.join(U, 'deck.html'), { embedAudio: true, out: path.join(U, 'out', 'x.html') }).html;
  assert.equal(b.length, a.length);
  assert.ok(a === b, 'build of the unpacked folder reproduces the compiled HTML');
  // 展開の断り：空でないフォルダ、シンボリックリンクを通る書き込み
  await rejects(unpack(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT), U), 'not-empty');
  const L = path.join(work, 'linked'); fs.mkdirSync(L);
  fs.symlinkSync(os.tmpdir(), path.join(L, 'audio'));
  await rejects(unpack(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT), L, { force: true }), 'bad-path');
});
ok('再生専用の派生：索引と原稿の塊がなく、音声の塊は残る。deck-meta は portable: false・sourceSha256 なし・docId と権利の表示は残る', async () => {
  const po = PF.playOnly(firstHtml);
  fs.writeFileSync(path.join(MIN, 'out', 'deck' + FORMAT.PLAY_EXT), po);
  await rejects(PF.readPortable(po), 'no-source');
  const scan = PF.scanDocument(po);
  assert.ok(!scan.byId.has(FORMAT.INDEX_ID));
  const meta = JSON.parse(scan.byId.get('deck-meta').text);
  schemaOk(vMeta, meta, 'play-only deck-meta');
  assert.equal(meta.portable, false); assert.equal(meta.sourceSha256, undefined); assert.equal(meta.docId, first.index.docId);
  for (const k of ['license', 'copyright', 'attribution']) assert.equal(meta[k], first.deckMeta[k]);
  const audioBlobs = new Set(Object.values(first.index.audio).map((a) => first.index.files[a.file]));
  const left = new Set([...scan.byId.keys()].filter((k) => k.startsWith(FORMAT.BLOB_PREFIX)).map((k) => k.slice(FORMAT.BLOB_PREFIX.length).replace(/-\d+$/, '')));
  assert.deepEqual([...left].sort(), [...audioBlobs].sort());
  assert.ok(po.includes(`id="${FORMAT.READABLE_ID}"`));
  assert.equal(PF.playOnly(po), po.replace(/"portable":false/, '"portable":false'), 'idempotent');
});

// ---------------------------------------------------------------- 上限の順
ok('上限は決まった順に効く：ファイル → 索引の大きさ（解析の前）→ 塊の長さ（復号の前）→ 復号の累計', async () => {
  await rejects(PF.readPortable(firstHtml, { limits: { fileBytes: 1000 } }), 'file-too-large');
  await rejects(PF.readPortable(new Uint8Array(1001), { limits: { fileBytes: 1000 } }), 'file-too-large');
  // 索引が大きすぎ、しかも JSON として壊れている：大きさで断る（解析しない）
  const scan = PF.scanDocument(firstHtml), ix = scan.byId.get(FORMAT.INDEX_ID);
  const broken = await PF.replaceIndexText(firstHtml, '{' + ' '.repeat(5000));
  await rejects(PF.readPortable(broken, { limits: { indexBytes: 4096 } }), 'index-too-large');
  await rejects(PF.readPortable(broken), 'bad-json');
  // 塊が長すぎ、しかも base64 でない：長さで断る（復号しない）
  const id = [...scan.byId.keys()].find((k) => k.startsWith(FORMAT.BLOB_PREFIX)), el = scan.byId.get(id);
  const long = firstHtml.slice(0, el.start) + `<script type="application/octet-stream" id="${id}">${'!'.repeat(262145)}</script>` + firstHtml.slice(el.end);
  await rejects(PF.readPortable(long), 'chunk-too-large');
  await rejects(PF.readPortable(firstHtml, { limits: { archiveBytes: 1000 } }), 'archive-too-large');
  await rejects(PF.readPortable(firstHtml, { limits: { fileMax: 100 } }), 'file-too-large');
  await rejects(PF.readPortable(firstHtml, { limits: { files: 2 } }), 'too-many-files');
  void ix;
});

// ---------------------------------------------------------------- 文書の試験用ファイル
const FIX = path.join(work, 'fixtures');
let fixtures;
ok('文書の試験用ファイル：期待どおり読める・断る。取り出しで印のスクリプトは動かない', async () => {
  fixtures = await makeFixtures(FIX);
  assert.ok(fixtures.length >= 18);
  for (const f of fixtures) {
    const text = fs.readFileSync(f.file, 'utf8');
    if (f.expect.read === 'ok') {
      assert.ok(!/\/(?:Users|home|private|var\/folders|tmp)\//.test(text), `${f.name}: machine-specific path in the file`);
      const r = await PF.readPortable(text);
      if (f.expect.profile) assert.equal(r.index.profile, f.expect.profile, f.name);
      if (f.expect.sourceMatches === false) { assert.equal(r.sourceMatches, false, f.name); assert.ok(r.warnings.some((w) => /disagree/.test(w))); }
      else assert.equal(r.sourceMatches, true, f.name);
      if (f.expect.preserved) assert.deepEqual(plainJson(r.index[f.expect.preserved]), { kept: true });
      if (f.expect.audioKeys) assert.deepEqual(Object.keys(r.audio), f.expect.audioKeys);
      if (f.expect.identicalSource) {
        assert.ok(new TextDecoder().decode(r.files['narration.md']).includes('</script> と <!--'));
        assert.ok(new TextDecoder().decode(r.files['macros.tex']).includes('</script><!--'));
        // 索引と JSON のブロックは </script でも <!-- でも抜けない（実行系と同じ数の要素が読める）
        assert.ok(!PF.scanDocument(text).byId.get(FORMAT.INDEX_ID).text.includes('<'));
      }
      if (f.expect.canary) assert.equal(globalThis[f.expect.canary], undefined, 'reading never executes the runtime layer');
    } else await rejects(PF.readPortable(text), f.expect.read.error);
  }
});

// ---------------------------------------------------------------- ブラウザ
ok('ヘッドレス Chrome（file://）：1 ファイルと再生専用の派生が再生できる・音声の参照が読める・コンソールのエラーなし。ブラウザでの取り出しも印のスクリプトを動かさない', async () => {
  const browser = await launch();
  try {
    const open = async (file) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(fileUrl(file));
      await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
      return { page, errors };
    };
    const files = [path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT), path.join(MIN, 'out', 'deck' + FORMAT.PLAY_EXT),
      ...fixtures.filter((f) => f.expect.play).map((f) => f.file)];
    for (const file of files) {
      const { page, errors } = await open(file);
      const r = await page.evaluate(async (rid) => {
        const out = [];
        for (const [k, a] of Object.entries(DECK.AUDIO)) {
          const ok = /^data:audio\/[a-z0-9.+-]+;base64,/.test(a.src);
          const buf = ok ? await (await fetch(a.src)).arrayBuffer() : null;
          out.push({ k, ok, bytes: buf ? buf.byteLength : 0 });
        }
        const layer = document.getElementById(rid);
        return { audio: out, hidden: layer ? layer.hidden : null, slides: DECK.slides.length };
      }, FORMAT.READABLE_ID);
      const name = path.basename(file);
      assert.deepEqual(errors, [], `${name}: console errors`);
      assert.ok(r.audio.length >= 2, `${name}: audio entries`);
      for (const a of r.audio) assert.ok(a.ok && a.bytes > 44, `${name}: ${a.k} not readable`);
      assert.equal(r.hidden, true, `${name}: readable layer hidden while the runtime runs`);
      await page.close();
    }
    // ブラウザで読み取る（kit/core/portable.mjs を 1 本にまとめて読み込む）：印のスクリプトは動かない
    const bundle = await esbuild.build({ entryPoints: [path.join(ROOT, 'kit', 'core', 'portable.mjs')], bundle: true, format: 'iife', globalName: 'PF', write: false, platform: 'browser' });
    const host = path.join(work, 'reader.html');
    fs.writeFileSync(host, '<!doctype html><meta charset="utf-8"><title>reader</title><body></body>');
    const page = await browser.newPage();
    await page.goto(fileUrl(host));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const canary = fixtures.find((f) => f.expect.canary);
    const res = await page.evaluate(async ({ text, key }) => {
      const r = await PF.readPortable(text);
      await new Promise((ok) => setTimeout(ok, 200));
      return { files: Object.keys(r.files).length, fired: window[key] };
    }, { text: fs.readFileSync(canary.file, 'utf8'), key: canary.expect.canary });
    assert.ok(res.files > 2);
    assert.equal(res.fired, undefined, 'the canary never runs during extraction');
    // 確かめ：同じファイルを開けば印は付く（印の仕掛けが動いていること）
    const { page: p2 } = await open(canary.file);
    assert.equal(await p2.evaluate((k) => window[k], canary.expect.canary), 1);
  } finally { await browser.close(); }
});

ok('検査器：旧来の鍵（手書きの data-key と s<n>）は「legacy」の警告（エラーにしない・鍵は変えない）', () => {
  const d = path.join(work, 'legacy-check'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), '<!doctype html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage">\n' +
    '<section class="slide" data-key="hand"><h2>手書き</h2></section>\n<section class="slide"><div class="body">見出しなし</div></section>\n<section class="slide" id="s-abcdef"><h2>id</h2></section>\n<section class="slide"><h2>見出し</h2></section>\n</div></body></html>\n');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(d, 'deck.html')], { encoding: 'utf8' });
  const legacy = r.stdout.split('\n').filter((l) => /slide key: legacy/.test(l));
  assert.equal(legacy.length, 2, r.stdout);
  assert.ok(legacy.every((l) => /\[警告\]/.test(l)));
  assert.ok(legacy.some((l) => /「hand」/.test(l)) && legacy.some((l) => /「s2」/.test(l)));
  assert.match(r.stdout, /エラー 0/);
});

for (const [name, fn] of tests) {
  try { await fn(); n++; console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
console.log(`portable: ${n}/${tests.length} ok (${work})`);
