// 開発サーバー（server/dev.mjs と server/client.js）の確認
import os from 'node:os';
//   node tools/test-dev-server.mjs <作業用のフォルダ>
// examples/minimal を作業用のフォルダに写してから動かす（見本そのものは書き換えない）
import { launch } from '../kit/browser.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNarration } from '../kit/narration.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-devtest'));
const deckDir = path.join(work, 'deck');
fs.rmSync(deckDir, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.cpSync(path.join(ROOT, 'examples/minimal'), deckDir, { recursive: true, filter: (s) => !s.includes(`${path.sep}out`) });
const DECK = path.join(deckDir, 'deck.html'), NARR = path.join(deckDir, 'narration.md');
// 「学習率と収束」の節を除いておく（節がないスライドへの挿入を試すため）
fs.writeFileSync(NARR, fs.readFileSync(NARR, 'utf8').replace(/## 学習率と収束\r?\n[\s\S]*?\r?\n\r?\n(?=## まとめ)/, ''));
const narr0 = fs.readFileSync(NARR, 'utf8');
if (narr0.includes('## 学習率と収束')) throw new Error('could not strip a section from narration.md');
// Windows で CRLF のまま取り出したときも、書き戻しは元の改行に揃える
const EOL = narr0.includes('\r\n') ? '\r\n' : '\n', nl = (s) => s.replace(/\n/g, EOL);
const mixedEol = (s) => EOL === '\r\n' ? /(^|[^\r])\n/.test(s) : s.includes('\r');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// サーバーを空いている番号で起動する
const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), DECK, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stderr.on('data', (d) => { log += d; });
const base = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server did not start\n' + log)), 15000);
  srv.stdout.on('data', (d) => { log += d; const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
});
console.log('server', base);
// 生の HTTP（Host・Origin を自由に付ける。壊れた URL もそのまま送る）
const raw = (pathname, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const u = new URL(base);
  const r = http.request({ host: '127.0.0.1', port: u.port, method, path: pathname, headers: { host: u.host, ...headers } }, (resp) => {
    let d = ''; resp.on('data', (c) => { d += c; }); resp.on('end', () => res({ status: resp.statusCode, body: d }));
  });
  r.on('error', rej); if (body) r.write(body); r.end();
});

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
// 口述原稿の衝突の確認で意図して起こす 409 は数えない
page.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push('console: ' + m.text()); });
const ready = () => page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
const shot = (name) => page.screenshot({ path: path.join(work, name) });

