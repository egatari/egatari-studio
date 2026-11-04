// 読み方のボタン（台本の欄。backlog #101、設計は handoff/pronounce-design-2026-11-04.md）の試験
//   node tools/test-pronounce.mjs [作業用のフォルダ]
// 1. 読みの道具（kit/core/readings.mjs・narration-core.mjs の narrationWord / applyNarrationReading）：1 つの語か、語の境目、すべてに
// 2. 編集アプリ（日本語）：語を選んで「読み方…」→ 原稿に {x|y}・欄はルビで見せる（{} は見せない）・カーソルと元に戻す・コピー・
//    断る選び方・「この台本のすべてに」（ほかのステップは保存のときに）・「辞書に登録」（このブラウザ。次に選んだときに入る）・
//    読み上げで聞く（端末の声の差し替え）・AI 音声で聞く（TTS の差し替え）
// 3. 編集アプリ（英語）：Pronunciation… で SQL → sequel、英語の声で聞く、空白を含む選び方を断る
import { giveIds } from './portable-fixtures.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkWord, applyReading, findBare, readingIn, splitReadings, joinReadings } from '../kit/core/readings.mjs';
import { narrationWord, applyNarrationReading, parseNarration } from '../kit/core/narration-core.mjs';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-pronounce-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// ---------------------------------------------------------------- 1. 読みの道具
{
  const good = ['θ', 'Q*', 'x′', 'θ̂', 'N₀', 'L殻', 't-SNE', 'SQL', '尤度'], bad = { 'θ を': 'space', 'θとη': 'expr', '1-η': 'expr', 'x=1': 'expr', '、損失': 'expr', '{cue}': 'mark', 'a|b': 'mark', ['あ'.repeat(25)]: 'long', '': 'empty' };
  ok(good.every((w) => checkWord(w).ok), 'checkWord: one word or symbol passes ' + good.join(' '));
  ok(Object.entries(bad).every(([w, why]) => checkWord(w).why === why), 'checkWord: spaces, expressions, marks and long text are refused ' + JSON.stringify(Object.keys(bad).map((w) => [w, checkWord(w).why])));
  ok(JSON.stringify(findBare('MySQL と SQL、{SQL|シークェル}', 'SQL')) === '[[8,11]]', 'findBare: SQL is not matched inside MySQL nor inside a reading');
  ok(applyReading('尤度関数と尤度、θ̂ と θ', '尤度', 'ゆうど').text === '尤度関数と{尤度|ゆうど}、θ̂ と θ' && applyReading('θ̂ と θ', 'θ', 'シータ').text === 'θ̂ と {θ|シータ}', 'applyReading: not inside a longer kanji word or a combining mark');
  ok(readingIn('a {θ|シータ} b', 'θ') === 'シータ' && joinReadings(splitReadings('{cue}a{θ|シータ}{mark:x}')) === '{cue}a{θ|シータ}{mark:x}', 'readingIn / splitReadings round trip ({cue}, {mark} stay text)');
  const md = '# 台本\n## A {#s-a}\n[0] θ を動かします。\n@x-live-poll θ\n<!-- θ -->\n[1] Novice: θ は？ {θ|シータ}\n## B\n[concl] Expert: θ と θ\n';
  const w = narrationWord(md, 'θ', 's-a:0');
  ok(w.count === 3 && w.reading === 'シータ', 'narrationWord: counts bare θ in turn lines only, outside the excepted step ' + JSON.stringify(w));
  const r = applyNarrationReading(md.replace(/\n/g, '\r\n'), 'θ', 'シータ', 's-a:0');
  ok(r.n === 3 && r.text === md.replace('[1] Novice: θ は？', '[1] Novice: {θ|シータ} は？').replace('Expert: θ と θ', 'Expert: {θ|シータ} と {θ|シータ}').replace(/\n/g, '\r\n'), 'applyNarrationReading: writes only turn lines, keeps CRLF, @x- lines and notes ' + JSON.stringify(r.text));
}

// ---------------------------------------------------------------- 2・3. 編集アプリ
const DECK_DIR = path.join(work, 'deck');
fs.rmSync(DECK_DIR, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), DECK_DIR, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
giveIds(DECK_DIR);
// 読みを外した台本（θ はどこにも読みがない）。5 枚目の [1] は英語の発言
const NARR = fs.readFileSync(path.join(DECK_DIR, 'narration.md'), 'utf8').replaceAll('{θ|シータ}', 'θ')
  .replace('[1] 倍率を 0.1 から 0.5 に上げると、損失は速く下がります。', '[1] In SQL, the rate θ is a column.');
