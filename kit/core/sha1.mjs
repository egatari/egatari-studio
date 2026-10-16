// SHA-1（16 進）。Node の crypto がない場所（ブラウザ）でも同期で同じ値を出す
// build の data-src-h・開発サーバーの衝突の確認（短い hash）に使う。文字列は UTF-8 で数える
const enc = new TextEncoder();
export function sha1Hex(input) {
  const msg = typeof input === 'string' ? enc.encode(input) : input;
  const len = msg.length;
  const nBlocks = ((len + 8) >> 6) + 1;
  const w = new Uint32Array(nBlocks * 16);
  for (let i = 0; i < len; i++) w[i >> 2] |= msg[i] << (24 - (i & 3) * 8);
  w[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  // 長さ（ビット）。2^32 を超える分も上の語に入れる
  w[nBlocks * 16 - 1] = (len * 8) >>> 0;
  w[nBlocks * 16 - 2] = Math.floor(len / 0x20000000);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const x = new Uint32Array(80);
  for (let b = 0; b < nBlocks; b++) {
    for (let t = 0; t < 16; t++) x[t] = w[b * 16 + t];
    for (let t = 16; t < 80; t++) { const v = x[t - 3] ^ x[t - 8] ^ x[t - 14] ^ x[t - 16]; x[t] = (v << 1) | (v >>> 31); }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f, k;
      if (t < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (t < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + x[t]) >>> 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((v) => v.toString(16).padStart(8, '0')).join('');
}
// 8 桁の短い hash（kit/build.mjs と server/dev.mjs の short() と同じ値）
export const short = (s) => sha1Hex(s).slice(0, 8);
