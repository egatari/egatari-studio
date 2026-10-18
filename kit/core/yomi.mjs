// 読み辞書（tts/yomi.yaml）の適用：tts/yomi.py の apply_yomi と同じ規則（同じ辞書なら TTS に渡す文字列が同じになる。
// tools/test-audio-core.mjs が Python の結果と比べる）。編集アプリのブラウザの TTS（app/audio-panel.js）が使う。node: を使わない
//   parseYomiTerms(yamlText) → [[語, 読み]…]（長い語から。yomi.yaml の terms だけを読む：「語: 読み」の行。# からは注）
//   applyYomi(text, terms) → {text, used: [...]}（日本語の字がない文には掛けない。より長い語の一部なら置き換えない）

const KANJI = /[一-鿿]/;            // yomi.py の _KANJI（[一-鿿]）
const JA_CHARS = /[ぁ-んァ-ヶ一-龥]/; // yomi.py の _JA_CHARS（[ぁ-んァ-ヶ一-龥]）
const asciiAlnum = (ch) => !!ch && /^[A-Za-z0-9]$/.test(ch);

// yomi.yaml の terms：「terms:」の後の、字下げした「語: 読み」の行（次の字下げしない行で終わる）。値の後ろの # は注
export function parseYomiTerms(text) {
  const out = [];
  let inTerms = false;
  for (const raw of String(text).split(/\r?\n/)) {
    if (/^\S/.test(raw)) { inTerms = /^terms\s*:\s*(#.*)?$/.test(raw); continue; }
    if (!inTerms) continue;
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^("?)(.+?)\1\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    out.push([m[2].trim(), m[3].trim().replace(/^"(.*)"$/, '$1')]);
  }
  // 長い語から（Python の sorted は安定：同じ長さは書いた順）。長さは Python の len（コードポイントの数）
  return out.map((t, i) => [t, i]).sort((a, b) => [...b[0][0]].length - [...a[0][0]].length || a[1] - b[1]).map((x) => x[0]);
}

function inLongerWord(term, before, after) {
  const first = [...term][0] || '', last = [...term].pop() || '';
  if (KANJI.test(first) && KANJI.test(before || '')) return true;
  if (KANJI.test(last) && KANJI.test(after || '')) return true;
  if (asciiAlnum(first) && asciiAlnum(before)) return true;
  if (asciiAlnum(last) && asciiAlnum(after)) return true;
  return false;
}

export function applyYomi(text, terms) {
  if (!JA_CHARS.test(text)) return { text, used: [] };
  const used = [];
  for (const [term, yomi] of terms) {
    if (!text.includes(term)) continue;
    const out = [];
    let i = 0;
    for (;;) {
      const j = text.indexOf(term, i);
      if (j < 0) { out.push(text.slice(i)); break; }
      // 前後の 1 字（コードポイント。サロゲートの対を割らない）
      const before = j > 0 ? String.fromCodePoint(text.codePointAt(j - 1 >= 1 && /[\udc00-\udfff]/.test(text[j - 1]) ? j - 2 : j - 1)) : '';
      const afterAt = j + term.length;
      const after = afterAt < text.length ? String.fromCodePoint(text.codePointAt(afterAt)) : '';
      if (inLongerWord(term, before, after)) out.push(text.slice(i, j + term.length));
      else { out.push(text.slice(i, j), yomi); used.push(`${term}→${yomi}`); }
      i = j + term.length;
    }
    text = out.join('');
  }
  return { text, used };
}
