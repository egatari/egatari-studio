// 録音モード（backlog #47）：口述原稿を大きく出し、キーボードだけで段階ごとに自分の声を録る。r（または音声の板の「● 録音 (r)」）で入り、Esc で抜ける。
// 録り方はこれ 1 つ（#82）：音声の板の録音はここを開く。1 段だけなら Space で録って Space で止め、Esc で板に戻る（板はその段階の新しい音声を見せる）。
// 編集アプリのページ（信頼する画面）の中の、幅広い板（プレビューを横に細くして、その段階の舞台を見せる）。
//
// 守ること（SECURITY.md・app/audio-panel.js と同じ）：マイク・録音・後処理・書き込みはこのページだけ。プレビュー（sandbox の iframe）は
// 何も頼めない（プレビューからの知らせで開けるのはこの板だけで、録音は始まらない。録音している間プレビューは inert）。
// 読み書きは音声の板（createAudioPanel の peek / commit / revert）を通す：audio/<file>.mp3 と audio/manifest.json（kind recorded）・
// 前の音声は「前に戻す」（#45）で戻せる・権利の確認と読むだけの文書の断りは音声の板と同じ。
//
// キー（この板が開いている間は再生器・ほかの欄のキーより優先）：
//   Space  録音の開始／停止。停止すると前後の無音を削って音量を整え（processTake）、すぐその段階の音声にする（同じ段階に留まる）
//   Enter  録音中なら停止して採用し次の段階へ。録った後（または音声のある段階）なら次の段階へ。次の段階は待機（自動では録り始めない）
//   Backspace  取り直し：録音中は今のテイクを捨てる。録った後はそのテイクを「前に戻す」で外す（前の音声に戻る）
//   ← →    前・次の段階（録音中なら先に停止して採用）
//   C      録音中に、口述原稿の {cue}・{mark:…} の区切り（どちらも数える。kit の cue と同じ並び）ごとに押す（時刻をそのまま cue に：sync manual。数が合わなければ sync none）
//   Esc    閉じる（録音中なら今のテイクを捨てる。Shift+Esc は開いている窓を全部）
//
//   const rec = createRecMode({ui, panel, T, host, top?, ws(), generation(), slideIndex?(slideKey), enabled(), beforeOpen?(), onChange?(), maxSeconds?()})
//   rec.open({key?（この段階で開く。既定は画面の段階）, returnFocus?()（閉じたとき、開く前のフォーカスが無くなっていれば呼ぶ）}) / rec.close() / rec.isOpen() / rec.isBusy() / rec.reset() / rec.state()
import { processTake, cuesFromTaps, AUDIO_LIMITS } from '../kit/core/audio-core.mjs';
import { readFileBounded } from './bounded-read.js';

const TAIL_MS = 150;   // 止めるキーを押してから録音を終えるまで（MediaRecorder の停止の遅れと語尾の切れを防ぐ小さな尾）
const BOUND = /(\{(?:cue|mark:[^{}]*)\})/;
const READING = /\{([^{}|]+)\|([^{}]+)\}/g;
const chipMark = (n) => (n < 20 ? String.fromCodePoint(0x2460 + n) : String(n + 1));

