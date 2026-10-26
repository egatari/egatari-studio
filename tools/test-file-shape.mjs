// 1.0 のファイルの形（書く側。format spec §4.1・§4.2・§7.1・§7.2・§8.1）の試験
//   node tools/test-file-shape.mjs [作業フォルダ]
// 1. player {name, version}（kit/core/player.mjs）と generator（Egatari Studio）が索引と deck-meta にある。contracts は {source} だけ
// 2. 版の決め方：出した版と中身が同じなら版のまま、違えば "+dev.<commit>"（commit がなければ "+dev"）
// 3. npm run player:check は知らせるだけ、--strict は違えば失敗。player:bump は版・lock・断片を書く
// 4. 段 A の保存は player と generator をバイトのまま残す（ほかの再生器・作り手の文書でも）
// 5. 作り直し（段 B）は再生器の名前が変われば知らせる
// 6. ファイルの決まり（CSP の <meta>）：ある・置き場所・解析したディレクティブで比べる（順と空白は問わない）
// 7. 授業の部屋（live）と embed の行き先は決まりに足す（その場で書き換える）
// 8. 旧来の鍵を書かない（見出しの字・手で書いた data-key・s<n>・camera-v1・{zoom}）。id のない原稿は品質チェックが受け付け、書き出しが id を付ける
// 8b. 教材のシード値はない（spec §8.4）：組み立て・書き出しは data-egatari-seed も部品の seed も書かず、variant はそのまま、前の原稿のシードは段 A で触らない
// 8c. 1.0 の語彙にない書き方（§8.0）：書かない。品質チェックは警告
// 9. 記事だけの教材（index.article、entry なし）の検査
// 10. 編集アプリのプレビュー（信頼する先頭部分の決まり ＋ ファイル自身の決まり）で描け、仲立ち（app/frame-shim.js）が動く
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { PLAYER, PLAYER_FILES, PLAYER_JSON, PLAYER_LOCK, playerHash, playerVersion, resolvePlayer, bumpVersion } from '../kit/core/player.mjs';
import { BASELINE, policyText, policyMeta, policyDiff, placementProblems, checkFilePolicy, extensionSources, findPolicies } from '../kit/core/file-policy.mjs';
import { addLive } from '../kit/core/live.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { buildPortable, liveRuntimeText } from '../kit/build.mjs';
import { makeDeck } from './portable-fixtures.mjs';
import { previewDocument } from '../app/preview-doc.js';
import { withLayoutScan } from '../kit/core/layout-scan.mjs';
import { launch } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-file-shape-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const plainJson = (o) => JSON.parse(JSON.stringify(o));
const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: () => { throw new Error('no network'); } });
const SPEC = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'));
for (const f of fs.readdirSync(path.join(SPEC, 'schema'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SPEC, 'schema', f), 'utf8')));
const vIndex = ajv.getSchema(FORMAT.SCHEMA_BASE + FORMAT.SCHEMA_PREFIX + 'index.schema.json'), vMeta = ajv.getSchema(FORMAT.SCHEMA_BASE + 'deck-meta.schema.json');
const metaOf = (html) => JSON.parse(PF.scanDocument(html).byId.get('deck-meta').text);

// 共通：小さな教材（id あり）を 1 ファイルに
const D = makeDeck(path.join(work, 'deck'));
let base;
ok('player と generator：索引と deck-meta に、名前と版。contracts は {source} だけ（runtime なし）。Schema に合う', async () => {
  base = await buildPortable(path.join(D, 'deck.html'), {});
  const m = metaOf(base.html);
  for (const [w, o] of [['index', base.index], ['deck-meta', m]]) {
    assert.equal(o.player.name, 'egatari-player', w);
    assert.match(o.player.version, /^1\.0\.0(?:\+dev(?:\.[0-9a-f]{4,40})?)?$/, w);
    assert.equal(o.player.title, 'Egatari Player', w);
    assert.deepEqual(plainJson(o.generator), { name: 'egatari-studio', version: VERSION, title: 'Egatari Studio' }, w);
    assert.deepEqual(plainJson(o.contracts), { source: 1 }, `${w}: contracts is {source} only`);
  }
  assert.deepEqual(plainJson(m.player), plainJson(base.index.player), 'the same player in the index and deck-meta');
  assert.equal(PLAYER.displayName, 'Egatari Player');
  assert.ok(vIndex(plainJson(base.index)), JSON.stringify(vIndex.errors));
  assert.ok(vMeta(plainJson(m)), JSON.stringify(vMeta.errors));
  assert.deepEqual(PF.validateIndex(base.index), []);
  assert.deepEqual(PF.validateDeckMeta(m), []);
  // player がなければ、書く側の検査は断る（読む側は前の草案として読む：test-portable の missing-player）
  const ix = plainJson(base.index); delete ix.player;
  assert.ok(PF.validateIndex(ix).includes('index: missing "player"'));
  assert.ok(PF.validateIndex({ ...plainJson(base.index), generator: { name: 'x', version: '1', title: '' } }).includes('generator.title: not a non-empty string'));
  assert.deepEqual(PF.validateIndex({ ...plainJson(base.index), player: { name: 'x', version: '1' } }), [], 'title is optional');
  const m2 = { ...m }; delete m2.player;
  assert.ok(PF.validateDeckMeta(m2).some((e) => /missing "player"/.test(e)));
  assert.deepEqual(PF.validateDeckMeta(m2, { preDraft: true }), [], 'reading a pre-1.0 draft: no player is tolerated');
  assert.ok(!base.html.includes('"runtime":1'), 'no contracts.runtime anywhere');
});

