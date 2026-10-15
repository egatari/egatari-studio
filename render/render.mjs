// build 済みのデッキ（out/deck.html）→ 段階ごとの動画（clip_NNNN.mp4）と最終状態の静止画（clip_NNNN.png）
//
//   node render/render.mjs <built.html> --out <dir> [--fps 30] [--scale 1.5] [--only key,...] [--full] [--force]
//
// - 画面は DECK.seek(i, k, t) だけで描く（docs/contract.md §1）。仮想の時刻 t = f/fps でコマを撮る
// - 動きのある区間 [0, motion)（motion = max(anim, 注目の演出の終わり)）だけを fps で撮り、残り（dur - anim）は最終状態（t = Infinity）の 1 枚を伸ばす
// - 音声は lead 秒の無音のあとに置き、dur まで無音で埋める（音声が dur を超えたら切って警告）
// - 出力：clip_NNNN.mp4（H.264 yuv420p・固定フレームレート・faststart、AAC）、clip_NNNN.png、
//   timeline.out.json（各段階の開始・長さ・題名・章・原稿。canon の録画モードの transcript_segment に使える）
// - --full：全体を 1 本（full.mp4）に。章（timeline の chapter）が 2 つ以上あれば章ごとの mp4 も作る
// - キャッシュ：最終状態と動きの途中の 1 コマの画素・音声・dur・lead・fps・scale のハッシュが前回と同じ段階は作らない
//   （<out>/.render-cache.json）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';

const RENDER_VERSION = 3;   // 書き出しの方法を変えたら上げる（キャッシュを捨てる）

function parseArgs(argv) {
  const o = { fps: 30, scale: 1.5, only: null, full: false, force: false, out: null, src: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--fps') o.fps = +argv[++i];
    else if (a === '--scale') o.scale = +argv[++i];
    else if (a === '--only') o.only = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--full') o.full = true;
    else if (a === '--force') o.force = true;
    else o.src = a;
  }
  if (!o.src || !o.out) {
    console.error('usage: node render/render.mjs <built.html> --out <dir> [--fps 30] [--scale 1.5] [--only key,...] [--full] [--force]');
    process.exit(1);
  }
  return o;
}

const sha = (...bufs) => { const h = crypto.createHash('sha256'); for (const b of bufs) { h.update(b); h.update('\x1f'); } return h.digest('hex').slice(0, 16); };
const pad4 = (n) => String(n).padStart(4, '0');

function ff(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffmpeg を起動できない / cannot run ffmpeg (install ffmpeg and put it on PATH): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg (${label}) failed:\n${r.stderr.slice(-2000)}`);
}
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,r_frame_rate,nb_frames,duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffprobe を起動できない / cannot run ffprobe (install ffmpeg and put it on PATH): ${r.error.message}`);
  return JSON.parse(r.stdout);
}

// 音声の src（build が埋め込んだ相対パスか data: URI）→ ローカルのファイル
function audioFile(src, htmlUrl, tmp, idx) {
  if (!src) return null;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    const ext = (m[1] || '').includes('mpeg') ? 'mp3' : (m[1] || '').includes('mp4') ? 'm4a' : 'wav';
    const f = path.join(tmp, `audio_${idx}.${ext}`);
    fs.writeFileSync(f, m[2] ? Buffer.from(m[3], 'base64') : decodeURIComponent(m[3]));
    return f;
  }
  const u = new URL(src, htmlUrl);
  if (u.protocol !== 'file:') throw new Error(`file: 以外の音声には対応していない: ${src}`);
  const f = fileURLToPath(u);
  if (!fs.existsSync(f)) throw new Error(`音声がない: ${f}`);
  return f;
}

