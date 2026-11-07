// test-all: unit
// 新規作成の選び方とシード値（kit/core/new-deck.mjs・kit/core/purposes.mjs、backlog #99・#104・#124・#125、format spec §8.4）と、AI への指示の中身：
// 1. 大分類・小分類・④ のパーツの一覧（伝えたいことのまとまり・段と束・初めの印・プランの目安と外す候補）・頼む文の節（場面・構成の型・見せ方・外した言いたいこと）
// 2. 言いたいこと：決めた表（FALLBACK）と manifest の読み方、外したものだけに使う部品
// 3. 指示（pack）：束と段（#125）。標準の部品はいつも、専門の部品は印の付いた束だけ、特殊（extra）はどこにも入らない。
//    無料のプランは中核の 4 つ（FREE_CORE）のほかの標準の部品を一覧の 1 行だけにし、標準すべてが 45 KB と貼り付けの長さ 31,000 に収まる（新規作成のメーターが目安の中から始まる）。
//    言いたいこと → パーツ → ステップの表は組み立てのときに作る（入っている部品だけ・外した札の行はない）、R-whole、
//    外した言いたいことだけに使う部品はどこにも出ない（表・一覧・見本・文。「使わない」の 1 行を除く）、束の見本は抜き出し
// 4. シード値：作るときに 1 回だけ書く（あれば変えない）・直した返事が失っても戻す・egatari.json の studio.newDeck（ほかの項目はバイトのまま）
// 5. シード値は組み立て（build）と 1 ファイル（pack → unpack）を通っても残る
//   node tools/test-new-deck.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, SET_LABELS, choiceRequest as choiceRequestOf, withChoice, choiceOf, AI_PLANS, DEFAULT_PLAN, planOf, partsList, partsOfSet, recommend, initialParts, SUBJECT_SETS, SUB_SETS, WORDS, capKb, trimCandidates, fitPlan } from '../kit/core/new-deck.mjs';
import * as NEW_DECK from '../kit/core/new-deck.mjs';
import { NEW_LESSON_CATALOGUE, withNewLessonCatalogue } from '../kit/core/config-file.mjs';
import { newDeckFiles } from '../kit/templates/new-deck.mjs';
import { TILES, purposesFrom, componentsOff } from '../kit/core/purposes.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { generate, LIMITS, overMessage, sizeReport, pairsOf } from './make-llm-guide.mjs';
import { buildPack, setPart, PURPOSES, SETS, PACK_VERSION, PACK_CAP_KB, PAID_PACK_KB, FREE_PASTE_UNITS, pasteUnits, fitSize, SINGLE_SET_DROP_ORDER, FREE_CORE, BRIEF, STANDARD, loadedParts, TIERS, partsPackOpts, packSize, fitPack } from '../kit/core/llm-pack.mjs';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { PART_LABELS, partLabel, partDesc, partOrder, standardParts } from '../kit/core/part-labels.mjs';
import { PACK as PACK_DATA } from '../kit/core/llm-pack-data.mjs';
import { guideRules } from '../kit/core/llm-fix.mjs';
import { withOutline, outlineOf } from '../kit/core/llm-outline.mjs';
import { slideChunks, insertSlide, duplicateSlide, deleteSlide, moveSlide, slideTemplate } from '../kit/core/slide-ops.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };

