// 音声の入った作業フォルダか 1 ファイル（.ega.html）を動画にする。音声は作らない。
//   node tools/video.mjs <作業フォルダ|.ega.html> [--music <音声ファイル>]（egatari video … も同じ）
//   --music：背景の音楽を 1 本、動画の全体の下に流す（台本の声の間は下げ、終わりで消す。render/render.mjs --music）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { colabVideoUrl } from '../kit/core/colab-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function videoPlan(input, { music = null } = {}) {
  const src = path.resolve(input);
  const extra = music ? ['--music', path.resolve(music)] : [];
  if (fs.statSync(src).isDirectory()) return {
    out: path.join(src, 'video'),
    commands: [['kit/build.mjs', path.join(src, 'deck.html')], ['render/render.mjs', path.join(src, 'out/deck.html'), '--out', path.join(src, 'video'), '--full', ...extra]],
  };
  if (!src.endsWith('.ega.html')) throw new Error('expected a working folder or single file (.ega.html)');
  // 組まれた再生器と音声をそのまま描く。再生専用のファイルも展開や組み直しは要らない。
  const out = src.slice(0, -'.ega.html'.length) + '.video';
  return { out, commands: [['render/render.mjs', src, '--out', out, '--full', ...extra]] };
}

export function main(argv) {
  const args = [...argv];
  let music = null;
  const mi = args.indexOf('--music');
  if (mi >= 0) { music = args[mi + 1] || ''; args.splice(mi, 2); }
  if (args.length !== 1 || args[0].startsWith('-') || music === '') {
    console.log(`Usage: ${process.env.EGATARI_CLI ? 'egatari video' : 'node tools/video.mjs'} <working folder|.ega.html> [--music <audio file>]`);
    return args[0] === '--help' ? 0 : 2;
  }
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.error(`ffmpeg is required (egatari doctor shows how to install it). To make the video in Google Colab instead: ${colabVideoUrl()}`);
    return 1;
  }
  try {
    if (music && !fs.existsSync(music)) throw new Error(`--music: file not found: ${music}`);
    const plan = videoPlan(args[0], { music });
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
