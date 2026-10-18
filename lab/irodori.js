// Irodori-TTS をブラウザ（WebGPU）だけで動かす試験ページ。説明は lab/irodori.html の冒頭
// 推論の本体は lab/vendor/irodori-tts-webgpu/pipeline.mjs（上流のまま。UPSTREAM.md）
// 重みとトークナイザは Hugging Face から実行時に取り、Cache Storage に置く（2 回目は取りに行かない）
import { IrodoriTTS } from './vendor/irodori-tts-webgpu/pipeline.mjs';
// 版・場所・大きさ・WAV の読み取り・再標本化は、編集アプリの TTS の窓（lab/tts-helper.html）と共有する（lab/tts-engine.mjs）
import { ORT_VERSION, TRANSFORMERS_VERSION, ORT_URL, ORT_WASM, TRANSFORMERS_URL, HF_REPO, HF_REV, HF_BASE, CACHE_NAME, SR, MODELS, SIZES, TOKENIZER_BYTES, folderOf, parseWav, resample } from './tts-engine.mjs';

// 試験 B の組。左 raw は原稿（{θ|シータ} などの指定を解いた後）、右 yomi は読み辞書を通した後。
// examples/minimal の写しに文を足し、`uv run --project tts python tts/synth.py <写し> --dry-run` が
// 書いた audio/seg_*.json の tts（右）と tools/narration-json.mjs の ttsParts（左）から取った（手で書いていない）
const PAIRS = [
  { key: '読みの試験:0', raw: '勾配降下法では、学習率を小さくしすぎると収束が遅くなります。', yomi: '勾配降下法では、学習率を小さくしすぎると収束が遅くなります。' },
  { key: '読みの試験:1', raw: '確率的勾配降下法は、ミニバッチごとに勾配を推定します。', yomi: '確率的勾配降下法は、ミニバッチごとに勾配を推定します。' },
  { key: '読みの試験:2', raw: '汎化誤差を抑えるために、正則化の項を損失に加えます。', yomi: '汎化誤差を抑えるために、正則化の項を損失に加えます。' },
  { key: '読みの試験:3', raw: '尤度を最大にするパラメータを求めるのが、最尤推定です。', yomi: 'ゆうどを最大にするパラメータを求めるのが、さいゆうすいていです。' },
  { key: '読みの試験:4', raw: '対数尤度は、尤度関数の対数をとったものです。', yomi: 'たいすうゆうどは、ゆうどかんすうの対数をとったものです。' },
  { key: '読みの試験:5', raw: 'ベイズ推定では、事前分布と尤度から事後分布を求めます。', yomi: 'ベイズ推定では、事前分布とゆうどから事後分布を求めます。' },
  { key: '読みの試験:6', raw: '分類の損失には、交差エントロピーがよく使われます。', yomi: '分類の損失には、交差エントロピーがよく使われます。' },
  { key: '読みの試験:7', raw: '行列の固有値が負になると、その点は鞍点になります。', yomi: '行列の固有値が負になると、その点はあんてんになります。' },
  { key: '読みの試験:8', raw: '双対問題を解いてから、閾値を決定木で調べます。', yomi: 'そうついもんだいを解いてから、しきいちをけっていぎで調べます。' },
];

// 試験 D の比較用の音：Mac の mlx-audio サーバー（mlx-community/Irodori-TTS-500M-v3-fp16、POST /v1/audio/speech）で
// 作り、48 kHz モノラルの AAC（m4a）にして samples/mlx/ に置いた。sec は元の wav の長さ、genSec はサーバーの応答時間
const MLX = [
  { id: 'd1', voice: 'bob', text: 'ゆうどを最大にするパラメータを求めるのが、さいゆうすいていです。', sec: 4.2, genSec: 1.59 },
  { id: 'd2', voice: 'bob', text: 'たいすうゆうどは、ゆうどかんすうの対数をとったものです。', sec: 3.84, genSec: 1.52 },
  { id: 'd3', voice: 'bob', text: '行列の固有値が負になると、その点はあんてんになります。', sec: 3.52, genSec: 1.45 },
  { id: 'd1', voice: 'alice', text: 'ゆうどを最大にするパラメータを求めるのが、さいゆうすいていです。', sec: 4.24, genSec: 1.69 },
  { id: 'd2', voice: 'alice', text: 'たいすうゆうどは、ゆうどかんすうの対数をとったものです。', sec: 3.68, genSec: 1.58 },
  { id: 'd3', voice: 'alice', text: '行列の固有値が負になると、その点はあんてんになります。', sec: 3.84, genSec: 1.55 },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => (n / 1e6).toFixed(1);
const f2 = (x) => (x == null ? '–' : x.toFixed(2));

// ---------------------------------------------------------------- 状態（報告の JSON の元）
const state = {
  env: {}, load: null, voice: null, runs: [], testA: null, testB: {}, testD: {},
  errors: [],
};
let ort = null, tokenizer = null, tts = null, loadedPrec = null;
let gpuAdapter = null;   // high-performance で取ったアダプタ。ORT にそのまま渡す（ノート PC の外部 GPU を使わせる）
let voice = null;     // 選んでいる声 {pcm: Float32Array @48 kHz mono, info}
let queue = Promise.resolve();   // 合成は 1 本ずつ（GPU を取り合わない）
const serial = (fn) => (queue = queue.then(fn, fn));

window.addEventListener('error', (e) => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason?.message || e.reason)));

