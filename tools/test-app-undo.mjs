// 元に戻す・やり直し・最後に保存した状態に戻す・検索と置換・出典の行（handoff #86）を、編集アプリの本物の画面で確かめる
//   node tools/test-app-undo.mjs [作業用のフォルダ]
// 1. 開いた Egatari ファイル（examples/minimal）：↶ ↷ は初めは押せない（disabled）。ツールチップ（⌘Z・⇧⌘Z・⌘F）
// 2. HTML の編集・台本の編集（編集の口 /__dev/edit・/__dev/narration）・スライドの複製を、多段で元に戻す（↶ と ⌘Z）・やり直す（⇧⌘Z）。知らせ「元に戻しました：…」。
//    入力の欄の中の ⌘Z は欄に任せる（履歴は動かない）
// 3. 保存しても履歴は消えない。ファイル ▾ の「最後に保存した状態に戻す…」：確かめの言葉、戻す、元に戻すでまた戻る
// 4. 検索と置換：⌘F で窓、数の行、次へでプレビューがその枚へ、すべて置換の確かめ、置換で原稿と台本が変わりマークアップは壊れない、元に戻すで 1 回で戻る、0 件
// 5. 出典の行のテンプレート：スライド ▾ の挿入から。原稿に <p class="source">、プレビューで結論の行の上に小さく
// 6. 英語の画面：ツールチップ・メニュー・窓の言葉と数の行
// 7. 作業フォルダ：「最後に保存した状態に戻す…」は出さない。台本の編集を ⌘Z でファイルに戻す
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { answerCreator } from './edit-role-answer.mjs';
import { nodeEnv } from '../kit/build.mjs';
import { exportPortable } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { findMatches } from '../kit/core/find-replace.mjs';
import { clickCommand, clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-undo-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 材料と配る
const dir = path.join(work, 'pf');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/](out|audio)([\\/]|$)/.test(path.relative(ROOT, x)) });
const pf = await exportPortable(nodeEnv, path.join(dir, 'deck.html'), {});
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = answerCreator(await launch());
const errs = [];
async function session(lang, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${lang} console: ${m.text()}`); });
  await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
  await page.waitForSelector('#drop');
  try { await fn(page); } finally { await ctx.close(); }
}
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const hist = (page) => page.evaluate(() => window.__APP_TEST.history());
// 組み直しを待つ：組み立ての回数（builds）が増え、プレビューが読み込み終わり、スライドの操作が終わっている
const loads = async (page) => (await state(page)).builds;
const waitLoads = (page, n) => page.waitForFunction((n) => { const s = window.__APP_TEST.state(); return s.builds > n && s.frameLoaded === s.loads && !window.__APP_TEST.slides().busy; }, n, { timeout: scaled(60000) });
const frame = (page) => page.frames().find((f) => f.parentFrame() === page.mainFrame() && f.name() !== 'sl-thumbs');
const memFile = async (page, rel) => { const f = await page.evaluate(() => window.__APP_TEST.files()); return f && f[rel] ? Buffer.from(f[rel], 'base64').toString('utf8') : null; };
const toastText = (page) => page.textContent('#toast');
async function openBytes(page, html, name) {
  const n = await loads(page);
  const b64 = Buffer.from(html).toString('base64');
  const r = await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name }); }, [b64, name]);
  await waitLoads(page, n);
  return r;
}
// 編集の口を呼ぶ（初めの編集では権利の確認に「続ける」）。書いた後の組み直しを待つ
async function api(page, method, url, body) {
  const n = await loads(page);
  const pr = page.evaluate(([m, u, b]) => window.__APP_TEST.api(m, u, b), [method, url, body]);
  const rights = await Promise.race([pr.then(() => null), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(3000) }).catch(() => null)]);
  if (rights) await clickDlg(page, '#dlg-ok');
  const r = await pr;
  if (method === 'POST' && r && r._status === 200) await waitLoads(page, n);
  return r;
}
// プレビューの最初のスライドの見出しの範囲で HTML を書き換える
async function editHeading(page, text) {
  const range = await frame(page).evaluate(() => { const h = document.querySelector('section.slide h1[data-src], section.slide h2[data-src]'); return h ? h.getAttribute('data-src') : null; });
  const g = await api(page, 'GET', '/__dev/source?range=' + range);
  // 範囲は要素の中身（字だけ）か、要素ごと
  return api(page, 'POST', '/__dev/edit', { range, h: g.h, text: /</.test(g.text) ? g.text.replace(/>[^<]+</, '>' + text + '<') : text });
}
async function editNarration(page, text) {
  await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.pos && s.pos.key; }, null, { timeout: scaled(20000) });
  const key = (await state(page)).pos.key;
  const [sk, st] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
  const g = await api(page, 'GET', '/__dev/narration?key=' + encodeURIComponent(key));
  return api(page, 'POST', '/__dev/narration', { slideKey: sk, stepKey: st, rev: g.rev, turns: [{ role: 'expert', text }] });
}
async function step(page, how) {
  const n = await loads(page);
  if (how === 'b-undo' || how === 'b-redo') await page.click('#' + how);
  else { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press(how); }
  await waitLoads(page, n);
}
const disabled = (page) => page.evaluate(() => [document.getElementById('b-undo').disabled, document.getElementById('b-redo').disabled]);

try {
  await session('ja', async (page) => {
    ok(await openBytes(page, pf.html, 'undo' + FORMAT.FILE_EXT) === true, 'ja: opens');
    // ---------------------------------------------------------------- 1. ボタン
    const tips = await page.evaluate(() => ['b-undo', 'b-redo', 'b-find'].map((id) => document.getElementById(id).title));
    const mac = await page.evaluate(() => /mac/i.test(navigator.platform));
    ok(JSON.stringify(tips) === JSON.stringify(mac ? ['元に戻す（⌘Z）', 'やり直し（⇧⌘Z）', '検索と置換（⌘F）'] : ['元に戻す（Ctrl+Z）', 'やり直し（Ctrl+Y）', '検索と置換（Ctrl+F）']), 'ja: the tooltips ' + JSON.stringify(tips));
    ok(JSON.stringify(await disabled(page)) === '[true,true]', 'ja: ↶ ↷ are disabled before any change');
    const deck0 = await memFile(page, 'deck.html'), narr0 = await memFile(page, 'narration.md');

    // ---------------------------------------------------------------- 2. 多段
    const e1 = await editHeading(page, '見出しを変えた');
    ok(e1._status === 200 && (await memFile(page, 'deck.html')).includes('見出しを変えた'), 'ja: the HTML edit is written ' + JSON.stringify(e1));
    const deck1 = await memFile(page, 'deck.html');
    const e2 = await editNarration(page, '台本を変えた文。');
    ok(e2._status === 200 && (await memFile(page, 'narration.md')).includes('台本を変えた文。'), 'ja: the script edit is written');
    const narr1 = await memFile(page, 'narration.md');
    let n = await loads(page);
    await clickCommand(page, '#b-dup');
    await waitLoads(page, n);
    const deck2 = await memFile(page, 'deck.html');
    ok(analyzeSlideIds(deck2).slides.length === analyzeSlideIds(deck1).slides.length + 1, 'ja: the slide is duplicated');
    let h = await hist(page);
    ok(h.undo.length === 3 && h.undo[0] === 'HTML の編集' && h.undo[1] === '台本の編集' && /の複製$/.test(h.undo[2]) && !h.redo.length, 'ja: three entries in the history ' + JSON.stringify(h));
    ok(JSON.stringify(await disabled(page)) === '[false,true]', 'ja: ↶ is enabled, ↷ still disabled');
    await step(page, 'b-undo');
    ok(await memFile(page, 'deck.html') === deck1 && /^元に戻しました：スライド 1「.*」の複製$/.test(await toastText(page)), 'ja: ↶ undoes the duplicate; toast ' + await toastText(page));
    await step(page, 'ControlOrMeta+z');
    ok(await memFile(page, 'narration.md') === narr0 && await toastText(page) === '元に戻しました：台本の編集', 'ja: ⌘Z undoes the script edit');
    await step(page, 'ControlOrMeta+z');
    ok(await memFile(page, 'deck.html') === deck0 && await toastText(page) === '元に戻しました：HTML の編集', 'ja: ⌘Z again undoes the HTML edit (byte for byte)');
    ok(JSON.stringify(await disabled(page)) === '[true,false]', 'ja: nothing left to undo: ↶ disabled, ↷ enabled');
    await step(page, 'ControlOrMeta+Shift+z');
    ok(await memFile(page, 'deck.html') === deck1 && await toastText(page) === 'やり直しました：HTML の編集', 'ja: ⇧⌘Z redoes the HTML edit');
    await step(page, 'b-redo');
    ok(await memFile(page, 'narration.md') === narr1, 'ja: ↷ redoes the script edit');
    h = await hist(page);
    ok(h.undo.length === 2 && h.redo.length === 1, 'ja: one redo left ' + JSON.stringify(h));
    // 入力の欄の中の ⌘Z は欄のもの
    await page.click('#b-find');
    await page.waitForSelector('#find-dlg[open] #find-q');
    await page.fill('#find-q', 'abc');
    await page.focus('#find-q');
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);
    ok(JSON.stringify(await hist(page)) === JSON.stringify(h) && await memFile(page, 'narration.md') === narr1, 'ja: ⌘Z inside a text field does not touch the history');
    await page.keyboard.press('Escape');
    ok(!(await page.evaluate(() => document.getElementById('find-dlg').open)), 'ja: Esc closes the find dialog');
    // 新しい操作でやり直しが消える
    await editNarration(page, '別の文。');
    h = await hist(page);
    ok(h.redo.length === 0 && h.undo.length === 3, 'ja: a new edit clears the redo stack');

    // ---------------------------------------------------------------- 3. 保存・最後に保存した状態に戻す
    await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('undo-saved.ega.html', { create: true }); });
    const save = page.evaluate(() => window.__APP_TEST.save('save'));
    const rb = await Promise.race([save.then(() => null), page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: scaled(30000) }).catch(() => null)]);
    if (rb) await clickDlg(page, '#dlg-rebuild');
    await save;
    ok(!(await state(page)).portable.dirty && (await hist(page)).undo.length === 3, 'ja: saved; the history is kept');
    const savedDeck = await memFile(page, 'deck.html'), savedNarr = await memFile(page, 'narration.md');
    await editNarration(page, '保存の後の文。');
    await editHeading(page, '保存の後の見出し');
    await clickCommand(page, '#b-revert');
    await page.waitForSelector('#dlg[open] #revert-body');
    const rv = await page.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, body: document.getElementById('revert-body').textContent, buttons: [...document.querySelectorAll('#dlg-buttons button')].map((b) => b.textContent) }));
    ok(JSON.stringify(rv) === JSON.stringify({ title: '最後に保存した状態に戻す', body: '保存してからの変更をすべて取り消します。元に戻すで戻せます', buttons: ['キャンセル', '戻す'] }), 'ja: the revert dialog ' + JSON.stringify(rv));
    await clickDlg(page, '#dlg-cancel');
    ok((await memFile(page, 'deck.html')).includes('保存の後の見出し'), 'ja: Cancel keeps the changes');
    await clickCommand(page, '#b-revert');
    n = await loads(page);
    await clickDlg(page, '#dlg-revert');
    await waitLoads(page, n);
    ok(await memFile(page, 'deck.html') === savedDeck && await memFile(page, 'narration.md') === savedNarr && await toastText(page) === '最後に保存した状態に戻しました', 'ja: Revert restores the files as saved');
    await step(page, 'b-undo');
    ok((await memFile(page, 'deck.html')).includes('保存の後の見出し') && (await memFile(page, 'narration.md')).includes('保存の後の文。') && await toastText(page) === '元に戻しました：最後に保存した状態に戻す', 'ja: Undo brings back the changes the revert dropped');

    // ---------------------------------------------------------------- 4. 検索と置換
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('ControlOrMeta+f');
    await page.waitForSelector('#find-dlg[open]');
    ok(await page.evaluate(() => document.activeElement.id) === 'find-q', 'ja: ⌘F opens Find and replace with the cursor in Find');
    const labels = await page.evaluate(() => ({ title: document.getElementById('find-title').textContent, find: document.querySelector('label[for=find-q]').textContent, with: document.querySelector('label[for=find-r]').textContent,
      scope: [...document.querySelectorAll('#find-scope label')].map((l) => l.textContent), mc: document.querySelector('.find-case').textContent, buttons: [...document.querySelectorAll('.find-buttons button')].map((b) => b.textContent) }));
    ok(JSON.stringify(labels) === JSON.stringify({ title: '検索と置換', find: '検索', with: '置換後の文字列', scope: ['スライドと台本', 'スライドだけ', '台本だけ'], mc: '大文字と小文字を区別する', buttons: ['前へ', '次へ', '置換', 'すべて置換'] }), 'ja: the dialog words ' + JSON.stringify(labels));
    await page.fill('#find-q', '学習率');
    await page.waitForFunction(() => window.__APP_TEST.find().n > 0);
    const f0 = await page.evaluate(() => window.__APP_TEST.find());
    ok(f0.slides >= 1 && f0.script >= 1 && f0.count === `${f0.n} 件（スライド ${f0.slides} 枚・台本 ${f0.script} か所）`, 'ja: the count line ' + f0.count);
    await page.click('#find-next');
    await page.waitForFunction(() => window.__APP_TEST.find().cur >= 0);
    const at = await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.pos && s.pos.i > 0 ? s.pos.i : 0; }, null, { timeout: scaled(5000) }).then((x) => x.jsonValue()).catch(() => 0);
    ok(at > 0, 'ja: Next moves the preview to the slide of the match (' + at + ')');
    const before = { deck: await memFile(page, 'deck.html'), narr: await memFile(page, 'narration.md') };
    await page.fill('#find-r', '学習の<率>&');
    await page.click('#find-all');
    await page.waitForSelector('#dlg[open] #find-confirm');
    ok(await page.textContent('#find-confirm') === `${f0.n} 件を置換します。元に戻すで戻せます`, 'ja: Replace all asks first: ' + await page.textContent('#find-confirm'));
    n = await loads(page);
    await clickDlg(page, '#dlg-replace');
    await waitLoads(page, n);
    await page.waitForFunction(() => !window.__APP_TEST.find().busy && window.__APP_TEST.find().n === 0);
    const d2 = await memFile(page, 'deck.html'), n2 = await memFile(page, 'narration.md');
    ok(findMatches({ deck: d2, narr: n2, query: '学習率' }).matches.length === 0, 'ja: no 学習率 left in the slide text or the spoken script');
    ok(d2.includes('学習の&lt;率&gt;&amp;') && analyzeSlideIds(d2).slides.length === analyzeSlideIds(before.deck).slides.length && analyzeSlideIds(d2).problems.length === 0, 'ja: the replacement is escaped in the HTML and the slides still parse');
    ok(n2.includes('学習の<率>&') && !/^\[\d+\][^\n]*学習率/m.test(n2), 'ja: the script text is replaced');
    ok(await page.textContent('#find-count') === '見つかりませんでした', 'ja: no matches left: 見つかりませんでした');
    h = await hist(page);
    ok(h.undo[h.undo.length - 1] === '置換', 'ja: one history entry 置換');
    await page.keyboard.press('Escape');
    await step(page, 'ControlOrMeta+z');
    ok(await memFile(page, 'deck.html') === before.deck && await memFile(page, 'narration.md') === before.narr && await toastText(page) === '元に戻しました：置換', 'ja: one Undo brings back every replaced match');

    // 1 つ置換：選んだ一致だけ（初めの「置換」は次の一致を選ぶ）
    await page.click('#b-find');
    await page.waitForSelector('#find-dlg[open]');
    await page.fill('#find-q', '学習率');
    await page.fill('#find-r', 'がくしゅうりつ');
    await page.waitForFunction((n) => window.__APP_TEST.find().n === n, f0.n);
    await page.click('#find-replace');
    await page.waitForFunction(() => window.__APP_TEST.find().cur >= 0);
    n = await loads(page);
    await page.click('#find-replace');
    await waitLoads(page, n).catch(async (e) => { console.log('       find state ' + JSON.stringify(await page.evaluate(() => window.__APP_TEST.find())) + ' toast ' + await toastText(page)); throw e; });
    await page.waitForFunction((n) => !window.__APP_TEST.find().busy && window.__APP_TEST.find().n === n - 1, f0.n);
    const one = findMatches({ deck: await memFile(page, 'deck.html'), narr: await memFile(page, 'narration.md'), query: 'がくしゅうりつ' }).matches.length;
    ok(one === 1 && (await hist(page)).undo.slice(-1)[0] === '置換', 'ja: Replace changes only the selected match (one history entry)');
    await page.keyboard.press('Escape');
    await step(page, 'b-undo');
    ok(await memFile(page, 'deck.html') === before.deck && await memFile(page, 'narration.md') === before.narr, 'ja: Undo brings the single replacement back');

    // ---------------------------------------------------------------- 5. 出典の行
    n = await loads(page);
    await clickCommand(page, '#b-insert');
    await page.waitForSelector('#dlg[open] #insert-source');
    ok(await page.textContent('#insert-source') === '出典の行', 'ja: the insert dialog lists 出典の行');
    await clickDlg(page, '#insert-source');
    await waitLoads(page, n);
    const d5 = await memFile(page, 'deck.html');
    ok(d5.includes('<p class="source">出典：資料の名前（発行者、年）</p>'), 'ja: the template writes <p class="source">');
    const geo = await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.pos && s.frameLoaded === s.loads; }).then(() => frame(page).evaluate(() => {
      const s = document.querySelector('section.slide .source'); if (!s) return null;
      const sl = s.closest('section.slide'), c = sl.querySelector('.concl'), b = sl.querySelector('.body');
      const cs = getComputedStyle(s);
      return { size: cs.fontSize, gray: cs.color, srcBottom: s.offsetTop + s.offsetHeight, srcTop: s.offsetTop, conclTop: c.offsetTop, bodyBottom: b.offsetTop + b.offsetHeight };
    }));
    ok(geo && geo.size === '20px' && geo.srcBottom <= geo.conclTop && geo.srcBottom > geo.conclTop - 24 && geo.bodyBottom <= geo.srcTop, 'ja: the source line sits just above the conclusion line, small, below the body ' + JSON.stringify(geo));
  });

  // ---------------------------------------------------------------- 6. 英語
  await session('en', async (page) => {
    ok(await openBytes(page, pf.html, 'undo-en' + FORMAT.FILE_EXT) === true, 'en: opens');
    const mac = await page.evaluate(() => /mac/i.test(navigator.platform));
    const tips = await page.evaluate(() => ['b-undo', 'b-redo', 'b-find'].map((id) => document.getElementById(id).title));
    ok(JSON.stringify(tips) === JSON.stringify(mac ? ['Undo (⌘Z)', 'Redo (⇧⌘Z)', 'Find and replace (⌘F)'] : ['Undo (Ctrl+Z)', 'Redo (Ctrl+Y)', 'Find and replace (Ctrl+F)']), 'en: the tooltips ' + JSON.stringify(tips));
    ok(await page.textContent('#b-revert') === 'Revert to last saved…', 'en: File ▾ › Revert to last saved…');
    await page.click('#b-find');
    await page.waitForSelector('#find-dlg[open]');
    const labels = await page.evaluate(() => ({ title: document.getElementById('find-title').textContent, find: document.querySelector('label[for=find-q]').textContent, with: document.querySelector('label[for=find-r]').textContent,
      scope: [...document.querySelectorAll('#find-scope label')].map((l) => l.textContent), mc: document.querySelector('.find-case').textContent, buttons: [...document.querySelectorAll('.find-buttons button')].map((b) => b.textContent) }));
    ok(JSON.stringify(labels) === JSON.stringify({ title: 'Find and replace', find: 'Find', with: 'Replace with', scope: ['Slides and script', 'Slides only', 'Script only'], mc: 'Match case', buttons: ['Previous', 'Next', 'Replace', 'Replace all'] }), 'en: the dialog words ' + JSON.stringify(labels));
    await page.fill('#find-q', '学習率');
    await page.waitForFunction(() => window.__APP_TEST.find().n > 0);
    const f = await page.evaluate(() => window.__APP_TEST.find());
    const pl = (k, w, many) => `${k} ${k === 1 ? w : many || w + 's'}`;
    ok(f.count === `${pl(f.n, 'match', 'matches')} (${pl(f.slides, 'slide')}, ${pl(f.script, 'place')} in the script)`, 'en: the count line ' + f.count);
    await page.fill('#find-q', 'zzzz-none');
    await page.waitForFunction(() => window.__APP_TEST.find().count === 'No matches');
    ok(true, 'en: No matches');
  });

  // ---------------------------------------------------------------- 7. 作業フォルダ
  await session('ja', async (page) => {
    const files = Object.fromEntries(['deck.html', 'narration.md'].map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
    const n0 = await loads(page);
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      const d = await root.getDirectoryHandle('undo-folder', { create: true });
      for (const [k, v] of Object.entries(files)) { const w = await (await d.getFileHandle(k, { create: true })).createWritable(); await w.write(v); await w.close(); }
      window.__ud = d;
      window.__APP_TEST_OPEN(d);
    }, files);
    await waitLoads(page, n0);
    ok(await page.evaluate(() => document.getElementById('b-revert').hidden), 'folder: Revert to last saved is not offered');
    const read = (rel) => page.evaluate(async (rel) => (await (await window.__ud.getFileHandle(rel)).getFile()).text(), rel);
    const narr0 = await read('narration.md');
    await editNarration(page, 'フォルダの文。');
    ok((await read('narration.md')).includes('フォルダの文。'), 'folder: the script edit is written to the file');
    await step(page, 'ControlOrMeta+z');
    ok(await read('narration.md') === narr0, 'folder: ⌘Z writes the file back');
  });
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
