// test-all: unit
// Exercise the player's real validation, trusted channel, event mirroring and state lifecycle without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../kit/deck.js', import.meta.url), 'utf8');
const events = {}, sent = [], applied = [], rendered = [];
const presenter = { postMessage: (m) => sent.push(m) }, stranger = {};
const counts = [2, 3];
const predict = { localName: 'm-predict', constructor: { viewerInput: true }, author: [2, 3], from: 1, steps: 2,
  counts: () => counts.slice(), input(i, n) { applied.push([i, n]); counts[i] = n; events['egatari-input']({ target: predict, detail: { counts: counts.slice() } }); } };
const timer = { localName: 'm-timer', constructor: { meta: { viewerInput: true } }, from: 1, steps: 2 };
const plain = { localName: 'm-plain', constructor: {} };
const slide = { _key: 's-input', _comps: [plain, predict, timer] };
predict._slide = timer._slide = slide;
const scope = { DECK: { ready: true, mode: 'talk', view: '', timeline: () => [{ i: 0, k: 1, dur: 90 }, { i: 0, k: 2, dur: 20 }] },
  started: true, ASIDE: 0, EMBED: false, slides: [slide], raf: 0, presenter, presenterOpened: presenter, window: { addEventListener: (n, f) => { events[n] = f; } },
  document: { addEventListener: (n, f) => { events[n] = f; } },
  performance: { now: () => 10000 }, animDur: () => 90, tickLive() {}, scheduleAutoEnd() {},
  requestAnimationFrame: () => 1, editorParent: () => false, trustedCmd: (src) => src === presenter,
  stopLoop() { scope.raf = 0; scope.liveRun = null; },
  seek: (...args) => rendered.push(args), post: (m) => sent.push(m),
};
vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('var viewerStep ='), source.indexOf('var CTX_LIVE =')), scope);
const listenerStart = source.indexOf('window.addEventListener("message", function(e){', source.indexOf('function openPresenter'));
vm.runInContext(source.slice(listenerStart, source.indexOf('// ---------------------------------------------------------------- スライドへのリンク', listenerStart)), scope);
scope.viewerAt(0, 1, true);
const key = scope.inputKey(slide, predict), timerKey = scope.inputKey(slide, timer);
assert.equal(key, 's-input:1', 'index includes non-input parts');
const send = (input, src = presenter) => events.message({ source: src, data: { type: 'deck-cmd', cmd: 'input', input } });
const msg = { type: 'input', key, id: 0, value: 8 };
send(msg, stranger); assert.equal(applied.length, 0);
for (const bad of [null, {}, { ...msg, type: 'other' }, { ...msg, key: '__proto__' }, { ...msg, key: 'other:1' },
  ...[-1, 2, 0.5, '0', null, NaN].map((id) => ({ ...msg, id })),
  ...[-1, 10000, 2.5, '2', null, NaN, Infinity, -Infinity].map((value) => ({ ...msg, value }))]) send(bad);
