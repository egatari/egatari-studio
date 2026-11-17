// Egatari Viewer: handwriting PROTOTYPE (handoff #27, textbook-reader-memo §3.2B). Not for release: a branch for the owner's iPad.
// The slide (1280×720) and a memo area below it are one surface. Apple Pencil (pointerType "pen") and a mouse draw; a finger never
// draws (palm), a finger swipe on the slide moves a step. One pen colour, an eraser (whole strokes), undo. Strokes are kept on this
// device only (IndexedDB "egatari-viewer-ink-proto"), per lesson docId and slide key; nothing goes into the file or leaves the device.
// Coordinates: x 0..1280 across the slide; y 0..720 on the slide, 720..720+MEMO_H in the memo area (so an arrow can run from the memo
// up into the slide). The page measures what the owner asked for: coalesced / predicted events, the event rate, the delay from the
// event to the paint, the stored size of a slide, and the browser's storage estimate.
export const W = 1280, H = 720, MEMO_H = 480;
const DB = 'egatari-viewer-ink-proto', STORE = 'pages';
const PEN = '#d22a3a', PEN_W = 3, ERASE_R = 14, MAX_PTS = 20000;

function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function tx(mode, f) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const r = f(t.objectStore(STORE)); t.oncomplete = () => { db.close(); res(r && r.result); }; t.onerror = () => { db.close(); rej(t.error); }; });
}
const getPage = (k) => tx('readonly', (s) => s.get(k));
const putPage = (k, v) => tx('readwrite', (s) => s.put(v, k));
const allSizes = () => tx('readonly', (s) => s.getAll());

