// Egatari Viewer: the learner's markup (stage 1: highlights in the book, 暗記, the list with colour filters). The page side.
// The frame side paints and anchors (play/markup-frame.js, in the lesson's trusted prefix). This side keeps the highlights and
// owns the markup bar (the page's header) and the list. Every message from the frame is an untrusted request:
//   - the docId is the one this page read from the file (play/scan.mjs), never one from a message, so a request can only touch
//     the record of the lesson that is open;
//   - exact shapes, quotes bounded (exact ≤ 1,000, prefix and suffix ≤ 32 characters), at most MAX highlights per lesson.
// A record (egatari-spec annotations.md, Highlight record): {docId, madeOn: {sourceSha256?, fileSha256}, highlights: [...]}.
// It is kept on this device only (IndexedDB "egatari-viewer-notes"), never in the file and never sent anywhere.
// On a shared device nothing is saved: the highlights live in memory until the lesson closes.
//
//   const M = markup({els, words, onPersist})
//   M.open({frame, docId, sourceSha256, fileSha, shared})   fileSha: a promise of the file's SHA-256 (hex), from the bytes play/main.js read   M.close()   M.message(m) → true when it was a markup message
//   M.setWords(words)   M.toggle(on?)   M.state()
const COLORS = ['y', 'p', 'b'];
const MAX = 2000, MAXQ = 1000, CTX = 32;
const DB = 'egatari-viewer-notes', STORE = 'lessons', NAMES_KEY = 'egatari-viewer-colour-names';

