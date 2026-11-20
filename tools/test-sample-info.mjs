// test-all: unit
// サンプルの情報（sample.json。kit/core/sample-info.mjs・tools/examples-portable.mjs の readSample。backlog #130）
//   node tools/test-sample-info.mjs
// - 一覧のサンプル（tools/examples-portable.mjs の EXAMPLES）はどれも sample.json を持ち、正しい
// - 中身が原稿と合う：構成の行はスライドの数と同じで、見出しは各スライドの見出し。パーツは原稿が使うもの。言語は <html lang>、テーマは <html data-theme>
//   （原稿のテーマが新しく選べないものなら、選べるテーマ）。本は article/ があるときだけ
// - 構成を添えた指示：無料のプランで目安に収まり、サンプルのパーツが説明つきで先に入る（順位で組む。handoff #43 ④）。添える節は約 300 トークン（字数の上限）
// - 正しくない sample.json を断る（形・分類・パーツ・字数・権利）
// - 「このサンプルを参考に作る」（sampleChoice・fromSamplePack。目安は fitSize）：サンプルの伝えたいこと・題材・読み手を選び、サンプルのパーツを順位の一番上に。
//   同梱のサンプルはどれも、どの言語・プランでも目安に収まり、サンプルのパーツが説明つきで入る
// - 本のあるサンプル（本文 article.md か article/ と sample.json の book: true）：指示はちょうど 1 行（サンプルにも本があり、本は Claude Code で作る）だけ増える。
//   同梱の heikin-chuouchi（article/）と rashomon（article.md）は本がある。本があるかは組んだ 1 ファイルの索引の article で決める（buildExamples の book）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSample, sampleStructureRequest, SAMPLE_LIMITS } from '../kit/core/sample-info.mjs';
import { CATEGORIES, partsList, choiceRequest, capKb, withChoice, choiceOf, rankParts, audienceOf } from '../kit/core/new-deck.mjs';
import { PACK_CAP_KB, fitSize, pasteUnits } from '../kit/core/llm-pack.mjs';
import { packText as packTextOf, fromSamplePack, sampleProblems, sampleLabels, REQUEST_WORDS, newDeckPack, sampleTheme, fromSampleStart, sampleChoice } from '../kit/core/new-deck-pack.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';
import { packWithRequest, filledRequest } from '../kit/core/llm-request.mjs';
import { CHOOSABLE, RETIRED } from '../kit/core/themes-list.mjs';
import { FROM_SAMPLE as EXAMPLES, readSample, buildExamples } from './examples-portable.mjs';   // 「このサンプルを参考に作る」に使えるもの（パーツ図鑑は再生だけ）

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const LISTED = partsList(null).flatMap((g) => g.parts);
const ctx = { categories: CATEGORIES, parts: LISTED };
// サンプルのパーツが順位の一番上で、説明つきのパーツはその先頭から（詳細の指示ではサンプルのパーツは全部説明つき）。少なくとも 1 つは説明つき
const sampleFirst = (S, r, plan) => [...r.described, ...r.named].slice(0, S.parts.length).sort().join() === [...S.parts].sort().join() && r.described.length > 0
  && (plan !== 'paid' || S.parts.every((t) => r.described.includes(t)));
const norm = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, '');

