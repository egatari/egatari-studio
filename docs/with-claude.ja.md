<!-- i18n: pair=with-claude.md sha256=6e89cebd34467160 -->
# Claude Code や Cowork で Egatari の教材を作る

[English](with-claude.md) | 日本語

作りたい授業を、ふつうの言葉で Claude に頼みます。Claude が台本とスライド（ステップとパーツ付き）を書き、品質チェックまで行って、Egatari Studio で開けるフォルダを渡します。

## できること

同じマーケットプレイスに 2 つのプラグインがあります。

- 軽量な `egatari` は `egatari:make` だけを含み、Node は要りません。構成案を見せ、承認後に `deck.html`（スライド）と `narration.md`（台本）を書きます。
- `egatari-studio` は `egatari-studio:studio` だけを含み、kit・vendor・テーマを同梱します。ローカルの品質チェック・組み立て・パーツ作成・既存の音声を使った動画の書き出しに使います。

## スキルを入れる

### Claude Code

先に古い `~/.claude/skills/motion-*` を削除します。プロジェクトの `.claude/skills/` に入れていたものも削除します。studio を使う場合は egatari も一緒に入れます：

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

教材を書くだけなら最初の 2 行で十分です。studio スキルが初回の `npm ci` を案内します。更新は `/plugin update egatari@egatari` と `/plugin update egatari-studio@egatari` です。

### チャットの Claude・Cowork

Studio の **新規作成…** の **指示をコピー** の横、または **使い方（?）** の **AI のスキルをダウンロード** を押します。ダウンロードした `egatari-make-<version>-ja.zip` または `egatari-make-<version>-en.zip` をアップロードして make だけを入れます。Studio の画面の言語と動いている版に合う ZIP を、Studio 自身のサイトから渡します。単体のオフライン版のエディタにも両言語を入れています。開発者は `node tools/make-llm-guide.mjs --zip out/release --lang ja`（または `--lang en`）でも ZIP を作れます。中の `make/SKILL.md` と references は、`plugins/egatari/skills/make/` と同じ生成元から作ります。

コマンドは要りません。2 つの囲みを Studio に貼り付けます。Studio の指示書とスキルの版が違えば、Studio の **AI のスキルをダウンロード** で入れ直します。

書き終えたら、egatari-studio が入っていれば studio スキルで品質チェックと組み立てをします。それ以外は Chrome か Edge の <https://studio.egatari.org/> で作業フォルダを開きます。Mac の Safari は Egatari ファイル（.ega.html）で開く手順を使います。

## 最初に送る依頼

> 動きのある HTML スライドで、〇〇の授業を作って。対象は〇〇の学生、15 分、話す人は 1 人。

Claude の質問に答え、構成案を承認して、studio で品質チェックをします。

## Studio で開く

1. Chrome か Edge で <https://studio.egatari.org/> を開きます。
2. 「ファイル ▾」→「フォルダで作業する…」で、Claude が作ったフォルダを選びます。Egatari ファイル（編集可）なら「ファイル ▾」→「開く…」。Egatari ファイル（再生専用）は編集できません。
3. Claude がフォルダを直しているあいだも Studio を開いたままにすると、プレビューが自動で更新されます。くわしくは[編集アプリ](editor.ja.md)。

## うまくいかないとき

[GitHub の issue](https://github.com/egatari/egatari-studio/issues) に書いてください。Claude Code では「感想を送って」と言うと、スキルが issue の下書きを作り、確認してから送ります。
