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
import { sessionFactory, providersFromEnv } from './ort-fallback.mjs';
import { decodeWav, encodeWav, toMono, resample } from '../kit/core/wav-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modelDir = process.argv[2];
if (!modelDir) { console.error('usage: node colab/irodori_node.mjs <modelDir>'); process.exit(2); }
// ノートブックが入れた依存を読む
const require = createRequire(path.join(process.env.EGATARI_NODE_DEPS || process.cwd(), 'x.js'));
const ort = require('onnxruntime-node');
const T = await import(pathToFileURL(require.resolve('@huggingface/transformers')).href);
const { IrodoriTTS } = await import(pathToFileURL(path.join(ROOT, 'lab/vendor/irodori-tts-webgpu/pipeline.mjs')).href);

const MODELS = { text: 'text_encoder', speaker: 'speaker_encoder', duration: 'duration', dit: 'dit', dac: 'dacvae_decoder', enc: 'dacvae_encoder' };   // lab/tts-engine.mjs の MODELS と同じ
const folder = fs.existsSync(path.join(modelDir, 'onnx_fp16')) ? 'onnx_fp16' : 'onnx';
// GPU（CUDA）で作れないセッションは CPU で作り直し、以後は最初から CPU（colab/ort-fallback.mjs）。お知らせは ready の返事に入れ、Python がノートブックに出す
const factory = sessionFactory({ create: (file, opts) => ort.InferenceSession.create(file, opts), providers: providersFromEnv(process.env.EGATARI_ORT_PROVIDERS), log: (m) => console.error(m) });
const sessions = {};
for (const [k, name] of Object.entries(MODELS)) {
  console.error(`loading ${name} (${factory.providers.join(',')})`);
  sessions[k] = await factory.create(path.join(modelDir, folder, `${name}.onnx`), { graphOptimizationLevel: 'all', logSeverityLevel: 3 });
}
T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = path.join(modelDir, 'tokenizer') + path.sep;
const tokenizer = await T.AutoTokenizer.from_pretrained('llmjp_tok');
const tts = new IrodoriTTS({ ort, sessions, tokenizer });

const refs = new Map();   // 参照音声（声ごとに 1 度だけ読んで 48 kHz に）
const refOf = (voice) => {
  if (!refs.has(voice)) {
    const w = decodeWav(new Uint8Array(fs.readFileSync(voice)));
    if (!w) throw new Error('the reference voice is not a WAV file: ' + voice);
    refs.set(voice, resample(toMono(w.channels), w.sr, 48000));
  }
  return refs.get(voice);
};

reply(process.stdout, { ready: true, providers: factory.providers, ...(factory.notice ? { notice: factory.notice } : {}) });
await serve({
  input: process.stdin, output: process.stdout,
  handler: async (req) => {
    const r = await tts.synthesize(req.text, refOf(req.voice), 48000, { numSteps: req.steps || 40, seed: req.seed || 0 });
    fs.writeFileSync(req.out, encodeWav(r.audio instanceof Float32Array ? r.audio : Float32Array.from(r.audio), r.sampleRate));
  },
});
process.exit(0);
