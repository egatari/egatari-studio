// 編集アプリの「授業の部屋を付けて配る」（app/live-panel.js。拡張 live）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testAppLive({page, ctx, BASE, ok, opfs, menuClick, frame, shot})   開いた作業フォルダ（OPFS の minimal）で
// 1. 板を開く・教員のページの字を貼る（教員のリンクは断る）・Q&A・投票を足す（段階はプレビューの段階）・直すことが 0
// 2. 活動の JSON（教員のページに渡す）・設定を教材に残す（FORMAT.CONFIG_FILE の extensions.live に鍵がない）
// 3. 部屋を付けて書き出す：CSP の <meta> が <head> の直後、拡張のブロックに鍵と活動。部屋を付けない書き出しには何も入らない
// 5. 投票の表示名（label）：作るときにスライドの番号・見出し・段階の番号から作り、段階の候補・投票の一覧に出す（鍵は title）。活動の JSON に入る。
//    label のない古い投票は、開いたときにスライドが見つかれば付け、見つからなければ鍵から「s-xxx · 段階 1」で出す
// 4. この間、編集アプリはどこにも要求を出さない（同じ origin のほか 0、WebSocket 0）。編集アプリのページの CSP は変わらない
// 0. 一方向の設定（PROTOCOL.md §2.1）：「この画面で作る」でライブ ID と参加コードができ（setup から導いたもの）、窓を決めると 1 本の文字列が出る。
//    文字列は写しの Schema の setupPayload に合い、コピーでそのまま渡り、ホストのページへのリンクがある。教材の設定にも書き出すファイルにも setup は入らない。
//    作ってからコピーするまで、要求は 1 つも出ない（同じ origin へも。ページの fetch・XMLHttpRequest・WebSocket・sendBeacon・EventSource も呼ばれない）。
//    前からの方法はたたんだ「前からの方法」の中にある。「設定の文字列を保存する」は文字列だけの .txt（egatari-live-setup-<room>.txt）をダウンロードし、
//    近くに「ホスト用リンクのように扱い、参加者に渡さない」の一行と、貼る前に閉じると配ったファイルのライブを誰も作れなくなる、の説明がある。
//    文字列（setup）は OPFS のどこにも（教材・egatari.json・控え）、localStorage・sessionStorage・IndexedDB にも、書き出したファイルにも残らない
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';
import { clickDlg } from './click-retry.mjs';
import { LIVE_BLOCK_ID, parseLiveSetupString, liveSetupIds } from '../kit/core/live.mjs';
import Ajv from 'ajv/dist/2020.js';

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
    const localInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const setWindow = async (f, t) => {
      for (const [id, d] of [['#live-from', f], ['#live-to', t]]) await page.$eval(id, (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, localInput(d));
    };
    const openManual = async () => { if (!(await page.$eval('#live-manual', (d) => d.open))) await page.click('#live-manual > summary'); };
    // ファイル ▾ → エクスポート ▸ → 参加者用（再生のみ）…：窓の「ライブ（質問・投票）を付ける」に印を付けると、同じ窓にライブの設定が出る（ui-redesign）
    const openLive = async () => {
      await menuClick('#b-export-play');
      await page.waitForSelector('#dlg[open] #play-live');
      await page.check('#play-live');
      await page.waitForSelector('#dlg[open] #play-live-box #live-panel');
    };
    ok(!(await page.$('#b-export-live')), 'live: there is no separate “Distribute with Live…” command');
    await menuClick('#b-export-play');
    await page.waitForSelector('#dlg[open] #play-live');
    ok(!(await page.isChecked('#play-live')) && !(await page.$('#live-panel')), 'live: the participant export dialog starts with Live unticked and no Live settings');
    await page.check('#play-live');
    await page.waitForSelector('#dlg[open] #play-live-box #live-panel');
    ok(await page.isVisible('#live-make') && !(await page.$('#live-export')) && !(await page.$('#live-import-results')), 'live: ticking it shows the Live settings in the same dialog (its own export button and results import are not there)');
    ok(await page.inputValue('#live-endpoint') === FORMAT.LIVE_ENDPOINT, `live panel: the endpoint defaults to ${FORMAT.LIVE_ENDPOINT}`);

    // ---------------------------------------------------------------- 0. 一方向の設定
    {
      // ページの中の通信の口を数える（呼ばれたら記録して、そのまま通す）
      await page.evaluate(() => {
        const calls = window.__netCalls = [];
        const wrap = (obj, name, label) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function (...a) { calls.push(label + ' ' + String(a[0] && (a[0].url || a[0]))); return f.apply(this, a); }; };
        wrap(window, 'fetch', 'fetch'); wrap(XMLHttpRequest.prototype, 'open', 'xhr'); wrap(navigator, 'sendBeacon', 'beacon');
        for (const C of ['WebSocket', 'EventSource']) { const K = window[C]; if (K) window[C] = function (...a) { calls.push(C + ' ' + a[0]); return new K(...a); }; }
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
        window.__copied = null;
      });
      const all = [];
      const onAny = (r) => { if (!/^(data|blob|about):/.test(r.url())) all.push(r.url()); };
      ctx.on('request', onAny);
      ok(!(await page.$eval('#live-manual', (d) => d.open)) && (await page.textContent('#live-panel')).includes('ホストのページで先にライブを作った場合（前からの方法）'), 'one-way: the earlier way is folded away (secondary)');
      ok(/まだライブ ID と参加コードがありません/.test(await page.textContent('#live-ids')) && /文字列は、① でライブ ID と参加コードをこの画面で作ると出ます/.test(await page.textContent('#live-setup-note')), 'one-way: before making ids, the panel says how to get the string');
      const lead = await page.textContent('#live-panel .lead');
      ok(/ライブ ID と参加コードをこの画面で作る → ② ライブの時間と質問・投票を決める → ③ できた文字列をコピーして、ホストのページに 1 回だけ貼る → ④ エクスポートする/.test(lead) && /インターネットに接続しません/.test(lead), 'one-way: the lead explains the single paste in plain Japanese');
      await page.click('#live-make');
      await page.waitForFunction(() => /^r-[a-z2-7]{8}$/.test(document.querySelector('#live-room').value));
      const room = await page.inputValue('#live-room'), key = await page.inputValue('#live-key');
      ok(/^[A-Za-z0-9_-]{22}$/.test(key) && (await page.textContent('#live-ids')).includes(`ライブ ID ${room}（この画面で作りました`), `one-way: the panel made a Live ID (${room}) and a 22-character join code`);
      ok(await page.$eval('#live-setup', (e) => e.hidden) && /「エクスポートする前に直すこと」がなくなると/.test(await page.textContent('#live-setup-note')) && await page.$eval('#live-setup-copy', (b) => b.disabled), 'one-way: no string while something is missing (the live time)');
      const f1 = new Date(Date.now() + 3600e3), t1 = new Date(Date.now() + 2 * 3600e3);
      await setWindow(f1, t1);
      const str = await page.inputValue('#live-setup');
      ok(str.startsWith(FORMAT.LIVE_SETUP_PREFIX) && !/\s/.test(str), `one-way: one string appears (${str.slice(0, 40)}…, ${str.length} characters)`);
      const pl = parseLiveSetupString(str);
      const schema = JSON.parse(fs.readFileSync(path.join(PROTO, 'schema.json'), 'utf8'));
      const ajv = new Ajv({ strict: false, allErrors: true }); ajv.addSchema(schema);
      const valid = ajv.validate({ $ref: schema.$id + '#/$defs/setupPayload' }, pl);
      ok(valid, 'one-way: the string decodes to a setupPayload of the vendored protocol' + (valid ? '' : ' ' + ajv.errorsText()));
      ok(pl.room === room && pl.key === key && pl.endpoint === FORMAT.LIVE_ENDPOINT && Date.parse(pl.window.from) === Math.floor(f1.getTime() / 60e3) * 60e3 && JSON.stringify(Object.keys(pl.activities)) === '["*"]', 'one-way: the string carries the room, key, endpoint, live time and activities shown in the panel');
      const ids = await liveSetupIds(pl.setup);
      ok(ids.room === room && ids.key === key, 'one-way: room and key are the ones derived from the setup secret (the service checks the same)');
      ok(/1 回だけ貼り/.test(await page.textContent('#live-oneway')) && /参加者には決して渡さないでください/.test(await page.textContent('#live-oneway')), 'one-way: the panel explains the single paste and warns not to hand the string out');
      ok(await page.getAttribute('#live-host-link', 'href') === FORMAT.LIVE_ENDPOINT + '/' && await page.getAttribute('#live-host-link', 'target') === '_blank', `one-way: a link to the host page (${FORMAT.LIVE_ENDPOINT}/)`);
      // 窓を変えると文字列も変わる（鍵はそのまま）
      await setWindow(f1, new Date(t1.getTime() + 30 * 60e3));
      const str2 = await page.inputValue('#live-setup');
      ok(str2 !== str && parseLiveSetupString(str2).key === key, 'one-way: the string follows the live time (same ids)');
      await page.click('#live-setup-copy');
      await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 }).catch(() => {});
      ok(await page.evaluate(() => window.__copied) === str2 && /文字列をコピーしました/.test(await page.textContent('#toast')), 'one-way: Copy puts exactly the string on the clipboard');
      // 設定の文字列を保存する：小さな .txt のダウンロード（中身は文字列だけ）
      ok(/この文字列でライブが作られます。ホスト用リンクと同じように大事に扱い、参加者には決して渡さないでください/.test(await page.textContent('#live-setup-warn')), 'one-way: a one-line warning next to the string (keep it like the host link, never give it to participants)');
      ok(/貼る前に.*閉じると.*誰も作れないライブを指したままになります/.test(await page.textContent('#live-setup-lost')), 'one-way: the panel says that closing before pasting leaves handed-out files pointing at a Live nobody can create, unless the string was saved');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#live-setup-save')]);
      const dlPath = await dl.path();
      const dlText = dlPath ? fs.readFileSync(dlPath, 'utf8') : '';
      ok(dl.suggestedFilename() === `${FORMAT.NAME}-live-setup-${room}.txt` && dlText === str2 + '\n', `one-way: Save the setup string downloads ${dl.suggestedFilename()} holding exactly the string`);
      ok(/設定の文字列を .* として保存しました/.test(await page.textContent('#toast')), 'one-way: saving says where it went');
      await page.$eval('#live-oneway', (e) => e.scrollIntoView({ block: 'start' })); await shot(page, 'live-oneway.png');
      // 作り直す（確かめてから）：別の id
      page.once('dialog', (d) => d.accept());
      await page.click('#live-make');
      await page.waitForFunction((r) => document.querySelector('#live-room').value !== r, room);
      const room2 = await page.inputValue('#live-room');
      ok(room2 !== room && parseLiveSetupString(await page.inputValue('#live-setup')).room === room2, 'one-way: Make new ones (after confirming) gives a different Live and string');
      ctx.off('request', onAny);
      const calls = await page.evaluate(() => window.__netCalls);
      ok(all.length === 0 && calls.length === 0, `one-way: making ids, the string and copying made no request at all (${[...all, ...calls].slice(0, 3).join(', ')})`);
      // 教材に残すもの：room はあり、key と setup はない。書き出すファイル：key はあり、setup はない
      const key2 = await page.inputValue('#live-key'), setup2 = parseLiveSetupString(await page.inputValue('#live-setup')).setup;
      await page.click('#live-save');
      let cfg0 = null;
      for (let i = 0; i < 50 && !(cfg0 && cfg0.includes(room2)); i++) { await page.waitForTimeout(100); cfg0 = await opfs.read(FORMAT.CONFIG_FILE); }
      ok(!!cfg0 && cfg0.includes(room2) && !cfg0.includes(key2) && !cfg0.includes(setup2), `one-way save: ${FORMAT.CONFIG_FILE} keeps the room, not the key nor the setup secret`);
      await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('oneway.play.ega.html', { create: true }); });
      await page.click('#dlg-export');
      let h1 = '';
      for (let i = 0; i < 300 && h1.length < 1000; i++) { await page.waitForTimeout(100); h1 = (await opfs.read('oneway.play.ega.html')) || ''; }
      await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
      const m1 = new RegExp(`<script type="application/json" id="${LIVE_BLOCK_ID}">([^<]*)</script>`).exec(h1);
      const d1 = m1 ? JSON.parse(m1[1]).live : null;
      ok(d1 && d1.room === room2 && d1.key === key2 && !h1.includes(setup2), 'one-way export: the file carries the derived room and key, never the setup secret');
      ok(/ホストのページにまだ文字列を貼っていなければ/.test(await page.textContent('#toast')), 'one-way export: the toast reminds the host to paste the string once');
      // ほかの書き出し（1 ファイル・再生専用）にも、ブラウザの保存場所のどこにも、setup がない
      await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('oneway-plain.play.ega.html', { create: true }); });
      await menuClick('#b-export-play');
      await page.waitForSelector('#dlg[open] #play-live');
      await page.click('#dlg-export');
      let h2 = '';
      for (let i = 0; i < 300 && h2.length < 1000; i++) { await page.waitForTimeout(100); h2 = (await opfs.read('oneway-plain.play.ega.html')) || ''; }
      await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
      ok(h2.length > 1000 && !h2.includes(setup2), 'one-way: the plain play-only export carries no setup secret');
      const stores = await page.evaluate(async (secret) => {
        const hits = [], files = [];
        const walk = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await walk(h, pre + n + '/'); else { files.push(pre + n); const t = await (await h.getFile()).text(); if (t.includes(secret)) hits.push('opfs:' + pre + n); } } };
        await walk(await navigator.storage.getDirectory(), '');
        for (const [nm, st] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) for (let i = 0; i < st.length; i++) { const k = st.key(i); if ((k + st.getItem(k)).includes(secret)) hits.push(nm + ':' + k); }
        for (const { name } of (await indexedDB.databases())) {
          const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = rej; });
          for (const sn of db.objectStoreNames) {
            const all = await new Promise((res) => { const r = db.transaction(sn).objectStore(sn).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
            for (const v of all) { let t = ''; try { t = JSON.stringify(v); } catch { t = String(v); } if (t && t.includes(secret)) hits.push('idb:' + name + '/' + sn); }
          }
          db.close();
        }
        return { hits, files: files.length };
      }, setup2);
      ok(stores.files > 3 && stores.hits.length === 0, `one-way: the setup secret is nowhere in the browser's storage (${stores.files} OPFS files incl. ${FORMAT.CONFIG_FILE} and its backups, localStorage, sessionStorage, IndexedDB) ${stores.hits.join(', ')}`);
      const calls2 = await page.evaluate(() => window.__netCalls.filter((c) => !c.includes(location.origin + '/') && !/ (blob|data):/.test(c)));
      ok(calls2.length === 0, `one-way export: no call to another origin from the page (${calls2.slice(0, 3).join(', ')})`);
    }

    // ---------------------------------------------------------------- 1. 前からの方法（たたんだ中）
    await openLive();
    await openManual();
    // 教員のリンク（教員の鍵入り）は断る
    const keyBefore = await page.inputValue('#live-key');
    await page.fill('#live-paste', cr.teacherUrl);
    await page.click('#live-read');
    ok(await page.inputValue('#live-key') === keyBefore && /これはホスト用リンクです/.test(await page.textContent('#toast')), 'live panel: the teacher link (with the teacher key) is refused');
    await page.fill('#live-paste', 'コピー：\n' + block);
    await page.click('#live-read');
    ok(await page.inputValue('#live-room') === cr.room && await page.inputValue('#live-key') === cr.key && (await page.inputValue('#live-from')).length === 16, 'live panel: the teacher page\'s copy block fills room, key and window');
    ok(await page.$eval('#live-manual', (d) => d.open) && !(await page.$('#live-setup')) && (await page.textContent('#live-ids')).includes(`ライブ ID ${cr.room}（ホストのページで作ったライブの設定を使っています`), 'live panel: with settings from the host page there is no string to paste, and the earlier way stays open');
    ok(await page.isChecked('#live-qa'), 'live panel: Q&A for the whole lesson is on by default');
    ok(await page.isChecked('#live-confused') && /わからない/.test(await page.textContent('label:has(#live-confused)')), 'live panel: the one-tap “I don\'t follow” (whole lesson) is on by default');
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
    ok(JSON.stringify(acts) === JSON.stringify({ '*': [{ id: 'qa', kind: 'qa' }, { id: 'confused', kind: 'confused' }], [step]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'], label }] }), 'live panel: the activities JSON for the teacher page (with the label; the key unchanged)');
    // 「活動の JSON をコピー」：コピーする字にも label
    await page.evaluate(() => { window.__copied = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); } catch { /* なし */ } });
    await page.click('#live-copy');
    await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 }).catch(() => {});
    { const c = JSON.parse((await page.evaluate(() => window.__copied)) || '{}'); ok(c[step] && c[step][0].label === label && c[step][0].id === 'p1', 'copy activities JSON: the copied text carries the labels'); }
    await shot(page, 'live-poll-labels.png');
    // endpoint は https: だけ（ループバックの http: も断る。開発版でない書き出し）
    await page.fill('#live-endpoint', 'http://127.0.0.1:8787');
    ok(/接続先が正しくありません/.test(await page.textContent('#live-problems')), 'live panel: an http://127.0.0.1 endpoint is refused (in Japanese)');
    await openManual(); await page.fill('#live-paste', block); await page.click('#live-read');
    { const pi = await page.$('#live-paste'); if (pi) await page.fill('#live-paste', ''); }
    // 窓が 3 時間より長い（部屋のサービス v1 の上限）
    const to0 = await page.inputValue('#live-to');
    await page.$eval('#live-to', (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, await page.evaluate((f) => { const d = new Date(new Date(f).getTime() + 4 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }, await page.inputValue('#live-from')));
    ok(/3 時間まで/.test(await page.textContent('#live-problems')), 'live panel: a window over 3 hours is refused with a clear message');
    await page.$eval('#live-to', (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, to0);
    // 形の誤り：選択肢が空
    await page.fill('#live-poll-0-c2', '');
    ok(!!(await page.$('#live-problems')), 'live panel: an empty choice is a problem');
    await page.click('#dlg-export');
    await page.waitForTimeout(300);
    ok(await page.isVisible('#dlg[open] #live-panel') && /選択肢 3/.test(await page.textContent('#toast')), 'live: Export… with something to fix keeps the dialog open and says what');
    // 直すことは画面の言葉で（validate の code から。英語の開発者向けの文を出さない）
    { const t = await page.textContent('#live-problems'); ok(/投票 p1：選択肢 3 を入れてください（100 字まで）/.test(t) && !/live\.activities|characters/.test(t), `live panel: the problem is in plain Japanese ("${t}")`); }
    await page.$eval('#live-problem-box', (e) => e.scrollIntoView({ block: 'center' })); await shot(page, 'live-panel-problems.png');
    await page.fill('#live-poll-0-c2', '変わらない');
    // 教材に残す（鍵なし）
    await page.click('#live-save');
    let cfg = null;
    // 一方向の設定で先に残した設定があるので、この部屋の id が入るまで待つ
    for (let i = 0; i < 50 && !(cfg && cfg.includes(`"room": "${cr.room}"`)); i++) { await page.waitForTimeout(100); cfg = await opfs.read(FORMAT.CONFIG_FILE); }
    const c = JSON.parse(cfg || '{}');
    ok(c.extensions && c.extensions.live && c.extensions.live.room === cr.room && !('key' in c.extensions.live) && !cfg.includes(cr.key), `save: ${FORMAT.CONFIG_FILE} keeps extensions.live without the key`);
    await shot(page, 'live-panel.png');
    // 部屋を付けて書き出す
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('live.play.ega.html', { create: true }); });
    await page.click('#dlg-export');
    let html = '';
    for (let i = 0; i < 300 && html.length < 1000; i++) { await page.waitForTimeout(100); html = (await opfs.read('live.play.ega.html')) || ''; }
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    {
      const nm = await page.evaluate(() => window.__APP_TEST.lastSaveName);
      const lf = new Date(c.extensions.live.window.from);
      const p2 = (n) => String(n).padStart(2, '0'), mark = `（ライブ ${p2(lf.getMonth() + 1)}-${p2(lf.getDate())}）`;
      ok(nm.endsWith(mark + FORMAT.PLAY_EXT) && nm.length > (mark + FORMAT.PLAY_EXT).length, `export with Live: the file name has the mark on the title side, the extension unchanged (${nm})`);
    }
    const at = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    ok(at > 0 && at < html.search(/<script/i) && html.slice(0, at).trimEnd().endsWith('<head>'), 'export with a live room: the CSP meta right after <head>, before any script');
    const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [])[1] || '';
    ok(csp.includes(`; connect-src ${cr.endpoint} ${cr.endpoint.replace(/^https/, 'wss')};`), `export with a live room: connect-src is the endpoint only (${cr.endpoint})`);
    const m = new RegExp(`<script type="application/json" id="${LIVE_BLOCK_ID}">([^<]*)</script>`).exec(html);
    const data = m ? JSON.parse(m[1]).live : null;
    ok(data && data.key === cr.key && data.room === cr.room && JSON.stringify(data.activities) === JSON.stringify(acts), 'export with a live room: the block carries room, key and the activities');
    ok(data && /^[0-9a-f]{64}$/.test(data.sourceSha256 || ''), `export with a live room: the block carries the lesson's sourceSha256, so questions map onto this version (${data && data.sourceSha256})`);
    ok(!html.includes(`id="${FORMAT.INDEX_ID}"`), 'export with a live room: it is play-only (no index, no source)');
    // 部屋を付けない再生専用：何も入らない
    await page.evaluate(async () => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle('plain.play.ega.html', { create: true }); });
    await menuClick('#b-export-play');
    await page.waitForSelector('#dlg[open] #play-live');
    await page.click('#dlg-export');
    let plain = '';
    for (let i = 0; i < 300 && plain.length < 1000; i++) { await page.waitForTimeout(100); plain = (await opfs.read('plain.play.ega.html')) || ''; }
    await page.evaluate(() => { window.__APP_TEST.saveHandle = null; });
    { const nm = await page.evaluate(() => window.__APP_TEST.lastSaveName); ok(!/ライブ|live/.test(nm) && nm.endsWith(FORMAT.PLAY_EXT), `play-only without Live: no mark in the file name (${nm})`); }
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
      await openLive();
      await page.waitForSelector('#live-poll-1-label');
      ok(await page.textContent('#live-poll-0-label') === label, 'older poll without a label: the label is filled from the slide when the panel opens');
      ok(await page.textContent('#live-poll-1-label') === 's-gone · ステップ 2' && await page.getAttribute('#live-poll-1-label', 'title') === 'ステップの識別子：s-gone:1', 'older poll on an unknown slide: shown as "s-gone · 段階 2", the key in the tooltip');
      const a2 = JSON.parse(await page.inputValue('#live-json'));
      ok(a2[step][0].label === label && !('label' in a2['s-gone:1'][0]), 'older polls: the JSON gets a label only where one could be made');
    }
    // 窓を閉じる
    await clickDlg(page, '#dlg-cancel');
  } finally {
    ctx.off('request', onReq);
    page.off('websocket', onWs);
  }
  ok(away.length === 0 && sockets.length === 0, `live panel: the editor made no request outside its own origin and opened no WebSocket (${away.slice(0, 3).join(', ')}${sockets.join(', ')})`);
}
