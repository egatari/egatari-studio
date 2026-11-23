<!-- generated; do not edit by hand -->
# 使い終わりの感想を報告する

Egatari の不具合・わかりにくい点・提案・よかった点・うまくいったことを、公開の GitHub の Issue（egatari/egatari-studio）で報告する手順。make と studio のスキルは、この同じ文を使う。

## いつ行うか

- 利用者が「感想を送って」「フィードバックして」「不具合を報告して」「報告して」と言ったとき。
- 作業の終わりに、品質チェックが一度で通ったとき、または何度も直してやっと通ったときは、「うまくいったこと（効かなかったこと）を Egatari に報告しますか？」と 1 回だけたずねてよい。進むのは利用者が「はい」と答えたときだけ。1 回の会話で 1 回まで、断られたら繰り返さない。

**送ると決まるまで材料を集めない**：利用者が「送って」「報告して」と言うか、上の問いに「はい」と答えるまで、報告のためにスライド・台本・diff・品質チェックの出力を読みにいかない（作業そのもののために読むのはよい）。

## 種類

feedback.yml の Type の選択肢から 1 つ選ぶ。文字はそのまま使う。

<!-- feedback-types -->
- `Bug / 不具合`：動かない・壊れた
- `Confusing / わかりにくい`：手順や表示がわかりにくい
- `Idea / 提案`：あるとよい機能・書き方
- `Praise / よかった点`：よかったところ
- `Insight / うまくいったこと`：作っていて効いた書き方やパーツ、効かなかったもの
<!-- /feedback-types -->

## 手順

1. **同じ報告がないか探す**：要約の語（パーツの名前・表示に出た言葉など）で `gh issue list -R egatari/egatari-studio --search "<語>" --state all` を実行する。似たものがあれば、新しく作らずにそちらへコメントするよう勧める（`gh issue comment <番号> -R egatari/egatari-studio --body-file <下書き>`）。
2. **私的な内容を入れない**：スライドの本文・台本・論文の中身・音声・参照音声の名前・個人のパスやアドレス・ユーザー名。要るなら「数式の多いスライドで」のように一般化する。
3. **バージョンを入れる**（評価で同じ状況を作れるように）：
   - Studio のバージョン：`egatari --version` の出力。Studio のリポジトリで作業しているなら、package.json の `version` と `git rev-parse --short HEAD` の短い sha。Studio で作ったファイルしかなければ、その deck-meta の `generator` の `version`。
   - 指示のバージョン：このスキルの先頭の「指示のバージョン」の行の値。Studio でコピーした指示を使ったなら、その指示の先頭の「指示のバージョン」の値。
   - パーツライブラリのバージョン：Studio の components2.lock.json の `default`。わからなければ書かない。
4. feedback.yml の欄に合わせて下書きを書き、**全文を利用者に見せる**：
   ```
   題：[feedback] 一行の要約
   ### Type
   Bug / 不具合            ← 上の種類のどれか
   ### What you did
   ### What happened (and what you expected)
   ### What you were making       ← ここから 4 つは Insight のときだけ
   ### What worked
   ### What did not work
   ### Why you think so
   ### Version
   Studio 0.6.20 (1a2b3c4), instructions 027f5293, parts library 2.21.0
   ### Browser
   ### OS
   ### Context
   lang=ja, via Claude Code (egatari:make)
   ```
   Insight では、何を作っていたか（「15 分の統計の講義、数式の多いスライド」のように一般化）・効いた書き方やパーツ・効かなかったもの・なぜそう思うかを書き、What you did と What happened は空でよい。
5. 送る前に 1 回だけ「報告は公開の Issue になり、Egatari の改善に使われます」と伝える。送るのは、利用者が「送って」と明示したときだけ（修正を依頼されたら直して見せ直す）。本文は長い引数にせず、ファイルで渡す：
   ```bash
   gh issue create -R egatari/egatari-studio --title "[feedback] 一行の要約" --label feedback --body-file <下書き>
   ```
6. 作った Issue の URL を伝える。

## gh が使えないとき

gh がない・ログインしていない・コマンドを実行できない（対話型 AI など）ときは、欄を入れた URL を作って渡す。利用者がその URL を開いて送信する。送る前の一言（公開の Issue になる）は同じく伝える。

```text
https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml&title=…&type=…&did=…&happened=…&version=…&os=…&context=…
```

- 引数の名前は feedback.yml の欄の id（`type`・`did`・`happened`・`made`・`worked`・`didnt`・`why`・`version`・`browser`・`os`・`context`）。Issue のフォームは `body` を読まないので、欄ごとに入れる。空の欄は付けない。
- 値は URL エンコードする（空白は `%20`、改行は `%0A`）。`type` は上の種類の文字そのまま。
- URL が 6,000 字を超えるときは、下書きの全文と空のフォームの URL <https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml> を渡し、欄へ貼り付けるよう依頼する。
- 同じ報告は <https://github.com/egatari/egatari-studio/issues?q=語> で探せる、と添える。
