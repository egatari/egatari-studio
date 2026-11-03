// 「このサンプルのように作る」（backlog #130、handoff/samples-gallery-plan.md §1.4・§1.5）を、使う人として本物の画面で通して歩く
//   node tools/test-app-from-sample.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 編集アプリを tools/build-app.mjs で組み（サンプルの Egatari ファイルと sample.json の一覧も）、127.0.0.1 で配って：
// F1 高校の国語の先生（ja）：はじめの画面のサンプルは「再生」→ 大きく再生する窓（sandbox の枠でファイルそのものが動く・頼み方・権利・ボタン 3 つ）→
//    「このサンプルのように作る」→ 新規作成：① ③ は答えた形で「サンプルから」の札、② だけが空で開いて字を待つ、④ はサンプルのパーツに印と札、
//    構成を添える印 → 写した指示にサンプルの構成（見出しと言いたいこと）・テーマ・場面。印を外すと指示が小さくなり構成が消える。
//    ① を変えると札が消える。［作成］→ egatari.json の studio.newDeck に fromSample
// F2 同じ人が、ふつうの新規作成…：サンプルの知らせ・構成の印・札は出ない
// F3 会社員（en）：egatari.org の「Studio でこのサンプルのように作る」（?from-sample=pitch-fictional）→ 同じ流れがすぐ開き、URL から引数が消える。
//    知らない名前は知らせて、はじめの画面のまま
// F4 「コピーを開いて編集」：ふつうのファイルと同じ道で開く（minimal）。一覧と sha256 の合わないファイルは再生しない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { initialParts } from '../kit/core/new-deck.mjs';
import { PACK_CAP_KB } from '../kit/core/llm-pack.mjs';
import { replyOf } from './test-app-llm.mjs';
import { clickDlg, clickMenuOpen } from './click-retry.mjs';
import { EXAMPLES } from './examples-portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-from-sample-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sample = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', n, 'sample.json'), 'utf8'));
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-app.mjs'), '--out', DIST], { stdio: 'pipe' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];

