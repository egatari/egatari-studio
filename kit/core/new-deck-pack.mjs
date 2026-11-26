// 新規作成の ④ で写す指示（AI への指示の本体 ＋ 頼みたいこと）を組む、編集アプリ（app/llm.js）とコマンド（kit/llm-pack.mjs --from-sample）が共有する所。
// Node にもブラウザにも依存しない（純粋な ESM）。backlog #130：コマンドが「このサンプルを参考に作る」で写す指示と同じバイトを出せるように（毎晩の評価・規格の評価 B）
//
//   REQUEST_WORDS[lang]                 頼みたいことの欄に入れる言葉（長さ・言語・話す人・テーマの行・内容の見出し）。画面の言葉（app/llm.js の X）もこれを使う
//   newDeckRequest({kind, values, theme, category, subcategory, sample, useStructure, content, outlineN, lang})
//                                       → 頼みたいことの節（記入欄 → テーマの行 → 場面・構成の型・見せ方 → サンプルに本があれば 1 行 → サンプルの構成 → 内容 → 2 回に分けて頼む節）
//   packText({described, named, plan, lang, request}) → 写す指示の全文（順位で組む指示。kit/core/llm-pack-assemble.mjs の rankedOpts）
//   newDeckPack({order, plan, lang, request}) → {text, bytes, described, named, over}（handoff #43 ④：順位 order の上から説明を載せ、上限を越える手前で止め、
//                                       残りは言いたいことの表に名前だけ。軽量（free）も詳細（paid）も同じ。上限は capKb、大きさは fitSize）
//   sampleProblems(obj)                 → sample.json の誤り（validateSample に、分類・パーツ・ラベルを照らしたもの。テーマは誤りにしない）
//   sampleTheme(theme)・fromSampleStart(sample) → 引き継ぐテーマ（同梱の選べるテーマだけ。ほかは default）・① ③ ④ の答え
//   sampleChoice(sample, {title, content, lang}) → {purposes, subjects, school, audience, order}：サンプルから始めたときの ④（サンプルの伝えたいこと・題材・読み手、
//                                       ② の言葉から推した題材を足す。順位はサンプルのパーツが先）
//   fromSamplePack({sample, lang, plan, second, useStructure}) → {text, bytes, described, named, over, request}。
//                                       「このサンプルを参考に作る」で ② だけを書いて（second：{title, content}）④ で写すもの（コマンドの --from-sample と同じバイト）
import { filledRequest, packWithRequest } from './llm-request.mjs';
import { CATEGORIES, partsList, choiceRequest, capKb, rankParts, guessSubjects, asksSchool, audienceOf, SCHOOL_AUDIENCES, subjectChoices } from './new-deck.mjs';
import { rankedOpts, rankedPack, packSize } from './llm-pack.mjs';
import { sampleStructureRequest, validateSample } from './sample-info.mjs';
import { outlineRequest, slideCountOf, OUTLINE_OVER } from './llm-outline.mjs';
import { CHOOSABLE } from './themes-list.mjs';
import { PACK } from './llm-pack-data.mjs';
import { plural } from './plural.mjs';

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
    lengthReq: (n, u) => (u === 'min' ? `${n} ${plural(n, 'minute')}` : `${n} ${plural(n, 'slide')}`),
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

export const packText = ({ described, named, plan = 'free', lang = 'en', request }) => packWithRequest({ ...rankedOpts(described, named, plan), lang, request });
export function newDeckPack({ order, plan = 'free', lang = 'en', request }) {
  const f = rankedPack(order, plan, { textOf: (opts) => packWithRequest({ ...opts, lang, request }), capBytes: capKb(plan) * 1024 });
  return { text: f.text, bytes: packSize(f.text), described: f.described, named: f.named, over: f.over };
}

