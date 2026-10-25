// 授業の部屋（拡張 live。format spec の extensions/live.md、通信は FORMAT.LIVE_VENDOR_DIR の写し）の試験（npm test の test-live）
//   node tools/test-live.mjs <作業用のフォルダ>
// 1b. 一方向の設定（PROTOCOL.md §2.1）：写しの試験ベクトル（fixtures/setup/payload.json）と同じ導き方・乱数は crypto.getRandomValues・文字列の往復と Schema・
//    作るあいだ fetch・WebSocket・XMLHttpRequest を一度も呼ばない
// 1. 決まりごと（kit/core/live-policy.mjs）：切断の番号の表が写しの close-codes.json と同じ・つなぎ直しの表・窓とゆとり・URL の origin・形の検査
// 2. 書き出し：部屋を付けない派生は今までと同じ（付けた派生から、足した部分を除くと同じバイト）。付けた派生だけに CSP の <meta>（<head> の直後、どのスクリプトより前、
//    connect-src は endpoint の 2 つの形だけ）・拡張のブロック・再生器。教材（索引と FORMAT.CONFIG_FILE）に鍵がない。鍵を設定のファイルに書くと書き出しを断る
// 3. 通信なし（要求も WebSocket も 0。この試験の部屋のサーバーにも何も届かない）：窓の外・「参加する」を押す前・編集アプリのプレビュー（srcdoc の sandbox の枠）・
//    動画（?mode=video）・印刷・発表者ビュー・部屋のない派生
// 4. file://（Origin null）から試験の部屋（tools/live-fake-server.mjs）へ：参加 → 質問 → ack、段階に来ると投票が出る → 投票 → ack。送ったものはすべて写しの Schema に合い、
//    見ている位置は送らない。承認待ち → 承認。つなぎ直し（1011 の後）と、4440・4423・4410・4441 の後はつながない。切断する
// 5. 舞台の描画は変わらない：部屋を付けた派生と付けない派生で、いくつかの (i, k, t) の舞台だけの画像が同じ
// 6. たたんだ印（#live-mark）：初めはたたんで舞台は窓いっぱい。投票の段階で開き、離れるとたたむ。「開いたままにする」・印から質問・たたんでもつながった印・Esc・キーボード・動きを減らす
//    LIVE_SHOTS=<フォルダ> を付けると、たたんだ・投票で開いた・質問を開いた画面を pane-*.png に残す
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { launch, fileUrl } from '../kit/browser.mjs';
import { buildPortable, liveRuntimeText } from '../kit/build.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { addLive, liveCsp, parseRoomBlock, lessonLive, mergeLive, LIVE_BLOCK_ID, localToRfc3339, stepLabel, stepFallback, stepText,
  newLiveSetup, liveSetupIds, liveSetupString, parseLiveSetupString } from '../kit/core/live.mjs';
import { previewDocument } from '../app/preview-doc.js';
import { FORMAT } from '../kit/core/format.mjs';
import { startFakeLive, PROTOCOL_DIR, fixture } from './live-fake-server.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(ROOT, '.tmp-live-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(50); } return !!(await f()); };

// ---------------------------------------------------------------- 1. 決まりごと
console.log('policy');
const LP = LivePolicy({ allowLoopback: true });
const LP0 = LivePolicy();
const DEV = { devLoopback: true };
const codes = JSON.parse(fs.readFileSync(path.join(PROTOCOL_DIR, 'close-codes.json'), 'utf8')).codes;
ok(codes.length === Object.keys(LP.CODES).length && codes.every((c) => LP.CODES[c.code] && LP.CODES[c.code][0] === c.name && LP.CODES[c.code][1] === c.retry),
  'close codes: the table equals the vendored close-codes.json (names and the server\'s retry flags)');
const src = JSON.parse(fs.readFileSync(path.join(PROTOCOL_DIR, '..', path.basename(PROTOCOL_DIR), 'SOURCE.json'), 'utf8'));
ok(/^[0-9a-f]{40}$/.test(src.commit) && src.repository === FORMAT.LIVE_REPO, 'vendored protocol: SOURCE.json names the egatari/live commit');
const T0 = Date.parse('2026-10-30T09:00:00+09:00'), W = { from: '2026-10-30T09:00:00+09:00', to: '2026-10-30T11:00:00+09:00' };
const plan = (code, att = 0, now = T0 + 3600e3) => LP.plan(code, att, now, W, 0.5);
for (const c of [4400, 4401, 4403, 4404, 4409, 4410, 4440, 4441]) ok(plan(c).retry === false, `plan: no reconnect after ${c} (${LP.CODES[c][0]})`);
ok(codes.every((c) => (plan(c.code).retry === true) === c.retry), 'plan: reconnects exactly for the codes the vendored close-codes.json marks retry');
ok([0, 0.5, 0.999].every((r) => LP.plan(4423, 0, T0 + 3600e3, W, r).delayMs >= 30000) && LP.plan(4423, 0, T0 + 3600e3, W, 0.999).delayMs > LP.plan(4423, 0, T0 + 3600e3, W, 0).delayMs, 'plan: 4423 (room closed) reconnects slowly: at least 30 s, with jitter');
ok(plan(4429).retry && plan(4429).delayMs >= 60000 && plan(4430).retry && plan(4430).delayMs >= 60000, 'plan: 4429 and 4430 reconnect after at least 60 s');
{ const p = LP.plan(4425, 0, T0 - 100e3, W, 0); ok(p.retry && p.delayMs === 100e3, `plan: 4425 (too early) reconnects at window.from (${p.delayMs} ms)`); }
ok(plan(1006).retry && plan(1006).delayMs === 1000 && plan(1006, 1).delayMs === 2000 && plan(1006, 2).delayMs === 4000 && plan(1006, 9).delayMs === 30000, 'plan: network closes back off 1, 2, 4 … 30 s');
ok(LP.plan(1006, 0, T0 + 1000, W, 0).delayMs === 800 && LP.plan(1006, 0, T0 + 1000, W, 0.999).delayMs <= 1200, 'plan: jitter ±20 %');
ok(plan(1006, 0, Date.parse(W.to) + 2 * 60e3 - 500).retry === false && plan(1006, 0, T0 - 3 * 60e3).retry === false, 'plan: no reconnect outside the window (or past its end)');
ok(LP.inWindow(W, T0 - 119e3) && !LP.inWindow(W, T0 - 121e3) && LP.inWindow(W, Date.parse(W.to) + 119e3) && !LP.inWindow(W, Date.parse(W.to) + 121e3), 'window: 2 minutes of skew at both ends');
const L0 = { v: 1, endpoint: 'https://live.example.org', room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: W, activities: fixture('teacher/activities.json').activities };
ok(LP.validate(L0, { key: true }).length === 0, 'validate: the spec example (with the fixture activities) is valid');
ok(LP.validate(L0, { key: false }).some((e) => /key/.test(e)), 'validate: a lesson must not store the key');
ok(LP.validate({ ...L0, endpoint: 'http://live.example.org' }, { key: true }).length > 0 && LP.validate({ ...L0, endpoint: 'https://live.example.org/x' }, { key: true }).length > 0, 'validate: endpoint must be an https origin (no path)');
ok(LP.validate({ ...L0, room: 'r-ABCDEFGH' }, { key: true }).length > 0 && LP.validate({ ...L0, key: 'short' }, { key: true }).length > 0, 'validate: room and key formats from the protocol');
ok(LP.validate({ ...L0, activities: { 'x:1': [{ id: 'p', kind: 'poll', prompt: 'p', choices: ['only one'] }] } }, { key: true }).length > 0, 'validate: a poll needs 2 or more choices');
ok(LP.socketUrl(L0, 'p7Hk2mQx9LwR4tZa') === 'wss://live.example.org/ws?room=r-7k2q6xw4&key=Q2xhc3Nyb29tS2V5MDAwMD&pid=p7Hk2mQx9LwR4tZa', 'socketUrl: wss on the endpoint host');
ok(!LP.sameEndpoint('wss://evil.example.org/ws', L0.endpoint) && !LP.sameEndpoint('ws://live.example.org/ws', L0.endpoint) && LP.sameEndpoint('wss://live.example.org/ws?x', L0.endpoint), 'sameEndpoint: origin must equal the declared endpoint (scheme and host)');
ok(LP0.validate({ ...L0, endpoint: 'http://127.0.0.1:8787' }, { key: true }).some((e) => /endpoint/.test(e)) && LP0.socketUrl({ ...L0, endpoint: 'http://127.0.0.1:8787' }, 'p7Hk2mQx9LwR4tZa') === null && LP0.connectSrc('http://localhost:1') === null, 'default policy: loopback http endpoints are refused (validate, socketUrl, CSP)');
ok(LP.validate({ ...L0, endpoint: 'http://127.0.0.1:8787' }, { key: true }).length === 0 && LP.validate({ ...L0, endpoint: 'http://10.0.0.5:8787' }, { key: true }).length > 0, 'development policy: only loopback http is added');
ok(liveCsp(L0.endpoint).includes('connect-src https://live.example.org wss://live.example.org;'), 'CSP: connect-src lists the endpoint for https and wss');
// つないでよい文書か（docContext）：file: と content:（Android のファイルのアプリ。Origin は null）は学ぶ人が開いたファイル。ほかの条件は同じ
{ const CSP0 = liveCsp(L0.endpoint);
  const doc = (o = {}) => ({ framed: false, protocol: 'file:', origin: 'null', pathname: '/x/a.play.ega.html', csp: [CSP0], ...o });
  const dc = (o) => LP0.docContext(doc(o), L0.endpoint);
  ok(dc() === '' && dc({ protocol: 'https:', origin: 'https://lms.example.org' }) === '', 'docContext: file: and https: documents with the derivative\'s CSP may connect');
  ok(dc({ protocol: 'content:', pathname: '//com.google.android.apps.nbu.files.provider/2/123' }) === '', 'docContext: an Android content: document (Origin null) is a local file the learner opened: it may connect');
  ok(dc({ protocol: 'content:', framed: true }) === 'framed' && dc({ protocol: 'content:', csp: [] }) === 'policy' && dc({ protocol: 'content:', csp: [CSP0, CSP0] }) === 'policy'
    && dc({ protocol: 'content:', csp: [liveCsp('https://evil.example.org')] }) === 'policy', 'docContext: content: still needs no frame and exactly one CSP meta whose connect-src is the endpoint');
  ok(LP0.docContext({ ...doc({ protocol: 'content:' }), framed: undefined }, L0.endpoint) === 'framed' && LP0.docContext(null, L0.endpoint) === 'framed', 'docContext: unknown framing counts as framed');
  ok(['data:', 'blob:', 'about:', 'chrome-extension:', 'filesystem:', 'javascript:', 'contents:', 'CONTENT:'].every((p) => dc({ protocol: p }) === 'scheme'), 'docContext: other schemes do not connect (data:, blob:, about:, …)');
  ok(dc({ protocol: 'https:', origin: 'null' }) === 'sandboxed' && dc({ protocol: 'http:', origin: 'http://127.0.0.1:1', pathname: '/preview/x' }) === 'preview', 'docContext: sandboxed https documents and the dev server preview do not connect');
  ok(LP0.cspOk([CSP0], L0.endpoint) && !LP0.cspOk(['default-src \'none\''], L0.endpoint) && !LP0.cspOk([CSP0.replace(' wss://live.example.org', '')], L0.endpoint), 'cspOk: exactly the endpoint in both forms');
  // つなげない文書の「ブラウザで参加する」：参加用のページ、鍵は # の後ろ
  ok(LP0.joinUrl(L0) === 'https://live.example.org/join#room=r-7k2q6xw4&key=Q2xhc3Nyb29tS2V5MDAwMD', 'joinUrl: https://<endpoint host>/join#room=…&key=… (the key only in the fragment)');
  ok(LP0.joinUrl({ ...L0, key: undefined }) === null && LP0.joinUrl({ ...L0, endpoint: 'javascript:alert(1)' }) === null && LP0.joinUrl({ ...L0, room: 'r-x"><b>' }) === null, 'joinUrl: none without a valid key, room or https endpoint');
  const PREV = "default-src 'none'; connect-src 'none'; frame-src 'none'";
  ok(LP0.offerJoinLink('framed', doc({ framed: true })) && LP0.offerJoinLink('scheme', doc({ protocol: 'data:' })) && LP0.offerJoinLink('sandboxed', doc()), 'offerJoinLink: offered when framed (LMS, chat app), another scheme or sandboxed');
  ok(!LP0.offerJoinLink('framed', doc({ framed: true, csp: [PREV, CSP0] })) && !LP0.offerJoinLink('preview', doc()) && !LP0.offerJoinLink('policy', doc()) && !LP0.offerJoinLink('', doc()), 'offerJoinLink: not in the editor preview (connect-src \'none\'), the dev preview, a document with another policy, or where it can connect'); }
