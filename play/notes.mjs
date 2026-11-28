// Egatari Viewer: the editor of one note (handoff #107, textbook-reader-memo §3.2B). A note belongs to a slide or to a section of the
// book; its blocks are typed text and quotes (play/markup.mjs keeps and checks them). This only shows one note and reports edits:
//   - each text block is a <textarea> that grows with its text; a quote is a card with the quoted words, ↗ (to the place it came
//     from) and 削除 (the highlight stays). Quoted words cannot be edited: they are what the lesson said.
//   - edits are saved by the caller 0.5 s after typing stops, when the focus leaves the note, and when it is closed (flush).
//   - the words are the page's own (never in the lesson's frame).
//
//   const E = noteEditor({root, words, onSave(at, blocks), onGo(quote), onEscape()})
//   E.show(at, blocks, label)   E.addQuote(block)   E.flush()   E.setReadOnly(on)   E.at   E.clear()
const SAVE_MS = 500;

export function noteEditor({ root, words, onSave, onGo = () => {}, onEscape = () => {}, placeholder = () => words().nPlaceholder }) {
  const box = document.createElement('div'); box.className = 'n-blocks';
  root.appendChild(box);
  let at = null, label = '', timer = 0, ro = false;

  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  function textBlock(text) {
    const t = mk('textarea', 'n-text'); t.value = text; t.rows = 1; t.readOnly = ro;
    t.setAttribute('aria-label', label);
    t.placeholder = box.querySelector('textarea') ? '' : placeholder();
    t.addEventListener('input', () => { grow(t); later(); });
    t.addEventListener('blur', flush);
    t.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); flush(); t.blur(); onEscape(); } });
    return t;
  }
  function quoteBlock(q) {
    const f = mk('figure', 'n-quote'); f._quote = q;
    const bq = mk('blockquote', null, q.exact); f.appendChild(bq);
    const row = mk('div', 'n-qrow');
    const go = mk('button', 'n-go', '↗'); go.type = 'button'; go.setAttribute('aria-label', words().nGo); go.title = words().nGo;
    go.addEventListener('click', () => onGo(q));
    const del = mk('button', 'n-qdel', words().nQuoteDelete); del.type = 'button'; del.setAttribute('aria-label', words().nQuoteDeleteLabel(q.exact.slice(0, 40)));
    del.addEventListener('click', () => removeQuote(f));
    row.append(go, del); f.appendChild(row);
    return f;
  }
  function render(blocks) {
    box.replaceChildren();
    const list = blocks.length ? blocks : [{ text: '' }];
    for (const b of list) box.appendChild(b.quote ? quoteBlock(b.quote) : textBlock(b.text));
    // a quote at the end gets an empty line after it, to write in
    if (!box.lastElementChild || box.lastElementChild.tagName !== 'TEXTAREA') box.appendChild(textBlock(''));
    requestAnimationFrame(() => box.querySelectorAll('textarea').forEach(grow));
  }
  function blocksNow() {
    const out = [];
    for (const el of box.children) {
      if (el.tagName === 'TEXTAREA') { const prev = out[out.length - 1]; if (prev && prev.text != null) prev.text += (prev.text && el.value ? '\n' : '') + el.value; else out.push({ text: el.value }); }
      else if (el._quote) out.push({ quote: el._quote });
    }
    // empty lines around quotes are the editor's, not the learner's
    return out.filter((b) => b.quote || b.text.trim());
  }
  function later() { clearTimeout(timer); timer = setTimeout(flush, SAVE_MS); }
  function flush() { clearTimeout(timer); timer = 0; if (at) onSave(at, blocksNow()); }
  function removeQuote(f) {
    const prev = f.previousElementSibling, next = f.nextElementSibling;
    f.remove();
    // two text blocks that the quote kept apart become one
    if (prev && next && prev.tagName === 'TEXTAREA' && next.tagName === 'TEXTAREA') {
      prev.value = prev.value + (prev.value && next.value ? '\n' : '') + next.value; next.remove(); grow(prev);
    }
    flush();
    const t = (prev && prev.tagName === 'TEXTAREA' && prev) || box.querySelector('textarea');
    if (t) t.focus();
  }
  return {
    get at() { return at; },
    show(a, blocks, l) { if (at) flush(); at = a; label = l; render(blocks); },
    clear() { if (at) flush(); at = null; box.replaceChildren(); },
    flush,
    focus() { const t = box.querySelector('textarea:last-of-type') || box.querySelector('textarea'); if (t && !ro) t.focus(); },
    // a quote goes after the last block (an empty last line gives way to it), with an empty line after it to write in, focused
    addQuote(block) {
      const last = box.lastElementChild;
      if (last && last.tagName === 'TEXTAREA' && !last.value.trim()) last.remove();
      box.appendChild(quoteBlock(block.quote));
      const t = textBlock(''); box.appendChild(t);
      flush();
      if (!ro) t.focus({ preventScroll: true });
      t.scrollIntoView({ block: 'nearest' });
    },
    setReadOnly(on) { ro = on; box.querySelectorAll('textarea').forEach((t) => { t.readOnly = on; }); },
    relabel() { box.querySelectorAll('textarea').forEach((t) => t.setAttribute('aria-label', label)); },
  };
}
