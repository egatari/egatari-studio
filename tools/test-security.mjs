// 守りの試験（npm test の test-security）：プレビューの決まり（CSP）が、デッキの文書（信頼しないバイト）より先に効くこと
//   node tools/test-security.mjs
// 編集アプリと同じ決まりのページ（app/index.html の CSP。同じ origin への接続はできる）を立て、その中の sandbox の iframe に
// app/preview-doc.js の previewDocument で組んだ文書を srcdoc で入れる。デッキの側には、決まりを飲み込む・追い越す・緩める・
// 外へ出るための細工（<!-- <head> -->、<head> より前のスクリプト、<template>・<noscript>・属性の中の <head>、2 つ目の CSP、
// <meta http-equiv=refresh>、<base>、data: や同じ origin への移動）を入れ、同じ origin の受け口（/canary）に何も届かないこと、
// 決まりの <meta> が文書の最初の CSP で <head> の 2 番目の要素であること、信頼する仲立ちがデッキのどのスクリプトよりも先に動くことを確かめる。
// 対照として、以前のやり方（<head> を正規表現で探して入れる）では受け口に届くことも確かめる（試験が攻めを見分けられること）
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import os from 'node:os';
import { previewDocument, PREVIEW_CSP } from '../app/preview-doc.js';
import { build } from '../kit/build.mjs';
import { markupReasons, documentReasons } from '../kit/core/code-scan.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 編集アプリのページの決まり（app/index.html の <meta>）
const appHtml = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const APP_CSP = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(appHtml) || [])[1];
ok(!!APP_CSP, 'app CSP found in app/index.html');
ok(!/frame-src[^;]*'self'/.test(APP_CSP), "app CSP: the preview cannot navigate its frame to the app's own origin (no 'self' in frame-src)");

const hits = [];
const HOST = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="f" sandbox="allow-scripts allow-modals"></iframe><script src="/host.js"></script></body></html>`;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/canary')) { hits.push(req.url); res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); return res.end('ok'); }
  if (req.url === '/host') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': APP_CSP }); return res.end(HOST); }
  if (req.url === '/host.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.__ready = true;'); }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;

// デッキの中の印：同じ origin の受け口に、fetch・画像・beacon で知らせる（決まりが効いていれば止まる）
const canary = (tag) => `<script>window.__deckFirst = window.__deckFirst || (window.__shim ? 'shim' : 'deck');`
  + `try{fetch("${ORIGIN}/canary?fetch-${tag}").catch(function(){})}catch(e){}`
  + `try{new Image().src="${ORIGIN}/canary?img-${tag}"}catch(e){}`
  + `try{navigator.sendBeacon("${ORIGIN}/canary?beacon-${tag}","x")}catch(e){}</script>`;
const body = (tag) => `<body><section class="slide"><h2>x</h2></section>${canary(tag + '-body')}</body></html>`;
const CASES = {
  'comment-head': `<!doctype html><!-- <head> --><html lang="en"><head>${canary('comment')}<title>t</title></head>${body('comment')}`,
  'script-before-head': `<!doctype html>${canary('before')}<html><head><title>t</title></head>${body('before')}`,
  'head-in-template': `<!doctype html><template><head></template><html><head>${canary('template')}</head>${body('template')}`,
  'head-in-noscript': `<!doctype html><noscript><head></noscript><html><head>${canary('noscript')}</head>${body('noscript')}`,
  'head-in-attribute': `<!doctype html><html data-x="<head>"><head title="<head>">${canary('attr')}</head>${body('attr')}`,
  'second-csp': `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'; connect-src *">${canary('csp2')}</head>${body('csp2')}`,
  'meta-refresh': `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${ORIGIN}/canary?refresh"></head>${body('refresh')}`,
  'base-and-link': `<!doctype html><html><head><base href="${ORIGIN}/canary/"><link rel="stylesheet" href="${ORIGIN}/canary?css"></head><body><img src="img-base"><img src="${ORIGIN}/canary?img-abs"></body></html>`,
  'navigate-data': `<!doctype html><html><head><script>location.href = "data:text/html," + encodeURIComponent('<script>fetch("${ORIGIN}/canary?data-url").catch(function(){})<\\/script>');</script></head><body></body></html>`,
  'navigate-self': `<!doctype html><html><head><script>location.href = "${ORIGIN}/canary?navigate";</script></head><body></body></html>`,
  'nested-srcdoc': `<!doctype html><html><head></head><body><iframe srcdoc="${canary('nested').replace(/"/g, '&quot;')}"></iframe></body></html>`,
};
// 信頼する仲立ち（試験用）：動いた印と、そのときの文書のスクリプトの数（自分だけなら 1）
const SHIM = `window.__shim = true; window.__shimScripts = document.scripts.length;`;

const browser = await launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN + '/host');
await page.waitForFunction(() => window.__ready === true);
const frameOf = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());

