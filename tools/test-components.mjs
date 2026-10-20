// 部品庫の部品（egatari/components のリリースの写し vendor/components/<名前>/<版>/。既定の版は components.lock.json）の見本（demo.html）を、
// この Studio で組んで、ブラウザで動かして確かめる（部品を変えたときの試験の本体は egatari/components の npm test。これは Studio との結合の試験）
//   node tools/test-components.mjs [名前 …] [--shots 画像の出力先]
// 確かめること：見本が組めて、品質チェック（kit/check.mjs）のエラーが 0（KNOWN に書いたものを除く）／コンソールのエラーがない／段階ごとの途中と最終状態の画像／決定性（同じ (i, k, t) を、
// 直後に描いたときと、ほかの位置へ飛んで戻ってから描いたときで、画素が一致する）／図の字が 24px 以上／字の重なり・はみ出し／部品が印を付けた軸の線（line.axis）を横切る字と、箱（rect.box）に 4px より近い字／m-kanbun の振り仮名・送り仮名の重なりと、長い送り仮名で次の字が下がること／m-gendai の線（つなぐ線・指示語の矢印・傍線）が自分の端のほかで札に入らず、段落の枠の辺を横切らないこと
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from '../kit/browser.mjs';
import { ROOT, vendorComponents } from './vendor-components.mjs';

// 品質チェックの既知のエラー（部品庫の見本の問題。egatari/components で直して新しい版を取り込んだら消す）：{名前: [規則の名前 …]}
const KNOWN = {};

const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const shotsRoot = si >= 0 ? path.resolve(args.splice(si, 2)[1]) : null;
const outRoot = shotsRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'test-components-'));
const all = vendorComponents().filter((c) => fs.existsSync(path.join(c.dir, 'demo.html')));
for (const n of args) if (!all.some((c) => c.name === n)) { console.error(`no demo for ${n} in vendor/components (default version)`); process.exit(2); }
const comps = args.length ? all.filter((c) => args.includes(c.name)) : all;
const names = comps.map((c) => c.name);

