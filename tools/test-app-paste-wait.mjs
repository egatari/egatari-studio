// AI の返事を取り込む間の待ちの表示（v0.6.9）：［作成］［置き換える］を押してから教材が見えるまで、「開いています…」と同じロゴで覆う
//   node tools/test-app-paste-wait.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// test-all: serial（押してから約 1 秒以内に出ること・こまごとの画面を見る）
// 編集アプリを tools/build-app.mjs で組み、127.0.0.1 で配って、こまごと（requestAnimationFrame）に画面を記録する：
// W1 新規作成 →「AI の出力を貼り付ける」→［作成］（en）：窓が閉じたこまにはもう覆いがあり（約 1 秒以内）、「Creating the lesson…」とロゴ。
//    はじめの画面（#welcome）がむき出しのこまはない。教材が見えたら覆いは消え、言葉は「Opening…」に戻る
// W2 同じ（ja・動きを減らす設定）：「教材を作っています…」。ロゴは開くときと同じもの（動きを減らす設定は SVG の中の prefers-reduced-motion が決める）
// W3 組めない返事（<m-base>：ライブラリのパーツ）：覆いは消え、窓に誤りが出て、貼った字は残る。はじめの画面がむき出しのこまはない
// W4 「このサンプルを参考に作る」（?from-sample=pitch-fictional）から作る：W1 と同じ
// W5 開いた 1 ファイルの「修正…」→［置き換える］（AI の直しを取り込む）：窓が閉じたこまにはもう覆い（「Replacing…」）。消えたときには置き換わっている
// 画像（--shots）：paste-wait-en.png・paste-wait-ja.png（覆っている間）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { replyOf } from './test-app-llm.mjs';
import { clickShows, clickCommand } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-paste-wait-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');
const example = (n, f) => fs.readFileSync(path.join(ROOT, 'examples', n, f), 'utf8').replace(/\r\n/g, '\n');

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

const open = async (lang, tag, { query = '', reduced = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US', ...(reduced ? { reducedMotion: 'reduce' } : {}) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
  await p.goto(BASE + '?lang=' + lang + query);
  await p.waitForSelector('#drop');
  return p;
};
// 新規作成 →「AI の出力を貼り付ける」の欄に貼る
const pasteDirect = async (p, text) => {
  await p.click('#w-new');
  await p.waitForSelector('#dlg[open] #paste-direct');
  await p.click('#paste-direct');
  await p.waitForSelector('#paste-only:not([hidden]) #paste-deck');
  await p.fill('#paste-deck', text);
  await p.waitForFunction(() => !document.getElementById('dlg-import').disabled);
};
// ［作成］・［置き換える］を押し、こまごとに画面を記録する。done（ページの中の式）が真になったら、さらに数こま見て終える
// 返す：{frames: [{t, dlg, wait, text, logo, welcome, deck, loads}], t: 押したときからの ms}
const pressAndRecord = async (p, done) => {
  await p.evaluate((done) => {
    const $ = (id) => document.getElementById(id);
    const shown = (e) => !!e && !e.hidden && !!e.getClientRects().length;
    const R = window.__PW = { frames: [], done: false };
    const t0 = performance.now();
    const fin = new Function('return (' + done + ')');
    let after = -1;
    const look = () => {
      const s = window.__APP_TEST.state();
      R.frames.push({ t: Math.round(performance.now() - t0), dlg: $('dlg').open, wait: shown($('wait')), text: $('wait').querySelector('.wait-text').textContent,
        logo: !!$('wait').querySelector('img.wait-logo'), cover: $('wait').classList.contains('cover'), welcome: shown($('welcome')), deck: shown($('deck')), loads: s.loads, frameLoaded: s.frameLoaded, portable: !!s.portable });
      if (after < 0 && fin()) after = 0;
      if (after >= 0 && ++after > 5) { R.done = true; return; }
      requestAnimationFrame(look);
    };
    look();
    $('dlg-import').click();
  }, done);
  await p.waitForFunction(() => window.__PW.done, null, { timeout: scaled(60000) });
  return p.evaluate(() => window.__PW.frames);
};
// 窓が閉じた最初のこま・覆いが出た最初のこま・覆いが消えた（出た後で）最初のこま・はじめの画面がむき出しのこま
const summary = (F) => {
  const closed = F.findIndex((f) => !f.dlg);
  const on = F.findIndex((f) => f.wait);
  const off = on < 0 ? -1 : F.findIndex((f, i) => i > on && !f.wait);
  const bare = F.filter((f) => f.welcome && !f.dlg && !f.wait);
  const uncovered = closed < 0 ? [] : F.slice(closed, off < 0 ? F.length : off).filter((f) => !f.dlg && !f.wait);
  return { closed, on, off, bare, uncovered, tOn: on < 0 ? null : F[on].t, tOff: off < 0 ? null : F[off].t };
};
const shotWait = async (p, name) => {
  if (!SHOTS) return;
  // 覆いは 1〜2 秒で消える：出てから 0.8 秒（ロゴの「え」を描いている途中）で撮る
  await p.waitForSelector('#wait:not([hidden])', { timeout: scaled(5000) }).catch(() => {});
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(SHOTS, name) }).catch(() => {});
};

