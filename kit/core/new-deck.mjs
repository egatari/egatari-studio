// 新規作成の選び方（backlog #99・#124、handoff/parts-map-2026-10-24.html の 7・9、handoff/parts-tiers-2026-10-27.md §2、handoff #43 ④）と、教材のシード値（format spec §8.4、backlog #104）。
// Node にもブラウザにも依存しない（純粋な ESM）。画面は app/llm.js
//
// ④（handoff #43、作者の決定 2026-11-19）：パーツに印を付けず、ラベルを選ぶ。伝えたいこと（札。いくつでも・なしでも）→ 題材（任意。② の言葉から推して先に印）→
// 学校（① が授業（小・中・高）のときだけ。ほかは ① から読み手を決める：audienceOf）→ どの AI に貼るか（軽量・詳細）。
// ラベルの id と名前はパーツ集の manifest から（PACK.tiers の purposes・subjects・audiences。Studio に一覧を書かない）。
// 指示はパーツの順位（rankParts）で組む：上から説明を載せ、上限を越える手前で止め、残りは言いたいことの表に名前だけ（kit/core/new-deck-pack.mjs の newDeckPack）
//
//   CATEGORIES                         [{id, label: {en, ja}, subs: [{id, label, structure, show}], structure?, show?}]
//   SET_LABELS                         [{set, label: {en, ja}, inside: {en, ja}}]（スライドの挿入の「指示の全体も付ける」の束の名前。新規作成では使わない）
//   SUBJECT_SETS                       教科の形の束（partsList の並び）
//   partsList(sub, plan)               → [{id, label: {ja, en}, parts: [タグ]}]（パーツを伝えたいことでまとめた一覧。サンプルの確かめとパーツの絵が使う。④ には出さない）
//   paidOnly(tag)                      → 受け皿のない束のパーツか（tools/make-llm-guide.mjs の hasReceiver。順位で組む指示では、どちらのプランでも順位どおり）
//   initialParts(rec)                  → 標準のパーツ全部と、rec（[{set}]）の束のパーツ（コマンドの束の指示と比べる試験が使う）
//   partsOfSet(set)                    → 束のパーツ（一覧に出るものだけ）
//   purposeTiles()                     → ④ の札：tile が 'own' で reserved でない伝えたいこと [{id, label}]（manifest の順）
//   subjectChoices()                   → ④ の題材：reserved でない題材 [{id, label}]
//   guessSubjects({text, lang})        → [{subject, word}]（② の言葉に当たった題材と、当たった言葉。題材の順）
//   SCHOOL_AUDIENCES・asksSchool(category, sub)  授業（小・中・高）だけ「どの学校向けですか」（小中・高校）
//   audienceOf(category, sub, school)  → 読み手の id | null（授業（小・中・高）は school、大学の講義・研究発表は大学、研修・ビジネスは社会人、手引きは一般、その他はなし）
//   rankParts({purposes, subjects, audience, usage, first, category})  → パーツの順位 [タグ]（特殊の段を除くすべて）。
//                                        ① 伝えたいことが合うか（2 値。札の into も含む）② 題材が合うか ③ 読み手が合うか ④ サンプルで使う数（usage。既定は PACK.tiers.usage）、名前の順。
//                                        題材か読み手のラベルがあって選んだものを含まないパーツは、合わないパーツとして、ほかのパーツの後ろ（伝えたいことが合っても）。
//                                        first（サンプルから始めたときのサンプルのパーツ）は、この順のまま一番上に
//                                        m-predict は、① が授業・研修（category）か「予想してから確かめる」に印なら first のすぐ後、ほかは一番後ろ（handoff #108）
//   usageOf(samples)                   → {タグ: サンプルの数}（sample.json の parts から。PACK.tiers.usage と同じ数え方）
//   AI_PLANS・DEFAULT_PLAN             どの AI に貼るか：'free'（無料の AI・わからない＝軽量の指示。既定）| 'paid'（有料の AI・ファイルで渡す＝詳細の指示）
//   planOf(choice)                     → 'free' | 'paid'（ない・知らない値は 'free'）
//   capKb(plan)                        指示の大きさの上限（KB。kit/core/llm-pack.mjs の PACK_CAP_KB。画面には出さない）
//   trimCandidates・fitPlan            コマンドの束の指示を目安に収める（kit/core/llm-pack.mjs）
//   choiceRequest(choice, P, lang)     頼みたいことの後ろに付ける節（場面・構成の型・見せ方と、choice.purposesOff があれば外した伝えたいこと。P は PURPOSES）。何もなければ ''。
//                                      外した伝えたいことの行が名前を出す部品は choice.parts（指示に入るパーツ）にあるものだけ
//                                      「その他」は何も書かず、小分類の「この中にない」（subcategory: null）は場面の行だけ（構成の型・見せ方は書かない）
//   withChoice(configText, choice)     egatari.json の studio.newDeck に選んだものを書く（kit/core/config-file.mjs の updateConfig。ほかの項目はバイトのまま）
//   choiceOf(configText)               → studio.newDeck | null（前の記録の parts は読まない）
//   choice の形：{plan, category, subcategory, purposes: [id], subjects: [id], audience: id | null, fromSample?}（category・subcategory は id か null。
//   fromSample は始めたサンプルの名前。前の記録（parts・subjects・tools・purposesOff）は読むだけで、新しく書くものには入れない）
//
// 見せ方（variant。format spec §8.4）は名前だけで選ぶ。教材のシード値（data-egatari-seed）はなくなった：書かない。前の原稿にあれば、そのまま残す（誰も読まない）
import { updateConfig, merge, configObject } from './config-file.mjs';
import { TIERS, PACK_CAP_KB, TEACHING_FULL, teachingFull } from './llm-pack.mjs';
import { PACK } from './llm-pack-data.mjs';
import { partOrder } from './part-labels.mjs';
import { componentsOff } from './purposes.mjs';

