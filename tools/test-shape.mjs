// 部品のデータの形（static shape、kit/shape.js）と、品質チェック・修正依頼に載せる言葉の試験
//   node tools/test-shape.mjs [作業フォルダ]
// 1. 単体：形の検査器（kit/shape.js）、スタックと場所の除去（kit/core/error-text.mjs）、読みの指定（飾りの付いた 1 つの記号）、
//    スライドにない段階の手がかり（orphanDetail）、閉じる行のない narration.md の受け取り、囲みのない返事の送り直しの依頼
// 2. ブラウザ：どの部品にも形の違うデータを渡したデッキを開き、例外を出さず、その場に札（.m-error）を出し、DECK.componentErrors に載ること
// 3. 品質チェック：形の知らせ（スタック・一時フォルダの場所なし）と、部品が描けなくても data-step と .concl を数えること（tools/fixtures/bad-curves）
// 4. 品質チェック：口述原稿の言語をスライドと別に決め、発言ごとにその言語の規則で式の読み上げを見ること（examples/minimal の写し）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { message } from '../kit/check-messages.mjs';
import { cleanErrorText, componentError } from '../kit/core/error-text.mjs';
import { readingProblems, orphanSteps, orphanDetail } from '../kit/core/narration-lint.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { extractBlocks } from '../kit/core/llm-import.mjs';
import { buildFixRequest, cutOffRequest } from '../kit/core/llm-fix.mjs';
import { vendorComponents } from './vendor-components.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-shape-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const clean = (s) => !/\n\s*at |file:\/\/|\/var\/folders|macs-check-|localhost:\d/.test(s);

