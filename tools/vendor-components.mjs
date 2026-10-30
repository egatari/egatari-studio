// 部品庫の部品の写し（vendor/components/sha256/<hash>/）のうち、components.lock.json の既定の版のフォルダの一覧（Node の道具と試験が使う）
//   vendorComponents(root?) → [{name, version, dir}]（名前の順）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, VENDOR_COMPONENTS, parseLock, resolveComponent } from '../kit/core/components-lock.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const vendorBase = (root = ROOT) => path.join(root, ...VENDOR_COMPONENTS);
export function vendorComponents(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  return Object.keys(lock.components).sort().map((name) => {
    const version = lock.components[name].default;
    return { name, version, dir: resolveComponent(path, root, lock, name, version) };
  });
}

// 編集アプリに入れるもの：[アプリの中の場所 /repo/…, ファイル] の配列。固定のファイルと、取り込んだすべての版の index.js
// （古い版で組んだ教材を、アプリでもその版で組み直せるように。README・見本は入れない）
export function appComponentFiles(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  const out = [[`/repo/${LOCK_FILE}`, path.join(root, LOCK_FILE)]];
  for (const name of Object.keys(lock.components).sort()) {
    for (const v of lock.components[name].versions) {
      const dir = resolveComponent(path, root, lock, name, v);
      out.push([`/repo/${path.relative(root, dir).split(path.sep).join('/')}/index.js`, path.join(dir, 'index.js')]);
    }
  }
  return [...new Map(out).entries()];
}

// 部品の使用条件のファイル（MIT のほかの条件を持つ部品のフォルダにある LICENSE*・LICENCE*・OFL*・COPYING*・NOTICE* と、変えた所の記録 *CHANGES.md）：
// [アプリの中の場所 /repo/…, ファイル] の配列（取り込んだすべての版）。編集アプリの組み立て（tools/build-app.mjs）が vendor/components/sha256/<hash>/ に写す
export const LICENSE_FILE = /^(?:LICEN[CS]E|OFL|COPYING|NOTICE)[^/]*$|CHANGES\.md$/i;
export function componentLicenseFiles(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  const out = [];
  for (const name of Object.keys(lock.components).sort()) {
    for (const v of lock.components[name].versions) {
      const dir = resolveComponent(path, root, lock, name, v);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).sort()) if (LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile()) out.push([`/repo/${path.relative(root, dir).split(path.sep).join('/')}/${f}`, path.join(dir, f)]);
    }
  }
  return [...new Map(out).entries()];
}
