// 段階の音声の後処理と記録（編集アプリの音声の板 app/audio-panel.js と、試験・道具が共有する。node: も fs も使わない）
//
// 後処理は tts/core.py と同じ意図・同じ数にする（同じ入力なら、同じ長さ・同じ音量の音声になる。tools/test-audio-core.mjs が
// ffmpeg と比べる）：
//   モノラル（チャンネルの平均）→ 44.1 kHz（窓付き sinc）→ 前後の無音を削る（-45 dB、20 ms の窓の RMS、削った後に 50 ms 残す。
//   ffmpeg の silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB を前と、逆にして後ろに）→
//   音量を -20 LUFS に（EBU R128 / ITU-R BS.1770 の積分ラウドネスを測り、一律のゲインで当てる。ffmpeg の loudnorm の linear=true）
//   違い：ffmpeg の loudnorm は、一律のゲインでトゥルーピークが -1.5 dBTP を超えるときは動的な処理に切り替える（抑揚が変わる）。
//   ここでは切り替えず、ピークが -1.5 dBTP になるところでゲインを止める（小さめになるが、抑揚は変えない）
// 行間：同じ段階の中の発言（ターン）の間に PAUSE_MS の無音（tts/synth.py と同じ。{cue} の区切りの間には入れない）。
// 段階の末尾の間（pad_after）は実行系が足すので、音声には付けない
//
//   processTake(channels, sr)              → {pcm: Float32Array（44.1 kHz モノラル）, sr, dur, gainDb, loudness, peakDb, trimmed: {head, tail}}
//   joinParts(turns, sr)                    turns：[[Float32Array…]…]（ターンごとの {cue} の部分）→ {pcm, cues}
//   integratedLoudness(pcm, sr)             LUFS（測れなければ null）
//   truePeakDb(pcm)                         4 倍の補間で見たピーク（dBTP）
//   encodeWav(pcm, sr) / decodeWav(bytes)   16 bit の WAV
//   clickCut(times, sr, length) / applyClickCut(pcm, cut)   録音の開始・停止の操作音を除く範囲と、その適用
//   cuesFromTaps(taps, n, {head, dur})      録音中に C で置いた時刻 → 音声の cue（数が n と違えば sync none）
//   takeEntry({...})                        audio/manifest.json の段階の記録（kind・inputHash・recipe・sync。format spec §5）
//   setManifestEntry(text, key, entry, order)   manifest の文字列に段階の記録を入れる（ほかの段階の記録はそのまま）
//   audioState(entry, seg, segJson)         'fresh' | 'stale' | 'unknown'（§5.4。inputHash の無い manifest は TTS の控えの digest で）

export const SR = 44100;                 // tts/core.py の normalize_level・concat と同じ（-ar 44100）
export const PAUSE_MS = 350;             // tts/core.py の PAUSE_MS
export const TRIM = Object.freeze({ thresholdDb: -45, keepS: 0.05, windowS: 0.02 });   // TRIM_THRESHOLD・TRIM_KEEP_S（窓は silenceremove の既定）
export const TARGET = Object.freeze({ lufs: -20, tpDb: -1.5, lra: 11 });               // TARGET_LUFS・TARGET_TP_DB・TARGET_LRA
// MP3：組み立ての AAC（64 kbps・モノラル）と同じ大きさの見当。delaySamples：LAME の符号化の遅れ 576 と、復号の遅れ 529（LAME の
// 情報フレームを書かないので、ブラウザと ffmpeg の復号器は先頭のこれだけを余分に出す。tools/test-audio-core.mjs と test-audio.mjs が測る）。
// その秒数を記録の startOffset（format spec §5.2）に書き、実行系はそこから鳴らす
export const MP3 = Object.freeze({ kbps: 64, sr: SR, channels: 1, delaySamples: 576 + 529, startOffset: Math.round(((576 + 529) / SR) * 1e6) / 1e6 });
// 後処理の版（記録の recipe.processing。数を変えたら名前も変える。format spec §5.2 の例と同じ形）
// tts/core.py と同じ数だが、トゥルーピークが -1.5 dBTP を超えるところで ffmpeg の loudnorm は動的な処理に切り替え、ここは一律のゲインを
// 止める（cap）。振る舞いが違うので、tts/core.py の音とは別の名前にする
export const PROCESSING = 'trim-45-loud-20-cap-v1';
// 1 つの音声の上限：長さ（秒）と、読む・書くバイト数（取り込む音声のファイル・作業場所の音声）
export const AUDIO_LIMITS = Object.freeze({ maxSeconds: 600, fileBytes: 64 * 1048576 });