ok(localToRfc3339('2026-10-30T09:00', 540) === '2026-10-30T09:00:00+09:00' && localToRfc3339('2026-10-30T09:00', -300) === '2026-10-30T09:00:00-05:00', 'localToRfc3339: local time with its offset');
{ let e1 = null; try { parseRoomBlock('https://live.example.org/#room=r-7k2q6xw4&admin=VGVhY2hlclNlY3JldEtleUZvckZpeHR1cmVzT25seTA'); } catch (e) { e1 = e.message; }
  ok(e1 === 'admin', 'parseRoomBlock: refuses the teacher link (it carries the teacher key)');
  const cr = fixture('http/create-response.json');
  const block = JSON.stringify({ v: 1, endpoint: cr.endpoint, room: cr.room, key: cr.key, window: cr.window }, null, 2);
  const r = parseRoomBlock('copy:\n' + block + '\n');
  ok(r.room === cr.room && r.key === cr.key && r.window.from === cr.window.from && !('adminKey' in r), 'parseRoomBlock: reads the teacher page\'s copy block');
  ok(!('key' in lessonLive(mergeLive({ activities: L0.activities }, r))) && mergeLive({ activities: L0.activities }, r).activities === L0.activities, 'lessonLive drops the key; mergeLive keeps the lesson\'s activities'); }
// 写しの Schema（ネットワークは使わない）
const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: () => { throw new Error('no network'); } });
const SCHEMA = JSON.parse(fs.readFileSync(path.join(PROTOCOL_DIR, 'schema.json'), 'utf8'));
ajv.addSchema(SCHEMA);
const sv = (def) => ajv.getSchema(SCHEMA.$id + '#/$defs/' + def);
for (const f of ['ask', 'vote', 'name', 'ping']) ok(sv('learnerToServer')(fixture(`learner/${f}.json`)), `schema: fixture learner/${f}.json is a learnerToServer message`);
ok(sv('activities')(L0.activities), 'schema: the activities shape is the protocol\'s activities');
// 活動の表示名（label）：スライドの番号（1 から）・見出し（約 24 字）・段階の番号（1 から）
{ const slides = [{ key: 'cover', heading: '表紙' }, { key: 's-a', heading: '' }, { key: 's-b', heading: 'B' }, { key: 's-cjatth', heading: 'XML の壁' }, { key: 's-long', heading: 'とても長い見出しがここに続いていて二十四字をこえてしまう' }];
  ok(stepLabel('s-cjatth:0', slides, 'ja') === '4 枚目『XML の壁』・ステップ 1' && stepLabel('s-cjatth:0', slides, 'en') === "Slide 4 'XML の壁', step 1", 'label: slide number, heading and step number, 1-based (ja and en)');
  ok(stepLabel('s-cjatth:2', slides, 'ja') === '4 枚目『XML の壁』・ステップ 3' && stepLabel('s-cjatth:concl', slides, 'en') === "Slide 4 'XML の壁', conclusion", 'label: later steps and the conclusion step');
  ok(stepLabel('s-a:0', slides, 'ja') === '2 枚目『s-a』・ステップ 1', 'label: a slide without a heading uses its key');
  { const l = stepLabel('s-long:1', slides, 'ja'), h = /『(.*)』/.exec(l)[1]; ok([...h].length === 24 && h.endsWith('…') && l.endsWith('・ステップ 2'), `label: a long heading is cut to about 24 characters (${l})`); }
  ok(stepLabel('*', slides, 'ja') === '教材全体' && stepLabel('*', slides, 'en') === 'whole lesson', 'label: * is the whole lesson');
  ok(stepLabel('s-gone:1', slides, 'ja') === 's-gone · ステップ 2' && stepFallback('s-cjatth:0', 'en') === 's-cjatth · step 1', 'label: an unknown slide falls back to the key, "s-xxx · ステップ 1"');
  ok(stepText('s-cjatth:0', '', 'ja') === 's-cjatth · ステップ 1' && stepText('s-cjatth:0', 'X', 'ja') === 'X', 'stepText: the label, or the formatted key for older activities');
  const withLabel = (label) => ({ ...L0, activities: { '*': [{ id: 'qa', kind: 'qa', label: '教材全体' }], 's-cjatth:0': [{ id: 'p', kind: 'poll', prompt: 'p', choices: ['a', 'b'], label }] } });
  ok(LP.validate(withLabel('x'.repeat(80)), { key: true }).length === 0 && sv('activities')(withLabel('x'.repeat(80)).activities), 'validate: a label of up to 80 characters is allowed (policy and vendored schema)');
  ok(LP.validate(withLabel('x'.repeat(81)), { key: true }).some((e) => /label/.test(e)) && !sv('activities')(withLabel('x'.repeat(81)).activities) && LP.validate(withLabel(3), { key: true }).some((e) => /label/.test(e)), 'validate: a longer or non-string label is refused');
  ok(LP.validate({ ...L0, activities: { 's:0': [{ id: 'p', kind: 'poll', prompt: 'p', choices: ['a', 'b'] }] } }, { key: true }).length === 0, 'validate: activities without a label are still valid'); }

