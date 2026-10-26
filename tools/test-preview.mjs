// 先のステップを薄く見せる（Player P1）と部品の ctx（format spec §8.4）・ファイルの版の情報（format spec §4.1、Player P3）の確認
//   node tools/test-preview.mjs [出力先]
// 試験用のデッキ（作業フォルダの部品 2 つ：m-pv-log は受け取った ctx を覚える、m-pv-ans は static preview = "none" を宣言する）を組み、
// - ctx は mode:"talk"・preview:true（内部の "lecture" を部品に見せない）。?mode=lecture と ?mode=talk&preview=1 はどちらも talk ＋ preview、l でも同じ
// - 薄さは --preview-opacity（0.45）、--lecture-dim はそれと同じ値
// - data-preview="none" の要素は薄くせず隠す（段階を持つ要素も、薄く見せる段階の要素の中の要素も）。書き手が印を付けた部品には preview:false
// - preview:"none" の部品は外から薄くしない（段階を持つ部品は隠す、薄く見せる段階の中の部品も隠す）
// - ctx.slide はスライドの鍵（文字列）。ctx.entered は別のスライドから・跳んで入った最初の描画だけ true
// - 動きを減らす設定では static clock = true の部品だけ実際の t、ほかは最後の状態
// - ? の情報：形式 → プレーヤー → 作成 の順と言葉（ja・en）。title があればそれ、無ければ name から。player が無ければその行を出さない。版の文字列だけの deck-meta では出さない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-preview-')));
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const LOG = `DECK.define("m-pv-log", class extends DECK.MotionElement {
  static steps = 2;
  mount(ctx){ this._m = {mode: ctx.mode, preview: ctx.preview, slide: ctx.slide}; }
  render(k, t, ctx){ this._c = {mode: ctx.mode, preview: ctx.preview, slide: ctx.slide}; this._lt = t; (this._e = this._e || []).push(ctx.entered); this.textContent = "log " + k; }
});
`;
const ANS = `DECK.define("m-pv-ans", class extends DECK.MotionElement {
  static preview = "none";
  static steps = 1;
  render(k, t, ctx){ this._c = {mode: ctx.mode, preview: ctx.preview}; this.textContent = "answer 42"; }
});
`;
const CLOCK = `DECK.define("m-pv-clock", class extends DECK.MotionElement {
  static clock = true;
  static steps = 1;
  duration(k){ return k === 1 ? 3 : 0; }
  render(k, t, ctx){ (this._t = this._t || []).push(t); this.textContent = "clock " + (t === Infinity ? "end" : t.toFixed(1)); }
});
`;
const deck = (lang) => `<!DOCTYPE html>
<html lang="${lang}" data-theme="default">
<head><meta charset="utf-8"><title>preview</title></head>
<body>
<div id="stage">
<section class="slide noconcl" id="s-pv">
  <h2>Preview</h2>
  <div class="body">
    <p data-step="1" id="p1">first</p>
    <p data-step="2" id="p2">second</p>
    <p data-step="2" id="ans" data-preview="none">the answer</p>
    <div data-step="2" id="host">host <span id="inner" data-preview="none">inner answer</span></div>
    <div data-step="2" id="chost">host <m-pv-ans id="ca" style="display:inline-block"></m-pv-ans></div>
    <div data-step="2" id="cb"><m-pv-ans id="cb-c" data-step="2" style="display:inline-block"></m-pv-ans></div>
    <m-pv-log id="lg" style="display:block;height:40px"></m-pv-log>
    <div data-preview="none"><m-pv-log id="lg2" style="display:block;height:40px"></m-pv-log></div>
  </div>
</section>
<section class="slide noconcl" id="s-two">
  <h2>Two</h2>
  <div class="body"><p data-step="1" id="two1">two</p>
    <m-pv-clock id="ck" data-from="1" style="display:block;height:40px"></m-pv-clock>
    <m-pv-log id="lg3" data-from="1" style="display:block;height:40px"></m-pv-log></div>
</section>
</div>
</body>
</html>
`;
const built = {};
for (const lang of ['ja', 'en']) {
  const dir = path.join(out, lang);
  fs.mkdirSync(path.join(dir, 'components', 'pv-log'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'components', 'pv-ans'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'components', 'pv-log', 'index.js'), LOG);
  fs.writeFileSync(path.join(dir, 'components', 'pv-ans', 'index.js'), ANS);
  fs.mkdirSync(path.join(dir, 'components', 'pv-clock'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'components', 'pv-clock', 'index.js'), CLOCK);
  fs.writeFileSync(path.join(dir, 'deck.html'), deck(lang));
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { stdio: 'pipe' });
  built[lang] = path.join(dir, 'out', 'deck.html');
}

