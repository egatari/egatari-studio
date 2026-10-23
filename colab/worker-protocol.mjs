// Colab の常駐ワーカーの通信（JSON の行。モデルを使わないので、偽の合成で試験できる：tools/test-colab.mjs）
//   入力（1 行 1 依頼）：{"id": 1, "text": "...", "voice": "<WAV のパス>", "out": "<書く WAV のパス>", "steps": 40, "seed": 0}
//                       {"cmd": "quit"} で終わる（入力が閉じても終わる）
//   出力（1 行 1 返事）：{"ready": true, "providers": ["cpu"], "provider": "cpu", "notice": "..."}（読み込みが済んだとき。serve の前に呼ぶ側が書く。
//                       providers は使う実行プロバイダの並び、provider は実際に使っているもの 1 つ（記録の recipe.runtime に。colab/ort-fallback.mjs の actualProvider）、notice は GPU を使えず CPU にしたときのお知らせ（なければ無い。エラーではない））／{"id": 1, "ok": true}／{"id": 1, "ok": false, "error": "..."}
// 依頼は届いた順に 1 つずつ処理する（GPU を取り合わない）。1 つの失敗でワーカーは止まらない（返事に error を入れる）。Node 20 でも動く
import readline from 'node:readline';

export const reply = (output, obj) => output.write(JSON.stringify(obj) + '\n');

export function serve({ input, output, handler }) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let chain = Promise.resolve(), quit = false;
  rl.on('line', (line) => {
    if (quit || !line.trim()) return;
    if (/^\s*\{\s*"cmd"\s*:\s*"quit"\s*\}\s*$/.test(line)) { quit = true; rl.close(); return; }   // quit より後ろの行は処理しない
    chain = chain.then(async () => {
      let req;
      try { req = JSON.parse(line); } catch (e) { reply(output, { id: null, ok: false, error: 'bad request line: ' + e.message }); return; }
      try { await handler(req); reply(output, { id: req.id ?? null, ok: true }); }
      catch (e) { reply(output, { id: req && req.id != null ? req.id : null, ok: false, error: String((e && e.stack) || e) }); }
    });
  });
  return new Promise((resolve) => rl.on('close', () => chain.then(resolve)));
}