// ---------------------------------------------------------------- 1. 環境
async function detectEnv() {
  const env = state.env;
  env.userAgent = navigator.userAgent;
  env.platform = navigator.userAgentData?.platform || navigator.platform || '';
  try {
    const hi = await navigator.userAgentData?.getHighEntropyValues?.(['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']);
    if (hi) env.uaData = { platform: hi.platform, platformVersion: hi.platformVersion, architecture: hi.architecture, bitness: hi.bitness, browsers: (hi.fullVersionList || []).map((b) => `${b.brand} ${b.version}`) };
  } catch { /* 取れなくてもよい */ }
  env.crossOriginIsolated = !!globalThis.crossOriginIsolated;
  env.secureContext = !!globalThis.isSecureContext;
  env.hardwareConcurrency = navigator.hardwareConcurrency || null;
  env.deviceMemoryGB = navigator.deviceMemory || null;
  env.cacheApi = 'caches' in globalThis;
  env.webgpu = !!navigator.gpu;
  if (navigator.gpu) {
    try {
      // GPU が 2 つある PC（Intel 内蔵＋NVIDIA など）では high-performance で外部 GPU を頼む。
      // 比べるために low-power のアダプタの情報も取る（同じなら GPU は 1 つか、OS が外部 GPU を出していない）
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      const lp = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
      if (!a) env.webgpuError = 'requestAdapter() が null を返した（GPU が使えない）';
      else {
        gpuAdapter = a;
        env.adapter = adapterInfo(a);
        if (lp) env.adapterLowPower = adapterInfo(lp);
        env.shaderF16 = a.features.has('shader-f16');
        env.features = [...a.features].sort();
        env.limits = { maxBufferSize: a.limits.maxBufferSize, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxComputeWorkgroupStorageSize: a.limits.maxComputeWorkgroupStorageSize };
        env.integratedHint = looksIntegrated(env.adapter);
      }
    } catch (e) { env.webgpuError = String(e.message || e); }
  }
  try { const est = await navigator.storage?.estimate?.(); if (est) env.storage = { usageMB: +mb(est.usage), quotaMB: +mb(est.quota) }; } catch { /* なくてよい */ }
  renderEnv();
  if (!env.webgpu || !env.adapter) {
    $('btn-load').disabled = true;
    $('load-status').innerHTML = '<span class="bad">WebGPU が使えないので、このブラウザでは合成できません。</span> Chrome か Edge の新しい版で開いてください（Safari は設定で WebGPU を有効にする必要があります）。';
  } else if (!env.shaderF16) {
    document.querySelector('input[name=prec][value=fp32]').checked = true;
    document.querySelector('input[name=prec][value=fp16]').disabled = true;
    $('load-status').innerHTML = 'この GPU は shader-f16 に対応していないので fp32 を使います（約 2.44 GB）。';
  }
}

