// 動画用の音。ブラウザから作者のイベントだけを取り出し、Node で PCM にする。
import { normalize, renderPCM } from '../kit/core/sounds.mjs';

// page.evaluate に関数のまま渡すため、外の変数・import は使わない。Node の試験では deck を渡す。
export function collectVideoEvents(deck = globalThis.DECK) {
  return deck.timeline().map((s) => {
    const out = [];
    for (const c of deck.slides[s.i]._comps || []) {
      const k = s.k - c.from + 1;
      if (c._bad || k < 1 || k > c.steps || typeof c.events !== 'function') continue;
      try {
        const events = c.events(k);
        if (Array.isArray(events)) for (const e of events) {
          if (e && typeof e === 'object') out.push({ t: e.t, sound: e.sound, count: e.count, pitch: e.pitch, dur: e.dur, vel: e.vel });
        }
      } catch (e) { console.warn(`[${c.localName || 'component'}] events(${k}): ${e.message || e}`); }
    }
    return out;
  });
}

// 段階の境目のコマ：累積の開始時刻をコマに丸める（段階ごとに丸めて足すと、誤差がたまってずれる）。
// 返り値は timeline.length + 1 個（最後は全体のコマ数）。どの段階も 1 コマ以上で、境目は正しい時刻から ±1 コマ以内。
export function frameStarts(timeline, fps) {
  const out = [0];
  let t = 0;
  for (const s of timeline) {
    t += s.dur;
    out.push(Math.max(out.at(-1) + 1, Math.round(+(t * fps).toFixed(6))));
  }
  return out;
}

// 段階の正しい累積の開始時刻（コマに丸めない）に置く。延長・ミュート・ナレーションの lead は使わない。
// 映像の境目とは半コマ以内でずれるが、音の間隔は丸めの影響を受けず、ずれがたまらない。
// 前の段階の音も全イベントに残すので、次のクリップに余韻が続く。
export function videoSoundEvents(timeline, perStep, fps) {
  let start = 0;
  const out = [];
  timeline.forEach((s, n) => {
    for (const e of normalize(perStep[n])) if (e.t <= s.dur) out.push({ ...e, t: start + e.t });
    start += s.dur;
  });
  return normalize(out);
}

export function renderStepSounds(events, start, duration, sampleRate = 44100) {
  return renderPCM(events, sampleRate, { start, duration });
}
