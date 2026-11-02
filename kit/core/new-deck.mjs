// 新規作成の選び方（backlog #99・#124、handoff/parts-map-2026-10-24.html の 7・9、handoff/parts-tiers-2026-10-27.md §2）と、教材のシード値（format spec §8.4、backlog #104）。
// Node にもブラウザにも依存しない（純粋な ESM）。画面は app/llm.js
//
// 大分類（構成を決める場面）→ 小分類（構成の型）。④ はパーツの一覧：パーツを「伝えたいこと」でまとめて並べ、教科にしかない形（地図・国語・英語・音楽）は
// 最後の「教科の形」に（授業（小・中・高）では一番上に）。パーツの段（標準・専門・特殊）と束はパーツライブラリ 2.0 の manifest の tier・set
// （kit/core/llm-pack.mjs の TIERS。tools/make-llm-guide.mjs が写す）。特殊（extra）のパーツは一覧に出さない。
// 初めの選び方：標準のパーツは全部、専門のパーツは、場面の小分類の表（SUB_SETS）か ② の言葉の表（WORDS）に当たった束だけ（理由を添える）。
// プランが変えるのは指示の大きさの上限（capKb）と詳しさ（無料のプランは中核の 4 つのほかの標準のパーツを一覧の 1 行だけに。kit/core/llm-pack.mjs の partsPackOpts）。
// 選べる数は限らない。越えたら外す候補を出す：trimCandidates。
//
//   CATEGORIES                         [{id, label: {en, ja}, subs: [{id, label, structure, show}], structure?, show?}]
//   SET_LABELS                         [{set, label: {en, ja}, inside: {en, ja}}]（スライドの挿入の「指示の全体も付ける」の束の名前。新規作成では使わない）
//   SUBJECT_SETS                       教科の形の束（この順に並べる）
//   SUB_SETS                           小分類 → おすすめの束（§2.3）
//   WORDS                              {ja|en: {束: [言葉]}}（§2.4。英語の画面では英語の表）
//   partsList(sub)                     → [{id, label: {ja, en}, parts: [タグ]}]（④ の並び。id は伝えたいことの id か 'subject'）
//   recommend({sub, text, lang})       → [{set, sub?, word?}]（おすすめの束と理由。小分類が先、それから言葉。束ごとに 1 つ）
//   initialParts(rec)                  → 初めに選んでおくパーツ（標準の全部とおすすめの束のパーツ。一覧の順）
//   partsOfSet(set)                    → 束のパーツ（一覧に出るものだけ）
//   AI_PLANS・DEFAULT_PLAN             お使いの AI：'free'（無料のプラン。既定）| 'paid'（有料のプラン）
//   planOf(choice)                     → 'free' | 'paid'（ない・知らない値は 'free'）
//   capKb(plan)                        指示の大きさの上限（KB。kit/core/llm-pack.mjs の PACK_CAP_KB：無料 free、有料 paid）
//   trimCandidates(ticked, {sizeOf, capBytes, keep})  上限を越えたときの外す候補（keep を除き、大きい順に、越えた分に届くまで）
//   choiceRequest(choice, P, lang)     頼みたいことの後ろに付ける節（場面・構成の型・見せ方と、choice.purposesOff があれば外した伝えたいこと。P は PURPOSES）。何もなければ ''。
//                                      外した伝えたいことの行が名前を出す部品は choice.parts（指示に入るパーツ）にあるものだけ
//                                      「その他」は何も書かず、小分類の「この中にない」（subcategory: null）は場面の行だけ（構成の型・見せ方は書かない）
//   withChoice(configText, choice)     egatari.json の studio.newDeck に選んだものを書く（kit/core/config-file.mjs の updateConfig。ほかの項目はバイトのまま）
//   choiceOf(configText)               → studio.newDeck | null
//   choice の形：{plan, category, subcategory, parts: [タグ]}（category・subcategory は id か null。parts は選んだパーツ。
//   前の記録（subjects・tools・purposesOff）は読むだけで、新しく書くものには入れない）
//
// 見せ方（variant。format spec §8.4）は名前だけで選ぶ。教材のシード値（data-egatari-seed）はなくなった：書かない。前の原稿にあれば、そのまま残す（誰も読まない）
import { updateConfig, merge, configObject } from './config-file.mjs';
import { TIERS, PACK_CAP_KB } from './llm-pack.mjs';
import { partOrder } from './part-labels.mjs';
import { componentsOff } from './purposes.mjs';

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

