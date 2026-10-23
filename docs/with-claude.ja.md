<!-- i18n: pair=with-claude.md sha256=6dead29a48dba804 -->
# Claude Code や Cowork で Egatari の教材を作る

[English](with-claude.md) | 日本語

作りたい授業を、ふつうの言葉で Claude に頼みます。Claude が台本とスライド（ステップとパーツ付き）を書き、品質チェックまで行って、Egatari Studio で開けるフォルダを渡します。

## できること

`skills/` の 3 つのスキルが働きます。

- `motion-slides`：授業の構成案をまず見せ、承認したあとで、作業フォルダ（スライドの `deck.html` と台本の `narration.md`）を作り、品質チェックをします。Egatari ファイル（編集可）にもできます。
- `motion-slides-video`：作業フォルダを、読み上げ付きの動画と、音声入りの Egatari ファイルにします。
- `motion-components`：合うパーツがないとき、新しい動くパーツを書きます。

## スキルを入れる

### Claude Code

このリポジトリを clone し、`~/.claude/skills/`（またはプロジェクトの `.claude/skills/`）にリンクします。スキルは本物のパスからリポジトリを探すので、clone は動かさないでください。

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/motion-slides"       ~/.claude/skills/
ln -s "$PWD/skills/motion-slides-video" ~/.claude/skills/
ln -s "$PWD/skills/motion-components"   ~/.claude/skills/
```

Windows では、[README](../README.ja.md#claude-code-で使う) のディレクトリジャンクンクションを使います。

### Cowork（Claude のデスクトップアプリ）

Cowork は、ディスク上の `~/.claude/skills/` を読みません。Claude のアカウントで有効にしたスキルを使います（「Customize」の「Skills」から、スキルのフォルダを zip にしてアップロード）。
<!-- verify -->
これらのスキルでは試していません。スキルは clone の Node コマンドを使うので、zip だけでは動かないかもしれません。うまくいかないときは、Claude Code か、チャットの AI（[チャットの AI で作る](authoring-with-llms.ja.md)）で作ってください。
<!-- verify -->

## 最初に送る依頼

> 動きのある HTML スライドで、〇〇の授業を作って。対象は〇〇の学生、15 分、話す人は 1 人。

Claude の質問に答え、構成案を承認して、品質チェックが終わるのを待ちます。

## Studio で開く

1. Chrome か Edge で <https://studio.egatari.org/> を開きます。
2. 「開く ▾」→「作業フォルダを開く…」で、Claude が作ったフォルダを選びます。Egatari ファイル（編集可）なら「開く ▾」→「1 ファイルを開く…」。Egatari ファイル（再生のみ）は編集できません。
3. Claude がフォルダを直しているあいだも Studio を開いたままにすると、プレビューが自動で更新されます。くわしくは[編集アプリ](editor.ja.md)。

## うまくいかないとき

[GitHub の issue](https://github.com/egatari/egatari-studio/issues) に書いてください。Claude Code では「感想を送って」と言うと、スキルが issue の下書きを作り、確認してから送ります。