function adapterInfo(a) {
  const info = a.info || {};
  return { vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '', description: info.description || '', isFallbackAdapter: !!(info.isFallbackAdapter ?? a.isFallbackAdapter) };
}
const adapterText = (i) => [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / ') || '（ブラウザが情報を出さない）';
// Intel の内蔵 GPU に見えるか（NVIDIA を積んだノート PC で、Chrome が内蔵 GPU を使っているときに案内を出す）
const looksIntegrated = (i) => /intel/i.test(i.vendor) || /intel|iris|uhd graphics/i.test(i.description);
const GPU_HINT = 'GPU が Intel（内蔵）になっています。Windows の Chrome はページからの GPU の指定を無視するので（crbug.com/369219127）、内蔵 GPU だと 1 文に 1 分以上かかります。NVIDIA などの外部 GPU を積んだ PC なら、Windows の［設定］→［システム］→［ディスプレイ］→［グラフィック］で Chrome を追加し（一覧に無ければ「参照」から chrome.exe）、［オプション］で「高パフォーマンス」を選んでから Chrome を完全に終了して開き直してください。';

function renderEnv() {
  const e = state.env;
  const yes = (b) => (b ? '<span class="ok">はい</span>' : '<span class="bad">いいえ</span>');
  const rows = [
    ['WebGPU', e.webgpu ? (e.adapter ? '<span class="ok">使える</span>' : `<span class="bad">navigator.gpu はあるがアダプタが取れない</span> ${esc(e.webgpuError || '')}`) : '<span class="bad">使えない（navigator.gpu がない）</span>'],
    ['GPU（high-performance で取ったもの。合成に使う）', e.adapter ? esc(adapterText(e.adapter)) + (e.adapter.isFallbackAdapter ? ' <span class="bad">（ソフトウェア実装）</span>' : '') + (e.integratedHint ? `<div class="note">${GPU_HINT}</div>` : '') : '–'],
    ['GPU（low-power で取ったもの。比較用）', e.adapterLowPower ? esc(adapterText(e.adapterLowPower)) : '–'],
    ['ORT が実際に使っている GPU', state.load?.ortAdapter ? esc(adapterText(state.load.ortAdapter)) : '<span class="muted">（モデルの読み込み後に表示）</span>'],
    ['fp16 シェーダー（shader-f16）', e.adapter ? yes(e.shaderF16) : '–'],
    ['maxBufferSize / maxStorageBufferBindingSize', e.limits ? `${mb(e.limits.maxBufferSize)} MB / ${mb(e.limits.maxStorageBufferBindingSize)} MB` : '–'],
    ['crossOriginIsolated', yes(e.crossOriginIsolated) + ' <span class="muted">（いいえでも動く。WASM のスレッドが 1 本になるだけ）</span>'],
    ['安全な文脈（https か localhost）', yes(e.secureContext)],
    ['Cache Storage', yes(e.cacheApi)],
    ['CPU スレッド / メモリ', `${e.hardwareConcurrency ?? '?'} / ${e.deviceMemoryGB ? e.deviceMemoryGB + ' GB 以上' : '?'}`],
    ['ブラウザ', esc(e.uaData ? e.uaData.browsers.join(', ') + ` (${e.uaData.platform} ${e.uaData.platformVersion} ${e.uaData.architecture})` : '')],
    ['User-Agent', `<span class="mono">${esc(e.userAgent)}</span>`],
    ['保存領域', e.storage ? `${e.storage.usageMB} MB 使用 / ${e.storage.quotaMB} MB まで` : '–'],
  ];
  $('env-table').tBodies[0].innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
}

// ---------------------------------------------------------------- 2. 読み込み
let progress = { total: 0, done: 0, net: 0, cached: 0 };
let cacheErrors = [];   // シークレットウィンドウなどでは大きなファイルをキャッシュに入れられないことがある
function showProgress(msg) {
  const p = progress.total ? Math.min(100, (100 * progress.done) / progress.total) : 0;
  $('load-bar').style.width = p.toFixed(1) + '%';
  $('load-status').textContent = `${msg} — ${mb(progress.done)} / ${mb(progress.total)} MB（取得 ${mb(progress.net)} MB、キャッシュから ${mb(progress.cached)} MB）`;
}
function loadLog(m) { const el = $('load-log'); el.hidden = false; el.textContent += m + '\n'; el.scrollTop = el.scrollHeight; }

// 1 ファイルを取る。キャッシュにあればそこから、なければ取りながら進み具合を出し、キャッシュに入れる
async function fetchFile(url, expected, label) {
  const store = 'caches' in globalThis ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const hit = store ? await store.match(url) : null;
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    if (!expected || buf.byteLength === expected) {
      progress.done += buf.byteLength; progress.cached += buf.byteLength; showProgress(label);
      return { bytes: buf, cached: true };
    }
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
      progress.done += value.byteLength; progress.net += value.byteLength; showProgress(label);
    }
    if (off !== buf.byteLength) buf = buf.slice(0, off);
  } else {
    buf = new Uint8Array(await res.arrayBuffer());
    progress.done += buf.byteLength; progress.net += buf.byteLength; showProgress(label);
  }
  if (expected && buf.byteLength !== expected) throw new Error(`${label}: ${buf.byteLength} バイト（期待 ${expected}）。通信が途中で切れた可能性`);
  if (store) {
    try { await store.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(buf.byteLength) } })); }
    catch (e) { cacheErrors.push(`${label}: ${e.message || e}`); loadLog(`  （${label} をキャッシュに入れられなかった: ${e.message || e}。次回も取得します）`); }
  }
  return { bytes: buf, cached: false };
}

