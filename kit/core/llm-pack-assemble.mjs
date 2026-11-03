// AI への指示（kit/core/llm-pack.mjs）の組み立ての本体。材料（kit/core/llm-pack-data.mjs の PACK と同じ形）を引数で受け取る。
// tools/make-llm-guide.mjs は作りたての材料で、kit/core/llm-pack.mjs は書き出した材料で同じ関数を使う。Node にもブラウザにも依存しない
//   材料：{sets: [束の名前…], en|ja: {common, request?, sets: {束: 文章}, components: {タグ: {set, row, entry, sup?, ext?: {束: 文章}}}, tableHead, supNote, briefNote, extHead}}
//   部品の段と束（パーツライブラリ 2.0 の manifest の tier・set。handoff/parts-tiers-2026-10-27.md §1）：
//     set が 'standard' の部品（標準）は共通の本体にいつも入る。束の名前の部品（専門）は、その束を選んだときだけ束の指示に入る。
//     特殊（extra）の部品は材料に入らない（指示には入れない。make スキルが README への道だけを持つ）
//   common・束の文章の {{CATALOG}} にその場所の部品の一覧と説明、{{EXTENSIONS}} にほかの部品のその束向けの節が入る
//   exclude：使わせない部品（新規作成で印を外したパーツ）。一覧・説明・拡張の節から除き、
//     <!--part:m-x[,m-y]--> … <!--/part--> で囲んだ文（見本のスライドとその口述原稿、部品の名前を出す文）は、その部品が exclude にあれば丸ごと除く
//   {{PURPOSES}}：言いたいこと → パーツ → ステップの表を、組み立てのときに作る（材料の purposes・parts・partsSrc。入っている束・exclude・外した札 off に合わせる）
//   plan：お使いの AI のプラン。'free'（既定）では、標準の部品のうち中核の 4 つ（FREE_CORE）だけを詳しく書き、ほかの標準の部品は一覧の 1 行だけにする
//     （標準すべてが無料のプランの上限に収まるように。backlog #125）。'paid' はどの部品も詳しく書く。専門の部品はどちらのプランでも詳しく書く
//   short：無料のプランで、中核の 4 つも一覧の 1 行だけにする（束を足して上限を越えたとき、新規作成が外す候補より先に使う。kit/core/new-deck.mjs の fitPlan）
import { purposesTable } from './purposes.mjs';

// 指示の大きさの上限（KB = 1024 バイト。生成した指示で、頼みたいことは記入欄のまま。写す文に入る内容・場面の節は数えない）。
//   free：無料のプラン。目安は Gemini の無料アカウント・教育用アカウント（32K トークン）。Gemini の count_tokens で測ると
//         1,000 トークン ≈ 3.2 KB なので、45 KB ≈ 14K トークン。32K の窓に、ふつうの返事（4K トークン ほど）と
//         修正のやりとり 2 回分（1.5K トークン ほど ずつ）を残せる（owner 決定、2026-11-03、backlog #169）。
//         標準の部品すべて（束なし）が収まること（越えたら npm run gen が止まる）。束を足して越えたら、新規作成のメーターが外す候補を出す（kit/core/new-deck.mjs）
//   paid：有料のプラン。PAID_PACK_KB まで
export const PAID_PACK_KB = 120;   // 有料のプランの上限（仮の値。変えるならここだけ）
export const FREE_PACK_KB = 45;
export const PACK_CAP_KB = Object.freeze({ free: FREE_PACK_KB, paid: PAID_PACK_KB });

