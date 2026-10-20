// test-all: part of test-colab
// ノートブック（colab/egatari_tts.py）の dry-run と同じ形の zip を JS で作る（試験用の fixture。Colab もモデルも使わない）。
// 文の長さに比例した長さの偽の音を、1 区切りずつ processTake で整え、joinParts で結んで cue を測る（本物の合成エンジンの代わり）
//   const job = await buildJob({...});  const zip = await colabZip(job, { docId, mutate? })
import { processTake, joinParts, encodeWav, PROCESSING } from '../kit/core/audio-core.mjs';
import { sha256Hex } from '../kit/core/portable.mjs';
import { writeZip } from '../kit/core/zip-read.mjs';

const SR_IN = 24000;
export function fakeSpeech(text, role) {
  const n = Math.round((0.3 + 0.05 * text.length) * SR_IN), lead = Math.round(0.2 * SR_IN), out = new Float32Array(n + 2 * lead);
  const f = role === 'novice' ? 260 : 170;
  for (let i = 0; i < n; i++) out[lead + i] = 0.2 * Math.sin((2 * Math.PI * f * i) / SR_IN) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 3 * i) / SR_IN) ** 2);
  return out;
}
// mutate(records, files)：記録や音声を細工する（敵対 zip の試験）。戻り値：zip のバイト列
export async function colabZip(job, { docId = job.docId, mutate = null, generator = { name: 'irodori-tts-colab', version: '1' } } = {}) {
  const steps = {}, files = [];
  for (const st of job.steps) {
    const turns = st.turns.map((t) => t.segments.map((s) => (s.trim() ? processTake([fakeSpeech(s, t.role)], SR_IN).pcm : new Float32Array(0))));
    const j = joinParts(turns);
    const wav = encodeWav(j.pcm, 44100), name = `audio/tts_${(await sha256Hex(wav)).slice(0, 16)}.wav`;
    if (!files.some(([n]) => n === name)) files.push([name, wav]);
    const voice = {};
    for (const t of st.turns) if (!(t.role in voice)) voice[t.role] = t.voice;
    steps[st.key] = { file: name, dur: j.dur, cues: j.cues, kind: 'tts', sync: 'auto', inputHash: st.inputHash,
      recipe: { engine: 'dry-run', model: 'dry-run', voice, seed: null, dictionary: job.recipe.dictionary, processing: PROCESSING + '+colab1' } };
  }
  const records = { egatari: 'tts-records', v: 1, docId, generator, steps };
  const entries = [['records.json', new TextEncoder().encode(JSON.stringify(records, null, 1) + '\n')], ...files];
  if (mutate) mutate(records, entries);
  entries[0][1] = new TextEncoder().encode(JSON.stringify(records, null, 1) + '\n');
  return writeZip(entries);
}
