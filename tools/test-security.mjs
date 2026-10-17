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
import { build, buildPortable } from '../kit/build.mjs';
import { spawnSync } from 'node:child_process';
import { safeWriteFile, readContained, pruneBackups, backupFile } from '../kit/safe-fs.mjs';
import { unpack } from './portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
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
// 編集アプリのフォルダの作業場所（File System Access）がリンクを見せるか：落としたフォルダの中を一覧し、名前で開き、書いてみる
const FSA_PAGE = `<!doctype html><body style="margin:0"><div id="d" style="width:400px;height:400px">drop</div><script>
d.addEventListener('dragover', (e) => e.preventDefault());
d.addEventListener('drop', async (e) => { e.preventDefault(); const R = { names: [] };
  try { const h = await e.dataTransfer.items[0].getAsFileSystemHandle();
    for await (const [n] of h.entries()) R.names.push(n);
    for (const n of ['link.txt', 'linkdir', 'inner.txt']) { try { const f = await h.getFileHandle(n); R[n] = (await (await f.getFile()).text()).trim(); } catch (err) { try { await h.getDirectoryHandle(n); R[n] = 'dir'; } catch (err2) { R[n] = err.name; } } }
    try { const w = await (await h.getFileHandle('link.txt')).createWritable(); await w.write('PWNED'); await w.close(); R.write = 'written'; } catch (err) { R.write = err.name; }
  } catch (err) { R.error = String(err); }
  window.R = R; });
</script>`;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/canary')) { hits.push(req.url); res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); return res.end('ok'); }
  if (req.url === '/host') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': APP_CSP }); return res.end(HOST); }
  if (req.url === '/fsa') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(FSA_PAGE); }
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
  // 解析の規則の食い違い（format spec §6）：判定はスクリプトを動かすブラウザと同じ規則で読む。<noscript> などの中の「属性の文字」に見える
  // スクリプトがブラウザで動いたなら、判定は必ずコードとしている（プレビューを始める前の判定。組んだ文書と原稿のどちらでも）
  const RUN = '<script>globalThis.__ran=1</script>';
  const NOSCRIPT = {
    'noscript-title': `<noscript><p title="</noscript>${RUN}"></p></noscript>`,
    'noscript-comment': `<noscript><!--</noscript>${RUN}--></noscript>`,
    'noscript-style': `<noscript><style></noscript>${RUN}</style></noscript>`,
    'noscript-head': null,
    'noembed-title': `<noembed><p title="</noembed>${RUN}"></p></noembed>`,
    'noframes-title': `<noframes><p title="</noframes>${RUN}"></p></noframes>`,
    'iframe-text': `<iframe><p title="</iframe>${RUN}"></p></iframe>`,
    'iframe-srcdoc': `<iframe srcdoc="&lt;p title=&quot;&lt;/noscript&gt;&lt;script&gt;parent.__ran=1&lt;/script&gt;&quot;&gt;"></iframe>`,
    'template-title': `<template><p title="</template>${RUN}"></p></template>`,
    'textarea-title': `<textarea><p title="</textarea>${RUN}"></p></textarea>`,
  };
  for (const [name, fig] of Object.entries(NOSCRIPT)) {
    const head = name === 'noscript-head' ? `<noscript><style></noscript>${RUN}</style></noscript>` : '';
    const src = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${head}</head><body><div id="stage"><section class="slide"><h2>x</h2>${fig || ''}</section></div></body></html>`;
    const dir = path.join(tmp, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'deck.html'), src);
    const r = build(path.join(dir, 'deck.html'), { subset: false });
    const flagged = r.stats.codeReasons.length > 0, srcFlagged = markupReasons(src).length > 0;
    let ran = false;
    for (const html of [r.html, src]) {
      await load(previewDocument(html, SHIM));
      await frameOf().waitForTimeout(150).catch(() => {});
      ran = (await frameOf().evaluate(() => globalThis.__ran === 1).catch(() => false)) || ran;
    }
    ok((!ran || (flagged && srcFlagged)) && (name.startsWith('template') || name.startsWith('textarea') || (flagged && srcFlagged)),
      `parsing ${name}: a script the browser ran is flagged as code before the preview starts (ran=${ran}, built=${JSON.stringify(r.stats.codeReasons.slice(0, 2))}, source=${srcFlagged})`);
    if (name === 'noscript-title') ok(ran, 'parsing noscript-title: control — the browser (scripting on) does run the script, so the scanner must see it');
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

  // ---- 原稿のフォルダのシンボリックリンク（format spec §11）：書き込み（kit/safe-fs.mjs）と、それを使う npm run ids・npm run portable・組み立ての書き出し
  if (process.platform !== 'win32') {
    const sy = path.join(tmp, 'sym'); fs.mkdirSync(sy);
    const outside = path.join(sy, 'outside'); fs.mkdirSync(outside);
    const secret = path.join(outside, 'secret.txt'); fs.writeFileSync(secret, 'OUTSIDE-SECRET');
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(outside, `2000-01-01T00-00-${String(i).padStart(2, '0')}-000Z-x.html`), 'keep');
    const snapOut = () => fs.readdirSync(outside).sort().map((f) => f + ':' + fs.readFileSync(path.join(outside, f), 'utf8')).join('|');
    const out0 = snapOut();
    const refuses = (fn) => { try { fn(); return false; } catch (e) { return e.code === 'unsafe-path'; } };
    const D = path.join(sy, 'd'); fs.mkdirSync(D);
    // 葉のリンク・途中のフォルダのリンク・壊れたリンク・base の外
    fs.symlinkSync(secret, path.join(D, 'leaf.txt'));
    fs.symlinkSync(outside, path.join(D, 'sub'));
    fs.symlinkSync(path.join(outside, 'new.txt'), path.join(D, 'dangling.txt'));
    ok(refuses(() => safeWriteFile(D, path.join(D, 'leaf.txt'), 'PWNED')), 'safe-fs: writing to a leaf symlink is refused');
    ok(refuses(() => safeWriteFile(D, path.join(D, 'sub', 'x.txt'), 'PWNED')), 'safe-fs: writing through a symlinked folder is refused');
    ok(refuses(() => safeWriteFile(D, path.join(D, 'dangling.txt'), 'PWNED')) && !fs.existsSync(path.join(outside, 'new.txt')), 'safe-fs: writing to a dangling symlink is refused (the target is not created)');
    ok(refuses(() => safeWriteFile(D, path.join(sy, 'x.txt'), 'PWNED')), 'safe-fs: writing outside the base is refused');
    ok(refuses(() => readContained(D, path.join(D, 'leaf.txt'))) && refuses(() => readContained(D, path.join(D, 'sub', 'secret.txt'))), 'safe-fs: reading through a link that leaves the base is refused');
    ok(refuses(() => backupFile(D, path.join(D, 'leaf.txt'), 'bk')), 'safe-fs: backing up a file that links outside is refused');
    fs.symlinkSync(outside, path.join(D, 'bk'));
    fs.writeFileSync(path.join(D, 'real.txt'), 'v1');
    ok(refuses(() => backupFile(D, path.join(D, 'real.txt'), 'bk')) && refuses(() => pruneBackups(D, 'bk', 0)), 'safe-fs: a backup folder that is a symlink is refused (no backup, no cleanup)');
    // 普通の書き込み：既にあるファイルの上に rename（Windows でも同じ手順）、モードを保つ、一時ファイルを残さない、新しいフォルダを作る
    fs.chmodSync(path.join(D, 'real.txt'), 0o640);
    safeWriteFile(D, path.join(D, 'real.txt'), 'v2');
    safeWriteFile(D, path.join(D, 'n1', 'n2', 'new.txt'), new Uint8Array([104, 105]));
    ok(fs.readFileSync(path.join(D, 'real.txt'), 'utf8') === 'v2' && (fs.statSync(path.join(D, 'real.txt')).mode & 0o777) === 0o640 && fs.readFileSync(path.join(D, 'n1', 'n2', 'new.txt'), 'utf8') === 'hi'
      && !fs.readdirSync(D).some((f) => f.endsWith('.tmp')), 'safe-fs: a normal write replaces the file atomically (mode kept, new folders made, no temp file left)');
    ok(snapOut() === out0, 'safe-fs: nothing outside was written or deleted');

    // npm run ids：.cache が外を指すリンクなら、何も書かずに断る
    const mkDeck = (name) => { const d = path.join(sy, name); fs.cpSync(path.join(ROOT, 'examples/minimal'), d, { recursive: true, filter: (x) => !x.includes(`${path.sep}out`) }); return d; };
    const ids = mkDeck('ids');
    fs.writeFileSync(path.join(ids, 'deck.html'), fs.readFileSync(path.join(ids, 'deck.html'), 'utf8').replace(/<section class="slide" id="[^"]*"/g, '<section class="slide"'));
    fs.symlinkSync(outside, path.join(ids, '.cache'));
    const deckBefore = fs.readFileSync(path.join(ids, 'deck.html'), 'utf8'), narrBefore = fs.readFileSync(path.join(ids, 'narration.md'), 'utf8');
    const ri = spawnSync(process.execPath, [path.join(ROOT, 'tools/ids.mjs'), ids], { encoding: 'utf8' });
    ok(ri.status === 1 && /symbolic link/.test(ri.stderr) && fs.readFileSync(path.join(ids, 'deck.html'), 'utf8') === deckBefore && fs.readFileSync(path.join(ids, 'narration.md'), 'utf8') === narrBefore && snapOut() === out0,
      'ids: a .cache symlinked outside -> refused before writing anything (deck, narration and the outside folder unchanged) ' + ri.stderr.trim().slice(0, 80));
    fs.rmSync(path.join(ids, '.cache'));
    fs.symlinkSync(secret, path.join(ids, 'comments.json'));
    const ri2 = spawnSync(process.execPath, [path.join(ROOT, 'tools/ids.mjs'), ids], { encoding: 'utf8' });
    ok(ri2.status === 1 && fs.readFileSync(secret, 'utf8') === 'OUTSIDE-SECRET' && fs.readFileSync(path.join(ids, 'deck.html'), 'utf8') === deckBefore, 'ids: comments.json linking outside -> not read, nothing written ' + ri2.stderr.trim().slice(0, 80));
    fs.rmSync(path.join(ids, 'comments.json'));
    const ri3 = spawnSync(process.execPath, [path.join(ROOT, 'tools/ids.mjs'), ids], { encoding: 'utf8' });
    ok(ri3.status === 0 && fs.readFileSync(path.join(ids, 'deck.html'), 'utf8') !== deckBefore && fs.readdirSync(path.join(ids, '.cache', 'edits')).length >= 2, 'ids: without links it still writes (with backups)');

    // 組み立ての書き出し：out/ や out/deck.html が外を指すリンクなら断る（外は変わらない）
    const bd = mkDeck('bout');
    fs.symlinkSync(outside, path.join(bd, 'out'));
    const rb = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(bd, 'deck.html')], { encoding: 'utf8' });
    ok(rb.status === 1 && snapOut() === out0, 'build: out/ symlinked outside -> refused, nothing written outside ' + rb.stderr.trim().slice(0, 80));
    fs.rmSync(path.join(bd, 'out')); fs.mkdirSync(path.join(bd, 'out'));
    fs.symlinkSync(secret, path.join(bd, 'out', 'deck.html'));
    const rb2 = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(bd, 'deck.html')], { encoding: 'utf8' });
    ok(rb2.status === 1 && fs.readFileSync(secret, 'utf8') === 'OUTSIDE-SECRET', 'build: out/deck.html symlinked outside -> refused, the target unchanged');
    // 持ち運べる形式の書き出しが原稿のフォルダに残す設定のファイル（新しい docId）：外を指すリンクなら読まず、書かない
    const pd = mkDeck('pconf');
    // 取り出すときに途中のフォルダ（data/）ができるように、data/ のファイルを取り込む
    fs.mkdirSync(path.join(pd, 'data')); fs.writeFileSync(path.join(pd, 'data', 'd.json'), '{"a":1}');
    fs.writeFileSync(path.join(pd, 'deck.html'), fs.readFileSync(path.join(pd, 'deck.html'), 'utf8').replace('</body>', '<script type="application/json" id="dd">{{JSON:d.json}}</script>\n</body>'));
    fs.symlinkSync(path.join(outside, 'conf.json'), path.join(pd, FORMAT.CONFIG_FILE));
    let pthrew = null; try { await buildPortable(path.join(pd, 'deck.html'), { out: path.join(sy, 'p.ega.html') }); } catch (e) { pthrew = e.code; }
    ok(pthrew === 'unsafe-path' && !fs.existsSync(path.join(outside, 'conf.json')), `portable: ${FORMAT.CONFIG_FILE} as a dangling symlink to outside -> not written (${pthrew})`);
    // npm run portable -- unpack：途中のフォルダ・書く先（壊れたリンクも）がリンクなら、何も書かないうちに断る
    fs.rmSync(path.join(pd, FORMAT.CONFIG_FILE));
    const pr = await buildPortable(path.join(pd, 'deck.html'), { out: path.join(sy, 'p.ega.html') });
    fs.writeFileSync(path.join(sy, 'p.ega.html'), pr.html);
    const u2 = path.join(sy, 'un-ok');
    const ur = await unpack(path.join(sy, 'p.ega.html'), u2);
    ok(ur.written.includes('deck.html') && fs.existsSync(path.join(u2, 'deck.html')), 'portable unpack: a normal unpack still works');

    // ---- 組み立てが読むもの（部品・テーマの設定・字の変数・ロゴ・親のテーマ）：外を指すリンクは読まない（組んだ文書に外のバイトが入らない）
    const SECRET = 'OUTSIDE-SECRET-BYTES-7f3a';
    const outB = path.join(sy, 'outside-b'); fs.mkdirSync(outB);
    const sec = path.join(outB, 'private.css'); fs.writeFileSync(sec, `:root{--leak:"${SECRET}"}`);
    const secJs = path.join(outB, 'private.js'); fs.writeFileSync(secJs, `window.__leak="${SECRET}";`);
    const secJson = path.join(outB, 'theme.json'); fs.writeFileSync(secJson, `{"name":"${SECRET}","extends":"default"}`);
    const oTheme = path.join(outB, 'otheme'); fs.mkdirSync(oTheme); fs.writeFileSync(path.join(oTheme, 'tokens.css'), `:root{--leak2:"${SECRET}"}`);
    fs.writeFileSync(path.join(outB, 'logo.png'), SECRET);
    const themed = (name, prep, attrs = '', body = '') => {
      const d = path.join(sy, 'th-' + name); fs.mkdirSync(d);
      prep(d);
      fs.writeFileSync(path.join(d, 'deck.html'), `<!doctype html><html lang="en"${attrs}><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide cover"><h2>x</h2>${body}</section></div></body></html>`);
      return build(path.join(d, 'deck.html'), { subset: false });
    };
    const mkTheme = (d, n, files) => { const t = path.join(d, 'themes', n); fs.mkdirSync(t, { recursive: true }); for (const [f, v] of Object.entries(files)) { if (typeof v === 'object') fs.symlinkSync(v.link, path.join(t, f)); else fs.writeFileSync(path.join(t, f), v); } return t; };
    const b64 = Buffer.from(SECRET).toString('base64');
    const leaks = (r) => r.html.includes(SECRET) || r.html.includes(b64);
    for (const [name, prep, attrs, body] of [
      ['tokens', (d) => mkTheme(d, 'mine', { 'tokens.css': { link: sec } }), ' data-theme="mine"'],
      ['theme-json', (d) => mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': { link: secJson } }), ' data-theme="mine"'],
      ['logo', (d) => mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': '{"logos":["l.png"]}', 'l.png': { link: path.join(outB, 'logo.png') } }), ' data-theme="mine"'],
      ['theme-dir', (d) => { fs.mkdirSync(path.join(d, 'themes')); fs.symlinkSync(oTheme, path.join(d, 'themes', 'mine')); }, ' data-theme="mine"'],
      // 親のテーマ（extends）：原稿のフォルダのテーマが、外を指すリンクのテーマ・../ で外のテーマ・何段か先で外を継ぐ
      ['extends-link', (d) => { mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': '{"extends":"base"}' }); fs.symlinkSync(oTheme, path.join(d, 'themes', 'base')); }, ' data-theme="mine"'],
      ['extends-dotdot', (d) => mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': `{"extends":${JSON.stringify(path.relative(path.join(d, 'themes'), oTheme))}}` }), ' data-theme="mine"'],
      ['extends-chain', (d) => { mkTheme(d, 'a', { 'tokens.css': ':root{}', 'theme.json': '{"extends":"b"}' }); mkTheme(d, 'b', { 'tokens.css': ':root{}', 'theme.json': '{"extends":"c"}' }); fs.symlinkSync(oTheme, path.join(d, 'themes', 'c')); }, ' data-theme="a"'],
      ['extends-absolute', (d) => mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': JSON.stringify({ extends: oTheme }) }), ' data-theme="mine"'],
      ['component', (d) => { fs.mkdirSync(path.join(d, 'components', 'x'), { recursive: true }); fs.symlinkSync(secJs, path.join(d, 'components', 'x', 'index.js')); }, '', '<m-x></m-x>'],
      ['component-dir', (d) => { fs.mkdirSync(path.join(d, 'components')); fs.mkdirSync(path.join(outB, 'cx')); fs.writeFileSync(path.join(outB, 'cx', 'index.js'), `window.__leak="${SECRET}";`); fs.symlinkSync(path.join(outB, 'cx'), path.join(d, 'components', 'x')); }, '', '<m-x></m-x>'],
      ['component-shadow', (d) => { fs.mkdirSync(path.join(d, 'components')); fs.symlinkSync(path.join(outB, 'cx'), path.join(d, 'components', 'curves')); }, '', '<m-curves></m-curves>'],
    ]) {
      let r = null, err = null;
      try { r = themed(name, prep, attrs, body); } catch (e) { err = e; }
      ok(r && !leaks(r) && r.stats.warn.some((w) => /^refused: /.test(w)), `build reads: ${name} linking outside -> not read, warned, no outside bytes in the build ${err ? 'ERR ' + err.message : JSON.stringify(r.stats.warn.filter((w) => /refused/.test(w)).slice(0, 1))}`);
    }
    // 中を指すリンク・普通の継承（部品庫の default）はこれまでどおり
    const rin = themed('inner', (d) => { const t = mkTheme(d, 'mine', { 'real.css': ':root{--in:"INNER-OK"}', 'theme.json': '{"extends":"default"}' }); fs.symlinkSync(path.join(t, 'real.css'), path.join(t, 'tokens.css')); }, ' data-theme="mine"');
    ok(rin.html.includes('INNER-OK') && rin.stats.theme === 'mine' && !rin.stats.warn.some((w) => /refused/.test(w)), 'build reads: a link inside the theme folder and extends "default" still work');
    const rself = (() => { try { return themed('self', (d) => mkTheme(d, 'mine', { 'tokens.css': ':root{}', 'theme.json': '{"extends":"mine"}' }), ' data-theme="mine"'); } catch (e) { return e; } })();
    // File System Access（Chromium）：落としたフォルダの中のリンク（外のファイル・外のフォルダ・中のファイルへのもの）は一覧に出ず、名前でも開けず、
    // 書けない（編集アプリのフォルダの作業場所はリンクを見ない。ブラウザが変わればこの試験が知らせる）
    {
      const pick = path.join(sy, 'pick'); fs.mkdirSync(pick);
      fs.writeFileSync(path.join(pick, 'plain.txt'), 'inner');
      fs.symlinkSync(secret, path.join(pick, 'link.txt'));
      fs.symlinkSync(outside, path.join(pick, 'linkdir'));
      fs.symlinkSync('plain.txt', path.join(pick, 'inner.txt'));
      const fctx = await browser.newContext();
      const fp = await fctx.newPage();
      await fp.goto(ORIGIN + '/fsa');
      const cdp = await fctx.newCDPSession(fp);
      const data = { items: [], files: [pick], dragOperationsMask: 1 };
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 100, y: 100, data });
      await fp.waitForFunction(() => window.R, null, { timeout: 10000 }).catch(() => {});
      const R = await fp.evaluate(() => window.R);
      await fctx.close();
      ok(R && !R.error && R.names.join() === 'plain.txt' && R['link.txt'] === 'NotFoundError' && R['linkdir'] === 'NotFoundError' && R['inner.txt'] === 'NotFoundError' && R.write === 'NotFoundError' && fs.readFileSync(secret, 'utf8') === 'OUTSIDE-SECRET',
        'File System Access (Chromium ' + browser.version() + '): links in a picked folder are not listed, cannot be opened by name and cannot be written ' + JSON.stringify(R));
    }
    ok(rself instanceof Error && /nested too deeply/.test(rself.message), 'build reads: a theme that extends itself stops with an error (no endless recursion)');
    const sub = (ur.written.find((w) => w.includes('/')) || 'missing/x').split('/')[0];
    ok(sub === 'data', 'portable unpack: the archive has a sub folder to attack (' + ur.written.join(' ') + ')');
    for (const [label, prep] of [
      ['dangling deck.html', (u) => fs.symlinkSync(path.join(outside, 'unpacked.html'), path.join(u, 'deck.html'))],
      ['narration.md linking to an outside file', (u) => fs.symlinkSync(secret, path.join(u, 'narration.md'))],
      [`symlinked ${sub}/`, (u) => fs.symlinkSync(outside, path.join(u, sub))],
    ]) {
      const u = path.join(sy, 'un-' + label.replace(/\W+/g, '-')); fs.mkdirSync(u); prep(u);
      let code = null; try { await unpack(path.join(sy, 'p.ega.html'), u, { force: true }); } catch (e) { code = e.code; }
      ok(code === 'bad-path' && !fs.existsSync(path.join(outside, 'unpacked.html')) && snapOut() === out0 && fs.readFileSync(secret, 'utf8') === 'OUTSIDE-SECRET' && fs.readdirSync(u).length === 1, `portable unpack --force: ${label} -> refused before writing anything (${code})`);
    }
  }
  // ---- 組み立ての上限（format spec §11）：小さな依存を何万回も取り込む・@import の繰り返し・式の数で膨らませると、その場で断る（子の process で、
  // かかった時間と最大の RSS も見る）。上限は opts.limits で変えられ、実際のデッキは既定の上限の内（examples の組み立てが通ること）
  {
    const bombs = path.join(tmp, 'bombs'); fs.mkdirSync(bombs);
    const deckOf = (name, body, files = {}) => {
      const d = path.join(bombs, name); fs.mkdirSync(d);
      for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
      fs.writeFileSync(path.join(d, 'deck.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div id="stage"><section class="slide"><h2>x</h2>${body}</section></div></body></html>`);
      return path.join(d, 'deck.html');
    };
    const imp = (n, to) => Array.from({ length: n }, () => `@import "${to}";`).join('\n');
    const CASES2 = [
      ['include x100000', deckOf('inc', '/*INCLUDE:dep.txt*/'.repeat(100000), { 'dep.txt': '<p>' + 'x'.repeat(200) + '</p>' }), /includes and embeds/],
      ['include 5000 x 20 KB', deckOf('big', '/*INCLUDE:dep.txt*/'.repeat(5000), { 'dep.txt': '<p>' + 'x'.repeat(20000) + '</p>' }), /expanded source/],
      ['json x20000', deckOf('json', '<script type="application/json" id="j">[' + Array(20000).fill('{{JSON:d.json}}').join(',') + ']</script>', { 'd.json': '{"a":1}' }), /includes and embeds/],
      ['@import 40^3', deckOf('css', '<style>@import "a.css";</style>', { 'a.css': imp(40, 'b.css'), 'b.css': imp(40, 'c.css'), 'c.css': imp(40, 'd.css'), 'd.css': 'p{color:red}' }), /includes and embeds/],
      ['image x20000', deckOf('img', '<img src="i.png">'.repeat(20000), { 'i.png': 'x'.repeat(100) }), /includes and embeds|tags/],
      ['formulas x30000', deckOf('math', '\\(x\\)'.repeat(30000)), /formulas/],
      ['tags x600000', deckOf('tags', '<b>'.repeat(600000)), /tags in the source/],
    ];
    // 読むものすべて（テーマのロゴ・テーマと親のテーマ・部品・音声）を 1 つの数え方に、読む前に（大きさで）数える。
    // 大きなファイルは中身が 0 の疎なファイル（ftruncate。ディスクを使わない）にして、読まずに断ること（最大 RSS が小さいまま）を見る
    const MiB = 1048576;
    const sparse = (f, n) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, n); fs.closeSync(fd); };
    const themed = (name, theme, body = '') => { const f = deckOf(name, body); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<html lang="en">', `<html lang="en" data-theme="${theme}">`).replace('<section class="slide">', '<section class="slide cover">')); return f; };
    const theme = (deck, name, files) => { const d = path.join(path.dirname(deck), 'themes', name); fs.mkdirSync(d, { recursive: true }); for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t); return d; };
    { const f = themed('logos', 'lg'); theme(f, 'lg', { 'tokens.css': ':root{}', 'theme.json': JSON.stringify({ logos: Array(10001).fill('l.png') }), 'l.png': 'x'.repeat(10) });
      CASES2.push(['theme logos x10001', f, /includes and embeds/]); }
    { const f = themed('logobig', 'lb'); const d = theme(f, 'lb', { 'tokens.css': ':root{}', 'theme.json': JSON.stringify({ logos: ['l.png'] }) }); sparse(path.join(d, 'l.png'), 1024 * MiB);
      CASES2.push(['theme logo 1 GiB', f, /files read/]); }
    { const f = themed('tokbig', 'tb'); const d = theme(f, 'tb', { 'theme.json': '{}' }); sparse(path.join(d, 'tokens.css'), 1024 * MiB);
      CASES2.push(['theme tokens.css 1 GiB', f, /files read/]); }
    { const f = themed('chain', 't0');
      for (let i = 0; i < 16; i++) { const d = theme(f, 't' + i, { 'theme.json': JSON.stringify(i < 15 ? { extends: 't' + (i + 1) } : {}) }); sparse(path.join(d, 'tokens.css'), 4 * MiB); }
      CASES2.push(['16 inherited themes x 4 MiB (readChars 32 MiB)', f, /files read/, { limits: { readChars: 32 * MiB } }]); }
    { const f = deckOf('compbig', '<m-huge></m-huge>'); sparse(path.join(path.dirname(f), 'components', 'huge', 'index.js'), 1024 * MiB);
      CASES2.push(['component script 1 GiB', f, /files read/]); }
    { const f = deckOf('comps', Array.from({ length: 12 }, (_, i) => `<m-c${i}></m-c${i}>`).join(''));
      for (let i = 0; i < 12; i++) sparse(path.join(path.dirname(f), 'components', 'c' + i, 'index.js'), 4 * MiB);
      CASES2.push(['12 component scripts x 4 MiB (readChars 32 MiB)', f, /files read/, { limits: { readChars: 32 * MiB } }]); }
    { const f = deckOf('audbig', ''); const a = path.join(path.dirname(f), 'audio'); sparse(path.join(a, 'big.mp3'), 1024 * MiB);
      fs.writeFileSync(path.join(a, 'manifest.json'), JSON.stringify({ segments: { 'x:0': { file: 'big.mp3', dur: 1, cues: [] } } }));
      CASES2.push(['embedded audio 1 GiB', f, /files read/, { embedAudio: true }]); }
    for (const [name, file, re, extra] of CASES2) {
      const code = `import { build } from ${JSON.stringify(path.join(ROOT, 'kit/build.mjs'))}; const t0 = Date.now(); let m = 'built'; try { build(${JSON.stringify(file)}, { subset: false, ...${JSON.stringify(extra || {})} }); } catch (e) { m = e.code + ': ' + e.message; } console.log(JSON.stringify({ m, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS }));`;
      const rr = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 60000 });
      let o = {}; try { o = JSON.parse(rr.stdout.trim().split('\n').pop()); } catch { o = { m: 'no result: ' + rr.stderr.slice(0, 200) }; }
      const maxRss = extra || /GiB|x10001/.test(name) ? 300 * 1024 : 1024 * 1024;   // 読まずに断るもの：大きなファイルの中身を確保しない
      ok(/^build-too-large: /.test(o.m) && re.test(o.m) && o.ms < 5000 && o.rss < maxRss, `build limits: ${name} -> refused quickly with bounded memory (${o.m}; ${o.ms} ms; max RSS ${Math.round((o.rss || 0) / 1024)} MiB)`);
    }
    // 上限は変えられる。小さくすれば普通のデッキも断り、大きくすれば通る
    let small = null; try { build(deckOf('low', '/*INCLUDE:dep.txt*/'.repeat(10), { 'dep.txt': 'x' }), { subset: false, limits: { includes: 5 } }); } catch (e) { small = e.code; }
    ok(small === 'build-too-large', 'build limits: opts.limits can be lowered (includes: 5 refuses 10 includes)');
    const rbig = build(deckOf('ok', '/*INCLUDE:dep.txt*/'.repeat(12000), { 'dep.txt': 'x' }), { subset: false, limits: { includes: 20000 } });
    ok(rbig.html.length > 0, 'build limits: opts.limits can be raised');
    // 持ち運べる形式の書き出しも組み立てと 1 つの数え方：書き出しが読むもの（voice.json・音声・口述原稿）も読む前に数え、塊・読める層・索引を入れた
    // 出力の全体もつなぐ前に確かめる（子の process で最大 RSS も見る）
    {
      const portableCase = (name, prep, re, extra = {}) => {
        const f = deckOf(name, ''); const d = path.dirname(f);
        fs.writeFileSync(path.join(d, 'narration.md'), '# n\n\n## x\n[0] hello\n');
        prep(d);
        const code = `import { buildPortable } from ${JSON.stringify(path.join(ROOT, 'kit/build.mjs'))}; const t0 = Date.now(); let m = 'built'; try { await buildPortable(${JSON.stringify(f)}, { subset: false, ...${JSON.stringify(extra)} }); } catch (e) { m = e.code + ': ' + e.message; } console.log(JSON.stringify({ m, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS }));`;
        const rr = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 60000 });
        let o = {}; try { o = JSON.parse(rr.stdout.trim().split('\n').pop()); } catch { o = { m: 'no result: ' + rr.stderr.slice(0, 200) }; }
        ok(/^build-too-large: /.test(o.m) && re.test(o.m) && o.ms < 5000 && o.rss < 300 * 1024 && !fs.existsSync(path.join(d, 'out')), `portable limits: ${name} -> refused before allocating (${o.m}; ${o.ms} ms; max RSS ${Math.round((o.rss || 0) / 1024)} MiB)`);
      };
      const manifest = (d, file) => { fs.mkdirSync(path.join(d, 'audio'), { recursive: true }); fs.writeFileSync(path.join(d, 'audio', 'manifest.json'), JSON.stringify({ segments: { 'x:0': { file, dur: 1, cues: [] } } })); };
      portableCase('voice.json 1 GiB', (d) => sparse(path.join(d, 'voice.json'), 1024 * MiB), /files read/);
      portableCase('audio manifest entry 1 GiB (.mp3)', (d) => { manifest(d, 'big.mp3'); sparse(path.join(d, 'audio', 'big.mp3'), 1024 * MiB); }, /files read/);
      portableCase('audio manifest entry 1 GiB (.wav, before compressing)', (d) => { manifest(d, 'big.wav'); sparse(path.join(d, 'audio', 'big.wav'), 1024 * MiB); }, /files read/);
      portableCase('narration.md 1 GiB', (d) => sparse(path.join(d, 'narration.md'), 1024 * MiB), /files read/);
      portableCase('egatari.json 1 GiB', (d) => sparse(path.join(d, FORMAT.CONFIG_FILE), 1024 * MiB), /files read/);
      // 組み立ては上限の内でも、書き出しが読む音声で合計が上限を超えれば断る（組み立てと書き出しで 1 つの数え方）
      { const core = await import('../kit/core/build-core.mjs'); const { nodeEnv } = await import('../kit/build.mjs');
        const f = deckOf('one-budget', ''); const d = path.dirname(f);
        fs.writeFileSync(path.join(d, 'narration.md'), '# n\n\n## x\n[0] hello\n');
        manifest(d, 'a.mp3'); fs.writeFileSync(path.join(d, 'audio', 'a.mp3'), Buffer.alloc(4 * MiB, 7));
        const bud = core.buildBudget({}); core.build(nodeEnv, f, { subset: false, budget: bud, audioRef: () => 'x' });
        const limits = { readChars: bud.input + 2 * MiB };
        let e = null; try { await buildPortable(f, { subset: false, limits }); } catch (x) { e = x; }
        ok(e && e.code === 'build-too-large' && /files read/.test(e.message), `portable limits: the build fits (${bud.input} chars read) but the exported 4 MiB audio goes over readChars -> refused (${e && e.message})`);
        // 塊を作る前に、出力の全体（組み立ての出力と塊）の見積もりを確かめる
        const b2 = core.buildBudget({}); const r2 = core.build(nodeEnv, f, { subset: false, budget: b2, audioRef: () => 'x' });
        let e2 = null; try { await buildPortable(f, { subset: false, limits: { bundledChars: r2.html.length + 2 * MiB } }); } catch (x) { e2 = x; }
        ok(e2 && e2.code === 'build-too-large' && /portable document/.test(e2.message), `portable limits: the build output fits bundledChars but the archive chunks would not -> refused before encoding (${e2 && e2.message})`);
        const ok3 = await buildPortable(f, { subset: false });
        ok(ok3.html.length > 4 * MiB, 'portable limits: the same deck exports under the default limits');
        fs.rmSync(path.join(d, FORMAT.CONFIG_FILE), { force: true }); }
    }
    // 通常のファイルだけを読む・実際に読んだバイトで数える（format spec §11）。FIFO は開けば止まる：子の process で、期限付きで（止まれば失敗）
    const child = (code, timeout = 20000) => {
      const rr = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout });
      try { return JSON.parse(rr.stdout.trim().split('\n').pop()); } catch { return { m: rr.error && rr.error.code === 'ETIMEDOUT' ? 'hung (timeout)' : 'no result: ' + String(rr.stderr).slice(0, 200) }; }
    };
    const buildIn = (file, extra = {}, fn = 'build') => `import { ${fn} } from ${JSON.stringify(path.join(ROOT, 'kit/build.mjs'))}; const t0 = Date.now(); let m = 'built'; try { await ${fn}(${JSON.stringify(file)}, { subset: false, ...${JSON.stringify(extra)} }); } catch (e) { m = e.code + ': ' + e.message; } console.log(JSON.stringify({ m, ms: Date.now() - t0, rss: process.resourceUsage().maxRSS }));`;
    if (process.platform !== 'win32' && spawnSync('mkfifo', ['--help']).error?.code !== 'ENOENT') {
      const fifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); spawnSync('mkfifo', [f]); return fs.statSync(f).isFIFO(); };
      { const f = deckOf('fifo-inc', '/*INCLUDE:pipe.txt*/'); const made = fifo(path.join(path.dirname(f), 'pipe.txt'));
        const o = child(buildIn(f));
        ok(made && /^build-not-a-file: /.test(o.m) && o.ms < 5000, `regular files only: a FIFO as an include -> refused at once, no hang (${o.m}; ${o.ms} ms)`); }
      { const f = themed('fifo-tok', 'ft'); const d = theme(f, 'ft', { 'theme.json': '{}' }); const made = fifo(path.join(d, 'tokens.css'));
        const o = child(buildIn(f));
        ok(made && /^build-not-a-file: /.test(o.m) && o.ms < 5000, `regular files only: a FIFO as the theme's tokens.css -> refused at once, no hang (${o.m}; ${o.ms} ms)`); }
      { const f = deckOf('fifo-aud', ''); const a = path.join(path.dirname(f), 'audio'); const made = fifo(path.join(a, 'p.wav'));
        fs.writeFileSync(path.join(a, 'manifest.json'), JSON.stringify({ segments: { 'x:0': { file: 'p.wav', dur: 1, cues: [] } } }));
        fs.writeFileSync(path.join(path.dirname(f), 'narration.md'), '# n\n\n## x\n[0] hello\n');
        const o1 = child(buildIn(f, { embedAudio: true })), o2 = child(buildIn(f, {}, 'buildPortable'));
        ok(made && /^build-not-a-file: /.test(o1.m) && /^build-not-a-file: /.test(o2.m), `regular files only: a FIFO as embedded / exported audio -> refused, no hang (${o1.m}; ${o2.m})`); }
    }
    // env.size は見積もり：嘘をついても（0）実際に読んだバイトで数え、上限を効かせる。大きさを見た後に大きくなったファイルは断る
    {
      const core = await import('../kit/core/build-core.mjs');
      const lie = { path, readText: () => 'x'.repeat(32), readBase64: () => 'eHh4eHh4eHh4eHh4', size: () => 0 };
      const b1 = core.buildBudget({ readChars: 4 }); let e1 = null; try { core.chargedEnv(lie, b1).readText('/a'); } catch (e) { e1 = e; }
      ok(e1 && e1.code === 'build-too-large' && /files read \(32\)/.test(e1.message), `actual bytes: size() says 0 but 32 are read -> charged and refused by the limit 4 (${e1 && e1.message})`);
      const b2 = core.buildBudget({}); let e2 = null; try { core.chargedEnv(lie, b2).readText('/a'); } catch (e) { e2 = e; }
      ok(e2 && e2.what === 'changed file' && b2.input === 32, `actual bytes: under a large limit the 32 bytes are still charged (${b2.input}) and the mismatch refused (${e2 && e2.message})`);
      const noSize = { path, readText: () => 'x'.repeat(32) };
      const b3 = core.buildBudget({}); core.chargedEnv(noSize, b3).readText('/a');
      ok(b3.input === 32, `actual bytes: without size() the bytes read are charged (${b3.input})`);
      // Node：size() が嘘（0）なら、その大きさまでしか読まない（読んでから数えるのでなく、0 バイトを超えたところで断る）
      const { nodeEnv } = await import('../kit/build.mjs');
      const f = deckOf('lying', '/*INCLUDE:dep.txt*/', { 'dep.txt': 'y'.repeat(4096) });
      let e3 = null; try { core.build({ ...nodeEnv, size: (p) => (p.endsWith('dep.txt') ? 0 : nodeEnv.size(p)) }, f, { subset: false }); } catch (e) { e3 = e; }
      ok(e3 && e3.what === 'changed file', `actual bytes: Node with a lying size() (0) refuses the 4096-byte include (${e3 && e3.message})`);
      // 大きさを見た後に大きくなる
      const g = deckOf('growing', '/*INCLUDE:dep.txt*/', { 'dep.txt': 'z'.repeat(100) });
      let e4 = null; try { core.build({ ...nodeEnv, size: (p) => { const n = nodeEnv.size(p); if (p.endsWith('dep.txt')) fs.appendFileSync(p, 'z'.repeat(1 << 20)); return n; } }, g, { subset: false }); } catch (e) { e4 = e; }
      ok(e4 && e4.what === 'changed file', `actual bytes: a file growing between size and read -> refused (${e4 && e4.message})`);
      // 読む間に大きくなる（開いた fd の大きさより多く読める）
      const { readRegular } = await import('../kit/build.mjs');
      const gf = path.join(path.dirname(g), 'grow2.txt'); fs.writeFileSync(gf, 'a'.repeat(10));
      const fd0 = fs.openSync(gf, 'a'); const realFstat = fs.fstatSync;
      fs.fstatSync = (fd, ...r) => { const st = realFstat(fd, ...r); fs.writeSync(fd0, 'b'.repeat(10)); fs.fstatSync = realFstat; return st; };
      let e5 = null; try { readRegular(gf, 1000); } catch (e) { e5 = e; } finally { fs.fstatSync = realFstat; fs.closeSync(fd0); }
      ok(e5 && e5.code === 'read-over', `actual bytes: a file growing while it is read -> refused (${e5 && e5.code})`);
    }
  }
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