// 1 段階を mp4 にする。frames: 動きの区間のコマ（PNG のパス）、final: 最終状態の PNG
function encodeClip({ frames, final, audio, dur, lead, fps, out }) {
  const N = Math.max(1, Math.round(dur * fps));           // 全体のコマ数（固定フレームレート）
  const nA = Math.min(frames.length, N);
  const nH = N - nA;
  const args = [];
  const vf = [];
  let vi = 0;
  if (nA > 0) {
    args.push('-framerate', String(fps), '-start_number', '0', '-i', path.join(path.dirname(frames[0]), 'f_%05d.png'));
    vf.push(`[${vi}:v]trim=end_frame=${nA},setpts=N/(${fps}*TB)[va]`); vi++;
  }
  if (nH > 0) {
    args.push('-framerate', String(fps), '-loop', '1', '-t', ((nH + 2) / fps).toFixed(4), '-i', final);
    vf.push(`[${vi}:v]trim=end_frame=${nH},setpts=N/(${fps}*TB)[vh]`); vi++;
  }
  const vlabels = (nA > 0 ? '[va]' : '') + (nH > 0 ? '[vh]' : '');
  const nV = (nA > 0) + (nH > 0);
  vf.push(nV > 1 ? `${vlabels}concat=n=${nV}:v=1:a=0,fps=${fps},format=yuv420p[v]` : `${vlabels}fps=${fps},format=yuv420p[v]`);
  const T = (N / fps).toFixed(6);
  if (audio) {
    args.push('-i', audio);
    const ms = Math.max(0, Math.round(lead * 1000));
    vf.push(`[${vi}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${ms}:all=1,apad,atrim=0:${T}[a]`);
  } else {
    args.push('-f', 'lavfi', '-t', T, '-i', 'anullsrc=r=44100:cl=stereo');
    vf.push(`[${vi}:a]atrim=0:${T}[a]`);
  }
  args.push('-filter_complex', vf.join(';'), '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-fps_mode', 'cfr',
    '-g', String(fps * 2), '-frames:v', String(N),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-t', T,
    '-movflags', '+faststart', out);
  ff(args, path.basename(out));
}

