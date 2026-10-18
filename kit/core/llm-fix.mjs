// 「AI への直しの依頼」の文章を作る（編集アプリの簡易チェックの板。app/llm.js）。Node にもブラウザにも依存しない（純粋な ESM）
// 決まりの文章は、作った指示（docs/authoring-with-llms.md・.ja.md。tools/make-llm-guide.mjs）の「- **R-名前** …」の行から取る。
// 依頼の形は指示の §5（直しの依頼）に合わせる：問題（決まりの名前付き）、その決まりの文章、今のファイル。返事は 2 つの囲み
//
//   guideRules(guide) → Map(R-名前 → 文章)
//   rulesFor(problem) → ['R-…']           問題（{code} か {msg}）に効く決まり
//   amountOf(problem, lang)  はみ出し・小さい字の量の目安（「本文を 18 px（およそ 1 行）減らす」）
//   cutOffRequest(err, lang)  返事が切れたときの依頼（閉じていない囲みだけを送り直す／短くして送り直す）
//   buildFixRequest({problems, deck, narration, guide, lang, limit}) → {text, partial, slides: [id…]}
//     problems：[{sev: 'error'|'warn', i: スライドの番号か null, title, text（人に見せる言葉）, code?, rule?, data?, msg?}]（rule・data は kit/check.mjs --json のもの。data は簡易チェックの arg でもよい）
//     deck・narration が合わせて limit（既定 40,000 字）を超えれば、問題のあるスライドだけ（id で）を載せ、そのスライドだけを返してもらう
import { sectionsOf, narrSections } from './llm-import.mjs';
import { cleanErrorText } from './error-text.mjs';

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
compData: ['R-components'], consoleError: ['R-components'],
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
  if (p.rule) return [p.rule];   // 検査器の JSON（kit/check.mjs --json）の rule
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
// 量の目安（はみ出した px と行の数・字の大きさ）。p.data は検査器の JSON の data（{px, lim}）か、簡易チェックの arg（"583 > 565"・"23.2px「…」"）
const LINE = 46;   // 本文の 1 行（32px × 1.45。kit/layouts.css の .body）
const num = (x) => { const m = String(x ?? '').match(/-?\d+(?:\.\d+)?/g); return m ? m.map(Number) : []; };
export function amountOf(p, lang = 'en') {
  const d = p.data, ja = lang === 'ja';
  const pick = (k, i) => (d && typeof d === 'object' && Number.isFinite(+d[k]) ? +d[k] : num(d)[i]);
  if (p.code === 'bodyBottom' || p.code === 'overflowBottom') {
    const px = pick('px', 0), lim = pick('lim', 1) || 565;
    if (!Number.isFinite(px)) return '';
    const over = Math.ceil(px - lim), lines = Math.max(1, Math.ceil(over / LINE));
    return ja ? `本文を ${over} px（${LINE} px の行でおよそ ${lines} 行）減らす（行を削るか、部品を ${over} px 低くするか、次のスライドに移す）`
      : `cut ${over} px from the body (about ${lines} line${lines > 1 ? 's' : ''} of ${LINE} px): drop lines, make the component ${over} px lower, or move content to a new slide`;
  }
  if (p.code === 'bodyRight' || p.code === 'overflowRight') {
    const px = pick('px', 0);
    if (!Number.isFinite(px)) return '';
    const over = Math.ceil(px - 1236);
    return ja ? `右へ ${over} px はみ出している：幅を ${over} px 減らす` : `${over} px too wide: make it ${over} px narrower`;
  }
  if (p.code === 'smallSvgText' || p.code === 'smallText') {
    const px = pick('px', 0);
    if (!Number.isFinite(px)) return '';
    const svg = p.code === 'smallSvgText', min = svg ? 24 : 27;
    return ja ? `字を ${px}px から ${min}px 以上に上げる${svg ? '（その場の <svg> なら viewBox の幅を表示の幅と同じにするか、font-size を 24 × viewBox の幅 ÷ 表示の幅 以上に）' : '（font-size を書かない。表と図の中は 24px 以上）'}`
      : `raise the text from ${px}px to at least ${min}px${svg ? ' (for an inline <svg>, make the viewBox width equal to the displayed width, or font-size ≥ 24 × viewBox width ÷ displayed width)' : ' (remove the font-size; 24px is enough in tables and figures)'}`;
  }
  return '';
}

