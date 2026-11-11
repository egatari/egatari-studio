// build 済みのデッキ（out/deck.html）→ 段階ごとの動画（clip_NNNN.mp4）と最終状態の静止画（clip_NNNN.png）
//
//   node render/render.mjs <built.html> --out <dir> [--fps 30] [--scale 1.5] [--only key|id|key:step,...] [--full] [--force]
//
// - 画面は DECK.seek(i, k, t) だけで描く（docs/contract.md §1）。仮想の時刻 t = f/fps でコマを撮る
// - 動きのある区間 [0, motion)（motion = max(anim, 注目の演出の終わり)）だけを fps で撮り、残り（dur - anim）は最終状態（t = Infinity）の 1 枚を伸ばす
// - 音声は全体で 1 本（48 kHz）：各段階の口述音声を、積み上げた時間（コマに丸めない）の標本の位置に、lead 秒のあとから置く
//   （段階の終わりを超えたら切って警告）。継ぎ目で標本がずれず、跳ばない（render/audio-track.mjs）
// - 部品の音は作者の時刻で合成して同じ 1 本に混ぜる。段階をまたぐ余韻を残す（見る人の延長・ミュートは使わない）
// - --music <ファイル>：背景の音楽を 1 本、全体の下に流す（台本の声の間は下げ、終わりで消す。拍には合わせない。秒の設定はない）
// - クリップの音声は、その 1 本をコマの境目で切った続きの区間。full.mp4・章の mp4 の音声も、その 1 本から 1 回だけ AAC にする
//   （クリップの AAC を繋いで作り直さない：先頭の 1024 標本の遅れと継ぎ目の隙間が出ない）
// - 出力：clip_NNNN.mp4（H.264 yuv420p・固定フレームレート・faststart、AAC 48 kHz）、clip_NNNN.png、
//   timeline.out.json（各段階の開始・長さ・題名・章・原稿。字幕・チャプターの印に使える）
// - --full：全体を 1 本（full.mp4）に。章（timeline の chapter）が 2 つ以上あれば章ごとの mp4 も作る
// - キャッシュ（<out>/.render-cache.json）：段階ごとの「入力」のハッシュ（スライドの HTML・部品のコード・テーマなど
//   スライド以外の HTML 全体・その段階の音声と注目の演出と時間・dur/lead/anim/motion・fps・scale・音声ファイル）と、
//   最終状態と動きの途中の 1 コマの画素とが前回と同じ段階は作らない
// - 鮮度：キャッシュにはクリップごとの入力のハッシュ（clips.<clip>.input）を残す。今の入力と合わないクリップ・
//   無いクリップがあれば（--only のあとなど）timeline.out.json に stale として書き、--full は断り、終了コード 2 で終える。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { readRegular, READ_LIMITS } from '../kit/bounded-read.mjs';
import { resolveOnly, unknownOnlyMessage } from './only.mjs';
import { collectVideoEvents, videoSoundEvents, renderStepSounds } from './sounds.mjs';
import { VIDEO_SR, trackLayout, placeNarration, narrationWindows, musicGain, musicBase, limitPeaks } from './audio-track.mjs';

const RENDER_VERSION = 6;   // 書き出しの方法を変えたら上げる（キャッシュを捨てる）
const CACHE_FILE = '.render-cache.json';

