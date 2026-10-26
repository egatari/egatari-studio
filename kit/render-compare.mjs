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
//   boxPad  ：はっきり違う画素は、どれも部品の箱（getBoundingClientRect）を boxPad px 広げた中にある（部品の外の違いは部品の揺れでない）。
//             ただし、スライド全体の DOM も同じ（属性の並び・空の class・style の書き方だけはそろえる）なら、スライドの箱の中の、部品の箱の外の違いも、ほかと同じ規則（縁・数・わずかな点）で許す
//   capFrac ：はっきり違う画素の数は、部品の箱の面積（画面の中の部分の和集合）の capFrac 以下。CI で見た揺れは最大 72 px で、
//             部品の箱（およそ 1100×420 px）の 0.016 %。0.1 % はその約 6 倍
//   capPx   ：同じく、どんな大きな部品でも capPx 以下。72 px の約 3 倍。15×15 px の塗りが 1 つ変われば超える
//   offMax・offMaxCh：縁から遠い画素は、ばらばら（互いに隣り合わない）で offMax 個まで、どれも色の差が各チャンネル offMaxCh/255 以下なら許す
//             （部品の箱の中に限る。macOS の CI で m-cycle の DOM がバイトまで同じなのに、縁から遠い 2 px がわずかに違った）。
//             消えた点・字の画素は色の差が大きいか、隣り合って並ぶので通らない
export const NOISE_BOUNDS = Object.freeze({ strong: 48, edgePx: 1, boxPad: 2, capFrac: 0.001, capPx: 200, offMax: 4, offMaxCh: 24 });
// DOM が違うとき・比べる DOM がないときの、今までの基準（はっきり違う画素の数）
export const LEGACY_TOL = 40;

export const noiseCap = (area, b = NOISE_BOUNDS) => Math.min(b.capPx, Math.floor(area * b.capFrac));

// RGBA の 2 枚（同じ大きさ）の違い：{exact, n（はっきり違う画素の数）, off（そのうち縁から edgePx より遠いもの）,
//   offPts（その画素の [x, y, 各チャンネルの差の最大] を 64 個まで）,
//   out（そのうち rects を pad 広げた箱のどれにも入らないもの。rects がなければ 0）,
//   far（そのうち outer（スライドの箱）にも入らないもの。outer がなければ out と同じ）, box（違う画素を囲む箱）, area（画面の面積）}
// （この関数はブラウザの中でも動かすので、外の名前を使わない）
export function diffStats(da, db, w, h, o = {}) {
  const strong = o.strong ?? 48, r = o.edgePx ?? 1, pad = o.pad ?? 0, rects = o.rects || null, outer = o.outer || null;
  let n = 0, off = 0, out = 0, far = 0, any = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const offPts = [];
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
      if (!edgeNear(da, x, y) && !edgeNear(db, x, y)) {
        off++;
        if (offPts.length < 64) offPts.push([x, y, Math.max(Math.abs(da[j] - db[j]), Math.abs(da[j + 1] - db[j + 1]), Math.abs(da[j + 2] - db[j + 2]))]);
      }
      if (rects && !inRects(x, y)) { out++; if (!outer || !(x >= outer[0] && x <= outer[2] && y >= outer[1] && y <= outer[3])) far++; }
    }
  }
  return { exact: any === 0, n, off, out, far, offPts, box: any ? [x0, y0, x1, y1] : null, area: w * h };
}

