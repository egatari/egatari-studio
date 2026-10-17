// 開発サーバー（server/dev.mjs・server/shell.js・server/editor-ui.js・server/hints.js）の確認
//   node tools/test-dev-server.mjs <作業用のフォルダ> [--shots 画像のフォルダ]
// examples/minimal を作業用のフォルダに写してから動かす（見本そのものは書き換えない）。narration.md は CRLF にして、
// 書き戻しが元の改行のままかを確かめる。「学習率と収束」のスライドには id を付け、その節を除いておく（新しい節の見出し {#id}）
// 最後に、書き込みを試みる部品とスクリプトの入ったデッキ（tools/hostile-deck.mjs）で、プレビューから何も書けないことを確かめる
import os from 'node:os';
import { launch } from '../kit/browser.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNarration } from '../kit/narration.mjs';
import { writeHostileDeck, PWNED } from './hostile-deck.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || path.join(os.tmpdir(), 'motion-devtest'));
const deckDir = path.join(work, 'deck');
fs.rmSync(deckDir, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.cpSync(path.join(ROOT, 'examples/minimal'), deckDir, { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
const DECK = path.join(deckDir, 'deck.html'), NARR = path.join(deckDir, 'narration.md');
// 「学習率と収束」に id="lr" を付ける（新しい節の見出しが「## 学習率と収束 {#lr}」になる）
const deck0 = fs.readFileSync(DECK, 'utf8');
const lrAt = deck0.indexOf('<h2>学習率と収束</h2>');
const secAt = deck0.lastIndexOf('<section class="slide"', lrAt);
if (lrAt < 0 || secAt < 0) throw new Error('could not find the slide 学習率と収束');
fs.writeFileSync(DECK, deck0.slice(0, secAt) + '<section class="slide" id="lr"' + deck0.slice(secAt + '<section class="slide"'.length));
// 「学習率と収束」の節を除き（節がないスライドへの挿入を試すため）、改行を CRLF にする
fs.writeFileSync(NARR, fs.readFileSync(NARR, 'utf8').replace(/\r\n/g, '\n').replace(/## 学習率と収束\n[\s\S]*?\n\n(?=## まとめ)/, '').replace(/\n/g, '\r\n'));
const narr0 = fs.readFileSync(NARR, 'utf8');
if (narr0.includes('## 学習率と収束')) throw new Error('could not strip a section from narration.md');
const EOL = '\r\n', nl = (s) => s.replace(/\n/g, EOL);
const mixedEol = (s) => /(^|[^\r])\n/.test(s);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// サーバーを空いている番号で起動する
function start(deck) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), deck, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const st = { srv, log: '' };
  srv.stderr.on('data', (d) => { st.log += d; });
  st.base = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start\n' + st.log)), 15000);
    srv.stdout.on('data', (d) => { st.log += d; const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
  });
  return st;
}
const S1 = start(DECK);
const base = await S1.base;
console.log('server', base);
// 生の HTTP（Host・Origin を自由に付ける。壊れた URL もそのまま送る）
const rawAt = (b, pathname, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const u = new URL(b);
  const r = http.request({ host: '127.0.0.1', port: u.port, method, path: pathname, headers: { host: u.host, ...headers } }, (resp) => {
    let d = ''; resp.on('data', (c) => { d += c; }); resp.on('end', () => res({ status: resp.statusCode, body: d, headers: resp.headers }));
  });
  r.on('error', rej); if (body) r.write(body); r.end();
});
const raw = (p, o) => rawAt(base, p, o);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
const page = await ctx.newPage();
const errs = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(tag + ' pageerror: ' + e.message));
  // 衝突の確認で意図して起こす 409 は数えない
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
};
watch(page, 'shell');
const shot = async (name, p = page) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };
const deckOf = (p) => p.frames().find((f) => f.parentFrame() === p.mainFrame());
const dk = () => deckOf(page);
// デッキの iframe の準備ができるまで待つ（外枠が位置を戻す時間も少し）
async function ready(p = page) {
  await p.waitForFunction(() => window.__DEV_LOADS > 0, null, { timeout: 15000 });
  for (let i = 0; i < 200; i++) {
    const f = deckOf(p);
    try { if (f && await f.evaluate(() => !!(window.DECK && DECK.ready))) { await p.waitForTimeout(150); return f; } } catch { /* 読み込み中 */ }
    await p.waitForTimeout(75);
  }
  throw new Error('deck frame not ready');
}
const loads = (p = page) => p.evaluate(() => window.__DEV_LOADS);
async function reloaded(n, p = page) { await p.waitForFunction((n) => window.__DEV_LOADS > n, n, { timeout: 15000 }); return ready(p); }
const deckKey = async (k, p = page) => { await deckOf(p).locator('body').press(k); await p.waitForTimeout(120); };

