// 同じ重さの短い要点だけの本文の提案（cardsHint、backlog #189、R-purpose。kit/core/layout-scan.mjs と kit/check.mjs）の試験
//   node tools/test-check-cards-hint.mjs [作業フォルダ]
// 1. 知らせる：本文が 1 つの ul（li が 3 つ・4 つ。短い導入の p があってもよい）、どれも 30 字まで、長さが最長 ÷ 最短 ≤ 2
// 2. 知らせない：li が 2・5、長い項目、長さが大きく違う、入れ子の ul、ol、パーツ（m-…）、static
// 3. 情報だけ：エラーにも警告にもならず、修正依頼（kit/core/llm-fix.mjs）に入らない
// 4. 知らせの言葉（kit/check-messages.mjs）：日本語と英語
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { message } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIX = path.join(ROOT, 'tools', 'fixtures', 'check-cards-hint');
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-cards-hint-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

let res = null;
// 見本のスライドの番号（1 から。tools/fixtures/check-cards-hint/deck.html の並び）
const FIRE = [1, 2, 3, 12];   // fire-3・fire-4・fire-lead・fire-midword（そこで が文頭でない）
const QUIET = [4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16];   // no-2・no-5・no-long・no-unequal・no-nested・no-ol・no-part・no-static・no-math（式）・no-seq-ja（まず・次に・最後に）・no-seq-ja2（そこで）・no-arrow（→）
const run = (dir, deck) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deck);
  fs.copyFileSync(path.join(FIX, 'narration.md'), path.join(dir, 'narration.md'));
  const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(c.stdout);
};
const hits = (r) => r.results.filter((x) => x.code === 'cardsHint');

