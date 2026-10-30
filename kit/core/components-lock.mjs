// 部品庫の部品（egatari/components のリリース）の写しと、その版の固定（components.lock.json）
//   写し：vendor/components/sha256/<hash>/{index.js, README.md, demo.html …}（版ごとの content 表で引く）
//   固定：components.lock.json（npm run components:update -- vX.Y.Z が書く。手で直さない）
//     { "source": "https://github.com/egatari/components", "tag": "v1.0.0", "tarballSha256": "…",
//       "releases": { "v1.0.0": { "tarballSha256": "…" } },
//       "yanked": { "1.0.0": { "replacement": "1.0.2", "reason": "…", "date": "2026-10-20" } },
//       "components": { "<名前>": { "default": "1.0.0", "versions": ["1.0.0"], "sha256": { "1.0.0": "<index.js の同一性の sha256>" },
//                                   "crlfSha256": { "1.0.0": "<改行を CRLF にした index.js の sha256>" },
//                                   "content": { "1.0.0": "<フォルダ全体の sha256>" } } } }
//     yanked は部品庫が取り下げた版（format spec §6：版は手に入るまま、manifest.json の yanked が取り下げと置き換え先の版を示す）。取り込むたびに manifest の
//     yanked を足す（消さない）。編集アプリは、取り下げた版を記録した教材に組み直しを勧めるが、黙って置き換えない
//     sha256 は改行をそろえた同一性の hash（format spec §6、kit/core/identity-hash.mjs）。crlfSha256 は、改行をそろえる前に Windows の checkout で
//     書き出した文書（CRLF のまま hash した）を同じ版に結ぶためだけに使う
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

// catalogue: "2" の項目は 2.0 だけのパーツ（1.x の目録には出さず、1.x リリース単位の yanked も当てない）。
// 固定のファイルの中身を確かめる。返すもの：問題の配列（空なら正しい）
export function lockProblems(lock) {
  const e = [];
  if (!isObj(lock)) return ['not an object'];
  if (!isObj(lock.components)) return ['components: not an object'];
  if (own(lock, 'yanked')) e.push(...yankedProblems(lock.yanked));
  if (isObj(lock.yanked)) for (const [name, c] of Object.entries(lock.components)) if (isObj(c) && c.catalogue !== '2' && typeof c.default === 'string' && own(lock.yanked, c.default)) e.push(`components.${name}.default: "${c.default}" is yanked`);
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
    if (own(c, 'crlfSha256')) {
      if (!isObj(c.crlfSha256)) e.push(`${w}.crlfSha256: not an object`);
      else for (const [v, h] of Object.entries(c.crlfSha256)) if (!c.versions.includes(v) || !SHA_RE.test(h)) e.push(`${w}.crlfSha256.${v}: not a version with a sha256`);
    }
    if (own(c, 'content')) {
      if (!isObj(c.content)) e.push(`${w}.content: not an object`);
      else {
        for (const v of c.versions) if (!own(c.content, v) || typeof c.content[v] !== 'string' || !SHA_RE.test(c.content[v])) e.push(`${w}.content.${v}: not a sha256`);
        for (const v of Object.keys(c.content)) if (!c.versions.includes(v)) e.push(`${w}.content.${v}: not in versions`);
      }
    }
  }
  return e;
}

// yanked（{版: {replacement, reason, date}}）の形：置き換え先は、より新しい、取り下げていない版
export function yankedProblems(y) {
  if (!isObj(y)) return ['yanked: not an object'];
  const e = [];
  for (const [v, x] of Object.entries(y)) {
    const w = `yanked.${v}`;
    if (!VERSION_RE.test(v) || v.includes('-')) { e.push(`${w}: not a version`); continue; }
    if (!isObj(x)) { e.push(`${w}: not an object`); continue; }
    if (typeof x.replacement !== 'string' || !VERSION_RE.test(x.replacement) || x.replacement.includes('-') || cmpPlain(x.replacement, v) <= 0) e.push(`${w}.replacement: not a later version`);
    else if (own(y, x.replacement)) e.push(`${w}.replacement: "${x.replacement}" is itself yanked`);
    if (typeof x.reason !== 'string' || !x.reason || x.reason.length > 500) e.push(`${w}.reason: not a short text`);
    if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) e.push(`${w}.date: not YYYY-MM-DD`);
  }
  return e;
}
const cmpPlain = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

