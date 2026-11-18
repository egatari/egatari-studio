// 新規作成 ③ のテーマの見本の絵（app/theme-thumbs/<テーマ>-cover.webp・<テーマ>-body.webp）を、サンプル「パーツ図鑑」（examples/parts-showcase）から作る。手で描かない・手で直さない
//   node tools/theme-thumbs.mjs           作り直す（ブラウザが要る。npm run theme-thumbs）
//   node tools/theme-thumbs.mjs --check   選べるテーマ（kit/core/themes-list.mjs の CHOOSABLE）がどれも 2 枚の絵を持ち、絵の sha256 が記録（app/theme-thumbs/index.json）
//                                         のとおりか（違えば失敗）。テーマの hash（tools/themes-lock.mjs の themeDirSha）やサンプルの commit が記録と違えば、
//                                         絵が古いと知らせるだけ（終了コードは 0。npm run gen:check と tools/test-all.mjs）
// 作り方：パーツ図鑑の deck.html を、テーマごとに kit/build.mjs --theme <テーマ> で組み（サンプルの SOURCE.md の scripts/build-themes.sh と同じ。中身は同じでテーマだけが違う）、
// 表紙（s-mbteyz）と本文の 1 枚（s-wm5imv、m-map-japan。テーマの色が塗り分けの地図にいちばん出る。どちらもサンプルの SOURCE.md が決めたスライド）を最後のステップまで進めて、
// スライド全体（16:9）を撮る。絵は 640×360 の WebP（画面では幅 320 px。高い密度の画面にも足りる）で、1 枚 30 KB 以下になるまで質を下げる。
// tools/build-app.mjs が配信版では dist/theme-thumbs/ に写し、1 ファイル版では data: URL で埋め込む（app/llm.js の ③ が RES.themeThumbs から読む）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHOOSABLE } from '../kit/core/themes-list.mjs';
import { themeDirSha } from './themes-lock.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const THEME_THUMBS_DIR = path.join(ROOT, 'app', 'theme-thumbs');
const INDEX = path.join(THEME_THUMBS_DIR, 'index.json');
const LESSON = 'parts-showcase';
const LESSON_DIR = path.join(ROOT, 'examples', LESSON);
export const SLIDES = Object.freeze({ cover: 's-mbteyz', body: 's-wm5imv' });
const W = 640, H = 360, MAX_BYTES = 30 * 1024;

const sha = (b) => createHash('sha256').update(b).digest('hex');
// 絵を作る同梱のテーマ：選べるもの（画面の順）のうち themes/ にあるもの
export const thumbThemes = () => CHOOSABLE.map((t) => t.name).filter((n) => fs.existsSync(path.join(ROOT, 'themes', n, 'tokens.css')));
const lessonCommit = () => { try { return JSON.parse(fs.readFileSync(path.join(LESSON_DIR, 'SOURCE.json'), 'utf8')).commit || null; } catch { return null; } };
const fileOf = (theme, kind) => `${theme}-${kind}.webp`;
export const readThemeThumbs = () => (fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : null);

if (process.argv.includes('--check')) {
  const gha = !!process.env.GITHUB_ACTIONS;
  const warn = (msg) => console.log(gha ? `::warning file=app/theme-thumbs/index.json::${msg}` : `warning: ${msg}`);
  const rec = readThemeThumbs();
  const bad = [], stale = [];
  if (!rec) bad.push('app/theme-thumbs/index.json is missing');
  else {
    for (const name of thumbThemes()) {
      const r = rec.themes && rec.themes[name];
      if (!r) { bad.push(`${name}: no pictures`); continue; }
      for (const kind of Object.keys(SLIDES)) {
        const f = path.join(THEME_THUMBS_DIR, fileOf(name, kind));
        if (!fs.existsSync(f)) bad.push(`${name}: app/theme-thumbs/${fileOf(name, kind)} is missing`);
        else if (sha(fs.readFileSync(f)) !== r[kind]) bad.push(`${name}: app/theme-thumbs/${fileOf(name, kind)} differs from the one recorded`);
        else if (fs.statSync(f).size > MAX_BYTES) bad.push(`${name}: app/theme-thumbs/${fileOf(name, kind)} is over ${MAX_BYTES >> 10} KB`);
      }
      if (r.theme !== themeDirSha(path.join(ROOT, 'themes', name))) stale.push(name);
    }
    for (const name of Object.keys(rec.themes || {})) if (!thumbThemes().includes(name)) bad.push(`${name}: pictures for a theme that is not offered`);
    if (rec.source && rec.source.commit !== lessonCommit()) warn(`theme-thumbs: the pictures are from ${LESSON} at ${String(rec.source.commit).slice(0, 7)}, the copy is now ${String(lessonCommit()).slice(0, 7)} — run npm run theme-thumbs`);
  }
  if (stale.length) warn(`theme-thumbs: the theme changed since its pictures were made (${stale.join(', ')}) — run npm run theme-thumbs`);
  if (bad.length) { console.error('theme-thumbs: ' + bad.join('; ') + ' — run npm run theme-thumbs'); process.exit(1); }
  console.log(`theme-thumbs: ${Object.keys(rec.themes).length} themes have their pictures` + (stale.length ? ` (${stale.length} out of date)` : ''));
  process.exit(0);
}

