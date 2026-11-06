// 新規作成の ④ で写す指示（AI への指示の本体 ＋ 頼みたいこと）を組む、編集アプリ（app/llm.js）とコマンド（kit/llm-pack.mjs --from-sample）が共有する所。
// Node にもブラウザにも依存しない（純粋な ESM）。backlog #130：コマンドが「このサンプルを参考に作る」で写す指示と同じバイトを出せるように（毎晩の評価・規格の評価 B）
//
//   REQUEST_WORDS[lang]                 頼みたいことの欄に入れる言葉（長さ・言語・話す人・テーマの行・内容の見出し）。画面の言葉（app/llm.js の X）もこれを使う
//   newDeckRequest({kind, values, theme, category, subcategory, sample, useStructure, content, outlineN, lang})
//                                       → 頼みたいことの節（記入欄 → テーマの行 → 場面・構成の型・見せ方 → サンプルに本があれば 1 行 → サンプルの構成 → 内容 → 2 回に分けて頼む節）
//   sampleTicks(sample, rec)            → 初めの印（標準のパーツと、おすすめの束と、サンプルのパーツ。④ の一覧の順）
//   packText({tags, plan, lang, request, short, full}) → 写す指示の全文（full：無料のプランで詳しく書く標準のパーツ。kit/core/llm-pack-assemble.mjs）
//   newDeckPack({tags, plan, lang, request, keep, trim}) → {text, bytes, short, candidates, dropped, over}
//                                       目安に収める：trim なしは ④ を開いたとき（無料のプランで越えたら中核の 4 つを短くし、外す候補を出すだけ）、
//                                       trim は［候補を外す］を押した後（fitPack。コマンドの指示と同じ）
//   sampleProblems(obj)                 → sample.json の誤り（validateSample に、分類・④ のパーツを照らしたもの。テーマは誤りにしない）
//   sampleTheme(theme)・fromSampleStart(sample) → 引き継ぐテーマ（同梱の選べるテーマだけ。ほかは default）・① ③ の答え
//   samplePackFit({tags, plan, lang, request, own}) → fitSample の結果 ＋ {text：収めた後の指示, sizeOf}。「このサンプルを参考に作る」の収め方：
//                                       サンプルのパーツ（own）は詳しいまま、越えたら ① ほかの中核の 4 つを短く → ② サンプルにない専門のパーツを外す → ③ 最後にサンプルのパーツを短く
//   fromSamplePack({sample, title, lang, plan, second, useStructure}) → {text, bytes, short, shortened, dropped, ownShortened, over, tags, full, candidates, request}。
//                                       「このサンプルを参考に作る」で ② だけを書いて（second：{title, content}）④ で写すもの（無料のプランも有料のプランも［候補を外す］の後）
import { filledRequest, packWithRequest } from './llm-request.mjs';
import { CATEGORIES, partsList, recommend, initialParts, choiceRequest, capKb, fitPlan } from './new-deck.mjs';
import { partsPackOpts, fitPack, fitSample, packSize, fitSize } from './llm-pack.mjs';
import { sampleStructureRequest, validateSample } from './sample-info.mjs';
import { outlineRequest, slideCountOf, OUTLINE_OVER } from './llm-outline.mjs';
import { CHOOSABLE } from './themes-list.mjs';

export const REQUEST_WORDS = Object.freeze({
  ja: {
    lengthReq: (n, u) => (u === 'min' ? `${n} 分` : `${n} 枚`),
    langReq: { ja: '日本語', en: '英語' },
    speakersReq: { 1: '1 人', 2: '2 人（Expert と Novice の掛け合い）' },
    themeLine: (t) => `- テーマ：${t}（<html data-theme="${t}">）`,
    contentHead: '## 内容（要点・メモ・元の資料）',
    // サンプルに本（article/。sample.json の book）があるときだけの 1 行。チャットの AI への指示は本を作らない（本は Claude Code で作る）
    sampleBook: '- 本：サンプルには本（読むための本文）もありますが、本は Claude Code で作ります。ここではスライドと台本だけを作ってください',
  },
  en: {
    lengthReq: (n, u) => (u === 'min' ? `${n} minutes` : `${n} slides`),
    langReq: { ja: 'Japanese', en: 'English' },
    speakersReq: { 1: 'one narrator', 2: 'two (an Expert and Novice dialogue)' },
    themeLine: (t) => `- Theme: ${t} (<html data-theme="${t}">)`,
    contentHead: '## Content (key points, notes, source material)',
    sampleBook: '- Book: the sample also has a book (a text to read), but books are made in Claude Code; make only the slides and the narration here',
  },
});
const W = (lang) => (lang === 'ja' ? REQUEST_WORDS.ja : REQUEST_WORDS.en);

// 2 回に分けて頼む枚数（9 枚から）か null。length は記入欄の長さの言葉
export const longOf = (length) => { const n = length ? slideCountOf(length) : null; return n && n > OUTLINE_OVER ? n : null; };

