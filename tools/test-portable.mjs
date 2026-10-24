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
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import * as esbuild from 'esbuild';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { codeReasons, markupReasons, safeExpression, isDataBlock } from '../kit/core/code-scan.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { unpack, registryWarnings } from './portable.mjs';
import { makeFixtures, silentWav, addUnknownMembers, makeDeck } from './portable-fixtures.mjs';
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
  // recipeDigest は音声の記録の digest（tts/synth.py が書く）から。uv がなく JS の無音で作った manifest には digest がないので、なし
  const manifest = JSON.parse(fs.readFileSync(path.join(MIN, 'audio', 'manifest.json'), 'utf8'));
  for (const [k, a] of recs) {
    assert.ok(first.index.files[a.file], `${k}: ${a.file} in files`);
    const dg = manifest.segments[k] && manifest.segments[k].digest;
    assert.equal(a.kind, 'tts'); assert.match(a.inputHash, PF.RE.sha256); assert.equal(a.recipeDigest, dg ? String(dg) : undefined, `${k}: recipeDigest from the manifest's digest`);
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
  const layer = firstHtml.slice(firstHtml.indexOf(`<section id="${FORMAT.READABLE_ID}"`));
  for (const s of segs) for (const t of s.turns) assert.ok(layer.includes(t.display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), `readable: ${t.display}`);
  assert.ok(!/\r/.test(firstHtml));
});
ok('読める層（§2.1）：段階は番号の小さい順で concl が最後（原稿の書き順によらない）。どのスライドにも当たらない口述原稿は入れず知らせる', async () => {
  const D = path.join(work, 'readable-order');
  fs.cpSync(MIN, D, { recursive: true, filter: (q) => !/[\\/]out([\\/]|$)/.test(path.relative(MIN, q)) });
  // 「更新の式」の段階を concl・3・2・1・0 の順に書き、行き先のない節を足す
  const text = narr(D), lines = text.split('\n'), sk = '更新の式';
  const segs = parseNarration(text).filter((x) => x.slideKey === sk);
  const own = segs.map((x) => lines[x.line - 1]);
  const at = segs[0].line - 1;
  lines.splice(at, own.length, ...own.slice().reverse());
  fs.writeFileSync(path.join(D, 'narration.md'), lines.join('\n') + '\n## 存在しないスライド\n[0] 行き先のない口述原稿です。\n');
  const p = await buildPortable(path.join(D, 'deck.html'), { out: path.join(D, 'out', 'r' + FORMAT.FILE_EXT) });
  const layer = p.html.slice(p.html.indexOf(`<section id="${FORMAT.READABLE_ID}"`), p.html.indexOf('</section>', p.html.indexOf(`<section id="${FORMAT.READABLE_ID}"`)));
  const art = layer.slice(layer.indexOf(`<article data-slide-key="${sk}">`), layer.indexOf('</article>', layer.indexOf(`<article data-slide-key="${sk}">`)));
  const order = [...art.matchAll(/data-step-key="[^"]*:([^":]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, segs.map((x) => x.stepKey), `numbers ascending, concl last: ${order}`);
  assert.deepEqual(order.slice(-1), ['concl']);
  assert.ok(!layer.includes('存在しないスライド') && !layer.includes('行き先のない口述原稿です'), 'orphan narration is not in the readable layer');
  assert.ok(p.warnings.some((w) => w.includes('"存在しないスライド:0"') && /omitted from the readable layer/.test(w)), `reported: ${JSON.stringify(p.warnings)}`);
  // 見本の書き順の文書と同じ読める層（行き先のない節を除けば）
  const base = firstHtml.slice(firstHtml.indexOf(`<section id="${FORMAT.READABLE_ID}"`), firstHtml.indexOf('</section>', firstHtml.indexOf(`<section id="${FORMAT.READABLE_ID}"`)));
  assert.equal(layer, base);
});
ok('往復：展開 → もう一度まとめると同じファイル・同じ原稿と音声のバイト・同じ docId と sourceSha256。展開したフォルダを組むと同じ HTML', async () => {
  const r = await PF.readPortable(new Uint8Array(fs.readFileSync(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT))));
  assert.equal(r.sourceMatches, true);
  assert.deepEqual(r.warnings, []);
  assert.equal(Object.getPrototypeOf(r.files), null);
  for (const p of ['deck.html', 'narration.md']) assert.deepEqual(Buffer.from(r.files[p]), fs.readFileSync(path.join(MIN, p)), p);
  // 1 ファイルの中の設定のファイル＝作業フォルダのもの＋使った部品庫の部品の版（components。format spec §3.3）＋同梱のテーマの版（themes。themes.lock.json）
  const cfgIn = JSON.parse(new TextDecoder().decode(r.files[FORMAT.CONFIG_FILE])), cfgDir = JSON.parse(fs.readFileSync(path.join(MIN, FORMAT.CONFIG_FILE), 'utf8'));
  assert.deepEqual(cfgIn, { ...cfgDir, components: { sweep: first.index.components.find((c) => c.name === 'sweep').version }, themes: { default: first.index.themes.find((t) => t.name === 'default').version } }, FORMAT.CONFIG_FILE);
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
  // 行き先は一時フォルダの中の空のフォルダ（システムの一時フォルダそのものにすると、CI の画面の保存が辿って権限のない所を走査して失敗する）
  const elsewhere = path.join(work, 'elsewhere'); fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, path.join(L, 'audio'));
  await rejects(unpack(path.join(MIN, 'out', 'deck' + FORMAT.FILE_EXT), L, { force: true }), 'bad-path');
});
ok('索引のない文書の種類（sourceKind・no-source の details.kind）：原稿の deck.html・組んだ発表の HTML・再生専用の派生・ほかの HTML', async () => {
  const kind = async (t) => (await rejects(PF.readPortable(t), 'no-source')).details.kind;
  const src = fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8');
  assert.equal(await kind(src), 'source');
  assert.equal(await kind(fs.readFileSync(path.join(ROOT, 'examples', 'kokugo-kanbun', 'deck.html'))), 'source');
  assert.equal(await kind(build(path.join(ROOT, 'examples', 'minimal', 'deck.html'), { subset: false, noAudio: true }).html), 'built');
  assert.equal(await kind(PF.playOnly(firstHtml)), 'play-only');
  assert.equal(await kind('<!DOCTYPE html><title>x</title><p>&lt;section class="slide"&gt;</p>'), 'other');
  assert.equal(await kind('# notes\n<section class="slide">…</section>'), 'other');     // HTML の文書でない（Markdown の中の例など）
  assert.equal(await kind("<!-- a -->\n<html><body><section class='slide cover'><h1>t</h1></section></body></html>"), 'source');
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

ok('deck-audio の mime（任意）：塊の MIME と同じで、再生器は中身から推し量らずに使う', async () => {
  const scan = PF.scanDocument(firstHtml);
  const da = JSON.parse(scan.byId.get('deck-audio').text);
  for (const [k, a] of Object.entries(da)) {
    const id = a.src.slice(FORMAT.URI_SCHEME.length);
    assert.equal(a.mime, first.index.blobs[id].mime, k);
    assert.deepEqual(Object.keys(a).slice(0, 2), ['src', 'mime'], k);
  }
  assert.deepEqual(PF.validateDeckAudio({ 'a:0': { src: 'data:audio/wav;base64,AA==', dur: 1, cues: [], mime: 'text/html' } }).length, 1);
});
ok('古い音声（原稿を直した後に合成していない）は inputHash: null（§5.2）。展開してまとめ直しても null のまま。読み手は null を古いとみなす', async () => {
  const D = path.join(work, 'stale');
  fs.cpSync(MIN, D, { recursive: true, filter: (s) => !/[\\/]out([\\/]|$)/.test(path.relative(MIN, s)) });
  const man = JSON.parse(fs.readFileSync(path.join(D, 'audio', 'manifest.json'), 'utf8'));
  const [k0, e0] = Object.entries(man.segments)[0];
  e0.digest = 'abcdef123456';
  delete e0.inputHash;
  fs.writeFileSync(path.join(D, 'audio', 'seg_abcdef123456.json'), JSON.stringify({ voice: { expert: 'x', engine: 'dry-run' } }));
  fs.writeFileSync(path.join(D, 'audio', 'manifest.json'), JSON.stringify(man, null, 1));
  const r = await buildPortable(path.join(D, 'deck.html'), { out: path.join(D, 'out', 'deck' + FORMAT.FILE_EXT) });
  assert.equal(r.index.audio[k0].inputHash, null);
  assert.ok(r.warnings.some((w) => /stale/.test(w)));
  schemaOk(vIndex, r.index, 'index with a null inputHash');
  assert.deepEqual(PF.validateIndex(r.index), []);
  const seg = parseNarration(narr(D)).find((s) => `${s.slideKey}:${s.stepKey}` === k0);
  assert.equal(await PF.isStale(r.index.audio[k0], seg), true);
  const [k1, a1] = Object.entries(r.index.audio)[1];
  assert.equal(await PF.isStale(a1, parseNarration(narr(D)).find((s) => `${s.slideKey}:${s.stepKey}` === k1)), false);
  fs.writeFileSync(path.join(D, 'out', 'deck' + FORMAT.FILE_EXT), r.html);
  const U = path.join(work, 'stale-unpacked');
  await unpack(path.join(D, 'out', 'deck' + FORMAT.FILE_EXT), U);
  assert.equal(JSON.parse(fs.readFileSync(path.join(U, 'audio', 'manifest.json'), 'utf8')).segments[k0].inputHash, null);
  const again = await buildPortable(path.join(U, 'deck.html'), { out: path.join(U, 'out', 'deck' + FORMAT.FILE_EXT) });
  assert.equal(again.index.audio[k0].inputHash, null);
  assert.equal(again.html, r.html, 'pack(unpack(x)) === x with a null inputHash');
});
ok('作り直し（carry）：書き手の知らない索引の項目と、口述原稿から作られなかった拡張を残す（§7.1・§9A）', async () => {
  const r = await PF.readPortable(firstHtml);
  const carry = { ...PF.parseJsonStrict(JSON.stringify(r.index)), futureMember: { kept: true }, extensions: { ...r.index.extensions, chapters: { v: 1, x: 1 } } };
  const again = await buildPortable(path.join(MIN, 'deck.html'), { out: path.join(MIN, 'out', 'carry.html'), carry });
  assert.deepEqual(plainJson(again.index.futureMember), { kept: true });
  assert.deepEqual(plainJson(again.index.extensions.chapters), { v: 1, x: 1 });
  assert.deepEqual(plainJson(again.index.extensions.tutor), plainJson(first.index.extensions.tutor));
  assert.equal(again.index.docId, first.index.docId);
});
ok('作り直し（carry）：知らない項目はどの深さでも残す（metadata・音声の記録・塊・部品とテーマ・版・拡張。§7.1）。docId を変えない保存は derivedFrom を付けも変えもしない', async () => {
  const r = await PF.readPortable(firstHtml);
  const carry = PF.parseJsonStrict(JSON.stringify(r.index));
  addUnknownMembers(carry);
  carry.metadata.derivedFrom = { docId: '11111111-2222-4333-8444-555555555555', sourceSha256: 'a'.repeat(64) };
  carry.metadata.description = 'written by another producer';
  const again = await buildPortable(path.join(MIN, 'deck.html'), { out: path.join(MIN, 'out', 'carry2.html'), carry, originalNarration: narr(MIN) });
  const x = plainJson(again.index);
  assert.deepEqual(x.futureMember, { kept: true });
  assert.equal(x.version.xPatch, 7);
  assert.equal(x.metadata.xAudienceNote, 'kept');
  assert.equal(x.metadata.description, 'written by another producer');
  assert.deepEqual(x.metadata.derivedFrom, carry.metadata.derivedFrom, 'derivedFrom kept as is');
  for (const a of Object.values(x.audio)) assert.deepEqual(a.xTake, { kept: true });
  for (const b of Object.values(x.blobs)) assert.equal(b.xStorage, 'kept');
  for (const t of x.themes || []) assert.equal(t.xRegistryUrl, 'kept');
  assert.equal(x.extensions.chapters.xNote, 'kept');
  assert.deepEqual(x.extensions.tutor, plainJson(first.index.extensions.tutor));
  assert.deepEqual(PF.validateIndex(again.index), []);
  schemaOk(vIndex, again.index, 'index with unknown members');
  // derivedFrom のない文書を docId を変えずに保存しても付かない（設定のファイルに書いてあっても）
  const c2 = PF.parseJsonStrict(JSON.stringify(r.index));
  const D = path.join(work, 'derived'); fs.cpSync(MIN, D, { recursive: true, filter: (q) => !/[\\/]out([\\/]|$)/.test(path.relative(MIN, q)) });
  const cfg = JSON.parse(fs.readFileSync(path.join(D, FORMAT.CONFIG_FILE), 'utf8'));
  cfg.metadata.derivedFrom = { docId: '11111111-2222-4333-8444-555555555555', sourceSha256: 'b'.repeat(64) };
  fs.writeFileSync(path.join(D, FORMAT.CONFIG_FILE), JSON.stringify(cfg, null, 2) + '\n');
  const keep = await buildPortable(path.join(D, 'deck.html'), { out: path.join(D, 'out', 'k.html'), carry: c2 });
  assert.equal(keep.index.metadata.derivedFrom, undefined, 'Save keeps the absence of derivedFrom');
  // 行を消した拡張は残さない（元の口述原稿の行から作られたもの）
  fs.writeFileSync(path.join(D, 'narration.md'), narr(D).replace(/@x-tutor-q[^\n]*\n/g, ''));
  const noTutor = await buildPortable(path.join(D, 'deck.html'), { out: path.join(D, 'out', 'k2.html'), carry: c2, originalNarration: narr(MIN) });
  assert.equal(noTutor.index.extensions, undefined, 'extension lines removed → extension not carried');
  // 新しい教材として保存（identity）：新しい docId・derivedFrom・設定のファイルも。権利の表示はそのまま
  const nid = PF.newDocId();
  const asNew = await buildPortable(path.join(MIN, 'deck.html'), { out: path.join(MIN, 'out', 'new.html'), carry: PF.parseJsonStrict(JSON.stringify(r.index)),
    identity: { docId: nid, derivedFrom: { docId: r.index.docId, sourceSha256: r.index.sourceSha256 } } });
  assert.equal(asNew.index.docId, nid); assert.equal(asNew.deckMeta.docId, nid);
  assert.deepEqual(plainJson(asNew.index.metadata.derivedFrom), { docId: r.index.docId, sourceSha256: r.index.sourceSha256 });
  for (const k of ['license', 'copyright', 'attribution', 'creators']) assert.deepEqual(asNew.index.metadata[k], r.index.metadata[k], k);
  assert.equal(JSON.parse(new TextDecoder().decode(asNew.files[FORMAT.CONFIG_FILE])).docId, nid);
  assert.equal(JSON.parse(asNew.writes[FORMAT.CONFIG_FILE]).docId, nid);
  const back = await PF.readPortable(asNew.html);
  assert.equal(back.sourceMatches, true);
  // 書いた原稿のフォルダの設定のファイルは元に戻す（この試験の後の試験のため）
  fs.writeFileSync(path.join(MIN, FORMAT.CONFIG_FILE), new TextDecoder().decode(r.files[FORMAT.CONFIG_FILE]));
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
  // 取り出した大きさはパスごとに数える：3000 のパスが 1 つの 32 MiB の塊を指す索引（塊そのものは文書にない）は、復号より前・
  // パスごとの写しを作るより前に断る（この上限がなければ、塊を探しに行って missing-chunk になる＝確保の前に止まっていることの印）
  {
    const ix0 = JSON.parse(PF.scanDocument(firstHtml).byId.get(FORMAT.INDEX_ID).text);
    const id = 'f'.repeat(64).slice(0, Object.keys(ix0.blobs)[0].length);
    const big = 32 * 1024 * 1024, n = Math.ceil(big / PF.LIMITS.chunkBytes);
    ix0.blobs[id] = { ...Object.values(ix0.blobs)[0], bytes: big, sha256: 'a'.repeat(64), chunks: Array.from({ length: n }, (_, j) => `${FORMAT.BLOB_PREFIX}${id}-${j}`) };
    const keep = { [ix0.entry]: ix0.files[ix0.entry] };
    for (let i = 0; Object.keys(keep).length < PF.LIMITS.files; i++) keep[`fill/f${i}.bin`] = id;
    ix0.files = keep; delete ix0.audio;
    const crafted = await PF.replaceIndexText(firstHtml, JSON.stringify(ix0));
    const t0 = process.memoryUsage().arrayBuffers;
    const e = await rejects(PF.readPortable(crafted), 'archive-too-large');
    assert.match(e.message, /per path/);
    assert.ok(process.memoryUsage().arrayBuffers - t0 < 64 * 1024 * 1024, 'refused before allocating the extracted files');
    // 同じ大きさでも 1 つのパスなら上限の中（塊がないので、そこで初めて断る）
    ix0.files = { [ix0.entry]: ix0.files[ix0.entry], 'fill/one.bin': id };
    await rejects(PF.readPortable(await PF.replaceIndexText(firstHtml, JSON.stringify(ix0))), 'missing-chunk');
  }
  void ix;
});

// ---------------------------------------------------------------- コードが動くか（申告ではなく中身から。kit/core/code-scan.mjs、§6）
ok('コードが動くかは中身から決める：データの type のない script・on… の属性・javascript: の URL・srcdoc・文書を入れる要素・取り込む SVG・JS のファイル・部品の式', () => {
  const has = (html) => markupReasons(html).length > 0;
  for (const [html, want] of [
    ['<p>plain</p><script type="application/json">{"a":1}</script><script type="text/x-tex-macros">x</script>', false],
    ['<script>1</script>', true], ['<script type="module">1</script>', true], ['<script type="text/babel">1</script>', true], ['<script type="importmap">{}</script>', true],
    ['<img src="data:," onerror="x()">', true], ['<svg><circle ONLOAD="x()"/></svg>', true], ['<body onload="x()">', true],
    ['<a href=" java	script:x()">a</a>', true], ['<a href="JaVaScRiPt:x()">a</a>', true], ['<svg><a><animate attributeName="href" values="#a; javascript:x()"/></a></svg>', true],
    ['<iframe srcdoc="&lt;b&gt;"></iframe>', true], ['<object data="x.svg"></object>', true], ['<embed src="x.svg">', true],
    ['<template><img src="data:," onerror="x()"></template>', true], ['<a href="https://example.org/javascript:x">ok</a>', false],
    ['<m-sweep f="((1-c)**2)**u" values="[0,1]"></m-sweep>', false], ['<m-sweep f="Math.exp(-u*c) + Math.sin(u)"></m-sweep>', false],
    ['<m-sweep f="fetch(\'x\')"></m-sweep>', true], ['<m-sweep f="u.constructor.constructor(\'x\')()"></m-sweep>', true], ['<m-sweep f="[][\'flat\']"></m-sweep>', true],
    ['<m-curves><script type="application/json">[{"f":"exp(-x*x/2)/sqrt(2*PI)"},{"pts":[[0,1]]}]</script></m-curves>', false],
    ['<m-curves><script type="application/json">[{"f":"top.location"}]</script></m-curves>', true],
    ['<m-curves><script type="application/json">{{JSON:missing.json}}</script></m-curves>', true],
    // 実行系と同じ選び方（isDataBlock）：id="deck-…" のおとり・type の空白と大文字・入れ子・2 つ以上・f が文字列でないもの
    ['<m-curves><script type="application/json" id="deck-decoy">[]</script><script type="application/json">[{"f":"(globalThis.__bypass=1,x)"}]</script></m-curves>', true],
    ['<m-curves><script type="application/json" id="deck-decoy">[]</script><script type="application/json">[{"f":"x*x"}]</script></m-curves>', true],
    ['<m-curves><script type=" Application/JSON ">[{"f":"(globalThis.__bypass=1,x)"}]</script></m-curves>', true],
    ['<m-curves><div><script type="application/json">[{"f":"(globalThis.__bypass=1,x)"}]</script></div></m-curves>', true],
    ['<m-curves><script type="application/json">[{"f":["x"]}]</script></m-curves>', true],
    ['<m-curves><script type="application/json">[{"f":"x"}]</script></m-curves><m-curves><script type="application/json">[{"f":"top.x"}]</script></m-curves>', true],
    ['<m-sweep F="fetch(1)"></m-sweep>', true], ['<m-sweep f="u*c" f="fetch(1)"></m-sweep>', false],
    // 空の <script>（§6）：src がなく中身が空か空白だけならコードではない。コメント・; だけのもの、src のあるもの、ほかの空白の字はコード
    ['<script></script>', false], ['<script>\n  \t\r\n</script>', false], ['<script type="module"> </script>', false], ['<svg><script></script></svg>', false],
    ['<script>// placeholder\n</script>', true], ['<script>/* */</script>', true], ['<script>;</script>', true], ['<script><!-- --></script>', true],
    ['<script src="x.js"></script>', true], ['<script src=""></script>', true], ['<script>\u00a0</script>', true], ['<script>\ufeff</script>', true],
  ]) assert.equal(has(html), want, html);
  assert.ok(isDataBlock(' APPLICATION/json ') && !isDataBlock('application/json;x') && !isDataBlock(null) && !isDataBlock('text/json'));
  assert.ok(safeExpression('u*u + c*u*u*u + c*c*u**4', { vars: ['u', 'c'] }));
  assert.ok(!safeExpression('(u)=>u', { vars: ['u'] }) && !safeExpression('u;alert(1)', { vars: ['u'] }) && !safeExpression('Math.constructor', { vars: [] }));
  const files = (o) => new Map(Object.entries(o).map(([k, v]) => [k, new TextEncoder().encode(v)]));
  assert.deepEqual(codeReasons(files({ 'deck.html': '<p>x</p>', 'figs/a.svg': '<svg><rect/></svg>', 'narration.md': '<script>not markup</script>', 'figs/a.png': '<script>' })), []);
  assert.ok(codeReasons(files({ 'deck.html': '<p>{{FIG:a}}</p>', 'figs/a.svg': '<svg><script>x()</script></svg>' }))[0].includes('figs/a.svg'));
  assert.ok(codeReasons(files({ 'deck.html': '<p>x</p>', 'components/x/index.js': '1' }))[0].includes('components/x/index.js'));
  assert.deepEqual(codeReasons(files({ 'deck.html': '<p>x</p>', 'export.html': '<script>1</script>' })), [], 'an exported HTML the deck does not name is not counted');
  assert.ok(codeReasons(files({ 'deck.html': '<p>/*INCLUDE:part.html*/</p>', 'part.html': '<script>1</script>' })).length === 1, 'an HTML the deck names is scanned');
  assert.ok(codeReasons(files({ 'deck.html': '<m-curves><script type="application/json">{{JSON:c.json}}</script></m-curves>', 'data/c.json': '[{"f":"x*x"}]' })).length === 0);
});

ok('空の <script>（§6）：src のない、中身が空か空白だけの <script> を持つデッキは core に書き出し、コメントだけのものは extended', async () => {
  const profileOf = async (name, tag) => {
    const D = makeDeck(path.join(work, name));
    const f = path.join(D, 'deck.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<body>\n', `<body>\n${tag}\n`));
    const p = await buildPortable(f, { out: path.join(D, 'out', 'p' + FORMAT.FILE_EXT) });
    return JSON.parse(PF.scanDocument(p.html).byId.get(FORMAT.INDEX_ID).text).profile;
  };
  assert.equal(await profileOf('empty-script', '<script>\n</script>'), 'core');
  assert.equal(await profileOf('empty-script-0', '<script></script>'), 'core');
  assert.equal(await profileOf('comment-script', '<script>\n// placeholder\n</script>'), 'extended');
});

ok('スライドへのリンク（§9.1A）と m-menu：リンクはふつうの <a href="#<id>"> のまま書き出され、部品庫の m-menu だけなら core。読める層はそのまま', async () => {
  const D = makeDeck(path.join(work, 'links'));
  const f = path.join(D, 'deck.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<p class="sub">試験用</p>',
    '<p class="sub">試験用</p><m-menu><a href="#s-step22" data-sub="段階 0 へ">一歩ずつ</a><a href="#s-step22:1">次の段階へ</a></m-menu><p><a href="#s-intro1">表紙</a></p>'));
  const p = await buildPortable(f, { out: path.join(D, 'out', 'p' + FORMAT.FILE_EXT) });
  const sc = PF.scanDocument(p.html), index = JSON.parse(sc.byId.get(FORMAT.INDEX_ID).text);
  assert.equal(index.profile, 'core');
  assert.deepEqual(index.components.map((c) => [c.tag, c.source]), [['m-menu', 'registry']]);
  for (const h of ['#s-step22', '#s-step22:1', '#s-intro1']) assert.ok(p.html.includes(`href="${h}"`), `compiled slides keep ${h}`);
  const r = await PF.readPortable(p.html);
  const raw = r.files instanceof Map ? r.files.get('deck.html') : r.files['deck.html'];
  const src = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  assert.ok(src.includes('<a href="#s-step22:1">'), 'archived source keeps the link');
  assert.deepEqual(codeReasons(r.files, { entry: r.index.entry }), [], 'links are not code');
  const layer = p.html.slice(p.html.indexOf(`<section id="${FORMAT.READABLE_ID}"`));
  assert.ok(layer.includes('<article data-slide-key="s-intro1">') && layer.includes('data-step-key="s-step22:1"'), 'readable layer');
});

// ---------------------------------------------------------------- 解析の上限（§11）：小さな要素を何百万も並べた文書を、全部の木を作る前に速く断る
ok('解析の上限：上限の大きさより小さいが小さな要素が何百万もある文書は、要素・属性・入れ子の数で解析の途中に断る（速く、メモリは入力の大きさの程度）', async () => {
  const base = (await buildPortable(path.join(makeDeck(path.join(work, 'bounded-deck')), 'deck.html'), { out: path.join(work, 'bounded-out.html') })).html;
  // 子の process で測る（最大の RSS は process ごと）：90 MiB の文書の <body> の直後に詰める
  const script = `
    import fs from 'node:fs';
    import { readPortable } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'kit/core/portable.mjs')).href)};
    const html = fs.readFileSync(process.argv[2], 'utf8'), filler = process.argv[3];
    const j = html.indexOf('>', html.indexOf('<body')) + 1;
    const bytes = new TextEncoder().encode(html.slice(0, j) + filler.repeat(Math.floor((90 * 1048576 - html.length) / filler.length)) + html.slice(j));
    const rss0 = process.resourceUsage().maxRSS, t0 = performance.now();
    let code = 'accepted'; try { await readPortable(bytes); } catch (e) { code = e.code; }
    console.log(JSON.stringify({ code, ms: Math.round(performance.now() - t0), mib: bytes.length / 1048576, rssMiB: Math.round((process.resourceUsage().maxRSS - rss0) / 1024) }));`;
  const sf = path.join(work, 'bounded-probe.mjs'); fs.writeFileSync(sf, script);
  fs.writeFileSync(path.join(work, 'bounded.html'), base);
  for (const filler of ['<p>', '<div>', '<br a b c d e f g h>']) {
    const r = spawnSync(process.execPath, [sf, path.join(work, 'bounded.html'), filler], { encoding: 'utf8', timeout: 120000 });
    const m = JSON.parse(r.stdout.trim().split('\n').pop());
    console.log(`      ${filler}: ${m.mib.toFixed(0)} MiB → ${m.code} in ${m.ms} ms, peak RSS +${m.rssMiB} MiB`);
    assert.equal(m.code, 'too-complex', filler);
    assert.ok(m.ms < 5000, `${filler}: refused quickly (${m.ms} ms)`);
    assert.ok(m.rssMiB < 700, `${filler}: bounded memory (peak RSS +${m.rssMiB} MiB for a 90 MiB input; a full tree would need several GiB)`);
  }
  // 普通の文書は上限の内（試験用ファイルも下で全部読む）。上限を小さくすれば断る（要素・入れ子・取り出した原稿のタグの数）
  await PF.readPortable(base);
  for (const lim of [{ elements: 10 }, { nesting: 3 }, { attributes: 20 }, { sourceTags: 10 }]) await assert.rejects(PF.readPortable(base, { limits: lim }), (e) => e.code === 'too-complex', JSON.stringify(lim));
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
      if ('code' in f.expect) assert.equal(codeReasons(r.files, { entry: r.index.entry }).length > 0, f.expect.code, `${f.name}: code decided from the content, not from profile "${r.index.profile}"`);
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
    // 取り出しだけ（§7.1・§3.5・§9.3）：知らない major・知らない必須の機能も、1.x の規則で索引と塊が検査を通れば取り出せる（編集・書き出しはさせない）
    if (f.expect.extract === 'ok') {
      const r = await PF.readPortable(text, { extract: true });
      assert.equal(r.extractOnly, true, f.name);
      assert.ok(r.files['deck.html'] && r.warnings.some((w) => /extracted, not edited/.test(w)), f.name);
    } else if (f.expect.extract) await rejects(PF.readPortable(text, { extract: true }), f.expect.extract.error);
  }
  // 取り出しの印がなければ今の版の文書は extractOnly ではない
  assert.equal((await PF.readPortable(fs.readFileSync(fixtures[0].file, 'utf8'), { extract: true })).extractOnly, false);
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

ok('音声の kind（format spec §5.2・§7.3）：deck-audio にも写る（Schema に合う）。再生専用の派生（索引なし）でも、TTS は操作の帯の札「AI 音声」とキーの一覧、録音は印なし、取り込んだ音声はキーの一覧だけ。舞台と字幕には出さない。dry-run は印なし', async () => {
  const dir = path.join(work, 'kinds');
  prepareMinimal(dir);
  const mp = path.join(dir, 'audio', 'manifest.json'), man = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const ks = Object.keys(man.segments);
  assert.ok(ks.length >= 4, 'enough steps');
  const set = (k, o) => { const v = { ...man.segments[k] }; delete v.engine; delete v.recipe; delete v.kind; man.segments[k] = { ...v, ...o }; };
  set(ks[0], { kind: 'tts', engine: 'stub-tts' });
  set(ks[1], { kind: 'recorded', sync: 'none', cues: [] });
  set(ks[2], { kind: 'imported' });
  set(ks[3], { engine: 'dry-run' });
  fs.writeFileSync(mp, JSON.stringify(man, null, 1));
  const r = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(dir, 'out', 'deck' + FORMAT.FILE_EXT) });
  const da = JSON.parse(PF.scanDocument(r.html).byId.get('deck-audio').text);
  schemaOk(vAudio, da, 'deck-audio with kind');
  assert.deepEqual(PF.validateDeckAudio(da), []);
  assert.deepEqual([da[ks[0]].kind, da[ks[1]].kind, da[ks[2]].kind, 'kind' in da[ks[3]]], ['tts', 'recorded', 'imported', false], 'deck-audio kinds');
  assert.equal(r.index.audio[ks[0]].kind, 'tts');
  assert.equal(vAudio(plainJson({ 'a:0': { ...da[ks[0]], kind: 'synth' } })), false, 'schema rejects an unknown kind');
  assert.equal(PF.validateDeckAudio({ 'a:0': { ...da[ks[0]], kind: 'synth' } }).length, 1);
  // ふつうの build も同じ kind を書く
  const plain = JSON.parse(/<script type="application\/json" id="deck-audio">([\s\S]*?)<\/script>/.exec(build(path.join(dir, 'deck.html'), { out: path.join(dir, 'out', 'deck.html') }).html)[1]);
  assert.deepEqual([plain[ks[0]].kind, plain[ks[1]].kind, plain[ks[2]].kind, 'kind' in plain[ks[3]]], ['tts', 'recorded', 'imported', false], 'plain build kinds');
  const po = path.join(dir, 'out', 'deck' + FORMAT.PLAY_EXT);
  fs.writeFileSync(po, PF.playOnly(r.html));
  assert.ok(!PF.scanDocument(fs.readFileSync(po, 'utf8')).byId.has(FORMAT.INDEX_ID), 'play-only has no index');
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(fileUrl(po));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
    await page.waitForSelector('#dt-cb', { state: 'attached', timeout: 10000 });
    const got = await page.evaluate((ks) => {
      DECK.captions(true);
      const cap = (k) => { const g = DECK.timeline().find((x) => x.key === k); DECK.go(g.i, g.k, false); return !!document.querySelector('#deck-cap .cap-ai') || !!document.getElementById('deck-ai'); };
      const b = document.querySelector('#dt-cb .dt-aib');
      DECK.tools.help(true);
      const info = [...document.querySelectorAll('#dt-help .dt-ai')].map((e) => e.textContent);
      DECK.tools.help(false);
      return { kinds: ks.map((k) => DECK.audioKind(k)), notes: ks.map((k) => DECK.voiceNote(k)), onStage: ks.map(cap), badge: b && b.textContent, tip: b && b.title,
        ai: DECK.hasAiVoice(), unknown: DECK.hasUnknownVoice(), info };
    }, ks.slice(0, 4));
    assert.deepEqual(errors, []);
    assert.deepEqual(got.kinds, ['tts', 'recorded', 'imported', null]);
    assert.deepEqual(got.notes, ['音声は AI で合成したものです', '', '音声の作り方は記録されていません', '']);
    assert.deepEqual(got.onStage, [false, false, false, false], 'nothing on the stage or with the captions');
    assert.equal(got.badge, 'AI 音声', 'play-only: the control bar badge for TTS');
    assert.equal(got.tip, '音声は AI で合成したものです');
    assert.deepEqual(got.info, ['音声は AI で合成したものです', '音声の作り方は記録されていません'], '? info lines');
    assert.ok(got.ai && got.unknown);
  } finally { await browser.close(); }
});

