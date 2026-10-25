// Colab の Node ワーカー（colab/irodori_node.mjs）の段の時間を測る（ノートブックの PROFILE のときだけ。EGATARI_PROFILE=1）。
// 6 つの ONNX セッションの run を包み、依頼ごとに「段ごとの合計の時間（秒）と呼ばれた回数」を返す。モデルを使わないので試験できる（tools/test-colab.mjs）
//   const p = profileSessions(sessions);   // p.sessions を IrodoriTTS に渡す
//   p.reset(); await tts.synthesize(...); const stages = p.take();   // {dit: {s: 4.3, n: 40}, decode: {...}, ...}
// 段の名前：text（文の符号化）・ref-encode（参照音声の符号化。使い回せば 2 回目からは出ない）・speaker・duration・dit（diffusion の各 step）・decode（音声への復号）
// Node 20 で動く（新しい API は使わない）
export const STAGE_NAMES = Object.freeze({ text: 'text', enc: 'ref-encode', speaker: 'speaker', duration: 'duration', dit: 'dit', dac: 'decode' });

export function profileSessions(sessions, now = () => performance.now()) {
  let acc = {};
  const wrapped = {};
  for (const [k, s] of Object.entries(sessions)) {
    const name = STAGE_NAMES[k] || k;
    wrapped[k] = new Proxy(s, {
      get(target, prop) {
        if (prop !== 'run') { const v = Reflect.get(target, prop); return typeof v === 'function' ? v.bind(target) : v; }
        return async (...args) => {
          const t = now();
          try { return await target.run(...args); } finally {
            const a = acc[name] || (acc[name] = { s: 0, n: 0 });
            a.s += (now() - t) / 1000; a.n++;
          }
        };
      },
    });
  }
  return {
    sessions: wrapped,
    reset() { acc = {}; },
    take() { const r = {}; for (const [k, v] of Object.entries(acc)) r[k] = { s: Math.round(v.s * 1000) / 1000, n: v.n }; acc = {}; return r; },
  };
}