const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const q = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, q.endsWith('/') ? q + 'index.html' : q);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((rs) => srv.listen(0, '127.0.0.1', rs));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
// 端末の声（speechSynthesis）の差し替え：読んだ文と声を残す（tools/test-read-aloud.mjs と同じ形）
const SPEECH = `(() => {
  const voices = [{ name: 'Kyoko', lang: 'ja-JP', localService: true }, { name: 'Samantha', lang: 'en-US', localService: true }];
  const R = window.__ra = { spoken: [] };
  class U { constructor(t) { this.text = t; } }
  const synth = { getVoices: () => voices, speak(u) { R.spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang }); setTimeout(() => u.onend && u.onend({ type: 'end' }), 10); }, cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
})();`;
// AI 音声の差し替え（モデルを取りに行かない）：呼ばれた文を残す
const TTS = `window.__ttsCalls = []; window.__APP_TEST.tts = {
  info: (lang) => ({ ok: true, label: 'stub', reason: '' }),
  synth: async ({ lang, text, role, voices }) => { window.__ttsCalls.push({ lang, text, role, voices }); const sr = 24000, pcm = new Float32Array(sr / 2); for (let i = 2400; i < 9600; i++) pcm[i] = 0.3 * Math.sin(i / 8); return { pcm, sr, recipe: { engine: 'stub', model: 'stub', voice: voices, seed: 0 } }; },
};`;

const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function openApp(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
  await ctx.addInitScript(SPEECH);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
  await page.waitForSelector('#drop');
  await page.evaluate(TTS);
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('pr-deck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('pr-deck', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, { 'deck.html': fs.readFileSync(path.join(DECK_DIR, 'deck.html'), 'utf8'), 'narration.md': NARR });
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, lang + ': opened the working folder');
  await page.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
  for (let i = 0; i < 100; i++) { const f = deckFrame(); try { if (f && await f.evaluate(() => !!(window.DECK && DECK.ready))) break; } catch { /* 読み込み中 */ } await page.waitForTimeout(100); }
  const readNarr = () => page.evaluate(async () => (await (await window.__testDir.getFileHandle('narration.md')).getFile()).text());
  const go = async (i, k) => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());   // 欄に入っている間は、引き出しはステップを替えない
    // 保存の後はプレビューを組み直して読み込み直す（遅い CI では、読み込み直しが動かした後に来て 1 枚目に戻ることがある）：位置が合うまで動かし直す
    const at = () => page.evaluate(([i, k]) => { const p = window.__APP_TEST.ui().pos || {}; return p.i === i && p.k === k && !window.__APP_TEST.state().building; }, [i, k]);
    for (let t = 0; ; t++) {
      try { const f = deckFrame(); if (f) await f.evaluate(([i, k]) => { if (window.DECK && DECK.ready) DECK.go(i, k, false); }, [i, k]); } catch { /* 読み込み中 */ }
      await page.waitForTimeout(300);
      if (await at()) { await page.waitForTimeout(500); if (await at()) break; }
      if (t > 150) throw new Error('could not move the preview to ' + i + ',' + k);
    }
    if (!(await page.isVisible('#dev-narr'))) await page.click('#b-narr');
    await page.waitForFunction((key) => window.__APP_TEST.ui().narrKey === key && document.querySelector('#dev-narr .dev-turn .dv-text'), (await page.evaluate(() => window.__APP_TEST.ui().pos.key)));
  };
  // 欄 n の中の、文字 s の m 番目（0 から）の所を選ぶ（DOM の選択）
  const selectText = (s, { n = 0, m = 0, caretAfter = false } = {}) => page.evaluate(([s, n, m, caretAfter]) => {
    const box = document.querySelectorAll('#dev-narr .dv-text')[n], tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.parentElement.closest('.dv-rb') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let t, k = 0;
    while ((t = tw.nextNode())) { let i = -1; while ((i = t.data.indexOf(s, i + 1)) >= 0) { if (k++ === m) { box.focus(); const r = document.createRange(); r.setStart(t, caretAfter ? i + s.length : i); r.setEnd(t, i + s.length); const g = getSelection(); g.removeAllRanges(); g.addRange(r); return true; } } }
    return false;
  }, [s, n, m, caretAfter]);
  const field = (n = 0) => page.evaluate((n) => { const e = document.querySelectorAll('#dev-narr .dv-text')[n]; return { value: e.value, text: e.textContent, shown: e.innerText, rubies: [...e.querySelectorAll('ruby.dv-rb')].map((r) => [r.dataset.x, r.querySelector('rt').textContent]) }; }, n);
  const save = async () => { await page.click('#dev-narr .dv-foot button.dv-pri'); await page.waitForFunction(() => !window.__APP_TEST.ui().narrDirty, null, { timeout: 15000 }); };
  return { ctx, page, errs, go, selectText, field, save, readNarr };
}

