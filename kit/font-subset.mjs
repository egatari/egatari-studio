// 字の絞り込み（Node。#178 (4)、handoff/font-subset-design-2026-11-05.md）：@fontsource の分割ファイル（woff2）1 つを、
// 教材が使う字だけに絞った woff2 にする。Python も TTF も使わない：harfbuzz の hb-subset（wasm、harfbuzzjs）と woff2 の圧縮（wasm、wawoff2）。
//   subsetWoff2(bytes, cps) → Uint8Array（woff2）。cps：字の番号の配列（順は問わない。中で小さい順に並べ、重ねを除く）
// 同じ入力（分割ファイルのバイトと字の集まり）なら同じバイトを返す（組み立ての再現性。字を集めた順にもよらない）。
// 残す配置の機能（GSUB）：ccmp・liga・vert・vrt2・vkna・ruby（縦書きの約物・ルビ。分割ファイルが持つのは vert・vrt2 ほど）。ヒントは除く（pyftsubset の --no-hinting と同じ）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HB_WASM = require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
// 字を絞る道具の版（harfbuzzjs は package.json を exports に出さないので、wasm の隣から読む）
export const SUBSET_TOOL = { harfbuzzjs: JSON.parse(fs.readFileSync(path.join(path.dirname(HB_WASM), '..', 'package.json'), 'utf8')).version, wawoff2: require('wawoff2/package.json').version };
export const KEEP_FEATURES = Object.freeze(['ccmp', 'liga', 'vert', 'vrt2', 'vkna', 'ruby']);

const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1;
const tag = (s) => [...s].reduce((a, c) => ((a << 8) | c.charCodeAt(0)) >>> 0, 0);

let hb = null, woff2 = null;
// 初めて使うときに読む（wasm の初期化。harfbuzz は同期、wawoff2 の emscripten は非同期なので init を待ってから同期で呼ぶ）
export async function initSubsetter() {
  if (hb && woff2) return;
  const wasm = fs.readFileSync(HB_WASM);
  hb = new WebAssembly.Instance(new WebAssembly.Module(wasm), {}).exports;
  hb._initialize();
  const c = require('wawoff2/build/compress_binding.js');
  const d = require('wawoff2/build/decompress_binding.js');
  await Promise.all([c, d].map((m) => (m.calledRun ? null : new Promise((r) => { m.onRuntimeInitialized = r; }))));
  woff2 = { compress: c.compress, decompress: d.decompress };
}
export const subsetterReady = () => !!(hb && woff2);

export function subsetWoff2(bytes, cps) {
  if (!subsetterReady()) throw new Error('font subsetter is not initialised (initSubsetter)');
  const sfnt = woff2.decompress(bytes);
  if (!sfnt) throw new Error('woff2 decompress failed');
  const heap = () => new Uint8Array(hb.memory.buffer);
  const buf = hb.malloc(sfnt.byteLength);
  heap().set(sfnt, buf);
  const blob = hb.hb_blob_create(buf, sfnt.byteLength, 2 /* writable */, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  try {
    const feats = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
    hb.hb_set_clear(feats);
    for (const f of KEEP_FEATURES) hb.hb_set_add(feats, tag(f));
    hb.hb_subset_input_set_flags(input, hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_HINTING);
    const uni = hb.hb_subset_input_unicode_set(input);
    for (const c of [...new Set(cps)].sort((a, b) => a - b)) hb.hb_set_add(uni, c);
    const sub = hb.hb_subset_or_fail(face, input);
    if (!sub) throw new Error('hb_subset_or_fail failed');
    const res = hb.hb_face_reference_blob(sub);
    const off = hb.hb_blob_get_data(res, 0), len = hb.hb_blob_get_length(res);
    const ttf = heap().slice(off, off + len);
    hb.hb_blob_destroy(res); hb.hb_face_destroy(sub);
    if (!len) throw new Error('empty subset');
    const out = woff2.compress(ttf);
    if (!out) throw new Error('woff2 compress failed');
    return new Uint8Array(out);
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(buf);
  }
}
