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
//   無料版：共通の本体＋選んだ分野。1 つの分野なら one まで（越えたら npm run gen が止まる）、どの組でも all まで（全部の分野を選んでも）
//   有料版：すべての系列のパーツを入れた指示（'all'）。PAID_PACK_KB まで
export const PAID_PACK_KB = 120;   // 有料版の上限（仮の値。変えるならここだけ）
export const PACK_CAP_KB = Object.freeze({ free: Object.freeze({ one: 40, all: 58 }), paid: PAID_PACK_KB });
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

function catalog(D, names) {
  if (!names.length) return '';
  const rows = names.map((n) => D.components[n].row).join('\n');
  const sup = names.some((n) => D.components[n].sup);
  return D.tableHead + '\n' + rows + '\n\n' + (sup ? D.supNote + '\n\n' : '') + names.map((n) => D.components[n].entry).join('\n\n');
}
function extensions(D, series, exclude = []) {
  return Object.keys(D.components).sort().filter((n) => !exclude.includes(n) && D.components[n].ext && D.components[n].ext[series])
    .map((n) => D.extHead.replace('{name}', n) + '\n\n' + D.components[n].ext[series]).join('\n\n');
}
export const membersOf = (D, series) => Object.keys(D.components).sort().filter((n) => D.components[n].series === series);

// series：入っている系列（表が指す部品を決める。既定 [] は共通の本体だけ：docs の共通の本体と同じ。null ならすべて）。off：外した札（表の行を出さない）
export function commonOf(data, lang, exclude = [], series = [], off = []) {
  const D = langOf(data, lang);
  const table = () => (data.purposes ? purposesTable(data.purposes, data.parts || [], lang, data.partsSrc || '', { exclude, series: series === null ? null : normalizeSeries(series, data), off }) : '');
  return tidy(partSpans(D.common, exclude).replace('{{PURPOSES}}', table).replace('{{CATALOG}}', () => catalog(D, membersOf(D, 'common').filter((n) => !exclude.includes(n)))));
}
export function partOf(data, name, lang, exclude = []) {
  const D = langOf(data, lang);
  if (!D.series[name]) throw new Error(`llm-pack: unknown series "${name}"`);
  return tidy(partSpans(D.series[name], exclude).replace('{{CATALOG}}', () => catalog(D, membersOf(D, name).filter((n) => !exclude.includes(n)))).replace('{{EXTENSIONS}}', () => extensions(D, name, exclude)));
}

// 利用者が埋める「頼みたいこと」（記入欄の付いた頼み方。新しく作る／ここまでの議論の内容で）。いちばん最後に付く
export const requestOf = (data, lang) => tidy(langOf(data, lang).request || '');

export function assemble(data, { series = [], lang = 'en', exclude = [], off = [] } = {}) {
  const ss = normalizeSeries(series, data);
  const parts = [commonOf(data, lang, exclude, ss, off), ...ss.map((s) => partOf(data, s, lang, exclude)), requestOf(data, lang)].filter(Boolean);
  return parts.join('\n\n') + '\n';
}
