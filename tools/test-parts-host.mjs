// 部品庫 2.0 の受け口（format spec §6.1・§6.2・§8.4。backlog #123）：同梱の再生器が 2.0 のパーツを動かすか
//   node tools/test-parts-host.mjs [出力先]
// 教材 tools/fixtures/parts2/（egatari.json の componentsCatalogue で 2.0。m-bars・m-flow・m-kakijun は content 表で引く写し、
// m-probe・m-boom・m-orphan は作業フォルダの埋め込みのパーツ）を組んで開き、確かめること：
//   組み立て：登録簿がパーツより前・パーツが依存の順・m-flow の tex を KaTeX で描いて texHtml と renderers を足す・m-kakijun の塊を教材の字に絞る
//   登録簿：status() は {defined, failed: [{name, version, reason}]}。factory が投げたパーツ（factory）と、それに頼るパーツ（dependency）は失敗として記録され、
//   その要素（failed[].element）は字の代わり（data-part-failure="define"）と品質チェックへの知らせ。要素の名前がぶつかる教材は組まずに断る
//   組み立て：meta が字のままの object でない埋め込みのパーツは書かずに知らせる。絞り込みの字は原稿の全部（属性の値も）・口述原稿・パーツに渡すデータ・glyphs
//   ctx：mount に mode・preview・slide・lang・slides・go・report・visited（deck はない）。slides は凍った [{key, title, steps, concl}]
//   守り（2 段）：mount・render で投げたパーツは base が止めて ctx.report("error") し、デッキは動き続ける
//   report：size は DECK.componentReports にだけ、error・data は DECK.componentErrors にも
//   layout：起動・窓の大きさが変わった・隠れていたスライドが見えた・隠れていた文書が見えた（visibilitychange）ときに呼ばれ、そのあと描き直す（entered なし）
//   entered：別のスライドから入った最初の描画だけ true。印刷（beforeprint/afterprint）・DECK.aside の描画とその戻り・動画のコマでは false
//   ctx.go：スライドへのリンクと同じに動く。知らないスライドは false
//   DECK なし：登録簿と shape・base・bars だけのページ（deck.js なし）で m-bars が mount・render できる（Appendix A 1A）
//   1.x：componentsCatalogue のない教材（examples/minimal）には登録簿が入らず、部品は DECK.MotionElement のまま
import fs from 'node:fs';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const partFile = (n, v) => path.join(resolveComponent(path, ROOT, contentLock, n, v), 'index.js');
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-host-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const eq2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const build = (src, dst, extra = []) => execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), src, '-o', dst, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// ---------------------------------------------------------------- 組み立て
const deck = path.join(out, 'parts2.html');
// 知らせ（⚠）は stderr に出る：両方を読む
const run1 = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(ROOT, 'tools/fixtures/parts2/deck.html'), '-o', deck], { encoding: 'utf8' });
const log = run1.stdout + run1.stderr;
ok(run1.status === 0, `the 2.0 lesson builds (${run1.status})`);
const html = fs.readFileSync(deck, 'utf8');
const order = [...html.matchAll(/\/\/ ---- ([a-z][a-z0-9-]*@[0-9][^ ]*) \(/g)].map((m) => m[1]);
ok(html.indexOf('egatariParts registry') >= 0 && html.indexOf('egatariParts registry') < html.indexOf('// ---- shape@1.0.0'), 'the registry is written before every part');
const at = (n) => order.findIndex((x) => x.startsWith(n + '@'));
ok(at('shape') >= 0 && at('shape') < at('base') && at('base') < at('bars') && at('base') < at('markup-reader') && at('markup-reader') < at('flow') && at('boom') < at('orphan') && at('probe') > at('base'),
  `parts in dependency order: ${order.join(' ')}`);
ok(order.length === new Set(order).size, 'each name@version is written once');
const flowJson = /<m-flow[^>]*><script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
const flowData = flowJson ? JSON.parse(flowJson[1]) : null;
ok(flowData && /class="katex"/.test(flowData.nodes[0].texHtml || '') && !/katex-mathml/.test(flowData.nodes[0].texHtml), 'm-flow: nodes[].tex rendered at build time as texHtml (KaTeX, output html as the part declares)');
ok(flowData && flowData.renderers && flowData.renderers.katex && /^\d+\.\d+\.\d+$/.test(flowData.renderers.katex.version) && flowData.renderers.katex.options.output === 'html', `m-flow: renderers record ${JSON.stringify(flowData && flowData.renderers)}`);
const meta = /\/\*@egatari-block stroke-meta\*\/(.*?)\/\*@egatari-block-end\*\//s.exec(html);
const kept = meta ? Object.keys(JSON.parse(meta[1])).filter((k) => !k.startsWith('_')) : [];
ok(kept.includes('あ') && kept.includes('さ') && !kept.includes('ぬ') && kept.length < 60, `m-kakijun: stroke data subset to the lesson's characters (${kept.length} kept)`);
ok(kept.includes('ひ') && kept.includes('ほ') && kept.includes('ね'), "subset text: an attribute value (text=\"…&#x3072;\"), the data passed to parts (\\u307b) and the part's glyphs (ね) count");
const strokes = /\/\*@egatari-block strokes\*\/(.*?)\/\*@egatari-block-end\*\//s.exec(html);
const keptS = strokes ? (() => { const v = JSON.parse(strokes[1]); return Array.isArray(v) ? v.map((x) => x.char) : Object.keys(v).filter((k) => !k.startsWith('_')); })() : [];
ok(keptS.length > 0 && keptS.every((k) => kept.includes(k)) && kept.every((k) => keptS.includes(k)), `both declared blocks are subset on their own to the same text (${keptS.length} / ${kept.length})`);
ok(/refused: components\/nonlit\/index\.js: the meta of egatariParts\.define is not a literal JSON object/.test(log) && !/\/\/ ---- nonlit@/.test(html), 'an embedded part whose meta is not a literal object is reported and not written');
ok(!/component not found|is not in components2/.test(log), 'no part is missing from the build');
// 要素の名前がぶつかる教材は組まずに断る（§6.1 Order：名前の違う 2 つのパーツが <m-pie> を定義する。作り手がパーツを直す、§7.2 段 C）
{
  const cdir = path.join(out, 'conflict-src');
  fs.rmSync(cdir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), cdir, { recursive: true });
  for (const [n, code] of [['pie', 'egatariParts.define({name: "mypie", version: "0.1.0", requires: {base: "1.0.0"}, element: "m-pie"}, function(d){ return class extends d.base.Part {}; });'],
    ['zz', 'egatariParts.define({name: "zz", version: "0.1.0", requires: {pie: "2.0.0"}, element: "m-zz"}, function(d){ return class extends HTMLElement {}; });']]) {
    fs.mkdirSync(path.join(cdir, 'components', n), { recursive: true });
    fs.writeFileSync(path.join(cdir, 'components', n, 'index.js'), code + '\n');
  }
  fs.writeFileSync(path.join(cdir, 'deck.html'), fs.readFileSync(path.join(cdir, 'deck.html'), 'utf8').replace(/<\/div>\r?\n<\/body>/, '<section class="slide" id="p-five"><h2>ぶつかり</h2><div class="body"><m-pie aria-label="円"></m-pie><m-zz aria-label="z"></m-zz></div></section>\n</div>\n</body>'));
  const rc = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(cdir, 'deck.html'), '-o', path.join(out, 'conflict.html')], { encoding: 'utf8' });
  ok(rc.status !== 0 && /<m-pie> is defined by .*one file defines an element name once/.test(rc.stdout + rc.stderr) && !fs.existsSync(path.join(out, 'conflict.html')),
    `two parts defining one element name: the build refuses and reports the conflict (${rc.status}; ${(rc.stdout + rc.stderr).split('\n').find((l) => /m-pie/.test(l)) || ''})`);
}
// 2.0 の教材も持ち運べる 1 ファイルにする（索引の照合・往復は test-parts-portable）。
{
  const tmpDeck = path.join(out, 'portable-src');
  fs.rmSync(tmpDeck, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), tmpDeck, { recursive: true });
  const portable = build(path.join(tmpDeck, 'deck.html'), path.join(out, 'parts.ega.html'), ['--portable']);
  ok(/egatari-index/.test(fs.readFileSync(path.join(out, 'parts.ega.html'), 'utf8')), 'a 2.0 lesson exports as a single file');
}

