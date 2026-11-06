// 台本の欄（口述原稿の引き出しの 1 つの発言）：読み {x|y} を語の上の小さな読み（ルビ）で見せる、その場で書き換えられる 1 行の欄（backlog #101）
// server/editor-ui.js が使う（開発サーバーと編集アプリ）。設計は handoff/pronounce-design-2026-11-04.md
// - 値はいつも原稿の文字列（{x|y} のまま）。DOM から組み直す：<ruby class="dv-rb" data-x data-y> → {x|y}、ほかの字はそのまま
// - 読みのかたまりは contenteditable=false（カーソルは飛び越え、Backspace・Delete はかたまりごと消す）
// - 元に戻すは欄が自分で持つ（⌘/Ctrl+Z・⌘/Ctrl+Shift+Z・Ctrl+Y・beforeinput の historyUndo/historyRedo）。打った字は 0.8 秒ごとにまとめる
// - コピー・切り取りは原稿の文字列（{x|y}）を text/plain に。貼り付けは文字だけ（改行は詰める）、{x|y} はルビにする
// - Enter は何もしない（発言は 1 行。日本語入力の確定は妨げない：beforeinput の insertParagraph / insertLineBreak だけを止める）
//   const f = createScriptField(doc, {value, label, placeholder, lang, onInput(value), onKeydown(e), onReading(info)})
//   f.el（要素。el.value でも読み書きできる）・f.value・f.set(value, caret?)・f.selection() → {start, end, text, atom?} | null（原稿の文字列の位置）
//   f.replace(start, end, text, caretAt?)（1 つの元に戻す単位）・f.undo()・f.redo()・f.select(start, end)
import { splitReadings } from '../kit/core/readings.mjs';

