// 決まった形の ZIP を書く（SCORM の包み・AI への指示のスキルの zip。node: も fs も使わない：CLI と編集アプリで同じバイトになる）
//
//   writeZip([[名前, 中身（Uint8Array | 文字列）], …]) → Uint8Array
//
// 同じ入力からは、いつどこで作っても同じバイト：並びは渡した順のまま、圧縮しない（stored。deflate は zlib の版でバイトが変わる）、
// 時刻は 1980-01-01 00:00（DOS の日付の最小）、名前は UTF-8（汎用フラグのビット 11）、作った OS は MS-DOS（外部属性 0）、追加の欄・注釈なし。
// zip64 は書かない：項目が 65535 を、どこかが 4 GiB を超えれば断る
import { crc32 } from './zip-read.mjs';

const LOC = 0x04034b50, CEN = 0x02014b50, EOCD = 0x06054b50;
const DOS_DATE_1980_01_01 = 33;   // (1980 - 1980) << 9 | 1 << 5 | 1
const enc = new TextEncoder();

export function writeZip(entries) {
  if (entries.length > 0xffff) throw new Error(`zip: too many entries (${entries.length})`);
  const seen = new Set(), local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [name, data] of entries) {
    if (typeof name !== 'string' || !name || name.startsWith('/') || /[\\\0]/.test(name) || name.split('/').some((s) => s === '..' || s === '.' || s === '')) throw new Error(`zip: bad entry name ${JSON.stringify(name)}`);
    if (seen.has(name)) throw new Error(`zip: duplicate entry ${name}`);
    seen.add(name);
    const nb = enc.encode(name), bytes = typeof data === 'string' ? enc.encode(data) : data;
    if (bytes.length > 0xfffffffe || offset + 30 + nb.length + bytes.length > 0xfffffffe) throw new Error('zip: larger than 4 GiB');
    const crc = crc32(bytes);
    const h = new Uint8Array(30), hv = new DataView(h.buffer);
    hv.setUint32(0, LOC, true);
    hv.setUint16(4, 20, true);        // version needed: 2.0
    hv.setUint16(6, 0x800, true);     // UTF-8 names
    hv.setUint16(8, 0, true);         // stored
    hv.setUint16(10, 0, true);        // time 00:00:00
    hv.setUint16(12, DOS_DATE_1980_01_01, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, bytes.length, true);
    hv.setUint32(22, bytes.length, true);
    hv.setUint16(26, nb.length, true);
    const c = new Uint8Array(46), cv = new DataView(c.buffer);
    cv.setUint32(0, CEN, true);
    cv.setUint16(4, 20, true);        // version made by: MS-DOS, 2.0
    c.set(h.subarray(4, 30), 6);      // version needed … extra length（局所の見出しと同じ）
    cv.setUint32(42, offset, true);
    local.push(h, nb, bytes);
    central.push(c, nb);
    offset += 30 + nb.length + bytes.length;
    centralSize += 46 + nb.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, EOCD, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...local, ...central, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
