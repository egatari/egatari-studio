// test-all: unit
// Drive the actual live sound hook/navigation with a deterministic clock, without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Sounds from '../kit/core/sounds.mjs';
import { createMuteSetting } from '../kit/core/sound-preferences.mjs';
import { RUNTIME_NAMESPACES } from '../kit/core/build-core.mjs';
import { PLAYER_FILES } from '../kit/core/player.mjs';

const src = fs.readFileSync(new URL('../kit/deck.js', import.meta.url), 'utf8');
let now = 0, extension = 0, contexts = 0, resumed = 0;
const listeners = {}, frames = new Map(), data = new Map(), scheduled = [], stopped = [];
const storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
const part = { from: 1, steps: 2, tagName: 'M-PROBE', constructor: { sounds: true },
  events: (k) => k === 1 ? [{ t: 0, sound: 'unknown' }, { t: .5, sound: 'note', pitch: 60, dur: 5, vel: 1 }] : [{ t: 0, sound: 'chime' }] };
class AudioContext {
  constructor() { contexts++; this.state = 'suspended'; }
  get currentTime() { return now / 1000; }
  resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
}
const deck = { mode: 'talk', view: '', Sounds: { ...Sounds, schedule(ctx, events) {
  const item = { at: ctx.currentTime, events: structuredClone(events) }; scheduled.push(item);
  return { stop() { stopped.push(item); } };
} }, SoundPreferences: { createMuteSetting: () => createMuteSetting(() => storage) },
  timeline: () => [0, 1, 2].map((k) => ({ i: 0, k, dur: 1 })), stepExtension: () => extension };
const scope = { DECK: deck, window: { AudioContext, addEventListener: (t, fn) => { listeners[t] = fn; } },
  Q: new URLSearchParams(), printAside: false, ASIDE: 0, raf: 0, liveRun: null, REDUCE: false, started: true,
  slides: [{ _comps: [part], _max: 2 }], CAP: { on: false }, POS: { i: 0, k: 0, setT() {}, publish() {} }, LINKS: { seen: [] },
  location: {}, history: { replaceState() {} }, fragmentOf: () => '', jumpTo: -1,
  performance: { now: () => now }, requestAnimationFrame(fn) { frames.set(1, fn); return 1; }, cancelAnimationFrame(id) { frames.delete(id); },
  document: { dispatchEvent() {} }, CustomEvent: class {}, ctxMode: () => deck.mode === 'lecture' ? 'talk' : deck.mode,
  compCues: () => null, timing: () => ({ lead: 0 }), compRealTime: (c, k, t) => t,
  announce() {}, legacy() {}, animDur: () => 1, marksEnd: () => 0, morphSrc: () => -1, T: { morph: 0 },
  reporter: () => () => assert.fail('events must be valid'), errText: String,
  seek(i, k) { scope.POS.i = i; scope.POS.k = k; },
};
vm.createContext(scope);
vm.runInContext(src.slice(src.indexOf('// Component sounds (§8.4)'), src.indexOf('// 起動の前（部品の mount の前）の go')), scope);
const tick = (ms) => { now = ms; const fn = frames.get(1); assert.ok(fn); frames.delete(1); fn(); };
assert.equal(contexts, 0);
scope.next(); tick(600); assert.equal(scheduled.length, 0, 'no context or audio before a gesture');
assert.equal(contexts, 0);
listeners.keydown({ isTrusted: false }); assert.equal(contexts, 0, 'synthetic keys do not unlock audio');
listeners.keydown({ isTrusted: true }); assert.equal(contexts, 1); assert.equal(resumed, 1);
scope.go(0, 0, false); scope.next(); tick(1200);
assert.equal(scheduled.length, 1, 'forward crossing sounds a note');
assert.equal(scheduled[0].events[0].dur, 5);
tick(1700); scope.next();
assert.equal(stopped.length, 0, 'tail survives an ordinary forward step');
assert.equal(scheduled.length, 2, 'next step zero event sounds');
scope.prev(); assert.equal(stopped.length, 2, 'back stops all tails');
assert.equal(scheduled.length, 2);
scope.go(0, 1, true); tick(2300); assert.equal(scheduled.length, 2, 'animated jump is silent');
// Call the real public seek wrapper: stops the live loop as well as existing voices.
const draw = scope.seek;
vm.runInContext(src.slice(src.indexOf('DECK.seek = function'), src.indexOf('\n', src.indexOf('DECK.seek = function'))), scope);
deck.seek(0, 0, 0); assert.equal(frames.size, 0);
scope.seek = draw;
scope.next(); tick(2900); assert.equal(scheduled.length, 3, 'ordinary navigation after seek works');
deck.seek(0, 1, .8); assert.equal(stopped.length, 3); assert.equal(scheduled.length, 3, 'seeking does not sound events');

