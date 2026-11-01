// 本文の点検（kit/core/article-text.mjs・article.mjs）の知らせの言葉（日本語・英語）。何が違うかと、どう直すか。
// 場所（ファイル・行）は articleWhere が前に付け、仕様の節（§9C.x）は後ろに付ける。check（kit/check-messages.mjs の MESSAGES）と build が使う
const hintJa = (a) => (a.hint ? `：${a.hint} と書く` : '');
const hintEn = (a) => (a.hint ? `: write ${a.hint}` : '');
const WHY_SUBFIG = {
  ja: { alt: '小さな図に :alt: がない', path: '小さな図に画像のパスがない', paragraph: '1 つの段落に画像を並べている（alt が見出しになって消える）。画像ごとに :::{figure} <パス> と :alt: を書き、外の図は ::::{figure} にする', count: '小さな図を持つ図に、:::{figure} <パス> が 2 つ以上ない' },
  en: { alt: 'a subfigure has no :alt:', path: 'a subfigure has no image path', paragraph: 'images side by side in one paragraph (their alt text would become captions): write one :::{figure} <path> with :alt: per image inside a ::::{figure}', count: 'a figure with subfigures needs two or more :::{figure} <path> inside' },
};
const WHY_GLOSS = {
  ja: { second: '用語集が 2 つ目（本文全体で 1 つまで）', body: '用語集の中は定義の並び（用語の行と「: 説明」の行）1 つだけ', markup: (a) => `用語「${a.term}」に飾り（強調など）がある：用語は飾りのない字で書く`, twice: (a) => `用語「${a.term}」が 2 度ある` },
  en: { second: 'a second glossary (one per article)', body: 'a glossary holds exactly one definition list (a term line, then ": description" lines)', markup: (a) => `the term “${a.term}” has markup: write terms as plain text`, twice: (a) => `the term “${a.term}” is listed twice` },
};
const WHY_LABEL = {
  ja: { pattern: '名前の書式（英字で始まり、英数字・_・- の 64 字まで）に合わない', reserved: 'sec-・s-・ref-・fn-・term-・egatari- で始まる名前は使えない（節の id・文献・脚注・用語に取ってある）。fig-・tbl-・eq-・box- などにする', section: '節（## の見出し）の id は sec- で始まる（npm run ids が付ける）' },
  en: { pattern: 'does not match the label pattern (a letter, then up to 63 letters, digits, _ or -)', reserved: 'labels may not start with sec-, s-, ref-, fn-, term- or egatari- (reserved for section ids, references, footnotes and terms): use fig-, tbl-, eq-, box-, …', section: 'a section id (on a ## heading) starts with sec- (npm run ids adds one)' },
};
const WHY_SOL = { ja: { missing: 'がない', 'not-exercise': 'は問（:::{exercise}）でない', twice: 'の解答が 2 つ目（1 つの問に 1 つまで）' }, en: { missing: 'does not exist', 'not-exercise': 'is not an exercise', twice: 'already has a solution (one per exercise)' } };
const WHY_STEP = {
  ja: (a) => (a.why === 'slide' ? 'のスライドがない' : a.why === 'not-id' ? 'のスライドの鍵がスライドの id でない（npm run ids で id を付ける）' : a.why === 'concl' ? 'のスライドに結論のステップがない' : `のステップがない${a.max !== undefined ? `（0〜${a.max}）` : ''}`),
  en: (a) => (a.why === 'slide' ? ': no such slide' : a.why === 'not-id' ? ': the slide key is not a slide id (add ids with npm run ids)' : a.why === 'concl' ? ': the slide has no conclusion step' : `: no such step${a.max !== undefined ? ` (0–${a.max})` : ''}`),
};
const ENC = { ja: { bom: '先頭に BOM がある（BOM なしの UTF-8 にする）', crlf: '改行が CRLF（LF にする）', nfc: 'Unicode の NFC になっていない（NFC で保存する）' }, en: { bom: 'starts with a BOM (save as UTF-8 without BOM)', crlf: 'has CRLF line endings (use LF)', nfc: 'is not in Unicode NFC (save it normalized to NFC)' } };

