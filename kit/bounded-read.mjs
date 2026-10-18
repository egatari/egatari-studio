// 上限つきの読み取り（Node）。信頼しないデータ（原稿のフォルダ・持ち運べる 1 ファイル・作業場所）のファイルは、どれもここを通してだけ読む
// （readFileSync・fs.readFile・createReadStream を使わない。tools/test-raw-reads.mjs が確かめる）。ブラウザの側は app/bounded-read.js、
// 共通の部分（上限・誤り・UTF-8 のバイト数）は kit/core/bounded-read-core.mjs
//
//   readRegular(p, {max})        通常のファイルであることを確かめてから（lstat、リンクなら指す先の stat。FIFO・デバイス・ソケットは
//                                NotRegularFileError で開かない）、止まらないように開き（O_NONBLOCK）、開いた fd でも通常のファイルで、
//                                確かめたものと同じ（dev・ino）であることを確かめ、fd の大きさが max を超えるなら読まずに、その fd から
//                                max バイトまでだけ読む。開いたときの大きさより多く読める（読む間に大きくなった）なら ReadOverError → Buffer
//   readRegularText(p, {max})    同じものを UTF-8 で読む → {text, bytes}（bytes は読んだバイト数。字数ではない）
//   regularStat(p)               通常のファイルの stat（リンクなら指す先の）。でなければ NotRegularFileError
//
// max を渡さなければ READ_LIMITS.default（32 MiB）。数を渡してもよい（readRegular(p, 1000)）。限りなしは {max: Infinity} と書いたときだけ
import fs from 'node:fs';
import { ReadOverError, NotRegularFileError, READ_LIMITS, maxOf, utf8Length } from './core/bounded-read-core.mjs';

export { ReadOverError, NotRegularFileError, READ_LIMITS, utf8Length };

export function regularStat(p) {
  const ls = fs.lstatSync(p);
  const st = ls.isSymbolicLink() ? fs.statSync(p) : ls;
  if (!st.isFile()) throw new NotRegularFileError(p);
  return st;
}

export function readRegular(p, opts) {
  const max = maxOf(opts);
  const st = regularStat(p);
  const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile() || fst.dev !== st.dev || fst.ino !== st.ino) throw new NotRegularFileError(p);
    if (fst.size > max) throw new ReadOverError(fst.size, max);
    const buf = Buffer.allocUnsafe(fst.size);
    let got = 0;
    while (got < fst.size) { const k = fs.readSync(fd, buf, got, fst.size - got, null); if (k === 0) break; got += k; }
    // 開いたときの大きさの先にまだあれば（読む間に大きくなった）断る
    const extra = fs.readSync(fd, Buffer.alloc(1), 0, 1, null);
    if (extra > 0) throw new ReadOverError(Math.max(fst.size, got) + extra, Math.min(max, fst.size));
    return got === fst.size ? buf : buf.subarray(0, got);
  } finally { fs.closeSync(fd); }
}

export function readRegularText(p, opts) {
  const b = readRegular(p, opts);
  return { text: b.toString('utf8'), bytes: b.length };
}
