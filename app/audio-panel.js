// 音声の板（編集アプリの信頼する横の板 #dev-side の中。プレビューの外）：段階ごとに、今の音声を聞く・録音する・ファイルから取り込む・
// ブラウザの TTS で作り直す。作った音声（録音・取り込み・TTS）はすぐにその段階の音声にし、前の音声は「前に戻す」で戻せる（#45）。
// 声を選ぶ欄（voice.json。見本の短い音声を鳴らせる）、読む原稿の欄（原稿の長さに合わせて伸び、大きさを変えられる）
//
// 守ること（SECURITY.md）：マイクと TTS はこのページ（信頼する編集の画面）だけで使う。プレビュー（sandbox の iframe）からは音声も
// 頼みも受け取らない（どの段階を見せるかは編集の画面の位置 ui.pos() から決め、デッキの知らせで板の中身を替えるのは録音していないときだけ）。
// 読み書きは作業場所（workspace.js）だけ：audio/<file>.mp3 と audio/manifest.json（書き換える前に .cache/edits/ に控え）。
// 読む大きさには上限がある（manifest・口述原稿は READ_LIMITS、音声は AUDIO_LIMITS.fileBytes）。
// 後処理（モノラル・44.1 kHz・無音を削る・-20 LUFS）は kit/core/audio-core.mjs（tts/core.py と同じ数）、MP3 は kit/core/mp3.mjs（LAME）。
// 作った音声はすぐに作業場所に書く（前の記録は段階ごとにメモリの上に積み、「前に戻す」でその記録を manifest に戻す。音声のファイルは消さない）。
// 書けなかったとき（読むだけ・権利の確認を断った）だけ、取り直し（take）として残し「この音声を使う」で書ける。
// 持ち運べる 1 ファイルでは作業場所はメモリの上なので、書いた後に「保存」で段 A（kit/core/tier-a.mjs）の保存になる。
// 声の選択は作業フォルダでは voice.json に書き、1 ファイルではこの画面の間だけ覚える（voice.json を変えると組み直しの保存になるため）
//
// WebGPU のないとき：Colab で作る（o.colab。tts-job.json を書き出し、公式のノートブックが返す zip を取り込む。kit/core/colab-core.mjs・docs/editor.md）。
//   取り込みは、inputHash が今の口述原稿と合う段階だけ cue つき（sync auto）で使い、合わない段階は「印付き」に出す（自動では使わない）
//
//   const panel = createAudioPanel({ui, ws(), generation(), lang, deckLang(), beforeOpen?(), beforeWrite(kind), afterWrite(), tts?, yomi?: {terms, sha256}, loadMp3?(), wait?() → stop(), sampleBase?,
//     oldNorm?: {title, note, go(n), done(n)}（app/i18n.js の T.oldNorm。前処理の版が古い TTS の段階の一覧）,
//     colab?: {t（app/i18n.js の T.colab）, docId() → 文字列 | null, version, confirm(題, 本文, 実行の名前) → boolean, open(url)?}})
//   panel.toggle(on?) / panel.reset() / panel.onPos(pos) / panel.isOpen() / panel.isBusy() / panel.state()
import { processTake, joinParts, takeEntry, setManifestEntry, takeFileName, audioState, decodeWav, encodeWav, AUDIO_LIMITS, PROCESSING } from '../kit/core/audio-core.mjs';
import { encodeMp3 } from '../kit/core/mp3.mjs';
import { MP3 } from '../kit/core/audio-core.mjs';
import { inputHash, sha256Hex } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { narrationLang } from '../kit/core/narration-lint.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { readFileBounded } from './bounded-read.js';
import { applyYomi } from '../kit/core/yomi.mjs';
import { TEXT_NORMALIZE, normalizeTtsText, textNormalizeOutdated } from '../kit/core/tts-normalize.mjs';
import { buildJob, planImport, decodeStepAudio, readColabZip, colabUrl, COLAB_LIMITS } from '../kit/core/colab-core.mjs';
import { IRODORI_VOICES, KOKORO_VOICES, KOKORO_MAIN, DEFAULT_VOICES, VOICE_SAMPLES, bundledVoice } from '../lab/tts-voices.mjs';

const STR = {
  ja: {
    title: '音声', close: '閉じる', step: '段階 ', slide: (n, t) => 'スライド ' + n + '：' + t, none: 'この段階の音声はまだありません',
    cur: '今の音声', fresh: '最新', stale: '古い', staleT: '口述原稿が、この音声を作った後に変わっています（または、どの原稿から作ったか分かりません）。音声は消さずに残します',
    kind: { recorded: '録音', tts: 'TTS', imported: '取り込み' }, sec: (s) => s.toFixed(2) + ' 秒',
    rec: '● 録音', stop: '■ 止める', reRec: '● 録り直す', recording: '録音中', processing: '整えています…', micNo: 'マイクを使えません：', micHint: 'ブラウザのアドレス欄の左でマイクを許可してください',
    importBtn: 'ファイルから取り込む…', tts: 'TTS で作り直す', ttsNo: 'この環境ではブラウザの TTS を使えません：',
    takes: 'まだ使っていない音声', use: 'この音声を使う', del: '捨てる', notUsed: '書き込めなかったので、まだこの段階には使っていません。下の「この音声を使う」で使えます',
    using: '書き込んでいます…', used: (f) => 'この段階の音声にしました（audio/' + f + '）。前の音声には「前に戻す」で戻せます', usedPortable: 'この段階の音声にしました。ファイルに残すには「保存」を押してください（前の音声には「前に戻す」で戻せます）',
    revert: '↶ 前に戻す', revertT: (n) => '一つ前の音声に戻します（音声のファイルは消していません。あと ' + n + ' 回戻せます）', reverted: '前の音声に戻しました', revertedNone: '前は音声がなかったので、この段階の音声を外しました',
    revertGone: (f) => '前の音声のファイル（audio/' + f + '）が見つからないので戻せません',
    voice: '声', role: { expert: 'Expert', novice: 'Novice' }, one: '話す人', sample: '▶ 見本', sampleStop: '■ 止める', sampleT: (n) => '「' + n + '」の短い見本を鳴らす（事前に作った音声。モデルは読み込みません）', noSample: 'この声には見本がありません', sampleFail: '見本を鳴らせません（配信版のエディタで開いてください）',
    more: 'ほかの声', voiceSaved: (r, n) => r + ' の声を「' + n + '」にしました（voice.json）。次に TTS で作るときから使います', voiceMem: (r, n) => r + ' の声を「' + n + '」にしました。1 ファイルでは、この画面を開いている間だけ覚えます（作った音声の記録には声の名前が残ります）',
    voiceUnknown: (r, n, fb) => 'voice.json の ' + r + ' の声「' + n + '」は、ブラウザの TTS に入っていません。TTS で作るときは既定の声「' + fb + '」を使います（上の欄で選び直せます）',
    noSeg: 'この段階の口述原稿がありません（先に口述原稿を書いてください）', script: '読む原稿', scriptT: '右下の角を引くと大きさを変えられます', cueNote: '録音と取り込みには {cue} の区切りの時刻がないので、区切りに合わせた動きは時間で進みます（sync: none）',
    durOverride: (d) => 'timeline.json の dur（' + d + ' 秒）がこの段階の長さを決めています。長い音声は途中で切れます',
    level: '入力の大きさ', tooLong: (s) => s + ' 秒を超えたので止めました', empty: '音がありません（無音を削ると何も残りませんでした）', fail: 'できませんでした：',
    prov: { recorded: '録音', imported: '取り込み', tts: (r) => 'TTS ' + r.engine + ' · ' + r.model + (r.voice && Object.keys(r.voice).length ? ' · 声 ' + Object.values(r.voice).join('/') : '') + (r.seed != null ? ' · seed ' + r.seed : '') },
    made: (kind, d) => kind + ' · ' + d, gain: (g) => '音量の調整 ' + (g >= 0 ? '+' : '') + g.toFixed(1) + ' dB', locked: '録音・合成している間、スライドはクリックを受けません',
    following: (k) => '録音が終わるまで、表示中の段階（' + k + '）には切り替えません',
    other: (k) => 'スライドで表示中の段階（' + k + '）とは別の段階です。スライドを動かすと切り替わります',
    wavNote: '（MP3 のエンコーダを読み込めないので WAV で保存しました。1 ファイル版には MP3 のエンコーダが入っていません）',
  },
  en: {
    title: 'Audio', close: 'Close', step: 'Step ', slide: (n, t) => 'Slide ' + n + ': ' + t, none: 'No audio for this step yet',
    cur: 'Current audio', fresh: 'up to date', stale: 'stale', staleT: 'The narration changed after this audio was made (or it is unknown which narration it was made from). The audio is kept',
    kind: { recorded: 'recorded', tts: 'TTS', imported: 'imported' }, sec: (s) => s.toFixed(2) + ' s',
    rec: '● Record', stop: '■ Stop', reRec: '● Record again', recording: 'Recording', processing: 'Processing…', micNo: 'Cannot use the microphone: ', micHint: 'Allow the microphone from the left of the address bar',
    importBtn: 'Import a file…', tts: 'Regenerate with TTS', ttsNo: 'Browser TTS is not available here: ',
    takes: 'Audio not used yet', use: 'Use this take', del: 'Discard', notUsed: 'It could not be written, so this step does not use it yet. Use it with “Use this take” below',
    using: 'Writing…', used: (f) => 'This step now uses it (audio/' + f + '). “Revert to previous” brings back the previous audio', usedPortable: 'This step now uses it. Press Save to keep it in the file (“Revert to previous” brings back the previous audio)',
    revert: '↶ Revert to previous', revertT: (n) => 'Go back to the previous audio (no audio file was deleted; ' + n + ' step' + (n === 1 ? '' : 's') + ' back available)', reverted: 'Reverted to the previous audio', revertedNone: 'There was no audio before, so the step has no audio now',
    revertGone: (f) => 'Cannot revert: the previous audio file (audio/' + f + ') is missing',
    voice: 'Voice', role: { expert: 'Expert', novice: 'Novice' }, one: 'Speaker', sample: '▶ Sample', sampleStop: '■ Stop', sampleT: (n) => 'Play a short sample of “' + n + '” (pre-made audio; no model is loaded)', noSample: 'No sample for this voice', sampleFail: 'Cannot play the sample (open the hosted editor)',
    more: 'More voices', voiceSaved: (r, n) => r + ' voice set to “' + n + '” (voice.json). Used the next time you make TTS', voiceMem: (r, n) => r + ' voice set to “' + n + '”. In a single file this is kept only while this page is open (the audio records keep the voice name)',
    voiceUnknown: (r, n, fb) => 'The ' + r + ' voice “' + n + '” in voice.json is not part of the browser TTS. TTS uses the default voice “' + fb + '” instead (choose another above)',
    noSeg: 'This step has no narration (write the narration first)', script: 'Script', scriptT: 'Drag the bottom-right corner to resize', cueNote: 'Recorded and imported audio have no {cue} times, so cue-driven motion advances by time (sync: none)',
    durOverride: (d) => 'timeline.json fixes this step to ' + d + ' s (dur): longer audio is cut',
    level: 'Input level', tooLong: (s) => 'Stopped after ' + s + ' s', empty: 'No sound (nothing is left after trimming silence)', fail: 'Failed: ',
    prov: { recorded: 'recorded', imported: 'imported', tts: (r) => 'TTS ' + r.engine + ' · ' + r.model + (r.voice && Object.keys(r.voice).length ? ' · voice ' + Object.values(r.voice).join('/') : '') + (r.seed != null ? ' · seed ' + r.seed : '') },
    made: (kind, d) => kind + ' · ' + d, gain: (g) => 'level adjusted ' + (g >= 0 ? '+' : '') + g.toFixed(1) + ' dB', locked: 'The slides do not take clicks while recording or generating',
    following: (k) => 'Stays on this step until recording ends (showing ' + k + ')',
    other: (k) => 'This is not the step shown on the slide (' + k + '). Move the slides to switch',
    wavNote: ' (saved as WAV: the MP3 encoder could not be loaded; the single-file editor has no MP3 encoder)',
  },
};

