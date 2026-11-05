// 試験の待ちの上限を 1 か所で伸ばす（遅い CI の runner 向け）：TEST_TIMEOUT_SCALE（既定 1）を掛ける
//   import { scaled } from './wait-scale.mjs';  await page.waitForSelector('#x', { timeout: scaled(10000) });
// 上限は「ここまで待っても来なければ失敗」の値なので、伸ばしても通る試験は遅くならない（待つのは条件が満ちるまで）。
// 速さを確かめる値（「15 秒以内に答える」などの ok の条件）には掛けない。CI は .github/workflows/test.yml で OS ごとに決める（macOS は 3）。
// Playwright の既定の上限（click・fill・waitForSelector の 30 秒）は kit/browser.mjs の launch() が同じ値で伸ばす
const raw = Number(process.env.TEST_TIMEOUT_SCALE);
export const SCALE = Number.isFinite(raw) && raw >= 1 ? raw : 1;
export const scaled = (ms) => Math.round(ms * SCALE);
