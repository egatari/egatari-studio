// 試験用の偽の常駐ワーカー（モデルなし）：colab/irodori_node.mjs と同じ通信（colab/worker-protocol.mjs）で、文の長さの正弦波を out に書く。
// text が "boom" なら失敗を返し、"die" なら標準エラーに書いて終了コード 3 で落ちる。標準エラーに起動の行を出す（ログは標準エラーへ）
// セッションは colab/ort-fallback.mjs で 6 つ作る（偽の create）。EGATARI_FAKE_ORT_FAIL=cuda なら、cuda を含むプロバイダでの作成が
// 2026-10-23 の Colab と同じ文で失敗する（CPU への切り替えとお知らせを試す）。EGATARI_FAKE_ORT_FAIL=all なら CPU でも失敗する
import fs from 'node:fs';
import { serve, reply } from '../colab/worker-protocol.mjs';
import { sessionFactory, providersFromEnv } from '../colab/ort-fallback.mjs';
import { encodeWav } from '../kit/core/wav-core.mjs';

const fail = process.env.EGATARI_FAKE_ORT_FAIL || '';
const tries = [];
const factory = sessionFactory({
  providers: providersFromEnv(process.env.EGATARI_ORT_PROVIDERS),
  log: (m) => console.error(m),
  create: async (file, opts) => {
    tries.push(opts.executionProviders.join(','));
    if (fail === 'all' || (fail === 'cuda' && opts.executionProviders.includes('cuda'))) {
      throw new Error('OrtSessionOptionsAppendExecutionProvider_Cuda: Failed to load shared library\n(libcublasLt.so.13: cannot open shared object file)');
    }
    return { file };
  },
});
for (const name of ['text_encoder', 'speaker_encoder', 'duration', 'dit', 'dacvae_decoder', 'dacvae_encoder']) await factory.create(name + '.onnx', {});
console.error('fake worker: loaded once; session tries: ' + tries.join(' | '));
reply(process.stdout, { ready: true, providers: factory.providers, ...(factory.notice ? { notice: factory.notice } : {}) });
await serve({
  input: process.stdin, output: process.stdout,
  handler: async (req) => {
    if (req.text === 'boom') throw new Error('boom!');
    if (req.text === 'die') { console.error('fatal: out of memory (fake)'); process.exit(3); }
    const n = Math.round(24000 * (0.3 + 0.05 * req.text.length)), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 200 * i) / 24000 + (req.seed || 0));
    fs.writeFileSync(req.out, encodeWav(x, 24000));
  },
});