try {
  // ---------------------------------------------------------------- 2. 日本語
  {
    const { ctx, page, errs, go, selectText, field, save, readNarr } = await openApp('ja');
    const segs = parseNarration(NARR);
    await go(1, 1);   // 何を最小化するか [1]：学習とは、損失を小さくするパラメータ θ を探すことです。
    ok((await page.textContent('#dev-pron-btn')) === '読み方…', 'ja: the script drawer has 「読み方…」');
    // 断る選び方
    await selectText('θ を');
    await page.click('#dev-pron-btn');
    ok(!(await page.$('#dev-pron')) && (await page.textContent('#dev-pron-why')) === '空白を含まない 1 つの語か記号を選んでください', 'bad selection: a selection with a space is refused with what to do');
    await selectText('、損失');
    await page.click('#dev-pron-btn');
    ok(!(await page.$('#dev-pron')) && /1 つの語か記号だけを選んでください/.test(await page.textContent('#dev-pron-why')), 'bad selection: punctuation (not one word) is refused');
    // 語を選んで読み方を付ける
    await selectText('θ');
    await page.click('#dev-pron-btn');
    await page.waitForSelector('#dev-pron');
    ok((await page.textContent('#dev-pron .dv-pt')) === '「θ」の読み方' && !(await page.textContent('#dev-pron-why')), 'ja: the pronunciation field opens for 「θ」');
    await page.waitForFunction(() => /ほかに 3 か所/.test(document.querySelector('#dev-pron').textContent));
    ok(true, 'ja: 「この台本のすべてに（ほかに 3 か所）」 counts the other steps');
    if (process.env.PRON_SHOTS) await page.screenshot({ path: path.join(process.env.PRON_SHOTS, 'field.png') });
    await page.fill('#dev-pron-y', 'シータ');
    // 聞く（端末の声・AI 音声）
    await page.click('#dev-pron-device');
    await page.waitForFunction(() => window.__ra.spoken.length > 0);
    const sp = await page.evaluate(() => window.__ra.spoken.slice());
    ok(sp.length === 1 && sp[0].text === 'シータ' && sp[0].voice === 'Kyoko', 'listen: 「読み上げで聞く」 reads only the reading with the device voice ' + JSON.stringify(sp));
    await page.click('#dev-pron-ai');
    await page.waitForFunction(() => window.__ttsCalls.length > 0);
    await page.waitForFunction(() => !document.getElementById('dev-pron-ai').disabled);
    const tc = await page.evaluate(() => window.__ttsCalls.slice());
    ok(tc.length === 1 && tc[0].text === 'シータ' && tc[0].lang === 'ja' && tc[0].voices.expert === 'bob' && !(await page.textContent('#dev-pron-msg')), 'listen: 「AI 音声で聞く」 makes AI voice for the reading only ' + JSON.stringify(tc));
    await page.click('#dev-pron-apply');
    await page.waitForSelector('#dev-pron', { state: 'detached' });
    let f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。', 'source: the field holds {θ|シータ} ' + f.value);
    ok(JSON.stringify(f.rubies) === '[["θ","シータ"]]' && !/[{}|]/.test(f.shown) && /パラメータ θ\s*シータ|パラメータ シータ\s*θ|θ/.test(f.shown), 'ruby: the reading is shown over the word and no {} is shown ' + JSON.stringify(f.shown));
    const geo = await page.evaluate(() => { const r = document.querySelector('#dev-narr .dv-rb'), rt = r.querySelector('rt'); const a = r.getBoundingClientRect(), b = rt.getBoundingClientRect(); return { above: b.bottom <= a.top + a.height * 0.6, small: parseFloat(getComputedStyle(rt).fontSize) < parseFloat(getComputedStyle(r).fontSize) }; });
    ok(geo.above && geo.small, 'ruby: the reading sits small above the word ' + JSON.stringify(geo));
    if (process.env.PRON_SHOTS) await page.screenshot({ path: path.join(process.env.PRON_SHOTS, 'ruby.png') });
    // カーソル：かたまりの前から → で 1 つ進むと、かたまりの後ろ
    await selectText('パラメータ ', { caretAfter: true });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('X');
    f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ {θ|シータ}X を探すことです。', 'caret: → moves over the word with its reading as one unit ' + f.value);
    // 元に戻す：打った字 → 読み方 → やり直し
    await page.keyboard.press('ControlOrMeta+z');
    f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。', 'undo: removes the typed character ' + f.value);
    await page.keyboard.press('ControlOrMeta+z');
    f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ θ を探すことです。' && !f.rubies.length, 'undo: removes the pronunciation ' + f.value);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。' && f.rubies.length === 1, 'redo: puts the pronunciation back ' + f.value);
    // コピー：原稿の文字列（{x|y}）
    const copied = await page.evaluate(() => {
      const box = document.querySelector('#dev-narr .dv-text'); box.focus();
      const r = document.createRange(); r.selectNodeContents(box); const g = getSelection(); g.removeAllRanges(); g.addRange(r);
      const e = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }); box.dispatchEvent(e);
      return e.clipboardData.getData('text/plain');
    });
    ok(copied === '学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。', 'copy: copies the source text with {θ|シータ} ' + copied);
    // Backspace はかたまりごと消す（元に戻せる）
    await selectText(' を探す', { caretAfter: false });
    await page.evaluate(() => { const g = getSelection(); g.collapseToStart(); });
    await page.keyboard.press('Backspace');
    f = await field();
    ok(f.value === '学習とは、損失を小さくするパラメータ  を探すことです。', 'Backspace: deletes the word with its reading as one unit ' + JSON.stringify(f.value));
    await page.keyboard.press('ControlOrMeta+z');
    ok((await field()).value === '学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。', 'undo: brings the word back after Backspace');
    await save();
    let md = await readNarr();
    ok(md.includes('[1] 学習とは、損失を小さくするパラメータ {θ|シータ} を探すことです。') && (md.match(/\{θ\|シータ\}/g) || []).length === 1, 'save: narration.md has {θ|シータ} only in this step');
    // この台本のすべてに：二次関数で確かめる [1]。読み方はほかの所と同じものが入る
    await go(3, 1);
    await selectText('θ');
    await page.click('#dev-pron-btn');
    await page.waitForSelector('#dev-pron');
    await page.waitForFunction(() => document.getElementById('dev-pron-y').value === 'シータ' && /ほかに 2 か所/.test(document.querySelector('#dev-pron').textContent));
    ok((await page.textContent('#dev-pron-from')) === '同じ台本のほかの所と同じ読み方を入れました', 'all: the reading used elsewhere is filled in, and it says so');
    await page.check('#dev-pron-all');
    await page.click('#dev-pron-apply');
    ok(/保存すると、ほかのステップの 2 か所にも読み方を付けます/.test(await page.textContent('#dev-narr .dv-foot .dv-st')), 'all: the status says the other steps get it on save');
    await save();
    await page.waitForFunction(() => /ほかのステップの 2 か所にも読み方を付けました/.test(document.querySelector('#dev-narr .dv-foot .dv-st').textContent), null, { timeout: 15000 });
    md = await readNarr();
    const segs2 = parseNarration(md);
    const thetas = segs2.flatMap((s) => s.turns.map((t) => t.raw)).filter((t) => t.includes('θ'));
    ok(thetas.filter((t) => t.includes('In SQL')).every((t) => t.includes('{θ|シータ}')) && thetas.every((t) => !/(^|[^{])θ(?!\|)/.test(t)) && segs2.length === segs.length, 'all: every θ in the script has the reading after save ' + JSON.stringify(thetas));
    ok(fs.existsSync(DECK_DIR) && (await page.evaluate(async () => { try { const d = await (await window.__testDir.getDirectoryHandle('.cache')).getDirectoryHandle('edits'); let n = 0; for await (const _ of d.keys()) n++; return n; } catch { return 0; } })) > 0, 'all: a backup is kept in .cache/edits/');
    // 辞書に登録：何を最小化するか [3] の「傾き」。保存しないで戻し、[concl] の「傾き」で辞書の読み方が入る
    await go(1, 3);
    await selectText('傾き');
    await page.click('#dev-pron-btn');
    await page.waitForSelector('#dev-pron');
    ok(!(await page.isChecked('#dev-pron-dict')) && (await page.textContent('#dev-pron')).includes('このブラウザに覚えます'), 'dictionary: 「辞書に登録」 is off for a new word and says where it is kept');
    await page.fill('#dev-pron-y', 'かたむき');
    await page.check('#dev-pron-dict');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#dev-pron', { state: 'detached' });
    const dict = await page.evaluate(() => JSON.parse(localStorage.getItem('egatari.pronunciations.v1')));
    ok(dict && dict.ja && dict.ja['傾き'] === 'かたむき', 'dictionary: the pair is kept in this browser ' + JSON.stringify(dict));
    await page.click('#dev-narr .dv-foot button:not(.dv-pri)');   // キャンセル（保存しない）
    await page.waitForFunction(() => !window.__APP_TEST.ui().narrDirty);
    await go(1, 4);   // [concl]
    await selectText('傾き');
    await page.click('#dev-pron-btn');
    await page.waitForSelector('#dev-pron');
    await page.waitForTimeout(300);
    ok((await page.inputValue('#dev-pron-y')) === 'かたむき' && (await page.textContent('#dev-pron-from')) === '辞書の読み方を入れました' && await page.isChecked('#dev-pron-dict'), 'dictionary: selecting the word again fills in the reading from the dictionary, and says so');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#dev-pron', { state: 'detached' });
    ok(!(await page.evaluate(() => window.__APP_TEST.ui().narrDirty)), 'Esc: closes the pronunciation field without changing the script');
    // 読みの付いた語を押すと直せる・外せる
    await go(3, 1);
    await page.click('#dev-narr .dv-text ruby.dv-rb');
    await page.waitForSelector('#dev-pron-remove');
    ok((await page.inputValue('#dev-pron-y')) === 'シータ', 'edit: clicking a word with a reading opens it with the reading');
    await page.click('#dev-pron-remove');
    ok(!(await field()).value.includes('{θ|') && (await field()).value.includes('θ'), 'edit: 「読み方を外す」 leaves the plain word');
    await page.click('#dev-narr .dv-foot button:not(.dv-pri)');
    ok(!errs.length, 'ja: no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  // ---------------------------------------------------------------- 3. 英語
  {
    const { ctx, page, errs, go, selectText, field, save, readNarr } = await openApp('en');
    await go(4, 1);   // In SQL, the rate θ is a column.
    ok((await page.textContent('#dev-pron-btn')) === 'Pronunciation…', 'en: the script drawer has “Pronunciation…”');
    await selectText('In SQL');
    await page.click('#dev-pron-btn');
    ok(!(await page.$('#dev-pron')) && (await page.textContent('#dev-pron-why')) === 'Select one word or symbol without spaces', 'en: a selection of two words is refused');
    await selectText('SQ');   // カーソルを語の中に置くだけ（選ばない）→ その語
    await page.evaluate(() => getSelection().collapseToEnd());
    await page.click('#dev-pron-btn');
    await page.waitForSelector('#dev-pron');
    ok((await page.textContent('#dev-pron .dv-pt')) === 'Pronunciation of “SQL”', 'en: with only a caret, the word at the caret is used (SQL)');
    await page.fill('#dev-pron-y', 'sequel');
    await page.click('#dev-pron-device');
    await page.waitForFunction(() => window.__ra.spoken.length > 0);
    const sp = await page.evaluate(() => window.__ra.spoken.slice());
    ok(sp[0].text === 'sequel' && sp[0].voice === 'Samantha', 'en: listens with an English device voice ' + JSON.stringify(sp));
    await page.click('#dev-pron-apply');
    ok((await field()).value === 'In {SQL|sequel}, the rate θ is a column.', 'en: the source has {SQL|sequel}');
    await save();
    ok((await readNarr()).includes('[1] In {SQL|sequel}, the rate θ is a column.'), 'en: saved to narration.md');
    const dict = await page.evaluate(() => localStorage.getItem('egatari.pronunciations.v1'));
    ok(dict === null, 'en: nothing is added to the dictionary unless asked');
    ok(!errs.length, 'en: no page errors ' + errs.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
