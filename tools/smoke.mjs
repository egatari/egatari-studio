// 組んだデッキの簡単な通し確認：node tools/smoke.mjs <built.html> [画面の保存先]
// タイムラインがある・各段階の長さが正の有限値・seek で位置が変わる・画面が撮れる・授業モードで開ける・コンソールのエラーなし
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from '../kit/browser.mjs';
const [file, outdir = path.join(os.tmpdir(), 'motion-smoke')] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/smoke.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.goto(fileUrl(file));
await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const tl = await p.evaluate(() => DECK.timeline().map(x => [x.key, x.i, x.k, x.anim, x.dur, x.start]));
console.log('timeline', tl.length, JSON.stringify(tl.slice(0, 12).map(([key, , , a, d]) => [key, +a.toFixed(2), +d.toFixed(2)])));
const nSlides = await p.evaluate(() => DECK.slides.length);
ok(nSlides > 0, `スライドがある（${nSlides} 枚）`);
ok(tl.length >= nSlides, `タイムラインに段階がある（${tl.length} 段階）`);
const badDur = tl.filter(([, , , a, d]) => !(Number.isFinite(d) && d > 0 && Number.isFinite(a) && a >= 0));
ok(badDur.length === 0, '各段階の長さが正の有限値' + (badDur.length ? '：' + JSON.stringify(badDur.slice(0, 5)) : ''));
const nonMono = tl.filter((x, j) => j && !(x[5] >= tl[j - 1][5] + tl[j - 1][4] - 1e-6));
ok(nonMono.length === 0, '段階の開始時刻が順に並ぶ' + (nonMono.length ? '：' + nonMono.map((x) => x[0]).join(', ') : ''));
// 範囲内に収まる (i, k) だけを撮る
const maxOf = await p.evaluate(() => DECK.slides.map((s) => s._max));
const shots = [[0,0,1e9],[1,1,0.2],[2,3,1e9],[4,1,0.6],[4,3,1e9],[3,2,1e9]]
  .filter(([i, k]) => i < nSlides).map(([i, k, t]) => [i, Math.min(k, maxOf[i]), t]);
for (const [i,k,t] of shots) {
  await p.evaluate(([i,k,t]) => DECK.seek(i,k,t>1e8?Infinity:t, i-1), [i,k,t]);
  const f = `${outdir}/s${i}_${k}_${t>1e8?'end':t}.png`;
  await p.screenshot({ path: f });
  ok(fs.statSync(f).size > 5000, `画面 s${i} k${k} t=${t>1e8?'end':t} を撮れた`);
}
// 移動の確認：キーで送ると位置が進む
await p.goto(fileUrl(file) + '#1');
await p.waitForFunction(() => window.DECK && DECK.ready);
const s0 = await p.evaluate(() => DECK.state());
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
const s1 = await p.evaluate(() => DECK.state());
ok(s1.slide * 1000 + s1.step > s0.slide * 1000 + s0.step, `→ で進む（${s0.key} → ${s1.key}）`);
const li = Math.min(2, nSlides - 1);
await p.goto(fileUrl(file) + `?mode=lecture#${li + 1}`);
await p.waitForFunction(() => window.DECK && DECK.ready);
ok(await p.evaluate(() => DECK.mode) === 'lecture', '?mode=lecture で授業モード');
await p.evaluate((i) => DECK.seek(i, Math.min(2, DECK.slides[i]._max), Infinity), li);
await p.screenshot({ path: `${outdir}/lecture_${li}_2.png` });
await p.waitForTimeout(100);
ok(errs.length === 0, 'コンソールのエラー・警告なし' + (errs.length ? '：' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} 件の失敗` : 'すべて通過', '→', outdir);
process.exit(fails ? 1 : 0);
