// 試験用の「人から届いた本」：markdown-it 13.0.2 の 2 乗の時間（kit/core/article-text.mjs の ARTICLE_LIMITS）を突く段落を、
// 本のある見本（tools/fixtures/article-book）の章に入れる。tools/test-article-export.mjs（build・ids）・tools/test-article-steps.mjs（check）・
// tools/test-app-book.mjs（編集アプリ）が使う
//   hostileChapters(dir)        作業フォルダ dir の article/01.md の節「2 つの代表値」に引用符の段落（GHSA-r7fv-28h4-cvq7 の形）を、
//                               article/09-answers.md の解答の指令の中に「<!--」の段落（GHSA-vfgh-jcmw-g37q の形）を足す。どちらも 1 ファイル 1 MiB の上限の手前まで
//                               返すもの：期待する指摘 [{file, line, what, heading}]（本の順）
//   hostilePortable(text)       本のある 1 ファイル（.ega.html の文字列）の原稿の 2 章を、同じ段落を足したものに差し替える（段 A の書き換え：
//                               組んだ本はそのまま。人が手で作ったファイルと同じく、組み立てを通らない）。返すもの：新しい文字列
import fs from 'node:fs';
import path from 'node:path';
import { ARTICLE_LIMITS } from '../kit/core/article-text.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';

const ROOM = ARTICLE_LIMITS.fileBytes - 4096;   // 章のほかの字の分を残す
const QUOTES = (() => { const k = Math.floor(ROOM / 6); return ' "a'.repeat(k) + " a'".repeat(k); })();
const TAGS = 'a <!-- '.repeat(Math.floor(ROOM / 7));
export const HOSTILE = Object.freeze({ quotes: QUOTES.trim(), tags: TAGS.trim() });

// 原稿の字を差し替える（行の番号は差し替えた後の原稿のもの）
function edit(text) {
  if (text.includes('## 2 つの代表値\n\n')) return text.replace('## 2 つの代表値\n\n', '## 2 つの代表値\n\n' + HOSTILE.quotes + '\n\n');
  if (text.includes(':::{solution} exr-mean\n')) return text.replace(':::{solution} exr-mean\n', ':::{solution} exr-mean\n' + HOSTILE.tags + '\n\n');
  return null;
}
const lineOf = (text, needle) => text.slice(0, text.indexOf(needle)).split('\n').length;
export function expected(texts) {
  return [
    { file: 'article/01.md', line: lineOf(texts['article/01.md'], HOSTILE.quotes.slice(0, 20)), what: 'quotes', heading: '2 つの代表値' },
    { file: 'article/09-answers.md', line: lineOf(texts['article/09-answers.md'], HOSTILE.tags.slice(0, 20)), what: 'html', heading: '解答' },
  ];
}

export function hostileChapters(dir) {
  const texts = {};
  for (const rel of ['article/01.md', 'article/09-answers.md']) {
    const f = path.join(dir, ...rel.split('/'));
    const t = edit(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    if (t === null) throw new Error(`hostile-book: ${rel} changed (the fixture no longer has the place to edit)`);
    fs.writeFileSync(f, t);
    texts[rel] = t;
  }
  return expected(texts);
}

export async function hostilePortable(text) {
  const r = await readPortable(text);
  const dec = new TextDecoder(), enc = new TextEncoder();
  const files = new Map(Object.entries(r.files));
  const texts = {};
  for (const rel of ['article/01.md', 'article/09-answers.md']) {
    const t = edit(dec.decode(files.get(rel)).replace(/\r\n/g, '\n'));
    if (t === null) throw new Error(`hostile-book: ${rel} changed (the fixture no longer has the place to edit)`);
    files.set(rel, enc.encode(t));
    texts[rel] = t;
  }
  const i = text.indexOf('<article id="egatari-article"'), j = text.indexOf('</article>\n</section>', i);
  const a = await tierA(text, files, { article: { html: text.slice(i, j + '</article>'.length) } });
  if (!a.ok) throw new Error(`hostile-book: tierA refused: [${a.code}] ${a.reason}`);
  return { html: a.html, expect: expected(texts) };
}