function parseArgs(argv) {
  const o = { fps: 30, scale: 1.5, only: null, full: false, force: false, captions: false, music: null, out: null, src: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--fps') o.fps = +argv[++i];
    else if (a === '--scale') o.scale = +argv[++i];
    else if (a === '--only') o.only = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--full') o.full = true;
    else if (a === '--force') o.force = true;
    else if (a === '--captions') o.captions = true;   // 口述原稿の字幕を映像に焼き込む
    else if (a === '--music') o.music = argv[++i];   // 背景の音楽（任意）
    else o.src = a;
  }
  if (!o.src || !o.out) {
    console.error('usage: node render/render.mjs <built.html> --out <dir> [--fps 30] [--scale 1.5] [--only key|id|key:step,...] [--full] [--force] [--music <file>]');
    process.exit(1);
  }
  if (!Number.isInteger(o.fps) || o.fps < 1 || o.fps > 120) { console.error(`--fps は 1〜120 の整数 / --fps must be an integer in 1..120（${o.fps}）`); process.exit(1); }
  if (!Number.isFinite(o.scale) || o.scale < 0.25 || o.scale > 4) { console.error(`--scale は 0.25〜4 / --scale must be in 0.25..4（${o.scale}）`); process.exit(1); }
  if (o.music !== null && !(o.music && fs.existsSync(o.music) && fs.statSync(o.music).isFile())) { console.error(`--music のファイルがない / --music file not found（${o.music}）`); process.exit(1); }
  if (o.only && !o.only.size) { console.error('--only にスライドの id もステップもない / --only needs at least one slide id or slide id:step'); process.exit(1); }
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

// 音声のファイルを 48 kHz の PCM にする（ffmpeg で復号。channels：1 か 2）→ [Float32Array, …]
function decodePcm(file, channels = 1, sr = VIDEO_SR) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(channels), '-ar', String(sr), '-'], { maxBuffer: 2 ** 31 - 1 });
  if (r.error) throw new Error(`ffmpeg を起動できない / cannot run ffmpeg (install ffmpeg and put it on PATH): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg (decode ${path.basename(file)}) failed:\n${String(r.stderr).slice(-2000)}`);
  const b = r.stdout, n = Math.floor(b.length / 4 / channels);
  const f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + n * channels * 4));
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) out[c][i] = f[i * channels + c];
  return out;
}
// 2 チャンネルの区間 [a, b) を、交互に並べた f32le のバイト列にする（ffmpeg の -f f32le -ac 2 の入力）
function interleave(ch, a, b) {
  const n = Math.max(0, b - a), f = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { f[2 * i] = ch[0][a + i] ?? 0; f[2 * i + 1] = ch[1][a + i] ?? 0; }
  return Buffer.from(f.buffer);
}
const rawAudioArgs = (file) => ['-f', 'f32le', '-ar', String(VIDEO_SR), '-ac', '2', '-i', file];
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', String(VIDEO_SR), '-ac', '2'];

// 1 段階を mp4 にする。frames: 動きの区間のコマ（PNG のパス）、final: 最終状態の PNG
// pcm：この段階の音声（1 本の音声をコマの境目で切った区間。f32le・2 チャンネルのファイル）
// N：クリップのコマ数（固定フレームレート。frameStarts の境目の差）
function encodeClip({ frames, final, pcm, N, fps, out }) {
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
  args.push(...rawAudioArgs(pcm));
  args.push('-filter_complex', vf.join(';'), '-map', '[v]', '-map', `${vi}:a`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-fps_mode', 'cfr',
    '-g', String(fps * 2), '-frames:v', String(N),
    ...AAC, '-t', T,
    '-movflags', '+faststart', out);
  ff(args, path.basename(out));
}

