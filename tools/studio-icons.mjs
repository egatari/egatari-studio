// Egatari Studio のアイコン「す」を、assets/logo/studio/src/ の SVG（作者の決めた印。え と同じ紺藍・緋と暗い画面の色）から作る
//   node tools/studio-icons.mjs [--check] [--sheet <dir>]
// 書くもの（assets/logo/studio/。え の assets/logo/ と同じ名前と大きさ。tools/build-app.mjs が Studio に入れる）：
//   favicon.ico / favicon-dark.ico   16（src/studio-16-*.svg）・32（src/studio-32-*.svg）・48（src/studio-*.svg、256 の正方形）
//   favicon.svg                      32 px 用の形 1 つに、暗い画面の色を prefers-color-scheme で入れたもの（え の kit/core/favicon.mjs と同じ方式）
//   apple-touch-icon.png             180、白い正方形の上に明るい版
//   icon-192.png / icon-512.png      manifest 用、明るい版、背景は透明
// 小さい形を手で直したら：src/studio-16-light.svg・studio-16-dark.svg（や 32）を置き換えて、もう一度これを走らせるだけ。
// 16 px を絵（PNG）で直すなら hand/su-16-light.png・hand/su-16-dark.png（16 × 16）を置けば、ico の 16 にそのまま使う（拡大・縮小しない）
// --check：書かずに、今のファイルの大きさ・形式（ico の中の大きさの並び、PNG の幅と高さ、favicon.svg が src から作ったものと同じか）だけを確かめる
// --sheet <dir>：目で確かめる見本（明るい・暗い背景に、作ったファイルを実寸と拡大で並べた PNG）を <dir>/studio-icons-sheet.png に書く
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const OUT = path.join(ROOT, 'assets', 'logo', 'studio');
const SRC = path.join(OUT, 'src');
const HAND = path.join(OUT, 'hand');
const CHECK = args.includes('--check');
const si = args.indexOf('--sheet');
const SHEET = si >= 0 ? path.resolve(args[si + 1]) : null;

const src = (name) => fs.readFileSync(path.join(SRC, name + '.svg'), 'utf8');
const COLORS = { light: { ink: '#4A488E', sun: '#D3381C' }, dark: { ink: '#A9ABFA', sun: '#F2573B' } };

// favicon.svg：32 px 用の明るい版の色を class に置き換え、暗い画面の色を SVG の中の問い合わせで足す（明るい版と暗い版の形が同じことを確かめる）
export function faviconSvg() {
  const light = src('studio-32-light'), dark = src('studio-32-dark');
  const shape = (s, c) => s.replace(/<title>[^<]*<\/title>/, '').split(c.ink).join('INK').split(c.sun).join('SUN');
  if (shape(light, COLORS.light) !== shape(dark, COLORS.dark)) throw new Error('studio-icons: studio-32-light.svg and studio-32-dark.svg differ in more than colour');
  const L = COLORS.light, D = COLORS.dark;
  return light.replace(/ role="img"/, '').replace(/<title>[^<]*<\/title>/, '')
    .replace(/(<svg[^>]*>)/, `$1<style>.i{stroke:${L.ink}}.s{stroke:${L.sun}}@media (prefers-color-scheme:dark){.i{stroke:${D.ink}}.s{stroke:${D.sun}}}</style>`)
    .split(`stroke="${L.ink}"`).join('class="i"').split(`stroke="${L.sun}"`).join('class="s"');
}

// ICO（PNG を入れる形）
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
export function icoSizes(buf) { const n = buf.readUInt16LE(4), out = []; for (let i = 0; i < n; i++) out.push(buf.readUInt8(6 + 16 * i) || 256); return out; }
export function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }

// 名前 → 作り方。ico は [大きさ, 元の SVG] の並び
export const FILES = {
  'favicon.ico': { ico: [[16, 'studio-16-light'], [32, 'studio-32-light'], [48, 'studio-light']] },
  'favicon-dark.ico': { ico: [[16, 'studio-16-dark'], [32, 'studio-32-dark'], [48, 'studio-dark']] },
  'apple-touch-icon.png': { png: 180, from: 'studio-light', tile: '#ffffff' },
  'icon-192.png': { png: 192, from: 'studio-light' },
  'icon-512.png': { png: 512, from: 'studio-light' },
};

