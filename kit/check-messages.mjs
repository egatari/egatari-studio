// 品質チェック（kit/check.mjs）の指摘の言葉（日本語・英語）。どの指摘も「何が違うか」と「どう直すか」を言い、規格があればその名前
// （docs/authoring-with-llms.md の R-…）を添える。どこか（スライドの番号・id・見出し、段階）は check.mjs が前に付ける
//   MESSAGES[code] = {rule?, ja(a), en(a)}    a はその知らせの値
//   where(lang, {n, id, title, step})         「スライド 3「見出し」（s-k3f9q2）、段階 2」 / "Slide 3 “Heading” (s-k3f9q2), step 2"
const mibOf = (n) => (n / 1048576).toFixed(1) + ' MiB';
// 添付（§3.8）の型と条件の言葉
const ROLE_JA = { source: '元の原稿', pdf: 'PDF', code: 'コード', data: 'データ', supplement: '補足資料' };
const ROLE_ALLOWED = {
  ja: { pdf: 'PDF', data: 'CSV・TSV・JSON・テキスト・xlsx', code: 'プログラムの原稿・テキスト・ipynb・環境の定義（requirements.txt・pyproject.toml・environment.yml など）', source: 'TeX・Markdown・テキスト（BibTeX など）・docx', supplement: 'PNG・JPEG・WebP・PDF・テキスト' },
  en: { pdf: 'PDF', data: 'CSV, TSV, JSON, text, xlsx', code: 'program source, text, ipynb, environment definitions (requirements.txt, pyproject.toml, environment.yml, …)', source: 'TeX, Markdown, text (e.g. BibTeX), docx', supplement: 'PNG, JPEG, WebP, PDF, text' },
};
const FORBID = {
  ja: { script: 'OS が実行する・スクリプトとして開く形式（.js・.bat・.ps1・.command など。JavaScript の原稿は .mjs・.cjs・.ts にする）', executable: '実行できるファイル', wasm: 'WebAssembly', 'office-legacy': '古い形式の Office（doc・xls・ppt）か RTF', 'office-macro': 'マクロを入れられる Office（docm・xlsm など）', html: 'HTML', svg: 'SVG', egatari: 'ほかの 1 ファイル（.ega.html）', archive: 'アーカイブ・入れ物（ZIP など）' },
  en: { script: 'a file type that operating systems run or open as a script (.js, .bat, .ps1, .command, …; attach JavaScript source as .mjs, .cjs or .ts)', executable: 'an executable', wasm: 'WebAssembly', 'office-legacy': 'a legacy Office document (doc, xls, ppt) or RTF', 'office-macro': 'a macro-enabled Office document (docm, xlsm, …)', html: 'HTML', svg: 'SVG', egatari: 'another single file (.ega.html)', archive: 'an archive or container (ZIP, …)' },
};
const UNSAFE = {
  ja: { javascript: 'PDF に JavaScript がある', 'auto-action': 'PDF に開いたときに動く、文書の中へ移る（GoTo）のほかの動作（OpenAction・AA）がある', action: 'PDF に、文書の中へ移る（GoTo）とリンクを開く（URI）のほかの動作がある', launch: 'PDF にほかのプログラムを起こす動作（Launch）がある', 'embedded-file': 'PDF にファイルが埋め込まれている',
    'active-content': 'PDF に動く中身（XFA・RichMedia）がある', macro: 'マクロ（vbaProject）がある', activex: 'ActiveX の部品がある', 'embedded-object': '埋め込んだ object（OLE など）がある',
    'external-link': '外のファイル・データへの参照（外部リンク）がある', 'external-data': '外のデータを取りにいく（接続・Web クエリ・WEBSERVICE などの関数）', dde: 'DDE を使う数式がある', 'field-code': '実行する・取りにいくフィールド（DDEAUTO・INCLUDETEXT など）がある', 'remote-template': '外のテンプレートを使う' },
  en: { javascript: 'the PDF contains JavaScript', 'auto-action': 'the PDF runs an action other than going to a place in the document (GoTo) when opened (OpenAction, AA)', action: 'the PDF has actions other than going to a place in the document (GoTo) and opening a link (URI)', launch: 'the PDF can launch programs (Launch)', 'embedded-file': 'the PDF carries embedded files',
    'active-content': 'the PDF has active content (XFA, RichMedia)', macro: 'the document contains macros (vbaProject)', activex: 'the document contains ActiveX controls', 'embedded-object': 'the document contains embedded objects (OLE, …)',
    'external-link': 'the document refers to external files or data (external links)', 'external-data': 'the document fetches external data (connections, web queries, functions such as WEBSERVICE)', dde: 'a formula uses DDE', 'field-code': 'a field code runs or fetches something (DDEAUTO, INCLUDETEXT, …)', 'remote-template': 'the document uses a remote template' },
};
const stepJa = (s) => (s === 'concl' ? '結論の段階' : `段階 ${s}`);
const stepEn = (s) => (s === 'concl' ? 'conclusion step' : `step ${s}`);

export function where(lang, { n, id, title, step }) {
  if (n === null || n === undefined) return lang === 'en' ? 'Whole deck' : 'デッキ全体';
  const st = step === null || step === undefined ? '' : (lang === 'en' ? ', ' + stepEn(step) : '、' + stepJa(step));
  return lang === 'en'
    ? `Slide ${n}${title ? ` “${title}”` : ''}${id ? ` (${id})` : ''}${st}`
    : `スライド ${n}${title ? `「${title}」` : ''}${id ? `（${id}）` : ''}${st}`;
}