// ---------------------------------------------------------------- 1. 単体
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'kit', 'shape.js'), 'utf8'), ctx);
const SH = ctx.DECK.shape;
{
  const s = { type: 'array', items: { type: 'object', additionalProperties: false, anyOf: [{ required: ['f'] }, { required: ['pts'] }], properties: { label: { type: 'string' }, f: { type: 'string' }, pts: { type: 'array' } } } };
  ok(SH.check(s, [{ label: 'a', f: 'x' }]) === null, 'shape: a valid value passes');
  const e1 = SH.check(s, { series: [] });
  ok(e1 && e1.path === '' && e1.why === 'type' && /^object \{series\}/.test(e1.got), 'shape: object for array → type at the root');
  const e2 = SH.check(s, [{ label: 'a', fn: 'x' }]);
  ok(e2 && e2.path === '[0].fn' && e2.why === 'unknown' && e2.near === 'f', 'shape: unknown field fn, near f (before anyOf)');
  const e3 = SH.check(s, [{ label: 'a' }]);
  ok(e3 && e3.why === 'anyOf' && e3.expected === 'f or pts', 'shape: anyOf f or pts');
  const e4 = SH.check({ type: 'object', required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', properties: { value: { type: 'number' } } } } } }, { cards: [{ value: '12' }] });
  ok(e4 && e4.path === 'cards[0].value' && e4.expected === 'number' && e4.got === 'string "12"', 'shape: path and expected/got for a nested number');
  ok(SH.brief(s) === '[{label?, f?, pts?} (f or pts), …]', 'shape: brief form for the guide');
}
{
  const raw = `[読み込み] M-CURVES TypeError: S.map is not a function
    at MotionElement.mount (file:///var/folders/hj/vn5v52qj0vg9gztr84gstjbh0000gn/T/macs-check-0ZgXJC/deck.html:2582:20)
    at file:///var/folders/hj/vn5v52qj0vg9gztr84gstjbh0000gn/T/macs-check-0ZgXJC/deck.html:1689:43
    at Array.forEach (<anonymous>)
    at eval (eval at evaluate (:370:30), <anonymous>:10:10)
    at UtilityScript.<anonymous> (<anonymous>:1:44)`;
  const c = cleanErrorText(raw);
  ok(c === '[読み込み] M-CURVES TypeError: S.map is not a function', 'error text: stack lines and temp paths removed');
  ok(JSON.stringify(componentError(raw)) === JSON.stringify({ tag: 'm-curves', msg: 'TypeError: S.map is not a function' }), 'error text: old-style component error recognised');
  ok(cleanErrorText('Failed to load resource: http://localhost:5173/a/b.png (404) at /tmp/macs-check-1/deck.html:12:3') === 'Failed to load resource: b.png (404) at deck.html', 'error text: local server origin and temp dir reduced to file names');
  ok(cleanErrorText('see https://example.org/x') === 'see https://example.org/x', 'error text: other URLs are kept');
  const req = buildFixRequest({ problems: [{ sev: 'error', i: null, title: '', code: 'consoleError', text: raw }], deck: '<section class="slide" id="s-a"><h2>a</h2></section>', narration: '', lang: 'en' });
  ok(clean(req.text) && req.text.includes('S.map is not a function') && req.text.includes('R-components'), 'fix request: no stack or path, rule R-components');
}
{
  const good = ['{Q*|キュースター}', '{P*|ピースター}', '{x′|エックスプライム}', "{x'|エックスプライム}", '{x₀|エックスゼロ}', '{x_0|エックスゼロ}', '{x_{i}|エックスアイ}', '{x^2|エックスじじょう}', '{θ̂|シータハット}', '{\\hat{\\theta}|シータハット}', '{\\bar{x}|エックスバー}', '{\\theta|シータ}', '{x*_i|…}', '{θ|シータ}', '{t-SNE|ティースニー}', '{f(x)|エフエックス}'];
  for (const s of good) ok(readingProblems(s).length === 0, `reading: one decorated symbol is fine ${s}`);
  for (const [s, why] of [['{a*b|…}', 'operator'], ['{Q* = 4|…}', 'operator'], ['{x^2+y|…}', 'operator'], ['{1-η|…}', 'operator'], ['{a+b|…}', 'operator'], ['{θとη|…}', 'several'], ['{Q* P*|…}', 'several']]) {
    const p = readingProblems(s);
    ok(p.length === 1 && p[0].why === why, `reading: ${s} → ${why}`);
  }
}
{
  const text = '## a {#s-a}\n[0] 一つ目。\n[1] Expert: 二つ目。\n    Novice: はい。\n[3] Expert: 段階の外。\n    Novice: そうですね。\n\n[concl] 結論。\n';
  const segs = parseNarration(text);
  const slide = { key: 's-a', max: 2, cstep: 2, static: false };
  const o = orphanSteps(segs, [slide]);
  ok(o.length === 1 && o[0].stepKey === '3' && o[0].line === 5 && o[0].end === 6, 'orphan: the step and its lines 5–6');
  const d = orphanDetail(o[0], slide, text);
  ok(JSON.stringify(d.keys) === '["0","1","concl"]' && d.n === 1 && d.concl && d.target === '1' && d.lines.length === 2 && d.lines[0].text === '[3] Expert: 段階の外。', 'orphan: valid keys, target [1] and the lines verbatim');
  for (const lang of ['ja', 'en']) {
    const m = message(lang, 'narrOrphan', { step: '3', line: 5, end: 6, static: false, ...d, comps: [] });
    ok(m.includes('[0] [1] [concl]') && m.includes('[3] Expert: 段階の外。') && m.includes('Novice: そうですね。') && m.includes('[1]') && m.includes('data-step="3"') && m.includes('R-narr-steps'), `orphan message (${lang}): keys, lines, target, data-step`);
  }
}
{
  const deck = '```deck.html\n<!DOCTYPE html><html><body><div id="stage"><section class="slide" id="s-a"><h2>A</h2></section><section class="slide"><h2>B の話</h2></section></div></body></html>\n```\n\n';
  const done = extractBlocks(deck + '```narration.md\n## A {#s-a}\n[0] はい。\n\n## B の話\n[0] そうです。\n[concl] 終わりです。\n');
  ok(!done.error && done.narration && done.warnings.some((w) => w.code === 'unclosedAccepted'), 'import: the last narration block without ``` but complete is accepted with a notice');
  const cut = extractBlocks(deck + '```narration.md\n## A {#s-a}\n[0] はい。\n\n## B の話\n[0] そうで');
  ok(cut.error && cut.error.code === 'unclosed', 'import: an unfinished last line is still cut off');
  const missing = extractBlocks(deck + '```narration.md\n## A {#s-a}\n[0] はい。\n');
  ok(missing.error && missing.error.code === 'unclosed', 'import: a missing slide section is still cut off');
  const cutConcl = extractBlocks(deck + '```narration.md\n## A {#s-a}\n[0] はい。\n\n## B の話\n[0] そうです。\n[concl] 次は、伸びの');
  ok(cutConcl.error && cutConcl.error.code === 'unclosed', 'import: a [concl] line cut in the middle is still cut off');
  const none = extractBlocks('Here is your deck, attached as files.');
  ok(none.error && none.error.code === 'no-blocks', 'import: no blocks');
  ok(/Do not output files, a canvas or attachments/.test(cutOffRequest(none.error, 'en')) && /ファイル・キャンバス・添付では出さず/.test(cutOffRequest(none.error, 'ja')), 'import: the resend request for no blocks');
}

// ---------------------------------------------------------------- 2. ブラウザ：どの部品にも形の違うデータ
const WRONG = {
  'm-bars': '<script type="application/json">{"group": [{"label": "1 年目", "value": 1}]}</script>',
  'm-codetree': '<script type="application/json">{"codes": [{"run": 2, "white": "0111"}], "bits": "0111"}</script>',
  'm-collect': '<script type="application/json">{"chips": [{"label": "表"}], "targets": [{"label": "表の数"}]}</script>',
  'm-curves': '<script type="application/json">{"xr": [0, 10], "series": [{"label": "需要", "fn": "10 - u"}]}</script>',
  'm-flow': '<script type="application/json">{"nodes": [{"id": "a", "label": "観測"}]}</script>',
  'm-kpi': '<script type="application/json">{"cards": [{"label": "時間", "value": "62"}]}</script>',
  'm-market': '<script type="application/json">[{"key": "TAM", "value": 3000}]</script>',
  'm-quad': '<script type="application/json">{"items": [{"label": "A 社", "x": "0.2", "y": 0.3}]}</script>',
  'm-seq': '<script type="application/json">{"xs": [0, 1, 2], "steps": [{"density": [1, 2, 1]}]}</script>',
  'm-gendai': '<script type="application/json">{"paragraphs": ["本文"]}</script>',
  'm-kanbun': '<script type="application/json">["学而時習之"]</script>',
  'm-kobun': '<script type="application/json">{"text": "春はあけぼの"}</script>',
  'm-menu': '<script type="application/json">[{"href": "#s-x", "label": "目次"}]</script>',
  // 部品庫 v1.2.0 の部品：よくある取り違え（並びの名前・値の型）
  'm-compare': '<script type="application/json">{"columns": [{"label": "A"}], "rows": [{"label": "値段", "values": [1]}]}</script>',
  'm-venn': '<script type="application/json">{"circles": [{"label": "A"}, {"label": "B"}]}</script>',
  'm-tree': '<script type="application/json">{"children": [{"label": "根"}]}</script>',
  'm-fishbone': '<script type="application/json">{"effect": "結果", "causes": [{"label": "人"}]}</script>',
  'm-scatter': '<script type="application/json">{"points": [[1, 2], [3, 4]]}</script>',
  'm-pie': '<script type="application/json">{"slices": [{"label": "A", "value": "30%"}]}</script>',
  'm-timeline': '<script type="application/json">{"events": [{"label": "創業", "year": 1990}]}</script>',
  'm-cycle': '<script type="application/json">{"steps": [{"label": "計画"}, {"label": "実行"}]}</script>',
};
const comps = vendorComponents(ROOT).map((c) => 'm-' + c.name);
ok(comps.every((t) => WRONG[t] || t === 'm-sweep'), 'every component has a wrong-shape example in this test');
const deckDir = path.join(work, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
const slides = comps.map((t, j) => `<section class="slide noconcl" id="s-w${j}">
  <h2>${t}</h2>
  <div class="body">${t === 'm-sweep' ? '<m-sweep f="u*u + c" values="[1]" style="height:300px"></m-sweep>' : `<${t} aria-label="${t} の図" style="height:300px">${WRONG[t]}</${t}>`}</div>
</section>`).join('\n') + `
<section class="slide noconcl" id="s-throw">
  <h2>描くときの例外</h2>
  <div class="body"><m-curves aria-label="式が書けていない線" style="height:300px"><script type="application/json">[{"label": "a", "f": "10 - ("}]</script></m-curves></div>
</section>`;
fs.writeFileSync(path.join(deckDir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>形の違うデータ</title></head>
<body><div id="stage">
${slides}
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(deckDir, 'deck.html'), '-o', out], { cwd: ROOT, encoding: 'utf8' });
ok(b.status === 0, 'build the wrong-shape deck' + (b.status ? ': ' + b.stderr : ''));
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const seen = [];
    DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) { DECK.seek(i, k, 0.3); DECK.seek(i, k, Infinity); } });
    DECK.slides.forEach((s) => s._comps.forEach((c) => seen.push({ tag: c.tagName.toLowerCase(), box: !!c.querySelector('.m-error'), text: (c.querySelector('.m-error') || {}).textContent || '' })));
    return { seen, errs: DECK.componentErrors.map((x) => JSON.parse(JSON.stringify(x))), max: DECK.slides.map((s) => s._max) };
  });
  ok(errors.length === 0, 'no exception or console error while opening and seeking' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.max.every((m) => Number.isFinite(m)), 'every slide has a finite number of steps');
  for (const t of comps) {
    const s = r.seen.find((x) => x.tag === t), e = r.errs.find((x) => x.tag === t);
    ok(s && s.box && s.text.includes('<' + t + '>'), `${t}: shows the inline placeholder`);
    ok(e && e.phase === 'data', `${t}: reported in DECK.componentErrors before mount (${e && e.kind}${e && e.why ? ' ' + e.why : ''})`);
    if (!e) continue;
    for (const lang of ['ja', 'en']) {
      const m = message(lang, 'compData', e);
      ok(clean(m) && m.includes('<' + t + '>') && m.includes('R-components') && (m.includes('例：') || m.includes('example:')), `${t}: shape message (${lang}) names the component, how to write it, the rule; no stack or path`);
    }
  }
  const th = r.errs.find((x) => x.phase === 'mount');
  ok(th && th.tag === 'm-curves' && th.kind === 'exception' && /SyntaxError/.test(th.msg) && r.seen.filter((x) => x.tag === 'm-curves').every((x) => x.box), 'mount exception: placeholder, recorded with the message only');
  ok(clean(message('ja', 'compData', th)), 'mount exception: message without stack');
  const cu = r.errs.find((x) => x.tag === 'm-curves');
  const mcu = message('en', 'compData', cu);
  ok(/“series” is not a field/.test(mcu) && /xr are attributes of <m-curves>/.test(mcu) && /no field “fn” \(write f\)/.test(mcu), 'm-curves: says series is not a field, xr is an attribute, fn → f');
} finally { await browser.close(); }