console.log(`free plan limit: ${PACK_CAP_KB.free} KB`);
// 本があるか：サンプルを組んだ 1 ファイルの索引に article があるか（tools/examples-portable.mjs の book。本文は article.md でも article/ でもよい）
const builtTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-sample-built-'));
let BUILT;
try { BUILT = new Map((await buildExamples(builtTmp)).map((x) => [x.name, x])); } finally { fs.rmSync(builtTmp, { recursive: true, force: true }); }
// 本のあるサンプル：フォルダに article/ か article.md がある（sample.json の book: true と照らす）
const BOOKS = EXAMPLES.filter((n) => fs.existsSync(path.join(ROOT, 'examples', n, 'article')) || fs.existsSync(path.join(ROOT, 'examples', n, 'article.md')));
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
  // 同梱でないテーマ（教材の中だけのテーマ）は誤りにしない（引き継ぐときに default。sampleTheme）。警告だけ
  if (!CHOOSABLE.some((t) => t.name === s.theme)) console.log(`  warn ${name}: theme ${s.theme} is not a bundled theme New… offers; “Make one based on this sample” uses default`);
  else ok(s.theme === theme || RETIRED.includes(theme), `${name}: theme ${s.theme} is choosable and is the deck’s (${theme})`);
  ok(BUILT.has(name) && s.book === BUILT.get(name).book, `${name}: book is ${s.book}, and the built file's index ${BUILT.has(name) && BUILT.get(name).book ? 'has' : 'has no'} article`);
  // 構成を添えた指示（軽量の指示、画面の言語は両方）：順位で組み、サンプルのパーツは一番上（説明つきで入る）
  for (const L of ['ja', 'en']) {
    const order = sampleChoice(s, { lang: L }).order;
    const base = filledRequest({ kind: 'A', values: { title: L === 'ja' ? 'てこのはたらき' : 'How levers work' } }, L) + `- theme: ${s.theme}\n` + choiceRequest({ category: s.category, subcategory: s.subcategory }, null, L) + '\n';
    const st = sampleStructureRequest(s, 'X'.repeat(40), L);
    const a = newDeckPack({ order, plan: 'free', lang: L, request: base }), b = newDeckPack({ order, plan: 'free', lang: L, request: base + '\n' + st });
    ok(!b.over && sampleFirst(s, b, 'free'), `${name} (${L}): with the structure the light instructions fit: ${(a.bytes / 1024).toFixed(2)} → ${(b.bytes / 1024).toFixed(2)} KB (structure ${(Buffer.byteLength(st) / 1024).toFixed(2)} KB; described ${a.described.length} → ${b.described.length}); the sample’s parts come first`);
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

// ---------------------------------------------------------------- ラベル（伝えたいこと・題材・読み手。handoff #43）
// id の一覧は同梱のパーツ集の manifest から作った材料のもの（Studio に書かない）。なくてもよく、空の配列（どれにも合う）も受ける
{
  const T = PACK.tiers, L = sampleLabels(), m = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'components-2', `manifest-${T.catalogue}.json`), 'utf8'));
  ok(['purposes', 'subjects', 'audiences'].every((k) => JSON.stringify(L[k]) === JSON.stringify(m[k].map((x) => x.id))),
    `the label ids come from the default catalogue's manifest (${T.catalogue}: ${L.purposes.length} purposes, ${L.subjects.length} subjects, ${L.audiences.length} audiences)`);
  const lctx = { ...ctx, labels: L };
  const lcodes = (o) => validateSample(o, lctx).map((e) => `${e.path} ${e.code}`).sort().join(', ');
  const p0 = L.purposes[0], s0 = L.subjects[0], a0 = L.audiences[0];
  ok(lcodes({ ...good(), purposes: [p0], subjects: [s0], audiences: [a0] }) === '' && lcodes({ ...good(), subjects: [] }) === '' && lcodes(good()) === '',
    'accepts known labels, an empty list and no labels');
  for (const [what, o, want] of [
    ['labels not an array', { ...good(), subjects: s0 }, 'subjects not-array'],
    ['unknown label', { ...good(), audiences: ['adults'] }, 'audiences[0] unknown'],
    ['duplicate label', { ...good(), purposes: [p0, p0] }, 'purposes[1] duplicate'],
    ['label not an id', { ...good(), subjects: ['Statistics'] }, 'subjects[0] not-id'],
  ]) ok(lcodes(o) === want, `rejects ${what}: ${lcodes(o) || '(nothing)'}`);
  ok(validateSample({ ...good(), audiences: ['anything'] }).length === 0, 'without label lists, only the shape of labels is checked');
  ok(Object.values(T.parts).some((x) => x.subjects) && Object.values(T.parts).some((x) => x.audiences), 'the parts in the tiers carry their subjects and audiences from the manifest');
}

