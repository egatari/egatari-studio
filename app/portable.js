// 編集アプリと持ち運べる 1 ファイル（format spec。名前・拡張子は kit/core/format.mjs）：
//   readInWorker(bytes, {extract})  開いたファイルを Web Worker（portable-worker.js）の中で検査して取り出す。ファイルは実行しない・
//                                   ページに入れない（移動も srcdoc も innerHTML もしない）。結果の索引は原型のない object
// 次のものは portable-ws.js（Worker を使わないので Node の単体の試験でも動く）：
//   workspaceFromPortable(name, r)  取り出した原稿からメモリの上の作業場所（memfs.js）を作る（audio/manifest.json を音声の記録から作り、
//                                   egatari.json の docId と権利の表示を索引に合わせる）
//   archiveFiles(ws)                フォルダへ書き出すもの（npm run portable -- unpack と同じ：原稿・音声・audio/manifest.json。控え・コメントは外す）
//   writeToDirectory(dir, files)    空のフォルダにだけ書く（空でなければ断る。unpack と同じ）
//   registryProblems(orig, fresh)   部品庫・テーマ庫の部品が、このエディタのものと同じか（違えば作り直しの編集はできない。§6）
//   staleSteps(ws)                  音声が古い段階（§5.4：inputHash が null か、今の口述原稿と違う）
import WORKER_SRC from 'virtual:portable-worker';
import { parseJsonStrict } from '../kit/core/portable.mjs';
import { unpackFiles } from './portable-ws.js';
export { workspaceFromPortable, archiveFiles, writeToDirectory, registryProblems, staleSteps } from './portable-ws.js';

// ---------------------------------------------------------------- Worker
let worker = null, seq = 0;
const waiting = new Map();
function getWorker() {
  if (worker) return worker;
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  worker = new Worker(url, { name: 'portable-reader' });
  worker.onmessage = (e) => { const m = e.data || {}; const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w.resolve(m); } };
  worker.onerror = (e) => {
    e.preventDefault();
    for (const w of waiting.values()) w.reject(Object.assign(new Error('reader worker failed: ' + (e.message || 'error')), { code: 'worker' }));
    waiting.clear(); worker.terminate(); worker = null;
  };
  return worker;
}
function call(msg, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    try { getWorker().postMessage({ ...msg, id }, transfer); } catch (e) { waiting.delete(id); reject(e); }
  });
}
export async function readInWorker(bytes, { extract = false } = {}) {
  const buf = new Uint8Array(bytes).slice().buffer;   // 写しを渡す（呼び手のバイト列はそのまま）
  const m = await call({ bytes: buf, extract }, [buf]);
  if (!m.ok) throw Object.assign(new Error(m.error.message), { code: m.error.code });
  return {
    index: parseJsonStrict(m.indexText),
    deckMeta: m.deckMetaText ? parseJsonStrict(m.deckMetaText) : null,
    files: unpackFiles(m),
    warnings: m.warnings || [], sourceMatches: !!m.sourceMatches, extractOnly: !!m.extractOnly,
  };
}
// 試験：Worker の大域変数（印のスクリプトが Worker の中でも動いていないこと）
export const probeWorker = async (name) => (await call({ probe: name })).value;
