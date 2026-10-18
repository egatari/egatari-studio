// 開発サーバー（server/dev.mjs）と編集アプリ（app/devapi.js）が読む原稿のフォルダの文字のファイルの大きさの上限（バイト。Node に依存しない）
// 大きすぎるファイル（数 GB の comments.json など）を丸ごと読んでメモリを使い切らない。超えたら読まずに断る（何も書かない。SECURITY.md）
export const MiB = 1024 * 1024;
export const READ_LIMITS = { comments: 8 * MiB, narration: 8 * MiB, deck: 32 * MiB };
// 名前（フォルダからの相対パスか、パスの最後）から上限を決める。comments.json・narration.md 以外は原稿（deck.html）の上限
export function readLimit(file) {
  const name = String(file).split(/[\\/]/).pop();
  return name === 'comments.json' ? READ_LIMITS.comments : name === 'narration.md' ? READ_LIMITS.narration : READ_LIMITS.deck;
}
// 上限を超えた（code 'too-large'。開発サーバーは 413、編集アプリも 413 で知らせる）
export class TooLargeError extends Error {
  constructor(file, size, max) { super(`${file} is too large (${size} bytes; the limit is ${max} bytes); refusing to read it`); this.name = 'TooLargeError'; this.code = 'too-large'; this.size = size; this.max = max; }
}