import { inputHash, sha256Hex } from './portable.mjs';
import { toMono, resample, encodeWav, decodeWav } from './wav-core.mjs';
export { toMono, resample, encodeWav, decodeWav };   // 置き場は wav-core.mjs（portable.mjs → parse5 の鎖を引かずに使えるように。colab/irodori_node.mjs）

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// 録音モードの操作音を除く範囲（[head, tail)。元の標本化周波数での位置）。時刻は performance.now() と同じミリ秒。
// recStart は MediaRecorder.onstart の時刻。解放が来なければ押下から 120 ms、そこからさらに 30 ms を除く。
// inputLatency は入力の遅れ（ms、最大 1 秒）。実際の開始操作があれば、開始前に解放されても先頭の 30 ms と遅れを除く。
// processTake の前に録音モードだけが使う（TTS・取り込みの後処理と PROCESSING の名前は変えない）。
export function clickCut({ startDown, startUp, stopDown, recStart, startEvent = false, inputLatency = 0 }, sampleRate, length) {
  if (![startDown, recStart, sampleRate, length, inputLatency].every(Number.isFinite) || sampleRate <= 0 || length < 0 || !Number.isInteger(length) || inputLatency < 0) throw new RangeError('invalid click-cut timeline');
  inputLatency = Math.min(1000, inputLatency);
  const clamp = (n) => Math.max(0, Math.min(length, n));
  const up = Number.isFinite(startUp) ? startUp : startDown + 120;
  const headMs = Math.max(startEvent ? 30 : -Infinity, Math.max(up, startDown + 120) + 30 - recStart) + inputLatency;
  const head = clamp(Math.ceil(headMs * sampleRate / 1000));
  const tail = Number.isFinite(stopDown) ? clamp(Math.floor((stopDown - 30 - recStart + inputLatency) * sampleRate / 1000)) : length;
  return { head, tail };
}
// 範囲が重なる短い録音は空にし、理由を返す（slice の負の位置・長さに頼らない）。入力は変えない。
export function applyClickCut(samples, { head, tail }) {
  const pcm = tail > head ? samples.slice(head, tail) : new Float32Array(0);
  return { pcm, reason: pcm.length ? null : 'click-cut-empty' };
}

// ---------------------------------------------------------------- 無音を削る（silenceremove の rms 検出と同じ：直前の窓の RMS がしきい値を超えた所）
// 返すもの：音のある最初の標本の位置（なければ -1）
function onset(x, sr, step) {
  const win = Math.max(1, Math.round(TRIM.windowS * sr)), thr = Math.pow(10, TRIM.thresholdDb / 20), thr2 = thr * thr * win;
  let sum = 0;
  const n = x.length;
  for (let j = 0; j < n; j++) {
    const i = step > 0 ? j : n - 1 - j;
    sum += x[i] * x[i];
    if (j >= win) { const o = step > 0 ? j - win : n - 1 - (j - win); sum -= x[o] * x[o]; }
    if (sum > thr2) return j;
  }
  return -1;
}
export function trimSilence(x, sr) {
  const keep = Math.round(TRIM.keepS * sr);
  const a = onset(x, sr, 1);
  if (a < 0) return { pcm: new Float32Array(0), head: x.length, tail: 0 };
  const b = onset(x, sr, -1);
  const start = Math.max(0, a - keep), end = Math.min(x.length, x.length - b + keep);
  return { pcm: x.slice(start, end), head: start, tail: x.length - end };
}