// 指示に入る部品（標準と、選んだ束の部品）。外した伝えたいことの行が名前を出すのは、指示に入る部品だけ
const choiceRequest = (c, P, lang) => choiceRequestOf({ ...c, parts: loadedParts((c && c.sets) || []) }, P, lang);
const MANIFEST2 = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components-2', `manifest-${TIERS.catalogue}.json`), 'utf8'));
const STD = Object.keys(PACK_DATA.en.components).filter((t) => PACK_DATA.en.components[t].set === STANDARD).sort();
// 束を 1 つ選んだ無料のプランの指示で外すパーツ（kit/core/llm-pack-assemble.mjs の SINGLE_SET_DROP_ORDER の順、収まったところで止める。2026-11-06）。
// 載っていない束は何も外さない。日本語はどの束も中核の 4 つを短くすれば収まる
const SINGLE_SET_EXPECTED = {
  en: { stats: ['m-fishbone', 'm-quad', 'm-cycle', 'm-venn', 'm-tree', 'm-timeline'], math: ['m-fishbone', 'm-quad', 'm-cycle', 'm-venn', 'm-tree', 'm-timeline', 'm-kpi', 'm-compare', 'm-cards', 'm-pie'], kokugo: ['m-fishbone', 'm-quad'],
    // 部品庫 2.4.0 で science に m-particles が入り、英語は貼り付けの長さで越えるようになった
    science: ['m-fishbone', 'm-quad', 'm-cycle', 'm-venn'] },
  ja: {},
};
for (const lang of ['en', 'ja']) for (const s of SETS) SINGLE_SET_EXPECTED[lang][s] ||= [];
const EXTRA = Object.keys(TIERS.parts).filter((t) => TIERS.parts[t].tier === 'extra').sort();
const ofSet = (s) => Object.keys(PACK_DATA.en.components).filter((t) => PACK_DATA.en.components[t].set === s).sort();
const described = (text) => [...text.matchAll(/^### `<(m-[a-z]+(?:-[a-z]+)*)>`$/gm)].map((x) => x[1]).sort();   // 拡張の節（### `<m-flow>`：この束の拡張）は数えない
const rowsOf = (text) => [...new Set([...text.matchAll(/^\| `<(m-[a-z]+(?:-[a-z]+)*)>` \|/gm)].map((x) => x[1]))].sort();
const named = (text, t) => new RegExp(t + '(?![a-z-])').test(text);

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
ok('AI plan: free (default) and paid change the suggested size limit and how much the pack says; the ticked parts make the pack; over the limit, candidates to untick', () => {
  assert.deepEqual(AI_PLANS, ['free', 'paid']);
  assert.equal(DEFAULT_PLAN, 'free');
  assert.equal(planOf({}), 'free'); assert.equal(planOf({ plan: 'paid' }), 'paid'); assert.equal(planOf({ plan: 'gold' }), 'free'); assert.equal(planOf(null), 'free');
  assert.equal(capKb('free'), PACK_CAP_KB.free); assert.equal(capKb('paid'), PAID_PACK_KB);
  assert.equal(PACK_CAP_KB.free, 45); assert.equal(PAID_PACK_KB, 150); assert.equal(PACK_CAP_KB.paid, PAID_PACK_KB);
  assert.equal(LIMITS.fail, PACK_CAP_KB.free); assert.equal(LIMITS.free, PACK_CAP_KB.free); assert.equal(LIMITS.paid, PAID_PACK_KB); assert.equal(LIMITS.paste, FREE_PASTE_UNITS);
  // 印の付いたパーツだけが指示に入り、ほかのパーツはどこにも名前が出ない。有料のプランは全部を詳しく、無料のプランは BRIEF を一覧の 1 行だけ
  for (const lang of ['en', 'ja']) for (const tags of [initialParts([]), ['m-bars', 'm-hist', 'm-timer'], ['m-kanbun', 'm-flow', 'm-kpi'], []]) for (const plan of AI_PLANS) {
    const text = packWithRequest({ ...partsPackOpts(tags, plan), lang });
    const what = `${lang} ${plan} ${tags.join('+') || '(none)'}`;
    assert.deepEqual(described(text), [...tags].filter((t) => plan === 'paid' || !BRIEF.includes(t)).sort(), what + ': described');
    assert.deepEqual(rowsOf(text), [...tags].sort(), what + ': catalogue rows');
    for (const t of Object.keys(TIERS.parts).filter((x) => !tags.includes(x))) assert.ok(!named(text, t), `${what}: ${t} is named`);
  }
  assert.deepEqual(partsPackOpts(['m-hist', 'm-timer', 'm-bars']).sets, ['stats', 'tools']);
  assert.equal(partsPackOpts(['m-bars']).plan, 'free'); assert.equal(partsPackOpts(['m-bars'], 'paid').plan, 'paid');
  // 外す候補：越えた分に届くまで、大きい順。keep は候補にしない。越えなければなし
  const sizeOf = (tags) => packSize(packWithRequest({ ...partsPackOpts(tags), lang: 'ja' }));
  const std = initialParts([]);
  assert.deepEqual(trimCandidates(std, { sizeOf, capBytes: 1e9 }), []);
  assert.deepEqual(trimCandidates(std, { sizeOf, capBytes: capKb('free') * 1024 }), [], 'every standard part fits the free plan');
  const kokugo = partsOfSet('kokugo'), all = [...std, ...kokugo];
  const c = trimCandidates(all, { sizeOf, capBytes: 40 * 1024, keep: new Set(kokugo) });
  assert.ok(c.length && c.every((t) => !kokugo.includes(t)), c.join());
  assert.ok(sizeOf(all.filter((t) => !c.includes(t))) < sizeOf(all));
});
ok('fitting the free plan (#125): over 45 KB or a paste length of 31,000, the core four are shortened first (never unticked); still over, with one set the standard parts outside the core four in the fixed order, with two or more only specialized parts, largest first; the paid plan never shortens', () => {
  // 目安の物差しは fitSize（45 KB と貼り付けの長さ 31,000 の近いほう。新規作成とコマンドが使う）
  const sizeOf = (lang) => (tags, short) => fitSize(packWithRequest({ ...partsPackOpts(tags, 'free', { short }), lang }), 'free');
  const cap = capKb('free') * 1024;
  for (const lang of ['en', 'ja']) {
    const size = sizeOf(lang);
    // 標準だけ：収まるので短くしない
    assert.deepEqual(fitPlan(initialParts([]), 'free', { sizeOf: size, capBytes: cap }), { short: false, candidates: [] }, lang + ' standard only');
    // 国語（45 KB の候補で m-kakijun は extra に移り、gendai・kanbun・kobun の 3 つ。backlog #170）：
    // 日本語は中核の 4 つを短くすれば 45 KB に収まり、外す候補はない。英語は貼り付けの長さ 31,000 を越え、短くしても越えるので、
    // 束が 1 つのときの順（SINGLE_SET_DROP_ORDER）で標準のパーツが候補になる（国語のパーツは外さない）
    const kok = initialParts([{ set: 'kokugo' }]);
    const fk = fitPlan(kok, 'free', { sizeOf: size, capBytes: cap });
    assert.ok(fk.short, lang + ' kokugo: the core four are shortened');
    assert.deepEqual(fk.candidates, SINGLE_SET_EXPECTED[lang].kokugo, lang + ' kokugo: the candidates');
    const kept = kok.filter((t) => !fk.candidates.includes(t));
    const tk = packWithRequest({ ...partsPackOpts(kept, 'free', { short: fk.short }), lang });
    assert.ok(packSize(tk) <= cap && pasteUnits(tk) <= FREE_PASTE_UNITS, `${lang} kokugo (short=${fk.short}): ${packSize(tk)} B, paste length ${pasteUnits(tk)}`);
    assert.deepEqual(described(tk), partsOfSet('kokugo').sort(), `${lang}: shortened, the kokugo parts are described`);
    assert.deepEqual(rowsOf(tk), [...kept].sort(), lang + ': every ticked part keeps its catalogue line');
    assert.ok(FREE_CORE.every((t) => tk.includes('| `<' + t + '>` |')), lang + ': the core four stay in the catalogue');
    // 統計・算数と国語：短くしても越える。外す候補は専門のパーツだけで、外せば収まる（45 KB では math+maps は短縮だけで収まるので、
    // 両方とも実際に外す候補が出る組にする）
    for (const sets of [['stats', 'math'], ['stats', 'kokugo']]) {
      const tags = initialParts(sets.map((x) => ({ set: x })));
      const f = fitPlan(tags, 'free', { sizeOf: size, capBytes: cap });
      assert.ok(f.short && f.candidates.length && f.candidates.every((t) => TIERS.parts[t].tier === 'specialized' && sets.includes(TIERS.parts[t].set)), `${lang} ${sets.join('+')}: ${f.candidates.join()}`);
      const gains = f.candidates.map((t) => size(tags, true) - size(tags.filter((x) => x !== t), true));
      assert.deepEqual(gains, [...gains].sort((a, b) => b - a), lang + ': largest first');
      assert.ok(size(tags.filter((t) => !f.candidates.includes(t)), true) <= cap, `${lang} ${sets.join('+')}: fits after unticking the candidates`);
      const left = packWithRequest({ ...partsPackOpts(tags.filter((t) => !f.candidates.includes(t)), 'free', { short: true }), lang });
      assert.ok(packSize(left) <= cap && pasteUnits(left) <= FREE_PASTE_UNITS, `${lang} ${sets.join('+')}: within 45 KB and the paste length after unticking`);
    }
    // 有料のプランは短くしない
    const paidSize = (tags, short) => packSize(packWithRequest({ ...partsPackOpts(tags, 'paid', { short }), lang }));
    assert.equal(fitPlan(kok, 'paid', { sizeOf: paidSize, capBytes: capKb('paid') * 1024 }).short, false);
    assert.equal(partsPackOpts(kok, 'paid', { short: true }).short, undefined, 'short is for the free plan only');
  }
});
ok('free plan (#125): every standard part fits 45 KB, with only the four core parts described; extra parts are in no pack; specialized parts only when their set is ticked; m-cards and m-orbit are described', () => {
  assert.deepEqual([...FREE_CORE], ['m-bars', 'm-flow', 'm-menu', 'm-predict']);
  assert.deepEqual(STD, Object.keys(TIERS.parts).filter((t) => TIERS.parts[t].tier === 'standard').sort(), 'the standard parts of the pack are the standard tier of the manifest');
  assert.deepEqual(BRIEF, STD.filter((t) => !FREE_CORE.includes(t)));
  assert.deepEqual(initialParts([]).sort(), STD, 'New… ticks every standard part at first');
  for (const lang of ['en', 'ja']) {
    // 新規作成の初めの印（標準すべて）の無料のプランの指示：目安の中（#124 のメーターが赤から始まらない）
    const start = packWithRequest({ ...partsPackOpts(initialParts([]), 'free'), lang });
    assert.ok(packSize(start) <= capKb('free') * 1024, `${lang}: the free pack of every standard part is ${packSize(start)} B, over ${capKb('free')} KB`);
    assert.ok(fitSize(start, 'free') <= capKb('free') * 1024, `${lang}: the free pack of every standard part has a paste length of ${pasteUnits(start)}, over ${FREE_PASTE_UNITS}`);
    assert.deepEqual(described(start), [...FREE_CORE].sort(), lang + ': only the core four are described on the free plan');
    assert.deepEqual(rowsOf(start), STD, lang + ': every standard part has its catalogue line');
    assert.ok(start.includes(PACK_DATA[lang].briefNote), lang + ': the note on the parts without a section');
    assert.ok(packSize(buildPack({ lang })) <= LIMITS.fail * 1024, lang + ': buildPack with no set ≤ 45 KB');
    // 有料のプランでは同じ印でも全部を詳しく
    assert.deepEqual(described(packWithRequest({ ...partsPackOpts(initialParts([]), 'paid'), lang })), STD);
    // 特殊（extra）：どの指示にも、全部を選んでも入らない
    const everything = [buildPack({ sets: 'all', lang, plan: 'paid' }), buildPack({ sets: 'all', lang }), packWithRequest({ ...partsPackOpts(Object.keys(TIERS.parts), 'paid'), lang }), start];
    assert.ok(EXTRA.length && EXTRA.includes('m-codetree') && EXTRA.includes('m-collect'));
    for (const t of EXTRA) for (const text of everything) assert.ok(!named(text, t), `${lang}: extra ${t} is named in a pack`);
    for (const t of EXTRA) assert.ok(!PACK_DATA.en.components[t] && !PACK_DATA.ja.components[t], t + ' has no pack entry');
    // 専門：その束を選んだときだけ（印の付いた束のパーツだけが名前を出す）
    for (const s of SETS) {
      const text = packWithRequest({ ...partsPackOpts([...STD, ...partsOfSet(s)], 'free'), lang });
      for (const t of Object.keys(PACK_DATA.en.components).filter((x) => PACK_DATA.en.components[x].set !== STANDARD)) {
        assert.equal(named(text, t), PACK_DATA.en.components[t].set === s, `${lang} free standard + ${s}: ${t}`);
        if (PACK_DATA.en.components[t].set === s) assert.ok(text.includes('### `<' + t + '>`'), `${lang} ${s}: ${t} is described on the free plan`);
      }
    }
    for (const t of Object.keys(PACK_DATA.en.components).filter((x) => PACK_DATA.en.components[x].set !== STANDARD)) assert.ok(!named(buildPack({ lang }), t), `${lang}: no set → ${t} is not named`);
  }
  // パーツライブラリ 2.1.0 の新しいパーツ（m-cards は標準、m-orbit は専門の science）
  assert.equal(PACK_DATA.en.components['m-cards'].set, STANDARD);
  assert.equal(PACK_DATA.en.components['m-orbit'].set, 'science');
  for (const lang of ['en', 'ja']) for (const t of ['m-cards', 'm-orbit']) {
    const c = PACK_DATA[lang].components[t];
    assert.ok(c && c.row.startsWith('| `<' + t + '>` |') && c.entry.startsWith('### `<' + t + '>`') && c.entry.length > 500, `${lang} ${t}: a pack entry`);
    assert.ok(buildPack({ sets: 'all', lang, plan: 'paid' }).includes('### `<' + t + '>`'), `${lang} ${t} in the full pack`);
  }
  // 組み立てが足す欄（texHtml・renderers）はデータの形に出さない
  for (const lang of ['en', 'ja']) assert.ok(!/texHtml|renderers|abcSvg|abcMap/.test(buildPack({ sets: 'all', lang, plan: 'paid' }).split('## 4.')[0]), lang + ': build-time fields are not in the data shapes');
});
ok('part labels: every part of the list has a ja/en name, an icon and a one-line description; the standard parts are FREE_CORE’s labels; the insert page names every set', () => {
  for (const t of partsList(null).flatMap((g) => g.parts)) assert.ok(PART_LABELS[t] && PART_LABELS[t].ja && PART_LABELS[t].en && PART_LABELS[t].icon && PART_LABELS[t].desc, t);
  // 絵の名前はどれも app/llm.js の ICONS にある
  const llmSrc = fs.readFileSync(path.join(ROOT, 'app', 'llm.js'), 'utf8');
  const iconsBlock = llmSrc.slice(llmSrc.indexOf('const ICONS = {'), llmSrc.indexOf('};', llmSrc.indexOf('const ICONS = {')));
  const ICON_KEYS = new Set([...iconsBlock.matchAll(/^\s+'?([\w-]+)'?: '</gm)].map((m) => m[1]));
  for (const [t, x] of Object.entries(PART_LABELS)) assert.ok(ICON_KEYS.has(x.icon), `${t}: icon "${x.icon}" is drawn in app/llm.js ICONS`);
  assert.deepEqual(standardParts('ja'), ['棒グラフ', '流れ図', '目次', '予想と答え']);
  assert.equal(partLabel('m-new-thing', 'ja'), 'm-new-thing');
  assert.equal(partDesc('m-new-thing', 'ja'), '');
  assert.deepEqual(partOrder(['m-venn', 'm-menu', 'm-bars', 'm-zzz', 'm-flow']), ['m-bars', 'm-flow', 'm-menu', 'm-venn', 'm-zzz']);
  assert.deepEqual(SET_LABELS.map((s) => s.set).filter((s) => SETS.includes(s)), SETS, 'the insert page names every set, in the pack order');
  for (const x of SET_LABELS) assert.ok(x.label.ja && x.label.en && x.inside.ja && x.inside.en, x.set);
});
ok('request section: kind, structure and presentation of the subcategory, and the purposes turned off', () => {
  const r = choiceRequest({ category: 'research', subcategory: 'conference', purposesOff: [] }, PURPOSES, 'ja');
  assert.equal(r, '- 場面：研究発表／学会の口頭発表\n- 構成の型：背景 → 目的 → 方法 → 結果 → 考察 → 結論（背景・方法・結果でおよそ 3 分の 1 ずつ）\n- 見せ方：見出しは主張の文、図が証拠。箇条書きを減らす。1 分に 1 枚ほど');
  assert.equal(choiceRequestOf({ category: 'research', subcategory: 'conference' }, null, 'ja'), r, 'the new-lesson page passes no purposes');
  const e = choiceRequest({ category: 'guides', subcategory: null, purposesOff: ['key-number', 'process'] }, PURPOSES, 'en');
  // 小分類の「この中にない」（null）：場面の行だけで、構成の型・見せ方は書かない
  assert.match(e, /^- Kind: Guides\n- Purposes turned off/);
  assert.equal(choiceRequest({ category: 'teaching', subcategory: null, purposesOff: [] }, PURPOSES, 'ja'), '- 場面：授業・研修');
  // 名前を出すのは組み立てに入る部品だけ（m-hissan・m-kakijun は束 math・kokugo を選んだときだけ）
  assert.match(e, /- Purposes turned off by the author: one key number, steps of a process\. Do not use their representations \(`m-cards`, `m-flow`, `m-kpi`\)\./i);
  assert.match(choiceRequest({ category: 'guides', sets: ['math'], purposesOff: ['key-number', 'process'] }, PURPOSES, 'en'), /their representations \(`m-cards`, `m-flow`, `m-hissan`, `m-kpi`\)\./);
  assert.match(choiceRequest({ purposesOff: ['timeline'] }, PURPOSES, 'en'), /\(`m-timeline`\)/);
  assert.equal(choiceRequest({ category: null, purposesOff: [] }, PURPOSES, 'en'), '');
  assert.equal(choiceRequest({ category: 'other', purposesOff: [] }, PURPOSES, 'ja'), '');
});

const FIX = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'components-manifest-purposes.json'), 'utf8'));
const TILE_IDS = ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents', 'spatial'];
// 部品庫 v1.7.0 から：16 個目の札 predict「予想して確かめる」（決めた表 TILES は v1.6.0 の 15 個のまま。tile のない前の manifest に predict はない）
const OWN_IDS = ['compare', 'change', 'part-whole', 'key-number', 'process', 'timeline', 'cause-effect', 'cycle', 'hierarchy', 'position', 'overlap', 'correlation', 'spread', 'contents', 'predict', 'spatial'];
ok('purposes: the tiles are the default catalogue manifest\'s own purposes (16), with their label, examples and icon; the fallback table TILES (15) reads the same', () => {
  assert.equal(TILES.length, 15);
  const man = MANIFEST2();
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
  // m-bars は 3 つの札に使う：全部外したときだけ使わせない
  assert.deepEqual(componentsOff(['compare', 'change'], PURPOSES), ['m-compare', 'm-curves', 'm-numberline']);
  assert.deepEqual(componentsOff(['compare', 'change', 'part-whole'], PURPOSES), ['m-bars', 'm-compare', 'm-curves', 'm-market', 'm-numberline', 'm-pie', 'm-tape']);
  // m-kakijun は 2.2.0 候補で extra に移り（backlog #170）、process の部品からは外れる（extra は purposes の計算に入らない）
  assert.deepEqual(componentsOff(['process'], PURPOSES), ['m-cards', 'm-flow', 'm-hissan']);
  assert.deepEqual(componentsOff([], PURPOSES), []);
  // 札のない言いたいことの部品（m-kanbun・m-sweep など）は外せない（束から入る）。特殊のパーツは指示にないので札も持たない
  assert.ok(!['m-kanbun', 'm-kobun', 'm-gendai', 'm-sweep', 'm-collect', 'm-codetree'].some((t) => PURPOSES.components[t]));
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
  const t = assemble(g.data, { sets: 'all', lang: 'en' });
  const table = t.slice(t.indexOf('| purpose |'), t.indexOf('Each part'));
  assert.equal(table.trim().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| purpose') && !l.startsWith('|---')).length, 16, '15 rows + other parts');
  assert.match(table, /^\| Compare amounts \| `m-bars` \(sorted for ranking\) \| One side, then the difference \|$/m);
  assert.ok(!/Deviation|Concept links|Mystery|Ranking/.test(table));
});

ok('purposes: a tile turns off its "into" ids too (ranking via compare); spatial and the maps never leak when turned off (free and paid with maps); spatial has a part only when maps is ticked', () => {
  // into：外した札に入る id だけの部品も外れる
  const m = MANIFEST2();
  const P = purposesFrom({ ...m, components: { ...m.components, rankonly: { purposes: ['ranking'] } } });
  assert.deepEqual(P.components['m-rankonly'], ['compare'], 'ranking maps to the compare tile');
  assert.ok(componentsOff(['compare'], P).includes('m-rankonly') && !componentsOff(['change'], P).includes('m-rankonly'));
  assert.ok(componentsOff(['compare'], PURPOSES).includes('m-compare'));
  assert.ok(!named(packWithRequest({ lang: 'en', plan: 'paid', exclude: componentsOff(['compare'], PURPOSES), off: ['compare'] }), 'm-compare'), 'paid, compare off: m-compare is gone');
  assert.deepEqual(componentsOff(['spatial'], PURPOSES), ['m-map-japan', 'm-map-world']);
  for (const lang of ['en', 'ja']) {
    for (const [what, opts] of [['free+maps', { sets: ['maps'], plan: 'free' }], ['free+maps+kokugo', { sets: ['maps', 'kokugo'], plan: 'free' }], ['paid+maps', { sets: ['maps'], plan: 'paid' }]]) {
      const on = packWithRequest({ ...opts, lang });
      assert.ok(on.includes('### `<m-map-japan>`') && /^\| [^|]+ \| `m-map-japan`/m.test(on), `${lang} ${what}: spatial on → m-map-japan is described and backs the spatial row`);
      const off = packWithRequest({ ...opts, lang, exclude: componentsOff(['spatial'], PURPOSES), off: ['spatial'] });
      assert.ok(!off.includes('map-japan') && !off.includes('map-world'), `${lang} ${what}: spatial off → the maps are named nowhere`);
      assert.ok(!off.includes(PURPOSES.list.find((p) => p.id === 'spatial').name[lang] + ' |'), `${lang} ${what}: spatial off → no spatial row`);
    }
    // maps が入っていない：場所・地図の行はパーツなし（AI が HTML で描く）、地図の名前は出さない
    const name = PURPOSES.list.find((p) => p.id === 'spatial').name[lang];
    for (const opts of [{ sets: [] }, { sets: ['stats', 'kokugo'] }, { sets: [], plan: 'paid' }]) {
      const t = packWithRequest({ ...opts, lang });
      assert.ok(!t.includes('map-japan'), `${lang} ${opts.sets.join('+') || 'standard'}: m-map-japan is not named without maps`);
      assert.ok(new RegExp('^\\| ' + name.replace(/[()/]/g, '\\$&') + ' \\| ' + (lang === 'ja' ? 'この文にはない' : 'not in this text')).test(t.split('\n').find((l) => l.startsWith('| ' + name + ' |')) || ''), `${lang}: the spatial row has no part without maps`);
    }
  }
});

const tagsIn = (text) => new Set([...text.matchAll(/m-[a-z]+(?:-[a-z]+)*(?![a-z-])/g)].map((m) => m[0]));
ok(`pack ${PACK_VERSION}: the purpose table is built at assembly from the included parts, never names a part outside the catalogue, and has no star markers`, () => {
  for (const lang of ['en', 'ja']) {
    const all = buildPack({ sets: 'all', lang });
    assert.ok(all.includes('**R-purpose**') && all.includes('**R-whole**'), lang + ': standards');
    assert.ok(guideRules(all).has('R-purpose') && guideRules(all).has('R-whole'), lang + ': fix requests can quote them');
    assert.match(all, /https:\/\/github\.com\/egatari\/components\/blob\/v\d+\.\d+\.\d+\/components\/<(name|名前)>\/README\.md/, lang + ': pinned URL');
    // 有料のプランのすべての束：標準と専門のすべての部品が表と説明にある
    const paid = buildPack({ sets: 'all', lang, plan: 'paid' });
    for (const t of Object.keys(TIERS.parts).filter((x) => TIERS.parts[x].tier !== 'extra')) assert.ok(paid.includes('`' + t + '`') && paid.includes('### `<' + t + '>`'), `${lang}: ${t} is in the table and described in the paid pack`);
    // 星印は §2.7 の表し方の表（PURPOSES から組む。部品の名前・束の印はここに出ない）の中だけを見る：§3 の preamble は
    // ラベルの書き方（`*…*` 斜体・記号のままの全角 ＿ ＾ ＊）を説明する注記を持つ（candidate 2.2.0 の評価のため、template に追加）
    const purposeSection = all.slice(all.indexOf('### 2.7'), all.indexOf('### 2.8'));
    assert.ok(!/＊/.test(purposeSection) && !/ \*(?= \||,|$)/m.test(purposeSection), lang + ': no star markers');
    // 束を選ばない：表が指すのは標準の部品だけ。入っていない束は何に使えるかだけ（束と部品の名前は出さない）
    const core = buildPack({ sets: [], lang });
    for (const t of ['m-market', 'm-seq', 'm-kanbun', 'm-hist']) assert.ok(!core.includes(t), `${lang}: no set chosen → ${t} is not named`);
    assert.ok(lang === 'en' ? /Some parts are not included in these instructions \(for [^)]*Spread/.test(core) : /この指示に入っていないパーツもある（[^）]*ばらつき/.test(core), lang + ': the parts not included are named by use');
    for (const s of SETS) assert.ok(!core.slice(core.indexOf('### 2.7'), core.indexOf('### 2.8')).includes(s + ' ('), `${lang}: the set name ${s} is not in the table`);
    for (const s of SETS) for (const plan of AI_PLANS) {
      const p = buildPack({ sets: [s], lang, plan });
      const rows = new Set(rowsOf(p));
      for (const t of tagsIn(p.slice(p.indexOf('### 2.7'), p.indexOf('### 2.8')))) assert.ok(rows.has(t), `${lang} ${plan} ${s}: the table names ${t}, which is in the catalogue`);
    }
  }
  const en = buildPack({ sets: 'all', lang: 'en' });
  assert.match(en, /^\| change over time \| `m-curves`, `m-bars` \(few points\) \| one line at a time \|$/mi);
  assert.match(en, /^\| timeline, schedule \| `m-timeline` \| one event at a time \|$/mi);
  assert.match(buildPack({ sets: [], lang: 'en' }), /^\| spread \| not in this text: the nearest part, or HTML or inline SVG \| whole at once \|$/mi);
  assert.match(buildPack({ sets: ['stats'], lang: 'en' }), /^\| spread \| `m-boxplot`, `m-hist`, `m-seq` \| whole at once \|$/mi);
  assert.match(en, /Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn/);
  // 束の見本は抜き出し（部品を使うスライドだけ。骨組みは共通の見本）
  const biz = setPart('business', 'en');
  assert.ok(biz.includes('```deck.html\n<section class="slide">') && !biz.includes('<!DOCTYPE html>') && biz.includes('<m-kpi') && !biz.includes('<m-bars orient'));
  assert.ok(!/<!--\/?part/.test(en), 'no part markers left');
});
// 束の選び方：なし・1 つずつ・2 つの組
const SET_CHOICES = [[], ...SETS.map((s) => [s]), ...pairsOf(SETS)];
// プランと束：無料のプランは束なし・1 つずつ、有料のプランはいくつか
const PLAN_CHOICES = [
  ...[[], ...SETS.map((s) => [s])].map((sets) => ({ plan: 'free', sets })),
  { plan: 'paid', sets: [] }, { plan: 'paid', sets: ['kokugo'] }, { plan: 'paid', sets: ['math', 'maps', 'tools'] },
];
const partsIn = (text) => [...tagsIn(text)].filter((t) => PACK_DATA.en.components[t]);
// 上限：無料のプランは束なしで 45 KB（束を足して越えたら新規作成のメーターが外す候補を出すので、ここでは見ない）。有料のプランは 150 KB
const capOk = (choice, bytes) => (choice.plan === 'paid' ? bytes <= PACK_CAP_KB.paid * 1024 : choice.sets.length ? true : bytes <= PACK_CAP_KB.free * 1024);
ok('caps per AI plan with all purposes on: free with no set ≤ 45 KB; paid with any two sets ≤ PAID_PACK_KB; the paid worst case is a warning only', () => {
  for (const lang of ['en', 'ja']) {
    assert.ok(Buffer.byteLength(buildPack({ sets: [], lang, plan: 'free' })) <= PACK_CAP_KB.free * 1024, lang + ' free standard');
    for (const p of SET_CHOICES) {
      const b = Buffer.byteLength(buildPack({ sets: p, lang, plan: 'paid' }));
      assert.ok(b <= PACK_CAP_KB.paid * 1024, `${lang} paid ${p.join('+') || '(none)'}: ${b} B`);
    }
    const paid = buildPack({ sets: [], lang, plan: 'paid' });
    for (const s of SETS) assert.ok(!paid.includes(lang === 'en' ? `## Part set: ${s}` : `## 部品の束：${s}`), `${lang} paid without a set has no set pack ${s}`);
    const rep = sizeReport(generate().sizes).find((x) => x.lang === lang && x.worst);
    assert.ok(rep && rep.level === (rep.kb > PAID_PACK_KB ? 'warn' : 'ok'), `${lang} paid worst case is a warning only: ${rep && rep.kb}`);
  }
});
// Gemini cuts a pasted text (owner's test, 2026-11-05: at 32,173 UTF-16 units of LF text, 32,682 counting CRLF). The free pack is never
// offered as a file (New step 4), so it must stay under that on its own, with the learner's brief (~300 characters) in the same box.
// Some browsers paste with CRLF, so each line feed counts 2: UTF-16 units + line feeds <= 31,000 (decided with the maintainers 2026-11-06;
// en ~30.85K, ja ~22K). When this trips: first trim the common pack text (with eval A on the result), and only if that is not enough
// the parts' English descriptions in the parts library (egatari/components).
ok('the single-set drop order: the maintainers\' list, every standard part outside the core four', () => {
  assert.deepEqual([...SINGLE_SET_DROP_ORDER], ['m-fishbone', 'm-quad', 'm-cycle', 'm-venn', 'm-tree', 'm-timeline', 'm-menu', 'm-kpi', 'm-compare', 'm-cards', 'm-pie', 'm-scatter', 'm-curves']);
  const outside = STD.filter((t) => !FREE_CORE.includes(t));
  assert.deepEqual(outside.filter((t) => !SINGLE_SET_DROP_ORDER.includes(t)), []);
  assert.ok(SINGLE_SET_DROP_ORDER.every((t) => STD.includes(t)));
});
// The free plan's fitter (fitSize in kit/core/llm-pack-assemble.mjs) caps every free pack at min(45 KB, 31,000 of these) (2026-11-06), so the
// guard covers every set combination New… can tick, ja and en: the pack New… and kit/llm-pack.mjs copy after fitting (fitPack: the core four
// shortened, then specialized parts left out, largest first) must fit. The standard pack as assembled (no fit at all) must fit on its own.
ok('free pack fits a Gemini paste with the brief: UTF-16 units + line feeds <= 31,000, ja and en: the standard pack as assembled, and the fitted pack of every combination of part sets', () => {
  assert.equal(FREE_PASTE_UNITS, 31000);
  const units = (text) => { const lf = (text.match(/\n/g) || []).length; return { lf, n: text.length + lf }; };
  for (const lang of ['en', 'ja']) {
    const text = buildPack({ sets: [], lang, plan: 'free' });
    const { lf, n } = units(text);
    assert.equal(pasteUnits(text), n);
    assert.ok(n <= 31000, `${lang} free standard: ${text.length} UTF-16 units + ${lf} line feeds = ${n}, over 31,000 (Gemini cuts a paste at about 32,173; see the comment for what to trim)`);
  }
  let k = 0;
  for (let m = 0; m < 1 << SETS.length; m++) {
    const sets = SETS.filter((_, i) => m & (1 << i));
    for (const lang of ['en', 'ja']) {
      const sizeOf = (tags, short) => fitSize(packWithRequest({ ...partsPackOpts(tags, 'free', { short }), lang }), 'free');
      const f = fitPack(initialParts(sets.map((s) => ({ set: s }))), 'free', { sizeOf, capBytes: capKb('free') * 1024 });
      const text = packWithRequest({ ...partsPackOpts(f.tags, 'free', { short: f.short }), lang });
      const { lf, n } = units(text);
      assert.ok(!f.over && n <= 31000 && packSize(text) <= capKb('free') * 1024, `${lang} free ${sets.join('+') || '(none)'} fitted: ${text.length} UTF-16 units + ${lf} line feeds = ${n}, ${packSize(text)} B`);
      if (sets.length === 1) {
        // 束が 1 つ：中核の 4 つのほかの標準のパーツを決まった順に。選んだ束のパーツと中核の 4 つは外さない。外したものは決まった表のとおり
        assert.ok(f.dropped.every((t) => TIERS.parts[t].tier === 'standard' && !FREE_CORE.includes(t)), `${lang} ${sets[0]}: only standard parts outside the core four left out (${f.dropped})`);
        assert.deepEqual(f.dropped, SINGLE_SET_EXPECTED[lang][sets[0]], `${lang} ${sets[0]}: the parts left out`);
      } else assert.ok(f.dropped.every((t) => TIERS.parts[t].tier === 'specialized'), `${lang} ${sets.join('+')}: only specialized parts left out`);
      k++;
    }
  }
  assert.equal(k, 2 << SETS.length);
});
ok('pack: paid = every standard part + the chosen sets, all described; free = the same parts, with only FREE_CORE and the set parts described; nothing unchosen leaks', () => {
  for (const lang of ['en', 'ja']) for (const plan of AI_PLANS) for (const sets of SET_CHOICES) {
    const text = packWithRequest({ sets, lang, plan });
    const want = [...STD, ...sets.flatMap(ofSet)].sort();
    const what = `${lang} ${plan} ${sets.join('+') || '(none)'}`;
    assert.deepEqual(rowsOf(text), want, what + ': catalogue rows');
    assert.deepEqual(described(text), want.filter((t) => plan === 'paid' || !BRIEF.includes(t)), what + ': described parts');
    assert.deepEqual(loadedParts(sets).sort(), want, what + ': loadedParts is the pack catalogue');
    for (const t of Object.keys(TIERS.parts).filter((x) => !want.includes(x))) assert.ok(!named(text, t), `${what}: ${t} (not chosen) is named`);
  }
  assert.throws(() => buildPack({ sets: ['academic'] }), /unknown part set/);
});
ok('pack: no part used only by the purposes turned off appears anywhere in the copied text (table, catalog, examples, prose), for every single purpose and pair, in both AI plans, within each plan\'s cap', () => {
  const ids = PURPOSES.list.map((p) => p.id);
  const offs = [...ids.map((i) => [i])];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) offs.push([ids[i], ids[j]]);
  offs.push(ids, ['key-number', 'process', 'contents'], ['compare', 'change', 'part-whole']);
  let k = 0;
  const plans = new Set();
  for (const off of offs) {
    const ex = componentsOff(off, PURPOSES);
    if (!ex.length) continue;
    for (const lang of ['en', 'ja']) for (const choice of PLAN_CHOICES) {
      const { sets, plan } = choice;
      assert.ok(capOk(choice, Buffer.byteLength(buildPack({ sets, lang, exclude: ex, off, plan }))), `${lang} ${plan} ${JSON.stringify(sets)} off ${off.join('+')}: over the cap`);
      plans.add(plan);
      const req = choiceRequest({ ...choice, category: 'research', subcategory: 'conference', purposesOff: off }, PURPOSES, lang);
      const whole = packWithRequest({ sets, lang, request: '# R\n\n' + req, exclude: ex, off, plan });
      // 読み込んだ部品（標準と選んだ束）のほかは、どこにも名前が出ない（「使わない」の行も含めて）
      const loaded = new Set(loadedParts(sets));
      for (const t of partsIn(whole)) assert.ok(loaded.has(t), `${lang} ${plan} ${JSON.stringify(sets)} off ${off.join('+')}: ${t} is named but not loaded`);
      const lines = whole.split('\n');
      const dont = lines.filter((l) => /^- (Purposes turned off|使わない言いたいこと)/.test(l));
      assert.ok(dont.length === 1, 'one "do not use" line');
      const rest = lines.filter((l) => !dont.includes(l)).join('\n');
      for (const t of ex) assert.ok(!named(rest, t), `${lang} ${JSON.stringify(sets)} off ${off.join('+')}: ${t} appears`);
      k++;
    }
  }
  assert.ok(k > 1000 && plans.size === 2, `${k} packs checked (${[...plans].join(', ')})`);
  // 共通の見本は m-flow のスライドを除いても形が残る（表紙と箇条書き）
  const cut = packWithRequest({ sets: [], lang: 'en', request: 'R', exclude: ['m-flow'], off: ['process'] });
  assert.ok(cut.includes('```deck.html\n<!DOCTYPE html>') && cut.includes('<h2>Two programs take part</h2>') && !cut.includes('From the address to the screen'));
  assert.ok(!/^\| steps of a process \|/m.test(cut), 'the row of a purpose turned off is not in the table');
});
// 写す文が名前を出す部品（m-…）は、その文の部品の一覧（§3 の表の行か ### の説明）にあるものだけ。
// 一覧から外した部品の名前を、説明や注意の文が出してしまう（これから足す文で起きやすい）のを見つける。CSS の変数（--mm-h）などは数えない
const namedParts = (text) => new Set([...text.matchAll(/(?<![\w-])m-[a-z]+(?:-[a-z]+)*(?![a-z-])/g)].map((m) => m[0]));
const catalogOf = (text) => new Set([...text.matchAll(/^(?:\| `<|### `<)(m-[a-z]+(?:-[a-z]+)*)>`/gm)].map((m) => m[1]));
const notInCatalog = (text) => { const c = catalogOf(text); return [...namedParts(text)].filter((t) => !c.has(t)); };
ok('gen: the size rows (free standard fails over 45 KB, free + a set is only reported, paid pairs fail over 150 KB, the paid worst case warns); a pack over its cap is named with the bytes over and its three largest sections', () => {
  const g = generate();
  const rep = sizeReport(g.sizes);
  for (const lang of ['en', 'ja']) {
    const std = rep.find((x) => x.lang === lang && x.what === 'free standard');
    assert.ok(std && std.max === 45 && std.level !== 'fail', `${lang} free standard: ${std && std.kb} KB`);
    for (const s of SETS) {
      const x = rep.find((y) => y.lang === lang && y.what === 'free standard+' + s);
      assert.ok(x && x.freeSet && x.max === 45 && ['ok', 'over'].includes(x.level), `${lang} free + ${s}`);
      // 新規作成とコマンドが写すのと同じ、目安に収めた指示の大きさ（fitPack。越えるときだけ中核の 4 つも短く）。どの束も 45 KB まで
      const sizeOf = (t, short) => fitSize(packWithRequest({ ...partsPackOpts(t, 'free', { short }), lang }), 'free');
      const tags = initialParts([{ set: s }]), f = fitPack(tags, 'free', { sizeOf, capBytes: 45 * 1024 });
      const fitted = packWithRequest({ ...partsPackOpts(f.tags, 'free', { short: f.short }), lang });
      assert.equal(x.short, sizeOf(tags, false) > 45 * 1024, `${lang} free + ${s}: shortened only when over`);
      assert.ok(x.short === f.short && x.dropped.join() === f.dropped.join() && Math.abs(x.kb * 1024 - packSize(fitted)) < 1 && x.paste === pasteUnits(fitted) && x.kb <= 45 && x.paste <= LIMITS.paste && x.level === 'ok', `${lang} free + ${s}: the reported size ${x.kb} KB, paste length ${x.paste}`);
    }
    for (const p of pairsOf(SETS)) { const x = rep.find((y) => y.lang === lang && y.what === `paid standard+${p.join('+')}`); assert.ok(x && x.paidPair && x.max === 150 && x.level === 'ok', `${lang} paid ${p.join('+')}`); }
    const w = rep.find((y) => y.lang === lang && y.worst);
    assert.ok(w && w.what === 'paid every set' && w.max === 150 && w.level !== 'fail', `${lang} paid worst case never fails`);
  }
  const r = rep.find((x) => x.lang === 'ja' && x.what === 'free standard+kokugo');
  assert.ok(r.short && r.level === 'ok', 'free + kokugo is reported with the core four shortened, within 45 KB');
  const m = overMessage({ ...r, short: false, max: 45 }, g.data);
  const bytes = Buffer.byteLength(buildPack({ sets: ['kokugo'], lang: 'ja' }));
  assert.match(m, new RegExp(`^pack over the cap: plan free, lang ja, part sets kokugo: ${bytes} B, ${bytes - 45 * 1024} B over 45 KB \\(46080 B\\)\\. Largest sections: `));
  assert.equal((m.split('Largest sections: ')[1].match(/\(\d+ B\)/g) || []).length, 3, m);
});
ok('packs name no part outside their own catalog: no set, every single set and every pair × en/ja × plan, and the sweep over purposes turned off', () => {
  let k = 0;
  for (const lang of ['en', 'ja']) for (const plan of AI_PLANS) for (const sets of SET_CHOICES) {
    const t = packWithRequest({ sets, lang, plan });
    assert.deepEqual(notInCatalog(t), [], `${lang} ${plan} ${sets.join('+') || '(none)'}`);
    k++;
  }
  const ids = PURPOSES.list.map((p) => p.id);
  const offs = [...ids.map((i) => [i])];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) offs.push([ids[i], ids[j]]);
  offs.push(ids);
  for (const off of offs) {
    const ex = componentsOff(off, PURPOSES);
    for (const lang of ['en', 'ja']) for (const choice of PLAN_CHOICES.filter((c) => c.plan === 'free')) {
      const req = choiceRequest({ ...choice, category: 'research', subcategory: 'conference', purposesOff: off }, PURPOSES, lang);
      // 「使わない」の 1 行は、外した部品の名前を出してよい（AI に使わないと伝える）
      const t = packWithRequest({ sets: choice.sets, lang, request: '# R\n\n' + req, exclude: ex, off, plan: 'free' }).split('\n').filter((l) => !/^- (Purposes turned off|使わない言いたいこと)/.test(l)).join('\n');
      assert.deepEqual(notInCatalog(t), [], `${lang} free ${choice.sets.join('+') || '(none)'} off ${off.join('+')}`);
      k++;
    }
  }
  assert.ok(k > 1000, k + ' packs');
  assert.deepEqual(notInCatalog('| `<m-bars>` | x |\nuse m-flow here; --mm-h'), ['m-flow'], 'the check finds a part named outside the catalog');
});
ok('pack: turning purposes off removes the parts used only for them from the catalog (standard and sets) and tells the AI', () => {
  const off = componentsOff(['key-number', 'process', 'contents'], PURPOSES);
  assert.deepEqual(off, ['m-cards', 'm-flow', 'm-hissan', 'm-kpi', 'm-menu']);
  const full = packWithRequest({ sets: ['business'], lang: 'en', request: 'R', plan: 'paid' });
  const cut = packWithRequest({ sets: ['business'], lang: 'en', request: 'R', exclude: off, off: ['key-number', 'process', 'contents'], plan: 'paid' });
  assert.ok(full.includes('### `<m-flow>`') && full.includes('### `<m-kpi>`') && full.includes('| `<m-menu>` |'));
  for (const t of off) assert.ok(!cut.includes(t), t + ' nowhere');
  assert.ok(cut.includes('### `<m-bars>`') && cut.includes('### `<m-quad>`'));
  assert.ok(cut.length < full.length);
  assert.ok(!setPart('business', 'ja', { exclude: off }).includes('m-kpi'));
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
// 新しい教材はパーツライブラリ 2 で組む（指示のカタログと同じ。kit/core/config-file.mjs の NEW_LESSON_CATALOGUE）。今ある教材の設定は書き換えない
ok('new lessons select parts library 2: npm run new writes egatari.json with "componentsCatalogue": "2"; the helper keeps other members byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-new-cat2-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/new.mjs'), path.join(dir, 'd'), '--lang', 'en'], { stdio: 'pipe' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'd', 'egatari.json'), 'utf8')), { componentsCatalogue: NEW_LESSON_CATALOGUE });
    assert.equal(NEW_LESSON_CATALOGUE, '2');
    assert.equal(withNewLessonCatalogue('{"docId": "x",  "studio": {"a": 1}}'), '{"docId": "x",  "studio": {"a": 1}, "componentsCatalogue": "2"}');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`new-deck: ${n} ok`);