const { launch, fileUrl, prepareForCapture, releaseCapture } = await import('../kit/browser.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-thumbs-'));
// 組み立てがサンプルのフォルダに書かないように、写しで組む
const src = path.join(tmp, LESSON);
fs.cpSync(LESSON_DIR, src, { recursive: true, filter: (x) => !/[\\/](out|out-themes|\.cache)([\\/]|$)/.test(path.relative(LESSON_DIR, x)) });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
fs.mkdirSync(THEME_THUMBS_DIR, { recursive: true });
for (const f of fs.readdirSync(THEME_THUMBS_DIR)) if (f.endsWith('.webp')) fs.rmSync(path.join(THEME_THUMBS_DIR, f));
const themes = {};
for (const name of thumbThemes()) {
  const out = path.join(tmp, `${name}.html`);
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(src, 'deck.html'), '--theme', name, '-o', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  await page.goto(fileUrl(out) + '?mode=talk');
  await page.waitForFunction(() => window.DECK && DECK.ready);
  await page.evaluate(() => document.fonts.ready);
  const one = { theme: themeDirSha(path.join(ROOT, 'themes', name)) };
  for (const [kind, id] of Object.entries(SLIDES)) {
    const i = await page.evaluate((id) => DECK.slides.findIndex((s) => s.id === id), id);
    if (i < 0) throw new Error(`${LESSON}: no slide ${id}`);
    await page.evaluate((i) => DECK.seek(i, DECK.slides[i]._max, Infinity), i);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const el = await page.$(`#${id}`);
    await prepareForCapture(page);
    const png = await (el || page).screenshot({ animations: 'disabled', caret: 'hide' });
    await releaseCapture(page).catch(() => {});
    let buf = null;
    for (let q = 0.82; q >= 0.3; q -= 0.06) {
      const b64 = await page.evaluate(async ([b, w, h, q]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        const r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
        g.imageSmoothingQuality = 'high'; g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return c.toDataURL('image/webp', q).split(',')[1];
      }, [Buffer.from(png).toString('base64'), W, H, q]);
      buf = Buffer.from(b64, 'base64');
      if (buf.length <= MAX_BYTES) break;
    }
    if (buf.length > MAX_BYTES) throw new Error(`${name} ${kind}: ${buf.length} bytes even at the lowest quality`);
    fs.writeFileSync(path.join(THEME_THUMBS_DIR, fileOf(name, kind)), buf);
    one[kind] = sha(buf);
    console.log(`${name} ${kind}: ${(buf.length / 1024).toFixed(1)} KB`);
  }
  themes[name] = one;
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
const rec = {
  note: 'Written by tools/theme-thumbs.mjs; do not edit by hand. theme: the theme folder hash (tools/themes-lock.mjs themeDirSha) when the pictures were made; cover, body: sha256 of the WebP files.',
  source: { lesson: `examples/${LESSON}`, commit: lessonCommit(), slides: SLIDES, width: W, height: H },
  themes,
};
fs.writeFileSync(INDEX, JSON.stringify(rec, null, 2) + '\n');
console.log(`wrote app/theme-thumbs: ${Object.keys(themes).length} themes`);
