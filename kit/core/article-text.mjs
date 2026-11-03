// 本文の原稿（Egatari Text 1、format spec §9C.2）を読む：前付け（front matter）を外し、myst-parser で木にし、構造の 6 つの変換をかける。
// 木は仕様の fixtures/article-text と同じ形（解決・番号の前。§9C.6 は kit/core/article-render.mjs）。
// 部分集合の外の書き方は myst-parser 自身は拒まない（仕様の FINDINGS.md）ので、ここで自前に拒む：変換の前の木（指令・役割・HTML の名前が
// 残っている）と、変換の後の木と、原稿の字の 3 つで見る。convert: true なら、変換できる書き方（§9C.2 の informative conversions）を
// 部分集合に直し、直したことを conversions で返す（既定は拒むだけ。直し方は problems の hint に書く）。
// 編集アプリと共有する（node: の読み込み・fs を使わない）。
//
// 版（package.json で固定）：myst-parser 1.7.4・myst-transforms 1.3.51・myst-ext-proof 1.0.13・myst-ext-exercise 1.0.10・vfile 6.0.3。
// 仕様の正解の木は myst-parser 1.7.5 / myst-transforms 1.3.52 で作ったが、その 2 つは公開から 2 週間たっていない（2026-10-26）。
// 1 つ前の版（2026-09-21）で 49 の正解の木がすべて同じになることを確かめて、こちらに固定する（tools/test-article.mjs が毎回確かめる）。
// markdown-it は 13 のまま（14 は markdown-it-dollarmath が読めない）。13 の既知の弱点（HTML の行内の 2 乗の時間）があるので、
// 読む大きさは ARTICLE_LIMITS.fileBytes までにする。linkify・typographer は myst-parser が切っている。
import { mystParse } from 'myst-parser';
import { proofDirective } from 'myst-ext-proof';
import { exerciseDirectives } from 'myst-ext-exercise';
import { liftMystDirectivesAndRolesTransform, mystTargetsTransform, reconstructHtmlTransform, htmlTransform, containerChildrenTransform, captionParagraphTransform } from 'myst-transforms';
import { VFile } from 'vfile';

export const ARTICLE_LIMITS = Object.freeze({ fileBytes: 1 << 20 });   // 1 ファイル 1 MiB まで（本の 1 章には十分）

