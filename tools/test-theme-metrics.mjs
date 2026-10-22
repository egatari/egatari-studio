// テーマの寸法の宣言（theme.json の metrics。docs/contract.md §12、format spec §6、backlog #76）の試験
//   node tools/test-theme-metrics.mjs [作業フォルダ]
// 1. 既定と検証（kit/core/theme-metrics.mjs）：既定から導く限りが今までの定数（565・680・1236・1162・124・44）と同じ。layout-scan.mjs の中に書いた既定
//    （layoutScan と metricsProbe。文字列にしてページに入れるので外の名前を使えない）が DEFAULT_METRICS と同じ。項目ごとの継承、読めない値（文字列・範囲の外・
//    知らない項目・v が 1 でない・互いに合わない）は警告して親の値
// 2. 組み立て：theme.json の metrics を extends の親から項目ごとに重ね、build の戻り値の theme に {name, metrics, declared}。読めない値は「theme-metrics: …」の警告で、
//    誤りにはしない。metrics はテーマの同一性の hash（index.themes の sha256・作業フォルダのテーマのファイル）に入る
// 3. 同梱のテーマ（themes/*。部品庫の写し vendor/components にテーマがあればそれも）は、描いた箱が宣言（なければ既定）と 1px を超えて違わない（厳しく。CI で失敗にする）
// 4. 品質チェック（kit/check.mjs --json）：宣言した限りで本文の場所を見る（試験用のテーマ tools/fixtures/theme-metrics-wide：結論の行 540px → 下の限り 534px、
//    右の限り 1188px）。宣言と CSS がずれれば themeMetricsDrift（宣言なしで箱を動かす・宣言だけで CSS がない・--bar-h・デッキの CSS が動かす）、
//    読めない宣言は themeMetricsInvalid（デッキに 1 回）。どれも警告
// 5. ブラウザ版の品質チェック（app/frame-shim.js）も同じ限りと同じ themeMetricsDrift。修正依頼の量の目安（kit/core/llm-fix.mjs）は値の限りと 1 行の高さを使う
// 6. tools/theme-metrics.mjs measure が描いた箱から宣言の塊を作る（試験用のテーマで宣言と同じ値。整数の px で、限りが緩くなる側へ 1px 未満で丸め、
//    丸めだけではずれにならない）。#75 の試験用のテーマ（tools/fixtures/theme-override）は宣言しないまま：themeMetricsDrift がちょうど 1 つ、エラーなし
// 7. 字体：同梱の字体が読み込めない（同梱でない字体の名前・壊れた @font-face）ときは測らず metricsFontLoad（警告、デッキに 1 回）。コマンド版・ブラウザ版・measure
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { previewDocument } from '../app/preview-doc.js';
import { layoutScan, metricsProbe, withLayoutScan } from '../kit/core/layout-scan.mjs';
import { DEFAULT_METRICS, applyMetrics, resolveMetrics, limitsOf, sameMetrics } from '../kit/core/theme-metrics.mjs';
import { parseCheck } from '../kit/core/check-result.mjs';
import { message } from '../kit/check-messages.mjs';
import { amountOf } from '../kit/core/llm-fix.mjs';
import { identityBytes } from '../kit/core/identity-hash.mjs';
import { measureTheme, blockFrom } from './theme-metrics.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-theme-metrics-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n     ')); }
};
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const WIDE = path.join(ROOT, 'tools', 'fixtures', 'theme-metrics-wide');
const WIDE_CSS = fs.readFileSync(path.join(WIDE, 'tokens.css'), 'utf8');
const WIDE_JSON = JSON.parse(fs.readFileSync(path.join(WIDE, 'theme.json'), 'utf8'));

