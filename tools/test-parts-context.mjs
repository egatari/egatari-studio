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
const events = {};
const scope = { ASIDE: 0, started: true, slides: [s], document: { addEventListener: (name, fn) => { events[name] = fn; } }, DECK: deck, ctxMode: () => 'talk', console: { warn: (m) => warnings.push(m) },
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

// Viewer timing: drive the actual playback and autoplay functions with a deterministic clock (no browser).
let now = 0, serial = 0;
const frames = new Map(), timers = new Map(), drawn = [];
const authored = [{ i: 0, k: 1, dur: 2 }, { i: 0, k: 2, dur: 3 }];
Object.assign(scope, {
  performance: { now: () => now }, raf: 0, auto: null, REDUCE: false, CAP: { on: false },
  POS: { i: 0, k: 1, setT() {}, publish() {}, setPlaying() {}, setCause() {} },
  T: { morph: 0 }, animDur: () => 2, marksEnd: () => 0, morphSrc: () => -1, announce() {}, legacy() {},
  requestAnimationFrame: (fn) => { frames.set(++serial, fn); return serial; },
  cancelAnimationFrame: (id) => frames.delete(id),
  setTimeout: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; },
  clearTimeout: (id) => timers.delete(id),
  seek(i, k, t, from, cont) {
    scope.viewerAt(i, k, !cont && scope.jump);
    scope.jump = false;
    scope.POS.i = i; scope.POS.k = k;
    drawn.push({ k, t, extension: deck.stepExtension(i, k) });
  },
});
scope.document.documentElement = { classList: { add() {}, remove() {} } };
deck.timeline = () => authored.map((g) => ({ ...g }));
vm.runInContext(source.slice(source.indexOf('function stopLoop(){'), source.indexOf('function go(i, k, animate')), scope);
vm.runInContext(source.slice(source.indexOf('var audioEl = null;'), source.indexOf('// ---------------------------------------------------------------- 発表者ビューとの連携')), scope);
scope.go = (i, k) => { scope.play(i, k, true, -1); };
const frame = (at) => {
  now = at;
  const [id, fn] = frames.entries().next().value || [];
  assert.ok(fn, 'a live clock frame is scheduled'); frames.delete(id); fn();
};
scope.viewerAt(0, 1, true);
assert.equal(render.extend(0), 0);
scope.play(0, 1, true, -1);
assert.equal(render.extend(60), 60);
assert.equal(render.extend(0), 60);
frame(3000);
assert.equal(drawn.at(-1).t, 3, 'live time runs beyond duration(1)=2');
assert.equal(drawn.at(-1).extension, 60);
assert.equal(render.extend(-60), 1, "shortening stops at elapsed time, leaving zero remaining");
frame(3100);
assert.equal(drawn.at(-1).t, Infinity);
assert.equal(render.extend(60), 61, 'an extension restarts a completed clock');
frame(3200);
assert.ok(Number.isFinite(drawn.at(-1).t));
assert.equal(render.extend(NaN), 61); assert.equal(render.extend(Infinity), 61);
assert.equal(render.extend('60'), 61);
scope.stopLoop(); scope.viewerAt(0, 1, true);
assert.equal(render.extend(-1000), -2, 'cannot shorten below zero total duration');
frame(3300);
assert.equal(scope.liveRun.t, 0);
assert.equal(render.extend(62), 60);
assert.equal(render.extend(7200), 3600, 'the player caps a step total at one hour'); assert.equal(render.extend(60 - 3600), 60);
scope.viewerAt(0, 2, false);
assert.equal(render.extend(0), 0, 'each step has its own total');
assert.equal(render.extend(5), 5);
scope.viewerAt(0, 1, false);
assert.equal(render.extend(0), 60, 'returning across steps preserves input');
assert.equal(scope.ctxFor(c, s, { reset: true }).extend(0), 60, 'interaction reset keeps viewer input');
scope.ASIDE = 1;
assert.equal(render.extend(0), 0); assert.equal(render.extend(60), 0);
scope.viewerAt(0, 2, true);
scope.ASIDE = 0;
assert.equal(render.extend(0), 60, 'print/thumbnail rendering preserves viewer totals');
for (const field of ['mode', 'view']) {
  const old = deck[field]; deck[field] = field === 'mode' ? 'video' : 'next';
  assert.equal(render.extend(60), 0); assert.equal(deck.stepExtension(), 0);
  deck[field] = old;
}
scope.viewerAt(0, 1, true);
assert.equal(render.extend(0), 0, 'jump resets all step totals');
scope.viewerAt(0, 2, false); assert.equal(render.extend(0), 0);
scope.slides.push({ _key: 'other' });
scope.viewerAt(1, 0, true);
assert.equal(render.extend(60), 0, 'an inactive component cannot extend another slide');
scope.viewerAt(0, 1, true); assert.equal(render.extend(0), 0);
now = 10000;
scope.startAuto();
assert.equal(timers.get(scope.auto.timer).ms, 2000);
now = 10500;
assert.equal(render.extend(60), 60);
assert.equal(timers.get(scope.auto.timer).ms, 61500, 'autoplay re-times the remaining wait');
assert.equal(render.extend(-60), 0);
assert.equal(timers.get(scope.auto.timer).ms, 1500);
now = 13000;
assert.equal(render.extend(-60), 0);
assert.equal(timers.get(scope.auto.timer).ms, 0, 'shortening an elapsed step advances immediately');
const advance = timers.get(scope.auto.timer).fn;
advance();
assert.equal(scope.POS.k, 2);
assert.equal(deck.stepExtension(0, 1), 0, 'autoplay within the slide preserves earlier totals');
assert.deepEqual(deck.timeline(), authored, 'timeline keeps authored values');
scope.stopAuto(); scope.stopLoop();
// Shortening before narration's lead must cancel its delayed start on the next segment.
let paused = 0;
scope.Audio = class { pause() { paused++; } addEventListener() {} };
deck.timeline = () => [{ i: 0, k: 1, dur: 2, audio: 'fixture-audio', lead: 5 }, { i: 0, k: 2, dur: 3 }];
scope.viewerAt(0, 1, true); scope.POS.k = 1;
scope.startAuto();
const pendingAudio = scope.auto.atimer;
assert.ok(timers.has(pendingAudio));
render.extend(-60);
timers.get(scope.auto.timer).fn();
assert.equal(timers.has(pendingAudio), false);
assert.ok(paused > 0);
scope.stopAuto(); scope.stopLoop();
deck.timeline = () => authored.map((g) => ({ ...g }));
console.log('ok   live clock extension, restart, clamping, per-step persistence, jump/slide reset, video/aside guards and autoplay re-timing');

