# irodori-tts-webgpu (vendored)

- Upstream: https://github.com/ngc-shj/irodori-tts-webgpu (MIT, see LICENSE)
- Commit: aa3b6390018bb09a2e461c95d1f55992c06e197d (2026-06-08)
- File: `runtime/pipeline.mjs`, copied unchanged.

The ONNX weights and tokenizer are not in this repository. `lab/irodori.js` loads them at
runtime from https://huggingface.co/noguchis/irodori-tts-onnx (pinned revision
b75a9bbf2c10e12682d37e91e0efaf6d4e54bd29). Weights: Irodori-TTS-500M-v3 (MIT) and
Semantic-DACVAE-Japanese-32dim (MIT); tokenizer: llm-jp-3-150m (Apache-2.0).
