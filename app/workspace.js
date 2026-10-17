// 作業場所：編集アプリはこれを通してだけ原稿を読み書きする。2 種類が同じ口を持つ
//   folderWorkspace(handle)   選んだフォルダ（File System Access API。fsx.js）
//   memoryWorkspace(name, …)  持ち運べる 1 ファイルから取り出したメモリの上のフォルダ（memfs.js）
// 口：list({audio}) → {files: Map(rel → {m, s}), dirs}、readBytes(rel)、readText(rel)（なければ null）、writeText(rel, text)、
//     writeBytes(rel, bytes)、exists(rel)、backup(rel)（.cache/edits/ に控え）。kind（'folder' | 'memory'）と name
import { walk, readBytes, readText, writeText, writeBytes, exists, backup } from './fsx.js';
export { memoryWorkspace } from './memfs.js';

export function folderWorkspace(handle) {
  return {
    kind: 'folder', name: handle.name, handle, dirty: false, markClean() {},
    list: (o) => walk(handle, o),
    readBytes: (rel) => readBytes(handle, rel),
    readText: (rel) => readText(handle, rel),
    writeText: (rel, text) => writeText(handle, rel, text),
    writeBytes: (rel, bytes) => writeBytes(handle, rel, bytes),
    exists: (rel) => exists(handle, rel),
    backup: (rel) => backup(handle, rel),
  };
}
