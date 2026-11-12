// 図の札の字の範囲（backlog #201、kit/core/geometry-check.mjs が使う）：基線から上 up・下 down（em）。
// 字体の申告する枠（ascent/descent）は行の上下の余白を含むので使わず、実際の字の形の範囲（canvas の actualBoundingBox）を測った値。
// 測り方：node tools/measure-text-band.mjs（同梱の字体を埋め込んで、欧文・和文・数字・混ぜた札の範囲を出す）。
// 値はその字体の欧文・和文・数字の最大を 0.01em 単位で切り上げたもの。アクセント付きの大文字（É・Å）は入れない
// （Andika・Shippori Mincho で +0.99 に届き、ほかの札の誤った重なりを増やすため。札にアクセントはまれ）。
// 字体を足すとき：tools/measure-text-band.mjs の FONTS に 1 行足して測り、この表に 1 行足す。
// 横書きだけ。縦書き（tate）は字の範囲が中心線の左右になるので、形の点検は skipped（tate）にする。
// 測った日：2026-11-12（Chrome。handoff/v0.6.11-check-sketch-2026-11-12.md に表）。Hiragino Sans は Mac だけの代わりの字体で埋め込まないので、表に入れない。

export const TEXT_BANDS = Object.freeze({
  'BIZ UDPGothic': { up: 0.86, down: 0.12 },
  'BIZ UDPMincho': { up: 0.86, down: 0.12 },
  'Zen Maru Gothic': { up: 0.85, down: 0.22 },
  'Klee One': { up: 0.81, down: 0.18 },
  'Shippori Mincho': { up: 0.85, down: 0.26 },
  'Source Sans 3': { up: 0.85, down: 0.23 },
  'Source Serif 4': { up: 0.85, down: 0.25 },
  'Source Code Pro': { up: 0.85, down: 0.23 },
  'Andika': { up: 0.85, down: 0.24 },
  'Atkinson Hyperlegible Next': { up: 0.85, down: 0.20 },
  'Noto Sans JP': { up: 0.85, down: 0.20 },
});

// 表にない字体だけの札：表のすべてを覆う範囲
export const DEFAULT_BAND = Object.freeze({
  up: Math.max(...Object.values(TEXT_BANDS).map((b) => b.up)),
  down: Math.max(...Object.values(TEXT_BANDS).map((b) => b.down)),
});

// font-family の並び（getComputedStyle の文字列）→ 範囲。並びの中で表にある字体のうち最も広いもの
// （和文の字が欧文の字体から代わりの字体に落ちても覆えるように、並びの全部を見る）。表にある字体がなければ DEFAULT_BAND
export function textBand(fontFamily = '') {
  const names = String(fontFamily).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  const known = names.map((n) => TEXT_BANDS[n]).filter(Boolean);
  if (!known.length) return DEFAULT_BAND;
  return { up: Math.max(...known.map((b) => b.up)), down: Math.max(...known.map((b) => b.down)) };
}