// ---------------------------------------------------------------- 1. 既定と検証
await t('defaults: the limits derived from the default metrics are the old constants', () => {
  assert.deepEqual(limitsOf(DEFAULT_METRICS), { conclBottom: 565, floor: 680, right: 1236, tateFloor: 680, tateRight: 1162, tateLeftConcl: 124, tateLeft: 44 });
});
await t('defaults: layoutScan and metricsProbe carry the same defaults as DEFAULT_METRICS (they run as strings in the page)', () => {
  for (const f of [layoutScan, metricsProbe]) {
    const m = String(f).match(/const DM = (\{[^\n]*\});/);
    assert.ok(m, `${f.name}: no DM literal`);
    const dm = Function(`return (${m[1]});`)();
    assert.deepEqual(dm, { body: { ...DEFAULT_METRICS.body }, concl: { ...DEFAULT_METRICS.concl }, tate: { ...DEFAULT_METRICS.tate } }, f.name);
  }
});
await t('validation: no metrics block keeps the parent values (undeclared)', () => {
  const r = applyMetrics(DEFAULT_METRICS, undefined, 'x');
  assert.ok(sameMetrics(r.metrics));
  assert.equal(r.declared, false);
  assert.deepEqual(r.warnings, []);
});
await t('validation: values are inherited field by field through extends', () => {
  const r = resolveMetrics([{ name: 'p', metrics: { v: 1, body: { left: 96 }, concl: { top: 540 } } }, { name: 'c', metrics: { v: 1, body: { right: 80 } } }, { name: 'g' }]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.declared, true);
  assert.deepEqual(r.metrics.body, { left: 96, right: 80, top: 122, floor: 680, line: 46 });
  assert.deepEqual(r.metrics.concl, { top: 540, height: 72 });
  assert.deepEqual(r.metrics.tate, { ...DEFAULT_METRICS.tate });
});
await t('validation: a bad value warns and falls back to the parent value; other fields still apply', () => {
  const base = applyMetrics(DEFAULT_METRICS, { v: 1, body: { left: 60 } }, 'p').metrics;
  const r = applyMetrics(base, { v: 1, body: { left: 'x', right: 2000, top: -1, line: 0 }, concl: { top: 530.5 } }, 'c');
  assert.equal(r.warnings.length, 4, r.warnings.join('\n'));
  for (const w of r.warnings) assert.match(w, /^theme-metrics: theme "c": metrics\.body\.(left|right|top|line) must be a number .*the parent value/);
  assert.equal(r.metrics.body.left, 60);
  assert.equal(r.metrics.body.right, 48);
  assert.equal(r.metrics.body.line, 46);
  assert.equal(r.metrics.concl.top, 530.5);
});
await t('validation: unknown fields are ignored with a warning', () => {
  const r = applyMetrics(DEFAULT_METRICS, { v: 1, bands: [], body: { gutter: 3, left: 50 } }, 'c');
  assert.deepEqual(r.warnings.map((w) => w.replace(/^theme-metrics: theme "c": /, '')), ['unknown field metrics.bands (ignored)', 'unknown field metrics.body.gutter (ignored)']);
  assert.equal(r.metrics.body.left, 50);
});
await t('validation: not an object, v other than 1, a group that is not an object', () => {
  for (const raw of [null, 5, [], { body: { left: 50 } }, { v: 2, body: { left: 50 } }, { v: '1' }]) {
    const r = applyMetrics(DEFAULT_METRICS, raw, 'c');
    assert.equal(r.warnings.length, 1, JSON.stringify(raw));
    assert.ok(sameMetrics(r.metrics), JSON.stringify(raw));
    assert.equal(r.declared, false);
  }
  const g = applyMetrics(DEFAULT_METRICS, { v: 1, body: 3 }, 'c');
  assert.match(g.warnings[0], /metrics\.body must be an object/);
});
await t('validation: values that do not fit together ignore the whole layer', () => {
  for (const raw of [{ v: 1, concl: { top: 120 } }, { v: 1, concl: { top: 700 } }, { v: 1, body: { floor: 100 } }, { v: 1, body: { left: 500, right: 500 } }, { v: 1, tate: { conclRight: 1200 } }, { v: 1, tate: { left: 1200 } }]) {
    const r = applyMetrics(DEFAULT_METRICS, { ...raw, body: { ...(raw.body || {}) } }, 'c');
    assert.equal(r.warnings.length, 1, JSON.stringify(raw));
    assert.match(r.warnings[0], /do not fit together/);
    assert.ok(sameMetrics(r.metrics), JSON.stringify(raw));
  }
});

