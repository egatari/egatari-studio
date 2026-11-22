// 本文に画像を足す（kit/core/image-insert.mjs。編集アプリの「画像を挿入…」、handoff #85）の文字列の検査
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-image-insert.mjs
// 種類は中身から（PNG・JPEG・WebP・SVG、それ以外は null）・data: URL・1 MiB の知らせ（kit/core/image-size.mjs と同じ値）・ステップの数・
// 入れる塊（幅・中央・alt のエスケープ・data-step）・入れる場所（本文の終わりで結論の行の前、2 列の左右、2 列にする、本文がない）・
// 自動のステップの書き出し・品質チェックの imgAlt が出ない・AI への指示の写真の 1 行は有料のプランだけ（planSpans）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { IMAGE_TYPES, PLACEMENTS, imageType, dataUrl, sizeNotice, slideSteps, imageHtml, insertImage } from '../kit/core/image-insert.mjs';
import { MAX_IMAGE_BYTES, imageSizeFindings } from '../kit/core/image-size.mjs';
import { slideChunks } from '../kit/core/slide-ops.mjs';
import { buildPack } from '../kit/core/llm-pack.mjs';
import { planSpans } from '../kit/core/llm-pack-assemble.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };
const DECK = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8').replace(/\r\n/g, '\n');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SRC = dataUrl(PNG, 'image/png');
const slideText = (src, i) => { const s = slideChunks(src).slides[i]; return src.slice(s.start, s.end); };
const enc = (t) => new TextEncoder().encode(t);