ok('部品庫・テーマ庫の名前は 1 つの識別子だけ：../・絶対パス・\\・. の名前を断り、vendor/components/ の外を読まない（検査器・展開・npm run portable の照合。固定の components.lock.json のほか）', async () => {
  const BAD = ['../../private', '../x', '/etc/passwd', 'C:/x', 'a\\b', '..\\..\\x', '.', '..', '.hidden', 'a/b', 'Upper', '1abc', '-x', 'a'.repeat(65), '', 'a b'];
  const base = JSON.parse(fs.readFileSync(path.join(SPEC, 'fixtures', 'index', 'invalid', 'registry-name-traversal.json'), 'utf8'));
  for (const name of BAD) {
    const c = structuredClone(base); c.components[0].name = name;
    assert.ok(PF.validateIndex(c).length > 0, `component name ${JSON.stringify(name)}`);
    assert.equal(vIndex(c), false, `ajv component name ${JSON.stringify(name)}`);
    const t = structuredClone(base); t.components[0].name = 'sweep'; t.themes = [{ name, version: '0', sha256: 'a'.repeat(64), source: 'registry' }];
    assert.ok(PF.validateIndex(t).length > 0, `theme name ${JSON.stringify(name)}`);
    assert.equal(vIndex(t), false, `ajv theme name ${JSON.stringify(name)}`);
  }
  const good = structuredClone(base); good.components[0].name = 'sweep'; good.themes = [{ name: 'business', version: '0', sha256: 'a'.repeat(64), source: 'registry' }];
  assert.deepEqual(PF.validateIndex(good), []);
  // 原稿のフォルダの部品（embedded）の名前は仕様が決めない（ここでは読まない）
  const emb = structuredClone(good); emb.components[0] = { tag: 'm-hello', name: 'Hello World', version: 'local', sha256: 'a'.repeat(64), source: 'embedded', path: 'components/hello/index.js' };
  emb.files['components/hello/index.js'] = 's0';
  assert.ok(!PF.validateIndex(emb).some((x) => /components\[0\]\.name/.test(x)));

  // fs の読み取りを数える（展開・照合の間に vendor/components/ の外のパスに触れないこと。固定のファイルは読む）
  const R = path.join(work, 'regroot'), OUTSIDE = path.join(work, 'private');
  fs.mkdirSync(path.join(R, 'vendor', 'components', 'sweep', '1.0.0'), { recursive: true });
  fs.writeFileSync(path.join(R, 'vendor', 'components', 'sweep', '1.0.0', 'index.js'), 'ok');
  fs.mkdirSync(path.join(OUTSIDE, '1.0.0'), { recursive: true }); fs.writeFileSync(path.join(OUTSIDE, '1.0.0', 'index.js'), 'ok');
  fs.symlinkSync(OUTSIDE, path.join(R, 'vendor', 'components', 'evil'));
  const okSha = await PF.sha256Hex(new TextEncoder().encode('ok'));
  const lockEntry = { default: '1.0.0', versions: ['1.0.0'], sha256: { '1.0.0': okSha } };
  fs.writeFileSync(path.join(R, 'components.lock.json'), JSON.stringify({ components: { evil: lockEntry, sweep: lockEntry } }));
  const seen = [];
  const SPY = ['readFileSync', 'openSync', 'existsSync', 'statSync', 'lstatSync', 'realpathSync'];
  const orig = Object.fromEntries(SPY.map((k) => [k, fs[k]]));
  const spy = () => { for (const k of SPY) fs[k] = function (p, ...a) { if (typeof p === 'string') seen.push([k, path.resolve(p)]); return orig[k].call(this, p, ...a); }; };
  const unspy = () => { for (const k of SPY) fs[k] = orig[k]; };
  const sha = (await PF.sha256Hex(new TextEncoder().encode('ok')));
  const ix = { components: [...BAD.map((name) => ({ tag: 'm-x', name, version: '0', sha256: sha, source: 'registry' })),
    { tag: 'm-evil', name: 'evil', version: '0', sha256: sha, source: 'registry' }, { tag: 'm-sweep', name: 'sweep', version: '0', sha256: sha, source: 'registry' }],
  themes: BAD.map((name) => ({ name, version: '0', sha256: sha, source: 'registry' })) };
  spy();
  let w; try { w = registryWarnings(ix, R); } finally { unspy(); }
  const regDir = path.join(R, 'vendor', 'components'), regReal = fs.realpathSync(regDir), lockPath = path.join(R, 'components.lock.json');
  const under = (p, d) => p === d || p.startsWith(d + path.sep);
  const outside = seen.filter(([, p]) => !under(p, regDir) && !under(p, regReal) && p !== lockPath);
  assert.deepEqual(outside, [], 'nothing outside vendor/components/ (and the lock) is touched');
  assert.ok(!seen.some(([k, p]) => k === 'readFileSync' && p !== lockPath && !under(p, path.join(regDir, 'sweep')) && !under(p, path.join(regReal, 'sweep'))), 'only the lock and vendor/components/sweep/1.0.0/index.js are read');
  assert.ok(!seen.some(([k, p]) => k === 'readFileSync' && fs.realpathSync(p).startsWith(OUTSIDE)), 'the link to the outside is not read');
  assert.equal(w.filter((x) => /is not a registry name/.test(x)).length, BAD.length * 2, w.join('\n'));
  assert.ok(w.some((x) => /m-evil .*not in vendor\/components/.test(x)), 'a link out of vendor/components/ is treated as missing');
  assert.ok(!w.some((x) => /m-sweep/.test(x)), 'the real registry component matches');

  // 展開：名前が ../../private の文書は、検査器が断り（invalid-index）、何も書かず、components/ の外を読まない
  const D = makeDeck(path.join(work, 'regname-deck'));
  const p = await buildPortable(path.join(D, 'deck.html'), { out: path.join(D, 'out', 'r' + FORMAT.FILE_EXT) });
  const ix2 = JSON.parse(PF.scanDocument(p.html).byId.get(FORMAT.INDEX_ID).text);
  ix2.components = [{ tag: 'm-sweep', name: '../../private', version: '0', sha256: 'a'.repeat(64), source: 'registry' }];
  const f = path.join(work, 'regname' + FORMAT.FILE_EXT);
  fs.writeFileSync(f, await PF.replaceIndexText(p.html, JSON.stringify(ix2)));
  const U = path.join(work, 'regname-out');
  seen.length = 0; spy();
  try { await rejects(unpack(f, U), 'invalid-index'); } finally { unspy(); }
  assert.ok(!fs.existsSync(U) || fs.readdirSync(U).length === 0, 'nothing written');
  assert.ok(!seen.some(([, p]) => p.endsWith(path.sep + 'index.js') || p.startsWith(path.join(ROOT, 'vendor', 'components'))), 'no registry file is read: ' + JSON.stringify(seen.slice(0, 5)));
});

ok('品質チェック：旧来の鍵（手書きの data-key と s<n>）は「legacy」の警告（エラーにしない・鍵は変えない）', () => {
  const d = path.join(work, 'legacy-check'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), '<!doctype html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage">\n' +
    '<section class="slide" data-key="hand"><h2>手書き</h2></section>\n<section class="slide"><div class="body">見出しなし</div></section>\n<section class="slide" id="s-abcdef"><h2>id</h2></section>\n<section class="slide"><h2>見出し</h2></section>\n</div></body></html>\n');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(d, 'deck.html')], { encoding: 'utf8' });
  const legacy = r.stdout.split('\n').filter((l) => /(手書きの data-key|鍵が位置の).*npm run ids/.test(l));
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