// ---------------------------------------------------------------- 2. 組み立て
// 作業フォルダに themes/<名前>/ を置いたデッキ。themes：{名前: {json, css}}
const SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
function deckWith(name, theme, themes = {}, { body = null, style = '' } = {}) {
  const d = path.join(work, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const [tn, x] of Object.entries(themes)) {
    fs.mkdirSync(path.join(d, 'themes', tn), { recursive: true });
    if (x.json !== undefined) fs.writeFileSync(path.join(d, 'themes', tn, 'theme.json'), typeof x.json === 'string' ? x.json : JSON.stringify(x.json, null, 2));
    fs.writeFileSync(path.join(d, 'themes', tn, 'tokens.css'), x.css || '');
  }
  const html = body
    ? `<!DOCTYPE html>\n<html lang="ja" data-theme="${theme}">\n<head><meta charset="utf-8"><title>${name}</title>${style ? `<style>${style}</style>` : ''}</head>\n<body>\n<div id="stage">\n${body}\n</div>\n</body>\n</html>\n`
    : SRC.replace('<html lang="ja" data-theme="default">', `<html lang="ja" data-theme="${theme}">`).replace('</head>', `${style ? `<style>${style}</style>` : ''}</head>`);
  fs.writeFileSync(path.join(d, 'deck.html'), html);
  if (!body) fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(d, 'narration.md'));
  return path.join(d, 'deck.html');
}
const WIDE_T = { json: WIDE_JSON, css: WIDE_CSS };
await t('build: returns the theme name and its resolved metrics (default: undeclared defaults)', () => {
  const r = build(path.join(ROOT, 'examples/minimal/deck.html'), { subset: false });
  assert.equal(r.theme.name, 'default');
  assert.equal(r.theme.declared, false);
  assert.ok(sameMetrics(r.theme.metrics));
  for (const th of ['business', 'kokugo']) { const b = build(path.join(ROOT, 'examples/minimal/deck.html'), { subset: false, theme: th }); assert.equal(b.theme.declared, false, th); assert.ok(sameMetrics(b.theme.metrics), th); }
});
await t('build: metrics are inherited through extends, field by field', () => {
  const src = deckWith('inherit', 'child', { wide: WIDE_T, child: { json: { extends: 'wide', metrics: { v: 1, body: { top: 130 } } }, css: '.body{top:130px}' } });
  const r = build(src, { subset: false });
  assert.deepEqual(r.stats.warn.filter((w) => /^theme-metrics/.test(w)), []);
  assert.equal(r.theme.declared, true);
  assert.deepEqual(r.theme.metrics.body, { left: 96, right: 96, top: 130, floor: 680, line: 46 });
  assert.equal(r.theme.metrics.concl.top, 540);
  const src2 = deckWith('inherit2', 'child', { wide: WIDE_T, child: { json: { extends: 'wide' } } });
  assert.deepEqual(build(src2, { subset: false }).theme.metrics, build(deckWith('inherit3', 'wide', { wide: WIDE_T }), { subset: false }).theme.metrics);
});
await t('build: a bad value is a build warning (theme-metrics: …), never an error, and uses the parent value', () => {
  const src = deckWith('bad', 'badm', { badm: { json: { extends: 'default', metrics: { v: 1, body: { left: 'wide', right: 60 }, concl: { top: 9999 } } } } });
  const r = build(src, { subset: false });
  const ws = r.stats.warn.filter((w) => /^theme-metrics: /.test(w));
  assert.equal(ws.length, 2, ws.join('\n'));
  assert.equal(r.theme.metrics.body.left, 48);
  assert.equal(r.theme.metrics.body.right, 60);
  assert.equal(r.theme.metrics.concl.top, 571);
  const v2 = build(deckWith('badv', 'v2', { v2: { json: { metrics: { v: 2, body: { left: 60 } } } } }), { subset: false });
  assert.equal(v2.stats.warn.filter((w) => /^theme-metrics: .*metrics\.v must be 1/.test(w)).length, 1);
  assert.equal(v2.theme.declared, false);
  assert.ok(sameMetrics(v2.theme.metrics));
});
await t('identity: theme.json (and so metrics) is in the theme hash of index.themes and in the deck files', async () => {
  // 同梱のテーマ（registry）：sha256 は theme.json と tokens.css の行から
  const src = deckWith('hash-reg', 'business');
  const r = await buildPortable(src, { subset: false, fromFolder: false });
  const e = r.index.themes.find((x) => x.name === 'business');
  assert.ok(e, JSON.stringify(r.index.themes));
  const h = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const dir = path.join(ROOT, 'themes', 'business');
  const lines = ['theme.json', 'tokens.css'].map((f) => `${f}\t${h(identityBytes(f, fs.readFileSync(path.join(dir, f))))}\n`).join('');
  assert.equal(e.sha256, h(lines));
  // 作業フォルダのテーマ：metrics を変えると theme.json の記録が変わる
  const a = await buildPortable(deckWith('hash-a', 'wide', { wide: WIDE_T }), { subset: false, fromFolder: false });
  const b = await buildPortable(deckWith('hash-b', 'wide', { wide: { json: { ...WIDE_JSON, metrics: { ...WIDE_JSON.metrics, concl: { top: 541 } } }, css: WIDE_CSS } }), { subset: false, fromFolder: false });
  const fa = a.index.files['themes/wide/theme.json'], fb = b.index.files['themes/wide/theme.json'];
  assert.ok(fa && fb, 'theme.json is recorded in index.files');
  assert.notEqual(fa, fb);
});

