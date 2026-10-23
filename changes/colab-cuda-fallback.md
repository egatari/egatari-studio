### Fixed

- Colab notebook: when the GPU's CUDA libraries do not match onnxruntime (on 2026-10-23 Colab had no `libcublasLt.so.13`, which onnxruntime-node 1.30 needs, and Irodori stopped while loading `text_encoder`), the Node worker now rebuilds the session on the CPU, uses the CPU for the rest of the job and prints one line in Japanese and English with the reason; Kokoro does the same. Only a failure on the CPU as well still stops the job

### Changed

- Colab notebook: the packages are pinned (onnxruntime-node 1.30.0, @huggingface/transformers 4.3.1, onnxruntime-gpu and onnxruntime 1.31.0, kokoro-onnx 0.6.1: the set that ran on 2026-10-21; one place, `COLAB_PINS` in `tools/make-colab-notebook.mjs`), cell 1 prints the environment (Python, Node, GPU and driver CUDA, the CUDA libraries found, the pins) and cell 3 the installed onnxruntime-node and the providers in use, to include in a problem report. The verified note now says: CPU verified on 2026-10-23; the GPU path failed that day and falls back to the CPU; GPU with the pinned versions not yet verified; Kokoro not yet