assert.equal(applied.length, 0, 'unknown keys, choices, non-numbers and out-of-range counts are ignored');
send(msg); assert.deepEqual(counts, [8, 3]);
send({ ...msg, id: 1, value: 9999 }); assert.deepEqual(counts, [8, 9999]);
send({ ...msg, value: 0 }); assert.deepEqual(counts, [0, 9999]);
for (const id of ['bogus', 0, null]) send({ type: 'input', key: timerKey, id, value: 60 });
assert.equal(scope.DECK.stepExtension(), 0);
send({ type: 'input', key: timerKey, id: 'extend', value: 60 }); assert.equal(scope.DECK.stepExtension(), 60);
send({ type: 'input', key: timerKey, id: 'extend', value: -60 }); assert.equal(scope.DECK.stepExtension(), 0);
for (const value of [NaN, Infinity, '60', null]) send({ type: 'input', key: timerKey, id: 'extend', value });
assert.equal(scope.DECK.stepExtension(), 0);
assert.equal(scope.ctxExtend(slide, 7200, timer), 3600);
const beforeRead = scope.raf;
assert.equal(scope.ctxExtend(slide, 0, timer), 3600); assert.equal(scope.raf, beforeRead, 'zero is read-only');
scope.viewerAt(0, 2, false); assert.equal(scope.DECK.stepExtension(), 0);
scope.viewerAt(0, 1, false); assert.equal(scope.DECK.stepExtension(), 3600);
await Promise.resolve();
assert.equal(sent.at(-1).type, 'deck-input-state');
assert.deepEqual(Array.from(sent.at(-1).viewer.counts[0].counts), [0, 9999]);
assert.equal(sent.at(-1).viewer.extensions[1], 3600);
const snapshot = scope.inputState(); snapshot.extensions[1] = 42; snapshot.counts[0].counts[0] = 44;
assert.equal(scope.DECK.stepExtension(), 3600); assert.equal(counts[0], 0, 'snapshots are copies');
const entry = scope.inputEntry;
scope.ASIDE = 1; scope.viewerAt(0, 1, true); scope.ASIDE = 0;
assert.equal(scope.inputEntry, entry); assert.equal(scope.DECK.stepExtension(), 3600);
scope.viewerAt(0, 1, true); assert.equal(scope.inputEntry, entry + 1); assert.equal(scope.DECK.stepExtension(), 0);
scope.DECK.mode = 'video';
send({ ...msg, value: 55 }); send({ type: 'input', key: timerKey, id: 'extend', value: 60 });
assert.equal(counts[0], 0); assert.equal(scope.DECK.stepExtension(), 0); assert.equal(scope.inputState(), null);
scope.DECK.mode = 'talk'; scope.viewerAt(0, 0, false);
send({ type: 'input', key: timerKey, id: 'extend', value: 60 }); assert.equal(scope.DECK.stepExtension(), 0, 'timer title is not a phase');
// Follow applies totals without echoing the part's bubbling event, and forwards timer deltas once.
scope.DECK.view = 'follow'; scope.viewerAt(0, 1, false); sent.length = 0;
scope.mirrorInput({ ...scope.inputState(), entry: 20, extensions: { 1: 60 }, counts: [{ key, counts: [7, 9] }], clock: { t: 10, base: 90, running: true } });
assert.deepEqual(counts, [7, 9]); assert.equal(scope.ctxExtend(slide, 0, timer), 60); assert.equal(sent.length, 0);
assert.equal(rendered.at(-1)[2], 10); assert.equal(scope.raf, 1);
assert.equal(scope.ctxExtend(slide, -60, timer), 0);
assert.equal(sent.length, 1); assert.equal(sent[0].input.type, 'input'); assert.equal(sent[0].input.value, -60);
assert.equal(sent[0].input.key, timerKey);
sent.length = 0;
events['egatari-input']({ target: timer, detail: { step: 1, extend: 0 } }); assert.equal(sent.length, 0, 'timer total is never forwarded as a delta');
predict.input(0, 12); assert.equal(sent.length, 2); assert.equal(sent[0].input.value, 12);
scope.DECK.VIEWER_INPUT = { 'm-plain': true }; assert.equal(scope.inputPart(plain), true);
assert.equal(scope.inputTarget({ target: { parentElement: predict } }), true);
assert.equal(scope.inputTarget({ target: {}, composedPath: () => [{}, timer] }), true);
assert.equal(scope.inputTarget({ target: {} }), false);
// The actual parent-message receiver distinguishes a same-slide jump from another step update.
const parent = {}, moves = [];
scope.window.parent = parent; scope.POS = { i: 0, k: 1 };
scope.go = (i, k, animate, stepMove) => { moves.push({ i, k, stepMove }); scope.POS.i = i; scope.POS.k = k; scope.viewerAt(i, k, !stepMove); };
const position = { type: 'deck-goto', i: 0, k: 1, animate: true,
  viewer: { entry: 21, i: 0, k: 1, counts: [{ key, counts: [2, 3] }], extensions: {}, clock: null } };
events.message({ source: stranger, data: position }); assert.equal(moves.length, 0);
events.message({ source: parent, data: position }); assert.equal(moves.length, 1); assert.equal(moves[0].stepMove, false);
assert.deepEqual(counts, [2, 3]); assert.equal(scope.DECK.stepExtension(), 0);
events.message({ source: parent, data: position }); assert.equal(moves.length, 1, 'repeated position does not re-enter');
events.message({ source: parent, data: { ...position, viewer: { ...position.viewer, entry: 22 } } });
assert.equal(moves.length, 2); assert.equal(moves[1].stepMove, false, 'same-slide jump re-enters');
scope.DECK.view = ''; scope.viewerAt(0, 1, true);
scope.liveRun = { i: 0, k: 1, t: 80, start: -70000, base: 90 };
assert.equal(scope.ctxExtend(slide, -60, timer), -10, 'a late minus press stops at zero remaining');
console.log('ok   trusted input commands, strict number/id/key validation, timer deltas and totals, snapshots, entry/aside/video guards, no mirror echo and viewer-input key ownership');
