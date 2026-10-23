// チャットの AI との行き来の試験（ブラウザは品質チェック（kit/check.mjs）の中だけ）
//   node tools/test-llm.mjs [作業用のフォルダ]
// 1. 指示（共通の本体 docs/authoring-with-llms*.md と系列 docs/llm-parts/*.md）が材料から作り直したものと同じ（make-llm-guide --check）・大きさ・
//    規格の名前・組み立て（kit/core/llm-pack.mjs の buildPack・kit/llm-pack.mjs）・部品の居場所
// 2. 返事から 2 つの囲みを取り出す（kit/core/llm-import.mjs）：名前の付け方・CRLF・前後の文章・閉じていない囲み・囲みなし・重なり
// 3. id を付ける（kit/core/slide-ids.mjs）：見出しが同じスライド・今ある id・直したスライドだけの返事を戻す
// 4. 修正依頼（kit/core/llm-fix.mjs）：エラーの言葉・規格の名前と文章・今のファイル。長いデッキは問題のスライドだけ
// 5. 読みの指定の検査（kit/core/narration-lint.mjs）
// 6. 見本の返事を取り込んで（取り出し → id）組み、品質チェックでエラー 0
// 7. 品質チェックの穴：static のスライドの口述原稿・スライドにない段階の口述原稿（エラー）・読みの指定（警告）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractBlocks, isPatch, mergeSlides, mergeNarration } from '../kit/core/llm-import.mjs';
import { parseCheck } from '../kit/core/check-result.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { buildFixRequest, guideRules, rulesFor, amountOf, cutOffRequest } from '../kit/core/llm-fix.mjs';
import { buildPack, commonBody, seriesPart, requestBody, SERIES, seriesOf, seriesForDeck, componentsIn, packSize, packKb } from '../kit/core/llm-pack.mjs';
import { readingProblems, orphanSteps } from '../kit/core/narration-lint.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { replyOf } from './test-app-llm.mjs';
import { vendorComponents } from './vendor-components.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'motion-llm-'));
fs.mkdirSync(work, { recursive: true });
let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
// 改行は LF にそろえて読む（Windows の checkout で CRLF になっても、組み立ての出力（LF）と同じ物差しで比べる。make-llm-guide.mjs の read と同じ）
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const worked = (name, f) => read('tools', 'llm-guide', 'worked', name, f);
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });
const GUIDE_EN = read('docs', 'authoring-with-llms.md'), GUIDE_JA = read('docs', 'authoring-with-llms.ja.md');
const ALL_EN = buildPack({ series: 'all', lang: 'en' }), ALL_JA = buildPack({ series: 'all', lang: 'ja' });

