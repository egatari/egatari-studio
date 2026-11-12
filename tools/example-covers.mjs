// サンプルのカードの表紙の絵（examples/_covers/<名前>.webp）を、サンプルそのものから作る。手で描かない・手で直さない
//   node tools/example-covers.mjs [名前…]   作り直す（ブラウザが要る。サンプルを写した後に。npm run covers）
//   node tools/example-covers.mjs --check   どのサンプルも絵を持ち、絵の元（サンプルのフォルダの hash）が今のフォルダと同じか（ブラウザなし。npm run gen:check）
// 作り方：tools/examples-portable.mjs と同じく 1 ファイルに組み、1 枚目のスライドを最後のステップまで進めて、スライド全体（16:9）を撮る。
// 絵は 384×216（カードでは 192×108 で、高い密度の画面にも足りる）の WebP。tools/build-app.mjs が dist/examples/<名前>.cover.webp に写す。
// examples/_covers/index.json に {名前: {src, title}}（src はフォルダの hash の先頭、title はサンプルの題名）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'examples', '_covers');
const INDEX = path.join(DIR, 'index.json');
const W = 384, H = 216;

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name), base) : [path.relative(base, path.join(dir, d.name)).split(path.sep).join('/')]);
// サンプルのフォルダの hash：組み立てに入るファイル（sample.json・SOURCE.json・out・隠しファイルを除く）の名前と中身
export function folderHash(name) {
  const dir = path.join(ROOT, 'examples', name);
  const h = createHash('sha256');
  for (const f of walk(dir).filter((f) => !['sample.json', 'SOURCE.json'].includes(f) && !f.split('/').some((s) => s === 'out' || s.startsWith('.'))).sort()) {
    h.update(f + '\0'); h.update(fs.readFileSync(path.join(dir, f))); h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}
export const readCovers = () => (fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : {});

const { EXAMPLES, buildExamples } = await import('./examples-portable.mjs');

if (process.argv.includes('--check')) {
  const have = readCovers();
  const bad = [];
  for (const name of EXAMPLES) {
    if (!have[name]) bad.push(`${name}: no cover`);
    else if (!fs.existsSync(path.join(DIR, name + '.webp'))) bad.push(`${name}: examples/_covers/${name}.webp is missing`);
    else if (have[name].src !== folderHash(name)) bad.push(`${name}: the cover is from an older copy of the sample`);
  }
  for (const name of Object.keys(have)) if (!EXAMPLES.includes(name)) bad.push(`${name}: a cover for a sample that is not in examples/index.json`);
  if (bad.length) { console.error('example-covers: ' + bad.join('; ') + ' — run npm run covers'); process.exit(1); }
  console.log(`example-covers: ${EXAMPLES.length} covers match the samples`);
  process.exit(0);
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = only.length ? only : EXAMPLES;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'example-covers-'));
const built = await buildExamples(tmp, { names });
const { launch, fileUrl, prepareForCapture, releaseCapture } = await import('../kit/browser.mjs');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
const covers = readCovers();
fs.mkdirSync(DIR, { recursive: true });
for (const x of built) {
  await page.goto(fileUrl(path.join(tmp, x.file)) + '?mode=talk');
  await page.waitForFunction(() => window.DECK && DECK.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => DECK.seek(0, DECK.slides[0]._max, Infinity));
  const el = await page.$('.slide');
  await prepareForCapture(page);
  const png = await (el || page).screenshot({ animations: 'disabled', caret: 'hide' });
  await releaseCapture(page).catch(() => {});
  const b64 = await page.evaluate(async ([b, w, h]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
    g.imageSmoothingQuality = 'high'; g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, [Buffer.from(png).toString('base64'), W, H]);
  const title = x.title;
  fs.writeFileSync(path.join(DIR, x.name + '.webp'), Buffer.from(b64, 'base64'));
  covers[x.name] = { src: folderHash(x.name), title };
  console.log(`${x.name}: ${(Buffer.from(b64, 'base64').length / 1024).toFixed(0)} KB (${title})`);
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
const sorted = Object.fromEntries(EXAMPLES.filter((n) => covers[n]).map((n) => [n, covers[n]]));
fs.writeFileSync(INDEX, JSON.stringify(sorted, null, 2) + '\n');
console.log(`wrote examples/_covers: ${Object.keys(sorted).length} covers`);
