// 切れる字・外に出る字の検査（backlog #52）と、ブラウザ版の品質チェックがコマンド版と同じ体裁の検査を使うこと（backlog #51）の試験
//   node tools/test-check-overflow.mjs [作業フォルダ]
// 1. 試験用のデッキ（tools/fixtures/check-overflow/deck.html。#52 の例 2 つ（s-fix52a・s-fix52b）を含む）を kit/check.mjs --json で検査し、
//    スライドごとに出る体裁の知らせが決めたとおり：m-flow の箱からはみ出す字（svgTextBox）、印のない切れた箱（textClipped）、
//    スライドの外に出る m-kpi の札の名前（svgTextOut の slide）と札の箱からはみ出す名前（svgTextBox）、viewBox で切れる字（svgTextOut の viewBox）、
//    本文の外の字（outsideBody）、本文が下にはみ出すスライドでは本文の中の図の字がスライドの外に出ても bodyBottom だけ、図の中の小さい字（smallSvgText）、縦組みの見出しと結論の列（tateTitle・conclOverflow）。
//    わざと切る印（data-clip。kit/core/layout-scan.mjs の CLIP_ATTR）を付けたもの（s-fix52b・s-flowclip）は何も出さない。新しい知らせは警告
// 2. 知らせの言葉（kit/check-messages.mjs）：新しい code は日本語と英語があり、規格は R-fit、textClipped は印の名前を言う
// 3. ブラウザ版の品質チェック（app/frame-shim.js を app/main.js と同じく withLayoutScan で包み、プレビューと同じ文書で動かす）：
//    同じデッキで同じ知らせを出す。見本のデッキ（examples/）では新しい知らせを出さない
// 4. 表紙の字の箱と表の短いセル（backlog #64・#65。tools/fixtures/check-cover-table/deck.html）：どのスライドでもスライドの外に出る字（textOffSlide）・
//    重なる字の箱と帯（textOverlap）・表の短いセルの語が割れる（cellWordBreak）。ふつうの表紙・data-clip の副題・自分で置いた札・
//    長いセルの折り返し・1 行の短いセル・割れない英語の語・縦に並べた式（式は見た目の箱で比べる）は何も出さない。式に重ねた札は textOverlap。コマンド版とブラウザ版で同じ知らせ。表紙と章の扉では置ける子要素を言う
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { build } from '../kit/build.mjs';
import { previewDocument } from '../app/preview-doc.js';
import { withLayoutScan, CLIP_ATTR } from '../kit/core/layout-scan.mjs';
import { MESSAGES, message } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-overflow-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

const DECK = path.join(ROOT, 'tools', 'fixtures', 'check-overflow', 'deck.html');
// 見る知らせ：#52 の新しいもの（警告）と、#51 でブラウザ版にも出るようになったもの
const NEW = ['textClipped', 'svgTextOut', 'svgTextBox', 'outsideBody', 'textOffSlide', 'textOverlap', 'cellWordBreak'];
const WATCH = [...NEW, 'bodyBottom', 'smallSvgText', 'tateTitle', 'conclOverflow', 'tateBodyHead', 'bodyConclCol', 'bodyLeft'];
const EXPECT = {
  's-fix52a': ['svgTextBox'],
  's-fix52b': [],
  's-clipnomark': ['textClipped'],
  's-flowclip': [],
  's-kpi': ['svgTextBox', 'svgTextOut'],
  's-viewbox': ['svgTextOut'],
  's-outside': ['outsideBody'],
  's-smallsvg': ['smallSvgText'],
  's-tate': ['conclOverflow', 'tateTitle'],
  's-bodyover': ['bodyBottom'],
};
const codesBy = (list, idOf) => {
  const m = {};
  for (const id of Object.keys(EXPECT)) m[id] = [];
  // ブラウザ版の前からの code（overflowBottom）はコマンド版の名前にそろえて比べる
  for (const r of list) { const id = idOf(r), code = r.code === 'overflowBottom' ? 'bodyBottom' : r.code; if (id in m && WATCH.includes(code) && !m[id].includes(code)) m[id].push(code); }
  for (const id of Object.keys(m)) m[id].sort();
  return m;
};

