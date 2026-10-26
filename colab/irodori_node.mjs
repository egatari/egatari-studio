// Colab 用：Irodori-TTS 500M-v3（ONNX）を Node で合成する常駐ワーカー（colab/egatari_tts.py の irodori_synth が 1 度だけ起動する。実際の Colab での検証はまだ）。
//   node colab/irodori_node.mjs <modelDir>
//   modelDir：Hugging Face の固定版を local_dir に落としたフォルダ（実ファイル。キャッシュの symlink だと onnxruntime-node が外部データを断る）
// 6 つの ONNX セッションとトークナイザを 1 度だけ読み込み、標準出力に {"ready":true} を 1 行書く。そのあと標準入力の JSON の行（colab/worker-protocol.mjs）
// ごとに 1 区切りを合成して out に WAV を書く。seed・steps は依頼ごと（同じ依頼なら同じ音）。標準出力はプロトコル専用（ログは標準エラーへ）
// 推論の本体は lab/vendor/irodori-tts-webgpu/pipeline.mjs（ブラウザ版と同じコード。ort・セッション・トークナイザを渡す設計）。
// 依存（onnxruntime-node・@huggingface/transformers）はノートブックが一時フォルダに入れ、EGATARI_NODE_DEPS で渡す。リポジトリの package.json には入れない。
// WAV の道具は kit/core/wav-core.mjs だけ（audio-core → portable → bounded-html → parse5 を引かない）。Node 20 で動く（新しい API は使わない）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve, reply } from './worker-protocol.mjs';
import { sessionFactory, providersFromEnv, actualProvider, supportedBackends } from './ort-fallback.mjs';
import { decodeWav, encodeWav, toMono, resample } from '../kit/core/wav-core.mjs';
import { profileSessions } from './stage-profile.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modelDir = process.argv[2];
if (!modelDir) { console.error('usage: node colab/irodori_node.mjs <modelDir>'); process.exit(2); }
// ノートブックが入れた依存を読む
const require = createRequire(path.join(process.env.EGATARI_NODE_DEPS || process.cwd(), 'x.js'));
const ort = require('onnxruntime-node');
const T = await import(pathToFileURL(require.resolve('@huggingface/transformers')).href);
const { IrodoriTTS } = await import(pathToFileURL(path.join(ROOT, 'lab/vendor/irodori-tts-webgpu/pipeline.mjs')).href);

const MODELS = { text: 'text_encoder', speaker: 'speaker_encoder', duration: 'duration', dit: 'dit', dac: 'dacvae_decoder', enc: 'dacvae_encoder' };   // lab/tts-engine.mjs の MODELS と同じ
// 重みのフォルダ：EGATARI_IRODORI_FOLDER（onnx か onnx_fp16）があればそれ、なければ onnx_fp16（あれば）か onnx。
// ノートブックは GPU では onnx_fp16、CPU では onnx（fp32）を落とす。CPU の onnxruntime は fp16 の演算が遅い（Mac の CPU で dit が fp32 の約 1.8 倍の時間）
const want = process.env.EGATARI_IRODORI_FOLDER;
const folder = want && ['onnx', 'onnx_fp16'].includes(want) && fs.existsSync(path.join(modelDir, want)) ? want
  : fs.existsSync(path.join(modelDir, 'onnx_fp16')) ? 'onnx_fp16' : 'onnx';
const t0 = performance.now();
// GPU（CUDA）で作れないセッションは CPU で作り直し、以後は最初から CPU（colab/ort-fallback.mjs）。お知らせは ready の返事に入れ、Python がノートブックに出す
const factory = sessionFactory({ create: (file, opts) => ort.InferenceSession.create(file, opts), providers: providersFromEnv(process.env.EGATARI_ORT_PROVIDERS), log: (m) => console.error(m) });
const sessions = {};
for (const [k, name] of Object.entries(MODELS)) {
  console.error(`loading ${name} (${factory.providers.join(',')})`);
  sessions[k] = await factory.create(path.join(modelDir, folder, `${name}.onnx`), { graphOptimizationLevel: 'all', logSeverityLevel: 3 });
}
T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = path.join(modelDir, 'tokenizer') + path.sep;
const tokenizer = await T.AutoTokenizer.from_pretrained('llmjp_tok');
const loadS = Math.round(performance.now() - t0) / 1000;
// EGATARI_PROFILE=1：依頼ごとの段の時間を返事に入れる（colab/stage-profile.mjs。ノートブックの PROFILE）
const prof = process.env.EGATARI_PROFILE === '1' ? profileSessions(sessions) : null;
const tts = new IrodoriTTS({ ort, sessions: prof ? prof.sessions : sessions, tokenizer });
// 参照音声の潜在表現（dacvae_encoder）と話者の状態（speaker_encoder）は、同じ参照音声なら区切りごとに同じなので、声ごとに 1 度だけ計算して使い回す
// （入力が同じなので結果も同じで、音は変わらない。CPU では dacvae_encoder が 1 区切りに数秒かかり、diffusion の steps によらない固定の時間の大部分だった）。
// 鍵は配列そのもの（refOf が声ごとに同じ Float32Array を返し、wavToRefLatent の結果の latent も同じものを返す）
// 失敗した計算は覚えない（次の依頼でやり直す）。sr と opts は synthesize からはいつも同じ（48 kHz・既定）
const memo = (fn) => { const m = new WeakMap(); return (x, ...rest) => { if (!m.has(x)) { const p = Promise.resolve(fn(x, ...rest)); m.set(x, p); p.catch(() => m.delete(x)); } return m.get(x); }; };
tts.wavToRefLatent = memo(tts.wavToRefLatent.bind(tts));
tts.encodeRefLatent = memo(tts.encodeRefLatent.bind(tts));

const refs = new Map();   // 参照音声（声ごとに 1 度だけ読んで 48 kHz に）
const refOf = (voice) => {
  if (!refs.has(voice)) {
    const w = decodeWav(new Uint8Array(fs.readFileSync(voice)));
    if (!w) throw new Error('the reference voice is not a WAV file: ' + voice);
    refs.set(voice, resample(toMono(w.channels), w.sr, 48000));
  }
  return refs.get(voice);
};

reply(process.stdout, { ready: true, providers: factory.providers, provider: actualProvider(factory, supportedBackends(ort)), folder, loadS, ...(factory.notice ? { notice: factory.notice } : {}) });
await serve({
  input: process.stdin, output: process.stdout,
  handler: async (req) => {
    const t = performance.now();
    if (prof) prof.reset();
    const r = await tts.synthesize(req.text, refOf(req.voice), 48000, { numSteps: req.steps || 40, seed: req.seed || 0 });
    fs.writeFileSync(req.out, encodeWav(r.audio instanceof Float32Array ? r.audio : Float32Array.from(r.audio), r.sampleRate));
    return prof ? { profile: { stages: prof.take(), totalS: Math.round(performance.now() - t) / 1000 } } : undefined;
  },
});
process.exit(0);
