// 描いた図の形の点検（backlog #201、R-geometry。handoff/v0.6.11-check-sketch-2026-11-12.md の 1）。品質チェックのコマンド版（kit/check.mjs）と
// 編集アプリのプレビュー（app/frame-shim.js）が同じこの関数を使う（体裁の検査 kit/core/layout-scan.mjs と同じ入れ方）
//
// 部品は描いた要素に印（札）を付けるだけで、測るのはここ 1 か所：
//   箱   形の要素そのもの（<rect>・<path>・<ellipse>・<polygon>）に data-part="box"・data-part-id
//   辺   <g data-part="edge" data-part-id data-part-from data-part-to>。線そのもの（<line> か <path>）に data-part-line（矢じりは除く）。1 つの辺に線が 2 本のこともある
//   字   <text data-part="label" data-part-id=<持ち主> data-part-of="box|edge|mark">。縁取りがあれば data-part-halo、箱の外に置く字は data-part-at="outside"。
//        foreignObject の字は中身を Range で測る
//   点   data-part="mark"（m-quad の点。<g transform> の中の <circle cx=0 cy=0> でも getBoundingClientRect で測る）。字の障害物
//   @ で始まる端（@spine・@moved など）は節でない
//
//   geometryScan(s, o) → [{code, sev, a}]   s：最終段階まで出したスライドの <section>。o = {bands, dflt}
//     bands  字体ごとの字の範囲（kit/core/text-band.mjs の TEXT_BANDS。{字体の名前: {up, down}}、em）
//     dflt   表にない字体だけの字の範囲（DEFAULT_BAND）
//     縦書きのスライド（layout-tate）は測らない（[] を返す。数は geometryTate）
//   geometryTate(slides) → n   縦横が混ざる教材で、測らなかった縦書きのスライドのうち印のあるものの数（geoTateSlides）。
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

