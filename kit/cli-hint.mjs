// 知らせの中のコマンド（「npm run ids」など。kit/core の言葉はリポジトリの中で打つ形で書いてある）を、今の呼ばれ方で打てる形にする。
//   egatari コマンドから（EGATARI_CLI）：npx egatari ids
//   リポジトリ（この包み）の中から：npm run ids --（そのまま）
//   外から node <包み>/kit/check.mjs で：node <包みへの相対パス>/tools/ids.mjs
// 打つ場所は INIT_CWD（npm run・egatari コマンドが渡す）か今いる場所
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = { ids: 'tools/ids.mjs', build: 'kit/build.mjs', check: 'kit/check.mjs', portable: 'tools/portable.mjs', sheet: 'tools/sheet.mjs', new: 'tools/new.mjs' };

export function cliCommand(name, env = process.env, cwd = env.INIT_CWD || process.cwd()) {
  if (env.EGATARI_CLI) return `npx ${env.EGATARI_CLI} ${name}`;
  const rel = path.relative(ROOT, path.resolve(cwd));
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) return `npm run ${name} --`;
  const abs = path.join(ROOT, ...SCRIPTS[name].split('/'));
  let script = path.relative(path.resolve(cwd), abs).split(path.sep).join('/');
  if (/^(\.\.\/){3,}/.test(script)) script = abs;   // 遠いときは絶対パス
  return `node ${/\s/.test(script) ? JSON.stringify(script) : script}`;
}
// 「npm run <名前> -- 」「npm run <名前>」を今の形に替える
export function cliHints(text, env, cwd) {
  return String(text).replace(/npm run (ids|build|check|portable|sheet|new)(?: --(?= ))?/g, (m, name) => {
    const c = cliCommand(name, env, cwd);
    return c.endsWith(' --') && !/ --$/.test(m) ? c.slice(0, -3) : c;
  });
}
