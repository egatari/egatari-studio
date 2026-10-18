// 上限つきの読み取りの共通の部分（Node の kit/bounded-read.mjs とブラウザの app/bounded-read.js が共有する。node: も fs も使わない）
// 信頼しないデータ（原稿のフォルダ・作業場所・持ち運べる 1 ファイル）は、どれもこの 2 つの口を通してだけ読む（tools/test-raw-reads.mjs が確かめる）
//
//   大きさはいつもバイト数（UTF-16 の字数を大きさとして使わない）。文字で読むものも、読んだバイト数を返す
//   読む前に大きさ（Node は開いた fd の fstat、ブラウザは File.size）を max と比べ、超えるなら読まずに ReadOverError。
//   読んだ後にも実際のバイト数を max と比べる（大きさは見積もり。読む間に大きくなることもある）
//
//   READ_LIMITS   組み立ての外で読むもの（開発サーバー・編集アプリの問い合わせ・npm run ids）の既定の上限（バイト）

const MiB = 1048576;
export const READ_LIMITS = Object.freeze({
  source: 32 * MiB,       // 原稿（deck.html）。組み立ての sourceChars（字数）と同じ数をバイトで（字数はバイト数より大きくならないので、より狭い）
  narration: 16 * MiB,    // 口述原稿（narration.md）
  comments: 4 * MiB,      // コメント（comments.json）
  json: 16 * MiB,         // 設定・記録の JSON（audio/manifest.json・timeline.json・render の timeline.out.json と .render-cache.json など）
  built: 256 * MiB,       // 組んだデッキ（組み立ての bundledChars と同じ数をバイトで）。render/ が読む
  audio: 256 * MiB,       // 音声の 1 ファイル（組み立ての readChars と同じ数）。render/ が hash を取る
  component: 32 * MiB,    // 部品庫の部品の index.js（持ち運べる形式の fileMax と同じ）
  default: 32 * MiB,      // 呼び手が上限を渡さないとき
});

// 文字列を UTF-8 にしたときのバイト数（文字列を作らずに数える。対でないサロゲートは U+FFFD の 3 バイト）
export function utf8Length(s) {
  s = String(s);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

// 読み取りが、許された大きさ（max バイト）を超えた。n は超えたと分かった大きさ（バイト）
export class ReadOverError extends Error {
  constructor(n, max, what = '') { super(`${what ? what + ': ' : ''}${n} bytes is over the limit of ${max} bytes`); this.name = 'ReadOverError'; this.code = 'read-over'; this.n = n; this.max = max; }
}
// 通常のファイルでないもの（FIFO・デバイス・ソケット）を読もうとした（読まずに断る。開けば止まるものもある。format spec §11）
export class NotRegularFileError extends Error {
  constructor(p) { super(`build: ${p} is not a regular file (FIFO, device or socket); refusing to read it`); this.name = 'NotRegularFileError'; this.code = 'build-not-a-file'; }
}

// opts → 上限（バイト）。数（古い呼び方）でも {max} でもよい。渡さなければ READ_LIMITS.default（限りなしにはしない。Infinity は明示したときだけ）
export function maxOf(opts) {
  const m = typeof opts === 'number' ? opts : opts && opts.max !== undefined ? opts.max : READ_LIMITS.default;
  if (m === Infinity) return Infinity;
  if (!(Number.isFinite(m) && m >= 0)) throw new TypeError(`bounded read: bad max ${m}`);
  return Math.floor(m);
}
// 読む前：分かっている大きさ n が max を超えるなら断る
export function checkBefore(n, max, what) { if (n > max) throw new ReadOverError(n, max, what); }
// 読んだ後：実際のバイト数が max を超えるなら断る
export function checkAfter(n, max, what) { if (n > max) throw new ReadOverError(n, max, what); }
