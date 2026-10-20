// ロゴの PNG・ICO のうち、仕様リポジトリ（egatari-spec）が持たない大きさ・形を、仕様のロゴ SVG から作る
//   node tools/make-logo-icons.mjs <仕様の logo/ のフォルダ> [出力先 = assets/logo]
// 作るもの：icon-192.png（mark-light.svg、透明）、favicon-dark.ico（16 px は括弧なしの glyph-dark.svg、32・48 px は mark-dark.svg）
// 仕様が持つ favicon.ico・apple-touch-icon.png・icon-512.png（= mark-512.png）は、仕様からそのまま写す。
// 描画はヘッドレスの Chrome（kit/browser.mjs）：SVG を指定の大きさで透明な背景に置いて撮る。
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../kit/browser.mjs';
import { readRegularText } from '../kit/bounded-read.mjs';

const [specDir, outDir = 'assets/logo'] = process.argv.slice(2);
if (!specDir) { console.error('usage: node tools/make-logo-icons.mjs <spec logo dir> [out dir]'); process.exit(2); }
const svg = (f) => readRegularText(path.join(specDir, f)).text;

const browser = await launch();
const page = await browser.newPage();
async function render(svgText, size) {
  await page.setViewportSize({ width: 600, height: 600 }); // 小さい窓は Chrome が広げるので、大きな窓に置いて切り抜く
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svgText.replace(/(<svg[^>]*?)\swidth="\d+"\s+height="\d+"/, '$1')}`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
// PNG を並べた ICO
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let off = head.length;
  entries.forEach(({ size, png }, i) => {
    const b = 6 + 16 * i;
    head[b] = size; head[b + 1] = size; head.writeUInt16LE(1, b + 4); head.writeUInt16LE(32, b + 6);
    head.writeUInt32LE(png.length, b + 8); head.writeUInt32LE(off, b + 12); off += png.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.png)]);
}
fs.writeFileSync(path.join(outDir, 'icon-192.png'), await render(svg('mark-light.svg'), 192));
fs.writeFileSync(path.join(outDir, 'favicon-dark.ico'), ico([
  { size: 16, png: await render(svg('glyph-dark.svg'), 16) },
  { size: 32, png: await render(svg('mark-dark.svg'), 32) },
  { size: 48, png: await render(svg('mark-dark.svg'), 48) },
]));
await browser.close();
