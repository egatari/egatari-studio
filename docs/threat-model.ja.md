<!-- i18n: pair=threat-model.md sha256=0fe2a0dbbb51ec13 -->
# 脅威モデル

[English](threat-model.md) | 日本語

Egatari Studio が何を、誰から、どのコードで守っているかの短い地図。[SECURITY.md](../SECURITY.md)（仕組みと受け入れた残余リスクの全体）と [contract.ja.md](contract.ja.md) §11（Live）の要約で、食い違うときはそれらとコードが正しい。いま作ってあるものを書いたもので、将来の保証ではない。

## 守るもの

- Egatari ファイルや作業フォルダを開く・編集する・ビルドする人のコンピューター上のファイル（作業フォルダの外、編集アプリ自身の保存領域とフォルダのハンドル）。
- 台本などのファイルの内容。この文書が示す場所以外では、作成者の PC の外に出ないこと。
- Studio が作って配布するものの完全性（編集アプリのサイト、リリースの資産、同梱のパーツ）。

## 前提

- 作業フォルダはソースコードのリポジトリと同じに扱う。ビルド・品質チェック・配信は、信頼できるファイルにだけ行う（[SECURITY.md](../SECURITY.md)「Trust model: a deck is code」）。
- ローカルのコンピューターと、そこで動く他のプロセスは信頼する。ツールの実行中に別のユーザーやプロセスがフォルダを書き換えることは対象外（SECURITY.md「Residual risks」）。
- コマンドラインや環境変数で自分が指定するもの（作業フォルダのパス、`--theme`、`-o`、`EGATARI_THEMES`、`IRODORI_URL`）は信頼する。

## 1. 作ったファイル：プレビューの iframe の中の信頼できない HTML

**脅威。** スライド（や編集アプリに貼った AI の出力、ダウンロードした Egatari ファイル）は、インラインのスクリプトとパーツを含む HTML である。ファイルの読み書き、ネットワークへの接続、編集 UI の操作、編集 UI のなりすましを試みうる。

**取ってある対策。**
- 編集中、スライドは不透明なオリジンの sandbox 付き iframe（`sandbox="allow-scripts allow-modals"`、`allow-same-origin` なし）で動き、Content-Security-Policy は `connect-src 'none'`、ほかの資源は `data:` / `blob:` に限る（編集アプリは `app/preview-doc.js` の `PREVIEW_CSP`、開発サーバーは `server/dev.mjs`。開発サーバーは自分の `/deck/audio/` も許す）。
- スライドが送信できるのはヒントだけ（`server/hints.js`）で、書き込む文字は運べない。編集 UI はスライドの外で動き、ソースを自分で読み、「保存」を押したときだけ書く。編集アプリは、コードを含むファイルを動かす前に確認し、「コードがあるか」はEgatari ファイルの申告ではなくビルド後の中身で決める（`kit/core/code-scan.mjs`）。
- 読み込みは上限つきの読み手を通す（`kit/bounded-read.mjs`、`app/bounded-read.js`。`tools/test-raw-reads.mjs` が直接の読み込みを見張る）。ビルドは作業フォルダの外に出るパス（`../`、絶対パス、シンボリックリンク）を断り、include・埋め込み・数式・全体の大きさに上限がある。書き込みは `kit/safe-fs.mjs` を通す。添付はダウンロード専用で、実行しない。
- 編集アプリのページ自身は `eval` を禁じている（`'unsafe-eval'` なし）。
- 開いた作業フォルダや Egatari ファイルの本（`article.md`・`article/`）の本文は、CLI でも編集アプリでも、本の読み手にとって信頼できない入力である（`kit/core/article-text.mjs`）。どちらも markdown-it 14.3.3 を含む同じ本のツール一式を使い、13.0.2 にあった 5 つの勧告に対応している。myst のパッケージと markdown-it は開発用の依存であり、インストールした `egatari` の `npm audit` には脆弱性が出ない（SECURITY.md）。二重の備え（defence in depth）として、段落の上限も保つ。本のファイルの大きさは、それぞれ 1 MiB まで。1 つの段落に引用符（`"` と `'`）が 512 個、またはタグの始まり（`<!`・`<?`）が 64 個を越えると、読む前に断る（`articleUnsafeParagraph`）。再生では本文を読まない。Egatari Viewer と Egatari ファイルのプレーヤーには myst-parser と markdown-it は含まれない。

**対策の外。** ファイル自身のコードはプレビューの中で動き、スライドの領域には何でも描ける（偽の編集カードも）。信頼できるのは編集アプリ自身のパネルの操作だけ。開発サーバーのスライドの文書と `PREVIEW_CSP` は、取り下げ済みのパーツを動かし続けるため `'unsafe-eval'` を残している。資源の使い方は予算で縛るもので、プロセス全体のメモリや時間までは縛らない。`kit/check.mjs`・`tools/pdf.mjs`・`render/`・テストは、ヘッドレス Chrome でスライドのコードを動かす（SECURITY.md）ので、信頼できるファイルにだけ使う。

