// 書き換える前の控えの名前（.cache/edits/<時刻>-<名前>）。開発サーバー・npm run の書き込み（kit/safe-fs.mjs）と
// 編集アプリ（app/fsx.js・app/memfs.js）が同じものを使う。控えの掃除は、この形の名前のファイルだけを消す（ほかのものには触れない）
//   backupStamp(ms)    時刻：new Date(ms).toISOString() の : と . を - にしたもの
//   BACKUP_RE          控えの名前：<時刻>-<元の名前>（同じ時刻の控えは <時刻>-<番号>-<元の名前>）
//   isBackupName(name)
export const BACKUP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[^/\\]+$/;
export const backupStamp = (ms = Date.now()) => new Date(ms).toISOString().replace(/[:.]/g, '-');
export const isBackupName = (name) => typeof name === 'string' && BACKUP_RE.test(name);
