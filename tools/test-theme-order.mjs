// テーマの CSS を読む順（backlog #75・K1）と、テーマが体裁の規則を上書きできること
//   node tools/test-theme-order.mjs [作業フォルダ]
// 確かめること：<style id="deck-base"> の中の順が 実行系（base.css）→ 体裁（layouts.css）→ テーマ（tokens.css。extends の親から順）→ latin.css
//   （日本語以外のデッキだけ）であること。組み立ての口ごと（コマンドの build・dev（開発サーバーのプレビュー）・持ち運べる 1 ファイル・再生専用の派生）。
//   編集アプリも同じ kit/core/build-core.mjs の build を通る（app/engine.js）。
// ブラウザで：試験用のテーマ（tools/fixtures/theme-override。html を前に付けない、体裁と同じ詳細度の規則）が、表紙の題名の位置・本文の欄の余白・
//   見出しの下線・結論の行・ページ番号・箇条書きの印（--marker）・進み具合の帯（--bar・--bar-h、K3）で勝つこと。default のデッキは今までどおり
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, buildPortable } from '../kit/build.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-theme-order-')));
fs.mkdirSync(tmp, { recursive: true });
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok   ' + name); };

// 原稿のフォルダに試験用のテーマを themes/theme-override/ として置いたデッキ（lang・data-theme を替える）
const SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const FIX = path.join(ROOT, 'tools/fixtures/theme-override');
const deck = (name, theme, lang = 'ja') => {
  const d = path.join(tmp, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(path.join(d, 'themes'), { recursive: true });
  fs.cpSync(FIX, path.join(d, 'themes', 'theme-override'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(d, 'narration.md'));
  fs.writeFileSync(path.join(d, 'deck.html'), SRC.replace('<html lang="ja" data-theme="default">', `<html lang="${lang}" data-theme="${theme}">`));
  return path.join(d, 'deck.html');
};

// deck-base の中で、各部分の始まりの位置
const LAYOUTS = '/* スライドの体裁（layouts.css）', BASE = '/* 舞台・段階表示・印刷（base.css）', LATIN = '/* 英語など、日本語以外のデッキ';
const DEFAULT = '/* 既定のテーマ（default）', FIXTURE = '/* 試験用のテーマ（tools/test-theme-order.mjs）';
const deckBase = (html) => { const m = html.match(/<style id="deck-base">([\s\S]*?)<\/style>/); assert.ok(m, 'deck-base'); return m[1]; };
const order = (html, lang) => {
  const s = deckBase(html), at = (t) => s.indexOf(t);
  for (const t of [BASE, LAYOUTS, DEFAULT, FIXTURE]) assert.ok(at(t) >= 0, `missing in deck-base: ${t}`);
  assert.ok(at(BASE) < at(LAYOUTS), 'base.css before layouts.css');
  assert.ok(at(LAYOUTS) < at(DEFAULT), 'layouts.css before the theme (the parent theme default)');
  assert.ok(at(DEFAULT) < at(FIXTURE), 'the parent theme (extends) before the child theme');
  if (lang === 'ja') assert.equal(at(LATIN), -1, 'no latin.css for a Japanese deck');
  else assert.ok(at(FIXTURE) < at(LATIN), 'latin.css after the theme');
};

const ja = deck('ja', 'theme-override'), en = deck('en', 'theme-override', 'en'), def = deck('def', 'default');
ok('build (CLI): base.css → layouts.css → theme (parent, then child); no latin.css (ja)', () => order(build(ja, { subset: false }).html, 'ja'));
ok('build (CLI, en): … → theme → latin.css', () => order(build(en, { subset: false }).html, 'en'));
ok('build --dev (the dev server preview): the same order', () => order(build(ja, { dev: true }).html, 'ja'));
const portable = await buildPortable(ja, { subset: false });
ok('portable export: the same order', () => order(portable.html, 'ja'));
const play = await buildPortable(en, { subset: false, playOnly: true });
ok('play-only export (en): the same order', () => order(play.html, 'en'));

// ブラウザ：計算された値で、テーマの規則が勝つこと
const files = { fix: path.join(tmp, 'fix.html'), def: path.join(tmp, 'def.html') };
fs.writeFileSync(files.fix, build(ja, { subset: false }).html);
fs.writeFileSync(files.def, build(def, { subset: false }).html);
const b = await launch();
const errs = [];
const probe = async (file) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(fileUrl(file) + '?mode=video');
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const r = await p.evaluate(() => {
    const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo || null);
    return {
      coverTop: cs('.cover h1').top, bodyLeft: cs('.slide .body').left, bodyRight: cs('.slide .body').right,
      h2Border: cs('.slide h2').borderBottomWidth, conclLeft: cs('.concl').left, conclRadius: cs('.concl').borderTopLeftRadius,
      pn: document.querySelector('.pn') ? cs('.pn').fontSize : null,
      marker: cs('.body li', '::marker').color, barH: cs('#bar').height, barBg: cs('#bar').backgroundColor,
    };
  });
  await p.close();
  return r;
};
const fix = await probe(files.fix), d0 = await probe(files.def);
await b.close();
ok('default theme: the layout values of layouts.css / base.css', () => {
  assert.equal(d0.coverTop, '200px'); assert.equal(d0.bodyLeft, '48px'); assert.equal(d0.bodyRight, '48px');
  assert.equal(d0.h2Border, '2px'); assert.equal(d0.conclLeft, '48px'); assert.equal(d0.conclRadius, '10px'); assert.equal(d0.barH, '3px');
  if (d0.pn) assert.equal(d0.pn, '16px');
});
ok('a theme rule without an html prefix overrides layouts.css (cover title, .body inset, h2 rule, .concl, .pn)', () => {
  assert.equal(fix.coverTop, '260px'); assert.equal(fix.bodyLeft, '96px'); assert.equal(fix.bodyRight, '96px');
  assert.equal(fix.h2Border, '6px'); assert.equal(fix.conclLeft, '30px'); assert.equal(fix.conclRadius, '0px');
  if (fix.pn) assert.equal(fix.pn, '18px');
});
ok('K3 tokens: --marker (list markers), --bar and --bar-h (the progress bar)', () => {
  assert.equal(fix.marker, 'rgb(92, 88, 83)'); assert.equal(fix.barH, '6px'); assert.equal(fix.barBg, 'rgb(138, 133, 126)');
  assert.notEqual(d0.marker, fix.marker); assert.notEqual(d0.barBg, fix.barBg);
});
ok('no page errors', () => assert.deepEqual(errs, []));
console.log(`${n} checks passed`);
