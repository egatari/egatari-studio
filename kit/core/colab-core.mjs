// Colab 往復 TTS（WebGPU の無い PC のため。docs/editor.md「Make the audio in Colab」）：エディタが書き出す tts-job.json と、
// 公式ノートブック（colab/egatari-tts.ipynb）が返す zip（audio/*.wav と records.json）の定義・検証・突き合わせ。node: も fs も使わない
//
// tts-job.json と records.json はこの製品の中の取り決め（仕様物ではない）。records.json の各段階の記録の形は format spec §5.2 の音声の記録
// （kind・cues・inputHash・recipe）と同じ。取り込みは、今の口述原稿から inputHash を計算し直して照合する（ノートブックには検証を任せない。§5.3）
//
//   buildJob({segs, docId, lang, voices, yomi, version, keys?})   → tts-job.json の中身（keys：書き出す段階の key。なければ全部）
//   parseRecords(text)                                           → {records: Map<key, 記録>, docId, generator, problems: [{key?, why}]}
//   planImport({zip: {files}, segs, docId, yomi})                → {reject?, applied: [], marked: [], skipped: [], warnings: []}（読むだけ。書かない）
//   decodeStepAudio(bytes, rec)                                  → {pcm（44.1 kHz・モノラル）, sr, dur, cues}（WAV を検証して復号）
//   readColabZip(bytes)                                          → readZip を、この取り込みの上限で
import { inputHash } from './portable.mjs';
import { applyYomi } from './yomi.mjs';
import { TEXT_NORMALIZE } from './tts-normalize.mjs';
import { PROCESSING, AUDIO_LIMITS, SR, decodeWav, toMono, resample } from './audio-core.mjs';
import { readZip, ZipError } from './zip-read.mjs';

// 確かめた範囲の記し（ノートブックの最初のセル・それを案内する docs・エディタの「Colab で音声を作る」の説明に出す）。1 か所だけに書く。
// 確かめる範囲が変わったら（Kokoro・CPU を通したなど）ここの文を直し、`npm run gen` と docs の <!-- colab-verified --> の行を揃える
// （tools/test-colab.mjs が、記しのある所が揃っているかを確かめる）。固定した版（tools/make-colab-notebook.mjs の COLAB_PINS）での GPU は 2026-10-24 に確認した。
export const COLAB_VERIFIED = Object.freeze({
  ja: '確認済み：2026-10-23、CPU（講習で、Irodori）。GPU：2026-10-24 に Colab の T4 で、固定した版（cuda13 の組）で確認した（23 ステップを 42 秒）。Kokoro：2026-10-24 に T4 で cuda13 の組で確認した（59 ステップを 30 秒）',
  en: "Verified: 2026-10-23, CPU (at a workshop, Irodori). GPU verified on 2026-10-24 on a T4 with the cuda13 pin set (23 steps in 42 s). Kokoro verified on 2026-10-24 on a T4 with cuda13 (59 steps in 30 s).",
});
// Colab での手順（音声の板の「クラウドで作る」の C2 と、ノートブックの最初のセルに同じ文を出す。1 か所だけに書く）。
// handoff/audio-flow-2026-10-25.md §4 の cloud.c2Steps・§7。時間の目安は T4 のものだけ（CPU の数は実測してから足す）
export const COLAB_STEPS = Object.freeze({
  ja: Object.freeze([
    '右上の「接続」を押す（T4 GPU につなぎます）。つながらないと知らせが出たら、メニューの「ランタイム」→「ランタイムのタイプを変更」で「CPU」を選んでから、もう一度「接続」（CPU でも作れますが、時間がかかります）',
    '「ランタイム」→「すべてのセルを実行」',
    'ファイルを選ぶ画面が出たら、書き出したファイルを選ぶ',
    '終わると音声の ZIP ファイルがダウンロードされます',
  ]),
  en: Object.freeze([
    'Press “Connect” at the top right (it connects to a T4 GPU). If it says it cannot connect, choose Runtime → Change runtime type → “CPU” and press “Connect” again (CPU works too, only slower)',
    'Runtime → Run all',
    'When asked to choose a file, choose the file you exported',
    'When it finishes, a ZIP file of the audio is downloaded',
  ]),
});
export const COLAB_TIME = Object.freeze({ ja: 'T4 で 10 ステップ 20 秒ほど。Google のアカウントが要ります', en: 'About 20 s for 10 steps on a T4. You need a Google account' });
export const COLAB_NOTE_MARK = 'colab-verified';   // docs では <!-- colab-verified --> を付けた行にする