async function loadModel() {
  const prec = document.querySelector('input[name=prec]:checked').value;
  if (tts && loadedPrec === prec) return;
  $('btn-load').disabled = true; setRunButtons(false);
  const t0 = performance.now();
  try {
    if (tts) { for (const s of Object.values(tts.s)) await s.release?.().catch(() => {}); tts = null; loadedPrec = null; }
    if (!ort) {
      ort = await import(ORT_URL);
      ort.env.wasm.wasmPaths = ORT_WASM;
      ort.env.webgpu.powerPreference = 'high-performance';   // 念のため（adapter を渡すので普通は使われない）
      if (gpuAdapter) ort.env.webgpu.adapter = gpuAdapter;   // 環境の欄に出したアダプタをそのまま使わせる
      ort.env.logLevel = 'error';
    }
    const sizes = SIZES[prec];
    cacheErrors = [];
    progress = { total: Object.values(sizes).flat().reduce((a, b) => a + b, 0) + (tokenizer ? 0 : TOKENIZER_BYTES), done: 0, net: 0, cached: 0 };
    loadLog(`読み込み開始（${prec}、${CACHE_NAME}）`);
    const sessions = {}, perFile = [];
    for (const [k, name] of Object.entries(MODELS)) {
      const base = `${HF_BASE}/${folderOf(prec)}`;
      const ts = performance.now();
      const m = await fetchFile(`${base}/${name}.onnx`, sizes[name][0], `${name}.onnx`);
      const d = await fetchFile(`${base}/${name}.onnx.data`, sizes[name][1], `${name}.onnx.data`);
      const tf = performance.now();
      sessions[k] = await ort.InferenceSession.create(m.bytes, {
        executionProviders: ['webgpu'], graphOptimizationLevel: 'all', logSeverityLevel: 3,   // ORT の警告（定数畳み込みなど）を出さない
        externalData: [{ path: `${name}.onnx.data`, data: d.bytes }],
      });
      const tc = performance.now();
      perFile.push({ name, MB: +mb(sizes[name][0] + sizes[name][1]), cached: m.cached && d.cached, fetchSec: +((tf - ts) / 1000).toFixed(2), sessionSec: +((tc - tf) / 1000).toFixed(2) });
      loadLog(`  ${name}: ${mb(sizes[name][0] + sizes[name][1])} MB ${m.cached && d.cached ? 'キャッシュから' : '取得'} ${((tf - ts) / 1000).toFixed(1)} s、セッション作成 ${((tc - tf) / 1000).toFixed(1)} s`);
    }
    if (!tokenizer) {
      const T = await import(TRANSFORMERS_URL);
      // tokenizer/llmjp_tok/ を「手元のモデル」として HF の固定版から読む（上流は同じ場所を自前で配っている）
      T.env.allowRemoteModels = false;
      T.env.allowLocalModels = true;
      T.env.localModelPath = `${HF_BASE}/tokenizer/`;
      tokenizer = await T.AutoTokenizer.from_pretrained('llmjp_tok');
      progress.done += TOKENIZER_BYTES; progress.net += TOKENIZER_BYTES;
      loadLog('  トークナイザ（llm-jp-3-150m）: 読み込み済み');
    }
    tts = new IrodoriTTS({ ort, sessions, tokenizer });
    loadedPrec = prec;
    const sec = (performance.now() - t0) / 1000;
    let used = null;
    try {   // ORT が実際に使っている GPU（環境の欄のアダプタと同じはず）
      const ai = (await ort.env.webgpu.device)?.adapterInfo || ort.env.webgpu.adapter?.info;
      if (ai) used = { vendor: ai.vendor, architecture: ai.architecture, device: ai.device, description: ai.description };
    } catch { /* なくてよい */ }
    state.load = {
      precision: prec, seconds: +sec.toFixed(2), totalMB: +mb(progress.total), downloadedMB: +mb(progress.net), fromCacheMB: +mb(progress.cached),
      hfRevision: HF_REV, ortVersion: ORT_VERSION, transformersVersion: TRANSFORMERS_VERSION, ortAdapter: used, files: perFile, cacheErrors,
    };
    renderEnv();
    showProgress('読み込み完了');
    $('load-status').innerHTML += ` <b class="ok">読み込み完了：${sec.toFixed(1)} 秒（${prec}）</b>`;
  } catch (e) {
    console.error(e);
    state.errors.push('load: ' + (e.message || e));
    $('load-status').innerHTML = `<span class="bad">読み込みに失敗：${esc(e.message || e)}</span>`;
  } finally {
    $('btn-load').disabled = false; setRunButtons(!!tts);
    renderReport();
  }
}

