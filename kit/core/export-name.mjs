// 書き出すファイルの既定の名前：教材の題名から（同じ deck.ega.html がたまって取り違えないように）。Node にもブラウザにも依存しない
//   titleOf(html)                  <title> の文字（タグを除き、文字参照を戻す）。なければ ''
//   exportName(title, fallback, ext) → 題名から作った名前 + ext。題名が使えなければ fallback（デッキの名前。拡張子なし）+ ext
// どの OS でも使える名前にする：Windows の使えない字（\ / : * ? " < > |）と制御文字を除き、空白をまとめ、
// 頭の点（隠しファイル）と終わりの点・空白（Windows が落とす）を除き、予約の名前（CON・NUL・COM1 など）は避け、
// 拡張子を入れて 255 バイト（多くのファイルシステムの上限）に収まるよう、字の途中で切らずに短くする（字は NFC にそろえる）
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF) ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? ' ';
  });
}
export function titleOf(html) {
  const t = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return decode(t.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const MAX_CHARS = 80, MAX_BYTES = 255;
const utf8Bytes = (s) => new TextEncoder().encode(s).length;
function clean(s) {
  let x = String(s || '').normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[.\s]+/, '');
  return x;
}
function fit(name, ext) {
  let cps = [...name].slice(0, MAX_CHARS);
  while (cps.length && utf8Bytes(cps.join('') + ext) > MAX_BYTES) cps.pop();
  return cps.join('').replace(/[.\s]+$/, '');
}
export function exportName(title, fallback, ext) {
  const e = String(ext || '');
  for (const cand of [title, fallback, 'lesson']) {
    const n = fit(clean(cand), e);
    if (n && !RESERVED.test(n)) return n + e;
    if (n) return n + '_' + e;          // CON → CON_.ega.html
  }
  return 'lesson' + e;
}
