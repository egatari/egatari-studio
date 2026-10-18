// 「AI への直しの依頼」の文章を作る（編集アプリの簡易チェックの板。app/llm.js）。Node にもブラウザにも依存しない（純粋な ESM）
// 決まりの文章は、作った指示（docs/authoring-with-llms.md・.ja.md。tools/make-llm-guide.mjs）の「- **R-名前** …」の行から取る。
// 依頼の形は指示の §5（直しの依頼）に合わせる：問題（決まりの名前付き）、その決まりの文章、今のファイル。返事は 2 つの囲み
//
//   guideRules(guide) → Map(R-名前 → 文章)
//   rulesFor(problem) → ['R-…']           問題（{code} か {msg}）に効く決まり
//   buildFixRequest({problems, deck, narration, guide, lang, limit}) → {text, partial, slides: [id…]}
//     problems：[{sev: 'error'|'warn', i: スライドの番号か null, title, text（人に見せる言葉）, code?, msg?}]
//     deck・narration が合わせて limit（既定 40,000 字）を超えれば、問題のあるスライドだけ（id で）を載せ、そのスライドだけを返してもらう
import { sectionsOf, narrSections } from './llm-import.mjs';

export function guideRules(guide) {
  const out = new Map();
  const lines = String(guide).replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \*\*(R-[a-z-]+)\*\*\s+(.*)$/);
    if (!m) continue;
    let t = m[2];
    for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) t += ' ' + lines[j].trim();
    if (!out.has(m[1])) out.set(m[1], t);
  }
  return out;
}

// 簡易チェックの code（app/frame-shim.js・app/llm.js）と、組み立ての知らせ・検査器の言葉から
const BY_CODE = {
  titleLong: ['R-title'], titleLongEn: ['R-title'], conclLong: ['R-concl'], conclLongEn: ['R-concl'], conclOverflow: ['R-concl', 'R-fit'],
  overflowBottom: ['R-fit'], overflowRight: ['R-fit'], smallText: ['R-fit'], katexError: ['R-math'],
  noNarration: ['R-narr-steps'], orphanNarration: ['R-narr-steps'], readingExpr: ['R-reading', 'R-formula'], readingSeveral: ['R-reading'],
  contrast: ['R-colors'], formula: ['R-formula'], missingSection: ['R-headings'], markTarget: ['R-marks'],
};
const BY_TEXT = [
  [/スライドが見つからない|slide not found|no slide/i, ['R-headings']],
  [/段階の番号|口述原稿の段階|step key/i, ['R-narr-steps']],
  [/^mark: |目印/, ['R-marks']],
  [/式は読まず|reads? an equation/i, ['R-formula']],
  [/読みの指定/, ['R-reading']],
  [/slide key: |鍵.*重なる/, ['R-headings']],
  [/です・ます/, ['R-style']],
  [/句読点/, ['R-style']],
];
export function rulesFor(p) {
  if (p.code && BY_CODE[p.code]) return BY_CODE[p.code];
  const s = p.msg || p.text || '';
  for (const [re, r] of BY_TEXT) if (re.test(s)) return r;
  return [];
}

const L = {
  en: {
    head: 'Fix request for an Egatari lesson (deck.html + narration.md). The instructions you followed are the Egatari authoring guide; the rules are quoted below.',
    ask: 'Fix only the problems listed. Keep everything else as it is, and keep every id="…" and {#…} exactly (R-noids). Reply with exactly two fenced code blocks, ```deck.html and ```narration.md (R-output).',
    askPartial: (n) => `The deck is long, so only the ${n} slide(s) with problems are included below. Reply with the same two blocks, but put only those <section> elements in the deck.html block (no <html>, keep their ids) and only their sections in the narration.md block (keep the {#id} headings) (R-output).`,
    problems: 'Problems', rules: 'Rules', files: 'Current files', partialFiles: 'Current slides with problems',
    where: (p) => (p.i === null || p.i === undefined ? 'Whole deck' : `Slide ${p.i + 1}${p.id ? ` (id ${p.id})` : ''}${p.title ? ` “${p.title}”` : ''}`),
    sev: { error: 'error', warn: 'warning' },
  },
  ja: {
    head: 'Egatari の教材（deck.html と narration.md）の直しの依頼です。書くときに従った指示は Egatari の書き方の指示（authoring guide）で、決まりの文章は下に引いています。',
    ask: '挙げた問題だけを直してください。ほかは変えず、id="…" と {#…} はすべてそのまま残してください（R-noids）。返事はちょうど 2 つのコードの囲み ```deck.html と ```narration.md にしてください（R-output）。',
    askPartial: (n) => `デッキが長いので、問題のあるスライド ${n} 枚だけを下に載せています。返事は同じ 2 つの囲みで、deck.html の囲みにはそのスライドの <section> だけを（<html> なしで、id はそのまま）、narration.md の囲みにはその節だけを（{#id} の見出しのまま）入れてください（R-output）。`,
    problems: '問題', rules: '決まり', files: '今のファイル', partialFiles: '問題のあるスライド（今のもの）',
    where: (p) => (p.i === null || p.i === undefined ? 'デッキ全体' : `スライド ${p.i + 1}${p.id ? `（id ${p.id}）` : ''}${p.title ? `「${p.title}」` : ''}`),
    sev: { error: 'エラー', warn: '警告' },
  },
};
const fence = (name, body) => '````' + name + '\n' + String(body).replace(/\s+$/, '') + '\n````';

export function buildFixRequest({ problems, deck, narration = '', guide, lang = 'en', limit = 40000 }) {
  const M = L[lang] || L.en;
  const rules = guideRules(guide);
  const secs = sectionsOf(deck);
  const list = problems.map((p) => ({ ...p, id: p.i !== null && p.i !== undefined && secs[p.i] ? secs[p.i].id : null, rules: rulesFor(p) }));
  const used = [...new Set(list.flatMap((p) => p.rules))].filter((r) => rules.has(r));
  const out = [M.head, '', M.ask, ''];
  const partial = deck.length + narration.length > limit && list.some((p) => p.id);
  const slideIds = partial ? [...new Set(list.map((p) => p.id).filter(Boolean))] : [];
  if (partial) out.push(M.askPartial(slideIds.length), '');
  out.push(`## ${M.problems}`, '');
  list.forEach((p, n) => out.push(`${n + 1}. [${M.sev[p.sev] || p.sev}] ${M.where(p)}: ${p.text}${p.rules.length ? ' — ' + p.rules.join(', ') : ''}`));
  if (used.length) {
    out.push('', `## ${M.rules}`, '');
    for (const r of used) out.push(`- **${r}** ${rules.get(r)}`);
  }
  if (partial) {
    const want = new Set(slideIds);
    const deckPart = secs.filter((s) => want.has(s.id)).map((s) => deck.slice(s.start, s.end)).join('\n\n');
    const N = narrSections(String(narration).replace(/\r\n?/g, '\n'));
    const narrPart = N.out.filter((s) => want.has(s.id)).map((s) => N.lines.slice(s.start, s.end).join('\n').replace(/\s+$/, '')).join('\n\n');
    out.push('', `## ${M.partialFiles}`, '', fence('deck.html', deckPart), '', fence('narration.md', narrPart));
  } else {
    out.push('', `## ${M.files}`, '', fence('deck.html', deck), '', fence('narration.md', narration));
  }
  return { text: out.join('\n') + '\n', partial, slides: slideIds, rules: used };
}
