// 英語の指示が部品庫の英語の説明（README.en.md）を読むことの試験（tools/make-llm-guide.mjs。v0.6.7）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// frontmatterEn の読み方・example の形の確かめ（16 のパーツ全部と、変えた見本）・パーツごとの長さの関所（en ≤ ja）・EN_EDITS・
// 英語の節に日本語が残らないこと（m-fishbone と m-tree の shape.note だけ）・日本語の指示が README.en.md に左右されないこと
// （README.en.md を読まない生成と同じ。v0.6.6 の最後のコミットの材料とも、版の行と partsSrc のほかは同じ）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generate, frontmatterEn } from './make-llm-guide.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').join('\n       ')); }
};
// 部品庫 2.4.3 で README.en.md のある標準のパーツ（16）
const EN16 = ['m-bars', 'm-cards', 'm-compare', 'm-curves', 'm-cycle', 'm-fishbone', 'm-flow', 'm-kpi', 'm-menu', 'm-pie', 'm-predict', 'm-quad', 'm-scatter', 'm-timeline', 'm-tree', 'm-venn'];
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
const content = lock2.catalogues[lock2.default].content;
const readmeEn = (tag) => fs.readFileSync(path.join(ROOT, 'vendor', 'components', 'sha256', content[tag.replace(/^m-/, '')], 'README.en.md'), 'utf8');
const throwsWith = (fn, re) => { let err = null; try { fn(); } catch (e) { err = e; } assert.ok(err, `expected an error matching ${re}`); assert.match(String(err.message), re); };
const base = generate();

ok('frontmatterEn: top-level keys, the indented props map, CRLF; no frontmatter is null', () => {
  const text = '---\nsummary: Bars by step\nprops:\n  orient: v or h\n  per-step: groups per step (0 = all)\nsteps: 1 group = 1 step\nexample: {"a": [1, 2]}\n---\n\nBody: `x`.\n';
  const want = { summary: 'Bars by step', props: { orient: 'v or h', 'per-step': 'groups per step (0 = all)' }, steps: '1 group = 1 step', example: '{"a": [1, 2]}' };
  assert.deepEqual(frontmatterEn(text), want);
  assert.deepEqual(frontmatterEn(text.replace(/\n/g, '\r\n')), want);
  // 字下げした行は、値のない見出し（props:）の下だけが表になる。値のある行の下の字下げは読まない
  assert.deepEqual(frontmatterEn('---\nsummary: S\n  stray: x\n---\n'), { summary: 'S' });
  assert.equal(frontmatterEn('summary: no fence\n'), null);
});

ok('the 16 standard parts with README.en.md are the ones read for the en pack, and each has summary and steps', () => {
  assert.deepEqual([...base.enParts].sort(), EN16);
  for (const t of EN16) {
    const fm = frontmatterEn(readmeEn(t));
    assert.ok(fm && fm.summary && fm.steps, `${t}: summary and steps`);
    assert.equal(PACK.en.components[t].set, 'standard', `${t} is a standard part`);
  }
});

ok('example validation: all 16 pass as vendored; a changed number or an added key throws, naming the part', () => {
  const withEx = EN16.filter((t) => typeof frontmatterEn(readmeEn(t)).example === 'string');
  assert.ok(withEx.length >= 10 && withEx.includes('m-menu') && withEx.includes('m-pie'), `parts with example: ${withEx.join(', ')}`);
  // 生成が通る（上の base）= 16 の example がどれも static shape.example と同じ形。英語の見本は英語の指示に入る
  assert.match(PACK.en.components['m-pie'].entry + PACK.en.components['m-pie'].row, /"Housing"/);
  const pie = readmeEn('m-pie');
  assert.ok(pie.includes('"value": 7.2'));
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace('"value": 7.2', '"value": 7.3') } }), /m-pie: README\.en\.md example: its keys or structure differ/);
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace('{"label": "Food",', '{"label": "Food", "extra": "x",') } }), /m-pie: README\.en\.md example: its keys or structure differ/);
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace(/^example: .*$/m, 'example: {"slices": [') } }), /m-pie: README\.en\.md example is not JSON/);
  // m-menu の見本は字（<a href> の HTML）：example: は JSON の字でなければならない
  const menu = readmeEn('m-menu');
  assert.match(menu, /^example: "<a href=/m);
  throwsWith(() => generate({ readmeEn: { 'm-menu': menu.replace(/^example: .*$/m, 'example: {"a": 1}') } }), /m-menu: README\.en\.md example: static shape\.example is text \(not JSON\), so example: must be a JSON string/);
});

ok('the per-part gate: an en entry made longer than ja fails (summary+steps+entry, paste units)', () => {
  const kpi = readmeEn('m-kpi');
  const long = kpi.trimEnd() + '\n\n' + 'This sentence makes the English entry longer than the Japanese one. '.repeat(60) + '\n';
  throwsWith(() => generate({ readmeEn: { 'm-kpi': long } }), /README\.en\.md is longer than README\.md in the pack \(paste units, UTF-16 \+ LF\):\n {2}m-kpi: en \d+ > ja \d+ \(summary\+steps\+entry\)/);
  // 長い summary も数える
  throwsWith(() => generate({ readmeEn: { 'm-kpi': kpi.replace(/^summary: .*$/m, 'summary: ' + 'long summary words '.repeat(200)) } }), /m-kpi: en \d+ > ja \d+/);
});

