// npm audit with a short, written list of exceptions (.github/workflows/audit.yml). npm has no ignore list of its own.
//   AUDIT_ALLOW="<package> <GHSA id>" one per line; AUDIT_ALLOW_UNTIL=<version>; AUDIT_LEVEL=high (default)
//   node tools/audit-check.mjs
// Runs `npm audit --omit=dev --json` and fails when an advisory that is not on the list is at AUDIT_LEVEL or above (the same rule as
// `npm audit --audit-level`), and when package.json's version reached AUDIT_ALLOW_UNTIL (the exceptions have expired: remove them).
// An exception that npm no longer reports is printed as a warning, so it can be taken off the list.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const level = process.env.AUDIT_LEVEL || 'high';
if (!(level in RANK)) throw new Error(`AUDIT_LEVEL: ${level} is not one of ${Object.keys(RANK).join(', ')}`);
const allow = new Set((process.env.AUDIT_ALLOW || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(\S+)\s+(GHSA(?:-[a-z0-9]{4}){3})$/);
  if (!m) throw new Error(`AUDIT_ALLOW: cannot read "${l}" (write "<package> <GHSA id>")`);
  return `${m[1]} ${m[2]}`;
}));

const core = (v) => String(v).split('-')[0].split('.').map(Number);
const atLeast = (a, b) => { const x = core(a), y = core(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return true; };
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
let expired = false;
if (allow.size && process.env.AUDIT_ALLOW_UNTIL && atLeast(version, process.env.AUDIT_ALLOW_UNTIL)) {
  console.log(`::error::the audit exceptions expired at ${process.env.AUDIT_ALLOW_UNTIL} (package.json is ${version}): remove them from .github/workflows/audit.yml`);
  expired = true;
}

let out;
try { out = execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); }
catch (e) { out = e.stdout; if (!out) throw e; }   // npm audit exits 1 when it finds anything
const report = JSON.parse(out);
if (report.error) throw new Error(`npm audit: ${report.error.summary || JSON.stringify(report.error)}`);

const found = new Map();   // "<package> <GHSA>" → advisory
for (const v of Object.values(report.vulnerabilities || {})) {
  for (const a of v.via || []) {
    if (typeof a !== 'object') continue;
    const ghsa = (String(a.url || '').match(/GHSA(?:-[a-z0-9]{4}){3}/) || [String(a.source)])[0];
    found.set(`${a.name} ${ghsa}`, { ...a, ghsa });
  }
}
let failed = expired;
for (const [key, a] of [...found].sort()) {
  const blocking = RANK[a.severity] >= RANK[level];
  if (allow.has(key)) console.log(`allowed   ${a.severity.padEnd(8)} ${key} ${a.range} — ${a.title}`);
  else {
    console.log(`${blocking ? 'FAIL ' : 'below'}     ${a.severity.padEnd(8)} ${key} ${a.range} — ${a.title} ${a.url || ''}`);
    if (blocking) failed = true;
  }
}
for (const key of allow) if (!found.has(key)) console.log(`::warning::the audit exception "${key}" is no longer reported by npm audit: remove it from .github/workflows/audit.yml`);
console.log(failed ? `npm audit: advisories at ${level} or above that are not on the exception list` : `npm audit: nothing at ${level} or above outside the ${allow.size} exception(s)`);
process.exit(failed ? 1 : 0);
