// 自習（learn）と進み具合の記録（kit/track.js。Player P1・P6、format spec §9.2、spec bindings/scorm12.md）の確認：Chromium で
//   node tools/test-tracking.mjs [作業フォルダ] [--shots]
// 自習：帯（再生・一時停止・再生速度、発表者の道具がない）・x/d/v/p が効かない・再生速度（0.75〜2 倍）でタイムラインも声も速くなり声の高さを保つ・
//   一時停止はその所から続く・再生中に送っても再生を続ける（talk では止まる）・薄く見せるの入り切りで learn のまま・文書が隠れたら止まる
// 記録：舞台で再生したステップ（via stage）と本で読んだステップ（via text：節が 3 秒見えていた。読み飛ばしは数えない。縦書きも。台本で読むも）を別々に持つ・
//   終えた判定（既定・visitedFraction・reachedEnd・played: true）・postMessage の出来事・SCORM 1.2 の模型が受ける呼び出し（初め・位置・再開データ・
//   終えた・終わり・再開・振り返り・教材が変わったとき）・1 ファイルの deck-meta.tracking と completion
// --shots：作業フォルダに画面の PNG を残す（目で見る用）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { silentWav } from './portable-fixtures.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-tracking-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用の教材（架空の中身。tools/test-panes.mjs と同じ形）
const SLIDES = [['s-tr2aaa', 'sec-tr2aaa', '春の朝'], ['s-tr3bbb', 'sec-tr3bbb', '夏の雨'], ['s-tr4ccc', 'sec-tr4ccc', '秋の夕'], ['s-tr5ddd', 'sec-tr5ddd', '冬の夜']];
const para = (n, w) => Array.from({ length: n }, (_, j) => `${w}の${j + 1}番目の段落。ここには読むための文が長く続く。光が差し、風が通り、言葉が少しずつ形を持ちはじめる。読み手はその変化を一つずつ確かめながら先へ進む。`).join('\n\n');
function makeDeck(name, { vertical = false, article = true, theme = 'default', completion = null, portable = false } = {}) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  const slides = SLIDES.map(([id, sec, t]) => `<section class="slide" id="${id}"${article ? ` data-article="${sec}"` : ''}>
  <h2>${t}</h2>
  <div class="body">
    <p data-step="1">${t}の一つ目の点。</p>
    <p data-step="2">${t}の二つ目の点。</p>
  </div>
</section>`).join('\n');
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="${theme}">
<head><meta charset="utf-8"><title>記録の試験</title></head>
<body>
<div id="stage">
${slides}
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), SLIDES.map(([id, , t]) => `## ${t} {#${id}}
[0] ${t}について話します。
[1] 一つ目の点です。${para(1, t + '一')}
[2] 二つ目の点です。${para(1, t + '二')}
`).join('\n'));
  if (article) {
    fs.writeFileSync(path.join(dir, 'article.md'), `---
title: 季節の文章
${vertical ? 'writing-mode: vertical-rl\n' : ''}---

${SLIDES.map(([, sec, t]) => `(${sec})=
## ${t}

${para(5, t)}
`).join('\n')}`);
  }
  if (completion || portable) fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ docId: '7f9c2a1e-4b3d-4c8a-9e21-0c5d7a3b9e41', metadata: completion ? { completion } : {} }, null, 1));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), ...(portable ? ['--portable'] : [])], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  if (portable) {
    const f = fs.readdirSync(dir).find((x) => x.endsWith('.ega.html'));
    return path.join(dir, f);
  }
  return path.join(dir, 'out', 'deck.html');
}
// 組んだ文書の deck-meta / deck-audio を書き換えた写し（試験のためだけ）
function patched(file, name, fn) {
  let h = fs.readFileSync(file, 'utf8');
  h = fn(h);
  const out = path.join(path.dirname(file), name);
  fs.writeFileSync(out, h);
  return out;
}
const setJson = (id, f) => (h) => h.replace(new RegExp(`(<script type="application/json" id="${id}">)([\\s\\S]*?)(</script>)`), (m, a, j, b) => a + JSON.stringify(f(JSON.parse(j))) + b);