## 2. ローカルで開く再生専用ファイル

**脅威。** 参加者が、他人から受け取った `.ega.html` や再生専用のコピー（`--play-only`）を `file:` で開く。

**取ってある対策。** 再生専用のコピーにはソースがなく、スライドと音声だけで、オフラインで再生できる。ローカルの素材は data URI として埋め込む。Egatari ファイルの添付は開かず実行もしない。プレーヤーは、索引のハッシュ・大きさ・SHA-256 を確認したうえで `application/octet-stream` としてダウンロードを出すだけ。実行ファイル・スクリプト・HTML・SVG・アーカイブ・マクロ付き Office ファイルは、詰めるステップで断る（`kit/core/attach-content.mjs`）。ファイルの外へ出るリンクは、ファイルのウィンドウを動かさない。プレーヤーが行き先のホストとアドレス全体を表示し、**開く** を押したときだけ、新しいタブに `noopener,noreferrer` で開く。リンクの文字が別のホストを名乗るとき、`https:` でないとき、ファイルを保存させるときは毎回確認し、`javascript:`・`data:`・`file:` などは断る（`kit/core/link-policy.mjs`、規約 §9、Egatari Player P4.2）。ファイルを枠の中で再生するページは、ファイルからの `openLink` の依頼（プレーヤーの仕様 P8）に、自分の表示で同じ決まりを当てる。

**対策の外。** 再生専用ファイルも、開けばブラウザの中でスクリプトが動くページである。コピーの作者が名乗る人かどうかは、コピーからは分からない。信頼できる人のファイルだけを開くか、sandbox つきの枠の中で開く。作者がファイルに残した `http(s)` の参照は取り除かれない（ビルドは、完全なオフラインではないと警告する）。添付を保存して開いた後のふるまいは Egatari の外。

## 3. Live：ネットワークはライブの時間の中だけ

**脅威。** サーバーに接続する Egatari ファイルは、参加者がいることや入力を漏らしたり、意図しないサーバーに向けられたりしうる。

**取ってある対策**（`kit/core/live-policy.mjs`、`kit/live.js`、`kit/core/live.mjs`。contract.ja.md §11）。
- プレーヤーを持つのは、ライブを付けてエクスポートした再生専用のコピーだけ。ほかの出力は変わらない。
- endpoint は、認証情報・パス・クエリ・フラグメントのない `https:` のオリジンでなければならない（`parseEndpoint`）。ループバックの `http:` を許すのは、テストが使う開発用のバージョンだけ（`live-policy.mjs` の定数）。配布するプレーヤー・編集アプリのエクスポート・`kit/build.mjs --live` は許さない。
- プレーヤーが接続するのは、参加する人が「参加する」を押した後、`inWindow` が真（ライブの時間。両端に 2 分のゆとり）のとき、最上位の `file:`・`content:`・`http(s):` の文書からだけ（`docContext`）。枠・sandbox の文書・編集アプリのプレビュー・開発サーバーのプレビューでは、接続せずにライブのアドレスを文字で表示する。迷ったら接続しない。
- エクスポートしたファイルには、CSP の `<meta>` がちょうど 1 つあり、その `connect-src` が endpoint の `https://` と `wss://` の形そのものでなければならない（`connectSrc`・`cspOk`。すでに CSP のあるファイルは `kit/core/live.mjs` が断る）。WebSocket の URL は endpoint と同じオリジンにしか作らない（`socketUrl`・`sameEndpoint`）。
- 再接続はライブの時間の外では止まり（`plan` が `window_over`）、サーバーの停止の番号でも止まる。待ち時間はバックオフとゆらぎをつける。
- 参加コードはファイルに保存しない（`validate` がファイルの `live.key` を断る）。エクスポートしたコピーだけに含まれる。参加用のリンクでは `#` の後ろに置くので、アドレスとしてサーバーには送信されない（`joinUrl`）。

