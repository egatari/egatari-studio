// スライドの体裁の検査（はみ出し・切れ・文字の大きさ・字数）。品質チェックのコマンド版（kit/check.mjs）とブラウザ版
// （編集アプリのプレビューの中の app/frame-shim.js）が同じこの関数を使う（backlog #51・#52）
//
//   layoutScan(s, o) → [{code, sev, a}]   s：最終段階まで出したスライドの <section>。o = {JA, refRe, clip, annot, metrics}
//     JA     日本語の規則（字数を全角 1・半角 0.5 で数える）か
//     refRe  文献のスライドの見出し（正規表現の文字列）。そのスライドは字の大きさを見ない
//     clip   わざと切る印の属性の名前（CLIP_ATTR）
//     annot  小さい注記の印の属性の名前（ANNOT_ATTR）。字の大きさの最小（smallText・smallSvgText）を見ない
//     metrics テーマの寸法の宣言（kit/core/theme-metrics.mjs の解決したもの。build の戻り値の theme.metrics）。本文の場所の限りをここから導く。
//            渡さなければ既定（今の kit/layouts.css。中に書いた既定は DEFAULT_METRICS と同じ：tools/test-theme-metrics.mjs が縛る）。
//            余裕（結論の行の上 6px・横の 4px）・字の大きさの最小・字数は metrics で変わらない
//   code と a は kit/check-messages.mjs の知らせ。sev は 'error' | 'warn'
//
//   metricsFonts(doc) → Promise<{ok, missing}>   測る前に、見本の字の字体が同梱の字体で読み込まれたか（代わりの字体では測らない）
//   metricsProbe(doc, M) → {measured, theme, items}   テーマの寸法の宣言（M）と、描いた箱を比べる（themeMetricsDrift。contract §12）。
//     見えない見本のスライド 4 枚（無印・noconcl・layout-tate・layout-tate noconcl）を #stage に足して測り、すぐに外す。
//     measured はデッキの CSS も通した箱、theme はデッキの <style> を外した（#deck-base だけの）箱。items は宣言と合わない項目
//     [{field, declared, measured, by}]（by：'theme' テーマの CSS が違う／'deck' デッキの CSS が動かした。body.floor・tate.floor の measured は [下, 上]、
//     --bar-h の declared はその上限 720 − body.floor）
//
// この関数は文字列にしてページに入れる（check.mjs は page.evaluate、編集アプリは仲立ちの文字列に埋める）。
// だから外の名前を使わない（中だけで閉じる）。仲立ちはデッキの script の要素の中にそのまま入るので、閉じるタグと HTML の注釈の始まりを書かない（tools/build-app.mjs が確かめる）
//
// わざと切る印（CLIP_ATTR。docs/contract.md §10）：その要素の中（子孫も、SVG の字も）は、箱で切れる・スライドの外に出る・
// 図の箱からはみ出す、の 4 つ（textClipped・svgTextOut・svgTextBox・outsideBody）を見ない。縦横どちらにも効く。前からの検査（bodyBottom など）には効かない
export const CLIP_ATTR = 'data-clip';

// 小さい注記の印（ANNOT_ATTR。docs/contract.md §10）：部品が返り点・読む順の番号のような「字の脇に添える注記」にわざと付ける。その要素の中（子孫も、SVG の字も）は、
// 字の大きさの最小（smallText・smallSvgText）を見ない。ほかの検査と表示は変えない
export const ANNOT_ATTR = 'data-annot';

