// 音声の板（編集アプリの信頼する横の板 #dev-side の中。プレビューの外）：段階ごとに、今の音声を聞く・録音する・ファイルから取り込む・
// ブラウザの TTS で作り直す・取り直しの一覧から選んで「この音声を使う」
//
// 守ること（SECURITY.md）：マイクと TTS はこのページ（信頼する編集の画面）だけで使う。プレビュー（sandbox の iframe）からは音声も
// 頼みも受け取らない（どの段階を見せるかは編集の画面の位置 ui.pos() から決め、デッキの知らせで板の中身を替えるのは録音していないときだけ）。
// 読み書きは作業場所（workspace.js）だけ：audio/<file>.mp3 と audio/manifest.json（書き換える前に .cache/edits/ に控え）。
// 読む大きさには上限がある（manifest・口述原稿は READ_LIMITS、音声は AUDIO_LIMITS.fileBytes）。
// 後処理（モノラル・44.1 kHz・無音を削る・-20 LUFS）は kit/core/audio-core.mjs（tts/core.py と同じ数）、MP3 は kit/core/mp3.mjs（LAME）。
// 取り直し（take）は段階ごとにメモリの上に置き、「この音声を使う」で作業場所に書くまで（または別のデッキを開くまで）残す。
// 持ち運べる 1 ファイルでは作業場所はメモリの上なので、「この音声を使う」の後に「保存」で段 A（kit/core/tier-a.mjs）の保存になる
//
//   const panel = createAudioPanel({ui, ws(), generation(), lang, deckLang(), beforeOpen?(), beforeWrite(kind), afterWrite(), tts?, yomi?: {terms, sha256}, loadMp3?()})
//   panel.toggle(on?) / panel.reset() / panel.onPos(pos) / panel.isOpen() / panel.isBusy() / panel.state()
import { processTake, joinParts, takeEntry, setManifestEntry, takeFileName, audioState, decodeWav, encodeWav, AUDIO_LIMITS, PROCESSING } from '../kit/core/audio-core.mjs';
import { encodeMp3 } from '../kit/core/mp3.mjs';
import { MP3 } from '../kit/core/audio-core.mjs';
import { inputHash, sha256Hex } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { readFileBounded } from './bounded-read.js';
import { applyYomi } from '../kit/core/yomi.mjs';