const CSS = [
  '#dev-audio{padding:12px 14px}',
  '#dev-audio .dv-sub{color:#4b5363;font-size:12.5px;margin:-2px 0 8px}',
  '#dev-audio .dv-cur{background:#f4f6fb;border:1px solid #e0e5f0;border-radius:8px;padding:8px 10px;margin-bottom:10px}',
  '#dev-audio .dv-cur .dv-row,#dev-audio .dv-take .dv-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '#dev-audio audio{width:100%;height:32px;margin-top:6px;display:block}',
  '#dev-audio .dv-badge{display:inline-block;border-radius:999px;padding:0 8px;font-size:11.5px;font-weight:700;line-height:18px}',
  '#dev-audio .dv-badge.dv-stale{background:#f59e0b;color:#231400}#dev-audio .dv-badge.dv-fresh{background:#dcfce7;color:#14532d}',
  '#dev-audio .dv-badge.dv-kind{background:#e0e7ff;color:#1e3a8a}',
  '#dev-audio .dv-prov{font-size:11.5px;color:#6b7385;margin-top:2px;word-break:break-word}',
  // 読む原稿：録音しながら読めるように、原稿の長さに合わせて伸びる（板の高さの半分ほどまで）。右下の角で大きさを変えられる
  '#dev-audio .dv-script{font-size:14.5px;line-height:1.65;color:#1f2937;background:#fff;border:1px dashed #cfd4de;border-radius:6px;padding:8px 10px;margin:0 0 10px;min-height:3.5em;max-height:min(46vh,30em);overflow:auto;resize:vertical}',
  '#dev-audio.dv-recording .dv-script{max-height:min(62vh,40em);border-style:solid;border-color:#dc2626}',
  '#dev-audio .dv-script p{margin:0 0 6px}#dev-audio .dv-script .dv-role{display:inline-block;font-size:11px;font-weight:700;line-height:16px;border-radius:4px;padding:0 5px;margin-right:6px;vertical-align:1px;background:#e0e7ff;color:#1e3a8a}',
  '#dev-audio .dv-script .dv-role.dv-novice{background:#fef3c7;color:#7a4b00}',
  '#dev-audio .dv-voices{display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin:2px 0 8px;font-size:12.5px}',
  '#dev-audio .dv-voices select{min-width:0;font:inherit;padding:2px 4px}#dev-audio .dv-voices .dv-vr{color:#4b5363}',
  '#dev-audio .dv-cur .dv-revert{margin-left:auto}',
  '#dev-audio .dv-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}',
  '#dev-audio button.dv-rec{border-color:#dc2626;color:#b91c1c}#dev-audio button.dv-rec.dv-on{background:#dc2626;color:#fff}',
  '#dev-audio .dv-meter{display:flex;align-items:center;gap:8px;margin:2px 0 8px;font-size:12px;color:#4b5363}',
  '#dev-audio .dv-meter .dv-bar{flex:1;height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;position:relative}',
  '#dev-audio .dv-meter .dv-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#16a34a 0%,#16a34a 70%,#f59e0b 85%,#dc2626 100%)}',
  '#dev-audio .dv-meter .dv-t{font-variant-numeric:tabular-nums;min-width:4.5em;text-align:right}',
  '#dev-audio .dv-h{font-weight:700;font-size:12.5px;margin:10px 0 4px}',
  '#dev-audio .dv-take{border:1px solid #e0e4ec;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#fff}',
  '#dev-audio .dv-take.dv-sel{border-color:#2563eb;box-shadow:0 0 0 1px #2563eb}',
  '#dev-audio .dv-take .dv-n{font-weight:700;margin-right:2px}#dev-audio .dv-take .dv-sp{flex:1}',
  '#dev-audio .dv-note{font-size:11.5px;color:#6b7385;margin:4px 0}',
  '#dev-audio .dv-warn{font-size:12px;color:#7a4b00;background:#fff7e6;border:1px solid #f5d38a;border-radius:6px;padding:4px 8px;margin:6px 0}',
  '#dev-audio .dv-prog{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:4px 0}#dev-audio .dv-prog i{display:block;height:100%;width:0;background:#2563eb}',
  '#dev-audio .dv-empty{color:#8a91a1;font-size:12.5px;padding:4px 0}',
  '#dev-audio .dv-colab{border:1px solid #e0e4ec;border-radius:8px;padding:6px 8px;margin:8px 0;background:#fafbfe}#dev-audio .dv-colab summary{cursor:pointer;font-weight:700;font-size:12.5px}',
  '#dev-audio .dv-colab .dv-link{font-size:13px}#dev-audio .dv-marked{border-color:#f5d38a}',
  '#dev-audio .dv-old{border:1px solid #f5d38a;border-radius:8px;padding:6px 8px;margin:8px 0;background:#fffaf0}#dev-audio .dv-oldrow{display:flex;gap:6px;align-items:center;font-size:12.5px;margin:2px 0}',
  '#dev-audio .dv-play{display:flex;align-items:center;gap:8px;margin-top:4px}#dev-audio .dv-play audio{flex:1;min-width:0;margin:0}#dev-audio .dv-play button{flex:none}',
  // 録音している間だけ（プレビューが inert のとき）知らせる
  '#dev-audio .dev-lock{display:none}#dev-side.dv-locked #dev-audio .dev-lock{display:block}',
].join('\n');

