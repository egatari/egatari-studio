// テーマの寸法の宣言（theme.json の metrics。docs/contract.md §12、format spec §6、backlog #76）
// テーマが体裁の箱（本文・結論の行・縦組みの列）を CSS で動かすとき、検査がどこを限りにするかをこの値で知る。
// 描くのは CSS だけ（再生器・実行系は metrics を読まない）。値は 1280×720 の舞台の px
//
//   DEFAULT_METRICS                 今の kit/layouts.css の箱（metrics のないテーマはこれ。限りは今までの 565・680・1236・1162・124・44）
//   applyMetrics(base, raw, name)   → {metrics, declared, warnings}   1 つの層（theme.json）の metrics を親の値（base）に重ねる
//   limitsOf(M)                     → 検査の限り（layout-scan.mjs の中と同じ式。余裕の 6・4 は検査の方針で、metrics では変えない）
//   sameMetrics(a, b)               既定と同じか（知らせに限りの値を添えるかの判断）
//
// 検証：metrics が object でない・v が 1 でない → その層を使わない（親の値）。知らない項目 → 無視。数でない・有限でない・
// 範囲の外（x は 0〜1280、y は 0〜720）→ その項目だけ親の値。互いに合わない（本文の上端が結論の行より下など）→ その層を使わない。
// どれも組み立ての警告（「theme-metrics: …」）で、誤りにはしない。Node の読み込み・fs を使わない（kit/core）

export const METRICS_VERSION = 1;
export const STAGE = Object.freeze({ width: 1280, height: 720 });

export const DEFAULT_METRICS = Object.freeze({
  v: 1,
  body: Object.freeze({ left: 48, right: 48, top: 122, floor: 680, line: 46 }),
  concl: Object.freeze({ top: 571, height: 72 }),
  // tate.rule：layouts.css の縦の見出しの罫は 1166.25px に描かれる（右 48px、43px × 1.25 の列 + padding 10px + 罫 2px）。既定は 1166 のまま
  // （1167 にすると縦組みの右の限りが 1px 動き、既定のテーマの結果が変わる）。ずれの確かめ（layout-scan.mjs の metricsProbe）は、描いた値そのもの
  // （0.01px に丸めただけ）を宣言の値と比べるので、既定のテーマの余裕は 1px の許しに対して 0.25px（1px まるごとではない）。
  // tools/theme-metrics.mjs measure は、塊を写す書き手のために限りが緩くなる側へ外向きに丸めるので、既定のテーマでも 1167 と出す
  tate: Object.freeze({ rule: 1166, conclRight: 120, left: 48, floor: 680 }),
});

// 項目と、その値の範囲（x：横の座標・距離、y：縦の座標・高さ）
export const METRICS_FIELDS = Object.freeze({
  body: { left: 'x', right: 'x', top: 'y', floor: 'y', line: 'h' },
  concl: { top: 'y', height: 'h' },
  tate: { rule: 'x', conclRight: 'x', left: 'x', floor: 'y' },
});
const RANGE = { x: [0, STAGE.width, true], y: [0, STAGE.height, true], h: [0, STAGE.height, false] };   // [下, 上, 下を含むか]

// 余裕（検査の方針。テーマでは変えない）：結論の行の上 6px、横の限りの外 4px
const CONCL_GAP = 6, EDGE = 4;
// 本文の幅の下限（本文が狭すぎる宣言は読み違いとみなす）
const MIN_BODY_WIDTH = 320;

const clone = (m) => ({ v: 1, body: { ...m.body }, concl: { ...m.concl }, tate: { ...m.tate } });
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const show = (x) => { try { return JSON.stringify(x); } catch { return String(x); } };

export function limitsOf(M) {
  return {
    conclBottom: M.concl.top - CONCL_GAP,          // 結論の行があるとき（565）
    floor: M.body.floor,                            // 結論の行がないとき（680）
    right: STAGE.width - M.body.right + EDGE,       // 横組みの右（1236）
    tateFloor: M.tate.floor,                        // 縦組みの地（680）
    tateRight: M.tate.rule - EDGE,                  // 縦組みの見出しの罫の手前（1162）
    tateLeftConcl: M.tate.conclRight + EDGE,        // 縦組みの結論の列の外（124）
    tateLeft: M.tate.left - EDGE,                   // 縦組みで結論のないとき（44）
  };
}

