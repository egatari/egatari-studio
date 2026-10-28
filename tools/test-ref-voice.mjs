// 参照音声（AI 音声が声をまねる元の録音）を教材に入れない（format spec §5 の recipe。kit/core/ref-voice.mjs）の試験
//   node tools/test-ref-voice.mjs [作業用のフォルダ]
// 作業フォルダに参照音声を置き（voice/me.wav・audio/ref.wav・attachments/me.wav・IRODORI_REF_DIR の中の名前の声）、voice.json で指す。
// 1. どこからも使われていない参照音声：Egatari ファイル（--portable）の索引・塊・HTML のどこにも入らない（バイトで確かめる）。展開しても出てこない
// 2. audio/manifest.json の段階の音声が参照音声（そのものか、名前を変えた写し）：外して決まりを言って知らせる。ほかの段階の音声は入る
// 3. 添付の場所（attachments/）の参照音声：外して決まりを言って知らせる
// 4. スライドが参照音声を使う（<audio src>。名前を変えた写しも）：エクスポートを断る（code reference-voice、決まりを言う）
// 5. 名前の声（voice.json に "me"）で、IRODORI_REF_DIR が作業フォルダの中：<名前>.wav と <名前>_<言語>.wav も入れない
// 6. 品質チェック（kit/check.mjs --json）：参照音声の場所ごとに refVoice（スライド＝エラー、段階の音声・添付＝警告、ほか＝情報）。日本語と英語
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPortable } from '../kit/build.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { REFERENCE_VOICE_RULE } from '../kit/core/ref-voice.mjs';
import { unpack } from './portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ref-voice-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// 中身の違う WAV（16 bit・モノラル・8 kHz）。freq で中身を変える（同じ中身の写しを見分ける試験のため）
function wav(freq, sec = 0.5) {
  const sr = 8000, n = Math.round(sr * sec), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(4000 * Math.sin((2 * Math.PI * freq * i) / sr)), 44 + 2 * i);
  return b;
}
const REF = { me: wav(220), ref: wav(330), att: wav(440), named: wav(550), namedEn: wav(660) };
const NARR = wav(880);   // ふつうの段階の音声（その声で作った音声のつもり）

