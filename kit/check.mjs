// 組んだデッキをヘッドレス Chrome で検査する
// 約束事は docs/contract.md、段階の規則は skills/motion-slides/SKILL.md §4
//
//   node kit/check.mjs <deck.html> [--json]
//
// A. 体裁の検査（はみ出し・文字の大きさ・字数・表記・段階 0 の一覧）
//    ただし段階の状態は DECK.seek(i, k, Infinity) で作る（beforeprint の代わり）
// B. 口述原稿（narration.md）との対応：抜け・式の読み上げ・長すぎる 1 ターン
// C. パレットのコントラスト（WCAG）
// D. 部品の再現性（呼び出し順で絵が変わらないか）
// E. タイムラインの長さの一覧
// F. 注目の演出（{mark:…}）：目印が見つかるか、段階ごとの印の一覧
// G. モーフ（data-morph）：元のスライドと対応する data-id があるか、対応の一覧
// 言語：<html lang> が ja 以外（英語など）なら、です・ます／句読点を見ず、字数は文字数（タイトル 60・結論 70 で警告）、
//       式らしさは \ ^ _ と演算子の密度だけ、長いターンは 60 語で見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './browser.mjs';
import { build, isJapanese } from './build.mjs';

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ti = args.indexOf('--theme'), theme = ti >= 0 ? args[ti + 1] : undefined;
const src = args.find((a, i) => !a.startsWith('--') && !(ti >= 0 && i === ti + 1));
if (!src) {
  console.error('usage: node kit/check.mjs <deck.html> [--theme name] [--json]');
  process.exit(1);
}

// ---------------------------------------------------------------- 結果の置き場
// slide: null（デッキ全体）または {i, title}。sev: 'error' | 'warn' | 'info'
const results = [];
function report(slide, sev, msg) { results.push({ slide, sev, msg }); }
const SEV_RANK = { error: 0, warn: 1, info: 2 };

// ---------------------------------------------------------------- 字数（全角 1・半角 0.5）
function units(s) {
  return [...s].reduce((a, ch) => a + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);
}

// ---------------------------------------------------------------- 式らしさ（読み上げ原稿としての警告用）
// バックスラッシュ・^・_、短い区間に = + − × が 4 つ以上、ラテン文字が密な文字列
function denseOps(s) {
  const ops = '=+−×*'; // = + − ×
  for (let i = 0; i < s.length; i++) {
    let c = 0;
    for (let j = i; j < Math.min(s.length, i + 15); j++) if (ops.includes(s[j])) c++;
    if (c > 3) return true;
  }
  return false;
}
function formulaLike(s) {
  if (/\\|\^|_/.test(s)) return true;
  if (denseOps(s)) return true;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const total = s.replace(/\s/g, '').length;
  return total > 0 && letters >= 4 && letters / total > 0.5;
}
// 英語の原稿：ラテン文字が多いのは当たり前なので、バックスラッシュ・^・_ と、15 字に演算子 3 つ以上だけを見る
function formulaLikeEn(s) {
  if (/\\|\^|_/.test(s)) return true;
  const ops = '=+−×*<>≤≥/';
  for (let i = 0; i < s.length; i++) {
    let c = 0;
    for (let j = i; j < Math.min(s.length, i + 15); j++) if (ops.includes(s[j])) c++;
    if (c >= 3) return true;
  }
  return false;
}