// ---------------------------------------------------------------- 1. コマンド版
const cli = node('kit/check.mjs', DECK, '--json');
let J = null;
await t('check --json runs on the fixture', () => { J = JSON.parse(cli.stdout); assert.ok(Array.isArray(J.results)); });
await t('check: each slide gets the expected layout findings', () => assert.deepEqual(codesBy(J.results, (r) => r.id), EXPECT));
await t('check: the new findings are warnings with rule R-fit', () => {
  const xs = J.results.filter((r) => NEW.includes(r.code));
  assert.ok(xs.length >= 5);
  for (const r of xs) { assert.equal(r.sev, 'warn', r.msg); assert.equal(r.rule, 'R-fit', r.msg); }
});
await t('check: s-fix52a names the label that overflows its m-flow box', () => {
  const r = J.results.find((x) => x.id === 's-fix52a' && x.code === 'svgTextBox');
  assert.equal(r.data.t, 'deck.html・narration.md');
  assert.ok(r.data.px > 2, JSON.stringify(r.data));
});
await t(`check: ${CLIP_ATTR} keeps the intended clip (s-fix52b) and a marked component (s-flowclip) quiet`, () => {
  const xs = J.results.filter((x) => (x.id === 's-fix52b' || x.id === 's-flowclip') && x.sev !== 'info' && x.code !== 'narrMissing');
  assert.deepEqual(xs.map((x) => x.code), []);
});
await t('check: a body that overflows at the bottom is one error, not also a warning for each figure label it pushes off the slide', () => {
  const xs = J.results.filter((x) => x.id === 's-bodyover' && x.sev !== 'info' && x.code !== 'narrMissing');
  assert.deepEqual(xs.map((x) => x.sev + ' ' + x.code), ['error bodyBottom']);
});
await t('check: viewBox and slide edges are told apart; text outside the body says what it hits', () => {
  assert.equal(J.results.find((x) => x.id === 's-viewbox' && x.code === 'svgTextOut').data.edge, 'viewBox');
  const k = J.results.find((x) => x.id === 's-kpi' && x.code === 'svgTextOut');
  assert.equal(k.data.edge, 'slide');
  assert.equal(k.data.n, 2);
  const o = J.results.find((x) => x.id === 's-outside' && x.code === 'outsideBody');
  assert.equal(o.data.why, 'title');
  assert.equal(o.data.n, 2);
  assert.match(o.msg, /見出しに重なる/);
});
await t('check --lang en: textClipped tells how to mark an intended clip', () => {
  const je = JSON.parse(node('kit/check.mjs', DECK, '--json', '--lang', 'en').stdout);
  const r = je.results.find((x) => x.code === 'textClipped');
  assert.match(r.msg, new RegExp(`text is cut off by its box .*add ${CLIP_ATTR} to that element.*\\(R-fit\\)$`));
});

// ---------------------------------------------------------------- 2. 言葉
await t('messages: every new code has Japanese and English text', () => {
  const a = { t: 'x', px: 9, n: 3 };
  const variants = [['textClipped', a], ['svgTextOut', { ...a, edge: 'viewBox' }], ['svgTextOut', { ...a, edge: 'slide' }], ['svgTextBox', a],
    ...['slide', 'title', 'concl', 'pn'].map((why) => ['outsideBody', { ...a, why }])];
  for (const [code, d] of variants) {
    assert.equal(MESSAGES[code].rule, 'R-fit');
    const ja = message('ja', code, d), en = message('en', code, d);
    assert.ok(ja.includes('「x」') && ja.includes('ほか 2 か所'), ja);
    assert.ok(en.includes('“x”') && en.includes('and 2 more'), en);
  }
  assert.notEqual(message('en', 'svgTextOut', { ...a, edge: 'viewBox' }), message('en', 'svgTextOut', { ...a, edge: 'slide' }));
  assert.ok(!message('ja', 'svgTextBox', { t: 'x', px: 9, n: 1 }).includes('ほか'));
});

