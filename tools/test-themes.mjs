// 同梱のテーマの検査（#129・#132）：テーマごとに見本（tools/fixtures/themes-sample）を組み、品質チェック・色の検査・ペンの色の検査をする
//   node tools/test-themes.mjs [作業フォルダ] [--shots <dir>]
// 1. 品質チェック（kit/check.mjs --json）：エラー 0。字と地のコントラスト（textContrast。#128）・章の扉の題（secHeading）・
//    ファイルに入っていない字体（fontNotEmbedded）・テーマの寸法（themeMetricsDrift・metricsFontLoad）の警告がない
// 2. 役割の色（組んだデッキで計算した値）：
//    コントラスト（WCAG 2.x）：本文 --fg・用語 --term・強調 --emph・既知 --muted・題 --title と地 --bg 4.5:1、結論の行の字 --emph と --concl-bg 4.5:1、
//      章の扉の字 --sec-fg と --sec-bg 4.5:1、表紙の題と --cover-bg 4.5:1、見出しの字とその地（帯の見出しは帯の上の白抜き）4.5:1
//    色覚の模擬（Machado ほか 2009、強さ 1.0、線形 RGB）：強調の赤 --emph と基調色 --term の差 ΔE*ab が 3 色型・1 型・2 型で 35 以上
//      （テーマの見比べ 2026-10-27 の線。常盤・焦茶をこれで直した）、CIEDE2000 で 3 色型・1 型・2 型・3 型 20 以上（テーマの工房の C4）、
//      --emph と本文 --fg の CIEDE2000 が 1 型で 20 以上（C5）
// 3. ペンの色（kit/tools.js の PEN。テーマによらない赤 #FF4B00・青 #005AFF・黒 #000000）：どのテーマの地 --bg の上でも線のコントラスト 3:1（WCAG 1.4.11）、
//    3 色の組の差 ΔE*ab が 3 色型・1 型・2 型・3 型で 35 以上（テーマの赤・青と同じ線）
// 4. 形の断片（kit/core/theme-shapes.mjs）：theme.json の look の形が tokens.css にそのまま写してある。テーマの CSS は :where() で包まない
//    （組み込みの規則より詳細度が下がり、半分だけ効く。default 1.2.0 の結論の行だけは、組み込みの .concl と同じ詳細度で書いた前からの例外）
// 5. 選べるテーマ（kit/core/themes-list.mjs の CHOOSABLE）：同梱の themes/ にあり、版が 1 つ以上ある。business は選べない（組めはする）
// 数字の表を出す（--shots があれば、テーマごとの見本の 1 枚の画像（コンタクトシート）もそこに書く）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { contrast, deUnder, VISION, rgb2hex } from '../kit/core/color-check.mjs';
import { SHAPES, DEFAULT_LOOK, lookIn } from '../kit/core/theme-shapes.mjs';
import { CHOOSABLE, RETIRED } from '../kit/core/themes-list.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const shots = si >= 0 ? path.resolve(args[si + 1]) : null;
const pos = args.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));
const work = pos[0] ? path.resolve(pos[0]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-themes-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

const THEMES = fs.readdirSync(path.join(ROOT, 'themes')).filter((d) => fs.existsSync(path.join(ROOT, 'themes', d, 'tokens.css'))).sort();
const PEN_SRC = fs.readFileSync(path.join(ROOT, 'kit', 'tools.js'), 'utf8');
const PEN = JSON.parse((PEN_SRC.match(/var PEN = (\{[^}]*\});/) || [])[1].replace(/(\w+):/g, '"$1":'));
const MIN = { text: 4.5, line: 3, emphTerm76: 35, emphTerm00: 20, emphFg00: 20, pen76: 35 };
const fix = (x, d = 2) => Number(x).toFixed(d);