// 質問の機能：活動の種類 confused・派生の sourceSha256・囲んだところの規則（docs/contract.md §13 のマーカーと同じ）
{ const withCf = (x) => ({ ...L0, activities: { '*': [{ id: 'qa', kind: 'qa' }, { id: 'cf', kind: 'confused', ...x }] } });
  ok(LP.validate(withCf({}), { key: true }).length === 0 && LP.validate(withCf({ label: 'どのステップでも' }), { key: true }).length === 0 && sv('activities')(withCf({}).activities), 'validate: a confused activity ({id, kind}, optional label) is valid (policy and vendored schema)');
  ok(LP.validate(withCf({ choices: ['a', 'b'] }), { key: true }).some((e) => e.code === 'confusedMembers') && !sv('activities')(withCf({ prompt: 'x' }).activities), 'validate: a confused activity has no prompt or choices');
  ok(LP.validate({ ...L0, activities: { '*': [{ id: 'x', kind: 'board' }] } }, { key: true }).some((e) => e.code === 'activityKind'), 'validate: other kinds (board is v2) are refused');
  const SHA = 'a'.repeat(64);
  ok(LP.validate({ ...L0, sourceSha256: SHA }, { key: true }).length === 0, 'validate: the exported file may carry sourceSha256 (the lesson version questions are tied to)');
  ok(LP.validate({ ...L0, sourceSha256: 'A'.repeat(64) }, { key: true }).some((e) => e.code === 'sourceSha256') && LP.validate({ ...L0, sourceSha256: 'ab' }, { key: true }).length > 0, 'validate: sourceSha256 is 64 lowercase hex digits');
  { const { key, ...lesson } = L0; ok(LP.validate({ ...lesson, sourceSha256: SHA }, { key: false }).some((e) => /sourceSha256/.test(e)), 'validate: the lesson\'s own settings never store sourceSha256 (only the exported file)'); }
  for (const f of ['ask-region', 'confused']) ok(sv('learnerToServer')(fixture(`learner/${f}.json`)), `schema: fixture learner/${f}.json is a learnerToServer message`);
  for (const f of ['reply', 'welcome-replies']) ok(sv('serverToLearner')(fixture(`server-learner/${f}.json`)), `schema: fixture server-learner/${f}.json is a serverToLearner message`);
  const N = LP.normStrokes;
  ok(JSON.stringify(N([[[0, 0], [0, 0], [10.04, 5.06], [2000, -3]]])) === '[[[0,0],[10,5.1],[1280,0]]]', 'normStrokes: clamps to the stage, rounds to 0.1, drops repeated points');
  ok(N([[[1, 1]], [[1, 1], [1, 1]], 'x', [[NaN, 1], [2, 2]]]) === null && N('x') === null && N([]) === null, 'normStrokes: a stroke needs 2 distinct valid points; none left is null');
  { const long = Array.from({ length: 1200 }, (_, i) => [100 + 300 * Math.cos(i / 1200 * 6.283), 360 + 300 * Math.sin(i / 1200 * 6.283)]);
    const r = N([long]); ok(r.length === 1 && r[0].length <= 500 && r[0].length >= 10 && JSON.stringify(r[0][0]) === JSON.stringify([400, 360]), `normStrokes: a stroke of more than 500 points is simplified (RDP, keeping the ends) to ${r[0].length}`);
    const many = N(Array.from({ length: 25 }, () => long.slice(0, 400)));
    ok(many.length === 20 && many.reduce((n, x) => n + x.length, 0) <= 2000, 'normStrokes: at most 20 strokes and 2000 points in all');
    ok(N(Array.from({ length: 201 }, () => [[1, 1], [2, 2]])) === null && N([Array.from({ length: 5001 }, (_, i) => [i % 1000, 1])]) === null, 'normStrokes: more than 200 strokes, or more than 5000 points in one, gives nothing (as the review notes)');
    const msg = { v: 1, t: 'ask', activity: 'qa', step: 's-a:1', text: 'q', strokes: many, sourceSha256: SHA };
    ok(sv('learnerToServer')(msg) && JSON.stringify(msg).length < 40960, `schema: normalised strokes fit the vendored ask (and its 40960-byte frame; ${JSON.stringify(msg).length} bytes)`); } }

// ---------------------------------------------------------------- 1b. 一方向の設定
console.log('one-way setup');
{
  const vec = fixture('setup/payload.json');
  ok(sv('setupPayload')(vec), 'one-way: the vendored test vector is a setupPayload');
  const ids = await liveSetupIds(vec.setup);
  ok(ids.room === vec.room && ids.key === vec.key, `one-way: room and key derive from setup as the protocol's test vector says (${ids.room})`);
  // 通信の口を塞いで、呼ばれたら数える
  const saved = {}, calls = [];
  for (const k of ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource']) { saved[k] = globalThis[k]; globalThis[k] = function () { calls.push(k); throw new Error('network: ' + k); }; }
  const realGrv = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let grv = 0;
  Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, value: (a) => { grv++; return realGrv(a); } });
  let made = [];
  try {
    for (let i = 0; i < 20; i++) made.push(await newLiveSetup());
  } finally {
    for (const k of Object.keys(saved)) globalThis[k] = saved[k];
    delete globalThis.crypto.getRandomValues;
  }
  ok(calls.length === 0, 'one-way: making the ids makes no network call (fetch, WebSocket, XMLHttpRequest, EventSource are never touched)');
  ok(grv === 20, `one-way: each setup takes its randomness from crypto.getRandomValues (${grv} calls for 20)`);
  ok(made.every((m) => /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(m.setup) && /^r-[a-z2-7]{8}$/.test(m.room) && /^[A-Za-z0-9_-]{22}$/.test(m.key)), 'one-way: setup is 43 canonical base64url characters (32 bytes), room and key have the protocol\'s shapes');
  ok(new Set(made.flatMap((m) => [m.setup, m.room, m.key])).size === 60, 'one-way: 20 setups give 20 different setups, rooms and keys');
  ok(await Promise.all(made.map(async (m) => JSON.stringify(await liveSetupIds(m.setup)) === JSON.stringify({ room: m.room, key: m.key }))).then((r) => r.every(Boolean)), 'one-way: the ids are a function of setup alone');
  { const fixed = await newLiveSetup(() => new Uint8Array(32).fill(7)); ok(fixed.setup === Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'), 'one-way: setup is the base64url of the 32 random bytes'); }
  let bad = null; try { await newLiveSetup(() => new Uint8Array(16)); } catch (e) { bad = e.message; }
  ok(/32 bytes/.test(bad || ''), 'one-way: a random source that gives fewer than 32 bytes is refused');
  // 文字列：往復・Schema・空白の無視・形の誤り
  const str = liveSetupString(vec);
  ok(str.startsWith(FORMAT.LIVE_SETUP_PREFIX) && /^[A-Za-z0-9_:-]+$/.test(str), 'one-way: the setup string is the prefix and base64url (no spaces, safe to paste anywhere)');
  ok(JSON.stringify(parseLiveSetupString(str)) === JSON.stringify(vec), 'one-way: the string round-trips to the same payload');
  ok(JSON.stringify(parseLiveSetupString('貼る：\n' + str.slice(0, 50) + '\n  ' + str.slice(50) + '\n')) === JSON.stringify(vec), 'one-way: line breaks and spaces added by mail or chat are ignored');
  const m0 = made[0];
  const fresh = parseLiveSetupString(liveSetupString({ ...L0, ...m0, extra: 'dropped' }));
  ok(sv('setupPayload')(fresh) && fresh.room === m0.room && !('extra' in fresh), 'one-way: a string made from panel settings validates against the vendored setupPayload (only its members)');
  const code = (t) => { try { parseLiveSetupString(t); return null; } catch (e) { return e.message; } };
  ok(code(JSON.stringify(vec)) === 'prefix' && code(str.slice(0, -20)) === 'decode' && code(FORMAT.LIVE_SETUP_PREFIX + '***') === 'decode', 'one-way: other text, a cut string or bad characters are refused');
  ok(code(FORMAT.LIVE_SETUP_PREFIX + Buffer.from(JSON.stringify({ ...vec, adminKey: 'x' })).toString('base64url')) === 'shape', 'one-way: unknown members are refused');
  let noSetup = null; try { liveSetupString({ ...vec, setup: undefined }); } catch (e) { noSetup = e.message; }
  ok(/no setup/.test(noSetup || ''), 'one-way: no string without a setup secret');
  // 書き出すファイルに入るのは room と key だけ（setup は入らない）
  ok(LP0.validate({ ...L0, room: m0.room, key: m0.key }, { key: true }).length === 0, 'one-way: the derived room and key are valid for the exported file');
}

// ---------------------------------------------------------------- 2. 書き出し
console.log('export');
const deckDir = path.join(work, 'deck');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true });
const deck = path.join(deckDir, 'deck.html');
const fake = await startFakeLive();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const POLL_STEP = '何を最小化するか:0';
const POLL_LABEL = '2 枚目『何を最小化するか』・段階 1';
const ACTS = { '*': [{ id: 'qa', kind: 'qa' }, { id: 'cf', kind: 'confused' }], [POLL_STEP]: [{ id: 'p1', kind: 'poll', prompt: '学習率を大きくすると？', choices: ['速く収束', '発散しうる', '変わらない'], label: POLL_LABEL }] };
const room = (from, to, endpoint = fake.endpoint) => ({ v: 1, endpoint, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(from), to: iso(to) } });
// 教材の設定（鍵なし）：作業フォルダの設定のファイルの extensions.live
const cfgPath = path.join(deckDir, FORMAT.CONFIG_FILE);
await buildPortable(deck, {});   // docId を作る
const cfg0 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const plain = (await buildPortable(deck, { playOnly: true })).html;
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: ACTS } } }, null, 2) + '\n');
const now = Date.now();
const live = await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now - 60e3, now + 2 * 3600e3) });
const portable = await buildPortable(deck, {});
ok(portable.index.extensions && portable.index.extensions.live && !('key' in portable.index.extensions.live) && JSON.stringify(portable.index.extensions.live.activities) === JSON.stringify(ACTS), 'portable: the lesson keeps extensions.live (from the config file) without the key');
ok(!portable.html.includes('Q2xhc3Nyb29tS2V5MDAwMD') && !portable.html.includes('Content-Security-Policy'), 'portable: the key is nowhere in the teacher\'s own single file, and it has no CSP');
const plain2 = (await buildPortable(deck, { playOnly: true })).html;
ok(plain2 === plain, 'play-only without --live: the same bytes whether or not the lesson has live settings (the derivative carries no live room)');
const L = live.html;
const metaRe = /\n<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const blockRe = new RegExp(`\\n<script type="application/json" id="${LIVE_BLOCK_ID}">[^<]*</script>\\n<script>\\n[\\s\\S]*?\\n</script>`);
ok(L.replace(metaRe, '').replace(blockRe, '') === plain, 'live derivative = the play-only derivative + the CSP meta + the extension block and player (nothing else changes)');
ok(!plain.includes('Content-Security-Policy') && !plain.includes(`id="${LIVE_BLOCK_ID}"`) && !plain.includes('live-pane'), 'play-only without live: no CSP meta, no extension block, no player');
const BLOCK = JSON.parse(new RegExp(`<script type="application/json" id="${LIVE_BLOCK_ID}">([^<]*)</script>`).exec(L)[1]).live;
ok(BLOCK.sourceSha256 === portable.index.sourceSha256 && /^[0-9a-f]{64}$/.test(BLOCK.sourceSha256) && !('sourceSha256' in portable.index.extensions.live),
  'live derivative: the extension block carries the lesson\'s sourceSha256 (the play-only deck-meta has none); the lesson\'s own settings do not');