// ---------------------------------------------------------------- 3. 同梱のテーマ（厳しく）
const b = await launch();
const bundled = fs.readdirSync(path.join(ROOT, 'themes'), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'themes', d.name, 'tokens.css'))).map((d) => path.join(ROOT, 'themes', d.name));
// 部品庫の写しにテーマがあれば（今はない）それも
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'tokens.css' ? [d] : []));
const library = fs.existsSync(path.join(ROOT, 'vendor', 'components')) ? walk(path.join(ROOT, 'vendor', 'components')) : [];
for (const dir of [...bundled, ...library]) {
  for (const lang of ['ja', 'en']) {
    await t(`bundled theme ${path.relative(ROOT, dir)} (${lang}): the rendered boxes match its declared geometry (or the default when undeclared)`, async () => {
      const m = await measureTheme(dir, { lang, browser: b, work: path.join(work, 'measure-' + path.basename(dir) + '-' + lang) });
      assert.deepEqual(m.warn, []);
      assert.deepEqual(m.items, [], `${m.declared ? 'does not render as declared' : 'moves layout boxes without declaring metrics'}: ${JSON.stringify(m.items)} — node tools/theme-metrics.mjs measure ${path.relative(ROOT, dir)}`);
    });
  }
}

await t('drift compares the rendered values, not measure\'s rounded block: the default rule is at 1166.25 (0.25px from 1166); a sub-pixel shift is within 1px, a larger one is drift', async () => {
  const m = await measureTheme('default', { browser: b, work: path.join(work, 'measure-raw-default') });
  assert.equal(m.measured.tate.rule, 1166.25);
  assert.equal(m.block.tate.rule, 1167, 'measure rounds outward for authors');
  assert.equal(DEFAULT_METRICS.tate.rule, 1166);
  assert.deepEqual(m.items, []);
  const shifted = async (name, pad) => {
    const dir = path.join(work, 'theme-' + name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ extends: 'default' }));
    fs.writeFileSync(path.join(dir, 'tokens.css'), `.slide.layout-tate h2{padding-left:${pad}px}`);
    return measureTheme(dir, { browser: b, work: path.join(work, 'measure-' + name) });
  };
  // 罫を 0.5px 左へ（1165.75。宣言 1166 から 0.25px）：丸めた値（1166 か 1167）で比べればずれうるが、描いた値で比べるので通る
  const a = await shifted('tate-sub', 10.5);
  assert.equal(a.measured.tate.rule, 1165.75);
  assert.deepEqual(a.items, []);
  // 罫を 1.5px 左へ（1164.75。1.25px）：ずれ
  const c = await shifted('tate-over', 11.5);
  assert.equal(c.measured.tate.rule, 1164.75);
  assert.deepEqual(c.items.map((x) => [x.field, x.declared, x.measured, x.by]), [['tate.rule', 1166, 1164.75, 'theme']]);
});