// 同じ設定のクリップの映像を 1 本に繋ぎ（コピー。各クリップの長さはコマ数で決める）、音声は 1 本の音声の区間 [a, b) を 1 回だけ AAC にする
// 繋ぐ前に各クリップの映像だけを取り出す：クリップの AAC は先頭の 1024 標本（priming）が負の時刻にあり、concat はファイルの
// 始まり（その負の時刻）を 0 に合わせるため、音声つきのまま繋ぐと映像が 21 ms 遅れる
function joinClips(clips, out, tmp, track, a, b, fps) {
  const vdir = fs.mkdtempSync(path.join(tmp, 'join-'));
  const vids = clips.map((c, j) => {
    const v = path.join(vdir, `v_${pad4(j)}.mp4`);
    ff(['-i', c.file, '-map', '0:v', '-c', 'copy', v], `${path.basename(c.file)} (video)`);
    return { file: v, frames: c.frames };
  });
  const list = path.join(tmp, `concat_${path.basename(out)}.txt`);
  fs.writeFileSync(list, vids.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'\nduration ${(c.frames / fps).toFixed(6)}`).join('\n') + '\n');
  const raw = path.join(tmp, `audio_${path.basename(out)}.f32`);
  fs.writeFileSync(raw, interleave(track, a, b));
  const frames = clips.reduce((x, c) => x + c.frames, 0);
  ff(['-f', 'concat', '-safe', '0', '-i', list, ...rawAudioArgs(raw), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-frames:v', String(frames),
    ...AAC, '-t', (frames / fps).toFixed(6), '-movflags', '+faststart', out], path.basename(out));
  fs.rmSync(raw, { force: true });
  fs.rmSync(vdir, { recursive: true, force: true });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const src = path.resolve(o.src);
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-render-'));
  const cachePath = path.join(outDir, CACHE_FILE);
  let cache = { version: RENDER_VERSION, clips: {} };
  try {
    const c = JSON.parse(readRegular(cachePath, { max: READ_LIMITS.json }).toString('utf8'));
    if (c && c.version === RENDER_VERSION && c.clips) cache = c;   // 古い形式のキャッシュは捨てる
  } catch {}
  const saveCache = () => fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  const htmlText = readRegular(src, { max: READ_LIMITS.built }).toString('utf8');   // 組んだデッキ：通常のファイルだけ、上限つきで（kit/bounded-read.mjs）

  const W = 1280, H = 720;
  const browser = await launch();
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: o.scale });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const htmlUrl = pathToFileURL(src).href;
    await page.goto(htmlUrl + '?mode=video' + (o.captions ? '&captions=1' : ''));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const { tl, narration, ids } = await page.evaluate(() => ({ tl: DECK.timeline(), narration: DECK.NARRATION, ids: DECK.slides.map((x) => x.id || null) }));
    let onlyKeys = null;
    const soundEvents = videoSoundEvents(tl, await page.evaluate(collectVideoEvents), o.fps);
    // 段階の入力：build 済みの HTML を（スクリプトを動かさずに）読み、スライドごとの HTML と、それ以外（部品のコード・
    // テーマの CSS・deck.js など）に分ける。段階ごとの音声・注目の演出・時間の上書き・原稿は鍵ごとに入れる
    const inputs = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const ss = [...doc.querySelectorAll('#stage > .slide')];
      const slideHtml = ss.map((x) => x.outerHTML);
      ss.forEach((x) => x.remove());
      doc.querySelectorAll('script[id^="deck-"][type="application/json"]').forEach((x) => x.remove());
      const ok = ss.length === DECK.slides.length;
      const keyIdx = new Map(DECK.slides.map((x, j) => [x._key, j]));
      const per = DECK.timeline().map((g) => {
        const deps = [g.i];
        if (g.k === 0 && g.i > 0) deps.push(g.i - 1);
        const m = g.k === 0 && DECK.morph(g.i);
        if (m && m.src && keyIdx.has(m.src)) deps.push(keyIdx.get(m.src));
        const stepKey = g.key.slice(g.slideKey.length + 1);
        return { deps, data: { audio: DECK.AUDIO[g.key] || null, marks: DECK.MARKS[g.key] || null, timing: DECK.TIMING[g.key] || null,
          narr: (DECK.NARRATION[g.slideKey] || {})[stepKey] || null } };
      });
      return { ok, global: ok ? doc.documentElement.outerHTML : html, slideHtml: ok ? slideHtml : [], n: DECK.slides.length, per };
    }, htmlText);
    if (!inputs.ok) console.warn('  ⚠ build 済みの HTML のスライドが数えられない。HTML 全体を全ステップの入力にする（キャッシュが効きにくい）');
    if (o.only) {
      const r = resolveOnly([...o.only], tl, ids);
      if (r.unknown.length) throw Object.assign(new Error(unknownOnlyMessage(r.unknown, r.valid)), { clean: true });
      onlyKeys = r.keys;
    }
    const globalHash = sha(String(RENDER_VERSION), inputs.global, String(inputs.n));
    const slideHash = inputs.slideHtml.map((h) => sha(h));
    const total = tl.reduce((a, s) => a + s.dur, 0);
    console.log(`timeline: ${tl.length} ステップ, ${total.toFixed(1)} s, ${Math.round(W * o.scale)}x${Math.round(H * o.scale)} @ ${o.fps} fps`);

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
    // 境目のコマは累積の時刻から決める（段階ごとに丸めると、短い段階が続く曲でずれがたまる）
    const layout = trackLayout(tl, o.fps, VIDEO_SR);
    const starts = layout.starts;
    // 全体の音声を 1 本にする（左右。口述音声と部品の音は両方に同じものを置く）
    const track = [new Float32Array(layout.total), new Float32Array(layout.total)];
    for (let n = 0; n < tl.length; n++) {
      const s = tl[n];
      const file = audioFile(s.audio, htmlUrl, tmpRoot, n);
      if (!file) continue;
      readRegular(file, { max: READ_LIMITS.audio });   // 通常のファイルだけ、上限つきで
      const [pcm] = decodePcm(file, 1);
      const skip = Math.round((s.audioOffset || 0) * VIDEO_SR);   // 音声の符号化の遅れ（format spec §5.2 startOffset）を先頭から切る
      const from = layout.at(s.start + s.lead), to = layout.stepRange(n)[1];
      const body = pcm.subarray(Math.min(skip, pcm.length));
      placeNarration(track[0], body, from, to);
      placeNarration(track[1], body, from, to);
      if (from + body.length > to + Math.round(VIDEO_SR / 1000)) console.warn(`  ⚠ ${s.key}: 音声（${s.lead}+${(body.length / VIDEO_SR).toFixed(2)} s）が dur（${s.dur.toFixed(2)} s）を超える。末尾を切る`);
    }
    if (soundEvents.length) {
      const pcm = renderStepSounds(soundEvents, 0, layout.total / VIDEO_SR, VIDEO_SR);
      for (const c of track) for (let i = 0; i < c.length && i < pcm.length; i++) c[i] += pcm[i];
    }
    if (o.music) {
      const m = decodePcm(path.resolve(o.music), 2);
      const g = musicGain(narrationWindows(tl), layout.total, VIDEO_SR, { base: musicBase(m) });
      for (let c = 0; c < 2; c++) for (let i = 0; i < layout.total && i < m[c].length; i++) track[c][i] += m[c][i] * g[i];
      console.log(`  背景の音楽: ${path.basename(o.music)}（${(m[0].length / VIDEO_SR).toFixed(1)} s。声の間は下げ、終わりで消す）`);
    }
    if (limitPeaks(track, 0.98, VIDEO_SR)) console.log('  音声の山を 0.98 に抑えた');
    const sliceHash = (a, b) => sha(interleave(track, a, b));
    let made = 0, skipped = 0, clipT = 0;   // clipT：ここまでのコマ数
    for (let n = 0; n < tl.length; n++) {
      const s = tl[n];
      const stepKey = s.key.slice(s.slideKey.length + 1);
      const turns = (narration[s.slideKey] || {})[stepKey] || [];
      const clip = `clip_${pad4(n)}`;
      const N = starts[n + 1] - starts[n];
      const rec = {
        index: n, clip: `${clip}.mp4`, still: `${clip}.png`, key: s.key, slideKey: s.slideKey, stepKey, i: s.i, k: s.k,
        title: s.title, chapter: s.chapter, start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), anim: +s.anim.toFixed(3),
        lead: s.lead, audioDur: s.audioDur, audioOffset: s.audioOffset || 0,
        // 実際のクリップの長さ（累積の時刻をコマに丸めた境目の差）。繋いだ動画の上の時刻はこちらで数える
        frames: N, clipDur: +(N / o.fps).toFixed(6), clipStart: +(clipT / o.fps).toFixed(6),
        start_ms: Math.round(clipT / o.fps * 1000), end_ms: Math.round((clipT + N) / o.fps * 1000),
        transcript: turns, text: turns.map((t) => t.text).join(' '),
      };
      segsOut.push(rec);
      clipT += N;
      // 動きの区間：組み込みの効果・部品（anim）と注目の演出（{mark}）の終わりのうち遅いほう
      const motion = s.motion ?? s.anim;
      const nA = Math.min(Math.ceil(motion * o.fps - 1e-6), N);
      const tmp = fs.mkdtempSync(path.join(tmpRoot, `${clip}-`));
      const a0 = layout.frameSample(starts[n]), a1 = layout.frameSample(starts[n + 1]);
      const audioHash = sliceHash(a0, a1);   // このクリップの音声そのもの（前後の段階の余韻・背景の音楽も入る）
      const per = inputs.per[n];
      const input = sha(globalHash, audioHash, JSON.stringify({
        slides: inputs.ok ? per.deps.map((j) => slideHash[j]) : null, data: per.data, key: s.key, i: s.i, k: s.k,
        dur: s.dur, lead: s.lead, anim: s.anim, motion, frames: N, nA, fps: o.fps, scale: o.scale, captions: o.captions }));
      rec.input = input;
      if (onlyKeys && !onlyKeys.has(s.key)) { fs.rmSync(tmp, { recursive: true, force: true }); continue; }

      const final = path.join(tmp, 'final.png');
      const finalBuf = await shot(s.i, s.k, Infinity, final);
      let midBuf = Buffer.alloc(0);
      if (nA > 0) midBuf = await shot(s.i, s.k, Math.floor(nA / 2) / o.fps, path.join(tmp, 'mid.png'));
      // 注意（--only とキャッシュ）：下の画素のハッシュは、撮る順番で SVG のアンチエイリアスが数画素変わることがある（Chrome のラスタの履歴）。
      // そのため --only で一部だけ撮ると、変わっていないクリップも作り直しになることがある。作り直しは害がない。
      // タイムラインの順に全部書き出せば、まったく同じ絵になる（再現する）
      // 画素も念のため入れる（入力のハッシュに入らないもの、たとえばフォントの違いを拾う）
      const hash = sha(input, finalBuf, midBuf);
      const mp4 = path.join(outDir, `${clip}.mp4`), png = path.join(outDir, `${clip}.png`);
      const prev = cache.clips[clip];
      if (!o.force && prev && prev.hash === hash && prev.key === s.key && fs.existsSync(mp4) && fs.existsSync(png)) {
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
      const pcm = path.join(tmp, 'audio.f32');
      fs.writeFileSync(pcm, interleave(track, a0, a1));
      encodeClip({ frames, final, pcm, N, fps: o.fps, out: mp4 });
      fs.copyFileSync(final, png);
      cache.clips[clip] = { key: s.key, input, hash };
      saveCache();
      fs.rmSync(tmp, { recursive: true, force: true });
      made++;
      console.log(`  [${n + 1}/${tl.length}] ${s.key}: ${s.dur.toFixed(2)} s（動き ${nA} コマ${s.audio ? '、音声あり' : ''}）→ ${clip}.mp4`);
    }
    // 段階の数が減ったときの古いクリップは消す（連番がずれないように）
    for (const f of fs.readdirSync(outDir)) {
      const m = f.match(/^clip_(\d{4})\.(mp4|png)$/);
      if (m && +m[1] >= tl.length) { fs.rmSync(path.join(outDir, f)); delete cache.clips[`clip_${m[1]}`]; }
    }
    for (const c of Object.keys(cache.clips)) if (!/^clip_\d{4}$/.test(c) || +c.slice(5) >= tl.length) delete cache.clips[c];
    saveCache();
    // 鮮度：今の入力で作ったクリップが揃っているか
    const stale = segsOut.filter((r) => {
      const c = cache.clips[r.clip.replace(/\.mp4$/, '')];
      return !c || c.input !== r.input || c.key !== r.key || !fs.existsSync(path.join(outDir, r.clip)) || !fs.existsSync(path.join(outDir, r.still));
    }).map((r) => r.key);
    const meta = { source: src, sourceHash: sha(htmlText), fps: o.fps, sampleRate: VIDEO_SR, music: o.music ? path.basename(o.music) : null, scale: o.scale, width: Math.round(W * o.scale), height: Math.round(H * o.scale),
      duration: +total.toFixed(3), clipDuration: +(clipT / o.fps).toFixed(6), complete: stale.length === 0, stale, segments: segsOut };
    fs.writeFileSync(path.join(outDir, 'timeline.out.json'), JSON.stringify(meta, null, 1));
    console.log(`完了: 新規 ${made} / キャッシュ ${skipped} → ${outDir}`);
    if (stale.length) {
      console.error(`  ✗ 今の入力と合わない・無いクリップが ${stale.length} 本（timeline.out.json は不完全）: ${stale.join(', ')}`);
      console.error(`    書き出し直す: node render/render.mjs ${o.src} --out ${o.out} --only ${stale.join(',')}（または --only なし）`);
      if (o.full) console.error('  ✗ --full: 古いクリップがあるので繋がない');
      process.exitCode = 2;
    }

    if (o.full && !stale.length) {
      const clips = segsOut.map((s) => path.join(outDir, s.clip));
      const missing = clips.filter((f) => !fs.existsSync(f));
      if (missing.length) throw new Error(`--full: クリップが足りない（${missing.length} 本）。--only なしで書き出してから`);
      joinClips(segsOut.map((s) => ({ file: path.join(outDir, s.clip), frames: s.frames })), path.join(outDir, 'full.mp4'), tmpRoot, track, 0, layout.total, o.fps);
      console.log(`  full.mp4: ${(+probe(path.join(outDir, 'full.mp4')).format.duration).toFixed(2)} s（timeline ${total.toFixed(2)} s）`);
      // 章ごと（連続する同じ chapter をまとめる）
      const groups = [];
      for (const s of segsOut) {
        if (!groups.length || groups.at(-1).chapter !== s.chapter) groups.push({ chapter: s.chapter, clips: [], f0: starts[s.index], f1: starts[s.index] });
        groups.at(-1).clips.push(path.join(outDir, s.clip));
        groups.at(-1).frames = (groups.at(-1).frames || []).concat(s.frames);
        groups.at(-1).f1 = starts[s.index + 1];
      }
      if (groups.length > 1) {
        groups.forEach((g, j) => {
          const name = `chapter_${String(j + 1).padStart(2, '0')}.mp4`;
          joinClips(g.clips.map((file, j) => ({ file, frames: g.frames[j] })), path.join(outDir, name), tmpRoot, track, layout.frameSample(g.f0), layout.frameSample(g.f1), o.fps);
          console.log(`  ${name}: ${g.chapter || '（章の前）'} ${g.clips.length} ステップ`);
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

main().catch((e) => { console.error(e.clean ? e.message : e.stack || e.message); process.exit(1); });
