// スライドの体裁の検査（はみ出し・切れ・文字の大きさ・字数）。品質チェックのコマンド版（kit/check.mjs）とブラウザ版
// （編集アプリのプレビューの中の app/frame-shim.js）が同じこの関数を使う（backlog #51・#52）
//
//   layoutScan(s, o) → [{code, sev, a}]   s：最終段階まで出したスライドの <section>。o = {JA, refRe, clip}
//     JA     日本語の規則（字数を全角 1・半角 0.5 で数える）か
//     refRe  文献のスライドの見出し（正規表現の文字列）。そのスライドは字の大きさを見ない
//     clip   わざと切る印の属性の名前（CLIP_ATTR）
//   code と a は kit/check-messages.mjs の知らせ。sev は 'error' | 'warn'
//
// この関数は文字列にしてページに入れる（check.mjs は page.evaluate、編集アプリは仲立ちの文字列に埋める）。
// だから外の名前を使わない（中だけで閉じる）。仲立ちはデッキの script の要素の中にそのまま入るので、閉じるタグと HTML の注釈の始まりを書かない（tools/build-app.mjs が確かめる）
//
// わざと切る印（CLIP_ATTR。docs/contract.md §10）：その要素の中（子孫も、SVG の字も）は、箱で切れる・スライドの外に出る・
// 図の箱からはみ出す、の 4 つ（textClipped・svgTextOut・svgTextBox・outsideBody）を見ない。縦横どちらにも効く。前からの検査（bodyBottom など）には効かない
export const CLIP_ATTR = 'data-clip';