ok('player のない文書（1.0 の形より前の草案）：読み手は断らずに開き（preDraft）、取り出しと展開もできる。player を求めるのは書くもの・1.0 の出力の検査だけ', async () => {
  const el = PF.scanDocument(base.html).byId.get(FORMAT.INDEX_ID);
  const ix = JSON.parse(el.text); delete ix.player;
  let h = await PF.replaceIndexText(base.html, JSON.stringify(ix, null, 1));
  const meta = PF.scanDocument(h).byId.get('deck-meta'), m = JSON.parse(meta.text); delete m.player;
  h = h.slice(0, meta.start) + `<script type="application/json" id="deck-meta">${PF.htmlSafeJson(JSON.stringify(m))}</script>` + h.slice(meta.end);
  const r = await PF.readPortable(h);
  assert.equal(r.preDraft, true);
  assert.ok(r.warnings.some((w) => /before the 1\.0 file shape/.test(w)) && !r.warnings.some((w) => /missing "player"/.test(w)), JSON.stringify(r.warnings));
  assert.equal((await PF.readPortable(h, { extract: true })).preDraft, true, 'extraction works too');
  const f = path.join(work, 'pre-draft.ega.html'); fs.writeFileSync(f, h);
  const { unpack } = await import('./portable.mjs');
  await unpack(f, path.join(work, 'pre-draft-out'));
  assert.ok(fs.existsSync(path.join(work, 'pre-draft-out', 'deck.html')), 'unpacks');
  // 書く側の検査（1.0 の出力）は player を求める
  assert.ok(PF.validateIndex(r.index).includes('index: missing "player"'));
  assert.ok(PF.validateDeckMeta(r.deckMeta).some((e) => /missing "player"/.test(e)));
});

// ---------------------------------------------------------------- 版の決め方
// 試験用の根：kit/player.json・lock・中身のファイルの写し
function playerRoot(name) {
  const r = path.join(work, name);
  for (const f of [PLAYER_JSON, PLAYER_LOCK, ...PLAYER_FILES]) { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(r, f)); }
  return r;
}
const envOf = (r, commit) => ({ path, ROOT: r, readText: (p) => fs.readFileSync(p, 'utf8'), exists: (p) => fs.existsSync(p), commit });
ok('版の決め方：出した版と中身が同じなら版のまま、違えば +dev.<commit>、commit がなければ +dev。lock の版と kit/player.json の版が違っても +dev', async () => {
  assert.equal(playerVersion({ version: '1.2.3' }, { version: '1.2.3', sha256: 'a'.repeat(64) }, 'a'.repeat(64), 'abc1234'), '1.2.3');
  assert.equal(playerVersion({ version: '1.2.3' }, { version: '1.2.3', sha256: 'a'.repeat(64) }, 'b'.repeat(64), 'abc1234'), '1.2.3+dev.abc1234');
  assert.equal(playerVersion({ version: '1.2.3' }, { version: '1.2.3', sha256: 'a'.repeat(64) }, 'b'.repeat(64), ''), '1.2.3+dev');
  assert.equal(playerVersion({ version: '1.2.4' }, { version: '1.2.3', sha256: 'a'.repeat(64) }, 'a'.repeat(64), 'abc1234'), '1.2.4+dev.abc1234');
  assert.equal(playerVersion({ version: '1.0.0' }, { version: null, sha256: null }, 'a'.repeat(64), 'abc1234'), '1.0.0+dev.abc1234');
  assert.deepEqual(['patch', 'minor', 'major'].map((l) => bumpVersion('1.2.3', l)), ['1.2.4', '1.3.0', '2.0.0']);
  const r = playerRoot('pv');
  const sha = await playerHash((rel) => fs.readFileSync(path.join(r, rel)));
  fs.writeFileSync(path.join(r, PLAYER_LOCK), JSON.stringify({ version: '1.0.0', sha256: sha }) + '\n');
  assert.deepEqual(await resolvePlayer(envOf(r, 'abc1234')), { name: 'egatari-player', version: '1.0.0', title: 'Egatari Player', released: true, sha256: sha });
  // 改行だけが違う（Windows の checkout）：同じ中身
  const dj = path.join(r, 'kit', 'deck.js');
  fs.writeFileSync(dj, fs.readFileSync(dj, 'utf8').replace(/\n/g, '\r\n'));
  assert.equal((await resolvePlayer(envOf(r, 'abc1234'))).version, '1.0.0', 'CRLF checkout: the same player');
  fs.appendFileSync(dj, '\n// changed\n');
  assert.equal((await resolvePlayer(envOf(r, 'abc1234'))).version, '1.0.0+dev.abc1234');
  assert.equal((await resolvePlayer(envOf(r, ''))).version, '1.0.0+dev', 'no commit (the editor app without git)');
  // このリポジトリの組み立て：中身が lock と違えば +dev（commit は git から）
  const here = await resolvePlayer(envOf(ROOT, 'abc1234'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, PLAYER_LOCK), 'utf8'));
  assert.equal(here.released, lock.sha256 === here.sha256 && lock.version === JSON.parse(fs.readFileSync(path.join(ROOT, PLAYER_JSON), 'utf8')).version);
  assert.equal(base.index.player.version.startsWith('1.0.0+dev'), !here.released, `the build writes ${base.index.player.version}`);
});
ok('npm run player:check は知らせるだけ（終了コード 0）、--strict は違えば 1。player:bump は版と lock と changes/player-*.md を書く（最初は major で 1.0.0）', () => {
  const r = playerRoot('pc');
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'player.mjs'), ...a, '--root', r], { encoding: 'utf8' });
  let x = run('check');
  assert.equal(x.status, 0, x.stderr); assert.match(x.stdout, /information only/);
  x = run('check', '--strict');
  assert.equal(x.status, 1); assert.match(x.stderr, /player:bump/);
  x = run('bump', 'patch');
  assert.equal(x.status, 1, 'the first release is major (0.0.1 is lower than 1.0.0)');
  x = run('bump', 'major');
  assert.equal(x.status, 0, x.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r, PLAYER_JSON), 'utf8')).version, '1.0.0');
  const lk = JSON.parse(fs.readFileSync(path.join(r, PLAYER_LOCK), 'utf8'));
  assert.equal(lk.version, '1.0.0'); assert.match(lk.sha256, /^[0-9a-f]{64}$/);
  assert.ok(fs.existsSync(path.join(r, 'changes', 'player-1.0.0.md')));
  x = run('check', '--strict');
  assert.equal(x.status, 0, x.stderr + x.stdout);
  fs.appendFileSync(path.join(r, 'kit', 'base.css'), '\n/* changed */\n');
  assert.equal(run('check', '--strict').status, 1, 'a changed player file fails --strict');
  assert.equal(run('check').status, 0);
  x = run('bump', 'minor');
  assert.equal(x.status, 0, x.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r, PLAYER_JSON), 'utf8')).version, '1.1.0');
  assert.equal(run('check', '--strict').status, 0);
  // 断片の書き方は changelog の決まりに合う
  const c = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'changelog.mjs'), '--check', '--root', r], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

