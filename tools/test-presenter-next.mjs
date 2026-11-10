// 発表者ビューの「次のスライド」と「今の画面」（#192、Player 1.5.0）
//   node tools/test-presenter-next.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 見本：examples/minimal を組んだデッキ（日本語）と、<html lang="en"> にした写し（英語）。127.0.0.1 で配り、本体の p で発表者ビューを開く：
//   #1  段階が残っているスライドで：「次のスライド」の画面は次のスライドを、すべてのステップを出した姿（最後の段階）で見せる
//   #2  「今の画面」はいつも先のステップを薄く見せる（preview。--preview-opacity の濃さ）。本体の画面は薄く見せないまま
//   #3  発表者ビューの l（とそのボタン）は本体の画面だけを切り替える。「今の画面」は薄く見せたまま
//   #4  最後のスライド：「次のスライド」は「終わり」/ "End" だけ
//   #5  見出しと枠の名前：「次のスライド」/ "Next slide"。台本の欄の「次のステップ」/ "Next step" はそのまま
// --shots があれば、発表者ビューを撮る（presenter-ja.png・presenter-en.png・presenter-end-ja.png）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args.splice(si, 2)[1]) : null;
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-presenter-next-')));
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 見本（日本語と英語）と配る口
const deck = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const narr = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
const OUT = {};
for (const lang of ['ja', 'en']) {
  const dir = path.join(work, lang);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), lang === 'ja' ? deck : deck.replace('<html lang="ja"', '<html lang="en"'));
  fs.writeFileSync(path.join(dir, 'narration.md'), narr);
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { stdio: 'pipe' });
  OUT[lang] = path.join(dir, 'out');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = path.join(work, p);
  if (!f.startsWith(work) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch();
const errs = [];
const frameOf = async (pv, id) => (await pv.$('#' + id)).contentFrame();
// 画面の中のスライド i の、段階を持つ要素の濃さ（段階の番号ごとの最小）
const opac = (f, i) => f.evaluate((i) => {
  const s = document.querySelectorAll('section.slide')[i], out = {};
  s.querySelectorAll('[data-step]').forEach((e) => { const n = e.getAttribute('data-step'), o = +getComputedStyle(e).opacity; out[n] = Math.min(out[n] ?? 1, o); });
  return out;
}, i);
try {
  for (const lang of ['ja', 'en']) {
    const ja = lang === 'ja';
    console.log(lang + ': built deck');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(lang + ': ' + e.message));
    await p.goto(BASE + lang + '/out/deck.html');
    await p.waitForFunction(() => window.DECK && DECK.ready);
    await p.evaluate(() => { DECK.muteSounds && DECK.muteSounds(true); DECK.go(1, 0, false); });
    const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
    pv.on('pageerror', (e) => errs.push(lang + ' presenter: ' + e.message));
    await pv.waitForLoadState(); await pv.setViewportSize({ width: 1400, height: 820 });
    await pv.waitForSelector('#f-next');
    const fc = await frameOf(pv, 'f-cur'), fn = await frameOf(pv, 'f-next');
    await fc.waitForFunction(() => window.DECK && DECK.ready); await fn.waitForFunction(() => window.DECK && DECK.ready);
    const main = await p.evaluate(() => DECK.state());
    ok(main.slide === 2 && main.step === 0 && main.max > 0, `${lang}: the main window is on slide 2 with steps remaining ${JSON.stringify(main)}`);

    // #1 次のスライド：slide 3 をすべてのステップを出した姿で
    await fn.waitForFunction(() => DECK.state().slide === 3).catch(() => {});
    const nx = await fn.evaluate(() => DECK.state());
    ok(nx.slide === 3 && nx.step === nx.max && nx.max > 0, `#1 ${lang}: the next pane shows slide 3 at its last step (all steps) ${JSON.stringify(nx)}`);
    const nxo = await opac(fn, 2);
    ok(Object.values(nxo).length > 0 && Object.values(nxo).every((o) => o > 0.99), `#1 ${lang}: every step of slide 3 is fully shown in the next pane ${JSON.stringify(nxo)}`);
    ok(!nx.preview, `#1 ${lang}: the next pane is not in preview ${JSON.stringify(nx.preview)}`);

    // #2 今の画面：preview が入り、先のステップが薄い。本体は薄くしない
    await fc.waitForFunction(() => DECK.state().slide === 2);
    const cur = await fc.evaluate(() => ({ preview: DECK.previewOn(), st: DECK.state(),
      po: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-opacity')) }));
    ok(cur.preview && cur.st.preview && cur.st.step === 0, `#2 ${lang}: the current pane has preview on ${JSON.stringify(cur)}`);
    await pv.waitForTimeout(400);
    const co = await opac(fc, 1), mo = await opac(p, 1);
    const later = Object.keys(co).filter((n) => +n > 0);
    ok(later.length > 0 && later.every((n) => Math.abs(co[n] - (cur.po || 0.45)) < 0.02), `#2 ${lang}: later steps are faint in the current pane (--preview-opacity ${cur.po}) ${JSON.stringify(co)}`);
    ok(await p.evaluate(() => !DECK.previewOn() && !DECK.state().preview), `#2 ${lang}: the main window stays preview off`);
    ok(later.every((n) => mo[n] < 0.01), `#2 ${lang}: later steps stay hidden in the main window ${JSON.stringify(mo)}`);
    if (SHOTS && ja) await pv.screenshot({ path: path.join(SHOTS, 'presenter-ja.png') });
    if (SHOTS && !ja) await pv.screenshot({ path: path.join(SHOTS, 'presenter-en.png') });

    // 段階を送っても、次のスライドの画面は slide 3 のまま。今の画面は preview のまま
    await pv.keyboard.press('ArrowRight');
    await fc.waitForFunction(() => DECK.state().step === 1);
    await pv.waitForTimeout(400);
    const nx2 = await fn.evaluate(() => DECK.state()), cur2 = await fc.evaluate(() => DECK.previewOn());
    ok(nx2.slide === 3 && nx2.step === nx2.max && cur2, `#1 ${lang}: after one step, the next pane still shows slide 3 complete, the current pane still previews ${JSON.stringify({ nx2, cur2 })}`);

    // #3 l：本体だけを切り替える。キーとボタン
    if (ja) {
      await pv.keyboard.press('l');
      await p.waitForFunction(() => DECK.previewOn(), null, { timeout: 5000 }).catch(() => {});
      await pv.waitForTimeout(300);
      const a = { main: await p.evaluate(() => DECK.previewOn()), cur: await fc.evaluate(() => DECK.previewOn()), btn: await pv.getAttribute('#pv [data-b="lect"]', 'aria-pressed') };
      ok(a.main && a.cur && a.btn === 'true', `#3 ${lang}: l in the presenter view turns preview on in the main window only; the current pane keeps it ${JSON.stringify(a)}`);
      await pv.click('#pv [data-b="lect"]');
      await p.waitForFunction(() => !DECK.previewOn(), null, { timeout: 5000 }).catch(() => {});
      await pv.waitForTimeout(300);
      const b = { main: await p.evaluate(() => DECK.previewOn()), cur: await fc.evaluate(() => DECK.previewOn()), btn: await pv.getAttribute('#pv [data-b="lect"]', 'aria-pressed') };
      ok(!b.main && b.cur && b.btn === 'false', `#3 ${lang}: the button turns it off in the main window; the current pane keeps preview on ${JSON.stringify(b)}`);
    }

    // #5 見出しと名前
    const lab = await pv.evaluate(() => ({ lab: document.querySelector('#pv-next .lab').textContent, title: document.getElementById('f-next').title,
      notes: document.querySelector('#pv-text .next .lab') ? document.querySelector('#pv-text .next .lab').textContent : null }));
    const want = ja ? '次のスライド' : 'Next slide';
    ok(lab.lab === want && lab.title === want, `#5 ${lang}: the next pane is labelled ${JSON.stringify(want)} ${JSON.stringify(lab)}`);
    ok(lab.notes === null || lab.notes === (ja ? '次のステップ' : 'Next step'), `#5 ${lang}: the script pane keeps "next step" ${JSON.stringify(lab.notes)}`);

    // #4 最後のスライド：終わり / End
    const n = await p.evaluate(() => DECK.state().max >= 0 && document.querySelectorAll('section.slide').length);
    await p.evaluate((n) => DECK.go(n - 1, 0, false), n);
    await pv.waitForFunction(() => !document.getElementById('pv-end').hidden);
    const end = await pv.evaluate(() => { const e = document.getElementById('pv-end'), f = document.getElementById('f-next'), r = e.getBoundingClientRect();
      return { text: e.textContent, shown: r.width > 0 && r.height > 0, frameHidden: f.hidden && f.getBoundingClientRect().height === 0 }; });
    ok(end.text === (ja ? '終わり' : 'End') && end.shown && end.frameHidden, `#4 ${lang}: on the last slide the next pane shows only ${JSON.stringify(ja ? '終わり' : 'End')} ${JSON.stringify(end)}`);
    if (SHOTS && ja) await pv.screenshot({ path: path.join(SHOTS, 'presenter-end-ja.png') });
    // 戻ると次のスライドの画面に戻る
    await p.evaluate((n) => DECK.go(n - 2, 0, false), n);
    await pv.waitForFunction(() => document.getElementById('pv-end').hidden && !document.getElementById('f-next').hidden);
    await fn.waitForFunction((n) => DECK.state().slide === n, n);
    ok(true, `#4 ${lang}: back on slide ${n - 1}, the next pane shows slide ${n} again`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
if (fails) { console.log(`test-presenter-next: ${fails} failed`); process.exit(1); }
console.log('test-presenter-next: all ok');
