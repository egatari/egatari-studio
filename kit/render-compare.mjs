// 同じ状態を 2 回描いた画面を比べる（決定性・入り直したときの戻り・品質チェックの「呼び出し順に依存」が共通で使う）
//   1. まず部品の DOM を比べる（部品の木を文字列にしたもの。shadow DOM も含める。何もそろえない：バイトまで同じかどうか）
//   2. DOM がバイトまで同じで、違いが NOISE_BOUNDS の内側（下の説明）なら、描き方の揺れ（アンチエイリアス）として成功。必ず知らせを出す（kind noise）
//   3. DOM が同じでも、NOISE_BOUNDS の外の違いは失敗（kind pixels）
//   4. DOM が違うとき、部品に比べる DOM がない（canvas・video・iframe などを含む）ときは、揺れの許しはなく、今までの基準
//      （はっきり違う画素が LEGACY_TOL 以下）のまま（kind dom / legacy）。部品庫の部品には、見えない要素の属性が呼び出し順で残るもの
//      （m-cycle の隠れた矢じりの transform、m-codetree の style の書き方 "fill:x;" と "fill: x;"。画素は同じ）があり、今までどおり通す
// 理由：Linux の Chrome（SwiftShader）は同じ SVG を何度も描き直すと途中で描き方を切り替え、曲線の縁のアンチエイリアスが 45〜72 px ずれる
// （CI の実行 40245997855：tree・venn・numberline。部品の DOM はバイトまで同じ）。画素の数だけの基準（40）ではこれを拾ってしまう

// 描き方の揺れとして許す範囲。どれか 1 つでも外れたら失敗（本当の描き違いを隠さないための枠）：
//   strong  ：はっきり違う画素・色の段差のしきい値（RGB の差の和。今までの基準と同じ 48）
//   edgePx  ：はっきり違う画素は、どれも A か B のどちらかで、その画素から edgePx 以内に色の段差（図形の縁）がある。アンチエイリアスは縁の
//             1 px の帯にしか出ないので 1（その画素自身は見ないので、平らなところに点が 1 つ出ても縁とはみなさない）
//   boxPad  ：はっきり違う画素は、どれも部品の箱（getBoundingClientRect）を boxPad px 広げた中にある（部品の外の違いは部品の揺れでない）
//   capFrac ：はっきり違う画素の数は、部品の箱の面積（画面の中の部分の和集合）の capFrac 以下。CI で見た揺れは最大 72 px で、
//             部品の箱（およそ 1100×420 px）の 0.016 %。0.1 % はその約 6 倍
//   capPx   ：同じく、どんな大きな部品でも capPx 以下。72 px の約 3 倍。15×15 px の塗りが 1 つ変われば超える
export const NOISE_BOUNDS = Object.freeze({ strong: 48, edgePx: 1, boxPad: 2, capFrac: 0.001, capPx: 200 });
// DOM が違うとき・比べる DOM がないときの、今までの基準（はっきり違う画素の数）
export const LEGACY_TOL = 40;

export const noiseCap = (area, b = NOISE_BOUNDS) => Math.min(b.capPx, Math.floor(area * b.capFrac));