**対策の外。** エクスポートしたコピーを持つ人は参加コードを持ち、ライブの時間の間は参加できる。漏れたコピーは「参加コードを変える」で締め出す。ライブに送信する内容（質問・投票）は、選んだ Live のサーバーに届く。その守りは、このリポジトリではなく [egatari/live](https://github.com/egatari/live) のもの。

## 4. Colab での音声合成

**脅威。** 台本の文章が Google の環境に出ていく。返ってくる音声の ZIP ファイルは外から来たデータである。

**取ってある対策**（docs/editor.md「Make AI voice in the cloud (Google Colab)」、`kit/core/colab-core.mjs`）。
- エクスポートする前に 1 度、編集アプリが確認する。Colab では台本が Google の環境で処理され、モデルのファイルは Hugging Face から来るため。`tts-job.json` に含まれるのは、読む文章・声の名前・各ステップの `inputHash`・`docId`・目標のレシピだけ。
- 返ってくる ZIP ファイルは信頼しない。確保の前に上限を確認し（ZIP ファイル 512 MiB、音声 1 つ 64 MiB、`records.json` 4 MiB、ステップは 400 まで）、zip64・暗号化・未知の圧縮は断る。読むのは `records.json` と `audio/<名前>.wav` だけで、名前をチェックし、音声は記録の長さの WAV として復号できなければならず、ZIP ファイルの中身を HTML やコードとして解釈しない。編集アプリは、ノートブックを信じずに、いまの台本から各 `inputHash` を計算し直し、ほかのファイルのために作った ZIP ファイル（`docId` が違う）は断る。
- ノートブックのリンクは、リリースのタグに固定してある。

**対策の外。** Google と Hugging Face が文章やモデルのファイルをどう扱うか。Colab の確認は、docs に書いた 1 つの環境でしか取れていない。

CLI の `egatari tts` は作成者が選んだ音声合成サーバーへ台本の文章を送り、ローカルでないときは送信先のホストを表示する。

## 5. サプライチェーン

**脅威。** 悪意のある・脆弱な依存・パーツ・ワークフローのアクションが、利用者やリリースに届く。

**取ってある対策。**
- 実行時の依存は少なく、`package.json` でバージョンを固定し、CI は `package-lock.json` から `npm ci --ignore-scripts` でインストールする。依存のインストールのスクリプトは走らない（ただ 1 つある esbuild の `postinstall` は要らない。それと Colab の例外は SECURITY.md に書いた）。
- Dependabot は、新しいバージョンが出てから 7 日（メジャーバージョンは 14 日）待ってから提案する（`.github/dependabot.yml` の `cooldown`）。セキュリティの更新は待たない。
- CI は修正の入った Node（2026-10-20/21 のセキュリティリリースの 22.23.4・24.22.1 以降）で走る。ランナーにたまたまあるバージョンは使わない（SECURITY.md）。
- レジストリのパーツは [egatari/components](https://github.com/egatari/components) のリリースのコピーを同梱する。`npm run components:update` は、リリースの `manifest.json`（SHA-256）と tarball・全ファイルを突き合わせ、すでにあるバージョンは置き換えない。ビルドはパーツをネットワークから取らず、`npm run components:check`（`gen:check` の一部）が `vendor/components` と `components.lock.json` を比べる。取り下げ済みのバージョン（v1.0.0・v1.0.1）は、警告つきでしかビルドせず、黙っては使わない。
- 編集アプリのページは、MP3 エンコーダを自分のサイトからしか読まない。ブラウザ内の音声合成のウィンドウ（`lab/tts-helper.html`）は、固定したバージョンのライブラリを jsDelivr から、モデルを Hugging Face から読む。編集アプリと同じオリジンで、lab ページと同じく信頼しているため、そこでの侵害されたファイルは編集アプリの保存領域に届きうる。jsDelivr のコードはバージョンだけでなく中身でも固定する：モジュールは import map の `integrity`、WebAssembly は `integrity` を付けた `fetch` で確認する（SHA-384。`lab/tts-engine.mjs`）。Kokoro の重み・設定・声は、固定したバージョンから取り、SHA-256 で確認する。import map が効いていなければ読まない。このページの決まりに `'unsafe-eval'` はなく、接続先は jsDelivr・`huggingface.co`・`us.aws.cdn.hf.co` だけ（`tools/test-lab-csp.mjs`。SECURITY.md）。
- GitHub のワークフローは、すべて最小権限の `permissions:` を宣言する。CodeQL（`codeql.yml`）、high 以上の `npm audit --omit=dev`（`audit.yml`。`tools/audit-check.mjs` を通し、勧告の例外は設けない）、OpenSSF Scorecard（`scorecard.yml`）、npm と GitHub Actions の Dependabot（`.github/dependabot.yml`）が、コードと依存を見張る。知らせるだけで、それ自体でリリースを止めない。
- 編集アプリのサイトのリリースは、古いバージョンのコピーをビルドする前に、リリースノートに記した sha256 と突き合わせる（`tools/site-versions.mjs`、RELEASING.ja.md）。

**対策の外。** 開発用の依存は CI で監査していない。アクションはコミットのハッシュではなくバージョンのタグで固定しているので、タグが動かされると、Dependabot かレビューが気づくまで取り込まれうる。Dependabot が出す更新も、人が読む必要がある。

## 報告

[SECURITY.md](../SECURITY.md#reporting-a-vulnerability) を見てください。