const b = await launch();
const errs = [];
const page = async (file, q = '') => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(fileUrl(file) + q);
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  return p;
};
const probe = (p, k) => p.evaluate((k) => {
  DECK.seek(0, k, Infinity);
  const op = (id) => +getComputedStyle(document.getElementById(id)).opacity;
  const el = (id) => document.getElementById(id);
  const cs = getComputedStyle(document.documentElement);
  return {
    mode: DECK.mode, lg: el('lg')._c, lgMount: el('lg')._m, lg2: el('lg2')._c, ca: el('ca')._c,
    pv: parseFloat(cs.getPropertyValue('--preview-opacity')), dim: parseFloat(cs.getPropertyValue('--lecture-dim')),
    p1: op('p1'), p2: op('p2'), ans: op('ans'), host: op('host'), inner: op('inner'), chost: op('chost'), ca2: op('ca'), cb: op('cb'), cbc: op('cb-c'),
    ansAria: el('ans').getAttribute('aria-hidden'), p2Aria: el('p2').getAttribute('aria-hidden'), innerAria: el('inner').getAttribute('aria-hidden'),
  };
}, k);

// ---- ?mode=lecture（古い呼び方）：talk ＋ preview
let p = await page(built.ja, '?mode=lecture');
let r = await probe(p, 1);
ok(r.mode === 'lecture', '?mode=lecture: the internal mode is lecture (' + r.mode + ')');
ok(r.lg && r.lg.mode === 'talk' && r.lg.preview === true, 'render ctx: mode "talk", preview true (not "lecture") ' + JSON.stringify(r.lg));
ok(r.lgMount && r.lgMount.mode === 'talk' && r.lgMount.preview === true, 'mount ctx: mode "talk", preview true ' + JSON.stringify(r.lgMount));
ok(r.lg.slide === 's-pv' && r.lgMount.slide === 's-pv', 'ctx.slide is the slide key (a string), in mount and render ' + JSON.stringify([r.lgMount.slide, r.lg.slide]));
ok(r.pv === 0.45 && r.dim === r.pv, `--preview-opacity is 0.45 and --lecture-dim equals it (${r.pv}, ${r.dim})`);
ok(r.p1 === 1 && Math.abs(r.p2 - 0.45) < 1e-6, `a later step is shown at 0.45 (p1 ${r.p1}, p2 ${r.p2})`);
ok(r.p2Aria === null, 'a faint later step is not aria-hidden');
ok(r.ans === 0 && r.ansAria === 'true', `data-preview="none" with a later step stays hidden, not faint (${r.ans})`);
ok(Math.abs(r.host - 0.45) < 1e-6 && r.inner === 0 && r.innerAria === 'true', `data-preview="none" inside a faint later step stays hidden (host ${r.host}, inner ${r.inner})`);
ok(r.lg2 && r.lg2.preview === false && r.lg2.mode === 'talk', 'a component inside data-preview="none" gets preview false ' + JSON.stringify(r.lg2));
ok(Math.abs(r.chost - 0.45) < 1e-6 && r.ca2 === 0, `a preview:"none" component inside a faint later step is hidden, not dimmed from outside (host ${r.chost}, component ${r.ca2})`);
ok(r.cbc === 0 && (r.cb === 0 || Math.abs(r.cb - 0.45) < 1e-6), `a preview:"none" component with its own later step is hidden (${r.cbc})`);
ok(r.ca && r.ca.mode === 'talk' && r.ca.preview === true, 'a preview:"none" component still gets the player\'s ctx (it draws its own later steps) ' + JSON.stringify(r.ca));
await p.screenshot({ path: path.join(out, 'lecture-k1.png') });
r = await probe(p, 2);
ok(r.p2 === 1 && r.ans === 1 && r.inner === 1 && r.ca2 === 1 && r.cbc === 1 && r.ansAria === null && r.innerAria === null, 'at the step itself everything is shown');
// l で切る → talk、preview false
await p.keyboard.press('l');
r = await probe(p, 1);
ok(r.mode === 'talk' && r.lg.mode === 'talk' && r.lg.preview === false && r.p2 === 0 && r.ans === 0 && r.host === 0 && r.chost === 0, 'l turns preview off: ctx preview false, later steps hidden');
ok(Math.abs(r.host) < 1e-6 && (await p.evaluate(() => document.getElementById('inner').style.opacity)) === '', 'turning preview off restores the inner element\'s own opacity');
await p.keyboard.press('l');
r = await probe(p, 1);
ok(r.mode === 'lecture' && r.lg.mode === 'talk' && r.lg.preview === true && r.ans === 0, 'l turns preview on again: ctx talk + preview');
await p.close();