const plain = (s) => String(s || '').replace(/\{([^{}|]*)\|[^{}]*\}/g, '$1').replace(/\{[^{}]*\}/g, '');
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// manifest の file：audio/ の下の相対パスだけ（.. や先頭の / は使わない）
const safeFile = (f) => typeof f === 'string' && f.length <= 200 && /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(f) && !f.split('/').some((x) => x === '.' || x === '..');
const MIME_OF = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac' };

export function createAudioPanel(o) {
  const ui = o.ui, h = ui.h, doc = ui.side.ownerDocument, win = doc.defaultView;
  const L = o.lang === 'en' ? STR.en : STR.ja;
  if (!doc.getElementById('dev-audio-style')) { const st = doc.createElement('style'); st.id = 'dev-audio-style'; st.textContent = CSS; doc.head.appendChild(st); }
  let open = false, card = null, view = null, rec = null, busyMsg = null, seq = 0;
  // 段階ごとの、まだ使っていない取り直し（書けなかったときだけ。メモリの上）：key → [{id, kind, pcm, sr, dur, cues, recipe, inputHash, url, gainDb, at}]
  const takes = new Map();
  // 段階ごとの前の記録（「前に戻す」。新しいものが後ろ）：key → [manifest の記録 | null（音声がなかった）]。作業場所を替えると捨てる
  const history = new Map();
  // 1 ファイルの声の選択（この画面の間だけ）：role → 名前
  const voiceMem = {};
  // 見本を鳴らす <audio>（1 つ）
  let sample = null;
  let nextId = 1;
  const urls = new Set();
  const blobUrl = (bytes, type) => { const u = URL.createObjectURL(new Blob([bytes], { type })); urls.add(u); return u; };
  // 捨てる URL は、それを使う要素を板から外した後に解く（先に解くと、まだ載っている <audio> が読みに行って失敗する）
  let retired = [];
  const freeUrl = (u) => { if (u && urls.has(u)) retired.push(u); };
  const flushUrls = () => { for (const u of retired) { if (urls.has(u)) { URL.revokeObjectURL(u); urls.delete(u); } } retired = []; };

  // ---------------------------------------------------------------- 作業場所から読む（上限つき）
  async function readJson(ws, rel) {
    const t = await ws.readText(rel, { max: READ_LIMITS.json });
    if (t === null) return { text: null, value: null };
    try { return { text: t, value: JSON.parse(t) }; } catch { return { text: t, value: null, bad: true }; }
  }
  async function loadStep(key) {
    const ws = o.ws(), g = o.generation();
    const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
    const segs = parseNarration(narr || '');
    const seg = segs.find((s) => `${s.slideKey}:${s.stepKey}` === key) || null;
    const man = await readJson(ws, 'audio/manifest.json');
    const segments = man.value && isObj(man.value.segments) ? man.value.segments : {};
    const entry = own(segments, key) && isObj(segments[key]) ? segments[key] : null;
    let state = null, url = null, err = null;
    if (entry) {
      let sj = null;
      if (!own(entry, 'inputHash') && typeof entry.digest === 'string' && /^[0-9a-f]{1,64}$/.test(entry.digest)) sj = (await readJson(ws, `audio/seg_${entry.digest}.json`)).value;
      state = await audioState(entry, seg, sj);
      if (safeFile(entry.file)) {
        try {
          const bytes = await ws.readBytes('audio/' + entry.file, { max: AUDIO_LIMITS.fileBytes });
          url = blobUrl(bytes, MIME_OF[(entry.file.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase()] || 'audio/mpeg');
        } catch (e) { err = String(e.message || e); }
      }
    }
    const tl = (await readJson(ws, 'timeline.json')).value;
    const override = isObj(tl) && isObj(tl[key]) && typeof tl[key].dur === 'number' ? tl[key].dur : null;
    let voice = {};
    const vj = (await readJson(ws, 'voice.json')).value;
    if (isObj(vj)) voice = vj;
    // デッキで話す役（掛け合いなら Expert と Novice）
    const roles = new Set(['expert']);
    for (const x of segs) for (const t of x.turns) if (t.role === 'novice') roles.add('novice');
    // Colab に書き出す段階（音声のない段階と古い段階）。inputHash のない前の記録は、古いかどうか分からないので数えない
    const need = [];
    if (o.colab) for (const x of segs) {
      const k = `${x.slideKey}:${x.stepKey}`, e = own(segments, k) && isObj(segments[k]) ? segments[k] : null;
      if (!e || (await audioState(e, x, null)) === 'stale') need.push(k);
    }
    // 前処理の版が古い（または無い）TTS の段階（stale ではない。音声は鳴らし続け、作り直しは利用者が選ぶ。format spec §5.4）。録音・取り込みは入れない
    const oldNorm = [];
    for (const x of segs) {
      const k = `${x.slideKey}:${x.stepKey}`, e = own(segments, k) && isObj(segments[k]) ? segments[k] : null;
      if (e && (e.kind === 'tts' || (e.kind === undefined && (isObj(e.recipe) || typeof e.engine === 'string'))) && !(isObj(e.recipe) && e.recipe.engine === 'dry-run') && textNormalizeOutdated(e.recipe)) oldNorm.push(k);
    }
    return { key, g, seg, segs, entry, state, url, err, override, voice, roles, need, oldNorm, manText: man.text };
  }

  // ---------------------------------------------------------------- 描く
  function close() {
    stopRecording(true);
    stopSample();
    if (card) { card.remove(); card = null; }
    if (view && view.url) freeUrl(view.url);
    flushUrls();
    view = null;
    ui.refresh();
  }
  async function toggle(on) {
    on = on === undefined ? !open : !!on;
    if (on === open) return open;
    if (on && o.beforeOpen && !(await o.beforeOpen())) return false;
    open = on;
    if (!open) close(); else follow(true);
    ui.refresh();
    return open;
  }
  function follow(force) {
    if (!open) return;
    const p = ui.pos();
    if (!p) { draw(null); return; }
    if (rec || busyMsg) {   // 録音・整えている間は段階を替えない
      if (view && p.key !== view.key) { const w = card && card.querySelector('.dv-follow'); if (w) { w.hidden = false; w.textContent = L.following(p.key); } }
      return;
    }
    if (!force && view && view.key === p.key) return;
    show(p.key, p.i);
  }
  // 段階 key（スライドの番号 i）を読み直して描く
  function show(key, i) {
    const my = ++seq;
    if (view && view.url) freeUrl(view.url);
    view = { key, i, loading: true };
    draw(view);
    loadStep(key).then((v) => {
      if (my !== seq || !open) { if (v.url) freeUrl(v.url); return; }
      view = { ...v, i };
      draw(view);
    }, (e) => { if (my !== seq) return; view = { key, i, error: String(e.message || e) }; draw(view); });
  }
  function draw(v) {
    const old = card;
    card = h('div', { id: 'dev-audio', cls: 'edit-ui dev-card' + (rec ? ' dv-recording' : ''), role: 'region', 'aria-label': L.title });
    const sk = v ? v.key.slice(v.key.lastIndexOf(':') + 1) : '';
    card.appendChild(h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.title }), v ? h('span', { cls: 'dv-m', text: L.step + sk }) : null, h('span', { cls: 'dv-sp' }),
      h('button', { cls: 'dv-ghost', text: '✕', title: L.close, 'aria-label': L.close, on: { click: () => toggle(false) } })]));
    if (v) {
      const s = ui.slide(v.i);
      card.appendChild(h('div', { cls: 'dv-sub', text: L.slide(v.i + 1, String((s && (s.heading || s.title)) || v.key.slice(0, v.key.lastIndexOf(':'))).replace(/\s+/g, ' ').trim()) }));
    }
    const follow = h('div', { cls: 'dv-warn dv-follow', hidden: '' }); card.appendChild(follow);
    const at = ui.pos();
    if (v && at && at.key !== v.key) { follow.hidden = false; follow.textContent = rec || busyMsg ? L.following(at.key) : L.other(at.key); }
    if (!v || v.loading) { card.appendChild(h('div', { cls: 'dv-empty', text: '…' })); return mount(old); }
    if (v.error) { card.appendChild(h('div', { cls: 'dev-msg dv-err', text: v.error })); return mount(old); }
    // 今の音声（前の記録があれば「前に戻す」）
    const back = history.get(v.key) || [];
    const revertBtn = back.length ? h('button', { cls: 'dv-revert', id: 'dev-audio-revert', text: L.revert, title: L.revertT(back.length), on: { click: () => revert(v.key) } }) : null;
    if (revertBtn && (busyMsg || rec)) revertBtn.disabled = true;
    const cur = h('div', { cls: 'dv-cur', id: 'dev-audio-cur' });
    if (v.entry) {
      const kind = ['recorded', 'tts', 'imported'].includes(v.entry.kind) ? v.entry.kind : 'tts';
      cur.appendChild(h('div', { cls: 'dv-row' }, [h('b', { text: L.cur }), h('span', { cls: 'dv-badge dv-kind', text: L.kind[kind] }),
        typeof v.entry.dur === 'number' ? h('span', { text: L.sec(v.entry.dur) }) : null,
        v.state === 'stale' ? h('span', { cls: 'dv-badge dv-stale', id: 'dev-audio-stale', text: L.stale, title: L.staleT }) : v.state === 'fresh' ? h('span', { cls: 'dv-badge dv-fresh', text: L.fresh }) : null, revertBtn]));
      const r = isObj(v.entry.recipe) ? v.entry.recipe : null;
      cur.appendChild(h('div', { cls: 'dv-prov', text: kind === 'tts' ? (r ? L.prov.tts(r) : 'TTS ' + (v.entry.engine || '')) : L.prov[kind] }));
      if (v.state === 'stale') cur.appendChild(h('div', { cls: 'dv-note', text: L.staleT }));
      if (v.url) { const a = h('audio', { controls: '', preload: 'metadata', src: v.url, id: 'dev-audio-player' }); cur.appendChild(a); }
      else if (v.err) cur.appendChild(h('div', { cls: 'dev-msg dv-err', text: v.err }));
    } else cur.appendChild(h('div', { cls: 'dv-row' }, [h('span', { cls: 'dv-empty', text: L.none }), revertBtn]));
    card.appendChild(cur);
    if (v.override !== null) card.appendChild(h('div', { cls: 'dv-warn', text: L.durOverride(v.override) }));
    // 読む原稿（掛け合いなら両方の役に印）
    if (v.seg) {
      const two = v.roles && v.roles.has('novice');
      card.appendChild(h('div', { cls: 'dv-h', text: L.script }));
      card.appendChild(h('div', { cls: 'dv-script', id: 'dev-audio-script', title: L.scriptT }, v.seg.turns.map((t) => h('p', {}, [two ? h('span', { cls: 'dv-role' + (t.role === 'novice' ? ' dv-novice' : ''), text: L.role[t.role === 'novice' ? 'novice' : 'expert'] }) : null, plain(t.display || t.raw)]))));
    } else card.appendChild(h('div', { cls: 'dv-warn', text: L.noSeg }));
    // 道具
    const list = takes.get(v.key) || [];
    const recBtn = h('button', { cls: 'dv-rec' + (rec ? ' dv-on' : ''), id: 'dev-audio-rec', text: rec ? L.stop : v.entry && v.entry.kind === 'recorded' ? L.reRec : L.rec, on: { click: () => (rec ? stopRecording() : startRecording()) } });
    const impBtn = h('button', { id: 'dev-audio-import', text: L.importBtn, on: { click: importFile } });
    const ttsInfo = o.tts ? o.tts.info(ttsLang(v)) : null;
    const ttsBtn = h('button', { id: 'dev-audio-tts', text: L.tts, title: ttsInfo ? ttsInfo.label : '', on: { click: () => regenerate() } });
    if (!v.seg) { recBtn.disabled = !rec; impBtn.disabled = true; ttsBtn.disabled = true; }
    if (busyMsg) { recBtn.disabled = !rec; impBtn.disabled = true; ttsBtn.disabled = true; }
    if (!o.tts || (ttsInfo && !ttsInfo.ok)) ttsBtn.disabled = true;
    card.appendChild(h('div', { cls: 'dv-tools' }, [recBtn, impBtn, ttsBtn]));
    if (o.tts && ttsInfo) card.appendChild(h('div', { cls: 'dv-note', id: 'dev-audio-ttsinfo', text: ttsInfo.ok ? ttsInfo.label : ttsInfo.hint || L.ttsNo + ttsInfo.reason }));
    drawOldNorm(v, !!(o.tts && ttsInfo && ttsInfo.ok));
    if (o.colab) drawColab(v, !!(o.tts && ttsInfo && !ttsInfo.ok));
    // 声を選ぶ欄
    drawVoices(v);
    // 録音の大きさ
    const meter = h('div', { cls: 'dv-meter', id: 'dev-audio-meter', hidden: rec ? null : '' }, [h('span', { text: L.level }), h('span', { cls: 'dv-bar' }, [h('i')]), h('span', { cls: 'dv-t', text: '0.0 s' })]);
    if (!rec) meter.setAttribute('hidden', ''); else meter.removeAttribute('hidden');
    card.appendChild(meter);
    const prog = h('div', { cls: 'dv-prog', id: 'dev-audio-prog', hidden: '' }, [h('i')]);
    card.appendChild(prog);
    const msg = h('div', { cls: 'dev-msg', id: 'dev-audio-msg' });
    if (busyMsg) { msg.className = 'dev-msg dv-ok'; msg.textContent = busyMsg; }
    card.appendChild(msg);
    // まだ使っていない取り直し（書けなかったときだけ）
    if (list.length) {
      card.appendChild(h('div', { cls: 'dv-h', text: L.takes }));
      const box = h('div', { id: 'dev-audio-takes' });
      list.forEach((t, j) => {
        const row = h('div', { cls: 'dv-take', 'data-id': String(t.id), 'data-kind': t.kind }, [
          h('div', { cls: 'dv-row' }, [h('span', { cls: 'dv-n', text: '#' + (j + 1) }), h('span', { cls: 'dv-badge dv-kind', text: L.kind[t.kind] }), h('span', { text: L.sec(t.dur) }),
            h('span', { cls: 'dv-sp' }), h('button', { cls: 'dv-ghost', text: L.del, on: { click: () => discard(v.key, t.id) } })]),
          h('div', { cls: 'dv-prov', text: t.kind === 'tts' && t.recipe ? L.prov.tts(t.recipe) : L.gain(t.gainDb) }),
          h('div', { cls: 'dv-play' }, [h('audio', { controls: '', preload: 'metadata', src: t.url }), h('button', { cls: 'dv-pri dv-use', text: L.use, on: { click: () => useTake(v.key, t.id) } })]),
        ]);
        if (busyMsg) for (const b of row.querySelectorAll('button')) b.disabled = true;
        box.appendChild(row);
      });
      card.appendChild(box);
    }
    if ((v.entry && v.entry.kind && v.entry.kind !== 'tts') || list.some((t) => t.kind !== 'tts') || (v.seg && v.seg.turns.some((t) => t.ttsParts.length > 1))) card.appendChild(h('div', { cls: 'dv-note', text: L.cueNote }));
    card.appendChild(h('div', { cls: 'dev-lock', text: L.locked }));
    mount(old);
  }
  // ---------------------------------------------------------------- 口述原稿の言語（TTS のエンジンと読み辞書はこれで決める）
  // voice.json の "lang" ＞ 発言の文字（kit/core/narration-lint.mjs の narrationLang）＞ デッキの <html lang>。
  // 日本語のスライドに英語の口述原稿なら Kokoro（英語）で読む（<html lang> だけで決めると英語の文を Irodori に渡してしまう）
  function ttsLang(v) {
    const texts = [];
    for (const x of (v && v.segs) || []) for (const t of x.turns) texts.push(plain(t.display || t.raw));
    return narrationLang({ voiceLang: v && v.voice ? v.voice.lang : undefined, deckLang: o.deckLang(), texts }).lang;
  }
  // ---------------------------------------------------------------- 声を選ぶ欄（1 人なら 1 つ、掛け合いなら役ごと）
  const engineOf = (v = view) => (/^ja\b/i.test(ttsLang(v)) ? 'irodori' : 'kokoro');
  // 役の声：1 ファイルの選択 > voice.json（ブラウザの TTS に入っている名前なら）> 既定。unknown：voice.json の入っていない名前
  function voiceOf(v, role) {
    const eng = engineOf(v), def = DEFAULT_VOICES[eng][role];
    if (own(voiceMem, role) && bundledVoice(eng, voiceMem[role])) return { name: bundledVoice(eng, voiceMem[role]), unknown: null };
    const raw = v && v.voice && typeof v.voice[role] === 'string' ? v.voice[role] : null;
    if (raw === null) return { name: def, unknown: null };
    const b = bundledVoice(eng, raw);
    return b ? { name: b, unknown: null } : { name: def, unknown: raw };
  }
  function drawVoices(v) {
    const eng = engineOf(v), roles = [...(v.roles || new Set(['expert']))].filter((r) => r === 'expert' || r === 'novice');
    const grid = h('div', { cls: 'dv-voices', id: 'dev-audio-voices' });
    const warns = [];
    for (const role of roles) {
      const cur = voiceOf(v, role);
      if (cur.unknown) warns.push(L.voiceUnknown(L.role[role], cur.unknown, cur.name));
      const sel = h('select', { 'data-role': role, 'aria-label': L.voice + ' (' + L.role[role] + ')' });
      const opt = (n) => { const e = h('option', { value: n, text: n }); if (n === cur.name) e.selected = true; return e; };
      if (eng === 'irodori') for (const n of IRODORI_VOICES) sel.appendChild(opt(n));
      else {
        for (const n of KOKORO_MAIN) sel.appendChild(opt(n));
        const g = h('optgroup', { label: L.more });
        for (const n of KOKORO_VOICES) if (!KOKORO_MAIN.includes(n)) g.appendChild(opt(n));
        sel.appendChild(g);
      }
      sel.addEventListener('change', () => setVoice(role, sel.value));
      const has = VOICE_SAMPLES.includes(cur.name);
      const playing = sample && sample.dataset.name === cur.name && sample.dataset.role === role && !sample.paused;
      const btn = h('button', { cls: 'dv-sample', 'data-role': role, text: playing ? L.sampleStop : L.sample, title: has ? L.sampleT(cur.name) : L.noSample, on: { click: () => playSample(role, sel.value) } });
      if (!has) btn.disabled = true;
      if (rec || busyMsg) sel.disabled = true;
      grid.append(h('span', { cls: 'dv-vr', text: roles.length > 1 ? L.role[role] : L.one }), sel, btn);
    }
    card.appendChild(h('div', { cls: 'dv-h', text: L.voice }));
    card.appendChild(grid);
    for (const w of warns) card.appendChild(h('div', { cls: 'dv-warn dv-voice-warn', text: w }));
  }
  function stopSample() { if (sample) { sample.pause(); sample.removeAttribute('src'); sample = null; } }
  function playSample(role, name) {
    const was = sample && sample.dataset.name === name && sample.dataset.role === role && !sample.paused;
    stopSample();
    if (was || !VOICE_SAMPLES.includes(name)) { if (view) draw(view); return; }
    const a = new win.Audio();
    a.dataset.name = name; a.dataset.role = role;
    a.src = new URL((typeof o.sampleBase === 'function' ? o.sampleBase() : o.sampleBase || 'lab/voices/samples/') + name + '.mp3', doc.baseURI).href;
    sample = a;
    const redraw = () => { if (sample === a && a.paused) sample = null; if (view) draw(view); };
    a.addEventListener('ended', redraw);
    a.addEventListener('error', () => { if (sample === a) sample = null; if (view) draw(view); say(L.sampleFail, true); });
    a.play().then(() => { if (view) draw(view); }, () => {});
  }
  async function setVoice(role, name) {
    if (!view || !bundledVoice(engineOf(), name)) return;
    const ws = o.ws(), g = o.generation(), key = view.key;
    const live = () => o.ws() === ws && o.generation() === g;
    stopSample();
    if (ws.kind === 'memory') { voiceMem[role] = name; draw(view); say(L.voiceMem(L.role[role], name)); return; }
    try {
      const vj = await readJson(ws, 'voice.json');
      if (vj.bad) throw new Error('voice.json is not JSON');
      const next = { ...(isObj(vj.value) ? vj.value : {}), [role]: name };
      if (!live()) return;
      if (vj.text !== null) await ws.backup('voice.json', { max: READ_LIMITS.json });
      if (!live()) return;
      await ws.writeText('voice.json', JSON.stringify(next, null, 2) + '\n', { live });
      if (view && view.key === key) view.voice = next;
      if (view) draw(view);
      say(L.voiceSaved(L.role[role], name));
    } catch (e) { say(L.fail + (e.message || e), true); }
  }
  function mount(old) {
    if (old && old.isConnected) old.replaceWith(card); else ui.side.appendChild(card);
    const live = new Set([...card.querySelectorAll('audio')].map((a) => a.getAttribute('src')));
    retired = retired.filter((u) => { if (live.has(u)) return true; if (urls.has(u)) { URL.revokeObjectURL(u); urls.delete(u); } return false; });
    ui.refresh();
  }
  const msgEl = () => card && card.querySelector('#dev-audio-msg');
  function say(text, bad) { const m = msgEl(); if (!m) return; m.className = 'dev-msg ' + (bad ? 'dv-err' : 'dv-ok'); m.textContent = text; }
  function setBusy(text) { busyMsg = text; if (view) draw(view); }

  // ---------------------------------------------------------------- 取り直しを足す
  async function addTake(key, take) {
    const list = takes.get(key) || [];
    take.id = nextId++;
    take.url = blobUrl(encodeWav(take.pcm, take.sr), 'audio/wav');   // 聞くための WAV（使うときに MP3 にする）
    list.push(take);
    takes.set(key, list);
    return take;
  }
  function discard(key, id) {
    const list = (takes.get(key) || []).filter((t) => { if (t.id === id) { freeUrl(t.url); return false; } return true; });
    if (list.length) takes.set(key, list); else takes.delete(key);
    if (view) draw(view);
  }
  // 段階の今の口述原稿の inputHash（取り直しを作ったときのもの。保存までに原稿が変われば、その取り直しは古いと分かる）
  async function currentHash(key) {
    const narr = await o.ws().readText('narration.md', { max: READ_LIMITS.narration });
    const seg = parseNarration(narr || '').find((s) => `${s.slideKey}:${s.stepKey}` === key);
    return seg ? { seg, hash: await inputHash(seg) } : { seg: null, hash: null };
  }

  // ---------------------------------------------------------------- 録音（MediaRecorder。マイクはこのページだけで開く）
  async function startRecording() {
    if (rec || busyMsg || !view || !view.seg) return;
    const key = view.key, ws = o.ws(), g = o.generation();
    let stream;
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch (e) { say(L.micNo + (e.message || e.name || e) + ' — ' + L.micHint, true); return; }
    if (o.ws() !== ws || o.generation() !== g || !open) { stream.getTracks().forEach((t) => t.stop()); return; }
    const ac = new win.AudioContext();
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 2048; src.connect(an);
    const mr = new win.MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const r = rec = { key, ws, g, stream, ac, an, mr, chunks, t0: performance.now(), raf: 0, peak: 0 };
    mr.start(250);
    const buf = new Float32Array(an.fftSize);
    const tick = () => {
      if (rec !== r) return;
      an.getFloatTimeDomainData(buf);
      let pk = 0; for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
      r.peak = Math.max(r.peak, pk);
      const db = pk > 0 ? 20 * Math.log10(pk) : -90;
      const m = card && card.querySelector('#dev-audio-meter');
      if (m) {
        m.querySelector('i').style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)).toFixed(1) + '%';
        const sec = (performance.now() - r.t0) / 1000;
        m.querySelector('.dv-t').textContent = sec.toFixed(1) + ' s';
        if (sec > AUDIO_LIMITS.maxSeconds) { say(L.tooLong(AUDIO_LIMITS.maxSeconds), true); stopRecording(); return; }
      }
      r.raf = win.requestAnimationFrame(tick);
    };
    if (view) draw(view);
    r.raf = win.requestAnimationFrame(tick);
  }
  function stopRecording(discardIt = false) {
    const r = rec;
    if (!r) return Promise.resolve();
    rec = null;
    win.cancelAnimationFrame(r.raf);
    return new Promise((resolve) => {
      r.mr.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop());
        if (discardIt || o.ws() !== r.ws || o.generation() !== r.g) { r.ac.close().catch(() => {}); resolve(); return; }
        setBusy(L.processing);
        try {
          const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
          const bytes = await readFileBounded(blob, { max: AUDIO_LIMITS.fileBytes, what: 'recording' });
          const ab = await r.ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          const chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c));
          const p = processTake(chans, ab.sampleRate);
          if (!(p.dur > 0)) throw Object.assign(new Error(L.empty), { code: 'audio-empty' });
          const { hash } = await currentHash(r.key);
          if (o.ws() !== r.ws || o.generation() !== r.g) return;
          const take = await addTake(r.key, { kind: 'recorded', pcm: p.pcm, sr: p.sr, dur: p.dur, cues: null, recipe: null, inputHash: hash, gainDb: p.gainDb, at: Date.now() });
          busyMsg = null;
          await useTake(r.key, take.id, true);   // 録ったらすぐ使う（前の音声は「前に戻す」で）
        } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); }
        finally { r.ac.close().catch(() => {}); resolve(); }
      };
      try { r.mr.stop(); } catch { r.mr.onstop(); }
      if (view) draw(view);
    });
  }

  // ---------------------------------------------------------------- ファイルから取り込む（読む前に大きさを確かめる）
  function importFile() {
    if (busyMsg || !view || !view.seg) return;
    const key = view.key, ws = o.ws(), g = o.generation();
    const i = h('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.ogg,.opus,.webm,.flac', hidden: '' });
    i.addEventListener('change', async () => {
      const f = i.files && i.files[0]; i.remove();
      if (!f) return;
      setBusy(L.processing);
      try {
        const bytes = await readFileBounded(f, { max: AUDIO_LIMITS.fileBytes, what: f.name });
        let chans, sr;
        const w = decodeWav(bytes);
        if (w) { chans = w.channels; sr = w.sr; }
        else {
          const ac = new win.OfflineAudioContext(1, 1, 44100);
          const ab = await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c)); sr = ab.sampleRate;
        }
        const p = processTake(chans, sr);
        if (!(p.dur > 0)) throw Object.assign(new Error(L.empty), { code: 'audio-empty' });
        const { hash } = await currentHash(key);
        if (o.ws() !== ws || o.generation() !== g) return;
        const take = await addTake(key, { kind: 'imported', pcm: p.pcm, sr: p.sr, dur: p.dur, cues: null, recipe: null, inputHash: hash, gainDb: p.gainDb, at: Date.now() });
        busyMsg = null;
        await useTake(key, take.id, true);
      } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); }
    });
    doc.body.appendChild(i); i.click();
  }

  // ---------------------------------------------------------------- ブラウザの TTS で作り直す（o.tts：app/tts-client.js。試験では差し替える）
  // 1 行（{cue} の部分）ずつ作り、行ごとに後処理（無音を削る・音量）をしてから、ターンの間に無音を入れてつなぐ（tts/synth.py と同じ）。
  // 日本語は読み辞書（tts/yomi.yaml。tts/yomi.py と同じ規則の app/yomi-data.js）を通した文を渡す
  // key を渡すとその段階を作り直す（前処理の版が古い段階の一覧から。選んだ段階だけ）。渡さなければ今の段階。戻り値：できたら true
  async function regenerate(arg) {
    const fromList = typeof arg === 'string';
    if (busyMsg || !view || !o.tts) return false;
    if (!fromList && !view.seg) return false;
    const key = fromList ? arg : view.key, ws = o.ws(), g = o.generation();
    let vw = view;
    if (key !== view.key) {
      try { vw = await loadStep(key); } catch (e) { say(L.fail + (e.message || e), true); return false; }
      if (vw.url) { freeUrl(vw.url); flushUrls(); }
      if (o.ws() !== ws || o.generation() !== g || !vw.seg) { if (vw.seg === null) say(L.noSeg, true); return false; }
    }
    const lang = ttsLang(vw);
    const info = o.tts.info(lang);
    if (!info.ok) { say(L.ttsNo + info.reason, true); return false; }
    setBusy(L.processing);
    const prog = () => card && card.querySelector('#dev-audio-prog');
    const stopWait = o.wait ? o.wait() : () => {};
    try {
      const { seg, hash } = await currentHash(key);
      if (!seg) throw new Error(L.noSeg);
      const ja = /^ja\b/i.test(lang);
      // 声：選んだ声か voice.json の声。ブラウザの TTS に入っていない名前は、板で知らせたとおり既定の声にする（日本語も英語も同じ。#19）
      const voices = { expert: voiceOf(vw, 'expert').name, novice: voiceOf(vw, 'novice').name };
      const jobs = [];
      const terms = (o.yomi && o.yomi.terms) || [];
      // 合成の直前だけ前処理する（normalizeTtsText。ttsParts と inputHash は変えない。format spec §5.4）
      seg.turns.forEach((t, ti) => t.ttsParts.forEach((p, pi) => jobs.push({ ti, pi, role: t.role, text: normalizeTtsText(ja ? applyYomi(p, terms).text : p) })));
      const out = seg.turns.map((t) => t.ttsParts.map(() => null));
      let done = 0, recipe = null, voiceMap = {};
      for (const j of jobs) {
        if (!j.text.trim()) { out[j.ti][j.pi] = new Float32Array(0); done++; continue; }
        const r = await o.tts.synth({ lang, text: j.text, role: j.role, voices, onProgress: (f, label) => {
          const p = prog(); if (p) { p.hidden = false; p.firstChild.style.width = (100 * Math.max(0, Math.min(1, (done + f) / jobs.length))).toFixed(1) + '%'; }
          if (label) { busyMsg = label; const m = msgEl(); if (m) { m.className = 'dev-msg dv-ok'; m.textContent = label; } }
        } });
        if (o.ws() !== ws || o.generation() !== g) return false;
        const line = processTake([r.pcm], r.sr);
        out[j.ti][j.pi] = line.pcm;
        recipe = recipe || r.recipe;
        if (r.recipe && r.recipe.voice && typeof r.recipe.voice === 'object') voiceMap = { ...voiceMap, ...r.recipe.voice };   // 行ごとの話者の声をまとめる
        done++;
      }
      const joined = joinParts(out);
      if (!(joined.dur > 0)) throw Object.assign(new Error(L.empty), { code: 'audio-empty' });
      if (!recipe) throw Object.assign(new Error(L.empty), { code: 'audio-empty' });
      // recipe（format spec §5.2）：エンジン・モデル・声（話す役の公開の名前だけ）・シード・読み辞書の hash・後処理の版
      const rc = { engine: String(recipe.engine), model: String(recipe.model), voice: {}, seed: Number.isInteger(recipe.seed) ? recipe.seed : null, dictionary: ja && o.yomi ? o.yomi.sha256 : null, processing: PROCESSING, textNormalize: TEXT_NORMALIZE };
      for (const [role, name] of Object.entries(voiceMap)) if ((role === 'expert' || role === 'novice') && seg.turns.some((t) => t.role === role) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(name))) rc.voice[role] = String(name);
      const take = await addTake(key, { kind: 'tts', pcm: joined.pcm, sr: 44100, dur: joined.dur, cues: joined.cues, recipe: rc, inputHash: hash, gainDb: 0, at: Date.now() });
      busyMsg = null;
      stopWait();
      await useTake(key, take.id, true);
      return !(takes.get(key) || []).some((x) => x.id === take.id);   // 書けたら取り直しは残らない
    } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); return false; }
    finally { stopWait(); }
  }

  // ---------------------------------------------------------------- 前処理の版が古い TTS の段階（選んだものだけ、いつもの作り直しで作る。勝手には作り直さない）
  const picked = new Set();
  function drawOldNorm(v, canRun) {
    const N = o.oldNorm;
    const list = N ? v.oldNorm || [] : [];
    for (const k of [...picked]) if (!list.includes(k)) picked.delete(k);
    if (!list.length) return;
    const box = h('div', { cls: 'dv-old', id: 'dev-audio-oldnorm' });
    box.appendChild(h('div', { cls: 'dv-h', text: N.title }));
    box.appendChild(h('div', { cls: 'dv-note', text: N.note }));
    const busy = !!(busyMsg || rec);
    const go = h('button', { id: 'dev-audio-oldnorm-go', cls: 'dv-pri', text: N.go(picked.size), on: { click: () => regenerateOld(v) } });
    for (const k of list) {
      const cb = h('input', { type: 'checkbox', 'data-key': k, id: 'dev-audio-old-' + k.replace(/[^A-Za-z0-9_-]/g, '_') });
      if (picked.has(k)) cb.checked = true;
      cb.addEventListener('change', () => { if (cb.checked) picked.add(k); else picked.delete(k); go.textContent = N.go(picked.size); go.disabled = busy || !canRun || !picked.size; });
      if (busy) cb.disabled = true;
      box.appendChild(h('label', { cls: 'dv-oldrow' }, [cb, h('span', { text: L.step + k.slice(k.lastIndexOf(':') + 1) + ' (' + k + ')' })]));
    }
    go.disabled = busy || !canRun || !picked.size;
    box.appendChild(h('div', { cls: 'dv-tools' }, [go]));
    card.appendChild(box);
  }
  // 選んだ段階を 1 つずつ、いつもの作り直し（regenerate）で作る。失敗したらそこで止める
  async function regenerateOld(v) {
    if (busyMsg || rec) return;
    const N = o.oldNorm, keys = (v.oldNorm || []).filter((k) => picked.has(k));
    let n = 0;
    for (const k of keys) {
      if (!(await regenerate(k))) break;
      picked.delete(k); n++;
    }
    if (view) show(view.key, view.i);
    if (n) ui.toast(N.done(n));
  }

  // ---------------------------------------------------------------- Colab で音声を作る（tts-job.json を書き出す → ノートブック → zip を取り込む）
  // 印付き（書き出した後に原稿が変わった段階）：key → {rec, bytes（WAV）, cuesOk}。作業場所を替えると捨てる
  const marked = new Map();
  let colabNote = null;   // 取り込みの結果の知らせ（板を描き直しても残す）：{lines: [{text, bad}]}
  function drawColab(v, open) {
    const C = o.colab.t, need = v.need || [];
    const det = h('details', { cls: 'dv-colab', id: 'dev-audio-colab' });
    if (open || colabNote || marked.size) det.setAttribute('open', '');
    det.appendChild(h('summary', { text: C.title }));
    if (C.verified) det.appendChild(h('div', { cls: 'dv-note dv-verified', id: 'dev-audio-colab-verified', text: C.verified }));
    det.appendChild(h('div', { cls: 'dv-note', text: C.lead }));
    const all = (v.segs || []).length;
    const sel = h('select', { id: 'dev-audio-colab-scope', 'aria-label': C.scope }, [h('option', { value: 'need', text: C.scopeNeed(need.length) }), h('option', { value: 'all', text: C.scopeAll(all) })]);
    const exp = h('button', { id: 'dev-audio-colab-export', cls: 'dv-pri', text: C.export, on: { click: () => exportJob(sel.value) } });
    const opn = h('a', { id: 'dev-audio-colab-open', cls: 'dv-link', href: colabUrl(), target: '_blank', rel: 'noopener', title: C.openColabT, text: C.openColab });
    const imp = h('button', { id: 'dev-audio-colab-import', text: C.import, on: { click: importZip } });
    if (busyMsg || rec || !v.seg) { exp.disabled = true; imp.disabled = true; }
    det.appendChild(h('div', { cls: 'dv-tools' }, [h('span', { text: C.scope + '：' }), sel]));
    det.appendChild(h('div', { cls: 'dv-tools' }, [exp, opn, imp]));
    if (colabNote) for (const l of colabNote.lines) det.appendChild(h('div', { cls: 'dev-msg ' + (l.bad ? 'dv-err' : 'dv-ok') + ' dv-colab-msg', text: l.text }));
    if (marked.size) {
      det.appendChild(h('div', { cls: 'dv-h', text: C.marked }));
      det.appendChild(h('div', { cls: 'dv-note', text: C.markedNote }));
      for (const [key, m] of marked) {
        const row = h('div', { cls: 'dv-take dv-marked', 'data-key': key }, [h('div', { cls: 'dv-row' }, [h('span', { cls: 'dv-n', text: key }), h('span', { text: L.sec(m.rec.dur) }), h('span', { cls: 'dv-sp' }),
          h('button', { cls: 'dv-use-old', text: C.useOld, on: { click: () => useMarked(key) } }), h('button', { cls: 'dv-ghost dv-drop', text: C.discard, on: { click: () => { marked.delete(key); if (view) draw(view); } } })])]);
        if (busyMsg) for (const b of row.querySelectorAll('button')) b.disabled = true;
        det.appendChild(row);
      }
    }
    card.appendChild(det);
  }
  function download(name, bytes, type) {
    const u = blobUrl(bytes, type);
    const a = h('a', { href: u, download: name, hidden: '' });
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { if (urls.has(u)) { URL.revokeObjectURL(u); urls.delete(u); } }, 60000);
  }
  async function exportJob(scope) {
    if (busyMsg || !view || !view.seg || !o.colab) return;
    const C = o.colab.t, ws = o.ws(), g = o.generation(), v = view;
    const keys = scope === 'all' ? null : (v.need || []);
    if (keys && !keys.length) { say(C.noSteps, true); return; }
    if (!(await o.colab.confirm(C.privacyTitle, C.privacyBody, C.privacyGo))) return;
    if (o.ws() !== ws || o.generation() !== g) return;
    try {
      const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
      const segs = parseNarration(narr || '');
      const voices = { expert: voiceOf(v, 'expert').name, novice: voiceOf(v, 'novice').name };
      const job = await buildJob({ segs, docId: await o.colab.docId(), lang: ttsLang(v), voices, yomi: o.yomi || null, version: o.colab.version || '0', keys });
      if (o.ws() !== ws || o.generation() !== g) return;
      if (!job.steps.length) { say(C.noSteps, true); return; }
      download('tts-job.json', enc.encode(JSON.stringify(job, null, 1) + '\n'), 'application/json');
      colabNote = { lines: [{ text: C.exported(job.steps.length) }] };
      if (view) draw(view);
    } catch (e) { say(L.fail + (e.message || e), true); }
  }
  const enc = new TextEncoder();
  function importZip() {
    if (busyMsg || !view || !view.seg || !o.colab) return;
    const i = h('input', { type: 'file', accept: '.zip,application/zip', hidden: '' });
    i.addEventListener('change', async () => {
      const f = i.files && i.files[0]; i.remove();
      if (f) await importZipFile(f);
    });
    doc.body.appendChild(i); i.click();
  }
  // zip を読んで取り込む。zip はダウンロード物（信頼しない）：大きさを読む前に確かめ、中身は kit/core/zip-read.mjs が上限つきで読み、コードは実行しない
  async function importZipFile(f) {
    const C = o.colab.t, ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    colabNote = null;
    setBusy(C.importing);
    const lines = [];
    try {
      const bytes = await readFileBounded(f, { max: COLAB_LIMITS.zipBytes, what: 'zip' });
      const zip = await readColabZip(bytes);
      const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
      const segs = parseNarration(narr || '');
      const plan = await planImport({ zip, segs, docId: await o.colab.docId(), yomi: o.yomi || null });
      if (!live()) return;
      if (plan.reject) { lines.push({ text: plan.reject.code === 'doc-id' ? C.rejectDoc : C.rejectRecords(plan.reject.why), bad: true }); return; }
      let applied = 0;
      const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
      if (no && plan.applied.length) lines.push({ text: no, bad: true });
      else {
        for (const it of plan.applied) {
          if (!live()) return;
          try {
            const d = decodeStepAudio(zip.files.get(it.file), it.rec);
            const take = await addTake(it.key, { kind: 'tts', pcm: d.pcm, sr: d.sr, dur: d.dur, cues: d.cues, recipe: it.rec.recipe, inputHash: it.rec.inputHash, gainDb: 0, at: Date.now() });
            await useTake(it.key, take.id, true, true);
            applied++;
          } catch (e) {
            for (const t of takes.get(it.key) || []) freeUrl(t.url);
            takes.delete(it.key);
            lines.push({ text: C.applyFail(it.key, e.message || e), bad: true });
          }
        }
      }
      for (const it of plan.marked) marked.set(it.key, { rec: it.rec, bytes: zip.files.get(it.file), cuesOk: it.cuesOk });
      const skipped = plan.skipped.filter((x) => x.key !== undefined);
      lines.unshift({ text: C.summary(applied, plan.marked.length, skipped.length) });
      for (const x of skipped) lines.push({ text: C.skipped(x.key || '?', C.skipWhy[x.why] || x.why), bad: true });
      if (plan.warnings.includes('dictionary')) lines.push({ text: C.warnDict, bad: true });
      if (plan.warnings.includes('processing')) lines.push({ text: C.warnProc, bad: true });
      if (applied && o.afterWrite) await o.afterWrite();
    } catch (e) { lines.push({ text: C.zipFail(e.message || e), bad: true }); }
    finally {
      if (live()) { busyMsg = null; colabNote = { lines }; if (view) show(view.key, view.i); }
    }
  }
  // 印付きの段階を、古い印のまま使う（inputHash は書き出したときのまま＝「古い」の印が付く。区切りの数が合わなければ区切りなし）
  async function useMarked(key) {
    const m = marked.get(key);
    if (!m || busyMsg) return;
    const C = o.colab.t;
    try {
      const d = decodeStepAudio(m.bytes, m.rec);
      const take = await addTake(key, { kind: 'tts', pcm: d.pcm, sr: d.sr, dur: d.dur, cues: m.cuesOk ? d.cues : null, recipe: m.rec.recipe, inputHash: m.rec.inputHash, gainDb: 0, at: Date.now() });
      marked.delete(key);
      await useTake(key, take.id, true);
    } catch (e) { say(C.applyFail(key, e.message || e), true); }
  }

  // ---------------------------------------------------------------- この音声を使う：MP3 にして audio/ と audio/manifest.json に書く
  // auto：作った直後（書けなければ取り直しとして残す）。前の記録は history に積む（「前に戻す」）
  // batch：Colab の取り込みのように何段階かを続けて使うとき（呼び手が busy を持ち、組み直し・知らせは最後に 1 度。失敗は投げる）
  async function useTake(key, id, auto = false, batch = false) {
    const t = (takes.get(key) || []).find((x) => x.id === id);
    if (!t || (busyMsg && !batch)) return;
    const ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
    if (no) { if (batch) throw new Error(no); if (view) draw(view); say((auto ? L.notUsed + ' — ' : '') + no, true); return; }
    if (!live()) return;
    if (!batch) setBusy(L.using);
    try {
      // MP3 のエンコーダ（LAME）は別のファイルを使うときだけ読み込む（o.loadMp3。app/mp3-loader.js）。読み込めない（1 ファイル版など）なら WAV
      const init = o.loadMp3 ? await o.loadMp3() : null;
      if (!live()) return;
      const bytes = init ? await encodeMp3(t.pcm, { init }) : encodeWav(t.pcm, t.sr);
      const file = takeFileName(t.kind, await sha256Hex(bytes), init ? 'mp3' : 'wav');
      const entry = takeEntry({ file, dur: t.dur, cues: t.kind === 'tts' ? t.cues : null, kind: t.kind, inputHash: t.inputHash, recipe: t.recipe, processing: (t.recipe && t.recipe.processing) || PROCESSING, startOffset: init ? MP3.startOffset : 0 });
      const prev = await writeEntry(ws, live, key, entry, { file, bytes });
      if (prev === undefined) return;
      const back = history.get(key) || [];
      back.push(prev);
      history.set(key, back.slice(-20));
      for (const x of takes.get(key) || []) freeUrl(x.url);
      takes.delete(key);
      if (batch) return true;
      const portable = ws.kind === 'memory';
      if (o.afterWrite) await o.afterWrite();
      if (!live()) return;
      busyMsg = null;
      if (view && view.key === key) show(key, view.i); else follow(true);
      ui.toast((portable ? L.usedPortable : L.used(file)) + (init ? '' : L.wavNote), init ? '' : 'warn');
    } catch (e) {
      if (batch) throw e;
      busyMsg = null; if (view) draw(view);
      say((auto ? L.notUsed + ' — ' : '') + L.fail + (e && e.name === 'Cancelled' ? 'cancelled' : (e.message || e)), true);
    }
  }
  // 段階の記録を manifest に書く（entry が null なら外す）。add：新しい音声のファイル。戻り値：書く前の記録（なければ null）、取り消したら undefined
  async function writeEntry(ws, live, key, entry, add = null) {
    const man = await readJson(ws, 'audio/manifest.json');
    if (man.bad) throw new Error('audio/manifest.json is not JSON');
    const segs = man.value && isObj(man.value.segments) ? man.value.segments : {};
    const prev = own(segs, key) && isObj(segs[key]) ? JSON.parse(JSON.stringify(segs[key])) : null;
    const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
    const order = parseNarration(narr || '').map((s) => `${s.slideKey}:${s.stepKey}`);
    const next = setManifestEntry(man.text, key, entry, order);
    if (!live()) return undefined;
    if (man.text !== null) await ws.backup('audio/manifest.json', { max: READ_LIMITS.json });
    if (!live()) return undefined;
    if (add && !(await ws.exists('audio/' + add.file))) await ws.writeBytes('audio/' + add.file, add.bytes, { live });
    // 書く直前に：manifest が読んだときのままか（ほかの道具が書いていれば上書きしない）
    if ((await ws.readText('audio/manifest.json', { max: READ_LIMITS.json })) !== man.text) throw new Error('audio/manifest.json changed while saving (reload)');
    if (!live()) return undefined;
    await ws.writeText('audio/manifest.json', next, { live });
    return prev;
  }
  // 前に戻す：積んだ前の記録を manifest に戻す（音声のファイルは消していないので、そのファイルを指す記録に戻すだけ）
  async function revert(key) {
    const back = history.get(key) || [];
    if (!back.length || busyMsg || rec) return;
    const ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
    if (no) { say(no, true); return; }
    const prev = back[back.length - 1];
    if (prev && !(safeFile(prev.file) && (await ws.exists('audio/' + prev.file)))) { say(L.revertGone(String(prev.file)), true); return; }
    if (!live()) return;
    setBusy(L.using);
    try {
      const was = await writeEntry(ws, live, key, prev);
      if (was === undefined) return;
      back.pop();
      if (back.length) history.set(key, back); else history.delete(key);
      if (o.afterWrite) await o.afterWrite();
      if (!live()) return;
      busyMsg = null;
      if (view && view.key === key) show(key, view.i); else follow(true);
      ui.toast(prev ? L.reverted : L.revertedNone);
    } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); }
  }

  function reset() {
    stopRecording(true);
    stopSample();
    for (const list of takes.values()) for (const t of list) freeUrl(t.url);
    takes.clear(); history.clear(); marked.clear(); colabNote = null; busyMsg = null;
    for (const k of Object.keys(voiceMem)) delete voiceMem[k];
    if (card) { card.remove(); card = null; }
    if (view && view.url) freeUrl(view.url);
    flushUrls();
    view = null; open = false;
    ui.refresh();
  }
  return {
    toggle, reset, isOpen: () => open, isBusy: () => !!(rec || busyMsg),
    onPos: () => { if (open) follow(false); },
    reload: () => { if (!open) return; if (view && !rec && !busyMsg) show(view.key, view.i); else follow(true); },
    unsaved: () => [...takes.values()].reduce((n, l) => n + l.length, 0),
    state: () => ({ open, key: view ? view.key : null, recording: !!rec, busy: busyMsg, loading: !!(view && view.loading), state: view ? view.state || null : null, entry: view && view.entry ? { ...view.entry } : null,
      history: Object.fromEntries([...history].map(([k, l]) => [k, l.map((e) => (e ? e.file : null))])), voices: view && view.voice !== undefined ? { expert: voiceOf(view, 'expert').name, novice: voiceOf(view, 'novice').name } : null,
      sample: sample ? sample.dataset.name : null,
      takes: Object.fromEntries([...takes].map(([k, l]) => [k, l.map((t) => ({ id: t.id, kind: t.kind, dur: t.dur, cues: t.cues, recipe: t.recipe, inputHash: t.inputHash, gainDb: t.gainDb }))])) }),
    // 試験：録音を止める（MediaRecorder の終わりを待つ）
    stop: () => stopRecording(),
  };
}
