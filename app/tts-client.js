// ブラウザの TTS（音声の板 app/audio-panel.js の「TTS で作り直す」）。
//   const tts = createTtsClient({lang, test, confirm})
//   tts.info(deckLang) → {ok, reason, hint?, label}    使えるか・何を使うか（モデルの取得の大きさ）。hint：使えないときに板に出す案内（録音を先に）
//   tts.synth({lang, text, role, voices, onProgress(f, label)}) → {pcm: Float32Array, sr, recipe: {engine, model, voice, seed}}
//
// 合成は別の窓（lab/tts-helper.html。編集アプリと同じサイトのページ）で動かす：編集アプリのページは外へ繋がらない決まり（CSP の
// connect-src 'self'）のままにし、モデルとライブラリ（jsDelivr・Hugging Face、版は固定）を取るのはその窓だけにする。
// 窓に渡すのは読む文（読み辞書の後）と声の名前だけ、受け取るのは音（PCM）だけ。答えは、開いた窓（e.source）・同じ origin・
// 送った番号のものだけを受け、大きさ（長さ・標本化周波数）を確かめる。初めて開く前に、取得する大きさを見せて確かめる（confirm）。
// 日本語のデッキは Irodori-TTS 500M-v3（声は voice.json の bob・alice、シード 0）、ほかは Kokoro-82M。WebGPU が要る。
// 1 ファイル版（file://）では使えない（窓のページがない）
// test() が差し替え（{info, synth}）を返せば、それを使う（試験：モデルを取りに行かない）
import { AUDIO_LIMITS } from '../kit/core/audio-core.mjs';

const TYPE = 'studio-tts';
const GB = (n) => (n / 1e9).toFixed(2);
// 取得する大きさ（lab/tts-engine.mjs の irodoriBytes('fp16')・KOKORO_BYTES と同じ数。窓を開く前に見せるので、ここにも持つ）
const IRODORI_BYTES = { fp16: 1260000000, fp32: 2440000000 }, KOKORO_BYTES = 326600000;

