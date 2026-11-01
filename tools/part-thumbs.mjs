// 新規作成 ④ のパーツの一覧の小さな見本の絵（app/part-thumbs.js）を、パーツの見本（demo.html）から作る。手で描かない・手で直さない
//   node tools/part-thumbs.mjs           作り直す（ブラウザが要る。パーツライブラリを取り込んだ後に。npm run thumbs）
//   node tools/part-thumbs.mjs --check   一覧に出るパーツがどれも絵を持ち、絵の元（見本のフォルダの hash）が今の写しと同じか（ブラウザなし。npm run gen:check）
// 作り方（パーツライブラリの tools/gallery.mjs と同じく見本から）：一覧に出るパーツ（kit/core/new-deck.mjs の partsList）ごとに、
// パーツライブラリ 2.0 の既定のカタログ（components2.lock.json）の版の写し（vendor/components/sha256/<hash>/demo.html）を、2.0 の教材（egatari.json の
// componentsCatalogue）として kit/build.mjs で組み、1 枚目のスライドを最後のステップまで進めて、その本文（.body）を撮る。
// 明るい画面は同梱のテーマのまま、暗い画面はテーマの変数（--fg・--bg・--term …）を暗い地の値に替えて撮る（パーツは変数の色だけを使うので、そのまま暗くなる）。
// 絵は 192×120（画面では 96×60 で、高い密度の画面にも足りる）の WebP を data: URL で持つ。alt は 1 枚目の見出し（見本は日本語）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import { partsList } from '../kit/core/new-deck.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'app', 'part-thumbs.js');
const W = 192, H = 120;
// 暗い画面の見本の色（編集アプリの暗い画面 app/app.css の --panel に合わせた地。テーマの変数だけを替える）
const DARK = ':root{--base:#8fb3ff;--fg:#e8eaf0;--bg:#20232a;--title:#8fb3ff;--term:#8fb3ff;--emph:#ff8f73;--accent2:#e2b35e;--complement:#e2b35e;'
  + '--muted:#a3abbb;--line:#454a56;--rule:#8fb3ff;--base-tint:#33405c;--base-wash:#272d3a;--comp-tint:#4a3d24;--term-tint:#272d3a;--emph-tint:#4a2a24;'
  + '--concl-bg:#2a2d33;--series-1:#8fb3ff;--series-2:#ff8f73;--series-3:#e2b35e;--series-4:#a3abbb}html,body,#stage,.slide{background:#20232a!important;color:#e8eaf0}';

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
const catalogue = lock2.catalogues[lock2.default];
const listed = partsList(null).flatMap((g) => g.parts);
// 一覧のパーツ → 見本の写しのフォルダ（なければ null：絵なし。一覧は汎用の絵を出す）
const sources = listed.map((tag) => {
  const name = Object.keys(catalogue.parts).find((n) => lock2.parts[n][catalogue.parts[n]].tag === tag);
  const version = name && catalogue.parts[name];
  let dir = null;
  try { dir = name ? resolveComponent(path, ROOT, lock, name, version) : null; } catch { dir = null; }
  const demo = dir && fs.existsSync(path.join(dir, 'demo.html')) ? path.join(dir, 'demo.html') : null;
  return { tag, name, version, demo, src: demo ? createHash('sha256').update(fs.readFileSync(demo)).digest('hex').slice(0, 16) : null };
});

async function current() {
  if (!fs.existsSync(OUT)) return null;
  const { THUMBS } = await import(OUT + '?t=' + Date.now());
  return THUMBS;
}

if (process.argv.includes('--check')) {
  const have = await current();
  const bad = [];
  if (!have) bad.push('app/part-thumbs.js is missing');
  else for (const s of sources) {
    if (!s.demo) continue;   // 見本のないパーツは絵なし（汎用の絵）
    if (!have[s.tag]) bad.push(`${s.tag}: no picture`);
    else if (have[s.tag].src !== s.src) bad.push(`${s.tag}: the picture is from another demo (${have[s.tag].src}, now ${s.src})`);
  }
  if (bad.length) { console.error('part-thumbs: ' + bad.join('; ') + ' — run npm run thumbs'); process.exit(1); }
  console.log(`part-thumbs: ${Object.keys(have).length} pictures match the demos`);
  process.exit(0);
}

const { launch, fileUrl, prepareForCapture, releaseCapture } = await import('../kit/browser.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'part-thumbs-'));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
const thumbs = {}, missing = [];
for (const s of sources) {
  if (!s.demo) { missing.push(s.tag); continue; }
  const dir = path.join(tmp, s.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(s.demo, path.join(dir, 'deck.html'));
  fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ componentsCatalogue: lock2.default }) + '\n');
  const built = path.join(dir, 'out.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), '-o', built], { stdio: ['ignore', 'ignore', 'pipe'] });
  const one = {};
  for (const scheme of ['light', 'dark']) {
    await page.goto(fileUrl(built) + '?mode=talk');
    await page.waitForFunction(() => window.DECK && DECK.ready);
    if (scheme === 'dark') await page.addStyleTag({ content: DARK });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => DECK.seek(0, DECK.slides[0]._max, Infinity));
    // 1 枚目の本文（.body）を撮る：パーツの要素だけだと、要素の箱からはみ出して描くパーツ（m-timer など）が切れる
    const el = await page.$('.slide .body') || await page.$(s.tag);
    await prepareForCapture(page);
    const png = await (el || page).screenshot({ animations: 'disabled', caret: 'hide' });
    await releaseCapture(page).catch(() => {});
    one[scheme] = await page.evaluate(async ([b64, w, h, bg]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
      g.imageSmoothingQuality = 'high'; g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return c.toDataURL('image/webp', 0.82);
    }, [Buffer.from(png).toString('base64'), W, H, scheme === 'dark' ? '#20232a' : '#ffffff']);
    if (scheme === 'light') one.title = await page.evaluate(() => { const h = document.querySelector('.slide h2'); return h ? h.textContent.trim() : ''; });
  }
  thumbs[s.tag] = { src: s.src, title: one.title, light: one.light, dark: one.dark };
  console.log(`${s.tag}: ${(one.light.length + one.dark.length) >> 10} KB (${one.title})`);
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
const body = '// generated by tools/part-thumbs.mjs from the parts\' demo.html (parts library ' + lock2.default + '); do not edit by hand\n'
  + '// 新規作成 ④ のパーツの一覧の見本の絵（WebP の data: URL、' + W + '×' + H + '）。src は見本の sha256 の先頭、title は見本の 1 枚目の見出し\n'
  + 'export const THUMBS = ' + JSON.stringify(thumbs, null, 1) + ';\n';
fs.writeFileSync(OUT, body);
console.log(`wrote app/part-thumbs.js: ${Object.keys(thumbs).length} parts, ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB` + (missing.length ? `; no demo: ${missing.join(', ')}` : ''));
