// test-all: unit
// 新規作成の選び方とシード値（kit/core/new-deck.mjs・kit/core/purposes.mjs、backlog #99・#104、format spec §8.4）と、AI への指示の中身：
// 1. 大分類・小分類・分野（パーツの組 → 系列）・頼む文の節（場面・構成の型・見せ方・外した言いたいこと）
// 2. 言いたいこと：決めた表（FALLBACK）と manifest.json の読み方、外したものだけに使う部品
// 3. 指示（pack）：言いたいこと → パーツ → ステップの表は組み立てのときに作る（入っている系列の部品だけ・外した札の行はない・＊ の印はない）、R-whole、
//    外した言いたいことだけに使う部品はどこにも出ない（表・一覧・見本・文。「使わない」の 1 行を除く）、系列の見本は抜き出し、札は決めた 14 個（manifest は札を増やさない）
//    お使いの AI：無料版（選んだ分野だけ）と有料版（すべての系列）のどちらでも、外した部品は出ず、大きさはそれぞれの上限（PACK_CAP_KB）まで
// 4. シード値：作るときに 1 回だけ書く（あれば変えない）・直した返事が失っても戻す・egatari.json の studio.newDeck（ほかの項目はバイトのまま）
// 5. シード値は組み立て（build）と 1 ファイル（pack → unpack）を通っても残る
//   node tools/test-new-deck.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, SUBJECTS, seriesOfSubjects, defaultSubjects, choiceRequest, withChoice, choiceOf, AI_PLANS, DEFAULT_PLAN, planOf, seriesForChoice, SEED_ATTR, newSeed, seedOf, withSeed, freshSeed, keepSeed } from '../kit/core/new-deck.mjs';
import { TILES, purposesFrom, componentsOff } from '../kit/core/purposes.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { generate, LIMITS } from './make-llm-guide.mjs';
import { buildPack, commonBody, seriesPart, PURPOSES, SERIES, PACK_VERSION, PACK_CAP_KB, PAID_PACK_KB } from '../kit/core/llm-pack.mjs';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { guideRules } from '../kit/core/llm-fix.mjs';
import { withOutline, outlineOf } from '../kit/core/llm-outline.mjs';
import { slideChunks, insertSlide, duplicateSlide, deleteSlide, moveSlide, slideTemplate } from '../kit/core/slide-ops.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

