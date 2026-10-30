// 音声の入った作業フォルダか 1 ファイル（.ega.html）を動画にする。音声は作らない。
//   node tools/video.mjs <作業フォルダ|.ega.html>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function videoPlan(input) {
  const src = path.resolve(input);
  if (fs.statSync(src).isDirectory()) return {
    out: path.join(src, 'video'),
    commands: [['kit/build.mjs', path.join(src, 'deck.html')], ['render/render.mjs', path.join(src, 'out/deck.html'), '--out', path.join(src, 'video'), '--full']],
  };
  if (!src.endsWith('.ega.html')) throw new Error('expected a working folder or single file (.ega.html)');
  // 組まれた再生器と音声をそのまま描く。再生専用のファイルも展開や組み直しは要らない。
  const out = src.slice(0, -'.ega.html'.length) + '.video';
  return { out, commands: [['render/render.mjs', src, '--out', out, '--full']] };
}

export function main(argv) {
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    console.log('Usage: node tools/video.mjs <working folder|.ega.html>');
    return argv[0] === '--help' ? 0 : 2;
  }
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.error('ffmpeg is required. See colab/ for Google Colab (video notebook: backlog #131).');
    return 1;
  }
  try {
    const plan = videoPlan(argv[0]);
    for (const [tool, ...args] of plan.commands) {
      const r = spawnSync(process.execPath, [path.join(ROOT, tool), ...args], { cwd: ROOT, stdio: 'inherit' });
      if (r.error) throw r.error;
      if (r.status !== 0) return r.status ?? 1;
    }
    console.log(`video: ${plan.out}`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