// ---------------------------------------------------------------- 3. ブラウザ版
const SHIM = withLayoutScan(fs.readFileSync(path.join(ROOT, 'app', 'frame-shim.js'), 'utf8'));
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
// プレビューと同じ文書（信頼する先頭部分＋仲立ち＋組んだデッキ）を開き、品質チェックを頼む（枠の外から開くので、親は自分）
async function quick(src, name) {
  const f = path.join(work, name + '.html');
  fs.writeFileSync(f, previewDocument(build(src).html, `${SHIM}(${JSON.stringify({ dev: true, load: 1 })});`));
  await page.goto(fileUrl(f));
  return page.evaluate(() => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('no app-check-result')), 30000);
    addEventListener('message', (e) => { if (e.data && e.data.type === 'app-check-result') { clearTimeout(timer); res({ results: e.data.results, ids: DECK.slides.map((s) => s.id) }); } });
    postMessage({ type: 'app-check', id: 'q1' }, '*');
  }));
}
let Q = null;
await t('quick check runs on the fixture', async () => { Q = await quick(DECK, 'fixture'); assert.ok(Array.isArray(Q.results)); });
await t('quick check: the same layout findings as the command (one implementation)', () => {
  assert.deepEqual(codesBy(Q.results, (r) => (r.i === null ? null : Q.ids[r.i])), EXPECT);
  for (const r of Q.results.filter((x) => NEW.includes(x.code))) assert.equal(r.sev, 'warn');
  const k = Q.results.find((x) => Q.ids[x.i] === 's-fix52a' && x.code === 'svgTextBox');
  assert.equal(k.arg.t, 'deck.html・narration.md');
});
await t('quick check: no new findings on the examples', async () => {
  const found = [];
  for (const d of fs.readdirSync(path.join(ROOT, 'examples')).sort()) {
    const src = path.join(ROOT, 'examples', d, 'deck.html');
    if (!fs.existsSync(src)) continue;
    const r = await quick(src, 'ex-' + d);
    for (const x of r.results) if (WATCH.includes(x.code)) found.push(`${d} ${x.i + 1} ${x.code} ${JSON.stringify(x.arg)}`);
  }
  assert.deepEqual(found, []);
});

