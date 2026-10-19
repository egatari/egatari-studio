// 持ち運べる 1 ファイルから取り出した原稿の作業場所と、その確かめ（Worker もブラウザの API も使わない。Node の単体の試験でも動く）。説明は portable.js
import { parseJsonStrict, manifestFromAudio, excludedReason, folderConfig } from '../kit/core/portable.mjs';
import { audioState } from '../kit/core/audio-core.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { memoryWorkspace, badRel } from './memfs.js';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------- Worker との受け渡し（同じ塊を指すパスは同じバッファを共有する）
// packFiles(files)：{path: Uint8Array} → {buffers: [ArrayBuffer…]（塊ごとに 1 つ）, table: [[path, buffer の番号]…]}。buffers は transfer に渡す
export function packFiles(files) {
  const seen = new Map(), buffers = [], table = [];
  for (const p of Object.keys(files)) {
    const b = files[p];
    let i = seen.get(b);
    if (i === undefined) {
      i = buffers.length; seen.set(b, i);
      buffers.push(b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b.buffer : b.slice().buffer);
    }
    table.push([p, i]);
  }
  return { buffers, table };
}
// unpackFiles({buffers, table}) → Map(path → Uint8Array)。同じ塊のパスは同じ Uint8Array（写さない）
export function unpackFiles({ buffers, table }) {
  const views = buffers.map((b) => new Uint8Array(b));
  return new Map(table.map(([p, i]) => [p, views[i]]));
}

// ---------------------------------------------------------------- 作業場所
export function workspaceFromPortable(name, r) {
  const files = new Map(r.files instanceof Map ? r.files : Object.entries(r.files));   // Worker の結果は Map、readPortable は object
  const audio = r.index.audio;
  if (isObj(audio) && Object.keys(audio).length) files.set('audio/manifest.json', enc.encode(manifestFromAudio(audio)));
  // 設定のファイル：docId（保存しても同じ文書であるように）と、索引の権利の表示（作り直しで消えないように）と添付の一覧（§3.8。展開と同じ。kit/core/portable.mjs の folderConfig）
  const CFG = FORMAT.CONFIG_FILE;
  const text = folderConfig(r.index, files.has(CFG) ? parseJsonStrict(dec.decode(files.get(CFG))) : null);
  if (text !== null) files.set(CFG, enc.encode(text));
  // コメント（Claude への指示）・控えなど、保存するファイルに入らないものは「保存していない変更」にしない
  return memoryWorkspace(name, files, { content: (rel) => rel === 'audio/manifest.json' || !excludedReason(rel) });
}
export function archiveFiles(ws) {
  const out = new Map();
  for (const [rel, bytes] of ws.snapshot()) if (rel === 'audio/manifest.json' || !excludedReason(rel)) out.set(rel, bytes);
  return out;
}
export async function writeToDirectory(dir, files) {
  if (!(await dir.keys().next()).done) throw Object.assign(new Error(`${dir.name} is not empty`), { code: 'not-empty' });
  let n = 0;
  for (const rel of [...files.keys()].sort()) {
    const why = badRel(rel);
    if (why) throw Object.assign(new Error(`refusing to write "${rel}": ${why}`), { code: 'bad-path' });
    const parts = rel.split('/'), name = parts.pop();
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(files.get(rel)); await w.close();
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- 確かめ
export function registryProblems(orig, fresh) {
  const out = [];
  const reg = (list, key) => new Map((Array.isArray(list) ? list : []).filter((c) => isObj(c) && c.source === 'registry').map((c) => [c[key], c]));
  for (const [kind, key] of [['component', 'tag'], ['theme', 'name']]) {
    const mine = reg(fresh[kind + 's'], key);
    for (const [k, c] of reg(orig[kind + 's'], key)) {
      const f = mine.get(k);
      if (!f) out.push(`${kind} ${k} (${c.name} ${c.version}) is not in this editor`);
      else if (f.sha256 !== c.sha256) out.push(`${kind} ${k}: this editor has a different version (the hash of ${c.name} ${c.version} differs)`);
    }
  }
  return out;
}
// 音声が古い段階（§5.4。kit/core/audio-core.mjs の audioState）：inputHash が null か今の口述原稿と違う段階。inputHash の無い記録
// （tts/synth.py の manifest）は TTS の控え（audio/seg_<digest>.json）の声で digest を作り直して比べ、控えがなければ知らせない
export async function staleSteps(ws) {
  const man = await ws.readText('audio/manifest.json', { max: READ_LIMITS.json });
  if (!man) return [];
  let segments;
  try { segments = JSON.parse(man).segments || {}; } catch { return []; }
  if (!isObj(segments)) return [];
  const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
  const segs = new Map(parseNarration(narr || '').map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  const out = [];
  for (const k of Object.keys(segments)) {
    const e = segments[k];
    let sj = null;
    if (isObj(e) && !own(e, 'inputHash') && typeof e.digest === 'string' && /^[0-9a-f]{1,64}$/.test(e.digest)) {
      try { const t = await ws.readText(`audio/seg_${e.digest}.json`, { max: READ_LIMITS.json }); sj = t ? JSON.parse(t) : null; } catch { sj = null; }
    }
    if ((await audioState(e, segs.get(k), sj)) === 'stale') out.push(k);
  }
  return out;
}
