// 図の札の字の範囲を測る（backlog #201）：同梱の字体を埋め込んだページで、canvas の actualBoundingBox（em）を出し、
// kit/core/text-band.mjs の TEXT_BANDS と比べる。字体を足したら FONTS に 1 行足して回し、出た値を表に足す。
//   node tools/measure-text-band.mjs [--json]
// 手で回す道具（試験ではない。ブラウザが要る）。表より広い字体があれば終了コード 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { TEXT_BANDS } from '../kit/core/text-band.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NM = path.join(ROOT, 'node_modules', '@fontsource');
// [字体の名前, @fontsource のフォルダ]。フォルダがない字体（Noto Sans JP）は手元に入っているものを測る
const FONTS = [
  ['BIZ UDPGothic', 'biz-udpgothic'], ['BIZ UDPMincho', 'biz-udpmincho'], ['Zen Maru Gothic', 'zen-maru-gothic'],
  ['Klee One', 'klee-one'], ['Shippori Mincho', 'shippori-mincho'],
  ['Source Sans 3', 'source-sans-3'], ['Source Serif 4', 'source-serif-4'], ['Source Code Pro', 'source-code-pro'],
  ['Andika', 'andika'], ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next'],
  ['Noto Sans JP', null],
];
const SAMPLES = { latin: 'Hbdfhklgjpqy', ja: '漢字の流れ図あア「」', digits: '0123456789%', mixed: '原因 Cause g', accent: 'ÉÅ' };

const face = (fam, dir) => fs.readdirSync(path.join(NM, dir, 'files')).filter((f) => /(japanese|latin)-400-normal\.woff2$/.test(f))
  .map((f) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(path.join(NM, dir, 'files', f)).toString('base64')})}`).join('');
const css = FONTS.filter(([, d]) => d).map(([f, d]) => face(f, d)).join('');

const browser = await launch();
const page = await browser.newPage();
await page.setContent(`<style>${css}</style><body>`);
const got = await page.evaluate(async ({ names, samples }) => {
  const out = {};
  for (const n of names) {
    await document.fonts.load(`100px "${n}"`, '漢字Hg').catch(() => {});
    const c = document.createElement('canvas').getContext('2d');
    c.font = `100px "${n}", monospace`;
    out[n] = { loaded: document.fonts.check(`100px "${n}"`, '漢字Hg') };
    for (const [k, t] of Object.entries(samples)) { const m = c.measureText(t); out[n][k] = { up: m.actualBoundingBoxAscent / 100, down: m.actualBoundingBoxDescent / 100 }; }
  }
  return out;
}, { names: FONTS.map(([f]) => f), samples: SAMPLES });
await browser.close();

const ceil = (x) => Math.ceil(x * 100 - 1e-9) / 100;
let wider = 0;
const rows = Object.entries(got).map(([fam, r]) => {
  const ks = ['latin', 'ja', 'digits', 'mixed'];
  const want = { up: ceil(Math.max(...ks.map((k) => r[k].up))), down: ceil(Math.max(...ks.map((k) => r[k].down))) };
  const have = TEXT_BANDS[fam];
  const bad = !have || want.up > have.up || want.down > have.down;
  if (bad) wider++;
  return { fam, loaded: r.loaded, want, have, accentUp: +r.accent.up.toFixed(3), bad };
});
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const x of rows) console.log(`${x.bad ? 'WIDER' : 'ok   '} ${x.fam.padEnd(28)} measured +${x.want.up}/−${x.want.down}  table ${x.have ? `+${x.have.up}/−${x.have.down}` : '(none)'}  accent +${x.accentUp}${x.loaded ? '' : '  (not loaded: fallback measured)'}`);
process.exit(wider ? 1 : 0);