export const MESSAGES = {
  // ---------------------------------------------------------------- 組み立て・id・鍵
  build: { ja: (a) => a.w + (/^narration: スライドが見つからない/.test(a.w) ? '：narration.md の「## 見出し」をスライドの見出しと同じ文字にするか、見出しの後ろに {#スライドの id} を書く（R-headings）' : ''),
    en: (a) => a.w + (/^narration: スライドが見つからない/.test(a.w) ? ': make the “## heading” in narration.md the same text as the slide heading, or end it with {#slide id} (R-headings)' : '') },
  slideId: { ja: (a) => a.msg, en: (a) => a.msg },
  legacyDataKey: { ja: (a) => `鍵「${a.key}」が手書きの data-key で決まっている（${a.line} 行目）：<section> に id を付ける（npm run ids）`, en: (a) => `the slide key “${a.key}” comes from a hand-written data-key (line ${a.line}): give the <section> an id (npm run ids)` },
  legacyIndex: { ja: (a) => `見出しも id もないので、鍵が位置の「${a.key}」になり、スライドを足すと変わる（${a.line} 行目）：<section> に id を付ける（npm run ids）`, en: (a) => `no heading and no id, so the key is the position “${a.key}” and changes when slides are added (line ${a.line}): give the <section> an id (npm run ids)` },
  narrHeadingDiffers: { ja: (a) => `narration.md ${a.line} 行目の見出し「${a.heading}」がスライドの見出し「${a.slide}」と違う（{#${a.id}} で対応しているので動きは変わらない）`, en: (a) => `the narration heading “${a.heading}” (narration.md line ${a.line}) differs from the slide heading “${a.slide}” (matched by {#${a.id}}, so nothing breaks)` },
  // ---------------------------------------------------------------- リンク
  linkFileMissing: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の先のファイル ${a.file} が作業フォルダから見つからない：ファイルを置くか、リンクを直す（1 ファイル（.ega.html）には入らない）`, en: (a) => `the link “${a.text}” (href="${a.href}") points to ${a.file}, which is not in the working folder: add the file or fix the link (it is not packed into the single file (.ega.html))` },
  linkEmpty: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）に行き先がない（# だけ）：href="#<スライドの id>" にする`, en: (a) => `the link “${a.text}” (href="${a.href}") has no target (only #): use href="#<slide id>"` },
  linkUnknown: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の行き先のスライド「${a.slide}」がない：あるスライドの id（npm run ids で付けたもの）を書く`, en: (a) => `the link “${a.text}” (href="${a.href}") points to slide “${a.slide}”, which does not exist: use the id of an existing slide (from npm run ids)` },
  linkNumberRange: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）のスライド ${a.slide} がない（${a.count} 枚）：スライドの id で #<id> と書く`, en: (a) => `the link “${a.text}” (href="${a.href}") points to slide ${a.slide}, but the deck has ${a.count}: link by slide id, #<id>` },
  linkNoConcl: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の先のスライド「${a.slide}」に結論（.concl）の段階がない：:concl を外すか、段階の番号にする`, en: (a) => `the link “${a.text}” (href="${a.href}") asks for the conclusion step of “${a.slide}”, which has none: drop :concl or use a step number` },
  linkStepRange: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の先のスライド「${a.slide}」に段階 ${a.step} がない（段階は 0〜${a.max}${a.concl ? '、結論は concl' : ''}）：ある段階にする`, en: (a) => `the link “${a.text}” (href="${a.href}") asks for step ${a.step} of “${a.slide}”, which has steps 0–${a.max}${a.concl ? ' and concl' : ''}: use an existing step` },
  linkBadStep: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の段階の鍵「${a.step}」が読めない：0・1・… か concl にする`, en: (a) => `the link “${a.text}” (href="${a.href}") has an unreadable step key “${a.step}”: use 0, 1, … or concl` },
  linkNumber: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）は番号なので、スライドを足すとずれる：スライドの id で #<id> と書く`, en: (a) => `the link “${a.text}” (href="${a.href}") uses a slide number, which shifts when slides are added: link by slide id, #<id>` },
  linkNoId: { ja: (a) => `リンク「${a.text}」（href="${a.href}"）の先のスライドに id がなく、見出しを直すと切れる：npm run ids で id を付けて #<id> と書く`, en: (a) => `the link “${a.text}” (href="${a.href}") targets a slide without an id, so it breaks when the heading changes: run npm run ids and link to #<id>` },
  linkCount: { ja: (a) => `スライドへのリンク：${a.ok} 本（ほかのファイルへ ${a.other} 本）`, en: (a) => `links to slides: ${a.ok} (to other files: ${a.other})` },
  // ---------------------------------------------------------------- 添付（attachments/。format spec §3.8）
  attachBadConfig: { ja: (a) => `egatari.json の attachments が読めない（${a.why}）：[{"path": "attachments/…", "role": "pdf", "title": "…"}] の形にする`, en: (a) => `attachments in egatari.json cannot be read (${a.why}): use [{"path": "attachments/…", "role": "pdf", "title": "…"}]` },
  attachBadName: { ja: (a) => `添付「${a.path}」の名前は使えない（${a.why}）：attachments/ の下の、ふつうの名前（.. ・ \\ ・ : * ? " < > | ・制御文字・末尾の点や空白・CON などの予約名なし）にする`, en: (a) => `the attachment name “${a.path}” is not allowed (${a.why}): use a plain name under attachments/ (no .., \\, : * ? " < > |, control characters, trailing dot or space, or reserved names such as CON)` },
  attachExcluded: { ja: (a) => `添付「${a.path}」は 1 ファイル（.ega.html）に入らない（${a.why}）：入れるなら名前を替える`, en: (a) => `the attachment “${a.path}” is left out of the single file (.ega.html) (${a.why}): rename it to include it` },
  attachDuplicate: { ja: (a) => `添付「${a.path}」が egatari.json に 2 度書いてある（「${a.other}」と同じ。大文字小文字は区別しない）：1 つにする`, en: (a) => `the attachment “${a.path}” is listed twice in egatari.json (same as “${a.other}”, ignoring case): keep one entry` },
  attachBadRole: { ja: (a) => `添付「${a.path}」の役割「${a.role}」は使えない：source・pdf・code・data・supplement のどれかにする（読み手の一覧に出ない）`, en: (a) => `the attachment “${a.path}” has the role “${a.role}”: use source, pdf, code, data or supplement (it is not listed for readers)` },
  attachBadTitle: { ja: (a) => `添付「${a.path}」の題（title）が使えない${a.why ? `（${a.why}）` : ''}：${a.max} 字までの 1 行にする（1 ファイルには入るが、読み手の一覧に出ない）`, en: (a) => `the title of the attachment “${a.path}” cannot be used${a.why ? ` (${a.why})` : ''}: use one line of at most ${a.max} characters (it is packed but not listed for readers)` },
  attachMissing: { ja: (a) => `egatari.json の添付「${a.path}」のファイルがない：attachments/ に置くか、項目を消す`, en: (a) => `the attachment “${a.path}” in egatari.json does not exist: put the file in attachments/ or remove the entry` },
  attachNoRole: { ja: (a) => `添付「${a.path}」に役割がない：egatari.json の attachments に {"path": "${a.path}", "role": "pdf"}（source・pdf・code・data・supplement）を書く（1 ファイルには入るが、読み手の一覧に出ない）`, en: (a) => `the attachment “${a.path}” has no role: add {"path": "${a.path}", "role": "pdf"} (source, pdf, code, data or supplement) to attachments in egatari.json (it is packed but not listed for readers)` },
  attachNoTitle: { ja: (a) => `添付「${a.path}」に題（title）がない：egatari.json の attachments の項目に "title": "…"（ダウンロードの一覧に出す短い名前）を書く（題は要る。1 ファイルには入るが、読み手の一覧に出ない）`, en: (a) => `the attachment “${a.path}” has no title: add "title": "…" (a short name for the download list) to its entry in egatari.json (a title is required; it is packed but not listed for readers)` },
  attachMedia: { ja: (a) => `添付「${a.path}」は${a.kind === 'video' ? '動画' : '音声'}（${a.by === 'content' ? '中身' : '名前'}から）：音声と動画は添付にできない（1 ファイルに入らない）。教材で鳴らすなら原稿から参照する`, en: (a) => `the attachment “${a.path}” is ${a.kind === 'video' ? 'a video' : 'audio'} (by its ${a.by === 'content' ? 'content' : 'name'}): audio and video cannot be attached (it is not packed); reference it from the slides if the lesson plays it` },
  attachType: { ja: (a) => a.role ? `添付「${a.path}」（.${a.ext}）は役割「${ROLE_JA[a.role] || a.role}」に入れられない（§3.8。この役割は ${ROLE_ALLOWED.ja[a.role] || '?'}）：役割を替えるか、許される形式にする（1 ファイルに入らない）` : `添付「${a.path}」（.${a.ext}）は添付にできない形式（§3.8 の役割ごとの形式のどれでもない）：PDF・CSV・テキスト・画像（PNG・JPEG・WebP）などにする（1 ファイルに入らない）`,
    en: (a) => a.role ? `the attachment “${a.path}” (.${a.ext}) is not allowed for the role ${a.role} (§3.8; this role takes ${ROLE_ALLOWED.en[a.role] || '?'}): change the role or the format (it is not packed)` : `the attachment “${a.path}” (.${a.ext}) is not a format that may be attached (none of the formats of §3.8): use PDF, CSV, text, images (PNG, JPEG, WebP) and so on (it is not packed)` },
  attachForbidden: { ja: (a) => `添付「${a.path}」は${FORBID.ja[a.kind] || a.kind}（${a.by === 'content' ? '中身' : '名前'}から）：§3.8 では添付にできない（開くと動くもの・入れ物は入れない。1 ファイルに入らない）`,
    en: (a) => `the attachment “${a.path}” is ${FORBID.en[a.kind] || a.kind} (by its ${a.by === 'content' ? 'content' : 'name'}): §3.8 does not allow it (nothing that runs when opened, no containers; it is not packed)` },
  attachMismatch: { ja: (a) => `添付「${a.path}」の中身が名前の形式（${a.kind}）と合わない${a.actual ? `（中身は ${a.actual}）` : ''}${a.why ? `（${a.why}）` : ''}：§3.8 では中身と形式が合うものだけを入れる。正しいファイルにする（1 ファイルに入らない）`,
    en: (a) => `the content of the attachment “${a.path}” does not match its format (${a.kind})${a.actual ? ` (it looks like ${a.actual})` : ''}${a.why ? ` (${a.why})` : ''}: §3.8 takes only files whose content matches their type; use the right file (it is not packed)` },
  attachPolyglot: { ja: (a) => `添付「${a.path}」はほかの形式（${a.also}）を重ねたファイル：§3.8 では添付にできない。元のファイルを書き出し直す（1 ファイルに入らない）`,
    en: (a) => `the attachment “${a.path}” is also ${a.also} (a file of two types): §3.8 does not allow it; export the original again (it is not packed)` },
  attachUnsafe: { ja: (a) => `添付「${a.path}」：${UNSAFE.ja[a.what] || a.what}${a.detail ? `（${a.detail}）` : ''}。§3.8 の条件に合わない：それを除いて保存し直す（PDF は印刷し直す・Office はマクロや外の参照を外す）（1 ファイルに入らない）`,
    en: (a) => `the attachment “${a.path}”: ${UNSAFE.en[a.what] || a.what}${a.detail ? ` (${a.detail})` : ''}, which §3.8 does not allow: save it again without that (print the PDF again; remove macros or external references in Office) (it is not packed)` },
  attachUnchecked: { ja: (a) => `添付「${a.path}」は中身を確かめられない（${a.why}）：§3.8 では確かめられないものは入れない。暗号化や特別な圧縮を外して保存し直す（1 ファイルに入らない）`,
    en: (a) => `the attachment “${a.path}” cannot be checked (${a.why}): §3.8 attachments are checked before packing; save it again without encryption or unusual compression (it is not packed)` },
  attachInjection: { ja: (a) => `添付「${a.path}」の ${a.n} 個の値が = + - @ やタブで始まり、表計算のソフトで数式として読まれうる${a.row ? `（最初は ${a.row} 行 ${a.col} 列）` : a.where ? `（${a.where}）` : ''}：意図したものか確かめる（入れる）`,
    en: (a) => `${a.n} value(s) in the attachment “${a.path}” start with = + - @ or a tab and may be read as formulas by a spreadsheet${a.row ? ` (first at row ${a.row}, column ${a.col})` : a.where ? ` (in ${a.where})` : ''}: check that this is intended (it is packed)` },
  attachPrivate: { ja: (a) => `添付「${a.path}」に${({ 'private key': '秘密鍵', 'access key': 'アクセスの鍵', 'password or token': 'パスワードかトークン', 'machine-specific path': 'この機械のパス' })[a.what] || a.what}らしい文字がある：配る前に確かめて消す（入れる）`,
    en: (a) => `the attachment “${a.path}” seems to contain a ${a.what}: check and remove it before sharing (it is packed)` },
  attachBadDescription: { ja: (a) => `添付「${a.path}」の説明（description）が使えない（${a.why}）：${a.max} 字までの 1〜2 文（改行なし）にする（説明なしで一覧に出す）`,
    en: (a) => `the description of the attachment “${a.path}” cannot be used (${a.why}): write one or two sentences, at most ${a.max} characters, without line breaks (listed without it)` },
  attachTooLarge: { ja: (a) => `添付「${a.path}」が大きすぎる（${mibOf(a.n)}。1 つ ${mibOf(a.max)} まで）：小さくするか、別の場所で配る（1 ファイルに入らない）`, en: (a) => `the attachment “${a.path}” is too large (${mibOf(a.n)}; at most ${mibOf(a.max)} each): make it smaller or share it elsewhere (it is not packed)` },
  attachTotal: { ja: (a) => `添付を合わせると大きすぎる（「${a.path}」で ${mibOf(a.n)}。合わせて ${mibOf(a.max)} まで）：減らす（この添付から後は 1 ファイルに入らない）`, en: (a) => `the attachments are too large together (${mibOf(a.n)} with “${a.path}”; at most ${mibOf(a.max)}): remove some (this one and later ones are not packed)` },
  attachCount: { ja: (a) => `添付が多すぎる（${a.max} 個まで）：「${a.path}」は 1 ファイルに入らない`, en: (a) => `too many attachments (at most ${a.max}): “${a.path}” is not packed` },
  attachList: { ja: (a) => `添付：${a.n} 個（${a.size}。読み手の一覧に ${a.listed} 個）。1 ファイル（.ega.html）の再生ではダウンロードだけで、再生専用（--play-only）には入らない`, en: (a) => `attachments: ${a.n} (${a.size}; ${a.listed} listed for readers). In the single file (.ega.html) they are download-only; play-only files (--play-only) do not carry them` },
  // ---------------------------------------------------------------- 体裁（はみ出し・字数・表記）
  titleLong: { rule: 'R-title', ja: (a) => `見出しが ${a.n} 字で長い（26 字まで。全角 1・半角 0.5）：「${a.t}」を短くするか、言いたいことを結論の行に移す`, en: (a) => `the heading has ${a.n} units, over 26 (full-width 1, ASCII 0.5): shorten “${a.t}” or move the point to the conclusion line` },
  titleLongEn: { rule: 'R-title', ja: (a) => `見出しが ${a.n} 文字で長い（英語は 60 文字まで）：「${a.t}」を短くする`, en: (a) => `the heading has ${a.n} characters, over 60: shorten “${a.t}”` },
  titleColon: { rule: 'R-title', ja: (a) => `見出し「${a.t}」がコロンで終わっている：コロンを取り、見出しだけで言い切る`, en: (a) => `the heading “${a.t}” ends with a colon: remove it and let the heading stand on its own` },
  tateTitle: { rule: 'R-title', ja: (a) => `縦組みの見出しが列に収まらない（${a.h}px > ${a.max}px。14 字ほどまで）：見出しを短くする`, en: (a) => `the vertical heading does not fit its column (${a.h}px > ${a.max}px, about 14 characters): shorten it` },
  conclLong: { rule: 'R-concl', ja: (a) => `結論の行が ${a.n} 字で長い（35 字まで）：「${a.t}」を 1 つの短い文にする`, en: (a) => `the conclusion line has ${a.n} units, over 35: make “${a.t}” one short sentence` },
  conclLongEn: { rule: 'R-concl', ja: (a) => `結論の行が ${a.n} 文字で長い（英語は 70 文字まで）：「${a.t}」を短くする`, en: (a) => `the conclusion line has ${a.n} characters, over 70: shorten “${a.t}”` },
  conclOverflow: { rule: 'R-concl', ja: () => '結論の行が枠からはみ出す：結論の行を短くして 1 行に収める', en: () => 'the conclusion line overflows its box: shorten it to one line' },
  bodyBottom: { rule: 'R-fit',
    ja: (a) => { const o = Math.ceil(a.px - a.lim), n = Math.max(1, Math.ceil(o / 46)); return `本文が下に ${o} px はみ出す（${a.px}px > ${a.lim}px${a.concl ? '、結論の行の上端は 571px' : ''}）：本文をおよそ ${n} 行（1 行 46 px）減らすか、部品を ${o} px 低くするか、スライドを 2 枚に分ける（字は縮めない）`; },
    en: (a) => { const o = Math.ceil(a.px - a.lim), n = Math.max(1, Math.ceil(o / 46)); return `the body overflows at the bottom by ${o} px (${a.px}px > ${a.lim}px${a.concl ? '; the conclusion line starts at 571px' : ''}): cut about ${n} line${n > 1 ? 's' : ''} (46 px each), make the component ${o} px lower, or split the slide in two (do not shrink text)`; } },
  bodyRight: { rule: 'R-fit', ja: (a) => `本文が右にはみ出す（${a.px}px > 1236px）：長い式や表を分けるか、横並び（.cols）の幅を見直す`, en: (a) => `the body overflows to the right (${a.px}px > 1236px): break the long equation or table, or rebalance the .cols widths` },
  tateBodyHead: { rule: 'R-fit', ja: (a) => `本文が見出しの列に重なる（${a.px}px > ${a.lim}px）：縦書きの本文を減らすか、スライドを分ける`, en: (a) => `the body runs into the heading column (${a.px}px > ${a.lim}px): cut the vertical text or split the slide` },
  bodyConclCol: { rule: 'R-fit', ja: (a) => `本文が結論の列に重なる（${a.px}px < ${a.lim}px）：縦書きの本文を減らすか、スライドを分ける`, en: (a) => `the body runs into the conclusion column (${a.px}px < ${a.lim}px): cut the vertical text or split the slide` },
  bodyLeft: { rule: 'R-fit', ja: (a) => `本文が左にはみ出す（${a.px}px < ${a.lim}px）：縦書きの本文を減らすか、スライドを分ける`, en: (a) => `the body overflows to the left (${a.px}px < ${a.lim}px): cut the vertical text or split the slide` },
  smallText: { rule: 'R-fit', ja: (a) => `字が小さい（${a.px}px：「${a.t}」。本文は 27px、表・図は 24px から）：font-size を書かず既定の大きさに戻し、入らなければスライドを分ける`, en: (a) => `text is too small (${a.px}px: “${a.t}”; body text needs 27px, tables and figures 24px): remove the font-size and split the slide if it does not fit` },
  smallSvgText: { rule: 'R-fit', ja: (a) => `図の中の字が小さい（${a.px}px、24px から）：字を 24px 以上に上げる。その場の <svg> なら viewBox を表示する画素で書く（viewBox の幅 = 表示の幅）か、font-size を 24 × viewBox の幅 ÷ 表示の幅 以上にする`, en: (a) => `text inside a figure is too small (${a.px}px, at least 24px): raise it to 24px or more; for an inline <svg>, write the viewBox in the pixels it is shown at (viewBox width = displayed width) or use font-size ≥ 24 × viewBox width ÷ displayed width` },
  desuMasu: { rule: 'R-style', ja: (a) => `スライドの字に です・ます がある（「${a.t}」）：スライドは常体（だ・である、体言止め）で書く。です・ます は口述原稿だけ`, en: (a) => `the slide text uses です・ます (“${a.t}”): write slides in plain style (だ・である or a noun ending); keep です・ます for the narration` },
  rawMath: { rule: 'R-math', ja: (a) => `数式が KaTeX で組まれずに残っている（「${a.t}」）：\\( … \\) か \\[ … \\] で囲み、$ … $ は使わない`, en: (a) => `math was left unrendered (“${a.t}”): wrap it in \\( … \\) or \\[ … \\], not $ … $` },
  katexError: { rule: 'R-math', ja: (a) => `KaTeX が式を組めない（「${a.t}」）：式の書き方を直す（< は \\lt、使えるマクロは \\hlE \\hlT \\hlM \\htmlId \\htmlData \\morph）`, en: (a) => `KaTeX cannot render an equation (“${a.t}”): fix its syntax (write < as \\lt; allowed macros are \\hlE \\hlT \\hlM \\htmlId \\htmlData \\morph)` },
  step0: { ja: (a) => `段階 0 の本文：「${a.t}」`, en: (a) => `body text at step 0: “${a.t}”` },
  punctMixed: { rule: 'R-style', ja: (a) => `句読点が混ざっている：${a.minor}が ${a.n} 個あり、デッキの多くは${a.major}：このスライドも${a.major}にそろえる`, en: (a) => `mixed punctuation: ${a.n} × ${a.minor} while most of the deck uses ${a.major}: use ${a.major} here too` },
  // ---------------------------------------------------------------- 口述原稿
  narrMissing: { rule: 'R-narr-steps', ja: (a) => `この段階の口述原稿がない：narration.md のこのスライドの節に [${a.step}] の行を書く（その段階で現れるものについて話す）`, en: (a) => `no narration for this step: add a [${a.step}] line to this slide’s section of narration.md (about what appears at that step)` },
  narrFormula: { rule: 'R-formula', ja: (a) => `口述原稿が式を読み上げている（「${a.t}」）：記号や演算子を書かず、式の意味を言葉で言う`, en: (a) => `the narration reads an equation aloud (“${a.t}”): say what it means in words, without symbols and operators` },
  narrLang: { ja: (a) => `口述原稿の言語（${a.lang}。${a.source === 'voice.json' ? 'voice.json の lang' : '発言の文字から'}）がスライドの言語（${a.deck}）と違う：式の読み上げと長い発言は、発言ごとにその言語の規則で見た`, en: (a) => `the narration language (${a.lang}, ${a.source === 'voice.json' ? 'from lang in voice.json' : 'from the text'}) differs from the slide language (${a.deck}): equations read aloud and long turns were checked with the rules of each turn's language` },
  turnLong: { ja: (a) => `1 回の発言が長い（${a.n} ${a.unit}）：2 つの発言か 2 つの段階に分けるとよい`, en: (a) => `a long turn (${a.n} ${a.unit === '字' ? 'characters' : 'words'}): consider splitting it into two turns or two steps` },
  // a = {step, line, end, range, static, keys, n, concl, target, lines: [{n, text}], comps: [部品の名前…]}（keys 以下は narration-lint の orphanDetail）
  narrOrphan: { rule: 'R-narr-steps',
    ja: (a) => {
      const L = a.end > a.line ? `${a.line}〜${a.end}` : `${a.line}`;
      if (!a.keys) return `口述原稿の [${a.step}] に当たる段階がスライドにない（narration.md ${L} 行目。このスライドの段階は ${a.range.ja}）：その行を前の段階に移すか、${a.step === 'concl' ? 'スライドに結論の行 <div class="concl"><span>…</span></div> を足す（noconcl・static を外す）' : a.static ? 'static を外して段階を付ける' : `スライドに data-step="${a.step}" の要素を足す`}`;
      const add = a.step === 'concl' ? 'スライドに結論の行 <div class="concl"><span>…</span></div> を足す（noconcl・static を外す）' : a.static ? 'static を外して段階を付ける' : `スライドに data-step="${a.step}" の要素を足す`;
      const lines = (a.lines || []).map((l) => `${l.n} 行目「${l.text.trim()}」`).join('、');
      return `口述原稿の [${a.step}] に当たる段階がスライドにない${a.line ? `（narration.md ${L} 行目）` : ''}。このスライドの段階は${a.static ? 'static なので 0 だけ' : `番号が 0〜${a.n}${a.concl ? ' と結論' : ''}`}で、使える鍵は ${a.keys.map((k) => `[${k}]`).join(' ')}。`
        + `直し方：(1) 行の頭の「[${a.step}]」を消し、その発言を前の段階 [${a.target}] の発言の後ろに続ける（前の段階に合わせる）か、(2) ${add}`
        + (lines ? `。直す行：${lines}` : '')
        + (a.comps && a.comps.length ? `。このスライドの部品 ${a.comps.map((t) => `<${t}>`).join('・')} はデータが合わず描けないので、その段階を数えていない：先に部品のデータを直す（R-components）` : '');
    },
    en: (a) => {
      const L = a.end > a.line ? `lines ${a.line}–${a.end}` : `line ${a.line}`;
      if (!a.keys) return `narration [${a.step}] has no matching step on the slide (narration.md ${L}; the slide has ${a.range.en}): move the line into an existing step, or ${a.step === 'concl' ? 'add a conclusion line <div class="concl"><span>…</span></div> (remove noconcl / static)' : a.static ? 'remove static and add steps' : `add an element with data-step="${a.step}"`}`;
      const add = a.step === 'concl' ? 'add a conclusion line <div class="concl"><span>…</span></div> to the slide (remove noconcl / static)' : a.static ? 'remove static and add steps' : `add an element with data-step="${a.step}" to the slide`;
      const lines = (a.lines || []).map((l) => `line ${l.n}: “${l.text.trim()}”`).join('; ');
      return `narration [${a.step}] has no matching step on the slide${a.line ? ` (narration.md ${L})` : ''}. The slide has ${a.static ? 'only step 0 (static)' : `steps 0–${a.n}${a.concl ? ' and concl' : ''}`}; the valid keys are ${a.keys.map((k) => `[${k}]`).join(' ')}. `
        + `Fix: (1) delete “[${a.step}]” at the start of the line and append its turns to the previous step [${a.target}] (merge into that step), or (2) ${add}`
        + (lines ? `. Lines to change: ${lines}` : '')
        + (a.comps && a.comps.length ? `. The component ${a.comps.map((t) => `<${t}>`).join(', ')} on this slide cannot draw its data, so its steps are not counted: fix its data first (R-components)` : '');
    } },
  readingExpr: { rule: 'R-reading', ja: (a) => `読みの指定 ${a.t} が式を読んでいる（narration.md ${a.line} 行目）：読みは 1 つの記号か用語だけに付け（{θ|シータ}）、式は意味を言葉で言う`, en: (a) => `the reading ${a.t} reads an expression (narration.md line ${a.line}): give readings to single symbols or terms only ({θ|theta}) and say the relation in words` },
  readingSeveral: { rule: 'R-reading', ja: (a) => `読みの指定 ${a.t} に記号が 2 つ以上ある（narration.md ${a.line} 行目）：記号ごとに分ける（{θ|シータ} と {η|イータ}）`, en: (a) => `the reading ${a.t} covers several symbols (narration.md line ${a.line}): give each symbol its own reading ({θ|theta} and {η|eta})` },
  // ---------------------------------------------------------------- 色・部品・注目の演出・モーフ・読み上げ
  palette: { ja: (a) => `パレット：${a.v} ${a.css} = rgb(${a.rgb})${a.ratio ? ` vs --bg → コントラスト ${a.ratio}:1` : ''}`, en: (a) => `palette: ${a.v} ${a.css} = rgb(${a.rgb})${a.ratio ? ` vs --bg → contrast ${a.ratio}:1` : ''}` },
  contrastLow: { rule: 'R-colors', ja: (a) => `${a.v} と --bg のコントラストが低い（${a.ratio}:1 < ${a.min}:1）：テーマの色を直す（デッキの中で色を書いていれば消し、テーマの class と変数だけを使う）`, en: (a) => `low contrast between ${a.v} and --bg (${a.ratio}:1 < ${a.min}:1): fix the theme colors (remove any colors written in the deck; use only theme classes and variables)` },
  compOrder: { ja: (a) => `部品の描画が呼び出し順に依存している（段階 ${a.k}）：render(k, t) が前の呼び出しの状態に頼らないように部品を直す（docs/contract.md §3）`, en: (a) => `the component draws differently depending on call order (step ${a.k}): make render(k, t) independent of previous calls (docs/contract.md §3)` },
  markMissing: { rule: 'R-marks', ja: (a) => `注目の演出 {mark:${a.id}} の目印がこのスライドにない：目印の要素に id="${a.id}" か data-mark="${a.id}" を付ける（式の一部は \\htmlId{${a.id}}{…}）か、{mark:…} を消す`, en: (a) => `the mark {mark:${a.id}} has no target on this slide: put id="${a.id}" or data-mark="${a.id}" on the element (\\htmlId{${a.id}}{…} in math), or remove the {mark:…}` },
  marks: { ja: (a) => `注目の演出：${a.list}`, en: (a) => `attention marks: ${a.list}` },
  morphNoSrc: { ja: (a) => `モーフの元のスライド「${a.want}」が見つからない：data-morph="元のスライドの id" にするか、空にして前のスライドから`, en: (a) => `the morph source slide “${a.want}” was not found: set data-morph to the source slide’s id, or leave it empty for the previous slide` },
  morphNoIds: { ja: (a) => `モーフ：元のスライド「${a.src}」と同じ data-id の要素がない：動かす要素の両方に同じ data-id を付ける（式の一部は \\morph{ID}{…}）`, en: (a) => `morph: no element shares a data-id with the source slide “${a.src}”: give the moving elements the same data-id on both slides (\\morph{ID}{…} in math)` },
  morphPairs: { ja: (a) => `モーフ（「${a.src}」から）：${a.ids}`, en: (a) => `morph (from “${a.src}”): ${a.ids}` },
  morphLater: { ja: (a) => `モーフ：段階 0 で見えないので動かさない：${a.ids}`, en: (a) => `morph: not moved because not visible at step 0: ${a.ids}` },
  morphDupSrc: { ja: (a) => `モーフ：元のスライドに data-id「${a.id}」が 2 つ以上ある（初めのものだけを使う）：1 つにする`, en: (a) => `morph: the source slide has data-id “${a.id}” more than once (only the first is used): keep one` },
  morphDupDst: { ja: (a) => `モーフ：data-id「${a.id}」が 2 つ以上ある（初めのものだけを使う）：1 つにする`, en: (a) => `morph: data-id “${a.id}” appears more than once (only the first is used): keep one` },
  imgAlt: { ja: (a) => `alt の無い画像が ${a.n} 枚（${a.list}）：内容を alt="…" に書く（飾りなら alt=""）`, en: (a) => `${a.n} image(s) without alt (${a.list}): describe them in alt="…" (alt="" if decorative)` },
  svgName: { ja: (a) => `名前の無い SVG の図が ${a.n} 個：aria-label="…" か <title>…</title> を付ける（飾りなら aria-hidden="true"）`, en: (a) => `${a.n} SVG figure(s) without a name: add aria-label="…" or <title>…</title> (aria-hidden="true" if decorative)` },
  compName: { ja: (a) => `名前の無い部品：${a.list}（読み上げ用に aria-label="…" を付けられる）`, en: (a) => `components without a name: ${a.list} (an aria-label="…" helps screen readers)` },
  timelineTotal: { ja: (a) => `タイムライン合計：${a.s} 秒（${a.n} 段階）`, en: (a) => `timeline total: ${a.s} s (${a.n} steps)` },
  slideLength: { ja: (a) => `この枚の長さ：${a.s} 秒`, en: (a) => `slide length: ${a.s} s` },
  compData: { rule: 'R-components',
    ja: (a) => `${compName(a, true)}のデータが合わない：${compWhat(a, true)}${compHow(a, true) ? `。${compHow(a, true)}` : ''}`,
    en: (a) => `${compName(a, false)} has data it cannot draw: ${compWhat(a, false)}${compHow(a, false) ? `. Write it like this: ${compHow(a, false)}` : ''}` },
  consoleError: { ja: (a) => `コンソールエラー：${a.e}（デッキの部品やスクリプトを直す）`, en: (a) => `console error: ${a.e} (fix the deck’s component or script)` },
};

