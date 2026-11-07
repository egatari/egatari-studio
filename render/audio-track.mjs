// 動画の音声を 1 本の続いた音にする（純粋な計算。ffmpeg もファイルも使わない。render.mjs が使う）
//
// 段階ごとの音声を、積み上げた時間（DECK.timeline() の start。コマに丸めない）の標本の位置にそのまま置く。
// クリップの音はこの 1 本から、コマの境目で切った続きの区間を取り出す。継ぎ目で標本がずれない・跳ばない・途切れない。
//   trackLayout(tl, fps, sr)              → {sr, starts（コマ）, total（標本の数）, frameSample(f), stepRange(n)}
//   placeNarration(ch, pcm, from, to)     → 置いた標本の数（[from, to) より先は切る）
//   narrationWindows(tl)                  → [[開始, 終わり]（秒）]：台本の声が鳴る区間（背景の音楽を下げる）
//   musicGain(windows, n, sr, opts)       → Float32Array：背景の音楽の音量（声の下で下げ、終わりで消える。決まった式で毎回同じ）
//   limitPeaks(channels, limit, sr)       → 変えた標本があるか（先を読む上限。決まった式で毎回同じ）
import { frameStarts } from './sounds.mjs';

export const VIDEO_SR = 48000;   // 動画の音声の標本化周波数（30・25・24・60 fps でコマあたりの標本が整数）

export function trackLayout(tl, fps, sr = VIDEO_SR) {
  const starts = frameStarts(tl, fps);
  const frameSample = (f) => Math.round((f * sr) / fps);
  const at = (sec) => Math.round(+(sec * sr).toFixed(6));
  return {
    sr, starts, total: frameSample(starts.at(-1)), frameSample,
    // 段階 n の正しい区間（標本）。次の段階の始まりで終わる（コマの丸めは入れない）
    stepRange: (n) => [at(tl[n].start), n + 1 < tl.length ? at(tl[n + 1].start) : at(tl[n].start + tl[n].dur)],
    at,
  };
}

// pcm を ch[from …] に足す（to より先は捨てる）。足した数を返す
export function placeNarration(ch, pcm, from, to) {
  const end = Math.min(to, ch.length, from + pcm.length);
  for (let i = Math.max(0, from); i < end; i++) ch[i] += pcm[i - from];
  return Math.max(0, end - Math.max(0, from));
}

// 台本の声が鳴る区間（秒）。lead のあとから、音声の長さか段階の終わりの早いほうまで
export function narrationWindows(tl) {
  const out = [];
  for (const s of tl) {
    if (!s.audio || !(s.audioDur > 0)) continue;
    const a = s.start + (s.lead || 0), b = Math.min(a + s.audioDur, s.start + s.dur);
    if (b > a) out.push([a, b]);
  }
  return out;
}

// 背景の音楽の音量（標本ごと）。base：声のないときの倍率、duck：声の間にさらに掛ける倍率、
// attack：声の前に下げ始める秒、release：声のあとに戻す秒、gap：これより短い声の切れ目では戻さない、fadeOut：終わりで消す秒
export const MUSIC = Object.freeze({ duckDb: -12, attack: 0.25, release: 0.6, gap: 0.8, fadeIn: 0.05, fadeOut: 3, targetRms: 0.05, maxGainDb: 12 });
export function musicGain(windows, n, sr, opts = {}) {
  const o = { ...MUSIC, base: 1, ...opts };
  const duck = 10 ** (o.duckDb / 20);
  // 近い区間はつなぐ（短い間で音楽が上がり下がりしない）
  const ws = [];
  for (const [a, b] of [...windows].sort((x, y) => x[0] - y[0])) {
    if (ws.length && a - ws.at(-1)[1] < o.gap) ws.at(-1)[1] = Math.max(ws.at(-1)[1], b);
    else ws.push([a, b]);
  }
  const g = new Float32Array(n);
  const T = n / sr, fo = Math.min(o.fadeOut, T / 3);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (w < ws.length && ws[w][1] + o.release < t) w++;
    // 声に下げる量 d（0〜1）：区間の中で 1、前の attack 秒と後の release 秒で直線
    let d = 0;
    for (let j = w; j < ws.length && ws[j][0] - o.attack <= t; j++) {
      const [a, b] = ws[j];
      const x = t < a ? 1 - (a - t) / o.attack : t <= b ? 1 : 1 - (t - b) / o.release;
      if (x > d) d = x;
    }
    let v = o.base * (1 - d * (1 - duck));
    if (o.fadeIn > 0 && t < o.fadeIn) v *= t / o.fadeIn;
    if (fo > 0 && t > T - fo) v *= Math.max(0, (T - t) / fo);
    g[i] = v;
  }
  return g;
}

// 背景の音楽の基準の倍率：RMS を targetRms に（上げるのは maxGainDb まで）
export function musicBase(channels, o = MUSIC) {
  let s = 0, n = 0;
  for (const c of channels) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length; }
  const rms = n ? Math.sqrt(s / n) : 0;
  return rms > 1e-6 ? Math.min(10 ** (o.maxGainDb / 20), o.targetRms / rms) : 0;
}

// 上限を超える標本の前後 win だけ音量を下げる（先読みあり。どの標本も |x| ≤ limit になる）。
// 要る倍率 r[i] = min(1, limit/|x|) の ±win の最小を、幅 win の移動平均でならす：平均する範囲のどの最小も r[i] 以下なので、結果も r[i] 以下
export function limitPeaks(channels, limit = 0.98, sr = VIDEO_SR, ms = 5) {
  const n = channels[0].length, win = Math.max(1, Math.round((sr * ms) / 1000));
  let peak = 0;
  for (const c of channels) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  if (peak <= limit) return false;
  const r = new Float32Array(n).fill(1);
  for (const c of channels) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > limit) r[i] = Math.min(r[i], limit / a); }
  // ±win の最小（単調な待ち行列）
  const m = new Float32Array(n), q = new Int32Array(n + 2 * win + 1);
  let h = 0, tl = 0, j = 0;
  for (let i = 0; i < n; i++) {
    for (; j < n && j <= i + win; j++) { while (tl > h && r[q[tl - 1]] >= r[j]) tl--; q[tl++] = j; }
    while (q[h] < i - win) h++;
    m[i] = r[q[h]];
  }
  // 幅 win の移動平均（中央。端は 1 で埋める）
  const half = Math.floor(win / 2), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + m[i];
  for (let i = 0; i < n; i++) {
    const a = i - half, b = i - half + win;   // [a, b)
    const sum = pre[Math.min(n, b)] - pre[Math.max(0, a)] + Math.max(0, -a) + Math.max(0, b - n);
    const gi = Math.min(sum / win, r[i]);
    for (const c of channels) c[i] *= gi;
  }
  return true;
}
