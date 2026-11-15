// ブラウザを起動できないときの知らせ（backlog #215）：入っていない（browser-missing：入れ方を案内）と、
// 入っているのに起動できない（browser-blocked：サンドボックスの外で動かす。入れ方・ダウンロードは案内しない）を分ける
//   node tools/test-browser-errors.mjs
import assert from 'node:assert/strict';
import { launchWhich, BROWSER_BLOCKED } from '../kit/browser.mjs';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok   ' + name); };
const errOf = async (env) => {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { const { browser } = await launchWhich({ headless: true, timeout: 15000 }); await browser.close(); return null; }
  catch (e) { return e; }
  finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const noSandbox = { CODEX_SANDBOX: undefined, CODEX_SANDBOX_NETWORK_DISABLED: undefined };

await ok('a CHROME_PATH that does not exist: browser-missing, with the install advice', async () => {
  const e = await errOf({ ...noSandbox, CHROME_PATH: '/nonexistent/egatari-no-chrome' });
  assert.equal(e && e.code, 'browser-missing');
  assert.match(e.message, /playwright-core install chromium/);
});
await ok('an executable that is not a browser (installed but cannot start): browser-blocked, no install or download advice', async () => {
  const e = await errOf({ ...noSandbox, CHROME_PATH: process.execPath });
  assert.equal(e && e.code, 'browser-blocked');
  assert.ok(e.message.startsWith(BROWSER_BLOCKED));
  assert.doesNotMatch(e.message.split('\n')[0], /install|playwright-core/);
});
await ok('in the Codex sandbox (CODEX_SANDBOX), a failed launch is browser-blocked even when nothing is found', async () => {
  const e = await errOf({ CODEX_SANDBOX: 'seatbelt', CHROME_PATH: '/nonexistent/egatari-no-chrome' });
  assert.equal(e && e.code, 'browser-blocked');
});
await ok('the blocked line: ブラウザ (not ブラウザー), ダウンロードしない, and the Codex permission', async () => {
  assert.match(BROWSER_BLOCKED, /^ブラウザを起動できない：サンドボックスの外で動かす（Codex では、このコマンドをサンドボックスの外で動かすのを許可する）。ブラウザをダウンロードしない \/ the browser could not start/);
  assert.doesNotMatch(BROWSER_BLOCKED, /ブラウザー|落とさない/);
});
console.log(`browser-errors: ${n} ok`);