// その版が取り下げられていれば {replacement, reason, date}、なければ null
export function yankedInfo(lock, version) {
  return lock && isObj(lock.yanked) && own(lock.yanked, version) && isObj(lock.yanked[version]) ? lock.yanked[version] : null;
}

// 取り下げた版（版を記録した教材が使うもの）に、置き換えの版で組み直したときの変わり方：部品ごとに {name, from, to, sha256Changes}
// （sha256Changes：index.js の同一性の hash が変わるか。同じなら、組み直しても部品のコードは同じ）
export function replacementPlan(lock, used) {
  const out = [];
  for (const u of used) {
    const y = yankedInfo(lock, u.version);
    const c = lock && isObj(lock.components) && own(lock.components, u.name) ? lock.components[u.name] : null;
    if (!y || !c) continue;
    const to = c.versions.includes(y.replacement) ? y.replacement : null;
    out.push({ name: u.name, from: u.version, to, reason: y.reason, date: y.date, sha256Changes: to ? c.sha256[u.version] !== c.sha256[to] : null });
  }
  return out;
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

// 唯一の写しの場所の解決口。content はフォルダ全体のバイトの hash（index.js の同一性の hash とは別）。
// content のない古い固定も読めるので、移行前の写し・道具の試験でも同じ口を使う。
export function resolveComponent(P, root, lock, name, version) {
  if (!NAME_RE.test(name) || !VERSION_RE.test(version) || !lock || !isObj(lock.components) || !own(lock.components, name)) return null;
  const c = lock.components[name];
  if (!c.versions.includes(version)) return null;
  if (own(c, 'content')) {
    const hash = c.content && c.content[version];
    return typeof hash === 'string' && SHA_RE.test(hash) ? P.join(vendorDir(P, root), 'sha256', hash) : null;
  }
  return P.join(vendorDir(P, root), name, version);
}

// 使う版を決める：want（固定。opts.componentVersions や作業フォルダの設定のファイルの components）が手元にあればそれ、なければ既定の版。
// 返すもの：{version, note}（note は知らせ。固定した版が手元にないときなど）。部品が固定のファイルにないときは version: null
export function pickVersion(lock, name, want) {
  const c = lock && isObj(lock.components) && own(lock.components, name) ? lock.components[name] : null;
  if (!c) return { version: null, note: null };
  if (want === undefined || want === null) return { version: c.default, note: null };
  if (typeof want === 'string' && c.versions.includes(want)) return { version: want, note: null };
  return { version: c.default, note: `component m-${name}: version "${String(want).slice(0, 40)}" is not in ${LOCK_FILE}; using ${c.default}` };
}

// 文書が記録した index.js の sha256 に合う版（なければ null）。同じ中身の版が複数あれば、既定の版、次に新しく取り込んだ版。
// 同一性の hash（sha256）に合わなければ、改行をそろえる前に CRLF のまま hash した記録（crlfSha256）とも比べる
// prefer：文書が記録した版。手元にあって hash が合えば、それを選ぶ（同じ中身の新しい版に黙って移らない。format spec §3.3）
export function versionForSha(lock, name, sha, prefer) {
  const c = lock && isObj(lock.components) && own(lock.components, name) ? lock.components[name] : null;
  if (!c || typeof sha !== 'string') return null;
  for (const key of ['sha256', 'crlfSha256']) {
    const m = isObj(c[key]) ? c[key] : {};
    if (typeof prefer === 'string' && c.versions.includes(prefer) && m[prefer] === sha) return prefer;
    if (m[c.default] === sha) return c.default;
    for (const v of [...c.versions].reverse()) if (m[v] === sha) return v;
  }
  return null;
}

// 文書の索引の部品（index.components）から、組み直しで使う版の固定を作る：{名前: 版}。既定の版と同じものも入れる。
// 合う版がない部品は missing に（段 B・C の編集はできない。format spec §6）
export function pinsForIndex(lock, components) {
  const pins = {}, missing = [];
  for (const c of Array.isArray(components) ? components : []) {
    if (!isObj(c) || c.source !== 'registry' || typeof c.name !== 'string' || !NAME_RE.test(c.name)) continue;
    const v = versionForSha(lock, c.name, c.sha256, c.version);
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
