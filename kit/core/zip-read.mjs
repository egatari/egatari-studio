// ZIP の安全な読み取り（Colab から戻る zip の取り込み。ダウンロード物＝信頼しない。node: も fs も使わない。ブラウザの Worker 外でも動く）
//
//   const r = await readZip(bytes, { maxMembers, maxMemberBytes: (name) => 上限（バイト）, maxTotalBytes, accept: (name) => boolean })
//   → { files: Map<名前, Uint8Array>, skipped: [名前…] }
//
// 守ること：割り当てる前に上限を課す（中央ディレクトリの数・宣言された大きさを見てから、その順で膨らませる）。展開は上限を超えた時点で打ち切る
// （宣言と実際が食い違う zip 爆弾）。CRC-32 を確かめる。暗号化・zip64・複数ディスク・ストアと deflate 以外の方式は断る。
// 名前は accept が通したものだけ読む（ほかは skipped に数えて読まない）。同じ名前が 2 度出れば断る。どれも失敗は ZipError（code 付き）
const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50;

export class ZipError extends Error {
  constructor(code, msg) { super(msg); this.name = 'ZipError'; this.code = code; }
}
const bad = (code, msg) => new ZipError(code, msg);

let CRC_TABLE = null;
export function crc32(u) {
  if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < u.length; i++) c = CRC_TABLE[(c ^ u[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// deflate-raw を、出力が max バイトを超えたら打ち切って展開する
async function inflateBounded(comp, max, what) {
  if (typeof DecompressionStream !== 'function') throw bad('zip-no-inflate', 'this environment cannot decompress zip members (DecompressionStream)');
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  const feed = w.write(comp).then(() => w.close()).catch(() => {});
  const rd = ds.readable.getReader(), chunks = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (n > max) { await rd.cancel().catch(() => {}); throw bad('zip-over', `${what}: expands beyond ${max} bytes`); }
      chunks.push(value);
    }
  } catch (e) { if (e instanceof ZipError) throw e; throw bad('zip-corrupt', `${what}: cannot decompress`); }
  await feed;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function readZip(bytes, { maxMembers = 512, maxMemberBytes = () => 0, maxTotalBytes = 0, accept = () => true } = {}) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  if (u.length < 22) throw bad('zip-not-zip', 'not a zip file');
  // 終端の記録（末尾の 22 バイト〜コメント込みの 65557 バイトの間）
  let e = -1;
  for (let i = u.length - 22, lo = Math.max(0, u.length - 22 - 65535); i >= lo; i--) if (dv.getUint32(i, true) === EOCD) { e = i; break; }
  if (e < 0) throw bad('zip-not-zip', 'not a zip file (no end record)');
  const disk = dv.getUint16(e + 4, true), cdDisk = dv.getUint16(e + 6, true), here = dv.getUint16(e + 8, true), total = dv.getUint16(e + 10, true);
  const cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  if (disk !== 0 || cdDisk !== 0 || here !== total) throw bad('zip-multi', 'multi-disk zip files are not supported');
  if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw bad('zip64', 'zip64 is not supported');
  if (total > maxMembers) throw bad('zip-members', `too many members (${total}; at most ${maxMembers})`);
  if (cdOff + cdSize > e) throw bad('zip-corrupt', 'bad central directory');
  const files = new Map(), skipped = [], seen = new Set();
  let sum = 0, p = cdOff;
  const dec = new TextDecoder('utf-8', { fatal: false });
  for (let k = 0; k < total; k++) {
    if (p + 46 > cdOff + cdSize || dv.getUint32(p, true) !== CEN) throw bad('zip-corrupt', 'bad central directory entry');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    if (p + 46 + nl + xl + cl > cdOff + cdSize) throw bad('zip-corrupt', 'bad central directory entry');
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;                 // フォルダの項目
    if (seen.has(name)) throw bad('zip-dup', `duplicate member: ${name}`);
    seen.add(name);
    if (!accept(name)) { skipped.push(name); continue; }
    if (flags & 1) throw bad('zip-encrypted', `${name}: encrypted members are not supported`);
    if (csize === 0xffffffff || usize === 0xffffffff) throw bad('zip64', 'zip64 is not supported');
    if (method !== 0 && method !== 8) throw bad('zip-method', `${name}: unsupported compression method ${method}`);
    const cap = maxMemberBytes(name);
    if (!(cap > 0)) { skipped.push(name); continue; }
    if (usize > cap) throw bad('zip-over', `${name}: ${usize} bytes is over the limit of ${cap} bytes`);
    sum += usize;
    if (maxTotalBytes && sum > maxTotalBytes) throw bad('zip-over', `members add up to more than ${maxTotalBytes} bytes`);
    if (lho + 30 > e || dv.getUint32(lho, true) !== LOC) throw bad('zip-corrupt', `${name}: bad local header`);
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (start + csize > cdOff) throw bad('zip-corrupt', `${name}: data is outside the file`);
    const raw = u.subarray(start, start + csize);
    let data;
    if (method === 0) { if (csize !== usize) throw bad('zip-corrupt', `${name}: size mismatch`); data = raw.slice(); }
    else { data = await inflateBounded(raw, usize, name); if (data.length !== usize) throw bad('zip-corrupt', `${name}: size mismatch`); }
    if (crc32(data) !== crc) throw bad('zip-crc', `${name}: CRC-32 mismatch`);
    files.set(name, data);
  }
  return { files, skipped };
}

// 試験・道具用の書き手。entries：[名前, 中身, opts?]。既定はストア（ノートブックの zipfile の出力と同じ読み方で読める）。
// opts：{comp: deflate-raw で縮めた中身（method 8 にする）, usize: 宣言する大きさ（細工用）, flags: 一般目的ビット（細工用）}
export function writeZip(entries) {
  const enc = new TextEncoder(), parts = [], cen = [];
  let off = 0;
  for (const [name, data, opts = {}] of entries) {
    const nb = enc.encode(name), crc = crc32(data), body = opts.comp || data, method = opts.comp ? 8 : 0, usize = opts.usize ?? data.length, flags = 0x0800 | (opts.flags || 0);
    const lh = new Uint8Array(30 + nb.length), d = new DataView(lh.buffer);
    d.setUint32(0, LOC, true); d.setUint16(4, 20, true); d.setUint16(6, flags, true); d.setUint16(8, method, true);
    d.setUint32(14, crc, true); d.setUint32(18, body.length, true); d.setUint32(22, usize, true); d.setUint16(26, nb.length, true);
    lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length), c = new DataView(ch.buffer);
    c.setUint32(0, CEN, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, method, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, usize, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    ch.set(nb, 46);
    parts.push(lh, body); cen.push(ch); off += lh.length + body.length;
  }
  const cdSize = cen.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, EOCD, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...cen, end], out = new Uint8Array(off + cdSize + 22);
  let o = 0;
  for (const x of all) { out.set(x, o); o += x.length; }
  return out;
}
