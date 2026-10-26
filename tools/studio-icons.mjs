// Egatari Studio のアイコン（「す」）を作る：assets/logo/studio/ に、え（assets/logo/）と同じ置き方・大きさ・色で書く
//   node tools/studio-icons.mjs [--out <dir>] [--check]
// 作者の手描きの「す」はまだないので、BIZ UDPGothic Bold の「す」を組んだ仮のもの（placeholder）。え と同じかぎ括弧・太陽・色を使う：
//   48 px 以上（icon-192・icon-512・apple-touch-icon・ico の 48）は 256 の正方形の形（assets/logo/egatari-light.svg の括弧と太陽）、
//   24〜32 px（ico の 32）は 32 px 用の形（egatari-32-light.svg の括弧と太陽）、16 px（ico の 16）は括弧なしの字だけ（え の favicon と同じ決まり）
// 手描きに替えるとき：assets/logo/studio/hand/ に su-16-light.png・su-16-dark.png（16 × 16）、su-24-light.png・su-24-dark.png（24 × 24）を置いて
// もう一度これを走らせる。あればその PNG を ico の 16 px（と 24 px）にそのまま使う（拡大・縮小しない）。大きいものも替えるなら
// hand/su-256-light.svg（256 の正方形。え の egatari-light.svg と同じ置き方）を置けば、48 px 以上はそれから作る
// --check：書かずに、今のファイルが作り直したものと同じ大きさ・形式か（ico の中の大きさの並び、PNG の幅と高さ）だけを確かめる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(ROOT, 'assets', 'logo', 'studio');
const CHECK = args.includes('--check');
const HAND = path.join(OUT, 'hand');

// え と同じ色（assets/logo/README.md）
const COLORS = { light: { ink: '#4A488E', sun: '#D3381C' }, dark: { ink: '#A9ABFA', sun: '#F2573B' } };
// え の括弧と太陽：256 の正方形（egatari-light.svg）と 32 px 用（egatari-32-light.svg、kit/core/favicon.mjs）
const MASTER = { box: 256, bracket: 'M84 40H40V152 M172 216H216V104', stroke: 15, sun: { cx: 80, cy: 60, r: 12.5 }, glyph: { x: 134, y: 146, size: 150 } };
const OPTICAL = { box: 32, bracket: 'M10 5H5V18.5 M22 27H27V13.5', stroke: 2, sun: { cx: 10.25, cy: 8.25, r: 1.75 }, glyph: { x: 16.75, y: 18.4, size: 19 } };
const BARE = { box: 16, glyph: { x: 8, y: 8.2, size: 17 } };

// BIZ UDPGothic Bold のうち「す」（U+3059）を含むファイル（@fontsource は字の範囲ごとに分かれている）
function fontFor(cp) {
  const dir = path.join(ROOT, 'node_modules', '@fontsource', 'biz-udpgothic');
  const css = fs.readFileSync(path.join(dir, '700.css'), 'utf8');
  for (const block of css.split('@font-face').slice(1)) {
    const src = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block);
    const ur = /unicode-range:\s*([^;]+);/.exec(block);
    if (!src || !ur) continue;
    for (const r of ur[1].split(',')) {
      const [a, b] = r.trim().replace(/^U\+/i, '').split('-').map((x) => parseInt(x, 16));
      if (cp >= a && cp <= (b ?? a)) return fs.readFileSync(path.join(dir, 'files', src[1]));
    }
  }
  throw new Error('studio-icons: no BIZ UDPGothic file has U+' + cp.toString(16));
}

function svg(shape, scheme, { tile = false, px = 0 } = {}) {
  const C = COLORS[scheme], g = shape.glyph;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px || '100%'}" height="${px || '100%'}" viewBox="0 0 ${shape.box} ${shape.box}">`
    + (tile ? `<rect width="${shape.box}" height="${shape.box}" fill="#fff"/>` : '')
    + (shape.bracket ? `<path d="${shape.bracket}" fill="none" stroke="${C.ink}" stroke-width="${shape.stroke}" stroke-linecap="square" stroke-linejoin="miter"/>` : '')
    + (shape.sun ? `<circle cx="${shape.sun.cx}" cy="${shape.sun.cy}" r="${shape.sun.r}" fill="${C.sun}"/>` : '')
    + `<text x="${g.x}" y="${g.y}" font-family="SuGlyph" font-weight="700" font-size="${g.size}" fill="${C.ink}" text-anchor="middle" dominant-baseline="central">す</text></svg>`;
}

async function render(page, markup, px) {
  await page.setViewportSize({ width: Math.max(px, 64), height: Math.max(px, 64) });
  // the drawing at exactly px × px (a hand-drawn SVG gets the same size)
  await page.evaluate(([m, n]) => { const c = document.getElementById('c'); c.innerHTML = m; const v = c.querySelector('svg'); v.setAttribute('width', n); v.setAttribute('height', n); }, [markup, px]);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
}