// Node の部分だけでも、組み立て・索引の受け口を確かめられる。
if (process.env.EGATARI_TEST_NO_BROWSER === '1') {
  console.log('SKIP browser host checks');
  process.exit(fail ? 1 : 0);
}

// 配置を測ってから出る知らせ：CLI がほかの画面を検査して開き直しても失わない。
{
  const dir = path.join(out, 'layout-report-src');
  fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), dir, { recursive: true });
  const probe = path.join(dir, 'components/probe/index.js');
  fs.writeFileSync(probe, fs.readFileSync(probe, 'utf8').replace('layout(ctx){', 'layout(ctx){ if (this.id === "probe-a" && this.closest(".slide").classList.contains("active")) ctx.report("layout", "[probe] labels need more room");'));
  for (const lang of ['ja', 'en']) {
    const checked = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), path.join(dir, 'deck.html'), '--json', '--lang', lang], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const result = JSON.parse(checked.stdout), finding = result.results.find((r) => r.code === 'compLayout' && r.data.msg.includes('labels need more room'));
    ok(finding && finding.sev === 'warn' && finding.id === 'p-one' && /m-probe/.test(finding.msg), `CLI: layout report survives other slides and reloads (${lang})`);
  }
}

// ---------------------------------------------------------------- 再生
const b = await launch();
const open = async (url, vp = { width: 1280, height: 720 }) => {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  return { p, errs };
};
const { p, errs } = await open(fileUrl(deck));
const st = await p.evaluate(() => egatariParts.status());
ok(eq2(Object.keys(st), ['defined', 'failed']) && st.failed.some((f) => f.name === 'boom' && f.element === 'm-boom' && f.reason === 'factory') && st.failed.some((f) => f.name === 'orphan' && f.element === 'm-orphan' && f.reason === 'dependency'),
  `registry status(): the failed factory (factory) and its dependant (dependency): ${st.failed.map((f) => f.name + ': ' + f.reason).join(' | ')}`);