const STR = {
  ja: {
    title: '音声', close: '閉じる', step: '段階 ', slide: (n, t) => 'スライド ' + n + '：' + t, none: 'この段階の音声はまだありません',
    cur: '今の音声', fresh: '最新', stale: '古い', staleT: '口述原稿が、この音声を作った後に変わっています（または、どの原稿から作ったか分かりません）。音声は消さずに残します',
    kind: { recorded: '録音', tts: 'TTS', imported: '取り込み' }, sec: (s) => s.toFixed(2) + ' 秒',
    rec: '● 録音', stop: '■ 止める', reRec: '● 録り直す', recording: '録音中', processing: '整えています…', micNo: 'マイクを使えません：', micHint: 'ブラウザのアドレス欄の左でマイクを許可してください',
    importBtn: 'ファイルから取り込む…', tts: 'TTS で作り直す', ttsNo: 'この環境ではブラウザの TTS を使えません：',
    takes: '取り直し（保存していない）', noTakes: 'まだありません。録音・取り込み・TTS で作ると、ここに並びます', use: 'この音声を使う', del: '捨てる',
    using: '書き込んでいます…', used: (f) => '使いました（audio/' + f + '）', usedPortable: '使いました。ファイルに残すには「保存」を押してください',
    noSeg: 'この段階の口述原稿がありません（先に口述原稿を書いてください）', script: '読む原稿', cueNote: '録音と取り込みには {cue} の区切りの時刻がないので、区切りに合わせた動きは時間で進みます（sync: none）',
    durOverride: (d) => 'timeline.json の dur（' + d + ' 秒）がこの段階の長さを決めています。長い音声は途中で切れます', unsavedTakes: (n) => '保存していない取り直しが ' + n + ' 個あります',
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
    takes: 'Takes (not saved)', noTakes: 'None yet. Record, import or regenerate to add one', use: 'Use this take', del: 'Discard',
    using: 'Writing…', used: (f) => 'Using it (audio/' + f + ')', usedPortable: 'Using it. Press Save to keep it in the file',
    noSeg: 'This step has no narration (write the narration first)', script: 'Script', cueNote: 'Recorded and imported audio have no {cue} times, so cue-driven motion advances by time (sync: none)',
    durOverride: (d) => 'timeline.json fixes this step to ' + d + ' s (dur): longer audio is cut', unsavedTakes: (n) => n + ' unsaved take' + (n === 1 ? '' : 's'),
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
  '#dev-audio .dv-script{font-size:12.5px;color:#374151;background:#fff;border:1px dashed #cfd4de;border-radius:6px;padding:6px 8px;margin:0 0 10px;max-height:7.5em;overflow:auto}',
  '#dev-audio .dv-script p{margin:0 0 3px}#dev-audio .dv-script .dv-role{font-size:11px;color:#b7791f;margin-right:4px}',
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
  // 段階ごとの取り直し（メモリの上）：key → [{id, kind, pcm, sr, dur, cues, recipe, inputHash, url, gainDb, at}]
  const takes = new Map();
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
    return { key, g, seg, segs, entry, state, url, err, override, voice, manText: man.text };
  }

  // ---------------------------------------------------------------- 描く
  function close() {
    stopRecording(true);
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
    card = h('div', { id: 'dev-audio', cls: 'edit-ui dev-card', role: 'region', 'aria-label': L.title });
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
    // 今の音声
    const cur = h('div', { cls: 'dv-cur', id: 'dev-audio-cur' });
    if (v.entry) {
      const kind = ['recorded', 'tts', 'imported'].includes(v.entry.kind) ? v.entry.kind : 'tts';
      cur.appendChild(h('div', { cls: 'dv-row' }, [h('b', { text: L.cur }), h('span', { cls: 'dv-badge dv-kind', text: L.kind[kind] }),
        typeof v.entry.dur === 'number' ? h('span', { text: L.sec(v.entry.dur) }) : null,
        v.state === 'stale' ? h('span', { cls: 'dv-badge dv-stale', id: 'dev-audio-stale', text: L.stale, title: L.staleT }) : v.state === 'fresh' ? h('span', { cls: 'dv-badge dv-fresh', text: L.fresh }) : null]));
      const r = isObj(v.entry.recipe) ? v.entry.recipe : null;
      cur.appendChild(h('div', { cls: 'dv-prov', text: kind === 'tts' ? (r ? L.prov.tts(r) : 'TTS ' + (v.entry.engine || '')) : L.prov[kind] }));
      if (v.state === 'stale') cur.appendChild(h('div', { cls: 'dv-note', text: L.staleT }));
      if (v.url) { const a = h('audio', { controls: '', preload: 'metadata', src: v.url, id: 'dev-audio-player' }); cur.appendChild(a); }
      else if (v.err) cur.appendChild(h('div', { cls: 'dev-msg dv-err', text: v.err }));
    } else cur.appendChild(h('div', { cls: 'dv-empty', text: L.none }));
    card.appendChild(cur);
    if (v.override !== null) card.appendChild(h('div', { cls: 'dv-warn', text: L.durOverride(v.override) }));
    // 読む原稿
    if (v.seg) {
      card.appendChild(h('div', { cls: 'dv-h', text: L.script }));
      card.appendChild(h('div', { cls: 'dv-script' }, v.seg.turns.map((t) => h('p', {}, [t.role === 'novice' ? h('span', { cls: 'dv-role', text: 'Novice' }) : null, plain(t.display || t.raw)]))));
    } else card.appendChild(h('div', { cls: 'dv-warn', text: L.noSeg }));
    // 道具
    const list = takes.get(v.key) || [];
    const recBtn = h('button', { cls: 'dv-rec' + (rec ? ' dv-on' : ''), id: 'dev-audio-rec', text: rec ? L.stop : list.some((t) => t.kind === 'recorded') ? L.reRec : L.rec, on: { click: () => (rec ? stopRecording() : startRecording()) } });
    const impBtn = h('button', { id: 'dev-audio-import', text: L.importBtn, on: { click: importFile } });
    const ttsInfo = o.tts ? o.tts.info(o.deckLang()) : null;
    const ttsBtn = h('button', { id: 'dev-audio-tts', text: L.tts, title: ttsInfo ? ttsInfo.label : '', on: { click: regenerate } });
    if (!v.seg) { recBtn.disabled = !rec; impBtn.disabled = true; ttsBtn.disabled = true; }
    if (busyMsg) { recBtn.disabled = !rec; impBtn.disabled = true; ttsBtn.disabled = true; }
    if (!o.tts || (ttsInfo && !ttsInfo.ok)) ttsBtn.disabled = true;
    card.appendChild(h('div', { cls: 'dv-tools' }, [recBtn, impBtn, ttsBtn]));
    if (o.tts && ttsInfo) card.appendChild(h('div', { cls: 'dv-note', id: 'dev-audio-ttsinfo', text: ttsInfo.ok ? ttsInfo.label : L.ttsNo + ttsInfo.reason }));
    // 録音の大きさ
    const meter = h('div', { cls: 'dv-meter', id: 'dev-audio-meter', hidden: rec ? null : '' }, [h('span', { text: L.level }), h('span', { cls: 'dv-bar' }, [h('i')]), h('span', { cls: 'dv-t', text: '0.0 s' })]);
    if (!rec) meter.setAttribute('hidden', ''); else meter.removeAttribute('hidden');
    card.appendChild(meter);
    const prog = h('div', { cls: 'dv-prog', id: 'dev-audio-prog', hidden: '' }, [h('i')]);
    card.appendChild(prog);
    const msg = h('div', { cls: 'dev-msg', id: 'dev-audio-msg' });
    if (busyMsg) { msg.className = 'dev-msg dv-ok'; msg.textContent = busyMsg; }
    card.appendChild(msg);
    // 取り直し
    card.appendChild(h('div', { cls: 'dv-h', text: L.takes }));
    const box = h('div', { id: 'dev-audio-takes' });
    if (!list.length) box.appendChild(h('div', { cls: 'dv-empty', text: L.noTakes }));
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
    if (list.some((t) => t.kind !== 'tts') || (v.seg && v.seg.turns.some((t) => t.ttsParts.length > 1))) card.appendChild(h('div', { cls: 'dv-note', text: L.cueNote }));
    card.appendChild(h('div', { cls: 'dev-lock', text: L.locked }));
    mount(old);
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
          await addTake(r.key, { kind: 'recorded', pcm: p.pcm, sr: p.sr, dur: p.dur, cues: null, recipe: null, inputHash: hash, gainDb: p.gainDb, at: Date.now() });
          busyMsg = null;
          if (view) draw(view);
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
        await addTake(key, { kind: 'imported', pcm: p.pcm, sr: p.sr, dur: p.dur, cues: null, recipe: null, inputHash: hash, gainDb: p.gainDb, at: Date.now() });
        busyMsg = null; if (view) draw(view);
      } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); }
    });
    doc.body.appendChild(i); i.click();
  }

  // ---------------------------------------------------------------- ブラウザの TTS で作り直す（o.tts：app/tts-client.js。試験では差し替える）
  // 1 行（{cue} の部分）ずつ作り、行ごとに後処理（無音を削る・音量）をしてから、ターンの間に無音を入れてつなぐ（tts/synth.py と同じ）。
  // 日本語は読み辞書（tts/yomi.yaml。tts/yomi.py と同じ規則の app/yomi-data.js）を通した文を渡す
  async function regenerate() {
    if (busyMsg || !view || !view.seg || !o.tts) return;
    const key = view.key, ws = o.ws(), g = o.generation();
    const lang = o.deckLang();
    const info = o.tts.info(lang);
    if (!info.ok) { say(L.ttsNo + info.reason, true); return; }
    setBusy(L.processing);
    const prog = () => card && card.querySelector('#dev-audio-prog');
    try {
      const { seg, hash } = await currentHash(key);
      if (!seg) throw new Error(L.noSeg);
      const ja = /^ja\b/i.test(lang);
      const voices = { expert: typeof view.voice.expert === 'string' ? view.voice.expert : 'bob', novice: typeof view.voice.novice === 'string' ? view.voice.novice : 'alice' };
      const jobs = [];
      const terms = (o.yomi && o.yomi.terms) || [];
      seg.turns.forEach((t, ti) => t.ttsParts.forEach((p, pi) => jobs.push({ ti, pi, role: t.role, text: ja ? applyYomi(p, terms).text : p })));
      const out = seg.turns.map((t) => t.ttsParts.map(() => null));
      let done = 0, recipe = null, voiceMap = {};
      for (const j of jobs) {
        if (!j.text.trim()) { out[j.ti][j.pi] = new Float32Array(0); done++; continue; }
        const r = await o.tts.synth({ lang, text: j.text, role: j.role, voices, onProgress: (f, label) => {
          const p = prog(); if (p) { p.hidden = false; p.firstChild.style.width = (100 * Math.max(0, Math.min(1, (done + f) / jobs.length))).toFixed(1) + '%'; }
          if (label) { busyMsg = label; const m = msgEl(); if (m) { m.className = 'dev-msg dv-ok'; m.textContent = label; } }
        } });
        if (o.ws() !== ws || o.generation() !== g) return;
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
      const rc = { engine: String(recipe.engine), model: String(recipe.model), voice: {}, seed: Number.isInteger(recipe.seed) ? recipe.seed : null, dictionary: ja && o.yomi ? o.yomi.sha256 : null, processing: PROCESSING };
      for (const [role, name] of Object.entries(voiceMap)) if ((role === 'expert' || role === 'novice') && seg.turns.some((t) => t.role === role) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(name))) rc.voice[role] = String(name);
      await addTake(key, { kind: 'tts', pcm: joined.pcm, sr: 44100, dur: joined.dur, cues: joined.cues, recipe: rc, inputHash: hash, gainDb: 0, at: Date.now() });
      busyMsg = null; if (view) draw(view);
    } catch (e) { busyMsg = null; if (view) draw(view); say(L.fail + (e.message || e), true); }
  }

  // ---------------------------------------------------------------- この音声を使う：MP3 にして audio/ と audio/manifest.json に書く
  async function useTake(key, id) {
    const t = (takes.get(key) || []).find((x) => x.id === id);
    if (!t || busyMsg) return;
    const ws = o.ws(), g = o.generation();
    const live = () => o.ws() === ws && o.generation() === g;
    const no = o.beforeWrite ? await o.beforeWrite('audio') : null;
    if (no) { say(no, true); return; }
    if (!live()) return;
    setBusy(L.using);
    try {
      // MP3 のエンコーダ（LAME）は別のファイルを使うときだけ読み込む（o.loadMp3。app/mp3-loader.js）。読み込めない（1 ファイル版など）なら WAV
      const init = o.loadMp3 ? await o.loadMp3() : null;
      if (!live()) return;
      const bytes = init ? await encodeMp3(t.pcm, { init }) : encodeWav(t.pcm, t.sr);
      const file = takeFileName(t.kind, await sha256Hex(bytes), init ? 'mp3' : 'wav');
      const man = await readJson(ws, 'audio/manifest.json');
      if (man.bad) throw new Error('audio/manifest.json is not JSON');
      const narr = await ws.readText('narration.md', { max: READ_LIMITS.narration });
      const order = parseNarration(narr || '').map((s) => `${s.slideKey}:${s.stepKey}`);
      const entry = takeEntry({ file, dur: t.dur, cues: t.kind === 'tts' ? t.cues : null, kind: t.kind, inputHash: t.inputHash, recipe: t.recipe, processing: PROCESSING, startOffset: init ? MP3.startOffset : 0 });
      const next = setManifestEntry(man.text, key, entry, order);
      if (!live()) return;
      if (man.text !== null) await ws.backup('audio/manifest.json', { max: READ_LIMITS.json });
      if (!live()) return;
      if (!(await ws.exists('audio/' + file))) await ws.writeBytes('audio/' + file, bytes, { live });
      // 書く直前に：manifest が読んだときのままか（ほかの道具が書いていれば上書きしない）
      if ((await ws.readText('audio/manifest.json', { max: READ_LIMITS.json })) !== man.text) throw new Error('audio/manifest.json changed while saving (reload)');
      if (!live()) return;
      await ws.writeText('audio/manifest.json', next, { live });
      for (const x of takes.get(key) || []) freeUrl(x.url);
      takes.delete(key);
      busyMsg = null;
      const portable = ws.kind === 'memory';
      if (o.afterWrite) await o.afterWrite();
      if (!live()) return;
      if (view && view.key === key) show(key, view.i); else follow(true);
      ui.toast((portable ? L.usedPortable : L.used(file)) + (init ? '' : L.wavNote), init ? '' : 'warn');
    } catch (e) {
      busyMsg = null; if (view) draw(view);
      say(L.fail + (e && e.name === 'Cancelled' ? 'cancelled' : (e.message || e)), true);
    }
  }

  function reset() {
    stopRecording(true);
    for (const list of takes.values()) for (const t of list) freeUrl(t.url);
    takes.clear(); busyMsg = null;
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
    state: () => ({ open, key: view ? view.key : null, recording: !!rec, busy: busyMsg, state: view ? view.state || null : null, entry: view && view.entry ? { ...view.entry } : null,
      takes: Object.fromEntries([...takes].map(([k, l]) => [k, l.map((t) => ({ id: t.id, kind: t.kind, dur: t.dur, cues: t.cues, recipe: t.recipe, inputHash: t.inputHash, gainDb: t.gainDb }))])) }),
    // 試験：録音を止める（MediaRecorder の終わりを待つ）
    stop: () => stopRecording(),
  };
}
