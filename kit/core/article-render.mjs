// 本文の実行時の形（format spec §9C.6）：番号を振り（§9C.1A）、木（kit/core/article.mjs の readArticle）から HTML を書く。
// 原稿の HTML は通さない（表も木から書く）。script・イベントの属性・埋め込みの要素は書かない。リンクは http(s)・mailto と # だけ。
// 引用（§9C.4）は opts.csl（citeproc と同梱の書式）があれば CSL で組み、文献の一覧を書く（kit/core/article-cite.mjs）。なければ鍵の字のまま。
// 編集アプリと共有する（node: の読み込み・fs を使わない。KaTeX と画像は opts で渡す）。
import { visit, plain } from './article-text.mjs';
import { parseStep } from './article.mjs';
import { renderCitations } from './article-cite.mjs';

// 言語ごとの言葉（§9C.6）。日本語のほかは英語
const WORDS = {
  ja: {
    figure: '図', table: '表', aside: 'コラム', exercise: '問', equation: '式', section: (n) => `${n} 節`,
    chapter: (n) => `第 ${n} 章`, appendix: (l) => `付録 ${l}`, proof: '証明', solution: (x) => `${x} の解答`, eq: (n) => `式 (${n})`,
    step: (title, k) => `スライド「${title}」${k === '0' ? '' : k === 'concl' ? 'の結論' : `のステップ ${k}`}`,
    kinds: { theorem: '定理', lemma: '補題', proposition: '命題', corollary: '系', definition: '定義', example: '例', remark: '注意', proof: '証明', axiom: '公理', assumption: '仮定', conjecture: '予想', criterion: '規準', property: '性質', observation: '観察', algorithm: 'アルゴリズム' },
    paren: (t) => `（${t}）`, sp: ' ', notes: '注', back: '本文へ戻る',
  },
  en: {
    figure: 'Figure', table: 'Table', aside: 'Box', exercise: 'Exercise', equation: 'Equation', section: (n) => `Section ${n}`,
    chapter: (n) => `Chapter ${n}`, appendix: (l) => `Appendix ${l}`, proof: 'Proof', solution: (x) => `Solution to ${x}`, eq: (n) => `Equation (${n})`,
    step: (title, k) => `slide “${title}”${k === '0' ? '' : k === 'concl' ? ', conclusion' : `, step ${k}`}`,
    kinds: { theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition', example: 'Example', remark: 'Remark', proof: 'Proof', axiom: 'Axiom', assumption: 'Assumption', conjecture: 'Conjecture', criterion: 'Criterion', property: 'Property', observation: 'Observation', algorithm: 'Algorithm' },
    paren: (t) => ` (${t})`, sp: ' ', notes: 'Notes', back: 'Back to text',
  },
};
export const isJa = (lang) => /^ja\b/i.test(lang || '');
const wordsOf = (lang) => (isJa(lang) ? WORDS.ja : WORDS.en);

// ---------------------------------------------------------------- 番号（§9C.1A）
// 返すもの：{targets: Map(小文字の名前 → {kind, num, text, title, file}), files: [{prefix, chapterAttr, numbered, fnPrefix, header}], terms: Map(term → id)}
//   prefix：章の番号か付録の記号（なければ ''）。番号は prefix.n か n。chapterAttr：章の印（data-egatari-chapter・脚注の id）
export function numberArticle(article, lang) {
  const W = wordsOf(lang);
  const targets = new Map(), terms = new Map(), files = [];
  const book = !!(article.index && article.index.chapters);
  let termN = 0;
  const kindN = {};
  article.files.forEach((f) => {
    const prefix = f.kind === 'chapter' && f.chapter ? String(f.chapter) : f.kind === 'appendix' ? f.letter || '' : '';
    // 前書き・後書きは節の番号なし（§9C.1A）。numbering: false も節の番号だけを切る
    const numbered = f.fm.numbering !== false && f.kind !== 'preface' && f.kind !== 'afterword';
    const pre = (n) => (prefix ? `${prefix}.${n}` : String(n));
    const counters = new Map();
    const next = (k) => { const n = (counters.get(k) || 0) + 1; counters.set(k, n); return pre(n); };
    const sec = [0, 0, 0];
    // 章の印（§9C.6）：章の番号・付録の記号、前書き・後書きは preface<i>・afterword<i>（i はその種類の中で 1 から）。章ごとの id と属性はすべてこれを使う
    kindN[f.kind] = (kindN[f.kind] || 0) + 1;
    const token = prefix || `${f.kind}${kindN[f.kind]}`;
    const fileInfo = { prefix, numbered, kind: f.kind, chapterAttr: token, fnPrefix: book ? token : '', nodes: new Map() };
    files.push(fileInfo);
    const set = (n, info) => { fileInfo.nodes.set(n, info); if (n.label) targets.set(String(n.label).toLowerCase(), { ...info, file: f.path }); };
    visit(f.tree, (n, parents) => {
      if (n.type === 'heading' && n.depth >= 2 && n.depth <= 4) {
        const d = n.depth - 2;
        sec[d]++; for (let j = d + 1; j < 3; j++) sec[j] = 0;
        const num = numbered ? (prefix ? [prefix, ...sec.slice(0, d + 1)] : sec.slice(0, d + 1)).join('.') : null;
        set(n, { kind: 'section', num, text: num ? W.section(num) : plain(n), title: plain(n) });
      } else if (n.type === 'container' && n.kind === 'figure' && !n.subcontainer) {
        const num = next('figure');   // 名前がなくても番号を付ける（mystmd と同じ。§9C.1A）
        set(n, { kind: 'figure', num, text: num ? `${W.figure}${W.sp}${num}` : null });
        let sub = 0;
        for (const c of n.children || []) if (c.type === 'container' && c.subcontainer) {
          const letter = `(${String.fromCharCode(97 + sub++)})`;
          set(c, { kind: 'subfigure', num: letter, text: num ? `${W.figure}${W.sp}${num}${letter}` : letter });
        }
      } else if (n.type === 'container' && n.kind === 'table') {
        const num = next('table');   // 名前がなくても番号を付ける（mystmd と同じ。§9C.1A）
        set(n, { kind: 'table', num, text: num ? `${W.table}${W.sp}${num}` : null });
      } else if (n.type === 'aside') {
        const num = next('aside');   // 名前がなくても番号を付ける（mystmd と同じ。§9C.1A）
        set(n, { kind: 'aside', num, text: num ? `${W.aside}${W.sp}${num}` : null, title: titleOf(n) });
      } else if (n.type === 'exercise') {
        const num = n.enumerated === false ? null : next('exercise');
        set(n, { kind: 'exercise', num, text: num ? `${W.exercise}${W.sp}${num}` : W.exercise, title: titleOf(n) });
      } else if (n.type === 'proof') {
        const word = W.kinds[n.kind] || n.kind;
        const num = n.kind === 'proof' ? null : next('proof:' + n.kind);
        set(n, { kind: 'proof', proofKind: n.kind, num, text: num ? `${word}${W.sp}${num}` : word, title: titleOf(n) });
      } else if (n.type === 'math' && n.label) {
        const num = next('equation');
        set(n, { kind: 'equation', num, text: W.eq(num) });
      } else if (n.type === 'solution') {
        set(n, { kind: 'solution', num: null, text: null });
      } else if (n.type === 'glossary') {
        visit(n, (d) => { if (d.type === 'definitionTerm') { const term = plain(d).trim(); if (!terms.has(term)) terms.set(term, `term-${++termN}`); } });
      }
      void parents;
    });
    // 章の見出し（§9C.6）
    const title = f.fm.title || (book ? '' : article.title || '');
    const head = f.kind === 'chapter' && f.chapter ? W.chapter(f.chapter) : f.kind === 'appendix' && f.letter ? W.appendix(f.letter) : '';
    fileInfo.header = { head, title, subtitle: f.fm.subtitle || '' };
  });
  return { targets, files, terms };
}
const titleOf = (n) => (n.children && n.children[0] && n.children[0].type === 'admonitionTitle' ? plain(n.children[0]).trim() : '');

// ---------------------------------------------------------------- HTML
// opts：lang（metadata.lang）・title（metadata.title。本の題）・katex（renderToString を持つもの）・macros・image(url) → src か null・
//       slides（Map：スライドの鍵 → {title}）・
//       references（references.json の項目の配列）・csl（kit/core/article-cite.mjs の renderCitations の csl）・citations（{style, list}：citationSettings の結果）。
//       返すもの：{html, warnings, problems（引用を組むときの知らせ）, citeproc（citeproc で引用を組んだか。CITEPROC_CREDIT を出す）}
export function renderArticle(article, opts = {}) {
  const lang = opts.lang || article.lang || '';
  const W = wordsOf(lang);
  const nums = numberArticle({ ...article, title: opts.title }, lang);
  const warnings = [];
  const cit = opts.citations || {};
  const C = opts.csl && Array.isArray(opts.references) ? renderCitations(article, opts.references, { csl: opts.csl, lang, style: cit.style, list: cit.list, tokens: nums.files.map((x) => x.chapterAttr) }) : null;
  const vertical = article.writingMode === 'vertical-rl';
  const cjk = /^(ja|zh)\b/i.test(lang);
  const book = !!(article.index && article.index.chapters);
  const out = [];
  out.push(`<article id="egatari-article" lang="${esc(lang)}"${vertical ? ' class="egatari-vertical"' : ''}>`);
  if (book) out.push(`<header><p class="egatari-book-title">${esc(opts.title || '')}</p></header>`);
  article.files.forEach((f, fi) => {
    const info = nums.files[fi];
    const r = fileRenderer(f, info);
    if (book) out.push(`<section data-egatari-chapter="${esc(info.chapterAttr || '')}" data-egatari-kind="${esc(f.kind)}">`);
    const h = info.header;
    if (h.head || h.title) out.push(`<header><h1>${h.head ? `<span class="egatari-num">${r.text(h.head)}</span>${h.title ? ' ' : ''}` : ''}${r.text(h.title)}</h1>${h.subtitle ? `<p class="egatari-subtitle">${r.text(h.subtitle)}</p>` : ''}</header>`);
    out.push(r.body());
    if (C && C.chapters.has(fi)) out.push(C.chapters.get(fi));
    if (book) out.push('</section>');
  });
  if (C && C.end) out.push(C.end);
  out.push('</article>');
  return { html: out.join('\n'), warnings, problems: C ? C.problems : [], citeproc: !!(C && C.citeproc) };

  function fileRenderer(f, info) {
    const fnNum = new Map();   // 脚注の名前 → 番号（最初に参照した順。§9C.6）
    const fnDefs = new Map();
    visit(f.tree, (n) => { if (n.type === 'footnoteDefinition') fnDefs.set(n.identifier || n.label, n); });
    visit(f.tree, (n) => { if (n.type === 'footnoteReference') { const k = n.identifier || n.label; if (!fnNum.has(k) && fnDefs.has(k)) fnNum.set(k, fnNum.size + 1); } });
    const fnId = (n) => (info.fnPrefix ? `fn-${info.fnPrefix}-${n}` : `fn-${n}`);
    const fnSeen = new Set();
    let pendingNotes = [];
    const children = f.tree.children || [];
    const exerciseBefore = new Set();
    children.forEach((c, i) => { if (c.type === 'solution' && i > 0 && children[i - 1].type === 'exercise') exerciseBefore.add(c); });

    const text = (s) => (vertical ? tcy(String(s)) : esc(String(s)));
    // 書式で組んだ引用の HTML：縦書きでは字の中の 1〜2 桁の数（(1)・(1, p. 12) の番号）を縦中横に。タグと文字参照には触れない
    const citeHtml = (h) => (vertical ? String(h).replace(/(<[^>]*>|&[#A-Za-z0-9]+;)|(?<![0-9])([0-9]{1,2})(?![0-9])/g, (m, keep, d) => (keep ? keep : `<span class="egatari-tcy">${d}</span>`)) : h);
    const inline = (ns) => (ns || []).map(node).join('');
    const block = (ns) => (ns || []).map(node).filter((x) => x !== '').join('\n');
    const num = (n) => info.nodes.get(n) || {};
    const math = (tex, display) => {
      if (!opts.katex) return `<code class="egatari-tex">${esc(tex)}</code>`;
      try { return opts.katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml', macros: { ...(opts.macros || {}) }, trust: false }); }
      catch (e) { warnings.push(`${f.path}: KaTeX: ${String(e.message).split('\n')[0]} in: ${tex.slice(0, 60)}`); return `<span class="katex-error">${esc(tex)}</span>`; }
    };
    const img = (n) => {
      const src = opts.image ? opts.image(String(n.url || '')) : null;
      if (!src) { warnings.push(`${f.path}: image ${n.url} not found`); return `<span class="egatari-missing-image">${esc(n.alt || n.url || '')}</span>`; }
      return `<img src="${esc(src)}" alt="${esc(n.alt || '')}">`;
    };
    const captionOf = (n, t) => (n.children || []).filter((c) => c.type === t);
    const notesHtml = () => {
      if (!pendingNotes.length) return '';
      const start = pendingNotes[0].n;
      const items = pendingNotes.map(({ n, def }) => {
        const body = (def.children || []).map((p, j, a) => (p.type === 'paragraph' ? inline(p.children) + (j < a.length - 1 ? '<br>' : '') : '')).join('');
        // 縦書きでは番号を字で書く（リストの印は横に寝て、縦中横にできない。§9C.6 の組み立てが書く番号と同じく 1〜2 桁を縦中横に）
        const no = vertical ? `<span class="egatari-fn-no">${text(String(n))}</span>` : '';
        return `<li id="${fnId(n)}">${no}${body} <a class="egatari-fn-back" href="#${fnId(n)}-ref" aria-label="${esc(W.back)}">↩</a></li>`;
      });
      pendingNotes = [];
      return `<ol class="egatari-footnotes${vertical ? ' egatari-fn-numbered' : ''}"${start > 1 ? ` start="${start}"` : ''}>${items.join('')}</ol>`;
    };
    function node(n) {
      switch (n.type) {
        case 'text': return text(n.value);
        case 'break': return '<br>';
        case 'emphasis': return `<em>${inline(n.children)}</em>`;
        case 'strong': return `<strong>${inline(n.children)}</strong>`;
        case 'inlineCode': return `<code>${esc(n.value)}</code>`;
        case 'subscript': return `<sub>${inline(n.children)}</sub>`;
        case 'superscript': return `<sup>${inline(n.children)}</sup>`;
        case 'paragraph': return `<p>${inline(n.children)}</p>`;
        case 'heading': {
          const x = num(n);
          const id = n.label ? ` id="${esc(n.label)}"` : '';
          return `<h${n.depth}${n.depth === 2 ? '' : id}>${x.num ? `<span class="egatari-num">${text(x.num)}</span> ` : ''}${inline(n.children)}</h${n.depth}>`;
        }
        case 'blockquote': return `<blockquote>${block(n.children)}</blockquote>`;
        case 'thematicBreak': return '<hr>';
        case 'list': {
          const tag = n.ordered ? 'ol' : 'ul';
          const start = n.ordered && Number.isInteger(n.start) && n.start !== 1 ? ` start="${n.start}"` : '';
          return `<${tag}${start}>${(n.children || []).map((li) => `<li>${n.spread ? block(li.children) : (li.children || []).map((c) => (c.type === 'paragraph' ? inline(c.children) : node(c))).join('\n')}</li>`).join('')}</${tag}>`;
        }
        case 'code': return `<pre><code${n.lang ? ` class="language-${esc(String(n.lang).replace(/[^\w+-]/g, ''))}"` : ''}>${esc(n.value)}</code></pre>`;
        case 'link': {
          const url = String(n.url || '');
          if (url.startsWith('#')) {
            const t = nums.targets.get(url.slice(1).toLowerCase());
            const kids = n.children && n.children.length ? inline(n.children) : text(t ? t.text || t.title || url.slice(1) : url.slice(1));
            return `<a href="${esc(url)}" class="egatari-xref">${kids}</a>`;
          }
          if (/^(https?:|mailto:)/i.test(url)) return `<a href="${esc(url)}"${n.title ? ` title="${esc(n.title)}"` : ''}>${inline(n.children)}</a>`;
          return `<span>${inline(n.children)}</span>`;   // 外の scheme（javascript: など）は字だけ
        }
        case 'image': return img(n);
        case 'inlineMath': return math(n.value, false);
        case 'math': {
          const x = num(n);
          return `<div class="egatari-math"${n.label ? ` id="${esc(n.label)}"` : ''}>${math(n.value, true)}${x.num ? `<span class="egatari-eqno">(${text(x.num)})</span>` : ''}</div>`;
        }
        case 'container': return container(n);
        case 'table': return table(n);
        case 'aside': {
          const x = num(n);
          const cls = ['egatari-aside', ...String(n.class || '').split(/\s+/).filter(Boolean).map((c) => `egatari-aside-${c}`)].join(' ');
          const [t, ...body] = n.children || [];
          const title = t && t.type === 'admonitionTitle' ? inline(t.children) : '';
          return `<aside class="${esc(cls)}"${n.label ? ` id="${esc(n.label)}"` : ''}><p class="egatari-aside-title">${x.text ? `<span class="egatari-num">${text(x.text)}</span> ` : ''}${title}</p>\n${block(t && t.type === 'admonitionTitle' ? body : n.children)}</aside>`;
        }
        case 'proof': {
          const x = num(n);
          const [t, ...rest] = n.children || [];
          const hasT = t && t.type === 'admonitionTitle';
          const body = hasT ? rest : n.children || [];
          const head = `<p class="egatari-proof-head"><strong>${text(x.text || '')}</strong>${hasT ? W.paren(inline(t.children)) : ''}</p>`;
          let html = block(body);
          if (n.kind === 'proof') {
            const qed = '<span class="egatari-qed">∎</span>';
            html = /<\/p>$/.test(html) ? html.replace(/<\/p>$/, `${qed}</p>`) : html + `\n<p class="egatari-qed-line">${qed}</p>`;
          }
          return `<div class="egatari-proof" data-kind="${esc(n.kind)}"${n.label ? ` id="${esc(n.label)}"` : ''}>${head}\n${html}</div>`;
        }
        case 'exercise': {
          const x = num(n);
          const [t, ...rest] = n.children || [];
          const hasT = t && t.type === 'admonitionTitle';
          return `<div class="egatari-exercise"${n.label ? ` id="${esc(n.label)}"` : ''}><p class="egatari-exercise-head"><strong>${text(x.text || W.exercise)}</strong>${hasT ? ' ' + inline(t.children) : ''}</p>\n${block(hasT ? rest : n.children)}</div>`;
        }
        case 'solution': {
          const [t, ...rest] = n.children || [];
          const ref = t && t.type === 'admonitionTitle' ? (t.children || []).find((c) => c.type === 'crossReference') : null;
          const label = ref ? String(ref.label || ref.identifier) : '';
          const target = nums.targets.get(label.toLowerCase());
          const name = target && target.text ? target.text : label;
          const head = `<p class="egatari-solution-head"><strong>${W.solution(`<a href="#${esc(label)}" class="egatari-xref">${text(name)}</a>`)}</strong></p>`;
          return `<div class="egatari-solution"${n.label ? ` id="${esc(n.label)}"` : ''}${exerciseBefore.has(n) ? ' data-egatari-after-exercise=""' : ''}>${head}\n${block(t && t.type === 'admonitionTitle' ? rest : n.children)}</div>`;
        }
        case 'footnoteReference': {
          const k = n.identifier || n.label, m = fnNum.get(k);
          if (!m) return '';
          const first = !fnSeen.has(k);
          if (first) { fnSeen.add(k); pendingNotes.push({ n: m, def: fnDefs.get(k) }); }
          return `<sup><a class="egatari-fn" href="#${fnId(m)}"${first ? ` id="${fnId(m)}-ref"` : ''}>${m}</a></sup>`;
        }
        case 'footnoteDefinition': return '';
        case 'definitionList': return `<dl>${(n.children || []).map((d) => (d.type === 'definitionTerm' ? `<dt>${inline(d.children)}</dt>` : `<dd>${(d.children || []).some((c) => c.type === 'paragraph') ? block(d.children) : inline(d.children)}</dd>`)).join('')}</dl>`;
        case 'glossary': {
          const dl = (n.children || [])[0] || { children: [] };
          return `<dl class="egatari-glossary">${(dl.children || []).map((d) => (d.type === 'definitionTerm' ? `<dt id="${esc(nums.terms.get(plain(d).trim()) || '')}">${inline(d.children)}</dt>` : `<dd>${(d.children || []).some((c) => c.type === 'paragraph') ? block(d.children) : inline(d.children)}</dd>`)).join('')}</dl>`;
        }
        case 'crossReference': {
          if (String(n.identifier || '').startsWith('term-')) {
            const id = nums.terms.get(String(n.label || '').trim());
            const kids = n.children && n.children.length ? inline(n.children) : text(n.label || '');
            return id ? `<a href="#${esc(id)}" class="egatari-term">${kids}</a>` : kids;
          }
          return inline(n.children);
        }
        case 'citeGroup': return `<span class="egatari-cite-group">${C && C.groups.has(n) ? citeHtml(C.groups.get(n)) : `(${(n.children || []).map(node).join('; ')})`}</span>`;
        case 'cite': if (C && C.narratives.has(n)) return citeHtml(C.narratives.get(n));
          return `<span class="egatari-cite" data-egatari-cite="${esc(n.label || n.identifier)}">${esc(n.label || n.identifier)}${n.suffix ? `, ${text(n.suffix)}` : ''}</span>`;
        case 'mystRole': {
          if (n.name === 'ruby') {
            const v = String(n.value || ''), k = v.indexOf('|');
            const [o, c] = cjk ? ['（', '）'] : ['(', ')'];
            return `<ruby>${esc(v.slice(0, k))}<rp>${o}</rp><rt>${esc(v.slice(k + 1))}</rt><rp>${c}</rp></ruby>`;
          }
          if (n.name === 'step') {
            const s = parseStep(n.value);
            if (!s) return esc(n.value);
            const key = `${s.slideKey}:${s.stepKey}`;
            const sl = opts.slides && opts.slides.get(s.slideKey);
            const label = s.text != null ? s.text : W.step(sl && sl.title ? sl.title : s.slideKey, s.stepKey);
            return `<a data-egatari-step="${esc(key)}" href="#${esc(key)}">${text(label)}</a>`;
          }
          return esc(n.value || '');
        }
        case 'admonitionTitle': return inline(n.children);
        case 'caption': case 'legend': return block(n.children);
        default:
          warnings.push(`${f.path}: ${n.type} is not written into the article`);
          return '';
      }
    }
    function container(n) {
      const x = num(n);
      const caption = captionOf(n, 'caption')[0], legend = captionOf(n, 'legend')[0];
      const capInline = caption ? (caption.children || []).map((p) => (p.type === 'paragraph' ? inline(p.children) : node(p))).join(' ') : '';
      const numSpan = x.text ? `<span class="egatari-num">${text(x.text)}</span>${capInline ? ' ' : ''}` : '';
      const legendHtml = legend ? `<div class="egatari-legend">${block(legend.children)}</div>` : '';
      const id = n.label ? ` id="${esc(n.label)}"` : '';
      if (n.kind === 'table') {
        const t = (n.children || []).find((c) => c.type === 'table');
        return `<figure class="egatari-table"${id}>${caption || x.text ? `<figcaption>${numSpan}${capInline}</figcaption>` : ''}\n${t ? table(t) : ''}${legendHtml}</figure>`;
      }
      if (n.subcontainer) {
        const im = (n.children || []).find((c) => c.type === 'image');
        return `<figure class="egatari-subfigure"${id}>${im ? img(im) : ''}<figcaption><span class="egatari-num">${text(x.num || '')}</span>${capInline ? ' ' + capInline : ''}</figcaption></figure>`;
      }
      const parts = (n.children || []).filter((c) => c.type === 'image' || (c.type === 'container' && c.subcontainer)).map((c) => (c.type === 'image' ? img(c) : container(c)));
      return `<figure class="egatari-figure"${id}>${parts.join('\n')}${caption || x.text ? `<figcaption>${numSpan}${capInline}</figcaption>` : ''}${legendHtml}</figure>`;
    }
    // 表は木から書く（§9C.6）：頭の th だけの行を thead に、ほかを tbody に
    function table(t) {
      const rows = t.children || [];
      let h = 0;
      while (h < rows.length && (rows[h].children || []).length && rows[h].children.every((c) => c.header)) h++;
      if (h === rows.length) h = Math.min(1, rows.length);
      const cell = (c) => {
        const tag = c.header ? 'th' : 'td';
        const a = [];
        if (Number.isInteger(c.colspan) && c.colspan > 1) a.push(`colspan="${c.colspan}"`);
        if (Number.isInteger(c.rowspan) && c.rowspan > 1) a.push(`rowspan="${c.rowspan}"`);
        if (['left', 'center', 'right'].includes(c.align)) a.push(`class="egatari-align-${c.align}"`);
        return `<${tag}${a.length ? ' ' + a.join(' ') : ''}>${inline(c.children)}</${tag}>`;
      };
      const tr = (r) => `<tr>${(r.children || []).map(cell).join('')}</tr>`;
      return `<table>${h ? `<thead>${rows.slice(0, h).map(tr).join('')}</thead>` : ''}<tbody>${rows.slice(h).map(tr).join('')}</tbody></table>`;
    }
    // 節（§9C.6）：最初の h2 の前はそのまま、h2 ごとに <section>。脚注はその節の終わりに
    function body() {
      const parts = [];
      let open = false;
      for (const c of children) {
        if (c.type === 'heading' && c.depth === 2) {
          const notes = notesHtml();
          if (notes) parts.push(notes);
          if (open) parts.push('</section>');
          const id = c.label ? esc(c.label) : '';
          parts.push(`<section${id ? ` id="${id}" data-section-id="${id}"` : ''}>`);
          open = true;
        }
        const h = node(c);
        if (h) parts.push(h);
      }
      const notes = notesHtml();
      if (notes) parts.push(notes);
      if (open) parts.push('</section>');
      return parts.join('\n');
    }
    return { text, body };
  }
}

// 縦書きの縦中横（§9C.6）。
// 数は ASCII の英字・数字と . , : / % の続きを 1 つとして取り、数字 1〜2 字だけのものを縦中横にする（第3章・10月。3.14・2026・12:30・A4 は横に寝かせる）
// 縦書きの数字（§9C.6）：本文の字も、組み立てが書く番号（見出し・図表の題・相互参照・式の番号）も、英数字の続きが 1〜2 字の数字だけなら縦中横
function tcy(s) { return String(s).split(/([A-Za-z0-9.,:/%]+)/).map((part, i) => (i % 2 && /^[0-9]{1,2}$/.test(part) ? `<span class="egatari-tcy">${part}</span>` : esc(part))).join(''); }
export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// 本文の見た目（静かな既定。テーマの変数があればそれを使う）。§9C.6：日本語の強調は傍点、縦書きの図・表・式は横組み、表の見出しの行は刷るときに繰り返す
export const ARTICLE_CSS = `#egatari-article{max-width:42em;margin:0 auto;padding:1.5em 1em;line-height:1.8;color:var(--fg,CanvasText);font-size:18px}
#egatari-article .egatari-num{font-weight:bold}
#egatari-article h1{font-size:1.6em;line-height:1.4}#egatari-article h2{font-size:1.3em;margin-top:2em}#egatari-article h3{font-size:1.1em}#egatari-article h4{font-size:1em}
#egatari-article .egatari-book-title{font-size:1.1em;color:var(--muted,GrayText)}#egatari-article .egatari-subtitle{color:var(--muted,GrayText);margin-top:-.5em}
#egatari-article figure{margin:1.2em 0;text-align:center}#egatari-article figure img{max-width:100%;height:auto}
#egatari-article figcaption{font-size:.9em;margin-top:.4em}#egatari-article .egatari-legend{font-size:.85em;color:var(--muted,GrayText);text-align:left}
#egatari-article .egatari-subfigure{display:inline-block;vertical-align:top;margin:0 .5em;max-width:45%}
#egatari-article table{border-collapse:collapse;margin:0 auto}#egatari-article th,#egatari-article td{border:1px solid var(--line,GrayText);padding:.2em .6em}
#egatari-article thead{display:table-header-group}#egatari-article .egatari-align-left{text-align:left}#egatari-article .egatari-align-center{text-align:center}#egatari-article .egatari-align-right{text-align:right}
#egatari-article .egatari-math{display:flex;align-items:center;justify-content:center;gap:1em;margin:1em 0}#egatari-article .egatari-eqno{margin-left:auto}
#egatari-article .egatari-aside,#egatari-article .egatari-exercise,#egatari-article .egatari-solution{border:1px solid var(--line,GrayText);border-radius:6px;padding:.4em 1em;margin:1.2em 0;break-inside:avoid}
#egatari-article .egatari-aside-title{font-weight:bold;margin:.3em 0}
#egatari-article .egatari-proof{margin:1.2em 0}#egatari-article .egatari-qed{float:right;padding-left:1em}
#egatari-article .egatari-footnotes{font-size:.85em;border-top:1px solid var(--line,GrayText);padding-top:.4em}
#egatari-article .egatari-tex{font-family:monospace}
#egatari-article .egatari-references{list-style:none;padding-left:0}#egatari-article .egatari-references li{margin:.3em 0}#egatari-article .egatari-references-author-date li{padding-left:2em;text-indent:-2em}
#egatari-article .egatari-references-numeric li{display:flex;gap:.5em}#egatari-article .egatari-ref-label{flex:none;min-width:2.5em}#egatari-article .egatari-sc{font-variant:small-caps}#egatari-article .egatari-upright{font-style:normal}#egatari-article .egatari-unbold{font-weight:normal}#egatari-article .egatari-underline{text-decoration:underline}
#egatari-article:lang(ja) em,#egatari-article :lang(ja) em{font-style:normal;text-emphasis:filled sesame;-webkit-text-emphasis:filled sesame;text-emphasis-position:over right;-webkit-text-emphasis-position:over right}
#egatari-article.egatari-vertical{writing-mode:vertical-rl;max-width:none;max-height:40em;overflow-x:auto}
#egatari-article.egatari-vertical figure,#egatari-article.egatari-vertical table,#egatari-article.egatari-vertical .egatari-math{writing-mode:horizontal-tb}
#egatari-article.egatari-vertical table{direction:rtl}#egatari-article.egatari-vertical th,#egatari-article.egatari-vertical td{direction:ltr}
#egatari-article .egatari-fn-numbered{list-style:none;padding-inline-start:0}#egatari-article .egatari-fn-no{margin-inline-end:.5em;font-weight:bold}
#egatari-article .egatari-tcy{text-combine-upright:all;-webkit-text-combine:horizontal}
@media print{#egatari-article figure,#egatari-article .egatari-math{break-inside:avoid}#egatari-article h2,#egatari-article h3,#egatari-article h4{break-after:avoid}}`;
