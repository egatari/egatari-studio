// ブラウザの TTS の読み込みと合成（試験ページ lab/irodori.html と、編集アプリの TTS の窓 lab/tts-helper.html が共有する）
//   日本語：Irodori-TTS 500M-v3（ONNX、onnxruntime-web の WebGPU。推論は vendor/irodori-tts-webgpu/pipeline.mjs）、参照音声は voices/<名前>.wav
//   英語など：Kokoro-82M v1.0（kokoro-js。WebGPU）
// ライブラリは jsDelivr、重みとトークナイザは Hugging Face から、どれも版を固定して実行時に取る（このリポジトリには入れない）。
// Irodori の重みは Cache Storage に置き（2 回目は取りに行かない）、Kokoro は transformers.js のキャッシュに置く
import { IrodoriTTS } from './vendor/irodori-tts-webgpu/pipeline.mjs';
import { bundledVoice, DEFAULT_VOICES, IRODORI_VOICES, KOKORO_VOICES } from './tts-voices.mjs';
import { IRODORI_PREFIX, pruneOldModels, requestPersist, inFrozenCopy } from './model-cache.mjs';

export const ORT_VERSION = '1.23.0';            // 上流（web/app.mjs・space/app.mjs）と同じ版
export const TRANSFORMERS_VERSION = '3.7.6';    // 同上（トークナイザだけに使う）
export const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.webgpu.mjs`;
export const ORT_WASM = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const TRANSFORMERS_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`;
// onnxruntime-web が中で読む糊（import()）と WebAssembly（WebGPU の版は asyncify の組み立て）
export const ORT_GLUE_URL = `${ORT_WASM}ort-wasm-simd-threaded.asyncify.mjs`;
export const ORT_WASM_URL = `${ORT_WASM}ort-wasm-simd-threaded.asyncify.wasm`;
export const HF_REPO = 'noguchis/irodori-tts-onnx';
export const HF_REV = 'b75a9bbf2c10e12682d37e91e0efaf6d4e54bd29'; // 版を固定（重みが差し替わっても結果が変わらない）
export const HF_BASE = `https://huggingface.co/${HF_REPO}/resolve/${HF_REV}`;
export const CACHE_NAME = `${IRODORI_PREFIX}${HF_REV.slice(0, 12)}`;
export const SR = 48000;
// 編集アプリの TTS で使う決まった設定：シード 0（手元の mlx のサーバーが固定するシードと同じ番号。ただし雑音は pipeline.mjs の mulberry32 で作るので、
// 同じシードでも手元の合成と波形は同じにならない）、
// ステップ 40（Irodori-TTS の既定）
export const IRODORI_DEFAULTS = Object.freeze({ seed: 0, steps: 40 });

// セッションの鍵 → ONNX の名前（pipeline.mjs の sessions に要る 6 つ）
export const MODELS = {
  text: 'text_encoder', speaker: 'speaker_encoder', duration: 'duration',
  dit: 'dit', dac: 'dacvae_decoder', enc: 'dacvae_encoder',
};
// 大きさ（バイト。HF の一覧から。進み具合の分母）
export const SIZES = {
  fp16: {
    text_encoder: [1871518, 169596928], speaker_encoder: [1635127, 121292800], duration: [237373, 34144256],
    dit: [3090595, 700841984], dacvae_decoder: [892789, 166184768], dacvae_encoder: [962319, 54697984],
  },
  fp32: {
    text_encoder: [1664896, 339062784], speaker_encoder: [1454728, 242454528], duration: [222559, 68222976],
    dit: [2731021, 1401225216], dacvae_decoder: [847311, 261488640], dacvae_encoder: [945688, 109445120],
  },
};
export const TOKENIZER_BYTES = 996 + 6409995 + 1890;
export const folderOf = (prec) => (prec === 'fp16' ? 'onnx_fp16' : 'onnx');
export const irodoriBytes = (prec) => Object.values(SIZES[prec]).flat().reduce((a, b) => a + b, 0) + TOKENIZER_BYTES;
export const irodoriModel = (prec) => `Irodori-TTS-500M-v3 onnx ${prec} (${HF_REPO}@${HF_REV.slice(0, 12)})`;

