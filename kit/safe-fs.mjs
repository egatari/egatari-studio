// 原稿のフォルダ（など、許した根）の中だけに書く・読むための口（Node だけ）。開発サーバー・npm run ids・npm run portable・組み立ての書き出しが使う
// format spec §11：フォルダから読む・書くときは、フォルダの外を指すシンボリックリンク（junction・alias も）をたどらない（控えとその掃除も）
//
//   safeWriteFile(base, file, data)    file に書く。base から file までの途中のフォルダと file 自身のどれかがシンボリックリンクなら断る
//                                      （外を指していなくても。書き込みはリンクを一切通らない）。足りないフォルダは 1 段ずつ作って確かめ、
//                                      親の実体のパスが base の実体の中にあることを確かめてから、同じフォルダに排他的に作った一時ファイル
//                                      （O_EXCL、名前は乱数）に書いて fsync し、rename で入れ替える（途中で止まっても半分のファイルが残らない。
//                                      Windows でも既にあるファイルの上に rename できる）
//   checkWritable(base, file)         safeWriteFile が断るものを、何も作らずに先に断る
//   readContained(base, file, enc, {max}) 読む。実体のパスが base の実体の中にある通常のファイルだけ（中を指すリンクはよい）、max バイトまで
//                                      （kit/bounded-read.mjs）。なければ null
//   backupFile(base, file, editsRel)   file の控えを base/<editsRel>/<時刻>-<名前> に書く（safeWriteFile で）
//   pruneBackups(base, editsRel, keep) 控えのフォルダ（途中も含めてリンクでなく、base の中にあること）の中の、控えの名前の形をした
//                                      普通のファイルだけを、古いものから消して keep 個にする（ほかのものには触れない）
//
// 断るときは UnsafePathError（code 'unsafe-path'）。確かめてから書くまでの間に別のプロセスがリンクに差し替える競合は防がない
// （相手は原稿のフォルダに置かれたリンクで、同時に動くプロセスではない。docs と SECURITY.md）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readRegular, READ_LIMITS } from './bounded-read.mjs';

export class UnsafePathError extends Error {
  constructor(msg) { super(msg); this.name = 'UnsafePathError'; this.code = 'unsafe-path'; }
}
// 控えの名前（<時刻>-<元の名前>）は編集アプリと同じもの（kit/core/backup-name.mjs）
import { BACKUP_RE, backupStamp, isBackupName } from './core/backup-name.mjs';
export { BACKUP_RE, backupStamp, isBackupName };

const lst = (p) => { try { return fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; } };
const inside = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

