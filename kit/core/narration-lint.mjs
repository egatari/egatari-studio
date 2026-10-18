// 口述原稿（narration.md）の書き方の検査で、検査器（kit/check.mjs）と編集アプリの簡易チェック（app/llm.js）が共有するもの。
// Node にもブラウザにも依存しない（純粋な ESM）。書式は docs/contract.md §4
//
//   readingProblems(raw)          段階の発言の元の文字列（{…} を含む）→ [{display, reading, why: 'operator' | 'several', text}]
//     読みの指定 {x|y} は 1 つの記号か用語だけに付ける（{θ|シータ}、{N₀|エヌゼロ}、{ReLU|レルー}）。飾りの付いた 1 つの記号はよい
//     （{Q*|キュースター}、{x′|エックスプライム}、{x_0|…}、{x^2|…}、{θ̂|シータハット}、{\hat{\theta}|…}、{\theta|シータ}）。
//     x に演算子（= + − × / < > ^ _ \ など、数字や記号の隣の -）があれば 'operator'（式を読み上げている）、
//     記号が 2 つ以上（θとη、a, b、x y）なら 'several'。f(x) の形（記号の後ろに括弧で 1 つ）は 1 つとみなす
//   stepKeysOf({max, cstep, static}) 段階の鍵の集まり（kit/deck.js の stepKey と同じ：cstep の段階は concl）
//   orphanSteps(segs, slides)     narration.md の段階のうち、スライドにないもの → [{slideKey, stepKey, line, valid}]
//     slides：[{key, max, cstep, static}]（組んだデッキの DECK.slides の _key・_max・_cstep）。どのスライドにも合わない節は build が知らせる
//   orphanDetail(o, slide, text)  orphanSteps の 1 つを直す手がかり → {keys: ['0', …, 'concl'], n（番号の段階の最後）, concl, static,
//     target（行を合わせる先の段階の鍵）, lines: [{n: 行番号, text: その行のまま}]}。text は narration.md の全体（なければ lines は空）
const READING = /\{([^{}|]+)\|([^{}]+)\}/g;
const OPS = /[=+−×÷*/<>≤≥≠≈∝^_\\∑∫√]/;
const SYM_START = 'A-Za-z\\u0370-\\u03FF';
const SYM_BODY = `${SYM_START}0-9\\u0300-\\u036F\\u2070-\\u209C\\u00B2\\u00B3\\u00B9'′`;
const RUN = new RegExp(`[${SYM_START}][${SYM_BODY}]*(?:-[${SYM_START}][${SYM_BODY}]*)*`, 'g');
const FUNC = new RegExp(`^[${SYM_START}][${SYM_BODY}]*\\([${SYM_START}][${SYM_BODY}]*\\)$`);

// 1 つの記号の飾りを外す：上付き・下付き（x₀ x_0 x^2 x_{i+1}）、星（Q*。後ろに記号が続かないもの）、プライム（x′ x'）、
// 上の印（θ̂ x̄ の結合文字、\hat{θ} \bar{x} \tilde{x} など）、LaTeX の 1 つのマクロ（\theta）。残りで演算子と記号の数を見る
const DECOR = /\\(?:hat|bar|tilde|dot|ddot|vec|overline|widehat|widetilde|check|breve|acute|grave|mathbf|mathrm|mathit|mathsf|mathcal|mathbb|mathfrak|boldsymbol|bm)\s*\{([^{}]*)\}/g;
function bare(display) {
  let x = display;
  for (let n = 0; n < 3 && DECOR.test(x); n++) x = x.replace(DECOR, '$1');
  x = x.replace(/\\[A-Za-z]+/g, 'α')                        // \theta など 1 つのマクロ = 1 つの記号
    .replace(/[_^]\{[^{}]*\}/g, '').replace(/[_^][A-Za-z0-9Ͱ-Ͽ*′'+\-]/g, '')
    .replace(/[̀-ͯ⁰-₟²³¹ᵢ-ᵪ]/g, '')
    .replace(/[′'″‴]+/g, '')
    .replace(/\*+(?![A-Za-zͰ-Ͽ0-9(])/g, '');     // 後置の星（Q*、x*_i）。a*b の * は掛け算として残す
  return x;
}
export function readingProblems(raw) {
  const out = [];
  for (const m of String(raw).matchAll(READING)) {
    const display = m[1].trim(), reading = m[2].trim();
    if (/^(mark:|cue$)/.test(display)) continue;   // {mark:ID|effect} は読みではない
    const x = bare(display);
    let why = null;
    // 数字・ギリシャ文字の隣の - は引き算（1-η）。英字どうしの - は語の一部（t-SNE）
    if (OPS.test(x) || /[0-9Ͱ-Ͽ]\s*-|-\s*[0-9Ͱ-Ͽ]/.test(x)) why = 'operator';
    else if (!FUNC.test(x)) {
      const runs = x.match(RUN) || [];
      if (runs.length >= 2 || (runs.length === 1 && /[\s,、，・]/.test(x.trim()))) why = 'several';
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
    if (!valid.has(seg.stepKey)) out.push({ slideKey: seg.slideKey, stepKey: seg.stepKey, line: seg.line, end: seg.end || seg.line, valid: [...valid] });
  }
  return out;
}

export function orphanDetail(o, s, text) {
  const keys = [...stepKeysOf(s)];
  const concl = keys.includes('concl');
  const nums = keys.filter((k) => k !== 'concl').map(Number);
  const n = nums.length ? Math.max(...nums) : 0;
  // 合わせる先：番号なら k−1（なければ番号の最後）、[concl] なら番号の最後
  const k = /^\d+$/.test(o.stepKey) ? +o.stepKey : null;
  const target = String(k !== null && k - 1 >= 0 && k - 1 <= n ? k - 1 : n);
  const src = text ? String(text).replace(/\r\n?/g, '\n').split('\n') : [];
  const lines = [];
  for (let i = o.line; i <= (o.end || o.line) && i <= src.length; i++) if (src[i - 1].trim()) lines.push({ n: i, text: src[i - 1] });
  return { keys, n, concl, static: !!s.static, target, lines };
}