export const JOB = Object.freeze({ tag: 'tts-job', recordsTag: 'tts-records', v: 1 });
export const COLAB = Object.freeze({
  repo: 'egatari/egatari-studio', notebook: 'colab/egatari-tts.ipynb',
  ref: 'v0.4.8',   // バッジの URL は版のタグに固定する（リリースの手順で替える。RELEASING.md）
  pause: 0.35,
  models: Object.freeze({ irodori: 'irodori-tts-500m-v3', kokoro: 'kokoro-82m-v1.0' }),
  // 後処理の版（records の recipe.processing は PROCESSING に '+colab<ノートブックの版>' を付けたもの）：ノートブック（colab/egatari_tts.py）の後処理は audio-core.mjs と同じ数。数を変えたら名前も変える
  notebookVersion: 1,
});
export const colabUrl = (ref = COLAB.ref) => `https://colab.research.google.com/github/${COLAB.repo}/blob/${ref}/${COLAB.notebook}`;

// 取り込みの上限（割り当てる前に課す。zip はダウンロード物）
export const COLAB_LIMITS = Object.freeze({ zipBytes: 512 * 1048576, memberBytes: AUDIO_LIMITS.fileBytes, recordsBytes: 4 * 1048576, steps: 400, totalBytes: 512 * 1048576 });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const round3 = (v) => Math.round(v * 1000) / 1000;
const HEX64 = /^[0-9a-f]{64}$/;
const KEY = /^[^\s:]{1,120}:[^\s:]{1,120}$/;
const VOICE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FILE = /^audio\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.wav$/;
// recipe.runtime：ノートブックが書く「<版の組>/<実際の実行プロバイダ>」（cuda12/cuda・cuda13/cpu など。colab/egatari_tts.py の runtime_label）。
// どの環境で作った音かの記録で、inputHash には入らない（版の組や GPU/CPU で音は少し違う）。形の合わないものは落とす（取り込みは止めない）
const RUNTIME = /^[A-Za-z0-9._-]{1,32}\/[A-Za-z0-9._?-]{1,32}$/;

// {cue}/{mark} で区切った部分の数から、cue の数（ターンの中の区切りだけ。ターンの間には cue を置かない。joinParts と同じ）
export const expectedCues = (seg) => seg.turns.reduce((n, t) => n + Math.max(0, t.ttsParts.length - 1), 0);
export const engineOfLang = (lang) => (/^ja\b/i.test(lang || '') ? 'irodori' : 'kokoro');

// ---------------------------------------------------------------- tts-job.json
const cleanTitle = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 120) : '');
export async function buildJob({ segs, docId = null, title = null, lang, voices, yomi = null, version = '0', keys = null }) {
  const engine = engineOfLang(lang), ja = engine === 'irodori';
  const terms = (yomi && yomi.terms) || [];
  const want = keys ? new Set(keys) : null;
  const steps = [];
  for (const seg of segs) {
    const key = `${seg.slideKey}:${seg.stepKey}`;
    if (want && !want.has(key)) continue;
    steps.push({
      key, lang, inputHash: await inputHash(seg),
      turns: seg.turns.map((t) => ({
        role: t.role === 'novice' ? 'novice' : 'expert',
        voice: (voices && voices[t.role === 'novice' ? 'novice' : 'expert']) || (t.role === 'novice' ? 'alice' : 'bob'),
        segments: t.ttsParts.map((p) => (ja ? applyYomi(p, terms).text : p)),   // 読みを適用した文（辞書の版の食い違いを避ける）
      })),
    });
  }
  return {
    egatari: JOB.tag, v: JOB.v, docId,
    ...(cleanTitle(title) ? { title: cleanTitle(title) } : {}),   // 取り込みの断り書きに教材の題を出すためだけ（inputHash や検証には使わない）
    generator: { name: 'egatari-studio', version: String(version) },
    recipe: { engine, model: COLAB.models[engine], seed: 0, dictionary: ja && yomi ? yomi.sha256 : null, processing: PROCESSING, textNormalize: TEXT_NORMALIZE },   // 文は前処理しない（ノートブックが合成の直前に textNormalize の規則をかける）
    steps,
  };
}