// ---------------------------------------------------------------- 段 A・作り直し
// 索引と deck-meta の player・generator を、ほかの再生器・作り手のものにした文書
async function foreign(html) {
  const P1 = '{"name":"other-player","version":"9.9.9","title":"Other Player","build":"x"}', G1 = '{"name":"other-studio","version":"3.1","title":"Other Studio"}';
  const el = PF.scanDocument(html).byId.get(FORMAT.INDEX_ID);
  const ix = JSON.parse(el.text);
  ix.player = JSON.parse(P1); ix.generator = JSON.parse(G1);
  let out = await PF.replaceIndexText(html, JSON.stringify(ix, null, 1));
  const meta = PF.scanDocument(out).byId.get('deck-meta');
  const m = JSON.parse(meta.text); m.player = JSON.parse(P1); m.generator = JSON.parse(G1);
  out = out.slice(0, meta.start) + `<script type="application/json" id="deck-meta">${PF.htmlSafeJson(JSON.stringify(m))}</script>` + out.slice(meta.end);
  return out;
}
const piece = (text, key) => { const i = text.indexOf(`"${key}"`); return text.slice(i, text.indexOf('}', i) + 1); };
ok('段 A の保存（口述原稿・音声・秒数）：player と generator をバイトのまま残す（Studio の名前を書かない）', async () => {
  const html = await foreign(base.html);
  const r = await PF.readPortable(html);
  const files = { ...r.files, 'audio/manifest.json': new TextEncoder().encode(PF.manifestFromAudio(r.audio)) };
  files['narration.md'] = new TextEncoder().encode(new TextDecoder().decode(files['narration.md']).replace('一歩ずつ進みます。', '一歩ずつ、ゆっくり進みます。'));
  const t = await tierA(html, files);
  assert.ok(t.ok, `[${t.code}] ${t.reason}`);
  assert.notEqual(t.html, html);
  const ix0 = PF.scanDocument(html).byId.get(FORMAT.INDEX_ID).text, ix1 = PF.scanDocument(t.html).byId.get(FORMAT.INDEX_ID).text;
  const m0 = PF.scanDocument(html).byId.get('deck-meta').text, m1 = PF.scanDocument(t.html).byId.get('deck-meta').text;
  for (const k of ['player', 'generator']) {
    assert.equal(piece(ix1, k), piece(ix0, k), `index ${k} byte for byte`);
    assert.equal(piece(m1, k), piece(m0, k), `deck-meta ${k} byte for byte`);
  }
  for (const x of [ix1, m1]) assert.ok(!x.includes('egatari-studio') && !x.includes('egatari-player'), 'tier A never stamps Studio or its player');
  // 実行系（再生器のスクリプト）も同じ
  const runtime = (h) => h.slice(h.indexOf('DECK.FORMAT = '), h.indexOf('</script>', h.indexOf('DECK.FORMAT = ')));
  assert.equal(runtime(t.html), runtime(html));
});
ok('作り直し（段 B）：再生器の名前が変わるときは知らせる（playerChange と warnings）。同じ名前なら知らせない。player・generator・tracking を書く', async () => {
  const other = await buildPortable(path.join(D, 'deck.html'), { carry: { ...plainJson(base.index), player: { name: 'other-player', version: '9.9.9' }, generator: { name: 'other-studio', version: '3.1' } } });
  assert.deepEqual(plainJson(other.playerChange), { from: { name: 'other-player', version: '9.9.9' }, to: plainJson(other.index.player) });
  assert.ok(other.warnings.some((w) => /will carry Egatari Player .* instead of its player "other-player" 9\.9\.9/.test(w)), JSON.stringify(other.warnings));
  assert.equal(other.index.player.name, 'egatari-player');
  assert.deepEqual(plainJson(other.index.generator), { name: 'egatari-studio', version: VERSION, title: 'Egatari Studio' });
  assert.ok(Array.isArray(metaOf(other.html).tracking));
  const same = await buildPortable(path.join(D, 'deck.html'), { carry: { ...plainJson(base.index), player: { name: 'egatari-player', version: '0.9.0' } } });
  assert.equal(same.playerChange, null);
  assert.ok(!same.warnings.some((w) => /will carry/.test(w)));
  // 前の草案の項目 contracts.runtime は作り直しで落とす
  const old = await buildPortable(path.join(D, 'deck.html'), { carry: { ...plainJson(base.index), contracts: { source: 1, runtime: 1 } } });
  assert.deepEqual(plainJson(old.index.contracts), { source: 1 });
});