const cspAt = L.indexOf('<meta http-equiv="Content-Security-Policy"');
ok(cspAt > 0 && cspAt < L.search(/<script/i) && cspAt === L.indexOf('<head>') + '<head>'.length + 1, 'live derivative: the CSP meta comes right after <head>, before any script');
ok((L.match(/http-equiv="Content-Security-Policy"/g) || []).length === 1, 'live derivative: exactly one CSP meta');
const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(L)[1];
const host = new URL(fake.endpoint).host;
ok(/(?:^|; )connect-src ([^;]*)/.exec(csp)[1] === `http://${host} ws://${host}`, `live derivative: connect-src is exactly the endpoint (${host}) for both schemes`);
ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(csp) && !/'unsafe-eval'/.test(csp) && /default-src 'none'/.test(csp), 'live derivative: CSP loads nothing from the network except the endpoint connection, no eval');
ok(!L.includes(`src="${fake.endpoint}`) && !L.includes(`href="${fake.endpoint}`), 'live derivative: no script, style or image is loaded from the endpoint');
{ let e1 = null; try { addLive(L, { ...room(now, now + 3600e3), activities: ACTS }, liveRuntimeText(DEV), DEV); } catch (e) { e1 = e.message; } ok(/already/.test(e1 || ''), 'addLive: refuses to add a second room'); }
{ let e1 = null; try { addLive(portable.html, mergeLive({ activities: ACTS }, room(now, now + 3600e3)), liveRuntimeText(DEV), DEV); } catch (e) { e1 = e.message; } ok(/play-only/.test(e1 || ''), 'addLive: only to a play-only derivative (not the teacher\'s own file)'); }
{ fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, key: 'Q2xhc3Nyb29tS2V5MDAwMD' } } }, null, 2) + '\n');
  let e1 = null; try { await buildPortable(deck, {}); } catch (e) { e1 = e.code; }
  ok(e1 === 'bad-config', 'export: a key written into the config file is refused (never stored in the lesson)');
  fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: { v: 1, endpoint: fake.endpoint, activities: ACTS } } }, null, 2) + '\n'); }
// 開発版だけがループバックの http: の部屋を許す。既定の書き出し（編集アプリ・kit/build.mjs --live）と配る再生器は https: だけ
{ let e1 = null; try { await buildPortable(deck, { playOnly: true, live: room(now - 60e3, now + 3600e3) }); } catch (e) { e1 = e.message; }
  ok(/endpoint/.test(e1 || ''), `default export: an http://127.0.0.1 endpoint is refused (${e1})`);
  let e2 = null; try { parseRoomBlock(JSON.stringify(room(now - 60e3, now + 3600e3))); } catch (e) { e2 = e.details ? e.details.join('; ') : e.message; }
  ok(/endpoint/.test(e2 || ''), 'default export: the room block with an http endpoint is refused');
  const rt = liveRuntimeText(), rtDev = liveRuntimeText(DEV);
  ok(rt.includes('var LOOPBACK = false;') && !rt.includes('var LOOPBACK = true;') && rtDev.includes('var LOOPBACK = true;'), 'the shipped player has the loopback switch off as a constant; only the development player has it on');
  ok(!L.includes('var LOOPBACK = false;') && L.includes('var LOOPBACK = true;'), 'this test\'s live derivative is a development build'); }
const files = {};
const put = (name, html) => { const f = path.join(work, name); fs.writeFileSync(f, html); files[name] = f; return f; };
put('plain.html', plain);
put('live.html', L);
put('early.html', (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now + 3600e3, now + 7200e3) })).html);
put('late.html', (await buildPortable(deck, { playOnly: true, liveDevLoopback: true, live: room(now - 7200e3, now - 3600e3) })).html);
// 既定の再生器（配る写しのもの）に、ループバックの http: の部屋を入れた文書：再生器は部屋を読まない（つながない・板も出さない）
put('default-loopback.html', addLive(plain, mergeLive({ activities: ACTS }, room(now - 60e3, now + 2 * 3600e3)), liveRuntimeText(), DEV));

// ---------------------------------------------------------------- 3〜5. ブラウザ
const browser = await launch();
// 要求（file: と data: と blob: のほか）と WebSocket を数える
async function open(url, { viewport = { width: 1640, height: 720 }, media, ready = true } = {}) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  const net = { req: [], ws: [], errors: [], csp: [] };
  p.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) net.csp.push(m.text()); });
  ctx.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) net.req.push(r.url()); });
  p.on('websocket', (w) => net.ws.push(w.url()));
  p.on('pageerror', (e) => net.errors.push(e.message));
  if (media) await p.emulateMedia({ media });
  if (url) { await p.goto(url); if (ready) await p.waitForFunction(() => window.DECK && DECK.ready); else await p.waitForLoadState('load'); }
  return { ctx, p, net, close: () => ctx.close() };
}
const st = (p) => p.evaluate(() => (window.DECK && DECK.live ? DECK.live.state() : null));
// 印から板を開く（開いていれば何もしない）。「参加する」は板の中
const openMark = async (p) => { if (!(await p.evaluate(() => DECK.live.state().open))) await p.click('#live-mark'); await p.waitForSelector('#live-pane', { state: 'visible' }); };
const joinNow = async (p) => { await openMark(p); await p.click('#live-pane .lv-join'); };
const quiet = (net, what) => ok(net.req.length === 0 && net.ws.length === 0 && fake.connections.length === 0 && fake.http.length === 0,
  `${what}: no request and no WebSocket (page ${net.req.length}/${net.ws.length}, server ${fake.connections.length}/${fake.http.length})`);

console.log('no network');
{ fake.reset(); const o = await open(fileUrl(files['early.html'])); await sleep(800);
  const s = await st(o.p), dis = await o.p.$eval('#live-pane .lv-join', (b) => b.disabled || b.closest('[hidden]') !== null);
  await o.p.click('#live-mark'); await o.p.click('#live-pane .lv-join', { force: true, timeout: 1000 }).catch(() => {}); await sleep(300);
  ok(s && s.state === 'off' && dis, 'before the window: the pane says when the room opens; Join is not offered'); quiet(o.net, 'before the window'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['late.html'])); await sleep(600);
  ok(await o.p.$eval('#live-mark', (m) => document.documentElement.classList.contains('lv-collapsed') && m.title.includes('ライブの時間は終わりました') && m.textContent.includes('終わりました')), 'after the window: collapsed; the marker says the live time is over');
  quiet(o.net, 'after the window'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['live.html'])); await sleep(1500);
  const t = await o.p.$eval('#live-pane .lv-notice', (e) => e.textContent);
  ok(t.includes(host) && /のライブで先生に質問や投票を送れます/.test(t), `before Join: the notice names the endpoint ("${t}")`);
  ok(await o.p.$eval('#live-pane .lv-join', (b) => !b.disabled && b.textContent === '参加する'), 'before Join: the Join button is there');
  quiet(o.net, 'before Join is clicked'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['live.html']) + '?mode=video'); await sleep(800);
  ok(!(await o.p.$('#live-pane')) && (await st(o.p)) === null, 'video mode: no pane at all'); quiet(o.net, 'video mode'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['live.html']) + '?presenter=1', { ready: false }); await sleep(1200);
  ok(!(await o.p.$('#live-pane')), 'presenter view: no pane (nor in its frames)'); quiet(o.net, 'presenter view'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { media: 'print' }); await sleep(500);
  await o.p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  ok(await o.p.$eval('#live-pane', (e) => getComputedStyle(e).display === 'none'), 'print: the pane is hidden'); quiet(o.net, 'print'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['plain.html'])); await sleep(800);
  ok(!(await o.p.$('#live-pane')), 'a lesson without extensions.live: no pane'); quiet(o.net, 'a lesson without extensions.live'); await o.close(); }
// 編集アプリのプレビュー：信頼する先頭部分（CSP connect-src 'none'）+ 文書を、sandbox の srcdoc の枠に
{ fake.reset(); const o = await open(null);
  await o.p.setContent('<!doctype html><html><body><iframe id="f" sandbox="allow-scripts allow-modals" style="width:1600px;height:700px"></iframe></body></html>');
  await o.p.$eval('#f', (f, d) => { f.srcdoc = d; }, previewDocument(L));
  const fr = await (await o.p.$('#f')).contentFrame();
  await until(async () => fr.evaluate(() => !!(window.DECK && DECK.ready)).catch(() => false), 8000);
  await sleep(500);
  const s = await fr.evaluate(() => DECK.live && DECK.live.state());
  const a = await fr.evaluate(() => { const e = document.querySelector('#live-pane .lv-addr'); return e ? e.textContent : ''; });
  ok(s && s.context === 'framed' && a.includes('r-7k2q6xw4') && a.includes(host), `editor preview (sandboxed srcdoc): no connection; the room's address is shown as text ("${a}")`);
  ok(await fr.evaluate(() => { const j = document.querySelector('#live-pane .lv-join'); return !j || j.disabled || !!j.closest('[hidden]'); }), 'editor preview: no Join button');
  ok(s && !s.joinLink && !(await fr.$('#live-pane .lv-join-link')), 'editor preview: no "Join in the browser" link (the current text only)');
  ok(s && !s.open && await fr.$eval('#live-mark', (m) => m.tagName === 'BUTTON' && m.getAttribute('aria-expanded') === 'false'), 'editor preview: the marker is shown, collapsed');
  await fr.click('#live-mark');
  ok(await fr.evaluate(() => DECK.live.state().open && getComputedStyle(document.getElementById('live-pane')).display !== 'none' && document.querySelector('#live-pane .lv-addr').offsetParent !== null), 'editor preview: opening the marker shows the room\'s address (the fallback)');
  quiet(o.net, 'editor preview'); await o.close(); }