export function geometryScan(s, o) {
  const out = [];
  if (!s || s.classList.contains('layout-tate')) return out;
  const BANDS = (o && o.bands) || {}, DFLT = (o && o.dflt) || { up: 0.86, down: 0.26 };
  const SEL = (v) => '[data-part="' + v + '"]';
  if (!s.querySelector([SEL('box'), SEL('edge'), SEL('label'), SEL('mark')].join(','))) return out;
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

  // ---------------------------------------------------------------- 箱
  const boxes = [];
  for (const el of s.querySelectorAll(SEL('box'))) {
    if (!shown(el)) continue;
    const q = box(el.getBoundingClientRect());
    if (q.r - q.l <= 0 || q.b - q.t <= 0) continue;
    const M = mapper(el);
    let inv = null;
    if (M && typeof el.isPointInFill === 'function') { try { inv = M.m.inverse(); } catch (e) { inv = null; } }
    boxes.push({ el, id: el.getAttribute('data-part-id') || '', root: rootOf(el), q, inv, sw: strokeOf(el, M) });
  }
  // 点（スライドの座標）が箱の内側に tol より深く入っているか：点とそのまわり 8 方向の tol の点がみな箱の形の中
  // （形は isPointInFill。ひし形の <polygon>・楕円・角の丸い <rect> も形どおり。形を測れない要素は外接矩形）
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
  const deepIn = (b, x, y, tol) => {
    if (x <= b.q.l + tol || x >= b.q.r - tol || y <= b.q.t + tol || y >= b.q.b - tol) return false;
    if (!b.inv) return true;
    const inFill = (px, py) => {
      const cx = sr.left + px * k, cy = sr.top + py * k, m = b.inv;
      try { return b.el.isPointInFill(new DOMPoint(m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f)); } catch (e) { return true; }
    };
    if (!inFill(x, y)) return false;
    for (const d of DIRS) if (!inFill(x + d[0] * tol, y + d[1] * tol)) return false;
    return true;
  };

  // ---------------------------------------------------------------- 辺（線ごとの折れ線、スライドの座標）
  const LINE = 'line,path,polyline,polygon';
  const edges = [];
  for (const g of s.querySelectorAll(SEL('edge'))) {
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
      lines.push({ el, pts, tol: strokeOf(el, M) / 2 + TOL });
    }
    if (lines.length) edges.push({ el: g, id, from, to, root: rootOf(g), lines });
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
  const labels = [];
  for (const el of s.querySelectorAll(SEL('label'))) {
    if (!shown(el)) continue;
    const rs = textRects(el);
    if (!rs.length) continue;
    labels.push({ el, id: el.getAttribute('data-part-id') || '', of: el.getAttribute('data-part-of') || '', outside: el.getAttribute('data-part-at') === 'outside', halo: el.hasAttribute('data-part-halo'), t: textOf(el), root: rootOf(el), rs });
  }
  const marks = [];
  for (const el of s.querySelectorAll(SEL('mark'))) {
    if (!shown(el)) continue;
    const q = box(el.getBoundingClientRect());
    if (q.r - q.l > 0 && q.b - q.t > 0) marks.push({ el, id: el.getAttribute('data-part-id') || '', root: rootOf(el), q });
  }
  const meet = (a, b, tol) => {
    const q = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
    return q.r - q.l > tol && q.b - q.t > tol ? q : null;
  };

  // ---------------------------------------------------------------- 1. 辺が元でも先でもない箱の内側を通る（geoEdgeThroughBox）
  for (const E of edges) {
    for (const B of boxes) {
      if (B.root !== E.root || B.id === E.from || B.id === E.to) continue;
      let seg = null;
      for (const L of E.lines) {
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
    for (const Lb of labels) {
      if (Lb.root !== E.root || (Lb.of === 'edge' && Lb.id === E.id) || E.el.contains(Lb.el)) continue;
      let at = null;
      for (const L of E.lines) {
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
    for (let j = i + 1; j < labels.length; j++) {
      const B = labels[j];
      if (A.root !== B.root || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      let q = null;
      for (const r of A.rs) { for (const u of B.rs) if ((q = meet(r, u, TOL))) break; if (q) break; }
      if (q) add('warn', 'geoLabelOverlap', { label: A.id, of: A.of, t: A.t, other: B.id, otherOf: B.of, u: B.t, mark: false, rect: rr(q) });
    }
    for (const Mk of marks) {
      if (Mk.root !== A.root || (A.of === 'mark' && A.id === Mk.id) || Mk.el.contains(A.el) || A.el.contains(Mk.el)) continue;
      let q = null;
      for (const r of A.rs) if ((q = meet(r, Mk.q, TOL))) break;
      if (q) add('warn', 'geoLabelOverlap', { label: A.id, of: A.of, t: A.t, other: Mk.id, otherOf: 'mark', u: '', mark: true, rect: rr(q) });
    }
  }

  // ---------------------------------------------------------------- 4. 箱の中の字が箱の縁を越える（geoLabelOutsideBox）。data-part-at="outside" の字は見ない
  for (const Lb of labels) {
    if (Lb.of !== 'box' || Lb.outside) continue;
    const B = boxes.find((b) => b.id === Lb.id && b.root === Lb.root);
    if (!B) continue;
    const l = Math.min.apply(null, Lb.rs.map((r) => r.l)), r = Math.max.apply(null, Lb.rs.map((x) => x.r));
    const t = Math.min.apply(null, Lb.rs.map((x) => x.t)), b = Math.max.apply(null, Lb.rs.map((x) => x.b));
    const px = { left: rnd(Math.max(0, B.q.l - l)), right: rnd(Math.max(0, r - B.q.r)), top: rnd(Math.max(0, B.q.t - t)), bottom: rnd(Math.max(0, b - B.q.b)) };
    if (B.q.l - l > TOL || r - B.q.r > TOL || B.q.t - t > TOL || b - B.q.b > TOL) add('warn', 'geoLabelOutsideBox', { box: B.id, t: Lb.t, px, rect: rr({ l, t, r, b }), boxRect: rr(B.q) });
  }
  return out;
}

// 縦横が混ざる教材で、形の点検から外した縦書きのスライド（印のあるもの）の数。中身のスライドがみな縦書きなら 0。geometryScan と同じく文字列でページに入れる
export function geometryTate(slides) {
  const content = [].filter.call(slides || [], (s) => !s.classList.contains('cover') && !s.classList.contains('sec'));
  const tate = content.filter((s) => s.classList.contains('layout-tate'));
  if (!tate.length || tate.length === content.length) return 0;
  const sel = ['box', 'edge', 'label', 'mark'].map((v) => '[data-part="' + v + '"]').join(',');
  return tate.filter((s) => !!s.querySelector(sel)).length;
}
