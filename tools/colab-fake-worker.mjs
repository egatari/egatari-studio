// 試験用の偽の常駐ワーカー（モデルなし）：colab/irodori_node.mjs と同じ通信（colab/worker-protocol.mjs）で、文の長さの正弦波を out に書く。
// text が "boom" なら失敗を返し、"die" なら標準エラーに書いて終了コード 3 で落ちる。標準エラーに起動の行を出す（ログは標準エラーへ）
import fs from 'node:fs';
import { serve, reply } from '../colab/worker-protocol.mjs';
import { encodeWav } from '../kit/core/wav-core.mjs';

console.error('fake worker: loaded once');
reply(process.stdout, { ready: true });
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
