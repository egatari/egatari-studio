<!-- i18n: pair=privacy.md sha256=7229345d21fdee1a -->
# プライバシー

[English](privacy.md) | 日本語

## このページについて

このページは、Egatari Studio（教材を作るアプリ。https://studio.egatari.org/）と、教材を再生するプレーヤー（Egatari Player）が、インターネットに何を送り、端末に何を残すかを説明します。

- 対象は、Studio、Studio が書き出す `.ega.html`（学習者に配るファイル）、再生専用ページの Egatari Viewer（https://viewer.egatari.org/）です。
- 書いてあるのは、プログラムの実際の動きです。広告や利用状況の計測は入っていません（探した範囲では見つかりません）。
- 学校の IT 担当の方が、通信を止めたり確かめたりできるように、止め方も書きます。
- コードの中の根拠（ファイルと行）は、英語版の[付録](privacy.md#appendix-evidence-in-the-code-for-maintainers)にあります。

## 教材のファイルはどこにあるか

- 教材は、あなたの PC のフォルダか、1 つのファイル（`.ega.html`）にあります。Studio は教材をサーバーに送りません。
- Studio のページは、外のサーバーへつなぐことを禁じる設定（CSP の `connect-src 'self'`）で動きます。つなげるのは Studio のサイト自身だけです。
- 編集中の控えは、あなたが選んだフォルダの中の `.cache/edits/` に書きます。上限は 30 個です。
- Google Colab を使う場合だけ、台本の文を自分で書き出して、自分で Colab に渡します（下の表）。

## インターネットに送るもの

「自動」は、ボタンを押さなくても起きるものです。「操作」は、あなたが押したときだけ起きるものです。

| 場面 | 送り先 | 送るもの | 止め方 |
|---|---|---|---|
| Studio のページを開く（自動） | studio.egatari.org（GitHub Pages で配信）。画面のプログラム・字体・版の一覧（`versions.json`）を、同じサイトから取る | 普通のページの取得と同じもの（IP アドレス、ブラウザの種類など。サイトを置いている GitHub と Cloudflare の記録は下の「サイトの記録」のとおり） | オフライン版のエディタ（`editor.html` を保存して開く）では、版の一覧を取りに行かない |
| AI 音声を「この PC」で作る（操作。初回は確認の画面あり） | モデルとライブラリの配信元：cdn.jsdelivr.net、huggingface.co、us.aws.cdn.hf.co（Hugging Face の配信用）。別の小さい窓で動く。読み込むプログラムは版を固定し、中身が変わっていないか照らしてから動かす（v0.6.6 から） | 取得のリクエストだけ。台本の文、教材の中身は送らない。文の合成はあなたの PC の GPU でする | 確認の画面で取り消す。使わなければ何も取らない。モデルは「使い方」の板から消せる |
| AI 音声を Google Colab で作る（操作。初回は確認の画面あり） | あなたが書き出した `tts-job.json` を、あなたが Colab の画面で選ぶ。Colab は Google のサービス | `tts-job.json`：台本の文（読みの辞書を通したもの）、声の名前、教材の題（120 字まで）、教材の ID、版。スライドやほかのファイルは含まない。声のクローン用に自分の参照音声を選んだ場合は、それも Colab に渡す | 「クラウドで作る」を使わない。録音か「この PC」を選ぶ |
| Colab の中（Colab が自動で） | GitHub（Studio のプログラムを取得）、PyPI・npm（ライブラリ）、Hugging Face と GitHub のリリース（モデル） | 取得のリクエスト。Google の環境の中の動き | 同上 |
| 「フィードバックを送る」を押す（操作） | github.com/egatari/egatari-studio/issues/new（新しい窓で開く。フォームは自分で送信するまで送られない） | フォームに最初から入る欄：版、ブラウザ名と大きな版、OS の種類、言語、モード。教材の中身は入らない | ボタンを押さない。`.ega.html` を書き出すときに `data-feedback="off"` を付けると、ボタンが出ない |
| 手引き・パーツの見本などのリンクを押す（操作） | github.com、studio.egatari.org、ライブのホストのページなど | 通常のリンクと同じ（行き先のサーバーが見るもの） | リンクを押さない |
| ライブ（質問・投票）を使う（参加者の操作。「参加する」を 1 回押す） | 教材に書いてあるライブのサーバー（既定は https://live.egatari.org。作成者が別のサーバーを指定できる） | 参加者が送ると決めた質問・投票、入力したときだけ名前、端末で作った乱数の ID、ping、参加コード（つないだ後の最初のやりとりで送る。接続のアドレスには入れない。v0.6.6 から）。見ている位置と時間は送らない | ライブを付けずに書き出す。学校の通信で、そのサーバーだけを止める |

メモ：
- 計測（アクセス解析）：探した範囲では、Studio にもプレーヤーにも、解析のプログラムや送信の呼び出しはありません。サイトを置いている GitHub と Cloudflare が残すアクセスの記録は、下の「サイトの記録」のとおりです。
- 音声のモデルを取る窓だけは、外のサーバーのスクリプトを読み込みます（版と中身を固定）。Studio 本体のページは読み込みません。

## 送らないもの

コードで確かめられた範囲：

- 教材のスライド・台本・音声・画像を、Studio のサーバーへ送ることはありません。保存や共有のしくみがありません。
- Studio のプレビューは、外へつなげない設定で動きます（`connect-src 'none'`）。
- 読み上げ（ブラウザの音声）は、端末の中の声だけを使います。ネットワークの声は選びません。
- 録音は端末の中で処理します。マイクは、録音のボタンを押したときだけ使います。
- `.ega.html` は、ライブがなければ、インターネットに何も送りません（下の節）。
- 学習者の閲覧位置・進み具合を、Egatari のサーバーへ送ることはありません。LMS の中で開いたときと、ほかのページに埋め込んだときだけ、そのページに渡します（下の節）。

## この端末に残すもの

すべてブラウザの中に残り、外へは出ません。ブラウザのサイトデータを消すと、なくなります。

| 場所 | 名前（キー） | 中身 | 消し方 |
|---|---|---|---|
| localStorage（Studio） | `motion-editor-lang` | 言語の選び（ja / en） | サイトデータを消す |
| localStorage（Studio） | `egatari-colab-privacy-ok` | 「台本を Google に渡すことの確認」を済ませた印 | 同上 |
| localStorage（Studio） | `egatari-rec-keep-recording` | 録音の設定（1 つの切り替え） | 同上 |
| localStorage（Studio） | `egatari-slides-open` | スライド一覧を開いていたか | 同上 |
| localStorage（Studio） | `egatari-studio-live-results-notice` | ライブの結果を取り込む説明を見せた印 | 同上 |
| sessionStorage（Studio） | `motion-editor-reopen` | 言語を替えた直後に教材を開き直すための印（タブを閉じると消える） | タブを閉じる |
| IndexedDB（Studio） | `motion-slides-editor` | 最近開いた教材のフォルダ・ファイルの「ハンドル」（最大 8 件）。中身は残さない | サイトデータを消す |
| IndexedDB（Studio） | `egatari-theme-folder` | テーマのフォルダのハンドル。「自分のテーマ」（`my:<名前>`）はテーマのファイルの中身ごと | 「自分のテーマ」の窓の「削除」、サイトデータを消す |
| Cache Storage（Studio の AI 音声の窓） | `irodori-lab-<版>`、`transformers-cache` | AI 音声のモデル（日本語は約 1.3 GB、英語は約 330 MB） | 「使い方」の板の「モデルを消す」 |
| あなたのフォルダの中 | `.cache/edits/` | 編集前の控え（上限 30 個） | フォルダから消す |
| localStorage（`.ega.html` のプレーヤー） | `deck-capsize` | 字幕の大きさ（S / M / L） | サイトデータを消す |
| localStorage（`.ega.html` のプレーヤー） | `<形式名>-player-bar-hint-v1` | 操作の案内を見せた印 | 同上 |
| localStorage（`.ega.html` のプレーヤー） | `<形式名>-player-progress:<教材>` | 教材ごとの進み具合（どのステップを再生したか・読んだか、終えたか） | 同上 |
| localStorage（`.ega.html` のプレーヤー） | `<形式名>-player-resume:<教材>` | 「前回の続きから」のための、教材ごとの読んでいた所（スライド・ステップ・本の窓の中の場所） | 同上 |
| localStorage（`.ega.html` のプレーヤー） | `<形式名>-player-layout:<教材>`、`<形式名>-player-split`、`<形式名>-player-read-size`・`-read-lh`・`-read-bg` | 選んだ並べ方、仕切りの位置、本の窓の文字サイズ・行間・背景 | 同上 |
| localStorage / sessionStorage（ライブのある `.ega.html`） | `egatari-live-pid:<ライブ ID>`、`egatari-live-joined:<ライブ ID>` | 端末で作った乱数の ID。参加したかの印（タブの間だけ） | サイトデータを消す、タブを閉じる |
| Egatari Viewer：OPFS（なければ IndexedDB） | `recent/`、DB `egatari-viewer` | 最近開いた教材ファイルの写し（最大 10 件）。この端末だけ | 一覧の「削除」、「すべて消す」、「共有の端末」のチェック |
| Egatari Viewer：localStorage | `egatari-viewer-keep`、`egatari-viewer-shared`、`egatari-viewer-lang`、`egatari-viewer-install-hint` | 写しを残すか、共有の端末か、言語、インストール案内を閉じたか | サイトデータを消す |
| Egatari Viewer：Cache Storage | `egatari-viewer-<版>` | 再生ページ自身のファイル（オフラインで開くため）。教材ファイルは入れない | サイトデータを消す |

メモ：
- 閲覧位置は、再生中のアドレスの `#` の後ろ（スライドの ID とステップ）に書き替えられます。「前回の続きから」のために、教材ごとに読んでいた所をこの端末に残します（上の表）。埋め込み・LMS の中・Studio のプレビューでは残しません。
- Egatari Viewer は、初期設定で最近開いた教材の写しを残します（「共有の端末」にチェックすると残さず、既存の写しも消す）。学校の共用端末では、チェックを入れるよう案内してください。

## 学習者に配ったファイル（プレーヤー）

- 書き出した `.ega.html` は、外へつなぐことを禁じる設定（CSP の `connect-src 'none'`）を持っています。画像・音・字体は、ファイルの中に入れたものだけを使います。
- ライブを付けたファイルだけが、そのライブのサーバーに限って接続できます。条件は次のとおりです。
  - ライブの時間の中であること。
  - ファイルを直接開いていること（LMS や別のページの枠の中では接続しません。枠の中では「ブラウザで参加する」のリンクが出るだけです）。
  - 参加者が「参加する」を 1 回押すこと。
- ? の一覧と発表者ビューにある「フィードバックを送る」は、押したときだけ GitHub の新しい窓を開きます。
- 教材の中の外へのリンクは、行き先を見せて確かめてから開きます。作成者が「埋め込み」（YouTube、Vimeo、Google Maps、OpenStreetMap）を入れた教材は、その行き先の表示を許す設定になり、教材を開いたときにその行き先から読み込まれることがあります。
- 進み具合の記録：LMS の中（SCORM 1.2）で開いたときは、進み具合（始めた・終えた、読んでいた所、どのステップを見たか、学習の時間）をその LMS に渡します。ほかのページに埋め込んだとき（`?embed=1`）は、同じ出来事を埋め込んだページに知らせます。どちらでもないときは、この端末に残すだけです（上の表）。

## 学校で使うときの確かめ方

CSP（通信の許可の設定）で確かめる方法：

1. `.ega.html` をテキストエディタで開く。`<head>` の最初のほうに `Content-Security-Policy` の `<meta>` が 1 つある。
2. その中の `connect-src` が `'none'` なら、そのファイルは外へつなげません。ライブ付きなら、`connect-src` に書かれた 1 つのサーバー（`https://…` と `wss://…`）だけです。
3. `frame-src` に YouTube などが足されていれば、その教材は埋め込みを使います。
4. Studio（studio.egatari.org）のページは、`default-src 'self'`、`connect-src 'self'`、`frame-src 'none'`。AI 音声の窓（`lab/tts-helper.html`）だけ、`cdn.jsdelivr.net`、`huggingface.co`、`us.aws.cdn.hf.co` だけへつなげる。
5. Egatari Viewer は、通信の許可を HTTP の見出し（`_headers`）で出す。つなげるのは自分自身と、ライブのサーバー（既定は live.egatari.org）だけ。

通信を止めたい場合：

- 学校のフィルタで、`cdn.jsdelivr.net`、`huggingface.co`、`us.aws.cdn.hf.co`、`colab.research.google.com`、`live.egatari.org` を止める。止めても、編集・保存・再生は動く。止まるのは「AI 音声をこの PC で作る」、Colab、ライブだけ。
- 通信なしで使うなら、`editor.html`（オフライン版のエディタ。1 つの HTML ファイル）を配る。AI 音声の「この PC」は使えない（録音や、事前に作った音声は使える）。
- 作った音声と書き出した `.ega.html` は、通信なしで動く（ライブなしの場合）。

## 問い合わせ

このページや使い方についての質問は、GitHub の [Issues](https://github.com/egatari/egatari-studio/issues) か [Discussions](https://github.com/egatari/egatari-studio/discussions) に書いてください。人に見られたくない相談（個人情報・安全の問題）は、GitHub の「非公開で報告する」（[Report a vulnerability](https://github.com/egatari/egatari-studio/security/advisories/new)）から送ってください。作成者だけが読みます。

## サイトの記録

サイトを置いている GitHub と Cloudflare は、ふつうのウェブサイトと同じく、アクセスの記録（IP アドレス、ブラウザの種類、開いたページなど）を残します。私たちはその記録を分析や広告には使わず、アクセス解析の仕組みも入れていません。

ライブのサーバー（live.egatari.org）が残すもの：ライブの中身（質問・投票・「わからない」の印、入力したときだけ名前、端末で作った乱数の ID）は、そのライブの中だけに置き、ライブの時間の終わりから猶予の時間（既定 24 時間。ライブを作るホストが 0〜7 日で選べる）が過ぎると自動で消えます。消えた後は、私たちは元に戻しません（クラウドの仕組みに一時的な控えが残る期間があっても、そこから戻すことはしません）。結果を残したいときは、猶予の間にホストのページから書き出してください。IP アドレス・ブラウザの情報・アクセスの記録は保存しません（リクエストの記録も切ってあります）。ライブを作るときだけ、作りすぎを防ぐために IP アドレスを使いますが、保存しません（Cloudflare の確認の仕組み Turnstile と回数の上限）。教材に別のライブのサーバーが書いてあるときは、そのサーバーの決まりに従います。
