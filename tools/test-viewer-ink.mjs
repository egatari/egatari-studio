// Egatari Viewer：手書き（スライドとその下のメモ欄。play/ink.mjs、handoff #27）
//   node tools/test-viewer-ink.mjs [作業フォルダ] [--webkit] [--shots]
// test-all: platform（--platform でも走らせる：WebKit の分は CI の macOS で）
// 上のバーの「手書き」で、教材の枠をスライドの高さに縮め、スライドとメモ欄を 1 枚の面にする。確かめること：
//  - 枠の高さ＝スライドの高さ、面と道具のバー（名前のあるアイコンのボタン）。英語の名前
//  - メモ欄の地＝スライドの地（教材の枠の中の shim が答える。play/lesson-shim.js 5）。暗い地の教材では暗く、ペンは明るい色
//  - マウスで書く（ペンの色 3 つ）、消しゴム（触れた線を 1 本ごと）、取り消し
//  - 別のスライドへ行って戻ると線が戻る（この端末の IndexedDB、教材の docId とスライドの key ごと）。開き直しても残る
//  - 指（pointerType touch）は書かず、横にはらうとステップを移る。「指でも書く」で書ける
//  - 共有の端末をオンにすると、手書きも消すか聞いてから消す。共有の端末では保存しない
//  - 枠の中から来た形の違う ink-bg は無視する
//  - 開いた直後、スライドの鍵が届く前に描いた線も残り、届いたスライドに保存される（handoff #73）
//  - 手書きの間はボタンが「手書きを終了」（押された見た目）、上の「ファイルを閉じる」と取り違えない（handoff #78）
//  - スライドだけの表示でだけ：教材で「スライドと本」にすると手書きを閉じ（線は残る）、手書きを押すとスライドだけに戻す（11/20 の作者の iPad の確かめ）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { buildPlay } from './build-play.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit'), SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-viewer-ink-')));
fs.mkdirSync(work, { recursive: true });
console.log('work: ' + work);
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { ms = scaled(ms); const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };

// ---------------------------------------------------------------- two lessons: the minimal example, and the same on a dark slide
async function portable(name, extraCss) {
  const dir = path.join(work, 'src-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  if (extraCss) { const f = path.join(dir, 'deck.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</head>', `<style>${extraCss}</style>\n</head>`)); }
  const out = path.join(work, name + FORMAT.FILE_EXT);
  const b = await buildPortable(path.join(dir, 'deck.html'), { out, subset: false });
  if (!fs.existsSync(out)) fs.writeFileSync(out, b.html);
  return out;
}
const LIGHT = await portable('light');
const DARK = await portable('dark', '.slide{background:#101418 !important}');

// ---------------------------------------------------------------- the Viewer
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: ['https://live.egatari.org'], devLoopback: false, tag: '' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const headers = {};
for (const line of fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n')) { const m = /^\s+([^:]+):\s*(.*)$/.exec(line); if (m && !/^Cache/i.test(m[1])) headers[m[1]] = m[2]; }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(OUT, ...p.split('/').filter(Boolean));
  if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

let browser;
if (WEBKIT) { try { browser = await webkit.launch(); } catch (e) { console.log('skip: WebKit is not installed: ' + String(e.message).split('\n')[0]); srv.close(); process.exit(0); } }
else browser = await launch();
console.log(WEBKIT ? 'WebKit' : 'Chromium');
const errors = [];
const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
await ctx.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
async function newPage() {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  return p;
}
async function open(p, file) {
  await p.evaluate(() => { const f = document.getElementById('lesson'); if (f) f.dataset.before = '1'; });
  await p.setInputFiles('#file', file);
  await until(async () => { const el = await p.$('#lesson:not([data-before])'); const f = el && await el.contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000);
}
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(work, `${name}${WEBKIT ? '-webkit' : ''}.png`) }); };
const strokes = (p) => p.evaluate(() => { const s = document.querySelector('.ink-surf'); const m = s && /([0-9]+)/.exec(s.getAttribute('aria-label') || ''); return m ? Number(m[1]) : -1; });
const slideAt = async (p) => (await (await p.$('#lesson')).contentFrame()).evaluate(() => [...document.querySelectorAll('#stage > .slide')].findIndex((x) => x.classList.contains('active')));
// a pixel of the surface, at logical coordinates (1280 × 1200)
const pixel = (p, x, y) => p.evaluate(([x, y]) => {
  const c = document.querySelector('.ink-surf'), s = c.width / 1280, d = c.getContext('2d').getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [x, y]);
// the strongest ink near a point: of the pixels within 4 logical units, the one farthest from the background there
const inkAt = (p, x, y, bg) => p.evaluate(([x, y, bg]) => {
  const c = document.querySelector('.ink-surf'), s = c.width / 1280, r = Math.ceil(4 * s);
  const d = c.getContext('2d').getImageData(Math.round(x * s) - r, Math.round(y * s) - r, 2 * r + 1, 2 * r + 1).data;
  let best = null, far = -1;
  for (let i = 0; i < d.length; i += 4) { const f = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]); if (d[i + 3] > 200 && f > far) { far = f; best = [d[i], d[i + 1], d[i + 2]]; } }
  return best;
}, [x, y, bg]);
const near = (a, b, t = 24) => a && b && Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
// a mouse line on the surface, logical coordinates
async function draw(p, pts) {
  const b = await p.evaluate(() => { const r = document.querySelector('.ink-surf').getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / 1280 }; });
  const at = ([x, y]) => [b.x + x * b.s, b.y + y * b.s];
  await p.mouse.move(...at(pts[0])); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(...at(q), { steps: 6 });
  await p.mouse.up();
}
// a synthetic finger on the surface (pointerType touch): the page reads pointerType only
async function finger(p, from, to) {
  await p.evaluate(([from, to]) => {
    const c = document.querySelector('.ink-surf'), r = c.getBoundingClientRect(), s = r.width / 1280;
    const ev = (type, [x, y], t) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + x * s, clientY: r.top + y * s }));
    ev('pointerdown', from); for (let i = 1; i <= 6; i++) ev('pointermove', [from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6]); ev('pointerup', to);
  }, [from, to]);
}
const press = (p, k) => p.click(`.ink-bar button[data-k="${k}"]`);
// two painted frames: in Chromium the lesson frame runs in its own process, and for a frame or so after the surface appears over
// it the mouse still goes to the lesson (a person cannot draw that fast; the test can)
const painted = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