const H = makeDeck('book-h');
const V = makeDeck('book-v', { vertical: true, theme: 'kokugo' });
const S = makeDeck('script', { article: false });
const PLAYED = patched(H, 'played.html', setJson('deck-meta', (m) => ({ ...m, completion: { played: true } })));
const FRAC = patched(H, 'frac.html', setJson('deck-meta', (m) => ({ ...m, completion: { visitedFraction: 0.5 } })));
const END = patched(H, 'end.html', setJson('deck-meta', (m) => ({ ...m, completion: { reachedEnd: true } })));
// 声のある写し：最初のスライドの各ステップに 2 秒の無音（再生速度と声の高さを見る）
fs.writeFileSync(path.join(path.dirname(S), 'silent.wav'), silentWav(2));
const AUD = patched(S, 'audio.html', setJson('deck-audio', () => Object.fromEntries(['0', '1', '2'].map((k) => [`${SLIDES[0][0]}:${k}`, { src: 'silent.wav', dur: 2 }]))));

const browser = await launch();
const errors = [];
async function open(file, { w = 1280, h = 720, q = '', ctx = null, init = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${path.basename(file)}: ${e.message}`));
  if (init) await p.addInitScript(init.fn, init.arg);
  await p.goto(fileUrl(file) + q);
  await p.waitForFunction(() => window.DECK && DECK.ready && DECK.panes && DECK.tracking && DECK.tracking().adapter);
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const wait = (p, ms) => p.waitForTimeout(ms);
const tr = (p) => p.evaluate(() => DECK.tracking());
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(work, n + '.png') }); };
const nSteps = SLIDES.length * 3;
const ords = (slide) => [slide * 3, slide * 3 + 1, slide * 3 + 2];
const hasAll = (list, want) => want.every((j) => list.includes(j));
const hasNone = (list, want) => want.every((j) => !list.includes(j));
// 読んだことになるまで待つ（3 秒の後、0.5 秒ごとに見るので遅い CI では少し遅れる。8 秒まで）
const untilRead = (p, want, ms = 8000) => p.waitForFunction((w) => w.every((j) => DECK.tracking().text.includes(j)), want, { timeout: ms }).catch(() => {});
// 本の窓を、ある節が窓の初めに来るまでスクロールする（見る人のスクロール）
async function scrollToSec(p, sel) {
  await p.evaluate((sel) => {
    const b = document.querySelector('#deck-text .dx-body'), e = document.querySelector(sel), br = b.getBoundingClientRect(), r = e.getBoundingClientRect(), v = b.classList.contains('dx-vertical');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    if (v) b.scrollLeft -= br.right - r.right; else b.scrollTop += r.top - br.top;
  }, sel);
}

// ---------------------------------------------------------------- 1. 自習（learn）の帯とキー
{
  const p = await open(S, { q: '?mode=learn' });
  const s0 = await p.evaluate(() => ({ mode: DECK.state().mode, layout: DECK.panes.state().layout, html: document.documentElement.getAttribute('data-mode') }));
  ok(s0.mode === 'learn' && s0.html === 'learn', `?mode=learn opens learn (${JSON.stringify(s0)})`);
  ok(s0.layout === 'split', 'learn on a wide screen opens slides and script');
  const btns = await p.evaluate(() => [...document.querySelectorAll('#dt-cb [data-b]')].map((b) => b.getAttribute('data-b')));
  ok(['prev', 'auto', 'next', 'rate'].every((b) => btns.includes(b)), `the learn toolbar has prev, play, next and playback speed (${btns.join(',')})`);
  ok(['laser', 'pen', 'vpen', 'clear', 'pres'].every((b) => !btns.includes(b)), 'the learn toolbar has no presenter tools (laser, pen, fading pen, clear, presenter view)');
  const lab = await p.evaluate(() => [document.querySelector('#dt-cb [data-b="auto"]').getAttribute('aria-label'), document.querySelector('#dt-cb [data-b="rate"]').getAttribute('aria-label'), document.querySelector('#dt-cb [data-b="rate"]').textContent]);
  ok(lab[0] === '再生' && lab[1] === '再生速度：1×' && lab[2] === '1×', `play and playback speed labels (${lab.join(' | ')})`);
  await p.click('#stage', { position: { x: 300, y: 300 } });
  for (const k of ['x', 'd', 'v']) { await p.keyboard.press(k); ok(await p.evaluate(() => DECK.tools.mode()) === null, `learn: ${k} does not start a presenter tool`); }
  const pages = p.context().pages().length;
  await p.keyboard.press('p'); await wait(p, 300);
  ok(p.context().pages().length === pages, 'learn: p does not open the presenter view');
  await p.keyboard.press('?');
  const help = await p.evaluate(() => document.getElementById('dt-help').textContent);
  ok(/再生速度/.test(help) && !/レーザーポインター/.test(help) && !/発表者ビュー（|発表者ビュー$/.test(help.replace(/発表者ビューから抜けられない.*/, '')), 'learn help lists playback speed and no presenter tools');
  await p.keyboard.press('Escape');
  // 再生速度：ボタンで 1 → 1.25、> で 1.5、< で 1.25、端で止まる、DECK.rate は 5 つの値だけ
  await p.click('#dt-cb [data-b="rate"]');
  ok(await p.evaluate(() => DECK.rate()) === 1.25, 'the playback speed button steps 1× → 1.25×');
  await p.keyboard.press('>'); ok(await p.evaluate(() => DECK.rate()) === 1.5, '> makes it faster (1.5×)');
  await p.keyboard.press('<'); ok(await p.evaluate(() => DECK.rate()) === 1.25, '< makes it slower (1.25×)');
  ok(await p.evaluate(() => [DECK.rate(3), DECK.rate(0.5), DECK.rate(2), DECK.rate(0.75)].join()) === '1.25,1.25,2,0.75', 'only 0.75, 1, 1.25, 1.5 and 2 are accepted');
  ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="rate"]').textContent) === '0.75×', 'the button shows the current speed');
  // 薄く見せる：learn のまま入り切り
  await p.keyboard.press('l');
  ok(await p.evaluate(() => DECK.state().mode === 'learn' && DECK.state().preview === true), 'l in learn turns on later-steps-faintly and stays in learn');
  await p.keyboard.press('l');
  ok(await p.evaluate(() => DECK.state().preview === false), 'l again turns it off');
  await shot(p, '01-learn-bar');
  await p.context().close();
}

// ---------------------------------------------------------------- 2. 自習の再生：速さ・一時停止・送り・隠れたら止まる・声
{
  const tl = async (p) => p.evaluate(() => DECK.timeline().map((g) => ({ key: g.key, dur: g.dur })));
  // 1 段階が進むまでの時間（実時間の秒）
  const advance = async (p, rate) => {
    await p.evaluate((r) => { DECK.rate(r); DECK.go(1, 1); }, rate);
    const key0 = await p.evaluate(() => DECK.state().key);
    const t0 = Date.now();
    await p.evaluate(() => DECK.autoplay(true));
    await p.waitForFunction((k) => DECK.state().key !== k, key0, { timeout: 30000 });
    const dt = (Date.now() - t0) / 1000;
    await p.evaluate(() => DECK.autoplay(false));
    return dt;
  };
  const p = await open(S, { q: '?mode=learn&layout=slides' });
  const d = (await tl(p)).find((g) => g.key === `${SLIDES[1][0]}:1`).dur;
  const t1 = await advance(p, 1), t2 = await advance(p, 2);
  ok(Math.abs(t1 - d) < 0.6 && Math.abs(t2 - d / 2) < 0.6, `at 2× a step advances in half the time (dur ${d.toFixed(2)} s: 1× ${t1.toFixed(2)} s, 2× ${t2.toFixed(2)} s)`);
  // 一時停止と再開：同じ段階の残りから
  await p.evaluate(() => { DECK.rate(1); DECK.go(1, 1); DECK.autoplay(true); });
  await wait(p, d * 1000 * 0.6);
  await p.keyboard.press('a');
  const pausedKey = await p.evaluate(() => [DECK.state().key, DECK.playing()]);
  ok(pausedKey[0] === `${SLIDES[1][0]}:1` && pausedKey[1] === false, 'a pauses on the same step');
  ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="auto"]').getAttribute('aria-label')) === '再生', 'paused: the button says 再生');
  await wait(p, 1500);
  const tr0 = Date.now();
  await p.keyboard.press('a');
  ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="auto"]').getAttribute('aria-label')) === '一時停止', 'playing: the button says 一時停止');
  await p.waitForFunction((k) => DECK.state().key !== k, pausedKey[0], { timeout: 30000 });
  const rest = (Date.now() - tr0) / 1000;
  ok(rest < d * 0.6, `play after pause continues from where it paused (rest ${rest.toFixed(2)} s of ${d.toFixed(2)} s)`);
  // 再生中に送る：learn では再生を続ける
  ok(await p.evaluate(() => DECK.playing()), 'still playing after the paused step ended');
  await p.keyboard.press('ArrowRight'); await wait(p, 100);
  ok(await p.evaluate(() => DECK.playing()), 'learn: → while playing keeps playing');
  await p.keyboard.press('ArrowLeft'); await wait(p, 100);
  ok(await p.evaluate(() => DECK.playing()), 'learn: ← while playing keeps playing');
  // 文書が隠れたら止まる（Player P3）
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await p.evaluate(() => DECK.playing()) === false, 'hidden page: playback pauses');
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.context().close();
  // talk では送ると止まる（今までどおり）
  const t = await open(S, { q: '?layout=slides' });
  await t.evaluate(() => DECK.autoplay(true)); await wait(t, 200);
  await t.keyboard.press('ArrowRight'); await wait(t, 100);
  ok(await t.evaluate(() => DECK.playing()) === false, 'talk: → while playing stops autoplay (unchanged)');
  await t.context().close();
  // 声：再生速度と声の高さを保つこと（audio 要素の playbackRate・preservesPitch）
  const a = await open(AUD, { q: '?mode=learn&layout=slides', init: { fn: () => {
    window.__audio = []; window.__srcSets = 0;
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { window.__srcSets++; d.set.call(this, v); } });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){ window.__el = this; window.__audio.push({ rate: this.playbackRate, pitch: this.preservesPitch, t: this.currentTime, src: this.src.split('/').pop() }); return play.call(this); };
  } } });
  await a.evaluate(() => { DECK.rate(1.5); DECK.autoplay(true); });
  await a.waitForFunction(() => window.__audio.length > 0, null, { timeout: 5000 });
  const au = await a.evaluate(() => window.__audio[0]);
  ok(au.rate === 1.5 && au.pitch === true && au.src === 'silent.wav', `narration plays at the chosen speed with the pitch kept (${JSON.stringify(au)})`);
  await wait(a, 400); await a.keyboard.press('a'); await wait(a, 300);
  const before = await a.evaluate(() => [window.__audio.length, window.__srcSets]);
  await a.keyboard.press('a'); await wait(a, 200);
  const after = await a.evaluate(() => [window.__audio.length, window.__srcSets]);
  // 声の所はそのまま（src を入れ直さずに play し直す。CI の端末によっては声が進まないので時刻は見ない）
  ok(after[0] === before[0] + 1 && after[1] === before[1], `resume continues the narration where it paused: play again without reloading it (plays ${before[0]}→${after[0]}, src set ${before[1]}→${after[1]})`);
  await a.evaluate(() => DECK.rate(2));
  ok(await a.evaluate(() => window.__el.playbackRate) === 2, 'changing the speed while playing changes the narration speed too');
  await a.context().close();
}

// ---------------------------------------------------------------- 3. 舞台で再生（via stage）と本で読む（via text）
{
  // 横書きの本だけ：初めの節が 3 秒見えていると、そのスライドのステップが読んだことになる。舞台は見えないので stage にはならない
  const p = await open(H, { q: '?layout=flow' });
  ok((await tr(p)).adapter === 'local', 'a top-level file uses the local adapter');
  await wait(p, 1500);
  ok(hasNone((await tr(p)).text, ords(0)), 'after 1.5 s the first section is not read yet');
  await untilRead(p, ords(0));
  let t = await tr(p);
  ok(hasAll(t.text, ords(0)), `reading the first section for 3 s marks its slide's steps read via text (${t.text})` + (hasAll(t.text, ords(0)) ? '' : ' ' + JSON.stringify(t.reading)));
  ok(hasNone(t.stage, ords(0)), 'in the book alone nothing counts as played on the stage');
  // 2 節目を 1 秒だけ見て 4 節目へ：2 節目は読んだことにならない
  await scrollToSec(p, '[data-section-id="sec-tr3bbb"]'); await wait(p, 1000);
  await scrollToSec(p, '[data-section-id="sec-tr5ddd"]'); await untilRead(p, ords(3));
  t = await tr(p);
  ok(hasNone(t.text, ords(1)), `scrolling past a section quickly does not mark it read (${t.text})`);
  ok(hasAll(t.text, ords(3)), 'the section where the reader stopped is read');
  ok(t.completed === false, 'not completed while steps are unvisited');
  await shot(p, '03-book-read');
  // 舞台：スライドの並べ方で残りのステップを送る → stage、全部で終えた
  await p.evaluate(() => DECK.panes.layout('slides'));
  await p.evaluate(() => DECK.go(0, 0));
  for (let j = 0; j < nSteps; j++) { await p.keyboard.press('ArrowRight'); }
  await wait(p, 200);
  t = await tr(p);
  ok(t.stage.length === nSteps, `steps advanced on the stage are recorded via stage (${t.stage.length}/${nSteps})`);
  ok(t.completed === true, 'default rule: completed once every step is played or read');
  const ls = await p.evaluate(() => { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (/-player-progress:/.test(k)) return JSON.parse(localStorage.getItem(k)); } return null; });
  ok(ls && ls.v === 1 && ls.n === nSteps && ls.done === true && typeof ls.stage === 'string' && typeof ls.text === 'string', `the local adapter keeps both sets and done on this device (${JSON.stringify(ls)})`);
  await p.context().close();
}
{
  // 縦書きの本：右から読み、3 秒で読んだことになる。左の節へ送って読む
  const p = await open(V, { q: '?layout=flow' });
  ok(await p.evaluate(() => DECK.panes.state().vertical), 'the kokugo book is vertical');
  await untilRead(p, ords(0));
  { const t0 = await tr(p); ok(hasAll(t0.text, ords(0)), 'vertical writing: the first section read after 3 s' + (hasAll(t0.text, ords(0)) ? '' : ' ' + JSON.stringify(t0.reading))); }
  await scrollToSec(p, '[data-section-id="sec-tr4ccc"]'); await untilRead(p, ords(2));
  const t = await tr(p);
  ok(hasAll(t.text, ords(2)) && hasNone(t.text, ords(1)), `vertical writing: the section scrolled to is read, the one skipped is not (${t.text})`);
  await shot(p, '03-book-vertical');
  await p.context().close();
}
{
  // 台本で読む（本のない教材）：各ステップの台本の段が単位
  const p = await open(S, { q: '?layout=flow' });
  await untilRead(p, [0]);
  const t = await tr(p);
  ok(t.text.includes(0), `read with script: the first step's script read after 3 s (${t.text})`);
  ok(hasNone(t.text, ords(3)), 'read with script: far steps are not read');
  await p.context().close();
}
{
  // スライドと本：舞台は見えている（stage）、本の窓も読める（text）
  const p = await open(H, { q: '?layout=split' });
  await untilRead(p, ords(0));
  const t = await tr(p);
  ok(t.stage.includes(0) && hasAll(t.text, ords(0)), `slides and book: the current step via stage and the visible section via text (stage ${t.stage}, text ${t.text})`);
  await p.context().close();
}