// ---------------------------------------------------------------- ファイルの決まり（§4.2）
ok('ファイルの決まり：ちょうど 1 つ、<meta charset> の次（どのスクリプト・スタイル・<link>・URL の属性よりも前）、中身は基準のまま', () => {
  const h = base.html;
  assert.deepEqual(checkFilePolicy(h), []);
  const pol = findPolicies(h);
  assert.equal(pol.length, 1);
  assert.equal(pol[0].content, policyText());
  assert.ok(h.slice(0, pol[0].start).replace(/\s+/g, '').match(/^<!doctypehtml><htmllang="ja"data-theme="default"><head><metacharset="utf-8">$/i), JSON.stringify(h.slice(0, pol[0].start)));
  assert.ok(pol[0].start < h.search(/<script|<style|<link/i));
  // 再生専用の派生も同じ決まり
  assert.deepEqual(checkFilePolicy(PF.playOnly(h)), []);
  // 読み手の知らせ（決まりがない・緩めたもの）
  const noPol = h.slice(0, pol[0].start) + h.slice(pol[0].end);
  assert.ok(placementProblems(noPol).some((x) => /no Content-Security-Policy/.test(x)));
});
ok('置き場所の検査：前に来てよいのは doctype・<html>・<head>・<meta charset> だけ。on* 属性・2 つ目の決まりも断る', () => {
  const M = policyMeta(policyText());
  const doc = (head, htmlAttrs = '') => `<!DOCTYPE html><html${htmlAttrs}><head>${head}</head><body><p>x</p></body></html>`;
  assert.deepEqual(placementProblems(doc(`<meta charset="utf-8">${M}<title>t</title><script>1</script>`)), []);
  assert.deepEqual(placementProblems(doc(`${M}<meta charset="utf-8">`)), [], 'meta charset after the policy is allowed');
  assert.ok(placementProblems(doc(`<script>1</script>${M}`)).some((x) => /<script> comes before/.test(x)));
  assert.ok(placementProblems(doc(`<style>p{}</style>${M}`)).some((x) => /<style> comes before/.test(x)));
  assert.ok(placementProblems(doc(`<link rel="icon" href="data:,">${M}`)).some((x) => /<link> comes before/.test(x)));
  assert.ok(placementProblems(doc(`<title>t</title>${M}`)).some((x) => /<title> comes before/.test(x)));
  assert.ok(placementProblems(doc(`<meta charset="utf-8" onload="x()">${M}`)).some((x) => /onload/.test(x)));
  assert.ok(placementProblems(doc(M, ' onclick="x()"')).some((x) => /<html onclick>/.test(x)));
  assert.ok(placementProblems(doc(M + M)).some((x) => /2 Content-Security-Policy/.test(x)));
  assert.ok(placementProblems(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${M}</body></html>`).some((x) => /not in <head>/.test(x)));
});
ok('中身の比べ方：解析したディレクティブと源の集まり（順・空白・大文字小文字のキーワードは問わない）。足した源・欠けたディレクティブ・重ねたディレクティブは違い', () => {
  const B = policyText();
  assert.equal(B, BASELINE.map(([d, s]) => `${d} ${s.join(' ')}`).join('; '));
  assert.match(B, /connect-src 'none'/);
  const reordered = B.split('; ').reverse().map((x) => { const [d, ...src] = x.split(' '); return [d, ...src.reverse()].join('  '); }).join(' ;\t');
  assert.deepEqual(policyDiff(reordered, B), []);
  assert.deepEqual(policyDiff(B.replace("'none'", "'NONE'").replace('img-src data:', 'IMG-SRC DATA:'), B), []);
  assert.deepEqual(policyDiff(B.replace("connect-src 'none'", "connect-src 'none' https://x.example"), B), ['connect-src: extra source https://x.example']);
  assert.deepEqual(policyDiff(B.replace("; form-action 'none'", ''), B), ['missing directive "form-action"']);
  assert.deepEqual(policyDiff(B + "; script-src 'unsafe-eval'", B), ['directive "script-src" appears more than once']);
  assert.deepEqual(policyDiff(B + "; require-trusted-types-for 'script'", B), ['extra directive "require-trusted-types-for"']);
});
ok('拡張の行き先：live は endpoint の https: と wss: を connect-src に、embed は許す一覧の行き先を frame-src に（ほかは足さない）。授業の部屋の派生は決まりをその場で書き換える', () => {
  const ex = extensionSources({ live: { v: 1, endpoint: 'https://live.example.org' }, embed: { v: 1, items: { a: { src: 'https://www.youtube-nocookie.com/embed/X?start=3' }, b: { src: 'https://evil.example/embed' }, c: { src: 'https://www.google.com/maps/embed?pb=1' }, d: { src: 'http://player.vimeo.com/v' } } } });
  assert.deepEqual(ex, { connect: ['https://live.example.org', 'wss://live.example.org'], frame: ['https://www.google.com/maps/embed', 'https://www.youtube-nocookie.com'] });
  const T = policyText(ex);
  assert.match(T, /connect-src https:\/\/live\.example\.org wss:\/\/live\.example\.org;/);
  assert.match(T, /frame-src 'self' file: https:\/\/www\.google\.com\/maps\/embed https:\/\/www\.youtube-nocookie\.com;/);
  // 授業の部屋の派生（addLive）：再生専用の派生の決まりに endpoint を足す。置き場所はそのまま、決まりは 1 つ
  const live = { v: 1, endpoint: 'https://live.example.org', room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: '2026-10-26T00:00:00Z', to: '2026-10-26T02:00:00Z' }, activities: {} };
  const po = PF.playOnly(base.html);
  const L = addLive(po, live, liveRuntimeText());
  const p0 = findPolicies(po)[0], p1 = findPolicies(L);
  assert.equal(p1.length, 1);
  assert.equal(p1[0].start, p0.start);
  assert.deepEqual(policyDiff(p1[0].content, policyText({ connect: ['https://live.example.org', 'wss://live.example.org'] })), []);
  assert.deepEqual(checkFilePolicy(L), [], 'the live derivative conforms (expected policy from its deck-extensions)');
  // embed の行き先を持つ決まりに足しても、frame-src の行き先は残る
  const withEmbed = po.slice(0, p0.start) + policyMeta(policyText({ frame: ['https://www.youtube-nocookie.com'] })) + po.slice(p0.end);
  const L2 = addLive(withEmbed, live, liveRuntimeText());
  assert.deepEqual(policyDiff(findPolicies(L2)[0].content, policyText({ connect: ['https://live.example.org', 'wss://live.example.org'], frame: ['https://www.youtube-nocookie.com'] })), []);
  // 緩めた決まりには足さない
  const loose = po.slice(0, p0.start) + policyMeta(policyText().replace("img-src data: blob:", 'img-src *')) + po.slice(p0.end);
  assert.throws(() => addLive(loose, live, liveRuntimeText()), /not the baseline/);
});

ok('live と embed を 1 つのファイルに：書き出しは extensions.embed を deck-extensions に写し（どの 1 ファイルにも）、決まりの frame-src に行き先を足す。授業の部屋はそのブロックに live を足し、connect-src に endpoint。どちらの拡張も自分のディレクティブだけ', async () => {
  const YT = 'https://www.youtube-nocookie.com/embed/X';
  const embed = { v: 1, items: { v1: { src: YT, title: '動画' } } };
  const d = path.join(work, 'embed');
  makeDeck(d);
  // 教材の授業の部屋の設定（鍵なし）も持つ：索引には live と embed の両方
  const cfg = JSON.parse(fs.readFileSync(path.join(d, FORMAT.CONFIG_FILE), 'utf8'));
  fs.writeFileSync(path.join(d, FORMAT.CONFIG_FILE), JSON.stringify({ ...cfg, extensions: { live: { v: 1, endpoint: 'https://live.example.org', activities: {} } } }, null, 2) + '\n');
  const r0 = await buildPortable(path.join(d, 'deck.html'), {});
  const r = await buildPortable(path.join(d, 'deck.html'), { carry: { ...plainJson(r0.index), extensions: { ...plainJson(r0.index.extensions), embed } } });
  assert.ok(r.index.extensions.embed && r.index.extensions.live, 'the index has both');
  const blockOf = (h) => { const m = /<script type="application\/json" id="deck-extensions">([^<]*)<\/script>/.exec(h); return m ? JSON.parse(m[1]) : null; };
  assert.deepEqual(blockOf(r.html), { embed }, 'the editable file carries embed in deck-extensions (live only goes in with a room)');
  const want = policyText({ frame: ['https://www.youtube-nocookie.com'] });
  assert.equal(findPolicies(r.html)[0].content, want);
  assert.deepEqual(checkFilePolicy(r.html), []);
  assert.deepEqual((await PF.readPortable(r.html)).warnings.filter((w) => /not conforming/.test(w)), []);
  // 再生専用の派生も同じブロックと決まり
  const po = PF.playOnly(r.html);
  assert.deepEqual(blockOf(po), { embed }); assert.deepEqual(checkFilePolicy(po), []);
  // 授業の部屋を足す：ブロックは 1 つで live と embed、決まりは connect-src と frame-src の両方
  const live = { v: 1, endpoint: 'https://live.example.org', room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: '2026-10-26T00:00:00Z', to: '2026-10-26T02:00:00Z' }, activities: {} };
  const L = addLive(po, live, liveRuntimeText());
  assert.equal((L.match(/id="deck-extensions"/g) || []).length, 1);
  const b = blockOf(L);
  assert.deepEqual(Object.keys(b).sort(), ['embed', 'live']); assert.deepEqual(b.embed, embed); assert.equal(b.live.room, live.room);
  assert.equal(findPolicies(L).length, 1);
  assert.deepEqual(policyDiff(findPolicies(L)[0].content, policyText({ connect: ['https://live.example.org', 'wss://live.example.org'], frame: ['https://www.youtube-nocookie.com'] })), []);
  assert.deepEqual(checkFilePolicy(L), [], 'baseline + live (connect-src) + embed (frame-src), parsed');
  assert.ok(L.indexOf('<script>\nwindow.DECK = window.DECK || {}; DECK.LIVE_CFG') > L.indexOf('id="deck-extensions"'), 'the live player follows the block');
  // 2 つ目の部屋は断る
  assert.throws(() => addLive(L, live, liveRuntimeText()), /already carries a live session/);
  // 逆の順：live の決まりを持つ派生でも、宣言の比べ方は同じ（どちらの拡張も自分のディレクティブだけ）
  const loose = L.replace("frame-src 'self' file: https://www.youtube-nocookie.com", "frame-src 'self' file: https://www.youtube-nocookie.com https://live.example.org");
  assert.ok(checkFilePolicy(loose).some((x) => /frame-src: extra source https:\/\/live\.example\.org/.test(x)), 'live does not widen frame-src');
});

// ---------------------------------------------------------------- 旧来の鍵・id
ok('旧来の鍵を書かない：id のない原稿（見出しの鍵・手で書いた data-key・s<n>）から書き出すと、どのスライドも id、見出しはどれも {#id}、記録の鍵（音声・timeline・設定の活動）も id。2 回目は何も変えない', async () => {
  const d = path.join(work, 'legacy');
  fs.mkdirSync(path.join(d, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(d, 'deck.html'), `<!doctype html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>旧来の鍵</title></head>
<body>
<div id="stage">
<section class="slide cover"><h1>はじめに</h1></section>
<section class="slide" data-key="dk-two"><h2>二枚目</h2><p data-step="1"><span id="target">印</span></p></section>
<section class="slide"><p>見出しのないスライド</p></section>
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(d, 'narration.md'), '# 口述原稿\n\n## はじめに\n[0] 始めます。\n\n## dk-two\n[0] 二枚目です。\n[1] {mark:target|circle}ここを見ます。\n\n## s3\n[0] 三枚目です。\n');
  const { silentWav } = await import('./portable-fixtures.mjs');
  fs.writeFileSync(path.join(d, 'audio', 'a.wav'), silentWav(0.5));
  fs.writeFileSync(path.join(d, 'audio', 'manifest.json'), JSON.stringify({ segments: { 'はじめに:0': { file: 'a.wav', dur: 0.5, cues: [], engine: 'dry-run' }, 'dk-two:1': { file: 'a.wav', dur: 0.5, cues: [0.1], engine: 'dry-run' } } }, null, 1) + '\n');
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ 's3:0': { hold: 2 } }) + '\n');
  fs.writeFileSync(path.join(d, FORMAT.CONFIG_FILE), JSON.stringify({ docId: '3f2c9a8e-1b2d-4c5e-9f00-1122334455aa', xOther: { keep: 1e400 }, extensions: { live: { v: 1, endpoint: FORMAT.LIVE_ENDPOINT, activities: { '*': [], 'dk-two:1': [{ id: 'p', kind: 'qa' }] } } } }, null, 2).replace('"keep": null', '"keep": 1e400') + '\n');
  // 品質チェックは id のない原稿を受け付ける（エラー 0。夜の評価の A は AI が書いたままの原稿）
  const chk = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(d, 'deck.html'), '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(chk.status, 0, chk.stdout.slice(0, 2000) + chk.stderr.slice(0, 2000));
  const before = fs.readFileSync(path.join(d, 'deck.html'), 'utf8');
  const r = await buildPortable(path.join(d, 'deck.html'), {});
  const ids = r.ids.added.map((a) => a.id);
  assert.equal(ids.length, 3);
  assert.deepEqual(r.ids.added.map((a) => a.key), ['はじめに', 'dk-two', 's3']);
  for (const id of ids) assert.match(id, /^s-[a-z2-7]{6}$/);
  // 作業フォルダに書き戻した（控えは .cache/edits/）
  const deck = fs.readFileSync(path.join(d, 'deck.html'), 'utf8'), narr = fs.readFileSync(path.join(d, 'narration.md'), 'utf8');
  assert.ok(fs.readdirSync(path.join(d, '.cache', 'edits')).some((f) => f.endsWith('deck.html') && fs.readFileSync(path.join(d, '.cache', 'edits', f), 'utf8') === before));
  assert.ok(!/data-key/.test(deck), 'no hand-written data-key');
  assert.deepEqual(parseNarration(narr).sections.map((s) => [s.heading, s.id]), [['はじめに', ids[0]], ['dk-two', ids[1]], ['s3', ids[2]]]);
  const man = JSON.parse(fs.readFileSync(path.join(d, 'audio', 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(man.segments), [`${ids[0]}:0`, `${ids[1]}:1`]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(d, 'timeline.json'), 'utf8'))), [`${ids[2]}:0`]);
  const cfgText = fs.readFileSync(path.join(d, FORMAT.CONFIG_FILE), 'utf8');
  assert.ok(cfgText.includes('1e400'), 'other members of egatari.json keep their bytes');
  assert.deepEqual(Object.keys(JSON.parse(cfgText).extensions.live.activities), ['*', `${ids[1]}:1`]);
  // ファイルの中も
  const x = await PF.readPortable(r.html);
  assert.deepEqual(Object.keys(x.audio), [`${ids[0]}:0`, `${ids[1]}:1`]);
  assert.deepEqual(Object.keys(x.index.extensions.live.activities), ['*', `${ids[1]}:1`]);
  const sh = PF.scanDocument(r.html);
  assert.deepEqual([...r.html.matchAll(/<section class="slide[^"]*"[^>]*\bdata-key="([^"]*)"/g)].map((m) => m[1]), ids, 'compiled slides are keyed by their ids');
  assert.deepEqual([...r.html.matchAll(/<article data-slide-key="([^"]*)"/g)].map((m) => m[1]), ids, 'readable layer keyed by ids');
  const narrJson = JSON.parse(r.html.match(/<script type="application\/json" id="deck-narration">([^<]*)<\/script>/)[1]);
  assert.deepEqual(Object.keys(narrJson), ids);
  const marks = JSON.parse(r.html.match(/<script type="application\/json" id="deck-marks">([^<]*)<\/script>/)[1]);
  assert.deepEqual(Object.keys(marks), [`${ids[1]}:1`]);
  assert.ok(!/zoom|camera/.test(JSON.stringify(marks)) && !x.index.requires.some((f) => /camera/.test(f)), 'no camera-v1, no {zoom}');
  assert.ok(x.index.requires.every((f) => PF.FEATURES.includes(f)));
  assert.ok(!/:name:/.test(new TextDecoder().decode(x.files['narration.md'])));
  assert.ok(sh.byId.has('deck-meta'));
  // 2 回目：何も書き戻さない、同じファイル
  const r2 = await buildPortable(path.join(d, 'deck.html'), {});
  assert.deepEqual(Object.keys(r2.writes), []);
  assert.equal(r2.html, r.html);
  // 付けられない原稿（id の書式の誤り）は断る
  fs.writeFileSync(path.join(d, 'deck.html'), deck.replace(`id="${ids[0]}"`, 'id="1bad"'));
  await assert.rejects(buildPortable(path.join(d, 'deck.html'), {}), (e) => e.code === 'slide-ids');
});