// 標準の部品の段の名前（材料の部品の set）
export const STANDARD = 'standard';
export const PLANS = Object.freeze(['free', 'paid']);
// 中核の 4 つ：無料のプランでも詳しく書く標準の部品
export const FREE_CORE = Object.freeze(['m-bars', 'm-flow', 'm-menu', 'm-predict']);
export const planName = (plan) => (plan === 'paid' ? 'paid' : 'free');
// 一覧の 1 行だけにする部品（無料のプランの、中核の 4 つ以外の標準の部品。short なら中核の 4 つも）
export function briefParts(data, plan = 'free', short = false) {
  if (planName(plan) === 'paid') return [];
  return Object.keys(data.en.components).sort().filter((t) => data.en.components[t].set === STANDARD && (short || !FREE_CORE.includes(t)));
}
export function normalizeSets(sets, data) {
  if (sets === undefined || sets === null) return [];
  if (sets === 'all') return [...data.sets];
  const list = typeof sets === 'string' ? sets.split(',') : [...sets];
  const want = new Set(list.map((s) => String(s).trim()).filter(Boolean));
  for (const s of want) if (!data.sets.includes(s)) throw new Error(`llm-pack: unknown part set "${s}" (known: ${data.sets.join(', ')})`);
  return data.sets.filter((s) => want.has(s));   // 重ねて渡しても 1 回、順は決まった順
}

export const langOf = (data, lang) => data[lang === 'ja' ? 'ja' : 'en'];
const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').trim();
// 部品に結び付いた文：exclude の部品があれば除き、なければ印だけを外す
export const partSpans = (text, exclude = []) => text.replace(/<!--part:([a-z0-9,-]+)-->([\s\S]*?)<!--\/part-->/g, (_, tags, inner) => (tags.split(',').some((t) => exclude.includes(t)) ? '' : inner));

// gone：組み立てに入らない部品（説明の中でその名前を出す所を除く。<!--part:…--> は make-llm-guide の markRefs が付ける）。
// brief：一覧の 1 行だけの部品（説明の節を出さない）
function catalog(D, names, gone = [], brief = []) {
  if (!names.length) return '';
  const rows = names.map((n) => partSpans(D.components[n].row, gone)).join('\n');
  const full = names.filter((n) => !brief.includes(n));
  const sup = full.some((n) => D.components[n].sup);
  const short = names.length > full.length;
  return D.tableHead + '\n' + rows + '\n\n' + (short ? D.briefNote + '\n\n' : '') + (sup ? D.supNote + '\n\n' : '') + full.map((n) => partSpans(D.components[n].entry, gone)).join('\n\n');
}
function extensions(D, set, exclude = [], gone = exclude) {
  return Object.keys(D.components).sort().filter((n) => !exclude.includes(n) && D.components[n].ext && D.components[n].ext[set])
    .map((n) => D.extHead.replace('{name}', n) + '\n\n' + partSpans(D.components[n].ext[set], gone)).join('\n\n');
}
// 組み立てに入らない部品：exclude と、標準でも入っている束（sets）の部品でもないもの
export function goneParts(data, lang, exclude, sets) {
  const D = langOf(data, lang);
  const ss = new Set(sets);
  return Object.keys(D.components).filter((n) => exclude.includes(n) || !(D.components[n].set === STANDARD || ss.has(D.components[n].set)));
}
export const membersOf = (D, set) => Object.keys(D.components).sort().filter((n) => D.components[n].set === set);

// 共通の本体（標準の部品の一覧と説明・言いたいことの表）。sets：入っている束（表が指す部品を決める。既定 [] は標準だけ。null ならすべて）。off：外した札
export function commonOf(data, lang, { exclude = [], sets = [], off = [], plan = 'free', short = false } = {}) {
  const D = langOf(data, lang);
  const ss = sets === null ? [...data.sets] : normalizeSets(sets, data);
  const gone = goneParts(data, lang, exclude, ss);
  const table = () => (data.purposes ? purposesTable(data.purposes, data.parts || [], lang, data.partsSrc || '', { exclude, sets: ss, off }) : '');
  return tidy(partSpans(D.common, exclude).replace('{{PURPOSES}}', table)
    .replace('{{CATALOG}}', () => catalog(D, membersOf(D, STANDARD).filter((n) => !exclude.includes(n)), gone, briefParts(data, plan, short))));
}
// 1 つの束の指示。sets：一緒に入る束（説明の中の名前を残す部品を決める。既定はこの束だけ）
export function partOf(data, name, lang, { exclude = [], sets = [name] } = {}) {
  const D = langOf(data, lang);
  if (!D.sets[name]) throw new Error(`llm-pack: unknown part set "${name}"`);
  const gone = goneParts(data, lang, exclude, [...new Set([name, ...sets])]);
  return tidy(partSpans(D.sets[name], exclude).replace('{{CATALOG}}', () => catalog(D, membersOf(D, name).filter((n) => !exclude.includes(n)), gone)).replace('{{EXTENSIONS}}', () => extensions(D, name, exclude, gone)));
}

