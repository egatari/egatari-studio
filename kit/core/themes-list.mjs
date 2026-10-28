// 同梱のテーマのうち、新しく選べるもの（#129）：画面に出す順・見せる名前（和色の名前）・小さく添える「向き」。
// 編集アプリ（新規作成のテーマの段・「テーマを変更…」）と npm run new が使う。名前（value）は themes/<名前>/ と <html data-theme>。
// RETIRED：同梱のまま（版を記録した教材・data-theme に書いた教材は前の見た目で組める）だが、新しくは選べないもの
export const CHOOSABLE = Object.freeze([
  { name: 'default', label: { ja: '藍', en: 'Indigo' }, note: { ja: '研究・講義向け', en: 'For research and classes' } },
  { name: 'sumi', label: { ja: '墨', en: 'Ink' }, note: { ja: '報告・提案向け', en: 'For reports and proposals' } },
  { name: 'kokugo', label: { ja: '国語', en: 'Kokugo' }, note: { ja: '国語・和の題材向け', en: 'For Japanese language arts' } },
  { name: 'tokiwa', label: { ja: '常盤', en: 'Evergreen' }, note: { ja: '理科・自然・学校向け', en: 'For science, nature and schools' } },
  { name: 'murasaki', label: { ja: '江戸紫', en: 'Edo purple' }, note: { ja: '研究・一般の講演向け', en: 'For research and public talks' } },
  { name: 'kogecha', label: { ja: '焦茶', en: 'Dark brown' }, note: { ja: '人文・歴史・地域向け', en: 'For humanities, history and local studies' } },
  { name: 'asagi', label: { ja: '浅葱', en: 'Teal' }, note: { ja: '小学校・広報・案内向け', en: 'For primary schools, publicity and guides' } },
].map((t) => Object.freeze(t)));
export const RETIRED = Object.freeze(['business']);
// 選べなくしたテーマの見せる名前（その教材を開いたときの「テーマを変更…」の今のテーマ）
export const RETIRED_LABEL = Object.freeze({ business: { ja: 'ビジネス', en: 'Business' } });
export const RETIRED_NOTE = Object.freeze({ ja: '新しくは選べない', en: 'No longer offered for new lessons' });
// 同梱のテーマの名前の並び（have：同梱のテーマの名前）→ 選べるものを画面の順に。同梱にあって一覧にないもの（RETIRED を除く）は後ろに名前の順
export function choosableOf(have) {
  const set = new Set(have);
  return [...CHOOSABLE.filter((t) => set.has(t.name)).map((t) => t.name), ...[...set].filter((n) => !CHOOSABLE.some((t) => t.name === n) && !RETIRED.includes(n)).sort()];
}
export const themeLabel = (name, lang) => { const t = CHOOSABLE.find((x) => x.name === name); const l = lang === 'en' ? 'en' : 'ja'; return t ? t.label[l] : RETIRED_LABEL[name] ? RETIRED_LABEL[name][l] : name; };
export const themeNote = (name, lang) => { const t = CHOOSABLE.find((x) => x.name === name); const l = lang === 'en' ? 'en' : 'ja'; return t ? t.note[l] : RETIRED.includes(name) ? RETIRED_NOTE[l] : ''; };
