// 編集アプリの「TTS で作り直す」の窓（app/tts-client.js が開く）。説明は lab/tts-helper.html の冒頭
// 受け取るもの（開いた編集アプリのページから。同じ origin で、開いた窓 window.opener からのものだけ）：
//   {type: 'studio-tts', kind: 'synth', id, engine: 'irodori' | 'kokoro', text, voice, role}
// 返すもの：{kind: 'ready'}（読み込んだ）・{kind: 'progress', id, f, label}・{kind: 'result', id, pcm, sr, recipe}・{kind: 'error', id, message, code}
// 文（読み辞書を通した後）と声の名前のほかは受け取らず、音（48 kHz か 24 kHz の Float32）のほかは返さない。原稿のフォルダには触らない。
// ?stub=1：モデルを取りに行かず、文の長さに比例した長さの音を返す（試験で窓とのやり取りを確かめる）
import { webgpuAdapter, loadIrodori, loadKokoro, presetVoice, irodoriBytes, irodoriModel, kokoroModel, kokoroVoice, KOKORO_BYTES, IRODORI_DEFAULTS, SR, IRODORI_VOICES, KOKORO_VOICES } from './tts-engine.mjs';

const TYPE = 'studio-tts';
const EN = new URLSearchParams(location.search).get('lang') === 'en';
const STUB = new URLSearchParams(location.search).get('stub') === '1';
const $ = (id) => document.getElementById(id);
const mb = (n) => (n / 1e6).toFixed(0);
document.documentElement.lang = EN ? 'en' : 'ja';
$('title').textContent = EN ? 'Egatari Studio — browser TTS' : 'Egatari Studio — ブラウザの TTS';
$('lead').textContent = EN
  ? 'This window makes narration audio for the editor on this computer\'s GPU (WebGPU). It downloads the model once from Hugging Face (later from the browser cache) and receives only the text to read and the voice name. Keep it open while you regenerate; close it to free the GPU memory.'
  : 'この窓は、編集アプリの口述原稿の音声をこの PC の GPU（WebGPU）で作ります。モデルは初回だけ Hugging Face から取り（以後はブラウザのキャッシュから）、受け取るのは読む文と声の名前だけです。作り直している間は開いたままにしてください。閉じると GPU のメモリが空きます。';
const status = (t, bad) => { $('status').textContent = t; $('status').className = bad ? 'bad' : ''; };
const log = (t) => { $('log').textContent += t + '\n'; };
const bar = (f) => { $('bar').style.width = (100 * Math.max(0, Math.min(1, f))).toFixed(1) + '%'; };

const opener = window.opener;
const send = (m, transfer = []) => { if (opener && !opener.closed) opener.postMessage({ type: TYPE, ...m }, location.origin, transfer); };

let irodori = null, irodoriPrec = null, kokoro = null, gpu = null;
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function ensureGpu() {
  if (gpu) return gpu;
  gpu = await webgpuAdapter();
  if (!gpu.ok) throw Object.assign(new Error(EN ? 'WebGPU is not available in this browser (' + gpu.reason + ')' : 'このブラウザでは WebGPU が使えません（' + gpu.reason + '）'), { code: 'no-webgpu' });
  return gpu;
}
async function getIrodori(id) {
  if (irodori) return irodori;
  const g = await ensureGpu();
  const prec = g.shaderF16 ? 'fp16' : 'fp32', total = irodoriBytes(prec);
  let done = 0;
  const label = (EN ? 'Loading Irodori-TTS (' : 'Irodori-TTS を読み込み中（') + prec + ', ' + mb(total) + ' MB)';
  status(label);
  const r = await loadIrodori({ prec, adapter: g.adapter, onBytes: (n) => { done += n; bar(done / total); send({ kind: 'progress', id, f: 0.9 * done / total, label: label + ' ' + mb(done) + ' MB' }); }, onLog: log, onCacheError: (m) => log('cache: ' + m) });
  irodori = r.tts; irodoriPrec = prec;
  return irodori;
}
async function getKokoro(id) {
  if (kokoro) return kokoro;
  await ensureGpu();
  const label = (EN ? 'Loading Kokoro-82M (' : 'Kokoro-82M を読み込み中（') + mb(KOKORO_BYTES) + ' MB)';
  status(label);
  const files = new Map();
  kokoro = await loadKokoro({ onLog: log, onProgress: (p) => {
    if (p && p.status === 'progress' && p.total) { files.set(p.file, p.loaded); const n = [...files.values()].reduce((a, b) => a + b, 0); bar(n / KOKORO_BYTES); send({ kind: 'progress', id, f: 0.9 * n / KOKORO_BYTES, label: label + ' ' + mb(n) + ' MB' }); }
  } });
  return kokoro;
}

