// test-all: unit
// サンプルの情報（sample.json。kit/core/sample-info.mjs・tools/examples-portable.mjs の readSample。backlog #130）
//   node tools/test-sample-info.mjs
// - 一覧のサンプル（tools/examples-portable.mjs の EXAMPLES）はどれも sample.json を持ち、正しい
// - 中身が原稿と合う：構成の行はスライドの数と同じで、見出しは各スライドの見出し。パーツは原稿が使うもの。言語は <html lang>、テーマは <html data-theme>
//   （原稿のテーマが新しく選べないものなら、選べるテーマ）。本は article/ があるときだけ
// - 構成を添えた指示：無料のプランで目安に収まる（サンプルのパーツは外す候補にしない）。添える節は約 300 トークン（字数の上限）
// - 正しくない sample.json を断る（形・分類・パーツ・字数・権利）
// - 「このサンプルのように作る」の収め方（fitSample・fromSamplePack）：pitch の無料のプランの指示は m-bars・m-flow の説明を詳しいまま目安に収まる。
//   越えたときの順（① サンプルにない中核の 4 つを短く → ② サンプルにない専門のパーツを外す → ③ 最後にサンプルのパーツを短く）を作った材料で確かめる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSample, sampleStructureRequest, SAMPLE_LIMITS } from '../kit/core/sample-info.mjs';
import { CATEGORIES, partsList, recommend, initialParts, choiceRequest, capKb, withChoice, choiceOf } from '../kit/core/new-deck.mjs';
import { partsPackOpts, fitPack, PACK_CAP_KB, FREE_CORE } from '../kit/core/llm-pack.mjs';
import { fitSample } from '../kit/core/llm-pack-assemble.mjs';
import { fromSamplePack, samplePackFit } from '../kit/core/new-deck-pack.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';
import { packWithRequest, filledRequest } from '../kit/core/llm-request.mjs';
import { CHOOSABLE, RETIRED } from '../kit/core/themes-list.mjs';
import { EXAMPLES, readSample } from './examples-portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const LISTED = partsList(null).flatMap((g) => g.parts);
const ctx = { categories: CATEGORIES, parts: LISTED };
const norm = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, '');

console.log(`free plan limit: ${PACK_CAP_KB.free} KB`);
for (const name of EXAMPLES) {
  const dir = path.join(ROOT, 'examples', name);
  let s = null;
  try { s = readSample(name); } catch (e) { ok(false, `${name}: sample.json is valid (${e.message})`); continue; }
  ok(validateSample(s, ctx).length === 0, `${name}: sample.json is valid`);
  const deck = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
  const secs = deck.split(/<section\b/).slice(1);
  const heads = secs.map((x) => { const m = x.match(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/); return m ? norm(m[2]) : ''; });
  ok(s.structure.length === secs.length, `${name}: one structure row per slide (${s.structure.length} / ${secs.length})`);
  const off = s.structure.map((r, i) => (heads[i] && heads[i].includes(norm(r.heading)) ? null : `${i + 1}: ${r.heading} ≠ ${heads[i]}`)).filter(Boolean);
  ok(!off.length, `${name}: each row’s heading is that slide’s heading${off.length ? ' — ' + off.join('; ') : ''}`);
  const used = new Set([...deck.matchAll(/<(m-[a-z0-9-]+)/g)].map((m) => m[1]));
  ok(s.parts.every((t) => used.has(t)) && [...used].filter((t) => LISTED.includes(t)).every((t) => s.parts.includes(t)), `${name}: parts are the listed parts the deck uses (${s.parts.join(', ')})`);
  const lang = (deck.match(/<html[^>]*\blang="([^"]+)"/) || [])[1], theme = (deck.match(/<html[^>]*\bdata-theme="([^"]+)"/) || [])[1];
  ok(s.lang === lang, `${name}: lang is <html lang> (${lang})`);
  ok(CHOOSABLE.some((t) => t.name === s.theme) && (s.theme === theme || RETIRED.includes(theme)), `${name}: theme ${s.theme} is choosable and is the deck’s (${theme})`);
  ok(s.book === fs.existsSync(path.join(dir, 'article')), `${name}: book is ${s.book}`);
  // 構成を添えた指示（無料のプラン、画面の言語は両方）：初めの印（標準と小分類のおすすめ）にサンプルのパーツ
  for (const L of ['ja', 'en']) {
    const ticks = [...new Set([...initialParts(recommend({ sub: s.subcategory, text: '', lang: L })), ...s.parts])];
    const base = filledRequest({ kind: 'A', values: { title: L === 'ja' ? 'てこのはたらき' : 'How levers work' } }, L) + `- theme: ${s.theme}\n` + choiceRequest({ category: s.category, subcategory: s.subcategory }, null, L) + '\n';
    const st = sampleStructureRequest(s, 'X'.repeat(40), L);
    const fit = (req) => fitPack(ticks, 'free', { sizeOf: (tags, short) => Buffer.byteLength(packWithRequest({ ...partsPackOpts(tags, 'free', { short }), lang: L, request: req })), capBytes: capKb('free') * 1024, keep: s.parts });
    const a = fit(base), b = fit(base + '\n' + st);
    ok(!b.over && s.parts.every((t) => b.tags.includes(t)), `${name} (${L}): with the structure the free plan fits after fitting: ${(a.bytes / 1024).toFixed(2)} → ${(b.bytes / 1024).toFixed(2)} KB (structure ${(Buffer.byteLength(st) / 1024).toFixed(2)} KB${b.dropped.length ? ', drops ' + b.dropped.join(' ') : ''}${b.short ? ', short core' : ''}); the sample’s parts stay`);
  }
}

