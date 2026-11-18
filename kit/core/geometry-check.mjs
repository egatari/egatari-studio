// 描いた図の形の点検（backlog #201、R-geometry。handoff/v0.6.11-check-sketch-2026-11-12.md の 1）。品質チェックのコマンド版（kit/check.mjs）と
// 編集アプリのプレビュー（app/frame-shim.js）が同じこの関数を使う（体裁の検査 kit/core/layout-scan.mjs と同じ入れ方）
//
// 部品は描いた要素に印（札）を付けるだけで、測るのはここ 1 か所：
//   箱   形の要素そのもの（<rect>・<path>・<ellipse>・<polygon>・<circle>）に data-part="box"・data-part-id。形の中かは isPointInFill で測る
//   辺   <g data-part="edge" data-part-id data-part-from data-part-to>。線そのもの（<line> か <path>）に data-part-line（矢じりは除く）。1 つの辺に線が 2 本のこともある。
//        端（from・to）は箱の id か点（mark）の id（点から字への引き出し線。handoff #45 の決定 2）。端が点なら、その点の字と、その点を中に持つ箱は、この辺の通過・横切りの相手にしない
//   字   <text data-part="label" data-part-id=<持ち主> data-part-of="box|edge|mark">。縁取りがあれば data-part-halo、箱の外に置く字は data-part-at="outside"。
//        foreignObject の字は中身を Range で測る
//   点   data-part="mark"（m-quad の点。<g transform> の中の <circle cx=0 cy=0> でも getBoundingClientRect で測る）。字の障害物
//   @ で始まる端（@spine・@moved など）は節でない
//   わざと重ねる所：要素そのものか祖先の <g> に o.overlap の印（data-overlap="ok"、kit/core/layout-scan.mjs の OVERLAP_ATTR。handoff #45 の決定 3）。
//        その要素が関わる重なりの知らせ（geoEdgeThroughBox・geoLineOverLabel・geoLabelOverlap）を出さない。値は "ok" だけ。箱の縁を越える字（geoLabelOutsideBox）は重なりでないので外さない
//   枠の中（handoff #46。属性の名前は WITHIN_ATTRS の 1 か所）：図形に data-within="名前"、枠に data-frame="名前"。名前は 1 つ（[a-z][a-z0-9-]*）。宣言した図形だけを、ステップごとに測る（geometrySteps）
//   図の端で欠ける線（handoff #52）：印は要らない。インラインの SVG（作成者の図もパーツの図も）の線のある形の要素を、ステップごとに測る（geometrySteps）
//
//   geometryScan(s, o) → [{code, sev, a}]   s：最終段階まで出したスライドの <section>。o = {bands, dflt, overlap, within, frame, clip}
//     bands  字体ごとの字の範囲（kit/core/text-band.mjs の TEXT_BANDS。{字体の名前: {up, down}}、em）
//     dflt   表にない字体だけの字の範囲（DEFAULT_BAND）
//     overlap わざと重ねる印の属性の名前（OVERLAP_ATTR）。なければ外さない
//     within・frame  枠の中の印の属性の名前（WITHIN_ATTRS）
//     clip   わざと切る印の属性の名前（kit/core/layout-scan.mjs の CLIP_ATTR）。その中の形は図の端で欠けても知らせない
//     o.mode === 'step' のときだけ、今の表示で測る 1 段階分を返す：枠の外に出た図形（geoOutsideFrame）と図の端で欠ける線（geoClippedStroke）
//     縦書きのスライド（layout-tate）は測らない（[] を返す。数は geometryTate）
//   geometrySteps(s, o, seek, scan) → null | [{code: 'geoOutsideFrame', sev, a: {shape, frame, step, px, at, steps}} | {code: 'geoClippedStroke', sev, a: {shape, side, px, stroke, step, steps}}]
//     スライドの全部のステップ（0 … s._max。static は 0 だけ）を seek(k) で出し、scan（= geometryScan）を o.mode = 'step' で呼ぶ（2 つの検査で 1 回だけ歩く）。
//     測るものがない（枠の中の印も、線のある形の入った SVG もない）スライドは歩かずに null。
//     図形（と枠）ごとに 1 つ：いちばん大きく出た・欠けたステップ（step。結論のステップは 'concl'）とその値（px ほか）と、出た・欠けたステップの一覧（steps）。
//     最後のステップだけでは途中のはみ出しを逃す（backlog #91 の分裂期の染色体）。終わった後の表示は呼ぶ側が戻す
//   geometryTate(slides, o) → n   縦横が混ざる教材で、測らなかった縦書きのスライドのうち印のあるものの数（geoTateSlides）。
//     中身のスライド（表紙・章の扉を除く）がみな縦書きなら 0（そのときは決まりの台帳が R-geometry を skipped/tate にする。kit/core/check-rules.mjs の factsFromSource の allTate と同じ数え方）
//
// 座標はスライドの座標（1280×720。拡大率で割る）。
// 字の範囲：横は実際の字体での送り幅（SVG の <text> は getExtentOfChar、HTML の字は Range.getClientRects）、縦は基線から上 up・下 down（em。字体ごとの表）。
//   基線：SVG の <text> は getStartPositionOfChar（その字の基線上の点。tspan の y・dy も含む）を getScreenCTM でスライドの座標に直す。
//   HTML の字（foreignObject の中身）は Range の矩形の上端 ＋ 字体の ascent（canvas の fontBoundingBoxAscent。矩形の高さ = ascent ＋ descent で拡大率をそろえる）
// 余裕：線の太さの半分 ＋ 2px は重なりとみなさない（端が箱の縁に触れるのは正しい図）。字どうし・字と箱の縁は 2px
//
// この関数は文字列にしてページに入れる（check.mjs は page.evaluate、編集アプリは仲立ちの文字列に埋める）。
// だから外の名前を使わない（中だけで閉じる）。閉じるタグと HTML の注釈の始まりを書かない（tools/build-app.mjs が確かめる）

