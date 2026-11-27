// 「こんなパーツが欲しい…」の中継（relay/）と、編集アプリの側の決まり（app/part-request.js）の試験。Node だけ、ネットワークなし
//   node tools/test-relay.mjs
// test-all: unit
// 1. relay/test/relay.test.mjs（中継の Worker を偽の env と偽の fetch で呼ぶ：検査・Turnstile・GitHub への形・枠のページの CSP・設定）
// 2. 編集アプリ：中継の場所（PART_REQUEST_RELAY）と app/index.html の CSP の frame-src が合うこと（空なら 'none'）。connect-src は 'self' のまま
//    Studio の origin（PART_REQUEST_ORIGINS）が relay/wrangler.production.toml の STUDIO_ORIGINS と同じこと
// 3. 窓の言葉（ja・en の組）・送信できるかの判定（中継なし・オフライン版のエディタ・ほかの origin）・枠の URL・誤りの言葉
// 4. 組んだ後の中継：esbuild の keepNames（wrangler の既定）で組んだ Worker の /widget.js を偽の DOM で動かし、親に ready を送る（handoff #35：
//    本番の widget.js が定義のない __name(…) を呼んで最初の const で止まり、窓が「確認の枠を読み込めませんでした」になった）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { PART_REQUEST_RELAY, PART_REQUEST_ORIGINS, PROPOSAL_URL, STR, availability, relayOrigin, widgetUrl, errorText } from '../app/part-request.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 1. 中継（別のプロセス：中継の試験は console を見張るので）
const r = spawnSync(process.execPath, [path.join(ROOT, 'relay', 'test', 'relay.test.mjs')], { encoding: 'utf8' });
process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
ok(r.status === 0, 'relay/test/relay.test.mjs passes');

// 2. CSP
const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html) || [])[1] || '';
const frameSrc = (/(?:^|; )frame-src ([^;]+)/.exec(csp) || [])[1];
const want = PART_REQUEST_RELAY ? relayOrigin(PART_REQUEST_RELAY) : "'none'";
ok(frameSrc === want, `app/index.html frame-src is ${want} (PART_REQUEST_RELAY ${PART_REQUEST_RELAY ? 'set' : 'empty'})`);
ok(/(?:^|; )connect-src 'self'(;|$)/.test(csp) && !/challenges\.cloudflare\.com/.test(csp), 'the editor page still connects only to itself and never names Turnstile (Turnstile runs inside the relay\'s frame)');
ok(!PART_REQUEST_RELAY || /^https:\/\/[a-z0-9.-]+$/.test(PART_REQUEST_RELAY), 'PART_REQUEST_RELAY is empty or an https origin without a path');
const prodToml = fs.readFileSync(path.join(ROOT, 'relay', 'wrangler.production.toml'), 'utf8');
const prodOrigins = ((/^STUDIO_ORIGINS\s*=\s*"([^"]*)"/m.exec(prodToml) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
ok(prodOrigins.length > 0 && [...PART_REQUEST_ORIGINS].sort().join() === [...prodOrigins].sort().join(), `PART_REQUEST_ORIGINS matches STUDIO_ORIGINS in relay/wrangler.production.toml (${prodOrigins.join(', ')})`);
ok(PART_REQUEST_ORIGINS.every((o) => /^https:\/\/[a-z0-9.-]+$/.test(o)), 'PART_REQUEST_ORIGINS are https origins without a path');

