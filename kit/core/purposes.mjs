// 言いたいこと（purpose）→ 表し方 → パーツ（backlog #99、handoff/parts-map-2026-10-24.html の 8・9・10）。Node にもブラウザにも依存しない（純粋な ESM）
// 新規作成の「言いたいこと」の札（app/llm.js）と、AI への指示の本体の表（組み立てのときに kit/core/llm-pack-assemble.mjs が作る）が同じ材料を使う。
//
// 札は決めた 14 個（TILES。parts-map の 9 の決定、2026-10-24）。部品庫の manifest は札を増やさない：manifest の purposes の id を札に写す
// （ranking は「比べる」に入る）。札に写らない id（text-structure・parameter・grouping など）は札を作らず、その部品は分野（パーツの組）から入る。
//
// 材料の出どころ：部品庫のリリースの manifest.json（components:update が vendor/components/manifest.json に置く）の
//   purposes：順のある配列 [{id, ja, en, steps: {ja, en}, reserved?}]（reserved が真なら、まだ使う部品がない。札にも表にも使わない）
//   components.<名前>：{tag?, purposes: [id …]（主なものが先）, variants: [名前 …]（0 番目がシード値 0 の見せ方。なければ []）}。tag がなければ 'm-' + 名前
// 形の合わない項目は 1 つずつ落として warnings に書く（全部を捨てない）。札ごとに、写る manifest の id が 1 つもなければ決めた表の文を使う。
// 部品の言いたいことは manifest にあればそれ、なければ部品庫 v1.1.0 の README の purposes:（FALLBACK_COMPONENTS）。
//
//   TILES                               [{id, ids: [manifest の id …], label, sub, name, steps}]（文はどれも {en, ja}）
//   purposesFrom(manifest | null, {vendored?})
//       → {source: 'manifest' | 'fallback', list: 札（TILES の順。name・steps は manifest があればそれ）, components: {タグ: [札の id …]},
//          variants: {タグ: [名前 …]}, unmapped: [札のない manifest の id …], warnings: [文 …]}
//       vendored：組み立てに入る部品のタグ（Set か配列）。あれば、それ以外の部品は components に入れない（写していない部品の名前を AI に出さない）
//   componentsOff(off, P)               外した言いたいこと（札の id）だけに使う部品。並びは名前の順
//   purposesTable(P, parts, lang, src, {exclude, series, off})
//       指示の本体の表（Markdown）。parts：組み立てに入る部品 [{tag, series}]。series：入っている系列（null ならすべて）。
//       外した札の行は出さない。exclude の部品と、入っていない系列の部品は出さない（説明のない部品を指さない）。
//       行に部品がなければ「近い部品か HTML・インラインの SVG」。入っていない系列は、何に使えるかだけを最後の 1 行に（部品の名前は出さない）