// 作業フォルダ：examples/minimal の原稿と口述原稿。スライドの id は最初のエクスポートが付けるので、一度エクスポートした原稿（BASE）を写す
const BASE = path.join(work, 'base');
function makeDeck(dir, { voice, manifest, slideAudio } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const from = fs.existsSync(path.join(BASE, 'deck.html')) ? BASE : path.join(ROOT, 'examples', 'minimal');
  let html = fs.readFileSync(path.join(from, 'deck.html'), 'utf8');
  if (slideAudio) html = html.replace('</section>', `<audio src="${slideAudio}"></audio></section>`);
  fs.writeFileSync(path.join(dir, 'deck.html'), html);
  fs.copyFileSync(path.join(from, 'narration.md'), path.join(dir, 'narration.md'));
  for (const d of ['voice', 'audio', 'attachments', 'refs']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'voice', 'me.wav'), REF.me);
  fs.writeFileSync(path.join(dir, 'audio', 'ref.wav'), REF.ref);
  fs.writeFileSync(path.join(dir, 'attachments', 'me.wav'), REF.att);
  fs.writeFileSync(path.join(dir, 'refs', 'carol.wav'), REF.named);
  fs.writeFileSync(path.join(dir, 'refs', 'carol_en.wav'), REF.namedEn);
  fs.writeFileSync(path.join(dir, 'audio', 'narr.wav'), NARR);
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify(voice || { expert: 'voice/me.wav', novice: 'audio/ref.wav' }));
  if (manifest) fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments: manifest }));
}
// 口述原稿の段階の鍵（<スライドの id>:<段階>）
const stepKeys = (dir) => parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8')).map((s) => `${s.slideKey}:${s.stepKey}`);
// Egatari ファイルのどこかに、参照音声のバイト（元のまま・base64・塊）が入っていないか
const b64Head = (b) => b.subarray(0, 3 * 512).toString('base64');
function assertAbsent(r, refs, what) {
  for (const [k, b] of Object.entries(refs)) {
    assert.ok(!r.html.includes(b64Head(b)), `${what}: ${k} is not embedded in the HTML`);
    for (const [p, bytes] of Object.entries(r.files)) assert.ok(Buffer.compare(Buffer.from(bytes), b) !== 0, `${what}: ${k} is not the archive member ${p}`);
  }
  for (const p of Object.keys(r.index.files)) assert.ok(!/(^|\/)(me|ref|carol(_en)?)\.wav$/.test(p) && !/^voice\//.test(p) && !/^refs\//.test(p), `${what}: ${p} is not in the index`);
}

let n = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const D = path.join(work, 'deck');
let keys;
const pack = (dir, opts = {}) => buildPortable(path.join(dir, 'deck.html'), { out: path.join(dir, 'out', 'x.ega.html'), ...opts });

ok('1. どこからも使われていない参照音声は Egatari ファイルに入らない（索引・塊・HTML）。展開しても出てこない', async () => {
  makeDeck(BASE);
  await pack(BASE);   // スライドに id を付ける（作業フォルダに書き戻す）
  keys = stepKeys(BASE);
  assert.ok(keys.every((k) => /^s-/.test(k)), keys.join(' '));
  makeDeck(D);
  const r = await pack(D);
  assert.ok(keys.length > 2);
  assertAbsent(r, REF, 'unused');
  // voice.json は場所を伏せて入る（名前だけ）
  assert.deepEqual(JSON.parse(Buffer.from(r.files['voice.json']).toString('utf8')), { expert: 'me', novice: 'ref' });
  const f = path.join(D, 'out', 'x.ega.html');
  fs.writeFileSync(f, r.html);
  const U = path.join(work, 'unpacked');
  await unpack(f, U);
  const all = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else all.push(p); } };
  walk(U);
  for (const p of all) for (const [k, b] of Object.entries(REF)) assert.ok(Buffer.compare(fs.readFileSync(p), b) !== 0, `unpacked ${path.relative(U, p)} is not ${k}`);
});

ok('2. 段階の音声が参照音声（そのもの・名前を変えた写し）なら外して決まりを言う。ほかの段階の音声は入る', async () => {
  makeDeck(D, { manifest: {} });
  fs.writeFileSync(path.join(D, 'audio', 'copy.wav'), REF.me);   // voice/me.wav の、名前を変えた写し
  const man = { [keys[0]]: { file: 'ref.wav', dur: 0.5, cues: [], kind: 'recorded' }, [keys[1]]: { file: 'copy.wav', dur: 0.5, cues: [], kind: 'recorded' }, [keys[2]]: { file: 'narr.wav', dur: 0.5, cues: [], kind: 'recorded' } };
  fs.writeFileSync(path.join(D, 'audio', 'manifest.json'), JSON.stringify({ segments: man }));
  const r = await pack(D);
  assertAbsent(r, REF, 'manifest');
  assert.deepEqual(Object.keys(r.index.audio).sort(), [keys[2]], 'only the narration audio is carried');
  for (const k of [keys[0], keys[1]]) assert.ok(r.warnings.some((w) => w.includes(`audio for "${k}" is the reference voice`) && w.includes(REFERENCE_VOICE_RULE)), `warned for ${k}: ${r.warnings.join(' | ')}`);
  // 外した段階は deck-audio にも残らない（行き先のない参照を残さない）
  const back = await readPortable(r.html);
  assert.deepEqual(Object.keys(back.index.audio), [keys[2]]);
});

ok('3. 添付の場所の参照音声は外して決まりを言う', async () => {
  makeDeck(D, { voice: { expert: 'attachments/me.wav', novice: 'alice' } });
  const r = await pack(D);
  assertAbsent(r, REF, 'attachment');
  assert.ok(r.warnings.some((w) => w.includes('attachment "attachments/me.wav" is the reference voice') && w.includes(REFERENCE_VOICE_RULE)), r.warnings.join(' | '));
  assert.ok(!(r.index.attachments || []).length);
});

