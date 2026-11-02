// 本文の引用（format spec §9C.4・§9C.6）：references.json（CSL-JSON）と metadata.citations（{style?, list?}）から、
// 地の文の中の引用の字と文献の一覧を、組み立てのときに CSL（citeproc-js）で作る。再生器は文献の道具を持たない。
//   書式（style）：同梱の CSL の書式（vendor/csl/styles）。著者と年の書式 apa と番号の書式 ieee・sist02（日本語）。
//     書式がなければ既定（apa）で組み、警告して style はそのまま残す（§9C.4）。
//   一覧（list）：end（本文の終わりに 1 つ。既定）・chapter（章の終わりごとに、その章で引いたもの。chapters のときだけ）・none（一覧なし）。
//     一覧の項目の id は ref-<鍵>、章ごとの一覧は ref-<章の印>-<鍵>（章の印は脚注と同じ。kit/core/article-render.mjs の numberArticle）。
//   所在（[@key, p. 3] の p. 3）は解釈せず、字のまま引用の後ろに付ける（citeproc の suffix）。
// 1 つの括弧の中の引用（[@a; @b]）は、書式が並べた字の中で鍵ごとに <a class="egatari-cite" href="#ref-…"> にする（鍵ごとの印を
// citeproc の prefix・suffix に入れて、出てきた場所で包む）。印を付けると citeproc は番号をまとめない（(1–4) を (1, 2, 3, 4) と書く）。
// citeproc の出力の HTML は許可した要素（i・b・sup・sub と飾りの span）だけを通す（字は citeproc が実体参照にしている）。
// 編集アプリと共有する（node: の読み込み・fs を使わない）。citeproc と書式のファイルは opts.csl で渡す：
//   {CSL: citeproc の名前空間, style(id) → CSL の XML の字か null, locale(tag) → 言語の XML の字か null}
// 返す citeproc（true なら citeproc で組んだ）を見て、呼び手は CITEPROC_CREDIT を出す
import { visit } from './article-text.mjs';

// 同梱の書式（§9C.4：著者と年の書式 1 つと番号の書式 1 つ以上）。format は CSL の citation-format
export const CITATION_STYLES = Object.freeze({ apa: 'author-date', ieee: 'numeric', sist02: 'numeric' });
export const DEFAULT_CITATION_STYLE = 'apa';
export { CITEPROC_CREDIT } from './citeproc-credit.mjs';   // citeproc で組んだときに出す帰属の 1 行（NOTICE）
export const CITATION_LISTS = Object.freeze(['end', 'chapter', 'none']);
const LIST_TITLE = { ja: '参考文献', en: 'References' };
// CSL の言語のファイル（vendor/csl/locales）。ほかの言語は en-US（citeproc の既定）
const LOCALES = { ja: 'ja-JP', en: 'en-US' };
export const cslLocaleOf = (lang) => LOCALES[String(lang || '').toLowerCase().split('-')[0]] || 'en-US';

// metadata.citations を読む（§9C.4・§9C.8 の 7）。book：index.article が chapters か。styles：使える書式の名前（既定は同梱のもの）
// 返すもの：{style（実際に使う書式）, asked（書いてあった style）, list, problems}
export function citationSettings(citations, { book = false, styles = Object.keys(CITATION_STYLES) } = {}) {
  const problems = [];
  const c = citations && typeof citations === 'object' && !Array.isArray(citations) ? citations : {};
  if (citations !== undefined && citations !== null && c !== citations) problems.push(D('error', 'articleCitations', '§9C.4', { why: 'shape' }));
  let style = DEFAULT_CITATION_STYLE;
  const asked = c.style;
  if (asked !== undefined) {
    if (typeof asked === 'string' && styles.includes(asked)) style = asked;
    else problems.push(D('warn', 'articleCiteStyle', '§9C.4', { style: String(asked).slice(0, 80), fallback: DEFAULT_CITATION_STYLE, styles: styles.slice() }));
  }
  let list = 'end';
  if (c.list !== undefined) {
    if (!CITATION_LISTS.includes(c.list)) problems.push(D('error', 'articleCitations', '§9C.4', { why: 'list', value: String(c.list).slice(0, 40) }));
    else if (c.list === 'chapter' && !book) problems.push(D('error', 'articleCiteListChapter', '§9C.8', {}));
    else list = c.list;
  }
  return { style, asked: asked === undefined ? null : asked, list, problems };
}