const T = (ja, en) => ({ ja, en });
export const TILES = [
  { id: 'compare', ids: ['compare', 'ranking'], label: T('比べる（量・特徴）', 'Compare (amounts, features)'), sub: T('棒・並べた棒・比べる図', 'bars, sorted bars, comparison'), name: T('量を比べる', 'compare amounts'), steps: T('1 つの組、次に差', 'one group, then the difference') },
  { id: 'change', ids: ['change'], label: T('変化', 'Change'), sub: T('折れ線・縦棒', 'line, columns'), name: T('時間での変化', 'change over time'), steps: T('線を 1 本ずつ', 'one line at a time') },
  { id: 'part-whole', ids: ['part-whole'], label: T('内訳', 'Part of a whole'), sub: T('積み上げ棒・円・入れ子の円', 'stacked bars, pie, nested circles'), name: T('全体と内訳', 'part of a whole'), steps: T('全体を一度に', 'whole at once') },
  { id: 'key-number', ids: ['key-number'], label: T('数字を見せる', 'Key number'), sub: T('大きな数字', 'big number'), name: T('1 つの大事な数字', 'one key number'), steps: T('全体を一度に', 'whole at once') },
  { id: 'process', ids: ['process'], label: T('手順', 'Steps'), sub: T('流れ図', 'flow chart'), name: T('手順・工程', 'steps of a process'), steps: T('1 段ずつ', 'one step at a time') },
  { id: 'timeline', ids: ['timeline'], label: T('年表・予定', 'Timeline'), sub: T('年表', 'timeline'), name: T('年表・予定', 'timeline'), steps: T('出来事を 1 つずつ', 'one event at a time') },
  { id: 'cause-effect', ids: ['cause-effect'], label: T('原因と結果', 'Cause and effect'), sub: T('特性要因図', 'fishbone'), name: T('原因と結果', 'cause and effect'), steps: T('原因、次に結果', 'causes, then the effect') },
  { id: 'cycle', ids: ['cycle'], label: T('循環', 'Cycle'), sub: T('サイクル', 'cycle'), name: T('循環', 'cycle'), steps: T('段階を 1 つずつ', 'one stage at a time') },
  { id: 'hierarchy', ids: ['hierarchy'], label: T('階層・分類', 'Hierarchy'), sub: T('木', 'tree'), name: T('階層・分類', 'hierarchy'), steps: T('上から下へ', 'top down') },
  { id: 'position', ids: ['position'], label: T('位置づけ', 'Position'), sub: T('4 象限・2 軸の地図', '4 quadrants, 2-axis map'), name: T('2 軸での位置づけ', 'position on 2 axes'), steps: T('軸、次に項目', 'axes, then items') },
  { id: 'overlap', ids: ['overlap'], label: T('重なり', 'Overlap'), sub: T('ベン図', 'Venn diagram'), name: T('重なり', 'overlap'), steps: T('集合、次に重なり', 'sets, then the overlap') },
  { id: 'correlation', ids: ['correlation'], label: T('2 つの量の関係', 'Two quantities'), sub: T('散布図', 'scatter plot'), name: T('2 つの量の関係', 'two quantities'), steps: T('点、次に傾向', 'points, then the trend') },
  { id: 'spread', ids: ['spread'], label: T('ばらつき', 'Spread'), sub: T('ヒストグラム', 'histogram'), name: T('ばらつき', 'spread'), steps: T('全体を一度に', 'whole at once') },
  { id: 'contents', ids: ['contents'], label: T('目次', 'Contents'), sub: T('札の格子', 'grid of cards'), name: T('目次', 'contents'), steps: T('全体を一度に', 'whole at once') },
];
export const FALLBACK = TILES;
// manifest の id → 札の id
const TILE_OF = Object.fromEntries(TILES.flatMap((t) => t.ids.map((id) => [id, t.id])));
// 部品庫 v1.1.0 の部品の言いたいこと（部品庫の README の purposes: と同じ。manifest にその部品の purposes がないときに使う）
const FALLBACK_COMPONENTS = {
  'm-bars': ['compare', 'ranking', 'change', 'part-whole'], 'm-curves': ['change'], 'm-flow': ['process'], 'm-menu': ['contents'],
  'm-kpi': ['key-number'], 'm-market': ['part-whole'], 'm-quad': ['position'], 'm-sweep': ['parameter'], 'm-seq': ['spread'],
  'm-collect': ['grouping'], 'm-kanbun': ['text-structure'], 'm-kobun': ['text-structure'], 'm-gendai': ['text-structure'], 'm-codetree': ['hierarchy', 'process'],
};
// 表の「パーツ」の欄に添える一言（札:部品）
const NOTES = {
  'compare:m-bars': T('順位は並べ替え', 'sorted for ranking'),
  'change:m-bars': T('点が少ないとき', 'few points'),
  'part-whole:m-bars': T('積み上げ', 'stacked'),
  'part-whole:m-market': T('入れ子', 'nested'),
  'hierarchy:m-codetree': T('符号の木だけ', 'code trees only'),
  'process:m-codetree': T('符号の木で復号', 'decoding with a code tree'),
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str2 = (v) => (isObj(v) && typeof v.en === 'string' && v.en.trim() && typeof v.ja === 'string' && v.ja.trim() ? { en: v.en, ja: v.ja } : null);
const ID = /^[a-z][a-z0-9-]*$/;
const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
const uniq = (a) => [...new Set(a)];

export function purposesFrom(manifest, { vendored = null } = {}) {
  const warnings = [];
  const keep = vendored ? new Set(vendored) : null;
  // 部品：tag がなければ 'm-' + 名前（部品庫の release.mjs と同じ決め方）
  const comps = isObj(manifest) && isObj(manifest.components) ? Object.entries(manifest.components).filter(([, c]) => isObj(c)).map(([dir, c]) => ({ ...c, tag: typeof c.tag === 'string' ? c.tag : 'm-' + dir })) : [];
  const variants = Object.fromEntries(comps.filter((c) => !keep || keep.has(c.tag)).map((c) => [c.tag, strs(c.variants)]));
  // purposes：1 つずつ確かめる
  const ok = {};
  const unmapped = [];
  const raw = isObj(manifest) ? manifest.purposes : undefined;
  if (raw !== undefined && !Array.isArray(raw)) warnings.push('manifest.json: purposes is not an array (the decided table is used)');
  (Array.isArray(raw) ? raw : []).forEach((r, i) => {
    const bad = !isObj(r) ? 'not an object' : typeof r.id !== 'string' || !ID.test(r.id) ? 'id is not a lowercase id' : typeof r.ja !== 'string' || typeof r.en !== 'string' ? 'ja or en is not a string' : ok[r.id] ? 'duplicate id' : null;
    if (bad) { warnings.push(`manifest.json: purposes[${i}] dropped (${bad})`); return; }
    if (r.reserved) return;
    if (!TILE_OF[r.id]) { unmapped.push(r.id); return; }
    ok[r.id] = { name: { ja: r.ja, en: r.en }, steps: str2(r.steps) };
  });
  for (const id of unmapped) warnings.push(`manifest.json: purpose "${id}" has no tile; its parts come only through their subject part set`);
  const any = Object.keys(ok).length > 0;
  const list = TILES.map((t) => {
    const m = t.ids.map((id) => ok[id]).find(Boolean);   // 札の主な id から
    return m ? { ...t, name: m.name, steps: m.steps || t.steps } : t;
  });
  // 部品の言いたいこと → 札
  const components = {};
  const tags = uniq([...Object.keys(FALLBACK_COMPONENTS), ...comps.map((c) => c.tag)]);
  for (const tag of tags) {
    if (keep && !keep.has(tag)) continue;
    const c = comps.find((x) => x.tag === tag);
    const ids = c && Array.isArray(c.purposes) ? strs(c.purposes) : FALLBACK_COMPONENTS[tag] || [];
    const tiles = uniq(ids.map((id) => TILE_OF[id]).filter(Boolean));
    if (tiles.length) components[tag] = tiles;
  }
  return { source: any ? 'manifest' : 'fallback', list, components, variants, unmapped, warnings };
}

export function componentsOff(off, P) {
  const offSet = new Set(off || []);
  if (!offSet.size) return [];
  const on = new Set(P.list.map((p) => p.id).filter((id) => !offSet.has(id)));
  return Object.keys(P.components).sort().filter((t) => P.components[t].length && P.components[t].every((id) => !on.has(id)));
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
// hidden：入っているが、この版（無料版）では読み込まない部品。名前は出さず、行は「この文にはない」にする
export function purposesTable(P, parts, lang, src, { exclude = [], series = null, off = [], hidden = [] } = {}) {
  const L = lang === 'ja' ? 'ja' : 'en';
  const ex = new Set(exclude), offs = new Set(off);
  const inPack = (c) => c.series === 'common' || !series || series.includes(c.series);
  const usable = parts.filter((c) => !ex.has(c.tag));
  const here = new Map(usable.filter(inPack).map((c) => [c.tag, c.series]));
  const elsewhere = usable.filter((c) => !inPack(c));
  const part = (id, t) => {
    const note = NOTES[`${id}:${t}`];
    const extra = [note && note[L], here.get(t) !== 'common' ? here.get(t) : null].filter(Boolean);
    return '`' + t + '`' + (extra.length ? (L === 'ja' ? `（${extra.join('・')}）` : ` (${extra.join(', ')})`) : '');
  };
  const none = L === 'ja' ? 'まだない：近いパーツか、HTML・インラインの SVG' : 'none yet: the nearest part, or HTML or inline SVG';
  const notHere = L === 'ja' ? 'この文にはない：近いパーツか、HTML・インラインの SVG' : 'not in this text: the nearest part, or HTML or inline SVG';
  const serves = (t, id) => (P.components[t] || []).includes(id);
  const order = (id) => (a, b) => P.components[a].indexOf(id) - P.components[b].indexOf(id) || a.localeCompare(b);
  const used = new Set();
  const rows = [];
  for (const p of P.list) {
    if (offs.has(p.id)) continue;
    const ts = [...here.keys()].filter((t) => serves(t, p.id)).sort(order(p.id));
    ts.forEach((t) => used.add(t));
    const cellText = ts.length ? ts.map((t) => part(p.id, t)).join(L === 'ja' ? '、' : ', ') : elsewhere.some((c) => serves(c.tag, p.id)) || hidden.some((t) => serves(t, p.id)) ? notHere : none;
    rows.push(`| ${cell(p.name[L])} | ${cellText} | ${cell(p.steps[L])} |`);
  }
  const rest = [...here.keys()].filter((t) => !used.has(t)).sort();
  if (rest.length) rows.push(`| ${L === 'ja' ? 'その他のパーツ' : 'other parts'} | ${rest.map((t) => part('', t)).join(L === 'ja' ? '、' : ', ')} | ${L === 'ja' ? 'その説明のとおり' : 'as described'} |`);
  const head = L === 'ja' ? '| 言いたいこと | パーツ（系列のものは系列の名前） | ステップ |\n|---|---|---|' : '| purpose | parts (pack, if not core) | steps |\n|---|---|---|';
  // 入っていない系列：何に使えるかだけ（部品の名前は出さない。説明のない部品の属性を AI に推させない）
  const packs = uniq(elsewhere.map((c) => c.series)).sort().map((s) => {
    const what = uniq(elsewhere.filter((c) => c.series === s).flatMap((c) => (P.components[c.tag] || []).filter((id) => !offs.has(id))))
      .map((id) => P.list.find((p) => p.id === id)).filter(Boolean).map((p) => p.name[L]);
    if (!what.length) what.push(L === 'ja' ? '教科のパーツ' : 'subject parts');
    return L === 'ja' ? `${s}（${what.join('・')}）` : `${s} (${what.join(', ')})`;
  });
  const other = packs.length ? '\n\n' + (L === 'ja'
    ? `入っていない系列にもパーツがある：${packs.join('、')}。使わない。合いそうなら、どの系列が要るかを 1 行のメモで伝える`
    : `Packs not included here have parts for: ${packs.join('; ')}. Do not use them; if one would fit, name the pack in a one-line note.`) : '';
  const url = src ? '\n\n' + (L === 'ja' ? `各パーツの説明（版を固定）：${src}<名前>/README.md（名前は \`m-\` を除いたもの）` : `Each part's description (pinned version): ${src}<name>/README.md (the name without \`m-\`)`) : '';
  return head + '\n' + rows.join('\n') + other + url;
}
