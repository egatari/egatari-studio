// プレビューの文書を組む（編集アプリのプレビュー・発表者ビューとその中の画面。1 ファイル版の編集アプリも同じ）。
// 決まり（CSP）は、信頼する先頭部分（doctype・<html>・<head>・<meta charset>・CSP の <meta>・信頼する仲立ちのスクリプト）に置き、
// その後ろにデッキの文書（信頼しないバイト）をそのまま続ける。デッキの文書の中を探して入れる場所を決めることはしない
// （<!-- <head> --> や <template> の中の <head>、<head> より前のスクリプトに決まりを飲み込まれたり、追い越されたりしないように。format spec §11）。
// 続くデッキの doctype と <head> は HTML の解析の規則で無視され、<html> の属性（lang など）は先頭の <html> に移る。
// ブラウザの API を使わない（Node の試験からも読み込める）
//
// 'unsafe-eval'：部品庫が取り下げた版（v1.0.0・1.0.1 の m-sweep・m-curves は式を new Function で動かす）の部品のためだけに、この枠の決まりには残す
// （format spec §6：取り下げた版の再生は、エディタの origin から離した sandbox の枠の中でだけ。枠は allow-same-origin なしの sandbox で、
// 枠の中の eval はエディタのページ・保存先に届かない）。編集アプリのページ自身の決まり（app/index.html）は 'unsafe-eval' を持たない。
// srcdoc の枠は親のページの決まりを受け継ぎ、両方を満たす必要があるので、編集アプリの中ではこの許可は効かず、取り下げた版の式は eval できない
// （図の代わりの表示になる）。効くのは、親の決まりに eval を置かない枠のない文書（server/dev.mjs の /preview）
// プレビューの文書の決まり（アプリのページの決まりに重ねる）：外へ繋がらない（connect-src 'none'）。読み込めるのは data: と blob: だけ
// （デッキの組み立ては画像・字・CSS を data: で埋め込む）。iframe・フォーム・<base> も使えない
export const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

// 信頼する先頭部分。shimJs：先頭部分で実行系より前に動かす信頼するスクリプト（</script と <!-- を含まないこと）
export function trustedPrefix(shimJs = '') {
  if (/<\/script|<!--/i.test(shimJs)) throw new Error('trusted shim contains </script or <!--');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`
    + (shimJs ? `<script>${shimJs}</script>` : '');
}
// 信頼する先頭部分 + デッキの文書（そのまま）
export function previewDocument(untrusted, shimJs = '') {
  return trustedPrefix(shimJs) + String(untrusted);
}