await t('選べるテーマ：藍・墨・国語・常盤・江戸紫・焦茶・浅葱の 7 つ（この順）で、どれも同梱。business は選べないが同梱のまま（記録した教材を組む）', () => {
  assert.deepEqual(CHOOSABLE.map((x) => x.name), ['default', 'sumi', 'kokugo', 'tokiwa', 'murasaki', 'kogecha', 'asagi']);
  for (const x of CHOOSABLE) assert.ok(THEMES.includes(x.name), x.name);
  assert.deepEqual(RETIRED, ['business']);
  assert.ok(THEMES.includes('business'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.lock.json'), 'utf8'));
  for (const x of ['sumi', 'tokiwa', 'murasaki', 'kogecha', 'asagi']) assert.equal(lock.themes[x].current, '1.0.0', x);
});

await t('形の断片：theme.json の look の形が tokens.css にそのまま写してあり、ほかの形の印はない。:where() で包まない', () => {
  for (const name of THEMES) {
    const dir = path.join(ROOT, 'themes', name);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));
    const css = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
    const look = { ...DEFAULT_LOOK, ...(cfg.look || {}) };
    const got = lookIn(css);
    for (const key of Object.keys(DEFAULT_LOOK)) {
      assert.ok(Object.prototype.hasOwnProperty.call(SHAPES[key], look[key]), `${name}: unknown ${key} "${look[key]}"`);
      const want = SHAPES[key][look[key]];
      if (want) assert.ok(got[key] && got[key].id === look[key] && got[key].css === want, `${name}: tokens.css does not carry the ${key} shape "${look[key]}" as written in kit/core/theme-shapes.mjs`);
      else assert.ok(!got[key], `${name}: tokens.css carries a ${key} shape, but theme.json says the default "${look[key]}"`);
    }
    if (name !== 'default') assert.ok(!/:where\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), `${name}: tokens.css uses :where() (it lowers specificity below the built-in rules)`);
  }
});