// 判定：{same, kind（exact | noise | pixels | dom | legacy）, cap}
//   sa・sb：snapshot の結果（{dom, rects, area}）。dom が null（比べる DOM がない）か snapshot がないときは今までどおり画素だけ
//   stats は rects を渡して作ったもの（compareRenders）
//   部品の箱の外の違い（out）は、部品の DOM がバイトまで同じうえに、スライド全体の DOM（slideDom。属性の並び・空の class・style の書き方だけはそろえたもの）も同じで、スライドの箱の中（far が 0）のときだけ、
//   ほかの違いと同じ規則（縁・数）で許す（Windows の CI で、見出しの字の縁の 1 px が部品の箱の外で揺れた。部品の箱の外は部品の DOM では説明できないので、
//   スライドの DOM が同じことを条件にする）
export function judgeRenders(stats, sa, sb, b = NOISE_BOUNDS) {
  if (stats.exact) return { same: true, kind: 'exact', cap: 0 };
  if (!sa || !sb || sa.dom == null || sb.dom == null) return { same: stats.n <= LEGACY_TOL, kind: 'legacy', cap: LEGACY_TOL };
  if (sa.dom !== sb.dom) return { same: stats.n <= LEGACY_TOL, kind: 'dom', cap: LEGACY_TOL };
  const cap = noiseCap(sa.area, b);
  const faint = faintOff(stats, b);
  const outOk = stats.out === 0 || (sa.slideDom != null && sa.slideDom === sb.slideDom && stats.far === 0);
  return stats.n <= cap && outOk && (stats.off === 0 || faint)
    ? { same: true, kind: 'noise', cap, faint: stats.off, outside: stats.out || 0 } : { same: false, kind: 'pixels', cap, faint: 0, outside: 0 };
}
// 縁から遠い画素が、許す範囲（offMax 個まで・ばらばら・色の差が各チャンネル offMaxCh 以下）に収まるか
export function faintOff(stats, b = NOISE_BOUNDS) {
  const P = stats.offPts || [];
  if (!stats.off || stats.off > b.offMax || P.length !== stats.off) return false;
  if (P.some((q) => q[2] > b.offMaxCh)) return false;
  for (let a = 0; a < P.length; a++) for (let c = a + 1; c < P.length; c++) if (Math.max(Math.abs(P[a][0] - P[c][0]), Math.abs(P[a][1] - P[c][1])) <= 1) return false;
  return true;
}

// 結果を 1 行で（成功の知らせにも失敗の説明にも使う）
export function describeRender(r) {
  if (r.kind === 'exact') return 'pixel-identical';
  const box = r.box ? ` in ${JSON.stringify(r.box)}` : '';
  if (r.kind === 'legacy') return `${r.n} pixel(s) clearly differ${box}; no component DOM to compare (canvas etc.)${r.same ? ` (within ${r.cap}, ok)` : ` (more than ${r.cap})`}`;
  if (r.kind === 'dom') return `${r.n} pixel(s) clearly differ${box}; component DOM differs, so no renderer-noise allowance${r.same ? ` (within ${r.cap}, ok)` : ` (more than ${r.cap})`}`;
  const why = [r.off && !r.same ? `${r.off} away from any edge (first [x, y, max channel diff]: ${JSON.stringify((r.offPts || []).slice(0, 4))})` : '', r.out && !r.same ? `${r.out} outside the component${r.far ? ` (${r.far} outside the slide)` : ''}${r.slideSame === false ? ', slide DOM differs' : ''}` : ''].filter(Boolean).join(', ');
  const faint = r.same && r.off ? `; ${r.off} isolated faint pixel(s) away from edges (each channel <= ${NOISE_BOUNDS.offMaxCh}/255, at most ${NOISE_BOUNDS.offMax})` : '';
  const outside = r.same && r.out ? ` (${r.out} outside the component box but inside the slide, whose DOM is identical too)` : '';
  const where = why || `all within ${NOISE_BOUNDS.edgePx} px of an edge${faint}, inside the component${outside}`;
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
export async function pixelStats(page, A, B, rects = null, b = NOISE_BOUNDS, outer = null) {
  if (A.equals(B)) return { exact: true, n: 0, off: 0, out: 0, far: 0, box: null, area: 0 };
  return page.evaluate(STATS_IN_PAGE, [A.toString('base64'), B.toString('base64'), { strong: b.strong, edgePx: b.edgePx, pad: b.boxPad, rects, outer }]);
}

// 2 回の描画を比べる（sa・sb は domSnapshot の結果。A・B は画面の左上から撮ったもの）：diffStats ＋ judgeRenders ＋ {note, compArea}
export async function compareRenders(page, A, B, sa, sb) {
  const st = await pixelStats(page, A, B, sa && sa.dom != null ? sa.rects : null, NOISE_BOUNDS, sa && sa.slideRect ? sa.slideRect : null);
  const r = { ...st, ...judgeRenders(st, sa, sb), compArea: sa ? sa.area : 0, slideSame: sa && sb && sa.slideDom != null ? sa.slideDom === sb.slideDom : undefined };
  r.note = describeRender(r);
  return r;
}

// スライド全体の DOM を比べるときの属性のそろえ方（これだけ）：属性の並び（名前の順にする）・空の class（なくす）・style の空白と宣言の順
// （宣言ごとに「名前: 値」、値の中の空白の並びは 1 つ、括弧の内側と , の前後の空白はなくし、宣言を名前の順に）。ほかの違い（値・属性の有無・class の中身）はそのまま残る。
// 実行系は段階の表示で属性を足す順が呼び出し順で変わるので、スライド全体はこの形で比べる（部品の DOM はバイトのまま）
// （この関数はブラウザの中でも動かすので、外の名前を使わない）
export function canonAttrs(attrs) {
  const style = (v) => v.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const c = d.indexOf(':');
    if (c < 0) return d.replace(/\s+/g, ' ');
    const val = d.slice(c + 1).trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    return d.slice(0, c).trim() + ': ' + val;
  }).sort().join('; ');
  return attrs.filter(([k, v]) => !(k === 'class' && v.trim() === ''))
    .map(([k, v]) => [k, k === 'style' ? style(v) : v])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// 部品の写し：{dom（部品の木の文字列。shadow DOM も含め、何もそろえない。比べる DOM のない部品があれば null）,
