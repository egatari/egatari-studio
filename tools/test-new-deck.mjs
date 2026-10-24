// test-all: unit
// 新規作成の選び方とシード値（kit/core/new-deck.mjs・kit/core/purposes.mjs、backlog #99・#104、format spec §8.4）と、AI への指示の中身：
// 1. 大分類・小分類・分野（パーツの組 → 系列）・頼む文の節（場面・構成の型・見せ方・外した言いたいこと）
// 2. 言いたいこと：決めた表（FALLBACK）と manifest.json の読み方、外したものだけに使う部品
// 3. 指示（pack）：言いたいこと → 表し方 → ステップの表、全パーツの 1 行の一覧、R-whole、外した部品は一覧と説明から消える
// 4. シード値：作るときに 1 回だけ書く（あれば変えない）・直した返事が失っても戻す・egatari.json の studio.newDeck（ほかの項目はバイトのまま）
// 5. シード値は組み立て（build）と 1 ファイル（pack → unpack）を通っても残る
//   node tools/test-new-deck.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, SUBJECTS, seriesOfSubjects, defaultSubjects, choiceRequest, withChoice, choiceOf, SEED_ATTR, newSeed, seedOf, withSeed, keepSeed } from '../kit/core/new-deck.mjs';
import { FALLBACK, purposesFrom, componentsOff, purposesTable } from '../kit/core/purposes.mjs';
import { buildPack, commonBody, seriesPart, PURPOSES, SERIES, PACK_VERSION } from '../kit/core/llm-pack.mjs';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { withOutline, outlineOf } from '../kit/core/llm-outline.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

ok('categories: Teaching / Research / Business / Guides / Other (no “Academic”); 10 subcategories set the structure', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.label.ja), ['授業・研修', '研究発表', 'ビジネス', '手引き', 'その他']);
  assert.deepEqual(CATEGORIES.map((c) => c.label.en), ['Teaching', 'Research', 'Business', 'Guides', 'Other']);
  assert.ok(!CATEGORIES.some((c) => /学術|Academic/.test(c.label.ja + c.label.en)));
  const subs = CATEGORIES.flatMap((c) => c.subs);
  assert.equal(subs.length, 10);
  assert.ok(subs.every((s) => s.structure.ja && s.structure.en && s.show.ja && s.show.en));
  assert.ok(CATEGORIES.find((c) => c.id === 'business').subs.some((s) => s.label.ja === '紹介・広報'));
  assert.ok(CATEGORIES.find((c) => c.id === 'guides').structure.ja.includes('場面や品目'));
});
ok('subjects are part sets mapped to the internal series (math → academic, …), not subcategories', () => {
  assert.deepEqual(SUBJECTS.map((s) => s.series), SERIES);
  assert.deepEqual(seriesOfSubjects(['info', 'math']), ['academic', 'info']);
  assert.deepEqual(defaultSubjects('business'), ['business']);
  assert.deepEqual(defaultSubjects('teaching'), []);
  assert.ok(!SUBJECTS.some((s) => /学術/.test(s.label.ja)));
});
ok('request section: kind, structure and presentation of the subcategory, and the purposes turned off', () => {
  const r = choiceRequest({ category: 'research', subcategory: 'conference', purposesOff: [] }, PURPOSES, 'ja');
  assert.equal(r, '- 場面：研究発表／学会の口頭発表\n- 構成の型：背景 → 目的 → 方法 → 結果 → 考察 → 結論（背景・方法・結果でおよそ 3 分の 1 ずつ）\n- 見せ方：見出しは主張の文、図が証拠。箇条書きを減らす。1 分に 1 枚ほど');
  const e = choiceRequest({ category: 'guides', subcategory: null, purposesOff: ['number', 'process'] }, PURPOSES, 'en');
  assert.match(e, /^- Kind: Guides\n- Structure: explain once/);
  assert.match(e, /- Purposes turned off by the author: one key number, steps of a process\. Do not use their representations \(`m-flow`, `m-kpi`\)\./);
  assert.equal(choiceRequest({ category: null, purposesOff: [] }, PURPOSES, 'en'), '');
  assert.equal(choiceRequest({ category: 'other', purposesOff: [] }, PURPOSES, 'ja'), '');
});

