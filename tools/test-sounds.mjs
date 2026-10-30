// 部品の音：音名・時刻・余韻・和音・設定と動画への受け渡し（Node だけ。ブラウザ・通信なし）。
//   node tools/test-sounds.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalize, midiPitch, crossed, retime, schedule, renderPCM } from '../kit/core/sounds.mjs';
import { createMuteSetting, MUTE_KEY, MUTE_LABEL } from '../kit/core/sound-preferences.mjs';
import { classicNamespace } from '../kit/core/build-core.mjs';
import { collectVideoEvents, videoSoundEvents, renderStepSounds } from '../render/sounds.mjs';

let count = 0;
function test(name, fn) { fn(); count++; console.log('ok   ' + name); }
const note = (t = 0, pitch = 'C4', dur = .5, vel = 1) => ({ t, sound: 'note', pitch, dur, vel });
const bytes = (pcm) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
const peak = (pcm) => pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('音名と MIDI：中央の C・半音・異名同音・範囲', () => {
  for (const [p, n] of [['C4', 60], ['A4', 69], ['c#4', 61], ['D♭4', 61], ['B#3', 60], ['Cb4', 59], ['C-1', 0], ['G9', 127], [0, 0], [127, 127]]) assert.equal(midiPitch(p), n);
  for (const p of ['H4', 'C', ' C4', 'C4 ', 'C10', 'C-2', '60', 128, -1, 60.5, NaN, null]) assert.equal(midiPitch(p), null);
});

test('検証：不正な値と知らない音を捨て、入力を変えず時刻順にする', () => {
  const events = [note(2), { t: 0, sound: 'bell' }, { t: 1, sound: 'chime', other: true }, note(2, 64, 1, 0)];
  const before = structuredClone(events);
  assert.deepEqual(normalize(events), [{ t: 0, sound: 'bell', count: 1 }, { t: 1, sound: 'chime' }, note(2, 60), note(2, 64, 1, 0)]);
  assert.deepEqual(events, before);
  const bad = [null, {}, { t: 0, sound: 'unknown' }, { t: -1, sound: 'chime' }, { t: Infinity, sound: 'chime' },
    { t: '0', sound: 'chime' }, ...[0, 4, 1.5, '2', null].map((n) => ({ t: 0, sound: 'bell', count: n })),
    note(0, 'Q4'), note(0, 60, 0), note(0, 60, -1), note(0, 60, Infinity), note(0, 60, .5, -.1), note(0, 60, .5, 1.1),
    note(0, 60, .5, NaN), { t: 0, sound: 'note', pitch: 60 }, note(Number.MAX_VALUE, 60, Number.MAX_VALUE)];
  assert.deepEqual(normalize(bad), []);
  assert.deepEqual(normalize(null), []);
  assert.deepEqual(normalize({}), []);
  assert.equal(normalize([1, 2, 3].map((n) => ({ t: 0, sound: 'bell', count: n }))).length, 3);
});

test('通過：(前, 今]、初めの 0、後ろへ・跳ぶ・シーク・最終状態は鳴らさない', () => {
  const events = [note(0), note(.1), note(.2), note(.2, 64), note(3)];
  assert.deepEqual(crossed(events, -1, 0), normalize(events.slice(0, 1)));
  assert.deepEqual(crossed(events, .1, .2), normalize(events.slice(2, 4)));
  for (const [a, b, opts] of [[.2, .1], [.2, .2], [0, 4, { jump: true }], [0, 4, { seek: true }], [null, 4], [0, Infinity], [NaN, .2]]) assert.deepEqual(crossed(events, a, b, opts), []);
  assert.equal(crossed(events, .2, 4).length, 1); // 遅いコマも、通常の再生なら拾う
});

test('延長：倍率と合計秒、短縮、音の長さは作者のまま', () => {
  const events = [note(2, 60, .5), { t: 4, sound: 'bell', count: 3 }];
  assert.deepEqual(retime(events, 1.5), [{ ...events[0], t: 3 }, { ...events[1], t: 6 }]);
  assert.deepEqual(retime(events, { duration: 4, extension: 2 }), retime(events, 1.5));
  assert.deepEqual(retime(events, { duration: 4, extension: -2 }), retime(events, .5));
  assert.ok(retime(events, { duration: 4, extension: -8 }).every((e) => e.t === 0));
  for (const bad of [-1, NaN, Infinity, null, { duration: 0, extension: 1 }, { duration: 4, extension: '1' }]) assert.throws(() => retime(events, bad), RangeError);
  assert.equal(events[0].t, 2);
});

