// 部品の見本（components/<名前>/demo.html）を組んで、ブラウザで動かして確かめる
//   node tools/test-components.mjs [名前 …] [--shots 画像の出力先]
// 確かめること：コンソールのエラーがない／段階ごとの途中と最終状態の画像／決定性（同じ (i, k, t) を、
// 直後に描いたときと、ほかの位置へ飛んで戻ってから描いたときで、画素が一致する）／図の字が 24px 以上／字の重なり・はみ出し
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const shotsRoot = si >= 0 ? path.resolve(args.splice(si, 2)[1]) : null;
const names = args.length ? args : fs.readdirSync(path.join(ROOT, 'components'))
  .filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')));

const b = await launch();
let fail = 0;
for (const name of names) {
  const dir = path.join(ROOT, 'components', name);
  const out = path.join(dir, 'out', 'demo.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'demo.html'), '-o', out], { stdio: 'pipe' });
  const shots = shotsRoot ? path.join(shotsRoot, name) : path.join(dir, 'out', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const load = async () => {
    await p.goto('file://' + out);
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
    await p.evaluate(() => document.fonts.ready);
  };
  const seek = (i, k, t) => p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [i, k, t]);
  await load();
  // 部品のあるスライドと、各段階の動きの長さ
  const plan = await p.evaluate(() => {
    const tl = DECK.timeline();
    return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length,
      anim: tl.filter((x) => x.i === i).map((x) => x.anim),
      cues: s._comps.map((c) => Array.from({ length: s._max + 1 }, (_, k) => { const kk = Math.max(0, Math.min(c.steps, k - c.from + 1)); return kk >= 1 && k - c.from + 1 === kk ? c.cues(kk) : null; })) }))
      .filter((s) => s.comps);
  });
  const issues = [];
  for (const s of plan) {
    for (let k = 0; k <= s.max; k++) {
      const a = s.anim[k];
      const ts = a > 0 ? [a * 0.35, a * 0.7, null] : [null];
      for (const t of ts) {
        await seek(s.i, k, t);
        await p.screenshot({ path: path.join(shots, `s${s.i}_k${k}_${t === null ? 'end' : t.toFixed(2)}.png`) });
      }
      // 最終状態の字：大きさ・重なり・スライドからのはみ出し
      const bad = await p.evaluate((i) => {
        const sl = DECK.slides[i], R = sl.getBoundingClientRect(), out = [];
        const vis = (e) => { for (let x = e; x && x !== sl; x = x.parentElement) { const o = +(x.getAttribute && x.getAttribute('opacity') || getComputedStyle(x).opacity); if (o < 0.5) return false; } return true; };
        const texts = sl._comps.flatMap((c) => [...c.querySelectorAll('text')]).filter((e) => e.textContent.trim() && vis(e));
        const boxes = texts.map((e) => ({ e, r: e.getBoundingClientRect(), s: e.textContent }));
        for (const { e, r, s } of boxes) {
          if (parseFloat(getComputedStyle(e).fontSize) < 24) out.push(`small text ${getComputedStyle(e).fontSize}: ${s}`);
          if (r.left < R.left || r.right > R.right || r.top < R.top || r.bottom > R.bottom) out.push(`outside slide: ${s}`);
        }
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
          const p = boxes[a].r, q = boxes[b].r, ox = Math.min(p.right, q.right) - Math.max(p.left, q.left), oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          const same = boxes[a].s === boxes[b].s && Math.abs(p.left - q.left) < 1 && Math.abs(p.top - q.top) < 1;
          if (!same && ox > 2 && oy > 4) out.push(`overlap: "${boxes[a].s}" / "${boxes[b].s}"`);
        }
        return out;
      }, s.i);
      bad.forEach((x) => issues.push(`s${s.i} k${k}: ${x}`));
    }
  }
  // 決定性：読み込み直後の (i, k, 0.5) と、ほかの位置を経てからの (i, k, 0.5) を比べる
  const det = [];
  for (const s of plan) {
    for (let k = 1; k <= s.max; k++) {
      await load();
      await seek(s.i, k, 0.5);
      const A = await p.screenshot();
      await seek(s.i, s.max, null); await seek(s.i, 0, null); await seek(s.i, k, 1.7); await seek(s.i, Math.min(s.max, k + 1), 0.3);
      await seek(s.i, k, 0.5);
      const B = await p.screenshot();
      const ok = A.equals(B);
      det.push(`s${s.i}k${k}:${ok ? 'ok' : 'DIFF'}`);
      if (!ok) { fail++; fs.writeFileSync(path.join(shots, `det_fail_s${s.i}_k${k}_A.png`), A); fs.writeFileSync(path.join(shots, `det_fail_s${s.i}_k${k}_B.png`), B); }
    }
  }
  if (errs.length) fail++;
  console.log(`== ${name}: slides ${plan.map((s) => `${s.i}(max ${s.max}, anim ${s.anim.map((x) => x.toFixed(2)).join('/')})`).join(' ')}`);
  plan.forEach((s) => s.cues.forEach((c, j) => { if (c.some(Boolean)) console.log(`   cues s${s.i} comp${j}: ${JSON.stringify(c)}`); }));
  console.log(`   determinism: ${det.join(' ')}`);
  console.log(`   errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  console.log(`   layout: ${issues.length ? '\n     ' + [...new Set(issues)].join('\n     ') : 'ok'}`);
  console.log(`   shots: ${shots}`);
  await p.close();
}
await b.close();
process.exit(fail ? 1 : 0);