export const CATEGORIES = [
  { id: 'teaching', label: { ja: '授業・研修', en: 'Teaching' }, subs: [
    { id: 'class', label: { ja: '授業（小・中・高）', en: 'School lesson' },
      structure: { ja: '導入（注意を引く・目標・前の学習の想起）→ 展開 → まとめ', en: 'introduction (gain attention, state the goal, recall prior learning) → development → summary' },
      show: { ja: '1 画面に 1 つのこと。ステップで 1 つずつ見せる。文字は台本に任せ、飾らない。国語は縦書き、隠して音読', en: 'one thing per screen; reveal step by step; leave the words to the narration; no decoration; Japanese language arts in vertical text, hidden for reading aloud' } },
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

// スライドの挿入の「指示の全体も付ける」で出す束の名前（label は教科・用途、inside は中の図）。新規作成の ④ は束でなくパーツの一覧（partsList）。
// 束そのものは manifest の set から読む（ここにない束は、名前のまま出す）
export const SET_LABELS = [
  { set: 'stats', label: { ja: '統計の図', en: 'Statistics charts' }, inside: { ja: 'ヒストグラム・箱ひげ図・ヒートマップ', en: 'Histograms, box plots, heatmaps' } },
  { set: 'data', label: { ja: '情報・データサイエンス', en: 'Data science and code' }, inside: { ja: '標本抽出・信頼区間・交差検証・コードの解説', en: 'Sampling, confidence intervals, cross-validation, code walkthroughs' } },
  { set: 'algo', label: { ja: 'アルゴリズム', en: 'Algorithms' }, inside: { ja: 'グラフの探索・最短経路・巡回セールスマン・グラフィカルモデル', en: 'Graph search, shortest paths, the traveling salesman, graphical models' } },
  { set: 'ml', label: { ja: '機械学習', en: 'Machine learning' }, inside: { ja: 'ニューラルネット・2 次元の分類・等高線と勾配降下法', en: 'Neural networks, 2-D classification, contours and gradient descent' } },
  { set: 'math', label: { ja: '算数・数学', en: 'Arithmetic and mathematics' }, inside: { ja: '筆算・数直線・テープ図・関数', en: 'Column arithmetic, number lines, tape diagrams, functions' } },
  { set: 'maps', label: { ja: '地図', en: 'Maps' }, inside: { ja: '日本地図・世界地図', en: 'Maps of Japan and the world' } },
  { set: 'kokugo', label: { ja: '国語', en: 'Japanese language arts' }, inside: { ja: '漢文・古文・現代文・縦書き', en: 'Kanbun, kobun, modern texts, vertical writing' } },
  { set: 'english', label: { ja: '英語', en: 'English (foreign language)' }, inside: { ja: '英文の構造（S V O C M・句と節）', en: 'Sentence structure (S V O C M, phrases, clauses)' } },
  { set: 'music', label: { ja: '音楽', en: 'Music' }, inside: { ja: '鍵盤・楽譜（音階・和音）', en: 'Keyboard and score (scales, chords)' } },
  { set: 'business', label: { ja: 'ビジネス', en: 'Business' }, inside: { ja: '市場規模の円・お金の流れ', en: 'Market size circles, money flows' } },
  { set: 'tools', label: { ja: 'ツール', en: 'Classroom tools' }, inside: { ja: 'タイマー', en: 'Timer' } },
  { set: 'science', label: { ja: '理科', en: 'Science' }, inside: { ja: '月の満ち欠け', en: 'Phases of the Moon' } },
];

// ---------------------------------------------------------------- ④ パーツの一覧（handoff/parts-tiers-2026-10-27.md §2）
// 束の名前は中の名前（画面には出さない）。束そのものは manifest の set から読む（ここに書くのは、教科の形の束と、おすすめの表だけ）
export const SUBJECT_SETS = ['maps', 'kokugo', 'english', 'music'];
const SUBJECT_GROUP = { id: 'subject', label: { ja: '教科の形', en: 'For specific subjects' } };
const OTHER_GROUP = { id: 'other', label: { ja: 'その他', en: 'Other' } };
// 授業（小・中・高）は partsList で教科の形を一番上に
const SUBJECT_FIRST = ['class'];

const PARTS = TIERS.parts;
const shown = (t) => PARTS[t] && PARTS[t].tier !== 'extra';
// 伝えたいことの id → まとめる先（manifest の tile.into：順位は「比べる」に）
const intoOf = (id) => { const p = TIERS.purposes.find((x) => x.id === id); return p && p.into ? p.into : id; };
const groupOf = (t) => {
  const c = PARTS[t];
  if (c.set && SUBJECT_SETS.includes(c.set)) return 'subject';
  const p = (c.purposes || [])[0];
  return p && TIERS.purposes.some((x) => x.id === intoOf(p)) ? intoOf(p) : 'other';
};
const byTier = (a, b) => (PARTS[a].tier === 'standard' ? 0 : 1) - (PARTS[b].tier === 'standard' ? 0 : 1);
// 有料のプランの指示にだけ入るパーツ（材料の paidOnly）。無料のプランの ④ には出さない（印を付けても指示に入らないので）
export const paidOnly = (t) => !!(PACK.en.components[t] && PACK.en.components[t].paidOnly);
export function partsList(sub, plan) {
  const tags = partOrder(Object.keys(PARTS).filter((t) => shown(t) && !(plan === 'free' && paidOnly(t))));
  const groups = TIERS.purposes.filter((p) => !p.into).map((p) => ({ id: p.id, label: p.label, parts: tags.filter((t) => groupOf(t) === p.id).sort(byTier) }));
  const other = { ...OTHER_GROUP, parts: tags.filter((t) => groupOf(t) === 'other').sort(byTier) };
  const subject = { ...SUBJECT_GROUP, parts: SUBJECT_SETS.flatMap((s) => tags.filter((t) => groupOf(t) === 'subject' && PARTS[t].set === s)) };
  const list = [...groups, other].filter((g) => g.parts.length);
  if (!subject.parts.length) return list;
  return SUBJECT_FIRST.includes(sub) ? [subject, ...list] : [...list, subject];
}
const LISTED = () => partsList(null).flatMap((g) => g.parts);
export const partsOfSet = (set) => LISTED().filter((t) => PARTS[t].set === set);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 言葉が text のどこかに（除く並びの中でなく）あれば、その言葉を返す
function findWord(text, word, lang) {
  const w = typeof word === 'string' ? word : word.w, not = typeof word === 'string' ? [] : word.not || [];
  const re = lang === 'en' ? new RegExp(`\\b${esc(w)}\\b`, 'gi') : new RegExp(esc(w), 'gi');
  for (const m of text.matchAll(re)) {
    const at = m.index;
    const inside = not.some((n) => { const k = n.toLowerCase().indexOf(w.toLowerCase()); return k >= 0 && text.slice(at - k, at - k + n.length).toLowerCase() === n.toLowerCase(); });
    if (!inside) return m[0];
  }
  return null;
}
export function initialParts(rec = []) {
  const sets = new Set(rec.map((r) => r.set));
  return LISTED().filter((t) => PARTS[t].tier === 'standard' || sets.has(PARTS[t].set));
}

// どの AI に貼るか（無料の AI・わからない＝軽量の指示、有料の AI・ファイルで渡す＝詳細の指示）。変えるのは指示の大きさの上限だけ（順位で組む。画面に上限は出さない）
export const AI_PLANS = ['free', 'paid'];
export const DEFAULT_PLAN = 'free';
export const planOf = (choice) => (choice && choice.plan === 'paid' ? 'paid' : DEFAULT_PLAN);
export const capKb = (plan) => (plan === 'paid' ? PACK_CAP_KB.paid : PACK_CAP_KB.free);
// 外す候補（trimCandidates）と目安に収める決め方（fitPlan）は kit/core/llm-pack.mjs にある（コマンドの kit/llm-pack.mjs と同じ関数）
export { trimCandidates, fitPlan } from './llm-pack.mjs';

// ---------------------------------------------------------------- ④ ラベル（handoff #43、作者の決定 2026-11-19）
const known = (xs) => (Array.isArray(xs) ? xs : []);
export const purposeTiles = () => known(TIERS.purposes).filter((p) => p.tile === 'own' && !p.reserved).map((p) => ({ id: p.id, label: p.label }));
export const subjectChoices = () => known(TIERS.subjects).filter((x) => !x.reserved).map((x) => ({ id: x.id, label: x.label, ...(x.keywords ? { keywords: x.keywords } : {}) }));
const audienceIds = () => known(TIERS.audiences).filter((x) => !x.reserved).map((x) => x.id);
export function guessSubjects({ text = '', lang = 'ja' } = {}) {
  const L = lang === 'en' ? 'en' : 'ja', t = String(text || ''), out = [];
  for (const s of subjectChoices()) {
    // 推す語はパーツ集の manifest の subjects[].keywords（PACK.tiers.subjects。日本語は字の並び、英語は語の切れ目、1 字の語は {w, not}。handoff #69）
    for (const w of ((s.keywords && s.keywords[L]) || [])) { const hit = findWord(t, w, L); if (hit) { out.push({ subject: s.id, word: hit }); break; } }
  }
  return out;
}
// 読み手：授業（小・中・高）だけ学校を聞く（小中・高校）。ほかは ① から（その他・この中にないはなし）。PACK.tiers.audiences にない id は使わない
export const SCHOOL_AUDIENCES = Object.freeze(['primary-junior', 'high-school']);
export const asksSchool = (category, sub) => category === 'teaching' && sub === 'class';
const AUDIENCE_OF_SUB = Object.freeze({ lecture: 'university', training: 'working-adult' });
const AUDIENCE_OF_CAT = Object.freeze({ research: 'university', business: 'working-adult', guides: 'general' });
export function audienceOf(category, sub, school = null) {
  const ids = audienceIds();
  const id = asksSchool(category, sub) ? (SCHOOL_AUDIENCES.includes(school) ? school : null)
    : category === 'teaching' ? AUDIENCE_OF_SUB[sub] || null : AUDIENCE_OF_CAT[category] || null;
  return id && ids.includes(id) ? id : null;
}
export function usageOf(samples = []) {
  const n = {};
  for (const s of samples) for (const t of new Set((s && Array.isArray(s.parts) ? s.parts : []).filter((x) => typeof x === 'string'))) n[t] = (n[t] || 0) + 1;
  return n;
}
// 順位（作者の決定 2026-11-19）：合わない（題材か読み手のラベルがあり、選んだものを含まない）パーツは後ろ。その中と外で、伝えたいこと → 題材 → 読み手 → サンプルで使う数 → 名前
// category（① の大分類）：授業・研修か、伝えたいこと「予想してから確かめる」に印があれば、m-predict（TEACHING_FULL）を first のすぐ後に上げて説明を載せる。
// ほかでは m-predict を一番後ろに下げる（first にあればそのまま）：説明は上限に余りがあるときだけで、ふつうは言いたいことの表に名前だけ（handoff #108）
export function rankParts({ purposes = [], subjects = [], audience = null, usage = TIERS.usage || {}, first = [], category = null } = {}) {
  const want = new Set(purposes);
  for (const p of known(TIERS.purposes)) if (p.into && want.has(p.into)) want.add(p.id);   // 札に入る id（順位 → 比べる）
  const subs = new Set(subjects);
  const tags = Object.keys(PARTS).filter((t) => PARTS[t].tier !== 'extra' && PACK.en.components[t]);
  const key = (t) => {
    const c = PARTS[t], ps = c.purposes || [], ss = c.subjects || [], as = c.audiences || [];
    const subHit = ss.some((x) => subs.has(x)), audHit = !!audience && as.includes(audience);
    const conflict = (subs.size > 0 && ss.length > 0 && !subHit) || (!!audience && as.length > 0 && !audHit);
    return [conflict ? 1 : 0, ps.some((x) => want.has(x)) ? 0 : 1, subHit ? 0 : 1, audHit ? 0 : 1, -(usage[t] || 0)];
  };
  const keys = Object.fromEntries(tags.map((t) => [t, key(t)]));
  const cmp = (a, b) => { for (let i = 0; i < 5; i++) if (keys[a][i] !== keys[b][i]) return keys[a][i] - keys[b][i]; return a < b ? -1 : a > b ? 1 : 0; };
  const order = tags.sort(cmp);
  const top = new Set(first);
  const teach = TEACHING_FULL.filter((t) => order.includes(t) && !top.has(t));
  const rest = order.filter((t) => !top.has(t) && !teach.includes(t));
  return [...order.filter((t) => top.has(t)), ...(teachingFull({ category, purposes }) ? [...teach, ...rest] : [...rest, ...teach])];
}

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
  const off = P && P.list ? P.list.filter((p) => offIds.has(p.id)) : [];
  if (off.length) {
    // 名前を出すのは指示に入る部品だけ（choice.parts。なければ外した伝えたいことのすべての部品）
    const loaded = Array.isArray(choice.parts) ? new Set(choice.parts) : null;
    const comps = componentsOff([...offIds], P).filter((t) => !loaded || loaded.has(t));
    rows.push(L === 'ja'
      ? `- 使わない言いたいこと（作者が外した）：${off.map((p) => p.name.ja).join('・')}。その表し方${comps.length ? `（${comps.map((t) => '`' + t + '`').join('・')}）` : ''}は使わない`
      : `- Purposes turned off by the author: ${off.map((p) => p.name.en).join(', ')}. Do not use their representations${comps.length ? ` (${comps.map((t) => '`' + t + '`').join(', ')})` : ''}.`);
  }
  return rows.join('\n');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ids = (xs, list) => list.map((x) => x.id).filter((id) => known(xs).includes(id));
const clean = (choice) => ({
  v: 1,
  plan: planOf(choice),
  category: catOf(choice.category) ? choice.category : null,
  subcategory: subOf(choice.category, choice.subcategory) ? choice.subcategory : null,
  // ④ のラベル（manifest の順。知らない id は書かない）。読み手は ① と学校から決めたもの
  purposes: ids(choice.purposes, known(TIERS.purposes)),
  subjects: ids(choice.subjects, known(TIERS.subjects)),
  audience: audienceIds().includes(choice.audience) ? choice.audience : null,
  // サンプルから始めたなら、そのサンプルの名前（examples/<名前>。backlog #130）
  ...(typeof choice.fromSample === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(choice.fromSample) ? { fromSample: choice.fromSample } : {}),
});
export function withChoice(configText, choice) {
  return updateConfig(configText || null, { studio: merge({ newDeck: clean(choice || {}) }) });
}
export function choiceOf(configText) {
  let c;
  try { c = configObject(configText); } catch { return null; }
  const n = isObj(c.studio) ? c.studio.newDeck : null;
  if (!isObj(n) || n.v !== 1) return null;
  const { parts, ...rest } = n;   // 前の記録のパーツの一覧（④ が印だったころ）は読まない
  return { ...rest, plan: planOf(n) };   // plan のない前の記録は無料のプラン
}