async function render(page, svg, px, tile = null) {
  await page.setViewportSize({ width: Math.max(px, 64), height: Math.max(px, 64) });
  await page.evaluate(([m, n, bg]) => {
    const c = document.getElementById('c');
    c.style.background = bg || 'transparent';
    c.style.width = c.style.height = n + 'px';
    c.innerHTML = m;
    const v = c.querySelector('svg'); v.setAttribute('width', n); v.setAttribute('height', n);
  }, [svg, px, tile]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.screenshot({ omitBackground: !tile, clip: { x: 0, y: 0, width: px, height: px } });
}

async function make() {
  const browser = await launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}#c svg{display:block}</style><div id="c"></div>');
  const hand = (px, scheme) => { const f = path.join(HAND, `su-${px}-${scheme}.png`); return fs.existsSync(f) ? fs.readFileSync(f) : null; };
  const out = {};
  for (const [name, spec] of Object.entries(FILES)) {
    if (spec.png) { out[name] = await render(page, src(spec.from), spec.png, spec.tile); continue; }
    const scheme = name.includes('dark') ? 'dark' : 'light';
    const entries = [];
    for (const [px, from] of spec.ico) entries.push([px, (px === 16 && hand(16, scheme)) || await render(page, src(from), px)]);
    out[name] = ico(entries);
  }
  out['favicon.svg'] = Buffer.from(faviconSvg());
  let sheet = null;
  if (SHEET) {
    // 作ったファイルそのものを並べる（ico は中の PNG を取り出す）。3 段目は ico の中の絵を 6 倍に（画素のまま）
    const pngsOf = (buf) => { const n = buf.readUInt16LE(4), r = []; for (let i = 0; i < n; i++) { const e = 6 + 16 * i; r.push(buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8))); } return r; };
    const img = (b, style = '') => `<img style="${style}" src="data:image/png;base64,${b.toString('base64')}">`;
    const row = (bg, parts) => `<div style="background:${bg};display:flex;gap:18px;align-items:end;padding:14px">${parts.join('')}</div>`;
    const svgImg = `<img width="32" height="32" src="data:image/svg+xml;base64,${out['favicon.svg'].toString('base64')}">`;
    const big = (buf) => pngsOf(buf).map((b) => img(b, `width:${b.readUInt32BE(16) * 6}px;image-rendering:pixelated`));
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.setContent('<!doctype html><body style="margin:0">'
      + row('#fff', [...pngsOf(out['favicon.ico']).map((b) => img(b)), svgImg, img(out['apple-touch-icon.png'], 'outline:1px solid #ccc'), img(out['icon-192.png']), img(out['icon-512.png'], 'width:256px')])
      + row('#111', [...pngsOf(out['favicon-dark.ico']).map((b) => img(b))])
      + row('#fff', big(out['favicon.ico'])) + row('#111', big(out['favicon-dark.ico'])) + '</body>');
    sheet = await page.screenshot({ fullPage: true });
  }
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
      const okSize = spec.png ? pngSize(b).join('x') === `${spec.png}x${spec.png}` : JSON.stringify(icoSizes(b)) === JSON.stringify(spec.ico.map(([px]) => px));
      if (!okSize) { console.error(`wrong sizes: ${name}`); bad++; }
    }
    if (!fs.existsSync(path.join(OUT, 'favicon.svg')) || fs.readFileSync(path.join(OUT, 'favicon.svg'), 'utf8') !== faviconSvg()) { console.error('favicon.svg is not made from src/studio-32-*.svg'); bad++; }
    console.log(bad ? `studio-icons --check: ${bad} problem(s)` : 'studio-icons --check: ok');
    process.exit(bad ? 1 : 0);
  }
  const { out, sheet } = await make();
  for (const [name, buf] of Object.entries(out)) fs.writeFileSync(path.join(OUT, name), buf);
  if (sheet) { fs.mkdirSync(SHEET, { recursive: true }); fs.writeFileSync(path.join(SHEET, 'studio-icons-sheet.png'), sheet); }
  console.log(`studio-icons: ${Object.keys(out).join(', ')} -> ${path.relative(process.cwd(), OUT) || '.'}${sheet ? ` (sheet ${path.join(SHEET, 'studio-icons-sheet.png')})` : ''}`);
}
