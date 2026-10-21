// 全スライドの最終段階を 1 枚の画像（コンタクトシート）にする（backlog #66）
//   node tools/sheet.mjs <デッキのフォルダ | deck.html | 組んだ.html | .ega.html> [out.png] [--mode talk] [--cols 4] [--width 640] [--tiles]
//   npm run sheet -- <同上>
// 品質チェックでは見えないもの（凡例の意味の取り違え、軸の端で切れた点など）を、1 枚の画像で一通り目で見るためのもの。
// 各スライドを ?mode=<mode> で開き、DECK.seek(i, 最後の段階, Infinity) の絵（1280×720）を撮り、
// 同じブラウザの HTML（<img> の格子。data: URL）に並べて 1 枚に撮る。新しい依存はない。
// 既定の出力：フォルダ・deck.html なら <デッキ>/out/sheet.png、ほかは <入力の拡張子を除いた名前>.sheet.png
// --tiles：1 枚ずつの PNG を <出力の名前>-tiles/ に 01.png, 02.png, … で書く
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, resolveDeckArg } from '../kit/build.mjs';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

export const SLIDE_W = 1280, SLIDE_H = 720;
export const PAD = 16, GAP = 12;
// 番号の札はスライドの上の帯（スライドに重ねない）。高さは幅から決める
export const labelH = (width) => Math.round(Math.max(12, Math.round(width / 32)) * 1.9);
const HIDE = '#dt-cb,#deck-toast,.deck-tools{display:none!important}';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 格子の大きさ：n 枚を cols 列に（枚数が列より少なければ列を詰める）
export function gridSize(n, cols, width) {
  const c = Math.max(1, Math.min(cols, n)), r = Math.ceil(n / c);
  const h = Math.round(width * SLIDE_H / SLIDE_W);
  const lh = labelH(width), th = h + lh;
  return { cols: c, rows: r, tileW: width, slideH: h, labelH: lh, tileH: th, width: PAD * 2 + c * width + (c - 1) * GAP, height: PAD * 2 + r * th + (r - 1) * GAP };
}

