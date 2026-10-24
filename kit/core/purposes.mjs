// 言いたいこと（purpose）→ 表し方 → パーツ（backlog #99、handoff/parts-map-2026-10-24.html の 8・10）。Node にもブラウザにも依存しない（純粋な ESM）
// 新規作成の「言いたいこと」の札（app/llm.js）と、AI への指示の本体の表（tools/make-llm-guide.mjs の {{PURPOSES}}）が同じ材料を使う。
//
// 材料の出どころ：部品庫のリリースの manifest.json（vendor/components/manifest.json。部品庫が purposes と部品ごとの purposes を入れたら）。
// まだなければ下の FALLBACK（parts-map の 10 の表を写したもの）。どちらを使ったかは source に残す（'manifest' | 'fallback'）。
// TODO(#99, components v1.2.0)：manifest.json に purposes が入ったら、tools/components-update.mjs がそれを vendor/components/manifest.json に
// 置くようにし、ここは FALLBACK を使わなくなる。m-curves と m-quad の本体への移動も v1.2.0 の後（部品の frontmatter の series が common になる）
//
//   FALLBACK                          [{id, icon, label, sub, name, use, steps, components, planned?}]（label・sub・name・use・steps は {en, ja}）
//   PART_LABELS                       {タグ: {en, ja}}：全パーツの 1 行の一覧（指示の本体）に出す短い説明（manifest に label がなければこれ）
//   purposesFrom(manifest | null)     → {source, list, components: {タグ: [purpose の id]}}
//   componentsOff(off, P)             外した言いたいこと（id の配列）だけに使う部品（ほかの入っている言いたいことに使わないもの）。並びは名前の順
//   purposesTable(P, lang)            指示の本体の表（Markdown）
//   partsIndex(P, comps, lang, src)   全パーツの 1 行の一覧（comps：[{tag, series}]。src：版を固定した部品庫の URL の前の部分）

