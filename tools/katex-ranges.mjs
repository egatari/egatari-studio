// KaTeX の字（woff2）が持つ字の範囲（unicode-range）を、字の cmap から求めて kit/core/katex-ranges.mjs に書く
//   node tools/katex-ranges.mjs           書き直す（KaTeX の版を上げたとき）
//   node tools/katex-ranges.mjs --check   今の KaTeX と合っているかだけを確かめる（合わなければ終了コード 1）
// 組み立て（kit/core/build-core.mjs）は、埋め込む KaTeX の @font-face にこの範囲を unicode-range として書く（format spec §7.2：
// 段 A の編集が、どの字を持つかを範囲から知れるように）。ブラウザ（編集アプリ）では woff2 を展開できないので、範囲は前もって求めておく
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rangesOf, unicodeRange } from '../kit/core/build-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const kdir = path.dirname(require.resolve('katex'));
const version = JSON.parse(fs.readFileSync(path.join(kdir, '..', 'package.json'), 'utf8')).version;
const OUT = path.join(ROOT, 'kit', 'core', 'katex-ranges.mjs');

// WOFF2（https://www.w3.org/TR/WOFF2/）から cmap の表を取り出す
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
function cmapOf(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not WOFF2');
  if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('font collections are not supported');
  const numTables = buf.readUInt16BE(12), compLen = buf.readUInt32BE(20);
  let i = 48;
  const base128 = () => { let v = 0; for (let k = 0; k < 5; k++) { const b = buf[i++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; } throw new Error('bad UIntBase128'); };
  const tables = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[i++], idx = flags & 0x3f, xv = (flags >> 6) & 3;
    const tag = idx === 63 ? buf.toString('latin1', i, (i += 4)) : KNOWN[idx];
    const orig = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? xv !== 3 : xv !== 0;
    const len = transformed ? base128() : orig;
    tables.push({ tag, len });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(i, i + compLen));
  let off = 0;
  for (const t of tables) { if (t.tag === 'cmap') return data.subarray(off, off + t.len); off += t.len; }
  throw new Error('no cmap');
}
// cmap → 字（グリフ 0 でないもの）。(3,10)・(0,4|6) の形式 12 を先に、なければ形式 4
function codepoints(cmap) {
  const n = cmap.readUInt16BE(2), recs = [];
  for (let k = 0; k < n; k++) recs.push({ p: cmap.readUInt16BE(4 + k * 8), e: cmap.readUInt16BE(6 + k * 8), off: cmap.readUInt32BE(8 + k * 8) });
  const fmt = (r) => cmap.readUInt16BE(r.off);
  const pick = recs.find((r) => fmt(r) === 12 && ((r.p === 3 && r.e === 10) || r.p === 0)) || recs.find((r) => fmt(r) === 4 && ((r.p === 3 && (r.e === 1 || r.e === 0)) || r.p === 0));
  if (!pick) throw new Error('no usable cmap subtable');
  const out = new Set(), o = pick.off;
  if (fmt(pick) === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const s = cmap.readUInt32BE(o + 16 + g * 12), e = cmap.readUInt32BE(o + 20 + g * 12), gid = cmap.readUInt32BE(o + 24 + g * 12);
      for (let c = s; c <= e; c++) if (gid + (c - s) !== 0) out.add(c);
    }
  } else {
    const seg = cmap.readUInt16BE(o + 6) / 2;
    const endAt = o + 14, startAt = endAt + seg * 2 + 2, deltaAt = startAt + seg * 2, roAt = deltaAt + seg * 2;
    for (let s = 0; s < seg; s++) {
      const end = cmap.readUInt16BE(endAt + s * 2), start = cmap.readUInt16BE(startAt + s * 2), delta = cmap.readInt16BE(deltaAt + s * 2), ro = cmap.readUInt16BE(roAt + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (!ro) gid = (c + delta) & 0xffff;
        else { const at = roAt + s * 2 + ro + (c - start) * 2; gid = cmap.readUInt16BE(at); if (gid) gid = (gid + delta) & 0xffff; }
        if (gid) out.add(c);
      }
    }
  }
  return out;
}

const fonts = {};
for (const f of fs.readdirSync(path.join(kdir, 'fonts')).filter((x) => x.endsWith('.woff2')).sort()) {
  const cps = codepoints(cmapOf(fs.readFileSync(path.join(kdir, 'fonts', f))));
  fonts[f.replace(/\.woff2$/, '')] = unicodeRange(rangesOf([...cps].map((c) => String.fromCodePoint(c)).join('')));
}
const text = `// 生成したファイル（node tools/katex-ranges.mjs）。手で直さない。KaTeX の字（woff2）の cmap が持つ字の範囲（unicode-range の値）\n` +
  `export const KATEX_RANGES = Object.freeze(${JSON.stringify({ version, fonts }, null, 1)});\n`;
if (process.argv.includes('--check')) {
  // 改行は比べない（Windows の git は CRLF で取り出すことがある。中身の範囲だけを比べる）
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === text;
  console.log(same ? `kit/core/katex-ranges.mjs matches KaTeX ${version}` : `kit/core/katex-ranges.mjs is out of date for KaTeX ${version}: run node tools/katex-ranges.mjs`);
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(`kit/core/katex-ranges.mjs: ${Object.keys(fonts).length} fonts (KaTeX ${version})`);
