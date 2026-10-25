// colab/egatari-tts.ipynb を作る（手で直さない。材料は下のセルの文と colab/egatari_tts.py）。docs の <!-- colab-verified --> の記しも COLAB_VERIFIED に揃える
//   node tools/make-colab-notebook.mjs [--check]
// ノートブックの核（後処理・cue の測定・zip）は colab/egatari_tts.py にあり、ノートブックはそれをリポジトリから取って呼ぶだけ
// （ローカルで dry-run できるように。tools/test-colab.mjs）。--check：ファイルが作り直したものと同じか（違えば終了コード 1）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLAB, COLAB_VERIFIED, COLAB_STEPS, COLAB_TIME, colabUrl } from '../kit/core/colab-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'colab', 'egatari-tts.ipynb');
const md = (s) => ({ cell_type: 'markdown', metadata: {}, source: s.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : '')) });
const code = (s, form = '') => ({ cell_type: 'code', metadata: form ? { cellView: 'form' } : {}, execution_count: null, outputs: [], source: s.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : '')) });
const REPO = `https://github.com/${COLAB.repo}`;

// ---------------------------------------------------------------- Colab に入れる版の固定（ここだけ。npm と pip の行はこれを使う）
// なぜ固定するか：版を書かずに入れると、Colab のイメージ（CUDA のライブラリ）と、その日の最新の版の組み合わせが黙って変わる。
//   2026-10-21 は通ったが、2026-10-23 の講習では onnxruntime-node の CUDA の実行プロバイダが libcublasLt.so.13 を見つけられず止まった。
// 版の組は 2 つあり、セル 1 が見つけた CUDA のライブラリで選ぶ（pick_pin_set）：libcublasLt.so.13 があれば cuda13、.so.12 だけなら cuda12、
//   GPU がない・どちらも見つからないなら cuda13（CPU ではどちらも動く）。どちらの組でも、GPU で作れなければ CPU に切り替える（colab/ort-fallback.mjs・load_kokoro）。
// 各パッケージがどの CUDA を要るか（2026-10-23 に確かめた）：
//   onnxruntime-node の GPU は postinstall が NuGet の Microsoft.ML.OnnxRuntime.Gpu.Linux（同じ版）を落とす。中の名前はどの版も 'cuda12' だが、
//   1.30.0 の libonnxruntime_providers_cuda.so は libcublasLt.so.13・libcublas.so.13（CUDA 13、cuDNN 9）を、1.24.3 と 1.26.0 は libcublasLt.so.12（CUDA 12）を求める。
//   PyPI の onnxruntime-gpu は 1.27.0 から CUDA 13（nvidia-*-cu13）、1.26.0 が CUDA 12 の最後。
// cuda13：2026-10-21 に作者が Colab の T4 で通したときに、版を書かない `npm i` / `uv pip install` が入れたもの（その日の最新）。
//   transformers 4.3.1 は onnxruntime-node を 1.30.0 ちょうどで求めるので、node_modules に 1 つだけになる。
// cuda12：onnxruntime-node は 1.24.3。CUDA 12 の 1.26.0 を求める transformers の版はなく（4.0.0〜4.2.0 は 1.24.3 ちょうど、4.3.x は 1.30.0、3.x は 1.21 以前）、
//   1.26.0 にすると transformers の下にもう 1 つ（1.24.3。postinstall がまた NuGet を落とす）入るため。transformers 4.2.0 は 1.24.3 ちょうどを求める。
//   Docker（linux/amd64、Node 20.19.0、GPU なし）で、同じモデル（HF_REV b75a9bb）を irodori_node.mjs で読み込み、CPU で短い合成が通り、
//   トークナイザの結果が 4.3.1 と同じことを確かめた（linux/arm64、4 steps・seed 0）。同じ組なら音はバイト単位で同じだが、組の間では少し違う
//   （cuda12 と cuda13 で最大の差 0.47、差の RMS 0.033（信号の RMS 0.143）、相関 0.973）。onnxruntime-gpu は CUDA 12 の最後の 1.26.0。
// onnxruntime（CPU 版）は kokoro-onnx が求める。onnxruntime-gpu と同じ版にする（どちらも同じ onnxruntime のモジュールを置くので、版が違うと混ざる）。
// lab/ のブラウザ版（tts-engine.mjs の TRANSFORMERS_VERSION 3.7.6）に合わせないのは、3.7.6 が onnxruntime-node 1.21.0 を別に入れるから。
// 更新の仕方：(1) ここの版を替えて `npm run gen`（transformers が求める onnxruntime-node の版と、NuGet の .so が求める libcublasLt の版を確かめる）、
//   (2) ノートブックをそのブランチから開き（STUDIO_REF）、セル 1 の環境の行（CUDA のライブラリと選んだ組）とセル 3 の providers を見ながら Colab の GPU と CPU で通す、
//   (3) kit/core/colab-core.mjs の COLAB_VERIFIED を直す
export const COLAB_PINS = Object.freeze({
  cuda13: Object.freeze({
    'onnxruntime-node': '1.30.0',
    '@huggingface/transformers': '4.3.1',
    'onnxruntime-gpu': '1.31.0',
    'onnxruntime': '1.31.0',
    'kokoro-onnx': '0.6.1',
  }),
  cuda12: Object.freeze({
    'onnxruntime-node': '1.24.3',
    '@huggingface/transformers': '4.2.0',
    'onnxruntime-gpu': '1.26.0',
    'onnxruntime': '1.26.0',
    'kokoro-onnx': '0.6.1',
  }),
});
const NPM_PKGS = ['onnxruntime-node', '@huggingface/transformers'];
const PIP_PKGS = ['kokoro-onnx', 'onnxruntime-gpu', 'onnxruntime'];

