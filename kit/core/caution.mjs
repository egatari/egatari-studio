// Caution boxes: source-only checks shared by the CLI and editor, and idempotent build markup.
import { parse } from 'parse5';

const hasClass = (n, c) => (n.attrs || []).some((a) => a.name === 'class' && a.value.split(/\s+/).includes(c));
const textOf = (n) => n.nodeName === '#text' ? n.value : ['script', 'style', 'rt'].includes(n.tagName) ? '' : (n.childNodes || []).map(textOf).join('');
const labelStart = /^\s*(?:注意|警告|Caution\b|Warning\b)\s*[：:]?\s*/i;
const stateOf = (n) => {
  const label = (n.childNodes || []).find((c) => c.tagName && hasClass(c, 'caution-label'));
  const text = (n.childNodes || []).filter((c) => c !== label).map(textOf).join('').trim();
  return { labelled: !!label, authored: labelStart.test(text), empty: !text.replace(labelStart, '').trim() };
};
function walk(n, visit, slide = null, counter = { n: 0 }) {
  if (n.tagName === 'section' && hasClass(n, 'slide')) slide = counter.n++;
  if (n.tagName && hasClass(n, 'caution')) visit(n, slide);
  // Templates and scripts contain examples, not rendered boxes.
  for (const c of n.childNodes || []) walk(c, visit, slide, counter);
}

export function cautionFindings(src) {
  const out = [];
  walk(parse(String(src)), (n, i) => {
    if (i === null) return;
    const s = stateOf(n);
    if (s.empty) out.push({ i, sev: 'error', code: 'cautionEmpty', a: {} });
    if (s.authored) out.push({ i, sev: 'warn', code: 'cautionLabel', a: {} });
  });
  return out;
}

export function insertCautionLabels(src) {
  const doc = parse(src, { sourceCodeLocationInfo: true }), edits = [];
  const html = doc.childNodes.find((n) => n.tagName === 'html');
  const en = /^en\b/i.test((html?.attrs || []).find((a) => a.name === 'lang')?.value || '');
  walk(doc, (n) => {
    const loc = n.sourceCodeLocation;
    if (!loc?.startTag) return;
    const s = stateOf(n);
    if (!s.labelled && !s.authored) {
      const label = hasClass(n, 'warn') ? (en ? 'Warning' : '警告') : (en ? 'Caution' : '注意');
      edits.push({ start: loc.startTag.endOffset, end: loc.startTag.endOffset, text: `<span class="caution-label">${label}</span>` });
    }
    const role = loc.attrs?.role;
    edits.push(role ? { start: role.startOffset, end: role.endOffset, text: 'role="note"' }
      : { start: loc.startTag.endOffset - 1, end: loc.startTag.endOffset - 1, text: ' role="note"' });
  });
  // Preserve the author's bytes, as with the other build annotations.
  for (const e of edits.sort((a, b) => b.start - a.start)) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  return src;
}