export const ARTICLE_MESSAGES = {
  articleEncoding: { ja: (a) => `本文のファイルが${ENC.ja[a.what]}`, en: (a) => `the article file ${ENC.en[a.what]}` },
  articleFrontMatter: { ja: (a) => `前付けの行「${a.text}」が読めない：1 行に「名前: 値」だけを書く`, en: (a) => `cannot read the front matter line “${a.text}”: write one “name: value” per line` },
  articleFrontMatterMember: { ja: (a) => `前付けの「${a.member}」は書けない（title・subtitle・lang・bibliography・writing-mode・chapter・kind・numbering だけ）`, en: (a) => `the front matter member “${a.member}” is not allowed (only title, subtitle, lang, bibliography, writing-mode, chapter, kind, numbering)` },
  articleFrontMatterValue: { ja: (a) => `前付けの ${a.member} の値「${a.value}」が違う（${{ string: '空でない字', lang: '言語の名前（ja・en など）', mode: 'horizontal-tb か vertical-rl', posint: '正の整数', kind: 'preface・chapter・appendix・afterword のどれか', boolean: 'true か false' }[a.expected]}）`, en: (a) => `front matter ${a.member}: “${a.value}” is not ${{ string: 'a non-empty string', lang: 'a language tag (ja, en, …)', mode: 'horizontal-tb or vertical-rl', posint: 'a positive integer', kind: 'one of preface, chapter, appendix, afterword', boolean: 'true or false' }[a.expected]}` },
  articleKindChapter: { ja: (a) => `kind: ${a.kind} のファイルに chapter（章の番号）がある：付録は A・B…と自動で振るので chapter を外す`, en: (a) => `a kind: ${a.kind} file states chapter: remove it (appendices are lettered A, B, … automatically)` },
  articleDirective: { ja: (a) => `{${a.name}} は Egatari Text の外の書き方${hintJa(a)}`, en: (a) => `{${a.name}} is outside Egatari Text${hintEn(a)}` },
  articleBacktickDirective: { ja: (a) => `{${a.name}} を「\`\`\`」で囲んでいる：指令は「:::」で囲む`, en: (a) => `{${a.name}} is fenced with backticks: fence directives with ::: (colons)` },
  articleOption: { ja: (a) => `{${a.name}} に :${a.option}: は書けない`, en: (a) => `{${a.name}} does not take the option :${a.option}:` },
  articleRole: { ja: (a) => `{${a.name}} は Egatari Text の外の書き方${hintJa(a)}`, en: (a) => `the role {${a.name}} is outside Egatari Text${hintEn(a)}` },
  articleHtml: { ja: (a) => `HTML「${a.html}」は書けない（:::{table} の中の表だけ）${hintJa(a)}`, en: (a) => `raw HTML “${a.html}” is not allowed (only a table inside :::{table})${hintEn(a)}` },
  articleHtmlTable: { ja: (a) => `HTML の表が決まりに合わない：${a.why}（使えるのは table・thead・tbody・tr・th・td、属性 colspan・rowspan・align、セルの中は字と em・strong・code・sub・sup・br だけ。空行・数式・Markdown は書けない）`, en: (a) => `the HTML table breaks the rules: ${a.why} (only table, thead, tbody, tr, th, td; attributes colspan, rowspan, align; cells hold text and em, strong, code, sub, sup, br; no blank lines, math or Markdown)` },
  articleComment: { ja: (a) => `「%」で始まる行（${a.text}）は MyST では消える：字として書くなら \\% と書く`, en: (a) => `a line starting with % (${a.text}) is a MyST comment and disappears: write \\% for the character` },
  articleBlockBreak: { ja: () => '「+++」（区切り）は書けない：外すか、--- （横線）にする', en: () => 'a block break (+++) is not allowed: remove it or use --- (a thematic break)' },
  articleSubstitution: { ja: (a) => `置き換え「${a.text}」は書けない：字をそのまま書く`, en: (a) => `the substitution “${a.text}” is not allowed: write the text itself` },
  articleStrike: { ja: (a) => `取り消し線「${a.text}」は書けない`, en: (a) => `strikethrough “${a.text}” is not allowed` },
  articleBareUrl: { ja: (a) => `URL「${a.url}」がリンクになっていない：<${a.url}> か [字](${a.url}) と書く`, en: (a) => `the URL ${a.url} is not a link: write <${a.url}> or [text](${a.url})` },
  articleTaskList: { ja: () => 'チェックの付く箇条書き（- [ ]）は書けない：普通の箇条書きにする', en: () => 'task lists (- [ ]) are not allowed: use a plain list' },
  articleHeadingLevel: { ja: (a) => (a.depth === 1 ? '「#」（第 1 段の見出し）は書けない：題は前付けの title に書き、節は ## から' : `「${'#'.repeat(a.depth)}」（第 ${a.depth} 段の見出し）は書けない：見出しは ##・###・#### まで`), en: (a) => (a.depth === 1 ? 'a level-1 heading (#) is not allowed: put the title in the front matter title and start sections at ##' : `a level-${a.depth} heading is not allowed: use ##, ### or ####`) },
  articleSectionId: { ja: (a) => `節「${a.heading}」（## の見出し）に id がない：npm run ids で (sec-…)= の行を付ける（自分で書かない）`, en: (a) => `the section “${a.heading}” (a ## heading) has no id: run npm run ids to add its (sec-…)= line (do not write ids by hand)` },
  articleSectionIdForm: { ja: (a) => `節の id「${a.label}」が決まりの形（sec- と英小文字・2〜7 の 6 字）でない：その (…)= の行を消して npm run ids で付け直す（参照も直す）`, en: (a) => `the section id “${a.label}” is not of the required form (sec- and 6 characters a–z, 2–7): delete its (…)= line, run npm run ids and update references to it` },
  articleLabel: { ja: (a) => `名前「${a.label}」：${WHY_LABEL.ja[a.why]}`, en: (a) => `the label “${a.label}” ${WHY_LABEL.en[a.why]}` },
  articleCiteKey: { ja: (a) => `引用の鍵「${a.key}」が鍵の書式に合わない（英数字と _、間に . : - 。64 字まで）`, en: (a) => `the citation key “${a.key}” does not match the key pattern (letters, digits, _, separated by . : -; up to 64)` },
  articleCitePrefix: { ja: (a) => `[@${a.key}] の前に字（${a.prefix}）がある：字は角かっこの外に書く`, en: (a) => `text before the key in the citation of ${a.key} (“${a.prefix}”): write the text outside the brackets` },
  articleCiteNarrativeLocator: { ja: (a) => `地の文の引用 @${a.key} の後ろに所在（ページなど）がある：[@${a.key}, p. 3] と書く`, en: (a) => `a narrative citation @${a.key} followed by a locator: write [@${a.key}, p. 3]` },
  articleImagePath: { ja: (a) => `画像「${a.url}」が作業フォルダの中のパスでない（URL・絶対パス・.. は使えない）：画像を作業フォルダに置き、images/… のように書く`, en: (a) => `the image “${a.url}” is not a path in the working folder (no URLs, absolute paths or ..): put the image in the folder and write e.g. images/…` },
  articleAsideTitle: { ja: () => 'コラム（:::{aside}）に題がない：:::{aside} 題 と書く', en: () => 'an aside has no title: write :::{aside} <title>' },
  articleAsideNested: { ja: () => 'コラムの中にコラムがある：入れ子にしない', en: () => 'an aside inside an aside: do not nest them' },
  articleNested: { ja: (a) => `${a.outer === 'aside' ? 'コラム' : '問'}の中に ${a.inner} は置けない`, en: (a) => `an ${a.outer} cannot hold a ${a.inner}` },
  articleAsideClass: { ja: (a) => `コラムの :class: の名前「${a.cls}」は英小文字・数字・- だけ（例：inquiry、goals）`, en: (a) => `the aside class “${a.cls}” must be lowercase letters, digits and - (e.g. inquiry, goals)` },
  articleProofKind: { ja: (a) => `定理の類の種類 prf:${a.kind} は Egatari Text 1 にない（theorem・lemma・definition など 15 種）`, en: (a) => `prf:${a.kind} is not a theorem-like kind of Egatari Text 1 (theorem, lemma, definition, … 15 kinds)` },
  articleFootnoteContent: { ja: (a) => `脚注 [^${a.name}] の中に ${a.what} がある：脚注は段落だけ`, en: (a) => `the footnote [^${a.name}] holds a ${a.what}: footnotes hold paragraphs only` },
  articleFootnoteMissing: { ja: (a) => `脚注 [^${a.name}] の定義がない：[^${a.name}]: 本文 の行を足す`, en: (a) => `the footnote [^${a.name}] has no definition: add a line [^${a.name}]: text` },
  articleFootnoteUnused: { ja: (a) => `脚注 [^${a.name}] の定義がどこからも参照されていない（表示されない）`, en: (a) => `the footnote definition [^${a.name}] is never referenced (it is not shown)` },
  articleFootnoteName: { ja: (a) => `脚注の名前「${a.name}」は英数字・_・- だけ`, en: (a) => `the footnote name “${a.name}” must be letters, digits, _ and -` },
  articleFootnoteDuplicate: { ja: (a) => `脚注 [^${a.name}] の定義が 2 つある`, en: (a) => `the footnote [^${a.name}] is defined twice` },
  articleRuby: { ja: (a) => `ルビ「${a.value}」：{ruby}\`字|よみ\` と書く（字とよみは空でなく、よみに | を入れない）`, en: (a) => `ruby “${a.value}”: write {ruby}\`base|reading\` (both non-empty, no | in the reading)` },
  articleStepSyntax: { ja: (a) => `ステップへのリンク「${a.value}」：{step}\`<スライドの id>:<ステップ>\` か {step}\`字 <スライドの id>:<ステップ>\` と書く（ステップは 0・1・…・concl）`, en: (a) => `step link “${a.value}”: write {step}\`<slide id>:<step>\` or {step}\`text <slide id>:<step>\` (step 0, 1, … or concl)` },
  articleSubfigure: { ja: (a) => WHY_SUBFIG.ja[a.why], en: (a) => WHY_SUBFIG.en[a.why] },
  articleFigureAlt: { ja: (a) => `図${a.label ? `（${a.label}）` : ''}に :alt: がない：見えない人のために図の中身を書く`, en: (a) => `the figure${a.label ? ` ${a.label}` : ''} has no :alt: — describe the image for readers who cannot see it` },
  articleGlossary: { ja: (a) => { const w = WHY_GLOSS.ja[a.why]; return typeof w === 'function' ? w(a) : w; }, en: (a) => { const w = WHY_GLOSS.en[a.why]; return typeof w === 'function' ? w(a) : w; } },
  articleSolutionLabel: { ja: () => '解答（:::{solution}）に問の名前がない：:::{solution} exr-… と書く', en: () => 'a solution names no exercise: write :::{solution} exr-…' },
  articleConverted: { ja: (a) => `${a.from} を ${a.to} に直して読んだ（原稿も直す）`, en: (a) => `read ${a.from} as ${a.to} (fix the source too)` },
  articleIndex: { ja: (a) => (a.why === 'both' ? 'article.md と article/ の章のファイルの両方がある：1 つのファイルか章に分けるかのどちらかにする' : '本文のファイルがない（index.article に path も chapters もない）'), en: (a) => (a.why === 'both' ? 'both article.md and chapter files in article/: use one file or chapters, not both' : 'index.article has neither path nor chapters') },
  articleRead: { ja: (a) => `本文のファイルが読めない：${a.why}`, en: (a) => `cannot read the article file: ${a.why}` },
  articleTooLarge: { ja: (a) => `本文のファイルが大きすぎる（${a.bytes} 字、${a.max} まで）：章に分ける`, en: (a) => `the article file is too large (${a.bytes} characters, up to ${a.max}): split it into chapters` },
  articleChapterNumber: { ja: () => '章のファイルに chapter（章の番号）がない：前付けに chapter: 番号 を書く', en: () => 'a chapter file has no chapter number: add chapter: <n> to its front matter' },
  articleChapterTitle: { ja: () => '章のファイルに title（章の題）がない：前付けに title: 題 を書く', en: () => 'a chapter file has no title: add title: <title> to its front matter' },
  articleChapterIncrease: { ja: (a) => `章の番号 ${a.chapter} が前の章（${a.before}）より大きくない：読む順（ファイルの名前の順）に大きくする`, en: (a) => `chapter ${a.chapter} does not follow chapter ${a.before}: numbers must increase in reading order (file name order)` },
  articleChapterOrder: { ja: (a) => `kind: ${a.kind} のファイルの順が違う：前書き・章・付録・後書きの順にファイルの名前を付ける`, en: (a) => `the kind: ${a.kind} file is out of order: name the files so that prefaces, chapters, appendices and afterwords come in that order` },
  articleChapterDiffer: { ja: (a) => `章のファイルで ${a.member} が違う（${a.values.join('・')}）：すべての章で同じにする`, en: (a) => `${a.member} differs between chapter files (${a.values.join(', ')}): use the same value in every chapter` },
  articleLang: { ja: (a) => `前付けの lang（${a.lang}）が教材の言語（${a.deck}）と違う：同じにするか、lang を外す`, en: (a) => `front matter lang (${a.lang}) differs from the lesson language (${a.deck}): make them equal or remove lang` },
  articleBibliography: { ja: (a) => `前付けの bibliography（${a.value}）が文献のファイル（${a.references || 'なし'}）と違う：references.json にするか外す`, en: (a) => `front matter bibliography (${a.value}) is not the references file (${a.references || 'none'}): use references.json or remove it` },
  articleLabelDuplicate: { ja: (a) => `名前「${a.label}」が 2 度使われている（${a.other}${a.otherLine ? ` ${a.otherLine} 行目` : ''}）：本文全体で 1 つにする`, en: (a) => `the label “${a.label}” is used twice (also ${a.other}${a.otherLine ? ` line ${a.otherLine}` : ''}): labels are unique in the whole article` },
  articleLabelSlideId: { ja: (a) => `名前「${a.label}」がスライドの id と同じ：別の名前にする`, en: (a) => `the label “${a.label}” is also a slide id: rename it` },
  articleXref: { ja: (a) => `相互参照 [](#${a.label}) の行き先がない：ある名前（:label: や (…)= で付けたもの）を書く`, en: (a) => `the cross-reference [](#${a.label}) points to no label: use a label given with :label: or (…)=` },
  articleSolution: { ja: (a) => `解答の問「${a.label}」${WHY_SOL.ja[a.why]}`, en: (a) => `the solution's exercise “${a.label}” ${WHY_SOL.en[a.why]}` },
  articleTerm: { ja: (a) => (a.glossary ? `用語「${a.term}」が用語集にない：用語集に足すか、字を合わせる` : `用語「${a.term}」を使っているが用語集（:::{glossary}）がない`), en: (a) => (a.glossary ? `the term “${a.term}” is not in the glossary: add it or match the spelling` : `the term “${a.term}” is used but there is no glossary (:::{glossary})`) },
  articleStep: { ja: (a) => `ステップへのリンク ${a.value} ${WHY_STEP.ja(a)}`, en: (a) => `the step link ${a.value}${WHY_STEP.en(a)}` },
  articleCite: { ja: (a) => (a.why === 'no-references' ? `引用 @${a.key} があるが文献のファイル（references.json）がない` : `引用の鍵 @${a.key} が references.json にない`), en: (a) => (a.why === 'no-references' ? `the citation @${a.key} needs a bibliography, but there is no references.json` : `the citation key @${a.key} is not in references.json`) },
  articleReferences: { ja: (a) => `references.json が読めない（${a.why}）：CSL-JSON の配列にする`, en: (a) => `cannot read references.json (${a.why}): it must be a CSL-JSON array` },
  articleImage: { ja: (a) => `画像 ${a.path} が作業フォルダにない`, en: (a) => `the image ${a.path} is not in the working folder` },
  articleDataArticle: { ja: (a) => `スライド ${a.slide} の data-article の節「${a.section}」が本文にない`, en: (a) => `slide ${a.slide}: data-article names “${a.section}”, which is not a section of the article` },
  articleSummary: { ja: (a) => `本文：ファイル ${a.files}、節 ${a.sections}、名前 ${a.labels}`, en: (a) => `article: ${a.files} file(s), ${a.sections} section(s), ${a.labels} label(s)` },
  articleSectionUnlinked: { ja: (a) => `節「${a.heading}」（${a.section}）がどのスライドともつながっていない（{step} のリンクか、スライドの data-article で結ぶ）`, en: (a) => `the section “${a.heading}” (${a.section}) is linked to no slide (add a {step} link or name it in a slide's data-article)` },
};

// 1 つの知らせの言葉：場所（ファイル・行）＋言葉＋（§…）
export function articleMessage(lang, p) {
  const m = ARTICLE_MESSAGES[p.code];
  const en = lang === 'en';
  const body = m ? (en ? m.en : m.ja)(p.data || {}) : p.code;
  return `${articleWhere(lang, p)}${body}${p.spec ? (en ? ` (${p.spec})` : `（${p.spec}）`) : ''}`;
}
export function articleWhere(lang, p) {
  if (!p.file) return '';
  return lang === 'en' ? `${p.file}${p.line ? ` line ${p.line}` : ''}: ` : `${p.file}${p.line ? ` ${p.line} 行目` : ''}：`;
}
