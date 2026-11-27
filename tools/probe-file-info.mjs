// Probe only (not for merging): npm test on this branch runs tools/test-app-file-info.mjs 3 at a time, 4 rounds,
// to catch the lic-only-bare hang seen on Linux CI (handoff #112). Arguments from the workflow (--jobs …) are ignored.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const built = spawnSync(process.execPath, ['tools/test-all.mjs', '--only', 'test-app-file-info'], { stdio: 'inherit' });
console.log(`probe: first run (with builds) exit ${built.status}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-fi-'));
const run = (name) => new Promise((resolve) => {
  const log = path.join(tmp, name + '.log');
  const out = fs.openSync(log, 'w');
  const t0 = Date.now();
  const p = spawn(process.execPath, ['tools/test-app-file-info.mjs', path.join(tmp, name)], { stdio: ['ignore', out, out] });
  const kill = setTimeout(() => p.kill('SIGKILL'), 600000);
  p.on('exit', (code) => { clearTimeout(kill); resolve({ name, code, s: Math.round((Date.now() - t0) / 1000), log }); });
});
let fails = built.status === 0 ? 0 : 1;
for (let round = 1; round <= 4; round++) {
  const rs = await Promise.all([1, 2, 3].map((i) => run(`r${round}-${i}`)));
  for (const r of rs) {
    console.log(`probe: ${r.name} exit ${r.code} in ${r.s} s`);
    if (r.code !== 0) {
      fails++;
      const text = fs.readFileSync(r.log, 'utf8').split('\n').filter((l) => !l.startsWith('  ok')).slice(-45).join('\n');
      console.log(text);
    }
  }
}
console.log(`probe: failed ${fails} of 13`);
process.exit(fails ? 1 : 0);
