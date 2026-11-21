// Egatari Viewer: handwriting on the slide and in a memo area below it (handoff #27, textbook-reader-memo §3.2B; the owner's
// iPad check of the prototype on 11/18: coalesced and predicted events, about 6 ms from the event to the paint, 15 KB a slide).
// The slide (1280×720) and the memo area are one surface over the page. Apple Pencil (pointerType "pen") and a mouse draw; a finger
// draws only when 「指でも書く」 is on (no Pencil), otherwise a finger never draws (the palm) and a swipe on the surface moves a step.
// Three fixed pen colours (no free colours, §3.2A): black, red and blue, each kept as a word ('k', 'r', 'b') and painted in the
// shade that reads on the slide's background (light or dark), so a stroke keeps its meaning when the background changes.
// The memo area takes the slide's own background (the lesson's shim reports it: play/lesson-shim.js 5), set off from the slide by
// a small gap and a line, so a dark lesson gets a dark memo and a light lesson a light one whatever the Viewer's own theme.
// An eraser (whole strokes it touches; also the Pencil's own eraser end, buttons 32), undo.
// Strokes are kept on this device only (IndexedDB "egatari-viewer-ink"), per lesson docId and slide key, never in the file and
// never sent anywhere; nothing is kept on a shared device (play/main.js clears them when 「共有の端末」 is turned on).
// Coordinates: x 0..1280 across the slide; y 0..720 on the slide, 720..720+MEMO_H below it (so an arrow can run from the memo
// up into the slide). A stroke is {c, p: [x, y, pressure, …]}.
export const W = 1280, H = 720, MEMO_H = 480, GAP = 12;
const DB = 'egatari-viewer-ink', STORE = 'pages';
const COLORS = ['k', 'r', 'b'];
const SHADE = { light: { k: '#1f1f1f', r: '#d22a3a', b: '#1f5fbf' }, dark: { k: '#f2f2f2', r: '#ff7b88', b: '#7db8ff' } };
const PEN_W = 3, ERASE_R = 14, MAX_PTS = 20000, MAX_STROKES = 2000;

// ---------------------------------------------------------------- storage
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res) => {
      try {
        const q = indexedDB.open(DB, 1);
        q.onupgradeneeded = () => q.result.createObjectStore(STORE);
        q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
      } catch { res(null); }
    });
  }
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(mode) { const d = await db(); return d ? d.transaction(STORE, mode).objectStore(STORE) : null; }
async function getPage(k) { const s = await store('readonly'); return s ? req(s.get(k)) : null; }
async function putPage(k, v) { const s = await store('readwrite'); if (s) await req(v ? s.put(v, k) : s.delete(k)); }
// how many slides hold handwriting, for the question before 「共有の端末」 deletes them (play/main.js)
export async function countInk() {
  try { const s = await store('readonly'); return s ? await req(s.count()) : 0; } catch { return 0; }
}
export async function clearInk() { try { const s = await store('readwrite'); if (s) await req(s.clear()); } catch { /* nothing kept */ } }

const strokeOk = (s) => s && typeof s === 'object' && Array.isArray(s.p) && s.p.length >= 3 && s.p.length % 3 === 0 && s.p.length <= MAX_PTS * 3
  && s.p.every((v) => typeof v === 'number' && Number.isFinite(v));
const colourOf = (s) => (COLORS.includes(s.c) ? s.c : 'r');

// background: [r, g, b] → 'light' | 'dark' (relative luminance, WCAG)
function toneOf(rgb) {
  const l = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] < 0.25 ? 'dark' : 'light';
}

const ICON = {
  pen: 'M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4',
  eraser: 'M8 20h12 M4 15l9-9 7 7-7 7H8z M9 10l6 6',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  finger: 'M9 12V5a2 2 0 0 1 4 0v6 M13 10a2 2 0 0 1 4 0v2 M9 12a2 2 0 0 0-4 0v1c0 4 3 8 7 8h1a6 6 0 0 0 6-6v-2a2 2 0 0 0-4 0',
};
function svg(d) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
  p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p); return s;
}