// The actual live store requires explicit reveal, validates the declared choices and returns copies.
const liveSource = fs.readFileSync(new URL('../kit/live.js', import.meta.url), 'utf8');
const liveEvents = [];
const liveScope = { live: { activities: { 's:1': [{ id: 'p1', kind: 'poll', choices: ['A', 'B'] }] } },
  document: { dispatchEvent: (e) => liveEvents.push(e.type) }, CustomEvent: class { constructor(type) { this.type = type; } } };
vm.createContext(liveScope);
vm.runInContext(liveSource.slice(liveSource.indexOf('var pollResults ='), liveSource.indexOf('function setState(s, why)')), liveScope);
assert.equal(scope.ctxFor(c, s, {}).live, null);
deck.live = { poll: liveScope.pollResult };
const liveCtx = scope.ctxFor(c, s, {}).live;
assert.equal(liveCtx.poll('p1'), null);
assert.equal(liveScope.setPollResult('unknown', { revealed: true, counts: [3, 1] }), false);
for (const result of [{ counts: [3, 1] }, { revealed: false, counts: [3, 1] },
  { revealed: true, counts: [1, 1] }, { revealed: true, counts: [3, -1] },
  { revealed: true, counts: [3.5, 1] }, { revealed: true, counts: [3, ,] }, { revealed: true, counts: [3] }]) {
  liveScope.setPollResult('p1', result); assert.equal(liveCtx.poll('p1'), null);
}
liveScope.setPollResult('p1', { revealed: true, counts: [2, 1] });
assert.equal(JSON.stringify(liveCtx.poll('p1')), '[2,1]');
liveCtx.poll('p1')[0] = 99;
assert.equal(JSON.stringify(liveCtx.poll('p1')), '[2,1]');
for (const [field, value] of [['mode', 'video'], ['view', 'follow']]) {
  const old = deck[field]; deck[field] = value;
  assert.equal(scope.ctxFor(c, s, {}).live, null); assert.equal(liveCtx.poll('p1'), null);
  deck[field] = old;
}
scope.ASIDE = 1;
assert.equal(scope.ctxFor(c, s, {}).live, null); assert.equal(liveCtx.poll('p1'), null);
scope.ASIDE = 0;
liveScope.setPollResult('p1', { revealed: false, counts: [2, 1] }); assert.equal(liveCtx.poll('p1'), null);
liveScope.setPollResult('p1', { revealed: true, counts: [2, 1] });
liveScope.clearPollResults(); assert.equal(liveCtx.poll('p1'), null);
assert.ok(liveEvents.every((e) => e === 'deck:live'));
console.log('ok   no-live context, explicit reveal, three-answer floor, safe count copies, hide/clear, video/print/presenter guards');
