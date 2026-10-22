// スライドの足す・複製・削除・並べ替え（kit/core/slide-ops.mjs。編集アプリのスライド一覧）の文字列の検査
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-slide-ops.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { parseNarration, isSlideId } from '../kit/core/narration-core.mjs';
import {
  slideChunks, insertSlide, duplicateSlide, deleteSlide, moveSlide, slideTemplate, TEMPLATES, newIdFor,
  insertSection, copySections, removeSections, reorderSections, stepsIn, removeAudio, audioKeysOf,
} from '../kit/core/slide-ops.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
const keys = (src) => analyzeSlideIds(src).slides.map((s) => s.key);
// Windows の checkout では CRLF になることがあるので LF にそろえる（CRLF は下で別に確かめる）
const DECK = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8').replace(/\r\n/g, '\n');
const NARR = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8').replace(/\r\n/g, '\n');
const K0 = keys(DECK);

ok('chunks: every slide, the morph comment goes with its slide, no problem', () => {
  const c = slideChunks(DECK);
  assert.equal(c.problem, null);
  assert.equal(c.slides.length, 6);
  assert.match(DECK.slice(c.slides[3].cStart, c.slides[3].cEnd), /^<!-- モーフ[^\n]*\n<section class="slide" data-morph>/);
  for (const s of c.slides) assert.match(DECK.slice(s.cStart, s.cEnd), /<\/section>\n$/);
});

ok('move: keys keep, order changes, moving back gives the same bytes', () => {
  const m = moveSlide(DECK, 1, 4);
  assert.deepEqual(keys(m), [K0[0], K0[2], K0[3], K0[4], K0[1], K0[5]]);
  assert.equal(moveSlide(m, 4, 1), DECK);
  const first = moveSlide(DECK, 5, 0);
  assert.deepEqual(keys(first), [K0[5], ...K0.slice(0, 5)]);
  assert.equal(moveSlide(first, 0, 5), DECK);
  assert.equal(slideChunks(first).problem, null);
});

ok('templates: each one is a slide with a well formed id, inserted after the given slide', () => {
  for (const kind of TEMPLATES) {
    const id = newIdFor(DECK);
    assert.ok(isSlideId(id) && /^s-[a-z2-7]{6}$/.test(id));
    const t = slideTemplate(kind, { lang: 'ja', id });
    const out = insertSlide(DECK, 2, t.html);
    const k = keys(out);
    assert.deepEqual(k, [...K0.slice(0, 3), id, ...K0.slice(3)], kind);
    assert.equal(analyzeSlideIds(out).problems.length, 0);
    assert.ok(t.steps.length >= 1 && t.steps[0][0] === '0');
    assert.equal(slideTemplate(kind, { lang: 'en', id }).html.includes(id), true);
  }
  // 先頭と最後にも
  const id = newIdFor(DECK), t = slideTemplate('quote', { id });
  assert.deepEqual(keys(insertSlide(DECK, -1, t.html)), [id, ...K0]);
  assert.deepEqual(keys(insertSlide(DECK, 5, t.html)), [...K0, id]);
  assert.match(insertSlide(DECK, 5, t.html), /<\/section>\n\n<section class="slide noconcl" id="s-[a-z2-7]{6}">[\s\S]*<\/section>\n\n<\/div>/);
});

ok('duplicate: new id (no data-key), same content, right after the original', () => {
  const id = newIdFor(DECK);
  const d = duplicateSlide(DECK, 2, id);
  assert.deepEqual(keys(d.out), [...K0.slice(0, 3), id, ...K0.slice(3)]);
  assert.match(d.html, new RegExp(`^<section class="slide" id="${id}">`));
  const withId = '<div id="stage">\n<section class="slide" data-key="x" id="s-aaaaaa"><h2>A</h2></section>\n</div>';
  const d2 = duplicateSlide(withId, 0, 's-bbbbbb');
  assert.equal(d2.out, '<div id="stage">\n<section class="slide" data-key="x" id="s-aaaaaa"><h2>A</h2></section>\n\n<section class="slide" id="s-bbbbbb"><h2>A</h2></section>\n</div>');
});

ok('delete: the slide goes, the blank lines do not pile up; first and last slides', () => {
  const out = deleteSlide(DECK, 2);
  assert.deepEqual(keys(out), [...K0.slice(0, 2), ...K0.slice(3)]);
  assert.doesNotMatch(out, /\n\n\n/);
  assert.deepEqual(keys(deleteSlide(DECK, 0)), K0.slice(1));
  assert.match(deleteSlide(DECK, 0), /<div id="stage">\n\n<section class="slide">/);
  assert.deepEqual(keys(deleteSlide(DECK, 5)), K0.slice(0, 5));
  assert.match(deleteSlide(DECK, 5), /<\/section>\n\n<\/div>\n<\/body>/);
  // 足して消すと元どおり
  const id = newIdFor(DECK);
  assert.equal(deleteSlide(insertSlide(DECK, 2, slideTemplate('title-body', { id }).html), 3), DECK);
  assert.equal(deleteSlide(duplicateSlide(DECK, 4, id).out, 5), DECK);
});

