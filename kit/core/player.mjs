// 同梱の再生器（format spec §4.1 の bundled player）：名前・中身のファイル・版の決め方。Node にもブラウザにも依存しない（node: の読み込みなし）。
// 索引と deck-meta の player {name, version} はここから書く（generator は作ったソフト＝Egatari Studio。別のもの）
//
//   PLAYER                       {name, displayName}：名前（"egatari-player"）と見せる名前（"Egatari Player"）
//   PLAYER_JSON, PLAYER_LOCK     kit/player.json（{name, version, title}：今の再生器の版と、人に見せる名前）と kit/player.lock.json（{version, sha256}：最後に出した版とその中身の hash）
//   PLAYER_FILES                 再生器の中身（組み立てが 1 ファイルに入れる実行系のファイル。リポジトリの根からのパス）。hash はこの一覧だけを見る
//   playerHash(read)             PLAYER_FILES の中身の hash（read(rel) → Uint8Array か文字列。改行をそろえる：kit/core/identity-hash.mjs）
//   bumpVersion(v, level)        X.Y.Z の patch | minor | major を 1 つ上げる
//   playerVersion(json, lock, sha256, commit)
//                                ファイルに書く版：中身が出した版と同じ（sha256 と版が lock と同じ）なら json.version、
//                                違えば json.version + "+dev." + commit（commit がなければ "+dev"）
//   resolvePlayer(env)           env（組み立ての env：path・ROOT・readText・exists、任意の commit）から {name, version, title, released, sha256}
import { RUNTIME_MODULES, RUNTIME_NAMESPACES } from './build-core.mjs';
import { normalizeEol } from './identity-hash.mjs';

export const PLAYER = Object.freeze({ name: 'egatari-player', displayName: 'Egatari Player' });
export const PLAYER_JSON = 'kit/player.json';
export const PLAYER_LOCK = 'kit/player.lock.json';
// 再生器の中身：組み立て（kit/core/build-core.mjs）が実行系の <script> と <style id="deck-base"> に入れる kit のファイルと、その中に入れる
// kit/core のモジュール（RUNTIME_MODULES・RUNTIME_NAMESPACES）、授業の部屋の派生に入れる再生器（kit/live.js と kit/core/live-policy.mjs）。
// 字・KaTeX・テーマ・部品は再生器ではない（それぞれの版と hash を持つ）。ここに足したら npm run player:check
export const PLAYER_FILES = Object.freeze([
  'kit/shape.js',
  ...Object.keys(RUNTIME_MODULES).map((f) => 'kit/' + f),
  ...Object.keys(RUNTIME_NAMESPACES).map((f) => 'kit/' + f),
  'kit/deck.js', 'kit/presenter.js', 'kit/tools.js',
  'kit/base.css', 'kit/layouts.css', 'kit/latin.css',
  'kit/live.js', 'kit/core/live-policy.mjs',
].sort());

export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
async function sha256Hex(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  let s = ''; for (const b of d) s += HEX[b]; return s;
}
const enc = new TextEncoder();

// 各ファイルの行「<path>\t<sha256>\n」（パスの順）の sha256。中身は改行をそろえてから（どの OS の checkout でも同じ）
export async function playerHash(read) {
  let lines = '';
  for (const rel of PLAYER_FILES) {
    const v = await read(rel);
    const bytes = typeof v === 'string' ? enc.encode(v) : v;
    lines += `${rel}\t${await sha256Hex(normalizeEol(bytes))}\n`;
  }
  return sha256Hex(enc.encode(lines));
}

export function bumpVersion(v, level) {
  const m = VERSION.exec(String(v || '0.0.0'));
  if (!m) throw new Error(`player: "${v}" is not X.Y.Z`);
  const [a, b, c] = m.slice(1).map(Number);
  if (level === 'major') return `${a + 1}.0.0`;
  if (level === 'minor') return `${a}.${b + 1}.0`;
  if (level === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`player: level must be patch, minor or major (got "${level}")`);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function parsePlayerJson(text) {
  const j = JSON.parse(text);
  if (!isObj(j) || j.name !== PLAYER.name || !VERSION.test(String(j.version)) || (j.title !== undefined && !(typeof j.title === 'string' && j.title))) throw new Error(`${PLAYER_JSON}: needs {"name": "${PLAYER.name}", "version": "X.Y.Z", "title": "…"}`);
  return j;
}
export function parsePlayerLock(text) {
  const j = JSON.parse(text);
  const okV = j && (j.version === null || VERSION.test(String(j.version)));
  const okS = j && (j.sha256 === null || /^[0-9a-f]{64}$/.test(String(j.sha256)));
  if (!isObj(j) || !okV || !okS || (j.version === null) !== (j.sha256 === null)) throw new Error(`${PLAYER_LOCK}: needs {"version": "X.Y.Z" | null, "sha256": "<64 hex>" | null}`);
  return j;
}

// 出した版の中身と同じか（版も同じ）
export const isReleased = (json, lock, sha256) => !!lock && lock.sha256 === sha256 && lock.version === json.version;
export function playerVersion(json, lock, sha256, commit) {
  if (isReleased(json, lock, sha256)) return json.version;
  const c = typeof commit === 'string' && /^[0-9a-f]{4,40}$/.test(commit) ? '.' + commit : '';
  return `${json.version}+dev${c}`;
}

export async function resolvePlayer(env) {
  // kit/ の下は組み立てが実行系を読むところ（env.KIT）から、ほかはリポジトリの根から
  const P = env.path, at = (rel) => (rel.startsWith('kit/') && env.KIT ? P.join(env.KIT, ...rel.slice(4).split('/')) : P.join(env.ROOT, ...rel.split('/')));
  const json = parsePlayerJson(env.readText(at(PLAYER_JSON)));
  const lock = env.exists(at(PLAYER_LOCK)) ? parsePlayerLock(env.readText(at(PLAYER_LOCK))) : null;
  const sha256 = await playerHash((rel) => env.readText(at(rel)));
  return { name: PLAYER.name, version: playerVersion(json, lock, sha256, env.commit), title: json.title || PLAYER.displayName, released: isReleased(json, lock, sha256), sha256 };
}