async function load(doc) {
  await page.evaluate((d) => new Promise((res) => {
    const old = document.getElementById('f'), f = document.createElement('iframe');
    f.id = 'f'; f.setAttribute('sandbox', 'allow-scripts allow-modals');
    f.addEventListener('load', () => res(), { once: true });
    old.replaceWith(f); f.srcdoc = d;
  }), doc);
  await page.waitForTimeout(700);
}
// 文書の中の様子（Playwright の evaluate は CSP の外で動くので、見るだけ）
const inspect = () => frameOf().evaluate((csp) => {
  const metas = [...document.querySelectorAll('meta')].filter((m) => (m.getAttribute('http-equiv') || '').toLowerCase() === 'content-security-policy');
  const h = document.head;
  return { first: metas[0] ? metas[0].content === csp : false, pos: h ? [...h.children].indexOf(metas[0]) : -1, charset: h && h.children[0] ? h.children[0].getAttribute('charset') : null,
    shim: window.__shim === true, shimScripts: window.__shimScripts, deckFirst: window.__deckFirst || null, lang: document.documentElement.lang, metas: metas.length,
    url: location.href };
}, PREVIEW_CSP).catch((e) => ({ error: String(e.message || e) }));

try {
  // 対照：以前のやり方（<head> を正規表現で探して、その直後に入れる）では、<!-- <head> --> の細工で決まりが注釈に飲み込まれ、受け口に届く
  const legacy = (html) => html.replace(/<head[^>]*>/i, (m) => m + `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><script>${SHIM}</script>`);
  hits.length = 0;
  await load(legacy(CASES['comment-head']));
  ok(hits.some((u) => u.includes('comment')), 'control: the old regex insertion is swallowed by <!-- <head> --> and the canary is reached ' + JSON.stringify(hits));

  for (const [name, html] of Object.entries(CASES)) {
    hits.length = 0;
    await load(previewDocument(html, SHIM));
    const st = await inspect();
    ok(hits.length === 0, `${name}: nothing reached the same-origin canary ${JSON.stringify(hits)}`);
    if (['navigate-data', 'navigate-self', 'meta-refresh'].includes(name)) { ok(!/canary|^data:/.test(st.url || ''), `${name}: the preview frame did not navigate away (${st.url || st.error})`); continue; }
    ok(st.first && st.pos === 1 && st.charset === 'utf-8', `${name}: the trusted policy is the first CSP in the document, second in <head> after <meta charset> ` + JSON.stringify(st));
    ok(st.shim && st.shimScripts === 1 && st.deckFirst !== 'deck', `${name}: the trusted shim ran before any deck script ` + JSON.stringify({ shim: st.shim, scripts: st.shimScripts, deckFirst: st.deckFirst }));
    if (name === 'second-csp') ok(st.metas === 2, 'second-csp: the deck may add a policy, which can only restrict further (fetch still blocked)');
    if (name === 'comment-head') ok(st.lang === 'en', 'comment-head: the deck\'s <html lang> still applies (attributes move to the trusted <html>)');
    // 決まりが効いたあとで、文書から同じ origin へ（Playwright から頼む fetch も決まりに従う）
    const late = await frameOf().evaluate((o) => fetch(o + '/canary?late').then(() => 'fetched', () => 'blocked'), ORIGIN).catch(() => 'blocked');
    ok(late === 'blocked' && !hits.some((u) => u.includes('late')), `${name}: fetch to the app origin is blocked (connect-src 'none')`);
  }
  // 部品の式（m-curves の子の JSON・m-sweep の f）：実行系（kit/deck.js の data）が選んで new Function にするものを、判定（code-scan）も
  // 同じ規則で選ぶ。組んだデッキを読み込み、式が動いた（__bypass）なら判定は必ずコードとしていること、おとりの id="deck-…" で判定を
  // すり抜けられないことを確かめる
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-sec-'));
  const EVIL = '(globalThis.__bypass=1,x)';
  const VARIANTS = {
    'decoy-id': `<m-curves><script type="application/json" id="deck-decoy">[]</script><script type="application/json">[{"f":"${EVIL}"}]</script></m-curves>`,
    'decoy-after': `<m-curves><script type="application/json">[{"f":"x*x"}]</script><script type="application/json" id="deck-x">[{"f":"${EVIL}"}]</script></m-curves>`,
    'type-spaces': `<m-curves><script type=" Application/JSON ">[{"f":"${EVIL}"}]</script></m-curves>`,
    'two-components': `<m-curves><script type="application/json">[{"f":"x*x"}]</script></m-curves><m-curves><script type="application/json">[{"f":"${EVIL}"}]</script></m-curves>`,
    'sweep-attr': `<m-sweep f="(globalThis.__bypass=1,u)" values="[0,1]"></m-sweep>`,
    'plain': `<m-curves><script type="application/json">[{"f":"exp(-x*x/2)"}]</script></m-curves><m-sweep f="u*c" values="[0,1]"></m-sweep>`,
  };
  for (const [name, fig] of Object.entries(VARIANTS)) {
    const dir = path.join(tmp, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'deck.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide"><h2>x</h2>${fig}</section></div></body></html>`);
    const r = build(path.join(dir, 'deck.html'), { subset: false });
    const flagged = r.stats.codeReasons.length > 0;
    ok(markupReasons(fs.readFileSync(path.join(dir, 'deck.html'), 'utf8')).length > 0 === flagged, `formula ${name}: the source scan and the scan of the built document agree`);
    await load(previewDocument(r.html, SHIM));
    await frameOf().waitForFunction(() => !!(window.DECK && DECK.ready), null, { timeout: 15000 }).catch(() => {});
    const ran = await frameOf().evaluate(() => { try { DECK.seek(0, 3, Infinity); } catch (e) { /* 無視 */ } return globalThis.__bypass === 1; }).catch(() => false);
    ok(!ran || flagged, `formula ${name}: a formula the runtime evaluated is flagged as code by the scanner (ran=${ran}, flagged=${flagged})`);
    if (name === 'plain') ok(!flagged && !ran, 'formula plain: plain formulas are not code');
    else ok(flagged, `formula ${name}: flagged as code (ask) — the decoy cannot hide the selected block`);
    if (name.startsWith('decoy')) ok(!ran, `formula ${name}: the runtime refuses an ambiguous data block (two candidates)`);
  }
  // 判定は組んだ文書（取り込み・前処理の後、拡張子によらずすべての依存を含む）に対して行う（format spec §6）
  const deckWith = (name, body, files = {}) => {
    const dir = path.join(tmp, name); fs.mkdirSync(dir, { recursive: true });
    for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
    fs.writeFileSync(path.join(dir, 'deck.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide"><h2>x</h2>${body}</section></div></body></html>`);
    return build(path.join(dir, 'deck.html'), { subset: false });
  };
  const XSS = '<img src="data:," onerror="window.__x=1">';
  for (const [name, body, files] of [
    ['include-png', '/*INCLUDE:payload.png*/', { 'payload.png': '<script>window.__x=1</script>' }],
    ['include-in-style', '<style>/*INCLUDE:a.woff2*/</style>', { 'a.woff2': '</style>' + XSS }],
    ['fig', '{{FIG:f}}', { 'figs/f.svg': '<svg><a href="javascript:x()">a</a></svg>' }],
    ['css-import', '<style>@import "evil.dat";</style>', { 'evil.dat': '</style>' + XSS }],
  ]) {
    const r = deckWith(name, body, files);
    ok(r.stats.codeReasons.length > 0, `expanded source: ${name} is classified as code (${JSON.stringify(r.stats.codeReasons.slice(0, 2))})`);
  }
  // {{JSON:…}} は組み立てが書き直す（</ を逃がす）ので抜け出せない：データのまま
  const rj = deckWith('json-include', '<script type="application/json" id="x">{{JSON:d.bin}}</script>', { 'data/d.bin': JSON.stringify({ a: '</script>' + XSS }) });
  ok(rj.stats.codeReasons.length === 0 && !markupReasons(rj.html).some((x) => x.startsWith('onerror')), 'expanded source: a {{JSON:…}} include with </script> stays data ' + JSON.stringify(rj.stats.codeReasons));
  // 原稿のマクロ（macros.tex）は信頼する実行系の <script> の中に入る：</script で抜け出せない（抜け出したら判定が範囲を信頼しない）
  const rm = deckWith('macros', '<p>DECK.svgMath</p>', { 'macros.tex': '\\newcommand{\\evil}{</script>' + XSS + '}' });
  ok(rm.html.includes('katex.__macros=') && !markupReasons(rm.html).some((x) => x.startsWith('onerror')) && rm.stats.codeReasons.length === 0, 'macros: a macro containing </script> cannot break out of the trusted runtime script ' + JSON.stringify(rm.stats.codeReasons));
  // 信頼する範囲が信頼しないバイトに飲み込まれたら（属性の中に入った）、範囲を信頼せずに読む
  const sw = '<div title="' + '<script>trusted()</script>' + '">' + XSS;
  ok(documentReasons(sw, [{ start: 12, end: 12 + '<script>trusted()</script>'.length, tags: ['script'] }]).some((x) => /trusted part/.test(x)), 'documentReasons: a trusted range swallowed by an attribute is not trusted');
  ok(documentReasons('<p>a</p><script>t()</script><p>b</p>', [{ start: 8, end: 28, tags: ['script'] }]).length === 0, 'documentReasons: a cleanly inserted trusted script is skipped');
  ok(markupReasons('<meta http-equiv="Refresh" content="0;url=x">').length === 1, 'meta refresh counts as code');
  fs.rmSync(tmp, { recursive: true, force: true });

  // 信頼する仲立ちに </script や <!-- を入れたら組まない
  let threw = false; try { previewDocument('<p>x</p>', 'a("</script>")'); } catch { threw = true; }
  ok(threw, 'previewDocument refuses a shim containing </script');
} catch (e) {
  fails++; console.error(e);
} finally {
  ok(errs.length === 0, 'no page errors in the host ' + JSON.stringify(errs));
  await browser.close();
  srv.close();
  console.log(fails ? `${fails} FAILED` : 'all passed');
  process.exit(fails ? 1 : 0);
}
