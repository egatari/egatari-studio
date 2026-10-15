// ヘッドレスのブラウザを起動する（検査・PDF・動画の書き出し・テストが共通で使う）
//   1. CHROME_PATH があれば、その実行ファイル
//   2. インストール済みの Google Chrome（playwright-core の channel 'chrome'）
//   3. Playwright の Chromium（`npx playwright-core install chromium` で入れたもの）
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export async function launch(opts = {}) {
  if (process.env.CHROME_PATH) return chromium.launch({ ...opts, executablePath: process.env.CHROME_PATH });
  let first;
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch (e) { first = e; }
  try { return await chromium.launch(opts); } catch (e) {
    throw new Error('ブラウザを起動できない / no browser found.\n'
      + '  Install Google Chrome, or run `npx playwright-core install chromium`, or set CHROME_PATH=/path/to/chrome.\n'
      + '  (chrome: ' + String(first.message).split('\n')[0] + ')\n  (chromium: ' + String(e.message).split('\n')[0] + ')');
  }
}
export { chromium };
// 相対パスでも file:// の URL にする
export const fileUrl = (f) => pathToFileURL(path.resolve(f)).href;
