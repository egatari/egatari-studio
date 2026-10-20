// 部品庫の部品（egatari/components のリリース）の写しと、その版の固定（components.lock.json）
//   写し：vendor/components/<名前>/<版>/{index.js, README.md, demo.html …}（取り込んだ版はすべて残す。古い版で組んだ教材を組み直すため）
//   固定：components.lock.json（npm run components:update -- vX.Y.Z が書く。手で直さない）
//     { "source": "https://github.com/egatari/components", "tag": "v1.0.0", "tarballSha256": "…",
//       "releases": { "v1.0.0": { "tarballSha256": "…" } },
//       "components": { "<名前>": { "default": "1.0.0", "versions": ["1.0.0"], "sha256": { "1.0.0": "<index.js の sha256>" } } } }
// 組み立て（build-core）・持ち運べる 1 ファイル（portable）・編集アプリが共有する。node: の読み込み・fs・process を使わない（読み書きは env を通す）。
// 文書が記録した部品（format spec §6：{name, version, sha256}。sha256 は index.js だけ）は、sha256 の合う版に結ぶ（versionForSha）。
export const LOCK_FILE = 'components.lock.json';
export const VENDOR_COMPONENTS = ['vendor', 'components'];
// 部品の名前（format spec §6 の registry の名前）と版（パスの 1 つの部分になるので、字を限る）
export const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
export const VERSION_RE = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9a-z][0-9a-z.-]{0,31})?$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// 固定のファイルの中身を確かめる。返すもの：問題の配列（空なら正しい）
export function lockProblems(lock) {
  const e = [];
  if (!isObj(lock)) return ['not an object'];
  if (!isObj(lock.components)) return ['components: not an object'];
  for (const [name, c] of Object.entries(lock.components)) {
    const w = `components.${name}`;
    if (!NAME_RE.test(name)) e.push(`${w}: not a registry name`);
    if (!isObj(c)) { e.push(`${w}: not an object`); continue; }
    if (!Array.isArray(c.versions) || !c.versions.length) { e.push(`${w}.versions: not a non-empty array`); continue; }
    for (const v of c.versions) if (typeof v !== 'string' || !VERSION_RE.test(v)) e.push(`${w}.versions: "${v}" is not a version`);
    if (new Set(c.versions).size !== c.versions.length) e.push(`${w}.versions: duplicates`);
    if (!c.versions.includes(c.default)) e.push(`${w}.default: "${c.default}" is not in versions`);
    if (!isObj(c.sha256)) { e.push(`${w}.sha256: not an object`); continue; }
    for (const v of c.versions) if (!(own(c.sha256, v) && SHA_RE.test(c.sha256[v]))) e.push(`${w}.sha256.${v}: not a sha256`);
    for (const v of Object.keys(c.sha256)) if (!c.versions.includes(v)) e.push(`${w}.sha256.${v}: not in versions`);
  }
  return e;
}

export function parseLock(text) {
  let lock;
  try { lock = JSON.parse(text); } catch (err) { throw new Error(`${LOCK_FILE}: ${err.message}`); }
  const e = lockProblems(lock);
  if (e.length) throw new Error(`${LOCK_FILE}: ${e.join('; ')}`);
  return lock;
}

// env（build-core の env）から読む。なければ null（部品庫の部品は使えない）
export function readLock(env, root) {
  const f = env.path.join(root, LOCK_FILE);
  if (!env.exists(f)) return null;
  return parseLock(env.readText(f));
}

// 部品の写しのフォルダ（<root>/vendor/components）
export const vendorDir = (P, root) => P.join(root, ...VENDOR_COMPONENTS);

// 使う版を決める：want（固定。opts.componentVersions や作業フォルダの設定のファイルの components）が手元にあればそれ、なければ既定の版。
// 返すもの：{version, note}（note は知らせ。固定した版が手元にないときなど）。部品が固定のファイルにないときは version: null
export function pickVersion(lock, name, want) {
  const c = lock && isObj(lock.components) && own(lock.components, name) ? lock.components[name] : null;
  if (!c) return { version: null, note: null };
  if (want === undefined || want === null) return { version: c.default, note: null };
  if (typeof want === 'string' && c.versions.includes(want)) return { version: want, note: null };
  return { version: c.default, note: `component m-${name}: version "${String(want).slice(0, 40)}" is not in ${LOCK_FILE}; using ${c.default}` };
}

// 文書が記録した index.js の sha256 に合う版（なければ null）。同じ中身の版が複数あれば、既定の版、次に新しく取り込んだ版
export function versionForSha(lock, name, sha) {
  const c = lock && isObj(lock.components) && own(lock.components, name) ? lock.components[name] : null;
  if (!c || typeof sha !== 'string') return null;
  if (c.sha256[c.default] === sha) return c.default;
  for (const v of [...c.versions].reverse()) if (c.sha256[v] === sha) return v;
  return null;
}

// 文書の索引の部品（index.components）から、組み直しで使う版の固定を作る：{名前: 版}。既定の版と同じものも入れる。
// 合う版がない部品は missing に（段 B・C の編集はできない。format spec §6）
export function pinsForIndex(lock, components) {
  const pins = {}, missing = [];
  for (const c of Array.isArray(components) ? components : []) {
    if (!isObj(c) || c.source !== 'registry' || typeof c.name !== 'string' || !NAME_RE.test(c.name)) continue;
    const v = versionForSha(lock, c.name, c.sha256);
    if (v) pins[c.name] = v; else missing.push(c);
  }
  return { pins, missing };
}

// 作業フォルダの設定のファイル（FORMAT.CONFIG_FILE）の components：{名前: 版}。形が違うものは捨てる
export function configPins(conf) {
  if (!isObj(conf) || !isObj(conf.components)) return {};
  const out = {};
  for (const [k, v] of Object.entries(conf.components)) if (NAME_RE.test(k) && typeof v === 'string' && VERSION_RE.test(v)) out[k] = v;
  return out;
}