export async function sheet(arg, o = {}) {
  const mode = o.mode || 'talk', cols = o.cols || 4, tileW = o.width || 640;
  let page = null, tmp = null, base;
  const st = (() => { try { return fs.statSync(arg); } catch { return null; } })();
  if (!st) throw new Error(`${arg}: no such file or folder`);
  if (st.isDirectory()) base = path.join(arg, 'out', 'sheet.png');
  else base = path.join(path.dirname(arg), path.basename(arg).replace(/(\.ega)?\.html?$/i, '') + '.sheet.png');
  // 組んだ HTML（実行部分を含む）と .ega.html はそのまま開く。デッキの原稿（deck.html）は組んでから開く
  let target = arg;
  if (st.isDirectory() || (!/\.ega\.html$/i.test(arg) && !/DECK\.ready/.test(readRegular(arg, { max: READ_LIMITS.source }).toString('utf8')))) {
    const r = build(resolveDeckArg(arg), {});
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-sheet-'));
    target = path.join(tmp, 'deck.html');
    fs.writeFileSync(target, r.html);
  }
  const out = path.resolve(o.out || base);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const b = await launch();
  try {
    const p = await b.newPage({ viewport: { width: SLIDE_W, height: SLIDE_H } });
    p.on('pageerror', (e) => console.error('pageerror:', e.message));
    await p.goto(fileUrl(target) + '?mode=' + mode);
    await p.waitForFunction(() => window.DECK && DECK.ready);
    await p.evaluate(() => document.fonts.ready);
    await p.addStyleTag({ content: HIDE });
    const meta = await p.evaluate(() => DECK.slides.map((s) => {
      const h = s.querySelector('h1') || s.querySelector('h2');
      const t = h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
      const cs = [...t];
      return { key: s._key || '', max: s._max, head: cs.length > 12 ? cs.slice(0, 12).join('') + '…' : t };
    }));
    const shots = [];
    for (let i = 0; i < meta.length; i++) {
      await p.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [i, meta[i].max]);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      shots.push(await p.screenshot());
    }
    const g = gridSize(meta.length, cols, tileW);
    const tilesDir = o.tiles ? out.replace(/\.png$/i, '') + '-tiles' : null;
    if (tilesDir) {
      fs.mkdirSync(tilesDir, { recursive: true });
      shots.forEach((s, i) => fs.writeFileSync(path.join(tilesDir, String(i + 1).padStart(2, '0') + '.png'), s));
    }
    const fs_ = Math.max(12, Math.round(tileW / 32));
    const labels = [];
    const tiles = shots.map((s, i) => {
      const key = meta[i].key, show = key && [...key].length <= 12 && !/^s\d+$/.test(key);
      const fixed = i + 1 + (show ? ' · ' + key : ''), head = show && key === meta[i].head ? '' : meta[i].head;   // 鍵が見出しそのもの（id のないデッキ）なら 1 回だけ
      labels.push(fixed + (head ? ' · ' + head : ''));
      return `<figure><figcaption><span class="n">${esc(fixed)}</span>${head ? `<span class="h"> · ${esc(head)}</span>` : ''}</figcaption><img src="data:image/png;base64,${s.toString('base64')}" width="${g.tileW}" height="${g.slideH}"></figure>`;
    }).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#e5e7eb}
body{box-sizing:border-box;width:${g.width}px;height:${g.height}px;padding:${PAD}px;display:grid;grid-template-columns:repeat(${g.cols},${g.tileW}px);grid-auto-rows:${g.tileH}px;gap:${GAP}px;font-family:system-ui,"Hiragino Sans","Noto Sans CJK JP","Yu Gothic",sans-serif}
figure{margin:0;position:relative;width:${g.tileW}px;height:${g.tileH}px;box-shadow:0 0 0 1px #9ca3af;background:#fff;overflow:hidden}
img{display:block}
figcaption{box-sizing:border-box;height:${g.labelH}px;background:#374151;color:#fff;font-weight:700;font-size:${fs_}px;line-height:${g.labelH}px;padding:0 ${Math.round(fs_ * .7)}px;white-space:nowrap;display:flex}
figcaption .n{flex:none}
figcaption .h{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
</style>${tiles}`;
    const cp = await b.newPage({ viewport: { width: g.width, height: g.height } });
    await cp.setContent(html);
    await cp.evaluate(() => Promise.all([...document.images].map((im) => im.decode())));
    await cp.screenshot({ path: out });
    return { out, count: meta.length, tilesDir, labels, ...g };
  } finally { await b.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), pos = [], o = {};
  const num = (name, v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) { console.error(`${name} needs a positive integer`); process.exit(1); } return n; };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--mode') o.mode = a[++i];
    else if (a[i] === '--cols') o.cols = num('--cols', a[++i]);
    else if (a[i] === '--width') o.width = num('--width', a[++i]);
    else if (a[i] === '--tiles') o.tiles = true;
    else if (a[i].startsWith('--')) { console.error('unknown option ' + a[i]); process.exit(1); }
    else pos.push(a[i]);
  }
  if (!pos.length) { console.error('usage: node tools/sheet.mjs <deck folder | deck.html | built.html | .ega.html> [out.png] [--mode talk] [--cols 4] [--width 640] [--tiles]'); process.exit(1); }
  o.out = pos[1];
  try {
    const r = await sheet(pos[0], o);
    console.log(`${r.out}\n${r.count} slides (${r.cols}×${r.rows} tiles, ${r.width}×${r.height}px)` + (r.tilesDir ? `\ntiles: ${r.tilesDir}` : ''));
  } catch (e) { console.error('sheet failed: ' + e.message); process.exit(1); }
}
