// モノラル化・再標本化・WAV の読み書き（純粋な計算。node: も fs も他の module も使わない）。
// audio-core.mjs がここから再び公開する。colab/irodori_node.mjs は audio-core（→ portable → bounded-html → parse5）を引かないよう、こちらだけを読む

// ---------------------------------------------------------------- モノラル・標本化周波数
export function toMono(channels) {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const n = Math.min(...channels.map((c) => c.length)), out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}
// 窓付き sinc による再標本化（lab/irodori.js と同じ。純粋な JS の計算なので、どの PC でも同じ結果になる）
export function resample(x, from, to) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from, fc = Math.min(1, ratio) * 0.97, half = 32 / Math.min(1, ratio);
  const n = Math.round(x.length * ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / ratio;
    let s = 0, w = 0;
    const k0 = Math.max(0, Math.ceil(t - half)), k1 = Math.min(x.length - 1, Math.floor(t + half));
    for (let k = k0; k <= k1; k++) {
      const d = t - k;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * fc * d) / (Math.PI * fc * d);
      const h = fc * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / half));
      s += x[k] * h; w += h;
    }
    y[i] = w ? s / w : 0;
  }
  return y;
}

// ---------------------------------------------------------------- WAV（16 bit・モノラル）
export function encodeWav(pcm, sr) {
  const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  return new Uint8Array(buf);
}
// 16/24/32 bit の整数・32/64 bit の浮動小数の WAV → {channels: [Float32Array…], sr}（WAV でなければ null）
export function decodeWav(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const tag = (o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
  if (u.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= u.length;) {
    const id = tag(o), size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { format: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
      if (fmt.format === 0xfffe && size >= 40) fmt.format = dv.getUint16(o + 32, true);
    }
    if (id === 'data') data = { off: o + 8, size: Math.min(size, u.length - o - 8) };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data || !fmt.ch || !fmt.bits) return null;
  const bps = fmt.bits / 8, n = Math.floor(data.size / (bps * fmt.ch));
  const chans = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  const fl = fmt.format === 3;
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
    const o = data.off + (i * fmt.ch + c) * bps;
    let v;
    if (fl && bps === 4) v = dv.getFloat32(o, true);
    else if (fl && bps === 8) v = dv.getFloat64(o, true);
    else if (bps === 2) v = dv.getInt16(o, true) / 32768;
    else if (bps === 3) v = (u[o] | (u[o + 1] << 8) | (dv.getInt8(o + 2) << 16)) / 8388608;
    else if (bps === 4) v = dv.getInt32(o, true) / 2147483648;
    else if (bps === 1) v = (u[o] - 128) / 128;
    else return null;
    chans[c][i] = v;
  }
  return { channels: chans, sr: fmt.sr };
}