// base（あるフォルダ）から見た file の段。base の外（../・別のドライブ）なら断る
function segments(base, file, real = null) {
  let rel = path.relative(path.resolve(base), path.resolve(file));
  // base の実体のパスで書かれた file も受ける
  if (real && (rel.startsWith('..') || path.isAbsolute(rel))) rel = path.relative(real, path.resolve(file));
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new UnsafePathError(`refusing to write outside ${base}: ${file}`);
  const segs = rel.split(path.sep);
  if (segs.some((s) => !s || s === '.' || s === '..' || s.includes('\0'))) throw new UnsafePathError(`bad path: ${file}`);
  return segs;
}
function baseReal(base) {
  // base そのものは呼び出した人が選んだ場所（シンボリックリンクでもよい。その実体を根にする）
  const real = fs.realpathSync(path.resolve(base));
  if (!fs.statSync(real).isDirectory()) throw new UnsafePathError(`not a directory: ${base}`);
  return real;
}
// base の実体から、segs の途中のフォルダを 1 段ずつ確かめる（mkdir なら足りないものを作る）。返すもの：親のフォルダ（実体の側）
function walkDirs(real, segs, file, mkdir) {
  let d = real;
  for (const s of segs) {
    d = path.join(d, s);
    let st = lst(d);
    if (!st) {
      if (!mkdir) return null;
      try { fs.mkdirSync(d); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      st = lst(d);
    }
    if (!st || st.isSymbolicLink()) throw new UnsafePathError(`refusing to write through the symbolic link ${path.relative(real, d)} (${file})`);
    if (!st.isDirectory()) throw new UnsafePathError(`not a directory: ${path.relative(real, d)} (${file})`);
  }
  const pr = fs.realpathSync(d);
  if (!inside(pr, real)) throw new UnsafePathError(`refusing to write outside ${real}: ${file}`);
  return d;
}

export function safeWriteFile(base, file, data, { mkdir = true } = {}) {
  const real = baseReal(base);
  const segs = segments(base, file, real);
  const name = segs.pop();
  const dir = walkDirs(real, segs, file, mkdir);
  if (!dir) throw new UnsafePathError(`no such directory: ${path.dirname(file)}`);
  const leaf = path.join(dir, name);
  const st = lst(leaf);
  if (st && st.isSymbolicLink()) throw new UnsafePathError(`refusing to write through the symbolic link ${path.relative(real, leaf)}`);
  if (st && !st.isFile()) throw new UnsafePathError(`not a regular file: ${path.relative(real, leaf)}`);
  const tmp = path.join(dir, `.${name}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(tmp, flags, st ? st.mode & 0o777 : 0o666);
  try {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
  } catch (e) { fs.closeSync(fd); try { fs.unlinkSync(tmp); } catch { /* 消えた */ } throw e; }
  fs.closeSync(fd);
  try {
    // 入れ替える直前にもう一度：葉がリンクに替わっていないこと（rename は葉のリンクを置き換えるだけでたどらないが、断ると決めている）
    const again = lst(leaf);
    if (again && (again.isSymbolicLink() || !again.isFile())) throw new UnsafePathError(`refusing to write through the symbolic link ${path.relative(real, leaf)}`);
    renameOver(tmp, leaf);
  } catch (e) { try { fs.unlinkSync(tmp); } catch { /* 消えた */ } throw e; }
  // フォルダの項目も書き出す（POSIX。Windows ではフォルダを開けないので飛ばす）
  if (process.platform !== 'win32') { try { const dfd = fs.openSync(dir, 'r'); try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); } } catch { /* できなくてもよい */ } }
  return leaf;
}
// 書く前の確かめだけ（何も作らない）：safeWriteFile が断るものを先に断る（いくつも書くときに、途中まで書いてから断らないように）
export function checkWritable(base, file) {
  const real = baseReal(base);
  const segs = segments(base, file, real);
  const name = segs.pop();
  let d = real;
  for (const s of segs) {
    d = path.join(d, s);
    const st = lst(d);
    if (!st) return;                    // ここから先は作る（作ったものを safeWriteFile が確かめる）
    if (st.isSymbolicLink()) throw new UnsafePathError(`refusing to write through the symbolic link ${path.relative(real, d)} (${file})`);
    if (!st.isDirectory()) throw new UnsafePathError(`not a directory: ${path.relative(real, d)} (${file})`);
  }
  if (!inside(fs.realpathSync(d), real)) throw new UnsafePathError(`refusing to write outside ${real}: ${file}`);
  const st = lst(path.join(d, name));
  if (st && st.isSymbolicLink()) throw new UnsafePathError(`refusing to write through the symbolic link ${path.relative(real, path.join(d, name))}`);
  if (st && !st.isFile()) throw new UnsafePathError(`not a regular file: ${path.relative(real, path.join(d, name))}`);
}
// Windows では、ほかのプロセス（エディタ・ウイルス対策）が開いている間の rename が EPERM・EBUSY になることがある。少し待って何回か試す
function renameOver(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (e) {
      if (process.platform !== 'win32' || i >= 9 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1));
    }
  }
}

// 実体のパスが base の実体の中にあるファイルだけを読む。ないなら null。外を指すなら UnsafePathError。通常のファイルだけを、上限つきで
// （kit/bounded-read.mjs の readRegular：開いた fd の大きさが opts.max バイトを超えるなら読まずに、読む間に大きくなっても ReadOverError、
// code 'read-over'）。max を渡さなければ READ_LIMITS.default（32 MiB）
export function readContained(base, file, enc = null, opts = {}) {
  const real = baseReal(base);
  segments(base, file, real);
  let rp;
  try { rp = fs.realpathSync(path.resolve(file)); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; }
  if (!inside(rp, real) || rp === real) throw new UnsafePathError(`refusing to read outside ${base}: ${file}`);
  let bytes;
  try { bytes = readRegular(rp, { max: opts.max === undefined ? READ_LIMITS.default : opts.max }); }
  catch (e) { if (e && e.code === 'build-not-a-file') throw new UnsafePathError(`not a regular file: ${file}`); throw e; }
  return enc ? bytes.toString(enc) : bytes;
}
export const existsContained = (base, file) => { try { return readContained(base, file) !== null; } catch { return false; } };

// 控え：base/<editsRel>/<時刻>-<名前>。元のファイルは base の中にあるもの（readContained。opts.max バイトまで）だけ。ないなら何もしない
export function backupFile(base, file, editsRel = path.join('.cache', 'edits'), opts = {}) {
  const bytes = readContained(base, file, null, opts);
  if (bytes === null) return null;
  return safeWriteFile(base, path.join(path.resolve(base), editsRel, `${backupStamp()}-${path.basename(file)}`), bytes);
}
// 控えのフォルダの掃除。フォルダ（途中も）がリンクなら何も消さずに断る。消すのは BACKUP_RE に合う普通のファイルだけ
export function pruneBackups(base, editsRel = path.join('.cache', 'edits'), keep = 30) {
  const real = baseReal(base);
  const segs = segments(base, path.join(path.resolve(base), editsRel), real);
  const dir = walkDirs(real, segs, editsRel, false);
  if (!dir) return [];
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && isBackupName(d.name)).map((d) => d.name).sort();
  const gone = [];
  for (const n of names.slice(0, Math.max(0, names.length - keep))) {
    const f = path.join(dir, n), st = lst(f);
    if (!st || st.isSymbolicLink() || !st.isFile()) continue;
    fs.unlinkSync(f);
    gone.push(n);
  }
  return gone;
}
