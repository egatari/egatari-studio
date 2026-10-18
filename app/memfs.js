// メモリの上の作業場所（持ち運べる 1 ファイルを開いたとき。フォルダは要らない）。
// フォルダの作業場所（workspace.js の folderWorkspace）と同じ口：list・readBytes・readText・writeText・writeBytes・exists・backup。
// engine.js・devapi.js・main.js はどちらの作業場所でも同じように動く。ブラウザの API を使わない（Node の単体の試験でも動く）
//
// 場所は "/" 区切りの相対パス（先頭に / を付けない）。一覧（list）はフォルダの walk と同じものを外す：
// ドットで始まる名前（.cache の控えなど）と、node_modules・out・audio・video・bundle・__pycache__（audio は {audio: true} のときだけ入れる）
import { backupStamp, isBackupName } from '../kit/core/backup-name.mjs';
import { ReadOverError, maxOf } from '../kit/core/bounded-read-core.mjs';

const SKIP = new Set(['node_modules', 'out', 'audio', 'video', 'bundle', '__pycache__']);
export const KEEP_EDITS = 30;
const enc = new TextEncoder(), dec = new TextDecoder();

// 書き込む場所の確かめ（読み取りでは索引のパスの規則を通った場所だけが入る。ここは編集の口からの書き込みの守り）
export function badRel(rel) {
  if (typeof rel !== 'string' || !rel) return 'empty path';
  if (rel.startsWith('/') || rel.includes('\\') || /^[A-Za-z]:/.test(rel)) return 'not a relative path';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(rel)) return 'control character';
  for (const s of rel.split('/')) if (s === '' || s === '.' || s === '..' || s === '__proto__') return `bad segment "${s}"`;
  return null;
}
const cancelled = () => Object.assign(new Error('cancelled: the workspace changed'), { name: 'Cancelled', code: 'cancelled' });
const notFound = (rel) => Object.assign(new Error('not found: ' + rel), { name: 'NotFoundError', code: 'ENOENT' });

// files：{rel: Uint8Array | 文字列} か Map。opts.now：時刻（試験用）。opts.content(rel)：保存するファイルに入る場所か
// （入らないもの、たとえば comments.json を書いても「保存していない変更」にしない。既定はすべて入る）
export function memoryWorkspace(name, files = {}, opts = {}) {
  const now = opts.now || (() => Date.now());
  const content = opts.content || (() => true);
  const store = new Map();   // rel → {bytes, m}
  let clock = 0, dirty = false, revision = 0;
  // 書くたびに必ず増える「更新時刻」（同じミリ秒に 2 回書いても一覧の署名が変わるように）
  const tick = () => (clock = Math.max(now(), clock + 1));
  // share：初めの中身（持ち運べる 1 ファイルから取り出したもの）は写さずに持つ（同じ塊を指すパスは同じバイト列。読み出しは写しを返す）
  const put = (rel, data, share = false) => {
    const why = badRel(rel);
    if (why) throw Object.assign(new Error(`refusing to write "${rel}": ${why}`), { code: 'bad-path' });
    // ファイルとフォルダが重ならない（a と a/b を同時に持たない）
    for (const k of store.keys()) if (k.startsWith(rel + '/') || rel.startsWith(k + '/')) throw Object.assign(new Error(`refusing to write "${rel}": collides with "${k}"`), { code: 'bad-path' });
    store.set(rel, { bytes: typeof data === 'string' ? enc.encode(data) : share && data instanceof Uint8Array ? data : new Uint8Array(data), m: tick() });
  };
  for (const [rel, data] of files instanceof Map ? files : Object.entries(files)) put(rel, data, true);
  const hidden = (rel, audio) => rel.split('/').some((s) => s.startsWith('.') || (SKIP.has(s) && !(audio && s === 'audio')));

  return {
    kind: 'memory', name,
    get dirty() { return dirty; },
    // 中身の版：保存するファイルに入るものを書くたびに増える。保存は始めたときの版を覚え、markClean(その版) で「保存した」にする。
    // 保存の途中で編集したら版が違うので、dirty のまま（保存したものに入っていない変更を「保存した」にしない）。rev を渡さなければいつでも
    get revision() { return revision; },
    markClean(rev) { if (rev !== undefined && rev !== revision) return false; dirty = false; return true; },
    // {files: Map(rel → {m, s}), dirs: Set(rel)}（フォルダの walk と同じ形）
    async list({ audio = false } = {}) {
      const out = new Map(), dirs = new Set();
      for (const rel of [...store.keys()].sort()) {
        if (hidden(rel, audio)) continue;
        const e = store.get(rel);
        out.set(rel, { m: e.m, s: e.bytes.length });
        const segs = rel.split('/');
        for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
      }
      return { files: out, dirs };
    },
    async readBytes(rel, { max = Infinity } = {}) {
      const e = store.get(rel); if (!e) throw notFound(rel);
      if (e.bytes.length > max) throw new ReadOverError(e.bytes.length, max, rel);
      return e.bytes.slice();
    },
    // opts.max：読んでよいバイト数（既定は READ_LIMITS.default。フォルダの作業場所と同じ）
    async readText(rel, opts = {}) {
      const e = store.get(rel); if (!e) return null;
      const max = maxOf(opts);
      if (e.bytes.length > max) throw new ReadOverError(e.bytes.length, max, rel);
      return dec.decode(e.bytes);
    },
    async writeBytes(rel, bytes, o) { if (o && o.live && !o.live()) throw cancelled(); put(rel, bytes); if (content(rel)) { dirty = true; revision++; } },
    async writeText(rel, text, o) { if (o && o.live && !o.live()) throw cancelled(); put(rel, String(text)); if (content(rel)) { dirty = true; revision++; } },
    async exists(rel) { if (store.has(rel)) return true; for (const k of store.keys()) if (k.startsWith(rel + '/')) return true; return false; },
    // 書き換える前の控え：.cache/edits/<時刻>-<名前>（新しい 30 個だけ。フォルダと同じ）。控えは保存するファイルには入らない
    async backup(rel, opts = {}) {
      const e = store.get(rel);
      if (!e) return;
      if (e.bytes.length > maxOf(opts)) throw new ReadOverError(e.bytes.length, maxOf(opts), rel);
      const stamp = backupStamp(now());
      let key = `.cache/edits/${stamp}-${rel.split('/').pop()}`, n = 2;
      while (store.has(key)) key = `.cache/edits/${stamp}-${n++}-${rel.split('/').pop()}`;
      store.set(key, { bytes: e.bytes.slice(), m: tick() });
      // 消すのは .cache/edits/ のすぐ下の、控えの名前の形のものだけ（kit/core/backup-name.mjs。フォルダと開発サーバーと同じ）
      const edits = [...store.keys()].filter((k) => k.startsWith('.cache/edits/') && isBackupName(k.slice('.cache/edits/'.length))).sort();
      for (const k of edits.slice(0, Math.max(0, edits.length - KEEP_EDITS))) store.delete(k);
    },
    // すべてのファイル（外すものも含む）：Map(rel → Uint8Array の写し)
    snapshot() { return new Map([...store].map(([k, e]) => [k, e.bytes.slice()])); },
  };
}