export const FALLBACK = [
  { id: 'compare', icon: 'compare', label: { ja: '比べる', en: 'Compare' }, sub: { ja: '棒・並べた棒・比べる図', en: 'bars, sorted bars, comparison' },
    name: { ja: '量を比べる', en: 'compare amounts' }, use: { ja: 'm-bars（順位は並べ替え）、比べる図 ＊', en: 'm-bars (sorted for ranking), comparison *' },
    steps: { ja: '1 つの組、次に差', en: 'one group, then the difference' }, components: ['m-bars'] },
  { id: 'change', icon: 'line', label: { ja: '変化', en: 'Change' }, sub: { ja: '折れ線・縦棒', en: 'line, columns' },
    name: { ja: '時間での変化', en: 'change over time' }, use: { ja: 'm-curves（折れ線）、m-bars（点が少ないとき）', en: 'm-curves (line), m-bars (few points)' },
    steps: { ja: '線を 1 本ずつ', en: 'one line at a time' }, components: ['m-curves', 'm-bars'] },
  { id: 'part', icon: 'part', label: { ja: '内訳', en: 'Part of a whole' }, sub: { ja: '積み上げ棒・円・入れ子の円', en: 'stacked bars, pie, nested circles' },
    name: { ja: '全体と内訳', en: 'part of a whole' }, use: { ja: '積み上げの m-bars、入れ子は m-market', en: 'stacked m-bars; m-market for nested' },
    steps: { ja: '全体を一度に', en: 'whole at once' }, components: ['m-bars', 'm-market'] },
  { id: 'number', icon: 'kpi', label: { ja: '数字を見せる', en: 'Key number' }, sub: { ja: '大きな数字', en: 'big number' },
    name: { ja: '1 つの大事な数字', en: 'one key number' }, use: { ja: 'm-kpi', en: 'm-kpi' },
    steps: { ja: '全体を一度に', en: 'whole at once' }, components: ['m-kpi'] },
  { id: 'process', icon: 'flow', label: { ja: '手順', en: 'Steps' }, sub: { ja: '流れ図', en: 'flow chart' },
    name: { ja: '手順・工程', en: 'steps of a process' }, use: { ja: 'm-flow', en: 'm-flow' },
    steps: { ja: '1 段ずつ', en: 'one step at a time' }, components: ['m-flow'] },
  { id: 'timeline', icon: 'timeline', label: { ja: '年表・予定', en: 'Timeline' }, sub: { ja: '年表 ＊', en: 'timeline *' },
    name: { ja: '年表・予定', en: 'timeline' }, use: { ja: '年表 ＊', en: 'timeline *' },
    steps: { ja: '出来事を 1 つずつ', en: 'one event at a time' }, components: [], planned: true },
  { id: 'cause', icon: 'cause', label: { ja: '原因と結果', en: 'Cause and effect' }, sub: { ja: '特性要因図 ＊', en: 'fishbone *' },
    name: { ja: '原因と結果', en: 'cause and effect' }, use: { ja: '特性要因図 ＊', en: 'fishbone *' },
    steps: { ja: '原因、次に結果', en: 'causes, then the effect' }, components: [], planned: true },
  { id: 'cycle', icon: 'cycle', label: { ja: '循環', en: 'Cycle' }, sub: { ja: 'サイクル ＊', en: 'cycle *' },
    name: { ja: '循環', en: 'cycle' }, use: { ja: 'サイクル ＊', en: 'cycle *' },
    steps: { ja: '段階を 1 つずつ', en: 'one stage at a time' }, components: [], planned: true },
  { id: 'hierarchy', icon: 'tree', label: { ja: '階層・分類', en: 'Hierarchy' }, sub: { ja: '木 ＊', en: 'tree *' },
    name: { ja: '階層・分類', en: 'hierarchy' }, use: { ja: '木 ＊', en: 'tree *' },
    steps: { ja: '上から下へ', en: 'top down' }, components: [], planned: true },
  { id: 'position', icon: 'matrix', label: { ja: '位置づけ', en: 'Position' }, sub: { ja: '4 象限・2 軸の地図', en: '4 quadrants, 2-axis map' },
    name: { ja: '2 軸での位置づけ', en: 'position on 2 axes' }, use: { ja: 'm-quad', en: 'm-quad' },
    steps: { ja: '軸、次に項目', en: 'axes, then items' }, components: ['m-quad'] },
  { id: 'overlap', icon: 'venn', label: { ja: '重なり', en: 'Overlap' }, sub: { ja: 'ベン図 ＊', en: 'Venn diagram *' },
    name: { ja: '重なり', en: 'overlap' }, use: { ja: 'ベン図 ＊', en: 'venn *' },
    steps: { ja: '集合、次に重なり', en: 'sets, then the overlap' }, components: [], planned: true },
  { id: 'relation', icon: 'scatter', label: { ja: '2 つの量の関係', en: 'Two quantities' }, sub: { ja: '散布図 ＊', en: 'scatter plot *' },
    name: { ja: '2 つの量の関係', en: 'two quantities' }, use: { ja: '散布図 ＊', en: 'scatter *' },
    steps: { ja: '点、次に傾向', en: 'points, then the trend' }, components: [], planned: true },
  { id: 'spread', icon: 'dist', label: { ja: 'ばらつき', en: 'Spread' }, sub: { ja: 'ヒストグラム ＊', en: 'histogram *' },
    name: { ja: 'ばらつき', en: 'spread' }, use: { ja: 'ヒストグラム ＊', en: 'histogram *' },
    steps: { ja: '全体を一度に', en: 'whole at once' }, components: [], planned: true },
  { id: 'contents', icon: 'menu', label: { ja: '目次', en: 'Contents' }, sub: { ja: '札の格子', en: 'grid of cards' },
    name: { ja: '目次', en: 'contents' }, use: { ja: 'm-menu', en: 'm-menu' },
    steps: { ja: '全体を一度に', en: 'whole at once' }, components: ['m-menu'] },
];

