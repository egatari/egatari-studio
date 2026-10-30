<!-- i18n: pair=with-claude.md sha256=b48afe69f6928d9d -->
# Claude Code や Cowork で Egatari の教材を作る

[English](with-claude.md) | 日本語

作りたい授業を、ふつうの言葉で Claude に頼みます。Claude が台本とスライド（ステップとパーツ付き）を書き、品質チェックまで行って、Egatari Studio で開けるフォルダを渡します。

## できること

`skills/` の 3 つのスキルが働きます。

- `egatari:make`：授業の構成案をまず見せ、承認したあとで、作業フォルダ（スライドの `deck.html` と台本の `narration.md`）を作り、品質チェックをします。Egatari ファイル（編集可）にもできます。
- `egatari:video`：音声の入った作業フォルダか Egatari ファイル（.ega.html）から動画を書き出します（CLI 専用）。
- `egatari:parts`：合うパーツがないとき、新しい動くパーツを書きます（CLI 専用）。

## スキルを入れる

### Claude Code

先に古い `~/.claude/skills/motion-*` を削除します。プロジェクトの `.claude/skills/` に入れていたものも削除します。Claude Code で次を実行します。

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
```

kit・vendor・テーマと 3 つのスキルがまとめて入ります。初回の `npm ci` はスキルが案内します。更新は `/plugin update egatari@egatari` です。

### チャットの Claude・Cowork

make だけをスキルとして入れます（`skills/make/` を references ごと ZIP にしてアップロード）。コマンドは要りません。2 つの囲みを Studio に貼り付けます。parts と video は CLI 専用です。Studio の指示書とスキルの版が違えば、新しい版の make を入れ直します。Studio から版付き ZIP をダウンロードする機能は、この版にはまだありません。

## 最初に送る依頼

> 動きのある HTML スライドで、〇〇の授業を作って。対象は〇〇の学生、15 分、話す人は 1 人。

Claude の質問に答え、構成案を承認して、品質チェックが終わるのを待ちます。

## Studio で開く

1. Chrome か Edge で <https://studio.egatari.org/> を開きます。
2. 「ファイル ▾」→「フォルダで作業する…」で、Claude が作ったフォルダを選びます。Egatari ファイル（編集可）なら「ファイル ▾」→「開く…」。Egatari ファイル（再生専用）は編集できません。
3. Claude がフォルダを直しているあいだも Studio を開いたままにすると、プレビューが自動で更新されます。くわしくは[編集アプリ](editor.ja.md)。

## うまくいかないとき

[GitHub の issue](https://github.com/egatari/egatari-studio/issues) に書いてください。Claude Code では「感想を送って」と言うと、スキルが issue の下書きを作り、確認してから送ります。
