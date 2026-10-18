// 上限つきの読み取り（ブラウザ）。編集アプリが信頼しないデータ（選んだフォルダのファイル・開いた持ち運べる 1 ファイル・声のファイル）を
// File から読むのは、どれもここを通してだけ（File.text()・arrayBuffer() を直に呼ばない。tools/test-raw-reads.mjs が確かめる）。
// Node の側は kit/bounded-read.mjs、共通の部分（上限・誤り・UTF-8 のバイト数）は kit/core/bounded-read-core.mjs
//
//   readFileBounded(fileOrHandle, {max})       File（か FileSystemFileHandle）の File.size を読む前に max と比べ、超えるなら読まずに、
//                                              読んだ後も実際のバイト数を max と比べて（大きさは見積もり）超えれば ReadOverError（code 'read-over'）
//                                              → Uint8Array
//   readFileBoundedText(fileOrHandle, {max})   同じものを UTF-8 で読む → {text, bytes}（bytes は読んだバイト数。字数ではない）
//
//   fetchBounded(url, {max, what})             同じ配信元からの fetch（見本の教材）：Content-Length があれば読む前に、読みながら数えた
//                                              バイト数も max と比べ、超えればその場で読むのをやめて ReadOverError → Uint8Array
//
// max を渡さなければ READ_LIMITS.default（32 MiB）。限りなしは {max: Infinity} と書いたときだけ
import { ReadOverError, READ_LIMITS, maxOf, checkBefore, checkAfter } from '../kit/core/bounded-read-core.mjs';

export { ReadOverError, READ_LIMITS };

const dec = new TextDecoder();

async function fileOf(x) {
  if (x && typeof x.getFile === 'function' && typeof x.arrayBuffer !== 'function') return x.getFile();
  return x;
}

export async function readFileBounded(fileOrHandle, opts) {
  const max = maxOf(opts), what = opts && opts.what;
  const file = await fileOf(fileOrHandle);
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('readFileBounded: not a File');
  const size = Number(file.size);
  if (!(size >= 0)) throw new ReadOverError(Infinity, max, what);
  checkBefore(size, max, what);
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAfter(bytes.byteLength, max, what);
  return bytes;
}

export async function readFileBoundedText(fileOrHandle, opts) {
  const bytes = await readFileBounded(fileOrHandle, opts);
  return { text: dec.decode(bytes), bytes: bytes.byteLength };
}

export async function fetchBounded(url, opts) {
  const max = maxOf(opts), what = opts && opts.what;
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const len = Number(r.headers.get('content-length'));
  if (Number.isFinite(len) && len > 0) checkBefore(len, max, what);
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { reader.cancel().catch(() => {}); checkAfter(n, max, what); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}