const ZW = /​/g;
export function createScriptField(doc, o = {}) {
  const el = doc.createElement('div');
  el.className = 'dv-text';
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-multiline', 'false');
  el.setAttribute('spellcheck', 'false');
  if (o.label) el.setAttribute('aria-label', o.label);
  if (o.placeholder) el.setAttribute('data-ph', o.placeholder);
  if (o.lang) el.setAttribute('lang', o.lang);
  let value = '';
  // 履歴：[{v, c}]（c は原稿の文字列でのカーソルの位置）。at が今
  let hist = [], at = -1, lastTyping = 0;

  function atom(x, y) {
    const r = doc.createElement('ruby');
    r.className = 'dv-rb';
    r.setAttribute('contenteditable', 'false');
    r.dataset.x = x; r.dataset.y = y;
    r.appendChild(doc.createTextNode(x));
    const rt = doc.createElement('rt'); rt.textContent = y; r.appendChild(rt);
    return r;
  }
  const srcLen = (r) => r.dataset.x.length + r.dataset.y.length + 3;
  function render(v) {
    el.textContent = '';
    for (const p of splitReadings(v)) el.appendChild(p.text !== undefined ? doc.createTextNode(p.text) : atom(p.x, p.y));
    // 最後が読みのかたまりなら、その後ろにカーソルを置ける所を作る（字にはならない）
    if (el.lastChild && el.lastChild.nodeType === 1) el.appendChild(doc.createElement('br'));
    el.classList.toggle('dv-empty', !v);
  }
  // DOM → 原稿の文字列
  function serial(node) {
    let s = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) s += n.data.replace(ZW, '').replace(/[\r\n]+/g, '');
      else if (n.nodeType === 1) {
        if (n.classList && n.classList.contains('dv-rb') && n.dataset.x) s += '{' + n.dataset.x + '|' + n.dataset.y + '}';
        else if (n.tagName === 'RT' || n.tagName === 'BR') continue;
        else s += serial(n);
      }
    }
    return s;
  }
  // 原稿の文字列の位置 ↔ DOM の位置
  function offsetOf(node, off) {
    let n = 0, done = false;
    (function walk(p) {
      for (const c of p.childNodes) {
        if (done) return;
        if (c === node) { if (c.nodeType === 3) n += c.data.slice(0, off).replace(ZW, '').length; else { for (let i = 0; i < off && i < c.childNodes.length; i++) n += lenOf(c.childNodes[i]); } done = true; return; }
        if (c.nodeType === 1 && c.contains(node)) { if (c.classList.contains('dv-rb')) { n += srcLen(c); done = true; return; } walk(c); if (done) return; continue; }
        n += lenOf(c);
      }
    })(el);
    if (!done && node === el) { n = 0; for (let i = 0; i < off && i < el.childNodes.length; i++) n += lenOf(el.childNodes[i]); }
    return n;
  }
  function lenOf(c) {
    if (c.nodeType === 3) return c.data.replace(ZW, '').replace(/[\r\n]+/g, '').length;
    if (c.nodeType !== 1 || c.tagName === 'BR' || c.tagName === 'RT') return 0;
    if (c.classList.contains('dv-rb')) return srcLen(c);
    let n = 0; for (const k of c.childNodes) n += lenOf(k); return n;
  }
  function pointAt(n) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i], l = lenOf(c);
      if (c.nodeType === 3 && n <= l) return [c, n];
      if (c.nodeType === 1 && c.classList.contains('dv-rb') && n < l) return [el, n === 0 ? i : i + 1];
      n -= l;
    }
    return [el, Math.max(0, el.childNodes.length - (el.lastChild && el.lastChild.tagName === 'BR' ? 1 : 0))];
  }
  function select(start, end = start) {
    const sel = doc.defaultView.getSelection();
    if (!sel) return;
    const r = doc.createRange();
    const [a, ao] = pointAt(start), [b, bo] = pointAt(end);
    r.setStart(a, ao); r.setEnd(b, bo);
    sel.removeAllRanges(); sel.addRange(r);
  }
  function caret() { const s = selection(); return s ? s.end : value.length; }
  // 選んでいる所（この欄の中だけ）。読みのかたまり 1 つだけ（か、そこにカーソル）なら atom
  function selection() {
    const sel = doc.defaultView.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    let start = offsetOf(r.startContainer, r.startOffset), end = offsetOf(r.endContainer, r.endOffset);
    if (end < start) [start, end] = [end, start];
    return { start, end, text: value.slice(start, end) };
  }
  function push(c, coalesce) {
    const now = Date.now();
    if (coalesce && at > 0 && now - lastTyping < 800 && hist[at].typing) { hist[at] = { v: value, c, typing: true }; lastTyping = now; return; }
    hist = hist.slice(0, at + 1); hist.push({ v: value, c, typing: !!coalesce }); at = hist.length - 1;
    if (hist.length > 200) { hist.shift(); at--; }
    lastTyping = coalesce ? now : 0;
  }
  function changed() { el.classList.toggle('dv-empty', !value); if (o.onInput) o.onInput(value); }
  function set(v, c = null, record = true) {
    value = String(v ?? '');
    render(value);
    if (record) push(c ?? value.length, false);
    if (c !== null && doc.activeElement === el) select(c);
  }
  function replace(start, end, text, caretAt = null) {
    const v = value.slice(0, start) + text + value.slice(end);
    set(v, caretAt ?? start + text.length);
    changed();
  }
  function go(d) {
    const j = at + d;
    if (j < 0 || j >= hist.length) return false;
    at = j; lastTyping = 0;
    value = hist[at].v; render(value);
    el.focus(); select(Math.min(hist[at].c, value.length));
    changed();
    return true;
  }

  el.addEventListener('beforeinput', (e) => {
    const t = e.inputType || '';
    if (t === 'historyUndo') { e.preventDefault(); go(-1); return; }
    if (t === 'historyRedo') { e.preventDefault(); go(1); return; }
    if (t === 'insertParagraph' || t === 'insertLineBreak' || t.startsWith('format')) { e.preventDefault(); return; }
    if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertReplacementText' && e.dataTransfer) {
      const d = e.dataTransfer && e.dataTransfer.getData('text/plain');
      if (typeof d === 'string') { e.preventDefault(); const s = selection() || { start: value.length, end: value.length }; replace(s.start, s.end, d.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join('')); }
    }
  });
  el.addEventListener('input', (e) => {
    value = serial(el);
    // 打った後の DOM に残った余計な要素（ブラウザが入れる span・br）は、値が同じなら触らない（日本語入力を壊さない）
    push(caret(), /^insert(Text|CompositionText|FromComposition)$|^delete/.test(e.inputType || ''));
    changed();
  });
  el.addEventListener('paste', (e) => {
    const d = e.clipboardData && e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (typeof d !== 'string') return;
    const s = selection() || { start: value.length, end: value.length };
    replace(s.start, s.end, d.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(''));
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
  });
  const copy = (cut) => (e) => {
    const s = selection();
    if (!s || s.start === s.end || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', s.text);
    if (cut) replace(s.start, s.end, '');
  };
  el.addEventListener('copy', copy(false));
  el.addEventListener('cut', copy(true));
  el.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); go(e.shiftKey ? 1 : -1); }
    else if (e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); go(1); }
    else if (e.key === 'Enter' && !mod && !e.isComposing && e.keyCode !== 229) e.preventDefault();
    if (o.onKeydown) o.onKeydown(e);
  });
  // 読みのかたまりを押した：その読みを直す（読み方の欄を開く）
  el.addEventListener('click', (e) => {
    const r = e.target && e.target.closest && e.target.closest('.dv-rb');
    if (!r || !el.contains(r)) return;
    const i = [...el.childNodes].indexOf(r);
    let start = 0; for (let j = 0; j < i; j++) start += lenOf(el.childNodes[j]);
    const range = doc.createRange(); range.selectNode(r);
    const sel = doc.defaultView.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    if (o.onReading) o.onReading({ start, end: start + srcLen(r), x: r.dataset.x, y: r.dataset.y });
  });
  Object.defineProperty(el, 'value', { get: () => value, set: (v) => { set(v, null, true); changed(); } });
  set(o.value || '', null, true);
  return {
    el, set, replace, select, selection, undo: () => go(-1), redo: () => go(1),
    get value() { return value; },
    // 原稿の位置 start..end を含む読みのかたまり（{x|y}）
    atomAt(start, end) {
      let n = 0;
      for (const p of splitReadings(value)) {
        const l = p.text !== undefined ? p.text.length : p.x.length + p.y.length + 3;
        if (p.text === undefined && start >= n && end <= n + l && (start < n + l || start === end)) return { start: n, end: n + l, x: p.x, y: p.y };
        n += l;
      }
      return null;
    },
    // start..end が読みのかたまりにかかっているか
    touchesAtom(start, end) {
      let n = 0;
      for (const p of splitReadings(value)) {
        const l = p.text !== undefined ? p.text.length : p.x.length + p.y.length + 3;
        if (p.text === undefined && start < n + l && end > n) return true;
        n += l;
      }
      return false;
    },
  };
}