// 添える節の形
const S0 = readSample('kokugo-kanbun');
const ja = sampleStructureRequest(S0, '漢文を読む', 'ja'), en = sampleStructureRequest(S0, 'Kanbun', 'en');
ok(ja.startsWith('## 倣うサンプルの構成\n\nサンプル「漢文を読む」の構成と見せ方に倣って') && ja.includes('\n1. ' + S0.structure[0].heading + ' — ' + S0.structure[0].point + '\n') && ja.includes('サンプルの文・例・数字は使わない'),
  'structure section (ja): heading, lead, one numbered row per slide');
ok(en.startsWith('## Structure of the sample to follow\n\nFollow the structure and presentation of the sample “Kanbun”.') && en.includes('\n1. ' + S0.structure[0].heading + ' — '), 'structure section (en): English lead, the sample’s own headings');

// studio.newDeck の fromSample
const cfg = withChoice(null, { plan: 'free', category: 'teaching', subcategory: 'class', parts: ['m-kanbun'], fromSample: 'kokugo-kanbun' });
ok(choiceOf(cfg).fromSample === 'kokugo-kanbun' && !('fromSample' in choiceOf(withChoice(null, { plan: 'free', category: 'teaching', subcategory: 'class', parts: [] })))
  && !('fromSample' in choiceOf(withChoice(null, { plan: 'free', fromSample: '../x' }))), 'studio.newDeck: fromSample is kept when it is a sample name, and left out otherwise');