async function synth(m) {
  const text = String(m.text || '').slice(0, 4000), role = m.role === 'novice' ? 'novice' : 'expert';
  if (STUB) {
    const sr = SR, n = Math.round((0.3 + text.length * 0.05) * sr), pcm = new Float32Array(n + Math.round(0.4 * sr));
    for (let i = 0; i < n; i++) pcm[i + Math.round(0.2 * sr)] = 0.2 * Math.sin(2 * Math.PI * (role === 'novice' ? 260 : 170) * i / sr);
    return { pcm, sr, recipe: { engine: 'stub', model: 'stub', voice: { [role]: String(m.voice || 'bob') }, seed: null } };
  }
  if (m.engine === 'kokoro') {
    const voice = kokoroVoice(m.voice, role);
    if (!voice) throw Object.assign(new Error(EN ? `voice "${m.voice}" is not bundled with the browser TTS (Kokoro voices such as ${KOKORO_VOICES.slice(0, 3).join(', ')})` : `声「${m.voice}」はブラウザの TTS に入っていません（Kokoro の声。${KOKORO_VOICES.slice(0, 3).join('・')} など）`), { code: 'no-voice' });
    const k = await getKokoro(m.id);
    status((EN ? 'Synthesizing: ' : '合成中：') + text.slice(0, 40));
    const a = await k.generate(text, { voice });
    return { pcm: Float32Array.from(a.audio), sr: a.sampling_rate, recipe: { engine: 'kokoro-web', model: kokoroModel(), voice: { [role]: voice }, seed: null } };
  }
  const voice = IRODORI_VOICES.includes(m.voice) ? m.voice : null;
  if (!voice) throw Object.assign(new Error(EN ? `voice "${m.voice}" is not bundled with the browser TTS (${IRODORI_VOICES.join(', ')})` : `声「${m.voice}」はブラウザの TTS に入っていません（${IRODORI_VOICES.join('・')}）`), { code: 'no-voice' });
  const tts = await getIrodori(m.id);
  const ref = await presetVoice(voice);
  status((EN ? 'Synthesizing: ' : '合成中：') + text.slice(0, 40));
  const r = await tts.synthesize(text, ref, SR, { numSteps: IRODORI_DEFAULTS.steps, seed: IRODORI_DEFAULTS.seed });
  return { pcm: r.audio instanceof Float32Array ? r.audio : Float32Array.from(r.audio), sr: r.sampleRate, recipe: { engine: 'irodori-web', model: irodoriModel(irodoriPrec), voice: { [role]: voice }, seed: IRODORI_DEFAULTS.seed } };
}

window.addEventListener('message', (e) => {
  // 開いた編集アプリのページ（同じ origin）からのものだけ
  if (e.origin !== location.origin || e.source !== opener) return;
  const m = e.data;
  if (!m || m.type !== TYPE || m.kind !== 'synth' || typeof m.id !== 'number') return;
  serial(async () => {
    try {
      const r = await synth(m);
      bar(1); status(EN ? 'Done. Waiting for the next line.' : 'できました。次の行を待っています');
      send({ kind: 'result', id: m.id, pcm: r.pcm, sr: r.sr, recipe: r.recipe }, [r.pcm.buffer]);
    } catch (err) {
      console.error(err);
      status(String(err.message || err), true);
      send({ kind: 'error', id: m.id, message: String(err.message || err), code: err.code || 'tts' });
    }
  });
});
status(opener ? (EN ? 'Ready.' : '準備ができました') : (EN ? 'Open this window from the editor (Audio → Regenerate with TTS).' : '編集アプリ（「音声」→「TTS で作り直す」）から開いてください'), !opener);
send({ kind: 'ready', v: 1, stub: STUB });
