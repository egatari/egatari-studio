// 新規作成の選び方（backlog #99、handoff/parts-map-2026-10-24.html の 7・9）と、教材のシード値（format spec §8.4、backlog #104）。
// Node にもブラウザにも依存しない（純粋な ESM）。画面は app/llm.js
//
// 大分類（構成を決める場面）→ 小分類（構成の型）。教科・分野（数理・統計・国語・情報など）は小分類ではなく「パーツの組」で、
// 今は指示の系列（academic・business・kokugo・english・info・social・music。kit/core/llm-pack.mjs の SERIES）にそのまま対応する（SUBJECTS の series）。
// 系列の名前は内部の名前として残す（画面には出さない）。言いたいこと（kit/core/purposes.mjs）は既定で全部入り、外したものは AI に使わせない。
//
//   CATEGORIES                         [{id, label: {en, ja}, subs: [{id, label, structure, show}], structure?, show?}]
//   SUBJECTS                           [{id, series, label: {en, ja}, inside: {en, ja}, icon}]
//   seriesOfSubjects(ids)              → 系列の名前（SERIES の順）
//   defaultSubjects(category)          大分類を選んだときに入れておく分野（ビジネス → ビジネスのパーツ。ほかはなし）
//   guessSubjects(text)                タイトルと内容の字から推す分野の id（漢文・古文 → 国語、数式・グラフ・統計 → 数理・統計 など。推せなければ []）
//   AI_PLANS・DEFAULT_PLAN             お使いの AI：'free'（無料版。既定）| 'paid'（有料版）。指示の大きさの上限は kit/core/llm-pack.mjs の PACK_CAP_KB
//   planOf(choice)                     → 'free' | 'paid'（ない・知らない値は 'free'）
//   FREE_SUBJECT_MAX                   無料版で選べる数（2）：分野と道具を合わせて。指示の大きさの上限は 1 つなら PACK_CAP_KB.free.one、2 つなら free.two
//   freeSubjects(ids)                  無料版で使う分野：選んだもののうち SUBJECTS の順で初めの FREE_SUBJECT_MAX 個
//   freePick(subjects, tools)          無料版で使う分野と道具：札の順（分野が先、それから道具）で初めの FREE_SUBJECT_MAX 個 → {subjects, tools}
//                                      （前の記録が 3 つ以上を持っていても、記録は書き換えず、使うのはこれだけ）
//   guessTools(text)                   タイトル・内容・希望の字から推す道具のタグ（グループワーク・「10 分」・時間 → m-timer。推せなければ []）
//   seriesForChoice(choice)            指示に入れる系列：有料版は選んだ分野すべての系列、無料版は使う分野（freePick）の系列
//   toolsForChoice(choice)             指示に入れる道具（選んだ道具のタグ。無料版は freePick で、分野と合わせて 2 つまで）
//   choiceRequest(choice, P, lang)     頼みたいことの後ろに付ける節（場面・構成の型・見せ方・外した言いたいこと）。何もなければ ''。
//                                      「その他」は何も書かず、小分類の「この中にない」（subcategory: null）は場面の行だけ（構成の型・見せ方は書かない）
//   withChoice(configText, choice)     egatari.json の studio.newDeck に選んだものを書く（kit/core/config-file.mjs の updateConfig。ほかの項目はバイトのまま）
//   choiceOf(configText)               → studio.newDeck | null
//   choice の形：{plan, category, subcategory, subjects: [id], tools: [タグ], purposesOff: [id]}（category・subcategory は id か null。subjects は選んだ分野
//   （どちらの版でも）。2 つより多い記録もそのまま残し、無料版で使うのは freeSubjects。tools は選んだ道具。ない前の記録は道具なし）
//
// 見せ方（variant。format spec §8.4）は名前だけで選ぶ。教材のシード値（data-egatari-seed）はなくなった：書かない。前の原稿にあれば、そのまま残す（誰も読まない）
import { updateConfig, merge, configObject } from './config-file.mjs';
import { componentsOff } from './purposes.mjs';
import { loadedParts, TOOLS } from './llm-pack.mjs';

