// test-all: unit
// サンプルの情報（sample.json。kit/core/sample-info.mjs・tools/examples-portable.mjs の readSample。backlog #130）
//   node tools/test-sample-info.mjs
// - 一覧のサンプル（tools/examples-portable.mjs の EXAMPLES）はどれも sample.json を持ち、正しい
// - 中身が原稿と合う：構成の行はスライドの数と同じで、見出しは各スライドの見出し。パーツは原稿が使うもの。言語は <html lang>、テーマは <html data-theme>
//   （原稿のテーマが新しく選べないものなら、選べるテーマ）。本は article/ があるときだけ
// - 構成を添えた指示：無料のプランで目安に収まる（サンプルのパーツは外す候補にしない）。添える節は約 300 トークン（字数の上限）
// - 正しくない sample.json を断る（形・分類・パーツ・字数・権利）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSample, sampleStructureRequest, SAMPLE_LIMITS } from '../kit/core/sample-info.mjs';
import { CATEGORIES, partsList, recommend, initialParts, choiceRequest, capKb, withChoice, choiceOf } from '../kit/core/new-deck.mjs';
import { partsPackOpts, fitPack, PACK_CAP_KB } from '../kit/core/llm-pack.mjs';
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

console.log(fails ? `test-sample-info: ${fails} failed` : 'test-sample-info: all passed');
process.exit(fails ? 1 : 0);