// §9C.2 の定理の類（mystmd の proof 拡張の種類）
export const PROOF_KINDS = Object.freeze(['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'example', 'remark', 'proof', 'axiom', 'assumption', 'conjecture', 'criterion', 'property', 'observation', 'algorithm']);
export const KINDS = Object.freeze(['preface', 'chapter', 'appendix', 'afterword']);
// 前付けに書ける項目と型（§9C.2）
const FM_MEMBERS = { title: 'string', subtitle: 'string', lang: 'lang', bibliography: 'string', 'writing-mode': 'mode', chapter: 'posint', kind: 'kind', numbering: 'boolean' };
// 指令ごとに書ける option（§9C.2）
const DIRECTIVES = { figure: ['label', 'alt'], table: ['label'], aside: ['label', 'class'], exercise: ['label', 'nonumber'], solution: ['label'], glossary: [] };
const ROLES = new Set(['step', 'ruby', 'term', 'sub', 'sup']);
const ADMONITIONS = new Set(['admonition', 'note', 'tip', 'hint', 'important', 'warning', 'caution', 'attention', 'danger', 'error', 'seealso', 'margin', 'sidebar', 'topic']);
// 名前の決まり（§8.1・§9C.3・§9C.4）
export const LABEL_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const SECTION_ID_RE = /^sec-[a-z2-7]{6}$/;
const RESERVED_PREFIX = /^(?:sec-|s-|ref-|fn-|term-|egatari-)/;
export const CITE_KEY_RE = /^[A-Za-z0-9_]+(?:[.:-][A-Za-z0-9_]+)*$/;
const CLASS_RE = /^[a-z][a-z0-9-]*$/;
const FN_NAME_RE = /^[A-Za-z0-9_-]+$/;
const STEP_KEY = '(0|[1-9][0-9]{0,2}|concl)';
const SLIDE_KEY = '([A-Za-z][A-Za-z0-9_-]{0,63})';
const STEP_RE = new RegExp(`^${SLIDE_KEY}:${STEP_KEY}$`);
const STEP_TEXT_RE = new RegExp(`^([\\s\\S]*?\\S)\\s*<${SLIDE_KEY}:${STEP_KEY}>$`);
const INLINE_CELL = new Set(['text', 'emphasis', 'strong', 'inlineCode', 'subscript', 'superscript', 'break']);
const CELL_KEYS = new Set(['type', 'children', 'header', 'align', 'colspan', 'rowspan', 'position']);
const FRONT_MATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const NARRATIVE_LOCATOR = /^,\s*(?:p\.|pp\.|ch\.|sec\.|§|\d+\s*(?:頁|ページ|章|節))/;

// ---------------------------------------------------------------- 前付け（YAML の小さな部分：1 行に「名前: 値」だけ）
// 値は文字列（引用符あり・なし）・整数・true / false。入れ子・並び・複数行は前付けに要らないので拒む
export function readFrontMatter(src) {
  const m = src.match(FRONT_MATTER);
  if (!m) return { fm: {}, body: src, lines: 0, problems: [] };
  const fm = {}, problems = [];
  m[1].split('\n').forEach((line, i) => {
    const ln = i + 2;
    if (!line.trim() || /^\s*#/.test(line)) return;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*?))?\s*$/);
    if (!kv) { problems.push(P('error', 'articleFrontMatter', '§9C.2', ln, { text: line.trim().slice(0, 60) })); return; }
    const [, key, raw = ''] = kv;
    if (!(key in FM_MEMBERS)) { problems.push(P('error', 'articleFrontMatterMember', '§9C.2', ln, { member: key })); return; }
    if (key in fm) { problems.push(P('error', 'articleFrontMatter', '§9C.2', ln, { text: `${key} (twice)` })); return; }
    let v = raw;
    if (/^"(?:[^"\\]|\\.)*"$/.test(raw)) { try { v = JSON.parse(raw); } catch { v = raw; } }
    else if (/^'(?:[^']|'')*'$/.test(raw)) v = raw.slice(1, -1).replace(/''/g, "'");
    else if (/^-?\d+$/.test(raw)) v = Number(raw);
    else if (raw === 'true' || raw === 'false') v = raw === 'true';
    else if (/^[[{|>&*!%@`]/.test(raw)) { problems.push(P('error', 'articleFrontMatter', '§9C.2', ln, { text: line.trim().slice(0, 60) })); return; }
    const t = FM_MEMBERS[key];
    const ok = t === 'string' ? typeof v === 'string' && v.trim() !== ''
      : t === 'lang' ? typeof v === 'string' && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(v)
      : t === 'mode' ? v === 'horizontal-tb' || v === 'vertical-rl'
      : t === 'posint' ? Number.isInteger(v) && v > 0
      : t === 'kind' ? KINDS.includes(v)
      : typeof v === 'boolean';
    if (!ok) { problems.push(P('error', 'articleFrontMatterValue', '§9C.2', ln, { member: key, value: String(raw).slice(0, 40), expected: t })); return; }
    fm[key] = v;
  });
  // 章の番号は kind: chapter のファイルだけ（§9C.1A）
  if (fm.chapter !== undefined && fm.kind && fm.kind !== 'chapter') problems.push(P('error', 'articleKindChapter', '§9C.1A', 1, { kind: fm.kind }));
  return { fm, body: src.slice(m[0].length), lines: m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0), problems };
}

// ---------------------------------------------------------------- HTML の表（§9C.2：決まった要素と属性だけを読む。ほかはすべて拒む）
const TABLE_TAGS = { table: ['#root'], thead: ['table'], tbody: ['table'], tr: ['table', 'thead', 'tbody'], th: ['tr'], td: ['tr'] };
const CELL_TAGS = new Set(['em', 'strong', 'code', 'sub', 'sup', 'br']);
// 返すもの：問題の言葉の配列（空なら決まりどおり）
export function checkHtmlTable(html) {
  const errs = [];
  const s = html.trim();
  if (!/^<table>/.test(s) || !/<\/table>$/.test(s)) errs.push('the HTML must start with <table> and end with </table>');
  if (/\n[ \t]*\n/.test(s)) errs.push('blank line inside the table');
  const stack = ['#root'];
  const tagRe = /<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*)>/y;
  let i = 0, cellText = '';
  const endCell = () => {
    if (/\$[^$]+\$/.test(cellText)) errs.push('math in a cell');
    else if (/\*\*?[^*\s][^*]*\*\*?|`[^`]+`|\]\(|\[@|(^|\s)_[^_\s][^_]*_/.test(cellText)) errs.push('Markdown in a cell');
    cellText = '';
  };
  while (i < s.length && errs.length < 5) {
    const c = s[i];
    if (c === '<') {
      tagRe.lastIndex = i;
      const m = tagRe.exec(s);
      if (!m) { errs.push(`not an allowed element: ${s.slice(i, i + 20)}`); break; }
      const [all, close, nameRaw, rest] = m;
      const name = nameRaw.toLowerCase();
      i += all.length;
      const top = stack[stack.length - 1];
      if (close) {
        if (rest.trim()) errs.push(`attributes on a closing tag </${name}>`);
        if (top !== name) { errs.push(`</${name}> does not close <${top}>`); break; }
        if (name === 'th' || name === 'td') endCell();
        stack.pop();
        continue;
      }
      const selfClose = /\/\s*$/.test(rest);
      const attrText = rest.replace(/\/\s*$/, '');
      if (name in TABLE_TAGS) {
        if (!TABLE_TAGS[name].includes(top)) { errs.push(`<${name}> inside <${top === '#root' ? 'nothing' : top}>`); break; }
      } else if (CELL_TAGS.has(name)) {
        if (!(top === 'th' || top === 'td' || CELL_TAGS.has(top))) { errs.push(`<${name}> outside a cell`); break; }
      } else { errs.push(`element <${name}> is not allowed`); break; }
      // 属性：th・td の colspan・rowspan（正の整数）・align（left・center・right）だけ
      const attrRe = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
      let j = 0; const seen = new Set();
      while (j < attrText.length) {
        attrRe.lastIndex = j;
        const a = attrRe.exec(attrText);
        if (!a) { if (attrText.slice(j).trim()) errs.push(`unreadable attributes on <${name}>`); break; }
        j += a[0].length;
        const an = a[1].toLowerCase(), av = a[2] ?? a[3] ?? a[4];
        if (seen.has(an)) errs.push(`attribute ${an} twice on <${name}>`);
        seen.add(an);
        if (!(name === 'th' || name === 'td')) errs.push(`attribute ${an} on <${name}> is not allowed`);
        else if (an === 'colspan' || an === 'rowspan') { if (!/^[1-9][0-9]{0,2}$/.test(av ?? '')) errs.push(`${an}="${av ?? ''}" is not a positive integer`); }
        else if (an === 'align') { if (!['left', 'center', 'right'].includes(av)) errs.push(`align="${av ?? ''}" is not left, center or right`); }
        else errs.push(`attribute ${an} is not allowed (only colspan, rowspan and align)`);
      }
      if (name === 'br') continue;
      if (selfClose) { errs.push(`<${name}/> is not allowed`); continue; }
      stack.push(name);
      continue;
    }
    // 字：セルの中だけ。外は空白だけ。& は文字参照だけ
    const next = s.indexOf('<', i);
    const text = s.slice(i, next < 0 ? s.length : next);
    i = next < 0 ? s.length : next;
    if (/&(?![A-Za-z][A-Za-z0-9]{1,31};|#[0-9]{1,7};|#[xX][0-9A-Fa-f]{1,6};)/.test(text)) errs.push('a bare & (write &amp;)');
    const top = stack[stack.length - 1];
    if (top === 'th' || top === 'td' || CELL_TAGS.has(top)) cellText += text;
    else if (text.trim()) errs.push(`text outside a cell: ${text.trim().slice(0, 20)}`);
  }
  if (!errs.length && stack.length !== 1) errs.push(`<${stack[stack.length - 1]}> is not closed`);
  return [...new Set(errs)];
}

// 段落の頭の全角の空白（U+3000。青空文庫などの字下げ）を残す。CommonMark が段落の頭と終わりから外すのは半角の空白とタブだけだが、
// markdown-it（myst-parser の下）は String.prototype.trim で U+3000 も外す。読む前に行の頭の U+3000 を印（U+FDD0。非文字）に替え、木の字で戻す
const IDEO_MARK = '\uFDD0';
function protectIdeographicSpaces(body) { return body.replace(/^\u3000+/gm, (m) => IDEO_MARK.repeat(m.length)); }
function keepIdeographicSpaces(tree) {
  const seen = new Set();
  const walk = (x) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    for (const k of Object.keys(x)) {
      const v = x[k];
      if (typeof v === 'string') { if (v.includes(IDEO_MARK)) x[k] = v.split(IDEO_MARK).join('\u3000'); }
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(tree);
  return tree;
}

// ---------------------------------------------------------------- 本体
// 返すもの：{fm, tree, problems, conversions}。problems は {sev: 'error'|'warn', code, spec, line, data}（line は原稿の行、1 から）
export function parseArticleText(src, opts = {}) {
  const convert = !!opts.convert;
  const problems = [], conversions = [];
  if (src.charCodeAt(0) === 0xfeff) { problems.push(P('error', 'articleEncoding', '§9C.2', 1, { what: 'bom' })); src = src.slice(1); }
  if (src.includes('\r')) { problems.push(P('error', 'articleEncoding', '§9C.2', 1, { what: 'crlf' })); src = src.replace(/\r\n?/g, '\n'); }
  if (src.normalize('NFC') !== src) problems.push(P('error', 'articleEncoding', '§9C.2', 1, { what: 'nfc' }));
  const front = readFrontMatter(src);
  problems.push(...front.problems);
  const off = front.lines;
  const lines = front.body.split('\n');
  const lineOf = (n) => (n && n.position ? n.position.start.line + off : null);
  const add = (sev, code, spec, node, data = {}) => problems.push(P(sev, code, spec, typeof node === 'number' ? node : lineOf(node), data));
  const tree = keepIdeographicSpaces(mystParse(protectIdeographicSpaces(front.body), { directives: [proofDirective, ...exerciseDirectives] }));

  // ---- 変換の前の木：指令・役割・生の HTML・コメント・区切り・字
  const rawWalk = (node, parents) => {
    const t = node.type;
    if (t === 'mystDirective') rawDirective(node, parents);
    else if (t === 'mystRole') rawRole(node);
    else if (t === 'html' && !parents.some((p) => p.__htmlTable === node)) add('error', 'articleHtml', '§9C.2', node, { html: String(node.value).trim().slice(0, 60), hint: htmlHint(node.value) });
    else if (t === 'comment') add('error', 'articleComment', '§9C.2', node, { text: String(node.value).slice(0, 60) });
    else if (t === 'block' || t === 'blockBreak') add('error', 'articleBlockBreak', '§9C.2', node);
    else if (t === 'heading' && (node.depth < 2 || node.depth > 4)) add('error', 'articleHeadingLevel', '§9C.2', node, { depth: node.depth });
    else if (t === 'listItem' && typeof node.checked === 'boolean') add('error', 'articleTaskList', '§9C.2', node);
    else if (t === 'text' && !parents.some((p) => p.type === 'link' || p.type === 'crossReference')) rawText(node);
    else if (t === 'image') imagePath(node);
    else if (t === 'cite') cite(node);
    else if (t === 'footnoteDefinition') {
      if (!FN_NAME_RE.test(node.label || node.identifier || '')) add('error', 'articleFootnoteName', '§9C.2', node, { name: node.label || node.identifier });
      for (const c of node.children || []) if (c.type !== 'paragraph') { add('error', 'articleFootnoteContent', '§9C.2', c, { name: node.label, what: c.type }); break; }
    }
    for (const c of node.children || []) rawWalk(c, [...parents, node]);
  };
  const srcLine = (node) => (node.position ? lines[node.position.start.line - 1] || '' : '');
  function rawDirective(node, parents) {
    const name = node.name;
    const opts0 = node.options || {};
    // 囲いは「:::」だけ（§9C.2 の表：「`」の囲いの指令は外）
    if (/^\s*(?:>\s*)*(?:`{3,}|~{3,})/.test(srcLine(node))) {
      if (convert && (name in DIRECTIVES || /^prf:/.test(name))) conversions.push(C(lineOf(node), '```{' + name + '}', ':::{' + name + '}'));
      else add('error', 'articleBacktickDirective', '§9C.2', node, { name, hint: name in DIRECTIVES || /^prf:/.test(name) ? `:::{${name}}` : null });
    }
    let allowed = DIRECTIVES[name];
    if (/^prf:/.test(name)) {
      const kind = name.slice(4);
      if (!PROOF_KINDS.includes(kind)) { add('error', 'articleProofKind', '§9C.2', node, { kind }); return; }
      allowed = ['label'];
    } else if (/^proof:/.test(name)) {
      const kind = name.slice(6);
      if (convert && PROOF_KINDS.includes(kind)) { conversions.push(C(lineOf(node), `{${name}}`, `{prf:${kind}}`)); allowed = ['label']; }
      else { add('error', 'articleDirective', '§9C.2', node, { name, hint: PROOF_KINDS.includes(kind) ? `{prf:${kind}}` : null }); return; }
    } else if (!allowed) {
      const conv = convert ? convertDirective(node) : null;
      if (conv) { conversions.push(C(lineOf(node), `{${name}}`, conv)); return; }
      add('error', 'articleDirective', '§9C.2', node, { name, hint: directiveHint(name) });
      return;
    }
    for (const k of Object.keys(opts0)) if (!allowed.includes(k)) add('error', 'articleOption', '§9C.2', node, { name, option: k });
    if (name === 'figure') figureDirective(node, parents);
    if (name === 'table') tableDirective(node);
    if (name === 'solution' && !String(node.args || '').trim()) add('error', 'articleSolutionLabel', '§9C.2', node);
  }
  function figureDirective(node, parents) {
    const inFigure = parents.some((p) => p.type === 'mystDirective' && p.name === 'figure');
    if (String(node.args || '').trim()) {
      if (inFigure && !node.options?.alt) add('error', 'articleSubfigure', '§9C.2', node, { why: 'alt' });
      return;
    }
    if (inFigure) { add('error', 'articleSubfigure', '§9C.2', node, { why: 'path' }); return; }
    // 小さな図を持つ図：中は 2 つ以上の :::{figure} <path>。1 段落に画像を並べる書き方は外（alt が見出しになって消える。FINDINGS 12）
    const body = (node.children && node.children[0] && node.children[0].children) || [];
    const subs = body.filter((c) => c.type === 'mystDirective' && c.name === 'figure');
    if (body.some((c) => c.type === 'paragraph' && (c.children || []).some((x) => x.type === 'image'))) add('error', 'articleSubfigure', '§9C.2', node, { why: 'paragraph' });
    else if (subs.length < 2) add('error', 'articleSubfigure', '§9C.2', node, { why: 'count' });
  }
  function tableDirective(node) {
    const body = (node.children && node.children[0] && node.children[0].children) || [];
    const htmls = body.filter((c) => c.type === 'html');
    const v = String(node.value || '');
    if (/<table[\s>]/i.test(v) && /<table[\s>][\s\S]*?\n[ \t]*\n[\s\S]*?<\/table>/i.test(v)) { add('error', 'articleHtmlTable', '§9C.2', node, { why: 'blank line inside the table' }); node.__htmlTable = htmls[0]; return; }
    if (!htmls.length) return;
    const tables = body.filter((c) => c.type === 'table' || c.type === 'html');
    if (htmls.length > 1 || tables.length > 1) { add('error', 'articleHtmlTable', '§9C.2', node, { why: 'more than one table or HTML block in the directive' }); return; }
    const errs = checkHtmlTable(htmls[0].value);
    if (errs.length) add('error', 'articleHtmlTable', '§9C.2', node, { why: errs.join('; ') });
    // セルをつながない HTML の表はパイプの表で書ける（§9C.8 の SHOULD）
    else if (!/\b(?:colspan|rowspan)\s*=\s*["']?0*(?:[2-9]|[1-9][0-9]+)/i.test(htmls[0].value)) add('warn', 'articleHtmlTableNoSpan', '§9C.8', node, {});
    node.__htmlTable = htmls[0];   // この 1 つだけは HTML の表として許す（子を見るとき）
  }
  function rawRole(node) {
    const name = node.name;
    if (ROLES.has(name)) {
      if (name === 'ruby') {
        const v = String(node.value || ''), k = v.indexOf('|');
        if (k <= 0 || k === v.length - 1 || v.slice(k + 1).includes('|')) add('error', 'articleRuby', '§9C.2', node, { value: v });
      }
      if (name === 'step') {
        const v = String(node.value || '').trim();
        if (!STEP_RE.test(v) && !STEP_TEXT_RE.test(v)) add('error', 'articleStepSyntax', '§9C.5', node, { value: v });
      }
      return;
    }
    const conv = convert ? convertRole(node) : null;
    if (conv) { conversions.push(C(lineOf(node), `{${name}}\`${node.value}\``, conv)); return; }
    add('error', 'articleRole', '§9C.2', node, { name, hint: roleHint(node) });
  }
  function rawText(node) {
    const v = String(node.value || '');
    let m;
    if ((m = v.match(/~~[^~\n]+~~/))) add('error', 'articleStrike', '§9C.2', node, { text: m[0].slice(0, 40) });
    if ((m = v.match(/\{\{[^{}]*\}\}/))) add('error', 'articleSubstitution', '§9C.2', node, { text: m[0].slice(0, 40) });
    if ((m = v.match(/(?:^|[^\w/@.-])((?:https?:\/\/|www\.)[^\s<>()（）「」『』、。，．]+)/))) add('error', 'articleBareUrl', '§9C.2', node, { url: m[1].slice(0, 80) });
    // 定義のない脚注の参照は、myst-parser では字のまま残る
    if ((m = v.match(/\[\^([^\]\s]+)\]/))) add('error', 'articleFootnoteMissing', '§9C.2', node, { name: m[1] });
  }
  function imagePath(node) {
    const u = String(node.url || '');
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(u) || u.startsWith('/') || u.startsWith('\\') || u.split('/').some((s) => s === '..' || s === '.') || !u) add('error', 'articleImagePath', '§9C.1', node, { url: u.slice(0, 80) });
  }
  function cite(node) {
    const key = String(node.label || node.identifier || '');
    if (!CITE_KEY_RE.test(key) || key.length > 64) add('error', 'articleCiteKey', '§9C.4', node, { key });
    if (node.prefix) add('error', 'articleCitePrefix', '§9C.4', node, { key, prefix: String(node.prefix).slice(0, 30) });
    if (node.kind === 'narrative') {
      // 地の文の @key の後ろに「, p. 3」などの所在（§9C.4：地の文の引用は所在を持たない）
      // 原稿の字で見る（§9C.8 の 8）：引用のすぐ後ろに「,」・空白・p. pp. ch. sec. § か、数字と 頁・ページ・章・節
      const pos = node.position;
      const after = pos && pos.end && pos.end.line === pos.start.line ? (lines[pos.end.line - 1] || '').slice(pos.end.column - 1) : '';
      if (NARRATIVE_LOCATOR.test(after)) add('error', 'articleCiteNarrativeLocator', '§9C.4', node, { key });
    }
  }
  // ---- 変換できる指令・役割（§9C.2 の informative conversions）：木を部分集合の形に直して、その言葉を返す。直せなければ null
  function convertDirective(node) {
    const name = node.name, child = node.children && node.children[0];
    if (ADMONITIONS.has(name) && child) {
      const kids = child.children || [];
      const hasTitle = kids[0] && kids[0].type === 'admonitionTitle';
      const word = name === 'admonition' ? 'Note' : name[0].toUpperCase() + name.slice(1);
      const title = hasTitle ? kids[0] : { type: 'admonitionTitle', children: [{ type: 'text', value: String(node.args || '').trim() || word }] };
      const aside = { type: 'aside', children: [title, ...(hasTitle ? kids.slice(1) : kids)], position: child.position };
      if (node.options && node.options.label) { aside.label = node.options.label; aside.identifier = String(node.options.label).toLowerCase(); }
      node.children = [aside];
      return `:::{aside} ${title.children.map((x) => x.value || '').join('')}`;
    }
    if (name === 'math' && child && child.type === 'math') return '$$…$$';
    if (name === 'list-table' && child) {
      let ok = true;
      const visit = (n) => {
        if (n.type === 'tableCell') {
          const k = n.children || [];
          if (k.length === 1 && k[0].type === 'paragraph') n.children = k[0].children;
          else if (k.length) ok = false;
        }
        (n.children || []).forEach(visit);
      };
      visit(child);
      if (!ok) return null;
      if (node.options && node.options.label) { child.label = node.options.label; child.identifier = String(node.options.label).toLowerCase(); }
      return 'a pipe table in :::{table}';
    }
    return null;
  }
  function convertRole(node) {
    const name = node.name, child = node.children && node.children[0];
    if ((name === 'numref' || name === 'ref' || name === 'eq') && child && child.type === 'crossReference') {
      const label = child.label || child.identifier;
      node.children = [{ type: 'link', url: '#' + label, children: name === 'ref' && child.children ? child.children : [] }];
      return `[](#${label})`;
    }
    if (name === 'cite:p' && child && child.type === 'citeGroup') return '[@' + (child.children || []).map((c) => c.label).join('; @') + ']';
    if (name === 'cite:t' && child && child.type === 'citeGroup') {
      node.children = (child.children || []).map((c) => ({ ...c, kind: 'narrative' }));
      return (child.children || []).map((c) => '@' + c.label).join(', ');
    }
    if (name === 'math' && child && child.type === 'inlineMath') return '$…$';
    return null;
  }
  rawWalk(tree, []);

  // ---- 構造の変換（仕様の fixtures と同じ 6 つ、同じ順）
  liftMystDirectivesAndRolesTransform(tree);
  mystTargetsTransform(tree);
  reconstructHtmlTransform(tree);
  htmlTransform(tree);
  containerChildrenTransform(tree, new VFile());
  captionParagraphTransform(tree);

  // ---- 変換の後の木：見出しの id・名前・囲み・問・用語集・脚注・表のセル
  const fnRefs = new Map(), fnDefs = new Map();
  let glossaries = 0;
  const post = (node, parents) => {
    const t = node.type;
    if (t === 'heading') {
      if (node.depth === 2 && !node.label) add('error', 'articleSectionId', '§9C.3', node, { heading: plain(node).slice(0, 40) });
      if (node.label) checkLabel(node, node.depth === 2 ? 'section' : 'heading');
    } else if (['math', 'container', 'aside', 'proof', 'exercise', 'solution', 'table'].includes(t) && node.label && !(t === 'exercise' && node.hidden)) checkLabel(node, 'label');
    if (t === 'aside') {
      if (!(node.children && node.children[0] && node.children[0].type === 'admonitionTitle')) add('error', 'articleAsideTitle', '§9C.2', node);
      for (const c of String(node.class || '').split(/\s+/).filter(Boolean)) if (!CLASS_RE.test(c)) add('error', 'articleAsideClass', '§9C.2', node, { cls: c });
      const inner = findInside(node, ['aside', 'exercise', 'solution']) || findFigure(node);
      if (inner) add('error', inner.type === 'aside' ? 'articleAsideNested' : 'articleNested', '§9C.2', inner, { outer: 'aside', inner: kindOf(inner) });
    }
    if (t === 'exercise') {
      if (node.hidden) add('error', 'articleOption', '§9C.2', node, { name: 'exercise', option: 'hidden' });
      const inner = findInside(node, ['aside', 'exercise', 'solution']);
      if (inner) add('error', 'articleNested', '§9C.2', inner, { outer: 'exercise', inner: kindOf(inner) });
    }
    if (t === 'proof' && !PROOF_KINDS.includes(node.kind)) add('error', 'articleProofKind', '§9C.2', node, { kind: node.kind });
    if (t === 'glossary') {
      glossaries++;
      if (glossaries > 1) add('error', 'articleGlossary', '§9C.2', node, { why: 'second' });
      const k = node.children || [];
      if (k.length !== 1 || k[0].type !== 'definitionList') add('error', 'articleGlossary', '§9C.2', node, { why: 'body' });
      else {
        const seen = new Set();
        for (const d of k[0].children || []) if (d.type === 'definitionTerm') {
          if ((d.children || []).some((x) => x.type !== 'text')) add('error', 'articleGlossary', '§9C.2', d, { why: 'markup', term: plain(d) });
          const term = plain(d).trim();
          if (seen.has(term)) add('error', 'articleGlossary', '§9C.2', d, { why: 'twice', term });
          seen.add(term);
        }
      }
    }
    if (t === 'tableCell') {
      const extra = Object.keys(node).filter((k) => !CELL_KEYS.has(k));
      if (extra.length) add('error', 'articleHtmlTable', '§9C.2', node, { why: `cell property ${extra.join(', ')}` });
      const bad = (node.children || []).find((c) => !INLINE_CELL.has(c.type) && !(c.type === 'inlineMath' || c.type === 'link' || c.type === 'crossReference' || c.type === 'cite' || c.type === 'citeGroup' || c.type === 'mystRole' || c.type === 'image' || c.type === 'footnoteReference'));
      if (bad) add('error', 'articleHtmlTable', '§9C.2', node, { why: `a ${bad.type} in a cell (cells hold inline content only)` });
    }
    if (t === 'footnoteReference') { const k = node.label || node.identifier; if (!fnRefs.has(k)) fnRefs.set(k, node); }
    if (t === 'footnoteDefinition') {
      const k = node.label || node.identifier;
      if (fnDefs.has(k)) add('error', 'articleFootnoteDuplicate', '§9C.2', node, { name: k });
      else fnDefs.set(k, node);
    }
    for (const c of node.children || []) post(c, [...parents, node]);
  };
  function checkLabel(node, what) {
    const label = String(node.label);
    if (!LABEL_RE.test(label)) add('error', 'articleLabel', '§9C.3', node, { label, why: 'pattern' });
    // 節の id は sec- と base32（[a-z2-7]）の 6 字（§9C.3 の MUST）
    else if (what === 'section') { if (!label.startsWith('sec-')) add('error', 'articleLabel', '§9C.3', node, { label, why: 'section' }); else if (!SECTION_ID_RE.test(label)) add('error', 'articleSectionIdForm', '§9C.3', node, { label }); }
    else if (what === 'heading') { if (label.startsWith('sec-') && !SECTION_ID_RE.test(label)) add('error', 'articleLabel', '§9C.3', node, { label, why: 'section' }); else if (!label.startsWith('sec-') && RESERVED_PREFIX.test(label)) add('error', 'articleLabel', '§9C.3', node, { label, why: 'reserved' }); }
    else if (RESERVED_PREFIX.test(label)) add('error', 'articleLabel', '§9C.3', node, { label, why: 'reserved' });
  }
  post(tree, []);
  for (const [k, n] of fnRefs) if (!fnDefs.has(k)) add('error', 'articleFootnoteMissing', '§9C.2', n, { name: k });
  for (const [k, n] of fnDefs) if (!fnRefs.has(k)) add('warn', 'articleFootnoteUnused', '§9C.2', n, { name: k });
  // 参照のない脚注の定義は、myst-parser が黙って落とし、同じ名前の 2 つ目の定義も木に残らない：原稿の行から拾って知らせる（§9C.8）
  {
    let fence = null;
    const seen = new Set();
    lines.forEach((l, i) => {
      const f = l.match(/^\s*(`{3,}|~{3,})/);
      if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; return; }
      const d = !fence && l.match(/^ {0,3}\[\^([^\]\s]+)\]:/);
      if (!d) return;
      const k = d[1].toLowerCase();
      if (seen.has(k)) { if (!problems.some((p) => p.code === 'articleFootnoteDuplicate' && p.data.name.toLowerCase() === k)) add('error', 'articleFootnoteDuplicate', '§9C.2', i + 1 + off, { name: d[1] }); }
      else if (!fnDefs.has(d[1]) && !fnDefs.has(k)) add('warn', 'articleFootnoteUnused', '§9C.2', i + 1 + off, { name: d[1] });
      seen.add(k);
    });
  }
  // 図の alt（なければ警告。§9C.8 の SHOULD）
  visit(tree, (n) => { if (n.type === 'container' && n.kind === 'figure' && !n.subcontainer) for (const c of n.children || []) if (c.type === 'image' && !c.alt) add('warn', 'articleFigureAlt', '§9C.2', n, { label: n.label || null }); });
  for (const c of conversions) problems.push(P('warn', 'articleConverted', '§9C.2', c.line, { from: c.from, to: c.to }));
  return { fm: front.fm, tree, problems, conversions, lineOffset: off };
}

// 試験の比べ方（仕様の tools/test-fixtures.mjs と同じ）：position・key・html_id を外した木
export function fixtureTree(tree) {
  const DROP = new Set(['position', 'key', 'html_id']);
  return JSON.parse(JSON.stringify(tree, (k, v) => (DROP.has(k) || k.startsWith('__') ? undefined : v)));
}

// 青空文庫のルビ・傍点を Egatari Text に直す（§9C.2 の informative conversions）。返すもの：{text, conversions}
//   ｜下人《げにん》 → {ruby}`下人|げにん`、漢字の並び＋《よみ》 → 同じ、［＃「…」に傍点］ → 前の「…」を *…*
export function convertAozora(text) {
  const conversions = [];
  let out = text.replace(/[｜|]([^｜|《》\n]+)《([^《》\n]+)》/g, (m, b, r) => { conversions.push({ from: m, to: `{ruby}\`${b}|${r}\`` }); return `{ruby}\`${b}|${r}\``; });
  out = out.replace(/([々〆一-鿿㐀-䶿豈-﫿]+)《([^《》\n]+)》/g, (m, b, r) => { conversions.push({ from: m, to: `{ruby}\`${b}|${r}\`` }); return `{ruby}\`${b}|${r}\``; });
  out = out.replace(/([^\n]*?)［＃「([^」\n]+)」に傍点］/g, (m, before, w) => {
    const k = before.lastIndexOf(w);
    if (k < 0) return m;
    conversions.push({ from: `［＃「${w}」に傍点］`, to: `*${w}*` });
    return before.slice(0, k) + `*${w}*` + before.slice(k + w.length);
  });
  return { text: out, conversions };
}

// ---------------------------------------------------------------- 下回り
function P(sev, code, spec, line, data = {}) { return { sev, code, spec, line: line || null, data }; }
function C(line, from, to) { return { line, from, to }; }
export function visit(node, fn, parents = []) { fn(node, parents); for (const c of node.children || []) visit(c, fn, [...parents, node]); }
export function plain(node) { return node.type === 'text' || node.type === 'inlineCode' || node.type === 'inlineMath' ? String(node.value || '') : (node.children || []).map(plain).join(''); }
function findInside(node, types) { let r = null; for (const c of node.children || []) visit(c, (n) => { if (!r && types.includes(n.type)) r = n; }); return r; }
function findFigure(node) { let r = null; for (const c of node.children || []) visit(c, (n) => { if (!r && n.type === 'container' && n.kind === 'figure') r = n; }); return r; }
function kindOf(n) { return n.type === 'container' ? n.kind : n.type; }
function htmlHint(v) {
  const s = String(v).trim().toLowerCase();
  if (/^<sub>/.test(s)) return '{sub}`…`';
  if (/^<sup>/.test(s)) return '{sup}`…`';
  if (/^<table/.test(s)) return ':::{table} <caption>';
  if (/^<ruby>/.test(s)) return '{ruby}`base|reading`';
  return null;
}
function directiveHint(name) {
  if (ADMONITIONS.has(name)) return ':::{aside} <title>';
  if (name === 'math') return '$$…$$';
  if (name === 'list-table' || name === 'csv-table') return 'a pipe table in :::{table} (or an HTML table when it merges cells)';
  if (name === 'exercise-start' || name === 'solution-start') return `:::{${name.replace('-start', '')}}`;
  return null;
}
function roleHint(node) {
  const name = node.name, v = String(node.value || '');
  if (name === 'numref' || name === 'ref' || name === 'eq') return `[](#${(v.match(/<([^>]+)>$/) || [null, v])[1]})`;
  if (name === 'cite:p' || name === 'cite') return `[@${v.split(',').map((s) => s.trim()).join('; @')}]`;
  if (name === 'cite:t') return '@' + v.split(',')[0].trim();
  if (name === 'math') return '$…$';
  if (name === 'subscript') return '{sub}`…`';
  if (name === 'superscript') return '{sup}`…`';
  return null;
}
