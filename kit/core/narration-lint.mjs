// 口述原稿（narration.md）の書き方の検査で、検査器（kit/check.mjs）と編集アプリの簡易チェック（app/llm.js）が共有するもの。
// Node にもブラウザにも依存しない（純粋な ESM）。書式は docs/contract.md §4
//
//   readingProblems(raw)          段階の発言の元の文字列（{…} を含む）→ [{display, reading, why: 'operator' | 'several', text}]
//     読みの指定 {x|y} は 1 つの記号か用語だけに付ける（{θ|シータ}、{N₀|エヌゼロ}、{ReLU|レルー}）。
//     x に演算子（= + − × / < > ^ _ \ など、数字や記号の隣の -）があれば 'operator'（式を読み上げている）、
//     記号が 2 つ以上（θとη、a, b、x y）なら 'several'。f(x) の形（記号の後ろに括弧で 1 つ）は 1 つとみなす
//   stepKeysOf({max, cstep, static}) 段階の鍵の集まり（kit/deck.js の stepKey と同じ：cstep の段階は concl）
//   orphanSteps(segs, slides)     narration.md の段階のうち、スライドにないもの → [{slideKey, stepKey, line, valid}]
//     slides：[{key, max, cstep, static}]（組んだデッキの DECK.slides の _key・_max・_cstep）。どのスライドにも合わない節は build が知らせる
const READING = /\{([^{}|]+)\|([^{}]+)\}/g;
const OPS = /[=+−×÷*/<>≤≥≠≈∝^_\\∑∫√]/;
const SYM_START = 'A-Za-z\\u0370-\\u03FF';
const SYM_BODY = `${SYM_START}0-9\\u0300-\\u036F\\u2070-\\u209C\\u00B2\\u00B3\\u00B9'′`;
const RUN = new RegExp(`[${SYM_START}][${SYM_BODY}]*(?:-[${SYM_START}][${SYM_BODY}]*)*`, 'g');
const FUNC = new RegExp(`^[${SYM_START}][${SYM_BODY}]*\\([${SYM_START}][${SYM_BODY}]*\\)$`);

export function readingProblems(raw) {
  const out = [];
  for (const m of String(raw).matchAll(READING)) {
    const display = m[1].trim(), reading = m[2].trim();
    if (/^(mark:|cue$)/.test(display)) continue;   // {mark:ID|effect} は読みではない
    let why = null;
    // 数字・ギリシャ文字の隣の - は引き算（1-η）。英字どうしの - は語の一部（t-SNE）
    if (OPS.test(display) || /[0-9Ͱ-Ͽ]\s*-|-\s*[0-9Ͱ-Ͽ]/.test(display)) why = 'operator';
    else if (!FUNC.test(display)) {
      const runs = display.match(RUN) || [];
      if (runs.length >= 2 || (runs.length === 1 && /[\s,、，・]/.test(display))) why = 'several';
    }
    if (why) out.push({ display, reading, why, text: m[0] });
  }
  return out;
}

export function stepKeysOf(s) {
  const keys = new Set();
  const max = s.static ? 0 : s.max;
  for (let k = 0; k <= max; k++) keys.add(k === s.cstep && !s.static ? 'concl' : String(k));
  return keys;
}

export function orphanSteps(segs, slides) {
  const byKey = new Map(slides.map((s) => [s.key, s]));
  const out = [];
  for (const seg of segs) {
    const s = byKey.get(seg.slideKey);
    if (!s) continue;
    const valid = stepKeysOf(s);
    if (!valid.has(seg.stepKey)) out.push({ slideKey: seg.slideKey, stepKey: seg.stepKey, line: seg.line, valid: [...valid] });
  }
  return out;
}