export const CATEGORIES = [
  { id: 'teaching', label: { ja: '授業・研修', en: 'Teaching' }, subs: [
    { id: 'class', label: { ja: '授業（小・中・高）', en: 'School lesson' },
      structure: { ja: '導入（注意を引く・目標・前の学習の想起）→ 展開 → まとめ', en: 'introduction (gain attention, state the goal, recall prior learning) → development → summary' },
      show: { ja: '1 画面に 1 つのこと。ステップで段階的に見せる。文字は台本に任せ、飾らない。国語は縦書き、隠して音読', en: 'one thing per screen; reveal step by step; leave the words to the narration; no decoration; Japanese language arts in vertical text, hidden for reading aloud' } },
    { id: 'lecture', label: { ja: '大学の講義', en: 'University lecture' },
      structure: { ja: '導入 → 展開 → まとめ。式と図を積み上げる', en: 'introduction → development → summary, building up equations and figures' },
      show: { ja: '見出しは主張の文にして図で示す。ステップで積み上げ、前のステップは残す', en: 'headings state the claim and a figure shows it; build up step by step and keep earlier steps on screen' } },
    { id: 'training', label: { ja: '研修・使い方の説明', en: 'Training and how-to' },
      structure: { ja: '手順を 1 つずつ', en: 'one procedure step at a time' },
      show: { ja: '手順の図、画面の切り抜き', en: 'process diagrams and screen captures' } },
  ] },
  { id: 'research', label: { ja: '研究発表', en: 'Research' }, subs: [
    { id: 'conference', label: { ja: '学会の口頭発表', en: 'Conference talk' },
      structure: { ja: '背景 → 目的 → 方法 → 結果 → 考察 → 結論（背景・方法・結果でおよそ 3 分の 1 ずつ）', en: 'background → aim → method → results → discussion → conclusion (background, method and results about a third each)' },
      show: { ja: '見出しは主張の文、図が証拠。箇条書きを減らす。1 分に 1 枚ほど', en: 'headings are claims and figures the evidence; few bullet lists; about one slide per minute' } },
    { id: 'seminar', label: { ja: 'ゼミ・進捗報告', en: 'Seminar or progress report' },
      structure: { ja: '学会の口頭発表と同じ流れを短く', en: 'the conference structure, shorter' },
      show: { ja: '密度は高くてよい', en: 'denser slides are fine' } },
    { id: 'talk', label: { ja: '招待講演・一般向け', en: 'Invited or public talk' },
      structure: { ja: '今の姿とありうる姿を行き来し、最後に呼びかける', en: 'alternate between what is and what could be; end with a call to action' },
      show: { ja: '大きな絵、文字はごく少なく', en: 'large pictures, very little text' } },
  ] },
  { id: 'business', label: { ja: 'ビジネス', en: 'Business' }, subs: [
    { id: 'report', label: { ja: '報告', en: 'Report' },
      structure: { ja: '結論を先に（PREP。空・雨・傘）、ピラミッド構造', en: 'conclusion first (PREP; situation, interpretation, action), pyramid structure' },
      show: { ja: '見出しは結論の文。印刷しても読める密度', en: 'headings state conclusions; dense enough to read when printed' } },
    { id: 'proposal', label: { ja: '提案・意思決定', en: 'Proposal and decision' },
      structure: { ja: '状況 → 問題 → 問い → 答え（SCQA）', en: 'situation → complication → question → answer (SCQA)' },
      show: { ja: '少人数で決める会議室向け。図表は濃く', en: 'for a small meeting that decides; dense charts' } },
    { id: 'pitch', label: { ja: 'ピッチ', en: 'Pitch' },
      structure: { ja: '目的 → 課題 → 解決 → なぜ今 → 市場 → 競合 → 製品 → 事業モデル → チーム → 数字 → お願い', en: 'purpose → problem → solution → why now → market → competition → product → business model → team → financials → the ask' },
      show: { ja: '10 枚ほど、大きな字、1 枚に 1 つのこと', en: 'about 10 slides, large text, one thing per slide' } },
    { id: 'intro', label: { ja: '紹介・広報', en: 'Introduction and publicity' },
      structure: { ja: '今の姿とありうる姿を行き来する', en: 'alternate between what is and what could be' },
      show: { ja: '大きな絵、文字は少なく', en: 'large pictures, little text' } },
  ] },
  { id: 'guides', label: { ja: '手引き', en: 'Guides' }, subs: [
    { id: 'manual', label: { ja: 'マニュアル', en: 'Manual' },
      structure: { ja: '目的（何ができるようになるか）→ 手順を 1 つずつ → つまずきやすいところ', en: 'goal (what you will be able to do) → the steps, one at a time → common pitfalls' },
      show: { ja: '1 枚に 1 つの手順。画面の切り抜きや手順の図', en: 'one step per slide; screen captures and process diagrams' } },
    { id: 'rules', label: { ja: '決まりの説明（規程・法令）', en: 'Rules and regulations' },
      structure: { ja: '何についての決まりか → だれに・いつ当てはまるか → しなければならないこと → 原典の文とその日付', en: 'what the rules are about → who they apply to and when → what you must do → the original text and its date' },
      show: { ja: '原典の文をそのまま引くか添付し、いつの時点の内容かを必ず書く', en: 'quote or attach the original text as it is, and always state the date the content is valid for' } },
    { id: 'info', label: { ja: '案内（ごみの出し方・図書館・避難・履修登録など）', en: 'Information (waste sorting, library, evacuation, course registration…)' },
      structure: { ja: 'どんな場面か → 品目や場面から引ける一覧 → わからないときの問い合わせ先', en: 'the situation → a list to look up by item or situation → where to ask' },
      show: { ja: 'ごみの分別・図書館の使い方・避難経路・新入生や新人の案内・履修登録など。見出しで引けるように分ける', en: 'waste sorting, using the library, evacuation routes, orientation for new students or staff, course registration; organised so that headings can be looked up' } },
  ],
    structure: { ja: '一度通して説明し、あとは場面や品目から引けるように分ける', en: 'explain once from start to end, organised so that readers can look things up later by situation or item' },
    show: { ja: '規程・法令などの原典の文を添え、いつの時点の内容かを必ず書く', en: 'quote the source text (rules, laws) and always state the date the content is valid for' } },
  { id: 'other', label: { ja: 'その他', en: 'Other' }, subs: [] },
];

