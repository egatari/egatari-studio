// 同梱のテーマの検査（#129・#132）：テーマごとに見本（tools/fixtures/themes-sample）を組み、品質チェック・色の検査・ペンの色の検査をする
//   node tools/test-themes.mjs [作業フォルダ] [--shots <dir>]
// 1. 品質チェック（kit/check.mjs --json）：エラー 0。字と地のコントラスト（textContrast。#128）・章の扉の題（secHeading）・
//    ファイルに入っていない字体（fontNotEmbedded）・テーマの寸法（themeMetricsDrift・metricsFontLoad）の警告がない
// 量の色の段（#200）：--ramp-1…5 を #rrggbb で宣言し、OKLCH の明るさが単調に下がり、--ramp-5 が地と 3:1 以上（ブラウザなし）
// 2. 役割の色（組んだデッキで計算した値）：
//    コントラスト（WCAG 2.x）：本文 --fg・用語 --term・強調 --emph・既知 --muted・題 --title と地 --bg 4.5:1、結論の行の字 --emph と --concl-bg 4.5:1、
//      章の扉の字 --sec-fg と --sec-bg 4.5:1、表紙の題と --cover-bg 4.5:1、見出しの字とその地（帯の見出しは帯の上の白抜き）4.5:1
//    色覚の模擬（Machado ほか 2009、強さ 1.0、線形 RGB）：強調の赤 --emph と基調色 --term の差 ΔE*ab が 3 色型・1 型・2 型で 35 以上
//      （テーマの見比べ 2026-10-27 の線。常盤・焦茶をこれで直した）、CIEDE2000 で 3 色型・1 型・2 型・3 型 20 以上（テーマの工房の C4）、
//      --emph と本文 --fg の CIEDE2000 が 1 型で 20 以上（C5）
//    光 --lit（format spec §8.4。塗りの色で、いつも輪郭線と一緒に描く）：--emph との差が --emph と --term と同じ線（ΔE*ab 35 を 3 色型・1 型・2 型、
//      CIEDE2000 20 を 4 つの型）。明るい地の上では輪郭線が見分けを担うので、--bg とのコントラストは測って表に出すだけ（3:1 を求めない）。
//      テーマごとの tokens.css が自分で宣言する（親の値に頼らない）
//    暗い地の --lit：同梱のテーマに暗い版はなく、暗い地の役割の色はパーツの絵の暗い版（tools/part-thumbs.mjs の DARK）だけ。そこの --lit は
//      --bg と 3:1 以上（WCAG 1.4.11）、--emph との差 ΔE*ab 35 以上（4 つの型）。CIEDE2000 は表に出すだけ（DARK の --emph は淡い朱 #ff8f73 で、
//      2 型の模擬ではどの暖かい黄とも 17 ほどしか離れない）
//    物の色 --obj-*（format spec §8.4。内容そのものである色：袋の玉・リトマス紙・信号。11 の基本色名）：同梱のテーマはどれも自分の tokens.css で 11 色を
//      16 進で宣言し、組んだデッキでもその値になる。色の名前どおりに見えることを OKLCH（Björn Ottosson 2020）で確かめる：
//      色相の窓（度）：red 15–45、orange 50–80、yellow 85–115、green 125–165、blue 235–275、purple 285–335、pink 340–15（0 度をまたぐ）。
//        窓は CSS の色の名前の色相（red 29、orange 71、yellow 110、green 143、blue 264、purple 328、hotpink 352、pink 7）を含み、互いに重ならない。
//        有彩の 7 色は鮮やかさ C 0.10 以上。brown は orange と同じ色相の暗い色なので、色相 40–80・明るさ L 0.35–0.60・C 0.04–0.12
//      無彩：white L 0.95 以上、black L 0.32 以下、gray L 0.50–0.75。どれも C 0.02 以下
//      隣り合う色の名前（red–orange、orange–yellow、yellow–green、green–blue、blue–purple、purple–pink、pink–red、brown–orange、brown–red、
//        gray–white、gray–black）は 3 色型（ふつうの色覚）で CIEDE2000 20 以上。この線は --emph と --term、--lit と --emph と同じ（テーマの工房の C4）：
//        ΔE00 の 10 前後は並べれば違うと分かる差、20 は離れた投影でも 1 つずつ見て名前を言い分けられる差。
//        色覚の模擬は求めない（§8.4：物の色にはいつも名前か頭文字を添える。赤と緑は多くの人に似て見える）
//      --bg とのコントラストは測って表に出すだけ（塗りで、名前と、白・黒と地に近い色は輪郭線と一緒に描く）
// 3. ペンの色（kit/tools.js の PEN_COLOR。テーマによらない赤 #FF4B00・青 #005AFF・黒 #000000）：どのテーマの地 --bg の上でも線のコントラスト 3:1（WCAG 1.4.11）、
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
import { shareBrowser, launch, fileUrl } from '../kit/browser.mjs';
import { contrast, deUnder, de2000, hex2rgb, VISION, rgb2hex } from '../kit/core/color-check.mjs';
import { SHAPES, DEFAULT_LOOK, lookIn } from '../kit/core/theme-shapes.mjs';
import { CHOOSABLE, RETIRED } from '../kit/core/themes-list.mjs';
// ブラウザは 1 つだけ起動し、この試験と子のプロセス（kit/check.mjs など）の launch() はそこにつなぐ（kit/browser.mjs の shareBrowser。backlog #156）
await shareBrowser();

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
const PEN = JSON.parse((PEN_SRC.match(/var PEN_COLOR = (\{[^}]*\});/) || [])[1].replace(/(\w+):/g, '"$1":'));
const MIN = { text: 4.5, line: 3, emphTerm76: 35, emphTerm00: 20, emphFg00: 20, pen76: 35, litEmph76: 35, litEmph00: 20, litDarkBg: 3 };
// パーツの絵の暗い版の役割の色（tools/part-thumbs.mjs の DARK）
const DARK_SRC = (fs.readFileSync(path.join(ROOT, 'tools', 'part-thumbs.mjs'), 'utf8').match(/const DARK = ('[^\n]*'(?:\s*\+\s*'[^\n]*')*);/) || [])[1] || '';
const DARK = Object.fromEntries([...DARK_SRC.matchAll(/--([a-z0-9-]+):(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const fix = (x, d = 2) => Number(x).toFixed(d);
// 物の色 --obj-*（format spec §8.4）：名前の順は仕様のまま。色相の窓・明るさ・鮮やかさと、隣り合う色の名前の組（上の 2 の説明）
const OBJ = ['white', 'black', 'red', 'green', 'yellow', 'blue', 'brown', 'purple', 'pink', 'orange', 'gray'];
const OBJ_HUE = { red: [15, 45], orange: [50, 80], yellow: [85, 115], green: [125, 165], blue: [235, 275], purple: [285, 335], pink: [340, 15], brown: [40, 80] };
const OBJ_L = { white: [0.95, 1.001], black: [0, 0.32], gray: [0.50, 0.75], brown: [0.35, 0.60] };
const OBJ_C = { white: [0, 0.02], black: [0, 0.02], gray: [0, 0.02], brown: [0.04, 0.12] };   // ほかの有彩の色は C 0.10 以上
const OBJ_ADJ = [['red', 'orange'], ['orange', 'yellow'], ['yellow', 'green'], ['green', 'blue'], ['blue', 'purple'], ['purple', 'pink'], ['pink', 'red'],
  ['brown', 'orange'], ['brown', 'red'], ['gray', 'white'], ['gray', 'black']];
const OBJ_DE00 = 20;
// sRGB の 16 進 → OKLCH [L, C, h°]（Björn Ottosson 2020 の行列）
const oklch = (hex) => {
  const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hex2rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const h = (Math.atan2(B, A) * 180 / Math.PI + 360) % 360;
  return [L, Math.hypot(A, B), h];
};
const inHue = (h, [lo, hi]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);
const objOf = (name) => {
  const css = fs.readFileSync(path.join(ROOT, 'themes', name, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries(OBJ.map((k) => [k, ((css.match(new RegExp(`--obj-${k}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`)) || [])[1] || '').toUpperCase()]));
};

await t('選べるテーマ：藍・墨・国語・常盤・江戸紫・焦茶・浅葱・生成の 8 つ（この順）で、どれも同梱。business は選べないが同梱のまま（記録した教材を組む）', () => {
  assert.deepEqual(CHOOSABLE.map((x) => x.name), ['default', 'sumi', 'kokugo', 'tokiwa', 'murasaki', 'kogecha', 'asagi', 'bengara']);
  for (const x of CHOOSABLE) assert.ok(THEMES.includes(x.name), x.name);
  assert.deepEqual(RETIRED, ['business']);
  assert.ok(THEMES.includes('business'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.lock.json'), 'utf8'));
  for (const x of ['tokiwa', 'murasaki', 'kogecha', 'asagi', 'kokugo', 'business', 'sumi']) assert.equal(lock.themes[x].current, '1.3.0', x);
  assert.equal(lock.themes.bengara.current, '1.0.0');
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

await t('光 --lit：同梱のテーマはどれも自分の tokens.css で --lit を宣言する。パーツの絵の暗い版（part-thumbs の DARK）の --lit は暗い地と 3:1 以上、--emph と ΔE*ab 35 以上（4 つの型）', () => {
  for (const name of THEMES) {
    const css = fs.readFileSync(path.join(ROOT, 'themes', name, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(css, /--lit\s*:\s*#[0-9a-fA-F]{6}\s*;/, `${name}: tokens.css does not declare --lit`);
  }
  assert.ok(DARK.lit && DARK.bg && DARK.emph, 'part-thumbs DARK lacks --lit, --bg or --emph');
  const c = contrast(DARK.lit, DARK.bg);
  assert.ok(c >= MIN.litDarkBg, `dark --lit ${DARK.lit} on --bg ${DARK.bg}: ${fix(c)}:1 < 3:1`);
  for (const k of VISION) { const d = deUnder(DARK.lit, DARK.emph, k); assert.ok(d >= MIN.litEmph76, `dark --lit vs --emph ΔE*ab under ${k}: ${fix(d, 1)} < ${MIN.litEmph76}`); }
  console.log(`     dark (part-thumbs) --lit ${DARK.lit} on ${DARK.bg} ${fix(c)}:1 | vs --emph ${DARK.emph} ΔE*ab N/P/D/T ${VISION.map((k) => fix(deUnder(DARK.lit, DARK.emph, k), 0)).join('/')} | ΔE00 ${VISION.map((k) => fix(deUnder(DARK.lit, DARK.emph, k, 'de2000'), 1)).join('/')}`);
});

const OBJ_MIN = {};   // テーマごとの、隣り合う組で最も近い組（表のため）
await t(`物の色 --obj-*：同梱のテーマはどれも 11 色を自分の tokens.css で宣言し、色相の窓・明るさ・鮮やかさに入り、隣り合う色の名前が ΔE00 ${OBJ_DE00} 以上`, () => {
  const bad = [];
  for (const name of THEMES) {
    const o = objOf(name);
    for (const k of OBJ) if (!o[k]) bad.push(`${name}: tokens.css does not declare --obj-${k} as #rrggbb`);
    if (OBJ.some((k) => !o[k])) continue;
    for (const k of OBJ) {
      const [L, C, h] = oklch(o[k]);
      const where = `${name} --obj-${k} ${o[k]} (L ${fix(L, 3)} C ${fix(C, 3)} h ${fix(h, 1)})`;
      if (OBJ_HUE[k] && !inHue(h, OBJ_HUE[k])) bad.push(`${where}: hue outside ${OBJ_HUE[k].join('–')}`);
      if (OBJ_L[k] && !(L >= OBJ_L[k][0] && L <= OBJ_L[k][1])) bad.push(`${where}: lightness outside ${OBJ_L[k].join('–')}`);
      const cw = OBJ_C[k] || [0.10, Infinity];
      if (!(C >= cw[0] && C <= cw[1])) bad.push(`${where}: chroma outside ${cw[0]}–${cw[1]}`);
    }
    for (const [a, b] of OBJ_ADJ) {
      const d = de2000(o[a], o[b]);
      if (!OBJ_MIN[name] || d < OBJ_MIN[name].d) OBJ_MIN[name] = { d, pair: `${a}–${b}` };
      if (d < OBJ_DE00) bad.push(`${name}: --obj-${a} ${o[a]} vs --obj-${b} ${o[b]} ΔE00 ${fix(d, 1)} < ${OBJ_DE00}`);
    }
  }
  assert.deepEqual(bad, []);
  for (const name of THEMES) console.log(`     ${name.padEnd(9)} closest adjacent pair ${OBJ_MIN[name].pair} ΔE00 ${fix(OBJ_MIN[name].d, 1)} | ${OBJ_ADJ.map(([a, b]) => fix(de2000(objOf(name)[a], objOf(name)[b]), 0)).join(' ')}`);
});

// 量の色の段 --ramp-1…5（format spec §8.4、backlog #200）：低→高の 5 段。地 --bg はテーマの tokens.css、なければ default の値
const declared = (name, prop) => ((fs.readFileSync(path.join(ROOT, 'themes', name, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(new RegExp(`${prop}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`)) || [])[1] || '').toUpperCase();
await t('量の色の段 --ramp-1…5：同梱のテーマはどれも 5 段を #rrggbb で自分の tokens.css に宣言し、OKLCH の明るさが 1→5 で単調に下がり（隣と 0.05 以上）、--ramp-5 は地 --bg と 3:1 以上', () => {
  const bad = [], table = [];
  for (const name of THEMES) {
    const r = [1, 2, 3, 4, 5].map((k) => declared(name, `--ramp-${k}`));
    const bg = declared(name, '--bg') || declared('default', '--bg');
    if (r.some((x) => !x)) { bad.push(`${name}: tokens.css does not declare --ramp-1 … --ramp-5 as #rrggbb (${r.join(' ')})`); continue; }
    const L = r.map((x) => oklch(x)[0]);
    for (let k = 1; k < 5; k++) if (!(L[k - 1] - L[k] >= 0.05)) bad.push(`${name}: --ramp-${k} ${r[k - 1]} (L ${fix(L[k - 1], 3)}) → --ramp-${k + 1} ${r[k]} (L ${fix(L[k], 3)}): lightness must fall by 0.05 or more`);
    const c5 = contrast(r[4], bg);
    if (c5 < MIN.line) bad.push(`${name}: --ramp-5 ${r[4]} on --bg ${bg}: ${fix(c5)}:1 < 3:1`);
    table.push(`     ${name.padEnd(9)} ${r.join(' ')} | L ${L.map((x) => fix(x, 2)).join(' ')} | --ramp-5 on ${bg} ${fix(c5)}:1`);
  }
  assert.deepEqual(bad, []);
  console.log(table.join('\n'));
});

// Node の部分だけを走らせる環境でも、未検査を通過扱いにしないよう明示する。
if (process.env.EGATARI_TEST_NO_BROWSER === '1') {
  console.log(`SKIP browser checks; Node checks: ${n - fail}/${n} ok`);
  process.exit(fail ? 1 : 0);
}

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
        v = await page.evaluate((OBJ) => {
          const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          const rgb = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((x) => x / 255); };
          const tok = (n) => { const e = document.createElement('i'); e.style.color = `var(--${n})`; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return rgb(c); };
          const out = {};
          for (const k of ['fg', 'bg', 'title', 'term', 'emph', 'muted', 'base', 'concl-bg', 'cover-bg', 'sec-bg', 'lit']) out[k] = tok(k);
          out.obj = {};
          for (const k of OBJ) out.obj[k] = tok('obj-' + k);
          // 章の扉の字（--sec-fg。既定は白）・表紙の題・ふつうのスライドの見出しの字とその地は、描いた要素から
          const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const b = getComputedStyle(a).backgroundColor; if (b && !/rgba\(.*,\s*0\)$/.test(b) && b !== 'transparent') return rgb(b); } return [1, 1, 1]; };
          const sec = document.querySelector('#t-sec h1'), cov = document.querySelector('#t-cover h1'), h2 = document.querySelector('#t-list > h2');
          out.secFg = rgb(getComputedStyle(sec).color); out.secBg = bgOf(sec);
          out.coverTitle = rgb(getComputedStyle(cov).color); out.coverBg = bgOf(cov);
          out.h2 = rgb(getComputedStyle(h2).color); out.h2Bg = bgOf(h2);
          return out;
        }, OBJ);
      } finally { await page.close(); }
      const c = {
        fg: contrast(v.fg, v.bg), term: contrast(v.term, v.bg), emph: contrast(v.emph, v.bg), muted: contrast(v.muted, v.bg), title: contrast(v.title, v.bg),
        concl: contrast(v.emph, v['concl-bg']), sec: contrast(v.secFg, v.secBg), cover: contrast(v.coverTitle, v.coverBg), h2: contrast(v.h2, v.h2Bg),
      };
      const et76 = Object.fromEntries(VISION.map((k) => [k, deUnder(v.emph, v.term, k)]));
      const et00 = Object.fromEntries(VISION.map((k) => [k, deUnder(v.emph, v.term, k, 'de2000')]));
      const ef00 = deUnder(v.emph, v.fg, 'protan', 'de2000');
      const lit = { bg: contrast(v.lit, v.bg), e76: Object.fromEntries(VISION.map((k) => [k, deUnder(v.lit, v.emph, k)])), e00: Object.fromEntries(VISION.map((k) => [k, deUnder(v.lit, v.emph, k, 'de2000')])) };
      rows.push({ name, base: rgb2hex(v.base), bg: rgb2hex(v.bg), c, et76, et00, ef00, lit, v });
      const low = Object.entries(c).filter(([, r]) => r < MIN.text).map(([k, r]) => `${k} ${fix(r)}:1`);
      assert.deepEqual(low, [], 'contrast below 4.5:1');
      for (const k of ['normal', 'protan', 'deutan']) assert.ok(et76[k] >= MIN.emphTerm76, `--emph vs --term ΔE*ab under ${k}: ${fix(et76[k], 1)} < ${MIN.emphTerm76}`);
      for (const k of VISION) assert.ok(et00[k] >= MIN.emphTerm00, `--emph vs --term ΔE00 under ${k}: ${fix(et00[k], 1)} < ${MIN.emphTerm00}`);
      assert.ok(ef00 >= MIN.emphFg00, `--emph vs --fg ΔE00 under protan: ${fix(ef00, 1)} < ${MIN.emphFg00}`);
      // 光 --lit：--emph と分かれる（--emph と --term と同じ線）。--bg とのコントラストは表に出すだけ（輪郭線と一緒に描く塗り）
      for (const k of ['normal', 'protan', 'deutan']) assert.ok(lit.e76[k] >= MIN.litEmph76, `--lit vs --emph ΔE*ab under ${k}: ${fix(lit.e76[k], 1)} < ${MIN.litEmph76}`);
      for (const k of VISION) assert.ok(lit.e00[k] >= MIN.litEmph00, `--lit vs --emph ΔE00 under ${k}: ${fix(lit.e00[k], 1)} < ${MIN.litEmph00}`);
      // 物の色 --obj-*：組んだデッキでも tokens.css の値（親の値で上書きされない）。--bg とのコントラストは表に出すだけ
      const decl = objOf(name);
      assert.deepEqual(Object.fromEntries(OBJ.map((k) => [k, rgb2hex(v.obj[k])])), decl, 'object colours in the built lesson differ from tokens.css');
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
console.log('\ntheme      --lit    on --bg | lit–emph ΔE*ab N/P/D/T | ΔE00 N/P/D/T');
for (const r of rows) if (r.lit) console.log(`${r.name.padEnd(10)} ${rgb2hex(r.v.lit)} ${fix(r.lit.bg).padStart(5)}:1 | ${VISION.map((k) => fix(r.lit.e76[k], 0).padStart(3)).join('/')}            | ${VISION.map((k) => fix(r.lit.e00[k], 1)).join('/')}`);
console.log('\ntheme      object colours --obj-*: hex  OKLCH L/C/h  contrast on --bg');
for (const r of rows) {
  const bg = rgb2hex(r.v.bg);
  console.log(`${r.name.padEnd(10)} --bg ${bg}`);
  for (const k of OBJ) { const hex = rgb2hex(r.v.obj[k]); const [L, C, h] = oklch(hex); console.log(`           ${k.padEnd(7)} ${hex}  ${fix(L, 3)} ${fix(C, 3)} ${C < 0.02 ? '    -' : fix(h, 1).padStart(5)}  ${fix(contrast(hex, bg)).padStart(5)}:1`); }
  if (OBJ_MIN[r.name]) console.log(`           closest adjacent pair: ${OBJ_MIN[r.name].pair} ΔE00 ${fix(OBJ_MIN[r.name].d, 1)} (≥ ${OBJ_DE00})`);
}
console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