ok('purposes: 14 tiles from the decided table (fallback) until the components manifest has them', () => {
  assert.equal(FALLBACK.length, 14);
  assert.equal(PURPOSES.source, 'fallback');
  assert.deepEqual(PURPOSES.list.map((p) => p.label.ja), ['比べる', '変化', '内訳', '数字を見せる', '手順', '年表・予定', '原因と結果', '循環', '階層・分類', '位置づけ', '重なり', '2 つの量の関係', 'ばらつき', '目次']);
  assert.deepEqual(PURPOSES.list.filter((p) => p.planned).map((p) => p.id), ['timeline', 'cause', 'cycle', 'hierarchy', 'overlap', 'relation', 'spread']);
  // m-bars は 3 つの言いたいことに使う：全部外したときだけ使わせない
  assert.deepEqual(componentsOff(['compare', 'change'], PURPOSES), ['m-curves']);
  assert.deepEqual(componentsOff(['compare', 'change', 'part'], PURPOSES), ['m-bars', 'm-curves', 'm-market']);
  assert.deepEqual(componentsOff([], PURPOSES), []);
});
ok('purposes: read from manifest.json (purposes + components.<name>.purposes) when present; malformed falls back', () => {
  const m = { purposes: [{ id: 'compare', label: { en: 'Compare', ja: '比べる' } }, { id: 'bad id', label: { en: 'x', ja: 'x' } }, { id: 'timeline', label: { en: 'Timeline', ja: '年表' }, planned: false }],
    components: { bars: { tag: 'm-bars', purposes: ['compare', 'nope'] }, timeline: { tag: 'm-timeline', purposes: ['timeline'] } } };
  const P = purposesFrom(m);
  assert.equal(P.source, 'manifest');
  assert.deepEqual(P.list.map((p) => p.id), ['compare', 'timeline']);
  assert.deepEqual(P.components, { 'm-bars': ['compare'], 'm-timeline': ['timeline'] });
  assert.deepEqual(P.list[1].components, ['m-timeline']);
  assert.equal(purposesFrom({ purposes: [{ id: 1 }] }).source, 'fallback');
  assert.equal(purposesFrom(null).source, 'fallback');
});

ok(`pack ${PACK_VERSION}: the purpose → representation → steps table, the one-line index of all parts and R-whole are in the core`, () => {
  for (const lang of ['en', 'ja']) {
    const c = commonBody(lang);
    assert.ok(c.includes(purposesTable(PURPOSES, lang)), lang + ': table');
    assert.ok(c.includes('**R-purpose**') && c.includes('**R-whole**'), lang + ': standards');
    for (const t of ['m-bars', 'm-curves', 'm-quad', 'm-kpi', 'm-kanbun', 'm-codetree', 'm-sweep', 'm-menu']) assert.match(c, new RegExp('^- `' + t + '`', 'm'), lang + ': index line for ' + t);
    assert.match(c, /https:\/\/github\.com\/egatari\/components\/blob\/v\d+\.\d+\.\d+\/components\/<(name|名前)>\/README\.md/, lang + ': pinned URL');
  }
  assert.match(commonBody('en'), /\| change over time \| m-curves \(line\), m-bars \(few points\) \| one line at a time \|/);
  assert.match(commonBody('en'), /Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn/);
  assert.match(commonBody('ja'), /`m-curves`（academic の系列）/);
  // 全部（'all'）は 64 KB まで
  assert.ok(Buffer.byteLength(buildPack({ series: 'all', lang: 'ja' })) <= 64 * 1024);
});
ok('pack: turning purposes off removes the parts used only for them from the catalog (core and packs) and tells the AI', () => {
  const off = componentsOff(['number', 'process', 'contents'], PURPOSES);
  assert.deepEqual(off, ['m-flow', 'm-kpi', 'm-menu']);
  const full = packWithRequest({ series: ['business'], lang: 'en', request: 'R' });
  const cut = packWithRequest({ series: ['business'], lang: 'en', request: 'R', exclude: off });
  assert.ok(full.includes('### `<m-flow>`') && full.includes('### `<m-kpi>`') && full.includes('| `<m-menu>` |'));
  assert.ok(!cut.includes('### `<m-flow>`') && !cut.includes('### `<m-kpi>`') && !cut.includes('| `<m-menu>` |') && !cut.includes('| `<m-kpi>` |'));
  assert.ok(cut.includes('### `<m-bars>`') && cut.includes('### `<m-quad>`'));
  assert.ok(cut.length < full.length);
  assert.ok(!seriesPart('business', 'ja', off).includes('### `<m-kpi>`'));
});

