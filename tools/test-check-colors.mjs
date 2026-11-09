// テーマの色の語彙の外の色（format spec §8.4、R-colors。kit/core/color-vocab.mjs の colorsOutsideVocabulary と kit/check.mjs の colorOutside）の試験
//   node tools/test-check-colors.mjs [作業フォルダ]
// 1. 値ごとの決まり（Node だけ）：var(--lit) などの役割・color-mix() で役割どうし・役割と --bg を混ぜた色・色相を保った相対色は知らせない。
//    じかに書いた色（16 進・色の関数・色の名前・var() の予備の値）は literal、相対色の構文（oklch・lch・hsl・hwb・rgb・lab・oklab・color() の from）で
//    色相を変えた色は hue。元の色がじかに書いた色なら literal だけ
// 2. 原稿の見るところ：<style> の宣言の値（セレクタの #id は色ではない）・style 属性・SVG の色の属性。<script> と url(#…) は見ない
// 3. kit/check.mjs --json：種類ごとに 1 つの警告 colorOutside（rule R-colors）、エラーにしない。見本（tools/fixtures/check-colors/）の
//    許すものの slide には出ない
// 4. 知らせの言葉（kit/check-messages.mjs）：日本語と英語、--lit を含む変数の一覧
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { colorsInValue, colorsOutsideVocabulary } from '../kit/core/color-vocab.mjs';
import { message } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIX = path.join(ROOT, 'tools', 'fixtures', 'check-colors');
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-colors-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const kinds = (v) => colorsInValue(v).map((x) => x.kind);

await t('許すもの：var(--lit) とほかの役割、color-mix() で役割どうし・役割と --bg、transparent・currentColor・none、url(#…)', () => {
  for (const v of ['var(--lit)', 'var(--emph)', 'var(--lit, var(--emph))', 'color-mix(in oklch, var(--emph) 30%, var(--bg))', 'color-mix(in srgb, var(--lit), var(--term))',
    '1px solid var(--line)', 'transparent', 'currentColor', 'none', 'url(#grad)', 'linear-gradient(var(--bg), var(--term-tint))']) assert.deepEqual(kinds(v), [], v);
});
await t('色相を保った相対色は知らせない（明るさ・鮮やかさ・不透明度だけ。既定のテーマの --title と同じ作り方）', () => {
  for (const v of ['oklch(from var(--emph) min(l, 0.4) c h)', 'oklch(from var(--emph) l c h / 50%)', 'lch(from var(--term) calc(l + 10) c h)', 'hsl(from var(--emph) h s calc(l * 1.2))',
    'hwb(from var(--term) h calc(w + 10%) b)', 'oklch(from var(--lit) l 0.05 h)', 'rgb(from var(--term) r g b / 0.5)', 'lab(from var(--emph) calc(l + 10) a b)',
    'oklab(from var(--emph) l a b / 40%)', 'color(from var(--emph) srgb r g b / .5)']) assert.deepEqual(kinds(v), [], v);
});
await t('色相を変えた相対色は hue：oklch・lch・hsl・hwb の色相の成分、rgb・color() のどれかの成分、lab・oklab の a・b', () => {
  for (const v of ['oklch(from var(--accent2) l c calc(h + 30))', 'oklch(from var(--emph) l c 250)', 'lch(from var(--term) l c calc(h - 90))', 'hsl(from var(--emph) 200 s l)',
    'hsl(from var(--emph) calc(h + 180) s l / .5)', 'hwb(from var(--term) calc(h + 40) w b)', 'rgb(from var(--term) r g calc(b + 40))', 'rgb(from var(--emph) b g r)',
    'lab(from var(--emph) l calc(a * -1) b)', 'oklab(from var(--term) l a 0.1)', 'color(from var(--emph) srgb r b g)', 'color(from var(--emph) display-p3 r g 0.2)',
    'oklch(from var(--emph) l h c)']) assert.deepEqual(kinds(v), ['hue'], v);
});
await t('じかに書いた色は literal：16 進・色の関数・色の名前・var() の予備・color-mix() の中・グラデーションの中。元の色がじかなら literal だけ', () => {
  for (const v of ['#fc0', '#ffcc00', '#ffcc0080', 'rgb(255 204 0)', 'rgba(0,0,0,.5)', 'hsl(48 100% 50%)', 'oklch(0.85 0.17 90)', 'color(display-p3 1 0.8 0)', 'gold', 'White',
    'var(--lit, #ffcc00)', 'color-mix(in oklch, var(--emph), white)', 'linear-gradient(red, var(--bg))', 'oklch(from #f00 l c calc(h + 30))']) assert.deepEqual(kinds(v), ['literal'], v);
  assert.deepEqual(colorsInValue('oklch(from #f00 l c calc(h + 30))').map((x) => x.what), ['#f00']);
});
await t('色の名前は色を取るプロパティの中だけ（font-family・grid-area の語は色にしない）。16 進と色の関数はどこでも', () => {
  const src = '<style>.a{font-family: Gold, serif; grid-area: red} .b{border: 2px solid tan} .c{--x: #123}</style>';
  const got = colorsOutsideVocabulary(src);
  assert.deepEqual(got.map((x) => [x.kind, x.items.map((i) => i.what)]), [['literal', ['tan', '#123']]]);
});
await t('見るところ：<style> の値（セレクタの #id は色ではない）・style 属性・SVG の色の属性。<script> は見ない。値ごとにまとめ、数と最初の行', () => {
  const src = '<style>\n#bad{color:var(--fg)}\n#face:hover{color:#ab0}\n</style>\n<svg><rect fill="red" stroke="var(--lit)"/><stop stop-color="red"/></svg>\n<p style="color:#AB0">x</p>\n<script>var c = "#fff"; el.style.fill = "red";</script>';
  const got = colorsOutsideVocabulary(src);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].items, [{ what: '#ab0', n: 2, line: 3 }, { what: 'red', n: 2, line: 5 }]);
  assert.equal(got[0].n, 4);
  assert.equal(got[0].line, 3);
});