export function layoutScan(s, o) {
  const JA = !!o.JA, CLIP = o.clip, ANNOT = o.annot, refRe = new RegExp(o.refRe);
  // テーマの寸法（1280×720 の px）。既定は kit/core/theme-metrics.mjs の DEFAULT_METRICS と同じ値
  const DM = { body: { left: 48, right: 48, top: 122, floor: 680, line: 46 }, concl: { top: 571, height: 72 }, tate: { rule: 1166, conclRight: 120, left: 48, floor: 680 } };
  const om = o.metrics || {};
  const M = { body: Object.assign({}, DM.body, om.body), concl: Object.assign({}, DM.concl, om.concl), tate: Object.assign({}, DM.tate, om.tate) };
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
  let bodyOver = false;

  // ---------------------------------------------------------------- 祖先で切られて見えない箱
  // seen(b, from, own, stop) → {v, gone}：箱 b（スライドの座標）のうち、from から stop の手前までの祖先が切ったあとに見える部分 v。
  //   own：from がその箱の要素そのもの（自分の overflow は自分の箱を切らない。clip・clip-path は自分も切る）。字の Range の箱なら false（字の要素の overflow も効く）
  //   gone：null（見える）| 'hidden'（読み上げ用の隠し方で見えない：clip-path の inset・clip の rect で何も残らないか、
  //         overflow が visible でない 2px 以下の箱（1×1 の .sr-only）の中）| 'cut'（見える大きさの overflow の箱で切られて何も残らない）
  //   overflow は包む箱（containing block）の鎖の上だけで効く（絶対位置の子は、位置を決める祖先までの間の overflow で切られない）。clip・clip-path は子孫をみな切る
  const clipCache = new Map();
  const clipOf = (a) => {
    let c = clipCache.get(a);
    if (c) return c;
    const st = getComputedStyle(a), r = a.getBoundingClientRect();
    const bb = box(r);
    c = { pos: st.position, cb: st.position !== 'static' || st.transform !== 'none', tf: st.transform !== 'none', ox: st.overflowX !== 'visible', oy: st.overflowY !== 'visible', inner: null, tiny: false, rect: null };
    if (c.ox || c.oy) {
      // 枠線の内側（clientLeft・clientTop と clientWidth・clientHeight）
      c.inner = a instanceof HTMLElement ? box({ left: r.left + a.clientLeft * k, top: r.top + a.clientTop * k, right: r.left + (a.clientLeft + a.clientWidth) * k, bottom: r.top + (a.clientTop + a.clientHeight) * k }) : bb;
      c.tiny = r.width <= 2 || r.height <= 2;
    }
    const w = bb.r - bb.l, h = bb.b - bb.t;
    // clip-path: inset(上 右 下 左 [round …])（px と %。ほかの形は見ない）。箱は枠線の箱
    const cp = st.clipPath || '';
    const m = /^inset\(([^)]*)\)/.exec(cp.trim());
    if (m) {
      const vs = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
      const val = (x, len) => /%$/.test(x) ? parseFloat(x) / 100 * len : parseFloat(x) / k;
      if (vs.length >= 1 && vs.length <= 4 && vs.every((x) => /^-?[\d.]+(px|%)?$/.test(x))) {
        const [t0, r0 = t0, b0 = t0, l0 = r0] = vs;
        c.rect = { l: bb.l + val(l0, w), t: bb.t + val(t0, h), r: bb.r - val(r0, w), b: bb.b - val(b0, h) };
      }
    }
    // clip: rect(上, 右, 下, 左)（絶対位置の要素だけ。枠線の箱の左上から。auto はその辺のまま）
    if (/^(absolute|fixed)$/.test(st.position) && /^rect\(/.test(st.clip || '')) {
      const vs = st.clip.slice(5, -1).split(/[\s,]+/).filter(Boolean);
      if (vs.length === 4) {
        const px = (x, d) => (x === 'auto' ? d : parseFloat(x) / k);
        const q = { l: bb.l + px(vs[3], 0), t: bb.t + px(vs[0], 0), r: bb.l + px(vs[1], w), b: bb.t + px(vs[2], h) };
        c.rect = c.rect ? { l: Math.max(c.rect.l, q.l), t: Math.max(c.rect.t, q.t), r: Math.min(c.rect.r, q.r), b: Math.min(c.rect.b, q.b) } : q;
      }
    }
    clipCache.set(a, c);
    return c;
  };
  const cutBy = (v, q, x, y) => ({ l: x ? Math.max(v.l, q.l) : v.l, t: y ? Math.max(v.t, q.t) : v.t, r: x ? Math.min(v.r, q.r) : v.r, b: y ? Math.min(v.b, q.b) : v.b });
  const empty = (v) => v.r - v.l <= 0 || v.b - v.t <= 0;
  const seen = (b, from, own, stop) => {
    let v = b, esc = null;   // esc：'abs' | 'fixed'。包む箱に着くまで祖先の overflow は切らない
    for (let a = from; a && a !== stop && a !== s; a = a.parentElement) {
      const c = clipOf(a);
      if (!(own && a === from)) {
        const isCb = esc === 'abs' ? c.cb : esc === 'fixed' ? c.tf : true;
        if (isCb) {
          esc = null;
          if ((c.ox || c.oy) && c.inner) {
            if (c.tiny) return { v: null, gone: 'hidden' };
            v = cutBy(v, c.inner, c.ox, c.oy);
            if (empty(v)) return { v: null, gone: 'cut' };
          }
        }
      }
      if (c.rect) { v = cutBy(v, c.rect, true, true); if (empty(v)) return { v: null, gone: 'hidden' }; }
      if (!esc) esc = c.pos === 'absolute' ? 'abs' : c.pos === 'fixed' ? 'fixed' : null;
    }
    return { v, gone: null };
  };
  // 読み上げ用の隠し方の中か（要素の中の字ごと見えない）
  const hiddenEl = (el) => seen(box(el.getBoundingClientRect()), el, false, s).gone === 'hidden';   // 本文が下にはみ出す（bodyBottom）。そのスライドでは、本文の中の字がスライドの外に出ることを別に数えない

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
    // 限りはテーマの寸法（M）から導く。既定では：結論の行があるときは上端 571px の手前（元キットの余裕を見た値 565px）、ないときは 680px。
    // 横の右は本文の右端（1232px）の外 1236px。縦組み（layout-tate）は、地 680px・右は見出しの罫（1166px）の手前 1162px・
    // 左は結論の列（右端 120px）の外 124px（結論がなければ本文の左 48px の外 44px）
    const noconcl = s.classList.contains('noconcl');
    const lim = tate ? M.tate.floor : noconcl ? M.body.floor : M.concl.top - 6;
    const limR = tate ? M.tate.rule - 4 : 1280 - M.body.right + 4, limL = tate ? (c ? M.tate.conclRight + 4 : M.tate.left - 4) : -Infinity;
    let maxB = 0, maxR = 0, minL = Infinity;
    body.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg') && el.tagName !== 'svg') return;
      if (el.closest('.katex') && !el.classList.contains('katex')) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      // 祖先が切った後に見える部分だけ（読み上げ用の隠し方の中・切られて何も残らない箱は数えない。本文の箱より上の祖先は見ない）
      const { v } = seen(box(r), el, true, body);
      if (!v) return;
      maxB = Math.max(maxB, v.b);
      maxR = Math.max(maxR, v.r);
      minL = Math.min(minL, v.l);
    });
    // はみ出しの大きさは整数の px に丸めてから比べる（知らせと同じ丸め）：丸めて 0 px（1 px に満たない）なら知らせない。知らせる px は限り ± 丸めた量なので、
    // 「0 px はみ出す」は出ない（結論の行の上の余裕と同じ考え。下・右・左・縦組みの見出しの列と結論の列で同じ決まり）
    const overB = Math.round(maxB - lim), overR = Math.round(maxR - limR), overL = Math.round(limL - minL);
    // 知らせの値：結論の行の上端（conclTop）・1 行の高さ（line）・右の限り（bodyRight の lim）は、既定と違うときだけ添える（既定のテーマの結果は前と同じ）
    if (overB >= 1) {
      bodyOver = true;
      const a = { px: lim + overB, lim, concl: !tate && !noconcl };
      if (a.concl && M.concl.top !== DM.concl.top) a.conclTop = M.concl.top;
      if (M.body.line !== DM.body.line) a.line = M.body.line;
      add('error', 'bodyBottom', a);
    }
    if (overR >= 1) add('error', tate ? 'tateBodyHead' : 'bodyRight', tate ? { px: limR + overR, lim: limR } : limR !== 1280 - DM.body.right + 4 ? { px: limR + overR, lim: limR } : { px: limR + overR });
    if (overL >= 1) add('error', c ? 'bodyConclCol' : 'bodyLeft', { px: limL - overL, lim: limL });
    // 文字の大きさ：本文 27px（20pt）以上，図・表 24px（18pt）以上。出典・ページ番号・図キャプションは除く
    if (!refRe.test(h2 ? h2.textContent : '')) {
      const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!n.textContent.trim()) continue;
        const e = n.parentElement;
        // ルビ（rt）の振り仮名は本文の半分の大きさが決まり（docs/reference.md「Japanese language arts」）
        if (e.closest('svg') || e.closest('.katex') || e.closest('[' + ANNOT + ']') || e.closest('.cite') || e.closest('.pn') || e.closest('.figcap') || e.closest('rt')) continue;
        if (hiddenEl(e)) continue;   // 読み上げ用の隠し方の中の字（.sr-only の形の 1×1 の箱・clip-path: inset(50%) など）は見えない
        const f = parseFloat(getComputedStyle(e).fontSize);
        const lim2 = e.closest('table,.plot') ? 23.9 : 26.6;
        if (f < lim2) { add('error', 'smallText', { px: f, t: n.textContent.trim().slice(0, 12) }); break; }
      }
      // 図中の文字（SVG）
      body.querySelectorAll('svg').forEach((g) => {
        const vb = g.viewBox && g.viewBox.baseVal;
        if (!vb || !vb.width) return;
        if (hiddenEl(g)) return;
        const sc = g.getBoundingClientRect().width / k / vb.width;
        const fs = [...g.querySelectorAll('text')].filter((t) => !t.closest('[' + ANNOT + ']')).map((t) => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) || 24);
        if (fs.length && Math.min(...fs) * sc < 23.9) add('error', 'smallSvgText', { px: (Math.min(...fs) * sc).toFixed(1) });
      });
    }
  }

  // ---------------------------------------------------------------- 切れる字・外に出る字（#52。警告）
  // 字の塊：HTML の文字のノード（の範囲）と SVG の <text>。見えないもの（display:none・visibility:hidden・opacity 0）、KaTeX の読み上げ用、
  // 読み上げだけの .sr-only（と、同じ形の隠し方：overflow の 1×1 の箱・clip-path: inset(50%)・clip: rect(0 0 0 0)。hiddenEl）、注目の演出の SVG、わざと切る印（CLIP）の中は数えない
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
      if (!e || e.closest('svg') || skip(e) || !shown(e) || hiddenEl(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      pieces.push({ el: e, svg: false, b: box(r), t: sample(n.textContent), n });
    }
    s.querySelectorAll('text').forEach((t) => {
      if (!t.closest('svg') || t.closest('.katex') || skip(t) || !t.textContent.trim() || !shown(t) || hiddenEl(t)) return;
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
    if (skip(cell) || !shown(cell) || hiddenEl(cell)) return;
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

// テーマの寸法の宣言と描いた箱を比べる（themeMetricsDrift。docs/contract.md §12、backlog #76）。layoutScan と同じく文字列にしてページに入れるので、外の名前を使わない。
// M：解決した metrics（なければ既定）。見本のスライドは見えない（.slide は .active でなければ visibility:hidden）。足して測ってすぐ外す
// 比べ方：本文・結論の行・縦組みの列の位置は ±1px で等しい。body.floor は noconcl の本文の下端から .pn の上端の間、tate.floor は縦組みの本文の下端から 720 の間。
// 進み具合の帯の高さ（--bar-h）は 720 − body.floor 以下
export function metricsProbe(doc, M0) {
  const DM = { body: { left: 48, right: 48, top: 122, floor: 680, line: 46 }, concl: { top: 571, height: 72 }, tate: { rule: 1166, conclRight: 120, left: 48, floor: 680 } };
  const om = M0 || {};
  const M = { body: Object.assign({}, DM.body, om.body), concl: Object.assign({}, DM.concl, om.concl), tate: Object.assign({}, DM.tate, om.tate) };
  const stage = doc.getElementById('stage') || doc.body;
  const r2 = (x) => Math.round(x * 100) / 100;
  const mk = (cls, concl) => {
    const s = doc.createElement('section');
    s.className = cls;
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('data-metrics-probe', '');
    const h = doc.createElement('h2'); h.textContent = '1'; s.appendChild(h);
    s.appendChild(Object.assign(doc.createElement('div'), { className: 'body' }));
    if (concl) { const c = doc.createElement('div'); c.className = 'concl'; c.textContent = '1'; s.appendChild(c); }
    const pn = doc.createElement('div'); pn.className = 'pn'; pn.textContent = '1'; s.appendChild(pn);
    return s;
  };
  const S = [mk('slide', true), mk('slide noconcl', false), mk('slide layout-tate', true), mk('slide layout-tate noconcl', false)];
  S.forEach((s) => stage.appendChild(s));
  const measure = () => {
    const box = (s, sel) => {
      const sr = s.getBoundingClientRect(), k = sr.width / 1280 || 1, e = s.querySelector(sel);
      const r = e.getBoundingClientRect();
      return { l: (r.left - sr.left) / k, t: (r.top - sr.top) / k, r: (r.right - sr.left) / k, b: (r.bottom - sr.top) / k };
    };
    const [h, n, t, tn] = S;
    const b = box(h, '.body'), c = box(h, '.concl'), nb = box(n, '.body'), pn = box(n, '.pn'), th = box(t, 'h2'), tc = box(t, '.concl'), tb = box(t, '.body'), tnb = box(tn, '.body');
    const lh = parseFloat(getComputedStyle(h.querySelector('.body')).lineHeight);
    const bar = doc.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;height:var(--bar-h,3px)';
    doc.body.appendChild(bar);
    const barH = bar.getBoundingClientRect().height;
    bar.remove();
    return {
      body: { left: r2(b.l), right: r2(1280 - b.r), top: r2(b.t), bottom: r2(b.b), line: isFinite(lh) ? r2(lh) : null, noconclBottom: r2(nb.b), pnTop: r2(pn.t) },
      concl: { top: r2(c.t), height: r2(c.b - c.t) },
      tate: { rule: r2(th.l), conclRight: r2(tc.r), left: r2(tnb.l), bottom: r2(Math.max(tb.b, tnb.b)) },
      barH: r2(barH),
    };
  };
  let measured, theme;
  try {
    measured = measure();
    // デッキの CSS（#deck-base のほかの <style>・<link>）を外して、もう一度（テーマと体裁の CSS だけの箱）
    const off = [];
    for (const sh of [...doc.styleSheets]) { const nd = sh.ownerNode; if (nd && nd.id !== 'deck-base' && !sh.disabled) { sh.disabled = true; off.push(sh); } }
    try { theme = measure(); } finally { off.forEach((sh) => { sh.disabled = false; }); }
  } finally { S.forEach((s) => s.remove()); }
  const T = 1;
  const items = [];
  const cmp = (field, decl, get) => {
    const m = get(measured), th = get(theme);
    if (Math.abs(m - decl) > T) items.push({ field, declared: decl, measured: m, by: Math.abs(th - decl) > T ? 'theme' : 'deck' });
  };
  cmp('body.left', M.body.left, (x) => x.body.left);
  cmp('body.right', M.body.right, (x) => x.body.right);
  cmp('body.top', M.body.top, (x) => x.body.top);
  cmp('concl.top', M.concl.top, (x) => x.concl.top);
  cmp('concl.height', M.concl.height, (x) => x.concl.height);
  cmp('tate.rule', M.tate.rule, (x) => x.tate.rule);
  cmp('tate.conclRight', M.tate.conclRight, (x) => x.tate.conclRight);
  cmp('tate.left', M.tate.left, (x) => x.tate.left);
  // 範囲の項目：measured は [下, 上]
  const rng = (field, decl, get) => {
    const m = get(measured), th = get(theme);
    const out = (q) => decl < q[0] - T || decl > q[1] + T;
    if (out(m)) items.push({ field, declared: decl, measured: m, by: out(th) ? 'theme' : 'deck' });
  };
  rng('body.floor', M.body.floor, (x) => [x.body.noconclBottom, x.body.pnTop]);
  rng('tate.floor', M.tate.floor, (x) => [x.tate.bottom, 720]);
  // 進み具合の帯（舞台の下端に重なる）は、本文の地より下に収まる
  if (measured.barH > 720 - M.body.floor + T) items.push({ field: '--bar-h', declared: 720 - M.body.floor, measured: measured.barH, by: theme.barH > 720 - M.body.floor + T ? 'theme' : 'deck' });
  return { measured, theme, items };
}

// 寸法を測る前に、見本の字（見出しとページ番号の「1」。どの組み立てでも埋め込む字）の字体が同梱の字体で読み込まれていることを確かめる。
// 代わりの字体（機械の字体）では測らない：読み込めなければ ok: false と、読み込めなかった字体の名前（missing）を返し、呼び手は測らずに
// metricsFontLoad を知らせる。document.fonts.ready を待ってから、見出し（太字 43px）とページ番号（16px）の字体を document.fonts.load で読み、
// 同梱の字体（document.fonts の FontFace）がその字を受け持ち（load の結果が空でない）、document.fonts.check が true のときだけ ok。layoutScan と同じく文字列でページに入れる
export async function metricsFonts(doc, timeoutMs) {
  const F = doc.fonts;
  if (!F || typeof F.load !== 'function') return { ok: false, missing: ['document.fonts'] };
  const T = '1';
  const wait = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), timeoutMs || 10000))]);
  await wait(F.ready);
  const stage = doc.getElementById('stage') || doc.body;
  const s = doc.createElement('section');
  s.className = 'slide';
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('data-metrics-probe', '');
  const h = doc.createElement('h2'); h.textContent = T; s.appendChild(h);
  const pn = doc.createElement('div'); pn.className = 'pn'; pn.textContent = T; s.appendChild(pn);
  stage.appendChild(s);
  const want = [h, pn].map((e) => { const st = getComputedStyle(e); return { font: st.fontStyle + ' ' + st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily, family: st.fontFamily }; });
  s.remove();
  const unq = (x) => x.trim().replace(/^["']|["']$/g, '');
  const bundled = new Set();
  F.forEach((f) => bundled.add(unq(f.family)));
  const missing = [];
  for (const w of want) {
    const fams = w.family.split(',').map(unq).filter(Boolean);
    const own = fams.find((x) => bundled.has(x));
    if (!own) { missing.push(fams[0] || w.family); continue; }
    let faces = null;
    try { faces = await wait(F.load(w.font, T)); } catch (e) { faces = null; }
    if (!faces || !faces.length || !F.check(w.font, T) || faces.some((f) => f.status !== 'loaded')) missing.push(own);
  }
  return { ok: !missing.length, missing: [...new Set(missing)] };
}

// 編集アプリの仲立ち（app/frame-shim.js の文字列。「(function frameShim(cfg){…})」）に、この関数・寸法の比べ方（metricsProbe・metricsFonts）と印の名前を渡す形にする。
// 戻り値も「(…)(cfg)」で呼べる 1 つの式（仲立ちの中では layoutScan・metricsProbe・metricsFonts・LAYOUT_CLIP・LAYOUT_ANNOT という名前で使える）
export function withLayoutScan(shimSrc) {
  // 仲立ちの文字列は注釈の行から始まるので、return の後ろで改行して括弧で囲む（return の直後の改行で式が切れないように）
  return `(function(layoutScan, LAYOUT_CLIP, LAYOUT_ANNOT, metricsProbe, metricsFonts){return (\n${String(shimSrc).trim()}\n);})(${layoutScan}, ${JSON.stringify(CLIP_ATTR)}, ${JSON.stringify(ANNOT_ATTR)}, ${metricsProbe}, ${metricsFonts})`;
}
