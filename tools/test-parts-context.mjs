// test-all: unit
// 部品への ctx：layout のあとの描画は新しい文脈、見た目の知らせは警告。実際の受け口を VM で呼ぶ（ブラウザなし）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { message, partReportFinding, ruleOf } from '../kit/check-messages.mjs';

const source = fs.readFileSync(new URL('../kit/deck.js', import.meta.url), 'utf8');
const calls = [], warnings = [];
const s = { _key: 's-abcdef', id: 's-abcdef', querySelectorAll: () => [c] };
const c = { _v2: true, _slide: s, _i: 2, tagName: 'M-PROBE', getAttribute: () => '',
  layout(ctx) {
    calls.push(ctx);
    assert.equal(ctx.instant, true); assert.equal(ctx.entered, false);
    ctx.report('layout', '[probe] labels need more room');
    ctx.instant = false; ctx.entered = true; ctx.reset = true;
  }, mount() { assert.fail('a layout report must keep the part drawing'); } };
const deck = { mode: 'talk', componentErrors: [] };
const scope = { DECK: deck, ctxMode: () => 'talk', console: { warn: (m) => warnings.push(m) },
  compFail: () => assert.fail('a report does not fail the part') };
vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('var CTX_SLIDES ='), source.indexOf('// 大きさ・字が変わった：')), scope);
vm.runInContext('CTX_LANG = "en-US"; CTX_SLIDES = Object.freeze([{key: "s-abcdef", title: "A", steps: 1, concl: false}]);', scope);
const mount = scope.ctxFor(c, s, { instant: true, entered: false });
scope.layoutComps([c]);
scope.layoutComps([c]);
const render = scope.ctxFor(c, s, { instant: false, entered: true });
assert.notEqual(mount, calls[0]); assert.notEqual(calls[0], calls[1]); assert.notEqual(calls[1], render);
assert.equal(render.reset, undefined); assert.equal(render.instant, false); assert.equal(render.entered, true);
assert.equal(render.lang, 'en-US'); assert.equal(render.slide, s._key); assert.equal(render.deck, undefined);
assert.ok(Object.isFrozen(render.slides));
assert.equal(deck.componentReports.length, 1); assert.equal(deck.componentErrors.length, 0);
assert.equal(warnings.length, 1);
const finding = partReportFinding(deck.componentReports[0]);
assert.equal(finding.slide, 2); assert.equal(finding.sev, 'warn'); assert.equal(finding.code, 'compLayout');
assert.equal(finding.a.tag, 'm-probe'); assert.equal(ruleOf(finding.code), 'R-fit');
for (const lang of ['ja', 'en']) {
  const text = message(lang, finding.code, finding.a);
  assert.ok(text.includes('<m-probe>') && text.includes('[probe] labels need more room'), text);
  assert.ok(lang === 'ja' ? text.includes('場所が足りない') && text.includes('内容を減らす') : text.includes('enough room') && text.includes('show less content'), text);
  assert.ok(!/ctx\.report|has data it cannot draw|データが合わない/.test(text), text);
}
render.report('error', '[probe] cannot draw');
assert.equal(deck.componentErrors.length, 1);
assert.equal(partReportFinding(deck.componentErrors[0]), null);
render.report('unknown', '[probe] bad code');
assert.equal(deck.componentErrors[1].code, 'error');
for (const code of ['size', 'range', 'theme']) assert.equal(partReportFinding({ kind: 'report', code }).sev, 'warn');
console.log('ok   fresh mount/layout/render contexts, repeated layout, report deduplication, layout warnings in ja/en, error separation');

// コマンド版は文書を開き直しても、先に測った画面の知らせを失わない。
const check = fs.readFileSync(new URL('../kit/check.mjs', import.meta.url), 'utf8');
const collected = [], pending = [deck.componentReports[0]];
const collector = { partReportFinding, cleanErrorText: (s) => s,
  page: { evaluate: async () => pending.slice() }, report: (...args) => collected.push(args) };
vm.createContext(collector);
vm.runInContext(check.slice(check.indexOf('const seenPartReports ='), check.indexOf('await collectPartReports();')), collector);
await collector.collectPartReports();
await collector.collectPartReports();
pending.splice(0, pending.length, { ...deck.componentReports[0], slide: 3, msg: '[probe] another slide needs room' });
await collector.collectPartReports();
assert.equal(collected.length, 2);
assert.deepEqual(collected.map((r) => [r[0], r[1], r[2]]), [[2, 'warn', 'compLayout'], [3, 'warn', 'compLayout']]);
console.log('ok   CLI collects layout reports before reloads, deduplicates repeated reports and keeps different slides');
