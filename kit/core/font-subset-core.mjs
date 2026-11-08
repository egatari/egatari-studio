// 字の切り出しの本体（#178 (4)、handoff/font-subset-design-2026-11-05.md）。Node（kit/font-subset.mjs）とブラウザの編集アプリ（app/font-subset-tools.js）が共有する（node: を読み込まない）。
// @fontsource の分割ファイル（woff2）1 つを、教材が使う字だけの woff2 にする：harfbuzz の hb-subset（wasm、harfbuzzjs）と woff2 の圧縮・展開（wasm、wawoff2）。
//   const s = await createSubsetter({ hbWasm, woff2 })   hbWasm：harfbuzz-subset.wasm のバイト（か WebAssembly.Module）。woff2：{compress(Uint8Array) → bytes, decompress(Uint8Array) → bytes}
//   s.subsetWoff2(bytes, cps) → Uint8Array（woff2）。cps：字の番号の配列（順は問わない。中で小さい順に並べ、重ねを除く）
//   s.subset(bytes, cps) → {woff2, cps}：cps は切り出した字が本当に持つ字（cmap に字形のある字、小さい順）。分割ファイルの unicode-range が
//   持たない字まで含むことがあるので、組み立ての unicode-range はこれで書く（仕様 §7.2：範囲に、その書体にない字を書かない）
// 同じ入力（分割ファイルのバイトと字の集まり）と同じ道具の版（SUBSET_PINS）なら、どのプロセス・OS・ブラウザでも同じバイトを返す（組み立ての再現性。字を集めた順にもよらない）。
// 残す配置の機能（GSUB）：ccmp・liga・vert・vrt2・vkna・ruby（縦書きの約物・ルビ。分割ファイルが持つのは vert・vrt2 ほど）。ヒントは除く（pyftsubset の --no-hinting と同じ）
export const KEEP_FEATURES = Object.freeze(['ccmp', 'liga', 'vert', 'vrt2', 'vkna', 'ruby']);
// 出力のバイトを決める道具の版（package.json の dependencies に同じ版を固定する。tools/test-font-subset.mjs が確かめる）。
// 版を替えると切り出した字のバイトが変わる（KaTeX の版を替えると式の描画が変わるのと同じ。RELEASING.md）
export const SUBSET_PINS = Object.freeze({ harfbuzzjs: '1.6.4', wawoff2: '2.0.1' });

const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1;
const tag = (s) => [...s].reduce((a, c) => ((a << 8) | c.charCodeAt(0)) >>> 0, 0);

export async function createSubsetter({ hbWasm, woff2 }) {
  if (!woff2 || typeof woff2.compress !== 'function' || typeof woff2.decompress !== 'function') throw new Error('font subsetter: woff2 {compress, decompress} is required');
  const mod = hbWasm instanceof WebAssembly.Module ? hbWasm : await WebAssembly.compile(hbWasm);
  const hb = (await WebAssembly.instantiate(mod, {})).exports;
  hb._initialize();
  function subset(bytes, cps) {
    const sfnt = woff2.decompress(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (!sfnt || !sfnt.byteLength) throw new Error('woff2 decompress failed');
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
      if (!out || !out.byteLength) throw new Error('woff2 compress failed');
      return { woff2: new Uint8Array(out), cps: cmapCodePoints(ttf) };
    } finally {
      hb.hb_subset_input_destroy(input);
      hb.hb_face_destroy(face);
      hb.free(buf);
    }
  }
  return { subset, subsetWoff2: (bytes, cps) => subset(bytes, cps).woff2 };
}

// sfnt（TTF・OTF）の cmap が字形を持つ字の番号（小さい順）。読むのは Unicode の表（platform 0、または 3 の encoding 1・10）の形式 4 と 12
export function cmapCodePoints(sfnt) {
  const v = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const n = v.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (v.getUint32(r) === 0x636d6170) { cmap = v.getUint32(r + 8); break; } }
  if (cmap < 0) return [];
  const out = new Set();
  const tables = v.getUint16(cmap + 2);
  for (let i = 0; i < tables; i++) {
    const rec = cmap + 4 + i * 8, pid = v.getUint16(rec), eid = v.getUint16(rec + 2), off = cmap + v.getUint32(rec + 4);
    if (!(pid === 0 || (pid === 3 && (eid === 1 || eid === 10)))) continue;
    const fmt = v.getUint16(off);
    if (fmt === 4) {
      const segX2 = v.getUint16(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let k = 0; k < segX2; k += 2) {
        const end = v.getUint16(ends + k), start = v.getUint16(starts + k), delta = v.getInt16(deltas + k), ro = v.getUint16(ranges + k);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g;
          if (!ro) g = (c + delta) & 0xffff;
          else { g = v.getUint16(ranges + k + ro + (c - start) * 2); if (g) g = (g + delta) & 0xffff; }
          if (g) out.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = v.getUint32(off + 12);
      for (let k = 0; k < groups; k++) {
        const g = off + 16 + k * 12, a = v.getUint32(g), z = v.getUint32(g + 4), gid = v.getUint32(g + 8);
        for (let c = a; c <= z; c++) if (gid + (c - a)) out.add(c);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

// wawoff2 の emscripten の束（compress_binding.js・decompress_binding.js）が動き出すのを待つ（calledRun でなければ onRuntimeInitialized）
export const woff2Ready = (m) => (m.calledRun ? Promise.resolve() : new Promise((r) => { const prev = m.onRuntimeInitialized; m.onRuntimeInitialized = () => { if (typeof prev === 'function') prev(); r(); }; }));
// 分割ファイルのバイトを読む env.readBytes などから受け取ったものを、base64 にする（ブラウザと Node で同じ字）
export function bytesToBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