// 枠の中（LMS など。編集アプリのプレビューではない）：つながないが、参加用のページを新しいタブで開く「ブラウザで参加する」を出す。押すまで通信はない
{ fake.reset(); const o = await open(fileUrl(put('lms.html', '<!doctype html><html><body><iframe id="f" src="live.html" style="width:1600px;height:700px"></iframe></body></html>')), { ready: false });
  const fr = await (await o.p.waitForSelector('#f')).contentFrame();
  await until(async () => fr.evaluate(() => !!(window.DECK && DECK.ready)).catch(() => false), 8000);
  await sleep(500);
  const s = await fr.evaluate(() => DECK.live && DECK.live.state());
  const a = await fr.evaluate(() => { const e = document.querySelector('#live-pane .lv-join-link'); return e ? { href: e.href, target: e.target, rel: e.rel, text: e.textContent, shown: !e.closest('[hidden]') } : null; });
  const addrT = await fr.evaluate(() => document.querySelector('#live-pane .lv-addr').parentNode.textContent);
  const want = LP.joinUrl(JSON.parse(new RegExp(`<script type="application/json" id="${LIVE_BLOCK_ID}">([^<]*)</script>`).exec(L)[1]).live);
  ok(s && s.context === 'framed' && s.joinLink && a && a.shown && a.href === want && a.target === '_blank' && a.rel === 'noopener noreferrer' && a.text === 'ブラウザで参加する',
    `framed (LMS): "Join in the browser" opens the join page in a new tab (${a && a.href})`);
  ok(addrT.includes(new URL(want).host) && !(await fr.evaluate(() => !!document.getElementById('deck-extlink'))), `framed (LMS): the join page's host is shown in the pane and no confirmation box appears (${addrT})`);
  ok(addrT.includes('r-7k2q6xw4') && /新しいタブ/.test(addrT), `framed (LMS): a short explanation and the room stay as text ("${addrT}")`);
  ok(await fr.evaluate(() => { const j = document.querySelector('#live-pane .lv-join'); return !j || j.disabled || !!j.closest('[hidden]'); }), 'framed (LMS): no Join button in the frame');
  await fr.click('#live-mark');
  quiet(o.net, 'framed (LMS) before the link is clicked (marker opened)');
  const [tab] = await Promise.all([o.ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), fr.click('#live-pane .lv-join-link')]);   // 再生器が作るリンク：確認の箱は出ない（format spec §11 (h)。行き先の host は板に出す）
  await until(() => o.net.req.length > 0, 3000);
  ok(tab && o.net.req.length === 1 && o.net.req[0] === want.split('#')[0] && !o.net.req[0].includes('Q2xhc3Nyb29tS2V5MDAwMD'),
    `click: a new tab loads the join page; the key stays in the fragment and is not sent (${o.net.req.join(', ')})`);
  ok(o.net.ws.length === 0 && (await fr.evaluate(() => DECK.live.state().state)) === 'off', 'click: the framed player itself still opens no WebSocket');
  await o.close(); }

{ fake.reset(); const o = await open(fileUrl(files['default-loopback.html'])); await sleep(1000);
  await o.p.click('#live-pane .lv-join', { timeout: 500 }).catch(() => {}); await sleep(500);
  ok(!(await o.p.$('#live-pane')), 'shipped player with an http://127.0.0.1 endpoint: the room is ignored (no pane, no Join)');
  quiet(o.net, 'shipped player with an http://127.0.0.1 endpoint'); await o.close(); }
console.log('connect from file://');
const sent = () => fake.messages.slice();
{ fake.reset(); const o = await open(fileUrl(files['live.html']));
  await openMark(o.p);
  await o.p.fill('#live-pane .lv-name', 'Aiko');
  await joinNow(o.p);
  ok(await until(async () => (await st(o.p)).state === 'connected'), 'Join: connected');
  const c = fake.connections[0];
  ok(fake.connections.length === 1 && c.origin === 'null' && c.query.room === 'r-7k2q6xw4' && c.query.key === 'Q2xhc3Nyb29tS2V5MDAwMD' && LP.RE.pid.test(c.query.pid) && Object.keys(c.query).length === 3,
    `file:// connects with Origin null and only room, key and pid in the address (origin ${c && c.origin})`);
  ok(o.net.ws.length === 1 && o.net.ws[0].startsWith(fake.endpoint.replace('http', 'ws') + '/ws?'), 'the WebSocket goes to the declared endpoint');
  ok(await until(() => fake.messages.some((m) => m.t === 'name' && m.name === 'Aiko')), 'the typed name is sent (only because it was typed)');
  ok(await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === '参加中') && await o.p.$eval('#live-pane .lv-leave', (b) => !b.hidden), 'connected: live region says so; Leave is shown with the indicator');
  ok(await o.p.$eval('#live-pane', (e) => e.getAttribute('data-state')) === 'connected', 'connected: the persistent indicator');
  const before = sent().length;
  for (let n = 0; n < 3; n++) await o.p.keyboard.press('ArrowRight');
  await sleep(400);
  ok(sent().length === before, 'moving through the lesson sends nothing (no position, no timing)');
  // 質問（"*" の Q&A：送るときの段階）
  const key = (await st(o.p)).step;
  await o.p.fill('#live-pane textarea', '勾配が消えるのはなぜですか？');
  await o.p.click('#live-pane .lv-send');
  ok(await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === '質問を送りました'), 'ask → ack: "question sent" in the live region');
  const askM = fake.messages.find((m) => m.t === 'ask');
  ok(askM && askM.activity === 'qa' && askM.step === key && askM.text === '勾配が消えるのはなぜですか？', `ask: the step key is the one on screen when sent (${askM && askM.step})`);
  ok(await o.p.$eval('#live-pane textarea', (e) => e.value === ''), 'ask: the box is cleared after the ack');
  // 投票：その段階に来たときだけ
  await o.p.keyboard.press('Home'); await sleep(300);
  ok(!(await o.p.$('#live-pane fieldset[data-poll="p1"]')), 'poll: not shown before its step');
  await o.p.evaluate((k) => { for (let i = 0; i < DECK.slides.length; i++) for (let j = 0; j <= 9; j++) { try { if (DECK.stepKey(i, j) === k) { DECK.go(i, j, false); return; } } catch (e) {} } }, POLL_STEP);
  ok(await until(async () => !!(await o.p.$('#live-pane fieldset[data-poll="p1"]'))), 'poll: appears when its step is reached (deck:pos)');
  ok(await o.p.$eval('#live-pane fieldset[data-poll="p1"] legend', (e) => e.textContent) === '学習率を大きくすると？', 'poll: the prompt is shown as text');
  { const pane = await o.p.$eval('#live-pane', (e) => e.textContent); ok(!pane.includes(POLL_STEP), 'poll: the pane never shows the raw step key (it shows the poll of the step on screen; a label is display text only)'); }
  await o.p.check('#live-pane fieldset[data-poll="p1"] input[value="1"]');
  await o.p.click('#live-pane fieldset[data-poll="p1"] .lv-vote');
  ok(await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === '投票しました'), 'vote → ack: "vote recorded" in the live region');
  const voteM = fake.messages.find((m) => m.t === 'vote');
  ok(voteM && voteM.activity === 'p1' && voteM.step === POLL_STEP && voteM.choice === 1, 'vote: activity, step and the 0-based choice');
  const all = sent();
  ok(all.length > 0 && all.every((m) => sv('learnerToServer')(m)), `every message the player sent is a learnerToServer message in the vendored schema (${all.map((m) => m.t).join(',')})`);
  ok(all.every((m) => ['ask', 'vote', 'name', 'ping', 'confused'].includes(m.t)), 'only ask, vote, name, ping (and confused when tapped) are sent');
  // サーバーの字は HTML にしない
  fake.send({ v: 1, t: 'shown', items: [{ id: 'q-abcdefghij', activity: 'qa', step: '*', text: '<img src=x onerror="window.__pwn=1"><b>x</b>' }] });
  ok(await until(async () => (await o.p.$$eval('#live-pane .lv-shown li', (l) => l.map((x) => x.textContent))).includes('<img src=x onerror="window.__pwn=1"><b>x</b>')), 'shown questions are text (textContent)');
  ok(!(await o.p.evaluate(() => window.__pwn)) && !(await o.p.$('#live-pane img, #live-pane b')), 'no markup from the server reaches the page');
  // つなぎ直し：再試行してよい切断（1011）
  const n0 = fake.connections.length;
  fake.drop(1011);
  ok(await until(async () => (await st(o.p)).state === 'retrying', 2000), 'after a network close (1011): retrying');
  ok(await until(() => fake.connections.length === n0 + 1, 4000) && await until(async () => (await st(o.p)).state === 'connected'), 'reconnects with backoff after 1011');
  ok(fake.connections[fake.connections.length - 1].query.pid === c.query.pid, 'reconnect: the same pid (kept on the device)');
  // 切断する
  await o.p.click('#live-pane .lv-leave');
  ok(await until(() => fake.open === 0) && (await st(o.p)).state === 'off', 'Disconnect: closes the socket');
  const n1 = fake.connections.length; await sleep(1800);
  ok(fake.connections.length === n1, 'Disconnect: no reconnect');
  ok(o.net.req.length === 0 && o.net.errors.length === 0, `no HTTP request and no page error (${o.net.errors.join('; ')})`);
  ok(o.net.csp.length === 0, `the player needs nothing its CSP forbids (${o.net.csp.slice(0, 2).join('; ')})`);
  await o.close(); }
