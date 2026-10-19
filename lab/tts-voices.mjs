// ブラウザの TTS に入っている声の名前（lab/tts-engine.mjs と編集アプリの音声の板 app/audio-panel.js が読む。ほかを読み込まない）
//   日本語（Irodori-TTS）：参照音声 voices/<名前>.wav の bob・alice
//   英語（Kokoro-82M v1.0）：Kokoro の声の名前。bob・alice は近い声（am_michael・af_heart）に読み替える
// 見本（voices/samples/<名前>.mp3）は事前に作った短い音声（声を選ぶ欄の「▶」。鳴らしてもモデルは読み込まない）
export const IRODORI_VOICES = Object.freeze(['bob', 'alice']);
export const KOKORO_VOICES = Object.freeze([
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
]);
// 欄にすぐ出す声（米・英の男女）。ほかは「ほかの声」に畳む
export const KOKORO_MAIN = Object.freeze(['am_michael', 'af_heart', 'am_fenrir', 'af_bella', 'am_puck', 'af_nicole', 'bm_george', 'bf_emma']);
export const KOKORO_ALIAS = Object.freeze({ bob: 'am_michael', alice: 'af_heart' });
export const DEFAULT_VOICES = Object.freeze({ irodori: Object.freeze({ expert: 'bob', novice: 'alice' }), kokoro: Object.freeze({ expert: 'am_michael', novice: 'af_heart' }) });
export const VOICE_SAMPLES = Object.freeze([...IRODORI_VOICES, ...KOKORO_MAIN]);

// 声の名前を、そのエンジンで使う名前にする。入っていない名前は null（黙って別の声にしない）
export function bundledVoice(engine, name) {
  const n = String(name || '');
  if (engine === 'kokoro') return KOKORO_VOICES.includes(n) ? n : Object.prototype.hasOwnProperty.call(KOKORO_ALIAS, n) ? KOKORO_ALIAS[n] : null;
  return IRODORI_VOICES.includes(n) ? n : null;
}
