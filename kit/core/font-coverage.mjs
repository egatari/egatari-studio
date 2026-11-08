// 字の範囲の点検（#178 (4)。handoff/font-subset-design-2026-11-05.md §4）：組んだ HTML（作業フォルダの out/deck.html か 1 ファイル）の、
// 見える字（スライドの字・口述原稿の表示の字・本文）のうち、埋め込んだ字（@font-face の unicode-range）のどれにも入らない字を挙げる。
// 入らない字は、字体の並び（--font-sans・--font-mincho の後ろの端末の字体）で出る。段 A の編集（§7.2）の後や、絞り込んだ字の後で使う。
//   uncoveredGlyphs(html) → {faces: [{family, weight, style}], missing: [{char, cp, where}], byFamily: {<和文の字体>: 字}}（where：slides | narration | article）
//   missing はどの字にも入らない字（端末の字体で出る）。byFamily は和文の字体（一覧の group ja）ごとに、その字体が持たない和文の字（ラテン文字より後ろ）：
//   明朝で組む縦書きの本の字がゴシックにだけある、のような字体の取り違えを見る（どの字体で組むかは CSS 次第なので、点検は粗い）
// 字の範囲を書かない @font-face（字を絞り込んだ古いもの）は、どの字も持つとみなす（知らせすぎない）。ブラウザも node: も使わない
import { parseRange, decodeEntities, FONT_LIST, LATIN_MAX } from './build-core.mjs';

const visible = (h) => decodeEntities(String(h).replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ''));
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'ttsParts') strings(x, out);
  return out;
};
export function uncoveredGlyphs(html) {
  const h = String(html);
  const faces = [];
  for (const m of h.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const b = m[1];
    const fam = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/.exec(b);
    if (!fam) continue;
    const r = /unicode-range\s*:\s*([^;]+)/.exec(b);
    faces.push({ family: (fam[1] || fam[2] || fam[3]).trim(), weight: +(/font-weight\s*:\s*(\d+)/.exec(b) || [0, 400])[1], style: (/font-style\s*:\s*(\w+)/.exec(b) || [0, 'normal'])[1], range: r ? parseRange(r[1].trim()) : null });
  }
  const covered = (c) => faces.some((f) => !f.range || f.range.some(([a, b]) => c >= a && c <= b));
  const parts = [];
  const stage = /<div id="stage"[^>]*>([\s\S]*?)<div id="bar"/.exec(h);
  parts.push(['slides', visible(stage ? stage[1] : '')]);
  const narr = /<script\b[^>]*id="deck-narration"[^>]*>([\s\S]*?)<\/script>/.exec(h);
  if (narr) { try { parts.push(['narration', strings(JSON.parse(narr[1])).join('\n')]); } catch { /* 読めなければ数えない */ } }
  const art = /<article id="egatari-article"[\s\S]*?<\/article>/.exec(h);
  if (art) parts.push(['article', visible(art[0])]);
  const seen = new Set(), missing = [];
  for (const [where, t] of parts) for (const ch of t) {
    const c = ch.codePointAt(0);
    // 空白と、字形を持たない書式の字（ゼロ幅の空白 U+200B・式の見えない演算子 U+2061 など。Unicode の Cf）は数えない：どの字体で組んでも見えない
    if (c <= 0x20 || seen.has(c) || /\s|\p{Cf}/u.test(ch)) continue;
    seen.add(c);
    if (!covered(c)) missing.push({ char: ch, cp: c, where });
  }
  const ja = new Set(FONT_LIST.filter((f) => f.group === 'ja').map((f) => f.family));
  const byFamily = {};
  for (const fam of new Set(faces.filter((f) => ja.has(f.family)).map((f) => f.family))) {
    const fs = faces.filter((f) => f.family === fam);
    const miss = [...seen].filter((c) => c > LATIN_MAX && !fs.some((f) => !f.range || f.range.some(([a, b]) => c >= a && c <= b))).sort((a, b) => a - b);
    if (miss.length) byFamily[fam] = String.fromCodePoint(...miss);
  }
  const uniq = new Map(faces.map((f) => [`${f.family}/${f.weight}/${f.style}`, { family: f.family, weight: f.weight, style: f.style }]));
  return { faces: [...uniq.values()], missing: missing.sort((a, b) => a.cp - b.cp), byFamily };
}