// {root, words, shared(), send(key, shift), onStatus(text)} → {setPage(docId, slideKey), place(rect), destroy()}
export function ink({ root, words, shared, send }) {
  const surf = document.createElement('canvas'), live = document.createElement('canvas');
  surf.className = 'ink-surf'; live.className = 'ink-live';
  const bar = document.createElement('div'); bar.className = 'ink-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', words().inkTools);
  const btn = (id, label, f) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = id; b.textContent = label; b.addEventListener('click', f); bar.append(b); return b; };
  const stat = document.createElement('div'); stat.className = 'ink-stat'; stat.setAttribute('aria-live', 'off');
  root.append(surf, live, bar, stat);
  let tool = 'pen', fingerDraws = false;
  const bPen = btn('pen', words().inkPen, () => setTool('pen'));
  const bEr = btn('eraser', words().inkEraser, () => setTool('eraser'));
  const bUndo = btn('undo', words().inkUndo, undo);
  btn('prev', '←', () => send('ArrowLeft'));
  btn('next', '→', () => send('ArrowRight'));
  const bFinger = btn('finger', words().inkFinger, () => { fingerDraws = !fingerDraws; bFinger.setAttribute('aria-pressed', String(fingerDraws)); });
  bFinger.setAttribute('aria-pressed', 'false');
  const bStat = btn('stat', words().inkStats, () => { stat.hidden = !stat.hidden; bStat.setAttribute('aria-pressed', String(!stat.hidden)); renderStat(); });
  bStat.setAttribute('aria-pressed', 'false'); stat.hidden = true;
  function setTool(t) { tool = t; bPen.setAttribute('aria-pressed', String(t === 'pen')); bEr.setAttribute('aria-pressed', String(t === 'eraser')); }
  setTool('pen');

  let key = '', strokes = [], undoStack = [], rect = null, scale = 1, dpr = 1;
  const M = { coalesced: typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype,
    predicted: typeof PointerEvent !== 'undefined' && 'getPredictedEvents' in PointerEvent.prototype,
    events: 0, samples: 0, delays: [], t0: 0, pens: 0, touches: 0, pressure: false, est: null, persisted: null, bytes: 0, total: 0, pages: 0 };

  // ------------------------------------------------------------ geometry
  function place(r) {   // r: the surface in page pixels {x, y, w, h}; w is the slide's width, h the slide and the memo
    rect = r; scale = r.w / W; dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const c of [surf, live]) { Object.assign(c.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); c.width = Math.round(r.w * dpr); c.height = Math.round(r.h * dpr); }
    redraw();
  }
  const toLogical = (e) => { const b = surf.getBoundingClientRect(); return [(e.clientX - b.left) / scale, (e.clientY - b.top) / scale, e.pressure || 0.5]; };
  const ctxOf = (c) => { const x = c.getContext('2d'); x.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; return x; };

  // ------------------------------------------------------------ drawing
  function drawStroke(x, s, from = 0) {
    const p = s.p; x.strokeStyle = PEN;
    for (let i = Math.max(3, from); i < p.length; i += 3) {
      x.lineWidth = PEN_W * (0.4 + p[i + 2]);
      x.beginPath(); x.moveTo(p[i - 3], p[i - 2]); x.lineTo(p[i], p[i + 1]); x.stroke();
    }
    if (p.length === 3) { x.fillStyle = PEN; x.beginPath(); x.arc(p[0], p[1], PEN_W * 0.6, 0, Math.PI * 2); x.fill(); }
  }
  function redraw() {
    if (!rect) return;
    const x = ctxOf(surf); x.clearRect(0, 0, W, H + MEMO_H);
    x.fillStyle = 'rgba(128,128,128,.10)'; x.fillRect(0, H, W, MEMO_H);   // the memo area, faintly
    x.strokeStyle = 'rgba(128,128,128,.6)'; x.lineWidth = 1 / scale; x.beginPath(); x.moveTo(0, H); x.lineTo(W, H); x.stroke();
    for (const s of strokes) drawStroke(x, s);
    ctxOf(live).clearRect(0, 0, W, H + MEMO_H);
  }

  // ------------------------------------------------------------ input
  let cur = null, swipe = null, erasing = false;
  const round = (v) => Math.round(v * 10) / 10;
  const push = (s, q) => { if (s.p.length < MAX_PTS * 3) s.p.push(round(q[0]), round(q[1]), Math.round(q[2] * 100) / 100); };
  const drawsWith = (e) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && fingerDraws);
  function down(e) {
    if (!key) return;
    if (e.pointerType === 'pen') M.pens++; else if (e.pointerType === 'touch') M.touches++;
    if (!drawsWith(e)) { if (e.isPrimary) swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
    if (cur) return;   // one stroke at a time (a second contact is the palm)
    e.preventDefault(); surf.setPointerCapture(e.pointerId);
    erasing = tool === 'eraser' || (e.buttons & 32) === 32;
    if (erasing) { cur = { id: e.pointerId, removed: [] }; eraseAt(toLogical(e), cur); return; }
    cur = { id: e.pointerId, s: { p: [] } };
    push(cur.s, toLogical(e));
    if (e.pressure > 0 && e.pressure !== 0.5) M.pressure = true;
  }
  function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    const list = M.coalesced && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const evs = list.length ? list : [e];
    M.events++; M.samples += evs.length;
    if (erasing) { for (const c of evs) eraseAt(toLogical(c), cur); return; }
    const from = cur.s.p.length;
    for (const c of evs) push(cur.s, toLogical(c));
    const x = ctxOf(surf); drawStroke(x, cur.s, from);
    // predicted points: drawn on the live layer only, replaced at the next event
    const l = ctxOf(live); l.clearRect(0, 0, W, H + MEMO_H);
    if (M.predicted && e.getPredictedEvents) {
      const pr = e.getPredictedEvents();
      if (pr.length) { const ps = { p: cur.s.p.slice(-3) }; for (const c of pr) push(ps, toLogical(c)); l.globalAlpha = 0.6; drawStroke(l, ps); }
    }
    const t = e.timeStamp;
    requestAnimationFrame(() => { const d = performance.now() - t; if (d >= 0 && d < 1000) { M.delays.push(d); if (M.delays.length > 400) M.delays.shift(); } });
  }
  function up(e) {
    if (swipe && e.pointerId === swipe.id) {
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && e.timeStamp - swipe.t < 800) send(dx < 0 ? 'ArrowRight' : 'ArrowLeft');
      swipe = null; return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    if (erasing) { if (cur.removed.length) { undoStack.push({ erase: cur.removed }); save(); } }
    else { strokes.push(cur.s); undoStack.push({ add: cur.s }); save(); }
    cur = null; erasing = false; ctxOf(live).clearRect(0, 0, W, H + MEMO_H);
  }
  function eraseAt([px, py], c) {
    const r2 = ERASE_R * ERASE_R;
    const hit = strokes.filter((s) => { for (let i = 0; i < s.p.length; i += 3) { const dx = s.p[i] - px, dy = s.p[i + 1] - py; if (dx * dx + dy * dy <= r2) return true; } return false; });
    if (!hit.length) return;
    strokes = strokes.filter((s) => !hit.includes(s)); c.removed.push(...hit); redraw();
  }
  function undo() {
    const a = undoStack.pop(); if (!a) return;
    if (a.add) strokes = strokes.filter((s) => s !== a.add); else strokes.push(...a.erase);
    redraw(); save();
  }
  surf.addEventListener('pointerdown', down);
  surf.addEventListener('pointermove', move);
  surf.addEventListener('pointerup', up);
  surf.addEventListener('pointercancel', (e) => { if (cur && e.pointerId === cur.id) { cur = null; redraw(); } swipe = null; });
  surf.addEventListener('touchmove', (e) => { if (cur) e.preventDefault(); }, { passive: false });   // Safari: no scroll while the Pencil draws

  // ------------------------------------------------------------ storage (this device only)
  let saveTimer = null;
  function save() {
    if (shared() || !key) { renderStat(); return; }
    clearTimeout(saveTimer);
    const k = key, v = { v: 1, strokes, at: Date.now() };
    saveTimer = setTimeout(async () => { try { await putPage(k, v); } catch { /* full or blocked: the prototype says so in the stats */ } renderStat(); }, 300);
  }
  async function setPage(docId, slideKey) {
    const k = `${docId}|${slideKey}`;
    if (k === key) return;
    if (cur) { cur = null; }
    key = k; undoStack = []; strokes = [];
    if (!shared()) { try { const v = await getPage(k); if (key === k && v && Array.isArray(v.strokes)) strokes = v.strokes; } catch { /* none */ } }
    redraw(); renderStat();
  }
  async function renderStat() {
    if (stat.hidden) return;
    try { if (navigator.storage && navigator.storage.estimate) M.est = await navigator.storage.estimate(); if (navigator.storage && navigator.storage.persisted) M.persisted = await navigator.storage.persisted(); } catch { /* none */ }
    M.bytes = JSON.stringify({ v: 1, strokes }).length;
    try { const all = await allSizes(); M.pages = all.length; M.total = all.reduce((n, v) => n + JSON.stringify(v).length, 0); } catch { /* none */ }
    const d = M.delays.slice().sort((a, b) => a - b), q = (f) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * f))].toFixed(1) : '–');
    const pts = strokes.reduce((n, s) => n + s.p.length / 3, 0);
    const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
    stat.textContent = [
      `getCoalescedEvents: ${M.coalesced ? 'あり' : 'なし'} · getPredictedEvents: ${M.predicted ? 'あり' : 'なし'} · 筆圧: ${M.pressure ? 'あり' : '–'}`,
      `1 回の move の点：${M.events ? (M.samples / M.events).toFixed(1) : '–'}（${M.events} 回）· pen ${M.pens} · touch ${M.touches}`,
      `move → 描画の遅れ（ms）：中央 ${q(0.5)} · 90% ${q(0.9)}`,
      `このスライド：${strokes.length} 本 · ${pts} 点 · ${(M.bytes / 1024).toFixed(1)} KB ／ 全部：${M.pages} 枚 · ${(M.total / 1024).toFixed(1)} KB`,
      `保存の上限（estimate）：${M.est ? `${mb(M.est.usage || 0)} 使用 / ${mb(M.est.quota || 0)}` : '–'} · persisted: ${M.persisted == null ? '–' : M.persisted}${shared() ? ' · 共有の端末：保存しない' : ''}`,
      `key: ${key || '（位置がまだ届いていない）'}`,
    ].join('\n');
  }
  return { place, setPage, destroy() { clearTimeout(saveTimer); surf.remove(); live.remove(); bar.remove(); stat.remove(); }, get barEl() { return bar; } };
}