// ---------------------------------------------------------------- W1・W2 新規作成（貼り付けだけの画面）
const bdeck = worked('business', 'deck.html'), bnarr = worked('business', 'narration.md');
for (const [lang, reduced, want, back] of [['en', false, 'Creating the lesson…', 'Opening…'], ['ja', true, '教材を作っています…', '開いています…']]) {
  const tag = lang === 'en' ? 'W1' : 'W2';
  const p = await open(lang, tag, { reduced });
  await pasteDirect(p, replyOf(bdeck, bnarr));
  const shot = SHOTS ? (async () => { await p.waitForFunction(() => window.__PW, null, { timeout: scaled(5000) }); await shotWait(p, `paste-wait-${lang}.png`); })() : null;
  const F = await pressAndRecord(p, '(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0 && s.frameLoaded === s.loads && document.getElementById("wait").hidden; })()');
  if (shot) await shot;
  const S = summary(F);
  const onF = F[S.on] || {};
  ok(S.on >= 0 && S.on <= S.closed && S.tOn <= scaled(1000), `${tag} (${lang}${reduced ? ', reduced motion' : ''}): the wait shows by the frame the dialog closes (${S.tOn} ms after “Create”; dialog closed in frame ${S.closed}, wait from frame ${S.on})`);
  ok(onF.text === want && onF.logo && onF.cover, `${tag}: it says “${onF.text}” with the logo, covering the screen`);
  ok(!S.bare.length && !S.uncovered.length, `${tag}: the start screen is never shown in between (${F.length} frames; bare ${S.bare.length}, uncovered ${S.uncovered.length})`);
  const last = F[F.length - 1];
  ok(S.off > 0 && !last.wait && last.deck && !last.welcome && last.portable && last.frameLoaded === last.loads && last.loads > 0, `${tag}: the wait goes away when the lesson appears (${S.tOff} ms)`);
  ok(await p.textContent('#wait .wait-text') === back && !(await p.$('#wait img.wait-logo')) && !(await p.evaluate(() => document.getElementById('wait').classList.contains('cover'))),
    `${tag}: afterwards the wait text is back to “${back}” and the logo is removed`);
  console.log(`  info ${tag}: dialog closed ${F[S.closed].t} ms, wait ${S.tOn}–${S.tOff} ms, ${F.length} frames`);
  await p.context().close();
}