// ---------------------------------------------------------------- WCAG コントラスト
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastOf(rgbA, rgbB) {
  const a = luminance(rgbA), b = luminance(rgbB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- 1. ビルド（メモリ上）
let built;
try { built = build(src, theme ? { theme } : {}); }
catch (e) { console.error('ビルド失敗: ' + e.message); process.exit(1); }
// 言語：<html lang> が ja か、lang が無ければ日本語の規則。それ以外（英語など）は英語の規則
const lang = built.html.match(/<html[^>]*\slang="([^"]*)"/)?.[1] || '';
const JA = isJapanese(lang);
for (const w of built.stats.warn) {
  // 目印の有無は F で、部品が作った要素も含めて実際の画面で調べる（build は原稿の文字列だけを見る）
  if (/^mark: 目印/.test(w)) continue;
  // narration.md の見出しがどのスライドにも対応しない → 原稿と見出しがずれている重大な不整合
  report(null, /^narration:/.test(w) ? 'error' : 'warn', w);
}

// ---------------------------------------------------------------- 2. 一時ファイルへ書き出し、ヘッドレス Chrome で開く
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macs-check-'));
const tmpFile = path.join(tmpDir, 'deck.html');
fs.writeFileSync(tmpFile, built.html);
const url = 'file://' + tmpFile;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
await page.evaluate(() => document.fonts.ready);

for (const e of consoleErrors) report(null, 'error', 'コンソールエラー: ' + e);

// スライドの一覧（番号・鍵・タイトル・段階数・static か・部品の数）
const meta = await page.evaluate(() => DECK.slides.map((s, i) => ({
  i,
  key: s._key,
  max: s._max,
  static: s.classList.contains('static'),
  comps: s._comps.length,
  title: (s.querySelector('h2, h1')?.innerText || s._key).replace(/\s+/g, ' ').trim(),
})));
const titleOf = (i) => meta[i] ? meta[i].title : String(i);

// ================================================================ A. 体裁の検査
const aOut = await page.evaluate(([metaList, JA]) => {
  const S = DECK.slides;
  const step0 = [], punct = [];
  const style = [], soft = [];
  const units = (s) => [...s].reduce((a, ch) => a + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);

  // 1. 段階 0 で見えている本文（static でないスライドだけ）
  metaList.forEach((m) => {
    if (m.static) return;
    DECK.seek(m.i, 0, Infinity);
    const body = S[m.i].querySelector('.body');
    if (!body) return;
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n, t = '';
    while ((n = tw.nextNode())) {
      const e = n.parentElement;
      if (e.closest('.katex-mathml') || e.closest('svg')) continue;
      let hid = false;
      for (let a = e; a && a !== body; a = a.parentElement) {
        if (a.hasAttribute('data-step') && !a.classList.contains('on')) { hid = true; break; }
      }
      if (!hid) t += n.textContent;
    }
    step0.push({ i: m.i, text: t.replace(/\s+/g, '').slice(0, 80) });
  });

  // 2. 各スライドを最終段階まで出した状態で体裁を調べる
  metaList.forEach((m) => {
    DECK.seek(m.i, m.max, Infinity);
    const s = S[m.i];
    const sr = s.getBoundingClientRect();
    const k = sr.width / 1280 || 1;
    const issues = [], warns = [];
    const h2 = s.querySelector('h2'), c = s.querySelector('.concl'), body = s.querySelector('.body');
    if (h2) {
      const t = h2.textContent.trim();
      if (JA && units(t) > 26) issues.push(`タイトル ${units(t)} 字（26 字まで）`);
      if (!JA && t.length > 60) warns.push(`タイトル ${t.length} 文字（英語は 60 文字まで）`);
      if (/[：:]$/.test(t)) issues.push('タイトルがコロンで終わる');
    }
    if (c) {
      const t = c.textContent.trim();
      if (JA && units(t) > 35) issues.push(`結論の行 ${units(t)} 字（35 字まで）`);
      if (!JA && t.length > 70) warns.push(`結論の行 ${t.length} 文字（英語は 70 文字まで）`);
      if (c.scrollWidth > c.clientWidth + 1) issues.push('結論の行が枠からはみ出す');
    }
    if (body) {
      // 結論の行があるときは上端 571px の手前（元キットの余裕を見た値 565px）、ないときは 680px
      const lim = s.classList.contains('noconcl') ? 680 : 565;
      let maxB = 0, maxR = 0;
      body.querySelectorAll('*').forEach((el) => {
        if (el.closest('svg') && el.tagName !== 'svg') return;
        if (el.closest('.katex') && !el.classList.contains('katex')) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        maxB = Math.max(maxB, (r.bottom - sr.top) / k);
        maxR = Math.max(maxR, (r.right - sr.left) / k);
      });
      if (maxB > lim) issues.push(`本文が下にはみ出す（${Math.round(maxB)}px > ${lim}、結論の行の上端は 571px）`);
      if (maxR > 1236) issues.push(`本文が右にはみ出す（${Math.round(maxR)}px）`);
      // 文字の大きさ：本文 27px（20pt）以上，図・表 24px（18pt）以上。出典・ページ番号・図キャプションは除く
      if (!/文献/.test(h2 ? h2.textContent : '')) {
        const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
          if (!n.textContent.trim()) continue;
          const e = n.parentElement;
          if (e.closest('svg') || e.closest('.katex') || e.closest('.cite') || e.closest('.pn') || e.closest('.figcap')) continue;
          const f = parseFloat(getComputedStyle(e).fontSize);
          const lim2 = e.closest('table,.plot') ? 23.9 : 26.6;
          if (f < lim2) { issues.push(`文字が小さい ${f}px：「${n.textContent.trim().slice(0, 12)}」`); break; }
        }
        // 図中の文字（SVG）
        body.querySelectorAll('svg').forEach((g) => {
          const vb = g.viewBox && g.viewBox.baseVal;
          if (!vb || !vb.width) return;
          const sc = g.getBoundingClientRect().width / k / vb.width;
          const fs = [...g.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) || 24);
          if (fs.length && Math.min(...fs) * sc < 23.9) issues.push(`図中の文字が小さい（${(Math.min(...fs) * sc).toFixed(1)}px）`);
        });
      }
      const txt = body.innerText;
      // 句読点はデッキの中でそろっていればよい（どちらにするかは元の原稿に合わせる）。数えて後で比べる
      // 句読点とです・ますは日本語のデッキだけ
      if (JA) punct.push({ i: m.i, jp: (txt.match(/[、。]/g) || []).length, en: (txt.match(/[，．]/g) || []).length });
      if (JA && /(です|ます)(?=[。．、，」）\s]|$)/m.test(txt)) issues.push('です・ます');
      if (/\\\(|\\\[|\$[^$]+\$/.test(txt)) issues.push('数式の書き方の残り（KaTeX で組まれていない）');
      if (body.querySelector('.katex-error')) issues.push('KaTeX エラーが残っている');
    }
    if (issues.length) style.push({ i: m.i, issues });
    if (warns.length) soft.push({ i: m.i, issues: warns });
  });
  return { step0, style, soft, punct };
}, [meta, JA]);

for (const { i, text } of aOut.step0) report(i, 'info', `段階 0 の本文：「${text}」`);
for (const { i, issues } of aOut.style) for (const msg of issues) report(i, 'error', msg);
for (const { i, issues } of aOut.soft) for (const msg of issues) report(i, 'warn', msg);
{
  const tot = aOut.punct.reduce((a, p) => ({ jp: a.jp + p.jp, en: a.en + p.en }), { jp: 0, en: 0 });
  if (tot.jp && tot.en) {
    const major = tot.jp >= tot.en ? 'jp' : 'en', minor = major === 'jp' ? 'en' : 'jp';
    const name = { jp: '「、。」', en: '「，．」' };
    for (const p of aOut.punct) if (p[minor]) report(p.i, 'warn', `句読点が混ざっている：${name[minor]}が ${p[minor]} 個（デッキの多くは${name[major]}）`);
  }
}

// ================================================================ B. 口述原稿
const narrInfo = await page.evaluate((metaList) => {
  const out = [];
  metaList.forEach((m) => {
    if (m.static) return;
    const s = DECK.slides[m.i];
    for (let k = 0; k <= m.max; k++) {
      const full = DECK.stepKey(m.i, k);
      const sk = full.slice(s._key.length + 1);
      const turns = (DECK.NARRATION[s._key] || {})[sk] || [];
      out.push({ i: m.i, stepKey: sk, turns });
    }
  });
  return out;
}, meta);

const stepLabel = (sk) => (sk === 'concl' ? '結論' : `段階 ${sk}`);
for (const { i, stepKey, turns } of narrInfo) {
  if (turns.length === 0) { report(i, 'warn', `口述原稿が無い（${stepLabel(stepKey)}）`); continue; }
  for (const t of turns) {
    if ((JA ? formulaLike : formulaLikeEn)(t.text)) report(i, 'warn', `式は読まずに言葉で（${stepLabel(stepKey)}）：「${t.text.slice(0, 40)}」`);
    if (JA && t.text.length > 200) report(i, 'info', `1 ターンが長い（${t.text.length} 字、${stepLabel(stepKey)}）`);
    const words = t.text.trim().split(/\s+/).length;
    if (!JA && words > 60) report(i, 'info', `1 ターンが長い（${words} 語、${stepLabel(stepKey)}）`);
  }
}

// ================================================================ C. パレットのコントラスト
// oklch() や color-mix() は getComputedStyle だけでは rgb に落ちないことがあるので、
// 一度 1x1 の canvas に塗って画素として読み、実際に表示される sRGB 値を得る
const palette = await page.evaluate(() => {
  const vars = ['--fg', '--term', '--emph', '--muted', '--title', '--accent2', '--bg'];
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const out = {};
  for (const v of vars) {
    probe.style.color = `var(${v})`;
    const css = getComputedStyle(probe).color;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[v] = { css, rgb: [d[0], d[1], d[2]] };
  }
  probe.remove();
  return out;
});
const bgRgb = palette['--bg'].rgb;
report(null, 'info', `パレット：--bg ${palette['--bg'].css} = rgb(${bgRgb.join(',')})`);
for (const v of ['--fg', '--term', '--emph', '--title', '--accent2']) {
  const { css, rgb } = palette[v];
  const ratio = contrastOf(rgb, bgRgb);
  report(null, 'info', `パレット：${v} ${css} = rgb(${rgb.join(',')}) vs --bg → コントラスト ${ratio.toFixed(2)}:1`);
  if (ratio < 4.5) report(null, 'error', `${v} と --bg のコントラストが低い（${ratio.toFixed(2)}:1 < 4.5:1）`);
}
{
  const { css, rgb } = palette['--muted'];
  const ratio = contrastOf(rgb, bgRgb);
  report(null, 'info', `パレット：--muted ${css} = rgb(${rgb.join(',')}) vs --bg → コントラスト ${ratio.toFixed(2)}:1`);
  if (ratio < 3) report(null, 'warn', `--muted と --bg のコントラストが低い（${ratio.toFixed(2)}:1 < 3:1）`);
}

// ================================================================ D. 部品の再現性（呼び出し順に依存していないか）
const CLIP = { x: 0, y: 0, width: 1280, height: 720 };
async function pixelDiff(a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
}
// 撮る前に字と描画が落ち着くのを待つ（docs/contract.md §1：seek の後に requestAnimationFrame を 2 回）
// 埋め込みの字はスライドが見えたときに初めて読まれるので、先に全部読んでおく
const settle = () => page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
  .then(() => document.fonts.ready).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
for (const m of meta) {
  if (!m.comps) continue;
  for (let k = 1; k <= m.max; k++) {
    await page.goto(url);
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await settle();
    await page.evaluate(([i, k]) => DECK.seek(i, k, 0.4), [m.i, k]);
    await settle();
    const bufA = await page.screenshot({ clip: CLIP });
    await page.evaluate(([i, max]) => DECK.seek(i, max, Infinity), [m.i, m.max]);
    await page.evaluate(([i]) => DECK.seek(i, 0, Infinity), [m.i]);
    await page.evaluate(([i, k]) => DECK.seek(i, k, 0.4), [m.i, k]);
    await settle();
    let bufB = await page.screenshot({ clip: CLIP });
    if (!bufA.equals(bufB)) { await settle(); bufB = await page.screenshot({ clip: CLIP }); }   // 描画の遅れによる誤検出を避ける
    // アンチエイリアスの揺らぎ（数ピクセル・数階調）は許す。はっきり違う画素が 40 を超えたら依存とみなす
    if (!bufA.equals(bufB) && (await pixelDiff(bufA, bufB)) > 40) report(m.i, 'error', `部品の描画が呼び出し順に依存しています（段階 ${k}）`);
  }
}
// 検査のために何度も飛び回ったので、最後にもう一度最初から開き直しておく（念のため）
await page.goto(url);
await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });

// ================================================================ F. 注目の演出
const markInfo = await page.evaluate(() => {
  const out = [];
  DECK.slides.forEach((s, i) => {
    for (let k = 0; k <= s._max; k++) {
      const m = DECK.marks(i, k);
      if (m.length) out.push({ i, key: DECK.stepKey(i, k), marks: m });
    }
  });
  return out;
});
const fmtT = (x) => (x === null || x === Infinity ? '段階の終わり' : `${(+x).toFixed(2)} s`);
for (const { i, key, marks } of markInfo) {
  const sk = key.slice(meta[i].key.length + 1);
  for (const m of marks) if (!m.found) report(i, 'warn', `注目の演出の目印「${m.id}」がスライドに無い（${stepLabel(sk)}。id="${m.id}" か data-mark="${m.id}"、式では \\htmlId{${m.id}}{…}）`);
  report(i, 'info', `注目の演出（${stepLabel(sk)}）：` + marks.map((m) => `${m.id}/${m.effect} ${fmtT(m.start)}〜${fmtT(m.end)}`).join('、'));
}

// ================================================================ G. モーフ（data-morph）
const morphInfo = await page.evaluate(() => DECK.slides.map((s, i) => ({ i, m: DECK.morph(i) })).filter((x) => x.m));
for (const { i, m } of morphInfo) {
  if (!m.src) { report(i, 'warn', `モーフの元のスライド「${m.want}」が見つからない（data-morph="鍵"、空なら前のスライド）`); continue; }
  if (!m.ids.length) report(i, 'warn', `モーフ：元のスライド「${m.src}」と同じ data-id の要素が無い（式の一部は \\morph{ID}{…}）`);
  else report(i, 'info', `モーフ（「${m.src}」から）：${m.ids.join('、')}`);
  if (m.later.length) report(i, 'info', `モーフ：段階 0 で見えないので動かさない：${m.later.join('、')}`);
  for (const id of m.dupSrc) report(i, 'warn', `モーフ：元のスライドに data-id「${id}」が 2 つ以上（初めのものだけを使う）`);
  for (const id of m.dupDst) report(i, 'warn', `モーフ：data-id「${id}」が 2 つ以上（初めのものだけを使う）`);
}

