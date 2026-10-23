// スライド一覧（backlog #79）：編集の画面の左の板に、スライドを順に縮図（その枚の最後のステップ）と見出しで並べ、足す・複製・削除・並べ替えをする
// 縮図は sandbox の iframe（プレビューと同じ決まり。aria-hidden・inert・クリックを通さない）に、デッキ自身が描く（app/frame-shim.js の strip。
// kit/tools.js のスライド一覧 o と同じ写し方）。一覧（listbox）・ボタン・ドラッグはこのページの信頼する部品で、iframe の上に重ねる
//
// 書き換えは原稿（deck.html）・口述原稿（narration.md）・音声の記録（audio/manifest.json）と、消したスライドの音声のファイルだけ
// （文字列の操作は kit/core/slide-ops.mjs）。書く前に .cache/edits/ に控え（音声のファイルも remove が控える）、読んだときから変わっていれば書かない。
// 書いた後は組み直し（段 B：1 ファイルは次の「保存」で組み直す。スライドの原稿が変わると段 A は断るので）、プレビューをその枚へ動かし、品質チェックを出す
// 元に戻す：直前の 1 つの操作を、メモリの上の前の中身（3 つのファイルと消した音声のバイト・音声の板の使っていない取り直し）で戻す。
// 次のスライドの操作・作業場所を替える・1 ファイルの保存までで、その間に 3 つのファイルがほかの編集で変わっていれば戻さない（控えは .cache/edits/ に残る）
//
//   createSlidesPanel(ctx)
//     ctx = {T（app/i18n.js の T.sl）, el, host（#slides）, ws(), generation(), deckFile(), slides()（組み立ての {key, id, heading}）, pos()（{i}）,
//            go(i)（プレビューをその枚へ）, goAfter(i)（組み直した後の読み込みでその枚へ）, thumbsDoc(cfg)（縮図の文書。動かしてよくなければ null）,
//            guard() → 断る理由 | null, building() → Promise | null, rebuild() → 失敗なら true, check()（品質チェック）, ask, toast, lang,
//            audio（音声の板：takeOut(key)・putBack(x)・pendingFor(key)）, stale()（音声が古い段階の鍵）}
//   panel.toggle(on?)・isOpen()・refresh()（組み直した後）・onPos()・reset()（作業場所を替えた）・saved()（1 ファイルを保存した）・state()（試験）
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { headingLine, parseNarration } from '../kit/core/narration-core.mjs';
import { AUDIO_LIMITS } from '../kit/core/audio-core.mjs';
import {
  slideChunks, insertSlide, duplicateSlide, deleteSlide, moveSlide, slideTemplate, TEMPLATES, newIdFor,
  insertSection, copySections, removeSections, reorderSections, stepsIn, removeAudio, audioEntries,
} from '../kit/core/slide-ops.mjs';

export const ROW = 84, THUMB_W = 128;
const OPEN_KEY = 'egatari-slides-open';
const SRC = { max: READ_LIMITS.source }, NARR = { max: READ_LIMITS.narration }, JSONL = { max: READ_LIMITS.json };

