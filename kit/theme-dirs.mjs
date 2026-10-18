// 利用者のテーマのフォルダ（Node だけ。編集アプリは読めない）
//   EGATARI_THEMES  パスの並び（区切りは OS のもの：macOS・Linux は「:」、Windows は「;」）
//   ~/.egatari/themes  あれば、その後に
// テーマを探す順は 原稿のフォルダ → その themes/ → ここ → 同梱の themes/（kit/core/build-core.mjs の resolveTheme）。
// どれも呼び出した人が選んだ場所なので、それぞれの実体のパス（realpath）を 1 回だけ求めて根にする。シンボリックリンクのフォルダ
// （~/.egatari/themes → 別の場所）もよい。根の中の決まり（リンクや extends でその根と同梱の themes/ の外に出ない）は今までどおり
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 返すもの：実体のパスの配列（重複なし）。missing：EGATARI_THEMES にあるが、フォルダとして見つからないもの（組み立てが知らせる）
export function userThemeDirs(env = process.env, home = os.homedir()) {
  const out = [], missing = [];
  const add = (p, fromEnv) => {
    let rp = null;
    try { rp = fs.realpathSync(path.resolve(p)); if (!fs.statSync(rp).isDirectory()) rp = null; } catch { rp = null; }
    if (!rp) { if (fromEnv) missing.push(p); return; }
    if (!out.includes(rp)) out.push(rp);
  };
  for (const p of String(env.EGATARI_THEMES || '').split(path.delimiter)) if (p.trim()) add(p.trim(), true);
  if (home) add(path.join(home, '.egatari', 'themes'), false);
  out.missing = missing;
  return out;
}
