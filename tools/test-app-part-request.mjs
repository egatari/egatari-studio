// 「こんなパーツが欲しい…」の窓（app/part-request.js、handoff Issue #35）を、編集アプリと手元で動かす中継（relay/src/index.js）でとおす。ネットワークなし
//   node tools/test-app-part-request.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 編集アプリを tools/build-app.mjs で組んで 127.0.0.1 で配り、中継の Worker の fetch を Node の http で 127.0.0.1 の別のポートに立てる
// （Turnstile は Cloudflare の試験用の秘密の値で手元で通し、GitHub への要求は偽の fetch が受ける。Turnstile のスクリプトは偽物に差し替える）。
// 中継の場所は製品ではまだ空（PART_REQUEST_RELAY）なので、試験では __APP_TEST.partRequestRelay で渡し、ページの CSP（frame-src 'none'）は外す
// P1 中継がないとき（ja）：はじめの画面の「こんなパーツが欲しい…」→ 窓は「まだ準備中」と GitHub での提案のリンクだけ。欄も枠もない
// P2 中継があるとき（ja）：確認が済むまで「送る」は押せない。「見せたいもの」が空なら知らせる。送ると Issue のリンクが出る。
//    中継に届いたのは欄の字と parent（Studio の origin）・確認の答えだけ。GitHub には題・本文・ラベルだけ。編集アプリのページ自身は中継にも他所にも要求を出さない
// P3 誤り（GitHub が断る）：「送れませんでした」。確認をやり直すまで送れない
// P4 新規作成の窓のパーツのステップからも開け、新規作成の窓の上に重なる（en）
// 画像（--shots）：part-request-ja.png（送る前）・part-request-sent-ja.png・part-request-unset-ja.png
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';
import worker from '../relay/src/index.js';
import { STR, PROPOSAL_URL } from '../app/part-request.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-part-request-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

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

// 中継：Worker の fetch を Node の http で。GitHub は偽の fetch（github.next で答えを替える）
const relayed = [], github = { calls: [], next: null };
const fakeFetch = async (url, init) => {
  if (String(url).startsWith('https://api.github.com/')) {
    github.calls.push({ url: String(url), init });
    const f = github.next; github.next = null;
    if (f) return f();
    const n = github.calls.length;
    return new Response(JSON.stringify({ number: n, html_url: `https://github.com/egatari/components/issues/${n}` }), { status: 201 });
  }
  throw new Error('unexpected fetch ' + url);
};
const env = {
  STUDIO_ORIGINS: 'http://127.0.0.1:*', GITHUB_REPO: 'egatari/components', ISSUE_LABEL: 'request',
  TURNSTILE_SITEKEY: '1x00000000000000000000AA', TURNSTILE_SECRET: '1x0000000000000000000000000000000AA', GITHUB_TOKEN: 'test-token',
  REQUEST_LIMITER: { async limit() { return { success: true }; } },
};
const relaySrv = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = `http://${req.headers.host}${req.url}`;
  if (req.url.startsWith('/api/request')) { try { relayed.push({ origin: req.headers.origin, body: JSON.parse(body.toString('utf8')) }); } catch { relayed.push({ origin: req.headers.origin, body: null }); } }
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, {}, { fetchImpl: fakeFetch });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => relaySrv.listen(0, '127.0.0.1', r));
const RELAY = `http://127.0.0.1:${relaySrv.address().port}`;
// 偽の Turnstile：描くと少しあとで答えを渡し、reset でもう一度渡す（本物の確認の代わり。中継は試験用の秘密の値なので答えの中身を見ない）
const FAKE_TURNSTILE = `(() => {
  const onload = new URL(document.currentScript.src).searchParams.get('onload');
  const ws = [];
  window.turnstile = {
    render(el, o) { el.textContent = 'fake check'; el.style.height = '65px'; ws.push(o); const n = ws.length; const t = setInterval(() => { if (window.__passCheck) { clearInterval(t); o.callback('fake-token-' + n); } }, 50); return 'w' + n; },
    reset() { const o = ws[ws.length - 1]; if (o) setTimeout(() => o.callback('fake-token-again'), 400); },
  };
  window[onload]();
})();`;

