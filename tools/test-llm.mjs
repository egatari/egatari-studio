// チャットの AI との行き来の試験（ブラウザは検査器（kit/check.mjs）の中だけ）
//   node tools/test-llm.mjs [作業用のフォルダ]
// 1. 指示（docs/authoring-with-llms*.md）が材料から作り直したものと同じ（make-llm-guide --check）・大きさ・決まりの名前
// 2. 返事から 2 つの囲みを取り出す（kit/core/llm-import.mjs）：名前の付け方・CRLF・前後の文章・閉じていない囲み・囲みなし・重なり
// 3. id を付ける（kit/core/slide-ids.mjs）：見出しが同じスライド・今ある id・直したスライドだけの返事を戻す
// 4. 直しの依頼（kit/core/llm-fix.mjs）：エラーの言葉・決まりの名前と文章・今のファイル。長いデッキは問題のスライドだけ
// 5. 読みの指定の検査（kit/core/narration-lint.mjs）
// 6. 見本の返事を取り込んで（取り出し → id）組み、検査器でエラー 0
// 7. 検査器の穴：static のスライドの口述原稿・スライドにない段階の口述原稿（エラー）・読みの指定（警告）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractBlocks, isPatch, mergeSlides, mergeNarration } from '../kit/core/llm-import.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { buildFixRequest, guideRules, rulesFor } from '../kit/core/llm-fix.mjs';
import { readingProblems, orphanSteps } from '../kit/core/narration-lint.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { replyOf } from './test-app-llm.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'motion-llm-'));
fs.mkdirSync(work, { recursive: true });
let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const worked = (name, f) => read('tools', 'llm-guide', 'worked', name, f);
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });
const GUIDE_EN = read('docs', 'authoring-with-llms.md'), GUIDE_JA = read('docs', 'authoring-with-llms.ja.md');

