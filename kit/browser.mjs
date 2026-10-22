// ヘッドレスのブラウザを起動する（検査・PDF・動画の書き出し・テストが共通で使う）
//   1. CHROME_PATH があれば、その実行ファイル
//   2. インストール済みの Google Chrome（playwright-core の channel 'chrome'）
//   3. Microsoft Edge（channel 'msedge'。Windows には最初から入っている）
//   4. Playwright の Chromium（`npx playwright-core install chromium` で入れたもの）
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export async function launch(opts = {}) {
  if (process.env.CHROME_PATH) return chromium.launch({ ...opts, executablePath: process.env.CHROME_PATH });
  const tried = [];
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ ...opts, channel }); } catch (e) { tried.push(channel + ': ' + String(e.message).split('\n')[0]); }
  }
  try { return await chromium.launch(opts); } catch (e) {
    throw new Error('ブラウザを起動できない / no browser found.\n'
      + '  Install Google Chrome or Microsoft Edge, or run `npx playwright-core install chromium`, or set CHROME_PATH=/path/to/chrome.\n'
      + tried.map((t) => '  (' + t + ')\n').join('') + '  (chromium: ' + String(e.message).split('\n')[0] + ')');
  }
}
export { chromium };
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