// 枠の中の印の名前（仕様 §8.4 Marks for geometry checks）。呼ぶ側が o.within・o.frame として渡す（kit/core/layout-scan.mjs の GEO_OPTS）
export const WITHIN_ATTRS = Object.freeze({ within: 'data-within', frame: 'data-frame' });

export function geometryScan(s, o) {
  const out = [];
  if (!s || s.classList.contains('layout-tate')) return out;
  const BANDS = (o && o.bands) || {}, DFLT = (o && o.dflt) || { up: 0.86, down: 0.26 };
  const SEL = (v) => '[data-part="' + v + '"]';
  const STEP = !!(o && o.mode === 'step'), WA = (o && o.within) || '', FA = (o && o.frame) || '', OV = (o && o.overlap) || '', CL = (o && o.clip) || '';
  const WITHIN = STEP && !!WA && !!FA && !!s.querySelector('[' + WA + ']'), EDGE = STEP && !!s.querySelector('svg');
  if (STEP ? !WITHIN && !EDGE : !s.querySelector([SEL('box'), SEL('edge'), SEL('label'), SEL('mark')].join(','))) return out;
  const sr = s.getBoundingClientRect();
  const k = sr.width / 1280 || 1;
  const SX = (x) => (x - sr.left) / k, SY = (y) => (y - sr.top) / k;
  const box = (r) => ({ l: SX(r.left), t: SY(r.top), r: SX(r.right), b: SY(r.bottom) });
  const rnd = (v) => Math.round(v);
  const rr = (q) => [rnd(q.l), rnd(q.t), rnd(q.r), rnd(q.b)];
  const add = (sev, code, a) => out.push({ code, sev, a });
  const TOL = 2;

  // 字体の並び → 字の範囲（kit/core/text-band.mjs の textBand と同じ決め方：並びの中で表にある字体の最も広いもの、なければ dflt）
  const bandOf = (ff) => {
    const known = String(ff || '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).map((n) => BANDS[n]).filter(Boolean);
    if (!known.length) return DFLT;
    return { up: Math.max.apply(null, known.map((b) => b.up)), down: Math.max.apply(null, known.map((b) => b.down)) };
  };
  // 見えているか（最終段階で隠れたままの要素・透明な要素は測らない）
  const shown = (el) => {
    if (getComputedStyle(el).visibility !== 'visible') return false;
    for (let e = el; e && e !== s; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.display === 'none' || parseFloat(st.opacity) === 0) return false;
    }
    return true;
  };
  // 比べる範囲：同じ図の中だけ（いちばん近いパーツの要素、なければいちばん外の <svg>、なければスライド）
  const rootOf = (el) => {
    let svg = null;
    for (let e = el; e && e !== s; e = e.parentElement) {
      if (e.localName.indexOf('-') > 0) return e;
      if (e.localName === 'svg') svg = e;
    }
    return svg || s;
  };
  // 要素の座標（ユーザー座標）→ スライドの座標
  const mapper = (el) => {
    const m = el.getScreenCTM && el.getScreenCTM();
    if (!m) return null;
    return { m, sc: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / k, pt: (x, y) => ({ x: SX(m.a * x + m.c * y + m.e), y: SY(m.b * x + m.d * y + m.f) }) };
  };
  const strokeOf = (el, M) => { const w = parseFloat(getComputedStyle(el).strokeWidth); return (isFinite(w) ? w : 1) * (M ? M.sc : 1); };
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  // わざと重ねる印（data-overlap="ok"）：要素そのものか、スライドの中の祖先の <g>
  const okOverlap = (el) => {
    if (!OV) return false;
    for (let e = el; e && e !== s; e = e.parentElement) if ((e === el || e.localName === 'g') && e.getAttribute(OV) === 'ok') return true;
    return false;
  };

  // 形の要素の輪郭（getTotalLength・getPointAtLength でスライドの座標 step px ごと、8〜2000 点）。測れなければ []
  const outline = (el, step) => {
    const M = mapper(el);
    if (!M) return [];
    let len = 0;
    try { len = el.getTotalLength(); } catch (e) { len = 0; }
    if (!(len > 0)) return [];
    const n = Math.min(2000, Math.max(8, Math.ceil(len * M.sc / step)));
    const pts = [];
    for (let i = 0; i <= n; i++) { const p = el.getPointAtLength(len * i / n); pts.push(M.pt(p.x, p.y)); }
    return pts;
  };
  // 点から折れ線（閉じた輪郭）のいちばん近い点 {x, y, d}
  const nearRing = (ring, x, y) => {
    let best = { x, y, d: Infinity };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
      const qx = a.x + dx * t, qy = a.y + dy * t, d = Math.hypot(x - qx, y - qy);
      if (d < best.d) best = { x: qx, y: qy, d };
    }
    return best;
  };
  const toRing = (ring, x, y) => nearRing(ring, x, y).d;
  // 矩形の周りの点（4px ごと）
  const rectRing = (q) => {
    const pts = [], w = q.r - q.l, h = q.b - q.t, n = Math.max(1, Math.ceil(w / 4)), m = Math.max(1, Math.ceil(h / 4));
    for (let i = 0; i <= n; i++) { const x = q.l + w * i / n; pts.push({ x, y: q.t }, { x, y: q.b }); }
    for (let j = 1; j < m; j++) { const y = q.t + h * j / m; pts.push({ x: q.l, y }, { x: q.r, y }); }
    return pts;
  };

  // ---------------------------------------------------------------- 箱
  const boxes = [];
  if (!STEP) for (const el of s.querySelectorAll(SEL('box'))) {
    if (!shown(el)) continue;
    const q = box(el.getBoundingClientRect());
    if (q.r - q.l <= 0 || q.b - q.t <= 0) continue;
    const M = mapper(el);
    let inv = null;
    if (M && typeof el.isPointInFill === 'function') { try { inv = M.m.inverse(); } catch (e) { inv = null; } }
    boxes.push({ el, id: el.getAttribute('data-part-id') || '', root: rootOf(el), q, inv, sw: strokeOf(el, M), ok: okOverlap(el) });
  }
  // 点（スライドの座標）が箱の内側に tol より深く入っているか：点とそのまわり 8 方向の tol の点がみな箱の形の中
  // （形は isPointInFill。ひし形の <polygon>・楕円・角の丸い <rect> も形どおり。形を測れない要素は外接矩形）
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
  const inFillOf = (b, px, py) => {
    const cx = sr.left + px * k, cy = sr.top + py * k, m = b.inv;
    try { return b.el.isPointInFill(new DOMPoint(m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f)); } catch (e) { return true; }
  };
  const deepIn = (b, x, y, tol) => {
    if (x <= b.q.l + tol || x >= b.q.r - tol || y <= b.q.t + tol || y >= b.q.b - tol) return false;
    if (!b.inv) return true;
    if (!inFillOf(b, x, y)) return false;
    for (const d of DIRS) if (!inFillOf(b, x + d[0] * tol, y + d[1] * tol)) return false;
    return true;
  };

  // ---------------------------------------------------------------- 辺（線ごとの折れ線、スライドの座標）
  const LINE = 'line,path,polyline,polygon';
  const edges = [];
  if (!STEP) for (const g of s.querySelectorAll(SEL('edge'))) {
    if (!shown(g)) continue;
    const id = g.getAttribute('data-part-id') || '', from = g.getAttribute('data-part-from') || '', to = g.getAttribute('data-part-to') || '';
    const els = g.matches(LINE) && g.hasAttribute('data-part-line') ? [g] : [...g.querySelectorAll('[data-part-line]')].filter((x) => x.matches(LINE));
    const lines = [];
    for (const el of els) {
      if (!shown(el)) continue;
      const M = mapper(el);
      if (!M) continue;
      let pts = [];
      if (el.localName === 'line') {
        pts = [M.pt(el.x1.baseVal.value, el.y1.baseVal.value), M.pt(el.x2.baseVal.value, el.y2.baseVal.value)];
      } else {
        // path などは getTotalLength・getPointAtLength で折れ線に近似（スライドの座標で 4px ごと、多くても 2000 点）
        let len = 0;
        try { len = el.getTotalLength(); } catch (e) { len = 0; }
        if (!(len > 0)) continue;
        const n = Math.min(2000, Math.max(2, Math.ceil(len * M.sc / 4)));
        for (let i = 0; i <= n; i++) { const p = el.getPointAtLength(len * i / n); pts.push(M.pt(p.x, p.y)); }
      }
      lines.push({ el, pts, tol: strokeOf(el, M) / 2 + TOL, ok: okOverlap(el) });
    }
    if (lines.length) edges.push({ el: g, id, from, to, root: rootOf(g), lines, ok: okOverlap(g) });
  }
  // 折れ線を 2px ごとの点に細かくする（箱の通過を見る）
  const dense = (pts) => {
    const outp = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let j = 1; j <= n; j++) outp.push({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n });
    }
    return outp;
  };

  // ---------------------------------------------------------------- 字の範囲（行ごとの矩形、スライドの座標）
  let cv = null;
  const ascentOf = (st) => {
    if (!cv) cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    cv.font = st.fontStyle + ' ' + st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
    const m = cv.measureText('Hg');
    return { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent };
  };
  const svgTextRects = (el) => {
    const M = mapper(el);
    let n = 0;
    try { n = el.getNumberOfChars(); } catch (e) { n = 0; }
    if (!M || !n) return [];
    const st = getComputedStyle(el), bd = bandOf(st.fontFamily);
    let fs = parseFloat(st.fontSize) || 0;
    for (const t of el.querySelectorAll('tspan')) fs = Math.max(fs, parseFloat(getComputedStyle(t).fontSize) || 0);
    // 字の番号は空白をまとめた後の字（既定の白空白の扱い）。数が合えば空白の字を除く
    const norm = (el.textContent || '').replace(/[\n\t]/g, ' ').replace(/ {2,}/g, ' ').trim();
    const chars = norm.length === n ? norm : null;
    const lines = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      if (chars && /\s/.test(chars[i])) continue;
      let p, x;
      try { p = el.getStartPositionOfChar(i); x = el.getExtentOfChar(i); } catch (e) { continue; }
      if (!x.width) continue;
      // 同じ基線で続く字は 1 行。基線が変わるか、1 字より大きく離れたら次の行
      if (cur && Math.abs(p.y - cur.y) < 0.5 && x.x <= cur.r + fs && x.x + x.width >= cur.l - fs) { cur.l = Math.min(cur.l, x.x); cur.r = Math.max(cur.r, x.x + x.width); }
      else { cur = { y: p.y, l: x.x, r: x.x + x.width }; lines.push(cur); }
    }
    return lines.map((ln) => {
      const ps = [M.pt(ln.l, ln.y - bd.up * fs), M.pt(ln.r, ln.y - bd.up * fs), M.pt(ln.l, ln.y + bd.down * fs), M.pt(ln.r, ln.y + bd.down * fs)];
      return { l: Math.min.apply(null, ps.map((q) => q.x)), r: Math.max.apply(null, ps.map((q) => q.x)), t: Math.min.apply(null, ps.map((q) => q.y)), b: Math.max.apply(null, ps.map((q) => q.y)) };
    });
  };
  const htmlTextRects = (el) => {
    const rs = [], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rg = document.createRange();
    let nd;
    while ((nd = tw.nextNode())) {
      if (!/\S/.test(nd.textContent) || !shown(nd.parentElement)) continue;
      const st = getComputedStyle(nd.parentElement), bd = bandOf(st.fontFamily), fm = ascentOf(st), fs = parseFloat(st.fontSize) || 0;
      rg.selectNodeContents(nd);
      for (const r of rg.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        const sc = fm.asc + fm.desc > 0 ? r.height / (fm.asc + fm.desc) : k;
        const base = r.top + fm.asc * sc;
        rs.push({ l: SX(r.left), r: SX(r.right), t: SY(base - bd.up * fs * sc), b: SY(base + bd.down * fs * sc) });
      }
    }
    return rs;
  };
  const textRects = (el) => {
    if (el.localName === 'text' && typeof el.getNumberOfChars === 'function') return svgTextRects(el);
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.localName !== 'foreignObject') {
      const ts = [...el.querySelectorAll('text')];
      if (ts.length) return ts.reduce((a, t) => a.concat(shown(t) ? svgTextRects(t) : []), []);
    }
    return htmlTextRects(el);
  };

  // ---------------------------------------------------------------- 0. 図形が枠の外に出る（geoOutsideFrame の 1 段階分。o.mode === 'step'。handoff #46）
  // 図形（data-within="名前"）の輪郭の点が、同じ名前の枠（data-frame="名前"）の形の中にあるかを、今の表示で測る。
  //   図形の点：形の要素（SVGGeometryElement）は輪郭を getTotalLength・getPointAtLength で 2px ごと（多くても 2000 点）。<g> なら中の見えている形の要素と字の全部。
  //     字は字の範囲（上の textRects。R-geometry の text-band と同じ値）の周り。HTML の要素は外接矩形の周り
  //   枠：形の要素なら isPointInFill（楕円・円・多角形も形どおり）と、輪郭の折れ線までの距離。そのほか（<g>・HTML）は外接矩形
  //   はみ出しの量：点が枠の外なら枠の輪郭までの距離。図形の線の太さの半分を足し、枠の線の太さの半分を引く（線どうしが重なって描けているなら中）。2px までは中とみなす
  //   同じ名前の枠が同じ図（rootOf）にいくつもあれば、いちばんよく収まる枠と比べる（表のマスなど）。同じ図になければスライドの中から。見えている枠がなければ測らない
  const GEOM = 'path,rect,circle,ellipse,line,polyline,polygon';
  const NOT_DRAWN = 'defs,clipPath,mask,marker,pattern,symbol';
  const halfPaint = (el) => {
    const st = getComputedStyle(el);
    if (st.stroke === 'none' || parseFloat(st.strokeOpacity) === 0) return 0;
    return strokeOf(el, mapper(el)) / 2;
  };
  // ---------------------------------------------------------------- 0'. 図形の線が図の端で欠ける（geoClippedStroke の 1 段階分。o.mode === 'step'。handoff #52）
  // インラインの SVG の、線（stroke）の見える形の要素（<rect>・<circle>・<ellipse>・<line>・<polyline>・<polygon>・<path>。字は svgTextOut が見る）ごとに、
  // 描いた範囲（形の外接矩形を線の太さの半分だけ広げたもの。スライドの座標）を、その形を切る範囲（祖先の <svg> のうち overflow が visible でないものの見える範囲。
  // 外側の <svg> は箱、中の <svg> は x・y・width・height。軸ごと）と比べる。overflow が visible の <svg>（属性でも CSS でも）は切らないので見ない。
  //   描いた範囲：変形が回転・傾きのない（ふつうの）形は getBBox の角を getScreenCTM で写し、線の太さの半分を足す。回転した形は輪郭（outline）の点の外接矩形。
  //     開いた線（<line>・<polyline>・z のない <path>）は輪郭の点を法線の向きにだけ線の太さの半分ずらす（butt の端は長さの向きに出ない。round・square の端は出る）
  //   知らせるのは「事故の形」：どこかの辺で 1px より多く欠け、かつ描いた範囲の 9 割以上が見える範囲の中（大半が外の飾りは知らせない）。
  //     9 割は面積の割合（軸ごとの重なりの割合の積）。太さのない向き（水平・垂直の線の太さの向き）は割合に入れない（端に沿う線は、太さの半分が欠けても長さは中）
  //   測らないもの：線のない形（塗りだけの背景は端からはみ出させることが多い）・見えない形・defs など描かれない所・KaTeX・目印の重ね（svg.marks）・
  //     わざと切る印（o.clip）の中・clip-path か mask の付いた形（とその祖先）・data-overlap="ok"（要素そのものか祖先の <g>）
  //   1 つの形の値：side（左右上下の欠けた量、1px 以下は 0）・px（いちばん大きい量）・stroke（形そのものは中にあり、線の太さの分だけ欠ける）
  const clippedStrokes = () => {
    const SVGNS = 'http://www.w3.org/2000/svg';
    const SKIP = NOT_DRAWN + ',text,.katex,svg.marks' + (CL ? ',[' + CL + ']' : '');
    const CUT = 1, SHARE = 0.9;
    // <svg> の見える範囲（{l, t, r, b, x, y}。x・y はその軸で切るか）。切らないか、大きさがなければ null
    const vps = new Map();
    const viewport = (e) => {
      if (vps.has(e)) return vps.get(e);
      let v = null;
      const st = getComputedStyle(e), x = st.overflowX !== 'visible', y = st.overflowY !== 'visible';
      if (x || y) {
        const p = e.parentElement, outer = !p || p.namespaceURI !== SVGNS || p.localName === 'foreignObject';
        let q = null;
        if (outer) q = box(e.getBoundingClientRect());
        else {
          const M = mapper(p);
          if (M) {
            const X = e.x.baseVal.value, Y = e.y.baseVal.value, W = e.width.baseVal.value, H = e.height.baseVal.value;
            const c = [M.pt(X, Y), M.pt(X + W, Y), M.pt(X, Y + H), M.pt(X + W, Y + H)];
            q = { l: Math.min.apply(null, c.map((a) => a.x)), r: Math.max.apply(null, c.map((a) => a.x)), t: Math.min.apply(null, c.map((a) => a.y)), b: Math.max.apply(null, c.map((a) => a.y)) };
          }
        }
        if (q && q.r - q.l > 0 && q.b - q.t > 0) v = Object.assign(q, { x, y });
      }
      vps.set(e, v);
      return v;
    };
    // 形を切る範囲：祖先の <svg> の見える範囲を重ねたもの（外側の <svg> まで）。どれも切らなければ null
    const clipOf = (el) => {
      let q = null;
      for (let e = el.parentElement; e && e !== s; e = e.parentElement) {
        if (e.localName !== 'svg' || e.namespaceURI !== SVGNS) continue;
        const v = viewport(e);
        if (v) {
          if (!q) q = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity, x: false, y: false };
          if (v.x) { q.l = Math.max(q.l, v.l); q.r = Math.min(q.r, v.r); q.x = true; }
          if (v.y) { q.t = Math.max(q.t, v.t); q.b = Math.min(q.b, v.b); q.y = true; }
        }
        const p = e.parentElement;
        if (!p || p.namespaceURI !== SVGNS || p.localName === 'foreignObject') break;
      }
      return q;
    };
    const cutBy = (el) => {
      for (let e = el; e && e !== s; e = e.parentElement) {
        const st = getComputedStyle(e);
        if ((st.clipPath && st.clipPath !== 'none') || (st.maskImage && st.maskImage !== 'none')) return true;
        if (e.localName === 'svg' && (!e.parentElement || e.parentElement.namespaceURI !== SVGNS)) break;
      }
      return false;
    };
    const bbOf = (pts) => ({ l: Math.min.apply(null, pts.map((p) => p.x)), r: Math.max.apply(null, pts.map((p) => p.x)), t: Math.min.apply(null, pts.map((p) => p.y)), b: Math.max.apply(null, pts.map((p) => p.y)) });
    const grow = (q, w) => ({ l: q.l - w, t: q.t - w, r: q.r + w, b: q.b + w });
    const seen = {};
    for (const el of s.querySelectorAll(GEOM)) {
      const tag = el.localName;
      seen[tag] = (seen[tag] || 0) + 1;
      const nth = seen[tag];
      if (el.namespaceURI !== SVGNS || el.closest(SKIP) || okOverlap(el)) continue;
      const C = clipOf(el);
      if (!C) continue;
      const st = getComputedStyle(el);
      if (st.stroke === 'none' || parseFloat(st.strokeOpacity) === 0 || !(parseFloat(st.strokeWidth) > 0)) continue;
      const M = mapper(el);
      if (!M) continue;
      let bb;
      try { bb = el.getBBox(); } catch (e) { continue; }
      // 線の太さの半分（スライドの座標）。non-scaling-stroke は画面の px
      const w = (st.vectorEffect === 'non-scaling-stroke' ? parseFloat(st.strokeWidth) / k : strokeOf(el, M)) / 2;
      const g0 = bbOf([M.pt(bb.x, bb.y), M.pt(bb.x + bb.width, bb.y), M.pt(bb.x, bb.y + bb.height), M.pt(bb.x + bb.width, bb.y + bb.height)]);
      // 端から離れた形は細かく測らない（回転した形の外接矩形は実際より大きいので、離れていればなお離れている。square の端の斜めの角まで見て 1.5 倍）
      const w2 = w * 1.5;
      if ((!C.x || (g0.l - w2 - C.l > CUT && C.r - g0.r - w2 > CUT)) && (!C.y || (g0.t - w2 - C.t > CUT && C.b - g0.b - w2 > CUT))) continue;
      if (!shown(el) || cutBy(el)) continue;
      const rot = Math.abs(M.m.b) > 1e-6 || Math.abs(M.m.c) > 1e-6;
      const open = tag === 'line' || tag === 'polyline' || (tag === 'path' && !/z/i.test(el.getAttribute('d') || ''));
      let g = g0, p;
      if (!open) {
        if (rot) { const pts = outline(el, 4); if (pts.length) g = bbOf(pts); }
        p = grow(g, w);
      } else {
        const pts = tag === 'line' ? [M.pt(el.x1.baseVal.value, el.y1.baseVal.value), M.pt(el.x2.baseVal.value, el.y2.baseVal.value)] : outline(el, 4);
        if (pts.length < 2) continue;
        g = bbOf(pts);
        const ps = [], cap = st.strokeLinecap;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y);
          if (!(L > 0)) continue;
          const tx = (b.x - a.x) / L, ty = (b.y - a.y) / L, nx = -ty * w, ny = tx * w, q = pts[i];
          ps.push({ x: q.x + nx, y: q.y + ny }, { x: q.x - nx, y: q.y - ny });
          const end = i === 0 ? -1 : i === pts.length - 1 ? 1 : 0;
          if (end && cap === 'round') ps.push({ x: q.x - w, y: q.y }, { x: q.x + w, y: q.y }, { x: q.x, y: q.y - w }, { x: q.x, y: q.y + w });
          if (end && cap === 'square') { const ex = end * tx * w, ey = end * ty * w; ps.push({ x: q.x + ex + nx, y: q.y + ey + ny }, { x: q.x + ex - nx, y: q.y + ey - ny }); }
        }
        if (!ps.length) continue;
        p = bbOf(ps);
      }
      const side = { left: C.x ? C.l - p.l : 0, right: C.x ? p.r - C.r : 0, top: C.y ? C.t - p.t : 0, bottom: C.y ? p.b - C.b : 0 };
      const worst = Math.max(side.left, side.right, side.top, side.bottom);
      if (!(worst > CUT)) continue;
      const share = (a0, a1, c0, c1, thin) => (thin || a1 - a0 <= 0 ? 1 : Math.max(0, Math.min(a1, c1) - Math.max(a0, c0)) / (a1 - a0));
      const inside = share(p.l, p.r, C.l, C.r, !C.x || g.r - g.l < 1) * share(p.t, p.b, C.t, C.b, !C.y || g.b - g.t < 1);
      if (inside < SHARE) continue;
      // 形そのもの（線の太さを除く）は見える範囲の中か（中なら線だけが欠ける）
      const geo = Math.max(C.x ? C.l - g.l : 0, C.x ? g.r - C.r : 0, C.y ? C.t - g.t : 0, C.y ? g.b - C.b : 0);
      for (const kk of Object.keys(side)) side[kk] = side[kk] > CUT ? rnd(side[kk]) : 0;
      add('warn', 'geoClippedStroke', { shape: el.getAttribute('data-part-id') || el.id || tag + '#' + nth, side, px: rnd(worst), stroke: geo <= CUT });
    }
  };

  if (WITHIN) {
    const shapePts = (el) => {
      const pts = [];
      const geo = (g) => { const w = halfPaint(g); for (const p of outline(g, 2)) pts.push({ x: p.x, y: p.y, w }); };
      const txt = (t) => { for (const r of textRects(t)) for (const p of rectRing(r)) pts.push({ x: p.x, y: p.y, w: 0 }); };
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.localName !== 'svg') {
        if (el.matches(GEOM)) geo(el);
        else if (el.localName === 'text' || el.localName === 'foreignObject') txt(el);
        else {
          for (const g of el.querySelectorAll(GEOM)) if (shown(g) && !g.closest(NOT_DRAWN)) geo(g);
          for (const t of el.querySelectorAll('text,foreignObject')) if (shown(t) && !t.parentElement.closest('text,foreignObject')) txt(t);
        }
      } else for (const p of rectRing(box(el.getBoundingClientRect()))) pts.push({ x: p.x, y: p.y, w: 0 });
      return pts;
    };
    const frameOf = (el) => {
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && typeof el.isPointInFill === 'function') {
        const M = mapper(el);
        let inv = null;
        try { inv = M && M.m.inverse(); } catch (e) { inv = null; }
        const ring = outline(el, 2);
        if (inv && ring.length > 2) {
          return {
            half: halfPaint(el),
            inside: (x, y) => { const cx = sr.left + x * k, cy = sr.top + y * k; try { return el.isPointInFill(new DOMPoint(inv.a * cx + inv.c * cy + inv.e, inv.b * cx + inv.d * cy + inv.f)); } catch (e) { return true; } },
            dist: (x, y) => toRing(ring, x, y),
          };
        }
      }
      const q = box(el.getBoundingClientRect());
      return {
        half: 0,
        inside: (x, y) => x >= q.l && x <= q.r && y >= q.t && y <= q.b,
        dist: (x, y) => (x >= q.l && x <= q.r && y >= q.t && y <= q.b ? Math.min(x - q.l, q.r - x, y - q.t, q.b - y) : Math.hypot(Math.max(q.l - x, 0, x - q.r), Math.max(q.t - y, 0, y - q.b))),
      };
    };
    // 名前は 1 つだけ（[a-z][a-z0-9-]*）。並べた名前・大文字・空などの値は、data-part の知らない値と同じく印でないとみなして測らない（枠の側も同じ値でしか合わない）
    const NAME = /^[a-z][a-z0-9-]*$/;
    const all = [...s.querySelectorAll('[' + WA + ']')];
    all.forEach((el, n) => {
      const name = el.getAttribute(WA) || '';
      if (!NAME.test(name) || !shown(el)) return;
      const sel = '[' + FA + '="' + name + '"]';
      const root = rootOf(el);
      let fs = [...s.querySelectorAll(sel)].filter((f) => f !== el && !el.contains(f) && shown(f));
      const near = fs.filter((f) => rootOf(f) === root);
      if (near.length) fs = near;
      if (!fs.length) return;
      const pts = shapePts(el);
      if (!pts.length) return;
      let best = null;
      for (const f of fs) {
        const F = frameOf(f);
        let worst = -Infinity, at = null;
        for (const p of pts) {
          let v;
          if (F.inside(p.x, p.y)) { if (p.w - F.half <= TOL) continue; v = p.w - F.half - F.dist(p.x, p.y); }
          else v = F.dist(p.x, p.y) + p.w - F.half;
          if (v > worst) { worst = v; at = p; }
        }
        if (!best || worst < best.worst) best = { worst, at };
        if (best.worst <= TOL) break;
      }
      if (best && best.worst > TOL) {
        add('warn', 'geoOutsideFrame', { shape: el.getAttribute('data-part-id') || el.id || el.localName + '#' + (n + 1), frame: name, px: rnd(best.worst), at: [rnd(best.at.x), rnd(best.at.y)] });
      }
    });
  }
  if (STEP) {
    if (EDGE) clippedStrokes();
    return out;
  }

  const labels = [];
  for (const el of s.querySelectorAll(SEL('label'))) {
    if (!shown(el)) continue;
    const rs = textRects(el);
    if (!rs.length) continue;
    labels.push({ el, id: el.getAttribute('data-part-id') || '', of: el.getAttribute('data-part-of') || '', outside: el.getAttribute('data-part-at') === 'outside', halo: el.hasAttribute('data-part-halo'), t: textOf(el), root: rootOf(el), rs, ok: okOverlap(el) });
  }
  const marks = [];
  for (const el of s.querySelectorAll(SEL('mark'))) {
    if (!shown(el)) continue;
    const q = box(el.getBoundingClientRect());
    if (q.r - q.l > 0 && q.b - q.t > 0) marks.push({ el, id: el.getAttribute('data-part-id') || '', root: rootOf(el), q, ok: okOverlap(el) });
  }
  // 辺の端が点（mark）のとき：その点の字と、その点を中に持つ箱は、この辺の相手にしない（点から字への引き出し線。handoff #45 の決定 2）
  for (const E of edges) {
    const ends = marks.filter((Mk) => Mk.root === E.root && Mk.id && (Mk.id === E.from || Mk.id === E.to));
    E.markIds = ends.map((Mk) => Mk.id);
    E.inBoxes = boxes.filter((B) => B.root === E.root && ends.some((Mk) => deepIn(B, (Mk.q.l + Mk.q.r) / 2, (Mk.q.t + Mk.q.b) / 2, 0)));
  }
  const meet = (a, b, tol) => {
    const q = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
    return q.r - q.l > tol && q.b - q.t > tol ? q : null;
  };

  // ---------------------------------------------------------------- 1. 辺が元でも先でもない箱の内側を通る（geoEdgeThroughBox）
  for (const E of edges) {
    if (E.ok) continue;
    for (const B of boxes) {
      if (B.root !== E.root || B.id === E.from || B.id === E.to || B.ok || E.inBoxes.includes(B)) continue;
      let seg = null;
      for (const L of E.lines) {
        if (L.ok) continue;
        let first = null, last = null;
        for (const p of dense(L.pts)) {
          if (deepIn(B, p.x, p.y, L.tol)) { if (!first) first = p; last = p; }
          else if (first) break;
        }
        if (first) { seg = [rnd(first.x), rnd(first.y), rnd(last.x), rnd(last.y)]; break; }
      }
      if (seg) add('warn', 'geoEdgeThroughBox', { edge: E.id, from: E.from, to: E.to, box: B.id, seg });
    }
  }

  // ---------------------------------------------------------------- 2. 線が字の範囲を横切る（geoLineOverLabel）。自分の辺の字は除く。縁取り（halo）のある字は情報
  // 線分と矩形の交わり（Liang–Barsky）：交わる区間の中点か null
  const clip = (a, b, q) => {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const P = [-dx, dx, -dy, dy], Q = [a.x - q.l, q.r - a.x, a.y - q.t, q.b - a.y];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    const tm = (t0 + t1) / 2;
    return { x: a.x + dx * tm, y: a.y + dy * tm };
  };
  for (const E of edges) {
    if (E.ok) continue;
    for (const Lb of labels) {
      if (Lb.root !== E.root || Lb.ok || (Lb.of === 'edge' && Lb.id === E.id) || (Lb.of === 'mark' && E.markIds.includes(Lb.id)) || E.el.contains(Lb.el)) continue;
      let at = null;
      for (const L of E.lines) {
        if (L.ok) continue;
        for (const r of Lb.rs) {
          const q = { l: r.l + L.tol, t: r.t + L.tol, r: r.r - L.tol, b: r.b - L.tol };
          if (q.r <= q.l || q.b <= q.t) continue;
          for (let i = 1; i < L.pts.length && !at; i++) at = clip(L.pts[i - 1], L.pts[i], q);
          if (at) break;
        }
        if (at) break;
      }
      if (at) add(Lb.halo ? 'info' : 'warn', 'geoLineOverLabel', { edge: E.id, from: E.from, to: E.to, label: Lb.id, of: Lb.of, t: Lb.t, at: [rnd(at.x), rnd(at.y)], halo: Lb.halo });
    }
  }

  // ---------------------------------------------------------------- 3. 字の範囲どうし・字と持ち主でない点が重なる（geoLabelOverlap）
  for (let i = 0; i < labels.length; i++) {
    const A = labels[i];
    if (A.ok) continue;
    for (let j = i + 1; j < labels.length; j++) {
      const B = labels[j];
      if (A.root !== B.root || B.ok || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      let q = null;
      for (const r of A.rs) { for (const u of B.rs) if ((q = meet(r, u, TOL))) break; if (q) break; }
      if (q) add('warn', 'geoLabelOverlap', { label: A.id, of: A.of, t: A.t, other: B.id, otherOf: B.of, u: B.t, mark: false, rect: rr(q) });
    }
    for (const Mk of marks) {
      if (Mk.root !== A.root || Mk.ok || (A.of === 'mark' && A.id === Mk.id) || Mk.el.contains(A.el) || A.el.contains(Mk.el)) continue;
      let q = null;
      for (const r of A.rs) if ((q = meet(r, Mk.q, TOL))) break;
      if (q) add('warn', 'geoLabelOverlap', { label: A.id, of: A.of, t: A.t, other: Mk.id, otherOf: 'mark', u: '', mark: true, rect: rr(q) });
    }
  }

  // ---------------------------------------------------------------- 4. 箱の中の字が箱の縁を越える（geoLabelOutsideBox）。data-part-at="outside" の字は見ない
  //    <rect> の箱は外接矩形と比べる。<circle>・<ellipse>・<polygon>・<path> の箱は形と比べる（ほかの点検と同じ isPointInFill と輪郭までの距離）：
  //    字の範囲の周りの点のうち形の外のものについて、輪郭のいちばん近い点からのずれを左右上下に分けて、いちばん大きいものを px にする（2px までは中）
  for (const Lb of labels) {
    if (Lb.of !== 'box' || Lb.outside) continue;
    const B = boxes.find((b) => b.id === Lb.id && b.root === Lb.root);
    if (!B) continue;
    const l = Math.min.apply(null, Lb.rs.map((r) => r.l)), r = Math.max.apply(null, Lb.rs.map((x) => x.r));
    const t = Math.min.apply(null, Lb.rs.map((x) => x.t)), b = Math.max.apply(null, Lb.rs.map((x) => x.b));
    const ring = B.inv && B.el.localName !== 'rect' ? outline(B.el, 2) : [];
    if (ring.length > 2) {
      const d = { left: 0, right: 0, top: 0, bottom: 0 };
      let worst = 0;
      for (const q of Lb.rs) for (const p of rectRing(q)) {
        if (inFillOf(B, p.x, p.y)) continue;
        const o = nearRing(ring, p.x, p.y);
        worst = Math.max(worst, o.d);
        d.left = Math.max(d.left, o.x - p.x); d.right = Math.max(d.right, p.x - o.x); d.top = Math.max(d.top, o.y - p.y); d.bottom = Math.max(d.bottom, p.y - o.y);
      }
      if (worst > TOL) add('warn', 'geoLabelOutsideBox', { box: B.id, t: Lb.t, px: { left: rnd(d.left), right: rnd(d.right), top: rnd(d.top), bottom: rnd(d.bottom) }, rect: rr({ l, t, r, b }), boxRect: rr(B.q) });
      continue;
    }
    const px = { left: rnd(Math.max(0, B.q.l - l)), right: rnd(Math.max(0, r - B.q.r)), top: rnd(Math.max(0, B.q.t - t)), bottom: rnd(Math.max(0, b - B.q.b)) };
    if (B.q.l - l > TOL || r - B.q.r > TOL || B.q.t - t > TOL || b - B.q.b > TOL) add('warn', 'geoLabelOutsideBox', { box: B.id, t: Lb.t, px, rect: rr({ l, t, r, b }), boxRect: rr(B.q) });
  }
  return out;
}