// ---------------------------------------------------------------- 1. 指示
ok('make-llm-guide --check：指示は材料から作り直したものと同じ', () => {
  const r = node('tools/make-llm-guide.mjs', '--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
ok('指示の大きさ：全体版 < 60 KB、core 版 < 30 KB', () => {
  for (const f of ['authoring-with-llms.md', 'authoring-with-llms.ja.md']) assert.ok(Buffer.byteLength(read('docs', f)) < 60 * 1024, f);
  for (const f of ['authoring-with-llms.core.md', 'authoring-with-llms.core.ja.md']) assert.ok(Buffer.byteLength(read('docs', f)) < 30 * 1024, f);
});
ok('決まりの名前は英語と日本語で同じ・見本は 3 つとも入っている・部品はすべて一覧にある', () => {
  const en = [...guideRules(GUIDE_EN).keys()], ja = [...guideRules(GUIDE_JA).keys()];
  assert.deepEqual(en, ja);
  for (const r of ['R-output', 'R-noids', 'R-headings', 'R-title', 'R-concl', 'R-fit', 'R-narr-steps', 'R-reading', 'R-formula', 'R-marks', 'R-colors']) assert.ok(en.includes(r), r);
  for (const g of [GUIDE_EN, GUIDE_JA]) {
    for (const t of ['m-sweep', 'm-kpi', 'm-bars', 'm-kanbun']) assert.ok(g.includes('```deck.html') && g.includes(`<${t}`), t);
    for (const c of fs.readdirSync(path.join(ROOT, 'components')).filter((x) => fs.existsSync(path.join(ROOT, 'components', x, 'README.md')))) assert.ok(g.includes(`\`<m-${c}>\``), c);
  }
  assert.ok(!/demo\.html/.test(GUIDE_EN), 'no repository-only pointers');
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

// ---------------------------------------------------------------- 4. 直しの依頼
ok('直しの依頼：エラーの言葉・決まりの名前と指示の文章・今のファイル・2 つの囲みで返す頼み', () => {
  const deck = worked('academic', 'deck.html'), narration = worked('academic', 'narration.md');
  const a = assignIds(deck, narration, { byOrder: true });
  const probs = [
    { sev: 'error', i: 1, title: 'The decay law', code: 'titleLongEn', text: 'title is 72 characters (max 60)' },
    { sev: 'error', i: 2, title: 'x', code: 'orphanNarration', text: 'Narration for a step the slide does not have [5]' },
    { sev: 'warn', i: null, title: '', msg: 'narration: スライドが見つからない「## Foo」', text: 'narration: スライドが見つからない「## Foo」' },
  ];
  const r = buildFixRequest({ problems: probs, deck: a.deck, narration: a.narration, guide: GUIDE_EN, lang: 'en' });
  const rules = guideRules(GUIDE_EN);
  assert.ok(r.text.includes('title is 72 characters (max 60) — R-title'));
  assert.ok(r.text.includes(`- **R-title** ${rules.get('R-title')}`) && r.text.includes(`- **R-narr-steps** ${rules.get('R-narr-steps')}`) && r.text.includes('**R-headings**'));
  assert.ok(r.text.includes(`(id ${a.added[1].id})`));
  assert.ok(r.text.includes('````deck.html\n' + a.deck.trim()) && r.text.includes('````narration.md\n' + a.narration.trim()));
  assert.ok(/exactly two fenced code blocks/.test(r.text) && r.partial === false);
  const ja = buildFixRequest({ problems: probs, deck: a.deck, narration: a.narration, guide: GUIDE_JA, lang: 'ja' });
  assert.ok(ja.text.includes(`- **R-title** ${guideRules(GUIDE_JA).get('R-title')}`) && ja.text.includes('2 つのコードの囲み'));
  assert.deepEqual(rulesFor({ code: 'readingExpr' }), ['R-reading', 'R-formula']);
});
ok('長いデッキの直しの依頼：問題のあるスライドとその節だけ（id 付き）を載せ、そのスライドだけを返してもらう', () => {
  const a = assignIds(worked('business', 'deck.html'), worked('business', 'narration.md'), { byOrder: true });
  const id = a.added[2].id;
  const r = buildFixRequest({ problems: [{ sev: 'error', i: 2, title: 't', code: 'overflowBottom', text: 'body overflows at the bottom (600px)' }], deck: a.deck, narration: a.narration, guide: GUIDE_EN, lang: 'en', limit: 1000 });
  assert.ok(r.partial && r.slides.length === 1 && r.slides[0] === id);
  const deckPart = r.text.match(/````deck\.html\n([\s\S]*?)\n````/)[1];
  assert.ok(deckPart.startsWith(`<section class="slide" id="${id}">`) && !deckPart.includes('<html') && !deckPart.includes(a.added[1].id));
  const narrPart = r.text.match(/````narration\.md\n([\s\S]*?)\n````/)[1];
  assert.ok(narrPart.startsWith(`## 拠点ごとの 1 日の出荷 {#${id}}`) && !narrPart.includes('導入から'));
  assert.ok(/only those <section> elements/.test(r.text));
});

// ---------------------------------------------------------------- 5. 読みの指定
ok('読みの指定：1 つの記号・用語はよい。式・記号の組は知らせる', () => {
  for (const s of ['{θ|シータ}', '{N₀|エヌゼロ}', '{x̄|エックスバー}', '{ReLU|レルー}', '{t-SNE|ティースニー}', '{f(x)|エフエックス}', '{論語|ろんご}', '{mark:eta|circle}η', '{λ|lambda}']) assert.deepEqual(readingProblems(s), [], s);
  for (const [s, why] of [['{1-η|いちマイナスイータ}', 'operator'], ['{a+b|エープラスビー}', 'operator'], ['{x^2|エックスじじょう}', 'operator'], ['{\\theta|シータ}', 'operator'], ['{θとη|シータとイータ}', 'several'], ['{x y|エックスワイ}', 'several'], ['{a, b|エー、ビー}', 'several'], ['{p(x|y)|…}', null]]) {
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
for (const name of ['academic', 'business', 'kokugo']) {
  ok(`取り込み → 検査（${name}）：エラー 0、どのスライドにも id`, () => {
    const r = extractBlocks(replyOf(worked(name, 'deck.html'), worked(name, 'narration.md'), { crlf: name === 'kokugo' }));
    assert.equal(r.error, null);
    const a = assignIds(r.deck, r.narration, { byOrder: true });
    const d = path.join(work, 'import-' + name);
    fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'deck.html'), a.deck); fs.writeFileSync(path.join(d, 'narration.md'), a.narration);
    const c = node('kit/check.mjs', path.join(d, 'deck.html'), '--json');
    const j = JSON.parse(c.stdout);
    assert.equal(j.counts.error, 0, JSON.stringify(j.results.filter((x) => x.sev === 'error')));
    assert.equal(j.counts.warn, 0, JSON.stringify(j.results.filter((x) => x.sev === 'warn')));
    assert.ok(!j.results.some((x) => /legacy/.test(x.msg)));
  });
}

// ---------------------------------------------------------------- 7. 検査器の穴
ok('検査器：static の表紙の口述原稿がない → 警告。スライドにない段階 [k]・結論のないスライドの [concl] → エラー。読みの指定 → 警告', () => {
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
  assert.ok(has('warn', 1, /口述原稿が無い（段階 0）/), 'static cover narration');
  assert.ok(has('error', 2, /口述原稿の段階 \[3\] がスライドにない.*0〜2 と concl/), 'orphan [3]');
  assert.ok(has('error', 3, /口述原稿の段階 \[concl\] がスライドにない.*0 だけ/), 'orphan [concl]');
  assert.ok(has('warn', 2, /読みの指定 \{1-η\|いちマイナスイータ\} が式を読んでいる/), 'reading operator');
  assert.ok(has('warn', 2, /読みの指定 \{θとη\|シータとイータ\} に記号が 2 つ以上/), 'reading several');
  assert.equal(c.status, 1);
});

console.log(`llm: ${n} ok (${work})`);