// ================================================================ E. タイムライン
const tl = await page.evaluate(() => DECK.timeline());
const total = tl.length ? tl[tl.length - 1].start + tl[tl.length - 1].dur : 0;
report(null, 'info', `タイムライン合計：${total.toFixed(2)} 秒（${tl.length} 段階）`);
const perSlide = new Map();
for (const seg of tl) perSlide.set(seg.i, (perSlide.get(seg.i) || 0) + seg.dur);
for (const [i, dur] of perSlide) report(i, 'info', `この枚の長さ：${dur.toFixed(2)} 秒`);

await browser.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

// ================================================================ 出力
const counts = { error: 0, warn: 0, info: 0 };
for (const r of results) counts[r.sev]++;
const ok = counts.error === 0;

if (asJson) {
  const out = results.map((r) => ({
    slide: r.slide === null ? null : r.slide + 1,
    title: r.slide === null ? null : titleOf(r.slide),
    sev: r.sev,
    msg: r.msg,
  }));
  console.log(JSON.stringify({ ok, counts, results: out }, null, 2));
} else {
  // スライド番号順（null＝デッキ全体は先頭）にグループ化し、各グループ内は error → warn → info
  const groups = new Map();
  for (const r of results) {
    const key = r.slide === null ? -1 : r.slide;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const MARK = { error: 'エラー', warn: '警告', info: '情報' };
  for (const key of keys) {
    const label = key === -1 ? '■ デッキ全体' : `■ ${key + 1}: ${titleOf(key)}`;
    console.log(label);
    const items = groups.get(key).sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
    for (const r of items) console.log(`  [${MARK[r.sev]}] ${r.msg}`);
  }
  console.log('');
  console.log(`エラー ${counts.error}　警告 ${counts.warn}　情報 ${counts.info}`);
}
process.exit(ok ? 0 : 1);
