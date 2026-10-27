// 章の扉の h2（#128）と、字と地のコントラストの検査（kit/core/layout-scan.mjs の secHeading・textContrast）の試験
//   node tools/test-check-contrast.mjs [作業フォルダ]
// 1. h2 だけで書いた章の扉（.sec）が読める：組んだデッキを Chrome で開き、h2 の色と扉の地のコントラストが 4.5:1 以上（kit/layouts.css の .sec h2）
// 2. kit/check.mjs --json：h2 だけの扉に secHeading（警告）、h1 の扉には出ない。4.5:1 より低い本文の字に textContrast（警告）、
//    4.5:1 以上の字・ふつうのスライド・扉には出ない。どちらもエラーにしない
// 3. 知らせの言葉（kit/check-messages.mjs）：日本語と英語があり、扉の題は h1 と言う
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { message } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-contrast-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

const IDS = ['s-sech2', 's-sech1', 's-low', 's-ok', 's-plain'];
fs.writeFileSync(path.join(work, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>扉とコントラスト</title></head>
<body><div id="stage">
<section class="slide sec" id="s-sech2"><h2>第 2 章　確率の考え方</h2></section>
<section class="slide sec" id="s-sech1"><h1>第 3 章　推定</h1></section>
<section class="slide noconcl" id="s-low"><h2>薄い字</h2><div class="body"><p style="color:#aaaaaa">地に溶ける薄い灰色の字</p></div></section>
<section class="slide noconcl" id="s-ok"><h2>濃い字</h2><div class="body"><p style="color:#595959">十分に濃い灰色の字</p></div></section>
<section class="slide noconcl" id="s-plain"><h2>ふつうのスライド</h2><div class="body"><ul><li>テーマの色だけを使う</li></ul></div></section>
</div></body></html>
`);
fs.writeFileSync(path.join(work, 'narration.md'), IDS.map((id) => `## ${id}\n\n[0] 試験の口述原稿です。\n`).join('\n'));

await t('h2 だけの章の扉は読める：h2 は扉の字の色（--sec-fg）で、地とのコントラストが 4.5:1 以上。下線はない', async () => {
  const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(work, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl(path.join(work, 'out', 'deck.html')));
    await page.waitForFunction(() => window.DECK && DECK.ready);
    const r = await page.evaluate(() => {
      DECK.go(0, 0, false);
      const s = document.getElementById('s-sech2'), h = s.querySelector('h2'), h1 = document.querySelector('#s-sech1 h1');
      const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1; const cx = cv.getContext('2d');
      const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const fg = rgb(getComputedStyle(h).color), bg = rgb(getComputedStyle(s).backgroundColor);
      const a = L(fg), b = L(bg);
      return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), border: getComputedStyle(h).borderBottomWidth, sameAsH1: getComputedStyle(h).color === getComputedStyle(h1).color && getComputedStyle(h).fontSize === getComputedStyle(h1).fontSize };
    });
    assert.ok(r.ratio >= 4.5, `contrast ${r.ratio.toFixed(2)}:1`);
    assert.equal(r.border, '0px');
    assert.ok(r.sameAsH1, 'the h2 looks like the h1 of a divider (colour and size)');
  } finally { await browser.close(); }
});

let res = null;
await t('品質チェック：h2 だけの扉に secHeading、薄い字に textContrast（警告）。h1 の扉・濃い字・ふつうのスライドには出ない', () => {
  const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(work, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  res = JSON.parse(c.stdout);
  const at = (code) => res.results.filter((x) => x.code === code).map((x) => x.id);
  assert.deepEqual(at('secHeading'), ['s-sech2']);
  assert.deepEqual(at('textContrast'), ['s-low']);
  const low = res.results.find((x) => x.code === 'textContrast');
  assert.ok(low.sev === 'warn' && Number(low.data.ratio) < 4.5 && low.data.tag === 'p' && low.data.t.includes('薄い灰色'), JSON.stringify(low));
  assert.ok(res.results.filter((x) => ['secHeading', 'textContrast'].includes(x.code)).every((x) => x.sev === 'warn'), 'warnings only');
});

await t('知らせの言葉：日本語と英語。扉の題は h1、コントラストは比と字を言う', () => {
  const ja = message('ja', 'secHeading', { t: '第 2 章' }), en = message('en', 'secHeading', { t: 'Chapter 2' });
  assert.ok(ja.includes('h1') && ja.includes('第 2 章') && en.includes('h1') && en.includes('Chapter 2'), ja + ' / ' + en);
  const cj = message('ja', 'textContrast', { ratio: '2.32', min: 4.5, tag: 'p', t: '薄い' }), ce = message('en', 'textContrast', { ratio: '2.32', min: 4.5, tag: 'p', t: 'faint' });
  assert.ok(cj.includes('2.32:1') && cj.includes('4.5:1') && ce.includes('2.32:1') && ce.includes('<p>'), cj + ' / ' + ce);
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