// 引用の字と一覧を作る。article：readArticle の結果。items：references.json の配列。
// opts：csl（上）・lang・style・list（citationSettings の結果）・tokens（ファイルごとの章の印。numberArticle の files[].chapterAttr）
// 返すもの：{groups: Map(citeGroup → HTML), narratives: Map(cite → HTML), end: 一覧の HTML か ''、chapters: Map(ファイルの番号 → HTML), problems}
export function renderCitations(article, items, opts) {
  const { csl, lang = '', style = DEFAULT_CITATION_STYLE, list = 'end', tokens = [] } = opts;
  const groups = new Map(), narratives = new Map(), chapters = new Map(), problems = [];
  let end = '', engineUsed = false;
  const byId = new Map();
  for (const it of Array.isArray(items) ? items : []) if (it && typeof it === 'object' && typeof it.id === 'string' && !byId.has(it.id)) byId.set(it.id, it);
  const book = !!(article.index && article.index.chapters);
  const perChapter = list === 'chapter' && book;
  const styleXml = csl && csl.style ? csl.style(style) : null;
  if (!csl || !csl.CSL || !styleXml) return { groups, narratives, end, chapters, problems, rendered: false };
  const numeric = /<category\s+citation-format="numeric"/.test(styleXml);
  const locale = cslLocaleOf(lang);
  // 範囲：章ごとの一覧なら章ごと、ほかは本文全体で 1 つ（番号の書式の番号は範囲の中で引いた順）
  const scopes = perChapter ? article.files.map((f, i) => [i]) : [article.files.map((f, i) => i)];
  for (const scope of scopes) {
    const uses = [];   // {node, cites: [{key, suffix}], narrative}
    for (const fi of scope) {
      visit(article.files[fi].tree, (n, parents) => {
        if (n.type === 'citeGroup') uses.push({ node: n, cites: (n.children || []).filter((c) => c.type === 'cite').map(citeOf) });
        else if (n.type === 'cite' && !parents.some((p) => p.type === 'citeGroup')) uses.push({ node: n, cites: [citeOf(n)], narrative: true });
      });
    }
    const keys = [];
    for (const u of uses) for (const c of u.cites) if (byId.has(c.key) && !keys.includes(c.key)) keys.push(c.key);
    if (!uses.length) continue;
    const token = perChapter ? tokens[scope[0]] || '' : '';
    const href = (key) => (perChapter && token ? `#ref-${token}-${key}` : `#ref-${key}`);
    const wrap = (key, inner) => (byId.has(key) ? (list === 'none' ? `<span class="egatari-cite">${inner}</span>` : `<a class="egatari-cite" href="${esc(href(key))}">${inner}</a>`) : `<span class="egatari-cite egatari-cite-missing">${inner}</span>`);
    let engine = null;
    if (keys.length) {
      try {
        const sys = { retrieveLocale: (tag) => (csl.locale && csl.locale(tag)) || false, retrieveItem: (id) => byId.get(id) };
        engine = new csl.CSL.Engine(sys, styleXml, locale, true);
        engine.updateItems(keys);
        engineUsed = true;
      } catch (e) { problems.push(D('warn', 'articleCiteEngine', '§9C.4', { why: String(e && e.message || e).split('\n')[0].slice(0, 120) })); engine = null; }
    }
    for (const u of uses) {
      const known = u.cites.filter((c) => byId.has(c.key));
      let html = null;
      if (engine && known.length === u.cites.length) {
        try { html = u.narrative ? narrative(engine, u.cites[0], numeric, wrap) : cluster(engine, u.cites, wrap); } catch (e) { problems.push(D('warn', 'articleCiteEngine', '§9C.4', { why: String(e && e.message || e).split('\n')[0].slice(0, 120) })); html = null; }
      }
      // 書式で組めないとき（鍵が文献にない・citeproc がない・失敗）：鍵の字のまま（点検が誤りを知らせる）
      if (html === null) html = u.narrative ? wrap(u.cites[0].key, esc(u.cites[0].key)) : `(${u.cites.map((c) => wrap(c.key, esc(c.key) + (c.suffix ? `, ${esc(c.suffix)}` : ''))).join('; ')})`;
      (u.narrative ? narratives : groups).set(u.node, html);
    }
    // 一覧（§9C.6：<section data-egatari-references> の <li id="ref-…">。書式の順）
    if (list !== 'none' && engine) {
      let bib = null;
      try { bib = engine.makeBibliography(); } catch (e) { problems.push(D('warn', 'articleCiteEngine', '§9C.4', { why: String(e && e.message || e).split('\n')[0].slice(0, 120) })); }
      if (bib && Array.isArray(bib[1])) {
        const ids = (bib[0].entry_ids || []).map((x) => (Array.isArray(x) ? x[0] : x));
        const lis = bib[1].map((entry, j) => {
          const key = ids[j];
          const id = perChapter && token ? `ref-${token}-${key}` : `ref-${key}`;
          return `<li id="${esc(id)}">${cslHtml(entry).trim()}</li>`;
        });
        const words = LIST_TITLE[/^ja\b/i.test(lang) ? 'ja' : 'en'];
        const sec = `<section data-egatari-references=""><h2>${words}</h2>\n<ul class="egatari-references egatari-references-${numeric ? 'numeric' : 'author-date'}">\n${lis.join('\n')}\n</ul></section>`;
        if (perChapter) chapters.set(scope[0], sec); else end = sec;
      }
    }
  }
  return { groups, narratives, end, chapters, problems, rendered: true, citeproc: engineUsed };
}
const citeOf = (n) => ({ key: String(n.label || n.identifier || ''), suffix: n.suffix ? String(n.suffix) : '' });

