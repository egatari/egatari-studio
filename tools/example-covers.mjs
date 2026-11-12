// サンプルのカードの表紙の絵（examples/_covers/<名前>.webp）を、サンプルそのものから作る。手で描かない・手で直さない
//   node tools/example-covers.mjs --site <egatari.org の src/gallery> [名前…]
//     egatari.org のギャラリーにあるサンプル（<site>/covers/<名前>.webp がある）は、その絵をそのまま写す（作者と見本の担当が選んだ、いちばん伝わるステップ。
//     絵の元は 1 つ）。ないもの（Studio だけのサンプル）は下の作り方で作る（ブラウザが要る。npm run covers -- --site …）
//   node tools/example-covers.mjs [名前…]   --site なし：サイトから写した絵はそのまま残し、ほかを作り直す
//   node tools/example-covers.mjs --check   どのサンプルも絵を持ち、作った絵は絵の元（サンプルのフォルダの hash）が今のフォルダと同じか、サイトから写した絵は
//     sha256 が index.json のとおりか（ブラウザなし。npm run gen:check。サイトの絵と同じかは tools/examples-sync.mjs --check --lessons が照らす）
// 作り方：tools/examples-portable.mjs と同じく 1 ファイルに組み、1 枚目のスライドを最後のステップまで進めて、スライド全体（16:9）を撮る。
// 絵は 384×216（カードでは 192×108 で、高い密度の画面にも足りる）の WebP。tools/build-app.mjs が dist/examples/<名前>.cover.webp に写す。
// examples/_covers/index.json に {名前: {src, title}}（作った絵：src はフォルダの hash の先頭）か {名前: {site: true, sha256}}（サイトから写した絵）か {名前: {picked: true, sha256}}（選んだ絵）
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
    else if (have[name].site || have[name].picked) { if (createHash('sha256').update(fs.readFileSync(path.join(DIR, name + '.webp'))).digest('hex') !== have[name].sha256) bad.push(`${name}: the cover differs from the one copied (${have[name].site ? 'egatari.org' : 'picked'})`); }
    else if (have[name].src !== folderHash(name)) bad.push(`${name}: the cover is from an older copy of the sample`);
  }
  for (const name of Object.keys(have)) if (!EXAMPLES.includes(name)) bad.push(`${name}: a cover for a sample that is not in examples/index.json`);
  if (bad.length) { console.error('example-covers: ' + bad.join('; ') + ' — run npm run covers'); process.exit(1); }
  console.log(`example-covers: ${EXAMPLES.length} covers match the samples`);
  process.exit(0);
}

const argv = process.argv.slice(2);
const siteAt = argv.indexOf('--site');
const SITE = siteAt >= 0 ? path.resolve(argv.splice(siteAt, 2)[1]) : null;
// --picked <フォルダ>：Studio だけのサンプルの、見本の担当が選んだステップの絵（<フォルダ>/studio-<名前>.webp、640×360。選んだステップは同じフォルダの covers.md）
const pickedAt = argv.indexOf('--picked');
const PICKED = pickedAt >= 0 ? path.resolve(argv.splice(pickedAt, 2)[1]) : null;
const only = argv.filter((a) => !a.startsWith('-'));
const covers = readCovers();
fs.mkdirSync(DIR, { recursive: true });
let names = only.length ? only : EXAMPLES;
if (SITE) {
  for (const name of names) {
    const from = path.join(SITE, 'covers', name + '.webp');
    if (!fs.existsSync(from)) continue;
    const buf = fs.readFileSync(from);
    fs.writeFileSync(path.join(DIR, name + '.webp'), buf);
    covers[name] = { site: true, sha256: createHash('sha256').update(buf).digest('hex') };
    console.log(`${name}: from egatari.org (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}
if (PICKED) {
  for (const name of names) {
    const from = path.join(PICKED, `studio-${name}.webp`);
    if (!fs.existsSync(from) || (covers[name] && covers[name].site)) continue;
    const buf = fs.readFileSync(from);
    fs.writeFileSync(path.join(DIR, name + '.webp'), buf);
    covers[name] = { picked: true, sha256: createHash('sha256').update(buf).digest('hex') };
    console.log(`${name}: picked (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}
// 写した絵（サイト・選んだ絵）は作り直さない
names = names.filter((n) => !(covers[n] && (covers[n].site || covers[n].picked)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'example-covers-'));
const built = names.length ? await buildExamples(tmp, { names }) : [];
const { launch, fileUrl, prepareForCapture, releaseCapture } = await import('../kit/browser.mjs');
const browser = built.length ? await launch() : null;
const page = browser && await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (page) page.on('pageerror', (e) => console.error('pageerror:', e.message));
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
if (browser) await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
const sorted = Object.fromEntries(EXAMPLES.filter((n) => covers[n]).map((n) => [n, covers[n]]));
fs.writeFileSync(INDEX, JSON.stringify(sorted, null, 2) + '\n');
console.log(`wrote examples/_covers: ${Object.keys(sorted).length} covers`);
