// 言いたいこと（purpose）→ 表し方 → パーツ（backlog #99、handoff/parts-map-2026-10-24.html の 8・10）。Node にもブラウザにも依存しない（純粋な ESM）
// 新規作成の「言いたいこと」の札（app/llm.js）と、AI への指示の本体の表（tools/make-llm-guide.mjs の {{PURPOSES}}）が同じ材料を使う。
//
// 材料の出どころ：部品庫のリリースの manifest.json（components:update が vendor/components/manifest.json に置く）の
//   purposes：順のある配列 [{id, ja, en, steps: {ja, en}, reserved?}]（reserved：まだ使う部品がない。札にも表にも出さない）
//   components.<名前>：{tag, purposes: [id …]（主なものが先）, variants: [名前 …]（0 番目がシード値 0 の見せ方。なければ []）}
// manifest に purposes がなければ（部品庫 v1.1.0 まで）下の FALLBACK（parts-map の 10 の表。id は部品庫の purposes.json と同じ）。
// どちらを使ったかは source（'manifest' | 'fallback'）。id は変わらない。札の短い名前と小さな字は、知っている id ならこの表から（なければ manifest の名前）
//
//   FALLBACK                           [{id, label, sub, name, steps}]（どれも {en, ja}）。parts-map の 14 の札
//   purposesFrom(manifest | null)      → {source, list: [{id, label, sub, name, steps}], components: {タグ: [id …]}, variants: {タグ: [名前 …]}}
//   componentsOff(off, P)              外した言いたいこと（id の配列）だけに使う部品（ほかの入っている言いたいことに使わないもの）。並びは名前の順
//   purposesTable(P, parts, lang, src) 指示の本体の表（Markdown）。parts：組み立てに入る部品 [{tag, series}]（vendor の既定の版）。
//                                      言いたいことごとに、それに使う部品（系列のものは系列の名前を添える）。部品がまだなければ、近い部品か HTML・インラインの SVG で、
//                                      と行に書く（AI にない部品を使わせない。＊ の印は使わない）。どの言いたいことにも入らない部品は最後の「その他のパーツ」の行に。
//                                      src があれば、表の下に版を固定した説明の URL を 1 行