// ---------------------------------------------------------------- 4. 表紙の字の箱と表の短いセル（#64・#65）
const DECK2 = path.join(ROOT, 'tools', 'fixtures', 'check-cover-table', 'deck.html');
const NEW2 = ['textOffSlide', 'textOverlap', 'cellWordBreak'];
const EXPECT2 = {
  's-cov64': ['textOverlap'], 's-covok': [], 's-covclip': [], 's-absok': [], 's-covlong': ['textOverlap'], 's-absover': ['textOverlap'],
  's-secoff': ['textOffSlide'], 's-tbl65': ['cellWordBreak'], 's-tblok': [], 's-latinbreak': ['cellWordBreak'],
  's-mathstack': [], 's-mathover': ['textOverlap'],
};
const codes2 = (list, idOf) => {
  const m = {};
  for (const id of Object.keys(EXPECT2)) m[id] = [];
  for (const r of list) { const id = idOf(r), code = r.code === 'overflowBottom' ? 'bodyBottom' : r.code; if (id in m && r.sev !== 'info' && !['narrMissing', 'noNarration'].includes(code) && !m[id].includes(code)) m[id].push(code); }
  for (const id of Object.keys(m)) m[id].sort();
  return m;
};
let J2 = null;
await t('check --json runs on the cover/table fixture', () => { J2 = JSON.parse(node('kit/check.mjs', DECK2, '--json').stdout); assert.ok(Array.isArray(J2.results)); });
await t('check: covers, section dividers and tables get the expected findings (and nothing else)', () => assert.deepEqual(codes2(J2.results, (r) => r.id), EXPECT2));
await t('check: the #64/#65 findings are warnings with rule R-fit', () => {
  const xs = J2.results.filter((r) => NEW2.includes(r.code));
  assert.equal(xs.length, 7);
  for (const r of xs) { assert.equal(r.sev, 'warn', r.msg); assert.equal(r.rule, 'R-fit', r.msg); }
});
await t('check: #64 the stray subtitle on the cover overlaps the band, and the finding names the cover children', () => {
  const r = J2.results.find((x) => x.id === 's-cov64' && x.code === 'textOverlap');
  assert.equal(r.data.with, 'band'); assert.equal(r.data.kind, 'cover'); assert.equal(r.data.t, '欠損値と外れ値の扱い');
  assert.match(r.msg, /\.venue（会場）・h1（題名）・\.au（著者・所属）/);
  assert.match(r.msg, /副題は h1 の 2 行目/);
  const o = J2.results.find((x) => x.id === 's-covlong' && x.code === 'textOverlap');
  assert.equal(o.data.with, 'text'); assert.equal(o.data.u, 'データ基盤チーム');
  const sec = J2.results.find((x) => x.id === 's-secoff' && x.code === 'textOffSlide');
  assert.equal(sec.data.kind, 'sec'); assert.ok(sec.data.px > 2); assert.match(sec.msg, /章の扉に置けるのは h1/);
});
await t('check: #65 the short cell 除外中 breaks as 除外/中; a Latin word broken by overflow-wrap is found too', () => {
  const r = J2.results.find((x) => x.id === 's-tbl65' && x.code === 'cellWordBreak');
  assert.deepEqual([r.data.t, r.data.lines, r.data.split, r.data.n], ['除外中', 2, '除外/中', 1]);
  const l = J2.results.find((x) => x.id === 's-latinbreak' && x.code === 'cellWordBreak');
  assert.match(l.data.split, /\w\/\w/);
});
await t('check: stacked display formulas are compared by their visual boxes (no overlap); a label placed on a formula overlaps it', () => {
  const r = J2.results.find((x) => x.id === 's-mathover' && x.code === 'textOverlap');
  assert.deepEqual([r.data.with, r.data.u], ['text', '式に重ねた札']);
});
await t('check --lang en: cover advice and cell advice in English', () => {
  const je = JSON.parse(node('kit/check.mjs', DECK2, '--json', '--lang', 'en').stdout);
  assert.match(je.results.find((x) => x.id === 's-cov64' && x.code === 'textOverlap').msg, /a cover holds \.venue \(venue\), h1 \(title\) and \.au .*second line of the h1.*\(R-fit\)$/);
  assert.match(je.results.find((x) => x.id === 's-tbl65' && x.code === 'cellWordBreak').msg, /use fewer columns, shorten the word, or widen that column/);
});
await t('messages: the #64/#65 codes have Japanese and English text, mapped in llm-fix', async () => {
  const { rulesFor } = await import('../kit/core/llm-fix.mjs');
  const a = { t: 'x', u: 'y', px: 9, n: 3, lines: 2, split: 'x/y' };
  for (const [code, d] of [['textOffSlide', a], ['textOffSlide', { ...a, kind: 'cover' }], ['textOverlap', { ...a, with: 'band' }], ['textOverlap', { ...a, with: 'text', kind: 'sec' }], ['cellWordBreak', a]]) {
    assert.equal(MESSAGES[code].rule, 'R-fit');
    const ja = message('ja', code, d), en = message('en', code, d);
    assert.ok(ja.includes('「x」') && ja.includes('ほか 2 か所'), ja);
    assert.ok(en.includes('“x”') && en.includes('and 2 more'), en);
    assert.deepEqual(rulesFor({ code }), ['R-fit']);
  }
});
let Q2 = null;
await t('quick check: the same findings on the cover/table fixture', async () => {
  Q2 = await quick(DECK2, 'fixture2');
  assert.deepEqual(codes2(Q2.results, (r) => (r.i === null ? null : Q2.ids[r.i])), EXPECT2);
  const r = Q2.results.find((x) => Q2.ids[x.i] === 's-tbl65' && x.code === 'cellWordBreak');
  assert.equal(r.arg.split, '除外/中');
  for (const x of Q2.results.filter((y) => NEW2.includes(y.code))) assert.equal(x.sev, 'warn');
});
await b.close();

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