// ---- ctx.entered：別のスライドから・跳んで入った最初の描画だけ true
{
  const q = await page(built.ja);
  const E = () => q.evaluate(() => { const l = document.getElementById('lg'), e = l._e || []; l._e = []; return e; });
  await q.evaluate(() => { window.__pos = 0; document.addEventListener('deck:pos', () => { window.__pos++; }); });
  let e = await E();
  ok(e.length > 0 && e[0] === true && e.slice(1).every((x) => x === false), 'entered: true on the first render when the lesson opens ' + JSON.stringify(e));
  await q.keyboard.press('ArrowRight'); await q.waitForTimeout(400);
  e = await E();
  ok(e.length > 0 && e.every((x) => x === false), 'entered: false when stepping within the slide ' + JSON.stringify(e.slice(0, 4)));
  await q.evaluate(() => DECK.go(1, 0, false)); await q.waitForTimeout(200); await E();
  await q.keyboard.press('ArrowLeft'); await q.waitForTimeout(400);
  e = await E();
  ok(e.length > 0 && e[0] === true && e.slice(1).every((x) => x === false), 'entered: true on coming back from another slide ' + JSON.stringify(e.slice(0, 4)));
  await q.evaluate(() => DECK.go(0, 1, false)); await q.waitForTimeout(300);
  e = await E();
  ok(e.length > 0 && e[0] === true, 'entered: true after a jump within the same slide (link, overview, page number) ' + JSON.stringify(e.slice(0, 4)));
  await q.evaluate(() => DECK.seek(0, 1, Infinity));
  e = await E();
  ok(e.length === 1 && e[0] === false, 'entered: false when the same position is drawn again ' + JSON.stringify(e));
  ok(await q.evaluate(() => window.__pos) >= 3, 'deck:pos still fires for components pinned before ctx.entered');
  await q.close();
}

// ---- 動きを減らす設定：static clock = true の部品だけ実際の t（Player P3）、ほかは最後の状態
for (const reduce of [true, false]) {
  const q = await b.newPage({ viewport: { width: 1280, height: 720 } });
  q.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  if (reduce) await q.emulateMedia({ reducedMotion: 'reduce' });
  await q.goto(fileUrl(built.ja) + '#s-two');
  await q.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await q.evaluate(() => { document.getElementById('ck')._t = []; });
  await q.keyboard.press('ArrowRight');
  await q.waitForTimeout(150);
  const early = await q.evaluate(() => ({ op: +getComputedStyle(document.getElementById('two1')).opacity, lt: document.getElementById('lg3')._lt }));
  await q.waitForTimeout(1200);
  const r = await q.evaluate(() => ({ ts: document.getElementById('ck')._t, st: DECK.state() }));
  const fin = r.ts.filter((x) => x !== Infinity);
  if (reduce) {
    ok(r.st.step === 1 && fin.length >= 3 && fin.some((x) => x > 0.8) && fin.every((x) => x < 3), `reduced motion: a clock component (static clock = true) gets the real t ${JSON.stringify(fin.slice(-3).map((x) => +x.toFixed(2)))}`);
    ok(early.op === 1 && early.lt === Infinity, `reduced motion: everything else is at its final state at once (item opacity ${early.op}, other component t ${early.lt})`);
  } else ok(fin.length >= 3 && fin.some((x) => x > 0.8), 'normal motion: the clock component runs as before');
  await q.close();
}

// ---- ?mode=talk&preview=1（Player P8 の preview=1）も同じ
p = await page(built.ja, '?mode=talk&preview=1');
r = await probe(p, 1);
ok(r.mode === 'lecture' && r.lg.mode === 'talk' && r.lg.preview === true && Math.abs(r.p2 - 0.45) < 1e-6, '?mode=talk&preview=1 opens talk with preview');
await p.close();
// ---- 発表（既定）：preview false。動画：mode video
p = await page(built.ja);
r = await probe(p, 1);
ok(r.mode === 'talk' && r.lg.mode === 'talk' && r.lg.preview === false && r.p2 === 0, 'talk: ctx mode talk, preview false, later steps hidden');
await p.close();
p = await page(built.ja, '?mode=video');
r = await probe(p, 1);
ok(r.lg.mode === 'video' && r.lg.preview === false, 'video: ctx mode video, preview false');
await p.close();
// テーマが --preview-opacity を変えれば従う（--lecture-dim も同じ値になる）
p = await page(built.ja, '?mode=lecture');
await p.evaluate(() => document.documentElement.style.setProperty('--preview-opacity', '.3'));
r = await probe(p, 1);
ok(Math.abs(r.p2 - 0.3) < 1e-6 && r.dim === 0.3, `a theme's --preview-opacity is followed (${r.p2}, --lecture-dim ${r.dim})`);
await p.close();