// ---------------------------------------------------------------- 引き継ぐテーマ（sampleTheme）
// 「このサンプルを参考に作る」が引き継ぐのは同梱の選べるテーマ（CHOOSABLE）だけ。ほかは default。
// わけ：紹介のためのサンプルは、Egatari のロゴを入れた教材の中だけのテーマ（ブランドのテーマ）を使うことがあり、それを利用者の教材に渡してはならない
const themeDirs = fs.readdirSync(path.join(ROOT, 'themes'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
ok(JSON.stringify([...CHOOSABLE.map((t) => t.name), ...RETIRED].sort()) === JSON.stringify(themeDirs), `the bundled themes are the choosable ones and the retired ones (themes/: ${themeDirs.join(', ')})`);
ok(CHOOSABLE.every((t) => sampleTheme(t.name) === t.name) && RETIRED.every((n) => sampleTheme(n) === 'default') && sampleTheme('egatari-brand') === 'default' && sampleTheme(undefined) === 'default',
  'sampleTheme: a bundled theme New… offers is kept; a retired or unknown one becomes default');
{
  const brand = { ...readSample('pitch-fictional'), theme: 'egatari-brand' };
  ok(!sampleProblems(brand).length, 'a sample.json with a theme that is not bundled is still valid (a warning in this test, not an error)');
  for (const L of ['ja', 'en']) {
    const r = fromSamplePack({ sample: { ...brand, title: 'T', name: 'pitch-fictional' }, lang: L, plan: 'free', second: { title: 'X' } });
    ok(r.text.includes(REQUEST_WORDS[L].themeLine('default')) && !r.text.includes('egatari-brand'), `unknown theme (${L}): the from-sample pack asks for theme default and never names the sample's own theme`);
  }
  // 新しい教材：編集アプリは ③ のテーマを fromSampleStart の theme から始め、作成で <html data-theme> に入れる（app/llm.js）
  const st = fromSampleStart(brand);
  ok(st.theme === 'default' && st.category === brand.category && st.subcategory === brand.subcategory, `unknown theme: the new lesson starts with theme default (${JSON.stringify(st)})`);
  ok(fromSampleStart(readSample('kokugo-kanbun')).theme === 'kokugo', 'a bundled theme is carried over to the new lesson (kokugo-kanbun → kokugo)');
}

// ---------------------------------------------------------------- 「このサンプルを参考に作る」の ④（sampleChoice・fromSamplePack。handoff #43 ④）
// サンプルの伝えたいこと・題材・読み手（授業（小・中・高）は学校）を選び、② の言葉に当たった題材を足す。順位はサンプルのパーツが一番上
{
  const K = readSample('kokugo-kanbun'), P = readSample('pitch-fictional');
  const k = sampleChoice(K, { title: '論語を読む', lang: 'ja' });
  ok(JSON.stringify(k.purposes) === JSON.stringify(K.purposes) && K.subjects.every((x) => k.subjects.includes(x)) && k.order.slice(0, K.parts.length).sort().join() === [...K.parts].sort().join()
    && (K.audiences.length ? k.school === K.audiences.find((a) => ['primary-junior', 'high-school'].includes(a)) && k.audience === k.school : k.school === null),
    `sampleChoice (kokugo-kanbun, a school lesson): the sample's purposes, subjects and school level; its parts first (${k.order.slice(0, K.parts.length).join(', ')})`);
  const g = sampleChoice({ ...K, subjects: [] }, { title: '統計の授業', lang: 'ja' });
  ok(g.subjects.includes('statistics'), 'sampleChoice: a subject guessed from the title of step 2 is added: ' + g.subjects.join(', '));
  const p = sampleChoice(P, { lang: 'en' });
  ok(p.school === null && p.audience === audienceOf(P.category, P.subcategory) && JSON.stringify(p.order) === JSON.stringify(rankParts({ purposes: P.purposes, subjects: P.subjects, audience: p.audience, first: P.parts })),
    `sampleChoice (pitch-fictional, business): the audience comes from step 1 (${p.audience}), the order is rankParts with the sample's parts first`);
}
// 同梱のサンプルはどれも、どの言語・プランでも目安に収まり、サンプルのパーツが順位の一番上（上から説明つきで入る。詳細の指示では全部。
// 軽量の指示で入りきらないときは、サンプルのパーツの残りも名前だけ：英語の quarterly-report は m-timeline が入らない）
for (const name of EXAMPLES) for (const L of ['ja', 'en']) for (const plan of ['free', 'paid']) {
  const S = readSample(name);
  const r = fromSamplePack({ sample: { ...S, title: 'T', name }, lang: L, plan, second: { title: L === 'ja' ? '題' : 'Topic' } });
  ok(!r.over && fitSize(r.text, plan) <= PACK_CAP_KB[plan] * 1024 && sampleFirst(S, r, plan) && r.text.startsWith(L === 'ja' ? '# AI への指示' : '# Instructions for the AI'),
    `${name} from-sample (${L}, ${plan}): fits with the sample's parts first (${r.bytes} bytes, paste length ${pasteUnits(r.text)}; ${r.described.length} described, ${r.named.length} by name only)`);
}

// ---------------------------------------------------------------- 本のあるサンプル
// 本のある 2 つ（heikin-chuouchi・rashomon）は sample.json が book: true で、本のない指示（book: false にしたもの）と比べる。
// ほかのサンプルは、フォルダの写しに article/ を足し、sample.json を book: true にして比べる
ok(BOOKS.every((n) => readSample(n).book === true) && EXAMPLES.filter((n) => !BOOKS.includes(n)).every((n) => readSample(n).book === false),
  `the samples with a book (${BOOKS.join(', ')}) have sample.json book: true; the others have book: false`);
const bookTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-sample-book-'));
try {
  for (const name of EXAMPLES) {
    let plain, read;
    if (BOOKS.includes(name)) {
      // 本のあるサンプル：そのままの sample.json（book: true）と、book: false にした本のない指示
      read = readSample(name);
      plain = { ...read, book: false };
      ok(read.book === true && !sampleProblems(read).length && BUILT.get(name).book, `${name} has a book: sample.json is valid with book: true, and the built file's index has the article`);
    } else {
      const dir = path.join(bookTmp, name);
      fs.cpSync(path.join(ROOT, 'examples', name), dir, { recursive: true, filter: (f) => !/[\\/](out|\.cache)$/.test(f) });
      fs.mkdirSync(path.join(dir, 'article'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'article', 'chapter1.md'), '# 1\n\nText.\n');
      plain = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
      fs.writeFileSync(path.join(dir, 'sample.json'), JSON.stringify({ ...plain, book: true }, null, 2) + '\n');
      read = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
      ok(!sampleProblems(read).length && read.book === fs.existsSync(path.join(dir, 'article')), `${name} with a book: sample.json is valid and book matches article/`);
    }
    for (const L of ['ja', 'en']) for (const plan of ['free', 'paid']) {
      const second = { title: L === 'ja' ? '論語を読む' : 'Reading the Analects' };
      // 本の行を足すと指示は 1 行ぶん大きくなり、上限の際にある組では説明つきのパーツが 1 つ減ることがある（正しい振る舞い）。
      // そこで本のない指示は、本の行つきの指示と同じ説明つき・名前だけのパーツで組んで比べる（違うのは本の行だけのはず）
      const plainSample = { ...plain, title: 'T', name };
      const aReq = fromSamplePack({ sample: plainSample, lang: L, plan, second }).request;
      const bp = fromSamplePack({ sample: { ...read, title: 'T', name }, lang: L, plan, second });
      const a = packTextOf({ described: bp.described, named: bp.named, plan, lang: L, request: aReq }).split('\n');
      const plainOver = fromSamplePack({ sample: plainSample, lang: L, plan, second }).over;
      ok(!plainOver && !bp.over && fitSize(bp.text, plan) <= capKb(plan) * 1024 && sampleFirst(plainSample, bp, plan),
        `${name} (${L}, ${plan}) with a book: the pack stays within the cap with the sample's parts first (${bp.bytes} bytes, paste length ${pasteUnits(bp.text)})`);
      const b = bp.text.split('\n');
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      const one = b.length === a.length + 1 && JSON.stringify([...b.slice(0, i), ...b.slice(i + 1)]) === JSON.stringify(a);
      ok(one && b[i] === REQUEST_WORDS[L].sampleBook && /Claude Code/.test(b[i]) && (L === 'ja' ? /本/.test(b[i]) : /\bbook\b/.test(b[i])),
        `${name} (${L}, ${plan}) with a book: the from-sample pack changes by exactly one line, the book line: ${JSON.stringify(b[i])}`);
    }
  }
} finally { fs.rmSync(bookTmp, { recursive: true, force: true }); }

console.log(fails ? `test-sample-info: ${fails} failed` : 'test-sample-info: all passed');
process.exit(fails ? 1 : 0);