const T = (ja, en) => ({ ja, en });
export const FALLBACK = [
  { id: 'compare', label: T('比べる', 'Compare'), sub: T('棒・並べた棒・比べる図', 'bars, sorted bars, comparison'), name: T('量を比べる', 'compare amounts'), steps: T('1 つの組、次に差', 'one group, then the difference') },
  { id: 'change', label: T('変化', 'Change'), sub: T('折れ線・縦棒', 'line, columns'), name: T('時間での変化', 'change over time'), steps: T('線を 1 本ずつ', 'one line at a time') },
  { id: 'part-whole', label: T('内訳', 'Part of a whole'), sub: T('積み上げ棒・円・入れ子の円', 'stacked bars, pie, nested circles'), name: T('全体と内訳', 'part of a whole'), steps: T('全体を一度に', 'whole at once') },
  { id: 'key-number', label: T('数字を見せる', 'Key number'), sub: T('大きな数字', 'big number'), name: T('1 つの大事な数字', 'one key number'), steps: T('全体を一度に', 'whole at once') },
  { id: 'process', label: T('手順', 'Steps'), sub: T('流れ図', 'flow chart'), name: T('手順・工程', 'steps of a process'), steps: T('1 段ずつ', 'one step at a time') },
  { id: 'timeline', label: T('年表・予定', 'Timeline'), sub: T('年表', 'timeline'), name: T('年表・予定', 'timeline'), steps: T('出来事を 1 つずつ', 'one event at a time') },
  { id: 'cause-effect', label: T('原因と結果', 'Cause and effect'), sub: T('特性要因図', 'fishbone'), name: T('原因と結果', 'cause and effect'), steps: T('原因、次に結果', 'causes, then the effect') },
  { id: 'cycle', label: T('循環', 'Cycle'), sub: T('サイクル', 'cycle'), name: T('循環', 'cycle'), steps: T('段階を 1 つずつ', 'one stage at a time') },
  { id: 'hierarchy', label: T('階層・分類', 'Hierarchy'), sub: T('木', 'tree'), name: T('階層・分類', 'hierarchy'), steps: T('上から下へ', 'top down') },
  { id: 'position', label: T('位置づけ', 'Position'), sub: T('4 象限・2 軸の地図', '4 quadrants, 2-axis map'), name: T('2 軸での位置づけ', 'position on 2 axes'), steps: T('軸、次に項目', 'axes, then items') },
  { id: 'overlap', label: T('重なり', 'Overlap'), sub: T('ベン図', 'Venn diagram'), name: T('重なり', 'overlap'), steps: T('集合、次に重なり', 'sets, then the overlap') },
  { id: 'correlation', label: T('2 つの量の関係', 'Two quantities'), sub: T('散布図', 'scatter plot'), name: T('2 つの量の関係', 'two quantities'), steps: T('点、次に傾向', 'points, then the trend') },
  { id: 'spread', label: T('ばらつき', 'Spread'), sub: T('ヒストグラム', 'histogram'), name: T('ばらつき', 'spread'), steps: T('全体を一度に', 'whole at once') },
  { id: 'contents', label: T('目次', 'Contents'), sub: T('札の格子', 'grid of cards'), name: T('目次', 'contents'), steps: T('全体を一度に', 'whole at once') },
];
// manifest の札に出す短い名前と小さな字（FALLBACK にない id）。なければ manifest の名前だけ
const EXTRA = {
  ranking: { label: T('順位', 'Ranking'), sub: T('並べ替えた棒', 'sorted bars') },
  grouping: { label: T('まとめる・分ける', 'Grouping'), sub: T('グループの枠', 'groups') },
  'text-structure': { label: T('文章の構造', 'Text structure'), sub: T('傍線・矢印・訓読の順', 'marks, arrows, reading order') },
  parameter: { label: T('パラメータ', 'Parameter'), sub: T('値を動かす', 'vary a value') },
  deviation: { label: T('差・増減', 'Deviation'), sub: T('上下に伸びる棒', 'up and down bars') },
  'concept-links': { label: T('概念のつながり', 'Concept links'), sub: T('概念地図', 'concept map') },
};
// 部品庫 v1.1.0 の部品の言いたいこと（部品庫の README の purposes: と同じ。manifest に purposes がないときだけ使う）
const FALLBACK_COMPONENTS = {
  'm-bars': ['compare', 'ranking', 'change', 'part-whole'], 'm-curves': ['change'], 'm-flow': ['process'], 'm-menu': ['contents'],
  'm-kpi': ['key-number'], 'm-market': ['part-whole'], 'm-quad': ['position'], 'm-sweep': ['parameter'], 'm-seq': ['spread'],
  'm-collect': ['grouping'], 'm-kanbun': ['text-structure'], 'm-kobun': ['text-structure'], 'm-gendai': ['text-structure'], 'm-codetree': ['hierarchy', 'process'],
};
// 表の「パーツ」の欄に添える一言（言いたいこと:部品）
const NOTES = {
  'compare:m-bars': T('順位は並べ替え', 'sorted for ranking'),
  'change:m-bars': T('点が少ないとき', 'few points'),
  'part-whole:m-bars': T('積み上げ', 'stacked'),
  'part-whole:m-market': T('入れ子', 'nested'),
  'hierarchy:m-codetree': T('符号の木だけ', 'code trees only'),
  'process:m-codetree': T('符号の木で復号', 'decoding with a code tree'),
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str2 = (v) => (isObj(v) && typeof v.en === 'string' && typeof v.ja === 'string' ? { en: v.en, ja: v.ja } : null);
const ID = /^[a-z][a-z0-9-]*$/;
const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);