// ---------------------------------------------------------------- records.json
export function parseRecords(text) {
  const problems = [], records = new Map();
  let j;
  try { j = JSON.parse(text); } catch { return { records, docId: null, generator: null, problems: [{ why: 'records.json is not JSON' }], fatal: true }; }
  if (!isObj(j) || j.egatari !== JOB.recordsTag || j.v !== JOB.v || !isObj(j.steps)) return { records, docId: null, generator: null, problems: [{ why: 'records.json is not a tts-records v1 file' }], fatal: true };
  const docId = typeof j.docId === 'string' ? j.docId : null;
  const title = cleanTitle(j.title) || null;
  const generator = isObj(j.generator) && typeof j.generator.name === 'string' ? { name: j.generator.name.slice(0, 80), version: String(j.generator.version ?? '').slice(0, 40) } : null;
  const keys = Object.keys(j.steps);
  if (keys.length > COLAB_LIMITS.steps) return { records, docId, title, generator, problems: [{ why: `too many steps (${keys.length}; at most ${COLAB_LIMITS.steps})` }], fatal: true };
  for (const key of keys) {
    const r = j.steps[key];
    const no = (why) => problems.push({ key, why });
    if (!KEY.test(key)) { no('bad step key'); continue; }
    if (!isObj(r)) { no('not an object'); continue; }
    if (r.kind !== 'tts') { no('kind is not tts'); continue; }
    if (typeof r.file !== 'string' || !FILE.test(r.file)) { no('bad audio path (audio/<name>.wav only)'); continue; }
    if (!HEX64.test(String(r.inputHash))) { no('bad inputHash'); continue; }
    if (!(typeof r.dur === 'number' && r.dur > 0 && r.dur <= AUDIO_LIMITS.maxSeconds)) { no('bad dur'); continue; }
    if (!Array.isArray(r.cues) || r.cues.length > 10000 || !r.cues.every((c, i) => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= r.dur + 0.05 && (i === 0 || c >= r.cues[i - 1]))) { no('bad cues'); continue; }
    const rc = r.recipe;
    if (!isObj(rc) || typeof rc.engine !== 'string' || typeof rc.model !== 'string' || !isObj(rc.voice) || typeof rc.processing !== 'string') { no('bad recipe'); continue; }
    if (!(rc.seed === null || Number.isInteger(rc.seed)) || !(rc.dictionary === null || typeof rc.dictionary === 'string' || rc.dictionary === undefined)) { no('bad recipe'); continue; }
    const voice = {};
    for (const role of ['expert', 'novice']) if (own(rc.voice, role)) { if (!VOICE.test(String(rc.voice[role]))) { no('bad voice name'); voice.bad = true; break; } voice[role] = String(rc.voice[role]); }
    if (voice.bad) continue;
    records.set(key, {
      file: r.file, dur: r.dur, cues: r.cues.map(round3), inputHash: r.inputHash,
      recipe: { engine: rc.engine.slice(0, 80), model: rc.model.slice(0, 200), voice, seed: rc.seed ?? null, dictionary: rc.dictionary ?? null, processing: rc.processing.slice(0, 80), ...(typeof rc.textNormalize === 'string' && rc.textNormalize ? { textNormalize: rc.textNormalize.slice(0, 80) } : {}), ...(typeof rc.runtime === 'string' && RUNTIME.test(rc.runtime) ? { runtime: rc.runtime } : {}) },
    });
  }
  return { records, docId, title, generator, problems };
}

// ---------------------------------------------------------------- zip
export async function readColabZip(bytes) {
  if (bytes.length > COLAB_LIMITS.zipBytes) throw new ZipError('zip-over', `the zip is over ${COLAB_LIMITS.zipBytes} bytes`);
  return readZip(bytes, {
    maxMembers: COLAB_LIMITS.steps + 8, maxTotalBytes: COLAB_LIMITS.totalBytes,
    accept: (n) => n === 'records.json' || /^audio\/[^/]+$/.test(n),
    maxMemberBytes: (n) => (n === 'records.json' ? COLAB_LIMITS.recordsBytes : COLAB_LIMITS.memberBytes),
  });
}

