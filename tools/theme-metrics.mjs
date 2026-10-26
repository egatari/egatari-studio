// テーマの寸法の宣言（theme.json の metrics。docs/contract.md §12、backlog #76）を、テーマを描いて測って作る
//   node tools/theme-metrics.mjs measure <テーマ> [--lang ja|en]    測った metrics の塊を JSON で出す（theme.json に貼る）
//   node tools/theme-metrics.mjs check <テーマ> [--lang ja|en]      宣言（なければ既定）と描いた箱を比べ、違えば項目を出して終了コード 1
// <テーマ>：テーマのフォルダ（tokens.css のあるところ）か名前（利用者のテーマのフォルダ → 同梱の themes/ の順に探す。build の --theme と同じ）
// 測り方は品質チェックと同じ（kit/core/layout-scan.mjs の metricsProbe）：見えない見本のスライド（無印・noconcl・layout-tate・layout-tate noconcl）を
// 組んだデッキに足して箱を測る。値は整数の px（限りが緩くなる側へ 1px 未満で丸める）。body.floor・tate.floor は測った範囲（本文の下端〜ページ番号の上端、縦組みの本文の下端〜720）に今の値を収めたもの。
// 同梱の字体が読み込めなければ測らない（終了コード 2）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';
import { metricsProbe, metricsFonts } from '../kit/core/layout-scan.mjs';
import { DEFAULT_METRICS } from '../kit/core/theme-metrics.mjs';

const DECK = (lang) => `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>theme metrics</title></head>
<body>
<div id="stage">
<section class="slide noconcl static" id="s-probe"><h2>${lang === 'ja' ? '寸法' : 'Metrics'}</h2><div class="body"><p>${lang === 'ja' ? '本文' : 'Body'}</p></div></section>
</div>
</body>
</html>
`;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

// 測った箱 → metrics の塊（整数の px）。どの端も外へ、限りが緩くなる側へ丸める（1px 未満。ずれの許し 1px より小さいので、丸めだけでずれにはならない）：
//   body.left・body.top・body.right は欄が広がる側（切り捨て。右の限り 1280 − right + 4 は大きくなる）、concl.top は切り上げ（下の限り concl.top − 6 が下がる）、
//   concl.height は結論の行の下端（top + height）を保つ側で切り捨て、tate.rule は切り上げ（右の限り rule − 4 が右へ）、tate.conclRight・tate.left は切り捨て（左の限りが左へ）。
// floor は、今の値（宣言か既定）が測った範囲に（1px の許しで）入ればそのまま、入らなければ範囲の端（整数で範囲の内）
export function blockFrom(measured, current = DEFAULT_METRICS) {
  const m = measured;
  const dn = (x) => Math.floor(x + 1e-6), up = (x) => Math.ceil(x - 1e-6);
  const fit = (x, lo, hi) => (x >= lo - 1 && x <= hi + 1 ? x : clamp(x, up(lo), dn(hi)));
  const bodyFloor = fit(current.body.floor, m.body.noconclBottom, m.body.pnTop);
  const tateFloor = fit(current.tate.floor, m.tate.bottom, 720);
  const conclTop = up(m.concl.top);
  return {
    v: 1,
    body: { left: dn(m.body.left), right: dn(m.body.right), top: dn(m.body.top), floor: bodyFloor, line: m.body.line ? Math.round(m.body.line) : current.body.line },
    concl: { top: conclTop, height: dn(m.concl.top + m.concl.height) - conclTop },
    tate: { rule: up(m.tate.rule), conclRight: dn(m.tate.conclRight), left: dn(m.tate.left), floor: tateFloor },
  };
}

// テーマを組んで測る。{theme（build の名前）, metrics（宣言を解決したもの）, declared, measured, items（宣言と違う項目）, block（測った塊）, warn}
// browser を渡せばそれを使う（試験が 1 つのブラウザで何度も測る）
export async function measureTheme(themeArg, { lang = 'ja', browser = null, work = null } = {}) {
  const theme = fs.existsSync(path.resolve(themeArg)) && fs.statSync(path.resolve(themeArg)).isDirectory() ? path.resolve(themeArg) : themeArg;
  const dir = work || fs.mkdtempSync(path.join(os.tmpdir(), 'theme-metrics-'));
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'deck.html');
  fs.writeFileSync(src, DECK(lang));
  const r = build(src, { theme, subset: false });
  const out = path.join(dir, 'out.html');
  fs.writeFileSync(out, r.html);
  const b = browser || await launch();
  try {
    const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl(out));
    await page.waitForFunction(() => window.DECK && window.DECK.ready, null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    // 同梱の字体が読み込まれてから測る（代わりの字体では測らない。品質チェックと同じ metricsFonts）
    await page.evaluate(`window.__metricsProbe = ${metricsProbe}; window.__metricsFonts = ${metricsFonts}`);
    const f = await page.evaluate(() => window.__metricsFonts(document));
    if (!f.ok) throw Object.assign(new Error(`the bundled fonts did not load (${f.missing.join(', ')}); a fallback font is never measured`), { code: 'metricsFontLoad' });
    const p = await page.evaluate((M) => window.__metricsProbe(document, M), r.theme.metrics);
    await page.close();
    return { theme: r.theme.name, metrics: r.theme.metrics, declared: r.theme.declared, measured: p.measured, items: p.items, block: blockFrom(p.measured, r.theme.metrics),
      warn: r.stats.warn.filter((w) => /^theme-metrics: /.test(w)) };
  } finally {
    if (!browser) await b.close();
    if (!work) fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const li = args.indexOf('--lang'), lang = li >= 0 ? args[li + 1] : 'ja';
  const [cmd, themeArg] = args.filter((a, i) => !a.startsWith('--') && !(li >= 0 && i === li + 1));
  if (!['measure', 'check'].includes(cmd) || !themeArg || !['ja', 'en'].includes(lang)) {
    console.error('usage: node tools/theme-metrics.mjs measure|check <theme folder or name> [--lang ja|en]');
    process.exit(2);
  }
  let res;
  try { res = await measureTheme(themeArg, { lang }); } catch (e) { console.error('theme-metrics: ' + e.message); process.exit(2); }
  for (const w of res.warn) console.error(w);
  if (cmd === 'measure') {
    console.log(JSON.stringify({ metrics: res.block }, null, 2));
    if (res.items.length) console.error(`theme-metrics: the rendered boxes differ from the ${res.declared ? 'declared' : 'default'} geometry of "${res.theme}" (${res.items.map((x) => x.field).join(', ')}): paste the block above into theme.json`);
  } else {
    if (!res.items.length) { console.log(`ok: "${res.theme}" renders as ${res.declared ? 'declared' : 'the default geometry (no metrics needed)'}`); process.exit(0); }
    for (const x of res.items) console.log(`${x.field}: declared ${x.declared}, rendered ${Array.isArray(x.measured) ? x.measured.join('–') : x.measured}`);
    console.log(`"${res.theme}" ${res.declared ? 'does not render as declared' : 'moves layout boxes without declaring metrics'}: run node tools/theme-metrics.mjs measure ${themeArg}`);
    process.exit(1);
  }
}
