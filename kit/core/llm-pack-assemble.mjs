// AI への指示（kit/core/llm-pack.mjs）の組み立ての本体。材料（kit/core/llm-pack-data.mjs の PACK と同じ形）を引数で受け取る。
// tools/make-llm-guide.mjs は作りたての材料で、kit/core/llm-pack.mjs は書き出した材料で同じ関数を使う。Node にもブラウザにも依存しない
//   材料：{series: [名前…], en|ja: {common, request?, series: {名前: 文章}, components: {タグ: {series, row, entry, sup?, ext?: {系列: 文章}}}, tableHead, supNote, extHead}}
//   common・series の文章の {{CATALOG}} にその場所の部品の一覧と説明、{{EXTENSIONS}} にほかの部品のその系列向けの節が入る
//   exclude：使わせない部品（新規作成で外した言いたいことだけに使う部品。kit/core/purposes.mjs の componentsOff）。一覧・説明・拡張の節から除き、
//     <!--part:m-x[,m-y]--> … <!--/part--> で囲んだ文（見本のスライドとその口述原稿、部品の名前を出す文）は、その部品が exclude にあれば丸ごと除く
//   {{PURPOSES}}：言いたいこと → パーツ → ステップの表を、組み立てのときに作る（材料の purposes・parts・partsSrc。入っている系列・exclude・外した札 off に合わせる）
import { purposesTable } from './purposes.mjs';

// 指示の大きさの上限（KB = 1024 バイト。生成した指示で、頼みたいことは記入欄のまま。写す文に入る内容・場面の節は数えない）。
// 新規作成の「お使いの AI」（kit/core/new-deck.mjs の AI_PLANS）ごと：
//   無料版：共通の本体＋選んだ分野（2 つまで。new-deck.mjs の FREE_SUBJECT_MAX）。1 つの分野なら one まで、2 つの分野ならどの組でも two まで
//     （越えたら npm run gen が止まる）
//   有料版：すべての共通のパーツ＋選んだ分野（数は限らない）＋選んだ道具。PAID_PACK_KB まで。すべての分野と道具を選んだとき（いちばん大きいとき）が
//     越えたら gen は知らせるだけ（ふつうの組：どの 2 つの分野＋すべての道具 は越えたら止まる）
export const PAID_PACK_KB = 120;   // 有料版の上限（仮の値。変えるならここだけ）
// free.two：50 は今いちばん大きい 2 つの組（国語＋数理・統計、およそ 48 KB）に 2 KB ほどの余裕を足した値で、モデルの限りを測ったものではない。
// 無料のチャットの限りで効くのは 1 つの分野の 40 KB のほう。分野は増える（social など）ので、全部の分野の上限は置かず、無料版で選べる分野を 2 つまでにした（2026-10-25）
export const PACK_CAP_KB = Object.freeze({ free: Object.freeze({ one: 40, two: 50 }), paid: PAID_PACK_KB });

