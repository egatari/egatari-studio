// test-all: unit
// 長いデッキを 2 回に分けて頼む（kit/core/llm-outline.mjs）：枚数の読み取り・構成案の読み取り（壊れたものも）・outline.md の書き読み・
// バッチの範囲と残り・バッチの頼む文（構成案・前のスライド・範囲）・8 枚までは 1 回のまま・指示（R-outline と R-output）
//   node tools/test-llm-outline.mjs
import assert from 'node:assert/strict';
import { slideCountOf, outlineRequest, parseOutline, withOutline, outlineOf, nextBatch, remaining, batchRequest, OUTLINE_OVER, BATCH, OUTLINE_MAX } from '../kit/core/llm-outline.mjs';
import { buildPack, PACK_VERSION } from '../kit/core/llm-pack.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };
const table = (k, head = '| 番号 | 見出し | 要点 |') => [head, '|---|---|---|', ...Array.from({ length: k }, (_, i) => `| ${i + 1} | 見出し ${i + 1} | 要点 ${i + 1} |`)].join('\n');
const fenced = (body, mark = '```') => `構成案です。\n\n${mark}outline\n${body}\n${mark}\n`;

ok('slide count: 枚 / slides / スライド N, and minutes at 1 min ≈ 1 slide (slides win when both are given)', () => {
  assert.equal(slideCountOf('24 枚・40 分'), 24);
  assert.equal(slideCountOf('12 slides, 20 minutes'), 12);
  assert.equal(slideCountOf('スライド 9'), 9);
  assert.equal(slideCountOf('10 分'), 10, 'minutes count as slides (1 min ≈ 1 slide)');
  assert.equal(slideCountOf('20 minutes'), 20);
  assert.equal(slideCountOf('40 分・24 枚'), 24, 'slides win over minutes');
  assert.equal(slideCountOf(''), null);
});
ok(`up to ${OUTLINE_OVER} slides stays single-shot; more asks for an outline`, () => {
  assert.equal(OUTLINE_OVER, 8);
  assert.ok(!(slideCountOf('8 枚') > OUTLINE_OVER) && slideCountOf('9 枚') > OUTLINE_OVER);
  const r = outlineRequest({ n: 24, lang: 'ja' });
  assert.match(r, /24 枚/); assert.match(r, /```outline/); assert.match(r, /R-outline/);
  assert.match(outlineRequest({ n: 12, lang: 'en' }), /12 slides[\s\S]*```outline/);
});
ok('outline: a table in an ```outline block (with or without numbers, escaped pipes, ```` fences, CRLF)', () => {
  const r = parseOutline(fenced(table(10)));
  assert.equal(r.rows.length, 10);
  assert.deepEqual(r.rows[0], { heading: '見出し 1', point: '要点 1' });
  const r2 = parseOutline(fenced('| Heading | Point |\n|--|--|\n| A \\| B | x |\n| C | |', '````').replace(/\n/g, '\r\n'));
  assert.deepEqual(r2.rows, [{ heading: 'A | B', point: 'x' }, { heading: 'C', point: '' }]);
});
ok('outline: malformed replies are refused with a reason', () => {
  assert.equal(parseOutline('no block here').error.code, 'no-outline');
  assert.equal(parseOutline('```outline\n| 1 | a | b |\n').error.code, 'unclosed');
  assert.equal(parseOutline('```outline\njust text\n```').error.code, 'no-table');
  const e = parseOutline(fenced('| # | H | P |\n|--|--|--|\n| 1 |  | x |')).error;
  assert.equal(e.code, 'empty-heading'); assert.ok(e.line > 0);
  assert.equal(parseOutline(fenced(table(1))).error.code, 'too-few');
  assert.equal(parseOutline(fenced(table(OUTLINE_MAX + 1))).error.code, 'too-many');
});
ok('storage: egatari.json studio.outline keeps the rows and the next slide; other members stay; broken records are ignored', () => {
  const rows = parseOutline(fenced(table(20))).rows;
  const cfg0 = JSON.stringify({ docId: 'x', metadata: { title: 't' }, studio: { other: 1 } });
  const t = withOutline(cfg0, { rows, next: 7 });
  const j = JSON.parse(t);
  assert.equal(j.docId, 'x'); assert.deepEqual(j.metadata, { title: 't' }); assert.equal(j.studio.other, 1);
  assert.deepEqual(j.studio.outline, { v: 1, next: 7, rows });
  assert.deepEqual(outlineOf(t), { rows, next: 7 });
  assert.deepEqual(outlineOf(withOutline('', { rows, next: 1 })), { rows, next: 1 });
  // ほかの項目はバイトのまま（kit/core/config-file.mjs の updateConfig を通る）：大きな整数・1e400・"10" の名前・順・空白
  const raw = '{"10": 1,  "docId": "x", "big": 12345678901234567890, "inf": 1e400, "studio": {"other": 1, "outline": {"v": 1, "next": 1, "rows": []}}, "acme": {"keep": [1, 2]}}';
  const t2 = withOutline(raw, { rows, next: 3 });
  assert.ok(t2.startsWith('{"10": 1,  "docId": "x", "big": 12345678901234567890, "inf": 1e400, "studio": {"other": 1, "outline": '), 'members before outline are byte-identical');
  assert.ok(t2.endsWith('}, "acme": {"keep": [1, 2]}}'), 'members after studio are byte-identical');
  assert.deepEqual(outlineOf(t2), { rows, next: 3 });
  assert.throws(() => withOutline('not json', { rows, next: 1 }), (e) => e.code === 'bad-config');
  assert.equal(outlineOf('{}'), null);
  assert.equal(outlineOf('not json'), null);
  assert.equal(outlineOf(JSON.stringify({ studio: { outline: { v: 2, next: 1, rows } } })), null);
  assert.equal(outlineOf(JSON.stringify({ studio: { outline: { v: 1, next: 1, rows: [{ heading: '' }] } } })), null);
  assert.equal(outlineOf(null), null);
});
ok(`batches of ${BATCH} and the remaining count`, () => {
  const rows = parseOutline(fenced(table(20))).rows;
  assert.equal(BATCH, 6);
  assert.deepEqual(nextBatch({ rows, next: 1 }), { from: 1, to: 6, size: 6 });
  assert.deepEqual(nextBatch({ rows, next: 19 }), { from: 19, to: 20, size: 2 });
  assert.equal(nextBatch({ rows, next: 21 }), null);
  assert.equal(remaining({ rows, next: 7 }), 14);
  assert.equal(remaining({ rows, next: 21 }), 0);
});
ok('batch request: the first asks for a whole deck.html of 1–6; later ones carry the outline, the range and the previous slide', () => {
  const rows = parseOutline(fenced(table(20))).rows;
  const f = batchRequest({ rows, from: 1, to: 6, first: true, lang: 'ja' });
  assert.match(f, /構成案の 1〜6 枚目/); assert.match(f, /ちょうど 6 枚/); assert.match(f, /<!DOCTYPE html>/);
  assert.ok(f.includes('| 20 | 見出し 20 | 要点 20 |') && /\| 1 \| 見出し 1 \| 要点 1 \|\s+← 今回は 1〜6 枚目/.test(f));
  const deck = '<!DOCTYPE html><html lang="ja"><body><div id="stage">\n' + [1, 2, 3, 4, 5, 6].map((i) => `<section class="slide" id="s-aaaaa${'abcdef'[i - 1]}"><h2>見出し ${i}</h2><div class="body"><p>本文 ${i}</p></div></section>`).join('\n') + '\n</div></body></html>';
  const narr = [1, 2, 3, 4, 5, 6].map((i) => `## 見出し ${i} {#s-aaaaa${'abcdef'[i - 1]}}\n[0] 話 ${i}`).join('\n\n') + '\n';
  const b = batchRequest({ rows, from: 7, to: 12, deck, narration: narr, lang: 'ja' });
  assert.match(b, /構成案の 7〜12 枚目/); assert.match(b, /ちょうど 6 枚/); assert.match(b, /スライド 6「見出し 6」の後ろ/);
  assert.ok(/\| 7 \| 見出し 7 \| 要点 7 \|\s+← 今回は 7〜12 枚目/.test(b) && b.includes('| 20 | 見出し 20 | 要点 20 |'));
  assert.ok(b.includes('<h2>見出し 6</h2>') && b.includes('[0] 話 6') && !b.includes('<h2>見出し 5</h2>'), 'only the previous slide and its narration are attached');
  assert.match(b, /<section class="slide"> だけ/);
  const e = batchRequest({ rows, from: 7, to: 12, deck, narration: narr, lang: 'en' });
  assert.match(e, /slides 7–12 of the outline/); assert.match(e, /exactly 6 slides/);
});
ok('pack: R-outline and an exact range for outline-driven batches (pack version ' + PACK_VERSION + ')', () => {
  for (const lang of ['en', 'ja']) {
    const p = buildPack({ series: [], lang });
    assert.match(p, /R-outline/);
    assert.ok(!/5–7 is plenty|5〜7 枚で足りる/.test(p), 'the old “make fewer slides (5–7)” line is gone');
    assert.match(p, lang === 'en' ? /write exactly the slides of that range/ : /ちょうどその枚数だけ書く/);
  }
});
console.log(`llm-outline: ${n} ok`);
