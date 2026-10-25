// 部品の画面の名前と絵（新規作成 ④ の折りたたみ「この指示に入るパーツ」の並びと、分野の問いの「標準パーツ」の例）。
// 部品庫の manifest（vendor/components/manifest.json）には画面の名前がないので、ここにだけ置く。icon は app/llm.js の ICONS の名前。
// 表にない部品は、名前は m-… のまま、絵は汎用（部品庫に部品が増えたら、ここに 1 行足す）
//   PART_LABELS                 {タグ: {ja, en, icon}}
//   partLabel(tag, lang)        → 画面の名前
//   partIcon(tag)               → 絵の名前
//   standardParts(lang)         → 標準パーツ（FREE_CORE。無料のプランの共通の本体が説明する部品）の名前の並び
//   partOrder(tags)             → 並べる順（標準パーツ、それから表の順）
import { FREE_CORE } from './llm-pack-assemble.mjs';

export const PART_LABELS = Object.freeze({
  'm-bars': { ja: '棒グラフ', en: 'Bar chart', icon: 'bars' },
  'm-flow': { ja: '流れ図', en: 'Flow diagram', icon: 'flow' },
  'm-menu': { ja: '目次', en: 'Contents', icon: 'menu' },
  'm-curves': { ja: '折れ線グラフ', en: 'Line chart', icon: 'line' },
  'm-kpi': { ja: '数字の札', en: 'Key numbers', icon: 'kpi' },
  'm-quad': { ja: 'マトリックス', en: 'Matrix', icon: 'matrix' },
  'm-compare': { ja: '比べる表', en: 'Comparison table', icon: 'compare' },
  'm-pie': { ja: '円グラフ', en: 'Pie chart', icon: 'part' },
  'm-cycle': { ja: '循環', en: 'Cycle', icon: 'cycle' },
  'm-fishbone': { ja: '特性要因図', en: 'Fishbone diagram', icon: 'cause' },
  'm-scatter': { ja: '散布図', en: 'Scatter plot', icon: 'scatter' },
  'm-timeline': { ja: '年表', en: 'Timeline', icon: 'timeline' },
  'm-tree': { ja: '階層の木', en: 'Tree', icon: 'tree' },
  'm-venn': { ja: 'ベン図', en: 'Venn diagram', icon: 'venn' },
  'm-collect': { ja: '回答のまとめ', en: 'Grouping answers', icon: 'collect' },
  'm-seq': { ja: '分布の更新', en: 'Updating distribution', icon: 'dist' },
  'm-sweep': { ja: 'パラメータを動かす', en: 'Parameter sweep', icon: 'sweep' },
  'm-market': { ja: '市場規模の円', en: 'Market size circles', icon: 'market' },
  'm-kanbun': { ja: '漢文', en: 'Kanbun', icon: 'kanbun' },
  'm-kobun': { ja: '古文', en: 'Kobun', icon: 'kobun' },
  'm-gendai': { ja: '現代文の読解', en: 'Modern text reading', icon: 'gendai' },
  'm-codetree': { ja: '符号の木', en: 'Code tree', icon: 'codetree' },
});
export const partLabel = (tag, lang) => (PART_LABELS[tag] ? PART_LABELS[tag][lang === 'ja' ? 'ja' : 'en'] : tag);
export const partIcon = (tag) => (PART_LABELS[tag] ? PART_LABELS[tag].icon : 'other');
export const standardParts = (lang) => FREE_CORE.map((t) => partLabel(t, lang));
// 並べる順：標準パーツ（FREE_CORE）、それから表の順（表にない部品は最後に名前の順）
const ORDER = [...FREE_CORE, ...Object.keys(PART_LABELS).filter((t) => !FREE_CORE.includes(t))];
export const partOrder = (tags) => [...tags].sort((a, b) => {
  const i = ORDER.indexOf(a), j = ORDER.indexOf(b);
  return (i < 0 ? ORDER.length : i) - (j < 0 ? ORDER.length : j) || (a < b ? -1 : a > b ? 1 : 0);
});