// 見本の 4 つの候補は上限（2）を超えるので、2 つずつに分けた原稿で、どれも出ることを確かめる（上限は最後の試験）
const part = (keep) => {
  const src = fs.readFileSync(path.join(FIX, 'deck.html'), 'utf8'), secs = src.match(/<section[\s\S]*?<\/section>\n/g), nar = fs.readFileSync(path.join(FIX, 'narration.md'), 'utf8').split(/(?=^## )/m);
  const ks = secs.map((_, k) => k + 1).filter((k) => QUIET.includes(k) || keep.includes(k));
  const out = { deck: src.replace(/<section[\s\S]*<\/section>\n/, ks.map((k) => secs[k - 1]).join('')), narr: ks.map((k) => nar[k - 1]).join('') };
  return { ks, ...out };
};
const runPart = (name, keep) => {
  const { ks, deck, narr } = part(keep), dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deck);
  fs.writeFileSync(path.join(dir, 'narration.md'), narr);
  assert.equal(spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const r = JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
  return { r, ks, got: hits(r).map((x) => ks[x.slide - 1]) };
};
await t('品質チェック（kit/check.mjs --json）：3 つ・4 つの短い要点（導入の p があっても）に cardsHint が 1 つずつ。ほかのスライドには出ない', () => {
  const A = runPart('part-a', [1, 2]), B = runPart('part-b', [3, 12]);
  assert.deepEqual(A.got, [1, 2], 'cardsHint on slides ' + A.got.join(','));
  assert.deepEqual(B.got, [3, 12], 'cardsHint on slides ' + B.got.join(','));
  res = A.r;
});
await t('情報だけ：sev は info、rule は R-purpose、エラーにも警告にもならない。言葉は 2 つの言語とも決まった文', () => {
  const got = hits(res);
  assert.ok(got.every((x) => x.sev === 'info' && x.rule === 'R-purpose'), JSON.stringify(got));
  assert.ok(!res.results.some((x) => x.code === 'cardsHint' && x.sev !== 'info'));
  // 見本の発話の数が足りない警告はあるが、cardsHint のスライドにエラーは付かない
  assert.ok(!res.results.some((x) => x.sev === 'error' && FIRE.includes(x.slide)));
  assert.ok(message('ja', 'cardsHint', {}).startsWith('同じ重さの短い要点なら、カード（m-cards）にすると見やすいことがあります'));
  assert.ok(message('en', 'cardsHint', {}).startsWith('Short, equal points may read better as cards (m-cards)'));
});
await t('修正依頼（kit/core/llm-fix.mjs の buildFixRequest）：cardsHint は載らない。同じ結果のエラー・警告は載る', async () => {
  const { buildFixRequest } = await import('../kit/core/llm-fix.mjs');
  const probs = res.results.map((x) => ({ sev: x.sev, i: null, title: '', text: x.msg, code: x.code, rule: x.rule, data: x.data, msg: x.msg }));
  assert.ok(probs.some((p) => p.code === 'cardsHint' && p.sev === 'info'));
  const fr = buildFixRequest({ problems: [...probs, { sev: 'warn', i: null, title: '', text: 'KEEP-ME', code: 'x' }], deck: '', narration: '', lang: 'en' });
  const text = typeof fr === 'string' ? fr : JSON.stringify(fr);
  assert.ok(text.includes('KEEP-ME'));
  assert.ok(!text.includes('m-cards') && !text.includes('cardsHint'), 'cardsHint is not listed');
  // info の印が落ちても、名前で外れる
  const fr2 = buildFixRequest({ problems: [{ sev: 'warn', i: null, title: '', text: 'CARDS-TEXT', code: 'cardsHint' }, { sev: 'warn', i: null, title: '', text: 'KEEP-ME', code: 'x' }], deck: '', narration: '', lang: 'en' });
  const t2 = typeof fr2 === 'string' ? fr2 : JSON.stringify(fr2);
  assert.ok(t2.includes('KEEP-ME') && !t2.includes('CARDS-TEXT'));
});
await t('境目：30 字ちょうどは知らせ、31 字は知らせない。最長 ÷ 最短 が 2 ちょうどは知らせ、2 を超えれば知らせない。縦組みと表紙は見ない。日本語でないデッキは文字数', () => {
  const li = (k) => `<li>${'あ'.repeat(k)}</li>`;
  const deck = (id, cls, body, lang = 'ja') => `<section class="slide noconcl ${cls}" id="s-${id}"><h2>${id}</h2><div class="body">${body}</div></section>\n`;
  const mk = (slides, lang = 'ja') => `<!DOCTYPE html>\n<html lang="${lang}" data-theme="default">\n<head><meta charset="utf-8"><title>edge</title></head>\n<body><div id="stage">\n${slides}</div></body></html>\n`;
  const ids = ['a30', 'a31', 'r2', 'r3', 'tate', 'cover'];
  fs.mkdirSync(path.join(work, 'edge'), { recursive: true });
  const slides = deck('a30', '', `<ul>${li(30)}${li(30)}${li(30)}</ul>`) + deck('a31', '', `<ul>${li(31)}${li(31)}${li(31)}</ul>`)
    + deck('r2', '', `<ul>${li(10)}${li(20)}${li(15)}</ul>`) + deck('r3', '', `<ul>${li(10)}${li(21)}${li(15)}</ul>`)
    + deck('tate', 'layout-tate', `<ul>${li(10)}${li(10)}${li(10)}</ul>`) + deck('cover', 'cover', `<ul>${li(10)}${li(10)}${li(10)}</ul>`);
  const dir = path.join(work, 'edge');
  fs.writeFileSync(path.join(dir, 'deck.html'), mk(slides));
  fs.writeFileSync(path.join(dir, 'narration.md'), ids.map((id) => `## ${id} {#s-${id}}\n\n[0] 試験。\n`).join('\n'));
  assert.equal(spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const r = JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
  const got = hits(r).map((x) => ids[x.slide - 1]);
  assert.deepEqual(got, ['a30', 'r2'], got.join(' '));
  // 日本語でないデッキ：文字数（半角も 1 字）。30 文字は知らせ、31 文字は知らせない
  const en = path.join(work, 'edge-en'), ex = (k) => `<li>${'a'.repeat(k)}</li>`;
  fs.mkdirSync(en, { recursive: true });
  fs.writeFileSync(path.join(en, 'deck.html'), mk(deck('e30', '', `<ul>${ex(30)}${ex(30)}${ex(30)}</ul>`) + deck('e31', '', `<ul>${ex(31)}${ex(31)}${ex(31)}</ul>`), 'en'));
  fs.writeFileSync(path.join(en, 'narration.md'), ['e30', 'e31'].map((id) => `## ${id} {#s-${id}}\n\n[0] A test.\n`).join('\n'));
  assert.equal(spawnSync(process.execPath, ['kit/build.mjs', path.join(en, 'deck.html')], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const re = JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(en, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
  assert.deepEqual(hits(re).map((x) => x.slide), [1]);
  // 順を表す英語の語（大文字小文字を問わず、先頭の記号の後）・語の一部は順の語にしない・組まれずに残った TeX・$…$
  const e2 = path.join(work, 'edge-en2'), l3 = (a, b, c) => `<ul><li>${a}</li><li>${b}</li><li>${c}</li></ul>`;
  const ids2 = ['q-first', 'q-then', 'q-dollar', 'f-word', 'f-mid'];
  fs.mkdirSync(e2, { recursive: true });
  fs.writeFileSync(path.join(e2, 'deck.html'), mk(deck('q-first', '', l3('First, collect', 'Gather more', 'Clean it up')) + deck('q-then', '', l3('Fast to run', '- THEN tune it', 'Easy to read'))
    + deck('q-dollar', '', l3('Mean is $\\mu$', 'Spread is wide', 'Easy to read')) + deck('f-word', '', l3('Firstly it is fast', 'Nextgen tools ok', 'Easy to read')) + deck('f-mid', '', l3('Fast, then slow', 'Simple, first of all', 'Easy to read')), 'en'));
  fs.writeFileSync(path.join(e2, 'narration.md'), ids2.map((id) => `## ${id} {#s-${id}}\n\n[0] A test.\n`).join('\n'));
  assert.equal(spawnSync(process.execPath, ['kit/build.mjs', path.join(e2, 'deck.html')], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const r2 = JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(e2, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
  assert.deepEqual(hits(r2).map((x) => ids2[x.slide - 1]), ['f-word', 'f-mid']);
});

await t('1 つの教材で最大 2 つ（CH.cap）：3 つ以上の候補があれば、長さのそろい方（最長 ÷ 最短）のよい順に 2 つ。同じなら前のスライド。出す順はスライドの順', () => {
  const li = (k) => `<li>${'あ'.repeat(k)}</li>`, sl = (id, a, b, c) => `<section class="slide noconcl" id="s-${id}"><h2>${id}</h2><div class="body"><ul>${li(a)}${li(b)}${li(c)}</ul></div></section>\n`;
  const ids = ['c10', 'c12', 'c15', 'c20', 'c10b'];
  const dir = path.join(work, 'cap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>cap</title></head>\n<body><div id="stage">\n${sl('c10', 10, 10, 10)}${sl('c12', 10, 12, 11)}${sl('c15', 10, 15, 12)}${sl('c20', 10, 20, 15)}${sl('c10b', 12, 12, 12)}</div></body></html>\n`);
  fs.writeFileSync(path.join(dir, 'narration.md'), ids.map((id) => `## ${id} {#s-${id}}\n\n[0] 試験。\n`).join('\n'));
  assert.equal(spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const r = JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
  assert.deepEqual(hits(r).map((x) => ids[x.slide - 1]), ['c10', 'c10b']);
  // 見本の 4 つの候補を 1 つの原稿に入れても 2 つだけ出る（長さのそろい方がよい 2 つ）
  const all = hits(run(path.join(work, 'main'), fs.readFileSync(path.join(FIX, 'deck.html'), 'utf8')));
  assert.equal(all.length, 2, all.map((x) => x.slide).join(','));
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