// ICO（PNG を入れる形。今のブラウザと OS はどれも読む）
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let off = head.length;
  entries.forEach(([px, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(px >= 256 ? 0 : px, e); head.writeUInt8(px >= 256 ? 0 : px, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += png.length;
  });
  return Buffer.concat([head, ...entries.map(([, p]) => p)]);
}
export function icoSizes(buf) {
  const n = buf.readUInt16LE(4), out = [];
  for (let i = 0; i < n; i++) out.push(buf.readUInt8(6 + 16 * i) || 256);
  return out;
}
export function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }

// 書くもの（え の assets/logo と同じ名前と大きさ）
export const FILES = {
  'favicon.ico': { ico: [16, 32, 48] }, 'favicon-dark.ico': { ico: [16, 32, 48], scheme: 'dark' },
  'apple-touch-icon.png': { png: 180, tile: true }, 'icon-192.png': { png: 192 }, 'icon-512.png': { png: 512 },
};

async function make() {
  const font = fontFor(0x3059).toString('base64');
  const browser = await launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>@font-face{font-family:SuGlyph;font-weight:700;src:url(data:font/woff2;base64,${font}) format('woff2')}
    html,body{margin:0;background:transparent;overflow:hidden}#c svg{display:block}</style><div id="c"></div><span style="position:absolute;left:-100px;font:700 10px SuGlyph">す</span>`);
  await page.evaluate(() => document.fonts.load('700 10px SuGlyph', 'す'));
  const handSvg = fs.existsSync(path.join(HAND, 'su-256-light.svg'));
  const big = (scheme, tile) => (handSvg && !tile && scheme === 'light' ? fs.readFileSync(path.join(HAND, 'su-256-light.svg'), 'utf8')
    : handSvg && scheme === 'dark' && fs.existsSync(path.join(HAND, 'su-256-dark.svg')) ? fs.readFileSync(path.join(HAND, 'su-256-dark.svg'), 'utf8') : svg(MASTER, scheme, { tile }));
  const hand = (px, scheme) => { const f = path.join(HAND, `su-${px}-${scheme}.png`); return fs.existsSync(f) ? fs.readFileSync(f) : null; };
  const out = {};
  for (const [name, spec] of Object.entries(FILES)) {
    const scheme = spec.scheme || 'light';
    if (spec.png) { out[name] = await render(page, big(scheme, spec.tile), spec.png); continue; }
    const entries = [];
    for (const px of spec.ico) {
      const own = px <= 24 ? hand(px, scheme) : null;
      entries.push([px, own || await render(page, px === 16 ? svg(BARE, scheme) : px <= 32 ? svg(OPTICAL, scheme) : big(scheme, false), px)]);
      if (px === 16 && hand(24, scheme)) entries.push([24, hand(24, scheme)]);
    }
    out[name] = ico(entries);
  }
  // 見本（目で確かめる用。配らない）：明るい・暗い背景に並べる
  const sheet = await (async () => {
    await page.setViewportSize({ width: 640, height: 420 });
    const cells = (scheme, bg) => `<div style="background:${bg};display:flex;gap:16px;align-items:end;padding:12px">`
      + [16, 24, 32, 48, 64, 180].map((px) => `<div style="width:${px}px;height:${px}px">${px === 16 ? svg(BARE, scheme) : px <= 32 ? svg(OPTICAL, scheme) : svg(MASTER, scheme)}</div>`).join('') + '</div>';
    await page.evaluate((m) => { document.getElementById('c').innerHTML = m; }, cells('light', '#fff') + cells('dark', '#111'));
    return page.screenshot({ clip: { x: 0, y: 0, width: 640, height: 420 } });
  })();
  await browser.close();
  return { out, sheet };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (CHECK) {
    let bad = 0;
    for (const [name, spec] of Object.entries(FILES)) {
      const f = path.join(OUT, name);
      if (!fs.existsSync(f)) { console.error(`missing ${name}`); bad++; continue; }
      const b = fs.readFileSync(f);
      const okSize = spec.png ? pngSize(b).join('x') === `${spec.png}x${spec.png}` : spec.ico.every((s) => icoSizes(b).includes(s));
      if (!okSize) { console.error(`wrong sizes: ${name}`); bad++; }
    }
    console.log(bad ? `studio-icons --check: ${bad} problem(s)` : 'studio-icons --check: ok');
    process.exit(bad ? 1 : 0);
  }
  const { out, sheet } = await make();
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, buf] of Object.entries(out)) fs.writeFileSync(path.join(OUT, name), buf);
  const sheetPath = path.join(args.includes('--sheet') ? path.resolve(args[args.indexOf('--sheet') + 1]) : OUT, 'preview-sheet.png');
  if (args.includes('--sheet')) fs.writeFileSync(sheetPath, sheet);
  console.log(`studio-icons: ${Object.keys(out).join(', ')} -> ${path.relative(process.cwd(), OUT) || '.'}${args.includes('--sheet') ? ` (sheet ${sheetPath})` : ''}`);
}