// {root, words(), shared(), send(key, shift)} → {place(rect), setPage(docId, slideKey), setBackground([r, g, b]), relabel(), destroy(), barEl}
export function ink({ root, words, shared, send }) {
  const surf = document.createElement('canvas'), live = document.createElement('canvas');
  surf.className = 'ink-surf'; live.className = 'ink-live'; live.setAttribute('aria-hidden', 'true');
  surf.setAttribute('role', 'img');
  const bar = document.createElement('div'); bar.className = 'ink-bar'; bar.setAttribute('role', 'toolbar');
  const buttons = [];
  const btn = (k, f, opts = {}) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k;
    if (opts.icon) b.appendChild(svg(opts.icon));
    if (opts.swatch) { b.className = 'ink-sw'; const d = document.createElement('span'); d.className = 'ink-dot ink-' + opts.swatch; d.setAttribute('aria-hidden', 'true'); b.appendChild(d); }
    if (opts.pressed != null) b.setAttribute('aria-pressed', String(opts.pressed));
    b.addEventListener('click', f); bar.append(b); buttons.push(b); return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'ink-sep'; s.setAttribute('aria-hidden', 'true'); bar.append(s); };
  root.append(surf, live, bar);

  let tool = 'pen', colour = 'r', fingerDraws = false, tone = 'light', bg = [255, 255, 255];
  const bPen = btn('pen', () => setTool('pen'), { icon: ICON.pen, pressed: true });
  const bEr = btn('eraser', () => setTool('eraser'), { icon: ICON.eraser, pressed: false });
  sep();
  const bCol = COLORS.map((c) => btn('c-' + c, () => { colour = c; setTool('pen'); }, { swatch: c, pressed: c === colour }));
  sep();
  const bUndo = btn('undo', undo, { icon: ICON.undo });
  btn('prev', () => send('ArrowLeft'), { icon: ICON.prev });
  btn('next', () => send('ArrowRight'), { icon: ICON.next });
  sep();
  const bFinger = btn('finger', () => { fingerDraws = !fingerDraws; bFinger.setAttribute('aria-pressed', String(fingerDraws)); }, { icon: ICON.finger, pressed: false });
  function setTool(t) {
    tool = t;
    bPen.setAttribute('aria-pressed', String(t === 'pen')); bEr.setAttribute('aria-pressed', String(t === 'eraser'));
    bCol.forEach((b, i) => b.setAttribute('aria-pressed', String(t === 'pen' && COLORS[i] === colour)));
  }
  // every button is an icon: its name is its aria-label, and the same words as a tooltip
  function relabel() {
    const w = words();
    bar.setAttribute('aria-label', w.inkTools);
    const name = { pen: w.inkPen, eraser: w.inkEraser, undo: w.inkUndo, prev: w.inkPrev, next: w.inkNext, finger: w.inkFinger };
    for (const b of buttons) {
      const k = b.dataset.k, n = k.startsWith('c-') ? w.inkColour[k.slice(2)] : name[k];
      b.setAttribute('aria-label', n); b.title = n;
    }
    labelSurface();
  }
  function labelSurface() { surf.setAttribute('aria-label', words().inkSurface(strokes.length)); }

  let key = '', strokes = [], undoStack = [], rect = null, scale = 1, dpr = 1;
  const predicted = typeof PointerEvent !== 'undefined' && 'getPredictedEvents' in PointerEvent.prototype;
  const coalesced = typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype;

  // ------------------------------------------------------------ geometry
  function place(r) {   // r: the surface in page pixels {x, y, w, h}; w is the slide's width, h the slide, the gap and the memo
    rect = r; scale = r.w / W; dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const c of [surf, live]) { Object.assign(c.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); c.width = Math.round(r.w * dpr); c.height = Math.round(r.h * dpr); }
    redraw();
  }
  const toLogical = (e) => { const b = surf.getBoundingClientRect(); return [(e.clientX - b.left) / scale, (e.clientY - b.top) / scale, e.pressure || 0.5]; };
  const ctxOf = (c) => { const x = c.getContext('2d'); x.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; return x; };

  // ------------------------------------------------------------ drawing
  function drawStroke(x, s, from = 0) {
    const p = s.p, col = SHADE[tone][colourOf(s)];
    x.strokeStyle = col;
    for (let i = Math.max(3, from); i < p.length; i += 3) {
      x.lineWidth = PEN_W * (0.4 + p[i + 2]);
      x.beginPath(); x.moveTo(p[i - 3], p[i - 2]); x.lineTo(p[i], p[i + 1]); x.stroke();
    }
    if (p.length === 3) { x.fillStyle = col; x.beginPath(); x.arc(p[0], p[1], PEN_W * 0.6, 0, Math.PI * 2); x.fill(); }
  }
  function redraw() {
    if (!rect) return;
    const x = ctxOf(surf); x.clearRect(0, 0, W, H + MEMO_H);
    // the memo area: the slide's background, after a gap, with a line round it (the boundary reads on any page theme)
    x.fillStyle = `rgb(${bg.join(',')})`; x.fillRect(0, H + GAP, W, MEMO_H - GAP);
    x.strokeStyle = tone === 'dark' ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)'; x.lineWidth = 1.5 / scale;
    x.strokeRect(0, H + GAP, W, MEMO_H - GAP);
    for (const s of strokes) drawStroke(x, s);
    ctxOf(live).clearRect(0, 0, W, H + MEMO_H);
    labelSurface();
  }
  function setBackground(rgb) {
    bg = rgb; const t = toneOf(rgb);
    tone = t; bar.dataset.tone = t; redraw();
  }

  // ------------------------------------------------------------ input
  let cur = null, swipe = null, erasing = false;
  const round = (v) => Math.round(v * 10) / 10;
  const push = (s, q) => { if (s.p.length < MAX_PTS * 3) s.p.push(round(q[0]), round(q[1]), Math.round(q[2] * 100) / 100); };
  const drawsWith = (e) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && fingerDraws);
  function down(e) {
    // before the first slide key arrives (just after opening a lesson) the strokes are drawn all the same; setPage carries them
    // onto the first slide's page (handoff #73: they used to be dropped, so a line drawn at once did not appear and was not kept)
    if (!drawsWith(e)) { if (e.isPrimary) swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
    if (cur) return;   // one stroke at a time (a second contact is the palm)
    e.preventDefault(); try { surf.setPointerCapture(e.pointerId); } catch { /* gone */ }
    erasing = tool === 'eraser' || (e.buttons & 32) === 32;
    if (erasing) { cur = { id: e.pointerId, removed: [] }; eraseAt(toLogical(e), cur); return; }
    if (strokes.length >= MAX_STROKES) return;
    cur = { id: e.pointerId, s: { c: colour, p: [] } };
    push(cur.s, toLogical(e));
    drawStroke(ctxOf(surf), cur.s);
  }
  function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    const list = coalesced && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const evs = list.length ? list : [e];
    if (erasing) { for (const c of evs) eraseAt(toLogical(c), cur); return; }
    const from = cur.s.p.length;
    for (const c of evs) push(cur.s, toLogical(c));
    drawStroke(ctxOf(surf), cur.s, from);
    // predicted points: on the live layer only, replaced at the next event
    const l = ctxOf(live); l.clearRect(0, 0, W, H + MEMO_H);
    if (predicted && e.getPredictedEvents) {
      const pr = e.getPredictedEvents();
      if (pr.length) { const ps = { c: cur.s.c, p: cur.s.p.slice(-3) }; for (const c of pr) push(ps, toLogical(c)); l.globalAlpha = 0.6; drawStroke(l, ps); }
    }
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
    cur = null; erasing = false; ctxOf(live).clearRect(0, 0, W, H + MEMO_H); labelSurface(); syncUndo();
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
    redraw(); save(); syncUndo();
  }
  const syncUndo = () => { bUndo.disabled = undoStack.length === 0; };
  syncUndo();
  surf.addEventListener('pointerdown', down);
  surf.addEventListener('pointermove', move);
  surf.addEventListener('pointerup', up);
  surf.addEventListener('pointercancel', (e) => { if (cur && e.pointerId === cur.id) { cur = null; erasing = false; redraw(); } swipe = null; });
  surf.addEventListener('touchmove', (e) => { if (cur) e.preventDefault(); }, { passive: false });   // Safari: no scroll while the Pencil draws

  // ------------------------------------------------------------ this device only
  let saveTimer = null, pending = null;
  function save() {
    if (shared() || !key) return;
    clearTimeout(saveTimer);
    pending = [key, strokes.length ? { v: 1, strokes: strokes.slice(), at: Date.now() } : null];
    saveTimer = setTimeout(flush, 300);
  }
  async function flush() {
    clearTimeout(saveTimer);
    const p = pending; pending = null;
    if (p) { try { await putPage(p[0], p[1]); } catch { /* full or blocked: the strokes stay on the screen */ } }
  }
  async function setPage(docId, slideKey) {
    const k = `${docId}|${slideKey}`;
    if (k === key) return;
    await flush();
    // the strokes drawn with no key yet belong to the first slide that arrives (handoff #73), and so do the strokes drawn while
    // its page is being read: both go after the kept ones and are saved with them
    const carry = key ? [] : strokes;
    cur = null; erasing = false; key = k; strokes = carry.slice(); undoStack = carry.map((s) => ({ add: s })); syncUndo();
    if (!shared()) {
      try { const v = await getPage(k); if (key === k && v && Array.isArray(v.strokes)) strokes = v.strokes.filter(strokeOk).concat(strokes).slice(0, MAX_STROKES); } catch { /* none */ }
    }
    if (key !== k) return;
    redraw(); labelSurface(); syncUndo();
    if (undoStack.length) save();
  }
  setTool('pen'); relabel();
  return {
    place, setPage, setBackground, relabel, flush,
    async destroy() { await flush(); surf.remove(); live.remove(); bar.remove(); },
    get barEl() { return bar; },
  };
}
