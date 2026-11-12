// はじめの画面の「サンプル」：入口のカードと、入口の中のサンプルの札（handoff/samples-gallery-plan.md §1.1・§1.2、作者 11/7）。
// 区分（section）は examples/index.json（egatari.org の src/gallery/lessons.json と同じ id。tools/examples-sync.mjs が照らす）。
//   いちばん上の列「まず見る」：intro の区分（Egatari の紹介を画面の言語のものから、もう一方の言語には言語の印）と「パーツ図鑑」の札（再生だけ。パーツの一覧へも）
//   その下：教育・ビジネス・生活の入口のカード。押すと、その区分のサンプルの札を並べる（「戻る」で入口へ）
//   札：表紙の静止画・題名・場面・印（本・声・ライブ・縦書き・言語）・伝えたいこと・使っているパーツ（押すと、そのパーツを使うサンプルに絞る）・「見る」
// 一覧の項目（tools/examples-portable.mjs の buildExamples）：{name, file, title, lang, sample, book, section, scene, parts, purposes, voice, live, tate, cover}
import { partLabel } from '../kit/core/part-labels.mjs';

const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
};
const shortScene = (s) => s.replace(/\s*[（(][^）)]*[）)]\s*$/, '');   // 「案内（ごみの出し方…）」→「案内」
const PARTS_SAMPLE = 'parts-showcase';
const PURPOSES_MAX = 3, PARTS_MAX = 3;

