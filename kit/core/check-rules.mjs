// 品質チェックの決まりの台帳（backlog #202、handoff/v0.6.11-check-sketch-2026-11-12.md「#202 の具体案」と d5 との合意 11/12）。Node にもブラウザにも依存しない
// 1 回の点検の終わりに、決まりの 1 つずつを checked・excused・skipped・failed のどれかにする。どれにもならない決まりが残れば、その回は incomplete。
//   決まりは 2 種：作者への決まり R-*（AI への指示 docs/authoring-with-llms の名前）と、検査器の族 C-*（Studio の確かめ方。仕様には書かない）
//   RULES        [{id, kind: 'authoring'|'checker', phase, codes: [code …], applies?(facts) → null | excused の理由}]
//                phase は kit/check.mjs の検査の段（phase = '…' の名前）。その段を通らなかった決まりは incomplete
//                kit/check-messages.mjs の MESSAGES のどの code も、ちょうど 1 つの決まりに入る（tools/test-check-rules.mjs）
//   EXCUSES      excused の理由（その教材にないもの・その教材の性質）
//   SKIPS        skipped の理由（その回に見られなかったもの）
//   ruleOfCode(code) → 決まりの id | null
//   ruleSet()    → 台帳の版（決まりの id と code の並びの sha256 の先頭 12。where や phase が変わっても変わらない）は呼ぶ側が sha256 で作る：ruleSetText()
//   account({results, visited, facts, inEditor}) → {status, rules, summary, problems}
//       results：[{sev: 'error'|'warn'|'info', code}]。visited：通った段の名前の集合（編集アプリは null：その版の編集アプリが見る決まりはどれも通ったとみなす）
//       facts：{narration, audio, attachments, parts: [タグ…], marks, morphs, links, book, tate, lang}
//       inEditor：編集アプリの品質チェック（コマンド版だけの決まりは skipped/notInEditor）
//   factsFromSource({deck, narration, audio, attachments, book}) → facts：原稿と台本の文字列から（コマンド版と編集アプリで同じ判定にする）。
//       audio・attachments・book は呼ぶ側がファイルの有無から（audio/manifest.json か voice.json・attachments/・article.md か article/）
//       excused か skipped の決まりに code が出たら problems（台帳の誤り）。problems があるか、どれにもならない決まりがあれば status は incomplete
import { cliOnly } from './check-parity.mjs';

export const EXCUSES = Object.freeze(['noNarration', 'noAudio', 'noAttachments', 'noParts', 'noMarks', 'noMorphs', 'noLinks', 'noBook', 'tate', 'lang']);
export const SKIPS = Object.freeze(['noBrowser', 'notInEditor']);

const needs = (fact, reason) => (f) => (f[fact] ? null : reason);
const ARTICLE = ['articleEncoding', 'articleFrontMatter', 'articleFrontMatterMember', 'articleFrontMatterValue', 'articleKindChapter', 'articleDirective', 'articleBacktickDirective',
  'articleOption', 'articleRole', 'articleHtml', 'articleHtmlTable', 'articleHtmlTableNoSpan', 'articleComment', 'articleBlockBreak', 'articleSubstitution', 'articleStrike', 'articleBareUrl',
  'articleTaskList', 'articleHeadingLevel', 'articleSectionId', 'articleSectionIdForm', 'articleLabel', 'articleCiteKey', 'articleCitePrefix', 'articleCiteNarrativeLocator', 'articleImagePath',
  'articleAsideTitle', 'articleAsideNested', 'articleNested', 'articleAsideClass', 'articleTableClass', 'articleProofKind', 'articleFootnoteContent', 'articleFootnoteMissing',
  'articleFootnoteUnused', 'articleFootnoteName', 'articleFootnoteDuplicate', 'articleRuby', 'articleStepSyntax', 'articleSubfigure', 'articleFigureAlt', 'articleGlossary', 'articleSolutionLabel',
  'articleConverted', 'articleIndex', 'articleConfig', 'articleUnlisted', 'articleRead', 'articleUnsafeParagraph', 'articleTooLarge', 'articleChapterNumber', 'articleChapterTitle',
  'articleChapterIncrease', 'articleChapterOrder', 'articleChapterDiffer', 'articleLang', 'articleBibliography', 'articleLabelDuplicate', 'articleLabelSlideId', 'articleXref', 'articleSolution',
  'articleTerm', 'articleStep', 'articleCite', 'articleReferences', 'articleImage', 'articleDataArticle', 'articleCitations', 'articleCiteStyle', 'articleCiteListChapter', 'articleCiteEngine',
  'articleUncited', 'articleLinksShape', 'articleLinkStale', 'articleLinkUnconfirmed', 'articleLinkUnlinked', 'articleSummary', 'articleSectionUnlinked'];