// 分野の札（新規作成 ④）：label は札の名前、inside は札の小さな字（中に入る図）、insidePaid は有料のプランで中の図が増えるときの小さな字
// （無料のプランの指示に入らないパーツ：kit/core/llm-pack-assemble.mjs の FREE_OUT。画面だけの字で、AI への指示には入らない）、icon は札の絵（app/llm.js の ICONS の名前。なければ汎用の絵）。
// 分野を足すときは、ここに 1 行（と系列の指示 tools/llm-guide/series/）を足すだけ（例：social の行）
export const SUBJECTS = [
  { id: 'math', series: 'academic', label: { ja: '数理・統計', en: 'Math and statistics' }, inside: { ja: '数式・関数・グラフ', en: 'Formulas, functions, graphs' }, icon: 'subj-math' },
  { id: 'business', series: 'business', label: { ja: 'ビジネス', en: 'Business' }, inside: { ja: 'KPI・位置づけ・市場・お金の流れ', en: 'KPIs, positioning, markets, money flows' }, icon: 'subj-business' },
  { id: 'kokugo', series: 'kokugo', label: { ja: '国語', en: 'Japanese language arts' }, inside: { ja: '漢文・古文・現代文・縦書き', en: 'Kanbun, kobun, modern texts, vertical writing' }, icon: 'subj-kokugo' },
  { id: 'english', series: 'english', label: { ja: '英語', en: 'English (foreign language)' }, inside: { ja: '英文の構造（S V O C M・句と節）', en: 'Sentence structure (S V O C M, phrases, clauses)' }, icon: 'subj-english' },
  { id: 'info', series: 'info', label: { ja: '情報', en: 'Information science' }, inside: { ja: '符号の木', en: 'Code trees' }, icon: 'codetree' },
  { id: 'social', series: 'social', label: { ja: '地図（社会：地理・歴史）', en: 'Maps (social studies: geography, history)' }, inside: { ja: '日本地図', en: 'Map of Japan' }, insidePaid: { ja: '日本地図・世界地図', en: 'Maps of Japan and the world' }, icon: 'subj-social' },
  { id: 'music', series: 'music', label: { ja: '音楽', en: 'Music' }, inside: { ja: '鍵盤（音階・和音）', en: 'Keyboard (scales, chords)' }, icon: 'subj-music' },
];