export function createTtsClient({ lang = 'ja', test = () => null, confirm = async () => true, helperUrl = 'lab/tts-helper.html' } = {}) {
  const EN = lang === 'en';
  let win = null, ready = null, seq = 0, confirmed = new Set();
  const waiting = new Map();
  const engineOf = (deckLang) => (/^ja\b/i.test(deckLang || '') ? 'irodori' : 'kokoro');
  const label = (engine) => engine === 'irodori'
    ? (EN ? `Irodori-TTS 500M-v3 (Japanese, with the reading dictionary, seed 0). First use downloads about ${GB(IRODORI_BYTES.fp16)} GB (fp32 GPUs: ${GB(IRODORI_BYTES.fp32)} GB), later from the browser cache. Runs on this computer's GPU in a separate window`
      : `Irodori-TTS 500M-v3（日本語・読み辞書つき・シード 0）。初回に約 ${GB(IRODORI_BYTES.fp16)} GB を取得（fp16 の使えない GPU は ${GB(IRODORI_BYTES.fp32)} GB）、以後はブラウザのキャッシュから。この PC の GPU で、別の窓で合成します`)
    : (EN ? `Kokoro-82M (English). First use downloads about ${(KOKORO_BYTES / 1e6).toFixed(0)} MB, later from the browser cache. Runs on this computer's GPU in a separate window`
      : `Kokoro-82M（英語）。初回に約 ${(KOKORO_BYTES / 1e6).toFixed(0)} MB を取得、以後はブラウザのキャッシュから。この PC の GPU で、別の窓で合成します`);
  // WebGPU がないとき：まず録音を勧める（コマンドの案内は出さない。端末で使う人向けの言葉だけ）
  const noGpu = EN ? 'Record the narration with “● Record” above: that works in any browser. Browser TTS needs WebGPU, which this browser does not have (use a recent Chrome or Edge on a computer)'
    : '上の「● 録音」で、自分の声で録音できます（どのブラウザでも使えます）。ブラウザの TTS には WebGPU が要り、このブラウザでは使えません（パソコンの新しい Chrome か Edge で開いてください）';
  // 1 ファイル版（file://）：TTS の窓のページがない。録音を先に、TTS は配信版で
  const noFileHint = EN ? '“Regenerate with TTS” is not available in this single-file editor (file://). Record the narration with “● Record” above, or open the hosted editor (or a served dist/) for browser TTS'
    : '「TTS で作り直す」は、この 1 ファイル版のエディタ（file://）では使えません。上の「● 録音」で録音できます。ブラウザの TTS は配信版のエディタ（か、dist/ を配ったもの）で使えます';
  const noFile = EN ? 'not in the single-file editor (open the hosted editor, or serve dist/)' : '1 ファイル版のエディタでは使えません（配信版か、dist/ を配って開いてください）';

  window.addEventListener('message', (e) => {
    if (!win || e.source !== win || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.type !== TYPE) return;
    if (m.kind === 'ready') { if (ready) ready.resolve(); return; }
    const w = waiting.get(m.id);
    if (!w) return;
    if (m.kind === 'progress') { if (w.onProgress) w.onProgress(Math.max(0, Math.min(1, +m.f || 0)), typeof m.label === 'string' ? m.label.slice(0, 200) : ''); return; }
    waiting.delete(m.id);
    if (m.kind === 'error') { w.reject(Object.assign(new Error(String(m.message || 'TTS failed').slice(0, 500)), { code: String(m.code || 'tts') })); return; }
    if (m.kind === 'result') {
      const sr = +m.sr;
      if (!(m.pcm instanceof Float32Array) || !(sr >= 8000 && sr <= 96000) || m.pcm.length > AUDIO_LIMITS.maxSeconds * sr) { w.reject(new Error('bad audio from the TTS window')); return; }
      w.resolve({ pcm: m.pcm, sr, recipe: m.recipe && typeof m.recipe === 'object' ? m.recipe : { engine: 'unknown', model: 'unknown', voice: {}, seed: null } });
    }
  });
  async function open() {
    if (win && !win.closed && ready && ready.done) return win;
    const url = new URL(typeof helperUrl === 'function' ? helperUrl() : helperUrl, document.baseURI);
    url.searchParams.set('lang', EN ? 'en' : 'ja');
    let res, rej;
    ready = { promise: new Promise((a, b) => { res = a; rej = b; }), done: false };
    ready.resolve = () => { ready.done = true; res(); };
    win = window.open(url.href, 'studio-tts', 'popup,width=520,height=420');
    if (!win) throw Object.assign(new Error(EN ? 'the TTS window was blocked (allow pop-ups for this site)' : 'TTS の窓が開けませんでした（このサイトのポップアップを許可してください）'), { code: 'popup' });
    const t = setTimeout(() => rej(new Error(EN ? 'the TTS window did not start' : 'TTS の窓が始まりませんでした')), 30000);
    try { await ready.promise; } finally { clearTimeout(t); }
    return win;
  }
  return {
    info(deckLang) {
      const t = test();
      if (t) return t.info(deckLang);
      if (location.protocol === 'file:') return { ok: false, reason: noFile, hint: noFileHint, label: '' };
      if (!navigator.gpu) return { ok: false, reason: EN ? 'no WebGPU in this browser' : 'このブラウザには WebGPU がありません', hint: noGpu, label: label(engineOf(deckLang)) };
      return { ok: true, reason: '', label: label(engineOf(deckLang)) };
    },
    async synth({ lang: deckLang, text, role, voices, onProgress }) {
      const t = test();
      if (t) return t.synth({ lang: deckLang, text, role, voices, onProgress });
      const engine = engineOf(deckLang);
      if (!confirmed.has(engine)) {
        if (!(await confirm(label(engine)))) throw Object.assign(new Error(EN ? 'cancelled' : '取り消しました'), { code: 'cancelled' });
        confirmed.add(engine);
      }
      const w = await open();
      const id = ++seq;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject, onProgress });
        w.postMessage({ type: TYPE, kind: 'synth', id, engine, text: String(text), role, voice: (voices && voices[role]) || null }, location.origin);
        // 窓を閉じたら止める
        const iv = setInterval(() => { if (!waiting.has(id)) clearInterval(iv); else if (w.closed) { clearInterval(iv); waiting.delete(id); reject(new Error(EN ? 'the TTS window was closed' : 'TTS の窓が閉じられました')); } }, 500);
      });
    },
  };
}
