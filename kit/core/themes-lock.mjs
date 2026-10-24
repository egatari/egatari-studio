// 同梱のテーマ（themes/<名前>/）の版と、前の版の写し（vendor/themes/<名前>/<版>/）の固定（themes.lock.json）
//   部品庫の部品の固定（components.lock.json・kit/core/components-lock.mjs）と同じ考え方：前の版で組んだ教材を、黙って新しい見た目にしない。
//   今の版：themes/<名前>/（theme.json の version）　　前の版：vendor/themes/<名前>/<版>/（その版のテーマのファイルをバイトのまま。直さない）
//   固定：themes.lock.json（手で書く。npm run themes:check が写しと hash を確かめる）
//     { "themes": { "<名前>": { "current": "1.1.0", "versions": ["1.0.0", "1.1.0"],
//                                "sha256": { "1.0.0": "<テーマの同一性の sha256>", "1.1.0": "…" },
//                                "changes": { "1.1.0": { "date": "2026-10-24", "reason": "…",
//                                                         "tokens": [{ "token": "--emph", "from": "#C50516", "to": "#BE3012" }] } } } } }
//     sha256 は、書き出し（kit/core/portable.mjs）が index.themes に書くものと同じ：テーマのファイルごとの「<相対パス>\t<sha256>\n」を
//     パスの順に並べたものの sha256（format spec §6。字のファイルは改行をそろえる。kit/core/identity-hash.mjs）。
//     changes.<版> は、その版で変わった色（ふつうの画面で描かれる色。from は 1 つ前の版）。編集アプリの「テーマを更新」の知らせに出す
// 文書が記録したテーマ（index.themes の {name, version, sha256}）は sha256 の合う版に結ぶ（themeVersionForSha）。
// 作業フォルダは設定のファイル（FORMAT.CONFIG_FILE）の themes（{名前: 版}）で固定する（展開が書く。部品の components と同じ）。
// 組み立て（build-core）・持ち運べる 1 ファイル（portable）・編集アプリが共有する。node: の読み込み・fs・process を使わない（読み書きは env を通す）
import { NAME_RE, VERSION_RE } from './components-lock.mjs';