// 無料版で読み込む部品（plan 'free'。有料版はすべて）：
//   FREE_CORE：共通の本体に説明まで入る共通の部品（部品庫 v1.1.0 の共通の部品）
//   FREE_HOME：部品庫が共通にした部品のうち、無料版では v1.1.0 の系列（分野）から入るもの
//   FREE_OUT：系列の部品のうち、無料版では読み込まないもの
//   ほかの共通の部品（v1.2.0 の新しい部品）は有料版だけ：無料版では一覧・説明・表・見本・文のどこにも名前を出さない
//   （表は「近いパーツか HTML」に戻る。説明のない部品を AI に使わせない）
export const PLANS = Object.freeze(['free', 'paid']);
export const FREE_CORE = Object.freeze(['m-bars', 'm-flow', 'm-menu']);
export const FREE_HOME = Object.freeze({ 'm-curves': 'academic', 'm-kpi': 'business', 'm-quad': 'business' });
// FREE_OUT：系列の部品のうち、無料版では読み込まないもの（有料版だけ）。部品庫 v1.9.0 の academic の m-hist・m-boxplot は、
// 入れると無料版の数理・統計が 40 KB を越えるので、今は有料版だけ（2026-10-25 に決めた。無料版の表の spread・compare は近いパーツか HTML）
export const FREE_OUT = Object.freeze(['m-boxplot', 'm-hist']);
const planName = (plan) => (plan === 'paid' ? 'paid' : 'free');
// 無料版から見た部品の居場所：FREE_HOME の系列、FREE_CORE なら 'common'、ほかの共通の部品は null（有料版だけ）、系列の部品はその系列
export function freeSeriesOf(tag, series) {
  if (FREE_HOME[tag]) return FREE_HOME[tag];
  if (FREE_OUT.includes(tag)) return null;
  if (series === 'common') return FREE_CORE.includes(tag) ? 'common' : null;
  return series;
}
// 道具（材料の tools。kit/core/purposes.mjs の toolsFrom）：どちらの版でも、札を押したときだけ入る共通の部品
export const toolTags = (data) => (data.tools || []).map((t) => t.tag);
export function normalizeTools(tools, data) {
  const all = toolTags(data);
  if (tools === undefined || tools === null) return [];
  if (tools === 'all') return all;
  const want = new Set((typeof tools === 'string' ? tools.split(',') : [...tools]).map((t) => String(t).trim()).filter(Boolean).map((t) => (t.startsWith('m-') ? t : 'm-' + t)));
  for (const t of want) if (!all.includes(t)) throw new Error(`llm-pack: unknown tool "${t}" (known: ${all.join(', ') || 'none'})`);
  return all.filter((t) => want.has(t));
}
// 有料版だけの部品（無料版では除く）。道具は有料版だけにしない（押せばどちらの版でも入る）
export function paidOnly(data, plan = 'free') {
  if (planName(plan) === 'paid') return [];
  const tools = toolTags(data);
  return Object.keys(data.en.components).sort().filter((t) => !tools.includes(t) && freeSeriesOf(t, data.en.components[t].series) === null);
}
// その版から見た材料（無料版は部品の居場所を付け替えたもの。作るのは 1 回だけ）
const planCache = new WeakMap();
export function planData(data, plan = 'free') {
  if (planName(plan) === 'paid') return data;
  if (planCache.has(data)) return planCache.get(data);
  const tools = toolTags(data);
  const where = (t, series) => (tools.includes(t) ? series : freeSeriesOf(t, series));
  const remap = (D) => ({ ...D, components: Object.fromEntries(Object.entries(D.components).map(([t, c]) => [t, { ...c, series: where(t, c.series) }])) });
  const d = { ...data, en: remap(data.en), ja: remap(data.ja), parts: (data.parts || []).map((c) => ({ ...c, series: where(c.tag, c.series) })) };
  planCache.set(data, d);
  return d;
}
export function normalizeSeries(series, data) {
  if (series === undefined || series === null) return [];
  if (series === 'all') return [...data.series];
  const list = typeof series === 'string' ? series.split(',') : [...series];
  const want = new Set(list.map((s) => String(s).trim()).filter(Boolean));
  for (const s of want) if (!data.series.includes(s)) throw new Error(`llm-pack: unknown series "${s}" (known: ${data.series.join(', ')})`);
  return data.series.filter((s) => want.has(s));   // 重ねて渡しても 1 回、順は決まった順
}

export const langOf = (data, lang) => data[lang === 'ja' ? 'ja' : 'en'];
const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').trim();
// 部品に結び付いた文：exclude の部品があれば除き、なければ印だけを外す
export const partSpans = (text, exclude = []) => text.replace(/<!--part:([a-z0-9,-]+)-->([\s\S]*?)<!--\/part-->/g, (_, tags, inner) => (tags.split(',').some((t) => exclude.includes(t)) ? '' : inner));