// Kokoro（英語）：kokoro-js の 1 ファイル版（transformers.js を含む）。重みは fp32（WebGPU で勧められる精度）
export const KOKORO_VERSION = '1.2.1';
export const KOKORO_URL = `https://cdn.jsdelivr.net/npm/kokoro-js@${KOKORO_VERSION}/dist/kokoro.web.js`;
// kokoro-js 1.2.1 が中に持つ transformers.js（3.5.1）の onnxruntime-web は、糊と WebAssembly をこの版の場所から読む
export const KOKORO_ORT = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/';
export const KOKORO_GLUE_URL = `${KOKORO_ORT}ort-wasm-simd-threaded.jsep.mjs`;
export const KOKORO_WASM_URL = `${KOKORO_ORT}ort-wasm-simd-threaded.jsep.wasm`;
export const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const KOKORO_REV = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
export const KOKORO_BYTES = 325532232 + 3497 + 113 + 44 + 2 * 522240;   // model.onnx・tokenizer・config と声 2 つ（kokoro-js は声を main から取る）
export const kokoroModel = () => `Kokoro-82M-v1.0 onnx fp32 (${KOKORO_REPO}@${KOKORO_REV.slice(0, 12)})`;

// ---------------------------------------------------------------- 中身の固定（Subresource Integrity）
// jsDelivr から取るコードは、版の番号だけでなく中身のハッシュでも固定する（配信元が書き換えられても、違う中身は動かさない）。
//   モジュール（MODULE_URLS。ライブラリが中で import() するものも）：lab/tts-helper.html と lab/irodori.html の import map の "integrity"
//     （<script> の integrity 属性は動的な import() に効かないため。import map は CSP のハッシュで許す）。ブラウザが確かめる
//   WebAssembly（WASM_URLS）：ライブラリに取らせず、ここで fetch の integrity を付けて取ってから渡す（fetchVerified）
// 版を替えたら node tools/tts-sri.mjs --write で、この表・2 つの import map・CSP のハッシュを作り直す（試験は tools/test-lab-csp.mjs）
export const MODULE_URLS = [ORT_URL, ORT_GLUE_URL, TRANSFORMERS_URL, KOKORO_URL, KOKORO_GLUE_URL];
export const WASM_URLS = [ORT_WASM_URL, KOKORO_WASM_URL];
export const SRI = Object.freeze({
  [ORT_URL]: 'sha384-N6f7mYiLljH5d73pdoSOdC9/RbEoHCXRvV843PaT93GuqTHybaxUQYzm7X247UQE',
  [ORT_GLUE_URL]: 'sha384-gAZ5slMQ8I9PiSFh20nyJzT8bN7rQqPsciJTV1VeK1PNpeuTQ2QmHlZ6cKvTNN36',
  [ORT_WASM_URL]: 'sha384-tmBFY2CpaRrjl0HjeBVZkFWrbmlX6LMXMWx13U5YVhP+eC0QtkGYNUStBvvc/84f',
  [TRANSFORMERS_URL]: 'sha384-ypqDKlGaciPzMZFxk0iPx9blYGxbZIWTqZX7f6BuiicO9rTfnXfprLBev5KE5OfK',
  [KOKORO_URL]: 'sha384-suR1TeKe6Fe8fT0n/uTWoohnPJrp1zu3z0bj4VH2anmmq739wlmFSnMFJyMYszAC',
  [KOKORO_GLUE_URL]: 'sha384-7GJqH5vc83Yt7VHwrMXTM8bNCrt/e/8eCtok8zlB2u5dwqmhzSakzCkQWrfYGRN4',
  [KOKORO_WASM_URL]: 'sha384-u/bDsx39c+wt0LbHmOCydxt4fyiig3118hQgOTfOvrfkgScM4hRo2IwTtlxyoI02',
});
// import map の中身（2 つのページに同じ文字列で書く。CSP の 'sha256-…' はこの文字列のハッシュ）。
// "imports" の egatari-sri は印：CSP のハッシュが合わずに import map が止められると、integrity も黙って効かなくなるので、
// 取る前に印が解決できるかを見る（importPinned）。解決できなければ jsDelivr のコードを読まない
export const SRI_MARK = 'egatari-sri';
export const importMapText = () => JSON.stringify({ imports: { [SRI_MARK]: './tts-engine.mjs' }, integrity: Object.fromEntries(MODULE_URLS.map((u) => [u, SRI[u]])) });
export function sriActive() { try { import.meta.resolve(SRI_MARK); return true; } catch { return false; } }
export async function importPinned(url) {
  if (!SRI[url] || !MODULE_URLS.includes(url)) throw new Error(`${url}: no integrity pinned`);
  if (!sriActive()) throw new Error('the import map that pins the TTS libraries is not active (blocked by the page policy?); not loading them');
  return import(url);
}
// 中身を確かめて取る（違えば fetch が TypeError で断る）。返すのは ArrayBuffer
export async function fetchVerified(url) {
  if (!SRI[url]) throw new Error(`${url}: no integrity pinned`);
  const res = await fetch(url, { integrity: SRI[url], mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
// onnxruntime-web を読み込む（試験ページ lab/irodori.js も使う）。WebAssembly は確かめたバイトを渡す
export async function importOrt(adapter = null) {
  const o = await importPinned(ORT_URL);
  o.env.wasm.wasmPaths = ORT_WASM;
  o.env.wasm.wasmBinary = await fetchVerified(ORT_WASM_URL);
  o.env.webgpu.powerPreference = 'high-performance';
  if (adapter) o.env.webgpu.adapter = adapter;
  o.env.logLevel = 'error';
  return o;
}
// 声の名前 → Kokoro の声：Kokoro の声の名前（af_heart など）ならそのまま、既定の bob・alice は近い声に、名前がなければ役の既定の声。
// 入っていない名前は null（日本語と同じく断る。黙って別の声にしない。編集アプリは合成の前に知らせて既定の声に替える）
export const kokoroVoice = (name, role) => (name ? bundledVoice('kokoro', name) : DEFAULT_VOICES.kokoro[role === 'novice' ? 'novice' : 'expert']);
// Irodori の参照音声（voices/ に入っているもの）と Kokoro の声の一覧（lab/tts-voices.mjs）
export { IRODORI_VOICES, KOKORO_VOICES };

// ---------------------------------------------------------------- WebGPU
export async function webgpuAdapter() {
  if (!globalThis.navigator || !navigator.gpu) return { ok: false, reason: 'no-webgpu' };
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) return { ok: false, reason: 'no-adapter' };
    return { ok: true, adapter: a, shaderF16: a.features.has('shader-f16') };
  } catch (e) { return { ok: false, reason: String(e.message || e) }; }
}

// ---------------------------------------------------------------- 取る（Cache Storage にあればそこから）
// onBytes(n, fromCache)：読んだバイト数（進み具合）。onCacheError(message)：キャッシュに入れられなかった（シークレットウィンドウなど）
export async function fetchCached(url, expected, { cacheName = CACHE_NAME, onBytes = () => {}, onCacheError = () => {}, label = url } = {}) {
  const store = 'caches' in globalThis ? await caches.open(cacheName).catch(() => null) : null;
  const hit = store ? await store.match(url) : null;
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    if (!expected || buf.byteLength === expected) { onBytes(buf.byteLength, true); return { bytes: buf, cached: true }; }
    await store.delete(url);   // 途中で切れたものは捨てる
  }
  const res = await fetch(url, { cache: 'no-store' });   // HTTP キャッシュに 2 重に置かない
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const len = +res.headers.get('content-length') || expected || 0;
  let buf;
  if (res.body && len) {
    buf = new Uint8Array(len);
    let off = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (off + value.byteLength > buf.byteLength) { const b = new Uint8Array(Math.max(buf.byteLength * 2, off + value.byteLength)); b.set(buf); buf = b; }
      buf.set(value, off); off += value.byteLength;
      onBytes(value.byteLength, false);
    }
    if (off !== buf.byteLength) buf = buf.slice(0, off);
  } else {
    buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.byteLength, false);
  }
  if (expected && buf.byteLength !== expected) throw new Error(`${label}: ${buf.byteLength} bytes (expected ${expected}); the download was cut`);
  if (store) {
    try { await store.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(buf.byteLength) } })); }
    catch (e) { onCacheError(`${label}: ${e.message || e}`); }
  }
  return { bytes: buf, cached: false };
}