// 返事が途中で切れて取り込めなかったとき（kit/core/llm-import.mjs の unclosed）の依頼
// 囲みがなかったとき（no-blocks：ファイル・キャンバス・添付で返したなど）も、この関数で送り直しを頼む（err.code === 'no-blocks'）
export function cutOffRequest(err, lang = 'en') {
  if (err && err.code === 'no-blocks') {
    return lang === 'ja'
      ? '前の返事にはコードの囲みがありませんでした。ファイル・キャンバス・添付では出さず、チャットの返事の本文に、2 つのコードの囲み ```deck.html と ```narration.md を書いて送り直してください。どちらも最後まで書いて閉じてください（R-output）。\n'
      : 'Your previous reply had no code blocks. Do not output files, a canvas or attachments: write both code blocks, ```deck.html and ```narration.md, in the body of your chat message, complete and closed (R-output).\n';
  }
  const file = err.kind === 'deck' ? 'deck.html' : err.kind === 'narration' ? 'narration.md' : null;
  return lang === 'ja'
    ? `前の返事は途中で切れていました${file ? `（${file} の囲みが閉じていません）` : ''}。${file === 'narration.md' ? 'narration.md の囲みだけを、最初から最後まで書いて閉じた形で送り直してください（deck.html は受け取りました）。' : '同じ教材を、枚数を減らした短い形で、2 つの囲み ```deck.html と ```narration.md をどちらも閉じて送り直してください。'}囲みの途中で終わらないでください（R-output）。
`
    : `Your previous reply was cut off${file ? ` (the ${file} block is not closed)` : ''}. ${file === 'narration.md' ? 'Send only the narration.md block again, complete and closed (the deck.html block arrived).' : 'Send the lesson again in a shorter form (fewer slides), as two closed blocks, ```deck.html and ```narration.md.'} Never stop in the middle of a block (R-output).
`;
}

const fence = (name, body) => '````' + name + '\n' + String(body).replace(/\s+$/, '') + '\n````';

export function buildFixRequest({ problems, deck, narration = '', guide, lang = 'en', limit = 40000 }) {
  const M = L[lang] || L.en;
  const rules = guideRules(guide);
  const secs = sectionsOf(deck);
  // 言葉からスタックの行とファイルの場所（一時フォルダ・file://・手元のサーバー）を除く（kit/core/error-text.mjs）
  const list = problems.map((p) => ({ ...p, text: cleanErrorText(p.text), msg: p.msg === undefined ? undefined : cleanErrorText(p.msg), id: p.i !== null && p.i !== undefined && secs[p.i] ? secs[p.i].id : null, rules: rulesFor(p) }));
  const used = [...new Set(list.flatMap((p) => p.rules))].filter((r) => rules.has(r));
  const out = [M.head, '', M.ask, ''];
  const partial = deck.length + narration.length > limit && list.some((p) => p.id);
  const slideIds = partial ? [...new Set(list.map((p) => p.id).filter(Boolean))] : [];
  if (partial) out.push(M.askPartial(slideIds.length), '');
  out.push(`## ${M.problems}`, '');
  list.forEach((p, n) => { const a = amountOf(p, lang); out.push(`${n + 1}. [${M.sev[p.sev] || p.sev}] ${M.where(p)}: ${p.text}${a ? ' → ' + a : ''}${p.rules.length ? ' — ' + p.rules.join(', ') : ''}`); });
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
