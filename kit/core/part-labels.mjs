// 部品の画面の名前と絵と 1 行の説明（新規作成 ④ のパーツの一覧）。
// 部品庫の manifest（vendor/components/manifest.json）には画面の名前がないので、ここにだけ置く。icon は app/llm.js の ICONS の名前。
// 表にない部品は、名前は m-… のまま、絵は汎用（部品庫に部品が増えたら、ここに 1 行足す）
//   PART_LABELS                 {タグ: {ja, en, icon, desc: {ja, en}}}（desc：新規作成 ④ のパーツの一覧の 1 行の説明。何を描くか）
//   partLabel(tag, lang)        → 画面の名前
//   partDesc(tag, lang)         → 1 行の説明（表にない部品は ''）
//   partIcon(tag)               → 絵の名前
//   standardParts(lang)         → 標準パーツ（FREE_CORE。無料のプランの共通の本体が説明する部品）の名前の並び
//   partOrder(tags)             → 並べる順（標準パーツ、それから表の順）
import { FREE_CORE } from './llm-pack-assemble.mjs';

export const PART_LABELS = Object.freeze({
  'm-bars': { ja: '棒グラフ', en: 'Bar chart', icon: 'bars', desc: { ja: '棒の長さで量を比べる', en: 'Compares amounts by bar length' } },
  'm-flow': { ja: '流れ図', en: 'Flow diagram', icon: 'flow', desc: { ja: '手順や工程を矢印でつなぐ', en: 'Steps of a process joined by arrows' } },
  'm-menu': { ja: '目次', en: 'Contents', icon: 'menu', desc: { ja: 'スライドへのリンクの札を並べた目次', en: 'A contents page of links to slides' } },
  'm-curves': { ja: '折れ線グラフ', en: 'Line chart', icon: 'line', desc: { ja: '時間とともに変わる量を線で', en: 'Values that change over time, as lines' } },
  'm-kpi': { ja: '数字の札', en: 'Key numbers', icon: 'kpi', desc: { ja: '大事な数字を大きく見せる', en: 'Shows one important number, large' } },
  'm-quad': { ja: 'マトリックス', en: 'Matrix', icon: 'matrix', desc: { ja: '2 つの軸で 4 つに分けて置く', en: 'Places items in four quadrants on two axes' } },
  'm-compare': { ja: '比べる表', en: 'Comparison table', icon: 'compare', desc: { ja: '2 つ（3 つまで）を並べて項目ごとに比べる', en: 'Compares two (or three) side by side, row by row' } },
  'm-pie': { ja: '円グラフ', en: 'Pie chart', icon: 'part', desc: { ja: '全体の中の割合', en: 'Shares of a whole' } },
  'm-cycle': { ja: '循環', en: 'Cycle', icon: 'cycle', desc: { ja: 'くり返す流れを輪にする', en: 'Stages that repeat, in a ring' } },
  'm-fishbone': { ja: '特性要因図', en: 'Fishbone diagram', icon: 'cause', desc: { ja: '結果に効く原因を魚の骨の形に', en: 'Causes of a result, as a fishbone' } },
  'm-scatter': { ja: '散布図', en: 'Scatter plot', icon: 'scatter', desc: { ja: '2 つの量の関係を点で', en: 'How two quantities relate, as dots' } },
  'm-timeline': { ja: '年表', en: 'Timeline', icon: 'timeline', desc: { ja: '出来事や期間を時間の軸に並べる', en: 'Events and periods along a time axis' } },
  'm-tree': { ja: '階層の木', en: 'Tree', icon: 'tree', desc: { ja: '上から枝分かれする階層や分類', en: 'A hierarchy or classification, branching down' } },
  'm-venn': { ja: 'ベン図', en: 'Venn diagram', icon: 'venn', desc: { ja: '集合の重なり', en: 'How sets overlap' } },
  'm-collect': { ja: '回答のまとめ', en: 'Grouping answers', icon: 'collect', desc: { ja: '回答をまとめて分ける', en: 'Gathers answers and sorts them into groups' } },
  'm-sweep': { ja: 'パラメータを動かす', en: 'Parameter sweep', icon: 'sweep', desc: { ja: 'パラメータを動かして関数の形の変化を見せる', en: 'Moves a parameter to show how a function changes' } },
  'm-market': { ja: '市場規模の円', en: 'Market size circles', icon: 'market', desc: { ja: '市場規模（TAM・SAM・SOM）を入れ子の円で', en: 'Market size (TAM, SAM, SOM) as nested circles' } },
  'm-kanbun': { ja: '漢文', en: 'Kanbun', icon: 'kanbun', desc: { ja: '返り点を付けて訓読の順にたどり、書き下す', en: 'Return marks, reading order and the rendered text' } },
  'm-kobun': { ja: '古文', en: 'Kobun', icon: 'kobun', desc: { ja: '語に切って品詞を色分けし、現代語訳と並べる', en: 'Words split and coloured by part of speech, with a modern translation' } },
  'm-gendai': { ja: '現代文の読解', en: 'Modern text reading', icon: 'gendai', desc: { ja: '傍線・指す内容への矢印・段落の役割を図にする', en: 'Underlines, arrows to what words refer to, and paragraph roles' } },
  'm-codetree': { ja: '符号の木', en: 'Code tree', icon: 'codetree', desc: { ja: '符号を木の枝でたどる', en: 'Codes traced along the branches of a tree' } },
  'm-map-japan': { ja: '日本地図', en: 'Map of Japan', icon: 'map', desc: { ja: '都道府県を塗り分け、点や矢印を置く', en: 'Prefectures shaded, with points and arrows' } },
  'm-predict': { ja: '予想と答え', en: 'Predict and check', icon: 'predict', desc: { ja: '予想を聞いてから答えを見せる', en: 'Asks for a guess, then shows the answer' } },
  'm-timer': { ja: 'タイマー', en: 'Timer', icon: 'timer', desc: { ja: '演習やグループワークの残り時間', en: 'Time left for an exercise or group work' } },
  'm-hist': { ja: 'ヒストグラム', en: 'Histogram', icon: 'hist', desc: { ja: 'データの分布を柱で', en: 'The distribution of data, as columns' } },
  'm-boxplot': { ja: '箱ひげ図', en: 'Box plot', icon: 'boxplot', desc: { ja: '分布を箱とひげで比べる', en: 'Compares distributions with boxes and whiskers' } },
  'm-seq': { ja: '分布の更新', en: 'Updating distribution', icon: 'dist', desc: { ja: '観測を加えるたびに分布が変わるようす', en: 'A distribution updated with each observation' } },
  'm-hissan': { ja: '筆算', en: 'Column arithmetic', icon: 'hissan', desc: { ja: '筆算を 1 けたずつ', en: 'Column arithmetic, one digit at a time' } },
  'm-numberline': { ja: '数直線', en: 'Number line', icon: 'numberline', desc: { ja: '数の位置と動きを数直線に', en: 'Numbers and moves on a number line' } },
  'm-tape': { ja: 'テープ図', en: 'Tape diagram', icon: 'tape', desc: { ja: '量の関係をテープ図・線分図で', en: 'Quantities as tape or line diagrams' } },
  'm-kakijun': { ja: '書き順', en: 'Stroke order', icon: 'kakijun', desc: { ja: '漢字の書き順を 1 画ずつ', en: 'Stroke order, one stroke at a time' } },
  'm-keyboard': { ja: '鍵盤', en: 'Keyboard', icon: 'keyboard', desc: { ja: '鍵盤で音階や和音を示す', en: 'Scales and chords on a piano keyboard' } },
  'm-syntax': { ja: '英文の構造', en: 'Sentence structure', icon: 'syntax', desc: { ja: '英文の S V O C M と句・節', en: 'S V O C M, phrases and clauses of a sentence' } },
  'm-heatmap': { ja: 'ヒートマップ', en: 'Heatmap', icon: 'heatmap', desc: { ja: '表の値を色の濃さで', en: 'Values in a grid, as shades' } },
  'm-map-world': { ja: '世界地図', en: 'World map', icon: 'mapworld', desc: { ja: '国や地域を塗り分け、点や矢印を置く', en: 'Countries shaded, with points and arrows' } },
  'm-cards': { ja: 'カード', en: 'Cards', icon: 'menu', desc: { ja: 'アイコン付きのカードを並べて 1 枚ずつ出す', en: 'Cards with icons, shown one at a time' } },
  'm-score': { ja: '楽譜', en: 'Score', icon: 'keyboard', desc: { ja: '五線譜を 1 音ずつ出して鳴らす', en: 'Staff notation, one note at a time, with sound' } },
  'm-orbit': { ja: '月の満ち欠け', en: 'Moon phases', icon: 'cycle', desc: { ja: '月の位置と見える形を並べて動かす', en: 'The Moon’s position and its visible shape, moving together' } },
});
export const partLabel = (tag, lang) => (PART_LABELS[tag] ? PART_LABELS[tag][lang === 'ja' ? 'ja' : 'en'] : tag);
export const partDesc = (tag, lang) => (PART_LABELS[tag] && PART_LABELS[tag].desc ? PART_LABELS[tag].desc[lang === 'ja' ? 'ja' : 'en'] : '');
export const partIcon = (tag) => (PART_LABELS[tag] ? PART_LABELS[tag].icon : 'other');
export const standardParts = (lang) => FREE_CORE.map((t) => partLabel(t, lang));
// 並べる順：標準パーツ（FREE_CORE）、それから表の順（表にない部品は最後に名前の順）
const ORDER = [...FREE_CORE, ...Object.keys(PART_LABELS).filter((t) => !FREE_CORE.includes(t))];
export const partOrder = (tags) => [...tags].sort((a, b) => {
  const i = ORDER.indexOf(a), j = ORDER.indexOf(b);
  return (i < 0 ? ORDER.length : i) - (j < 0 ? ORDER.length : j) || (a < b ? -1 : a > b ? 1 : 0);
});
