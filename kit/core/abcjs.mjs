export const ABCJS_OPTIONS = Object.freeze({ add_classes: true, staffwidth: 1100, foregroundColor: 'currentColor' });
// Port of components/tools/score-fixtures.mjs (abcjs 6.7.2; ABCJS-ADAPTER.md).
// Self-contained so the CLI can send this function to a browser page.
export function renderScore({ abc, options, markup }, ABCJS = globalThis.ABCJS, document = globalThis.document) {
  const scoreSource = (src) => src.replace(/^T:.*(?:\r?\n|$)/gm, '').replace(/^%%printtempo.*(?:\r?\n|$)/gm, '').replace(/^(Q:|K:)/gm, '%%printtempo false\n$1');
  if (options.add_classes !== true) throw new Error('abcjs requires add_classes: true');
  const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  const d = document.createElement('div'); document.body.appendChild(d);
  try {
    const tune = ABCJS.renderAbc(d, scoreSource(abc), options)[0];
    tune.setUpAudio();   // fills midiPitches (the sounding pitch, after the key signature and accidentals)
    const tq = tune.metaText.tempo, tempo = tq ? tq.bpm * tq.duration.reduce((a, x) => a + x, 0) * 4 : 120;
    const r3 = (x) => Math.round(x * 1e3) / 1e3;
    const notes = [];
    let beat = 0, trip = 1;
    const name = (e, q, i) => {
      // letter and octave from abcjs's diatonic step (0 = C4), accidental from the sounding MIDI pitch
      const p = e.pitches[q], oct = Math.floor(p.pitch / 7) + 4, li = ((p.pitch % 7) + 7) % 7;
      const nat = 12 * (oct + 1) + NAT[li];
      let mid = e.midiPitches && e.midiPitches[q] ? e.midiPitches[q].pitch : null;
      if (mid === null) {   // a tied continuation has no midiPitches: the same sounding pitch as the note the tie comes from
        for (let j = i - 1; j >= 0 && mid === null; j--) { const k = notes[j].steps.indexOf(p.pitch); if (k >= 0) mid = notes[j].midi[k]; }
        if (mid === null) mid = nat;
      }
      const acc = mid - nat;
      return { s: LET[li] + (acc === 1 ? '#' : acc === -1 ? 'b' : acc === 2 ? '##' : acc === -2 ? 'bb' : '') + oct, midi: mid };
    };
    tune.lines.forEach((L) => (L.staff || []).slice(0, 1).forEach((S) => S.voices.slice(0, 1).forEach((V) => V.forEach((e) => {
      if (e.el_type === 'bar') {
        // a bar line closes the measure it ends: data-measure from abcjs's abcjs-mm class on it (the part reads no class)
        const bg = e.abselem && e.abselem.elemset && e.abselem.elemset[0], bm = bg && /\babcjs-mm(\d+)\b/.exec(bg.getAttribute('class') || '');
        if (bm) bg.setAttribute('data-measure', bm[1]);
        beat = 0; return;
      }
      if (e.el_type !== 'note') return;
      if (e.startTriplet) trip = e.tripletMultiplier || 1;
      const g = e.abselem.elemset[0], c = g.getAttribute('class');
      const cv = (k) => +(new RegExp('\\babcjs-' + k + '(\\d+)\\b').exec(c) || [])[1];
      const dur = e.duration * 4 * trip;
      const heads = [...g.querySelectorAll('.abcjs-notehead')];
      const bx = (heads.length ? heads : [g]).map((h) => h.getBBox());
      const x0 = Math.min(...bx.map((q) => q.x)), y0 = Math.min(...bx.map((q) => q.y)), x1 = Math.max(...bx.map((q) => q.x + q.width)), y1 = Math.max(...bx.map((q) => q.y + q.height));
      const i = notes.length;
      const ps = e.rest ? [] : e.pitches.map((_, q) => name(e, q, i));
      e._idx = i;
      g.setAttribute('data-note', String(i));   // the note's or rest's <g>: the part finds it by this, never by abcjs-v / -mm / -n
      notes.push({ out: { cls: 'abcjs-v' + cv('v') + ' abcjs-mm' + cv('mm') + ' abcjs-n' + cv('n'), measure: cv('mm'), pitch: ps.map((x) => x.s), beat: r3(beat), dur: r3(dur), box: [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v * 100) / 100) },
        steps: e.rest ? [] : e.pitches.map((p) => p.pitch), midi: ps.map((x) => x.midi), e });
      beat += dur;
      if (e.endTriplet) trip = 1;
    }))));
    // beams: abcjs draws one path per beam group, in voice.beams order (the k-th abcjs-beam-elem path is beams[k])
    const beams = [];
    tune.lines.forEach((L) => { if (!L.staffGroup) return; L.staffGroup.voices.slice(0, 1).forEach((V) => (V.beams || []).forEach((b) => {
      if (b === 'bar' || !b.elems) return;
      const ix = b.elems.map((a) => a.abcelem && a.abcelem._idx).filter((x) => x !== undefined);
      if (ix.length) beams.push(ix);
    })); });
    // data-beam: the k-th abcjs-beam-elem path in document order is beams[k] (drawBeam draws one path per group, in voice.beams order)
    const beamEls = [...d.querySelectorAll('.abcjs-beam-elem')];
    if (beamEls.length !== beams.length) throw new Error(`${beamEls.length} beam paths but ${beams.length} beam groups`);
    beamEls.forEach((el, k) => el.setAttribute('data-beam', String(k)));
    // arcs from the parsed notes: a tie per pitch (startTie on pitch q of note i, ended by the next note whose pitch with the
    // same diatonic step has endTie, as abcjs matches them), a slur per startSlur / endSlur label (on the note or a pitch)
    const arcs = [], openTie = [], openSlur = {};
    const lab = (x) => (typeof x === 'object' && x !== null ? x.label : x);
    notes.forEach((n, i) => {
      const e = n.e;
      if (e.rest) return;
      e.pitches.forEach((p, q) => {
        if (p.endTie) {
          const k = openTie.findIndex((t) => t.step === p.pitch);
          const t = k >= 0 ? openTie.splice(k, 1)[0] : openTie.shift();
          if (t) arcs.push({ kind: 'tie', from: t.from, to: i, pitch: n.out.pitch[q] });
        }
        if (p.startTie) openTie.push({ from: i, step: p.pitch });
      });
      const ends = [].concat(e.endSlur || [], ...e.pitches.map((p) => p.endSlur || []));
      const starts = [].concat(e.startSlur || [], ...e.pitches.map((p) => p.startSlur || []));
      ends.forEach((x) => { const a = openSlur[lab(x)]; if (a !== undefined) { arcs.push({ kind: 'slur', from: a, to: i }); delete openSlur[lab(x)]; } });
      starts.forEach((x) => { openSlur[lab(x)] = i; });
    });
    arcs.sort((a, b) => a.from - b.from || a.to - b.to || (a.kind === b.kind ? 0 : a.kind === 'tie' ? -1 : 1) || String(a.pitch).localeCompare(String(b.pitch)));
    arcs.forEach((a, k) => { a.n = k; });
    // tag every drawn arc piece with data-arc. abcjs keeps each drawn arc as a TieElem in the voice's otherchildren, with its
    // path in elemset; anchor1 / anchor2 are the noteheads at its ends. A TieElem does not say whether it is a tie or a slur,
    // and a piece cut by a line break has only one anchor (abcjs recreates the open arcs at each new line). So: a piece with
    // both anchors matches the one arc between those notes (a tie also by pitch); a piece with one anchor can match a tie and a
    // slur at the same note, and then abcjs's creation order decides (ABCJS-ADAPTER.md): on the line where they start, the
    // lowest pitch's tie comes before the slur; at the start of the next line, recreated slurs come before ties.
    const headInfo = (h) => { const e = h.parent.abcelem, i = e._idx; const q = h.parent.heads ? h.parent.heads.indexOf(h) : -1; return { i, pitch: i !== undefined && q >= 0 ? notes[i].out.pitch[q] : null }; };
    const pieces = [];
    tune.lines.forEach((L) => { if (!L.staffGroup) return; L.staffGroup.voices.slice(0, 1).forEach((V) => (V.otherchildren || []).forEach((te) => {
      if (!te || te.type !== 'TieElem' || !te.elemset || !te.elemset[0]) return;
      pieces.push({ el: te.elemset[0], a1: te.anchor1 ? headInfo(te.anchor1) : null, a2: te.anchor2 ? headInfo(te.anchor2) : null });
    })); });
    const problems = [], used = new Set();
    pieces.forEach((p) => {
      const side = p.a1 && p.a2 ? 'ab' : p.a1 ? 'a' : 'b';
      let cand = arcs.filter((a) => !used.has(a.n + side)
        && (!p.a1 || (a.from === p.a1.i && (a.kind === 'slur' || a.pitch === p.a1.pitch)))
        && (!p.a2 || (a.to === p.a2.i && (a.kind === 'slur' || a.pitch === p.a2.pitch))));
      if (cand.length > 1 && side !== 'ab') cand = cand.filter((a) => a.kind === (side === 'a' ? 'tie' : 'slur'));
      if (cand.length !== 1) { problems.push(`${p.el.getAttribute('class')}: ${cand.length} arcs match`); return; }
      used.add(cand[0].n + side);
      p.el.setAttribute('data-arc', String(cand[0].n));
    });
    // drop a piece drawn on exactly the same path as an earlier one (the slur leaving a tied chord at a line break shares the
    // lowest pitch's tie path): it cannot be seen, and the part must not have to know about it
    const seen = new Set(); let dropped = 0;
    pieces.forEach((p) => { const k = p.el.getAttribute('d'); if (seen.has(k)) { p.el.remove(); dropped++; } else seen.add(k); });
    // All rendered output follows the vendored spec, including attribute values and CSS.
    const svg = d.querySelector('svg'), norm = { removed: {} };
    if (!svg) throw new Error('abcjs produced no SVG');
    const count = (k) => { norm.removed[k] = (norm.removed[k] || 0) + 1; };
    const length = new RegExp(markup.values.length);
    const decl = (p, v) => {
      const sh = markup.style.shorthands[p];
      if (markup.style.lengths.includes(p) && length.test(v)) return true;
      if ((markup.style.keywords[p] || []).includes(v)) return true;
      const xs = v.split(/\s+/);
      return !!sh && xs.length <= sh.max && xs.every((x) => length.test(x) || (sh.keywords || []).includes(x));
    };
    const clean = (el) => {
      const tag = el.localName;
      // The slide supplies text. Remove abcjs's title, lyrics, tempo and annotations.
      if (el.namespaceURI !== 'http://www.w3.org/2000/svg' || !Object.hasOwn(markup.elements.svg, tag) || ['title', 'text', 'tspan'].includes(tag)) {
        count('<' + tag + '>'); el.remove(); return;
      }
      for (const a of [...el.attributes]) {
        const n = a.name, v = a.value;
        if (n === 'xmlns' && v === el.namespaceURI) continue;
        const listed = [...markup.global.svg, ...markup.elements.svg[tag]];
        let yes = listed.includes(n);
        if (n.startsWith('data-')) yes = listed.includes('data-*') && new RegExp(markup.values['data-*'].name).test(n) && new RegExp(markup.values['data-*'].value).test(v);
        if (n === 'data-name' || n === 'data-index') yes = false;
        if (n === 'id') yes = yes && new RegExp(markup.values.id).test(v);
        if (Array.isArray(markup.values[n])) yes = yes && markup.values[n].includes(v);
        if (n === 'style' && yes) {
          for (const prop of [...el.style]) if (el.style.getPropertyPriority(prop) || !decl(prop, el.style.getPropertyValue(prop).trim())) el.style.removeProperty(prop);
          if (!el.style.length) el.removeAttribute(n);
        } else if (!yes) { count(tag + '@' + n); el.removeAttribute(n); }
      }
      [...el.children].forEach(clean);
    };
    clean(svg);
    if (problems.length) throw new Error(problems.join('; '));
    return { norm, Svg: svg.outerHTML, Map: { tempo, notes: notes.map((n) => n.out), beams, arcs }, dropped, pieces: pieces.length };
  } finally { d.remove(); }
}