// ---------------------------------------------------------------- 3. 品質チェック（tools/fixtures/bad-curves：配列でない m-curves と data-step の 2 つ・結論）
{
  const c = spawnSync(process.execPath, ['kit/check.mjs', 'tools/fixtures/bad-curves/deck.html', '--json'], { cwd: ROOT, encoding: 'utf8' });
  let j = null;
  try { j = JSON.parse(c.stdout); } catch { /* 下で失敗 */ }
  ok(j && c.status === 1, 'check: the fixture has errors');
  if (j) {
    const orphans = j.results.filter((x) => x.code === 'narrOrphan').map((x) => x.step);
    ok(JSON.stringify(orphans) === '["3"]', 'check: steps counted from data-step and .concl although the component fails ([0] [1] [2] [concl] are fine, only [3]) — ' + JSON.stringify(orphans));
    const cd = j.results.filter((x) => x.code === 'compData');
    ok(cd.length === 1 && cd[0].slide === 1 && cd[0].rule === 'R-components' && clean(cd[0].msg), 'check: one shape message for the slide, rule R-components, no stack or path');
    ok(!j.results.some((x) => x.code === 'consoleError'), 'check: no raw console error');
    const o = j.results.find((x) => x.code === 'narrOrphan');
    ok(o && /\[0\] \[1\] \[2\] \[concl\]/.test(o.msg) && o.msg.includes('[3] Expert: この行はスライドにない段階です。') && o.msg.includes('[2]'), 'check: the orphan message lists the keys, the lines and the target');
  }
}

