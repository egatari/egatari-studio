// TTS に渡す文の前処理（合成の「作り方」。inputHash（何を言うか）にも ttsParts にも入れない。format spec §5.4）
//
// 規則 join-num-counter@1：算用数字（0-9・全角の０-９。小数 1.5 も）の直後の空白（ASCII の空白・全角の空白）を、
// そのすぐ後ろが日本語の文字（ひらがな・カタカナ・漢字）のときだけ取る。「1 歩」→「1歩」（空けたままだと TTS が「いちぽ」と読む）。
//   - 取る：「3 分」「10 本」「2 つ」「1.5 倍」「１０ 人」（全角の空白も）
//   - 取らない：数字の前の空白（「第 3 章」の「第」と 3 の間）、数字の後ろが日本語でないとき（「x 2 y」「Chapter 3 is」「3 + 4」「3 。」）、
//     タブ・改行・NBSP、数字のない空白。数字と日本語の間以外は一切変えない（数詞の読みの表は持たない）
// 版の名前は recipe.textNormalize に書く（どう作ったかの記録）。規則を変えたら版（@N）を上げる。編集アプリは版の古い音声を一覧にしない（#83。
// 将来、知らせを足すなら、版ではなく normalizeTtsText(text) !== text の段階だけを挙げる）。
// Python 版は colab/egatari_tts.py の normalize_tts_text（同じ共有の例 tools/fixtures/tts-normalize.json で突き合わせる）。
// 日本語の文字：ひらがな U+3041-3096・309D-309F、カタカナ U+30A1-30FA・30FC-30FF（ー を含み、中黒 ・ は含まない）、
// 々〆 U+3005-3006、漢字 U+3400-4DBF・4E00-9FFF・F900-FAFF
export const TEXT_NORMALIZE = 'join-num-counter@1';

const RE = /([0-9０-９])[ 　]+(?=[ぁ-ゖゝ-ゟァ-ヺー-ヿ々〆㐀-䶿一-鿿豈-﫿])/g;

export function normalizeTtsText(text) {
  return String(text).replace(RE, '$1');
}