// スライドの挿入の「指示の全体も付ける」で出す束の名前（label は教科・用途、inside は中の図）。新規作成の ④ は束でなくパーツの一覧（partsList）。
// 束そのものは manifest の set から読む（ここにない束は、名前のまま出す）
export const SET_LABELS = [
  { set: 'stats', label: { ja: '統計の図', en: 'Statistics charts' }, inside: { ja: 'ヒストグラム・箱ひげ図・ヒートマップ', en: 'Histograms, box plots, heatmaps' } },
  { set: 'math', label: { ja: '算数・数学', en: 'Arithmetic and mathematics' }, inside: { ja: '筆算・数直線・テープ図・関数', en: 'Column arithmetic, number lines, tape diagrams, functions' } },
  { set: 'maps', label: { ja: '地図', en: 'Maps' }, inside: { ja: '日本地図・世界地図', en: 'Maps of Japan and the world' } },
  { set: 'kokugo', label: { ja: '国語', en: 'Japanese language arts' }, inside: { ja: '漢文・古文・現代文・書き順・縦書き', en: 'Kanbun, kobun, modern texts, stroke order, vertical writing' } },
  { set: 'english', label: { ja: '英語', en: 'English (foreign language)' }, inside: { ja: '英文の構造（S V O C M・句と節）', en: 'Sentence structure (S V O C M, phrases, clauses)' } },
  { set: 'music', label: { ja: '音楽', en: 'Music' }, inside: { ja: '鍵盤・楽譜（音階・和音）', en: 'Keyboard and score (scales, chords)' } },
  { set: 'business', label: { ja: 'ビジネス', en: 'Business' }, inside: { ja: '市場規模の円・お金の流れ', en: 'Market size circles, money flows' } },
  { set: 'tools', label: { ja: '道具', en: 'Classroom tools' }, inside: { ja: 'タイマー', en: 'Timer' } },
  { set: 'science', label: { ja: '理科', en: 'Science' }, inside: { ja: '月の満ち欠け', en: 'Phases of the Moon' } },
];

// ---------------------------------------------------------------- ④ パーツの一覧（handoff/parts-tiers-2026-10-27.md §2）
// 束の名前は中の名前（画面には出さない）。束そのものは manifest の set から読む（ここに書くのは、教科の形の束と、おすすめの表だけ）
export const SUBJECT_SETS = ['maps', 'kokugo', 'english', 'music'];
const SUBJECT_GROUP = { id: 'subject', label: { ja: '教科の形', en: 'For specific subjects' } };
const OTHER_GROUP = { id: 'other', label: { ja: 'その他', en: 'Other' } };
// 小分類 → おすすめの束（§2.3。ない小分類はなし）。授業（小・中・高）は束を決めず、教科の形を一覧の一番上に出す（SUBJECT_FIRST）
export const SUB_SETS = Object.freeze({
  lecture: ['stats'], training: ['tools'], conference: ['stats'], seminar: ['stats'],
  report: ['business'], proposal: ['business'], pitch: ['business'], info: ['maps'],
});
const SUBJECT_FIRST = ['class'];
// 言葉の表（§2.4）。日本語は字の並びで、英語は語の切れ目で探す（大文字・小文字は区別しない）。
// 1 字の言葉は、ほかの語の一部に当たりやすいので除く並びを添える（{w, not}：not は前後にあればその所は当たりにしない）。毎晩の評価で当たり外れを測って直す
export const WORDS = Object.freeze({
  ja: {
    stats: ['分布', '統計', 'データ', 'ヒストグラム', '箱ひげ', '相関', 'ベイズ', '推定', '検定'],
    math: ['筆算', 'わり算', '割り算', 'かけ算', '掛け算', '分数', '割合', '数直線', 'テープ図', '関数'],
    maps: ['地図', '都道府県', '地方', '世界', { w: '国', not: ['国語'] }, '人口', '地域'],
    kokugo: ['国語', '漢文', '漢詩', '古文', '現代文', '評論', '小説', '書き順', 'ひらがな'],
    english: ['英文', '文型', '英語', { w: '句', not: ['俳句', '語句', '文句', '句読点'] }, { w: '節', not: ['季節', '関節', '節約', '節分', '調節'] }, '関係詞'],
    music: ['音階', '和音', { w: 'コード', not: ['ソースコード', 'バーコード', 'QRコード', 'コーディング'] }, '鍵盤', '楽譜'],
    business: ['市場', 'KPI', '売上', '事業', 'ピッチ'],
    tools: ['タイマー', 'ワークショップ', '演習時間', 'グループワーク'],
  },
  en: {
    stats: ['distribution', 'distributions', 'statistics', 'statistical', 'data', 'histogram', 'histograms', 'box plot', 'box plots', 'correlation', 'Bayes', 'Bayesian', 'estimation', 'hypothesis test', 'hypothesis testing'],
    math: ['long division', 'column addition', 'multiplication', 'division', 'fraction', 'fractions', 'ratio', 'ratios', 'percentage', 'percentages', 'number line', 'tape diagram', 'function', 'functions'],
    maps: ['map', 'maps', 'prefecture', 'prefectures', 'region', 'regions', 'world', 'country', 'countries', 'population'],
    kokugo: ['kanbun', 'kobun', 'kanshi', 'classical Japanese', 'classical Chinese', 'stroke order', 'hiragana', 'katakana', 'kanji'],
    english: ['English grammar', 'sentence structure', 'sentence pattern', 'sentence patterns', 'phrase', 'phrases', 'clause', 'clauses', 'relative pronoun', 'relative pronouns'],
    music: ['musical scale', 'major scale', 'minor scale', 'chord', 'chords', 'keyboard', 'piano', 'sheet music', 'musical score'],
    business: ['market', 'markets', 'KPI', 'KPIs', 'sales', 'revenue', 'business', 'pitch'],
    tools: ['timer', 'workshop', 'exercise time', 'group work'],
  },
});

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
export function partsList(sub) {
  const tags = partOrder(Object.keys(PARTS).filter(shown));
  const groups = TIERS.purposes.filter((p) => !p.into).map((p) => ({ id: p.id, label: p.label, parts: tags.filter((t) => groupOf(t) === p.id).sort(byTier) }));
  const other = { ...OTHER_GROUP, parts: tags.filter((t) => groupOf(t) === 'other').sort(byTier) };
  const subject = { ...SUBJECT_GROUP, parts: SUBJECT_SETS.flatMap((s) => tags.filter((t) => groupOf(t) === 'subject' && PARTS[t].set === s)) };
  const list = [...groups, other].filter((g) => g.parts.length);
  if (!subject.parts.length) return list;
  return SUBJECT_FIRST.includes(sub) ? [subject, ...list] : [...list, subject];
}
const LISTED = () => partsList(null).flatMap((g) => g.parts);
export const partsOfSet = (set) => LISTED().filter((t) => PARTS[t].set === set);
const SETS = () => [...new Set(LISTED().map((t) => PARTS[t].set).filter(Boolean))];

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
export function recommend({ sub = null, text = '', lang = 'ja' } = {}) {
  const L = lang === 'en' ? 'en' : 'ja', t = String(text || ''), have = SETS(), out = [];
  for (const set of SUB_SETS[sub] || []) if (have.includes(set)) out.push({ set, sub });
  for (const [set, words] of Object.entries(WORDS[L])) {
    if (!have.includes(set) || out.some((r) => r.set === set)) continue;
    for (const w of words) { const hit = findWord(t, w, L); if (hit) { out.push({ set, word: hit }); break; } }
  }
  return out;
}
export function initialParts(rec = []) {
  const sets = new Set(rec.map((r) => r.set));
  return LISTED().filter((t) => PARTS[t].tier === 'standard' || sets.has(PARTS[t].set));
}