// 断る
const good = () => JSON.parse(JSON.stringify(S0));
const codes = (o) => validateSample(o, ctx).map((e) => `${e.path} ${e.code}`).sort().join(', ');
const cases = [
  ['not an object', [], ' not-object'],
  ['unknown key', { ...good(), title: 'x' }, 'title unknown-key'],
  ['version', { ...good(), v: 2 }, 'v version'],
  ['empty request', { ...good(), request: '' }, 'request not-text'],
  ['request with padding', { ...good(), request: ' x' }, 'request not-text'],
  ['long request', { ...good(), request: 'あ'.repeat(SAMPLE_LIMITS.request + 1) }, 'request too-long'],
  ['unknown category', { ...good(), category: 'cooking' }, 'category unknown'],
  ['unknown subcategory', { ...good(), subcategory: 'pitch' }, 'subcategory unknown'],
  ['missing subcategory', (() => { const o = good(); delete o.subcategory; return o; })(), 'subcategory missing'],
  ['theme name', { ...good(), theme: '../x' }, 'theme not-name'],
  ['parts not array', { ...good(), parts: 'm-kanbun' }, 'parts not-array'],
  ['bad tag', { ...good(), parts: ['kanbun'] }, 'parts[0] not-tag'],
  ['duplicate part', { ...good(), parts: ['m-kanbun', 'm-kanbun'] }, 'parts[1] duplicate'],
  ['unlisted part', { ...good(), parts: ['m-codetree'] }, 'parts[0] unknown'],
  ['empty structure', { ...good(), structure: [] }, 'structure not-array'],
  ['too many rows', { ...good(), structure: Array.from({ length: SAMPLE_LIMITS.rows + 1 }, () => ({ heading: 'h', point: 'p' })) }, 'structure too-many'],
  ['row extra key', { ...good(), structure: [{ heading: 'h', point: 'p', body: 'x' }] }, 'structure[0] not-row'],
  ['row without point', { ...good(), structure: [{ heading: 'h', point: '' }] }, 'structure[0].point not-text'],
  ['long heading', { ...good(), structure: [{ heading: 'h'.repeat(SAMPLE_LIMITS.heading + 1), point: 'p' }] }, 'structure[0].heading too-long'],
  ['long structure', { ...good(), structure: Array.from({ length: 12 }, () => ({ heading: 'h'.repeat(SAMPLE_LIMITS.heading), point: 'p'.repeat(SAMPLE_LIMITS.point) })) }, 'structure too-long'],
  ['book not boolean', { ...good(), book: 'no' }, 'book not-boolean'],
  ['lang', { ...good(), lang: 'fr' }, 'lang unknown'],
  ['rights missing', (() => { const o = good(); delete o.rights; return o; })(), 'rights not-object'],
  ['license not SPDX', { ...good(), rights: { license: 'CC BY 4.0', attribution: 'x' } }, 'rights.license not-spdx'],
  ['no attribution', { ...good(), rights: { license: 'CC-BY-4.0', attribution: '' } }, 'rights.attribution not-text'],
  ['rights extra key', { ...good(), rights: { license: 'CC-BY-4.0', attribution: 'x', url: 'y' } }, 'rights.url unknown-key'],
  ['control character', { ...good(), request: 'a\u0007b' }, 'request not-text'],
];
for (const [what, o, want] of cases) ok(codes(o) === want, `rejects ${what}: ${codes(o) || '(nothing)'}`);
ok(validateSample({ ...good(), category: 'other', subcategory: null }, ctx).length === 0 && validateSample({ ...good(), subcategory: null }, ctx).length === 0, 'accepts subcategory null (Other, None of these)');
ok(validateSample({ ...good(), category: 'nope', parts: ['m-nope'] }).length === 0, 'without categories and parts, only the shape is checked');

// ---------------------------------------------------------------- 「このサンプルのように作る」の収め方（kit/core/llm-pack-assemble.mjs の fitSample）
// pitch：m-bars・m-flow は中核の 4 つ、m-kpi・m-quad はほかの標準のパーツ。無料のプランでもサンプルのパーツは詳しく（説明の節 ### `<m-…>` がある）
const entryOf = (t, L) => PACK[L].components[t].entry.trim().split('\n')[0];
for (const L of ['ja', 'en']) for (const plan of ['free', 'paid']) {
  const P = readSample('pitch-fictional');
  const r = fromSamplePack({ sample: { ...P, title: 'Pitch', name: 'pitch-fictional' }, lang: L, plan, second: { title: L === 'ja' ? '新しい事業の提案' : 'A new business' } });
  const fullIn = P.parts.filter((t) => PACK[L].components[t].set === 'standard').every((t) => r.text.includes(entryOf(t, L)));
  ok(r.bytes <= PACK_CAP_KB[plan] * 1024 && !r.over && P.parts.every((t) => r.tags.includes(t)) && fullIn && r.text.includes(entryOf('m-bars', L)) && r.text.includes(entryOf('m-flow', L)) && !r.ownShortened.length,
    `pitch from-sample (${L}, ${plan}): ${(r.bytes / 1024).toFixed(2)} KB under ${PACK_CAP_KB[plan]} KB, the sample's parts kept with their full descriptions (m-bars, m-flow, m-kpi, m-quad)` +
    (r.shortened.length ? `; shortened ${r.shortened.join(', ')}` : '') + (r.dropped.length ? `; left out ${r.dropped.join(', ')}` : ''));
  if (plan === 'free') ok(!r.shortened.some((t) => P.parts.includes(t)) && r.shortened.every((t) => FREE_CORE.includes(t)), `pitch from-sample (${L}): only core parts the sample does not use are shortened (${r.shortened.join(', ') || 'none'})`);
  // 編集アプリ：［候補を外す］の後（外したパーツを除いた印）でもう一度収めても同じ指示（外すものはもうない）
  const again = samplePackFit({ tags: r.tags, plan, lang: L, request: r.request, own: P.parts });
  ok(again.text === r.text && !again.dropped.length, `pitch from-sample (${L}, ${plan}): fitting again after unticking gives the same instructions (the editor after Untick these)`);
}
// 越えたときの順：作った材料（標準 6 つ：中核の 4 つ ＋ s-a・s-b、専門 x-a・x-b・x-own）。大きさは詳しい標準 100・1 行だけの標準 10・専門 200（x-a）・150（x-b）・50（x-own）
const FAKE = { en: { components: Object.fromEntries([...FREE_CORE.map((t) => [t, { set: 'standard' }]), ['s-a', { set: 'standard' }], ['s-b', { set: 'standard' }],
  ['x-a', { set: 'xs' }], ['x-b', { set: 'xs' }], ['x-own', { set: 'xs' }]]) } };