// ---------------------------------------------------------------- storage
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = (async () => {
    if (typeof indexedDB === 'undefined') return null;
    const o = indexedDB.open(DB, 1);
    o.onupgradeneeded = () => { const d = o.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'docId' }); };
    return await req(o);
  })().catch(() => null);
  return dbp;
}
export async function loadRecord(docId) {
  const d = await db(); if (!d || !docId) return null;
  try { return (await req(d.transaction(STORE, 'readonly').objectStore(STORE).get(docId))) || null; } catch { return null; }
}
export async function saveRecord(rec) {
  const d = await db(); if (!d || !rec.docId) return false;
  try { await req(d.transaction(STORE, 'readwrite').objectStore(STORE).put(rec)); return true; } catch { return false; }
}
// what is saved on this device: {lessons, highlights} (asked before 「共有の端末」 deletes it)
export async function countRecords() {
  const d = await db(); if (!d) return { lessons: 0, highlights: 0 };
  try {
    const all = await req(d.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    const withAny = all.filter((r) => r && Array.isArray(r.highlights) && r.highlights.length);
    return { lessons: withAny.length, highlights: withAny.reduce((n, r) => n + r.highlights.length, 0) };
  } catch { return { lessons: 0, highlights: 0 }; }
}
export async function clearAllRecords() { const d = await db(); if (!d) return; try { await req(d.transaction(STORE, 'readwrite').objectStore(STORE).clear()); } catch { /* nothing */ } }
const getNames = () => { try { const v = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}'); return COLORS.reduce((o, c) => ((o[c] = typeof v[c] === 'string' ? v[c].slice(0, 40) : ''), o), {}); } catch { return { y: '', p: '', b: '' }; } };
const setNames = (n) => { try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch { /* memory only */ } };

// ---------------------------------------------------------------- checking requests from the frame
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
const keys = (m, list) => Object.keys(m).every((k) => list.includes(k));
function cleanTarget(t) {
  if (!t || typeof t !== 'object' || !keys(t, ['section', 'quote']) || !isStr(t.section, 200)) return null;
  const q = t.quote;
  if (!q || typeof q !== 'object' || !keys(q, ['exact', 'prefix', 'suffix'])) return null;
  if (!isStr(q.exact, MAXQ) || !q.exact.trim() || !isStr(q.prefix, CTX) || !isStr(q.suffix, CTX)) return null;
  return { section: t.section, quote: { exact: q.exact, prefix: q.prefix, suffix: q.suffix } };
}
const newId = () => { const b = crypto.getRandomValues(new Uint8Array(8)); return 'h-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); };
// the SHA-256 of bytes already read (play/main.js reads the file once, through app/bounded-read.js)
export async function sha256Hex(bytes) {
  try { const h = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join(''); } catch { return ''; }
}

export function markup({ els, words, onPersist = () => {}, onToggle = () => {} }) {
  let W = words;
  const L = { frame: null, docId: '', sourceSha256: '', fileSha: Promise.resolve(''), shared: false, rec: null, available: false, bar: false,
    hidden: [], recall: false, recallColors: COLORS.slice(), missing: [], sections: {}, saveChain: Promise.resolve(), loaded: false };
  const view = () => ({ hidden: L.hidden.slice(), recall: L.recall, recallColors: L.recallColors.slice(), bar: L.bar });
  const send = (m) => { const f = L.frame; if (f && f.contentWindow) f.contentWindow.postMessage(m, '*'); };
  // the frame gets the plain colour words only: the meanings a learner gives colours (getNames) stay in this page and never reach
  // a lesson's frame
  const C = (c) => W().mColour[c];
  const frameWords = () => ({ y: C('y'), p: C('p'), b: C('b'), del: W().mDelete, window: W().mHighlight, pick: W().mPick, close: W().mPickClose,
    reveal: { y: W().mReveal(C('y')), p: W().mReveal(C('p')), b: W().mReveal(C('b')) } });
  const colourLabel = (c) => { const n = getNames()[c]; return n ? `${W().mColour[c]}（${n}）` : W().mColour[c]; };
  const pushAll = () => send({ egaViewer: 'markup-load', list: L.rec ? L.rec.highlights : [], words: frameWords(), view: view() });
  const pushView = () => send({ egaViewer: 'markup-view', view: view() });

  async function persist() {
    if (L.shared || !L.docId || !L.rec) return;
    const rec = L.rec;
    L.saveChain = L.saveChain.then(async () => {
      if (!rec.madeOn.fileSha256) rec.madeOn.fileSha256 = await L.fileSha;
      const ok = await saveRecord(JSON.parse(JSON.stringify(rec)));
      if (ok && rec.highlights.length) onPersist();
    });
    await L.saveChain;
  }
  function changed() { pushAll(); renderBar(); if (els.list.open) renderList(); persist(); }

  // ---------------------------------------------------------------- messages from the frame (already checked: from that frame, origin "null")
  function message(m) {
    if (!m || typeof m.egaViewer !== 'string' || !m.egaViewer.startsWith('markup-')) return false;
    if (!L.frame) return true;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const H = L.rec ? L.rec.highlights : [];
    const find = (id) => H.find((h) => h.id === id);
    switch (m.egaViewer) {
      case 'markup-hello':
        if (!keys(m, ['egaViewer', 'supported', 'article']) || typeof m.supported !== 'boolean' || typeof m.article !== 'boolean') break;
        L.available = m.supported && m.article;
        els.button.hidden = !L.available;
        if (!L.available && L.bar) toggle(false);
        if (L.available && L.loaded) pushAll();
        break;
      case 'markup-add': {
        if (!keys(m, ['egaViewer', 'color', 'target']) || !COLORS.includes(m.color) || !L.rec) break;
        const t = cleanTarget(m.target);
        if (!t || H.length >= MAX) { if (H.length >= MAX) els.announce(W().mFull(MAX)); break; }
        H.push({ id: newId(), color: m.color, target: t, created: now, modified: now });
        changed(); els.announce(W().mAdded(W().mColour[m.color]));
        break;
      }
      case 'markup-set': {
        if (!keys(m, ['egaViewer', 'id', 'color']) || !isStr(m.id, 40) || !COLORS.includes(m.color)) break;
        const h = find(m.id); if (!h || h.color === m.color) break;
        h.color = m.color; h.modified = now; changed();
        break;
      }
      case 'markup-del': {
        if (!keys(m, ['egaViewer', 'id']) || !isStr(m.id, 40) || !find(m.id)) break;
        L.rec.highlights = H.filter((h) => h.id !== m.id); changed(); els.announce(W().mDeleted);
        break;
      }
      case 'markup-status': {
        if (!keys(m, ['egaViewer', 'missing', 'sections']) || !Array.isArray(m.missing) || m.missing.length > MAX || !m.sections || typeof m.sections !== 'object') break;
        L.missing = m.missing.filter((x) => isStr(x, 40));
        const s = Object.create(null); let n = 0;   // no prototype: a key named __proto__ is just a key
        for (const [k, v] of Object.entries(m.sections)) { if (++n > 500) break; if (isStr(k, 200) && isStr(v, 200) && k !== '__proto__') s[k] = v; }
        L.sections = s;
        if (els.list.open) renderList();
        break;
      }
      case 'markup-esc':
        if (keys(m, ['egaViewer']) && L.bar) { toggle(false); els.button.focus(); }
        break;
    }
    return true;
  }

  // ---------------------------------------------------------------- opening and closing a lesson
  async function open({ frame, docId, sourceSha256 = '', fileSha = Promise.resolve(''), shared = false }) {
    close();
    Object.assign(L, { frame, docId: String(docId || ''), sourceSha256: String(sourceSha256 || ''), fileSha: Promise.resolve(fileSha).catch(() => ''), shared, loaded: false, missing: [], sections: {} });
    let rec = shared ? null : await loadRecord(L.docId);
    if (L.frame !== frame) return;
    if (!rec || !Array.isArray(rec.highlights)) rec = { docId: L.docId, madeOn: {}, highlights: [] };
    rec.madeOn = { ...(L.sourceSha256 ? { sourceSha256: L.sourceSha256 } : {}), fileSha256: '' };   // the version now open; computed on the next save
    rec.highlights = rec.highlights.filter((h) => h && isStr(h.id, 40) && COLORS.includes(h.color) && cleanTarget(h.target)).slice(0, MAX);
    L.rec = rec; L.loaded = true;
    if (L.available) pushAll();
    renderBar();
  }
  function close() {
    if (els.list.open) els.list.close();
    if (els.confirm.open) els.confirm.close();
    L.bar = false; L.recall = false; L.hidden = []; L.recallColors = COLORS.slice(); L.available = false; L.frame = null; L.rec = null; L.loaded = false;
    els.button.hidden = true; els.button.setAttribute('aria-pressed', 'false');
    els.header.classList.remove('markup'); els.header.style.minHeight = ''; els.bar.hidden = true;
  }

  // ---------------------------------------------------------------- the markup bar (in the header: never over the lesson's frame)
  // Closing the bar ends 暗記 and shows every colour again: nothing changes the book while the bar that says so is closed.
  function toggle(on = !L.bar) {
    if (!L.frame || (on && !L.available)) return;
    L.bar = on;
    if (!on) { L.recall = false; L.hidden = []; }
    // the header keeps its height (a phone's header can be two rows tall), so the lesson's frame never moves under the viewer's finger
    if (on) els.header.style.minHeight = els.header.getBoundingClientRect().height + 'px'; else els.header.style.minHeight = '';
    els.header.classList.toggle('markup', on);
    els.bar.hidden = !on;
    els.button.setAttribute('aria-pressed', on ? 'true' : 'false');
    renderBar(); pushView(); onToggle(on);
  }
  function renderBar() {
    els.recall.setAttribute('aria-pressed', L.recall ? 'true' : 'false');
    els.recallColours.hidden = !L.recall;
    for (const b of els.recallColours.querySelectorAll('button[data-c]')) {
      const c = b.getAttribute('data-c');
      b.setAttribute('aria-pressed', L.recallColors.includes(c) ? 'true' : 'false');
      b.setAttribute('aria-label', W().mRecallColour(colourLabel(c)));
      b.title = colourLabel(c);
    }
    const n = L.rec ? L.rec.highlights.length : 0;
    els.listButton.textContent = W().mList;
    if (n) { const c = document.createElement('span'); c.className = 'n'; c.textContent = W().mListCount(n); els.listButton.appendChild(c); }
    els.note.hidden = !L.shared;
    els.filtered.hidden = L.hidden.length === 0;
  }
  function setRecall(on) { L.recall = on; renderBar(); pushView(); els.announce(on ? W().mRecallOn : W().mRecallOff); }
  function toggleRecallColour(c) {
    const has = L.recallColors.includes(c);
    if (has && L.recallColors.length === 1) return;   // at least one colour: 暗記 with none would hide nothing
    L.recallColors = has ? L.recallColors.filter((x) => x !== c) : COLORS.filter((x) => x === c || L.recallColors.includes(x));
    renderBar(); pushView();
  }

  // ---------------------------------------------------------------- the list (a dialog in the page)
  function renderList() {
    const box = els.listBody, H = L.rec ? L.rec.highlights : [], names = getNames();
    box.textContent = '';
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    // per colour: name, count, この色だけ表示 / この色を非表示 / この色を全部消す
    const colours = mk('ul', 'm-colours');
    for (const c of COLORS) {
      const n = H.filter((h) => h.color === c).length;
      const li = mk('li', 'm-colour');
      const head = mk('div', 'm-chead');
      head.appendChild(mk('span', 'm-sw m-' + c));
      const lab = mk('label', 'm-name');
      lab.appendChild(mk('span', 'm-cname', W().mColour[c]));
      const inp = mk('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = names[c]; inp.placeholder = W().mNamePh; inp.setAttribute('aria-label', W().mNameLabel(W().mColour[c]));
      inp.addEventListener('change', () => { const all = getNames(); all[c] = inp.value.trim().slice(0, 40); setNames(all); pushAll(); renderBar(); });
      lab.appendChild(inp);
      head.appendChild(lab);
      head.appendChild(mk('span', 'm-count', W().mCount(n)));
      li.appendChild(head);
      const row = mk('div', 'm-crow');
      const only = mk('button', null, W().mOnly); only.type = 'button';
      only.setAttribute('aria-pressed', L.hidden.length === 2 && !L.hidden.includes(c) ? 'true' : 'false');
      only.addEventListener('click', () => { L.hidden = only.getAttribute('aria-pressed') === 'true' ? [] : COLORS.filter((x) => x !== c); pushView(); renderBar(); renderList(); });
      const hide = mk('button', null, W().mHide); hide.type = 'button';
      hide.setAttribute('aria-pressed', L.hidden.includes(c) ? 'true' : 'false');
      hide.addEventListener('click', () => { L.hidden = L.hidden.includes(c) ? L.hidden.filter((x) => x !== c) : [...L.hidden, c]; pushView(); renderBar(); renderList(); });
      const del = mk('button', 'm-danger', W().mDeleteColour); del.type = 'button'; del.disabled = n === 0;
      del.addEventListener('click', () => askDelete(c, n));
      row.append(only, hide, del);
      li.appendChild(row);
      colours.appendChild(li);
    }
    box.appendChild(colours);
    if (L.shared) box.appendChild(mk('p', 'small', W().mShared));
    // the highlights, by section in the order of the book
    const missing = new Set(L.missing);
    const placed = H.filter((h) => !missing.has(h.id));
    if (!H.length) box.appendChild(mk('p', 'small', W().mEmpty));
    const order = Object.keys(L.sections);
    const groups = new Map();
    for (const h of placed) { const k = h.target.section; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); }
    const sorted = [...groups.keys()].sort((a, b) => (a === '' ? -1 : order.indexOf(a)) - (b === '' ? -1 : order.indexOf(b)));
    const item = (h, jump) => {
      const li = mk('li', 'm-item');
      li.appendChild(mk('span', 'm-sw m-' + h.color));
      const q = h.target.quote.exact.replace(/\s+/g, ' ');
      const t = q.length > 80 ? q.slice(0, 80) + '…' : q;
      if (jump) {
        const b = mk('button', 'm-q', t); b.type = 'button'; b.setAttribute('aria-label', W().mJump(W().mColour[h.color], t));
        b.addEventListener('click', () => { els.list.close(); send({ egaViewer: 'markup-jump', id: h.id }); });
        li.appendChild(b);
      } else {
        li.appendChild(mk('span', 'm-q', t));
        const d = mk('button', null, W().mDelete); d.type = 'button'; d.setAttribute('aria-label', W().mDeleteOne(t));
        d.addEventListener('click', () => { L.rec.highlights = L.rec.highlights.filter((x) => x.id !== h.id); changed(); });
        li.appendChild(d);
      }
      if (L.hidden.includes(h.color)) li.classList.add('m-off');
      return li;
    };
    for (const k of sorted) {
      box.appendChild(mk('h3', null, k === '' ? W().mNoSection : (L.sections[k] || k)));
      const ul = mk('ul', 'm-items'); for (const h of groups.get(k)) ul.appendChild(item(h, true)); box.appendChild(ul);
    }
    const lost = H.filter((h) => missing.has(h.id));
    if (lost.length) {
      box.appendChild(mk('h3', null, W().mMissing));
      box.appendChild(mk('p', 'small', W().mMissingNote));
      const ul = mk('ul', 'm-items'); for (const h of lost) ul.appendChild(item(h, false)); box.appendChild(ul);
    }
  }
  function showList() { if (!L.frame) return; renderList(); els.list.showModal(); }
  // confirmations are in the page (a dialog), never confirm(): 「この色を全部消す」, and turning 「共有の端末」 on (play/main.js)
  let answer = null;
  function ask(text, yes) {
    if (answer) answer(false);
    els.confirmText.textContent = text;
    els.confirmYes.textContent = yes || W().mDelete;
    els.confirm.showModal();
    els.confirmNo.focus();
    return new Promise((res) => { answer = res; });
  }
  function settle(v) { const a = answer; answer = null; if (els.confirm.open) els.confirm.close(); if (a) a(v); }
  async function askDelete(c, n) {
    if (!(await ask(W().mDeleteColourAsk(W().mColour[c], n))) || !L.rec) return;
    L.rec.highlights = L.rec.highlights.filter((h) => h.color !== c); changed(); els.announce(W().mDeleted);
  }
  function init() {
    els.button.addEventListener('click', () => toggle());
    els.recall.addEventListener('click', () => setRecall(!L.recall));
    for (const b of els.recallColours.querySelectorAll('button[data-c]')) b.addEventListener('click', () => toggleRecallColour(b.getAttribute('data-c')));
    els.listButton.addEventListener('click', showList);
    els.listClose.addEventListener('click', () => els.list.close());
    els.confirmNo.addEventListener('click', () => settle(false));
    els.confirmYes.addEventListener('click', () => settle(true));
    els.confirm.addEventListener('close', () => settle(false));   // Esc
    els.filteredShow.addEventListener('click', () => { L.hidden = []; pushView(); renderBar(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !L.bar || e.defaultPrevented || els.list.open || els.confirm.open) return;
      e.preventDefault(); toggle(false); els.button.focus();
    });
  }
  init();
  return {
    open, close, message, toggle, ask,
    setWords(w) { W = w; renderBar(); if (L.available && L.loaded) pushAll(); if (els.list.open) renderList(); },
    state: () => ({ available: L.available, bar: L.bar, recall: L.recall, recallColors: L.recallColors.slice(), hidden: L.hidden.slice(), shared: L.shared,
      docId: L.docId, missing: L.missing.slice(), record: L.rec ? JSON.parse(JSON.stringify(L.rec)) : null }),
    saved: () => L.saveChain,
  };
}