ok('seed: written once (a uint32 in decimal on <html>), kept when present, restored when a revised deck drops or changes it', () => {
  assert.equal(SEED_ATTR, 'data-egatari-seed');
  const s = newSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
  assert.equal(newSeed(() => 0.5), 2 ** 31);
  const deck = '<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head></head><body></body></html>';
  const a = withSeed(deck, 123456789);
  assert.equal(a, deck.replace('data-theme="default">', 'data-theme="default" data-egatari-seed="123456789">'));
  assert.equal(seedOf(a), 123456789);
  assert.equal(withSeed(a, 42), a, 'written once: an existing seed is not replaced');
  assert.equal(seedOf(deck), null);
  assert.equal(seedOf('<html data-egatari-seed="4294967296">'), null);
  assert.equal(seedOf("<html data-egatari-seed='7'>"), 7);
  const revised = deck.replace('<head>', '<head><title>new</title>');
  assert.equal(seedOf(keepSeed(a, revised)), 123456789, 'a revised deck without the seed gets it back');
  assert.equal(seedOf(keepSeed(a, withSeed(revised, 5))), 123456789, 'a changed seed is put back');
  assert.equal(keepSeed(deck, revised), revised, 'no seed before: nothing added on revise');
  assert.throws(() => withSeed(deck, 2 ** 32));
});
ok('choices: egatari.json studio.newDeck through updateConfig (other members byte for byte); with the outline in the same studio member', () => {
  const raw = '{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}}';
  const t = withChoice(raw, { category: 'teaching', subcategory: 'class', subjects: ['kokugo', 'nope'], purposesOff: ['spread', 'number', 'spread'] });
  assert.ok(t.startsWith('{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}'));
  assert.deepEqual(choiceOf(t), { v: 1, category: 'teaching', subcategory: 'class', subjects: ['kokugo'], purposesOff: ['number', 'spread'] });
  const both = withOutline(t, { rows: [{ heading: 'a', point: '' }, { heading: 'b', point: '' }], next: 3 });
  assert.equal(outlineOf(both).next, 3);
  assert.equal(choiceOf(both).category, 'teaching');
  assert.deepEqual(choiceOf(withChoice(null, { category: 'bogus', subcategory: 'class' })), { v: 1, category: null, subcategory: null, subjects: [], purposesOff: [] });
  assert.equal(choiceOf('not json'), null);
});
ok('seed survives the build and a single-file round trip (pack → unpack)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-seed-'));
  try {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    const deck = withSeed(fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8'), 3141592653);
    fs.writeFileSync(path.join(src, 'deck.html'), deck);
    fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), path.join(src, 'narration.md'));
    const out = path.join(dir, 'lesson.ega.html');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', src, '-o', out], { stdio: 'pipe' });
    const html = fs.readFileSync(out, 'utf8');
    assert.equal(seedOf(html), 3141592653, 'the built page carries the seed on <html>');
    const back = path.join(dir, 'back');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'unpack', out, back], { stdio: 'pipe' });
    assert.equal(fs.readFileSync(path.join(back, 'deck.html'), 'utf8'), deck, 'the unpacked source is byte for byte the same, seed included');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`new-deck: ${n} ok`);