// 図形が枠の外に出る（geoOutsideFrame。handoff #46）を、スライドの全部のステップで測ってまとめる。geometryScan と同じく文字列でページに入れる。
// seek(k)：そのステップの終わりの表示にする（kit/check.mjs と編集アプリは DECK.seek(i, k, Infinity)）。scan：geometryScan（中で外の名前を使えないので渡してもらう）
export function geometrySteps(s, o, seek, scan) {
  if (!s || s.classList.contains('layout-tate')) return null;
  const WA = (o && o.within) || '', CL = (o && o.clip) || '';
  // 歩くのは、枠の中の印があるか、形の要素の入った、切る（overflow が visible でない）SVG があるスライドだけ
  const SKIP = '.katex,svg.marks' + (CL ? ',[' + CL + ']' : '');
  const svgs = [].filter.call(s.querySelectorAll('svg'), (g) => {
    if (g.closest(SKIP) || !g.querySelector('path,rect,circle,ellipse,line,polyline,polygon')) return false;
    const st = getComputedStyle(g);
    return st.overflowX !== 'visible' || st.overflowY !== 'visible';
  });
  if (!(WA && s.querySelector('[' + WA + ']')) && !svgs.length) return null;
  const max = s.classList.contains('static') ? 0 : (isFinite(s._max) && s._max > 0 ? s._max : 0);
  const oo = Object.assign({}, o, { mode: 'step' }), by = new Map(), order = [];
  for (let k = 0; k <= max; k++) {
    seek(k);
    const name = k === s._cstep ? 'concl' : String(k);
    for (const f of scan(s, oo)) {
      const key = f.code + '\n' + f.a.shape + '\n' + (f.a.frame || '');
      let r = by.get(key);
      if (!r) { r = { code: f.code, sev: f.sev, a: Object.assign({}, f.a, { step: name, steps: [] }) }; by.set(key, r); order.push(r); }
      r.a.steps.push(name);
      if (f.a.px > r.a.px) r.a = Object.assign({}, f.a, { step: name, steps: r.a.steps });
    }
  }
  return order;
}

// 縦横が混ざる教材で、形の点検から外した縦書きのスライド（印のあるもの）の数。中身のスライドがみな縦書きなら 0。geometryScan と同じく文字列でページに入れる
// 印：data-part の 4 つと、枠の中の印（o.within。渡されたときだけ）
export function geometryTate(slides, o) {
  const content = [].filter.call(slides || [], (s) => !s.classList.contains('cover') && !s.classList.contains('sec'));
  const tate = content.filter((s) => s.classList.contains('layout-tate'));
  if (!tate.length || tate.length === content.length) return 0;
  const sel = ['box', 'edge', 'label', 'mark'].map((v) => '[data-part="' + v + '"]').concat(o && o.within ? ['[' + o.within + ']'] : []).join(',');
  return tate.filter((s) => !!s.querySelector(sel)).length;
}
