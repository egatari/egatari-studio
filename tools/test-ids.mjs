// npm run ids（tools/ids.mjs）の検査：id を付ける・鍵の付け替え・2 回目は何も変えない・CRLF・衝突なら断る
//   node tools/test-ids.mjs [workdir]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNarration } from '../kit/narration.mjs';
import { annotate } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'motion-ids-'));
fs.mkdirSync(work, { recursive: true });
let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
const ids = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ids.mjs'), ...a], { encoding: 'utf8' });
const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const CRLF = (s) => s.replace(/\r?\n/g, '\r\n');

function makeDeck(name, { crlf = false, extra = '' } = {}) {
  const d = path.join(work, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(path.join(d, 'audio'), { recursive: true });
  const t = crlf ? CRLF : (s) => s;
  fs.writeFileSync(path.join(d, 'deck.html'), t(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage">
<section class="slide cover static" id="cover"><h1>表紙</h1></section>
<section class="slide"><h2>更新 の式</h2><p>\\( \\htmlId{eta}{\\eta} \\)</p></section>
<section class="slide" data-morph="更新の式"><h2>比:率</h2></section>
<section class="slide"/>
${extra}</div></body></html>
`));
  fs.writeFileSync(path.join(d, 'narration.md'), t(`# 口述原稿

## cover
[0] ようこそ。

## 更新 の式
[0] 式です。
@x-quiz-q 何ですか
[1] {mark:eta}η です。

<!--
## 更新 の式
-->
## 比:率
[0] 比です。
`));
  fs.writeFileSync(path.join(d, 'audio', 'manifest.json'), t(JSON.stringify({ segments: { 'cover:0': { file: 'a.wav', dur: 1 }, '更新の式:0': { file: 'b.wav', dur: 2.5 }, '比:率:0': { file: 'c.wav', dur: 1e-7 } } }, null, 1) + '\n'));
  fs.writeFileSync(path.join(d, 'timeline.json'), t(JSON.stringify({ '更新の式:1': { hold: 2 }, 'cover:0': { hold: 1 } }, null, 2) + '\n'));
  fs.writeFileSync(path.join(d, 'comments.json'), t(JSON.stringify([{ id: 'c1', key: '比:率:0', comment: 'x' }, { id: 'c2', key: 'cover:0', comment: 'y' }], null, 2) + '\n'));
  return d;
}

const plain = makeDeck('plain');
let r = ids(plain);
ok('1 回目：id のないスライドに id を付け、鍵を付け替える', () => {
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const { slides } = annotate(read(plain, 'deck.html'), false, []);
  assert.equal(slides[0].key, 'cover');
  for (const s of slides.slice(1)) assert.match(s.id, /^s-[a-z2-7]{6}$/);
  const [, a, b, c] = slides.map((s) => s.key);
  assert.match(read(plain, 'deck.html'), new RegExp(`data-morph="${a}"`));
  assert.match(read(plain, 'deck.html'), new RegExp(`<section class="slide" id="${c}"/>`));
  const narr = read(plain, 'narration.md');
  assert.match(narr, new RegExp(`^## 更新 の式 \\{#${a}\\}$`, 'm'));
  assert.match(narr, new RegExp(`^## 比:率 \\{#${b}\\}$`, 'm'));
  assert.match(narr, /^## cover$/m);                          // id のあるスライドの見出しは変えない
  assert.match(narr, /<!--\n## 更新 の式\n-->/);               // 注釈の中は変えない
  assert.match(narr, /^@x-quiz-q 何ですか$/m);                  // 拡張の行も残る
  const keys = parseNarration(narr).map((s) => `${s.slideKey}:${s.stepKey}`);
  assert.deepEqual(keys, ['cover:0', `${a}:0`, `${a}:1`, `${b}:0`]);
  const man = JSON.parse(read(plain, 'audio/manifest.json'));
  assert.deepEqual(Object.keys(man.segments), ['cover:0', `${a}:0`, `${b}:0`]);
  assert.equal(man.segments[`${b}:0`].dur, 1e-7);
  assert.deepEqual(Object.keys(JSON.parse(read(plain, 'timeline.json'))), [`${a}:1`, 'cover:0']);
  assert.deepEqual(JSON.parse(read(plain, 'comments.json')).map((c) => c.key), [`${b}:0`, 'cover:0']);
  assert.match(read(plain, 'audio/manifest.json'), /^{\n "segments"/);   // 字下げはそのまま（1）
  const backups = fs.readdirSync(path.join(plain, '.cache', 'edits'));
  assert.deepEqual(backups.map((f) => f.replace(/^.*Z-/, '')).sort(), ['comments.json', 'deck.html', 'manifest.json', 'narration.md', 'timeline.json']);
});
ok('2 回目は何も変えない', () => {
  const before = ['deck.html', 'narration.md', 'audio/manifest.json', 'timeline.json', 'comments.json'].map((f) => read(plain, f));
  const n0 = fs.readdirSync(path.join(plain, '.cache', 'edits')).length;
  const r2 = ids(path.join(plain, 'deck.html'));
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /nothing to do/);
  assert.deepEqual(['deck.html', 'narration.md', 'audio/manifest.json', 'timeline.json', 'comments.json'].map((f) => read(plain, f)), before);
  assert.equal(fs.readdirSync(path.join(plain, '.cache', 'edits')).length, n0);
});

const crlf = makeDeck('crlf', { crlf: true });
ok('CRLF の原稿は CRLF のまま', () => {
  const r3 = ids(crlf);
  assert.equal(r3.status, 0, r3.stderr);
  for (const f of ['deck.html', 'narration.md', 'audio/manifest.json', 'timeline.json', 'comments.json']) {
    const t = read(crlf, f);
    assert.ok(t.includes('\r\n') && !/[^\r]\n/.test(t), `${f} keeps CRLF`);
  }
  assert.match(read(crlf, 'narration.md'), /^## 更新 の式 \{#s-[a-z2-7]{6}\}\r$/m);
});

ok('--dry-run は何も書かない', () => {
  const d = makeDeck('dry');
  const before = read(d, 'deck.html');
  const r4 = ids(d, '--dry-run');
  assert.equal(r4.status, 0);
  assert.match(r4.stdout, /dry-run/);
  assert.equal(read(d, 'deck.html'), before);
  assert.ok(!fs.existsSync(path.join(d, '.cache')));
});

for (const [name, extra, re] of [
  ['id がほかの id と重なる', '<p id="cover">x</p>', /「cover」がほかの id と重なる/],
  ['鍵が重なる', '<section class="slide"><h2>更新の 式</h2></section>', /鍵「更新の式」/],
  ['id の書式の誤り', '<section class="slide" id="1x"><h2>x</h2></section>', /「1x」が規則に合わない/],
]) {
  ok(`断る：${name}`, () => {
    const d = makeDeck('bad', { extra });
    const before = read(d, 'deck.html');
    const r5 = ids(d);
    assert.equal(r5.status, 1);
    assert.match(r5.stderr, re);
    assert.equal(read(d, 'deck.html'), before);
    assert.ok(!fs.existsSync(path.join(d, '.cache')));
  });
}
console.log(`ids: ${n} ok (${work})`);
