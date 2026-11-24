// Egatari Viewer: exporting a learner's notes, highlights and handwriting, and reading an exchange file back (handoff #107,
// annotations.md "Exchange file"). Pure functions: the page gathers the record and the handwriting and saves the result.
//   exchangeOf({record, docId, fileSha256, ink}) → the object of a .ega-notes.json file
//   readExchange(json, {docId, fileSha256}) → {ok: true, highlights, notes, ink, madeOn} | {ok: false, why: 'format' | 'other'}
//   mergeById(have, add) → have with add merged: an id on both sides keeps the later `modified`; new ids are added
//   markdownOf({title, record, slides: [{key, name}], sections: {id: title}, words}) → the text of a .md file
//   fileName(title, kind, date) → 「（題名）のメモ（2026-11-25）.md」 or 「…のメモのバックアップ（…）.ega-notes.json」
import { cleanTarget, cleanNote, MAXN } from './markup.mjs';

export const EXCHANGE = 'egatari-notes';   // the exchange file's own name inside it (format), with its version
export const EXCHANGE_VERSION = 1;
const COLORS = ['y', 'p', 'b'];
const MAXH = 2000;
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
const isTime = (v) => isStr(v, 40) && !Number.isNaN(Date.parse(v));

export function exchangeOf({ record, docId, fileSha256, ink }) {
  return {
    format: EXCHANGE, version: EXCHANGE_VERSION,
    docId: docId || '',
    madeOn: { ...(record.madeOn && record.madeOn.sourceSha256 ? { sourceSha256: record.madeOn.sourceSha256 } : {}), fileSha256: fileSha256 || (record.madeOn && record.madeOn.fileSha256) || '' },
    highlights: record.highlights || [],
    notes: record.notes || [],
    ink: ink || [],
  };
}

function cleanHighlight(h) {
  if (!h || typeof h !== 'object' || !isStr(h.id, 40) || !/^h-[0-9a-f]{1,32}$/.test(h.id) || !COLORS.includes(h.color)) return null;
  const t = cleanTarget(h.target);
  if (!t || !isTime(h.created) || !isTime(h.modified)) return null;
  return { id: h.id, color: h.color, target: t, created: h.created, modified: h.modified };
}

// Untrusted: a file the learner chose. It must be for the file that is open: the same docId, or (a file without one) the same
// SHA-256 of the file's bytes. Every highlight and note is checked as the page checks its own (play/markup.mjs).
export function readExchange(j, { docId, fileSha256 }) {
  if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.highlights) || !Array.isArray(j.notes)) return { ok: false, why: 'format' };
  if (j.format != null && j.format !== EXCHANGE) return { ok: false, why: 'format' };
  const jd = isStr(j.docId, 200) ? j.docId : '', js = j.madeOn && isStr(j.madeOn.fileSha256, 64) ? j.madeOn.fileSha256 : '';
  const same = docId ? jd === docId : !jd && !!fileSha256 && js === fileSha256;
  if (!same) return { ok: false, why: 'other' };
  return {
    ok: true,
    madeOn: j.madeOn && typeof j.madeOn === 'object' ? { ...(isStr(j.madeOn.sourceSha256, 64) && j.madeOn.sourceSha256 ? { sourceSha256: j.madeOn.sourceSha256 } : {}), fileSha256: js } : {},
    highlights: j.highlights.slice(0, MAXH).map(cleanHighlight).filter(Boolean),
    notes: j.notes.slice(0, MAXN).map(cleanNote).filter(Boolean),
    ink: Array.isArray(j.ink) ? j.ink : [],
  };
}

