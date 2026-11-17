// テーマを作る画面（新規作成の ③ の「オリジナル」。#58・handoff/theme-builder-v2-2026-10-27.md）の計算：
// 基調色 1 つからほかの色を導き、裏で色を確かめ、通らないときは通るいちばん近い色を探し、テーマのファイル（tokens.css・theme.json）を書く。
// 外の名前を使わない（ブラウザでも Node でも動く。app/theme-workshop.js と tools/test-theme-derive.mjs が使う）。色の計算は kit/core/color-check.mjs
//
//   deriveTheme(base, overrides) → {base, title, term, rule, complement, accent2, 'base-tint', 'base-wash', 'comp-tint', emph, fg, muted, bg, 'concl-bg', 'sec-bg', 'sec-fg', 'ramp-1'…'ramp-5'}
//     式は themes/default/tokens.css の @supports の式と同じ（--title は明るさ 0.32 まで、補色は色相 +180°、淡色は OKLCH で白と混ぜる）。
//     overrides（「詳しく」で替えた色。名前は上の鍵）はそのまま勝つ
//   checkTheme(t, {coverBg}) → [{id, level: 'fail' | 'warn', token, value, need, kind?}]   通らなかったものだけ（全部通れば []）
//     token：直すときに替える入力（'base' か「詳しく」の鍵）。coverBg：表紙の背景画像の平均の色（あれば表紙のタイトルと比べる）
//   fixFor(input, token, opts) → '#RRGGBB' | null   その入力の fail がなくなる、元の色にいちばん近い色（CIEDE2000）
//   pickColours(rgba, {max}) → ['#RRGGBB', …]   ロゴの画素（RGBA の並び）から、目立つ有彩の色を 1〜3 つ（多い順）
//   themeFiles(input, {name, title, font, coverImage, at}) → {'tokens.css': 文字列, 'theme.json': 文字列}
//   readBuilder(themeJson) → 画面の入力 | null（このテーマを作る画面が書いた theme.json の builder）
//
// 基準（tools/test-themes.mjs が同梱のテーマに求めるものと同じ線）：
//   コントラスト（WCAG 2.x）：用語・タイトル・補色・結論の色・本文と地 4.5:1、結論の行の字と地 4.5:1、章の扉の字と地 4.5:1、表紙のタイトルと背景画像 4.5:1
//   色覚（Machado ほか 2009）：結論の色と用語の色の差が 3 色型・1 型・2 型で ΔE*ab 35 以上と CIEDE2000 20 以上、3 型は CIEDE2000 20（足りなければ warn）
//   基調色の色相が結論の赤に近い（OKLCH で 25° 未満、鮮やかさ 0.05 以上）：fail
//   白黒（印刷・白黒の投影）：用語の色と本文の黒の CIEDE2000（明るさだけの差）4 未満は fail、8 未満は warn（墨・焦茶・弁柄の基調色は 5〜6 で warn）
//   白飛び（明るい部屋の投影。周りの光 15%）：用語の色と地のコントラスト 3:1 以上（fail）
//   印刷：書き出す tokens.css が章の扉と表紙に print-color-adjust:exact を書くので、背景のグラフィックを印刷しない設定でも地が消えない（検査は要らない）
import { contrast, de76, de2000, simulate, hex2rgb, rgb2hex, relLum } from './color-check.mjs';
import { FONT_LIST } from './build-core.mjs';

