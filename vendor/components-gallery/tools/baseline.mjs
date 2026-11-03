// The release a change goes into and the release before it, from package.json's version and the git tags (not from
// `git describe`, so the answer is the same before and after the release is tagged, and in CI).
//   version R = package.json; label = vR; base = the newest tag vX.Y.Z with X.Y.Z < R
//   If no tag is older than R (or there are no tags), base is '' and callers skip what needs it.
// tools/gallery.mjs marks new and changed components with it; tools/test-default-variant.mjs compares the default variant with base.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';

// X.Y.Z or X.Y.Z-pre (a pre-release sorts before its X.Y.Z)
const cmp = (a, b) => { const [ac, ap] = a.split('-'), [bc, bp] = b.split('-'); const x = ac.split('.').map(Number), y = bc.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return ap === bp ? 0 : ap === undefined ? 1 : bp === undefined ? -1 : (ap < bp ? -1 : 1); };
export function git(...a) {
  try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
}
export function baseline() {
  const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const older = git('tag', '--list', 'v*').split('\n').map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => t.slice(1)).filter((v) => cmp(v, R) < 0).sort(cmp);
  return { label: `v${R}`, base: older.length ? `v${older[older.length - 1]}` : '' };
}