ok('imageType: from the bytes, not the name', () => {
  assert.equal(imageType(PNG), 'image/png');
  assert.equal(imageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(imageType(enc('RIFF\x10\x00\x00\x00WEBPVP8 ')), 'image/webp');
  assert.equal(imageType(enc('<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml');
  assert.equal(imageType(enc('﻿<?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg viewBox="0 0 1 1"></svg>')), 'image/svg+xml');
  assert.equal(imageType(enc('<html><svg></svg></html>')), null);
  assert.equal(imageType(enc('GIF89a')), null);
  assert.equal(imageType(new Uint8Array(0)), null);
  assert.deepEqual([...IMAGE_TYPES], ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
});

ok('dataUrl: base64, and only the four types (SVG stays an image, never inline markup)', () => {
  assert.equal(SRC, 'data:image/png;base64,' + Buffer.from(PNG).toString('base64'));
  const big = new Uint8Array(200000).map((_, i) => i * 7);
  assert.equal(dataUrl(big, 'image/jpeg'), 'data:image/jpeg;base64,' + Buffer.from(big).toString('base64'));
  assert.match(dataUrl(enc('<svg/>'), 'image/svg+xml'), /^data:image\/svg\+xml;base64,/);
  assert.throws(() => dataUrl(PNG, 'text/html'));
});

ok('sizeNotice: over 1 MiB (the image-size check threshold), in MB with one decimal', () => {
  assert.equal(MAX_IMAGE_BYTES, 1048576);
  assert.equal(sizeNotice(MAX_IMAGE_BYTES), null);
  assert.equal(sizeNotice(MAX_IMAGE_BYTES + 1), '1.0');
  assert.equal(sizeNotice(1.46 * 1048576), '1.5');
  assert.equal(sizeNotice(3 * 1048576), '3.0');
});

ok('slideSteps: static, automatic list, explicit data-step, concl', () => {
  assert.deepEqual(slideSteps(DECK, 0), { max: 0, isStatic: true, auto: false, concl: false });
  assert.deepEqual(slideSteps(DECK, 1), { max: 3, isStatic: false, auto: true, concl: true });
  assert.deepEqual(slideSteps(DECK, 2), { max: 3, isStatic: false, auto: false, concl: true });
  assert.deepEqual(slideSteps(DECK, 5), { max: 4, isStatic: false, auto: false, concl: false });
  assert.throws(() => slideSteps(DECK, 9), (e) => e.code === 'no-slide');
});

ok('imageHtml: width per placement, aspect kept, alt escaped, data-step', () => {
  const w = (p) => /width:([\d.]+%)/.exec(imageHtml({ src: SRC, alt: 'a', placement: p }))[1];
  assert.deepEqual(PLACEMENTS.map(w), ['100%', '50%', '33.333%', '100%', '100%']);
  const h = imageHtml({ src: SRC, alt: ' 図  "1" <b> & ', placement: 'half', step: 2 });
  assert.equal(h, `<div class="fig" data-step="2"><img src="${SRC}" alt="図 &quot;1&quot; &lt;b&gt; &amp;" style="display:block;width:50%;height:auto;margin:0 auto"></div>`);
  assert.match(imageHtml({ src: SRC, alt: '', placement: 'full' }), /^<div class="fig"><img src="[^"]+" alt="" style="display:block;width:100%;height:auto"><\/div>$/);
  assert.throws(() => imageHtml({ src: 'https://example.com/a.png', alt: 'a', placement: 'full' }));
  assert.throws(() => imageHtml({ src: 'data:image/svg+xml,<svg onload=x>', alt: 'a', placement: 'full' }));
  assert.throws(() => imageHtml({ src: SRC, alt: 'a', placement: 'free' }));
  assert.throws(() => imageHtml({ src: SRC, alt: 'a', placement: 'full', step: 1.5 }));
});

ok('insert in the body: at the end of .body, before the conclusion line; other slides unchanged', () => {
  const out = insertImage(DECK, 2, { src: SRC, alt: '図', placement: 'full' });
  const s = slideText(out, 2);
  assert.match(s, /<\/ul>\n    <div class="fig"><img [^>]+><\/div>\n  <\/div>\n  <div class="concl">/);
  for (const i of [0, 1, 3, 4, 5]) assert.equal(slideText(out, i), slideText(DECK, i));
  assert.equal(out.length - DECK.length, imageHtml({ src: SRC, alt: '図', placement: 'full' }).length + 5);
});

ok('insert with a step on a slide with automatic list steps: the items get explicit data-step 1…n (same reveal), the image its own', () => {
  const out = insertImage(DECK, 1, { src: SRC, alt: '図', placement: 'half', step: 1 });
  const s = slideText(out, 1);
  assert.deepEqual([...s.matchAll(/<li data-step="(\d)">/g)].map((m) => m[1]), ['1', '2', '3']);
  assert.match(s, /<div class="fig" data-step="1"><img [^>]*width:50%[^>]*><\/div>\n  <\/div>\n  <div class="concl">/);
  // ステップなし（最初から）なら、箇条には触らない
  const plain = slideText(insertImage(DECK, 1, { src: SRC, alt: '図', placement: 'third' }), 1);
  assert.doesNotMatch(plain, /<li data-step/);
  assert.throws(() => insertImage(DECK, 0, { src: SRC, alt: '図', placement: 'full', step: 1 }), (e) => e.code === 'static');
});

ok('columns: into the existing .cols (left is a div), or a new column next to a part', () => {
  const left = slideText(insertImage(DECK, 4, { src: SRC, alt: '図', placement: 'left' }), 4);
  assert.match(left, /<ul class="nostep">.*<\/ul>\n        <div class="fig"><img [^>]*width:100%[^>]*><\/div>\n      <\/div>\n      <m-sweep/s);
  const right = slideText(insertImage(DECK, 4, { src: SRC, alt: '図', placement: 'right' }), 4);
  assert.match(right, /<\/ul>\n      <\/div>\n      <div><div class="fig"><img [^>]+><\/div><\/div>\n      <m-sweep/);
});

ok('columns where there are none: the body becomes two columns, the old body in the other column with its steps written out', () => {
  const out = insertImage(DECK, 1, { src: SRC, alt: '図', placement: 'right' });
  const s = slideText(out, 1);
  assert.match(s, /<div class="body">\n    <div class="cols">\n      <div>\n        <ul>\n          <li data-step="1">/);
  assert.match(s, /<\/ul>\n      <\/div>\n      <div>\n        <div class="fig"><img [^>]+><\/div>\n      <\/div>\n    <\/div>\n  <\/div>\n  <div class="concl">/);
  const l = slideText(insertImage(DECK, 1, { src: SRC, alt: '図', placement: 'left' }), 1);
  assert.ok(l.indexOf('class="fig"') < l.indexOf('<ul>'));
  // 組み直した原稿は今の決まりのまま読める（入れ子でない・スライドの数が同じ）
  assert.equal(slideChunks(out).problem, null);
  assert.equal(slideChunks(out).slides.length, 6);
});

ok('a slide without .body gets one before .concl (or at the end)', () => {
  const src = '<html><body><div id="stage">\n<section class="slide" id="s-a">\n  <h2>A</h2>\n  <div class="concl"><span>c</span></div>\n</section>\n<section class="slide noconcl" id="s-b">\n  <h2>B</h2>\n</section>\n</div></body></html>';
  const a = insertImage(src, 0, { src: SRC, alt: 'x', placement: 'full' });
  assert.match(a, /<h2>A<\/h2>\n  <div class="body">\n    <div class="fig"><img [^>]+><\/div>\n  <\/div>\n  <div class="concl">/);
  const b = insertImage(src, 1, { src: SRC, alt: 'x', placement: 'left' });
  assert.match(b, /<h2>B<\/h2>\n  <div class="body">\n    <div class="cols">\n      <div>\n        <div class="fig">.*<\/div>\n      <\/div>\n      <div><\/div>\n    <\/div>\n  <\/div>\n<\/section>/s);
});

ok('CRLF sources keep CRLF', () => {
  const crlf = DECK.replace(/\n/g, '\r\n');
  const out = insertImage(crlf, 1, { src: SRC, alt: '図', placement: 'right', step: 2 });
  assert.equal(out.replace(/\r\n/g, '').includes('\n'), false);
});

ok('the inserted image counts in the image-size check and has alt (no imgAlt); the alt is what was typed', () => {
  const out = insertImage(DECK, 2, { src: SRC, alt: '勾配の図', placement: 'half', step: 1 });
  const f = imageSizeFindings(out);
  assert.deepEqual(f.map((x) => x.code), ['imgTotal']);
  assert.equal(f[0].a.n, PNG.length);
  let alt = null;
  const walk = (x) => { if (x.tagName === 'img') alt = (x.attrs.find((a) => a.name === 'alt') || {}).value; (x.childNodes || []).forEach(walk); };
  walk(parse(out));
  assert.equal(alt, '勾配の図');
});

ok('AI instructions: the photo line (figure box + description, the author adds the image) is in the paid plan only (the en free pack has no room)', () => {
  assert.equal(planSpans('a\n<!--paid-->- b<!--/paid-->\nc', 'free'), 'a\n\nc');
  assert.equal(planSpans('a\n<!--paid-->- b<!--/paid-->\nc', 'paid'), 'a\n- b\nc');
  const line = { en: '- Where a photo is needed, write a figure box (the Figure template) with a description of the photo; the author adds the image later\n', ja: '- 写真が要る所は、図の枠（テンプレートの「図」）と内容の説明を書き、画像は作成者が後で入れる\n' };
  for (const lang of ['en', 'ja']) {
    const paid = buildPack({ lang, plan: 'paid' }), free = buildPack({ lang, plan: 'free' });
    assert.ok(paid.includes('R-components') && paid.includes(line[lang]) && !paid.includes('paid-->'), lang + ' paid');
    assert.ok(!free.includes(line[lang].trim()) && !free.includes('paid-->'), lang + ' free');
  }
});

console.log(`test-image-insert: ${n} ok`);
