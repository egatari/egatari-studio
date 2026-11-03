// 部品庫の写し（vendor/components・vendor/components-2）を、組み立てが読むファイル index.js だけで確かめる（egatari doctor・tools/test-npm-pack.mjs）
//   verifyVendorIndex(root) → {versions, files, problems: [..]}
// npm の包みには部品の README.md・demo.html・CHANGELOG.md を入れない（vendor/.npmignore。リポジトリの写しは全部のまま）。
// components.lock.json の content（フォルダ全体の hash）は写しの場所の名前で、包みの中では中身と合わない。組み立て・dev・check は
// index.js しか読まないので、ここでは版ごとの index.js を、固定（components.lock.json の sha256。改行をそろえた同一性の hash）と、
// manifest のファイルごとの sha256（vendor/components/manifest.json の files、vendor/components-2/manifest-<版>.json の components.<名前>.files）
// の両方で確かめる。manifest 自体も固定の manifestSha256 と比べる。リポジトリの全部の写しの検査（フォルダ全体）は tools/components-update.mjs --check
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readRegular } from './bounded-read.mjs';
import { LOCK_FILE, parseLock, resolveComponent, vendorDir } from './core/components-lock.mjs';
import { LOCK2_FILE } from './core/parts2.mjs';
import { normalizeEol } from './core/identity-hash.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const MAX = 8 << 20;   // index.js 1 本の上限（今いちばん大きいもので 0.9 MB）
const readJson = (f) => { const b = readRegular(f, { max: MAX }); return { bytes: b, json: JSON.parse(b.toString('utf8')) }; };

export function verifyVendorIndex(root) {
  const problems = [];
  let lock;
  try { lock = parseLock(readRegular(path.join(root, LOCK_FILE), { max: MAX }).toString('utf8')); } catch (e) { return { versions: 0, files: 0, problems: [e.message] }; }
  const base = fs.realpathSync(vendorDir(path, root));
  const raw = new Map();   // "名前@版" → index.js の生バイトの sha256（manifest と比べる）
  let versions = 0;
  for (const [name, c] of Object.entries(lock.components)) {
    for (const v of c.versions) {
      versions++;
      const dir = resolveComponent(path, root, lock, name, v);
      const f = dir && path.join(dir, 'index.js');
      const where = `${name}@${v} (vendor/components/${f ? path.relative(base, f).split(path.sep).join('/') : '?'})`;
      let b;
      try {
        if (!f || !fs.realpathSync(f).startsWith(base + path.sep)) { problems.push(`${where}: outside vendor/components`); continue; }
        if (fs.lstatSync(f).isSymbolicLink()) { problems.push(`${where}: a symbolic link`); continue; }
        b = readRegular(f, { max: MAX });
      } catch (e) { problems.push(`${where}: ${e.code === 'ENOENT' ? 'index.js is missing' : e.message}`); continue; }
      if (sha(normalizeEol(b)) !== c.sha256[v]) problems.push(`${where}: index.js does not match ${LOCK_FILE} sha256`);
      raw.set(`${name}@${v}`, sha(b));
    }
  }
  // manifest のファイルごとの sha256（index.js）
  let files = 0;
  const against = (label, mBytes, pinned, entries) => {
    if (pinned && sha(mBytes) !== pinned) { problems.push(`${label} does not match its manifestSha256`); return; }
    for (const [name, version, h] of entries) {
      if (typeof h !== 'string') continue;
      const got = raw.get(`${name}@${version}`);
      if (got === undefined) continue;   // 固定にない（上で数えた）
      files++;
      if (got !== h) problems.push(`${name}@${version}: index.js does not match ${label}`);
    }
  };
  const m1 = path.join(root, 'vendor', 'components', 'manifest.json');
  if (fs.existsSync(m1)) {
    try {
      const { bytes, json } = readJson(m1);
      const fl = json.files || {};
      against('vendor/components/manifest.json', bytes, lock.manifestSha256,
        Object.keys(json.components || {}).map((n) => [n, json.version, fl[`${n}/index.js`]]));
    } catch (e) { problems.push(`vendor/components/manifest.json: ${e.message}`); }
  }
  const l2 = path.join(root, LOCK2_FILE);
  if (fs.existsSync(l2)) {
    try {
      const lock2 = readJson(l2).json;
      for (const [cv, cat] of Object.entries(lock2.catalogues || {})) {
        const mf = path.join(root, 'vendor', 'components-2', `manifest-${cv}.json`);
        if (!fs.existsSync(mf)) { problems.push(`vendor/components-2/manifest-${cv}.json is missing`); continue; }
        const { bytes, json } = readJson(mf);
        against(`vendor/components-2/manifest-${cv}.json`, bytes, cat.manifestSha256,
          Object.entries(json.components || {}).map(([n, p]) => [n, p.version, p.files && p.files['index.js']]));
      }
    } catch (e) { problems.push(`${LOCK2_FILE}: ${e.message}`); }
  }
  return { versions, files, problems };
}
