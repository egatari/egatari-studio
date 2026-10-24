// 読み上げで聞く（端末の声。format spec §5.6 の「Editors MAY offer the same as a preview」、backlog #89）：編集アプリの口
// 文を作る・声を選ぶのは kit/core/read-aloud.mjs（再生器と同じ）。読み辞書（RES.yomi、tts/yomi.yaml）と TTS の前処理（join-num-counter）は
// AI 音声（ブラウザの TTS・Colab）と同じものを当てる。端末の中の声（localService）だけを使い、ネットワークの声は使わない。
// 何も書かない：作業場所にも 1 ファイルにも音声の記録にも、何も残さない（音声ファイルにはならない）
//
//   readAloud(text | turns, lang, {terms?, onend?(why)}) → Promise<{ok, reason?: 'no-synth' | 'no-text' | 'no-voice'}>
//     text：1 つの語・選んだ文・書いたままの発言（{x|y} は y を読み、{cue}・{mark:…}・@x- の行は読まない）
//     turns：parseNarration の発言（role・ttsParts）。掛け合いは Expert と Novice を別の声で（端末に 2 つあれば）
//   stopReadAloud() → 読んでいたら true / readingAloud() → 読んでいるか / readAloudSupported() → この画面で読めるか
//   （読み方のボタン #101「試しに聞く」もこの readAloud を使う）
import { spokenTurns, createReader, whenVoices } from '../kit/core/read-aloud.mjs';
import { applyYomi } from '../kit/core/yomi.mjs';
import { normalizeTtsText } from '../kit/core/tts-normalize.mjs';

let reader = null;
const env = () => {
  try { return { synth: globalThis.speechSynthesis || null, Utterance: globalThis.SpeechSynthesisUtterance || null }; } catch { return { synth: null, Utterance: null }; }
};
export function readAloudSupported() { const e = env(); return !!(e.synth && typeof e.Utterance === 'function'); }

export async function readAloud(input, lang, opts = {}) {
  const e = env();
  if (!e.synth || typeof e.Utterance !== 'function') return { ok: false, reason: 'no-synth' };
  if (!reader) reader = createReader(e);
  stopReadAloud();
  const turns = spokenTurns(typeof input === 'string' ? [{ role: 'expert', raw: input }] : input, { lang, terms: opts.terms || [], applyYomi, normalize: normalizeTtsText });
  if (!turns.length) return { ok: false, reason: 'no-text' };
  await whenVoices(e.synth, 1500);
  const r = reader.speak(turns, lang, { onend: opts.onend });
  return r.ok ? { ok: true, voices: { expert: r.voices.expert.name, novice: r.voices.novice.name } } : { ok: false, reason: r.reason };
}
export function stopReadAloud() { return reader ? reader.cancel() : false; }
export function readingAloud() { return !!(reader && reader.speaking()); }
