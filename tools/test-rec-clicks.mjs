// test-all: unit
// 録音モードの操作音：時刻から範囲を求め、クリックを除いてから無音除去・音量調整（ブラウザなし）。
//   node tools/test-rec-clicks.mjs
import assert from 'node:assert/strict';
import { clickCut, applyClickCut, processTake, trimSilence, cuesFromTaps, SR, PROCESSING } from '../kit/core/audio-core.mjs';
import { shouldAutoStart } from '../app/rec-mode.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// 次に今の台本に合う音声があるとき・読み込めないとき・設定がオフなら待つ。
for (const entry of [{ kind: 'recorded' }, { kind: 'tts' }, { kind: 'imported' }]) {
  assert.equal(shouldAutoStart(true, { state: 'fresh', entry }), false);
  assert.equal(shouldAutoStart(true, { state: 'stale', entry }), true);
  assert.equal(shouldAutoStart(false, { state: 'stale', entry }), false);
}
assert.equal(shouldAutoStart(true, { entry: null }), true);
assert.equal(shouldAutoStart(false, { entry: null }), false);
assert.equal(shouldAutoStart(true, null), false);
console.log('  ok   continuous recording starts only when enabled and next audio is missing or stale');

// 同じ Enter が前の停止と次の開始になる。処理待ちが短い・長い場合、遅い解放も同じ時刻で切る。
for (const startUp of [3080, 3500]) {
  const previous = clickCut({ startEvent: true, startDown: 1000, startUp: 1080, stopDown: 3000, recStart: 1000 }, SR, SR * 3);
  near(previous.tail / SR, 1.97, 1 / SR);
  for (const recStart of [3200, 3700]) {
    const next = clickCut({ startEvent: true, startDown: 3000, startUp, stopDown: 6000, recStart }, SR, SR * 3);
    near(next.head / SR, Math.max(0.03, (Math.max(startUp, 3120) + 30 - recStart) / 1000), 1 / SR);
    near(next.tail / SR, (5970 - recStart) / 1000, 1 / SR);
  }
}
console.log('  ok   shared Enter boundary keeps its keydown and keyup across processing delays');

// performance.now() の時刻（ms）から、onstart を 0 とする元の標本の位置へ。遅いマイクの準備も同じ式。
for (const sr of [44100, 48000]) {
  const n = sr * 3;
  assert.deepEqual(clickCut({ startEvent: true, startDown: 1000, startUp: 1080, stopDown: 3000, recStart: 1020 }, sr, n), { head: Math.ceil(0.13 * sr), tail: Math.floor(1.95 * sr) });
  assert.deepEqual(clickCut({ startEvent: true, startDown: 1000, startUp: 1260, stopDown: 3000, recStart: 1020 }, sr, n), { head: Math.ceil(0.27 * sr), tail: Math.floor(1.95 * sr) });
  assert.deepEqual(clickCut({ startEvent: true, startDown: 1000, stopDown: 3000, recStart: 1000 }, sr, n), { head: Math.ceil(0.15 * sr), tail: Math.floor(1.97 * sr) });
  assert.deepEqual(clickCut({ startEvent: true, startDown: 1000, startUp: null, stopDown: 3000, recStart: 1300 }, sr, n), { head: Math.ceil(0.03 * sr), tail: Math.floor(1.67 * sr) });
  assert.deepEqual(clickCut({ startEvent: true, startDown: 0, startUp: 10, stopDown: null, recStart: 0 }, sr, n), { head: Math.ceil(0.15 * sr), tail: n });
  assert.deepEqual(clickCut({ startEvent: true, startDown: 1000, startUp: 1010, stopDown: 100000, recStart: 1000 }, sr, n), { head: Math.ceil(0.15 * sr), tail: n });
  const fractional = clickCut({ startEvent: true, startDown: 0.01, startUp: 120.03, stopDown: 800.07, recStart: 0 }, sr, n);
  assert.ok(fractional.head / sr >= 0.15003 && fractional.tail / sr <= 0.77007, 'sample rounding keeps the cut inside the safe interval');
}
console.log('  ok   recording origin, early/late/missing release, delayed start, automatic stop and sample rounding');

// 入力の遅れは開始・停止の両方に足す。早く解放されたヘッドセットでも、実際の開始操作には先頭の下限を設ける。
for (const sr of [44100, 48000]) {
  const n = sr * 4;
  const times = { startEvent: true, startDown: 1000, startUp: 1280, stopDown: 3000, recStart: 1100 };
  const zero = clickCut(times, sr, n);
  const delayed = clickCut({ ...times, inputLatency: 150 }, sr, n);
  near((delayed.head - zero.head) / sr, 0.15, 1 / sr);
  near((delayed.tail - zero.tail) / sr, 0.15, 1 / sr);
  for (const startUp of [1080, null]) {
    const early = { startDown: 1000, startUp, recStart: 1500, stopDown: 3000 };
    for (const inputLatency of [0, 150]) {
      const event = clickCut({ ...early, startEvent: true, inputLatency }, sr, n);
      near(event.head / sr, (30 + inputLatency) / 1000, 1 / sr);
      assert.equal(clickCut({ ...early, startEvent: false, inputLatency }, sr, n).head, 0);
      assert.equal(clickCut({ ...early, inputLatency }, sr, n).head, 0, 'no implicit start event');
    }
  }
  const overMax = clickCut({ ...times, inputLatency: 2000 }, sr, n);
  assert.deepEqual(overMax, clickCut({ ...times, inputLatency: 1000 }, sr, n));
  assert.equal(clickCut({ ...times, inputLatency: 150, stopDown: null }, sr, n).tail, n, 'automatic stop has no latency cut');
  assert.deepEqual(clickCut({ ...times, inputLatency: 1000 }, sr, 1), { head: 1, tail: 1 }, 'latency and floor stay within captured samples');
}
for (const inputLatency of [-1, NaN, Infinity, -Infinity, '150', null]) {
  assert.throws(() => clickCut({ startDown: 0, recStart: 0, inputLatency }, SR, SR), RangeError);
}
assert.deepEqual(clickCut({ startDown: 0, recStart: 0, inputLatency: undefined }, SR, SR), clickCut({ startDown: 0, recStart: 0 }, SR, SR));
console.log('  ok   input latency shifts both cuts, validates and clamps; only real start events get the head floor');