// RGBA の 2 枚（同じ大きさ）の違い：{exact, n（はっきり違う画素の数）, off（そのうち縁から edgePx より遠いもの）,
//   out（そのうち rects を pad 広げた箱のどれにも入らないもの。rects がなければ 0）, box（違う画素を囲む箱）, area（画面の面積）}
// （この関数はブラウザの中でも動かすので、外の名前を使わない）
export function diffStats(da, db, w, h, o = {}) {
  const strong = o.strong ?? 48, r = o.edgePx ?? 1, pad = o.pad ?? 0, rects = o.rects || null;
  let n = 0, off = 0, out = 0, any = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const edgeNear = (d, x, y) => {
    let l0 = 255, l1 = 255, l2 = 255, h0 = 0, h1 = 0, h2 = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
        if (xx === x && yy === y) continue;
        const j = (yy * w + xx) * 4;
        if (d[j] < l0) l0 = d[j]; if (d[j] > h0) h0 = d[j];
        if (d[j + 1] < l1) l1 = d[j + 1]; if (d[j + 1] > h1) h1 = d[j + 1];
        if (d[j + 2] < l2) l2 = d[j + 2]; if (d[j + 2] > h2) h2 = d[j + 2];
      }
    }
    return (h0 - l0) + (h1 - l1) + (h2 - l2) > strong;
  };
  const inRects = (x, y) => rects.some((q) => x >= q[0] - pad && x <= q[2] + pad && y >= q[1] - pad && y <= q[3] + pad);
  for (let p = 0, N = w * h; p < N; p++) {
    const j = p * 4;
    const s = Math.abs(da[j] - db[j]) + Math.abs(da[j + 1] - db[j + 1]) + Math.abs(da[j + 2] - db[j + 2]);
    if (!s && da[j + 3] === db[j + 3]) continue;
    any++;
    const x = p % w, y = (p - x) / w;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    if (s > strong) {
      n++;
      if (!edgeNear(da, x, y) && !edgeNear(db, x, y)) off++;
      if (rects && !inRects(x, y)) out++;
    }
  }
  return { exact: any === 0, n, off, out, box: any ? [x0, y0, x1, y1] : null, area: w * h };
}

// 判定：{same, kind（exact | noise | pixels | dom | legacy）, cap}
//   sa・sb：snapshot の結果（{dom, rects, area}）。dom が null（比べる DOM がない）か snapshot がないときは今までどおり画素だけ
//   stats は rects を渡して作ったもの（compareRenders）
export function judgeRenders(stats, sa, sb, b = NOISE_BOUNDS) {
  if (stats.exact) return { same: true, kind: 'exact', cap: 0 };
  if (!sa || !sb || sa.dom == null || sb.dom == null) return { same: stats.n <= LEGACY_TOL, kind: 'legacy', cap: LEGACY_TOL };
  if (sa.dom !== sb.dom) return { same: stats.n <= LEGACY_TOL, kind: 'dom', cap: LEGACY_TOL };
  const cap = noiseCap(sa.area, b);
  return stats.n <= cap && stats.off === 0 && stats.out === 0 ? { same: true, kind: 'noise', cap } : { same: false, kind: 'pixels', cap };
}

// 結果を 1 行で（成功の知らせにも失敗の説明にも使う）
export function describeRender(r) {
  if (r.kind === 'exact') return 'pixel-identical';
  const box = r.box ? ` in ${JSON.stringify(r.box)}` : '';
  if (r.kind === 'legacy') return `${r.n} pixel(s) clearly differ${box}; no component DOM to compare (canvas etc.)${r.same ? ` (within ${r.cap}, ok)` : ` (more than ${r.cap})`}`;
  if (r.kind === 'dom') return `${r.n} pixel(s) clearly differ${box}; component DOM differs, so no renderer-noise allowance${r.same ? ` (within ${r.cap}, ok)` : ` (more than ${r.cap})`}`;
  const why = [r.off ? `${r.off} away from any edge` : '', r.out ? `${r.out} outside the component` : ''].filter(Boolean).join(', ');
  const where = why || `all within ${NOISE_BOUNDS.edgePx} px of an edge, inside the component`;
  return `${r.n} pixel(s) clearly differ${box}, ${where}; component DOM byte-identical; cap ${r.cap} (${(NOISE_BOUNDS.capFrac * 100).toFixed(1)} % of the component area ${r.compArea} px, at most ${NOISE_BOUNDS.capPx})${r.same ? ' -> accepted as renderer anti-aliasing noise' : ''}`;
}

// ブラウザの中で 2 枚の PNG（base64）を読み、diffStats をかける
const STATS_IN_PAGE = new Function('args', `const diffStats = ${diffStats.toString()};
return (async ([a, b, o]) => {
  const load = (s) => new Promise((r, e) => { const im = new Image(); im.onload = () => r(im); im.onerror = e; im.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { exact: false, n: Infinity, off: Infinity, out: Infinity, box: null, area: ia.width * ia.height };
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
  g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
  return diffStats(da, db, c.width, c.height, o);
})(args);`);