async function clearCache() {
  if ('caches' in globalThis) for (const n of await caches.keys()) if (n.startsWith('irodori-lab-') || n === 'transformers-cache') await caches.delete(n);
  $('load-status').textContent = 'キャッシュを消しました（次の読み込みは取得し直します）';
  try { const est = await navigator.storage?.estimate?.(); if (est) { state.env.storage = { usageMB: +mb(est.usage), quotaMB: +mb(est.quota) }; renderEnv(); } } catch { /* なくてよい */ }
}

// ---------------------------------------------------------------- 3. 声
// WAV の読み取り（parseWav）と窓付き sinc の再標本化（resample）は lab/tts-engine.mjs

async function sha1(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  if (globalThis.crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-1', bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5;   // 安全でない文脈（http の LAN など）では FNV-1a で代わりにする
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv1a32:' + h.toString(16).padStart(8, '0');
}

// 音声ファイル（ArrayBuffer）→ 48 kHz モノラルの Float32 と、その情報
async function decodeVoice(ab, name) {
  let w = parseWav(ab), how, pcm;
  if (w) {
    pcm = resample(w.pcm, w.sr, SR);
    how = w.sr === SR ? 'そのまま' : `${w.sr} Hz → ${SR} Hz（窓付き sinc）`;
  } else {
    const ctx = new OfflineAudioContext(1, 1, SR);   // 48 kHz の文脈で復号すると 48 kHz になる
    const buf = await ctx.decodeAudioData(ab.slice(0));
    pcm = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < pcm.length; i++) pcm[i] += d[i] / buf.numberOfChannels; }
    w = { sr: buf.sampleRate, channels: buf.numberOfChannels, bits: null };
    how = 'ブラウザで復号（decodeAudioData）';
  }
  const info = { name, sourceRate: w.sr, channels: w.channels, bits: w.bits, seconds: +(pcm.length / SR).toFixed(2), conversion: how, sha1_48k: await sha1(pcm) };
  return { pcm, info };
}
// 選んだ声のファイルの上限（バイト）。参照音声は数十秒の WAV（48 kHz・モノラルで 1 分 6 MB 足らず）
const MAX_VOICE_BYTES = 64 * 1048576;
// 既定の声（voices/<名前>.wav）は 1 度だけ読む
const presetVoices = {};
async function presetVoice(which) {
  if (!presetVoices[which]) {
    const res = await fetch(`voices/${which}.wav`);
    if (!res.ok) throw new Error(`voices/${which}.wav: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    presetVoices[which] = { ...(await decodeVoice(ab, `${which}.wav`)), url: URL.createObjectURL(new Blob([ab], { type: 'audio/wav' })) };
  }
  return presetVoices[which];
}

async function loadVoice() {
  const which = document.querySelector('input[name=voice]:checked').value;
  let v;
  if (which === 'file') {
    const f = $('voice-file').files[0];
    if (!f) { $('voice-status').textContent = '声：ファイルを選んでください'; voice = null; return null; }
    // 選んだファイルは信頼しない：File.size を読む前に、読んだ後も実際のバイト数を上限と比べる（app/bounded-read.js と同じ確かめ方。
    // lab/ はそのまま配るので app/ を読み込めない）
    if (!(f.size <= MAX_VOICE_BYTES)) { $('voice-status').textContent = `声：ファイルが大きすぎる（${f.size} バイト。${MAX_VOICE_BYTES} まで）`; voice = null; return null; }
    const ab = await f.arrayBuffer();
    if (ab.byteLength > MAX_VOICE_BYTES) { $('voice-status').textContent = '声：ファイルが大きすぎる'; voice = null; return null; }
    v = { ...(await decodeVoice(ab, f.name)), url: URL.createObjectURL(f) };
  } else v = await presetVoice(which);
  voice = v; state.voice = v.info;
  const i = v.info;
  $('voice-status').textContent = `声：${i.name}（${i.sourceRate} Hz、${i.channels} ch、${i.seconds} 秒）→ ${i.conversion}。48 kHz の参照の SHA-1 ${i.sha1_48k.slice(0, 12)}…`;
  const p = $('voice-player'); p.src = v.url; p.hidden = false;
  renderReport();
  return v;
}

// ---------------------------------------------------------------- 合成（pipeline.mjs の synthesize と同じ呼び出しを、段階ごとに時間を測りながら行う）
async function synth(test, label, text, seed, useVoice = null) {
  if (!tts) throw new Error('先にモデルを読み込んでください');
  const v = useVoice || voice || (await loadVoice());
  if (!v) throw new Error('声を選んでください');
  const ref = v.pcm;
  const steps = Math.max(1, parseInt($('steps').value, 10) || 40);
  const opts = { numSteps: steps, seed };
  const ms = {};
  const lap = async (k, p) => { const t = performance.now(); const r = await p(); ms[k] = Math.round(performance.now() - t); return r; };
  const first = !state.runs.some((r) => r.precision === loadedPrec);
  const t0 = performance.now();
  const t = await lap('text', () => tts.encodeText(text));
  const rl = await lap('refEnc', () => tts.wavToRefLatent(ref, SR));
  const spk = await lap('speaker', () => tts.encodeRefLatent(rl.latent, rl.T));
  const seqLen = await lap('duration', () => tts.predictDuration(t, spk, opts));
  const latent = await lap('dit', () => tts.rfLoop(t, spk, seqLen, opts));
  const audio = await lap('decode', () => tts.decode(latent, seqLen));
  const genSec = (performance.now() - t0) / 1000;
  const audioSec = audio.length / SR;
  const pcm = audio instanceof Float32Array ? audio : Float32Array.from(audio);
  const run = {
    n: state.runs.length + 1, test, label, text, chars: [...text].length, voice: v.info.name, seed, steps, precision: loadedPrec,
    genSec: +genSec.toFixed(3), audioSec: +audioSec.toFixed(3), rtf: +(genSec / audioSec).toFixed(3), seqLen, ms, firstRun: first,
    sha1: await sha1(pcm), peak: +pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(4),
  };
  const url = URL.createObjectURL(encodeWav(pcm, SR));
  run._url = url; run._pcm = pcm;
  state.runs.push(run);
  renderRuns(); renderReport();
  return run;
}

function encodeWav(f32, sr) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767), true);
  return new Blob([buf], { type: 'audio/wav' });
}
const player = (run, name) => `<audio controls preload="none" src="${run._url}"></audio><a class="muted" href="${run._url}" download="${esc(name)}.wav">wav を保存</a>`;

// ---------------------------------------------------------------- 4. 試験 A
async function testA() {
  const text = $('a-text').value.trim();
  const seed = parseInt($('seed').value, 10) || 0;
  const tb = $('a-table').tBodies[0];
  tb.innerHTML = ''; $('a-verdict').textContent = '実行中…';
  const runs = [];
  for (const [i, s] of [[1, seed], [2, seed], [3, seed + 1]]) {
    const r = await synth('A', `A${i}`, text, s);
    runs.push(r);
    tb.insertAdjacentHTML('beforeend', `<tr><td>${i}${i === 3 ? '（別のシード）' : ''}</td><td class="num">${s}</td><td class="num">${f2(r.audioSec)} s</td><td class="num">${f2(r.genSec)} s</td><td class="num">${f2(r.rtf)}</td><td class="hash">${r.sha1}</td><td>${player(r, `testA_run${i}_seed${s}`)}</td></tr>`);
  }
  const same = runs[0].sha1 === runs[1].sha1, diff = runs[0].sha1 !== runs[2].sha1;
  let maxAbs = 0;
  if (!same) { const a = runs[0]._pcm, b = runs[1]._pcm; for (let i = 0; i < Math.min(a.length, b.length); i++) maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); }
  state.testA = {
    text, seed, voice: state.voice?.name, precision: loadedPrec,
    sha1: runs.map((r) => r.sha1), sameSeedIdentical: same, differentSeedDiffers: diff,
    sameSeedMaxAbsDiff: same ? 0 : maxAbs, lengths: runs.map((r) => r._pcm.length),
  };
  $('a-verdict').innerHTML = `同じシード（1 回目と 2 回目）：${same ? '<span class="ok">完全に同一</span>' : `<span class="bad">一致しない</span>（長さ ${runs[0]._pcm.length} / ${runs[1]._pcm.length}、最大の差 ${maxAbs.toExponential(2)}）`}<br>`
    + `別のシード（1 回目と 3 回目）：${diff ? '<span class="ok">異なる（期待どおり）</span>' : '<span class="bad">同じになった（シードが効いていない）</span>'}`;
  renderReport();
}

// ---------------------------------------------------------------- 5. 試験 B
function renderPairs() {
  $('b-list').innerHTML = PAIRS.map((p, i) => `
    <div class="pair" id="pair-${i}">
      <div class="row"><b>${i + 1}.</b> <button class="sub" data-pair="${i}" disabled>両方を生成</button>
        ${p.raw === p.yomi ? '<span class="same">辞書で変わらない文（2 つの音は同じシードなので、違えば非決定性）</span>' : ''}</div>
      <div class="cols">
        <div><div class="label">原稿のまま</div><div class="txt">${esc(p.raw)}</div><div class="out" id="pair-${i}-raw"></div></div>
        <div><div class="label">読み辞書の後（TTS に渡す文）</div><div class="txt">${esc(p.yomi)}</div><div class="out" id="pair-${i}-yomi"></div></div>
      </div>
    </div>`).join('');
  for (const b of document.querySelectorAll('button[data-pair]')) b.addEventListener('click', () => run(() => testBPair(+b.dataset.pair)));
}
async function testBPair(i) {
  const p = PAIRS[i], seed = parseInt($('seed').value, 10) || 0;
  const res = {};
  for (const side of ['raw', 'yomi']) {
    const el = $(`pair-${i}-${side}`);
    el.innerHTML = '<span class="muted">生成中…</span>';
    const r = await synth('B', `B${i + 1}-${side}`, p[side], seed);
    res[side] = r;
    el.innerHTML = `${player(r, `testB_${i + 1}_${side}`)}<div class="muted">${f2(r.audioSec)} s・生成 ${f2(r.genSec)} s・RTF ${f2(r.rtf)}</div>`;
  }
  state.testB[p.key] = { raw: p.raw, yomi: p.yomi, seed, precision: loadedPrec, voice: state.voice?.name, rawRun: res.raw.n, yomiRun: res.yomi.n, rawSha1: res.raw.sha1, yomiSha1: res.yomi.sha1 };
  renderReport();
}
async function testBAll() { for (let i = 0; i < PAIRS.length; i++) await testBPair(i); }

// ---------------------------------------------------------------- 試験 D（mlx とブラウザ）
function renderMlx() {
  $('d-list').innerHTML = MLX.map((m, i) => `
    <div class="pair">
      <div class="row"><b>${i + 1}.</b> 声 ${m.voice}：${esc(m.text)}</div>
      <div class="cols">
        <div><div class="label">mlx（Mac のサーバー）</div><audio controls preload="none" src="samples/mlx/${m.id}_${m.voice}.m4a"></audio><div class="muted">${f2(m.sec)} s</div></div>
        <div><div class="label">ブラウザ（このページ）</div><button class="sub" data-mlx="${i}" disabled>同じものをブラウザで生成</button><div class="out" id="mlx-${i}"></div></div>
      </div>
    </div>`).join('');
  for (const b of document.querySelectorAll('button[data-mlx]')) b.addEventListener('click', () => run(() => testDOne(+b.dataset.mlx)));
}
async function testDOne(i) {
  const m = MLX[i], seed = parseInt($('seed').value, 10) || 0;
  const el = $(`mlx-${i}`);
  el.innerHTML = '<span class="muted">生成中…</span>';
  const r = await synth('D', `D${i + 1}-${m.id}-${m.voice}`, m.text, seed, await presetVoice(m.voice));
  el.innerHTML = `${player(r, `testD_${m.id}_${m.voice}_web`)}<div class="muted">${f2(r.audioSec)} s（mlx ${f2(m.sec)} s）・生成 ${f2(r.genSec)} s・RTF ${f2(r.rtf)}</div>`;
  state.testD[`${m.id}_${m.voice}`] = { text: m.text, voice: m.voice, seed, precision: loadedPrec, mlxSec: m.sec, webSec: r.audioSec, webGenSec: r.genSec, run: r.n, sha1: r.sha1 };
  renderReport();
}
async function testDAll() { for (let i = 0; i < MLX.length; i++) await testDOne(i); }

// ---------------------------------------------------------------- 6. 試験 C（一覧と要約）
function renderRuns() {
  $('c-table').tBodies[0].innerHTML = state.runs.map((r) => `<tr><td class="num">${r.n}</td><td>${esc(r.label)}${r.firstRun ? ' <span class="muted">（初回）</span>' : ''}</td><td>${r.precision}</td><td class="num">${r.seed}</td><td class="num">${r.chars}</td>`
    + `<td class="num">${f2(r.genSec)} s</td><td class="num">${f2(r.audioSec)} s</td><td class="num">${f2(r.rtf)}</td>`
    + `<td class="mono">text ${r.ms.text} · ref ${r.ms.refEnc} · spk ${r.ms.speaker} · dur ${r.ms.duration} · DiT ${r.ms.dit} · dec ${r.ms.decode}</td></tr>`).join('');
  const s = summary();
  $('c-summary').innerHTML = Object.entries(s).map(([prec, v]) => `${prec}：${v.count} 回（初回を除く）・RTF 平均 ${f2(v.meanRtf)}（最小 ${f2(v.minRtf)}、最大 ${f2(v.maxRtf)}）・生成 ${f2(v.genSec)} s で音声 ${f2(v.audioSec)} s`).join('<br>');
}
function summary() {
  const out = {};
  for (const prec of ['fp16', 'fp32']) {
    const rs = state.runs.filter((r) => r.precision === prec && !r.firstRun);
    if (!rs.length) continue;
    const rt = rs.map((r) => r.rtf);
    const gen = rs.reduce((a, r) => a + r.genSec, 0), aud = rs.reduce((a, r) => a + r.audioSec, 0);
    out[prec] = { count: rs.length, meanRtf: +(rt.reduce((a, b) => a + b, 0) / rt.length).toFixed(3), minRtf: Math.min(...rt), maxRtf: Math.max(...rt), genSec: +gen.toFixed(2), audioSec: +aud.toFixed(2), pooledRtf: +(gen / aud).toFixed(3),
      firstRunRtf: state.runs.find((r) => r.precision === prec && r.firstRun)?.rtf ?? null };
  }
  return out;
}

// ---------------------------------------------------------------- 7. 報告
function report() {
  return {
    page: 'Egatari Studio lab/irodori.html', time: new Date().toISOString(), location: location.href,
    upstream: { irodoriTtsWebgpu: 'aa3b6390018bb09a2e461c95d1f55992c06e197d', hfRepo: HF_REPO, hfRevision: HF_REV, ort: ORT_VERSION, transformers: TRANSFORMERS_VERSION },
    env: state.env, load: state.load, voice: state.voice,
    settings: { seed: parseInt($('seed').value, 10) || 0, steps: parseInt($('steps').value, 10) || 40 },
    testA: state.testA, testB: state.testB, testD: state.testD, summary: summary(),
    runs: state.runs.map(({ _url, _pcm, ...r }) => r),
    errors: state.errors,
  };
}
function renderReport() { $('report-json').textContent = JSON.stringify(report(), null, 1); }
async function copyReport() {
  const s = JSON.stringify(report(), null, 1);
  try { await navigator.clipboard.writeText(s); $('copy-status').textContent = 'コピーしました'; }
  catch {
    const ta = document.createElement('textarea'); ta.value = s; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    $('copy-status').textContent = ok ? 'コピーしました' : 'コピーできませんでした。下の JSON を選んでコピーしてください';
  }
}

// ---------------------------------------------------------------- つなぐ
function setRunButtons(on) {
  for (const b of [$('btn-a'), $('btn-b-all'), $('btn-d-all'), ...document.querySelectorAll('button[data-pair], button[data-mlx]')]) b.disabled = !on;
}
// 合成の実行：1 本ずつ、終わるまで他のボタンを止める。失敗は画面と報告に出す
function run(fn) {
  return serial(async () => {
    setRunButtons(false); $('btn-load').disabled = true;
    try { await fn(); }
    catch (e) { console.error(e); state.errors.push(String(e.message || e)); alert('失敗しました：' + (e.message || e)); renderReport(); }
    finally { setRunButtons(!!tts); $('btn-load').disabled = !state.env.adapter; }
  });
}

renderPairs();
renderMlx();
$('btn-d-all').addEventListener('click', () => run(testDAll));
$('btn-load').addEventListener('click', () => serial(loadModel));
$('btn-clear').addEventListener('click', clearCache);
$('btn-a').addEventListener('click', () => run(testA));
$('btn-b-all').addEventListener('click', () => run(testBAll));
$('btn-copy').addEventListener('click', copyReport);
for (const r of document.querySelectorAll('input[name=voice]')) r.addEventListener('change', () => loadVoice().catch((e) => { $('voice-status').textContent = '声を読めませんでした：' + (e.message || e); }));
$('voice-file').addEventListener('change', () => { document.querySelector('input[name=voice][value=file]').checked = true; loadVoice().catch((e) => { $('voice-status').textContent = '声を読めませんでした：' + (e.message || e); }); });
await detectEnv();
loadVoice().catch((e) => { $('voice-status').textContent = '声を読めませんでした：' + (e.message || e); });
renderReport();
// 自動の確かめ（Playwright）用の口
window.__lab = { state, report, loadModel: () => serial(loadModel), testA: () => run(testA), testBPair: (i) => run(() => testBPair(i)), testD: (i) => run(() => testDOne(i)), loadVoice };