// ---------------------------------------------------------------- 部品のデータ（kit/deck.js の DECK.componentErrors。形は kit/shape.js）
// a = {tag, label, index, kind, path, why, expected, got, key, near, keys, attrKeys, arrayKey, inner, msg, attr, dataLike, shape, example}
function compWhat(a, ja) {
  const p = (x) => (x ? x + (ja ? ' ' : '') : ja ? 'データ全体' : 'the data');
  const innerOf = (i) => (!i ? '' : i.why === 'unknown'
    ? (ja ? `${a.arrayKey}${i.path} の欄「${i.key}」はない${i.near ? `（${i.near} と書く）` : ''}` : `${a.arrayKey}${i.path}: there is no field “${i.key}”${i.near ? ` (write ${i.near})` : ''}`)
    : (ja ? `${a.arrayKey}${i.path} も違う（${i.expected} のはずが ${i.got}）` : `${a.arrayKey}${i.path} is also wrong (expected ${i.expected}, got ${i.got})`));
  switch (a.kind) {
    case 'shape':
      if (a.why === 'required') return ja ? `${p(a.path.replace(/\.?[^.[\]]+$/, ''))}に欄 ${a.key} がない（${a.expected}）` : `${p(a.path.replace(/\.?[^.[\]]+$/, ''))} has no field ${a.key} (${a.expected})`;
      if (a.why === 'unknown') return ja ? `欄「${a.path}」はない${a.near ? `（${a.near} のこと？）` : ''}。使える欄：${a.expected}` : `there is no field “${a.path}”${a.near ? ` (did you mean ${a.near}?)` : ''}; the fields are: ${a.expected}`;
      if (a.why === 'anyOf') return ja ? `${p(a.path)}に ${a.expected} のどちらかが要る（今は ${a.got}）` : `${p(a.path)} needs ${a.expected} (it is ${a.got})`;
      if (a.why === 'minItems') return ja ? `${p(a.path)}は ${a.n} 個以上要る（今は ${a.got}）` : `${p(a.path)} needs at least ${a.n} items (it is ${a.got})`;
      if (a.why === 'maxItems') return ja ? `${p(a.path)}は ${a.n} 個まで（今は ${a.got}）` : `${p(a.path)} takes at most ${a.n} items (it is ${a.got})`;
      if (a.keys && a.keys.length) {
        // 配列のはずが object：{"series": [...], "xr": [...]} のような形
        const extra = [];
        if (a.arrayKey) extra.push(ja ? `「${a.arrayKey}」という欄はない。その中の配列そのものをデータにする` : `“${a.arrayKey}” is not a field: make the array inside it the data itself`);
        if (a.attrKeys && a.attrKeys.length) extra.push(ja ? `${a.attrKeys.join('・')} は JSON ではなく <${a.tag}> の属性に書く（${a.attrKeys[0]}="…"）` : `${a.attrKeys.join(', ')} are attributes of <${a.tag}>, not JSON fields (${a.attrKeys[0]}="…")`);
        if (a.inner) extra.push(innerOf(a.inner));
        return ja ? `${p(a.path)}は配列（${a.expected}）のはずが ${a.got}${extra.length ? '：' + extra.join('。') : ''}` : `${p(a.path)} must be an array (${a.expected}) but is ${a.got}${extra.length ? ': ' + extra.join('; ') : ''}`;
      }
      return ja ? `${p(a.path)}は ${a.expected} のはずが ${a.got}` : `${p(a.path)} must be ${a.expected} but is ${a.got}`;
    case 'missing': return ja ? 'データ（子の <script type="application/json">）がない' : 'there is no data (child <script type="application/json">)';
    case 'json': return ja ? `データの JSON が読めない（${a.msg}）。JSON の書き方（" で囲んだ名前、最後の , なし）に直す` : `the data is not valid JSON (${a.msg}): fix the JSON syntax (quoted names, no trailing commas)`;
    case 'attrJson': return ja ? `属性 ${a.attr} の値が JSON として読めない（${a.msg}）` : `the attribute ${a.attr} is not valid JSON (${a.msg})`;
    case 'attr': return ja ? `属性 ${a.attr}${a.path ? ` の ${a.path}` : ''} は ${a.expected} のはずが ${a.got}` : `the attribute ${a.attr}${a.path ? ` at ${a.path}` : ''} must be ${a.expected} but is ${a.got}`;
    case 'notText': return ja ? 'この部品は JSON ではなく、要素の中に字で書く' : 'this component is written as text inside the element, not as JSON';
    case 'empty': return ja ? '要素の中に字がない' : 'there is no text inside the element';
    case 'notLinks': return ja ? 'この部品は JSON ではなく、子のリンク <a href> で書く' : 'this component is written as child <a href> links, not as JSON';
    case 'noLinks': return ja ? '子のリンク <a href> がない' : 'there are no child <a href> links';
    default: return a.dataLike
      ? (ja ? `部品が描けずに止まった（${a.msg}）。データの形が部品の形と合っていないときに出る誤り` : `the component stopped while drawing (${a.msg}); this usually means the data does not have the component’s shape`)
      : (ja ? `部品が描けずに止まった（${a.msg}）` : `the component stopped while drawing (${a.msg})`);
  }
}
function compHow(a, ja) {
  const ex = a.example ? (ja ? `例：${a.example}` : `example: ${a.example}`) : '';
  if (a.kind === 'attr' || a.kind === 'attrJson') return ex ? (ja ? `例：${a.attr}='${a.example}'` : `example: ${a.attr}='${a.example}'`) : '';
  if (a.shape) return ja ? `データの形は ${a.shape}${ex ? `。${ex}` : ''}` : `the data is ${a.shape}${ex ? `; ${ex}` : ''}`;
  return ex;
}
function compName(a, ja) {
  const n = a.index > 0 ? (ja ? `（${a.index + 1} 個目）` : ` (#${a.index + 1})`) : '';
  return ja ? `部品 <${a.tag}>${n}${a.label ? `「${a.label}」` : ''}` : `the component <${a.tag}>${n}${a.label ? ` “${a.label}”` : ''}`;
}

export function message(lang, code, a = {}) {
  const m = MESSAGES[code];
  if (!m) return code;
  const t = (lang === 'en' ? m.en : m.ja)(a);
  // 規格の名前は、言葉の中に書いていなければ最後に添える
  return m.rule && !t.includes(m.rule) ? t + (lang === 'en' ? ` (${m.rule})` : `（${m.rule}）`) : t;
}