// ---------------------------------------------------------------- 4. 終えた判定：played・visitedFraction・reachedEnd
{
  const readAll = async (p) => { for (const [j, [, sec]] of SLIDES.entries()) { await scrollToSec(p, `[data-section-id="${sec}"]`); await untilRead(p, ords(j)); } };
  let p = await open(PLAYED, { q: '?layout=flow' });
  ok((await tr(p)).rule.played === true, 'played: true is read from deck-meta.completion');
  await readAll(p);
  let t = await tr(p);
  ok(t.text.length === nSteps && t.completed === false, `played: true — reading every step does not complete (${t.text.length} read)`);
  await p.evaluate(() => DECK.panes.layout('slides'));
  await p.evaluate(() => DECK.go(0, 0));
  for (let j = 0; j < nSteps; j++) await p.keyboard.press('ArrowRight');
  await wait(p, 200);
  ok((await tr(p)).completed === true, 'played: true — playing every step on the stage completes');
  await p.context().close();
  p = await open(H, { q: '?layout=flow' });
  await readAll(p);
  ok((await tr(p)).completed === true, 'without played: reading every step completes');
  await p.context().close();
  p = await open(FRAC, { q: '?layout=slides' });
  for (let j = 0; j < 4; j++) await p.keyboard.press('ArrowRight');
  ok((await tr(p)).completed === false, 'visitedFraction 0.5: 5 of 12 steps is not enough');
  await p.keyboard.press('ArrowRight');
  ok((await tr(p)).completed === true, 'visitedFraction 0.5: 6 of 12 steps completes');
  await p.context().close();
  p = await open(END, { q: '?layout=slides' });
  await p.keyboard.press('End'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  ok((await tr(p)).completed === true, 'reachedEnd: reaching the final step completes');
  await p.context().close();
}

// ---------------------------------------------------------------- 5. postMessage（枠の中）
{
  const host = path.join(path.dirname(H), 'host.html');
  fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="f" style="width:1280px;height:720px;border:0"></iframe>
<script>
window.msgs = [];
var f = document.getElementById('f');
window.addEventListener('message', function(e){ if (e.source === f.contentWindow && e.data && e.data.egatari) window.msgs.push(e.data); });
f.src = 'deck.html' + location.search;
</script>`);
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('host: ' + e.message));
  await p.goto(fileUrl(host) + '?embed=1&layout=split');
  const fr = () => p.frame({ url: /deck\.html/ });
  await p.waitForFunction(() => window.msgs.some((m) => m.egatari === 'step'), null, { timeout: 10000 });
  ok(await fr().evaluate(() => DECK.tracking().adapter) === 'postmessage', 'in a frame without a SCORM API the postMessage adapter is used');
  await fr().click('#stage', { position: { x: 200, y: 300 } });
  await p.waitForFunction(() => window.msgs.filter((x) => x.egatari === 'step' && x.via === 'text').length >= 3, null, { timeout: 8000 }).catch(() => {});
  await wait(p, 300);
  const m = await p.evaluate(() => window.msgs);
  ok(m.some((x) => x.egatari === 'started'), 'started after the first user gesture');
  const s0 = m.find((x) => x.egatari === 'step' && x.via === 'stage');
  ok(s0 && s0.slideKey === SLIDES[0][0] && s0.stepKey === '0' && s0.index === 0 && s0.total === nSteps, `step {slideKey, stepKey, index, total, via: "stage"} (${JSON.stringify(s0)})`);
  const r0 = m.filter((x) => x.egatari === 'step' && x.via === 'text');
  ok(r0.length === 3 && r0.every((x) => x.slideKey === SLIDES[0][0]), `step via "text" for each step of the section read (${r0.map((x) => x.stepKey)})`);
  await p.evaluate(() => { window.msgs = []; });
  await fr().evaluate(() => DECK.panes.layout('slides'));
  for (let j = 0; j < nSteps; j++) await p.keyboard.press('ArrowRight');
  await wait(p, 200);
  ok(await p.evaluate(() => window.msgs.some((x) => x.egatari === 'completed')), 'completed is posted once the rule is met');
  await p.evaluate(() => { window.msgs = []; });
  await fr().evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await wait(p, 300);
  const sp = await p.evaluate(() => window.msgs.find((x) => x.egatari === 'suspend'));
  ok(sp && /^#\d+$/.test(sp.location) && JSON.parse(sp.data).v === 1, `suspend {location, data} on pagehide (${sp && sp.location})`);
  await c.close();
}

// ---------------------------------------------------------------- 6. SCORM 1.2 の模型
{
  // 模型：自分の窓の API（包み方 §2 は自分から親へ探す）。値は arg で決め、呼び出しは __log に送る（窓が替わっても残る）
  const mock = (vals) => ({ fn: (v) => {
    window.__calls = [];
    const log = (x) => { window.__calls.push(x); };
    const store = Object.assign({}, v);
    window.API = {
      LMSInitialize: (a) => { log(['LMSInitialize', a]); return 'true'; },
      LMSGetValue: (k) => { log(['LMSGetValue', k]); return k in store ? store[k] : ''; },
      LMSSetValue: (k, x) => { log(['LMSSetValue', k, x]); store[k] = x; return 'true'; },
      LMSCommit: (a) => { log(['LMSCommit', a]); return 'true'; },
      LMSFinish: (a) => { log(['LMSFinish', a]); return 'true'; },
      LMSGetLastError: () => { log(['LMSGetLastError']); return '0'; },
      LMSGetErrorString: () => '', LMSGetDiagnostic: () => ''
    };
  }, arg: vals });
  const run = async (vals, steps) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await open(H, { ctx: c, q: '?layout=slides', init: mock(vals) });
    if (steps) await steps(p);
    const state = await tr(p), pos = await p.evaluate(() => DECK.state().key);
    // 閉じるときの pagehide（2 度来ても終わりは 1 度）
    await p.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); });
    const calls = await p.evaluate(() => window.__calls);
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    const note = await p.evaluate(() => { const n = document.getElementById('deck-track-notice'); return n ? n.textContent : null; });
    await c.close();
    if (!vals.noNote) ok(/記録されていません/.test(note || ''), `back/forward cache after finishing: a notice that progress is no longer recorded (${note})`), vals.noNote = 1;
    return { calls, state, pos };
  };
  const sets = (calls, k) => calls.filter((x) => x[0] === 'LMSSetValue' && x[1] === k).map((x) => x[2]);
  // 初めての試み：位置・再開データ・終えた・終わり
  const base = { 'cmi.core.lesson_mode': 'normal', 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', 'cmi.core.lesson_location': '', 'cmi.suspend_data': '' };
  const a = await run(base, async (p) => {
    await p.click('#stage', { position: { x: 200, y: 300 } });
    for (let j = 0; j < 4; j++) await p.keyboard.press('ArrowRight');
    await wait(p, 100);
  });
  const C = a.calls;
  ok(C.filter((x) => x[0] === 'LMSInitialize').length === 1 && C[0][0] === 'LMSInitialize' && C[0][1] === '', 'LMSInitialize("") once, first');
  const gv = C.map((x, j) => x[0] === 'LMSGetValue' ? j : -1).filter((j) => j >= 0);
  ok(gv.length === 5 && gv.every((j) => C[j + 1] && C[j + 1][0] === 'LMSGetLastError'), 'reads lesson_mode, lesson_status, entry, lesson_location and suspend_data, each followed by LMSGetLastError');
  ok(sets(C, 'cmi.core.lesson_status')[0] === 'incomplete', 'first gesture: lesson_status not attempted → incomplete');
  const loc = sets(C, 'cmi.core.lesson_location');
  ok(loc[loc.length - 1] === '#4' && loc.every((x) => /^#(0|[1-9]\d*)$/.test(x)), `lesson_location is #<ordinal> (${loc.join(' ')})`);
  const sd = JSON.parse(sets(C, 'cmi.suspend_data').pop());
  ok(sd.v === 1 && sd.n === nSteps && /^[0-9a-f]{8}$/.test(sd.h) && sd.seen === sd.stage && /^[A-Za-z0-9_-]+$/.test(sd.text), `suspend_data {v, n, h, seen, stage, text} (${JSON.stringify(sd)})`);
  const bits = Buffer.from(sd.seen.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  ok(bits.length === Math.ceil(nSteps / 8) && bits[0] === 0x1f && bits[1] === 0, `the seen bitset: steps 0–4, least significant bit first (${[...bits].map((b) => b.toString(2))})`);
  ok(C.some((x) => x[0] === 'LMSCommit'), 'LMSCommit on the change of slide');
  const end = C.slice(C.findIndex((x) => x[1] === 'cmi.core.session_time'));
  ok(/^\d{4}:\d{2}:\d{2}\.\d{2}$/.test(end[0][2]), `pagehide: session_time HHHH:MM:SS.SS (${end[0][2]})`);
  ok(sets(C, 'cmi.core.exit')[0] === 'suspend' && C.filter((x) => x[0] === 'LMSFinish').length === 1 && C[C.length - 2][0] === 'LMSCommit' && C[C.length - 1][0] === 'LMSFinish', 'pagehide: exit suspend (not completed), commit, LMSFinish once, last');
  ok(!sets(C, 'cmi.core.lesson_status').includes('completed'), 'not completed: lesson_status stays incomplete');
  // 再開：同じ教材なら見たステップと位置を戻す
  const r = await run({ ...base, 'cmi.core.lesson_status': 'incomplete', 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': '#4', 'cmi.suspend_data': JSON.stringify(sd) });
  ok(r.pos === `${SLIDES[1][0]}:1` && [0, 1, 2, 3, 4].every((j) => r.state.stage.includes(j)), `resume: position #4 and the visited steps restored (${r.pos}; ${r.state.stage})`);
  // 教材が変わった（h が違う）：使わない
  const x = await run({ ...base, 'cmi.core.lesson_status': 'incomplete', 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': '#4', 'cmi.suspend_data': JSON.stringify({ ...sd, h: '00000000' }) });
  ok(x.pos === `${SLIDES[0][0]}:0` && x.state.stage.join() === '0', `changed lesson: resume data ignored, starts at the beginning (${x.pos})`);
  // 終える：lesson_status completed、終わりの exit は ""
  const f = await run(base, async (p) => { await p.click('#stage', { position: { x: 200, y: 300 } }); for (let j = 0; j < nSteps; j++) await p.keyboard.press('ArrowRight'); await wait(p, 100); });
  ok(sets(f.calls, 'cmi.core.lesson_status').pop() === 'completed' && sets(f.calls, 'cmi.core.exit')[0] === '', 'completing sets lesson_status completed and exit ""');
  const fc = f.calls.findIndex((y) => y[1] === 'cmi.core.lesson_status' && y[2] === 'completed');
  ok(f.calls[fc + 1] && f.calls[fc + 1][0] === 'LMSCommit', 'LMSCommit right after completed');
  // 振り返り（review）：終わりまで何も書かない
  const v = await run({ ...base, 'cmi.core.lesson_mode': 'review', 'cmi.core.lesson_status': 'completed' }, async (p) => { await p.click('#stage', { position: { x: 200, y: 300 } }); for (let j = 0; j < 4; j++) await p.keyboard.press('ArrowRight'); });
  const vs = v.calls.filter((y) => y[0] === 'LMSSetValue').map((y) => y[1]);
  ok(vs.join() === 'cmi.core.session_time,cmi.core.exit' && sets(v.calls, 'cmi.core.exit')[0] === '', `review: nothing written except at termination (${vs.join(', ')})`);
  // 読んだステップも再開データの text に入る
  const t = await run(base, async (p) => { await p.evaluate(() => DECK.panes.layout('book')); await untilRead(p, ords(0)); });
  const td = JSON.parse(sets(t.calls, 'cmi.suspend_data').pop());
  const tb = Buffer.from(td.text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  ok(tb[0] === 0x07, `steps read in the book go into suspend_data.text (${tb[0].toString(2)})`);

  // 開く位置の決め方：この端末の「前回の続きから」（kit/panes.js）は、この端末に記録するとき（local）だけ。LMS（SCORM）や埋め込みの親があれば、その位置が勝ち、知らせも出さない
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p1 = await open(H, { ctx: c, q: '?layout=flow' });
  await scrollToSec(p1, '[data-section-id="sec-tr4ccc"]'); await wait(p1, 900);
  await p1.close();
  const p2 = await open(H, { ctx: c, q: '?layout=flow' });
  const r2 = await p2.evaluate(() => ({ adapter: DECK.tracking().adapter, resumed: DECK.panes.state().resumed, i: DECK.state().slide - 1 }));
  ok(r2.adapter === 'local' && r2.resumed === true && r2.i === 2, `local adapter: the device's resume applies (${JSON.stringify(r2)})`);
  await p2.close();
  const p3 = await open(H, { ctx: c, q: '?layout=flow', init: mock({ ...base, 'cmi.core.lesson_status': 'incomplete', 'cmi.core.entry': 'resume', 'cmi.core.lesson_location': '#4', 'cmi.suspend_data': JSON.stringify(sd) }) });
  await wait(p3, 300);
  const r3 = await p3.evaluate(() => ({ adapter: DECK.tracking().adapter, resumed: DECK.panes.state().resumed, notice: !!document.getElementById('deck-resume'), key: DECK.state().key }));
  ok(r3.adapter === 'scorm12' && !r3.resumed && !r3.notice && r3.key === `${SLIDES[1][0]}:1`, `SCORM resume: the LMS location wins over the device's resume, no notice (${JSON.stringify(r3)})`);
  await p3.close();
  const p4 = await open(H, { ctx: c, q: '?layout=flow', init: mock(base) });
  await wait(p4, 300);
  const r4 = await p4.evaluate(() => ({ resumed: DECK.panes.state().resumed, notice: !!document.getElementById('deck-resume'), key: DECK.state().key }));
  ok(!r4.resumed && !r4.notice && r4.key === `${SLIDES[0][0]}:0`, `SCORM first attempt: starts at the beginning, the device's resume is not applied (${JSON.stringify(r4)})`);
  await p4.close();
  const hostR = path.join(path.dirname(H), 'host-resume.html');
  fs.writeFileSync(hostR, '<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="f" style="width:1280px;height:720px;border:0" src="deck.html?embed=1&layout=flow#s-tr3bbb:1"></iframe>');
  const p5 = await c.newPage();
  await p5.goto(fileUrl(hostR));
  await p5.waitForFunction(() => { const w = document.getElementById('f').contentWindow; return w.DECK && w.DECK.ready && w.DECK.tracking && w.DECK.tracking().adapter; }, null, { timeout: 15000 });
  await wait(p5, 300);
  const r5 = await p5.frame({ url: /deck\.html/ }).evaluate(() => ({ adapter: DECK.tracking().adapter, resumed: DECK.panes.state().resumed, notice: !!document.getElementById('deck-resume'), key: DECK.state().key }));
  ok(r5.adapter === 'postmessage' && !r5.resumed && !r5.notice && r5.key === `${SLIDES[1][0]}:1`, `embedded: the host's position wins over the device's resume, no notice (${JSON.stringify(r5)})`);
  await c.close();
}

// ---------------------------------------------------------------- 7. 1 ファイル：deck-meta.tracking と completion
{
  const P = makeDeck('portable', { portable: true, completion: { visitedFraction: 0.9, played: true } });
  const meta = JSON.parse(/<script type="application\/json" id="deck-meta">([\s\S]*?)<\/script>/.exec(fs.readFileSync(P, 'utf8'))[1]);
  ok(JSON.stringify(meta.tracking) === '["scorm12","postmessage","local"]', `deck-meta.tracking lists the adapters (${JSON.stringify(meta.tracking)})`);
  ok(meta.completion && meta.completion.visitedFraction === 0.9 && meta.completion.played === true, 'deck-meta.completion keeps {visitedFraction, played}');
  const p = await open(P, { q: '?layout=slides' });
  const t = await tr(p);
  ok(t.rule.visitedFraction === 0.9 && t.rule.played === true, 'the player reads the rule from the single file');
  await p.context().close();
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