// ---------------------------------------------------------------- 4. 品質チェック：口述原稿の言語はスライドと別（日本語のスライドに英語の口述原稿。#37・#38）
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-narr-lang-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'examples/minimal/deck.html'), path.join(dir, 'deck.html'));
    const ja = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
    const run = () => {
      const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8' });
      try { return JSON.parse(c.stdout); } catch { return null; }
    };
    const formulas = (j) => j.results.filter((x) => x.code === 'narrFormula').map((x) => x.data.t);
    // 英語の口述原稿（英字が多い文）：voice.json がなくても、文字から英語と分かって警告しない
    fs.writeFileSync(path.join(dir, 'narration.md'), ja.replace(/^(\[[^\]]+\]) .*$/gm, '$1 Markdown and HTML are what an AI writes easily, so we compare them here.'));
    let j = run();
    ok(j && formulas(j).length === 0, 'check: English narration on a Japanese deck gives no R-formula — ' + JSON.stringify(j && formulas(j)));
    ok(j && j.results.some((x) => x.code === 'narrLang' && x.data.lang === 'en' && x.data.source === 'text'), 'check: says the narration language (en, from the text)');
    fs.writeFileSync(path.join(dir, 'voice.json'), '{"lang": "en"}');
    j = run();
    ok(j && formulas(j).length === 0 && j.results.some((x) => x.code === 'narrLang' && x.data.source === 'voice.json'), 'check: lang in voice.json is used');
    fs.rmSync(path.join(dir, 'voice.json'));
    // 日本語の口述原稿：英字の名前が並ぶだけの文は式ではない。式は今までどおり警告する
    let k = 0;
    fs.writeFileSync(path.join(dir, 'narration.md'), ja.replace(/^(\[[^\]]+\]) .*$/gm, (m, key) => `${key} ${k++ === 1 ? 'ax + by = c' : 'AI が書きやすいのは、Markdown と HTML です。'}`));
    j = run();
    ok(j && JSON.stringify(formulas(j)) === '["ax + by = c"]' && !j.results.some((x) => x.code === 'narrLang'), 'check: names in a Japanese sentence are not a formula, ax + by = c still is — ' + JSON.stringify(j && formulas(j)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