const rows = [];
const browser = await launch();
try {
  for (const name of THEMES) {
    const dir = path.join(work, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'deck.html'), fs.readFileSync(path.join(ROOT, 'tools/fixtures/themes-sample/deck.html'), 'utf8').replace('data-theme="default"', `data-theme="${name}"`));
    fs.copyFileSync(path.join(ROOT, 'tools/fixtures/themes-sample/narration.md'), path.join(dir, 'narration.md'));
    await t(`${name}：組めて、品質チェックにエラーも色・字体・寸法の警告もない`, () => {
      const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(b.status, 0, b.stderr);
      const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
      const res = JSON.parse(c.stdout);
      const bad = res.results.filter((x) => x.sev === 'error' || ['textContrast', 'secHeading', 'fontNotEmbedded', 'themeMetricsDrift', 'metricsFontLoad', 'build'].includes(x.code));
      assert.deepEqual(bad.map((x) => `${x.code} ${x.id || ''} ${x.text || ''}`), []);
    });
    let v = null;
    await t(`${name}：役割の色のコントラストと色覚の模擬`, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.goto(fileUrl(path.join(dir, 'out', 'deck.html')));
        await page.waitForFunction(() => window.DECK && DECK.ready);
        v = await page.evaluate(() => {
          const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          const rgb = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((x) => x / 255); };
          const tok = (n) => { const e = document.createElement('i'); e.style.color = `var(--${n})`; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return rgb(c); };
          const out = {};
          for (const k of ['fg', 'bg', 'title', 'term', 'emph', 'muted', 'base', 'concl-bg', 'cover-bg', 'sec-bg']) out[k] = tok(k);
          // 章の扉の字（--sec-fg。既定は白）・表紙の題・ふつうのスライドの見出しの字とその地は、描いた要素から
          const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const b = getComputedStyle(a).backgroundColor; if (b && !/rgba\(.*,\s*0\)$/.test(b) && b !== 'transparent') return rgb(b); } return [1, 1, 1]; };
          const sec = document.querySelector('#t-sec h1'), cov = document.querySelector('#t-cover h1'), h2 = document.querySelector('#t-list > h2');
          out.secFg = rgb(getComputedStyle(sec).color); out.secBg = bgOf(sec);
          out.coverTitle = rgb(getComputedStyle(cov).color); out.coverBg = bgOf(cov);
          out.h2 = rgb(getComputedStyle(h2).color); out.h2Bg = bgOf(h2);
          return out;
        });
      } finally { await page.close(); }
      const c = {
        fg: contrast(v.fg, v.bg), term: contrast(v.term, v.bg), emph: contrast(v.emph, v.bg), muted: contrast(v.muted, v.bg), title: contrast(v.title, v.bg),
        concl: contrast(v.emph, v['concl-bg']), sec: contrast(v.secFg, v.secBg), cover: contrast(v.coverTitle, v.coverBg), h2: contrast(v.h2, v.h2Bg),
      };
      const et76 = Object.fromEntries(VISION.map((k) => [k, deUnder(v.emph, v.term, k)]));
      const et00 = Object.fromEntries(VISION.map((k) => [k, deUnder(v.emph, v.term, k, 'de2000')]));
      const ef00 = deUnder(v.emph, v.fg, 'protan', 'de2000');
      rows.push({ name, base: rgb2hex(v.base), bg: rgb2hex(v.bg), c, et76, et00, ef00, v });
      const low = Object.entries(c).filter(([, r]) => r < MIN.text).map(([k, r]) => `${k} ${fix(r)}:1`);
      assert.deepEqual(low, [], 'contrast below 4.5:1');
      for (const k of ['normal', 'protan', 'deutan']) assert.ok(et76[k] >= MIN.emphTerm76, `--emph vs --term ΔE*ab under ${k}: ${fix(et76[k], 1)} < ${MIN.emphTerm76}`);
      for (const k of VISION) assert.ok(et00[k] >= MIN.emphTerm00, `--emph vs --term ΔE00 under ${k}: ${fix(et00[k], 1)} < ${MIN.emphTerm00}`);
      assert.ok(ef00 >= MIN.emphFg00, `--emph vs --fg ΔE00 under protan: ${fix(ef00, 1)} < ${MIN.emphFg00}`);
    });
    await t(`${name}：ペンの赤・青・黒は地の上で 3:1 以上、色覚の模擬で互いに ΔE*ab 35 以上`, () => {
      assert.ok(v, 'colours were not read');
      const r = rows.find((x) => x.name === name);
      r.pen = {};
      for (const [k, hex] of Object.entries(PEN)) { r.pen[k] = contrast(hex, v.bg); assert.ok(r.pen[k] >= MIN.line, `${k} ${hex} on --bg ${rgb2hex(v.bg)}: ${fix(r.pen[k])}:1 < 3:1`); }
      const keys = Object.keys(PEN);
      r.penMin = Infinity;
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) for (const k of VISION) {
        const d = deUnder(PEN[keys[i]], PEN[keys[j]], k);
        if (d < r.penMin) { r.penMin = d; r.penMinAt = `${keys[i]}–${keys[j]} ${k}`; }
        assert.ok(d >= MIN.pen76, `${keys[i]} vs ${keys[j]} under ${k}: ΔE*ab ${fix(d, 1)} < ${MIN.pen76}`);
      }
      // ペンと地の差も（地に溶けない）
      r.penBgMin = Math.min(...keys.flatMap((p) => VISION.map((k) => deUnder(PEN[p], v.bg, k))));
      assert.ok(r.penBgMin >= MIN.pen76, `a pen colour is too close to --bg under simulation: ΔE*ab ${fix(r.penBgMin, 1)}`);
    });
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      spawnSync(process.execPath, ['tools/sheet.mjs', path.join(dir, 'out', 'deck.html'), path.join(shots, `${name}.png`), '--cols', '3', '--width', '640'], { cwd: ROOT, encoding: 'utf8' });
    }
  }
} finally { await browser.close(); }

// 数字の表（CI の記録とテーマの README のため）
console.log('\ntheme      base     bg       contrast: fg   term emph muted title concl sec  cover h2   | emph–term ΔE*ab N/P/D/T     | ΔE00 N/P/D/T          | emph–fg P ΔE00 | pens on bg R/B/K   min pair ΔE*ab');
for (const r of rows) {
  const c = r.c;
  console.log(`${r.name.padEnd(10)} ${r.base} ${r.bg}           ${[c.fg, c.term, c.emph, c.muted, c.title, c.concl, c.sec, c.cover, c.h2].map((x) => fix(x, 1).padStart(4)).join(' ')} | ${VISION.map((k) => fix(r.et76[k], 0).padStart(3)).join('/')}                | ${VISION.map((k) => fix(r.et00[k], 1)).join('/')} | ${fix(r.ef00, 1).padStart(5)}          | ${r.pen ? Object.values(r.pen).map((x) => fix(x, 2)).join('/') : '-'}   ${r.penMin ? fix(r.penMin, 0) + ' (' + r.penMinAt + '), vs bg ' + fix(r.penBgMin, 0) : ''}`);
}
console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
