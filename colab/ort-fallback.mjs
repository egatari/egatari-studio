// Colab の Node ワーカー（colab/irodori_node.mjs）の ONNX セッションの作り方：GPU（CUDA）で作れなければ CPU で作り直す。
// CUDA の実行プロバイダは、onnxruntime-node が落とした libonnxruntime_providers_cuda.so と、Colab のイメージの CUDA の版が合わないと
// 読み込めない（例：onnxruntime-node 1.30 は CUDA 13 の libcublasLt.so.13 を要るが、イメージが CUDA 12 だった。2026-10-23 の講習）。
// そのときは同じセッションを ['cpu'] で作り直し、それを覚えて以後のセッションは最初から CPU にする。お知らせは 1 度だけ（日本語と英語の 1 行）。
// CPU でも作れないとき（モデルが壊れているなど）は、その CPU のエラーをそのまま投げる（隠さない）。モデルを使わないので試験できる（tools/test-colab.mjs）
//   const f = sessionFactory({ create: (file, opts) => ort.InferenceSession.create(file, opts), providers: ['cuda', 'cpu'], log: console.error });
//   const s = await f.create(file, { graphOptimizationLevel: 'all' });   // f.providers：今使っているもの／f.notice：お知らせ（なければ null）
// Node 20 で動く（新しい API は使わない）

export const firstLine = (e) => String((e && e.message) || e || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 300) || '(no message)';

export const cpuNotice = (reason) =>
  `GPU（CUDA）を使えないため、CPU で合成します（遅くなります） / GPU (CUDA) could not be used, so the CPU is used and synthesis is slower. 理由 / reason: ${reason}`;

export function sessionFactory({ create, providers, log = () => {} }) {
  const f = {
    providers: [...providers],
    notice: null,
    async create(file, opts = {}) {
      try {
        return await create(file, { ...opts, executionProviders: f.providers });
      } catch (e) {
        if (f.providers.every((p) => p === 'cpu')) throw e;   // もう CPU だけ：プロバイダの問題ではない
        f.providers = ['cpu'];
        f.notice = cpuNotice(firstLine(e));
        log(f.notice);
        return await create(file, { ...opts, executionProviders: f.providers });
      }
    },
  };
  return f;
}

// EGATARI_ORT_PROVIDERS（"cuda,cpu" など）を読む。空なら既定（GPU があれば使う）
export const providersFromEnv = (v) => {
  const list = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ['cuda', 'cpu'];
};