// 全パーツの 1 行の一覧の短い説明（parts-map の 4・5 の札の名前と 8 の表から）
export const PART_LABELS = {
  'm-bars': { ja: '棒グラフ（比べる・変化・積み上げ）', en: 'bar chart (compare, change, stacked)' },
  'm-curves': { ja: '折れ線（線を 1 本ずつ）', en: 'line chart (one line at a time)' },
  'm-flow': { ja: '流れ図', en: 'flow chart' },
  'm-menu': { ja: '目次の札', en: 'contents cards' },
  'm-kpi': { ja: '大きな数字の札', en: 'big number cards' },
  'm-market': { ja: '市場規模の入れ子の円', en: 'nested market circles' },
  'm-quad': { ja: '2 軸の位置づけ', en: 'position on 2 axes' },
  'm-sweep': { ja: 'パラメータを動かす', en: 'parameter sweep' },
  'm-seq': { ja: '観測ごとの分布の更新', en: 'distribution updated per observation' },
  'm-collect': { ja: '札が箱にまとまる', en: 'cards grouped into boxes' },
  'm-kanbun': { ja: '漢文の訓読', en: 'kanbun reading order' },
  'm-kobun': { ja: '古文の品詞分解', en: 'kobun word analysis' },
  'm-gendai': { ja: '現代文の構造', en: 'structure of a modern text' },
  'm-codetree': { ja: '符号の木で復号', en: 'decoding with a code tree' },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text2 = (v) => (isObj(v) && typeof v.en === 'string' && typeof v.ja === 'string' ? { en: v.en, ja: v.ja } : null);

// manifest.json の purposes（部品庫の purposes.json と同じ形を想定：[{id, label, sub?, name?, use?, steps?, planned?}] か {id: {…}}）と
// components.<名前>.purposes（[id]）。形が合わない項目は落とし、1 つも残らなければ FALLBACK
export function purposesFrom(manifest) {
  const fromFallback = () => {
    const components = {};
    for (const p of FALLBACK) for (const c of p.components) (components[c] = components[c] || []).push(p.id);
    return { source: 'fallback', list: FALLBACK, components };
  };
  if (!isObj(manifest) || !manifest.purposes) return fromFallback();
  const raw = Array.isArray(manifest.purposes) ? manifest.purposes : isObj(manifest.purposes) ? Object.entries(manifest.purposes).map(([id, v]) => ({ id, ...v })) : [];
  const byId = Object.fromEntries(FALLBACK.map((p) => [p.id, p]));
  const list = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.id)) continue;
    const fb = byId[r.id] || {};
    const label = text2(r.label) || fb.label;
    if (!label) continue;
    list.push({ id: r.id, icon: typeof r.icon === 'string' ? r.icon : fb.icon || 'add', label, sub: text2(r.sub) || fb.sub || { en: '', ja: '' },
      name: text2(r.name) || fb.name || label, use: text2(r.use) || fb.use || { en: '', ja: '' }, steps: text2(r.steps) || fb.steps || { en: '', ja: '' },
      components: [], ...(r.planned || fb.planned ? { planned: true } : {}) });
  }
  if (!list.length) return fromFallback();
  const ids = new Set(list.map((p) => p.id));
  const components = {};
  for (const c of Object.values(isObj(manifest.components) ? manifest.components : {})) {
    if (!isObj(c) || typeof c.tag !== 'string' || !Array.isArray(c.purposes)) continue;
    const ps = c.purposes.filter((x) => ids.has(x));
    if (ps.length) components[c.tag] = ps;
  }
  for (const p of list) p.components = Object.keys(components).sort().filter((t) => components[t].includes(p.id));
  return { source: 'manifest', list, components };
}

export function componentsOff(off, P) {
  const offSet = new Set(off || []);
  if (!offSet.size) return [];
  const on = new Set(P.list.map((p) => p.id).filter((id) => !offSet.has(id)));
  return Object.keys(P.components).sort().filter((t) => P.components[t].length && P.components[t].every((id) => !on.has(id)));
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
export function purposesTable(P, lang) {
  const L = lang === 'ja' ? 'ja' : 'en';
  const head = L === 'ja' ? '| 言いたいこと | 表し方 | ステップ |\n|---|---|---|' : '| purpose | use | steps |\n|---|---|---|';
  return head + '\n' + P.list.map((p) => `| ${cell(p.name[L])} | ${cell(p.use[L])} | ${cell(p.steps[L])} |`).join('\n');
}

export function partsIndex(P, comps, lang, src) {
  const L = lang === 'ja' ? 'ja' : 'en';
  const lines = [...comps].sort((a, b) => (a.series === 'common' ? 0 : 1) - (b.series === 'common' ? 0 : 1) || a.series.localeCompare(b.series) || a.tag.localeCompare(b.tag)).map((c) => {
    const what = (PART_LABELS[c.tag] && PART_LABELS[c.tag][L]) || c.tag;
    const where = c.series === 'common' ? (L === 'ja' ? '本体' : 'core') : (L === 'ja' ? `${c.series} の系列` : `${c.series} pack`);
    return L === 'ja' ? `- \`${c.tag}\`（${where}）：${what}` : `- \`${c.tag}\` (${where}): ${what}`;
  });
  const url = src ? (L === 'ja' ? `各パーツの説明（版を固定）：${src}<名前>/README.md（名前は \`m-\` を除いたもの）` : `Each part's description (pinned version): ${src}<name>/README.md (the name without \`m-\`)`) : '';
  return lines.join('\n') + (url ? '\n\n' + url : '');
}
