// 音声の板（編集アプリの信頼する横の板 #dev-side の中。プレビューの外）。上から 3 つの区画（handoff/audio-flow-2026-10-25.md）：
//   A. この教材の音声：状態の 1 行（音声のあるステップの数・更新が必要・声を変えた・1 ファイルで未保存）と、いま押すボタン 1 つ
//      （「残りの音声を作る」「音声を更新」は前に使ったやり方で続ける。前のやり方は egatari.json の studio.audioMethod。なければ B を開く）
//   B. 音声をどう付けますか：AI 音声をクラウドで作る（Google Colab。C1 台本を書き出す → C2 Colab を開く → C3 できた音声を取り込む）・
//      AI 音声をこの PC で作る（WebGPU が使えるときだけ。そのときは既定）・自分の声で録音する（録音モード）。AI 音声の上に声の欄
//   C. このステップ：聞く・読み上げで聞く・録音 (r)・ファイルから取り込む・前に戻す・この PC で作り直す、と台本（読むだけ）
// 録音は録音モード（app/rec-mode.js）だけ（#82）。作った音声（録音・取り込み・AI 音声）はすぐにそのステップの音声にし、前の音声は「前に戻す」で戻せる（#45）。
//
// 守ること（SECURITY.md）：TTS はこのページ（信頼する編集の画面）だけで使う。プレビュー（sandbox の iframe）からは音声も
// 頼みも受け取らない（どのステップを見せるかは編集の画面の位置 ui.pos() から決め、デッキの知らせで板の中身を替えるのは作っていないときだけ）。
// 読み書きは作業場所（workspace.js）だけ：audio/<file>.mp3 と audio/manifest.json（書き換える前に .cache/edits/ に控え）、voice.json、egatari.json（studio.audioMethod）。
// 読む大きさには上限がある（manifest・台本は READ_LIMITS、音声は AUDIO_LIMITS.fileBytes）。
// 後処理（モノラル・44.1 kHz・無音を削る・-20 LUFS）は kit/core/audio-core.mjs（tts/core.py と同じ数）、MP3 は kit/core/mp3.mjs（LAME）。
// 作った音声はすぐに作業場所に書く（前の記録はステップごとにメモリの上に積み、「前に戻す」でその記録を manifest に戻す。音声のファイルは消さない）。
// 書けなかったとき（読むだけ・権利の確認を断った）だけ、取り直し（take）として残し「この音声を使う」で書ける（録音モードで録ったものも）。
// 1 ファイルでは作業場所はメモリの上なので、書いた後に「保存」で段 A（kit/core/tier-a.mjs）の保存になる。
// 声の選択と前に使ったやり方は、作業フォルダでは voice.json・egatari.json に書き、1 ファイルではこの画面の間だけ覚える（書くと保存が要る変更になるため）
//
// 声を変えた：inputHash は声を含まないので、AI 音声の記録の recipe.voice（役 → 声の名前）と今の声（1 ファイルの選択 > voice.json > 既定）を比べる。
//   recipe.voice のない記録（声の分からない古い記録・dry-run）は数えない
// クラウド（Colab。kit/core/colab-core.mjs・docs/editor.md）：tts-job.json を書き出し、公式のノートブックが返す ZIP ファイルを取り込む。
//   取り込みは <input type=file>（フォルダを選ぶ仕組みは使わない）。inputHash が今の台本と合うステップだけ cue つき（sync auto）で使い、
//   合わないステップは使わずに「音声を更新」を出す。台本を Google に渡す確かめは、このブラウザで初めての 1 回だけ（localStorage）
//
//   const panel = createAudioPanel({ui, ws(), generation(), lang, deckLang(), beforeOpen?(), beforeWrite(kind), afterWrite(), tts?, yomi?: {terms, sha256}, loadMp3?(), wait?() → stop(), sampleBase?,
//     save?()（1 ファイルの「保存」）, configFile（egatari.json の名前）,
//     colab?: {t（app/i18n.js の T.colab）, docId() → 文字列 | null, title?(), version, confirm(題, 本文, 実行の名前, キャンセルの名前) → boolean},
//     recMode?: {title, open({key, returnFocus()})}（録音モード。app/rec-mode.js）})
//   panel.toggle(on?) / panel.reset() / panel.onPos(pos) / panel.isOpen() / panel.isBusy() / panel.state() / panel.dirtyChanged()
//   録音モード（app/rec-mode.js）が使う口：panel.peek(key) / panel.commit(key, take) / panel.revert(key) / panel.canRevert(key)
//   （録音モードの間、板は開いたまま隠れ（#deck.rec-on）、閉じると録ったステップの新しい音声を見せる）
import { processTake, joinParts, takeEntry, setManifestEntry, takeFileName, audioState, decodeWav, encodeWav, AUDIO_LIMITS, PROCESSING } from '../kit/core/audio-core.mjs';
import { encodeMp3 } from '../kit/core/mp3.mjs';
import { MP3 } from '../kit/core/audio-core.mjs';
import { inputHash, sha256Hex } from '../kit/core/portable.mjs';
import { parseNarration, splitKey } from '../kit/core/narration-core.mjs';
import { narrationLang } from '../kit/core/narration-lint.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { readFileBounded } from './bounded-read.js';
import { applyYomi } from '../kit/core/yomi.mjs';
import { readAloud, stopReadAloud, readingAloud, readAloudSupported } from './read-aloud.js';
import { TEXT_NORMALIZE, normalizeTtsText } from '../kit/core/tts-normalize.mjs';
import { buildJob, planImport, decodeStepAudio, readColabZip, colabUrl, expectedCues, COLAB_LIMITS } from '../kit/core/colab-core.mjs';
import { AI_VOICE_LABELS } from './i18n.js';
import { updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { IRODORI_VOICES, KOKORO_VOICES, KOKORO_MAIN, DEFAULT_VOICES, VOICE_SAMPLES, bundledVoice } from '../lab/tts-voices.mjs';

const STR = {
  ja: {
    title: '音声', close: '閉じる',
    // A. この教材の音声
    deck: {
      none: (n) => `まだ音声がありません（${n} ステップ）`, some: (n, k) => `${n} ステップのうち ${k} ステップに音声があります`,
      stale: (k) => `${k} ステップの音声の更新が必要です（台本が変わりました）`, voice: (k) => `声を変えたので、AI 音声の ${k} ステップは前の声のままです`,
      all: (n) => `${n} ステップすべてに音声があります`, unsaved: '保存するまでファイルには入っていません',
      makeRest: (k) => `残りの音声を作る（${k} ステップ）`, update: (k) => `音声を更新（${k} ステップ）`, save: '保存',
      noSegs: 'まだ台本がありません（「台本」の板で書きます）',
    },
    // B. 音声の付け方
    how: {
      legend: '音声をどう付けますか', cloud: AI_VOICE_LABELS.ja.cloud, local: AI_VOICE_LABELS.ja.local,
      localHint: (size) => `初めてのときに音声のモデル（約 ${size}）を取得します`, localGo: (n) => `この PC で作る（${n} ステップ）`, localNone: '音声の要るステップはありません',
      rec: '自分の声で録音する', recBtn: '録音モードを開く (r)', recHint: '台本を大きく出して、キーボードだけで録れます。Space で録音と停止、Enter で次へ',
    },
    voice: { one: '声', expert: '説明する人の声', novice: '質問する人の声' },
    sample: '▶ 試聴', sampleStop: '■ 止める', sampleT: (n) => '「' + n + '」を短く試聴する（事前に作った音声。モデルは読み込みません）', noSample: 'この声には試聴の音声がありません', sampleFail: '試聴できません（配信版のエディタで開いてください）',
    more: 'ほかの声', voiceSaved: (r, n) => r + 'を「' + n + '」にしました（voice.json）。次に AI 音声を作るときから使います', voiceMem: (r, n) => r + 'を「' + n + '」にしました。Egatari ファイルでは、この画面を開いている間だけ覚えます（作った音声の記録には声の名前が残ります）',
    voiceUnknown: (r, n, fb) => '声「' + n + '」はこのエディタでは使えません。既定の声「' + fb + '」で作ります',
    // C. このステップ
    stepHead: (n, t, k) => `スライド ${n}「${t}」・ステップ ${k}`, place: (n, k) => `スライド ${n}・ステップ ${k}`, none: 'まだ音声がありません',
    kind: { recorded: '録音', tts: 'AI 音声', imported: '取り込み' }, sec: (s) => s.toFixed(1) + ' 秒',
    stale: '更新が必要', staleT: 'この音声を作った後に台本が変わっています（または、どの台本から作ったか分かりません）。音声は消さずに残します',
    play: '▶ 聞く', playStop: '■ 止める', rec: '● 録音 (r)', importBtn: 'ファイルから取り込む…', local: 'この PC で作り直す',
    revert: '↶ 前に戻す', revertT: (n) => '一つ前の音声に戻します（音声のファイルは消していません。あと ' + n + ' 回戻せます）', reverted: '前の音声に戻しました', revertedNone: '前は音声がなかったので、このステップの音声を外しました',
    revertGone: (f) => '前の音声のファイル（audio/' + f + '）が見つからないので戻せません',
    script: '台本', scriptT: '読むだけです（直すのは「台本」の板）。右下の角を引くと大きさを変えられます', cues: (n) => `動きに合わせる所が ${n} 個あります（録音では C で置けます）`,
    noSeg: 'このステップの台本がありません（先に「台本」の板で書いてください）',
    processing: '整えています…', making: (i, n) => `AI 音声を作っています（${i} / ${n} ステップ）…`, madeAll: (k) => `${k} ステップに AI 音声を付けました`, ttsNo: 'この PC では AI 音声を作れません：',
    takes: 'まだ使っていない音声', use: 'この音声を使う', del: '捨てる', notUsed: '書き込めなかったので、まだこのステップには使っていません。下の「この音声を使う」で使えます',
    using: '書き込んでいます…', used: (f) => 'このステップの音声にしました（audio/' + f + '）。前の音声には「前に戻す」で戻せます', usedPortable: 'このステップの音声にしました。ファイルに残すには「保存」を押してください（前の音声には「前に戻す」で戻せます）',
    durOverride: (d) => 'timeline.json の dur（' + d + ' 秒）がこのステップの長さを決めています。長い音声は途中で切れます',
    empty: '音がありません（無音を削ると何も残りませんでした）', fail: 'できませんでした：',
    prov: { recorded: '録音', imported: '取り込み', tts: (r) => 'AI 音声 · ' + r.engine + ' · ' + r.model + (r.voice && Object.keys(r.voice).length ? ' · 声 ' + Object.values(r.voice).join('/') : '') + (r.seed != null ? ' · シード値 ' + r.seed : '') },
    gain: (g) => '音量の調整 ' + (g >= 0 ? '+' : '') + g.toFixed(1) + ' dB', locked: '音声を作って書き込んでいる間、スライドはクリックを受けません',
    following: (k) => '音声を作り終えるまで、表示中のステップ（' + k + '）には切り替えません',
    other: (k) => 'スライドで表示中のステップ（' + k + '）とは別のステップです。スライドを動かすと切り替わります',
    wavNote: '（MP3 のエンコーダを読み込めないので WAV で保存しました。オフライン版のエディタには MP3 のエンコーダが入っていません）',
    read: '読み上げで聞く', readT: 'この端末の読み上げで読みます。音声ファイルにはなりません', readSel: '選んだ語を読み上げで聞く', readSelT: '台本の中で選んだ語や文だけを、この端末の読み上げで読みます',
    reading: '読み上げ中', readStop: '■ 止める', readNoSel: '台本の欄で、聞きたい語を選んでください', readNoText: '読む言葉がありません',
    readNoVoice: (l) => 'この端末には' + (/^ja\b/i.test(l) ? '日本語' : /^en\b/i.test(l) ? '英語' : '「' + l + '」') + 'の読み上げの声がありません（端末の中の声だけを使い、ネットワークの声は使いません）。音声が要るときは AI 音声（クラウドの Google Colab か、この PC）で作ってください',
    readNoSynth: 'このブラウザでは読み上げを使えません。音声が要るときは AI 音声（クラウドの Google Colab か、この PC）で作ってください',
  },
  en: {
    title: 'Audio', close: 'Close',
    deck: {
      none: (n) => `No audio yet (${n} step${n === 1 ? '' : 's'})`, some: (n, k) => `${k} of ${n} steps have audio`,
      stale: (k) => `${k} step${k === 1 ? '' : 's'}: audio needs updating (the script changed)`, voice: (k) => `You changed the voice; ${k} step${k === 1 ? ' still has' : 's still have'} AI voice in the old voice`,
      all: (n) => `All ${n} steps have audio`, unsaved: 'Not in the file until you save',
      makeRest: (k) => `Make the rest (${k} step${k === 1 ? '' : 's'})`, update: (k) => `Update audio (${k} step${k === 1 ? '' : 's'})`, save: 'Save',
      noSegs: 'No script yet (write it in the Script panel)',
    },
    how: {
      legend: 'How do you want to add audio?', cloud: AI_VOICE_LABELS.en.cloud, local: AI_VOICE_LABELS.en.local,
      localHint: (size) => `The first time, the voice model (about ${size}) is downloaded`, localGo: (n) => `Make on this computer (${n} step${n === 1 ? '' : 's'})`, localNone: 'No step needs audio',
      rec: 'Record your own voice', recBtn: 'Open recording mode (r)', recHint: 'Shows the script large; record with the keyboard only. Space starts and stops, Enter goes to the next',
    },
    voice: { one: 'Voice', expert: 'Voice of the explainer', novice: 'Voice of the questioner' },
    sample: '▶ Preview voice', sampleStop: '■ Stop', sampleT: (n) => 'Play a short preview of “' + n + '” (pre-made audio; no model is loaded)', noSample: 'No preview for this voice', sampleFail: 'Cannot play the preview (open the hosted editor)',
    more: 'More voices', voiceSaved: (r, n) => r + ' set to “' + n + '” (voice.json). Used the next time you make AI voice', voiceMem: (r, n) => r + ' set to “' + n + '”. In an Egatari file this is kept only while this page is open (the audio records keep the voice name)',
    voiceUnknown: (r, n, fb) => 'The voice “' + n + '” isn\'t available in this editor; the default voice “' + fb + '” is used.',
    stepHead: (n, t, k) => `Slide ${n} “${t}” · step ${k}`, place: (n, k) => `slide ${n}, step ${k}`, none: 'No audio yet',
    kind: { recorded: 'Recording', tts: 'AI voice', imported: 'Imported' }, sec: (s) => s.toFixed(1) + ' s',
    stale: 'Needs updating', staleT: 'The script changed after this audio was made (or it is unknown which script it was made from). The audio is kept',
    play: '▶ Play', playStop: '■ Stop', rec: '● Record (r)', importBtn: 'Import from a file…', local: 'Remake on this computer',
    revert: '↶ Revert', revertT: (n) => 'Go back to the previous audio (no audio file was deleted; ' + n + ' step' + (n === 1 ? '' : 's') + ' back available)', reverted: 'Reverted to the previous audio', revertedNone: 'There was no audio before, so the step has no audio now',
    revertGone: (f) => 'Cannot revert: the previous audio file (audio/' + f + ') is missing',
    script: 'Script', scriptT: 'Read only (edit it in the Script panel). Drag the bottom-right corner to resize', cues: (n) => `${n} point${n === 1 ? '' : 's'} where the animation follows the voice (in recording, press C to place them)`,
    noSeg: 'This step has no script (write it in the Script panel first)',
    processing: 'Processing…', making: (i, n) => `Making AI voice (${i} / ${n} steps)…`, madeAll: (k) => `Added AI voice to ${k} step${k === 1 ? '' : 's'}`, ttsNo: 'AI voice cannot be made on this computer: ',
    takes: 'Audio not used yet', use: 'Use this take', del: 'Discard', notUsed: 'It could not be written, so this step does not use it yet. Use it with “Use this take” below',
    using: 'Writing…', used: (f) => 'This step now uses it (audio/' + f + '). “Revert” brings back the previous audio', usedPortable: 'This step now uses it. Press Save to keep it in the file (“Revert” brings back the previous audio)',
    durOverride: (d) => 'timeline.json fixes this step to ' + d + ' s (dur): longer audio is cut',
    empty: 'No sound (nothing is left after trimming silence)', fail: 'Failed: ',
    prov: { recorded: 'recorded', imported: 'imported', tts: (r) => 'AI voice · ' + r.engine + ' · ' + r.model + (r.voice && Object.keys(r.voice).length ? ' · voice ' + Object.values(r.voice).join('/') : '') + (r.seed != null ? ' · seed ' + r.seed : '') },
    gain: (g) => 'level adjusted ' + (g >= 0 ? '+' : '') + g.toFixed(1) + ' dB', locked: 'The slides do not take clicks while audio is being made and written',
    following: (k) => 'Stays on this step until the audio is done (showing ' + k + ')',
    other: (k) => 'This is not the step shown on the slide (' + k + '). Move the slides to switch',
    wavNote: ' (saved as WAV: the MP3 encoder could not be loaded; the Offline editor has no MP3 encoder)',
    read: 'Listen with read-aloud', readT: 'Read with this device’s voice. No audio file is made', readSel: 'Listen with read-aloud to the selected word', readSelT: 'Reads only the word or text you selected in the script, with this device’s voice',
    reading: 'Reading aloud', readStop: '■ Stop', readNoSel: 'Select a word in the script first', readNoText: 'Nothing to read',
    readNoVoice: (l) => 'This device has no read-aloud voice for ' + (/^ja\b/i.test(l) ? 'Japanese' : /^en\b/i.test(l) ? 'English' : '“' + l + '”') + ' (only voices on this device are used, never network voices). To get audio, make AI voice (in the cloud with Google Colab, or on this computer)',
    readNoSynth: 'Read-aloud is not available in this browser. To get audio, make AI voice (in the cloud with Google Colab, or on this computer)',
  },
};

const CSS = [
  '#dev-audio{padding:12px 14px}',
  '#dev-audio .dv-sec{border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px}',
  '#dev-audio .dv-deck{background:#f4f6fb;border:1px solid #e0e5f0;border-radius:8px;padding:8px 10px;margin-bottom:8px}',
  '#dev-audio .dv-deck .dv-line{font-size:13px;line-height:1.5;color:#1f2937}#dev-audio .dv-deck .dv-line.dv-w{color:#7a4b00}',
  '#dev-audio .dv-deck .dv-act{margin-top:6px}',
  '#dev-audio .dv-cur{margin:4px 0 8px;font-size:13px}',
  '#dev-audio .dv-cur .dv-row,#dev-audio .dv-take .dv-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '#dev-audio audio{width:100%;height:32px;margin-top:6px;display:block}#dev-audio audio[hidden]{display:none}',
  '#dev-audio .dv-badge{display:inline-block;border-radius:999px;padding:0 8px;font-size:11.5px;font-weight:700;line-height:18px}',
  '#dev-audio .dv-badge.dv-stale{background:#f59e0b;color:#231400}',
  '#dev-audio .dv-badge.dv-kind{background:#e0e7ff;color:#1e3a8a}',
  '#dev-audio .dv-prov{font-size:11.5px;color:#6b7385;margin-top:2px;word-break:break-word}',
  // 台本：録音しながら読めるように、台本の長さに合わせて伸びる（板の高さの半分ほどまで）。右下の角で大きさを変えられる
  '#dev-audio .dv-script{font-size:14.5px;line-height:1.65;color:#1f2937;background:#fff;border:1px dashed #cfd4de;border-radius:6px;padding:8px 10px;margin:0 0 6px;min-height:3.5em;max-height:min(46vh,30em);overflow:auto;resize:vertical}',
  '#dev-audio .dv-script p{margin:0 0 6px}#dev-audio .dv-script .dv-role{display:inline-block;font-size:11px;font-weight:700;line-height:16px;border-radius:4px;padding:0 5px;margin-right:6px;vertical-align:1px;background:#e0e7ff;color:#1e3a8a}',
  '#dev-audio .dv-script .dv-role.dv-novice{background:#fef3c7;color:#7a4b00}',
  '#dev-audio .dv-voices{display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin:6px 0 8px;font-size:12.5px}',
  '#dev-audio .dv-voices select{min-width:0;font:inherit;padding:2px 4px}#dev-audio .dv-voices .dv-vr{color:#4b5363}',
  '#dev-audio .dv-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}',
  '#dev-audio .dv-reading{display:inline-flex;align-items:center;gap:6px;margin:0 0 8px;padding:2px 10px;border-radius:999px;background:#1f2937;color:#fff;font-size:12px;font-weight:600}',
  '#dev-audio .dv-reading[hidden]{display:none}',
  '#dev-audio .dv-reading::before{content:"";width:8px;height:8px;border-radius:50%;background:#34d399}',
  '#dev-audio button.dv-rec{border-color:#dc2626;color:#b91c1c}',
  '#dev-audio .dv-h{font-weight:700;font-size:12.5px;margin:10px 0 4px}',
  '#dev-audio .dv-take{border:1px solid #e0e4ec;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#fff}',
  '#dev-audio .dv-take .dv-n{font-weight:700;margin-right:2px}#dev-audio .dv-take .dv-sp{flex:1}',
  '#dev-audio .dv-play{display:flex;align-items:center;gap:8px;margin-top:4px}#dev-audio .dv-play audio{flex:1;min-width:0;margin:0}#dev-audio .dv-play button{flex:none}',
  '#dev-audio .dv-note{font-size:11.5px;color:#6b7385;margin:4px 0}',
  '#dev-audio .dv-warn{font-size:12px;color:#7a4b00;background:#fff7e6;border:1px solid #f5d38a;border-radius:6px;padding:4px 8px;margin:6px 0}',
  '#dev-audio .dv-prog{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:4px 0}#dev-audio .dv-prog i{display:block;height:100%;width:0;background:#2563eb}',
  '#dev-audio .dv-empty{color:#8a91a1;font-size:12.5px;padding:4px 0}',
  // B：問い（答えの丸）と、選んだ答えの中身
  '#dev-audio .dv-how summary{cursor:pointer;font-weight:700;font-size:13px}',
  '#dev-audio .dv-how .dv-opt{display:flex;align-items:flex-start;gap:6px;margin:4px 0;font-size:13px;cursor:pointer}#dev-audio .dv-how .dv-opt input{margin-top:3px}',
  '#dev-audio .dv-body{margin:6px 0 4px 22px}',
  '#dev-audio .dv-steps{list-style:none;margin:0;padding:0}#dev-audio .dv-steps>li{margin:0 0 8px}',
  '#dev-audio .dv-steps .dv-c{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '#dev-audio .dv-tick{display:inline-block;width:1.2em;text-align:center;color:#15803d;font-weight:700}',
  '#dev-audio .dv-c2{margin:4px 0 0 1.4em;padding-left:1.2em;font-size:12px;line-height:1.5;color:#374151}#dev-audio .dv-c2 li{margin:0 0 2px}',
  '#dev-audio a.dv-btnlink{display:inline-block;border:1px solid #cfd4de;border-radius:6px;padding:3px 10px;font-size:13px;text-decoration:none;color:inherit;background:#fff}',
  // 音声を作っている間だけ（プレビューが inert のとき）知らせる
  '#dev-audio .dev-lock{display:none}#dev-side.dv-locked #dev-audio .dev-lock{display:block}',
].join('\n');

const plain = (s) => String(s || '').replace(/\{([^{}|]*)\|[^{}]*\}/g, '$1').replace(/\{[^{}]*\}/g, '');
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// manifest の file：audio/ の下の相対パスだけ（.. や先頭の / は使わない）
const safeFile = (f) => typeof f === 'string' && f.length <= 200 && /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(f) && !f.split('/').some((x) => x === '.' || x === '..');
const MIME_OF = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac' };
const METHODS = ['cloud', 'local', 'rec'];
const PRIVACY_KEY = 'egatari-colab-privacy-ok';   // 台本を Google に渡す確かめ（このブラウザで 1 回だけ）
const keyOf = (s) => `${s.slideKey}:${s.stepKey}`;
// 取得するモデルの大きさ（app/tts-client.js の IRODORI_BYTES.fp16・KOKORO_BYTES を丸めたもの）
const MODEL_SIZE = { irodori: '1.3 GB', kokoro: '330 MB' };

export function createAudioPanel(o) {
  const ui = o.ui, h = ui.h, doc = ui.side.ownerDocument, win = doc.defaultView;
  const L = o.lang === 'en' ? STR.en : STR.ja;
  const CFG = o.configFile || 'egatari.json';
  if (!doc.getElementById('dev-audio-style')) { const st = doc.createElement('style'); st.id = 'dev-audio-style'; st.textContent = CSS; doc.head.appendChild(st); }
  let open = false, card = null, view = null, busyMsg = null, seq = 0;
  let focusRec = false;   // 録音モードを閉じた後：次に描いたとき「● 録音」にフォーカスを戻す
  // 前に使ったやり方（この画面の間。作業フォルダでは egatari.json の studio.audioMethod にも書く）・B で選んでいる答え・B を開くか（人が開け閉めしたら覚える）
  let methodMem = null, howSel = null, howOpenUser = null;
  // クラウドの手順の ✓（この画面の間）
  const ticks = { c1: false, c2: false, c3: false };
  let privacyOk = false;
  try { privacyOk = win.localStorage.getItem(PRIVACY_KEY) === '1'; } catch { /* 使えない環境 */ }
  let lastDirty = null;
  // 読み上げ（端末の声）：読んでいるステップと、読めなかったときの知らせ
  let readKey = null, readMsg = null;
  function stopRead(redraw = true) { const was = stopReadAloud(); readKey = null; if (was && redraw && view) draw(view); }
  async function speakFor(v, input) {
    readMsg = null;
    const lang = ttsLang(v);
    const terms = (o.yomi && o.yomi.terms) || [];
    readKey = v.key;
    const r = await readAloud(input, lang, { terms, onend: () => { if (readKey === v.key) { readKey = null; if (view && view.key === v.key) draw(view); } } });
    if (!r.ok) { readKey = null; readMsg = { key: v.key, text: r.reason === 'no-voice' ? L.readNoVoice(lang) : r.reason === 'no-synth' ? L.readNoSynth : L.readNoText }; }
    if (view && view.key === v.key) draw(view);
    return r;
  }
  function readStep(v) { return v.seg ? speakFor(v, v.seg.turns) : null; }
  // 台本の欄で選んだ語。表示の字（θ）に、このステップの読み（{θ|シータ}）があれば読みを当てる（長い語から）
  function readSelection(v) {
    const box = card && card.querySelector('#dev-audio-script');
    const sel = win.getSelection && win.getSelection();
    let text = sel && sel.rangeCount && box && box.contains(sel.anchorNode) && box.contains(sel.focusNode) ? String(sel).trim() : '';
    if (!text) { readMsg = { key: v.key, text: L.readNoSel }; draw(v); return null; }
    const pairs = [];
    for (const t of v.seg.turns) for (const m of String(t.raw).matchAll(/\{([^{}|]+)\|([^{}]+)\}/g)) pairs.push([m[1], m[2]]);
    pairs.sort((a, b) => b[0].length - a[0].length);
    text = text.replace(/[{}|]/g, ' ');
    if (pairs.length) {
      const map = new Map(pairs.map(([x, y]) => [x, y]));
      const re = new RegExp([...map.keys()].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      text = text.replace(re, (x) => '{' + x + '|' + map.get(x) + '}');
    }
    return speakFor(v, text);
  }
  // ステップごとの、まだ使っていない取り直し（書けなかったときだけ。メモリの上）：key → [{id, kind, pcm, sr, dur, cues, recipe, inputHash, url, gainDb, at}]
  const takes = new Map();
  // ステップごとの前の記録（「前に戻す」。新しいものが後ろ）：key → [manifest の記録 | null（音声がなかった）]。作業場所を替えると捨てる
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
  async function loadStep(key, withAudio = true) {
    const ws = o.ws(), g = o.generation();
    const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
    const segs = parseNarration(narr || '');
    const seg = segs.find((s) => keyOf(s) === key) || null;
    const man = await readJson(ws, 'audio/manifest.json');
    const segments = man.value && isObj(man.value.segments) ? man.value.segments : {};
    const entry = own(segments, key) && isObj(segments[key]) ? segments[key] : null;
    let state = null, url = null, err = null;
    if (entry) {
      let sj = null;
      if (!own(entry, 'inputHash') && typeof entry.digest === 'string' && /^[0-9a-f]{1,64}$/.test(entry.digest)) sj = (await readJson(ws, `audio/seg_${entry.digest}.json`)).value;
      state = await audioState(entry, seg, sj);
      if (withAudio && safeFile(entry.file)) {
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
    // 教材全体：ステップごとの記録と古さ（inputHash のない前の記録は、古いかどうか分からないので古いとは数えない）
    const entries = {}, states = {};
    for (const x of segs) {
      const k = keyOf(x), e = own(segments, k) && isObj(segments[k]) ? segments[k] : null;
      if (e) { entries[k] = e; states[k] = k === key && state ? state : await audioState(e, x, null); }
    }
    // 前に使ったやり方（egatari.json の studio.audioMethod）
    const cfg = (await readJson(ws, CFG)).value;
    const m = isObj(cfg) && isObj(cfg.studio) ? cfg.studio.audioMethod : null;
    return { key, g, seg, segs, entry, state, url, err, override, voice, roles, entries, states, method: METHODS.includes(m) ? m : null, manText: man.text };
  }

  // ---------------------------------------------------------------- 教材全体の状態（A の 1 行。声は描くたびに今の選択で比べる）
  // 役の今の声：1 ファイルの選択 > voice.json の名前（エディタの声にない名前もそのまま。コマンドの自分の参照音声と比べるため）> 既定
  function wantedVoice(v, role) {
    const eng = engineOf(v);
    if (own(voiceMem, role) && bundledVoice(eng, voiceMem[role])) return bundledVoice(eng, voiceMem[role]);
    const raw = v && v.voice && typeof v.voice[role] === 'string' ? v.voice[role] : null;
    return raw !== null ? (bundledVoice(eng, raw) || raw) : DEFAULT_VOICES[eng][role];
  }
  // AI 音声の記録が前の声で作ったものか（recipe.voice のない記録・dry-run は分からないので数えない）
  function voiceChanged(v, e) {
    if (!isObj(e) || (e.kind || 'tts') !== 'tts') return false;
    const r = e.recipe;
    if (!isObj(r) || !isObj(r.voice) || r.engine === 'dry-run' || e.engine === 'dry-run') return false;
    return ['expert', 'novice'].some((role) => typeof r.voice[role] === 'string' && r.voice[role] !== wantedVoice(v, role));
  }
  function summary(v) {
    const keys = (v.segs || []).map(keyOf), E = v.entries || {}, S = v.states || {};
    const missing = keys.filter((k) => !E[k]), stale = keys.filter((k) => S[k] === 'stale');
    const voice = keys.filter((k) => E[k] && S[k] !== 'stale' && voiceChanged(v, E[k]));
    const set = new Set([...missing, ...stale, ...voice]);
    const ws = o.ws();
    return { n: keys.length, has: keys.length - missing.length, missing, stale, voice, need: keys.filter((k) => set.has(k)), unsaved: !!(ws && ws.kind === 'memory' && ws.dirty) };
  }
  const localOk = (v) => { const i = o.tts ? o.tts.info(ttsLang(v)) : null; return !!(i && i.ok); };
  const methodOf = (v) => methodMem || (v && v.method) || null;
  // B で選んでいる答え：選んだもの > 前に使ったやり方 > この PC（作れるなら）> クラウド
  function howOf(v) {
    const ok = (m) => m && (m !== 'local' || localOk(v)) && (m !== 'cloud' || o.colab) && (m !== 'rec' || o.recMode);
    for (const m of [howSel, methodOf(v), localOk(v) ? 'local' : null, o.colab ? 'cloud' : null, 'rec']) if (ok(m)) return m;
    return null;
  }

  // ---------------------------------------------------------------- 描く
  function close() {
    stopSample();
    stopRead(false);
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
    if (busyMsg) {   // 作って書いている間はステップを替えない
      if (view && p.key !== view.key) { const w = card && card.querySelector('.dv-follow'); if (w) { w.hidden = false; w.textContent = L.following(p.key); } }
      return;
    }
    if (!force && view && view.key === p.key) return;
    show(p.key, p.i);
  }
  // ステップ key（スライドの番号 i）を読み直して描く
  function show(key, i) {
    const my = ++seq;
    if (readKey !== null && readKey !== key) stopRead(false);   // 別のステップに動いたら読み上げを止める
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
    card = h('div', { id: 'dev-audio', cls: 'edit-ui dev-card', role: 'region', 'aria-label': L.title });
    card.appendChild(h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.title }), h('span', { cls: 'dv-sp' }),
      h('button', { cls: 'dv-ghost', text: '✕', title: L.close, 'aria-label': L.close, on: { click: () => toggle(false) } })]));
    const follow = h('div', { cls: 'dv-warn dv-follow', hidden: '' }); card.appendChild(follow);
    const at = ui.pos();
    if (v && at && at.key !== v.key) { follow.hidden = false; follow.textContent = busyMsg ? L.following(at.key) : L.other(at.key); }
    if (!v || v.loading) { card.appendChild(h('div', { cls: 'dv-empty', text: '…' })); return mount(old); }
    if (v.error) { card.appendChild(h('div', { cls: 'dev-msg dv-err', text: v.error })); return mount(old); }
    const sum = summary(v);
    lastDirty = sum.unsaved;
    drawDeck(v, sum);
    const prog = h('div', { cls: 'dv-prog', id: 'dev-audio-prog', hidden: '' }, [h('i')]);
    card.appendChild(prog);
    const msg = h('div', { cls: 'dev-msg', id: 'dev-audio-msg' });
    if (busyMsg) { msg.className = 'dev-msg dv-ok'; msg.textContent = busyMsg; }
    card.appendChild(msg);
    drawHow(v, sum);
    drawStep(v);
    card.appendChild(h('div', { cls: 'dev-lock', text: L.locked }));
    mount(old);
  }
  // ---------------------------------------------------------------- A. この教材の音声：状態の 1 行と、いま押すボタン 1 つ
  function drawDeck(v, s) {
    const box = h('div', { cls: 'dv-deck', id: 'dev-audio-deck', role: 'status' });
    const lines = [];
    if (!s.n) lines.push([L.deck.noSegs, 'none']);
    else {
      if (!s.has) lines.push([L.deck.none(s.n), 'none']);
      else if (s.missing.length) lines.push([L.deck.some(s.n, s.has), 'some']);
      if (s.stale.length) lines.push([L.deck.stale(s.stale.length), 'stale', true]);
      if (s.voice.length) lines.push([L.deck.voice(s.voice.length), 'voice', true]);
      if (s.has && !s.need.length) lines.push([L.deck.all(s.n), 'all']);
    }
    if (s.unsaved) lines.push([L.deck.unsaved, 'unsaved', true]);
    for (const [text, kind, w] of lines) box.appendChild(h('div', { cls: 'dv-line' + (w ? ' dv-w' : ''), 'data-kind': kind, text }));
    // 取り込みの結果の知らせ（合わなかったステップがあれば、その分の「音声を更新」）
    if (colabNote) {
      for (const l of colabNote.lines) box.appendChild(h('div', { cls: 'dev-msg ' + (l.bad ? 'dv-err' : 'dv-ok') + ' dv-colab-msg', text: l.text }));
      const left = (colabNote.update || []).filter((k) => s.need.includes(k));
      if (left.length) {
        const b = h('button', { id: 'dev-audio-update-left', text: L.deck.update(left.length), on: { click: () => runAction(left) } });
        if (busyMsg) b.disabled = true;
        box.appendChild(h('div', { cls: 'dv-act' }, [b]));
      }
    }
    // いま押すボタン：音声が 1 つもなければ出さない（B を開いておく）。要るステップがあれば続ける、なければ 1 ファイルの保存
    let act = null;
    // 音声のないステップがあれば「残りの音声を作る」（古いステップもまとめて作る）、なければ「音声を更新」
    if (s.has && s.need.length) act = h('button', { cls: 'dv-pri', id: 'dev-audio-action', 'data-action': s.missing.length ? 'make' : 'update', text: s.missing.length ? L.deck.makeRest(s.need.length) : L.deck.update(s.need.length), on: { click: () => runAction(s.need) } });
    else if (s.unsaved && o.save) act = h('button', { cls: 'dv-pri', id: 'dev-audio-action', 'data-action': 'save', text: L.deck.save, on: { click: () => o.save() } });
    if (act) { if (busyMsg) act.disabled = true; box.appendChild(h('div', { cls: 'dv-act' }, [act])); }
    card.appendChild(box);
  }
  // A のボタン（と取り込みの後の「音声を更新」）：前に使ったやり方で、keys のステップを続ける。前のやり方がなければ B を開く
  async function runAction(keys) {
    if (busyMsg || !view || !keys.length) return;
    const m = methodOf(view);
    const usable = m && (m !== 'local' || localOk(view)) && (m !== 'cloud' || o.colab) && (m !== 'rec' || o.recMode);
    if (!usable) { howOpenUser = true; draw(view); const r = card && card.querySelector('#dev-audio-how input[type=radio]:checked, #dev-audio-how input[type=radio]'); if (r) try { r.focus({ preventScroll: false }); } catch { /* 無視 */ } return; }
    howSel = m;
    if (m === 'cloud') { howOpenUser = true; return exportJob(keys); }
    if (m === 'rec') return openRecMode(keys[0], true);
    return makeLocal(keys);
  }
  // 前に使ったやり方を覚える（作業フォルダでは egatari.json の studio.audioMethod。updateConfig でほかの項目はバイトのまま）
  async function remember(m) {
    methodMem = m;
    const ws = o.ws(), g = o.generation();
    if (!ws || ws.kind === 'memory' || (view && view.method === m)) return;
    try {
      const old = await ws.readText(CFG, { max: READ_LIMITS.json });
      const text = updateConfig(old, { studio: configMerge({ audioMethod: m }) });
      if (o.ws() !== ws || o.generation() !== g || text === old) return;
      if (old !== null) await ws.backup(CFG, { max: READ_LIMITS.json });
      await ws.writeText(CFG, text, { live: () => o.ws() === ws && o.generation() === g });
      if (view) view.method = m;
    } catch { /* 読めない設定のファイルは上書きしない（この画面の間だけ覚える） */ }
  }
  // ---------------------------------------------------------------- B. 音声をどう付けますか
  function drawHow(v, s) {
    const auto = !s.has || s.need.length > 0;   // 初めは開いている。音声がそろえばたたむ
    const det = h('details', { cls: 'dv-how dv-sec', id: 'dev-audio-how' });
    if (howOpenUser === null ? auto : howOpenUser) det.setAttribute('open', '');
    det.addEventListener('toggle', () => { if (det.open !== (howOpenUser === null ? auto : howOpenUser)) howOpenUser = det.open; });
    det.appendChild(h('summary', { text: L.how.legend }));
    const sel = howOf(v);
    const group = h('div', { role: 'radiogroup', 'aria-label': L.how.legend });
    // 声の欄は AI 音声の答えの上
    drawVoices(v, group);
    const opt = (m, label) => {
      const r = h('input', { type: 'radio', name: 'dv-how', id: 'dev-audio-how-' + m, value: m });
      if (m === sel) r.setAttribute('checked', '');
      r.addEventListener('change', () => { if (r.checked) { howSel = m; draw(view); } });
      if (busyMsg) r.disabled = true;
      return h('label', { cls: 'dv-opt', for: 'dev-audio-how-' + m }, [r, h('span', { text: label })]);
    };
    if (o.colab) { group.appendChild(opt('cloud', L.how.cloud)); if (sel === 'cloud') group.appendChild(cloudBody(v, s)); }
    if (localOk(v)) { group.appendChild(opt('local', L.how.local)); if (sel === 'local') group.appendChild(localBody(v, s)); }
    if (o.recMode) { group.appendChild(opt('rec', L.how.rec)); if (sel === 'rec') group.appendChild(recBody(v, s)); }
    det.appendChild(group);
    card.appendChild(det);
  }
  function localBody(v, s) {
    const info = o.tts.info(ttsLang(v));
    const go = h('button', { cls: 'dv-pri', id: 'dev-audio-local', text: s.need.length ? L.how.localGo(s.need.length) : L.how.localNone, on: { click: () => { remember('local'); makeLocal(summary(view).need); } } });
    if (!s.need.length || busyMsg) go.disabled = true;
    return h('div', { cls: 'dv-body', id: 'dev-audio-local-body' }, [
      h('div', { cls: 'dv-note', id: 'dev-audio-local-hint', text: L.how.localHint(MODEL_SIZE[engineOf(v)]) }),
      h('div', { cls: 'dv-tools' }, [go]),
      h('div', { cls: 'dv-prov', id: 'dev-audio-ttsinfo', text: info.label || '' })]);
  }
  function recBody(v, s) {
    const b = h('button', { cls: 'dv-rec', id: 'dev-audio-how-recbtn', text: L.how.recBtn, 'aria-keyshortcuts': 'r', 'aria-haspopup': 'dialog', on: { click: () => openRecMode(s.missing[0] || s.need[0] || v.key, true) } });
    if (busyMsg || !(v.segs || []).length) b.disabled = true;
    return h('div', { cls: 'dv-body', id: 'dev-audio-rec-body' }, [h('div', { cls: 'dv-tools' }, [b]), h('div', { cls: 'dv-note', text: L.how.recHint })]);
  }
  // クラウド（Google Colab）：C1 台本を書き出す → C2 Colab を開く（手順を板に書く）→ C3 できた音声を取り込む。終わった手順に ✓
  function cloudBody(v, s) {
    const C = o.colab.t;
    const tick = (on) => h('span', { cls: 'dv-tick', 'aria-hidden': 'true', text: on ? '✓' : '' });
    const step = (id, done, ctl, kids) => h('li', { id, 'data-done': done ? '1' : '0' }, [h('div', { cls: 'dv-c' }, [tick(done), ctl]), ...kids]);
    const exp = h('button', { id: 'dev-audio-colab-export', cls: 'dv-pri', text: C.c1, on: { click: () => exportJob(summary(view).need) } });
    if (busyMsg || !s.need.length) exp.disabled = true;
    const opn = h('a', { id: 'dev-audio-colab-open', cls: 'dv-btnlink', href: colabUrl(), target: '_blank', rel: 'noopener', title: C.c2T, text: C.c2, on: { click: () => { ticks.c2 = true; setTimeout(() => { if (view) draw(view); }, 0); } } });
    const imp = h('button', { id: 'dev-audio-colab-import', text: C.c3, on: { click: importZip } });
    if (busyMsg) imp.disabled = true;
    return h('div', { cls: 'dv-body', id: 'dev-audio-cloud-body' }, [h('ol', { cls: 'dv-steps' }, [
      step('dev-audio-c1', ticks.c1, exp, [h('div', { cls: 'dv-note', text: s.need.length ? C.c1Hint(s.need.length) : C.c1None })]),
      step('dev-audio-c2', ticks.c2, opn, [h('ol', { cls: 'dv-c2', id: 'dev-audio-c2-steps' }, C.steps.map((x) => h('li', { text: x }))), h('div', { cls: 'dv-note', id: 'dev-audio-c2-note', text: C.c2Note })]),
      step('dev-audio-c3', ticks.c3, imp, [h('div', { cls: 'dv-note', text: C.c3Hint })]),
    ])]);
  }
  // 鍵（スライドの鍵:ステップの鍵）を、画面の言葉の場所（「スライド 3・ステップ 2」）にする。見つからなければ鍵のまま
  function placeOf(key) {
    const j = key.lastIndexOf(':'), sk = key.slice(0, j), st = key.slice(j + 1);
    for (let i = 0; ; i++) { const s = ui.slide(i); if (!s) break; if (s.key === sk) return L.place(i + 1, st); }
    return key;
  }
  // ---------------------------------------------------------------- C. このステップ
  function drawStep(v) {
    const sec = h('section', { cls: 'dv-sec', id: 'dev-audio-step', 'aria-labelledby': 'dev-audio-step-head' });
    const s = ui.slide(v.i), sk = v.key.slice(v.key.lastIndexOf(':') + 1);
    sec.appendChild(h('div', { cls: 'dv-h', id: 'dev-audio-step-head', text: L.stepHead(v.i + 1, String((s && (s.heading || s.title)) || v.key.slice(0, v.key.lastIndexOf(':'))).replace(/\s+/g, ' ').trim(), sk) }));
    // 今の音声
    const cur = h('div', { cls: 'dv-cur', id: 'dev-audio-cur' });
    let player = null;
    if (v.entry) {
      const kind = ['recorded', 'tts', 'imported'].includes(v.entry.kind) ? v.entry.kind : 'tts';
      cur.appendChild(h('div', { cls: 'dv-row' }, [h('span', { cls: 'dv-badge dv-kind', text: L.kind[kind] }),
        typeof v.entry.dur === 'number' ? h('span', { text: '· ' + L.sec(v.entry.dur) }) : null,
        v.state === 'stale' ? h('span', { cls: 'dv-badge dv-stale', id: 'dev-audio-stale', text: L.stale, title: L.staleT }) : null]));
      const r = isObj(v.entry.recipe) ? v.entry.recipe : null;
      if (kind === 'tts') cur.appendChild(h('div', { cls: 'dv-prov', id: 'dev-audio-prov', text: r ? L.prov.tts(r) : L.kind.tts + ' ' + (v.entry.engine || '') }));
      if (v.state === 'stale') cur.appendChild(h('div', { cls: 'dv-note', text: L.staleT }));
      if (v.url) player = h('audio', { preload: 'metadata', src: v.url, id: 'dev-audio-player', hidden: '' });
      else if (v.err) cur.appendChild(h('div', { cls: 'dev-msg dv-err', text: v.err }));
    } else cur.appendChild(h('div', { cls: 'dv-row' }, [h('span', { cls: 'dv-empty', text: L.none })]));
    sec.appendChild(cur);
    if (v.override !== null) sec.appendChild(h('div', { cls: 'dv-warn', text: L.durOverride(v.override) }));
    // ボタン：聞く・読み上げで聞く・録音・ファイルから取り込む・前に戻す・この PC で作り直す
    const tools = [];
    if (player) {
      const pb = h('button', { id: 'dev-audio-play', text: L.play, 'aria-pressed': 'false', on: { click: () => { if (player.paused) { player.currentTime = 0; player.play().catch(() => {}); } else player.pause(); } } });
      const upd = () => { pb.textContent = player.paused ? L.play : L.playStop; pb.setAttribute('aria-pressed', player.paused ? 'false' : 'true'); };
      player.addEventListener('play', upd); player.addEventListener('pause', upd); player.addEventListener('ended', upd);
      tools.push(pb);
    }
    let readBtn = null, selBtn = null, reading = false;
    if (v.seg) {
      reading = readingAloud() && readKey === v.key;
      readBtn = h('button', { id: 'dev-audio-read', text: reading ? L.readStop : L.read, title: L.readT, 'aria-pressed': reading ? 'true' : 'false', on: { click: () => (readingAloud() ? stopRead() : readStep(v)) } });
      if (!readAloudSupported()) readBtn.disabled = true;
      tools.push(readBtn);
    }
    const recBtn = h('button', { cls: 'dv-rec', id: 'dev-audio-rec', text: L.rec, title: o.recMode ? o.recMode.title : '', 'aria-keyshortcuts': 'r', 'aria-haspopup': 'dialog', on: { click: () => openRecMode(v.key) } });
    const impBtn = h('button', { id: 'dev-audio-import', text: L.importBtn, on: { click: importFile } });
    if (!v.seg || busyMsg || !o.recMode) recBtn.disabled = true;
    if (!v.seg || busyMsg) impBtn.disabled = true;
    tools.push(recBtn, impBtn);
    const back = history.get(v.key) || [];
    if (back.length) { const rb = h('button', { cls: 'dv-revert', id: 'dev-audio-revert', text: L.revert, title: L.revertT(back.length), on: { click: () => revert(v.key) } }); if (busyMsg) rb.disabled = true; tools.push(rb); }
    // この PC で作れるときだけ
    if (localOk(v)) { const tb = h('button', { id: 'dev-audio-tts', text: L.local, title: o.tts.info(ttsLang(v)).label || '', on: { click: () => regenerate(v.key) } }); if (!v.seg || busyMsg) tb.disabled = true; tools.push(tb); }
    sec.appendChild(h('div', { cls: 'dv-tools' }, tools));
    if (player) sec.appendChild(player);
    if (v.seg) {
      const lab = h('div', { cls: 'dv-reading', id: 'dev-audio-reading', role: 'status', 'aria-live': 'polite', text: reading ? L.reading : '' });
      if (!reading) lab.hidden = true;
      sec.appendChild(lab);
      if (!readAloudSupported()) sec.appendChild(h('div', { cls: 'dv-note', id: 'dev-audio-read-no', text: L.readNoSynth }));
      if (readMsg && readMsg.key === v.key) sec.appendChild(h('div', { cls: 'dev-msg dv-err', id: 'dev-audio-read-msg', text: readMsg.text }));
    }
    // 台本（読むだけ。掛け合いなら両方の役に印）と、動きに合わせる所の数
    if (v.seg) {
      const two = v.roles && v.roles.has('novice');
      sec.appendChild(h('div', { cls: 'dv-h', text: L.script }));
      sec.appendChild(h('div', { cls: 'dv-script', id: 'dev-audio-script', title: L.scriptT }, v.seg.turns.map((t) => h('p', {}, [two ? h('span', { cls: 'dv-role' + (t.role === 'novice' ? ' dv-novice' : ''), text: t.role === 'novice' ? 'Novice' : 'Expert' }) : null, plain(t.display || t.raw)]))));
      selBtn = h('button', { id: 'dev-audio-read-sel', text: L.readSel, title: L.readSelT, on: { mousedown: (e) => e.preventDefault(), click: () => readSelection(v) } });
      if (!readAloudSupported()) selBtn.disabled = true;
      sec.appendChild(h('div', { cls: 'dv-tools dv-read' }, [selBtn]));
      const nc = expectedCues(v.seg);
      if (nc) sec.appendChild(h('div', { cls: 'dv-note', id: 'dev-audio-cues', text: L.cues(nc) }));
    } else sec.appendChild(h('div', { cls: 'dv-warn', text: L.noSeg }));
    // まだ使っていない取り直し（書けなかったときだけ）
    const list = takes.get(v.key) || [];
    if (list.length) {
      sec.appendChild(h('div', { cls: 'dv-h', text: L.takes }));
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
      sec.appendChild(box);
    }
    card.appendChild(sec);
  }
  // ---------------------------------------------------------------- 台本の言語（AI 音声のエンジンと読み辞書はこれで決める）
  // voice.json の "lang" ＞ 発言の文字（kit/core/narration-lint.mjs の narrationLang）＞ デッキの <html lang>。
  // 日本語のスライドに英語の台本なら Kokoro（英語）で読む（<html lang> だけで決めると英語の文を Irodori に渡してしまう）
  function ttsLang(v) {
    const texts = [];
    for (const x of (v && v.segs) || []) for (const t of x.turns) texts.push(plain(t.display || t.raw));
    return narrationLang({ voiceLang: v && v.voice ? v.voice.lang : undefined, deckLang: o.deckLang(), texts }).lang;
  }
  // ---------------------------------------------------------------- 声の欄（1 人なら「声」、掛け合いなら「説明する人の声」「質問する人の声」。新規作成の ② と同じ言葉）
  const engineOf = (v = view) => (/^ja\b/i.test(ttsLang(v)) ? 'irodori' : 'kokoro');
  // 役の声：1 ファイルの選択 > voice.json（エディタの AI 音声に入っている名前なら）> 既定。unknown：voice.json の入っていない名前
  function voiceOf(v, role) {
    const eng = engineOf(v), def = DEFAULT_VOICES[eng][role];
    if (own(voiceMem, role) && bundledVoice(eng, voiceMem[role])) return { name: bundledVoice(eng, voiceMem[role]), unknown: null };
    const raw = v && v.voice && typeof v.voice[role] === 'string' ? v.voice[role] : null;
    if (raw === null) return { name: def, unknown: null };
    const b = bundledVoice(eng, raw);
    return b ? { name: b, unknown: null } : { name: def, unknown: raw };
  }
  const roleLabel = (v, role) => ((v.roles || new Set()).has('novice') ? L.voice[role] : L.voice.one);
  function drawVoices(v, parent) {
    const eng = engineOf(v), roles = [...(v.roles || new Set(['expert']))].filter((r) => r === 'expert' || r === 'novice');
    const grid = h('div', { cls: 'dv-voices', id: 'dev-audio-voices' });
    const warns = [];
    for (const role of roles) {
      const cur = voiceOf(v, role), label = roleLabel(v, role);
      if (cur.unknown) warns.push(L.voiceUnknown(label, cur.unknown, cur.name));
      const sel = h('select', { 'data-role': role, 'aria-label': label });
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
      if (busyMsg) sel.disabled = true;
      grid.append(h('span', { cls: 'dv-vr', text: label }), sel, btn);
    }
    parent.appendChild(grid);
    for (const w of warns) parent.appendChild(h('div', { cls: 'dv-warn dv-voice-warn', text: w }));
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
    const ws = o.ws(), g = o.generation(), key = view.key, label = roleLabel(view, role);
    const live = () => o.ws() === ws && o.generation() === g;
    stopSample();
    if (ws.kind === 'memory') { voiceMem[role] = name; draw(view); say(L.voiceMem(label, name)); return; }
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
      say(L.voiceSaved(label, name));
    } catch (e) { say(L.fail + (e.message || e), true); }
  }
  function mount(old) {
    // 描き直す前にフォーカスのあったボタン（id のあるもの）は、新しい板の同じボタンに戻す
    const had = old && old.isConnected && old.contains(doc.activeElement) && doc.activeElement.id ? doc.activeElement.id : null;
    if (old) for (const a of old.querySelectorAll('audio')) if (!a.paused) a.pause();   // 外した板の音声を鳴らし続けない
    if (old && old.isConnected) old.replaceWith(card); else ui.side.appendChild(card);
    const back = focusRec && !card.closest('.rec-on') ? card.querySelector('#' + focusRec) || card.querySelector('#dev-audio-rec') : had ? card.querySelector('#' + had) : null;
    if (back && !back.disabled) { if (focusRec) focusRec = false; try { back.focus({ preventScroll: true }); } catch { /* 無視 */ } }
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
  // ステップの今の台本の inputHash（取り直しを作ったときのもの。保存までに台本が変われば、その取り直しは古いと分かる）
  async function currentHash(key) {
    const narr = await o.ws().readText('narration.md', { max: READ_LIMITS.narration });
    const seg = parseNarration(narr || '').find((s) => keyOf(s) === key);
    return seg ? { seg, hash: await inputHash(seg) } : { seg: null, hash: null };
  }

  // ---------------------------------------------------------------- 録音：そのステップで録音モード（app/rec-mode.js）を開く。板は開いたまま（録音モードの間は隠れる）
  // fromHow：B の「録音モードを開く (r)」・A のボタンから（やり方として覚え、閉じたらそのボタンにフォーカスを戻す）
  function openRecMode(key, fromHow = false) {
    if (!o.recMode || busyMsg) return;
    if (fromHow) remember('rec');
    const id = fromHow ? (card && card.contains(doc.activeElement) && doc.activeElement.id) || 'dev-audio-how-recbtn' : 'dev-audio-rec';
    o.recMode.open({ key, returnFocus: () => { focusRec = id; if (card && open) { const b = card.querySelector('#' + id) || card.querySelector('#dev-audio-rec'); if (b && !b.disabled) { focusRec = false; try { b.focus({ preventScroll: true }); } catch { /* 無視 */ } } } } });
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


  // ---------------------------------------------------------------- AI 音声をこの PC で作る（o.tts：app/tts-client.js。試験では差し替える）
  // 1 行（{cue} の部分）ずつ作り、行ごとに後処理（無音を削る・音量）をしてから、ターンの間に無音を入れてつなぐ（tts/synth.py と同じ）。
  // 日本語は読み辞書（tts/yomi.yaml。tts/yomi.py と同じ規則の app/yomi-data.js）を通した文を渡す
  // key のステップを作り直す。gate：テンプレートのままの台本を先に見せる（まとめて作るときは呼び手が 1 度だけ）。戻り値：できたら true
  async function regenerate(key, { gate = true, label = null } = {}) {
    if (busyMsg || !view || !o.tts) return false;
    const ws = o.ws(), g = o.generation();
    const vw = view;
    const lang = ttsLang(vw);
    const info = o.tts.info(lang);
    if (!info.ok) { say(L.ttsNo + info.reason, true); return false; }
    // テンプレートの仮の行（✎）のままの台本は、合成の前に知らせる（続けてもよい。kit/core/template-text.mjs）
    if (gate && o.beforeTts && !(await o.beforeTts([key]))) return false;
    if (busyMsg || o.ws() !== ws || o.generation() !== g) return false;
    setBusy(label || L.processing);
    const prog = () => card && card.querySelector('#dev-audio-prog');
    const stopWait = o.wait ? o.wait() : () => {};
    try {
      const { seg, hash } = await currentHash(key);
      if (!seg) throw new Error(L.noSeg);
      const ja = /^ja\b/i.test(lang);
      // 声：選んだ声か voice.json の声。エディタの AI 音声に入っていない名前は、板で知らせたとおり既定の声にする（日本語も英語も同じ。#19）
      const voices = { expert: voiceOf(vw, 'expert').name, novice: voiceOf(vw, 'novice').name };
      const jobs = [];
      const terms = (o.yomi && o.yomi.terms) || [];
      // 合成の直前だけ前処理する（normalizeTtsText。ttsParts と inputHash は変えない。format spec §5.4）
      seg.turns.forEach((t, ti) => t.ttsParts.forEach((p, pi) => jobs.push({ ti, pi, role: t.role, text: normalizeTtsText(ja ? applyYomi(p, terms).text : p) })));
      const out = seg.turns.map((t) => t.ttsParts.map(() => null));
      let done = 0, recipe = null, voiceMap = {};
      for (const j of jobs) {
        if (!j.text.trim()) { out[j.ti][j.pi] = new Float32Array(0); done++; continue; }
        const r = await o.tts.synth({ lang, text: j.text, role: j.role, voices, onProgress: (f, lab) => {
          const p = prog(); if (p) { p.hidden = false; p.firstChild.style.width = (100 * Math.max(0, Math.min(1, (done + f) / jobs.length))).toFixed(1) + '%'; }
          if (lab) { busyMsg = lab; const m = msgEl(); if (m) { m.className = 'dev-msg dv-ok'; m.textContent = (label ? label + ' ' : '') + lab; } }
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
  // 要るステップをまとめて作る（B の「この PC で作る」・A のボタン）。1 つ失敗したらそこで止める
  async function makeLocal(keys) {
    if (busyMsg || !view || !o.tts || !keys.length) return 0;
    if (o.beforeTts && !(await o.beforeTts(keys))) return 0;
    remember('local');
    let made = 0;
    for (let i = 0; i < keys.length; i++) {
      if (!(await regenerate(keys[i], { gate: false, label: L.making(i + 1, keys.length) }))) break;
      made++;
    }
    if (made) ui.toast(L.madeAll(made) + (o.ws() && o.ws().kind === 'memory' ? ' · ' + L.deck.unsaved : ''));
    return made;
  }

  // ---------------------------------------------------------------- クラウドで作る（Google Colab：tts-job.json を書き出す → ノートブック → ZIP ファイルを取り込む）
  let colabNote = null;   // 取り込みの結果の知らせ（板を描き直しても残す）：{lines: [{text, bad}], update: [台本が変わって使わなかったステップ]}
  function download(name, bytes, type) {
    const u = blobUrl(bytes, type);
    const a = h('a', { href: u, download: name, hidden: '' });
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { if (urls.has(u)) { URL.revokeObjectURL(u); urls.delete(u); } }, 60000);
  }
  // C1：keys のステップの台本を書き出す。台本を Google に渡す確かめは、このブラウザで初めての 1 回だけ
  async function exportJob(keys) {
    if (busyMsg || !view || !o.colab) return;
    const C = o.colab.t, ws = o.ws(), g = o.generation(), v = view;
    if (!keys || !keys.length) { say(C.noSteps, true); return; }
    if (o.beforeTts && !(await o.beforeTts(keys))) return;   // テンプレートの仮の行（✎）のまま
    if (!privacyOk) {
      if (!(await o.colab.confirm(C.confirmTitle, C.confirmBody, C.confirmGo, C.cancel))) return;
      privacyOk = true;
      try { win.localStorage.setItem(PRIVACY_KEY, '1'); } catch { /* 使えない環境：この画面の間だけ */ }
    }
    if (o.ws() !== ws || o.generation() !== g) return;
    try {
      const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
      const segs = parseNarration(narr || '');
      const voices = { expert: voiceOf(v, 'expert').name, novice: voiceOf(v, 'novice').name };
      const job = await buildJob({ segs, docId: await o.colab.docId(), title: o.colab.title ? await o.colab.title() : null, lang: ttsLang(v), voices, yomi: o.yomi || null, version: o.colab.version || '0', keys });
      if (o.ws() !== ws || o.generation() !== g) return;
      if (!job.steps.length) { say(C.noSteps, true); return; }
      download('tts-job.json', enc.encode(JSON.stringify(job, null, 1) + '\n'), 'application/json');
      ticks.c1 = true; ticks.c3 = false;
      howSel = 'cloud';
      colabNote = { lines: [{ text: C.exported(job.steps.length) }] };
      await remember('cloud');
      if (view) draw(view);
    } catch (e) { say(L.fail + (e.message || e), true); }
  }
  const enc = new TextEncoder();
  // C3：ふつうの <input type=file>（ZIP ファイル 1 つ）。フォルダを選ぶ仕組み（showDirectoryPicker など）は使わない（iPad の Safari・ファイル App でも選べるように）
  function importZip() {
    if (busyMsg || !view || !o.colab) return;
    const i = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed', hidden: '' });
    i.addEventListener('change', async () => {
      const f = i.files && i.files[0]; i.remove();
      if (f) await importZipFile(f);
    });
    doc.body.appendChild(i); i.click();
  }
  // ZIP ファイルを読んで取り込む。ダウンロード物（信頼しない）：大きさを読む前に確かめ、中身は kit/core/zip-read.mjs が上限つきで読み、コードは実行しない
  async function importZipFile(f) {
    const C = o.colab.t, ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    colabNote = null;
    setBusy(C.importing);
    const lines = [];
    let update = [];
    try {
      const bytes = await readFileBounded(f, { max: COLAB_LIMITS.zipBytes, what: 'zip' });
      const zip = await readColabZip(bytes);
      const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
      const segs = parseNarration(narr || '');
      const plan = await planImport({ zip, segs, docId: await o.colab.docId(), yomi: o.yomi || null });
      if (!live()) return;
      if (plan.reject) { lines.push({ text: plan.reject.code === 'doc-id' ? C.wrong + (plan.reject.title ? C.wrongOf(plan.reject.title) : '') : C.rejectRecords(plan.reject.why), bad: true }); return; }
      let applied = 0;
      const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
      if (no && plan.applied.length) lines.push({ text: no, bad: true });
      else {
        for (const it of plan.applied) {
          if (!live()) return;
          try {
            const d = decodeStepAudio(zip.files.get(it.file), it.rec);
            const take = await addTake(it.key, { kind: 'tts', pcm: d.pcm, sr: d.sr, dur: d.dur, cues: d.cues, recipe: it.rec.recipe, inputHash: it.rec.inputHash, gainDb: 0, at: Date.now() });
            if (await useTake(it.key, take.id, true, true)) applied++;
          } catch (e) {
            for (const t of takes.get(it.key) || []) freeUrl(t.url);
            takes.delete(it.key);
            lines.push({ text: C.applyFail(it.key, e.message || e), bad: true });
          }
        }
      }
      // 書き出した後に台本が変わったステップは使わない（「音声を更新」で作り直す）
      update = plan.marked.map((it) => it.key);
      const skipped = plan.skipped.filter((x) => x.key !== undefined);
      lines.unshift({ text: update.length ? C.partial(applied, update.length) : C.done(applied) });
      for (const x of skipped) lines.push({ text: C.skipped(x.key ? placeOf(x.key) : '?', C.skipWhy[x.why] || x.why), bad: true });
      if (plan.warnings.includes('dictionary')) lines.push({ text: C.warnDict, bad: true });
      if (plan.warnings.includes('processing')) lines.push({ text: C.warnProc, bad: true });
      if (applied) { ticks.c3 = true; await remember('cloud'); }
      if (applied && o.afterWrite) await o.afterWrite();
    } catch (e) { lines.push({ text: C.zipFail(e.message || e), bad: true }); }
    finally {
      if (live()) { busyMsg = null; colabNote = { lines, update }; if (view) show(view.key, view.i); }
    }
  }

  // ---------------------------------------------------------------- この音声を使う：MP3 にして audio/ と audio/manifest.json に書く
  // auto：作った直後（書けなければ取り直しとして残す）。前の記録は history に積む（「前に戻す」）
  // batch：Colab の取り込みのように何段階かを続けて使うとき（呼び手が busy を持ち、組み直し・知らせは最後に 1 度。失敗は投げる）
  // 戻り値：書けたか（録音モードが使う。書けなかった理由は useError）。書けなかった取り直しは「まだ使っていない音声」に残る
  let useError = null;
  async function useTake(key, id, auto = false, batch = false) {
    useError = null;
    const t = (takes.get(key) || []).find((x) => x.id === id);
    if (!t || (busyMsg && !batch)) { useError = 'busy'; return false; }
    const ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    // 取り消し（作業場所が替わった）：batch では busy は呼び手のものなので外さない
    const cancelled = () => { if (!batch) busyMsg = null; useError = 'cancelled'; return false; };
    const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
    if (no) { if (batch) throw new Error(no); useError = no; if (view) draw(view); say((auto ? L.notUsed + ' — ' : '') + no, true); return false; }
    if (!live()) return cancelled();
    if (!batch) setBusy(L.using);
    try {
      // MP3 のエンコーダ（LAME）は別のファイルを使うときだけ読み込む（o.loadMp3。app/mp3-loader.js）。読み込めない（1 ファイル版など）なら WAV
      const init = o.loadMp3 ? await o.loadMp3() : null;
      if (!live()) return cancelled();
      const bytes = init ? await encodeMp3(t.pcm, { init }) : encodeWav(t.pcm, t.sr);
      const file = takeFileName(t.kind, await sha256Hex(bytes), init ? 'mp3' : 'wav');
      const entry = takeEntry({ file, dur: t.dur, cues: t.kind === 'tts' || t.sync === 'manual' ? t.cues : null, sync: t.sync || null, kind: t.kind, inputHash: t.inputHash, recipe: t.recipe, processing: (t.recipe && t.recipe.processing) || PROCESSING, startOffset: init ? MP3.startOffset : 0 });
      const prev = await writeEntry(ws, live, key, entry, { file, bytes });
      if (prev === undefined) return cancelled();
      const back = history.get(key) || [];
      back.push(prev);
      history.set(key, back.slice(-20));
      for (const x of takes.get(key) || []) freeUrl(x.url);
      takes.delete(key);
      if (batch) return true;
      const portable = ws.kind === 'memory';
      if (o.afterWrite) await o.afterWrite();
      if (!live()) return cancelled();
      busyMsg = null;
      if (view && view.key === key) show(key, view.i); else follow(true);
      ui.toast((portable ? L.usedPortable : L.used(file)) + (init ? '' : L.wavNote), init ? '' : 'warn');
      return true;
    } catch (e) {
      if (batch) throw e;
      busyMsg = null; if (view) draw(view);
      useError = L.fail + (e && e.name === 'Cancelled' ? 'cancelled' : (e.message || e));
      say((auto ? L.notUsed + ' — ' : '') + useError, true);
      return false;
    }
  }
  // 録音モードの口：録った音声（processTake の結果＋ cue）を板を開かずにその段階の音声にする。{ok, error?}
  async function commit(key, t) {
    const take = await addTake(key, { kind: 'recorded', pcm: t.pcm, sr: t.sr, dur: t.dur, cues: t.cues || null, sync: t.sync || null, recipe: null, inputHash: (await currentHash(key)).hash, gainDb: t.gainDb, at: Date.now() });
    const ok = await useTake(key, take.id, true);
    return ok ? { ok: true } : { ok: false, error: useError || 'failed' };
  }
  // 段階の今の記録と古さ・口述原稿の段階（音声のファイルは読まない）
  async function peek(key) {
    const v = await loadStep(key, false);
    return { seg: v.seg, segs: v.segs, entry: v.entry, state: v.state, roles: v.roles, override: v.override };
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
    if (!back.length || busyMsg) return false;
    const ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
    if (no) { say(no, true); return false; }
    const prev = back[back.length - 1];
    if (prev && !(safeFile(prev.file) && (await ws.exists('audio/' + prev.file)))) { say(L.revertGone(String(prev.file)), true); return false; }
    if (!live()) return false;
    setBusy(L.using);
    try {
      const was = await writeEntry(ws, live, key, prev);
      if (was === undefined) { busyMsg = null; return false; }
      back.pop();
      if (back.length) history.set(key, back); else history.delete(key);
      if (o.afterWrite) await o.afterWrite();
      if (!live()) { busyMsg = null; return false; }
      busyMsg = null;
      if (view && view.key === key) show(key, view.i); else follow(true);
      ui.toast(prev ? L.reverted : L.revertedNone);
      return true;
    } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); return false; }
  }


  function reset() {
    stopSample();
    for (const list of takes.values()) for (const t of list) freeUrl(t.url);
    takes.clear(); history.clear(); colabNote = null; busyMsg = null; focusRec = false;
    methodMem = null; howSel = null; howOpenUser = null; ticks.c1 = ticks.c2 = ticks.c3 = false; lastDirty = null;
    for (const k of Object.keys(voiceMem)) delete voiceMem[k];
    if (card) { card.remove(); card = null; }
    if (view && view.url) freeUrl(view.url);
    flushUrls();
    view = null; open = false;
    ui.refresh();
  }
  return {
    toggle, reset, isOpen: () => open, isBusy: () => !!busyMsg,
    onPos: () => { if (open) follow(false); },
    // 1 ファイルの未保存が変わった（保存した・書いた）：A の 1 行を描き直す
    dirtyChanged: () => { const ws = o.ws(); const d = !!(ws && ws.kind === 'memory' && ws.dirty); if (open && view && !view.loading && !busyMsg && d !== lastDirty) draw(view); },
    reload: () => { if (!open) return; if (view && !busyMsg) show(view.key, view.i); else follow(true); },
    peek, commit, revert, canRevert: (key) => (history.get(key) || []).length > 0,
    // スライド一覧（app/slides-panel.js）：消したスライドのステップの、使っていない取り直しと前の記録を外す（元に戻すで putBack）。数だけを知るのは pendingFor
    pendingFor: (slideKey) => [...takes].filter(([k]) => splitKey(k)[0] === slideKey).reduce((n, [, l]) => n + l.length, 0),
    takeOut: (slideKey) => {
      const out = { takes: [], history: [] };
      for (const [k, l] of [...takes]) if (splitKey(k)[0] === slideKey) { out.takes.push([k, l]); takes.delete(k); }
      for (const [k, l] of [...history]) if (splitKey(k)[0] === slideKey) { out.history.push([k, l]); history.delete(k); }
      if (view && splitKey(view.key)[0] === slideKey && open) follow(true);
      return out;
    },
    putBack: (x) => {
      for (const [k, l] of (x && x.takes) || []) takes.set(k, [...(takes.get(k) || []), ...l]);
      for (const [k, l] of (x && x.history) || []) history.set(k, [...l, ...(history.get(k) || [])]);
      if (open) follow(true);
    },
    unsaved: () => [...takes.values()].reduce((n, l) => n + l.length, 0),
    state: () => ({ open, key: view ? view.key : null, busy: busyMsg, loading: !!(view && view.loading), state: view ? view.state || null : null, entry: view && view.entry ? { ...view.entry } : null,
      history: Object.fromEntries([...history].map(([k, l]) => [k, l.map((e) => (e ? e.file : null))])), voices: view && view.voice !== undefined ? { expert: voiceOf(view, 'expert').name, novice: voiceOf(view, 'novice').name } : null,
      sample: sample ? sample.dataset.name : null,
      deck: view && view.segs ? (({ n, has, missing, stale, voice, need, unsaved }) => ({ n, has, missing, stale, voice, need, unsaved }))(summary(view)) : null, how: view && view.segs ? howOf(view) : null, method: view ? methodOf(view) : null, ticks: { ...ticks },
      takes: Object.fromEntries([...takes].map(([k, l]) => [k, l.map((t) => ({ id: t.id, kind: t.kind, dur: t.dur, cues: t.cues, recipe: t.recipe, inputHash: t.inputHash, gainDb: t.gainDb }))])) }),
  };
}