test('PCM：同じバイト、正しい長さ・無音の前置き・余韻・音量 0', () => {
  const events = [note(.25, 'A4', .5, .8)];
  const a = renderPCM(events, 8000), b = renderPCM(events, 8000);
  assert.deepEqual(bytes(a), bytes(b));
  assert.equal(a.length, 6000);
  assert.ok(a.slice(0, 2000).every((v) => v === 0));
  assert.ok(peak(a) > .05 && peak(a) < .15);
  assert.ok(Math.abs(a.at(-1)) < .001);
  assert.equal(renderPCM([note(0, 60, .5, 0)], 8000).length, 4000);
  assert.equal(peak(renderPCM([note(0, 60, .5, 0)], 8000)), 0);
  assert.equal(renderPCM([], 8000).length, 0);
  for (const sr of [0, NaN, 8000.5, 384001]) assert.throws(() => renderPCM(events, sr), RangeError);
  for (const sound of ['bell', 'chime']) {
    const pcm = renderPCM([{ t: 0, sound, count: 3 }], 8000);
    assert.equal(pcm.length, Math.ceil((sound === 'bell' ? 2.15 : .82) * 8000));
    assert.ok(peak(pcm) > .05);
  }
});

test('和音：普通の和音は音を足し、密な和音も波形を切らない', () => {
  const events = [note(0, 60), note(0, 64), note(0, 67)];
  const chord = renderPCM(events, 8000), singles = events.map((e) => renderPCM([e], 8000));
  for (let i = 0; i < chord.length; i++) assert.ok(Math.abs(chord[i] - singles.reduce((v, p) => v + p[i], 0)) < 1e-7);
  assert.ok(peak(chord) > Math.max(...singles.map(peak)));
  const dense = renderPCM(Array.from({ length: 100 }, () => note(0, 60)), 8000);
  assert.ok(peak(dense) > .5 && peak(dense) < .901);
});

// AudioContext / OfflineAudioContext に共通の API だけを持つ差し替え。時刻の予定・停止・接続を確かめる。
function audioContext(sampleRate) {
  const param = () => ({ calls: [], setValueAtTime(...x) { this.calls.push(['set', ...x]); }, linearRampToValueAtTime(...x) { this.calls.push(['linear', ...x]); },
    exponentialRampToValueAtTime(...x) { this.calls.push(['exp', ...x]); }, cancelScheduledValues(...x) { this.calls.push(['cancel', ...x]); } });
  const ctx = { sampleRate, currentTime: 0, destination: {}, oscillators: [], gains: [] };
  ctx.createOscillator = () => {
    const osc = { frequency: param(), stops: [], connect(to) { this.to = to; }, disconnect() { this.disconnected = true; }, start(t) { this.startTime = t; }, stop(t) { this.stops.push(t); } };
    ctx.oscillators.push(osc); return osc;
  };
  ctx.createGain = () => {
    const gain = { gain: param(), connect(to) { this.to = to; }, disconnect() { this.disconnected = true; } };
    ctx.gains.push(gain); return gain;
  };
  return ctx;
}

test('Web Audio：予定時刻・ベルの間隔・指数減衰・余韻と stop（2 種類の標本化周波数）', () => {
  for (const sr of [44100, 48000]) {
    const ctx = audioContext(sr), destination = {};
    const handle = schedule(ctx, [{ t: .2, sound: 'bell', count: 3 }, note(.1, 69, 2)], 1, { destination });
    assert.equal(ctx.oscillators.length, 11);
    for (const [i, t] of [[0, 1.2], [3, 1.8], [6, 2.4]]) assert.ok(Math.abs(ctx.oscillators[i + 2].startTime - t) < 1e-9);
    assert.equal(ctx.oscillators[0].frequency.calls[0][1], 440);
    assert.equal(ctx.oscillators[0].stops[0], 3.1); // 次の段階が始まっても自動で切らない
    assert.ok(ctx.gains[2].gain.calls.some(([op]) => op === 'exp'));
    assert.ok(ctx.gains.every((g) => g.to === destination));
    ctx.oscillators[0].onended();
    assert.ok(ctx.oscillators[0].disconnected && ctx.gains[0].disconnected);
    ctx.currentTime = 1.5;
    handle.stop(); handle.stop();
    assert.equal(ctx.oscillators[0].stops.length, 1);
    assert.ok(ctx.oscillators.slice(1).every((o) => o.stops.length === 2 && o.stops[1] === 1.5));
    assert.ok(ctx.gains.slice(1).every((g) => g.gain.calls.some(([op, t]) => op === 'cancel' && t === 1.5)));
    const silent = audioContext(sr);
    schedule(silent, [note(0, 60, .5, 0)], 0);
    assert.equal(silent.oscillators.length, 0);
    schedule(silent, [note()], 0, { offset: 1 });
    assert.equal(silent.oscillators.length, 0);
  }
});