try {
  await page.goto(base); await ready();
  const TOKEN = await page.evaluate(() => window.__DECK_DEV_TOKEN);
  ok(/^[0-9a-f]{48}$/.test(TOKEN || ''), 'token injected into the page');
  const TH = { 'x-deck-token': TOKEN };

  // ---- 1. 原稿の編集：更新の式（スライド 3）の段階 2 の <li>
  await page.evaluate(() => DECK.go(2, 3, false));
  await page.keyboard.press('e');
  const li = page.locator('#stage .slide.active li[data-step="2"]');
  const before = { range: await li.getAttribute('data-src'), h: await li.getAttribute('data-src-h') };
  await li.hover();
  await shot('1-edit-mode.png');
  await li.dblclick();
  const ta = page.locator('#dev-editor textarea');
  await page.waitForFunction(() => { const t = document.querySelector('#dev-editor textarea'); return t && !t.disabled; });
  ok((await ta.inputValue()).includes('学習率'), 'editor shows raw source with TeX: ' + JSON.stringify(await ta.inputValue()));
  await ta.fill('\\(\\eta>0\\)：<b>学習率</b>（編集済み）');
  await shot('2-editor.png');
  const nav = page.waitForEvent('load');
  await ta.press('Meta+Enter');
  await nav; await ready();
  await page.waitForTimeout(300);
  const src1 = fs.readFileSync(DECK, 'utf8');
  ok(src1.includes('<li data-step="2">\\(\\eta>0\\)：<b>学習率</b>（編集済み）</li>'), 'deck.html changed');
  const st = await page.evaluate(() => DECK.state());
  ok(st.slide === 3 && st.step === 3, `reloaded at same position (slide ${st.slide}, step ${st.step})`);
  ok(await page.evaluate(() => document.documentElement.classList.contains('dev-edit')), 'edit mode survives reload');
  ok(fs.readdirSync(path.join(deckDir, '.cache/edits')).length >= 1, 'backup written to .cache/edits');

  // ---- 2. 古い原稿からの編集は 409
  const r409r = await page.request.post(base + '__dev/edit', { data: { ...before, text: 'x' }, headers: TH }); const r409 = [r409r.status(), (await r409r.json()).error];
  ok(r409[0] === 409 && /原稿が変わっています/.test(r409[1]), 'stale hash -> 409 ' + JSON.stringify(r409));
  ok(fs.readFileSync(DECK, 'utf8') === src1, 'file untouched after 409');
  // 画面でも分かるか：要素の hash を古くしてから開く
  await page.evaluate(() => document.querySelector('#stage .slide.active li[data-step="3"]').setAttribute('data-src-h', 'deadbeef'));
  await page.locator('#stage .slide.active li[data-step="3"]').dblclick();
  await page.waitForSelector('#dev-editor .dev-msg.dv-err');
  await shot('3-conflict.png');
  ok(/原稿が変わっています/.test(await page.locator('#dev-editor .dev-msg').textContent()), 'conflict shown in editor');
  await page.keyboard.press('Escape');
  await page.locator('#dev-editor textarea').press('Escape').catch(() => {});

  // ---- 3. 口述原稿：更新の式の段階 2 を対話に書き換える
  await page.evaluate(() => DECK.go(2, 2, false));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('e');   // 編集モードを切る（引き出しは編集モードと独立）
  await page.keyboard.press('n');
  await page.waitForSelector('#dev-narr .dev-turn textarea');
  const t0 = page.locator('#dev-narr .dev-turn textarea').first();
  ok((await t0.inputValue()) === '{mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。', 'drawer shows raw narration');
  await t0.fill('η は、1 歩の{cue}大きさです。{φ|ファイ} とは違います。');
  await page.locator('#dev-narr button', { hasText: '発言を足す' }).click();
  await page.locator('#dev-narr .dev-turn textarea').nth(1).fill('大きさ、ですか。');
  await shot('4-narration.png');
  const nav2 = page.waitForEvent('load');
  await page.locator('#dev-narr .dev-turn textarea').nth(1).press('Meta+Enter');
  await nav2; await ready(); await page.waitForTimeout(400);
  const narr1 = fs.readFileSync(NARR, 'utf8');
  const exp1 = narr0.replace('[2] {mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。', nl('[2] Expert: η は、1 歩の{cue}大きさです。{φ|ファイ} とは違います。\n    Novice: 大きさ、ですか。'));
  ok(narr1 === exp1, 'narration.md: only that block changed');
  if (narr1 !== exp1) console.log(narr1);
  const seg = parseNarration(narr1).find((s) => s.slideKey === '更新の式' && s.stepKey === '2');
  ok(seg && seg.turns.length === 2 && seg.turns[1].role === 'novice' && seg.turns[0].raw.includes('{cue}'), 'parsed back as 2 turns');
  ok(await page.evaluate(() => !!document.getElementById('dev-narr')), 'drawer reopened after reload');
  ok(/1 歩の/.test(await page.locator('#dev-narr .dev-turn textarea').first().inputValue()), 'drawer shows saved text');
  ok(await page.evaluate(() => DECK.NARRATION['更新の式']['2'][0].text.includes('φ とは')), 'DECK.NARRATION shows display text');

  // 挿入：節がまだない「学習率と収束」の段階 1 と、既存の節の途中の段階
  const getN = async (key) => (await page.request.get(base + '__dev/narration?key=' + encodeURIComponent(key), { headers: TH })).json();
  const post = async (b) => {
    const rev = (await getN(b.slideKey + ':' + b.stepKey)).rev;
    return (await page.request.post(base + '__dev/narration', { data: { rev, ...b }, headers: TH })).json();
  };
  await post({ slideKey: '学習率と収束', stepKey: '1', turns: [{ role: 'expert', text: '倍率を上げると速く下がります。' }] });
  await post({ slideKey: '学習率と収束', stepKey: '0', turns: [{ role: 'expert', text: '学習率を変えます。' }] });
  await post({ slideKey: '学習率と収束', stepKey: 'concl', turns: [{ role: 'expert', text: '2 未満なら収束します。' }] });
  const narr2 = fs.readFileSync(NARR, 'utf8');
  ok(narr2.includes(nl('## 学習率と収束\n[0] 学習率を変えます。\n[1] 倍率を上げると速く下がります。\n[concl] 2 未満なら収束します。\n\n## まとめ')), 'new section inserted in slide order, steps ordered');
  ok(!mixedEol(narr2), `narration.md keeps one kind of line ending (${EOL === '\r\n' ? 'CRLF' : 'LF'})`);
  ok(narr2.replace(/## 学習率と収束\r?\n[\s\S]*?\r?\n\r?\n(?=## まとめ)/, '') === narr1, 'rest of narration.md untouched');
  await post({ slideKey: '学習率と収束', stepKey: '0', turns: [] });
  ok(!fs.readFileSync(NARR, 'utf8').includes('学習率を変えます'), 'empty turns remove the block');
  const gr = await getN('更新の式:2');
  ok(gr.turns.length === 2 && gr.turns[0].text.includes('{φ|ファイ}') && /^[0-9a-f]{8}$/.test(gr.rev), 'GET /__dev/narration returns raw text + rev');
  // 古い版からの保存は 409・版なしは 400
  const narrBefore = fs.readFileSync(NARR, 'utf8');
  const sv = await page.request.post(base + '__dev/narration', { data: { slideKey: '更新の式', stepKey: '2', turns: [{ role: 'expert', text: 'x' }], rev: 'deadbeef' }, headers: TH });
  const sv2 = await page.request.post(base + '__dev/narration', { data: { slideKey: '更新の式', stepKey: '2', turns: [{ role: 'expert', text: 'x' }] }, headers: TH });
  ok(sv.status() === 409 && sv2.status() === 400 && fs.readFileSync(NARR, 'utf8') === narrBefore, `narration stale rev -> 409, no rev -> 400 (${sv.status()}, ${sv2.status()})`);
  await page.waitForTimeout(600); await ready();
  // 画面でも分かるか：引き出しで書きかけのあいだに、外から同じ段階を直す
  await page.evaluate(() => DECK.go(2, 2, false));
  if (!(await page.evaluate(() => !!document.getElementById('dev-narr')))) await page.keyboard.press('n');
  await page.waitForFunction(() => { const t = document.querySelector('#dev-narr .dev-turn textarea'); return t && t.value.includes('1 歩の'); });
  await page.locator('#dev-narr .dev-turn textarea').first().fill('書きかけの下書き');
  const extNarr = fs.readFileSync(NARR, 'utf8').replace('大きさ、ですか。', '大きさ、ですね。');
  fs.writeFileSync(NARR, extNarr);
  await page.waitForTimeout(700);   // 再読み込みは未保存の入力があるので待たされる
  await page.locator('#dev-narr .dev-turn textarea').first().press('Meta+Enter');
  await page.waitForSelector('#dev-narr .dev-msg.dv-err');
  await shot('4b-narration-conflict.png');
  ok(/口述原稿が変わっています/.test(await page.locator('#dev-narr .dev-msg').textContent()) && fs.readFileSync(NARR, 'utf8') === extNarr, 'narration conflict shown in drawer, file untouched');
  const navC = page.waitForEvent('load');
  await page.locator('#dev-narr .dev-msg button', { hasText: '再読み込み' }).click();
  await navC; await ready(); await page.waitForTimeout(300);

  // ---- 4. Claude への指示（Alt+クリック）とコメントの一覧
  await page.evaluate(() => DECK.go(1, 4, false));
  await page.waitForTimeout(200);
  if (await page.evaluate(() => !!document.getElementById('dev-narr'))) await page.keyboard.press('n');
  const tgt = page.locator('#stage .slide.active .body > ul > li').nth(1);
  await tgt.click({ modifiers: ['Alt'] });
  await page.waitForSelector('#dev-comment textarea');
  await page.locator('#dev-comment textarea').fill('「今いる点の傾き」を色付きのまま、もっと短く');
  await shot('5-comment-box.png');
  await page.locator('#dev-comment textarea').press('Meta+Enter');
  await page.waitForTimeout(300);
  const cm = JSON.parse(fs.readFileSync(path.join(deckDir, 'comments.json'), 'utf8'));
  ok(cm.length === 1 && cm[0].key === '何を最小化するか:concl' && cm[0].status === 'open' && /次元/.test(cm[0].quote) && cm[0].range, 'comments.json entry ' + JSON.stringify(cm[0]));
  await page.evaluate(() => DECK.go(0, 0, false));
  await page.keyboard.press('c');
  await page.waitForSelector('#dev-comments .dev-c');
  await shot('6-comments.png');
  await page.locator('#dev-comments .dev-c').first().click();
  ok((await page.evaluate(() => DECK.state().key)) === '何を最小化するか:concl', 'click comment jumps to slide');
  await page.locator('#dev-comments .dev-c button', { hasText: '解決' }).click();
  await page.waitForSelector('#dev-comments .dev-empty');
  ok(JSON.parse(fs.readFileSync(path.join(deckDir, 'comments.json'), 'utf8'))[0].status === 'resolved', 'resolve marks comment');
  await page.keyboard.press('c');

  // ---- 5. 外から原稿を直したとき（エディタで保存したとき）も読み込み直す・組み立ての失敗
  await page.evaluate(() => DECK.go(2, 1, false));
  const nav3 = page.waitForEvent('load');
  fs.writeFileSync(DECK, fs.readFileSync(DECK, 'utf8').replace('今の点 \\(\\theta_t\\) から', '今の点 \\(\\theta_t\\) からは'));
  await nav3; await ready(); await page.waitForTimeout(200);
  const st3 = await page.evaluate(() => DECK.state());
  ok(st3.slide === 3 && st3.step === 1 && (await page.content()).includes('からは'), 'external change -> reload at same position');
  const goodSrc = fs.readFileSync(DECK, 'utf8');
  const nav4 = page.waitForEvent('load');
  fs.writeFileSync(DECK, goodSrc.replace('<head>', '<hea>').replace('</head>', ''));
  await nav4; await page.waitForTimeout(300);
  ok(/組み立てられませんでした/.test(await page.content()), 'build error -> error page');
  const nav5 = page.waitForEvent('load');
  fs.writeFileSync(DECK, goodSrc);
  await nav5; await ready();
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
    sameOrigin: (await raw('/__dev/comment/resolve', { method: 'POST', headers: { ...TH, ...J, origin: 'http://localhost:' + port }, body: '{"id":"none"}' })).status,
    sourceNoToken: (await raw('/__dev/source?range=0-10')).status,
    narrNoToken: (await raw('/__dev/narration?key=x:0')).status,
    eventsNoToken: (await raw('/__dev/events')).status,
  };
  ok(sec.wrongHost === 403 && sec.wrongHostDeck === 403 && sec.localhost === 200, 'Host check ' + JSON.stringify(sec));
  ok(sec.noToken === 403 && sec.badToken === 403 && sec.sourceNoToken === 403 && sec.narrNoToken === 403 && sec.eventsNoToken === 403, 'token required for /__dev/');
  ok(sec.textPlain === 415, 'text/plain POST -> 415');
  ok(sec.crossOrigin === 403 && sec.sameOrigin === 404, 'cross Origin -> 403, same Origin passes');
  const bad = [(await raw('/%ZZ')).status, (await raw('/deck/%E0%A4%A')).status];
  ok(bad[0] === 400 && bad[1] === 400 && (await raw('/')).status === 200, 'malformed URL -> 400, server alive ' + bad);
  fs.writeFileSync(path.join(work, 'secret.txt'), 'secret');
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
  ok((await page.evaluate(() => DECK.mode)) === 'lecture', '?mode=lecture works');
  const pv = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  pv.on('pageerror', (e) => errs.push('presenter pageerror: ' + e.message));
  await pv.goto(base + '?presenter=1'); await pv.waitForTimeout(1500);
  ok(await pv.evaluate(() => !!document.getElementById('pv') && !document.getElementById('dev-badge')), 'presenter view works, no edit UI');
  const fr = pv.frames().find((f) => f.url().includes('view=follow'));
  ok(fr && await fr.evaluate(() => window.DECK && DECK.ready && !document.getElementById('dev-badge')), 'presenter iframe deck loads without edit UI');
  await pv.close();
} catch (e) {
  fails++; console.error(e); await shot('error.png').catch(() => {});
} finally {
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await browser.close();
  srv.kill();
  console.log(fails ? `${fails} FAILED` : 'all passed');
  console.log('server log:\n' + log.split('\n').map((l) => '  | ' + l).join('\n'));
  process.exit(fails ? 1 : 0);
}
