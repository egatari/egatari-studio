// パーツのサンプルのページ（tools/parts-gallery.mjs、backlog #158）の試験
// test-all: unit
//   node tools/test-parts-gallery.mjs            ブラウザなし・ネットワークなし（数秒）：道具の写しが SOURCE.json と合う・前の版の選び方・取り込んだどのカタログも組める・
//                                                取り込んだ 2.1.1 の写しだけから gallery.mjs --pack が教材を書く（パーツ・まとまり・枚数・2.1.0 と比べた印）・
//                                                写しが manifest と違えば断る・編集アプリのリンクの URL・版の一覧のページ
//   node tools/test-parts-gallery.mjs --build    組み立てと検査（約 2〜5 分、ブラウザが要る。CI の tier2）：build-app --parts の出力に /parts/v<版>/index.html と
//                                                /parts/index.html があり、組んだページが全部のスライドを持ち、assemble の後も /parts/ にあって /v<版>/parts/ はない。
//                                                gallery の教材を kit/check.mjs で検査してエラー 0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolProblems, previousCatalogue, galleryDeck, packFolder, partsIndexHtml, TOOL_DIR } from './parts-gallery.mjs';
import { PARTS_GALLERY, PARTS_CATALOGUE, partsGalleryUrl } from '../app/parts-gallery.js';
import { assemble } from './site-versions.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD = process.argv.includes('--build');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parts-gallery-'));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));

// ---------------------------------------------------------------- 道具の写し・版
const bad = toolProblems();
ok(bad.length === 0, 'vendor/components-gallery matches SOURCE.json' + (bad.length ? ': ' + bad.join('; ') : ''));
const src = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'SOURCE.json'), 'utf8'));
ok(/^[0-9a-f]{40}$/.test(src.commit) && src.repository === 'https://github.com/egatari/components', `SOURCE.json pins a full commit of egatari/components (${src.commit})`);
ok(previousCatalogue(lock2, '2.1.2') === '2.1.1' && previousCatalogue(lock2, '2.1.1') === '2.1.0' && previousCatalogue(lock2, '2.1.0') === '2.0.0' && previousCatalogue(lock2, '2.0.0') === null,
  'previousCatalogue: the newest earlier release (release candidates are not compared)');
ok(PARTS_CATALOGUE === lock2.default && PARTS_GALLERY === `https://studio.egatari.org/parts/v${lock2.default}/` && partsGalleryUrl('2.1.1') === 'https://studio.egatari.org/parts/v2.1.1/',
  `the editor links to the default catalogue's page with an absolute URL (${PARTS_GALLERY})`);