export function createExamplesGallery({ root, list, sections, T, lang, coverHref, partsHref, onView }) {
  const L = lang === 'en' ? 'en' : 'ja';
  const S = { view: { kind: 'top' }, back: [] };
  const ofSection = (id) => list.filter((x) => x.section === id);
  const badges = (x) => [
    x.book ? [T.exampleBook, T.exampleBookTitle] : null,
    x.voice ? [T.exampleVoice, T.exampleVoiceTitle] : null,
    x.live ? [T.exampleLive, T.exampleLiveTitle] : null,
    x.tate ? [T.exampleTate, T.exampleTateTitle] : null,
    x.lang && x.lang.slice(0, 2) !== L ? [T.exampleLang(x.lang.slice(0, 2)), T.exampleLangTitle(x.lang.slice(0, 2))] : null,
  ].filter(Boolean).map(([t, title]) => el('span', { cls: 'attach-badge ex-badge', text: t, title }));
  const cover = (x) => (x.cover ? el('img', { cls: 'ex-cover', src: coverHref(x.cover), alt: '', loading: 'lazy', width: 192, height: 108 }) : el('span', { cls: 'ex-cover ex-cover-none', 'aria-hidden': 'true' }));
  const viewBtn = (x) => el('button', { type: 'button', cls: 'ex-view', text: T.exampleView, 'aria-label': `${T.exampleView}: ${x.title}`, onclick: () => onView(x) });

  function tile(x) {
    const scene = x.scene && x.scene[L] ? shortScene(x.scene[L]) : '';
    const purposes = (x.purposes || []).slice(0, PURPOSES_MAX);
    const parts = (x.parts || []).slice(0, PARTS_MAX);
    const more = (x.parts || []).length - parts.length;
    return el('li', { cls: 'ex-tile', 'data-example': x.name }, [
      cover(x),
      el('span', { cls: 'nm', text: x.title, ...(x.lang ? { lang: x.lang } : {}) }),
      scene ? el('span', { cls: 'ex-scene', text: scene }) : null,
      el('span', { cls: 'ex-badges' }, badges(x)),
      // 伝えたいことは 1 行の文（3 つまで）。押せる札はパーツだけ（そのパーツのサンプルに絞る）
      purposes.length ? el('span', { cls: 'ex-purposes', text: T.examplePurposesLine(purposes.map((p) => p.label[L])) }) : null,
      parts.length ? el('span', { cls: 'ex-tags ex-parts', 'aria-label': T.exampleParts }, [
        ...parts.map((t) => el('button', { type: 'button', cls: 'ex-tag ex-part', 'data-part': t, text: partLabel(t, L), title: T.examplePartTitle(partLabel(t, L)), onclick: () => go({ kind: 'part', tag: t }) })),
        more > 0 ? el('span', { cls: 'ex-more', text: T.exampleMore(more) }) : null]) : null,
      viewBtn(x),
    ]);
  }
  function partsCard(x) {
    return el('li', { cls: 'ex-tile ex-parts-card', 'data-example': x.name }, [
      cover(x),
      el('span', { cls: 'nm', text: x.title, ...(x.lang ? { lang: x.lang } : {}) }),
      el('span', { cls: 'ex-scene', text: T.examplePartsCardLead }),
      el('span', { cls: 'ex-actions' }, [viewBtn(x), el('a', { cls: 'ex-parts-link', href: partsHref, target: '_blank', rel: 'noopener', text: T.allParts })]),
    ]);
  }
  const heading = (text, id) => el('h3', { cls: 'ex-h', id, tabindex: '-1', text });
  const backBtn = () => el('button', { type: 'button', cls: 'ghost small ex-back', text: T.exampleBack, onclick: () => back() });

  function render(focus) {
    root.innerHTML = '';
    const v = S.view;
    if (v.kind === 'top') {
      const intro = sections.find((s) => s.id === 'intro');
      if (intro) {
        // 画面の言語の紹介を先に、もう一方の言語は後ろに（言語の印が付く）。パーツ図鑑は列の最後
        const xs = ofSection('intro').filter((x) => x.name !== PARTS_SAMPLE).sort((a, b) => (a.lang.slice(0, 2) === L ? 0 : 1) - (b.lang.slice(0, 2) === L ? 0 : 1));
        const ps = list.find((x) => x.name === PARTS_SAMPLE);
        root.append(el('section', { cls: 'ex-row', 'aria-labelledby': 'ex-h-intro' }, [heading(intro.title[L], 'ex-h-intro'),
          el('ul', { cls: 'ex-tiles', id: 'examples-list' }, [...xs.map(tile), ps ? partsCard(ps) : null])]));
      }
      const doors = sections.filter((s) => s.id !== 'intro' && ofSection(s.id).length);
      root.append(el('ul', { cls: 'ex-doors', 'aria-label': T.exampleDoors }, doors.map((s) => el('li', {}, [
        el('button', { type: 'button', cls: 'ex-door', 'data-section': s.id, onclick: () => go({ kind: 'section', id: s.id }) }, [
          el('span', { cls: 'ex-door-t', text: s.title[L] }),
          s.subtitle[L] ? el('span', { cls: 'ex-door-s', text: s.subtitle[L] }) : null,
          el('span', { cls: 'ex-door-n', text: T.exampleCount(ofSection(s.id).length) })])]))));
    } else if (v.kind === 'section') {
      const s = sections.find((x) => x.id === v.id);
      root.append(el('div', { cls: 'ex-bar' }, [backBtn(), heading(s.title[L], 'ex-h-now')]),
        s.subtitle[L] ? el('p', { cls: 'hint ex-sub', text: s.subtitle[L] }) : '',
        el('ul', { cls: 'ex-tiles', id: 'examples-list' }, ofSection(v.id).map(tile)));
    } else if (v.kind === 'part') {
      const xs = list.filter((x) => x.name !== PARTS_SAMPLE && (x.parts || []).includes(v.tag));
      root.append(el('div', { cls: 'ex-bar' }, [backBtn(), heading(T.examplePartHeading(partLabel(v.tag, L)), 'ex-h-now')]),
        el('ul', { cls: 'ex-tiles', id: 'examples-list' }, xs.map(tile)));
    }
    if (focus) { const h = root.querySelector(focus); if (h) h.focus(); }
  }
  function go(view) { S.back.push(S.view); S.view = view; render('#ex-h-now'); }
  function back() {
    const prev = S.view;
    S.view = S.back.pop() || { kind: 'top' };
    render(S.view.kind === 'top' ? (prev.kind === 'section' ? `.ex-door[data-section="${prev.id}"]` : '.ex-door') : '#ex-h-now');
  }
  render();
  return { render, go, back, get view() { return S.view; } };
}
