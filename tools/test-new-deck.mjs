// test-all: unit
// 新規作成の選び方とシード値（kit/core/new-deck.mjs・kit/core/purposes.mjs、backlog #99・#104、format spec §8.4）と、AI への指示の中身：
// 1. 大分類・小分類・分野（パーツの組 → 系列）・頼む文の節（場面・構成の型・見せ方・外した言いたいこと）
// 2. 言いたいこと：決めた表（FALLBACK）と manifest.json の読み方、外したものだけに使う部品
// 3. 指示（pack）：言いたいこと → パーツ → ステップの表（写した部品から。全パーツの一覧を兼ね、＊ の印はない）、R-whole、外した部品は一覧と説明から消える、系列の見本は抜き出し
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
import { guideRules } from '../kit/core/llm-fix.mjs';
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
  const e = choiceRequest({ category: 'guides', subcategory: null, purposesOff: ['key-number', 'process'] }, PURPOSES, 'en');
  assert.match(e, /^- Kind: Guides\n- Structure: explain once/);
  assert.match(e, /- Purposes turned off by the author: one key number, steps of a process\. Do not use their representations \(`m-flow`, `m-kpi`\)\./);
  assert.equal(choiceRequest({ category: null, purposesOff: [] }, PURPOSES, 'en'), '');
  assert.equal(choiceRequest({ category: 'other', purposesOff: [] }, PURPOSES, 'ja'), '');
});

ok('purposes: 14 tiles from the decided table (fallback; ids as in the components purposes.json) while the vendored manifest has no purposes', () => {
  assert.equal(FALLBACK.length, 14);
  assert.equal(PURPOSES.source, 'fallback');
  assert.deepEqual(PURPOSES.list.map((p) => p.label.ja), ['比べる', '変化', '内訳', '数字を見せる', '手順', '年表・予定', '原因と結果', '循環', '階層・分類', '位置づけ', '重なり', '2 つの量の関係', 'ばらつき', '目次']);
  assert.deepEqual(PURPOSES.list.map((p) => p.id), ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents']);
  assert.ok(!JSON.stringify(PURPOSES.list).includes('＊'), 'no star markers');
  // m-bars は 3 つの言いたいことに使う：全部外したときだけ使わせない
  assert.deepEqual(componentsOff(['compare', 'change'], PURPOSES), ['m-curves']);
  assert.deepEqual(componentsOff(['compare', 'change', 'part-whole'], PURPOSES), ['m-bars', 'm-curves', 'm-market']);
  assert.deepEqual(componentsOff([], PURPOSES), []);
  // m-codetree は階層と手順に使う：手順だけ外しても残る
  assert.deepEqual(componentsOff(['process'], PURPOSES), ['m-flow']);
});
ok('purposes: a manifest in the components release shape (ordered array, reserved ids, components.<dir>.purposes and variants) replaces the fallback', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'components-manifest-purposes.json'), 'utf8'));
  const P = purposesFrom(m);
  assert.equal(P.source, 'manifest');
  const ids = m.purposes.filter((p) => !p.reserved).map((p) => p.id);
  assert.deepEqual(P.list.map((p) => p.id), ids, 'the tiles follow the manifest order; reserved ids are left out');
  assert.ok(!P.list.some((p) => p.id === 'deviation' || p.id === 'concept-links'));
  assert.equal(P.list.find((p) => p.id === 'compare').label.ja, '比べる', 'a known id keeps the short tile label');
  assert.equal(P.list.find((p) => p.id === 'compare').name.ja, '量を比べる', 'the table uses the manifest name');
  assert.deepEqual(P.list.find((p) => p.id === 'change').steps, { ja: '線を 1 本ずつ', en: 'One line at a time' }, 'steps come from the manifest');
  assert.deepEqual(P.components['m-codetree'], ['hierarchy', 'process']);
  assert.deepEqual(P.variants['m-kpi'], ['count', 'rise', 'flip', 'underline']);
  assert.deepEqual(P.variants['m-bars'], []);
  // 形の合わない項目は落とし、何も残らなければ決めた表
  assert.equal(purposesFrom({ purposes: [{ id: 'x' }, { id: 'Bad', ja: 'a', en: 'b' }] }).source, 'fallback');
  assert.equal(purposesFrom({ purposes: [{ id: 'z', ja: 'z', en: 'z', reserved: true }] }).source, 'fallback');
  assert.equal(purposesFrom(null).source, 'fallback');
  // その manifest で組んだ表：部品のある行だけが部品を挙げ、ない行は近い部品か HTML。予約の id は出ない
  const parts = Object.values(m.components).map((c) => ({ tag: c.tag, series: c.series }));
  const t = purposesTable(P, parts, 'en', '');
  assert.match(t, /^\| Varying a parameter \| `m-sweep` \(academic\) \| One value at a time \|$/m);
  assert.match(t, /^\| Timeline, schedule \| none yet: the nearest part, or HTML or inline SVG \| One event at a time \|$/m);
  assert.ok(!/Deviation|Concept links|other parts/.test(t));
});