// 止める切断の番号
for (const [code, reason, rejoin] of [[4440, 'key_replaced', false], [4410, 'room_expired', false], [4441, 'not_approved', true], [4403, 'bad_key', false]]) {
  fake.reset(); const o = await open(fileUrl(files['live.html']));
  await joinNow(o.p);
  await until(async () => (await st(o.p)).state === 'connected');
  fake.drop(code);
  const stopped = await until(async () => (await st(o.p)).state === 'stopped');
  ok(stopped, `${code}: stopped${stopped ? '' : ' ' + JSON.stringify(await st(o.p)) + ' ' + JSON.stringify(fake.connections)}`);
  await sleep(2500);
  const s = await st(o.p), msg = await o.p.$eval('#live-pane .lv-msg', (e) => e.textContent);
  ok(fake.connections.length === 1 && s.reason === reason && msg.length > 4, `${code} (${reason}): no reconnect, with a message ("${msg}")`);
  ok((await o.p.$eval('#live-pane .lv-join', (b) => !b.disabled && !b.closest('[hidden]'))) === rejoin, `${code}: Join again is ${rejoin ? '' : 'not '}offered`);
  if (code === 4441) ok(msg === '先生が参加を認めませんでした' && await o.p.$eval('#live-pane .lv-join', (b) => b.textContent) === 'もう一度試す', '4441: "the teacher did not admit you" with a manual Try again');
  await o.close();
}
// 先生が閉じた（4423）：ゆっくり（30 秒より後）つなぎ直す
{ fake.reset(); const o = await open(fileUrl(files['live.html']));
  await joinNow(o.p);
  await until(async () => (await st(o.p)).state === 'connected');
  fake.drop(4423);
  ok(await until(async () => (await st(o.p)).state === 'retrying'), '4423 (room closed): waits to reconnect');
  const s = await st(o.p);
  ok(s.retryIn >= 29000 && s.retryIn <= 37000 && fake.connections.length === 1, `4423: the next try is at least 30 s later (${s.retryIn} ms)`);
  await o.close(); }
// 承認待ち
{ fake.reset(); fake.setApproval(true); const o = await open(fileUrl(files['live.html']));
  await joinNow(o.p);
  ok(await until(async () => (await st(o.p)).state === 'waiting'), 'waiting welcome: a waiting state (not an error)');
  ok(await o.p.$eval('#live-pane .lv-qa', (e) => e.hidden), 'waiting: no question box yet');
  fake.admitAll();
  ok(await until(async () => (await st(o.p)).state === 'connected') && await o.p.$eval('#live-pane .lv-qa', (e) => !e.hidden), 'admitted: connected, the question box appears');
  fake.setApproval(false); await o.close(); }
// このタブのあいだだけ覚える：読み直すと押さずにつながる。新しいタブ（別の文脈）では押すまでつながない
{ fake.reset(); const o = await open(fileUrl(files['live.html']));
  await joinNow(o.p); await until(async () => (await st(o.p)).state === 'connected');
  await o.p.reload(); await o.p.waitForFunction(() => window.DECK && DECK.ready);
  ok(await until(async () => (await st(o.p)).state === 'connected') && fake.connections.length === 2, 'reload in the same tab: rejoins (the choice is kept for the session)');
  await o.close();
  fake.reset(); const o2 = await open(fileUrl(files['live.html'])); await sleep(1200);
  quiet(o2.net, 'a new session'); await o2.close(); }
// localStorage が使えなくても（メモリの pid）
{ fake.reset(); const o = await open(null);
  await o.p.addInitScript(() => { const bad = { get() { throw new Error('denied'); } }; Object.defineProperty(window, 'localStorage', bad); Object.defineProperty(window, 'sessionStorage', bad); });
  await o.p.goto(fileUrl(files['live.html'])); await o.p.waitForFunction(() => window.DECK && DECK.ready);
  await joinNow(o.p);
  ok(await until(async () => (await st(o.p)).state === 'connected') && LP.RE.pid.test(fake.connections[0].query.pid), 'storage denied: joins with an in-memory pid');
  ok(o.net.errors.length === 0, `storage denied: no page error (${o.net.errors.join('; ')})`);
  await o.close(); }

console.log('stage rendering');
{ const A = await open(fileUrl(files['plain.html'])), B = await open(fileUrl(files['live.html']));
  // 舞台だけ：画面の端に付く操作の表示（進み具合の線・操作の帯・知らせ）は舞台の外のもの（窓の座標で置かれる）なので、両方で隠して比べる
  for (const o of [A, B]) await o.p.addStyleTag({ content: '#bar,#jump,#dt-cb,#dt-ind,#deck-toast,#deck-back{visibility:hidden!important}' });
  const positions = [[0, 0, null], [1, 0, 0.3], [1, 1, null], [2, 0, 0.2], [3, 1, null], [5, 0, null]];
  const shot = async (o, [i, k, t]) => {
    await o.p.evaluate(([i, k, t]) => DECK.seek(i, Math.min(k, DECK.slides[i]._max || 0), t === null ? Infinity : t), [i, k, t]);
    await o.p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const b = await o.p.$eval('#stage', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    return { b, h: crypto.createHash('sha256').update(await o.p.screenshot({ clip: b })).digest('hex') };
  };
  let same = 0;
  for (const pos of positions) { const a = await shot(A, pos), b = await shot(B, pos); if (a.h === b.h && a.b.width === b.b.width) same++; else console.log('    differs at', pos, a.b, b.b); }
  ok(same === positions.length, `stage-only frames are identical with and without the live room at ${positions.length} (i, k, t)`);
  ok(!(await st(B.p)).open && await B.p.$eval('#stage', (e) => Math.abs(e.getBoundingClientRect().height - 720) < 0.5), 'collapsed: the stage uses the full window (720 px high in a 1640 × 720 window)');
  await openMark(B.p);
  const pr = await B.p.$eval('#live-pane', (e) => e.getBoundingClientRect().left), sr = await B.p.$eval('#stage', (e) => e.getBoundingClientRect().right);
  ok(sr <= pr + 0.5, `the pane is outside the stage (stage right ${sr}, pane left ${pr})`);
  // 縦長の画面：下の板、舞台は上に収める
  await B.p.setViewportSize({ width: 600, height: 900 }); await sleep(200);
  const pb = await B.p.$eval('#live-pane', (e) => e.getBoundingClientRect().top), sb = await B.p.$eval('#stage', (e) => e.getBoundingClientRect().bottom);
  ok(sb <= pb + 0.5 && await B.p.evaluate(() => document.documentElement.classList.contains('lv-bottom')), `portrait: the pane is below the stage (stage bottom ${sb}, pane top ${pb})`);
  // キーボード：印に Tab で届き、Enter で開くと「参加する」に移る
  await B.p.setViewportSize({ width: 1640, height: 720 });
  await B.p.click('#live-pane .lv-fold'); await B.p.evaluate(() => document.activeElement && document.activeElement.blur());
  let reached = false;
  for (let n = 0; n < 40 && !reached; n++) { await B.p.keyboard.press('Tab'); reached = await B.p.evaluate(() => document.activeElement && document.activeElement.id === 'live-mark'); }
  await B.p.keyboard.press('Enter');
  ok(reached && await until(async () => B.p.evaluate(() => DECK.live.state().open && !!document.activeElement.closest('#live-pane .lv-join'))), 'keyboard: the marker is reachable with Tab; Enter opens it and moves to Join');
  await B.p.keyboard.press('Escape');
  ok(await until(async () => B.p.evaluate(() => !DECK.live.state().open && document.activeElement.id === 'live-mark')), 'keyboard: Esc in the pane collapses it and returns to the marker');
  ok(B.net.csp.length === 0 && B.net.errors.length === 0, `stage test: no CSP violation and no page error in the live derivative (${B.net.csp.concat(B.net.errors).slice(0, 2).join('; ')})`);
  await A.close(); await B.close(); }
// ---------------------------------------------------------------- 6. たたんだ印
console.log('collapsed marker');
const SHOTS = process.env.LIVE_SHOTS || '';
const goStep = (p, k) => p.evaluate((k) => { for (let i = 0; i < DECK.slides.length; i++) for (let j = 0; j <= 9; j++) { try { if (DECK.stepKey(i, j) === k) { DECK.go(i, j, false); return true; } } catch (e) {} } return false; }, k);
const stageW = (p) => p.$eval('#stage', (e) => e.getBoundingClientRect().width);
const markOf = (p) => p.$eval('#live-mark', (m) => ({ tag: m.tagName, exp: m.getAttribute('aria-expanded'), state: m.getAttribute('data-state'), text: m.textContent,
  vis: getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 0, dot: getComputedStyle(m.querySelector('.lv-dot')).backgroundColor }));
const paneShown = (p) => p.$eval('#live-pane', (e) => getComputedStyle(e).display !== 'none');
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { viewport: { width: 1280, height: 800 } }); await sleep(300);
  let m = await markOf(o.p), s = await st(o.p);
  ok(!s.open && !(await paneShown(o.p)) && m.tag === 'BUTTON' && m.exp === 'false' && m.vis && m.text.startsWith('ライブ'), `starts collapsed: only the marker ("${m.text}"), aria-expanded=false, the pane is not shown`);
  ok(Math.abs((await stageW(o.p)) - 1280) < 0.5 && await o.p.evaluate(() => document.documentElement.classList.contains('lv-collapsed') && !document.documentElement.classList.contains('lv-side')), 'collapsed: the stage is the full window width (1280 of 1280)');
  quiet(o.net, 'collapsed, before Join');
  if (SHOTS) { await sleep(500); await o.p.screenshot({ path: path.join(SHOTS, 'pane-collapsed.png') }); }
  // 参加：印から開いて 1 回押す
  await openMark(o.p);
  ok((await st(o.p)).pinned && (await markOf(o.p)).exp === 'true' && await o.p.$eval('#live-pane .lv-notice', (e) => e.offsetParent !== null), 'the marker opens the notice and Join (aria-expanded=true)');
  ok(fake.connections.length === 0, 'opening the marker does not connect (Join is still one tap)');
  await o.p.click('#live-pane .lv-join');
  ok(await until(async () => (await st(o.p)).state === 'connected'), 'Join from the opened pane: connected');
  await o.p.click('#live-mark');
  await until(async () => (await markOf(o.p)).dot === 'rgb(63, 191, 111)', 2000);   // 点の色は 0.2 秒で変わる
  m = await markOf(o.p);
  ok(!(await st(o.p)).open && m.state === 'connected' && /参加中/.test(m.text) && m.dot === 'rgb(63, 191, 111)', `connected while collapsed: a green dot and text for screen readers on the marker ("${m.text}")`);
  ok(Math.abs((await stageW(o.p)) - 1280) < 0.5, 'collapsed while connected: the stage is the full window width');
  // 投票の段階で開き、離れるとたたむ
  await o.p.keyboard.press('Home'); await sleep(200);
  await o.p.evaluate(() => { document.getElementById('live-pane-status').textContent = ''; });
  await goStep(o.p, POLL_STEP);
  ok(await until(async () => { const x = await st(o.p); return x.open && x.auto && !x.pinned; }) && await paneShown(o.p) && !!(await o.p.$('#live-pane fieldset[data-poll="p1"]')), 'a poll step opens the pane by itself, with the poll');
  ok(await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === 'このステップに投票があります。ライブの板を開きました'), 'auto-open is announced in the live region');
  ok((await markOf(o.p)).exp === 'true' && (await stageW(o.p)) < 1280 - 100, 'poll open: aria-expanded=true; the stage is fitted beside the pane');
  ok(await o.p.evaluate(() => !document.activeElement || !document.activeElement.closest('#live-pane')), 'auto-open does not take the focus (the keys still move the lesson)');
  if (SHOTS) { await sleep(500); await o.p.screenshot({ path: path.join(SHOTS, 'pane-poll-open.png') }); }
  await o.p.keyboard.press('ArrowRight');
  ok(await until(async () => !(await st(o.p)).open) && !(await paneShown(o.p)) && Math.abs((await stageW(o.p)) - 1280) < 0.5, 'leaving the poll step collapses it again (full width)');
  // 投票の段階でたたむと、その段階のあいだは開かない
  await goStep(o.p, POLL_STEP); await until(async () => (await st(o.p)).open);
  await o.p.click('#live-pane .lv-fold'); await sleep(200);
  ok(!(await st(o.p)).open, 'closing it on the poll step keeps it collapsed on that step');
  // 開いたままにする
  await o.p.keyboard.press('ArrowRight'); await sleep(200); await goStep(o.p, POLL_STEP); await until(async () => (await st(o.p)).open);
  await o.p.click('#live-pane .lv-pin');
  ok(await o.p.$eval('#live-pane .lv-pin', (b) => b.getAttribute('aria-pressed') === 'true') && (await st(o.p)).pinned, '"Keep open" pins the pane (aria-pressed=true)');
  await o.p.evaluate(() => document.activeElement && document.activeElement.blur());
  await o.p.keyboard.press('ArrowRight'); await sleep(300);
  ok((await st(o.p)).open && await paneShown(o.p) && (await st(o.p)).step !== POLL_STEP, 'pinned: stays open after leaving the poll step');
  await o.p.click('#live-pane .lv-pin'); await sleep(200);
  ok(!(await st(o.p)).open, 'unpinned off the poll step: collapses');
  // 印から質問（"*" の Q&A はどのスライドでも）
  await o.p.evaluate(() => document.activeElement && document.activeElement.blur());
  await o.p.keyboard.press('End'); await sleep(200);
  await o.p.click('#live-mark');
  ok(await until(async () => o.p.evaluate(() => document.activeElement && document.activeElement.matches('#live-pane textarea'))) && await o.p.$eval('#live-pane .lv-qa', (e) => !e.hidden && e.offsetParent !== null), 'the marker opens the question box (focused) on any slide');
  await o.p.fill('#live-pane textarea', '最後のスライドの質問です');
  if (SHOTS) { await sleep(500); await o.p.screenshot({ path: path.join(SHOTS, 'pane-question-open.png') }); }
  await o.p.click('#live-pane .lv-send');
  ok(await until(() => fake.messages.some((x) => x.t === 'ask' && x.text === '最後のスライドの質問です')), 'a question sent from the marker reaches the room');
  ok(await o.p.$eval('#live-pane .lv-leave', (b) => !b.hidden && b.offsetParent !== null), 'Disconnect is reachable in the opened pane');
  ok(o.net.errors.length === 0 && o.net.csp.length === 0, `collapsed marker: no page error and no CSP violation (${o.net.errors.concat(o.net.csp).slice(0, 2).join('; ')})`);
  await o.close(); }
