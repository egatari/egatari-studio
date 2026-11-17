// test-all: unit
// テーマを作る画面の計算（kit/core/theme-derive.mjs。#58）：基調色から導く色・裏の確かめ・直す色・ロゴの色・書き出すファイル
// 1. 同梱の選べるテーマの基調色とフォントから始めると、どれも fail がない（作る画面の既定は通る）
// 2. 導く色は themes/default/tokens.css の式と同じ形（--term は基調色、--title は明るさ 0.32 まで、淡色は白と混ぜる、量の色の段は明るさが下がる）
// 3. 通らない基調色（明るい黄・赤・灰）は fail になり、fixFor の色ではその fail が消える。「詳しく」で替えた色は、その色を直す
// 4. pickColours：白・灰を除き、多い色から。themeFiles：tokens.css（基調色・フォント・表紙の背景画像の data: URI・印刷）と theme.json（extends・fonts・builder）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveTheme, checkInput, fixFor, pickColours, themeFiles, readBuilder, startFrom, oklch } from '../kit/core/theme-derive.mjs';
import { CHOOSABLE } from '../kit/core/themes-list.mjs';
import { contrast } from '../kit/core/color-check.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok   ' + name); };
const fails = (input, o) => checkInput(input, o).filter((x) => x.level === 'fail');

t('bundled themes: starting from each choosable theme has no failure', () => {
  for (const th of CHOOSABLE) {
    const s = startFrom(fs.readFileSync(path.join(ROOT, 'themes', th.name, 'tokens.css'), 'utf8'));
    if (!s.base) continue;   // kokugo などは default の基調色
    assert.deepEqual(fails({ base: s.base }).map((x) => x.id), [], th.name + ' ' + s.base);
  }
});
t('derived colours follow the default theme formulas', () => {
  const d = deriveTheme('#1d4f91');
  assert.equal(d.term, '#1D4F91'); assert.equal(d.rule, '#1D4F91');
  assert.ok(oklch(d.title)[0] <= 0.325 && Math.abs(oklch(d.title)[2] - oklch('#1D4F91')[2]) < 2);
  assert.ok(Math.abs(((oklch(d.complement)[2] - oklch(d.base)[2] + 360) % 360) - 180) < 3);
  assert.ok(oklch(d['base-wash'])[0] > oklch(d['base-tint'])[0] && oklch(d['base-tint'])[0] > oklch(d.base)[0]);
  const ramp = [1, 2, 3, 4, 5].map((i) => oklch(d[`ramp-${i}`])[0]);
  assert.ok(ramp.every((l, i) => !i || l < ramp[i - 1]) && contrast(d['ramp-5'], '#FFFFFF') >= 3, JSON.stringify(ramp));
  assert.equal(deriveTheme('#1d4f91', { term: '#123456', bogus: '#000000' }).term, '#123456');
});
t('failing colours fail, and the offered fix passes', () => {
  const cases = { '#F5C000': ['term-contrast', 'sec-contrast', 'washout'], '#C00000': ['cvd', 'red-hue'], '#777777': ['term-contrast', 'sec-contrast', 'washout'], '#2A2A2A': ['grey'] };
  for (const [base, ids] of Object.entries(cases)) {
    assert.deepEqual(fails({ base }).map((x) => x.id), ids, base);
    const fix = fixFor({ base }, 'base');
    assert.ok(fix && !fails({ base: fix }).length, `${base} → ${fix}`);
  }
  // 「詳しく」で替えた用語の色：その色を直す（基調色は替えない）
  const input = { base: '#0A5753', overrides: { term: '#9AB0C0' } };
  const f = fails(input);
  assert.deepEqual(f.map((x) => [x.id, x.token]), [['term-contrast', 'term'], ['washout', 'term']]);
  const fix = fixFor(input, 'term');
  assert.ok(fix && !fails({ ...input, overrides: { term: fix } }).length, fix);
  // 表紙の背景画像の平均の色：暗い画像ではタイトルが読めない
  assert.deepEqual(fails({ base: '#0A5753' }, { coverBg: '#0A0A14' }).map((x) => x.id), ['cover-title']);
});
t('pickColours: chromatic colours, most used first, no white or grey', () => {
  const px = (hex, k) => Array.from({ length: k }, () => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255)).flat();
  const rgba = [...px('#FFFFFF', 500), ...px('#0A5753', 300), ...px('#F5C000', 100), ...px('#808080', 200), ...px('#0B5854', 50)];
  assert.deepEqual(pickColours(rgba), ['#0A5753', '#F5C000']);
  assert.deepEqual(pickColours(px('#FFFFFF', 10).concat(px('#222222', 10))), []);
});
t('themeFiles and readBuilder', () => {
  const input = { base: '#0A5753', font: 'Zen Maru Gothic', overrides: { emph: '#B02020' } };
  const f = themeFiles(input, { name: 'science', title: '理科', coverImage: 'data:image/png;base64,AAAA' });
  assert.match(f['tokens.css'], /--base: #0A5753;/);
  assert.match(f['tokens.css'], /--emph: #B02020;/);
  assert.match(f['tokens.css'], /--font-sans: "Zen Maru Gothic", "Hiragino Sans"/);
  assert.match(f['tokens.css'], /--cover-bg: url\("data:image\/png;base64,AAAA"\) center \/ cover no-repeat var\(--bg\);/);
  assert.match(f['tokens.css'], /print-color-adjust:exact/);
  const j = JSON.parse(f['theme.json']);
  assert.deepEqual([j.name, j.title, j.extends, j.fonts.body], ['science', '理科', 'default', 'Zen Maru Gothic']);
  assert.deepEqual(readBuilder(f['theme.json']), { base: '#0A5753', font: 'Zen Maru Gothic', overrides: { emph: '#B02020' } });
  assert.equal(readBuilder('{"name":"x"}'), null);
  assert.equal(JSON.parse(themeFiles({ base: '#0A5753', font: 'BIZ UDPGothic' }, { name: 'x' })['theme.json']).fonts, undefined);
});
console.log(`\n${n} ok`);