//   rects（部品の箱。画面の中に切ったもの）, area（箱の和集合の面積。画面の外は数えない）}
// opts：{i}（DECK.slides[i] の部品）か {sel}（CSS セレクター）
const SNAPSHOT_IN_PAGE = ({ i, sel }) => {
  const roots = sel ? [...document.querySelectorAll(sel)] : DECK.slides[i]._comps;
  const OPAQUE = new Set(['canvas', 'video', 'iframe', 'object', 'embed']);
  let opaque = false;
  let out = [], canon = false;
  // canon（スライド全体のときだけ）：canonAttrs（属性の並び・空の class・style の空白と宣言の順だけをそろえる）
  const attrs = (n) => { const A = [...n.attributes].map((a) => [a.name, a.value]); return canon ? canonAttrs(A) : A; };
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(JSON.stringify(n.data)); return; }
    if (n.nodeType === 8) { out.push('<!--' + n.data + '-->'); return; }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.nodeType === 1) {
      const tag = n.localName;
      if (OPAQUE.has(tag)) opaque = true;
      out.push('<' + tag + attrs(n).map(([k, v]) => ' ' + k + '=' + JSON.stringify(v)).join('') + '>');
      if (n.shadowRoot) { out.push('#shadow-root('); n.shadowRoot.childNodes.forEach(walk); out.push(')'); }
    }
    n.childNodes.forEach(walk);
    if (n.nodeType === 1) out.push('</' + n.localName + '>');
  };
  roots.forEach((r) => { walk(r); out.push('\n'); });
  const dom = opaque ? null : out.join('');
  // スライド全体（部品の箱の外の違いを許すかどうかに使う）
  let slideDom, slideRect;
  if (!sel) {
    const sl = DECK.slides[i];
    out = []; opaque = false; canon = true; walk(sl); canon = false;
    slideDom = opaque ? null : out.join('');
    const q = sl.getBoundingClientRect();
    slideRect = [Math.max(0, Math.floor(q.left)), Math.max(0, Math.floor(q.top)), Math.min(innerWidth - 1, Math.ceil(q.right) - 1), Math.min(innerHeight - 1, Math.ceil(q.bottom) - 1)];
  }
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
  return { dom, rects, area, slideDom, slideRect };
};
const SNAPSHOT_FN = new Function('args', `const canonAttrs = ${canonAttrs.toString()};\nreturn (${SNAPSHOT_IN_PAGE.toString()})(args);`);
export const domSnapshot = (page, opts) => page.evaluate(SNAPSHOT_FN, typeof opts === 'number' ? { i: opts } : opts);

// 揺れとして通した比べを数える（試験の終わりにまとめて出す）
export function noiseLog() {
  const items = [];
  return {
    add(where, r) {
      if (r.kind !== 'noise') return;
      const plat = typeof process !== 'undefined' ? process.platform : '?';
      items.push({ faint: r.faint || 0, s: `[${plat}] ${where}: ${r.n} px (cap ${r.cap})${r.faint ? `, ${r.faint} isolated faint off-edge px` : ''}${r.outside ? `, ${r.outside} outside the component box (slide DOM identical)` : ''}` });
    },
    get count() { return items.length; },
    get faintCount() { return items.filter((x) => x.faint).length; },
    summary(label = 'renderer-noise acceptances') {
      const f = items.filter((x) => x.faint).length;
      const plat = typeof process !== 'undefined' ? process.platform : '?';
      return `${label} [${plat}]: ${items.length} (of which ${f} with isolated faint off-edge pixels)${items.length ? '\n  ' + items.map((x) => x.s).join('\n  ') : ''}`;
    },
  };
}