ok('categories: Teaching / Research / Business / Guides / Other (no “Academic”); 13 subcategories set the structure', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.label.ja), ['授業・研修', '研究発表', 'ビジネス', '手引き', 'その他']);
  assert.deepEqual(CATEGORIES.map((c) => c.label.en), ['Teaching', 'Research', 'Business', 'Guides', 'Other']);
  assert.ok(!CATEGORIES.some((c) => /学術|Academic/.test(c.label.ja + c.label.en)));
  const subs = CATEGORIES.flatMap((c) => c.subs);
  assert.equal(subs.length, 13);
  assert.ok(subs.every((s) => s.structure.ja && s.structure.en && s.show.ja && s.show.en));
  assert.ok(CATEGORIES.find((c) => c.id === 'business').subs.some((s) => s.label.ja === '紹介・広報'));
  assert.ok(CATEGORIES.find((c) => c.id === 'guides').structure.ja.includes('場面や品目'));
  // 手引き：マニュアル・規程・法令の説明・案内
  const g = CATEGORIES.find((c) => c.id === 'guides').subs;
  assert.deepEqual(g.map((x) => x.id), ['manual', 'rules', 'info']);
  assert.deepEqual(g.map((x) => x.label.ja), ['マニュアル', '規程・法令の説明', '案内']);
  assert.deepEqual(g.map((x) => x.label.en), ['Manual', 'Rules and regulations', 'Information and orientation']);
  assert.match(g[0].structure.ja, /^目的.*→ 手順を 1 つずつ → つまずきやすいところ$/);
  assert.match(g[1].structure.en, /^what the rules are about → who they apply to and when → what you must do → the original text and its date$/);
  assert.ok(g[1].show.ja.includes('原典') && g[1].show.ja.includes('いつの時点'));
  assert.match(g[2].structure.ja, /^どんな場面か → 品目や場面から引ける一覧 → わからないときの問い合わせ先$/);
  assert.ok(['ごみの分別', '図書館', '避難経路', '新入生', '履修登録'].every((w) => g[2].show.ja.includes(w)));
  assert.match(choiceRequest({ category: 'guides', subcategory: 'rules', purposesOff: [] }, PURPOSES, 'ja'), /^- 場面：手引き／規程・法令の説明\n- 構成の型：何についての決まりか/);
  assert.deepEqual(choiceOf(withChoice(null, { category: 'guides', subcategory: 'info' })).subcategory, 'info');
});
ok('subjects are part sets mapped to the internal series (math → academic, …), not subcategories', () => {
  assert.deepEqual(SUBJECTS.map((s) => s.series), SERIES);
  assert.deepEqual(seriesOfSubjects(['info', 'math']), ['academic', 'info']);
  assert.deepEqual(defaultSubjects('business'), ['business']);
  assert.deepEqual(defaultSubjects('teaching'), []);
  assert.ok(!SUBJECTS.some((s) => /学術/.test(s.label.ja)));
});
ok('AI plan: free (default) packs only the chosen subjects; paid packs every series and ignores the subject ticks', () => {
  assert.deepEqual(AI_PLANS, ['free', 'paid']);
  assert.equal(DEFAULT_PLAN, 'free');
  assert.equal(planOf({}), 'free'); assert.equal(planOf({ plan: 'paid' }), 'paid'); assert.equal(planOf({ plan: 'gold' }), 'free'); assert.equal(planOf(null), 'free');
  assert.deepEqual(seriesForChoice({ subjects: ['info', 'math'] }), ['academic', 'info']);
  assert.deepEqual(seriesForChoice({ plan: 'free', subjects: [] }), []);
  assert.deepEqual(seriesForChoice({ plan: 'paid', subjects: ['kokugo'] }), SERIES);
  assert.equal(PAID_PACK_KB, 120); assert.equal(PACK_CAP_KB.paid, PAID_PACK_KB);
  assert.equal(LIMITS.fail, PACK_CAP_KB.free.one); assert.equal(LIMITS.allTarget, PACK_CAP_KB.free.all); assert.equal(LIMITS.paid, PAID_PACK_KB);
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

const FIX = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'components-manifest-purposes.json'), 'utf8'));
const TILE_IDS = ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents'];
ok('purposes: the 14 decided tiles (parts-map §9); the vendored v1.1.0 manifest has no purposes, so the decided table is used', () => {
  assert.equal(TILES.length, 14);
  assert.deepEqual(PURPOSES.list.map((p) => p.id), TILE_IDS);
  assert.equal(PURPOSES.source, 'fallback');
  assert.equal(PURPOSES.list[0].label.ja, '比べる（量・特徴）'); assert.equal(PURPOSES.list[0].label.en, 'Compare (amounts, features)');
  assert.ok(!JSON.stringify(PURPOSES.list).includes('＊'), 'no star markers');
  // m-bars は 3 つの札に使う：全部外したときだけ使わせない。m-codetree は階層と手順
  assert.deepEqual(componentsOff(['compare', 'change'], PURPOSES), ['m-curves']);
  assert.deepEqual(componentsOff(['compare', 'change', 'part-whole'], PURPOSES), ['m-bars', 'm-curves', 'm-market']);
  assert.deepEqual(componentsOff(['process'], PURPOSES), ['m-flow']);
  assert.deepEqual(componentsOff([], PURPOSES), []);
  // 札のない言いたいことの部品（m-kanbun・m-sweep・m-collect など）は外せない（分野から入る）
  assert.ok(!['m-kanbun', 'm-kobun', 'm-gendai', 'm-sweep', 'm-collect'].some((t) => PURPOSES.components[t]));
});
ok('purposes: a manifest (all 20 ids, ranking, reserved, an unknown id) maps onto exactly the 14 tiles; ranking folds into compare; unmapped ids warn and make no tile', () => {
  const m = FIX();
  assert.equal(m.purposes.length, 21);
  const P = purposesFrom(m);
  assert.equal(P.source, 'manifest');
  assert.deepEqual(P.list.map((p) => p.id), TILE_IDS, 'exactly the 14 tiles, in the decided order');
  assert.equal(P.list[0].label.ja, '比べる（量・特徴）');
  assert.deepEqual(P.components['m-bars'], ['compare', 'change', 'part-whole'], 'ranking folds into compare');
  assert.deepEqual(P.list.find((p) => p.id === 'change').steps, { ja: '線を 1 本ずつ', en: 'One line at a time' }, 'steps come from the manifest');
  assert.equal(P.list.find((p) => p.id === 'compare').name.ja, '量を比べる');
  assert.deepEqual(P.unmapped.sort(), ['grouping', 'mystery', 'parameter', 'text-structure']);
  for (const id of ['grouping', 'mystery', 'parameter', 'text-structure']) assert.ok(P.warnings.some((w) => w.includes(`"${id}" has no tile`)), 'warning for ' + id);
  assert.ok(!P.warnings.some((w) => /deviation|concept-links/.test(w)), 'reserved ids are neither tiles nor warnings');
  assert.deepEqual(P.variants['m-kpi'], ['count', 'rise', 'flip', 'underline']);
  assert.deepEqual(P.variants['m-bars'], []);
  // 写していない部品は入れない（vendored）
  const Pv = purposesFrom({ ...m, components: { ...m.components, newone: { purposes: ['change'] } } }, { vendored: Object.values(m.components).map((c) => c.tag) });
  assert.ok(!Pv.components['m-newone'] && !componentsOff(['change', 'compare', 'part-whole'], Pv).includes('m-newone'));
  assert.deepEqual(purposesFrom({ components: { newone: { purposes: ['change'] } } }).components['m-newone'], ['change'], 'tag defaults to m-<dir>');
});
ok('purposes: a partly broken manifest drops only the bad entries (with a warning) and keeps every tile; reserved is any truthy value', () => {
  const m = FIX();
  m.purposes[2] = { id: 'change', name: { ja: '変化' } };   // ja・en がない
  m.purposes.push(7, { id: 'Bad' }, { id: 'overlap', ja: 'x', en: 'y' });
  m.purposes.find((p) => p.id === 'cycle').reserved = 'yes';
  const P = purposesFrom(m);
  assert.deepEqual(P.list.map((p) => p.id), TILE_IDS, 'all 14 tiles remain');
  assert.deepEqual(P.list.find((p) => p.id === 'change').steps, TILES.find((t) => t.id === 'change').steps, 'a dropped id falls back per tile');
  assert.equal(P.list.find((p) => p.id === 'cycle').name.ja, '循環', 'a reserved ("yes") id keeps the decided text');
  assert.ok(P.warnings.some((w) => /purposes\[2\] dropped/.test(w)) && P.warnings.some((w) => /purposes\[21\] dropped \(not an object\)/.test(w)) && P.warnings.some((w) => /duplicate id/.test(w)));
  assert.equal(purposesFrom({ purposes: 'x' }).source, 'fallback');
  assert.equal(purposesFrom(null).source, 'fallback');
});
ok('pack from the fixture manifest (generate): 14 table rows with manifest steps, no reserved or unmapped row, warnings printed', () => {
  const g = generate({ manifest: FIX() });
  assert.deepEqual(g.data.purposes.list.map((p) => p.id), TILE_IDS);
  assert.ok(g.warnings.some((w) => w.includes('"mystery" has no tile')));
  const t = assemble(g.data, { series: 'all', lang: 'en' });
  const table = t.slice(t.indexOf('| purpose |'), t.indexOf('Each part'));
  assert.equal(table.trim().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| purpose') && !l.startsWith('|---')).length, 15, '14 rows + other parts');
  assert.match(table, /^\| Compare amounts \| `m-bars` \(sorted for ranking\) \| One side, then the difference \|$/m);
  assert.ok(!/Deviation|Concept links|Mystery|Ranking/.test(table));
});

const tagsIn = (text) => new Set([...text.matchAll(/m-[a-z]+(?![a-z-])/g)].map((m) => m[0]));
ok(`pack ${PACK_VERSION}: the purpose table is built at assembly from the included packs, never names a part without its description, and has no star markers`, () => {
  for (const lang of ['en', 'ja']) {
    const all = buildPack({ series: 'all', lang });
    assert.ok(all.includes('**R-purpose**') && all.includes('**R-whole**'), lang + ': standards');
    assert.ok(guideRules(all).has('R-purpose') && guideRules(all).has('R-whole'), lang + ': fix requests can quote them');
    assert.match(all, /https:\/\/github\.com\/egatari\/components\/blob\/v\d+\.\d+\.\d+\/components\/<(name|名前)>\/README\.md/, lang + ': pinned URL');
    for (const d of fs.readdirSync(path.join(ROOT, 'vendor', 'components')).filter((n) => fs.statSync(path.join(ROOT, 'vendor', 'components', n)).isDirectory()))
      assert.ok(all.includes('`m-' + d + '`'), `${lang}: m-${d} is in the table of the full pack`);
    for (const t of ['m-timeline', 'm-venn', 'm-scatter', 'm-cycle', 'm-compare']) assert.ok(!all.includes(t), `${lang}: ${t} is not named`);
    assert.ok(!/＊/.test(all) && !/ \*(?= \||,|$)/m.test(all.slice(all.indexOf('### 2.7'), all.indexOf('### 2.8'))), lang + ': no star markers');
    // 系列を選ばない：表が指すのは共通の部品だけ（説明がないものは名前を出さない）。入っていない系列は何に使えるかだけ
    const core = buildPack({ series: [], lang });
    for (const t of ['m-curves', 'm-quad', 'm-market', 'm-kpi', 'm-seq', 'm-kanbun']) assert.ok(!core.includes(t), `${lang}: no series chosen → ${t} is not named`);
    assert.ok(lang === 'en' ? /Packs not included here have parts for: academic \(change over time, spread\); business/.test(core) : /入っていない系列にもパーツがある：academic（時間での変化・ばらつき）/.test(core), lang + ': the packs not included are named by use');
    for (const s of SERIES) {
      const p = buildPack({ series: [s], lang });
      const described = new Set([...p.matchAll(/### `<(m-[a-z]+)>`/g)].map((m) => m[1]));
      for (const t of tagsIn(p.slice(p.indexOf('### 2.7'), p.indexOf('### 2.8')))) assert.ok(described.has(t), `${lang} ${s}: the table names ${t}, which is described`);
    }
  }
  const en = buildPack({ series: 'all', lang: 'en' });
  assert.match(en, /^\| change over time \| `m-curves` \(academic\), `m-bars` \(few points\) \| one line at a time \|$/m);
  assert.match(en, /^\| timeline \| none yet: the nearest part, or HTML or inline SVG \| one event at a time \|$/m);
  assert.match(buildPack({ series: [], lang: 'en' }), /^\| change over time \| `m-bars` \(few points\) \| one line at a time \|$/m);
  assert.match(buildPack({ series: [], lang: 'en' }), /^\| one key number \| not in this text: the nearest part, or HTML or inline SVG \| whole at once \|$/m);
  assert.match(en, /Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn/);
  // 大きさ：生成した指示（頼みたいことは記入欄のまま）の全部（'all'）は LIMITS.allTarget KB まで。写す文（内容・場面の節が入る）の上限ではない
  for (const lang of ['en', 'ja']) assert.ok(Buffer.byteLength(buildPack({ series: 'all', lang })) <= LIMITS.allTarget * 1024, `${lang} generated pack 'all' ≤ ${LIMITS.allTarget} KB`);
  // 系列の見本は抜き出し（部品を使うスライドだけ。骨組みは共通の見本）
  const biz = seriesPart('business', 'en');
  assert.ok(biz.includes('```deck.html\n<section class="slide">') && !biz.includes('<!DOCTYPE html>') && biz.includes('<m-kpi') && !biz.includes('<m-bars orient'));
  assert.ok(!/<!--\/?part/.test(en), 'no part markers left');
});
// 無料版：分野なし・1 つずつ・全部。有料版：分野の印に関わらずすべての系列（seriesForChoice）
const PLAN_CHOICES = [
  ...[[], ...SUBJECTS.map((s) => [s.id]), SUBJECTS.map((s) => s.id)].map((subjects) => ({ plan: 'free', subjects })),
  { plan: 'paid', subjects: [] }, { plan: 'paid', subjects: ['kokugo'] },
];
const capOk = (choice, bytes) => {
  const ss = seriesForChoice(choice);
  if (planOf(choice) === 'paid') return bytes <= PACK_CAP_KB.paid * 1024;
  return bytes <= PACK_CAP_KB.free.all * 1024 && (ss.length > 1 || bytes <= PACK_CAP_KB.free.one * 1024);
};
ok('caps per AI plan with all purposes on: free ≤ 40 KB with one subject and ≤ 58 KB for every subject set; paid (every series) ≤ PAID_PACK_KB', () => {
  for (const lang of ['en', 'ja']) {
    for (let mask = 0; mask < 1 << SUBJECTS.length; mask++) {
      const choice = { plan: 'free', subjects: SUBJECTS.filter((_, i) => mask & (1 << i)).map((s) => s.id) };
      const b = Buffer.byteLength(buildPack({ series: seriesForChoice(choice), lang }));
      assert.ok(capOk(choice, b), `${lang} free ${choice.subjects.join('+') || '(none)'}: ${b} B`);
    }
    const paid = buildPack({ series: seriesForChoice({ plan: 'paid' }), lang });
    assert.equal(paid, buildPack({ series: 'all', lang }), 'paid is the full pack');
    for (const s of SERIES) assert.ok(paid.includes(lang === 'en' ? `## Series pack: ${s}` : s), `${lang} paid has ${s}`);
    assert.ok(capOk({ plan: 'paid' }, Buffer.byteLength(paid)));
  }
});
ok('pack: no part used only by the purposes turned off appears anywhere in the copied text (table, catalog, examples, prose), for every single purpose and pair, in both AI plans, within each plan\'s cap', () => {
  const ids = PURPOSES.list.map((p) => p.id);
  const sets = [...ids.map((i) => [i])];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) sets.push([ids[i], ids[j]]);
  sets.push(ids, ['key-number', 'process', 'contents'], ['compare', 'change', 'part-whole']);
  let n = 0;
  const plans = new Set();
  for (const off of sets) {
    const ex = componentsOff(off, PURPOSES);
    if (!ex.length) continue;
    for (const lang of ['en', 'ja']) for (const choice of PLAN_CHOICES) {
      const series = seriesForChoice(choice);
      assert.ok(capOk(choice, Buffer.byteLength(buildPack({ series, lang, exclude: ex, off }))), `${lang} ${choice.plan} ${JSON.stringify(series)} off ${off.join('+')}: over the cap`);
      plans.add(choice.plan);
      const req = choiceRequest({ category: 'research', subcategory: 'conference', purposesOff: off }, PURPOSES, lang);
      const lines = packWithRequest({ series, lang, request: '# R\n\n' + req, exclude: ex, off }).split('\n');
      const dont = lines.filter((l) => /^- (Purposes turned off|使わない言いたいこと)/.test(l));
      assert.ok(dont.length === 1, 'one "do not use" line');
      const rest = lines.filter((l) => !dont.includes(l)).join('\n');
      for (const t of ex) assert.ok(!new RegExp(t + '(?![a-z-])').test(rest), `${lang} ${JSON.stringify(series)} off ${off.join('+')}: ${t} appears`);
      n++;
    }
  }
  assert.ok(n > 1000 && plans.size === 2, `${n} packs checked (${[...plans].join(', ')})`);
  // 共通の見本は m-flow のスライドを除いても形が残る（表紙と箇条書き）
  const cut = packWithRequest({ series: [], lang: 'en', request: 'R', exclude: ['m-flow'], off: ['process'] });
  assert.ok(cut.includes('```deck.html\n<!DOCTYPE html>') && cut.includes('<h2>Two programs take part</h2>') && !cut.includes('From the address to the screen'));
  assert.ok(!/^\| steps of a process \|/m.test(cut), 'the row of a purpose turned off is not in the table');
});
ok('pack: turning purposes off removes the parts used only for them from the catalog (core and packs) and tells the AI', () => {
  const off = componentsOff(['key-number', 'process', 'contents'], PURPOSES);
  assert.deepEqual(off, ['m-flow', 'm-kpi', 'm-menu']);
  const full = packWithRequest({ series: ['business'], lang: 'en', request: 'R' });
  const cut = packWithRequest({ series: ['business'], lang: 'en', request: 'R', exclude: off, off: ['key-number', 'process', 'contents'] });
  assert.ok(full.includes('### `<m-flow>`') && full.includes('### `<m-kpi>`') && full.includes('| `<m-menu>` |'));
  for (const t of off) assert.ok(!cut.includes(t), t + ' nowhere');
  assert.ok(cut.includes('### `<m-bars>`') && cut.includes('### `<m-quad>`'));
  assert.ok(cut.length < full.length);
  assert.ok(!seriesPart('business', 'ja', off).includes('m-kpi'));
});

ok('seed: a fresh random seed at creation even when the reply has one; written once otherwise; restored on revise, also without an <html> start tag', () => {
  assert.equal(SEED_ATTR, 'data-egatari-seed');
  const s = newSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
  assert.equal(newSeed(() => 0.5), 2 ** 31);
  const deck = '<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head></head><body></body></html>';
  const a = withSeed(deck, 123456789);
  assert.equal(a, deck.replace('data-theme="default">', 'data-theme="default" data-egatari-seed="123456789">'));
  assert.equal(seedOf(a), 123456789);
  assert.equal(withSeed(a, 42), a, 'withSeed keeps an existing seed');
  // 新規作成：返事が data-egatari-seed="42" を書いていても新しい値
  const reply = deck.replace('<html ', '<html data-egatari-seed="42" ');
  const fresh = freshSeed(reply, 987654321);
  assert.equal(seedOf(fresh), 987654321); assert.ok(!fresh.includes('"42"') && (fresh.match(/data-egatari-seed/g) || []).length === 1);
  assert.equal(seedOf(deck), null);
  assert.equal(seedOf('<html data-egatari-seed="4294967296">'), null);
  assert.equal(seedOf("<html data-egatari-seed='7'>"), 7);
  // > を含む属性の値・コメントの中の <html> に惑わされない
  const tricky = '<!DOCTYPE html>\n<!-- <html data-egatari-seed="1"> -->\n<html lang="ja" title="a>b">\n<body></body></html>';
  const t2 = withSeed(tricky, 5);
  assert.equal(seedOf(t2), 5); assert.ok(t2.includes('title="a>b" data-egatari-seed="5">') && t2.includes('<!-- <html data-egatari-seed="1"> -->'));
  const revised = deck.replace('<head>', '<head><title>new</title>');
  assert.equal(seedOf(keepSeed(a, revised)), 123456789, 'a revised deck without the seed gets it back');
  assert.equal(seedOf(keepSeed(a, withSeed(revised, 5))), 123456789, 'a changed seed is put back');
  assert.equal(keepSeed(deck, revised), revised, 'no seed before: nothing added on revise');
  // <html> の開始タグのない返事：<!DOCTYPE> の後ろに <html data-egatari-seed> を足す
  const noRoot = '<!DOCTYPE html>\n<head><title>x</title></head>\n<body></body>';
  const k = keepSeed(a, noRoot);
  assert.equal(seedOf(k), 123456789); assert.ok(k.startsWith('<!DOCTYPE html>\n<html data-egatari-seed="123456789">\n<head>'));
  assert.throws(() => withSeed(deck, 2 ** 32));
});
ok('choices: egatari.json studio.newDeck through updateConfig (other members byte for byte); with the outline in the same studio member', () => {
  const raw = '{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}}';
  const t = withChoice(raw, { category: 'teaching', subcategory: 'class', subjects: ['kokugo', 'nope'], purposesOff: ['spread', 'key-number', 'spread'] });
  assert.ok(t.startsWith('{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}'));
  assert.deepEqual(choiceOf(t), { v: 1, plan: 'free', category: 'teaching', subcategory: 'class', subjects: ['kokugo'], purposesOff: ['key-number', 'spread'] });
  const both = withOutline(t, { rows: [{ heading: 'a', point: '' }, { heading: 'b', point: '' }], next: 3 });
  assert.equal(outlineOf(both).next, 3);
  assert.equal(choiceOf(both).category, 'teaching');
  assert.deepEqual(choiceOf(withChoice(null, { category: 'bogus', subcategory: 'class' })), { v: 1, plan: 'free', category: null, subcategory: null, subjects: [], purposesOff: [] });
  // お使いの AI：有料版を書いて読み戻す（ほかの選び方はそのまま）。知らない値は無料版、plan のない前の記録も無料版
  const paid = withChoice(raw, { plan: 'paid', category: 'business', subcategory: 'pitch', subjects: ['business'], purposesOff: ['cycle'] });
  assert.ok(paid.includes('"plan": "paid"') || paid.includes('"plan":"paid"'));
  assert.deepEqual(choiceOf(paid), { v: 1, plan: 'paid', category: 'business', subcategory: 'pitch', subjects: ['business'], purposesOff: ['cycle'] });
  assert.deepEqual(choiceOf(withChoice(paid, { ...choiceOf(paid), plan: 'free' })), { ...choiceOf(paid), plan: 'free' }, 'switching back to free round-trips too');
  assert.equal(choiceOf(withChoice(null, { plan: 'gold' })).plan, 'free');
  assert.equal(choiceOf('{"studio": {"newDeck": {"v": 1, "category": null, "subcategory": null, "subjects": [], "purposesOff": []}}}').plan, 'free', 'an earlier record without plan reads as free');
  assert.equal(choiceOf('not json'), null);
});
ok('seed survives every slide operation of the editor (insert, duplicate, delete, move): they splice slides and never touch <html> (§8.4 "MUST preserve it on save")', () => {
  const deck = withSeed(fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8'), 2718281828);
  const n = slideChunks(deck).slides.length;
  assert.ok(n >= 2);
  const outs = [
    insertSlide(deck, 0, slideTemplate('title-body', { lang: 'en', id: 's-aaaaaa' })),
    duplicateSlide(deck, 0, 's-bbbbbb').out,
    deleteSlide(deck, n - 1),
    moveSlide(deck, 0, n - 1),
  ];
  for (const o of outs) { assert.equal(seedOf(o), 2718281828); assert.equal((o.match(/data-egatari-seed/g) || []).length, 1); }
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