const ATTACH = ['attachBadConfig', 'attachBadName', 'attachExcluded', 'attachDuplicate', 'attachBadRole', 'attachBadTitle', 'attachMissing', 'attachNoRole', 'attachNoTitle', 'attachMedia',
  'attachType', 'attachForbidden', 'attachMismatch', 'attachPolyglot', 'attachUnsafe', 'attachUnchecked', 'attachInjection', 'attachPrivate', 'attachBadDescription', 'attachTooLarge',
  'attachTotal', 'attachCount', 'attachList'];

export const RULES = Object.freeze([
  // ---- 作者への決まり（R-*）
  { id: 'R-fit', kind: 'authoring', phase: 'A 体裁', codes: ['bodyBottom', 'bodyRight', 'tateBodyHead', 'bodyConclCol', 'bodyLeft', 'smallText', 'smallSvgText', 'textClipped', 'svgTextOut', 'svgTextBox', 'outsideBody', 'textOffSlide', 'textOverlap', 'cellWordBreak', 'compLayout'] },
  { id: 'R-title', kind: 'authoring', phase: 'A 体裁', codes: ['titleLong', 'titleLongEn', 'titleColon', 'tateTitle'] },
  { id: 'R-concl', kind: 'authoring', phase: 'A 体裁', codes: ['conclLong', 'conclLongEn', 'conclOverflow'] },
  { id: 'R-headings', kind: 'authoring', phase: 'A 体裁', codes: ['secHeading', 'narrHeadingDiffers'] },
  { id: 'R-style', kind: 'authoring', phase: 'A 体裁', codes: ['desuMasu', 'punctMixed'], applies: (f) => (f.lang === 'ja' ? null : 'lang') },
  { id: 'R-math', kind: 'authoring', phase: 'A 体裁', codes: ['rawMath', 'katexError'] },
  { id: 'R-purpose', kind: 'authoring', phase: 'A 体裁', codes: ['cardsHint'] },
  { id: 'R-colors', kind: 'authoring', phase: 'C パレット', codes: ['colorOutside', 'textContrast', 'contrastLow'] },
  { id: 'R-balance', kind: 'authoring', phase: 'N 釣り合い', codes: ['balance'] },
  { id: 'R-narr-steps', kind: 'authoring', phase: 'B 台本', codes: ['narrMissing', 'narrOrphan', 'narrNote'], applies: needs('narration', 'noNarration') },
  { id: 'R-formula', kind: 'authoring', phase: 'B 台本', codes: ['narrFormula'], applies: needs('narration', 'noNarration') },
  { id: 'R-reading', kind: 'authoring', phase: 'B 台本', codes: ['readingExpr', 'readingSeveral', 'narrLang', 'narrRecheck'], applies: needs('narration', 'noNarration') },
  { id: 'R-dialogue', kind: 'authoring', phase: 'B 台本', codes: ['turnLong'], applies: needs('narration', 'noNarration') },
  { id: 'R-marks', kind: 'authoring', phase: 'F 強調', codes: ['markMissing'], applies: needs('marks', 'noMarks') },
  { id: 'R-steps', kind: 'authoring', phase: 'E タイムライン', codes: ['predictAnswerWithCount', 'predictAnswerNeverShown'], applies: (f) => ((f.parts || []).includes('m-predict') ? null : 'noParts') },
  { id: 'R-components', kind: 'authoring', phase: 'E タイムライン', codes: ['compReport', 'compData'], applies: (f) => ((f.parts || []).length ? null : 'noParts') },
  // ---- 検査器の族（C-*）
  { id: 'C-build', kind: 'checker', phase: '読み込み', codes: ['build', 'consoleError', 'extensionVersion', 'component-requires-missing', 'component-not-in-catalogue'] },
  { id: 'C-ids', kind: 'checker', phase: '読み込み', codes: ['slideId', 'legacyDataKey', 'legacyIndex'] },
  { id: 'C-vocab', kind: 'checker', phase: '読み込み', codes: ['legacyColorClass', 'legacyStepAttr', 'legacyLectureMode'] },
  { id: 'C-template', kind: 'checker', phase: 'B 台本', codes: ['templateText', 'narrPlaceholder'] },
  { id: 'C-font', kind: 'checker', phase: 'A 体裁', codes: ['themeMetricsDrift', 'metricsFontLoad', 'themeMetricsInvalid', 'fontsExtraMissing', 'fontNotCovered', 'fontNotEmbedded'] },
  { id: 'C-links', kind: 'checker', phase: 'J リンク', codes: ['linkFileMissing', 'linkEmpty', 'linkUnknown', 'linkNumberRange', 'linkNoConcl', 'linkStepRange', 'linkBadStep', 'linkNumber', 'linkNoId', 'linkCount'], applies: needs('links', 'noLinks') },
  { id: 'C-audio', kind: 'checker', phase: '読み込み', codes: ['audioStale', 'refVoice'], applies: needs('audio', 'noAudio') },
  { id: 'C-attach', kind: 'checker', phase: '読み込み', codes: ATTACH, applies: needs('attachments', 'noAttachments') },
  { id: 'C-book', kind: 'checker', phase: 'M 本文', codes: ARTICLE, applies: needs('book', 'noBook') },
  { id: 'C-a11y', kind: 'checker', phase: 'H 読み上げ', codes: ['imgAlt', 'svgName', 'compName'] },
  { id: 'C-morph', kind: 'checker', phase: 'G モーフ', codes: ['morphNoSrc', 'morphNoIds', 'morphPairs', 'morphLater', 'morphDupSrc', 'morphDupDst'], applies: needs('morphs', 'noMorphs') },
  { id: 'C-repro', kind: 'checker', phase: 'D 再現性', codes: ['compOrder', 'compOrderNoise', 'compOrderDetail'], applies: (f) => ((f.parts || []).length ? null : 'noParts') },
  { id: 'C-listing', kind: 'checker', phase: 'E タイムライン', codes: ['step0', 'palette', 'marks', 'timelineTotal', 'slideLength'] },
].map((r) => Object.freeze({ ...r, codes: Object.freeze(r.codes) })));

