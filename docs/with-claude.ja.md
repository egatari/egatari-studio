<!-- i18n: pair=with-claude.md sha256=38e3bb99d9376e22 -->
# Claude Code・Cowork で Egatari ファイルを作る

[English](with-claude.md) | 日本語

作りたいものを、ふつうの言葉で Claude に依頼します。Claude が台本とスライド（ステップとパーツ付き）を書き、品質チェックまで行って、Egatari Studio で開けるフォルダを渡します。

## できること

同じマーケットプレイスに 2 つのプラグインがあります。

- 軽量な `egatari` は `egatari:make` だけを含み、Node は要りません。構成案を見せ、承認後に `deck.html`（スライド）と `narration.md`（台本）を書きます。
- `egatari-studio` は `egatari-studio:studio` だけを含みます。ローカルの品質チェック・ビルド・パーツ作成・既存の音声を使った動画のエクスポートに使います。コマンドは npm の包み egatari（`npx egatari@0.6.x …`）で動かすので、Node.js が要ります。

## スキルを追加する

### Claude Code

先に古い `~/.claude/skills/motion-*` を削除します。プロジェクトの `.claude/skills/` に追加していたものも削除します。studio を使う場合は egatari も一緒にインストールします：

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

インストールしたら、自動更新を有効にします：`/plugin` → Marketplaces → egatari → Enable auto-update。Marketplaces のタブで egatari を選んで Enter を押し、開いた画面で Enable auto-update を選びます（一覧や Installed のタブにはありません）。見つからないときは、リリースのたびに手で更新します：`claude plugin marketplace update egatari` のあと、`claude plugin update egatari@egatari` と `claude plugin update egatari-studio@egatari`。Claude Code が初めから自動で更新するのは Anthropic の公式のマーケットプレイスだけで、egatari のようなほかのマーケットプレイスは初めは自動更新が切れています。スキルの指示と品質チェックは Studio のバージョンごとに変わるので、古いスキルのままだと、新しい決まりや修正が使われません。スキルが古いとわかれば、スキル自身が 1 回だけ通知します（作業は止めません）。

スライドと台本を書くだけなら最初の 2 行で十分です。studio を使うときに `npm ci` は要りません。studio スキルが初めに `npx egatari@0.6.x doctor` で Node.js・ブラウザ・uv・ffmpeg を確認し、足りないもののインストール方法を案内します。更新は `/plugin update egatari@egatari` と `/plugin update egatari-studio@egatari`、または `npx egatari@0.6.x skills update`（Codex も更新します）を実行してツールを再起動します。Codex は README の「Codex で使う」を見てください。

### claude.ai・Cowork

Studio の **新規作成…** の **指示をコピー** の横、または **使い方（?）** の **AI のスキルをダウンロード** を押します。ダウンロードした `egatari-make-<version>-ja.zip` または `egatari-make-<version>-en.zip` をアップロードして make だけを追加します。Studio の表示言語と動いているバージョンに合う ZIP を、Studio 自身のサイトから渡します。単体のオフライン版のエディタにも両言語を含めています。開発者は `node tools/make-llm-guide.mjs --zip out/release --lang ja`（または `--lang en`）でも ZIP を作れます。中の `make/SKILL.md` と references は、`plugins/egatari/skills/make/` と同じ生成元から作ります。

コマンドは要りません。2 つのコードブロックを Studio に貼り付けます。Studio の AI への指示とスキルのバージョンが違えば、Studio の **AI のスキルをダウンロード** で追加し直します。claude.ai のスキルは自動では更新されないので、Studio を更新したら追加し直してください。スキルの指示と品質チェックは Studio のバージョンごとに変わります。

書き終えたら、egatari-studio が入っていれば studio スキルで品質チェックとビルドをします。それ以外は Chrome か Edge の <https://studio.egatari.org/> で作業フォルダを開きます。Mac の Safari は Egatari ファイル（.ega.html）で開く手順を使います。

## 最初の依頼

> 動きのある HTML スライドで、〇〇の授業を作って。対象は〇〇の学生、15 分、話す人は 1 人。

Claude の質問に答え、構成案を承認して、studio で品質チェックをします。

## Studio で開く

1. Chrome か Edge で <https://studio.egatari.org/> を開きます。
2. 「ファイル ▾」→「フォルダで作業する…」で、Claude が作成したフォルダを選びます。Egatari ファイル（編集可）なら「ファイル ▾」→「開く…」。Egatari ファイル（再生専用）は編集できません。
3. Claude がフォルダを編集しているあいだも Studio を開いたままにすると、プレビューが自動で更新されます。くわしくは[編集アプリ](editor.ja.md)。

## うまくいかないとき

[GitHub の issue](https://github.com/egatari/egatari-studio/issues) に書いてください。Claude Code では「感想を送って」と言うと、make と studio のスキルが同じ報告がないかを探してから issue の下書きを作り、確認してから送信します。報告は公開の issue になります。うまくいったこと（種類 Insight）の報告も歓迎します。AI への指示の改善に使います。