try {
  await page.goto(base); await ready();
  const TOKEN = await page.evaluate(() => JSON.parse(document.getElementById('dev-cfg').textContent).token);
  ok(/^[0-9a-f]{48}$/.test(TOKEN || ''), 'token is in the shell page');
  ok(await dk().evaluate(() => typeof window.__DECK_DEV_TOKEN) === 'undefined' && !(await dk().content()).includes(TOKEN), 'token is absent from the deck document');
  const deckDoc = await raw('/deck/');
  ok(deckDoc.status === 200 && !deckDoc.body.includes(TOKEN) && /connect-src 'none'/.test(deckDoc.headers['content-security-policy'] || ''), 'GET /deck/: no token, CSP with connect-src \'none\'');
  ok(await dk().evaluate(() => { try { return window.parent.document && 'reachable'; } catch { return 'blocked'; } }) === 'blocked', 'sandbox: the deck cannot reach the shell document (opaque origin)');
  const TH = { 'x-deck-token': TOKEN };

  // ---- 1. 原稿の編集：更新の式（スライド 3）の段階 2 の <li>（デッキの e とダブルクリックは知らせ。欄は外枠に出る）
  await dk().evaluate(() => DECK.go(2, 3, false));
  await deckKey('e');
  await dk().waitForFunction(() => document.documentElement.classList.contains('dev-edit'));
  ok(await page.isVisible('#dev-badge'), 'edit mode: badge shown in the shell');
  const li = dk().locator('#stage .slide.active li[data-step="2"]');
  const before = { range: await li.getAttribute('data-src'), h: await li.getAttribute('data-src-h') };
  await li.hover();
  await shot('1-edit-mode.png');
  await li.dblclick();
  const ta = page.locator('#dev-editor textarea');
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  ok((await ta.inputValue()).includes('学習率'), 'editor (in the shell) shows raw source with TeX: ' + JSON.stringify(await ta.inputValue()));
  ok(await page.evaluate(() => !!(document.activeElement && document.activeElement.matches('#dev-editor textarea'))), 'the shell editor takes the focus');
  await ta.fill('\\(\\eta>0\\)：<b>学習率</b>（編集済み）');
  await shot('2-editor.png');
  let n = await loads();
  await ta.press('Meta+Enter');
  await reloaded(n);
  await page.waitForTimeout(300);
  const src1 = fs.readFileSync(DECK, 'utf8');
  ok(src1.includes('<li data-step="2">\\(\\eta>0\\)：<b>学習率</b>（編集済み）</li>'), 'deck.html changed');
  const st = await dk().evaluate(() => DECK.state());
  ok(st.slide === 3 && st.step === 3, `reloaded at same position (slide ${st.slide}, step ${st.step})`);
  ok(await dk().evaluate(() => document.documentElement.classList.contains('dev-edit')), 'edit mode survives reload');
  ok(!(await page.$('#dev-editor')), 'editor card closed after saving');
  ok(fs.readdirSync(path.join(deckDir, '.cache/edits')).length >= 1, 'backup written to .cache/edits');

  // ---- 2. 古い原稿からの編集は 409
  const r409r = await page.request.post(base + '__dev/edit', { data: { ...before, text: 'x' }, headers: TH }); const r409 = [r409r.status(), (await r409r.json()).error];
  ok(r409[0] === 409 && /原稿が変わっています/.test(r409[1]), 'stale hash -> 409 ' + JSON.stringify(r409));
  ok(fs.readFileSync(DECK, 'utf8') === src1, 'file untouched after 409');
  // 画面でも分かるか：要素の hash を古くしてから開く（外枠が今の原稿を読み、知らせの hash と比べる）
  await dk().evaluate(() => document.querySelector('#stage .slide.active li[data-step="3"]').setAttribute('data-src-h', 'deadbeef'));
  await dk().locator('#stage .slide.active li[data-step="3"]').dblclick();
  await page.waitForSelector('#dev-editor .dev-msg.dv-err');
  await shot('3-conflict.png');
  ok(/原稿が変わっています/.test(await page.locator('#dev-editor .dev-msg').textContent()) && await page.isDisabled('#dev-editor button.dv-pri'), 'stale element: conflict shown in the editor, Save disabled');
  await page.locator('#dev-editor textarea').press('Escape');
  // 書きかけのあいだに外で原稿が変わった → 保存は 409、入力は残る
  await dk().locator('#stage .slide.active li[data-step="3"]').dblclick();
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  await page.locator('#dev-editor textarea').fill('書きかけ');
  n = await loads();
  const ext0 = fs.readFileSync(DECK, 'utf8').replace('<h2>更新の式</h2>', '<h2>更新の式（外で）</h2>');
  fs.writeFileSync(DECK, ext0);
  await reloaded(n);
  ok((await page.locator('#dev-editor textarea').inputValue()) === '書きかけ', 'outside change: the open editor with unsaved input survives the reload');
  await page.locator('#dev-editor textarea').press('Meta+Enter');
  await page.waitForSelector('#dev-editor .dev-msg.dv-err');
  ok(/原稿が変わっています/.test(await page.locator('#dev-editor .dev-msg').textContent()) && fs.readFileSync(DECK, 'utf8') === ext0, 'outside change: save -> 409 shown, file untouched');
  await page.locator('#dev-editor textarea').press('Escape');
  n = await loads();
  fs.writeFileSync(DECK, src1);
  await reloaded(n);

  // ---- 3. 口述原稿：更新の式の段階 2 を対話に書き換える
  await dk().evaluate(() => DECK.go(2, 2, false));
  await deckKey('e');   // 編集モードを切る（引き出しは編集モードと独立）
  ok(!(await page.isVisible('#dev-badge')) && !(await dk().evaluate(() => document.documentElement.classList.contains('dev-edit'))), 'e again: edit mode off (badge hidden, no outlines)');
  await deckKey('n');
  await page.waitForSelector('#dev-narr .dev-turn textarea');
  const t0 = page.locator('#dev-narr .dev-turn textarea').first();
  ok((await t0.inputValue()) === '{mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。', 'drawer (in the shell) shows raw narration');
  await t0.fill('η は、1 歩の{cue}大きさです。{φ|ファイ} とは違います。');
  await page.locator('#dev-narr button', { hasText: '発言を足す' }).click();
  await page.locator('#dev-narr .dev-turn textarea').nth(1).fill('大きさ、ですか。');
  await shot('4-narration.png');
  n = await loads();
  await page.locator('#dev-narr .dev-turn textarea').nth(1).press('Meta+Enter');
  await reloaded(n); await page.waitForTimeout(400);
  const narr1 = fs.readFileSync(NARR, 'utf8');
  const exp1 = narr0.replace('[2] {mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。', nl('[2] Expert: η は、1 歩の{cue}大きさです。{φ|ファイ} とは違います。\n    Novice: 大きさ、ですか。'));
  ok(narr1 === exp1, 'narration.md: only that block changed (turn added)');
  if (narr1 !== exp1) console.log(JSON.stringify(narr1));
  ok(!mixedEol(narr1), 'narration.md keeps CRLF line endings');
  const seg = parseNarration(narr1).find((s) => s.slideKey === '更新の式' && s.stepKey === '2');
  ok(seg && seg.turns.length === 2 && seg.turns[1].role === 'novice' && seg.turns[0].raw.includes('{cue}'), 'parsed back as 2 turns');
  ok(await page.isVisible('#dev-narr'), 'drawer stays open after reload');
  ok(/1 歩の/.test(await page.locator('#dev-narr .dev-turn textarea').first().inputValue()), 'drawer shows saved text');
  ok(await dk().evaluate(() => DECK.NARRATION['更新の式']['2'][0].text.includes('φ とは')), 'DECK.NARRATION shows display text');

  // 挿入：節がまだない「学習率と収束」（id="lr"）の段階、既存の節の途中の段階（外枠と同じ問い合わせを直接）
  const getN = async (key) => (await page.request.get(base + '__dev/narration?key=' + encodeURIComponent(key), { headers: TH })).json();
  const post = async (b) => {
    const rev = (await getN(b.slideKey + ':' + b.stepKey)).rev;
    return (await page.request.post(base + '__dev/narration', { data: { rev, ...b }, headers: TH })).json();
  };
  await post({ slideKey: 'lr', stepKey: '1', turns: [{ role: 'expert', text: '倍率を上げると速く下がります。' }] });
  await post({ slideKey: 'lr', stepKey: '0', turns: [{ role: 'expert', text: '学習率を変えます。' }] });
  await post({ slideKey: 'lr', stepKey: 'concl', turns: [{ role: 'expert', text: '2 未満なら収束します。' }] });
  const narr2 = fs.readFileSync(NARR, 'utf8');
  ok(narr2.includes(nl('## 学習率と収束 {#lr}\n[0] 学習率を変えます。\n[1] 倍率を上げると速く下がります。\n[concl] 2 未満なら収束します。\n\n## まとめ')), 'new section for a slide with an id: "## heading {#id}", inserted in slide order, steps ordered');
  if (!narr2.includes('{#lr}')) console.log(JSON.stringify(narr2));
  ok(!mixedEol(narr2), 'narration.md keeps CRLF after inserting a section');
  ok(narr2.replace(/## 学習率と収束 \{#lr\}\r?\n[\s\S]*?\r?\n\r?\n(?=## まとめ)/, '') === narr1, 'rest of narration.md untouched');
  await post({ slideKey: 'lr', stepKey: '0', turns: [] });
  ok(!fs.readFileSync(NARR, 'utf8').includes('学習率を変えます'), 'empty turns remove the block');
  const gr = await getN('更新の式:2');
  ok(gr.turns.length === 2 && gr.turns[0].text.includes('{φ|ファイ}') && /^[0-9a-f]{8}$/.test(gr.rev), 'GET /__dev/narration returns raw text + rev');
  // 古い版からの保存は 409・版なしは 400・デッキにないスライドは 400
  const narrBefore = fs.readFileSync(NARR, 'utf8');
  const sv = await page.request.post(base + '__dev/narration', { data: { slideKey: '更新の式', stepKey: '2', turns: [{ role: 'expert', text: 'x' }], rev: 'deadbeef' }, headers: TH });
  const sv2 = await page.request.post(base + '__dev/narration', { data: { slideKey: '更新の式', stepKey: '2', turns: [{ role: 'expert', text: 'x' }] }, headers: TH });
  const sv3 = await page.request.post(base + '__dev/narration', { data: { slideKey: 'no-such-slide', stepKey: '0', turns: [{ role: 'expert', text: 'x' }], rev: (await getN('no-such-slide:0')).rev }, headers: TH });
  ok(sv.status() === 409 && sv2.status() === 400 && sv3.status() === 400 && fs.readFileSync(NARR, 'utf8') === narrBefore, `narration stale rev -> 409, no rev -> 400, unknown slide -> 400 (${sv.status()}, ${sv2.status()}, ${sv3.status()})`);
  await page.waitForTimeout(600); await ready();
  // 画面でも分かるか：引き出しで書きかけのあいだに、外から同じ段階を直す
  await dk().evaluate(() => DECK.go(2, 2, false));
  if (!(await page.isVisible('#dev-narr'))) await deckKey('n');
  await page.waitForFunction(() => { const t = document.querySelector('#dev-narr .dev-turn textarea'); return t && t.value.includes('1 歩の'); });
  await page.locator('#dev-narr .dev-turn textarea').first().fill('書きかけの下書き');
  const extNarr = fs.readFileSync(NARR, 'utf8').replace('大きさ、ですか。', '大きさ、ですね。');
  n = await loads();
  fs.writeFileSync(NARR, extNarr);
  await reloaded(n);
  ok((await page.locator('#dev-narr .dev-turn textarea').first().inputValue()) === '書きかけの下書き', 'drawer keeps unsaved input across the reload');
  await page.locator('#dev-narr .dev-turn textarea').first().press('Meta+Enter');
  await page.waitForSelector('#dev-narr .dev-msg.dv-err');
  await shot('4b-narration-conflict.png');
  ok(/口述原稿が変わっています/.test(await page.locator('#dev-narr .dev-msg').textContent()) && fs.readFileSync(NARR, 'utf8') === extNarr, 'narration conflict shown in drawer, file untouched');
  n = await loads();
  await page.locator('#dev-narr .dev-msg button', { hasText: '再読み込み' }).click();
  await reloaded(n); await page.waitForTimeout(300);
  await page.waitForFunction(() => { const t = document.querySelector('#dev-narr .dev-turn textarea'); return t && t.value.includes('1 歩の'); });
  ok((await page.locator('#dev-narr .dev-turn').count()) === 2 && (await page.locator('#dev-narr .dev-turn textarea').nth(1).inputValue()) === '大きさ、ですね。', 'reload after the conflict shows the current narration');

  // ---- 4. Claude への指示（Alt+クリック）とコメントの一覧
  await dk().evaluate(() => DECK.go(1, 4, false));
  await page.waitForTimeout(200);
  if (await page.isVisible('#dev-narr')) await deckKey('n');
  const tgt = dk().locator('#stage .slide.active .body > ul > li').nth(1);
  await tgt.click({ modifiers: ['Alt'] });
  await page.waitForSelector('#dev-comment textarea');
  await page.locator('#dev-comment textarea').fill('「今いる点の傾き」を色付きのまま、もっと短く');
  await shot('5-comment-box.png');
  await page.locator('#dev-comment textarea').press('Meta+Enter');
  await page.waitForTimeout(300);
  const cm = JSON.parse(fs.readFileSync(path.join(deckDir, 'comments.json'), 'utf8'));
  ok(cm.length === 1 && cm[0].key === '何を最小化するか:concl' && cm[0].status === 'open' && /次元/.test(cm[0].quote) && cm[0].range, 'comments.json entry ' + JSON.stringify(cm[0]));
  await dk().evaluate(() => DECK.go(0, 0, false));
  await deckKey('c');
  await page.waitForSelector('#dev-comments .dev-c');
  await shot('6-comments.png');
  await page.locator('#dev-comments .dev-c').first().click();
  await page.waitForTimeout(200);
  ok((await dk().evaluate(() => DECK.state().key)) === '何を最小化するか:concl', 'click comment jumps to slide');
  await page.locator('#dev-comments .dev-c button', { hasText: '解決' }).click();
  await page.waitForSelector('#dev-comments .dev-empty');
  ok(JSON.parse(fs.readFileSync(path.join(deckDir, 'comments.json'), 'utf8'))[0].status === 'resolved', 'resolve marks comment');
  await deckKey('c');

  // ---- 5. 外から原稿を直したとき（エディタで保存したとき）も読み込み直す・組み立ての失敗
  await dk().evaluate(() => DECK.go(2, 1, false));
  await page.waitForTimeout(150);
  n = await loads();
  fs.writeFileSync(DECK, fs.readFileSync(DECK, 'utf8').replace('今の点 \\(\\theta_t\\) から', '今の点 \\(\\theta_t\\) からは'));
  await reloaded(n); await page.waitForTimeout(200);
  const st3 = await dk().evaluate(() => DECK.state());
  ok(st3.slide === 3 && st3.step === 1 && (await dk().content()).includes('からは'), 'external change -> reload at same position');
  const goodSrc = fs.readFileSync(DECK, 'utf8');
  n = await loads();
  fs.writeFileSync(DECK, goodSrc.replace('<head>', '<hea>').replace('</head>', ''));
  await page.waitForFunction((n) => window.__DEV_LOADS > n, n); await page.waitForTimeout(300);
  ok(/組み立てられませんでした/.test(await dk().content()), 'build error -> error page in the preview');
  n = await loads();
  fs.writeFileSync(DECK, goodSrc);
  await reloaded(n);
  ok(true, 'recovered from build error');

  // ---- 6. 守り（Host・Origin・合言葉・Content-Type・壊れた URL・symlink・ドットファイル）
  const port = new URL(base).port;
  const J = { 'content-type': 'application/json' };
  const sec = {
    wrongHost: (await raw('/', { headers: { host: 'evil.example:' + port } })).status,
    wrongHostDeck: (await raw('/deck/narration.md', { headers: { host: 'evil.example' } })).status,
    localhost: (await raw('/', { headers: { host: 'localhost:' + port } })).status,
    noToken: (await raw('/__dev/comment', { method: 'POST', headers: J, body: '{"comment":"x"}' })).status,
    badToken: (await raw('/__dev/edit', { method: 'POST', headers: { ...J, 'x-deck-token': 'nope' }, body: '{}' })).status,
    textPlain: (await raw('/__dev/comment', { method: 'POST', headers: { ...TH, 'content-type': 'text/plain' }, body: '{"comment":"x"}' })).status,
    crossOrigin: (await raw('/__dev/comment/resolve', { method: 'POST', headers: { ...TH, ...J, origin: 'http://evil.example' }, body: '{"id":"none"}' })).status,
    nullOrigin: (await raw('/__dev/comment/resolve', { method: 'POST', headers: { ...TH, ...J, origin: 'null' }, body: '{"id":"none"}' })).status,
    nullOriginGet: (await raw('/__dev/comments', { headers: { ...TH, origin: 'null' } })).status,
    crossSite: (await raw('/__dev/comments', { headers: { ...TH, 'sec-fetch-site': 'cross-site' } })).status,
    sameOrigin: (await raw('/__dev/comment/resolve', { method: 'POST', headers: { ...TH, ...J, origin: 'http://localhost:' + port, 'sec-fetch-site': 'same-origin' }, body: '{"id":"none"}' })).status,
    sourceNoToken: (await raw('/__dev/source?range=0-10')).status,
    narrNoToken: (await raw('/__dev/narration?key=x:0')).status,
    infoNoToken: (await raw('/__dev/info')).status,
    eventsNoToken: (await raw('/__dev/events')).status,
    shellJs: (await raw('/__dev/shell.js')).status, uiJs: (await raw('/__dev/editor-ui.js')).status,
  };
  ok(sec.wrongHost === 403 && sec.wrongHostDeck === 403 && sec.localhost === 200, 'Host check ' + JSON.stringify(sec));
  ok(sec.noToken === 403 && sec.badToken === 403 && sec.sourceNoToken === 403 && sec.narrNoToken === 403 && sec.infoNoToken === 403 && sec.eventsNoToken === 403, 'token required for /__dev/');
  ok(sec.textPlain === 415, 'text/plain POST -> 415');
  ok(sec.crossOrigin === 403 && sec.sameOrigin === 404, 'cross Origin -> 403, same Origin passes');
  ok(sec.nullOrigin === 403 && sec.nullOriginGet === 403 && sec.crossSite === 403, 'Origin: null (sandboxed deck) and Sec-Fetch-Site: cross-site -> 403 even with the token');
  ok(sec.shellJs === 200 && sec.uiJs === 200, 'shell scripts served without the token (they hold no secret)');
  const shellRes = await raw('/');
  ok(/frame-ancestors 'none'/.test(shellRes.headers['content-security-policy'] || '') && shellRes.headers['x-frame-options'] === 'DENY', 'shell page cannot be framed');
  const bad = [(await raw('/%ZZ')).status, (await raw('/deck/%E0%A4%A')).status];
  ok(bad[0] === 400 && bad[1] === 400 && (await raw('/')).status === 200, 'malformed URL -> 400, server alive ' + bad);
  fs.writeFileSync(path.join(work, 'secret.txt'), 'secret');
  fs.rmSync(path.join(deckDir, 'leak.txt'), { force: true }); fs.rmSync(path.join(deckDir, 'leakdir'), { force: true });
  fs.symlinkSync(path.join(work, 'secret.txt'), path.join(deckDir, 'leak.txt'));
  fs.symlinkSync(work, path.join(deckDir, 'leakdir'));
  fs.writeFileSync(path.join(deckDir, '.env'), 'X=1');
  fs.mkdirSync(path.join(deckDir, 'audio'), { recursive: true }); fs.writeFileSync(path.join(deckDir, 'audio', 's1.wav'), 'RIFF');
  const edit0 = fs.readdirSync(path.join(deckDir, '.cache/edits'))[0];
  const st6 = {
    leak: (await raw('/deck/leak.txt')).status, leakdir: (await raw('/deck/leakdir/secret.txt')).status,
    cache: (await raw('/deck/.cache/edits/' + encodeURIComponent(edit0))).status, env: (await raw('/deck/.env')).status,
    encDot: (await raw('/deck/%2e%2e/secret.txt')).status, audio: (await raw('/deck/audio/s1.wav')).status,
  };
  ok(st6.leak === 403 && st6.leakdir === 403, 'symlink escaping deck dir -> 403 ' + JSON.stringify(st6));
  ok(st6.cache === 403 && st6.env === 403 && (st6.encDot === 403 || st6.encDot === 404), 'dotfiles / .cache -> 403, encoded .. not served');
  ok(st6.audio === 200, '/deck/audio/ still served');

  // ---- 7. 静的ファイル・ほかの表示
  const r404 = [(await page.request.get(base + 'deck/narration.md')).status(), (await page.request.get(base + 'deck/..%2F..%2Fetc%2Fpasswd')).status()];
  ok(r404[0] === 200 && r404[1] === 403, '/deck/ static + no traversal ' + r404);
  await page.goto(base + '?mode=lecture#3'); await ready();
  ok((await dk().evaluate(() => DECK.mode)) === 'lecture' && (await dk().evaluate(() => DECK.state().slide)) === 3, '?mode=lecture#3 is passed to the deck');
  // 発表者ビュー：デッキの p → 外枠が窓を開く（その中のデッキも sandbox）。→ で本体が進む
  const [pop] = await Promise.all([ctx.waitForEvent('page'), deckKey('p')]);
  watch(pop, 'presenter');
  let pv = null;
  for (let i = 0; i < 150 && !pv; i++) { const x = deckOf(pop); try { if (x && await x.evaluate(() => !!document.getElementById('pv'))) pv = x; } catch { /* 読み込み中 */ } if (!pv) await pop.waitForTimeout(100); }
  ok(!!pv && await pv.evaluate(() => !document.getElementById('dev-badge')), 'presenter view (opened by the shell) works, no edit UI');
  await pop.waitForTimeout(800);
  const pb = await dk().evaluate(() => DECK.state());
  await pv.click('#pv-notes').catch(() => {});
  await pop.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  const pa = await dk().evaluate(() => DECK.state());
  ok(pa.slide * 100 + pa.step > pb.slide * 100 + pb.step, `presenter: → moves the main deck through the shell (${pb.slide}:${pb.step} → ${pa.slide}:${pa.step})`);
  ok(await pv.evaluate(() => { try { return !!window.parent.document; } catch { return false; } }) === false, 'presenter deck is sandboxed too');
  const fr = pv.childFrames().find((f) => f.url().includes('view=follow'));
  ok(fr && await fr.evaluate(() => window.DECK && DECK.ready && !document.getElementById('dev-badge')), 'presenter iframe deck loads without edit UI');
  await pop.close();
  await page.bringToFront();
} catch (e) {
  fails++; console.error(e); await shot('error.png').catch(() => {});
}

// ---- 8. 書き込みを試みるデッキ（部品とインラインのスクリプト）：プレビューからは何も書けない。知らせは外枠の欄を開くだけ
const hostileDir = path.join(work, 'hostile');
const S2 = start(writeHostileDeck(hostileDir));
try {
  const hb = await S2.base;
  const hp = await ctx.newPage();
  hp.on('pageerror', (e) => errs.push('hostile pageerror: ' + e.message));
  const snap = () => Object.fromEntries(['deck.html', 'narration.md', 'components/evil/index.js'].map((r) => [r, fs.readFileSync(path.join(hostileDir, r), 'utf8')]));
  const files0 = snap();
  const untouched = () => JSON.stringify(snap()) === JSON.stringify(files0) && !fs.existsSync(path.join(hostileDir, 'comments.json')) && !fs.existsSync(path.join(hostileDir, '.cache'));
  await hp.goto(hb); await ready(hp);
  const T2 = await hp.evaluate(() => JSON.parse(document.getElementById('dev-cfg').textContent).token);
  const hf = deckOf(hp);
  ok(await hf.evaluate(() => window.__evilMounted === true), 'hostile: the component ran (in the sandboxed preview)');
  await hp.waitForTimeout(500);   // 読み込んだときの試み
  const R = await hf.evaluate((o) => window.__attack(o), { guess: '0'.repeat(48), token: T2 });
  ok(R.token === 'undefined' && R.tokenInDoc === false && R.parentToken === 'blocked', 'hostile: no token in the deck (window.__DECK_DEV_TOKEN, the document, parent)');
  ok(R.parentDoc === 'blocked' && R.topDoc === 'blocked', 'hostile: parent.document / top.document blocked');
  ok(R.net.length === 12 && R.net.every((x) => / blocked$/.test(x)), 'hostile: fetch / XHR POST to /__dev/edit, /__dev/narration, /__dev/comment (with and without a guessed token) blocked by the CSP ' + JSON.stringify(R.net));
  ok(['/__dev/edit', '/__dev/narration', '/__dev/comment'].every((u) => R['beacon ' + u] !== true || R.violations.some((v) => v.startsWith('connect-src') && v.includes(u))), 'hostile: sendBeacon refused or blocked by connect-src ' + JSON.stringify(R.violations));
  // 同じ問い合わせを sandbox の中から出したもの（Origin: null）は、合言葉があっても断る
  const nul = await rawAt(hb, '/__dev/comment', { method: 'POST', headers: { 'content-type': 'application/json', 'x-deck-token': T2, origin: 'null' }, body: JSON.stringify({ comment: PWNED }) });
  ok(nul.status === 403, 'hostile: Origin: null with the right token -> 403');
  await hp.waitForTimeout(300);
  ok(untouched(), 'hostile: no file changed in the deck folder (deck.html, narration.md, comments.json, .cache)');
  // 偽の本文を付けた知らせ：編集モードでなければ何も開かない。開いても見せるのは今の原稿で、書き込みは保存を押すまでない
  await hf.evaluate(() => window.__hint('edit'));
  await hp.waitForTimeout(300);
  ok(!(await hp.$('#dev-editor')), 'hostile: an edit hint outside edit mode opens nothing');
  await deckKey('e', hp);
  await hf.evaluate(() => window.__hint('edit'));
  await hp.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  const shown = await hp.locator('#dev-editor textarea').inputValue();
  const want = await hf.evaluate(() => document.querySelector('#stage [data-src]').getAttribute('data-src').split('-').map(Number));
  ok(shown === files0['deck.html'].slice(want[0], want[1]) && !shown.includes(PWNED), 'hostile: the edit hint opens the shell editor with the real source, not the forged text: ' + JSON.stringify(shown));
  await shot('8-hostile-hint.png', hp);
  await hp.waitForTimeout(300);
  ok(untouched(), 'hostile: nothing written while the shell editor is open');
  await hp.locator('#dev-editor textarea').press('Escape');
  await hf.evaluate(() => window.__hint('comment'));
  await hp.waitForSelector('#dev-comment textarea');
  ok((await hp.locator('#dev-comment textarea').inputValue()) === '' && (await hp.textContent('#dev-comment .dv-q')).includes(PWNED + '-QUOTE'), 'hostile: a comment hint opens an empty comment box (the forged comment text is ignored)');
  await hp.locator('#dev-comment textarea').press('Escape');
  await hf.evaluate(() => window.__hint('n'));
  await hp.waitForSelector('#dev-narr');
  await hp.waitForTimeout(300);
  ok(untouched(), 'hostile: forged hints (edit, comment, n) wrote nothing');
  // 外枠の欄で「保存」を押したときだけ書く
  await hf.evaluate(() => window.__hint('edit'));
  await hp.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  await hp.locator('#dev-editor textarea').fill('信頼する画面で直した見出し');
  await hp.click('#dev-editor button.dv-pri');
  await hp.waitForFunction(() => !document.getElementById('dev-editor'));
  const after = fs.readFileSync(path.join(hostileDir, 'deck.html'), 'utf8');
  ok(after.includes('信頼する画面で直した見出し') && !after.includes(PWNED + '-HINT'), 'hostile: the write happens only on Save in the shell editor');
  await hp.close();
} catch (e) {
  fails++; console.error(e);
} finally {
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await browser.close();
  S1.srv.kill(); S2.srv.kill();
  console.log(fails ? `${fails} FAILED` : 'all passed');
  console.log('server log:\n' + S1.log.split('\n').map((l) => '  | ' + l).join('\n'));
  process.exit(fails ? 1 : 0);
}
