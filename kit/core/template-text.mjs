// スライドの雛形の決まった文字（編集アプリのスライド一覧が足す雛形。kit/core/slide-ops.mjs）と、口述原稿の仮の行の印。1 か所だけに書く
// Node にもブラウザにも依存しない（読み込むのは parse5 と narration-core だけ）。品質チェック（kit/check.mjs と編集アプリ）・TTS（tools/narration-json.mjs）・
// 書き出し（kit/build.mjs の --portable / --play-only と編集アプリ）が読み、直し忘れを知らせる（警告。止めない）
//
//   PLACEHOLDER_MARK・placeholderLine(hint)・isPlaceholder(text)   口述原稿の仮の行：「✎ 」で始まる 1 行（TTS がそのまま読まないよう、直し忘れを見つける印）
//   TEMPLATE_TEXT[lang][kind]                                       雛形の見出し・本文・結論の行・仮の口述原稿の言葉（ja・en）
//   TEMPLATE_DEFAULTS                                               スライドに出る雛形の字（両方の言葉。比べるときは空白をそろえる）
//   placeholderSteps(narration)  → [{slideKey, stepKey, line, text}]  仮の行が残っている段階
//   templateTextIn(deck)         → [{index, key, texts: [字…]}]      雛形のままの字が残っているスライド
//   draftLeftovers(deck, narration) → {steps, slides}               上の 2 つ（書き出しと TTS の前に見せる）
import { parse } from 'parse5';
import { parseNarration } from './narration-core.mjs';
import { analyzeSlideIds } from './build-core.mjs';

export const PLACEHOLDER_MARK = '✎';
export const placeholderLine = (hint) => `${PLACEHOLDER_MARK} ${hint}`;
export const isPlaceholder = (text) => String(text ?? '').trimStart().startsWith(PLACEHOLDER_MARK);

// 雛形の字。h：見出し、そのほかはスライドに出る字。n・ni・nc：仮の口述原稿（placeholderLine で包む）
export const TEMPLATE_TEXT = Object.freeze({
  ja: {
    'title-body': { h: '新しいスライドの見出し', li: ['1 つ目の項目', '2 つ目の項目'], concl: '⇒ このスライドの結論', n: 'このスライドで話すことを書く', ni: ['1 つ目の項目で話すことを書く', '2 つ目の項目で話すことを書く'], nc: '結論の行で話すことを書く' },
    'two-cols': { h: '2 つを比べる見出し', a: '左の列の見出し', b: '右の列の見出し', la: '左の列の項目', lb: '右の列の項目', concl: '⇒ 比べて分かること', n: '左と右を比べて話すことを書く', nc: '結論の行で話すことを書く' },
    figure: { h: '図の題', fig: '図をここに', cap: '図 1：図の説明', concl: '→ 図から読み取れること', n: '図を指しながら話すことを書く', nc: '結論の行で話すことを書く' },
    section: { h: '新しい章の題', lead: 'この章で話すこと', n: 'この章で話すことを書く' },
    quote: { h: '引用の題', q: '「引用する文をここに書きます」', cite: '— 出典', n: '引用を読み上げ、何を言っているかを書く' },
  },
  en: {
    'title-body': { h: 'New slide heading', li: ['First point', 'Second point'], concl: '⇒ The point of this slide', n: 'Write what you say on this slide', ni: ['Write what you say with the first point', 'Write what you say with the second point'], nc: 'Write what you say with the conclusion line' },
    'two-cols': { h: 'Heading for the comparison', a: 'Left column heading', b: 'Right column heading', la: 'Left column point', lb: 'Right column point', concl: '⇒ What the comparison shows', n: 'Write how you compare the left and the right', nc: 'Write what you say with the conclusion line' },
    figure: { h: 'Figure title', fig: 'Figure goes here', cap: 'Figure 1: what it shows', concl: '→ What the figure shows', n: 'Write what you say while pointing at the figure', nc: 'Write what you say with the conclusion line' },
    section: { h: 'New chapter title', lead: 'What this chapter covers', n: 'Write what this chapter covers' },
    quote: { h: 'Quote title', q: '“Write the quoted text here.”', cite: '— Source', n: 'Read the quote and write what it means' },
  },
});
const NARR_KEYS = new Set(['n', 'ni', 'nc']);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const TEMPLATE_DEFAULTS = Object.freeze([...new Set(Object.values(TEMPLATE_TEXT).flatMap((L) => Object.values(L).flatMap((t) =>
  Object.entries(t).filter(([k]) => !NARR_KEYS.has(k)).flatMap(([, v]) => [].concat(v)).map(norm))))]);
const DEFAULTS = new Set(TEMPLATE_DEFAULTS);

export function placeholderSteps(narration) {
  if (narration == null) return [];
  const out = [];
  for (const g of parseNarration(String(narration))) {
    const t = g.turns.find((x) => isPlaceholder(x.raw));
    if (t) out.push({ slideKey: g.slideKey, stepKey: g.stepKey, line: g.line, text: norm(t.raw).slice(0, 80) });
  }
  return out;
}

function walk(node, fn) {
  fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
  if (node.content) walk(node.content, fn);
}
const textOf = (n) => { let s = ''; walk(n, (x) => { if (x.nodeName === '#text') s += x.value; }); return s; };
const isSlide = (n) => n.tagName === 'section' && ((n.attrs || []).find((a) => a.name === 'class')?.value || '').split(/\s+/).includes('slide');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

export function templateTextIn(deck) {
  const keys = analyzeSlideIds(String(deck)).slides;
  const out = [];
  let n = 0;
  walk(parse(String(deck)), (node) => {
    if (!node.tagName || !isSlide(node)) return;
    const i = n++, found = new Set();
    walk(node, (x) => {
      if (!x.tagName || x === node) return;
      const t = norm(textOf(x).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ENT[e]));
      if (t && DEFAULTS.has(t)) found.add(t);
    });
    if (found.size) out.push({ index: i, key: keys[i] ? keys[i].key : `s${i + 1}`, texts: [...found] });
  });
  return out;
}

export function draftLeftovers(deck, narration) {
  return { steps: placeholderSteps(narration), slides: deck == null ? [] : templateTextIn(deck) };
}

// コマンド（kit/build.mjs の --portable / --play-only）が出す行（英語と日本語の両方）。編集アプリは app/i18n.js の言葉で出す
export function leftoverLines(left) {
  const out = [];
  for (const s of left.slides) out.push(`slide ${s.index + 1} (${s.key}): template text left / 雛形の字のまま: ${s.texts.map((x) => `“${x}”`).join(', ')}`);
  for (const p of left.steps) out.push(`narration.md line ${p.line} (${p.slideKey}:${p.stepKey}): template placeholder (✎) left / 仮の口述原稿のまま: “${p.text}”`);
  return out;
}