// 縦長（スマートフォンの幅）：たたむと窓いっぱい、開くと下の板
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { viewport: { width: 400, height: 800 } }); await sleep(300);
  ok(Math.abs((await stageW(o.p)) - 400) < 0.5, 'phone width collapsed: the stage is the full width (400 px)');
  await openMark(o.p);
  ok(await o.p.evaluate(() => document.documentElement.classList.contains('lv-bottom')) && (await o.p.$eval('#live-mark', (m) => m.getBoundingClientRect().right)) <= 400, 'phone width: the pane opens at the bottom; the marker stays inside the window');
  quiet(o.net, 'phone width, before Join'); await o.close(); }
// 動きを減らす：板は動かさずに出す
{ const o = await open(null);
  await o.p.emulateMedia({ reducedMotion: 'reduce' });
  await o.p.goto(fileUrl(files['live.html'])); await o.p.waitForFunction(() => window.DECK && DECK.ready);
  await openMark(o.p);
  ok(await o.p.$eval('#live-pane', (e) => getComputedStyle(e).animationName === 'none'), 'reduced motion: the pane opens without animation');
  await o.close(); }
// 発表者ビュー：部屋の CSP（frame-src）の下でも、中の 2 つの画面が動く
{ const o = await open(fileUrl(files['live.html']) + '?presenter=1', { ready: false });
  const okFrames = await until(async () => { let n = 0; for (const f of o.p.frames()) { try { if (/[?&]view=(follow|next)/.test(f.url()) && await f.evaluate(() => !!(window.DECK && DECK.ready))) n++; } catch { /* 読み込み中 */ } } return n === 2; }, 8000);
  ok(okFrames && o.net.csp.length === 0, `presenter view of a live derivative: both frames run under its CSP (${o.net.csp.slice(0, 1).join('')})`);
  await o.close(); }

// ---------------------------------------------------------------- 7. 質問：右下の「?」・質問に付くステップと囲んだところ・教材の版・「わからない」・返事
console.log('questions');
const askState = (p) => p.evaluate(() => { const b = document.getElementById('live-ask'), q = b && b.querySelector('.lv-q'), c = b && b.querySelector('.lv-cf');
  return b ? { shown: !b.hidden && getComputedStyle(b).display !== 'none', q: !!q && !q.hidden, label: q && q.getAttribute('aria-label'), cf: !!c && !c.hidden, pressed: c && c.getAttribute('aria-pressed') } : null; });