export function createSlidesPanel(ctx) {
  const { T, el, host } = ctx;
  let want = null;
  let open = false, sel = 0, busy = false, undo = null, lastDoc = null, info = new Map(), drag = null, infoSeq = 0;
  const frame = () => host.querySelector('#sl-thumbs');
  const list = () => host.querySelector('#sl-list');
  const live = (msg) => { const r = host.querySelector('#sl-live'); if (!r) return; r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30); };

  // ---------------------------------------------------------------- 板の組み立て
  host.append(
    el('div', { cls: 'panel-head' }, [el('b', { id: 'sl-title', text: T.title }), el('span', { cls: 'sp' }),
      el('button', { type: 'button', id: 'sl-close', cls: 'ghost', 'aria-label': T.close, title: T.close, text: '✕', onclick: () => toggle(false) })]),
    el('div', { cls: 'sl-tools', role: 'toolbar', 'aria-label': T.toolsLabel }, [
      el('div', { cls: 'menu' }, [
        el('button', { type: 'button', id: 'sl-add', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'sl-add-menu', text: T.add, onclick: (e) => { e.stopPropagation(); addMenu(); } }),
        // スライドの挿入：雛形から（slide-ops の雛形）か、チャットの AI に書いてもらう（ctx.aiInsert。app/llm.js）。どちらも選んだスライドの後ろ
        el('div', { id: 'sl-add-menu', cls: 'menu-list', role: 'menu', hidden: '' }, [
          el('div', { role: 'group', 'aria-labelledby': 'sl-add-tpl-h' }, [el('div', { id: 'sl-add-tpl-h', cls: 'menu-head', text: T.fromTpl }),
            ...TEMPLATES.map((k) => el('button', { type: 'button', role: 'menuitem', id: 'sl-add-' + k, text: T.tpl[k], onclick: () => { closeAdd(); add(k); } }))]),
          ...(ctx.aiInsert ? [el('div', { role: 'separator', cls: 'menu-sep' }),
            el('button', { type: 'button', role: 'menuitem', id: 'sl-add-ai', text: T.byAi, onclick: () => { closeAdd(); ctx.aiInsert(sel); } })] : []),
        ]),
      ]),
      el('button', { type: 'button', id: 'sl-dup', text: T.dup, title: T.dupTip, onclick: () => duplicate() }),
      el('button', { type: 'button', id: 'sl-del', text: T.del, title: T.delTip, onclick: () => remove() }),
      el('button', { type: 'button', id: 'sl-up', text: '↑', title: T.upTip, 'aria-label': T.upTip, onclick: () => move(sel, sel - 1) }),
      el('button', { type: 'button', id: 'sl-down', text: '↓', title: T.downTip, 'aria-label': T.downTip, onclick: () => move(sel, sel + 1) }),
    ]),
    el('div', { id: 'sl-undo-row', cls: 'sl-undo', hidden: '' }, [el('span', { id: 'sl-undo-what' }), el('button', { type: 'button', id: 'sl-undo', text: T.undo, onclick: () => undoLast() })]),
    el('div', { id: 'sl-scroll' }, [el('div', { id: 'sl-wrap' }, [
      el('ul', { id: 'sl-list', role: 'listbox', tabindex: '0', 'aria-label': T.listLabel, 'aria-describedby': 'sl-keys' }),
    ])]),
    el('p', { id: 'sl-keys', cls: 'hint', text: T.keys }),
    el('div', { id: 'sl-live', cls: 'sr-only', 'aria-live': 'polite', role: 'status' }),
  );
  const addBtn = host.querySelector('#sl-add'), addList = host.querySelector('#sl-add-menu');
  function addMenu() {
    const was = !addList.hidden;
    closeAdd();
    if (was) return;
    addList.hidden = false; addBtn.setAttribute('aria-expanded', 'true');
    addList.querySelector('button').focus();
  }
  function closeAdd(focus) { if (addList.hidden) return; addList.hidden = true; addBtn.setAttribute('aria-expanded', 'false'); if (focus) addBtn.focus(); }
  addList.addEventListener('keydown', (e) => {
    const items = [...addList.querySelectorAll('button')], i = items.indexOf(host.ownerDocument.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAdd(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[((i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Tab') closeAdd();
  });
  host.ownerDocument.addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('#sl-add-menu, #sl-add')) closeAdd(); });

  // ---------------------------------------------------------------- 一覧（listbox）：↑↓ Home End で選ぶ（プレビューもその枚へ）、Alt+↑↓ で動かす、Delete で消す
  const ul = list();
  ul.addEventListener('keydown', (e) => {
    const n = (ctx.slides() || []).length;
    if (!n) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(sel, sel + (e.key === 'ArrowUp' ? -1 : 1)); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to = null;
    if (e.key === 'ArrowUp') to = sel - 1; else if (e.key === 'ArrowDown') to = sel + 1;
    else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = n - 1;
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.go(sel); return; }
    if (to === null) return;
    e.preventDefault();
    select(Math.max(0, Math.min(n - 1, to)), true);
  });
  ul.addEventListener('click', (e) => { const o = e.target.closest('[role=option]'); if (o) { select(+o.dataset.i, true); ul.focus(); } });
  // ドラッグで並べ替え：落とす位置（上の半分なら前、下の半分なら後ろ）に線を出す
  ul.addEventListener('dragstart', (e) => {
    const o = e.target.closest('[role=option]'); if (!o || busy) { e.preventDefault(); return; }
    drag = { from: +o.dataset.i, to: null };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(drag.from)); } catch { /* 無視 */ }
    o.classList.add('dragging');
  });
  ul.addEventListener('dragover', (e) => {
    if (!drag) return;
    const o = e.target.closest('[role=option]'); if (!o) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = o.getBoundingClientRect(), i = +o.dataset.i, after = e.clientY > r.top + r.height / 2;
    drag.to = { i, after };
    for (const x of ul.querySelectorAll('.drop-before, .drop-after')) x.classList.remove('drop-before', 'drop-after');
    o.classList.add(after ? 'drop-after' : 'drop-before');
  });
  ul.addEventListener('dragleave', (e) => { if (!ul.contains(e.relatedTarget)) for (const x of ul.querySelectorAll('.drop-before, .drop-after')) x.classList.remove('drop-before', 'drop-after'); });
  ul.addEventListener('drop', (e) => {
    if (!drag || !drag.to) return;
    e.preventDefault();
    const { from } = drag, { i, after } = drag.to;
    let to = after ? i + 1 : i;
    if (to > from) to--;
    endDrag();
    if (to !== from) move(from, to);
  });
  ul.addEventListener('dragend', endDrag);
  function endDrag() { drag = null; for (const x of ul.querySelectorAll('.drop-before, .drop-after, .dragging')) x.classList.remove('drop-before', 'drop-after', 'dragging'); }

  function select(i, go) {
    sel = i;
    for (const o of ul.querySelectorAll('[role=option]')) {
      const on = +o.dataset.i === i;
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      o.classList.toggle('sel', on);
      if (on) { ul.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    }
    updateButtons();
    // 一覧で選んで動かしたプレビューの位置の知らせは、その枚に着くまで選択に返さない（途中の枚の知らせで選択が戻らないように）
    if (go) { want = { i, until: Date.now() + 2000 }; ctx.go(i); }
  }
  function updateButtons() {
    const n = (ctx.slides() || []).length, dis = busy || !n;
    host.querySelector('#sl-dup').disabled = dis;
    host.querySelector('#sl-del').disabled = dis || n < 2;
    host.querySelector('#sl-up').disabled = dis || sel <= 0;
    host.querySelector('#sl-down').disabled = dis || sel >= n - 1;
    addBtn.disabled = busy;
    host.querySelector('#sl-undo').disabled = busy;
    host.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- 描く
  function render() {
    if (!open) return;
    const slides = ctx.slides() || [];
    if (sel >= slides.length) sel = Math.max(0, slides.length - 1);
    ul.innerHTML = '';
    slides.forEach((s, i) => {
      const a = info.get(s.key) || {};
      const badges = [];
      if (a.missing) badges.push(el('span', { cls: 'sl-badge need', text: T.needAudio(a.missing) }));
      if (a.stale) badges.push(el('span', { cls: 'sl-badge stale', text: T.staleAudio(a.stale) }));
      const title = s.heading || T.untitled;
      const desc = [a.missing ? T.needAudio(a.missing) : '', a.stale ? T.staleAudio(a.stale) : ''].filter(Boolean).join('、');
      ul.append(el('li', { role: 'option', id: 'sl-o-' + i, 'data-i': String(i), 'data-key': s.key, draggable: 'true', 'aria-selected': i === sel ? 'true' : 'false',
        'aria-label': T.optionLabel(i + 1, slides.length, title, desc), cls: i === sel ? 'sel' : '' }, [
        el('span', { cls: 'sl-thumb', 'aria-hidden': 'true' }),
        el('span', { cls: 'sl-text', 'aria-hidden': 'true' }, [el('span', { cls: 'sl-n', text: String(i + 1) }), el('span', { cls: 'sl-h', text: title }), ...(badges.length ? [el('span', { cls: 'sl-badges' }, badges)] : [])]),
      ]));
    });
    if (slides[sel]) ul.setAttribute('aria-activedescendant', 'sl-o-' + sel); else ul.removeAttribute('aria-activedescendant');
    const u = host.querySelector('#sl-undo-row');
    u.hidden = !undo;
    if (undo) { const w = host.querySelector('#sl-undo-what'); w.textContent = undo.label; w.title = undo.label; }
    updateButtons();
    drawThumbs();
  }
  // 縮図の iframe：組んだデッキが替わったときだけ読み込み直す（ほかの描き直しでは触らない）
  function drawThumbs() {
    const wrap = host.querySelector('#sl-wrap');
    const n = (ctx.slides() || []).length;
    wrap.style.height = n * ROW + 'px';
    const docText = ctx.thumbsDoc({ w: THUMB_W, row: ROW, bg: getComputedStyle(host).backgroundColor });
    let f = frame();
    if (!docText) { if (f) f.remove(); lastDoc = null; return; }
    if (!f) {
      f = el('iframe', { id: 'sl-thumbs', name: 'sl-thumbs', title: T.thumbsTitle, sandbox: 'allow-scripts', 'aria-hidden': 'true', tabindex: '-1' });
      f.inert = true;
      wrap.prepend(f);
      lastDoc = null;
    }
    f.style.height = n * ROW + 'px';
    if (docText !== lastDoc) { lastDoc = docText; f.srcdoc = docText; }
  }
  // 音声の知らせ：音声を使うデッキ（記録が 1 つでもある）で、口述原稿の段階のうち記録のないもの（音声が要る）と古いもの
  async function loadInfo() {
    const seq = ++infoSeq, ws = ctx.ws();
    const out = new Map();
    try {
      const man = await ws.readText('audio/manifest.json', JSONL);
      const narr = await ws.readText('narration.md', NARR);
      const { seg } = audioEntries(man);
      const has = Object.keys(seg).length > 0;
      const stale = new Set(ctx.stale() || []);
      if (has && narr) {
        for (const g of parseNarration(narr)) {
          const k = `${g.slideKey}:${g.stepKey}`, a = out.get(g.slideKey) || { missing: 0, stale: 0 };
          if (!Object.prototype.hasOwnProperty.call(seg, k)) a.missing++;
          else if (stale.has(k)) a.stale++;
          out.set(g.slideKey, a);
        }
      }
    } catch { /* 読めない：知らせを出さない */ }
    if (seq !== infoSeq || ws !== ctx.ws()) return;
    info = out;
    render();
  }

  // ---------------------------------------------------------------- 操作の共通の流れ
  // fn(before) → {deck, narr, man, files: [audio/ の下の消すファイル], at（操作の後に見せる枚）, label（元に戻すの説明）, done（知らせ）, takeOut?: 鍵} | null（やめた）
  async function run(fn) {
    if (busy) { ctx.toast(T.busy, true); return false; }
    const why = await ctx.guard();
    if (why) { ctx.toast(why, true); return false; }
    busy = true; updateButtons();
    const ws = ctx.ws(), g = ctx.generation();
    const alive = () => ctx.ws() === ws && ctx.generation() === g;
    try {
      const b = ctx.building(); if (b) await b;
      const file = ctx.deckFile();
      const read = async () => ({ deck: await ws.readText(file, SRC), narr: await ws.readText('narration.md', NARR), man: await ws.readText('audio/manifest.json', JSONL) });
      const before = await read();
      if (before.deck === null) throw new Error(file + ' not found');
      const c = slideChunks(before.deck);
      if (c.problem) { ctx.toast(T.deckProblem(c.problem), true); return false; }
      const r = await fn(before, c.slides);
      if (!r || !alive()) return false;
      // 書く直前に：読んだときのままか（確かめの窓の間にほかの道具が書いていれば上書きしない）
      const now = await read();
      if (!alive()) return false;
      if (now.deck !== before.deck || now.narr !== before.narr || now.man !== before.man) { ctx.toast(T.changed, true); return false; }
      const files = [];
      for (const f of r.files || []) {
        const rel = 'audio/' + f;
        if (!(await ws.exists(rel))) continue;
        files.push({ rel, bytes: await ws.readBytes(rel, { max: AUDIO_LIMITS.fileBytes }) });
      }
      await writeAll(ws, file, before, r, alive);
      for (const x of files) await ws.remove(x.rel, { live: alive, max: AUDIO_LIMITS.fileBytes });
      const takes = r.takeOut && ctx.audio ? ctx.audio.takeOut(r.takeOut) : null;
      undo = { label: r.label, file, before, after: { deck: r.deck, narr: r.narr, man: r.man }, files, takes, at: r.undoAt };
      sel = r.at;
      await afterChange(r.at, r.done);
      return true;
    } catch (e) {
      if (e && e.name === 'Cancelled') { ctx.toast(T.cancelled, true); return false; }
      console.warn('[editor] slide operation failed', e);
      ctx.toast(T.failed(String((e && e.message) || e)), true);
      return false;
    } finally { busy = false; updateButtons(); }
  }
  // 3 つのファイルを書く（変わったものだけ。前に控え）。null は「ないファイル」：あったものは消す（remove が控える）
  async function writeAll(ws, file, before, next, alive) {
    for (const [rel, a, b, lim] of [[file, before.deck, next.deck, SRC], ['narration.md', before.narr, next.narr, NARR], ['audio/manifest.json', before.man, next.man, JSONL]]) {
      if (a === b || b === undefined) continue;
      if (b === null) { if (a !== null) await ws.remove(rel, { live: alive, max: lim.max }); continue; }
      if (a !== null) await ws.backup(rel, lim);
      if (!alive()) throw Object.assign(new Error('cancelled'), { name: 'Cancelled' });
      await ws.writeText(rel, b, { live: alive });
    }
  }
  async function afterChange(at, msg) {
    await ctx.rebuild();
    ctx.goAfter(at);
    render();
    loadInfo();
    if (msg) { live(msg); ctx.toast(msg); }
    const o = ul.querySelector(`[data-i="${at}"]`); if (o) o.scrollIntoView({ block: 'nearest' });
    await ctx.check();
    // 品質チェックの板が開いても、キーボードの位置は一覧に戻す（続けて操作できるように）
    if (open) ul.focus();
  }
  const keysOf = (src) => slideChunks(src).slides.map((s) => s.key);
  const nameOf = (s, i) => T.slideName(i + 1, s.heading || T.untitled);

  // ---------------------------------------------------------------- 足す
  // after：この番号のスライドの後ろ（省けば選んだスライド。null なら最後）
  function add(kind, after = sel) {
    return run(async (b, slides) => {
      const at = after === null ? slides.length - 1 : Math.min(after, slides.length - 1);
      const id = newIdFor(b.deck);
      const t = slideTemplate(kind, { lang: ctx.lang(b.deck), id });
      const deck = insertSlide(b.deck, at, t.html);
      const lines = [headingLine({ key: id, id, heading: t.heading }), ...t.steps.map(([k, x]) => `[${k}] ${x}`)];
      const narr = insertSection(b.narr, keysOf(deck), id, lines);
      return { deck, narr, man: b.man, at: at + 1, undoAt: at, label: T.undoAdd(t.heading), done: T.added(at + 2, T.tpl[kind]) };
    });
  }
  // ---------------------------------------------------------------- 複製（口述原稿は写す。音声は写さない）
  function duplicate() {
    return run(async (b, slides) => {
      const s = slides[sel]; if (!s) return null;
      const id = newIdFor(b.deck);
      const d = duplicateSlide(b.deck, sel, id);
      let narr = b.narr;
      if (b.narr != null) narr = copySections(b.narr, s.key, { key: id, id, heading: s.heading }).out;
      return { deck: d.out, narr, man: b.man, at: sel + 1, undoAt: sel, label: T.undoDup(nameOf(s, sel)), done: T.duplicated(sel + 1, sel + 2) };
    });
  }
  // ---------------------------------------------------------------- 削除（確かめる。口述原稿の節・音声の記録とファイル・使っていない取り直しも消す）
  function remove() {
    return run(async (b, slides) => {
      const i = sel, s = slides[i];
      if (!s || slides.length < 2) return null;
      const a = b.man ? removeAudio(b.man, s.key) : { out: b.man, removed: {}, files: [] };
      const steps = stepsIn(b.narr, s.key), nAudio = Object.keys(a.removed).length, nTakes = ctx.audio ? ctx.audio.pendingFor(s.key) : 0;
      const name = nameOf(s, i);
      const v = await ctx.ask({ title: T.delTitle(name), kind: 'warn', body: [
        el('p', { id: 'sl-del-what', text: T.delLead(name) }),
        el('ul', { id: 'sl-del-list' }, [
          el('li', { text: T.delNarr(steps) }),
          el('li', { text: T.delAudio(nAudio, a.files.length) }),
          ...(nTakes ? [el('li', { text: T.delTakes(nTakes) })] : []),
        ]),
        el('p', { id: 'sl-del-warn', cls: 'note bad', text: T.delWarn }),
        el('p', { cls: 'hint', text: T.delUndo }),
      ], buttons: [{ id: 'cancel', label: T.cancel }, { id: 'delete', label: T.delGo, pri: true }] });
      if (v !== 'delete') return null;
      const deck = deleteSlide(b.deck, i);
      const narr = removeSections(b.narr, s.key).out;
      return { deck, narr, man: a.out, files: a.files, takeOut: s.key, at: Math.min(i, slides.length - 2), undoAt: i, label: T.undoDel(name), done: T.deleted(name) };
    });
  }
  // ---------------------------------------------------------------- 並べ替え（id も鍵も変えない。口述原稿の節を同じ順に。音声は鍵で付いたまま）
  function move(from, to) {
    const n = (ctx.slides() || []).length;
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return Promise.resolve(false);
    return run(async (b, slides) => {
      const s = slides[from];
      const deck = moveSlide(b.deck, from, to);
      const narr = reorderSections(b.narr, keysOf(deck));
      return { deck, narr, man: b.man, at: to, undoAt: from, label: T.undoMove(nameOf(s, from)), done: T.moved(s.heading || T.untitled, from + 1, to + 1, n) };
    });
  }
  // ---------------------------------------------------------------- 元に戻す
  async function undoLast() {
    const u = undo;
    if (!u) return false;
    if (busy) { ctx.toast(T.busy, true); return false; }
    const why = await ctx.guard();
    if (why) { ctx.toast(why, true); return false; }
    busy = true; updateButtons();
    const ws = ctx.ws(), g = ctx.generation();
    const alive = () => ctx.ws() === ws && ctx.generation() === g;
    try {
      const b = ctx.building(); if (b) await b;
      const now = { deck: await ws.readText(u.file, SRC), narr: await ws.readText('narration.md', NARR), man: await ws.readText('audio/manifest.json', JSONL) };
      if (now.deck !== u.after.deck || now.narr !== u.after.narr || now.man !== u.after.man) { undo = null; render(); ctx.toast(T.undoChanged, true); return false; }
      await writeAll(ws, u.file, now, u.before, alive);
      for (const x of u.files) await ws.writeBytes(x.rel, x.bytes, { live: alive });
      if (u.takes && ctx.audio) ctx.audio.putBack(u.takes);
      undo = null;
      sel = u.at;
      await afterChange(u.at, T.undone(u.label));
      return true;
    } catch (e) {
      console.warn('[editor] undo failed', e);
      ctx.toast(T.failed(String((e && e.message) || e)), true);
      return false;
    } finally { busy = false; updateButtons(); }
  }

  // ---------------------------------------------------------------- 開け閉め・外からの知らせ
  function toggle(on, focus = true) {
    open = on === undefined ? !open : !!on;
    host.hidden = !open;
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* 使えない環境 */ }
    if (ctx.onToggle) ctx.onToggle(open, focus);
    if (open) {
      const p = ctx.pos(); if (p && Number.isFinite(p.i)) sel = p.i;
      render(); loadInfo();
      if (focus) ul.focus();
    } else { const f = frame(); if (f) f.remove(); lastDoc = null; }
    return open;
  }
  function wantOpen() { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } }
  return {
    toggle, isOpen: () => open, wantOpen,
    // 外からの操作（スライドの挿入…）：選んだスライド（一覧を開いていなければ null）・雛形から足す・同じ流れで書き換える（fn は run と同じ形）
    selected: () => (open && (ctx.slides() || []).length ? sel : null),
    add: (kind, after) => add(kind, after), apply: (fn) => run(fn),
    refresh: () => { if (open) { render(); loadInfo(); } },
    onPos: () => {
      const p = ctx.pos();
      if (!open || !p || !Number.isFinite(p.i) || drag) return;
      if (want) { if (p.i === want.i || Date.now() > want.until) want = null; else return; }
      if (p.i !== sel) select(p.i, false);
    },
    reset: () => { undo = null; sel = 0; info = new Map(); lastDoc = null; const f = frame(); if (f) f.remove(); if (open) render(); },
    saved: () => { if (undo) { undo = null; if (open) render(); } },
    state: () => ({ open, sel, busy, undo: undo ? { label: undo.label, files: undo.files.map((x) => x.rel) } : null, rows: [...ul.querySelectorAll('[role=option]')].map((o) => ({ key: o.dataset.key, label: o.getAttribute('aria-label'), selected: o.getAttribute('aria-selected') === 'true' })) }),
  };
}