// ---------------------------------------------------------------- 教材のシード値はない（format spec 28d8801 §8.4：変種は名前だけで選ぶ）
ok('シード値：シードのない原稿の組み立て・書き出しは data-egatari-seed も部品の seed も書かない。variant はそのまま通す。前の原稿のシードは段 A で触らない', async () => {
  const d = path.join(work, 'seed');
  makeDeck(d);
  const src = fs.readFileSync(path.join(d, 'deck.html'), 'utf8').replace('<p data-step="1">次の段階</p>', '<p data-step="1" variant="b">次の段階</p>');
  fs.writeFileSync(path.join(d, 'deck.html'), src);
  const { build } = await import('../kit/build.mjs');
  const plain = build(path.join(d, 'deck.html'), { subset: false }).html;
  const r = await buildPortable(path.join(d, 'deck.html'), {});
  for (const [w, h] of [['build', plain], ['Egatari file', r.html], ['play-only', PF.playOnly(r.html)]]) {
    assert.ok(!/data-egatari-seed/.test(h), `${w}: no data-egatari-seed`);
    assert.ok(!/<m-[a-z0-9-]+\b[^>]*\sseed\s*=/.test(h), `${w}: no component seed`);
    assert.ok(h.includes('<p data-step="1" variant="b">'), `${w}: variant passes through`);
  }
  const seeds = (v, out = []) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'recipe') continue; if (k === 'seed') out.push(k); seeds(x, out); } return out; };
  assert.deepEqual(seeds(plainJson(r.index)), [], 'the index has no seed (only TTS recipes carry their own)');
  // 前の原稿のシード（誰も読まない属性）：段 A の保存はバイトのまま
  const old = path.join(work, 'seed-old');
  makeDeck(old);
  fs.writeFileSync(path.join(old, 'deck.html'), fs.readFileSync(path.join(old, 'deck.html'), 'utf8').replace('data-theme="default"', 'data-theme="default" data-egatari-seed="3141592653"'));
  const o = await buildPortable(path.join(old, 'deck.html'), {});
  const x = await PF.readPortable(o.html);
  const files = { ...x.files, 'audio/manifest.json': new TextEncoder().encode(PF.manifestFromAudio(x.audio)) };
  files['narration.md'] = new TextEncoder().encode(new TextDecoder().decode(files['narration.md']).replace('次の段階です。', '次の段階です、ここから。'));
  const t = await tierA(o.html, files);
  assert.ok(t.ok, t.reason);
  const back = await PF.readPortable(t.html);
  assert.ok(new TextDecoder().decode(back.files['deck.html']).includes('data-egatari-seed="3141592653"'), 'tier A keeps the old source byte for byte');
  assert.equal((t.html.match(/data-egatari-seed="3141592653"/g) || []).length, (o.html.match(/data-egatari-seed="3141592653"/g) || []).length);
});

