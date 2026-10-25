// AI への指示の最後に付く「頼みたいこと」を、編集アプリの窓で先に埋める（app/llm.js の「新規作成…」→「チャットの AI に書いてもらう」の ①）。Node にもブラウザにも依存しない
// Claude などは長い貼り付けを添付のファイルの形にし、チャットの中では記入欄を直せない。そこで頼みたいことを窓で書き、指示の最後に入れてから写す。
// 記入欄の見出し・既定の値は指示の材料（tools/llm-guide/template*.md の「頼みたいこと」。kit/core/llm-pack.mjs の requestBody）から読む。
// 指示の本体（共通の本体・系列）はそのままで、最後の節だけを埋めたものに替える（指示の文章を変えないので、毎晩の評価の記録は動かない）
//
//   requestForm(lang) → {title, A: {head, fields: [{key, label, sep, value}]}, B: {head, text, fields: […]}}
//     A（新しく作る）の key：topic・audience・length・language・speakers・examples。B（渡した資料と話し合いの内容で作る）の key も同じ
//   filledRequest({kind: 'A' | 'B', values: {key: 文字列}}, lang) → 埋めた「頼みたいこと」（選ばなかった方と、空の項目は入れない）
//   packWithRequest({series, lang, request}) → buildPack と同じ組み立てで、最後の節を request（filledRequest の結果）に替えたもの。
//     request がなければ buildPack と同じ。plan：お使いの AI（'free' 既定 | 'paid'。kit/core/llm-pack-assemble.mjs）。exclude：使わせない部品（新規作成で外した言いたいこと。一覧と説明・表・見本から除く）。off：外した札（表の行を出さない）
import { PACK } from './llm-pack-data.mjs';
import { requestOf, packParts } from './llm-pack-assemble.mjs';

const KEYS = { A: ['title', 'audience', 'length', 'language', 'speakers', 'wishes'], B: ['title', 'audience', 'length', 'language', 'speakers', 'wishes'] };

export function requestForm(lang = 'en') {
  const lines = requestOf(PACK, lang).split('\n');
  const title = lines[0].replace(/^#\s+/, '');
  const out = { title };
  let cur = null;
  for (const ln of lines.slice(1)) {
    const h = ln.match(/^\*\*([AB])\.\s*(.+?)\*\*\s*$/);
    if (h) { cur = { head: `${h[1]}. ${h[2]}`, text: [], fields: [] }; out[h[1]] = cur; continue; }
    if (!cur) continue;
    const f = ln.match(/^-\s+(.+?)([：:])\s*(.*)$/);
    if (f) { cur.fields.push({ label: f[1], sep: f[2], value: f[3].trim() }); continue; }
    if (ln.trim()) cur.text.push(ln.trim());
  }
  for (const k of ['A', 'B']) {
    const s = out[k];
    if (!s || s.fields.length !== KEYS[k].length) throw new Error(`llm-request: the "${title}" section of the instructions (${lang}) does not have the expected fields for ${k}`);
    s.fields.forEach((f, i) => { f.key = KEYS[k][i]; });
    s.text = s.text.join('\n');
  }
  return out;
}

export function filledRequest({ kind = 'A', values = {} } = {}, lang = 'en') {
  const F = requestForm(lang);
  const s = F[kind === 'B' ? 'B' : 'A'];
  const rows = [];
  for (const f of s.fields) {
    const v = String(values[f.key] ?? '').replace(/\r\n?/g, '\n').trim();
    if (!v) continue;
    const [first, ...rest] = v.split('\n').map((x) => x.trim()).filter(Boolean);
    rows.push(`- ${f.label}${f.sep}${f.sep === ':' ? ' ' : ''}${first}` + rest.map((x) => `\n  ${x}`).join(''));
  }
  return [`# ${F.title}`, `**${s.head}**`, s.text, rows.join('\n')].filter(Boolean).join('\n\n') + '\n';
}

export function packWithRequest({ series = [], tools = [], lang = 'en', request = null, exclude = [], off = [], plan = 'free' } = {}) {
  const tail = request ? String(request).trim() : requestOf(PACK, lang);
  const parts = [...packParts(PACK, { series, tools, lang, exclude, off, plan }), tail].filter(Boolean);
  return parts.join('\n\n') + '\n';
}