// ---------------------------------------------------------------- W3 組めない返事：窓に誤り、貼った字は残る
{
  const p = await open('en', 'W3');
  const bad = replyOf('<!DOCTYPE html><html lang="en"><head><title>Broken</title></head><body><div id="stage"><section class="slide"><h2>A</h2><m-base aria-label="b"></m-base></section></div></body></html>', '## A\n[0] Hello.');
  await pasteDirect(p, bad);
  const kept = await p.inputValue('#paste-deck');
  const F = await pressAndRecord(p, '(() => document.getElementById("dlg").open && !document.getElementById("paste-msg").hidden)()');
  const S = summary(F);
  ok(S.on >= 0 && S.on <= S.closed && S.tOn <= scaled(1000), `W3: the wait shows by the frame the dialog closes (${S.tOn} ms)`);
  ok(!S.bare.length, `W3: the start screen is never shown bare before the dialog comes back (bare ${S.bare.length})`);
  const msg = await p.textContent('#paste-msg');
  ok(await p.isHidden('#wait') && /^Could not build the slides: <m-base> is not an element/.test(msg), `W3: the wait closes and the error shows in the dialog: ${msg.slice(0, 80)}`);
  ok(await p.isVisible('#dlg[open] #paste-deck') && (await p.inputValue('#paste-deck')) === kept && await p.textContent('#wait .wait-text') === 'Opening…', 'W3: the pasted text is kept');
  await p.context().close();
}

// ---------------------------------------------------------------- W4 「このサンプルを参考に作る」から
{
  const p = await open('en', 'W4', { query: '&from-sample=pitch-fictional' });
  await p.waitForSelector('#dlg[open] #paste-step-kind');
  await p.fill('#paste-title', 'A pitch for our bakery app');
  await p.click('#paste-next-content');
  await p.waitForSelector('#paste-step-send.current');
  await clickShows(p, '#paste-step-paste-btn', '#paste-deck');
  await p.fill('#paste-deck', replyOf(example('pitch-fictional', 'deck.html'), example('pitch-fictional', 'narration.md')));
  await p.waitForFunction(() => !document.getElementById('dlg-import').disabled);
  const F = await pressAndRecord(p, '(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0 && s.frameLoaded === s.loads && document.getElementById("wait").hidden; })()');
  const S = summary(F);
  ok(S.on >= 0 && S.on <= S.closed && S.tOn <= scaled(1000) && F[S.on].text === 'Creating the lesson…', `W4 (from a sample): the wait shows by the frame the dialog closes (${S.tOn} ms, “${(F[S.on] || {}).text}”)`);
  ok(!S.bare.length && !S.uncovered.length && S.off > 0 && F[F.length - 1].deck, `W4: the start screen is never shown in between, and the wait goes away with the lesson (${S.tOff} ms)`);

  // ---------------------------------------------------------------- W5 開いた 1 ファイルの「修正…」→［置き換える］
  await p.waitForFunction(() => { const s = window.__APP_TEST.state(); return !s.building && s.frameLoaded === s.loads; }, null, { timeout: scaled(30000) });
  await clickCommand(p, '#b-revise-cmd');
  await p.waitForSelector('#dlg[open] #paste-step1-btn[aria-current=step]', { timeout: scaled(10000) });
  await clickShows(p, '#paste-step-paste-btn', '#dlg[open] #paste-deck');
  await p.fill('#paste-deck', replyOf(bdeck, bnarr));
  await p.waitForFunction(() => !document.getElementById('dlg-import').disabled);
  const loads0 = await p.evaluate(() => window.__APP_TEST.state().loads);
  const G = await pressAndRecord(p, `(() => { const s = window.__APP_TEST.state(); return s.loads > ${loads0} && s.frameLoaded === s.loads && document.getElementById("wait").hidden; })()`);
  const R = summary(G);
  ok(R.on >= 0 && R.on <= R.closed && R.tOn <= scaled(1000) && G[R.on].text === 'Replacing…' && G[R.on].logo, `W5 (AI fix on an open file): the wait shows by the frame the dialog closes (${R.tOn} ms, “${(G[R.on] || {}).text}”)`);
  ok(!R.uncovered.length && R.off > 0 && G[R.off].loads > loads0, `W5: nothing is left uncovered until the replaced lesson is in place (${R.tOff} ms; loads ${loads0} → ${G[R.off] && G[R.off].loads})`);
  const deckNow = await p.evaluate(() => { const f = window.__APP_TEST.files(); return new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))); });
  ok(deckNow.includes('配送センター'), 'W5: the slides are replaced by the pasted ones');
  await p.context().close();
}

ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close();
srv.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