// 画素の比べ方（PNG の Buffer 2 枚。rects：部品の箱 [[x0, y0, x1, y1] …]）：diffStats の結果
export async function pixelStats(page, A, B, rects = null, b = NOISE_BOUNDS) {
  if (A.equals(B)) return { exact: true, n: 0, off: 0, out: 0, box: null, area: 0 };
  return page.evaluate(STATS_IN_PAGE, [A.toString('base64'), B.toString('base64'), { strong: b.strong, edgePx: b.edgePx, pad: b.boxPad, rects }]);
}

// 2 回の描画を比べる（sa・sb は domSnapshot の結果。A・B は画面の左上から撮ったもの）：diffStats ＋ judgeRenders ＋ {note, compArea}
export async function compareRenders(page, A, B, sa, sb) {
  const st = await pixelStats(page, A, B, sa && sa.dom != null ? sa.rects : null);
  const r = { ...st, ...judgeRenders(st, sa, sb), compArea: sa ? sa.area : 0 };
  r.note = describeRender(r);
  return r;
}

// 部品の写し：{dom（部品の木の文字列。shadow DOM も含め、何もそろえない。比べる DOM のない部品があれば null）,
//   rects（部品の箱。画面の中に切ったもの）, area（箱の和集合の面積。画面の外は数えない）}
// opts：{i}（DECK.slides[i] の部品）か {sel}（CSS セレクター）
const SNAPSHOT_IN_PAGE = ({ i, sel }) => {
  const roots = sel ? [...document.querySelectorAll(sel)] : DECK.slides[i]._comps;
  const OPAQUE = new Set(['canvas', 'video', 'iframe', 'object', 'embed']);
  let opaque = false;
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(JSON.stringify(n.data)); return; }
    if (n.nodeType === 8) { out.push('<!--' + n.data + '-->'); return; }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.nodeType === 1) {
      const tag = n.localName;
      if (OPAQUE.has(tag)) opaque = true;
      out.push('<' + tag + [...n.attributes].map((a) => ' ' + a.name + '=' + JSON.stringify(a.value)).join('') + '>');
      if (n.shadowRoot) { out.push('#shadow-root('); n.shadowRoot.childNodes.forEach(walk); out.push(')'); }
    }
    n.childNodes.forEach(walk);
    if (n.nodeType === 1) out.push('</' + n.localName + '>');
  };
  roots.forEach((r) => { walk(r); out.push('\n'); });
  const W = innerWidth, H = innerHeight;
  const rects = roots.map((r) => r.getBoundingClientRect())
    .map((q) => [Math.max(0, Math.floor(q.left)), Math.max(0, Math.floor(q.top)), Math.min(W - 1, Math.ceil(q.right) - 1), Math.min(H - 1, Math.ceil(q.bottom) - 1)])
    .filter((q) => q[2] >= q[0] && q[3] >= q[1]);
  // 和集合の面積：部品の数は少ないので、行ごとに区間をまとめる
  let area = 0;
  for (let y = 0; y < H; y++) {
    const iv = rects.filter((q) => y >= q[1] && y <= q[3]).map((q) => [q[0], q[2]]).sort((a, b) => a[0] - b[0]);
    let e = -1;
    for (const [a, b] of iv) { if (b <= e) continue; area += b - Math.max(a, e + 1) + 1; e = b; }
  }
  return { dom: opaque ? null : out.join(''), rects, area };
};
export const domSnapshot = (page, opts) => page.evaluate(SNAPSHOT_IN_PAGE, typeof opts === 'number' ? { i: opts } : opts);

// 揺れとして通した比べを数える（試験の終わりにまとめて出す）
export function noiseLog() {
  const items = [];
  return {
    add(where, r) { if (r.kind === 'noise') items.push(`${where}: ${r.n} px (cap ${r.cap})`); },
    get count() { return items.length; },
    summary(label = 'renderer-noise acceptances') { return `${label}: ${items.length}${items.length ? '\n  ' + items.join('\n  ') : ''}`; },
  };
}
