// 字の切り出し（Node。#178 (4)、handoff/font-subset-design-2026-11-05.md）：本体は kit/core/font-subset-core.mjs（ブラウザの編集アプリと同じもの）。
// ここは node_modules の harfbuzzjs の wasm と wawoff2 の束を読んで渡すだけ。
//   await initSubsetter()；subsetWoff2(bytes, cps) → Uint8Array（woff2）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSubsetter, woff2Ready, KEEP_FEATURES, SUBSET_PINS } from './core/font-subset-core.mjs';

const require = createRequire(import.meta.url);
const HB_WASM = require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
// 字を切り出す道具の版（harfbuzzjs は package.json を exports に出さないので、wasm の隣から読む）
export const SUBSET_TOOL = { harfbuzzjs: JSON.parse(fs.readFileSync(path.join(path.dirname(HB_WASM), '..', 'package.json'), 'utf8')).version, wawoff2: require('wawoff2/package.json').version };
export { KEEP_FEATURES, SUBSET_PINS };

let S = null;
// 初めて使うときに読む（wasm の初期化。wawoff2 の emscripten は非同期なので動き出すのを待ってから同期で呼ぶ）
export async function initSubsetter() {
  if (S) return;
  const c = require('wawoff2/build/compress_binding.js');
  const d = require('wawoff2/build/decompress_binding.js');
  await Promise.all([woff2Ready(c), woff2Ready(d)]);
  S = await createSubsetter({ hbWasm: fs.readFileSync(HB_WASM), woff2: { compress: (b) => c.compress(b), decompress: (b) => d.decompress(b) } });
}
export const subsetterReady = () => !!S;
export function subsetWoff2(bytes, cps) {
  if (!S) throw new Error('font subsetter is not initialised (initSubsetter)');
  return S.subsetWoff2(bytes, cps);
}
// {woff2, cps}：cps は切り出した字が本当に持つ字（kit/core/font-subset-core.mjs の subset）
export function subsetFace(bytes, cps) {
  if (!S) throw new Error('font subsetter is not initialised (initSubsetter)');
  return S.subset(bytes, cps);
}