// サンプルのラベルの id（伝えたいこと・題材・読み手）：同梱のパーツ集の manifest から作った材料（PACK.tiers）のもの。一覧のない古い材料では形だけ確かめる
export function sampleLabels() {
  const t = PACK.tiers || {};
  const ids = (xs) => (Array.isArray(xs) ? xs.map((x) => x.id) : null);
  return { purposes: ids(t.purposes), subjects: ids(t.subjects), audiences: ids(t.audiences) };
}
export function sampleProblems(obj) {
  // テーマは誤りにしない：同梱でないテーマ（教材の中だけのテーマなど）は、引き継ぐときに default にする（sampleTheme）
  return validateSample(obj, { categories: CATEGORIES, parts: LISTED(), labels: sampleLabels() });
}

// 「このサンプルを参考に作る」で引き継ぐテーマ：同梱のテーマで新しく選べるもの（CHOOSABLE。kit/core/themes-list.mjs。編集アプリの ③ の一覧と同じ）だけ。
// ほかは default。紹介のためのサンプルは、教材の中だけのテーマ（Egatari のロゴを入れたブランドのテーマなど）を使うことがある。
// それを利用者の教材に渡してはならない（ロゴが利用者の教材に出る）ので、名前が同梱のテーマと合うときだけ引き継ぐ（2026-11-07 決定）
export const sampleTheme = (theme) => (CHOOSABLE.some((t) => t.name === theme) ? theme : 'default');
// サンプルから新規作成を始めるときの ① ③ の答え（編集アプリの app/llm.js が使う）：{category, subcategory, theme}
export const fromSampleStart = (sample) => ({ category: sample.category, subcategory: sample.subcategory ?? null, theme: sampleTheme(sample.theme) });
// サンプルから始めたときの ④：サンプルの伝えたいこと・題材（と、② の言葉に当たった題材）・読み手（授業（小・中・高）はサンプルの読み手のうち学校のもの）。
// 順位はサンプルのパーツが一番上（handoff #43 ④）
export function sampleChoice(sample, { title = '', content = '', lang = 'en' } = {}) {
  // 題材は ④ で選べるもの（reserved でない題材）だけ：まだ選べない題材（医療など）は順位に入れない（編集アプリの印と同じ）
  const offered = subjectChoices().map((x) => x.id);
  const own = (Array.isArray(sample.subjects) ? sample.subjects : []).filter((x) => offered.includes(x));
  const guessed = guessSubjects({ text: [title, content, ''].join('\n'), lang }).map((g) => g.subject);
  const subjects = offered.filter((x) => own.includes(x) || guessed.includes(x));
  const purposes = Array.isArray(sample.purposes) ? [...sample.purposes] : [];
  const school = asksSchool(sample.category, sample.subcategory ?? null) ? (Array.isArray(sample.audiences) ? sample.audiences : []).find((a) => SCHOOL_AUDIENCES.includes(a)) || null : null;
  const audience = audienceOf(sample.category, sample.subcategory ?? null, school);
  return { purposes, subjects, school, audience, order: rankParts({ purposes, subjects, audience, first: Array.isArray(sample.parts) ? sample.parts : [], category: sample.category }) };
}

// 「このサンプルを参考に作る」：① ③ ④ はサンプルから、② は second（タイトルと内容。ほかの項目は AI に任せる。言語は画面の言語、話す人は 1 人）。
// sample には title（サンプルの題名）も入れる
export function fromSamplePack({ sample, lang = 'en', plan = 'free', second = {}, useStructure = true }) {
  const w = W(lang);
  const title = String(second.title || ''), content = String(second.content || '').trim();
  const values = { title, audience: '', length: '', language: w.langReq[lang] || '', speakers: w.speakersReq[1], wishes: '' };
  const request = newDeckRequest({ kind: 'A', values, theme: sampleTheme(sample.theme), category: sample.category, subcategory: sample.subcategory, sample, useStructure, content, outlineN: longOf(values.length), lang });
  const { order } = sampleChoice(sample, { title, content, lang });
  return { ...newDeckPack({ order, plan, lang, request }), request };
}
