// 品質チェックのコマンド版（kit/check.mjs）と編集アプリ（app/frame-shim.js・app/main.js・app/llm.js）の揃え方。tools/test-check-parity.mjs が使う
// コマンド版が出す code は、ここの CLI_ONLY にない限り、同じ教材で編集アプリも出す（v0.6.9：rawMath がコマンド版だけにあり、
// 規格の担当の評価は通るのに、Studio の利用者には見えず修正依頼にも入らなかった）。Node にもブラウザにも依存しない
//   CLI_ONLY         コマンド版だけの code → そのわけ（1 行）。前方一致の印は CLI_ONLY_PREFIX
//   EDITOR_ALIAS     編集アプリが前からの名前で出す code → コマンド版の code
//   BUILD_WARN       編集アプリが品質チェックの板の「組み立ての警告」（S.warn）に出すもの：コマンド版の code → その警告の行の形
//   cliOnly(code)    わけ（CLI_ONLY か CLI_ONLY_PREFIX）か null
export const CLI_ONLY = Object.freeze({
  balance: 'needs screenshots: it rasterizes the slide body to find the centre of mass (kit/fill-scan.mjs)',
  compOrder: 'needs screenshots: reopens the deck and compares renders of every component step in two orders (slow)',
  compOrderDetail: 'detail line of compOrder (screenshots)',
  compOrderNoise: 'detail line of compOrder (screenshots)',
  step0: 'info listing of what each slide shows at step 0, for reviewers; not a problem to fix',
  palette: 'info listing of the colour roles; the contrast findings themselves run in the editor (contrast)',
  marks: 'info listing of the marks per step; markMissing runs in the editor',
  timelineTotal: 'info listing of the deck length; not a problem to fix',
  slideLength: 'info listing of the slide lengths; not a problem to fix',
  fontNotCovered: 'info; measured on the subset fonts of the command-line build (the editor preview is not subset; saving warns with font-fallback)',
  linkFileMissing: 'needs the filesystem: checks that a linked file exists next to the deck',
  fontsExtraMissing: 'needs the @egatari/fonts-extra npm package on disk; the editor bundles its fonts',
  extensionVersion: 'info; reads extension versions from egatari.json on disk',
  'component-requires-missing': 'the build stops; the editor shows the same message as a build error',
  'component-not-in-catalogue': 'the build stops; the editor shows the same message (catalogueMessage) as a build error',
});
// 添付（attachments/）：編集アプリは「添付」の板とエクスポートで同じ決まり（kit/core/attachments.mjs）を見る。中身を全部読むので品質チェックには入れない。
// 本（article）：編集アプリは本の板（app/book.js）で同じ検査（kit/core/article.mjs の validateArticle）を見る
export const CLI_ONLY_PREFIX = Object.freeze({
  attach: 'needs the attachments/ folder on disk; the editor checks attachments in its Attachments panel and on export (same rules)',
  article: 'the editor validates the book in its Book panel (app/book.js, same validateArticle)',
});
export const EDITOR_ALIAS = Object.freeze({
  overflowBottom: 'bodyBottom', overflowRight: 'bodyRight', titleLong: 'titleLong', titleLongEn: 'titleLongEn', conclLong: 'conclLong', conclLongEn: 'conclLongEn',
  noNarration: 'narrMissing', orphanNarration: 'narrOrphan', contrast: 'contrastLow', audioStale: 'audio: stale',
});
export const BUILD_WARN = Object.freeze({
  build: /^(?!theme-metrics: |mark: 目印|slide key: )/,
  themeMetricsInvalid: /^theme-metrics: /,
});
// コマンド版の音声が古い段階（K）は code に言葉を入れている（'audio: stale — …'）：頭だけで比べる
export const cliCode = (code) => (/^audio: stale/.test(code) ? 'audio: stale' : code);
export function cliOnly(code) {
  if (Object.hasOwn(CLI_ONLY, code)) return CLI_ONLY[code];
  for (const [p, why] of Object.entries(CLI_ONLY_PREFIX)) if (code.startsWith(p) && code.length > p.length && /[A-Z]/.test(code[p.length])) return why;
  return null;
}