export function createRecMode(o) {
  const ui = o.ui, h = ui.h, doc = ui.side.ownerDocument, win = doc.defaultView, L = o.T;
  const reduce = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let root = null, view = null, prevFocus = null, openState = false, seq = 0;
  // 段階の並び（口述原稿のある段階）と今の段階
  let steps = [], idx = 0, step = null;
  // 'idle' 待機 | 'starting' マイクを開いている | 'recording' | 'processing'（止めてから書き終わるまで）
  let phase = 'idle';
  let mic = null;            // 開いたマイク {stream, ac, an, src, raf, peak, raw}。モードを閉じるまで開いたまま（1 回の許可・録り始めの遅れを防ぐ）
  let take = null;           // 録音中 {key, mr, chunks, t0, taps, bounds, timer}
  let after = null;          // 整えている間に押された「次へ・移動」
  let mine = new Set();      // このモードで録って、まだ「前に戻して」いない段階
  let returnFocus = null;    // 開いた口（音声の板）にフォーカスを戻す
  // 1 つのテイクの長さの上限（秒。AUDIO_LIMITS.maxSeconds = 600。試験だけ o.maxSeconds で短くする）
  const maxSec = () => { const v = o.maxSeconds ? o.maxSeconds() : null; return typeof v === 'number' && v > 0 ? v : AUDIO_LIMITS.maxSeconds; };
  let result = null;         // 直前のテイクの結果（表示用）{key, dur, gainDb, clip, sync, taps, bounds}。raw・head・tail・loudness・peakDb・tapTimes はテスト用（state() から読む）
  const mkEl = (t, p, kids) => h(t, p, kids);

  // ---------------------------------------------------------------- 読み上げソフトへの知らせ（段階・状態が変わるたびに）
  let liveEl = null, alertEl = null;
  function say(text) { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { if (liveEl) liveEl.textContent = text; }, 40); }
  function alertMsg(text) { if (!alertEl) return; alertEl.textContent = ''; setTimeout(() => { if (alertEl) alertEl.textContent = text; }, 40); }

  // ---------------------------------------------------------------- 描く
  function build() {
    const keyBtn = (id, key, label, fn) => mkEl('button', { type: 'button', id: 'rec-b-' + id, cls: 'rm-btn', 'aria-keyshortcuts': key, on: { click: () => { fn(); focusRoot(); } } }, [mkEl('kbd', { text: L.keyName[id] || key }), mkEl('span', { text: label })]);
    root = mkEl('aside', { id: 'rec-mode', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rec-title', tabindex: '-1' });
    root.appendChild(mkEl('div', { cls: 'rm-head' }, [
      mkEl('h2', { id: 'rec-title', text: L.title }), mkEl('span', { id: 'rec-pos', cls: 'rm-pos' }),
      mkEl('span', { id: 'rec-count', cls: 'rm-pos' }), mkEl('span', { id: 'rec-state', cls: 'rm-state', 'data-phase': 'idle' }), mkEl('span', { cls: 'sp' }),
      mkEl('button', { type: 'button', id: 'rec-close', cls: 'rm-btn ghost', 'aria-keyshortcuts': 'Escape', on: { click: () => { requestClose(false); } } }, [mkEl('kbd', { text: 'Esc' }), mkEl('span', { text: L.close })]),
    ]));
    root.appendChild(mkEl('div', { id: 'rec-slide', cls: 'rm-slide' }));
    root.appendChild(mkEl('div', { id: 'rec-notes', cls: 'rm-notes' }));
    root.appendChild(mkEl('div', { id: 'rec-script', cls: 'rm-script', 'aria-label': L.script, role: 'group' }));
    root.appendChild(mkEl('div', { id: 'rec-meter', cls: 'rm-meter', 'aria-hidden': 'true' }, [mkEl('span', { text: L.level }), mkEl('span', { cls: 'bar' }, [mkEl('i')]), mkEl('span', { id: 'rec-time', cls: 't', text: '0.0 s' })]));
    root.appendChild(mkEl('div', { id: 'rec-take', cls: 'rm-take' }));
    root.appendChild(mkEl('div', { id: 'rec-keys', cls: 'rm-keys', role: 'group', 'aria-label': L.keys }, [
      keyBtn('space', 'Space', L.btnRec, () => toggleRecording()),
      keyBtn('enter', 'Enter', L.btnNext, () => enter()),
      keyBtn('back', 'Backspace', L.btnRetake, () => retake()),
      keyBtn('prev', 'ArrowLeft', L.btnPrev, () => move(-1)),
      keyBtn('nextstep', 'ArrowRight', L.btnNextStep, () => move(1)),
      keyBtn('cue', 'C', L.btnCue, () => tapCue()),
    ]));
    liveEl = mkEl('div', { id: 'rec-live', cls: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    alertEl = mkEl('div', { id: 'rec-alert', cls: 'sr-only', role: 'alert' });
    root.append(liveEl, alertEl);
    return root;
  }
  const $ = (id) => root && root.querySelector('#' + id);
  function focusRoot() { try { if (root) root.focus({ preventScroll: true }); } catch { /* 無視 */ } }
  function setPhase(p) {
    phase = p;
    const s = $('rec-state');
    if (s) { s.dataset.phase = p; s.textContent = L.phase[p]; }
    const sp = $('rec-b-space');
    if (sp) { sp.querySelector('span').textContent = p === 'recording' ? L.btnStop : L.btnRec; sp.setAttribute('aria-pressed', p === 'recording' ? 'true' : 'false'); sp.classList.toggle('on', p === 'recording'); }
    if (root) root.classList.toggle('rm-recording', p === 'recording');
    const f = ui.refresh; if (f) f();
    if (o.onChange) o.onChange();
  }
  // 口述原稿を、区切り（{cue}・{mark}）をチップにして描く（掛け合いなら役の印）
  function drawScript(seg, roles) {
    const box = $('rec-script');
    box.textContent = '';
    if (!seg) { box.appendChild(mkEl('p', { cls: 'rm-empty', text: L.noSeg })); return; }
    const two = roles && roles.has('novice');
    let n = 0;
    const total = seg.bounds.length;
    for (const t of seg.turns) {
      const p = mkEl('p', {});
      if (two) p.appendChild(mkEl('span', { cls: 'rm-role' + (t.role === 'novice' ? ' novice' : ''), text: t.role === 'novice' ? 'Novice' : 'Expert' }));
      for (const piece of String(t.raw).split(BOUND)) {
        if (/^\{(?:cue|mark:)/.test(piece)) {
          const b = seg.bounds[n] || { type: 'cue' };
          p.appendChild(mkEl('span', { cls: 'rm-chip', 'data-n': String(n), role: 'img', 'aria-label': L.chipLabel(n + 1, total, b) , text: chipMark(n) }));
          n++;
        } else p.appendChild(doc.createTextNode(piece.replace(READING, '$1')));
      }
      box.appendChild(p);
    }
    paintChips();
  }
  // 押した数に合わせてチップの印（済み・次）を付ける
  function paintChips() {
    const taps = take ? take.taps.length : (result && step && result.key === step.key ? result.taps : 0);
    const chips = root ? [...root.querySelectorAll('.rm-chip')] : [];
    chips.forEach((c, j) => {
      c.classList.toggle('done', j < taps);
      c.classList.toggle('next', !!take && j === taps);
      c.textContent = (j < taps ? '✓' : '') + chipMark(j);
    });
    // 押した数 / 区切りの数（{cue} も {mark} も数える。kit の cue と同じ並び）
    const cnt = $('rec-count');
    if (cnt) cnt.textContent = chips.length && (take || taps) ? L.count(taps, chips.length) : '';
    const nx = take && chips[taps];
    if (nx) { try { nx.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); } catch { /* 無視 */ } }
  }
  // 今の段階の知らせ：題・音声の有無と古さ・時間の上書き・区切りの案内・直前のテイクの結果
  function drawNotes(info) {
    const box = $('rec-notes');
    box.textContent = '';
    const add = (cls, text, id) => box.appendChild(mkEl('div', { cls: 'rm-note ' + cls, text, ...(id ? { id } : {}) }));
    const e = info && info.entry;
    if (e) {
      const kind = L.kind[['recorded', 'tts', 'imported'].includes(e.kind) ? e.kind : 'tts'];
      add('', L.cur(kind, typeof e.dur === 'number' ? e.dur : null), 'rec-cur');
      if (info.state === 'stale') add('warn', L.stale, 'rec-stale');
    } else add('', L.noAudio, 'rec-cur');
    if (info && info.override !== null) add('warn', L.durOverride(info.override));
    const n = step ? step.seg.bounds.length : 0;
    if (n > 0) {
      const synced = e && e.sync === 'manual' && Array.isArray(e.cues) && e.cues.length === n;
      if (take) add('', L.cueGuide(n), 'rec-cueguide');
      else if (!synced) add('warn', L.noCues(n), 'rec-nocues');
      else add('', L.cuesSet(n), 'rec-nocues');
    }
  }
  function drawTake() {
    const box = $('rec-take');
    box.textContent = '';
    if (!result || !step || result.key !== step.key) return;
    const r = result;
    const rows = [L.takeDone(r.dur, r.gainDb)];
    if (r.sync === 'manual') rows.push(L.takeCues(r.taps));
    box.appendChild(mkEl('div', { cls: 'rm-note ok', id: 'rec-result', text: rows.join(' · ') }));
    if (r.clip) box.appendChild(mkEl('div', { cls: 'rm-note warn', id: 'rec-clip', text: L.clip }));
    if (r.mismatch) box.appendChild(mkEl('div', { cls: 'rm-note warn', id: 'rec-mismatch', text: L.mismatch(r.taps, r.bounds) }));
    if (r.limit) box.appendChild(mkEl('div', { cls: 'rm-note warn', id: 'rec-limit', text: r.limit }));
    if (r.error) box.appendChild(mkEl('div', { cls: 'rm-note bad', id: 'rec-err', text: r.error }));
  }
  async function show(i, { announce = true } = {}) {   // 戻り値：読み上げ用の段階の知らせ
    const my = ++seq;
    const s = steps[i];
    idx = i;
    step = null;
    const key = `${s.slideKey}:${s.stepKey}`;
    ui.goStep(s.slideKey, s.stepKey);
    let info = null;
    try { info = await o.panel.peek(key); } catch (e) { alertMsg(L.fail + (e.message || e)); }
    if (my !== seq || !openState) return '';
    if (info && info.segs) steps = info.segs.map((x) => x);
    const seg = (info && info.seg) || s;
    step = { key, seg, slideKey: s.slideKey, stepKey: s.stepKey };
    const sl = ui.slide(o.slideIndex ? o.slideIndex(s.slideKey) : -1);
    const heading = String((sl && (sl.heading || sl.title)) || s.slideKey).replace(/\s+/g, ' ').trim();
    $('rec-pos').textContent = L.pos(idx + 1, steps.length);
    $('rec-slide').textContent = L.slide(heading, s.stepKey === 'concl' ? L.concl : s.stepKey);
    drawNotes(info);
    drawScript(seg, info && info.roles);
    drawTake();
    const stale = info && info.state === 'stale';
    const msg = L.announceStep(idx + 1, steps.length, heading, s.stepKey === 'concl' ? L.concl : s.stepKey, !!(info && info.entry), !!stale, seg.bounds.length);
    if (announce) say(msg);
    const sc = $('rec-script'); if (sc) sc.scrollTop = 0;
    return msg;
  }

  // ---------------------------------------------------------------- マイク（モードの間は開いたまま。録っていない間も大きさは見える）
  async function openMic() {
    if (mic) { if (mic.ac.state === 'suspended') await mic.ac.resume().catch(() => {}); return true; }
    let stream;
    try { stream = await win.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }); }
    catch (e) { alertMsg(L.micNo + (e.message || e.name || e) + ' — ' + L.micHint); const b = $('rec-take'); if (b) { b.textContent = ''; b.appendChild(mkEl('div', { cls: 'rm-note bad', id: 'rec-err', text: L.micNo + (e.message || e.name || e) + ' — ' + L.micHint })); } return false; }
    if (!openState) { stream.getTracks().forEach((t) => t.stop()); return false; }
    const ac = new win.AudioContext(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 2048; src.connect(an);
    if (ac.state === 'suspended') await ac.resume().catch(() => {});
    const m = mic = { stream, ac, an, src, raf: 0, peak: 0, lastDraw: 0 };
    const buf = new Float32Array(an.fftSize);
    const tick = (now) => {
      if (mic !== m) return;
      an.getFloatTimeDomainData(buf);
      let pk = 0; for (let j = 0; j < buf.length; j++) pk = Math.max(pk, Math.abs(buf[j]));
      if (take) m.peak = Math.max(m.peak, pk);
      // 動きを控えたい設定では、メーターを 1 秒に 4 回だけ更新する
      if (!reduce() || now - m.lastDraw > 250) {
        m.lastDraw = now;
        const db = pk > 0 ? 20 * Math.log10(pk) : -90;
        const bar = root && root.querySelector('#rec-meter i');
        if (bar) bar.style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)).toFixed(1) + '%';
        const t = $('rec-time');
        if (t) t.textContent = (take && take.t0 ? (performance.now() - take.t0) / 1000 : 0).toFixed(1) + ' s';
        if (take && take.t0 && (performance.now() - take.t0) / 1000 > maxSec()) overLimit();
      }
      m.raf = win.requestAnimationFrame(tick);
    };
    m.raf = win.requestAnimationFrame(tick);
    return true;
  }
  function closeMic() {
    const m = mic; mic = null;
    if (!m) return;
    win.cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ac.close().catch(() => {});
  }

  // ---------------------------------------------------------------- 録音（Space・Enter・Backspace・C・← →）
  async function toggleRecording() {
    if (!step || phase === 'starting' || phase === 'processing') return;
    if (phase === 'recording') { await stopAndCommit(false); return; }
    if (o.panel.isBusy()) return;
    const my = seq, key = step.key, bounds = step.seg.bounds.length;
    setPhase('starting');
    result = null; drawTake();
    if (!(await openMic())) { setPhase('idle'); return; }
    if (!openState || my !== seq || !step || step.key !== key) { setPhase('idle'); return; }
    const chunks = [];
    let mr;
    try { mr = new win.MediaRecorder(mic.stream); }
    catch (e) { const m = L.fail + (e.message || e.name || e); result = { key, error: m, taps: 0, bounds }; drawTake(); alertMsg(m); setPhase('idle'); return; }
    const t = take = { key, mr, chunks, t0: 0, taps: [], bounds, timer: 0 };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    // 録音が実際に始まった時刻を 0 にする（C の時刻の基準）。上限の時刻で止める（メーターの描画が止まっている裏のタブでも）
    mr.onstart = () => { t.t0 = performance.now(); t.timer = setTimeout(() => { if (take === t) overLimit(); }, maxSec() * 1000 + 50); };
    mic.peak = 0;
    mr.start(250);
    setPhase('recording');
    paintChips();
    say(L.announceRec(bounds));
    o.panel.peek(key).then((info) => { if (take === t && step && step.key === key) drawNotes(info); }, () => {});
  }
  // 上限（600 秒）を超えた：止めて、ここまでを使う（音声の板と同じ）
  function overLimit() {
    if (!take) return;
    take.limit = L.tooLong(maxSec());
    alertMsg(take.limit);
    stopAndCommit(false);
  }
  function tapCue() {
    if (phase !== 'recording' || !take || !take.t0) return;
    take.taps.push((performance.now() - take.t0) / 1000);
    const n = take.taps.length, total = take.bounds;
    paintChips();
    say(total ? L.announceCue(n, total) : L.announceCueNone);
  }
  // 録音を止めて、整えて、その段階の音声にする。discard：捨てる。戻り値：書けたか
  async function stopAndCommit(discard) {
    const t = take;
    if (!t) return false;
    take = null;
    if (discard) {
      clearTimeout(t.timer);
      try { t.mr.ondataavailable = null; t.mr.onstop = null; if (t.mr.state !== 'inactive') t.mr.stop(); } catch { /* 無視 */ }
      setPhase('idle'); paintChips();
      return false;
    }
    clearTimeout(t.timer);
    setPhase('processing');
    say(L.processing);
    const key = t.key;
    let ok = false;
    try {
      // 小さな尾を残して止める（語尾が切れない）
      await new Promise((r) => setTimeout(r, TAIL_MS));
      await new Promise((resolve) => { t.mr.onstop = resolve; try { t.mr.stop(); } catch { resolve(); } });
      const ws = o.ws(), g = o.generation();
      const blob = new Blob(t.chunks, { type: t.mr.mimeType || 'audio/webm' });
      const bytes = await readFileBounded(blob, { max: AUDIO_LIMITS.fileBytes, what: 'recording' });
      const ab = await mic.ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c));
      const p = processTake(chans, ab.sampleRate);
      if (!(p.dur > 0)) throw new Error(L.empty);
      const cu = cuesFromTaps(t.taps, t.bounds, { head: p.trimmed.head, dur: p.dur });
      if (o.ws() !== ws || o.generation() !== g || !openState) return false;
      const clip = mic ? mic.peak >= 0.98 : false;
      result = { key, dur: p.dur, gainDb: p.gainDb, clip, sync: cu.sync, raw: Math.round(ab.length / ab.sampleRate * 1000) / 1000, head: p.trimmed.head, tail: p.trimmed.tail, loudness: p.loudness, peakDb: p.peakDb, tapTimes: t.taps.slice(), taps: t.taps.length, limit: t.limit || null, bounds: t.bounds, mismatch: t.bounds > 0 && cu.sync === 'none' && t.taps.length !== t.bounds ? true : (t.bounds === 0 && t.taps.length > 0) };
      const res = await o.panel.commit(key, { pcm: p.pcm, sr: p.sr, dur: p.dur, gainDb: p.gainDb, cues: cu.cues, sync: cu.sync });
      if (!openState) return false;
      if (res.ok) { mine.add(key); ok = true; }
      else result.error = L.notWritten(res.error);
      if (step && step.key === key) { drawTake(); const info = await o.panel.peek(key).catch(() => null); if (step && step.key === key) drawNotes(info); paintChips(); }
      if (ok) say(L.announceTaken(p.dur, result.sync === 'manual', result.mismatch, clip));
      else alertMsg(result.error);
    } catch (e) {
      result = { key, error: L.fail + (e.message || e), taps: 0, bounds: t.bounds, limit: t.limit || null };
      if (step && step.key === key) drawTake();
      alertMsg(result.error);
    } finally {
      if (openState) setPhase('idle');
    }
    if (openState && after) { const f = after; after = null; f(); }
    return ok;
  }
  // 整えている間に押された操作は、書き終わってから
  const defer = (fn) => { if (phase === 'processing') { after = fn; return true; } return phase === 'starting'; };   // starting（マイクを開いている間）の操作は受け流す
  async function enter() {
    if (!step) return;
    if (defer(() => enter())) return;
    if (phase === 'recording') { after = () => go(idx + 1); await stopAndCommit(false); return; }
    const has = mine.has(step.key) || (await o.panel.peek(step.key).catch(() => null) || {}).entry;
    if (!has) { alertMsg(L.nothingToKeep); return; }
    go(idx + 1);
  }
  async function go(j) {
    if (j < 0) { say(L.atFirst); return; }
    if (j >= steps.length) { say(L.atLast); return; }
    await show(j);
  }
  async function move(d) {
    if (!openState || !steps.length) return;   // 段階を読み込んでいる最中（step が空）でも、続けて押した矢印は数える
    if (defer(() => move(d))) return;
    if (phase === 'recording') { after = () => go(idx + d); await stopAndCommit(false); return; }
    await go(idx + d);
  }
  async function retake() {
    if (!step) return;
    if (phase === 'recording') { await stopAndCommit(true); say(L.retakeDiscarded); return; }
    if (phase !== 'idle') return;
    const key = step.key;
    if (!mine.has(key) || !o.panel.canRevert(key)) { alertMsg(L.nothingToRetake); return; }
    setPhase('processing');
    const ok = await o.panel.revert(key);
    if (ok) mine.delete(key);
    result = null;
    setPhase('idle');
    if (step && step.key === key) { drawTake(); drawNotes(await o.panel.peek(key).catch(() => null)); }
    if (ok) say(L.retakeDone); else alertMsg(L.retakeFail);
  }

  // ---------------------------------------------------------------- キー（この板が開いている間は、ほかのキーより先に受ける）
  function onKey(e) {
    if (!openState || !root) return;
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (doc.querySelector('dialog[open]')) return;    // 権利の確認などの窓には触らない
    const t = e.target;
    // フォーカスがこの板のボタンにあるとき、Enter・Space はそのボタンの操作（ふつうのボタンの動き）。ふだんのフォーカスは板自身
    if (t && t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
    const k = e.key;
    let fn = null;
    if (k === ' ' || k === 'Spacebar') fn = toggleRecording;
    else if (k === 'Enter') fn = enter;
    else if (k === 'Backspace') fn = retake;
    else if (k === 'ArrowLeft') fn = () => move(-1);
    else if (k === 'ArrowRight') fn = () => move(1);
    else if ((k === 'c' || k === 'C') && !e.shiftKey) fn = tapCue;
    else if (['e', 'n', 'r', 'E', 'N', 'R'].includes(k)) fn = () => {};   // 横の板・口述原稿・コメントのキーは、この板では何もしない
    if (!fn) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) fn();
  }
  doc.addEventListener('keydown', onKey, true);

  // ---------------------------------------------------------------- 開く・閉じる
  async function open(opts = {}) {
    if (openState) { focusRoot(); return true; }
    if (!o.enabled()) return false;
    if (o.panel.isBusy()) { ui.toast(L.busy, 'warn'); return false; }
    if (o.beforeOpen && !(await o.beforeOpen())) return false;
    if (openState) return true;
    const ws = o.ws();
    let info;
    const want = typeof opts.key === 'string' && opts.key ? opts.key : (ui.pos() || {}).key || '';
    try { info = await o.panel.peek(want); } catch (e) { ui.toast(L.fail + (e.message || e), 'warn'); return false; }
    steps = (info.segs || []).slice();
    if (!steps.length) { ui.toast(L.noSegs, 'warn'); return false; }
    if (o.ws() !== ws) return false;
    // 音声の板は開いたまま（録音モードの間は隠れる）。閉じると、板が録った段階の新しい音声を見せる
    prevFocus = doc.activeElement; returnFocus = typeof opts.returnFocus === 'function' ? opts.returnFocus : null;
    openState = true; take = null; result = null; mine = new Set(); after = null;
    view = build();
    o.host.insertBefore(view, o.host.firstChild);
    o.host.classList.add('rec-on');
    if (o.top) o.top.inert = true;
    const key = want;
    let j = steps.findIndex((s) => `${s.slideKey}:${s.stepKey}` === key);
    if (j < 0) {
      const si = o.slideIndex && ui.pos() ? ui.pos().i : -1;
      j = si >= 0 ? steps.findIndex((s) => (o.slideIndex(s.slideKey) ?? -1) >= si) : 0;
      if (j < 0) j = steps.length - 1;
    }
    setPhase('idle');
    focusRoot();
    const msg = await show(j, { announce: false });
    say(L.opened(steps.length) + ' ' + msg);
    return true;
  }
  // 閉じる。録音中なら今のテイクを捨てる
  function close(opts = {}) {
    if (!openState) return;
    openState = false; seq++;
    if (take) { const t = take; take = null; clearTimeout(t.timer); try { t.mr.ondataavailable = null; t.mr.onstop = null; if (t.mr.state !== 'inactive') t.mr.stop(); } catch { /* 無視 */ } }
    closeMic();
    if (root) { root.remove(); root = null; }
    o.host.classList.remove('rec-on');
    if (o.top) o.top.inert = false;
    liveEl = alertEl = null; view = null; step = null; after = null; phase = 'idle';
    ui.refresh();
    if (o.onChange) o.onChange();
    if (!opts.silent) {
      try { if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); else if (returnFocus) returnFocus(); } catch { /* 無視 */ }
    }
    prevFocus = null; returnFocus = null;
  }
  function requestClose() { close(); }
  function reset() { close({ silent: true }); steps = []; mine = new Set(); result = null; }
  return {
    open, close, reset, isOpen: () => openState,
    // 録音している間・整えている間（プレビューの鍵・離れる前の確かめに使う）
    isBusy: () => openState && phase !== 'idle',
    state: () => ({ open: openState, phase, idx, key: step ? step.key : null, steps: steps.length, mic: !!mic, taps: take ? take.taps.length : null, result: result ? { ...result } : null, mine: [...mine] }),
  };
}