// gone：組み立てに入らない部品（説明の中でその名前を出す所を除く。<!--part:…--> は make-llm-guide の markRefs が付ける）
function catalog(D, names, gone = []) {
  if (!names.length) return '';
  const rows = names.map((n) => partSpans(D.components[n].row, gone)).join('\n');
  const sup = names.some((n) => D.components[n].sup);
  return D.tableHead + '\n' + rows + '\n\n' + (sup ? D.supNote + '\n\n' : '') + names.map((n) => partSpans(D.components[n].entry, gone)).join('\n\n');
}
function extensions(D, series, exclude = [], gone = exclude) {
  return Object.keys(D.components).sort().filter((n) => !exclude.includes(n) && D.components[n].ext && D.components[n].ext[series])
    .map((n) => D.extHead.replace('{name}', n) + '\n\n' + partSpans(D.components[n].ext[series], gone)).join('\n\n');
}
// 組み立てに入らない部品：exclude と、共通の本体・入っている系列（series）の部品でないもの（無料版の材料なら、読み込まない部品も）
export function goneParts(data, lang, exclude, series) {
  const D = langOf(data, lang);
  const ss = new Set(series);
  return Object.keys(D.components).filter((n) => exclude.includes(n) || !(D.components[n].series === 'common' || ss.has(D.components[n].series)));
}
export const membersOf = (D, series) => Object.keys(D.components).sort().filter((n) => D.components[n].series === series);

// series：入っている系列（表が指す部品を決める。既定 [] は共通の本体だけ：docs の共通の本体と同じ。null ならすべて）。off：外した札（表の行を出さない）
export function commonOf(data, lang, exclude = [], series = [], off = []) {
  const D = langOf(data, lang);
  const gone = goneParts(data, lang, exclude, series === null ? data.series : normalizeSeries(series, data));
  const table = () => (data.purposes ? purposesTable(data.purposes, data.parts || [], lang, data.partsSrc || '', { exclude, series: series === null ? null : normalizeSeries(series, data), off, hidden: (data.parts || []).filter((c) => c.series === null).map((c) => c.tag) }) : '');
  return tidy(partSpans(D.common, exclude).replace('{{PURPOSES}}', table).replace('{{CATALOG}}', () => catalog(D, membersOf(D, 'common').filter((n) => !exclude.includes(n)), gone)));
}
// series：一緒に入る系列（説明の中の名前を残す部品を決める。既定はこの系列だけ）
export function partOf(data, name, lang, exclude = [], series = [name]) {
  const D = langOf(data, lang);
  if (!D.series[name]) throw new Error(`llm-pack: unknown series "${name}"`);
  const gone = goneParts(data, lang, exclude, [...new Set([name, ...series])]);
  return tidy(partSpans(D.series[name], exclude).replace('{{CATALOG}}', () => catalog(D, membersOf(D, name).filter((n) => !exclude.includes(n)), gone)).replace('{{EXTENSIONS}}', () => extensions(D, name, exclude, gone)));
}

// 利用者が埋める「頼みたいこと」（記入欄の付いた頼み方。新しく作る／渡した資料と話し合いの内容で）。いちばん最後に付く
export const requestOf = (data, lang) => tidy(langOf(data, lang).request || '');

// plan：'free'（既定。共通の本体は FREE_CORE、選んだ系列の部品（FREE_HOME を含み FREE_OUT を除く））| 'paid'（すべての共通の部品と、選んだ系列の部品）。
// series：選んだ系列（どちらの版でも。無料版の 2 つまでは new-deck.mjs が守る）。tools：選んだ道具（タグか名前の配列・'a,b'・'all'。選ばない道具は名前も出さない）
export function packParts(data, { series = [], tools = [], lang = 'en', exclude = [], off = [], plan = 'free' } = {}) {
  const P = planName(plan);
  const d = planData(data, P);
  const ss = normalizeSeries(series, data);
  const on = normalizeTools(tools, data);
  const ex = [...new Set([...exclude, ...paidOnly(data, P), ...toolTags(data).filter((t) => !on.includes(t))])];
  return [commonOf(d, lang, ex, ss, off), ...ss.map((s) => partOf(d, s, lang, ex, ss))];
}
export function assemble(data, { series = [], tools = [], lang = 'en', exclude = [], off = [], plan = 'free' } = {}) {
  const parts = [...packParts(data, { series, tools, lang, exclude, off, plan }), requestOf(data, lang)].filter(Boolean);
  return parts.join('\n\n') + '\n';
}