// 利用者が埋める「頼みたいこと」（記入欄の付いた頼み方。新しく作る／渡した資料と話し合いの内容で）。いちばん最後に付く
export const requestOf = (data, lang) => tidy(langOf(data, lang).request || '');

// sets：選んだ束（'a,b'・配列・'all'）。plan：'free'（既定）| 'paid'（詳しさだけが変わる）
export function packParts(data, { sets = [], lang = 'en', exclude = [], off = [], plan = 'free', short = false } = {}) {
  const ss = normalizeSets(sets, data);
  return [commonOf(data, lang, { exclude, sets: ss, off, plan, short }), ...ss.map((s) => partOf(data, s, lang, { exclude, sets: ss }))];
}
export function assemble(data, { sets = [], lang = 'en', exclude = [], off = [], plan = 'free', short = false } = {}) {
  const parts = [...packParts(data, { sets, lang, exclude, off, plan, short }), requestOf(data, lang)].filter(Boolean);
  return parts.join('\n\n') + '\n';
}

// 選んだパーツ（タグ）だけの組み立ての引数 {sets, exclude, plan, short?}：選んだ専門のパーツの束を入れ、選ばないパーツは除く（新規作成と同じ。
// kit/core/llm-pack.mjs の partsPackOpts はこの指示の材料で）
export function packOptsOf(data, tags, plan = 'free', { short = false } = {}) {
  const want = new Set(tags || []), all = Object.keys(data.en.components);
  const on = all.filter((t) => want.has(t));
  return {
    sets: data.sets.filter((s) => on.some((t) => data.en.components[t].set === s)),
    exclude: all.filter((t) => !want.has(t)).sort(),
    plan: planName(plan),
    ...(short && planName(plan) === 'free' ? { short: true } : {}),
  };
}

// ---------------------------------------------------------------- 無料のプランの目安に収める（backlog #125）。編集アプリ・コマンド・npm run gen が同じ関数を使う
// 外す候補：sizeOf(tags) は選んだパーツで組んだ指示のバイト数。keep は候補にしない（fitPlan では標準のパーツ）。
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

// 目安に収める（backlog #125）：無料のプランで目安を越えたら、まず中核の 4 つ（棒グラフ・流れ図・目次・予想と答え）の説明も短くする（short）。
// それでも越えるなら、外す候補は印の付いた専門のパーツだけ（外したときに減る大きさの大きい順。標準のパーツは候補にしない）。
// sizeOf(tags, short) は選んだパーツで組んだ指示のバイト数。→ {short, candidates}
export function fitPlan(data, ticked, plan, { sizeOf, capBytes }) {
  const short = planName(plan) === 'free' && sizeOf(ticked, false) > capBytes;
  const keep = new Set(ticked.filter((t) => !data.en.components[t] || data.en.components[t].set === STANDARD));
  return { short, candidates: trimCandidates(ticked, { sizeOf: (tags) => sizeOf(tags, short), capBytes, keep }) };
}

// 目安に収めた後の選び方（コマンドの kit/llm-pack.mjs と npm run gen の大きさの表が使う。編集アプリで［候補を外す］を押した後と同じ）：fitPlan の候補を外し、
// 外した後でもう一度 fitPlan で short を決める（外して収まれば、中核の 4 つの説明は詳しいまま）。
// → {tags: 残るパーツ, short, dropped: 外したパーツ, bytes, over: まだ目安を越えるか}
export function fitPack(data, ticked, plan, { sizeOf, capBytes }) {
  const first = fitPlan(data, ticked, plan, { sizeOf, capBytes });
  const tags = ticked.filter((t) => !first.candidates.includes(t));
  const { short } = first.candidates.length ? fitPlan(data, tags, plan, { sizeOf, capBytes }) : first;
  const bytes = sizeOf(tags, short);
  return { tags, short, dropped: first.candidates, bytes, over: bytes > capBytes };
}