// 取る前の手入れ：古い版のキャッシュ（版を替えると残る。1 GB を超える）を消し、空きが足りないときや Safari がしばらく開かないサイトの
// データを消すときに、このキャッシュを残すよう求める（navigator.storage.persist。断られても読み込める）
async function tidyCaches(onLog) {
  const frozen = typeof location !== 'undefined' && inFrozenCopy(location.pathname);   // 凍結した写し（/vX.Y.Z/）は片付けない
  const n = frozen ? 0 : await pruneOldModels(CACHE_NAME, { kokoro: { repo: KOKORO_REPO, rev: KOKORO_REV } }).catch(() => 0);
  if (n) onLog(`removed ${n} cache(s) of older model versions`);
  const p = await requestPersist();
  if (p !== null) onLog(`persistent storage: ${p ? 'granted' : 'not granted'}`);
}

// ---------------------------------------------------------------- Irodori を読み込む → IrodoriTTS
let ort = null, tokenizer = null;
export async function loadIrodori({ prec = 'fp16', adapter = null, onBytes = () => {}, onLog = () => {}, onCacheError = () => {} } = {}) {
  await tidyCaches(onLog);
  if (!ort) ort = await importOrt(adapter);
  const sizes = SIZES[prec], sessions = {}, files = [];
  for (const [k, name] of Object.entries(MODELS)) {
    const base = `${HF_BASE}/${folderOf(prec)}`;
    const ts = performance.now();
    const m = await fetchCached(`${base}/${name}.onnx`, sizes[name][0], { onBytes, onCacheError, label: `${name}.onnx` });
    const d = await fetchCached(`${base}/${name}.onnx.data`, sizes[name][1], { onBytes, onCacheError, label: `${name}.onnx.data` });
    const tf = performance.now();
    sessions[k] = await ort.InferenceSession.create(m.bytes, {
      executionProviders: ['webgpu'], graphOptimizationLevel: 'all', logSeverityLevel: 3,
      externalData: [{ path: `${name}.onnx.data`, data: d.bytes }],
    });
    files.push({ name, cached: m.cached && d.cached, fetchSec: (tf - ts) / 1000, sessionSec: (performance.now() - tf) / 1000 });
    onLog(`${name}: ${m.cached && d.cached ? 'cache' : 'download'} ${((tf - ts) / 1000).toFixed(1)} s, session ${((performance.now() - tf) / 1000).toFixed(1)} s`);
  }
  if (!tokenizer) {
    const T = await importPinned(TRANSFORMERS_URL);
    // tokenizer/llmjp_tok/ を「手元のモデル」として HF の固定版から読む（上流は同じ場所を自前で配っている）
    T.env.allowRemoteModels = false;
    T.env.allowLocalModels = true;
    T.env.localModelPath = `${HF_BASE}/tokenizer/`;
    tokenizer = await T.AutoTokenizer.from_pretrained('llmjp_tok');
    onBytes(TOKENIZER_BYTES, false);
  }
  const tts = new IrodoriTTS({ ort, sessions, tokenizer });
  return { tts, ort, files };
}
export async function releaseIrodori(tts) { if (tts) for (const s of Object.values(tts.s)) await s.release?.().catch(() => {}); }