ok(['bars@2.0.0', 'flow@2.0.0', 'kakijun@2.0.0', 'probe@0.1.0'].every((t) => st.defined.includes(t)), 'registry defined the element parts');
const fb = await p.evaluate(() => ['m-boom', 'm-orphan'].map((t) => { const e = document.querySelector(t); const x = e && e.querySelector('[data-part-failure="define"]'); return x ? x.textContent : null; }));
ok(fb[0] === '作れないパーツ' && fb[1] === '頼る先が作れないパーツ', `failed parts show their text equivalent (${JSON.stringify(fb)})`);
const m0 = await p.evaluate(() => window.__probe.mounts.find((m) => m.id === 'probe-a'));
ok(m0 && ['go', 'lang', 'mode', 'preview', 'report', 'slide', 'slides', 'visited'].every((k) => m0.keys.includes(k)) && !m0.hasDeck, `ctx at mount: ${m0 && m0.keys.join(',')} (no deck)`);
ok(m0 && m0.lang === 'ja' && m0.slide === 'p-one' && m0.frozen && JSON.stringify(m0.slides[0]) === JSON.stringify(['p-one', '棒と試験のパーツ', 3, true]) && JSON.stringify(m0.slides[3]) === JSON.stringify(['p-four', '絞り込み', 3, false]),
  `ctx.slides: ${JSON.stringify(m0 && m0.slides)}`);
ok(await p.evaluate(() => !!document.querySelector('m-bars svg rect, m-bars svg path')), 'm-bars 2.0 drew its SVG');
const lay0 = await p.evaluate(() => window.__probe.layouts.filter((x) => x.id === 'probe-a').length);
ok(lay0 >= 1, `layout called for the visible slide at start (${lay0})`);

// 守りと知らせ
await p.evaluate(() => DECK.go(1, 1, false));
await p.waitForTimeout(300);
const s2 = await p.evaluate(() => ({
  state: DECK.state(), step1: document.querySelector('#p-two [data-step="1"]').classList.contains('on'),
  fr: document.querySelector('#probe-render [data-part-failure="error"]') && document.querySelector('#probe-render [data-part-failure="error"]').textContent,
  fm: !!document.querySelector('#probe-mount [data-part-failure="error"]'),
  errors: DECK.componentErrors.map((r) => [r.tag, r.code || r.kind, r.msg]), reports: DECK.componentReports.map((r) => [r.tag, r.code, r.msg]),
}));
ok(s2.state.slide === 2 && s2.state.step === 1 && s2.step1, 'the deck keeps going after parts throw (slide 2, step 1 shown)');
ok(s2.fr === '描けない試験のパーツ' && s2.fm, 'mount and render exceptions are contained by base (fallback with the text equivalent)');
ok(s2.errors.some((e) => e[0] === 'm-probe' && e[1] === 'error' && /^\[probe\] render: probe render failed/.test(e[2])) && s2.errors.some((e) => e[1] === 'error' && /^\[probe\] mount/.test(e[2])), 'contained exceptions reach DECK.componentErrors as ctx.report("error")');
ok(s2.reports.some((r) => r[0] === 'm-probe' && r[1] === 'size') && !s2.errors.some((e) => e[1] === 'size'), 'ctx.report("size") is in DECK.componentReports, not in the errors');
ok(s2.errors.filter((e) => /^\[probe\] render/.test(e[2])).length === 1, 'the same report is kept once');
ok(errs.length === 0, `no uncaught page errors (${errs.join(' | ')})`);

