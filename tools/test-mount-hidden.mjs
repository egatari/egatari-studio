// 並んでいないうちに起動したデッキ（display:none の iframe の中）を後で出したとき、ふつうに起動したときと画素まで同じか（docs/contract.md §3：
// 実行系は舞台が並べ終わってから mount を呼ぶ）
//   node tools/test-mount-hidden.mjs [出力先]
// 確かめること：隠れている間は mount せず DECK.ready が false のまま／待つ間に頼んだ DECK.seek・DECK.go が、出した後にその位置で描かれる／
// m-kanbun（examples/kokugo-kanbun のスライド 4 の段階 3 ほか）と examples/pitch-fictional の部品のスライドで、出した後の画面がふつうの起動と画素まで同じ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-mount-hidden-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

// 見る位置：[デッキ, [[i, k], …]]（i, k は 0 から。kokugo-kanbun の [3, 3] がスライド 4 の段階 3）
const CASES = [
  ['kokugo-kanbun', [[3, 3], [3, 1], [4, 3]]],
  ['pitch-fictional', null],   // null：部品のあるスライドすべての最終の段階
];
const CLIP = { x: 0, y: 0, width: 1280, height: 720 };
const b = await launch();
for (const [name, given] of CASES) {
  const deck = path.join(out, name + '.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(ROOT, 'examples', name, 'deck.html'), '-o', deck], { stdio: 'pipe' });
  const host = path.join(out, name + '.host.html');
  fs.writeFileSync(host, `<!doctype html><html><body style="margin:0"><iframe id="f" src="${fileUrl(deck)}" style="display:none;border:0;width:1280px;height:720px"></iframe></body></html>`);
  const settle = (f) => f.evaluate(() => Promise.all([...document.fonts].map((x) => x.load().catch(() => {})))
    .then(() => document.fonts.ready).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  // 起動の知らせのときの字の読み込み（違ったときの手がかり）
  const atReady = () => document.addEventListener('deck:ready', () => { const f = [...document.fonts]; window.__atReady = { loaded: f.filter((x) => x.status === 'loaded').length, loading: f.filter((x) => x.status === 'loading').length }; });
  // 違ったときの手がかり：スライドの中の要素の箱（レイアウトが違うのか、塗りだけが違うのか）
  const boxes = (f, i) => f.evaluate((i) => [...DECK.slides[i].querySelectorAll('*')].map((e) => { const r = e.getBoundingClientRect(); return (e.getAttribute('class') || e.tagName) + ' ' + [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(','); }), i);
  // ふつうの起動
  const pn = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pn.addInitScript(atReady);
  const errs = [];
  pn.on('pageerror', (e) => errs.push(e.message));
  await pn.goto(fileUrl(deck));
  await pn.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const pos = given || await pn.evaluate(() => DECK.slides.map((s, i) => [i, s._max, s._comps.length]).filter((x) => x[2]).map((x) => [x[0], x[1]]));
  // 隠れた iframe の中で起動する
  const ph = await b.newPage({ viewport: { width: 1280, height: 720 } });
  ph.on('pageerror', (e) => errs.push(e.message));
  await ph.addInitScript(atReady);
  await ph.goto(fileUrl(host));
  const fr = await (await ph.$('#f')).contentFrame();
  await fr.waitForFunction(() => document.readyState === 'complete' && window.DECK && typeof DECK.seek === 'function', null, { timeout: 15000 });
  await ph.waitForTimeout(300);
  const hidden = await fr.evaluate(() => ({ ready: !!DECK.ready, w: document.getElementById('stage').offsetWidth }));
  ok(!hidden.ready && hidden.w === 0, `${name}: not mounted while hidden (ready=${hidden.ready}, stage width ${hidden.w})`);
  // 待つ間に頼んだ seek：出した後にその位置で描かれる
  const [i0, k0] = pos[0];
  // kokugo-kanbun は DECK.seek、pitch-fictional は DECK.go（編集アプリのプレビューが送る app-go と同じ）で頼む
  const how = name === 'pitch-fictional' ? 'go' : 'seek';
  await fr.evaluate(([i, k, how]) => (how === 'go' ? DECK.go(i, k, false) : DECK.seek(i, k, Infinity)), [i0, k0, how]);
  await ph.evaluate(() => { document.getElementById('f').style.display = 'block'; });
  await fr.waitForFunction(() => DECK.ready, null, { timeout: 15000 });
  const st = await fr.evaluate(() => DECK.state());
  ok(st.slide === i0 + 1 && st.step === k0, `${name}: the ${how} asked for while hidden is drawn after showing (slide ${st.slide}, step ${st.step})`);
  // 操作のバー（tools.js。起動の後しばらく出て消える）と知らせは、起動の時刻で出ているかどうかが変わるので隠して比べる
  for (const f of [pn, fr]) await f.addStyleTag({ content: '#dt-cb,#deck-toast{display:none!important}' });
  for (const [i, k] of pos) {
    for (const f of [pn, fr]) { await f.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [i, k]); await settle(f); }
    let A = await pn.screenshot({ clip: CLIP }), B = await ph.screenshot({ clip: CLIP });
    if (!A.equals(B)) { await settle(pn); await settle(fr); A = await pn.screenshot({ clip: CLIP }); B = await ph.screenshot({ clip: CLIP }); }
    const same = A.equals(B) || await pn.evaluate(async ([a, b]) => {
      const load = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      for (let j = 0; j < da.length; j++) if (da[j] !== db[j]) return false;
      return true;
    }, [A.toString('base64'), B.toString('base64')]);
    if (!same) {
      const [ba, bb] = [await boxes(pn, i), await boxes(fr, i)];
      const j = ba.findIndex((x, n) => x !== bb[n]);
      console.log(`     layout ${j < 0 ? 'identical (' + ba.length + ' boxes)' : 'differs at box ' + j + ': normal ' + ba[j] + ' / hidden ' + bb[j]}; fonts at ready: normal ${JSON.stringify(await pn.evaluate(() => window.__atReady))}, hidden ${JSON.stringify(await fr.evaluate(() => window.__atReady))}`);
      fs.writeFileSync(path.join(out, `${name}-s${i + 1}-k${k}-normal.png`), A); fs.writeFileSync(path.join(out, `${name}-s${i + 1}-k${k}-hidden.png`), B); }
    ok(same, `${name}: slide ${i + 1} step ${k}: hidden start, shown later = normal start (pixel-equal)`);
  }
  ok(!errs.length, `${name}: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await pn.close(); await ph.close();
}
await b.close();
console.log(fail ? `${fail} failure(s)` : 'all ok');
process.exit(fail ? 1 : 0);
