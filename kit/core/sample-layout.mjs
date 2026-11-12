// はじめの画面のサンプルの、区分の中の並び（app/examples-gallery.js と tools/examples-sync.mjs が同じものを使う。Node にもブラウザにも依存しない）
// 小見出しのある区分（groups）で、サンプルが minLessons 以上なら小見出しの順。小見出しの中は教科（subjects）の順、それから一覧の順。
// 決まりは egatari.org の src/gallery/lessons.json の grouping と同じ（作者 11/12、handoff/samples-gallery-plan.md の最後の節）
//   sectionLayout({sections, subjects, grouping, examples}, sectionId) → [{group: {id, title} | null, names: [名前 …]}]
//     examples：[{name, section, group?, subject?}]（一覧の順）。小見出しなしは group: null の 1 つ
export function sectionLayout({ sections, subjects = [], grouping = {}, examples }, sectionId) {
  const sec = sections.find((x) => x.id === sectionId);
  const xs = examples.filter((e) => e.section === sectionId);
  const min = grouping && grouping.minLessons ? grouping.minLessons : Infinity;
  if (!sec || !sec.groups || xs.length < min) return [{ group: null, names: xs.map((e) => e.name) }];
  const subj = (e) => { const i = subjects.indexOf(e.subject); return i < 0 ? Infinity : i; };
  return sec.groups.map((g) => ({ group: g, names: xs.map((e, i) => [e, i]).filter(([e]) => e.group === g.id).sort((a, b) => subj(a[0]) - subj(b[0]) || a[1] - b[1]).map(([e]) => e.name) }))
    .filter((x) => x.names.length);
}
