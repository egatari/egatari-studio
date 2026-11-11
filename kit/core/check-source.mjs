// 品質チェックのうち、原稿の文字列（deck.html・narration.md・voice.json の lang）だけで決まるもの。コマンド版（kit/check.mjs）と同じ code・重さ・値で、
// 編集アプリ（app/main.js の checkResults）がプレビューの答え（app/frame-shim.js）に足す。Node にもブラウザにも依存しない（純粋な ESM）
//   sourceFindings({deck, narration, voiceLang}) → [{i（スライドの番号か null）, sev, code, a（kit/check-messages.mjs の値）, step（段階の鍵か null）}]
//     I：id の書式・重なり（slideId）、旧来の鍵（legacyDataKey・legacyIndex）、1.0 の語彙にない書き方（legacyColorClass・legacyStepAttr・legacyLectureMode）、
//        予想（m-predict）の答えが数の棒と同時（predictAnswerWithCount）・steps が小さく答えが出ない（predictAnswerNeverShown）、
//        テーマの色の語彙の外の色（colorOutside、情報）、{#id} の見出しとスライドの見出しの違い（narrHeadingDiffers、情報）
//     B：{note:} の書き損じ（narrNote）、式らしい台本（narrFormula）、長すぎる 1 ターン（turnLong、情報）、台本の言語がスライドと違う（narrLang、情報）
//   コマンド版は台本の段階を実行系（DECK.NARRATION）から取る。ここは narration.md から取り、どのスライドにも合わない節は見ない（それは組み立ての知らせ）
import { analyzeSlideIds, isJapanese } from './build-core.mjs';
import { legacyVocabulary } from './legacy-vocab.mjs';
import { colorsOutsideVocabulary } from './color-vocab.mjs';
import { predictStepProblems } from './predict-steps.mjs';
import { parseNarration, normalizeKey, noteProblems } from './narration-parse.mjs';
import { narrationLang, textLang, formulaLike, formulaText } from './narration-lint.mjs';

export function sourceFindings({ deck, narration = '', voiceLang } = {}) {
  const out = [];
  const add = (i, sev, code, a, step = null) => out.push({ i, sev, code, a, step });
  if (typeof deck !== 'string' || !deck) return out;
  const ids = analyzeSlideIds(deck);
  for (const p of ids.problems) add(p.slide, p.sev, 'slideId', { msg: p.msg });
  for (const s of ids.slides) {
    if (s.rule === 'data-key') add(s.index, 'warn', 'legacyDataKey', { key: s.key, line: s.line });
    else if (s.rule === 'index') add(s.index, 'warn', 'legacyIndex', { key: s.key, line: s.line });
  }
  for (const x of legacyVocabulary(deck)) add(null, 'warn', x.code, x);
  // 情報なので修正依頼（kit/core/llm-fix.mjs）には入らない（kit/check.mjs と同じ）
  for (const x of colorsOutsideVocabulary(deck)) {
    add(null, 'info', 'colorOutside', { kind: x.kind, n: x.n, line: x.line, items: x.items, list: x.items.slice(0, 6).map((v) => v.what).join(', ') + (x.items.length > 6 ? ', …' : '') });
  }
  // 予想（m-predict）の段階（R-steps。kit/core/predict-steps.mjs、kit/check.mjs と同じ）：'predictAnswerWithCount'（答えが数の棒と同時）・'predictAnswerNeverShown'（答えが出ない）
  for (const { code, slide, ...x } of predictStepProblems(deck)) add(slide, 'warn', code, x);
  const text = String(narration || '');
  if (!text.trim()) return out;
  const segs = parseNarration(text);
  const byKey = new Map(ids.slides.map((s) => [s.key, s]));
  // 見出しの鍵（{#id} のない「## 見出し」）でも id のあるスライドに結ぶ（組み立てと同じ）
  for (const s of ids.slides) if (s.headingKey && !byKey.has(s.headingKey)) byKey.set(s.headingKey, s);
  for (const sec of segs.sections || []) {
    if (!sec.id) continue;
    const s = byKey.get(sec.key);
    if (s && sec.heading && normalizeKey(sec.heading) !== normalizeKey(s.heading)) add(s.index, 'info', 'narrHeadingDiffers', { line: sec.line, heading: sec.heading, slide: s.heading, id: sec.id });
  }
  const deckLang = deck.match(/<html\b[^>]*\slang=["']([^"']*)["']/i)?.[1] || '';
  const mapped = segs.filter((seg) => byKey.has(seg.slideKey));
  const NL = narrationLang({ voiceLang, deckLang, texts: mapped.flatMap((seg) => seg.turns.map((t) => t.display)) });
  if (isJapanese(NL.lang) !== isJapanese(deckLang)) add(null, 'info', 'narrLang', { lang: NL.lang, deck: deckLang || 'ja', source: NL.source });
  for (const seg of mapped) {
    const i = byKey.get(seg.slideKey).index;
    for (const t of seg.turns) {
      for (const p of noteProblems(t.raw)) add(i, 'error', 'narrNote', { t: p.text, line: seg.line }, seg.stepKey);
      const tx = String(t.display || ''), tl = textLang(tx, NL.lang);
      if (formulaLike(t.raw != null ? formulaText(t.raw) : tx, tl)) add(i, 'warn', 'narrFormula', { t: tx.slice(0, 40) }, seg.stepKey);
      if (tl === 'ja' && tx.length > 200) add(i, 'info', 'turnLong', { n: tx.length, unit: '字' }, seg.stepKey);
      const words = tx.trim().split(/\s+/).length;
      if (tl !== 'ja' && words > 60) add(i, 'info', 'turnLong', { n: words, unit: '語' }, seg.stepKey);
    }
  }
  return out;
}
