// 「こんなパーツが欲しい…」の中継（relay/）と、編集アプリの側の決まり（app/part-request.js）の試験。Node だけ、ネットワークなし
//   node tools/test-relay.mjs
// test-all: unit
// 1. relay/test/relay.test.mjs（中継の Worker を偽の env と偽の fetch で呼ぶ：検査・Turnstile・GitHub への形・枠のページの CSP・設定）
// 2. 編集アプリ：中継の場所（PART_REQUEST_RELAY）と app/index.html の CSP の frame-src が合うこと（空なら 'none'）。connect-src は 'self' のまま
// 3. 窓の言葉（ja・en の組）・送れるかの判定（中継なし・オフライン版のエディタ）・枠の URL・誤りの言葉
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PART_REQUEST_RELAY, PROPOSAL_URL, STR, availability, relayOrigin, widgetUrl, errorText } from '../app/part-request.js';

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

// 3. 窓
const keys = (o) => Object.keys(o).sort().join();
ok(keys(STR.ja) === keys(STR.en), 'the dialog has the same strings in ja and en');
ok(Object.values(STR.ja).every((v) => typeof v === 'function' || !/見本|作り手|学ぶ人|再生器/.test(v)), 'ja strings avoid the glossary\'s avoided words');
ok(/egatari\/components/.test(STR.ja.consent) && /公開/.test(STR.ja.consent) && /egatari\/components/.test(STR.en.consent) && /public/.test(STR.en.consent), 'the consent line names the destination and says it is public');
const loc = (href) => { const u = new URL(href); return { protocol: u.protocol, origin: u.origin }; };
ok(availability('', loc('https://studio.egatari.org/')) === 'unset', 'no relay yet: unset');
ok(availability('https://request.egatari.org', loc('https://studio.egatari.org/')) === 'ok' && availability('https://request.egatari.org', loc('http://127.0.0.1:8080/')) === 'ok', 'relay set, Studio on http(s): ok');
ok(availability('https://request.egatari.org', { protocol: 'file:', origin: 'null' }) === 'offline', 'the offline editor (file:): offline');
ok(widgetUrl('https://request.egatari.org/', 'https://studio.egatari.org', 'ja') === 'https://request.egatari.org/widget?parent=https%3A%2F%2Fstudio.egatari.org&lang=ja', 'the frame\'s address names the parent origin and the language');
ok(PROPOSAL_URL === 'https://github.com/egatari/components/issues/new/choose', 'the GitHub way: the components issue chooser');
ok(errorText('rate_limited', STR.ja) === STR.ja.errRate && errorText('turnstile_failed', STR.en) === STR.en.errCheck && errorText('unknown_field', STR.ja) === STR.ja.errInput && errorText('github_failed', STR.ja) === STR.ja.errFail && errorText(undefined, STR.en) === STR.en.errFail, 'relay error codes map to the dialog\'s words');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