export function layoutScan(s, o) {
  const JA = !!o.JA, CLIP = o.clip, refRe = new RegExp(o.refRe);
  const out = [];
  const add = (sev, code, a) => out.push({ code, sev, a: a || {} });
  const units = (t) => [...t].reduce((n, ch) => n + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);
  // 見える文字だけ（KaTeX の読み上げ用の MathML は数えない）
  const vis = (el) => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('.katex-mathml').forEach((x) => x.remove()); return c.textContent; };
  const sr = s.getBoundingClientRect();
  const k = sr.width / 1280 || 1;
  // スライドの座標（1280×720）の箱
  const box = (r) => ({ l: (r.left - sr.left) / k, t: (r.top - sr.top) / k, r: (r.right - sr.left) / k, b: (r.bottom - sr.top) / k });
  const h2 = s.querySelector('h2'), c = s.querySelector('.concl'), body = s.querySelector('.body');
  const tate = s.classList.contains('layout-tate');
  let bodyOver = false;   // 本文が下にはみ出す（bodyBottom）。そのスライドでは、本文の中の字がスライドの外に出ることを別に数えない

  // ---------------------------------------------------------------- 見出しと結論の行
  if (h2) {
    const t = vis(h2).trim();
    if (JA && units(t) > 26) add('error', 'titleLong', { n: units(t), t });
    if (!JA && t.length > 60) add('warn', 'titleLongEn', { n: t.length, t });
    if (/[：:]$/.test(t)) add('error', 'titleColon', { t });
    // 縦組み（layout-tate）の見出しは 1 列（天 48px から地 664px まで、43px の字でおよそ 14 字）。折り返さないので、収まらなければ切れる
    if (tate && h2.scrollHeight > h2.clientHeight + 1) add('error', 'tateTitle', { h: Math.round(h2.scrollHeight), max: h2.clientHeight });
  }
  if (c) {
    const t = vis(c).trim();
    if (JA && units(t) > 35) add('error', 'conclLong', { n: units(t), t });
    if (!JA && t.length > 70) add('warn', 'conclLongEn', { n: t.length, t });
    // 縦組み（layout-tate）の結論は縦の列なので、高さではみ出す
    if (c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1) add('error', 'conclOverflow', {});
  }

  // ---------------------------------------------------------------- 本文の場所
  if (body) {
    // 結論の行があるときは上端 571px の手前（元キットの余裕を見た値 565px）、ないときは 680px。
    // 縦組み（layout-tate）は、地 680px・右は見出しの罫（1166px）の手前 1162px・左は結論の列（右端 120px）の外 124px（結論がなければ 44px）
    const lim = tate || s.classList.contains('noconcl') ? 680 : 565;
    const limR = tate ? 1162 : 1236, limL = tate ? (c ? 124 : 44) : -Infinity;
    let maxB = 0, maxR = 0, minL = Infinity;
    body.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg') && el.tagName !== 'svg') return;
      if (el.closest('.katex') && !el.classList.contains('katex')) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      maxB = Math.max(maxB, (r.bottom - sr.top) / k);
      maxR = Math.max(maxR, (r.right - sr.left) / k);
      minL = Math.min(minL, (r.left - sr.left) / k);
    });
    if (maxB > lim) { bodyOver = true; add('error', 'bodyBottom', { px: Math.round(maxB), lim, concl: !tate && lim === 565 }); }
    if (maxR > limR) add('error', tate ? 'tateBodyHead' : 'bodyRight', tate ? { px: Math.round(maxR), lim: limR } : { px: Math.round(maxR) });
    if (minL < limL) add('error', c ? 'bodyConclCol' : 'bodyLeft', { px: Math.round(minL), lim: limL });
    // 文字の大きさ：本文 27px（20pt）以上，図・表 24px（18pt）以上。出典・ページ番号・図キャプションは除く
    if (!refRe.test(h2 ? h2.textContent : '')) {
      const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!n.textContent.trim()) continue;
        const e = n.parentElement;
        // ルビ（rt）の振り仮名は本文の半分の大きさが決まり（docs/reference.md「Japanese language arts」）
        if (e.closest('svg') || e.closest('.katex') || e.closest('.cite') || e.closest('.pn') || e.closest('.figcap') || e.closest('rt')) continue;
        const f = parseFloat(getComputedStyle(e).fontSize);
        const lim2 = e.closest('table,.plot') ? 23.9 : 26.6;
        if (f < lim2) { add('error', 'smallText', { px: f, t: n.textContent.trim().slice(0, 12) }); break; }
      }
      // 図中の文字（SVG）
      body.querySelectorAll('svg').forEach((g) => {
        const vb = g.viewBox && g.viewBox.baseVal;
        if (!vb || !vb.width) return;
        const sc = g.getBoundingClientRect().width / k / vb.width;
        const fs = [...g.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) || 24);
        if (fs.length && Math.min(...fs) * sc < 23.9) add('error', 'smallSvgText', { px: (Math.min(...fs) * sc).toFixed(1) });
      });
    }
  }

  // ---------------------------------------------------------------- 切れる字・外に出る字（#52。警告）
  // 字の塊：HTML の文字のノード（の範囲）と SVG の <text>。見えないもの（display:none・visibility:hidden・opacity 0）、KaTeX の読み上げ用、
  // 読み上げだけの .sr-only、注目の演出の SVG、わざと切る印（CLIP）の中は数えない
  const TOL = 2;
  const sample = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 24);
  const shown = (el) => {
    for (let a = el; a && a !== s; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse' || parseFloat(st.opacity) === 0) return false;
    }
    return true;
  };
  const skip = (el) => !!el.closest('.katex-mathml, .sr-only, svg.marks, script, style, [' + CLIP + ']');
  const pieces = [];
  {
    const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (!n.textContent.trim()) continue;
      const e = n.parentElement;
      if (!e || e.closest('svg') || skip(e) || !shown(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      pieces.push({ el: e, svg: false, b: box(r), t: sample(n.textContent), n });
    }
    s.querySelectorAll('text').forEach((t) => {
      if (!t.closest('svg') || t.closest('.katex') || skip(t) || !t.textContent.trim() || !shown(t)) return;
      const r = t.getBoundingClientRect();
      if (!r.width && !r.height) return;
      pieces.push({ el: t, svg: true, b: box(r), t: sample(t.textContent) });
    });
  }
  // 箱が字を切るか（縦・横）。HTML の箱は内側（padding の箱）、SVG はその表示の枠（viewBox を写した場所）
  const over = (p, q, x, y) => Math.max(x ? q.l - p.l : 0, x ? p.r - q.r : 0, y ? q.t - p.t : 0, y ? p.b - q.b : 0);
  const found = { textClipped: null, svgTextOut: null, svgTextBox: null, outsideBody: null, textOffSlide: null, textOverlap: null, cellWordBreak: null };
  const note = (code, a) => { const f = found[code]; if (f) f.n++; else found[code] = Object.assign({ n: 1 }, a); };
  const done = new Set();   // 上の 4 つか、スライドの外（textOffSlide）で知らせた字。重なり（textOverlap）では見ない
  // 表紙・章の扉（.body のないスライド）の知らせには、置ける子要素を添える
  const kind = s.classList.contains('cover') ? 'cover' : s.classList.contains('sec') ? 'sec' : '';
  const frame = [h2, s.querySelector('h1'), c, s.querySelector(':scope > .pn')].filter(Boolean);
  for (const p of pieces) {
    // 1. 切れる：字から上へ（HTML の字はその字の要素から）、overflow が visible でない箱（見出し・結論の行・本文の箱は前からの検査が見る。
    //    1〜2px の箱は読み上げ用の隠し方）
    let cut = null;
    for (let a = p.svg ? p.el.parentElement : p.el; a && a !== s; a = a.parentElement) {
      if (a === h2 || a === c || a === body || a.tagName === 'H1' || a.closest('.katex')) continue;
      const st = getComputedStyle(a), isSvg = a.tagName.toLowerCase() === 'svg';
      const x = st.overflowX !== 'visible', y = st.overflowY !== 'visible';
      if (!x && !y) continue;
      const r = a.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      // HTML の箱は枠線の内側（clientLeft・clientTop と clientWidth・clientHeight：スクロールバーを除く）
      const q = isSvg ? box(r) : box({ left: r.left + a.clientLeft * k, top: r.top + a.clientTop * k, right: r.left + (a.clientLeft + a.clientWidth) * k, bottom: r.top + (a.clientTop + a.clientHeight) * k });
      const d = over(p.b, q, x, y);
      if (d > TOL) { cut = { svg: isSvg, px: Math.round(d) }; break; }
    }
    if (cut) {
      done.add(p);
      if (cut.svg) note('svgTextOut', { t: p.t, px: cut.px, edge: 'viewBox' });
      else note('textClipped', { t: p.t, px: cut.px });
      continue;
    }
    const inBody = !!(body && body.contains(p.el));
    // 2. SVG の字がスライドの外に出る（部品の SVG は overflow:visible なので、枠では切れずにスライドの端で切れる）
    //    本文が下にはみ出すスライド（bodyBottom のエラー）では、本文の中の字がスライドの外に出るのは同じ原因なので数えない（本文を減らせばどちらも消える）
    const d = over(p.b, { l: 0, t: 0, r: 1280, b: 720 }, true, true);
    if (d > TOL && inBody && bodyOver) continue;
    if (p.svg && d > TOL) { done.add(p); note('svgTextOut', { t: p.t, px: Math.round(d), edge: 'slide' }); continue; }
    // 3. 本文の外（見出し・結論の行・ページ番号のほか）に置いた字：スライドの外に出る・見出し・結論の行・ページ番号に重なる
    //    .body のないスライド（表紙・章の扉・自分で位置を決めた配置）には「本文の中に置く」は当たらないので、スライドの外に出る字は
    //    どの字も textOffSlide（#64）、重なりは下の textOverlap で見る
    if (!body && d > TOL) { done.add(p); note('textOffSlide', { t: p.t, px: Math.round(d), kind }); continue; }
    if (body && !inBody && !frame.some((f) => f.contains(p.el))) {
      if (d > TOL) { done.add(p); note('outsideBody', { t: p.t, px: Math.round(d), why: 'slide' }); continue; }
      const hit = frame.find((f) => { const q = box(f.getBoundingClientRect()); return Math.min(p.b.r, q.r) - Math.max(p.b.l, q.l) > TOL && Math.min(p.b.b, q.b) - Math.max(p.b.t, q.t) > TOL; });
      if (hit) { done.add(p); note('outsideBody', { t: p.t, why: hit === c ? 'concl' : hit.classList.contains('pn') ? 'pn' : 'title' }); continue; }
    }
    // 4. SVG の字が、それを囲む箱（同じ親の <rect> で、字の中心を含むもののうち一番小さいもの）からはみ出す
    if (p.svg) {
      const cx = (p.b.l + p.b.r) / 2, cy = (p.b.t + p.b.b) / 2;
      let best = null, area = Infinity;
      for (const r of p.el.parentElement.children) {
        if (r.tagName.toLowerCase() !== 'rect' || !shown(r)) continue;
        const st = getComputedStyle(r);
        if (st.fill === 'none' && st.stroke === 'none') continue;
        const q = box(r.getBoundingClientRect()), ar = (q.r - q.l) * (q.b - q.t);
        if (cx >= q.l && cx <= q.r && cy >= q.t && cy <= q.b && ar > 0 && ar < area) { best = q; area = ar; }
      }
      if (best) { const e = over(p.b, best, true, true); if (e > TOL) note('svgTextBox', { t: p.t, px: Math.round(e) }); }
    }
  }

  // ---------------------------------------------------------------- 字の箱が重なる（#64。警告）
  // どのスライドでも（表紙・章の扉・縦組み・絶対位置の配置も）、HTML の字の箱どうしと、字とスライドの帯（飾り）が重なれば知らせる。
  // 字の箱：字の塊を、それを流し込む箱（display が inline・ruby などでない一番近い祖先。KaTeX の式は式全体）ごとにまとめ、
  // 行ごとの矩形（Range の getClientRects）を持つ。同じ箱の中の字は流し込みなので重ならない。親と子（一方が他方を含む）の組は見ない。
  // 前の知らせと重ねない：上で知らせた字（切れる・外に出る・本文の外）は数えない。本文の場所のエラー（bodyBottom など）のあるスライドでは、
  // 本文の字と本文の外の字（見出し・結論の行）の組を見ない（本文を減らせば両方消える）。SVG の字は svgTextOut・svgTextBox が見るので数えない。
  // 同じ部品（<m-…> などのカスタム要素）の中の字どうしは見ない（部品のコードが並べるもので、デッキからは直せない。部品庫の試験が見る）
  const INLINE = /^(inline|contents|ruby|ruby-base|ruby-text|ruby-base-container|ruby-text-container)$/;
  const blockOf = (el) => {
    for (let e = el.closest('.katex') || el; e && e !== s; e = e.parentElement) if (!INLINE.test(getComputedStyle(e).display)) return e;
    return s;
  };
  const meet = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > TOL && Math.min(a.b, b.b) - Math.max(a.t, b.t) > TOL;
  const blocks = new Map(), mathSeen = new Set();
  for (const p of pieces) {
    if (p.svg || done.has(p)) continue;
    const bl = blockOf(p.el);
    let g = blocks.get(bl);
    if (!g) {
      let comp = null;
      for (let e = bl; e && e !== s; e = e.parentElement) if (e.tagName.includes('-')) comp = e;
      blocks.set(bl, (g = { el: bl, rs: [], t: '', inBody: !!(body && body.contains(bl)), comp }));
    }
    g.t = g.t ? g.t : p.t;
    // KaTeX の式は字ごとの行の矩形を使わない（KaTeX の字の矩形は字体の高さで広く、vlist・strut は負の余白で上下に重ねるので、
    // 縦に並べた式どうしが重なって見える）。式の見た目の箱（.katex-html の .base を合わせた箱を、.katex-display か .katex の箱で切ったもの）を 1 つ使う
    const kx = p.el.closest('.katex');
    if (kx) {
      const F = p.el.closest('.katex-display') || kx;
      if (mathSeen.has(F)) continue;
      mathSeen.add(F);
      const fr = box(F.getBoundingClientRect());
      const html = F.querySelector('.katex-html');
      let u = null;
      if (html) for (const e of html.children) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const q = box(r);
        u = u ? { l: Math.min(u.l, q.l), t: Math.min(u.t, q.t), r: Math.max(u.r, q.r), b: Math.max(u.b, q.b) } : q;
      }
      if (!u && html) u = box(html.getBoundingClientRect());
      if (!u) u = fr;
      const q = { l: Math.max(u.l, fr.l), t: Math.max(u.t, fr.t), r: Math.min(u.r, fr.r), b: Math.min(u.b, fr.b) };
      if (q.r > q.l && q.b > q.t) g.rs.push(q);
      continue;
    }
    const rg = document.createRange(); rg.selectNodeContents(p.n);
    for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0) g.rs.push(box(r));
  }
  const bodyErr = out.some((f) => /^(bodyBottom|bodyRight|tateBodyHead|bodyConclCol|bodyLeft)$/.test(f.code));
  // 見出し・結論の行に字数・はみ出しの知らせがあれば、その字の重なりは重ねて知らせない（見出し・結論を短くすれば消える）
  const longT = out.some((f) => /^(titleLong|titleLongEn|tateTitle)$/.test(f.code)), longC = out.some((f) => /^(conclLong|conclLongEn|conclOverflow)$/.test(f.code));
  const G = [...blocks.values()].filter((g) => g.rs.length && !(longT && h2 && h2.contains(g.el)) && !(longC && c && c.contains(g.el)));
  // スライドの帯：スライドの ::before・::after で、字がなく、見える背景を持つ絶対位置の箱（kit/layouts.css の表紙の上の帯）
  const bands = [];
  for (const pe of ['::before', '::after']) {
    const st = getComputedStyle(s, pe);
    if (!st || st.content === 'none' || st.content === 'normal' || st.display === 'none' || st.visibility !== 'visible' || parseFloat(st.opacity) === 0) continue;
    if (!/^(absolute|fixed)$/.test(st.position) || st.content.replace(/^["']|["']$/g, '').trim()) continue;
    if (st.backgroundImage === 'none' && /^(transparent|rgba\(.*,\s*0\))$/.test(st.backgroundColor)) continue;
    const l = parseFloat(st.left), t = parseFloat(st.top), w = parseFloat(st.width), h = parseFloat(st.height);
    if ([l, t, w, h].every((x) => isFinite(x)) && w > 0 && h > 0) bands.push({ l, t, r: l + w, b: t + h });
  }
  for (const g of G) if (bands.some((q) => g.rs.some((r) => meet(r, q)))) note('textOverlap', { t: g.t, with: 'band', kind });
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
    const A = G[i], B = G[j];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    if (bodyErr && A.inBody !== B.inBody) continue;
    if (A.comp && A.comp === B.comp) continue;
    if (A.rs.some((r) => B.rs.some((q) => meet(r, q)))) note('textOverlap', { t: A.t, u: B.t, with: 'text', kind });
  }

  // ---------------------------------------------------------------- 表の短いセルの語が割れる（#65。警告）
  // セル（td・th）の字を 1 字ずつ Range の矩形で行に分け、2 行以上になるとき：
  //   日本語・中国語の字を含み、空白を除いて 6 字まで → 知らせる（短い区分の語は 1 行に収める）
  //   日本語の字のない語（Intl.Segmenter の語。英字・数字）の途中で行が変わる → 知らせる（ブラウザは英語の語を空白やハイフンでしか折らないので、
  //   途中で割れるのは overflow-wrap・word-break のせい）
  // 長い日本語のセルがふつうに折り返すのは知らせない。見えないセル・わざと切る印（CLIP）の中・KaTeX・ルビの振り仮名の字は数えない
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const SHORT = 6;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(JA ? 'ja' : 'en', { granularity: 'word' }) : null;
  s.querySelectorAll('td, th').forEach((cell) => {
    if (skip(cell) || !shown(cell)) return;
    const vert = /^vertical/.test(getComputedStyle(cell).writingMode);
    let full = '';
    const at = [];   // full の位置 → 行の番号（空白は null）
    let line = -1, cur = null;
    const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const e = n.parentElement;
      if (!e || e.closest('.katex, rt, svg') || skip(e)) continue;
      const tx = n.textContent;
      for (let i = 0; i < tx.length; i++) {
        const cp = tx.codePointAt(i), w = cp > 0xffff ? 2 : 1, ch = tx.slice(i, i + w);
        let li = null;
        if (!/\s/.test(ch)) {
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + w);
          const r = rg.getBoundingClientRect();
          if (r.width || r.height) {
            const a0 = vert ? r.left : r.top, a1 = vert ? r.right : r.bottom;
            const same = cur && Math.min(a1, cur[1]) - Math.max(a0, cur[0]) > 0.5 * Math.min(a1 - a0, cur[1] - cur[0]);
            if (!same) { line++; cur = [a0, a1]; } else cur = [Math.min(cur[0], a0), Math.max(cur[1], a1)];
            li = line;
          }
        }
        for (let k2 = 0; k2 < w; k2++) at.push(li);
        full += ch;
        i += w - 1;
      }
    }
    if (line < 1) return;
    const tv = full.replace(/\s+/g, ' ').trim();
    let hit = CJK.test(tv) && [...tv.replace(/\s/g, '')].length <= SHORT;
    if (!hit) {
      const words = seg ? [...seg.segment(full)].filter((x) => x.isWordLike).map((x) => [x.index, x.segment]) : [...full.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => [m.index, m[0]]);
      hit = words.some(([i0, w]) => {
        if (CJK.test(w)) return false;
        const ls = at.slice(i0, i0 + w.length).filter((x) => x !== null);
        return ls.length > 1 && ls[0] !== ls[ls.length - 1];
      });
    }
    if (!hit) return;
    let split = '', prev = null;
    for (let i = 0; i < full.length; i++) { if (at[i] !== null && prev !== null && at[i] !== prev) split += '/'; if (at[i] !== null) prev = at[i]; split += full[i]; }
    note('cellWordBreak', { t: sample(tv), lines: line + 1, split: sample(split.replace(/\s+/g, ' ')) });
  });
  for (const code of ['textClipped', 'svgTextOut', 'svgTextBox', 'outsideBody', 'textOffSlide', 'textOverlap', 'cellWordBreak']) if (found[code]) add('warn', code, found[code]);
  return out;
}

// 編集アプリの仲立ち（app/frame-shim.js の文字列。「(function frameShim(cfg){…})」）に、この関数と印の名前を渡す形にする。
// 戻り値も「(…)(cfg)」で呼べる 1 つの式（仲立ちの中では layoutScan・LAYOUT_CLIP という名前で使える）
export function withLayoutScan(shimSrc) {
  // 仲立ちの文字列は注釈の行から始まるので、return の後ろで改行して括弧で囲む（return の直後の改行で式が切れないように）
  return `(function(layoutScan, LAYOUT_CLIP){return (\n${String(shimSrc).trim()}\n);})(${layoutScan}, ${JSON.stringify(CLIP_ATTR)})`;
}
