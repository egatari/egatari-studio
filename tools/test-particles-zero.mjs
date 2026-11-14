// node tools/test-particles-zero.mjs [out-dir]
// 部品庫 2.8.0 の m-particles 2.0.2（幅およそ 45 px より狭いと固まった不具合の直し）を、Studio で組んだ教材でも確かめる。
// 要素そのものを CSS で 0 × 0・幅 0・幅 30 px にして組み立て、再生する：30 秒以内に用意ができ、ページのエラーも
// SVG の負の大きさ（Chrome の「A negative value is not valid」）も出ない。各ステップを途中と終わりで描く。
// 使う版が 2.0.2 以上であることも確かめる（取り込みを戻したら落ちる）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-particles-zero-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

const SIZES = [
  ['0 × 0', 'width:0!important;min-width:0!important;max-width:0!important;height:0!important;min-height:0!important;max-height:0!important'],
  ['0 wide', 'width:0!important;min-width:0!important;max-width:0!important;height:440px'],
  ['30 px wide', 'width:30px!important;min-width:0!important;max-width:30px!important;height:440px'],
];
const deckHtml = (css) => `<!DOCTYPE html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>粒子のモデル（大きさ 0）</title>
<style>m-particles{display:block;overflow:hidden;${css}}</style></head>
<body><div id="stage">
<section class="slide" id="state"><h2>状態の変化</h2><div class="body"><m-particles><script type="application/json">{"substance":"水"}</script></m-particles></div></section>
<section class="slide" id="reaction"><h2>化学反応</h2><div class="body"><m-particles mode="reaction"><script type="application/json">{"reactants":[{"formula":"H2","n":2},{"formula":"O2","n":1}],"products":[{"formula":"H2O","n":2}]}</script></m-particles></div></section>
</div></body></html>`;

const b = await launch();
for (const [label, css] of SIZES) {
  const dir = path.join(out, label.replace(/[^a-z0-9]+/gi, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deckHtml(css));
  fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ componentsCatalogue: '2' }) + '\n');
  const built = path.join(dir, 'out.html');
  const errs = [];
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), '-o', built], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { errs.push('build: ' + String(e.stderr || e.message).split('\n')[0]); }
  if (!errs.length) {
    const html = fs.readFileSync(built, 'utf8');
    const v = /\/\/ ---- particles@(\d+)\.(\d+)\.(\d+)/.exec(html);
    if (label === SIZES[0][0]) ok(v && (+v[1] > 2 || (+v[1] === 2 && (+v[2] > 0 || +v[3] >= 2))), `the lesson uses m-particles 2.0.2 or later (${v ? v.slice(1).join('.') : 'not found'})`);
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('console', (m) => { if (m.type() === 'error' && /negative value/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
    p.on('pageerror', (e) => errs.push('page error: ' + String(e.message).split('\n')[0]));
    try {
      await p.goto(fileUrl(built), { timeout: scaled(30000) });
      await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(30000) });
      await p.evaluate(() => DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) { DECK.seek(i, k, 0.3); DECK.seek(i, k, Infinity); } }));
    } catch (e) { errs.push('not ready within 30 s (hang?): ' + String(e.message).split('\n')[0]); }
    await p.close().catch(() => {});
  }
  const u = [...new Set(errs)];
  ok(!u.length, `m-particles at ${label}: ready, every step drawn, no page error and no negative size${u.length ? ': ' + u.slice(0, 4).join(' | ') : ''}`);
}
await b.close();
console.log(fail ? `\n${fail} failed` : '\ntest-particles-zero: ok');
process.exit(fail ? 1 : 0);