// ---------------------------------------------------------------- 4. 品質チェック
// 本文の高さと幅を決めた箱（px）で作るスライド
const slide = (id, inner, cls = '') => `<section class="slide${cls ? ' ' + cls : ''}" id="${id}"><h2>${id}</h2><div class="body">${inner}</div><div class="concl">結論</div></section>`;
const BODY = [
  slide('s-ok', '<div style="height:400px"></div>'),                       // 下端 522：どちらでも通る
  slide('s-low', '<div style="height:414px"></div>'),                      // 下端 536：既定（565）では通り、wide（534）ではエラー
  slide('s-wide', '<div style="height:100px;width:1096px"></div>'),       // 右端：既定 48+1096=1144、wide 96+1096=1192 > 1188
].join('\n');
const check = (src, ...a) => { const r = node('kit/check.mjs', src, '--json', ...a); return parseCheck(r.stdout, r.status); };
const codes = (J, id) => J.results.filter((x) => x.id === id && x.sev === 'error').map((x) => x.code).sort();
const deckWide = deckWith('wide', 'wide', { wide: WIDE_T }, { body: BODY });
const deckDef = deckWith('def', 'default', {}, { body: BODY });
let JW = null, JD = null;
await t('check: a theme that declares metrics moves the limits (bottom 534 above a conclusion line at 540, right 1188)', () => {
  JW = check(deckWide);
  assert.deepEqual(codes(JW, 's-ok'), []);
  assert.deepEqual(codes(JW, 's-low'), ['bodyBottom']);
  const r = JW.results.find((x) => x.id === 's-low' && x.code === 'bodyBottom');
  assert.deepEqual(r.data, { px: 536, lim: 534, concl: true, conclTop: 540 });
  assert.match(r.msg, /結論の行の上端は 540px/);
  assert.deepEqual(codes(JW, 's-wide'), ['bodyRight']);
  const w = JW.results.find((x) => x.id === 's-wide' && x.code === 'bodyRight');
  assert.deepEqual(w.data, { px: 1192, lim: 1188 });
  assert.match(w.msg, /1192px > 1188px/);
  assert.deepEqual(JW.results.filter((x) => /^themeMetrics/.test(x.code)), [], 'the CSS matches the declaration: no drift');
});
await t('check: the same deck with the default theme keeps the default limits (565, 1236), no drift, no extra data fields', () => {
  JD = check(deckDef);
  assert.deepEqual(codes(JD, 's-low'), []);
  assert.deepEqual(codes(JD, 's-wide'), []);
  assert.deepEqual(JD.results.filter((x) => /^themeMetrics/.test(x.code)), []);
  const tall = check(deckWith('def-tall', 'default', {}, { body: slide('s-tall', '<div style="height:450px"></div>') }));
  assert.deepEqual(tall.results.find((x) => x.code === 'bodyBottom').data, { px: 572, lim: 565, concl: true });
});
const drift = (J) => J.results.filter((x) => x.code === 'themeMetricsDrift');
await t('check: a theme that moves the boxes without metrics gets one themeMetricsDrift warning (by the theme), and the default limits', () => {
  const J = check(deckWith('undecl', 'nom', { nom: { json: { extends: 'default' }, css: WIDE_CSS } }, { body: BODY }));
  const d = drift(J);
  assert.equal(d.length, 1);
  assert.equal(d[0].sev, 'warn');
  assert.equal(d[0].slide, null);
  assert.equal(d[0].data.declared, false);
  assert.deepEqual(d[0].data.items.map((x) => [x.field, x.declared, x.measured, x.by]), [['body.left', 48, 96, 'theme'], ['body.right', 48, 96, 'theme'], ['concl.top', 571, 540, 'theme']]);
  assert.match(d[0].msg, /寸法の宣言（theme\.json の metrics）がない.*node tools\/theme-metrics\.mjs measure nom/);
  assert.deepEqual(codes(J, 's-low'), []);
});
await t('check: metrics without the matching CSS, and a --bar-h taller than the space under body.floor, are drift', () => {
  const J = check(deckWith('declonly', 'only', { only: { json: WIDE_JSON } }, { body: BODY }));
  const d = drift(J);
  assert.equal(d.length, 1);
  assert.equal(d[0].data.declared, true);
  assert.deepEqual(d[0].data.items.map((x) => x.field), ['body.left', 'body.right', 'concl.top']);
  const B = check(deckWith('bar', 'bar', { bar: { json: { extends: 'default' }, css: ':root{--bar-h:60px}' } }, { body: BODY }));
  assert.deepEqual(drift(B)[0].data.items, [{ field: '--bar-h', declared: 40, measured: 60, by: 'theme' }]);
  const fl = check(deckWith('floor', 'fl', { fl: { json: { extends: 'default', metrics: { v: 1, body: { floor: 700 } } } } }, { body: BODY }));
  assert.deepEqual(drift(fl)[0].data.items.map((x) => x.field), ['body.floor']);
});
await t('check: a deck <style> that moves the body is drift by the deck (the limits stay the theme\'s)', () => {
  const J = check(deckWith('deckcss', 'default', {}, { body: BODY, style: '.body{left:20px}' }));
  const d = drift(J);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].data.items, [{ field: 'body.left', declared: 48, measured: 20, by: 'deck' }]);
  assert.match(d[0].msg, /デッキの <style> で体裁の箱/);
  const E = check(deckWith('deckcss', 'default', {}, { body: BODY, style: '.body{left:20px}' }), '--lang', 'en');
  assert.match(drift(E)[0].msg, /deck's <style>/);
});
await t('check: unusable metrics are one themeMetricsInvalid warning for the deck (not one build warning each)', () => {
  const J = check(deckWith('invalid', 'inv', { inv: { json: { extends: 'default', metrics: { v: 1, body: { left: 'x', top: 9999 }, nope: 1 } } } }, { body: BODY }));
  const x = J.results.filter((r) => r.code === 'themeMetricsInvalid');
  assert.equal(x.length, 1);
  assert.equal(x[0].sev, 'warn');
  assert.equal(x[0].data.list.length, 3);
  assert.deepEqual(J.results.filter((r) => r.code === 'build' && /theme-metrics/.test(r.data.w)), []);
  assert.ok(message('en', 'themeMetricsInvalid', x[0].data).includes('fix metrics in theme.json'));
});