// ---------------------------------------------------------------- 1. 指示
ok('make-llm-guide --check：指示は材料から作り直したものと同じ', () => {
  const r = node('tools/make-llm-guide.mjs', '--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
ok('指示の大きさ：共通 + 系列 1 つ ≤ 40 KB（目安 35 KB）、全部 ≤ 64 KB。前の全体版・core 版はない', () => {
  for (const lang of ['en', 'ja']) {
    for (const s of SERIES) assert.ok(packSize(buildPack({ series: [s], lang })) <= 40 * 1024, `${lang} common+${s}`);
    assert.ok(packSize(buildPack({ series: 'all', lang })) <= 64 * 1024, `${lang} all`);
  }
  for (const f of ['authoring-with-llms.core.md', 'authoring-with-llms.core.ja.md']) assert.ok(!fs.existsSync(path.join(ROOT, 'docs', f)), f);
});
ok('組み立て：docs と同じ文章・系列の指定（配列・"a,b"・all・[]・重ね・順）・知らない系列は失敗', () => {
  for (const [lang, file] of [['en', GUIDE_EN], ['ja', GUIDE_JA]]) {
    const i = file.search(/^# (Instructions for the AI|AI への指示)\s*$/m);
    assert.equal(file.slice(i), buildPack({ series: [], lang }));
    assert.equal(commonBody(lang) + '\n' + requestBody(lang), buildPack({ series: [], lang }));
    assert.match(requestBody(lang), /^# (What I want|頼みたいこと)\n/);
    for (const s of SERIES) {
      const doc = read('docs', 'llm-parts', `${s}${lang === 'ja' ? '.ja' : ''}.md`).replace(/^<!--[^\n]*-->\n/gm, '');
      assert.equal(doc, seriesPart(s, lang), `${lang} ${s}`);
      assert.equal(buildPack({ series: [s], lang }), commonBody(lang) + '\n' + seriesPart(s, lang) + '\n' + requestBody(lang));
    }
    assert.equal(buildPack({ series: ['info', 'academic', 'info'], lang }), buildPack({ series: 'academic,info', lang }));
    assert.equal(buildPack({ series: 'all', lang }), buildPack({ series: SERIES, lang }));
  }
  assert.throws(() => buildPack({ series: ['math'], lang: 'en' }), /unknown series "math"/);
  const cli = node('kit/llm-pack.mjs', '--series', 'kokugo,academic', '--lang', 'ja');
  assert.equal(cli.status, 0, cli.stderr); assert.equal(cli.stdout, buildPack({ series: ['academic', 'kokugo'], lang: 'ja' }));
  // --list：--lang がなければ en と ja の両方の列、あれば その言語の大きさ（UTF-8 のバイト数 / 1024。編集アプリと同じ packKb）
  const kbx = (series, lang) => packKb(buildPack({ series, lang })) + ' KB';
  const list = node('kit/llm-pack.mjs', '--list');
  assert.ok(list.status === 0 && list.stdout.includes(`common\t${kbx([], 'en')}\t${kbx([], 'ja')}\tm-bars, m-flow, m-menu\n`) && list.stdout.includes(`kokugo\t${kbx(['kokugo'], 'en')}\t${kbx(['kokugo'], 'ja')}\tm-gendai, m-kanbun, m-kobun\n`) && /^all\t/m.test(list.stdout), list.stdout);
  const listJa = node('kit/llm-pack.mjs', '--list', '--lang', 'ja');
  assert.ok(listJa.status === 0 && listJa.stdout.includes(`common\t${kbx([], 'ja')}\tm-bars`) && listJa.stdout.includes(`academic\t${kbx(['academic'], 'ja')}\t`) && kbx([], 'ja') !== kbx([], 'en'), listJa.stdout);
  const listEn = node('kit/llm-pack.mjs', '--list', '--lang=en');
  assert.ok(listEn.status === 0 && listEn.stdout.includes(`common\t${kbx([], 'en')}\tm-bars`), listEn.stdout);
  // --help / -h：使い方を出す（指示の文章ではない）
  for (const h of ['--help', '-h']) {
    const r = node('kit/llm-pack.mjs', h);
    assert.ok(r.status === 0 && /^usage: node kit\/llm-pack\.mjs/.test(r.stdout) && !r.stdout.includes('Instructions for the AI'), h + ': ' + r.stdout.slice(0, 200));
  }
  const badOpt = node('kit/llm-pack.mjs', '--sereis', 'academic');
  assert.ok(badOpt.status === 2 && /unknown option --sereis/.test(badOpt.stderr) && /usage:/.test(badOpt.stderr), badOpt.stderr);
});
ok('部品の居場所：どの部品もちょうど 1 か所（共通か 1 つの系列）。共通の部品は系列に重ねない・README に series がなければ作れない', () => {
  const dirs = vendorComponents(ROOT).filter((c) => fs.existsSync(path.join(c.dir, 'README.md'))).map((c) => c.name);
  for (const lang of ['en', 'ja']) {
    const common = commonBody(lang), parts = Object.fromEntries(SERIES.map((s) => [s, seriesPart(s, lang)]));
    for (const c of dirs) {
      const head = `### \`<m-${c}>\``, where = seriesOf('m-' + c);
      assert.ok(where === 'common' || SERIES.includes(where), c);
      const places = [['common', common], ...Object.entries(parts)].filter(([, t]) => t.split('\n').includes(head)).map(([n]) => n);
      assert.deepEqual(places, [where], `${lang} m-${c}: ${places}`);
    }
    // m-flow のお金の流れは business の拡張（共通の本体には入らない）
    assert.ok(parts.business.includes('`<m-flow>`') && /kind/.test(parts.business) && !/`money`/.test(common), 'm-flow money flows in business');
  }
  for (const [tag, s] of [['m-menu', 'common'], ['m-flow', 'common'], ['m-bars', 'common'], ['m-sweep', 'academic'], ['m-collect', 'academic'], ['m-kpi', 'business'], ['m-quad', 'business'], ['m-market', 'business'], ['m-kanbun', 'kokugo'], ['m-kobun', 'kokugo'], ['m-gendai', 'kokugo'], ['m-codetree', 'info'], ['m-nothing', null]]) assert.equal(seriesOf(tag), s, tag);
  // README に series のない部品があれば、作り直しは失敗する（写しの部品フォルダで確かめる）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-llm-pack-'));
  for (const d of ['tools', 'docs', 'vendor', 'themes', 'kit', 'components.lock.json']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true, filter: (p) => !/node_modules/.test(p) });
  const kpi = vendorComponents(tmp).find((c) => c.name === 'kpi');
  const rd = path.join(kpi.dir, 'README.md');
  fs.writeFileSync(rd, fs.readFileSync(rd, 'utf8').replace(/^series: .*\r?\n/m, ''));
  const r = spawnSync(process.execPath, ['tools/make-llm-guide.mjs', '--check'], { cwd: tmp, encoding: 'utf8' });
  assert.ok(r.status !== 0 && /vendor\/components\/kpi\/[^/]+\/README\.md has no frontmatter series/.test(r.stderr), r.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
});
ok('デッキから系列を推す：部品・テーマ・layout-tate', () => {
  assert.deepEqual(seriesForDeck(worked('business', 'deck.html')), ['business']);
  assert.deepEqual(seriesForDeck(worked('academic', 'deck.html')), ['academic']);
  assert.deepEqual(seriesForDeck(worked('kokugo', 'deck.html')), ['kokugo']);
  assert.deepEqual(seriesForDeck(worked('common', 'deck.html')), []);
  assert.deepEqual(seriesForDeck('<html data-theme="default"><section class="slide layout-tate"><m-codetree></m-codetree><m-sweep></m-sweep></section>'), ['academic', 'kokugo', 'info']);
  assert.deepEqual(componentsIn('<m-kpi a="1"><m-kpi><m-foo></m-foo><m-bars>'), ['m-bars', 'm-kpi']);
});
ok('規格の名前は英語と日本語で同じ・規格は共通の本体だけにある・見本は 4 つとも入っている・部品はすべて一覧にある', () => {
  const en = [...guideRules(GUIDE_EN).keys()], ja = [...guideRules(GUIDE_JA).keys()];
  assert.deepEqual(en, ja);
  assert.deepEqual([...guideRules(ALL_EN).keys()], en);
  for (const s of SERIES) assert.equal(guideRules(seriesPart(s, 'en')).size, 0, s);
  for (const r of ['R-output', 'R-noids', 'R-headings', 'R-title', 'R-concl', 'R-fit', 'R-narr-steps', 'R-reading', 'R-formula', 'R-marks', 'R-colors']) assert.ok(en.includes(r), r);
  for (const g of [ALL_EN, ALL_JA]) {
    for (const t of ['m-flow', 'm-sweep', 'm-kpi', 'm-bars', 'm-kanbun']) assert.ok(g.includes('```deck.html') && g.includes(`<${t}`), t);
    for (const c of vendorComponents(ROOT).filter((x) => fs.existsSync(path.join(x.dir, 'README.md'))).map((x) => x.name)) assert.ok(g.includes(`\`<m-${c}>\``), c);
    assert.ok(!/<!--\s*llm:/.test(g), 'llm markers are removed');
  }
  assert.ok(!/demo\.html/.test(ALL_EN), 'no repository-only pointers');
});

// ---------------------------------------------------------------- 2. 取り出し
const D = '<!DOCTYPE html>\n<html lang="ja"><body><div id="stage">\n<section class="slide"><h2>A</h2></section>\n</div></body></html>';
const N = '## A\n[0] あ。';
ok('囲みの名前：deck.html / narration.md・html / markdown・title="…"・html:deck.html・~~~・前の行のファイル名', () => {
  for (const [a, b] of [['deck.html', 'narration.md'], ['html', 'markdown'], ['html title="deck.html"', 'md title="narration.md"'], ['html:deck.html', 'markdown:narration.md'], ['HTML', 'Markdown']]) {
    const r = extractBlocks(`前置き\n\n\`\`\`${a}\n${D}\n\`\`\`\n\n\`\`\`${b}\n${N}\n\`\`\`\n後書き`);
    assert.equal(r.error, null, a); assert.equal(r.deck.trim(), D); assert.equal(r.narration.trim(), N);
  }
  const t = extractBlocks(`~~~html\n${D}\n~~~\n~~~\n${N}\n~~~`);
  assert.equal(t.deck.trim(), D); assert.equal(t.narration.trim(), N);
  const p = extractBlocks(`**narration.md**\n\`\`\`\n${N}\n\`\`\`\n\n### deck.html\n\`\`\`\n${D}\n\`\`\``);
  assert.equal(p.deck.trim(), D); assert.equal(p.narration.trim(), N);
});
ok('CRLF・BOM・4 つの ` の囲み', () => {
  const r = extractBlocks('﻿' + replyOf(D, N, { crlf: true }));
  assert.equal(r.error, null); assert.ok(!r.deck.includes('\r') && !r.narration.includes('\r'));
  const f = extractBlocks(`\`\`\`\`deck.html\n${D}\n\`\`\`\`\n\`\`\`\`narration.md\n${N}\n\`\`\`\``);
  assert.equal(f.deck.trim(), D);
});
ok('閉じていない囲み → unclosed（返事が切れた）。閉じ忘れの次に名前付きの囲みが来れば、そこで閉じる', () => {
  const r = extractBlocks(`\`\`\`deck.html\n${D}\n\`\`\`\n\n\`\`\`narration.md\n## A\n[0] あ`);
  assert.equal(r.error.code, 'unclosed'); assert.equal(r.error.kind, 'narration'); assert.equal(r.error.line, 8);
  const r2 = extractBlocks(`\`\`\`deck.html\n<!DOCTYPE html><html><body><section class="slide"><h2>A`);
  assert.equal(r2.error.code, 'unclosed');
  const a = extractBlocks(`\`\`\`deck.html\n${D}\n\n\`\`\`narration.md\n${N}\n\`\`\``);
  assert.equal(a.error, null); assert.equal(a.deck.trim(), D); assert.equal(a.narration.trim(), N);
  assert.ok(a.warnings.some((w) => w.code === 'autoclosed'));
  const a2 = extractBlocks(`\`\`\`html\n${D}\n\n\`\`\`markdown\n${N}\n\`\`\``);
  assert.equal(a2.error, null); assert.equal(a2.deck.trim(), D); assert.equal(a2.narration.trim(), N);
  const e = extractBlocks(`\`\`\`deck.html\n${D}\n\`\`\`\n\`\`\`narration.md\n${N}\n\`\`\`\n\`\`\`\n`);   // 末尾の余分な ```
  assert.equal(e.error, null);
});
ok('囲みなし → no-blocks。deck がない → no-deck。画面から写した文字（囲みなし）→ <!DOCTYPE> … </html> と後ろの口述原稿', () => {
  assert.equal(extractBlocks('ごめんなさい、できません。').error.code, 'no-blocks');
  assert.equal(extractBlocks(`\`\`\`markdown\n${N}\n\`\`\``).error.code, 'no-deck');
  const u = extractBlocks(`html\nCopy code\n${D}\nmarkdown\nCopy code\n${N}\n`);
  assert.equal(u.error, null); assert.equal(u.deck.trim(), D); assert.equal(u.narration.trim(), N);
  assert.ok(u.warnings.some((w) => w.code === 'unfenced'));
});
ok('同じファイルの囲みが 2 つ → 最後のもの（知らせる）。説明の囲みは使わない', () => {
  const D2 = D.replace('<h2>A</h2>', '<h2>A2</h2>');
  const r = extractBlocks(`\`\`\`html\n${D}\n\`\`\`\n直しました：\n\`\`\`html\n${D2}\n\`\`\`\n\`\`\`js\nconsole.log(1)\n\`\`\`\n\`\`\`markdown\n${N}\n\`\`\``);
  assert.equal(r.deck.trim(), D2);
  assert.ok(r.warnings.some((w) => w.code === 'several' && w.kind === 'deck' && w.n === 2) && r.warnings.some((w) => w.code === 'ignored'));
});

// ---------------------------------------------------------------- 3. id
ok('見本の返事に id を付ける：どのスライドにも、見出しは {#id}。2 回目は何も変えない', () => {
  const r = extractBlocks(replyOf(worked('business', 'deck.html'), worked('business', 'narration.md')));
  const a = assignIds(r.deck, r.narration, { byOrder: true });
  assert.equal(a.problems.length, 0); assert.equal(a.added.length, 3);
  for (const s of a.added) { assert.match(s.id, /^s-[a-z2-7]{6}$/); assert.ok(a.deck.includes(`id="${s.id}"`) && a.narration.includes(`{#${s.id}}`)); }
  const b = assignIds(a.deck, a.narration, { byOrder: true });
  assert.equal(b.added.length, 0); assert.equal(b.deck, a.deck); assert.equal(b.narration, a.narration);
});
ok('見出しが同じスライド（取り込み）：口述原稿の同じ見出しの節を出てきた順に対応させる。今ある id はそのまま', () => {
  const deck = '<section class="slide" id="s-keepme"><h2>まとめ</h2></section><section class="slide"><h2>まとめ</h2><div class="concl"><span>x</span></div></section><section class="slide"><h2>まとめ</h2></section>';
  const narr = '## まとめ {#s-keepme}\n[0] 一。\n\n## まとめ\n[0] 二。\n\n## まとめ\n[0] 三。\n';
  const a = assignIds(deck, narr, { byOrder: true });
  assert.equal(a.problems.length, 0);
  const [id2, id3] = a.added.map((x) => x.id);
  assert.ok(a.deck.includes('id="s-keepme"') && id2 !== id3);
  assert.equal(a.narration, `## まとめ {#s-keepme}\n[0] 一。\n\n## まとめ {#${id2}}\n[0] 二。\n\n## まとめ {#${id3}}\n[0] 三。\n`);
  assert.ok(assignIds(deck, narr).problems.length > 0, 'without byOrder (npm run ids) duplicates are refused');
});
ok('直したスライドだけの返事：id で元の場所に戻す（ほかのスライドと節はそのまま）', () => {
  const deck = '<!DOCTYPE html><html><body><div id="stage">\n<section class="slide" id="s-aaaaaa"><h2>一</h2></section>\n<section class="slide" id="s-bbbbbb"><h2>二</h2></section>\n</div></body></html>\n';
  const patch = '<section class="slide" id="s-bbbbbb"><h2>二（直した）</h2></section>';
  assert.ok(isPatch(patch) && !isPatch(deck));
  const m = mergeSlides(deck, patch);
  assert.deepEqual(m.replaced, ['s-bbbbbb']);
  assert.ok(m.deck.includes('<h2>一</h2>') && m.deck.includes('二（直した）') && !m.deck.includes('<h2>二</h2>'));
  const narr = '# 口述原稿\n\n## 一 {#s-aaaaaa}\n[0] いち。\n\n## 二 {#s-bbbbbb}\n[0] に。\n[1] 余り。\n';
  const mn = mergeNarration(narr, '## 二（直した） {#s-bbbbbb}\n[0] に、直した。\n');
  assert.equal(mn.narration, '# 口述原稿\n\n## 一 {#s-aaaaaa}\n[0] いち。\n\n## 二（直した） {#s-bbbbbb}\n[0] に、直した。\n');
  assert.deepEqual(mergeSlides(deck, '<section class="slide" id="s-zzzzzz"><h2>x</h2></section>').replaced, []);
});

// ---------------------------------------------------------------- 4. 修正依頼
ok('修正依頼：エラーの言葉・規格の名前と指示の文章・今のファイル・2 つの囲みで返す頼み', () => {
  const deck = worked('academic', 'deck.html'), narration = worked('academic', 'narration.md');
  const a = assignIds(deck, narration, { byOrder: true });
  const probs = [
    { sev: 'error', i: 1, title: 'The decay law', code: 'titleLongEn', text: 'title is 72 characters (max 60)' },
    { sev: 'error', i: 2, title: 'x', code: 'orphanNarration', text: 'Narration for a step the slide does not have [5]' },
    { sev: 'warn', i: null, title: '', msg: 'narration: スライドが見つからない「## Foo」', text: 'narration: スライドが見つからない「## Foo」' },
  ];
  const r = buildFixRequest({ problems: probs, deck: a.deck, narration: a.narration, lang: 'en' });
  const rules = guideRules(GUIDE_EN);
  assert.ok(r.text.includes('title is 72 characters (max 60) — R-title'));
  assert.ok(r.text.includes(`- **R-title** ${rules.get('R-title')}`) && r.text.includes(`- **R-narr-steps** ${rules.get('R-narr-steps')}`) && r.text.includes('**R-headings**'));
  assert.ok(r.text.includes(`(id ${a.added[1].id})`));
  assert.ok(r.text.includes('````deck.html\n' + a.deck.trim()) && r.text.includes('````narration.md\n' + a.narration.trim()));
  assert.ok(/exactly two fenced code blocks/.test(r.text) && r.partial === false);
  // 使っている部品の説明（指示と同じ文章）
  assert.deepEqual(r.components, ['m-sweep']);
  assert.ok(r.text.includes('## Components used in this deck') && r.text.includes(seriesPart('academic', 'en').match(/### `<m-sweep>`[\s\S]*?(?=\n### )/)[0].trim()));
  // 前の guide の引数：知らせて無視する（規格は指示の共通の本体から）
  const warned = [], cw = console.warn;
  console.warn = (...x) => warned.push(x.join(' '));
  try {
    const g = buildFixRequest({ problems: probs, deck: a.deck, narration: a.narration, guide: '- **R-title** something else', lang: 'en' });
    assert.equal(g.text, r.text);
  } finally { console.warn = cw; }
  assert.ok(warned.length === 1 && /guide argument is no longer used/.test(warned[0]), warned.join('|'));
  const ja = buildFixRequest({ problems: probs, deck: a.deck, narration: a.narration, lang: 'ja' });
  assert.ok(ja.text.includes(`- **R-title** ${guideRules(GUIDE_JA).get('R-title')}`) && ja.text.includes('2 つのコードの囲み') && ja.text.includes('## この教材で使っている部品'));
  assert.deepEqual(rulesFor({ code: 'readingExpr' }), ['R-reading', 'R-formula']);
});
ok('長いデッキの修正依頼：問題のあるスライドとその節だけ（id 付き）を載せ、そのスライドだけを返してもらう', () => {
  const a = assignIds(worked('business', 'deck.html'), worked('business', 'narration.md'), { byOrder: true });
  const id = a.added[2].id;
  const r = buildFixRequest({ problems: [{ sev: 'error', i: 2, title: 't', code: 'overflowBottom', text: 'body overflows at the bottom (600px)' }], deck: a.deck, narration: a.narration, lang: 'en', limit: 1000 });
  assert.ok(r.partial && r.slides.length === 1 && r.slides[0] === id);
  assert.deepEqual(r.components, ['m-bars'], 'only the components of the included slide');
  const deckPart = r.text.match(/````deck\.html\n([\s\S]*?)\n````/)[1];
  assert.ok(deckPart.startsWith(`<section class="slide" id="${id}">`) && !deckPart.includes('<html') && !deckPart.includes(a.added[1].id));
  const narrPart = r.text.match(/````narration\.md\n([\s\S]*?)\n````/)[1];
  assert.ok(narrPart.startsWith(`## 拠点ごとの 1 日の出荷 {#${id}}`) && !narrPart.includes('導入から'));
  assert.ok(/only those <section> elements/.test(r.text));
});

ok('修正依頼の量の目安：はみ出しは「何 px・およそ何行」、小さい字は「何 px から 24px 以上へ」。切れた返事は送り直しを頼む', () => {
  assert.match(amountOf({ code: 'bodyBottom', data: { px: 583, lim: 565 } }, 'en'), /^cut 18 px from the body \(about 1 line of 46 px\)/);
  assert.match(amountOf({ code: 'overflowBottom', data: '662 > 565' }, 'ja'), /^本文を 97 px（46 px の行でおよそ 3 行）減らす/);
  assert.match(amountOf({ code: 'smallSvgText', data: { px: '23.2' } }, 'en'), /^raise the text from 23\.2px to at least 24px \(for an inline <svg>, make the viewBox width equal to the displayed width/);
  assert.match(amountOf({ code: 'smallText', data: '20px「注」' }, 'ja'), /^字を 20px から 27px 以上に上げる/);
  assert.equal(amountOf({ code: 'titleLong', data: { n: 30 } }, 'en'), '');
  const a = assignIds(worked('business', 'deck.html'), worked('business', 'narration.md'), { byOrder: true });
  const r = buildFixRequest({ problems: [{ sev: 'error', i: 1, title: 't', code: 'bodyBottom', rule: 'R-fit', data: { px: 662, lim: 565 }, text: 'x' }], deck: a.deck, narration: a.narration, lang: 'en' });
  assert.ok(r.text.includes('x → cut 97 px from the body (about 3 lines of 46 px)') && r.text.includes('— R-fit'));
  assert.match(cutOffRequest({ kind: 'narration', line: 40 }, 'en'), /cut off \(the narration\.md block is not closed\)\. Send only the narration\.md block again/);
  assert.match(cutOffRequest({ kind: 'deck', line: 3 }, 'ja'), /枚数を減らした短い形で/);
  // 切れた返事でも、閉じている deck.html は返す
  const cut = extractBlocks(`\`\`\`deck.html\n${D}\n\`\`\`\n\`\`\`narration.md\n## A\n[0] あ`);
  assert.equal(cut.error.code, 'unclosed'); assert.equal(cut.deck.trim(), D);
});

// ---------------------------------------------------------------- 5. 読みの指定
ok('読みの指定：1 つの記号・用語はよい。式・記号の組は知らせる', () => {
  for (const s of ['{θ|シータ}', '{N₀|エヌゼロ}', '{x̄|エックスバー}', '{ReLU|レルー}', '{t-SNE|ティースニー}', '{f(x)|エフエックス}', '{論語|ろんご}', '{mark:eta|circle}η', '{λ|lambda}', '{x^2|エックスじじょう}', '{\\theta|シータ}', '{Q*|キュースター}']) assert.deepEqual(readingProblems(s), [], s);
  for (const [s, why] of [['{1-η|いちマイナスイータ}', 'operator'], ['{a+b|エープラスビー}', 'operator'], ['{x^2+1|エックスじじょうたすいち}', 'operator'], ['{a*b|エーかけるビー}', 'operator'], ['{θとη|シータとイータ}', 'several'], ['{x y|エックスワイ}', 'several'], ['{a, b|エー、ビー}', 'several'], ['{p(x|y)|…}', null]]) {
    const p = readingProblems(s);
    if (why === null) continue;
    assert.equal(p.length, 1, s); assert.equal(p[0].why, why, s);
  }
});
ok('スライドにない段階（orphanSteps）', () => {
  const segs = parseNarration('## a\n[0] x\n[1] y\n[concl] z\n\n## b\n[0] x\n[2] y\n[concl] z\n');
  const o = orphanSteps(segs, [{ key: 'a', max: 2, cstep: 2, static: false }, { key: 'b', max: 1, cstep: -1, static: false }]);
  assert.deepEqual(o.map((x) => `${x.slideKey}:${x.stepKey}`), ['b:2', 'b:concl']);
});

// ---------------------------------------------------------------- 6. 見本の返事を取り込んで組み、検査
for (const name of ['common', 'academic', 'business', 'kokugo']) {
  ok(`取り込み → 検査（${name}）：エラー 0、どのスライドにも id`, () => {
    const r = extractBlocks(replyOf(worked(name, 'deck.html'), worked(name, 'narration.md'), { crlf: name === 'kokugo' }));
    assert.equal(r.error, null);
    const a = assignIds(r.deck, r.narration, { byOrder: true });
    const d = path.join(work, 'import-' + name);
    fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'deck.html'), a.deck); fs.writeFileSync(path.join(d, 'narration.md'), a.narration);
    const c = node('kit/check.mjs', path.join(d, 'deck.html'), '--json');
    const j = parseCheck(c.stdout, c.status);   // 検査が終わっていない（終了コード 2）ときは例外（エラー 0 と取り違えない）
    assert.equal(j.counts.error, 0, JSON.stringify(j.results.filter((x) => x.sev === 'error')));
    assert.equal(j.counts.warn, 0, JSON.stringify(j.results.filter((x) => x.sev === 'warn')));
    assert.ok(!j.results.some((x) => /legacy/.test(x.msg)));
  });
}

// ---------------------------------------------------------------- 7. 品質チェックの穴
ok('品質チェック：static の表紙の口述原稿がない → 警告。スライドにない段階 [k]・結論のないスライドの [concl] → エラー。読みの指定 → 警告', () => {
  const d = path.join(work, 'gaps');
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>穴</title></head><body><div id="stage">
<section class="slide cover noconcl static" id="s-cover1"><h1>表紙</h1></section>
<section class="slide" id="s-steps1"><h2>段階のスライド</h2><div class="body"><ul><li>一</li><li>二</li></ul></div><div class="concl"><span>結論</span></div></section>
<section class="slide noconcl" id="s-nocon1"><h2>結論のないスライド</h2><div class="body"><p>本文</p></div></section>
</div></body></html>
`);
  fs.writeFileSync(path.join(d, 'narration.md'), `# 口述原稿

## 表紙 {#s-cover1}

## 段階のスライド {#s-steps1}
[0] 始めます。
[1] 一つ目、{1-η|いちマイナスイータ} です。
[2] 二つ目、{θとη|シータとイータ} です。
[3] 三つ目はありません。
[concl] 結論です。

## 結論のないスライド {#s-nocon1}
[0] 本文です。
[concl] 結論はありません。
`);
  const c = node('kit/check.mjs', path.join(d, 'deck.html'), '--json');
  const j = JSON.parse(c.stdout);
  const has = (sev, slide, re) => j.results.some((x) => x.sev === sev && x.slide === slide && re.test(x.msg));
  assert.ok(has('warn', 1, /^スライド 1「表紙」（s-cover1）、段階 0：この段階の口述原稿がない：narration.md のこのスライドの節に \[0\] の行を書く/), 'static cover narration');
  assert.ok(has('error', 2, /段階 3：口述原稿の \[3\] に当たる段階がスライドにない.*番号が 0〜2 と結論.*使える鍵は \[0\] \[1\] \[2\] \[concl\].*前の段階 \[2\].*data-step="3".*直す行：.*「\[3\] 三つ目はありません。」.*（R-narr-steps）$/), 'orphan [3]');
  assert.ok(has('error', 3, /口述原稿の \[concl\] に当たる段階がスライドにない.*使える鍵は \[0\]。.*前の段階 \[0\].*結論の行/), 'orphan [concl]');
  assert.ok(has('warn', 2, /読みの指定 \{1-η\|いちマイナスイータ\} が式を読んでいる/), 'reading operator');
  assert.ok(has('warn', 2, /読みの指定 \{θとη\|シータとイータ\} に記号が 2 つ以上/), 'reading several');
  // JSON の形：slide・id・key・title（見出しの字）・step・code・rule・msg（docs/reference.md「品質チェック」）
  const o = j.results.find((x) => x.code === 'narrOrphan' && x.slide === 2);
  assert.deepEqual({ slide: o.slide, id: o.id, key: o.key, title: o.title, step: o.step, sev: o.sev, code: o.code, rule: o.rule },
    { slide: 2, id: 's-steps1', key: 's-steps1', title: '段階のスライド', step: '3', sev: 'error', code: 'narrOrphan', rule: 'R-narr-steps' });
  assert.equal(j.lang, 'ja');
  assert.deepEqual(o.data.range, { ja: '0〜2 と concl', en: 'steps 0–2 and concl' });
  // 英語の言葉（--lang en）
  const ce = node('kit/check.mjs', path.join(d, 'deck.html'), '--json', '--lang', 'en');
  const je = JSON.parse(ce.stdout);
  assert.ok(je.lang === 'en' && je.results.some((x) => x.code === 'narrOrphan' && /^Slide 2 “段階のスライド” \(s-steps1\), step 3: narration \[3\] has no matching step/.test(x.msg)));
  assert.ok(je.results.some((x) => x.code === 'narrMissing' && /add a \[0\] line/.test(x.msg)));
  assert.equal(c.status, 1);
});

ok('品質チェック：です・ます の指摘は、どこ（id・見出し）・何が違うか・どう直すか・規格の名前を言う', () => {
  const d = path.join(work, 'desu');
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage">
<section class="slide noconcl static" id="s-desu01"><h2>丁寧すぎる</h2><div class="body"><p>これは例です。</p></div></section>
</div></body></html>
`);
  fs.writeFileSync(path.join(d, 'narration.md'), '## 丁寧すぎる {#s-desu01}\n[0] 例です。\n');
  const j = JSON.parse(node('kit/check.mjs', path.join(d, 'deck.html'), '--json').stdout);
  const e = j.results.find((x) => x.code === 'desuMasu');
  assert.ok(e && e.sev === 'error' && e.rule === 'R-style' && e.id === 's-desu01' && e.title === '丁寧すぎる', JSON.stringify(e));
  assert.match(e.msg, /^スライド 1「丁寧すぎる」（s-desu01）：スライドの字に です・ます がある（「これは例です」）：スライドは常体.*（R-style）$/);
});

ok('fix request: the ask forbids Canvas, slide-making and file features and wants the two blocks in the chat body (en, ja)', () => {
  const p = [{ sev: 'error', text: 'x', i: null, code: 'x' }];
  const en = buildFixRequest({ problems: p, deck: '<section class="slide" id="s1"><h2>a</h2></section>', lang: 'en' });
  const ja = buildFixRequest({ problems: p, deck: '<section class="slide" id="s1"><h2>a</h2></section>', lang: 'ja' });
  assert.match(en.text, /Do not use Canvas, slide-making or file features: reply in the body of your chat message with exactly two fenced code blocks/);
  assert.match(ja.text, /Canvas・スライド作成・ファイルの機能は使わず、チャットの返事の本文に、ちょうど 2 つのコードの囲み/);
});

console.log(`llm: ${n} ok (${work})`);
