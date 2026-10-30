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

// コマ数に丸めた動画の段階の境目に置く。延長・ミュート・ナレーションの lead は使わない。
// 前の段階の音も全イベントに残すので、次のクリップに余韻が続く。
export function videoSoundEvents(timeline, perStep, fps) {
  let frames = 0;
  const out = [];
  timeline.forEach((s, n) => {
    for (const e of normalize(perStep[n])) if (e.t <= s.dur) out.push({ ...e, t: frames / fps + e.t });
    frames += Math.max(1, Math.round(s.dur * fps));
  });
  return normalize(out);
}

export function renderStepSounds(events, start, duration, sampleRate = 44100) {
  return renderPCM(events, sampleRate, { start, duration });
}