export function newDeckRequest({ kind = 'A', values = {}, theme, category = null, subcategory = null, sample = null, useStructure = true, content = '', outlineN = null, lang = 'en' }) {
  const w = W(lang);
  let t = filledRequest({ kind, values }, lang).replace(/\n*$/, '\n') + w.themeLine(theme) + '\n';
  const cr = choiceRequest({ category, subcategory }, null, lang);
  if (cr) t += cr + '\n';
  if (sample && sample.book === true) t += w.sampleBook + '\n';
  if (sample && useStructure) t += '\n' + sampleStructureRequest(sample, sample.title, lang);
  const c = String(content || '').trim();
  if (c) t += '\n' + w.contentHead + '\n\n' + c + '\n';
  if (outlineN) t += '\n' + outlineRequest({ n: outlineN, lang });
  return t;
}

const LISTED = () => partsList(null).flatMap((g) => g.parts);
export function sampleTicks(sample, rec = []) {
  const want = new Set([...initialParts(rec), ...(sample ? sample.parts : [])]);
  return LISTED().filter((t) => want.has(t));
}

export const packText = ({ tags, plan = 'free', lang = 'en', request, short = false, full = null }) => packWithRequest({ ...partsPackOpts(tags, plan, { short, full }), lang, request });

export function newDeckPack({ tags, plan = 'free', lang = 'en', request, keep = [], trim = false }) {
  // 目安に照らす大きさは fitSize（無料のプランは 45 KB と貼り付けの長さ 31,000 の近いほう。編集アプリの ④ の棒と同じ）
  const sizeOf = (t, short) => fitSize(packText({ tags: t, plan, lang, request, short }), plan);
  const capBytes = capKb(plan) * 1024;
  if (trim) {
    const f = fitPack(tags, plan, { sizeOf, capBytes, keep });
    const text = packText({ tags: f.tags, plan, lang, request, short: f.short });
    return { text, bytes: packSize(text), short: f.short, candidates: [], dropped: f.dropped, over: f.over, tags: f.tags };
  }
  const f = fitPlan(tags, plan, { sizeOf, capBytes, keep });
  const text = packText({ tags, plan, lang, request, short: f.short });
  const bytes = packSize(text), over = fitSize(text, plan) > capBytes;
  return { text, bytes, short: f.short, candidates: over ? f.candidates : [], dropped: [], over, tags };
}

export function sampleProblems(obj) {
  // テーマは誤りにしない：同梱でないテーマ（教材の中だけのテーマなど）は、引き継ぐときに default にする（sampleTheme）
  return validateSample(obj, { categories: CATEGORIES, parts: LISTED() });
}

// 「このサンプルを参考に作る」で引き継ぐテーマ：同梱のテーマで新しく選べるもの（CHOOSABLE。kit/core/themes-list.mjs。編集アプリの ③ の一覧と同じ）だけ。
// ほかは default。紹介のためのサンプルは、教材の中だけのテーマ（Egatari のロゴを入れたブランドのテーマなど）を使うことがある。
// それを利用者の教材に渡してはならない（ロゴが利用者の教材に出る）ので、名前が同梱のテーマと合うときだけ引き継ぐ（2026-11-07 決定）
export const sampleTheme = (theme) => (CHOOSABLE.some((t) => t.name === theme) ? theme : 'default');
// サンプルから新規作成を始めるときの ① ③ の答え（編集アプリの app/llm.js が使う）：{category, subcategory, theme}
export const fromSampleStart = (sample) => ({ category: sample.category, subcategory: sample.subcategory ?? null, theme: sampleTheme(sample.theme) });

// 「このサンプルを参考に作る」：① ③ ④ はサンプルから、② は second（タイトルと内容。ほかの項目は AI に任せる。言語は画面の言語、話す人は 1 人）。
// sample には title（サンプルの題名）も入れる
export function fromSamplePack({ sample, lang = 'en', plan = 'free', second = {}, useStructure = true }) {
  const w = W(lang);
  const title = String(second.title || ''), content = String(second.content || '').trim();
  const values = { title, audience: '', length: '', language: w.langReq[lang] || '', speakers: w.speakersReq[1], wishes: '' };
  const request = newDeckRequest({ kind: 'A', values, theme: sampleTheme(sample.theme), category: sample.category, subcategory: sample.subcategory, sample, useStructure, content, outlineN: longOf(values.length), lang });
  const rec = recommend({ sub: sample.subcategory || null, text: [title, content, ''].join('\n'), lang });
  const tags = sampleTicks(sample, rec);
  const f = samplePackFit({ tags, plan, lang, request, own: sample.parts });
  return { text: f.text, bytes: packSize(f.text), short: f.short, shortened: f.shortened, dropped: f.dropped, ownShortened: f.ownShortened, over: f.over, tags: f.tags, full: f.full, candidates: [], request };
}

export function samplePackFit({ tags, plan = 'free', lang = 'en', request, own = [] }) {
  // 目安に照らす大きさは fitSize（無料のプランは 45 KB と貼り付けの長さ 31,000 の近いほう）
  const sizeOf = (t, full) => fitSize(packText({ tags: t, plan, lang, request, full }), plan);
  const f = fitSample(tags, plan, { sizeOf, capBytes: capKb(plan) * 1024, own });
  return { ...f, sizeOf, text: packText({ tags: f.tags, plan, lang, request, full: f.full }) };
}
