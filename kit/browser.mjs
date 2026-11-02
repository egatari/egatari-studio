// ヘッドレスのブラウザを起動する（検査・PDF・動画の書き出し・テストが共通で使う）
//   1. CHROME_PATH があれば、その実行ファイル
//   2. インストール済みの Google Chrome（playwright-core の channel 'chrome'）
//   3. Microsoft Edge（channel 'msedge'。Windows には最初から入っている）
//   4. Playwright の Chromium（`npx playwright-core install chromium` で入れたもの）
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export async function launch(opts = {}) {
  // 試験が shareBrowser() で起動した 1 つのブラウザがあれば、起動せずにつなぐ（引数のない launch() だけ。close はつなぎを切るだけで、ページは新しい context に入る）
  if (process.env[SHARED_WS] && !Object.keys(opts).length) return chromium.connect(process.env[SHARED_WS]);
  return (await launchWhich(opts)).browser;
}
// launch と同じ順で探し、どれで起動したかも返す：{browser, via}（via は 'CHROME_PATH' | 'chrome' | 'msedge' | 'chromium'。egatari doctor）
export async function launchWhich(opts = {}) {
  if (process.env.CHROME_PATH) return { browser: await chromium.launch({ ...opts, executablePath: process.env.CHROME_PATH }), via: 'CHROME_PATH' };
  const tried = [];
  for (const channel of ['chrome', 'msedge']) {
    try { return { browser: await chromium.launch({ ...opts, channel }), via: channel }; } catch (e) { tried.push(channel + ': ' + String(e.message).split('\n')[0]); }
  }
  try { return { browser: await chromium.launch(opts), via: 'chromium' }; } catch (e) {
    throw new Error('ブラウザを起動できない / no browser found.\n'
      + '  Install Google Chrome or Microsoft Edge, or run `npx playwright-core install chromium`, or set CHROME_PATH=/path/to/chrome.\n'
      + tried.map((t) => '  (' + t + ')\n').join('') + '  (chromium: ' + String(e.message).split('\n')[0] + ')');
  }
}
export { chromium };

// ---- 試験で 1 つのブラウザを使い回す（backlog #156）：ブラウザの起動は CI の遅い runner で 1 回数秒かかり、
// 品質チェック（kit/check.mjs）・abcjs の描画（kit/abcjs-node.mjs）・コンタクトシートなどの子のプロセスはそれぞれ起動していた。
// shareBrowser() は別のプロセス（このファイルを --serve で）にブラウザのサーバーを起こし、環境変数 SHARED_WS に場所を置く。
// 以後このプロセスと子のプロセスの引数のない launch() はそこにつなぐ。サーバーを別のプロセスにするのは、試験が spawnSync・execFileSync で
// 待っている間も子のプロセスがつなげるように（同じプロセスに置くと、止まったイベントループの上のサーバーを子が待ち続ける）。
// 試験のプロセスが終われば（標準入力が閉じれば）サーバーも終わる。返す関数で先に止められる
const SHARED_WS = 'EGATARI_TEST_BROWSER_WS';
export async function shareBrowser() {
  if (process.env[SHARED_WS]) return async () => {};
  const { spawn } = await import('node:child_process');
  const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const ws = await new Promise((resolve, reject) => {
    let out = '';
    ch.stdout.on('data', (d) => { out += d; const m = out.match(/^ws:\/\/\S+$/m); if (m) resolve(m[0]); });
    ch.on('exit', (code) => reject(new Error('shareBrowser: the browser server exited (' + code + ')')));
  });
  ch.stdout.resume();
  ch.unref(); ch.stdin.unref?.(); ch.stdout.unref?.();
  process.env[SHARED_WS] = ws;
  return async () => {
    delete process.env[SHARED_WS];
    if (ch.exitCode !== null) return;
    ch.ref();   // 止まるまで待つ間はこのプロセスを終えない
    await new Promise((r) => { ch.once('exit', r); ch.stdin.end(); });
  };
}
if (process.argv[2] === '--serve' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = {};
  let server = null;
  if (process.env.CHROME_PATH) server = await chromium.launchServer({ ...opts, executablePath: process.env.CHROME_PATH });
  for (const channel of ['chrome', 'msedge']) { if (server) break; try { server = await chromium.launchServer({ ...opts, channel }); } catch { /* 次へ */ } }
  if (!server) server = await chromium.launchServer(opts);
  process.stdout.write(server.wsEndpoint() + '\n');
  process.stdin.resume();
  process.stdin.on('end', async () => { await server.kill().catch(() => {}); process.exit(0); });   // close は Chrome を待って数秒かかる。試験の後なので落とす
}
// 相対パスでも file:// の URL にする
export const fileUrl = (f) => pathToFileURL(path.resolve(f)).href;

// ---- 画面を撮る：発表の操作の帯（#dt-cb）が写り込まないようにする ----
// talk モードの帯は読み込み直後に出て、実時間の setTimeout（2.5 秒）で消える（kit/tools.js）。
// 撮るまでの時間で絵が変わるので、検査・見本・テストの画面は必ずここを通す。
// ?mode=video では帯を作らない（kit/tools.js）ので、帯のない画面が欲しいだけなら captureUrl が最も確か。
export const CAPTURE_HIDE = '#dt-cb,#deck-toast,.deck-tools{display:none!important}';
// URL に mode=video（既定）を付ける。すでに mode= があれば置き換える。#hash は保つ
export function captureUrl(url, mode = 'video') {
  const u = new URL(url);
  u.searchParams.set('mode', mode);
  return u.href;
}
// 撮る前の準備：帯を隠す CSS を入れて 2 フレーム待つ（入れ直しても 1 つだけ）。戻すときは releaseCapture
export async function prepareForCapture(page) {
  await page.evaluate((css) => {
    if (!document.getElementById('__capture_hide')) {
      const s = document.createElement('style');
      s.id = '__capture_hide'; s.textContent = css;
      document.head.appendChild(s);
    }
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, CAPTURE_HIDE);
}
export const releaseCapture = (page) => page.evaluate(() => { const s = document.getElementById('__capture_hide'); if (s) s.remove(); });
// page.screenshot の代わり：準備をして、アニメーションとカーソルの点滅を止めて撮り、隠すのをやめる
// （帯そのものを試すテストが同じページで続けられるように。opts は screenshot にそのまま渡す）
export async function stableCapture(page, opts = {}) {
  await prepareForCapture(page);
  try { return await page.screenshot({ animations: 'disabled', caret: 'hide', ...opts }); }
  finally { await releaseCapture(page).catch(() => {}); }
}