// 5 ms・-10 dBFS の操作音（開始直後・解放時・停止の押下と解放）。声は停止の 200 ms 前まで。
// 無音除去だけだと操作音が残ることを確かめ、クリックのない同じ声の処理結果と標本ごとに比べる。
for (const sr of [SR, 48000]) {
  const stop = 2.5, length = Math.round((stop + 0.15) * sr);
  const voice = new Float32Array(length);
  const speechStart = Math.round(0.4 * sr), speechEnd = Math.round((stop - 0.2) * sr);
  for (let i = speechStart; i < speechEnd; i++) {
    const t = (i - speechStart) / sr;
    voice[i] = 0.12 * (0.65 + 0.35 * Math.sin(2 * Math.PI * 3 * t) ** 2) * Math.cos(2 * Math.PI * 180 * t + 0.3 * Math.sin(2 * Math.PI * 0.8 * t));
  }
  const raw = voice.slice();
  const bursts = [0.005, 0.08, stop, stop + 0.08];
  const burstLength = Math.round(0.005 * sr), amp = 10 ** (-10 / 20);
  for (const at of bursts) {
    const begin = Math.round(at * sr);
    for (let j = 0; j < burstLength; j++) raw[begin + j] = amp * (j % 2 ? -1 : 1);
  }
  const rawCopy = raw.slice();
  const uncut = trimSilence(raw, sr);
  assert.ok(uncut.head < bursts[0] * sr && length - uncut.tail > (bursts.at(-1) + 0.005) * sr, 'silence trimming alone retains both start and stop bursts');

  // キーとポインターは同じ時刻の形。解放が来ない場合にも操作音は全て除ける。
  for (const startUp of [10080, null]) {
    const cut = clickCut({ startEvent: true, startDown: 10000, startUp, stopDown: 12500, recStart: 10000 }, sr, length);
    near(cut.head / sr, 0.15);
    near(cut.tail / sr, 2.47);
    const clipped = applyClickCut(raw, cut);
    assert.equal(clipped.reason, null);
    assert.equal(clipped.pcm.length, cut.tail - cut.head);
    for (const at of bursts) {
      const begin = Math.round(at * sr);
      assert.ok(begin + burstLength <= cut.head || begin >= cut.tail, 'no click burst overlaps the kept interval');
    }
    assert.deepEqual(clipped.pcm, voice.slice(cut.head, cut.tail), 'only speech and silence remain before processing');
    const p = processTake([clipped.pcm], sr);
    const clean = processTake([voice], sr);
    assert.deepEqual(p.pcm, clean.pcm, 'after trimming and normalization, the complete speech matches the take without clicks');
    assert.equal(p.dur, clean.dur);
    assert.ok(p.dur >= (speechEnd - speechStart) / sr, 'the speech is kept whole');
    assert.ok(Number.isFinite(p.gainDb) && Math.abs(p.gainDb) > 0.1, 'normalization was applied');
    const headRemoved = cut.head / sr + p.trimmed.head;
    near(headRemoved, clean.trimmed.head, 1 / sr + 0.001);
    const cues = cuesFromTaps([0.8, 1.4], 2, { head: headRemoved, dur: p.dur });
    assert.deepEqual(cues, cuesFromTaps([0.8, 1.4], 2, { head: clean.trimmed.head, dur: clean.dur }), 'cue times include both the click cut and silence trimming');
    console.log(`  ok   ${sr} Hz, ${startUp === null ? 'missing' : 'normal'} release: no bursts, complete speech; head=${cut.head / sr} s, tail=${cut.tail / sr} s`);
  }
  assert.deepEqual(raw, rawCopy, 'cutting does not mutate the source samples');
}

// 停止が開始のカットより早い・開始前に止めた・入力が空：長さは 0、理由を返す。
for (const stopDown of [10, 80, 180]) {
  const cut = clickCut({ startEvent: true, startDown: 0, startUp: null, stopDown, recStart: 0 }, SR, Math.round((stopDown + 150) * SR / 1000));
  const clipped = applyClickCut(new Float32Array(Math.round((stopDown + 150) * SR / 1000)), cut);
  assert.equal(clipped.pcm.length, 0);
  assert.equal(clipped.reason, 'click-cut-empty');
  const p = processTake([clipped.pcm], SR);
  assert.equal(p.dur, 0);
  assert.equal(p.pcm.length, 0);
  assert.ok(cut.head >= 0 && cut.tail >= 0);
}
const emptyCut = clickCut({ startEvent: true, startDown: 0, recStart: 0 }, SR, 0);
assert.deepEqual(emptyCut, { head: 0, tail: 0 });
assert.equal(applyClickCut(new Float32Array(0), emptyCut).reason, 'click-cut-empty');
assert.equal(PROCESSING, 'trim-45-loud-20-cap-v1');
console.log('  ok   very short and empty takes return empty samples with click-cut-empty; PROCESSING is unchanged');
console.log('\nall passed');