// ---- ? の情報：形式 → プレーヤー → 作成
const META = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const withMeta = (lang, meta, name) => {
  const html = fs.readFileSync(built[lang], 'utf8');
  const re = /(<script type="application\/json" id="deck-meta">)[^<]*(<\/script>)/;
  if (!re.test(html)) throw new Error('no deck-meta in ' + built[lang]);
  const f = path.join(path.dirname(built[lang]), name);
  fs.writeFileSync(f, html.replace(re, (m, a, c) => a + META(meta) + c));
  return f;
};
const full = { format: 'egatari', version: { major: 1, minor: 0 }, player: { name: 'egatari-player', version: '1.0.0' }, generator: { name: 'egatari-studio', version: '0.6.0' }, docId: '00000000-0000-4000-8000-000000000000', title: 'preview', lang: 'ja', portable: true, tracking: [] };
const noPlayer = { ...full }; delete noPlayer.player;
const titled = { ...full, player: { name: 'x-play', version: '2.1.0', title: 'Some Player' }, generator: { name: 'x-make', version: '3.0', title: 'Some Studio' } };
const about = async (file, ver) => {
  const q = await page(file);
  if (ver) ver.push(await q.evaluate(() => [DECK.VERSION, DECK.MADE_WITH]));
  await q.keyboard.press('?');
  await q.waitForSelector('#dt-help.show');
  const rows = await q.$$eval('#dt-help .dt-about-r', (xs) => xs.map((x) => x.textContent));
  await q.close();
  return rows;
};
const PKG_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const EXP = {
  ja: ['形式：Egatari 1.0', 'プレーヤー：Egatari Player 1.0.0', '作成：Egatari Studio 0.6.0'],
  en: ['Format: Egatari 1.0', 'Player: Egatari Player 1.0.0', 'Made with: Egatari Studio 0.6.0'],
};
for (const lang of ['ja', 'en']) {
  const ver = [];
  let rows = await about(withMeta(lang, { ...full, lang }, 'meta-full.html'), ver);
  ok(JSON.stringify(rows) === JSON.stringify(EXP[lang]), `info panel (${lang}): Format → Player → Made with ${JSON.stringify(rows)}`);
  ok(JSON.stringify(ver[0]) === JSON.stringify(['1.0.0', '0.6.0']), `DECK.VERSION (${lang}) is the player's version, DECK.MADE_WITH the generator's ${JSON.stringify(ver[0])}`);
  rows = await about(withMeta(lang, { ...noPlayer, lang }, 'meta-noplayer.html'), ver);
  ok(JSON.stringify(ver[1]) === JSON.stringify(['0.6.0', '0.6.0']), `DECK.VERSION (${lang}) without player (a file before 1.0) is the generator's ${JSON.stringify(ver[1])}`);
  ok(JSON.stringify(rows) === JSON.stringify([EXP[lang][0], EXP[lang][2]]), `info panel (${lang}): without player, no Player line ${JSON.stringify(rows)}`);
  rows = await about(withMeta(lang, { ...titled, lang }, 'meta-titled.html'));
  ok(JSON.stringify(rows) === JSON.stringify([EXP[lang][0], EXP[lang][1].replace('Egatari Player 1.0.0', 'Some Player 2.1.0'), EXP[lang][2].replace('Egatari Studio 0.6.0', 'Some Studio 3.0')]), `info panel (${lang}): player.title and generator.title are shown when present ${JSON.stringify(rows)}`);
  rows = await about(withMeta(lang, { ...full, lang, player: { name: 'other-player', version: '1' } }, 'meta-untitled.html'));
  ok(rows[1] === EXP[lang][1].replace('Egatari Player 1.0.0', 'other-player 1'), `info panel (${lang}): without title, a name outside the format's own is shown as written ${JSON.stringify(rows)}`);
  rows = await about(built[lang], ver);
  ok(ver[2][0] === PKG_VERSION && ver[2][1] === '', `DECK.VERSION (${lang}) in a plain build is Studio's version ${JSON.stringify(ver[2])}`);
  ok(rows.length === 0, `info panel (${lang}): a plain build (deck-meta with a version string only) shows no version lines ${JSON.stringify(rows)}`);
}
// 名前は文字として出す（deck-meta の中身で HTML を作らない）
{
  const f = withMeta('en', { ...full, lang: 'en', generator: { name: '<img src=x onerror=window.__x=1>', version: '1' } }, 'meta-evil.html');
  const q = await page(f);
  await q.keyboard.press('?'); await q.waitForSelector('#dt-help.show');
  ok(!(await q.$('#dt-help .dt-about img')) && !(await q.evaluate(() => window.__x)), 'info panel: names from deck-meta are text, not markup');
  await q.close();
}

ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed', '→', out);
process.exit(fails ? 1 : 0);
