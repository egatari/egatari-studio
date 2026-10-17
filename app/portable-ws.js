// 持ち運べる 1 ファイルから取り出した原稿の作業場所と、その確かめ（Worker もブラウザの API も使わない。Node の単体の試験でも動く）。説明は portable.js
import { parseJsonStrict, manifestFromAudio, excludedReason, isStale } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { memoryWorkspace, badRel } from './memfs.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------- 作業場所
const RIGHTS = ['license', 'copyright', 'attribution', 'creators'];
export function workspaceFromPortable(name, r) {
  const files = new Map(r.files instanceof Map ? r.files : Object.entries(r.files));   // Worker の結果は Map、readPortable は object
  const audio = r.index.audio;
  if (isObj(audio) && Object.keys(audio).length) files.set('audio/manifest.json', enc.encode(manifestFromAudio(audio)));
  // 設定のファイル：docId（保存しても同じ文書であるように）と、索引の権利の表示（作り直しで消えないように）
  const CFG = FORMAT.CONFIG_FILE, meta = isObj(r.index.metadata) ? r.index.metadata : {};
  let cfg = files.has(CFG) ? parseJsonStrict(dec.decode(files.get(CFG))) : null, changed = false;
  if (!isObj(cfg)) { cfg = { docId: r.index.docId, metadata: { ...meta } }; changed = true; }
  else {
    const cm = isObj(cfg.metadata) ? { ...cfg.metadata } : {};
    for (const k of RIGHTS) if (own(meta, k) && !own(cm, k)) { cm[k] = meta[k]; changed = true; }
    if (changed) cfg = { ...cfg, metadata: cm };
  }
  if (changed) files.set(CFG, enc.encode(JSON.stringify(cfg, null, 2) + '\n'));
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
export async function staleSteps(ws) {
  const man = await ws.readText('audio/manifest.json');
  if (!man) return [];
  let segments;
  try { segments = JSON.parse(man).segments || {}; } catch { return []; }
  const narr = await ws.readText('narration.md');
  const segs = new Map(parseNarration(narr || '').map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  const out = [];
  for (const k of Object.keys(segments)) if (await isStale(segments[k], segs.get(k))) out.push(k);
  return out;
}
