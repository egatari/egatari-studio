// 同梱の再生器（Egatari Player。format spec §4.1、kit/core/player.mjs）の版と中身の固定（RELEASING.md の rc の準備）
//   npm run player:check [-- --strict]          今の中身（PLAYER_FILES）の hash と kit/player.lock.json を比べて知らせる。
//                                               ブランチでは知らせるだけ（終了コード 0）。--strict（rc の準備）なら、違えば終了コード 1
//   npm run player:bump -- patch|minor|major    出した版（lock の version。まだなければ 0.0.0）を 1 つ上げ、kit/player.json と lock（版と今の hash）を書き、
//                                               changes/player-<版>.md の断片を足す（中身を書き足すこと）。最初の版は major（1.0.0）
//   どれも [--root <dir>]（既定はリポジトリ。試験用）
// 組み立てがファイルに書く player.version：中身が lock と同じなら kit/player.json の version、違えば "<version>+dev.<commit>"
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';
import { PLAYER, PLAYER_FILES, PLAYER_JSON, PLAYER_LOCK, playerHash, playerVersion, isReleased, bumpVersion, parsePlayerJson, parsePlayerLock, VERSION } from '../kit/core/player.mjs';

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const ROOT = path.resolve(ri >= 0 ? args[ri + 1] : path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const rest = args.filter((a, i) => !(ri >= 0 && (i === ri || i === ri + 1)));
const cmd = rest[0];
const at = (rel) => path.join(ROOT, ...rel.split('/'));
const USAGE = 'usage: node tools/player.mjs check [--strict] | bump patch|minor|major [--root <dir>]';

function commit() {
  const r = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}
async function state() {
  const read = (rel) => readRegular(at(rel), { max: READ_LIMITS.source });
  const json = parsePlayerJson(read(PLAYER_JSON).toString('utf8'));
  const lock = fs.existsSync(at(PLAYER_LOCK)) ? parsePlayerLock(read(PLAYER_LOCK).toString('utf8')) : { version: null, sha256: null };
  const sha256 = await playerHash((rel) => new Uint8Array(read(rel)));
  return { json, lock, sha256 };
}

if (cmd === 'check') {
  const strict = rest.includes('--strict');
  const { json, lock, sha256 } = await state();
  const released = isReleased(json, lock, sha256);
  console.log(`${PLAYER.displayName}: ${PLAYER_JSON} ${json.version}; ${PLAYER_LOCK} ${lock.version ?? '(no release yet)'}${lock.sha256 ? ` ${lock.sha256.slice(0, 12)}` : ''}; now ${sha256.slice(0, 12)} (${PLAYER_FILES.length} files)`);
  if (released) { console.log(`player:check: the player is the released ${json.version}; builds write "${json.version}"`); process.exit(0); }
  const why = lock.sha256 !== sha256 ? 'its bytes differ from the last release' : `${PLAYER_JSON} says ${json.version}, the lock ${lock.version}`;
  const v = playerVersion(json, lock, sha256, commit());
  if (strict) {
    console.error(`player:check --strict: ${why}. Before the release candidate run: npm run player:bump -- patch|minor|major`);
    process.exit(1);
  }
  console.log(`player:check (information only): ${why}; builds write "${v}". At rc prep: npm run player:bump -- patch|minor|major`);
  process.exit(0);
} else if (cmd === 'bump') {
  const level = rest[1];
  if (!['patch', 'minor', 'major'].includes(level)) { console.error(USAGE); process.exit(2); }
  const { json, lock, sha256 } = await state();
  const next = bumpVersion(lock.version || '0.0.0', level);
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  if (!VERSION.test(next) || cmp(next, json.version) < 0) {
    console.error(`player:bump: ${level} gives ${next}, lower than ${PLAYER_JSON} ${json.version}${lock.version ? '' : ' (the first release of the player is "major": 1.0.0)'}`);
    process.exit(1);
  }
  fs.writeFileSync(at(PLAYER_JSON), JSON.stringify({ ...json, name: PLAYER.name, version: next }, null, 2) + '\n');
  fs.writeFileSync(at(PLAYER_LOCK), JSON.stringify({ version: next, sha256 }, null, 2) + '\n');
  const frag = path.join(ROOT, 'changes', `player-${next}.md`);
  if (!fs.existsSync(frag)) {
    fs.mkdirSync(path.dirname(frag), { recursive: true });
    fs.writeFileSync(frag, `### Changed\n\n- ${PLAYER.displayName} ${next} (the bundled player that files carry, \`player\` in the index and \`deck-meta\`): ${level} release. TODO: say what changed for lessons.\n`);
  }
  console.log(`player:bump: ${lock.version ?? '(none)'} → ${next}; ${PLAYER_JSON} and ${PLAYER_LOCK} (${sha256.slice(0, 12)}) written; edit changes/player-${next}.md`);
} else {
  console.error(USAGE);
  process.exit(2);
}