// ---------------------------------------------------------------- Kokoro を読み込む
export async function loadKokoro({ onProgress = () => {}, onLog = () => {} } = {}) {
  await tidyCaches(onLog);
  const K = await importPinned(KOKORO_URL);
  // 中の onnxruntime-web に、確かめた WebAssembly を blob: の URL で渡す（kokoro-js の env は wasmPaths しか開けていない）
  const wasm = URL.createObjectURL(new Blob([await fetchVerified(KOKORO_WASM_URL)], { type: 'application/wasm' }));
  K.env.wasmPaths = { mjs: KOKORO_GLUE_URL, wasm };
  // revision：kokoro-js 1.2.1 はこれを先に渡さない（重みも設定も main から取る。SECURITY.md）。上流が渡すようになったときのために残す
  try { return await K.KokoroTTS.from_pretrained(KOKORO_REPO, { dtype: 'fp32', device: 'webgpu', revision: KOKORO_REV, progress_callback: onProgress }); }
  finally { URL.revokeObjectURL(wasm); }   // 読み込み（セッションを作るまで）が終われば要らない
}

// ---------------------------------------------------------------- 声（参照音声の WAV）
// WAV を自前で読む（ブラウザの復号・再標本化の違いを入れないため）。WAV でなければ null
export function parseWav(ab) {
  const dv = new DataView(ab);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (ab.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= ab.byteLength;) {
    const id = tag(o), size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { format: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
      if (fmt.format === 0xfffe && size >= 40) fmt.format = dv.getUint16(o + 32, true);   // WAVE_FORMAT_EXTENSIBLE：SubFormat の先頭
    }
    if (id === 'data') data = { off: o + 8, size: Math.min(size, ab.byteLength - o - 8) };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) return null;
  const bps = fmt.bits / 8, n = Math.floor(data.size / (bps * fmt.ch));
  const out = new Float32Array(n);
  const isFloat = fmt.format === 3;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const o = data.off + (i * fmt.ch + c) * bps;
      let v;
      if (isFloat && bps === 4) v = dv.getFloat32(o, true);
      else if (isFloat && bps === 8) v = dv.getFloat64(o, true);
      else if (bps === 2) v = dv.getInt16(o, true) / 32768;
      else if (bps === 3) { const x = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16); v = x / 8388608; }
      else if (bps === 4) v = dv.getInt32(o, true) / 2147483648;
      else if (bps === 1) v = (dv.getUint8(o) - 128) / 128;
      else throw new Error(`unsupported WAV (${fmt.bits} bit)`);
      s += v;
    }
    out[i] = s / fmt.ch;
  }
  return { pcm: out, sr: fmt.sr, channels: fmt.ch, bits: fmt.bits };
}
// 窓付き sinc による再標本化（純粋な JS の計算なので、どの PC でも同じ結果になる。kit/core/audio-core.mjs の resample と同じ）
export function resample(x, from, to) {
  if (from === to) return x;
  const ratio = to / from, fc = Math.min(1, ratio) * 0.97, half = 32 / Math.min(1, ratio);
  const n = Math.round(x.length * ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / ratio;
    let s = 0, w = 0;
    for (let k = Math.max(0, Math.ceil(t - half)); k <= Math.min(x.length - 1, Math.floor(t + half)); k++) {
      const d = t - k;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * fc * d) / (Math.PI * fc * d);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * d) / half);   // Hann 窓
      const h = fc * sinc * win;
      s += x[k] * h; w += h;
    }
    y[i] = w ? s / w : 0;   // 重みの和で割る（直流の利得を 1 に）
  }
  return y;
}
// 既定の声（voices/<名前>.wav）→ 48 kHz モノラルの Float32（1 度だけ読む）
const voices = new Map();
export async function presetVoice(name, base = new URL('.', import.meta.url)) {
  if (!IRODORI_VOICES.includes(name)) throw Object.assign(new Error(`voice "${name}" is not bundled (${IRODORI_VOICES.join(', ')})`), { code: 'no-voice' });
  if (!voices.has(name)) {
    const res = await fetch(new URL(`voices/${name}.wav`, base));
    if (!res.ok) throw new Error(`voices/${name}.wav: HTTP ${res.status}`);
    const w = parseWav(await res.arrayBuffer());
    if (!w) throw new Error(`voices/${name}.wav is not a WAV file`);
    voices.set(name, resample(w.pcm, w.sr, SR));
  }
  return voices.get(name);
}