// 1 つの括弧の中の引用：鍵ごとの印（私用領域の字）を prefix・suffix に入れて組み、出てきた場所を鍵ごとのリンクで包む
const OPEN = '', CLOSE = '', IDX = 0xE100;
function cluster(engine, cites, wrap) {
  const marked = cites.map((c, i) => ({ id: c.key, prefix: OPEN + String.fromCharCode(IDX + i), suffix: (c.suffix ? `, ${c.suffix}` : '') + CLOSE }));
  const raw = cslHtml(engine.makeCitationCluster(marked));
  const re = new RegExp(`${OPEN}([\\uE100-\\uE1FF])([^${OPEN}${CLOSE}]*)${CLOSE}`, 'g');
  const out = raw.replace(re, (m, idx, inner) => { const c = cites[idx.charCodeAt(0) - IDX]; return c ? wrap(c.key, inner) : inner; });
  // 印が残る（包めなかった）なら、印を外して全体を最初の鍵へのリンクにする
  if (/[-]/.test(out)) return wrap(cites[0].key, raw.replace(/[-]/g, ''));
  return out;
}
// 地の文の引用（§9C.6）：著者と年の書式は「著者 (年)」、番号の書式は番号（[3]）
function narrative(engine, c, numeric, wrap) {
  if (!numeric) {
    const who = cslHtml(engine.makeCitationCluster([{ id: c.key, 'author-only': true }])).trim();
    const when = cslHtml(engine.makeCitationCluster([{ id: c.key, 'suppress-author': true }])).trim();
    if (who && !/NO_PRINTED_FORM/.test(who)) return wrap(c.key, `${who} ${when}`);
  }
  return wrap(c.key, cslHtml(engine.makeCitationCluster([{ id: c.key }])).trim());
}

// citeproc の HTML の出力から、許可した要素だけを通す（ほかの要素は外して中の字を残す）。字の中の < > は citeproc が実体参照にしている
const SPAN_STYLE = { 'font-variant:small-caps;': 'egatari-sc', 'font-style:normal;': 'egatari-upright', 'font-weight:normal;': 'egatari-unbold', 'text-decoration:underline;': 'egatari-underline', 'font-variant:normal;': 'egatari-plain', 'text-decoration:none;': 'egatari-plain' };
const DIV_CLASS = { 'csl-left-margin': 'egatari-ref-label', 'csl-right-inline': 'egatari-ref-body', 'csl-block': 'egatari-ref-block', 'csl-indent': 'egatari-ref-indent' };
export function cslHtml(s) {
  const stack = [];
  const out = String(s).replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[^<>]*)?)\s*\/?>|[<>]/g, (m, close, tag, attrs) => {
    if (!tag) return m === '<' ? '&lt;' : '&gt;';
    const t = tag.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === t) { const [x] = stack.splice(i, 1); return x.close; }
      return '';
    }
    if (t === 'br') return '';
    let open = '', closeTag = '';
    if (['i', 'b', 'sup', 'sub'].includes(t)) { open = `<${t}>`; closeTag = `</${t}>`; }
    else if (t === 'span') {
      const st = (attrs.match(/\bstyle\s*=\s*"([^"]*)"/) || [])[1];
      const cls = st && SPAN_STYLE[st.replace(/\s+/g, '')];
      if (cls) { open = `<span class="${cls}">`; closeTag = '</span>'; }
    } else if (t === 'div') {
      const c = (attrs.match(/\bclass\s*=\s*"([^"]*)"/) || [])[1];
      const cls = c && DIV_CLASS[c.trim()];
      if (cls) { open = `<span class="${cls}">`; closeTag = '</span> '; }
    }
    stack.push({ tag: t, close: closeTag });
    return open;
  });
  // 閉じられなかった要素を閉じ、裸の & を実体参照にする
  return (out + stack.reverse().map((x) => x.close).join('')).replace(/&(?!#[0-9]{1,7};|#x[0-9A-Fa-f]{1,6};|[A-Za-z][A-Za-z0-9]{1,31};)/g, '&amp;').replace(/\s+\n/g, '\n');
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function D(sev, code, spec, data) { return { sev, code, spec, file: null, line: null, data }; }