// ---------------------------------------------------------------- OKLab / OKLCH（Björn Ottosson 2020）
const R = Math.PI / 180;
const lin1 = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const delin1 = (v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
function oklab(c) {
  const [r, g, b] = hex2rgb(c).map(lin1);
  const L = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), M = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), S = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * L + 0.7936177850 * M - 0.0040720468 * S, 1.9779984951 * L - 2.4285922050 * M + 0.4505937099 * S, 0.0259040371 * L + 0.7827717662 * M - 0.8086757660 * S];
}
function oklabToLin([l, a, b]) {
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, S = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S];
}
export function oklch(c) { const [L, a, b] = oklab(c), C = Math.hypot(a, b); return [L, C, C < 1e-4 ? NaN : ((Math.atan2(b, a) / R) % 360 + 360) % 360]; }
// 色域の外なら鮮やかさを下げて入れる（ブラウザの色域の写し方と 1 段ずれることがある）
export function fromOklch(L, C, h) {
  if (Number.isNaN(h)) { h = 0; C = 0; }
  L = Math.min(1, Math.max(0, L));
  for (let i = 0; i < 60; i++) {
    const l = oklabToLin([L, C * Math.cos(h * R), C * Math.sin(h * R)]);
    if (l.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return rgb2hex(l.map(delin1));
    C *= 0.94;
  }
  return rgb2hex(oklabToLin([L, 0, 0]).map(delin1));
}
// color-mix(in oklch, c p, white)
function mixWhite(c, p) {
  const [L, C, h] = oklch(c);
  return fromOklch(p * L + (1 - p), p * C, h);
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export const isHex = (s) => /^#?[0-9a-f]{6}$/i.test(String(s || '').trim());
export const normHex = (s) => '#' + String(s).trim().replace(/^#/, '').toUpperCase();
const grey = (c) => { const y = delin1(relLum(c)); return [y, y, y]; };
const washout = (c, a = 0.15) => hex2rgb(c).map(lin1).map((v) => delin1(a + (1 - a) * v));

// ---------------------------------------------------------------- 導く
// 基調色に依らない色（themes/default/tokens.css と同じ値）
export const FIXED = Object.freeze({ emph: '#BE3012', fg: '#222222', muted: '#5C5853', bg: '#FFFFFF', 'concl-bg': '#F5F5F5', 'sec-fg': '#FFFFFF' });
// 「詳しく」で替えられる色（画面の並び）
export const EDITABLE = Object.freeze(['title', 'term', 'emph', 'accent2', 'base-tint', 'base-wash']);
export function deriveTheme(base, overrides = {}) {
  base = normHex(base);
  const [L, C, h] = oklch(base);
  const comp = fromOklch(L, C, Number.isNaN(h) ? h : (h + 180) % 360);
  const [cL, cC, ch] = oklch(comp);
  const t = {
    base, rule: base, term: base, 'sec-bg': base,
    title: fromOklch(Math.min(L, 0.32), C, h),
    complement: comp, accent2: fromOklch(Math.min(cL, 0.55), cC, ch),
    'base-tint': mixWhite(base, 0.22), 'base-wash': mixWhite(base, 0.07), 'comp-tint': mixWhite(comp, 0.22),
    ...FIXED,
  };
  // 量の色の段（format spec §8.4）：基調色の色相で、明るさが単調に下がる 5 段（--ramp-5 は地と 3:1 以上）
  const cc = Math.min(Number.isNaN(h) ? 0 : C, 0.14);
  [0.94, 0.82, 0.68, 0.54, 0.40].forEach((l, i) => { t[`ramp-${i + 1}`] = fromOklch(l, cc * [0.25, 0.5, 0.75, 0.9, 1][i], h); });
  for (const [k, v] of Object.entries(overrides || {})) if (EDITABLE.includes(k) && isHex(v)) t[k] = normHex(v);
  return t;
}

// ---------------------------------------------------------------- 確かめる
export const NEED = Object.freeze({ text: 4.5, washout: 3, de76: 35, de2000: 20, grey: 8, greyFail: 4, redHue: 25 });
// input：{base, overrides}。返すのは通らなかったものだけ
export function checkTheme(t, { coverBg = null, overrides = {} } = {}) {
  const out = [];
  const who = (k) => (overrides && overrides[k] ? k : 'base');   // 直すときに替える入力
  const text = (id, fg, bg, token) => { const v = contrast(fg, bg); if (v < NEED.text) out.push({ id, level: 'fail', token, value: v, need: NEED.text }); };
  text('term-contrast', t.term, t.bg, who('term'));
  text('title-contrast', t.title, t.bg, who('title'));
  text('accent2-contrast', t.accent2, t.bg, who('accent2'));
  text('sec-contrast', t['sec-fg'], t['sec-bg'], 'base');
  if (overrides && overrides.emph) { text('emph-contrast', t.emph, t.bg, 'emph'); text('concl-contrast', t.emph, t['concl-bg'], 'emph'); }
  if (coverBg) text('cover-title', t.title, coverBg, 'cover');
  // 色覚：結論の色と用語の色
  const ct = overrides && overrides.term ? 'term' : overrides && overrides.emph ? 'emph' : 'base';
  let worst = null;
  for (const kind of ['normal', 'protan', 'deutan']) {
    const a = simulate(t.emph, kind), b = simulate(t.term, kind), d00 = de2000(a, b), d76 = de76(a, b);
    if (d00 < NEED.de2000 || d76 < NEED.de76) { const v = d00 < NEED.de2000 ? d00 : d76, need = d00 < NEED.de2000 ? NEED.de2000 : NEED.de76; if (!worst || v / need < worst.value / worst.need) worst = { kind, value: v, need, metric: d00 < NEED.de2000 ? 'de2000' : 'de76' }; }
  }
  if (worst) out.push({ id: 'cvd', level: 'fail', token: ct, ...worst });
  else { const d = de2000(simulate(t.emph, 'tritan'), simulate(t.term, 'tritan')); if (d < NEED.de2000) out.push({ id: 'cvd', level: 'warn', token: ct, kind: 'tritan', value: d, need: NEED.de2000, metric: 'de2000' }); }
  // 基調色の色相が結論の赤に近い
  const [, bc, bh] = oklch(t.base), [, , eh] = oklch(t.emph);
  if (!Number.isNaN(bh) && !Number.isNaN(eh) && bc >= 0.05 && hueGap(bh, eh) < NEED.redHue) out.push({ id: 'red-hue', level: 'fail', token: 'base', value: hueGap(bh, eh), need: NEED.redHue });
  // 白黒
  const g = de2000(grey(t.term), grey(t.fg));
  if (g < NEED.grey) out.push({ id: 'grey', level: g < NEED.greyFail ? 'fail' : 'warn', token: who('term'), value: g, need: NEED.grey });
  // 白飛び
  const w = contrast(washout(t.term), washout(t.bg));
  if (w < NEED.washout) out.push({ id: 'washout', level: 'fail', token: who('term'), value: w, need: NEED.washout });
  return out;
}
export const checkInput = (input, opts = {}) => checkTheme(deriveTheme(input.base, input.overrides), { ...opts, overrides: input.overrides || {} });

// ---------------------------------------------------------------- 直す色を探す
// token の fail がなくなる色のうち、元の色にいちばん近いもの（CIEDE2000）。OKLCH の明るさを動かし、色相も ±90° まで回して探す
export function fixFor(input, token, opts = {}) {
  const now = token === 'base' ? input.base : (input.overrides || {})[token];
  if (!isHex(now)) return null;
  const [L, C, h] = oklch(now);
  const at = (hex) => (token === 'base' ? { ...input, base: hex } : { ...input, overrides: { ...input.overrides, [token]: hex } });
  const ok = (hex) => !checkInput(at(hex), opts).some((x) => x.level === 'fail' && x.token === token);
  let best = null, bestD = Infinity;
  for (const dh of [0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 90, -90]) {
    if (dh && Number.isNaN(h)) break;
    for (let l = 0.2; l <= 0.9001; l += 0.01) {
      const hex = fromOklch(l, C, Number.isNaN(h) ? h : (h + dh + 360) % 360);
      if (hex === normHex(now) || !ok(hex)) continue;
      const d = de2000(hex, now);
      if (d < bestD) { best = hex; bestD = d; }
    }
  }
  return best;
}

// ---------------------------------------------------------------- ロゴから色を拾う
// rgba：Uint8ClampedArray か数の並び（canvas の getImageData の data）。透けた画素・白・黒・灰（鮮やかさ 0.04 未満）は数えない。
// 色相 30° × 明るさ 3 段の箱で数え、多い箱から（同じ色相の箱は 1 つだけ）、箱の平均の色
export function pickColours(rgba, { max = 3 } = {}) {
  const bins = new Map();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const hex = rgb2hex([rgba[i], rgba[i + 1], rgba[i + 2]].map((v) => v / 255));
    const [L, C, h] = oklch(hex);
    if (C < 0.04 || L > 0.95 || L < 0.12 || Number.isNaN(h)) continue;
    const k = `${Math.floor(h / 30)}:${Math.min(2, Math.floor(L * 3))}`;
    const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0, hue: Math.floor(h / 30) };
    b.n++; b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2];
    bins.set(k, b);
  }
  const total = [...bins.values()].reduce((s, b) => s + b.n, 0), seen = new Set(), out = [];
  for (const b of [...bins.values()].sort((x, y) => y.n - x.n)) {
    if (out.length >= max || b.n < total * 0.04 || seen.has(b.hue)) continue;
    seen.add(b.hue);
    out.push(rgb2hex([b.r, b.g, b.b].map((v) => v / b.n / 255)));
  }
  return out;
}

