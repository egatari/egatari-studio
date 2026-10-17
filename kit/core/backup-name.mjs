// 控え（.cache/edits/<時刻>-<名前>）の名前の形。開発サーバー（kit/safe-fs.mjs）と編集アプリ（app/fsx.js）が同じものを使う（Node に依存しない）
// 控えの掃除は、この形の名前の普通のファイルだけを古いものから消す（利用者やデッキが置いたほかのファイルには触れない）
// 名前：new Date().toISOString() の : と . を - にしたもの + '-' + 元の名前
export const BACKUP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[^/\\]+$/;
export const backupStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
export const isBackupName = (name) => BACKUP_RE.test(String(name));