ok('EN_EDITS: the m-menu import note and the m-predict no-live-counts lines are in the en pack; a stale find fails', () => {
  const menu = PACK.en.components['m-menu'].entry, predict = PACK.en.components['m-predict'].entry;
  assert.ok(menu.includes('Add the menu after import; in the first draft use a plain list.'), 'm-menu: the import note');
  assert.ok(menu.includes('ids are added on import') && !menu.includes('npm run ids'), 'm-menu: ids are added on import');
  assert.ok(!menu.includes('lesson2.ega.html'), 'm-menu: the link to another lesson is cut');
  assert.ok(predict.includes('poll id (no live counts yet)'), 'm-predict: the poll prop');
  assert.ok(predict.includes('reserved; no live reveals yet (`ctx.live.poll(id)` is null), so viewer/author counts are used'), 'm-predict: no live counts');
  assert.ok(!predict.includes('live poll totals'), 'm-predict: the README.en.md wording is replaced');
  // EN_EDITS の find が README.en.md になくなれば失敗する
  throwsWith(() => generate({ readmeEn: { 'm-predict': readmeEn('m-predict').replace('  poll: live poll id', '  poll: poll id') } }), /EN_EDITS m-predict: "\| live poll id \|" is not in the README\.en\.md entry any more/);
  // m-bars だけは PACK_EDITS があって EN_EDITS がない（大きさだけの言い換え）：知らせだけ
  assert.deepEqual(base.warnings.filter((w) => /README\.en\.md is used for the en pack/.test(w)), ['m-bars: README.en.md is used for the en pack; PACK_EDITS (1) are not applied to it and there are no EN_EDITS']);
});

ok('no Japanese in the 16 parts\' en sections (components 2.5.0: the shape.note of m-fishbone and m-tree is {en, ja} now)', () => {
  const J = /[　-ヿ㐀-鿿＀-￯]+/g;
  const hits = [];
  for (const t of EN16) {
    const c = PACK.en.components[t];
    for (const [k, v] of [['row', c.row], ['entry', c.entry], ...Object.entries(c.ext || {}).map(([s, x]) => ['ext ' + s, x])]) for (const m of (v || '').match(J) || []) hits.push(`${t} ${k}: ${m}`);
  }
  assert.deepEqual(hits, []);
});

// 日本語の指示を、言いたいことの束の組み合わせ（9 つの束のすべての部分集合）× 無料（短くする・しない）・有料で組み立てる。版の行と partsSrc は揃える
const jaDump = (data) => {
  const out = [];
  for (let m = 0; m < 1 << data.sets.length; m++) {
    const sets = data.sets.filter((_, i) => m & (1 << i));
    for (const [plan, short] of [['free', false], ['free', true], ['paid', false]]) out.push(assemble(data, { sets, lang: 'ja', plan, short }).split(data.version).join('<version>').split(data.partsSrc).join('<partsSrc>'));
  }
  return out;
};
const firstDiff = (a, b) => { const i = a.findIndex((x, k) => x !== b[k]); return i < 0 ? '' : `#${i}: ${[...a[i]].findIndex((ch, k) => ch !== b[i][k])}`; };

ok('ja is not touched by README.en.md: the ja packs are byte-identical to a generation that reads no README.en.md (apart from the version line)', () => {
  const none = generate({ readmeEn: false });
  assert.deepEqual(none.enParts, []);
  const a = jaDump(base.data), b = jaDump(none.data);
  assert.equal(a.length, 3 << base.data.sets.length);
  assert.ok(a.every((x, i) => x === b[i]), `ja packs differ (${firstDiff(a, b)})`);
  assert.ok(none.data.version !== base.data.version, 'the en text changes the version');
});

// v0.6.6 の最後のコミット（部品庫 2.4.2、README.en.md を読まない make-llm-guide）の材料と比べる。浅い clone で無ければ飛ばす
const V066 = '4f7ccebcb35f5e9e0fdbca26c6226dc03c17a305';
ok(`ja packs byte-identical to v0.6.6 (${V066.slice(0, 8)}) apart from the version line and partsSrc: every set combination, free (short or not) and paid`, () => {
  let old;
  try { old = execFileSync('git', ['show', `${V066}:kit/core/llm-pack-data.mjs`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch { console.log('       (skipped: v0.6.6 is not in this clone)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-llm-guide-en-'));
  try {
    fs.writeFileSync(path.join(dir, 'data.mjs'), old);
    // 読み込みは同期で済ませたいので、子のプロセスで JSON にする
    const json = execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(path.join(dir, 'data.mjs')).href)}).then((m) => process.stdout.write(JSON.stringify(m.PACK)))`], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const oldData = JSON.parse(json);
    assert.match(oldData.partsSrc, /\/v2\.4\.2\//);
    assert.match(PACK.partsSrc, /\/v2\.5\.0\//);
    // 部品庫 2.5.0（候補）で m-cards の README（日本語）が変わった（箇条書きの代わりにカードを使う手引き）。その部品の日本語の指示だけは v0.6.6 のものに揃えて比べる
    const cur = structuredClone(PACK);
    cur.ja.components['m-cards'] = oldData.ja.components['m-cards'];
    // v0.6.8 で色の一覧に光 --lit の 1 行を足した（format spec §8.4）。その 1 行だけは除いて比べる
    const LIT_JA = '\n  - `--lit`：光と、光が照らすもの。輪郭線を付けた塗りに使う';
    assert.ok(cur.ja.common.includes(LIT_JA), 'the --lit line of the ja colour list');
    cur.ja.common = cur.ja.common.replace(LIT_JA, '');
    const a = jaDump(cur), b = jaDump(oldData);
    assert.equal(a.length, b.length);
    assert.ok(a.every((x, i) => x === b[i]), `ja packs differ from v0.6.6 (${firstDiff(a, b)})`);
    assert.ok(a.some((x) => x.includes('<version>')) && a.some((x) => x.includes('<partsSrc>')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

if (failed) { console.log(`test-llm-guide-en: ${failed} failed`); process.exit(1); }
console.log('test-llm-guide-en: ok');