{
  const p = await newPage();
  await open(p, LIGHT);
  ok(await p.evaluate(() => !document.getElementById('b-ink').hidden), 'the 手書き button is shown for a lesson without a Live');
  await p.click('#b-ink');
  ok(await until(() => p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.ink-surf'))), 'pressing it shows the surface');
  // 手書きの間は「手書きを終了」と読め、上のもう一つのボタンは「ファイルを閉じる」（取り違えない。handoff #78、作者の iPad 11/22）。名前は見えている字のまま（axe の label-content-name-mismatch）
  const words = () => p.evaluate(() => { const b = document.getElementById('b-ink'); return { ink: b.innerText.trim(), name: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), close: document.getElementById('b-close').innerText.trim() }; });
  { const w = await words(); ok(w.ink === '手書きを終了' && w.name === null && w.pressed === 'true' && w.close === 'ファイルを閉じる', 'while handwriting: 手書きを終了 (pressed) and ファイルを閉じる ' + JSON.stringify(w)); }
  const g = await p.evaluate(() => {
    const f = document.getElementById('stage-wrap').getBoundingClientRect(), s = document.querySelector('.ink-surf').getBoundingClientRect(), b = document.querySelector('.ink-bar').getBoundingClientRect();
    return { fh: f.height, sw: s.width, sh: s.height, st: s.top, ft: f.top, bt: b.top, sb: s.bottom, vh: innerHeight, sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  ok(Math.abs(g.fh - Math.round(g.sw * 720 / 1280)) <= 1.5 && Math.abs(g.sh - g.sw * 1200 / 1280) <= 2 && Math.abs(g.st - g.ft) <= 1, 'the frame is the slide\'s height; the surface is the slide plus the memo ' + JSON.stringify(g));
  ok(g.bt >= g.sb && g.bt < g.vh && g.sx <= g.cw, 'the tools sit under the surface, on screen, no sideways scroll');
  const names = await p.evaluate(() => [...document.querySelectorAll('.ink-bar button')].map((b) => b.getAttribute('aria-label')));
  ok(JSON.stringify(names) === JSON.stringify(['ペン', '消しゴム', '黒', '赤', '青', '取り消し', '前へ', '次へ', '指で書く']), 'every tool has a name ' + JSON.stringify(names));
  ok(await p.evaluate(() => document.querySelector('.ink-bar').getAttribute('aria-label') === '手書きのツール' && document.querySelector('.ink-bar button[data-k="undo"]').disabled), 'the toolbar is named; undo is off with nothing to undo');
  // the memo area takes the slide's background (white here)
  const slideBg = await (await (await p.$('#lesson')).contentFrame()).evaluate(() => getComputedStyle(document.querySelector('#stage > .slide.active')).backgroundColor.match(/\d+/g).slice(0, 3).map(Number));
  ok(await until(async () => near(await pixel(p, 640, 1000), slideBg, 2)), `the memo area is the slide's background ${JSON.stringify(slideBg)} → ${JSON.stringify(await pixel(p, 640, 1000))}`);
  ok((await pixel(p, 640, 726))[3] === 0, 'a gap between the slide and the memo area');
  ok(await p.evaluate(() => document.querySelector('.ink-bar').dataset.tone === 'light'), 'a light slide: the light shades');

  // draw: red (the default) from the memo up into the slide, then black, then blue
  // after each draw, wait for the stroke to be recorded and painted before looking (the dark slide below failed this way on a slow macOS CI)
  await draw(p, [[200, 1000], [300, 900], [400, 650]]);
  ok(await until(async () => (await strokes(p)) === 1), 'one stroke drawn with the mouse');
  await until(async () => near(await inkAt(p, 300, 900, slideBg), [0xd2, 0x2a, 0x3a], 40));
  ok(near(await inkAt(p, 300, 900, slideBg), [0xd2, 0x2a, 0x3a], 40), 'red by default ' + JSON.stringify(await inkAt(p, 300, 900, slideBg)));
  await press(p, 'c-k'); await draw(p, [[700, 900], [900, 900]]);
  await until(async () => near(await inkAt(p, 800, 900, slideBg), [0x1f, 0x1f, 0x1f], 40));
  ok(near(await inkAt(p, 800, 900, slideBg), [0x1f, 0x1f, 0x1f], 40), 'black ' + JSON.stringify(await inkAt(p, 800, 900, slideBg)));
  await press(p, 'c-b'); await draw(p, [[700, 1050], [900, 1050]]);
  await until(async () => near(await inkAt(p, 800, 1050, slideBg), [0x1f, 0x5f, 0xbf], 40));
  ok(near(await inkAt(p, 800, 1050, slideBg), [0x1f, 0x5f, 0xbf], 40), 'blue ' + JSON.stringify(await inkAt(p, 800, 1050, slideBg)));
  ok(await p.evaluate(() => document.querySelector('.ink-bar button[data-k="c-b"]').getAttribute('aria-pressed') === 'true' && document.querySelector('.ink-bar button[data-k="pen"]').getAttribute('aria-pressed') === 'true'), 'the chosen colour and the pen are pressed');
  ok(await strokes(p) === 3, 'three strokes');
  // eraser: the stroke it touches, whole; undo brings it back
  await press(p, 'eraser'); await draw(p, [[780, 880], [820, 920]]);
  await until(async () => (await strokes(p)) === 2);
  ok(await strokes(p) === 2 && !near(await inkAt(p, 800, 900, slideBg), [0x1f, 0x1f, 0x1f], 40), 'the eraser removes the whole black stroke');
  await press(p, 'undo');
  await until(async () => (await strokes(p)) === 3);
  ok(await strokes(p) === 3 && near(await inkAt(p, 800, 900, slideBg), [0x1f, 0x1f, 0x1f], 40), 'undo brings it back');
  await press(p, 'undo');
  ok(await until(async () => (await strokes(p)) === 2), 'undo again takes away the last stroke drawn (blue)');
  await press(p, 'pen');
  await shot(p, 'ink-light');

  // a finger does not draw; a swipe on the surface moves a step
  // the two are separate gestures: a swipe moves to the next slide, whose page is empty, so counting the strokes after a swipe
  // counts the next slide's page as soon as the move has gone through (on a slow macOS CI under WebKit it read 0, not 2).
  // A finger drag that is not a swipe stays on this slide; the page handles the synthetic events synchronously, so the count
  // and the pixels read just after it are final (「指でも書く」 below draws the same way and is counted the same way)
  const before = await slideAt(p);
  await finger(p, [600, 950], [620, 1100]);
  ok(await slideAt(p) === before && await strokes(p) === 2 && near(await inkAt(p, 610, 1025, slideBg), slideBg, 8), 'a finger does not draw ' + JSON.stringify([await strokes(p), await inkAt(p, 610, 1025, slideBg)]));
  await finger(p, [900, 400], [300, 420]);
  ok(await until(async () => (await slideAt(p)) !== before), 'a finger swipe moves on');
  ok(await until(async () => (await strokes(p)) === 0), 'another slide: its own (empty) page');
  await press(p, 'finger');
  await finger(p, [500, 1000], [600, 1050]);
  ok(await strokes(p) === 1, '「指でも書く」: a finger draws');
  await press(p, 'undo'); await press(p, 'finger');
  // back to the first slide: its strokes come back from this device
  await press(p, 'prev');
  ok(await until(async () => (await slideAt(p)) === before && (await strokes(p)) === 2), 'back on the first slide, its two strokes again');
  // English names
  await p.click('#b-lang');
  const en = await p.evaluate(() => [...document.querySelectorAll('.ink-bar button')].map((b) => b.getAttribute('aria-label')).join('|') + '|' + document.querySelector('.ink-surf').getAttribute('aria-label'));
  ok(en.startsWith('Pen|Eraser|Black|Red|Blue|Undo|Previous|Next|Draw with a finger|') && /2 strokes/.test(en), 'English names ' + en);
  await p.click('#b-lang');
  // untrusted: an ink-bg of the wrong shape from the frame is ignored
  await (await (await p.$('#lesson')).contentFrame()).evaluate(() => { parent.postMessage({ egaViewer: 'ink-bg', rgb: [0, 0, 'x'] }, '*'); parent.postMessage({ egaViewer: 'ink-bg', rgb: [0, 0, 999] }, '*'); parent.postMessage({ egaViewer: 'ink-bg', rgb: [0, 0, 0], more: 1 }, '*'); });
  await sleep(300);
  ok(near(await pixel(p, 640, 1150), slideBg, 2), 'malformed ink-bg messages are ignored');
  // turning it off gives the frame its full height back
  await p.click('#b-ink');
  ok(await until(() => p.evaluate(() => !document.querySelector('.ink-surf') && document.getElementById('stage-wrap').getBoundingClientRect().height > 0)), 'turning 手書き off removes the surface');
  { const w = await words(); ok(w.ink === '手書き' && w.close === 'ファイルを閉じる', 'after handwriting: the button reads 手書き again ' + JSON.stringify(w)); }
  await p.click('#b-close');
  await sleep(500);
  await p.close();
}
{
  // opened again in a new page: the strokes are still on this device
  const p = await newPage();
  await open(p, LIGHT);
  await p.click('#b-ink');
  ok(await until(async () => (await strokes(p)) === 2), 'opened again: the strokes are kept on this device');
  // only in the slides view (the owner's iPad check 11/20): choosing 「スライドと本」 in the player closes the handwriting and keeps
  // the strokes; turning it on again puts the player back in the slides view (play/lesson-shim.js 6, spec §9.4 layout)
  const view = async () => (await (await p.$('#lesson')).contentFrame()).evaluate(() => document.documentElement.getAttribute('data-deck-layout'));
  await p.evaluate(() => document.getElementById('lesson').contentWindow.postMessage({ egatari: 'layout', layout: 'split' }, '*'));
  ok(await until(async () => (await view()) === 'split' && await p.evaluate(() => !document.querySelector('.ink-surf') && document.getElementById('b-ink').getAttribute('aria-pressed') === 'false')), 'the player in 「スライドと本」: the handwriting closes');
  await p.click('#b-ink');
  ok(await until(async () => (await view()) === 'slides' && (await strokes(p)) === 2), 'turning it on again: the slides view, the strokes again');
  // untrusted: a layout message of the wrong shape from the frame is ignored
  await (await (await p.$('#lesson')).contentFrame()).evaluate(() => { parent.postMessage({ egaViewer: 'layout', layout: 'pages' }, '*'); parent.postMessage({ egaViewer: 'layout', layout: 'book', more: 1 }, '*'); });
  await sleep(300);
  ok(await p.evaluate(() => !!document.querySelector('.ink-surf')), 'malformed layout messages are ignored');
  // a dark slide: a dark memo area and the light shades
  await open(p, DARK);
  ok(await until(() => p.evaluate(() => !document.getElementById('b-ink').hidden)), 'the dark lesson: the button again');
  if (await p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') !== 'true')) await p.click('#b-ink');
  ok(await until(async () => near(await pixel(p, 640, 1000), [0x10, 0x14, 0x18], 3)), 'a dark slide: the memo area is dark ' + JSON.stringify(await pixel(p, 640, 1000)));
  ok(await p.evaluate(() => document.querySelector('.ink-bar').dataset.tone === 'dark'), 'a dark slide: the light shades');
  ok(await strokes(p) === 0, 'another lesson: its own pages');
  // 描く前に手書きが入っていることを待ち、描いた後は線が記録されるまで待つ（遅い macOS の CI では、すぐ見ると線がまだなく、
  // 下の「2 枚のスライド」も 1 枚になって落ちた）
  await until(() => p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') === 'true'));
  // 描き直しはしない：開いた直後、スライドの鍵が届く前に描いた線も残る（handoff #73。下の「鍵より前に描く」で確かめる）
  await painted(p);
  await draw(p, [[200, 1000], [400, 1000]]);
  ok(await until(async () => (await strokes(p)) === 1), 'a dark slide: the stroke is drawn');
  await until(async () => near(await inkAt(p, 300, 1000, [16, 20, 24]), [0xff, 0x7b, 0x88], 40));
  ok(near(await inkAt(p, 300, 1000, [16, 20, 24]), [0xff, 0x7b, 0x88], 40), 'red on a dark slide is the light red ' + JSON.stringify(await inkAt(p, 300, 1000, [16, 20, 24])));
  await shot(p, 'ink-dark');
  await p.click('#b-close');
  // 共有の端末: asks first, names the handwriting, then deletes it
  await p.check('#shared');
  ok(await until(() => p.evaluate(() => document.getElementById('m-confirm').open)), 'turning on 共有の端末 asks first');
  const q = await p.evaluate(() => document.getElementById('m-confirm-t').textContent);
  ok(/手書き（2 枚のスライド）/.test(q), 'the question names the handwriting ' + JSON.stringify(q));
  await p.click('#b-mconfirm-yes');
  await sleep(500);
  await open(p, LIGHT);
  if (await p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') !== 'true')) await p.click('#b-ink');
  await sleep(600);
  ok(await strokes(p) === 0, 'after 共有の端末: nothing kept');
  await draw(p, [[200, 1000], [400, 1000]]);
  // the stroke must be there in the page, so that 'nothing is saved' below means the device kept nothing, not that nothing was drawn
  ok(await until(async () => (await strokes(p)) === 1), 'on a shared device the stroke is drawn on the page');
  await sleep(600);
  await p.click('#b-close');
  await sleep(300);
  await open(p, LIGHT);
  if (await p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') !== 'true')) await p.click('#b-ink');
  await sleep(600);
  ok(await strokes(p) === 0, 'on a shared device nothing is saved');
  await p.close();
}
{
  // drawn before the slide key arrives (handoff #73): just after opening, the player may not yet have said which slide it shows.
  // The page holds the player's position messages back, draws, then lets them through: the stroke stays, goes onto that slide's
  // page and is kept on this device (it used to be dropped: the dark slide above failed 2 times in 3 on the macOS CI)
  const c = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await c.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  // registered before the page's own scripts, so that it runs before the page's message listener
  await c.addInitScript(() => {
    if (window !== window.top) return;
    window.__held = []; window.__hold = true;
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (window.__hold && m && (m.egatari === 'position' || m.type === 'deck-pos')) { window.__held.push(m); e.stopImmediatePropagation(); }
    }, true);
  });
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  await open(p, LIGHT);
  await p.click('#b-ink');
  ok(await until(() => p.evaluate(() => !!document.querySelector('.ink-surf'))), 'before the key: the surface is up');
  await painted(p);
  ok(await p.evaluate(() => window.__held.length > 0), 'before the key: the player\'s position is held back ' + await p.evaluate(() => window.__held.length));
  await draw(p, [[200, 1000], [400, 1000]]);
  ok(await until(async () => (await strokes(p)) === 1), 'before the key: the stroke is drawn');
  await p.evaluate(() => {
    window.__hold = false;
    const f = document.getElementById('lesson').contentWindow;
    for (const m of window.__held) window.dispatchEvent(new MessageEvent('message', { data: m, origin: 'null', source: f }));
  });
  await sleep(600);
  ok(await strokes(p) === 1, 'the key arrives: the stroke is still there');
  ok(near(await inkAt(p, 300, 1000, [255, 255, 255]), [0xd2, 0x2a, 0x3a], 40), 'the key arrives: still drawn ' + JSON.stringify(await inkAt(p, 300, 1000, [255, 255, 255])));
  await p.click('#b-close');
  await sleep(300);
  await open(p, LIGHT);
  if (await p.evaluate(() => document.getElementById('b-ink').getAttribute('aria-pressed') !== 'true')) await p.click('#b-ink');
  ok(await until(async () => (await strokes(p)) === 1), 'opened again: the stroke drawn before the key was kept on that slide');
  await c.close();
}
{
  // a phone: no 手書き button
  const c = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await c.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  await open(p, LIGHT);
  ok(!(await p.isVisible('#b-ink')), 'a phone (390 px): no 手書き button');
  await c.close();
}
ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