export function seriesOfSubjects(ids) {
  const want = new Set(ids || []);
  return SUBJECTS.filter((s) => want.has(s.id)).map((s) => s.series);
}
export const defaultSubjects = (category) => (category === 'business' ? ['business'] : []);
// タイトルと内容の字から推す分野（新規作成の ④ で印を付けておく。推せなければ []）。語は控えめに：はっきりその分野の語だけ
const GUESS = [
  ['math', /数式|関数|グラフ|統計|確率|微分|積分|方程式|ベクトル|行列|回帰|分散|標準偏差|\b(?:math|maths|mathematics|statistics|statistical|probability|equation|function|graph|calculus|regression)s?\b/i],
  ['business', /売上|営業|市場|事業|経営|KPI|予算|決算|収益|\b(?:sales|market|revenue|business|budget|profit|KPIs?)\b/i],
  ['kokugo', /漢文|古文|漢詩|現代文|国語|和歌|俳句|短歌|\b(?:kanbun|kobun)\b/i],
  ['english', /英語|英文|英文法|文型|関係代名詞|関係副詞|不定詞|分詞構文|\b(?:English grammar|sentence structures?|relative clauses?|SVOC)\b/i],
  ['info', /符号|ハフマン|情報理論|\b(?:huffman|code tree|prefix code|information theory)\b/i],
  ['social', /地図|都道府県|県庁所在地|県別|地理|人口|地方区分|\b(?:maps? of japan|prefectures?|geography)\b/i],
  ['music', /音楽|音階|和音|鍵盤|ピアノ|楽譜|長調|短調|\b(?:music|musical|piano|chords?|major scales?|minor scales?)\b/i],
];
export function guessSubjects(text) {
  const t = String(text || '');
  return GUESS.filter(([, re]) => re.test(t)).map(([id]) => id);
}

// 無料版で選べるのは、分野と道具を合わせて 2 つまで（分野・道具が増えても、無料版の指示の大きさは 2 つの組の上限 PACK_CAP_KB.free.two に収まる。
// 道具 1 つは分野 1 つと同じに数える：分野＋道具は 2 つの組の上限、道具だけは 1 つの上限）
export const FREE_SUBJECT_MAX = 2;
export const freeSubjects = (ids) => {
  const want = new Set(ids || []);
  return SUBJECTS.filter((s) => want.has(s.id)).slice(0, FREE_SUBJECT_MAX).map((s) => s.id);
};
export function freePick(subjects, tools) {
  const ss = freeSubjects(subjects), want = new Set(tools || []);
  return { subjects: ss, tools: TOOLS.map((x) => x.tag).filter((t) => want.has(t)).slice(0, Math.max(0, FREE_SUBJECT_MAX - ss.length)) };
}

// 道具の推し方（新規作成 ④ の「道具」の札。タイトル・内容・希望の字から）：グループワーク・「10 分」のような数と分・時間。
// 控えめに：分数（2 分の 1）や「分野」「分子」などでは推さない（「15 分の作業」は推す）。推せない道具は推さない
const TOOL_GUESS = {
  'm-timer': /グループワーク|[0-9０-９]+\s*分(?!の\s*[0-9０-９一二三四五六七八九十]|[野類析布子母散解量岐割])|時間|\bgroup ?work\b|\b\d+\s*(?:min|mins|minutes)\b|\btime limit\b/i,
};
export function guessTools(text) {
  const t = String(text || '');
  return TOOLS.map((x) => x.tag).filter((tag) => TOOL_GUESS[tag] && TOOL_GUESS[tag].test(t));
}

