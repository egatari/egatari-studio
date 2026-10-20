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
      pieces.push({ el: e, svg: false, b: box(r), t: sample(n.textContent) });
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
  const found = { textClipped: null, svgTextOut: null, svgTextBox: null, outsideBody: null };
  const note = (code, a) => { const f = found[code]; if (f) f.n++; else found[code] = Object.assign({ n: 1 }, a); };
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
      if (cut.svg) note('svgTextOut', { t: p.t, px: cut.px, edge: 'viewBox' });
      else note('textClipped', { t: p.t, px: cut.px });
      continue;
    }
    const inBody = !!(body && body.contains(p.el));
    // 2. SVG の字がスライドの外に出る（部品の SVG は overflow:visible なので、枠では切れずにスライドの端で切れる）
    //    本文が下にはみ出すスライド（bodyBottom のエラー）では、本文の中の字がスライドの外に出るのは同じ原因なので数えない（本文を減らせばどちらも消える）
    const d = over(p.b, { l: 0, t: 0, r: 1280, b: 720 }, true, true);
    if (d > TOL && inBody && bodyOver) continue;
    if (p.svg && d > TOL) { note('svgTextOut', { t: p.t, px: Math.round(d), edge: 'slide' }); continue; }
    // 3. 本文の外（見出し・結論の行・ページ番号のほか）に置いた字：スライドの外に出る・見出し・結論の行・ページ番号に重なる
    if (!inBody && !frame.some((f) => f.contains(p.el))) {
      if (d > TOL) { note('outsideBody', { t: p.t, px: Math.round(d), why: 'slide' }); continue; }
      const hit = frame.find((f) => { const q = box(f.getBoundingClientRect()); return Math.min(p.b.r, q.r) - Math.max(p.b.l, q.l) > TOL && Math.min(p.b.b, q.b) - Math.max(p.b.t, q.t) > TOL; });
      if (hit) { note('outsideBody', { t: p.t, why: hit === c ? 'concl' : hit.classList.contains('pn') ? 'pn' : 'title' }); continue; }
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
  for (const code of ['textClipped', 'svgTextOut', 'svgTextBox', 'outsideBody']) if (found[code]) add('warn', code, found[code]);
  return out;
}

// 編集アプリの仲立ち（app/frame-shim.js の文字列。「(function frameShim(cfg){…})」）に、この関数と印の名前を渡す形にする。
// 戻り値も「(…)(cfg)」で呼べる 1 つの式（仲立ちの中では layoutScan・LAYOUT_CLIP という名前で使える）
export function withLayoutScan(shimSrc) {
  // 仲立ちの文字列は注釈の行から始まるので、return の後ろで改行して括弧で囲む（return の直後の改行で式が切れないように）
  return `(function(layoutScan, LAYOUT_CLIP){return (\n${String(shimSrc).trim()}\n);})(${layoutScan}, ${JSON.stringify(CLIP_ATTR)})`;
}