// ---------------------------------------------------------------- 書き出す
export const FONT_CHOICES = Object.freeze(FONT_LIST.filter((f) => f.group !== 'mono'));
const FALLBACK = { ja: '"Hiragino Sans", "Yu Gothic", sans-serif', en: '"Helvetica Neue", Arial, sans-serif' };
const SERIF = /Mincho|Serif|Fraunces/i;
export const fontStack = (family) => {
  const f = FONT_CHOICES.find((x) => x.family === family) || FONT_CHOICES[0];
  return `"${f.family}", ${SERIF.test(f.family) ? (f.group === 'ja' ? '"Hiragino Mincho ProN", "Yu Mincho", serif' : 'Georgia, serif') : FALLBACK[f.group] || 'sans-serif'}`;
};
const TOKEN_ORDER = ['base', 'title', 'complement', 'accent2', 'base-tint', 'base-wash', 'comp-tint', 'term', 'emph', 'ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5'];
// input：{base, overrides, font}。coverImage：'data:image/…;base64,…'（そのまま tokens.css に入る。テーマの hash と 1 ファイルに入る。#171(b)）
export function themeFiles(input, { name, title = '', coverImage = '', results = null } = {}) {
  const t = deriveTheme(input.base, input.overrides);
  const res = results || checkInput(input);
  const head = [`/* ${title || name}: made with the theme builder in Egatari Studio (New…, step 3, Custom).`,
    `   Main colour ${t.base}. The other colours are worked out from it${Object.keys(input.overrides || {}).length ? '; changed by hand: ' + Object.keys(input.overrides).join(', ') : ''}.`,
    `   Checks: ${res.length ? res.map((x) => `${x.level} ${x.id}`).join(', ') : 'all passed'}. */`];
  const lines = TOKEN_ORDER.map((k) => `  --${k}: ${t[k]};`);
  lines.push(`  --font-sans: ${fontStack(input.font)};`);
  if (coverImage) lines.push(`  --cover-bg: url("${coverImage}") center / cover no-repeat var(--bg);`);
  const css = [...head, ':root{', ...lines, '}',
    '/* print the section divider and cover backgrounds even when the browser does not print background graphics */',
    '@media print{.slide.sec,.slide.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}}', ''].join('\n');
  const f = FONT_CHOICES.find((x) => x.family === input.font);
  const json = { name, ...(title ? { title } : {}), extends: 'default', version: '1.0.0',
    ...(f && !f.default ? { fonts: { body: f.family } } : {}),
    builder: { base: t.base, font: input.font || '', ...(Object.keys(input.overrides || {}).length ? { overrides: input.overrides } : {}) } };
  return { 'tokens.css': css, 'theme.json': JSON.stringify(json, null, 2) + '\n' };
}
export function readBuilder(themeJson) {
  let j;
  try { j = typeof themeJson === 'string' ? JSON.parse(themeJson) : themeJson; } catch { return null; }
  const b = j && j.builder;
  if (!b || !isHex(b.base)) return null;
  const overrides = {};
  for (const [k, v] of Object.entries(b.overrides || {})) if (EDITABLE.includes(k) && isHex(v)) overrides[k] = normHex(v);
  return { base: normHex(b.base), font: FONT_CHOICES.some((f) => f.family === b.font) ? b.font : '', overrides };
}
// 同梱のテーマの tokens.css から始める値（最後の --base と --font-sans の最初の名前）
export function startFrom(tokensCss) {
  const c = String(tokensCss || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const b = [...c.matchAll(/--base\s*:\s*(#[0-9a-fA-F]{6})\b/g)].pop();
  const f = [...c.matchAll(/--font-sans\s*:\s*([^;}]+)/g)].pop();
  const fam = f ? f[1].split(',')[0].trim().replace(/^["']|["']$/g, '') : '';
  return { base: b ? normHex(b[1]) : null, font: FONT_CHOICES.some((x) => x.family === fam) ? fam : '' };
}
