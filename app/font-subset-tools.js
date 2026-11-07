// 字の切り出しの道具（ブラウザ。#178 (4)）：tools/build-app.mjs が 1 本にまとめ（大域の名前 __egatariFontSubset）、書き出すときにだけ読み込む（app/font-subset-loader.js）。
// 中身は Node と同じ本体（kit/core/font-subset-core.mjs）・同じ harfbuzz の wasm（harfbuzzjs の harfbuzz-subset.wasm）・同じ woff2 の束（wawoff2 の emscripten の束）。
// 同じ分割ファイルと同じ字なら、コマンドの組み立てとバイトまで同じ woff2 になる（tools/test-app.mjs が確かめる）
//   const s = await __egatariFontSubset.init()；s.subsetFont(bytes, cps) → {b64, cps}（kit/core/build-core.mjs の env.subsetFont）
import { createSubsetter, woff2Ready, bytesToBase64, SUBSET_PINS } from '../kit/core/font-subset-core.mjs';
import hbWasm from 'virtual:hb-subset-wasm';
import compressModule from 'virtual:woff2-compress';
import decompressModule from 'virtual:woff2-decompress';

let ready = null;
export const pins = SUBSET_PINS;
export function init() {
  if (!ready) {
    ready = (async () => {
      await Promise.all([woff2Ready(compressModule), woff2Ready(decompressModule)]);
      const s = await createSubsetter({ hbWasm, woff2: { compress: (b) => compressModule.compress(b), decompress: (b) => decompressModule.decompress(b) } });
      return { subsetWoff2: s.subsetWoff2, subsetFont: (bytes, cps) => { const r = s.subset(bytes, cps); return { b64: bytesToBase64(r.woff2), cps: r.cps }; } };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}
