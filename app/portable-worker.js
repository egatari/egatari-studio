// 持ち運べる 1 ファイルの読み取り（Web Worker の中。tools/build-app.mjs が 1 本にまとめて main.js に文字列で入れる）。
// 開いたファイルはバイト列として受け取り、kit/core/portable.mjs の readPortable（parse5、スクリプトは無効）で検査して取り出すだけで、
// 何も実行しない（Worker には DOM もない）。結果は {indexText, files: [[path, ArrayBuffer]…], …} で返す（索引は JSON の文字列。
// 親で原型のない object に読み直す）。{probe: 名前} にはその大域変数の値を返す（試験：印のスクリプトが Worker でも動かないこと）
import { readPortable } from '../kit/core/portable.mjs';

self.onmessage = async (e) => {
  const m = e.data || {};
  if (typeof m.probe === 'string') { self.postMessage({ id: m.id, ok: true, value: self[m.probe] === undefined ? null : String(self[m.probe]) }); return; }
  try {
    const r = await readPortable(new Uint8Array(m.bytes), { extract: !!m.extract });
    const files = [], transfer = [];
    // 同じ塊を 2 つのパスが使うこともあるので、パスごとに写してから渡す
    for (const p of Object.keys(r.files)) { const b = r.files[p].slice(); files.push([p, b.buffer]); transfer.push(b.buffer); }
    self.postMessage({ id: m.id, ok: true, indexText: JSON.stringify(r.index), deckMetaText: r.deckMeta ? JSON.stringify(r.deckMeta) : null,
      files, warnings: r.warnings, sourceMatches: r.sourceMatches, extractOnly: !!r.extractOnly }, transfer);
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err) } });
  }
};