// ---------------------------------------------------------------- ラウドネス（ITU-R BS.1770-4。K 特性の係数は標本化周波数から作る：libebur128 と同じ式）
function kWeight(sr) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const pre = { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  const rlb = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  return [pre, rlb];
}
function biquad(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const v = x[n], o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    y[n] = o; x2 = x1; x1 = v; y2 = y1; y1 = o;
  }
  return y;
}
// 積分ラウドネス（LUFS）。400 ms の区間を 100 ms ずつずらし、-70 LUFS の絶対ゲートと -10 LU の相対ゲート。短すぎる・無音なら null
export function integratedLoudness(x, sr) {
  let d = x;
  for (const f of kWeight(sr)) d = biquad(d, f);
  const block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  if (d.length < block) return null;
  const z = [];
  // 累積和で区間の平均を取る（区間は 400 ms をまるごと含むものだけ）
  const cum = new Float64Array(d.length + 1);
  for (let i = 0; i < d.length; i++) cum[i + 1] = cum[i] + d[i] * d[i];
  for (let s = 0; s + block <= d.length; s += hop) z.push((cum[s + block] - cum[s]) / block);
  const L = (e) => -0.691 + 10 * Math.log10(e);
  const abs = z.filter((e) => e > 0 && L(e) > -70);
  if (!abs.length) return null;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const keep = abs.filter((e) => L(e) > rel);
  if (!keep.length) return null;
  return L(keep.reduce((a, b) => a + b, 0) / keep.length);
}
// トゥルーピーク（dBTP）：4 倍に補間した波形の絶対値の最大（BS.1770 の考え方。補間は窓付き sinc の 48 タップ）
export function truePeakDb(x) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v; }
  const OS = 4, HALF = 12;
  const taps = [];
  for (let p = 1; p < OS; p++) {
    const frac = p / OS, t = [];
    for (let k = -HALF + 1; k <= HALF; k++) {
      const d = k - frac, sinc = Math.sin(Math.PI * d) / (Math.PI * d);
      t.push(sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / HALF)));
    }
    taps.push(t);
  }
  for (let i = 0; i + 1 < x.length; i++) {
    // 隣の標本の片方でも大きくなければ、その間の補間がピークを超えることは少ない：大きな所だけ調べる（ピークの 1/2 以上）
    if (Math.max(Math.abs(x[i]), Math.abs(x[i + 1])) < peak * 0.5) continue;
    for (const t of taps) {
      let s = 0;
      for (let k = -HALF + 1, j = 0; k <= HALF; k++, j++) { const idx = i + k; if (idx >= 0 && idx < x.length) s += x[idx] * t[j]; }
      const v = Math.abs(s); if (v > peak) peak = v;
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
// 音量を揃える：測れないもの（短すぎる・無音）はそのまま（tts/core.py と同じ：音が消えるよりはレベルが揃わないほうがよい）
export function normalizeLevel(x, sr) {
  const loud = integratedLoudness(x, sr);
  if (loud === null || !Number.isFinite(loud)) return { pcm: Float32Array.from(x), gainDb: 0, loudness: loud, peakDb: truePeakDb(x) };
  const tp = truePeakDb(x);
  let gainDb = TARGET.lufs - loud;
  if (Number.isFinite(tp) && tp + gainDb > TARGET.tpDb) gainDb = TARGET.tpDb - tp;
  const g = Math.pow(10, gainDb / 20), out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return { pcm: out, gainDb, loudness: loud, peakDb: tp + gainDb };
}

// ---------------------------------------------------------------- 1 つの音声（録音・TTS の 1 行・取り込んだファイル）を整える
export function processTake(channels, sr, { normalize = true, trim = true } = {}) {
  let x = toMono(channels);
  if (x.length > AUDIO_LIMITS.maxSeconds * sr) throw Object.assign(new Error(`audio longer than ${AUDIO_LIMITS.maxSeconds} s`), { code: 'audio-too-long' });
  x = resample(x, sr, SR);
  let head = 0, tail = 0;
  if (trim) { const t = trimSilence(x, SR); x = t.pcm; head = t.head; tail = t.tail; }
  const n = normalize ? normalizeLevel(x, SR) : { pcm: x, gainDb: 0, loudness: integratedLoudness(x, SR), peakDb: truePeakDb(x) };
  return { pcm: n.pcm, sr: SR, dur: round3(n.pcm.length / SR), gainDb: n.gainDb, loudness: n.loudness, peakDb: n.peakDb, trimmed: { head: round3(head / SR), tail: round3(tail / SR) } };
}
const round3 = (v) => Math.round(v * 1000) / 1000;

// 段階の音声：ターンの間に PAUSE_MS の無音。cues は 2 つ目からの {cue} の部分の始まり（秒。tts/synth.py の synth_segment と同じ）
export function joinParts(turns, sr = SR) {
  const pause = Math.round((PAUSE_MS / 1000) * sr);
  const pieces = [], cues = [];
  let n = 0;
  turns.forEach((parts, ti) => {
    if (ti > 0 && pause > 0) { pieces.push(new Float32Array(pause)); n += pause; }
    parts.forEach((p, pi) => {
      if (pi > 0) cues.push(round3(n / sr));
      if (p && p.length) { pieces.push(p); n += p.length; }
    });
  });
  const out = new Float32Array(n);
  let o = 0;
  for (const p of pieces) { out.set(p, o); o += p.length; }
  return { pcm: out, cues, dur: round3(n / sr) };
}

// 録音中に C を押した時刻（録音の始めからの秒。生の時刻）を、後処理した音声の cue にする（録音モード。#47・#24）。
// head：後処理で前から削った秒（processTake の trimmed.head）、dur：後処理した音声の長さ。時刻は head を引いて [0, dur] に収める。
// 押した数が区切りの数 n と違う・時刻が前後する・n が 0 なら sync none（cues なし）：間違った同期は作らない（format spec §5.3）。
// 戻り値：{sync: 'manual', cues} か {sync: 'none', cues: null, taps（押した数）}
export function cuesFromTaps(taps, n, { head = 0, dur = Infinity } = {}) {
  const t = Array.isArray(taps) ? taps.filter((x) => typeof x === 'number' && Number.isFinite(x)) : [];
  if (!(n > 0) || t.length !== n || t.some((x, j) => j > 0 && x < t[j - 1])) return { sync: 'none', cues: null, taps: t.length };
  const hi = Number.isFinite(dur) ? dur : Infinity;
  return { sync: 'manual', cues: t.map((x) => round3(Math.max(0, Math.min(hi, x - head)))) };
}

// ---------------------------------------------------------------- 記録（audio/manifest.json の段階。format spec §5：kind・inputHash・recipe・sync）
// source：{kind: 'recorded' | 'tts' | 'imported', recipe?（tts のとき。engine・model・voice・seed・dictionary・processing）}
// cues：{cue} の区切りの時刻（TTS で部分ごとに作ったとき）。録音・取り込みは区切りを置いていないので sync "none"（cues は空）
// processing：後処理の版（すべての種類。§5.2）。startOffset：符号化の遅れ（MP3 のとき。0 なら書かない）。
// 機器の名前・元のファイル名など人を特定しうる記録は書かない（§3.6。ここに渡す項目はこれだけ）
// sync：'manual'（録音中に C で置いた cue。cues が配列のときだけ）を渡せる。渡さなければ cues があれば auto、なければ none
export function takeEntry({ file, dur, cues = null, kind, inputHash, recipe = null, processing = PROCESSING, startOffset = 0, sync = null }) {
  if (!['recorded', 'tts', 'imported'].includes(kind)) throw new Error('bad take kind: ' + kind);
  if (!(typeof dur === 'number' && dur > 0)) throw Object.assign(new Error('the take is empty (no sound after trimming silence)'), { code: 'audio-empty' });
  const e = { file, dur: round3(dur), cues: Array.isArray(cues) ? cues.slice() : [] };
  e.sync = sync === 'manual' && Array.isArray(cues) ? 'manual' : Array.isArray(cues) ? 'auto' : 'none';
  if (kind === 'tts') { if (!isObj(recipe)) throw new Error('tts take without recipe'); e.engine = String(recipe.engine); }
  e.kind = kind;
  e.inputHash = typeof inputHash === 'string' ? inputHash : null;
  if (kind === 'tts') e.recipe = recipe;
  if (typeof processing === 'string') e.processing = processing;
  if (typeof startOffset === 'number' && startOffset > 0 && startOffset <= 1) e.startOffset = startOffset;
  return e;
}
// manifest の文字列（なければ null）に、段階 key の記録を入れる（ほかの段階の記録はそのまま。並びは order（口述原稿の段階の順）に）。
// 形の違う manifest（JSON でない・segments が object でない）は断る（上書きして消さない）
export function setManifestEntry(text, key, entry, order = []) {
  let man = { segments: {} };
  if (text != null && String(text).trim()) {
    man = JSON.parse(text);
    if (!isObj(man) || (own(man, 'segments') && !isObj(man.segments))) throw Object.assign(new Error('audio/manifest.json is not {segments: {...}}'), { code: 'bad-manifest' });
    if (!own(man, 'segments')) man.segments = {};
  }
  const seg = { ...man.segments };
  if (entry === null) delete seg[key]; else seg[key] = entry;
  // 口述原稿の順。口述原稿にない段階は、今の並びのまま後ろに
  const pos = new Map(order.map((k, i) => [k, i]));
  const was = new Map(Object.keys(seg).map((k, i) => [k, i]));
  const rank = (k) => (pos.has(k) ? pos.get(k) : 1e9 + was.get(k));
  const keys = Object.keys(seg).sort((a, b) => rank(a) - rank(b));
  man.segments = Object.fromEntries(keys.map((k) => [k, seg[k]]));
  return JSON.stringify(man, null, 1) + '\n';
}
// 音声のファイルの名前：中身の sha256 の先頭 16 字（同じ中身は同じ名前。前の取り直しのファイルは消さない：tts/synth.py と同じ）
export const takeFileName = (kind, sha256, ext = 'mp3') => `${kind === 'tts' ? 'tts' : kind === 'imported' ? 'imp' : 'rec'}_${String(sha256).slice(0, 16)}.${ext}`;

// tts/synth.py の音声の digest（kit/narration.mjs の segDigest と同じ値。ブラウザでも作れるように Web Crypto で）
export const segDigest = async (seg, voice = {}) => (await sha256Hex(JSON.stringify({ turns: seg.turns.map((t) => [t.role, t.ttsParts]), voice }))).slice(0, 12);
// 音声が今の口述原稿に合っているか（§5.4）。entry：manifest の段階の記録、seg：今の口述原稿のその段階（parseNarration。なければ古い）、
// segJson：audio/seg_<digest>.json（任意。tts/synth.py の控え）
//   inputHash がある → 合えば 'fresh'、違えば 'stale'。null → 'stale'（分からない）。無い（tts/synth.py の manifest）→ 控えの声で digest を
//   作り直して比べ、控えがなければ 'unknown'（知らせない）
export async function audioState(entry, seg, segJson = null) {
  if (!isObj(entry)) return 'unknown';
  if (!seg) return 'stale';
  if (own(entry, 'inputHash')) {
    if (entry.inputHash === null) return 'stale';
    return entry.inputHash === await inputHash(seg) ? 'fresh' : 'stale';
  }
  if (isObj(segJson) && isObj(segJson.voice) && typeof entry.digest === 'string') return (await segDigest(seg, segJson.voice)) === entry.digest ? 'fresh' : 'stale';
  return 'unknown';
}