// 3. 窓
const keys = (o) => Object.keys(o).sort().join();
ok(keys(STR.ja) === keys(STR.en), 'the dialog has the same strings in ja and en');
ok(Object.values(STR.ja).every((v) => typeof v === 'function' || !/見本|作り手|学ぶ人|再生器/.test(v)), 'ja strings avoid the glossary\'s avoided words');
ok(/egatari\/components/.test(STR.ja.consent) && /公開/.test(STR.ja.consent) && /egatari\/components/.test(STR.en.consent) && /public/.test(STR.en.consent), 'the consent line names the destination and says it is public');
const loc = (href) => { const u = new URL(href); return { protocol: u.protocol, origin: u.origin }; };
ok(availability('', loc('https://studio.egatari.org/')) === 'unset', 'no relay yet: unset');
ok(availability('https://request.egatari.org', loc('https://studio.egatari.org/v0.6.21/')) === 'ok', 'relay set, the published Studio (and its frozen copies): ok');
ok(availability('https://request.egatari.org', loc('http://127.0.0.1:8080/')) === 'offline' && availability('https://request.egatari.org', loc('https://example.org/')) === 'offline', 'another origin (a local server, a Studio hosted elsewhere): offline, as the relay would not serve the frame there');
ok(availability('https://request.egatari.org', loc('http://127.0.0.1:8080/'), ['http://127.0.0.1:8080']) === 'ok', 'the origins can be passed (the tests\' local relay)');
ok(/studio\.egatari\.org/.test(STR.ja.offline) && /studio\.egatari\.org/.test(STR.en.offline), 'the offline words name studio.egatari.org');
ok(availability('https://request.egatari.org', { protocol: 'file:', origin: 'null' }) === 'offline', 'the offline editor (file:): offline');
ok(widgetUrl('https://request.egatari.org/', 'https://studio.egatari.org', 'ja') === 'https://request.egatari.org/widget?parent=https%3A%2F%2Fstudio.egatari.org&lang=ja', 'the frame\'s address names the parent origin and the language');
ok(PROPOSAL_URL === 'https://github.com/egatari/components/issues/new/choose', 'the GitHub way: the components issue chooser');
ok(errorText('rate_limited', STR.ja) === STR.ja.errRate && errorText('turnstile_failed', STR.en) === STR.en.errCheck && errorText('unknown_field', STR.ja) === STR.ja.errInput && errorText('github_failed', STR.ja) === STR.ja.errFail && errorText(undefined, STR.en) === STR.en.errFail, 'relay error codes map to the dialog\'s words');

// 4. 組んだ後の中継の /widget.js
for (const keepNames of [true, false]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-bundle-'));
  try {
    const out = path.join(tmp, 'worker.mjs');
    await esbuild.build({ entryPoints: [path.join(ROOT, 'relay', 'src', 'index.js')], bundle: true, format: 'esm', platform: 'neutral', keepNames, outfile: out, logLevel: 'silent' });
    const worker = (await import(pathToFileURL(out).href)).default;
    const env = { PUBLIC_ORIGIN: 'https://request.egatari.org', STUDIO_ORIGINS: 'https://studio.egatari.org', GITHUB_REPO: 'egatari/components', ISSUE_LABEL: 'request', TURNSTILE_SITEKEY: '', TURNSTILE_SECRET: 'x', GITHUB_TOKEN: 'x', REQUEST_LIMITER: { async limit() { return { success: true }; } } };
    const src = await (await worker.fetch(new Request('https://request.egatari.org/widget.js'), env)).text();
    // 枠のページ（ページの中、親は Studio）。Turnstile のない開発の形：サイトキーなし
    const posted = [];
    const parentWin = { postMessage: (m, origin) => posted.push({ m, origin }) };
    const box = { getAttribute: (n) => (n === 'data-sitekey' ? '' : null) };
    const win = { parent: parentWin, addEventListener() {} };
    const ctx = vm.createContext({
      window: win, location: { search: '?parent=' + encodeURIComponent('https://studio.egatari.org') }, URLSearchParams,
      document: { getElementById: (id) => (id === 'turnstile' ? box : null), documentElement: { scrollHeight: 120 }, head: { append() {} }, createElement: () => ({}) },
      ResizeObserver: class { observe() {} },
    });
    let err = null;
    try { vm.runInContext(src, ctx); } catch (e) { err = e; }
    const ready = posted.find((p) => p.m && p.m.t === 'ready');
    ok(!err && ready && ready.origin === 'https://studio.egatari.org' && ready.m.check === false,
      `bundled relay (esbuild keepNames: ${keepNames}): /widget.js runs and posts ready to the Studio (${err ? err.message : posted.map((p) => p.m.t).join(',')})`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