const SPEC = { 'x-a': 200, 'x-b': 150, 'x-own': 50 };
const fsize = (tags, full) => tags.reduce((n, t) => n + (SPEC[t] || ((full || FREE_CORE.concat(['s-a', 's-b'])).includes(t) ? 100 : 10)), 0);
const ALL = [...FREE_CORE, 's-a', 's-b', 'x-a', 'x-b', 'x-own'];
const OWN = ['m-bars', 'm-flow', 's-a', 'x-own'];   // サンプルのパーツ：中核の 2 つ・ほかの標準 1 つ・専門 1 つ
const fit = (cap, plan = 'free') => fitSample(FAKE, ALL, plan, { sizeOf: fsize, capBytes: cap, own: OWN });
// 詳しい：中核の 4 つ ＋ s-a = 500、s-b = 10、専門 400 → 910
let f = fit(1000);
ok(!f.shortened.length && !f.dropped.length && !f.ownShortened.length && f.bytes === 910 && f.full.join() === [...FREE_CORE, 's-a'].sort().join(), 'fitSample: under the cap nothing is cut; the sample\'s standard parts (s-a too) are in full');
f = fit(850);
ok(f.shortened.length === 1 && ['m-menu', 'm-predict'].includes(f.shortened[0]) && !f.dropped.length && !f.ownShortened.length && f.bytes <= 850,
  `fitSample step 1: a little over, one core part the sample does not use is shortened (${f.shortened.join(', ')}), nothing else`);
f = fit(700);
ok(f.step1Shortened.slice().sort().join() === 'm-menu,m-predict' && f.dropped.join() === 'x-a' && !f.ownShortened.length && f.tags.includes('x-own') && f.bytes <= 700,
  `fitSample step 2: with the other core parts shortened and still over, specialized parts the sample does not use are left out, largest first (${f.dropped.join(', ')})`);
f = fit(350);
ok(f.dropped.slice().sort().join() === 'x-a,x-b' && f.tags.includes('x-own') && f.ownShortened.length > 0 && f.ownShortened.every((t) => OWN.includes(t)) && f.shortened.slice().sort().join() === 'm-menu,m-predict' && f.bytes <= 350 && f.step1Shortened.slice().sort().join() === 'm-menu,m-predict',
  `fitSample step 3: only with nothing else to cut are the sample's own standard parts shortened (${f.ownShortened.join(', ')}); its specialized part stays`);
f = fit(100);
ok(f.over && f.tags.includes('x-own') && f.ownShortened.slice().sort().join() === ['m-bars', 'm-flow', 's-a'].sort().join(), 'fitSample: far over, every cut is made and the sample\'s parts stay ticked; still over is reported');
f = fit(850, 'paid');
ok(f.full === null && !f.shortened.length && !f.ownShortened.length && f.dropped.join() === 'x-a' && f.tags.includes('x-own'), 'fitSample (paid): nothing is shortened; specialized parts the sample does not use are left out');
// 1 で短くした分は、外した後に収まれば戻る（外した後の印でもう一度 1 から）
f = fitSample(FAKE, ALL, 'free', { sizeOf: (tags, full) => fsize(tags, full) + (tags.includes('x-a') ? 300 : 0), capBytes: 900, own: OWN });
ok(f.dropped.join() === 'x-a' && !f.shortened.length && f.step1Shortened.length === 2 && f.bytes <= 900, 'fitSample: once a part is left out, the core parts are described in full again if they fit');

console.log(fails ? `test-sample-info: ${fails} failed` : 'test-sample-info: all passed');
process.exit(fails ? 1 : 0);
