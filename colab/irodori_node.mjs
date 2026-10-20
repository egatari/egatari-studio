// Colab 用：Irodori-TTS 500M-v3（ONNX）を Node で 1 区切り合成する（colab/egatari_tts.py の irodori_synth が呼ぶ。実際の Colab での検証はまだ）。
//   node colab/irodori_node.mjs <req.json>
//   req.json：{text, voice（参照音声の WAV のパス）, out（書く WAV のパス）, modelDir（Hugging Face の固定版を落としたフォルダ）, steps, seed}
// 推論の本体は lab/vendor/irodori-tts-webgpu/pipeline.mjs（ブラウザ版と同じコード。ort・セッション・トークナイザを渡す設計）。
// 依存（onnxruntime-node・@huggingface/transformers）はノートブックが一時フォルダに入れ、NODE_PATH で渡す。リポジトリの package.json には入れない
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const req = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// ノートブックが入れた依存（NODE_PATH の下）を読む
const require = createRequire(path.join(process.env.EGATARI_NODE_DEPS || process.cwd(), 'x.js'));
const ort = require('onnxruntime-node');
const T = await import(pathToFileURL(require.resolve('@huggingface/transformers')).href);
const { IrodoriTTS } = await import(pathToFileURL(path.join(ROOT, 'lab/vendor/irodori-tts-webgpu/pipeline.mjs')).href);
const { decodeWav, encodeWav, toMono, resample } = await import(pathToFileURL(path.join(ROOT, 'kit/core/audio-core.mjs')).href);

const MODELS = { text: 'text_encoder', speaker: 'speaker_encoder', duration: 'duration', dit: 'dit', dac: 'dacvae_decoder', enc: 'dacvae_encoder' };   // lab/tts-engine.mjs の MODELS と同じ
const folder = fs.existsSync(path.join(req.modelDir, 'onnx_fp16')) ? 'onnx_fp16' : 'onnx';
const providers = process.env.EGATARI_ORT_PROVIDERS ? process.env.EGATARI_ORT_PROVIDERS.split(',') : ['cuda', 'cpu'];
const sessions = {};
for (const [k, name] of Object.entries(MODELS)) {
  sessions[k] = await ort.InferenceSession.create(path.join(req.modelDir, folder, `${name}.onnx`), { executionProviders: providers, graphOptimizationLevel: 'all', logSeverityLevel: 3 });
}
T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = path.join(req.modelDir, 'tokenizer') + path.sep;
const tokenizer = await T.AutoTokenizer.from_pretrained('llmjp_tok');
const tts = new IrodoriTTS({ ort, sessions, tokenizer });

const w = decodeWav(new Uint8Array(fs.readFileSync(req.voice)));
if (!w) throw new Error('the reference voice is not a WAV file');
const ref = resample(toMono(w.channels), w.sr, 48000);
const r = await tts.synthesize(req.text, ref, 48000, { numSteps: req.steps || 40, seed: req.seed || 0 });
fs.writeFileSync(req.out, encodeWav(r.audio instanceof Float32Array ? r.audio : Float32Array.from(r.audio), r.sampleRate));
