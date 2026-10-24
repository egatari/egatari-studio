// 設定のファイル（FORMAT.CONFIG_FILE = egatari.json）を書き換える、ただ 1 つの道（format spec §3.3）。
// 仕様：ほかの作り手（producer）は自分の状態を自分の名前の項目 1 つに置いてよく、ほかの作り手と編集器はその項目を変えずに残し、意味を与えない。
// Studio が書くのは自分の項目（docId・metadata・attachments・components・themes・extensions）だけで、ほかの項目は読み直して書き直さない：
// 元の文字列のうち、変える項目の値だけを差し替える（ほかの項目はバイトのまま。項目の順も、空白も、数の書き方も変わらない。
// JSON.parse → JSON.stringify では大きな整数や 1e400 が変わり、"10" のような名前の項目が先頭に移る）。
//   updateConfig(oldText, patch)  新しい文字列。oldText：今のファイルの文字列（ないときは null・undefined）。
//                                 patch：{名前: 値}。値が undefined なら項目を消す。merge({…}) なら今の object の中を同じ規則で書き換える
//                                 （ないか object でなければ、その object にする）。ほかの値は置き換える（同じ値なら元のバイトのまま）。
//                                 今のファイルが JSON の object として読めなければ code 'bad-config' で断る（読めないものを上書きして消さない）
//   merge(obj)                    patch の値：object の中の項目だけを変える
//   configObject(text)            JSON の object として読む（読めなければ code 'bad-config'）。ないときは {}
// node: の読み込み・fs を使わない（編集アプリ・Worker・Node で同じもの）

class Merge { constructor(o) { this.o = o; } }
export const merge = (o) => new Merge(o);

const badConfig = (msg) => Object.assign(new Error(`egatari.json: ${msg}`), { code: 'bad-config' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function configObject(text) {
  if (text === null || text === undefined || text === '') return {};
  let v;
  try { v = JSON.parse(text); } catch (e) { throw badConfig(`not JSON (${e.message})`); }
  if (!isObj(v)) throw badConfig('not a JSON object');
  return v;
}

// merge を外した値（新しく書くとき）。undefined の項目は書かない
function plain(v) {
  if (v instanceof Merge) v = v.o;
  if (!isObj(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = plain(x);
  return out;
}

// 元の文字列の構造：object の項目の場所（名前の始まり・値の始まりと終わり）。値の中身は JSON.parse で確かめた後なので、ここでは区切りだけ見る
function scanner(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = () => { i++; while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1; i++; };
  function value() {
    ws();
    const start = i, c = text[i];
    if (c === '{') return object();
    if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return { kind: 'array', start, end: i }; }
      for (;;) { value(); ws(); if (text[i] === ',') { i++; continue; } i++; return { kind: 'array', start, end: i }; }
    }
    if (c === '"') { str(); return { kind: 'string', start, end: i }; }
    while (i < text.length && !',]} \t\n\r'.includes(text[i])) i++;
    return { kind: 'scalar', start, end: i };
  }
  function object() {
    const start = i, members = [];
    i++; ws();
    if (text[i] === '}') { i++; return { kind: 'object', start, end: i, members }; }
    for (;;) {
      ws();
      const keyStart = i; str();
      const key = JSON.parse(text.slice(keyStart, i));
      ws(); i++;   // :
      const v = value();
      members.push({ key, keyStart, value: v });
      ws();
      if (text[i] === ',') { i++; continue; }
      i++;
      return { kind: 'object', start, end: i, members };
    }
  }
  return value;
}

// pos のある行の頭の空白
function lineIndent(text, pos) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(ls, pos));
  return m ? m[0] : '';
}

// 新しい値の文字列。pretty なら 2 字下げで、続く行を ind だけ下げる。そうでなければ 1 行
const render = (v, ind) => (ind === null ? JSON.stringify(plain(v)) : JSON.stringify(plain(v), null, 2).replace(/\n/g, '\n' + ind));

// object（node）に patch を当てる編集 [{start, end, text}] を edits に足す
function patchObject(text, node, patch, edits) {
  const ms = node.members;
  const first = ms[0];
  const pretty = !first || /\n[ \t]*$/.test(text.slice(node.start + 1, first.keyStart));
  const objInd = lineIndent(text, node.start);
  const memInd = first && pretty ? lineIndent(text, first.keyStart) : objInd + '  ';
  const valInd = pretty ? memInd : null;
  const byKey = new Map(ms.map((m, i) => [m.key, i]));
  const del = new Set(), adds = [];
  for (const [k, v] of Object.entries(patch)) {
    const i = byKey.has(k) ? byKey.get(k) : -1;
    if (v === undefined) { if (i >= 0) del.add(i); continue; }
    if (i < 0) { if (!(v instanceof Merge && v.o === undefined)) adds.push(`${JSON.stringify(k)}: ${render(v, valInd)}`); continue; }
    const m = ms[i], raw = text.slice(m.value.start, m.value.end);
    if (v instanceof Merge && m.value.kind === 'object') { patchObject(text, m.value, v.o, edits); continue; }
    if (!(v instanceof Merge) && JSON.stringify(JSON.parse(raw)) === JSON.stringify(v)) continue;   // 同じ値：元のバイトのまま
    edits.push({ start: m.value.start, end: m.value.end, text: render(v, valInd) });
  }
  if (!del.size && !adds.length) return;
  const keep = ms.map((_, i) => i).filter((i) => !del.has(i));
  if (!keep.length) {
    // 項目が 1 つも残らない：object を作り直す（中の値の編集はない：消す項目の中は触らない）
    for (let e = edits.length - 1; e >= 0; e--) if (edits[e].start >= node.start && edits[e].end <= node.end) edits.splice(e, 1);
    edits.push({ start: node.start, end: node.end, text: adds.length ? (pretty ? `{\n${adds.map((a) => memInd + a).join(',\n')}\n${objInd}}` : `{${adds.join(', ')}}`) : '{}' });
    return;
  }
  // 消す：後ろに項目が残るものは次の項目の名前の前まで、最後から続けて消すものは残る最後の項目の値の後ろから
  const lastKeep = keep[keep.length - 1];
  for (const i of del) {
    if (i < lastKeep) edits.push({ start: ms[i].keyStart, end: ms[i + 1].keyStart, text: '' });
  }
  if (lastKeep < ms.length - 1) edits.push({ start: ms[lastKeep].value.end, end: ms[ms.length - 1].value.end, text: '' });
  // 足す：残る最後の項目の後ろに、同じ書き方で
  if (adds.length) edits.push({ start: ms[lastKeep].value.end, end: ms[lastKeep].value.end, text: adds.map((a) => (pretty ? `,\n${memInd}${a}` : `, ${a}`)).join('') });
}

export function updateConfig(oldText, patch) {
  if (oldText === null || oldText === undefined || oldText === '') return JSON.stringify(plain(patch), null, 2) + '\n';
  configObject(oldText);   // 読めないものは断る
  const root = scanner(oldText)();
  const edits = [];
  patchObject(oldText, root, patch, edits);
  if (!edits.length) return oldText;
  // 同じ場所では、足す（長さ 0）を先に
  edits.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  let out = '', at = 0;
  for (const e of edits) { out += oldText.slice(at, e.start) + e.text; at = Math.max(at, e.end); }
  return out + oldText.slice(at);
}
