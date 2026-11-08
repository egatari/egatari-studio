// 本文の釣り合い（R-balance の段 1、balance）の表：閾値を決めるための道具。品質チェックと同じ測り方（kit/fill-scan.mjs）で、スライドごとに
// 図があるか・縦の釣り合い（重心と光学的な中心の差、上に寄ると負）・横の釣り合い（重心と真ん中の差、左に寄ると負）・片寄った空きとその側・知らせるかどうかを出す
//   node tools/fill-report.mjs <deck.html | フォルダ …> [--json]
// フォルダは中の deck.html を下へたどって全部（node_modules・out（組み立ての出力）・ドットで始まるフォルダは見ない）。閾値は kit/core/fill-measure.mjs の BALANCE
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from '../kit/browser.mjs';
import { build } from '../kit/build.mjs';
import { scanBalance } from '../kit/fill-scan.mjs';
import { BALANCE } from '../kit/core/fill-measure.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const inputs = args.filter((a) => !a.startsWith('--'));
if (!inputs.length) { console.error('usage: node tools/fill-report.mjs <deck.html | folder …> [--json]'); process.exit(2); }

function decksIn(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'out') continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name === 'deck.html') out.push(f);
    }
  };
  walk(p);
  return out;
}
const decks = inputs.flatMap(decksIn);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fill-report-'));
const browser = await launch();
const all = [];
try {
  for (const [n, deck] of decks.entries()) {
    let built;
    try { built = build(deck); } catch (e) { all.push({ deck, error: e.message }); continue; }
    const f = path.join(tmp, `${n}.html`);
    fs.writeFileSync(f, built.html);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl(f));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const meta = await page.evaluate(() => DECK.slides.map((s, i) => ({ i, max: s._max, id: s.id || null, title: ((s.querySelector('h2, h1') || {}).textContent || '').replace(/\s+/g, ' ').trim() })));
    const rows = await scanBalance(page, meta);
    await page.close();
    all.push({ deck, slides: rows.map((r) => ({ n: r.i + 1, id: meta[r.i].id, title: meta[r.i].title, ...r })) });
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (asJson) { console.log(JSON.stringify({ thresholds: BALANCE, decks: all }, null, 2)); process.exit(0); }
const fmt = (x) => (x === undefined ? '' : x.toFixed(1));
console.log(`flagged when the body has a visual (m-*, svg, img, table, .katex-display) whose box ends above the bottom band, vOffset < -${BALANCE.vOffset}% and bottom - top > ${BALANCE.band}% (layout-tate: hOffset > ${BALANCE.vOffset}% and left - right > ${BALANCE.band}%); optical centre ${BALANCE.optical}% from the top; tolerance ${BALANCE.tol}/255, min run ${BALANCE.minRun} px`);
for (const d of all) {
  console.log(`\n## ${path.relative(process.cwd(), d.deck) || d.deck}`);
  if (d.error) { console.log(`  build failed: ${d.error}`); continue; }
  console.log('| # | id | visual | vOffset % | hOffset % | one-sided band % | side | flagged | heading |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const s of d.slides) {
    const t = s.title.length > 30 ? s.title.slice(0, 29) + '…' : s.title;
    if (s.skip) console.log(`| ${s.n} | ${s.id || ''} | | | | | | skip (${s.skip}) | ${t} |`);
    else console.log(`| ${s.n} | ${s.id || ''} | ${s.visual ? 'yes' : 'no'} | ${fmt(s.vOffset)} | ${fmt(s.hOffset)} | ${fmt(s.band)} | ${s.side || ''}${s.tate ? ' (tate)' : ''} | ${s.flagged ? 'yes' : ''} | ${t} |`);
  }
}
