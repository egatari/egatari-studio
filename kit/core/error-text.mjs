// コンソールのエラー・例外の言葉を、品質チェックの知らせと AI への修正依頼に載せる形にする。Node にもブラウザにも依存しない（純粋な ESM）
//   cleanErrorText(text) → 1 行の言葉：スタックの行（"    at …"）を除き、ファイルの場所（file://…、一時フォルダ、手元のサーバーの
//     http(s)://localhost:… など）をファイルの名前だけにし、行と桁（:2582:20）を除く。中身の言葉は残す
//   componentError(text) → {tag, msg} | null：実行系の古い形の部品の例外（"M-CURVES TypeError: S.map is not a function"）
const STACK = /^\s*at\s|^\s*\(eval at |^\s*@|^\s*[\w$.<>]*@(?:file|https?|blob):/;
const LOCAL = /\bhttps?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(?::\d+)?/gi;
const FILE_URL = /\bfile:\/\/\/?[^\s)'"]*/gi;
const TEMP = /(?:\/private)?\/(?:var\/folders|tmp|temp)\/[^\s)'"]*|[A-Za-z]:\\[^\s)'"]*\\(?:Temp|tmp)\\[^\s)'"]*/gi;
const base = (p) => String(p).replace(/[?#].*$/, '').replace(/:\d+(?::\d+)?$/, '').split(/[\\/]/).filter(Boolean).pop() || '';

export function cleanErrorText(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const keep = lines.filter((ln) => ln.trim() && !STACK.test(ln));
  let s = (keep.length ? keep : lines.slice(0, 1)).join(' ').replace(/\s+/g, ' ').trim();
  s = s.replace(FILE_URL, (u) => base(u.replace(/^file:\/+/, '/')))
    .replace(TEMP, (p) => base(p))
    .replace(new RegExp(LOCAL.source + '(/[^\\s)\'"]*)?', 'gi'), (_, p) => (p ? base(p) : ''))
    .replace(/\b([\w.-]+\.(?:html|js|mjs))(?::\d+){1,2}\b/g, '$1')
    .replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

export function componentError(text) {
  const m = cleanErrorText(text).match(/^(?:\[[^\]]*\]\s*)?(M-[A-Z0-9-]+)\s+((?:Type|Range|Reference|Syntax)?Error:?\s.*)$/);
  return m ? { tag: m[1].toLowerCase(), msg: m[2] } : null;
}
