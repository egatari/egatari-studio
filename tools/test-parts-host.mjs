// 部品庫 2.0 の受け口（format spec §6.1・§6.2・§8.4。backlog #123）：同梱の再生器が 2.0 のパーツを動かすか
//   node tools/test-parts-host.mjs [出力先]
// 教材 tools/fixtures/parts2/（egatari.json の componentsCatalogue で 2.0。m-bars・m-flow・m-kakijun は vendor/components-2 の写し、
// m-probe・m-boom・m-orphan は作業フォルダの埋め込みのパーツ）を組んで開き、確かめること：
//   組み立て：登録簿がパーツより前・パーツが依存の順・m-flow の tex を KaTeX で描いて texHtml と renderers を足す・m-kakijun の塊を教材の字に絞る
//   登録簿：factory が投げたパーツと、それに頼るパーツは失敗として記録され、その要素は字の代わり（data-part-failure="define"）と品質チェックへの知らせ
//   ctx：mount に mode・preview・slide・lang・slides・go・report・visited（deck はない）。slides は凍った [{key, title, steps, concl}]
//   守り（2 段）：mount・render で投げたパーツは base が止めて ctx.report("error") し、デッキは動き続ける
//   report：size は DECK.componentReports にだけ、error・data は DECK.componentErrors にも
//   layout：起動・窓の大きさが変わった・隠れていたスライドが見えたときに呼ばれ、そのあと描き直す（entered なし）
//   entered：別のスライドから入った最初の描画だけ true。印刷（beforeprint/afterprint）・DECK.aside の描画とその戻り・動画のコマでは false
//   ctx.go：スライドへのリンクと同じに動く。知らないスライドは false
//   DECK なし：登録簿と shape・base・bars だけのページ（deck.js なし）で m-bars が mount・render できる（Appendix A 1A）
//   1.x：componentsCatalogue のない教材（examples/minimal）には登録簿が入らず、部品は DECK.MotionElement のまま
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-parts-host-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const build = (src, dst, extra = []) => execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), src, '-o', dst, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// ---------------------------------------------------------------- 組み立て
const deck = path.join(out, 'parts2.html');
const log = build(path.join(ROOT, 'tools/fixtures/parts2/deck.html'), deck);
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
ok(!/component not found|is not in components2/.test(log), 'no part is missing from the build');
// 1 ファイル（--portable）にはまだしない（索引の components に 2.0 のパーツを書くのは後の段。1.x の書き方の記録は中のコードと合わない）
{
  const tmpDeck = path.join(out, 'portable-src');
  fs.rmSync(tmpDeck, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'tools/fixtures/parts2'), tmpDeck, { recursive: true });
  let refused = '';
  try { build(path.join(tmpDeck, 'deck.html'), path.join(out, 'unused.html'), ['--portable']); } catch (e) { refused = String(e.stderr); }
  ok(/cannot be exported as a single file yet/.test(refused), 'a 2.0 lesson is not exported as a single file yet (refused with a reason)');
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
ok(st.failures.some((f) => f.name === 'boom' && /factory threw/.test(f.reason)) && st.failures.some((f) => f.name === 'orphan' && /boom@0\.1\.0, which failed/.test(f.reason)),
  `registry records the failed factory and its dependant: ${st.failures.map((f) => f.name + ': ' + f.reason).join(' | ')}`);
ok(['m-bars', 'm-flow', 'm-kakijun', 'm-probe'].every((t) => st.elements[t]), 'registry defined the element parts');
const fb = await p.evaluate(() => ['m-boom', 'm-orphan'].map((t) => { const e = document.querySelector(t); const x = e && e.querySelector('[data-part-failure="define"]'); return x ? x.textContent : null; }));
ok(fb[0] === '作れないパーツ' && fb[1] === '頼る先が作れないパーツ', `failed parts show their text equivalent (${JSON.stringify(fb)})`);
const m0 = await p.evaluate(() => window.__probe.mounts.find((m) => m.id === 'probe-a'));
ok(m0 && ['go', 'lang', 'mode', 'preview', 'report', 'slide', 'slides', 'visited'].every((k) => m0.keys.includes(k)) && !m0.hasDeck, `ctx at mount: ${m0 && m0.keys.join(',')} (no deck)`);
ok(m0 && m0.lang === 'ja' && m0.slide === 'p-one' && m0.frozen && JSON.stringify(m0.slides[0]) === JSON.stringify(['p-one', '棒と試験のパーツ', 2, true]) && JSON.stringify(m0.slides[3]) === JSON.stringify(['p-four', '絞り込み', 2, false]),
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
  const v2 = (n, v) => fs.readFileSync(path.join(ROOT, 'vendor/components-2', n, v, 'index.js'), 'utf8');
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