const BY_CODE = new Map(RULES.flatMap((r) => r.codes.map((c) => [c, r.id])));
export const ruleOfCode = (code) => BY_CODE.get(code) || null;
// 台帳の版の材料（id と code だけ。phase・applies・where は入れない）。呼ぶ側が sha256 の先頭 12 にする
export const ruleSetText = () => RULES.map((r) => r.id + ':' + r.codes.join(',')).join('\n');
// 編集アプリが見ない決まり：その code がどれもコマンド版だけ（kit/core/check-parity.mjs の CLI_ONLY）
export const cliOnlyRule = (r) => r.codes.every((c) => cliOnly(c) !== null);

export function factsFromSource({ deck = '', narration = '', audio = false, attachments = false, book = false } = {}) {
  const lang = (deck.match(/<html\b[^>]*\slang=["']([^"']*)["']/i) || [])[1] || '';
  return {
    narration: /\S/.test(narration), audio: !!audio, attachments: !!attachments, book: !!book,
    parts: [...new Set([...deck.matchAll(/<(m-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)[\s>/]/g)].map((m) => m[1]))].sort(),
    marks: /\{mark:/.test(narration), morphs: /\bdata-morph\b/.test(deck), links: /<a\b[^>]*\shref=/i.test(deck),
    tate: /\blayout-tate\b/.test(deck), lang: /^ja\b/i.test(lang) || !lang ? 'ja' : 'en',
  };
}

export function account({ results, visited = null, facts = {}, inEditor = false }) {
  const by = new Map(RULES.map((r) => [r.id, { error: 0, warning: 0, info: 0, codes: new Set() }]));
  const problems = [];
  for (const x of results) {
    const id = ruleOfCode(x.code);
    if (!id) { problems.push(`${x.code}: not in the rule ledger (kit/core/check-rules.mjs)`); continue; }
    const c = by.get(id);
    c[x.sev === 'error' ? 'error' : x.sev === 'warn' ? 'warning' : 'info']++;
    c.codes.add(x.code);
  }
  const rules = RULES.map((r) => {
    const c = by.get(r.id);
    const counts = { error: c.error, warning: c.warning, info: c.info };
    const codes = r.codes.filter((k) => c.codes.has(k));
    const base = { id: r.id, kind: r.kind };
    let state, reason;
    if (inEditor && cliOnlyRule(r)) { state = 'skipped'; reason = 'notInEditor'; }
    else if (!inEditor && visited && !visited.has(r.phase)) state = null;
    else {
      reason = r.applies ? r.applies(facts) : null;
      state = reason ? 'excused' : counts.error ? 'failed' : 'checked';
    }
    if ((state === 'excused' || state === 'skipped') && codes.length) problems.push(`${r.id}: ${state} (${reason}) but reported ${codes.join(', ')}`);
    return { ...base, state, ...(reason ? { reason } : {}), counts, codes };
  });
  const unset = rules.filter((r) => r.state === null).map((r) => r.id);
  const summary = { checked: 0, excused: 0, skipped: 0, failed: 0, total: rules.length };
  for (const r of rules) if (r.state) summary[r.state]++;
  return { status: unset.length || problems.length ? 'incomplete' : 'ok', rules, summary, unset, problems };
}
