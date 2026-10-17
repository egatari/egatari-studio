// 上限つきの HTML の解析（持ち運べる 1 ファイルの読み取り。format spec §11：確保の前に上限を確かめる）。
// parse5 の解析の規則（字句と木の組み立て）はそのままに、木を作る口（tree adapter）を差し替えて、解析の途中で上限を数える：
//   要素の数・属性の数・入れ子の深さ・残す文字の大きさ。超えたらその場で止める（全部の木を作ってから数えない）
// 残すのは watch(attrs) が真の要素の文字と位置だけで、ほかの文字・注釈の中身・位置は捨てる（木の形だけを保つ）。
// 何も実行しない（scriptingEnabled: false。DOMParser と同じ）。Node にもブラウザにも依存しない
//
//   boundedParse(text, {watch, limits, fail})
//     watch(attrs)  その要素の文字（直接の子の文字）と位置を残すか
//     limits        {elements, attributes, nesting, keptChars}
//     fail(code, message)  上限を超えたときに呼ぶ（投げること）
import { parse, defaultTreeAdapter as D } from 'parse5';

export const PARSE_LIMITS = Object.freeze({ elements: 200000, attributes: 400000, nesting: 512, keptChars: 128 * 1024 * 1024 });

export function boundedParse(text, { watch = () => false, limits = PARSE_LIMITS, fail } = {}) {
  const L = { ...PARSE_LIMITS, ...(limits || {}) };
  const stop = fail || ((code, message) => { throw Object.assign(new Error(message), { code }); });
  let elements = 0, attributes = 0, kept = 0;
  const countAttrs = (n) => { attributes += n; if (attributes > L.attributes) stop('too-complex', `the document has more than ${L.attributes} attributes`); };
  const depthOf = (parent, node) => {
    if (!node || !node.tagName) return;
    node.__d = (parent && parent.__d ? parent.__d : 0) + 1;
    if (node.__d > L.nesting) stop('too-complex', `elements are nested more than ${L.nesting} deep`);
  };
  // 文字：残す要素の子なら残す。ほかは中身のない文字の節を 1 つだけ置く（兄弟の並びを保つ。parse5 は直前の兄弟を文字の節として扱う）
  const keep = (parent, t) => { kept += t.length; if (kept > L.keptChars) stop('too-complex', 'the document keeps too much text'); };
  const adapter = {
    ...D,
    createElement(tagName, namespaceURI, attrs) {
      if (++elements > L.elements) stop('too-complex', `the document has more than ${L.elements} elements`);
      countAttrs(attrs.length);
      const el = D.createElement(tagName, namespaceURI, attrs);
      if (watch(attrs)) el.__w = true;
      return el;
    },
    createCommentNode() { return D.createCommentNode(''); },
    appendChild(parent, node) { D.appendChild(parent, node); depthOf(parent, node); },
    insertBefore(parent, node, ref) { D.insertBefore(parent, node, ref); depthOf(parent, node); },
    adoptAttributes(recipient, attrs) { countAttrs(attrs.length); D.adoptAttributes(recipient, attrs); },
    insertText(parent, t) {
      if (parent.__w) { keep(parent, t); return D.insertText(parent, t); }
      const last = parent.childNodes[parent.childNodes.length - 1];
      if (!(last && last.nodeName === '#text')) D.appendChild(parent, D.createTextNode(''));
    },
    insertTextBefore(parent, t, ref) {
      if (parent.__w) { keep(parent, t); return D.insertTextBefore(parent, t, ref); }
      const i = parent.childNodes.indexOf(ref), prev = parent.childNodes[i - 1];
      if (!(prev && prev.nodeName === '#text')) D.insertBefore(parent, D.createTextNode(''), ref);
    },
    // 位置は残す要素のものだけ（文字の節の位置も捨てる）
    setNodeSourceCodeLocation(node, loc) { if (node && node.__w) node.sourceCodeLocation = loc; },
    getNodeSourceCodeLocation(node) { return node ? node.sourceCodeLocation : undefined; },
    updateNodeSourceCodeLocation(node, end) { if (node && node.__w && node.sourceCodeLocation) node.sourceCodeLocation = { ...node.sourceCodeLocation, ...end }; },
  };
  return parse(String(text), { scriptingEnabled: false, sourceCodeLocationInfo: true, treeAdapter: adapter });
}