// 同じ設定のクリップを 1 本に繋ぐ（映像はコピー、音声は作り直して継ぎ目の隙間を出さない）
function concatClips(files, out, tmp) {
  const list = path.join(tmp, `concat_${path.basename(out)}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], path.basename(out));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const src = path.resolve(o.src);
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-render-'));
  const cachePath = path.join(outDir, '.render-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}

  const W = 1280, H = 720;
  const browser = await launch();
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: o.scale });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const htmlUrl = pathToFileURL(src).href;
    await page.goto(htmlUrl + '?mode=video');
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const { tl, narration } = await page.evaluate(() => ({ tl: DECK.timeline(), narration: DECK.NARRATION }));
    const total = tl.reduce((a, s) => a + s.dur, 0);
    console.log(`timeline: ${tl.length} 段階, ${total.toFixed(1)} s, ${Math.round(W * o.scale)}x${Math.round(H * o.scale)} @ ${o.fps} fps`);

    const shot = async (i, k, t, file) => {
      await page.evaluate(([i, k, t]) => {
        // 入ってくるスライドの下に見える前のスライドは、seek が描き直さない（最後に描いた状態のまま）。
        // 撮る順番に左右されないよう、前のスライドを最終状態にしてから描く
        if (k === 0 && i > 0 && t !== null) DECK.seek(i - 1, DECK.slides[i - 1]._max, Infinity);
        DECK.seek(i, k, t === null ? Infinity : t, k === 0 ? i - 1 : undefined);
        // 描いた結果が画面に載るまで待つ（待たないと、ときどき 1 つ前の画面が撮れる）
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [i, k, t === Infinity ? null : t]);
      return page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
    };

    const segsOut = [];
    let made = 0, skipped = 0, clipT = 0;   // clipT：ここまでのコマ数
    for (let n = 0; n < tl.length; n++) {
      const s = tl[n];
      const stepKey = s.key.slice(s.slideKey.length + 1);
      const turns = (narration[s.slideKey] || {})[stepKey] || [];
      const clip = `clip_${pad4(n)}`;
      const N = Math.max(1, Math.round(s.dur * o.fps));
      const rec = {
        index: n, clip: `${clip}.mp4`, still: `${clip}.png`, key: s.key, slideKey: s.slideKey, stepKey, i: s.i, k: s.k,
        title: s.title, chapter: s.chapter, start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), anim: +s.anim.toFixed(3),
        lead: s.lead, audioDur: s.audioDur,
        // 実際のクリップの長さ（コマ数に丸めたもの）。繋いだ動画の上の時刻はこちらで数える
        frames: N, clipDur: +(N / o.fps).toFixed(6), clipStart: +(clipT / o.fps).toFixed(6),
        start_ms: Math.round(clipT / o.fps * 1000), end_ms: Math.round((clipT + N) / o.fps * 1000),
        transcript: turns, text: turns.map((t) => t.text).join(' '),
      };
      segsOut.push(rec);
      clipT += N;
      if (o.only && !o.only.has(s.key)) continue;

      const tmp = fs.mkdtempSync(path.join(tmpRoot, `${clip}-`));
      const final = path.join(tmp, 'final.png');
      const finalBuf = await shot(s.i, s.k, Infinity, final);
      // 動きの区間：組み込みの効果・部品（anim）と注目の演出（{mark}）の終わりのうち遅いほう
      const motion = s.motion ?? s.anim;
      const nA = Math.min(Math.ceil(motion * o.fps - 1e-6), Math.max(1, Math.round(s.dur * o.fps)));
      let midBuf = Buffer.alloc(0);
      if (nA > 0) midBuf = await shot(s.i, s.k, Math.floor(nA / 2) / o.fps, path.join(tmp, 'mid.png'));
      const audio = audioFile(s.audio, htmlUrl, tmp, n);
      const audioHash = audio ? sha(fs.readFileSync(audio)) : 'none';
      const hash = sha(finalBuf, midBuf, audioHash, JSON.stringify({ v: RENDER_VERSION, dur: s.dur, lead: s.lead, anim: s.anim, motion, fps: o.fps, scale: o.scale }));
      const mp4 = path.join(outDir, `${clip}.mp4`), png = path.join(outDir, `${clip}.png`);
      if (!o.force && cache[clip] === hash && fs.existsSync(mp4) && fs.existsSync(png)) {
        skipped++;
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(`  [${n + 1}/${tl.length}] ${s.key}: 変更なし（キャッシュ）`);
        continue;
      }
      const frames = [];
      for (let f = 0; f < nA; f++) {
        const file = path.join(tmp, `f_${String(f).padStart(5, '0')}.png`);
        await shot(s.i, s.k, f / o.fps, file);
        frames.push(file);
      }
      if (audio && s.lead + s.audioDur > s.dur + 1e-3) console.warn(`  ⚠ ${s.key}: 音声（${s.lead}+${s.audioDur.toFixed(2)} s）が dur（${s.dur.toFixed(2)} s）を超える。末尾を切る`);
      encodeClip({ frames, final, audio, dur: s.dur, lead: s.lead, fps: o.fps, out: mp4 });
      fs.copyFileSync(final, png);
      cache[clip] = hash;
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
      fs.rmSync(tmp, { recursive: true, force: true });
      made++;
      console.log(`  [${n + 1}/${tl.length}] ${s.key}: ${s.dur.toFixed(2)} s（動き ${nA} コマ${audio ? '、音声あり' : ''}）→ ${clip}.mp4`);
    }
    // 段階の数が減ったときの古いクリップは消す（canon の連番がずれないように）
    for (const f of fs.readdirSync(outDir)) {
      const m = f.match(/^clip_(\d{4})\.(mp4|png)$/);
      if (m && +m[1] >= tl.length) { fs.rmSync(path.join(outDir, f)); delete cache[`clip_${m[1]}`]; }
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    const meta = { source: src, fps: o.fps, scale: o.scale, width: Math.round(W * o.scale), height: Math.round(H * o.scale),
      duration: +total.toFixed(3), clipDuration: +(clipT / o.fps).toFixed(6), segments: segsOut };
    fs.writeFileSync(path.join(outDir, 'timeline.out.json'), JSON.stringify(meta, null, 1));
    console.log(`完了: 新規 ${made} / キャッシュ ${skipped} → ${outDir}`);

    if (o.full) {
      const clips = segsOut.map((s) => path.join(outDir, s.clip));
      const missing = clips.filter((f) => !fs.existsSync(f));
      if (missing.length) throw new Error(`--full: クリップが足りない（${missing.length} 本）。--only なしで書き出してから`);
      concatClips(clips, path.join(outDir, 'full.mp4'), tmpRoot);
      console.log(`  full.mp4: ${(+probe(path.join(outDir, 'full.mp4')).format.duration).toFixed(2)} s（timeline ${total.toFixed(2)} s）`);
      // 章ごと（連続する同じ chapter をまとめる）
      const groups = [];
      for (const s of segsOut) {
        if (!groups.length || groups.at(-1).chapter !== s.chapter) groups.push({ chapter: s.chapter, clips: [] });
        groups.at(-1).clips.push(path.join(outDir, s.clip));
      }
      if (groups.length > 1) {
        groups.forEach((g, j) => {
          const name = `chapter_${String(j + 1).padStart(2, '0')}.mp4`;
          concatClips(g.clips, path.join(outDir, name), tmpRoot);
          console.log(`  ${name}: ${g.chapter || '（章の前）'} ${g.clips.length} 段階`);
        });
        fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify(groups.map((g, j) => ({ file: `chapter_${String(j + 1).padStart(2, '0')}.mp4`, chapter: g.chapter, clips: g.clips.map((c) => path.basename(c)) })), null, 1));
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (errs.length) { console.warn('ページのエラー:'); for (const e of errs) console.warn('  ' + e); }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