ok('4. スライドが参照音声を使う（そのもの・名前を変えた写し）ならエクスポートを断る（reference-voice）', async () => {
  for (const [src, extra] of [['voice/me.wav', null], ['clip.wav', REF.me]]) {
    makeDeck(D, { slideAudio: src });
    if (extra) fs.writeFileSync(path.join(D, src), extra);
    let err = null;
    try { await pack(D); } catch (e) { err = e; }
    assert.ok(err, `${src}: refused`);
    assert.equal(err.code, 'reference-voice', `${src}: ${err.message}`);
    assert.equal(err.details.path, src);
    assert.equal(err.details.reference, 'voice/me.wav');
    assert.ok(err.message.includes(REFERENCE_VOICE_RULE));
    assert.ok(!fs.existsSync(path.join(D, 'out', 'x.ega.html')), 'nothing written');
  }
});

ok('5. 名前の声で IRODORI_REF_DIR が作業フォルダの中：<名前>.wav・<名前>_<言語>.wav も入れない', async () => {
  makeDeck(D, { voice: { expert: 'carol', novice: 'alice' }, manifest: {} });
  const man = { [keys[0]]: { file: '../refs/carol.wav', dur: 0.5, cues: [], kind: 'recorded' }, [keys[1]]: { file: '../refs/carol_en.wav', dur: 0.5, cues: [], kind: 'recorded' }, [keys[2]]: { file: 'narr.wav', dur: 0.5, cues: [], kind: 'recorded' } };
  fs.writeFileSync(path.join(D, 'audio', 'manifest.json'), JSON.stringify({ segments: man }));
  const r = await pack(D, { voiceRefDir: path.join(D, 'refs') });
  assertAbsent(r, REF, 'named');
  assert.deepEqual(Object.keys(r.index.audio), [keys[2]]);
  // IRODORI_REF_DIR が作業フォルダの外なら、名前の声はこの作業フォルダのファイルに結び付けない（ふつうの段階の音声として入る）
  const r2 = await pack(D, { voiceRefDir: path.join(work, 'elsewhere') });
  assert.equal(Object.keys(r2.index.audio).length, 3);
});

ok('6. 品質チェック：参照音声の場所ごとに refVoice（スライド＝エラー・段階の音声と添付＝警告・ほか＝情報）、日本語と英語', () => {
  makeDeck(D, { voice: { expert: 'voice/me.wav', novice: 'audio/ref.wav' }, slideAudio: 'voice/me.wav', manifest: {} });
  fs.writeFileSync(path.join(D, 'audio', 'manifest.json'), JSON.stringify({ segments: { [keys[0]]: { file: 'ref.wav', dur: 0.5, cues: [], kind: 'recorded' } } }));
  const run = (lang) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(D, 'deck.html'), '--json', '--lang', lang], { encoding: 'utf8', env: { ...process.env, IRODORI_REF_DIR: '' } });
    const j = JSON.parse(r.stdout);
    return j.results.filter((x) => x.code === 'refVoice');
  };
  const ja = run('ja');
  const by = Object.fromEntries(ja.map((x) => [x.data.path, x]));
  assert.equal(by['voice/me.wav'].sev, 'error'); assert.equal(by['voice/me.wav'].data.where, 'slides');
  assert.equal(by['audio/ref.wav'].sev, 'warn'); assert.equal(by['audio/ref.wav'].data.where, 'audio');
  assert.ok(ja.every((x) => /参照音声/.test(x.msg)));
  const en = run('en');
  assert.equal(en.length, ja.length);
  assert.ok(en.every((x) => /reference voice/.test(x.msg) && !/[ぁ-んァ-ン]/.test(x.msg)));
  // 添付の場所とほかの所
  makeDeck(D, { voice: { expert: 'attachments/me.wav', novice: 'voice/me.wav' } });
  const j2 = run('en');
  const by2 = Object.fromEntries(j2.map((x) => [x.data.path, x]));
  assert.equal(by2['attachments/me.wav'].sev, 'warn'); assert.equal(by2['attachments/me.wav'].data.where, 'attachments');
  assert.equal(by2['voice/me.wav'].sev, 'info'); assert.equal(by2['voice/me.wav'].data.where, 'folder');
});

for (const [name, fn] of tests) {
  try { await fn(); n++; console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
console.log(`ref-voice: ${n}/${tests.length} ok (${work})`);