// entered と layout（隠れていたスライドが見えた）
const mark = () => p.evaluate(() => { window.__probe.renders.length = 0; window.__probe.layouts.length = 0; });
const renders = () => p.evaluate(() => window.__probe.renders.filter((r) => r.id === 'probe-a'));
await mark();
await p.evaluate(() => DECK.go(0, 0, false));
let r = await renders();
ok(r.length >= 1 && r[0].entered === true, `entering slide 1 from slide 2: entered true (${JSON.stringify(r.map((x) => x.entered))})`);
ok((await p.evaluate(() => window.__probe.layouts.filter((x) => x.id === 'probe-a').length)) >= 1, 'layout called when the hidden slide becomes visible');
await mark();
await p.evaluate(() => DECK.next());
await p.waitForTimeout(200);
r = await renders();
ok(r.length >= 1 && r.every((x) => x.entered === false), 'stepping within the slide: entered false');
// 印刷：beforeprint で全部のスライドを描き、afterprint で戻る。どれも entered false
await mark();
await p.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint')); });
r = await renders();
ok(r.length >= 2 && r.every((x) => x.entered === false), `print renders and the return: entered false (${r.length} renders)`);
ok((await p.evaluate(() => DECK.state())).slide === 1, 'after print the viewer is back on slide 1');
// 縮図（DECK.aside）：別のスライドを描いて戻る
await mark();
await p.evaluate(() => DECK.aside(() => { DECK.seek(2, 0, Infinity); DECK.seek(1, 0, Infinity); DECK.seek(0, 1, Infinity); }));
r = await renders();
ok(r.length >= 2 && r.every((x) => x.entered === false), 'DECK.aside renders and the return: entered false');
await mark();
await p.evaluate(() => DECK.go(1, 0, false));
await p.evaluate(() => DECK.go(0, 0, false));
r = await renders();
ok(r.length >= 1 && r[0].entered === true, 'a real jump after them still enters (entered true)');
// 文書が隠れて、また見えた（visibilitychange。§8.4 Layout）
await mark();
await p.evaluate(() => {
  const set = (v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
  set('hidden');
  window.__hiddenLayouts = window.__probe.layouts.length;
  set('visible');
});
const vis = await p.evaluate(() => ({ hidden: window.__hiddenLayouts, after: window.__probe.layouts.filter((x) => x.id === 'probe-a').length }));
r = await renders();
ok(vis.hidden === 0 && vis.after >= 1 && r.length >= 1 && r.every((x) => x.entered === false), `visibilitychange to visible: layout (${vis.after}) then a render without entering; nothing while hidden`);
// 大きさが変わった
await mark();
await p.setViewportSize({ width: 900, height: 600 });
await p.waitForTimeout(300);
const lays = await p.evaluate(() => window.__probe.layouts.filter((x) => x.id === 'probe-a').length);
r = await renders();
ok(lays >= 1 && r.length >= 1 && r.every((x) => x.entered === false), `resize: layout (${lays}) then a render without entering`);
// ctx.go と ctx.visited
const go = await p.evaluate(() => {
  const c = document.getElementById('probe-a')._ctx;
  const bad = c.go('no-such-slide');
  const before = c.visited('p-three');
  const good = c.go('p-three');
  return { bad, before, good, state: DECK.state(), after: c.visited('p-three') };
});
ok(go.bad === false && go.good === true && go.state.slide === 3 && go.before === false && go.after === true, `ctx.go moves like a link; ctx.visited (${JSON.stringify(go)})`);
ok((await p.evaluate(() => DECK.links().depth)) === 1, 'ctx.go is a link: the back trail has one entry');
// m-flow は描いた式を出し、描いていないという知らせはない
await p.evaluate(() => DECK.go(2, DECK.slides[2]._max, false));
await p.waitForTimeout(300);
const fl = await p.evaluate(() => ({ katex: document.querySelectorAll('m-flow .katex').length, notRendered: DECK.componentReports.some((r) => /not rendered/.test(r.msg)) }));
ok(fl.katex === 2 && !fl.notRendered, `m-flow shows the build-time rendered formulas (${fl.katex} .katex)`);
await p.evaluate(() => DECK.go(3, DECK.slides[3]._max, false));
await p.waitForTimeout(400);
ok(await p.evaluate(() => document.querySelectorAll('m-kakijun svg path').length > 0 && !DECK.componentErrors.some((r) => r.tag === 'm-kakijun')), 'm-kakijun draws from the subset data');
await p.screenshot({ path: path.join(out, 'kakijun.png') });
await p.close();

// 動画のコマ：entered はいつも false
{
  const v = await open(fileUrl(deck) + '?mode=video');
  await v.p.evaluate(() => { window.__probe.renders.length = 0; DECK.seek(1, 0, Infinity); DECK.seek(0, 0, 0); DECK.seek(0, 1, 0.2); });
  const vr = await v.p.evaluate(() => window.__probe.renders.filter((r) => r.id === 'probe-a'));
  ok(vr.length >= 2 && vr.every((x) => x.entered === false), 'video frames: entered false');
  await v.p.close();
}

// DECK なし（Appendix A 1A：再生器は ctx のほかは何も渡さない）
{
  const pg = await b.newPage();
  const errs2 = [];
  pg.on('pageerror', (e) => errs2.push(e.message));
  const v2 = (n, v) => fs.readFileSync(partFile(n, v), 'utf8');
  const scripts = [fs.readFileSync(path.join(ROOT, 'kit/parts-registry.js'), 'utf8'), v2('shape', '1.0.0'), v2('base', '1.0.0'), v2('bars', '2.0.0')];
  await pg.setContent(`<!doctype html><html lang="en"><body><m-bars id="b" style="display:block;width:800px;height:400px"><script type="application/json">{"groups":[{"label":"A","value":1},{"label":"B","value":2}]}</script></m-bars></body></html>`);
  for (const s of scripts) await pg.addScriptTag({ content: s });
  const res = await pg.evaluate(() => {
    const reports = [];
    const ctx = { mode: 'talk', preview: false, slide: 's1', instant: true, entered: true, lang: 'en', slides: Object.freeze([Object.freeze({ key: 's1', title: 'S', steps: 2, concl: false })]),
      go: () => false, report: (c, m) => reports.push([c, m]), visited: () => false };
    const e = document.getElementById('b');
    e.mount(ctx);
    e.render(e.steps, Infinity, ctx);
    return { deck: typeof window.DECK, steps: e.steps, svg: !!e.querySelector('svg'), reports };
  });
  ok(res.deck === 'undefined' && res.steps === 2 && res.svg && res.reports.length === 0 && errs2.length === 0, `m-bars runs with the registry and a ctx only, no DECK (${JSON.stringify(res)}${errs2.length ? ' ' + errs2.join(' | ') : ''})`);
  await pg.close();
}

// 1.x の教材は変わらない
{
  const min = path.join(out, 'minimal.html');
  build(path.join(ROOT, 'examples/minimal/deck.html'), min);
  const mh = fs.readFileSync(min, 'utf8');
  ok(!/egatariParts registry/.test(mh) && !mh.includes('defineProperty(globalThis, "egatariParts"') && /DECK\.define\("m-sweep"/.test(mh), 'a 1.x lesson gets no registry and keeps DECK.define');
  const m = await open(fileUrl(min));
  const x = await m.p.evaluate(() => { const c = DECK.slides.flatMap((s) => s._comps)[0]; return { v1: c instanceof DECK.MotionElement, v2: c._v2, reg: typeof window.egatariParts }; });
  ok(x.v1 && x.v2 === false && x.reg === 'undefined' && m.errs.length === 0, `1.x parts stay DECK.MotionElement (${JSON.stringify(x)})`);
  await m.p.close();
}
await b.close();
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
