// 作業場所：編集アプリはこれを通してだけ原稿を読み書きする。2 種類が同じ口を持つ
//   folderWorkspace(handle)   選んだフォルダ（File System Access API。fsx.js）
//   memoryWorkspace(name, …)  持ち運べる 1 ファイルから取り出したメモリの上のフォルダ（memfs.js）
// 口：list({audio}) → {files: Map(rel → {m, s}), dirs}、readBytes(rel, {max})（max バイトを超えるなら code 'read-over' で断る）、readText(rel)（なければ null）、writeText(rel, text)、
//     writeBytes(rel, bytes)、exists(rel)、backup(rel)（.cache/edits/ に控え）。kind（'folder' | 'memory'）と name。
//     書き込みの opts.live()：false なら書かない（書いている途中で false になれば入れ替えない。fsx.js の writeFile）。
//     revision：中身の版（書くたびに増える。フォルダは使わない）。markClean(rev)：rev が今の版のときだけ「保存した」にする
import { walk, readBytes, readText, writeText, writeBytes, exists, backup } from './fsx.js';
export { memoryWorkspace } from './memfs.js';

export function folderWorkspace(handle) {
  return {
    kind: 'folder', name: handle.name, handle, dirty: false, revision: 0, markClean() { return true; },
    list: (o) => walk(handle, o),
    readBytes: (rel, o) => readBytes(handle, rel, o),
    readText: (rel) => readText(handle, rel),
    writeText: (rel, text, o) => writeText(handle, rel, text, o && o.live),
    writeBytes: (rel, bytes, o) => writeBytes(handle, rel, bytes, o && o.live),
    exists: (rel) => exists(handle, rel),
    backup: (rel) => backup(handle, rel),
  };
}
