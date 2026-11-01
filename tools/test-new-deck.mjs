// test-all: unit
// 新規作成の選び方とシード値（kit/core/new-deck.mjs・kit/core/purposes.mjs、backlog #99・#104、format spec §8.4）と、AI への指示の中身：
// 1. 大分類・小分類・④ のパーツの一覧（伝えたいことのまとまり・段と束・初めの印・プランの目安と外す候補）・頼む文の節（場面・構成の型・見せ方・外した言いたいこと）
// 2. 言いたいこと：決めた表（FALLBACK）と manifest.json の読み方、外したものだけに使う部品
// 3. 指示（pack）：言いたいこと → パーツ → ステップの表は組み立てのときに作る（入っている系列の部品だけ・外した札の行はない・＊ の印はない）、R-whole、
//    外した言いたいことだけに使う部品はどこにも出ない（表・一覧・見本・文。「使わない」の 1 行を除く）、系列の見本は抜き出し、札は決めた 14 個（manifest は札を増やさない）
//    お使いの AI：無料版（選んだ分野だけ。2 つまで）と有料版（すべての系列）のどちらでも、外した部品は出ず、大きさはそれぞれの上限（PACK_CAP_KB）まで。
//    無料版の大きさは、1 つの分野のどれも（free.one）と 2 つの分野のどの組も（free.two）
// 4. シード値：作るときに 1 回だけ書く（あれば変えない）・直した返事が失っても戻す・egatari.json の studio.newDeck（ほかの項目はバイトのまま）
// 5. シード値は組み立て（build）と 1 ファイル（pack → unpack）を通っても残る
//   node tools/test-new-deck.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, SUBJECTS, choiceRequest as choiceRequestOf, withChoice, choiceOf, AI_PLANS, DEFAULT_PLAN, planOf, partsList, partsOfSet, recommend, initialParts, SUBJECT_SETS, SUB_SETS, WORDS, capKb, trimCandidates } from '../kit/core/new-deck.mjs';
import * as NEW_DECK from '../kit/core/new-deck.mjs';
import { newDeckFiles } from '../kit/templates/new-deck.mjs';
import { TILES, purposesFrom, componentsOff, toolsFrom } from '../kit/core/purposes.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { generate, LIMITS, PAIRS, overMessage, sizeReport } from './make-llm-guide.mjs';
import { buildPack, commonBody, seriesPart, PURPOSES, SERIES, PACK_VERSION, PACK_CAP_KB, PAID_PACK_KB, PAID_ONLY, FREE_CORE, FREE_HOME, FREE_OUT, TOOLS, loadedParts, TIERS, partsPackOpts, packSize } from '../kit/core/llm-pack.mjs';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { PART_LABELS, partLabel, partDesc, partOrder, standardParts } from '../kit/core/part-labels.mjs';
import { PACK as PACK_DATA } from '../kit/core/llm-pack-data.mjs';
import { guideRules } from '../kit/core/llm-fix.mjs';
import { withOutline, outlineOf } from '../kit/core/llm-outline.mjs';
import { slideChunks, insertSlide, duplicateSlide, deleteSlide, moveSlide, slideTemplate } from '../kit/core/slide-ops.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

// 指示（pack）の無料版・有料版は、今も分野（系列）で組める（node kit/llm-pack.mjs --series・--plan）。下の指示の試験は、前の新規作成の選び方
// （分野の札。無料は 2 つまで。#124 でパーツの一覧に替わった）で組み合わせを数える。ここだけの写し
const FREE_SUBJECT_MAX = 2;
const seriesOfSubjects = (ids) => { const w = new Set(ids || []); return SUBJECTS.filter((x) => w.has(x.id)).map((x) => x.series); };
const freeSubjects = (ids) => { const w = new Set(ids || []); return SUBJECTS.filter((x) => w.has(x.id)).slice(0, FREE_SUBJECT_MAX).map((x) => x.id); };
const seriesForChoice = (c) => seriesOfSubjects(planOf(c) === 'paid' ? (c && c.subjects) : freeSubjects(c && c.subjects));
const toolsForChoice = (c) => {
  const want = new Set((c && c.tools) || []), all = TOOLS.map((x) => x.tag).filter((t) => want.has(t));
  return planOf(c) === 'paid' ? all : all.slice(0, Math.max(0, FREE_SUBJECT_MAX - freeSubjects(c && c.subjects).length));
};
// 外した伝えたいことの行が名前を出すのは、指示に入る部品だけ
const choiceRequest = (c, P, lang) => choiceRequestOf({ ...c, parts: loadedParts(seriesForChoice(c), planOf(c), toolsForChoice(c)) }, P, lang);