const open = async (lang, tag, query = '') => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
  await p.goto(BASE + '?lang=' + lang + query);
  await p.waitForSelector('#drop');
  return p;
};
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };
const text = (p, sel) => p.textContent(sel);
const answer = (p, k) => p.textContent(`#paste-step-${k}-answer .paste-answer-text`);
const badgeOn = (p, k) => p.isVisible(`#paste-step-${k}-answer .pick-badge.from-sample`);
const ticks = (p) => p.$$eval('#paste-parts input[type=checkbox]:checked', (xs) => xs.map((x) => x.value).sort().join());
const fromBadges = (p) => p.$$eval('#paste-parts .pick', (xs) => xs.filter((x) => !x.querySelector('.pick-badge.from-sample').hidden).map((x) => x.dataset.part).sort().join());
const meterBytes = (p) => p.evaluate(() => Number(document.getElementById('paste-pack-size').dataset.bytes));
const copy = async (p) => {
  if (!(await p.isVisible('#paste-copy-guide'))) await p.evaluate(() => document.getElementById('paste-copy-guide').closest('section.paste-step').querySelector('.paste-step-h').click());
  await p.evaluate(() => { window.__APP_TEST.lastCopy = null; const m = document.getElementById('paste-copied'); m.hidden = true; m.textContent = ''; });
  await p.click('#paste-copy-guide');
  await p.waitForFunction(() => window.__APP_TEST.lastCopy !== null && !document.getElementById('paste-copied').hidden);
  return p.evaluate(() => window.__APP_TEST.lastCopy.replace(/\r\n/g, '\n'));
};
const files = (p) => p.evaluate(() => { const f = window.__APP_TEST.files(); if (!f) return null; const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
const play = async (p, name) => {
  await p.click(`#examples-list li[data-example="${name}"] button`);
  await p.waitForSelector('#dlg.sample[open] #sample-frame');
};

try {
  // ================================================================ F1 高校の国語の先生：漢文のサンプルを見て、論語の教材を同じ作り方で
  const p1 = await open('ja', 'f1');
  const rows = await p1.$$eval('#examples-list li', (li) => li.map((x) => [x.dataset.example, x.querySelector('button').textContent, x.querySelector('button').getAttribute('aria-label')]));
  ok(rows.map((r) => r[0]).join() === EXAMPLES.join() && rows.every((r) => r[1] === '再生' && r[2].startsWith('再生: ')) && (await text(p1, '#examples .hint')) === 'Egatari で作ったサンプルの教材です。再生して、同じ作り方で自分の教材を作れます。',
    'F1: every sample on the first screen has one button, 「再生」 (accessible name with the title): ' + JSON.stringify(rows.map((r) => r[1])));
  const KS = sample('kokugo-kanbun');
  await play(p1, 'kokugo-kanbun');
  const box = await p1.$eval('#sample-frame', (f) => { const r = f.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), sandbox: f.getAttribute('sandbox'), src: f.hasAttribute('src') }; });
  ok(box.w >= 1100 && Math.abs(box.w / box.h - 16 / 9) < 0.02 && box.sandbox === 'allow-scripts' && !box.src, 'F1: the sample plays large in a 16:9 sandbox frame without allow-same-origin (srcdoc only): ' + JSON.stringify(box));
  const fr = await (await p1.$('#sample-frame')).contentFrame();
  await fr.waitForFunction(() => typeof DECK === 'object' && DECK.state && DECK.state().slide === 1, null, { timeout: 30000 });
  const inFrame = await fr.evaluate(() => ({ slides: document.querySelectorAll('section.slide').length, title: document.title, lang: document.documentElement.lang }));
  ok(inFrame.slides === KS.structure.length && inFrame.lang === 'ja', 'F1: the frame runs the file’s own player (' + JSON.stringify(inFrame) + ')');
  const dlg = await p1.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, req: document.getElementById('sample-request').textContent, rights: document.getElementById('sample-rights').textContent,
    buttons: [...document.querySelectorAll('#dlg-buttons button')].map((b) => [b.id, b.textContent, b.className]) }));
  ok(dlg.title === '漢文を読む――返り点から書き下し文へ' && dlg.req === 'AI への頼み方： ' + KS.request && dlg.rights === 'ライセンス：CC BY 4.0（雲居玄道（Egatari Studio））'
    && JSON.stringify(dlg.buttons) === JSON.stringify([['dlg-copy', 'コピーを開いて編集', 'ghost small'], ['dlg-cancel', '閉じる', ''], ['dlg-like', 'このサンプルのように作る', 'pri']]),
    'F1: the window shows the title, how the AI was asked, the license, and 「コピーを開いて編集」 (small) · 「閉じる」 · 「このサンプルのように作る」 (main): ' + JSON.stringify(dlg));
  ok(!(await p1.evaluate(() => document.body.innerText.includes('見本'))), 'F1: the screen never says 見本 (the termbase word is サンプル)');
  await shot(p1, 'from-sample-play.png');
  await clickDlg(p1, '#dlg-like');
  await p1.waitForSelector('#dlg[open] #paste-step-kind');
  ok((await text(p1, '#ai-from-sample')) === 'サンプル「漢文を読む――返り点から書き下し文へ」から始めます。使う場面・見た目・パーツはサンプルと同じにしてあり、変えられます。② に、作る教材のことを書いてください。',
    'F1: New… says it starts from the sample and what was filled in');
  ok((await answer(p1, 'kind')) === '使う場面：授業・研修／授業（小・中・高）' && await badgeOn(p1, 'kind') && (await answer(p1, 'theme')).startsWith('テーマ：') && await badgeOn(p1, 'theme')
    && (await p1.inputValue('#paste-theme')) === 'kokugo', 'F1: ① and ③ are answered from the sample, each with 「サンプルから」: ' + (await answer(p1, 'kind')) + ' / ' + (await answer(p1, 'theme')));
  ok(await p1.getAttribute('#paste-step-content-btn', 'aria-current') === 'step' && (await p1.inputValue('#paste-title')) === '' && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-title'),
    'F1: only ② is open and empty, and the caret waits in its title');
  await shot(p1, 'from-sample-new.png');
  await p1.fill('#paste-title', '論語を読む');
  await p1.click('#paste-next-content');
  await p1.waitForSelector('#paste-step-send.current');
  await p1.evaluate(() => document.getElementById('paste-structure-row').scrollIntoView({ block: 'center' }));
  await shot(p1, 'from-sample-send.png');
  const want = [...new Set([...initialParts([]), ...KS.parts])].sort().join();
  ok((await ticks(p1)) === want && (await fromBadges(p1)) === [...KS.parts].sort().join(), 'F1 ④: the sample’s parts are ticked with 「サンプルから」 (' + KS.parts.join(', ') + ')');
  ok(await p1.isChecked('#paste-use-structure') && (await text(p1, '#paste-structure-row')) === `サンプル「漢文を読む――返り点から書き下し文へ」の構成（${KS.structure.length} 枚の見出しと要点）を指示に添える`,
    'F1 ④: 「…の構成…を指示に添える」 is ticked');
  const withBytes = await meterBytes(p1);
  ok(withBytes <= PACK_CAP_KB.free * 1024 || (await p1.isVisible('#paste-trim')), `F1 ④: the free plan’s instructions fit ${PACK_CAP_KB.free} KB after fitting (${(withBytes / 1024).toFixed(1)} KB)`);
  const c1 = await copy(p1);
  const tail = c1.slice(c1.indexOf('# 頼みたいこと'));
  ok(tail.includes('- タイトル（表紙にそのまま使う）：論語を読む') && tail.includes('- テーマ：kokugo') && tail.includes('- 場面：授業・研修／授業（小・中・高）') && tail.includes('## 倣うサンプルの構成')
    && tail.includes('サンプル「漢文を読む――返り点から書き下し文へ」の構成と見せ方に倣って') && KS.structure.every((r, i) => tail.includes(`${i + 1}. ${r.heading} — ${r.point}`))
    && !c1.includes(KS.request), 'F1 ④: the copied instructions carry the sample’s structure (every heading and point), its theme and setting, and not the sample’s own text');
  await p1.evaluate(() => document.getElementById('paste-step-send').querySelector('.paste-step-h').click());
  await p1.uncheck('#paste-use-structure');
  const withoutBytes = await meterBytes(p1);
  const c1b = await copy(p1);
  ok(withoutBytes < withBytes && !c1b.includes('## 倣うサンプルの構成'), `F1 ④: unticking drops the structure and shrinks the instructions by ${((withBytes - withoutBytes) / 1024).toFixed(2)} KB`);
  await p1.evaluate(() => document.getElementById('paste-step-send').querySelector('.paste-step-h').click());
  await p1.check('#paste-use-structure');
  // ① を変えると「サンプルから」の札は消える（戻すと付く）
  await p1.click('#paste-change-kind');
  await p1.check('#paste-cat-research'); await p1.check('#paste-sub-conference'); await p1.click('#paste-next-kind');
  const off = await badgeOn(p1, 'kind');
  await p1.click('#paste-change-kind');
  await p1.check('#paste-cat-teaching'); await p1.check('#paste-sub-class'); await p1.click('#paste-next-kind');
  ok(!off && await badgeOn(p1, 'kind'), 'F1: changing ① removes 「サンプルから」, choosing the sample’s setting again shows it');
  if (!(await p1.isVisible('#paste-copy-guide'))) await p1.evaluate(() => document.getElementById('paste-step-send').querySelector('.paste-step-h').click());
  await copy(p1);
  await p1.fill('#paste-deck', replyOf(worked('common', 'deck.html'), worked('common', 'narration.md')));
  const before = await p1.evaluate(() => (window.__APP_TEST.state().portable || {}).docId || null);
  await clickDlg(p1, '#dlg-import');
  await p1.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d && s.loads > 0; }, before, { timeout: 30000 });
  const F1 = await files(p1);
  const nd = (JSON.parse(F1['egatari.json'] || '{}').studio || {}).newDeck || {};
  ok(nd.fromSample === 'kokugo-kanbun' && nd.category === 'teaching' && nd.subcategory === 'class' && KS.parts.every((t) => nd.parts.includes(t)), 'F1: 「作成」 keeps fromSample in studio.newDeck: ' + JSON.stringify(nd));

  // ================================================================ F2 ふつうの新規作成…：サンプルのものは出ない
  await clickMenuOpen(p1, '#b-filemenu');
  await p1.click('#b-new');
  await p1.waitForSelector('#dlg[open] #paste-step-kind');
  ok(!(await p1.$('#ai-from-sample')) && !(await p1.$('#paste-use-structure')) && !(await badgeOn(p1, 'kind')) && await p1.getAttribute('#paste-step-kind-btn', 'aria-current') === 'step',
    'F2: plain New… has no sample notice, no structure tick and no 「サンプルから」, and opens at ①');
  await p1.keyboard.press('Escape');
  await p1.context().close();

  // ================================================================ F3 egatari.org のサンプルのページから（en）
  const PS = sample('pitch-fictional');
  const p3 = await open('en', 'f3', '&from-sample=pitch-fictional');
  await p3.waitForSelector('#dlg[open] #paste-step-kind');
  ok((await text(p3, '#ai-from-sample')).startsWith('Starting from the sample “') && (await answer(p3, 'kind')) === 'Setting: Business / Pitch' && await badgeOn(p3, 'kind') && (await p3.inputValue('#paste-theme')) === PS.theme
    && !(await p3.evaluate(() => location.search.includes('from-sample'))) && (await p3.evaluate(() => location.search)) === '?lang=en',
    'F3: ?from-sample=pitch-fictional opens New… from the sample in English, and the parameter leaves the address');
  await p3.fill('#paste-title', 'A pitch for our bakery app');
  await p3.click('#paste-next-content');
  await p3.waitForSelector('#paste-step-send.current');
  const c3 = await copy(p3);
  ok(c3.includes('## Structure of the sample to follow') && c3.includes(`1. ${PS.structure[0].heading} — ${PS.structure[0].point}`) && (await fromBadges(p3)) === [...PS.parts].sort().join(),
    'F3: English instructions carry the Japanese sample’s headings as they are, under an English lead');
  await shot(p3, 'from-sample-en-send.png');
  await p3.context().close();
  const p3b = await open('en', 'f3b', '&from-sample=no-such-sample');
  await p3b.waitForSelector('#toast.show');
  ok((await text(p3b, '#toast')) === 'Sample “no-such-sample” is not in this version of Studio. Choose one from Samples on the first screen.' && !(await p3b.$('#dlg[open]')) && await p3b.isVisible('#welcome'),
    'F3: an unknown sample name is reported, and the first screen stays');
  await p3b.context().close();

  // ================================================================ F4 コピーを開いて編集・合わないファイル
  const p4 = await open('ja', 'f4');
  await play(p4, 'minimal');
  await clickDlg(p4, '#dlg-copy');
  await p4.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
  ok((await p4.evaluate(() => window.__APP_TEST.state().portable.name)) === 'minimal.ega.html' && !(await p4.evaluate(() => window.__APP_TEST.state().portable.readOnly)),
    'F4: 「コピーを開いて編集」 opens the sample file like any file, editable');
  await p4.context().close();
  const p5 = await open('ja', 'f5');
  await p5.route('**/examples/pitch-fictional.ega.html', async (route) => { const r = await route.fetch(); const b = await r.body(); await route.fulfill({ response: r, body: Buffer.concat([b, Buffer.from('<!-- x -->')]) }); });
  await p5.click('#examples-list li[data-example="pitch-fictional"] button');
  await p5.waitForSelector('#toast.show');
  ok((await text(p5, '#toast')).startsWith('サンプルを読み込めませんでした: ファイルがサンプルの一覧と合いません') && !(await p5.$('#dlg[open]')), 'F5: a file that does not match the list’s sha256 is not played');
  await p5.context().close();
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close().catch(() => {});
  srv.close();
}
for (const e of errs) console.log('  ' + e);
ok(!errs.length, 'no page errors');
console.log(fails ? `test-app-from-sample: ${fails} failed` : 'test-app-from-sample: all passed');
process.exit(fails ? 1 : 0);