const browser = await launch();
const errs = [];
const open = async (lang, tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US', bypassCSP: true });
  await ctx.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TURNSTILE }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
  // 編集アプリのページ（一番上の枠）が出した要求：自分のサイトのほかにないこと（中継の枠の中の要求は数えない）
  const mainReqs = [];
  p.on('request', (r) => { if (r.frame() === p.mainFrame() && !r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) mainReqs.push(r.url()); });
  await p.goto(BASE + '?lang=' + lang);
  await p.waitForSelector('#drop');
  return { ctx, p, mainReqs };
};
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

try {
  // P1 中継がないとき
  {
    const { ctx, p } = await open('ja', 'P1');
    ok((await p.textContent('#w-request')) === STR.ja.entry, 'P1: the start screen has 「こんなパーツが欲しい…」 next to the parts list');
    await p.click('#w-request');
    await p.waitForSelector('#part-request[open] #pr-unavailable');
    ok((await p.textContent('#pr-unavailable')) === STR.ja.unset && (await p.getAttribute('#pr-proposal', 'href')) === PROPOSAL_URL, 'P1: no relay yet: says it is not available, and links to the GitHub proposal');
    ok(!(await p.$('#pr-what')) && !(await p.$('#pr-check')), 'P1: no fields and no frame');
    await shot(p, 'part-request-unset-ja.png');
    await p.click('#pr-close');
    ok(await p.waitForSelector('#part-request', { state: 'detached', timeout: scaled(5000) }).then(() => true, () => false), 'P1: Close removes the dialog');
    await ctx.close();
  }
  // 試験の確認（差し替えた Turnstile）は、試験が通すまで済まない（はやい機械で、押せないことを確かめる前に済んでしまわないように）
  const passCheck = async (p) => {
    const widget = () => p.frames().find((f) => f.url().startsWith(`${RELAY}/widget`));
    for (let i = 0; i < 300 && !widget(); i++) await new Promise((r) => setTimeout(r, 50));
    await widget().waitForFunction(() => !!window.turnstile, null, { timeout: scaled(15000) });
    await widget().evaluate(() => { window.__passCheck = true; });
  };
  // P2 中継があるとき
  {
    const { ctx, p, mainReqs } = await open('ja', 'P2');
    await p.evaluate((r) => { window.__APP_TEST.partRequestRelay = r; }, RELAY);
    await p.click('#w-request');
    await p.waitForSelector('#part-request[open] #pr-check');
    ok(await p.isDisabled('#pr-send'), 'P2: Send is disabled before the check');
    ok((await p.textContent('#pr-consent')) === STR.ja.consent && (await p.textContent('#pr-noimage')) === STR.ja.noImage, 'P2: the consent line (what is sent, to whom, public) and the no-image note');
    ok(!(await p.$('#part-request input[type=file]')), 'P2: no file field (drawings and photos are not sent)');
    const src = await p.getAttribute('#pr-check', 'src');
    ok(src === `${RELAY}/widget?parent=${encodeURIComponent(BASE.slice(0, -1))}&lang=ja`, `P2: the frame is the relay's widget, with this page's origin and the language (${src})`);
    await passCheck(p);
    await p.waitForFunction(() => !document.getElementById('pr-send').disabled, null, { timeout: scaled(15000) });
    ok(true, 'P2: Send is enabled once the check has passed');
    await p.click('#pr-send');
    ok((await p.textContent('#pr-status')) === STR.ja.needWhat && relayed.length === 0, 'P2: empty "what to show": asks for it, sends nothing');
    await p.fill('#pr-what', '水の循環を、蒸発 → 凝結 → 降水の順に矢印で見せたい\n@someone #1');
    await p.fill('#pr-subject', '中学の理科');
    await p.fill('#pr-grade', '中学 2 年');
    await shot(p, 'part-request-ja.png');
    await p.click('#pr-send');
    await p.waitForSelector('#pr-url', { timeout: scaled(15000) });
    ok((await p.getAttribute('#pr-url', 'href')) === 'https://github.com/egatari/components/issues/1' && (await p.getAttribute('#pr-url', 'target')) === '_blank', 'P2: after sending, the issue URL is shown as a link (new tab)');
    await shot(p, 'part-request-sent-ja.png');
    const rq = relayed[0] || {};
    ok(rq.origin === RELAY && rq.body && Object.keys(rq.body).sort().join() === 'grade,parent,subject,turnstile,what', `P2: the relay got only the fields, parent and the check's answer, from its own page (${rq.body && Object.keys(rq.body).sort().join()})`);
    ok(rq.body && rq.body.what.startsWith('水の循環') && rq.body.subject === '中学の理科' && rq.body.parent === BASE.slice(0, -1), 'P2: the typed text, and Studio\'s origin');
    const gh = github.calls[0] ? JSON.parse(github.calls[0].init.body) : {};
    ok(Object.keys(gh).sort().join() === 'body,labels,title' && gh.labels[0] === 'request' && gh.title.startsWith('[request] 水の循環') && /```text\n水の循環[\s\S]*@someone #1\n```/.test(gh.body), 'P2: GitHub got a title, a body with the text in a fence, and the label');
    ok(!mainReqs.length, `P2: the editor page itself requested nothing outside its own site (${mainReqs.join(' ')})`);
    await p.click('#pr-close');
    // P3 誤り
    await p.click('#w-request');
    await p.waitForSelector('#part-request[open] #pr-check');
    await passCheck(p);
    await p.waitForFunction(() => document.getElementById('pr-send') && !document.getElementById('pr-send').disabled, null, { timeout: scaled(15000) });
    await p.fill('#pr-what', '別の図');
    github.next = () => new Response('{"message":"Bad credentials"}', { status: 401 });
    await p.click('#pr-send');
    await p.waitForFunction((t) => document.getElementById('pr-status').textContent === t, STR.ja.errFail, { timeout: scaled(15000) });
    ok(true, 'P3: GitHub refuses: 「送れませんでした」 (errFail)');
    ok(!(await p.$('#pr-url')), 'P3: no issue link');
    await passCheck(p);
    await p.waitForFunction(() => !document.getElementById('pr-send').disabled, null, { timeout: scaled(15000) });
    ok(true, 'P3: after a new check, Send works again');
    await p.click('#pr-cancel');
    ok(await p.waitForSelector('#part-request', { state: 'detached', timeout: scaled(5000) }).then(() => true, () => false), 'P3: Cancel closes the dialog');
    await ctx.close();
  }
  // P4 新規作成の窓から（en）
  {
    const { ctx, p } = await open('en', 'P4');
    await p.click('#w-new');
    await p.waitForSelector('#dlg[open] #paste-part-request', { state: 'attached' });
    ok((await p.textContent('#paste-part-request')) === STR.en.entry, 'P4: New… has "Request a part…" in the parts step');
    await p.evaluate(() => document.getElementById('paste-part-request').click());
    await p.waitForSelector('#part-request[open]');
    ok(await p.evaluate(() => document.getElementById('dlg').open && document.getElementById('part-request').open), 'P4: it opens over New… (both dialogs open)');
    ok((await p.textContent('#pr-title')) === STR.en.title && (await p.textContent('#pr-unavailable')) === STR.en.unset, 'P4: English words');
    await p.click('#pr-close');
    ok(await p.evaluate(() => document.getElementById('dlg').open), 'P4: closing it leaves New… open');
    await ctx.close();
  }
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e));
} finally {
  await browser.close();
  srv.close();
  relaySrv.close();
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
