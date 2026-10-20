// 編集アプリの「授業の部屋を付けて配る」（app/live-panel.js。拡張 live）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testAppLive({page, ctx, BASE, ok, opfs, menuClick, frame, shot})   開いた作業フォルダ（OPFS の minimal）で
// 1. 板を開く・教員のページの字を貼る（教員のリンクは断る）・Q&A・投票を足す（段階はプレビューの段階）・直すことが 0
// 2. 活動の JSON（教員のページに渡す）・設定を教材に残す（FORMAT.CONFIG_FILE の extensions.live に鍵がない）
// 3. 部屋を付けて書き出す：CSP の <meta> が <head> の直後、拡張のブロックに鍵と活動。部屋を付けない書き出しには何も入らない
// 4. この間、編集アプリはどこにも要求を出さない（同じ origin のほか 0、WebSocket 0）。編集アプリのページの CSP は変わらない
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';
import { LIVE_BLOCK_ID } from '../kit/core/live.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROTO = path.join(ROOT, ...FORMAT.LIVE_VENDOR_DIR.split('/'));

export async function testAppLive({ page, ctx, BASE, ok, opfs, menuClick, frame, shot }) {
  const origin = new URL(BASE).origin;
  const away = [], sockets = [];
  const onReq = (r) => { const u = r.url(); if (!/^(data|blob|about):/.test(u) && !u.startsWith(origin + '/')) away.push(u); };
  const onWs = (w) => sockets.push(w.url());
  ctx.on('request', onReq);
  page.on('websocket', onWs);
  try {
    const cr = JSON.parse(fs.readFileSync(path.join(PROTO, 'fixtures', 'http', 'create-response.json'), 'utf8'));
    const from = new Date(Date.now() + 3600e3), to = new Date(Date.now() + 3 * 3600e3);
    const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
    const block = JSON.stringify({ v: 1, endpoint: cr.endpoint, room: cr.room, key: cr.key, window: { from: iso(from), to: iso(to) } }, null, 2);
    await menuClick('#b-export-live');
    await page.waitForSelector('#live-panel');
    ok(await page.inputValue('#live-endpoint') === FORMAT.LIVE_ENDPOINT, `live panel: the endpoint defaults to ${FORMAT.LIVE_ENDPOINT}`);
    // 教員のリンク（教員の鍵入り）は断る
    await page.fill('#live-paste', cr.teacherUrl);
    await page.click('#live-read');
    ok(await page.inputValue('#live-key') === '' && /教員のリンク/.test(await page.textContent('#toast')), 'live panel: the teacher link (with the teacher key) is refused');
    await page.fill('#live-paste', 'コピー：\n' + block);
    await page.click('#live-read');
    ok(await page.inputValue('#live-room') === cr.room && await page.inputValue('#live-key') === cr.key && (await page.inputValue('#live-from')).length === 16, 'live panel: the teacher page\'s copy block fills room, key and window');
    ok(await page.isChecked('#live-qa'), 'live panel: Q&A for the whole lesson is on by default');
    // 投票：プレビューの段階に
    await frame.evaluate(() => DECK.go(1, 1, false));
    await page.waitForFunction(() => true);
    await page.waitForTimeout(400);
    await page.click('#live-addpoll');
    const step = await page.inputValue('#live-poll-0-step');
    ok(/^[^:]+:1$/.test(step), `live panel: a new poll takes the step shown in the preview (${step})`);
    ok((await page.$$('#live-steps option')).length >= 6, 'live panel: step keys are offered (slides and narration)');
    await page.fill('#live-poll-0-prompt', '学習率を大きくすると？');
    await page.fill('#live-poll-0-c0', '速く収束');
    await page.fill('#live-poll-0-c1', '発散しうる');
    await page.click('#live-panel .live-addchoice');
    await page.fill('#live-poll-0-c2', '変わらない');
    ok(await page.$eval('#live-problem-box', (e) => !e.querySelector('#live-problems')), 'live panel: nothing to fix');
    const acts = JSON.parse(await page.inputValue('#live-json'));
    ok(JSON.stringify(acts) === JSON.stringify({ '*': [{ id: 'qa', kind: 'qa' }], [step]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'] }] }), 'live panel: the activities JSON for the teacher page');
    // 形の誤り：選択肢が空
    await page.fill('#live-poll-0-c2', '');
    ok(await page.$eval('#live-export', (b) => b.disabled) && !!(await page.$('#live-problems')), 'live panel: an empty choice is a problem; export is disabled');
    await page.fill('#live-poll-0-c2', '変わらない');
    // 教材に残す（鍵なし）
    await page.click('#live-save');
    let cfg = null;
    for (let i = 0; i < 50 && !(cfg && cfg.includes('"live"')); i++) { await page.waitForTimeout(100); cfg = await opfs.read(FORMAT.CONFIG_FILE); }
    const c = JSON.parse(cfg || '{}');
    ok(c.extensions && c.extensions.live && c.extensions.live.room === cr.room && !('key' in c.extensions.live) && !cfg.includes(cr.key), `save: ${FORMAT.CONFIG_FILE} keeps extensions.live without the key`);
    await shot(page, 'live-panel.png');
    // 部屋を付けて書き出す
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('live.play.ega.html', { create: true }); });
    await page.click('#live-export');
    let html = '';
    for (let i = 0; i < 300 && html.length < 1000; i++) { await page.waitForTimeout(100); html = (await opfs.read('live.play.ega.html')) || ''; }
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    const at = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    ok(at > 0 && at < html.search(/<script/i) && html.slice(0, at).trimEnd().endsWith('<head>'), 'export with a live room: the CSP meta right after <head>, before any script');
    const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [])[1] || '';
    ok(csp.includes(`; connect-src ${cr.endpoint} ${cr.endpoint.replace(/^https/, 'wss')};`), `export with a live room: connect-src is the endpoint only (${cr.endpoint})`);
    const m = new RegExp(`<script type="application/json" id="${LIVE_BLOCK_ID}">([^<]*)</script>`).exec(html);
    const data = m ? JSON.parse(m[1]).live : null;
    ok(data && data.key === cr.key && data.room === cr.room && JSON.stringify(data.activities) === JSON.stringify(acts), 'export with a live room: the block carries room, key and the activities');
    ok(!html.includes(`id="${FORMAT.INDEX_ID}"`), 'export with a live room: it is play-only (no index, no source)');
    // 部屋を付けない再生専用：何も入らない
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('plain.play.ega.html', { create: true }); });
    await menuClick('#b-export-play');
    let plain = '';
    for (let i = 0; i < 300 && plain.length < 1000; i++) { await page.waitForTimeout(100); plain = (await opfs.read('plain.play.ega.html')) || ''; }
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    ok(plain.length > 1000 && !plain.includes('Content-Security-Policy') && !plain.includes(LIVE_BLOCK_ID) && !plain.includes(cr.key), 'play-only without a room (the lesson has live settings): no CSP, no block, no key');
    // 編集アプリのページの決まりはそのまま（connect-src 'self'）
    const appCsp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
    const srcCsp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8')) || [])[1];
    ok(appCsp === srcCsp && /connect-src 'self';/.test(appCsp), 'the editor page\'s CSP is unchanged (connect-src \'self\')');
    // 板を閉じる（設定を消す：Q&A を切って投票を消して残すと、部屋の設定は残るが活動は空）
    await page.click('#panel-close');
  } finally {
    ctx.off('request', onReq);
    page.off('websocket', onWs);
  }
  ok(away.length === 0 && sockets.length === 0, `live panel: the editor made no request outside its own origin and opened no WebSocket (${away.slice(0, 3).join(', ')}${sockets.join(', ')})`);
}
