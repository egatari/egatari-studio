// 部品庫の部品の写し（vendor/components/sha256/<hash>/）のうち、components.lock.json の既定の版のフォルダの一覧（Node の道具と試験が使う）
//   vendorComponents(root?) → [{name, version, dir}]（名前の順）
//   vendorComponents2(root?) → {catalogue, parts: [{name, version, dir}]}（2.x 専用の要素パーツ。名前の順。下の注記）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, VENDOR_COMPONENTS, parseLock, resolveComponent, resolveCatalogueContent } from '../kit/core/components-lock.mjs';

// components2.lock.json の名前（kit/core/parts2.mjs の LOCK2_FILE と同じ値）。parts2.mjs 自体は import しない：
// parts2.mjs は parse5 に依存し、この道具（tools/vendor-components.mjs）は tools/make-llm-guide.mjs から
// 使われる（kit/llm-pack.mjs が組む AI への指示の材料）。tools/test-llm.mjs は node_modules なしで tools・kit を
// 書き出して動かすので、ここから parse5 の import 連鎖を引き込むと落ちる。固定のファイルの形の確かめ
// （lock2Problems）が要るときは、呼ぶ側で kit/core/parts2.mjs の parseLock2 を使う：ここでは素の JSON として読む
const LOCK2_FILE = 'components2.lock.json';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const vendorBase = (root = ROOT) => path.join(root, ...VENDOR_COMPONENTS);
export function vendorComponents(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  return Object.keys(lock.components).filter((n) => lock.components[n].catalogue !== '2').sort().map((name) => {
    const version = lock.components[name].default;
    return { name, version, dir: resolveComponent(path, root, lock, name, version) };
  });
}

// components2.lock.json の既定のカタログのうち、1.x の目録（vendorComponents）に出ない要素パーツ：
// components.lock.json でその部品が catalogue: "2"（1.x の目録から外れている）、かつ components2.lock.json の
// その版が kind: "element"（kind: "library" の土台パーツ（base・expr・markup-reader・plot・shape・icons …）は含めない）。
// 写しの場所はそのカタログの写し（components2.lock.json の catalogues.<版>.content。README・demo がそのリリースのバイト）。
// content のない古い固定なら components.lock.json の content 表（版の写し）に戻る（resolveCatalogueContent）。
// 返すもの：{catalogue, parts: [{name, version, dir}]}（名前の順）
export function vendorComponents2(root = ROOT) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  const lock2 = JSON.parse(fs.readFileSync(path.join(root, LOCK2_FILE), 'utf8'));
  const catalogue = lock2.default;
  const cat = lock2.catalogues[catalogue];
  const parts = Object.keys(cat.parts).filter((name) => {
    const c = lock.components[name];
    if (!c || c.catalogue !== '2') return false;
    const version = cat.parts[name];
    const part = lock2.parts[name] && lock2.parts[name][version];
    return !!part && part.kind === 'element';
  }).sort().map((name) => {
    const version = cat.parts[name];
    return { name, version, dir: resolveCatalogueContent(path, root, lock, lock2, catalogue, name, version) };
  });
  return { catalogue, parts };
}

// components2.lock.json の既定のカタログの、名前で指定した土台パーツ（kind: "library"）の写しの場所。
// 1.x の目録にない（components.lock.json で catalogue: "2"）ものだけ返す。ないか kind が違えば null
// （例：icons の README への 1 行の言及に使う。CATALOG.md の表には土台パーツを出さない）
export function vendorLibrary2(root = ROOT, name) {
  const lock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'));
  const lock2 = JSON.parse(fs.readFileSync(path.join(root, LOCK2_FILE), 'utf8'));
  const cat = lock2.catalogues[lock2.default];
  const version = cat.parts[name];
  if (!version) return null;
  const part = lock2.parts[name] && lock2.parts[name][version];
  const c = lock.components[name];
  if (!part || part.kind !== 'library' || !c || c.catalogue !== '2') return null;
  return { name, version, dir: resolveCatalogueContent(path, root, lock, lock2, lock2.default, name, version) };
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