// ---------------------------------------------------------------- 1.0 の語彙にない書き方（spec §8.0）
// 書かないもの：data-steps・data-anim・<html data-mode="lecture">・色のクラス blue・red・gray。品質チェックは警告（エラーにしない）
const LEGACY_RE = { steps: /\sdata-steps\s*=/, anim: /\sdata-anim\s*=/, lecture: /<html\b[^>]*\sdata-mode\s*=\s*["']?lecture/i, color: /\sclass\s*=\s*"[^"]*\b(?:blue|red|gray)\b[^"]*"/ };
// 実行系（<script>・<style>）の外の文書（再生器のコードは名前を字として持つので除く）
const markup = (h) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
ok('1.0 の語彙にない書き方：組み立て・書き出し・再生専用・新しい教材の雛形のどれも data-steps・data-anim・data-mode="lecture"・blue/red/gray を書かない', async () => {
  const { build } = await import('../kit/build.mjs');
  const { newDeckFiles } = await import('../kit/templates/new-deck.mjs');
  const outs = [['build', build(path.join(D, 'deck.html'), { subset: false }).html], ['dev build', build(path.join(D, 'deck.html'), { subset: false, dev: true }).html], ['Egatari file', base.html], ['play-only', PF.playOnly(base.html)]];
  for (const [w, f] of Object.entries(newDeckFiles({ blank: false }))) if (/\.html$/.test(w)) outs.push([`template ${w}`, f]);
  for (const [w, h] of outs) for (const [k, re] of Object.entries(LEGACY_RE)) assert.ok(!re.test(markup(h)), `${w}: no ${k}`);
});
ok('品質チェック：data-steps・data-anim・data-mode="lecture"・blue/red/gray は警告（エラーではない）で、代わりに使うものを言う。どれもなければ何も言わない', async () => {
  const { legacyVocabulary } = await import('../kit/core/legacy-vocab.mjs');
  const src = fs.readFileSync(path.join(D, 'deck.html'), 'utf8');
  assert.deepEqual(legacyVocabulary(src), []);
  const bad = src.replace('<html lang="ja"', '<html lang="ja" data-mode="lecture"')
    .replace('<p data-step="1">次の段階</p>', '<p data-step="1"><span class="blue">用語</span> <b class="red x">結論</b> <span class="gray">既知</span> <span class="red">もう一つ</span></p>')
    .replace('<section class="slide"', '<section class="slide" data-steps="2" data-anim="grow"');
  const got = legacyVocabulary(bad).map((x) => [x.code, x.what, x.to || null, x.n]);
  assert.deepEqual(got.sort(), [['legacyColorClass', 'blue', 'term', 1], ['legacyColorClass', 'gray', 'muted', 1], ['legacyColorClass', 'red', 'emph', 2], ['legacyLectureMode', 'data-mode="lecture"', null, 1], ['legacyStepAttr', 'data-anim', null, 1], ['legacyStepAttr', 'data-steps', null, 1]].sort());
  const d = path.join(work, 'legacy-vocab');
  makeDeck(d);
  fs.writeFileSync(path.join(d, 'deck.html'), bad);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(d, 'deck.html'), '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const j = JSON.parse(r.stdout);
  const mine = j.results.filter((x) => /^legacy(ColorClass|StepAttr|LectureMode)$/.test(x.code));
  assert.equal(mine.length, 6, JSON.stringify(mine.map((x) => x.code)));
  assert.ok(mine.every((x) => x.sev === 'warn'), 'warnings, not errors');
  assert.equal(r.status, 0, 'no errors (the nightly A corpus stays as it was)');
  const msg = (code, what) => mine.find((x) => x.code === code && (!what || x.data.what === what)).msg;
  assert.match(msg('legacyColorClass', 'blue'), /「term」/); assert.match(msg('legacyColorClass', 'red'), /「emph」/); assert.match(msg('legacyColorClass', 'gray'), /「muted」/);
  assert.match(msg('legacyStepAttr', 'data-steps'), /data-step と data-at/);
  assert.match(msg('legacyLectureMode'), /先のステップを薄く見せる/);
  const e = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(d, 'deck.html'), '--json', '--lang', 'en'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.match(JSON.parse(e.stdout).results.find((x) => x.code === 'legacyLectureMode').msg, /Show later steps faintly/);
});

// ---------------------------------------------------------------- 記事だけの教材（§9C・§4）
ok('記事だけの教材：index.article があれば entry はいらない。どちらもなければ断る。記事のある教材は作り直さない（article-v1 を持たない）', async () => {
  const fx = (k, f) => PF.parseJsonStrict(fs.readFileSync(path.join(SPEC, 'fixtures', 'index', k, f), 'utf8'));
  assert.deepEqual(PF.validateIndex(fx('valid', 'book-only.json')), []);
  assert.ok(PF.validateIndex(fx('invalid', 'no-entry-no-article.json')).some((e) => /missing "entry" \(or "article"/.test(e)));
  assert.ok(PF.validateIndex({ ...plainJson(fx('valid', 'book-only.json')), article: { references: 'r.json' } }).some((e) => /article: missing "path"/.test(e)));
  // 読み取り：entry のない索引でも読める（記事の path は files にあること）
  const el = PF.scanDocument(base.html).byId.get(FORMAT.INDEX_ID);
  const ix = JSON.parse(el.text); delete ix.entry; ix.article = { path: 'narration.md' };
  const r = await PF.readPortable(await PF.replaceIndexText(base.html, JSON.stringify(ix, null, 1)));
  assert.equal(r.index.article.path, 'narration.md');
  ix.article = { path: 'article.md' };
  await assert.rejects(PF.readPortable(await PF.replaceIndexText(base.html, JSON.stringify(ix, null, 1))), (e) => e.code === 'invalid-index');
  await assert.rejects(buildPortable(path.join(D, 'deck.html'), { carry: { ...plainJson(base.index), article: { path: 'article.md' } } }), (e) => e.code === 'article-unsupported');
});

// ---------------------------------------------------------------- 編集アプリのプレビュー（信頼する先頭部分 + ファイル自身の決まり）
ok('編集アプリのプレビュー：1 ファイル（自分の決まりを持つ）を信頼する先頭部分に続けても描け、仲立ちが動く（品質チェックの返事・縮図）。決まりの違反なし', async () => {
  const appHtml = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
  const APP_CSP = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(appHtml) || [])[1];
  assert.ok(APP_CSP);
  const HOST = '<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="f" sandbox="allow-scripts allow-modals"></iframe><script src="/host.js"></script></body></html>';
  const HOST_JS = `window.M = []; addEventListener('message', (e) => { if (e.data && e.data.type) M.push(e.data); }); window.__ready = true;`;
  const srv = http.createServer((req, res) => {
    if (req.url === '/host') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': APP_CSP }); return res.end(HOST); }
    if (req.url === '/host.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(HOST_JS); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/host`);
    await page.waitForFunction(() => window.__ready === true);
    const SHIM = withLayoutScan(fs.readFileSync(path.join(ROOT, 'app', 'frame-shim.js'), 'utf8'));
    const VIOL = `window.__viol = []; document.addEventListener('securitypolicyviolation', function(e){ __viol.push(e.violatedDirective + ' ' + e.blockedURI); });`;
    const load = (doc) => page.evaluate((d) => new Promise((res) => {
      const old = document.getElementById('f'), f = document.createElement('iframe');
      f.id = 'f'; f.setAttribute('sandbox', 'allow-scripts allow-modals');
      f.addEventListener('load', () => res(), { once: true });
      old.replaceWith(f); M.length = 0; f.srcdoc = d;
    }), doc);
    const frame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
    // プレビュー（dev）：品質チェックを頼み、返事が来る
    await load(previewDocument(base.html, `${VIOL}${SHIM}(${JSON.stringify({ dev: true, load: 1 })});`));
    await frame().waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
    const st = await frame().evaluate(() => {
      const metas = [...document.querySelectorAll('meta')].filter((m) => (m.getAttribute('http-equiv') || '').toLowerCase() === 'content-security-policy').map((m) => m.content);
      const s = document.querySelector('section.slide');
      return { metas, slides: DECK.slides.length, visible: !!s && s.getBoundingClientRect().width > 100, readableHidden: document.getElementById('egatari-readable').hidden, viol: window.__viol, fonts: document.fonts.size };
    });
    assert.equal(st.metas.length, 2, 'the preview policy (trusted prefix) and the file\'s own policy');
    assert.match(st.metas[0], /'unsafe-eval'/, 'the trusted prefix comes first');
    assert.equal(st.metas[1], policyText(), 'the file keeps its own policy');
    assert.equal(st.slides, 2); assert.ok(st.visible); assert.equal(st.readableHidden, true);
    await page.evaluate(() => document.getElementById('f').contentWindow.postMessage({ type: 'app-check', id: 'q1' }, '*'));
    await page.waitForFunction(() => M.some((m) => m.type === 'app-check-result'), null, { timeout: 30000 });
    const viol = await frame().evaluate(() => window.__viol);
    assert.deepEqual(viol, [], 'no CSP violation in the preview');
    // 縮図（スライド一覧）：仲立ちが写しを並べ、知らせる
    await load(previewDocument(base.html, `${VIOL}${SHIM}(${JSON.stringify({ strip: { w: 160, row: 96, bg: '#000' } })});`));
    await page.waitForFunction(() => M.some((m) => m.type === 'app-strip-ready'), null, { timeout: 30000 });
    assert.equal((await page.evaluate(() => M.find((m) => m.type === 'app-strip-ready').n)), 2);
    assert.deepEqual(await frame().evaluate(() => window.__viol), []);
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n' + (e && e.stack || e)); }
}
console.log(`file shape: ${tests.length - failed}/${tests.length} ok (${work})`);
process.exit(failed ? 1 : 0);