ok(`pack ${PACK_VERSION}: the purpose table (from the vendored parts, no star markers) is also the list of all parts; R-purpose and R-whole are standards`, () => {
  for (const lang of ['en', 'ja']) {
    const c = commonBody(lang);
    assert.ok(c.includes('**R-purpose**') && c.includes('**R-whole**'), lang + ': standards');
    assert.ok(guideRules(c).has('R-purpose') && guideRules(c).has('R-whole'), lang + ': fix requests can quote them');
    assert.match(c, /https:\/\/github\.com\/egatari\/components\/blob\/v\d+\.\d+\.\d+\/components\/<(name|名前)>\/README\.md/, lang + ': pinned URL');
    // 写した部品はどれも表に 1 回以上（全パーツの一覧を兼ねる）。写していない部品（m-timeline など）は出ない
    for (const d of fs.readdirSync(path.join(ROOT, 'vendor', 'components')).filter((n) => fs.statSync(path.join(ROOT, 'vendor', 'components', n)).isDirectory()))
      assert.ok(c.includes('`m-' + d + '`'), `${lang}: m-${d} is in the table`);
    for (const t of ['m-timeline', 'm-venn', 'm-scatter', 'm-cycle', 'm-compare']) assert.ok(!c.includes(t), `${lang}: ${t} is not named`);
    assert.ok(!/＊|\w \*(?= \||,|$)| \* \|/m.test(c.slice(c.indexOf('### 2.7'), c.indexOf('### 2.8'))), lang + ': no star markers');
  }
  const en = commonBody('en');
  assert.match(en, /^\| change over time \| `m-curves` \(academic\), `m-bars` \(few points\) \| one line at a time \|$/m);
  assert.match(en, /^\| timeline \| none yet: the nearest part, or HTML or inline SVG \| one event at a time \|$/m);
  assert.match(en, /^\| other parts \| `m-collect` \(academic\), `m-gendai` \(kokugo\), `m-kanbun` \(kokugo\), `m-kobun` \(kokugo\), `m-sweep` \(academic\) \| see the pack \|$/m);
  assert.match(en, /Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn/);
  assert.match(commonBody('ja'), /\| 時間での変化 \| `m-curves`（academic）、`m-bars`（点が少ないとき） \| 線を 1 本ずつ \|/);
  // 大きさ：全部（'all'）は 58 KB まで（#99 で 63 KB から縮めた。上限は 64 KB）
  for (const lang of ['en', 'ja']) assert.ok(Buffer.byteLength(buildPack({ series: 'all', lang })) <= 58 * 1024, lang + ' all ≤ 58 KB');
  // 系列の見本は抜き出し（部品を使うスライドだけ。骨組みは共通の見本）
  const biz = seriesPart('business', 'en');
  assert.ok(biz.includes('```deck.html\n<section class="slide">') && !biz.includes('<!DOCTYPE html>') && biz.includes('<m-kpi') && !biz.includes('<m-bars orient'));
});
ok('pack: turning purposes off removes the parts used only for them from the catalog (core and packs) and tells the AI', () => {
  const off = componentsOff(['key-number', 'process', 'contents'], PURPOSES);
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
  const t = withChoice(raw, { category: 'teaching', subcategory: 'class', subjects: ['kokugo', 'nope'], purposesOff: ['spread', 'key-number', 'spread'] });
  assert.ok(t.startsWith('{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}'));
  assert.deepEqual(choiceOf(t), { v: 1, category: 'teaching', subcategory: 'class', subjects: ['kokugo'], purposesOff: ['key-number', 'spread'] });
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