test('ミュート：端末で保存、保存できないときはメモリ、2 言語の札', () => {
  const data = new Map(), storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
  const a = createMuteSetting(() => storage);
  assert.equal(a.get(), false);
  assert.equal(a.set(true), true);
  assert.equal(data.get(MUTE_KEY), '1');
  const b = createMuteSetting(() => storage);
  assert.equal(b.get(), true);
  b.set(false);
  assert.equal(createMuteSetting(() => storage).get(), false);
  for (const getStorage of [() => { throw Error('blocked'); }, () => null, () => ({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } })]) {
    const setting = createMuteSetting(getStorage);
    assert.equal(setting.get(), false);
    assert.equal(setting.set(true), true);
    assert.equal(setting.get(), true);
  }
  assert.deepEqual(MUTE_LABEL, { ja: '効果音を消す', en: 'Mute sound effects' });
});

test('動画：部品の段階・作者の時刻、境目の余韻、区間の PCM も再現する', () => {
  const timeline = [0, 1, 2, 3].map((k) => ({ i: 0, k, dur: .5, lead: 9, extension: 100 }));
  const deck = { timeline: () => timeline, slides: [{ _comps: [
    { from: 1, steps: 2, events: (k) => k === 1 ? [note(.25, 60, .75)] : [{ t: 0, sound: 'chime' }] },
    { from: 1, steps: 1, _bad: true, events() { throw Error('must not call'); } },
    { from: 1, steps: 2 },
  ] }] };
  // page.evaluate が受け取る関数も、import などの外側の変数なしで動く。
  const perStep = vm.runInNewContext(`(${collectVideoEvents.toString()})()`, { DECK: deck });
  assert.deepEqual(JSON.parse(JSON.stringify(perStep)), [[], [note(.25, 60, .75)], [{ t: 0, sound: 'chime' }], []]);
  const events = videoSoundEvents(timeline, perStep, 30);
  assert.deepEqual(events, [note(.75, 60, .75), { t: 1, sound: 'chime' }]);
  const full = renderPCM(events, 6000, { duration: 2 });
  for (let n = 0; n < 4; n++) {
    const part = renderStepSounds(events, n * .5, .5, 6000);
    const reference = full.slice(n * 3000, (n + 1) * 3000);
    for (let i = 0; i < part.length; i++) assert.ok(Math.abs(part[i] - reference[i]) < 1e-6);
    assert.deepEqual(bytes(part), bytes(renderStepSounds(events, n * .5, .5, 6000)));
  }
  assert.ok(peak(renderStepSounds([note(.75, 60, .75)], 1, .5, 6000)) > .05);
  assert.deepEqual(videoSoundEvents([{ dur: .51 }], [[note(.52), note(.5)]], 30), [note(.5, 60)]);
});

test('同梱できる形：import なしで DECK.Sounds に収まる（登録は統合作業で行う）', () => {
  const src = fs.readFileSync(new URL('../kit/core/sounds.mjs', import.meta.url), 'utf8');
  const ctx = { DECK: {} };
  vm.runInNewContext(classicNamespace(src, 'Sounds'), ctx);
  assert.equal(typeof ctx.DECK.Sounds.schedule, 'function');
  assert.equal(ctx.DECK.Sounds.midiPitch('C4'), 60);
  const prefs = fs.readFileSync(new URL('../kit/core/sound-preferences.mjs', import.meta.url), 'utf8');
  vm.runInNewContext(classicNamespace(prefs, 'SoundPreferences'), ctx);
  assert.equal(typeof ctx.DECK.SoundPreferences.createMuteSetting, 'function');
  assert.deepEqual(Object.keys(ctx), ['DECK']);
});

console.log(`${count}/${count} passed`);