// ---------------------------------------------------------------- 取り込みの計画（読むだけ）
// applied：inputHash が今の口述原稿と合う（そのまま使う）／marked：書き出した後に原稿が変わった（印付き。自動では使わない）／
// skipped：今の原稿にない段階・記録の不備・cue の数が合わない・音声がない／reject：別の教材（docId 不一致）・records.json がない・読めない
export async function planImport({ zip, segs, docId = null, yomi = null }) {
  const out = { reject: null, applied: [], marked: [], skipped: [], warnings: [], generator: null };
  const rj = zip.files.get('records.json');
  if (!rj) { out.reject = { code: 'no-records', why: 'records.json is missing' }; return out; }
  const pr = parseRecords(new TextDecoder().decode(rj));
  if (pr.fatal) { out.reject = { code: 'bad-records', why: pr.problems[0].why }; return out; }
  out.generator = pr.generator;
  if (docId !== null && pr.docId !== null && docId !== pr.docId) { out.reject = { code: 'doc-id', why: 'the job was made for another lesson (docId differs)', title: pr.title }; return out; }
  for (const p of pr.problems) out.skipped.push({ key: p.key || null, why: p.why });
  const byKey = new Map(segs.map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  for (const [key, rec] of pr.records) {
    const seg = byKey.get(key);
    if (!seg) { out.skipped.push({ key, why: 'no-step' }); continue; }
    if (!zip.files.has(rec.file)) { out.skipped.push({ key, why: 'no-audio' }); continue; }
    const fresh = rec.inputHash === await inputHash(seg);
    const cuesOk = rec.cues.length === expectedCues(seg);
    const item = { key, rec, file: rec.file, cuesOk };
    if (fresh) {
      if (!cuesOk) { out.skipped.push({ key, why: 'cues' }); continue; }
      out.applied.push(item);
    } else out.marked.push(item);
    const rc = rec.recipe;
    if (yomi && rc.dictionary !== null && rc.dictionary !== yomi.sha256 && !out.warnings.includes('dictionary')) out.warnings.push('dictionary');
    if (!rc.processing.startsWith(PROCESSING) && !out.warnings.includes('processing')) out.warnings.push('processing');
  }
  return out;
}

// 音声の WAV（ノートブックが後処理まで済ませたもの）を検証して復号する。ここでは後処理を重ねない（cue の時刻がずれるため）。
// 44.1 kHz のモノラルにして返す（標本化周波数が違えば再標本化。cue は時間なので変わらない）。長さは復号した実際の音から
export function decodeStepAudio(bytes, rec) {
  const w = decodeWav(bytes);
  if (!w) throw Object.assign(new Error(`${rec.file}: not a WAV file`), { code: 'audio-not-wav' });
  if (!(w.sr >= 8000 && w.sr <= 96000)) throw Object.assign(new Error(`${rec.file}: unsupported sample rate ${w.sr}`), { code: 'audio-bad' });
  let x = toMono(w.channels);
  if (x.length > AUDIO_LIMITS.maxSeconds * w.sr) throw Object.assign(new Error(`${rec.file}: longer than ${AUDIO_LIMITS.maxSeconds} s`), { code: 'audio-too-long' });
  let peak = 0;
  for (let i = 0; i < x.length; i++) { if (!Number.isFinite(x[i])) throw Object.assign(new Error(`${rec.file}: not a number in the samples`), { code: 'audio-bad' }); peak = Math.max(peak, Math.abs(x[i])); }
  if (!(peak > 0)) throw Object.assign(new Error(`${rec.file}: silent`), { code: 'audio-empty' });
  x = resample(x, w.sr, SR);
  const dur = round3(x.length / SR);
  if (Math.abs(dur - rec.dur) > 0.25) throw Object.assign(new Error(`${rec.file}: length ${dur} s differs from the record (${rec.dur} s)`), { code: 'audio-bad' });
  return { pcm: x, sr: SR, dur, cues: rec.cues.map((c) => Math.min(c, dur)) };
}