ok('narration: insert after the previous slide, copy, remove, reorder by the slide order', () => {
  const order = [...K0.slice(0, 3), 's-newone', ...K0.slice(3)];
  const out = insertSection(NARR, order, 's-newone', ['## 新しいスライド {#s-newone}', '[0] （ここに）']);
  const sec = parseNarration(out).sections.map((s) => s.key);
  assert.deepEqual(sec, order);
  assert.equal(removeSections(out, 's-newone').out, NARR);
  const c = copySections(NARR, K0[2], { key: 's-copied', id: 's-copied', heading: '更新の式' });
  assert.ok(c.copied);
  const segs = parseNarration(c.out);
  assert.deepEqual(segs.filter((s) => s.slideKey === 's-copied').map((s) => s.turns.map((t) => t.raw)), segs.filter((s) => s.slideKey === K0[2]).map((s) => s.turns.map((t) => t.raw)));
  assert.match(c.out, /\n## 更新の式 \{#s-copied\}\n\[0\] 更新の式です/);
  const moved = [K0[0], K0[2], K0[3], K0[4], K0[1], K0[5]];
  const r = reorderSections(NARR, moved);
  assert.deepEqual(parseNarration(r).sections.map((s) => s.key), moved);
  assert.equal(reorderSections(r, K0), NARR);
  assert.equal(reorderSections(NARR, K0), NARR);
  assert.equal(stepsIn(NARR, K0[1]), 5);
  // 口述原稿がない・節がない
  assert.equal(insertSection(null, ['a'], 'a', ['## A {#a}', '[0] x']), '## A {#a}\n[0] x\n');
  // どのスライドにも当たらない節はその場所に残る
  const orphan = '# t\n\n## A {#a}\n[0] a\n\n## 迷子\n[0] x\n\n## B {#b}\n[0] b\n';
  assert.equal(reorderSections(orphan, ['b', 'a']), '# t\n\n## B {#b}\n[0] b\n\n## 迷子\n[0] x\n\n## A {#a}\n[0] a\n');
  // CRLF はそのまま
  const crlf = orphan.replace(/\n/g, '\r\n');
  assert.equal(reorderSections(crlf, ['b', 'a']), '# t\n\n## B {#b}\n[0] b\n\n## 迷子\n[0] x\n\n## A {#a}\n[0] a\n'.replace(/\n/g, '\r\n'));
});

ok('audio: remove the slide\'s entries; files still used by others stay', () => {
  const man = JSON.stringify({ segments: { 'a:0': { file: 'x.mp3' }, 'a:concl': { file: 'y.mp3' }, 'b:0': { file: 'y.mp3' }, 'ab:0': { file: 'z.mp3' } } }, null, 1);
  assert.deepEqual(audioKeysOf(man, 'a'), ['a:0', 'a:concl']);
  const r = removeAudio(man, 'a');
  assert.deepEqual(Object.keys(r.removed), ['a:0', 'a:concl']);
  assert.deepEqual(r.files, ['x.mp3']);
  assert.deepEqual(Object.keys(JSON.parse(r.out).segments), ['b:0', 'ab:0']);
  const flat = removeAudio(JSON.stringify({ 'a:0': { file: 'x.wav' }, 'b:0': { file: 'q.wav' } }), 'a');
  assert.deepEqual(JSON.parse(flat.out), { 'b:0': { file: 'q.wav' } });
  assert.deepEqual(removeAudio(null, 'a').files, []);
});

ok('CRLF: the deck keeps CRLF through add, duplicate, delete and move', () => {
  const C = DECK.replace(/\n/g, '\r\n');
  const id = newIdFor(C);
  const added = insertSlide(C, 2, slideTemplate('title-body', { id }).html);
  assert.doesNotMatch(added, /[^\r]\n/);
  assert.equal(deleteSlide(added, 3), C);
  assert.doesNotMatch(duplicateSlide(C, 1, id).out, /[^\r]\n/);
  assert.equal(moveSlide(moveSlide(C, 0, 5), 5, 0), C);
  assert.deepEqual(keys(moveSlide(C, 1, 4)), keys(moveSlide(DECK, 1, 4)));
});

ok('refuses a deck with a key collision', () => {
  const bad = '<div id="stage"><section class="slide"><h2>A</h2></section><section class="slide"><h2>A</h2></section></div>';
  assert.throws(() => moveSlide(bad, 0, 1), /slide key/);
});

console.log(`slide-ops: ${n} ok`);