// お使いの AI（無料のプラン・有料のプラン）。変えるのは指示の大きさの上限と詳しさ
export const AI_PLANS = ['free', 'paid'];
export const DEFAULT_PLAN = 'free';
export const planOf = (choice) => (choice && choice.plan === 'paid' ? 'paid' : DEFAULT_PLAN);
export const capKb = (plan) => (plan === 'paid' ? PACK_CAP_KB.paid : PACK_CAP_KB.free);
// 外す候補：sizeOf(tags) は選んだパーツで組んだ指示のバイト数。keep（理由のあるおすすめ・自分で付けたもの）は候補にしない。
// 1 つずつ外したときに減る大きさの大きい順に、越えた分に届くまで（届かなければ候補の全部）
export function trimCandidates(ticked, { sizeOf, capBytes, keep = new Set() }) {
  const all = sizeOf(ticked), over = all - capBytes;
  if (over <= 0) return [];
  const gain = ticked.filter((t) => !keep.has(t)).map((t) => [t, all - sizeOf(ticked.filter((x) => x !== t))]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = [];
  let sum = 0;
  for (const [t, g] of gain) { if (sum >= over) break; out.push(t); sum += g; }
  return out;
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
const clean = (choice) => ({
  v: 1,
  plan: planOf(choice),
  category: catOf(choice.category) ? choice.category : null,
  subcategory: subOf(choice.category, choice.subcategory) ? choice.subcategory : null,
  parts: Object.keys(PARTS).filter((t) => (choice.parts || []).includes(t)).sort(),
});
export function withChoice(configText, choice) {
  return updateConfig(configText || null, { studio: merge({ newDeck: clean(choice || {}) }) });
}
export function choiceOf(configText) {
  let c;
  try { c = configObject(configText); } catch { return null; }
  const n = isObj(c.studio) ? c.studio.newDeck : null;
  if (!isObj(n) || n.v !== 1) return null;
  return { ...n, plan: planOf(n) };   // plan のない前の記録は無料のプラン
}