let res = null;
await t('品質チェック（kit/check.mjs --json）：見本の原稿に colorOutside の警告が種類ごとに 1 つ（rule R-colors）。許すものは出ない。エラーにしない', () => {
  for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(FIX, f), path.join(work, f));
  const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(work, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(work, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  res = JSON.parse(c.stdout);
  const got = res.results.filter((x) => x.code === 'colorOutside');
  assert.deepEqual(got.map((x) => x.data.kind).sort(), ['hue', 'literal']);
  assert.ok(got.every((x) => x.sev === 'warn' && x.rule === 'R-colors'), JSON.stringify(got));
  const hue = got.find((x) => x.data.kind === 'hue'), lit = got.find((x) => x.data.kind === 'literal');
  assert.deepEqual(hue.data.items.map((i) => i.what), [
    'oklch(from var(--accent2) l c calc(h + 30))', 'rgb(from var(--term) r g calc(b + 40))', 'hsl(from var(--emph) calc(h + 180) s l)', 'lab(from var(--emph) l calc(a * -1) b)',
  ]);
  assert.deepEqual(lit.data.items.map((i) => i.what), ['#ffcc00']);
  const body = fs.readFileSync(path.join(FIX, 'deck.html'), 'utf8');
  for (const ok of ['var(--lit)', 'color-mix(in oklch, var(--emph) 25%, var(--bg))', 'oklch(from var(--emph) min(l, 0.45) c h)']) assert.ok(body.includes(ok), ok);
  assert.ok(!res.results.some((x) => x.sev === 'error'), JSON.stringify(res.results.filter((x) => x.sev === 'error')));
});

await t('知らせの言葉：日本語と英語。どちらも場所の数・最初の行・値を言い、literal は var(--lit) を含む変数を挙げる', () => {
  const a = { n: 2, line: 7, list: '#ffcc00, red' };
  for (const lang of ['ja', 'en']) {
    const l = message(lang, 'colorOutside', { ...a, kind: 'literal' }), h = message(lang, 'colorOutside', { ...a, kind: 'hue', list: 'oklch(from var(--accent2) l c calc(h + 30))' });
    assert.ok(l.includes('#ffcc00') && l.includes('7') && l.includes('var(--lit)') && l.includes('var(--emph)'), l);
    assert.ok(h.includes('calc(h + 30)') && h.includes('color-mix()'), h);
  }
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