export function sameMetrics(a, b = DEFAULT_METRICS) {
  for (const g of Object.keys(METRICS_FIELDS)) for (const f of Object.keys(METRICS_FIELDS[g])) if (a[g][f] !== b[g][f]) return false;
  return true;
}

// 互いの整合。崩れていれば理由の文字列
function inconsistency(M) {
  if (!(M.body.top < M.concl.top - CONCL_GAP)) return `body.top (${M.body.top}) must be above concl.top − ${CONCL_GAP} (${M.concl.top - CONCL_GAP})`;
  if (!(M.concl.top + M.concl.height <= STAGE.height)) return `concl.top + concl.height (${M.concl.top + M.concl.height}) must be at most ${STAGE.height}`;
  if (!(M.body.top < M.body.floor)) return `body.top (${M.body.top}) must be above body.floor (${M.body.floor})`;
  if (!(M.body.left + MIN_BODY_WIDTH <= STAGE.width - M.body.right)) return `the body must be at least ${MIN_BODY_WIDTH}px wide (body.left ${M.body.left}, body.right ${M.body.right})`;
  if (!(M.tate.conclRight < M.tate.rule)) return `tate.conclRight (${M.tate.conclRight}) must be left of tate.rule (${M.tate.rule})`;
  if (!(M.tate.left < M.tate.rule)) return `tate.left (${M.tate.left}) must be left of tate.rule (${M.tate.rule})`;
  return null;
}

// 1 つの層を重ねる。base は親の値（なければ DEFAULT_METRICS）。raw === undefined（書いていない）なら親のまま
export function applyMetrics(base, raw, name = 'theme') {
  const parent = clone(base || DEFAULT_METRICS);
  const warnings = [];
  const w = (t, tail) => warnings.push(`theme-metrics: theme "${name}": ${t}${tail === undefined ? '' : tail}`);
  if (raw === undefined) return { metrics: parent, declared: false, warnings };
  if (!isObj(raw)) { w(`"metrics" must be an object (got ${show(raw)})`, '; the whole block is ignored and the parent values are used'); return { metrics: parent, declared: false, warnings }; }
  if (raw.v !== METRICS_VERSION) { w(`metrics.v must be ${METRICS_VERSION} (got ${show(raw.v)})`, '; the whole block is ignored and the parent values are used'); return { metrics: parent, declared: false, warnings }; }
  const M = clone(parent);
  for (const g of Object.keys(raw)) {
    if (g === 'v') continue;
    if (!Object.prototype.hasOwnProperty.call(METRICS_FIELDS, g)) { w(`unknown field metrics.${g}`, ' (ignored)'); continue; }
    const grp = raw[g];
    if (!isObj(grp)) { w(`metrics.${g} must be an object (got ${show(grp)})`, '; the parent values are used'); continue; }
    for (const f of Object.keys(grp)) {
      const kind = METRICS_FIELDS[g][f];
      if (!kind) { w(`unknown field metrics.${g}.${f}`, ' (ignored)'); continue; }
      const v = grp[f], [lo, hi, incl] = RANGE[kind];
      if (typeof v !== 'number' || !Number.isFinite(v) || v > hi || (incl ? v < lo : v <= lo)) {
        w(`metrics.${g}.${f} must be a number ${incl ? `from ${lo}` : `above ${lo}`} to ${hi} (stage pixels of 1280×720; got ${show(v)})`, `; the parent value ${parent[g][f]} is used`);
        continue;
      }
      M[g][f] = v;
    }
  }
  const bad = inconsistency(M);
  if (bad) { w(`the values do not fit together: ${bad}`, '; the whole block is ignored and the parent values are used'); return { metrics: parent, declared: false, warnings }; }
  return { metrics: M, declared: true, warnings };
}

// 層を親から順に（[根の親, …, 子]）。どこかの層が有効な metrics を書いていれば declared
export function resolveMetrics(layers) {
  let m = clone(DEFAULT_METRICS), declared = false;
  const warnings = [];
  for (const L of layers || []) {
    const r = applyMetrics(m, L && L.metrics, L && L.name);
    m = r.metrics; declared = declared || r.declared; warnings.push(...r.warnings);
  }
  return { metrics: m, declared, warnings };
}