export function mergeById(have, add, max) {
  const out = have.slice(), at = new Map(out.map((x, i) => [x.id, i]));
  let added = 0, changed = 0;
  for (const x of add) {
    if (at.has(x.id)) { const i = at.get(x.id); if (Date.parse(x.modified) > Date.parse(out[i].modified)) { out[i] = x; changed++; } }
    else if (out.length < max) { at.set(x.id, out.length); out.push(x); added++; }
  }
  return { list: out, added, changed };
}
// notes: at most one per place. The same id: the later `modified` wins. Another note for a place that already has one: its blocks
// that are not there yet are added to the end of the note kept here (nothing is lost)
export function mergeNotes(have, add) {
  const list = have.map((n) => ({ ...n, blocks: n.blocks.slice() }));
  let added = 0, changed = 0;
  const atKey = (n) => JSON.stringify(n.at);
  for (const n of add) {
    const same = list.findIndex((x) => x.id === n.id);
    if (same >= 0) { if (Date.parse(n.modified) > Date.parse(list[same].modified)) { list[same] = n; changed++; } continue; }
    const there = list.find((x) => atKey(x) === atKey(n));
    if (there) {
      const seen = new Set(there.blocks.map((b) => JSON.stringify(b)));
      const extra = n.blocks.filter((b) => !seen.has(JSON.stringify(b)));
      if (extra.length) { there.blocks = there.blocks.concat(extra); if (n.modified > there.modified) there.modified = n.modified; changed++; }
      continue;
    }
    if (list.length < MAXN) { list.push(n); added++; }
  }
  return { list, added, changed };
}

// ---------------------------------------------------------------- Markdown: the notes in the lesson's order, with the quotes as > lines
const mdLine = (t) => t.replace(/\r\n?/g, '\n');
const quoteLines = (t) => t.replace(/\s+/g, ' ').trim().replace(/^/, '> ');
export function markdownOf({ title, record, slides, sections, words: w, inkSlides = [] }) {
  const out = [`# ${w.mdTitle(title)}`, ''];
  const notes = record.notes || [], HL = record.highlights || [];
  const placeOf = (at) => (at.slide != null ? (slides.find((s) => s.key === at.slide) || {}).name || w.mdLost : at.section === '' ? w.mdNoSection : sections[at.section] || w.mdLost);
  const order = [...slides.map((s) => 's:' + s.key), ...Object.keys(sections).map((k) => 'b:' + k), 'b:'];
  const key = (at) => (at.slide != null ? 's:' + at.slide : 'b:' + at.section);
  const rank = (at) => { const i = order.indexOf(key(at)); return i < 0 ? order.length : i; };
  const placesWithHl = new Map();
  for (const h of HL) { const k = key(h.target); if (!placesWithHl.has(k)) placesWithHl.set(k, { at: h.target.slide != null ? { slide: h.target.slide } : { section: h.target.section }, list: [] }); placesWithHl.get(k).list.push(h); }
  const places = new Map();
  for (const n of notes) places.set(key(n.at), n.at);
  for (const [k, v] of placesWithHl) if (!places.has(k)) places.set(k, v.at);
  const sorted = [...places.values()].sort((a, b) => rank(a) - rank(b));
  if (!sorted.length) out.push(w.mdEmpty, '');
  for (const at of sorted) {
    out.push(`## ${placeOf(at)}`, '');
    const n = notes.find((x) => key(x.at) === key(at));
    if (n) {
      for (const b of n.blocks) {
        if (b.text != null) out.push(mdLine(b.text), '');
        else out.push(quoteLines(b.quote.exact), '');
      }
    }
    const hs = (placesWithHl.get(key(at)) || { list: [] }).list.filter((h) => !(n && n.blocks.some((b) => b.quote && b.quote.highlight === h.id)));
    if (hs.length) { out.push(`${w.mdHighlights}:`, ''); for (const h of hs) out.push(`- ${w.mdColour[h.color]}：${h.target.quote.exact.replace(/\s+/g, ' ').trim()}`); out.push(''); }
    if (at.slide != null && inkSlides.includes(at.slide)) out.push(`*${w.mdInk}*`, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// a file name from the lesson's title: no characters that a file system refuses, at most 80 characters of the title
export function fileName(title, kind, date, w) {
  const t = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Egatari';
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;   // the device's own date
  return kind === 'exchange' ? w.fileExchange(t, d) + '.ega-notes.json' : kind === 'md' ? w.fileNotes(t, d) + '.md' : w.fileNotes(t, d) + '.pdf';
}
