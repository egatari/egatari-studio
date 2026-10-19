// AI への指示（kit/core/llm-pack.mjs）の組み立ての本体。材料（kit/core/llm-pack-data.mjs の PACK と同じ形）を引数で受け取る。
// tools/make-llm-guide.mjs は作りたての材料で、kit/core/llm-pack.mjs は書き出した材料で同じ関数を使う。Node にもブラウザにも依存しない
//   材料：{series: [名前…], en|ja: {common, request?, series: {名前: 文章}, components: {タグ: {series, row, entry, sup?, ext?: {系列: 文章}}}, tableHead, supNote, extHead}}
//   common・series の文章の {{CATALOG}} にその場所の部品の一覧と説明、{{EXTENSIONS}} にほかの部品のその系列向けの節が入る
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

function catalog(D, names) {
  if (!names.length) return '';
  const rows = names.map((n) => D.components[n].row).join('\n');
  const sup = names.some((n) => D.components[n].sup);
  return D.tableHead + '\n' + rows + '\n\n' + (sup ? D.supNote + '\n\n' : '') + names.map((n) => D.components[n].entry).join('\n\n');
}
function extensions(D, series) {
  return Object.keys(D.components).sort().filter((n) => D.components[n].ext && D.components[n].ext[series])
    .map((n) => D.extHead.replace('{name}', n) + '\n\n' + D.components[n].ext[series]).join('\n\n');
}
export const membersOf = (D, series) => Object.keys(D.components).sort().filter((n) => D.components[n].series === series);

export function commonOf(data, lang) {
  const D = langOf(data, lang);
  return tidy(D.common.replace('{{CATALOG}}', () => catalog(D, membersOf(D, 'common'))));
}
export function partOf(data, name, lang) {
  const D = langOf(data, lang);
  if (!D.series[name]) throw new Error(`llm-pack: unknown series "${name}"`);
  return tidy(D.series[name].replace('{{CATALOG}}', () => catalog(D, membersOf(D, name))).replace('{{EXTENSIONS}}', () => extensions(D, name)));
}

// 利用者が埋める「頼みたいこと」（記入欄の付いた頼み方。新しく作る／ここまでの議論の内容で）。いちばん最後に付く
export const requestOf = (data, lang) => tidy(langOf(data, lang).request || '');

export function assemble(data, { series = [], lang = 'en' } = {}) {
  const parts = [commonOf(data, lang), ...normalizeSeries(series, data).map((s) => partOf(data, s, lang)), requestOf(data, lang)].filter(Boolean);
  return parts.join('\n\n') + '\n';
}