export const THEMES_LOCK_FILE = 'themes.lock.json';
// テーマのフォルダの最上位の文書（README*・LICENSE*・*.md）：テーマの一部でない（format spec §6：テーマの sha256 は組み立てが読むファイル＝
// スタイルシート・宣言のファイル・参照する資源だけ）。rel はテーマのフォルダからの相対パス。2 つの決まりを分ける：
//   excludedFromThemeHash：hash に入れない・組み立てで読まない（ロゴに書いても）。README*・LICENSE*・*.md
//   excludedFromThemeCopy：利用者のテーマを 1 ファイルに入れるとき写さない。README* と *.md だけ。LICENSE* は写す
//     （書体・機関のロゴの使用条件は、資源を配り直す先に付いていく。§3.3 の閉包）
const topLevel = (rel) => { const r = String(rel).replace(/\\/g, '/').replace(/^\.\//, ''); return r.includes('/') ? null : r; };
export const isThemeLicense = (rel) => { const r = topLevel(rel); return r !== null && /^licen[cs]e/i.test(r); };
export function excludedFromThemeHash(rel) {
  const r = topLevel(rel);
  return r !== null && (/^(?:readme|licen[cs]e)/i.test(r) || /\.md$/i.test(r));
}
export function excludedFromThemeCopy(rel) {
  const r = topLevel(rel);
  return r !== null && !isThemeLicense(r) && (/^readme/i.test(r) || /\.md$/i.test(r));
}
export const VENDOR_THEMES = ['vendor', 'themes'];
const SHA_RE = /^[0-9a-f]{64}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmpVer = (a, b) => { const x = a.split(/[.-]/).map(Number), y = b.split(/[.-]/).map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

// 固定のファイルの中身を確かめる。返すもの：問題の配列（空なら正しい）
export function themesLockProblems(lock) {
  if (!isObj(lock)) return ['not an object'];
  if (!isObj(lock.themes)) return ['themes: not an object'];
  const e = [];
  for (const [name, t] of Object.entries(lock.themes)) {
    const w = `themes.${name}`;
    if (!NAME_RE.test(name)) e.push(`${w}: not a registry name`);
    if (!isObj(t)) { e.push(`${w}: not an object`); continue; }
    if (!Array.isArray(t.versions) || !t.versions.length) { e.push(`${w}.versions: not a non-empty array`); continue; }
    for (const v of t.versions) if (typeof v !== 'string' || !VERSION_RE.test(v)) e.push(`${w}.versions: "${v}" is not a version`);
    if (new Set(t.versions).size !== t.versions.length) e.push(`${w}.versions: duplicates`);
    if (!t.versions.includes(t.current)) e.push(`${w}.current: "${t.current}" is not in versions`);
    else if (t.versions.some((v) => VERSION_RE.test(v) && cmpVer(v, t.current) > 0)) e.push(`${w}.current: "${t.current}" is not the latest version`);
    if (!isObj(t.sha256)) { e.push(`${w}.sha256: not an object`); continue; }
    for (const v of t.versions) if (!(own(t.sha256, v) && SHA_RE.test(t.sha256[v]))) e.push(`${w}.sha256.${v}: not a sha256`);
    for (const v of Object.keys(t.sha256)) if (!t.versions.includes(v)) e.push(`${w}.sha256.${v}: not in versions`);
    if (own(t, 'changes')) {
      if (!isObj(t.changes)) { e.push(`${w}.changes: not an object`); continue; }
      for (const [v, c] of Object.entries(t.changes)) {
        const cw = `${w}.changes.${v}`;
        if (!t.versions.includes(v)) e.push(`${cw}: not in versions`);
        if (!isObj(c)) { e.push(`${cw}: not an object`); continue; }
        if (typeof c.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) e.push(`${cw}.date: not YYYY-MM-DD`);
        if (typeof c.reason !== 'string' || !c.reason || c.reason.length > 500) e.push(`${cw}.reason: not a short text`);
        if (!Array.isArray(c.tokens)) { e.push(`${cw}.tokens: not an array`); continue; }
        c.tokens.forEach((x, i) => {
          if (!isObj(x) || typeof x.token !== 'string' || !/^--[a-z0-9-]{1,64}$/.test(x.token) || !COLOR_RE.test(String(x.from)) || !COLOR_RE.test(String(x.to))) e.push(`${cw}.tokens[${i}]: not {token: "--name", from: "#RRGGBB", to: "#RRGGBB"}`);
        });
      }
    }
  }
  return e;
}

export function parseThemesLock(text) {
  let lock;
  try { lock = JSON.parse(text); } catch (err) { throw new Error(`${THEMES_LOCK_FILE}: ${err.message}`); }
  const e = themesLockProblems(lock);
  if (e.length) throw new Error(`${THEMES_LOCK_FILE}: ${e.join('; ')}`);
  return lock;
}
// env（build-core の env）から読む。なければ null（版の固定はない：同梱のテーマはいつも今の版）
export function readThemesLock(env, root) {
  const f = env.path.join(root, THEMES_LOCK_FILE);
  if (!env.exists(f)) return null;
  return parseThemesLock(env.readText(f));
}
// 前の版の写しのフォルダ（<root>/vendor/themes）
export const themesVendorDir = (P, root) => P.join(root, ...VENDOR_THEMES);
const entry = (lock, name) => (lock && isObj(lock.themes) && own(lock.themes, name) && isObj(lock.themes[name]) ? lock.themes[name] : null);
export const currentThemeVersion = (lock, name) => entry(lock, name)?.current || null;

// 文書が記録したテーマの sha256 に合う版（なければ null）。prefer（記録の版）が合えばそれ、次に今の版、次に新しい版から
export function themeVersionForSha(lock, name, sha, prefer) {
  const t = entry(lock, name);
  if (!t || typeof sha !== 'string') return null;
  const m = t.sha256;
  if (typeof prefer === 'string' && t.versions.includes(prefer) && m[prefer] === sha) return prefer;
  if (m[t.current] === sha) return t.current;
  for (const v of [...t.versions].reverse()) if (m[v] === sha) return v;
  return null;
}
// 文書の索引のテーマ（index.themes）から、組み直しで使う版の固定を作る：{名前: 版}。今の版と同じものも入れる（部品の pinsForIndex と同じ）。
// 固定のファイルにあるテーマで、合う版がないものは missing に
export function themePinsForIndex(lock, themes) {
  const pins = {}, missing = [];
  for (const t of Array.isArray(themes) ? themes : []) {
    if (!isObj(t) || t.source !== 'registry' || typeof t.name !== 'string' || !NAME_RE.test(t.name) || !entry(lock, t.name)) continue;
    const v = themeVersionForSha(lock, t.name, t.sha256, t.version);
    if (v) pins[t.name] = v; else missing.push(t);
  }
  return { pins, missing };
}
// 作業フォルダの設定のファイル（FORMAT.CONFIG_FILE）の themes：{名前: 版}。形が違うものは捨てる
export function configThemePins(conf) {
  if (!isObj(conf) || !isObj(conf.themes)) return {};
  const out = {};
  for (const [k, v] of Object.entries(conf.themes)) if (NAME_RE.test(k) && typeof v === 'string' && VERSION_RE.test(v)) out[k] = v;
  return out;
}
// 使う版を決める：want（固定）が今の版なら今の版（themes/<名前>/）、前の版で写しがあればその版、なければ今の版と知らせ。
// 返すもの：{version, pinned: boolean（前の版の写しを使う）, note}。固定のファイルにないテーマは version: null
export function pickThemeVersion(lock, name, want) {
  const t = entry(lock, name);
  if (!t) return { version: null, pinned: false, note: null };
  if (want === undefined || want === null || want === t.current) return { version: t.current, pinned: false, note: null };
  if (typeof want === 'string' && t.versions.includes(want)) return { version: want, pinned: true, note: null };
  return { version: t.current, pinned: false, note: `theme ${name}: version "${String(want).slice(0, 40)}" is not in ${THEMES_LOCK_FILE}; using ${t.current}` };
}
// 前の版 from から今の版までに変わった色：{name, from, to, date, reasons: [文字列], tokens: [{token, from, to}]}（同じ token は最初の from と最後の to）。
// 変わりがなければ tokens は空
export function themeUpdate(lock, name, from) {
  const t = entry(lock, name);
  if (!t || !t.versions.includes(from)) return null;
  const later = t.versions.filter((v) => cmpVer(v, from) > 0 && cmpVer(v, t.current) <= 0).sort(cmpVer);
  const tok = new Map(), reasons = [];
  let date = null;
  for (const v of later) {
    const c = isObj(t.changes) && isObj(t.changes[v]) ? t.changes[v] : null;
    if (!c) continue;
    reasons.push(`${v}: ${c.reason}`); date = c.date;
    for (const x of c.tokens) tok.set(x.token, { token: x.token, from: tok.has(x.token) ? tok.get(x.token).from : x.from, to: x.to });
  }
  return { name, from, to: t.current, date, reasons, tokens: [...tok.values()].filter((x) => x.from.toLowerCase() !== x.to.toLowerCase()) };
}
// 知らせの 1 行（CLI と編集アプリの警告の板）
export function themePinnedWarning(u) {
  const list = u.tokens.map((x) => `${x.token} ${x.from} → ${x.to}`).join(', ');
  return `theme pinned: ${u.name} ${u.from} is the version this lesson recorded; the current ${u.name} is ${u.to}${list ? ` (${list})` : ''}. It is built with ${u.from}, never restyled silently. To update: in the editor press 「テーマを更新」 / Update theme; on the command line rebuild with --update-themes, or set "${u.name}": "${u.to}" under themes in egatari.json / 記録した版のテーマで組む。黙って新しい色にしない`;
}
