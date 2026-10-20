// 部品のコードとテーマの字のファイルの「同一性の hash」（format spec §6）：hash の前に改行をそろえる。
// CRLF と単独の CR を LF にし、先頭の UTF-8 の BOM を除く（どの OS の checkout でも同じ hash。JavaScript と CSS は改行が違っても意味が同じ）。
// 対象は index.components の sha256（部品の index.js）と index.themes の sha256（テーマの字のファイル）だけ。配布物（リリースの tarball）は
// バイトのまま確かめる。組み立て・書き出し・照合・components:update・components.lock.json・編集アプリが同じ関数を使う。
// node: の読み込み・fs・process を使わない（編集アプリと共有）
export const TEXT_IDENTITY = /\.(?:css|js|mjs|cjs|json|svg|txt|md|tex|html?|xml)$/i;

// 改行をそろえたバイト（変えるところがなければ同じ配列を返す）
export function normalizeEol(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const start = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  if (!start && b.indexOf(0x0d) < 0) return b;
  const out = new Uint8Array(b.length - start);
  let n = 0;
  for (let i = start; i < b.length; i++) {
    const x = b[i];
    if (x === 0x0d) { out[n++] = 0x0a; if (b[i + 1] === 0x0a) i++; } else out[n++] = x;
  }
  return out.subarray(0, n);
}
// 同一性の hash に使うバイト：字のファイル（拡張子で決める。部品の index.js はいつも字）なら改行をそろえ、ほかはそのまま
export const identityBytes = (path, bytes) => (TEXT_IDENTITY.test(String(path)) ? normalizeEol(bytes) : bytes);
// 前の Windows の checkout（改行が CRLF）で書き出した文書が記録した hash を引くための、LF を CRLF にしたバイト（normalizeEol の後のものに使う）
export function toCrlf(bytes) {
  let k = 0;
  for (const x of bytes) if (x === 0x0a) k++;
  const out = new Uint8Array(bytes.length + k);
  let n = 0;
  for (const x of bytes) { if (x === 0x0a) out[n++] = 0x0d; out[n++] = x; }
  return out;
}