const b = await launch();
let fail = 0;
const failed = [];   // [名前, 理由]
for (const { name, version, dir } of comps) {
  const out = path.join(outRoot, name, 'demo.html');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'demo.html'), '-o', out], { stdio: 'pipe' });
  } catch (e) {
    fail++; failed.push([name, 'build failed: ' + String(e.stderr || e.message).trim().split('\n')[0]]);
    console.log(`== ${name}: BUILD FAILED\n${String(e.stderr || e.message).trim()}`);
    continue;
  }
  // 品質チェック（見本の原稿を検査器にかける。エラーは KNOWN のほか 0）
  let qc = null;
  try {
    qc = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), path.join(dir, 'demo.html'), '--json'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString());
  } catch (e) {
    try { qc = JSON.parse(String(e.stdout || '')); } catch { qc = null; }
  }
  if (qc && qc.status === 'crashed') throw new Error(`${name}: kit/check.mjs did not finish (the browser crashed): not "0 errors"`);
  const qErrs = qc ? qc.results.filter((x) => x.sev === 'error') : null;
  const qBad = qErrs ? qErrs.filter((x) => !(KNOWN[name] || []).includes(x.rule)) : null;
  const shots = path.join(outRoot, name, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const load = async () => {
    await p.goto(fileUrl(out));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
    await p.evaluate(() => document.fonts.ready);
  };
  // 撮る前に字と描画が落ち着くのを待つ（docs/contract.md §1：seek の後に requestAnimationFrame を 2 回）
  const settle = () => p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  // はっきり違う画素（RGB の差の和が 48 を超える）の数
  const pixelDiff = (a, b) => p.evaluate(async ([a, b]) => {
    const ld = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([ld(a), ld(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
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
        // 部品が印を付けた線と箱：軸の線（line.axis）を横切る字、ほかの箱（rect.box）に 4px より近い字（その箱の中の字は除く）
        const vis2 = (e) => { for (let x = e; x && x !== sl; x = x.parentElement) { const o = +(x.getAttribute && x.getAttribute('opacity') || getComputedStyle(x).opacity); if (o < 0.5) return false; } return true; };
        const axes = sl._comps.flatMap((c) => [...c.querySelectorAll('line.axis')]).filter(vis2).map((e) => e.getBoundingClientRect());
        const rects = sl._comps.flatMap((c) => [...c.querySelectorAll('rect.box')]).filter(vis2);
        for (const { e, r, s } of boxes) {
          for (const a of axes) if (r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top) out.push(`text crosses an axis: ${s}`);
          for (const b of rects) {
            if (b.parentNode.contains(e)) continue;
            const q = b.getBoundingClientRect(), gap = 4;
            if (r.left < q.right + gap && r.right > q.left - gap && r.top < q.bottom + gap && r.bottom > q.top - gap) out.push(`text touches a box: ${s}`);
          }
        }
        // m-kanbun：右の欄の振り仮名・送り仮名が互いに重ならない。長い送り仮名（3 字以上）の次の字は、振り仮名がなければ下がらない（字の送りが 1.2 字のまま）
        for (const c of sl._comps.filter((x) => x.localName === 'm-kanbun' && x.cells)) {
          const S = c.geom.S, ann = [...c.querySelectorAll('.kb-ok:not(.kb-left), .kb-ruby')].filter(vis).map((e) => ({ s: e.textContent, r: e.getBoundingClientRect() }));
          for (let a = 0; a < ann.length; a++) for (let b = a + 1; b < ann.length; b++) {
            const p = ann[a].r, q = ann[b].r;
            if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0) out.push(`kanbun: annotations overlap: ${ann[a].s} / ${ann[b].s}`);
          }
          c.cells.forEach((e, n) => {
            const d = c.cells[n + 1];
            if (!d || d.c.col !== e.c.col || Array.from(e.c.okuri).length < 3 || d.c.ruby || e.c.punct || e.c.join || e.c.mark || e.c.re || e.c.second !== null) return;
            if (Math.abs(d.y - e.y - S * 1.2) > 0.5) out.push(`kanbun: long okuri ${e.c.ch}(${e.c.okuri}) pushed ${d.c.ch} by ${(d.y - e.y - S * 1.2).toFixed(1)}px`);
          });
        }
        // m-gendai：線（つなぐ線・指示語の矢印・傍線）は、自分の端のほかでは札（rect）に入らず、段落の枠の辺を横切らない
        for (const c of sl._comps.filter((x) => x.localName === 'm-gendai' && x.boxes)) {
          const chips = c.boxes.filter((o) => vis(o.chip)).map((o) => ({ s: o.P2.p.role, r: o.cr.getBoundingClientRect() }));
          const frames = c.boxes.filter((o) => vis(o.rect) && +o.rect.getAttribute('opacity') > 0).map((o) => ({ s: o.P2.p.role, r: o.rect.getBoundingClientRect() }));
          const strokes = [...c.links.map((o) => ['link ' + o.a.p.id + o.rel + o.b.p.id, o.path]), ...c.refs.map((o, j) => ['ref ' + j, o.path]),
            ...c.lines.flatMap((o, j) => [...o.g.querySelectorAll('line')].map((e) => ['line ' + j, e]))];
          for (const [name, e] of strokes) {
            if (!vis(e) || e.getAttribute('opacity') === '0') continue;
            const L = e.getTotalLength(), M = e.getScreenCTM();
            if (!L || !M) continue;
            const pt = (d) => { const q = e.getPointAtLength(d); return { x: M.a * q.x + M.c * q.y + M.e, y: M.b * q.x + M.d * q.y + M.f }; };
            const A = pt(0), B = pt(L), hit = new Set();
            for (let d = 0; d <= L; d += 2) {
              const q = pt(d);
              if (Math.hypot(q.x - A.x, q.y - A.y) < 5 || Math.hypot(q.x - B.x, q.y - B.y) < 5) continue;
              for (const ch of chips) if (q.x > ch.r.left - 2 && q.x < ch.r.right + 2 && q.y > ch.r.top - 2 && q.y < ch.r.bottom + 2) hit.add(`gendai: ${name} crosses the label ${ch.s}`);
              for (const f of frames) {
                const r = f.r, inX = q.x > r.left - 2 && q.x < r.right + 2, inY = q.y > r.top - 2 && q.y < r.bottom + 2;
                const nearV = inY && (Math.abs(q.x - r.left) < 2 || Math.abs(q.x - r.right) < 2), nearH = inX && (Math.abs(q.y - r.top) < 2 || Math.abs(q.y - r.bottom) < 2);
                if (nearV || nearH) hit.add(`gendai: ${name} crosses the frame of ${f.s}`);
              }
            }
            out.push(...hit);
          }
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
      await settle();
      const A = await p.screenshot();
      await seek(s.i, s.max, null); await seek(s.i, 0, null); await seek(s.i, k, 1.7); await seek(s.i, Math.min(s.max, k + 1), 0.3);
      await seek(s.i, k, 0.5);
      await settle();
      let B = await p.screenshot();
      if (!A.equals(B)) { await settle(); B = await p.screenshot(); }   // 描画の遅れによる誤検出を避ける
      // アンチエイリアスの揺らぎ（数画素・数階調）は許す（kit/check.mjs の D と同じ基準）
      const nd = A.equals(B) ? 0 : await pixelDiff(A, B);
      const ok = nd <= 40;
      if (nd && ok) console.log(`   note s${s.i}k${k}: ${nd} pixel(s) differ beyond tolerance 0 (within 40, ok)`);
      det.push(`s${s.i}k${k}:${ok ? 'ok' : 'DIFF'}`);
      if (!ok) { fs.writeFileSync(path.join(shots, `det_fail_s${s.i}_k${k}_A.png`), A); fs.writeFileSync(path.join(shots, `det_fail_s${s.i}_k${k}_B.png`), B); }
    }
  }
  const why = [];
  if (!qBad) why.push('quality check did not run');
  else if (qBad.length) why.push(`${qBad.length} quality check error(s): ${qBad.map((x) => x.msg).join(' / ')}`);
  if (errs.length) why.push(`${errs.length} console/page error(s)`);
  if (issues.length) why.push(`${new Set(issues).size} layout issue(s) (text size / outside slide / overlap)`);
  const nd = det.filter((x) => x.endsWith('DIFF')).length;
  if (nd) why.push(`${nd} determinism failure(s)`);
  if (why.length) { fail++; failed.push([name, why.join(', ')]); }
  console.log(`== ${name} ${version}: quality check ${qErrs ? `${qErrs.length} error(s)${qErrs.length > (qBad || []).length ? ` (known: ${qErrs.filter((x) => !qBad.includes(x)).map((x) => x.rule).join(', ')})` : ''}` : 'failed'}`);
  console.log(`== ${name}: slides ${plan.map((s) => `${s.i}(max ${s.max}, anim ${s.anim.map((x) => x.toFixed(2)).join('/')})`).join(' ')}`);
  plan.forEach((s) => s.cues.forEach((c, j) => { if (c.some(Boolean)) console.log(`   cues s${s.i} comp${j}: ${JSON.stringify(c)}`); }));
  console.log(`   determinism: ${det.join(' ')}`);
  console.log(`   errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  console.log(`   layout: ${issues.length ? '\n     ' + [...new Set(issues)].join('\n     ') : 'ok'}`);
  console.log(`   shots: ${shots}`);
  await p.close();
}
await b.close();
console.log('');
if (fail) {
  console.log(`FAIL: ${fail} of ${names.length} component(s)`);
  for (const [n, w] of failed) console.log(`  - ${n}: ${w}`);
} else console.log(`OK: ${names.length} component(s)`);
process.exit(fail ? 1 : 0);
