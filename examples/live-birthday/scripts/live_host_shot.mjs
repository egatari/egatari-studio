// Fictional Live on a LOCAL server only (127.0.0.1:8799), for gallery screenshots of the host page.
// Usage: EGATARI_STUDIO=<path to an egatari-studio checkout> node live_host_shot.mjs <out-dir>
// playwright-core is loaded from that checkout's node_modules.
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import crypto from 'crypto';
const STUDIO = process.env.EGATARI_STUDIO;
if (!STUDIO || !existsSync(join(STUDIO, 'package.json'))) {
  console.error('Set EGATARI_STUDIO to an egatari-studio checkout (the folder with its package.json and node_modules/playwright-core).');
  process.exit(2);
}
const OUT = process.argv[2];
if (!OUT) {
  console.error('Usage: EGATARI_STUDIO=<studio> node live_host_shot.mjs <out-dir>');
  process.exit(2);
}
const require = createRequire(join(resolve(STUDIO), 'package.json'));
const { chromium } = require('playwright-core');
const EP = 'http://127.0.0.1:8799';
const b64u = (b) => Buffer.from(b).toString('base64url');
const b32 = (b) => { const a = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, o = '';
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { o += a[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) o += a[(v << (5 - bits)) & 31]; return o; };
const setup = b64u(crypto.randomBytes(32));
const room = 'r-' + b32(crypto.createHash('sha256').update('egatari-live/v1/room:' + setup).digest().subarray(0, 5));
const key = b64u(crypto.createHash('sha256').update('egatari-live/v1/key:' + setup).digest().subarray(0, 16));
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const activities = {
  '*': [{ id: 'qa', kind: 'qa' }, { id: 'confused', kind: 'confused' }],
  's-guq66g:1': [{ id: 'p1', kind: 'poll', label: '2 枚目「まず予想する」・ステップ 1',
    prompt: '40 人のクラスで、同じ誕生日の 2 人がいる確率は？', choices: ['約 1 割', '約 3 割', '約 5 割', '約 9 割'] }],
};
const payload = { v: 1, endpoint: EP, room, key, setup, window: { from: iso(now - 60e3), to: iso(now + 2 * 3600e3) }, activities };
const str = 'egatari-live-setup-v1:' + b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = (lang = 'ja-JP') => browser.newContext({ locale: lang, viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
const host = await (await ctx()).newPage();
await host.goto(EP + '/?lang=ja');
await host.fill('#setup-string', str);
await host.waitForTimeout(800);
await host.click('#setup-btn');
await host.waitForURL(/room/, { timeout: 15000 });
await host.waitForTimeout(1500);
console.log('host url', host.url().replace(/admin=[^&]+/, 'admin=…'));
// fictional participants on the join page
const people = [
  { name: '生徒 A（架空）', vote: 1, q: '全員ばらばらの確率を求めるのはなぜですか？', confused: true },
  { name: '生徒 B（架空）', vote: 1, q: null, confused: true },
  { name: '生徒 C（架空）', vote: 3, q: '365 日でなく 366 日にすると、答えは変わりますか？', confused: false },
  { name: '生徒 D（架空）', vote: 2, q: null, confused: false },
];
for (const p of people) {
  const pg = await (await ctx()).newPage();
  await pg.goto(`${EP}/join?lang=ja#room=${room}&key=${key}`);
  await pg.click('#join'); await pg.waitForTimeout(1200);
  if (await pg.isVisible('#name')) await pg.fill('#name', p.name);
  const radios = pg.locator('#polls input[type=radio]');
  if (await radios.count()) { await radios.nth(p.vote).check(); const btn = pg.locator('#polls button'); if (await btn.count()) await btn.first().click(); }
  if (p.q) { await pg.fill('#question', p.q); await pg.click('#send'); }
  if (p.confused) await pg.click('#confused');
  await pg.waitForTimeout(800);
}
await host.waitForTimeout(2000);
await host.screenshot({ path: OUT + '/host-full.png', fullPage: true });
await host.screenshot({ path: OUT + '/host-top.png' });
console.log('done');
await browser.close();
