// colab/egatari-tts.ipynb を作る（手で直さない。材料は下のセルの文と colab/egatari_tts.py）
//   node tools/make-colab-notebook.mjs [--check]
// ノートブックの核（後処理・cue の測定・zip）は colab/egatari_tts.py にあり、ノートブックはそれをリポジトリから取って呼ぶだけ
// （ローカルで dry-run できるように。tools/test-colab.mjs）。--check：ファイルが作り直したものと同じか（違えば終了コード 1）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLAB, COLAB_UNVERIFIED, colabUrl } from '../kit/core/colab-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'colab', 'egatari-tts.ipynb');
const md = (s) => ({ cell_type: 'markdown', metadata: {}, source: s.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : '')) });
const code = (s, form = '') => ({ cell_type: 'code', metadata: form ? { cellView: 'form' } : {}, execution_count: null, outputs: [], source: s.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : '')) });
const REPO = `https://github.com/${COLAB.repo}`;

export function notebook() {
  const cells = [
    md([
      '# Egatari Studio: make the audio in Colab / Colab で音声を作る',
      '',
      ...(COLAB_UNVERIFIED ? [`> **${COLAB_UNVERIFIED.en}**`, `> **${COLAB_UNVERIFIED.ja}**`, ''] : []),
      '**English.** Use this notebook when your computer has no WebGPU (many school PCs, Safari, iPad). In the editor, press “Audio → Make the audio in Colab → ① Export the steps”, run all the cells below, upload `tts-job.json` when asked, then import the zip it returns with “② Import the zip…”. Japanese uses Irodori-TTS 500M-v3 (ONNX), other languages use Kokoro-82M. A T4 GPU is faster; without one it falls back to the CPU (slow).',
      '',
      '**Privacy.** The narration text in `tts-job.json` is processed in Google’s Colab environment, and the model files come from Hugging Face. Nothing else from your lesson is sent. Use it only for text you are allowed to share.',
      '',
      '**日本語.** WebGPU のない PC（多くの学校 PC・Safari・iPad）で、音声を作るためのノートブックです。エディタの「音声 → Colab で音声を作る → ① 必要な段階を書き出す」で出した `tts-job.json` を、下のセルを上から順に実行して聞かれたときにアップロードし、返ってくる zip を「② できた zip を取り込む…」で取り込みます。日本語は Irodori-TTS 500M-v3（ONNX）、ほかの言語は Kokoro-82M です。T4 の GPU があると速く、なければ CPU になります（遅い）。',
      '',
      '**プライバシー.** `tts-job.json` の原稿の文は、Google の Colab の環境で処理され、モデルは Hugging Face から取得します。教材のほかのものは送られません。共有してよい文だけに使ってください。',
    ].join('\n')),
    md('## 1. Set up / 準備'),
    code([
      '#@title 1. Set up / 準備（GPU が無ければ CPU になります）',
      `STUDIO_REF = "${COLAB.ref}"   #@param {type:"string"}`,
      `STUDIO_REPO = "${REPO}"`,
      'import importlib, os, shutil, subprocess, sys',
      'def sh(cmd, what):   # 失敗したら、終了コードと出力の最後の 30 行を見せて止まる',
      '    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True)',
      '    if r.returncode:',
      '        tail = "\\n".join(((r.stdout or "") + (r.stderr or "")).strip().splitlines()[-30:])',
      '        raise RuntimeError(f"{what} が失敗しました（終了コード {r.returncode}）:\\n{tail}")',
      '    return r',
      'STUDIO_DIR = "/content/egatari-studio"',
      'shutil.rmtree(STUDIO_DIR, ignore_errors=True)',
      'sh(["git", "clone", "--quiet", "--depth", "1", "--branch", STUDIO_REF, STUDIO_REPO, STUDIO_DIR], f"git clone（STUDIO_REF={STUDIO_REF!r}）")',
      'COLAB_DIR = STUDIO_DIR + "/colab"',
      'if not os.path.exists(COLAB_DIR + "/egatari_tts.py"):',
      '    raise RuntimeError(f"STUDIO_REF={STUDIO_REF!r} には Colab 用のファイル（colab/egatari_tts.py）がありません。リリースのタグか、colab のあるブランチを STUDIO_REF に指定してください。 / This ref has no Colab files: set STUDIO_REF to a release tag or the branch that has colab/.")',
      'sh("uv pip install --system --quiet numpy scipy kokoro-onnx onnxruntime-gpu huggingface_hub", "ライブラリのインストール")',
      '# 作り直したあとの再実行でも新しい colab/ を読む（前に「なかった」と覚えた import の記憶を捨てる）',
      'importlib.invalidate_caches()',
      'sys.path_importer_cache.pop(COLAB_DIR, None)',
      'if COLAB_DIR in sys.path: sys.path.remove(COLAB_DIR)',
      'sys.path.insert(0, COLAB_DIR)',
      'sys.modules.pop("egatari_tts", None)',
      'import egatari_tts as E',
      'import onnxruntime as ort',
      'print("providers:", ort.get_available_providers())',
      'GPU = "CUDAExecutionProvider" in ort.get_available_providers()',
      'print("GPU (CUDA):", GPU, "" if GPU else "-> CPU で動かします（遅い）")',
    ].join('\n'), true),
    md('## 2. Upload tts-job.json / tts-job.json をアップロード'),
    code([
      '#@title 2. Upload tts-job.json / tts-job.json をアップロード',
      'import json',
      'from google.colab import files',
      'up = files.upload()',
      'name = next(iter(up))',
      'job = E.validate_job(json.loads(up[name].decode("utf-8")))',
      'print(len(job["steps"]), "steps ·", job["recipe"]["engine"], job["recipe"]["model"])',
    ].join('\n'), true),
    md('## 3. Load the model / モデルを読み込む'),
    code([
      '#@title 3. Load the model / モデルを読み込む',
      'ENGINE = job["recipe"]["engine"]',
      'if ENGINE == "kokoro":',
      '    from huggingface_hub import hf_hub_download',
      '    KOKORO_REPO, KOKORO_REV = "onnx-community/Kokoro-82M-v1.0-ONNX", None   # 版の固定は実際の Colab で通したあとに（lab/tts-engine.mjs の KOKORO_REV と同じにする）',
      '    # kokoro-onnx の形式のモデルと声（kokoro-onnx の公開リリース model-files-v1.0）',
      '    !wget -q -nc https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx -P /content/models',
      '    !wget -q -nc https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin -P /content/models',
      '    synth = E.kokoro_synth("/content/models/kokoro-v1.0.onnx", "/content/models/voices-v1.0.bin")',
      '    INFO = {"engine": "kokoro-colab", "model": job["recipe"]["model"], "seed": None}',
      'else:',
      '    # Irodori-TTS 500M-v3（ONNX）：lab/tts-engine.mjs の HF_REV と同じ固定版。推論は lab/vendor/irodori-tts-webgpu/pipeline.mjs を Node で動かす',
      '    HF_REPO, HF_REV = "noguchis/irodori-tts-onnx", "b75a9bbf2c10e12682d37e91e0efaf6d4e54bd29"',
      '    from huggingface_hub import snapshot_download',
      '    # local_dir にして実ファイルで置く（既定のキャッシュは blobs/ への symlink で、onnxruntime-node が外部データ text_encoder.onnx.data を「model directory の外」として断る）',
      '    MODEL_DIR = snapshot_download(HF_REPO, revision=HF_REV, allow_patterns=["onnx_fp16/*", "tokenizer/*"], local_dir="/content/irodori-model")',
      '    os.makedirs("/content/node-deps", exist_ok=True)',
      '    sh("cd /content/node-deps && npm init -y && npm i --silent onnxruntime-node @huggingface/transformers", "npm のインストール")',
      '    os.environ["EGATARI_NODE_DEPS"] = "/content/node-deps"',
      '    os.environ["EGATARI_ORT_PROVIDERS"] = "cuda,cpu" if GPU else "cpu"',
      '    os.makedirs("/content/work", exist_ok=True)',
      '    synth = E.irodori_synth("/content/egatari-studio/colab/irodori_node.mjs", MODEL_DIR, "/content/egatari-studio/lab/voices", "/content/work", steps=40, seed=0)',
      '    INFO = {"engine": "irodori-colab", "model": job["recipe"]["model"], "seed": 0}',
      'print("ready:", INFO)',
    ].join('\n'), true),
    md('## 4. Synthesize and download the zip / 合成して zip をダウンロード'),
    code([
      '#@title 4. Synthesize / 合成して zip をダウンロード',
      'def progress(i, n, key): print(f"{i}/{n} {key}")',
      'try:',
      '    data = E.run_job(job, synth, engine_info=INFO, progress=progress)',
      'finally:   # 常駐の Node ワーカーを終わらせる（もう一度合成するときはセル 3 から）',
      '    if hasattr(synth, "close"): synth.close()',
      'open("egatari-tts-result.zip", "wb").write(data)',
      'files.download("egatari-tts-result.zip")',
      'print("Done. Import egatari-tts-result.zip in the editor (② Import the zip…). / できました。エディタの「② できた zip を取り込む…」へ。")',
    ].join('\n'), true),
  ];
  const nb = {
    cells,
    metadata: { accelerator: 'GPU', colab: { gpuType: 'T4', provenance: [], name: 'egatari-tts.ipynb' }, kernelspec: { display_name: 'Python 3', name: 'python3' }, language_info: { name: 'python' } },
    nbformat: 4, nbformat_minor: 5,
  };
  return JSON.stringify(nb, null, 1) + '\n';
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = notebook();
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('colab/egatari-tts.ipynb is out of date: run npm run gen'); process.exit(1); }
    console.log('colab/egatari-tts.ipynb is up to date (' + colabUrl() + ')');
  } else { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); console.log('wrote ' + path.relative(ROOT, OUT)); }
}