export function purposesFrom(manifest) {
  const comps = isObj(manifest) && isObj(manifest.components) ? Object.values(manifest.components).filter((c) => isObj(c) && typeof c.tag === 'string') : [];
  const variants = Object.fromEntries(comps.map((c) => [c.tag, strs(c.variants)]));
  const raw = isObj(manifest) && Array.isArray(manifest.purposes) ? manifest.purposes : [];
  const byId = Object.fromEntries(FALLBACK.map((p) => [p.id, p]));
  const list = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.ja !== 'string' || typeof r.en !== 'string' || r.reserved === true) continue;
    if (list.some((p) => p.id === r.id)) continue;
    const known = byId[r.id] || EXTRA[r.id] || {};
    const name = { ja: r.ja, en: r.en };
    list.push({ id: r.id, label: known.label || name, sub: known.sub || { ja: '', en: '' }, name, steps: str2(r.steps) || known.steps || { ja: '', en: '' } });
  }
  if (!list.length) {
    const components = {};
    const ids = new Set(FALLBACK.map((p) => p.id));
    for (const [t, ps] of Object.entries(FALLBACK_COMPONENTS)) { const x = ps.filter((id) => ids.has(id)); if (x.length) components[t] = x; }
    return { source: 'fallback', list: FALLBACK, components, variants };
  }
  const ids = new Set(list.map((p) => p.id));
  const components = {};
  for (const c of comps) { const ps = strs(c.purposes).filter((x) => ids.has(x)); if (ps.length) components[c.tag] = ps; }
  return { source: 'manifest', list, components, variants };
}

export function componentsOff(off, P) {
  const offSet = new Set(off || []);
  if (!offSet.size) return [];
  const on = new Set(P.list.map((p) => p.id).filter((id) => !offSet.has(id)));
  return Object.keys(P.components).sort().filter((t) => P.components[t].length && P.components[t].every((id) => !on.has(id)));
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
export function purposesTable(P, parts, lang, src) {
  const L = lang === 'ja' ? 'ja' : 'en';
  const have = new Map(parts.map((c) => [c.tag, c.series]));
  const part = (id, t) => {
    const note = NOTES[`${id}:${t}`];
    const extra = [note && note[L], have.get(t) !== 'common' ? have.get(t) : null].filter(Boolean);
    return '`' + t + '`' + (extra.length ? (L === 'ja' ? `（${extra.join('・')}）` : ` (${extra.join(', ')})`) : '');
  };
  const none = L === 'ja' ? 'まだない：近いパーツか、HTML・インラインの SVG' : 'none yet: the nearest part, or HTML or inline SVG';
  const used = new Set();
  const rows = P.list.map((p) => {
    const ts = Object.keys(P.components).filter((t) => have.has(t) && P.components[t].includes(p.id))
      .sort((a, b) => P.components[a].indexOf(p.id) - P.components[b].indexOf(p.id) || a.localeCompare(b));
    ts.forEach((t) => used.add(t));
    return `| ${cell(p.name[L])} | ${ts.length ? ts.map((t) => part(p.id, t)).join(L === 'ja' ? '、' : ', ') : none} | ${cell(p.steps[L])} |`;
  });
  const rest = parts.map((c) => c.tag).filter((t) => !used.has(t)).sort();
  if (rest.length) rows.push(`| ${L === 'ja' ? 'その他のパーツ' : 'other parts'} | ${rest.map((t) => part('', t)).join(L === 'ja' ? '、' : ', ')} | ${L === 'ja' ? '系列の説明' : 'see the pack'} |`);
  const head = L === 'ja' ? '| 言いたいこと | パーツ（系列のものは系列の名前） | ステップ |\n|---|---|---|' : '| purpose | parts (pack, if not core) | steps |\n|---|---|---|';
  const url = src ? '\n\n' + (L === 'ja' ? `各パーツの説明（版を固定）：${src}<名前>/README.md（名前は \`m-\` を除いたもの）` : `Each part's description (pinned version): ${src}<name>/README.md (the name without \`m-\`)`) : '';
  return head + '\n' + rows.join('\n') + url;
}