// 舞台の上に、中心 (cx, cy)・半径 r（舞台の座標）の円を描く
async function drawCircle(p, cx, cy, r) {
  const b = await p.$eval('#stage', (e) => { const x = e.getBoundingClientRect(); return { x: x.x, y: x.y, k: x.width / 1280 }; });
  const at = (a) => [b.x + (cx + r * Math.cos(a)) * b.k, b.y + (cy + r * Math.sin(a)) * b.k];
  await p.mouse.move(...at(0)); await p.mouse.down();
  for (let i = 1; i <= 24; i++) await p.mouse.move(...at(i / 24 * 2 * Math.PI));
  await p.mouse.up();
}
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { viewport: { width: 1280, height: 800 } }); await sleep(300);
  let a = await askState(o.p);
  ok(a && a.shown && a.q && a.label === 'ホストに質問する' && !a.cf, `before Join: the "?" is at the bottom right (aria-label "${a && a.label}"); no "I don't follow" yet`);
  const box = await o.p.$eval('#live-ask', (e) => { const r = e.getBoundingClientRect(); return { right: r.right, bottom: r.bottom }; });
  ok(box.right > 1280 - 80 && box.bottom > 800 - 80, `the "?" sits at the bottom right of the window (${Math.round(box.right)}, ${Math.round(box.bottom)})`);
  await o.p.click('#live-ask .lv-q');
  ok(await until(async () => o.p.evaluate(() => DECK.live.state().open && !!document.activeElement && document.activeElement.matches('#live-pane .lv-join'))), '"?" before Join: opens the pane and moves to Join (it does not connect)');
  await sleep(300);
  quiet(o.net, 'the "?" before Join');
  // 参加して、「?」から質問の欄へ
  await o.p.click('#live-pane .lv-join');
  ok(await until(async () => (await st(o.p)).state === 'connected'), 'Join: connected');
  await o.p.click('#live-pane .lv-fold');
  await goStep(o.p, POLL_STEP); await sleep(200); await o.p.click('#live-pane .lv-fold').catch(() => {});
  await o.p.keyboard.press('ArrowRight'); await sleep(300);
  const s1 = await st(o.p), key1 = s1.step;
  a = await askState(o.p);
  ok(a.cf && a.pressed === 'false', 'connected: "I don\'t follow" appears next to the "?" (aria-pressed=false)');
  // キーボード：「?」に Tab で届き、Enter で質問の欄へ
  await o.p.evaluate(() => document.activeElement && document.activeElement.blur());
  let reached = false;
  for (let n = 0; n < 40 && !reached; n++) { await o.p.keyboard.press('Tab'); reached = await o.p.evaluate(() => document.activeElement && document.activeElement.matches('#live-ask .lv-q')); }
  await o.p.keyboard.press('Enter');
  ok(reached && await until(async () => o.p.evaluate(() => DECK.live.state().open && document.activeElement && document.activeElement.matches('#live-pane textarea'))), 'keyboard: the "?" is reachable with Tab; Enter opens the question box (focused)');
  const where = await o.p.$eval('#live-pane .lv-where', (e) => e.textContent);
  ok(/^質問に付く場所：スライド \d+・ステップ \d+$/.test(where) && !where.includes(key1), `the box says which step the question is tied to, in words ("${where}")`);
  // 囲む：舞台の上に円を描く
  await o.p.click('#live-pane .lv-circle');
  ok(await o.p.$eval('#live-pane .lv-circle', (b) => b.getAttribute('aria-pressed') === 'true') && (await st(o.p)).drawing && await o.p.$eval('#live-ink', (e) => !e.hasAttribute('hidden') && e.classList.contains('lv-drawing')), 'Circle: drawing mode (aria-pressed=true) over the stage');
  await drawCircle(o.p, 640, 360, 120);
  await drawCircle(o.p, 300, 200, 40);
  ok((await st(o.p)).strokes === 2 && /囲んだところ：2 本/.test(await o.p.$eval('#live-pane .lv-circled', (e) => e.textContent)), 'two strokes drawn; the pane counts them');
  if (SHOTS) { await sleep(300); await o.p.screenshot({ path: path.join(SHOTS, 'pane-question-circle.png') }); }
  await o.p.keyboard.press('Escape');
  ok(!(await st(o.p)).drawing && (await st(o.p)).open && (await st(o.p)).strokes === 2, 'Esc ends drawing (the pane stays open; the circle stays)');
  const before = (await st(o.p)).step;
  await o.p.fill('#live-pane textarea', 'この矢印は何ですか？');
  await o.p.click('#live-pane .lv-send');
  ok(await until(() => fake.messages.some((m) => m.t === 'ask' && m.text === 'この矢印は何ですか？')), 'ask with a circle reaches the room');
  const am = fake.messages.find((m) => m.t === 'ask' && m.text === 'この矢印は何ですか？');
  ok(am.step === before && am.step !== '*' && am.sourceSha256 === BLOCK.sourceSha256, `ask: the step on screen and the lesson's sourceSha256 (${am.step})`);
  ok(Array.isArray(am.strokes) && am.strokes.length === 2 && am.strokes.every((s) => s.length >= 2 && s.every(([x, y]) => x >= 0 && x <= 1280 && y >= 0 && y <= 720 && Math.round(x * 10) / 10 === x)), 'ask: two strokes in stage coordinates, rounded to 0.1');
  { const xs = am.strokes[0].map((p) => p[0]), ys = am.strokes[0].map((p) => p[1]);
    ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 640) < 12 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 360) < 12 && Math.abs(Math.max(...xs) - Math.min(...xs) - 240) < 16, 'ask: the circle is where it was drawn on the stage (centre 640, 360; diameter 240)'); }
  ok(sv('learnerToServer')(am) && JSON.stringify(am.strokes) === JSON.stringify(LP.normStrokes(am.strokes)), 'ask: valid in the vendored schema, already normalised (review-notes rule)');
  ok(await until(async () => (await st(o.p)).strokes === 0) && await o.p.$eval('#live-ink', (e) => e.hasAttribute('hidden')), 'after the ack the circle is cleared');
  // ステップが変わると、囲んだところは消える
  await o.p.click('#live-pane .lv-circle'); await drawCircle(o.p, 640, 360, 80);
  await o.p.keyboard.press('Escape');
  await o.p.evaluate(() => document.activeElement && document.activeElement.blur());
  await o.p.keyboard.press('ArrowRight');
  ok(await until(async () => (await st(o.p)).strokes === 0) && await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === 'ステップが変わったので、囲んだところを消しました'), 'a step change clears the circle and says so');
  // 「わからない」：押す・もう一度押すと取り消す。ステップごと
  const n0 = fake.messages.length;
  const key2 = (await st(o.p)).step;
  await o.p.click('#live-ask .lv-cf');
  ok(await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === '「わからない」をホストに伝えました') && (await askState(o.p)).pressed === 'true', '"I don\'t follow": one tap, aria-pressed=true, announced');
  ok(await o.p.$eval('#live-ask .lv-cf', (e) => { const x = document.createElement('div'); x.style.background = 'var(--emph)'; document.body.appendChild(x); const want = getComputedStyle(x).backgroundColor; x.remove(); return want !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).backgroundColor === want; }), '"I don\'t follow" pressed: its background is the deck theme\'s --emph');
  const cm = fake.messages.slice(n0).find((m) => m.t === 'confused');
  ok(cm && cm.activity === 'cf' && cm.step === key2 && cm.on === true && !('text' in cm) && sv('learnerToServer')(cm), `confused: the activity, the step on screen and on:true, no text (${cm && cm.step})`);
  await o.p.click('#live-ask .lv-cf');
  ok(await until(() => fake.messages.slice(n0).some((m) => m.t === 'confused' && m.on === false && m.step === key2)) && (await askState(o.p)).pressed === 'false', 'a second tap takes it back (on:false)');
  await o.p.click('#live-ask .lv-cf'); await sleep(200);
  await o.p.evaluate(() => document.activeElement && document.activeElement.blur());
  await o.p.keyboard.press('ArrowRight'); await sleep(300);
  ok((await askState(o.p)).pressed === 'false', 'the mark is per step: the next step starts unmarked');
  // 返事：自分の質問への返事は板の「ホストからの返事」に、文字として。たたんでいれば印に新しい返事の点
  await o.p.click('#live-pane .lv-fold'); await sleep(200);
  fake.send({ v: 1, t: 'reply', item: 'q-abcdefghij', question: 'この矢印は何ですか？', step: before, text: '<b>勾配</b>の向きです', public: false, at: new Date().toISOString() });
  ok(await until(async () => (await st(o.p)).replies === 1) && await until(async () => (await o.p.$eval('#live-pane-status', (e) => e.textContent)) === 'ホストから返事が届きました'), 'a reply is announced');
  ok(await o.p.$eval('#live-mark', (m) => m.classList.contains('lv-new') && /新しい返事があります/.test(m.textContent)), 'collapsed: the marker shows a new reply (dot and text for screen readers)');
  await o.p.click('#live-mark');
  const rep = await o.p.$$eval('#live-pane .lv-replies li', (l) => l.map((x) => x.textContent));
  ok(rep.length === 1 && rep[0] === 'あなたの質問：この矢印は何ですか？<b>勾配</b>の向きです' && !(await o.p.$('#live-pane .lv-replies b')), `the reply is shown with the learner's own question, as text (${rep[0]})`);
  ok(!(await o.p.$eval('#live-mark', (m) => m.classList.contains('lv-new'))), 'opening the pane clears the new-reply mark');
  // ホストが全員に見せた返事
  fake.send({ v: 1, t: 'shown', items: [{ id: 'q-abcdefghij', activity: 'qa', step: before, text: 'この矢印は何ですか？', reply: '勾配の向きです' }] });
  ok(await until(async () => (await o.p.$$eval('#live-pane .lv-shown li', (l) => l.map((x) => x.textContent))).includes('この矢印は何ですか？ホストの返事：勾配の向きです')), 'a question the host answered for everyone shows its reply');
  if (SHOTS) { await sleep(300); await o.p.screenshot({ path: path.join(SHOTS, 'pane-reply.png') }); }
  const all = fake.messages.slice();
  ok(all.every((m) => sv('learnerToServer')(m)) && all.every((m) => ['ask', 'vote', 'name', 'ping', 'confused'].includes(m.t)), `questions: every message is a vendored learnerToServer message (${[...new Set(all.map((m) => m.t))].join(',')})`);
  ok(o.net.errors.length === 0 && o.net.csp.length === 0 && o.net.req.length === 0, `questions: no page error, no CSP violation, no HTTP request (${o.net.errors.concat(o.net.csp).slice(0, 2).join('; ')})`);
  await o.close(); }
// つなぎ直した welcome の返事（読み直しの後も届く）
{ fake.reset(); const o = await open(fileUrl(files['live.html']));
  await joinNow(o.p); await until(async () => (await st(o.p)).state === 'connected');
  fake.drop(1011);
  await until(async () => (await st(o.p)).state === 'retrying');
  // 次の welcome に返事を足す
  const w = fixture('server-learner/welcome-replies.json');
  ok(await until(async () => (await st(o.p)).state === 'connected', 5000), 'reconnected');
  fake.send({ ...w, room: 'r-7k2q6xw4', pid: fake.connections[fake.connections.length - 1].query.pid });
  ok(await until(async () => (await st(o.p)).replies === 1), 'replies in welcome (after a reconnect or a reload) are shown');
  await o.close(); }
// 「?」の出ないところ：動画・印刷・窓の外（通信もしない）
{ fake.reset(); const o = await open(fileUrl(files['live.html']) + '?mode=video'); await sleep(500);
  ok(!(await o.p.$('#live-ask')) && !(await o.p.$('#live-ink')), 'video mode: no "?" and no drawing layer'); quiet(o.net, 'video mode ("?")'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { media: 'print' }); await sleep(400);
  ok(await o.p.$eval('#live-ask', (e) => getComputedStyle(e).display === 'none'), 'print: the "?" is hidden'); quiet(o.net, 'print ("?")'); await o.close(); }
{ fake.reset(); const o = await open(fileUrl(files['late.html'])); await sleep(400);
  ok(await o.p.$eval('#live-ask', (e) => e.hidden), 'after the window: no "?"'); quiet(o.net, 'after the window ("?")'); await o.close(); }
// 縦長（スマートフォンの幅）：「?」は窓の中、板を開くと板の上に
{ fake.reset(); const o = await open(fileUrl(files['live.html']), { viewport: { width: 390, height: 844 } }); await sleep(300);
  const r0 = await o.p.$eval('#live-ask', (e) => e.getBoundingClientRect().toJSON());
  await o.p.click('#live-ask .lv-q');
  await until(async () => (await st(o.p)).open);
  const r1 = await o.p.$eval('#live-ask', (e) => e.getBoundingClientRect().toJSON()), pt = await o.p.$eval('#live-pane', (e) => e.getBoundingClientRect().top);
  ok(r0.right <= 390 && r0.bottom <= 844 && r0.width >= 44 && r0.height >= 44 && r1.bottom <= pt + 0.5, `phone: the "?" (a 44 px target) stays in the window and above the opened pane (${Math.round(r1.bottom)} ≤ ${Math.round(pt)})`);
  if (SHOTS) { await sleep(300); await o.p.screenshot({ path: path.join(SHOTS, 'pane-phone-ask.png') }); }
  quiet(o.net, 'phone, the "?" before Join'); await o.close(); }

await browser.close();
await fake.close();
console.log(fails ? `\ntest-live: ${fails} FAILED` : '\ntest-live: all ok');
process.exit(fails ? 1 : 0);
