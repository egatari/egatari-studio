// 組まれずに残った数式（品質チェックの rawMath）を見つける。kit/check.mjs がページに渡す（関数の外の名前を使わない）。
// \( と \[ はいつも数式の書き損じ。$ … $ は、中身が数式らしいときだけ（英語の金額 $200・$1.2M・$5–10・"costs $3 and $4"・US$ は数式でない）。
// 数式らしい：\ の命令、^、_、=、文字と演算子が隣り合う（x+1、2x-y）、1 文字の変数だけ（$x$）
// → {index, text} | null
export function findRawMath(txt) {
  const s = String(txt || '');
  const tex = s.search(/\\\(|\\\[/);
  if (tex >= 0) return { index: tex, text: s.slice(tex, tex + 24) };
  const mathy = (t) => /\\[A-Za-z]+|[\^_=]/.test(t) || /[A-Za-z]\s*[+\-*/<>]|[+\-*/<>]\s*[A-Za-z]/.test(t) || /^\s*[A-Za-z]\s*$/.test(t);
  const lines = s.split('\n');
  let off = 0;
  for (const line of lines) {
    // 開きの $：直後が数字（空白を挟んでも）・直前が US などの通貨の印なら金額として飛ばす
    const opens = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '$' || (i > 0 && line[i - 1] === '\\')) continue;
      const after = line.slice(i + 1), before = line.slice(Math.max(0, i - 2), i);
      // 金額：数字（と , .）のあとが空白・終わり・単位（K k M B bn m）・– - / ・句読点。$2x+1$ のように数字のすぐあとに文字や演算子が続けば数式
      if (/^\s*\d[\d.,]*(?:$|\s|(?:bn|[KkMBm])\b|[–\-/,.;:!?)）、。])/.test(after) || /^\s+\d/.test(after) || /[A-Z]{1,2}$/.test(before)) continue;
      opens.push(i);
    }
    for (let k = 0; k + 1 < opens.length; k++) {
      const a = opens[k], b = opens[k + 1], inner = line.slice(a + 1, b);
      if (inner.trim() && mathy(inner)) return { index: off + a, text: line.slice(a, Math.min(line.length, b + 1)).slice(0, 24) };
    }
    off += line.length + 1;
  }
  return null;
}
