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
//
// 準備中（ready でない間）：開いてから（r・「● 録音 (r)」）その段階を読み終えるまでと、段階を移って読み終えるまで。Space のボタンは「準備中…」。
// その間に押した Space（キー・ボタン）は 1 回だけ覚えておき、準備ができたらすぐ録り始める（落とさない・2 回始めない）。開けなかったら
// （権利の確認を断った・口述原稿がない・確かめの窓が出た）覚えた Space は捨てる。マイクを使えない・録音できないは、録り始めたときのいつもの知らせ
import { processTake, cuesFromTaps, clickCut, applyClickCut, AUDIO_LIMITS } from '../kit/core/audio-core.mjs';
import { readFileBounded } from './bounded-read.js';

const TAIL_MS = 150;   // 機器の遅れを受け取ってから止める（操作音は停止の押下時刻を基準に後で除く）
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
  let ready = false;         // 今の段階を読み終えて、Space で録り始められる（state().ready。試験はこれを待ってから Space を押す）
  let pending = false;       // 準備中に押された Space（準備ができたら 1 回だけ録り始める）
  let startInput = null;     // 開始の押下・解放（準備中・マイクを開いている間も同じ時刻を保つ）
  let opening = null;        // 開いている途中（open() の Promise。openState の前）。続けて押された r・ボタンは同じ Promise を返す
  let cancelled = false;     // 開いている途中に閉じた（Esc・作業場所が替わった）
  let swallowUp = false;     // 開いている途中に受けた Space の keyup も止める（フォーカスのあるボタンがもう一度押されないように）
  // 1 つのテイクの長さの上限（秒。AUDIO_LIMITS.maxSeconds = 600。試験だけ o.maxSeconds で短くする）
  const maxSec = () => { const v = o.maxSeconds ? o.maxSeconds() : null; return typeof v === 'number' && v > 0 ? v : AUDIO_LIMITS.maxSeconds; };
  let result = null;         // 直前のテイクの結果（表示用）。head・tail は操作音を除く範囲の秒、trimmed は無音も含めて前後から削った秒（state() から読む）
  const mkEl = (t, p, kids) => h(t, p, kids);

  // ---------------------------------------------------------------- 読み上げソフトへの知らせ（段階・状態が変わるたびに）
  let liveEl = null, alertEl = null;
  function say(text) { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { if (liveEl) liveEl.textContent = text; }, 40); }
  function alertMsg(text) { if (!alertEl) return; alertEl.textContent = ''; setTimeout(() => { if (alertEl) alertEl.textContent = text; }, 40); }

  // ---------------------------------------------------------------- 描く
  function build() {
    const keyBtn = (id, key, label, fn) => mkEl('button', { type: 'button', id: 'rec-b-' + id, cls: 'rm-btn', 'aria-keyshortcuts': key, on: {
      click: (e) => { if (id === 'space' && e.detail > 0) return; fn(); focusRoot(); },
      // 録音／停止は押した瞬間に行う。後から来る click では二重に切り替えない（支援技術の click は受ける）。
      ...(id === 'space' ? { pointerdown: (e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.preventDefault(); toggleRecording({ startDown: performance.now(), startUp: null, kind: 'pointer', pointerId: e.pointerId }); focusRoot();
      } } : {}),
    } }, [mkEl('kbd', { text: L.keyName[id] || key }), mkEl('span', { text: label })]);
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
    paintState();
    if (root) root.classList.toggle('rm-recording', p === 'recording');
    const f = ui.refresh; if (f) f();
    if (o.onChange) o.onChange();
  }
  // 状態の表示と Space のボタン：準備中は「準備中…」（aria-busy。押せば覚えておく）
  function paintState() {
    const shown = ready ? phase : 'preparing';
    const s = $('rec-state');
    if (s) { s.dataset.phase = shown; s.textContent = L.phase[shown]; }
    const sp = $('rec-b-space');
    if (sp) {
      sp.querySelector('span').textContent = !ready ? L.btnPreparing : phase === 'recording' ? L.btnStop : L.btnRec;
      sp.setAttribute('aria-pressed', phase === 'recording' ? 'true' : 'false'); sp.classList.toggle('on', phase === 'recording');
      sp.setAttribute('aria-busy', ready ? 'false' : 'true'); sp.classList.toggle('wait', !ready);
    }
    if (root) root.dataset.ready = ready ? 'true' : 'false';
  }
  function setReady(v) {
    if (ready === v) return;
    ready = v;
    paintState();
    if (o.onChange) o.onChange();
  }
  // 準備中に押された Space：1 回だけ覚える（2 回目は何もしない）
  function queueStart(input) {
    if (pending) return;
    pending = true; startInput = input;
    if (liveEl) say(L.queued);
  }
  // 準備ができた：覚えていた Space で録り始める
  function kick() {
    if (!pending || !ready || !openState) return;
    pending = false;
    toggleRecording(startInput);
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
    // 失敗だけの結果（長さがない）は、知らせだけを出す
    if (typeof r.dur === 'number') {
      const rows = [L.takeDone(r.dur, r.gainDb)];
      if (r.sync === 'manual') rows.push(L.takeCues(r.taps));
      box.appendChild(mkEl('div', { cls: 'rm-note ok', id: 'rec-result', text: rows.join(' · ') }));
    }
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
    setReady(false);
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
    setReady(true);
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
  async function toggleRecording(input = { startDown: performance.now(), startUp: null }) {
    if (!openState) { if (opening) queueStart(input); return; }
    if (!ready || !step) { if (phase === 'idle') queueStart(input); return; }
    if (phase === 'starting' || phase === 'processing') return;
    if (phase === 'recording') { await stopAndCommit(false, input.startDown); return; }
    if (o.panel.isBusy()) return;
    startInput = input;
    const my = seq, key = step.key, bounds = step.seg.bounds.length;
    setPhase('starting');
    result = null; drawTake();
    if (!(await openMic())) { startInput = null; setPhase('idle'); return; }
    if (!openState || my !== seq || !step || step.key !== key) { setPhase('idle'); return; }
    const chunks = [];
    let mr;
    try { mr = new win.MediaRecorder(mic.stream); }
    catch (e) { startInput = null; const m = L.fail + (e.message || e.name || e); result = { key, error: m, taps: 0, bounds }; drawTake(); alertMsg(m); setPhase('idle'); return; }
    const t = take = { key, mr, chunks, t0: 0, clicks: input, taps: [], bounds, timer: 0 };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    // 録音が実際に始まった時刻を 0 にする（C の時刻の基準）。上限の時刻で止める（メーターの描画が止まっている裏のタブでも）
    mr.onstart = () => { t.t0 = performance.now(); t.clicks.recStart = t.t0; if (take === t) t.timer = setTimeout(() => { if (take === t) overLimit(); }, maxSec() * 1000 + 50); };
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
    stopAndCommit(false, null);   // 自動停止には操作音がないので、末尾は無音除去だけ
  }
  function tapCue() {
    if (phase !== 'recording' || !take || !take.t0) return;
    take.taps.push((performance.now() - take.t0) / 1000);
    const n = take.taps.length, total = take.bounds;
    paintChips();
    say(total ? L.announceCue(n, total) : L.announceCueNone);
  }
  // 録音を止めて、整えて、その段階の音声にする。discard：捨てる。戻り値：書けたか
  async function stopAndCommit(discard, stopDown = performance.now()) {
    const t = take;
    if (!t) return false;
    take = null; startInput = null;
    t.clicks.stopDown = stopDown;
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
    let cuts = null;
    try {
      // 機器の遅れを受け取り、復号した標本から操作音を先に除いてから、無音除去・音量調整。
      await new Promise((r) => setTimeout(r, TAIL_MS));
      await new Promise((resolve) => { t.mr.onstop = resolve; try { t.mr.stop(); } catch { resolve(); } });
      const ws = o.ws(), g = o.generation();
      const blob = new Blob(t.chunks, { type: t.mr.mimeType || 'audio/webm' });
      const bytes = await readFileBounded(blob, { max: AUDIO_LIMITS.fileBytes, what: 'recording' });
      const ab = await mic.ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c));
      const cut = clickCut(t.clicks, ab.sampleRate, ab.length);
      cuts = { head: cut.head / ab.sampleRate, tail: cut.tail / ab.sampleRate };
      const clipped = chans.map((c) => applyClickCut(c, cut));
      if (clipped[0].reason) throw Object.assign(new Error(L.emptyClicks), { code: clipped[0].reason });
      const p = processTake(clipped.map((c) => c.pcm), ab.sampleRate);
      if (!(p.dur > 0)) throw new Error(L.empty);
      const trimmed = { head: cuts.head + p.trimmed.head, tail: (ab.length - cut.tail) / ab.sampleRate + p.trimmed.tail };
      const cu = cuesFromTaps(t.taps, t.bounds, { head: trimmed.head, dur: p.dur });
      if (o.ws() !== ws || o.generation() !== g || !openState) return false;
      const clip = mic ? mic.peak >= 0.98 : false;
      result = { key, dur: p.dur, gainDb: p.gainDb, clip, sync: cu.sync, raw: Math.round(ab.length / ab.sampleRate * 1000) / 1000, ...cuts, trimmed, loudness: p.loudness, peakDb: p.peakDb, tapTimes: t.taps.slice(), taps: t.taps.length, limit: t.limit || null, bounds: t.bounds, mismatch: t.bounds > 0 && cu.sync === 'none' && t.taps.length !== t.bounds ? true : (t.bounds === 0 && t.taps.length > 0) };
      const res = await o.panel.commit(key, { pcm: p.pcm, sr: p.sr, dur: p.dur, gainDb: p.gainDb, cues: cu.cues, sync: cu.sync });
      if (!openState) return false;
      if (res.ok) { mine.add(key); ok = true; }
      else result.error = L.notWritten(res.error);
      if (step && step.key === key) { drawTake(); const info = await o.panel.peek(key).catch(() => null); if (step && step.key === key) drawNotes(info); paintChips(); }
      if (ok) say(L.announceTaken(p.dur, result.sync === 'manual', result.mismatch, clip));
      else alertMsg(result.error);
    } catch (e) {
      result = { key, ...cuts, reason: e.code || null, error: L.fail + (e.message || e), taps: 0, bounds: t.bounds, limit: t.limit || null };
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
    kick();
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
  const keyInput = (e) => ({ startDown: performance.now(), startUp: null, kind: 'key', key: e.key === 'Spacebar' ? ' ' : e.key });
  function onKey(e) {
    // 開いている途中（r・ボタンの直後）の Space は、ほかへ渡さずに覚えておく（準備ができたら録り始める）
    // Esc は開くのをやめる。この板のほかのキー（r・矢印など）は、開き終えるまで何もしない
    if (!openState && opening) {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || doc.querySelector('dialog[open]')) return;
      const t = e.target;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.shiftKey) return;
      if (k === ' ' || k === 'Spacebar') { e.preventDefault(); e.stopPropagation(); swallowUp = true; if (!e.repeat) queueStart(keyInput(e)); return; }
      if (['Enter', 'Backspace', 'ArrowLeft', 'ArrowRight', 'c', 'C', 'e', 'n', 'r', 'E', 'N', 'R'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (!openState || !root) return;
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (doc.querySelector('dialog[open]')) return;    // 権利の確認などの窓には触らない
    const t = e.target;
    // 録音／停止ボタンもキーを押した瞬間に操作し、解放時の click で二重に切り替えない。
    const recButton = t && t.id === 'rec-b-space';
    if (t && t.tagName === 'BUTTON' && !recButton && (e.key === 'Enter' || e.key === ' ')) return;
    if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
    const k = e.key;
    let fn = null;
    if (k === ' ' || k === 'Spacebar' || (recButton && k === 'Enter')) fn = () => toggleRecording(keyInput(e));
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
  doc.addEventListener('keyup', (e) => {
    const key = e.key === 'Spacebar' ? ' ' : e.key;
    if (startInput && startInput.kind === 'key' && startInput.key === key && startInput.startUp === null) {
      startInput.startUp = performance.now(); e.preventDefault(); e.stopPropagation();
    }
    if (swallowUp && key === ' ') { swallowUp = false; e.preventDefault(); e.stopPropagation(); }
  }, true);
  doc.addEventListener('pointerup', (e) => {
    if (startInput && startInput.kind === 'pointer' && startInput.pointerId === e.pointerId && startInput.startUp === null) startInput.startUp = performance.now();
  }, true);
  doc.addEventListener('pointercancel', (e) => { if (startInput && startInput.kind === 'pointer' && startInput.pointerId === e.pointerId) startInput.kind = null; }, true);
  // フォーカスが戻った後の解放を開始の解放と取り違えず、120 ms の代替値を使う。
  win.addEventListener('blur', () => { if (startInput) startInput.kind = null; });
  // 開いている途中に確かめの窓（権利の確認など）が出て閉じたら、その前に押した Space は捨てる（窓の答えのあとに勝手に録り始めない）
  doc.addEventListener('close', (e) => { if (opening && !openState && e.target && e.target.tagName === 'DIALOG') pending = false; }, true);

  // ---------------------------------------------------------------- 開く・閉じる
  // 開く。録音の画面はすぐ出して（準備中）フォーカスをその中に移し、それから権利の確認・口述原稿の読み込みをする。
  // 開いている途中・開いた後にもう一度呼ばれたら（r を続けて押した・フォーカスのあるボタンを Space で押した）、同じ画面のまま（2 つ作らない）
  function open(opts = {}) {
    if (openState) { focusRoot(); return Promise.resolve(true); }
    if (opening) { focusRoot(); return opening; }
    if (!o.enabled()) return Promise.resolve(false);
    if (o.panel.isBusy()) { ui.toast(L.busy, 'warn'); return Promise.resolve(false); }
    pending = false; startInput = null; cancelled = false;
    // 音声の板は開いたまま（録音モードの間は隠れる）。閉じると、板が録った段階の新しい音声を見せる
    prevFocus = doc.activeElement; returnFocus = typeof opts.returnFocus === 'function' ? opts.returnFocus : null;
    take = null; result = null; mine = new Set(); after = null; ready = false; phase = 'idle';
    view = build();
    o.host.insertBefore(view, o.host.firstChild);
    o.host.classList.add('rec-on');
    if (o.top) o.top.inert = true;
    paintState();
    // フォーカスをすぐこの画面へ：プレビュー（iframe）やボタンに残っていると、続けて押した Space がデッキやボタンに行ってしまう
    focusRoot();
    say(L.phase.preparing);
    const p = opening = doOpen(opts).catch(() => false).then((on) => {
      if (opening === p) opening = null;
      if (!on || !openState) { pending = false; if (!openState) teardown(); }
      else kick();
      return on;
    });
    return p;
  }
  async function doOpen(opts) {
    if (o.beforeOpen && !(await o.beforeOpen())) return false;
    if (cancelled) return false;
    const ws = o.ws();
    let info;
    const want = typeof opts.key === 'string' && opts.key ? opts.key : (ui.pos() || {}).key || '';
    try { info = await o.panel.peek(want); } catch (e) { ui.toast(L.fail + (e.message || e), 'warn'); return false; }
    if (cancelled) return false;
    steps = (info.segs || []).slice();
    if (!steps.length) { ui.toast(L.noSegs, 'warn'); return false; }
    if (o.ws() !== ws) return false;
    openState = true;
    const key = want;
    let j = steps.findIndex((s) => `${s.slideKey}:${s.stepKey}` === key);
    if (j < 0) {
      const si = o.slideIndex && ui.pos() ? ui.pos().i : -1;
      j = si >= 0 ? steps.findIndex((s) => (o.slideIndex(s.slideKey) ?? -1) >= si) : 0;
      if (j < 0) j = steps.length - 1;
    }
    setPhase('idle');
    if (!doc.activeElement || doc.activeElement === doc.body) focusRoot();
    const msg = await show(j, { announce: false });
    say(L.opened(steps.length) + ' ' + msg);
    return true;
  }
  // 開けなかった・開いている途中で閉じた：出しておいた画面を外し、フォーカスを戻す
  function teardown(opts = {}) {
    if (openState || !root) return;
    const hadFocus = root.contains(doc.activeElement);
    root.remove(); root = null; view = null; liveEl = alertEl = null;
    o.host.classList.remove('rec-on');
    if (o.top) o.top.inert = false;
    ready = false; pending = false; startInput = null;
    ui.refresh();
    if (o.onChange) o.onChange();
    if (!opts.silent && (hadFocus || !doc.activeElement || doc.activeElement === doc.body)) {
      try { if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); else if (returnFocus) returnFocus(); } catch { /* 無視 */ }
    }
    prevFocus = null; returnFocus = null;
  }
  // 閉じる。録音中なら今のテイクを捨てる（開いている途中なら、開くのをやめる）
  function close(opts = {}) {
    if (!openState) { if (opening) { cancelled = true; teardown(opts); } return; }
    openState = false; seq++;
    if (take) { const t = take; take = null; clearTimeout(t.timer); try { t.mr.ondataavailable = null; t.mr.onstop = null; if (t.mr.state !== 'inactive') t.mr.stop(); } catch { /* 無視 */ } }
    closeMic();
    if (root) { root.remove(); root = null; }
    o.host.classList.remove('rec-on');
    if (o.top) o.top.inert = false;
    liveEl = alertEl = null; view = null; step = null; after = null; phase = 'idle'; ready = false; pending = false; startInput = null;
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
    // 開いている途中も開いている扱い（プレビューは inert・Esc はこの板から）
    open, close, reset, isOpen: () => openState || !!opening,
    // 録音している間・整えている間（プレビューの鍵・離れる前の確かめに使う）
    isBusy: () => openState && phase !== 'idle',
    state: () => ({ open: openState, ready: openState && ready, pending, phase, idx, key: step ? step.key : null, steps: steps.length, mic: !!mic, taps: take ? take.taps.length : null, result: result ? { ...result } : null, mine: [...mine] }),
  };
}
