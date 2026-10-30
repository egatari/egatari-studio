// 見る人の設定：字幕の大きさ（deck-capsize）と同じく、この端末の localStorage に覚える。
// 保存先は関数で受けるので、localStorage 自体へのアクセスが断られる場合もメモリだけで使える。
// 音源（sounds.mjs）からは読み込まない。設定の保存は音の計算の外に置く。
export const MUTE_KEY = 'deck-mute-sounds';
export const MUTE_LABEL = Object.freeze({ ja: '効果音を消す', en: 'Mute sound effects' });
export function createMuteSetting(storage = () => globalThis.localStorage) {
  let muted = false;
  try { muted = storage()?.getItem(MUTE_KEY) === '1'; } catch { /* 保存できない端末 */ }
  return {
    get() { return muted; },
    set(value) {
      muted = !!value;
      try { storage()?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* メモリだけに残す */ }
      return muted;
    },
  };
}
