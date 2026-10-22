// 印刷でも章の扉（sec）の背景が落ちないこと（backlog #57）
//   node tools/test-print-backgrounds.mjs [作業フォルダ] [--png 保存先.png]
// 見ること：print の媒体で、スライドと sec の print-color-adjust が exact、sec の背景が白でも透明でもない（html・body は白のまま）、
//   画面の媒体では何も変わらない（print-color-adjust は初期値の economy のまま）。pdf を作れるときは、pdftoppm で画素にして扉の色を確かめる。
//   --png：扉のページの画像を保存する（pdftoppm があれば pdf から、なければ print の媒体の画面写真）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const pi = argv.indexOf('--png');
const png = pi >= 0 ? path.resolve(argv[pi + 1]) : null;
if (pi >= 0) argv.splice(pi, 2);
const tmp = path.resolve(argv[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-print-bg-')));
fs.rmSync(path.join(tmp, 'deck'), { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, 'deck'), { recursive: true });

const SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const SEC = '<section class="slide sec noconcl static">\n  <h1>第 1 章　勾配降下法</h1>\n  <div class="lead">傾きだけで最小点を探す</div>\n</section>\n\n';
const marker = '<section class="slide">';
assert.ok(SRC.includes(marker));
fs.writeFileSync(path.join(tmp, 'deck', 'deck.html'), SRC.replace(marker, SEC + marker));
fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(tmp, 'deck', 'narration.md'));
const built = path.join(tmp, 'deck', 'built.html');
fs.writeFileSync(built, build(path.join(tmp, 'deck', 'deck.html'), { subset: false }).html);

let n = 0;
const ok = (name) => { n++; console.log('ok   ' + name); };
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(fileUrl(built));
await p.waitForFunction(() => window.DECK && DECK.ready);
await p.evaluate(() => document.fonts.ready);

const probe = () => p.evaluate(() => {
  const g = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, adj: c.getPropertyValue('print-color-adjust') || c.getPropertyValue('-webkit-print-color-adjust') }; };
  const sec = document.querySelector('.slide.sec');
  return { sec: g(sec), slide: g(document.querySelector('.slide:not(.sec)')), html: g(document.documentElement), body: g(document.body) };
});
const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
const isPaint = (s) => { const [r, g, bl, a = 1] = rgba(s); return a > 0 && !(r === 255 && g === 255 && bl === 255); };

// 画面：print-color-adjust は初期値（economy）のまま
const screen = await probe();
assert.equal(screen.sec.adj, 'economy', 'screen: print-color-adjust is untouched');
assert.ok(isPaint(screen.sec.bg), 'screen: sec has its background');
ok('screen media: print-color-adjust stays economy, sec keeps its background');

// 印刷
await p.emulateMedia({ media: 'print' });
const pr = await probe();
assert.equal(pr.sec.adj, 'exact', 'print: sec print-color-adjust');
assert.equal(pr.slide.adj, 'exact', 'print: slide print-color-adjust');
ok('print media: slide and sec have print-color-adjust: exact');
assert.ok(isPaint(pr.sec.bg), 'print: sec background is neither white nor transparent: ' + pr.sec.bg);
assert.equal(pr.sec.bg, screen.sec.bg, 'print: sec background equals the screen one');
ok('print media: sec background is not white/transparent (' + pr.sec.bg + ')');
assert.deepEqual(rgba(pr.html.bg).slice(0, 3), [255, 255, 255], 'print: page stays white');
ok('print media: html and body stay white');

// pdf → 画素（扉のページ = 2 ページ目）
await p.emulateMedia({ media: null });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
const pdf = path.join(tmp, 'print.pdf');
await p.pdf({ path: pdf, width: '1280px', height: '720px', preferCSSPageSize: true, printBackground: false });
await b.close();
const have = spawnSync('pdftoppm', ['-v']).error === undefined;
if (have) {
  const prefix = path.join(tmp, 'page');
  const r = spawnSync('pdftoppm', ['-png', '-r', '24', '-f', '2', '-l', '2', pdf, prefix]);
  assert.equal(r.status, 0, 'pdftoppm');
  const f = fs.readdirSync(tmp).find((x) => x.startsWith('page') && x.endsWith('.png'));
  const out = path.join(tmp, f);
  const ppm = spawnSync('pdftoppm', ['-r', '24', '-f', '2', '-l', '2', pdf], { maxBuffer: 1 << 26 }).stdout;
  // P6 ヘッダの後ろの画素から、四隅の近くの色を見る
  const hdr = ppm.toString('latin1', 0, 20).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  assert.ok(hdr, 'ppm header');
  const [w, h] = [+hdr[1], +hdr[2]], off = hdr[0].length;
  const px = (x, y) => [...ppm.subarray(off + (y * w + x) * 3, off + (y * w + x) * 3 + 3)];
  const c = px(5, 5);
  assert.ok(!(c[0] > 250 && c[1] > 250 && c[2] > 250), 'pdf page 2: corner is not white: ' + c);
  ok('pdf (printBackground off): the sec page is painted (' + c.join(',') + '), not white');
  if (png) { fs.mkdirSync(path.dirname(png), { recursive: true }); fs.copyFileSync(out, png); ok('saved ' + png); }
} else console.log('skip pdftoppm not found (pdf pixel check)');
console.log(`${n} checks passed`);
