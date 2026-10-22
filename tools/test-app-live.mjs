// 編集アプリの「授業の部屋を付けて配る」（app/live-panel.js。拡張 live）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testAppLive({page, ctx, BASE, ok, opfs, menuClick, frame, shot})   開いた作業フォルダ（OPFS の minimal）で
// 1. 板を開く・教員のページの字を貼る（教員のリンクは断る）・Q&A・投票を足す（段階はプレビューの段階）・直すことが 0
// 2. 活動の JSON（教員のページに渡す）・設定を教材に残す（FORMAT.CONFIG_FILE の extensions.live に鍵がない）
// 3. 部屋を付けて書き出す：CSP の <meta> が <head> の直後、拡張のブロックに鍵と活動。部屋を付けない書き出しには何も入らない
// 5. 投票の表示名（label）：作るときにスライドの番号・見出し・段階の番号から作り、段階の候補・投票の一覧に出す（鍵は title）。活動の JSON に入る。
//    label のない古い投票は、開いたときにスライドが見つかれば付け、見つからなければ鍵から「s-xxx · 段階 1」で出す
// 4. この間、編集アプリはどこにも要求を出さない（同じ origin のほか 0、WebSocket 0）。編集アプリのページの CSP は変わらない
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';
import { clickUntil } from './click-retry.mjs';
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
    ok(await page.inputValue('#live-key') === '' && /これはホスト用リンクです/.test(await page.textContent('#toast')), 'live panel: the teacher link (with the teacher key) is refused');
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
    // 表示名：「2 枚目『見出し』・段階 2」（スライドも段階も 1 から）。段階の鍵は吹き出しに
    const h2 = await frame.evaluate(() => document.querySelectorAll('section.slide')[1].querySelector('h1, h2').textContent.replace(/\s+/g, ' ').trim());
    const label = `2 枚目『${h2}』・ステップ 2`;
    ok(await page.textContent('#live-poll-0-label') === label && (await page.getAttribute('#live-poll-0-label', 'title')).includes(step), `live panel: the new poll is shown by its label (${label}), the key in the tooltip`);
    ok(await page.$eval('#live-panel fieldset.live-poll legend', (e) => [e.textContent, e.title]).then(([t, ti]) => t === `p1 · ${label}` && ti.includes(step)), 'live panel: the poll list shows the label (legend), the key in the tooltip');
    ok(await page.$eval(`#live-steps option[value="${step}"]`, (e) => e.getAttribute('label')) === label && await page.$eval('#live-steps option[value$=":0"]', (e) => /^\d+ 枚目『.+』・ステップ 1$/.test(e.getAttribute('label'))), 'live panel: the step suggestions carry the labels');
    await page.fill('#live-poll-0-prompt', '学習率を大きくすると？');
    await page.fill('#live-poll-0-c0', '速く収束');
    await page.fill('#live-poll-0-c1', '発散しうる');
    await page.click('#live-panel .live-addchoice');
    await page.fill('#live-poll-0-c2', '変わらない');
    ok(await page.$eval('#live-problem-box', (e) => !e.querySelector('#live-problems')), 'live panel: nothing to fix');
    const acts = JSON.parse(await page.inputValue('#live-json'));
    ok(JSON.stringify(acts) === JSON.stringify({ '*': [{ id: 'qa', kind: 'qa' }], [step]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'], label }] }), 'live panel: the activities JSON for the teacher page (with the label; the key unchanged)');
    // 「活動の JSON をコピー」：コピーする字にも label
    await page.evaluate(() => { window.__copied = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); } catch { /* なし */ } });
    await page.click('#live-copy');
    await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 }).catch(() => {});
    { const c = JSON.parse((await page.evaluate(() => window.__copied)) || '{}'); ok(c[step] && c[step][0].label === label && c[step][0].id === 'p1', 'copy activities JSON: the copied text carries the labels'); }
    await shot(page, 'live-poll-labels.png');
    // endpoint は https: だけ（ループバックの http: も断る。開発版でない書き出し）
    await page.fill('#live-endpoint', 'http://127.0.0.1:8787');
    ok(await page.$eval('#live-export', (b) => b.disabled) && /接続先が正しくありません/.test(await page.textContent('#live-problems')), 'live panel: an http://127.0.0.1 endpoint is refused (in Japanese)');
    await page.fill('#live-paste', block); await page.click('#live-read');
    { const pi = await page.$('#live-paste'); if (pi) await page.fill('#live-paste', ''); }
    // 窓が 3 時間より長い（部屋のサービス v1 の上限）
    const to0 = await page.inputValue('#live-to');
    await page.$eval('#live-to', (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, await page.evaluate((f) => { const d = new Date(new Date(f).getTime() + 4 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }, await page.inputValue('#live-from')));
    ok(await page.$eval('#live-export', (b) => b.disabled) && /3 時間まで/.test(await page.textContent('#live-problems')), 'live panel: a window over 3 hours is refused with a clear message');
    await page.$eval('#live-to', (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, to0);
    // 形の誤り：選択肢が空
    await page.fill('#live-poll-0-c2', '');
    ok(await page.$eval('#live-export', (b) => b.disabled) && !!(await page.$('#live-problems')), 'live panel: an empty choice is a problem; export is disabled');
    // 直すことは画面の言葉で（validate の code から。英語の開発者向けの文を出さない）
    { const t = await page.textContent('#live-problems'); ok(/投票 p1：選択肢 3 を入れてください（100 字まで）/.test(t) && !/live\.activities|characters/.test(t), `live panel: the problem is in plain Japanese ("${t}")`); }
    await page.$eval('#live-problem-box', (e) => e.scrollIntoView({ block: 'center' })); await shot(page, 'live-panel-problems.png');
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
    // label のない古い投票：開き直すと、スライドが見つかるものには付け、見つからないものは鍵から「s-xxx · 段階 2」で出す
    {
      const cfgNow = JSON.parse((await opfs.read(FORMAT.CONFIG_FILE)) || '{}');
      const old = { '*': [{ id: 'qa', kind: 'qa' }], [step]: [{ id: 'p1', kind: 'poll', prompt: 'old', choices: ['a', 'b'] }], 's-gone:1': [{ id: 'p2', kind: 'poll', prompt: 'gone', choices: ['a', 'b'] }] };
      cfgNow.extensions.live.activities = old;
      await opfs.write(FORMAT.CONFIG_FILE, JSON.stringify(cfgNow, null, 2) + '\n');
      await clickUntil(page, '#panel-close', () => page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));
      await menuClick('#b-export-live');
      await page.waitForSelector('#live-poll-1-label');
      ok(await page.textContent('#live-poll-0-label') === label, 'older poll without a label: the label is filled from the slide when the panel opens');
      ok(await page.textContent('#live-poll-1-label') === 's-gone · ステップ 2' && await page.getAttribute('#live-poll-1-label', 'title') === 'ステップの鍵：s-gone:1', 'older poll on an unknown slide: shown as "s-gone · 段階 2", the key in the tooltip');
      const a2 = JSON.parse(await page.inputValue('#live-json'));
      ok(a2[step][0].label === label && !('label' in a2['s-gone:1'][0]), 'older polls: the JSON gets a label only where one could be made');
    }
    // 板を閉じる（設定を消す：Q&A を切って投票を消して残すと、部屋の設定は残るが活動は空）
    await clickUntil(page, '#panel-close', () => page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));
  } finally {
    ctx.off('request', onReq);
    page.off('websocket', onWs);
  }
  ok(away.length === 0 && sockets.length === 0, `live panel: the editor made no request outside its own origin and opened no WebSocket (${away.slice(0, 3).join(', ')}${sockets.join(', ')})`);
}
