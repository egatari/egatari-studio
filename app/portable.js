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
// 要求は、それを出した Worker と代（generation）に結び付ける：止めた（terminate）・古い Worker からの答えは捨て、期限で止めるのはその要求を
// 出した Worker だけ（もう替わっていれば新しい Worker に触れない）。要求の番号は代をまたいで一意
let worker = null, gen = 0, seq = 0;
const waiting = new Map();          // 要求の番号 → {resolve, reject, gen}
let WorkerClass = typeof Worker === 'function' ? Worker : null;
export function _setWorkerClass(W) { WorkerClass = W; }   // 試験
const stopGen = (g, err) => {
  for (const [id, w] of waiting) if (w.gen === g) { waiting.delete(id); w.reject(err); }
  if (worker && gen === g) { const old = worker; worker = null; old.terminate(); }
};
function getWorker() {
  if (worker) return worker;
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  const me = new WorkerClass(url, { name: 'portable-reader' }), g = ++gen;
  worker = me;
  me.onmessage = (e) => {
    if (worker !== me || gen !== g) return;      // 止めた・古い Worker から
    const m = e.data || {}; const w = waiting.get(m.id);
    if (w && w.gen === g) { waiting.delete(m.id); w.resolve(m); }
  };
  me.onerror = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (worker !== me) return;
    stopGen(g, Object.assign(new Error('reader worker failed: ' + ((e && e.message) || 'error')), { code: 'worker' }));
  };
  return me;
}
// 返すもの：{p: 答えの Promise, g: 出した Worker の代}
function call(msg, transfer = []) {
  let g = 0;
  const p = new Promise((resolve, reject) => {
    const id = ++seq;
    let me;
    try { me = getWorker(); } catch (e) { reject(e); return; }
    g = gen;
    waiting.set(id, { resolve, reject, gen: g });
    try { me.postMessage({ ...msg, id }, transfer); } catch (e) { waiting.delete(id); reject(e); }
  });
  return { p, g };
}
// 読み取りの期限：これを過ぎたら、その要求を出した Worker を止めて（terminate。解析の途中でも止まる）断る。次の読み取りは新しい Worker で
export const READER_TIMEOUT_MS = 30000;
function deadline({ p, g }, ms) {
  let t = 0;
  return Promise.race([p, new Promise((_, reject) => { t = setTimeout(() => {
    const err = Object.assign(new Error(`reading took longer than ${Math.round(ms / 1000)} s (stopped)`), { code: 'reader-timeout' });
    stopGen(g, err);
    reject(err);
  }, ms); })]).finally(() => clearTimeout(t));
}
export async function readInWorker(bytes, { extract = false, timeout = READER_TIMEOUT_MS } = {}) {
  const buf = new Uint8Array(bytes).slice().buffer;   // 写しを渡す（呼び手のバイト列はそのまま）
  const m = await deadline(call({ bytes: buf, extract }, [buf]), timeout);
  if (!m.ok) throw Object.assign(new Error(m.error.message), { code: m.error.code });
  return {
    index: parseJsonStrict(m.indexText),
    deckMeta: m.deckMetaText ? parseJsonStrict(m.deckMetaText) : null,
    files: unpackFiles(m),
    warnings: m.warnings || [], sourceMatches: !!m.sourceMatches, extractOnly: !!m.extractOnly,
  };
}
// 試験：Worker の大域変数（印のスクリプトが Worker の中でも動いていないこと）
export const probeWorker = async (name) => (await call({ probe: name }).p).value;