ok('categories: Teaching / Research / Business / Guides / Other (no “Academic”); 13 subcategories set the structure', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.label.ja), ['授業・研修', '研究発表', 'ビジネス', '手引き', 'その他']);
  assert.deepEqual(CATEGORIES.map((c) => c.label.en), ['Teaching', 'Research', 'Business', 'Guides', 'Other']);
  assert.ok(!CATEGORIES.some((c) => /学術|Academic/.test(c.label.ja + c.label.en)));
  const subs = CATEGORIES.flatMap((c) => c.subs);
  assert.equal(subs.length, 13);
  assert.ok(subs.every((s) => s.structure.ja && s.structure.en && s.show.ja && s.show.en));
  assert.ok(CATEGORIES.find((c) => c.id === 'business').subs.some((s) => s.label.ja === '紹介・広報'));
  assert.ok(CATEGORIES.find((c) => c.id === 'guides').structure.ja.includes('場面や品目'));
  // 手引き：マニュアル・決まりの説明（規程・法令）・案内（例つき）
  const g = CATEGORIES.find((c) => c.id === 'guides').subs;
  assert.deepEqual(g.map((x) => x.id), ['manual', 'rules', 'info']);
  assert.deepEqual(g.map((x) => x.label.ja), ['マニュアル', '決まりの説明（規程・法令）', '案内（ごみの出し方・図書館・避難・履修登録など）']);
  assert.deepEqual(g.map((x) => x.label.en), ['Manual', 'Rules and regulations', 'Information (waste sorting, library, evacuation, course registration…)']);
  assert.match(g[0].structure.ja, /^目的.*→ 手順を 1 つずつ → つまずきやすいところ$/);
  assert.match(g[1].structure.en, /^what the rules are about → who they apply to and when → what you must do → the original text and its date$/);
  assert.ok(g[1].show.ja.includes('原典') && g[1].show.ja.includes('いつの時点'));
  assert.match(g[2].structure.ja, /^どんな場面か → 品目や場面から引ける一覧 → わからないときの問い合わせ先$/);
  assert.ok(['ごみの分別', '図書館', '避難経路', '新入生', '履修登録'].every((w) => g[2].show.ja.includes(w)));
  assert.match(choiceRequest({ category: 'guides', subcategory: 'rules', purposesOff: [] }, PURPOSES, 'ja'), /^- 場面：手引き／決まりの説明（規程・法令）\n- 構成の型：何についての決まりか/);
  assert.deepEqual(choiceOf(withChoice(null, { category: 'guides', subcategory: 'info' })).subcategory, 'info');
});
ok('parts list (#124): grouped by what to convey, the subject forms last (first for a school lesson), no extra tier, each part once; tiers and sets from the 2.0 manifest', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components-2', `manifest-${TIERS.catalogue}.json`), 'utf8'));
  for (const [t, x] of Object.entries(TIERS.parts)) {
    const c = Object.values(m.components).find((y) => y.tag === t);
    assert.ok(c && c.tier === x.tier && (c.set || undefined) === x.set, t + ': tier and set as in the manifest');
  }
  const list = partsList(null), all = list.flatMap((g) => g.parts);
  assert.equal(new Set(all).size, all.length, 'each part in one place');
  assert.deepEqual([...all].sort(), Object.keys(TIERS.parts).filter((t) => TIERS.parts[t].tier !== 'extra').sort(), 'every standard and specialized part, no extra');
  assert.ok(!all.includes('m-codetree') && !all.includes('m-collect'));
  assert.equal(list[list.length - 1].id, 'subject');
  assert.deepEqual(list[list.length - 1].label, { ja: '教科の形', en: 'For specific subjects' });
  assert.deepEqual(list.at(-1).parts.map((t) => TIERS.parts[t].set), [...list.at(-1).parts].map((t) => TIERS.parts[t].set).sort((a, b) => SUBJECT_SETS.indexOf(a) - SUBJECT_SETS.indexOf(b)));
  assert.ok(list.at(-1).parts.every((t) => SUBJECT_SETS.includes(TIERS.parts[t].set)) && list.at(-1).parts.includes('m-map-japan') && list.at(-1).parts.includes('m-syntax'));
  assert.equal(partsList('class')[0].id, 'subject', 'a school lesson puts the subject forms first');
  // 1 つの道具は 1 か所：木は階層・分類、年表は年表・予定、順位は比べるに入る（into）
  const where = (t) => list.find((g) => g.parts.includes(t)).id;
  assert.equal(where('m-tree'), 'hierarchy'); assert.equal(where('m-timeline'), 'timeline'); assert.equal(where('m-bars'), 'compare'); assert.equal(where('m-hist'), 'spread'); assert.equal(where('m-timer'), 'timebox');
  assert.ok(!list.some((g) => g.id === 'ranking'));
  // まとまりの中は標準が先
  for (const g of list) { const k = g.parts.map((t) => TIERS.parts[t].tier === 'standard' ? 0 : 1); assert.deepEqual(k, [...k].sort(), g.id); }
  for (const t of all) assert.ok(partDesc(t, 'ja') && partDesc(t, 'en'), t + ': a one-line description');
  assert.deepEqual(partsOfSet('stats').sort(), ['m-boxplot', 'm-heatmap', 'm-hist', 'm-seq']);
});
ok('initial ticks (#124 §2.2): every standard part; a specialized set from the subcategory table or the words of step 2 (with the reason); English words on the English screen', () => {
  const std = Object.keys(TIERS.parts).filter((t) => TIERS.parts[t].tier === 'standard');
  assert.deepEqual(initialParts([]).sort(), std.sort());
  assert.deepEqual(recommend({ sub: 'seminar', text: '', lang: 'ja' }), [{ set: 'stats', sub: 'seminar' }]);
  assert.deepEqual(recommend({ sub: 'pitch', lang: 'en' }), [{ set: 'business', sub: 'pitch' }]);
  assert.deepEqual(recommend({ sub: 'info' }), [{ set: 'maps', sub: 'info' }]);
  assert.deepEqual(recommend({ sub: 'training' }), [{ set: 'tools', sub: 'training' }]);
  for (const sub of ['class', 'talk', 'intro', 'manual', 'rules', null]) assert.deepEqual(recommend({ sub }), [], String(sub));
  assert.deepEqual(recommend({ sub: null, text: '孟浩然の漢詩「春暁」', lang: 'ja' }), [{ set: 'kokugo', word: '漢詩' }]);
  assert.deepEqual(recommend({ sub: 'seminar', text: '漢詩とデータ', lang: 'ja' }), [{ set: 'stats', sub: 'seminar' }, { set: 'kokugo', word: '漢詩' }], 'one reason per set, the subcategory first');
  assert.deepEqual(recommend({ text: 'わり算の筆算', lang: 'ja' }).map((r) => r.set), ['math']);
  assert.deepEqual(recommend({ text: 'グループワーク 15 分', lang: 'ja' }), [{ set: 'tools', word: 'グループワーク' }]);
  // 1 字の言葉は、ほかの語の一部では当たらない
  assert.deepEqual(recommend({ text: '俳句と季節の言葉', lang: 'ja' }), []);
  assert.deepEqual(recommend({ text: '国語の時間', lang: 'ja' }).map((r) => r.set), ['kokugo'], '国 in 国語 is not a map word');
  assert.deepEqual(recommend({ text: 'ソースコードの読み方', lang: 'ja' }), []);
  assert.deepEqual(recommend({ text: '関係詞の節', lang: 'ja' }).map((r) => r.set), ['english']);
  assert.deepEqual(recommend({ text: 'てこのはたらき', lang: 'ja' }), []);
  // 英語の画面は英語の表
  assert.deepEqual(recommend({ text: 'Chords on the piano', lang: 'en' }), [{ set: 'music', word: 'Chords' }]);
  assert.deepEqual(recommend({ text: '漢詩', lang: 'en' }), []);
  assert.deepEqual(recommend({ text: 'Mapping the database', lang: 'en' }), [], 'whole words only');
  assert.deepEqual(initialParts([{ set: 'stats', sub: 'seminar' }]).filter((t) => TIERS.parts[t].tier !== 'standard').sort(), ['m-boxplot', 'm-heatmap', 'm-hist', 'm-seq']);
  for (const [lang, sets] of Object.entries(WORDS)) for (const set of Object.keys(sets)) assert.ok(partsOfSet(set).length, `${lang} ${set}: a set with parts`);
  for (const sets of Object.values(SUB_SETS)) for (const set of sets) assert.ok(partsOfSet(set).length, set);
});
ok('AI plan: free (default) and paid change only the suggested size limit; the chosen parts make the pack; over the limit, candidates to untick', () => {
  assert.deepEqual(AI_PLANS, ['free', 'paid']);
  assert.equal(DEFAULT_PLAN, 'free');
  assert.equal(planOf({}), 'free'); assert.equal(planOf({ plan: 'paid' }), 'paid'); assert.equal(planOf({ plan: 'gold' }), 'free'); assert.equal(planOf(null), 'free');
  assert.equal(capKb('free'), PACK_CAP_KB.free.one); assert.equal(capKb('paid'), PAID_PACK_KB);
  assert.equal(PAID_PACK_KB, 120); assert.equal(PACK_CAP_KB.paid, PAID_PACK_KB);
  assert.equal(LIMITS.fail, PACK_CAP_KB.free.one); assert.equal(LIMITS.two, PACK_CAP_KB.free.two); assert.equal(LIMITS.paid, PAID_PACK_KB);
  assert.equal(PAIRS.length, SERIES.length * (SERIES.length - 1) / 2);
  // 選んだパーツだけが説明に入り、選ばないパーツはどこにも名前が出ない
  const described = (text) => [...text.matchAll(/^### `<(m-[a-z]+(?:-[a-z]+)*)>`/gm)].map((x) => x[1]).sort();
  for (const lang of ['en', 'ja']) for (const tags of [initialParts([]), ['m-bars', 'm-hist', 'm-timer'], ['m-kanbun', 'm-flow'], []]) {
    const text = packWithRequest({ ...partsPackOpts(tags), lang });
    assert.deepEqual(described(text), [...tags].sort(), `${lang} ${tags.join('+')}`);
    for (const t of Object.keys(PACK_DATA.en.components).filter((x) => !tags.includes(x))) assert.ok(!new RegExp(t + '(?![a-z-])').test(text), `${lang} ${tags.join('+')}: ${t} is named`);
  }
  assert.deepEqual(partsPackOpts(['m-hist', 'm-timer', 'm-bars']).series, ['academic']);
  // 外す候補：越えた分に届くまで、大きい順。keep は候補にしない。越えなければなし
  const sizeOf = (tags) => packSize(packWithRequest({ ...partsPackOpts(tags), lang: 'ja' }));
  const std = initialParts([]);
  assert.deepEqual(trimCandidates(std, { sizeOf, capBytes: 1e9 }), []);
  const c = trimCandidates(std, { sizeOf, capBytes: 40 * 1024, keep: new Set(['m-timeline']) });
  assert.ok(c.length && !c.includes('m-timeline'), c.join());
  const rest = std.filter((t) => !c.includes(t));
  assert.ok(sizeOf(rest) <= 40 * 1024 + 2048, `after the candidates: ${sizeOf(rest)} B`);
  assert.ok(sizeOf(rest.concat()) < sizeOf(std));
});
ok('part labels: every vendored part has a ja/en name, an icon and a one-line description; the standard parts are FREE_CORE’s labels', () => {
  for (const t of Object.keys(PACK_DATA.en.components)) assert.ok(PART_LABELS[t] && PART_LABELS[t].ja && PART_LABELS[t].en && PART_LABELS[t].icon && PART_LABELS[t].desc, t);
  // 絵の名前はどれも app/llm.js の ICONS にある
  const llmSrc = fs.readFileSync(path.join(ROOT, 'app', 'llm.js'), 'utf8');
  const iconsBlock = llmSrc.slice(llmSrc.indexOf('const ICONS = {'), llmSrc.indexOf('};', llmSrc.indexOf('const ICONS = {')));
  const ICON_KEYS = new Set([...iconsBlock.matchAll(/^\s+'?([\w-]+)'?: '</gm)].map((m) => m[1]));
  for (const [t, x] of Object.entries(PART_LABELS)) assert.ok(ICON_KEYS.has(x.icon), `${t}: icon "${x.icon}" is drawn in app/llm.js ICONS`);
  assert.deepEqual(standardParts('ja'), ['棒グラフ', '流れ図', '目次', '予想と答え']);
  assert.equal(partLabel('m-new-thing', 'ja'), 'm-new-thing');
  assert.equal(partDesc('m-new-thing', 'ja'), '');
  assert.deepEqual(partOrder(['m-venn', 'm-menu', 'm-bars', 'm-zzz', 'm-flow']), ['m-bars', 'm-flow', 'm-menu', 'm-venn', 'm-zzz']);
  assert.deepEqual(SUBJECTS.map((s) => s.series), SERIES, 'the insert page still names the subjects');
  for (const x of SUBJECTS) assert.ok(x.label.ja && x.label.en && x.inside.ja && x.inside.en, x.id);
});
ok('request section: kind, structure and presentation of the subcategory, and the purposes turned off', () => {
  const r = choiceRequest({ category: 'research', subcategory: 'conference', purposesOff: [] }, PURPOSES, 'ja');
  assert.equal(r, '- 場面：研究発表／学会の口頭発表\n- 構成の型：背景 → 目的 → 方法 → 結果 → 考察 → 結論（背景・方法・結果でおよそ 3 分の 1 ずつ）\n- 見せ方：見出しは主張の文、図が証拠。箇条書きを減らす。1 分に 1 枚ほど');
  assert.equal(choiceRequestOf({ category: 'research', subcategory: 'conference' }, null, 'ja'), r, 'the new-lesson page passes no purposes');
  const e = choiceRequest({ category: 'guides', subcategory: null, purposesOff: ['key-number', 'process'] }, PURPOSES, 'en');
  // 小分類の「この中にない」（null）：場面の行だけで、構成の型・見せ方は書かない
  assert.match(e, /^- Kind: Guides\n- Purposes turned off/);
  assert.equal(choiceRequest({ category: 'teaching', subcategory: null, purposesOff: [] }, PURPOSES, 'ja'), '- 場面：授業・研修');
  // 名前を出すのは組み立てに入る部品だけ
  assert.match(e, /- Purposes turned off by the author: one key number, steps of a process\. Do not use their representations \(`m-flow`\)\./i);
  assert.match(choiceRequest({ category: 'guides', subjects: ['business'], purposesOff: ['key-number', 'process'] }, PURPOSES, 'en'), /their representations \(`m-flow`, `m-kpi`\)\./);
  assert.match(choiceRequest({ plan: 'paid', purposesOff: ['timeline'] }, PURPOSES, 'en'), /\(`m-timeline`\)/);
  assert.ok(!choiceRequest({ plan: 'free', subjects: ['math', 'business', 'kokugo', 'info'], purposesOff: ['timeline'] }, PURPOSES, 'en').includes('m-timeline'));
  assert.equal(choiceRequest({ category: null, purposesOff: [] }, PURPOSES, 'en'), '');
  assert.equal(choiceRequest({ category: 'other', purposesOff: [] }, PURPOSES, 'ja'), '');
});

const FIX = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'components-manifest-purposes.json'), 'utf8'));
const TILE_IDS = ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents', 'spatial'];
// 部品庫 v1.7.0 から：16 個目の札 predict「予想して確かめる」（決めた表 TILES は v1.6.0 の 15 個のまま。tile のない前の manifest に predict はない）
const OWN_IDS = ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents', 'predict', 'spatial'];
ok('purposes: the tiles are the vendored manifest\'s own purposes (16), with their label, examples and icon; the fallback table TILES (15) reads the same', () => {
  assert.equal(TILES.length, 15);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components', 'manifest.json'), 'utf8'));
  const own = man.purposes.filter((p) => p.tile === 'own' && !p.reserved);
  assert.equal(own.length, 16);
  assert.equal(PURPOSES.tiles, 'manifest');
  assert.deepEqual(PURPOSES.list.map((p) => p.id), own.map((p) => p.id));
  for (const p of own) {
    const t = PURPOSES.list.find((x) => x.id === p.id), f = TILES.find((x) => x.id === p.id);
    assert.deepEqual([t.label, t.sub, t.icon], [p.label, p.examples, p.icon], p.id + ': label, examples and icon from the manifest');
    if (p.id === 'predict') { assert.ok(!f, 'predict is not in the fallback table'); continue; }
    if (p.id === 'spread') continue;   // 部品庫 v1.9.0 で札の小さな字が変わった（箱ひげ図・ドットプロット）。決めた表は v1.6.0 のまま
    assert.deepEqual([{ ...f.label }, { ...f.sub }], [{ ...p.label }, { ...p.examples }], p.id + ': the fallback table reads the same');
  }
  assert.deepEqual(PURPOSES.list.find((p) => p.id === 'compare').ids, ['compare', 'ranking'], 'ranking folds into compare');
  assert.deepEqual(PURPOSES.list.find((p) => p.id === 'spatial').label, { ja: '場所・地図', en: 'Place / map' });
  assert.ok(!PURPOSES.list.some((p) => ['grouping', 'parameter', 'text-structure', 'deviation', 'concept-links'].some((id) => p.ids.includes(id))), 'tile "none" and reserved ids make no tile and join none');
  assert.deepEqual(PURPOSES.components['m-map-japan'], ['spatial']);
  assert.deepEqual(PURPOSES.list.map((p) => p.id), OWN_IDS);
  assert.deepEqual(PURPOSES.list.find((p) => p.id === 'predict').label, { ja: '予想して確かめる', en: 'Predict, then check' });
  assert.ok(!PURPOSES.list.some((p) => p.ids.includes('timebox')), 'timebox has no tile');
  assert.equal(PURPOSES.source, 'manifest');
  assert.equal(PURPOSES.list[0].label.ja, '比べる（量・特徴）'); assert.equal(PURPOSES.list[0].label.en, 'Compare (amounts, features)');
  assert.ok(!JSON.stringify(PURPOSES.list).includes('＊'), 'no star markers');
  // m-bars は 3 つの札に使う：全部外したときだけ使わせない。m-codetree は階層と手順
  assert.deepEqual(componentsOff(['compare', 'change'], PURPOSES), ['m-compare', 'm-curves', 'm-numberline']);
  assert.deepEqual(componentsOff(['compare', 'change', 'part-whole'], PURPOSES), ['m-bars', 'm-compare', 'm-curves', 'm-market', 'm-numberline', 'm-pie', 'm-tape']);
  assert.deepEqual(componentsOff(['process'], PURPOSES), ['m-flow', 'm-hissan', 'm-kakijun']);
  assert.deepEqual(componentsOff([], PURPOSES), []);
  // 札のない言いたいことの部品（m-kanbun・m-sweep・m-collect など）は外せない（分野から入る）
  assert.ok(!['m-kanbun', 'm-kobun', 'm-gendai', 'm-sweep', 'm-collect'].some((t) => PURPOSES.components[t]));
});
ok('purposes: an older manifest without tile fields (all 20 ids, ranking, reserved, an unknown id) maps onto exactly the 15 tiles of the table; ranking folds into compare; unmapped ids warn and make no tile', () => {
  const m = FIX();
  assert.equal(m.purposes.length, 21);
  const P = purposesFrom(m);
  assert.equal(P.source, 'manifest');
  assert.equal(P.tiles, 'table');
  assert.ok(P.warnings.some((w) => /no tile fields/.test(w)), 'gen warns that the table is used');
  assert.deepEqual(P.list.map((p) => p.id), TILE_IDS, 'exactly the 15 tiles, in the decided order');
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
  assert.deepEqual(P.list.map((p) => p.id), TILE_IDS, 'all 15 tiles remain');
  assert.deepEqual(P.list.find((p) => p.id === 'change').steps, TILES.find((t) => t.id === 'change').steps, 'a dropped id falls back per tile');
  assert.equal(P.list.find((p) => p.id === 'cycle').name.ja, '循環', 'a reserved ("yes") id keeps the decided text');
  assert.ok(P.warnings.some((w) => /purposes\[2\] dropped/.test(w)) && P.warnings.some((w) => /purposes\[21\] dropped \(not an object\)/.test(w)) && P.warnings.some((w) => /duplicate id/.test(w)));
  assert.equal(purposesFrom({ purposes: 'x' }).source, 'fallback');
  assert.equal(purposesFrom(null).source, 'fallback');
});
ok('pack from the fixture manifest (generate): 15 table rows with manifest steps, no reserved or unmapped row, warnings printed', () => {
  const g = generate({ manifest: FIX() });
  assert.deepEqual(g.data.purposes.list.map((p) => p.id), TILE_IDS);
  assert.ok(g.warnings.some((w) => w.includes('"mystery" has no tile')));
  const t = assemble(g.data, { series: 'all', lang: 'en' });
  const table = t.slice(t.indexOf('| purpose |'), t.indexOf('Each part'));
  assert.equal(table.trim().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| purpose') && !l.startsWith('|---')).length, 16, '15 rows + other parts');
  assert.match(table, /^\| Compare amounts \| `m-bars` \(sorted for ranking\) \| One side, then the difference \|$/m);
  assert.ok(!/Deviation|Concept links|Mystery|Ranking/.test(table));
});

ok('purposes: a tile turns off its "into" ids too (ranking via compare); spatial and m-map-japan never leak when turned off (free with social, paid); spatial has a part only when social is loaded', () => {
  // into：外した札に入る id だけの部品も外れる
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components', 'manifest.json'), 'utf8'));
  const P = purposesFrom({ ...m, components: { ...m.components, rankonly: { purposes: ['ranking'] } } });
  assert.deepEqual(P.components['m-rankonly'], ['compare'], 'ranking maps to the compare tile');
  assert.ok(componentsOff(['compare'], P).includes('m-rankonly') && !componentsOff(['change'], P).includes('m-rankonly'));
  assert.ok(componentsOff(['compare'], PURPOSES).includes('m-compare'));
  assert.ok(!/m-compare(?![a-z-])/.test(packWithRequest({ lang: 'en', plan: 'paid', exclude: componentsOff(['compare'], PURPOSES), off: ['compare'] })), 'paid, compare off: m-compare is gone');
  assert.deepEqual(componentsOff(['spatial'], PURPOSES), ['m-map-japan', 'm-map-world']);
  for (const lang of ['en', 'ja']) {
    for (const [what, opts] of [['free+social', { series: ['social'], plan: 'free' }], ['free+social+kokugo', { series: ['social', 'kokugo'], plan: 'free' }], ['paid+social', { series: ['social'], plan: 'paid' }]]) {
      const on = packWithRequest({ ...opts, lang });
      assert.ok(on.includes('### `<m-map-japan>`') && /^\| [^|]+ \| `m-map-japan`/m.test(on), `${lang} ${what}: spatial on → m-map-japan is described and backs the spatial row`);
      const off = packWithRequest({ ...opts, lang, exclude: componentsOff(['spatial'], PURPOSES), off: ['spatial'] });
      assert.ok(!off.includes('map-japan'), `${lang} ${what}: spatial off → m-map-japan is named nowhere`);
      assert.ok(!off.includes(PURPOSES.list.find((p) => p.id === 'spatial').name[lang] + ' |'), `${lang} ${what}: spatial off → no spatial row`);
    }
    // social が入っていない：場所・地図の行はパーツなし（AI が HTML で描く）、m-map-japan の名前は出さない
    const name = PURPOSES.list.find((p) => p.id === 'spatial').name[lang];
    for (const opts of [{ series: [] }, { series: ['academic', 'kokugo'] }]) {
      const t = packWithRequest({ ...opts, lang });
      assert.ok(!t.includes('map-japan'), `${lang} ${opts.series.join('+') || 'common'}: m-map-japan is not named without social`);
      assert.ok(new RegExp('^\\| ' + name.replace(/[()/]/g, '\\$&') + ' \\| ' + (lang === 'ja' ? 'この文にはない' : 'not in this text')).test(t.split('\n').find((l) => l.startsWith('| ' + name + ' |')) || ''), `${lang}: the spatial row has no part without social`);
    }
  }
});

const tagsIn = (text) => new Set([...text.matchAll(/m-[a-z]+(?:-[a-z]+)*(?![a-z-])/g)].map((m) => m[0]));
ok(`pack ${PACK_VERSION}: the purpose table is built at assembly from the included packs, never names a part without its description, and has no star markers`, () => {
  for (const lang of ['en', 'ja']) {
    const all = buildPack({ series: 'all', lang });
    assert.ok(all.includes('**R-purpose**') && all.includes('**R-whole**'), lang + ': standards');
    assert.ok(guideRules(all).has('R-purpose') && guideRules(all).has('R-whole'), lang + ': fix requests can quote them');
    assert.match(all, /https:\/\/github\.com\/egatari\/components\/blob\/v\d+\.\d+\.\d+\/components\/<(name|名前)>\/README\.md/, lang + ': pinned URL');
    // 有料版：すべての部品が表と説明にある。無料版（全部の分野でも）：有料版だけの部品はどこにも名前が出ない
    const paid = buildPack({ series: 'all', tools: 'all', lang, plan: 'paid' });
    // 部品の名前は固定の表から（vendor/components は中身の hash ごとのフォルダ：#138）
    for (const d of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8')).components).filter(([, c]) => c.catalogue !== '2').map(([n]) => n))
      assert.ok(paid.includes('`m-' + d + '`') && paid.includes('### `<m-' + d + '>`'), `${lang}: m-${d} is in the table and described in the paid pack`);
    assert.deepEqual(PAID_ONLY, ['m-boxplot', 'm-compare', 'm-cycle', 'm-fishbone', 'm-heatmap', 'm-hissan', 'm-hist', 'm-kakijun', 'm-map-world', 'm-numberline', 'm-pie', 'm-scatter', 'm-tape', 'm-timeline', 'm-tree', 'm-venn']);
    assert.deepEqual(TOOLS.map((t) => t.tag), ['m-timer'], 'tools are not paid only: they come in on either plan when ticked');
    assert.ok(!/m-timer/.test(all), lang + ': an unticked tool is not named in the free pack');
    for (const t of PAID_ONLY) assert.ok(!new RegExp(t + '(?![a-z-])').test(all), `${lang}: ${t} is not named in the free pack`);
    assert.ok(!/＊/.test(all) && !/ \*(?= \||,|$)/m.test(all.slice(all.indexOf('### 2.7'), all.indexOf('### 2.8'))), lang + ': no star markers');
    // 系列を選ばない：表が指すのは共通の部品だけ（説明がないものは名前を出さない）。入っていない系列は何に使えるかだけ
    const core = buildPack({ series: [], lang });
    for (const t of ['m-curves', 'm-quad', 'm-market', 'm-kpi', 'm-seq', 'm-kanbun']) assert.ok(!core.includes(t), `${lang}: no series chosen → ${t} is not named`);
    assert.ok(lang === 'en' ? /Packs not included here have parts for: academic \(change over time, spread\); business/i.test(core) : /入っていない系列にもパーツがある：academic（時間での変化・ばらつき）/.test(core), lang + ': the packs not included are named by use');
    for (const s of SERIES) {
      const p = buildPack({ series: [s], lang });
      const described = new Set([...p.matchAll(/### `<(m-[a-z]+(?:-[a-z]+)*)>`/g)].map((m) => m[1]));
      for (const t of tagsIn(p.slice(p.indexOf('### 2.7'), p.indexOf('### 2.8')))) assert.ok(described.has(t), `${lang} ${s}: the table names ${t}, which is described`);
    }
  }
  const en = buildPack({ series: 'all', lang: 'en' });
  assert.match(en, /^\| change over time \| `m-curves` \(academic\), `m-bars` \(few points\) \| one line at a time \|$/mi);
  // 無料版：有料版だけの部品（m-timeline など）の行は「この文にはない」（名前は出さない）。有料版はその部品を挙げる
  assert.match(en, /^\| timeline, schedule \| not in this text: the nearest part, or HTML or inline SVG \| one event at a time \|$/mi);
  assert.match(buildPack({ series: 'all', tools: 'all', lang: 'en', plan: 'paid' }), /^\| timeline, schedule \| `m-timeline` \| one event at a time \|$/mi);
  assert.match(buildPack({ series: [], lang: 'en' }), /^\| change over time \| `m-bars` \(few points\) \| one line at a time \|$/mi);
  assert.match(buildPack({ series: [], lang: 'en' }), /^\| one key number \| not in this text: the nearest part, or HTML or inline SVG \| whole at once \|$/mi);
  assert.match(en, /Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn/);
  // 大きさ：生成した指示（頼みたいことは記入欄のまま）は 1 つの分野なら LIMITS.fail、2 つの組なら LIMITS.two KB まで。写す文（内容・場面の節が入る）の上限ではない
  for (const lang of ['en', 'ja']) {
    for (const s of SERIES) assert.ok(Buffer.byteLength(buildPack({ series: [s], lang })) <= LIMITS.fail * 1024, `${lang} generated pack ${s} ≤ ${LIMITS.fail} KB`);
    for (const p of PAIRS) assert.ok(Buffer.byteLength(buildPack({ series: p, lang })) <= LIMITS.two * 1024, `${lang} generated pack ${p.join('+')} ≤ ${LIMITS.two} KB`);
  }
  // 系列の見本は抜き出し（部品を使うスライドだけ。骨組みは共通の見本）
  const biz = seriesPart('business', 'en');
  assert.ok(biz.includes('```deck.html\n<section class="slide">') && !biz.includes('<!DOCTYPE html>') && biz.includes('<m-kpi') && !biz.includes('<m-bars orient'));
  assert.ok(!/<!--\/?part/.test(en), 'no part markers left');
});
// 無料版で選べる分野の組：なし・1 つずつ・2 つの組のどれも（3 つ以上は選べない。前の記録の 3 つ以上は初めの 2 つになる：freeSubjects）
const FREE_SETS = [[], ...SUBJECTS.map((s) => [s.id]), ...SUBJECTS.flatMap((a, i) => SUBJECTS.slice(i + 1).map((b) => [a.id, b.id]))];
// 無料版：分野なし・1 つずつ・2 つの組。有料版：選んだ分野（数は限らない）と道具（seriesForChoice・toolsForChoice）
const PLAN_CHOICES = [
  ...FREE_SETS.map((subjects) => ({ plan: 'free', subjects })),
  { plan: 'paid', subjects: [] }, { plan: 'paid', subjects: ['kokugo'] }, { plan: 'paid', subjects: ['math', 'social'], tools: ['m-timer'] },
];
// 無料版で読み込む部品：FREE_CORE、FREE_HOME の部品はその系列から、系列の部品はその系列から（有料版だけの部品はない）
const partsIn = (text) => [...tagsIn(text)].filter((t) => PACK_DATA.en.components[t]);
const loadedFree = (series) => new Set(Object.keys(PACK_DATA.en.components).filter((t) => {
  if (FREE_OUT.includes(t)) return false;
  const s = FREE_HOME[t] || PACK_DATA.en.components[t].series;
  return s === 'common' ? FREE_CORE.includes(t) : series.includes(s);
}));
ok('free plan: FREE_CORE is the v1.1.0 common set plus m-predict; m-curves, m-kpi and m-quad come only with their v1.1.0 subjects; the newer common parts and FREE_OUT are paid only', () => {
  assert.deepEqual([...FREE_CORE], ['m-bars', 'm-flow', 'm-menu', 'm-predict'], 'the v1.1.0 common set and m-predict (components v1.9.1)');
  assert.deepEqual([...FREE_OUT], ['m-boxplot', 'm-heatmap', 'm-hissan', 'm-hist', 'm-kakijun', 'm-map-world', 'm-numberline', 'm-tape']);
  for (const t of FREE_OUT) assert.equal(PACK_DATA.en.components[t].series, ({ 'm-kakijun': 'kokugo', 'm-map-world': 'social' })[t] || 'academic', t + ' is in its series in the vendored release');
  // 音楽（部品庫 v1.11.0）：m-keyboard は無料版の music の指示に入る（FREE_OUT でない）。m-kakijun は国語でも無料版に名前を出さない。英語（v1.12.0）：m-syntax は無料版の english に入る
  for (const lang of ['en', 'ja']) {
    assert.ok(buildPack({ series: ['music'], lang }).includes('### `<m-keyboard>`') && !buildPack({ series: [], lang }).includes('m-keyboard'), lang + ': m-keyboard comes with the free music pack only');
    assert.ok(buildPack({ series: ['english'], lang }).includes('### `<m-syntax>`') && !buildPack({ series: [], lang }).includes('m-syntax'), lang + ': m-syntax comes with the free english pack only');
    assert.ok(!buildPack({ series: ['kokugo'], lang }).includes('m-kakijun') && buildPack({ series: ['kokugo'], lang, plan: 'paid' }).includes('### `<m-kakijun>`'), lang + ': m-kakijun is paid only');
  }
  assert.deepEqual({ ...FREE_HOME }, { 'm-curves': 'academic', 'm-kpi': 'business', 'm-quad': 'business' });
  for (const t of Object.keys(FREE_HOME)) assert.equal(PACK_DATA.en.components[t].series, 'common', t + ' is common in the vendored release');
  for (const lang of ['en', 'ja']) {
    const core = buildPack({ series: [], lang });
    for (const t of partsIn(core)) assert.ok(FREE_CORE.includes(t), `${lang} free common only names ${t}`);
    const biz = buildPack({ series: ['business'], lang }), aca = buildPack({ series: ['academic'], lang });
    assert.ok(biz.includes('### `<m-kpi>`') && biz.includes('### `<m-quad>`') && !biz.includes('m-curves'));
    assert.ok(aca.includes('### `<m-curves>`') && !aca.includes('m-kpi') && !aca.includes('m-quad'));
    for (const t of PAID_ONLY) assert.ok(!buildPack({ series: 'all', lang }).includes(t) && buildPack({ series: 'all', tools: 'all', lang, plan: 'paid' }).includes('### `<' + t + '>`'), t);
  }
});
const capOk = (choice, bytes) => {
  const ss = seriesForChoice(choice);
  if (planOf(choice) === 'paid') return bytes <= PACK_CAP_KB.paid * 1024;
  if (ss.length > FREE_SUBJECT_MAX) return false;
  return bytes <= (ss.length === 2 ? PACK_CAP_KB.free.two : PACK_CAP_KB.free.one) * 1024;
};
ok('caps per AI plan with all purposes on: free ≤ 40 KB with one subject and ≤ 50 KB for every pair; paid (any two subjects and every tool) ≤ PAID_PACK_KB', () => {
  for (const lang of ['en', 'ja']) {
    for (const subjects of FREE_SETS) {
      const choice = { plan: 'free', subjects };
      const b = Buffer.byteLength(buildPack({ series: seriesForChoice(choice), lang, plan: 'free' }));
      assert.ok(capOk(choice, b), `${lang} free ${choice.subjects.join('+') || '(none)'}: ${b} B`);
    }
    // 道具は分野と合わせて 2 つに数える：道具だけは 1 つの上限、分野＋道具は 2 つの組の上限
    for (const t of TOOLS.map((x) => x.tag)) for (const subjects of [[], ...SUBJECTS.map((x) => [x.id])]) {
      const choice = { plan: 'free', subjects, tools: [t] };
      const b = Buffer.byteLength(buildPack({ series: seriesForChoice(choice), tools: toolsForChoice(choice), lang, plan: 'free' }));
      assert.ok(b <= (subjects.length ? PACK_CAP_KB.free.two : PACK_CAP_KB.free.one) * 1024, `${lang} free ${subjects.join('+') || '(none)'} + ${t}: ${b} B`);
    }
    // 前の記録が全部の分野を持っていても、無料版の指示は初めの 2 つ（数理・統計＋ビジネス）
    const every = { plan: 'free', subjects: SUBJECTS.map((s) => s.id) };
    assert.equal(buildPack({ series: seriesForChoice(every), lang, plan: 'free' }), buildPack({ series: ['academic', 'business'], lang, plan: 'free' }));
    // 有料版：ふつうの組（どの 2 つの分野＋すべての道具）は上限の中。すべての分野と道具（いちばん大きいとき）は gen が知らせるだけ
    for (const p of PAIRS) {
      const choice = { plan: 'paid', subjects: SUBJECTS.filter((x) => p.includes(x.series)).map((x) => x.id), tools: TOOLS.map((t) => t.tag) };
      const b = Buffer.byteLength(buildPack({ series: seriesForChoice(choice), tools: toolsForChoice(choice), lang, plan: 'paid' }));
      assert.ok(capOk(choice, b), `${lang} paid ${p.join('+')} + every tool: ${b} B`);
    }
    const paid = buildPack({ series: seriesForChoice({ plan: 'paid' }), lang, plan: 'paid' });
    for (const s of SERIES) assert.ok(!paid.includes(lang === 'en' ? `## Series pack: ${s}` : `## 系列の指示：${s}`), `${lang} paid without a subject has no series pack ${s}`);
    const rep = sizeReport(generate().sizes).find((x) => x.lang === lang && x.worst);
    assert.ok(rep && rep.level === (rep.kb > PAID_PACK_KB ? 'warn' : 'ok'), `${lang} paid worst case is a warning only: ${rep && rep.kb}`);
  }
});
ok('pack: paid = every common part + the chosen subjects + the chosen tools; free = FREE_CORE + FREE_HOME and the chosen subjects (two at most); a tool goes in only when ticked; nothing unticked leaks', () => {
  const common = Object.keys(PACK_DATA.en.components).filter((t) => PACK_DATA.en.components[t].series === 'common');
  const tools = TOOLS.map((t) => t.tag);
  const described = (text) => new Set([...text.matchAll(/^### `<(m-[a-z]+(?:-[a-z]+)*)>`/gm)].map((m) => m[1]));
  for (const lang of ['en', 'ja']) {
    for (const choice of [{ plan: 'paid', subjects: [] }, { plan: 'paid', subjects: ['kokugo'] }, { plan: 'paid', subjects: ['math', 'business', 'kokugo', 'info'] }, { plan: 'paid', subjects: ['social'], tools },
      { plan: 'free', subjects: [] }, { plan: 'free', subjects: ['math'] }, { plan: 'free', subjects: ['kokugo', 'social'], tools }, { plan: 'free', subjects: ['info', 'kokugo', 'math'] }]) {
      const series = seriesForChoice(choice), plan = planOf(choice), on = toolsForChoice(choice);
      const text = packWithRequest({ series, tools: on, lang, plan });
      const want = new Set(Object.keys(PACK_DATA.en.components).filter((t) => {
        if (tools.includes(t)) return on.includes(t);
        const s = PACK_DATA.en.components[t].series;
        return plan === 'paid' ? s === 'common' || series.includes(s) : loadedFree(series).has(t);
      }));
      const what = `${lang} ${plan} ${choice.subjects.join('+') || '(none)'}${on.length ? ' + ' + on.join('+') : ''}`;
      assert.deepEqual([...described(text)].sort(), [...want].sort(), what + ': described parts');
      assert.deepEqual(loadedParts(series, plan, on).sort(), [...want].sort(), what + ': loadedParts (the strip) is the pack catalog');
      if (plan === 'paid') for (const t of common.filter((x) => !tools.includes(x))) assert.ok(want.has(t), what + ': every common part ' + t);
      if (plan === 'free') assert.ok(series.length <= FREE_SUBJECT_MAX, what + ': two at most');
      // 選んでいない分野・道具のパーツは、どこにも名前が出ない
      for (const t of Object.keys(PACK_DATA.en.components).filter((x) => !want.has(x))) assert.ok(!new RegExp(t + '(?![a-z-])').test(text), `${what}: ${t} (not chosen) is named`);
    }
    // 道具は押したときだけ：同じ選び方で道具だけ違えば、違いは道具のパーツの説明と表
    for (const plan of ['free', 'paid']) {
      const without = buildPack({ series: ['academic'], lang, plan }), withT = buildPack({ series: ['academic'], tools: ['timer'], lang, plan });
      assert.ok(!without.includes('m-timer') && withT.includes('### `<m-timer>`'), `${lang} ${plan}: m-timer only when ticked`);
    }
  }
  assert.throws(() => buildPack({ tools: ['m-nothing'] }), /unknown tool/);
  assert.deepEqual(toolsFrom(null), []);
  assert.deepEqual(TOOLS[0].tile, { label: { ja: 'タイマー', en: 'Timer' }, examples: { ja: 'グループワークの時間・残り時間・ベル', en: 'Group-work time, time left, bells' }, icon: 'timer' }, 'the tool tile comes from the manifest');
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
      const plan = planOf(choice);
      assert.ok(capOk(choice, Buffer.byteLength(buildPack({ series, lang, exclude: ex, off, plan }))), `${lang} ${plan} ${JSON.stringify(series)} off ${off.join('+')}: over the cap`);
      plans.add(plan);
      const req = choiceRequest({ ...choice, category: 'research', subcategory: 'conference', purposesOff: off }, PURPOSES, lang);
      const whole = packWithRequest({ series, lang, request: '# R\n\n' + req, exclude: ex, off, plan });
      // 無料版：読み込んだ部品（FREE_CORE と、選んだ分野の部品・FREE_HOME）のほかは、どこにも名前が出ない（「使わない」の行も含めて）
      if (plan === 'free') for (const t of partsIn(whole)) assert.ok(loadedFree(series).has(t), `${lang} free ${JSON.stringify(series)} off ${off.join('+')}: ${t} is named but not loaded`);
      const lines = whole.split('\n');
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
// 無料版の写す文が名前を出す部品（m-…）は、その文の部品の一覧（§3 の表の行か ### の説明）にあるものだけ。
// 一覧から外した部品の名前を、説明や注意の文が出してしまう（これから足す文で起きやすい）のを見つける。CSS の変数（--mm-h）などは数えない
const namedParts = (text) => new Set([...text.matchAll(/(?<![\w-])m-[a-z]+(?:-[a-z]+)*(?![a-z-])/g)].map((m) => m[0]));
const catalogOf = (text) => new Set([...text.matchAll(/^(?:\| `<|### `<)(m-[a-z]+(?:-[a-z]+)*)>`/gm)].map((m) => m[1]));
const notInCatalog = (text) => { const c = catalogOf(text); return [...namedParts(text)].filter((t) => !c.has(t)); };
ok('gen: a pack over its cap is named (plan, language, subjects) with the bytes over and its three largest sections', () => {
  const g = generate();
  const rep = sizeReport(g.sizes);
  assert.ok(!rep.some((x) => x.plan === 'free' && /all/.test(x.what)), 'no free row for every subject');
  // 無料版の道具：道具だけ（40 KB）と、どの分野＋道具（50 KB）も止まる行
  for (const lang of ['en', 'ja']) for (const t of TOOLS.map((x) => x.tag)) {
    const alone = rep.find((y) => y.lang === lang && y.what === 'free common+' + t);
    assert.ok(alone && alone.max === 40 && alone.level === 'ok', `${lang} free ${t} alone`);
    for (const s of SERIES) { const x = rep.find((y) => y.lang === lang && y.what === `free common+${s}+${t}`); assert.ok(x && x.toolPair && x.max === 50 && x.level === 'ok', `${lang} free ${s} + ${t}`); }
  }
  // 有料版：どの 2 つの分野＋すべての道具は 120 KB で止まる行、すべての分野と道具は知らせるだけの行
  for (const lang of ['en', 'ja']) {
    for (const p of PAIRS) { const x = rep.find((y) => y.lang === lang && y.what === `paid common+${p.join('+')}+tools`); assert.ok(x && x.paidPair && x.max === 120 && x.level === 'ok', `${lang} paid ${p.join('+')}`); }
    const w = rep.find((y) => y.lang === lang && y.worst);
    assert.ok(w && w.what === 'paid all subjects+tools' && w.max === 120 && w.level !== 'fail', `${lang} paid worst case never fails`);
  }
  // 1 つの分野のどれも（40 KB）、2 つの組のどれも（50 KB）、ja と en で
  for (const lang of ['en', 'ja']) {
    for (const s of SERIES) assert.equal(rep.find((x) => x.lang === lang && x.what === 'free common+' + s).max, 40);
    for (const p of PAIRS) { const x = rep.find((y) => y.lang === lang && y.what === 'free common+' + p.join('+')); assert.ok(x && x.pair && x.max === 50 && x.level === 'ok', `${lang} ${p.join('+')}`); }
  }
  const r = rep.find((x) => x.lang === 'ja' && x.what === 'free common+academic+kokugo');
  const m = overMessage({ ...r, max: 40 }, g.data);
  const bytes = Buffer.byteLength(buildPack({ series: ['academic', 'kokugo'], lang: 'ja' }));
  assert.match(m, new RegExp(`^pack over the cap: plan free, lang ja, subjects academic\\+kokugo: ${bytes} B, ${bytes - 40 * 1024} B over 40 KB \\(40960 B\\)\\. Largest sections: `));
  assert.equal((m.split('Largest sections: ')[1].match(/\(\d+ B\)/g) || []).length, 3, m);
});
ok('free packs name no part outside their own catalog: no subject, every single subject and every pair × en/ja, and the sweep over purposes turned off', () => {
  let n = 0;
  for (const lang of ['en', 'ja']) for (const subjects of FREE_SETS) {
    const series = seriesOfSubjects(subjects);
    const t = packWithRequest({ series, lang, plan: 'free' });
    assert.deepEqual(notInCatalog(t), [], `${lang} free ${series.join('+') || '(none)'}`);
    n++;
  }
  const ids = PURPOSES.list.map((p) => p.id);
  const sets = [...ids.map((i) => [i])];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) sets.push([ids[i], ids[j]]);
  sets.push(ids);
  for (const off of sets) {
    const ex = componentsOff(off, PURPOSES);
    for (const lang of ['en', 'ja']) for (const choice of PLAN_CHOICES.filter((c) => c.plan === 'free')) {
      const series = seriesForChoice(choice);
      const req = choiceRequest({ ...choice, category: 'research', subcategory: 'conference', purposesOff: off }, PURPOSES, lang);
      // 「使わない」の 1 行は、外した部品の名前を出してよい（AI に使わないと伝える）
      const t = packWithRequest({ series, lang, request: '# R\n\n' + req, exclude: ex, off, plan: 'free' }).split('\n').filter((l) => !/^- (Purposes turned off|使わない言いたいこと)/.test(l)).join('\n');
      assert.deepEqual(notInCatalog(t), [], `${lang} free ${series.join('+') || '(none)'} off ${off.join('+')}`);
      n++;
    }
  }
  assert.ok(n > 1000, n + ' packs');
  assert.deepEqual(notInCatalog('| `<m-bars>` | x |\nuse m-flow here; --mm-h'), ['m-flow'], 'the check finds a part named outside the catalog');
});
ok('pack: turning purposes off removes the parts used only for them from the catalog (core and packs) and tells the AI', () => {
  const off = componentsOff(['key-number', 'process', 'contents'], PURPOSES);
  assert.deepEqual(off, ['m-flow', 'm-hissan', 'm-kakijun', 'm-kpi', 'm-menu']);
  const full = packWithRequest({ series: ['business'], lang: 'en', request: 'R' });
  const cut = packWithRequest({ series: ['business'], lang: 'en', request: 'R', exclude: off, off: ['key-number', 'process', 'contents'] });
  assert.ok(full.includes('### `<m-flow>`') && full.includes('### `<m-kpi>`') && full.includes('| `<m-menu>` |'));
  for (const t of off) assert.ok(!cut.includes(t), t + ' nowhere');
  assert.ok(cut.includes('### `<m-bars>`') && cut.includes('### `<m-quad>`'));
  assert.ok(cut.length < full.length);
  assert.ok(!seriesPart('business', 'ja', off).includes('m-kpi'));
});

ok('no lesson seed (format spec §8.4: variants by name only): npm run new writes none and the module has no seed helpers', () => {
  for (const o of [{}, { blank: true }, { lang: 'en' }]) assert.ok(!newDeckFiles(o)['deck.html'].includes('data-egatari-seed'), JSON.stringify(o));
  for (const k of ['SEED_ATTR', 'newSeed', 'seedOf', 'withSeed', 'freshSeed', 'keepSeed']) assert.equal(NEW_DECK[k], undefined, k);
});
ok('choices: egatari.json studio.newDeck through updateConfig (other members byte for byte); with the outline in the same studio member', () => {
  const raw = '{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}}';
  const t = withChoice(raw, { category: 'teaching', subcategory: 'class', parts: ['m-kanbun', 'm-nope', 'm-bars'], subjects: ['kokugo'], purposesOff: ['spread'] });
  assert.ok(t.startsWith('{"docId": "x",  "big": 12345678901234567890, "acme": {"k": 1e400}'));
  assert.deepEqual(choiceOf(t), { v: 1, plan: 'free', category: 'teaching', subcategory: 'class', parts: ['m-bars', 'm-kanbun'] }, 'the chosen parts (unknown ones dropped); the earlier subjects, tools and purposesOff are not written');
  const both = withOutline(t, { rows: [{ heading: 'a', point: '' }, { heading: 'b', point: '' }], next: 3 });
  assert.equal(outlineOf(both).next, 3);
  assert.equal(choiceOf(both).category, 'teaching');
  assert.deepEqual(choiceOf(withChoice(null, { category: 'bogus', subcategory: 'class' })), { v: 1, plan: 'free', category: null, subcategory: null, parts: [] });
  // お使いの AI：有料のプランを書いて読み戻す。知らない値は無料、plan のない前の記録も無料
  const paid = withChoice(raw, { plan: 'paid', category: 'business', subcategory: 'pitch', parts: ['m-market', 'm-timer'] });
  assert.deepEqual(choiceOf(paid), { v: 1, plan: 'paid', category: 'business', subcategory: 'pitch', parts: ['m-market', 'm-timer'] });
  assert.deepEqual(choiceOf(withChoice(paid, { ...choiceOf(paid), plan: 'free' })), { ...choiceOf(paid), plan: 'free' }, 'switching back to free round-trips too');
  assert.equal(choiceOf(withChoice(null, { plan: 'gold' })).plan, 'free');
  assert.equal(choiceOf('{"studio": {"newDeck": {"v": 1, "category": null, "subcategory": null, "subjects": [], "purposesOff": []}}}').plan, 'free', 'an earlier record without plan reads as free');
  assert.deepEqual(choiceOf('{"studio": {"newDeck": {"v": 1, "plan": "free", "subjects": ["math", "kokugo", "info"]}}}').subjects, ['math', 'kokugo', 'info'], 'an earlier record is read as it is');
  assert.equal(choiceOf('not json'), null);
});
// 前の原稿の data-egatari-seed（誰も読まない属性）と、パーツの variant は、バイトのまま残す（段 A がバイトを保つため、保存で消さない）
const OLD_SEED = (t) => t.replace(/<html\b([^>]*)>/, '<html$1 data-egatari-seed="2718281828">');
const WITH_VARIANT = (t) => t.replace(/<m-sweep\b/, '<m-sweep variant="draw"');
ok('variant attributes and an old data-egatari-seed survive every slide operation of the editor (insert, duplicate, delete, move) byte for byte', () => {
  const deck = WITH_VARIANT(OLD_SEED(fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8')));
  assert.ok(deck.includes('data-egatari-seed="2718281828"') && deck.includes('<m-sweep variant="draw"'), 'fixture');
  const n = slideChunks(deck).slides.length;
  assert.ok(n >= 2);
  const head = deck.slice(0, deck.indexOf('<section'));
  const sweep = /<m-sweep variant="draw"[^>]*>/.exec(deck)[0];
  const outs = [
    insertSlide(deck, 0, slideTemplate('title-body', { lang: 'en', id: 's-aaaaaa' })),
    duplicateSlide(deck, 0, 's-bbbbbb').out,
    moveSlide(deck, 0, n - 1),
  ];
  for (const o of outs) { assert.ok(o.startsWith(head), 'the <html> start tag and head are untouched'); assert.ok(o.includes(sweep), 'the variant attribute is kept'); }
  const del = deleteSlide(deck, n - 1);
  assert.ok(del.startsWith(head));
});
ok('variant attributes and an old data-egatari-seed survive a single-file round trip (pack → unpack) byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-variant-'));
  try {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    const deck = WITH_VARIANT(OLD_SEED(fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8')));
    fs.writeFileSync(path.join(src, 'deck.html'), deck);
    fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), path.join(src, 'narration.md'));
    const out = path.join(dir, 'lesson.ega.html');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', src, '-o', out], { stdio: 'pipe' });
    const back = path.join(dir, 'back');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'unpack', out, back], { stdio: 'pipe' });
    // 書き出しは id を付けて作業フォルダに書き戻す（format spec §8.1）：比べるのはその原稿
    const written = fs.readFileSync(path.join(src, 'deck.html'), 'utf8');
    assert.equal(fs.readFileSync(path.join(back, 'deck.html'), 'utf8'), written, 'the unpacked source is byte for byte the same, the old seed included');
    assert.match(written, /<html\b[^>]*\sdata-egatari-seed="2718281828"/, 'writing the ids back keeps the old seed attribute');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`new-deck: ${n} ok`);