export function notebook() {
  const cells = [
    md([
      '# Egatari Studio: make the audio in Colab / Colab で音声を作る',
      '',
      // 手順（音声の板の C2 と同じ文。kit/core/colab-core.mjs の COLAB_STEPS）
      '**English — steps.** In the editor, open Audio → “Make AI voice in the cloud (Google Colab)” → “Export script”, then:',
      '',
      ...COLAB_STEPS.en.map((x, i) => `${i + 1}. ${x}`),
      '',
      `Then, in the editor, use “Import the audio…” and choose the ZIP file. ${COLAB_TIME.en}. Japanese uses Irodori-TTS 500M-v3 (ONNX), other languages use Kokoro-82M.`,
      '',
      '**Privacy.** The script text in `tts-job.json` is processed in Google’s Colab environment, and the model files come from Hugging Face. Nothing else from your lesson is sent. Use it only for text you are allowed to share.',
      '',
      '**日本語 — 手順.** エディタの「音声」→「AI 音声をクラウドで作る（Google Colab）」→「台本を書き出す」の後に：',
      '',
      ...COLAB_STEPS.ja.map((x, i) => `${i + 1}. ${x}`),
      '',
      `そのあと、エディタの「できた音声を取り込む…」で ZIP ファイルを選びます。${COLAB_TIME.ja}。日本語は Irodori-TTS 500M-v3（ONNX）、ほかの言語は Kokoro-82M です。`,
      '',
      ...(COLAB_VERIFIED ? [`> **${COLAB_VERIFIED.en}**`, `> **${COLAB_VERIFIED.ja}**`, ''] : []),
      '**プライバシー.** `tts-job.json` の台本の文は、Google の Colab の環境で処理され、モデルは Hugging Face から取得します。教材のほかのものは送られません。共有してよい文だけに使ってください。',
    ].join('\n')),
    md('## 1. Set up / 準備'),
    code([
      '#@title 1. Set up / 準備（GPU が無ければ CPU になります）',
      `STUDIO_REF = "${COLAB.ref}"   #@param {type:"string"}`,
      `STUDIO_REPO = "${REPO}"`,
      'import glob, importlib, os, re, shutil, subprocess, sys',
      '# 環境（不具合を知らせるときは、この行も一緒に送ってください / include these lines when you report a problem）',
      `PIN_SETS = ${JSON.stringify(COLAB_PINS)}   # 入れる版の固定（tools/make-colab-notebook.mjs の COLAB_PINS）`,
      'def _out(cmd):',
      '    try: return subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=60).stdout.strip()',
      '    except (OSError, subprocess.SubprocessError): return ""',
      'def cublas_majors(ldconfig, names):   # libcublasLt.so.N の N（ldconfig -p の出力と、見つけたファイルの名前から）',
      '    found = set(re.findall(r"libcublasLt\\.so\\.(\\d+)\\b", ldconfig))',
      '    found |= {m.group(1) for m in (re.fullmatch(r"libcublasLt\\.so\\.(\\d+)", n) for n in names) if m}',
      '    return sorted(found, key=int)',
      'def pick_pin_set(majors, has_gpu):   # 版の組と、その理由',
      '    if not has_gpu: return "cuda13", "no GPU: either set runs on the CPU"',
      '    if "13" in majors: return "cuda13", "CUDA 13 libraries found"',
      '    if "12" in majors: return "cuda12", "only CUDA 12 libraries found"',
      '    return "cuda13", "no libcublasLt found: the GPU may fall back to the CPU"',
      'print("env: Python", sys.version.split()[0], "· Node", _out(["node", "--version"]) or "(none)")',
      '_smi = _out(["nvidia-smi"])',
      'if _smi:',
      '    _cuda = re.search(r"CUDA Version:\\s*([0-9.]+)", _smi)',
      '    print("env: GPU", _out(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"]) or "?", "· CUDA (driver)", _cuda.group(1) if _cuda else "?")',
      'else:',
      '    print("env: GPU none (no nvidia-smi) -> CPU")',
      '_dirs = [d for d in os.environ.get("LD_LIBRARY_PATH", "").split(":") if d] + ["/usr/local/cuda/lib64", "/usr/lib/x86_64-linux-gnu"]',
      '_majors = cublas_majors(_out("ldconfig -p"), [os.path.basename(f) for d in _dirs for f in glob.glob(os.path.join(d, "libcublasLt.so.*"))])',
      'PIN_SET, _why = pick_pin_set(_majors, bool(_smi))',
      'PINS = PIN_SETS[PIN_SET]',
      'print("env: CUDA libraries", ", ".join("libcublasLt.so." + m for m in _majors) or "(no libcublasLt)", "→ pin set", PIN_SET, f"({_why})")',
      'print("env: pinned", ", ".join(f"{k}=={v}" for k, v in PINS.items()))',
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
      `sh("uv pip install --system --quiet numpy scipy huggingface_hub " + " ".join(f"{k}=={PINS[k]}" for k in ${JSON.stringify(PIP_PKGS)}), "ライブラリのインストール")`,
      '# 作り直したあとの再実行でも新しい colab/ を読む（前に「なかった」と覚えた import の記憶を捨てる）',
      'importlib.invalidate_caches()',
      'sys.path_importer_cache.pop(COLAB_DIR, None)',
      'if COLAB_DIR in sys.path: sys.path.remove(COLAB_DIR)',
      'sys.path.insert(0, COLAB_DIR)',
      'sys.modules.pop("egatari_tts", None)',
      'import egatari_tts as E',
      'import onnxruntime as ort',
      'print("onnxruntime", ort.__version__, "· providers:", ort.get_available_providers())',
      'GPU = "CUDAExecutionProvider" in ort.get_available_providers() and bool(_smi)',
      'print("GPU (CUDA):", GPU, "（使えなければ合成の前に自動で CPU に切り替えます / falls back to the CPU automatically if it cannot be used）" if GPU else "-> CPU で動かします（遅い）")',
      '# GPU がなければ、日本語（Irodori）は CPU 用の少ない steps で合成する（colab/egatari_tts.py の IRODORI_CPU_STEPS。セル 3 で実際に CPU になったときも同じ）',
      'print(E.env_compute_line(GPU))',
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
    md([
      '## Optional: your own reference voice (Irodori only) / 自分の参照音声（省略可・Irodori のみ）',
      '',
      'Leave it as it is to use the built-in voices. To use your own voice, tick `UPLOAD` and pick a WAV or MP3 of 3-30 s (one speaker, little noise), or put a Google Drive path in `DRIVE_PATH` (mount Drive first). It is converted to 48 kHz mono and used for every speaker of the job. **Use only a voice you have the right to use** (your own, or with the speaker’s permission). The file stays in this Colab runtime and is not uploaded anywhere else.',
      '',
      '何も変えなければ、これまでの声のままです。自分の声を使うときは `UPLOAD` にチェックを入れて 3〜30 秒の WAV か MP3（話す人は 1 人、雑音は少なく）を選ぶか、`DRIVE_PATH` に Google ドライブのパスを書きます（先にドライブをマウント）。48 kHz のモノラルに直して、このジョブのすべての話者に使います。**使ってよい声（自分の声、または本人の許可のある声）だけ**にしてください。ファイルはこの Colab のランタイムの中にあり、ほかへは送られません。',
    ].join('\n')),
    code([
      '#@title Optional: your own reference voice / 自分の参照音声（省略可）',
      'UPLOAD = False   #@param {type:"boolean"}',
      'DRIVE_PATH = ""   #@param {type:"string"}',
      'REF_VOICE_PATH = None',
      'if UPLOAD or DRIVE_PATH.strip():',
      '    if job["recipe"]["engine"] != "irodori":',
      '        print("Kokoro (non-Japanese) uses its own voices: the reference voice is ignored. / Kokoro は自分の参照音声を使いません（無視します）")',
      '    else:',
      '        if UPLOAD:',
      '            _up = files.upload()',
      '            if not _up: raise RuntimeError("ファイルが選ばれませんでした / no file was uploaded")',
      '            _src = "/content/" + os.path.basename(next(iter(_up)))',
      '        else:',
      '            _src = DRIVE_PATH.strip()',
      '        REF_VOICE_PATH = "/content/work/my-reference-voice.wav"',
      '        try:',
      '            _info = E.prepare_reference_voice(_src, REF_VOICE_PATH)',
      '        except E.RefVoiceError as e:',
      '            REF_VOICE_PATH = None',
      '            raise RuntimeError(f"参照音声を使えません / cannot use this reference voice: {e}") from None',
      '        print(f"reference voice ready: {_info[\'seconds\']} s -> 48 kHz mono. Use only a voice you have the right to use. / 参照音声を使います（{_info[\'seconds\']} 秒）")',
      'else:',
      '    print("built-in voices (no reference voice given) / これまでの声を使います")',
    ].join('\n'), true),
    md('## 3. Load the model / モデルを読み込む'),
    code([
      '#@title 3. Load the model / モデルを読み込む',
      'PROFILE = False   #@param {type:"boolean"}',
      '# PROFILE：日本語（Irodori）で、区切りごとに段の時間（文の符号化・参照音声・dit・復号・後処理）を出す（遅いときの調べ用。音は変わらない）',
      'import time',
      '_t_load = time.monotonic()   # この時計で測る（Colab のセルの時間表示は長い実行で合わないことがある）',
      'ENGINE = job["recipe"]["engine"]',
      'if ENGINE == "kokoro":',
      '    from huggingface_hub import hf_hub_download',
      '    KOKORO_REPO, KOKORO_REV = "onnx-community/Kokoro-82M-v1.0-ONNX", None   # 版の固定は実際の Colab で通したあとに（lab/tts-engine.mjs の KOKORO_REV と同じにする）',
      '    # kokoro-onnx の形式のモデルと声（kokoro-onnx の公開リリース model-files-v1.0）',
      '    !wget -q -nc https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx -P /content/models',
      '    !wget -q -nc https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin -P /content/models',
      '    synth = E.kokoro_synth("/content/models/kokoro-v1.0.onnx", "/content/models/voices-v1.0.bin")',
      '    INFO = {"engine": "kokoro-colab", "model": job["recipe"]["model"], "seed": None, "runtime": E.runtime_label(PIN_SET, synth.provider)}',
      '    print("Kokoro providers in use:", synth.providers, "→ runtime", INFO["runtime"])',
      'else:',
      '    # Irodori-TTS 500M-v3（ONNX）：lab/tts-engine.mjs の HF_REV と同じ固定版。推論は lab/vendor/irodori-tts-webgpu/pipeline.mjs を Node で動かす',
      '    HF_REPO, HF_REV = "noguchis/irodori-tts-onnx", "b75a9bbf2c10e12682d37e91e0efaf6d4e54bd29"',
      '    from huggingface_hub import snapshot_download',
      '    # 「HF_TOKEN を設定してください」の警告（2 回出る。公開モデルの取得には要らず、動きに影響しない）だけを消す。ほかの警告はそのまま',
      '    import logging, warnings',
      '    class _NoHfTokenWarn(logging.Filter):',
      '        def filter(self, rec): return "unauthenticated requests" not in rec.getMessage()',
      '    _hf_filter = _NoHfTokenWarn()',
      '    for _n in [n for n in logging.root.manager.loggerDict if n == "huggingface_hub" or n.startswith("huggingface_hub.")]:',
      '        logging.getLogger(_n).addFilter(_hf_filter)',
      '        for _h in logging.getLogger(_n).handlers: _h.addFilter(_hf_filter)',
      '    warnings.filterwarnings("ignore", message=".*unauthenticated requests to the HF Hub.*")',
      '    # local_dir にして実ファイルで置く（既定のキャッシュは blobs/ への symlink で、onnxruntime-node が外部データ text_encoder.onnx.data を「model directory の外」として断る）',
      '    # GPU は fp16（onnx_fp16、1.2 GB）、CPU は fp32（onnx、2.3 GB）：CPU の onnxruntime は fp16 の演算が遅い（colab/irodori_node.mjs）',
      '    IRODORI_FOLDER = "onnx_fp16" if GPU else "onnx"',
      '    MODEL_DIR = snapshot_download(HF_REPO, revision=HF_REV, allow_patterns=[IRODORI_FOLDER + "/*", "tokenizer/*"], local_dir="/content/irodori-model")',
      '    os.environ["EGATARI_IRODORI_FOLDER"] = IRODORI_FOLDER',
      '    os.makedirs("/content/node-deps", exist_ok=True)',
      `    sh("cd /content/node-deps && npm init -y && npm i --silent " + " ".join(f"{k}@{PINS[k]}" for k in ${JSON.stringify(NPM_PKGS)}), "npm のインストール")`,
      '    _ortn = "/content/node-deps/node_modules/onnxruntime-node"',
      '    _bin = _ortn + "/bin/napi-v6/linux/x64"',
      '    print("env: onnxruntime-node", _out(["node", "-p", f"require({_ortn + \'/package.json\'!r}).version"]) or "?", "· provider libraries:", ", ".join(sorted(f for f in os.listdir(_bin) if "providers" in f)) if os.path.isdir(_bin) else "-")',
      '    os.environ["EGATARI_NODE_DEPS"] = "/content/node-deps"',
      '    os.environ["EGATARI_ORT_PROVIDERS"] = "cuda,cpu" if GPU else "cpu"',
      '    os.makedirs("/content/work", exist_ok=True)',
      '    synth = E.irodori_synth("/content/egatari-studio/colab/irodori_node.mjs", MODEL_DIR, "/content/egatari-studio/lab/voices", "/content/work", seed=0, ref_voice=globals().get("REF_VOICE_PATH"), profile=PROFILE)   # steps は省く：実際に CPU なら CPU 用の少ない steps（E.IRODORI_CPU_STEPS）',
      '    INFO = {"engine": "irodori-colab", "model": job["recipe"]["model"], "seed": 0, "runtime": E.runtime_label(PIN_SET, synth.provider), "diffusionSteps": synth.steps, "precision": synth.precision}',
      '    print("Irodori providers in use:", synth.providers, "→ runtime", INFO["runtime"], "·", E.compute_label(synth.provider != "cpu", synth.steps), "·", synth.precision)   # GPU を使えなかったときは、その上に CPU に切り替えたお知らせが 1 行出る。runtime と steps は記録の recipe に入る',
      'print("ready:", INFO)',
      'print(f"loaded in {time.monotonic() - _t_load:.1f} s / 読み込み {time.monotonic() - _t_load:.1f} 秒")',
    ].join('\n'), true),
    md('## 4. Synthesize and download the zip / 合成して zip をダウンロード'),
    code([
      '#@title 4. Synthesize / 合成して zip をダウンロード',
      'import time',
      '# 段階ごとに、その段階の時間と始めからの時間を出す（単調な時計で、Node のワーカーの合成を待つ間も含む。Colab のセルの時間表示には頼らない）',
      'def progress(i, n, key, step_s, total_s): print(E.progress_line(i, n, key, step_s, total_s), flush=True)',
      '_t_synth = time.monotonic()',
      'try:',
      '    data = E.run_job(job, synth, engine_info=INFO, progress=progress)',
      'finally:   # 常駐の Node ワーカーを終わらせる（もう一度合成するときはセル 3 から）',
      '    if hasattr(synth, "close"): synth.close()',
      'print(E.total_line(time.monotonic() - _t_synth, len(job["steps"])), flush=True)',
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

// docs の確かめた範囲の記し（<!-- colab-verified --> と <!-- /colab-verified --> の間）を COLAB_VERIFIED に揃える。en の docs は en、.ja.md は ja
export const VERIFIED_DOCS = Object.freeze(['docs/editor.md', 'docs/editor.ja.md', 'docs/distributing.md', 'docs/distributing.ja.md']);
export function syncVerified(text, lang) {
  return text.replace(/(<!-- colab-verified --> (?:\*\*)?)(.*?)((?:\*\*)?<!-- \/colab-verified -->)/g, (_, a, _old, b) => a + COLAB_VERIFIED[lang] + b);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = notebook();
  const docs = VERIFIED_DOCS.map((f) => { const p = path.join(ROOT, f), old = fs.readFileSync(p, 'utf8'); return { f, p, old, now: syncVerified(old, f.endsWith('.ja.md') ? 'ja' : 'en') }; });
  if (process.argv.includes('--check')) {
    const stale = docs.filter((d) => d.old !== d.now).map((d) => d.f);
    if (stale.length) { console.error(`the colab-verified note in ${stale.join(', ')} is out of date: run npm run gen`); process.exit(1); }
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('colab/egatari-tts.ipynb is out of date: run npm run gen'); process.exit(1); }
    console.log('colab/egatari-tts.ipynb is up to date (' + colabUrl() + ')');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); console.log('wrote ' + path.relative(ROOT, OUT));
    for (const d of docs) if (d.old !== d.now) { fs.writeFileSync(d.p, d.now); console.log('wrote ' + d.f); }
  }
}