// ---------------------------------------------------------------- 5. ブラウザ版と修正依頼
const SHIM = withLayoutScan(fs.readFileSync(path.join(ROOT, 'app', 'frame-shim.js'), 'utf8'));
await t('the shim with metricsProbe can be inlined (no </script, no <!--)', () => assert.ok(!/<\/script|<!--/i.test(SHIM)));
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
async function quick(src, name) {
  const r = build(src, { subset: false });
  const f = path.join(work, name + '.html');
  fs.writeFileSync(f, previewDocument(r.html, `${SHIM}(${JSON.stringify({ dev: true, load: 1, theme: r.theme })});`));
  await page.goto(fileUrl(f));
  return page.evaluate(() => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('no app-check-result')), 30000);
    addEventListener('message', (e) => { if (e.data && e.data.type === 'app-check-result') { clearTimeout(timer); res({ results: e.data.results, ids: DECK.slides.map((s) => s.id) }); } });
    postMessage({ type: 'app-check', id: 'q1' }, '*');
  }));
}
await t('quick check: the same limits from the theme metrics (overflowBottom "536 > 534", overflowRight "1192 > 1188")', async () => {
  const Q = await quick(deckWide, 'q-wide');
  const of = (id, c) => Q.results.find((x) => Q.ids[x.i] === id && x.code === c);
  assert.equal(of('s-low', 'overflowBottom').arg, '536 > 534');
  assert.equal(of('s-wide', 'overflowRight').arg, '1192 > 1188');
  assert.equal(Q.results.filter((x) => x.code === 'themeMetricsDrift').length, 0);
  const D = await quick(deckDef, 'q-def');
  assert.equal(D.results.filter((x) => /^overflow|themeMetrics/.test(x.code)).length, 0);
});
await t('quick check: themeMetricsDrift like the command', async () => {
  const Q = await quick(deckWith('q-undecl', 'nom', { nom: { json: { extends: 'default' }, css: WIDE_CSS } }, { body: BODY }), 'q-undecl');
  const d = Q.results.filter((x) => x.code === 'themeMetricsDrift');
  assert.equal(d.length, 1);
  assert.equal(d[0].i, null);
  assert.equal(d[0].sev, 'warn');
  assert.deepEqual(d[0].arg.items.map((x) => x.field), ['body.left', 'body.right', 'concl.top']);
  assert.ok(message('ja', 'themeMetricsDrift', d[0].arg).length > 20);
});
await t('fix request amounts use the limit and line height from the data', () => {
  assert.match(amountOf({ code: 'bodyBottom', data: { px: 600, lim: 534, concl: true, conclTop: 540, line: 40 } }, 'en'), /cut 66 px .*about 2 lines of 40 px/);
  assert.match(amountOf({ code: 'bodyBottom', data: { px: 600, lim: 565, concl: true } }, 'en'), /cut 35 px .*about 1 line of 46 px/);
  assert.match(amountOf({ code: 'overflowBottom', data: '536 > 534' }, 'en'), /cut 2 px/);
  assert.match(amountOf({ code: 'overflowRight', data: '1192 > 1188' }, 'en'), /4 px too wide/);
  assert.match(amountOf({ code: 'overflowRight', data: 1240 }, 'en'), /4 px too wide/);
  assert.match(amountOf({ code: 'bodyRight', data: { px: 1192, lim: 1188 } }, 'en'), /4 px too wide/);
});

