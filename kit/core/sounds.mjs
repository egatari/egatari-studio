// 部品の音（format spec §8.4）。DOM・通信・音声ファイルなし。時刻は秒、PCM はモノラル。
// 不正なイベントは捨て、同じ時刻の順は保つ。呼び手の配列は変えない。
export function midiPitch(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 127) return value;
  if (typeof value !== 'string') return null;
  const p = /^([A-G])([#b♯♭]?)(-?\d+)$/i.exec(value);
  if (!p) return null;
  const n = (Number(p[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[p[1].toUpperCase()]
    + (p[2] === '#' || p[2] === '♯' ? 1 : p[2] ? -1 : 0);
  return Number.isInteger(n) && n >= 0 && n <= 127 ? n : null;
}

export function normalize(events) {
  const out = [];
  if (!Array.isArray(events)) return out;
  for (const e of events) {
    if (!e || !Number.isFinite(e.t) || e.t < 0) continue;
    if (e.sound === 'bell') {
      const count = e.count === undefined ? 1 : e.count;
      if (Number.isInteger(count) && count >= 1 && count <= 3) out.push({ t: e.t, sound: 'bell', count });
    } else if (e.sound === 'chime') out.push({ t: e.t, sound: 'chime' });
    else if (e.sound === 'note') {
      const pitch = midiPitch(e.pitch);
      if (pitch !== null && Number.isFinite(e.dur) && e.dur > 0 && Number.isFinite(e.vel) && e.vel >= 0 && e.vel <= 1
        && Number.isFinite(e.t + e.dur)) out.push({ t: e.t, sound: 'note', pitch, dur: e.dur, vel: e.vel });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// 通常の再生だけで (tPrev, tNow] を拾う。初回の 0 秒は tPrev = -1 で拾える。
// 時刻だけでは跳んだかは判らない。跳ぶ・シークのときは {jump:true} / {seek:true}、または tPrev = null。
export function crossed(events, tPrev, tNow, opts = {}) {
  if (opts.jump || opts.seek || !Number.isFinite(tPrev) || !Number.isFinite(tNow) || tNow <= tPrev) return [];
  return normalize(events).filter((e) => e.t > tPrev && e.t <= tNow);
}

// ライブの延長：倍率、または {duration: 元の長さ, extension: 延長の合計秒}。
// 開始時刻だけを比例して動かす。音の長さ・ベルの間隔は変えず、毎回作者のイベントから計算する。
export function retime(events, timing) {
  let factor = timing;
  if (timing && typeof timing === 'object') {
    const { duration, extension } = timing;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(extension)) throw new RangeError('invalid sound extension');
    factor = Math.max(0, duration + extension) / duration;
  }
  if (!Number.isFinite(factor) || factor < 0) throw new RangeError('invalid sound timing factor');
  return normalize(normalize(events).map((e) => ({ ...e, t: e.t * factor })));
}

// Web Audio と PCM で同じ音色・包絡を使う。ベルは倍音が整数倍でない短い打音。
function voices(events) {
  const out = [];
  const add = (t, dur, freq, amp, type = 'sine', decay = false) => {
    out.push({ t, dur, freq, amp, type, decay, attack: Math.min(.008, dur / 4), release: Math.min(.04, dur / 4) });
  };
  for (const e of normalize(events)) {
    if (e.sound === 'note') {
      const f = 440 * 2 ** ((e.pitch - 69) / 12);
      add(e.t, e.dur, f, .12 * e.vel);
      add(e.t, e.dur, f, .025 * e.vel, 'triangle');
    } else if (e.sound === 'bell') {
      for (let n = 0; n < e.count; n++) {
        add(e.t + n * .6, .95, 660, .13, 'sine', true);
        add(e.t + n * .6, .65, 660 * 2.76, .055, 'sine', true);
        add(e.t + n * .6, .4, 660 * 5.4, .025, 'sine', true);
      }
    } else {
      add(e.t, .55, 880, .12, 'sine', true);
      add(e.t + .12, .7, 1174.659, .12, 'sine', true);
    }
  }
  return out;
}

// 普通の和音はそのまま加算。密な和音でも波形を切らず、重なる音の振幅の上限で全体を下げる。
function headroom(vs) {
  const edges = vs.flatMap((v) => [[v.t, v.amp], [v.t + v.dur, -v.amp]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let sum = 0, peak = 0;
  for (const [, amp] of edges) { sum += amp; peak = Math.max(peak, sum); }
  return peak > .9 ? .9 / peak : 1;
}

function envelope(v, t) {
  if (t < 0 || t >= v.dur) return 0;
  if (t < v.attack) return t / v.attack;
  const end = v.dur - v.release;
  if (t >= end) return (v.decay ? .001 : 1) * (v.dur - t) / v.release;
  return v.decay ? .001 ** ((t - v.attack) / (end - v.attack)) : 1;
}

// when はイベントの 0 秒に当たる AudioContext の時刻。ctx を作る・resume するのは呼び手（P3）。
// opts: {destination, gain:0..1, offset:開始位置の秒}。offset より前から続く音も途中から鳴らす。
// 通常の次の段階では stop しない。戻る・跳ぶ・シーク・ミュートでは保持している全ハンドルを stop する。
export function schedule(ctx, events, when = ctx.currentTime, opts = {}) {
  if (!Number.isFinite(when)) throw new RangeError('invalid sound start');
  const offset = opts.offset ?? 0, volume = opts.gain ?? 1;
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError('invalid sound options');
  const vs = voices(events).filter((v) => v.freq < ctx.sampleRate / 2);
  const scale = headroom(vs) * volume, active = new Set();
  for (const v of vs) {
    const origin = when + v.t - offset, end = origin + v.dur, start = Math.max(ctx.currentTime, origin);
    if (end <= start || !scale || !v.amp) continue;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = v.type; osc.frequency.setValueAtTime(v.freq, start);
    const amp = v.amp * scale, age = start - origin, attackEnd = origin + v.attack, releaseStart = end - v.release;
    gain.gain.setValueAtTime(amp * envelope(v, age), start);
    if (start < attackEnd) gain.gain.linearRampToValueAtTime(amp, attackEnd);
    if (start < releaseStart) {
      if (v.decay) gain.gain.exponentialRampToValueAtTime(amp * .001, releaseStart);
      else gain.gain.setValueAtTime(amp, releaseStart);
    }
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain); gain.connect(opts.destination || ctx.destination);
    const node = { osc, gain };
    active.add(node);
    osc.onended = () => { active.delete(node); osc.disconnect(); gain.disconnect(); };
    osc.start(start); osc.stop(end);
  }
  return { stop() {
    for (const { osc, gain } of active) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.stop(ctx.currentTime);
    }
    active.clear();
  } };
}

// 返り値は Float32Array。既定では 0 秒から最後の余韻まで（ceil で標本数を決める）。
// {start, duration} で区間を書き出せる。同じ全イベントを渡せば、段階の境目でも位相と音量が続く。
export function renderPCM(events, sampleRate, opts = {}) {
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 384000) throw new RangeError('invalid sound sample rate');
  const all = voices(events), vs = all.filter((v) => v.freq < sampleRate / 2);
  const start = opts.start ?? 0, duration = opts.duration ?? Math.max(0, all.reduce((end, v) => Math.max(end, v.t + v.dur), 0) - start);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 0) throw new RangeError('invalid sound PCM window');
  const out = new Float32Array(Math.ceil(duration * sampleRate)), scale = headroom(vs);
  for (const v of vs) {
    const lo = Math.max(0, Math.ceil((v.t - start) * sampleRate));
    const hi = Math.min(out.length, Math.ceil((v.t + v.dur - start) * sampleRate));
    for (let i = lo; i < hi; i++) {
      const age = start + i / sampleRate - v.t, phase = 2 * Math.PI * v.freq * age;
      const wave = v.type === 'triangle' ? 2 / Math.PI * Math.asin(Math.sin(phase)) : Math.sin(phase);
      out[i] += wave * v.amp * scale * envelope(v, age);
    }
  }
  return out;
}