// ---------------------------------------------------------------- 2.1.2 の写しから教材を書く（gallery.mjs --pack）
const W = path.join(tmp, 'work');
const g = galleryDeck({ work: W, catalogue: '2.1.2' });
ok(g.parts === 38 && g.groups === 22 && g.slides === 175 && g.previous === '2.1.1', `2.1.2: ${g.parts} parts in ${g.groups} groups, ${g.slides} slides, marks against ${g.previous}`);
const deck = fs.readFileSync(path.join(W, 'deck.html'), 'utf8');
ok((deck.match(/<section\b[^>]*\bclass="slide\b/g) || []).length === 175, 'the deck has 175 slides');
ok(JSON.parse(fs.readFileSync(path.join(W, 'egatari.json'), 'utf8')).componentsCatalogue === '2.1.2', 'egatari.json selects the 2.1.2 catalogue');
ok(deck.includes('m-hissan（変わった') && deck.includes('m-boxplot（変わった') && deck.includes('m-orbit（変わった') &&
  !deck.includes('m-kakijun（変わった') && !deck.includes('m-kakijun（サンプルが変わった') &&
  deck.includes('<title>パーツのサンプル（v2.1.2）</title>') && !deck.includes('（新しい'),
  'marks against 2.1.1: every element but m-kakijun changed (code-only audit fixes across 37 parts), nothing new; Studio\'s words (パーツのサンプル)');
// 取り込んだどのカタログも、そのカタログの写しから組める（gallery.mjs --pack は写しを manifest の各ファイルの sha256 と照らす。後のリリースが
// 版を上げずに README・demo だけ直しても、前のカタログは前のバイトのまま：components2.lock.json の catalogues.<版>.content）
for (const cv of Object.keys(lock2.catalogues).sort()) {
  let gv = null, err = null;
  try { gv = galleryDeck({ work: path.join(tmp, 'work-' + cv), catalogue: cv }); } catch (e) { err = e; }
  ok(gv && gv.parts > 30 && gv.slides > 150, `catalogue ${cv}: the gallery builds from its own vendored copy${gv ? ` (${gv.parts} parts, ${gv.slides} slides)` : ': ' + String(err && err.message).slice(0, 300)}`);
}
const g0 = galleryDeck({ work: path.join(tmp, 'work0'), catalogue: '2.1.2', previous: 'none' });
ok(g0.slides === 175 && !fs.readFileSync(path.join(tmp, 'work0', 'deck.html'), 'utf8').includes('（変わった'), '--previous none: no marks');
// 写しが manifest と違えば gallery.mjs が断る（取り込みの写しを手で直していないことの確かめ）
const P = path.join(tmp, 'pack');
packFolder(path.join(ROOT, 'vendor', 'components-2', 'manifest-2.1.2.json'), P);
fs.appendFileSync(path.join(P, 'bars', 'demo.html'), '\n<!-- changed -->\n');
const r = spawnSync(process.execPath, [path.join(TOOL_DIR, 'tools', 'gallery.mjs'), '--pack', P, '--manifest', path.join(ROOT, 'vendor', 'components-2', 'manifest-2.1.2.json'), '-o', path.join(tmp, 'w2')], { encoding: 'utf8' });
ok(r.status === 1 && /bars\/demo\.html: sha256 differs/.test(r.stderr), 'a pack that differs from the manifest is refused (exit 1)');
// 道具の写しは npm の依存なしで動く（node_modules のない場所に写して --pack）
const T = path.join(tmp, 'tool');
fs.cpSync(TOOL_DIR, T, { recursive: true });
const P2 = path.join(tmp, 'pack2');
packFolder(path.join(ROOT, 'vendor', 'components-2', 'manifest-2.1.2.json'), P2);
const r2 = spawnSync(process.execPath, [path.join(T, 'tools', 'gallery.mjs'), '--pack', P2, '--manifest', path.join(ROOT, 'vendor', 'components-2', 'manifest-2.1.2.json'), '-o', path.join(tmp, 'w3')], { encoding: 'utf8', cwd: tmp });
ok(r2.status === 0 && /175 slides/.test(r2.stdout), 'the vendored tool runs --pack without node_modules' + (r2.status ? ': ' + r2.stderr.slice(-300) : ''));

// ---------------------------------------------------------------- 版の一覧のページ
const html = partsIndexHtml({ current: '2.1.2', versions: ['2.0.0', '2.2.0', '2.1.2'] });
const at = (v) => html.indexOf(`href="v${v}/"`);
ok(at('2.1.2') > 0 && at('2.1.2') < at('2.2.0') && at('2.2.0') < at('2.0.0') && /Current/.test(html) && /<meta name="viewport"/.test(html) && /prefers-color-scheme:dark/.test(html),
  'parts/index.html: current first, then newest first; viewport and dark colours');

// ---------------------------------------------------------------- 組み立て（--build）
if (BUILD) {
  const SITE = path.join(tmp, 'site');
  const t0 = Date.now();
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-app.mjs'), '--out', SITE, '--parts', '--no-single', '--no-examples'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`  build-app --parts: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const page = path.join(SITE, 'parts', `v${lock2.default}`, 'index.html');
  ok(fs.existsSync(page) && fs.statSync(page).size > 1048576, `build-app --parts writes parts/v${lock2.default}/index.html (${fs.existsSync(page) ? (fs.statSync(page).size / 1048576).toFixed(1) : 0} MB)`);
  const built = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '';
  ok((built.match(/<section\b[^>]*\bclass="slide\b/g) || []).length === g.slides && /m-orbit/.test(built) && !/<script\s+src=/i.test(built),
    `the built page has all ${g.slides} slides and loads nothing from outside`);
  const vj = JSON.parse(fs.readFileSync(path.join(SITE, 'parts', 'versions.json'), 'utf8'));
  ok(fs.existsSync(path.join(SITE, 'parts', 'index.html')) && vj.current === lock2.default && vj.versions.join() === lock2.default, 'parts/index.html and versions.json list the built version ' + JSON.stringify(vj));
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  assemble({ site: SITE, current: version, releases: [], log: () => {} });
  ok(fs.existsSync(page) && fs.existsSync(path.join(SITE, 'parts', 'index.html')) && fs.existsSync(path.join(SITE, `v${version}`, 'index.html')) && !fs.existsSync(path.join(SITE, `v${version}`, 'parts')),
    `after assemble: /parts/v${lock2.default}/ and /parts/index.html stay; /v${version}/ has no parts/`);
  // 検査（kit/check.mjs）：エラー 0（口述原稿のない教材なので narrMissing などの警告は出る）
  const c = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), path.join(W, 'deck.html'), '--json'], { encoding: 'utf8', maxBuffer: 256 * 1048576 });
  let rep = null; try { rep = JSON.parse(c.stdout); } catch { /* 下で失敗 */ }
  const errs = rep && Array.isArray(rep.results) ? rep.results.filter((x) => x.sev === 'error') : null;
  ok(c.status === 0 && errs && errs.length === 0 && rep.counts.error === 0,
    `kit/check.mjs on the gallery: exit ${c.status}, ${errs ? errs.length : '?'} errors${errs && errs.length ? ': ' + errs.slice(0, 5).map((x) => x.code + ' ' + (x.msg || '')).join(' | ') : ''}${rep ? ` (warn ${rep.counts.warn}, info ${rep.counts.info})` : ' ' + (c.stderr || '').slice(-400)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