// ---------------------------------------------------------------- 6. 測る道具
await t('tools/theme-metrics.mjs measure prints the declared block for the fixture theme', () => {
  const r = node('tools/theme-metrics.mjs', 'measure', 'tools/fixtures/theme-metrics-wide');
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout).metrics;
  assert.deepEqual(m.body, { left: 96, right: 96, top: 122, floor: 680, line: 46 });
  assert.deepEqual(m.concl, { top: 540, height: 72 });
  assert.equal(m.v, 1);
  const r2 = applyMetrics(DEFAULT_METRICS, m, 'measured');
  assert.deepEqual(r2.warnings, [], 'the measured block validates');
  const c = node('tools/theme-metrics.mjs', 'check', 'tools/fixtures/theme-metrics-wide');
  assert.equal(c.status, 0, c.stdout + c.stderr);
  const u = node('tools/theme-metrics.mjs', 'check', 'tools/fixtures/theme-override');
  assert.equal(u.status, 1, 'the #75 fixture moves .body without metrics');
  assert.match(u.stdout, /body\.left: declared 48, rendered 96/);
});

await t('measure: whole px, each edge rounded outward to the more lenient limit by less than 1px', () => {
  const m = { body: { left: 47.6, right: 48.4, top: 121.5, line: 46.4, noconclBottom: 656, pnTop: 682 }, concl: { top: 570.2, height: 72.3 }, tate: { rule: 1166.25, conclRight: 120.7, left: 48.9, bottom: 664 } };
  const k = blockFrom(m);
  assert.deepEqual(k, { v: 1, body: { left: 47, right: 48, top: 121, floor: 680, line: 46 }, concl: { top: 571, height: 71 }, tate: { rule: 1167, conclRight: 120, left: 48, floor: 680 } });
  for (const g of ['body', 'concl', 'tate']) for (const [f, v] of Object.entries(k[g])) assert.ok(Number.isInteger(v), `${g}.${f}`);
  // 限りは緩くなる側：右の限り（1280 − right + 4）は大きく、下の限り（concl.top − 6）は下へ、縦の右（rule − 4）は右へ、縦の左（conclRight + 4・left − 4）は左へ
  assert.ok(limitsOf(k).right >= 1280 - m.body.right + 4 && limitsOf(k).conclBottom >= m.concl.top - 6 && limitsOf(k).tateRight >= m.tate.rule - 4);
  assert.ok(limitsOf(k).tateLeftConcl <= m.tate.conclRight + 4 && limitsOf(k).tateLeft <= m.tate.left - 4);
  // 1px 未満（ずれの許し 1px より小さい）
  for (const [a, x] of [[k.body.left, m.body.left], [k.body.right, m.body.right], [k.body.top, m.body.top], [k.concl.top, m.concl.top], [k.concl.top + k.concl.height, m.concl.top + m.concl.height], [k.tate.rule, m.tate.rule], [k.tate.conclRight, m.tate.conclRight], [k.tate.left, m.tate.left]]) assert.ok(Math.abs(a - x) < 1, `${a} vs ${x}`);
  assert.deepEqual(blockFrom({ body: { left: 48, right: 48, top: 122, line: 46.4, noconclBottom: 656, pnTop: 682 }, concl: { top: 571, height: 72 }, tate: { rule: 1166, conclRight: 120, left: 48, bottom: 664 } }), { ...DEFAULT_METRICS, body: { ...DEFAULT_METRICS.body }, concl: { ...DEFAULT_METRICS.concl }, tate: { ...DEFAULT_METRICS.tate } });
});
await t('measure: a theme that declares exactly the measured block (rounded) checks clean', async () => {
  const blk = (await measureTheme('default', { browser: b, work: path.join(work, 'measure-round') })).block;
  assert.equal(blk.tate.rule, 1167, 'the vertical heading rule is at 1166.25, rounded to the lenient side');
  const dir = path.join(work, 'theme-rounded');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ extends: 'default', metrics: blk }));
  fs.writeFileSync(path.join(dir, 'tokens.css'), '');
  const m = await measureTheme(dir, { browser: b, work: path.join(work, 'measure-rounded') });
  assert.equal(m.declared, true);
  assert.deepEqual(m.items, []);
});
await t('the #75 fixture theme-override stays undeclared: exactly one themeMetricsDrift warning and no error', () => {
  const src = deckWith('override', 'theme-override', { 'theme-override': { json: fs.readFileSync(path.join(ROOT, 'tools/fixtures/theme-override/theme.json'), 'utf8'), css: fs.readFileSync(path.join(ROOT, 'tools/fixtures/theme-override/tokens.css'), 'utf8') } });
  assert.ok(!('metrics' in JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/theme-override/theme.json'), 'utf8'))));
  const J = check(src);
  assert.equal(J.counts.error, 0, JSON.stringify(J.results.filter((x) => x.sev === 'error')));
  const d = drift(J);
  assert.equal(d.length, 1);
  assert.equal(d[0].sev, 'warn');
  assert.equal(d[0].data.declared, false);
  assert.deepEqual(d[0].data.items.map((x) => x.field), ['body.left', 'body.right']);
  assert.deepEqual(J.results.filter((x) => x.code === 'metricsFontLoad'), []);
});

// ---------------------------------------------------------------- 7. 字体
const NOFONT = { json: { extends: 'default' }, css: WIDE_CSS + ':root{--font-sans:"NoSuchFamily-Egatari"}' };
const BROKEN = { json: { extends: 'default' }, css: WIDE_CSS + '@font-face{font-family:"BrokenFace";src:url(data:font/woff2;base64,AAAAAAAA) format("woff2")}\n:root{--font-sans:"BrokenFace"}' };
await t('fonts: the bundled fonts load on the default themes (no metricsFontLoad)', () => {
  for (const J of [JW, JD]) assert.deepEqual(J.results.filter((x) => x.code === 'metricsFontLoad'), []);
});
await t('fonts: a font that is not bundled, or a bundled face that fails to load, is one metricsFontLoad warning and nothing is measured', () => {
  for (const [name, th, fam] of [['nofont', NOFONT, 'NoSuchFamily-Egatari'], ['broken', BROKEN, 'BrokenFace']]) {
    const J = check(deckWith('font-' + name, name, { [name]: th }, { body: BODY }));
    const f = J.results.filter((x) => x.code === 'metricsFontLoad');
    assert.equal(f.length, 1, name);
    assert.equal(f[0].sev, 'warn');
    assert.equal(f[0].slide, null);
    assert.deepEqual(f[0].data.fonts, [fam]);
    assert.deepEqual(drift(J), [], `${name}: the boxes moved, but nothing was measured`);
    assert.match(f[0].msg, /代わりの字体では測らない/);
    assert.match(message('en', 'metricsFontLoad', f[0].data), /a fallback font is never measured/);
  }
});
await t('fonts: the quick check skips the measurement the same way', async () => {
  const Q = await quick(deckWith('q-broken', 'broken', { broken: BROKEN }, { body: BODY }), 'q-broken');
  const f = Q.results.filter((x) => x.code === 'metricsFontLoad');
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].arg.fonts, ['BrokenFace']);
  assert.equal(Q.results.filter((x) => x.code === 'themeMetricsDrift').length, 0);
});
await t('fonts: measure refuses to measure with a fallback font', () => {
  const dir = path.join(work, 'theme-nofont');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(NOFONT.json));
  fs.writeFileSync(path.join(dir, 'tokens.css'), NOFONT.css);
  const r = node('tools/theme-metrics.mjs', 'measure', dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fonts did not load/);
});

await b.close();
console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
