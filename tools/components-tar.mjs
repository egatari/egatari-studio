// A small, dependency-free tar (ustar) writer and reader for the release tarball.
// The writer is deterministic: entries in the given order (the caller sorts them), regular files only,
// mode 0644, uid/gid 0, no user/group names, mtime 0; gzip without a file name or time (Node's zlib).
// The reader accepts only what the writer makes: regular files ('0' or NUL type) with safe relative paths.
// A copy of tools/tar.mjs in egatari/components (the release side); keep the two in step.
import zlib from 'node:zlib';

const BLOCK = 512;
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });

function octal(n, width) {
  const s = n.toString(8);
  if (s.length > width - 1) throw new Error(`tar: ${n} does not fit in ${width} bytes`);
  return s.padStart(width - 1, '0') + '\0';
}

function header(name, size) {
  const h = new Uint8Array(BLOCK);
  const put = (off, str, width) => {
    const b = enc.encode(str);
    if (b.length > width) throw new Error(`tar: "${str}" is longer than ${width} bytes`);
    h.set(b, off);
  };
  let prefix = '', base = name;
  if (enc.encode(name).length > 100) {
    const i = name.lastIndexOf('/', name.length - 1);
    prefix = name.slice(0, i); base = name.slice(i + 1);
    if (i < 0 || enc.encode(base).length > 100 || enc.encode(prefix).length > 155) throw new Error(`tar: path too long: ${name}`);
  }
  put(0, base, 100);
  put(100, octal(0o644, 8), 8);
  put(108, octal(0, 8), 8);
  put(116, octal(0, 8), 8);
  put(124, octal(size, 12), 12);
  put(136, octal(0, 12), 12);
  put(148, '        ', 8);
  put(156, '0', 1);
  put(257, 'ustar\0', 6);
  put(263, '00', 2);
  put(345, prefix, 155);
  let sum = 0;
  for (const x of h) sum += x;
  put(148, sum.toString(8).padStart(6, '0') + '\0 ', 8);
  return h;
}

// entries: [[path, Uint8Array], …] → gzip bytes (Buffer)
export function writeTarGz(entries) {
  const parts = [];
  for (const [name, data] of entries) {
    if (safePath(name) !== null) throw new Error(`tar: unsafe path ${name}: ${safePath(name)}`);
    parts.push(header(name, data.length), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const gz = zlib.gzipSync(Buffer.concat(parts), { level: 9 });
  gz[9] = 3;   // the OS byte of the gzip header: zlib writes the build platform's code; fix it so that the bytes do not depend on it
  return gz;
}

// Why a path is not acceptable (null if it is): relative, '/'-separated, no empty, '.' or '..' segment, no backslash, colon or control character
export function safePath(p) {
  if (typeof p !== 'string' || !p) return 'empty';
  if (p.startsWith('/')) return 'absolute';
  if (/[\\:\u0000-\u001f\u007f]/.test(p)) return 'backslash, colon or control character';
  for (const s of p.split('/')) if (!s || s === '.' || s === '..') return 'empty, . or .. segment';
  return null;
}

// gzip bytes → Map(path → Uint8Array). Throws on anything but plain files with safe paths, on duplicates and on bad checksums.
export function readTarGz(gz, { maxBytes = 64 * 1024 * 1024 } = {}) {
  const tar = zlib.gunzipSync(gz, { maxOutputLength: maxBytes });
  const out = new Map();
  let off = 0;
  const str = (b) => { const i = b.indexOf(0); return dec.decode(i < 0 ? b : b.subarray(0, i)); };
  while (off + BLOCK <= tar.length) {
    const h = tar.subarray(off, off + BLOCK);
    if (h.every((x) => x === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (parseInt(str(h.subarray(148, 156)).trim(), 8) !== sum) throw new Error(`tar: bad header checksum at ${off}`);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(h.subarray(345, 500)), base = str(h.subarray(0, 100));
    const name = prefix ? `${prefix}/${base}` : base;
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8);
    if (type !== '0') throw new Error(`tar: ${name}: not a regular file (type ${type})`);
    const why = safePath(name);
    if (why) throw new Error(`tar: ${name}: ${why}`);
    if (out.has(name)) throw new Error(`tar: ${name}: appears twice`);
    if (!Number.isSafeInteger(size) || off + BLOCK + size > tar.length) throw new Error(`tar: ${name}: truncated`);
    out.set(name, new Uint8Array(tar.subarray(off + BLOCK, off + BLOCK + size)));
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}