// お使いの AI（無料版・有料版）。どちらも選んだ分野と選んだ道具を入れる。無料版は標準パーツ（FREE_CORE）と分野は 2 つまでの軽い指示、
// 有料版はすべての共通のパーツと、選んだ分野（数は限らない）
export const AI_PLANS = ['free', 'paid'];
export const DEFAULT_PLAN = 'free';
export const planOf = (choice) => (choice && choice.plan === 'paid' ? 'paid' : DEFAULT_PLAN);
export const seriesForChoice = (choice) => seriesOfSubjects(planOf(choice) === 'paid' ? (choice && choice.subjects) : freeSubjects(choice && choice.subjects));
export const toolsForChoice = (choice) => {
  if (planOf(choice) !== 'paid') return freePick(choice && choice.subjects, choice && choice.tools).tools;
  const want = new Set((choice && choice.tools) || []); return TOOLS.map((x) => x.tag).filter((t) => want.has(t));
};

const catOf = (id) => CATEGORIES.find((c) => c.id === id) || null;
export function subOf(category, sub) { const c = catOf(category); return (c && c.subs.find((s) => s.id === sub)) || null; }

export function choiceRequest(choice, P, lang) {
  const L = lang === 'ja' ? 'ja' : 'en';
  const c = catOf(choice && choice.category);
  const s = c && subOf(c.id, choice.subcategory);
  const rows = [];
  if (c && c.id !== 'other') {
    rows.push(L === 'ja' ? `- 場面：${c.label.ja}${s ? '／' + s.label.ja : ''}` : `- Kind: ${c.label.en}${s ? ' / ' + s.label.en : ''}`);
    // 構成の型と見せ方は小分類から。小分類のある大分類で「この中にない」（subcategory: null）なら書かない（「その他」と同じ）
    const t = s || (c.subs.length ? null : c);
    const st = t && t.structure, sh = t && t.show;
    if (st) rows.push(L === 'ja' ? `- 構成の型：${st.ja}` : `- Structure: ${st.en}`);
    if (sh) rows.push(L === 'ja' ? `- 見せ方：${sh.ja}` : `- Presentation: ${sh.en}`);
  }
  const offIds = new Set((choice && choice.purposesOff) || []);
  const off = P.list.filter((p) => offIds.has(p.id));
  if (off.length) {
    // 組み立てに入る部品の名前だけを出す（無料版の有料版だけの部品・選んでいない分野の部品は、指示に説明がない）
    const loaded = new Set(loadedParts(seriesForChoice(choice), planOf(choice), toolsForChoice(choice)));
    const comps = componentsOff([...offIds], P).filter((t) => loaded.has(t));
    rows.push(L === 'ja'
      ? `- 使わない言いたいこと（作者が外した）：${off.map((p) => p.name.ja).join('・')}。その表し方${comps.length ? `（${comps.map((t) => '`' + t + '`').join('・')}）` : ''}は使わない`
      : `- Purposes turned off by the author: ${off.map((p) => p.name.en).join(', ')}. Do not use their representations${comps.length ? ` (${comps.map((t) => '`' + t + '`').join(', ')})` : ''}.`);
  }
  return rows.join('\n');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = (choice) => ({
  v: 1,
  plan: planOf(choice),
  category: catOf(choice.category) ? choice.category : null,
  subcategory: subOf(choice.category, choice.subcategory) ? choice.subcategory : null,
  subjects: SUBJECTS.map((s) => s.id).filter((id) => (choice.subjects || []).includes(id)),
  tools: TOOLS.map((x) => x.tag).filter((t) => (choice.tools || []).includes(t)),
  purposesOff: [...new Set((choice.purposesOff || []).filter((x) => typeof x === 'string'))].sort(),
});
export function withChoice(configText, choice) {
  return updateConfig(configText || null, { studio: merge({ newDeck: clean(choice || {}) }) });
}
export function choiceOf(configText) {
  let c;
  try { c = configObject(configText); } catch { return null; }
  const n = isObj(c.studio) ? c.studio.newDeck : null;
  if (!isObj(n) || n.v !== 1) return null;
  return { ...n, plan: planOf(n) };   // plan のない前の記録は無料版
}

