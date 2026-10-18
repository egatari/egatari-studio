// MP3 にする（LAME を WebAssembly にしたもの：npm の lame-wasm。版は package.json で固定。LAME は LGPL、包みは MIT。NOTICE）。
// LAME はこのリポジトリ（MIT）のコードに組み込まない：呼び手が lame-wasm の init を渡す。編集アプリは配信版の別のファイル
// （dist/vendor/lame-wasm/index.js。手を加えない npm のもの）を、MP3 にするときだけ読み込む（app/mp3-loader.js）。
// 試験（tools/test-audio-core.mjs）は node_modules の lame-wasm を渡す。Node とブラウザのどちらでも動き、ネットワークも fs も使わない
//   encodeMp3(pcm, {init, sr, kbps}) → Promise<Uint8Array>   モノラルの Float32（-1〜1）→ CBR の MP3（設定は kit/core/audio-core.mjs の MP3）
import { MP3 } from './audio-core.mjs';

const CHUNK = 1152 * 64;   // 一度に渡す標本数（LAME の出力の場所が大きくなりすぎない）

export async function encodeMp3(pcm, { init, sr = MP3.sr, kbps = MP3.kbps } = {}) {
  if (typeof init !== 'function') throw new TypeError('encodeMp3: pass the init function of lame-wasm');
  const lame = await init({ channels: 1, sampleRate: sr, kilobitRate: kbps });
  const parts = [];
  try {
    for (let i = 0; i < pcm.length; i += CHUNK) {
      // lame-wasm は Float32Array の buffer の全体を写すので、自分の buffer を持つ写しを渡す
      const part = new Float32Array(pcm.subarray(i, Math.min(pcm.length, i + CHUNK)));
      const out = lame.encodeFloat(part);
      if (out.length) parts.push(out);
    }
    const tail = lame.flush();
    if (tail.length) parts.push(tail);
  } finally { lame.close(); }
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
