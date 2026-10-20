// 部品庫の部品の写し（vendor/components/<名前>/<版>/）のうち、components.lock.json の既定の版のフォルダの一覧（Node の道具と試験が使う）
//   vendorComponents(root?) → [{name, version, dir}]（名前の順）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, VENDOR_COMPONENTS, parseLock } from '../kit/core/components-lock.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const vendorBase = (root = ROOT) => path.join(root, ...VENDOR_COMPONENTS);
export function vendorComponents(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  return Object.keys(lock.components).sort().map((name) => {
    const version = lock.components[name].default;
    return { name, version, dir: path.join(vendorBase(root), name, version) };
  });
}

// 編集アプリに入れるもの：[アプリの中の場所 /repo/…, ファイル] の配列。固定のファイルと、取り込んだすべての版の index.js
// （古い版で組んだ教材を、アプリでもその版で組み直せるように。README・見本は入れない）
export function appComponentFiles(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  const out = [[`/repo/${LOCK_FILE}`, path.join(root, LOCK_FILE)]];
  for (const name of Object.keys(lock.components).sort()) {
    for (const v of lock.components[name].versions) out.push([`/repo/${VENDOR_COMPONENTS.join('/')}/${name}/${v}/index.js`, path.join(vendorBase(root), name, v, 'index.js')]);
  }
  return out;
}