scope.go(0, 0, false); extension = 1; scope.next(); tick(3500);
assert.equal(scheduled.length, 3, 'extension moves .5 to 1 second');
tick(3900); assert.equal(scheduled.length, 4); assert.equal(scheduled.at(-1).events[0].dur, 5);
extension = 0;
for (const mode of ['talk', 'learn', 'lecture']) {
  deck.mode = mode; scope.go(0, 0, false); scope.next(); tick(now + 600);
  assert.equal(scheduled.at(-1).events[0].sound, 'note', mode);
}
for (const block of ['video', 'presenter', 'view', 'print', 'aside']) {
  scope.go(0, 0, false);
  if (block === 'video') deck.mode = 'video';
  if (block === 'presenter') scope.Q.set('presenter', '1');
  if (block === 'view') deck.view = 'follow';
  if (block === 'print') scope.printAside = true;
  if (block === 'aside') scope.ASIDE = 1;
  const before = scheduled.length;
  scope.next(); tick(now + 600); assert.equal(scheduled.length, before, block);
  deck.mode = 'talk'; deck.view = ''; scope.Q.delete('presenter'); scope.printAside = false; scope.ASIDE = 0;
}
for (const forced of [false, true]) {
  scope.go(0, 0, false);
  if (forced) deck.silenceSounds(true); else deck.muteSounds(true);
  const before = scheduled.length;
  scope.next(); tick(now + 600); assert.equal(scheduled.length, before);
  if (forced) { assert.equal(data.get('deck-mute-sounds'), '0'); deck.silenceSounds(false); }
  else { assert.equal(createMuteSetting(() => storage).get(), true); deck.muteSounds(false); }
}
// Endpoint crossing when autoplay's timer wins the race with the last RAF.
scope.go(0, 0, false);
part.events = () => [{ t: 1, sound: 'chime' }];
scope.next(); const beforeEnd = scheduled.length;
now += 1000; scope.next();
assert.equal(scheduled.length, beforeEnd + 1, 'forward transition flushes the elapsed endpoint');
// Resuming Web Audio takes a promise turn: a zero-time event must survive it.
scope.go(0, 0, false);
part.events = () => [{ t: 0, sound: 'chime' }];
vm.runInContext('soundContext.state = "suspended"; soundContext.resume = () => new Promise((r) => { window.finishResume = () => { soundContext.state = "running"; r(); }; });', scope);
scope.soundGesture();
const beforeResume = scheduled.length; scope.next();
assert.equal(scheduled.length, beforeResume);
scope.window.finishResume(); await new Promise((r) => setImmediate(r));
assert.equal(scheduled.length, beforeResume + 1, 'first crossing survives asynchronous resume');
// Aside seeks draw thumbnails without cancelling the viewer's live loop.
scope.ASIDE = 1; const frameCount = frames.size;
deck.seek(0, 1, .8); assert.equal(frames.size, frameCount); scope.ASIDE = 0;
assert.equal(RUNTIME_NAMESPACES['core/sounds.mjs'], 'Sounds');
assert.equal(RUNTIME_NAMESPACES['core/sound-preferences.mjs'], 'SoundPreferences');
for (const f of ['kit/core/sounds.mjs', 'kit/core/sound-preferences.mjs']) assert.ok(PLAYER_FILES.includes(f));
console.log('ok   live crossings, lazy gesture, tails, back/jump/seek, extension, talk/learn, auxiliary modes, mute/recording and runtime registration');
